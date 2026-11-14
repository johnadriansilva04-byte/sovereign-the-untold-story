import { describe, expect, it } from "vitest";

import {
  aiStrategy,
  aiTickSide,
  configureAi,
  readBattle,
  trainedAiWeights,
} from "@/game/battle/ai";
import { commanders, startingDeck } from "@/game/battle/catalog";
import { createBattle, deploy, dist, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";

// Config com um chanceler AZUL cativo numa prisão adversária (capacidade do motor,
// hoje não usada pelas missões da campanha — que alternam "defender"/"capturar").
function captiveBlueState() {
  const config = buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-final"),
    deck: startingDeck,
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    seed: 7,
  });
  config.heroSetup = [{ side: "blue", status: "preso", x: 130, y: 46 }];
  config.chancellorMode = "defender";
  config.heroDecisive = true;
  return createBattle(config);
}

describe("IA — frentes de chanceler", () => {
  it("quando o chanceler está preso, a IA monta ofensiva até a prisão e o resgata", () => {
    const state = captiveBlueState();
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    expect(state.heroes.blue.state).toBe("preso");

    configureAi(state, "blue", trainedAiWeights);
    configureAi(state, "red", trainedAiWeights);

    let sawBlueNearPrison = false;
    let sawFreed = false;
    const dt = 0.25;
    for (let i = 0; i < 900 && state.running; i++) {
      aiTickSide(state, "blue", dt);
      aiTickSide(state, "red", dt);
      stepBattle(state, dt);
      if (
        state.blue.units.some((u) => u.alive && !u.hero && dist(u.x, u.y, prison.x, prison.y) < 14)
      )
        sawBlueNearPrison = true;
      if (state.heroes.blue.state === "fugindo") sawFreed = true;
    }
    // A frente "rescue" precisa ter enviado tropa até a prisão e a libertado (o chanceler
    // sai "fugindo"; pode ser recapturado depois, por isso medimos a libertação, não o fim).
    expect(sawBlueNearPrison).toBe(true);
    expect(prison.alive).toBe(false);
    expect(sawFreed).toBe(true);
  }, 120000);

  it("com o chanceler em fuga, a IA o escolta de volta para casa", () => {
    // Só o azul age: aqui medimos a MECÂNICA de extração (escolta + fuga para casa),
    // não o duelo. (A caça ao herói em fuga é coberta em outro teste.)
    const state = captiveBlueState();
    configureAi(state, "blue", trainedAiWeights);
    configureAi(state, "red", trainedAiWeights);

    // Força o resgate (simula a destruição da prisão pelo próprio motor).
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    prison.hp = 1;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", prison.x, prison.y);
    expect(state.heroes.blue.state).toBe("fugindo");

    const dt = 0.25;
    let escorted = false;
    for (let i = 0; i < 600 && state.running; i++) {
      aiTickSide(state, "blue", dt);
      stepBattle(state, dt);
      const heroId = state.heroes.blue.unitId;
      if (state.blue.units.some((u) => u.alive && u.escortId === heroId)) escorted = true;
      if (state.heroes.blue.state === "seguro") break;
    }
    expect(escorted).toBe(true);
    expect(state.heroes.blue.state).toBe("seguro"); // o motor o trouxe para casa
  }, 120000);
});

describe("IA — caça ao chanceler adversário (alvo móvel)", () => {
  it("no modo capturar, a IA azul avança sobre o chanceler vermelho", () => {
    // m-trolls: modo "capturar" — o chanceler ADVERSÁRIO está em campo.
    const config = buildBattleConfig({
      nation: defaultNation,
      mission: missionById("m-trolls"),
      deck: startingDeck,
      commander: commanders[0]!,
      doctrine: commanders[0]!.doctrine,
      seed: 11,
    });
    const state = createBattle(config);
    configureAi(state, "blue", trainedAiWeights);
    configureAi(state, "red", trainedAiWeights);
    const redHero = state.red.units.find((u) => u.hero)!;
    expect(redHero).toBeTruthy();

    let minDist = Infinity;
    const dt = 0.25;
    for (let i = 0; i < 900 && state.running; i++) {
      aiTickSide(state, "blue", dt);
      aiTickSide(state, "red", dt);
      stepBattle(state, dt);
      for (const u of state.blue.units) {
        if (!u.alive || u.hero) continue;
        minDist = Math.min(minDist, dist(u.x, u.y, redHero.x, redHero.y));
      }
      if (!redHero.alive) break;
    }
    // A frente "hunt" deve ter aproximado tropa azul do chanceler vermelho.
    expect(minDist).toBeLessThan(40);
  }, 120000);
});

describe("IA — economia antes de atacar (garantir Sov)", () => {
  it("com caixa baixo e territórios livres, a intenção é EXPANDIR", () => {
    const config = buildBattleConfig({
      nation: defaultNation,
      mission: missionById("m-cidadeviva"),
      deck: startingDeck,
      commander: commanders[0]!,
      doctrine: commanders[0]!.doctrine,
      seed: 5,
    });
    const state = createBattle(config);
    configureAi(state, "blue", trainedAiWeights);
    state.blue.command = 10; // caixa baixo
    const free = state.territories.filter((t) => t.owner === "neutro").length;
    expect(free).toBeGreaterThan(0);
    const strat = aiStrategy(state, "blue", readBattle(state, "blue"), false, trainedAiWeights);
    expect(strat.intent).toBe("expand");
    expect(strat.targetTerritoryId).toBeTruthy();
  });
});
