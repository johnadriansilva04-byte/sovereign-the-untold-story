import { createFileRoute } from "@tanstack/react-router";

import { CampaignScreen } from "@/components/campaign/CampaignScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/campanha")({
  head: () =>
    pageHead(
      "Campanha",
      "Campanha narrativa de SOVEREIGN: da guerra híbrida de hoje aos pracinhas da FEB, capítulo por capítulo, batalha por batalha.",
    ),
  component: CampaignScreen,
});
