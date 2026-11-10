import { cn } from "@/lib/utils";
import { archiveById } from "@/game/campaign";
import type { Chapter } from "@/game/types";
import type { BattleResult, TerrainKind } from "@/game/battle/types";
import type { ChapterMeta } from "@/game/progress/campaign";
import { chapterOutro } from "@/game/progress/campaign";
import type { Reward } from "@/game/progress/catalog";
import { accessoryById, techById } from "@/game/progress/catalog";
import { allCards } from "@/game/battle/catalog";
import { EvidenceBadge } from "@/components/game/shell";

// Nome de carta tolerante a id desconhecido (recompensas vêm de dados que podem evoluir).
const cardName = (id: string): string => allCards.find((c) => c.id === id)?.name ?? id;

// Cores de cena por terreno, alinhadas ao teatro de batalha.
const SCENE: Record<string, { sky: string; ground: string; ink: string }> = {
  Cidade: { sky: "oklch(0.34 0.03 255)", ground: "oklch(0.22 0.01 255)", ink: "oklch(0.1 0.01 255)" },
  Floresta: { sky: "oklch(0.36 0.04 150)", ground: "oklch(0.22 0.04 145)", ink: "oklch(0.1 0.02 145)" },
  "Campo aberto": { sky: "oklch(0.42 0.05 90)", ground: "oklch(0.26 0.04 90)", ink: "oklch(0.12 0.02 90)" },
  Montanha: { sky: "oklch(0.4 0.02 70)", ground: "oklch(0.24 0.015 70)", ink: "oklch(0.12 0.01 70)" },
  "Travessia de rio": { sky: "oklch(0.38 0.05 215)", ground: "oklch(0.22 0.04 215)", ink: "oklch(0.1 0.02 215)" },
  "Região fortificada": {
    sky: "oklch(0.36 0.03 60)",
    ground: "oklch(0.22 0.02 60)",
    ink: "oklch(0.11 0.01 60)",
  },
};
const DEFAULT_SCENE = { sky: "oklch(0.34 0.03 200)", ground: "oklch(0.22 0.02 200)", ink: "oklch(0.1 0.01 200)" };

