import { useId } from "react";

import { cn } from "@/lib/utils";
import { chancellorPersona, traitById, uniformById } from "@/game/battle/chancellor";
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
  const cfg = side === "blue" ? state.blue : state.red;
  const persona = chancellorPersona(cfg.countryId, cfg.countryName);
  // O NOSSO chanceler é o criado na campanha (nome, uniforme, estilo) com a arma
  // equipada; o adversário segue a persona fixa do país.
  const loadout = cfg.hero;
  const heroName = unit?.name ?? loadout?.name ?? persona.name;
  const trait = loadout ? traitById(loadout.traitId).name : persona.trait;
  const bio = loadout?.bio ?? persona.bio;
  const uniform = loadout
    ? uniformById(loadout.uniformId).color
    : side === "blue"
      ? "var(--ally-unit)"
      : "var(--enemy-unit)";

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
          <p
            className="truncate font-display text-sm font-bold uppercase leading-tight"
            title={bio}
          >
            {heroName}
          </p>
          <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider">
            <span className="text-muted-foreground">{trait}</span>
            <span className="text-border">·</span>
            <span className={cn(tone)}>{label}</span>
          </p>
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
      {loadout?.weaponName && (
        <p className="mt-1 truncate font-mono text-[8px] uppercase tracking-wider text-primary/90">
          {loadout.weaponName}
        </p>
      )}
      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground/90">{bio}</p>
    </div>
  );
}

