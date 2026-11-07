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
    <GameShell>
      <PageTitle kicker="SOVEREIGN" title="Dossiê do projeto" />
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Documentação de desenvolvimento do jogo: o que está sendo construído, o que ainda precisa
        ser feito e qual é o objetivo de cada sistema.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {DOCS.map((d) => (
          <Panel key={d.id} title={d.title}>
            <p className="text-sm text-muted-foreground">{d.summary}</p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              docs/{d.id}.md
            </p>
          </Panel>
        ))}
      </div>
    </GameShell>
  );
}
