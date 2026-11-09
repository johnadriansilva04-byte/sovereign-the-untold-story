import { describe, expect, it } from "vitest";

import { aiTick, aiTickSide, configureAi, trainedAiWeights } from "@/game/battle/ai";
import { commanders, startingDeck } from "@/game/battle/catalog";
import { computeResult, createBattle, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import { difficultyById, type Difficulty } from "@/game/progress/catalog";

// O "jogador" é a própria IA calibrada (mesmos pesos dos dois lados). A única variável é
// a dificuldade do vermelho. O vermelho joga pelo caminho REAL (`aiTick`), que aplica
// também a velocidade de decisão (`intervalMult`) — usar `aiTickSide` para o vermelho
// ignoraria essa alavanca e mediria só a economia.
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
    const dt = 0.25;
    let guard = 0;
    while (state.running && guard < Math.ceil((config.duration + 20) / dt)) {
      aiTickSide(state, "blue", dt);
      aiTick(state, dt);
      stepBattle(state, dt);
      guard++;
    }
    if (computeResult(state).outcome === "vitoria") wins += 1;
  }
  return wins / games;
}

describe("IA: curva de dificuldade", () => {
  it("Recruta é mais fácil de vencer que Soberano", () => {
    const games = 16;
    const recruta = winRateVs("recruta", games, 1000);
    const soberano = winRateVs("soberano", games, 1000);

    expect(soberano).toBeLessThanOrEqual(recruta);
  });

  it("nenhum nível é imbatível: o azul vence em todos os degraus", () => {
    // Regressão: a dificuldade não pode virar um "botão de vitória" (economia que
    // compra o resultado). Todo degrau precisa ser vencível — inclusive o Soberano,
    // que já foi invencível (0%) quando a economia da IA era ajustada com força.
    for (const d of ["recruta", "veterano", "elite", "soberano"] as Difficulty[]) {
      expect(winRateVs(d, 20, 1000)).toBeGreaterThan(0);
    }
  });

  it("Soberano é um adversário competitivo (o azul não domina)", () => {
    const rate = winRateVs("soberano", 20, 40000);
    expect(rate).toBeLessThan(0.75);
  });
});
