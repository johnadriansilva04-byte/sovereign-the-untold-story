// Catálogo de cartas, doutrinas, comandantes e arenas.
// A batalha é "data-driven": o motor lê estas tabelas, não regras espalhadas pelo código.
//
// Cada unidade militar tem um MODELO visual próprio (UnitModel) e uma ARMA própria
// (WeaponSpec). O motor usa a arma para gerar projéteis reais com trajetória, colisão
// e explosão — nada aqui é apenas decorativo.

import type {
  Arena,
  Card,
  Commander,
  Doctrine,
  DoctrineModifier,
  MilitaryCard,
  StructureSpec,
  SupportCard,
  Territory,
} from "./types";
import { deepenY } from "./world";

// ---------------------------------------------------------------------------
// Cartas militares — cada categoria tem identidade visual e balística própria
// ---------------------------------------------------------------------------

const INF = "infantaria";
const BLD = "blindado";
const ART = "artilharia";
const DEF = "defesa";
const REC = "reconhecimento";

export const militaryCards: MilitaryCard[] = [
  // --- 5.1 Soldados de fuzil ---
  {
    id: "inf-fuzileiros",
    kind: "militar",
    name: "Fuzileiros",
    short: "FUZ",
    category: INF,
    cost: 3,
    hp: 190,
    dmg: 16,
    speed: 4.4,
    range: 6,
    cooldown: 0.9,
    targets: "terra",
    domain: "terra",
    radius: 2.2,
    model: "soldado-fuzil",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 120,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.6,
      tracer: true,
    },
    // A carta representa um PELOTÃO: ~9 soldados no nível 1, teto de 16.
    squad: { base: 9, perLevel: 0.5, max: 16, spacing: 2.6 },
    role: "Linha de frente barata. Avança, captura e segura posições.",
  },
  {
    id: "inf-assalto",
    kind: "militar",
    name: "Infantaria de Assalto",
    short: "ASSALTO",
    category: INF,
    cost: 4,
    hp: 320,
    dmg: 14,
    speed: 3.6,
    range: 5.5,
    cooldown: 0.32,
    targets: "terra",
    domain: "terra",
    radius: 2.4,
    model: "soldado-assalto",
    weapon: {
      kind: "automatica",
      projectileSpeed: 130,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.6,
      tracer: true,
    },
    // Grupo de assalto: 5 soldados pesados no nível 1, teto de 10.
    squad: { base: 5, perLevel: 0.34, max: 10, spacing: 3.0 },
    role: "Equipamento pesado e arma automática. Resistente no combate próximo.",
    unlocksTech: ["t3"],
  },
  {
    id: "inf-antitanque",
    kind: "militar",
    name: "Infantaria Antitanque",
    short: "AT",
    category: INF,
    cost: 4,
    hp: 200,
    dmg: 95,
    speed: 3.8,
    range: 15,
    cooldown: 2.6,
    targets: "terra",
    domain: "terra",
    radius: 2.2,
    model: "soldado-antitanque",
    weapon: {
      kind: "atgm",
      projectileSpeed: 34,
      splash: 3,
      arc: false,
      homing: true,
      muzzle: 1.8,
    },
    priority: [BLD],
    // Equipe antitanque: 3 operadores no nível 1, teto de 6.
    squad: { base: 3, perLevel: 0.22, max: 6, spacing: 3.4 },
    role: "Foguete portátil guiado. Devastador contra blindados e estruturas.",
  },
  {
    id: "inf-engenheiro",
    kind: "militar",
    name: "Engenheiros Militares",
    short: "ENG",
    category: "apoio",
    cost: 3,
    hp: 200,
    dmg: 10,
    speed: 3.4,
    range: 4.5,
    cooldown: 1.2,
    targets: "terra",
    domain: "terra",
    radius: 2.2,
    model: "engenheiro",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 100,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.4,
      tracer: true,
    },
    builder: true,
    // Equipe de engenharia: 3 no nível 1, teto de 6 (trabalham juntos na mesma obra).
    squad: { base: 3, perLevel: 0.2, max: 6, spacing: 2.8 },
    role: "Captura territórios e constrói bases avançadas. Repara estruturas aliadas.",
  },

  // --- 5.5 Sniper: infantaria de precisão, alcance longo, tiro lento e forte ---
  {
    id: "inf-sniper",
    kind: "militar",
    name: "Atiradores de Precisão",
    short: "SNIP",
    category: INF,
    cost: 4,
    hp: 150,
    dmg: 62,
    speed: 3.6,
    range: 16,
    cooldown: 2.4,
    targets: "terra",
    domain: "terra",
    radius: 2.1,
    model: "sniper",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 200,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 2,
      tracer: true,
    },
    priority: [INF, ART],
    // Dupla de atiradores: 2 no nível 1, até 4.
    squad: { base: 2, perLevel: 0.16, max: 4, spacing: 3.2 },
    role: "Elimina infantaria e artilharia de longe. Frágil no corpo a corpo.",
  },

  // --- 5.6 Morteiro: infantaria de apoio com tiro em arco e área ---
  {
    id: "art-morteiro",
    kind: "militar",
    name: "Morteiro de Apoio",
    short: "MORT",
    category: ART,
    cost: 3,
    hp: 220,
    dmg: 70,
    speed: 2.4,
    range: 18,
    cooldown: 3.2,
    targets: "terra",
    domain: "terra",
    radius: 2.3,
    model: "morteiro",
    weapon: {
      kind: "obus",
      projectileSpeed: 32,
      splash: 5,
      arc: true,
      homing: false,
      muzzle: 1.6,
    },
    // Seção de morteiro: 2 no nível 1, até 3.
    squad: { base: 2, perLevel: 0.1, max: 3, spacing: 3 },
    role: "Bombardeia em arco, por cima de obstáculos. Dano de área em alvos agrupados.",
    unlocksTech: ["t2"],
  },

  // --- 8.2 Caça-tanques: veículo blindado especializado ---
  {
    id: "bld-caca-tanques",
    kind: "militar",
    name: "Caça-Tanques",
    short: "CT",
    category: BLD,
    cost: 5,
    hp: 820,
    dmg: 110,
    speed: 2.9,
    range: 13,
    cooldown: 1.8,
    targets: "terra",
    domain: "terra",
    radius: 3.2,
    model: "caca-tanques",
    weapon: {
      kind: "canhao",
      projectileSpeed: 55,
      splash: 1.4,
      arc: false,
      homing: false,
      muzzle: 2.6,
    },
    priority: [BLD, DEF],
    role: "Blindado com canhão de alta penetração. Prioriza tanques e fortificações.",
    unlocksTech: ["t4"],
  },

  // --- 6 Artilharia — canhões como peças independentes ---
  {
    id: "art-canhao",
    kind: "militar",
    name: "Canhão de Campanha",
    short: "CANHÃO",
    category: ART,
    cost: 4,
    hp: 260,
    dmg: 70,
    speed: 1.9,
    range: 24,
    cooldown: 2.4,
    targets: "terra",
    domain: "terra",
    radius: 2.8,
    model: "canhao",
    weapon: {
      kind: "canhao",
      projectileSpeed: 46,
      splash: 4.5,
      arc: true,
      homing: false,
      muzzle: 2.6,
    },
    // Bateria de campanha: 1 peça no nível 1, até 3 em níveis altos.
    squad: { base: 1, perLevel: 0.12, max: 3, spacing: 4.5 },
    role: "Peça de fogo direto. Alcance maior que a infantaria, cadência menor.",
  },
  {
    id: "art-obus",
    kind: "militar",
    name: "Artilharia Pesada 155 mm",
    short: "OBUS",
    category: ART,
    cost: 7,
    hp: 230,
    dmg: 130,
    speed: 1.3,
    range: 38,
    cooldown: 3.6,
    targets: "terra",
    domain: "terra",
    radius: 3.0,
    model: "artilharia-pesada",
    weapon: {
      kind: "obus",
      projectileSpeed: 34,
      splash: 7,
      arc: true,
      homing: false,
      muzzle: 3.2,
    },
    // Bateria pesada: 1 obus no nível 1, até 3.
    squad: { base: 1, perLevel: 0.12, max: 3, spacing: 5.0 },
    role: "Fogo indireto de longo alcance com grande explosão em área.",
    unlocksTech: ["t4"],
  },

  // --- 7 Lançadores de mísseis ---
  {
    id: "mss-lancador",
    kind: "militar",
    name: "Lançador de Mísseis",
    short: "LM",
    category: ART,
    cost: 5,
    hp: 300,
    dmg: 120,
    speed: 1.8,
    range: 34,
    cooldown: 3.2,
    targets: "terra",
    domain: "terra",
    radius: 3.0,
    model: "lancador-missil",
    weapon: {
      kind: "missil",
      projectileSpeed: 40,
      splash: 5,
      arc: true,
      homing: true,
      muzzle: 3.0,
    },
    squad: { base: 1, perLevel: 0.1, max: 2, spacing: 5.5 },
    role: "Caminhão lançador. Míssil guiado com trajetória e explosão no impacto.",
    unlocksTech: ["t7"],
  },
  {
    id: "mss-lmf",
    kind: "militar",
    name: "Lançador Múltiplo de Foguetes",
    short: "LMF",
    category: ART,
    cost: 7,
    hp: 260,
    dmg: 60,
    speed: 1.4,
    range: 36,
    cooldown: 3.8,
    targets: "terra",
    domain: "terra",
    radius: 3.4,
    model: "lmf",
    weapon: {
      kind: "lmf",
      projectileSpeed: 36,
      splash: 4,
      arc: true,
      homing: false,
      muzzle: 3.0,
    },
    squad: { base: 1, perLevel: 0.1, max: 2, spacing: 6.0 },
    role: "Saturação de área: dispara uma salva de foguetes de uma só vez.",
    unlocksTech: ["t7"],
  },

  // --- 8 Tanques e blindados ---
  {
    id: "bld-tanque",
    kind: "militar",
    name: "Carro de Combate",
    short: "CC",
    category: BLD,
    cost: 6,
    hp: 1050,
    dmg: 60,
    speed: 2.6,
    range: 9,
    cooldown: 1.6,
    targets: "terra",
    domain: "terra",
    radius: 3.4,
    model: "tanque",
    weapon: {
      kind: "canhao",
      projectileSpeed: 50,
      splash: 2.5,
      arc: false,
      homing: false,
      muzzle: 3.4,
    },
    priority: [BLD, ART],
    // Seção blindada: 1 carro no nível 1, até 3 (veículos são muito poderosos).
    squad: { base: 1, perLevel: 0.14, max: 3, spacing: 5.0 },
    role: "Torre giratória e canhão principal. Prioriza alvos estratégicos.",
    unlocksTech: ["t6"],
  },
  {
    id: "bld-vbld",
    kind: "militar",
    name: "Veículo Blindado",
    short: "VBTP",
    category: BLD,
    cost: 4,
    hp: 640,
    dmg: 30,
    speed: 3.4,
    range: 8,
    cooldown: 1.1,
    targets: "terra",
    domain: "terra",
    radius: 3.0,
    model: "vbld",
    weapon: {
      kind: "automatica",
      projectileSpeed: 90,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 2.4,
      tracer: true,
    },
    priority: [INF],
    // Pelotão mecanizado: 2 VBTP no nível 1, até 4.
    squad: { base: 2, perLevel: 0.16, max: 4, spacing: 4.4 },
    role: "Blindado leve rápido. Metralhadora contra infantaria e reconhecimento.",
    unlocksTech: ["t2"],
  },

  // --- 9 Drones ---
  {
    id: "rec-drone",
    kind: "militar",
    name: "Drone de Reconhecimento",
    short: "DRN-R",
    category: REC,
    cost: 2,
    hp: 90,
    dmg: 6,
    speed: 8.0,
    range: 13,
    cooldown: 1.4,
    targets: "terra",
    domain: "aereo",
    radius: 1.9,
    model: "drone-recon",
    weapon: {
      kind: "drone",
      projectileSpeed: 80,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.0,
      tracer: true,
    },
    // Esquadrilha de reconhecimento: 2 drones no nível 1, até 5.
    squad: { base: 2, perLevel: 0.2, max: 5, spacing: 3.6 },
    role: "Voa sobre obstáculos e revela uma área ampla. Inteligência aérea.",
    unlocksTech: ["t8"],
  },
  {
    id: "rec-drone-combate",
    kind: "militar",
    name: "Drone de Combate",
    short: "DRN-C",
    category: REC,
    cost: 4,
    hp: 150,
    dmg: 55,
    speed: 7.0,
    range: 10,
    cooldown: 1.5,
    targets: "terra",
    domain: "aereo",
    radius: 2.0,
    model: "drone-combate",
    weapon: {
      kind: "drone",
      projectileSpeed: 40,
      splash: 2.5,
      arc: false,
      homing: true,
      muzzle: 1.2,
    },
    priority: [INF, ART],
    // Esquadrilha de combate: 2 drones no nível 1, até 4.
    squad: { base: 2, perLevel: 0.16, max: 4, spacing: 3.6 },
    role: "Drone armado. Ataca unidades terrestres e não pode ser tocado por armas de terra.",
    unlocksTech: ["t8"],
  },

  // --- Defesa estática ---
  {
    id: "def-aa",
    kind: "militar",
    name: "Defesa Antiaérea",
    short: "AA",
    category: DEF,
    cost: 4,
    hp: 320,
    dmg: 55,
    speed: 2.0,
    range: 20,
    cooldown: 1.0,
    targets: "aereo",
    domain: "terra",
    radius: 2.8,
    model: "aa",
    weapon: {
      kind: "antiaereo",
      projectileSpeed: 70,
      splash: 0,
      arc: false,
      homing: true,
      muzzle: 1.8,
    },
    role: "Nega apoio aéreo e drones inimigos. Não atinge alvos terrestres.",
  },
  {
    id: "def-fortificacao",
    kind: "militar",
    name: "Fortificação de Campanha",
    short: "FORT",
    category: DEF,
    cost: 5,
    hp: 900,
    dmg: 22,
    speed: 0,
    range: 9,
    cooldown: 1.6,
    targets: "terra",
    domain: "terra",
    radius: 3.6,
    model: "fortificacao",
    weapon: {
      kind: "canhao",
      projectileSpeed: 40,
      splash: 1.5,
      arc: false,
      homing: false,
      muzzle: 2.2,
    },
    role: "Estrutura estática. Ancora uma posição e concede cobertura aliada.",
  },
  {
    id: "apo-posto",
    kind: "militar",
    name: "Posto de Socorro",
    short: "SOC",
    category: "apoio",
    cost: 4,
    hp: 260,
    dmg: 0,
    speed: 2.6,
    range: 4,
    cooldown: 2.0,
    targets: "terra",
    domain: "terra",
    radius: 2.6,
    model: "posto",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 100,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.4,
      tracer: true,
    },
    role: "Cura infantaria aliada num raio. Não dispara.",
  },
];

