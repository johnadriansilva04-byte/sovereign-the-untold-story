import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import { canDeploy, originFor } from "@/game/battle/engine";

import {
  cameraFor,
  cameraScale,
  stageToWorld,
  uprightText,
  FIELD_H,
  FIELD_MARGIN_X,
  FIELD_MARGIN_Y,
  FIELD_W,
  WORLD_H,
  WORLD_W,
  type Camera,
} from "@/game/battle/world";
import type {
  BattleState,
  BattleUnit,
  ControlPoint,
  DeployTarget,
  EffectZone,
  Projectile,
  Side,
  Structure,
  Territory,
  VisualEffect,
} from "@/game/battle/types";

interface Props {
  state: BattleState;
  pendingCardId: string | null;
  pendingIsGlobal: boolean;
  selectedUnitId: string | null;
  onPlace: (x: number, y: number, target?: DeployTarget) => void;
  onSelectUnit: (id: string | null) => void;
  onMoveSelected: (unitId: string, x: number, y: number, target?: DeployTarget) => void;
  onSelectPoint: (pointId: string) => void;
}

const ALLY = "var(--ally)";
const ENEMY = "var(--enemy)";

const sideColor = (s: Side): string => (s === "blue" ? ALLY : ENEMY);

// Cor da insígnia de patente por nível: prata → ouro → laranja → vermelho de elite.
// Dá leitura instantânea de "esta tropa é veterana" no meio do combate.
function LEVEL_TONE(level: number): string {
  if (level >= 12) return "oklch(0.72 0.22 25)";
  if (level >= 9) return "oklch(0.8 0.18 60)";
  if (level >= 6) return "oklch(0.86 0.14 90)";
  if (level >= 3) return "oklch(0.86 0.06 220)";
  return "oklch(0.8 0.02 220)";
}

// Terreno por tipo de missão: cada fase tem um chão próprio (mata, urbano, montanha,
// rio, fortificado), em tons NATURAIS de terra — nada de brilho neon azul. As cores
// são terrosas (verde-oliva, marrom, areia, pedra) para o campo ler como território.
interface GroundPalette {
  base: string;
  accent: string;
  patch: string;
  path: string;
  detail: string;
  detailLight: string;
}
const GROUND_BY_TERRAIN: Record<string, GroundPalette> = {
  Cidade: {
    base: "oklch(0.32 0.008 90)",
    accent: "oklch(0.37 0.01 92)",
    patch: "oklch(0.28 0.006 250)",
    path: "oklch(0.45 0.008 92)",
    detail: "oklch(0.36 0.03 120)",
    detailLight: "oklch(0.42 0.04 118)",
  },
  Floresta: {
    base: "oklch(0.3 0.045 140)",
    accent: "oklch(0.35 0.055 138)",
    patch: "oklch(0.25 0.05 150)",
    path: "oklch(0.42 0.04 95)",
    detail: "oklch(0.36 0.06 138)",
    detailLight: "oklch(0.43 0.07 135)",
  },
  "Campo aberto": {
    base: "oklch(0.42 0.05 92)",
    accent: "oklch(0.47 0.055 90)",
    patch: "oklch(0.37 0.045 88)",
    path: "oklch(0.55 0.05 88)",
    detail: "oklch(0.4 0.05 100)",
    detailLight: "oklch(0.48 0.055 98)",
  },
  Montanha: {
    base: "oklch(0.4 0.018 70)",
    accent: "oklch(0.45 0.022 68)",
    patch: "oklch(0.34 0.014 66)",
    path: "oklch(0.52 0.02 72)",
    detail: "oklch(0.38 0.02 72)",
    detailLight: "oklch(0.46 0.02 74)",
  },
  "Travessia de rio": {
    base: "oklch(0.32 0.04 140)",
    accent: "oklch(0.37 0.05 138)",
    patch: "oklch(0.26 0.04 200)",
    path: "oklch(0.46 0.04 95)",
    detail: "oklch(0.37 0.055 140)",
    detailLight: "oklch(0.44 0.065 138)",
  },
  "Região fortificada": {
    base: "oklch(0.36 0.03 78)",
    accent: "oklch(0.41 0.035 76)",
    patch: "oklch(0.3 0.025 74)",
    path: "oklch(0.48 0.03 80)",
    detail: "oklch(0.35 0.035 78)",
    detailLight: "oklch(0.43 0.04 80)",
  },
};
const DEFAULT_GROUND: GroundPalette = {
  base: "oklch(0.34 0.04 140)",
  accent: "oklch(0.39 0.05 138)",
  patch: "oklch(0.29 0.04 145)",
  path: "oklch(0.46 0.04 95)",
  detail: "oklch(0.38 0.055 140)",
  detailLight: "oklch(0.45 0.065 138)",
};

// Detalhes de terreno espalhados pelo campo (tufos de grama, pedras, arbustos):
// dão identidade ao solo sem "grade" e sem brilho. Posições determinísticas para o
// mapa não "tremer" a cada quadro. O conjunto de tipos muda por terreno.
type TerrainDetail = { kind: "tuft" | "rock" | "bush"; x: number; y: number; s: number };

function terrainDetails(terrain: string): TerrainDetail[] {
  const out: TerrainDetail[] = [];
  const jitter = (n: number) => {
    const h = Math.sin(n * 78.233) * 43758.5453;
    return h - Math.floor(h);
  };
  const kinds: TerrainDetail["kind"][] =
    terrain === "Floresta"
      ? ["bush", "bush", "tuft"]
      : terrain === "Montanha"
        ? ["rock", "rock", "tuft"]
        : terrain === "Cidade"
          ? ["rock", "tuft"]
          : ["tuft", "tuft", "rock"];
  // Grade irregular que cobre todo o campo (não é grade visual: o deslocamento
  // pseudoaleatório quebra o alinhamento). Escala junto com as dimensões do mundo.
  const cols = 11;
  const rows = 7;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const n = gy * cols + gx;
      const x = (WORLD_W / cols) * (gx + 0.5) + (jitter(n) - 0.5) * (WORLD_W / cols) * 0.6;
      const y = (WORLD_H / rows) * (gy + 0.5) + (jitter(n + 100) - 0.5) * (WORLD_H / rows) * 0.6;
      if (x < 2 || x > WORLD_W - 2 || y < 2 || y > WORLD_H - 2) continue;
      out.push({ kind: kinds[n % kinds.length]!, x, y, s: 0.6 + jitter(n + 7) * 0.7 });
    }
  }
  return out;
}

function TerrainDetailGlyph({
  detail: d,
  ground,
}: {
  detail: TerrainDetail;
  ground: GroundPalette;
}) {
  if (d.kind === "rock") {
    return (
      <g transform={`translate(${d.x} ${d.y}) scale(${d.s})`}>
        <ellipse cx="0" cy="0.3" rx="1.1" ry="0.7" fill="oklch(0 0 0 / 0.18)" />
        <path
          d="M-1 0.2 L-0.4 -0.8 L0.5 -0.7 L1 0.2 Z"
          fill={ground.patch}
          stroke="oklch(1 0 0 / 0.08)"
          strokeWidth="0.1"
        />
      </g>
    );
  }
  if (d.kind === "bush") {
    return (
      <g transform={`translate(${d.x} ${d.y}) scale(${d.s})`}>
        <ellipse cx="0" cy="0.4" rx="1.2" ry="0.5" fill="oklch(0 0 0 / 0.2)" />
        <circle cx="-0.5" cy="-0.1" r="0.75" fill={ground.detail} />
        <circle cx="0.5" cy="0" r="0.7" fill={ground.detail} />
        <circle cx="0" cy="-0.5" r="0.7" fill={ground.detailLight} />
      </g>
    );
  }
  // tuft: tufo de grama
  return (
    <g
      transform={`translate(${d.x} ${d.y}) scale(${d.s})`}
      stroke={ground.detail}
      strokeWidth="0.16"
      strokeLinecap="round"
    >
      <line x1="0" y1="0.3" x2="-0.5" y2="-0.7" />
      <line x1="0" y1="0.3" x2="0" y2="-0.9" />
      <line x1="0" y1="0.3" x2="0.5" y2="-0.7" />
    </g>
  );
}

