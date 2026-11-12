import { describe, expect, it } from "vitest";

import { aiTick, aiTickSide, configureAi, trainedAiWeights } from "@/game/battle/ai";
import { commanders, startingDeck } from "@/game/battle/catalog";
import { createBattle, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missions } from "@/game/battle/missions";
import type { BattleState } from "@/game/battle/types";

// REGRESSÃO DE TRAVAMENTO: as unidades empacavam no meio do caminho por equilíbrio entre
// movimento e separação. Este teste roda TODAS as missões da campanha com a IA calibrada
// nos dois lados e FALHA se qualquer unidade ficar sem progredir além do teto do detector
// (2,5 s). É a rede que impede o defeito de voltar silenciosamente.
const STEP = 0.25;
const STALL_LIMIT = 4.0; // acima do teto de 2,5 s + folga: só acusa travamento real

function runMission(missionId: string, seed: number): string[] {
  const cfg = buildBattleConfig({
    nation: defaultNation,
    mission: missions.find((m) => m.id === missionId) ?? missions[0]!,
    deck: startingDeck,
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    seed,
  });
  const st: BattleState = createBattle(cfg);
  configureAi(st, "blue", trainedAiWeights);
  configureAi(st, "red", trainedAiWeights);
  const offenders = new Set<string>();
  const steps = Math.ceil((cfg.duration + 15) / STEP);
  for (let i = 0; i < steps && st.running; i++) {
    aiTickSide(st, "blue", STEP);
    aiTickSide(st, "red", STEP);
    aiTick(st, STEP);
    stepBattle(st, STEP);
    for (const side of ["blue", "red"] as const) {
      const c = side === "blue" ? st.blue : st.red;
      for (const u of c.units) {
        if (u.alive && (u.stall ?? 0) >= STALL_LIMIT) offenders.add(`${side}:${u.model}`);
      }
    }
  }
  return [...offenders];
}

describe("regressão: nenhuma unidade trava no caminho", () => {
  for (const m of missions) {
    it(`${m.id} (${m.name})`, () => {
      const offenders = runMission(m.id, 9001);
      expect(offenders, `${m.id}: unidades travadas > ${STALL_LIMIT}s`).toEqual([]);
    });
  }
});
