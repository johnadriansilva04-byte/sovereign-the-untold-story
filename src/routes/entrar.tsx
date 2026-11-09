import { createFileRoute } from "@tanstack/react-router";

import { EntryScreen } from "@/components/auth/EntryScreen";
import { pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/entrar")({
  head: () => pageHead("Entrar", "Entre ou crie sua conta de comandante em SOVEREIGN."),
  component: EntryScreen,
});
