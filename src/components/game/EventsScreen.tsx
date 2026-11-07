import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { cn } from "@/lib/utils";
import { events } from "@/game/data";
import { chapterMeta } from "@/game/progress/campaign";
import { difficultyById } from "@/game/progress/catalog";
import { useProfile } from "@/game/progress/store";
import type { GameEvent } from "@/game/types";

const kindStyle: Record<GameEvent["kind"], { label: string; cls: string }> = {
  guerra: { label: "Guerra", cls: "border-enemy text-enemy" },
  aliança: { label: "Aliança", cls: "border-ally text-ally" },
  tratado: { label: "Tratado", cls: "border-fact text-fact" },
  conquista: { label: "Conquista", cls: "border-enemy text-enemy" },
  militar: { label: "Militar", cls: "border-destructive text-destructive" },
  economia: { label: "Economia", cls: "border-primary text-primary" },
  ia: { label: "Agente IA", cls: "border-ai text-ai" },
  batalha: { label: "Batalha", cls: "border-doc text-doc" },
};

const outcomeLabel = {
  vitoria: { label: "Vitória", cls: "text-fact" },
  derrota: { label: "Derrota", cls: "text-enemy" },
  empate: { label: "Empate", cls: "text-muted-foreground" },
} as const;

export function EventsScreen() {
  const { profile } = useProfile();
  const byTurn = [...events].sort((a, b) => b.turn - a.turn);

  return (
    <GameShell>
      <PageTitle kicker="Sala de situação · Turno 14" title="Eventos e histórico">
        O que o mundo fez enquanto você lutava — e o registro de cada batalha sua, com consequências
        que voltaram para a nação.
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Feed da guerra">
          <ol className="space-y-3">
            {byTurn.map((e) => {
              const s = kindStyle[e.kind];
              return (
                <li key={e.id} className="flex gap-3 border-l-2 border-border pl-3">
                  <span className="w-9 shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground">
                    T{e.turn}
                  </span>
                  <div className="flex-1">
                    <span
                      className={cn(
                        "mb-1 inline-block border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                        s.cls,
                      )}
                    >
                      {s.label}
                    </span>
                    <p className="text-sm text-foreground/90">{e.text}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {e.actors.map((a) => a.toUpperCase()).join(" · ")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>

        <Panel title={`Histórico de batalhas · ${profile.records.length}`}>
          {profile.records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma batalha registrada ainda. Jogue um capítulo da campanha ou uma partida de
              treino para começar o histórico.
            </p>
          ) : (
            <ul className="space-y-2">
              {profile.records.map((r) => {
                const o = outcomeLabel[r.outcome];
                const chapter = chapterMeta.find((c) => c.missionId === r.missionId);
                return (
                  <li
                    key={r.id}
                    className="grid grid-cols-[1fr_auto] gap-2 border border-border/60 px-3 py-2"
                  >
                    <div>
                      <p className="font-display text-sm font-bold uppercase">
                        {r.missionName}
                        {chapter ? (
                          <span className="ml-2 label-mono">Cap. {chapter.number}</span>
                        ) : null}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.mode} · {difficultyById(r.difficulty).name} · {fmt(r.duration)} · baixas{" "}
                        {r.losses}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "self-center font-mono text-[11px] uppercase tracking-wider",
                        o.cls,
                      )}
                    >
                      {o.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </GameShell>
  );
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
