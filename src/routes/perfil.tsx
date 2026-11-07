import { createFileRoute } from "@tanstack/react-router";

import { ProfileScreen } from "@/components/progress/ProfileScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/perfil")({
  head: () =>
    pageHead("Perfil", "Perfil do comandante em SOVEREIGN: progresso, inventário e sincronização."),
  component: ProfileScreen,
});
