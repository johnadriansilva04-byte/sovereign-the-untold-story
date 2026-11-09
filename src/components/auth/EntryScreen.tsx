import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { useProfile } from "@/game/progress/store";

type Mode = "entrar" | "criar";

// Tela de entrada: uma só, sem rolagem. O jogador entra na conta ou cria uma —
// o perfil e o progresso ficam salvos na conta dele.
export function EntryScreen() {
  const navigate = useNavigate();
  const { session, signInAccount, signUpAccount } = useProfile();
  const [mode, setMode] = useState<Mode>("entrar");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Quem já tem sessão não precisa passar por aqui.
  useEffect(() => {
    if (session) void navigate({ to: "/" });
  }, [session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "criar"
          ? await signUpAccount({ username, email, password, confirm })
          : await signInAccount(email, password);
      if (!res.ok) {
        setError(res.error ?? "Não foi possível concluir.");
        return;
      }
      void navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,oklch(0.76_0.13_78_/_0.12),transparent_60%)]" />
      <div className="hud-panel hud-corners relative w-full max-w-md p-6">
        <p className="font-display text-3xl font-black tracking-[0.2em]">
          SOVEREIGN<span className="text-primary">.</span>
        </p>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {mode === "entrar" ? "Entrar na conta" : "Criar conta de comandante"}
        </p>

        <div className="mt-4 grid grid-cols-2 border border-border">
          {(["entrar", "criar"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "entrar" ? "Entrar" : "Criar conta"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          {mode === "criar" && (
            <Field label="Nome de usuário">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="input-line"
                placeholder="Ex.: Comandante Varela"
              />
            </Field>
          )}
          <Field label="E-mail">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="input-line"
              placeholder="voce@exemplo.com"
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "criar" ? "new-password" : "current-password"}
              className="input-line"
              placeholder="••••••"
            />
          </Field>
          {mode === "criar" && (
            <Field label="Confirmar senha">
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="input-line"
                placeholder="••••••"
              />
            </Field>
          )}

          {error && (
            <p className="border border-destructive px-3 py-2 font-mono text-[11px] text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-primary py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Processando…" : mode === "entrar" ? "Entrar" : "Criar e entrar"}
          </button>
        </form>

        <p className="mt-3 text-center font-mono text-[10px] leading-relaxed text-muted-foreground">
          Sua conta guarda o progresso da campanha, o baralho e as conquistas.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
