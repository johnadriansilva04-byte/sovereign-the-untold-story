// Progressão do SOVEREIGN: tecnologia, campanha e recompensas.
// Regra de ouro: a campanha ensina, o PvP testa. O que se ganha na campanha
// (cartas e acessórios) é o que se leva para o PvP — e no PvP se pode perder.

import type { TerrainKind } from "@/game/battle/types";

// ---------------------------------------------------------------------------
// Tecnologia
// ---------------------------------------------------------------------------

export interface TechDef {
  id: string;
  branch: "terrestre" | "aerea" | "suporte";
  name: string;
  summary: string;
  cost: number; // pontos de pesquisa
  unlocksCards?: string[];
  requires?: string[];
  effect?: Partial<{
    commandMax: number;
    regen: number;
    industry: number;
    logistics: number;
    military: number;
    stability: number;
    influence: number;
  }>;
}

export const techs: TechDef[] = [
  // Terrestre
  {
    id: "t1",
    branch: "terrestre",
    name: "Infantaria Avançada",
    summary: "Doutrina de infantaria e equipamento individual.",
    cost: 0,
  },
  {
    id: "t2",
    branch: "terrestre",
    name: "Blindagem",
    summary: "Blindados leves em produção nacional.",
    cost: 1,
    effect: { industry: 4 },
  },
  {
    id: "t3",
    branch: "terrestre",
    name: "Veículos Mecanizados",
    summary: "Mecanização da infantaria.",
    cost: 2,
    requires: ["t2"],
  },
  {
    id: "t4",
    branch: "terrestre",
    name: "Artilharia",
    summary: "Morteiros e obuses de campanha.",
    cost: 0,
  },
  {
    id: "t5",
    branch: "terrestre",
    name: "Logística Militar",
    summary: "Sustentação de operações longas.",
    cost: 2,
    effect: { logistics: 6, commandMax: 1 },
  },
  {
    id: "t6",
    branch: "terrestre",
    name: "Blindado Pesado",
    summary: "Carros de combate de primeira linha.",
    cost: 3,
    requires: ["t2"],
    unlocksCards: ["bld-tanque"],
    effect: { industry: 5 },
  },
  {
    id: "t7",
    branch: "terrestre",
    name: "Foguetes de Campanha",
    summary: "Saturação de área e alcance estendido.",
    cost: 3,
    requires: ["t4"],
    unlocksCards: ["mss-lmf"],
  },
  {
    id: "t10",
    branch: "terrestre",
    name: "Tropa de Montanha",
    summary: "Especialistas em terreno acidentado.",
    cost: 2,
    unlocksCards: ["inf-assalto"],
  },
  {
    id: "t11",
    branch: "terrestre",
    name: "Anfíbios",
    summary: "Travessia de rios e desembarque.",
    cost: 3,
    requires: ["t3"],
    unlocksCards: ["bld-vbld"],
  },
  // Aérea
  {
    id: "t8",
    branch: "aerea",
    name: "Reconhecimento Aéreo",
    summary: "Drones e vigilância de área.",
    cost: 1,
    unlocksCards: ["rec-drone"],
  },
  {
    id: "t9",
    branch: "aerea",
    name: "Guerra Eletrônica",
    summary: "Interferência em comunicações inimigas.",
    cost: 3,
    requires: ["t8"],
    unlocksCards: ["sup-interferencia"],
  },
  {
    id: "t12",
    branch: "aerea",
    name: "Aviação de Apoio",
    summary: "Ataque aéreo e evacuação aeromédica.",
    cost: 3,
    requires: ["t8"],
    effect: { military: 3 },
  },
  // Suporte
  {
    id: "t13",
    branch: "suporte",
    name: "Engenharia de Combate",
    summary: "Fortificações e reparo em campanha.",
    cost: 2,
  },
  {
    id: "t14",
    branch: "suporte",
    name: "Medicina Militar",
    summary: "Reduz baixas e melhora a recuperação.",
    cost: 2,
    effect: { stability: 5 },
  },
  {
    id: "t15",
    branch: "suporte",
    name: "Sistemas de Manutenção",
    summary: "Reposição de equipamentos perdidos.",
    cost: 2,
    requires: ["t13"],
    effect: { industry: 4, logistics: 4 },
  },
];

export const techById = (id: string): TechDef | undefined => techs.find((t) => t.id === id);

export const techsByBranch = (branch: TechDef["branch"]): TechDef[] =>
  techs.filter((t) => t.branch === branch);

export function canResearch(tech: TechDef, owned: string[]): boolean {
  if (owned.includes(tech.id)) return false;
  return (tech.requires ?? []).every((r) => owned.includes(r));
}

// ---------------------------------------------------------------------------
// Faixas de desbloqueio de cartas (progressão permanente)
// ---------------------------------------------------------------------------

