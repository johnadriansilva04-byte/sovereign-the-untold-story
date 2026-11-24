import { describe, expect, it } from "vitest";

import { trackedChancellorSide } from "@/game/battle/chancellor";
import { commanders } from "@/game/battle/catalog";
import { createBattle, deploy } from "@/game/battle/engine";
import type { BattleAction, BattleConfig } from "@/game/battle/types";
import {
  buildLiveConfig,
  compareCommands,
  decodeRoom,
  encodeRoom,
  LiveSim,
  LIVE_DT,
  makeRoomCode,
  normalizeRoomCode,
  randomSeed,
  stateHash,
  type LiveCommand,
  type LiveSideInput,
  type Seat,
} from "@/game/pvp/live";

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

function config(seed = 1234): BattleConfig {
  return buildLiveConfig({ seed, terrain: "Campo aberto", host: HOST, guest: GUEST });
}

describe("PvP online: núcleo", () => {
  it("gera código de sala sem caracteres ambíguos e normaliza a digitação", () => {
    const code = makeRoomCode(() => 0.42, 4);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeRoomCode("ab-cd")).toBe("ABCD");
    // O e O/I/L digitados por engano viram 0/1.
    expect(normalizeRoomCode("oil0")).toBe("0110");
  });

  it("monta config espelhada: economia IGUAL nos dois lados e semente única", () => {
    const cfg = config(777);
    expect(cfg.seed).toBe(777);
    expect(cfg.blue.economyBonus).toBe(cfg.red.economyBonus);
    expect(cfg.blue.regen).toBe(cfg.red.regen);
    expect(cfg.blue.commandMax).toBe(cfg.red.commandMax);
    expect(cfg.blue.deck).toHaveLength(8);
    expect(cfg.red.deck).toHaveLength(8);
  });

  it("dois clientes com os MESMOS comandos terminam no MESMO estado (determinismo)", () => {
    const cfg = config();
    const host = new LiveSim(cfg, { localSeat: "host" });
    const guest = new LiveSim(cfg, { localSeat: "guest" });

    const hostActions: BattleAction[] = [
      { type: "deploy", side: "blue", cardId: "inf-fuzileiros", x: 40, y: 60 },
      { type: "ordem", side: "blue", order: "avancar" },
    ];
    const guestActions: BattleAction[] = [
      { type: "deploy", side: "red", cardId: "bld-tanque", x: 160, y: 60 },
      { type: "ordem", side: "red", order: "avancar" },
    ];

    // Sem atraso de rede: cada comando chega antes de ser devido.
    for (let i = 0; i < 600; i++) {
      if (i === 2) host.receive(guest.localAction(guestActions[1]!));
      if (i === 3) guest.receive(host.localAction(hostActions[1]!));
      if (i === 10) host.receive(guest.localAction(guestActions[0]!));
      if (i === 11) guest.receive(host.localAction(hostActions[0]!));
      // heartbeats de progresso mútuos
      host.noteRemoteProgress(guest.localTick);
      guest.noteRemoteProgress(host.localTick);
      host.step();
      guest.step();
    }

    expect(host.localTick).toBe(guest.localTick);
    expect(host.localTick).toBeGreaterThan(0);
    expect(host.hash()).toBe(guest.hash());
    expect(host.state.t).toBeCloseTo(guest.state.t, 6);
    // O combate de fato ocorreu: os dois lados lançaram tropas.
    expect(host.state.blue.deployed).toBeGreaterThan(0);
    expect(host.state.red.deployed).toBeGreaterThan(0);
  });

  it("a janela de atraso segura o local até o adversário reportar progresso", () => {
    const sim = new LiveSim(config(), { localSeat: "host", inputDelay: 3 });
    // Sem heartbeat do adversário, só avança a janela (0..3) e para.
    for (let i = 0; i < 50; i++) sim.step();
    expect(sim.localTick).toBe(4); // parou em remoteProgress(0) + delay(3) + 1
    sim.noteRemoteProgress(20);
    expect(sim.step()).toBe(true);
    expect(sim.localTick).toBe(5);
  });

  it("ordena comandos do mesmo tick de forma canônica (host antes de guest)", () => {
    const a: LiveCommand = {
      seq: 5,
      seat: "guest",
      tick: 10,
      action: { type: "ordem", side: "red", order: "manter" },
    };
    const b: LiveCommand = {
      seq: 1,
      seat: "host",
      tick: 10,
      action: { type: "ordem", side: "blue", order: "manter" },
    };
    expect([a, b].sort(compareCommands).map((c) => c.seat)).toEqual(["host", "guest"]);
  });

  it("o hash muda quando o estado muda (detecta divergência)", () => {
    const cfg = config();
    const a = new LiveSim(cfg, { localSeat: "host" });
    const b = new LiveSim(cfg, { localSeat: "host" });
    expect(a.hash()).toBe(b.hash());
    deploy(a.state, "blue", "inf-fuzileiros", 40, 60);
    expect(a.hash()).not.toBe(b.hash());
  });

  it("comandos atrasados chegam a tempo com a janela de entrada", () => {
    const cfg = config();
    const host = new LiveSim(cfg, { localSeat: "host" });
    const guest = new LiveSim(cfg, { localSeat: "guest" });
    const cmd = guest.localAction({
      type: "deploy",
      side: "red",
      cardId: "inf-fuzileiros",
      x: 160,
      y: 60,
    });
    // O comando tem tick = localTick(0) + delay(4) = 4. Simula 2 ticks de atraso de rede.
    for (let i = 0; i < 2; i++) {
      host.noteRemoteProgress(guest.localTick);
      guest.noteRemoteProgress(host.localTick);
      host.step();
      guest.step();
    }
    host.receive(cmd); // chega com atraso, mas antes do tick 4
    for (let i = 0; i < 40; i++) {
      host.noteRemoteProgress(guest.localTick);
      guest.noteRemoteProgress(host.localTick);
      host.step();
      guest.step();
    }
    expect(host.state.red.deployed).toBe(guest.state.red.deployed);
    expect(host.hash()).toBe(guest.hash());
  });

  it("LIVE_DT bate com o passo do motor solo", () => {
    expect(LIVE_DT).toBeCloseTo(0.1, 6);
  });

  it("randomSeed é estável para a mesma fonte", () => {
    expect(randomSeed(() => 0.5)).toBe(randomSeed(() => 0.5));
  });

  it("a semente do host sai do código da sala, não do sorteio original", () => {
    // `encodeRoom` reduz a semente para caber no código: quem cria a sala precisa jogar
    // com a semente LIDA do código, senão os dois clientes simulam partidas diferentes.
    for (const raw of [randomSeed(() => 0.123), randomSeed(() => 0.987), 0xffffffff]) {
      const code = encodeRoom(raw, "Campo aberto");
      const decoded = decodeRoom(code)!;
      expect(decoded.terrain).toBe("Campo aberto");
      expect(encodeRoom(decoded.seed, "Campo aberto")).toBe(code);
    }
  });

  it("os dois assentos acompanham o MESMO chanceler", () => {
    // Cada cliente monta a config com a mesma semente; o chanceler é de um dos lados e
    // o HUD só muda a etiqueta ("seu" × "inimigo"). Sem isso o convidado via o próprio
    // chanceler no lugar do chanceler do host.
    for (const seed of [1234, 1235, 777, 4096]) {
      const cfg = buildLiveConfig({ seed, terrain: "Campo aberto", host: HOST, guest: GUEST });
      const state = createBattle(cfg);
      expect(trackedChancellorSide(state, "blue")).toBe(trackedChancellorSide(state, "red"));
      expect(trackedChancellorSide(state, "blue")).toBe(cfg.heroSetup![0]!.side);
    }
  });
});
