// Motor determinístico da batalha tática.
// Regras: Pontos de Comando regeneram continuamente; unidades agem sozinhas conforme a ordem
// geral; pontos de controle são disputados por presença; vitória por objetivo territorial,
// militar ou operacional. O motor não conhece React nem rede — é testável de forma isolada.

import { cardById, doctrines, militaryById, startingDeck } from "./catalog";
import type {
  Arena,
  BattleAction,
  BattleConfig,
  BattleLogEntry,
  BattleResult,
  BattleState,
  BattleUnit,
  Card,
  ControlPoint,
  EffectZone,
  Obstacle,
  Order,
  Side,
  SideConfig,
  SideState,
  SupportCard,
  UnitCategory,
} from "./types";

const HAND_SIZE = 4;
const MOBILIZACAO_SECONDS = 15;
const PRESSAO_SECONDS = 60;
const CAPTURE_RATE = 9; // progresso por segundo (0-100) de uma unidade padrão
const CAPTURE_RADIUS_BONUS = 0; // margem extra além do raio do ponto
const ENGAGE_RADIUS = 26; // raio em que unidades avançam para atacar
const SIGHT_BASE = 16;
const CONTACT_RANGE = 6; // abaixo disso, fumaça não oculta
const EARLY_HOLD_SECONDS = 8;

export const other = (s: Side): Side => (s === "blue" ? "red" : "blue");

// ---------------------------------------------------------------------------
// Aleatoriedade determinística
// ---------------------------------------------------------------------------