// ---------------------------------------------------------------------------
// Cartas de apoio (habilidades)
// ---------------------------------------------------------------------------

export const supportCards: SupportCard[] = [
  {
    id: "sup-aereo",
    kind: "apoio",
    name: "Ataque Aéreo",
    short: "AEREO",
    category: "apoio",
    cost: 7,
    ability: "ataque_aereo",
    magnitude: 160,
    radius: 9,
    role: "Bombardeio em área. Devastador, porém lento de recarregar.",
  },
  {
    id: "sup-gas",
    kind: "apoio",
    name: "Bomba de Gás Lacrimogêneo",
    short: "GÁS",
    category: "apoio",
    cost: 4,
    ability: "gas",
    duration: 10,
    magnitude: 28,
    radius: 8,
    role: "Nuvem tóxica: drena a vida de TODA unidade terrestre na área até a morte. Não distingue aliados.",
  },
  {
    id: "sup-reforcos",
    kind: "apoio",
    name: "Reforços",
    short: "REFORÇO",
    category: "apoio",
    cost: 5,
    ability: "reforcos",
    magnitude: 2,
    radius: 5,
    role: "Desembarca imediatamente dois pelotões de fuzileiros.",
  },
  {
    id: "sup-reparo",
    kind: "apoio",
    name: "Reparação de Veículos",
    short: "REPARO",
    category: "apoio",
    cost: 3,
    ability: "reparacao",
    magnitude: 220,
    radius: 6,
    role: "Restaura blindados e veículos num raio.",
  },
  {
    id: "sup-barricada",
    kind: "apoio",
    name: "Barricada",
    short: "BARR",
    category: "apoio",
    cost: 3,
    ability: "barricada",
    duration: 30,
    magnitude: 600,
    radius: 4,
    role: "Ergue obstáculo defensivo que bloqueia o avanço.",
  },
  {
    id: "sup-interferencia",
    kind: "apoio",
    name: "Interferência Eletrônica",
    short: "EW",
    category: "apoio",
    cost: 5,
    ability: "interferencia",
    duration: 6,
    radius: 11,
    role: "Silencia drones, artilharia e comunicações inimigas.",
    unlocksTech: ["t9"],
  },
  {
    id: "sup-evacuacao",
    kind: "apoio",
    name: "Evacuação Aeromédica",
    short: "EVAC",
    category: "apoio",
    cost: 4,
    ability: "evacuacao",
    magnitude: 160,
    radius: 6,
    role: "Retira e cura uma unidade própria em risco.",
  },
  {
    id: "sup-recon-avancado",
    kind: "apoio",
    name: "Reconhecimento Avançado",
    short: "REC+",
    category: "apoio",
    cost: 3,
    ability: "reconhecimento",
    duration: 12,
    radius: 16,
    role: "Revela uma área inteira da arena por tempo limitado.",
  },
  {
    id: "sup-paraquedistas",
    kind: "apoio",
    name: "Paraquedistas",
    short: "PQD",
    category: "apoio",
    cost: 6,
    ability: "paraquedistas",
    magnitude: 2,
    radius: 5,
    role: "Infiltração: lança pelotões paraquedistas atrás das linhas inimigas.",
    unlocksTech: ["t7"],
  },
  {
    id: "sup-bombardeiro",
    kind: "apoio",
    name: "Bombardeiro Tático",
    short: "BOMB",
    category: "apoio",
    cost: 8,
    ability: "bombardeiro",
    magnitude: 200,
    radius: 11,
    role: "Operação aérea de maior custo: passagem longa com sequência de impactos.",
    unlocksTech: ["t10"],
  },
];

