import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell } from "@/components/game/shell";
import { CampaignComic } from "@/components/campaign/CampaignComic";
import { DecisionCard } from "@/components/campaign/DecisionCard";
import { BattleScreen, toAiDifficulty } from "@/components/battle/BattleScreen";
import { CollectionScreen } from "@/components/progress/CollectionScreen";
import { LevelUpPanel } from "@/components/campaign/LevelUpPanel";
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
import { allCards, cardById } from "@/game/battle/catalog";
import {
  effectiveDeck,
  effectiveDoctrine,
  effectiveMods,
  ownedCardIds,
  type LevelUpInfo,
} from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";
import type { BattleResult } from "@/game/battle/types";

// Nome de carta tolerante a id desconhecido (recompensas vêm de dados que podem evoluir).
const cardName = (id: string): string => allCards.find((c) => c.id === id)?.name ?? id;

const CATEGORY_TONE: Record<string, string> = {
  infantaria: "border-fact text-fact",
  blindado: "border-primary text-primary",
  artilharia: "border-doc text-doc",
  defesa: "border-ally text-ally",
  reconhecimento: "border-ai text-ai",
  apoio: "border-fiction text-fiction",
};

type View =
  | { kind: "overview" }
  | { kind: "collection" }
  | { kind: "dilemma"; chapterId: string }
  | { kind: "briefing"; chapterId: string }
  | { kind: "battle"; chapterId: string }
  | {
      kind: "reward";
      chapterId: string;
      result: BattleResult;
      reward: Reward;
      levelUps: LevelUpInfo[];
    };

