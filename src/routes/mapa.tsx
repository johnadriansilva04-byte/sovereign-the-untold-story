import { createFileRoute } from "@tanstack/react-router";
import { GameShell, PageTitle, Panel, pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/mapa")({
  head: () => pageHead("Mapa múndi", "Mapa múndi — SOVEREIGN"),
  component: Page,
});

function Page() {
  return (
    <GameShell>
      <PageTitle kicker="SOVEREIGN" title="Mapa múndi" />
      <Panel title="Em construção"><p className="text-muted-foreground">Esta tela será construída na próxima etapa.</p></Panel>
    </GameShell>
  );
}
