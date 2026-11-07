import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { commanders } from "@/game/battle/catalog";
import type { BattleConfig, BattleResult } from "@/game/battle/types";
import { difficultyById } from "@/game/progress/catalog";
import { activeAccessories, effectiveDeck, ownedCardIds } from "@/game/progress/profile";
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
      <GameShell full>
        <div className="mx-auto max-w-6xl px-5 py-6">
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
      <GameShell>
        <div className="mx-auto max-w-2xl space-y-5 text-center">
          <p className="label-mono text-primary">Resultado PvP</p>
          <h1 className="font-display text-6xl font-black uppercase">
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
      <GameShell>
        <div className="mx-auto max-w-3xl space-y-5">
          <PageTitle kicker={`PvP · ${modeDef.name}`} title="Apostas">
            {modeDef.summary}
          </PageTitle>
          <Panel title={`Escolha ${modeDef.stakeCards} carta(s) para arriscar`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                    <p className="font-display text-xs font-bold uppercase">{card.name}</p>
                    <p className="font-mono text-[9px] text-muted-foreground">{card.category}</p>
                  </button>
                );
              })}
            </div>
          </Panel>
          <div className="flex gap-3">
            <button
              disabled={stakes.length !== modeDef.stakeCards}
              onClick={startBattle}
              className={cn(
                "px-6 py-3 font-mono text-sm uppercase tracking-[0.2em]",
                stakes.length === modeDef.stakeCards
                  ? "bg-destructive text-destructive-foreground hover:brightness-110"
                  : "cursor-not-allowed border border-border text-muted-foreground",
              )}
            >
              Apostar e lutar
            </button>
            <button
              onClick={() => setView({ kind: "lobby" })}
              className="border border-border px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
            >
              Voltar
            </button>
          </div>
        </div>
      </GameShell>
    );
  }

  return (
    <GameShell>
      <PageTitle kicker="PvP" title="Multiplayer">
        Partidas rápidas contra comandantes. No modo aposta, as cartas que você conquistou na
        campanha entram em risco — vencer traz as do adversário, perder dói.
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Modo de partida">
          <div className="space-y-2">
            {pvpModes.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMode(m.id);
                  setStakes([]);
                }}
                className={cn(
                  "w-full border p-3 text-left transition",
                  m.id === mode
                    ? "border-primary bg-accent"
                    : "border-border hover:border-primary/50",
                )}
              >
                <p className="font-display text-sm font-bold uppercase">{m.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{m.summary}</p>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Adversário">
          <div className="space-y-2">
            {opponents.map((o) => (
              <button
                key={o.id}
                onClick={() => setOpponentId(o.id)}
                className={cn(
                  "w-full border p-3 text-left transition",
                  o.id === opponentId
                    ? "border-primary bg-accent"
                    : "border-border hover:border-primary/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-bold uppercase">
                    {o.flag} {o.name}
                  </p>
                  <span className="border border-ai px-1 font-mono text-[9px] uppercase text-ai">
                    {difficultyById(o.difficulty).name}
                  </span>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {o.commander.name} · {o.commander.doctrine}
                </p>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          onClick={() => (modeDef.stakeCards > 0 ? setView({ kind: "stakes" }) : startBattle())}
          className="bg-primary px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass hover:brightness-110"
        >
          {modeDef.stakeCards > 0 ? "Definir apostas" : "Iniciar partida"}
        </button>
        <p className="font-mono text-[11px] text-muted-foreground">
          Baralho ativo: {effectiveDeck(profile).length} cartas ·{" "}
          {Object.keys(profile.inventory.cards).length} possuídas
        </p>
      </div>
    </GameShell>
  );
}
