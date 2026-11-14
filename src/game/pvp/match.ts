// Orquestrador de uma partida PvP online: junta a simulação lockstep (`LiveSim`) ao
// transporte (`LiveTransport`) e cuida do relógio, dos heartbeats e do resync.
//
// É independente de React: o hook `useLivePvp` só liga/desliga e re-renderiza. Isso
// mantém o laço testável com o transporte em memória.

import type { BattleAction, BattleConfig, BattleState } from "@/game/battle/types";
import { computeResult } from "@/game/battle/engine";
import type { BattleResult } from "@/game/battle/types";
import {
  HASH_INTERVAL_MS,
  INPUT_DELAY_TICKS,
  LiveSim,
  PROGRESS_INTERVAL_MS,
  LIVE_DT,
  type Seat,
} from "./live";
import type { LiveTransport } from "./transport";

export interface LiveMatchOptions {
  config: BattleConfig;
  seat: Seat;
  transport: LiveTransport;
  /** Passo fixo em segundos (padrão: LIVE_DT). */
  dt?: number;
  /** Chamado quando o estado muda (a cada passo) para o React re-renderizar. */
  onTick?: () => void;
  /** Chamado quando a partida termina. */
  onEnd?: (result: BattleResult) => void;
  /** Chamado quando o adversário conecta (primeiro heartbeat/hash recebido). */
  onPeerSeen?: () => void;
}

/**
 * Mantém o relógio da partida. O tempo é INJETADO pelo chamador (`advance`), que no
 * navegador é o `requestAnimationFrame` do hook — assim o laço é determinístico nos
 * testes e não depende de `setInterval`.
 */
export class LiveMatch {
  readonly sim: LiveSim;
  private readonly transport: LiveTransport;
  private readonly dt: number;
  private readonly opts: LiveMatchOptions;
  private lastProgressSent = 0;
  private lastHashSent = 0;
  private acc = 0;
  /** Tempo acumulado (ms) desde o início, para cadência dos heartbeats. */
  private elapsedMs = 0;
  private peerSeen = false;
  private ended = false;
  /** Histórico tick→hash (janela curta) para comparar o hash do adversário no MESMO tick. */
  private readonly hashHistory = new Map<number, number>();

  constructor(opts: LiveMatchOptions) {
    this.opts = opts;
    this.transport = opts.transport;
    this.dt = opts.dt ?? LIVE_DT;
    this.sim = new LiveSim(opts.config, {
      localSeat: opts.seat,
      inputDelay: INPUT_DELAY_TICKS,
    });
  }

  get state(): BattleState {
    return this.sim.state;
  }

  get finished(): boolean {
    return this.ended;
  }

  /**
   * Avança o relógio em `elapsedMs` (o hook passa o tempo do quadro). Nunca avança mais
   * do que o lockstep permite: se o adversário está atrasado, o excedente é descartado
   * (a simulação apenas espera, sem "correr" à frente).
   */
  advance(elapsedMs: number): void {
    if (this.ended) return;
    this.elapsedMs += elapsedMs;
    this.acc += Math.min(0.5, elapsedMs / 1000);
    while (this.acc >= this.dt) {
      this.acc -= this.dt;
      if (!this.sim.step()) {
        // Lockstep bloqueou: zera o acumulador para não acumular dívida de tempo.
        this.acc = 0;
        break;
      }
    }
    this.opts.onTick?.();
    this.heartbeat();
    this.checkEnd();
  }

  /** Aplica e publica uma ação local. */
  dispatch(action: BattleAction): void {
    const cmd = this.sim.localAction(action);
    this.transport.sendCommand(cmd);
    this.opts.onTick?.();
  }

  /** Pedido explícito de ressincronização (convidado pede snapshot ao host). */
  requestResync(): void {
    this.transport.requestResync();
  }

  /** Recebe um snapshot do host e substitui o estado local. */
  applySnapshot(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== "object") return;
    Object.assign(this.sim.state, snapshot as BattleState);
    this.opts.onTick?.();
  }

  // -------------------------------------------------------------------------

  private heartbeat(): void {
    if (this.elapsedMs - this.lastProgressSent >= PROGRESS_INTERVAL_MS) {
      this.lastProgressSent = this.elapsedMs;
      this.transport.sendProgress(this.sim.localTick);
    }
    if (this.elapsedMs - this.lastHashSent >= HASH_INTERVAL_MS) {
      this.lastHashSent = this.elapsedMs;
      const tick = this.sim.localTick;
      const hash = this.sim.hash();
      this.rememberHash(tick, hash);
      this.transport.sendHash(hash, tick);
    }
  }

  private rememberHash(tick: number, hash: number): void {
    this.hashHistory.set(tick, hash);
    // Mantém a janela enxuta: só os últimos ~64 ticks interessam para a comparação.
    if (this.hashHistory.size > 64) {
      const oldest = tick - 64;
      for (const k of this.hashHistory.keys()) if (k < oldest) this.hashHistory.delete(k);
    }
  }

  /** Hash local num tick próximo (±3), para comparar com o do adversário sob latência. */
  private hashNear(tick: number): number | undefined {
    for (let d = 0; d <= 3; d++) {
      const h = this.hashHistory.get(tick - d) ?? this.hashHistory.get(tick + d);
      if (h !== undefined) return h;
    }
    return undefined;
  }

  private checkEnd(): void {
    if (this.ended || this.sim.state.running) return;
    this.ended = true;
    this.opts.onEnd?.(computeResult(this.sim.state));
  }

  /** Handlers para plugar no transporte. */
  handlers() {
    return {
      onCommand: (cmd: Parameters<LiveSim["receive"]>[0]) => this.sim.receive(cmd),
      onProgress: (tick: number) => {
        this.notePeer();
        this.sim.noteRemoteProgress(tick);
      },
      onHash: (hash: number, tick: number) => {
        this.notePeer();
        // Os dois clientes podem estar em ticks ligeiramente diferentes (latência). Compara
        // o hash do adversário com o NOSSO naquele tick, aceitando uma janela curta de
        // desalinhamento. Divergência real = pedir snapshot ao host.
        const mine = this.hashNear(tick);
        if (mine !== undefined && mine !== hash) this.transport.requestResync();
      },
      onResyncRequest: () => {
        // Só o host responde com snapshot (ele é a autoridade).
        if (this.sim.localSeat === "host") this.transport.sendSnapshot(this.sim.snapshot());
      },
      onSnapshot: (snapshot: unknown) => {
        if (this.sim.localSeat === "guest") this.applySnapshot(snapshot);
      },
    };
  }

  private notePeer(): void {
    if (this.peerSeen) return;
    this.peerSeen = true;
    this.opts.onPeerSeen?.();
  }
}
