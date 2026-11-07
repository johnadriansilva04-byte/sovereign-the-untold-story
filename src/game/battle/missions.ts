// Ponte entre a camada geopolítica (campanha, nação, árvore tecnológica) e a batalha.
// É aqui que "o que o país construiu" define "o que o jogador consegue fazer no campo".
// A economia dá vantagens marginais (regeneração, teto de comando), nunca vitória comprada.

import {
  allCards,
  allDoctrines,
  arenaByTerrain,
  cardById,
  commanders,
  startingDeck,
} from "./catalog";
import type {
  AiDifficulty,
  Arena,
  BattleConfig,
  BattleOutcome,
  BattleResult,
  Commander,
  Doctrine,
  ObjectiveKind,
  SideConfig,
  SideModifiers,
  TerrainKind,
} from "./types";

// ---------------------------------------------------------------------------
// Estado da nação (protótipo local; no jogo final vira tabela do back-end)
// ---------------------------------------------------------------------------

export interface NationState {
  countryId: string;
  countryName: string;
  flag: string;
  techs: string[]; // ids desbloqueados na árvore tecnológica
  military: number; // 0-100
  gdp: number; // bilhões
  stability: number; // 0-100
  industry: number; // 0-100 (define reposição de blindados)
  logistics: number; // 0-100 (define sustentação)
  influence: number; // 0-100 (influência diplomática)
}

export const defaultNation: NationState = {
  countryId: "br",
  countryName: "Brasil",
  flag: "🇧🇷",
  techs: ["t1", "t4", "t10", "t8"],
  military: 61,
  gdp: 2170,
  stability: 54,
  industry: 62,
  logistics: 55,
  influence: 40,
};

const STORAGE_KEY = "sovereign.nation.v1";

export function loadNation(): NationState {
  if (typeof localStorage === "undefined") return defaultNation;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultNation;
    return { ...defaultNation, ...(JSON.parse(raw) as Partial<NationState>) };
  } catch {
    return defaultNation;
  }
}

export function saveNation(nation: NationState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nation));
  } catch {
    /* ambiente sem storage: ignora */
  }
}

// Cartas liberadas pela situação real do país.
export function unlockedDeck(nation: NationState): string[] {
  const unlocked = allCards.filter(
    (c) => !c.unlocksTech || c.unlocksTech.every((t) => nation.techs.includes(t)),
  );
  const ids = unlocked.map((c) => c.id);
  // sempre inclui o baralho inicial
  return Array.from(new Set([...startingDeck, ...ids]));
}

// Bônus econômico: vantagem pequena e limitada — não substitui habilidade.
export function economyBonus(nation: NationState): number {
  const gdpFactor = Math.min(1, nation.gdp / 3000);
  const stabilityFactor = nation.stability / 100;
  const raw = 0.02 + gdpFactor * 0.05 + stabilityFactor * 0.03;
  return Math.round(Math.min(0.1, raw) * 1000) / 1000;
}

export function commandCapacity(nation: NationState): number {
  return 10 + Math.round(nation.logistics / 40); // 10 a 13
}

export function regenRate(nation: NationState): number {
  return 0.85 + nation.military / 400; // ~0.85 a 1.1 por segundo
}

// ---------------------------------------------------------------------------
// Missões
// ---------------------------------------------------------------------------

export interface MissionDef {
  id: string;
  name: string;
  act: string;
  terrain: TerrainKind;
  objectiveKind: ObjectiveKind;
  objectiveText: string;
  duration: number;
  missionNote: string;
  brief: string;
  enemyCountry: { id: string; name: string; flag: string; commanderId: string; doctrine: Doctrine };
  operational?: { controlPointId: string; seconds: number };
  militaryThreshold?: number;
}

