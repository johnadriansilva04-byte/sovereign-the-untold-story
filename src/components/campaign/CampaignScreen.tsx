import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell } from "@/components/game/shell";
import { BattleScreen, toAiDifficulty } from "@/components/battle/BattleScreen";
import { chapters, archives } from "@/game/campaign";
import { commanders } from "@/game/battle/catalog";
import { buildBattleConfig, missionById } from "@/game/battle/missions";
import {
  chapterMeta,
  chapterMetaById,
  chapterOutro,
  totalChapters,
} from "@/game/progress/campaign";
import { difficultyById, modsFromAccessories, terrainHint } from "@/game/progress/catalog";
import type { Reward } from "@/game/progress/catalog";
import { activeAccessories, effectiveDeck } from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";
import type { BattleResult } from "@/game/battle/types";

type View =
  | { kind: "overview" }
  | { kind: "operation"; chapterId: string }
  | { kind: "battle"; chapterId: string }
  | { kind: "reward"; chapterId: string; result: BattleResult; reward: Reward };

export function CampaignScreen() {
  const { profile, completeChapter } = useProfile();
  const [view, setView] = useState<View>({ kind: "overview" });
  const [lastReward, setLastReward] = useState<Reward | null>(null);

  // Missão atual: o próximo capítulo ainda não concluído. Concluídos somem da trilha.
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
            setLastReward(reward);
            setView({ kind: "reward", chapterId: view.chapterId, result, reward });
          }}
        />
      </GameShell>
    );
  }

  if (view.kind === "reward") {
    const meta = chapterMetaById(view.chapterId)!;
    const chapter = chapters.find((c) => c.id === view.chapterId)!;
    return (
      <GameShell full>
        <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col justify-center px-4">
          <RewardScreen
            chapter={chapter}
            meta={meta}
            result={view.result}
            reward={view.reward}
            onNext={() => {
              if (view.result.outcome !== "vitoria") {
                setView({ kind: "battle", chapterId: view.chapterId });
                return;
              }
              // Avanço automático para o próximo capítulo ainda não concluído.
              const next = chapterMeta.find((m) => profile.chapters[m.id]?.status !== "concluido");
              setView(next ? { kind: "battle", chapterId: next.id } : { kind: "overview" });
            }}
            onMap={() => setView({ kind: "overview" })}
          />
        </div>
      </GameShell>
    );
  }

  if (view.kind === "operation") {
    return (
      <GameShell full>
        <OperationScreen
          chapterId={view.chapterId}
          onBack={() => setView({ kind: "overview" })}
          onLaunch={() => setView({ kind: "battle", chapterId: view.chapterId })}
        />
      </GameShell>
    );
  }

  return (
    <CampaignOverview
      profile={profile}
      currentMeta={currentMeta}
      lastReward={lastReward}
      onOpen={(chapterId) => setView({ kind: "operation", chapterId })}
      onContinue={() => currentMeta && setView({ kind: "battle", chapterId: currentMeta.id })}
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
// Visão geral — UMA tela, sem rolagem: atos em abas, capítulos em nós compactos.
// Concluídos viram um selo; só a missão atual fica em destaque. Tudo automático:
// clicar num capítulo abre a operação, que começa com um botão.
// ---------------------------------------------------------------------------

type Profile = ReturnType<typeof useProfile>["profile"];

function CampaignOverview({
  profile,
  currentMeta,
  lastReward,
  onOpen,
  onContinue,
}: {
  profile: Profile;
  currentMeta: (typeof chapterMeta)[number] | undefined;
  lastReward: Reward | null;
  onOpen: (chapterId: string) => void;
  onContinue: () => void;
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

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-7xl flex-col px-4 py-4">
      {/* Cabeçalho compacto */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-3">
        <div>
          <p className="label-mono text-primary">Campanha · A história que não te contaram</p>
          <h1 className="font-display text-2xl font-black uppercase leading-none">
            {currentMeta ? `Capítulo ${currentMeta.number}` : "Campanha concluída"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-3xl font-black leading-none">
            {completed}
            <span className="text-muted-foreground">/{totalChapters}</span>
          </span>
          <div className="h-2 w-40 overflow-hidden border border-border bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span>
            SOVEREIGNS <b className="text-foreground">{profile.sovereigns}</b>
          </span>
          <span>
            PESQUISA <b className="text-foreground">{profile.research}</b>
          </span>
          <span>
            CARTAS <b className="text-foreground">{Object.keys(profile.inventory.cards).length}</b>
          </span>
        </div>
      </div>

      {/* Seletor de atos */}
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
                "relative border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                isActive
                  ? "border-primary bg-accent text-primary"
                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
              )}
            >
              {g.act.replace(/^Ato /, "A")} · {done}/{g.metas.length}
              {hasCurrent && !isActive && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Trilha do ato — só a missão atual em destaque; concluídas somem, o resto é
          um marcador discreto. Cabe na tela, sem rolagem. */}
      <div className="mt-3 min-h-0 flex-1">
        {group.metas.every((m) => profile.chapters[m.id]?.status === "concluido") ? (
          <div className="flex h-full items-center justify-center">
            <div className="hud-panel hud-corners px-6 py-5 text-center">
              <p className="label-mono text-fact">Ato concluído</p>
              <p className="mt-1 font-display text-xl font-black uppercase">
                {group.metas.length} capítulos vencidos
              </p>
            </div>
          </div>
        ) : (
          <div className="grid h-full auto-rows-fr grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {group.metas
              .filter((m) => profile.chapters[m.id]?.status !== "concluido")
              .map((meta) => (
                <ChapterNode
                  key={meta.id}
                  meta={meta}
                  isCurrent={meta.id === currentMeta?.id}
                  onOpen={() => onOpen(meta.id)}
                />
              ))}
          </div>
        )}
      </div>

      {/* Barra de ação: iniciar a missão atual com um clique */}
      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-3 border-t border-border pt-3">
        <button
          onClick={onContinue}
          disabled={!currentMeta}
          className={cn(
            "px-6 py-2.5 font-mono text-sm uppercase tracking-[0.2em] transition",
            currentMeta
              ? "bg-primary text-primary-foreground shadow-brass hover:brightness-110"
              : "cursor-not-allowed border border-border text-muted-foreground",
          )}
        >
          {currentMeta ? "Iniciar missão" : "Tudo concluído"}
        </button>
        {currentMeta && currentChapter && (
          <p className="font-mono text-[11px] text-muted-foreground">
            Cap. {currentMeta.number} · {currentChapter.title} ·{" "}
            {difficultyById(currentMeta.difficulty).name}
          </p>
        )}
        {lastReward && (
          <span className="ml-auto font-mono text-[10px] text-fact">
            Progresso salvo e sincronizado.
          </span>
        )}
      </div>
    </div>
  );
}

