// Motor determinístico da batalha tática de SOVEREIGN.
//
// Regras gerais:
//  * Energia regenera continuamente; unidades agem sozinhas conforme a ordem geral.
//  * Duas bases principais + torres defensivas automáticas ficam fixas no campo.
//  * Pontos de controle e territórios são disputados por presença de unidades.
//  * Territórios conquistados permitem que engenheiros construam bases avançadas,
//    que passam a operar como novas posições defensivas e de lançamento.
//  * TODAS as armas geram projéteis REAIS com trajetória, colisão, explosão e dano.
//  * Vitória: destruir a base principal adversária, dominar tudo ou vencer no tempo.
//
// O motor não conhece React nem rede — é testável de forma isolada.

import { cardById, cardLevelMultiplier, doctrines, militaryById, startingDeck } from "./catalog";
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
  Projectile,
  Side,
  SideConfig,
  SideState,
  Structure,
  StructureSpec,
  SupportCard,
  Territory,
  UnitCategory,
  VisualEffect,
} from "./types";

const HAND_SIZE = 4;
const MOBILIZACAO_SECONDS = 15;
const PRESSAO_SECONDS = 60;
const CAPTURE_RATE = 9; // progresso por segundo (0-100) de uma unidade padrão
const ENGAGE_RADIUS = 26; // raio em que unidades avançam para atacar
const SIGHT_BASE = 16;
const CONTACT_RANGE = 6; // abaixo disso, fumaça não oculta
const BUILD_RANGE = 8; // distância máxima do engenheiro ao território em obra
const BUILD_TIME = 10; // segundos para erguer uma base avançada
const HEAL_PER_PULSE = 14; // vida curada por pulso do Posto de Socorro
const FORT_COVER = 0.25; // cobertura concedida por fortificação a aliados próximos
const FORT_COVER_RADIUS = 10; // raio da cobertura concedida

export const other = (s: Side): Side => (s === "blue" ? "red" : "blue");

// ---------------------------------------------------------------------------
// Aleatoriedade determinística
// ---------------------------------------------------------------------------

