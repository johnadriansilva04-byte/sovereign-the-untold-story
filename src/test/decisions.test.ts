import { describe, expect, it } from "vitest";

import { commanders, doctrines, startingDeck } from "@/game/battle/catalog";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import { chapterMeta } from "@/game/progress/campaign";
import { allDecisions, decisionFor, decisionOption, mergeMods } from "@/game/progress/decisions";
import { createProfile, effectiveDoctrine, effectiveMods } from "@/game/progress/profile";

describe("dilemas de comando da campanha", () => {
  it("todo capítulo tem um dilema com pelo menos duas opções", () => {
    for (const meta of chapterMeta) {
      const decision = decisionFor(meta.id);
      expect(decision, `capítulo ${meta.id} sem dilema`).toBeTruthy();
      expect(decision!.options.length).toBeGreaterThanOrEqual(2);
      expect(decision!.prompt.length).toBeGreaterThan(0);
    }
    expect(allDecisions.length).toBe(chapterMeta.length);
  });

  it("os ids das opções são únicos e cada opção produz efeito real", () => {
    const ids = new Set<string>();
    for (const decision of allDecisions) {
      for (const opt of decision.options) {
        expect(ids.has(opt.id), `id repetido ${opt.id}`).toBe(false);
        ids.add(opt.id);
        const { doctrine, mods, research, sovereigns } = opt.effect;
        const hasMod = Boolean(
          mods &&
          (mods.commandMax ||
            mods.capture ||
            mods.sight ||
            Object.keys(mods.dmg ?? {}).length ||
            Object.keys(mods.hp ?? {}).length ||
            Object.keys(mods.speed ?? {}).length),
        );
        expect(
          Boolean(doctrine || hasMod || research || sovereigns),
          `opção ${opt.id} sem efeito`,
        ).toBe(true);
        if (doctrine) expect(doctrines[doctrine], `doutrina inválida ${doctrine}`).toBeTruthy();
      }
    }
  });

  it("a escolha muda a doutrina efetiva aplicada à batalha", () => {
    const profile = createProfile();
    // capítulo 1, opção A troca a doutrina para Mobilidade
    profile.decisions["c1"] = "c1-a";
    expect(effectiveDoctrine(profile, "c1", "Operações combinadas")).toBe("Mobilidade");
    // capítulo 2, opção A usa Defesa territorial
    profile.decisions["c2"] = "c2-a";
    expect(effectiveDoctrine(profile, "c2", "Operações combinadas")).toBe("Defesa territorial");
    // sem escolha, mantém a doutrina do baralho
    expect(effectiveDoctrine(profile, "c3", "Mobilidade")).toBe("Mobilidade");
  });

  it("a escolha soma modificadores reais ao lado azul da config de batalha", () => {
    const profile = createProfile();
    profile.decisions["c2"] = "c2-a"; // +12% vida infantaria, +3 energia
    const mods = effectiveMods(profile, "c2");
    expect(mods.hp?.infantaria).toBeCloseTo(0.12);
    expect(mods.commandMax).toBe(3);

    const config = buildBattleConfig({
      nation: defaultNation,
      mission: missionById("m-blecaute"),
      deck: startingDeck,
      commander: commanders[0]!,
      doctrine: effectiveDoctrine(profile, "c2", "Operações combinadas"),
      mods,
      seed: 1,
    });
    expect(config.blue.doctrine).toBe("Defesa territorial");
    expect(config.blue.mods?.hp?.infantaria).toBeCloseTo(0.12);
    // a energia máxima da força sobe pelo modificador
    expect(config.blue.commandMax).toBeGreaterThan(10);
  });

  it("mergeMods soma categoria a categoria sem perder nada", () => {
    const merged = mergeMods(
      { hp: { infantaria: 0.1 }, commandMax: 2, capture: 0.1 },
      { hp: { infantaria: 0.05, blindado: 0.2 }, sight: 0.3, commandMax: 1 },
    );
    expect(merged.hp?.infantaria).toBeCloseTo(0.15);
    expect(merged.hp?.blindado).toBeCloseTo(0.2);
    expect(merged.commandMax).toBe(3);
    expect(merged.capture).toBeCloseTo(0.1);
    expect(merged.sight).toBeCloseTo(0.3);
  });

  it("decisionOption devolve a opção certa ou undefined", () => {
    expect(decisionOption("c1", "c1-b")?.tag).toBe("prudente");
    expect(decisionOption("c1", "inexistente")).toBeUndefined();
    expect(decisionOption("cx", "c1-a")).toBeUndefined();
  });
});
