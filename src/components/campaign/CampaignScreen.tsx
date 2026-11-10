import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell } from "@/components/game/shell";
import { CampaignComic } from "@/components/campaign/CampaignComic";
import { DecisionCard } from "@/components/campaign/DecisionCard";
import { BattleScreen, toAiDifficulty } from "@/components/battle/BattleScreen";
import { chapters } from "@/game/campaign";
import { commanders } from "@/game/battle/catalog";
import { buildBattleConfig, missionById } from "@/game/battle/missions";
import {
  chapterMeta,
  chapterMetaById,
  chapterOutro,
  totalChapters,
} from "@/game/progress/campaign";
import { decisionFor, decisionOption } from "@/game/progress/decisions";
import { accessoryById, difficultyById, techById } from "@/game/progress/catalog";
import type { Reward } from "@/game/progress/catalog";
import { allCards } from "@/game/battle/catalog";
import { effectiveDeck, effectiveDoctrine, effectiveMods } from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";
import type { BattleResult } from "@/game/battle/types";

// Nome de carta tolerante a id desconhecido (recompensas vêm de dados que podem evoluir).
const cardName = (id: string): string => allCards.find((c) => c.id === id)?.name ?? id;

type View =
  | { kind: "overview" }
  | { kind: "dilemma"; chapterId: string }
  | { kind: "battle"; chapterId: string }
  | { kind: "reward"; chapterId: string; result: BattleResult; reward: Reward };