export const allCards: Card[] = [...militaryCards, ...supportCards];
export const cardById = (id: string): Card => {
  const c = allCards.find((x) => x.id === id);
  if (!c) throw new Error(`Carta desconhecida: ${id}`);
  return c;
};
export const militaryById = (id: string): MilitaryCard => cardById(id) as MilitaryCard;

// Ícone próprio por carta: identidade instantânea no HUD (emoji por TIPO de unidade,
// não por categoria — senão todas as infantarias ficam iguais). O fallback usa a
// categoria, garantindo que nenhuma carta fique sem ícone.
export const CARD_ICON: Record<string, string> = {
  "inf-fuzileiros": "🪖",
  "inf-assalto": "🔫",
  "inf-antitanque": "🚀",
  "inf-engenheiro": "👷",
  "art-canhao": "💥",
  "art-obus": "🎯",
  "mss-lancador": "🚀",
  "mss-lmf": "🧨",
  "bld-tanque": "🛡️",
  "bld-vbld": "🚙",
  "rec-drone": "🛰️",
  "rec-drone-combate": "🛸",
  "def-aa": "📡",
  "def-fortificacao": "🧱",
  "apo-posto": "⛑️",
  "sup-aereo": "✈️",
  "inf-sniper": "🎯",
  "art-morteiro": "💣",
  "bld-caca-tanques": "🚜",
  "sup-gas": "☠️",
  "sup-reforcos": "🎖️",
  "sup-reparo": "🔧",
  "sup-barricada": "🚧",
  "sup-interferencia": "📶",
  "sup-evacuacao": "🚁",
  "sup-recon-avancado": "🔭",
  "sup-paraquedistas": "🪂",
  "sup-bombardeiro": "🛩️",
};

