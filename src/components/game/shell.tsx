import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EvidenceKind } from "@/game/types";

// Navegação principal: só o essencial de guerra. O resto fica no menu secundário.
const primaryNav = [
  { to: "/campanha", label: "Campanha" },
  { to: "/multiplayer", label: "Multiplayer" },
  { to: "/colecao", label: "Coleção" },
  { to: "/perfil", label: "Perfil" },
] as const;

const secondaryNav = [
  { to: "/mapa", label: "Mapa" },
  { to: "/nacao", label: "Nação" },
  { to: "/ia", label: "Agentes IA" },
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

export function GameShell({
  children,
  full,
  bare,
}: {
  children: ReactNode;
  full?: boolean;
  bare?: boolean;
}) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {!bare && (
        <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex h-14 items-center gap-5 px-4 md:px-5">
            <Logo />
            <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
              {primaryNav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "!text-primary border-b-2 border-primary" }}
                >
                  {n.label}
                </Link>
              ))}
              <details className="relative">
                <summary className="cursor-pointer list-none whitespace-nowrap px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
                  Mais ▾
                </summary>
                <div className="absolute left-0 top-full z-50 mt-1 min-w-40 border border-border bg-popover p-1 shadow-lg">
                  {secondaryNav.map((n) => (
                    <Link
                      key={n.to}
                      to={n.to}
                      className="block px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      activeProps={{ className: "!text-primary" }}
                    >
                      {n.label}
                    </Link>
                  ))}
                </div>
              </details>
            </nav>
            <div className="hidden items-center gap-3 font-mono text-[11px] text-muted-foreground lg:flex">
              <Link to="/perfil" className="hover:text-primary">
                PERFIL
              </Link>
              <Link to="/configuracoes" className="hover:text-primary">
                ⚙
              </Link>
            </div>
          </div>
        </header>
      )}
      <main
        className={cn(
          "min-h-0 flex-1",
          full ? "overflow-hidden" : "overflow-y-auto",
          !full && "mx-auto w-full max-w-7xl px-5 py-6",
        )}
      >
        {children}
      </main>
      {!full && !bare && <Footer />}
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
  compact,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("shrink-0 animate-rise", compact ? "mb-3" : "mb-6")}>
      <p className="label-mono text-primary">{kicker}</p>
      <h1 className={cn("mt-1 font-black uppercase", compact ? "text-2xl" : "text-4xl")}>
        {title}
      </h1>
      {children && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{children}</p>}
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
