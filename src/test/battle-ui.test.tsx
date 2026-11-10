import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BattleArena } from "@/components/battle/BattleArena";
import { BattlePrep } from "@/components/battle/BattlePrep";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { commanders, startingDeck } from "@/game/battle/catalog";
import { createBattle, deploy } from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import {
  cameraFor,
  orientationFor,
  screenToWorld,
  worldToScreen,
  WORLD_W,
  WORLD_H,
} from "@/game/battle/world";
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
    // jsdom não calcula layout; o stub do palco (contêiner em perspectiva) dá um
    // retângulo estável para o mapeamento de coordenadas.
    stubStageRect();

    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));

    const svg = document.querySelector("svg[viewBox]")!;
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));
    // ponto no teatro: a força parte da base e avança até o objetivo
    // jsdom não tem PointerEvent; um MouseEvent com o tipo "pointerdown" carrega clientX/Y.
    fireEvent(svg, new MouseEvent("pointerdown", { clientX: 100, clientY: 230, bubbles: true }));

    // a instrução de posicionamento some após o desdobramento
    expect(screen.queryByText(/Clique no objetivo/)).not.toBeInTheDocument();
    // o registro tático confirma o desdobramento (fica no relatório, aberto sob demanda)
    fireEvent.click(screen.getByRole("button", { name: /Relatório/ }));
    expect(screen.getByText(/Brasil envia Fuzileiros/)).toBeInTheDocument();
  });

  // jsdom não calcula layout; fixamos um retângulo estável para o mapeamento de coordenadas.
  // O mapeamento lê o PALCO (o contêiner em perspectiva). Patchamos a prototype para
  // valer mesmo antes do render e devolver o stub só para o palco.
  const stubStageRect = () => {
    const proto = HTMLElement.prototype as unknown as {
      getBoundingClientRect: () => DOMRect;
    };
    const orig = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: HTMLElement) {
      if (this.getAttribute?.("data-testid") === "battle-stage") {
        return {
          left: 0,
          top: 0,
          width: 1000,
          height: 460,
          right: 1000,
          bottom: 460,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return orig.call(this);
    };
  };

  // A câmera do teatro é uma perspectiva de cima (rotateX). Para clicar num ponto
  // do MUNDO nos testes, projetamos esse ponto no pixel de tela correspondente
  // usando a mesma matemática do componente (palco stub 1000×460).
  const worldToClient = (wx: number, wy: number) => {
    const s = worldToScreen(wx, wy, 1000, 460);
    return { clientX: s.x, clientY: s.y };
  };

  it("pré-visualiza o posicionamento válido ao mover o ponteiro sobre o território aliado", () => {
    stubStageRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));

    const svg = document.querySelector("svg[viewBox]")!;
    // x = 10 → dentro da zona de desdobramento azul (oeste)
    fireEvent(
      svg,
      new MouseEvent("pointermove", { ...worldToClient(10, WORLD_H / 2), bubbles: true }),
    );

    const ghost = screen.getByTestId("deploy-ghost");
    expect(ghost).toBeInTheDocument();
    expect(ghost.getAttribute("data-valid")).toBe("true");
  });

  it("marca o posicionamento como válido em qualquer ponto do teatro (a força marcha até lá)", () => {
    stubStageRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));

    const svg = document.querySelector("svg[viewBox]")!;
    // x = 90 → território inimigo: o motor aceita a ordem (a força parte da base e avança)
    fireEvent(
      svg,
      new MouseEvent("pointermove", { ...worldToClient(90, WORLD_H / 2), bubbles: true }),
    );

    expect(screen.getByTestId("deploy-ghost").getAttribute("data-valid")).toBe("true");
  });

  it("seleciona a unidade aliada tocando perto dela (alvo tolerante em teatro pequeno)", () => {
    stubStageRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));

    const svg = document.querySelector("svg[viewBox]")!;
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));
    // desdobra na própria metade; a força nasce na base azul (x≈8)
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(10, WORLD_H / 2), bubbles: true }),
    );

    // toca a ~10px da unidade (tolerância do teatro pequeno): antes o alvo era o
    // próprio glifo e o toque errava; agora o alvo é a unidade mais próxima em pixels.
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(10.8, WORLD_H / 2), bubbles: true }),
    );

    // a faixa compacta da unidade selecionada aparece no dock (sem cobrir o teatro)
    expect(screen.getByText("Fuzileiros")).toBeInTheDocument();
    // e o teatro continua visível: a faixa NÃO é um painel sobreposto à arena
    expect(document.querySelector("svg[viewBox]")).toBeInTheDocument();
  });

  it("não seleciona nada quando o toque fica longe de qualquer unidade", () => {
    stubStageRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));

    const svg = document.querySelector("svg[viewBox]")!;
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));
    fireEvent(svg, new MouseEvent("pointerdown", { clientX: 100, clientY: 230, bubbles: true }));
    // tira a seleção (a carta não está mais na mão)
    expect(screen.queryByText("Fuzileiros")).not.toBeInTheDocument();

    // toque no canto oposto do teatro: longe demais de qualquer unidade aliada
    fireEvent(svg, new MouseEvent("pointerdown", { clientX: 950, clientY: 440, bubbles: true }));
    expect(screen.queryByText("Fuzileiros")).not.toBeInTheDocument();
  });

  it("desdobra a força soltando a carta sobre o teatro (arrastar e soltar)", () => {
    stubStageRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));

    const card = screen.getByRole("button", { name: /Fuzileiros/ });
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
    expect(screen.getByText(/Clique no objetivo/)).toBeInTheDocument();

    const svg = document.querySelector("svg[viewBox]")!;
    fireEvent.drop(svg, { clientX: 100, clientY: 230 });

    expect(screen.queryByText(/Clique no objetivo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Relatório/ }));
    expect(screen.getByText(/Brasil envia Fuzileiros/)).toBeInTheDocument();
  });

  it("clicar num inimigo manda a unidade selecionada atacá-lo", () => {
    stubStageRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));
    const svg = document.querySelector("svg[viewBox]")!;

    // desdobra a força aliada (nasce na base azul, x≈8)
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(10, WORLD_H / 2), bubbles: true }),
    );
    // seleciona a unidade recém-desdobrada
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(10.8, WORLD_H / 2), bubbles: true }),
    );
    expect(screen.getByText("Fuzileiros")).toBeInTheDocument();

    // clique no inimigo (longe da unidade aliada): o motor recebe a ordem de ataque
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(90, WORLD_H / 2), bubbles: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Relatório/ }));
    expect(screen.getByText(/reposiciona/i)).toBeInTheDocument();
  });

  it("desenha o inimigo com o modelo real (não um ponto cinza) e ampliado", () => {
    const config = buildBattleConfig({
      nation: defaultNation,
      mission: missionById("m-apagao"),
      deck: startingDeck,
      commander: commanders[0]!,
      doctrine: commanders[0]!.doctrine,
      seed: 3,
    });
    const state = createBattle(config);
    state.red.command = 999;
    state.red.deck.hand[0] = { cardId: "inf-fuzileiros", ready: true };
    deploy(state, "red", "inf-fuzileiros", 50, WORLD_H / 2, { x: 50, y: WORLD_H / 2 });
    const { container } = render(
      <BattleArena
        state={state}
        pendingCardId={null}
        pendingIsGlobal={false}
        selectedUnitId={null}
        onPlace={vi.fn()}
        onSelectUnit={vi.fn()}
        onMoveSelected={vi.fn()}
        onSelectPoint={vi.fn()}
      />,
    );
    const svg = container.querySelector("svg")!;
    // O glifo do inimigo tem um <g transform=...scale(...)> com escala > 1 (ampliado).
    const scaled = [...svg.querySelectorAll("g[transform]")].some((g) =>
      /scale\((?:[2-9](?:\.[0-9]+)?)\)/.test(g.getAttribute("transform") ?? ""),
    );
    expect(scaled).toBe(true);
    // E não é mais um ponto cinza: o texto do rótulo (short) do inimigo aparece.
    expect(svg.textContent ?? "").toContain("FUZ");
  });

  it("desenha o teatro com câmera em perspectiva alinhada, sem mudar a lógica", () => {
    const config = buildBattleConfig({
      nation: defaultNation,
      mission: missionById("m-apagao"),
      deck: startingDeck,
      commander: commanders[0]!,
      doctrine: commanders[0]!.doctrine,
      seed: 5,
    });
    const state = createBattle(config);
    const { container } = render(
      <BattleArena
        state={state}
        pendingCardId={null}
        pendingIsGlobal={false}
        selectedUnitId={null}
        onPlace={vi.fn()}
        onSelectUnit={vi.fn()}
        onMoveSelected={vi.fn()}
        onSelectPoint={vi.fn()}
      />,
    );
    const stage = container.querySelector('[data-testid="battle-stage"]') as HTMLElement;
    expect(stage).toBeTruthy();
    const svg = container.querySelector("svg")!;
    // A câmera é uma matriz afim do SVG (vista de cima, alinhada). Sem CSS `perspective`
    // nem `rotateX` — aquele caminho era frágil e esticava o campo quando o navegador
    // descartava a transform inválida.
    const style = svg.getAttribute("style") ?? "";
    expect(style).not.toMatch(/perspective\(/);
    expect(style).not.toMatch(/rotateX\(/);
    // a cena recebe a matriz da câmera (escala uniforme; giro só em retrato)
    const scene = svg.querySelector("g[transform^='matrix(']")!;
    expect(scene).toBeTruthy();
    // o mapeamento palco↔mundo é inverso exato (o toque cai onde o jogador aponta)
    for (const [wx, wy] of [
      [8, 23],
      [50, 10],
      [92, 40],
    ] as const) {
      const s = worldToScreen(wx, wy, 1000, 460);
      const back = screenToWorld(s.x, s.y, 1000, 460);
      expect(back.x).toBeCloseTo(wx, 6);
      expect(back.y).toBeCloseTo(wy, 6);
    }
  });

  // O campo encaixa no palco com escala UNIFORME (nada esticado) e, em palco retrato
  // (celular em pé), é girado 90° para ficar "de pé" — sem cortar bordas em nenhum caso.
  it("a câmera encaixa o campo sem deformar e gira em retrato", () => {
    const sizes = [
      [1440, 699, "landscape"],
      [1280, 519, "landscape"],
      [390, 641, "portrait"],
      [390, 780, "portrait"],
      [844, 390, "landscape"],
      [1920, 900, "landscape"],
    ] as const;
    for (const [w, h, orient] of sizes) {
      expect(orientationFor(w, h)).toBe(orient);
      const cam = cameraFor(w, h);
      const corners = [
        [0, 0],
        [WORLD_W, 0],
        [0, WORLD_H],
        [WORLD_W, WORLD_H],
      ] as const;
      const pts = corners.map(([wx, wy]) => worldToScreen(wx, wy, w, h));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      // sem estourar o palco
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.5);
      expect(Math.max(...xs)).toBeLessThanOrEqual(w + 0.5);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.5);
      expect(Math.max(...ys)).toBeLessThanOrEqual(h + 0.5);
      // escala UNIFORME: o campo mantém a proporção real, sem esticar (em retrato o
      // campo está girado, então a razão em pixels é invertida).
      const wpx = Math.max(...xs) - Math.min(...xs);
      const hpx = Math.max(...ys) - Math.min(...ys);
      const expected = orient === "portrait" ? WORLD_H / WORLD_W : WORLD_W / WORLD_H;
      expect(wpx / hpx).toBeCloseTo(expected, 3);
      // e preenche a dimensão que limita o encaixe (>= 95%), sem transbordar a outra
      expect(wpx / w).toBeLessThanOrEqual(1.001);
      expect(hpx / h).toBeLessThanOrEqual(1.001);
      expect(Math.max(wpx / w, hpx / h)).toBeGreaterThan(0.95);
      expect(cam.orientation).toBe(orient);
    }
  });
});
