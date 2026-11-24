// Transporte de tempo real do PvP online.
//
// Usa o Realtime do Supabase (WebSocket) em modo BROADCAST — mensagens efêmeras que NÃO
// gravam no banco (nenhuma migração é necessária e nada de partida fica persistido).
// O canal é nomeado por um tópico que embute o código da sala, então só quem sabe o
// código entra na mesma "sala".
//
// Toda a rede fica atrás da interface `LiveTransport`: o resto do jogo nunca fala com o
// Supabase diretamente, e os testes usam um transporte em memória (`createFakeTransportPair`).

import { getSupabase } from "@/lib/supabase";
import type { LiveCommand, LiveRoster, Seat } from "./live";

export type TransportStatus = "connecting" | "open" | "closed" | "error";

export interface TransportHandlers {
  onStatus?: (status: TransportStatus, detail?: string) => void;
  onCommand?: (cmd: LiveCommand) => void;
  /** Heartbeat de progresso do adversário (tick local dele). */
  onProgress?: (tick: number) => void;
  /** Hash de estado do adversário no tick informado (detecção de divergência). */
  onHash?: (hash: number, tick: number) => void;
  /** Pedido do adversário para o host enviar um snapshot de estado. */
  onResyncRequest?: () => void;
  /** Snapshot recebido do host. */
  onSnapshot?: (state: unknown) => void;
  /** Escalação do adversário (baralho, chanceler, doutrina). */
  onRoster?: (roster: LiveRoster) => void;
  /** Alguém entrou na sala e pediu as escalações: responda com `sendRoster`. */
  onHello?: () => void;
}

export interface LiveTransport {
  readonly topic: string;
  sendCommand(cmd: LiveCommand): void;
  sendProgress(tick: number): void;
  sendHash(hash: number, tick: number): void;
  requestResync(): void;
  sendSnapshot(state: unknown): void;
  /** Anuncia a própria escalação; os dois clientes montam a MESMA config com ela. */
  sendRoster(roster: LiveRoster): void;
  /** Avisa que entrei na sala; quem já estava responde com a escalação dele. */
  sendHello(): void;
  close(): void;
}

const EV = {
  cmd: "cmd",
  progress: "progress",
  hash: "hash",
  resyncReq: "resync-req",
  snapshot: "snapshot",
  roster: "roster",
  hello: "hello",
} as const;

