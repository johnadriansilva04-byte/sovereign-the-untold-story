import { cn } from "@/lib/utils";
import type { BattleState, Side } from "@/game/battle/types";

// PAINEL DO PERSONAGEM: o chanceler é a peça que decide a batalha, mas no teatro ele é
// só uma peça pequena no meio de dezenas. Este cartão dá rosto e nome a ele — retrato,
// estado (em campo / cativo / morto) e vida — para o jogador saber de quem é o risco.
export function HeroCard({ state, localSide }: { state: BattleState; localSide: Side }) {
  if ((state.config.heroSetup?.length ?? 0) === 0) return null;

  const mode = state.config.chancellorMode ?? "defender";
  const foe: Side = localSide === "blue" ? "red" : "blue";
  const side: Side = mode === "defender" ? localSide : foe;
  const hero = state.heroes[side];
  const unit = (side === "blue" ? state.blue : state.red).units.find(
    (u) => u.id === hero.unitId && u.alive,
  );
  const pct = unit ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)) : 0;
  const dead = hero.state === "morto";
  const tone = dead
    ? "text-destructive"
    : hero.state === "preso" || hero.state === "fugindo"
      ? "text-primary"
      : hero.state === "seguro"
        ? "text-fact"
        : "text-ally";
  const label =
    hero.state === "morto"
      ? "Abatido"
      : hero.state === "preso"
        ? hero.captured
          ? "Capturado"
          : "Cativo"
        : hero.state === "fugindo"
          ? "Fugindo"
          : hero.state === "seguro"
            ? "Seguro"
            : "Em campo";
  const uniform = side === "blue" ? "var(--ally-unit)" : "var(--enemy-unit)";

  return (
    <div
      data-testid="hero-card"
      className="hud-panel hud-corners w-44 p-2 sm:w-48"
      aria-label="Chanceler em campo"
    >
      <div className="flex items-center gap-2">
        <div className="relative shrink-0 overflow-hidden border border-border/80">
          <ChancellorBust uniform={uniform} dead={dead} />
          {dead && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70 font-mono text-[8px] uppercase tracking-wider text-destructive">
              ✕
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-primary">
            {mode === "defender" ? "Seu chanceler" : "Chanceler inimigo"}
          </p>
          <p className="truncate font-display text-sm font-bold uppercase leading-tight">
            {unit?.name ?? "Chanceler"}
          </p>
          <p className={cn("font-mono text-[9px] uppercase tracking-wider", tone)}>{label}</p>
        </div>
      </div>

      <div className="mt-1.5 h-1.5 w-full overflow-hidden border border-border bg-muted">
        <div
          className={cn(
            "h-full transition-[width] duration-200",
            pct > 40 ? "bg-fact" : "bg-destructive",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
        <span>Vida</span>
        <span className="tabular-nums">{Math.round(pct)}%</span>
      </div>
      {mode === "defender" && hero.state === "livre" && (
        <p className="mt-1 border-t border-border/60 pt-1 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
          Setas / analógico · comando direto
        </p>
      )}
    </div>
  );
}

// Retrato estilizado de busto: ombreiras, gola, cabeça e quepe. É propositalmente
// gráfico (sem foto), mas com proporções humanas para o personagem ter presença.
function ChancellorBust({ uniform, dead }: { uniform: string; dead: boolean }) {
  const skin = dead ? "oklch(0.55 0.02 60)" : "oklch(0.72 0.06 70)";
  const shadow = "oklch(0 0 0 / 0.55)";
  const cap = "oklch(0.2 0.012 90)";
  const gold = "var(--primary)";
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden>
      <defs>
        <radialGradient id="heroCardBg" cx="0.35" cy="0.25" r="0.9">
          <stop offset="0%" stopColor="oklch(0.4 0.02 100)" />
          <stop offset="100%" stopColor="oklch(0.16 0.01 100)" />
        </radialGradient>
        <linearGradient id="heroCardLight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(1 0 0 / 0.12)" />
          <stop offset="100%" stopColor="oklch(0 0 0 / 0.25)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill="url(#heroCardBg)" />
      {/* ombros / casaco */}
      <path
        d="M7 64 Q9 45 25 42 L39 42 Q55 45 57 64 Z"
        fill={uniform}
        stroke={shadow}
        strokeWidth="1"
      />
      {/* gola e dragonas douradas */}
      <path d="M26 42 L32 52 L38 42 Z" fill="oklch(0.22 0.01 90)" opacity="0.9" />
      <rect x="20" y="44" width="7" height="3" fill={gold} opacity="0.9" />
      <rect x="37" y="44" width="7" height="3" fill={gold} opacity="0.9" />
      {/* pescoço e cabeça */}
      <rect x="29" y="35" width="6" height="8" fill={skin} opacity="0.9" />
      <ellipse cx="32" cy="28" rx="8.6" ry="9.6" fill={skin} stroke={shadow} strokeWidth="0.8" />
      {/* quepe com aba */}
      <path d="M22 23 Q32 13 42 23 L43 26 Q32 20 21 26 Z" fill={cap} />
      <rect x="20" y="22" width="24" height="4" rx="1" fill={cap} />
      <path d="M19 26 Q32 30 45 26 L45 29 Q32 33 19 29 Z" fill={cap} opacity="0.92" />
      <circle cx="32" cy="21" r="1.7" fill={gold} />
      {/* rosto: sobrancelhas, olhos e boca */}
      <path d="M26.5 27 Q29 26 31 27.4" stroke={shadow} strokeWidth="0.9" fill="none" />
      <path d="M33 27.4 Q35 26 37.5 27" stroke={shadow} strokeWidth="0.9" fill="none" />
      <circle cx="28.6" cy="29.4" r="1" fill={shadow} />
      <circle cx="35.4" cy="29.4" r="1" fill={shadow} />
      <path d="M29 33.6 Q32 35.2 35 33.6" stroke={shadow} strokeWidth="0.8" fill="none" />
      {/* luz da mesa sobre o retrato */}
      <rect width="64" height="64" fill="url(#heroCardLight)" />
    </svg>
  );
}
