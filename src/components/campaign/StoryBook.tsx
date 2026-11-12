import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export interface StoryPage {
  /** Voz que narra a página (ex.: "Davi", "Narrador"). */
  speaker: string;
  text: string;
}

/**
 * Livro de campanha: tela escura de livro antigo, duas páginas abertas, com o texto
 * aparecendo palavra por palavra (máquina de escrever). Um clique acelera a página;
 * com a página cheia, o clique vira a folha. Nunca rola: o texto cabe na página.
 */
export function StoryBook({
  chapterLabel,
  title,
  place,
  era,
  pages,
  onFinish,
  finishLabel = "Continuar",
  children,
}: {
  chapterLabel: string;
  title: string;
  place?: string | undefined;
  era?: string | undefined;
  pages: StoryPage[];
  onFinish?: (() => void) | undefined;
  finishLabel?: string | undefined;
  children?: React.ReactNode;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [typed, setTyped] = useState(0);

  const page = pages[Math.min(pageIndex, pages.length - 1)] ?? { speaker: "", text: "" };
  const words = useMemo(() => page.text.split(/\s+/).filter(Boolean), [page.text]);
  const done = typed >= words.length;
  const last = pageIndex >= pages.length - 1;

  useEffect(() => {
    setTyped(0);
  }, [pageIndex]);

  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => {
      setTyped((n) => Math.min(words.length, n + 1));
    }, 90);
    return () => window.clearInterval(id);
  }, [done, words.length, pageIndex]);

  const advance = () => {
    if (!done) {
      setTyped(words.length);
      return;
    }
    if (!last) setPageIndex((i) => i + 1);
    else onFinish?.();
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center gap-3 px-3 py-3 [@media(max-height:600px)]:gap-1.5 [@media(max-height:600px)]:py-1.5">
      <div
        onClick={advance}
        role="button"
        tabIndex={0}
        aria-label={done ? "Virar a página" : "Acelerar o texto"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            advance();
          }
        }}
        className="hud-panel relative flex min-h-0 flex-1 cursor-pointer select-none items-stretch overflow-hidden border-2 border-primary/40 bg-[oklch(0.13_0.015_60)] p-3 text-left shadow-brass [@media(max-height:600px)]:p-2"
      >
        {/* Lombada do livro */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-2 left-1/2 hidden w-px -translate-x-1/2 bg-primary/25 sm:block"
        />
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-2">
          <header className="shrink-0 border-b border-primary/25 pb-2">
            <p className="label-mono text-primary/80">{chapterLabel}</p>
            <h1 className="truncate font-display text-2xl font-black uppercase leading-none text-[oklch(0.86_0.05_85)] [@media(max-height:600px)]:text-xl">
              {title}
            </h1>
            {(place || era) && (
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary/60">
                {[place, era].filter(Boolean).join(" · ")}
              </p>
            )}
          </header>

          {/* Página: o texto cresce aqui dentro, nunca empurra a tela */}
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-hidden">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/70">
              {page.speaker}
            </p>
            <p className="font-serif text-lg italic leading-snug text-[oklch(0.88_0.04_85)] [@media(max-height:600px)]:text-base">
              {words.slice(0, typed).join(" ")}
              <span
                aria-hidden
                className={cn(
                  "ml-0.5 inline-block w-2 align-baseline text-primary",
                  done ? "animate-flicker" : "",
                )}
              >
                ▍
              </span>
            </p>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-primary/20 pt-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary/60">
              Página {pageIndex + 1} / {pages.length}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary/60">
              {done ? (last ? "Fim do relato" : "Clique para virar") : "Clique para acelerar"}
            </span>
          </footer>
        </div>
      </div>

      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