export const CATEGORY_ICON: Record<string, string> = {
  infantaria: "🪖",
  blindado: "🛡️",
  artilharia: "🎯",
  defesa: "🏰",
  reconhecimento: "🛰️",
  apoio: "✈️",
};

export function cardIcon(card: Card): string {
  return CARD_ICON[card.id] ?? CATEGORY_ICON[card.category] ?? "★";
}

// Baralho inicial desbloqueado (sem exigência de tecnologia).
export const startingDeck: string[] = [
  "inf-fuzileiros",
  "inf-assalto",
  "inf-antitanque",
  "inf-engenheiro",
  "art-canhao",
  "bld-vbld",
  "rec-drone",
  "sup-gas",
];

export const isUnlocked = (card: Card, techs: string[]): boolean =>
  !card.unlocksTech || card.unlocksTech.every((t) => techs.includes(t));

// ---------------------------------------------------------------------------
// Nível de carta — escalonamento de vida/dano/cura
// ---------------------------------------------------------------------------

export const CARD_MAX_LEVEL = 15;
export const MAX_CARD_LEVEL = CARD_MAX_LEVEL;

/** Multiplicador de atributos evolutivos: 1 + 0,05 × (nível − 1). */
export function cardLevelMultiplier(level: number): number {
  const lvl = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.round(level)));
  return 1 + 0.05 * (lvl - 1);
}