export function CampaignComic({
  chapter,
  meta,
  terrain,
  result,
  reward,
  nextTitle,
  onNext,
  onMap,
}: {
  chapter: Chapter;
  meta: ChapterMeta;
  terrain: TerrainKind;
  result: BattleResult;
  reward: Reward;
  nextTitle: string | null;
  onNext: () => void;
  onMap: () => void;
}) {
  const scene = SCENE[terrain] ?? DEFAULT_SCENE;
  const story = chapterOutro(meta, result.outcome);
  const lines = chapter.dialogue.slice(0, 3);
  const facts = chapter.archives.map((id) => archiveById(id)).filter(Boolean);
  const loot = [
    ...(reward.cards ?? []).map((c) => `Carta · ${cardName(c)}`),
    ...(reward.accessories ?? []).map((a) => `Acessório · ${accessoryById(a)?.name ?? a}`),
    ...(reward.techs ?? []).map((t) => `Tecnologia · ${techById(t)?.name ?? t}`),
    ...(reward.research ? [`+${reward.research} pesquisa`] : []),
    ...(reward.sovereigns ? [`+${reward.sovereigns} Sovereigns`] : []),
    ...(reward.xp ? [`+${reward.xp} XP`] : []),
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-2 p-2 sm:gap-3 sm:p-3">
      {/* Cabeçalho do capítulo — como a capa de um gibi */}
      <header className="flex shrink-0 items-end justify-between gap-3 border-b-4 border-primary pb-1">
        <div className="min-w-0">
          <p className="label-mono text-primary">
            {chapter.act} · Capítulo {meta.number}
          </p>
          <h1 className="truncate font-display text-3xl font-black uppercase leading-none sm:text-5xl">
            {chapter.title}
          </h1>
        </div>
        <span className="shrink-0 border-2 border-fact px-2 py-1 font-display text-lg font-black uppercase text-fact sm:text-2xl">
          Vitória
        </span>
      </header>

      {/* Quadros do gibi */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 sm:gap-3">
        <Panel className="col-span-2 sm:col-span-1">
          <SceneArt scene={scene} title={chapter.title} place={chapter.place} era={chapter.era} />
          <Caption>{chapter.summary}</Caption>
        </Panel>

        <div className="col-span-2 flex min-h-0 flex-col gap-2 sm:col-span-1 sm:gap-3">
          {lines.map((l, i) => (
            <Panel key={i} className="min-h-0 flex-1">
              <Speech speaker={l.speaker} kind={l.kind}>
                {l.text}
              </Speech>
            </Panel>
          ))}
        </div>

        <Panel className="col-span-2">
          <Caption>{story}</Caption>
          {loot.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {loot.map((l) => (
                <span key={l} className="font-mono text-[11px] uppercase text-fact">
                  {l}
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Fatos da narrativa — a verdade histórica por trás do quadro */}
      {facts.length > 0 && (
        <section className="shrink-0 border-t-4 border-primary pt-1.5">
          <p className="label-mono mb-1 text-primary">Fatos por trás da história</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {facts.map((f) => (
              <div key={f.id} className="border border-border bg-card/60 p-2">
                <div className="mb-1 flex items-center gap-2">
                  <EvidenceBadge kind={f.kind} />
                  <span className="font-mono text-[10px] text-muted-foreground">{f.date}</span>
                </div>
                <p className="font-display text-sm font-bold uppercase leading-tight">{f.title}</p>
                <p className="mt-0.5 line-clamp-3 font-serif text-xs text-foreground/85">{f.text}</p>
                {f.source && (
                  <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
                    {f.source}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Avanço */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <button
          onClick={onMap}
          className="border border-border px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
        >
          Voltar ao mapa
        </button>
        <button
          onClick={onNext}
          className="bg-primary px-8 py-3 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground shadow-brass transition hover:brightness-110"
        >
          {nextTitle ? `Próxima missão · ${nextTitle}` : "Concluir campanha"}
        </button>
      </div>
    </div>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border-2 border-foreground/80 bg-card p-2.5 shadow-[4px_4px_0_0_oklch(0.12_0.01_90/0.6)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="relative z-10 border-l-4 border-primary bg-background/85 px-2 py-1 font-serif text-sm italic leading-snug text-foreground/95">
      {children}
    </p>
  );
}

function Speech({
  speaker,
  kind,
  children,
}: {
  speaker: string;
  kind?: "fato" | "documento" | "ficcao" | undefined;
  children: React.ReactNode;
}) {
  const tone =
    kind === "fato"
      ? "border-fact"
      : kind === "documento"
        ? "border-doc"
        : kind === "ficcao"
          ? "border-fiction"
          : "border-foreground/70";
  return (
    <div className="flex h-full flex-col justify-center gap-1">
      <span className="label-mono text-primary">{speaker}</span>
      <div className={cn("relative border-2 bg-background/70 px-2.5 py-1.5", tone)}>
        <p className="font-serif text-sm leading-snug text-foreground/95">{children}</p>
      </div>
    </div>
  );
}

// Ilustração de cena desenhada em SVG: silhueta de teatro militar que muda com o
// terreno, com retícula de gibi (halftone) e raios de tensão ao fundo.
function SceneArt({
  scene,
  title,
  place,
  era,
}: {
  scene: { sky: string; ground: string; ink: string };
  title: string;
  place: string;
  era: string;
}) {
  return (
    <div className="relative h-28 w-full overflow-hidden sm:h-36">
      <svg viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <pattern id="halftone" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.9" fill={scene.ink} opacity="0.5" />
            <circle cx="4.5" cy="4.5" r="0.9" fill={scene.ink} opacity="0.5" />
          </pattern>
          <radialGradient id="sceneBurst" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="oklch(0.85 0.12 78)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="oklch(0.85 0.12 78)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="200" height="90" fill={scene.sky} />
        <rect width="200" height="90" fill="url(#halftone)" />
        <circle cx="100" cy="34" r="46" fill="url(#sceneBurst)" />
        {/* skyline / crista */}
        <path
          d="M0 62 L20 52 L34 60 L52 44 L70 58 L92 46 L112 60 L134 48 L156 62 L178 50 L200 62 L200 90 L0 90 Z"
          fill={scene.ink}
          opacity="0.55"
        />
        <rect y="62" width="200" height="28" fill={scene.ground} />
        <rect y="62" width="200" height="28" fill="url(#halftone)" />
        {/* silhuetas de soldados avançando */}
        {[40, 62, 84, 108, 132, 156].map((x, i) => (
          <g key={x} transform={`translate(${x} ${74 + (i % 2) * 3})`} fill={scene.ink}>
            <circle cx="0" cy="-6" r="3" />
            <rect x="-2.4" y="-3" width="4.8" height="8" rx="1.4" />
            <rect x="-2.4" y="4.6" width="2" height="4.4" rx="0.8" />
            <rect x="0.6" y="4.6" width="2" height="4.4" rx="0.8" />
            <line x1="2" y1="-2" x2="9" y2="-4" stroke={scene.ink} strokeWidth="1" />
          </g>
        ))}
      </svg>
      <span className="absolute left-1.5 top-1.5 bg-background/85 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
        {place} · {era}
      </span>
      <span className="absolute bottom-1 right-1.5 max-w-[70%] truncate bg-foreground px-1.5 py-0.5 font-display text-xs font-black uppercase text-background">
        {title}
      </span>
    </div>
  );
}
