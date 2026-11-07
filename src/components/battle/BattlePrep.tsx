import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { cardById, commanders, doctrineList, doctrines } from "@/game/battle/catalog";
import { TERRAIN_LABEL } from "@/game/battle/labels";
import {
  commandCapacity,
  economyBonus,
  missions,
  regenRate,
  type MissionDef,
} from "@/game/battle/missions";
import type { Commander, Doctrine } from "@/game/battle/types";
import {
  difficulties,
  difficultyById,
  modsFromAccessories,
  type Difficulty,
} from "@/game/progress/catalog";
import { missionDifficulty } from "@/game/progress/catalog";
import {
  activeAccessories,
  effectiveDeck,
  ownedCardIds,
  type ProfileState,
} from "@/game/progress/profile";

interface Props {
  profile: ProfileState;
  onStart: (opts: {
    mission: MissionDef;
    deck: string[];
    commander: Commander;
    doctrine: Doctrine;
    difficulty: Difficulty;
  }) => void;
  initialMissionId?: string | undefined;
  initialDifficulty?: Difficulty | undefined;
  onExit?: (() => void) | undefined;
}

const CATEGORY_TONE: Record<string, string> = {
  infantaria: "border-fact text-fact",
  blindado: "border-primary text-primary",
  artilharia: "border-doc text-doc",
  defesa: "border-ally text-ally",
  reconhecimento: "border-ai text-ai",
  apoio: "border-fiction text-fiction",
};