export interface UnlockTier {
  id: string;
  name: string;
  summary: string;
  level: number; // nível de comandante exigido
  cards: string[];
}

export const unlockTiers: UnlockTier[] = [
  {
    id: "faixa-1",
    name: "Recrutamento",
    summary: "Movimentação, captura, reconhecimento e defesa.",
    level: 1,
    cards: [
      "inf-fuzileiros",
      "inf-engenheiro",
      "bld-vbld",
      "rec-drone",
      "sup-fumaca",
      "sup-barricada",
      "sup-recon-avancado",
    ],
  },
  {
    id: "faixa-2",
    name: "Operações táticas",
    summary: "Combate próximo, fogo direto e sustentação.",
    level: 3,
    cards: [
      "inf-assalto",
      "inf-antitanque",
      "art-canhao",
      "apo-posto",
      "def-aa",
      "rec-drone-combate",
      "sup-reparo",
      "sup-reforcos",
      "sup-evacuacao",
    ],
  },
  {
    id: "faixa-3",
    name: "Guerra mecanizada",
    summary: "Blindados pesados, mísseis e guerra eletrônica.",
    level: 6,
    cards: [
      "bld-tanque",
      "mss-lancador",
      "def-fortificacao",
      "art-obus",
      "mss-lmf",
      "sup-interferencia",
    ],
  },
  {
    id: "faixa-4",
    name: "Operações especiais",
    summary: "Apoio aéreo pesado e infiltração.",
    level: 10,
    cards: ["sup-aereo", "sup-paraquedistas", "sup-bombardeiro"],
  },
];

export function unlockTierForCard(cardId: string): UnlockTier | undefined {
  return unlockTiers.find((t) => t.cards.includes(cardId));
}

// ---------------------------------------------------------------------------
// Acessórios
// ---------------------------------------------------------------------------

export interface AccessoryDef {
  id: string;
  name: string;
  short: string;
  kind: "ofensivo" | "defensivo" | "apoio";
  cost: number; // Sovereigns
  summary: string;
  effect: string;
  // ajustes aplicados ao teatro
  mod: {
    commandMax?: number;
    regen?: number;
    dmg?: Partial<Record<string, number>>; // por categoria
    hp?: Partial<Record<string, number>>;
    speed?: Partial<Record<string, number>>;
    capture?: number;
    sight?: number;
  };
}

export const accessories: AccessoryDef[] = [
  {
    id: "acc-radio",
    name: "Rádio de Campanha",
    short: "RÁDIO",
    kind: "apoio",
    cost: 120,
    summary: "Comunicações de campanha da FEB.",
    effect: "+1 de comando máximo.",
    mod: { commandMax: 1 },
  },
  {
    id: "acc-obus-feb",
    name: "Doutrina de Obuses",
    short: "OBUS",
    kind: "ofensivo",
    cost: 200,
    summary: "Tiro ajustado por observadores avançados.",
    effect: "+15% de dano de artilharia.",
    mod: { dmg: { artilharia: 0.15 } },
  },
  {
    id: "acc-cobra",
    name: "Insígnia da Cobra",
    short: "COBRA",
    kind: "apoio",
    cost: 240,
    summary: "O símbolo dos pracinhas. Coesão de tropa.",
    effect: "+8% de dano e +5% de vida na infantaria.",
    mod: { dmg: { infantaria: 0.08 }, hp: { infantaria: 0.05 } },
  },
  {
    id: "acc-blindagem",
    name: "Blindagem Reativa",
    short: "BLIND",
    kind: "defensivo",
    cost: 220,
    summary: "Kits de blindagem aplicados em campanha.",
    effect: "+12% de vida em blindados.",
    mod: { hp: { blindado: 0.12 } },
  },
  {
    id: "acc-motorizada",
    name: "Coluna Motorizada",
    short: "MOTOR",
    kind: "ofensivo",
    cost: 180,
    summary: "Caminhões e jipes para deslocamento rápido.",
    effect: "+10% de velocidade em infantaria e blindados.",
    mod: { speed: { infantaria: 0.1, blindado: 0.1 } },
  },
  {
    id: "acc-observacao",
    name: "Posto de Observação",
    short: "OBS",
    kind: "apoio",
    cost: 160,
    summary: "Olhos no terreno. Alcance de visão ampliado.",
    effect: "+20% de alcance de visão.",
    mod: { sight: 0.2 },
  },
  {
    id: "acc-trincheira",
    name: "Kit de Trincheira",
    short: "TRINC",
    kind: "defensivo",
    cost: 150,
    summary: "Fortificação rápida em terreno disputado.",
    effect: "+15% de captura e +8% de vida na defesa.",
    mod: { capture: 0.15, hp: { defesa: 0.08 } },
  },
  {
    id: "acc-mapa",
    name: "Carta Topográfica",
    short: "MAPA",
    kind: "apoio",
    cost: 130,
    summary: "Leitura de terreno e rotas.",
    effect: "+5% de velocidade geral.",
    mod: { speed: { infantaria: 0.05, blindado: 0.05, reconhecimento: 0.05 } },
  },
];