// Teto rígido de unidades por esquadrão. Mesmo que uma carta defina um valor maior,
// o motor nunca passa deste limite — protege o desempenho e o equilíbrio.
export const SQUAD_HARD_CAP = 20;

/**
 * Tamanho da força (esquadrão) que uma carta militar gera em um dado nível.
 * É a ÚNICA fonte de verdade para "quantas unidades esta carta envia": a progressão
 * de quantidade fica centralizada aqui, nunca espalhada pelo código.
 */
export function squadCount(card: MilitaryCard, level: number): number {
  const spec = card.squad;
  if (!spec) return 1;
  const lvl = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.round(level)));
  const n = spec.base + spec.perLevel * (lvl - 1);
  return Math.max(1, Math.min(SQUAD_HARD_CAP, Math.min(spec.max, Math.round(n))));
}

/**
 * O balanceamento histórico do catálogo foi calibrado assumindo UMA unidade por
 * carta. Ao transformar a carta em esquadrão, reduzimos os atributos de cada
 * membro para manter o poder TOTAL controlado: o poder total cresce apenas como
 * a raiz quarta do tamanho do esquadrão (n^0,25), o que dá aos enxames uma leve
 * vantagem — compensada por armas de área (artilharia, bombardeiro, drones).
 */
export function squadPowerScale(count: number): number {
  if (count <= 1) return 1;
  return 1 / Math.pow(count, 0.75);
}

/** Cópias necessárias para ir do nível n ao n+1 (índice 0 = 1→2). */
export const LEVEL_UP_COPIES = [2, 4, 6, 10, 15, 20, 30, 40, 55, 70, 90, 110, 140, 175] as const;

export function copiesToLevel(level: number): number {
  return LEVEL_UP_COPIES[Math.max(0, Math.min(LEVEL_UP_COPIES.length - 1, level - 1))] ?? 0;
}

// ---------------------------------------------------------------------------
// Doutrinas
// ---------------------------------------------------------------------------

export const doctrines: Record<Doctrine, DoctrineModifier> = {
  Mobilidade: {
    id: "Mobilidade",
    summary: "Unidades deslocam-se mais rápido; flanquear é mais fácil.",
    costMultiplier: {},
    speedMultiplier: { reconhecimento: 1.2, infantaria: 1.12, blindado: 1.08 },
    dmgMultiplier: {},
    hpMultiplier: {},
    captureMultiplier: 1.0,
    combinedArmsBonus: 0.05,
  },
  "Defesa territorial": {
    id: "Defesa territorial",
    summary: "Fortificações mais duras e captura mais lenta para o inimigo.",
    costMultiplier: { defesa: 0.85 },
    speedMultiplier: {},
    dmgMultiplier: { defesa: 1.2 },
    hpMultiplier: { defesa: 1.3, infantaria: 1.1 },
    captureMultiplier: 1.15,
    combinedArmsBonus: 0.03,
  },
  "Poder de fogo": {
    id: "Poder de fogo",
    summary: "Artilharia e apoio com dano e alcance superiores.",
    costMultiplier: { artilharia: 0.9 },
    speedMultiplier: {},
    dmgMultiplier: { artilharia: 1.35, apoio: 1.2 },
    hpMultiplier: {},
    captureMultiplier: 0.9,
    combinedArmsBonus: 0.04,
  },
  Infantaria: {
    id: "Infantaria",
    summary: "Infantaria barata e eficiente em captura.",
    costMultiplier: { infantaria: 0.8 },
    speedMultiplier: { infantaria: 1.1 },
    dmgMultiplier: { infantaria: 1.2 },
    hpMultiplier: { infantaria: 1.15 },
    captureMultiplier: 1.3,
    combinedArmsBonus: 0.05,
  },
  Mecanizada: {
    id: "Mecanizada",
    summary: "Blindados e veículos com custo e mobilidade melhores.",
    costMultiplier: { blindado: 0.85, reconhecimento: 0.9 },
    speedMultiplier: { blindado: 1.15 },
    dmgMultiplier: { blindado: 1.1 },
    hpMultiplier: { blindado: 1.1 },
    captureMultiplier: 1.0,
    combinedArmsBonus: 0.08,
  },
  "Operações combinadas": {
    id: "Operações combinadas",
    summary: "Bônus crescente por combinar categorias diferentes na mesma área.",
    costMultiplier: {},
    speedMultiplier: {},
    dmgMultiplier: {},
    hpMultiplier: {},
    captureMultiplier: 1.05,
    combinedArmsBonus: 0.14,
  },
};

export const allDoctrines = Object.keys(doctrines) as Doctrine[];
export const doctrineList = allDoctrines;

// ---------------------------------------------------------------------------
// Comandantes
// ---------------------------------------------------------------------------

