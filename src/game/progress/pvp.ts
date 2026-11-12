// PvP do SOVEREIGN.
// Regra central: no modo "Aposta", você entra com cartas suas — e pode sair sem elas.
// O vencedor leva o que o perdedor arriscou. Perder dói de verdade.

import { arenaByTerrain, commanders } from "@/game/battle/catalog";
import type {
  Arena,
  BattleConfig,
  BattleOutcome,
  Commander,
  Doctrine,
  SideConfig,
  TerrainKind,
} from "@/game/battle/types";
import type { AiDifficulty } from "@/game/battle/types";
import { commandCapacity, economyBonus, regenRate, type NationState } from "@/game/battle/missions";
import { difficultyById, modsFromAccessories, type Difficulty } from "./catalog";
import type { ProfileState } from "./profile";

export type PvpMode = "equilibrado" | "historico" | "aposta";

export interface PvpModeDef {
  id: PvpMode;
  name: string;
  summary: string;
  stakeCards: number; // quantas cartas entram em risco
  rewardCards: number; // quantas cartas o vencedor leva
  terrain: TerrainKind;
}

export const pvpModes: PvpModeDef[] = [
  {
    id: "equilibrado",
    name: "Confronto equilibrado",
    summary: "Partida justa, sem risco de perder cartas. Ganhe experiência e Sovereigns.",
    stakeCards: 0,
    rewardCards: 1,
    terrain: "Campo aberto",
  },
  {
    id: "historico",
    name: "Cenário histórico",
    summary: "Terreno e doutrinas fixos, como nos grandes confrontos. Aposta leve: 1 carta.",
    stakeCards: 1,
    rewardCards: 1,
    terrain: "Região fortificada",
  },
  {
    id: "aposta",
    name: "Aposta de guerra",
    summary: "Você arrisca 3 cartas. Venceu, leva as do adversário. Perdeu, perde as suas.",
    stakeCards: 3,
    rewardCards: 3,
    terrain: "Cidade",
  },
];

export const pvpModeById = (id: PvpMode): PvpModeDef =>
  pvpModes.find((m) => m.id === id) ?? pvpModes[0]!;

// ---------------------------------------------------------------------------
// Configuração da batalha PvP
// ---------------------------------------------------------------------------

export interface BuildPvpOptions {
  profile: ProfileState;
  deck: string[];
  accessories: string[];
  commander: Commander;
  doctrine: Doctrine;
  opponentName: string;
  opponentFlag: string;
  opponentCommander: Commander;
  opponentDoctrine: Doctrine;
  opponentDeck: string[];
  difficulty: Difficulty;
  terrain: TerrainKind;
  seed: number;
  cardLevels?: Record<string, number>;
  opponentCardLevels?: Record<string, number>;
}

export function buildPvpConfig(opts: BuildPvpOptions): BattleConfig {
  const arena = cloneArena(arenaByTerrain(opts.terrain));
  const mods = modsFromAccessories(opts.accessories);
  const blue = sideFromProfile(
    opts.profile.nation,
    opts.deck,
    opts.commander,
    opts.doctrine,
    mods,
    opts.cardLevels,
  );
  const red: SideConfig = {
    countryId: "pvp",
    countryName: opts.opponentName,
    flag: opts.opponentFlag,
    commander: opts.opponentCommander,
    doctrine: opts.opponentDoctrine,
    deck: opts.opponentDeck.slice(0, 8),
    commandMax: commandCapacity(opts.profile.nation),
    regen: regenRate(opts.profile.nation),
    economyBonus: economyBonus(opts.profile.nation),
  };
  if (opts.opponentCardLevels) red.cardLevels = opts.opponentCardLevels;
  const def = difficultyById(opts.difficulty);
  const aiDifficulty: AiDifficulty = {
    intervalMult: def.aiIntervalMult,
    commandMult: def.aiCommandMult,
    reserveBonus: def.aiReserveBonus,
    isLlm: def.isLlm,
  };
  return {
    id: `pvp-${opts.seed}`,
    missionName: `PvP · ${opts.opponentName}`,
    objectiveKind: "territorial",
    objectiveText: "Domine os pontos de controle e imponha superioridade territorial.",
    duration: 300,
    arena,
    blue,
    red,
    seed: opts.seed,
    aiDifficulty,
  };
}

