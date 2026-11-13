import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cardById, commanders, doctrineList, doctrines } from "@/game/battle/catalog";
import { TERRAIN_LABEL } from "@/game/battle/labels";
import {
  chapterNumberForMission,
  commandCapacity,
  economyBonus,
  enemyScalingForChapter,
  missions,
  regenRate,
  type MissionDef,
} from "@/game/battle/missions";
import type { Commander, Doctrine } from "@/game/battle/types";
import {
  difficultyForChapter,
  modsFromAccessories,
  type Difficulty,
} from "@/game/progress/catalog";
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
  // Dificuldade AUTOMÁTICA: derivada do capítulo da missão (sem seletor manual).
  const chapterNumber = useMemo(() => chapterNumberForMission(mission.id) ?? 1, [mission.id]);
  const difficulty = useMemo<Difficulty>(
    () => initialDifficulty ?? difficultyForChapter(chapterNumber),
    [initialDifficulty, chapterNumber],
  );
  const scale = useMemo(() => enemyScalingForChapter(chapterNumber), [chapterNumber]);
  const [showMissions, setShowMissions] = useState(false);
  const [missionPage, setMissionPage] = useState(0);
  const MISSION_PAGE = 8;
  const missionPages = Math.max(1, Math.ceil(missions.length / MISSION_PAGE));
  const missionSlice = missions.slice(
    missionPage * MISSION_PAGE,
    missionPage * MISSION_PAGE + MISSION_PAGE,
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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col overflow-hidden px-4 py-3 [@media(max-height:560px)]:py-1.5">
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-2.5 [@media(max-height:560px)]:gap-y-1 [@media(max-height:560px)]:pb-1.5">
        <div>
          <p className="label-mono text-primary">Preparação para a batalha</p>
          <h2 className="font-display text-2xl font-black uppercase leading-none [@media(max-height:560px)]:text-xl">
            Mobilização
          </h2>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span>
            COMANDO MÁX.{" "}
            <b className="text-foreground">{commandCapacity(nation) + (mods.commandMax ?? 0)}</b>
          </span>
          <span>
            REGEN <b className="text-foreground">+{regenRate(nation).toFixed(2)}/s</b>
          </span>
          <span>
            ECONOMIA <b className="text-foreground">+{(economyBonus(nation) * 100).toFixed(1)}%</b>
          </span>
        </div>
        <button
          onClick={() => setShowMissions(true)}
          className="ml-auto border border-border px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          Missão · {mission.terrain} · {mission.name} ›
        </button>
      </div>

      <div className="mt-2.5 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-2.5 [@media(max-height:560px)]:mt-1.5 [@media(max-height:560px)]:gap-1.5 lg:grid-cols-[1.5fr_1fr]">
        <section className="hud-panel hud-corners flex min-h-0 flex-col p-3 [@media(max-height:560px)]:p-2">
          <div className="flex items-center justify-between">
            <p className="label-mono">Baralho de composição militar</p>
            <span
              className={cn("font-mono text-[11px]", locked ? "text-destructive" : "text-fact")}
            >
              {deck.length}/8
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="label-mono text-muted-foreground">Mão</span>
            {Array.from({ length: 4 }).map((_, i) => {
              const id = deck[i];
              return (
                <span
                  key={`h${i}`}
                  className={cn(
                    "border px-1.5 py-0.5 font-mono text-[9px] uppercase",
                    id
                      ? "border-primary text-primary"
                      : "border-dashed border-border text-muted-foreground/50",
                  )}
                >
                  {id ? cardById(id).short : "—"}
                </span>
              );
            })}
            <span className="mx-0.5 text-muted-foreground">|</span>
            <span className="label-mono text-muted-foreground">Fila</span>
            {Array.from({ length: 4 }).map((_, i) => {
              const id = deck[i + 4];
              return (
                <span
                  key={`q${i}`}
                  className={cn(
                    "border px-1.5 py-0.5 font-mono text-[9px] uppercase",
                    id
                      ? "border-border text-muted-foreground"
                      : "border-dashed border-border text-muted-foreground/50",
                  )}
                >
                  {id ? cardById(id).short : "—"}
                </span>
              );
            })}
          </div>
          <div className="mt-2 grid min-h-0 flex-1 grid-cols-2 content-start gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
            {available.map((id) => {
              const card = cardById(id);
              const on = deck.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleCard(id)}
                  className={cn(
                    "border p-1.5 text-left transition",
                    on ? "border-primary bg-accent" : "border-border hover:border-primary/50",
                  )}
                >
                  <span
                    className={cn(
                      "border px-1 font-mono text-[8px] uppercase",
                      CATEGORY_TONE[card.category],
                    )}
                  >
                    {card.short}
                  </span>
                  <p className="mt-0.5 font-display text-[10px] font-bold uppercase leading-tight">
                    {card.name}
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground">custo {card.cost}</p>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5">
          <section className="hud-panel hud-corners shrink-0 p-3">
            <p className="label-mono mb-1.5">Comandante</p>
            <div className="flex flex-wrap gap-1.5">
              {commanders.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCommander(c)}
                  className={cn(
                    "border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                    c.id === commanderId
                      ? "border-primary bg-accent text-primary"
                      : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                  )}
                >
                  {c.name} <span className="text-ai">{c.personality}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="hud-panel hud-corners flex min-h-0 flex-col p-3 [@media(max-height:560px)]:p-2">
            <p className="label-mono mb-1.5">Doutrina militar</p>
            <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1.5 overflow-y-auto pr-1">
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
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{doctrines[d].summary}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-2.5 flex shrink-0 flex-wrap items-center gap-3 border-t border-border pt-2.5 [@media(max-height:560px)]:mt-1.5 [@media(max-height:560px)]:gap-2 [@media(max-height:560px)]:pt-1.5">
        <button
          disabled={locked}
          onClick={() => onStart({ mission, deck, commander, doctrine, difficulty })}
          className={cn(
            "px-6 py-2.5 font-mono text-sm uppercase tracking-[0.2em] transition [@media(max-height:560px)]:py-1.5 [@media(max-height:560px)]:text-xs",
            locked
              ? "cursor-not-allowed border border-border text-muted-foreground"
              : "bg-primary text-primary-foreground shadow-brass hover:brightness-110",
          )}
        >
          {locked ? `Selecione ${8 - deck.length} carta(s)` : "Iniciar operação"}
        </button>
        <p className="font-mono text-[11px] text-muted-foreground">
          {mission.name} · {TERRAIN_LABEL[mission.terrain] ?? mission.terrain} · Nível IA{" "}
          {scale.cardLevel}
        </p>
        {onExit && (
          <button
            onClick={onExit}
            className="ml-auto border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
          >
            Voltar
          </button>
        )}
      </div>

      {showMissions && (
        <Dialog open onOpenChange={(v) => !v && setShowMissions(false)}>
          <DialogContent className="max-h-[86vh] max-w-4xl overflow-hidden border-primary/40 bg-background">
            <DialogHeader>
              <DialogTitle className="text-left">
                <span className="label-mono text-primary">
                  Teatro de operações · {missions.length} missões
                </span>
                <span className="mt-1 block font-display text-2xl font-black uppercase leading-none">
                  Selecionar missão
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-2 sm:grid-cols-2">
                {missionSlice.map((m) => {
                  const n = chapterNumberForMission(m.id) ?? 1;
                  const d = enemyScalingForChapter(n);
                  const active = m.id === missionId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMissionId(m.id);
                        setShowMissions(false);
                      }}
                      className={cn(
                        "border p-2.5 text-left transition",
                        active
                          ? "border-primary bg-accent"
                          : "border-border hover:border-primary/60",
                      )}
                    >
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        {m.act}
                      </span>
                      <p className="font-display text-sm font-bold uppercase">{m.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {m.terrain} · {Math.round(m.duration / 60)} min · Nível {d.cardLevel}
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                <button
                  onClick={() => setMissionPage((p) => Math.max(0, p - 1))}
                  disabled={missionPage === 0}
                  className="border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"
                >
                  ← Anterior
                </button>
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {missionPage + 1} / {missionPages}
                </span>
                <button
                  onClick={() => setMissionPage((p) => (p + 1 < missionPages ? p + 1 : p))}
                  disabled={missionPage + 1 >= missionPages}
                  className="border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"
                >
                  Próximo →
                </button>
              </div>
            </div>
            <div className="space-y-1 border-t border-border pt-3">
              <p className="font-display text-base font-bold uppercase">{mission.name}</p>
              <p className="text-sm text-muted-foreground">{mission.brief}</p>
              <p className="font-mono text-[11px] text-primary">
                Objetivo: {mission.objectiveText}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                Adversário: {mission.enemyCountry.flag} {mission.enemyCountry.name} · doutrina{" "}
                {mission.enemyCountry.doctrine}
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