export const commanders: Commander[] = [
  {
    id: "cmd-varela",
    name: "Cel. Varela",
    personality: "Metódico",
    doctrine: "Operações combinadas",
    note: "Avança por setores, nunca sozinho. Espera a composição fechar.",
  },
  {
    id: "cmd-sarmiento",
    name: "Cmdt. Sarmiento",
    personality: "Agressivo",
    doctrine: "Mecanizada",
    note: "Empurra blindados cedo e disputa o setor central.",
  },
  {
    id: "cmd-orlov",
    name: "Gen. Orlov",
    personality: "Econômico",
    doctrine: "Poder de fogo",
    note: "Acumula comando e castiga com artilharia em massa.",
  },
  {
    id: "cmd-lima",
    name: "Maj. Lima",
    personality: "Cauteloso",
    doctrine: "Defesa territorial",
    note: "Prioriza segurar objetivos e sangrar o atacante.",
  },
  {
    id: "cmd-duarte",
    name: "Cap. Duarte",
    personality: "Oportunista",
    doctrine: "Mobilidade",
    note: "Reage ao erro do adversário e toma o objetivo abandonado.",
  },
];

export const commanderById = (id: string): Commander =>
  commanders.find((c) => c.id === id) ?? commanders[0]!;

// ---------------------------------------------------------------------------
// Arenas
// ---------------------------------------------------------------------------

const cp = (
  id: string,
  name: string,
  sector: "norte" | "central" | "sul",
  x: number,
  y: number,
  value: number,
): Arena["controlPoints"][number] => ({
  id,
  name,
  sector,
  x,
  y,
  radius: 7,
  value,
  owner: "neutro",
  progress: { blue: 0, red: 0 },
});

const terr = (
  id: string,
  name: string,
  x: number,
  y: number,
  radius = 5,
  base = false,
): Territory => ({
  id,
  name,
  x,
  y,
  radius,
  owner: "neutro",
  progress: { blue: 0, red: 0 },
  ...(base ? { base: true } : {}),
});

// Bases principais + duas torres defensivas por lado. O azul defende o OESTE, o
// vermelho o LESTE; os territórios neutros ficam entre eles, ao longo do front.
// As demais posições defensivas NÃO nascem construídas: são conquistadas no campo
// (territórios) e transformadas em bases avançadas pelos engenheiros durante a partida.
function standardStructures(): StructureSpec[] {
  return [
    {
      id: "base-blue",
      kind: "base-principal",
      side: "blue",
      name: "Base Principal Aliada",
      x: 8,
      y: 23,
      radius: 9,
      hp: 4000,
      dmg: 45,
      range: 15,
      cooldown: 1.4,
      targets: "ambos",
    },
    {
      id: "torre-blue-w",
      kind: "torre",
      side: "blue",
      name: "Bunker Norte",
      x: 26,
      y: 12,
      radius: 5,
      hp: 1700,
      dmg: 60,
      range: 18,
      cooldown: 0.9,
      targets: "ambos",
    },
    {
      id: "torre-blue-e",
      kind: "torre",
      side: "blue",
      name: "Bunker Sul",
      x: 26,
      y: 34,
      radius: 5,
      hp: 1700,
      dmg: 60,
      range: 18,
      cooldown: 0.9,
      targets: "ambos",
    },
    {
      id: "base-red",
      kind: "base-principal",
      side: "red",
      name: "Base Principal Inimiga",
      x: 92,
      y: 23,
      radius: 9,
      hp: 4000,
      dmg: 45,
      range: 15,
      cooldown: 1.4,
      targets: "ambos",
    },
    {
      id: "torre-red-w",
      kind: "torre",
      side: "red",
      name: "Bunker Norte",
      x: 74,
      y: 12,
      radius: 5,
      hp: 1700,
      dmg: 60,
      range: 18,
      cooldown: 0.9,
      targets: "ambos",
    },
    {
      id: "torre-red-e",
      kind: "torre",
      side: "red",
      name: "Bunker Sul",
      x: 74,
      y: 34,
      radius: 5,
      hp: 1700,
      dmg: 60,
      range: 18,
      cooldown: 0.9,
      targets: "ambos",
    },
  ];
}

// Pontos de expansão: uma MALHA de territórios que cria rotas de avanço (três
// corredores — norte, centro e sul) em vez de uma linha reta. São 25 pontos: 11 de
// cada lado + 3 no centro (as duas bases neutras e o nó central). Cada posição do azul
// tem uma equivalente espelhada do vermelho (x → 100 − x); sem isso um lado nasce com
// posições melhores e o resultado passa a depender do lado, não da jogada.
function standardTerritories(): Territory[] {
  const blue: [string, string, number, number, number][] = [
    ["t-nw", "Colina Noroeste", 20, 7, 4],
    ["t-n2", "Bosque Norte", 36, 8, 4],
    ["t-n3", "Posto Norte", 45, 14, 3.8],
    ["t-w1", "Ancoradouro", 16, 21, 4],
    ["t-w2", "Encruzilhada Oeste", 30, 24, 4.2],
    ["t-w3", "Fronteira Oeste", 43, 24, 4],
    ["t-sw", "Vau Sudoeste", 19, 38, 4],
    ["t-s2", "Mata Sul", 35, 39, 4],
    ["t-s3", "Depósito Sul", 45, 33, 3.8],
    ["t-w4", "Vale Oeste", 27, 31, 4],
    ["t-w5", "Mata Central", 31, 16, 3.8],
  ];
  const redNames: Record<string, [string, string]> = {
    "t-nw": ["t-ne", "Colina Nordeste"],
    "t-n2": ["t-n4", "Bosque Nordeste"],
    "t-n3": ["t-n5", "Posto Nordeste"],
    "t-w1": ["t-e1", "Depósito Leste"],
    "t-w2": ["t-e2", "Encruzilhada Leste"],
    "t-w3": ["t-e3", "Fronteira Leste"],
    "t-sw": ["t-se", "Cume Sudeste"],
    "t-s2": ["t-s4", "Mata Sudeste"],
    "t-s3": ["t-s5", "Ponte Leste"],
    "t-w4": ["t-e4", "Vale Leste"],
    "t-w5": ["t-e5", "Mata Central Leste"],
  };
  const list: Territory[] = [
    // BASES NEUTRAS no meio do mapa: instalações militares já erguidas, de ninguém.
    // São o prêmio central da partida — quem as toma ganha posição no centro, sem
    // precisar construir. Ladeiam o nó central.
    terr("bn-n", "Base Neutra Norte", 50, 12, 6, true),
    terr("bn-s", "Base Neutra Sul", 50, 34, 6, true),
    // Nó central: ponto de expansão clássico (marcador de captura sem base erguida).
    terr("t-c", "Nó Central", 50, 23, 4.6),
  ];
  for (const [id, name, x, y, r] of blue) {
    list.push(terr(id, name, x, y, r));
    const [rid, rname] = redNames[id]!;
    list.push(terr(rid, rname, 100 - x, y, r));
  }
  return list;
}

