import { describe, expect, it } from "vitest";

import { aiTickSide, configureAi, trainedAiWeights } from "@/game/battle/ai";
import { commanders, startingDeck } from "@/game/battle/catalog";
import { computeResult, createBattle, deploy, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import { allCards } from "@/game/battle/catalog";

// Espólio de guerra: cartas que o adversário traz e o jogador NÃO possui viram alvo
// prioritário. Abater a unidade que as porta rende a carta (uma vez por operação).
function battleWithOwned(owned: string[]) {
  const mission = missionById("m-guerra-eletronica") ?? missionById("m-apagao");
  const config = buildBattleConfig({
    nation: defaultNation,
    mission,
    deck: startingDeck,
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    ownedCardIds: owned,
    seed: 5,
  });
  return createBattle(config);
}

describe("espólio de guerra (inteligência de captura)", () => {
  it("marca como alvo de captura as cartas do inimigo ausentes do nosso arsenal", () => {
    const owned = ["inf-fuzileiros", "inf-assalto"]; // arsenal mínimo
    const state = battleWithOwned(owned);
    const bountyIds = state.config.bountyCardIds ?? [];
    expect(bountyIds.length).toBeGreaterThan(0);
    // Nenhuma carta marcada é uma que já possuímos.
    for (const id of bountyIds) expect(owned).not.toContain(id);
    // Toda carta marcada vem do baralho adversário.
    for (const id of bountyIds) expect(state.config.red.deck).toContain(id);
  });

  it("sem inventário declarado não há espólio (comportamento neutro)", () => {
    const state = battleWithOwned(allCards.map((c) => c.id));
    expect(state.config.bountyCardIds ?? []).toEqual([]);
  });

  it("unidades que portam cartas ausentes nascem marcadas como espólio", () => {
    const owned = ["inf-fuzileiros"];
    const state = battleWithOwned(owned);
    const bountyCards = new Set(state.config.bountyCardIds ?? []);
    for (let i = 0; i < 600; i++) {
      aiTickSide(state, "red", 0.3);
      stepBattle(state, 0.3);
      if (state.red.units.some((u) => u.bounty)) break;
    }
    const flagged = state.red.units.filter((u) => u.bounty);
    for (const u of flagged) expect(bountyCards.has(u.cardId)).toBe(true);
  });

  it("a tropa mira primeiro a unidade que porta a carta ausente", () => {
    const owned = ["inf-fuzileiros", "inf-assalto"];
    const state = battleWithOwned(owned);
    const bountyCard = (state.config.bountyCardIds ?? [])[0]!;
    const redBase = state.structures.find(
      (s) => s.alive && s.side === "red" && s.kind === "base-principal",
    )!;
    const blueBase = state.structures.find(
      (s) => s.alive && s.side === "blue" && s.kind === "base-principal",
    )!;
    const anchor = { x: 60, y: 46 };
    // Duas unidades vermelhas a distâncias IGUAIS do atirador azul: uma porta a carta
    // ausente (espólio), a outra não. A inteligência deve preferir a primeira.
    deploy(state, "red", bountyCard, redBase.x, redBase.y, { x: redBase.x, y: redBase.y, skipRecharge: true });
    const spoils = state.red.units[state.red.units.length - 1]!;
    deploy(state, "red", "inf-fuzileiros", redBase.x, redBase.y, { x: redBase.x, y: redBase.y, skipRecharge: true });
    const plain = state.red.units[state.red.units.length - 1]!;
    for (const [u, dx] of [
      [spoils, -6],
      [plain, 6],
    ] as const) {
      u.x = anchor.x + dx;
      u.y = anchor.y;
      delete u.goalX;
      delete u.goalY;
      u.order = "manter";
      u.holdAtGoal = true;
    }
    deploy(state, "blue", "inf-fuzileiros", blueBase.x, blueBase.y, { x: blueBase.x, y: blueBase.y, skipRecharge: true });
    const shooter = state.blue.units[state.blue.units.length - 1]!;
    shooter.x = anchor.x;
    shooter.y = anchor.y;
    delete shooter.goalX;
    delete shooter.goalY;
    shooter.order = "manter";
    shooter.holdAtGoal = true;
    // A IA escolhe o alvo já nos primeiros passos; o espólio vence o empate de distância
    // (a unidade de espólio pode cair depois, então basta ela ter sido a escolhida).
    let targetedSpoils = false;
    for (let i = 0; i < 12 && !targetedSpoils; i++) {
      stepBattle(state, 0.25);
      if (shooter.targetId === spoils.id) targetedSpoils = true;
    }
    expect(targetedSpoils).toBe(true);
  });

  it("abater uma unidade-espólio rende a carta no resultado da operação", () => {
    const owned = ["inf-fuzileiros", "inf-assalto"];
    const state = battleWithOwned(owned);
    const bountyCard = (state.config.bountyCardIds ?? [])[0]!;
    const redBase = state.structures.find(
      (s) => s.alive && s.side === "red" && s.kind === "base-principal",
    )!;
    const blueBase = state.structures.find(
      (s) => s.alive && s.side === "blue" && s.kind === "base-principal",
    )!;
    // Traz uma unidade que porta a carta-espólio para o centro do mapa.
    deploy(state, "red", bountyCard, redBase.x, redBase.y, {
      x: redBase.x,
      y: redBase.y,
      skipRecharge: true,
    });
    const target = state.red.units[state.red.units.length - 1]!;
    expect(target.bounty).toBe(true);
    const center = { x: 60, y: 46 };
    target.x = center.x;
    target.y = center.y;
    delete target.goalX;
    delete target.goalY;
    target.order = "manter";
    target.holdAtGoal = true;
    // Cerca a unidade com infantaria azul até abatê-la.
    for (let i = 0; i < 8 && target.alive; i++) {
      deploy(state, "blue", "inf-fuzileiros", blueBase.x, blueBase.y, {
        x: center.x,
        y: center.y,
        skipRecharge: true,
      });
      const u = state.blue.units[state.blue.units.length - 1]!;
      const ang = (i / 8) * Math.PI * 2;
      u.x = center.x + Math.cos(ang) * 5;
      u.y = center.y + Math.sin(ang) * 5;
      u.goalX = u.x;
      u.goalY = u.y;
      u.holdAtGoal = true;
      for (let k = 0; k < 40 && target.alive; k++) stepBattle(state, 0.25);
    }
    expect(target.alive).toBe(false);
    expect(state.blue.capturedCards).toContain(bountyCard);
    expect(computeResult(state).capturedCards).toContain(bountyCard);
  });
});