function nextRng(state: BattleState): number {
  // mulberry32
  let t = (state.rng += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextRandom(state: BattleState): number {
  return nextRng(state);
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export function createBattle(config: BattleConfig): BattleState {
  const blue = makeSide("blue", config.blue, config);
  const red = makeSide("red", config.red, config);
  const diff = config.aiDifficulty;
  if (diff) {
    red.commandMax = Math.max(6, Math.round(red.commandMax * diff.commandMult));
    red.regen = red.regen * diff.commandMult;
  }
  return {
    config,
    t: 0,
    phase: "mobilizacao",
    running: true,
    blue,
    red,
    zones: [],
    log: [],
    outcome: null,
    reason: "",
    nextId: 1,
    aiTimer: 0,
    rng: config.seed >>> 0,
    holds: {},
  };
}

function makeSide(side: Side, cfg: SideConfig, config: BattleConfig): SideState {
  const deck =
    cfg.deck.length >= HAND_SIZE
      ? cfg.deck.slice(0, 8)
      : [...cfg.deck, ...startingDeck].slice(0, 8);
  const hand = deck.slice(0, HAND_SIZE).map((cardId) => ({ cardId, ready: true }));
  const queue = deck.slice(HAND_SIZE);
  const state: SideState = {
    side,
    countryId: cfg.countryId,
    countryName: cfg.countryName,
    flag: cfg.flag,
    commander: cfg.commander,
    doctrine: cfg.doctrine,
    command: side === "blue" ? 7 : 7,
    commandMax: cfg.commandMax,
    regen: cfg.regen * (1 + cfg.economyBonus),
    mods: cfg.mods,
    deck: { hand, queue, cycle: 0 },
    units: [],
    kills: 0,
    losses: 0,
    deployed: 0,
    score: 0,
  };
  // posiciona cada lado na sua zona de desdobramento
  void config;
  return state;
}

// ---------------------------------------------------------------------------
// Custo efetivo de uma carta conforme a doutrina
// ---------------------------------------------------------------------------

export function effectiveCost(card: Card, doctrine: string): number {
  const mod = doctrines[doctrine as keyof typeof doctrines];
  const mult = mod?.costMultiplier[card.category as UnitCategory] ?? 1;
  return Math.max(1, Math.round(card.cost * mult));
}

export function cardCostFor(state: BattleState, side: Side, cardId: string): number {
  const cfg = side === "blue" ? state.blue : state.red;
  return effectiveCost(cardById(cardId), cfg.doctrine);
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

export function deploy(
  state: BattleState,
  side: Side,
  cardId: string,
  x: number,
  y: number,
): boolean {
  const cfg = side === "blue" ? state.blue : state.red;
  const card = cardById(cardId);
  const cost = effectiveCost(card, cfg.doctrine);
  if (cfg.command < cost) return false;
  const inHand = cfg.deck.hand.find((h) => h.cardId === cardId);
  if (!inHand) return false;
  const needsOwnZone =
    card.kind === "militar" || !GLOBAL_SUPPORT.includes((card as SupportCard).ability);
  if (needsOwnZone && !insideDeployZone(state.config.arena, side, x, y)) return false;

  if (card.kind === "militar") {
    const u = spawnUnit(state, side, card.id, x, y);
    cfg.units.push(u);
    cfg.command -= cost;
    advanceDeck(cfg, cardId);
    pushLog(state, side, "deploy", `${cfg.countryName} posiciona ${card.name}.`);
    return true;
  }
  // carta de apoio
  if (!applySupport(state, side, card as SupportCard, x, y)) return false;
  cfg.command -= cost;
  advanceDeck(cfg, cardId);
  pushLog(state, side, "apoio", `${cfg.countryName} emprega ${card.name}.`);
  return true;
}

// Habilidades de área podem ser lançadas sobre qualquer ponto do teatro.
const GLOBAL_SUPPORT: SupportCard["ability"][] = [
  "ataque_aereo",
  "fumaca",
  "interferencia",
  "reconhecimento",
];

function advanceDeck(cfg: SideState, cardId: string): void {
  const idx = cfg.deck.hand.findIndex((h) => h.cardId === cardId);
  if (idx < 0) return;
  const next = cfg.deck.queue.shift();
  if (next) cfg.deck.hand[idx] = { cardId: next, ready: true };
  else cfg.deck.hand.splice(idx, 1);
  cfg.deck.queue.push(cardId);
  cfg.deck.cycle += 1;
}

function insideDeployZone(arena: Arena, side: Side, x: number, y: number): boolean {
  const z = arena.deployZone[side];
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}

function spawnUnit(
  state: BattleState,
  side: Side,
  cardId: string,
  x: number,
  y: number,
  name?: string,
): BattleUnit {
  const card = militaryById(cardId);
  const cfg = side === "blue" ? state.blue : state.red;
  const mod = doctrines[cfg.doctrine as keyof typeof doctrines];
  const sideMods = cfg.mods;
  const hpMult =
    (mod?.hpMultiplier[card.category as UnitCategory] ?? 1) *
    (1 + (sideMods?.hp?.[card.category] ?? 0));
  const dmgMult =
    (mod?.dmgMultiplier[card.category as UnitCategory] ?? 1) *
    (1 + (sideMods?.dmg?.[card.category] ?? 0));
  const speedMult =
    (mod?.speedMultiplier[card.category as UnitCategory] ?? 1) *
    (1 + (sideMods?.speed?.[card.category] ?? 0));
  const maxHp = Math.round(card.hp * hpMult);
  cfg.deployed += 1;
  return {
    id: `u${state.nextId++}`,
    side,
    cardId,
    name: name ?? card.name,
    short: card.short,
    category: card.category,
    x,
    y,
    hp: maxHp,
    maxHp,
    dmg: card.dmg * dmgMult,
    speed: card.speed * speedMult,
    range: card.range,
    cooldown: card.cooldown,
    readyIn: 0,
    radius: card.radius,
    targets: card.targets,
    domain: card.domain,
    order: "avancar",
    alive: true,
    engaged: false,
    smoke: 0,
    jammed: 0,
    revealed: 0,
    seen: { blue: false, red: false },
  };
}

// ---------------------------------------------------------------------------
// Cartas de apoio
// ---------------------------------------------------------------------------

function applySupport(
  state: BattleState,
  side: Side,
  card: SupportCard,
  x: number,
  y: number,
): boolean {
  const cfg = side === "blue" ? state.blue : state.red;
  const enemy = other(side);
  switch (card.ability) {
    case "ataque_aereo": {
      const r = card.radius ?? 8;
      const dmg = card.magnitude ?? 150;
      for (const u of (enemy === "blue" ? state.blue : state.red).units) {
        if (!u.alive) continue;
        if (dist(u.x, u.y, x, y) <= r) damageUnit(state, u, dmg, null);
      }
      addZone(state, { kind: "fumaca", side, x, y, radius: r, remaining: 1.5, magnitude: 0 });
      pushLog(state, side, "apoio", `Ataque aéreo em ${Math.round(x)},${Math.round(y)}.`);
      return true;
    }
    case "fumaca": {
      addZone(state, {
        kind: "fumaca",
        side,
        x,
        y,
        radius: card.radius ?? 8,
        remaining: card.duration ?? 8,
        magnitude: 0,
      });
      return true;
    }
    case "reforcos": {
      const count = card.magnitude ?? 2;
      for (let i = 0; i < count; i++) {
        const off = i * 4 - (count - 1) * 2;
        cfg.units.push(
          spawnUnit(
            state,
            side,
            "inf-fuzileiros",
            clamp(x + off, 2, 98),
            clamp(y + 2, 2, 98),
            "Pelotão de Reforço",
          ),
        );
      }
      return true;
    }
    case "reparacao": {
      addZone(state, {
        kind: "reparacao",
        side,
        x,
        y,
        radius: card.radius ?? 6,
        remaining: 1,
        magnitude: card.magnitude ?? 200,
      });
      for (const u of cfg.units) {
        if (
          u.alive &&
          (u.category === "blindado" || u.category === "reconhecimento") &&
          dist(u.x, u.y, x, y) <= (card.radius ?? 6)
        ) {
          u.hp = Math.min(u.maxHp, u.hp + (card.magnitude ?? 200));
        }
      }
      return true;
    }
    case "barricada": {
      const ob: Obstacle = {
        id: `bar-${state.nextId++}`,
        kind: "barricada",
        x,
        y,
        radius: card.radius ?? 4,
        blocksGround: true,
        slow: 0.6,
        cover: 0.2,
        side,
      };
      state.config.arena.obstacles.push(ob);
      addZone(state, {
        kind: "barricada",
        side,
        x,
        y,
        radius: ob.radius,
        remaining: card.duration ?? 30,
        magnitude: 0,
      });
      return true;
    }
    case "interferencia": {
      addZone(state, {
        kind: "reconhecimento",
        side,
        x,
        y,
        radius: card.radius ?? 10,
        remaining: card.duration ?? 6,
        magnitude: 0,
      });
      const r = card.radius ?? 10;
      for (const u of (enemy === "blue" ? state.blue : state.red).units) {
        if (
          u.alive &&
          dist(u.x, u.y, x, y) <= r &&
          (u.category === "artilharia" || u.category === "reconhecimento")
        ) {
          u.jammed = card.duration ?? 6;
        }
      }
      pushLog(state, side, "apoio", "Interferência eletrônica sobre o setor.");
      return true;
    }
    case "evacuacao": {
      let best: BattleUnit | null = null;
      let worst = 1;
      for (const u of cfg.units) {
        if (!u.alive || dist(u.x, u.y, x, y) > (card.radius ?? 6)) continue;
        const ratio = u.hp / u.maxHp;
        if (ratio < worst) {
          worst = ratio;
          best = u;
        }
      }
      if (best) {
        best.hp = Math.min(best.maxHp, best.hp + (card.magnitude ?? 160));
        best.x = clamp(best.x, 2, 98);
      } else {
        for (const u of cfg.units) {
          if (u.alive && dist(u.x, u.y, x, y) <= (card.radius ?? 6))
            u.hp = Math.min(u.maxHp, u.hp + (card.magnitude ?? 160) * 0.5);
        }
      }
      return true;
    }
    case "reconhecimento": {
      addZone(state, {
        kind: "reconhecimento",
        side,
        x,
        y,
        radius: card.radius ?? 16,
        remaining: card.duration ?? 12,
        magnitude: 0,
      });
      for (const u of (enemy === "blue" ? state.blue : state.red).units) {
        if (u.alive && dist(u.x, u.y, x, y) <= (card.radius ?? 16))
          u.revealed = Math.max(u.revealed, card.duration ?? 12);
      }
      return true;
    }
  }
  return false;
}

function addZone(state: BattleState, z: Omit<EffectZone, "id">): void {
  state.zones.push({ id: `z${state.nextId++}`, ...z });
}

// ---------------------------------------------------------------------------
// Ordens
// ---------------------------------------------------------------------------

export function issueOrder(
  state: BattleState,
  side: Side,
  order: Order,
  unitId?: string,
  objectiveId?: string,
): boolean {
  const cfg = side === "blue" ? state.blue : state.red;
  const targets = unitId
    ? cfg.units.filter((u) => u.id === unitId && u.alive)
    : cfg.units.filter((u) => u.alive);
  if (targets.length === 0) return false;
  for (const u of targets) {
    u.order = order;
    if (objectiveId) u.objectiveId = objectiveId;
    else delete u.objectiveId;
  }
  const label = {
    avancar: "Avançar",
    defender: "Defender",
    manter: "Manter posição",
    recuar: "Recuar",
  }[order];
  pushLog(state, side, "ordem", `${cfg.countryName} ordena: ${label}.`);
  return true;
}

// ---------------------------------------------------------------------------
// Passo de simulação
// ---------------------------------------------------------------------------

export function stepBattle(state: BattleState, dt: number): BattleState {
  if (!state.running) return state;
  state.t += dt;
  const pressao = state.t >= state.config.duration - PRESSAO_SECONDS;
  state.phase = state.t < MOBILIZACAO_SECONDS ? "mobilizacao" : pressao ? "pressao" : "combate";

  // regeneração de comando (dobra na fase de pressão)
  const factor = pressao ? 2 : 1;
  for (const side of ["blue", "red"] as Side[]) {
    const cfg = side === "blue" ? state.blue : state.red;
    cfg.command = Math.min(cfg.commandMax, cfg.command + cfg.regen * factor * dt);
  }

  updateZones(state, dt);
  for (const side of ["blue", "red"] as Side[]) {
    const cfg = side === "blue" ? state.blue : state.red;
    for (const u of cfg.units) {
      if (!u.alive) continue;
      updateUnit(state, u, dt);
    }
  }
  updateCapture(state, dt);
  updateVisibility(state);
  cleanup(state);
  updateScore(state);
  checkVictory(state, dt);
  return state;
}

function updateZones(state: BattleState, dt: number): void {
  const expiredBarricades = state.zones.filter(
    (z) => z.kind === "barricada" && z.remaining - dt <= 0,
  );
  for (const z of state.zones) z.remaining -= dt;
  state.zones = state.zones.filter((z) => z.remaining > 0);
  if (expiredBarricades.length) {
    state.config.arena.obstacles = state.config.arena.obstacles.filter(
      (o) => !expiredBarricades.some((e) => o.kind === "barricada" && dist(o.x, o.y, e.x, e.y) < 1),
    );
  }
}

function updateUnit(state: BattleState, u: BattleUnit, dt: number): void {
  if (u.smoke > 0) u.smoke = Math.max(0, u.smoke - dt);
  if (u.revealed > 0) u.revealed = Math.max(0, u.revealed - dt);
  if (u.jammed > 0) u.jammed = Math.max(0, u.jammed - dt);
  if (u.readyIn > 0) u.readyIn = Math.max(0, u.readyIn - dt);

  // fumaça aliada oculta unidades próprias dentro da zona
  const friendlySmoke = state.zones.some(
    (z) =>
      z.kind === "fumaca" &&
      z.side === u.side &&
      z.remaining > 0.5 &&
      dist(z.x, z.y, u.x, u.y) <= z.radius,
  );
  if (friendlySmoke) u.smoke = Math.max(u.smoke, 0.6);

  const enemies = enemyUnits(state, u.side);
  const visibleEnemies = enemies.filter((e) => e.alive && isVisibleTo(state, e, u.side));

  const obstacle = obstacleAt(state.config.arena, u.x, u.y);
  const slow = u.domain === "aereo" ? 1 : (obstacle?.slow ?? 1);

  // combate: procura alvo dentro do alcance
  const inRange = visibleEnemies
    .map((e) => ({ e, d: dist(u.x, u.y, e.x, e.y) }))
    .filter((x) => x.d <= u.range + x.e.radius)
    .sort((a, b) => a.d - b.d);

  u.engaged = false;
  const primary = inRange[0];
  if (primary && u.jammed <= 0) {
    const target = primary.e;
    u.engaged = true;
    if (u.readyIn <= 0) {
      const splash = u.category === "artilharia";
      const dmg = u.dmg * combinedArmsMultiplier(state, u);
      if (splash) {
        const r = 5;
        for (const e of enemies) {
          if (e.alive && dist(e.x, e.y, target.x, target.y) <= r) damageUnit(state, e, dmg, u);
        }
      } else {
        damageUnit(state, target, dmg, u);
      }
      u.readyIn = u.cooldown;
    }
    // unidades de longo alcance não avançam enquanto atiram; curtas aproximam
    if (u.range < ENGAGE_RADIUS && dist(u.x, u.y, target.x, target.y) > u.range * 0.7) {
      moveToward(state, u, target.x, target.y, dt, slow);
    }
    return;
  }

  // sem alvo: cumpre a ordem geral
  const goal = goalFor(state, u, visibleEnemies);
  if (goal) moveToward(state, u, goal.x, goal.y, dt, slow);
}

function goalFor(
  state: BattleState,
  u: BattleUnit,
  visibleEnemies: BattleUnit[],
): { x: number; y: number } | null {
  const cfg = state.config;
  const home = u.side === "blue" ? cfg.arena.deployZone.blue : cfg.arena.deployZone.red;
  const center = { x: home.x + home.w / 2, y: home.y + home.h / 2 };
  switch (u.order) {
    case "recuar":
      return center;
    case "manter":
      return null;
    case "defender": {
      const pt =
        nearestPoint(state, u, (p) => p.owner === u.side) ?? nearestPoint(state, u, () => true);
      return pt ? { x: pt.x, y: pt.y } : center;
    }
    case "avancar":
    default: {
      const obj = u.objectiveId
        ? state.config.arena.controlPoints.find((p) => p.id === u.objectiveId)
        : null;
      if (obj) return { x: obj.x, y: obj.y };
      // procura inimigo próximo para engajar
      const near = visibleEnemies
        .map((e) => ({ e, d: dist(u.x, u.y, e.x, e.y) }))
        .filter((x) => x.d <= ENGAGE_RADIUS)
        .sort((a, b) => a.d - b.d)[0];
      if (near) return { x: near.e.x, y: near.e.y };
      const contest =
        nearestPoint(state, u, (p) => p.owner !== u.side) ?? nearestPoint(state, u, () => true);
      return contest ? { x: contest.x, y: contest.y } : center;
    }
  }
}

function nearestPoint(
  state: BattleState,
  u: BattleUnit,
  pred: (p: ControlPoint) => boolean,
): ControlPoint | null {
  const pts = state.config.arena.controlPoints.filter(pred);
  if (pts.length === 0) return null;
  const ranked = pts.map((p) => ({ p, d: dist(u.x, u.y, p.x, p.y) })).sort((a, b) => a.d - b.d);
  return ranked[0]?.p ?? null;
}

function moveToward(
  state: BattleState,
  u: BattleUnit,
  tx: number,
  ty: number,
  dt: number,
  slow: number,
): void {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.6) return;
  // evita atravessar obstáculos que bloqueiam o solo
  if (u.domain === "terra") {
    const blocked = state.config.arena.obstacles.find(
      (o) =>
        o.blocksGround && dist(u.x + (dx / d) * 3, u.y + (dy / d) * 3, o.x, o.y) <= o.radius * 0.8,
    );
    if (blocked) {
      // contorna lateralmente
      const perp = { x: -dy / d, y: dx / d };
      const s = Math.sign(perp.x * (blocked.x - u.x) + perp.y * (blocked.y - u.y)) || 1;
      u.x = clamp(u.x + perp.x * u.speed * slow * dt * s, 1, 99);
      u.y = clamp(u.y + perp.y * u.speed * slow * dt * s, 1, 99);
      return;
    }
  }
  const step = u.speed * slow * dt;
  u.x = clamp(u.x + (dx / d) * step, 1, 99);
  u.y = clamp(u.y + (dy / d) * step, 1, 99);
}

function combinedArmsMultiplier(state: BattleState, u: BattleUnit): number {
  const cfg = u.side === "blue" ? state.blue : state.red;
  const mod = doctrines[cfg.doctrine as keyof typeof doctrines];
  const bonus = mod?.combinedArmsBonus ?? 0;
  if (bonus === 0) return 1;
  const cats = new Set(
    cfg.units.filter((x) => x.alive && dist(x.x, x.y, u.x, u.y) <= 16).map((x) => x.category),
  );
  return 1 + bonus * Math.max(0, cats.size - 1);
}

// ---------------------------------------------------------------------------
// Dano e baixas
// ---------------------------------------------------------------------------

function damageUnit(
  state: BattleState,
  target: BattleUnit,
  dmg: number,
  from: BattleUnit | null,
): void {
  const ob = obstacleAt(state.config.arena, target.x, target.y);
  const cover = target.domain === "aereo" ? 0 : (ob?.cover ?? 0);
  // engenharia causa dano dobrado a fortificações
  let final = dmg * (1 - cover);
  if (
    from &&
    from.category === "defesa" &&
    from.cardId === "def-engenharia" &&
    target.cardId === "def-fortificacao"
  )
    final *= 2;
  target.hp -= final;
  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    const killerSide = other(target.side);
    const killerCfg = killerSide === "blue" ? state.blue : state.red;
    const victimCfg = target.side === "blue" ? state.blue : state.red;
    killerCfg.kills += 1;
    victimCfg.losses += 1;
    pushLog(state, killerSide, "baixa", `${victimCfg.countryName} perde ${target.name}.`);
  }
}

function cleanup(state: BattleState): void {
  state.blue.units = state.blue.units.filter((u) => u.alive);
  state.red.units = state.red.units.filter((u) => u.alive);
}

// ---------------------------------------------------------------------------
// Captura de pontos
// ---------------------------------------------------------------------------

function updateCapture(state: BattleState, dt: number): void {
  for (const p of state.config.arena.controlPoints) {
    const bluePower = capturePower(state, "blue", p);
    const redPower = capturePower(state, "red", p);
    const contested = bluePower > 0 && redPower > 0;
    if (contested) continue;
    if (bluePower > 0) {
      p.progress.blue = Math.min(100, p.progress.blue + bluePower * CAPTURE_RATE * dt);
      p.progress.red = Math.max(0, p.progress.red - CAPTURE_RATE * dt);
      if (p.progress.blue >= 100 && p.owner !== "blue") setOwner(state, p, "blue");
    } else if (redPower > 0) {
      p.progress.red = Math.min(100, p.progress.red + redPower * CAPTURE_RATE * dt);
      p.progress.blue = Math.max(0, p.progress.blue - CAPTURE_RATE * dt);
      if (p.progress.red >= 100 && p.owner !== "red") setOwner(state, p, "red");
    }
  }
}

function setOwner(state: BattleState, p: ControlPoint, side: Side): void {
  p.owner = side;
  p.progress = { blue: side === "blue" ? 100 : 0, red: side === "red" ? 100 : 0 };
  const cfg = side === "blue" ? state.blue : state.red;
  pushLog(state, side, "captura", `${cfg.countryName} toma ${p.name}.`);
}

function capturePower(state: BattleState, side: Side, p: ControlPoint): number {
  const cfg = side === "blue" ? state.blue : state.red;
  const mod = doctrines[cfg.doctrine as keyof typeof doctrines];
  let power = 0;
  for (const u of cfg.units) {
    if (!u.alive) continue;
    if (u.cardId === "def-fortificacao") continue; // estática não captura
    if (dist(u.x, u.y, p.x, p.y) > p.radius + CAPTURE_RADIUS_BONUS + u.radius) continue;
    let w = 0.6;
    if (u.category === "infantaria") w = 1.2;
    else if (u.category === "reconhecimento") w = 0.9;
    else if (u.category === "apoio") w = 0.4;
    power += w;
  }
  const sideCapture = cfg.mods?.capture ?? 0;
  return power * (mod?.captureMultiplier ?? 1) * (1 + sideCapture);
}

// ---------------------------------------------------------------------------
// Fog of war
// ---------------------------------------------------------------------------

function updateVisibility(state: BattleState): void {
  for (const side of ["blue", "red"] as Side[]) {
    const cfg = side === "blue" ? state.blue : state.red;
    const enemy = other(side);
    const enemyCfg = enemy === "blue" ? state.blue : state.red;
    const sightMult = 1 + (cfg.mods?.sight ?? 0);
    const observers = cfg.units
      .filter((u) => u.alive)
      .map((u) => ({
        x: u.x,
        y: u.y,
        sight: (u.category === "reconhecimento" ? SIGHT_BASE * 1.6 : SIGHT_BASE) * sightMult,
      }));
    const zones = state.zones.filter(
      (z) => z.side === side && z.kind === "reconhecimento" && z.remaining > 0,
    );
    const ownedPoints = state.config.arena.controlPoints.filter((p) => p.owner === side);
    for (const e of enemyCfg.units) {
      if (!e.alive) {
        e.seen[side] = false;
        continue;
      }
      let seen = e.revealed > 0;
      if (!seen && e.smoke <= 0) {
        seen = observers.some((o) => dist(o.x, o.y, e.x, e.y) <= o.sight + e.radius);
      }
      if (!seen && e.smoke > 0) {
        // sob fumaça: só é visto por contato muito próximo ou por reconhecimento dedicado
        seen = observers.some((o) => dist(o.x, o.y, e.x, e.y) <= CONTACT_RANGE);
      }
      if (!seen) seen = zones.some((z) => dist(z.x, z.y, e.x, e.y) <= z.radius);
      if (!seen) seen = ownedPoints.some((p) => dist(p.x, p.y, e.x, e.y) <= p.radius + 4);
      e.seen[side] = seen;
    }
  }
}

export function isVisibleTo(state: BattleState, unit: BattleUnit, viewer: Side): boolean {
  void state;
  return unit.seen[viewer];
}

// ---------------------------------------------------------------------------
// Pontuação e vitória
// ---------------------------------------------------------------------------

function updateScore(state: BattleState): void {
  for (const side of ["blue", "red"] as Side[]) {
    const cfg = side === "blue" ? state.blue : state.red;
    const total = state.config.arena.controlPoints.reduce((acc, p) => acc + p.value, 0);
    const owned = state.config.arena.controlPoints
      .filter((p) => p.owner === side)
      .reduce((acc, p) => acc + p.value, 0);
    cfg.score = total > 0 ? (owned / total) * 100 : 0;
  }
}

function checkVictory(state: BattleState, dt: number): void {
  const { objectiveKind, duration, militaryThreshold } = state.config;
  const cfg = state.config;
  const allPoints = cfg.arena.controlPoints;
  const totalValue = allPoints.reduce((a, p) => a + p.value, 0);

  const blueHeld = allPoints.filter((p) => p.owner === "blue").reduce((a, p) => a + p.value, 0);
  const redHeld = allPoints.filter((p) => p.owner === "red").reduce((a, p) => a + p.value, 0);

  // superioridade territorial: dominar tudo por EARLY_HOLD_SECONDS
  const blueAll = totalValue > 0 && blueHeld === totalValue;
  const redAll = totalValue > 0 && redHeld === totalValue;
  if (blueAll && hold(state, "blue-all", true, dt) >= EARLY_HOLD_SECONDS) {
    return finish(state, "vitoria", "Superioridade territorial: todos os objetivos sob controle.");
  }
  if (redAll && hold(state, "red-all", true, dt) >= EARLY_HOLD_SECONDS) {
    return finish(state, "derrota", "Superioridade territorial: objetivos perdidos.");
  }
  hold(state, "blue-all", false, dt);
  hold(state, "red-all", false, dt);

  // superioridade militar: perdas acima do limiar
  const th = militaryThreshold ?? 0.75;
  const blueInitial = initialCount(state, "blue");
  const redInitial = initialCount(state, "red");
  if (redInitial > 0 && state.red.losses / redInitial >= th)
    return finish(
      state,
      "vitoria",
      "Superioridade militar: o dispositivo adversário foi neutralizado.",
    );
  if (blueInitial > 0 && state.blue.losses / blueInitial >= th)
    return finish(state, "derrota", "Superioridade militar: seu dispositivo foi neutralizado.");

  // objetivo operacional
  const op = cfg.operationalTarget;
  if (op) {
    const p = allPoints.find((x) => x.id === op.controlPointId);
    if (p) {
      if (p.owner === "blue" && hold(state, "blue-op", true, dt) >= op.seconds) {
        return finish(state, "vitoria", `Objetivo operacional cumprido: ${p.name} mantido.`);
      }
      if (p.owner === "red" && hold(state, "red-op", true, dt) >= op.seconds) {
        return finish(state, "derrota", `Objetivo operacional perdido: ${p.name} tomado.`);
      }
      hold(state, "blue-op", false, dt);
      hold(state, "red-op", false, dt);
    }
  }

  // fim do tempo
  if (state.t >= duration) {
    if (objectiveKind === "territorial") {
      if (blueHeld > redHeld)
        return finish(state, "vitoria", "Tempo esgotado: superioridade territorial.");
      if (redHeld > blueHeld)
        return finish(state, "derrota", "Tempo esgotado: inferioridade territorial.");
      return finish(state, "empate", "Tempo esgotado: equilíbrio territorial.");
    }
    if (objectiveKind === "militar") {
      const blueLoss = blueInitial > 0 ? state.blue.losses / blueInitial : 0;
      const redLoss = redInitial > 0 ? state.red.losses / redInitial : 0;
      if (redLoss > blueLoss)
        return finish(state, "vitoria", "Tempo esgotado: superioridade militar.");
      if (blueLoss > redLoss)
        return finish(state, "derrota", "Tempo esgotado: inferioridade militar.");
      return finish(state, "empate", "Tempo esgotado: equilíbrio militar.");
    }
    // operacional: híbrido
    if (blueHeld > redHeld)
      return finish(state, "vitoria", "Tempo esgotado: objetivo e território a seu favor.");
    if (redHeld > blueHeld)
      return finish(state, "derrota", "Tempo esgotado: objetivo e território contra você.");
    return finish(state, "empate", "Tempo esgotado: missão inconclusiva.");
  }
}

function hold(state: BattleState, key: string, active: boolean, dt: number): number {
  if (!active) {
    state.holds[key] = 0;
    return 0;
  }
  state.holds[key] = (state.holds[key] ?? 0) + dt;
  return state.holds[key];
}

function initialCount(state: BattleState, side: Side): number {
  const cfg = side === "blue" ? state.blue : state.red;
  return Math.max(1, cfg.deployed);
}

function finish(state: BattleState, outcome: BattleResult["outcome"], reason: string): void {
  state.running = false;
  state.phase = "resultado";
  state.outcome = outcome;
  state.reason = reason;
  pushLog(state, "sistema", "evento", reason);
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function obstacleAt(arena: Arena, x: number, y: number): Obstacle | null {
  for (const o of arena.obstacles) if (dist(x, y, o.x, o.y) <= o.radius) return o;
  return null;
}

function enemyUnits(state: BattleState, side: Side): BattleUnit[] {
  return (side === "blue" ? state.red : state.blue).units;
}

function pushLog(
  state: BattleState,
  side: Side | "sistema",
  kind: BattleLogEntry["kind"],
  text: string,
): void {
  state.log.unshift({ t: state.t, side, kind, text });
  if (state.log.length > 120) state.log.length = 120;
}

// ---------------------------------------------------------------------------
// Ações externas
// ---------------------------------------------------------------------------

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export function applyAction(state: BattleState, action: BattleAction): ActionResult {
  if (!state.running) return { ok: false, error: "A partida terminou." };
  if (action.type === "deploy") {
    const ok = deploy(state, action.side, action.cardId, action.x, action.y);
    return ok ? { ok: true } : { ok: false, error: "Comando insuficiente ou posição inválida." };
  }
  if (action.type === "apoio") {
    const ok = deploy(state, action.side, action.cardId, action.x, action.y);
    return ok ? { ok: true } : { ok: false, error: "Comando insuficiente ou posição inválida." };
  }
  const ok = issueOrder(state, action.side, action.order, action.unitId, action.objectiveId);
  return ok ? { ok: true } : { ok: false, error: "Nenhuma unidade para receber a ordem." };
}

// Permite que o comandante LLM registre o raciocínio no log (leitura estratégica).
export function pushCommanderLog(state: BattleState, side: Side, text: string): void {
  pushLog(state, side, "ia", text);
}

export function computeResult(state: BattleState): BattleResult {
  const points = state.config.arena.controlPoints.map((p) => ({
    id: p.id,
    name: p.name,
    sector: p.sector,
    owner: p.owner,
  }));
  return {
    configId: state.config.id,
    missionName: state.config.missionName,
    outcome: state.outcome ?? "empate",
    reason: state.reason,
    duration: state.t,
    territorialScore: { blue: state.blue.score, red: state.red.score },
    controlPoints: {
      blue: points.filter((p) => p.owner === "blue").length,
      red: points.filter((p) => p.owner === "red").length,
    },
    kills: { blue: state.blue.kills, red: state.red.kills },
    losses: { blue: state.blue.losses, red: state.red.losses },
    remainingCommand: { blue: state.blue.command, red: state.red.command },
    pointsHeld: points,
  };
}

// Executa a partida até o fim, em passos fixos — usado em testes e no modo espectador.
export function runToCompletion(
  config: BattleConfig,
  aiTick?: (state: BattleState, dt: number) => void,
  dt = 0.1,
): BattleState {
  const state = createBattle(config);
  let guard = 0;
  const maxSteps = Math.ceil((config.duration + 30) / dt);
  while (state.running && guard < maxSteps) {
    if (aiTick) aiTick(state, dt);
    stepBattle(state, dt);
    guard++;
  }
  if (state.running) finish(state, "empate", "Limite de simulação atingido.");
  return state;
}
