import { createFileRoute } from "@tanstack/react-router";

import { EventsScreen } from "@/components/game/EventsScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/eventos")({
  head: () =>
    pageHead(
      "Eventos e histórico",
      "Sala de situação de SOVEREIGN: eventos da guerra e o histórico das suas batalhas.",
    ),
  component: EventsScreen,
});
