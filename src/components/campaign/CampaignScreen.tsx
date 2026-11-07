import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { chapters, archives } from "@/game/campaign";
import { missionById } from "@/game/battle/missions";
import {
  chapterMeta,
  chapterMetaById,
  chapterOutro,
  totalChapters,
} from "@/game/progress/campaign";
import { difficultyById, terrainHint } from "@/game/progress/catalog";
import type { Reward } from "@/game/progress/catalog";
import { useProfile } from "@/game/progress/store";
import type { BattleResult } from "@/game/battle/types";

type View =
  | { kind: "map" }
  | { kind: "brief"; chapterId: string }
  | { kind: "battle"; chapterId: string }
  | { kind: "reward"; chapterId: string; result: BattleResult; reward: Reward };

export function CampaignScreen() {
  const { profile, completeChapter } = useProfile();
  const [view, setView] = useState<View>({ kind: "map" });
  const [lastReward, setLastReward] = useState<Reward | null>(null);

  const metaById = useMemo(() => new Map(chapterMeta.map((m) => [m.id, m])), []);

  if (view.kind === "battle") {
    const meta = metaById.get(view.chapterId)!;
    const mission = missionById(meta.missionId);
    return (
      <GameShell full>
        <div className="mx-auto max-w-6xl px-5 py-6">
          <BattleScreen
            modeLabel={`Campanha · Cap. ${meta.number}`}
            initialMissionId={mission.id}
            initialDifficulty={meta.difficulty}
            onExit={() => setView({ kind: "map" })}
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
        </div>
      </GameShell>
    );
  }

  if (view.kind === "reward") {
    const meta = metaById.get(view.chapterId)!;
    const chapter = chapters.find((c) => c.id === view.chapterId)!;
    return (
      <GameShell>
        <RewardScreen
          chapter={chapter}
          meta={meta}
          result={view.result}
          reward={view.reward}
          onNext={() => {
            if (view.result.outcome !== "vitoria") {
              setView({ kind: "brief", chapterId: view.chapterId });
              return;
            }
            const next = chapterMeta.find((m) => m.number === meta.number + 1);
            setView(next ? { kind: "brief", chapterId: next.id } : { kind: "map" });
          }}
          onMap={() => setView({ kind: "map" })}
        />
      </GameShell>
    );
  }

  if (view.kind === "brief") {
    const meta = metaById.get(view.chapterId)!;
    const chapter = chapters.find((c) => c.id === view.chapterId)!;
    return (
      <GameShell>
        <BriefScreen
          chapter={chapter}
          meta={meta}
          onLaunch={() => setView({ kind: "battle", chapterId: view.chapterId })}
          onBack={() => setView({ kind: "map" })}
        />
      </GameShell>
    );
  }

  // mapa da campanha
  const completed = chapterMeta.filter(
    (m) => profile.chapters[m.id]?.status === "concluido",
  ).length;
  return (
    <GameShell>
      <PageTitle kicker="Campanha · A história que não te contaram" title="Campanha">
        A guerra nunca acabou. Só trocou de uniforme. Cada capítulo ensina uma ideia nova de combate
        — e devolve a você o que conquistou no campo.
      </PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Capítulos" value={`${completed}/${totalChapters}`} />
        <MiniStat label="Sovereigns" value={profile.sovereigns} />
        <MiniStat label="Pesquisa" value={profile.research} />
        <MiniStat label="Cartas" value={Object.keys(profile.inventory.cards).length} />
      </div>

      <div className="space-y-3">
        {chapterMeta.map((meta) => {
          const chapter = chapters.find((c) => c.id === meta.id)!;
          const state = profile.chapters[meta.id];
          const locked = state?.status === "bloqueado";
          const done = state?.status === "concluido";
          const mission = missionById(meta.missionId);
          const diff = difficultyById(meta.difficulty);
          return (
            <div
              key={meta.id}
              className={cn(
                "hud-panel hud-corners grid gap-4 p-5 md:grid-cols-[auto_1fr_auto]",
                locked && "opacity-50",
                done && "border-fact/40",
              )}
            >
              <div className="flex items-center gap-4">
                <span className="font-display text-5xl font-black text-muted-foreground/40">
                  {String(meta.number).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                    done
                      ? "border-fact text-fact"
                      : locked
                        ? "border-border text-muted-foreground"
                        : "border-primary text-primary",
                  )}
                >
                  {done ? "Concluído" : locked ? "Bloqueado" : "Disponível"}
                </span>
              </div>

              <div>
                <p className="label-mono">{chapter.act}</p>
                <h3 className="font-display text-2xl font-bold uppercase">{chapter.title}</h3>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {chapter.era} · {chapter.place} · {mission.terrain}
                </p>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{chapter.summary}</p>
                <p className="mt-2 font-mono text-[11px] text-doc">
                  {terrainHint[mission.terrain]}
                </p>
              </div>

              <div className="flex flex-col items-stretch justify-center gap-2 md:items-end">
                <span className="border border-ai px-2 py-0.5 text-center font-mono text-[9px] uppercase text-ai">
                  {diff.name}
                </span>
                {done && state?.outcome && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    melhor {state.bestScore}% · {state.attempts} tentativa(s)
                  </span>
                )}
                <button
                  disabled={locked}
                  onClick={() => setView({ kind: "brief", chapterId: meta.id })}
                  className={cn(
                    "px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition",
                    locked
                      ? "cursor-not-allowed border border-border text-muted-foreground"
                      : "bg-primary text-primary-foreground hover:brightness-110",
                  )}
                >
                  {done ? "Rejogar" : locked ? "Bloqueado" : "Iniciar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {lastReward && (
        <p className="mt-6 font-mono text-[11px] text-fact">
          Última recompensa recebida e sincronizada com a sua conta.
        </p>
      )}
    </GameShell>
  );
}

function BriefScreen({
  chapter,
  meta,
  onLaunch,
  onBack,
}: {
  chapter: (typeof chapters)[number];
  meta: (typeof chapterMeta)[number];
  onLaunch: () => void;
  onBack: () => void;
}) {
  const mission = missionById(meta.missionId);
  const diff = difficultyById(meta.difficulty);
  const evidence = chapter.archives
    .map((id) => archives.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Panel>
        <p className="label-mono text-primary">
          {chapter.act} · Capítulo {chapter.number}
        </p>
        <h1 className="mt-1 font-display text-5xl font-black uppercase leading-none">
          {chapter.title}
        </h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {chapter.era} · {chapter.place}
        </p>

        <p className="mt-4 border-l-2 border-primary pl-4 font-serif text-lg italic text-foreground/90">
          {meta.intro}
        </p>

        <div className="mt-5 space-y-2">
          {chapter.dialogue.map((d, i) => (
            <p key={i} className="text-sm">
              <span className="font-mono text-[11px] uppercase text-primary">{d.speaker}:</span>{" "}
              <span className="text-muted-foreground">{d.text}</span>
            </p>
          ))}
        </div>
      </Panel>

      <Panel title="Missão">
        <p className="font-display text-lg font-bold uppercase">{mission.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{mission.brief}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-4">
          <Info label="Terreno" value={mission.terrain} />
          <Info label="Objetivo" value={mission.objectiveKind} />
          <Info label="Duração" value={`${Math.round(mission.duration / 60)} min`} />
          <Info label="Adversário" value={diff.name} />
        </dl>
        <p className="mt-2 font-mono text-[11px] text-doc">{terrainHint[mission.terrain]}</p>
      </Panel>

      {evidence.length > 0 && (
        <Panel title="Dossiê · o que é fato e o que é tese">
          <div className="space-y-3">
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
        </Panel>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onLaunch}
          className="bg-primary px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass hover:brightness-110"
        >
          Entrar no teatro
        </button>
        <button
          onClick={onBack}
          className="border border-border px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          Voltar ao mapa
        </button>
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
    <div className="mx-auto max-w-3xl space-y-5 text-center">
      <p className="label-mono text-primary">
        {chapter.act} · Capítulo {chapter.number}
      </p>
      <h1 className="font-display text-6xl font-black uppercase">
        {won ? "Vitória" : result.outcome === "empate" ? "Empate" : "Derrota"}
      </h1>
      <p className="font-mono text-xs text-muted-foreground">{result.reason}</p>

      <p className="mx-auto max-w-xl border-l-2 border-primary pl-4 text-left font-serif text-lg italic text-foreground/90">
        {chapterOutro(meta, result.outcome)}
      </p>

      {won ? (
        <Panel title="Recompensas conquistadas">
          <ul className="space-y-1 text-left font-mono text-xs">
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
          <p className="mt-3 text-left text-xs text-muted-foreground">{meta.rewardNote}</p>
        </Panel>
      ) : (
        <Panel title="Sem recompensas">
          <p className="text-sm text-muted-foreground">
            Uma derrota obriga a reorganizar as forças antes de uma nova ofensiva. Ajuste o baralho
            para o terreno e tente de novo.
          </p>
        </Panel>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={onNext}
          className="bg-primary px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground hover:brightness-110"
        >
          {won ? "Continuar" : "Tentar de novo"}
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

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="hud-panel hud-corners p-3">
      <p className="label-mono text-[9px]">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
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