function ChapterNode({
  meta,
  isCurrent,
  onOpen,
}: {
  meta: (typeof chapterMeta)[number];
  isCurrent: boolean;
  onOpen: () => void;
}) {
  const chapter = chapters.find((c) => c.id === meta.id)!;

  if (!isCurrent) {
    return (
      <div className="hud-panel flex flex-col items-center justify-center gap-1 p-3 opacity-40">
        <span className="font-display text-2xl font-black text-muted-foreground/30">
          {String(meta.number).padStart(2, "0")}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          bloqueado
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={onOpen}
      className="hud-panel hud-corners flex flex-col items-center justify-center gap-1.5 border-primary/60 p-3 text-center transition hover:border-primary"
    >
      <span className="font-display text-3xl font-black text-primary">
        {String(meta.number).padStart(2, "0")}
      </span>
      <span className="line-clamp-2 font-display text-sm font-bold uppercase leading-tight">
        {chapter.title}
      </span>
      <span className="border border-primary px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
        em curso
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Operação — tela nova (sem rolagem): briefing + botão de começar
// ---------------------------------------------------------------------------

function OperationScreen({
  chapterId,
  onBack,
  onLaunch,
}: {
  chapterId: string;
  onBack: () => void;
  onLaunch: () => void;
}) {
  const meta = chapterMetaById(chapterId)!;
  const chapter = chapters.find((c) => c.id === chapterId)!;
  const mission = missionById(meta.missionId);
  const diff = difficultyById(meta.difficulty);
  const evidence = chapter.archives
    .map((id) => archives.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-5xl flex-col px-4 py-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="label-mono text-primary">
            {chapter.act} · Capítulo {chapter.number}
          </p>
          <h1 className="font-display text-3xl font-black uppercase leading-none">
            {chapter.title}
          </h1>
        </div>
        <button
          onClick={onBack}
          className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          Voltar
        </button>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 gap-5 overflow-y-auto pr-1 lg:grid-cols-2">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground">
            {chapter.era} · {chapter.place}
          </p>
          <p className="mt-3 border-l-2 border-primary pl-4 font-serif text-base italic text-foreground/90">
            {meta.intro}
          </p>
          <div className="mt-3 space-y-1.5">
            {chapter.dialogue.map((d, i) => (
              <p key={i} className="text-sm">
                <span className="font-mono text-[11px] uppercase text-primary">{d.speaker}:</span>{" "}
                <span className="text-muted-foreground">{d.text}</span>
              </p>
            ))}
          </div>
        </div>

        <div>
          <p className="label-mono mb-1">Missão</p>
          <p className="font-display text-lg font-bold uppercase">{mission.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{mission.brief}</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
            <Info label="Terreno" value={mission.terrain} />
            <Info label="Objetivo" value={mission.objectiveKind} />
            <Info label="Duração" value={`${Math.round(mission.duration / 60)} min`} />
            <Info label="Adversário" value={diff.name} />
          </dl>
          <p className="mt-1 font-mono text-[11px] text-doc">{terrainHint[mission.terrain]}</p>

          {evidence.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="label-mono mb-2">Dossiê · fato e tese</p>
              <div className="space-y-2">
                {evidence.map((a) => (
                  <div key={a.id} className="border-l-2 border-border pl-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "border px-1.5 py-0.5 font-mono text-[9px] uppercase",
                          a.kind === "fato" && "border-fact text-fact",
                          a.kind === "documento" && "border-doc text-doc",
                          a.kind === "ficcao" && "border-fiction text-fiction",
                        )}
                      >
                        {a.kind}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{a.date}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.text}</p>
                    {a.source && (
                      <p className="font-mono text-[10px] text-muted-foreground/70">
                        Fonte: {a.source}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center gap-3 border-t border-border pt-3">
        <button
          onClick={onLaunch}
          className="bg-primary px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass hover:brightness-110"
        >
          Começar batalha
        </button>
        <p className="font-mono text-[11px] text-muted-foreground">
          {mission.name} · {terrainHint[mission.terrain]} · {diff.name}
        </p>
      </div>
    </div>
  );
}

function RewardScreen({
  chapter,
  meta,
  result,
  reward,
  onNext,
  onMap,
}: {
  chapter: (typeof chapters)[number];
  meta: (typeof chapterMeta)[number];
  result: BattleResult;
  reward: Reward;
  onNext: () => void;
  onMap: () => void;
}) {
  const won = result.outcome === "vitoria";
  return (
    <div className="space-y-4 text-center">
      <p className="label-mono text-primary">
        {chapter.act} · Capítulo {chapter.number}
      </p>
      <h1 className="font-display text-5xl font-black uppercase">
        {won ? "Vitória" : result.outcome === "empate" ? "Empate" : "Derrota"}
      </h1>
      <p className="font-mono text-xs text-muted-foreground">{result.reason}</p>

      <p className="mx-auto max-w-xl border-l-2 border-primary pl-4 text-left font-serif text-lg italic text-foreground/90">
        {chapterOutro(meta, result.outcome)}
      </p>

      {won ? (
        <div className="hud-panel hud-corners mx-auto max-w-xl p-4 text-left">
          <p className="label-mono mb-2">Recompensas conquistadas</p>
          <ul className="space-y-1 font-mono text-xs">
            {reward.cards?.map((c) => (
              <li key={c} className="text-fact">
                + Carta desbloqueada: {c}
              </li>
            ))}
            {reward.accessories?.map((a) => (
              <li key={a} className="text-doc">
                + Acessório: {a}
              </li>
            ))}
            {reward.techs?.map((t) => (
              <li key={t} className="text-primary">
                + Tecnologia: {t}
              </li>
            ))}
            {reward.research ? (
              <li className="text-muted-foreground">+ {reward.research} pesquisa</li>
            ) : null}
            {reward.sovereigns ? (
              <li className="text-muted-foreground">+ {reward.sovereigns} Sovereigns</li>
            ) : null}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{meta.rewardNote}</p>
        </div>
      ) : (
        <div className="hud-panel hud-corners mx-auto max-w-xl p-4 text-left">
          <p className="label-mono mb-2">Sem recompensas</p>
          <p className="text-sm text-muted-foreground">
            A derrota obriga a reorganizar as forças. Ajuste o baralho para o terreno e tente de
            novo.
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 pt-1">
        <button
          onClick={onNext}
          className="bg-primary px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground hover:brightness-110"
        >
          {won ? "Próximo capítulo" : "Tentar de novo"}
        </button>
        <button
          onClick={onMap}
          className="border border-border px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          Mapa da campanha
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