export function roomTopic(code: string): string {
  return `pvp-live:${code.toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Implementação sobre o Supabase Realtime
// ---------------------------------------------------------------------------

export function createSupabaseTransport(
  code: string,
  seat: Seat,
  handlers: TransportHandlers,
): LiveTransport {
  const sb = getSupabase();
  const topic = roomTopic(code);
  if (!sb) {
    handlers.onStatus?.("error", "Supabase não configurado.");
    return noopTransport(topic);
  }
  const channel = sb.channel(topic, {
    config: { broadcast: { self: false }, presence: { key: seat } },
  });

  const bind = (event: string, cb: (payload: unknown) => void) => {
    channel.on("broadcast", { event }, (msg: { payload?: unknown }) => cb(msg.payload));
  };
  bind(EV.cmd, (p) => {
    const cmd = p as LiveCommand;
    if (cmd && cmd.seat !== seat) handlers.onCommand?.(cmd);
  });
  bind(EV.progress, (p) => {
    const { tick } = (p ?? {}) as { tick?: number };
    if (typeof tick === "number") handlers.onProgress?.(tick);
  });
  bind(EV.hash, (p) => {
    const { hash, tick } = (p ?? {}) as { hash?: number; tick?: number };
    if (typeof hash === "number" && typeof tick === "number") handlers.onHash?.(hash, tick);
  });
  bind(EV.resyncReq, () => handlers.onResyncRequest?.());
  bind(EV.snapshot, (p) => handlers.onSnapshot?.(p));
  bind(EV.roster, (p) => {
    const roster = p as LiveRoster;
    if (roster && Array.isArray(roster.deck)) handlers.onRoster?.(roster);
  });
  bind(EV.hello, () => handlers.onHello?.());

  const post = (event: string, payload: unknown) => {
    void channel.send({ type: "broadcast", event, payload });
  };

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      handlers.onStatus?.("open");
      post(EV.hello, {});
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
      handlers.onStatus?.("error", status);
    else if (status === "CLOSED") handlers.onStatus?.("closed");
    else handlers.onStatus?.("connecting");
  });

  return {
    topic,
    sendCommand: (cmd) => post(EV.cmd, cmd),
    sendProgress: (tick) => post(EV.progress, { tick }),
    sendHash: (hash, tick) => post(EV.hash, { hash, tick }),
    requestResync: () => post(EV.resyncReq, {}),
    sendSnapshot: (state) => post(EV.snapshot, state),
    sendRoster: (roster) => post(EV.roster, roster),
    sendHello: () => post(EV.hello, {}),
    close: () => {
      void sb.removeChannel(channel);
    },
  };
}

function noopTransport(topic: string): LiveTransport {
  return {
    topic,
    sendCommand: () => {},
    sendProgress: () => {},
    sendHash: () => {},
    requestResync: () => {},
    sendSnapshot: () => {},
    sendRoster: () => {},
    sendHello: () => {},
    close: () => {},
  };
}

// ---------------------------------------------------------------------------
// Transporte em memória (testes)
// ---------------------------------------------------------------------------

export interface FakeTransport extends LiveTransport {
  /** Entrega o que foi enviado ao outro peer, simulando a rede. */
  flush(): void;
  /** Mensagens pendentes de entrega (para simular latência). */
  pending(): number;
}

interface Wire {
  event: string;
  payload: unknown;
}

/** Par de transportes ligados entre si: o que A envia chega a B e vice-versa. */
export function createFakeTransportPair(
  code: string,
  handlersA: TransportHandlers,
  handlersB: TransportHandlers,
): { a: FakeTransport; b: FakeTransport } {
  const make = (outbox: Wire[], target: TransportHandlers): FakeTransport => {
    const deliver = (w: Wire) => {
      switch (w.event) {
        case EV.cmd:
          target.onCommand?.(w.payload as LiveCommand);
          break;
        case EV.progress:
          target.onProgress?.((w.payload as { tick: number }).tick);
          break;
        case EV.hash: {
          const p = w.payload as { hash: number; tick: number };
          target.onHash?.(p.hash, p.tick);
          break;
        }
        case EV.resyncReq:
          target.onResyncRequest?.();
          break;
        case EV.snapshot:
          target.onSnapshot?.(w.payload);
          break;
        case EV.roster:
          target.onRoster?.(w.payload as LiveRoster);
          break;
        case EV.hello:
          target.onHello?.();
          break;
      }
    };
    return {
      topic: roomTopic(code),
      sendCommand: (cmd) => outbox.push({ event: EV.cmd, payload: cmd }),
      sendProgress: (tick) => outbox.push({ event: EV.progress, payload: { tick } }),
      sendHash: (hash, tick) => outbox.push({ event: EV.hash, payload: { hash, tick } }),
      requestResync: () => outbox.push({ event: EV.resyncReq, payload: {} }),
      sendSnapshot: (state) => outbox.push({ event: EV.snapshot, payload: state }),
      sendRoster: (roster) => outbox.push({ event: EV.roster, payload: roster }),
      sendHello: () => outbox.push({ event: EV.hello, payload: {} }),
      close: () => {},
      pending: () => outbox.length,
      flush: () => {
        const batch = outbox.splice(0, outbox.length);
        for (const w of batch) deliver(w);
      },
    };
  };
  const queueA: Wire[] = [];
  const queueB: Wire[] = [];
  return { a: make(queueA, handlersB), b: make(queueB, handlersA) };
}
