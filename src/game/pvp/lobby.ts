// Lobby online (matchmaking automático estilo "partida rápida" + salas por código).
//
// Dois caminhos, os dois sobre o Realtime do Supabase:
//
//  1. PARTIDA RÁPIDA — entra numa sala de espera GLOBAL (canal `presence`). Todo mundo
//     que clica em "iniciar" aparece ali. O pareamento é DETERMINÍSTICO: os dois clientes
//     ordenam a mesma lista de espera e chegam ao mesmo par e ao mesmo código de sala,
//     sem precisar combinar nada por mensagem. Quem é o primeiro do par é o host.
//
//  2. CRIAR/ENTRAR EM SALA — o jogador gera um código, manda para o amigo e os dois
//     entram direto no canal daquela sala.
//
// O pareamento puro (`pairUp`/`roleForMe`) é testável sem rede.

import { getSupabase } from "@/lib/supabase";
import { makeRoomCode } from "./live";

export interface Waiter {
  /** Identidade estável (aleatória por sessão) — só para ordenar o pareamento. */
  id: string;
  name: string;
  /** Instante de entrada na fila (ms). Desempata quem esperou mais. */
  at: number;
}

export type PairRole = "host" | "guest";

export interface Pairing {
  role: PairRole;
  code: string;
  opponent: Waiter;
}

/**
 * Código de sala determinístico a partir dos dois ids do par: os dois clientes calculam
 * o MESMO código, sem trocar mensagem. Ordena os ids para o resultado não depender de
 * quem pergunta.
 */
export function pairingCode(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  let h = 2166136261;
  const seed = `${x}|${y}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Gera um código curto a partir do hash (mesmo alfabeto do código manual).
  const rng = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  return makeRoomCode(rng, 5);
}

/**
 * Forma os pares da fila: ordena por (entrada, id) e casa 1-2, 3-4, … O primeiro de cada
 * par é o host. Função pura e determinística — todos os clientes obtêm o mesmo resultado
 * para a mesma fila.
 */
export function pairUp(waiters: Waiter[]): { host: Waiter; guest: Waiter; code: string }[] {
  const sorted = [...waiters].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const pairs: { host: Waiter; guest: Waiter; code: string }[] = [];
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const host = sorted[i]!;
    const guest = sorted[i + 1]!;
    pairs.push({ host, guest, code: pairingCode(host.id, guest.id) });
  }
  return pairs;
}

/** Em que papel EU fico nesta fila (ou `null` se ainda estou sozinho/fora de um par). */
export function roleForMe(me: Waiter, waiters: Waiter[]): Pairing | null {
  for (const p of pairUp(waiters)) {
    if (p.host.id === me.id) return { role: "host", code: p.code, opponent: p.guest };
    if (p.guest.id === me.id) return { role: "guest", code: p.code, opponent: p.host };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fila de espera sobre o Supabase (presence)
// ---------------------------------------------------------------------------

export interface LobbyHandlers {
  /** Chamado quando um par se forma para mim. */
  onPaired: (pairing: Pairing) => void;
  /** Quantos jogadores estão na fila agora (para a UI mostrar "procurando…"). */
  onQueueSize?: (n: number) => void;
  onStatus?: (status: "connecting" | "open" | "closed" | "error", detail?: string) => void;
}

export interface Lobby {
  /** Atualiza meu nome exibido na fila. */
  setProfile(name: string): void;
  leave(): void;
}

const LOBBY_CHANNEL = "pvp-lobby:v1";

export function createSupabaseLobby(handlers: LobbyHandlers): Lobby {
  const sb = getSupabase();
  if (!sb) {
    handlers.onStatus?.("error", "Supabase não configurado.");
    return { setProfile: () => {}, leave: () => {} };
  }
  const me: Waiter = { id: makeRoomCode(Math.random, 8), name: "Comandante", at: Date.now() };
  const channel = sb.channel(LOBBY_CHANNEL, {
    config: { presence: { key: me.id } },
  });
  let paired = false;

  const readQueue = (): Waiter[] => {
    const state = channel.presenceState<Waiter>();
    const out: Waiter[] = [];
    for (const key of Object.keys(state)) {
      for (const p of state[key] ?? []) {
        const w = p as unknown as Waiter;
        if (w && typeof w.id === "string")
          out.push({ id: w.id, name: w.name ?? "?", at: w.at ?? 0 });
      }
    }
    return out;
  };

  const evaluate = () => {
    if (paired) return;
    const queue = readQueue();
    handlers.onQueueSize?.(queue.length);
    const mine = queue.find((w) => w.id === me.id);
    if (!mine) return;
    const pairing = roleForMe(mine, queue);
    if (!pairing) return;
    paired = true;
    handlers.onPaired(pairing);
  };

  channel
    .on("presence", { event: "sync" }, evaluate)
    .on("presence", { event: "join" }, evaluate)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        handlers.onStatus?.("open");
        void channel.track({ id: me.id, name: me.name, at: me.at });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        handlers.onStatus?.("error", status);
      } else if (status === "CLOSED") {
        handlers.onStatus?.("closed");
      } else {
        handlers.onStatus?.("connecting");
      }
    });

  return {
    setProfile: (name) => {
      me.name = name;
      void channel.track({ id: me.id, name: me.name, at: me.at });
    },
    leave: () => {
      void sb.removeChannel(channel);
    },
  };
}

// ---------------------------------------------------------------------------
// Fila em memória (testes)
// ---------------------------------------------------------------------------

export interface FakeLobby {
  lobby: Lobby;
  /** Quantos estão na fila. */
  size(): number;
  /** Força uma rodada de avaliação (o Supabase faria via `sync`). */
  sync(): void;
}

/** Barramento em memória: vários lobbies falsos "conversam" entre si. */
export function createFakeLobbyBus(): {
  join: (name: string, handlers: LobbyHandlers) => FakeLobby;
  size: () => number;
} {
  const members = new Map<string, { me: Waiter; handlers: LobbyHandlers; paired: boolean }>();
  const evaluateAll = () => {
    const queue = [...members.values()].map((m) => m.me);
    for (const m of members.values()) {
      m.handlers.onQueueSize?.(queue.length);
      if (m.paired) continue;
      const pairing = roleForMe(m.me, queue);
      if (!pairing) continue;
      m.paired = true;
      m.handlers.onPaired(pairing);
    }
  };
  return {
    join: (name, handlers) => {
      const me: Waiter = { id: makeRoomCode(Math.random, 8), name, at: Date.now() };
      const member = { me, handlers, paired: false };
      members.set(me.id, member);
      handlers.onStatus?.("open");
      evaluateAll();
      return {
        lobby: {
          setProfile: (n) => {
            me.name = n;
          },
          leave: () => {
            members.delete(me.id);
          },
        },
        size: () => members.size,
        sync: evaluateAll,
      };
    },
    size: () => members.size,
  };
}
