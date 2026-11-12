import { describe, expect, it } from "vitest";

import { aiTick, aiTickSide, configureAi, trainedAiWeights } from "@/game/battle/ai";
import { commanders, militaryCards, startingDeck, supportCards } from "@/game/battle/catalog";
import { createBattle, deploy, dist, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import type { BattleState } from "@/game/battle/types";

// AUDITORIA POR CARTA: para CADA carta militar, o motor precisa provar que ela faz o
// que promete — a força avança, escolhe alvo, dispara e o dano chega ao alvo. Uma carta
// que só "aparece no campo" e não produz efeito é um defeito, não uma funcionalidade.
const STEP = 0.2;
const SECONDS = 55;

function makeBattle(cardId: string): BattleState {
  const cfg = buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-trolls"),
    // Baralho com a carta auditada já na mão (as outras são de enchimento).
    deck: [cardId, ...startingDeck.filter((c) => c !== cardId)].slice(0, 8),
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    seed: 4242,
  });
  const st = createBattle(cfg);
  configureAi(st, "blue", trainedAiWeights);
  st.blue.command = 100000; // energia infinita: a auditoria isola o comportamento da carta
  return st;
}

/** HP total do INIMIGO (unidades + estruturas). É o proxy de dano real: se a carta
 * causa dano, a vida total do vermelho cai. Contar só estruturas mascararia o combate
 * no meio do mapa, onde as forças se encontram. */
function enemyHp(st: BattleState): number {
  const structs = st.structures.filter((s) => s.side === "red" && s.alive).reduce((a, s) => a + s.hp, 0);
  const units = st.red.units.filter((u) => u.alive).reduce((a, u) => a + u.hp, 0);
  return structs + units;
}

describe("auditoria de cartas de apoio: cada apoio altera o estado", () => {
  // Cartas de efeito ofensivo agem sobre o inimigo; as de suporte agem sobre as nossas
  // tropas. O teste confere que CADA uma altera de fato o estado do motor (vida, zonas,
  // efeitos, obstáculos ou número de unidades) — apoio que "não faz nada" é defeito.
  const OFFENSIVE = new Set(["sup-aereo", "sup-gas", "sup-bombardeiro", "sup-paraquedistas", "sup-interferencia"]);

  const snapshot = (st: BattleState) => ({
    hp: st.red.units.filter((u) => u.alive).reduce((a, u) => a + u.hp, 0) +
      st.structures.filter((s) => s.side === "red" && s.alive).reduce((a, s) => a + s.hp, 0),
    zones: st.zones.length,
    effects: st.effects.length,
    obstacles: st.config.arena.obstacles.length,
    blue: st.blue.units.filter((u) => u.alive).length,
    blueHp: st.blue.units.filter((u) => u.alive).reduce((a, u) => a + u.hp, 0),
  });

  for (const card of supportCards) {
    it(`${card.short} (${card.id}) aplica efeito`, () => {
      const st = makeBattle(card.id);
      st.blue.command = 100000;
      const blueBase = st.structures.find((s) => s.side === "blue")!;
      const redBase = st.structures.find((s) => s.side === "red")!;
      // Garante tropas azuis perto da própria base (para as cartas de suporte curarem).
      const milHand = st.blue.deck.hand.find((h) => h.cardId === "inf-fuzileiros");
      if (milHand) milHand.ready = true;
      deploy(st, "blue", "inf-fuzileiros", blueBase.x + 4, blueBase.y, {
        x: blueBase.x + 4,
        y: blueBase.y,
        holdAtArrival: true,
      });
      // Deixa uma tropa ferida: as cartas de cura (reparo/evacuação) precisam de alvo.
      for (const u of st.blue.units) if (u.alive) u.hp = Math.max(1, u.hp * 0.4);
      const point = OFFENSIVE.has(card.id)
        ? { x: redBase.x - 20, y: redBase.y }
        : { x: blueBase.x + 4, y: blueBase.y };
      const hand = st.blue.deck.hand.find((h) => h.cardId === card.id);
      if (hand) hand.ready = true;
      const before = snapshot(st);
      const ok = deploy(st, "blue", card.id, point.x, point.y);
      expect(ok, `${card.id}: não entrou em campo`).toBe(true);
      const after = snapshot(st);
      const changed =
        after.hp !== before.hp ||
        after.zones !== before.zones ||
        after.effects !== before.effects ||
        after.obstacles !== before.obstacles ||
        after.blue !== before.blue ||
        after.blueHp !== before.blueHp;
      expect(changed, `${card.id}: aplicou a carta mas nada mudou no estado`).toBe(true);
    });
  }
});

describe("auditoria de cartas: cada carta produz efeito real", () => {
  const cards = militaryCards.filter((c) => !c.hero);

  for (const card of cards) {
    it(`${card.short} (${card.id}) produz efeito e não trava`, () => {
      const st = makeBattle(card.id);
      // Alvo claro: a base vermelha, para a força ter para onde ir e o que atacar.
      const enemyBase = st.structures.find((s) => s.side === "red" && s.kind === "base-principal")!;
      const hpBefore = enemyHp(st);
      // Deploya a carta no meio do caminho, repetidas vezes, com ordens de avanço.
      let deployed = 0;
      let maxStall = 0;
      const stuckIds = new Set<string>();
      for (let i = 0; i < (SECONDS / STEP); i++) {
        // A recarga é ignorada nesta auditoria: a carta fica pronta a cada tentativa.
        const hand = st.blue.deck.hand.find((h) => h.cardId === card.id);
        if (hand) hand.ready = true;
        if (i % 5 === 0) {
          const ok = deploy(st, "blue", card.id, enemyBase.x - 18, enemyBase.y, {
            x: enemyBase.x - 18,
            y: enemyBase.y,
            holdAtArrival: false,
          });
          if (ok) deployed++;
        }
        aiTickSide(st, "blue", STEP);
        stepBattle(st, STEP);
        for (const u of st.blue.units) {
          if (!u.alive) continue;
          if ((u.stall ?? 0) > maxStall) maxStall = u.stall ?? 0;
          if ((u.stall ?? 0) >= 3) stuckIds.add(u.model);
        }
      }
      const hpAfter = enemyHp(st);
      const dmgDealt = hpBefore - hpAfter;
      const isBuilder = card.model === "engenheiro";
      const hasWeapon = card.dmg > 0;

      // 1) a carta entrou em campo
      expect(deployed, `${card.id}: a carta não conseguiu entrar em campo`).toBeGreaterThan(0);
      // 2) a carta com arma causa dano real; o engenheiro constrói (dano não se aplica)
      if (hasWeapon && !isBuilder) {
        expect(dmgDealt, `${card.id}: não causou dano algum`).toBeGreaterThan(0);
      }
      // 3) nada ficou travado (o teto do detector é 2,5 s; acima de 3 s é defeito)
      expect([...stuckIds], `${card.id}: modelos travados > 3s`).toEqual([]);
    });
  }
});
