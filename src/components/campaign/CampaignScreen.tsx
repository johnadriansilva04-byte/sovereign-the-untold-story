import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell } from "@/components/game/shell";
import { StoryBook, type StoryPage } from "@/components/campaign/StoryBook";
import { CardFace } from "@/components/campaign/CardFace";
import { DecisionCard } from "@/components/campaign/DecisionCard";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { CollectionScreen } from "@/components/progress/CollectionScreen";
import { chapters } from "@/game/campaign";
import { commanders } from "@/game/battle/catalog";
import { buildBattleConfig, enemyScalingForChapter, missionById } from "@/game/battle/missions";
import {
  chapterMeta,
  chapterMetaById,
  chapterOutro,
  prizeCardFor,
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
  | { kind: "reward"; chapterId: string; result: BattleResult; reward: Reward }
  | { kind: "cardUnlock"; chapterId: string; result: BattleResult; reward: Reward }
  | { kind: "levelUp"; chapterId: string; result: BattleResult; reward: Reward }
  | { kind: "story"; chapterId: string; result: BattleResult };

export function CampaignScreen() {
  const { profile, completeChapter, chooseDecision, saveDeck } = useProfile();
  const [view, setView] = useState<View>({ kind: "overview" });
  // Baralho desta operação: começa do baralho ativo e pode ser recomposto no briefing
  // SEM alterar o baralho salvo até o jogador confirmar ("Salvar como meu baralho").
  const [pendingDeck, setPendingDeck] = useState<string[]>([]);
  // Recompensas da batalha atual (carta ganha + níveis subidos), guardadas para as
  // telas de coleta/promoção que vêm logo depois do veredito.
  const [loot, setLoot] = useState<{ reward: Reward; levelUps: LevelUpInfo[] }>({
    reward: {},
    levelUps: [],
  });

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
    const scale = enemyScalingForChapter(meta.number);
    return buildBattleConfig({
      nation: profile.nation,
      mission,
      chapterNumber: meta.number,
      prizeCardId: prizeCardFor(view.chapterId),
      // Espólio de guerra: cartas que o inimigo traz e o jogador ainda não possui.
      ownedCardIds: ownedCardIds(profile),
      deck: battleDeck,
      commander,
      // A escolha do capítulo define a doutrina e soma modificadores reais de combate.
      doctrine: effectiveDoctrine(profile, view.chapterId, deck?.doctrine ?? commander.doctrine),
      mods: effectiveMods(profile, view.chapterId),
      // Dificuldade automática: um só número (o capítulo) define IA, nível e baralho.
      aiDifficulty: scale.aiDifficulty,
      seed: seedOf(`${mission.id}:${meta.number}:${battleDeck.join(",")}`),
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
            setLoot({ reward, levelUps });
            setView({ kind: "reward", chapterId: view.chapterId, result, reward });
          }}
        />
      </GameShell>
    );
  }

  // CICLO PÓS-BATALHA: veredito → carta ganha (se houver) → promoção (se houver) →
  // história (livro) → próxima fase. Cada tela é única, sem rolagem.
  if (view.kind === "reward" || view.kind === "cardUnlock" || view.kind === "levelUp") {
    const meta = chapterMetaById(view.chapterId)!;
    const chapter = chapters.find((c) => c.id === meta.id);
    const mission = missionById(meta.missionId);
    const won = view.result.outcome === "vitoria";
    const newCards = won
      ? (view.reward.cards ?? []).filter((id) => (profile.inventory.cards[id] ?? 0) > 0)
      : [];
    const levelUps = won ? loot.levelUps : [];

    // Avança para o próximo passo do ciclo, pulando telas vazias.
    const toStory = () =>
      setView({ kind: "story", chapterId: view.chapterId, result: view.result });
    const afterCards = () =>
      levelUps.length > 0
        ? setView({
            kind: "levelUp",
            chapterId: view.chapterId,
            result: view.result,
            reward: view.reward,
          })
        : toStory();
    const afterVerdict = () =>
      newCards.length > 0
        ? setView({
            kind: "cardUnlock",
            chapterId: view.chapterId,
            result: view.result,
            reward: view.reward,
          })
        : afterCards();

    if (view.kind === "cardUnlock") {
      return (
        <GameShell full>
          <CardUnlockScreen
            cards={newCards}
            chapterLabel={`${chapter?.act ?? ""} · Capítulo ${meta.number}`}
            onNext={afterCards}
          />
        </GameShell>
      );
    }

    if (view.kind === "levelUp") {
      return (
        <GameShell full>
          <LevelUpScreen levelUps={levelUps} onNext={toStory} />
        </GameShell>
      );
    }

    return (
      <GameShell full>
        <VerdictScreen
          won={won}
          draw={view.result.outcome === "empate"}
          chapterTitle={chapter?.title ?? ""}
          chapterLabel={`${chapter?.act ?? ""} · Capítulo ${meta.number}`}
          terrain={mission?.terrain ?? "Cidade"}
          result={view.result}
          decisionLabel={
            decisionOption(view.chapterId, profile.decisions[view.chapterId] ?? "")?.label
          }
          reward={view.reward}
          onNext={afterVerdict}
          onRetry={() => enterChapter(view.chapterId)}
          onMap={() => setView({ kind: "overview" })}
        />
      </GameShell>
    );
  }

  // HISTÓRIA: o livro com a escrita ao vivo. O botão de escolher cartas fica AQUI e
  // só abre se o jogador clicar — a seleção nunca aparece sozinha.
  if (view.kind === "story") {
    const meta = chapterMetaById(view.chapterId)!;
    const chapter = chapters.find((c) => c.id === meta.id);
    const mission = missionById(meta.missionId);
    const won = view.result.outcome === "vitoria";
    const nextMeta = chapterMeta.find((m) => profile.chapters[m.id]?.status !== "concluido");
    const nextChapter = nextMeta ? chapters.find((c) => c.id === nextMeta.id) : null;

    // Páginas do relato: abertura (introdução do capítulo), falas e desfecho.
    const pages: StoryPage[] = [
      { speaker: "Narrador", text: meta.intro },
      ...(chapter?.dialogue ?? []).map((d) => ({ speaker: d.speaker, text: d.text })),
      { speaker: "Narrador", text: chapterOutro(meta, view.result.outcome) },
    ];

    return (
      <GameShell full>
        <StoryBook
          chapterLabel={`${chapter?.act ?? ""} · Capítulo ${meta.number}`}
          title={chapter?.title ?? ""}
          place={mission?.terrain}
          era={chapter?.era}
          pages={pages}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setView({ kind: "overview" })}
                className="border border-border px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
              >
                Voltar ao mapa
              </button>
              {nextMeta && (
                <button
                  onClick={() => openBriefing(nextMeta.id)}
                  className="border border-primary px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] text-primary transition hover:bg-primary/10"
                >
                  Escolher cartas
                </button>
              )}
            </div>
            <button
              onClick={() => (nextMeta ? enterChapter(nextMeta.id) : setView({ kind: "overview" }))}
              className="bg-primary px-8 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass transition hover:brightness-110"
            >
              {won
                ? nextChapter
                  ? `Próxima missão · ${nextChapter.title}`
                  : "Concluir campanha"
                : "Tentar de novo"}
            </button>
          </div>
        </StoryBook>
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
// Veredito — tela animada de vitória (alegre) ou derrota (triste). Sem rolagem:
// o título explode na tela e o resumo fica contido.
// ---------------------------------------------------------------------------
function VerdictScreen({
  won,
  draw,
  chapterTitle,
  chapterLabel,
  terrain,
  result,
  decisionLabel,
  reward,
  onNext,
  onRetry,
  onMap,
}: {
  won: boolean;
  draw: boolean;
  chapterTitle: string;
  chapterLabel: string;
  terrain: string;
  result: BattleResult;
  decisionLabel?: string | undefined;
  reward: Reward;
  onNext: () => void;
  onRetry: () => void;
  onMap: () => void;
}) {
  const headline = won ? "Vitória" : draw ? "Empate" : "Derrota";
  const tone = won
    ? "text-fact drop-shadow-[0_0_24px_oklch(0.64_0.06_145/0.55)]"
    : draw
      ? "text-muted-foreground"
      : "text-destructive drop-shadow-[0_0_24px_oklch(0.58_0.19_28/0.55)]";
  const loot = [
    ...(reward.cards ?? []).map((c) => `Carta · ${cardName(c)}`),
    ...(reward.accessories ?? []).map((a) => `Acessório · ${accessoryById(a)?.name ?? a}`),
    ...(reward.techs ?? []).map((t) => `Tecnologia · ${techById(t)?.name ?? t}`),
    ...(reward.research ? [`+${reward.research} pesquisa`] : []),
    ...(reward.sovereigns ? [`+${reward.sovereigns} Sovereigns`] : []),
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-4 text-center [@media(max-height:560px)]:gap-2 [@media(max-height:560px)]:py-1">
      <p className="label-mono text-primary">{chapterLabel}</p>

      <div
        className={cn(
          "animate-verdict flex flex-col items-center gap-2",
          !won && !draw && "animate-verdict-shake",
        )}
      >
        <h1
          className={cn(
            "font-display text-7xl font-black uppercase leading-none sm:text-8xl [@media(max-height:560px)]:text-5xl",
            tone,
          )}
        >
          {headline}
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {chapterTitle} · {terrain} · {Math.round(result.duration)}s
        </p>
      </div>

      <div className="grid w-full max-w-lg grid-cols-3 gap-2 border-y border-border py-3 font-mono text-[11px] [@media(max-height:560px)]:py-1.5">
        <Stat label="Território" value={`${result.territorialScore.blue}`} />
        <Stat label="Abates" value={`${result.kills.blue}`} />
        <Stat label="Baixas" value={`${result.losses.blue}`} />
      </div>

      {decisionLabel && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Decisão de comando: <span className="text-primary">{decisionLabel}</span>
        </p>
      )}

      {won && loot.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          {loot.map((l) => (
            <span key={l} className="font-mono text-[11px] uppercase text-fact">
              {l.startsWith("+") ? l : `+ ${l}`}
            </span>
          ))}
        </div>
      )}

      <div className="flex w-full max-w-md flex-col items-stretch gap-2">
        <button
          onClick={won ? onNext : onRetry}
          className="bg-primary px-8 py-4 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass transition hover:brightness-110 [@media(max-height:560px)]:py-2"
        >
          {won ? "Continuar" : draw ? "Nova tentativa" : "Tentar de novo"}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-black text-foreground [@media(max-height:560px)]:text-lg">
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carta desbloqueada — tela exclusiva para ver e coletar a carta ganha.
// ---------------------------------------------------------------------------
function CardUnlockScreen({
  cards,
  chapterLabel,
  onNext,
}: {
  cards: string[];
  chapterLabel: string;
  onNext: () => void;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-5 px-4 py-4 text-center [@media(max-height:560px)]:gap-2">
      <div className="animate-rise">
        <p className="label-mono text-primary">{chapterLabel}</p>
        <p className="mt-1 font-display text-4xl font-black uppercase leading-none text-fact [@media(max-height:560px)]:text-2xl">
          {cards.length > 1 ? "Cartas desbloqueadas" : "Carta desbloqueada"}
        </p>
        <p className="mt-1 font-serif text-sm italic text-foreground/80">
          Reforço incorporado ao seu arsenal.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-4">
        {cards.map((id) => (
          <CardFace key={id} cardId={id} level={1} />
        ))}
      </div>

      <button
        onClick={onNext}
        className="bg-primary px-8 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass transition hover:brightness-110 [@media(max-height:560px)]:py-2"
      >
        Coletar
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promoção — tela exclusiva de subida de nível, com os atributos antes × depois.
// ---------------------------------------------------------------------------
function LevelUpScreen({ levelUps, onNext }: { levelUps: LevelUpInfo[]; onNext: () => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-5 px-4 py-4 text-center [@media(max-height:560px)]:gap-2">
      <div className="animate-level-burst">
        <p className="label-mono text-primary">Promoção de campo</p>
        <p className="mt-1 font-display text-4xl font-black uppercase leading-none [@media(max-height:560px)]:text-2xl">
          Nível aumentado
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-4">
        {levelUps.map((u) => (
          <div key={u.cardId} className="animate-card-flip flex flex-col items-center gap-2">
            <CardFace cardId={u.cardId} level={u.to} />
            <p className="font-mono text-xs uppercase tracking-wider text-primary">
              nv {u.from} → <b className="text-fact">nv {u.to}</b>
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="bg-primary px-8 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass transition hover:brightness-110 [@media(max-height:560px)]:py-2"
      >
        Continuar
      </button>
    </div>
  );
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