// Retrato estilizado de busto: quepe, gola, ombreiras e rosto com luz de três tons.
// Gráfico (sem foto), mas com proporções humanas e sombreamento — o chanceler precisa
// ter presença no teatro, onde ele é uma peça pequena no meio de dezenas.
export function ChancellorBust({
  uniform,
  dead = false,
  className = "h-14 w-14",
}: {
  uniform: string;
  dead?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const skin = dead ? "oklch(0.55 0.02 60)" : "oklch(0.74 0.055 72)";
  const skinShade = dead ? "oklch(0.45 0.02 60)" : "oklch(0.62 0.06 58)";
  const skinLight = dead ? "oklch(0.6 0.02 60)" : "oklch(0.82 0.045 76)";
  const shadow = "oklch(0 0 0 / 0.55)";
  const cap = "oklch(0.2 0.012 90)";
  const capLight = "oklch(0.3 0.014 90)";
  const gold = "var(--primary)";
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id={`bg${uid}`} cx="0.35" cy="0.22" r="0.95">
          <stop offset="0%" stopColor="oklch(0.42 0.02 100)" />
          <stop offset="100%" stopColor="oklch(0.15 0.01 100)" />
        </radialGradient>
        <linearGradient id={`light${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(1 0 0 / 0.14)" />
          <stop offset="60%" stopColor="oklch(1 0 0 / 0)" />
          <stop offset="100%" stopColor="oklch(0 0 0 / 0.3)" />
        </linearGradient>
        <linearGradient id={`face${uid}`} x1="0.15" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={skinLight} />
          <stop offset="55%" stopColor={skin} />
          <stop offset="100%" stopColor={skinShade} />
        </linearGradient>
        <linearGradient id={`tunic${uid}`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={uniform} stopOpacity="1" />
          <stop offset="100%" stopColor={uniform} stopOpacity="0.62" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#bg${uid})`} />
      {/* linhas de carta topográfica ao fundo: o retrato é um documento de campo */}
      <g stroke="oklch(1 0 0 / 0.07)" strokeWidth="0.4" fill="none">
        <path d="M0 12 Q16 8 32 14 T64 10" />
        <path d="M0 20 Q18 16 34 22 T64 18" />
        <path d="M0 54 Q18 50 34 56 T64 52" />
      </g>

      {/* ombros / túnica */}
      <path
        d="M4 64 Q6 46 24 42 L40 42 Q58 46 60 64 Z"
        fill={`url(#tunic${uid})`}
        stroke={shadow}
        strokeWidth="1"
      />
      {/* gola aberta com camisa e gravata */}
      <path d="M27 42 L32 55 L37 42 Z" fill="oklch(0.9 0.01 90)" opacity="0.85" />
      <path d="M30.4 44 L32 53 L33.6 44 Z" fill="oklch(0.18 0.01 90)" />
      {/* dragonas douradas */}
      <rect x="18.5" y="43.5" width="8" height="2.6" rx="0.8" fill={gold} opacity="0.92" />
      <rect x="37.5" y="43.5" width="8" height="2.6" rx="0.8" fill={gold} opacity="0.92" />
      {/* botões */}
      <circle cx="32" cy="58" r="1" fill={gold} opacity="0.75" />
      <circle cx="32" cy="61.5" r="1" fill={gold} opacity="0.6" />

      {/* pescoço com sombra sob o queixo */}
      <path d="M27.5 33 L36.5 33 L36.5 43 Q32 45 27.5 43 Z" fill={skinShade} />
      <ellipse cx="32" cy="34.5" rx="5.6" ry="1.6" fill="oklch(0 0 0 / 0.18)" />
      {/* orelhas */}
      <ellipse cx="22.6" cy="28.4" rx="1.5" ry="2.4" fill={skinShade} />
      <ellipse cx="41.4" cy="28.4" rx="1.5" ry="2.4" fill={skinShade} />

      {/* cabeça: volume com luz vinda de noroeste */}
      <path
        d="M23.4 25.6 Q23.4 16.6 32 16.2 Q40.6 16.6 40.6 25.6 Q40.6 34.6 32 36.4 Q23.4 34.6 23.4 25.6 Z"
        fill={`url(#face${uid})`}
        stroke={shadow}
        strokeWidth="0.7"
      />
      {/* maçãs do rosto e sombra lateral */}
      <path d="M24.2 28.4 Q26 33 29 34.6 Q26 34.8 24.2 30.6 Z" fill={skinShade} opacity="0.55" />
      <path d="M39.8 28.4 Q38 33 35 34.6 Q38 34.8 39.8 30.6 Z" fill={skinShade} opacity="0.7" />

      {/* quepe: copa, faixa e pala */}
      <path d="M21.6 24.4 Q22.6 12.4 32 12 Q41.4 12.4 42.4 24.4 Q32 21.4 21.6 24.4 Z" fill={cap} />
      <path d="M23.4 20.6 Q27 16.4 32 16.2 Q29.6 18.6 27.4 21.6 Z" fill={capLight} opacity="0.8" />
      <rect x="20.4" y="21.6" width="23.2" height="3.6" rx="1.1" fill="oklch(0.13 0.01 90)" />
      <path
        d="M18.6 25.2 Q32 29.6 45.4 25.2 L45.4 27.6 Q32 32 18.6 27.6 Z"
        fill={cap}
        opacity="0.95"
      />
      <path
        d="M18.6 25.2 Q32 29.6 45.4 25.2"
        stroke="oklch(1 0 0 / 0.14)"
        strokeWidth="0.4"
        fill="none"
      />
      {/* distintivo dourado do quepe */}
      <circle cx="32" cy="20.4" r="1.7" fill={gold} opacity="0.95" />

      {/* rosto: sobrancelhas, olhos, nariz e boca */}
      <path
        d="M26.6 27.2 Q29 26.2 31 27.6"
        stroke={shadow}
        strokeWidth="0.85"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M33 27.6 Q35 26.2 37.4 27.2"
        stroke={shadow}
        strokeWidth="0.85"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="28.6" cy="29.5" rx="1.05" ry="0.9" fill="oklch(0.2 0.01 90)" />
      <ellipse cx="35.4" cy="29.5" rx="1.05" ry="0.9" fill="oklch(0.2 0.01 90)" />
      <circle cx="28.9" cy="29.2" r="0.32" fill="oklch(1 0 0 / 0.65)" />
      <circle cx="35.7" cy="29.2" r="0.32" fill="oklch(1 0 0 / 0.65)" />
      <path
        d="M32 29.8 L32 32.2 Q33 32.6 33.6 32.2"
        stroke={skinShade}
        strokeWidth="0.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M29.6 33.8 Q32 35 34.4 33.8"
        stroke="oklch(0.32 0.03 40)"
        strokeWidth="0.7"
        fill="none"
        strokeLinecap="round"
      />
      {/* sombra de barba */}
      <path
        d="M26.4 32.6 Q32 37.4 37.6 32.6 Q36 36.6 32 37.2 Q28 36.6 26.4 32.6 Z"
        fill={skinShade}
        opacity="0.3"
      />

      {/* luz da mesa sobre o retrato */}
      <rect width="64" height="64" fill={`url(#light${uid})`} />
    </svg>
  );
}
