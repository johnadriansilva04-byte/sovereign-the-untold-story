import { describe, expect, it } from "vitest";

import { aiTickSide, configureAi, trainedAiWeights } from "@/game/battle/ai";
import { commanders, startingDeck } from "@/game/battle/catalog";
import { computeResult, createBattle, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import { difficultyById, type Difficulty } from "@/game/progress/catalog";

// O "jogador" é a própria IA calibrada (mesmos pesos dos dois lados). A única variável é
// a dificuldade do vermelho. Esperamos: quanto mais difícil, menor a taxa de vitória do azul.
function winRateVs(difficulty: Difficulty, games: number, seedBase: number): number {
  const def = difficultyById(difficulty);
  const mission = missionById("m-apagao");
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const config = buildBattleConfig({
      nation: defaultNation,
      mission,
      deck: startingDeck,
      commander: commanders[0]!,
      doctrine: commanders[0]!.doctrine,
      seed: (seedBase + i * 7919) >>> 0,
      aiDifficulty: {
        intervalMult: def.aiIntervalMult,
        commandMult: def.aiCommandMult,
        reserveBonus: def.aiReserveBonus,
      },
    });
    const state = createBattle(config);
    configureAi(state, "blue", trainedAiWeights);
    configureAi(state, "red", trainedAiWeights);
    const dt = 0.25;
    let guard = 0;
    while (state.running && guard < Math.ceil((config.duration + 20) / dt)) {
      aiTickSide(state, "blue", dt);
      aiTickSide(state, "red", dt);
      stepBattle(state, dt);
      guard++;
    }
    if (computeResult(state).outcome === "vitoria") wins += 1;
  }
  return wins / games;
}

describe("IA: curva de dificuldade", () => {
  it("Recruta é mais fácil de vencer que Soberano", () => {
    const games = 12;
    const recruta = winRateVs("recruta", games, 1000);
    const soberano = winRateVs("soberano", games, 1000);
    // eslint-disable-next-line no-unused-expressions
    expect(soberano).toBeLessThanOrEqual(recruta);
  });

  it("Soberano é um adversário competitivo (o azul não domina)", () => {
    const rate = winRateVs("soberano", 20, 40000);
    expect(rate).toBeLessThan(0.75);
  });
});
