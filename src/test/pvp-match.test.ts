import { describe, expect, it } from "vitest";

import { commanders } from "@/game/battle/catalog";
import { buildLiveConfig, type LiveSideInput } from "@/game/pvp/live";
import { LiveMatch } from "@/game/pvp/match";
import {
  createFakeTransportPair,
  type FakeTransport,
  type LiveTransport,
} from "@/game/pvp/transport";

const HOST: LiveSideInput = {
  deck: [
    "inf-fuzileiros",
    "inf-assalto",
    "inf-antitanque",
    "inf-engenheiro",
    "art-canhao",
    "bld-vbld",
    "rec-drone",
    "def-aa",
  ],
  commanderId: commanders[0]!.id,
  doctrine: "Operações combinadas",
  name: "Host",
  flag: "🟦",
};
const GUEST: LiveSideInput = {
  deck: [
    "inf-fuzileiros",
    "bld-tanque",
    "bld-vbld",
    "art-obus",
    "def-fortificacao",
    "inf-antitanque",
    "rec-drone",
    "def-aa",
  ],
  commanderId: commanders[1]!.id,
  doctrine: "Poder de fogo",
  name: "Convidado",
  flag: "🟥",
};

/** Transporte "nulo": usado só para construir o match antes de plugar o par fake. */
function nullTransport(): LiveTransport {
  return {
    topic: "none",
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

interface Pair {
  host: LiveMatch;
  guest: LiveMatch;
  link: { a: FakeTransport; b: FakeTransport };
}

/**
 * Constrói dois matches ligados por um transporte em memória. Cada match é criado com um
 * transporte nulo (o construtor exige um), registra seus handlers e então é religado ao
 * par real — assim o roteamento A→B / B→A fica correto.
 */
function linkedPair(opts: {
  seed?: number;
  onHostPeerSeen?: () => void;
  onGuestPeerSeen?: () => void;
}): Pair {
  const config = buildLiveConfig({
    seed: opts.seed ?? 4242,
    terrain: "Campo aberto",
    host: HOST,
    guest: GUEST,
  });
  const host = new LiveMatch({
    config,
    seat: "host",
    transport: nullTransport(),
    ...(opts.onHostPeerSeen ? { onPeerSeen: opts.onHostPeerSeen } : {}),
  });
  const guest = new LiveMatch({
    config,
    seat: "guest",
    transport: nullTransport(),
    ...(opts.onGuestPeerSeen ? { onPeerSeen: opts.onGuestPeerSeen } : {}),
  });
  const link = createFakeTransportPair("TEST", host.handlers(), guest.handlers());
  (host as unknown as { transport: LiveTransport }).transport = link.a;
  (guest as unknown as { transport: LiveTransport }).transport = link.b;
  return { host, guest, link };
}

/** Roda os dois lados em quadros de 16 ms, entregando a rede a cada quadro. */
function runFrames(pair: Pair, frames: number, onFrame?: (i: number) => void): void {
  for (let i = 0; i < frames; i++) {
    onFrame?.(i);
    pair.host.advance(16);
    pair.guest.advance(16);
    pair.link.a.flush();
    pair.link.b.flush();
  }
}

describe("PvP online: partida (lockstep + rede fake)", () => {
  it("os dois clientes permanecem sincronizados e o combate acontece", () => {
    const pair = linkedPair({});
    runFrames(pair, 400, (i) => {
      if (i === 5) pair.host.dispatch({ type: "ordem", side: "blue", order: "avancar" });
      if (i === 6) pair.guest.dispatch({ type: "ordem", side: "red", order: "avancar" });
      if (i === 20)
        pair.host.dispatch({
          type: "deploy",
          side: "blue",
          cardId: "inf-fuzileiros",
          x: 40,
          y: 60,
        });
      if (i === 21)
        pair.guest.dispatch({
          type: "deploy",
          side: "red",
          cardId: "inf-fuzileiros",
          x: 160,
          y: 60,
        });
    });
    expect(pair.host.sim.localTick).toBe(pair.guest.sim.localTick);
    expect(pair.host.sim.localTick).toBeGreaterThan(20);
    expect(pair.host.state.blue.deployed).toBeGreaterThan(0);
    expect(pair.host.state.red.deployed).toBeGreaterThan(0);
    expect(pair.host.sim.hash()).toBe(pair.guest.sim.hash());
  });

  it("o adversário é percebido no primeiro heartbeat (onPeerSeen)", () => {
    let hostSeen = false;
    let guestSeen = false;
    const pair = linkedPair({
      onHostPeerSeen: () => (hostSeen = true),
      onGuestPeerSeen: () => (guestSeen = true),
    });
    runFrames(pair, 30);
    expect(hostSeen).toBe(true);
    expect(guestSeen).toBe(true);
  });

  it("uma divergência dispara resync e o snapshot do host corrige o convidado", () => {
    const pair = linkedPair({ seed: 77 });
    runFrames(pair, 60);
    expect(pair.host.sim.hash()).toBe(pair.guest.sim.hash());

    // Corrompe o convidado (simula pacote perdido / dessincronização).
    pair.guest.state.blue.command += 12345;
    expect(pair.guest.sim.hash()).not.toBe(pair.host.sim.hash());

    // Mais quadros: o hash divergente é detectado e o snapshot do host conserta.
    runFrames(pair, 120);
    expect(pair.guest.sim.hash()).toBe(pair.host.sim.hash());
  });

  it("o local nunca corre mais que a janela de entrada à frente do adversário", () => {
    const pair = linkedPair({});
    // Sem entregar a rede, os dois param na janela (inputDelay=4).
    for (let i = 0; i < 200; i++) {
      pair.host.advance(16);
      pair.guest.advance(16);
    }
    expect(pair.host.sim.localTick).toBeLessThanOrEqual(5);
    expect(pair.guest.sim.localTick).toBeLessThanOrEqual(5);
  });
});
