// TRANSPORTE LOCAL — PvP de verdade sem servidor, em duas abas do mesmo navegador.
//
// O motor é determinístico e os dois clientes só trocam COMANDOS, então basta um canal de
// mensagens entre abas: BroadcastChannel. Isso não substitui o Realtime do Supabase entre
// máquinas diferentes, mas faz a sala funcionar offline (e em teste) em vez de morrer em
// "falha na conexão" quando o servidor não está configurado.

import { roomTopic, type LiveTransport, type TransportHandlers } from "./transport";
import type { LiveCommand, Seat } from "./live";

const EV = {
  cmd: "cmd",
  progress: "progress",
  hash: "hash",
  resyncReq: "resync-req",
  snapshot: "snapshot",
  hello: "hello",
} as const;

export const isLocalTransportSupported = (): boolean => typeof BroadcastChannel !== "undefined";

export function createLocalTransport(
  code: string,
  seat: Seat,
  handlers: TransportHandlers,
): LiveTransport {
  const topic = roomTopic(code);
  if (!isLocalTransportSupported()) {
    handlers.onStatus?.("error", "Este navegador não suporta salas locais.");
    return {
      topic,
      sendCommand: () => {},
      sendProgress: () => {},
      sendHash: () => {},
      requestResync: () => {},
      sendSnapshot: () => {},
      close: () => {},
    };
  }

  const channel = new BroadcastChannel(topic);
  const post = (event: string, payload: unknown) => channel.postMessage({ event, payload });

  channel.onmessage = (e: MessageEvent<{ event?: string; payload?: unknown }>) => {
    const event = e.data?.event;
    const payload = e.data?.payload;
    switch (event) {
      case EV.cmd: {
        const cmd = payload as LiveCommand;
        if (cmd && cmd.seat !== seat) handlers.onCommand?.(cmd);
        break;
      }
      case EV.progress: {
        const { tick } = (payload ?? {}) as { tick?: number };
        if (typeof tick === "number") handlers.onProgress?.(tick);
        break;
      }
      case EV.hash: {
        const { hash, tick } = (payload ?? {}) as { hash?: number; tick?: number };
        if (typeof hash === "number" && typeof tick === "number") handlers.onHash?.(hash, tick);
        break;
      }
      case EV.resyncReq:
        handlers.onResyncRequest?.();
        break;
      case EV.snapshot:
        handlers.onSnapshot?.(payload);
        break;
      case EV.hello:
        break;
    }
  };

  // Anuncia presença e responde ao anúncio do outro lado: quem já estava na sala
  // descobre o recém-chegado sem esperar o primeiro comando.
  post(EV.hello, { seat });
  handlers.onStatus?.("open");

  return {
    topic,
    sendCommand: (cmd) => post(EV.cmd, cmd),
    sendProgress: (tick) => post(EV.progress, { tick }),
    sendHash: (hash, tick) => post(EV.hash, { hash, tick }),
    requestResync: () => post(EV.resyncReq, {}),
    sendSnapshot: (state) => post(EV.snapshot, state),
    close: () => {
      channel.close();
    },
  };
}
