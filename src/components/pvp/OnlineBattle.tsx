// PvP ONLINE em tempo real: o jogador cria uma sala (código compartilhável) ou entra com
// o código do adversário. Os dois clientes rodam a MESMA simulação (lockstep determinístico)
// e trocam apenas comandos pelo Realtime do Supabase — sem servidor de jogo.
//
// Esta tela cuida só do FLUXO (criar/entrar → esperar → jogar). A batalha em si é a
// `BattleView` compartilhada, alimentada pelo `useLivePvp`.

import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameButton, GameShell, Panel } from "@/components/game/shell";
import { BattleView } from "@/components/battle/BattleScreen";
import { commanders, arenaByTerrain } from "@/game/battle/catalog";
import type { BattleConfig, BattleResult, TerrainKind } from "@/game/battle/types";
import { effectiveDeck } from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  buildLiveConfig,
  decodeRoom,
  encodeRoom,
  normalizeRoomCode,
  randomSeed,
  PVP_TERRAINS,
  type Seat,
} from "@/game/pvp/live";
import { useLivePvp } from "@/game/pvp/useLivePvp";
import type { TransportStatus } from "@/game/pvp/transport";

type View =
  | { kind: "menu" }
  | { kind: "playing"; code: string; seat: Seat; config: BattleConfig }
  | { kind: "result"; result: BattleResult; seat: Seat };

export function OnlineBattle({ onExit }: { onExit: () => void }) {
  const { profile, recordBattle } = useProfile();
  const [view, setView] = useState<View>({ kind: "menu" });

  if (view.kind === "playing") {
    return (
      <OnlineMatch
        code={view.code}
        seat={view.seat}
        config={view.config}
        onExit={() => setView({ kind: "menu" })}
        onEnd={(result) => {
          recordBattle({
            mode: "pvp",
            missionId: view.config.id,
            missionName: view.config.missionName,
            outcome: result.outcome,
            difficulty: "veterano",
            duration: result.duration,
            kills: result.kills[view.seat === "host" ? "blue" : "red"],
            losses: result.losses[view.seat === "host" ? "blue" : "red"],
            territorialScore: Math.round(
              result.territorialScore[view.seat === "host" ? "blue" : "red"],
            ),
          });
          setView({ kind: "result", result, seat: view.seat });
        }}
      />
    );
  }

  if (view.kind === "result") {
    return (
      <GameShell full>
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="label-mono text-primary">Resultado PvP · online</p>
          <h1 className="font-display text-5xl font-black uppercase leading-none">
            {view.result.outcome === "vitoria"
              ? "Vitória"
              : view.result.outcome === "empate"
                ? "Empate"
                : "Derrota"}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">{view.result.reason}</p>
          <GameButton onClick={() => setView({ kind: "menu" })}>Voltar</GameButton>
        </div>
      </GameShell>
    );
  }

  return (
    <OnlineMenu
      deck={effectiveDeck(profile)}
      onExit={onExit}
      onStart={(code, seat, config) => setView({ kind: "playing", code, seat, config })}
    />
  );
}

// ---------------------------------------------------------------------------
// Menu: criar sala ou entrar por código
// ---------------------------------------------------------------------------

