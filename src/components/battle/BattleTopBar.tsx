import { cn } from "@/lib/utils";
import type { BattlePhase, BattleState, Side, Structure } from "@/game/battle/types";

// Barra superior da batalha: relógio no centro, bases nas laterais.
// Mostra a vida da BASE PRINCIPAL de cada lado — é o que decide a partida.
export function BattleTopBar({ state }: { state: BattleState }) {
  const remaining = Math.max(0, state.config.duration - state.t);
  const mm = Math.floor(remaining / 60);
  const ss = Math.floor(remaining % 60)
    .toString()
    .padStart(2, "0");
  const phase = phaseLabel(state.phase);
  const pressure = state.phase === "pressao";

  return (
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-background/95 px-2 py-1.5 sm:gap-3 sm:px-4">
      <SideBadge state={state} side="blue" align="left" />

      <div className="text-center">
        <p
          className={cn(
            "font-display text-2xl font-bold leading-none tabular-nums sm:text-3xl",
            pressure && "text-destructive",
          )}
        >
          {mm}:{ss}
        </p>
        <p
          className={cn(
            "font-mono text-[9px] uppercase tracking-[0.16em]",
            pressure ? "text-destructive" : "text-primary",
          )}
        >
          {phase}
        </p>
      </div>

      <SideBadge state={state} side="red" align="right" />
    </div>
  );
}

function SideBadge({
  state,
  side,
  align,
}: {
  state: BattleState;
  side: Side;
  align: "left" | "right";
}) {
  const cfg = side === "blue" ? state.blue : state.red;
  const base = state.structures.find((s) => s.side === side && s.kind === "base-principal");
  const tone = side === "blue" ? "bg-ally" : "bg-enemy";
  return (
    <div className={cn("flex items-center gap-2 sm:gap-3", align === "right" && "justify-end")}>
      {align === "right" && <BaseBar base={base} tone={tone} />}
      <div className={cn("min-w-0", align === "right" && "text-right")}>
        <p className="flex items-center gap-1 truncate font-display text-xs font-bold uppercase leading-tight sm:text-sm">
          <span className="text-base leading-none sm:text-lg">{cfg.flag}</span>
          <span className="truncate">{cfg.countryName}</span>
        </p>
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Base {base ? `${Math.round((base.hp / base.maxHp) * 100)}%` : "destruída"}
        </p>
      </div>
      {align === "left" && <BaseBar base={base} tone={tone} />}
    </div>
  );
}

function BaseBar({ base, tone }: { base: Structure | undefined; tone: string }) {
  const pct = base ? Math.max(0, Math.min(100, (base.hp / base.maxHp) * 100)) : 0;
  const dead = pct <= 0.01;
  return (
    <div className="h-2 w-14 shrink-0 overflow-hidden border border-border bg-muted sm:w-24">
      <div
        className={cn("h-full transition-[width] duration-200", dead ? "bg-destructive" : tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function phaseLabel(phase: BattlePhase): string {
  switch (phase) {
    case "mobilizacao":
      return "Mobilização";
    case "combate":
      return "Combate";
    case "pressao":
      return "Pressão final";
    case "resultado":
      return "Resultado";
    default:
      return "Preparação";
  }
}

// Faixa de objetivos: usada no relatório de batalha (não ocupa a tela principal).
export function ObjectiveStrip({ state }: { state: BattleState }) {
  const points = state.config.arena.controlPoints;
  const terrBlue = state.territories.filter((t) => t.owner === "blue").length;
  const terrRed = state.territories.filter((t) => t.owner === "red").length;
  const advBlue = state.structures.filter(
    (s) => s.side === "blue" && s.kind === "base-avancada",
  ).length;
  const advRed = state.structures.filter(
    (s) => s.side === "red" && s.kind === "base-avancada",
  ).length;
  return (
    <div className="flex flex-wrap items-center gap-2 border border-border bg-card/40 px-2 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
        {objectiveLabel(state.config.objectiveKind)}
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <span className="whitespace-nowrap border border-ally px-1.5 py-0.5 font-mono text-[10px] uppercase text-ally">
          Território {terrBlue}×{terrRed}
        </span>
        <span className="whitespace-nowrap border border-doc px-1.5 py-0.5 font-mono text-[10px] uppercase text-doc">
          Bases avançadas {advBlue}×{advRed}
        </span>
        {points.map((p) => (
          <span
            key={p.id}
            className={cn(
              "whitespace-nowrap border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
              p.owner === "blue" && "border-ally text-ally",
              p.owner === "red" && "border-enemy text-enemy",
              p.owner === "neutro" && "border-border text-muted-foreground",
            )}
          >
            {p.name}
          </span>
        ))}
      </span>
    </div>
  );
}

function objectiveLabel(kind: BattleState["config"]["objectiveKind"]): string {
  switch (kind) {
    case "territorial":
      return "Objetivo · Superioridade territorial";
    case "militar":
      return "Objetivo · Superioridade militar";
    case "operacional":
      return "Objetivo · Missão operacional";
  }
}
