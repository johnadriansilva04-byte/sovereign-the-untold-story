// Autenticação do SOVEREIGN.
// Local-first: quando o Supabase está configurado usamos as contas reais dele
// (e-mail + senha). Quando não está, a conta fica gravada no próprio dispositivo,
// para o jogo funcionar 100% offline — o fluxo de entrar/criar conta é o mesmo.
//
// Nada aqui guarda segredo em texto puro: a senha local é guardada como hash.

import { getSupabase, isSupabaseConfigured } from "./supabase";

export interface Account {
  username: string;
  email: string;
  createdAt: string;
}

interface StoredAccount extends Account {
  passwordHash: string;
}

export interface AuthSession {
  userId: string; // id do Supabase ou "local"
  username: string;
  email: string;
  at: string;
}

const ACCOUNT_KEY = "sovereign.account.v1";
const SESSION_KEY = "sovereign.session.v1";

// ---------------------------------------------------------------------------
// Persistência local
// ---------------------------------------------------------------------------

export function loadAccount(): Account | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as StoredAccount;
    return { username: a.username, email: a.email, createdAt: a.createdAt };
  } catch {
    return null;
  }
}

export function loadSession(): AuthSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* sem storage */
  }
}

function saveAccount(account: StoredAccount): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    /* sem storage */
  }
}

// ---------------------------------------------------------------------------
// Hash de senha (nunca guardar a senha em claro)
// ---------------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(`sovereign:${password}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // ambiente sem SubtleCrypto: ofuscação mínima (apenas para não gravar em claro)
    let h = 5381;
    for (let i = 0; i < password.length; i++) h = (h * 33) ^ password.charCodeAt(i);
    return `fallback-${(h >>> 0).toString(16)}`;
  }
}

// ---------------------------------------------------------------------------
// Validação de formulário
// ---------------------------------------------------------------------------

export interface Credentials {
  username: string;
  email: string;
  password: string;
  confirm: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignUp(c: Credentials): string | null {
  if (!c.username.trim()) return "Informe um nome de usuário.";
  if (c.username.trim().length < 3) return "O nome de usuário precisa de ao menos 3 caracteres.";
  if (!EMAIL_RE.test(c.email.trim())) return "Informe um e-mail válido.";
  if (c.password.length < 6) return "A senha precisa de ao menos 6 caracteres.";
  if (c.password !== c.confirm) return "As senhas não coincidem.";
  return null;
}

export function validateSignIn(email: string, password: string): string | null {
  if (!EMAIL_RE.test(email.trim())) return "Informe um e-mail válido.";
  if (!password) return "Informe a senha.";
  return null;
}

// ---------------------------------------------------------------------------
// Operações de conta
// ---------------------------------------------------------------------------

function newSession(userId: string, username: string, email: string): AuthSession {
  return { userId, username, email, at: new Date().toISOString() };
}

export interface AuthResult {
  ok: boolean;
  session?: AuthSession;
  error?: string;
}

export async function signUp(c: Credentials): Promise<AuthResult> {
  const invalid = validateSignUp(c);
  if (invalid) return { ok: false, error: invalid };
  const username = c.username.trim();
  const email = c.email.trim().toLowerCase();

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.auth.signUp({
      email,
      password: c.password,
      options: { data: { display_name: username } },
    });
    if (error) return { ok: false, error: error.message };
    // grava a identidade local (nome de exibição + e-mail) para o perfil
    saveAccount({
      username,
      email,
      createdAt: new Date().toISOString(),
      passwordHash: await hashPassword(c.password),
    });
    const session = newSession(data.user?.id ?? "supabase", username, email);
    saveSession(session);
    return { ok: true, session };
  }

  // Offline: a conta vive no dispositivo.
  const existing = loadAccount();
  if (existing && existing.email === email)
    return { ok: false, error: "Já existe uma conta com este e-mail neste dispositivo." };
  saveAccount({
    username,
    email,
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(c.password),
  });
  const session = newSession("local", username, email);
  saveSession(session);
  return { ok: true, session };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const invalid = validateSignIn(email, password);
  if (invalid) return { ok: false, error: invalid };
  const mail = email.trim().toLowerCase();

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.auth.signInWithPassword({ email: mail, password });
    if (error) return { ok: false, error: error.message };
    const username =
      (data.user?.user_metadata?.["display_name"] as string | undefined) ??
      loadAccount()?.username ??
      mail.split("@")[0]!;
    saveAccount({
      username,
      email: mail,
      createdAt: new Date().toISOString(),
      passwordHash: await hashPassword(password),
    });
    const session = newSession(data.user?.id ?? "supabase", username, mail);
    saveSession(session);
    return { ok: true, session };
  }

  // Offline: confere contra a conta gravada no dispositivo.
  const account = loadAccount();
  if (!account) return { ok: false, error: "Nenhuma conta neste dispositivo. Crie uma conta." };
  if (account.email !== mail) return { ok: false, error: "E-mail ou senha incorretos." };
  const hash = await hashPassword(password);
  const stored = JSON.parse(localStorage.getItem(ACCOUNT_KEY)!) as StoredAccount;
  if (stored.passwordHash !== hash) return { ok: false, error: "E-mail ou senha incorretos." };
  const session = newSession("local", account.username, account.email);
  saveSession(session);
  return { ok: true, session };
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch {
      /* segue o jogo mesmo sem rede */
    }
  }
  saveSession(null);
}

// Restaura a sessão: se já houver conta/sessão, o jogador entra direto.
export async function restoreSession(): Promise<AuthSession | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.auth.getSession();
      if (data.session?.user) {
        const email = data.session.user.email ?? "";
        const username =
          (data.session.user.user_metadata?.["display_name"] as string | undefined) ??
          loadAccount()?.username ??
          email.split("@")[0] ??
          "Comandante";
        const session = newSession(data.session.user.id, username, email);
        saveSession(session);
        return session;
      }
    } catch {
      /* cai no modo local */
    }
  }
  // Sem sessão do Supabase: usa a sessão local, se houver conta no dispositivo.
  if (!isSupabaseConfigured) return loadSession();
  return loadSession();
}
