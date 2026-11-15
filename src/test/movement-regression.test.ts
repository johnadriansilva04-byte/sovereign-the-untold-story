import { describe, expect, it } from "vitest";

import { aiTick, aiTickSide, configureAi, trainedAiWeights } from "@/game/battle/ai";
import { commanders, startingDeck } from "@/game/battle/catalog";
import { createBattle, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missions } from "@/game/battle/missions";
import type { BattleState } from "@/game/battle/types";

// REGRESSÃO DE MOVIMENTO: as unidades "rodeavam sem rumo" — os ENGENHEIROS, sobretudo,
// oscilavam de um lado para o outro. Medindo a direção do passo a cada quadro (passo REAL
// do jogo, 0,1 s), o defeito aparecia como reversões de sentido: a unidade trocava de rumo
// centenas de vezes numa partida. Duas causas foram corrigidas no motor:
//   1. O engenheiro marchava para a obra SEM atualizar `u.aim`, então a separação removia a
//      componente ERRADA do empurrão (a anti-traseira usava uma mira velha) e o arremessava.
//   2. O contorno de obstáculo esquecia o lado escolhido a cada progresso, invertendo o
//      desvio e prendendo a unidade oscilando na borda do obstáculo.
// Este teste roda TODAS as missões e FALHA se as reversões voltarem ao patamar antigo. O
// limite é folgado de propósito: cobre a regressão real sem depender do balanceamento exato.
const STEP = 0.1; // passo REAL (TICK_MS = 100)
const MAX_REVERSALS = 180; // baseline chegava a ~660 por missão; corrigido, no máx. ~130.

/** Conta as reversões de sentido do passo de cada ENGENHEIRO (o construtor é o alvo do
 * defeito: ele cruza o mapa para erguer bases e era o que mais oscilava). */
function builderReversals(missionId: string, seed: number): number {
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
  const last = new Map<string, { ldx: number; ldy: number }>();
  let reversals = 0;
  const steps = Math.ceil((cfg.duration + 15) / STEP);
  for (let i = 0; i < steps && st.running; i++) {
    aiTickSide(st, "blue", STEP);
    aiTickSide(st, "red", STEP);
    aiTick(st, STEP);
    const before = new Map<string, { x: number; y: number }>();
    for (const side of ["blue", "red"] as const) {
      const c = side === "blue" ? st.blue : st.red;
      for (const u of c.units) if (u.alive && u.builder) before.set(u.id, { x: u.x, y: u.y });
    }
    stepBattle(st, STEP);
    for (const side of ["blue", "red"] as const) {
      const c = side === "blue" ? st.blue : st.red;
      for (const u of c.units) {
        if (!u.alive || !u.builder) continue;
        const b = before.get(u.id);
        if (!b) continue;
        const dx = u.x - b.x;
        const dy = u.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d <= 0.02) continue;
        const prev = last.get(u.id);
        if (prev && (prev.ldx || prev.ldy)) {
          const dot = (dx * prev.ldx + dy * prev.ldy) / (d * Math.hypot(prev.ldx, prev.ldy));
          if (dot < -0.2) reversals += 1;
        }
        last.set(u.id, { ldx: dx, ldy: dy });
      }
    }
  }
  return reversals;
}

describe("regressão: o movimento não oscila (reversões de sentido)", () => {
  for (const m of missions) {
    it(`${m.id} (${m.name})`, () => {
      const reversals = builderReversals(m.id, 9001);
      expect(
        reversals,
        `${m.id}: reversões de engenheiro = ${reversals} (teto ${MAX_REVERSALS})`,
      ).toBeLessThanOrEqual(MAX_REVERSALS);
    });
  }
});