function sideFromProfile(
  nation: NationState,
  deck: string[],
  commander: Commander,
  doctrine: Doctrine,
  mods: ReturnType<typeof modsFromAccessories>,
  cardLevels?: Record<string, number>,
): SideConfig {
  const cfg: SideConfig = {
    countryId: nation.countryId,
    countryName: nation.countryName,
    flag: nation.flag,
    commander,
    doctrine,
    deck: deck.slice(0, 8),
    commandMax: commandCapacity(nation) + (mods.commandMax ?? 0),
    regen: regenRate(nation),
    economyBonus: economyBonus(nation),
  };
  if (Object.keys(mods).length) cfg.mods = mods;
  if (cardLevels) cfg.cardLevels = cardLevels;
  return cfg;
}

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
    frontiers: (arena.frontiers ?? []).map((f) => ({ ...f })),
    deployZone: { blue: { ...arena.deployZone.blue }, red: { ...arena.deployZone.red } },
  };
}

// ---------------------------------------------------------------------------
// Adversários locais (espelho de comandantes) para jogar offline
// ---------------------------------------------------------------------------

export interface PvpOpponent {
  id: string;
  name: string;
  flag: string;
  commander: Commander;
  difficulty: Difficulty;
  deck: string[];
}

const MIRROR_DECKS: string[][] = [
  [
    "inf-fuzileiros",
    "inf-assalto",
    "bld-vbld",
    "art-canhao",
    "def-aa",
    "inf-engenheiro",
    "rec-drone",
    "sup-gas",
  ],
  [
    "inf-fuzileiros",
    "bld-vbld",
    "bld-tanque",
    "art-obus",
    "def-fortificacao",
    "inf-antitanque",
    "sup-reforcos",
    "sup-barricada",
  ],
  [
    "inf-assalto",
    "inf-antitanque",
    "rec-drone",
    "mss-lmf",
    "def-aa",
    "sup-interferencia",
    "sup-recon-avancado",
    "sup-aereo",
  ],
];

export function localOpponents(profile: ProfileState): PvpOpponent[] {
  const owned = Object.keys(profile.inventory.cards);
  const pool = owned.length >= 8 ? owned.slice(0, 12) : MIRROR_DECKS[0]!;
  return [
    {
      id: "op-varela",
      name: "Aliança Varela",
      flag: "🎖️",
      commander: commanders[0]!,
      difficulty: "veterano",
      deck: fillDeck(pool, 0),
    },
    {
      id: "op-sarmiento",
      name: "Bloco Sarmiento",
      flag: "⚙️",
      commander: commanders[1]!,
      difficulty: "elite",
      deck: fillDeck(MIRROR_DECKS[1]!, 0),
    },
    {
      id: "op-orlov",
      name: "Doutrina Orlov",
      flag: "🔥",
      commander: commanders[2]!,
      difficulty: "soberano",
      deck: fillDeck(MIRROR_DECKS[2]!, 0),
    },
    {
      id: "op-llm",
      name: "Estado-Maior IA",
      flag: "🧠",
      commander: commanders[4]!,
      difficulty: "llm",
      deck: fillDeck(MIRROR_DECKS[1]!, 1),
    },
  ];
}

function fillDeck(cards: string[], offset: number): string[] {
  const rotated = [...cards.slice(offset), ...cards.slice(0, offset)];
  const out = rotated.slice(0, 8);
  while (out.length < 8) out.push("inf-fuzileiros");
  return out;
}

// ---------------------------------------------------------------------------
// Resolução das apostas
// ---------------------------------------------------------------------------

export interface StakeResult {
  won: boolean;
  lostCards: string[]; // cartas que o jogador perdeu
  gainedCards: string[]; // cartas que o jogador ganhou
}

export function resolveStakes(
  outcome: BattleOutcome,
  mode: PvpMode,
  stakes: string[],
  opponentStakes: string[],
): StakeResult {
  const def = pvpModeById(mode);
  if (def.stakeCards === 0) {
    return { won: outcome === "vitoria", lostCards: [], gainedCards: [] };
  }
  if (outcome === "vitoria") {
    return { won: true, lostCards: [], gainedCards: opponentStakes.slice(0, def.rewardCards) };
  }
  if (outcome === "empate") {
    // empate devolve as cartas a ambos (sem transferência)
    return { won: false, lostCards: [], gainedCards: [] };
  }
  return { won: false, lostCards: stakes.slice(0, def.stakeCards), gainedCards: [] };
}

// Escolhe, a partir do inventário, um conjunto de cartas para o adversário apostar.
export function pickOpponentStakes(profile: ProfileState, n: number): string[] {
  const owned = Object.keys(profile.inventory.cards);
  const pool = owned.length ? owned : MIRROR_DECKS[0]!;
  return pool.slice(0, n);
}

export const _internal = { MIRROR_DECKS };
