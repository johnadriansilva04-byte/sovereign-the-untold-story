import { cn } from "@/lib/utils";
import type { BattleState, BattleLogEntry } from "@/game/battle/types";

const KIND_TONE: Record<BattleLogEntry["kind"], string> = {
  deploy: "text-ally",
  apoio: "text-doc",
  captura: "text-primary",
  baixa: "text-enemy",
  ordem: "text-muted-foreground",
  evento: "text-foreground",
  ia: "text-ai",
  construcao: "text-fact",
  destruicao: "text-destructive",
};

export function BattleLogPanel({ state }: { state: BattleState }) {
  return (
    <div className="hud-panel hud-corners flex max-h-64 flex-col overflow-hidden p-3">
      <p className="label-mono mb-2">Registro tático</p>
      <ul className="flex-1 space-y-1 overflow-y-auto pr-1">
        {state.log.slice(0, 40).map((e, i) => (
          <li key={i} className="flex gap-2 font-mono text-[10px] leading-snug">
            <span className="shrink-0 text-muted-foreground">{formatTime(e.t)}</span>
            <span className={cn(KIND_TONE[e.kind], e.kind === "ia" && "italic")}>{e.text}</span>
          </li>
        ))}
        {state.log.length === 0 && (
          <li className="font-mono text-[10px] text-muted-foreground">
            Aguardando primeiros movimentos…
          </li>
        )}
      </ul>
    </div>
  );
}

export function AiCommanderPanel({ state }: { state: BattleState }) {
  const red = state.red;
  const intel = state.log.filter((e) => e.kind === "ia").slice(0, 3);
  return (
    <div className="hud-panel hud-corners p-3">
      <div className="flex items-center justify-between">
        <p className="label-mono">Comandante adversário · IA</p>
        <span className="border border-ai px-1 font-mono text-[9px] uppercase text-ai">
          {red.commander.personality}
        </span>
      </div>
      <p className="mt-1 font-display text-sm font-bold uppercase">
        {red.flag} {red.commander.name}
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">
        Doutrina: {red.doctrine} · Comando {Math.floor(red.command)}/{red.commandMax}
      </p>
      <p className="mt-1 text-xs italic text-muted-foreground">{red.commander.note}</p>

      <p className="label-mono mt-3 mb-1">Leitura recente da IA</p>
      <ul className="space-y-1">
        {intel.length === 0 && (
          <li className="font-mono text-[10px] text-muted-foreground">Sem decisões registradas.</li>
        )}
        {intel.map((e, i) => (
          <li
            key={i}
            className="border-l-2 border-ai/50 pl-2 font-mono text-[10px] italic text-ai/90"
          >
            {e.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-border pt-2 font-mono text-[9px] leading-relaxed text-muted-foreground">
        A IA opera sob as mesmas regras: comando limitado, mão própria de cartas e informação
        restrita ao que o reconhecimento dela alcança.
      </p>
    </div>
  );
}

function formatTime(t: number): string {
  const mm = Math.floor(t / 60);
  const ss = Math.floor(t % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}
