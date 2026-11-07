// Comandante de IA de SOVEREIGN.
// A IA joga pelas MESMAS regras do humano: gasta Pontos de Comando, só vê o que seu
// reconhecimento vê e só usa cartas que estão na própria mão. Personalidades mudam o
// comportamento, não as regras.

import { cardById, doctrines } from "./catalog";
import { deploy, dist, effectiveCost, isVisibleTo, issueOrder, nextRandom, other } from "./engine";
import type {
  BattleState,
  CommanderPersonality,
  ControlPoint,
  MilitaryCard,
  Side,
  UnitCategory,
} from "./types";

interface AiMemory {
  cooldown: number;
}

const memory: WeakMap<BattleState, AiMemory> = new WeakMap();

export function aiTick(state: BattleState, dt: number): void {
  if (!state.running) return;
  if (state.t < 6) return; // respeita a mobilização
  let mem = memory.get(state);
  if (!mem) {
    mem = { cooldown: 0 };
    memory.set(state, mem);
  }
  mem.cooldown -= dt;
  if (mem.cooldown > 0) return;

  const cfg = state.red;
  const personality = cfg.commander.personality;
  const diff = state.config.aiDifficulty;
  const interval = intervalFor(personality) * (diff?.intervalMult ?? 1);
  mem.cooldown = interval + nextRandom(state) * 0.6;

  const decision = decide(state, "red");
  if (decision) {
    const cost = effectiveCost(cardById(decision.cardId), cfg.doctrine);
    if (cfg.command >= cost) {
      // a IA só "pensa" em voz alta no log — leitura estratégica para o jogador
      pushAiLog(state, decision.reason);
      deploy(state, "red", decision.cardId, decision.x, decision.y);
    }
  }
}

interface AiDecision {
  cardId: string;
  x: number;
  y: number;
  reason: string;
}

function decide(state: BattleState, side: Side): AiDecision | null {
  const cfg = state.red;
  const personality = cfg.commander.personality;
  const enemy = other(side);
  const hand = cfg.deck.hand.map((h) => h.cardId);
  if (hand.length === 0) return null;

  // informação limitada: apenas inimigos visíveis
  const enemyCfg = enemy === "blue" ? state.blue : state.red;
  const visible = enemyCfg.units.filter((u) => u.alive && isVisibleTo(state, u, side));
  const enemyCategories = countCategories(visible);

  const reserve = Math.max(
    0,
    reserveFor(personality, cfg.commandMax) + (state.config.aiDifficulty?.reserveBonus ?? 0),
  );
  const affordable = hand.filter((id) => {
    const cost = effectiveCost(cardById(id), cfg.doctrine);
    return cfg.command - cost >= reserve;
  });
  if (affordable.length === 0) return null;

  const target = chooseTarget(state, side, personality, visible);

  // escolhe a carta: prioriza contra-medida, depois custo-benefício
  const scored = affordable
    .map((id) => {
      const card = cardById(id);
      const cost = effectiveCost(card, cfg.doctrine);
      const score = cardScore(state, id, card.category, enemyCategories, personality, cost);
      return { id, score };
    })
    .sort((a, b) => b.score - a.score);

  const chosen = scored[0];
  if (!chosen || chosen.score <= 0) return null;

  const card = cardById(chosen.id);
  const pos = placement(
    state,
    side,
    target,
    card.kind === "militar" ? (card as MilitaryCard).radius : 3,
  );
  const reason = reasoning(chosen.id, card.category, target, enemyCategories);
  return { cardId: chosen.id, x: pos.x, y: pos.y, reason };
}

function intervalFor(p: CommanderPersonality): number {
  switch (p) {
    case "Agressivo":
      return 1.4;
    case "Econômico":
      return 3.2;
    case "Cauteloso":
      return 2.8;
    case "Oportunista":
      return 2.0;
    case "Metódico":
    default:
      return 2.2;
  }
}

function reserveFor(p: CommanderPersonality, max: number): number {
  switch (p) {
    case "Cauteloso":
      return 3;
    case "Econômico":
      return Math.round(max * 0.5);
    case "Agressivo":
      return 0;
    default:
      return 1;
  }
}

function countCategories(units: { category: UnitCategory }[]): Record<UnitCategory, number> {
  const out = {
    infantaria: 0,
    blindado: 0,
    artilharia: 0,
    defesa: 0,
    reconhecimento: 0,
    apoio: 0,
  } as Record<UnitCategory, number>;
  for (const u of units) out[u.category] += 1;
  return out;
}

