// Contexto global de perfil do jogador.
// Local-first: o estado vive no localStorage e é a fonte da verdade durante o jogo.
// A sincronização com o Supabase acontece em segundo plano e nunca bloqueia a jogabilidade.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { NationState } from "@/game/battle/missions";
import { applyConsequences, consequencesOf, missionById } from "@/game/battle/missions";
import type { BattleResult } from "@/game/battle/types";
import type { Difficulty, Reward, TechDef } from "./catalog";
import { copiesToLevel } from "@/game/battle/catalog";
import {
  applyChapterResult,
  createProfile,
  grantReward,
  loadProfile,
  saveProfile,
  resetProfile,
  syncUnlocks,
  type BattleRecord,
  type ProfileState,
  type SavedDeck,
} from "./profile";
import { ensureSession, pushBattleRecord, pushProfile } from "./sync";

// Mensagem usada quando o Supabase não está configurado — offline normal, não é falha.
const OFFLINE_MESSAGE = "Supabase não configurado.";

// Falhas que não merecem aparecer para o jogador: jogo offline, rede instável ou
// limite temporário de requisições do Supabase. O perfil local segue válido.
function isTransientSyncError(message: string | null): boolean {
  if (!message) return true;
  return (
    message === OFFLINE_MESSAGE ||
    /rate limit|429|fetch|network|failed to fetch|timeout|temporar/i.test(message)
  );
}

export interface ProfileContextValue {
  ready: boolean;
  profile: ProfileState;
  signedIn: boolean;
  lastError: string | null;
  /** Conclui um capítulo, aplicando recompensa e desbloqueando o próximo. */
  completeChapter: (opts: {
    chapterId: string;
    result: BattleResult;
    difficulty: Difficulty;
    rewards?: Reward;
  }) => Reward;
  /** Registra um resultado fora da campanha (treino/PvP). */
  recordBattle: (rec: Omit<BattleRecord, "id" | "createdAt">) => void;
  setNation: (nation: NationState) => void;
  /** Pesquisa uma tecnologia: consome pesquisa e aplica os efeitos à nação. */
  researchTech: (tech: TechDef) => boolean;
  saveDeck: (deck: SavedDeck) => void;
  setActiveDeck: (deckId: string) => void;
  setDisplayName: (name: string) => void;
  /** Remove cartas do inventário (usado quando se perde uma aposta no PvP). */
  removeCards: (cardIds: string[]) => void;
  /** Evolui uma carta para o próximo nível, consumindo cópias. */
  levelUpCard: (cardId: string) => boolean;
  hardReset: () => void;
  syncNow: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  // Estado inicial determinístico: o mesmo no servidor e na primeira renderização do cliente,
  // evitando divergência de hidratação. O perfil real do localStorage entra no efeito abaixo.
  const [profile, setProfile] = useState<ProfileState>(() => createProfile());
  const [signedIn, setSignedIn] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const profileRef = useRef<ProfileState>(profile);
  profileRef.current = profile;

  useEffect(() => {
    const loaded = syncUnlocks(loadProfile());
    setProfile(loaded);
    profileRef.current = loaded;
    saveProfile(loaded);
    void (async () => {
      const { userId, error } = await ensureSession();
      // Offline ou limitação temporária (rede/rate limit) não é erro visível:
      // o jogo roda local e tenta sincronizar de novo depois.
      setLastError(userId || isTransientSyncError(error) ? null : error);
      setSignedIn(Boolean(userId));
      if (userId) await pushProfile(loaded);
    })();
  }, []);

  const persist = useCallback((next: ProfileState) => {
    const synced = syncUnlocks(next);
    saveProfile(synced);
    profileRef.current = synced;
    setProfile(synced);
    void pushProfile(synced);
  }, []);

  const completeChapter = useCallback<ProfileContextValue["completeChapter"]>(
    ({ chapterId, result, difficulty, rewards }) => {
      const current = profileRef.current;
      const now = new Date().toISOString();
      const { profile: applied, reward } = applyChapterResult(current, {
        chapterId,
        result,
        difficulty,
        rewards,
        recordId: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now,
      });
      const nation = applyConsequences(
        { ...applied.nation },
        consequencesOf(result, missionById(result.configId)),
      );
      const next: ProfileState = { ...applied, nation };
      persist(next);
      void pushBattleRecord({
        mode: "campanha",
        missionId: result.configId,
        missionName: result.missionName,
        outcome: result.outcome,
        difficulty,
        duration: result.duration,
        kills: result.kills.blue,
        losses: result.losses.blue,
        territorialScore: Math.round(result.territorialScore.blue),
        rewards: (result.outcome === "vitoria" ? reward : {}) as Record<string, unknown>,
      });
      return reward;
    },
    [persist],
  );

