// Escolha do transporte: sala NESTA MÁQUINA (BroadcastChannel, sem servidor) ou ONLINE
// (Realtime do Supabase). O resto do jogo só conhece a interface `LiveTransport`.

import { createLocalTransport } from "./localTransport";
import { createSupabaseTransport, type TransportHandlers } from "./transport";
import type { LiveTransport } from "./transport";
import type { Seat } from "./live";

export type TransportMode = "local" | "online";

export function createTransport(
  mode: TransportMode,
  code: string,
  seat: Seat,
  handlers: TransportHandlers,
): LiveTransport {
  return mode === "online"
    ? createSupabaseTransport(code, seat, handlers)
    : createLocalTransport(code, seat, handlers);
}
