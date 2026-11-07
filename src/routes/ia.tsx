import { createFileRoute } from "@tanstack/react-router";

import { AiScreen } from "@/components/game/AiScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/ia")({
  head: () =>
    pageHead(
      "Agentes IA",
      "Comandantes e países controlados por IA em SOVEREIGN: personalidades, doutrinas e níveis de ameaça.",
    ),
  component: AiScreen,
});