  const recordBattle = useCallback<ProfileContextValue["recordBattle"]>(
    (rec) => {
      const current = profileRef.current;
      if (!current) return;
      const record: BattleRecord = {
        ...rec,
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
      };
      persist({ ...current, records: [record, ...current.records].slice(0, 60) });
      void pushBattleRecord({
        mode: rec.mode,
        missionId: rec.missionId,
        missionName: rec.missionName,
        outcome: rec.outcome,
        difficulty: rec.difficulty,
        duration: rec.duration,
        kills: rec.kills,
        losses: rec.losses,
        territorialScore: rec.territorialScore,
      });
    },
    [persist],
  );

  const researchTech = useCallback<ProfileContextValue["researchTech"]>(
    (tech) => {
      const current = profileRef.current;
      if (!current) return false;
      if (current.nation.techs.includes(tech.id)) return false;
      if (current.research < tech.cost) return false;
      if (!(tech.requires ?? []).every((r) => current.nation.techs.includes(r))) return false;
      const eff = tech.effect ?? {};
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      const nation: NationState = {
        ...current.nation,
        techs: [...current.nation.techs, tech.id],
        military: clamp(current.nation.military + (eff.military ?? 0)),
        stability: clamp(current.nation.stability + (eff.stability ?? 0)),
        industry: clamp(current.nation.industry + (eff.industry ?? 0)),
        logistics: clamp(current.nation.logistics + (eff.logistics ?? 0)),
      };
      persist({ ...current, nation, research: current.research - tech.cost });
      return true;
    },
    [persist],
  );

  const setNation = useCallback<ProfileContextValue["setNation"]>(
    (nation) => {
      const current = profileRef.current;
      if (!current) return;
      persist({ ...current, nation });
    },
    [persist],
  );

  const saveDeck = useCallback<ProfileContextValue["saveDeck"]>(
    (deck) => {
      const current = profileRef.current;
      if (!current) return;
      const exists = current.decks.some((d) => d.id === deck.id);
      const decks = exists
        ? current.decks.map((d) => (d.id === deck.id ? deck : d))
        : [...current.decks, deck];
      persist({ ...current, decks });
    },
    [persist],
  );

  const setActiveDeck = useCallback<ProfileContextValue["setActiveDeck"]>(
    (deckId) => {
      const current = profileRef.current;
      if (!current) return;
      persist({ ...current, activeDeckId: deckId });
    },
    [persist],
  );

  const setDisplayName = useCallback<ProfileContextValue["setDisplayName"]>(
    (name) => {
      const current = profileRef.current;
      if (!current) return;
      persist({ ...current, displayName: name });
    },
    [persist],
  );

  const removeCards = useCallback<ProfileContextValue["removeCards"]>(
    (cardIds) => {
      const current = profileRef.current;
      if (!current) return;
      const cards = { ...current.inventory.cards };
      for (const id of cardIds) {
        const q = (cards[id] ?? 0) - 1;
        if (q <= 0) delete cards[id];
        else cards[id] = q;
      }
      // remove do baralho ativo cartas que não são mais possuídas
      const decks = current.decks.map((d) => ({
        ...d,
        cards: d.cards.filter((c) => (cards[c] ?? 0) > 0),
      }));
      persist({ ...current, inventory: { ...current.inventory, cards }, decks });
    },
    [persist],
  );

  const levelUpCard = useCallback<ProfileContextValue["levelUpCard"]>(
    (cardId) => {
      const current = profileRef.current;
      if (!current) return false;
      const level = current.cardLevels[cardId] ?? 1;
      const need = copiesToLevel(level);
      const owned = current.inventory.cards[cardId] ?? 0;
      if (need <= 0 || owned < need) return false;
      persist({
        ...current,
        cardLevels: { ...current.cardLevels, [cardId]: level + 1 },
      });
      return true;
    },
    [persist],
  );

  const hardReset = useCallback(() => {
    const fresh = resetProfile();
    profileRef.current = fresh;
    setProfile(fresh);
    void pushProfile(fresh);
  }, []);

  const syncNow = useCallback(async () => {
    const current = profileRef.current;
    if (!current) return;
    const { userId } = await ensureSession();
    setSignedIn(Boolean(userId));
    const res = await pushProfile(current);
    if (!res.ok && res.error && !isTransientSyncError(res.error)) setLastError(res.error);
    else setLastError(null);
  }, []);

  const value = useMemo<ProfileContextValue>(() => {
    return {
      ready: true,
      profile,
      signedIn,
      lastError,
      completeChapter,
      recordBattle,
      setNation,
      researchTech,
      saveDeck,
      setActiveDeck,
      setDisplayName,
      removeCards,
      levelUpCard,
      hardReset,
      syncNow,
    };
  }, [
    profile,
    signedIn,
    lastError,
    completeChapter,
    recordBattle,
    setNation,
    researchTech,
    saveDeck,
    setActiveDeck,
    setDisplayName,
    removeCards,
    levelUpCard,
    hardReset,
    syncNow,
  ]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile precisa estar dentro de <ProfileProvider>.");
  return ctx;
}
