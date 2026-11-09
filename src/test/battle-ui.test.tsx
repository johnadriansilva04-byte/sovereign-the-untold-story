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

    expect(screen.getByText("Energia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();

    // as leituras táticas ficam no relatório, aberto sob demanda (sem rolagem na tela principal)
    fireEvent.click(screen.getByRole("button", { name: /Relatório/ }));
    expect(screen.getByText("Comandante adversário · IA")).toBeInTheDocument();
    expect(screen.getByText("Registro tático")).toBeInTheDocument();
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
    // ao selecionar, aparece a instrução de posicionamento (ordem) no teatro
    expect(screen.getByText(/Clique no objetivo/)).toBeInTheDocument();
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
    // ponto no teatro: a força parte da base e avança até o objetivo
    // jsdom não tem PointerEvent; um MouseEvent com o tipo "pointerdown" carrega clientX/Y.
    fireEvent(svg, new MouseEvent("pointerdown", { clientX: 500, clientY: 850, bubbles: true }));

    // a instrução de posicionamento some após o desdobramento
    expect(screen.queryByText(/Clique no objetivo/)).not.toBeInTheDocument();
    // o registro tático confirma o desdobramento (fica no relatório, aberto sob demanda)
    fireEvent.click(screen.getByRole("button", { name: /Relatório/ }));
    expect(screen.getByText(/Brasil envia Fuzileiros/)).toBeInTheDocument();
  });

  // jsdom não calcula layout; fixamos um retângulo estável para o mapeamento de coordenadas.
  const stubSvgRect = () => {
    const proto = SVGSVGElement.prototype as unknown as {
      getBoundingClientRect: () => DOMRect;
    };
    proto.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect;
  };

  it("pré-visualiza o posicionamento válido ao mover o ponteiro sobre o território aliado", () => {
    stubSvgRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));

    const svg = document.querySelector('svg[viewBox="0 0 100 100"]')!;
    // y = 85 → dentro da zona de desdobramento azul
    fireEvent(svg, new MouseEvent("pointermove", { clientX: 500, clientY: 850, bubbles: true }));

    const ghost = screen.getByTestId("deploy-ghost");
    expect(ghost).toBeInTheDocument();
    expect(ghost.getAttribute("data-valid")).toBe("true");
  });

  it("marca o posicionamento como inválido fora da zona de desdobramento", () => {
    stubSvgRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));

    const svg = document.querySelector('svg[viewBox="0 0 100 100"]')!;
    // y = 10 → território inimigo: inválido para desdobrar
    fireEvent(svg, new MouseEvent("pointermove", { clientX: 500, clientY: 100, bubbles: true }));

    expect(screen.getByTestId("deploy-ghost").getAttribute("data-valid")).toBe("false");
  });

  it("desdobra a força soltando a carta sobre o teatro (arrastar e soltar)", () => {
    stubSvgRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));

    const card = screen.getByRole("button", { name: /Fuzileiros/ });
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
    expect(screen.getByText(/Clique no objetivo/)).toBeInTheDocument();

    const svg = document.querySelector('svg[viewBox="0 0 100 100"]')!;
    fireEvent.drop(svg, { clientX: 500, clientY: 850 });

    expect(screen.queryByText(/Clique no objetivo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Relatório/ }));
    expect(screen.getByText(/Brasil envia Fuzileiros/)).toBeInTheDocument();
  });
});
