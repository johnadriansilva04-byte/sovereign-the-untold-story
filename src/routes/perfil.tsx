import { createFileRoute } from "@tanstack/react-router";
import { GameShell, PageTitle, Panel, pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/perfil")({
  head: () => pageHead("Perfil", "Perfil — SOVEREIGN"),
  component: Page,
});

function Page() {
  return (
    <GameShell>
      <PageTitle kicker="SOVEREIGN" title="Perfil" />
      <Panel title="Em construção"><p className="text-muted-foreground">Esta tela será construída na próxima etapa.</p></Panel>
    </GameShell>
  );
}
