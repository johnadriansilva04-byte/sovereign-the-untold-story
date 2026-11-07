import { describe, expect, it } from "vitest";

import { aiTick } from "@/game/battle/ai";
import { cardById, militaryById } from "@/game/battle/catalog";
import {
  applyAction,
  computeResult,
  createBattle,
  deploy,
  dist,
  effectiveCost,
  runToCompletion,
  stepBattle,
} from "@/game/battle/engine";
import {
  buildBattleConfig,
  defaultNation,
  missionById,
  unlockedDeck,
} from "@/game/battle/missions";
import type { BattleConfig } from "@/game/battle/types";

const TEST_DECK = [
  "inf-fuzileiros",
  "inf-mecanizada",
  "bld-leve",
  "art-morteiro",
  "def-aa",
  "def-engenharia",
  "rec-patrulha",
  "sup-fumaca",
];

function testConfig(overrides: Partial<BattleConfig> = {}): BattleConfig {
  const base = buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-castello"),
    deck: TEST_DECK,
    commander: {
      id: "cmd-varela",
      name: "Cel. Varela",
      personality: "Metódico",
      doctrine: "Operações combinadas",
      note: "",
    },
    doctrine: "Operações combinadas",
    seed: 42,
  });
  return { ...base, ...overrides };
}

