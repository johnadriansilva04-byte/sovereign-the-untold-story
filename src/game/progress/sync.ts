// Sincronização entre o perfil local e o Supabase.
// Estratégia: o jogo SEMPRE funciona offline com o localStorage. Quando existe sessão
// (anônima ou não), o perfil é enviado para o banco em segundo plano. Falhas de rede
// são silenciosas: nunca interrompem uma batalha nem perdem o progresso local.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { ProfileState } from "@/game/progress/profile";

export interface SyncStatus {
  signedIn: boolean;
  userId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export async function ensureSession(): Promise<{ userId: string | null; error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { userId: null, error: "Supabase não configurado." };
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.user) return { userId: data.session.user.id, error: null };
    // login anônimo: jogador começa a jogar sem cadastro
    const { data: signIn, error } = await sb.auth.signInAnonymously();
    if (error) return { userId: null, error: error.message };
    return { userId: signIn.user?.id ?? null, error: null };
  } catch (e) {
    return { userId: null, error: e instanceof Error ? e.message : "Falha de sessão." };
  }
}

export async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Perfil → banco
// ---------------------------------------------------------------------------

export async function pushProfile(profile: ProfileState): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase não configurado." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sem sessão." };
  try {
    const nation = {
      user_id: userId,
      country_id: profile.nation.countryId,
      country_name: profile.nation.countryName,
      flag: profile.nation.flag,
      techs: profile.nation.techs,
      military: profile.nation.military,
      gdp: profile.nation.gdp,
      stability: profile.nation.stability,
      industry: profile.nation.industry,
      logistics: profile.nation.logistics,
    };
    await sb.from("nation_state").upsert(nation, { onConflict: "user_id" });

    const progress = Object.entries(profile.chapters).map(([chapterId, c]) => ({
      user_id: userId,
      chapter_id: chapterId,
      status: c.status,
      outcome: c.outcome ?? null,
      attempts: c.attempts,
      best_score: c.bestScore,
      completed_at: c.completedAt ?? null,
    }));
    if (progress.length) {
      await sb.from("campaign_progress").upsert(progress, { onConflict: "user_id,chapter_id" });
    }

    const items = [
      ...Object.entries(profile.inventory.cards).map(([itemId, quantity]) => ({
        user_id: userId,
        item_kind: "carta" as const,
        item_id: itemId,
        quantity,
        source: "campanha",
      })),
      ...Object.entries(profile.inventory.accessories).map(([itemId, quantity]) => ({
        user_id: userId,
        item_kind: "acessorio" as const,
        item_id: itemId,
        quantity,
        source: "campanha",
      })),
    ];
    if (items.length) {
      await sb.from("inventory").upsert(items, { onConflict: "user_id,item_kind,item_id" });
    }

    const decks = profile.decks.map((d) => ({
      user_id: userId,
      name: d.name,
      cards: d.cards,
      accessories: d.accessories,
      doctrine: d.doctrine ?? null,
      commander_id: d.commanderId ?? null,
      is_active: d.id === profile.activeDeckId,
    }));
    if (decks.length) {
      // evita duplicar a cada sync: apaga e reinsere o conjunto do jogador
      await sb.from("decks").delete().eq("user_id", userId);
      await sb.from("decks").insert(decks);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de sync." };
  }
}

// ---------------------------------------------------------------------------
// Registro de batalha (best-effort)
// ---------------------------------------------------------------------------

export interface RemoteBattleRecord {
  mode: "campanha" | "treino" | "pvp";
  missionId: string;
  missionName: string;
  outcome: "vitoria" | "derrota" | "empate";
  difficulty: string;
  duration: number;
  kills: number;
  losses: number;
  territorialScore: number;
  rewards?: Record<string, unknown>;
}

export async function pushBattleRecord(rec: RemoteBattleRecord): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const userId = await currentUserId();
  if (!userId) return;
  try {
    await sb.from("battle_records").insert({
      user_id: userId,
      mode: rec.mode,
      mission_id: rec.missionId,
      mission_name: rec.missionName,
      outcome: rec.outcome,
      difficulty: rec.difficulty,
      duration: Math.round(rec.duration),
      kills: rec.kills,
      losses: rec.losses,
      territorial_score: Math.round(rec.territorialScore),
      rewards: rec.rewards ?? {},
    });
  } catch {
    /* offline: ignora */
  }
}

// ---------------------------------------------------------------------------
// PvP (assíncrono por lobby)
// ---------------------------------------------------------------------------

export interface PvpLobby {
  id: string;
  mode: "equilibrado" | "historico" | "aposta";
  host_id: string;
  guest_id: string | null;
  host_deck: string[];
  stakes: string[];
  status: string;
  created_at: string;
}

export async function listOpenLobbies(): Promise<PvpLobby[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data } = await sb
      .from("pvp_matches")
      .select("*")
      .eq("status", "aguardando")
      .order("created_at", { ascending: false })
      .limit(20);
    return (data ?? []) as PvpLobby[];
  } catch {
    return [];
  }
}

export async function createLobby(
  deck: string[],
  mode: PvpLobby["mode"],
  stakes: string[],
): Promise<{ id: string | null; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { id: null, error: "Supabase não configurado." };
  const userId = await currentUserId();
  if (!userId) return { id: null, error: "Sem sessão." };
  try {
    const { data, error } = await sb
      .from("pvp_matches")
      .insert({ host_id: userId, host_deck: deck, mode, stakes })
      .select("id")
      .single();
    if (error) return { id: null, error: error.message };
    return { id: (data as { id: string }).id };
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : "Falha ao criar lobby." };
  }
}

export async function joinLobby(
  lobbyId: string,
  deck: string[],
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase não configurado." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sem sessão." };
  try {
    const { error } = await sb
      .from("pvp_matches")
      .update({ guest_id: userId, guest_deck: deck, status: "em_andamento" })
      .eq("id", lobbyId)
      .is("guest_id", null);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao entrar." };
  }
}

export async function finishLobby(
  lobbyId: string,
  winnerId: string | null,
  hostScore: number,
  guestScore: number,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb
      .from("pvp_matches")
      .update({
        status: "encerrada",
        winner_id: winnerId,
        host_score: hostScore,
        guest_score: guestScore,
        finished_at: new Date().toISOString(),
      })
      .eq("id", lobbyId);
  } catch {
    /* offline */
  }
}

export { isSupabaseConfigured };
