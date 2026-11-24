// PvP ONLINE em tempo real: o jogador monta a escalação (cartas + chanceler), cria uma
// sala (código compartilhável) ou entra com o código do adversário. Os dois clientes rodam
// a MESMA simulação (lockstep determinístico) e trocam apenas comandos e escalações.
//
// Esta tela cuida só do FLUXO (escalar → criar/entrar → esperar → jogar). A batalha em si
// é a `BattleView` compartilhada, alimentada pelo `useLivePvp`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { GameButton, GameShell, Panel } from "@/components/game/shell";
import { BattleView } from "@/components/battle/BattleScreen";
import { arenaByTerrain, cardById, commanders } from "@/game/battle/catalog";
import type { BattleResult, TerrainKind } from "@/game/battle/types";
import {
  chancellorLoadoutFor,
  effectiveDeck,
  ownedCardIds,
  type ProfileState,
} from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  decodeRoom,
  encodeRoom,
  normalizeRoomCode,
  outcomeForSeat,
  randomSeed,
  PVP_TERRAINS,
  type LiveRoster,
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
      seed: number;
      terrain: TerrainKind;
      roster: LiveRoster;
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
        seed={view.seed}
        terrain={view.terrain}
        roster={view.roster}
        transportMode={view.transportMode}
        onExit={() => setView({ kind: "menu" })}
        onEnd={(result) => {
          recordBattle({
            mode: "pvp",
            missionId: `pvp-live-${view.seed}`,
            missionName: `PvP online · sala ${view.code}`,
            outcome: outcomeForSeat(result.outcome, view.seat),
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
    const seatOutcome = outcomeForSeat(view.result.outcome, view.seat);
    return (
      <GameShell full>
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="label-mono text-primary">Resultado PvP · online</p>
          <h1 className="font-display text-5xl font-black uppercase leading-none">
            {seatOutcome === "vitoria"
              ? "Vitória"
              : seatOutcome === "empate"
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
      profile={profile}
      onExit={onExit}
      onStart={(code, seat, seed, terrain, roster, transportMode) =>
        setView({ kind: "playing", code, seat, seed, terrain, roster, transportMode })
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Menu: escalação (cartas + chanceler no mesmo painel), criar sala, entrar, lista
// ---------------------------------------------------------------------------

function OnlineMenu({
  profile,
  onExit,
  onStart,
}: {
  profile: ProfileState;
  onExit: () => void;
  onStart: (
    code: string,
    seat: Seat,
    seed: number,
    terrain: TerrainKind,
    roster: LiveRoster,
    mode: TransportMode,
  ) => void;
}) {
  const owned = useMemo(() => ownedCardIds(profile), [profile]);
  const [deck, setDeck] = useState<string[]>(() => effectiveDeck(profile).slice(0, 8));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [terrain, setTerrain] = useState<TerrainKind>("Cidade");
  const [joinCode, setJoinCode] = useState(() => readInviteCode());
  const [mode, setMode] = useState<TransportMode>(isSupabaseConfigured ? "online" : "local");
  const [rooms, setRooms] = useState<RoomRecord[]>(() => listRooms());
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const localOnly = !isSupabaseConfigured;

  const chancellor = useMemo(() => chancellorLoadoutFor(profile), [profile]);
  const commander = commanders[0]!;

  // Escalação que vai para a sala. Cada cliente anuncia a sua e os dois montam a MESMA
  // config — baralhos diferentes divergiam a simulação já no primeiro tick.
  const roster = useMemo<LiveRoster>(
    () => ({
      deck: deck.slice(0, 8),
      commanderId: commander.id,
      doctrine: commander.doctrine,
      name: chancellor.name || "Comandante",
      flag: "🇧🇷",
      hero: chancellor,
    }),
    [chancellor, commander, deck],
  );

  const toggleCard = (id: string) =>
    setDeck((d) => {
      if (d.includes(id)) return d.filter((x) => x !== id);
      return d.length >= 8 ? d : [...d, id];
    });

  const copy = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("O navegador bloqueou a cópia. Selecione o código e copie à mão.");
    }
  }, []);

  const createRoom = useCallback(() => {
    setError(null);
    const code = encodeRoom(randomSeed(), terrain);
    // O código é a ÚNICA fonte da semente: o convidado a lê de lá. Se o host usasse a
    // semente original, os dois lados simulariam partidas diferentes (a semente é
    // reduzida para caber no código).
    const seed = decodeRoom(code)!.seed;
    setRooms(saveRoom({ code, terrain, createdAt: Date.now(), guestJoined: false, seed }));
    onStart(code, "host", seed, terrain, roster, mode);
  }, [mode, onStart, roster, terrain]);

  const joinRoom = useCallback(
    (rawCode?: string) => {
      const code = normalizeRoomCode(rawCode ?? joinCode);
      if (code.length < 4) {
        setError("Informe o código da sala (4 caracteres).");
        return;
      }
      const found = decodeRoom(code);
      if (found === null) {
        setError("Código inválido. Confira com o adversário.");
        return;
      }
      setError(null);
      setRooms(markGuestJoined(code));
      onStart(code, "guest", found.seed, found.terrain, roster, mode);
    },
    [joinCode, mode, onStart, roster],
  );

  // Convite (`?sala=XXXX`): o link já abre a sala. Sem isso o convidado caía no lobby
  // com o código preenchido e precisava clicar em "Entrar na sala" para a partida existir.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current || !joinCode || decodeRoom(joinCode) === null) return;
    autoJoined.current = true;
    joinRoom(joinCode);
  }, [joinCode, joinRoom]);

  return (
    <GameShell full>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3 overflow-y-auto px-4 py-4">
        <div>
          <p className="label-mono text-primary">PvP · tempo real</p>
          <h1 className="font-display text-3xl font-black uppercase leading-none">Sala online</h1>
          <p className="mt-1 max-w-2xl font-mono text-[11px] text-muted-foreground">
            Monte a escalação, abra a sala e mande o código. Os dois lados rodam a mesma batalha e
            trocam só comandos.
          </p>
        </div>

        <Panel title={`Escalação · ${deck.length}/8 cartas`}>
          <div className="grid gap-3 md:grid-cols-[230px_1fr]">
            <div className="hud-panel hud-corners flex flex-col gap-1 p-3">
              <p className="label-mono text-[9px] text-muted-foreground">Seu chanceler</p>
              <p className="font-display text-lg font-black uppercase leading-tight">
                {chancellor.name || "Comandante"}
              </p>
              <p className="font-mono text-[10px] text-ai">{commander.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{commander.doctrine}</p>
              <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                {chancellor.gearIds.length} peça(s)
                {chancellor.weaponName ? ` · ${chancellor.weaponName}` : ""}
              </p>
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="mt-auto border border-primary px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-accent"
              >
                {pickerOpen ? "Fechar cartas" : "Escolher cartas"}
              </button>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap gap-1">
                {deck.map((id) => (
                  <span
                    key={id}
                    className="border border-primary/60 bg-accent px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary"
                  >
                    {cardById(id).name}
                  </span>
                ))}
                {Array.from({ length: Math.max(0, 8 - deck.length) }).map((_, i) => (
                  <span
                    key={`vazio-${i}`}
                    className="border border-dashed border-border px-2 py-1 font-mono text-[10px] text-muted-foreground"
                  >
                    vazio
                  </span>
                ))}
              </div>

              {pickerOpen && (
                <div className="mt-2 max-h-60 overflow-y-auto border-t border-border pt-2">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                    {owned.map((id) => {
                      const card = cardById(id);
                      const on = deck.includes(id);
                      return (
                        <button
                          key={id}
                          onClick={() => toggleCard(id)}
                          className={cn(
                            "border p-1.5 text-left transition",
                            on
                              ? "border-primary bg-accent"
                              : "border-border hover:border-primary/50",
                          )}
                        >
                          <p className="font-display text-[11px] font-bold uppercase leading-tight">
                            {card.name}
                          </p>
                          <p className="font-mono text-[9px] text-muted-foreground">
                            {card.category}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>

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
          <span className="font-mono text-[10px] text-muted-foreground">
            {mode === "local"
              ? "entre abas do mesmo navegador — sem servidor"
              : "Realtime do Supabase, cada um no seu computador"}
          </span>
        </div>

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
              {arenaByTerrain(terrain).name} · {deck.length} cartas
            </p>
            <button
              onClick={createRoom}
              disabled={deck.length === 0}
              className="mt-3 w-full bg-primary px-4 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass hover:brightness-110 disabled:opacity-50"
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
// Partida online: espera a escalação do adversário e joga pela BattleView compartilhada
// ---------------------------------------------------------------------------

function OnlineMatch({
  code,
  seat,
  seed,
  terrain,
  roster,
  transportMode,
  onEnd,
  onExit,
}: {
  code: string;
  seat: Seat;
  seed: number;
  terrain: TerrainKind;
  roster: LiveRoster;
  transportMode: TransportMode;
  onEnd: (result: BattleResult) => void;
  onExit: () => void;
}) {
  const live = useLivePvp({ seed, terrain, roster, code, seat, transportMode, onEnd });
  const source = useMemo(() => ({ useBattle: live.useBattle }), [live.useBattle]);

  if (!live.config) {
    return (
      <WaitingRoom
        code={code}
        status={live.status}
        seat={seat}
        transportMode={transportMode}
        peerRoster={live.peerRoster}
        deckSize={roster.deck.length}
        onExit={onExit}
      />
    );
  }

  return (
    <GameShell full bare>
      <div className="flex h-full w-full flex-col">
        <BattleView
          config={live.config}
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
  peerRoster,
  deckSize,
  onExit,
}: {
  code: string;
  status: TransportStatus;
  seat: Seat;
  transportMode: TransportMode;
  peerRoster: LiveRoster | null;
  deckSize: number;
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
      ? "Sala aberta. Mande o convite: a partida começa quando o outro lado entrar."
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
              <span className="text-fact">{deckSize} cartas</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">
                {seat === "host" ? "Convidado · vermelho" : "Host · azul"}
              </span>
              <span className={peerRoster ? "text-fact" : "text-ai"}>
                {peerRoster
                  ? `${peerRoster.name} · ${peerRoster.deck.length} cartas`
                  : "aguardando entrar"}
              </span>
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
