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
import { WORLD_X_MAX, WORLD_X_MIN, WORLD_Y_MAX, WORLD_Y_MIN } from "./world";
import type {
  BattleState,
  BattleUnit,
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
  lastHeroMoveAt: number;
  /** Última recalibração de destino das tropas já em campo (perseguição de alvo móvel). */
  lastRecalAt: number;
}

// Estado interno por batalha: cada lado tem o seu.
const memory: WeakMap<BattleState, Record<Side, AiMemory>> = new WeakMap();

function memFor(state: BattleState, side: Side): AiMemory {
  let both = memory.get(state);
  if (!both) {
    both = {
      blue: {
        cooldown: 0,
        weights: trainedAiWeights,
        lastOrderAt: -999,
        lastHeroMoveAt: -999,
        lastRecalAt: -999,
      },
      red: {
        cooldown: 0,
        weights: trainedAiWeights,
        lastOrderAt: -999,
        lastHeroMoveAt: -999,
        lastRecalAt: -999,
      },
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
    const order: {
      x: number;
      y: number;
      targetStructureId?: string;
      targetTerritoryId?: string;
      targetUnitId?: string;
    } = { x: d.x, y: d.y };
    if (d.targetStructureId) order.targetStructureId = d.targetStructureId;
    if (d.targetTerritoryId) order.targetTerritoryId = d.targetTerritoryId;
    if (d.targetUnitId) order.targetUnitId = d.targetUnitId;
    if (deploy(state, side, d.cardId, d.x, d.y, order)) {
      spent += cost;
      pushAiLog(state, side, d.reason);
    }
  }
  if (spent > 0 && state.t - mem.lastOrderAt > 12) {
    mem.lastOrderAt = state.t;
    // A IA define a postura geral, mas preserva os destinos que já atribuiu às forças.
    issueOrder(state, side, plan.order, undefined, undefined, { preserveGoals: true });
  }

  // O chanceler da IA se move como qualquer força: avança com a linha, mas fica um
  // pouco atrás dela para não ser abatido à toa. Se ele está FUGINDO (recém-resgatado),
  // a IA destaca tropa para escoltá-lo de volta ao território controlado.
  moveChancellor(state, side, mem);
  escortRetreatingHero(state, side);
  recalibrateIntent(state, side, mem);
}

// RECALIBRAÇÃO: o alvo do chanceler se MOVE (fuga, recuo). A IA revisa o destino das
// tropas já em campo a cada poucos segundos para que elas persigam o alvo atual, em vez
// de marchar para a posição congelada do momento do deploy. Só as frentes de alvo móvel
// (caça, extração, guarda, resgate) recalculam — as demais mantêm o destino planejado.
function recalibrateIntent(state: BattleState, side: Side, mem: AiMemory): void {
  if (state.t - mem.lastRecalAt < 5) return;
  const read = readBattle(state, side);
  const cfg = sideState(state, side);
  const defensive = isDefensive(
    state,
    side,
    read,
    chooseTarget(state, side, read, cfg.commander.personality, mem.weights),
  );
  const strat = aiStrategy(state, side, read, defensive, mem.weights);
  if (strat.intent !== "hunt" && strat.intent !== "extract" && strat.intent !== "guard") return;
  mem.lastRecalAt = state.t;

  const allies = cfg.units
    .filter((u) => u.alive && !u.hero && !u.escortId)
    .sort(
      (a, b) =>
        dist(a.x, a.y, strat.point.x, strat.point.y) - dist(b.x, b.y, strat.point.x, strat.point.y),
    )
    .slice(0, 6);
  for (const u of allies) {
    u.goalX = clampToWorld({ x: strat.point.x, y: strat.point.y }).x;
    u.goalY = clampToWorld({ x: strat.point.x, y: strat.point.y }).y;
    u.holdAtGoal = false; // chegando lá, volta a caçar em vez de congelar
    if (strat.targetUnitId) u.targetId = strat.targetUnitId;
    u.order = "avancar";
  }
}

// Protege a extração do chanceler: com o herói FUGINDO, marca até 4 unidades aliadas
// próximas como escolta. O motor conduz o herói para casa e a escolta fecha o cerco.
function escortRetreatingHero(state: BattleState, side: Side): void {
  if (state.heroes[side].state !== "fugindo") return;
  const cfg = sideState(state, side);
  const heroId = state.heroes[side].unitId;
  if (!heroId) return;
  const hero = cfg.units.find((u) => u.id === heroId && u.alive);
  if (!hero) return;
  const free = cfg.units
    .filter((u) => u.alive && !u.hero && u.escortId !== heroId)
    .sort((a, b) => dist(a.x, a.y, hero.x, hero.y) - dist(b.x, b.y, hero.x, hero.y))
    .slice(0, 4);
  for (const u of free) {
    u.escortId = heroId;
    delete u.goalX;
    delete u.goalY;
  }
}

// Move o chanceler do lado para uma posição tática: atrás da própria linha de frente,
// na direção do objetivo. Se o chanceler está preso (não está em campo), nada acontece.
function moveChancellor(state: BattleState, side: Side, mem: AiMemory): void {
  const st = state.heroes[side];
  if (st.state !== "livre" || !st.unitId) return;
  const hero = sideState(state, side).units.find((u) => u.id === st.unitId && u.alive);
  if (!hero) return;
  if (state.t - mem.lastHeroMoveAt < 6) return;
  mem.lastHeroMoveAt = state.t;

  const enemy = other(side);
  const front = frontCentroid(state, side);
  const target = chooseTarget(
    state,
    side,
    readBattle(state, side),
    sideState(state, side).commander.personality,
    mem.weights,
  );
  // Recuo tático: mantém-se ~10 unidades ATRÁS do próprio ponto mais avançado.
  const dir = side === "blue" ? 1 : -1;
  const gx = clampToWorld({ x: front.x - dir * 10, y: front.y }).x;
  const gy = clampToWorld({ x: gx, y: (front.y + target.y) / 2 }).y;
  // Nunca avança além da própria linha (evita correr para dentro do inimigo).
  const safeX = side === "blue" ? Math.min(gx, front.x) : Math.max(gx, front.x);
  void enemy;
  issueOrder(state, side, "avancar", hero.id, undefined, {});
  repositionHero(state, hero, clampToWorld({ x: safeX, y: gy }));
}

// Reposiciona o herói para um ponto, mantendo o comando direto (sem arrastar tropas).
function repositionHero(state: BattleState, hero: BattleUnit, p: { x: number; y: number }): void {
  hero.goalX = clamp(p.x, WORLD_X_MIN, WORLD_X_MAX);
  hero.goalY = clamp(p.y, WORLD_Y_MIN, WORLD_Y_MAX);
  hero.order = "avancar";
  hero.holdAtGoal = true;
}

interface AiDecision {
  cardId: string;
  /** Alvo móvel (ex.: o chanceler adversário em fuga) — a força persegue o id. */
  targetUnitId?: string;
  x: number;
  y: number;
  reason: string;
  targetStructureId?: string;
  targetTerritoryId?: string;
}

interface AiPlan {
  /** Intenção estratégica do turno (para leitura e depuração). */
  intent?: AiIntent;
  deploys: AiDecision[];
  order: Order;
}

function intervalFor(p: CommanderPersonality): number {
  switch (p) {
    case "Agressivo":
      return 2.5;
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

// Reserva de Sov que a IA guarda antes de gastar. Com recurso FINITO (teto 1000) a
// reserva é uma fração do teto — guardar "3" num total de 1000 seria nada.
function reserveFor(p: CommanderPersonality, max: number): number {
  switch (p) {
    case "Cauteloso":
      return Math.round(max * 0.18);
    case "Econômico":
      return Math.round(max * 0.35);
    case "Agressivo":
      return Math.round(max * 0.05);
    default:
      return Math.round(max * 0.08);
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
  const hand = cfg.deck.hand.filter((h) => h.ready).map((h) => h.cardId);
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
  // O "cérebro" do turno define a intenção; o alvo militar real passa a ser o ponto dela.
  const strategy = aiStrategy(state, side, read, defensive, weights);

  const affordable = hand.filter((id) => {
    const cost = effectiveCost(cardById(id), cfg.doctrine);
    return cfg.command - cost >= reserve;
  });
  const pool = affordable.length
    ? affordable
    : hand.filter((id) => cfg.command >= effectiveCost(cardById(id), cfg.doctrine));
  if (pool.length === 0)
    return { deploys: [], order: defensive ? "defender" : "avancar", intent: strategy.intent };

  const scored = pool
    .map((id) => ({
      id,
      card: cardById(id),
      score: scoreCard(state, side, id, read, target, personality, weights, defensive),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  if (best.score <= -1)
    return { deploys: [], order: defensive ? "defender" : "avancar", intent: strategy.intent };

  const deployList: AiDecision[] = [
    makeDecision(state, side, best.card, target, read, defensive, strategy),
  ];

  const wantsCombo =
    weights.coord * (cfg.commandMax - cfg.command < cfg.commandMax * 0.35 ? 1 : 0.4) > 0.5 &&
    (defensive ? read.enemyCats.infantaria + read.enemyCats.blindado >= 2 : true);
  if (wantsCombo && scored.length > 1) {
    const second = scored.find((s) => s.id !== best.id && s.score > 0.5);
    if (second) {
      const cost1 = effectiveCost(best.card, cfg.doctrine);
      const cost2 = effectiveCost(second.card, cfg.doctrine);
      if (cfg.command - cost1 - cost2 >= reserve * 0.4) {
        deployList.push(makeDecision(state, side, second.card, target, read, defensive, strategy));
      }
    }
  }

  return {
    deploys: deployList,
    order: defensive ? "defender" : "avancar",
    intent: strategy.intent,
  };
}

// FRENTES DE GUERRA: a IA luta em várias frentes ao mesmo tempo. Em vez de uma única
// "postura", ela pontua cada frente conforme o estado do tabuleiro e usa esses pesos
// para escolher cartas e destinos. As frentes são:
//   expand  — conquistar território (a ÚNICA fonte de Sov)
//   rescue  — destruir a prisão que mantém o NOSSO chanceler cativo
//   extract — escoltar o NOSSO chanceler recém-resgatado (fugindo) de volta para casa
//   guard   — manter o NOSSO chanceler vivo (cerco defensivo)
//   hunt    — caçar o chanceler ADVERSÁRIO (mais forte quando ele foge)
//   defend  — segurar posição ameaçada
//   push    — pressionar as estruturas inimigas
// INTENÇÃO ESTRATÉGICA: o "pensamento" da IA num turno. Ela escolhe UMA frente
// principal (com justificativa) e as cartas/destinos são derivados dela. A cada turno
// a intenção é RECALIBRADA: se o chanceler adversário se move, o ponto de caça segue o
// movimento; se o nosso foge, muda para extração; se o Sov aperta, prioriza território.
type AiIntent = "rescue" | "extract" | "hunt" | "guard" | "expand" | "push" | "defend" | "prize";

interface AiStrategy {
  intent: AiIntent;
  point: { x: number; y: number };
  reason: string;
  targetStructureId?: string;
  targetUnitId?: string;
  targetTerritoryId?: string;
}

// Ponto atual do chanceler adversário EM CAMPO (alvo móvel a ser perseguido).
function enemyHeroOnField(state: BattleState, side: Side): BattleUnit | null {
  const foe = other(side);
  const st = state.heroes[foe];
  if (st.state !== "livre" && st.state !== "fugindo") return null;
  if (!st.unitId) return null;
  const cfg = foe === "blue" ? state.blue : state.red;
  return cfg.units.find((u) => u.id === st.unitId && u.alive) ?? null;
}

// Ponto mais ameaçador para o NOSSO chanceler (inimigo mais próximo dele), usado para
// posicionar a guarda entre a ameaça e o herói — em vez de deixar a escolta parada.
function heroThreatPoint(
  state: BattleState,
  side: Side,
  hero: BattleUnit,
): { x: number; y: number } | null {
  const enemy = other(side);
  const cfg = enemy === "blue" ? state.blue : state.red;
  let best: BattleUnit | null = null;
  let bestD = Infinity;
  for (const e of cfg.units) {
    if (!e.alive) continue;
    const d = dist(hero.x, hero.y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

// O "cérebro" do turno. Ordem de prioridade (recalibrada a cada chamada):
//   1. RESGATE   — o nosso chanceler está preso: a guerra depende de soltá-lo.
//   2. EXTRAÇÃO  — ele foi solto e está fugindo: escoltar de volta para casa.
//   3. CAÇA      — o chanceler adversário está em campo: perseguir (alvo móvel).
//   4. GUARDA    — o nosso está em campo e há ameaça: fechar o cerco protetor.
//   5. EXPANDIR  — garantir Sov (a renda territorial é a única fonte de recurso).
//   6. DEFENDER/EMpurrar — postura geral do resto da partida.
export function aiStrategy(
  state: BattleState,
  side: Side,
  read: BattleRead,
  defensive: boolean,
  weights: AiWeights,
): AiStrategy {
  const cfg = sideState(state, side);
  const mine = state.heroes[side];

  // CARTA-PRÊMIO — objetivo de campanha: empurrar a linha até o comboio e capturá-lo.
  // Não é a prioridade ZERO (a guerra continua): entra como frente de expansão quando o
  // lado não está em crise defensiva nem resgatando o próprio chanceler.
  const prize = state.prize;
  const convoy = state.red.units.find((u) => u.prizeConvoy && u.alive);
  if (prize?.capturedBy === "blue" && side === "blue" && convoy)
    return {
      intent: "extract",
      point: { x: convoy.x, y: convoy.y },
      reason: "Escoltar a carga capturada até a base",
      targetUnitId: convoy.id,
    };
  if (prize && !prize.capturedBy && !prize.failed && convoy && !defensive) {
    if (side === "blue")
      return {
        intent: "prize",
        point: { x: prize.x, y: prize.y },
        reason: "Capturar a carta em campo",
      };
    if (weights.aggression >= 0.5)
      return {
        intent: "defend",
        point: { x: convoy.x, y: convoy.y },
        reason: "Defender o comboio da carta",
      };
  }

  // 1. RESGATE — destruir a prisão que mantém o nosso chanceler.
  if (mine.state === "preso") {
    const prisao = state.structures.find(
      (s) => s.alive && s.kind === "prisao" && s.captiveSide === side,
    );
    if (prisao)
      return {
        intent: "rescue",
        point: { x: prisao.x, y: prisao.y },
        reason: "Resgatar o chanceler preso",
        targetStructureId: prisao.id,
      };
  }

  // 2. EXTRAÇÃO — o nosso chanceler fugiu e precisa voltar ao território controlado.
  if (mine.state === "fugindo" && mine.unitId) {
    const hero = cfg.units.find((u) => u.id === mine.unitId && u.alive);
    if (hero)
      return {
        intent: "extract",
        point: { x: hero.x, y: hero.y },
        reason: "Escoltar o chanceler de volta para casa",
        targetUnitId: hero.id,
      };
  }

  // 2.4 OBJETIVO OPERACIONAL — o ponto que DECIDE a partida vem antes da expansão e
  // da caça: quem o segura vence. Sem esta frente a IA dispersava o exército tomando
  // territórios enquanto o adversário fincava posse no ponto — e depois de conquistá-lo
  // o abandonava para atacar outros alvos (o ponto voltava para o inimigo). As missões
  // operacionais viravam um "penhasco": ou o azul nunca chegava, ou chegava e saía.
  const opTarget = state.config.operationalTarget;
  if (opTarget) {
    const opPoint = state.config.arena.controlPoints.find((p) => p.id === opTarget.controlPointId);
    if (opPoint) {
      return {
        intent: opPoint.owner === side ? "defend" : "push",
        point: { x: opPoint.x, y: opPoint.y },
        reason:
          opPoint.owner === side ? "Segurar o objetivo operacional" : "Tomar o objetivo operacional",
      };
    }
  }

  // 2.5 ECONOMIA — sem Sov não há guerra: se a renda territorial está escassa (poucos
  // territórios e caixa baixa), EXPANDIR passa à frente da caça/guarda. É o "vou pegar
  // esses territórios pra garantir Sov" — a expansão financia o resto da partida. Mas
  // NUNCA sobrepõe a defesa: sob pressão imediata, segurar a posição vem primeiro.
  const freeTerr = read.freeTerritories;
  const poor = cfg.command < cfg.commandMax * 0.2;
  if (!defensive && !read.behind && freeTerr > 0 && read.myTerritories === 0 && poor) {
    const terr = buildTerritory(state, side);
    if (terr)
      return {
        intent: "expand",
        point: { x: terr.x, y: terr.y },
        reason: "Conquistar território para garantir Sov",
        targetTerritoryId: terr.id,
      };
  }

  // 3. CAÇA — perseguir o chanceler adversário (alvo móvel: recalculado a cada turno).
  const foeHero = enemyHeroOnField(state, side);
  if (foeHero) {
    // Fuga do adversário = janela de ouro; herói parado = alvo prioritário se temos
    // meios de longo alcance/blindados. A agressividade calibrada decide o empenho.
    const urgency = state.heroes[other(side)].state === "fugindo" ? 1.35 : 1;
    if (weights.aggression * urgency >= 0.75)
      return {
        intent: "hunt",
        point: { x: foeHero.x, y: foeHero.y },
        reason: "Caçar o chanceler adversário",
        targetUnitId: foeHero.id,
      };
  }

  // 4. GUARDA — proteger o nosso chanceler: cerrar o cerco pelo lado da ameaça.
  if (mine.state === "livre" && mine.unitId) {
    const hero = cfg.units.find((u) => u.id === mine.unitId && u.alive);
    const threat = hero ? heroThreatPoint(state, side, hero) : null;
    if (hero && threat && read.visible.length >= 2) {
      // Ponto à frente do herói, na direção da ameaça (a tropa barra a aproximação).
      const dx = threat.x - hero.x;
      const dy = threat.y - hero.y;
      const len = Math.hypot(dx, dy) || 1;
      const r = hero.radius + 5;
      return {
        intent: "guard",
        point: { x: hero.x + (dx / len) * r, y: hero.y + (dy / len) * r },
        reason: "Proteger o chanceler",
        targetUnitId: hero.id,
      };
    }
  }

  // 5. EXPANDIR — Sov é FINITO e só volta de território: garantir a renda primeiro.
  const needsIncome = cfg.command < cfg.commandMax * 0.5 || read.freeTerritories > 0;
  if (needsIncome && read.freeTerritories > 0 && read.myTerritories < 5) {
    const terr = buildTerritory(state, side);
    if (terr)
      return {
        intent: "expand",
        point: { x: terr.x, y: terr.y },
        reason: "Conquistar território (renda de Sov)",
        targetTerritoryId: terr.id,
      };
  }

  // 6. Postura geral: defender a posição ameaçada ou empurrar para a base inimiga.
  if (defensive) {
    const p = chooseTarget(state, side, read, cfg.commander.personality, weights);
    return { intent: "defend", point: { x: p.x, y: p.y }, reason: "Segurar a posição" };
  }
  const p = chooseTarget(state, side, read, cfg.commander.personality, weights);
  return { intent: "push", point: { x: p.x, y: p.y }, reason: "Empurrar para a base inimiga" };
}

interface AiFronts {
  expand: number;
  rescue: number;
  extract: number;
  guard: number;
  hunt: number;
  defend: number;
  push: number;
}

function assessFronts(
  state: BattleState,
  side: Side,
  read: BattleRead,
  defensive: boolean,
): AiFronts {
  const mine = state.heroes[side].state;
  const foe = state.heroes[other(side)].state;
  const expand = read.freeTerritories > 0 ? (read.myTerritories < 4 ? 1 : 0.5) : 0.15;
  const rescue = mine === "preso" ? 1 : 0;
  const extract = mine === "fugindo" ? 1 : 0;
  const guard = mine === "livre" ? (read.visible.length >= 2 ? 0.6 : 0.25) : 0;
  const hunt = foe === "fugindo" ? 1 : foe === "livre" ? 0.55 : 0;
  return {
    expand,
    rescue,
    extract,
    guard,
    hunt,
    defend: defensive ? 1 : 0.3,
    push: defensive ? 0.25 : 1,
  };
}

export function readBattle(state: BattleState, side: Side): BattleRead {
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
  const fronts = assessFronts(state, side, read, defensive);
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
    // Engenheiros: o território é a ÚNICA fonte de Sov — a frente "expand" domina.
    if (m.builder) {
      score += (fronts.expand > 0.2 ? fronts.expand * 2.4 : -0.6) * weights.objective;
    }
    if (read.enemyStructures > 1 && m.priority && m.priority.includes("blindado")) score += 0.5;
    // FRENTE "hunt": caçar o chanceler adversário. Unidades de longo alcance e blindados
    // são os melhores executores; quando ele FOGE, a janela é ainda mais valiosa.
    if (
      fronts.hunt > 0 &&
      (m.range > 8 || m.category === "blindado" || m.category === "reconhecimento")
    )
      score += fronts.hunt * 0.7 * weights.aggression;
    // FRENTE "rescue": derrubar a prisão que mantém o nosso chanceler — ofensiva dedicada.
    if (fronts.rescue > 0 && !m.builder && m.dmg > 0)
      score += fronts.rescue * 0.6 * weights.objective;
    // FRENTE "extract"/"guard": proteger o NOSSO chanceler (fugindo ou em campo).
    if (
      (fronts.extract > 0 || fronts.guard > 0) &&
      (m.category === "infantaria" || m.category === "defesa")
    )
      score += Math.max(fronts.extract, fronts.guard) * 0.6 * weights.objective;
    score -= (cost / 10) * 0.4 * weights.economy;
    if (cfg.command - cost < cost) score -= 0.3;
  } else {
    score = scoreSupport(state, side, card as SupportCard, read, weights, defensive);
  }

  // FRENTES "push"/"defend": a postura geral empurra para o ataque ou a contenção.
  score += weights.objective * (fronts.defend > fronts.push ? 0.45 : 0.5);
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
    // Os vieses são LEVES de propósito: nenhuma personalidade deve virar "botão de
    // vitória". Vieses fortes (ex.: blindado 1.0) faziam o comandante spammar um único
    // tipo e dominar a partida — a tática difere, a força não.
    case "Agressivo": // Sarmiento — mecanizada: empurra blindados cedo
      return cat === "blindado" ? 0.35 : cat === "infantaria" ? 0.3 : 0.15;
    case "Econômico": // Orlov — poder de fogo: artilharia de longo alcance
      return cat === "artilharia" ? 0.35 : cat === "defesa" ? 0.3 : 0.15;
    case "Cauteloso": // Lima — defesa territorial: fortifica e protege
      return cat === "defesa" ? 0.4 : defensive ? 0.25 : 0.15;
    case "Oportunista": // Duarte — mobilidade: drones, reconhecimento e flancos
      return cat === "reconhecimento" ? 0.35 : cat === "infantaria" ? 0.3 : 0.15;
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
    case "gas":
      // Vale a pena com aglomerado inimigo no campo (dano contínuo em vários alvos).
      score += enemyCluster >= 2 && !defensive ? 2.2 * weights.support : -0.6;
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

  // Objetivo operacional da missão (ex.: "Estação Central"): quando o ADVERSÁRIO
  // domina o ponto que decide a partida, ele vira o alvo prioritário — sem isso a
  // IA ignorava o ponto e o inimigo o mantinha sozinho (a missão virava um botão de
  // vitória). Enquanto ninguém o domina, a IA mantém a pressão normal (base/torres).
  const op = state.config.operationalTarget;
  if (op) {
    const opPoint = points.find((p) => p.id === op.controlPointId);
    // DISPUTA DESDE O INÍCIO: quem decide a partida é o ponto do objetivo. Se a IA só
    // reagisse depois que o inimigo o tomasse, o primeiro a chegar acumulava posse +
    // renda territorial e a partida virava bola de neve (as missões operacionais
    // ficavam instáveis: ou 20/20 ou 0/20). Disputar o ponto neutro torna a corrida simétrica.
    if (opPoint && opPoint.owner !== side) return opPoint;
  }

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
  strategy?: AiStrategy,
): AiDecision {
  // O objetivo efetivo é o ponto da INTENÇÃO (resgate, caça, extração, expansão...),
  // não o ponto de controle genérico — é assim que o pensamento vira ação no mapa.
  const aim: ControlPoint = strategy
    ? { ...target, x: strategy.point.x, y: strategy.point.y }
    : target;
  if (card.kind === "apoio") {
    const s = card as SupportCard;
    const pos = supportTarget(state, side, s, read, aim, defensive);
    return {
      cardId: card.id,
      x: pos.x,
      y: pos.y,
      reason: strategy?.reason ?? reasoning(card, target, read),
      ...(strategy?.targetUnitId ? { targetUnitId: strategy.targetUnitId } : {}),
    };
  }
  const m = card as MilitaryCard;
  const decision = placement(state, side, m, aim, read, defensive, strategy);
  return {
    cardId: card.id,
    x: decision.x,
    y: decision.y,
    reason: strategy?.reason ?? reasoning(card, target, read),
    ...(decision.targetStructureId ? { targetStructureId: decision.targetStructureId } : {}),
    ...(decision.targetTerritoryId ? { targetTerritoryId: decision.targetTerritoryId } : {}),
    ...(strategy?.targetUnitId ? { targetUnitId: strategy.targetUnitId } : {}),
  };
}

// Território neutro/inimigo mais ADIANTADO (na direção do inimigo) para o engenheiro
// erguer a base avançada. O azul avança para leste (x crescente), o vermelho para oeste.
function buildTerritory(state: BattleState, side: Side): Territory | null {
  const list = state.territories.filter((t) => t.owner !== side);
  if (list.length === 0) return null;
  return list.sort((a, b) => (side === "blue" ? b.x - a.x : a.x - b.x))[0]!;
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
  const global: SupportAbility[] = [
    "ataque_aereo",
    "fumaca",
    "gas",
    "interferencia",
    "reconhecimento",
    "paraquedistas",
    "bombardeiro",
  ];
  const cluster = clusterCentroid(read.visible);
  if (global.includes(card.ability)) {
    if (card.ability === "fumaca" && !defensive) return clampToWorld(frontCentroid(state, side));
    if (card.ability === "gas") {
      // Gás fere os dois lados: a IA joga sobre o aglomerado inimigo visível.
      return clampToWorld(cluster ?? target);
    }
    if (card.ability === "reconhecimento") {
      const p = state.config.arena.controlPoints.find((c) => c.owner !== side);
      return p ? { x: p.x, y: p.y } : clampToWorld(cluster ?? target);
    }
    if (card.ability === "paraquedistas" || card.ability === "bombardeiro") {
      // projeção atrás das linhas: além do centro, na direção do objetivo (eixo X)
      const front = frontCentroid(state, side);
      const dir = Math.sign(target.x - front.x) || (side === "blue" ? 1 : -1);
      const depth =
        side === "blue"
          ? Math.min(WORLD_X_MAX - 4, target.x + 10 * dir)
          : Math.max(WORLD_X_MIN + 4, target.x + 10 * dir);
      const anchor = cluster
        ? { x: depth, y: (cluster.y + target.y) / 2 }
        : { x: depth, y: target.y };
      return clampToWorld(anchor);
    }
    return clampToWorld(cluster ?? target);
  }
  // Cartas locais: empregadas onde estão as forças próprias (ou sobre o objetivo, na defesa).
  const anchor = defensive ? target : frontCentroid(state, side);
  return clampToWorld(anchor);
}

// Destino da força: o objetivo militar real no mapa (estrutura inimiga, território
// a conquistar ou o ponto de controle disputado), com leve flanqueamento.
function placement(
  state: BattleState,
  side: Side,
  card: MilitaryCard,
  target: ControlPoint,
  read: BattleRead,
  defensive: boolean,
  strategy?: AiStrategy,
): { x: number; y: number; targetStructureId?: string; targetTerritoryId?: string } {
  // Engenheiros: destino = território a conquistar/construir.
  if (card.builder) {
    const terr = buildTerritory(state, side);
    if (terr) return { x: terr.x, y: terr.y, targetTerritoryId: terr.id };
    return { x: target.x, y: target.y };
  }

  // A INTENÇÃO ESTRATÉGICA manda: resgate (prisão), caça (chanceler móvel), extração
  // (nosso chanceler em fuga), guarda (cerco) e expansão (território) definem o destino
  // antes da ofensiva genérica. A defesa só se sobrepõe quando não há frente de herói.
  if (strategy) {
    switch (strategy.intent) {
      case "rescue":
        return {
          x: strategy.point.x,
          y: strategy.point.y,
          ...(strategy.targetStructureId ? { targetStructureId: strategy.targetStructureId } : {}),
        };
      // Frentes de CHANCELER: a força larga o objetivo genérico e vai ao ponto exato
      // (prisão, chanceler móvel, cerco de extração).
      case "hunt":
      case "guard":
      case "extract":
        return clampToWorld({ x: strategy.point.x, y: strategy.point.y });
      // EXPANDIR: quem conquista território é o ENGENHEIRO (a carta de construção).
      // Tropas de combate seguem a ofensiva normal — desviá-las para um círculo neutro
      // diluía o ataque e deixava a base exposta (quebrava a curva de dificuldade).
      case "expand": {
        if (card.builder) {
          const terr = buildTerritory(state, side);
          if (terr) return { x: terr.x, y: terr.y, targetTerritoryId: terr.id };
        }
        break;
      }
      default:
        break;
    }
  }

  // Defesa: mantém posição perto do objetivo ameaçado.
  if (defensive) return clampToWorld({ x: target.x, y: target.y });

  // RESGATE: se o próprio chanceler está preso, a prioridade militar é a PRISÃO que o
  // mantém — destruí-la liberta o refém (é o objetivo central da campanha).
  if (state.heroes[side].state === "preso") {
    const prisao = state.structures.find(
      (s) => s.alive && s.kind === "prisao" && s.captiveSide === side,
    );
    if (prisao) return { x: prisao.x, y: prisao.y, targetStructureId: prisao.id };
  }

  // Ofensiva: atacar estrutura inimiga mais próxima do objetivo, se houver.
  const enemy = other(side);
  const structures = state.structures
    .filter((s) => s.alive && s.side === enemy)
    .sort((a, b) => dist(a.x, a.y, target.x, target.y) - dist(b.x, b.y, target.x, target.y));
  const struct = structures[0];
  if (struct) {
    const flank = card.category === "blindado" ? 4 : card.category === "infantaria" ? 2 : 0;
    const jitter = (nextRandom(state) - 0.5) * 2;
    const px = -(struct.y - target.y) || 1;
    const py = struct.x - target.x || 0;
    const len = Math.hypot(px, py) || 1;
    return {
      x: clamp(struct.x + (px / len) * flank * jitter, WORLD_X_MIN + 3, WORLD_X_MAX - 3),
      y: clamp(struct.y + (py / len) * flank * jitter, WORLD_Y_MIN + 3, WORLD_Y_MAX - 3),
      targetStructureId: struct.id,
    };
  }
  return clampToWorld({ x: target.x, y: target.y });
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
  return {
    x: clamp(p.x, WORLD_X_MIN + 3, WORLD_X_MAX - 3),
    y: clamp(p.y, WORLD_Y_MIN + 3, WORLD_Y_MAX - 3),
  };
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
