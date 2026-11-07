// Estado persistente do jogador (progresso, inventário, nação, baralhos).
// Local-first: sempre grava no localStorage para funcionar offline; quando há
// sessão no Supabase, sincroniza em segundo plano. Nada aqui quebra se a rede faltar.

import { allCards, startingDeck } from "@/game/battle/catalog";
import type { NationState } from "@/game/battle/missions";
import { defaultNation } from "@/game/battle/missions";
import type { BattleResult, Doctrine } from "@/game/battle/types";
import { chapterMeta, chapterMetaById } from "./campaign";
import type { Difficulty, Inventory, Reward } from "./catalog";
import { addAccessory, addCard, emptyInventory } from "./catalog";

export interface ChapterState {
  status: "bloqueado" | "disponivel" | "concluido";
  outcome?: "vitoria" | "derrota" | "empate";
  attempts: number;
  bestScore: number;
  completedAt?: string;
}

export interface SavedDeck {
  id: string;
  name: string;
  cards: string[];
  accessories: string[];
  doctrine?: Doctrine;
  commanderId?: string;
}

export interface BattleRecord {
  id: string;
  mode: "campanha" | "treino" | "pvp";
  missionId: string;
  missionName: string;
  outcome: "vitoria" | "derrota" | "empate";
  difficulty: Difficulty;
  duration: number;
  kills: number;
  losses: number;
  territorialScore: number;
  rewards?: Reward;
  createdAt: string;
}

export interface ProfileState {
  version: number;
  displayName: string;
  countryId: string;
  nation: NationState;
  inventory: Inventory;
  chapters: Record<string, ChapterState>;
  decks: SavedDeck[];
  activeDeckId: string;
  records: BattleRecord[];
  sovereigns: number;
  research: number;
  xp: number;
  createdAt: string;
}

const STORAGE_KEY = "sovereign.profile.v1";
export const PROFILE_VERSION = 1;

// ---------------------------------------------------------------------------
// Criação do perfil inicial
// ---------------------------------------------------------------------------

export function createProfile(displayName = "Comandante"): ProfileState {
  const now = new Date().toISOString();
  const inv = emptyInventory();
  for (const c of startingDeck) addCardInto(inv, c);
  const profile: ProfileState = {
    version: PROFILE_VERSION,
    displayName,
    countryId: "br",
    nation: { ...defaultNation },
    inventory: inv,
    chapters: {},
    decks: [],
    activeDeckId: "",
    records: [],
    sovereigns: 150,
    research: 2,
    xp: 0,
    createdAt: now,
  };
  // capítulo 1 sempre disponível; o resto bloqueado até vencer o anterior
  for (const meta of chapterMeta) {
    profile.chapters[meta.id] = {
      status: meta.number === 1 ? "disponivel" : "bloqueado",
      attempts: 0,
      bestScore: 0,
    };
  }
  const deck: SavedDeck = {
    id: "deck-default",
    name: "Baralho inicial",
    cards: [...startingDeck],
    accessories: [],
    doctrine: "Operações combinadas",
    commanderId: "cmd-varela",
  };
  profile.decks = [deck];
  profile.activeDeckId = deck.id;
  return profile;
}