export function CampaignScreen() {
  const { profile, completeChapter, chooseDecision } = useProfile();
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
      // A escolha do capítulo define a doutrina e soma modificadores reais de combate.
      doctrine: effectiveDoctrine(profile, view.chapterId, deck?.doctrine ?? commander.doctrine),
      mods: effectiveMods(profile, view.chapterId),
      aiDifficulty: toAiDifficulty(meta.difficulty),
      seed: seedOf(`${mission.id}:${meta.difficulty}`),
    });
  }, [view, profile]);

  // Entrar num capítulo: com dilema, passa pela decisão; sem dilema, direto à batalha.
  const enterChapter = (chapterId: string) => {
    setView(
      decisionFor(chapterId) ? { kind: "dilemma", chapterId } : { kind: "battle", chapterId },
    );
  };

  if (view.kind === "dilemma") {
    const meta = chapterMetaById(view.chapterId)!;
    const chapter = chapters.find((c) => c.id === meta.id);
    const decision = decisionFor(view.chapterId);
    if (decision) {
      return (
        <GameShell full>
          <DecisionCard
            chapterNumber={meta.number}
            act={chapter?.act ?? ""}
            title={chapter?.title ?? ""}
            decision={decision}
            selected={profile.decisions[view.chapterId]}
            onChoose={(optionId) => {
              chooseDecision(view.chapterId, optionId);
              setView({ kind: "battle", chapterId: view.chapterId });
            }}
            onCancel={() => setView({ kind: "overview" })}
          />
        </GameShell>
      );
    }
  }

  if (view.kind === "battle" && autoConfig) {
    const meta = chapterMetaById(view.chapterId)!;
    return (
      <GameShell full bare>
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
    const chapter = chapters.find((c) => c.id === meta.id);
    const mission = missionById(meta.missionId);
    // Próxima missão calculada a partir do perfil MAIS RECENTE (após completeChapter),
    // para o botão "Próxima missão" avançar de verdade em vez de repetir a fase.
    const nextMeta = chapterMeta.find((m) => profile.chapters[m.id]?.status !== "concluido");
    const nextChapter = nextMeta ? chapters.find((c) => c.id === nextMeta.id) : null;

    // Vitória: página de gibi com a história e os fatos. Derrota/empate: tela enxuta.
    if (view.result.outcome === "vitoria" && chapter) {
      return (
        <GameShell full>
          <CampaignComic
            chapter={chapter}
            meta={meta}
            terrain={mission?.terrain ?? "Cidade"}
            result={view.result}
            reward={view.reward}
            nextTitle={nextChapter?.title ?? null}
            onNext={() => (nextMeta ? enterChapter(nextMeta.id) : setView({ kind: "overview" }))}
            onMap={() => setView({ kind: "overview" })}
          />
        </GameShell>
      );
    }

    return (
      <GameShell full>
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
          <RewardScreen
            meta={meta}
            act={chapter?.act ?? ""}
            result={view.result}
            reward={view.reward}
            nextTitle={null}
            decisionLabel={
              decisionOption(view.chapterId, profile.decisions[view.chapterId] ?? "")?.label
            }
            onNext={() => enterChapter(view.chapterId)}
            onMap={() => setView({ kind: "overview" })}
          />
        </div>
      </GameShell>
    );
  }

  return (
    <GameShell full>
      <CampaignOverview
        profile={profile}
        currentMeta={currentMeta}
        onLaunch={() => currentMeta && enterChapter(currentMeta.id)}
      />
    </GameShell>
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
// Visão geral — UMA tela, sem rolagem e sem texto longo: progresso da guerra,
// a MISSÃO ATUAL em destaque e um botão para entrar na guerra. As fases não
// aparecem todas de uma vez; o jogo avança missão a missão.
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

  const currentChapter = currentMeta ? chapters.find((c) => c.id === currentMeta.id) : null;
  const mission = currentMeta ? missionById(currentMeta.missionId) : null;
  const won = completed === totalChapters;
  const decision = currentMeta ? decisionFor(currentMeta.id) : undefined;
  const chosen = currentMeta
    ? decisionOption(currentMeta.id, profile.decisions[currentMeta.id] ?? "")
    : undefined;

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-5 px-4 py-4 [@media(max-height:560px)]:gap-1.5 [@media(max-height:560px)]:py-1">
      {/* Progresso da guerra */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl font-black leading-none [@media(max-height:560px)]:text-2xl">
            {completed}
            <span className="text-muted-foreground">/{totalChapters}</span>
          </span>
          <div className="h-3 w-52 overflow-hidden border border-border bg-muted [@media(max-height:560px)]:w-40">
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

      {won || !currentMeta || !currentChapter ? (
        <div className="hud-panel hud-corners p-8 text-center">
          <p className="label-mono text-primary">Campanha concluída</p>
          <p className="mt-2 font-display text-4xl font-black uppercase">A guerra foi vencida</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Todas as operações foram cumpridas. O teatro segue disponível no Multiplayer.
          </p>
        </div>
      ) : (
        <button
          onClick={onLaunch}
          className="hud-panel hud-corners group flex flex-col items-start gap-3 border-primary/60 p-6 text-left transition hover:border-primary [@media(max-height:560px)]:gap-1 [@media(max-height:560px)]:p-2.5"
        >
          <div className="flex w-full items-center justify-between">
            <span className="label-mono text-primary">
              {currentChapter.act} · Capítulo {currentMeta.number}
            </span>
            <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {difficultyById(currentMeta.difficulty).name}
            </span>
          </div>
          <span className="font-display text-4xl font-black uppercase leading-none sm:text-5xl [@media(max-height:560px)]:text-2xl">
            {currentChapter.title}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {mission?.terrain} · {Math.round((mission?.duration ?? 0) / 60)} min
          </span>
          <span className="max-w-2xl font-serif text-sm italic text-foreground/85 [@media(max-height:560px)]:line-clamp-2">
            {currentMeta.intro}
          </span>
          {decision && (
            <span className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-wider">
              <span className="text-muted-foreground">Decisão de comando:</span>
              {chosen ? (
                <span className="text-primary">{chosen.label}</span>
              ) : (
                <span className="text-destructive">pendente — escolha antes de partir</span>
              )}
            </span>
          )}
          <span className="mt-1 bg-primary px-8 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass transition group-hover:brightness-110">
            {decision && !chosen ? "Tomar a decisão" : "Iniciar operação"}
          </span>
        </button>
      )}

      <p className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground [@media(max-height:420px)]:hidden">
        Missão a missão — cada vitória libera a próxima operação.
      </p>
    </div>
  );
}

function RewardScreen({
  meta,
  act,
  result,
  reward,
  nextTitle,
  decisionLabel,
  onNext,
  onMap,
}: {
  meta: (typeof chapterMeta)[number];
  act: string;
  result: BattleResult;
  reward: Reward;
  nextTitle: string | null;
  decisionLabel?: string | undefined;
  onNext: () => void;
  onMap: () => void;
}) {
  const won = result.outcome === "vitoria";
  const draw = result.outcome === "empate";
  const loot = [
    ...(reward.cards ?? []).map((c) => `Carta desbloqueada · ${cardName(c)}`),
    ...(reward.accessories ?? []).map((a) => `Acessório · ${accessoryById(a)?.name ?? a}`),
    ...(reward.techs ?? []).map((t) => `Tecnologia · ${techById(t)?.name ?? t}`),
    ...(reward.research ? [`+${reward.research} pesquisa`] : []),
    ...(reward.sovereigns ? [`+${reward.sovereigns} Sovereigns`] : []),
  ];
  const story = chapterOutro(meta, result.outcome);

  return (
    <div className="flex w-full flex-col items-center gap-4 [@media(max-height:560px)]:gap-2">
      <p className="label-mono text-primary">
        {act} · Capítulo {meta.number}
      </p>

      <h1
        className={cn(
          "font-display text-6xl font-black uppercase leading-none sm:text-7xl [@media(max-height:560px)]:text-4xl",
          won ? "text-fact" : draw ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {won ? "Vitória" : draw ? "Empate" : "Derrota"}
      </h1>

      <p className="max-w-xl font-serif text-base italic leading-relaxed text-foreground/90 [@media(max-height:560px)]:text-sm [@media(max-height:560px)]:leading-snug">
        {story}
      </p>

      {decisionLabel && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Decisão de comando: <span className="text-primary">{decisionLabel}</span>
        </p>
      )}

      {won && loot.length > 0 && (
        <div className="w-full max-w-md border border-border bg-card/60 p-4 text-left [@media(max-height:560px)]:p-2.5">
          <p className="label-mono mb-2 text-fact">Desbloqueado</p>
          <ul className="space-y-1 font-mono text-xs [@media(max-height:560px)]:space-y-0.5">
            {loot.map((l) => (
              <li key={l} className="text-fact">
                {l.startsWith("+") ? l : `+ ${l}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex w-full max-w-md flex-col items-stretch gap-2">
        <button
          onClick={onNext}
          className="bg-primary px-8 py-4 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass transition hover:brightness-110 [@media(max-height:560px)]:py-2"
        >
          {won
            ? nextTitle
              ? `Próxima missão · ${nextTitle}`
              : "Concluir campanha"
            : "Tentar de novo"}
        </button>
        <button
          onClick={onMap}
          className="border border-border px-8 py-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground [@media(max-height:560px)]:py-1.5"
        >
          Voltar ao mapa
        </button>
      </div>
    </div>
  );
}
