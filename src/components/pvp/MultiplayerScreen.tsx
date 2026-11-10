import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell, Panel } from "@/components/game/shell";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { commanders } from "@/game/battle/catalog";
import type { BattleConfig, BattleResult } from "@/game/battle/types";
import { difficultyById } from "@/game/progress/catalog";
import {
  activeAccessories,
  cardLevelsForDeck,
  effectiveDeck,
  ownedCardIds,
} from "@/game/progress/profile";
import {
  buildPvpConfig,
  localOpponents,
  pickOpponentStakes,
  pvpModeById,
  pvpModes,
  resolveStakes,
  type PvpMode,
  type StakeResult,
} from "@/game/progress/pvp";
import { useProfile } from "@/game/progress/store";
import { cardById } from "@/game/battle/catalog";

type View =
  | { kind: "lobby" }
  | { kind: "stakes" }
  | { kind: "battle"; config: BattleConfig }
  | { kind: "result"; result: BattleResult; stake: StakeResult; opponent: string };

export function MultiplayerScreen() {
  const { profile, recordBattle, removeCards } = useProfile();
  const opponents = useMemo(() => localOpponents(profile), [profile]);
  const [view, setView] = useState<View>({ kind: "lobby" });
  const [mode, setMode] = useState<PvpMode>("equilibrado");
  const [opponentId, setOpponentId] = useState(opponents[0]!.id);
  const [stakes, setStakes] = useState<string[]>([]);

  const opponent = opponents.find((o) => o.id === opponentId) ?? opponents[0]!;
  const modeDef = pvpModeById(mode);
  const owned = ownedCardIds(profile);

  const startBattle = () => {
    const deck = effectiveDeck(profile);
    const accs = activeAccessories(profile);
    const opponentStakes = pickOpponentStakes(profile, modeDef.stakeCards);
    const config = buildPvpConfig({
      profile,
      deck,
      accessories: accs,
      commander: commanders[0]!,
      doctrine: "Operações combinadas",
      opponentName: opponent.name,
      opponentFlag: opponent.flag,
      opponentCommander: opponent.commander,
      opponentDoctrine: opponent.commander.doctrine,
      opponentDeck: opponent.deck,
      difficulty: opponent.difficulty,
      terrain: modeDef.terrain,
      seed: (Date.now() ^ (mode.length * 7919)) >>> 0,
      cardLevels: cardLevelsForDeck(profile),
      opponentCardLevels: Object.fromEntries(opponent.deck.map((id) => [id, 1])),
    });
    (config as BattleConfig & { __oppStakes?: string[] }).__oppStakes = opponentStakes;
    setView({ kind: "battle", config });
  };

  const handleComplete = (config: BattleConfig, result: BattleResult) => {
    const opponentStakes = pickOpponentStakes(profile, modeDef.stakeCards);
    const stake = resolveStakes(result.outcome, mode, stakes, opponentStakes);
    if (stake.lostCards.length) removeCards(stake.lostCards);
    recordBattle({
      mode: "pvp",
      missionId: config.id,
      missionName: config.missionName,
      outcome: result.outcome,
      difficulty: opponent.difficulty,
      duration: result.duration,
      kills: result.kills.blue,
      losses: result.losses.blue,
      territorialScore: Math.round(result.territorialScore.blue),
    });
    setView({ kind: "result", result, stake, opponent: opponent.name });
  };

  if (view.kind === "battle") {
    return (
      <GameShell full bare>
        <div className="flex h-full w-full flex-col">
          <BattleScreen
            presetConfig={view.config}
            modeLabel={`PvP · ${pvpModeById(mode).name}`}
            onExit={() => setView({ kind: "lobby" })}
            onComplete={(result) => handleComplete(view.config, result)}
          />
        </div>
      </GameShell>
    );
  }

  if (view.kind === "result") {
    return (
      <GameShell full>
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-3 overflow-y-auto px-4 text-center">
          <p className="label-mono text-primary">Resultado PvP</p>
          <h1 className="font-display text-5xl font-black uppercase leading-none">
            {view.result.outcome === "vitoria"
              ? "Vitória"
              : view.result.outcome === "empate"
                ? "Empate"
                : "Derrota"}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            contra {view.opponent} · {view.result.reason}
          </p>

          <Panel title="Apostas">
            {view.stake.lostCards.length > 0 ? (
              <div>
                <p className="font-mono text-xs text-destructive">
                  Você perdeu {view.stake.lostCards.length} carta(s):
                </p>
                <ul className="mt-2 space-y-1 text-left font-mono text-xs">
                  {view.stake.lostCards.map((c) => (
                    <li key={c} className="text-destructive">
                      − {cardById(c).name}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Recupere essas cartas jogando a campanha ou vencendo a próxima aposta.
                </p>
              </div>
            ) : view.stake.gainedCards.length > 0 ? (
              <div>
                <p className="font-mono text-xs text-fact">
                  Você tomou {view.stake.gainedCards.length} carta(s) do adversário:
                </p>
                <ul className="mt-2 space-y-1 text-left font-mono text-xs">
                  {view.stake.gainedCards.map((c) => (
                    <li key={c} className="text-fact">
                      + {cardById(c).name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sem transferência de cartas nesta partida.
              </p>
            )}
          </Panel>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => setView({ kind: "lobby" })}
              className="bg-primary px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground hover:brightness-110"
            >
              Voltar ao lobby
            </button>
          </div>
        </div>
      </GameShell>
    );
  }

  if (view.kind === "stakes") {
    return (
      <GameShell full>
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-4 py-3">
          <div className="border-b border-border pb-2.5">
            <p className="label-mono text-primary">PvP · {modeDef.name} · Risco de cartas</p>
            <h1 className="font-display text-2xl font-black uppercase leading-none">
              Apostas · {stakes.length}/{modeDef.stakeCards}
            </h1>
          </div>

          <p className="mt-2 text-[12px] text-muted-foreground">{modeDef.summary}</p>

          <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 content-start gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {owned.map((id) => {
                const card = cardById(id);
                const on = stakes.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() =>
                      setStakes((s) =>
                        s.includes(id)
                          ? s.filter((x) => x !== id)
                          : s.length >= modeDef.stakeCards
                            ? s
                            : [...s, id],
                      )
                    }
                    className={cn(
                      "border p-2 text-left transition",
                      on
                        ? "border-destructive bg-destructive/10"
                        : "border-border hover:border-destructive/50",
                    )}
                  >
                    <p className="font-display text-xs font-bold uppercase leading-tight">
                      {card.name}
                    </p>
                    <p className="font-mono text-[9px] text-muted-foreground">{card.category}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-3 border-t border-border pt-2.5">
            <button
              disabled={stakes.length !== modeDef.stakeCards}
              onClick={startBattle}
              className={cn(
                "px-6 py-2.5 font-mono text-sm uppercase tracking-[0.2em]",
                stakes.length === modeDef.stakeCards
                  ? "bg-destructive text-destructive-foreground hover:brightness-110"
                  : "cursor-not-allowed border border-border text-muted-foreground",
              )}
            >
              Apostar e lutar
            </button>
            <button
              onClick={() => setView({ kind: "lobby" })}
              className="border border-border px-6 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
            >
              Voltar
            </button>
          </div>
        </div>
      </GameShell>
    );
  }

  return (
    <GameShell full>
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-4 py-3 [@media(max-height:560px)]:py-2">
        {/* Cabeçalho compacto — recursos numa linha, sem rolagem */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-2.5 [@media(max-height:560px)]:pb-1.5">
          <div>
            <p className="label-mono text-primary">PvP · Teatro de operações</p>
            <h1 className="font-display text-2xl font-black uppercase leading-none">Multiplayer</h1>
          </div>
          <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
            <span>
              BARALHO <b className="text-foreground">{effectiveDeck(profile).length}</b>/8
            </span>
            <span>
              CARTAS <b className="text-foreground">{owned.length}</b>
            </span>
            <span>
              MODO <b className="text-foreground">{modeDef.name}</b>
            </span>
          </div>
        </div>

        {/* Seletor de modo */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 [@media(max-height:560px)]:mt-1.5">
          {pvpModes.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMode(m.id);
                setStakes([]);
              }}
              className={cn(
                "border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                m.id === mode
                  ? "border-primary bg-accent text-primary"
                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
              )}
            >
              {m.name}
              {m.stakeCards > 0 && (
                <span className="ml-1.5 text-destructive">aposta {m.stakeCards}</span>
              )}
            </button>
          ))}
        </div>

        {/* Adversários — cartões compactos; clicar abre o dossiê sem rolar a página */}
        <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto pr-1 [@media(max-height:560px)]:mt-1.5">
          <div className="grid h-full grid-cols-2 content-start gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {opponents.map((o) => (
              <button
                key={o.id}
                onClick={() => setOpponentId(o.id)}
                className={cn(
                  "hud-panel hud-corners flex flex-col justify-between p-3 text-left transition [@media(max-height:560px)]:p-2",
                  o.id === opponentId ? "border-primary/70" : "hover:border-primary/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl">{o.flag}</span>
                  <span
                    className={cn(
                      "border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                      o.id === opponentId
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {difficultyById(o.difficulty).name}
                  </span>
                </div>
                <div className="mt-1 min-h-0">
                  <h3 className="line-clamp-2 font-display text-sm font-bold uppercase leading-tight">
                    {o.name}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 font-mono text-[9px] text-muted-foreground">
                    {o.commander.name} · {o.commander.doctrine}
                  </p>
                </div>
                <p className="mt-1 font-mono text-[9px] text-ai">
                  {o.deck.length} cartas · {o.commander.personality}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Ação principal fixa no rodapé da tela */}
        <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-border pt-2.5 [@media(max-height:560px)]:mt-1.5 [@media(max-height:560px)]:pt-1.5">
          <button
            onClick={() => (modeDef.stakeCards > 0 ? setView({ kind: "stakes" }) : startBattle())}
            className="bg-primary px-6 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass hover:brightness-110"
          >
            {modeDef.stakeCards > 0 ? "Definir apostas" : "Iniciar partida"}
          </button>
          <p className="font-mono text-[11px] text-muted-foreground">
            {opponent.flag} {opponent.name} · {modeDef.summary}
          </p>
        </div>
      </div>
    </GameShell>
  );
}
