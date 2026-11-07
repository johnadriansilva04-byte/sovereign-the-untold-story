// Cliente Supabase do SOVEREIGN.
// Usa apenas a chave "publishable" (segura no navegador, protegida por RLS).
// Se as variáveis não estiverem definidas, o app roda 100% offline e nada quebra.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = import.meta.env;
const url = env["VITE_SUPABASE_URL"] as string | undefined;
const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url as string, key as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
