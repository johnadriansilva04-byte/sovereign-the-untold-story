import { describe, expect, it } from "vitest";

import {
  battleConfigForChapter,
  chapterMeta,
  chapterMetaById,
  chapterOutro,
} from "@/game/progress/campaign";
import { computeResult, runToCompletion } from "@/game/battle/engine";
import { consequencesOf, missionById } from "@/game/battle/missions";
import {
  addCard,
  difficulties,
  difficultyById,
  emptyInventory,
  missionDifficulty,
  modsFromAccessories,
  ownsCard,
  removeCard,
  unlockTiers,
} from "@/game/progress/catalog";
import {
  applyChapterResult,
  cardLevelsForDeck,
  createProfile,
  effectiveDeck,
  grantReward,
  isCardUnlocked,
  ownedCardIds,
  syncUnlocks,
} from "@/game/progress/profile";
import { buildPvpConfig, localOpponents, pvpModeById, resolveStakes } from "@/game/progress/pvp";
import { buildCommanderPrompt, parseCommanderDecision } from "@/game/battle/llm";
import {
  allCards,
  cardLevelMultiplier,
  CARD_MAX_LEVEL,
  commanders,
  copiesToLevel,
} from "@/game/battle/catalog";

describe("progressão: inventário", () => {
  it("começa com 8 cartas e um baralho válido de 8", () => {
    const p = createProfile();
    expect(ownedCardIds(p).length).toBeGreaterThanOrEqual(8);
    expect(effectiveDeck(p).length).toBe(8);
  });

  it("adiciona e remove cartas sem ficar negativo", () => {
    let inv = emptyInventory();
    inv = addCard(inv, "inf-fuzileiros", 2);
    expect(ownsCard(inv, "inf-fuzileiros")).toBe(true);
    inv = removeCard(inv, "inf-fuzileiros", 5);
    expect(ownsCard(inv, "inf-fuzileiros")).toBe(false);
  });

  it("concede recompensa e registra cartas novas", () => {
    const p = createProfile();
    const next = grantReward(p, { cards: ["bld-tanque"], research: 25, sovereigns: 100 });
    expect(ownsCard(next.inventory, "bld-tanque")).toBe(true);
    expect(next.research).toBe(p.research + 25);
    expect(next.sovereigns).toBe(p.sovereigns + 100);
  });
});

describe("progressão: acessórios e dificuldade", () => {
  it("combina modificadores de acessórios", () => {
    const mods = modsFromAccessories(["acc-radio", "acc-observacao"]);
    expect(mods.commandMax ?? 0).toBeGreaterThan(0);
    expect(mods.sight ?? 0).toBeGreaterThan(0);
  });

  it("a IA fica mais agressiva com dificuldade maior", () => {
    const recruta = difficultyById("recruta");
    const soberano = difficultyById("soberano");
    expect(soberano.aiIntervalMult).toBeLessThan(recruta.aiIntervalMult);
    expect(difficulties.find((d) => d.id === "llm")?.isLlm).toBe(true);
  });

  it("todas as missões têm dificuldade definida", () => {
    for (const [, d] of Object.entries(missionDifficulty)) {
      expect(difficultyById(d).id).toBe(d);
    }
  });
});

