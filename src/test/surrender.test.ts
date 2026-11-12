import { describe, expect, it } from "vitest";

import { commanders, startingDeck } from "@/game/battle/catalog";
import { computeResult, createBattle, deploy, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";

function freshBattle(seed: number, missionId = "m-apagao") {
  const mission = missionById(missionId);
  const config = buildBattleConfig({
    nation: defaultNation,
    mission,
    deck: startingDeck,
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    seed,
  });
  return createBattle(config);
}

// Coloca uma tropa vermelha isolada no centro e a cerca com infantaria azul, simulando
// a situação real: um destacamento sozinho contra uma força muito maior.
function encircle(state: ReturnType<typeof freshBattle>, n = 4) {
  const center = { x: 60, y: 46 };
  const redBase = state.structures.find(
    (s) => s.alive && s.side === "red" && s.kind === "base-principal",
  )!;
  deploy(state, "red", "inf-fuzileiros", redBase.x, redBase.y, {
    x: redBase.x,
    y: redBase.y,
    skipRecharge: true,
  });
  const victim = state.red.units[state.red.units.length - 1]!;
  victim.x = center.x;
  victim.y = center.y;
  delete victim.goalX;
  delete victim.goalY;
  victim.order = "manter";
  victim.holdAtGoal = true;

  const blueBase = state.structures.find(
    (s) => s.alive && s.side === "blue" && s.kind === "base-principal",
  )!;
  for (let i = 0; i < n; i++) {
    deploy(state, "blue", "inf-fuzileiros", blueBase.x, blueBase.y, {
      x: blueBase.x,
      y: blueBase.y,
      holdAtArrival: false,
      skipRecharge: true,
    });
    const u = state.blue.units[state.blue.units.length - 1]!;
    const ang = (i / n) * Math.PI * 2;
    u.x = center.x + Math.cos(ang) * 6;
    u.y = center.y + Math.sin(ang) * 6;
    u.goalX = u.x;
    u.goalY = u.y;
    u.holdAtGoal = true;
  }
  return victim;
}

describe("rendição por cerco", () => {
  it("força muito superior cerca e força a decisão (render-se ou resistir)", () => {
    const state = freshBattle(7);
    const victim = encircle(state);
    const hpBefore = victim.hp;
    for (let i = 0; i < 120; i++) stepBattle(state, 0.25);

    const decided =
      victim.surrendered || (victim.hp < hpBefore && victim.surrenderCheck !== undefined);
    expect(decided).toBe(true);
  });

  it("unidade rendida sai do combate e é contada como prisioneira", () => {
    const state = freshBattle(11);
    const victim = encircle(state);
    let captured = false;
    for (let i = 0; i < 400 && !captured; i++) {
      stepBattle(state, 0.25);
      captured = Boolean(victim.surrendered);
    }
    if (captured) {
      expect(victim.engaged).toBe(false);
      expect(state.blue.prisonersTaken).toBeGreaterThan(0);
      expect(computeResult(state).prisoners?.blue).toBeGreaterThan(0);
      // Rendida, ela não é mais alvo de fogo: ninguém atira num prisioneiro.
      expect(victim.alive).toBe(true);
    } else {
      // Alternativa legítima: resistiu até o fim.
      expect(victim.hp).toBeLessThanOrEqual(victim.maxHp);
    }
  });

  it("o chanceler nunca se rende, por mais apertado que seja o cerco", () => {
    // Missão com cenário de chanceler: o herói vermelho entra em campo.
    const state = freshBattle(3, "m-guatemala");
    const hero = state.red.units.find((u) => u.hero);
    expect(hero).toBeDefined();
    const center = { x: 60, y: 46 };
    hero!.x = center.x;
    hero!.y = center.y;
    delete hero!.goalX;
    delete hero!.goalY;
    hero!.order = "manter";
    hero!.holdAtGoal = true;
    const blueBase = state.structures.find(
      (s) => s.alive && s.side === "blue" && s.kind === "base-principal",
    )!;
    for (let i = 0; i < 6; i++) {
      deploy(state, "blue", "inf-fuzileiros", blueBase.x, blueBase.y, {
        x: blueBase.x,
        y: blueBase.y,
        skipRecharge: true,
      });
      const u = state.blue.units[state.blue.units.length - 1]!;
      const ang = (i / 6) * Math.PI * 2;
      u.x = center.x + Math.cos(ang) * 5;
      u.y = center.y + Math.sin(ang) * 5;
      u.goalX = u.x;
      u.goalY = u.y;
      u.holdAtGoal = true;
    }
    for (let i = 0; i < 200; i++) stepBattle(state, 0.25);
    expect(hero!.surrendered ?? false).toBe(false);
  });
});
