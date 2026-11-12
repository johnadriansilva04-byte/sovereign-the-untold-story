import { useState } from "react";

import { GameShell, PageTitle, Panel, EvidenceBadge } from "@/components/game/shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { archives } from "@/game/campaign";

const PAGE = 6;

export function CreditsScreen() {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(archives.length / PAGE));

  return (
    <GameShell full>
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center gap-3 px-4 py-3 [@media(max-height:600px)]:gap-1.5 [@media(max-height:600px)]:py-1.5">
        <PageTitle compact kicker="Ficha técnica" title="Créditos">
          SOVEREIGN é uma obra de ficção construída sobre fatos verificáveis. Toda afirmação marcada
          como fato ou documento tem fonte; a tese que conecta esses fatos é a interpretação do
          jogo.
        </PageTitle>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 [@media(min-height:700px)]:gap-3">
          <Panel
            title="Equipe e homenagem"
            className="flex min-h-0 flex-col overflow-hidden !p-3 [@media(min-height:700px)]:!p-5"
          >
            <div className="space-y-2 overflow-hidden text-xs text-muted-foreground [@media(min-height:700px)]:space-y-3 [@media(min-height:700px)]:text-sm">
              <p>
                <b className="text-foreground">Desenvolvido por Variant.</b> Um estúdio dedicado a
                contar histórias que costumam ficar fora dos livros — e, sobretudo, a honrar a Força
                Expedicionária Brasileira.
              </p>
              <p className="[@media(max-height:620px)]:hidden">
                Aos pracinhas que embarcaram rumo à Itália, lutaram contra o fascismo e voltaram
                para um país que preferiu esquecer: esta obra é para vocês. Cerca de 25 mil
                brasileiros serviram na Itália; cerca de 450 não voltaram.
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-primary [@media(min-height:700px)]:text-[11px]">
                "A cobra vai fumar." — emblema da FEB
              </p>
            </div>
          </Panel>
        </div>

        <button
          onClick={() => setSourcesOpen(true)}
          className="flex shrink-0 items-center justify-between gap-3 border border-primary/60 bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/10"
        >
          <span className="min-w-0">
            <span className="label-mono text-primary">Fontes citadas na campanha</span>
            <span className="block truncate font-display text-sm font-bold uppercase">
              {archives.length} registros históricos
            </span>
          </span>
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-primary">
            Abrir arquivo ›
          </span>
        </button>
      </div>

      {sourcesOpen && (
        <Dialog open onOpenChange={(v) => !v && setSourcesOpen(false)}>
          <DialogContent className="max-h-[86vh] max-w-3xl overflow-hidden border-primary/40 bg-background">
            <DialogHeader>
              <DialogTitle className="text-left">
                <span className="label-mono text-primary">
                  Arquivo · {archives.length} registros
                </span>
                <span className="mt-1 block font-display text-2xl font-black uppercase leading-none">
                  Fontes citadas na campanha
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              <div className="grid gap-2 border border-border/60 p-3 sm:grid-cols-3">
                <div>
                  <EvidenceBadge kind="fato" />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Datas, números e eventos históricos verificáveis.
                  </span>
                </div>
                <div>
                  <EvidenceBadge kind="documento" />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Citações, símbolos e registros de época.
                  </span>
                </div>
                <div>
                  <EvidenceBadge kind="ficcao" />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    A narrativa que liga os fatos — tese do jogo, apresentada como ficção.
                  </span>
                </div>
              </div>
              {archives.slice(page * PAGE, page * PAGE + PAGE).map((a) => (
                <div key={a.id} className="border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold uppercase">{a.title}</span>
                    <EvidenceBadge kind={a.kind} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.text}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                    {a.date}
                    {a.source ? ` · ${a.source}` : ""}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"
              >
                ← Anterior
              </button>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                disabled={page + 1 >= totalPages}
                className="border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"
              >
                Próximo →
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </GameShell>
  );
}
