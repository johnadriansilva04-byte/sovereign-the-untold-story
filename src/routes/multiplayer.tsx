import { createFileRoute } from "@tanstack/react-router";

import { MultiplayerScreen } from "@/components/pvp/MultiplayerScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/multiplayer")({
  head: () =>
    pageHead(
      "Multiplayer",
      "PvP de SOVEREIGN: partidas rápidas, cenários históricos e apostas de cartas entre comandantes.",
    ),
  component: MultiplayerScreen,
});
