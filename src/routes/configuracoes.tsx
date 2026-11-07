import { createFileRoute } from "@tanstack/react-router";

import { SettingsScreen } from "@/components/game/SettingsScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/configuracoes")({
  head: () =>
    pageHead(
      "Configurações",
      "Preferências de SOVEREIGN: velocidade da batalha, áudio, animações e gestão dos dados locais.",
    ),
  component: SettingsScreen,
});
