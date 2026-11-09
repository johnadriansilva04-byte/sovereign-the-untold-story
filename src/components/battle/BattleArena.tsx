import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { canDeploy, originFor } from "@/game/battle/engine";
import type {
  BattleState,
  BattleUnit,
  ControlPoint,
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
  onPlace: (x: number, y: number) => void;
  onSelectUnit: (id: string | null) => void;
  onSelectPoint: (pointId: string) => void;
}

const ALLY = "var(--ally)";
const ENEMY = "var(--enemy)";

const sideColor = (s: Side): string => (s === "blue" ? ALLY : ENEMY);

export function BattleArena({
  state,
  pendingCardId,
  pendingIsGlobal,
  selectedUnitId,
  onPlace,
  onSelectUnit,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const arena = state.config.arena;
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
      return { x: local.x, y: local.y };
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const handlePointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const coords = toArenaCoords(e.clientX, e.clientY);
    if (!coords) return;
    // Com carta na mão, o clique no teatro é uma ORDEM (desdobrar).
    if (pendingCardId) {
      onPlace(coords.x, coords.y);
      return;
    }
    // Sem carta: o clique seleciona a unidade aliada mais próxima. A tolerância é
    // medida em PIXELS (não em unidades da arena) para continuar clicável quando o
    // teatro encolhe — antes o alvo era o próprio glifo (poucos pixels) e o toque
    // errava a unidade.
    const hitId = pickAllyUnit(coords.x, coords.y);
    if (hitId) onSelectUnit(hitId === selectedUnitId ? null : hitId);
    else onSelectUnit(null);
  };

  // Unidade aliada mais próxima do ponto, dentro de uma tolerância em pixels.
  const pickAllyUnit = (ax: number, ay: number): string | null => {
    const svg = svgRef.current;
    let unitsPerPixel = 1;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0) unitsPerPixel = 100 / rect.width;
    }
    const tolerance = Math.max(14 * unitsPerPixel, 3.2);
    let best: { id: string; d: number } | null = null;
    for (const u of state.blue.units) {
      if (!u.alive) continue;
      const d = Math.hypot(ax - u.x, ay - u.y);
      if (d <= Math.max(tolerance, u.radius + 1.6) && (!best || d < best.d)) best = { id: u.id, d };
    }
    return best?.id ?? null;
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
    <div className="relative h-[min(100cqw,100cqh)] w-[min(100cqw,100cqh)]">
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className={cn(
          "h-full w-full touch-none select-none rounded-sm border border-border",
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
          if (coords) onPlace(coords.x, coords.y);
          setGhost(null);
        }}
      >
        <defs>
          <linearGradient id="allyZone" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={ALLY} stopOpacity="0.22" />
            <stop offset="100%" stopColor={ALLY} stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="enemyZone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ENEMY} stopOpacity="0.22" />
            <stop offset="100%" stopColor={ENEMY} stopOpacity="0.04" />
          </linearGradient>
          <radialGradient id="terrGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Terreno base */}
        <rect x="0" y="0" width="100" height="100" fill="oklch(0.26 0.03 120)" />
        <rect x="0" y="0" width="100" height="100" fill="url(#enemyZone)" />
        <rect
          x="0"
          y="0"
          width="100"
          height="50"
          fill="url(#allyZone)"
          transform="translate(0,50)"
        />

        {/* Linhas de grade tênues */}
        {Array.from({ length: 9 }, (_, i) => i + 1).map((i) => (
          <line
            key={`v${i}`}
            x1={i * 10}
            y1="0"
            x2={i * 10}
            y2="100"
            stroke="oklch(1 0 0 / 0.045)"
            strokeWidth="0.2"
          />
        ))}
        {Array.from({ length: 9 }, (_, i) => i + 1).map((i) => (
          <line
            key={`h${i}`}
            x1="0"
            y1={i * 10}
            x2="100"
            y2={i * 10}
            stroke="oklch(1 0 0 / 0.045)"
            strokeWidth="0.2"
          />
        ))}

        {/* Linha divisória das metades */}
        <line
          x1="0"
          y1="50"
          x2="100"
          y2="50"
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

        {/* Zonas de efeito (fumaça/reconhecimento) */}
        {state.zones.map((z) => (
          <circle
            key={z.id}
            cx={z.x}
            cy={z.y}
            r={z.radius}
            fill={z.kind === "fumaca" ? "oklch(0.92 0 0 / 0.3)" : sideColor(z.side)}
            opacity={z.kind === "fumaca" ? 0.5 : 0.12}
            stroke={z.kind === "fumaca" ? "oklch(0.95 0 0 / 0.4)" : sideColor(z.side)}
            strokeWidth="0.25"
            strokeDasharray="1.2 1.2"
          />
        ))}

        {/* Unidades */}
        {units.map((u) => {
          const visible = u.side === "blue" || u.seen.blue || u.revealed > 0;
          if (!visible) {
            return <circle key={u.id} cx={u.x} cy={u.y} r={1.2} fill="oklch(0.5 0 0 / 0.45)" />;
          }
          return <UnitGlyph key={u.id} unit={u} selected={u.id === selectedUnitId} />;
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
  const color = owned ? sideColor(t.owner as Side) : "#ffffff";
  return (
    <g>
      <circle
        cx={t.x}
        cy={t.y}
        r={t.radius * 1.6}
        fill="url(#terrGlow)"
        opacity={owned ? 0.4 : 0.9}
      />
      <circle
        cx={t.x}
        cy={t.y}
        r={t.radius}
        fill={color}
        opacity={owned ? 0.14 : 0.05}
        stroke={color}
        strokeWidth="0.35"
        strokeDasharray={owned ? undefined : "1 1"}
      />
      <circle cx={t.x} cy={t.y} r={t.radius * 0.35} fill={color} opacity={owned ? 0.7 : 0.9}>
        {!owned && (
          <animate
            attributeName="opacity"
            values="0.4;0.95;0.4"
            dur="1.8s"
            repeatCount="indefinite"
          />
        )}
      </circle>
      {!owned && (t.progress.blue > 0 || t.progress.red > 0) && (
        <>
          <rect
            x={t.x - t.radius}
            y={t.y + t.radius + 0.6}
            width={t.radius * 2}
            height="0.9"
            fill="oklch(0 0 0 / 0.5)"
          />
          <rect
            x={t.x - t.radius}
            y={t.y + t.radius + 0.6}
            width={t.radius * 2 * (t.progress.blue / 100)}
            height="0.9"
            fill={ALLY}
          />
          <rect
            x={t.x + t.radius - t.radius * 2 * (t.progress.red / 100)}
            y={t.y + t.radius + 0.6}
            width={t.radius * 2 * (t.progress.red / 100)}
            height="0.9"
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
  const color = point.owner === "neutro" ? "var(--neutral)" : sideColor(point.owner);
  const bluePct = point.progress.blue;
  const redPct = point.progress.red;
  return (
    <g>
      <circle
        cx={point.x}
        cy={point.y}
        r={point.radius}
        fill={color}
        opacity={0.1}
        stroke={color}
        strokeWidth="0.4"
      />
      <circle
        cx={point.x}
        cy={point.y}
        r={point.radius * 0.5}
        fill="none"
        stroke={color}
        strokeWidth="0.3"
        strokeDasharray="1.5 1.5"
      />
      {point.owner === "neutro" && (bluePct > 0 || redPct > 0) && (
        <>
          <rect
            x={point.x - 4}
            y={point.y + point.radius - 0.4}
            width={8}
            height="1"
            fill="oklch(0 0 0 / 0.5)"
          />
          <rect
            x={point.x - 4}
            y={point.y + point.radius - 0.4}
            width={8 * (bluePct / 100)}
            height="1"
            fill={ALLY}
          />
          <rect
            x={point.x + 4 - 8 * (redPct / 100)}
            y={point.y + point.radius - 0.4}
            width={8 * (redPct / 100)}
            height="1"
            fill={ENEMY}
          />
        </>
      )}
      <text
        x={point.x}
        y={point.y - point.radius - 0.8}
        textAnchor="middle"
        fontSize="2"
        fontFamily="var(--font-mono)"
        fill={color}
      >
        {point.sector.toUpperCase()}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Unidades — silhuetas distintas por modelo
// ---------------------------------------------------------------------------

function UnitGlyph({ unit, selected }: { unit: BattleUnit; selected: boolean }) {
  const color = sideColor(unit.side);
  const airborne = unit.domain === "aereo";
  const y = airborne ? unit.y - 2.4 : unit.y;
  return (
    <g pointerEvents="none">
      {airborne && (
        <ellipse
          cx={unit.x}
          cy={unit.y + 1.6}
          rx={unit.radius * 0.9}
          ry={unit.radius * 0.4}
          fill="oklch(0 0 0 / 0.35)"
        />
      )}
      <circle cx={unit.x} cy={y} r={unit.radius + 0.8} fill={color} opacity={0.16} />
      <g transform={`translate(${unit.x} ${y}) rotate(${(unit.aim * 180) / Math.PI})`}>
        {unitModel(unit.model, color, selected)}
      </g>
      {unit.smoke > 0 && (
        <circle
          cx={unit.x}
          cy={y}
          r={unit.radius * 1.1}
          fill="none"
          stroke="oklch(1 0 0 / 0.5)"
          strokeWidth="0.25"
          strokeDasharray="1 1"
        />
      )}
      {unit.jammed > 0 && (
        <circle
          cx={unit.x}
          cy={y}
          r={unit.radius * 1.2}
          fill="none"
          stroke="var(--ai)"
          strokeWidth="0.25"
        />
      )}
      {/* barra de vida */}
      <rect
        x={unit.x - unit.radius}
        y={y - unit.radius - 1.8}
        width={unit.radius * 2}
        height="0.9"
        fill="oklch(0 0 0 / 0.5)"
      />
      <rect
        x={unit.x - unit.radius}
        y={y - unit.radius - 1.8}
        width={unit.radius * 2 * Math.max(0, unit.hp / unit.maxHp)}
        height="0.9"
        fill={unit.hp / unit.maxHp > 0.4 ? "var(--fact)" : "var(--enemy)"}
      />
      <text
        x={unit.x}
        y={y + 0.9}
        textAnchor="middle"
        fontSize="2"
        fontFamily="var(--font-mono)"
        fill="oklch(0.08 0 0)"
        fontWeight={700}
        transform={`rotate(0)`}
      >
        {unit.short}
      </text>
    </g>
  );
}

// Desenha o modelo da unidade centrado na origem, com o "nariz" apontando para +x.
function unitModel(model: BattleUnit["model"], color: string, selected: boolean): ReactNode {
  const outline = selected ? "var(--primary)" : "oklch(0 0 0 / 0.5)";
  const sw = selected ? 0.5 : 0.28;
  const body = (children: ReactNode) => (
    <g stroke={outline} strokeWidth={sw}>
      {children}
    </g>
  );
  switch (model) {
    case "soldado-fuzil":
      return body(
        <>
          <circle r="0.7" fill={color} />
          <rect x="-0.3" y="-0.7" width="1.7" height="1.4" fill={color} rx="0.2" />
          <line x1="0.6" y1="0" x2="2.2" y2="0" stroke={color} strokeWidth="0.4" />
        </>,
      );
    case "soldado-assalto":
      return body(
        <>
          <circle r="0.8" fill={color} />
          <rect x="-0.3" y="-0.9" width="1.9" height="1.8" fill={color} rx="0.25" />
          <line x1="0.7" y1="-0.3" x2="2.3" y2="-0.3" stroke={color} strokeWidth="0.4" />
          <rect x="-0.9" y="-1" width="0.8" height="2" fill={color} opacity={0.7} />
        </>,
      );
    case "soldado-antitanque":
      return body(
        <>
          <circle r="0.7" fill={color} />
          <rect x="-0.3" y="-0.7" width="1.5" height="1.4" fill={color} rx="0.2" />
          <rect x="0.6" y="-0.5" width="2.4" height="1" fill={color} rx="0.15" />
          <line x1="0.9" y1="-0.6" x2="0.9" y2="0.6" stroke={color} strokeWidth="0.3" />
        </>,
      );
    case "engenheiro":
      return body(
        <>
          <circle r="0.7" fill={color} />
          <rect x="-0.3" y="-0.7" width="1.4" height="1.4" fill={color} rx="0.2" />
          <rect x="0.4" y="-0.9" width="1" height="1.8" fill="var(--doc)" opacity={0.85} />
          <line x1="1.2" y1="-1.1" x2="1.2" y2="1.1" stroke="var(--doc)" strokeWidth="0.3" />
        </>,
      );
    case "canhao":
      return body(
        <>
          <rect x="-1.6" y="-1" width="2.4" height="2" fill={color} rx="0.25" />
          <circle cx="-1.2" cy="-1.1" r="0.5" fill="oklch(0.2 0 0)" />
          <circle cx="-1.2" cy="1.1" r="0.5" fill="oklch(0.2 0 0)" />
          <rect x="0.6" y="-0.35" width="2.8" height="0.7" fill={color} rx="0.15" />
        </>,
      );
    case "artilharia-pesada":
      return body(
        <>
          <rect x="-2" y="-1.3" width="3" height="2.6" fill={color} rx="0.3" />
          <circle cx="-1.5" cy="-1.4" r="0.6" fill="oklch(0.2 0 0)" />
          <circle cx="-1.5" cy="1.4" r="0.6" fill="oklch(0.2 0 0)" />
          <rect x="0.8" y="-0.45" width="3.6" height="0.9" fill={color} rx="0.15" />
          <rect x="-0.4" y="-0.6" width="1.4" height="1.2" fill={color} opacity={0.6} />
        </>,
      );
    case "lmf":
      return body(
        <>
          <rect x="-1.8" y="-1.1" width="2.6" height="2.2" fill={color} rx="0.25" />
          <rect
            x="0.7"
            y="-1"
            width="1.9"
            height="2"
            fill="oklch(0.18 0 0)"
            stroke={color}
            strokeWidth="0.3"
          />
          {[-0.6, -0.2, 0.2, 0.6].map((yy) => (
            <circle key={yy} cx="0.9" cy={yy} r="0.18" fill={color} />
          ))}
        </>,
      );
    case "lancador-missil":
      return body(
        <>
          <rect x="-2.2" y="-1" width="3" height="2" fill={color} rx="0.25" />
          <circle cx="-1.7" cy="-1.1" r="0.5" fill="oklch(0.2 0 0)" />
          <circle cx="-1.7" cy="1.1" r="0.5" fill="oklch(0.2 0 0)" />
          <rect x="0.7" y="-0.8" width="3" height="1.6" fill={color} rx="0.5" />
        </>,
      );
    case "tanque":
      return body(
        <>
          <rect x="-2.2" y="-1.4" width="4.2" height="2.8" fill={color} rx="0.3" />
          <rect x="-2.2" y="-1.7" width="4.2" height="0.5" fill="oklch(0.15 0 0)" />
          <rect x="-2.2" y="1.2" width="4.2" height="0.5" fill="oklch(0.15 0 0)" />
          <circle cx="0" cy="0" r="1.05" fill={color} opacity={0.9} />
          <rect
            x="0.8"
            y="-0.28"
            width="3.4"
            height="0.56"
            fill="oklch(0.15 0 0)"
            stroke={color}
            strokeWidth="0.25"
          />
        </>,
      );
    case "vbld":
      return body(
        <>
          <path d="M-2 -1.3 L1.6 -1.3 L2.4 0 L1.6 1.3 L-2 1.3 Z" fill={color} />
          <circle cx="0" cy="0" r="0.7" fill="oklch(0.18 0 0)" stroke={color} strokeWidth="0.2" />
          <line x1="1.2" y1="0" x2="2.6" y2="0" stroke={color} strokeWidth="0.4" />
        </>,
      );
    case "drone-recon":
      return body(
        <>
          <ellipse rx="0.9" ry="0.5" fill={color} />
          <line x1="-1.6" y1="-1" x2="1.6" y2="1" stroke={color} strokeWidth="0.3" />
          <line x1="-1.6" y1="1" x2="1.6" y2="-1" stroke={color} strokeWidth="0.3" />
          {[-1.5, 1.5].map((xx) =>
            [-1, 1].map((yy) => (
              <circle key={`${xx}-${yy}`} cx={xx} cy={yy} r="0.35" fill={color} opacity={0.7}>
                <animate
                  attributeName="opacity"
                  values="0.3;0.8;0.3"
                  dur="0.3s"
                  repeatCount="indefinite"
                />
              </circle>
            )),
          )}
          <circle cx="0" cy="0" r="0.35" fill="oklch(0.95 0 0 / 0.9)" />
        </>,
      );
    case "drone-combate":
      return body(
        <>
          <ellipse rx="1.1" ry="0.65" fill={color} />
          <line x1="-1.8" y1="-1.2" x2="1.8" y2="1.2" stroke={color} strokeWidth="0.3" />
          <line x1="-1.8" y1="1.2" x2="1.8" y2="-1.2" stroke={color} strokeWidth="0.3" />
          <rect
            x="0.9"
            y="-0.25"
            width="1.6"
            height="0.5"
            fill="oklch(0.15 0 0)"
            stroke={color}
            strokeWidth="0.2"
          />
          <circle cx="0" cy="0" r="0.4" fill="var(--enemy)" opacity={0.8} />
        </>,
      );
    case "aa":
      return body(
        <>
          <rect x="-1.4" y="-1" width="2" height="2" fill={color} rx="0.25" />
          <line x1="0.4" y1="-0.4" x2="2.6" y2="-0.6" stroke={color} strokeWidth="0.35" />
          <line x1="0.4" y1="0.4" x2="2.6" y2="0.6" stroke={color} strokeWidth="0.35" />
        </>,
      );
    case "fortificacao":
      return body(
        <>
          <rect x="-2" y="-1.6" width="4" height="3.2" fill={color} rx="0.2" />
          <rect
            x="-1.4"
            y="-1"
            width="2.8"
            height="2"
            fill="oklch(0.18 0 0)"
            stroke={color}
            strokeWidth="0.2"
          />
          <line x1="0.4" y1="0" x2="2.6" y2="0" stroke={color} strokeWidth="0.4" />
        </>,
      );
    case "posto":
      return body(
        <>
          <rect x="-1.4" y="-1.4" width="2.8" height="2.8" fill={color} rx="0.2" />
          <rect x="-0.4" y="-0.4" width="0.8" height="0.8" fill="var(--fact)" />
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
