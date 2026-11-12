import { describe, expect, it } from "vitest";

import { commanders, startingDeck } from "@/game/battle/catalog";
import { createBattle, deploy, dist, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import type { BattleConfig, BattleState, Side } from "@/game/battle/types";

// ESPAÇAMENTO E STAND-OFF: as queixas eram "as unidades ficam amontoadas e girando" e
// "os tanques encostam um no outro em vez de atirar de longe". Estes testes travam a
// correção: (1) corpos terrestres mantêm folga (não se sobrepõem) e (2) armas de longo
// alcance param LONGE do alvo para atirar, sem encostar.
function testConfig(overrides: Partial<BattleConfig> = {}): BattleConfig {
  const base = buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-apagao"),
    deck: startingDeck,
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    seed: 11,
  });
  return { ...base, duration: 300, ...overrides };
}

function place(state: BattleState, side: Side, cardId: string, x: number, y: number) {
  const cfg = side === "blue" ? state.blue : state.red;
  cfg.command = 999;
  cfg.deck.hand[0] = { cardId, ready: true };
  const z = state.config.arena.deployZone[side];
  const before = cfg.units.length;
  deploy(state, side, cardId, z.x + z.w / 2, z.y + z.h / 2);
  const spawned = cfg.units.slice(before);
  const unit = spawned[0]!;
  for (const u of spawned) {
    u.x = x;
    u.y = y;
    delete u.goalX;
    delete u.goalY;
    u.holdAtGoal = false;
  }
  for (const u of spawned.slice(1)) u.alive = false;
  cfg.units = cfg.units.filter((u) => u.alive);
  return unit;
}

describe("motor de batalha — espaçamento e distância de engajamento", () => {
  it("unidades paradas no mesmo ponto se afastam (não ficam empilhadas)", () => {
    const state = createBattle(testConfig({ duration: 60 }));
    // Seis soldados despejados no MESMO pixel, todos segurando posição: a separação
    // tem de abrir espaço entre eles.
    const units = Array.from({ length: 6 }, () => place(state, "blue", "inf-fuzileiros", 70, 46));
    for (const u of units) u.order = "manter";
    for (let step = 0; step < 60 && state.running; step++) stepBattle(state, 0.1);
    let minGap = Infinity;
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i]!;
        const b = units[j]!;
        minGap = Math.min(minGap, dist(a.x, a.y, b.x, b.y) - (a.radius + b.radius));
      }
    }
    // Devem manter folga real entre si — nunca sobrepostos.
    expect(minGap).toBeGreaterThan(0.5);
  });

  it("pelotão em marcha não vira um amontoado no destino", () => {
    const state = createBattle(testConfig({ duration: 60 }));
    const units = ["inf-fuzileiros", "inf-assalto", "inf-fuzileiros", "inf-assalto"].map((id, i) =>
      place(state, "blue", id, 40 + (i % 2) * 1.5, 46 + Math.floor(i / 2) * 1.5),
    );
    for (const u of units) {
      u.goalX = 70;
      u.goalY = 46;
      u.order = "avancar";
      u.holdAtGoal = true;
    }
    // Deixa a coluna marchar e se acomodar no destino.
    for (let step = 0; step < 400 && state.running; step++) stepBattle(state, 0.1);
    let minGap = Infinity;
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i]!;
        const b = units[j]!;
        if (!a.alive || !b.alive) continue;
        minGap = Math.min(minGap, dist(a.x, a.y, b.x, b.y) - (a.radius + b.radius));
      }
    }
    expect(minGap).toBeGreaterThan(-0.8);
  });

  it("artilharia de longo alcance para LONGE do alvo e atira (não encosta)", () => {
    const state = createBattle(testConfig({ duration: 60 }));
    // Alvo imóvel e inofensivo (dano 0): isola a posição de tiro do canhão. Revelado,
    // para que a fumaça de guerra não esconda o alvo do teste.
    const target = place(state, "red", "inf-fuzileiros", 48, 46);
    target.speed = 0;
    target.dmg = 0;
    target.revealed = 999;
    const cannon = place(state, "blue", "art-canhao", 28, 46);
    cannon.order = "avancar";
    const hpBefore = target.hp;
    let closest = Infinity;
    for (let step = 0; step < 400 && state.running; step++) {
      stepBattle(state, 0.1);
      if (target.alive && cannon.alive)
        closest = Math.min(closest, dist(cannon.x, cannon.y, target.x, target.y));
    }
    // O canhão tem alcance 24: deve estacionar bem antes de encostar no alvo.
    expect(closest).toBeGreaterThan(cannon.range * 0.6);
    // E o disparo tem de causar dano real.
    expect(target.hp).toBeLessThan(hpBefore);
  });
});
