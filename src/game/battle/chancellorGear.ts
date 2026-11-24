// EQUIPAMENTO DO CHANCELER: o herói é a peça que decide a batalha, então ele cresce com
// o jogador. Cada peça equipada soma bônus REAIS ao chanceler em campo (velocidade, vida,
// dano, alcance, cadência) — nada aqui é só ficha decorativa: o motor aplica no spawn.
// O jogador ganha peças vencendo capítulos e pode comprar as que faltam com Sovereigns.

import {
  traitById,
  uniformById,
  type ChancellorIdentity,
  type ChancellorLoadout,
  type ChancellorMods,
} from "./chancellor";

export type GearSlot = "arma" | "uniforme" | "protecao" | "mobilidade";

export interface ChancellorGear {
  id: string;
  name: string;
  slot: GearSlot;
  /** 1 = campo, 2 = elite, 3 = protótipo. Define preço e raridade visual. */
  tier: 1 | 2 | 3;
  desc: string;
  cost: number;
  mods: ChancellorMods;
  /** Capítulo a partir do qual a peça pode cair como prêmio de vitória. */
  dropFrom: number;
}

export const GEAR_SLOTS: { id: GearSlot; name: string; hint: string }[] = [
  { id: "arma", name: "Arma", hint: "Dano, alcance e cadência do disparo." },
  { id: "protecao", name: "Proteção", hint: "Vida do chanceler em campo." },
  { id: "mobilidade", name: "Mobilidade", hint: "Velocidade de deslocamento." },
  { id: "uniforme", name: "Uniforme", hint: "Conjunto de campanha: vida e velocidade." },
];

// Peças nomeadas no vocabulário da FEB e da guerra híbrida: o jogador reconhece de onde
// vem cada bônus. Armas aumentam dano; mobilidade aumenta o passo; proteção aumenta vida.
export const CHANCELLOR_GEAR: ChancellorGear[] = [
  {
    id: "gear-fal",
    name: "Fuzil FAL 7,62",
    slot: "arma",
    tier: 1,
    desc: "O fuzil de dotação. Confiável, sem frescura.",
    cost: 120,
    mods: { dmg: 6, range: 0.5 },
    dropFrom: 1,
  },
  {
    id: "gear-m1",
    name: "Carabina M1",
    slot: "arma",
    tier: 1,
    desc: "Leve e de ciclo rápido: cadência melhor, dano modesto.",
    cost: 160,
    mods: { dmg: 4, cooldown: -0.12, projectileSpeed: 20 },
    dropFrom: 2,
  },
  {
    id: "gear-fz",
    name: "Fuzil de precisão FZ-762",
    slot: "arma",
    tier: 2,
    desc: "Um tiro, um problema a menos. Alcance longo, cadência lenta.",
    cost: 320,
    mods: { dmg: 20, range: 2, cooldown: 0.18 },
    dropFrom: 4,
  },
  {
    id: "gear-lancador",
    name: "Lança-granadas de mão",
    slot: "arma",
    tier: 2,
    desc: "Abre posição entrincheirada. Dano alto, cadência curta.",
    cost: 380,
    mods: { dmg: 26, range: 1, cooldown: 0.35 },
    dropFrom: 6,
  },
  {
    id: "gear-prototipo",
    name: "Fuzil de assalto X-24",
    slot: "arma",
    tier: 3,
    desc: "Protótipo nacional: dispara mais rápido e mais longe que qualquer dotação.",
    cost: 720,
    mods: { dmg: 18, range: 1.5, cooldown: -0.2, projectileSpeed: 40 },
    dropFrom: 9,
  },
  {
    id: "gear-colete",
    name: "Colete de aço",
    slot: "protecao",
    tier: 1,
    desc: "Chapa frontal soldada no campo. Pesa, mas segura o primeiro tiro.",
    cost: 140,
    mods: { hp: 180 },
    dropFrom: 1,
  },
  {
    id: "gear-capacete",
    name: "Capacete de aço M1",
    slot: "protecao",
    tier: 1,
    desc: "Estilhaço não escolhe alvo. O capacete escolhe quem sobrevive.",
    cost: 180,
    mods: { hp: 120, speed: 0.2 },
    dropFrom: 2,
  },
  {
    id: "gear-placa",
    name: "Placa balística reforçada",
    slot: "protecao",
    tier: 2,
    desc: "Blindagem de campanha: aguenta rajada de metralhadora.",
    cost: 400,
    mods: { hp: 340, speed: -0.25 },
    dropFrom: 7,
  },
  {
    id: "gear-botas",
    name: "Botas de assalto",
    slot: "mobilidade",
    tier: 1,
    desc: "Sola nova e tornozelo firme: o passo rende mais no terreno ruim.",
    cost: 150,
    mods: { speed: 1.1 },
    dropFrom: 1,
  },
  {
    id: "gear-mochila",
    name: "Mochila de campanha leve",
    slot: "mobilidade",
    tier: 1,
    desc: "Só o essencial nas costas. Anda mais e cansa menos.",
    cost: 190,
    mods: { speed: 0.8, hp: 70 },
    dropFrom: 3,
  },
  {
    id: "gear-motor",
    name: "Jipe de comando",
    slot: "mobilidade",
    tier: 2,
    desc: "O chanceler se desloca de jipe e desembarca onde a linha quebra.",
    cost: 460,
    mods: { speed: 2.4, hp: -80 },
    dropFrom: 8,
  },
  {
    id: "gear-radio",
    name: "Rádio de campanha",
    slot: "uniforme",
    tier: 1,
    desc: "Uniforme completo com rádio: coordena melhor, se expõe menos.",
    cost: 200,
    mods: { hp: 90, speed: 0.4, range: 1 },
    dropFrom: 3,
  },
  {
    id: "gear-camuflado",
    name: "Uniforme camuflado",
    slot: "uniforme",
    tier: 2,
    desc: "Tecido de selva costurado à mão. Menos silhueta, menos baixa.",
    cost: 420,
    mods: { hp: 140, speed: 0.7 },
    dropFrom: 5,
  },
];

