import { cn } from "@/lib/utils";
import type { BattleResult } from "@/game/battle/types";
import type { WarConsequence } from "@/game/battle/missions";
import { GameButton } from "@/components/game/shell";

interface Props {
  result: BattleResult;
  consequence: WarConsequence;
  onReplay: () => void;
  onNewMission?: (() => void) | undefined;
  onReturnToMap: () => void;
}

const OUTCOME: Record<BattleResult["outcome"], { label: string; tone: string; sub: string }> = {
  vitoria: { label: "Vitória", tone: "text-fact border-fact", sub: "O objetivo foi cumprido." },
  derrota: { label: "Derrota", tone: "text-enemy border-enemy", sub: "A posição foi perdida." },
  empate: {
    label: "Empate",
    tone: "text-muted-foreground border-border",
    sub: "Sem ganho territorial.",
  },
};

export function BattleResultScreen({
  result,
  consequence,
  onReplay,
  onNewMission,
  onReturnToMap,
}: Props) {
  const o = OUTCOME[result.outcome];
  const mm = Math.floor(result.duration / 60);
  const ss = Math.floor(result.duration % 60)
    .toString()
    .padStart(2, "0");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 sm:gap-3 sm:p-4">
      <section className="hud-panel hud-corners flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-3 text-center">
        <div>
          <p className="label-mono text-primary">Resultado da operação</p>
          <h2 className="font-display text-2xl font-black uppercase leading-none sm:text-4xl">
            {result.missionName}
          </h2>
        </div>
        <p
          className={cn(
            "border px-4 py-1 font-display text-xl font-bold uppercase sm:text-2xl",
            o.tone,
          )}
        >
          {o.label}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {result.reason} · {mm}:{ss} · {o.sub}
        </p>
      </section>

      <div className="grid min-h-0 flex-1 gap-2 sm:gap-3 lg:grid-cols-2">
        <section className="hud-panel hud-corners flex min-h-0 flex-col p-3">
          <p className="label-mono mb-2">Balanço tático</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
            <Line
              label="Território aliado"
              value={`${Math.round(result.territorialScore.blue)}%`}
            />
            <Line
              label="Território inimigo"
              value={`${Math.round(result.territorialScore.red)}%`}
            />
            <Line
              label="Pontos controlados"
              value={`${result.controlPoints.blue} / ${result.controlPoints.red}`}
            />
            <Line
              label="Territórios"
              value={`${result.territories.blue} / ${result.territories.red}`}
            />
            <Line
              label="Estruturas destruídas"
              value={`${result.structuresDestroyed.blue} / ${result.structuresDestroyed.red}`}
            />
            <Line label="Baixas" value={`${result.losses.blue} / ${result.kills.blue}`} />
          </dl>
          <div className="mt-2 flex min-h-0 flex-1 flex-wrap content-start gap-x-3 gap-y-1 overflow-y-auto border-t border-border pt-2">
            {result.pointsHeld.map((p) => (
              <span
                key={p.id}
                className={cn(
                  "font-mono text-[10px] uppercase",
                  p.owner === "blue" && "text-ally",
                  p.owner === "red" && "text-enemy",
                  p.owner === "neutro" && "text-muted-foreground",
                )}
              >
                {p.name} ·{" "}
                {p.owner === "blue" ? "aliado" : p.owner === "red" ? "inimigo" : "neutro"}
              </span>
            ))}
          </div>
        </section>

        <section className="hud-panel hud-corners flex min-h-0 flex-col p-3">
          <p className="label-mono mb-2">Consequências na guerra</p>
          <p className="font-display text-base font-bold uppercase">{consequence.controlShift}</p>
          <p className="text-[11px] text-muted-foreground">{consequence.note}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
            <Line label="Moral militar" value={signed(consequence.militaryDelta)} />
            <Line label="Estabilidade" value={signed(consequence.stabilityDelta)} />
            <Line label="Influência" value={signed(consequence.influenceDelta)} />
            <Line label="Baixas" value={consequence.losses} />
            <Line label="Equipamentos perdidos" value={consequence.equipmentLost} />
          </dl>
        </section>
      </div>

      <div className="flex shrink-0 flex-wrap justify-center gap-2">
        <GameButton onClick={onReplay}>Repetir operação</GameButton>
        {onNewMission && (
          <GameButton variant="ghost" onClick={onNewMission}>
            Escolher outra missão
          </GameButton>
        )}
        <GameButton variant="ghost" onClick={onReturnToMap}>
          Voltar ao mapa
        </GameButton>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
