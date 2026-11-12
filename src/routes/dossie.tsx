import { createFileRoute } from "@tanstack/react-router";

import { GameShell, PageTitle, Panel, pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/dossie")({
  head: () => pageHead("Dossiê do projeto", "Dossiê do projeto — SOVEREIGN"),
  component: Page,
});

const DOCS = [
  {
    id: "batalha",
    title: "Batalha tática",
    summary:
      "Desenho completo da camada de batalha: partidas de 4–6 minutos, baralho de composição militar, Pontos de Comando, terreno, doutrinas, IA que joga pelas mesmas regras e consequências na guerra.",
  },
];

function Page() {
  return (
    <GameShell full>
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-4 px-4 py-4 [@media(max-height:600px)]:gap-2 [@media(max-height:600px)]:py-2">
        <div className="shrink-0">
          <PageTitle compact kicker="SOVEREIGN" title="Dossiê do projeto" />
          <p className="text-sm text-muted-foreground">
            Documentação de desenvolvimento do jogo: o que está sendo construído, o que ainda
            precisa ser feito e qual é o objetivo de cada sistema.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {DOCS.map((d) => (
            <Panel key={d.id} title={d.title}>
              <p className="text-sm text-muted-foreground">{d.summary}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                docs/{d.id}.md
              </p>
            </Panel>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
