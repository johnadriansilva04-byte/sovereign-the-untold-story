import { createFileRoute } from "@tanstack/react-router";

import { NationScreen } from "@/components/progress/NationScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/nacao")({
  head: () =>
    pageHead(
      "Nação",
      "Administração nacional de SOVEREIGN: tecnologia, indústria, logística e moral.",
    ),
  component: NationScreen,
});