function addCardInto(inv: Inventory, cardId: string): void {
  inv.cards[cardId] = (inv.cards[cardId] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Persistência local
// ---------------------------------------------------------------------------

export function loadProfile(): ProfileState {
  if (typeof localStorage === "undefined") return createProfile();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = createProfile();
      saveProfile(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as ProfileState;
    return migrate(parsed);
  } catch {
    return createProfile();
  }
}

export function saveProfile(profile: ProfileState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* sem storage */
  }
}

export function resetProfile(): ProfileState {
  const fresh = createProfile();
  saveProfile(fresh);
  return fresh;
}

function migrate(p: ProfileState): ProfileState {
  if (p.version === PROFILE_VERSION) return ensureShape(p);
  // ponto único de migração para versões futuras
  return ensureShape({ ...createProfile(p.displayName), ...p, version: PROFILE_VERSION });
}

// Garante que perfis antigos ganhem campos/tabelas novos sem quebrar.
function ensureShape(p: ProfileState): ProfileState {
  const base = createProfile(p.displayName);
  const chapters = { ...base.chapters, ...p.chapters };
  const inventory = p.inventory ?? emptyInventory();
  return {
    ...base,
    ...p,
    nation: { ...defaultNation, ...p.nation },
    inventory,
    chapters,
    decks: p.decks?.length ? p.decks : base.decks,
    activeDeckId: p.activeDeckId || base.activeDeckId,
    records: p.records ?? [],
  };
}

// ---------------------------------------------------------------------------
// Recompensas
// ---------------------------------------------------------------------------

export function grantReward(profile: ProfileState, reward: Reward): ProfileState {
  const inv: Inventory = {
    cards: { ...profile.inventory.cards },
    accessories: { ...profile.inventory.accessories },
  };
  let next: Inventory = inv;
  for (const c of reward.cards ?? []) next = addCard(next, c);
  for (const a of reward.accessories ?? []) next = addAccessory(next, a);
  const techs = new Set([...profile.nation.techs, ...(reward.techs ?? [])]);
  return {
    ...profile,
    inventory: next,
    nation: { ...profile.nation, techs: Array.from(techs) },
    sovereigns: profile.sovereigns + (reward.sovereigns ?? 0),
    research: profile.research + (reward.research ?? 0),
    xp: profile.xp + (reward.xp ?? 0),
  };
}

// Resultado de uma batalha de campanha aplicado ao perfil: concede recompensa só na vitória,
// atualiza o estado do capítulo, desbloqueia o próximo e registra a batalha. Puro e determinístico.
export function applyChapterResult(
  profile: ProfileState,
  opts: {
    chapterId: string;
    result: Pick<
      BattleResult,
      "configId" | "missionName" | "outcome" | "duration" | "kills" | "losses" | "territorialScore"
    >;
    difficulty: Difficulty;
    rewards?: Reward | undefined;
    recordId: string;
    createdAt: string;
  },
): { profile: ProfileState; reward: Reward } {
  const meta = chapterMetaById(opts.chapterId);
  const reward: Reward = opts.rewards ?? meta?.reward ?? {};
  const won = opts.result.outcome === "vitoria";

  let next = won ? grantReward(profile, reward) : profile;

  const prev = next.chapters[opts.chapterId] ?? {
    status: "disponivel" as const,
    attempts: 0,
    bestScore: 0,
  };
  const chapters = {
    ...next.chapters,
    [opts.chapterId]: {
      status: won ? ("concluido" as const) : prev.status,
      outcome: opts.result.outcome,
      attempts: prev.attempts + 1,
      bestScore: Math.max(prev.bestScore, Math.round(opts.result.territorialScore.blue)),
      ...(won ? { completedAt: opts.createdAt } : {}),
    },
  };
  if (won && meta) {
    const nextMeta = chapterMetaById(`c${meta.number + 1}`);
    if (nextMeta && chapters[nextMeta.id]?.status === "bloqueado") {
      chapters[nextMeta.id] = { ...chapters[nextMeta.id]!, status: "disponivel" };
    }
  }

  const record: BattleRecord = {
    id: opts.recordId,
    mode: "campanha",
    missionId: opts.result.configId,
    missionName: opts.result.missionName,
    outcome: opts.result.outcome,
    difficulty: opts.difficulty,
    duration: opts.result.duration,
    kills: opts.result.kills.blue,
    losses: opts.result.losses.blue,
    territorialScore: Math.round(opts.result.territorialScore.blue),
    rewards: won ? reward : {},
    createdAt: opts.createdAt,
  };

  next = { ...next, chapters, records: [record, ...next.records].slice(0, 60) };
  return { profile: next, reward };
}

// Cartas que o jogador possui (independente de tecnologia).
export function ownedCardIds(profile: ProfileState): string[] {
  return allCards.filter((c) => (profile.inventory.cards[c.id] ?? 0) > 0).map((c) => c.id);
}

// Baralho efetivo: apenas cartas que o jogador possui.
export function effectiveDeck(profile: ProfileState): string[] {
  const owned = new Set(ownedCardIds(profile));
  const deck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
  const cards = (deck?.cards ?? []).filter((c) => owned.has(c));
  if (cards.length >= 8) return cards.slice(0, 8);
  // completa com cartas iniciais possuídas
  const fill = startingDeck.filter((c) => owned.has(c) && !cards.includes(c));
  return [...cards, ...fill].slice(0, 8);
}

export function activeAccessories(profile: ProfileState): string[] {
  const deck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
  return deck?.accessories ?? [];
}

export function totalXpForLevel(xp: number): { level: number; into: number; need: number } {
  const level = Math.floor(xp / 250) + 1;
  const into = xp % 250;
  return { level, into, need: 250 };
}
