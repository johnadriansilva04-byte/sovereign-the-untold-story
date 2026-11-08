// Comandante de IA de SOVEREIGN — versão competitiva.
//
// A IA joga pelas MESMAS regras do humano: gasta Pontos de Comando, só enxerga o que
// o seu reconhecimento enxerga e só usa as cartas da própria mão. Nada de recursos
// infinitos ou visão total do mapa.
//
// O que muda em relação a um bot trivial: a IA avalia o tabuleiro inteiro a cada
// decisão (composição inimiga visível, pontos ameaçados, tempo, placar), escolhe a
// carta que melhor responde, posiciona com intenção (interceptar, flanquear, cobrir),
// economiza para um golpe e coordena duas cartas quando vale a pena.
//
// Os pesos de decisão são ajustáveis por auto-treino (ver training.ts). A mesma função
// comanda qualquer lado — é isso que permite a IA jogar contra si mesma milhares de vezes.

import { cardById, doctrines } from "./catalog";
import { deploy, dist, effectiveCost, isVisibleTo, issueOrder, nextRandom, other } from "./engine";
import type {
  BattleState,
  Card,
  CommanderPersonality,
  ControlPoint,
  MilitaryCard,
  Order,
  Side,
  SupportAbility,
  SupportCard,
  Territory,
  UnitCategory,
} from "./types";

// ---------------------------------------------------------------------------
// Pesos de decisão (tunáveis por auto-treino)
// ---------------------------------------------------------------------------

export interface AiWeights {
  counter: number; // peso de contramedida contra a composição inimiga
  economy: number; // peso de economizar / guardar para um golpe
  objective: number; // foco nos pontos de controle
  aggression: number; // disposição a pressionar
  support: number; // uso de cartas de apoio
  coord: number; // tendência a coordenar duas cartas no mesmo ciclo
}

export const defaultAiWeights: AiWeights = {
  counter: 1,
  economy: 1,
  objective: 1,
  aggression: 1,
  support: 1,
  coord: 1,
};

// Pesos calibrados por auto-jogo (60.030 partidas — ver training.ts).
// Contra o baseline neutro, esta configuração venceu ~83% das partidas simétricas.
export const trainedAiWeights: AiWeights = {
  counter: 0.47,
  economy: 1.25,
  objective: 1,
  aggression: 0.81,
  support: 1,
  coord: 1,
};

interface AiMemory {
  cooldown: number;
  weights: AiWeights;
  lastOrderAt: number;
}

// Estado interno por batalha: cada lado tem o seu.
const memory: WeakMap<BattleState, Record<Side, AiMemory>> = new WeakMap();

function memFor(state: BattleState, side: Side): AiMemory {
  let both = memory.get(state);
  if (!both) {
    both = {
      blue: { cooldown: 0, weights: trainedAiWeights, lastOrderAt: -999 },
      red: { cooldown: 0, weights: trainedAiWeights, lastOrderAt: -999 },
    };
    memory.set(state, both);
  }
  return both[side];
}