function OnlineMenu({
  deck,
  onExit,
  onStart,
}: {
  deck: string[];
  onExit: () => void;
  onStart: (code: string, seat: Seat, config: BattleConfig) => void;
}) {
  const [terrain, setTerrain] = useState<TerrainKind>("Cidade");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = isSupabaseConfigured;

  // Cria a sala: este cliente é o HOST (comanda o azul) e gera o código + a semente.
  // A config é determinística a partir da semente, então o convidado a reconstrói igual
  // a partir do mesmo código/seed recebido pelo canal.
  const createRoom = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const seed = randomSeed();
      const code = encodeRoom(seed, terrain);
      const config = buildLiveConfig({
        seed,
        terrain,
        host: {
          deck,
          commanderId: commanders[0]!.id,
          doctrine: commanders[0]!.doctrine,
          name: "Você",
          flag: "🇧🇷",
        },
        guest: {
          deck,
          commanderId: commanders[1]!.id,
          doctrine: commanders[1]!.doctrine,
          name: "Adversário",
          flag: "🏳️",
        },
      });
      onStart(code, "host", config);
    } catch {
      setError("Não foi possível abrir a sala.");
    } finally {
      setBusy(false);
    }
  }, [deck, terrain, onStart]);

  const joinRoom = useCallback(async () => {
    const code = normalizeRoomCode(joinCode);
    if (code.length < 4) {
      setError("Informe o código da sala.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const found = decodeRoom(code);
      if (found === null) {
        setError("Código inválido. Confira com o adversário.");
        return;
      }
      const config = buildLiveConfig({
        seed: found.seed,
        terrain: found.terrain,
        host: {
          deck,
          commanderId: commanders[0]!.id,
          doctrine: commanders[0]!.doctrine,
          name: "Adversário",
          flag: "🏳️",
        },
        guest: {
          deck,
          commanderId: commanders[1]!.id,
          doctrine: commanders[1]!.doctrine,
          name: "Você",
          flag: "🇧🇷",
        },
      });
      onStart(code, "guest", config);
    } catch {
      setError("Não foi possível entrar na sala.");
    } finally {
      setBusy(false);
    }
  }, [deck, joinCode, onStart]);

  return (
    <GameShell full>
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 px-4 py-4">
        <div>
          <p className="label-mono text-primary">PvP · tempo real</p>
          <h1 className="font-display text-3xl font-black uppercase leading-none">Sala online</h1>
        </div>

        {!online && (
          <Panel title="Sem servidor">
            <p className="text-sm text-muted-foreground">
              O PvP em tempo real usa o Realtime do Supabase. Sem a chave pública configurada
              (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`), a sala não conecta — use o
              PvP assíncrono contra a IA no menu Multiplayer.
            </p>
          </Panel>
        )}

        <Panel title="Terreno">
          <div className="flex flex-wrap gap-1.5">
            {PVP_TERRAINS.map((t) => (
              <button
                key={t}
                onClick={() => setTerrain(t)}
                className={cn(
                  "border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                  t === terrain
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-muted-foreground hover:border-primary/60",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">
            Cartas em campo: {arenaByTerrain(terrain).name} · baralho de {Math.min(deck.length, 8)}{" "}
            cartas
          </p>
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2">
          <Panel title="Criar sala">
            <p className="text-xs text-muted-foreground">
              Você comanda o azul. Um código de 5 caracteres será gerado para o adversário entrar.
            </p>
            <button
              disabled={busy || !online}
              onClick={createRoom}
              className="mt-3 w-full bg-primary px-4 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Abrindo…" : "Criar e aguardar"}
            </button>
          </Panel>

          <Panel title="Entrar com código">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="EX.: 7K2M"
              maxLength={6}
              className="w-full border border-border bg-background px-3 py-2 font-mono text-lg uppercase tracking-[0.3em] outline-none focus:border-primary"
            />
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Você comanda o vermelho.
            </p>
            <button
              disabled={busy || !online}
              onClick={joinRoom}
              className="mt-3 w-full border border-primary px-4 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-primary hover:bg-accent disabled:opacity-50"
            >
              {busy ? "Entrando…" : "Entrar na sala"}
            </button>
          </Panel>
        </div>

        {error && <p className="font-mono text-xs text-destructive">{error}</p>}

        <div className="mt-auto border-t border-border pt-3">
          <GameButton variant="ghost" onClick={onExit}>
            Voltar ao lobby
          </GameButton>
        </div>
      </div>
    </GameShell>
  );
}

// ---------------------------------------------------------------------------
// Partida online: espera o adversário e joga pela BattleView compartilhada
// ---------------------------------------------------------------------------

function OnlineMatch({
  code,
  seat,
  config,
  onEnd,
  onExit,
}: {
  code: string;
  seat: Seat;
  config: BattleConfig;
  onEnd: (result: BattleResult) => void;
  onExit: () => void;
}) {
  const live = useLivePvp({ config, code, seat, onEnd });
  const source = useMemo(() => ({ useBattle: live.useBattle }), [live.useBattle]);

  if (!live.peerSeen) {
    return <WaitingRoom code={code} status={live.status} onExit={onExit} />;
  }

  return (
    <GameShell full bare>
      <div className="flex h-full w-full flex-col">
        <BattleView
          config={config}
          source={source}
          localSide={live.localSide}
          onComplete={() => {}}
          onReplay={onExit}
          onExit={onExit}
        />
      </div>
    </GameShell>
  );
}

function WaitingRoom({
  code,
  status,
  onExit,
}: {
  code: string;
  status: TransportStatus;
  onExit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const label =
    status === "open"
      ? "Aguardando o adversário entrar…"
      : status === "connecting"
        ? "Conectando ao servidor…"
        : status === "error"
          ? "Falha na conexão."
          : "Conexão encerrada.";
  return (
    <GameShell full>
      <div className="mx-auto flex h-full w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="label-mono text-primary">PvP · tempo real</p>
        <h1 className="font-display text-2xl font-black uppercase leading-none">Sala aberta</h1>
        <p className="font-mono text-xs text-muted-foreground">{label}</p>
        <div className="border border-primary bg-card px-6 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Código da sala
          </p>
          <p className="font-display text-5xl font-black tracking-[0.3em] text-primary">{code}</p>
        </div>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
          }}
          className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          {copied ? "Copiado!" : "Copiar código"}
        </button>
        <GameButton variant="ghost" onClick={onExit}>
          Cancelar
        </GameButton>
      </div>
    </GameShell>
  );
}
