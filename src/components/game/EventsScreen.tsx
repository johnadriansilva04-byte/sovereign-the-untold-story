import { useState } from "react";

import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { cn } from "@/lib/utils";
import { countries, events, relationOf } from "@/game/data";
import { allCards } from "@/game/battle/catalog";
import { chapterMeta } from "@/game/progress/campaign";
import { accessoryById, difficultyById, techById } from "@/game/progress/catalog";
import { useProfile } from "@/game/progress/store";
import type { BattleRecord } from "@/game/progress/profile";
import type { GameEvent } from "@/game/types";

const kindStyle: Record<GameEvent["kind"], { label: string; cls: string }> = {
  guerra: { label: "Guerra", cls: "border-enemy text-enemy" },
  aliança: { label: "Aliança", cls: "border-ally text-ally" },
  tratado: { label: "Tratado", cls: "border-fact text-fact" },
  conquista: { label: "Conquista", cls: "border-enemy text-enemy" },
  militar: { label: "Militar", cls: "border-destructive text-destructive" },
  economia: { label: "Economia", cls: "border-primary text-primary" },
  ia: { label: "Agente IA", cls: "border-ai text-ai" },
  batalha: { label: "Batalha", cls: "border-doc text-doc" },
};

const outcomeLabel = {
  vitoria: { label: "Vitória", cls: "text-fact" },
  derrota: { label: "Derrota", cls: "text-enemy" },
  empate: { label: "Empate", cls: "text-muted-foreground" },
} as const;

const PAGE = 8;

// Nome de carta tolerante a id desconhecido (recompensas vêm de dados que podem evoluir).
const cardName = (id: string): string => allCards.find((c) => c.id === id)?.name ?? id;
const actorLabel = (id: string) => {
  const c = countries.find((x) => x.id === id);
  return c ? `${c.flag} ${c.name}` : id.toUpperCase();
};

type View =
  | { kind: "home" }
  | { kind: "feed"; page: number }
  | { kind: "records"; page: number }
  | { kind: "event"; id: string }
  | { kind: "record"; id: string };

export function EventsScreen() {
  const { profile } = useProfile();
  const [view, setView] = useState<View>({ kind: "home" });

  const byTurn = [...events].sort((a, b) => b.turn - a.turn);
  const records = profile.records;

  // Tela de detalhe de um evento: texto completo + atores + relação. Sem rolagem.
  if (view.kind === "event") {
    const e = events.find((x) => x.id === view.id);
    if (!e) return null;
    const s = kindStyle[e.kind];
    return (
      <GameShell full>
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-4 px-4 py-4">
          <BackBar label="Feed da guerra" onBack={() => setView({ kind: "feed", page: 0 })} />
          <Panel>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  s.cls,
                )}
              >
                {s.label}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Turno {e.turn}
              </span>
            </div>
            <p className="mt-4 font-serif text-2xl leading-snug text-foreground/95">{e.text}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
              {e.actors.map((a) => (
                <span
                  key={a}
                  className="border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-foreground"
                >
                  {actorLabel(a)}
                </span>
              ))}
              {e.actors.length === 2 && (
                <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Relação: <b className="text-primary">{relationOf(e.actors[0]!, e.actors[1]!)}</b>
                </span>
              )}
            </div>
          </Panel>
        </div>
      </GameShell>
    );
  }

  // Tela de detalhe de uma batalha registrada. Sem rolagem.
  if (view.kind === "record") {
    const r = records.find((x) => x.id === view.id);
    if (!r) return null;
    return (
      <GameShell full>
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-4 px-4 py-4">
          <BackBar
            label="Histórico de batalhas"
            onBack={() => setView({ kind: "records", page: 0 })}
          />
          <Panel>
            <RecordDetail record={r} />
          </Panel>
        </div>
      </GameShell>
    );
  }

  // Tela de seção (lista paginada): também sem rolagem, com navegação de página.
  if (view.kind === "feed") {
    return (
      <GameShell full>
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-4 px-4 py-4">
          <BackBar label="Sala de situação" onBack={() => setView({ kind: "home" })} />
          <Panel title={`Feed da guerra · ${byTurn.length}`}>
            <ul className="space-y-2">
              {byTurn.slice(view.page * PAGE, view.page * PAGE + PAGE).map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  onOpen={() => setView({ kind: "event", id: e.id })}
                />
              ))}
            </ul>
            <Pager
              page={view.page}
              total={byTurn.length}
              onPrev={() => setView({ kind: "feed", page: view.page - 1 })}
              onNext={() => setView({ kind: "feed", page: view.page + 1 })}
            />
          </Panel>
        </div>
      </GameShell>
    );
  }

  if (view.kind === "records") {
    return (
      <GameShell full>
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-4 px-4 py-4">
          <BackBar label="Sala de situação" onBack={() => setView({ kind: "home" })} />
          <Panel title={`Histórico de batalhas · ${records.length}`}>
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma batalha registrada ainda. Jogue um capítulo da campanha ou uma partida de
                treino para começar o histórico.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {records.slice(view.page * PAGE, view.page * PAGE + PAGE).map((r) => (
                    <RecordRow
                      key={r.id}
                      record={r}
                      onOpen={() => setView({ kind: "record", id: r.id })}
                    />
                  ))}
                </ul>
                <Pager
                  page={view.page}
                  total={records.length}
                  onPrev={() => setView({ kind: "records", page: view.page - 1 })}
                  onNext={() => setView({ kind: "records", page: view.page + 1 })}
                />
              </>
            )}
          </Panel>
        </div>
      </GameShell>
    );
  }

  // Tela principal: tudo cabe sem rolagem. Cada linha abre uma tela nova de detalhe.
  const latestEvents = byTurn.slice(0, 5);
  const latestRecords = records.slice(0, 4);

  return (
    <GameShell full>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 px-4 py-3">
        <PageTitle compact kicker="Sala de situação · Turno 14" title="Eventos e histórico">
          O que o mundo fez enquanto você lutava — clique para expandir cada registro.
        </PageTitle>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
          <Panel
            title="Feed da guerra"
            action={
              <button
                onClick={() => setView({ kind: "feed", page: 0 })}
                className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
              >
                Ver tudo ({byTurn.length}) →
              </button>
            }
          >
            <ul className="space-y-2">
              {latestEvents.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  onOpen={() => setView({ kind: "event", id: e.id })}
                />
              ))}
            </ul>
          </Panel>

          <Panel
            title={`Histórico de batalhas · ${records.length}`}
            action={
              records.length > 0 ? (
                <button
                  onClick={() => setView({ kind: "records", page: 0 })}
                  className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
                >
                  Ver tudo ({records.length}) →
                </button>
              ) : null
            }
          >
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma batalha registrada ainda. Jogue um capítulo da campanha ou uma partida de
                treino para começar o histórico.
              </p>
            ) : (
              <ul className="space-y-2">
                {latestRecords.map((r) => (
                  <RecordRow
                    key={r.id}
                    record={r}
                    onOpen={() => setView({ kind: "record", id: r.id })}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </GameShell>
  );
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="self-start border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary"
    >
      ← {label}
    </button>
  );
}

function EventRow({ event: e, onOpen }: { event: GameEvent; onOpen: () => void }) {
  const s = kindStyle[e.kind];
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-3 border border-border/60 px-3 py-2 text-left transition hover:border-primary/60"
      >
        <span className="w-8 shrink-0 font-mono text-[11px] text-muted-foreground">T{e.turn}</span>
        <span
          className={cn(
            "shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
            s.cls,
          )}
        >
          {s.label}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{e.text}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">→</span>
      </button>
    </li>
  );
}