// Corredores de avanço: três rotas (norte, centro, sul) ligando as bases principais
// passando pelos territórios. Servem de CAMINHOS desenhados no terreno e de leitura
// estratégica: o jogador vê por onde pode atacar em vez de encarar um campo vazio.
function standardRoutes(): { from: [number, number]; to: [number, number] }[] {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({
    from: [x1, y1] as [number, number],
    to: [x2, y2] as [number, number],
  });
  return [
    // corredor norte
    seg(8, 23, 20, 7),
    seg(20, 7, 36, 8),
    seg(36, 8, 45, 14),
    seg(45, 14, 50, 12),
    seg(50, 12, 55, 14),
    seg(55, 14, 64, 8),
    seg(64, 8, 80, 7),
    seg(80, 7, 92, 23),
    // corredor central
    seg(8, 23, 30, 24),
    seg(30, 24, 43, 24),
    seg(43, 24, 50, 23),
    seg(50, 23, 57, 24),
    seg(57, 24, 70, 24),
    seg(70, 24, 92, 23),
    // corredor sul
    seg(8, 23, 19, 38),
    seg(19, 38, 35, 39),
    seg(35, 39, 45, 33),
    seg(45, 33, 50, 34),
    seg(50, 34, 55, 33),
    seg(55, 33, 65, 39),
    seg(65, 39, 81, 38),
    seg(81, 38, 92, 23),
  ];
}

// Geometria padrão do teatro: oeste = azul, leste = vermelho. Cada arena troca
// terreno, pontos de controle e obstáculos, mantendo a MESMA estrutura espacial.
const BLUE_ZONE = { x: 2, y: 2, w: 22, h: 42 };
const RED_ZONE = { x: 76, y: 2, w: 22, h: 42 };