export const accessoryById = (id: string): AccessoryDef | undefined =>
  accessories.find((a) => a.id === id);

// Combina os acessórios equipados em modificadores aplicáveis à batalha.
export function modsFromAccessories(ids: string[]): import("@/game/battle/types").SideModifiers {
  const out: import("@/game/battle/types").SideModifiers = {};
  const dmg: Record<string, number> = {};
  const hp: Record<string, number> = {};
  const speed: Record<string, number> = {};
  for (const id of ids) {
    const acc = accessoryById(id);
    if (!acc) continue;
    if (acc.mod.commandMax) out.commandMax = (out.commandMax ?? 0) + acc.mod.commandMax;
    if (acc.mod.capture) out.capture = (out.capture ?? 0) + acc.mod.capture;
    if (acc.mod.sight) out.sight = (out.sight ?? 0) + acc.mod.sight;
    for (const [k, v] of Object.entries(acc.mod.dmg ?? {})) dmg[k] = (dmg[k] ?? 0) + (v ?? 0);
    for (const [k, v] of Object.entries(acc.mod.hp ?? {})) hp[k] = (hp[k] ?? 0) + (v ?? 0);
    for (const [k, v] of Object.entries(acc.mod.speed ?? {})) speed[k] = (speed[k] ?? 0) + (v ?? 0);
  }
  if (Object.keys(dmg).length) out.dmg = dmg;
  if (Object.keys(hp).length) out.hp = hp;
  if (Object.keys(speed).length) out.speed = speed;
  return out;
}

// ---------------------------------------------------------------------------
// Inventário
// ---------------------------------------------------------------------------

export interface InventoryItem {
  kind: "carta" | "acessorio";
  id: string;
  quantity: number;
  level: number;
}

export interface Inventory {
  cards: Record<string, number>; // cardId -> quantidade
  accessories: Record<string, number>; // accessoryId -> quantidade
}

export const emptyInventory = (): Inventory => ({ cards: {}, accessories: {} });

export function ownsCard(inv: Inventory, cardId: string): boolean {
  return (inv.cards[cardId] ?? 0) > 0;
}

export function ownsAccessory(inv: Inventory, accId: string): boolean {
  return (inv.accessories[accId] ?? 0) > 0;
}

export function addCard(inv: Inventory, cardId: string, n = 1): Inventory {
  return { ...inv, cards: { ...inv.cards, [cardId]: (inv.cards[cardId] ?? 0) + n } };
}

export function addAccessory(inv: Inventory, accId: string, n = 1): Inventory {
  return {
    ...inv,
    accessories: { ...inv.accessories, [accId]: (inv.accessories[accId] ?? 0) + n },
  };
}

export function removeCard(inv: Inventory, cardId: string, n = 1): Inventory {
  const next = { ...inv.cards };
  const q = (next[cardId] ?? 0) - n;
  if (q <= 0) delete next[cardId];
  else next[cardId] = q;
  return { ...inv, cards: next };
}

export function removeAccessory(inv: Inventory, accId: string, n = 1): Inventory {
  const next = { ...inv.accessories };
  const q = (next[accId] ?? 0) - n;
  if (q <= 0) delete next[accId];
  else next[accId] = q;
  return { ...inv, accessories: next };
}

export const cardCount = (inv: Inventory): number =>
  Object.values(inv.cards).reduce((a, b) => a + b, 0);

export const accessoryCount = (inv: Inventory): number =>
  Object.values(inv.accessories).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Recompensas da campanha
// ---------------------------------------------------------------------------

export interface Reward {
  cards?: string[];
  accessories?: string[];
  techs?: string[];
  research?: number;
  sovereigns?: number;
  xp?: number;
}

export function mergeRewards(a: Reward, b: Reward): Reward {
  return {
    cards: [...(a.cards ?? []), ...(b.cards ?? [])],
    accessories: [...(a.accessories ?? []), ...(b.accessories ?? [])],
    techs: [...(a.techs ?? []), ...(b.techs ?? [])],
    research: (a.research ?? 0) + (b.research ?? 0),
    sovereigns: (a.sovereigns ?? 0) + (b.sovereigns ?? 0),
    xp: (a.xp ?? 0) + (b.xp ?? 0),
  };
}

export function describeReward(r: Reward): string[] {
  const out: string[] = [];
  if (r.cards?.length) out.push(`Cartas: ${r.cards.length}`);
  if (r.accessories?.length) out.push(`Acessórios: ${r.accessories.length}`);
  if (r.techs?.length) out.push(`Tecnologia: ${r.techs.length}`);
  if (r.research) out.push(`Pesquisa: +${r.research}`);
  if (r.sovereigns) out.push(`Sovereigns: +${r.sovereigns}`);
  return out;
}

