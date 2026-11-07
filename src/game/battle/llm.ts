// Comandante IA baseado em LLM.
// A IA continua sujeita às MESMAS regras: só vê o que o reconhecimento dela alcança,
// só gasta o comando que tem e só usa cartas da própria mão. O modelo apenas *decide*
// onde e quando empregar cada carta. Se o gateway não estiver configurado, o jogo cai
// automaticamente na IA tática local — nunca trava.

import { cardById } from "./catalog";
import { effectiveCost, isVisibleTo } from "./engine";
import type { BattleState, ControlPoint, Side } from "./types";

export interface CommanderCardOption {
  id: string;
  name: string;
  category: string;
  cost: number;
}

export interface CommanderContext {
  commanderName: string;
  personality: string;
  doctrine: string;
  objective: string;
  timeLeft: number;
  command: number;
  commandMax: number;
  score: number;
  hand: CommanderCardOption[];
  controlPoints: { id: string; name: string; sector: string; owner: string }[];
  visibleEnemies: { name: string; category: string; x: number; y: number; hpPct: number }[];
  ownUnits: { name: string; category: string; x: number; y: number; hpPct: number }[];
  deployZone: { x: number; y: number; w: number; h: number };
  recentLog: string[];
  legalCardIds: string[];
}

export interface CommanderDecision {
  cardId: string;
  x: number;
  y: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Contexto enviado ao modelo
// ---------------------------------------------------------------------------

export function buildCommanderContext(state: BattleState, side: Side = "red"): CommanderContext {
  const cfg = side === "blue" ? state.blue : state.red;
  const enemy = side === "blue" ? state.red : state.blue;
  const zone = state.config.arena.deployZone[side];

  const hand: CommanderCardOption[] = cfg.deck.hand
    .map((h) => {
      const card = cardById(h.cardId);
      return {
        id: card.id,
        name: card.name,
        category: card.category,
        cost: effectiveCost(card, cfg.doctrine),
      };
    })
    .filter((c) => c.cost <= cfg.command);

  const visibleEnemies = enemy.units
    .filter((u) => u.alive && isVisibleTo(state, u, side))
    .map((u) => ({
      name: u.name,
      category: u.category,
      x: Math.round(u.x),
      y: Math.round(u.y),
      hpPct: Math.round((u.hp / u.maxHp) * 100),
    }));

  const ownUnits = cfg.units
    .filter((u) => u.alive)
    .map((u) => ({
      name: u.name,
      category: u.category,
      x: Math.round(u.x),
      y: Math.round(u.y),
      hpPct: Math.round((u.hp / u.maxHp) * 100),
    }));

  return {
    commanderName: cfg.commander.name,
    personality: cfg.commander.personality,
    doctrine: cfg.doctrine,
    objective: state.config.objectiveText,
    timeLeft: Math.max(0, Math.round(state.config.duration - state.t)),
    command: Math.floor(cfg.command),
    commandMax: cfg.commandMax,
    score: Math.round(cfg.score),
    hand,
    controlPoints: state.config.arena.controlPoints.map((p) => ({
      id: p.id,
      name: p.name,
      sector: p.sector,
      owner: p.owner,
    })),
    visibleEnemies,
    ownUnits,
    deployZone: { x: zone.x, y: zone.y, w: zone.w, h: zone.h },
    recentLog: state.log.slice(0, 6).map((l) => l.text),
    legalCardIds: hand.map((c) => c.id),
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const COMMANDER_SYSTEM_PROMPT = `Você é um comandante militar em SOVEREIGN, um jogo de batalha tática em tempo real.
Você comanda um exército e precisa decidir UMA ação agora.

Regras que você deve respeitar:
- Você só pode usar cartas listadas em "hand" (sua mão atual).
- O custo da carta não pode passar do seu "command" disponível.
- Unidades terrestres só podem ser posicionadas dentro de "deployZone".
- Cartas de apoio de área (ataque aéreo, fumaça, interferência, reconhecimento) podem ir em qualquer ponto.
- Coordenadas são um plano 0-100 (x: oeste→leste, y: norte→sul). Seu lado desdobra perto da sua deployZone.
- Você só enxerga inimigos listados em "visibleEnemies" — não invente informação.

Estratégia: pense como um comandante real. Dispute pontos de controle de maior valor,
contra-ataque concentrações inimigas, economize quando não houver boa jogada e proteja seus pontos.

Responda APENAS com JSON válido, sem texto extra:
{"cardId": "<id da carta da mão>", "x": <0-100>, "y": <0-100>, "reason": "<uma frase curta em português>"}`;

export function buildCommanderPrompt(ctx: CommanderContext): string {
  return `Estado da batalha:
${JSON.stringify(ctx, null, 2)}

Decida sua próxima ação. Responda somente com o JSON.`;
}

// ---------------------------------------------------------------------------
// Parsing defensivo da resposta
// ---------------------------------------------------------------------------

export function parseCommanderDecision(
  raw: string,
  legalCardIds: string[],
): CommanderDecision | null {
  if (!raw) return null;
  const json = extractJson(raw) as {
    cardId?: unknown;
    x?: unknown;
    y?: unknown;
    reason?: unknown;
  } | null;
  if (!json) return null;
  const cardId = typeof json.cardId === "string" ? json.cardId : null;
  if (!cardId || !legalCardIds.includes(cardId)) return null;
  const x = Number(json.x);
  const y = Number(json.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const reason =
    typeof json.reason === "string" && json.reason.trim()
      ? json.reason.trim().slice(0, 160)
      : "Decisão do comandante.";
  return {
    cardId,
    x: Math.max(1, Math.min(99, x)),
    y: Math.max(1, Math.min(99, y)),
    reason,
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ajuste de posição legal (a IA não pode trapacear)
// ---------------------------------------------------------------------------

export function clampToLegalPlacement(
  state: BattleState,
  side: Side,
  cardId: string,
  x: number,
  y: number,
): { x: number; y: number } {
  const card = cardById(cardId);
  const global =
    card.kind === "apoio" &&
    ["ataque_aereo", "fumaca", "interferencia", "reconhecimento"].includes(card.ability);
  if (global) return { x: clamp(x, 1, 99), y: clamp(y, 1, 99) };
  const z = state.config.arena.deployZone[side];
  return {
    x: clamp(x, z.x + 1, z.x + z.w - 1),
    y: clamp(y, z.y + 1, z.y + z.h - 1),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Reexporta para testes do adaptador.
export const _internal = { extractJson };
export type { ControlPoint };
