import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { countries, events, relationOf } from "@/game/data";
import { missionForChapter } from "@/game/battle/missions";
import { chapterMeta } from "@/game/progress/campaign";
import { useProfile } from "@/game/progress/store";
import type { Country, Relation } from "@/game/types";

const relationStyle: Record<Relation, { label: string; cls: string }> = {
  aliança: { label: "Aliança", cls: "border-ally text-ally" },
  tratado: { label: "Tratado", cls: "border-fact text-fact" },
  comércio: { label: "Comércio", cls: "border-primary text-primary" },
  neutro: { label: "Neutro", cls: "border-border text-muted-foreground" },
  tensão: { label: "Tensão", cls: "border-ai text-ai" },
  guerra: { label: "Guerra", cls: "border-enemy text-enemy" },
};

const controllerStyle: Record<Country["controller"], string> = {
  humano: "oklch(0.62 0.14 145)",
  ia: "oklch(0.6 0.15 25)",
  neutro: "oklch(0.5 0.02 120)",
};

export function MapScreen() {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const player = countries.find((c) => c.controller === "humano") ?? countries[0]!;
  const [selectedId, setSelectedId] = useState(player.id);
  const selected = countries.find((c) => c.id === selectedId) ?? player;

  const availableChapter = useMemo(
    () =>
      chapterMeta.find((c) => profile.chapters[c.id]?.status !== "bloqueado") ?? chapterMeta[0]!,
    [profile.chapters],
  );

  const selectedRelation = relationOf(player.id, selected.id);
  const canEngage =
    selected.id !== player.id && (selectedRelation === "tensão" || selectedRelation === "guerra");

  const launchBattle = () => {
    const mission = missionForChapter(availableChapter.id);
    void navigate({
      to: "/batalha",
      search: mission ? { missao: mission.id } : {},
    });
  };

  return (
    <GameShell>
      <PageTitle kicker="Teatro de operações · Turno 14" title="Mapa-múndi">
        A guerra não é uma arena isolada. Cada país tem território, províncias estratégicas e uma
        postura diante de você. Clique num país para ler o dossiê e abrir a operação.
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Atlântico Sul e além" className="overflow-hidden">
          <svg viewBox="0 0 1000 520" className="w-full select-none">
            <defs>
              <pattern id="sea" width="20" height="20" patternUnits="userSpaceOnUse">
                <path
                  d="M20 0 L0 0 0 20"
                  fill="none"
                  stroke="oklch(1 0 0 / 0.05)"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect x="0" y="0" width="1000" height="520" fill="url(#sea)" />
            {countries.map((c) => {
              const isSel = c.id === selected.id;
              const isPlayer = c.id === player.id;
              return (
                <g key={c.id} className="cursor-pointer" onClick={() => setSelectedId(c.id)}>
                  <path
                    d={c.path}
                    fill={controllerStyle[c.controller]}
                    fillOpacity={isSel ? 0.55 : 0.28}
                    stroke={isSel ? "oklch(0.76 0.13 78)" : "oklch(1 0 0 / 0.25)"}
                    strokeWidth={isSel ? 2 : 1}
                  />
                  <text
                    x={c.label[0]}
                    y={c.label[1]}
                    textAnchor="middle"
                    className="pointer-events-none font-mono"
                    fontSize="13"
                    fill="oklch(0.95 0.02 90)"
                  >
                    {c.flag} {c.id.toUpperCase()}
                  </text>
                  {isPlayer && (
                    <circle cx={c.label[0]} cy={c.label[1] + 14} r="3" fill="oklch(0.76 0.13 78)" />
                  )}
                </g>
              );
            })}
          </svg>
          <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <Legend color={controllerStyle.humano} label="Você / aliado humano" />
            <Legend color={controllerStyle.ia} label="Controlado por IA" />
            <Legend color={controllerStyle.neutro} label="Neutro" />
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Dossiê do país"
            action={<span className="label-mono">{selected.flag}</span>}
          >
            <h2 className="font-display text-3xl font-black uppercase">{selected.name}</h2>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {selected.capital} · {selected.government}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={cn(
                  "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  relationStyle[selectedRelation].cls,
                )}
              >
                Relação com você · {relationStyle[selectedRelation].label}
              </span>
              {selected.personality && (
                <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {selected.personality}
                </span>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs">
              <Field label="População" value={`${selected.population} mi`} />
              <Field label="PIB" value={`US$ ${selected.gdp} bi`} />
              <Field label="Militar" value={selected.military} />
              <Field label="Tecnologia" value={selected.tech} />
              <Field label="Estabilidade" value={selected.stability} />
              <Field label="Recursos" value={selected.resources.join(" · ")} />
            </dl>

            <div className="mt-4 space-y-2">
              <p className="label-mono text-[9px]">Províncias estratégicas</p>
              {selected.provinces.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border border-border/60 px-3 py-1.5 font-mono text-[11px]"
                >
                  <span>
                    {p.name}
                    {p.strategic === "crítica" && <b className="ml-2 text-enemy">crítica</b>}
                  </span>
                  <span className="text-muted-foreground">
                    infra {p.infrastructure} · {p.troops.toLocaleString("pt-BR")} tropas
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5">
              {selected.id === player.id ? (
                <button
                  onClick={launchBattle}
                  className="w-full bg-primary px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] text-primary-foreground hover:brightness-110"
                >
                  Entrar no teatro · Cap. {availableChapter.number}
                </button>
              ) : (
                <button
                  onClick={launchBattle}
                  className={cn(
                    "w-full px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em]",
                    canEngage
                      ? "border border-enemy text-enemy hover:bg-enemy hover:text-background"
                      : "border border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {canEngage ? "Abrir operação contra este país" : "Abrir operação de treino"}
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Fios da guerra · últimos turnos">
            <ul className="space-y-2">
              {events.slice(0, 6).map((e) => (
                <li key={e.id} className="flex gap-3 font-mono text-[11px]">
                  <span className="w-8 shrink-0 text-muted-foreground">T{e.turn}</span>
                  <span className="text-foreground/90">{e.text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </GameShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5" style={{ background: color, opacity: 0.6 }} />
      {label}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="label-mono text-[9px]">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