// Cada missão nasce de um capítulo da campanha. O terreno vem da narrativa
// (Monte Castello é montanha; o apagão é cidade; a travessia é rio).
export const missions: MissionDef[] = [
  {
    id: "m-apagao",
    name: "Operação Apagão",
    act: "Ato I · O Presente",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Proteja o centro de distribuição e sobreviva à pressão urbana.",
    duration: 300,
    missionNote: "Você luta sem saber contra quem. Vença para descobrir.",
    brief:
      "Sem luz, sem sinal, boatos por todo lado. Um protesto que ninguém convocou fecha as ruas. Mantenha o centro de distribuição do bairro sob controle até o fim da janela de crise.",
    enemyCountry: {
      id: "us",
      name: "Forças Irregulares",
      flag: "🕶️",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
    operational: { controlPointId: "cp-c", seconds: 45 },
  },
  {
    id: "m-castello",
    name: "Monte Castello",
    act: "Ato II · A Descoberta",
    terrain: "Montanha",
    objectiveKind: "territorial",
    objectiveText: "Avance montanha acima e capture o cume (Cume Norte).",
    duration: 360,
    missionNote: "A cobra vai fumar. Onde a FEB lutou quatro vezes.",
    brief:
      "Neve, fogo vindo do alto e quatro ataques fracassados antes deste. A infantaria de montanha é sua vantagem: use as passagens e negue o cume ao inimigo.",
    enemyCountry: {
      id: "de",
      name: "Defesa Alemã",
      flag: "⚫",
      commanderId: "cmd-lima",
      doctrine: "Defesa territorial",
    },
  },
  {
    id: "m-desfile",
    name: "Desfile Interrompido",
    act: "Ato II · O Retorno Silenciado",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText:
      "Neutralize a capacidade de combate adversária antes que a memória seja descartada.",
    duration: 300,
    missionNote: "Vitória real, memória apagada. Não deixe apagarem de novo.",
    brief:
      "Os arquivos dos veteranos estão sendo descartados enquanto o desfile acontece. Destrua o dispositivo que os escolta e recupere o que é seu.",
    enemyCountry: {
      id: "us",
      name: "Segurança Contratada",
      flag: "🕶️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
    militaryThreshold: 0.7,
  },
  {
    id: "m-trampolim",
    name: "Trampolim da Vitória",
    act: "Ato III · Os Bons Vizinhos",
    terrain: "Floresta",
    objectiveKind: "territorial",
    objectiveText: "Mapeie e domine as redes de influência na região.",
    duration: 300,
    missionNote: "Da amizade nasce a doutrina. Nem tudo que ajuda é neutro.",
    brief:
      "Parnamirim, ponte aérea para a África. Domine as trilhas e clareiras para revelar quem realmente controla o fluxo de informação.",
    enemyCountry: {
      id: "us",
      name: "Missão Cultural",
      flag: "🎬",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
  },
  {
    id: "m-petroleo",
    name: "Campanha do Petróleo",
    act: "Ato III · O Petróleo é Nosso",
    terrain: "Campo aberto",
    objectiveKind: "territorial",
    objectiveText: "Mantenha os poços sob controle popular até o fim.",
    duration: 300,
    missionNote: "O petróleo é nosso. A pressão vem de fora.",
    brief:
      "Trustes sabotam a busca; o povo responde nas ruas. Segure os pontos de extração enquanto a estabilidade nacional aguenta a pressão.",
    enemyCountry: {
      id: "us",
      name: "Truste do Petróleo",
      flag: "🛢️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
  },
  {
    id: "m-torre",
    name: "A Torre",
    act: "Ato III · Quarto 3327",
    terrain: "Campo aberto",
    objectiveKind: "operacional",
    objectiveText: "Proteja a estação de transmissão até a pesquisa concluir.",
    duration: 300,
    missionNote: "O que não pode ser medido não pode ser vendido.",
    brief:
      "Wardenclyffe, 1901. O financiamento foi retirado. Segure a torre e as equipes de energia sem fio até a pesquisa fechar.",
    enemyCountry: {
      id: "us",
      name: "Consórcio Morgan",
      flag: "🏦",
      commanderId: "cmd-lima",
      doctrine: "Defesa territorial",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-curriculo",
    name: "Saúde Soberana",
    act: "Ato III · O Currículo",
    terrain: "Floresta",
    objectiveKind: "territorial",
    objectiveText: "Equilibre as posições de saúde pública sem perder autonomia.",
    duration: 300,
    missionNote: "Ajuda real e influência real podem vir no mesmo envelope.",
    brief:
      "Combate à febre amarela e escolas de medicina em disputa. Domine os postos sem entregar o currículo.",
    enemyCountry: {
      id: "us",
      name: "Fundação Sanitária",
      flag: "⚕️",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
  },
  {
    id: "m-camelot",
    name: "Camelot",
    act: "Ato III · O Mapa Humano",
    terrain: "Montanha",
    objectiveKind: "operacional",
    objectiveText: "Descubra e bloqueie o posto de mapeamento social.",
    duration: 300,
    missionNote: "Para conduzir um povo, primeiro é preciso descrevê-lo.",
    brief:
      "Pesquisadores infiltrados mapeiam as províncias. Encontre o posto central e mantenha-o sob controle.",
    enemyCountry: {
      id: "us",
      name: "Projeto Camelot",
      flag: "📐",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    operational: { controlPointId: "cp-n", seconds: 45 },
  },
  {
    id: "m-rua",
    name: "Washington Square",
    act: "Ato III · A Rua",
    terrain: "Cidade",
    objectiveKind: "territorial",
    objectiveText: "Organize os bairros e bloqueie a via expressa.",
    duration: 300,
    missionNote: "Uma comunidade que se conhece resiste.",
    brief:
      "Jane Jacobs enfrentou a via expressa e venceu. Segure as praças e o parque contra o projeto rodoviarista.",
    enemyCountry: {
      id: "us",
      name: "Associação Empresarial",
      flag: "🏗️",
      commanderId: "cmd-sarmiento",
      doctrine: "Mecanizada",
    },
  },
  {
    id: "m-brothersam",
    name: "Frota no Horizonte",
    act: "Ato IV · Brother Sam",
    terrain: "Travessia de rio",
    objectiveKind: "operacional",
    objectiveText: "Segure a ponte central e negue a travessia à frota.",
    duration: 300,
    missionNote: "Tomaram o país sem desembarcar um único soldado.",
    brief:
      "Documentos liberados mostram uma força naval pronta no Atlântico. Segure a travessia e as margens: quem controla a ponte controla o fluxo.",
    enemyCountry: {
      id: "us",
      name: "Operação Brother Sam",
      flag: "⚓",
      commanderId: "cmd-sarmiento",
      doctrine: "Mecanizada",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-final",
    name: "A Cobra Vai Fumar",
    act: "Ato IV · Soberano",
    terrain: "Região fortificada",
    objectiveKind: "territorial",
    objectiveText: "Vença com a Doutrina de Montanha da FEB desbloqueada.",
    duration: 360,
    missionNote: "A guerra nunca acabou. Só trocou de uniforme.",
    brief:
      "De volta ao presente, você conhece o terreno, as armas e os heróis. A guerra híbrida ganha nome — e resposta.",
    enemyCountry: {
      id: "us",
      name: "Rede Híbrida",
      flag: "🕸️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
  },
];

export const missionById = (id: string): MissionDef =>
  missions.find((m) => m.id === id) ?? missions[0]!;

// Cada capítulo da campanha que envolve combate aponta para a sua missão no teatro.
export const chapterMission: Record<string, string> = {
  c1: "m-apagao",
  c2: "m-castello",
  c3: "m-desfile",
  c4: "m-trampolim",
  c5: "m-petroleo",
  c6: "m-torre",
  c7: "m-curriculo",
  c8: "m-camelot",
  c9: "m-rua",
  c10: "m-brothersam",
  c11: "m-final",
};

export const missionForChapter = (chapterId: string): MissionDef | null => {
  const id = chapterMission[chapterId];
  return id ? missionById(id) : null;
};

// ---------------------------------------------------------------------------
// Montagem do BattleConfig
// ---------------------------------------------------------------------------

export function sideFromNation(
  nation: NationState,
  deck: string[],
  commander: Commander,
  doctrine: Doctrine,
  mods?: SideModifiers,
): SideConfig {
  const cfg: SideConfig = {
    countryId: nation.countryId,
    countryName: nation.countryName,
    flag: nation.flag,
    commander,
    doctrine,
    deck: deck.slice(0, 8),
    commandMax: commandCapacity(nation) + (mods?.commandMax ?? 0),
    regen: regenRate(nation),
    economyBonus: economyBonus(nation),
  };
  if (mods) cfg.mods = mods;
  return cfg;
}

export function sideFromMission(mission: MissionDef): SideConfig {
  const commander =
    commanders.find((c) => c.id === mission.enemyCountry.commanderId) ?? commanders[0]!;
  return {
    countryId: mission.enemyCountry.id,
    countryName: mission.enemyCountry.name,
    flag: mission.enemyCountry.flag,
    commander,
    doctrine: mission.enemyCountry.doctrine,
    deck: [
      "inf-fuzileiros",
      "inf-mecanizada",
      "bld-leve",
      "bld-pesado",
      "art-obus",
      "def-aa",
      "def-fortificacao",
      "rec-patrulha",
    ],
    commandMax: 12,
    regen: 1.0,
    economyBonus: 0.03,
  };
}

export interface BuildBattleOptions {
  nation: NationState;
  mission: MissionDef;
  deck: string[];
  commander: Commander;
  doctrine: Doctrine;
  seed?: number;
  mods?: SideModifiers;
  aiDifficulty?: AiDifficulty;
  redDeck?: string[];
}

export function buildBattleConfig(opts: BuildBattleOptions): BattleConfig {
  const arena = cloneArena(arenaByTerrain(opts.mission.terrain));
  const red = sideFromMission(opts.mission);
  if (opts.redDeck && opts.redDeck.length >= 8) red.deck = opts.redDeck.slice(0, 8);
  const config: BattleConfig = {
    id: opts.mission.id,
    missionName: opts.mission.name,
    objectiveKind: opts.mission.objectiveKind,
    objectiveText: opts.mission.objectiveText,
    duration: opts.mission.duration,
    arena,
    blue: sideFromNation(opts.nation, opts.deck, opts.commander, opts.doctrine, opts.mods),
    red,
    seed: opts.seed ?? 20260101,
  };
  if (opts.mission.militaryThreshold !== undefined)
    config.militaryThreshold = opts.mission.militaryThreshold;
  if (opts.mission.operational !== undefined) config.operationalTarget = opts.mission.operational;
  if (opts.aiDifficulty !== undefined) config.aiDifficulty = opts.aiDifficulty;
  return config;
}

// A arena é um template estático: clonar evita que barricadas de uma partida vazem para outra.
function cloneArena(arena: Arena): Arena {
  return {
    ...arena,
    controlPoints: arena.controlPoints.map((p) => ({
      ...p,
      owner: "neutro",
      progress: { blue: 0, red: 0 },
    })),
    obstacles: arena.obstacles.map((o) => ({ ...o })),
    routes: arena.routes.map((r) => ({ ...r })),
    deployZone: { blue: { ...arena.deployZone.blue }, red: { ...arena.deployZone.red } },
  };
}

// ---------------------------------------------------------------------------
// Consequências no mapa geopolítico
// ---------------------------------------------------------------------------

export interface WarConsequence {
  outcome: BattleOutcome;
  controlShift: string; // texto curto para o mapa
  militaryDelta: number;
  stabilityDelta: number;
  influenceDelta: number;
  losses: number;
  equipmentLost: number;
  note: string;
}

export function consequencesOf(result: BattleResult, mission: MissionDef): WarConsequence {
  const win = result.outcome === "vitoria";
  const draw = result.outcome === "empate";
  const losses = result.losses.blue;
  const equipmentLost = Math.round(losses * 0.6);
  const controlShift = win
    ? `${mission.name}: objetivo conquistado.`
    : draw
      ? `${mission.name}: fronteira estabilizada.`
      : `${mission.name}: posição perdida.`;
  return {
    outcome: result.outcome,
    controlShift,
    militaryDelta: win ? 2 : draw ? 0 : -2,
    stabilityDelta: win ? 3 : draw ? 0 : -4,
    influenceDelta: win ? 4 : draw ? 1 : -3,
    losses,
    equipmentLost,
    note: win
      ? "Vitória abre caminho para novas operações."
      : draw
        ? "Empate obriga a reorganizar sem ganho territorial."
        : "Derrota exige recompor forças antes de nova ofensiva.",
  };
}

export function applyConsequences(nation: NationState, consequence: WarConsequence): NationState {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const next: NationState = {
    ...nation,
    military: clamp(nation.military + consequence.militaryDelta),
    stability: clamp(nation.stability + consequence.stabilityDelta),
  };
  saveNation(next);
  return next;
}

export { cardById, commanders };
export const doctrineList = allDoctrines;
