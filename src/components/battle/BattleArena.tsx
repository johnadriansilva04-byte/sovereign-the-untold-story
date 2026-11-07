import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import { cn } from "@/lib/utils";
import type { BattleState, ControlPoint, Side } from "@/game/battle/types";

interface Props {
  state: BattleState;
  pendingCardId: string | null;
  pendingIsGlobal: boolean;
  selectedUnitId: string | null;
  onPlace: (x: number, y: number) => void;
  onSelectUnit: (id: string | null) => void;
  onSelectPoint: (pointId: string) => void;
}

const SIDE_COLOR: Record<Side, string> = { blue: "var(--ally)", red: "var(--enemy)" };

export function BattleArena({
  state,
  pendingCardId,
  pendingIsGlobal,
  selectedUnitId,
  onPlace,
  onSelectUnit,
  onSelectPoint,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const arena = state.config.arena;

  const toArenaCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x, y };
  };

  const handlePointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pendingCardId) return;
    const coords = toArenaCoords(e.clientX, e.clientY);
    if (coords) onPlace(coords.x, coords.y);
  };

  const units = [...state.blue.units, ...state.red.units];
  const selected = units.find((u) => u.id === selectedUnitId) ?? null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className={cn(
          "aspect-square w-full touch-none select-none rounded-sm border border-border bg-land/40",
          pendingCardId ? "cursor-crosshair" : "cursor-default",
        )}
        onPointerDown={handlePointer}
      >
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0 L0 0 0 10" fill="none" stroke="oklch(1 0 0 / 0.05)" strokeWidth="0.3" />
          </pattern>
        </defs>

        <rect x="0" y="0" width="100" height="100" fill="url(#grid)" />

        {/* zonas de desdobramento */}
        {(["red", "blue"] as Side[]).map((s) => {
          const z = arena.deployZone[s];
          return (
            <rect
              key={s}
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              fill={SIDE_COLOR[s]}
              opacity={s === "blue" ? 0.08 : 0.06}
              stroke={SIDE_COLOR[s]}
              strokeOpacity={0.25}
              strokeDasharray="2 2"
              strokeWidth="0.3"
            />
          );
        })}

        {/* rotas sugeridas */}
        {arena.routes.map((r, i) => (
          <line
            key={i}
            x1={r.from[0]}
            y1={r.from[1]}
            x2={r.to[0]}
            y2={r.to[1]}
            stroke="oklch(1 0 0 / 0.12)"
            strokeWidth="0.5"
            strokeDasharray="3 3"
          />
        ))}

        {/* obstáculos */}
        {arena.obstacles.map((o) => (
          <circle
            key={o.id}
            cx={o.x}
            cy={o.y}
            r={o.radius}
            fill={obstacleFill(o.kind)}
            opacity={o.kind === "barricada" ? 0.55 : 0.85}
            stroke={o.kind === "barricada" ? SIDE_COLOR[o.side ?? "blue"] : "oklch(1 0 0 / 0.12)"}
            strokeWidth="0.4"
          />
        ))}

        {/* zonas de efeito */}
        {state.zones.map((z) => (
          <circle
            key={z.id}
            cx={z.x}
            cy={z.y}
            r={z.radius}
            fill={
              z.kind === "fumaca"
                ? "oklch(0.9 0 0 / 0.28)"
                : z.kind === "reconhecimento"
                  ? SIDE_COLOR[z.side]
                  : "var(--doc)"
            }
            opacity={z.kind === "fumaca" ? 0.6 : 0.16}
            stroke={z.kind === "fumaca" ? "oklch(0.9 0 0 / 0.4)" : SIDE_COLOR[z.side]}
            strokeWidth="0.3"
            strokeDasharray="1.5 1.5"
          />
        ))}

        {/* pontos de controle */}
        {arena.controlPoints.map((p) => (
          <ControlPointGlyph key={p.id} point={p} onClick={() => onSelectPoint(p.id)} />
        ))}

        {/* unidades */}
        {units.map((u) => {
          const visible = u.side === "blue" || u.seen.blue || u.revealed > 0;
          if (!visible) {
            return (
              <circle
                key={u.id}
                cx={u.x}
                cy={u.y}
                r={1.4}
                fill="oklch(0.5 0 0 / 0.5)"
                stroke="oklch(1 0 0 / 0.2)"
                strokeWidth="0.2"
              />
            );
          }
          const isSelected = u.id === selectedUnitId;
          return (
            <g
              key={u.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (u.side === "blue") onSelectUnit(isSelected ? null : u.id);
              }}
              className={u.side === "blue" ? "cursor-pointer" : undefined}
            >
              <circle cx={u.x} cy={u.y} r={u.radius} fill={SIDE_COLOR[u.side]} opacity={0.22} />
              <circle
                cx={u.x}
                cy={u.y}
                r={u.radius * 0.62}
                fill={SIDE_COLOR[u.side]}
                stroke={isSelected ? "var(--primary)" : "oklch(0 0 0 / 0.5)"}
                strokeWidth={isSelected ? 0.6 : 0.3}
              />
              {u.smoke > 0 && (
                <circle
                  cx={u.x}
                  cy={u.y}
                  r={u.radius * 0.8}
                  fill="none"
                  stroke="oklch(1 0 0 / 0.5)"
                  strokeWidth="0.25"
                  strokeDasharray="1 1"
                />
              )}
              {u.jammed > 0 && (
                <circle
                  cx={u.x}
                  cy={u.y}
                  r={u.radius * 0.9}
                  fill="none"
                  stroke="var(--ai)"
                  strokeWidth="0.25"
                />
              )}
              <text
                x={u.x}
                y={u.y + 0.9}
                textAnchor="middle"
                fontSize="2.4"
                fontFamily="var(--font-mono)"
                fill="oklch(0.1 0 0)"
                fontWeight={700}
              >
                {u.short}
              </text>
              {/* barra de vida */}
              <rect
                x={u.x - u.radius}
                y={u.y - u.radius - 1.8}
                width={u.radius * 2}
                height={0.9}
                fill="oklch(0 0 0 / 0.5)"
              />
              <rect
                x={u.x - u.radius}
                y={u.y - u.radius - 1.8}
                width={u.radius * 2 * Math.max(0, u.hp / u.maxHp)}
                height={0.9}
                fill={u.hp / u.maxHp > 0.4 ? "var(--fact)" : "var(--enemy)"}
              />
            </g>
          );
        })}

        {/* alcance da unidade selecionada */}
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
      </svg>

      {pendingCardId && (
        <div className="pointer-events-none absolute left-2 top-2 border border-primary bg-background/85 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary">
          {pendingIsGlobal
            ? "Clique em qualquer ponto do teatro"
            : "Clique na sua zona (parte inferior)"}
        </div>
      )}
    </div>
  );
}