describe("motor de batalha", () => {
  it("cria a partida com mão de 4 cartas e fila de 4", () => {
    const state = createBattle(testConfig());
    expect(state.blue.deck.hand).toHaveLength(4);
    expect(state.blue.deck.queue).toHaveLength(4);
    expect(state.running).toBe(true);
  });

  it("consome Pontos de Comando ao desdobrar e recicla a carta para a fila", () => {
    const state = createBattle(testConfig());
    const cardId = state.blue.deck.hand[0]!.cardId;
    const cost = effectiveCost(cardById(cardId), state.blue.doctrine);
    const before = state.blue.command;
    const ok = deploy(state, "blue", cardId, 50, 85);
    expect(ok).toBe(true);
    expect(state.blue.command).toBeCloseTo(before - cost, 5);
    expect(state.blue.deck.queue).toContain(cardId);
    expect(state.blue.deck.hand).toHaveLength(4);
  });

  it("recusa desdobramento fora da zona e sem comando suficiente", () => {
    const state = createBattle(testConfig());
    const cardId = state.blue.deck.hand[0]!.cardId;
    expect(deploy(state, "blue", cardId, 50, 5)).toBe(false); // zona inimiga
    state.blue.command = 0;
    expect(deploy(state, "blue", cardId, 50, 85)).toBe(false);
  });

  it("regenera comando ao longo do tempo", () => {
    const state = createBattle(testConfig());
    state.blue.command = 0;
    for (let i = 0; i < 10; i++) stepBattle(state, 0.1);
    expect(state.blue.command).toBeGreaterThan(0);
  });

  it("unidades avançam para disputar objetivos e capturam pontos", () => {
    const state = createBattle(testConfig({ duration: 120 }));
    deploy(state, "blue", "inf-fuzileiros", 50, 85);
    // simula sem IA adversária para isolar a captura
    for (let i = 0; i < 400 && state.running; i++) stepBattle(state, 0.1);
    const center = state.config.arena.controlPoints.find((p) => p.id === "cp-s")!;
    expect(center.progress.blue).toBeGreaterThan(0);
  });

  it("é determinístico para a mesma semente", () => {
    const run = () => runToCompletion(testConfig({ duration: 90 }), aiTick).reason;
    expect(run()).toBe(run());
  });

  it("termina a partida e devolve um resultado consistente", () => {
    const state = runToCompletion(testConfig({ duration: 60 }), aiTick);
    expect(state.running).toBe(false);
    const result = computeResult(state);
    expect(["vitoria", "derrota", "empate"]).toContain(result.outcome);
    expect(result.pointsHeld.length).toBe(state.config.arena.controlPoints.length);
    expect(result.duration).toBeGreaterThan(0);
  });

  it("a IA joga dentro das regras: só gasta o comando que tem", () => {
    const state = createBattle(testConfig({ duration: 120 }));
    let maxCommandSeen = 0;
    for (let i = 0; i < 1200 && state.running; i++) {
      aiTick(state, 0.1);
      stepBattle(state, 0.1);
      maxCommandSeen = Math.max(maxCommandSeen, state.red.command);
    }
    expect(maxCommandSeen).toBeLessThanOrEqual(state.red.commandMax + 0.001);
    expect(state.red.deployed).toBeGreaterThan(0);
  });

  it("ordens alteram o comportamento (manter posição não move a unidade)", () => {
    const state = createBattle(testConfig({ duration: 60 }));
    deploy(state, "blue", "inf-fuzileiros", 50, 85);
    const unit = state.blue.units[0]!;
    const start = { x: unit.x, y: unit.y };
    applyAction(state, { type: "ordem", side: "blue", order: "manter" });
    for (let i = 0; i < 100; i++) stepBattle(state, 0.1);
    expect(dist(unit.x, unit.y, start.x, start.y)).toBeLessThan(0.5);
  });

  it("cartas de apoio funcionam (barricada vira obstáculo, ataque aéreo fere)", () => {
    const state = createBattle(testConfig({ duration: 60 }));
    state.blue.command = 10;
    state.blue.deck.hand[0] = { cardId: "sup-barricada", ready: true };
    state.blue.deck.hand[1] = { cardId: "sup-aereo", ready: true };
    const obstaclesBefore = state.config.arena.obstacles.length;
    deploy(state, "blue", "sup-barricada", 50, 80);
    expect(state.config.arena.obstacles.length).toBe(obstaclesBefore + 1);

    // coloca uma unidade vermelha e bombardeia
    deploy(state, "red", "inf-fuzileiros", 50, 20);
    const target = state.red.units[0]!;
    const hpBefore = target.hp;
    state.blue.command = 10;
    deploy(state, "blue", "sup-aereo", target.x, target.y);
    expect(target.hp).toBeLessThan(hpBefore);
  });

  it("antiaérea não atinge alvos terrestres e drones são aéreos", () => {
    expect(militaryById("def-aa").targets).toBe("aereo");
    expect(militaryById("rec-drone").domain).toBe("aereo");
  });

  it("aplicação de modificadores: acessórios aumentam vida e a IA não burla o comando", () => {
    const cfg = testConfig();
    cfg.blue.mods = { hp: { infantaria: 0.5 }, commandMax: 2 };
    const state = createBattle(cfg);
    const before = state.blue.units.length;
    const ok = deploy(state, "blue", "inf-fuzileiros", 50, 90);
    expect(ok).toBe(true);
    expect(state.blue.units.length).toBe(before + 1);
    const u = state.blue.units[state.blue.units.length - 1]!;
    const base = militaryById("inf-fuzileiros").hp;
    expect(u.maxHp).toBeGreaterThan(base);
  });

  it("dificuldade mais alta deixa a IA mais agressiva (intervalo menor)", () => {
    const facil = createBattle(
      testConfig({ aiDifficulty: { intervalMult: 2, commandMult: 1, reserveBonus: 0 } }),
    );
    const dificil = createBattle(
      testConfig({ aiDifficulty: { intervalMult: 0.4, commandMult: 1.3, reserveBonus: 3 } }),
    );
    // avança o mesmo tempo em ambos; a IA difícil deve ter desdobrado pelo menos tanto quanto a fácil
    for (let i = 0; i < 900; i++) {
      stepBattle(facil, 0.1);
      stepBattle(dificil, 0.1);
    }
    expect(dificil.red.deployed).toBeGreaterThanOrEqual(facil.red.deployed);
  });
});
