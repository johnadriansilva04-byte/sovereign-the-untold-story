import { createFileRoute } from "@tanstack/react-router";

import { GameShell, pageHead } from "@/components/game/shell";
import { BattleScreen } from "@/components/battle/BattleScreen";
import type { Difficulty } from "@/game/progress/catalog";

const DIFFICULTIES = ["recruta", "veterano", "elite", "soberano", "llm"] as const;

export const Route = createFileRoute("/batalha")({
  head: () =>
    pageHead("Batalha", "Batalha tática — arena, cartas, Energia e consequências na guerra."),
  validateSearch: (
    search: Record<string, unknown>,
  ): { missao?: string; dificuldade?: Difficulty } => {
    const out: { missao?: string; dificuldade?: Difficulty } = {};
    if (typeof search["missao"] === "string") out.missao = search["missao"];
    if (
      typeof search["dificuldade"] === "string" &&
      (DIFFICULTIES as readonly string[]).includes(search["dificuldade"])
    ) {
      out.dificuldade = search["dificuldade"] as Difficulty;
    }
    return out;
  },
  component: Page,
});

function Page() {
  const { missao, dificuldade } = Route.useSearch();
  return (
    <GameShell full>
      <BattleScreen initialMissionId={missao} initialDifficulty={dificuldade} />
    </GameShell>
  );
}
