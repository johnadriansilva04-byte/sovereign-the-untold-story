import { describe, expect, it } from "vitest";

import { archives, chapters, archiveById } from "@/game/campaign";
import { commanders } from "@/game/battle/catalog";
import {
  buildBattleConfig,
  enemyScalingForChapter,
  premiumCapForChapter,
} from "@/game/battle/missions";
import { chapterMeta, totalChapters } from "@/game/progress/campaign";
import { difficultyForChapter } from "@/game/progress/catalog";
import { missions, chapterMission, missionById } from "@/game/battle/missions";
import { createProfile, applyChapterResult } from "@/game/progress/profile";

describe("campanha expandida: 50 capítulos", () => {
  it("tem exatamente 50 capítulos, capítulos-meta e missões", () => {
    expect(totalChapters).toBe(50);
    expect(chapters.length).toBe(50);
    expect(chapterMeta.length).toBe(50);
    expect(missions.length).toBe(50);
  });

  it("numera os capítulos de 1 a 50, sem buracos nem repetições", () => {
    const nums = chapterMeta.map((m) => m.number);
    expect(nums).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(new Set(nums).size).toBe(50);
  });

  it("liga cada capítulo a uma missão existente, sem missão órfã", () => {
    const missionIds = new Set(missions.map((m) => m.id));
    for (const meta of chapterMeta) {
      expect(missionIds.has(meta.missionId), `missão ausente ${meta.missionId}`).toBe(true);
      expect(chapterMission[meta.id], `sem mapa de missão para ${meta.id}`).toBe(meta.missionId);
      expect(missionById(meta.missionId).id).toBe(meta.missionId);
    }
  });

  it("todo capítulo tem dificuldade válida e desfecho de derrota próprio", () => {
    for (const meta of chapterMeta) {
      // A dificuldade é DERIVADA do número do capítulo (sistema automático único).
      expect(meta.difficulty, `dificuldade divergente no cap. ${meta.number}`).toBe(
        difficultyForChapter(meta.number),
      );
      expect(meta.outroDerrota, `capítulo ${meta.id} sem outroDerrota`).toBeTruthy();
      expect(meta.intro.length).toBeGreaterThan(0);
      expect(meta.outro.length).toBeGreaterThan(0);
    }
  });

  it("encadeia os capítulos (cada um requer o anterior)", () => {
    expect(chapterMeta[0]!.requires).toBeUndefined();
    for (let i = 1; i < chapterMeta.length; i++) {
      expect(chapterMeta[i]!.requires).toBe(chapterMeta[i - 1]!.id);
    }
  });

  it("todo arquivo referenciado existe (sem id órfão)", () => {
    const defined = new Set(archives.map((a) => a.id));
    expect(defined.size).toBe(archives.length); // sem ids duplicados
    for (const ch of chapters) {
      for (const a of ch.archives) {
        expect(defined.has(a), `${ch.id} referencia arquivo ausente ${a}`).toBe(true);
        expect(archiveById(a).id).toBe(a);
      }
    }
  });

  it("cada missão tem terreno, inimigo e objetivo coerentes", () => {
    for (const m of missions) {
      expect(m.terrain.length).toBeGreaterThan(0);
      expect(m.enemyCountry.name.length).toBeGreaterThan(0);
      expect(m.enemyCountry.commanderId.length).toBeGreaterThan(0);
      expect(["territorial", "militar", "operacional"]).toContain(m.objectiveKind);
      if (m.objectiveKind === "operacional") {
        expect(m.operational, `missão operacional ${m.id} sem alvo`).toBeDefined();
      }
    }
  });

  it("vitória no capítulo 49 desbloqueia o capítulo 50", () => {
    const base = createProfile();
    // desbloqueia até o 49 simulando vitórias em cadeia
    let profile = base;
    for (let n = 1; n <= 49; n++) {
      profile = applyChapterResult(profile, {
        chapterId: `c${n}`,
        result: {
          configId: `m-${n}`,
          missionName: `Missão ${n}`,
          outcome: "vitoria",
          duration: 300,
          kills: { blue: 5, red: 1 },
          losses: { blue: 1, red: 5 },
          territorialScore: { blue: 80, red: 20 },
        },
        difficulty: "veterano",
        recordId: `r-${n}`,
        createdAt: "2026-01-01T00:00:00.000Z",
      }).profile;
    }
    expect(profile.chapters["c49"]!.status).toBe("concluido");
    expect(profile.chapters["c50"]!.status).toBe("disponivel");
  });
});

describe("baralho do inimigo: cartas novas desde o primeiro capítulo", () => {
  const blueDeck = createProfile().decks[0]!.cards;

  it("o teto de cartas premium nunca é zero — o espólio existe desde o cap. 1", () => {
    for (const n of [1, 5, 17, 34, 50]) {
      expect(premiumCapForChapter(n), `cap ${n} sem carta nova`).toBeGreaterThanOrEqual(1);
    }
  });

  it("o inimigo traz pelo menos uma carta que o jogador não possui, em todo capítulo", () => {
    const owned = ["inf-fuzileiros", "inf-assalto", "inf-engenheiro", "rec-drone", "sup-gas", "art-canhao", "bld-vbld", "inf-antitanque"];
    for (const meta of chapterMeta) {
      const scale = enemyScalingForChapter(meta.number);
      const config = buildBattleConfig({
        nation: createProfile().nation,
        mission: missionById(meta.missionId),
        chapterNumber: meta.number,
        deck: blueDeck,
        ownedCardIds: owned,
        commander: commanders[0]!,
        doctrine: commanders[0]!.doctrine,
        seed: 1,
      });
      const novas = config.red.deck.filter((c) => !owned.includes(c));
      expect(novas.length, `cap ${meta.number} sem carta nova no deck inimigo`).toBeGreaterThan(0);
      // As cartas novas são o espólio de guerra: precisam estar marcadas como tal.
      for (const c of novas) expect(config.bountyCardIds ?? []).toContain(c);
    }
  });

  it("o teto de cartas novas cresce com o capítulo (elite no fim, não no início)", () => {
    expect(premiumCapForChapter(1)).toBeLessThan(premiumCapForChapter(50));
    expect(premiumCapForChapter(50)).toBeLessThanOrEqual(3);
  });
});