function ControlPointGlyph({ point, onClick }: { point: ControlPoint; onClick: () => void }) {
  const color = point.owner === "neutro" ? "var(--neutral)" : SIDE_COLOR[point.owner];
  const bluePct = point.progress.blue;
  const redPct = point.progress.red;
  return (
    <g onClick={onClick} className="cursor-pointer">
      <circle
        cx={point.x}
        cy={point.y}
        r={point.radius}
        fill={color}
        opacity={0.12}
        stroke={color}
        strokeWidth="0.4"
      />
      <circle
        cx={point.x}
        cy={point.y}
        r={point.radius * 0.55}
        fill="none"
        stroke={color}
        strokeWidth="0.3"
        strokeDasharray="1.5 1.5"
      />
      {point.owner === "neutro" && (bluePct > 0 || redPct > 0) && (
        <>
          <rect
            x={point.x - 4}
            y={point.y + point.radius - 0.6}
            width={8}
            height={1}
            fill="oklch(0 0 0 / 0.5)"
          />
          <rect
            x={point.x - 4}
            y={point.y + point.radius - 0.6}
            width={8 * (bluePct / 100)}
            height={1}
            fill="var(--ally)"
          />
          <rect
            x={point.x + 4 - 8 * (redPct / 100)}
            y={point.y + point.radius - 0.6}
            width={8 * (redPct / 100)}
            height={1}
            fill="var(--enemy)"
          />
        </>
      )}
      <text
        x={point.x}
        y={point.y - point.radius - 0.8}
        textAnchor="middle"
        fontSize="2.2"
        fontFamily="var(--font-mono)"
        fill={color}
        letterSpacing="0.1"
      >
        {point.sector.toUpperCase()} · {point.value}
      </text>
    </g>
  );
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