function cardScore(
  state: BattleState,
  cardId: string,
  category: UnitCategory | "apoio",
  enemyCats: Record<UnitCategory, number>,
  personality: CommanderPersonality,
  cost: number,
): number {
  const card = cardById(cardId);
  let score = 1;
  const hasEnemy = (c: UnitCategory) => enemyCats[c] > 0;

  if (category === "defesa") {
    if (
      card.kind === "militar" &&
      card.targets === "aereo" &&
      (hasEnemy("reconhecimento") || hasEnemy("artilharia"))
    )
      score += 2;
    if (cardId === "def-engenharia" && hasEnemy("blindado")) score += 2.4;
    if (cardId === "def-fortificacao") score += personality === "Cauteloso" ? 1.4 : 0.2;
  }
  if (category === "infantaria") {
    if (hasEnemy("infantaria")) score += 1.4;
    if (personality === "Agressivo" || personality === "Oportunista") score += 0.6;
  }
  if (category === "blindado") {
    if (hasEnemy("infantaria")) score += 1.6;
    if (personality === "Agressivo") score += 1.0;
    if (cardId === "bld-pesado") score += 0.4;
  }
  if (category === "artilharia") {
    if (hasEnemy("infantaria") || hasEnemy("defesa")) score += 1.2;
    if (personality === "Econômico") score += 1.0;
  }
  if (category === "reconhecimento") {
    const seen = state.red.units.filter((u) => u.alive).length;
    if (seen < 2) score += 1.2;
    score += 0.3;
  }
  if (category === "apoio") {
    score += state.red.units.filter((u) => u.alive).length > 2 ? 0.8 : 0;
    if (card.kind === "apoio" && card.ability === "ataque_aereo") {
      const enemyNearPoint = enemyCats.infantaria + enemyCats.blindado;
      if (enemyNearPoint >= 2) score += 2.5;
      else score -= 1.5;
    }
    if (card.kind === "apoio" && card.ability === "reforcos") score += 0.4;
  }
  // economia: cartas caras exigem justificativa
  score -= cost * (personality === "Econômico" ? 0.05 : 0.12);
  return score;
}

function chooseTarget(
  state: BattleState,
  side: Side,
  personality: CommanderPersonality,
  visible: { x: number; y: number }[],
): ControlPoint {
  const points = state.config.arena.controlPoints;
  const own = points.filter((p) => p.owner === side);
  const contested = points.filter((p) => p.owner !== side);
  const fallback = points[0]!;

  // ameaça: inimigos visíveis perto de um ponto nosso
  const threatened = own.find((p) =>
    visible.some((u) => dist(u.x, u.y, p.x, p.y) <= p.radius + 14),
  );

  if (personality === "Cauteloso" && threatened) return threatened;
  if (personality === "Agressivo") {
    return contested.slice().sort((a, b) => b.value - a.value)[0] ?? own[0] ?? fallback;
  }
  if (personality === "Oportunista") {
    // objetivo contestado com menos presença inimiga visível
    const scored = contested
      .map((p) => ({
        p,
        threat: visible.filter((u) => dist(u.x, u.y, p.x, p.y) <= p.radius + 12).length,
      }))
      .sort((a, b) => a.threat - b.threat || b.p.value - a.p.value);
    return scored[0]?.p ?? fallback;
  }
  if (personality === "Econômico" && own.length > 0 && visible.length < 2) {
    return own[0]!;
  }
  // Metódico / padrão: disputa o objetivo de maior valor que ainda não é seu
  return contested.slice().sort((a, b) => b.value - a.value)[0] ?? fallback;
}

// Coloca a unidade na própria zona de desdobramento, na borda voltada ao objetivo.
function placement(
  state: BattleState,
  side: Side,
  target: ControlPoint,
  radius: number,
): { x: number; y: number } {
  const z = state.config.arena.deployZone[side];
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  const reach = Math.min(z.w, z.h) / 2 - 2;
  const x = clamp(cx + (dx / len) * reach, z.x + radius, z.x + z.w - radius);
  const y = clamp(cy + (dy / len) * reach, z.y + radius, z.y + z.h - radius);
  return { x, y };
}

function reasoning(
  cardId: string,
  category: string,
  target: ControlPoint,
  enemyCats: Record<UnitCategory, number>,
): string {
  const enemyTop = (Object.entries(enemyCats) as [UnitCategory, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const topKind = enemyTop?.[0];
  const topCount = enemyTop?.[1] ?? 0;
  if (cardId === "def-engenharia" && topCount > 0 && topKind === "blindado") {
    return `Leitura: blindados inimigos à vista. Engenharia desdobrada para ${target.name}.`;
  }
  if (cardId === "def-aa" && topCount > 0) {
    return `Leitura: ameaça aérea e de apoio. Antiaérea posicionada para ${target.name}.`;
  }
  return `Decisão: ${category} enviada para disputar ${target.name}.`;
}

function pushAiLog(state: BattleState, text: string): void {
  state.log.unshift({ t: state.t, side: "red", kind: "ia", text });
  if (state.log.length > 120) state.log.length = 120;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Exposto para o modo "espectador" e testes: apenas ordens defensivas simples.
export function aiIssueOrders(state: BattleState): void {
  if (state.red.units.length > 0 && state.t > 20) {
    const hasOwn = state.config.arena.controlPoints.some((p) => p.owner === "red");
    issueOrder(state, "red", hasOwn ? "defender" : "avancar");
  }
}

export const _internal = { doctrines, decide };
