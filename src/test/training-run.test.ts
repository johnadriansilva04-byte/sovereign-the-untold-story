import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { defaultAiWeights } from "@/game/battle/ai";
import { evaluateWeights, trainAi } from "@/game/battle/training";

// Script de desenvolvimento: rode com
//   TRAIN_ITERS=... TRAIN_GAMES=... npx vitest run src/test/training-run.test.ts
// e copie os pesos vencedores para ai.ts (trainedAiWeights).
const ITERS = Number(process.env["TRAIN_ITERS"] ?? 400);
const GAMES = Number(process.env["TRAIN_GAMES"] ?? 12);
const RUN_TRAINING = Boolean(process.env["TRAIN_ITERS"]);

describe.skipIf(!RUN_TRAINING)("auto-treino da IA (sob demanda)", () => {
  it("roda o self-play e reporta os melhores pesos", () => {
    const t0 = Date.now();
    const report = trainAi({ iterations: ITERS, gamesPerEval: GAMES, seed: 20260101 });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const games = (ITERS + 1) * GAMES;
    const out = {
      games,
      secs: Number(secs),
      startWinRate: report.startWinRate,
      bestWinRate: report.bestWinRate,
      improvements: report.improvements.length,
      best: report.best,
    };
    try {
      writeFileSync(".agent_tmp/train-report.json", JSON.stringify(out, null, 2));
    } catch {
      /* sem disco: ignora */
    }
    expect(report.totalGames).toBe(games);
    expect(report.bestWinRate).toBeGreaterThanOrEqual(report.startWinRate);
  }, 900000);
});

describe("auto-treino: sanidade", () => {
  it("baseline padrão tem taxa de vitória sã (determinismo)", () => {
    const rate = evaluateWeights(defaultAiWeights, 8, 12345);
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });
});
