import { cn } from "@/lib/utils";
import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { commandCapacity, economyBonus, regenRate } from "@/game/battle/missions";
import { techs, techsByBranch, type TechDef } from "@/game/progress/catalog";
import { useProfile } from "@/game/progress/store";

const BRANCHES: { id: TechDef["branch"]; label: string }[] = [
  { id: "terrestre", label: "Tecnologia terrestre" },
  { id: "aerea", label: "Tecnologia aérea" },
  { id: "suporte", label: "Tecnologia de suporte" },
];

export function NationScreen() {
  const { profile, researchTech } = useProfile();
  const nation = profile.nation;
  const owned = nation.techs;

  const research = (tech: TechDef) => {
    researchTech(tech);
  };

  return (
    <GameShell>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <PageTitle kicker="Administração nacional" title="Nação" compact>
          A pesquisa desbloqueia cartas e possibilidades de jogo.
        </PageTitle>

        <div className="grid shrink-0 grid-cols-3 gap-2 lg:grid-cols-6">
          <Metric label="Militar" value={nation.military} />
          <Metric label="Estabilidade" value={nation.stability} />
          <Metric label="Indústria" value={nation.industry} />
          <Metric label="Logística" value={nation.logistics} />
          <Metric label="Influência" value={nation.influence} />
          <Metric label="Pesquisa" value={profile.research} raw />
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-2">
          <Info label="Comando máx." value={commandCapacity(nation)} />
          <Info label="Regeneração" value={`+${regenRate(nation).toFixed(2)}/s`} />
          <Info label="Bônus econômico" value={`+${(economyBonus(nation) * 100).toFixed(1)}%`} />
        </div>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-3">
          {BRANCHES.map((b) => (
            <Panel key={b.id} title={b.label}>
              <div className="space-y-2">
                {techsByBranch(b.id).map((t) => {
                  const has = owned.includes(t.id);
                  const requiresOk = (t.requires ?? []).every((r) => owned.includes(r));
                  const affordable = profile.research >= t.cost;
                  const available = !has && requiresOk && affordable;
                  return (
                    <button
                      key={t.id}
                      disabled={!available}
                      onClick={() => research(t)}
                      className={cn(
                        "w-full border p-3 text-left transition",
                        has
                          ? "border-fact/50 bg-fact/5"
                          : available
                            ? "border-border hover:border-primary"
                            : "border-border/50 opacity-60",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-display text-sm font-bold uppercase">{t.name}</p>
                        <span
                          className={cn(
                            "font-mono text-[9px] uppercase",
                            has ? "text-fact" : "text-muted-foreground",
                          )}
                        >
                          {has ? "pesquisado" : requiresOk ? `${t.cost} pts` : "bloqueado"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{t.summary}</p>
                      {t.unlocksCards && (
                        <p className="font-mono text-[10px] text-primary">
                          Libera: {t.unlocksCards.join(", ")}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </Panel>
          ))}
        </div>

        <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
          Total de tecnologias: {owned.length}/{techs.length}
        </p>
      </div>
    </GameShell>
  );
}

function Metric({ label, value, raw }: { label: string; value: number; raw?: boolean }) {
  return (
    <div className="hud-panel hud-corners p-3">
      <p className="label-mono text-[9px]">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
      {!raw && (
        <div className="mt-1 h-1 w-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, value)}%` }} />
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border p-3">
      <p className="label-mono text-[9px]">{label}</p>
      <p className="font-display text-lg font-bold">{value}</p>
    </div>
  );
}
