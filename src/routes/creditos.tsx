import { createFileRoute } from "@tanstack/react-router";

import { CreditsScreen } from "@/components/game/CreditsScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/creditos")({
  head: () =>
    pageHead(
      "Créditos",
      "Créditos de SOVEREIGN: Variant, a homenagem à Força Expedicionária Brasileira e as fontes históricas da campanha.",
    ),
  component: CreditsScreen,
});
