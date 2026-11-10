import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { canDeploy, originFor } from "@/game/battle/engine";
import {
  WORLD_H,
  WORLD_W,
  fieldBounds,
  fieldTransform,
  fieldViewBox,
  worldFromField,
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
// rio, fortificado), em vez do mesmo verde de todas as arenas.
const GROUND_BY_TERRAIN: Record<string, { base: string; accent: string }> = {
  Cidade: { base: "oklch(0.24 0.008 250)", accent: "oklch(0.3 0.01 250)" },
  Floresta: { base: "oklch(0.24 0.03 145)", accent: "oklch(0.29 0.045 140)" },
  "Campo aberto": { base: "oklch(0.3 0.035 95)", accent: "oklch(0.34 0.045 92)" },
  Montanha: { base: "oklch(0.3 0.012 70)", accent: "oklch(0.36 0.016 68)" },
  "Travessia de rio": { base: "oklch(0.26 0.03 200)", accent: "oklch(0.33 0.05 210)" },
  "Região fortificada": { base: "oklch(0.27 0.015 60)", accent: "oklch(0.32 0.02 58)" },
};
const DEFAULT_GROUND = { base: "oklch(0.26 0.02 120)", accent: "oklch(0.3 0.03 120)" };

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
  const arena = state.config.arena;
  const ground = GROUND_BY_TERRAIN[arena.terrain] ?? DEFAULT_GROUND;
  // Caixa do campo JÁ inclinado: o viewBox cobre a rotação inteira, para o teatro
  // diagonal não ter os cantos cortados.
  const bounds = fieldBounds();
  // Pré-visualização do posicionamento: segue o cursor, mostra validade e a rota da força.
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  const toArenaCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    // getScreenCTM cobre letterbox/preserveAspectRatio; o fallback por retângulo
    // mantém o mapeamento funcional em ambientes sem CTM (ex.: jsdom).
    const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
    if (ctm) {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const local = point.matrixTransform(ctm.inverse());
      // o campo é desenhado inclinado; desfaz a rotação para voltar ao mundo.
      return worldFromField(local.x, local.y);
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return worldFromField(
      bounds.x + ((clientX - rect.left) / rect.width) * bounds.w,
      bounds.y + ((clientY - rect.top) / rect.height) * bounds.h,
    );
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
    const svg = svgRef.current;
    let unitsPerPixel = 1;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0) unitsPerPixel = 100 / rect.width;
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
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={fieldViewBox()}
        preserveAspectRatio="none"
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
            <stop offset="0%" stopColor={ALLY} stopOpacity="0.24" />
            <stop offset="100%" stopColor={ALLY} stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="enemyZone" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor={ENEMY} stopOpacity="0.24" />
            <stop offset="100%" stopColor={ENEMY} stopOpacity="0.03" />
          </linearGradient>
          <radialGradient id="terrGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="groundDepth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0 0 0)" stopOpacity="0.18" />
            <stop offset="45%" stopColor="oklch(0 0 0)" stopOpacity="0" />
            <stop offset="100%" stopColor="oklch(0 0 0)" stopOpacity="0.18" />
          </linearGradient>
        </defs>

        {/* Fundo do teatro (não inclinado): preenche os cantos que a rotação
            deixa à mostra, para o campo ler como um tabuleiro sobre a mesa. */}
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.w}
          height={bounds.h}
          fill={ground.accent}
          opacity="0.35"
        />

        {/* Teatro inclinado: a câmera gira o campo em diagonal. A cena inteira
            (terreno, territórios, estruturas, unidades, projéteis, efeitos) é
            desenhada em coordenadas do mundo e rotacionada de uma só vez — a
            lógica de jogo e a movimentação não mudam. */}
        <g transform={fieldTransform()}>
          {/* Terreno base — a cor muda por terreno, para cada fase ter cara própria */}
          <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill={ground.base} />
          <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill={ground.accent} opacity="0.5" />
          <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="url(#groundDepth)" />
          {/* Metades: oeste = aliado (azul), leste = inimigo (vermelho) */}
          <rect x="0" y="0" width={WORLD_W / 2} height={WORLD_H} fill="url(#allyZone)" />
          <rect x={WORLD_W / 2} y="0" width={WORLD_W / 2} height={WORLD_H} fill="url(#enemyZone)" />

          {/* Linhas de grade tênues */}
          {Array.from({ length: 9 }, (_, i) => i + 1).map((i) => (
            <line
              key={`v${i}`}
              x1={(i * WORLD_W) / 10}
              y1="0"
              x2={(i * WORLD_W) / 10}
              y2={WORLD_H}
              stroke="oklch(1 0 0 / 0.045)"
              strokeWidth="0.2"
            />
          ))}
          {Array.from({ length: 9 }, (_, i) => i + 1).map((i) => (
            <line
              key={`h${i}`}
              x1="0"
              y1={(i * WORLD_H) / 10}
              x2={WORLD_W}
              y2={(i * WORLD_H) / 10}
              stroke="oklch(1 0 0 / 0.045)"
              strokeWidth="0.2"
            />
          ))}

          {/* Linha divisória das metades (vertical: frente oeste↔leste) */}
          <line
            x1={WORLD_W / 2}
            y1="0"
            x2={WORLD_W / 2}
            y2={WORLD_H}
            stroke="oklch(1 0 0 / 0.18)"
            strokeWidth="0.3"
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
            <TerritoryGlyph key={t.id} territory={t} />
          ))}

          {/* Pontos de controle */}
          {arena.controlPoints.map((p) => (
            <ControlPointGlyph key={p.id} point={p} />
          ))}

          {/* Estruturas */}
          {state.structures.map((s) => (
            <StructureGlyph key={s.id} structure={s} />
          ))}

          {/* Zonas de efeito (fumaça, gás, reconhecimento) */}
          {state.zones.map((z) => (
            <ZoneGlyph key={z.id} zone={z} />
          ))}

          {/* Unidades */}
          {units.map((u) => {
            const dim = u.side === "red" && !u.seen.blue && u.revealed <= 0;
            return <UnitGlyph key={u.id} unit={u} selected={u.id === selectedUnitId} dim={dim} />;
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

function ZoneGlyph({ zone: z }: { zone: EffectZone }) {
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

function StructureGlyph({ structure: s }: { structure: Structure }) {
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

function TerritoryGlyph({ territory: t }: { territory: Territory }) {
  const owned = t.owner !== "neutro";
  const color = owned ? sideColor(t.owner as Side) : "oklch(0.98 0 0)";
  const contested = t.progress.blue > 0 && t.progress.red > 0;
  const progress = Math.max(t.progress.blue, t.progress.red) / 100;
  const ringColor = t.progress.blue >= t.progress.red ? ALLY : ENEMY;
  return (
    <g>
      {/* halo neon da facção (destaque forte no terreno) */}
      <circle cx={t.x} cy={t.y} r={t.radius * 1.9} fill="url(#terrGlow)" opacity={owned ? 0.5 : 1}>
        {!owned && (
          <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
        )}
      </circle>
      {/* anel externo brilhante */}
      <circle
        cx={t.x}
        cy={t.y}
        r={t.radius}
        fill={color}
        opacity={owned ? 0.16 : 0.06}
        stroke={color}
        strokeWidth={owned ? 0.7 : 0.55}
        strokeDasharray={owned ? undefined : "1.4 1.1"}
      >
        {!owned && (
          <animate
            attributeName="stroke-opacity"
            values="0.55;1;0.55"
            dur="1.7s"
            repeatCount="indefinite"
          />
        )}
      </circle>
      {/* núcleo */}
      <circle cx={t.x} cy={t.y} r={t.radius * 0.34} fill={color} opacity={owned ? 0.85 : 0.95} />
      {/* anel de progresso de captura — ultra visível */}
      {!owned && progress > 0 && (
        <circle
          cx={t.x}
          cy={t.y}
          r={t.radius * 0.7}
          fill="none"
          stroke={ringColor}
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * t.radius * 0.7 * progress} ${2 * Math.PI * t.radius * 0.7}`}
          transform={`rotate(-90 ${t.x} ${t.y})`}
        />
      )}
      {contested && (
        <text
          x={t.x}
          y={t.y - t.radius - 1}
          textAnchor="middle"
          fontSize="1.9"
          fontFamily="var(--font-mono)"
          fill="var(--enemy)"
          fontWeight={700}
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

function ControlPointGlyph({ point }: { point: ControlPoint }) {
  const color = point.owner === "neutro" ? "oklch(0.98 0 0)" : sideColor(point.owner);
  const bluePct = point.progress.blue;
  const redPct = point.progress.red;
  const progress = Math.max(bluePct, redPct) / 100;
  const ringColor = bluePct >= redPct ? ALLY : ENEMY;
  const contested = bluePct > 0 && redPct > 0;
  const r = point.radius * 0.7;
  return (
    <g>
      <circle
        cx={point.x}
        cy={point.y}
        r={point.radius * 1.5}
        fill="url(#terrGlow)"
        opacity="0.85"
      />
      <circle
        cx={point.x}
        cy={point.y}
        r={point.radius}
        fill={color}
        opacity={point.owner === "neutro" ? 0.12 : 0.2}
        stroke={color}
        strokeWidth="0.65"
      />
      <circle
        cx={point.x}
        cy={point.y}
        r={point.radius * 0.5}
        fill="none"
        stroke={color}
        strokeWidth="0.4"
        strokeDasharray="1.6 1.4"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${point.x} ${point.y}`}
          to={`360 ${point.x} ${point.y}`}
          dur="9s"
          repeatCount="indefinite"
        />
      </circle>
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
}: {
  unit: BattleUnit;
  selected: boolean;
  dim?: boolean;
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
      <circle cx={unit.x} cy={y} r={r + 0.8} fill={color} opacity={0.16} />
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