function nextRng(state: BattleState): number {
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

function makeStructure(spec: StructureSpec): Structure {
  const buildTime = spec.buildTime ?? 0;
  const underConstruction = buildTime > 0;
  return {
    id: spec.id,
    kind: spec.kind,
    side: spec.side,
    name: spec.name,
    x: spec.x,
    y: spec.y,
    radius: spec.radius,
    hp: underConstruction ? Math.max(1, Math.round(spec.hp * 0.15)) : spec.hp,
    maxHp: spec.hp,
    dmg: spec.dmg,
    range: spec.range,
    cooldown: spec.cooldown,
    readyIn: 0,
    targets: spec.targets,
    alive: true,
    underConstruction,
    buildTime,
    buildProgress: underConstruction ? 0 : 100,
    aim: spec.side === "blue" ? -Math.PI / 2 : Math.PI / 2,
    recoil: 0,
  };
}

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
    structures: config.arena.structures.map(makeStructure),
    territories: config.arena.territories.map((t) => ({ ...t, progress: { ...t.progress } })),
    projectiles: [],
    effects: [],
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
  void config;
  return {
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
    cardLevels: cfg.cardLevels ?? {},
    deck: { hand, queue, cycle: 0 },
    units: [],
    kills: 0,
    losses: 0,
    structuresDestroyed: 0,
    deployed: 0,
    score: 0,
  };
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
// Zonas de desdobramento (território controlado + bases avançadas conquistadas)
// ---------------------------------------------------------------------------

function insideRect(
  z: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
): boolean {
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}

// Uma posição é válida para desdobramento se está na zona inicial do lado ou
// dentro do raio de uma base avançada operacional já pertencente ao lado.
export function insideDeployZone(state: BattleState, side: Side, x: number, y: number): boolean {
  const z = state.config.arena.deployZone[side];
  if (insideRect(z, x, y)) return true;
  for (const s of state.structures) {
    if (!s.alive || s.side !== side || s.kind !== "base-avancada" || s.underConstruction) continue;
    if (dist(x, y, s.x, s.y) <= s.radius + 6) return true;
  }
  return false;
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
  if (needsOwnZone && !insideDeployZone(state, side, x, y)) return false;
  if (card.kind === "militar" && advancedBaseAt(state, x, y, card.radius)) return false;

  if (card.kind === "militar") {
    const u = spawnUnit(state, side, card.id, x, y);
    cfg.units.push(u);
    cfg.command -= cost;
    advanceDeck(cfg, cardId);
    pushLog(state, side, "deploy", `${cfg.countryName} posiciona ${card.name}.`);
    return true;
  }
  if (!applySupport(state, side, card as SupportCard, x, y)) return false;
  cfg.command -= cost;
  advanceDeck(cfg, cardId);
  pushLog(state, side, "apoio", `${cfg.countryName} emprega ${card.name}.`);
  return true;
}

// Habilidades de área podem ser lançadas sobre qualquer ponto do teatro.
export const GLOBAL_SUPPORT: SupportCard["ability"][] = [
  "ataque_aereo",
  "fumaca",
  "interferencia",
  "reconhecimento",
  "paraquedistas",
  "bombardeiro",
];

// Rotação determinística do baralho: a carta usada vai para o fim da fila e a
// próxima da fila entra na mão, sempre na mesma posição. Nada é sorteado.
function advanceDeck(cfg: SideState, cardId: string): void {
  const idx = cfg.deck.hand.findIndex((h) => h.cardId === cardId);
  if (idx < 0) return;
  const next = cfg.deck.queue.shift();
  if (next) cfg.deck.hand[idx] = { cardId: next, ready: true };
  else cfg.deck.hand.splice(idx, 1);
  cfg.deck.queue.push(cardId);
  cfg.deck.cycle += 1;
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
  const level = cfg.cardLevels?.[cardId] ?? 1;
  const levelMult = cardLevelMultiplier(level);
  const hpMult =
    (mod?.hpMultiplier[card.category as UnitCategory] ?? 1) *
    (1 + (sideMods?.hp?.[card.category] ?? 0)) *
    levelMult;
  const dmgMult =
    (mod?.dmgMultiplier[card.category as UnitCategory] ?? 1) *
    (1 + (sideMods?.dmg?.[card.category] ?? 0)) *
    levelMult;
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
    model: card.model,
    weapon: card.weapon,
    builder: Boolean(card.builder),
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
    aim: side === "blue" ? -Math.PI / 2 : Math.PI / 2,
    recoil: 0,
    alive: true,
    engaged: false,
    smoke: 0,
    jammed: 0,
    revealed: 0,
    seen: { blue: false, red: false },
    heal: cardId === "apo-posto" ? Math.round(HEAL_PER_PULSE * levelMult) : 0,
    level,
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
  const enemyCfg = enemy === "blue" ? state.blue : state.red;
  switch (card.ability) {
    case "ataque_aereo": {
      const r = card.radius ?? 8;
      const dmg = card.magnitude ?? 150;
      for (const u of enemyCfg.units) {
        if (!u.alive) continue;
        if (dist(u.x, u.y, x, y) <= r) damageUnit(state, u, dmg, null);
      }
      for (const s of state.structures) {
        if (s.alive && s.side === enemy && dist(s.x, s.y, x, y) <= r)
          damageStructure(state, s, dmg * 0.6, null);
      }
      addEffect(state, "explosion", x, y, r);
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
      for (const u of enemyCfg.units) {
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
      for (const u of enemyCfg.units) {
        if (u.alive && dist(u.x, u.y, x, y) <= (card.radius ?? 16))
          u.revealed = Math.max(u.revealed, card.duration ?? 12);
      }
      return true;
    }
    case "paraquedistas": {
      const count = card.magnitude ?? 2;
      const r = card.radius ?? 5;
      addEffect(state, "build", x, y, r, { side });
      for (let i = 0; i < count; i++) {
        const off = i * 4 - (count - 1) * 2;
        const px = clamp(x + off, 2, 98);
        const py = clamp(y + 1, 2, 98);
        const u = spawnUnit(state, side, "inf-fuzileiros", px, py, "Pelotão Paraquedista");
        u.model = "paraquedista";
        cfg.units.push(u);
      }
      pushLog(state, side, "apoio", "Paraquedistas lançados atrás das linhas.");
      return true;
    }
    case "bombardeiro": {
      const r = card.radius ?? 11;
      const dmg = card.magnitude ?? 200;
      const strikes = 4;
      for (let i = 0; i < strikes; i++) {
        const off = (i - (strikes - 1) / 2) * (r / strikes);
        const bx = clamp(x + off, 2, 98);
        const by = clamp(y + (i % 2 === 0 ? 1 : -1), 2, 98);
        for (const u of enemyCfg.units) {
          if (u.alive && dist(u.x, u.y, bx, by) <= r * 0.5)
            damageUnit(state, u, dmg / strikes, null);
        }
        for (const s of state.structures) {
          if (s.alive && s.side === enemy && dist(s.x, s.y, bx, by) <= r * 0.5)
            damageStructure(state, s, (dmg * 0.65) / strikes, null);
        }
        addEffect(state, "explosion", bx, by, r * 0.5);
      }
      addZone(state, { kind: "fumaca", side, x, y, radius: r, remaining: 2, magnitude: 0 });
      pushLog(state, side, "apoio", "Bombardeiro tático: sequência de impactos.");
      return true;
    }
  }
  return false;
}

function addZone(state: BattleState, z: Omit<EffectZone, "id">): void {
  state.zones.push({ id: `z${state.nextId++}`, ...z });
}

function addEffect(
  state: BattleState,
  kind: VisualEffect["kind"],
  x: number,
  y: number,
  radius: number,
  extra?: Partial<VisualEffect>,
): void {
  const ttl =
    kind === "explosion" ? 0.5 : kind === "impact" ? 0.3 : kind === "tracer" ? 0.12 : 0.18;
  state.effects.push({
    id: `fx${state.nextId++}`,
    kind,
    x,
    y,
    radius,
    remaining: ttl,
    ttl,
    ...extra,
  });
  if (state.effects.length > 260) state.effects.splice(0, state.effects.length - 260);
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
  updateStructures(state, dt);
  updateProjectiles(state, dt);
  updateEffects(state, dt);
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

function updateEffects(state: BattleState, dt: number): void {
  for (const e of state.effects) e.remaining -= dt;
  state.effects = state.effects.filter((e) => e.remaining > 0);
}

// ---------------------------------------------------------------------------
// Unidades: movimento, seleção de alvo e disparo
// ---------------------------------------------------------------------------

function updateUnit(state: BattleState, u: BattleUnit, dt: number): void {
  if (u.smoke > 0) u.smoke = Math.max(0, u.smoke - dt);
  if (u.revealed > 0) u.revealed = Math.max(0, u.revealed - dt);
  if (u.jammed > 0) u.jammed = Math.max(0, u.jammed - dt);
  if (u.readyIn > 0) u.readyIn = Math.max(0, u.readyIn - dt);
  if (u.recoil > 0) u.recoil = Math.max(0, u.recoil - dt * 4);

  const friendlySmoke = state.zones.some(
    (z) =>
      z.kind === "fumaca" &&
      z.side === u.side &&
      z.remaining > 0.5 &&
      dist(z.x, z.y, u.x, u.y) <= z.radius,
  );
  if (friendlySmoke) u.smoke = Math.max(u.smoke, 0.6);

  if (u.builder && updateBuilder(state, u, dt)) return;
  if (u.heal > 0 && updateSupport(state, u, dt)) return;

  const obstacle = obstacleAt(state.config.arena, u.x, u.y);
  const slow = u.domain === "aereo" ? 1 : (obstacle?.slow ?? 1);

  const target = selectTarget(state, u);
  u.engaged = false;
  if (target && u.jammed <= 0 && canShoot(u)) {
    u.engaged = true;
    u.aim = Math.atan2(target.y - u.y, target.x - u.x);
    if (u.readyIn <= 0) {
      fireWeapon(state, u, target);
      u.readyIn = u.cooldown;
    }
    if (u.range < ENGAGE_RADIUS && dist(u.x, u.y, target.x, target.y) > u.range * 0.7) {
      moveToward(state, u, target.x, target.y, dt, slow);
    }
    return;
  }
  delete u.targetId;
  delete u.targetStructureId;

  const goal = goalFor(state, u);
  if (goal) {
    u.aim = Math.atan2(goal.y - u.y, goal.x - u.x);
    moveToward(state, u, goal.x, goal.y, dt, slow);
  }
}

// Engenheiro: caminha até um território conquistado sem base e ergue a instalação.
// Retorna true quando consumiu o passo da unidade (construção em andamento).
function updateBuilder(state: BattleState, u: BattleUnit, dt: number): boolean {
  const damaged = state.structures.find(
    (s) =>
      s.alive &&
      !s.underConstruction &&
      s.side === u.side &&
      s.hp < s.maxHp &&
      dist(s.x, s.y, u.x, u.y) <= u.range + s.radius,
  );
  if (damaged) {
    damaged.hp = Math.min(damaged.maxHp, damaged.hp + 18 * dt);
    addEffect(state, "build", damaged.x, damaged.y, damaged.radius * 0.8, { side: u.side });
    return true;
  }

  const site = buildSite(state, u);
  if (!site) {
    delete u.buildTerritoryId;
    return false;
  }
  const underConstruction = state.structures.find(
    (s) => s.alive && s.underConstruction && s.side === u.side && s.territoryId === site.id,
  );
  if (underConstruction) {
    if (dist(u.x, u.y, underConstruction.x, underConstruction.y) > BUILD_RANGE) {
      moveToward(state, u, underConstruction.x, underConstruction.y, dt, 1);
    } else {
      underConstruction.buildProgress = Math.min(
        100,
        underConstruction.buildProgress + (100 / Math.max(1, underConstruction.buildTime)) * dt,
      );
      underConstruction.hp = Math.max(
        underConstruction.hp,
        Math.round(underConstruction.maxHp * 0.15 * (1 + underConstruction.buildProgress / 100)),
      );
      if (underConstruction.buildProgress >= 100) {
        underConstruction.underConstruction = false;
        underConstruction.hp = underConstruction.maxHp;
        const countryName = u.side === "blue" ? state.blue.countryName : state.red.countryName;
        pushLog(state, u.side, "construcao", `${countryName} conclui ${underConstruction.name}.`);
      } else {
        addEffect(
          state,
          "build",
          underConstruction.x,
          underConstruction.y,
          underConstruction.radius,
          { side: u.side },
        );
      }
    }
    return true;
  }

  if (dist(u.x, u.y, site.x, site.y) > site.radius) {
    moveToward(state, u, site.x, site.y, dt, 1);
    return true;
  }
  startConstruction(state, u, site);
  return true;
}

function buildSite(state: BattleState, u: BattleUnit): Territory | null {
  const candidates = state.territories.filter((t) => {
    if (t.owner !== u.side) return false;
    // um território já com base CONCLUÍDA não precisa de nova obra; uma base em
    // construção continua sendo o alvo do engenheiro até ficar pronta.
    if (state.structures.some((s) => s.alive && s.territoryId === t.id && !s.underConstruction))
      return false;
    return true;
  });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => dist(u.x, u.y, a.x, a.y) - dist(u.x, u.y, b.x, b.y))[0]!;
}

// Posto de Socorro: não combate; cura infantaria aliada ferida num pulso por cadência.
// Retorna true quando consumiu o passo da unidade (cura em andamento).
function updateSupport(state: BattleState, u: BattleUnit, dt: number): boolean {
  const cfg = u.side === "blue" ? state.blue : state.red;
  const wounded = cfg.units.find(
    (a) =>
      a.alive &&
      a.id !== u.id &&
      a.category === "infantaria" &&
      a.hp < a.maxHp &&
      dist(a.x, a.y, u.x, u.y) <= u.range + a.radius,
  );
  if (wounded) {
    if (u.readyIn <= 0) {
      wounded.hp = Math.min(wounded.maxHp, wounded.hp + u.heal);
      u.readyIn = u.cooldown;
      addEffect(state, "build", wounded.x, wounded.y, wounded.radius, { side: u.side });
    }
    u.aim = Math.atan2(wounded.y - u.y, wounded.x - u.x);
    return true;
  }
  return false;
}

function startConstruction(state: BattleState, u: BattleUnit, site: Territory): void {
  const spec: StructureSpec = {
    id: `adv-${state.nextId++}`,
    kind: "base-avancada",
    side: u.side,
    name: `Base Avançada ${site.name}`,
    x: site.x,
    y: site.y,
    radius: 6,
    hp: 1600,
    dmg: 60,
    range: 16,
    cooldown: 1.1,
    targets: "ambos",
    buildTime: BUILD_TIME,
  };
  const s = makeStructure(spec);
  s.territoryId = site.id;
  state.structures.push(s);
  u.buildTerritoryId = site.id;
  const countryName = u.side === "blue" ? state.blue.countryName : state.red.countryName;
  pushLog(state, u.side, "construcao", `${countryName} inicia base avançada em ${site.name}.`);
}

function canShoot(u: BattleUnit): boolean {
  return u.dmg > 0 && u.weapon.projectileSpeed > 0;
}

interface TargetRef {
  x: number;
  y: number;
  id: string;
  kind: "unit" | "structure";
  category?: UnitCategory;
  domain?: string;
  radius: number;
}

function selectTarget(state: BattleState, u: BattleUnit): TargetRef | null {
  const enemy = other(u.side);
  const enemyCfg = enemy === "blue" ? state.blue : state.red;
  const priority = priorityFor(u);

  const units: TargetRef[] = [];
  for (const e of enemyCfg.units) {
    if (!e.alive) continue;
    if (!isVisibleTo(state, e, u.side)) continue;
    if (!targetsDomain(u.targets, e.domain)) continue;
    const d = dist(u.x, u.y, e.x, e.y);
    if (d > u.range + e.radius) continue;
    units.push({
      x: e.x,
      y: e.y,
      id: e.id,
      kind: "unit",
      category: e.category,
      domain: e.domain,
      radius: e.radius,
    });
  }

  const structures: TargetRef[] = [];
  if (!u.builder) {
    for (const s of state.structures) {
      if (!s.alive || s.side === u.side) continue;
      if (!targetsDomain(u.targets, "terra")) continue;
      const d = dist(u.x, u.y, s.x, s.y);
      if (d > u.range + s.radius) continue;
      structures.push({ x: s.x, y: s.y, id: s.id, kind: "structure", radius: s.radius });
    }
  }

  const score = (t: TargetRef): number => {
    const d = dist(u.x, u.y, t.x, t.y);
    let s = -d;
    if (t.kind === "unit" && t.category && priority.includes(t.category)) s += 40;
    if (t.kind === "structure") s += 6;
    return s;
  };

  const all = [...units, ...structures];
  if (all.length === 0) return null;
  all.sort((a, b) => score(b) - score(a));
  const best = all[0]!;
  if (best.kind === "unit") {
    u.targetId = best.id;
    delete u.targetStructureId;
  } else {
    u.targetStructureId = best.id;
    delete u.targetId;
  }
  return best;
}

function priorityFor(u: BattleUnit): UnitCategory[] {
  try {
    return militaryById(u.cardId).priority ?? [];
  } catch {
    return [];
  }
}

function targetsDomain(profile: string, domain: string): boolean {
  if (profile === "ambos") return true;
  return profile === domain;
}

// ---------------------------------------------------------------------------
// Sistema universal de armas: cada disparo gera projétil real + efeitos
// ---------------------------------------------------------------------------

function fireWeapon(state: BattleState, u: BattleUnit, target: TargetRef): void {
  const w = u.weapon;
  const angle = Math.atan2(target.y - u.y, target.x - u.x);
  const mx = u.x + Math.cos(angle) * (u.radius + w.muzzle);
  const my = u.y + Math.sin(angle) * (u.radius + w.muzzle);
  const dmg = u.dmg * combinedArmsMultiplier(state, u);
  u.recoil = 1;
  addEffect(state, "muzzle", mx, my, u.radius * 0.8, { side: u.side });

  if (w.tracer) {
    addEffect(state, "tracer", mx, my, 0, { x2: target.x, y2: target.y, side: u.side });
    applyHit(state, u, target, dmg, target.x, target.y);
    return;
  }

  const kind: Projectile["kind"] =
    w.kind === "missil" ? "missile" : w.kind === "atgm" || w.kind === "lmf" ? "rocket" : "shell";

  const create = (tx: number, ty: number): void => {
    const ang = Math.atan2(ty - my, tx - mx);
    state.projectiles.push({
      id: `p${state.nextId++}`,
      side: u.side,
      kind,
      x: mx,
      y: my,
      startX: mx,
      startY: my,
      vx: Math.cos(ang) * w.projectileSpeed,
      vy: Math.sin(ang) * w.projectileSpeed,
      speed: w.projectileSpeed,
      dmg,
      splash: w.splash,
      arc: w.arc,
      homing: w.homing,
      targetId: target.id,
      targetKind: target.kind,
      targetX: tx,
      targetY: ty,
      travelled: 0,
      totalDistance: Math.max(0.1, dist(mx, my, tx, ty)),
      remaining: 6,
      alive: true,
    });
  };

  if (w.kind === "lmf") {
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * 2.2;
      const jitter = (nextRng(state) - 0.5) * 2;
      create(target.x + spread + jitter, target.y + jitter);
    }
  } else {
    create(target.x, target.y);
  }
}

function applyHit(
  state: BattleState,
  source: BattleUnit,
  target: TargetRef,
  dmg: number,
  hx: number,
  hy: number,
): void {
  if (target.kind === "unit") {
    const e = findUnit(state, target.id);
    if (e && e.alive) {
      damageUnit(state, e, dmg, source);
      addEffect(state, "impact", e.x, e.y, e.radius * 0.6);
    }
  } else {
    const s = state.structures.find((x) => x.id === target.id);
    if (s && s.alive) {
      damageStructure(state, s, dmg, source);
      addEffect(state, "impact", hx, hy, 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Projéteis: física, perseguição, colisão e explosão
// ---------------------------------------------------------------------------

function updateProjectiles(state: BattleState, dt: number): void {
  for (const p of state.projectiles) {
    if (!p.alive) continue;
    p.remaining -= dt;
    if (p.remaining <= 0) {
      explode(state, p);
      continue;
    }

    if (p.homing && p.targetId) {
      const t =
        p.targetKind === "structure"
          ? findStructure(state, p.targetId)
          : findUnit(state, p.targetId);
      if (t && t.alive !== false) {
        p.targetX = t.x;
        p.targetY = t.y;
      }
    }

    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;

    if (d <= step) {
      p.x = p.targetX;
      p.y = p.targetY;
      explode(state, p);
      continue;
    }

    p.vx = (dx / d) * p.speed;
    p.vy = (dy / d) * p.speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.travelled += step;

    if (intercept(state, p)) explode(state, p);
  }
  state.projectiles = state.projectiles.filter((p) => p.alive);
}

function intercept(state: BattleState, p: Projectile): boolean {
  const enemy = other(p.side);
  const enemyCfg = enemy === "blue" ? state.blue : state.red;
  for (const u of enemyCfg.units) {
    if (!u.alive) continue;
    if (p.targetKind === "unit" && u.id === p.targetId) continue;
    if (dist(p.x, p.y, u.x, u.y) <= u.radius * 0.7) return true;
  }
  for (const s of state.structures) {
    if (!s.alive || s.side !== enemy) continue;
    if (p.targetKind === "structure" && s.id === p.targetId) continue;
    if (dist(p.x, p.y, s.x, s.y) <= s.radius * 0.7) return true;
  }
  return false;
}

function explode(state: BattleState, p: Projectile): void {
  p.alive = false;
  const enemy = other(p.side);
  const radius = p.splash > 0 ? p.splash : 1.4;
  addEffect(state, p.splash > 0 ? "explosion" : "impact", p.x, p.y, radius);
  if (p.splash > 0) addEffect(state, "spark", p.x, p.y, radius * 0.5);

  const enemyCfg = enemy === "blue" ? state.blue : state.red;
  for (const u of enemyCfg.units) {
    if (!u.alive) continue;
    if (dist(p.x, p.y, u.x, u.y) <= radius + u.radius) {
      const falloff =
        p.splash > 0 ? Math.max(0.45, 1 - dist(p.x, p.y, u.x, u.y) / (radius + u.radius)) : 1;
      damageUnit(state, u, p.dmg * falloff, null);
    }
  }
  for (const s of state.structures) {
    if (!s.alive || s.side !== enemy) continue;
    if (dist(p.x, p.y, s.x, s.y) <= radius + s.radius) {
      const falloff =
        p.splash > 0 ? Math.max(0.45, 1 - dist(p.x, p.y, s.x, s.y) / (radius + s.radius)) : 1;
      damageStructure(state, s, p.dmg * falloff, null);
    }
  }
}

// ---------------------------------------------------------------------------
// Estruturas: torres defensivas e bases avançadas atiram sozinhas
// ---------------------------------------------------------------------------

function updateStructures(state: BattleState, dt: number): void {
  for (const s of state.structures) {
    if (!s.alive) continue;
    if (s.recoil > 0) s.recoil = Math.max(0, s.recoil - dt * 4);
    if (s.underConstruction) continue;
    if (s.readyIn > 0) s.readyIn = Math.max(0, s.readyIn - dt);
    if (s.dmg <= 0) continue;
    const enemy = other(s.side);
    const enemyCfg = enemy === "blue" ? state.blue : state.red;
    let best: BattleUnit | null = null;
    let bestD = Infinity;
    for (const u of enemyCfg.units) {
      if (!u.alive) continue;
      if (!targetsDomain(s.targets, u.domain)) continue;
      const d = dist(s.x, s.y, u.x, u.y);
      if (d <= s.range + u.radius && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (!best) continue;
    s.aim = Math.atan2(best.y - s.y, best.x - s.x);
    if (s.readyIn <= 0) {
      const angle = s.aim;
      const mx = s.x + Math.cos(angle) * (s.radius + 1.4);
      const my = s.y + Math.sin(angle) * (s.radius + 1.4);
      addEffect(state, "muzzle", mx, my, 1.6, { side: s.side });
      addEffect(state, "tracer", mx, my, 0, { x2: best.x, y2: best.y, side: s.side });
      damageUnit(state, best, s.dmg, null);
      s.readyIn = s.cooldown;
      s.recoil = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Dano, baixas e destruição
// ---------------------------------------------------------------------------

function damageUnit(
  state: BattleState,
  target: BattleUnit,
  dmg: number,
  from: BattleUnit | null,
): void {
  const ob = obstacleAt(state.config.arena, target.x, target.y);
  const fort = coverBonusAt(state, target);
  const cover = target.domain === "aereo" ? 0 : Math.min(0.6, (ob?.cover ?? 0) + fort);
  let final = dmg * (1 - cover);
  if (
    from &&
    from.category === "infantaria" &&
    from.cardId === "inf-antitanque" &&
    target.category === "blindado"
  )
    final *= 1.6;
  target.hp -= final;
  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    addEffect(
      state,
      target.domain === "aereo" ? "explosion" : "impact",
      target.x,
      target.y,
      target.radius * 1.4,
    );
    const killerSide = other(target.side);
    const killerCfg = killerSide === "blue" ? state.blue : state.red;
    const victimCfg = target.side === "blue" ? state.blue : state.red;
    killerCfg.kills += 1;
    victimCfg.losses += 1;
    pushLog(state, killerSide, "baixa", `${victimCfg.countryName} perde ${target.name}.`);
  }
}

// Cobertura concedida pela Fortificação de Campanha aliada próxima (não se aplica a alvos aéreos).
function coverBonusAt(state: BattleState, target: BattleUnit): number {
  const cfg = target.side === "blue" ? state.blue : state.red;
  for (const a of cfg.units) {
    if (!a.alive || a.model !== "fortificacao") continue;
    if (dist(a.x, a.y, target.x, target.y) <= FORT_COVER_RADIUS) return FORT_COVER;
  }
  return 0;
}

function damageStructure(
  state: BattleState,
  target: Structure,
  dmg: number,
  from: BattleUnit | null,
): void {
  let final = dmg;
  if (from && from.cardId === "inf-antitanque") final *= 1.4;
  target.hp -= final;
  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    addEffect(state, "explosion", target.x, target.y, target.radius * 1.6);
    addEffect(state, "fire", target.x, target.y, target.radius);
    const killerSide = other(target.side);
    const killerCfg = killerSide === "blue" ? state.blue : state.red;
    const victimCfg = target.side === "blue" ? state.blue : state.red;
    killerCfg.structuresDestroyed += 1;
    pushLog(state, killerSide, "destruicao", `${victimCfg.countryName} perde ${target.name}.`);
    if (target.kind === "base-principal") {
      finish(
        state,
        killerSide === "blue" ? "vitoria" : "derrota",
        `Base principal ${victimCfg.countryName} destruída.`,
      );
    }
  }
}

function cleanup(state: BattleState): void {
  state.blue.units = state.blue.units.filter((u) => u.alive);
  state.red.units = state.red.units.filter((u) => u.alive);
  state.structures = state.structures.filter((s) => s.alive);
}

// ---------------------------------------------------------------------------
// Captura de pontos de controle e de territórios
// ---------------------------------------------------------------------------

function updateCapture(state: BattleState, dt: number): void {
  for (const p of state.config.arena.controlPoints) {
    const bluePower = capturePower(state, "blue", p.x, p.y, p.radius);
    const redPower = capturePower(state, "red", p.x, p.y, p.radius);
    const contested = bluePower > 0 && redPower > 0;
    if (contested) continue;
    if (bluePower > 0) {
      p.progress.blue = Math.min(100, p.progress.blue + bluePower * CAPTURE_RATE * dt);
      p.progress.red = Math.max(0, p.progress.red - CAPTURE_RATE * dt);
      if (p.progress.blue >= 100 && p.owner !== "blue") setPointOwner(state, p, "blue");
    } else if (redPower > 0) {
      p.progress.red = Math.min(100, p.progress.red + redPower * CAPTURE_RATE * dt);
      p.progress.blue = Math.max(0, p.progress.blue - CAPTURE_RATE * dt);
      if (p.progress.red >= 100 && p.owner !== "red") setPointOwner(state, p, "red");
    }
  }

  for (const t of state.territories) {
    const built = state.structures.find((s) => s.alive && s.territoryId === t.id);
    if (built) {
      if (t.owner !== built.side) {
        t.owner = built.side;
        t.progress = {
          blue: built.side === "blue" ? 100 : 0,
          red: built.side === "red" ? 100 : 0,
        };
      }
      continue;
    }
    const bluePower = capturePower(state, "blue", t.x, t.y, t.radius);
    const redPower = capturePower(state, "red", t.x, t.y, t.radius);
    const contested = bluePower > 0 && redPower > 0;
    if (contested) continue;
    if (bluePower > 0) {
      t.progress.blue = Math.min(100, t.progress.blue + bluePower * CAPTURE_RATE * dt);
      t.progress.red = Math.max(0, t.progress.red - CAPTURE_RATE * dt);
      if (t.progress.blue >= 100 && t.owner !== "blue") setTerritoryOwner(state, t, "blue");
    } else if (redPower > 0) {
      t.progress.red = Math.min(100, t.progress.red + redPower * CAPTURE_RATE * dt);
      t.progress.blue = Math.max(0, t.progress.blue - CAPTURE_RATE * dt);
      if (t.progress.red >= 100 && t.owner !== "red") setTerritoryOwner(state, t, "red");
    }
  }
}

function setPointOwner(state: BattleState, p: ControlPoint, side: Side): void {
  p.owner = side;
  p.progress = { blue: side === "blue" ? 100 : 0, red: side === "red" ? 100 : 0 };
  const cfg = side === "blue" ? state.blue : state.red;
  pushLog(state, side, "captura", `${cfg.countryName} toma ${p.name}.`);
}

function setTerritoryOwner(state: BattleState, t: Territory, side: Side): void {
  t.owner = side;
  t.progress = { blue: side === "blue" ? 100 : 0, red: side === "red" ? 100 : 0 };
  const cfg = side === "blue" ? state.blue : state.red;
  pushLog(state, side, "captura", `${cfg.countryName} conquista território ${t.name}.`);
}

function capturePower(
  state: BattleState,
  side: Side,
  x: number,
  y: number,
  radius: number,
): number {
  const cfg = side === "blue" ? state.blue : state.red;
  const mod = doctrines[cfg.doctrine as keyof typeof doctrines];
  let power = 0;
  for (const u of cfg.units) {
    if (!u.alive) continue;
    if (dist(u.x, u.y, x, y) > radius + u.radius) continue;
    let w = 0.6;
    if (u.category === "infantaria") w = 1.2;
    else if (u.builder) w = 1.4;
    else if (u.category === "reconhecimento") w = 0.9;
    else if (u.category === "apoio") w = 0.5;
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
    const ownedStructures = state.structures.filter((s) => s.side === side && s.alive);
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
        seen = observers.some((o) => dist(o.x, o.y, e.x, e.y) <= CONTACT_RANGE);
      }
      if (!seen) seen = zones.some((z) => dist(z.x, z.y, e.x, e.y) <= z.radius);
      if (!seen) seen = ownedPoints.some((p) => dist(p.x, p.y, e.x, e.y) <= p.radius + 4);
      if (!seen) seen = ownedStructures.some((s) => dist(s.x, s.y, e.x, e.y) <= s.range);
      e.seen[side] = seen;
    }
  }
}

export function isVisibleTo(state: BattleState, unit: BattleUnit, viewer: Side): boolean {
  void state;
  return unit.seen[viewer];
}

// ---------------------------------------------------------------------------
// IA de movimento / objetivo
// ---------------------------------------------------------------------------

function goalFor(state: BattleState, u: BattleUnit): { x: number; y: number } | null {
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
      const terr = nearestTerritory(state, u);
      const contest =
        nearestPoint(state, u, (p) => p.owner !== u.side) ?? nearestPoint(state, u, () => true);
      if (terr && contest) {
        return dist(u.x, u.y, terr.x, terr.y) < dist(u.x, u.y, contest.x, contest.y)
          ? { x: terr.x, y: terr.y }
          : { x: contest.x, y: contest.y };
      }
      if (contest) return { x: contest.x, y: contest.y };
      if (terr) return { x: terr.x, y: terr.y };
      const base = state.structures.find(
        (s) => s.alive && s.side !== u.side && s.kind === "base-principal",
      );
      return base ? { x: base.x, y: base.y } : center;
    }
  }
}

function nearestTerritory(state: BattleState, u: BattleUnit): Territory | null {
  const list = state.territories.filter((t) => t.owner !== u.side);
  if (list.length === 0) return null;
  return list.map((t) => ({ t, d: dist(u.x, u.y, t.x, t.y) })).sort((a, b) => a.d - b.d)[0]!.t;
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
  if (u.domain === "terra") {
    const blocked = state.config.arena.obstacles.find(
      (o) =>
        o.blocksGround && dist(u.x + (dx / d) * 3, u.y + (dy / d) * 3, o.x, o.y) <= o.radius * 0.8,
    );
    if (blocked) {
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
// Pontuação e vitória
// ---------------------------------------------------------------------------

function updateScore(state: BattleState): void {
  const totalPoints = state.config.arena.controlPoints.reduce((acc, p) => acc + p.value, 0);
  const totalTerr = state.territories.length;
  for (const side of ["blue", "red"] as Side[]) {
    const cfg = side === "blue" ? state.blue : state.red;
    const owned = state.config.arena.controlPoints
      .filter((p) => p.owner === side)
      .reduce((acc, p) => acc + p.value, 0);
    const ownedTerr = state.territories.filter((t) => t.owner === side).length;
    const pScore = totalPoints > 0 ? (owned / totalPoints) * 70 : 0;
    const tScore = totalTerr > 0 ? (ownedTerr / totalTerr) * 30 : 0;
    cfg.score = pScore + tScore;
  }
}

function checkVictory(state: BattleState, dt: number): void {
  if (!state.running) return;
  const { objectiveKind, duration, militaryThreshold } = state.config;
  const allPoints = state.config.arena.controlPoints;
  const totalValue = allPoints.reduce((a, p) => a + p.value, 0);

  const blueHeld = allPoints.filter((p) => p.owner === "blue").reduce((a, p) => a + p.value, 0);
  const redHeld = allPoints.filter((p) => p.owner === "red").reduce((a, p) => a + p.value, 0);

  const blueAll = totalValue > 0 && blueHeld === totalValue;
  const redAll = totalValue > 0 && redHeld === totalValue;
  if (blueAll && hold(state, "blue-all", true, dt) >= 8) {
    return finish(state, "vitoria", "Superioridade territorial: todos os objetivos sob controle.");
  }
  if (redAll && hold(state, "red-all", true, dt) >= 8) {
    return finish(state, "derrota", "Superioridade territorial: objetivos perdidos.");
  }
  hold(state, "blue-all", false, dt);
  hold(state, "red-all", false, dt);

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

  const op = state.config.operationalTarget;
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
    if (state.blue.score > state.red.score)
      return finish(state, "vitoria", "Tempo esgotado: objetivo e território a seu favor.");
    if (state.red.score > state.blue.score)
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

function advancedBaseAt(
  state: BattleState,
  x: number,
  y: number,
  radius: number,
): Structure | null {
  for (const s of state.structures) {
    if (!s.alive || s.kind !== "base-avancada") continue;
    if (dist(x, y, s.x, s.y) <= s.radius + radius) return s;
  }
  return null;
}

function findUnit(state: BattleState, id: string): BattleUnit | undefined {
  return state.blue.units.find((u) => u.id === id) ?? state.red.units.find((u) => u.id === id);
}

function findStructure(state: BattleState, id: string): Structure | undefined {
  return state.structures.find((s) => s.id === id);
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
  if (action.type === "deploy" || action.type === "apoio") {
    const ok = deploy(state, action.side, action.cardId, action.x, action.y);
    return ok ? { ok: true } : { ok: false, error: "Energia insuficiente ou posição inválida." };
  }
  const ok = issueOrder(state, action.side, action.order, action.unitId, action.objectiveId);
  return ok ? { ok: true } : { ok: false, error: "Nenhuma unidade para receber a ordem." };
}

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
    territories: {
      blue: state.territories.filter((t) => t.owner === "blue").length,
      red: state.territories.filter((t) => t.owner === "red").length,
    },
    structuresDestroyed: {
      blue: state.blue.structuresDestroyed,
      red: state.red.structuresDestroyed,
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