export function BattlePrep({
  profile,
  onStart,
  initialMissionId,
  initialDifficulty,
  onExit,
}: Props) {
  const nation = profile.nation;
  const available = useMemo(() => ownedCardIds(profile), [profile]);
  const equipped = useMemo(() => activeAccessories(profile), [profile]);
  const mods = useMemo(() => modsFromAccessories(equipped), [equipped]);

  const [missionId, setMissionId] = useState(initialMissionId ?? missions[0]!.id);
  const mission = missions.find((m) => m.id === missionId) ?? missions[0]!;
  const [deck, setDeck] = useState<string[]>(() => effectiveDeck(profile));
  const [commanderId, setCommanderId] = useState(
    profile.decks[0]?.commanderId ?? commanders[0]!.id,
  );
  const commander = commanders.find((c) => c.id === commanderId) ?? commanders[0]!;
  const [doctrine, setDoctrine] = useState<Doctrine>(
    profile.decks[0]?.doctrine ?? commander.doctrine,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    initialDifficulty ?? missionDifficulty[mission.id] ?? "veterano",
  );

  const locked = deck.length !== 8;

  const toggleCard = (id: string) => {
    setDeck((d) => {
      if (d.includes(id)) return d.filter((x) => x !== id);
      if (d.length >= 8) return d;
      return [...d, id];
    });
  };

  const pickCommander = (c: Commander) => {
    setCommanderId(c.id);
    setDoctrine(c.doctrine);
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <section className="hud-panel hud-corners p-5">
          <p className="label-mono text-primary">Preparação para a batalha</p>
          <h2 className="mt-1 font-display text-3xl font-black uppercase">Mobilização</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            O que o país construiu define o que você pode levar. A disponibilidade de unidades
            depende do seu inventário — nada de levar um exército que você não tem.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Comando máx." value={commandCapacity(nation) + (mods.commandMax ?? 0)} />
            <Stat label="Regeneração" value={`+${regenRate(nation).toFixed(2)}/s`} />
            <Stat label="Bônus econômico" value={`+${(economyBonus(nation) * 100).toFixed(1)}%`} />
            <Stat label="Cartas possuídas" value={available.length} />
          </div>
        </section>

        <section className="hud-panel hud-corners p-5">
          <p className="label-mono mb-3">Missão</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {missions.map((m) => {
              const d = difficultyById(missionDifficulty[m.id] ?? "veterano");
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setMissionId(m.id);
                    setDifficulty(missionDifficulty[m.id] ?? "veterano");
                  }}
                  className={cn(
                    "border p-3 text-left transition",
                    m.id === missionId
                      ? "border-primary bg-accent"
                      : "border-border hover:border-primary/60",
                  )}
                >
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {m.act}
                  </span>
                  <p className="font-display text-sm font-bold uppercase">{m.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {m.terrain} · {Math.round(m.duration / 60)} min · {d.name}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <p className="font-display text-lg font-bold uppercase">{mission.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{mission.brief}</p>
            <p className="mt-2 font-mono text-[11px] text-doc">
              Terreno: {TERRAIN_LABEL[mission.terrain] ?? mission.terrain}
            </p>
            <p className="mt-2 font-mono text-[11px] text-primary">
              Objetivo: {mission.objectiveText}
            </p>
            <p className="mt-1 font-mono text-[11px] italic text-muted-foreground">
              {mission.missionNote}
            </p>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              Adversário: {mission.enemyCountry.flag} {mission.enemyCountry.name} · doutrina{" "}
              {mission.enemyCountry.doctrine}
            </p>
          </div>
        </section>

        <section className="hud-panel hud-corners p-5">
          <div className="flex items-center justify-between">
            <p className="label-mono">Baralho de composição militar</p>
            <span
              className={cn("font-mono text-[11px]", locked ? "text-destructive" : "text-fact")}
            >
              {deck.length}/8 cartas
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Quatro cartas ficam na mão; quatro aguardam na fila. Só entram cartas que você possui.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {available.map((id) => {
              const card = cardById(id);
              const on = deck.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleCard(id)}
                  className={cn(
                    "border p-2 text-left transition",
                    on ? "border-primary bg-accent" : "border-border hover:border-primary/50",
                  )}
                >
                  <span
                    className={cn(
                      "border px-1 font-mono text-[9px] uppercase",
                      CATEGORY_TONE[card.category],
                    )}
                  >
                    {card.short}
                  </span>
                  <p className="mt-1 font-display text-xs font-bold uppercase leading-tight">
                    {card.name}
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {card.category} · custo {card.cost}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="hud-panel hud-corners p-5">
          <p className="label-mono mb-3">Dificuldade</p>
          <div className="grid gap-2">
            {difficulties.map((d) => (
              <button
                key={d.id}
                onClick={() => setDifficulty(d.id)}
                className={cn(
                  "border p-3 text-left transition",
                  d.id === difficulty
                    ? "border-primary bg-accent"
                    : "border-border hover:border-primary/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-bold uppercase">{d.name}</p>
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">
                    recompensa ×{d.rewardMult}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{d.summary}</p>
              </button>
            ))}
          </div>
        </section>

        {equipped.length > 0 && (
          <section className="hud-panel hud-corners p-5">
            <p className="label-mono mb-2">Acessórios equipados</p>
            <div className="flex flex-wrap gap-2">
              {equipped.map((id) => (
                <span
                  key={id}
                  className="border border-doc px-2 py-1 font-mono text-[10px] uppercase text-doc"
                >
                  {id.replace("acc-", "")}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="hud-panel hud-corners p-5">
          <p className="label-mono mb-3">Comandante</p>
          <div className="space-y-2">
            {commanders.map((c) => (
              <button
                key={c.id}
                onClick={() => pickCommander(c)}
                className={cn(
                  "w-full border p-3 text-left transition",
                  c.id === commanderId
                    ? "border-primary bg-accent"
                    : "border-border hover:border-primary/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-bold uppercase">{c.name}</p>
                  <span className="border border-ai px-1 font-mono text-[9px] uppercase text-ai">
                    {c.personality}
                  </span>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  Doutrina: {c.doctrine}
                </p>
                <p className="mt-1 text-xs italic text-muted-foreground">{c.note}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="hud-panel hud-corners p-5">
          <p className="label-mono mb-3">Doutrina militar</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {doctrineList.map((d) => (
              <button
                key={d}
                onClick={() => setDoctrine(d)}
                className={cn(
                  "border p-2 text-left transition",
                  d === doctrine
                    ? "border-primary bg-accent"
                    : "border-border hover:border-primary/50",
                )}
              >
                <p className="font-display text-xs font-bold uppercase">{d}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{doctrines[d].summary}</p>
              </button>
            ))}
          </div>
        </section>

        <button
          disabled={locked}
          onClick={() => onStart({ mission, deck, commander, doctrine, difficulty })}
          className={cn(
            "w-full px-4 py-3 font-mono text-sm uppercase tracking-[0.2em] transition",
            locked
              ? "cursor-not-allowed border border-border text-muted-foreground"
              : "bg-primary text-primary-foreground shadow-brass hover:brightness-110",
          )}
        >
          {locked ? `Selecione ${8 - deck.length} carta(s)` : "Iniciar operação"}
        </button>
        {onExit && (
          <button
            onClick={onExit}
            className="w-full border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
          >
            Voltar
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border p-2">
      <p className="label-mono text-[9px]">{label}</p>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  );
}
