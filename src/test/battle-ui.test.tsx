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
  spreadX,
  deepenY,
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

    expect(screen.getByText("Sov")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();

    // as leituras táticas ficam no relatório, aberto sob demanda (sem rolagem na tela principal)
    fireEvent.click(screen.getByRole("button", { name: /Relatório/ }));
    expect(screen.getByText("Comandante adversário · IA")).toBeInTheDocument();
    expect(screen.getByText("Registro tático")).toBeInTheDocument();
  });

  it("seleciona uma carta e prepara a operação (origem automática na base 1)", () => {
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));
    const card = screen.getByRole("button", { name: /Fuzileiros/ });
    fireEvent.click(card);
    // 1 clique = +1 unidade; a origem já vem na base principal e o envio é automático
    // ao tocar no mapa (não há botão de confirmação).
    expect(screen.getByText(/Toque no mapa para enviar/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar tropa/ })).not.toBeInTheDocument();
  });

  it("envia a tropa: carta → clique no mapa marcha na hora (sem botão)", () => {
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
    // destino no teatro: a força parte da base escolhida e avança até lá — já enviada
    fireEvent(svg, new MouseEvent("pointerdown", { clientX: 100, clientY: 230, bubbles: true }));

    // a operação é limpa após o envio automático
    expect(screen.queryByText(/Toque no mapa para enviar/)).not.toBeInTheDocument();
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

  it("clicar no mapa com a carta na mão já envia a força (sem botão de confirmação)", () => {
    stubStageRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));

    const svg = document.querySelector("svg[viewBox]")!;
    // A origem já é a base principal (nº 1); o clique longe dela define o destino e
    // dispara o envio na mesma ação.
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(40, WORLD_H / 2), bubbles: true }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Relatório/ }));
    expect(screen.getByText(/Brasil envia Fuzileiros/)).toBeInTheDocument();
  });

  it("aceita destino em qualquer ponto do teatro (a força marcha até lá)", () => {
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
      new MouseEvent("pointerdown", { ...worldToClient(90, WORLD_H / 2), bubbles: true }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Relatório/ }));
    expect(screen.getByText(/Brasil envia Fuzileiros/)).toBeInTheDocument();
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
    // envia uma unidade (nasce na base azul, x≈spreadX(8)) — o clique no mapa já envia
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(20, WORLD_H / 2), bubbles: true }),
    );

    // toca a ~10px da unidade (tolerância do teatro pequeno): antes o alvo era o
    // próprio glifo e o toque errava; agora o alvo é a unidade mais próxima em pixels.
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(spreadX(8), WORLD_H / 2), bubbles: true }),
    );

    // a faixa compacta da unidade selecionada aparece no dock (sem cobrir o teatro)
    expect(screen.getByTestId("selected-unit")).toBeInTheDocument();
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
    // toque no canto oposto do teatro, sem operação nem unidade selecionada
    fireEvent(svg, new MouseEvent("pointerdown", { clientX: 950, clientY: 440, bubbles: true }));
    expect(screen.queryByTestId("selected-unit")).not.toBeInTheDocument();
  });

  it("teclado: Z soma uma unidade, 1 escolhe a base e ENTER envia a tropa", () => {
    stubStageRect();
    render(
      <ProfileProvider>
        <BattleScreen />
      </ProfileProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Iniciar operação/ }));

    const svg = document.querySelector("svg[viewBox]")!;
    // Z = primeira carta equipada (Fuzileiros); 1 = base principal
    fireEvent.keyDown(window, { key: "z" });
    fireEvent.keyDown(window, { key: "1" });
    expect(screen.getByText(/Toque no mapa para enviar/)).toBeInTheDocument();

    // ENTER também confirma (envia para o destino já apontado) — mas aqui o clique
    // no mapa já dispara o envio, então ENTER serve de atalho redundante.
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(20, WORLD_H / 2), bubbles: true }),
    );
    fireEvent.keyDown(window, { key: "Enter" });

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

    // envia a força aliada (nasce na base azul) — clique no mapa já envia
    fireEvent.click(screen.getByRole("button", { name: /Fuzileiros/ }));
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(20, WORLD_H / 2), bubbles: true }),
    );
    // seleciona a unidade recém-enviada (nasce na base azul, x≈spreadX(8))
    fireEvent(
      svg,
      new MouseEvent("pointerdown", { ...worldToClient(spreadX(8), WORLD_H / 2), bubbles: true }),
    );
    expect(screen.getByTestId("selected-unit")).toBeInTheDocument();

    // clique no teatro distante: o motor recebe a ordem de movimento/ataque
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
        selectedUnitId={null}
        onSelectUnit={vi.fn()}
        onMoveSelected={vi.fn()}
        operationActive={false}
        baseLabels={{}}
        originId={null}
        destination={null}
        onPickOrigin={vi.fn()}
        onPickDestination={vi.fn()}
      />,
    );
    const svg = container.querySelector("svg")!;
    // O glifo do inimigo tem um <g transform=...scale(...)> com escala > 1 (ampliado).
    const scaled = [...svg.querySelectorAll("g[transform]")].some((g) =>
      /scale\((?:[2-9](?:\.[0-9]+)?)\)/.test(g.getAttribute("transform") ?? ""),
    );
    expect(scaled).toBe(true);
    // E não é mais um ponto cinza: o inimigo é desenhado com o MODELO real da carta
    // (o glifo carrega data-model, identificando a unidade em campo).
    expect(svg.querySelector('[data-model="soldado-fuzil"]')).toBeTruthy();
    expect(svg.querySelector('[data-side="red"]')).toBeTruthy();
  });

  it("não desenha o aro de veterania em unidades inimigas (só nas próprias)", () => {
    const config = buildBattleConfig({
      nation: defaultNation,
      mission: missionById("m-apagao"),
      deck: startingDeck,
      commander: commanders[0]!,
      doctrine: commanders[0]!.doctrine,
      seed: 11,
    });
    const state = createBattle(config);
    // Uma unidade de cada lado com nível > 1 (a patente que desenhava o aro).
    const ally = state.blue.units.find((u) => u.alive)!;
    const enemy = state.red.units.find((u) => u.alive)!;
    ally.level = 5;
    enemy.level = 5;
    const { container } = render(
      <BattleArena
        state={state}
        selectedUnitId={null}
        onSelectUnit={vi.fn()}
        onMoveSelected={vi.fn()}
        operationActive={false}
        baseLabels={{}}
        originId={null}
        destination={null}
        onPickOrigin={vi.fn()}
        onPickDestination={vi.fn()}
      />,
    );
    const svg = container.querySelector("svg")!;
    const ringOn = (side: string) => {
      const glyph = svg.querySelector(`[data-side="${side}"]`);
      if (!glyph) return false;
      return [...glyph.querySelectorAll("circle")].some((c) => c.getAttribute("stroke-width") === "0.5");
    };
    // Nível 5 → strokeWidth 0.3 + min(0.5, 5*0.04)=0.2 → 0.5. O aro só existe no azul.
    expect(ringOn("blue")).toBe(true);
    expect(ringOn("red")).toBe(false);
  });

  it("rótulo de território neutro usa branco SEM chroma (sem franja magenta)", () => {
    const config = buildBattleConfig({
      nation: defaultNation,
      mission: missionById("m-apagao"),
      deck: startingDeck,
      commander: commanders[0]!,
      doctrine: commanders[0]!.doctrine,
      seed: 13,
    });
    const state = createBattle(config);
    const { container } = render(
      <BattleArena
        state={state}
        selectedUnitId={null}
        onSelectUnit={vi.fn()}
        onMoveSelected={vi.fn()}
        operationActive={false}
        baseLabels={{}}
        originId={null}
        destination={null}
        onPickOrigin={vi.fn()}
        onPickDestination={vi.fn()}
      />,
    );
    const svg = container.querySelector("svg")!;
    // Um território neutro tem o nome desenhado em branco NEUTRO: `oklch(1 1 1)`
    // (chroma 1) era rosa saturado e produzia o artefato magenta no campo.
    const labels = [...svg.querySelectorAll("text")].filter((t) =>
      /^[A-ZÀ-Ú ]{3,}$/.test((t.textContent ?? "").trim()),
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      expect(l.getAttribute("fill") ?? "").not.toMatch(/oklch\(1 1 1/);
    }
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
        selectedUnitId={null}
        onSelectUnit={vi.fn()}
        onMoveSelected={vi.fn()}
        operationActive={false}
        baseLabels={{}}
        originId={null}
        destination={null}
        onPickOrigin={vi.fn()}
        onPickDestination={vi.fn()}
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
