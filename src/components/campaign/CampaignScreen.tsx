import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell, Panel } from "@/components/game/shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { chapters, archives } from "@/game/campaign";
import { missionById } from "@/game/battle/missions";
import { chapterMeta, chapterOutro, totalChapters } from "@/game/progress/campaign";
import { difficultyById, terrainHint } from "@/game/progress/catalog";
import type { Reward } from "@/game/progress/catalog";
import { useProfile } from "@/game/progress/store";
import type { BattleResult } from "@/game/battle/types";

type View =
  | { kind: "map" }
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
              setView({ kind: "battle", chapterId: view.chapterId });
              return;
            }
            const next = chapterMeta.find((m) => m.number === meta.number + 1);
            setView(next ? { kind: "battle", chapterId: next.id } : { kind: "map" });
          }}
          onMap={() => setView({ kind: "map" })}
        />
      </GameShell>
    );
  }

  return (
    <CampaignMap
      profile={profile}
      lastReward={lastReward}
      onLaunch={(chapterId) => setView({ kind: "battle", chapterId })}
    />
  );
}

// ---------------------------------------------------------------------------
// Mapa da campanha — UMA tela, sem rolagem: atos em colunas, capítulos em cartões.
// Clicar em "Expandir" abre uma tela nova (diálogo) com o briefing completo.
// ---------------------------------------------------------------------------

type Profile = ReturnType<typeof useProfile>["profile"];

function CampaignMap({
  profile,
  lastReward,
  onLaunch,
}: {
  profile: Profile;
  lastReward: Reward | null;
  onLaunch: (chapterId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const completed = chapterMeta.filter(
    (m) => profile.chapters[m.id]?.status === "concluido",
  ).length;
  const pct = Math.round((completed / totalChapters) * 100);
  const nextMeta = chapterMeta.find((m) => profile.chapters[m.id]?.status !== "concluido");

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
    actGroups.find((g) => g.metas.some((m) => m.id === nextMeta?.id)) ?? actGroups[0]!;
  const [act, setAct] = useState(activeGroup.act);
  const group = actGroups.find((g) => g.act === act) ?? activeGroup;
  const openMeta = openId ? chapterMeta.find((m) => m.id === openId) : null;

  return (
    <GameShell full>
      <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-7xl flex-col px-4 py-4">
        {/* Cabeçalho compacto: progresso em uma linha */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-3">
          <div>
            <p className="label-mono text-primary">Campanha · A história que não te contaram</p>
            <h1 className="font-display text-2xl font-black uppercase leading-none">Campanha</h1>
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
              CARTAS{" "}
              <b className="text-foreground">{Object.keys(profile.inventory.cards).length}</b>
            </span>
          </div>
        </div>

        {/* Seletor de atos */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {actGroups.map((g) => {
            const done = g.metas.filter(
              (m) => profile.chapters[m.id]?.status === "concluido",
            ).length;
            return (
              <button
                key={g.act}
                onClick={() => setAct(g.act)}
                className={cn(
                  "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                  g.act === act
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {g.act.replace(/^Ato /, "A")} · {done}/{g.metas.length}
              </button>
            );
          })}
        </div>

        {/* Grade de capítulos do ato — cabe na tela, sem rolagem */}
        <div className="mt-3 min-h-0 flex-1">
          <div className="grid h-full auto-rows-fr grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
            {group.metas.map((meta) => (
              <ChapterCard
                key={meta.id}
                meta={meta}
                profile={profile}
                isNext={meta.id === nextMeta?.id}
                onExpand={() => setOpenId(meta.id)}
                onLaunch={() => onLaunch(meta.id)}
              />
            ))}
          </div>
        </div>

        {lastReward && (
          <p className="pt-2 font-mono text-[10px] text-fact">
            Última recompensa recebida e sincronizada com a sua conta.
          </p>
        )}
      </div>

      {openMeta && (
        <BriefDialog
          meta={openMeta}
          onClose={() => setOpenId(null)}
          onLaunch={() => {
            setOpenId(null);
            onLaunch(openMeta.id);
          }}
        />
      )}
    </GameShell>
  );
}

function ChapterCard({
  meta,
  profile,
  isNext,
  onExpand,
  onLaunch,
}: {
  meta: (typeof chapterMeta)[number];
  profile: Profile;
  isNext: boolean;
  onExpand: () => void;
  onLaunch: () => void;
}) {
  const chapter = chapters.find((c) => c.id === meta.id)!;
  const state = profile.chapters[meta.id];
  const done = state?.status === "concluido";
  const locked = !done && !isNext;
  const diff = difficultyById(meta.difficulty);

  if (locked) {
    return (
      <div className="hud-panel flex flex-col justify-between p-3 opacity-55">
        <div className="flex items-center justify-between">
          <span className="font-display text-3xl font-black text-muted-foreground/30">
            {String(meta.number).padStart(2, "0")}
          </span>
          <span className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            🔒
          </span>
        </div>
        <p className="font-mono text-[10px] leading-snug text-muted-foreground">
          Conclua o capítulo anterior para liberar.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "hud-panel hud-corners flex min-h-0 flex-col justify-between p-3",
        done && "border-fact/40",
        isNext && "border-primary/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-3xl font-black text-muted-foreground/40">
          {String(meta.number).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
            done ? "border-fact text-fact" : "border-primary text-primary",
          )}
        >
          {done ? "Feito" : "Em curso"}
        </span>
      </div>
      <div className="mt-1 min-h-0">
        <h3 className="line-clamp-2 font-display text-sm font-bold uppercase leading-tight">
          {chapter.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 font-mono text-[9px] text-muted-foreground">
          {chapter.era} · {missionById(meta.missionId).terrain}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          onClick={onExpand}
          className="flex-1 border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          Expandir
        </button>
        <button
          onClick={onLaunch}
          className="flex-1 bg-primary px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary-foreground transition hover:brightness-110"
        >
          {done ? "Rejogar" : "Iniciar"}
        </button>
      </div>
      <p className="mt-1 truncate font-mono text-[9px] text-ai">{diff.name}</p>
    </div>
  );
}

function BriefDialog({
  meta,
  onClose,
  onLaunch,
}: {
  meta: (typeof chapterMeta)[number];
  onClose: () => void;
  onLaunch: () => void;
}) {
  const chapter = chapters.find((c) => c.id === meta.id)!;
  const mission = missionById(meta.missionId);
  const diff = difficultyById(meta.difficulty);
  const evidence = chapter.archives
    .map((id) => archives.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-hidden border-primary/40 bg-background">
        <DialogHeader>
          <DialogTitle className="text-left">
            <span className="label-mono text-primary">
              {chapter.act} · Capítulo {chapter.number}
            </span>
            <span className="mt-1 block font-display text-3xl font-black uppercase leading-none">
              {chapter.title}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-5 sm:grid-cols-2">
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
                    <span className="font-mono text-[11px] uppercase text-primary">
                      {d.speaker}:
                    </span>{" "}
                    <span className="text-muted-foreground">{d.text}</span>
                  </p>
                ))}
              </div>
            </div>

            <div>
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
                <p className="mt-1 font-mono text-[11px] text-doc">
                  {terrainHint[mission.terrain]}
                </p>
              </div>

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
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {a.date}
                          </span>
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
        </div>

        <div className="flex flex-wrap gap-3 border-t border-border pt-3">
          <button
            onClick={onLaunch}
            className="bg-primary px-6 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass hover:brightness-110"
          >
            Entrar no teatro
          </button>
          <button
            onClick={onClose}
            className="border border-border px-6 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