export const arenas: Arena[] = [
  {
    id: "arena-cidade",
    name: "Perímetro Urbano",
    terrain: "Cidade",
    description:
      "Ruas estreitas, prédios como cobertura e posições defensivas. Blindados sofrem, infantaria domina.",
    controlPoints: [
      cp("cp-n", "Praça Norte", "norte", 28, 10, 1),
      cp("cp-c", "Estação Central", "central", 50, 23, 2),
      cp("cp-s", "Terminal Sul", "sul", 72, 36, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "construcao",
        x: 34,
        y: 11,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.3,
      },
      {
        id: "o2",
        kind: "construcao",
        x: 34,
        y: 35,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.3,
      },
      {
        id: "o3",
        kind: "construcao",
        x: 66,
        y: 11,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.3,
      },
      {
        id: "o4",
        kind: "construcao",
        x: 66,
        y: 35,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.3,
      },
    ],
    routes: standardRoutes(),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-floresta",
    name: "Corredor Amazônico",
    terrain: "Floresta",
    description:
      "Vegetação densa, rios e mobilidade limitada. Reconhecimento vale mais que blindagem.",
    controlPoints: [
      cp("cp-n", "Clareira Norte", "norte", 46, 10, 1),
      cp("cp-c", "Porto Fluvial", "central", 50, 23, 2),
      cp("cp-s", "Trilha Sul", "sul", 54, 36, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "rio",
        x: 50,
        y: 10,
        radius: 12,
        blocksGround: false,
        slow: 0.55,
        cover: 0,
      },
      {
        id: "o2",
        kind: "vegetacao",
        x: 30,
        y: 23,
        radius: 8,
        blocksGround: false,
        slow: 0.7,
        cover: 0.25,
      },
      {
        id: "o3",
        kind: "vegetacao",
        x: 70,
        y: 23,
        radius: 8,
        blocksGround: false,
        slow: 0.7,
        cover: 0.25,
      },
      {
        id: "o4",
        kind: "vegetacao",
        x: 50,
        y: 36,
        radius: 7,
        blocksGround: false,
        slow: 0.75,
        cover: 0.2,
      },
    ],
    routes: standardRoutes(),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-deserto",
    name: "Vazio do Saara",
    terrain: "Campo aberto",
    description:
      "Longas distâncias, exposição total e logística decisiva. Artilharia e mobilidade mandam.",
    controlPoints: [
      cp("cp-n", "Poço Norte", "norte", 28, 9, 1),
      cp("cp-c", "Oásis Central", "central", 50, 23, 2),
      cp("cp-s", "Acampamento Sul", "sul", 72, 37, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "elevacao",
        x: 34,
        y: 23,
        radius: 8,
        blocksGround: false,
        slow: 0.85,
        cover: 0.15,
      },
      {
        id: "o2",
        kind: "elevacao",
        x: 66,
        y: 23,
        radius: 8,
        blocksGround: false,
        slow: 0.85,
        cover: 0.15,
      },
    ],
    routes: standardRoutes(),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-montanha",
    name: "Passos dos Apeninos",
    terrain: "Montanha",
    description:
      "Passagens estreitas, elevações e rotas restritas. Quem domina o cume domina a batalha.",
    controlPoints: [
      cp("cp-n", "Cume Norte", "norte", 28, 9, 2),
      cp("cp-c", "Desfiladeiro", "central", 50, 23, 2),
      cp("cp-s", "Base Sul", "sul", 72, 37, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "elevacao",
        x: 40,
        y: 10,
        radius: 10,
        blocksGround: true,
        slow: 0.6,
        cover: 0.3,
      },
      {
        id: "o2",
        kind: "elevacao",
        x: 40,
        y: 36,
        radius: 10,
        blocksGround: true,
        slow: 0.6,
        cover: 0.3,
      },
      {
        id: "o3",
        kind: "elevacao",
        x: 60,
        y: 10,
        radius: 10,
        blocksGround: true,
        slow: 0.6,
        cover: 0.3,
      },
      {
        id: "o4",
        kind: "elevacao",
        x: 60,
        y: 36,
        radius: 10,
        blocksGround: true,
        slow: 0.6,
        cover: 0.3,
      },
    ],
    routes: standardRoutes(),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-rio",
    name: "Travessia do Paraná",
    terrain: "Travessia de rio",
    description:
      "O rio corta a arena ao meio. Pontes são gargalos: quem as segura controla o fluxo.",
    controlPoints: [
      cp("cp-n", "Margem Norte", "norte", 28, 10, 1),
      cp("cp-c", "Ponte Central", "central", 50, 23, 2),
      cp("cp-s", "Margem Sul", "sul", 72, 36, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      { id: "o1", kind: "rio", x: 50, y: 23, radius: 22, blocksGround: true, slow: 0.5, cover: 0 },
      {
        id: "o2",
        kind: "vegetacao",
        x: 30,
        y: 8,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.2,
      },
      {
        id: "o3",
        kind: "vegetacao",
        x: 70,
        y: 38,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.2,
      },
    ],
    routes: standardRoutes(),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-fortificada",
    name: "Linha Fortificada",
    terrain: "Região fortificada",
    description: "Casamatas e arame farpado. Engenharia abre caminho; artilharia castiga de longe.",
    controlPoints: [
      cp("cp-n", "Reduto Norte", "norte", 28, 10, 1),
      cp("cp-c", "Reduto Central", "central", 50, 23, 2),
      cp("cp-s", "Reduto Sul", "sul", 72, 36, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "construcao",
        x: 42,
        y: 23,
        radius: 8,
        blocksGround: true,
        slow: 0.7,
        cover: 0.35,
      },
      {
        id: "o2",
        kind: "construcao",
        x: 58,
        y: 23,
        radius: 8,
        blocksGround: true,
        slow: 0.7,
        cover: 0.35,
      },
      {
        id: "o3",
        kind: "construcao",
        x: 50,
        y: 11,
        radius: 6,
        blocksGround: false,
        slow: 0.85,
        cover: 0.25,
      },
    ],
    routes: standardRoutes(),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
];

// As arenas são autorais num espaço de projeto de 46 unidades de altura. `deepenArena`
// reescala todo Y para o mundo atual (`WORLD_H`), para aumentar a profundidade do campo
// sem reescrever à mão cada coordenada. Raios NÃO mudam: as estruturas seguem círculos.
function deepenArena(a: Arena): Arena {
  const dy = deepenY;
  return {
    ...a,
    controlPoints: a.controlPoints.map((p) => ({ ...p, y: dy(p.y) })),
    territories: a.territories.map((t) => ({ ...t, y: dy(t.y) })),
    structures: a.structures.map((s) => ({ ...s, y: dy(s.y) })),
    obstacles: a.obstacles.map((o) => ({ ...o, y: dy(o.y) })),
    routes: a.routes.map((r) => ({
      from: [r.from[0], dy(r.from[1])] as [number, number],
      to: [r.to[0], dy(r.to[1])] as [number, number],
    })),
    deployZone: {
      blue: { ...a.deployZone.blue, y: dy(a.deployZone.blue.y), h: dy(a.deployZone.blue.h) },
      red: { ...a.deployZone.red, y: dy(a.deployZone.red.y), h: dy(a.deployZone.red.h) },
    },
  };
}

export const arenaByTerrain = (terrain: string): Arena =>
  deepenArena(arenas.find((a) => a.terrain === terrain) ?? arenas[0]!);
export const arenaById = (id: string): Arena =>
  deepenArena(arenas.find((a) => a.id === id) ?? arenas[0]!);
