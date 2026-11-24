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
import type { TransportMode } from "@/game/pvp/transportFactory";
import {
  inviteLink,
  listRooms,
  markGuestJoined,
  removeRoom,
  roomAge,
  saveRoom,
  type RoomRecord,
} from "@/game/pvp/rooms";

type View =
  | { kind: "menu" }
  | {
      kind: "playing";
      code: string;
      seat: Seat;
      config: BattleConfig;
      transportMode: TransportMode;
    }
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
        transportMode={view.transportMode}
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
      onStart={(code, seat, config, transportMode) =>
        setView({ kind: "playing", code, seat, config, transportMode })
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Menu: criar sala, entrar por código e a LISTA de salas criadas
// ---------------------------------------------------------------------------

function OnlineMenu({
  deck,
  onExit,
  onStart,
}: {
  deck: string[];
  onExit: () => void;
  onStart: (code: string, seat: Seat, config: BattleConfig, mode: TransportMode) => void;
}) {
  const [terrain, setTerrain] = useState<TerrainKind>("Cidade");
  const [joinCode, setJoinCode] = useState(() => readInviteCode());
  const [mode, setMode] = useState<TransportMode>(isSupabaseConfigured ? "online" : "local");
  const [rooms, setRooms] = useState<RoomRecord[]>(() => listRooms());
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const localOnly = !isSupabaseConfigured;

  const copy = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("O navegador bloqueou a cópia. Selecione o código e copie à mão.");
    }
  }, []);

  // Cria a sala: este cliente é o HOST (comanda o azul). A config sai da semente, então
  // o convidado reconstrói exatamente a mesma partida a partir do código.
  const createRoom = useCallback(() => {
    setError(null);
    const seed = randomSeed();
    const code = encodeRoom(seed, terrain);
    setRooms(saveRoom({ code, terrain, createdAt: Date.now(), guestJoined: false, seed }));
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
    onStart(code, "host", config, mode);
  }, [deck, mode, onStart, terrain]);

  const joinRoom = useCallback(
    (rawCode?: string) => {
      const code = normalizeRoomCode(rawCode ?? joinCode);
      if (code.length < 4) {
        setError("Informe o código da sala (4 caracteres).");
        return;
      }
      setError(null);
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
      setRooms(markGuestJoined(code));
      onStart(code, "guest", config, mode);
    },
    [deck, joinCode, mode, onStart],
  );

  return (
    <GameShell full>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3 overflow-y-auto px-4 py-4">
        <div>
          <p className="label-mono text-primary">PvP · tempo real</p>
          <h1 className="font-display text-3xl font-black uppercase leading-none">Sala online</h1>
          <p className="mt-1 max-w-2xl font-mono text-[11px] text-muted-foreground">
            Os dois lados rodam a mesma batalha e trocam só comandos. Abra a sala, mande o código
            (ou o convite) e jogue.
          </p>
        </div>

        {/* Onde a sala roda. Sem servidor configurado, a opção online some em vez de
            aparecer desligada e sem explicação. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Conexão
          </span>
          <button
            onClick={() => setMode("local")}
            className={cn(
              "border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition",
              mode === "local"
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:border-primary/60",
            )}
          >
            Nesta máquina · 2 abas
          </button>
          {!localOnly && (
            <button
              onClick={() => setMode("online")}
              className={cn(
                "border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                mode === "online"
                  ? "border-primary bg-accent text-primary"
                  : "border-border text-muted-foreground hover:border-primary/60",
              )}
            >
              Online · servidor
            </button>
          )}
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          {mode === "local"
            ? "A sala vale entre abas do mesmo navegador — sem servidor, sem conta."
            : "A sala usa o Realtime do Supabase: cada jogador no seu computador."}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Panel title="Criar sala">
            <div className="flex flex-wrap gap-1.5">
              {PVP_TERRAINS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTerrain(t)}
                  className={cn(
                    "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition",
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
              {arenaByTerrain(terrain).name} · baralho de {Math.min(deck.length, 8)} cartas
            </p>
            <button
              onClick={createRoom}
              className="mt-3 w-full bg-primary px-4 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass hover:brightness-110"
            >
              Criar sala
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
              onClick={() => joinRoom()}
              className="mt-3 w-full border border-primary px-4 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-primary hover:bg-accent"
            >
              Entrar na sala
            </button>
          </Panel>
        </div>

        {error && <p className="font-mono text-xs text-destructive">{error}</p>}

        <Panel title={`Salas criadas · ${rooms.length}`}>
          {rooms.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma sala aberta neste navegador. Crie uma acima: ela fica listada aqui com o
              código para convidar.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rooms.map((room) => (
                <li key={room.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                  <span className="font-display text-xl font-black tracking-[0.25em] text-primary">
                    {room.code}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {room.terrain} · {roomAge(room.createdAt)} ·{" "}
                    {room.guestJoined ? "2 jogadores" : "aguardando convidado"}
                  </span>
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    <button
                      onClick={() => void copy(`code-${room.code}`, room.code)}
                      className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      {copied === `code-${room.code}` ? "Copiado!" : "Copiar código"}
                    </button>
                    <button
                      onClick={() => void copy(`link-${room.code}`, inviteLink(room.code))}
                      className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      {copied === `link-${room.code}` ? "Copiado!" : "Copiar convite"}
                    </button>
                    <button
                      onClick={() => {
                        setJoinCode(room.code);
                        joinRoom(room.code);
                      }}
                      className="border border-primary px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-accent"
                    >
                      Entrar
                    </button>
                    <button
                      onClick={() => setRooms(removeRoom(room.code))}
                      className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:border-destructive hover:text-destructive"
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="mt-auto border-t border-border pt-3">
          <GameButton variant="ghost" onClick={onExit}>
            Voltar ao lobby
          </GameButton>
        </div>
      </div>
    </GameShell>
  );
}

/** Código vindo de um convite (`?sala=XXXX`) já preenche o campo de entrada. */
function readInviteCode(): string {
  if (typeof window === "undefined") return "";
  const code = new URLSearchParams(window.location.search).get("sala");
  return code ? normalizeRoomCode(code) : "";
}

// ---------------------------------------------------------------------------
// Partida online: espera o adversário e joga pela BattleView compartilhada
// ---------------------------------------------------------------------------

function OnlineMatch({
  code,
  seat,
  config,
  transportMode,
  onEnd,
  onExit,
}: {
  code: string;
  seat: Seat;
  config: BattleConfig;
  transportMode: TransportMode;
  onEnd: (result: BattleResult) => void;
  onExit: () => void;
}) {
  const live = useLivePvp({ config, code, seat, transportMode, onEnd });
  const source = useMemo(() => ({ useBattle: live.useBattle }), [live.useBattle]);

  if (!live.peerSeen) {
    return (
      <WaitingRoom
        code={code}
        status={live.status}
        seat={seat}
        transportMode={transportMode}
        onExit={onExit}
      />
    );
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
  seat,
  transportMode,
  onExit,
}: {
  code: string;
  status: TransportStatus;
  seat: Seat;
  transportMode: TransportMode;
  onExit: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const link = inviteLink(code);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  const statusText =
    status === "open"
      ? "Sala aberta. Mande o convite e a partida começa quando o outro lado entrar."
      : status === "connecting"
        ? "Abrindo a sala…"
        : status === "error"
          ? "Não foi possível abrir a sala. Volte e crie outra."
          : "Sala encerrada.";

  return (
    <GameShell full>
      <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center gap-3 px-4 text-center">
        <p className="label-mono text-primary">
          PvP · tempo real · {transportMode === "local" ? "nesta máquina" : "servidor"}
        </p>
        <h1 className="font-display text-2xl font-black uppercase leading-none">Sala {code}</h1>

        <div className="hud-panel hud-corners p-4 text-left">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Código da sala
            </span>
            <span className="font-display text-4xl font-black tracking-[0.3em] text-primary">
              {code}
            </span>
          </div>
          <div className="mt-3 grid gap-1 font-mono text-[11px]">
            <p className="flex justify-between">
              <span className="text-muted-foreground">
                {seat === "host" ? "Você · azul" : "Você · vermelho"}
              </span>
              <span className="text-fact">em campo</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">
                {seat === "host" ? "Convidado · vermelho" : "Host · azul"}
              </span>
              <span className="text-ai">aguardando entrar</span>
            </p>
          </div>
          <p className="mt-3 border-t border-border pt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {statusText}
            {transportMode === "local" &&
              " Como esta sala é local, abra o convite em outra aba do mesmo navegador."}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => void copy("code", code)}
            className="border border-primary px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-primary hover:bg-accent"
          >
            {copied === "code" ? "Copiado!" : "Copiar código"}
          </button>
          <button
            onClick={() => void copy("link", link)}
            className="border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            {copied === "link" ? "Copiado!" : "Copiar convite"}
          </button>
          {transportMode === "local" && (
            <button
              onClick={() => window.open(link, "_blank", "noopener")}
              className="border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
            >
              Abrir 2ª aba
            </button>
          )}
          <GameButton variant="ghost" onClick={onExit}>
            Cancelar
          </GameButton>
        </div>
      </div>
    </GameShell>
  );
}
