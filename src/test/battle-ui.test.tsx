import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BattlePrep } from "@/components/battle/BattlePrep";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { ProfileProvider } from "@/game/progress/store";
import { createProfile } from "@/game/progress/profile";

// A batalha usa requestAnimationFrame; em jsdom ele existe, mas controlamos o tempo
// para o teste ser determinístico e não depender do relógio real.
describe("interface da batalha", () => {
  it("renderiza a preparação com missões, cartas, comandantes e doutrinas", () => {
    render(<BattlePrep profile={createProfile()} onStart={vi.fn()} />);
    expect(screen.getByText("Preparação para a batalha")).toBeInTheDocument();
    expect(screen.getByText("Baralho de composição militar")).toBeInTheDocument();
    expect(screen.getByText("Comandante")).toBeInTheDocument();
    expect(screen.getByText("Doutrina militar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Iniciar operação/ })).toBeInTheDocument();
  });

  it("monta a partida viva sem erro e mostra HUD, cartas e comandante adversário", () => {
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    // avança da preparação para a batalha
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));

    expect(screen.getByText("Pontos de Comando")).toBeInTheDocument();
    expect(screen.getByText("Comandante adversário · IA")).toBeInTheDocument();
    expect(screen.getByText("Registro tático")).toBeInTheDocument();
    expect(screen.getByText("Informações da unidade")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();
  });

  it("permite selecionar uma carta da mão", () => {
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));
    const card = screen.getByRole("button", { name: /Fuzileiros/ });
    fireEvent.click(card);
    // ao selecionar, aparece a instrução de posicionamento no teatro
    expect(screen.getByText(/Clique na sua zona/)).toBeInTheDocument();
  });

  it("desdobra uma unidade ao clicar na zona aliada do teatro", () => {
    // jsdom não calcula layout; fornecemos um retângulo estável para o mapeamento de coordenadas.
    const proto = SVGSVGElement.prototype as unknown as {
      getBoundingClientRect: () => DOMRect;
    };
    proto.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect;

    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));

    const svg = document.querySelector('svg[viewBox="0 0 100 100"]')!;
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));
    // ponto na metade inferior da arena = zona de desdobramento aliada
    // jsdom não tem PointerEvent; um MouseEvent com o tipo "pointerdown" carrega clientX/Y.
    fireEvent(svg, new MouseEvent("pointerdown", { clientX: 500, clientY: 850, bubbles: true }));

    expect(screen.getByText(/Brasil posiciona Fuzileiros/)).toBeInTheDocument();
    // a instrução de posicionamento some após o desdobramento
    expect(screen.queryByText(/Clique na sua zona/)).not.toBeInTheDocument();
  });
});