// Fixa os pesos de um lado (usado pelo auto-treino e por testes).
export function configureAi(state: BattleState, side: Side, weights: Partial<AiWeights>): void {
  memFor(state, side).weights = { ...defaultAiWeights, ...weights };
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------

export function aiTick(state: BattleState, dt: number): void {
  if (!state.running) return;
  if (state.t < 6) return; // respeita a mobilização
  stepAi(state, "red", dt, state.config.aiDifficulty);
}

// Passo de IA para um lado qualquer (usado pelo auto-treino).
export function aiTickSide(state: BattleState, side: Side, dt: number): void {
  if (!state.running || state.t < 6) return;
  stepAi(state, side, dt);
}

function stepAi(
  state: BattleState,
  side: Side,
  dt: number,
  diff?: { intervalMult?: number } | undefined,
): void {
  const mem = memFor(state, side);
  mem.cooldown -= dt;
  if (mem.cooldown > 0) return;

  const cfg = side === "blue" ? state.blue : state.red;
  const interval = intervalFor(cfg.commander.personality) * (diff?.intervalMult ?? 1);
  mem.cooldown = interval + nextRandom(state) * 0.5;

  const plan = planTurn(state, side, mem.weights);
  if (plan.deploys.length === 0) return;

  let spent = 0;
  for (const d of plan.deploys) {
    const card = cardById(d.cardId);
    const cost = effectiveCost(card, cfg.doctrine);
    if (cfg.command - cost < 0) break;
    if (deploy(state, side, d.cardId, d.x, d.y)) {
      spent += cost;
      pushAiLog(state, side, d.reason);
    }
  }
  if (spent > 0 && state.t - mem.lastOrderAt > 12) {
    mem.lastOrderAt = state.t;
    issueOrder(state, side, plan.order);
  }
}

interface AiDecision {
  cardId: string;
  x: number;
  y: number;
  reason: string;
}

interface AiPlan {
  deploys: AiDecision[];
  order: Order;
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

// ---------------------------------------------------------------------------
// Planejamento do turno
// ---------------------------------------------------------------------------

interface BattleUnitView {
  x: number;
  y: number;
  category: UnitCategory;
  domain: string;
  hp: number;
  maxHp: number;
  id: string;
}

interface BattleRead {
  visible: BattleUnitView[];
  enemyCats: Record<UnitCategory, number>;
  enemyAir: number;
  enemyArtillery: number;
  enemyStructures: number;
  myTerritories: number;
  freeTerritories: number;
  myScore: number;
  enemyScore: number;
  behind: boolean;
  timeLeft: number;
  pressure: boolean;
}

function sideState(state: BattleState, side: Side) {
  return side === "blue" ? state.blue : state.red;
}

function planTurn(state: BattleState, side: Side, weights: AiWeights): AiPlan {
  const cfg = sideState(state, side);
  const hand = cfg.deck.hand.map((h) => h.cardId);
  const read = readBattle(state, side);
  const personality = cfg.commander.personality;

  const reserve =
    Math.max(
      0,
      reserveFor(personality, cfg.commandMax) + (state.config.aiDifficulty?.reserveBonus ?? 0),
    ) *
    (0.6 + 0.4 * weights.economy);

  const target = chooseTarget(state, side, read, personality, weights);
  const defensive = isDefensive(state, side, read, target);

  const affordable = hand.filter((id) => {
    const cost = effectiveCost(cardById(id), cfg.doctrine);
    return cfg.command - cost >= reserve;
  });
  const pool = affordable.length
    ? affordable
    : hand.filter((id) => cfg.command >= effectiveCost(cardById(id), cfg.doctrine));
  if (pool.length === 0) return { deploys: [], order: defensive ? "defender" : "avancar" };

  const scored = pool
    .map((id) => ({
      id,
      card: cardById(id),
      score: scoreCard(state, side, id, read, target, personality, weights, defensive),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  if (best.score <= -1) return { deploys: [], order: defensive ? "defender" : "avancar" };

  const deployList: AiDecision[] = [makeDecision(state, side, best.card, target, read, defensive)];

  const wantsCombo =
    weights.coord * (cfg.commandMax - cfg.command < cfg.commandMax * 0.35 ? 1 : 0.4) > 0.5 &&
    (defensive ? read.enemyCats.infantaria + read.enemyCats.blindado >= 2 : true);
  if (wantsCombo && scored.length > 1) {
    const second = scored.find((s) => s.id !== best.id && s.score > 0.5);
    if (second) {
      const cost1 = effectiveCost(best.card, cfg.doctrine);
      const cost2 = effectiveCost(second.card, cfg.doctrine);
      if (cfg.command - cost1 - cost2 >= reserve * 0.4) {
        deployList.push(makeDecision(state, side, second.card, target, read, defensive));
      }
    }
  }

  return { deploys: deployList, order: defensive ? "defender" : "avancar" };
}

function readBattle(state: BattleState, side: Side): BattleRead {
  const enemy = other(side);
  const enemyCfg = sideState(state, enemy);
  const visible = enemyCfg.units
    .filter((u) => u.alive && isVisibleTo(state, u, side))
    .map((u) => ({
      x: u.x,
      y: u.y,
      category: u.category,
      domain: u.domain,
      hp: u.hp,
      maxHp: u.maxHp,
      id: u.id,
    }));
  const enemyCats = emptyCats();
  let enemyAir = 0;
  let enemyArtillery = 0;
  for (const u of visible) {
    enemyCats[u.category] += 1;
    if (u.domain === "aereo") enemyAir += 1;
    if (u.category === "artilharia") enemyArtillery += 1;
  }

  const points = state.config.arena.controlPoints;
  const value = (o: Side | "neutro") =>
    points.filter((p) => p.owner === o).reduce((a, p) => a + p.value, 0);
  const totalValue = points.reduce((a, p) => a + p.value, 0) || 1;
  const myScore = (value(side) / totalValue) * 100;
  const enemyScore = (value(enemy) / totalValue) * 100;
  return {
    visible,
    enemyCats,
    enemyAir,
    enemyArtillery,
    enemyStructures: state.structures.filter((s) => s.alive && s.side === enemy).length,
    myTerritories: state.territories.filter((t) => t.owner === side).length,
    freeTerritories: state.territories.filter((t) => t.owner !== side).length,
    myScore,
    enemyScore,
    behind: myScore + 4 < enemyScore,
    timeLeft: Math.max(0, state.config.duration - state.t),
    pressure: state.phase === "pressao",
  };
}

// ---------------------------------------------------------------------------
// Pontuação de cartas
// ---------------------------------------------------------------------------

// Matriz de contramedida: linha ataca coluna (+ favorável).
const COUNTER: Record<UnitCategory, Partial<Record<UnitCategory, number>>> = {
  infantaria: { artilharia: 1.3, defesa: 0.9, reconhecimento: 0.6, blindado: -1.1 },
  blindado: { infantaria: 1.4, reconhecimento: 1.0, defesa: -0.9, artilharia: -0.5 },
  artilharia: { infantaria: 1.2, defesa: 1.1, artilharia: 0.6, blindado: -0.7 },
  defesa: { blindado: 1.2, reconhecimento: 0.5, artilharia: -0.8, infantaria: 0.2 },
  reconhecimento: { artilharia: 0.7, defesa: 0.5, blindado: -0.4 },
  apoio: {},
};

function scoreCard(
  state: BattleState,
  side: Side,
  cardId: string,
  read: BattleRead,
  target: ControlPoint,
  personality: CommanderPersonality,
  weights: AiWeights,
  defensive: boolean,
): number {
  const card = cardById(cardId);
  const cfg = sideState(state, side);
  const cost = effectiveCost(card, cfg.doctrine);
  let score = 1;

  if (card.kind === "militar") {
    const m = card as MilitaryCard;
    for (const [cat, n] of Object.entries(read.enemyCats) as [UnitCategory, number][]) {
      if (n > 0) score += (COUNTER[m.category][cat] ?? 0) * Math.min(n, 3) * 0.5 * weights.counter;
    }
    if (read.enemyAir > 0) {
      if (m.targets === "aereo" || m.targets === "ambos") score += 1.1 * weights.counter;
      else if (m.targets === "terra") score -= 0.5 * weights.counter;
    }
    if (read.enemyArtillery > 0 && (m.category === "blindado" || m.category === "artilharia"))
      score += 0.6 * weights.counter;
    if (defensive && (m.category === "defesa" || m.category === "infantaria")) score += 0.7;
    if (!defensive && (m.category === "blindado" || m.category === "infantaria")) score += 0.6;
    if (m.category === "artilharia" && read.enemyCats.infantaria + read.enemyCats.defesa >= 2)
      score += 0.7;
    if (m.category === "reconhecimento")
      score += (read.visible.length < 2 ? 1.3 : 0.2) * weights.objective;
    // engenheiros valem mais quando há território livre para expandir
    if (m.builder) {
      const expand = read.freeTerritories > 0 && read.myTerritories < 3 ? 1.6 : -0.4;
      score += expand * weights.objective;
    }
    if (read.enemyStructures > 1 && m.priority && m.priority.includes("blindado")) score += 0.5;
    score -= cost * 0.12 * weights.economy;
    if (cfg.command - cost < 2) score -= 0.3;
  } else {
    score = scoreSupport(state, side, card as SupportCard, read, weights, defensive);
  }

  score += weights.objective * (defensive ? 0.4 : 0.5);
  if (personality === "Agressivo") score += defensive ? 0 : 0.5 * weights.aggression;
  if (personality === "Cauteloso") score += defensive ? 0.6 : -0.2;
  if (personality === "Econômico") score -= cost * 0.06 * weights.economy;
  if (personality === "Oportunista" && read.behind) score += 0.4;
  score += commanderBias(card, personality, defensive);

  void target;
  return score;
}

// Cada comandante tem preferências táticas reais (não só um rótulo): o viés abaixo
// muda materialmente a escolha de cartas da IA.
function commanderBias(card: Card, personality: CommanderPersonality, defensive: boolean): number {
  const cat = card.kind === "militar" ? card.category : "apoio";
  switch (personality) {
    case "Agressivo": // Sarmiento — mecanizada: empurra blindados cedo
      return cat === "blindado" ? 1.0 : cat === "infantaria" ? 0.3 : 0;
    case "Econômico": // Orlov — poder de fogo: artilharia de longo alcance
      return cat === "artilharia" ? 1.0 : cat === "defesa" ? 0.4 : -0.15;
    case "Cauteloso": // Lima — defesa territorial: fortifica e protege
      return cat === "defesa" ? 1.1 : defensive ? 0.3 : -0.3;
    case "Oportunista": // Duarte — mobilidade: drones, reconhecimento e flancos
      return cat === "reconhecimento" ? 0.9 : cat === "infantaria" ? 0.35 : 0;
    case "Metódico": // Varela — operações combinadas: completa a composição
      return cat === "apoio" ? 0.3 : 0.25;
  }
}

function scoreSupport(
  state: BattleState,
  side: Side,
  card: SupportCard,
  read: BattleRead,
  weights: AiWeights,
  defensive: boolean,
): number {
  const ability = card.ability;
  const cfg = sideState(state, side);
  const enemyCluster = largestEnemyCluster(read.visible);
  const myDamagedVeh = cfg.units.filter(
    (u) => u.alive && u.category === "blindado" && u.hp < u.maxHp * 0.6,
  ).length;

  let score = 0.6 * weights.support;
  switch (ability as SupportAbility) {
    case "ataque_aereo":
      score += enemyCluster >= 2 ? 2.6 * weights.support : -1.4;
      break;
    case "fumaca":
      score += !defensive && read.enemyArtillery > 0 ? 1.2 * weights.support : 0.1;
      break;
    case "reforcos":
      score +=
        defensive && read.enemyCats.infantaria + read.enemyCats.blindado >= 1
          ? 1.5 * weights.support
          : 0.2;
      break;
    case "reparacao":
      score += myDamagedVeh > 0 ? 1.4 * weights.support : -0.8;
      break;
    case "barricada":
      score += defensive ? 1.3 * weights.support : -0.4;
      break;
    case "interferencia":
      score += read.enemyArtillery + read.enemyAir > 0 ? 1.8 * weights.support : -0.9;
      break;
    case "evacuacao":
      score += cfg.units.some((u) => u.alive && u.hp < u.maxHp * 0.35 && u.engaged)
        ? 1.2 * weights.support
        : -0.6;
      break;
    case "reconhecimento":
      score += read.visible.length < 2 ? 1.6 * weights.support : 0.2;
      break;
    case "paraquedistas":
      // infiltração vale quando há retaguarda inimiga para pressionar
      score += !defensive && read.enemyStructures >= 1 ? 1.6 * weights.support : -0.6;
      break;
    case "bombardeiro":
      score += enemyCluster >= 3 ? 2.8 * weights.support : -1.6;
      break;
  }
  if (cfg.units.filter((u) => u.alive).length === 0 && ability !== "reforcos") score -= 1.5;
  score -= effectiveCost(card, cfg.doctrine) * 0.1 * weights.economy;
  return score;
}

function largestEnemyCluster(visible: BattleUnitView[]): number {
  let best = 0;
  for (const a of visible) {
    let n = 0;
    for (const b of visible) if (dist(a.x, a.y, b.x, b.y) <= 10) n += 1;
    if (n > best) best = n;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Escolha de objetivo
// ---------------------------------------------------------------------------

function chooseTarget(
  state: BattleState,
  side: Side,
  read: BattleRead,
  personality: CommanderPersonality,
  weights: AiWeights,
): ControlPoint {
  const points = state.config.arena.controlPoints;
  const own = points.filter((p) => p.owner === side);
  const notMine = points.filter((p) => p.owner !== side);
  const fallback = points[0]!;

  const threatened = own
    .map((p) => ({
      p,
      threat: read.visible.filter((u) => dist(u.x, u.y, p.x, p.y) <= p.radius + 16).length,
    }))
    .sort((a, b) => b.threat - a.threat)[0];

  const mustDefend =
    threatened &&
    threatened.threat > 0 &&
    (read.behind || personality === "Cauteloso" || weights.objective * threatened.threat >= 2);

  if (mustDefend && threatened) return threatened.p;

  if (personality === "Agressivo" || !read.behind) {
    const attack = notMine.slice().sort((a, b) => b.value - a.value)[0];
    if (attack) return attack;
  }
  if (personality === "Oportunista") {
    const scored = notMine
      .map((p) => ({
        p,
        threat: read.visible.filter((u) => dist(u.x, u.y, p.x, p.y) <= p.radius + 12).length,
      }))
      .sort((a, b) => a.threat - b.threat || b.p.value - a.p.value);
    if (scored[0]) return scored[0].p;
  }
  return notMine.slice().sort((a, b) => b.value - a.value)[0] ?? own[0] ?? fallback;
}

function isDefensive(
  state: BattleState,
  side: Side,
  read: BattleRead,
  target: ControlPoint,
): boolean {
  if (target.owner === side) return true;
  if (read.behind) return true;
  if (state.phase === "pressao" && read.myScore >= read.enemyScore) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Posicionamento
// ---------------------------------------------------------------------------

function makeDecision(
  state: BattleState,
  side: Side,
  card: Card,
  target: ControlPoint,
  read: BattleRead,
  defensive: boolean,
): AiDecision {
  if (card.kind === "apoio") {
    const s = card as SupportCard;
    const pos = supportTarget(state, side, s, read, target, defensive);
    return { cardId: card.id, x: pos.x, y: pos.y, reason: reasoning(card, target, read) };
  }
  const m = card as MilitaryCard;
  const pos = placement(state, side, m, target, read, defensive);
  return { cardId: card.id, x: pos.x, y: pos.y, reason: reasoning(card, target, read) };
}

// Território neutro/inimigo mais próximo que ainda não tem base avançada do lado.
function buildTerritory(state: BattleState, side: Side): Territory | null {
  const list = state.territories.filter((t) => t.owner !== side);
  if (list.length === 0) return null;
  return list.sort((a, b) => a.y - b.y)[0]!;
}

function enemyStructurePressure(state: BattleState, side: Side): number {
  const enemy = other(side);
  return state.structures.filter((s) => s.alive && s.side === enemy && s.kind !== "base-principal")
    .length;
}
void enemyStructurePressure;

function supportTarget(
  state: BattleState,
  side: Side,
  card: SupportCard,
  read: BattleRead,
  target: ControlPoint,
  defensive: boolean,
): { x: number; y: number } {
  const zone = state.config.arena.deployZone[side];
  const global: SupportAbility[] = [
    "ataque_aereo",
    "fumaca",
    "interferencia",
    "reconhecimento",
    "paraquedistas",
    "bombardeiro",
  ];
  const cluster = clusterCentroid(read.visible);
  if (global.includes(card.ability)) {
    if (card.ability === "fumaca" && !defensive) return clampToWorld(frontCentroid(state, side));
    if (card.ability === "reconhecimento") {
      const p = state.config.arena.controlPoints.find((c) => c.owner !== side);
      return p ? { x: p.x, y: p.y } : clampToWorld(cluster ?? target);
    }
    if (card.ability === "paraquedistas" || card.ability === "bombardeiro") {
      // projeção atrás das linhas: além do centro, na direção do objetivo
      const front = frontCentroid(state, side);
      const dir = Math.sign(target.y - front.y) || (side === "blue" ? 1 : -1);
      const depth =
        side === "blue" ? Math.min(96, target.y + 10 * dir) : Math.max(4, target.y + 10 * dir);
      const anchor = cluster
        ? { x: (cluster.x + target.x) / 2, y: depth }
        : { x: target.x, y: depth };
      return clampToWorld(anchor);
    }
    return clampToWorld(cluster ?? target);
  }
  const anchor = defensive ? target : frontCentroid(state, side);
  return clampToZone(zone, anchor);
}

function placement(
  state: BattleState,
  side: Side,
  card: MilitaryCard,
  target: ControlPoint,
  read: BattleRead,
  defensive: boolean,
): { x: number; y: number } {
  const zone = state.config.arena.deployZone[side];
  const cx = zone.x + zone.w / 2;
  const cy = zone.y + zone.h / 2;

  // engenheiros: posicionar na direção do território a conquistar
  if (card.builder) {
    const terr = buildTerritory(state, side);
    const anchor = terr ? { x: terr.x, y: terr.y } : { x: target.x, y: target.y };
    const dx = anchor.x - cx;
    const dy = anchor.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.min(zone.w, zone.h) / 2 - 2;
    return clampToZone(
      zone,
      { x: cx + (dx / len) * reach, y: cy + (dy / len) * reach },
      card.radius,
    );
  }

  const threat = read.visible
    .map((u) => ({ u, d: dist(u.x, u.y, target.x, target.y) }))
    .filter((x) => x.d <= target.radius + 18)
    .sort((a, b) => a.d - b.d)[0];

  if (defensive && threat) {
    const mid = { x: (threat.u.x + target.x) / 2, y: (threat.u.y + target.y) / 2 };
    return clampToZone(zone, mid, card.radius);
  }

  const dx = target.x - cx;
  const dy = target.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  const reach = Math.min(zone.w, zone.h) / 2 - 2;
  const flank = card.category === "blindado" ? 0.35 : card.category === "infantaria" ? 0.15 : 0;
  const px = -dy / len;
  const py = dx / len;
  const jitter = (nextRandom(state) - 0.5) * 2;
  const x = cx + (dx / len) * reach + px * flank * reach * jitter;
  const y = cy + (dy / len) * reach + py * flank * reach * jitter;
  return clampToZone(zone, { x, y }, card.radius);
}

function frontCentroid(state: BattleState, side: Side): { x: number; y: number } {
  const units = sideState(state, side).units.filter((u) => u.alive);
  if (units.length === 0) {
    const zone = state.config.arena.deployZone[side];
    return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
  }
  return {
    x: units.reduce((a, u) => a + u.x, 0) / units.length,
    y: units.reduce((a, u) => a + u.y, 0) / units.length,
  };
}

function clusterCentroid(visible: BattleUnitView[]): { x: number; y: number } | null {
  if (visible.length === 0) return null;
  return {
    x: visible.reduce((a, u) => a + u.x, 0) / visible.length,
    y: visible.reduce((a, u) => a + u.y, 0) / visible.length,
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function emptyCats(): Record<UnitCategory, number> {
  return {
    infantaria: 0,
    blindado: 0,
    artilharia: 0,
    defesa: 0,
    reconhecimento: 0,
    apoio: 0,
  };
}

function reasoning(card: Card, target: ControlPoint, read: BattleRead): string {
  const top = (Object.entries(read.enemyCats) as [UnitCategory, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const kind = top?.[0];
  const n = top?.[1] ?? 0;
  if (card.kind === "apoio") return `Apoio: ${card.name} empregado sobre ${target.name}.`;
  if (n > 0) return `Leitura: ${n}× ${kind} à vista. ${card.name} responde em ${target.name}.`;
  return `Decisão: ${card.name} avança para disputar ${target.name}.`;
}

function pushAiLog(state: BattleState, side: Side, text: string): void {
  state.log.unshift({ t: state.t, side, kind: "ia", text });
  if (state.log.length > 120) state.log.length = 120;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampToWorld(p: { x: number; y: number }): { x: number; y: number } {
  return { x: clamp(p.x, 4, 96), y: clamp(p.y, 4, 96) };
}

function clampToZone(
  zone: { x: number; y: number; w: number; h: number },
  p: { x: number; y: number },
  radius = 2,
): { x: number; y: number } {
  return {
    x: clamp(p.x, zone.x + radius, zone.x + zone.w - radius),
    y: clamp(p.y, zone.y + radius, zone.y + zone.h - radius),
  };
}

// Exposto para o modo "espectador" e testes: ordens gerais simples.
export function aiIssueOrders(state: BattleState): void {
  if (state.red.units.length > 0 && state.t > 20) {
    const hasOwn = state.config.arena.controlPoints.some((p) => p.owner === "red");
    issueOrder(state, "red", hasOwn ? "defender" : "avancar");
  }
}

export const _internal = {
  doctrines,
  planTurn,
  scoreCard,
  readBattle,
  chooseTarget,
  intervalFor,
  reserveFor,
  largestEnemyCluster,
  defaultAiWeights,
};
