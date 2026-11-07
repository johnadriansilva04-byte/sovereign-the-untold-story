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
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <section className="hud-panel hud-corners p-6 text-center">
        <p className="label-mono text-primary">Resultado da operação</p>
        <h2 className="mt-1 font-display text-6xl font-black uppercase">{result.missionName}</h2>
        <p
          className={cn(
            "mx-auto mt-3 inline-block border px-4 py-1 font-display text-2xl font-bold uppercase",
            o.tone,
          )}
        >
          {o.label}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{result.reason}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          Duração simulada {mm}:{ss} · {o.sub}
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="hud-panel hud-corners p-5">
          <p className="label-mono mb-3">Balanço tático</p>
          <dl className="space-y-2 font-mono text-xs">
            <Line
              label="Território (aliado / inimigo)"
              value={`${Math.round(result.territorialScore.blue)}% / ${Math.round(result.territorialScore.red)}%`}
            />
            <Line
              label="Pontos controlados"
              value={`${result.controlPoints.blue} / ${result.controlPoints.red}`}
            />
            <Line label="Baixas inimigas" value={result.kills.blue} />
            <Line label="Suas baixas" value={result.losses.blue} />
            <Line label="Comando não gasto" value={Math.floor(result.remainingCommand.blue)} />
          </dl>
          <div className="mt-3 space-y-1">
            {result.pointsHeld.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b border-border/60 pb-1 font-mono text-[11px]"
              >
                <span className="text-muted-foreground">
                  {p.sector.toUpperCase()} · {p.name}
                </span>
                <span
                  className={cn(
                    p.owner === "blue" && "text-ally",
                    p.owner === "red" && "text-enemy",
                    p.owner === "neutro" && "text-muted-foreground",
                  )}
                >
                  {p.owner === "blue" ? "Aliado" : p.owner === "red" ? "Inimigo" : "Neutro"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="hud-panel hud-corners p-5">
          <p className="label-mono mb-3">Consequências na guerra</p>
          <p className="font-display text-lg font-bold uppercase">{consequence.controlShift}</p>
          <p className="mt-1 text-sm text-muted-foreground">{consequence.note}</p>
          <dl className="mt-4 space-y-2 font-mono text-xs">
            <Line label="Moral militar" value={signed(consequence.militaryDelta)} />
            <Line label="Estabilidade nacional" value={signed(consequence.stabilityDelta)} />
            <Line label="Influência diplomática" value={signed(consequence.influenceDelta)} />
            <Line label="Baixas" value={consequence.losses} />
            <Line label="Equipamentos perdidos" value={consequence.equipmentLost} />
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            O resultado volta para o mapa geopolítico: controle territorial, baixas, equipamentos,
            moral e influência. Uma vitória abre caminho para novas operações; uma derrota obriga a
            reorganizar as forças.
          </p>
        </section>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
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