export function CampaignScreen() {
  const { profile, completeChapter, chooseDecision, saveDeck } = useProfile();
  const [view, setView] = useState<View>({ kind: "overview" });
  // Baralho desta operação: começa do baralho ativo e pode ser recomposto no briefing
  // SEM alterar o baralho salvo até o jogador confirmar ("Salvar como meu baralho").
  const [pendingDeck, setPendingDeck] = useState<string[]>([]);

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
    // O baralho escolhido no briefing manda na batalha (se válido); senão, o ativo.
    const battleDeck = pendingDeck.length === 8 ? pendingDeck : effectiveDeck(profile);
    return buildBattleConfig({
      nation: profile.nation,
      mission,
      deck: battleDeck,
      commander,
      // A escolha do capítulo define a doutrina e soma modificadores reais de combate.
      doctrine: effectiveDoctrine(profile, view.chapterId, deck?.doctrine ?? commander.doctrine),
      mods: effectiveMods(profile, view.chapterId),
      aiDifficulty: toAiDifficulty(meta.difficulty),
      seed: seedOf(`${mission.id}:${meta.difficulty}:${battleDeck.join(",")}`),
    });
  }, [view, profile, pendingDeck]);

  // Entrar num capítulo: com dilema, passa pela decisão; sem dilema, direto ao briefing.
  const enterChapter = (chapterId: string) => {
    setView(
      decisionFor(chapterId) ? { kind: "dilemma", chapterId } : { kind: "briefing", chapterId },
    );
  };

  // Abre o briefing com o baralho ativo como ponto de partida.
  const openBriefing = (chapterId: string) => {
    setPendingDeck(effectiveDeck(profile));
    setView({ kind: "briefing", chapterId });
  };

  if (view.kind === "collection") {
    return (
      <GameShell full>
        <CollectionScreen onExit={() => setView({ kind: "overview" })} />
      </GameShell>
    );
  }

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
              openBriefing(view.chapterId);
            }}
            onCancel={() => setView({ kind: "overview" })}
          />
        </GameShell>
      );
    }
  }

  if (view.kind === "briefing") {
    const meta = chapterMetaById(view.chapterId)!;
    const chapter = chapters.find((c) => c.id === meta.id);
    const mission = missionById(meta.missionId);
    const deck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
    const activeDeck = deck ? [...deck.cards] : effectiveDeck(profile);
    return (
      <GameShell full>
        <CampaignBriefing
          chapterTitle={chapter?.title ?? ""}
          act={chapter?.act ?? ""}
          number={meta.number}
          terrain={mission?.terrain ?? "Cidade"}
          durationMin={Math.round((mission?.duration ?? 0) / 60)}
          difficulty={difficultyById(meta.difficulty).name}
          intro={meta.intro}
          owned={ownedCardIds(profile)}
          deck={pendingDeck}
          onChangeDeck={setPendingDeck}
          onOpenCollection={() => setView({ kind: "collection" })}
          onSaveDeck={() => {
            if (deck) saveDeck({ ...deck, cards: pendingDeck });
          }}
          savedDeck={activeDeck}
          onStart={() => setView({ kind: "battle", chapterId: view.chapterId })}
          onBack={() => setView({ kind: "overview" })}
        />
      </GameShell>
    );
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
            const { reward, levelUps } = completeChapter({
              chapterId: view.chapterId,
              result,
              difficulty: meta.difficulty,
            });
            setView({ kind: "reward", chapterId: view.chapterId, result, reward, levelUps });
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
            levelUps={view.levelUps}
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
            levelUps={view.levelUps}
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
        onOpenCollection={() => setView({ kind: "collection" })}
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
  onOpenCollection,
}: {
  profile: Profile;
  currentMeta: (typeof chapterMeta)[number] | undefined;
  onLaunch: () => void;
  onOpenCollection: () => void;
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
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span>
            SOVEREIGNS <b className="text-foreground">{profile.sovereigns}</b>
          </span>
          <span>
            PESQUISA <b className="text-foreground">{profile.research}</b>
          </span>
          <button
            onClick={onOpenCollection}
            className="border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            Coleção & baralho ›
          </button>
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
  levelUps,
  nextTitle,
  decisionLabel,
  onNext,
  onMap,
}: {
  meta: (typeof chapterMeta)[number];
  act: string;
  result: BattleResult;
  reward: Reward;
  levelUps?: LevelUpInfo[];
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
  const ups = levelUps ?? [];

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

      {won && ups.length > 0 && <LevelUpPanel levelUps={ups} />}

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

// ---------------------------------------------------------------------------
// Briefing de operação — a tela onde o jogador vê o capítulo, escolhe as 8 cartas
// daquela batalha e (opcionalmente) abre a Coleção. Tudo numa tela só, sem rolagem:
// o texto fica limitado em altura e a grade de cartas rola dentro do próprio painel.
// ---------------------------------------------------------------------------
function CampaignBriefing({
  chapterTitle,
  act,
  number,
  terrain,
  durationMin,
  difficulty,
  intro,
  owned,
  deck,
  onChangeDeck,
  onOpenCollection,
  onSaveDeck,
  savedDeck,
  onStart,
  onBack,
}: {
  chapterTitle: string;
  act: string;
  number: number;
  terrain: string;
  durationMin: number;
  difficulty: string;
  intro: string;
  owned: string[];
  deck: string[];
  onChangeDeck: (cards: string[]) => void;
  onOpenCollection: () => void;
  onSaveDeck: () => void;
  savedDeck: string[];
  onStart: () => void;
  onBack: () => void;
}) {
  const full = deck.length === 8;
  const toggle = (id: string) => {
    if (deck.includes(id)) onChangeDeck(deck.filter((c) => c !== id));
    else if (deck.length < 8) onChangeDeck([...deck, id]);
  };
  const dirty = deck.length !== savedDeck.length || deck.some((c, i) => savedDeck[i] !== c);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 px-4 py-3 [@media(max-height:560px)]:gap-1.5 [@media(max-height:560px)]:py-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border pb-2.5 [@media(max-height:560px)]:pb-1.5">
        <div className="min-w-0">
          <p className="label-mono text-primary">
            {act} · Capítulo {number}
          </p>
          <h2 className="truncate font-display text-2xl font-black uppercase leading-none [@media(max-height:560px)]:text-xl">
            {chapterTitle}
          </h2>
        </div>
        <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span>{terrain}</span>
          <span>{durationMin} min</span>
          <span>{difficulty}</span>
        </div>
      </div>

      {/* Texto do briefing — limitado em altura para nunca empurrar a tela */}
      <p className="line-clamp-3 max-w-3xl font-serif text-sm italic leading-snug text-foreground/85 [@media(max-height:560px)]:line-clamp-2 [@media(max-height:560px)]:text-xs">
        {intro}
      </p>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_320px] [@media(max-height:560px)]:gap-2">
        <section className="hud-panel hud-corners flex min-h-0 flex-col p-3 [@media(max-height:560px)]:p-2">
          <div className="flex items-center justify-between">
            <p className="label-mono">Cartas desta operação</p>
            <span className={cn("font-mono text-[11px]", full ? "text-fact" : "text-destructive")}>
              {deck.length}/8
            </span>
          </div>
          <div className="mt-2 grid min-h-0 flex-1 grid-cols-3 content-start gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4">
            {owned.map((id) => {
              const card = cardById(id);
              const on = deck.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className={cn(
                    "border p-1.5 text-left transition",
                    on ? "border-primary bg-accent" : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "border px-1 font-mono text-[8px] uppercase",
                        CATEGORY_TONE[card.category],
                      )}
                    >
                      {card.short}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground">{card.cost}</span>
                  </div>
                  <p className="mt-0.5 font-display text-[10px] font-bold uppercase leading-tight">
                    {card.name}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex min-h-0 flex-col gap-2 [@media(max-height:560px)]:gap-1.5">
          <div className="hud-panel hud-corners p-3 [@media(max-height:560px)]:p-2">
            <p className="label-mono mb-1.5">Sequência de lançamento</p>
            <div className="flex flex-wrap gap-1">
              {deck.map((id, i) => (
                <span
                  key={`${id}-${i}`}
                  className="border border-primary/60 px-1.5 py-0.5 font-mono text-[9px] uppercase text-primary"
                >
                  {i + 1}·{cardById(id).short}
                </span>
              ))}
              {Array.from({ length: 8 - deck.length }).map((_, i) => (
                <span
                  key={`e${i}`}
                  className="border border-dashed border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground/50"
                >
                  —
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={onOpenCollection}
            className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition hover:border-primary hover:text-primary [@media(max-height:560px)]:py-1.5"
          >
            Abrir coleção & ferramentas ›
          </button>
          <button
            disabled={!dirty || !full}
            onClick={onSaveDeck}
            className={cn(
              "border px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] transition [@media(max-height:560px)]:py-1.5",
              dirty && full
                ? "border-primary text-primary hover:bg-accent"
                : "cursor-not-allowed border-border text-muted-foreground/50",
            )}
          >
            Salvar como meu baralho
          </button>

          <div className="mt-auto flex flex-col gap-2 [@media(max-height:560px)]:gap-1.5">
            <button
              disabled={!full}
              onClick={onStart}
              className={cn(
                "px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] transition [@media(max-height:560px)]:py-2",
                full
                  ? "bg-primary text-primary-foreground shadow-brass hover:brightness-110"
                  : "cursor-not-allowed border border-border text-muted-foreground",
              )}
            >
              Iniciar operação
            </button>
            <button
              onClick={onBack}
              className="border border-border px-6 py-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground [@media(max-height:560px)]:py-1.5"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
