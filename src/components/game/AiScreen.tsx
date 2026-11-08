import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { countries, personalityStyle } from "@/game/data";
import { commanders } from "@/game/battle/catalog";
import { missionForChapter } from "@/game/battle/missions";
import { difficulties, type Difficulty } from "@/game/progress/catalog";
import { chapterMeta } from "@/game/progress/campaign";
import { useProfile } from "@/game/progress/store";

export function AiScreen() {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [selectedCommander, setSelectedCommander] = useState(commanders[0]!.id);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("veterano");

  const aiCountries = countries.filter((c) => c.controller === "ia");
  const availableChapter =
    chapterMeta.find((c) => profile.chapters[c.id]?.status !== "bloqueado") ?? chapterMeta[0]!;

  const start = () => {
    const mission = missionForChapter(availableChapter.id);
    void navigate({
      to: "/batalha",
      search: {
        dificuldade: selectedDifficulty,
        ...(mission ? { missao: mission.id } : {}),
      },
    });
  };

  return (
    <GameShell>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <PageTitle kicker="Comandantes e países" title="Agentes IA" compact>
          A IA joga pelas mesmas regras: comando limitado, mão própria de cartas e reconhecimento
          restrito.
        </PageTitle>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-2">
          <Panel title="Comandantes de campo" className="flex min-h-0 flex-col">
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {commanders.map((c) => {
                const active = c.id === selectedCommander;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedCommander(c.id)}
                      className={cn(
                        "w-full border px-3 py-2 text-left transition",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border/60 hover:border-primary/50",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-base font-bold uppercase">{c.name}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {c.personality}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.note}</p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                        Doutrina: {c.doctrine}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <Panel title="Nível de ameaça">
              <div className="space-y-2">
                {difficulties.map((d) => {
                  const active = d.id === selectedDifficulty;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDifficulty(d.id)}
                      className={cn(
                        "flex w-full items-center justify-between border px-3 py-2 text-left transition",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border/60 hover:border-primary/50",
                      )}
                    >
                      <span>
                        <span className="font-display text-sm font-bold uppercase">{d.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {d.summary}
                        </span>
                      </span>
                      {d.isLlm && (
                        <span className="border border-ai px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ai">
                          LLM
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={start}
                className="mt-4 w-full bg-primary px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] text-primary-foreground hover:brightness-110"
              >
                Iniciar treino contra IA
              </button>
              <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                O treino abre a missão do capítulo atual no modo escolhido.
              </p>
            </Panel>

            <Panel title="Países sob controle de IA">
              <ul className="space-y-2">
                {aiCountries.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between border border-border/60 px-3 py-2"
                  >
                    <span className="font-display text-sm font-bold uppercase">
                      {c.flag} {c.name}
                    </span>
                    {c.personality && (
                      <span
                        className={cn(
                          "border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                          personalityStyle[c.personality],
                        )}
                      >
                        {c.personality}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </GameShell>
  );
}
