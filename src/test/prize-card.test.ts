import { describe, expect, it } from "vitest";

import { commanders, startingDeck } from "@/game/battle/catalog";
import { computeResult, createBattle, deploy, prizeConvoy, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import { difficultyById } from "@/game/progress/catalog";

function battleWithPrize(seed: number, prizeCardId = "sup-gas") {
  const mission = missionById("m-apagao");
  const def = difficultyById("recruta");
  const config = buildBattleConfig({
    nation: defaultNation,
    mission,
    deck: startingDeck,
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    aiDifficulty: {
      intervalMult: def.aiIntervalMult,
      commandMult: def.aiCommandMult,
      reserveBonus: def.aiReserveBonus,
    },
    prizeCardId,
    seed,
  });
  return createBattle(config);
}


  // Tropas não podem NASCER em território inimigo: a operação as lança na base aliada
  // e a MARCHA é simulada reposicionando-as no comboio (o que o jogador faria em campo).
  function sendSquadToConvoy(state: ReturnType<typeof battleWithPrize>, n = 3) {
    const home = state.structures.find(
      (s) => s.alive && s.side === "blue" && s.kind === "base-principal",
    )!;
    const prize = state.prize!;
    for (let i = 0; i < n; i++) {
      const before = state.blue.units.length;
      deploy(state, "blue", "inf-fuzileiros", home.x, home.y, {
        x: home.x,
        y: home.y,
        holdAtArrival: false,
        skipRecharge: true,
      });
      if (state.blue.units.length === before) continue;
      const u = state.blue.units[state.blue.units.length - 1]!;
      const ang = (i / n) * Math.PI * 2;
      u.x = prize.x + Math.cos(ang) * 7;
      u.y = prize.y + Math.sin(ang) * 7;
      u.goalX = u.x;
      u.goalY = u.y;
      u.holdAtGoal = true;
    }
  }

describe("carta-prêmio em campo", () => {
  it("o comboio entra em campo com escolta e é invulnerável antes da captura", () => {
    const state = battleWithPrize(1);
    const convoy = prizeConvoy(state);
    expect(convoy).not.toBeNull();
    expect(state.prize?.cardId).toBe("sup-gas");
    expect(state.red.units.filter((u) => u.groupId === "prize-escort").length).toBeGreaterThan(0);

    // Não se ganha a carta destruindo a carga: o comboio é imune ao fogo até ser tomado.
    const hpBefore = convoy!.hp;
    for (let i = 0; i < 200; i++) stepBattle(state, 0.25);
    expect(prizeConvoy(state)?.hp ?? 0).toBe(hpBefore);
    expect(state.prize!.capturedBy).toBeNull();
  });

  it("superioridade numérica cerca e captura o comboio, que passa a seguir para a base", () => {
    const state = battleWithPrize(2);
    sendSquadToConvoy(state, 6);
    for (let i = 0; i < 600 && state.prize!.capturedBy !== "blue"; i++) stepBattle(state, 0.25);

    expect(state.prize!.capturedBy).toBe("blue");
    const convoy = prizeConvoy(state)!;
    expect(convoy.side).toBe("blue");
    expect(convoy.goalX).toBeDefined();
  });

  it("a carga capturada só garante a carta ao CHEGAR na base aliada", () => {
    const state = battleWithPrize(3);
    sendSquadToConvoy(state, 6);
    for (let i = 0; i < 600 && state.prize!.capturedBy !== "blue"; i++) stepBattle(state, 0.25);
    expect(state.prize!.capturedBy).toBe("blue");
    expect(state.prize!.extracted).toBe(false);
    expect(computeResult(state).prizeCardWon).toBeNull();

    // Entrega: ao alcançar a base, o prêmio é confirmado no resultado da operação.
    const home = state.structures.find(
      (s) => s.alive && s.side === "blue" && s.kind === "base-principal",
    )!;
    const convoy = prizeConvoy(state)!;
    convoy.x = home.x;
    convoy.y = home.y;
    stepBattle(state, 0.25);
    expect(state.prize!.extracted).toBe(true);
    expect(computeResult(state).prizeCardWon).toBe("sup-gas");
  });

  it("sem captura, vencer não entrega a carta", () => {
    const state = battleWithPrize(4);
    expect(computeResult(state).prizeCardWon).toBeNull();
  });
});
