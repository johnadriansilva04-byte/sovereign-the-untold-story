import { describe, expect, it } from "vitest";

import { aiTick, aiTickSide, configureAi, trainedAiWeights } from "@/game/battle/ai";
import { commanders } from "@/game/battle/catalog";
import { computeResult, createBattle, stepBattle } from "@/game/battle/engine";
import {
  buildBattleConfig,
  enemyScalingForChapter,
  missionById,
} from "@/game/battle/missions";
import type { BattleOutcome } from "@/game/battle/types";
import { chapterMeta, chapterMetaById } from "@/game/progress/campaign";
import {
  applyChapterResult,
  createProfile,
  effectiveDeck,
  effectiveDoctrine,
  effectiveMods,
  ownedCardIds,
  type ProfileState,
} from "@/game/progress/profile";

// E2E da campanha: percorre os 50 capítulos usando o MOTOR REAL (createBattle/stepBattle)
// com a IA calibrada jogando o lado azul — o mesmo caminho do jogador. Cada vitória
// libera o próximo capítulo. Determinístico e limitado para caber no CI.
const STEP = 0.3;
const MAX_STEPS = 2600; // ~780 s de jogo por tentativa
const MAX_ATTEMPTS = 5;

function playChapter(profile: ProfileState, chapterId: string, seed: number): BattleOutcome {
  const meta = chapterMetaById(chapterId)!;
  const mission = missionById(meta.missionId);
  const deck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
  const commander = commanders.find((c) => c.id === deck?.commanderId) ?? commanders[0]!;
  const config = buildBattleConfig({
    nation: profile.nation,
    mission,
    // Caminho REAL da campanha: o número do capítulo define baralho, nível e IA.
    chapterNumber: meta.number,
    deck: effectiveDeck(profile),
    commander,
    doctrine: effectiveDoctrine(profile, chapterId, deck?.doctrine ?? commander.doctrine),
    mods: effectiveMods(profile, chapterId),
    cardLevels: profile.cardLevels,
    ownedCardIds: ownedCardIds(profile),
    aiDifficulty: enemyScalingForChapter(meta.number).aiDifficulty,
    seed: seed >>> 0,
  });
  const state = createBattle(config);
  configureAi(state, "blue", trainedAiWeights);
  let guard = 0;
  while (state.running && guard < MAX_STEPS) {
    aiTickSide(state, "blue", STEP);
    aiTick(state, STEP);
    stepBattle(state, STEP);
    guard++;
  }
  return computeResult(state).outcome;
}

describe("E2E: campanha inteira (50 capítulos)", () => {
  it("zera os 50 capítulos com o motor real e libera o seguinte a cada vitória", () => {
    let profile = createProfile();
    const played: number[] = [];

    for (const meta of chapterMeta) {
      // O capítulo precisa estar disponível (encadeamento c1→c50).
      expect(profile.chapters[meta.id]?.status, `cap ${meta.number} não liberado`).not.toBe(
        "bloqueado",
      );

      // Uma vitória basta para avançar; o laço só existe para tolerar empates/derrotas.
      let outcome: BattleOutcome = "derrota";
      for (let attempt = 0; attempt < MAX_ATTEMPTS && outcome !== "vitoria"; attempt++) {
        outcome = playChapter(profile, meta.id, 1000 + meta.number * 131 + attempt * 7919);
      }
      expect(outcome, `cap ${meta.number} não foi vencido`).toBe("vitoria");
      played.push(meta.number);

      const { profile: next } = applyChapterResult(profile, {
        chapterId: meta.id,
        result: {
          configId: meta.missionId,
          missionName: missionById(meta.missionId).name,
          outcome,
          duration: 300,
          kills: { blue: 10, red: 2 },
          losses: { blue: 2, red: 10 },
          territorialScore: { blue: 85, red: 15 },
          prizeCardWon: meta.reward.cards?.[0] ?? null,
        },
        difficulty: meta.difficulty,
        recordId: `e2e-${meta.id}`,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      profile = next;
    }

    // Os 50 foram jogados e concluídos, e o último não desbloqueia nada além do fim.
    expect(played).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    for (const meta of chapterMeta) {
      expect(profile.chapters[meta.id]?.status, `cap ${meta.number}`).toBe("concluido");
    }
    // A campanha concede cartas no caminho (progressão real de arsenal).
    const owned = Object.values(profile.inventory.cards).filter((n) => n > 0).length;
    expect(owned).toBeGreaterThan(8);
  }, 300000);
});
