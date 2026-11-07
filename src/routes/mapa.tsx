import { createFileRoute } from "@tanstack/react-router";

import { MapScreen } from "@/components/game/MapScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/mapa")({
  head: () =>
    pageHead(
      "Mapa-múndi",
      "Mapa geopolítico de SOVEREIGN: países, províncias estratégicas, relações e o caminho para a batalha.",
    ),
  component: MapScreen,
});