function RecordRow({ record: r, onOpen }: { record: BattleRecord; onOpen: () => void }) {
  const o = outcomeLabel[r.outcome];
  const chapter = chapterMeta.find((c) => c.missionId === r.missionId);
  return (
    <li>
      <button
        onClick={onOpen}
        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 border border-border/60 px-3 py-2 text-left transition hover:border-primary/60"
      >
        <span className="min-w-0">
          <span className="block truncate font-display text-sm font-bold uppercase">
            {r.missionName}
            {chapter ? <span className="ml-2 label-mono">Cap. {chapter.number}</span> : null}
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {r.mode} · {difficultyById(r.difficulty).name}
          </span>
        </span>
        <span className={cn("font-mono text-[11px] uppercase tracking-wider", o.cls)}>
          {o.label}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">→</span>
      </button>
    </li>
  );
}

function RecordDetail({ record: r }: { record: BattleRecord }) {
  const o = outcomeLabel[r.outcome];
  const chapter = chapterMeta.find((c) => c.missionId === r.missionId);
  const loot = [
    ...(r.rewards?.cards ?? []).map((c) => `Carta · ${cardName(c)}`),
    ...(r.rewards?.accessories ?? []).map((a) => `Acessório · ${accessoryById(a)?.name ?? a}`),
    ...(r.rewards?.techs ?? []).map((t) => `Tecnologia · ${techById(t)?.name ?? t}`),
    ...(r.rewards?.research ? [`+${r.rewards.research} pesquisa`] : []),
    ...(r.rewards?.sovereigns ? [`+${r.rewards.sovereigns} Sovereigns`] : []),
  ];
  const stats: [string, string][] = [
    ["Modo", r.mode],
    ["Dificuldade", difficultyById(r.difficulty).name],
    ["Duração", fmt(r.duration)],
    ["Baixas", String(r.losses)],
    ["Abates", String(r.kills)],
    ["Território", `${Math.round(r.territorialScore)}`],
  ];
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className={cn("font-mono text-sm uppercase tracking-wider", o.cls)}>{o.label}</span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {new Date(r.createdAt).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-black uppercase leading-none">
        {r.missionName}
        {chapter ? <span className="ml-3 label-mono">Cap. {chapter.number}</span> : null}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="border border-border/60 px-3 py-2">
            <p className="label-mono">{k}</p>
            <p className="font-display text-xl font-bold uppercase">{v}</p>
          </div>
        ))}
      </div>
      {loot.length > 0 && (
        <div className="mt-4 border border-border bg-card/60 p-3">
          <p className="label-mono mb-2 text-fact">Desbloqueado</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-fact">
            {loot.map((l) => (
              <li key={l}>+ {l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Pager({
  page,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"
      >
        ← Anterior
      </button>
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {page + 1} / {pages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= pages - 1}
        className="border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"
      >
        Próxima →
      </button>
    </div>
  );
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