describe("campanha: aplicação de resultado (pura)", () => {
  const baseResult = (outcome: "vitoria" | "derrota" | "empate") => ({
    configId: "m-apagao",
    missionName: "Operação Apagão",
    outcome,
    duration: 300,
    kills: { blue: 5, red: 2 },
    losses: { blue: 2, red: 5 },
    territorialScore: { blue: 70, red: 30 },
  });

  it("vitória concede recompensa e desbloqueia o próximo capítulo", () => {
    const profile = createProfile();
    const before = profile.sovereigns;
    const { profile: next, reward } = applyChapterResult(profile, {
      chapterId: "c1",
      result: baseResult("vitoria"),
      difficulty: "recruta",
      recordId: "r-test-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(next.chapters["c1"]!.status).toBe("concluido");
    expect(next.chapters["c2"]!.status).toBe("disponivel");
    expect(next.sovereigns).toBe(before + (reward.sovereigns ?? 0));
    expect(next.records[0]!.rewards).toEqual(reward);
  });

  it("derrota não concede recompensa, não desbloqueia e registra sem recompensas", () => {
    const profile = createProfile();
    const before = profile.sovereigns;
    const { profile: next } = applyChapterResult(profile, {
      chapterId: "c1",
      result: baseResult("derrota"),
      difficulty: "recruta",
      recordId: "r-test-2",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(next.chapters["c1"]!.status).toBe("disponivel");
    expect(next.chapters["c2"]!.status).toBe("bloqueado");
    expect(next.sovereigns).toBe(before);
    expect(next.records[0]!.rewards).toEqual({});
  });
});

describe("campanha: narrativa de desfecho", () => {
  it("nunca mostra a narrativa de vitória depois de uma derrota", () => {
    const profile = createProfile();
    const cfg = battleConfigForChapter("c1", profile, 5)!;
    const meta = chapterMetaById("c1")!;
    const state = runToCompletion(cfg);
    const result = computeResult(state);
    const texto = chapterOutro(meta, result.outcome);
    expect(texto.length).toBeGreaterThan(0);
    if (result.outcome !== "vitoria") {
      expect(texto).not.toBe(meta.outro);
      expect(texto).toBe(meta.outroDerrota);
    } else {
      expect(texto).toBe(meta.outro);
    }
  });

  it("todos os capítulos têm desfecho de derrota próprio", () => {
    for (const meta of chapterMeta) {
      expect(meta.outroDerrota, `capítulo ${meta.id} sem outroDerrota`).toBeTruthy();
    }
  });
});

describe("campanha: configuração de batalha por capítulo", () => {
  it("gera config com mods e dificuldade aplicados", () => {
    const profile = createProfile();
    const cfg = battleConfigForChapter("c1", profile);
    expect(cfg).not.toBeNull();
    expect(cfg!.blue.deck.length).toBe(8);
    expect(cfg!.aiDifficulty).toBeDefined();
    expect(cfg!.blue.mods).toBeDefined();
  });

  it("uma batalha de capítulo corre até o fim e gera consequência para a guerra", () => {
    const profile = createProfile();
    const cfg = battleConfigForChapter("c1", profile, 11)!;
    const state = runToCompletion(cfg);
    const result = computeResult(state);
    expect(state.running).toBe(false);
    expect(["vitoria", "derrota", "empate"]).toContain(result.outcome);
    expect(result.configId).toBe(cfg.id);

    const consequence = consequencesOf(result, missionById(cfg.id));
    expect(consequence).toBeDefined();
    // a consequência mexe em números reais do estado de guerra
    const touched = [
      consequence.militaryDelta,
      consequence.stabilityDelta,
      consequence.influenceDelta,
      consequence.losses,
      consequence.equipmentLost,
    ].some((v) => v !== 0);
    expect(touched).toBe(true);
  });
});

describe("PvP: apostas e configuração", () => {
  it("resolve vitória tomando cartas do adversário", () => {
    const res = resolveStakes("vitoria", "aposta", ["a", "b", "c"], ["x", "y", "z"]);
    expect(res.won).toBe(true);
    expect(res.gainedCards).toEqual(["x", "y", "z"]);
    expect(res.lostCards).toEqual([]);
  });

  it("resolve derrota perdendo as cartas apostadas", () => {
    const res = resolveStakes("derrota", "aposta", ["a", "b", "c"], ["x", "y", "z"]);
    expect(res.won).toBe(false);
    expect(res.lostCards).toEqual(["a", "b", "c"]);
    expect(res.gainedCards).toEqual([]);
  });

  it("empate não transfere cartas", () => {
    const res = resolveStakes("empate", "aposta", ["a", "b", "c"], ["x", "y", "z"]);
    expect(res.lostCards).toEqual([]);
    expect(res.gainedCards).toEqual([]);
  });

  it("modo equilibrado nunca arrisca cartas", () => {
    expect(pvpModeById("equilibrado").stakeCards).toBe(0);
  });

  it("monta config PvP com dois lados válidos", () => {
    const profile = createProfile();
    const cfg = buildPvpConfig({
      profile,
      deck: effectiveDeck(profile),
      accessories: [],
      commander: commanders[0]!,
      doctrine: "Operações combinadas",
      opponentName: "Teste",
      opponentFlag: "⚙️",
      opponentCommander: commanders[1]!,
      opponentDoctrine: "Mecanizada",
      opponentDeck: effectiveDeck(profile),
      difficulty: "elite",
      terrain: "Cidade",
      seed: 42,
    });
    expect(cfg.blue.deck.length).toBe(8);
    expect(cfg.red.deck.length).toBe(8);
    expect(cfg.arena.controlPoints.length).toBeGreaterThan(0);
  });

  it("oferece adversários locais jogáveis offline", () => {
    const ops = localOpponents(createProfile());
    expect(ops.length).toBeGreaterThanOrEqual(3);
    for (const o of ops) expect(o.deck.length).toBe(8);
  });
});

describe("comandante LLM: contrato de decisão", () => {
  it("gera prompt com estado e cartas legais", () => {
    const prompt = buildCommanderPrompt({
      commanderName: "Gen. Teste",
      personality: "Agressivo",
      doctrine: "Poder de fogo",
      objective: "Dominar os pontos de controle.",
      timeLeft: 120,
      command: 7,
      commandMax: 10,
      score: 45,
      hand: [{ id: "inf-fuzileiros", name: "Fuzileiros", category: "infantaria", cost: 3 }],
      controlPoints: [],
      visibleEnemies: [],
      ownUnits: [],
      deployZone: { x: 0, y: 80, w: 100, h: 20 },
      recentLog: [],
      legalCardIds: ["inf-fuzileiros", "bld-vbld"],
    });
    expect(prompt).toContain("inf-fuzileiros");
  });

  it("aceita decisão válida e rejeita carta ilegal", () => {
    const ok = parseCommanderDecision(
      '{"cardId":"bld-vbld","x":50,"y":20,"reason":"romper o flanco"}',
      ["inf-fuzileiros", "bld-vbld"],
    );
    expect(ok?.cardId).toBe("bld-vbld");

    const bad = parseCommanderDecision('{"cardId":"nao-existe","x":50,"y":20}', [
      "inf-fuzileiros",
      "bld-vbld",
    ]);
    expect(bad).toBeNull();
  });

  it("degrada com segurança quando a resposta não é JSON", () => {
    const res = parseCommanderDecision("desculpe, não posso ajudar", ["inf-fuzileiros"]);
    expect(res).toBeNull();
  });
});

describe("progressão: níveis de carta e faixas de desbloqueio", () => {
  it("o multiplicador de nível escala com o nível e satura no máximo", () => {
    expect(cardLevelMultiplier(1)).toBe(1);
    expect(cardLevelMultiplier(5)).toBeGreaterThan(cardLevelMultiplier(1));
    expect(cardLevelMultiplier(99)).toBe(cardLevelMultiplier(CARD_MAX_LEVEL));
  });

  it("cada nível exige uma quantidade crescente de cópias", () => {
    expect(copiesToLevel(1)).toBeGreaterThan(0);
    expect(copiesToLevel(5)).toBeGreaterThan(copiesToLevel(1));
  });

  it("as faixas cobrem todas as cartas do catálogo, sem duplicatas", () => {
    const seen = new Set<string>();
    for (const t of unlockTiers) {
      for (const id of t.cards) {
        expect(allCards.some((c) => c.id === id)).toBe(true);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    for (const c of allCards) expect(seen.has(c.id)).toBe(true);
  });

  it("syncUnlocks libera as cartas da faixa inicial na coleção", () => {
    const p = createProfile();
    const before = Object.keys(p.inventory.cards).length;
    const synced = syncUnlocks(p);
    expect(Object.keys(synced.inventory.cards).length).toBeGreaterThanOrEqual(before);
    expect(synced.inventory.cards["sup-barricada"]).toBeGreaterThan(0);
    expect(isCardUnlocked(synced, "sup-barricada")).toBe(true);
  });

  it("cartas de faixa alta ficam bloqueadas para um comandante iniciante", () => {
    const p = createProfile();
    expect(isCardUnlocked(p, "sup-bombardeiro")).toBe(false);
    const leveled = { ...p, xp: 3000 };
    expect(isCardUnlocked(leveled, "sup-bombardeiro")).toBe(true);
  });

  it("cardLevelsForDeck devolve um nível por carta do baralho ativo", () => {
    const p = createProfile();
    const levels = cardLevelsForDeck(p);
    expect(Object.keys(levels).length).toBe(effectiveDeck(p).length);
    for (const v of Object.values(levels)) expect(v).toBeGreaterThanOrEqual(1);
  });

  it("o nível do baralho é levado para a config de batalha", () => {
    const p = { ...createProfile(), cardLevels: { "inf-fuzileiros": 7 } };
    const config = battleConfigForChapter("c1", p);
    expect(config?.blue.cardLevels?.["inf-fuzileiros"]).toBe(7);
  });
});