export const TIER_NAME: Record<ChancellorGear["tier"], string> = {
  1: "Campo",
  2: "Elite",
  3: "Protótipo",
};

export function gearById(id?: string): ChancellorGear | undefined {
  return id ? CHANCELLOR_GEAR.find((g) => g.id === id) : undefined;
}

export function gearSlot(id?: string): GearSlot | undefined {
  return gearById(id)?.slot;
}

/** Peça equipada em cada slot (última da lista vence se houver duas no mesmo slot). */
export function equippedBySlot(equipped: string[]): Partial<Record<GearSlot, string>> {
  const out: Partial<Record<GearSlot, string>> = {};
  for (const id of equipped) {
    const gear = gearById(id);
    if (gear) out[gear.slot] = gear.id;
  }
  return out;
}

const MOD_KEYS: (keyof ChancellorMods)[] = [
  "speed",
  "hp",
  "dmg",
  "range",
  "cooldown",
  "projectileSpeed",
];

/** Soma os bônus das peças num único pacote de modificadores. */
export function gearMods(gearIds: string[]): ChancellorMods {
  const total: ChancellorMods = {};
  for (const id of gearIds) {
    const gear = gearById(id);
    if (!gear) continue;
    for (const key of MOD_KEYS) {
      const value = gear.mods[key];
      if (value === undefined) continue;
      total[key] = Math.round(((total[key] ?? 0) + value) * 100) / 100;
    }
  }
  return total;
}

/** Rótulos legíveis dos bônus ("+1,1 velocidade", "−0,12 s entre tiros"). */
export function describeMods(mods: ChancellorMods): string[] {
  const out: string[] = [];
  const fmt = (v: number) =>
    v
      .toFixed(2)
      .replace(".", ",")
      .replace(/,00$/, "")
      .replace(/,(\d)0$/, ",$1");
  if (mods.speed) out.push(`${mods.speed > 0 ? "+" : ""}${fmt(mods.speed)} velocidade`);
  if (mods.hp) out.push(`${mods.hp > 0 ? "+" : ""}${Math.round(mods.hp)} vida`);
  if (mods.dmg) out.push(`${mods.dmg > 0 ? "+" : ""}${Math.round(mods.dmg)} dano`);
  if (mods.range) out.push(`${mods.range > 0 ? "+" : ""}${fmt(mods.range)} alcance`);
  if (mods.cooldown)
    out.push(`${mods.cooldown > 0 ? "+" : "−"}${fmt(Math.abs(mods.cooldown))} s entre tiros`);
  if (mods.projectileSpeed)
    out.push(
      `${mods.projectileSpeed > 0 ? "+" : ""}${Math.round(mods.projectileSpeed)} velocidade do projétil`,
    );
  return out;
}

/** Loadout completo do chanceler: identidade + arma equipada + bônus somados. */
export function chancellorLoadout(
  identity: ChancellorIdentity,
  equipped: string[],
): ChancellorLoadout {
  const bySlot = equippedBySlot(equipped);
  const weapon = gearById(bySlot.arma);
  return {
    ...identity,
    traitId: traitById(identity.traitId).id,
    uniformId: uniformById(identity.uniformId).id,
    gearIds: Object.values(bySlot).filter((id): id is string => Boolean(id)),
    mods: gearMods(Object.values(bySlot).filter((id): id is string => Boolean(id))),
    ...(weapon ? { weaponName: weapon.name } : {}),
  };
}

/**
 * Próxima peça de prêmio: a primeira ainda não possuída que já pode cair no capítulo
 * atual. Determinístico (ordem do catálogo) — o jogador sabe o que a vitória libera.
 */
// A ordem de queda percorre os slots em vez de seguir o catálogo: assim a primeira
// vitória já entrega mobilidade (o chanceler anda mais rápido) e as seguintes
// alternam arma, proteção e uniforme, sem o jogador passar dez missões sem pé novo.
const DROP_ROTATION: GearSlot[] = ["mobilidade", "arma", "protecao", "uniforme"];

export function nextGearDrop(owned: string[], chapterNumber: number): ChancellorGear | undefined {
  const have = new Set(owned);
  const pool = CHANCELLOR_GEAR.filter((g) => g.dropFrom <= chapterNumber && !have.has(g.id));
  if (pool.length === 0) return undefined;
  const wanted = DROP_ROTATION[have.size % DROP_ROTATION.length]!;
  return pool.find((g) => g.slot === wanted) ?? pool[0];
}
