import { describe, expect, it } from "vitest";

import { allCards, cardById, unitsPerDeploy } from "@/game/battle/catalog";
import { createBattle, deploy, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import {
  COUNTER_BONUS,
  COUNTER_PENALTY,
  COUNTER_RING,
  MEN_PER_UNIT,
  predatorOf,
  preyOf,
  counterMultiplier,
  signatureOf,
  TROOP_POOL,
} from "@/game/battle/troops";
import type { BattleConfig } from "@/game/battle/types";

const DECK = [
  "inf-fuzileiros",
  "inf-assalto",
  "bld-vbld",
  "art-canhao",
  "def-aa",
  "inf-engenheiro",
  "rec-drone",
  "sup-gas",
];

function config(overrides: Partial<BattleConfig> = {}): BattleConfig {
  const base = buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-castello"),
    deck: DECK,
    commander: {
      id: "cmd-varela",
      name: "Cel. Varela",
      personality: "Metódico",
      doctrine: "Operações combinadas",
      note: "",
    },
    doctrine: "Operações combinadas",
    seed: 42,
    troopRules: true,
  });
  return { ...base, ...overrides };
}

describe("efetivo de soldados", () => {
  it("os dois chanceleres entram com o mesmo efetivo", () => {
    const state = createBattle(config());

    expect(state.blue.troops).toBe(TROOP_POOL);
    expect(state.red.troops).toBe(TROOP_POOL);
    expect(state.blue.troopCap).toBe(state.red.troopCap);
  });

  it("enviar uma carta gasta homens do efetivo", () => {
    const state = createBattle(config());
    const card = cardById("inf-fuzileiros");
    const before = state.blue.troops;

    expect(deploy(state, "blue", "inf-fuzileiros", 50, 85)).toBe(true);

    const expected =
      MEN_PER_UNIT.infantaria *
      (card.kind === "militar" ? (card.squad?.base ?? 1) : 1) *
      unitsPerDeploy(1);
    expect(state.blue.troops).toBe(before - expected);
    expect(state.blue.troops).toBeLessThan(TROOP_POOL);
  });

  it("sem efetivo a carta não sai, mesmo com Sov de sobra", () => {
    const state = createBattle(config({ troopPool: 5 }));

    expect(deploy(state, "blue", "inf-fuzileiros", 50, 85)).toBe(false);
    expect(state.blue.command).toBeGreaterThan(0);
  });

  it("conquistar território não devolve soldados", () => {
    const state = createBattle(config());
    deploy(state, "blue", "inf-fuzileiros", 50, 85);
    const afterDeploy = state.blue.troops;
    for (let i = 0; i < 200; i++) stepBattle(state, 0.1);

    expect(state.blue.troops).toBe(afterDeploy);
    expect(state.blue.troops).toBeLessThanOrEqual(TROOP_POOL);
  });
});

describe("ciclo de contrapesos", () => {
  it("o canhão vence o fuzileiro e perde para o reconhecimento", () => {
    expect(counterMultiplier("artilharia", "infantaria")).toBe(COUNTER_BONUS);
    expect(counterMultiplier("artilharia", "blindado")).toBe(COUNTER_PENALTY);
    expect(counterMultiplier("artilharia", "reconhecimento")).toBe(1);
  });

  it("o anel fecha em seis pontas, sem categoria imbatível", () => {
    expect(COUNTER_RING).toHaveLength(6);
    for (const category of COUNTER_RING) {
      expect(predatorOf(preyOf(category))).toBe(category);
      expect(predatorOf(category)).not.toBe(category);
      expect(preyOf(category)).not.toBe(category);
    }
  });

  it("toda carta tem assinatura própria e um nemesis de outra categoria", () => {
    for (const card of allCards) {
      const signature = signatureOf(card);
      expect(signature.name.length).toBeGreaterThan(0);
      expect(signature.weakTo).not.toBe(card.category);
      // O nemesis existe no catálogo e vence a carta no anel.
      expect(counterMultiplier(signature.weakTo, card.category)).toBe(COUNTER_BONUS);
    }
  });
});
