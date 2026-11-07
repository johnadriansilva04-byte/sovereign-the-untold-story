import { cn } from "@/lib/utils";
import type { BattlePhase, BattleState, Side } from "@/game/battle/types";

export function BattleTopBar({ state }: { state: BattleState }) {
  const remaining = Math.max(0, state.config.duration - state.t);
  const mm = Math.floor(remaining / 60);
  const ss = Math.floor(remaining % 60)
    .toString()
    .padStart(2, "0");
  const phase = phaseLabel(state.phase);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-background/90 px-2 py-2 sm:gap-3 sm:px-4">
      <SideBadge state={state} side="blue" align="left" />

      <div className="text-center">
        <p className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:block">
          {state.config.missionName}
        </p>
        <p className="font-display text-2xl font-bold leading-none tabular-nums sm:text-3xl">
          {mm}:{ss}
        </p>
        <p
          className={cn(
            "font-mono text-[9px] uppercase tracking-[0.16em] sm:text-[10px]",
            state.phase === "pressao" ? "text-destructive" : "text-primary",
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
  const score = Math.round(cfg.score);
  return (
    <div className={cn("flex items-center gap-2 sm:gap-3", align === "right" && "justify-end")}>
      <span className="text-xl leading-none sm:text-2xl">{cfg.flag}</span>
      <div className={cn("min-w-0", align === "right" && "text-right")}>
        <p className="truncate font-display text-xs font-bold uppercase leading-tight sm:text-sm">
          {cfg.countryName}
        </p>
        <p className="hidden font-mono text-[10px] text-muted-foreground sm:block">
          {cfg.commander.name} · {cfg.doctrine}
        </p>
        <p className="font-mono text-[10px]">
          <span className={side === "blue" ? "text-ally" : "text-enemy"}>■</span> território {score}
          %
        </p>
      </div>
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
      return "Pressão final · comando acelerado";
    case "resultado":
      return "Resultado";
    default:
      return "Preparação";
  }
}

export function ObjectiveStrip({ state }: { state: BattleState }) {
  const points = state.config.arena.controlPoints;
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card/40 px-2 py-1.5 sm:px-4">
      <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
        {objectiveLabel(state.config.objectiveKind)}
      </span>
      <span className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline">
        {state.config.objectiveText}
      </span>
      <span className="ml-auto flex gap-2">
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
