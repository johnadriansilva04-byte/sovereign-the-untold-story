import { describe, expect, it } from "vitest";

import { commanders, startingDeck } from "@/game/battle/catalog";
import {
  CHANCELLOR_GEAR,
  chancellorLoadout,
  gearMods,
  gearById,
  nextGearDrop,
} from "@/game/battle/chancellorGear";
import { CHANCELLOR_TRAITS, CHANCELLOR_UNIFORMS, defaultIdentity } from "@/game/battle/chancellor";
import { createBattle, HERO_CARD } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import {
  buyGear,
  chancellorIdentity,
  chancellorLoadoutFor,
  createProfile,
  grantGear,
  setChancellorIdentity,
  toggleGear,
} from "@/game/progress/profile";

const identity = {
  ...defaultIdentity(),
  name: "Cap. Aurora",
  traitId: "tecnico",
  uniformId: "areia",
};

function configWith(heroEquipped: string[]) {
  const profile = {
    ...createProfile("Teste"),
    chancellor: { identity, ownedGear: heroEquipped, equipped: heroEquipped, created: true },
  };
  return buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-apagao"),
    deck: startingDeck,
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    seed: 11,
    hero: chancellorLoadoutFor(profile),
  });
}

describe("chanceler: identidade do jogador", () => {
  it("cria, edita e persiste nome, uniforme e estilo", () => {
    const base = createProfile("Teste");
    expect(base.chancellor).toBeUndefined();
    const created = setChancellorIdentity(base, identity);
    expect(chancellorIdentity(created).name).toBe("Cap. Aurora");
    expect(chancellorIdentity(created).traitId).toBe("tecnico");
    // nome é aparado e limitado — o HUD não pode quebrar com um nome gigante
    const long = setChancellorIdentity(base, { ...identity, name: "   " + "x".repeat(60) });
    expect(chancellorIdentity(long).name).toHaveLength(22);
    // nome em branco cai no padrão
    const blank = setChancellorIdentity(base, { ...identity, name: "   " });
    expect(chancellorIdentity(blank).name).toBe(defaultIdentity().name);
  });

  it("todo estilo e uniforme do catálogo existe (sem id órfão na UI)", () => {
    expect(CHANCELLOR_TRAITS.length).toBeGreaterThan(2);
    for (const u of CHANCELLOR_UNIFORMS) expect(u.color).toMatch(/^oklch/);
    expect(CHANCELLOR_TRAITS.map((t) => t.id)).toContain(identity.traitId);
  });
});

describe("chanceler: equipamento", () => {
  it("soma os bônus das peças equipadas", () => {
    const mods = gearMods(["gear-botas", "gear-colete"]);
    expect(mods.speed).toBeCloseTo(1.1);
    expect(mods.hp).toBe(180);
  });

  it("um slot aceita uma peça só e o acervo não se perde", () => {
    const owned = ["gear-fal", "gear-fz"];
    const profile = {
      ...createProfile("Teste"),
      chancellor: { identity, ownedGear: owned, equipped: ["gear-fal"], created: true },
    };
    const swapped = toggleGear(profile, "gear-fz");
    expect(swapped.chancellor!.equipped).toEqual(["gear-fz"]);
    expect(swapped.chancellor!.ownedGear.sort()).toEqual([...owned].sort());
    // desequipar
    expect(toggleGear(swapped, "gear-fz").chancellor!.equipped).toEqual([]);
  });

  it("peça não possuída não pode ser equipada e a compra cobra Sovereigns", () => {
    const profile = createProfile("Teste");
    expect(toggleGear(profile, "gear-fz").chancellor).toBeUndefined();
    const gear = CHANCELLOR_GEAR.find((g) => g.id === "gear-botas")!;
    const rich = { ...profile, sovereigns: gear.cost + 10 };
    const bought = buyGear(rich, gear.id);
    expect(bought.sovereigns).toBe(10);
    expect(bought.chancellor!.ownedGear).toContain(gear.id);
    // sem saldo, nada muda
    expect(buyGear({ ...profile, sovereigns: 0 }, gear.id).chancellor).toBeUndefined();
  });

  it("a vitória libera a próxima peça que o capítulo permite, sem repetir", () => {
    const profile = createProfile("Teste");
    const first = grantGear(profile, 1);
    // a primeira vitória entrega mobilidade: o chanceler fica mais rápido já no cap. 1
    expect(first.gearId).toBe("gear-botas");
    expect(gearById(first.gearId!)!.slot).toBe("mobilidade");
    const second = grantGear(first.profile, 1);
    expect(second.gearId).not.toBe(first.gearId);
    expect(gearById(second.gearId!)!.slot).toBe("arma");
    // capítulo 1 não libera peça de elite
    expect(nextGearDrop([], 1)!.dropFrom).toBeLessThanOrEqual(1);
    expect(CHANCELLOR_GEAR.some((g) => g.dropFrom > 1)).toBe(true);
  });

  it("o loadout leva a arma equipada e os modificadores somados", () => {
    const loadout = chancellorLoadout(identity, ["gear-fz", "gear-placa"]);
    expect(loadout.name).toBe("Cap. Aurora");
    expect(loadout.weaponName).toContain("FZ-762");
    expect(loadout.mods.dmg).toBe(20);
    expect(loadout.mods.hp).toBe(340);
  });
});

describe("chanceler: o equipamento vale em campo", () => {
  it("entra em campo com a identidade do jogador e os atributos alterados", () => {
    const setup = [{ side: "blue" as const, status: "livre" as const, x: 40, y: 40 }];
    const plainBattle = createBattle({ ...configWith([]), heroSetup: setup });
    const gearedBattle = createBattle({
      ...configWith(["gear-botas", "gear-colete", "gear-fz"]),
      heroSetup: setup,
    });
    const base = plainBattle.blue.units.find((u) => u.cardId === HERO_CARD)!;
    const buffed = gearedBattle.blue.units.find((u) => u.cardId === HERO_CARD)!;
    expect(base).toBeTruthy();
    expect(buffed.name).toBe("Cap. Aurora");
    expect(buffed.speed).toBeGreaterThan(base.speed);
    expect(buffed.maxHp).toBeGreaterThan(base.maxHp);
    expect(buffed.dmg).toBeGreaterThan(base.dmg);
  });

  it("sem identidade criada o herói ainda usa a persona padrão", () => {
    const battle = createBattle({
      ...configWith([]),
      heroSetup: [{ side: "blue", status: "livre", x: 40, y: 40 }],
    });
    const hero = battle.blue.units.find((u) => u.cardId === HERO_CARD)!;
    expect(hero).toBeTruthy();
    expect(hero.name.length).toBeGreaterThan(2);
  });
});
