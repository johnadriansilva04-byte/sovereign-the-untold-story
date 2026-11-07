import { createFileRoute } from "@tanstack/react-router";

import { CollectionScreen } from "@/components/progress/CollectionScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/colecao")({
  head: () =>
    pageHead(
      "Coleção",
      "Cartas, acessórios e baralhos de SOVEREIGN — tudo o que você conquistou na campanha.",
    ),
  component: CollectionScreen,
});
