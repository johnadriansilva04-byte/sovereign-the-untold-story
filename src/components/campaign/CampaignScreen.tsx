import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell } from "@/components/game/shell";
import { BattleScreen, toAiDifficulty } from "@/components/battle/BattleScreen";
import { chapters } from "@/game/campaign";
import { commanders } from "@/game/battle/catalog";
import { buildBattleConfig, missionById } from "@/game/battle/missions";
import { chapterMeta, chapterMetaById, totalChapters } from "@/game/progress/campaign";
import { difficultyById, modsFromAccessories } from "@/game/progress/catalog";
import type { Reward } from "@/game/progress/catalog";
import { activeAccessories, effectiveDeck } from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";
import type { BattleResult } from "@/game/battle/types";

type View =
  | { kind: "overview" }
  | { kind: "battle"; chapterId: string }
  | { kind: "reward"; chapterId: string; result: BattleResult; reward: Reward };

export function CampaignScreen() {
  const { profile, completeChapter } = useProfile();
  const [view, setView] = useState<View>({ kind: "overview" });

  // Missão atual: o próximo capítulo ainda não concluído. Vencidos somem da trilha.
  const currentMeta = useMemo(
    () => chapterMeta.find((m) => profile.chapters[m.id]?.status !== "concluido"),
    [profile.chapters],
  );

  const autoConfig = useMemo(() => {
    if (view.kind !== "battle") return undefined;
    const meta = chapterMetaById(view.chapterId);
    if (!meta) return undefined;
    const mission = missionById(meta.missionId);
    const deck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
    const commander = commanders.find((c) => c.id === deck?.commanderId) ?? commanders[0]!;
    return buildBattleConfig({
      nation: profile.nation,
      mission,
      deck: effectiveDeck(profile),
      commander,
      doctrine: deck?.doctrine ?? commander.doctrine,
      mods: modsFromAccessories(activeAccessories(profile)),
      aiDifficulty: toAiDifficulty(meta.difficulty),
      seed: seedOf(`${mission.id}:${meta.difficulty}`),
    });
  }, [view, profile]);

  if (view.kind === "battle" && autoConfig) {
    const meta = chapterMetaById(view.chapterId)!;
    return (
      <GameShell full>
        <BattleScreen
          modeLabel={`Campanha · Cap. ${meta.number}`}
          presetConfig={autoConfig}
          onExit={() => setView({ kind: "overview" })}
          onComplete={(result) => {
            const reward = completeChapter({
              chapterId: view.chapterId,
              result,
              difficulty: meta.difficulty,
            });
            setView({ kind: "reward", chapterId: view.chapterId, result, reward });
          }}
        />
      </GameShell>
    );
  }

  if (view.kind === "reward") {
    const meta = chapterMetaById(view.chapterId)!;
    return (
      <GameShell full>
        <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
          <RewardScreen
            meta={meta}
            result={view.result}
            reward={view.reward}
            onNext={() => {
              if (view.result.outcome !== "vitoria") {
                setView({ kind: "battle", chapterId: view.chapterId });
                return;
              }
              const next = chapterMeta.find((m) => profile.chapters[m.id]?.status !== "concluido");
              setView(next ? { kind: "battle", chapterId: next.id } : { kind: "overview" });
            }}
            onMap={() => setView({ kind: "overview" })}
          />
        </div>
      </GameShell>
    );
  }

  return (
    <CampaignOverview
      profile={profile}
      currentMeta={currentMeta}
      onLaunch={() => currentMeta && setView({ kind: "battle", chapterId: currentMeta.id })}
    />
  );
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Visão geral — UMA tela, sem rolagem e sem texto: barra de progresso, atos em
// abas, a missão atual em destaque e um botão para entrar na guerra.
// ---------------------------------------------------------------------------

type Profile = ReturnType<typeof useProfile>["profile"];

function CampaignOverview({
  profile,
  currentMeta,
  onLaunch,
}: {
  profile: Profile;
  currentMeta: (typeof chapterMeta)[number] | undefined;
  onLaunch: () => void;
}) {
  const completed = chapterMeta.filter(
    (m) => profile.chapters[m.id]?.status === "concluido",
  ).length;
  const pct = Math.round((completed / totalChapters) * 100);

  const actGroups = useMemo(() => {
    const groups: { act: string; metas: typeof chapterMeta }[] = [];
    for (const meta of chapterMeta) {
      const act = chapters.find((c) => c.id === meta.id)!.act;
      const last = groups[groups.length - 1];
      if (last && last.act === act) last.metas.push(meta);
      else groups.push({ act, metas: [meta] });
    }
    return groups;
  }, []);

  const activeGroup =
    actGroups.find((g) => g.metas.some((m) => m.id === currentMeta?.id)) ?? actGroups[0]!;
  const [act, setAct] = useState(activeGroup.act);
  const group = actGroups.find((g) => g.act === act) ?? activeGroup;
  const currentChapter = currentMeta ? chapters.find((c) => c.id === currentMeta.id) : null;
  const mission = currentMeta ? missionById(currentMeta.missionId) : null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-5xl flex-col px-4 py-4">
      {/* Progresso da guerra */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-3">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl font-black leading-none">
            {completed}
            <span className="text-muted-foreground">/{totalChapters}</span>
          </span>
          <div className="h-3 w-52 overflow-hidden border border-border bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span>
            SOVEREIGNS <b className="text-foreground">{profile.sovereigns}</b>
          </span>
          <span>
            PESQUISA <b className="text-foreground">{profile.research}</b>
          </span>
        </div>
      </div>

      {/* Atos */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {actGroups.map((g) => {
          const done = g.metas.filter((m) => profile.chapters[m.id]?.status === "concluido").length;
          const isActive = g.act === act;
          const hasCurrent = g.metas.some((m) => m.id === currentMeta?.id);
          return (
            <button
              key={g.act}
              onClick={() => setAct(g.act)}
              className={cn(
                "relative border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition",
                isActive
                  ? "border-primary bg-accent text-primary"
                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
              )}
            >
              {g.act.replace(/^Ato /, "A")} {done}/{g.metas.length}
              {hasCurrent && !isActive && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Só a missão atual; as outras são marcadores discretos */}
      <div className="mt-3 grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {group.metas
          .filter((m) => profile.chapters[m.id]?.status !== "concluido")
          .map((meta) =>
            meta.id === currentMeta?.id ? (
              <button
                key={meta.id}
                onClick={onLaunch}
                className="hud-panel hud-corners col-span-2 row-span-2 flex flex-col items-center justify-center gap-2 border-primary/60 p-4 text-center transition hover:border-primary sm:col-span-2"
              >
                <span className="label-mono text-primary">Capítulo {meta.number}</span>
                <span className="font-display text-4xl font-black uppercase leading-none">
                  {chapters.find((c) => c.id === meta.id)!.title}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {mission?.terrain} · {difficultyById(meta.difficulty).name}
                </span>
                <span className="mt-2 bg-primary px-6 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass">
                  Iniciar missão
                </span>
              </button>
            ) : (
              <div
                key={meta.id}
                className="hud-panel flex items-center justify-center p-3 opacity-40"
              >
                <span className="font-display text-2xl font-black text-muted-foreground/30">
                  {String(meta.number).padStart(2, "0")}
                </span>
              </div>
            ),
          )}
      </div>
    </div>
  );
}

function RewardScreen({
  meta,
  result,
  reward,
  onNext,
  onMap,
}: {
  meta: (typeof chapterMeta)[number];
  result: BattleResult;
  reward: Reward;
  onNext: () => void;
  onMap: () => void;
}) {
  const won = result.outcome === "vitoria";
  const loot = [
    ...(reward.cards ?? []).map((c) => `+ Carta: ${c}`),
    ...(reward.accessories ?? []).map((a) => `+ Acessório: ${a}`),
    ...(reward.techs ?? []).map((t) => `+ Tecnologia: ${t}`),
    ...(reward.research ? [`+ ${reward.research} pesquisa`] : []),
    ...(reward.sovereigns ? [`+ ${reward.sovereigns} Sovereigns`] : []),
  ];

  return (
    <div className="w-full space-y-5">
      <h1
        className={cn(
          "font-display text-6xl font-black uppercase",
          won ? "text-fact" : "text-destructive",
        )}
      >
        {won ? "Vitória" : result.outcome === "empate" ? "Empate" : "Derrota"}
      </h1>

      {won && loot.length > 0 && (
        <ul className="mx-auto max-w-md space-y-1 border border-border bg-card/60 p-4 text-left font-mono text-xs">
          {loot.map((l) => (
            <li key={l} className="text-fact">
              {l}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={onNext}
          className="bg-primary px-8 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground hover:brightness-110"
        >
          {won ? "Próxima missão" : "Tentar de novo"}
        </button>
        <button
          onClick={onMap}
          className="border border-border px-8 py-3 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          Mapa
        </button>
      </div>
      <p className="font-mono text-[10px] text-muted-foreground">Capítulo {meta.number}</p>
    </div>
  );
}
