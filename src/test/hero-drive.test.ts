import { describe, expect, it } from "vitest";

import { commanders, startingDeck } from "@/game/battle/catalog";
import { createBattle, stepBattle } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";

// CONTROLE DIRETO DO CHANCELER: o vetor (driveX, driveY) precisa mover o herói em tempo
// real — mesma física das outras tropas. Também confere que o chanceler EXISTE em campo
// nas operações com cenário de herói (era a queixa "não vi chanceler de ninguém").
function battle(missionId: string) {
  const cfg = buildBattleConfig({
    nation: defaultNation,
    mission: missionById(missionId),
    deck: startingDeck,
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    seed: 7,
  });
  return createBattle(cfg);
}

describe("chanceler: presença e controle em tempo real", () => {
  it("nasce em campo nas operações com cenário de herói", () => {
    const st = battle("m-trolls");
    const blue = st.blue.units.filter((u) => u.hero && u.alive);
    const red = st.red.units.filter((u) => u.hero && u.alive);
    // "nos-temos-o-deles": o azul está livre, o vermelho preso (nasce ao ser resgatado).
    expect(blue.length, "o chanceler azul deveria estar em campo").toBe(1);
    expect(red.length).toBe(0);
    expect(st.heroes.blue.state).toBe("livre");
    expect(st.heroes.red.state).toBe("preso");
  });

  it("move para a direita com driveX=1 e para de mover ao zerar", () => {
    const st = battle("m-trolls");
    const hero = st.blue.units.find((u) => u.hero && u.alive)!;
    hero.driveX = 1;
    hero.driveY = 0;
    const x0 = hero.x;
    for (let i = 0; i < 20; i++) stepBattle(st, 0.1);
    expect(hero.x, "o chanceler não andou para a direita").toBeGreaterThan(x0 + 1);
    hero.driveX = 0;
    const x1 = hero.x;
    for (let i = 0; i < 20; i++) stepBattle(st, 0.1);
    expect(Math.abs(hero.x - x1), "o chanceler continuou andando após soltar").toBeLessThan(0.6);
  });

  it("respeita os limites do mundo ao empurrar contra a borda", () => {
    const st = battle("m-trolls");
    const hero = st.blue.units.find((u) => u.hero && u.alive)!;
    hero.driveX = -1;
    hero.driveY = 0;
    for (let i = 0; i < 400; i++) stepBattle(st, 0.1);
    expect(hero.x).toBeGreaterThanOrEqual(0);
    expect(hero.alive).toBe(true);
  });
});
