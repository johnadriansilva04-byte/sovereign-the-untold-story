import { createFileRoute } from "@tanstack/react-router";
import { GameShell, PageTitle, Panel, pageHead } from "@/components/game/shell";
import { chapters } from "@/game/campaign";
export const Route = createFileRoute("/campanha")({
  head: () => pageHead("Campanha", "Campanha — SOVEREIGN"),
  component: Page,
});

function Page() {
  return (
    <GameShell>
      <PageTitle kicker="SOVEREIGN" title="Campanha" />
      <div className="grid gap-4 md:grid-cols-2">{chapters.map((c) => (<Panel key={c.id} title={`${c.act} · Cap. ${c.number}`}><h3 className="text-2xl font-bold uppercase">{c.title}</h3><p className="label-mono">{c.era} · {c.place}</p><p className="mt-2 text-sm text-muted-foreground">{c.summary}</p><p className="mt-3 text-sm text-primary">Missão: {c.mission.title} — {c.mission.objective}</p></Panel>))}</div>
    </GameShell>
  );
}
