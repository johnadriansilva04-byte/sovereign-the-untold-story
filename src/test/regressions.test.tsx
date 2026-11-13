import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Regressões de UX/motor encontradas em campo:
//  1. O aro de veterania era desenhado em TODA unidade de nível > 1, inclusive nos
//     inimigos, poluindo o teatro com anéis em volta do adversário.
//  2. "Escolher cartas" (fim do relato) pulava o dilema do próximo capítulo e caía
//     direto no briefing; ao escolher no dilema o briefing reaparecia — tela duplicada.

vi.mock("@/components/game/shell", () => ({
  GameShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  pageHead: () => ({}),
  Logo: () => null,
}));

const fakeWin = {
  configId: "m-apagao",
  missionName: "Operação Apagão",
  outcome: "vitoria" as const,
  reason: "teste",
  duration: 60,
  territorialScore: { blue: 80, red: 20 },
  controlPoints: { blue: 1, red: 0 },
  territories: { blue: 2, red: 0 },
  structuresDestroyed: { blue: 0, red: 0 },
  losses: { blue: 1, red: 5 },
  kills: { blue: 5, red: 1 },
  pointsHeld: [],
};

vi.mock("@/components/battle/BattleScreen", () => ({
  BattleScreen: ({ onComplete }: { onComplete?: (r: unknown) => void }) => {
    if (onComplete) queueMicrotask(() => onComplete(fakeWin));
    return <div data-testid="mock-battle">batalha</div>;
  },
}));

import { CampaignScreen } from "@/components/campaign/CampaignScreen";
import { ProfileProvider } from "@/game/progress/store";

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("fluxo da campanha", () => {
  it("depois do relato, 'Escolher cartas' abre o DILEMA do próximo capítulo (sem tela duplicada)", async () => {
    render(
      <ProfileProvider>
        <CampaignScreen />
      </ProfileProvider>,
    );

    // overview → dilema → briefing → batalha → veredito → livro
    fireEvent.click(screen.getByText(/Tomar a decisão|Iniciar operação/));
    fireEvent.click(screen.getAllByText(/Escolher e partir/)[0]!);
    fireEvent.click(screen.getByText(/^Iniciar operação$/));
    await settle();
    const advance = screen.queryByText(/^Continuar$/) ?? screen.queryByText(/^Coletar$/);
    if (advance) {
      fireEvent.click(advance);
      await settle();
    }

    const pick = screen.getByText(/^Escolher cartas$/);
    fireEvent.click(pick);
    await settle();

    // O próximo capítulo tem dilema pendente: a tela de decisão aparece UMA vez (com
    // duas opções) e o briefing de cartas NÃO pode surgir por baixo dela.
    expect(screen.getAllByText(/Escolher e partir/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Cartas desta operação/)).not.toBeInTheDocument();
  });
});