// ---------------------------------------------------------------------------
// Dificuldade
// ---------------------------------------------------------------------------

export type Difficulty = "recruta" | "veterano" | "elite" | "soberano" | "llm";

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  summary: string;
  aiIntervalMult: number;
  aiCommandMult: number;
  aiReserveBonus: number;
  rewardMult: number;
  isLlm?: boolean;
}

export const difficulties: DifficultyDef[] = [
  {
    id: "recruta",
    name: "Recruta",
    summary: "O inimigo hesita e economiza demais. Ideal para aprender a arena.",
    aiIntervalMult: 1.6,
    aiCommandMult: 0.8,
    aiReserveBonus: 3,
    rewardMult: 0.7,
  },
  {
    id: "veterano",
    name: "Veterano",
    summary: "Adversário sólido: responde à sua composição e joga pelas regras.",
    aiIntervalMult: 0.9,
    aiCommandMult: 1.0,
    aiReserveBonus: 0,
    rewardMult: 1.0,
  },
  {
    id: "elite",
    name: "Elite",
    summary: "Decide rápido, contra-ataca e explora cada carta mal gasta.",
    aiIntervalMult: 0.6,
    aiCommandMult: 1.15,
    aiReserveBonus: -1,
    rewardMult: 1.35,
  },
  {
    id: "soberano",
    name: "Soberano",
    summary: "Pressão constante, coordenação de cartas e leitura do seu erro. Vencer exige plano.",
    aiIntervalMult: 0.45,
    aiCommandMult: 1.3,
    aiReserveBonus: -2,
    rewardMult: 1.7,
  },
  {
    id: "llm",
    name: "Comandante IA (LLM)",
    summary: "Um modelo raciocina e decide em tempo real. Imprevisível.",
    aiIntervalMult: 0.6,
    aiCommandMult: 1.1,
    aiReserveBonus: 0,
    rewardMult: 1.6,
    isLlm: true,
  },
];

export const difficultyById = (id: Difficulty): DifficultyDef =>
  difficulties.find((d) => d.id === id) ?? difficulties[1]!;

// ---------------------------------------------------------------------------
// Dificuldade das missões (curva da campanha)
// ---------------------------------------------------------------------------

export const missionDifficulty: Record<string, Difficulty> = {
  "m-apagao": "recruta",
  "m-blecaute": "recruta",
  "m-vozes": "veterano",
  "m-fronteira": "veterano",
  "m-porto": "veterano",
  "m-castello": "veterano",
  "m-escalao": "veterano",
  "m-montese": "elite",
  "m-fornovo": "elite",
  "m-desfile": "veterano",
  "m-desmob": "veterano",
  "m-trampolim": "veterano",
  "m-zecarioca": "veterano",
  "m-standard": "elite",
  "m-lobato": "elite",
  "m-petroleo": "elite",
  "m-fundacao": "elite",
  "m-cafe": "elite",
  "m-curriculo": "elite",
  "m-febre": "elite",
  "m-berlim": "soberano",
  "m-camelot": "soberano",
  "m-soa": "soberano",
  "m-guatemala": "soberano",
  "m-alianca": "soberano",
  "m-cpi": "soberano",
  "m-torre": "elite",
  "m-3327": "elite",
  "m-corrente": "elite",
  "m-automovel": "elite",
  "m-rua": "elite",
  "m-cidadeviva": "elite",
  "m-mockingbird": "elite",
  "m-cointelpro": "soberano",
  "m-condor": "soberano",
  "m-gerasimov": "soberano",
  "m-hibridas": "soberano",
  "m-snowden": "soberano",
  "m-petrobras": "soberano",
  "m-stuxnet": "soberano",
  "m-cambridge": "soberano",
  "m-trolls": "soberano",
  "m-pegasus": "soberano",
  "m-5g": "soberano",
  "m-deepfake": "soberano",
  "m-ouroazul": "soberano",
  "m-arquivos": "soberano",
  "m-brics": "soberano",
  "m-tabuleiro": "soberano",
  "m-final": "llm",
};

export const terrainHint: Record<TerrainKind, string> = {
  "Campo aberto": "Longas distâncias. Artilharia e mobilidade decidem.",
  Floresta: "Vegetação fechada. Reconhecimento vale mais que blindagem.",
  Montanha: "Passagens estreitas. Quem domina o alto, domina a luta.",
  Cidade: "Ruas e construções. Infantaria e apoio casa a casa.",
  "Travessia de rio": "Pontes são gargalos. Segure-as ou perca o fluxo.",
  "Região fortificada": "Defesas preparadas. Engenharia abre caminho.",
};
