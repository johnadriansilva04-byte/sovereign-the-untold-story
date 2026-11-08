import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EvidenceKind } from "@/game/types";

const nav = [
  { to: "/mapa", label: "Mapa" },
  { to: "/nacao", label: "Nação" },
  { to: "/ia", label: "Agentes IA" },
  { to: "/batalha", label: "Batalha" },
  { to: "/campanha", label: "Campanha" },
  { to: "/multiplayer", label: "Multiplayer" },
  { to: "/colecao", label: "Coleção" },
] as const;

export function pageHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} · SOVEREIGN` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} · SOVEREIGN` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("font-display text-xl font-black tracking-[0.25em] text-foreground", className)}
    >
      SOVEREIGN<span className="text-primary">.</span>
    </Link>
  );
}

export function GameShell({ children, full }: { children: ReactNode; full?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-5">
          <Logo />
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "!text-primary border-b-2 border-primary" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-4 font-mono text-[11px] text-muted-foreground lg:flex">
            <span>
              TURNO <b className="text-foreground">14</b>
            </span>
            <span>🇧🇷 BRASIL</span>
            <Link to="/perfil" className="hover:text-primary">
              PERFIL
            </Link>
            <Link to="/configuracoes" className="hover:text-primary">
              ⚙
            </Link>
          </div>
        </div>
      </header>
      <main className={cn("flex-1", !full && "mx-auto w-full max-w-7xl px-5 py-8")}>
        {children}
      </main>
      {!full && <Footer />}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border px-5 py-3 text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60">
      UM JOGO VARIANT · EM HOMENAGEM À FORÇA EXPEDICIONÁRIA BRASILEIRA ·{" "}
      <Link to="/dossie" className="hover:text-primary">
        DOSSIÊ DO PROJETO
      </Link>{" "}
      ·{" "}
      <Link to="/creditos" className="hover:text-primary">
        CRÉDITOS
      </Link>
    </footer>
  );
}

export function Panel({
  title,
  children,
  className,
  action,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("hud-panel hud-corners p-5", className)}>
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="label-mono">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 animate-rise">
      <p className="label-mono text-primary">{kicker}</p>
      <h1 className="mt-1 text-5xl font-black uppercase">{title}</h1>
      {children && <p className="mt-2 max-w-2xl text-muted-foreground">{children}</p>}
    </div>
  );
}

export function Meter({
  value,
  tone = "primary",
  label,
}: {
  value: number;
  tone?: "primary" | "feb" | "enemy" | "ai" | "ally";
  label?: string;
}) {
  const bg = {
    primary: "bg-primary",
    feb: "bg-feb",
    enemy: "bg-enemy",
    ai: "bg-ai",
    ally: "bg-ally",
  }[tone];
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>{label}</span>
          <span className="text-foreground">{Math.round(value)}</span>
        </div>
      )}
      <div className="h-1.5 w-full bg-muted">
        <div
          className={cn("h-full transition-all", bg)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <p className="font-display text-3xl font-bold">{value}</p>
      {sub && <p className="font-mono text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const evidence: Record<EvidenceKind, { label: string; cls: string }> = {
  fato: { label: "Fato documentado", cls: "border-fact text-fact" },
  documento: { label: "Documento / citação", cls: "border-doc text-doc" },
  ficcao: { label: "Ficção · tese do jogo", cls: "border-fiction text-fiction" },
};
export function EvidenceBadge({ kind }: { kind: EvidenceKind }) {
  const e = evidence[kind];
  return (
    <span
      className={cn(
        "inline-block border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        e.cls,
      )}
    >
      {e.label}
    </span>
  );
}

export function GameButton({
  children,
  variant = "primary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-primary text-primary-foreground hover:brightness-110 shadow-brass",
    ghost: "border border-border text-foreground hover:border-primary hover:text-primary",
    danger:
      "border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground",
  }[variant];
  return (
    <button
      {...rest}
      className={cn(
        "px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] transition disabled:opacity-40",
        v,
        className,
      )}
    >
      {children}
    </button>
  );
}
