import { describe, expect, it } from "vitest";

import { commanders, startingDeck } from "@/game/battle/catalog";
import {
  captureProgress,
  computeResult,
  createBattle,
  deploy,
  prizeCarrier,
  startCapture,
  stepBattle,
} from "@/game/battle/engine";
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

// Lança fuzileiros (tropas com capacidade de prender) colados ao comboio e emite a ordem
// de captura — o mesmo caminho que o jogador usa em campo.
function armCapture(state: ReturnType<typeof battleWithPrize>, n = 3) {
  const carrier = prizeCarrier(state)!;
  state.blue.command = 100000;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const before = state.blue.units.length;
    deploy(state, "blue", "inf-fuzileiros", carrier.x, carrier.y, {
      x: carrier.x,
      y: carrier.y,
      holdAtArrival: false,
      skipRecharge: true,
    });
    if (state.blue.units.length === before) continue;
    const u = state.blue.units[state.blue.units.length - 1]!;
    const ang = (i / n) * Math.PI * 2;
    u.x = carrier.x + Math.cos(ang) * 4;
    u.y = carrier.y + Math.sin(ang) * 4;
    u.hp = 8000; // resiste ao fogo do comboio durante a carga (o teste isola a captura)
    ids.push(u.id);
  }
  return { carrier, ids };
}

describe("carta nova em campo", () => {
  it("o comboio adversário entra em campo marcado como alvo de captura", () => {
    const state = battleWithPrize(1);
    const carrier = prizeCarrier(state);
    expect(carrier).not.toBeNull();
    expect(carrier!.side).toBe("red");
    expect(carrier!.captureTarget).toBe(true);
    expect(state.prize?.cardId).toBe("sup-gas");
    expect(captureProgress(state, "blue")).toBe(0);
  });

  it("sem captura, abater o comboio PERDE a carta", () => {
    const state = battleWithPrize(2);
    const carrier = prizeCarrier(state)!;
    carrier.alive = false;
    stepBattle(state, 0.25);
    expect(state.prize!.lost).toBe(true);
    expect(state.prize!.extracted).toBe(false);
    expect(computeResult(state).prizeCardWon).toBeNull();
  });

  it("cercar e prender o comboio cria o carro-prisão que conduz a carta à base", () => {
    const state = battleWithPrize(3);
    const { carrier, ids } = armCapture(state, 4);
    expect(startCapture(state, "blue", ids, carrier.id)).toBe(true);

    for (let i = 0; i < 400 && !state.prize!.captured; i++) {
      // Segura o comboio no lugar: sem isto ele marcha para o centro e escapa da carga.
      const c = prizeCarrier(state);
      if (c) {
        c.x = carrier.x;
        c.y = carrier.y;
        c.goalX = carrier.x;
        c.goalY = carrier.y;
      }
      stepBattle(state, 0.25);
    }
    expect(state.prize!.captured).toBe(true);
    expect(state.prize!.extracted).toBe(false);
    expect(computeResult(state).prizeCardWon).toBeNull();

    // O carro-prisão nasce no lado azul e segue para a base.
    const car = state.blue.units.find((u) => u.prisonCar && u.alive);
    expect(car).toBeDefined();

    // Entrega: ao alcançar a base, a carta é garantida no resultado da operação.
    const home = state.structures.find(
      (s) => s.alive && s.side === "blue" && s.kind === "base-principal",
    )!;
    car!.x = home.x;
    car!.y = home.y;
    stepBattle(state, 0.25);
    expect(state.prize!.extracted).toBe(true);
    expect(computeResult(state).prizeCardWon).toBe("sup-gas");
  });

  it("sem captura, vencer não entrega a carta", () => {
    const state = battleWithPrize(4);
    expect(computeResult(state).prizeCardWon).toBeNull();
  });
});