export function BattleArena({
  state,
  pendingCardId,
  pendingIsGlobal,
  selectedUnitId,
  onPlace,
  onSelectUnit,
  onMoveSelected,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Tamanho de layout do palco: alimenta a câmera (encaixe uniforme + giro em retrato).
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setStageSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Sem medida (SSR/jsdom) cai num palco padrão 16:9 — o mesmo encaixe do navegador.
  const stageW = stageSize?.w ?? 960;
  const stageH = stageSize?.h ?? 540;
  const cam: Camera = cameraFor(stageW, stageH);
  // Em retrato a cena está girada; os rótulos de texto recebem +90° para ficarem em pé.
  const portrait = cam.orientation === "portrait";
  const arena = state.config.arena;
  const ground = GROUND_BY_TERRAIN[arena.terrain] ?? DEFAULT_GROUND;
  // Pré-visualização do posicionamento: segue o cursor, mostra validade e a rota da força.
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  // O teatro é desenhado em coordenadas do mundo e a câmera é aplicada como uma
  // MATRIZ do SVG (escala uniforme, sem deformar; giro de 90° quando o palco é retrato).
  // O toque→mundo desfaz exatamente essa matriz — sem `getScreenCTM`, que erra sob 3D.
  const stageRect = () => stageRef.current?.getBoundingClientRect() ?? null;

  const toArenaCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = stageRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    // A medida real do palco pode diferir da última observada; usa a atual para a câmera.
    const live = cameraFor(rect.width, rect.height);
    return stageToWorld(live, clientX - rect.left, clientY - rect.top);
  };

  const handlePointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const coords = toArenaCoords(e.clientX, e.clientY);
    if (!coords) return;
    // Com carta na mão, o clique no teatro é uma ORDEM (desdobrar). Se o clique
    // acertou um inimigo/estrutura/território, a força já marcha para atacá-lo.
    if (pendingCardId) {
      onPlace(coords.x, coords.y, pickTarget(coords.x, coords.y));
      return;
    }
    // Sem carta: o clique sobre um inimigo manda a unidade SELECIONADA atacá-lo.
    const enemyId = pickEnemyUnit(coords.x, coords.y);
    if (selectedUnitId && enemyId) {
      const enemy = units.find((u) => u.id === enemyId);
      if (enemy) onMoveSelected(selectedUnitId, enemy.x, enemy.y, { unitId: enemyId });
      return;
    }
    // Clique sobre uma unidade ALIADA: seleciona-a (ou desmarca se já estava).
    const hitId = pickAllyUnit(coords.x, coords.y);
    if (hitId) {
      onSelectUnit(hitId === selectedUnitId ? null : hitId);
      return;
    }
    // Com uma unidade selecionada, o clique no restante do teatro é uma ORDEM de
    // movimento: ela marcha até o ponto (ou até a estrutura/território clicado).
    if (selectedUnitId) {
      onMoveSelected(selectedUnitId, coords.x, coords.y, pickTarget(coords.x, coords.y));
      return;
    }
    onSelectUnit(null);
  };

  // Unidade aliada mais próxima do ponto, dentro de uma tolerância em pixels.
  const pickAllyUnit = (ax: number, ay: number): string | null => {
    return pickUnit(ax, ay, state.blue.units);
  };

  const pickEnemyUnit = (ax: number, ay: number): string | null => {
    return pickUnit(ax, ay, state.red.units);
  };

  const pickUnit = (ax: number, ay: number, list: BattleUnit[]): string | null => {
    // Tolerância em PIXELS convertida para unidades de mundo (px por unidade).
    let unitsPerPixel = 1;
    const rect = stageRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      unitsPerPixel = 1 / cameraScale(cameraFor(rect.width, rect.height));
    }
    const tolerance = Math.max(14 * unitsPerPixel, 3.2);
    let best: { id: string; d: number } | null = null;
    for (const u of list) {
      if (!u.alive) continue;
      const d = Math.hypot(ax - u.x, ay - u.y);
      if (d <= Math.max(tolerance, u.radius + 1.6) && (!best || d < best.d)) best = { id: u.id, d };
    }
    return best?.id ?? null;
  };

  // Alvo explícito sob o ponto clicado: inimigo > estrutura > território. É o que
  // transforma "clique no chão" em "clique no objetivo" — o motor recebe o alvo e a
  // força marcha direto para cima dele.
  const pickTarget = (ax: number, ay: number): DeployTarget | undefined => {
    const enemyId = pickEnemyUnit(ax, ay);
    if (enemyId) return { unitId: enemyId };
    const struct = nearestStructure(ax, ay);
    if (struct) return { structureId: struct.id };
    const terr = nearestTerritory(ax, ay);
    if (terr) return { territoryId: terr.id };
    return undefined;
  };

  const nearestStructure = (ax: number, ay: number): Structure | null => {
    let best: { s: Structure; d: number } | null = null;
    for (const s of state.structures) {
      if (!s.alive || s.side === "blue") continue;
      const d = Math.hypot(ax - s.x, ay - s.y);
      if (d <= s.radius + 2 && (!best || d < best.d)) best = { s, d };
    }
    return best?.s ?? null;
  };

  const nearestTerritory = (ax: number, ay: number): Territory | null => {
    let best: { t: Territory; d: number } | null = null;
    for (const t of state.territories) {
      if (t.owner === "blue") continue;
      const d = Math.hypot(ax - t.x, ay - t.y);
      if (d <= t.radius + 1.5 && (!best || d < best.d)) best = { t, d };
    }
    return best?.t ?? null;
  };

  const handleMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pendingCardId) return;
    const coords = toArenaCoords(e.clientX, e.clientY);
    if (coords) setGhost({ x: coords.x, y: coords.y });
  };

  const clearGhost = () => setGhost(null);

  const units = [...state.blue.units, ...state.red.units];
  const selected = units.find((u) => u.id === selectedUnitId) ?? null;
  const pendingCard = pendingCardId
    ? state.blue.deck.hand.find((h) => h.cardId === pendingCardId)
    : null;
  void pendingCard;

  // Validade do posicionamento e rota da força — calculadas do MESMO motor que o
  // desdobramento usa, para o preview nunca mentir. O motor aceita ordem em qualquer
  // ponto do teatro (a força marcha até lá); a única recusa real é energia insuficiente
  // ou carta ausente da mão. Cartas globais (área) não têm rota de força.
  const ghostValid = ghost
    ? pendingCardId
      ? canDeploy(state, "blue", pendingCardId, ghost.x, ghost.y)
      : false
    : false;
  const ghostOrigin = ghost && !pendingIsGlobal ? originFor(state, "blue", ghost.x, ghost.y) : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Fundo do "teatro de operações": preenche os cantos que a inclinação da
          câmera expõe (o fundo do campo recua e deixa a mesa à vista). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,oklch(0.19_0.02_120),oklch(0.1_0.01_120))]"
      />
      <div
        ref={stageRef}
        data-testid="battle-stage"
        className="relative flex h-full w-full items-center justify-center"
      >
        {/* A câmera é uma MATRIZ do SVG (escala uniforme + giro em retrato), aplicada ao
            grupo da cena. O `viewBox` é o palco em pixels de layout, então o encaixe é 1:1
            e nada é esticado. O toque usa o inverso da mesma matriz. */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${stageW} ${stageH}`}
          preserveAspectRatio="xMidYMid meet"
          className={cn(
            "h-full w-full touch-none select-none",
            pendingCardId ? "cursor-crosshair" : "cursor-default",
          )}
          onPointerDown={handlePointer}
          onPointerMove={handleMove}
          onPointerLeave={clearGhost}
          onDragOver={(e) => {
            if (!pendingCardId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            const coords = toArenaCoords(e.clientX, e.clientY);
            if (coords) setGhost(coords);
          }}
          onDrop={(e) => {
            if (!pendingCardId) return;
            e.preventDefault();
            const coords = toArenaCoords(e.clientX, e.clientY);
            if (coords) onPlace(coords.x, coords.y, pickTarget(coords.x, coords.y));
            setGhost(null);
          }}
        >
          <defs>
            <linearGradient id="allyZone" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={ALLY} stopOpacity="0.16" />
              <stop offset="100%" stopColor={ALLY} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="enemyZone" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor={ENEMY} stopOpacity="0.16" />
              <stop offset="100%" stopColor={ENEMY} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="groundDepth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0 0 0)" stopOpacity="0.2" />
              <stop offset="45%" stopColor="oklch(0 0 0)" stopOpacity="0" />
              <stop offset="100%" stopColor="oklch(0 0 0)" stopOpacity="0.2" />
            </linearGradient>
            {/* Textura de solo: tufos de grama e grãos de terra, sem brilho. */}
            <pattern id="groundTex" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="4" fill="none" />
              <circle cx="0.9" cy="1" r="0.16" fill="oklch(1 0 0 / 0.05)" />
              <circle cx="2.6" cy="2.4" r="0.14" fill="oklch(0 0 0 / 0.1)" />
              <circle cx="3.4" cy="0.7" r="0.12" fill="oklch(1 0 0 / 0.035)" />
              <circle cx="1.6" cy="3.3" r="0.13" fill="oklch(0 0 0 / 0.08)" />
            </pattern>
            {/* Manchas irregulares de terreno: variam o chão sem "grade" artificial. */}
            <pattern id="groundPatches" width="24" height="24" patternUnits="userSpaceOnUse">
              <ellipse cx="6" cy="7" rx="4.5" ry="3" fill="oklch(0 0 0 / 0.05)" />
              <ellipse cx="17" cy="16" rx="5" ry="3.4" fill="oklch(0 0 0 / 0.04)" />
              <ellipse cx="12" cy="21" rx="3.6" ry="2.4" fill="oklch(1 0 0 / 0.03)" />
            </pattern>
          </defs>

          {/* O campo inteiro é desenhado em coordenadas do mundo; a câmera (matriz afim)
            é aplicada a este grupo. A cena toda — terreno, territórios, estruturas,
            unidades, projéteis e efeitos — vive aqui. */}
          <g transform={`matrix(${cam.a} ${cam.b} ${cam.c} ${cam.d} ${cam.e} ${cam.f})`}>
            {/* Terreno base — cor terrosa por terreno, para cada fase ter cara própria */}
            <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill={ground.base} />
            {/* BEIRADA: faixa de borda fora da área de manobra (bases nunca encostam na parede) */}
            <rect
              x={FIELD_MARGIN_X}
              y={FIELD_MARGIN_Y}
              width={FIELD_W}
              height={FIELD_H}
              fill={ground.accent}
              opacity="0.5"
            />
            <rect
              x={FIELD_MARGIN_X}
              y={FIELD_MARGIN_Y}
              width={FIELD_W}
              height={FIELD_H}
              fill="none"
              stroke="oklch(0 0 0 / 0.35)"
              strokeWidth="0.6"
            />
            {/* Manchas de solo: variam a superfície sem virar grade artificial */}
            <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="url(#groundPatches)" />
            <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="url(#groundTex)" />
            <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="url(#groundDepth)" />

            {/* Detalhes de solo: tufos, pedras e arbustos — identidade de território */}
            <g>
              {terrainDetails(arena.terrain).map((d, i) => (
                <TerrainDetailGlyph key={`td${i}`} detail={d} ground={ground} />
              ))}
            </g>

            {/* Caminhos de terra ligando os territórios: dão rotas visíveis de avanço */}
            <g stroke={ground.path} strokeLinecap="round" fill="none">
              {arena.routes.map((r, i) => (
                <line
                  key={`path-bg${i}`}
                  x1={r.from[0]}
                  y1={r.from[1]}
                  x2={r.to[0]}
                  y2={r.to[1]}
                  strokeWidth="2.6"
                  opacity="0.35"
                />
              ))}
              {arena.routes.map((r, i) => (
                <line
                  key={`path-fg${i}`}
                  x1={r.from[0]}
                  y1={r.from[1]}
                  x2={r.to[0]}
                  y2={r.to[1]}
                  strokeWidth="1.1"
                  opacity="0.5"
                />
              ))}
            </g>

            {/* Metades: oeste = aliado (azul), leste = inimigo (vermelho) — tinta leve */}
            <rect x="0" y="0" width={WORLD_W / 2} height={WORLD_H} fill="url(#allyZone)" />
            <rect
              x={WORLD_W / 2}
              y="0"
              width={WORLD_W / 2}
              height={WORLD_H}
              fill="url(#enemyZone)"
            />

            {/* Moldura do tabuleiro: leitura de "mesa de guerra" e borda nítida */}
            <rect
              x="0.6"
              y="0.6"
              width={WORLD_W - 1.2}
              height={WORLD_H - 1.2}
              fill="none"
              stroke="oklch(1 0 0 / 0.12)"
              strokeWidth="0.5"
            />
            <rect
              x="1.4"
              y="1.4"
              width={WORLD_W - 2.8}
              height={WORLD_H - 2.8}
              fill="none"
              stroke="oklch(0 0 0 / 0.18)"
              strokeWidth="0.25"
            />

            {/* Linha divisória das metades (vertical: frente oeste↔leste) */}
            <line
              x1={WORLD_W / 2}
              y1="0"
              x2={WORLD_W / 2}
              y2={WORLD_H}
              stroke="oklch(0 0 0 / 0.22)"
              strokeWidth="0.35"
              strokeDasharray="2 2"
            />
            <line
              x1={WORLD_W / 2 + 0.4}
              y1="0"
              x2={WORLD_W / 2 + 0.4}
              y2={WORLD_H}
              stroke="oklch(1 0 0 / 0.1)"
              strokeWidth="0.25"
              strokeDasharray="2 2"
            />

            {/* Zonas de desdobramento */}
            {(["red", "blue"] as Side[]).map((s) => {
              const z = arena.deployZone[s];
              const active = pendingCardId && s === "blue";
              return (
                <rect
                  key={s}
                  x={z.x}
                  y={z.y}
                  width={z.w}
                  height={z.h}
                  fill={active ? sideColor(s) : "none"}
                  fillOpacity={active ? 0.12 : 0}
                  stroke={sideColor(s)}
                  strokeOpacity={active ? 0.75 : 0.3}
                  strokeDasharray="1.5 1.5"
                  strokeWidth={active ? 0.5 : 0.3}
                />
              );
            })}

            {/* Obstáculos */}
            {arena.obstacles.map((o) => (
              <circle
                key={o.id}
                cx={o.x}
                cy={o.y}
                r={o.radius}
                fill={obstacleFill(o.kind)}
                opacity={o.kind === "barricada" ? 0.6 : 0.7}
                stroke={o.kind === "barricada" ? sideColor(o.side ?? "blue") : "oklch(1 0 0 / 0.1)"}
                strokeWidth="0.3"
              />
            ))}

            {/* Territórios de expansão */}
            {state.territories.map((t) => (
              <TerritoryGlyph key={t.id} territory={t} portrait={portrait} />
            ))}

            {/* Pontos de controle */}
            {arena.controlPoints.map((p) => (
              <ControlPointGlyph key={p.id} point={p} portrait={portrait} />
            ))}

            {/* Estruturas */}
            {state.structures.map((s) => (
              <StructureGlyph key={s.id} structure={s} portrait={portrait} />
            ))}

            {/* Zonas de efeito (fumaça, gás, reconhecimento) */}
            {state.zones.map((z) => (
              <ZoneGlyph key={z.id} zone={z} portrait={portrait} />
            ))}

            {/* Unidades */}
            {units.map((u) => {
              const dim = u.side === "red" && !u.seen.blue && u.revealed <= 0;
              return (
                <UnitGlyph
                  key={u.id}
                  unit={u}
                  selected={u.id === selectedUnitId}
                  dim={dim}
                  portrait={portrait}
                />
              );
            })}

            {/* Projéteis */}
            {state.projectiles.map((p) => (
              <ProjectileGlyph key={p.id} projectile={p} />
            ))}

            {/* Efeitos visuais */}
            {state.effects.map((e) => (
              <EffectGlyph key={e.id} effect={e} />
            ))}

            {/* Alcance da unidade selecionada */}
            {selected && (
              <circle
                cx={selected.x}
                cy={selected.y}
                r={selected.range}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="0.3"
                strokeDasharray="2 2"
                opacity={0.6}
              />
            )}

            {/* Pré-visualização do posicionamento: validação ao vivo + rota da força */}
            {ghost && (
              <g pointerEvents="none" data-testid="deploy-ghost" data-valid={ghostValid}>
                {ghostOrigin && (
                  <>
                    <line
                      x1={ghostOrigin.x}
                      y1={ghostOrigin.y}
                      x2={ghost.x}
                      y2={ghost.y}
                      stroke={ALLY}
                      strokeWidth="0.4"
                      strokeDasharray="2 1.5"
                      opacity={0.85}
                    />
                    <circle
                      cx={ghostOrigin.x}
                      cy={ghostOrigin.y}
                      r="2.6"
                      fill="none"
                      stroke={ALLY}
                      strokeWidth="0.5"
                      opacity={0.9}
                    />
                    <circle cx={ghostOrigin.x} cy={ghostOrigin.y} r="1" fill={ALLY} opacity={0.9} />
                  </>
                )}
                <circle
                  cx={ghost.x}
                  cy={ghost.y}
                  r="3.2"
                  fill="none"
                  stroke={ghostValid ? "var(--ally)" : "var(--destructive)"}
                  strokeWidth="0.5"
                  strokeDasharray={ghostValid ? undefined : "1.2 1"}
                />
                <circle
                  cx={ghost.x}
                  cy={ghost.y}
                  r="1"
                  fill={ghostValid ? "var(--ally)" : "var(--destructive)"}
                  opacity={0.9}
                />
              </g>
            )}
          </g>
        </svg>
      </div>

      {pendingCardId && (
        <div className="pointer-events-none absolute left-2 top-2 border border-primary bg-background/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary">
          {pendingIsGlobal
            ? "Clique em qualquer ponto do teatro"
            : "Clique no objetivo: a força parte da base e avança"}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zonas de efeito (fumaça, gás lacrimogêneo, reconhecimento)
// ---------------------------------------------------------------------------

function ZoneGlyph({ zone: z, portrait = false }: { zone: EffectZone; portrait?: boolean }) {
  if (z.kind === "gas") {
    return (
      <g>
        {/* Aviso de área perigosa: contorno tracejado pulsante */}
        <circle
          cx={z.x}
          cy={z.y}
          r={z.radius}
          fill="oklch(0.72 0.19 130 / 0.28)"
          stroke="oklch(0.85 0.22 120)"
          strokeWidth="0.4"
          strokeDasharray="1.4 1"
        >
          <animate
            attributeName="stroke-opacity"
            values="0.5;1;0.5"
            dur="1.1s"
            repeatCount="indefinite"
          />
        </circle>
        {/* Nuvem verde-tóxica densa, com partículas em movimento */}
        <circle cx={z.x} cy={z.y} r={z.radius * 0.9} fill="oklch(0.66 0.2 128 / 0.5)" />
        <circle cx={z.x} cy={z.y} r={z.radius * 0.6} fill="oklch(0.78 0.2 118 / 0.55)">
          <animate
            attributeName="r"
            values={`${z.radius * 0.5};${z.radius * 0.72};${z.radius * 0.5}`}
            dur="1.6s"
            repeatCount="indefinite"
          />
        </circle>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <circle
              key={i}
              cx={z.x + Math.cos(a) * z.radius * 0.45}
              cy={z.y + Math.sin(a) * z.radius * 0.45}
              r="0.9"
              fill="oklch(0.88 0.2 112)"
              opacity="0.75"
            >
              <animate
                attributeName="opacity"
                values="0.2;0.9;0.2"
                dur={`${1 + (i % 3) * 0.4}s`}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
        <text
          x={z.x}
          y={z.y - z.radius - 0.6}
          textAnchor="middle"
          fontSize="2"
          fontFamily="var(--font-mono)"
          fill="oklch(0.9 0.2 115)"
          fontWeight={700}
          transform={uprightText(portrait, z.x, z.y - z.radius - 0.6)}
        >
          GÁS
        </text>
      </g>
    );
  }
  const isSmoke = z.kind === "fumaca";
  return (
    <circle
      cx={z.x}
      cy={z.y}
      r={z.radius}
      fill={isSmoke ? "oklch(0.92 0 0 / 0.3)" : sideColor(z.side)}
      opacity={isSmoke ? 0.5 : 0.12}
      stroke={isSmoke ? "oklch(0.95 0 0 / 0.4)" : sideColor(z.side)}
      strokeWidth="0.25"
      strokeDasharray="1.2 1.2"
    />
  );
}

// ---------------------------------------------------------------------------
// Estruturas: base principal, torres e bases avançadas
// ---------------------------------------------------------------------------

function StructureGlyph({
  structure: s,
  portrait = false,
}: {
  structure: Structure;
  portrait?: boolean;
}) {
  const color = sideColor(s.side);
  const hpPct = Math.max(0, s.hp / s.maxHp);
  const damaged = hpPct < 0.5;
  const critical = hpPct < 0.2;
  return (
    <g>
      {s.underConstruction && (
        <circle
          cx={s.x}
          cy={s.y}
          r={s.radius + 1.5}
          fill="none"
          stroke={color}
          strokeWidth="0.4"
          strokeDasharray="1 1"
        />
      )}
      {s.kind === "base-principal" ? (
        <BasePrincipalGlyph s={s} color={color} />
      ) : (
        <TowerGlyph s={s} color={color} />
      )}
      {/* dano progressivo */}
      {damaged && <circle cx={s.x} cy={s.y} r={s.radius * 0.6} fill="oklch(0.4 0 0 / 0.4)" />}
      {critical && (
        <circle cx={s.x} cy={s.y} r={s.radius * 0.5} fill="var(--enemy)" opacity={0.5}>
          <animate
            attributeName="opacity"
            values="0.3;0.7;0.3"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      {/* barra de vida */}
      <rect
        x={s.x - s.radius}
        y={s.y - s.radius - 2.2}
        width={s.radius * 2}
        height="1.1"
        fill="oklch(0 0 0 / 0.6)"
      />
      <rect
        x={s.x - s.radius}
        y={s.y - s.radius - 2.2}
        width={s.radius * 2 * hpPct}
        height="1.1"
        fill={hpPct > 0.4 ? "var(--fact)" : "var(--enemy)"}
      />
      {s.underConstruction && (
        <text
          x={s.x}
          y={s.y - s.radius - 3}
          textAnchor="middle"
          fontSize="2"
          fontFamily="var(--font-mono)"
          fill="var(--doc)"
          transform={uprightText(portrait, s.x, s.y - s.radius - 3)}
        >
          {Math.round(s.buildProgress)}%
        </text>
      )}
    </g>
  );
}

function BasePrincipalGlyph({ s, color }: { s: Structure; color: string }) {
  return (
    <g>
      {/* perímetro fortificado */}
      <circle
        cx={s.x}
        cy={s.y}
        r={s.radius}
        fill={color}
        opacity={0.14}
        stroke={color}
        strokeWidth="0.35"
      />
      <circle cx={s.x} cy={s.y} r={s.radius * 0.72} fill={color} opacity={0.22} />
      {/* centro de comando */}
      <rect
        x={s.x - s.radius * 0.42}
        y={s.y - s.radius * 0.42}
        width={s.radius * 0.84}
        height={s.radius * 0.84}
        fill="oklch(0.18 0 0)"
        stroke={color}
        strokeWidth="0.3"
      />
      {/* radar */}
      <circle cx={s.x} cy={s.y} r={s.radius * 0.28} fill="none" stroke={color} strokeWidth="0.3" />
      <line
        x1={s.x}
        y1={s.y}
        x2={s.x + Math.cos(s.aim) * s.radius * 0.28}
        y2={s.y + Math.sin(s.aim) * s.radius * 0.28}
        stroke={color}
        strokeWidth="0.3"
      />
      {/* torres de comunicação */}
      <line
        x1={s.x - s.radius * 0.6}
        y1={s.y - s.radius * 0.6}
        x2={s.x - s.radius * 0.6}
        y2={s.y - s.radius}
        stroke={color}
        strokeWidth="0.4"
      />
      <line
        x1={s.x + s.radius * 0.6}
        y1={s.y - s.radius * 0.6}
        x2={s.x + s.radius * 0.6}
        y2={s.y - s.radius}
        stroke={color}
        strokeWidth="0.4"
      />
    </g>
  );
}

function TowerGlyph({ s, color }: { s: Structure; color: string }) {
  const rx = s.x + Math.cos(s.aim) * s.radius * 0.9;
  const ry = s.y + Math.sin(s.aim) * s.radius * 0.9;
  return (
    <g>
      <circle
        cx={s.x}
        cy={s.y}
        r={s.radius}
        fill={color}
        opacity={0.2}
        stroke={color}
        strokeWidth="0.3"
      />
      <rect
        x={s.x - s.radius * 0.55}
        y={s.y - s.radius * 0.55}
        width={s.radius * 1.1}
        height={s.radius * 1.1}
        fill="oklch(0.2 0 0)"
        stroke={color}
        strokeWidth="0.3"
      />
      {/* canhão com recuo */}
      <line
        x1={s.x}
        y1={s.y}
        x2={s.x + Math.cos(s.aim) * (s.radius * 0.9 - s.recoil * 0.6)}
        y2={s.y + Math.sin(s.aim) * (s.radius * 0.9 - s.recoil * 0.6)}
        stroke={color}
        strokeWidth="0.6"
      />
      <circle cx={rx} cy={ry} r="0.5" fill={color} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Territórios de expansão
// ---------------------------------------------------------------------------

// Instalação militar neutra no meio do mapa: um bunker/complexo pequeno desenhado
// sobre o marcador. Muda de cor quando o território é tomado (neutral → facção).
function NeutralBaseArt({
  x,
  y,
  r,
  color,
  owned,
}: {
  x: number;
  y: number;
  r: number;
  color: string;
  owned: boolean;
}) {
  const s = r / 6; // escala relativa ao raio do marcador
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* plataforma */}
      <rect
        x={-4.6 * s}
        y={-3.4 * s}
        width={9.2 * s}
        height={6.8 * s}
        fill="oklch(0.22 0.01 250)"
        stroke={color}
        strokeOpacity={owned ? 0.9 : 0.7}
        strokeWidth={0.35 * s}
      />
      {/* bunker central */}
      <rect
        x={-2.6 * s}
        y={-1.9 * s}
        width={5.2 * s}
        height={3.8 * s}
        fill="oklch(0.3 0.012 250)"
        stroke="oklch(1 0 0 / 0.25)"
        strokeWidth={0.22 * s}
      />
      {/* torre de radar / antena */}
      <line x1={0} y1={-1.9 * s} x2={0} y2={-4.2 * s} stroke={color} strokeWidth={0.3 * s} />
      <circle cx={0} cy={-4.6 * s} r={0.7 * s} fill={color} opacity={0.9}>
        {!owned && (
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.6s" repeatCount="indefinite" />
        )}
      </circle>
      {/* cantos fortificados */}
      {(
        [
          [-4.6, -3.4],
          [4.6, -3.4],
          [-4.6, 3.4],
          [4.6, 3.4],
        ] as const
      ).map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx * s}
          cy={cy * s}
          r={0.75 * s}
          fill={color}
          opacity={owned ? 0.9 : 0.6}
        />
      ))}
    </g>
  );
}

function TerritoryGlyph({
  territory: t,
  portrait = false,
}: {
  territory: Territory;
  portrait?: boolean;
}) {
  const owned = t.owner !== "neutro";
  const color = owned ? sideColor(t.owner as Side) : "oklch(0.98 0 0)";
  const contested = t.progress.blue > 0 && t.progress.red > 0;
  const progress = Math.max(t.progress.blue, t.progress.red) / 100;
  const ringColor = t.progress.blue >= t.progress.red ? ALLY : ENEMY;
  const claim = owned ? color : "oklch(1 0 0 / 0.5)";
  return (
    <g>
      {/* Base neutra: instalação militar já erguida no meio do mapa. Além do
          marcador de captura, desenha a estrutura (quem a toma assume a posição). */}
      {t.base && <NeutralBaseArt x={t.x} y={t.y} r={t.radius} color={color} owned={owned} />}
      {/* Disco de posse pintado no chão: leitura de território SEM halo neon. */}
      <circle
        cx={t.x}
        cy={t.y}
        r={t.radius}
        fill={owned ? color : "oklch(0.1 0 0)"}
        opacity={owned ? 0.14 : 0.14}
      />
      {/* Marcador circular de captura (o "ponto branco" luminoso do chão). */}
      <circle
        cx={t.x}
        cy={t.y}
        r={t.radius * 0.62}
        fill={owned ? color : "oklch(0.97 0.01 90)"}
        fillOpacity={owned ? 0.5 : 0.72}
        stroke={claim}
        strokeWidth={owned ? 0.55 : 0.45}
        strokeDasharray={owned ? undefined : "1.2 1"}
      >
        {!owned && (
          <animate
            attributeName="stroke-opacity"
            values="0.5;0.95;0.5"
            dur="2.2s"
            repeatCount="indefinite"
          />
        )}
      </circle>
      {/* núcleo: ponto de referência do marcador */}
      <circle
        cx={t.x}
        cy={t.y}
        r={t.radius * 0.22}
        fill={owned ? color : "oklch(1 0 0)"}
        opacity={owned ? 0.95 : 0.9}
        data-testid={`territory-${t.id}`}
        data-world-x={t.x}
        data-world-y={t.y}
      />
      {/* anel de progresso de captura */}
      {!owned && progress > 0 && (
        <circle
          cx={t.x}
          cy={t.y}
          r={t.radius * 0.82}
          fill="none"
          stroke={ringColor}
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * t.radius * 0.82 * progress} ${2 * Math.PI * t.radius * 0.82}`}
          transform={`rotate(-90 ${t.x} ${t.y})`}
        />
      )}
      {contested && (
        <text
          x={t.x}
          y={t.y - t.radius - 0.9}
          textAnchor="middle"
          fontSize="1.9"
          fontFamily="var(--font-mono)"
          fill="var(--enemy)"
          fontWeight={700}
          transform={uprightText(portrait, t.x, t.y - t.radius - 0.9)}
        >
          DISPUTA
        </text>
      )}
      {!owned && (t.progress.blue > 0 || t.progress.red > 0) && (
        <>
          <rect
            x={t.x - t.radius}
            y={t.y + t.radius + 0.7}
            width={t.radius * 2}
            height="1"
            fill="oklch(0 0 0 / 0.55)"
          />
          <rect
            x={t.x - t.radius}
            y={t.y + t.radius + 0.7}
            width={t.radius * 2 * (t.progress.blue / 100)}
            height="1"
            fill={ALLY}
          />
          <rect
            x={t.x + t.radius - t.radius * 2 * (t.progress.red / 100)}
            y={t.y + t.radius + 0.7}
            width={t.radius * 2 * (t.progress.red / 100)}
            height="1"
            fill={ENEMY}
          />
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Pontos de controle
// ---------------------------------------------------------------------------

function ControlPointGlyph({
  point,
  portrait = false,
}: {
  point: ControlPoint;
  portrait?: boolean;
}) {
  const color = point.owner === "neutro" ? "oklch(0.98 0 0)" : sideColor(point.owner);
  const bluePct = point.progress.blue;
  const redPct = point.progress.red;
  const progress = Math.max(bluePct, redPct) / 100;
  const ringColor = bluePct >= redPct ? ALLY : ENEMY;
  const contested = bluePct > 0 && redPct > 0;
  const r = point.radius * 0.7;
  return (
    <g>
      {/* Disco de posse e anel do ponto — sem halo neon, integrado ao terreno */}
      <circle
        cx={point.x}
        cy={point.y}
        r={point.radius}
        fill={color}
        opacity={point.owner === "neutro" ? 0.12 : 0.18}
        stroke={color}
        strokeOpacity={point.owner === "neutro" ? 0.6 : 0.9}
        strokeWidth="0.6"
        strokeDasharray={point.owner === "neutro" ? "1.4 1.2" : undefined}
      />
      <circle
        cx={point.x}
        cy={point.y}
        r={point.radius * 0.5}
        fill="none"
        stroke={color}
        strokeOpacity="0.5"
        strokeWidth="0.35"
        strokeDasharray="1.6 1.4"
      />
      {progress > 0 && (
        <circle
          cx={point.x}
          cy={point.y}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * r * progress} ${2 * Math.PI * r}`}
          transform={`rotate(-90 ${point.x} ${point.y})`}
        />
      )}
      {contested && (
        <text
          x={point.x}
          y={point.y - point.radius - 1}
          textAnchor="middle"
          fontSize="1.9"
          fontFamily="var(--font-mono)"
          fill="var(--enemy)"
          fontWeight={700}
          transform={uprightText(portrait, point.x, point.y - point.radius - 1)}
        >
          DISPUTA
        </text>
      )}
      <text
        x={point.x}
        y={point.y - point.radius - (contested ? 3.2 : 0.9)}
        textAnchor="middle"
        fontSize="2.1"
        fontFamily="var(--font-mono)"
        fill={color}
        fontWeight={700}
        transform={uprightText(portrait, point.x, point.y - point.radius - (contested ? 3.2 : 0.9))}
      >
        {point.sector.toUpperCase()}
      </text>
      <text
        x={point.x}
        y={point.y + point.radius + 2.6}
        textAnchor="middle"
        fontSize="1.9"
        fontFamily="var(--font-mono)"
        fill="oklch(0.9 0.01 90)"
        transform={uprightText(portrait, point.x, point.y + point.radius + 2.6)}
      >
        {point.name}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Unidades — silhuetas distintas por modelo
// ---------------------------------------------------------------------------

function UnitGlyph({
  unit,
  selected,
  dim = false,
  portrait = false,
}: {
  unit: BattleUnit;
  selected: boolean;
  dim?: boolean;
  portrait?: boolean;
}) {
  const color = sideColor(unit.side);
  const airborne = unit.domain === "aereo";
  const y = airborne ? unit.y - 2.4 : unit.y;
  // Escala visual por modelo: os soldados e veículos apareciam minúsculos no teatro.
  // A escala NÃO altera a simulação (raio, alcance, dano) — só o desenho — para o
  // jogador enxergar a diferença entre fuzileiro, tanque e drone à primeira vista.
  const scale = MODEL_SCALE[unit.model] ?? 1;
  const r = unit.radius * scale;
  return (
    <g pointerEvents="none" opacity={dim ? 0.55 : 1}>
      {airborne && (
        <ellipse
          cx={unit.x}
          cy={unit.y + 1.6}
          rx={r * 0.9}
          ry={r * 0.4}
          fill="oklch(0 0 0 / 0.35)"
        />
      )}
      <circle cx={unit.x} cy={y} r={unit.radius * 0.7} fill={color} opacity={0.22} />
      {unit.level > 1 && (
        <circle
          cx={unit.x}
          cy={y}
          r={r + 1.3}
          fill="none"
          stroke={LEVEL_TONE(unit.level)}
          strokeWidth={0.3 + Math.min(0.5, unit.level * 0.04)}
          opacity={0.85}
        />
      )}
      <g
        transform={`translate(${unit.x} ${y}) rotate(${(unit.aim * 180) / Math.PI}) scale(${scale})`}
      >
        {unitModel(unit.model, color, selected)}
      </g>
      {unit.smoke > 0 && (
        <circle
          cx={unit.x}
          cy={y}
          r={r * 1.1}
          fill="none"
          stroke="oklch(1 0 0 / 0.5)"
          strokeWidth="0.25"
          strokeDasharray="1 1"
        />
      )}
      {unit.jammed > 0 && (
        <circle cx={unit.x} cy={y} r={r * 1.2} fill="none" stroke="var(--ai)" strokeWidth="0.25" />
      )}
      {/* barra de vida */}
      <rect x={unit.x - r} y={y - r - 1.8} width={r * 2} height="0.9" fill="oklch(0 0 0 / 0.5)" />
      <rect
        x={unit.x - r}
        y={y - r - 1.8}
        width={r * 2 * Math.max(0, unit.hp / unit.maxHp)}
        height="0.9"
        fill={unit.hp / unit.maxHp > 0.4 ? "var(--fact)" : "var(--enemy)"}
      />
      {/* etiqueta da unidade: pequena placa escura, legível sobre qualquer terreno */}
      <rect
        x={unit.x - unit.short.length * 0.62}
        y={y + r * 0.5}
        width={unit.short.length * 1.24}
        height="2.4"
        rx="0.4"
        fill="oklch(0.12 0.008 90 / 0.72)"
      />
      <text
        x={unit.x}
        y={y + r * 0.5 + 1.75}
        textAnchor="middle"
        fontSize="1.7"
        fontFamily="var(--font-mono)"
        fill="oklch(0.92 0.01 90)"
        fontWeight={700}
        transform={uprightText(portrait, unit.x, y + r * 0.5 + 1.75)}
      >
        {unit.short}
      </text>
      {unit.level > 1 && (
        <g>
          <circle
            cx={unit.x - unit.short.length * 0.62 - 1.4}
            cy={y + r * 0.5 + 1.2}
            r="1.5"
            fill="oklch(0.12 0.008 90 / 0.85)"
            stroke={LEVEL_TONE(unit.level)}
            strokeWidth="0.25"
          />
          <text
            x={unit.x - unit.short.length * 0.62 - 1.4}
            y={y + r * 0.5 + 1.95}
            textAnchor="middle"
            fontSize="2"
            fontFamily="var(--font-mono)"
            fill={LEVEL_TONE(unit.level)}
            fontWeight={700}
            transform={uprightText(
              portrait,
              unit.x - unit.short.length * 0.62 - 1.4,
              y + r * 0.5 + 1.95,
            )}
          >
            {unit.level}
          </text>
        </g>
      )}
    </g>
  );
}

// Escala de desenho por modelo. Infantaria sobe mais (era o caso mais crítico);
// veículos e aeronaves sobem o suficiente para não competir com o terreno.
const MODEL_SCALE: Record<BattleUnit["model"], number> = {
  "soldado-fuzil": 2.2,
  "soldado-assalto": 2.15,
  "soldado-antitanque": 2.15,
  sniper: 2.2,
  morteiro: 1.8,
  engenheiro: 2.2,
  canhao: 1.4,
  "artilharia-pesada": 1.35,
  lmf: 1.35,
  "lancador-missil": 1.4,
  tanque: 1.7,
  vbld: 1.7,
  "caca-tanques": 1.7,
  "drone-recon": 1.5,
  "drone-combate": 1.5,
  aa: 1.4,
  fortificacao: 1.3,
  posto: 1.4,
  paraquedista: 1.9,
};

// Desenha o modelo da unidade centrado na origem, com o "nariz" apontando para +x.
function unitModel(model: BattleUnit["model"], color: string, selected: boolean): ReactNode {
  const outline = selected ? "var(--primary)" : "oklch(0 0 0 / 0.5)";
  const sw = selected ? 0.5 : 0.28;
  const body = (children: ReactNode) => (
    <g stroke={outline} strokeWidth={sw}>
      {children}
    </g>
  );
  // Tons neutros para armas/cano e detalhes — evita o visual "neon" das cores de equipe.
  const dark = "oklch(0.17 0.008 90)";
  const steel = "oklch(0.32 0.008 90)";
  // Corpo humano visto de cima (nariz para +x): pernas, torso, braços e capacete.
  // A arma entra como parâmetro para cada especialidade manter silhueta própria.
  const soldier = (weapon: ReactNode, opts: { bulky?: boolean; helmet?: string } = {}) =>
    body(
      <>
        <rect x="-0.62" y="-0.44" width="0.8" height="0.3" rx="0.12" fill={color} />
        <rect x="-0.62" y="0.14" width="0.8" height="0.3" rx="0.12" fill={color} />
        <rect
          x={opts.bulky ? -0.24 : -0.12}
          y={opts.bulky ? -0.62 : -0.5}
          width={opts.bulky ? 1.12 : 0.98}
          height={opts.bulky ? 1.24 : 1.02}
          rx="0.24"
          fill={color}
        />
        <rect x="0.34" y="-0.52" width="0.58" height="0.24" rx="0.1" fill={color} />
        <rect x="0.34" y="0.28" width="0.58" height="0.24" rx="0.1" fill={color} />
        <circle
          cx="0.04"
          cy="0"
          r={opts.bulky ? 0.6 : 0.5}
          fill={opts.helmet ?? color}
          stroke={dark}
          strokeWidth="0.14"
        />
        {weapon}
      </>,
    );
  switch (model) {
    case "soldado-fuzil":
      return soldier(
        <>
          <rect x="0.5" y="-0.15" width="1.85" height="0.3" rx="0.07" fill={dark} />
          <rect x="1.5" y="0.05" width="0.32" height="0.34" rx="0.06" fill={dark} />
        </>,
      );
    case "soldado-assalto":
      return soldier(
        <>
          <rect x="-0.95" y="-0.42" width="0.42" height="0.84" rx="0.14" fill={steel} />
          <rect x="0.5" y="-0.17" width="1.5" height="0.34" rx="0.07" fill={dark} />
          <rect x="0.86" y="0.14" width="0.3" height="0.5" rx="0.06" fill={dark} />
        </>,
        { bulky: true },
      );
    case "soldado-antitanque":
      return soldier(
        <>
          <rect x="0.1" y="-0.82" width="2.15" height="0.5" rx="0.2" fill={steel} />
          <circle cx="2.32" cy="-0.57" r="0.24" fill={dark} />
          <line x1="0.35" y1="-0.57" x2="0.9" y2="-0.2" stroke={dark} strokeWidth="0.16" />
        </>,
        { helmet: steel },
      );
    case "engenheiro":
      return soldier(
        <>
          <rect x="-0.95" y="-0.36" width="0.62" height="0.72" rx="0.12" fill="var(--doc)" />
          <line x1="-0.95" y1="0" x2="-0.33" y2="0" stroke={dark} strokeWidth="0.12" />
          <rect x="0.42" y="-0.13" width="0.7" height="0.26" rx="0.06" fill={dark} />
        </>,
        { helmet: "var(--doc)" },
      );
    case "paraquedista":
      return soldier(
        <>
          <rect
            x="-1.15"
            y="-0.6"
            width="0.66"
            height="1.2"
            rx="0.22"
            fill={color}
            opacity={0.85}
          />
          <line x1="-0.5" y1="-0.4" x2="0.1" y2="-0.3" stroke={dark} strokeWidth="0.1" />
          <line x1="-0.5" y1="0.4" x2="0.1" y2="0.3" stroke={dark} strokeWidth="0.1" />
          <rect x="0.5" y="-0.15" width="1.5" height="0.3" rx="0.07" fill={dark} />
        </>,
        { helmet: "var(--fact)" },
      );
    case "canhao":
      return body(
        <>
          <rect x="-1.9" y="-1.05" width="2.6" height="2.1" rx="0.28" fill={steel} />
          <rect x="-1.7" y="-0.7" width="2.2" height="1.4" rx="0.18" fill={color} />
          <circle cx="-1.45" cy="-1.15" r="0.55" fill={dark} stroke={steel} strokeWidth="0.14" />
          <circle cx="-1.45" cy="1.15" r="0.55" fill={dark} stroke={steel} strokeWidth="0.14" />
          <rect x="0.6" y="-0.28" width="3" height="0.56" rx="0.1" fill={dark} />
          <rect x="3.5" y="-0.42" width="0.4" height="0.84" rx="0.08" fill={steel} />
        </>,
      );
    case "artilharia-pesada":
      return body(
        <>
          <rect x="-2.3" y="-1.35" width="3.4" height="2.7" rx="0.32" fill={steel} />
          <rect x="-2" y="-0.9" width="2.8" height="1.8" rx="0.2" fill={color} />
          <circle cx="-1.8" cy="-1.5" r="0.62" fill={dark} stroke={steel} strokeWidth="0.14" />
          <circle cx="-1.8" cy="1.5" r="0.62" fill={dark} stroke={steel} strokeWidth="0.14" />
          <circle cx="0.1" cy="0" r="0.75" fill={steel} />
          <rect x="0.8" y="-0.34" width="4" height="0.68" rx="0.12" fill={dark} />
          <rect x="4.6" y="-0.52" width="0.5" height="1.04" rx="0.1" fill={steel} />
        </>,
      );
    case "lmf":
      return body(
        <>
          <rect x="-2" y="-1.15" width="3" height="2.3" rx="0.28" fill={steel} />
          <rect x="-1.8" y="-0.8" width="2.6" height="1.6" rx="0.18" fill={color} />
          <circle cx="-1.6" cy="-1.25" r="0.5" fill={dark} stroke={steel} strokeWidth="0.12" />
          <circle cx="-1.6" cy="1.25" r="0.5" fill={dark} stroke={steel} strokeWidth="0.12" />
          <rect
            x="0.6"
            y="-1.05"
            width="2.1"
            height="2.1"
            rx="0.14"
            fill={dark}
            stroke={steel}
            strokeWidth="0.16"
          />
          {[-0.62, -0.22, 0.22, 0.62].map((yy) => (
            <circle key={yy} cx="0.95" cy={yy} r="0.2" fill={steel} />
          ))}
        </>,
      );
    case "lancador-missil":
      return body(
        <>
          <rect x="-2.5" y="-1.1" width="3.3" height="2.2" rx="0.28" fill={steel} />
          <rect x="-2.3" y="-0.75" width="2.9" height="1.5" rx="0.18" fill={color} />
          <circle cx="-2.1" cy="-1.2" r="0.52" fill={dark} stroke={steel} strokeWidth="0.12" />
          <circle cx="-2.1" cy="1.2" r="0.52" fill={dark} stroke={steel} strokeWidth="0.12" />
          <rect
            x="0.5"
            y="-0.9"
            width="3.3"
            height="1.8"
            rx="0.42"
            fill={dark}
            stroke={steel}
            strokeWidth="0.16"
          />
          <line x1="0.9" y1="0" x2="3.6" y2="0" stroke={steel} strokeWidth="0.16" />
        </>,
      );
    case "tanque":
      return body(
        <>
          {/* esteiras */}
          <rect x="-2.4" y="-1.75" width="4.6" height="0.62" rx="0.12" fill={dark} />
          <rect x="-2.4" y="1.13" width="4.6" height="0.62" rx="0.12" fill={dark} />
          {/* casco */}
          <rect x="-2.35" y="-1.2" width="4.5" height="2.4" rx="0.28" fill={color} />
          <path d="M2.15 -1.2 L2.9 0 L2.15 1.2 Z" fill={color} />
          {/* torre + canhão */}
          <circle cx="-0.1" cy="0" r="1.05" fill={steel} />
          <circle cx="-0.1" cy="0" r="0.66" fill={color} />
          <rect x="0.7" y="-0.26" width="3.7" height="0.52" rx="0.1" fill={dark} />
          <rect x="4.15" y="-0.4" width="0.5" height="0.8" rx="0.1" fill={steel} />
        </>,
      );
    case "vbld":
      return body(
        <>
          <rect x="-2.3" y="-1.55" width="4.4" height="0.55" rx="0.1" fill={dark} />
          <rect x="-2.3" y="1" width="4.4" height="0.55" rx="0.1" fill={dark} />
          <path d="M-2.1 -1.25 L1.7 -1.25 L2.6 0 L1.7 1.25 L-2.1 1.25 Z" fill={color} />
          <circle cx="-0.1" cy="0" r="0.72" fill={steel} />
          <circle cx="-0.1" cy="0" r="0.36" fill={dark} />
          <rect x="1.1" y="-0.16" width="1.7" height="0.32" rx="0.08" fill={dark} />
        </>,
      );
    case "drone-recon":
      return body(
        <>
          <line x1="-1.7" y1="-1.05" x2="1.7" y2="1.05" stroke={steel} strokeWidth="0.34" />
          <line x1="-1.7" y1="1.05" x2="1.7" y2="-1.05" stroke={steel} strokeWidth="0.34" />
          <rect x="-1.05" y="-0.5" width="2.1" height="1" rx="0.34" fill={steel} />
          <ellipse rx="0.72" ry="0.42" fill={color} />
          {[-1.5, 1.5].map((xx) =>
            [-1, 1].map((yy) => (
              <circle key={`${xx}-${yy}`} cx={xx} cy={yy} r="0.34" fill={steel} opacity={0.85}>
                <animate
                  attributeName="opacity"
                  values="0.35;0.85;0.35"
                  dur="0.3s"
                  repeatCount="indefinite"
                />
              </circle>
            )),
          )}
          <circle cx="0.15" cy="0" r="0.3" fill="var(--ai)" />
        </>,
      );
    case "drone-combate":
      return body(
        <>
          <line x1="-1.9" y1="-1.25" x2="1.9" y2="1.25" stroke={steel} strokeWidth="0.34" />
          <line x1="-1.9" y1="1.25" x2="1.9" y2="-1.25" stroke={steel} strokeWidth="0.34" />
          <rect x="-1.25" y="-0.65" width="2.5" height="1.3" rx="0.4" fill={steel} />
          <ellipse rx="0.9" ry="0.55" fill={color} />
          <rect x="0.9" y="-0.2" width="1.7" height="0.4" rx="0.08" fill={dark} />
          <circle cx="-0.2" cy="0" r="0.34" fill="var(--enemy)" />
        </>,
      );
    case "aa":
      return body(
        <>
          <rect x="-1.5" y="-1.05" width="2.2" height="2.1" rx="0.28" fill={steel} />
          <rect x="-1.3" y="-0.7" width="1.8" height="1.4" rx="0.16" fill={color} />
          <line x1="0.5" y1="-0.42" x2="2.8" y2="-0.72" stroke={dark} strokeWidth="0.34" />
          <line x1="0.5" y1="0.42" x2="2.8" y2="0.72" stroke={dark} strokeWidth="0.34" />
        </>,
      );
    case "fortificacao":
      return body(
        <>
          <rect x="-2.1" y="-1.7" width="4.2" height="3.4" rx="0.24" fill={steel} />
          <rect x="-1.5" y="-1.1" width="3" height="2.2" rx="0.18" fill={color} />
          <rect x="-0.5" y="-0.5" width="1" height="1" rx="0.14" fill={dark} />
          <rect x="0.4" y="-0.16" width="2.4" height="0.32" rx="0.08" fill={dark} />
        </>,
      );
    case "posto":
      return body(
        <>
          <rect x="-1.5" y="-1.5" width="3" height="3" rx="0.24" fill={steel} />
          <rect x="-1" y="-1" width="2" height="2" rx="0.16" fill={color} />
          <circle cx="0" cy="0" r="0.5" fill="var(--fact)" />
        </>,
      );
    case "sniper":
      return body(
        <>
          <circle cx="-0.5" cy="0" r="0.6" fill={steel} />
          <rect x="-0.5" y="-0.55" width="1.4" height="1.1" rx="0.3" fill={color} />
          {/* fuzil longo com luneta */}
          <rect x="0.6" y="-0.16" width="3.2" height="0.32" rx="0.06" fill={dark} />
          <rect x="1.2" y="-0.6" width="0.9" height="0.34" rx="0.08" fill={steel} />
          <circle cx="2.4" cy="0" r="0.18" fill="var(--fact)" />
        </>,
      );
    case "morteiro":
      return body(
        <>
          {/* base + bipé + tubo elevado */}
          <ellipse rx="1.4" ry="0.9" fill={steel} />
          <line x1="-1" y1="0.8" x2="-0.2" y2="-0.6" stroke={dark} strokeWidth="0.24" />
          <line x1="1" y1="0.8" x2="0.2" y2="-0.6" stroke={dark} strokeWidth="0.24" />
          <rect x="-0.32" y="-2" width="0.64" height="2.4" rx="0.16" fill={color} />
          <circle cx="0" cy="-2" r="0.3" fill={dark} />
        </>,
      );
    case "caca-tanques":
      return body(
        <>
          {/* esteiras */}
          <rect x="-2" y="-1.5" width="4" height="0.6" rx="0.2" fill={dark} />
          <rect x="-2" y="0.9" width="4" height="0.6" rx="0.2" fill={dark} />
          {/* casco baixo e longo */}
          <rect x="-1.9" y="-1" width="3.8" height="2" rx="0.28" fill={steel} />
          <rect x="-1.5" y="-0.7" width="3" height="1.4" rx="0.18" fill={color} />
          {/* torre baixa com canhão muito longo */}
          <rect x="-0.7" y="-0.6" width="1.7" height="1.2" rx="0.2" fill={steel} />
          <rect x="0.9" y="-0.18" width="3.1" height="0.36" rx="0.08" fill={dark} />
          <rect x="3.9" y="-0.26" width="0.5" height="0.52" rx="0.08" fill={steel} />
        </>,
      );
    default:
      return body(<circle r="1.4" fill={color} />);
  }
}

// ---------------------------------------------------------------------------
// Projéteis
// ---------------------------------------------------------------------------

function ProjectileGlyph({ projectile: p }: { projectile: Projectile }) {
  const color = sideColor(p.side);
  if (p.kind === "missile") {
    const ang = (Math.atan2(p.vy, p.vx) * 180) / Math.PI;
    return (
      <g transform={`translate(${p.x} ${p.y}) rotate(${ang})`}>
        <rect x="-0.9" y="-0.35" width="1.8" height="0.7" fill={color} rx="0.2" />
        <line x1="-1.6" y1="0" x2="-0.9" y2="0" stroke="var(--doc)" strokeWidth="0.5" />
      </g>
    );
  }
  if (p.kind === "rocket") {
    return (
      <g>
        <circle cx={p.x} cy={p.y} r="0.5" fill={color} />
        <circle cx={p.x} cy={p.y} r="1.1" fill="var(--doc)" opacity={0.35} />
      </g>
    );
  }
  return <circle cx={p.x} cy={p.y} r="0.45" fill={color} />;
}

// ---------------------------------------------------------------------------
// Efeitos visuais
// ---------------------------------------------------------------------------

function EffectGlyph({ effect: e }: { effect: VisualEffect }) {
  const life = Math.max(0, e.remaining / e.ttl);
  switch (e.kind) {
    case "tracer":
      return (
        <line
          x1={e.x}
          y1={e.y}
          x2={e.x2 ?? e.x}
          y2={e.y2 ?? e.y}
          stroke="var(--doc)"
          strokeWidth="0.28"
          opacity={life}
        />
      );
    case "muzzle":
      return (
        <circle cx={e.x} cy={e.y} r={0.9 * life + 0.3} fill="var(--doc)" opacity={life * 0.9} />
      );
    case "explosion":
      return (
        <g>
          <circle
            cx={e.x}
            cy={e.y}
            r={e.radius * (1.2 - life * 0.5)}
            fill="var(--enemy)"
            opacity={life * 0.55}
          />
          <circle
            cx={e.x}
            cy={e.y}
            r={e.radius * (0.6 - life * 0.3)}
            fill="var(--doc)"
            opacity={life * 0.7}
          />
        </g>
      );
    case "fire":
      return (
        <circle cx={e.x} cy={e.y} r={e.radius * 0.7} fill="var(--enemy)" opacity={life * 0.4}>
          <animate
            attributeName="r"
            values={`${e.radius * 0.5};${e.radius * 0.9};${e.radius * 0.5}`}
            dur="0.7s"
            repeatCount="indefinite"
          />
        </circle>
      );
    case "gas":
      return (
        <g>
          <circle
            cx={e.x}
            cy={e.y}
            r={e.radius * (1.1 - life * 0.4)}
            fill="oklch(0.72 0.2 125)"
            opacity={life * 0.55}
          />
          <circle
            cx={e.x}
            cy={e.y}
            r={e.radius * (0.7 - life * 0.3)}
            fill="oklch(0.85 0.22 115)"
            opacity={life * 0.6}
          />
        </g>
      );
    case "spark":
      return (
        <circle cx={e.x} cy={e.y} r={e.radius * life} fill="var(--primary)" opacity={life * 0.8} />
      );
    case "build":
      return (
        <circle
          cx={e.x}
          cy={e.y}
          r={e.radius * 0.8}
          fill="none"
          stroke="var(--doc)"
          strokeWidth="0.25"
          opacity={life * 0.8}
          strokeDasharray="0.8 0.8"
        />
      );
    case "impact":
    default:
      return (
        <circle
          cx={e.x}
          cy={e.y}
          r={e.radius * life + 0.3}
          fill="var(--doc)"
          opacity={life * 0.7}
        />
      );
  }
}

function obstacleFill(kind: string): string {
  switch (kind) {
    case "rio":
      return "oklch(0.35 0.06 230)";
    case "construcao":
      return "oklch(0.32 0.01 100)";
    case "vegetacao":
      return "oklch(0.3 0.05 145)";
    case "elevacao":
      return "oklch(0.38 0.02 90)";
    default:
      return "oklch(0.4 0.02 90)";
  }
}
