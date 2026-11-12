// Motor determinístico da batalha tática de SOVEREIGN.
//
// Regras gerais:
//  * Energia regenera continuamente; unidades agem sozinhas conforme a ordem geral.
//  * Duas bases principais + DUAS torres defensivas por lado ficam fixas no campo.
//  * Pontos de controle e territórios são disputados por presença de unidades.
//  * Territórios conquistados permitem que engenheiros construam bases avançadas,
//    que passam a operar como novas posições defensivas e de lançamento.
//  * TODAS as armas geram projéteis REAIS com trajetória, colisão, explosão e dano.
//  * Vitória padrão: destruir a BASE PRINCIPAL adversária. Objetivos alternativos
//    (operacional/militar) só valem quando a própria missão os define.
//
// O motor não conhece React nem rede — é testável de forma isolada.

import {
  cardArmorFraction,
  cardById,
  cardLevelMultiplier,
  cardSpeedMultiplier,
  doctrines,
  militaryById,
  unitsPerDeploy,
} from "./catalog";
import { HOME_AIM, HOME_POINT, WORLD_X_MAX, WORLD_X_MIN, WORLD_Y_MAX, WORLD_Y_MIN } from "./world";
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
  HeroStatus,
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

// Cartas EQUIPADAS do lado: fixas a partida inteira, na ordem do baralho escolhido
// pelo jogador. Nada de mão/fila/rotação — a carta usada continua disponível (o freio
// é o Sov finito), então as teclas/posições nunca mudam de dono no meio do combate.
const MAX_DECK = 8;
const MOBILIZACAO_SECONDS = 15;
const PRESSAO_SECONDS = 60;
const CAPTURE_RATE = 9; // progresso por segundo (0-100) de uma unidade padrão
const ENGAGE_RADIUS = 26; // raio em que unidades avançam para atacar
// DISTÂNCIA DE ENGAJAMENTO: a unidade para e atira quando o alvo entra neste percentual
// do próprio alcance, mantendo 20% de folga. Sem isto ela avançava até a BORDA do
// alcance (encostando no alvo) — tanques e canhões colavam um no outro e ficavam girando
// em vez de trocar fogo à distância. Com a folga, cada arma estaciona na sua posição de
// tiro natural e a separação nunca precisa empurrar contra o alvo.
const ENGAGE_STANDOFF = 0.8;
const SIGHT_BASE = 16;
const CONTACT_RANGE = 6; // abaixo disso, fumaça não oculta
const BUILD_RANGE = 8; // distância máxima do engenheiro ao território em obra
const BUILD_TIME = 10; // segundos para erguer uma base avançada
const HEAL_PER_PULSE = 14; // vida curada por pulso do Posto de Socorro
const FORT_COVER = 0.25; // cobertura concedida por fortificação a aliados próximos
const FORT_COVER_RADIUS = 10; // raio da cobertura concedida
// Recurso de guerra "Sov": FINITO. Cada lado começa com um montante e NÃO regenera
// passivamente — só volta a ter Sov conquistando território (base avançada operacional
// paga um lote periódico) ou destruindo o inimigo (abate paga o valor do alvo + 50%).
// Sem conquista, o lado quebra e perde: a guerra acaba quando o recurso acaba.
const SOV_START = 1000; // Sov inicial e teto por lado: FINITO, NUNCA regenera sozinho
const SOV_PER_TERRITORY = 50; // cada território sob controle paga...
const SOV_TERRITORY_INTERVAL = 60; // ...50 Sov a cada 60 segundos (1 minuto)
const MIN_TERRITORY_GAP = 14; // distância mínima entre bases avançadas (evita obras empilhadas)
const GOAL_ARRIVAL = 2.5; // distância em que a força "chega" ao destino da ordem
// ANTI-TRAVAMENTO: se uma unidade em marcha fica praticamente imóvel por este tempo
// (presa em obstáculo, espremida na separação ou perseguindo um alvo que não alcança),
// o motor aciona um CONTORNO lateral persistente até ela voltar a progredir. Sem isto
// as tropas empacam no caminho e a partida parece congelada.
const STALL_SECONDS = 2.5; // tempo sem progredir antes de acionar o desvio
const STALL_BYPASS_SECONDS = 1.2; // duração do contorno lateral enquanto travada
const STALL_PROGRESS = 1.4; // distância (mundo) que a unidade precisa vencer da âncora
// Raio em volta da prisão em que a tropa aliada adere à escolta do chanceler resgatado.
const RESCUE_ESCORT_RADIUS = 16;
// Raio em que uma unidade inimiga conta como ameaça ao avaliar a rota de fuga do herói.
const HERO_THREAT_RADIUS = 18;
// ATRITO DE CAMPANHA: a vida da unidade cai continuamente em campo. Marchar cansa mais
// que manter posição, e operar longe de uma base aliada (linha de suprimento longa)
// acelera o desgaste. O campo é grande: mandar tropa sem plano custa caro, porque a
// coluna chega debilitada — e quem fica espalhado definha. É a mecânica que faz a
// EXPANSÃO territorial valer: uma base avançada encurta a linha de suprimento.
// Regeneração do chanceler parado (% da vida máxima por segundo). Compensa o atrito
// em marcha e faz o herói se recuperar ao segurar posição — o desgaste não o mata.
const HERO_REGEN = 0.03;

const WEAR_IDLE = 0.001; // fração da vida máxima perdida por segundo parado
const WEAR_MOVE = 0.006; // fração extra por segundo em deslocamento
const WEAR_FIELD = 40; // distância (mundo) em que o fator de suprimento dobra o atrito
const SUPPLY_RADIUS = 14; // dentro deste raio de uma base aliada não há desgaste
// Teto de EXÉRCITO por lado: quantas unidades vivas um lado pode manter em campo ao
// mesmo tempo. Sem isto a IA (e o jogador) empilha soldados sem limite — o campo vira
// uma multidão ilegível. Uma carta só é aceita se a unidade couber no teto.
export const MAX_UNITS_PER_SIDE = 33;
// Separação entre unidades: quantas vezes a soma dos raios elas mantêm de distância
// e quanto do excesso é corrigido por passo. O empurrão é TOTAL (1.0): com o
// relaxamento em passadas, cada par resolve a sobreposição no mesmo tick em vez de
// ficar "vazando" por vários quadros.
//
// FOLGA OBRIGATÓRIA: o fator é 1.3 — as unidades mantêm 30% da soma dos raios como
// espaço vazio entre elas. Com o fator perto de 1 (o antigo 1.05) a tropa ficava
// "colada": os corpos se tocavam, a distância entre centros ia a quase zero e o ângulo
// de mira (atan2 de um alvo praticamente sobreposto) oscilava — era o efeito de
// "girar amontoado". Com folga real, cada corpo tem espaço próprio e a mira estabiliza.
const SEPARATION_FACTOR = 1.3;
const SEPARATION_PUSH = 1.0;
// Lado da célula da grade espacial usada na separação. Precisa ser ≥ a MAIOR distância
// mínima possível entre dois corpos (raio máx. 3,6 × 2 × 1,3 ≈ 9,4), senão um par
// separado por duas células ainda poderia se sobrepor sem ser detectado.
const SEPARATION_CELL = 12;
// Giro máximo da mira por segundo (rad/s). A mira NÃO salta de um alvo para outro
// instantaneamente: ela roda até a direção desejada. Sem este limite, dois corpos muito
// próximos trocavam o ângulo a cada quadro e a unidade "girava" no lugar.
const AIM_TURN_RATE = 6.0;

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
    aim: HOME_AIM[spec.side],
    recoil: 0,
    ...(spec.captiveSide ? { captiveSide: spec.captiveSide } : {}),
  };
}

export function createBattle(config: BattleConfig): BattleState {
  const blue = makeSide("blue", config.blue, config);
  const red = makeSide("red", config.red, config);
  // A arena de catálogo é um TEMPLATE ESTÁTICO compartilhado por referência. Clonar
  // aqui garante que cada partida tenha o próprio estado: sem isso, um ponto de
  // controle capturado ou uma barricada de uma batalha vazariam para as seguintes
  // (o mesmo objeto de arena é reutilizado em todas as partidas do mesmo terreno).
  const arena = cloneArena(config.arena);
  const battleConfig: BattleConfig = { ...config, arena };
  const state: BattleState = {
    config: battleConfig,
    t: 0,
    phase: "mobilizacao",
    running: true,
    blue,
    red,
    zones: [],
    structures: arena.structures.map(makeStructure),
    territories: arena.territories.map((t) => ({ ...t, progress: { ...t.progress } })),
    projectiles: [],
    effects: [],
    log: [],
    outcome: null,
    reason: "",
    nextId: 1,
    aiTimer: 0,
    tick: 0,
    rng: config.seed >>> 0,
    holds: {},
    heroes: { blue: { state: "livre" }, red: { state: "livre" } },
  };
  initHeroes(state);
  initPrize(state);
  return state;
}

// ---------------------------------------------------------------------------
// Carta-prêmio em campo
// ---------------------------------------------------------------------------
//
// O INIMIGO traz a carta nova para o campo, guardada por uma escolta blindada que
// fica no meio do caminho (território disputado). A carta NÃO é entregue de graça:
// é preciso empurrar a linha até o comboio e mantê-lo sob controle pelo tempo de
// captura. A escolta reage e a captura reinicia se o comboio for perdido — a carta
// pode, sim, ficar para a próxima tentativa (derrota não entrega prêmio).
const PRIZE_CAPTURE_SECONDS = 4.5;
const PRIZE_CAPTURE_RADIUS = 12;

export function prizeConvoy(state: BattleState): BattleUnit | null {
  return state.red.units.find((u) => u.prizeConvoy && u.alive) ?? null;
}

/** Progresso (0-100) da captura do comboio pelo lado. */
export function prizeProgress(state: BattleState, side: Side): number {
  return state.prize?.progress[side] ?? 0;
}

// Monta o comboio à mão: ele não vem de carta (não é do baralho do inimigo) e não
// combate — é carga protegida. Fica parado no ponto central com a escolta em volta.
function initPrize(state: BattleState): void {
  const cardId = state.config.prizeCardId;
  if (!cardId) return;
  const mid = state.config.arena.controlPoints.find((p) => p.sector === "central");
  const x = mid ? mid.x : 50;
  const y = mid ? mid.y : 23;
  const convoy: BattleUnit = {
    id: "prize-convoy",
    side: "red",
    cardId: "prize-convoy",
    name: "Comboio de Carga",
    short: "CGA",
    category: "blindado",
    model: "vbld",
    weapon: { kind: "fuzil", projectileSpeed: 0, splash: 0, arc: false, homing: false, muzzle: 0 },
    builder: false,
    x,
    y,
    hp: 6000,
    maxHp: 6000,
    dmg: 0,
    speed: 0,
    range: 0,
    cooldown: 1,
    readyIn: 0,
    radius: 4.5,
    targets: "terra",
    domain: "terra",
    order: "manter",
    groupId: "prize",
    aim: HOME_AIM.red,
    recoil: 0,
    alive: true,
    engaged: false,
    smoke: 0,
    jammed: 0,
    revealed: 0,
    seen: { blue: false, red: false },
    heal: 0,
    level: 1,
    armor: 0,
    hitFlash: 0,
    wear: 0,
    prizeConvoy: true,
  };
  state.red.units.push(convoy);
  // Escolta inicial: dois pelotões de assalto guardando o comboio.
  for (const [dx, dy] of [
    [0, -6],
    [0, 6],
  ] as const) {
    const esc = spawnUnit(state, "red", "inf-assalto", x + dx, y + dy, { groupId: "prize-escort" });
    esc.goalX = x + dx;
    esc.goalY = y + dy;
    esc.goalAuto = true;
    esc.holdAtGoal = true;
    state.red.units.push(esc);
  }
  state.prize = {
    cardId,
    x,
    y,
    capturedBy: null,
    failed: false,
    extracted: false,
    progress: { blue: 0, red: 0 },
    nextId: 0,
  };
  pushLog(state, "red", "evento", `Comboio com a carta ${cardId} entrou em campo. Capture-o.`);
}

function updatePrize(state: BattleState, dt: number): void {
  const prize = state.prize;
  if (!prize || prize.capturedBy || prize.failed) return;
  const convoy = prizeConvoy(state);
  // Escolta destruída: o comboio recua com a carta. Nada de prêmio automático.
  if (!convoy) {
    prize.failed = true;
    pushLog(state, "sistema", "evento", "Escolta destruída: o comboio recuou com a carta.");
    return;
  }
  // Raio generoso: as tropas param no alcance de tiro, então CERCA (1 contra 3) conta.
  const bluePower = capturePower(state, "blue", prize.x, prize.y, PRIZE_CAPTURE_RADIUS);
  const redPower = capturePower(state, "red", prize.x, prize.y, PRIZE_CAPTURE_RADIUS);
  // A captura é decidida por SUPERIORIDADE no local: quem tem mais força ao redor do
  // comboio avança. Assim, cercar com números superiores (1 contra 3) toma a carga, e a
  // escolta precisa de reforço real para segurá-la — não basta estar por perto.
  const rate = 100 / PRIZE_CAPTURE_SECONDS;
  if (bluePower > redPower) {
    prize.progress.blue = Math.min(100, prize.progress.blue + rate * dt);
  } else if (redPower > bluePower) {
    prize.progress.blue = Math.max(0, prize.progress.blue - rate * dt);
  }
  prize.progress.red = redPower > bluePower ? 100 : 0;
  if (prize.progress.blue >= 100) {
    // Capturado: o comboio passa a seguir a força azul e precisa CHEGAR À BASE aliada.
    // Só então a carta entra no arsenal — capturar em campo é metade do trabalho.
    prize.capturedBy = "blue";
    convoy.side = "blue";
    convoy.order = "avancar";
    delete convoy.goalX;
    delete convoy.goalY;
    const base = state.structures.find(
      (st) => st.alive && st.side === "blue" && st.kind === "base-principal",
    );
    if (base) {
      convoy.goalX = base.x;
      convoy.goalY = base.y;
    }
    addEffect(state, "explosion", prize.x, prize.y, 5);
    pushLog(state, "blue", "captura", "Comboio dominado: escolte a carga até a base.");
  }
}

// Extração: com o comboio capturado, o prêmio só é confirmado quando ele CHEGA ao
// território aliado. Se for abatido no caminho, a carta se perde de vez.
function updatePrizeExtraction(state: BattleState): void {
  const prize = state.prize;
  if (!prize || !prize.capturedBy) return;
  const convoy = prizeConvoy(state);
  if (!convoy) {
    prize.failed = true;
    prize.capturedBy = null;
    pushLog(state, "sistema", "evento", "A carga foi destruída no trajeto: carta perdida.");
    return;
  }
  const home = state.structures.find(
    (st) => st.alive && st.side === "blue" && st.kind === "base-principal",
  );
  if (home && dist(convoy.x, convoy.y, home.x, home.y) <= home.radius + convoy.radius + 4) {
    prize.extracted = true;
    pushLog(state, "blue", "captura", `Carga entregue na base: carta ${prize.cardId} garantida.`);
  }
}

// ---------------------------------------------------------------------------
// Chanceleres e prisões
// ---------------------------------------------------------------------------
//
// O CHANCELER é o herói de cada lado: uma unidade única, controlada pelo jogador, que
// decide a guerra. Ele pode começar LIVRE em campo ou PRESO numa instalação inimiga —
// nesse caso só entra no jogo quando a prisão é destruída (resgate). Eliminar o
// chanceler adversário vence; perder o seu é a derrota.

export const HERO_CARD = "hero-chanceler";

/** true quando o lado ainda tem um chanceler em jogo ou vivo (livre/preso). */
export function sideHasChancellor(state: BattleState, side: Side): boolean {
  return state.heroes[side].state !== "morto";
}

function spawnChancellor(
  state: BattleState,
  side: Side,
  x: number,
  y: number,
  initial: HeroStatus["state"] = "livre",
): BattleUnit {
  const cfg = side === "blue" ? state.blue : state.red;
  const u = spawnUnit(state, side, HERO_CARD, x, y, {
    name: `${cfg.countryName} · Chanceler`,
    groupId: `hero-${side}`,
  });
  u.hero = true;
  // O chanceler NÃO avança sozinho: fica onde está até receber ordem explícita.
  u.order = "manter";
  cfg.units.push(u);
  state.heroes[side] = { state: initial, unitId: u.id };
  pushLog(state, side, "evento", `Chanceler ${cfg.countryName} entrou em campo.`);
  return u;
}

// Cria os chanceleres conforme o cenário: LIVRE (em campo desde o início) ou PRESO
// (dentro de uma prisão do adversário, que precisa ser destruída para libertá-lo).
function initHeroes(state: BattleState): void {
  const setups = state.config.heroSetup;
  // Sem cenário de herói, a batalha não tem chanceler: as regras antigas valem (base
  // principal). O chanceler é um OBJETIVO de missão, definido pelo cenário da operação.
  if (!setups || setups.length === 0) return;
  for (const setup of setups) {
    if (setup.status === "livre") {
      spawnChancellor(state, setup.side, setup.x, setup.y);
    } else {
      // Preso: a prisão pertence ao ADVERSÁRIO e mantém o chanceler cativo.
      const owner = other(setup.side);
      const captiveCfg = setup.side === "blue" ? state.blue : state.red;
      const spec: StructureSpec = {
        id: `prisao-${setup.side}`,
        kind: "prisao",
        side: owner,
        name: `Prisão · ${captiveCfg.countryName}`,
        x: setup.x,
        y: setup.y,
        radius: 4.6,
        hp: 1600,
        dmg: 0,
        range: 0,
        cooldown: 2,
        targets: "terra",
        captiveSide: setup.side,
      };
      const prison = makeStructure(spec);
      prison.captiveSide = setup.side;
      state.structures.push(prison);
      state.heroes[setup.side] = { state: "preso", prisonId: prison.id };
      pushLog(
        state,
        owner,
        "evento",
        `Chanceler ${captiveCfg.countryName} mantido preso em ${prison.name}.`,
      );
    }
  }
}

// Destruiu a prisão: liberta o chanceler cativo, que nasce em campo ao lado. Ele sai
// FUGINDO — recém-solto e ainda em território hostil. Só vence quem o trouxer de volta
// para o próprio território (aí sim "seguro").
function liberatePrison(state: BattleState, prison: Structure, liberator: BattleUnit | null): void {
  const captive = prison.captiveSide;
  if (!captive) return;
  const st = state.heroes[captive];
  if (st.state !== "preso") return;
  const cfg = captive === "blue" ? state.blue : state.red;
  const home = inFriendlyTerritory(state, captive, prison.x, prison.y);
  const hero = spawnChancellor(state, captive, prison.x, prison.y + 2, home ? "seguro" : "fugindo");
  pushLog(state, captive, "evento", `Chanceler ${cfg.countryName} foi resgatado!`);
  if (home) return;

  // ESCOLTA AUTOMÁTICA: quem derrubou a prisão passa a escoltar o resgatado — junto com
  // a tropa aliada que está na área do resgate. A extração começa imediatamente, sem
  // precisar de uma segunda ordem do jogador.
  const escorts = new Set<BattleUnit>();
  if (liberator && liberator.alive && liberator.side === captive && !liberator.hero)
    escorts.add(liberator);
  for (const u of cfg.units) {
    if (!u.alive || u.hero || u.escortId) continue;
    if (dist(u.x, u.y, prison.x, prison.y) <= RESCUE_ESCORT_RADIUS) escorts.add(u);
  }
  for (const u of escorts) {
    u.escortId = hero.id;
    u.order = "avancar";
    delete u.goalX;
    delete u.goalY;
    delete u.attackStructureId;
    delete u.attackTerritoryId;
    delete u.targetId;
  }
  pushLog(
    state,
    captive,
    "evento",
    escorts.size > 0
      ? `${escorts.size} unidade(s) formaram a escolta automática do chanceler ${cfg.countryName}.`
      : `Escolte o chanceler ${cfg.countryName} de volta ao território controlado.`,
  );
}

// Morreu um chanceler. A morte NÃO decide sozinha: só vence quem também já tem o
// PRÓPRIO chanceler em segurança (livre ou resgatado e em casa). Um lado com o
// chanceler preso ou fugindo elimina o adversário, mas a guerra segue até ele voltar.
function heroDied(state: BattleState, unit: BattleUnit): void {
  const side = unit.side;
  state.heroes[side] = { state: "morto", unitId: unit.id };
  const cfg = side === "blue" ? state.blue : state.red;
  pushLog(state, other(side), "evento", `Chanceler ${cfg.countryName} foi eliminado.`);
  if (!checkHeroVictory(state)) {
    // O outro lado ainda não pode vencer (chanceler preso ou fugindo): continua.
    const foe = other(side);
    if (state.heroes[foe].state === "preso")
      pushLog(state, foe, "evento", "Resgate o seu chanceler antes de reivindicar a vitória.");
    else if (state.heroes[foe].state === "fugindo")
      pushLog(
        state,
        foe,
        "evento",
        "Traga o seu chanceler em segurança antes de reivindicar a vitória.",
      );
  }
}

// Um lado só pode VENCER com o próprio chanceler seguro: "livre" (nunca foi capturado)
// ou "seguro" (resgatado e de volta ao território controlado). "preso" e "fugindo" não
// contam. Decide o fim quando um chanceler morre; devolve true se encerrou a partida.
function checkHeroVictory(state: BattleState): boolean {
  const blueDead = state.heroes.blue.state === "morto";
  const redDead = state.heroes.red.state === "morto";
  if (!blueDead && !redDead) return false;
  const blueOk = canClaimVictory(state, "blue");
  const redOk = canClaimVictory(state, "red");
  if (blueDead && redDead) {
    finish(state, "empate", "Os dois chanceleres foram eliminados.");
    return true;
  }
  if (redDead && blueOk) {
    finish(
      state,
      "vitoria",
      "Chanceler adversário eliminado com o seu em segurança — guerra vencida.",
    );
    return true;
  }
  if (blueDead && redOk) {
    finish(state, "derrota", "Seu chanceler foi eliminado com o adversário em segurança.");
    return true;
  }
  return false;
}

// O chanceler do lado está em segurança para reivindicar a vitória?
function canClaimVictory(state: BattleState, side: Side): boolean {
  const st = state.heroes[side].state;
  return st === "livre" || st === "seguro";
}

// O ponto está em território CONTROLADO pelo lado? Vale a zona de desdobramento, um
// território conquistado no raio, ou a proximidade de uma base aliada (principal ou
// avançada operacional).
function inFriendlyTerritory(state: BattleState, side: Side, x: number, y: number): boolean {
  const zone = state.config.arena.deployZone[side];
  if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) return true;
  for (const t of state.territories) {
    if (t.owner === side && dist(x, y, t.x, t.y) <= t.radius + 2) return true;
  }
  for (const s of state.structures) {
    if (!s.alive || s.side !== side) continue;
    const isBase =
      s.kind === "base-principal" || (s.kind === "base-avancada" && !s.underConstruction);
    if (isBase && dist(x, y, s.x, s.y) <= s.radius + 6) return true;
  }
  return false;
}

// Atualiza o estado dos chanceleres a cada passo: um chanceler FUGINDO corre sozinho
// para a base aliada mais próxima e, ao alcançar território controlado, fica SEGURO —
// é a "extração" que habilita a vitória. Também reavalia a vitória quando ele chega.
function updateHeroes(state: BattleState): void {
  for (const side of ["blue", "red"] as Side[]) {
    const st = state.heroes[side];
    if (st.state !== "fugindo" || !st.unitId) continue;
    const cfg = side === "blue" ? state.blue : state.red;
    const hero = cfg.units.find((u) => u.id === st.unitId && u.alive);
    if (!hero) continue;
    if (inFriendlyTerritory(state, side, hero.x, hero.y)) {
      state.heroes[side] = { state: "seguro", unitId: hero.id };
      pushLog(state, side, "evento", `Chanceler ${cfg.countryName} alcançou território seguro.`);
      checkHeroVictory(state);
      continue;
    }
    // Fuga automática: o chanceler ESCOLHE A ROTA mais segura até o território aliado
    // (não a mais curta), desviando dos bolsões de inimigos no caminho.
    const goal = heroEscapeGoal(state, side, hero);
    hero.goalX = goal.x;
    hero.goalY = goal.y;
    hero.holdAtGoal = true;
    hero.order = "avancar";
  }
}

// Ameaça inimiga num ponto: soma ponderada das unidades adversárias por perto (as mais
// próximas e mais letais pesam mais). Usada para avaliar rotas de fuga.
function threatAt(state: BattleState, side: Side, x: number, y: number): number {
  const enemy = other(side);
  const cfg = enemy === "blue" ? state.blue : state.red;
  let t = 0;
  for (const e of cfg.units) {
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d >= HERO_THREAT_RADIUS) continue;
    t += (1 - d / HERO_THREAT_RADIUS) * (1 + e.dmg / 40);
  }
  return t;
}

// ROTA DE FUGA: escolhe o destino que minimiza risco + distância. Os candidatos são as
// bases e territórios aliados (âncoras seguras); a rota de cada um é amostrada em passos
// e penalizada pela ameaça inimiga ao longo do caminho. Se o caminho direto passa por um
// bolsão de inimigos, um ponto de contorno lateral vence — o chanceler dá a volta.
function heroEscapeGoal(
  state: BattleState,
  side: Side,
  hero: BattleUnit,
): { x: number; y: number } {
  const anchors: { x: number; y: number }[] = [];
  for (const s of state.structures) {
    if (s.alive && s.side === side && s.kind !== "prisao") anchors.push({ x: s.x, y: s.y });
  }
  for (const t of state.territories) {
    if (t.owner === side) anchors.push({ x: t.x, y: t.y });
  }
  if (anchors.length === 0) {
    const zone = state.config.arena.deployZone[side];
    return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
  }

  // Só as âncoras mais próximas importam para a fuga: cortar o resto mantém o cálculo
  // barato (isto roda a cada quadro para cada chanceler em fuga).
  const near = anchors
    .slice()
    .sort((a, b) => dist(hero.x, hero.y, a.x, a.y) - dist(hero.x, hero.y, b.x, b.y))
    .slice(0, 5);

  const routeCost = (to: { x: number; y: number }): number => {
    const steps = 6;
    let threat = 0;
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      threat += threatAt(state, side, hero.x + (to.x - hero.x) * p, hero.y + (to.y - hero.y) * p);
    }
    const length = dist(hero.x, hero.y, to.x, to.y);
    return threat * 1.6 + length * 0.25;
  };

  let best = near[0]!;
  let bestCost = Infinity;
  for (const a of near) {
    const c = routeCost(a);
    if (c < bestCost) {
      bestCost = c;
      best = a;
    }
  }

  // Contorno local: se o trecho imediato até o destino ainda é perigoso, testa desvios
  // laterais (±45°/±90°) e segue o mais seguro — a rota deixa de ser uma linha reta.
  const direct = Math.atan2(best.y - hero.y, best.x - hero.x);
  const here = threatAt(state, side, hero.x, hero.y);
  const ahead = threatAt(state, side, hero.x + Math.cos(direct) * 8, hero.y + Math.sin(direct) * 8);
  if (ahead > here && ahead > 0.4) {
    let bestAngle = direct;
    let bestAhead = ahead;
    for (const off of [0.7, -0.7, 1.4, -1.4]) {
      const a = direct + off;
      const t = threatAt(state, side, hero.x + Math.cos(a) * 8, hero.y + Math.sin(a) * 8);
      if (t < bestAhead) {
        bestAhead = t;
        bestAngle = a;
      }
    }
    if (bestAngle !== direct) {
      const r = Math.min(dist(hero.x, hero.y, best.x, best.y), 10);
      return {
        x: clamp(hero.x + Math.cos(bestAngle) * r, WORLD_X_MIN, WORLD_X_MAX),
        y: clamp(hero.y + Math.sin(bestAngle) * r, WORLD_Y_MIN, WORLD_Y_MAX),
      };
    }
  }
  return best;
}

// Cópia profunda da arena: listas e objetos internos deixam de ser compartilhados
// entre partidas. O config original nunca é mutado pelo motor.
export function cloneArena(arena: Arena): Arena {
  return {
    ...arena,
    controlPoints: arena.controlPoints.map((p) => ({
      ...p,
      owner: "neutro",
      progress: { blue: 0, red: 0 },
    })),
    territories: arena.territories.map((t) => ({
      ...t,
      owner: "neutro",
      progress: { blue: 0, red: 0 },
    })),
    structures: arena.structures.map((s) => ({ ...s })),
    obstacles: arena.obstacles.map((o) => ({ ...o })),
    routes: arena.routes.map((r) => ({ ...r })),
    frontiers: (arena.frontiers ?? []).map((f) => ({ ...f })),
    deployZone: { blue: { ...arena.deployZone.blue }, red: { ...arena.deployZone.red } },
  };
}

function makeSide(side: Side, cfg: SideConfig, config: BattleConfig): SideState {
  // Baralho EQUIPADO (1 a 8 cartas), na ordem exata escolhida pelo jogador. Sem mão
  // rotativa: todas as cartas ficam disponíveis e a posição é fixa. O freio contra o
  // spam é a RECARGA por carta (Sov finito é o limite de longo prazo).
  const deck = cfg.deck.slice(0, MAX_DECK);
  const hand = deck.map((cardId) => ({ cardId, ready: true, readyIn: 0 }));
  const queue: string[] = [];
  // A dificuldade é uma alavanca ECONÔMICA além da velocidade de decisão: o lado
  // controlado pela IA (vermelho) começa com mais/menos Sov conforme o degrau. Com o
  // recurso finito, isto muda o quão rápido o inimigo pode escalar a ofensiva.
  const diffMult = side === "red" ? (config.aiDifficulty?.commandMult ?? 1) : 1;
  const startSov = Math.max(20, Math.round(SOV_START * diffMult));
  return {
    side,
    countryId: cfg.countryId,
    countryName: cfg.countryName,
    flag: cfg.flag,
    commander: cfg.commander,
    doctrine: cfg.doctrine,
    command: startSov,
    commandMax: startSov,
    regen: 0,
    coins: 0,
    income: 0,
    incomeTimer: 0,
    economyBonus: cfg.economyBonus,
    mods: cfg.mods,
    cardLevels: cfg.cardLevels ?? {},
    deck: { hand, queue, cycle: 0 },
    units: [],
    kills: 0,
    losses: 0,
    structuresDestroyed: 0,
    deployed: 0,
    score: 0,
    prisonersTaken: 0,
    prisonersLost: 0,
    capturedCards: [],
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
// Área de operações (SEM zona azul de posicionamento)
// ---------------------------------------------------------------------------
//
// Não existe mais "zona de desdobramento": o mapa inteiro recebe ORDENS. O clique
// no campo define o DESTINO da força, que sempre nasce na Base Principal (ou numa
// base avançada aliada próxima do destino) e caminha fisicamente até lá.

function insideRect(
  z: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
): boolean {
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}

// Mantida apenas para compatibilidade de leitura (missões/testes antigos): uma
// coordenada está "na área inicial" do lado se cair na metade de campo dele.
export function insideDeployZone(state: BattleState, side: Side, x: number, y: number): boolean {
  const z = state.config.arena.deployZone[side];
  if (insideRect(z, x, y)) return true;
  for (const s of state.structures) {
    if (!s.alive || s.side !== side || s.kind !== "base-avancada" || s.underConstruction) continue;
    if (dist(x, y, s.x, s.y) <= s.radius + 6) return true;
  }
  return false;
}

// Regra REAL de aceitação de uma ordem de desdobramento: o motor aceita um destino
// em QUALQUER ponto do teatro (a força nasce na base/avançada aliada mais próxima e
// marcha até lá). A única razão de recusa ligada à posição é o ponto ser inválido.
// `canDeploy` cobre o resto (energia e carta na mão), para a pré-visualização da UI
// nunca divergir do que `deploy` de fato aceita.
export function placementValid(_state: BattleState, _side: Side, x: number, y: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    x <= WORLD_X_MAX + 1 &&
    y >= 0 &&
    y <= WORLD_Y_MAX + 1
  );
}

export function canDeploy(
  state: BattleState,
  side: Side,
  cardId: string,
  x: number,
  y: number,
): boolean {
  if (!placementValid(state, side, x, y)) return false;
  const cfg = side === "blue" ? state.blue : state.red;
  const card = cardById(cardId);
  if (cfg.command < effectiveCost(card, cfg.doctrine)) return false;
  if (!cfg.deck.hand.some((h) => h.cardId === cardId)) return false;
  // Teto de exército: a carta só entra se a unidade couber no limite do lado.
  if (card.kind === "militar") {
    if (aliveUnits(state, side) + 1 > MAX_UNITS_PER_SIDE) return false;
  }
  return true;
}

/** Unidades vivas de um lado (o teto de exército conta só quem está em campo). */
export function aliveUnits(state: BattleState, side: Side): number {
  const cfg = side === "blue" ? state.blue : state.red;
  let n = 0;
  // Prisioneiros rendidos não contam como força: saíram do combate.
  for (const u of cfg.units) if (u.alive && !u.prizeConvoy && !u.surrendered) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Ordem de força: a carta nasce na base e caminha até o destino clicado
// ---------------------------------------------------------------------------

export interface DeployOrder {
  /** Ponto clicado no mapa (destino da força). */
  x: number;
  y: number;
  /** Alvo explícito do clique, quando o jogador clicou sobre algo do mapa. */
  targetUnitId?: string | undefined;
  targetStructureId?: string | undefined;
  targetTerritoryId?: string | undefined;
  /**
   * Ao alcançar o destino, a força para (posição defensiva) ou retoma o avanço?
   * Padrão `true` (a IA marca o objetivo e segura). Ordens do JOGADOR passam
   * `false`: a força marcha até o ponto e, de lá, volta a caçar o inimigo — em vez
   * de congelar no lugar (era o "as cartas não vão pra luta").
   */
  holdAtArrival?: boolean | undefined;
  /** Origem explícita escolhida pelo jogador (id da estrutura). Sem isto, o motor
   *  escolhe sozinho a base aliada mais próxima do destino (comportamento da IA). */
  originStructureId?: string | undefined;
  /** Lançamento em lote: não inicia a recarga da carta a cada unidade — a recarga é
   *  aplicada uma única vez, no fim do lote (ver `deployRepeat`). */
  skipRecharge?: boolean | undefined;
  /** Grupo compartilhado por todas as unidades do lote (permite reposicioná-las juntas). */
  groupId?: string | undefined;
  /** ESCOLTA: id do chanceler aliado que a força deve acompanhar (cerco de proteção). */
  escortId?: string | undefined;
  /** Deslocamento de FORMAÇÃO aplicado ao nascimento e ao destino (coluna de marcha). */
  offsetX?: number | undefined;
  offsetY?: number | undefined;
}

// Uma base do jogador é um ponto de lançamento válido: a base principal ou uma base
// avançada OPERACIONAL (em obra não conta). A escolha é explícita — o jogador define
// de onde a tropa sai, em vez do motor adivinhar pela proximidade do destino.
export function launchBaseById(state: BattleState, side: Side, id: string): Structure | null {
  const s = state.structures.find((x) => x.id === id && x.alive && x.side === side);
  if (!s) return null;
  if (s.kind === "base-principal") return s;
  if (s.kind === "base-avancada" && !s.underConstruction) return s;
  return null;
}

/** Bases de lançamento do lado, na ordem de conquista (base principal primeiro, depois
 *  as bases avançadas por ordem de criação). A numeração do HUD segue esta lista. */
export function launchBases(state: BattleState, side: Side): Structure[] {
  const base = state.structures.find(
    (s) => s.alive && s.side === side && s.kind === "base-principal",
  );
  const adv = state.structures.filter(
    (s) => s.alive && s.side === side && s.kind === "base-avancada" && !s.underConstruction,
  );
  return base ? [base, ...adv] : adv;
}

export function deploy(
  state: BattleState,
  side: Side,
  cardId: string,
  x: number,
  y: number,
  order: DeployOrder = { x, y },
): boolean {
  return deployOne(state, side, cardId, x, y, order);
}

// Lançamento de UMA unidade. `order.originStructureId`, quando presente, fixa a base de
// origem (escolha do jogador); caso contrário a origem é automática (IA/ordens antigas).
function deployOne(
  state: BattleState,
  side: Side,
  cardId: string,
  x: number,
  y: number,
  order: DeployOrder,
): boolean {
  const cfg = side === "blue" ? state.blue : state.red;
  const card = cardById(cardId);
  const cost = effectiveCost(card, cfg.doctrine);
  if (cfg.command < cost) return false;
  const inHand = cfg.deck.hand.find((h) => h.cardId === cardId);
  if (!inHand) return false;
  if (!inHand.ready) return false;

  if (card.kind === "militar") {
    // Teto de exército: recusa a carta se as unidades não couberem em campo (uma carta
    // de nível máximo lança 2, então o teto é checado pelo tamanho real da força).
    const forceCount = unitsPerDeploy(cfg.cardLevels?.[cardId] ?? 1);
    if (aliveUnits(state, side) + forceCount > MAX_UNITS_PER_SIDE) return false;
    const force = deployForce(state, side, card.id, order);
    if (force === 0) return false;
    cfg.command -= cost;
    if (!order.skipRecharge) advanceDeck(cfg, cardId);
    pushLog(
      state,
      side,
      "deploy",
      `${cfg.countryName} envia ${card.name} para o setor ${Math.round(order.x)},${Math.round(order.y)}.`,
    );
    return true;
  }
  if (!applySupport(state, side, card as SupportCard, x, y)) return false;
  cfg.command -= cost;
  if (!order.skipRecharge) advanceDeck(cfg, cardId);
  pushLog(state, side, "apoio", `${cfg.countryName} emprega ${card.name}.`);
  return true;
}

/**
 * Lança `count` unidades da MESMA carta. A recarga é aplicada UMA única vez, no fim:
 * `deployOne` marca a carta como recarregando logo no primeiro lançamento, então um
 * loop ingênuo pararia em 1 unidade (era o bug do "cliquei 3× e veio 1 soldado").
 * Devolve quantas foram efetivamente criadas.
 */
function deployRepeat(
  state: BattleState,
  side: Side,
  cardId: string,
  x: number,
  y: number,
  count: number,
  order: DeployOrder,
): number {
  const cfg = side === "blue" ? state.blue : state.red;
  const card = cardById(cardId);
  const cost = effectiveCost(card, cfg.doctrine);
  let created = 0;
  for (let i = 0; i < count; i++) {
    if (cfg.command < cost) break;
    if (!deployOne(state, side, cardId, x, y, { ...order, skipRecharge: true })) break;
    created += 1;
  }
  if (created > 0) advanceDeck(cfg, cardId);
  return created;
}

export interface DeployRequest {
  cardId: string;
  count: number;
}

export interface DeployBatchResult {
  ok: boolean;
  deployed: number;
  spent: number;
  error?: string;
}

/**
 * Envio de uma OPERAÇÃO: várias unidades de várias cartas, todas partindo da MESMA
 * base escolhida pelo jogador, com destino clicado no mapa. Cada unidade continua
 * individual no motor — o lote é só uma facilidade de comando. A cobrança é atômica:
 * o lote inteiro é recusado se faltar Sov, se estourar o teto de exército ou se a
 * origem não for uma base válida do lado. Assim nunca há cobrança parcial nem unidades
 * "fantasma".
 *
 * As forças marcham em COLUNA: cada carta recebe um deslocamento perpendicular à
 * linha de avanço (blindados à frente no centro, infantaria nos flancos, apoio na
 * retaguarda), então o combo chega junto e escalonado, não amontoado no mesmo pixel.
 */
export function deployBatch(
  state: BattleState,
  side: Side,
  requests: DeployRequest[],
  order: DeployOrder,
): DeployBatchResult {
  const cfg = side === "blue" ? state.blue : state.red;
  const total = requests.reduce((a, r) => a + Math.max(0, Math.floor(r.count)), 0);
  if (total === 0)
    return { ok: false, deployed: 0, spent: 0, error: "Nenhuma unidade selecionada." };

  const origin = order.originStructureId
    ? launchBaseById(state, side, order.originStructureId)
    : null;
  if (order.originStructureId && !origin)
    return { ok: false, deployed: 0, spent: 0, error: "Origem inválida." };

  // Custo total: preço efetivo de cada carta × quantidade.
  let cost = 0;
  for (const r of requests) {
    const n = Math.max(0, Math.floor(r.count));
    if (n === 0) continue;
    const card = cardById(r.cardId);
    if (!cfg.deck.hand.some((h) => h.cardId === r.cardId))
      return { ok: false, deployed: 0, spent: 0, error: `${card.name} não está equipada.` };
    cost += effectiveCost(card, cfg.doctrine) * n;
  }
  if (cfg.command < cost)
    return { ok: false, deployed: 0, spent: 0, error: "Sov insuficiente para o envio." };

  const military = requests.reduce(
    (a, r) =>
      a + Math.max(0, Math.floor(r.count)) * (cardById(r.cardId).kind === "militar" ? 1 : 0),
    0,
  );
  if (aliveUnits(state, side) + military > MAX_UNITS_PER_SIDE)
    return { ok: false, deployed: 0, spent: 0, error: "Teto de exército atingido." };

  const groupId = `g${state.nextId}`;
  // Formação em coluna só faz sentido com uma força COMPOSTA (2+ cartas): aí os
  // blindados vão à frente e a artilharia/apoio atrás. Uma carta sozinha vai reta ao
  // destino, sem deslocamento — nada de "o soldado nasce torto".
  const distinct = new Set(requests.filter((r) => r.count > 0).map((r) => r.cardId));
  const formed = distinct.size > 1;
  // ORDEM DE MARCHA: os mais RESISTENTES vão à frente e os frágeis atrás, protegidos.
  // O tanque puxa a coluna; fuzileiros/artilharia marcham na retaguarda. Empate desfaz-se
  // pela velocidade (mais rápido na frente). Determinístico.
  const depthByCard = new Map<string, number>();
  if (formed) {
    const stats = (id: string): { hp: number; speed: number } => {
      const c = cardById(id);
      return c.kind === "militar" ? { hp: c.hp, speed: c.speed } : { hp: 0, speed: 0 };
    };
    const ordered = [...distinct].sort((a, b) => {
      const ca = stats(a);
      const cb = stats(b);
      if (cb.hp !== ca.hp) return cb.hp - ca.hp;
      return cb.speed - ca.speed;
    });
    ordered.forEach((id, i) => depthByCard.set(id, 8 - i * 5));
  }
  let deployed = 0;
  let spent = 0;
  for (const r of requests) {
    const n = Math.max(0, Math.floor(r.count));
    const offset = formed
      ? formationOffset(state, side, r.cardId, order, groupId, depthByCard)
      : { x: 0, y: 0 };
    const before = deployed;
    const made = deployRepeat(state, side, r.cardId, order.x, order.y, n, {
      ...order,
      groupId,
      offsetX: offset.x,
      offsetY: offset.y,
    });
    deployed += made;
    spent += (deployed - before) * effectiveCost(cardById(r.cardId), cfg.doctrine);
  }
  return { ok: deployed > 0, deployed, spent };
}

/**
 * Deslocamento de formação por carta: distribui as forças do lote pela LARGURA do
 * front (perpendicular à linha base→destino) e escalona em PROFUNDIDADE conforme a
 * doutrina de marcha — blindados à frente, infantaria no meio, artilharia/apoio na
 * retaguarda. Assim o combo marcha como uma coluna de batalha escalonada, com quem
 * atira de longe protegido atrás de quem aguenta o tranco. Determinístico.
 */
function formationOffset(
  state: BattleState,
  side: Side,
  cardId: string,
  order: DeployOrder,
  groupId: string,
  depthByCard: Map<string, number>,
): { x: number; y: number } {
  const card = cardById(cardId);
  // Eixo de avanço = da origem (base) ao destino; perpendicular = largura do front.
  const origin = order.originStructureId
    ? launchBaseById(state, side, order.originStructureId)
    : null;
  const from = origin ?? originFor(state, side, order.x, order.y);
  let ax = order.x - from.x;
  let ay = order.y - from.y;
  const len = Math.hypot(ax, ay) || 1;
  ax /= len;
  ay /= len;
  const px = -ay; // perpendicular
  const py = ax;
  // Fila da categoria no lote (0-based): define a posição na largura do front.
  const laneByCategory: Record<string, number> = {
    blindado: 0,
    infantaria: 1,
    artilharia: 2,
    reconhecimento: 3,
    defesa: 4,
    apoio: 5,
  };
  const lane = laneByCategory[card.category] ?? 3;
  const width = (lane - 2) * 6.5; // −13..+13 unidades pela largura do front
  // Profundidade: positivo = mais à frente (perto do inimigo). A frente é ocupada
  // pelos mais resistentes (depthByCard, montado por vida/velocidade da carta).
  const base = depthByCard.get(cardId) ?? 0;
  // Cartas repetidas no mesmo lote empilham um pouco mais atrás.
  const rank = rankInGroup(state, groupId);
  const depth = base - rank * 2.5;
  return { x: px * width + ax * depth, y: py * width + ay * depth };
}

/** Quantas cartas já entraram neste grupo (posição de profundidade na coluna). */
function rankInGroup(state: BattleState, groupId: string): number {
  const all = [...state.blue.units, ...state.red.units].filter((u) => u.groupId === groupId);
  const seen = new Set(all.map((u) => u.cardId));
  return seen.size;
}

// Ponto de origem da força: a base principal do lado (ou a base avançada aliada
// operacional mais próxima do destino — a expansão cria novas posições de lançamento).
export function originFor(
  state: BattleState,
  side: Side,
  x: number,
  y: number,
): { x: number; y: number } {
  const base = state.structures.find(
    (s) => s.alive && s.side === side && s.kind === "base-principal",
  );
  let best: { x: number; y: number; d: number } | null = null;
  for (const s of state.structures) {
    if (!s.alive || s.side !== side || s.kind !== "base-avancada" || s.underConstruction) continue;
    const d = dist(s.x, s.y, x, y);
    if (!best || d < best.d) best = { x: s.x, y: s.y, d };
  }
  const basePoint = base ? { x: base.x, y: base.y } : HOME_POINT[side];
  if (best && best.d < dist(basePoint.x, basePoint.y, x, y)) {
    return { x: best.x, y: best.y };
  }
  return basePoint;
}

// Gera a força da carta em formação, na origem, com a ordem de destino. Devolve o
// número de unidades efetivamente criadas (0 = carta sem efeito).
function deployForce(state: BattleState, side: Side, cardId: string, order: DeployOrder): number {
  const cfg = side === "blue" ? state.blue : state.red;
  // UMA carta lança `unitsPerDeploy(nível)` unidades: 1 na carta comum, 2 no nível
  // máximo (50). É o marco de evolução — o pelotão de elite. Todas as unidades nascem
  // na origem (base escolhida ou a aliada mais próxima do destino) e marcham juntas.
  const level = cfg.cardLevels?.[cardId] ?? 1;
  const count = unitsPerDeploy(level);
  const chosen = order.originStructureId
    ? launchBaseById(state, side, order.originStructureId)
    : null;
  const origin = chosen ?? originFor(state, side, order.x, order.y);
  const ox = clamp(origin.x + (order.offsetX ?? 0), WORLD_X_MIN, WORLD_X_MAX);
  const oy = clamp(origin.y + (order.offsetY ?? 0), WORLD_Y_MIN, WORLD_Y_MAX);
  // Destino deslocado pela MESMA formação: a coluna inteira mantém o escalonamento ao
  // chegar, em vez de convergir num único ponto.
  const gx = clamp(order.x + (order.offsetX ?? 0), WORLD_X_MIN, WORLD_X_MAX);
  const gy = clamp(order.y + (order.offsetY ?? 0), WORLD_Y_MIN, WORLD_Y_MAX);
  const groupId = order.groupId ?? `g${state.nextId}`;
  for (let i = 0; i < count; i++) {
    // Leve espaçamento perpendicular para as unidades do par não nascerem sobrepostas.
    const off = count > 1 ? (i - (count - 1) / 2) * 2.2 : 0;
    const u = spawnUnit(state, side, cardId, clamp(ox + off, WORLD_X_MIN, WORLD_X_MAX), oy, {
      groupId,
    });
    u.goalX = clamp(gx + off, WORLD_X_MIN, WORLD_X_MAX);
    u.goalY = gy;
    // Ordem da IA segura a posição ao chegar (padrão); a ordem do JOGADOR passa
    // holdAtArrival=false e a unidade volta a caçar o inimigo em vez de congelar.
    u.holdAtGoal = order.holdAtArrival ?? true;
    if (order.targetUnitId) u.targetId = order.targetUnitId;
    if (order.targetStructureId) u.attackStructureId = order.targetStructureId;
    if (order.targetTerritoryId) u.attackTerritoryId = order.targetTerritoryId;
    u.order = "avancar";
    // Escolta: a tropa destacada larga o destino e passa a orbitar o chanceler.
    if (order.escortId) {
      const hero = cfg.units.find((h) => h.id === order.escortId && h.alive && h.hero);
      if (hero) {
        u.escortId = hero.id;
        delete u.goalX;
        delete u.goalY;
      }
    }
    cfg.units.push(u);
  }
  return count;
}

// Habilidades de área podem ser lançadas sobre qualquer ponto do teatro.
export const GLOBAL_SUPPORT: SupportCard["ability"][] = [
  "ataque_aereo",
  "fumaca",
  "gas",
  "interferencia",
  "reconhecimento",
  "paraquedistas",
  "bombardeiro",
];

// Baralho FIXO: a carta usada NÃO sai da mão nem é substituída. Nada de fila/rotação
// — o jogador escolheu o baralho e a posição de cada carta é estável na partida toda.
// O que muda ao usar é a RECARGA: a carta entra em espera por alguns segundos.
function advanceDeck(cfg: SideState, cardId: string): void {
  const h = cfg.deck.hand.find((x) => x.cardId === cardId);
  if (!h) return;
  const card = cardById(cardId);
  h.readyIn = rechargeFor(card);
  h.ready = false;
}

// Recarga da carta: cresce com o custo, então a carta barata volta rápido e a cara
// (tanque, artilharia pesada) exige planejamento. É o freio de CURTO prazo contra o
// spam; o Sov finito é o freio de longo prazo da partida.
export function rechargeFor(card: Card): number {
  return 3 + card.cost * 0.22;
}

// Avança a recarga das cartas de um lado e devolve as que ficaram prontas.
function tickRecharge(cfg: SideState, dt: number): void {
  for (const h of cfg.deck.hand) {
    if ((h.readyIn ?? 0) > 0) {
      h.readyIn = Math.max(0, (h.readyIn ?? 0) - dt);
      if (h.readyIn === 0) h.ready = true;
    }
  }
}

// Variação natural de velocidade por unidade (±7%): duas tropas da mesma carta não
// marcham exatamente no mesmo ritmo, então o grupo lê como coluna em deslocamento em
// vez de blocos sincronizados. Determinística (deriva do id) para o replay ser estável.
function speedJitter(seed: number): number {
  const h = Math.sin(seed * 12.9898) * 43758.5453;
  return 0.93 + (h - Math.floor(h)) * 0.14;
}

function spawnUnit(
  state: BattleState,
  side: Side,
  cardId: string,
  x: number,
  y: number,
  opts: { name?: string; groupId?: string } = {},
): BattleUnit {
  const card = militaryById(cardId);
  const cfg = side === "blue" ? state.blue : state.red;
  const mod = doctrines[cfg.doctrine as keyof typeof doctrines];
  const sideMods = cfg.mods;
  const level = cfg.cardLevels?.[cardId] ?? 1;
  const levelMult = cardLevelMultiplier(level);
  // Atributos COMPLETOS da carta: a unidade é individual e tem a vida, o dano e a
  // resistência cheios definidos no catálogo. Não há mais divisão de esquadrão.
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
    (1 + (sideMods?.speed?.[card.category] ?? 0)) *
    cardSpeedMultiplier(level);
  const maxHp = Math.max(1, Math.round(card.hp * hpMult));
  cfg.deployed += 1;
  // INTELIGÊNCIA DE CAPTURA: a unidade porta uma carta listada como espólio (ausente do
  // arsenal do jogador). As tropas azuis a reconhecem em campo e a priorizam — abatê-la
  // pode render a carta como prêmio de guerra.
  const bounty = Boolean(cardId && state.config.bountyCardIds?.includes(cardId));
  return {
    id: `u${state.nextId++}`,
    side,
    cardId,
    name: opts.name ?? card.name,
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
    speed: card.speed * speedMult * speedJitter(state.nextId),
    range: card.range,
    cooldown: card.cooldown,
    readyIn: 0,
    radius: card.radius,
    targets: card.targets,
    domain: card.domain,
    ...(card.hero ? { hero: true } : {}),
    ...(card.dmgVs ? { dmgVs: card.dmgVs } : {}),
    order: "avancar",
    groupId: opts.groupId ?? `g${state.nextId}`,
    aim: HOME_AIM[side],
    recoil: 0,
    alive: true,
    engaged: false,
    smoke: 0,
    jammed: 0,
    revealed: 0,
    seen: { blue: false, red: false },
    heal: cardId === "apo-posto" ? Math.round(HEAL_PER_PULSE * levelMult) : 0,
    level,
    armor: cardArmorFraction(level),
    hitFlash: 0,
    wear: 0,
    ...(bounty ? { bounty: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Cartas de apoio
// ---------------------------------------------------------------------------

// Seleciona as unidades de um lado afetadas por uma ordem de movimento: um grupo
// (esquadrão) ou uma unidade avulsa. Sem alvo, devolve todas as unidades vivas.
function unitsForSelection(
  state: BattleState,
  side: Side,
  sel: { groupId?: string; unitId?: string },
): BattleUnit[] {
  const cfg = side === "blue" ? state.blue : state.red;
  if (sel.groupId) return cfg.units.filter((u) => u.alive && u.groupId === sel.groupId);
  if (sel.unitId) return cfg.units.filter((u) => u.alive && u.id === sel.unitId);
  return cfg.units.filter((u) => u.alive);
}

// Quebra uma tropa em unidades independentes: cada uma passa a ter o próprio grupo e,
// portanto, escolhe sozinha o alvo que neutraliza melhor (selectTarget por prioridade).
// Devolve quantas unidades foram separadas (0 = nada a fazer).
export function separate(state: BattleState, side: Side, groupId: string): number {
  const cfg = side === "blue" ? state.blue : state.red;
  const members = cfg.units.filter((u) => u.alive && u.groupId === groupId);
  if (members.length < 2) return 0;
  for (const u of members) u.groupId = `g${state.nextId++}`;
  return members.length;
}

// ESCOLTA: manda as unidades selecionadas acompanharem um chanceler aliado. A tropa
// abandona o avanço automático e passa a orbitar o herói, fechando o cerco pelo lado
// da ameaça — mas SEM encostar nele (cada uma guarda um posto no anel de proteção).
export function assignEscort(
  state: BattleState,
  side: Side,
  heroUnitId: string,
  sel: { groupId?: string; unitId?: string } = {},
): number {
  const cfg = side === "blue" ? state.blue : state.red;
  const hero = cfg.units.find((u) => u.id === heroUnitId && u.alive && u.hero);
  if (!hero) return 0;
  const targets = unitsForSelection(state, side, sel).filter((u) => !u.hero);
  if (targets.length === 0) return 0;
  for (const u of targets) {
    u.escortId = hero.id;
    u.order = "avancar";
    delete u.goalX;
    delete u.goalY;
    delete u.attackStructureId;
    delete u.attackTerritoryId;
    delete u.targetId;
  }
  pushLog(
    state,
    side,
    "ordem",
    `${cfg.countryName}: ${targets.length} unidade(s) destacada(s) para escoltar o chanceler.`,
  );
  return targets.length;
}

// Posto de escolta: um anel em volta do chanceler, de frente para a AMEAÇA mais
// próxima, com o raio calculado para NÃO encostar nele.
function escortGoal(state: BattleState, u: BattleUnit, hero: BattleUnit): { x: number; y: number } {
  const cfg = u.side === "blue" ? state.blue : state.red;
  const mates = cfg.units.filter((x) => x.alive && x.escortId === hero.id);
  const idx = Math.max(0, mates.indexOf(u));
  const n = Math.max(1, mates.length);
  const R = hero.radius + 3.2; // folga: o cerco nunca cola no chanceler
  const threat = nearestEnemy(state, u.side, hero.x, hero.y);
  const baseAngle = threat
    ? Math.atan2(threat.y - hero.y, threat.x - hero.x)
    : u.side === "blue"
      ? 0
      : Math.PI;
  // Distribui os escoltas num arco de ~210° voltado para a ameaça (não em círculo
  // completo: ninguém fica "atrás" exposto, todos barram a aproximação).
  const spread = (Math.PI * 2 * 0.58) / n;
  const angle = baseAngle + (idx - (n - 1) / 2) * spread;
  return { x: hero.x + Math.cos(angle) * R, y: hero.y + Math.sin(angle) * R };
}

function nearestEnemy(
  state: BattleState,
  side: Side,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const enemy = other(side);
  const cfg = enemy === "blue" ? state.blue : state.red;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const e of cfg.units) {
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = { x: e.x, y: e.y };
    }
  }
  if (best) return best;
  // Sem inimigo em campo, aponta para a base adversária (direção geral da ameaça).
  const base = state.structures.find(
    (s) => s.alive && s.side === enemy && s.kind === "base-principal",
  );
  return base ? { x: base.x, y: base.y } : null;
}

// Reposiciona uma força existente para um novo destino/alvo no mapa.
export function reposition(
  state: BattleState,
  side: Side,
  sel: { groupId?: string; unitId?: string },
  order: DeployOrder,
  opts: { holdAtArrival?: boolean } = {},
): boolean {
  const targets = unitsForSelection(state, side, sel);
  if (targets.length === 0) return false;
  for (const u of targets) {
    u.goalX = clamp(order.x, WORLD_X_MIN, WORLD_X_MAX);
    u.goalY = clamp(order.y, WORLD_Y_MIN, WORLD_Y_MAX);
    delete u.escortId; // uma ordem manual desfaz a escolta
    delete u.attackStructureId;
    delete u.attackTerritoryId;
    delete u.targetId;
    if (order.targetUnitId) u.targetId = order.targetUnitId;
    if (order.targetStructureId) u.attackStructureId = order.targetStructureId;
    if (order.targetTerritoryId) u.attackTerritoryId = order.targetTerritoryId;
    u.order = "avancar";
    u.holdAtGoal = opts.holdAtArrival ?? true;
    if (u.builder) delete u.buildTerritoryId;
  }
  const cfg = side === "blue" ? state.blue : state.red;
  pushLog(
    state,
    side,
    "ordem",
    `${cfg.countryName} reposiciona ${targets.length} unidade(s) para ${Math.round(order.x)},${Math.round(order.y)}.`,
  );
  return true;
}

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
    case "gas": {
      // Nuvem tóxica: NÃO é bloqueio visual. Cada segundo dentro dela drena a vida
      // de QUALQUER unidade terrestre (aliada ou inimiga) até a morte. Aéreos passam
      // por cima; a máscara de proteção (campo `smoke`) imuniza quem estiver coberto.
      addZone(state, {
        kind: "gas",
        side,
        x,
        y,
        radius: card.radius ?? 8,
        remaining: card.duration ?? 10,
        magnitude: card.magnitude ?? 26,
      });
      addEffect(state, "gas", x, y, card.radius ?? 8, { side });
      pushLog(state, side, "apoio", "Bomba de gás lacrimogêneo lançada sobre o setor.");
      return true;
    }
    case "reforcos": {
      const count = card.magnitude ?? 2;
      const groupId = `g${state.nextId++}`;
      for (let i = 0; i < count; i++) {
        const off = i * 4 - (count - 1) * 2;
        cfg.units.push(
          spawnUnit(
            state,
            side,
            "inf-fuzileiros",
            clamp(x + off, WORLD_X_MIN, WORLD_X_MAX),
            clamp(y + 2, WORLD_Y_MIN, WORLD_Y_MAX),
            {
              name: "Pelotão de Reforço",
              groupId,
            },
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
        best.x = clamp(best.x, WORLD_X_MIN, WORLD_X_MAX);
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
      const groupId = `g${state.nextId++}`;
      for (let i = 0; i < count; i++) {
        const off = i * 4 - (count - 1) * 2;
        const px = clamp(x + off, WORLD_X_MIN, WORLD_X_MAX);
        const py = clamp(y + 1, WORLD_Y_MIN, WORLD_Y_MAX);
        const u = spawnUnit(state, side, "inf-fuzileiros", px, py, {
          name: "Pelotão Paraquedista",
          groupId,
        });
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
        const bx = clamp(x + off, WORLD_X_MIN, WORLD_X_MAX);
        const by = clamp(y + (i % 2 === 0 ? 1 : -1), WORLD_Y_MIN, WORLD_Y_MAX);
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
    kind === "explosion"
      ? 0.5
      : kind === "gas"
        ? 0.9
        : kind === "impact"
          ? 0.3
          : kind === "tracer"
            ? 0.12
            : 0.18;
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
  opts: { preserveGoals?: boolean } = {},
): boolean {
  const cfg = side === "blue" ? state.blue : state.red;
  // Ordens GLOBAIS (sem alvo) não arrastam o chanceler: o herói só se move por ordem
  // direta ao próprio (unitId), para o jogador não jogá-lo na frente de batalha sem querer.
  const targets = unitId
    ? cfg.units.filter((u) => u.id === unitId && u.alive)
    : cfg.units.filter((u) => u.alive && !u.hero);
  if (targets.length === 0) return false;
  for (const u of targets) {
    u.order = order;
    if (objectiveId) u.objectiveId = objectiveId;
    else delete u.objectiveId;
    if (opts.preserveGoals) continue;
    // Uma ordem explícita do jogador cancela o destino anterior: ele assumiu o controle.
    delete u.goalX;
    delete u.goalY;
    delete u.attackStructureId;
    delete u.attackTerritoryId;
    if (u.builder && order !== "manter") delete u.buildTerritoryId;
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

  updateEconomy(state, dt);
  // A recarga das CARTAS continua: é o freio de curto prazo contra o spam. O Sov (finito)
  // é o freio de longo prazo — não regenera, só volta de território conquistado.
  tickRecharge(state.blue, dt);
  tickRecharge(state.red, dt);

  updateZones(state, dt);
  // ORDEM JUSTA: quem atualiza primeiro dispara primeiro. Com o azul fixo na frente, ele
  // levava o primeiro tiro de TODO engajamento — com o tiro "parado no alcance" essa
  // iniciativa virava vitória automática. Alternamos a ordem a cada passo (determinístico)
  // para que a iniciativa se divida igualmente entre os lados.
  state.tick += 1;
  const updateOrder: Side[] = state.tick % 2 === 0 ? ["blue", "red"] : ["red", "blue"];
  for (const side of updateOrder) {
    const cfg = side === "blue" ? state.blue : state.red;
    for (const u of cfg.units) {
      if (!u.alive) continue;
      const px = u.x;
      const py = u.y;
      updateUnit(state, u, dt);
      const moved = Math.hypot(u.x - px, u.y - py);
      updateStall(state, u, moved, dt);
      applyWear(state, u, moved, dt);
    }
  }
  applySeparation(state);
  updateStructures(state, dt);
  updateProjectiles(state, dt);
  updateEffects(state, dt);
  updateCapture(state, dt);
  updatePrize(state, dt);
  updatePrizeExtraction(state);
  updateVisibility(state);
  updateHeroes(state);
  cleanup(state);
  updateScore(state);
  checkVictory(state, dt);
  return state;
}

// Economia da partida: cada base avançada operacional gera renda (energia/s) e
// moeda. Destruir bases inimigas corta a renda do adversário — a expansão paga.
function updateEconomy(state: BattleState, dt: number): void {
  // O Sov só volta de TERRITÓRIO: cada ponto conquistado paga um lote a cada 60 s.
  // Não há regeneração passiva nem recompensa por abate — se o recurso acabar e não
  // houver território rendendo, a operação quebra (é o relógio da guerra).
  for (const side of ["blue", "red"] as Side[]) {
    const cfg = side === "blue" ? state.blue : state.red;
    let held = 0;
    for (const t of state.territories) if (t.owner === side) held += 1;
    const perTerritory = SOV_PER_TERRITORY * (1 + cfg.economyBonus);
    cfg.income = (held * perTerritory) / SOV_TERRITORY_INTERVAL; // Sov/s (para o HUD)
    if (held === 0) {
      cfg.incomeTimer = 0;
      continue;
    }
    cfg.incomeTimer += dt;
    while (cfg.incomeTimer >= SOV_TERRITORY_INTERVAL) {
      cfg.incomeTimer -= SOV_TERRITORY_INTERVAL;
      const grant = Math.round(held * perTerritory);
      cfg.command = Math.min(cfg.commandMax, cfg.command + grant);
      cfg.coins += grant;
    }
  }
}

function updateZones(state: BattleState, dt: number): void {
  const expiredBarricades = state.zones.filter(
    (z) => z.kind === "barricada" && z.remaining - dt <= 0,
  );
  // Gás: dano contínuo a qualquer unidade terrestre dentro da nuvem (sem exceção de
  // lado). O dano vem do motor, não da animação — quem cruza a nuvem morre de verdade.
  for (const z of state.zones) {
    if (z.kind !== "gas" || z.remaining <= 0) continue;
    const dps = z.magnitude > 0 ? z.magnitude : 26;
    for (const side of ["blue", "red"] as Side[]) {
      const cfg = side === "blue" ? state.blue : state.red;
      for (const u of cfg.units) {
        if (!u.alive || u.domain === "aereo") continue;
        if (u.smoke > 0) continue; // máscara/proteção ativa
        if (dist(u.x, u.y, z.x, z.y) <= z.radius) {
          damageUnit(state, u, dps * dt, null);
          u.smoke = Math.max(u.smoke, 0.35);
        }
      }
    }
  }
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

// ---------------------------------------------------------------------------
// RENDIÇÃO
// ---------------------------------------------------------------------------
//
// Cercada por força MUITO superior (1 contra 3+), a unidade não fica lutando no vazio:
// o MOTOR decide se ela se rende ou resiste. Tropas de elite e o chanceler RECUSAM a
// rendição — é o que dá emoção: o cerco aperta, mas nem todo mundo se entrega. Quem se
// rende vira prisioneiro (sai de combate) e é capturado por quem o cercou.
const SURRENDER_RATIO = 3; // força inimiga necessária (em peso) para forçar a decisão
const SURRENDER_DELAY = 2.5; // segundos de hesitação antes de decidir
const SURRENDER_RADIUS = 9;

// Peso de combate de uma unidade: quanto "vale" numa disputa de cerco. Blindados e
// artilharia pesam mais que infantaria; apoio/reconhecimento pesam pouco.
function combatWeight(u: BattleUnit): number {
  if (u.hero) return 3;
  switch (u.category) {
    case "blindado":
      return 2.4;
    case "artilharia":
      return 1.6;
    case "infantaria":
      return 1;
    case "defesa":
      return 1.4;
    default:
      return 0.7;
  }
}

// Chance de render-se: alta para tropa comum cercada, nula para herois e baixa para
// veteranos (nível alto). É uma decisão DETERMINÍSTICA por semente + id, para o motor
// ser reproduzível nos testes.
function surrenders(state: BattleState, u: BattleUnit): boolean {
  if (u.hero || u.prizeConvoy) return false;
  // Tropa de elite (nível alto) resiste; recruta cercado se entrega.
  const resist = Math.min(0.75, 0.08 * u.level);
  const roll =
    ((hash32(`${state.config.seed}:${u.id}:${Math.floor(state.t)}`) >>> 0) % 1000) / 1000;
  return roll > resist;
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function updateSurrender(state: BattleState, u: BattleUnit, dt: number): void {
  if (u.surrendered) return;
  const enemy = other(u.side);
  const enemyCfg = enemy === "blue" ? state.blue : state.red;
  let foe = 0;
  let allies = 0;
  for (const e of enemyCfg.units) {
    if (!e.alive || e.surrendered || e.prizeConvoy) continue;
    if (dist(e.x, e.y, u.x, u.y) <= SURRENDER_RADIUS) foe += combatWeight(e);
  }
  const myCfg = u.side === "blue" ? state.blue : state.red;
  for (const a of myCfg.units) {
    if (a === u || !a.alive || a.surrendered) continue;
    if (dist(a.x, a.y, u.x, u.y) <= SURRENDER_RADIUS) allies += combatWeight(a);
  }
  const total = combatWeight(u) + allies;
  // Sem cerco decisivo, a hesitação zera: o soldado volta a lutar normalmente.
  if (foe < total * SURRENDER_RATIO) {
    u.surrenderCheck = 0;
    return;
  }
  u.surrenderCheck = (u.surrenderCheck ?? 0) + dt;
  if (u.surrenderCheck < SURRENDER_DELAY) return;
  if (surrenders(state, u)) {
    u.surrendered = true;
    u.engaged = false;
    delete u.targetId;
    delete u.targetStructureId;
    enemyCfg.prisonersTaken += 1;
    myCfg.prisonersLost += 1;
    addEffect(state, "build", u.x, u.y, u.radius + 2, { side: enemy });
    pushLog(state, enemy, "captura", `${u.name} cercado: rendeu-se e foi feito prisioneiro.`);
  } else {
    // Resistiu: ganha um instante de fúria (recarrega e reage) e não é mais checado por
    // um tempo — o cerco apertou, mas a tropa escolheu lutar.
    u.surrenderCheck = -SURRENDER_DELAY * 4;
    u.readyIn = 0;
    pushLog(state, u.side, "evento", `${u.name} cercado, mas recusou a rendição.`);
  }
}

function updateUnit(state: BattleState, u: BattleUnit, dt: number): void {
  if (u.smoke > 0) u.smoke = Math.max(0, u.smoke - dt);
  if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dt);
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

  // RENDIÇÃO: cercada, a unidade decide entre entregar-se ou resistir. Rendeu-se, para
  // de combater e permanece como prisioneira até ser recolhida.
  updateSurrender(state, u, dt);
  if (u.surrendered) return;

  if (u.builder && updateBuilder(state, u, dt)) return;
  if (u.heal > 0 && updateSupport(state, u, dt)) return;

  const obstacle = obstacleAt(state.config.arena, u.x, u.y);
  const slow = u.domain === "aereo" ? 1 : (obstacle?.slow ?? 1);

  // CONTROLE DIRETO DO CHANCELER: com o vetor de comando ativo, o herói anda na direção
  // pedida (setas/analógico) a cada passo — com o MESMO contorno de obstáculo das outras
  // tropas — e continua atirando para se defender. Enquanto dirige, a IA não o puxa para
  // objetivo nenhum: o jogador tem a mão no volante.
  const driving = (u.driveX ?? 0) !== 0 || (u.driveY ?? 0) !== 0;
  if (driving) applyDrive(state, u, dt, slow);

  // Descarta alvos explícitos que já morreram — a força nunca fica travada
  // perseguindo algo que não existe mais.
  clearDeadOrders(state, u);

  // O ENGENHEIRO não combate: não deve escolher unidade como alvo, senão ele "persegue"
  // um inimigo que não pode atacar e para colado nele (travamento). Ele só repara e
  // constrói — o passo dele é resolvido em updateBuilder.
  const target = u.builder ? null : selectTarget(state, u);
  u.engaged = false;
  if (target && u.jammed <= 0 && canShoot(u)) {
    u.engaged = true;
    turnAim(u, target.x, target.y, dt);
    if (u.readyIn <= 0) {
      fireWeapon(state, u, target);
      u.readyIn = u.cooldown;
    }
    // ZONA DE ALCANCE COM FOLGA: a unidade avança até ficar a ENGAGE_STANDOFF do
    // alcance e PARA ali para atirar — não encosta no alvo. O alcance é medido até a
    // BORDA do alvo (igual a selectTarget); a folga evita o "amontoa e gira".
    const stopDist = (u.range + (target.radius ?? 0)) * ENGAGE_STANDOFF;
    if (!driving && u.range < ENGAGE_RADIUS && dist(u.x, u.y, target.x, target.y) > stopDist) {
      moveToward(state, u, target.x, target.y, dt, slow);
    }
    return;
  }
  delete u.targetId;
  delete u.targetStructureId;

  // Dirigindo, o chanceler NÃO segue objetivo automático: só o que o jogador mandar.
  if (driving) return;

  const goal = objectiveFor(state, u);
  if (goal) {
    u.aim = Math.atan2(goal.y - u.y, goal.x - u.x);
    moveToward(state, u, goal.x, goal.y, dt, slow);
    // Ao chegar no destino da ordem, a força assume posição defensiva no local.
    if (u.goalX !== undefined && dist(u.x, u.y, u.goalX, u.goalY ?? 0) <= GOAL_ARRIVAL) {
      delete u.goalX;
      delete u.goalY;
      if (u.holdAtGoal) u.order = "manter";
    }
  }
}

// ANTI-TRAVAMENTO: observa o deslocamento efetivo de uma unidade em marcha. Se ela
// passa STALL_SECONDS praticamente imóvel (obstáculo, aperto na separação, alvo
// inalcançável), aciona um contorno lateral persistente por STALL_BYPASS_SECONDS e
// memoriza o lado do desvio. Enquanto progride, o contador zera e o desvio é liberado.
function updateStall(state: BattleState, u: BattleUnit, moved: number, dt: number): void {
  void moved;
  if (!u.alive) return;
  if (u.stallBypass !== undefined && u.stallBypass > 0) {
    u.stallBypass = Math.max(0, u.stallBypass - dt);
  }
  // Estados em que ficar parado é CORRETO: segurar posição, engajado atirando, sob
  // interferência, rendido ou TRABALHANDO (engenheiro construindo/reparando). Só a
  // marcha emperrada interessa aqui.
  const working =
    u.builder &&
    (u.buildTerritoryId !== undefined ||
      state.structures.some(
        (st) =>
          st.alive &&
          !st.underConstruction &&
          st.side === u.side &&
          st.hp < st.maxHp &&
          dist(st.x, st.y, u.x, u.y) <= u.range + st.radius,
      ));
  const stationaryOk =
    u.order === "manter" || u.engaged || u.jammed > 0 || u.surrendered || working;
  if (stationaryOk) {
    u.stall = 0;
    delete u.stallAnchorX;
    return;
  }
  // Mede PROGRESSO em relação a uma âncora, não o passo de cada quadro: assim o jitter
  // da separação (que move a unidade alguns centímetros) não reinicia o contador.
  if (u.stallAnchorX === undefined || u.stallAnchorY === undefined) {
    u.stallAnchorX = u.x;
    u.stallAnchorY = u.y;
    u.stall = 0;
    return;
  }
  const progress = Math.hypot(u.x - u.stallAnchorX, u.y - u.stallAnchorY);
  if (progress >= STALL_PROGRESS) {
    u.stallAnchorX = u.x;
    u.stallAnchorY = u.y;
    u.stall = 0;
    if (u.stallBypass === undefined || u.stallBypass <= 0) delete u.stallSign;
    return;
  }
  u.stall = (u.stall ?? 0) + dt;
  if (u.stall >= STALL_SECONDS) {
    u.stall = 0;
    u.stallAnchorX = u.x;
    u.stallAnchorY = u.y;
    u.stallBypass = STALL_BYPASS_SECONDS;
    // Alterna o lado a cada episódio para não repetir o mesmo contorno que já falhou.
    u.stallSign = u.stallSign === undefined ? 1 : -u.stallSign;
  }
}

// ATRITO DE CAMPANHA: aplica o desgaste por tempo de campo e por deslocamento. A
// unidade perde uma fração da vida máxima; a distância até a base aliada mais próxima
// (linha de suprimento) multiplica o atrito. Longe de qualquer base, a coluna definha
// rápido — é isso que dá valor estratégico às bases avançadas.
function applyWear(state: BattleState, u: BattleUnit, moved: number, dt: number): void {
  // A carga da carta-prêmio não sofre atrito: ela é capturada ou entregue, nunca
  // "morre de desgaste" no meio do mapa.
  if (u.prizeConvoy) return;
  const base = nearestFriendlyBase(state, u.side, u.x, u.y);
  const supplyDist = base ? dist(u.x, u.y, base.x, base.y) : WEAR_FIELD * 2;
  if (u.hero) {
    // O CHANCELER sofre o atrito de campanha em marcha, mas REGENERA quando para (e
    // fora de combate) — por isso o desgaste nunca o mata sozinho: ele só cai sob fogo.
    if (moved > 0.02) {
      const sf = 1 + Math.min(2, Math.max(0, supplyDist - SUPPLY_RADIUS) / WEAR_FIELD);
      u.hp = Math.max(1, u.hp - u.maxHp * WEAR_MOVE * sf * dt);
    } else if (!u.engaged && u.hitFlash <= 0) {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * HERO_REGEN * dt);
    }
    u.wear = u.maxHp - u.hp;
    return;
  }
  if (supplyDist <= SUPPLY_RADIUS) {
    // Na zona de suprimento de uma base aliada a tropa se reabastece: sem desgaste.
    u.wear = 0;
    return;
  }
  const supplyFactor = 1 + Math.min(2, (supplyDist - SUPPLY_RADIUS) / WEAR_FIELD);
  const moveFactor = moved > 0.02 ? WEAR_MOVE : WEAR_IDLE;
  const loss = u.maxHp * moveFactor * supplyFactor * dt;
  u.wear += loss;
  if (loss <= 0) return;
  u.hp -= loss;
  if (u.hp <= 0 && u.alive) killByAttrition(state, u);
}

// Base aliada (principal ou avançada operacional) mais próxima — a âncora logística.
function nearestFriendlyBase(
  state: BattleState,
  side: Side,
  x: number,
  y: number,
): Structure | null {
  let best: Structure | null = null;
  let bestD = Infinity;
  for (const s of state.structures) {
    if (!s.alive || s.side !== side) continue;
    if (s.kind !== "base-principal" && (s.kind !== "base-avancada" || s.underConstruction)) {
      continue;
    }
    const d = dist(x, y, s.x, s.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// Baixa por desgaste: não paga recompensa a ninguém (ninguém "matou"), mas conta como
// perda do dono — a unidade que definhou sai de campo como qualquer outra.
function killByAttrition(state: BattleState, u: BattleUnit): void {
  u.alive = false;
  addEffect(state, u.domain === "aereo" ? "explosion" : "impact", u.x, u.y, u.radius * 1.4);
  const cfg = u.side === "blue" ? state.blue : state.red;
  cfg.losses += 1;
  pushLog(state, u.side, "baixa", `${cfg.countryName} perde ${u.name} por desgaste.`);
  if (u.hero) heroDied(state, u);
}

// Remove ordens cujo alvo explícito já foi destruído, para a força voltar ao
// comportamento natural (avançar/defender) em vez de perseguir um alvo morto.
function clearDeadOrders(state: BattleState, u: BattleUnit): void {
  if (u.targetId) {
    const t = findUnit(state, u.targetId);
    if (!t || !t.alive) delete u.targetId;
  }
  if (u.attackStructureId) {
    const s = state.structures.find((x) => x.id === u.attackStructureId);
    if (!s || !s.alive) delete u.attackStructureId;
  }
  if (u.attackTerritoryId) {
    const t = state.territories.find((x) => x.id === u.attackTerritoryId);
    if (!t) delete u.attackTerritoryId;
  }
}

// Ponto para onde a unidade deve marchar quando não há alvo ao alcance:
// estrutura atacada > unidade perseguida > destino clicado > objetivo da ordem.
function objectiveFor(state: BattleState, u: BattleUnit): { x: number; y: number } | null {
  if (u.attackStructureId) {
    const s = state.structures.find((x) => x.id === u.attackStructureId);
    if (s && s.alive) return { x: s.x, y: s.y };
  }
  if (u.attackTerritoryId) {
    const t = state.territories.find((x) => x.id === u.attackTerritoryId);
    if (t) return { x: t.x, y: t.y };
  }
  // O engenheiro não caça unidades (não atira): perseguir um alvo que não pode atacar
  // só o deixava parado em cima dele. Ele ignora alvos-unidade e segue para a obra.
  if (u.targetId && !u.builder) {
    const e = findUnit(state, u.targetId);
    if (e && e.alive) return { x: e.x, y: e.y };
  }
  if (u.goalX !== undefined && u.goalY !== undefined) {
    return { x: u.goalX, y: u.goalY };
  }
  // Escolta: sem destino próprio, a unidade toma posição no cerco em volta do chanceler.
  if (u.escortId) {
    const hero = findUnit(state, u.escortId);
    if (hero && hero.alive) return escortGoal(state, u, hero);
    delete u.escortId; // chanceler caiu: volta ao comportamento normal
  }
  return goalFor(state, u);
}

// Engenheiro: repara estruturas aliadas danificadas e, quando não há reparo a
// fazer, procura um território conquistado sem base e ergue a instalação. Nunca
// fica parado: construir → reparar → expandir → repetir enquanto estiver vivo.
// Retorna true quando consumiu o passo da unidade (trabalho ou deslocamento).
function updateBuilder(state: BattleState, u: BattleUnit, dt: number): boolean {
  // 0. Ordem explícita de reparo: o jogador clicou numa estrutura aliada danificada.
  if (u.attackStructureId) {
    const ordered = state.structures.find((x) => x.id === u.attackStructureId);
    if (ordered && ordered.alive && ordered.side === u.side) {
      if (dist(u.x, u.y, ordered.x, ordered.y) > u.range + ordered.radius) {
        u.aim = Math.atan2(ordered.y - u.y, ordered.x - u.x);
        moveToward(state, u, ordered.x, ordered.y, dt, 1);
        return true;
      }
      if (ordered.hp < ordered.maxHp) {
        ordered.hp = Math.min(ordered.maxHp, ordered.hp + 26 * dt);
        addEffect(state, "build", ordered.x, ordered.y, ordered.radius * 0.8, { side: u.side });
        return true;
      }
      delete u.attackStructureId;
    }
  }

  // 1. Reparo imediato quando há estrutura aliada danificada ao alcance.
  const adjacent = state.structures.find(
    (s) =>
      s.alive &&
      !s.underConstruction &&
      s.side === u.side &&
      s.hp < s.maxHp &&
      dist(s.x, s.y, u.x, u.y) <= u.range + s.radius,
  );
  if (adjacent) {
    adjacent.hp = Math.min(adjacent.maxHp, adjacent.hp + 18 * dt);
    addEffect(state, "build", adjacent.x, adjacent.y, adjacent.radius * 0.8, { side: u.side });
    return true;
  }

  // 2. Ocioso: caminha até uma base aliada danificada próxima para repará-la.
  if (!u.buildTerritoryId) {
    const hurt = nearestDamagedAlly(state, u, 34);
    if (hurt && dist(u.x, u.y, hurt.x, hurt.y) > u.range + hurt.radius) {
      u.aim = Math.atan2(hurt.y - u.y, hurt.x - u.x);
      moveToward(state, u, hurt.x, hurt.y, dt, 1);
      return true;
    }
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

function nearestDamagedAlly(state: BattleState, u: BattleUnit, search: number): Structure | null {
  let best: { s: Structure; d: number } | null = null;
  for (const s of state.structures) {
    if (!s.alive || s.underConstruction || s.side !== u.side || s.hp >= s.maxHp) continue;
    const d = dist(u.x, u.y, s.x, s.y);
    if (d > search) continue;
    if (!best || d < best.d) best = { s, d };
  }
  return best?.s ?? null;
}

function buildSite(state: BattleState, u: BattleUnit): Territory | null {
  // Ordem explícita do jogador tem prioridade: construir/segurar aquele território.
  if (u.attackTerritoryId) {
    const forced = state.territories.find((t) => t.id === u.attackTerritoryId);
    if (forced && forced.owner === u.side && canBuildAt(state, u.side, forced)) return forced;
  }
  const candidates = state.territories.filter(
    (t) => t.owner === u.side && canBuildAt(state, u.side, t),
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => dist(u.x, u.y, a.x, a.y) - dist(u.x, u.y, b.x, b.y))[0]!;
}

// Um território aceita obra se ainda não tem base concluída nem outra base aliada
// operacional por perto (distância mínima entre bases). Uma base ainda EM OBRA no
// próprio território libera o engenheiro para continuar a construção.
function canBuildAt(state: BattleState, side: Side, t: Territory): boolean {
  for (const s of state.structures) {
    if (!s.alive || s.side !== side) continue;
    if (s.territoryId === t.id) return s.underConstruction;
    if (s.kind === "base-avancada" && dist(s.x, s.y, t.x, t.y) < MIN_TERRITORY_GAP) return false;
  }
  return true;
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
  // A unidade porta uma carta ausente do nosso arsenal: alvo de CAPTURA prioritário.
  bounty?: boolean;
}

function selectTarget(state: BattleState, u: BattleUnit): TargetRef | null {
  const enemy = other(u.side);
  const enemyCfg = enemy === "blue" ? state.blue : state.red;
  const priority = priorityFor(u);

  const units: TargetRef[] = [];
  for (const e of enemyCfg.units) {
    if (!e.alive) continue;
    // A carga da carta-prêmio não é alvo de fogo: antes de capturada é imune, e depois
    // é o próprio objetivo a escoltar — atirar nela só desviaria a tropa do combate.
    if (e.prizeConvoy) continue;
    // Prisioneiro rendido já saiu do combate: não se atira em quem se rendeu.
    if (e.surrendered) continue;
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
      ...(e.bounty ? { bounty: true } : {}),
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
    // Alvo ordenado pelo jogador tem prioridade absoluta sobre a escolha automática.
    if (t.id === u.attackStructureId || t.id === u.attackTerritoryId || t.id === u.targetId)
      s += 1000;
    if (t.kind === "unit" && t.category && priority.includes(t.category)) s += 40;
    if (t.kind === "structure") s += 6;
    // ESPÓLIO: a tropa reconhece a unidade que porta uma carta que ainda não temos e a
    // caça com afinco — capturar a carta vale mais que a baixa em si.
    if (t.bounty) s += 120;
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
    applyHit(state, u, target, dmg, target.x, target.y, u.dmgVs);
    return;
  }

  const kind: Projectile["kind"] =
    w.kind === "missil" ? "missile" : w.kind === "atgm" || w.kind === "lmf" ? "rocket" : "shell";

  const create = (tx: number, ty: number, shotDmg: number): void => {
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
      dmg: shotDmg,
      splash: w.splash,
      arc: w.arc,
      homing: w.homing,
      ...(u.dmgVs ? { dmgVs: u.dmgVs } : {}),
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
    // Salva de foguetes: o dano é DIVIDIDO entre os foguetes. Sem isso, cada foguete
    // aplicava o dano cheio e a salva multiplicava o poder por 5 (dizimava infantaria).
    const rockets = 5;
    const shotDmg = dmg / rockets;
    for (let i = 0; i < rockets; i++) {
      const spread = (i - 2) * 2.2;
      const jitter = (nextRng(state) - 0.5) * 2;
      create(target.x + spread + jitter, target.y + jitter, shotDmg);
    }
  } else {
    create(target.x, target.y, dmg);
  }
}

function applyHit(
  state: BattleState,
  source: BattleUnit,
  target: TargetRef,
  dmg: number,
  hx: number,
  hy: number,
  dmgVs?: Partial<Record<UnitCategory, number>>,
): void {
  if (target.kind === "unit") {
    const e = findUnit(state, target.id);
    if (e && e.alive) {
      damageUnit(state, e, dmg, source, dmgVs);
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
      damageUnit(state, u, p.dmg * falloff, null, p.dmgVs);
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
// Separação entre unidades — sem empilhamento
// ---------------------------------------------------------------------------
//
// Sem isto as tropas convergem para o mesmo ponto e atravessam umas às outras,
// parecendo um único pixel se movendo. A separação empurra suavemente cada par de
// unidades próximas para lados opostos, preservando a formação como um grupo em
// marcha. Quem recebeu ordem de MANTER posição é imóvel: só a unidade em movimento é
// desviada, então a tropa "segurando o terreno" não é arrastada. Unidades aéreas não
// colidem com terrestres (voam por cima).
function applySeparation(state: BattleState): void {
  const list: BattleUnit[] = [];
  for (const side of ["blue", "red"] as Side[]) {
    const cfg = side === "blue" ? state.blue : state.red;
    for (const u of cfg.units) if (u.alive) list.push(u);
  }
  if (list.length < 2) return;
  // Quem está PARADO e atirando (engajado) ou segurando posição cede menos no empurrão:
  // ele já está na posição de tiro e não deve ser arrastado para fora do alcance. Quem
  // marcha cede mais e contorna. Sem isto, duas tropas em fogo trocavam empurrões e
  // ficavam "girando coladas".
  const immovable = (u: BattleUnit) => (u.order === "manter" || u.engaged) && !u.hero;
  // Passadas de relaxamento: uma única correção deixa pares muito sobrepostos ainda
  // colados por vários quadros. A grade espacial abaixo mantém cada passada quase
  // linear, então iterar é barato mesmo com o exército cheio.
  const passes = 8;
  const cell = SEPARATION_CELL;
  for (let pass = 0; pass < passes; pass++) {
    // Grade espacial: só pares na mesma célula (ou vizinhas) podem estar perto o
    // bastante para colidir. Sem isso, a separação é O(n²) e trava a simulação.
    const grid = new Map<number, BattleUnit[]>();
    for (const u of list) {
      const key = gridKey(Math.floor(u.x / cell), Math.floor(u.y / cell));
      const bucket = grid.get(key);
      if (bucket) bucket.push(u);
      else grid.set(key, [u]);
    }
    for (const [key, bucket] of grid) {
      const gx = (key >> 16) - GRID_OFFSET;
      const gy = (key & 0xffff) - GRID_OFFSET;
      // Mesma célula + metade das vizinhas: cada par é processado exatamente uma vez.
      const neighbors: Array<[number, number]> = [
        [0, 0],
        [1, 0],
        [1, 1],
        [1, -1],
        [0, 1],
      ];
      for (const [ox, oy] of neighbors) {
        const otherBucket = grid.get(gridKey(gx + ox, gy + oy));
        if (!otherBucket) continue;
        const same = ox === 0 && oy === 0;
        for (let i = 0; i < bucket.length; i++) {
          const a = bucket[i]!;
          for (let j = same ? i + 1 : 0; j < otherBucket.length; j++) {
            separatePair(a, otherBucket[j]!, immovable);
          }
        }
      }
    }
  }
}

// Chave da grade espacial. As coordenadas do mundo são pequenas e positivas, então
// deslocar por um offset fixo evita chaves negativas.
const GRID_OFFSET = 4096;
function gridKey(cx: number, cy: number): number {
  return ((cx + GRID_OFFSET) << 16) | ((cy + GRID_OFFSET) & 0xffff);
}

// Empurra um par de unidades sobrepostas para lados opostos.
function separatePair(a: BattleUnit, b: BattleUnit, immovable: (u: BattleUnit) => boolean): void {
  if (a.domain !== b.domain) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minDist = (a.radius + b.radius) * SEPARATION_FACTOR;
  if (d >= minDist) return;
  // Direção de empurrão: quando as duas estão no MESMO ponto (d≈0), usa um ângulo
  // determinístico derivado das posições para elas se abrirem em vez de ficar coladas.
  let ux: number;
  let uy: number;
  if (d < 1e-4) {
    const ang = (Math.abs(Math.floor(a.x * 7 + a.y * 13)) % 360) * (Math.PI / 180);
    ux = Math.cos(ang);
    uy = Math.sin(ang);
  } else {
    ux = dx / d;
    uy = dy / d;
  }
  const overlap = (minDist - d) * SEPARATION_PUSH;
  const aPinned = immovable(a);
  const bPinned = immovable(b);
  // Quem SEGURA posição cede menos, mas NÃO é parede: com cessão zero, um punhado de
  // aliados em "manter" formava um muro impenetrável e quem marchava atrás congelava.
  const PIN_YIELD = 0.35;
  const aShare =
    aPinned && !bPinned
      ? overlap * PIN_YIELD
      : bPinned && !aPinned
        ? overlap * (1 - PIN_YIELD)
        : overlap / 2;
  const bShare =
    bPinned && !aPinned
      ? overlap * PIN_YIELD
      : aPinned && !bPinned
        ? overlap * (1 - PIN_YIELD)
        : overlap / 2;
  pushRespectingAim(a, -ux * aShare, -uy * aShare, aPinned);
  pushRespectingAim(b, ux * bShare, uy * bShare, bPinned);
}

// Aplica o empurrão da separação a uma unidade. Para quem está EM MARCHA, a componente
// que a empurraria PARA TRÁS (contra a direção da mira) é removida: sem isto a tropa
// ficava congelada em equilíbrio — o passo do movimento e o empurrão da multidão se
// anulavam e a unidade repetia a mesma coordenada quadro após quadro. Removendo só a
// componente traseira, ela desliza de lado e contorna o engarrafamento. Quem segura
// posição (pinned) recebe o empurrão inteiro.
function pushRespectingAim(u: BattleUnit, px: number, py: number, pinned: boolean): void {
  let dx = px;
  let dy = py;
  if (!pinned) {
    const ax = Math.cos(u.aim);
    const ay = Math.sin(u.aim);
    const along = dx * ax + dy * ay;
    if (along < 0) {
      // Remove a parcela contrária à direção de marcha (mantém a lateral).
      dx -= along * ax;
      dy -= along * ay;
    }
  }
  u.x = clamp(u.x + dx, WORLD_X_MIN, WORLD_X_MAX);
  u.y = clamp(u.y + dy, WORLD_Y_MIN, WORLD_Y_MAX);
}

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
  dmgVs?: Partial<Record<UnitCategory, number>>,
): void {
  // Comboio ainda NÃO capturado é invulnerável: não se toma a carta destruindo-a.
  // Depois de capturado, ele pode ser abatido no trajeto — aí a carga se perde.
  if (target.prizeConvoy && !state.prize?.capturedBy) return;
  const ob = obstacleAt(state.config.arena, target.x, target.y);
  const fort = coverBonusAt(state, target);
  const cover = target.domain === "aereo" ? 0 : Math.min(0.6, (ob?.cover ?? 0) + fort);
  // Resistência de veterano: a unidade de nível alto ignora parte do dano. Combinada
  // com a cobertura, o dano final nunca fica negativo.
  let final = dmg * (1 - cover) * (1 - Math.min(0.6, target.armor));
  // Contrapesos: multiplicador do atirador contra a CATEGORIA do alvo. Vale para armas
  // de projétil (canhão, míssil, foguete) e para o fuzil, além da regra de ouro do
  // antitanque contra blindado.
  const vs = dmgVs?.[target.category];
  if (vs) final *= vs;
  if (
    from &&
    from.category === "infantaria" &&
    from.cardId === "inf-antitanque" &&
    target.category === "blindado"
  )
    final *= 1.6;
  target.hp -= final;
  if (final > 0) target.hitFlash = 2.5;
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
    // Sem recompensa por abate: o Sov é FINITO e só volta de território conquistado.
    pushLog(state, killerSide, "baixa", `${victimCfg.countryName} perde ${target.name}.`);
    // ESPÓLIO: a unidade portava uma carta que o nosso lado não tinha. Abatê-la rende a
    // carta ao vencedor (uma vez por operação), desde que o alvo não tenha se rendido —
    // prisioneiro vivo já é recompensa suficiente e a carta sai do espólio.
    if (target.bounty && !target.surrendered && killerSide === "blue") {
      const already = state.blue.capturedCards.includes(target.cardId);
      if (!already) {
        state.blue.capturedCards.push(target.cardId);
        pushLog(
          state,
          "blue",
          "captura",
          `Espólio de guerra: ${cardById(target.cardId).name} capturada em campo.`,
        );
      }
    }
    // O chanceler é a peça que decide a guerra: perder o seu ou eliminar o outro encerra.
    if (target.hero) heroDied(state, target);
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
    // Sem pagamento em Sov por estrutura: conquistar TERRITÓRIO é a única fonte de renda.
    pushLog(state, killerSide, "destruicao", `${victimCfg.countryName} perde ${target.name}.`);
    // Derrubar uma PRISÃO liberta o chanceler cativo (o resgate é o objetivo da campanha).
    if (target.kind === "prisao") liberatePrison(state, target, from);
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
  // Base NEUTRA tomada: vira uma base avançada OPERACIONAL de verdade (estrutura com
  // vida, alcance e defesa) — não é só uma troca de cor no marcador.
  if (t.base && !state.structures.some((s) => s.alive && s.territoryId === t.id)) {
    const spec: StructureSpec = {
      id: `nbase-${state.nextId++}`,
      kind: "base-avancada",
      side,
      name: t.name,
      x: t.x,
      y: t.y,
      radius: 6,
      hp: 2000,
      dmg: 70,
      range: 17,
      cooldown: 1.0,
      targets: "ambos",
    };
    const s = makeStructure(spec);
    s.territoryId = t.id;
    state.structures.push(s);
    pushLog(
      state,
      side,
      "construcao",
      `${cfg.countryName} assume ${t.name} como base operacional.`,
    );
  }
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
    // A CARGA não defende: ela é o prêmio, não um soldado. Não conta força de captura.
    if (u.prizeConvoy) continue;
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

// Ponto da base principal inimiga (objetivo final de um avanço ofensivo).
function enemyBasePoint(state: BattleState, side: Side): { x: number; y: number } | null {
  const b = state.structures.find((s) => s.alive && s.side !== side && s.kind === "base-principal");
  return b ? { x: b.x, y: b.y } : null;
}

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
      const base = enemyBasePoint(state, u.side) ?? center;
      return base;
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

// Comando em tempo real do chanceler: converte o vetor (driveX, driveY) em deslocamento
// do passo. Reaproveita `moveToward`, então o herói contorna obstáculo e nunca sai do
// mundo. Um pequeno "ponto à frente" dá a direção; a velocidade é a da própria unidade.
function applyDrive(state: BattleState, u: BattleUnit, dt: number, slow: number): void {
  const dx = u.driveX ?? 0;
  const dy = u.driveY ?? 0;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  moveToward(state, u, u.x + (dx / len) * 12, u.y + (dy / len) * 12, dt, slow);
}

// Vira a mira em direção a (tx, ty) a uma taxa LIMITADA. Evita o "giro no lugar":
// quando dois corpos estão quase sobrepostos, o ângulo desejado oscila a cada quadro;
// rodando devagar até o alvo, a unidade gira de forma suave e estável.
function turnAim(u: BattleUnit, tx: number, ty: number, dt: number): void {
  const desired = Math.atan2(ty - u.y, tx - u.x);
  let diff = desired - u.aim;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const max = AIM_TURN_RATE * dt;
  u.aim += Math.max(-max, Math.min(max, diff));
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
  // CONTORNO DE EMERGÊNCIA: quando o detector marca a unidade como travada, ela anda
  // em diagonal lateral por alguns instantes em vez de insistir na parede. É o que tira
  // a tropa do "canto" (obstáculo + separação + curva do rio) que a prendia.
  if (u.stallBypass !== undefined && u.stallBypass > 0 && u.domain === "terra") {
    const perp = { x: -dy / d, y: dx / d };
    const s = u.stallSign ?? 1;
    const nx = (dx / d) * 0.35 + perp.x * s;
    const ny = (dy / d) * 0.35 + perp.y * s;
    const nl = Math.hypot(nx, ny) || 1;
    const step = u.speed * slow * dt;
    u.x = clamp(u.x + (nx / nl) * step, WORLD_X_MIN, WORLD_X_MAX);
    u.y = clamp(u.y + (ny / nl) * step, WORLD_Y_MIN, WORLD_Y_MAX);
    return;
  }
  if (u.domain === "terra") {
    const blocked = state.config.arena.obstacles.find(
      (o) =>
        o.blocksGround && dist(u.x + (dx / d) * 3, u.y + (dy / d) * 3, o.x, o.y) <= o.radius * 0.8,
    );
    if (blocked) {
      const perp = { x: -dy / d, y: dx / d };
      // Sinal PERSISTENTE: sem memorizar o lado, o desvio trocava de sentido a cada
      // quadro perto da borda do obstáculo e a unidade oscilava no mesmo lugar.
      const s =
        u.stallSign ?? (Math.sign(perp.x * (blocked.x - u.x) + perp.y * (blocked.y - u.y)) || 1);
      u.stallSign = s;
      u.x = clamp(u.x + perp.x * u.speed * slow * dt * s, WORLD_X_MIN, WORLD_X_MAX);
      u.y = clamp(u.y + perp.y * u.speed * slow * dt * s, WORLD_Y_MIN, WORLD_Y_MAX);
      return;
    }
  }
  const step = u.speed * slow * dt;
  u.x = clamp(u.x + (dx / d) * step, WORLD_X_MIN, WORLD_X_MAX);
  u.y = clamp(u.y + (dy / d) * step, WORLD_Y_MIN, WORLD_Y_MAX);
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

  // Regra padrão: a partida SÓ termina quando a Base Principal adversária é destruída
  // (tratado em damageStructure). Objetivos alternativos só valem quando a MISSÃO os
  // define explicitamente — nunca por controle parcial, primeiro ponto ou metade do campo.

  // CENÁRIO DE CHANCELER: a guerra gira em torno dos chefes de Estado. O relógio NÃO
  // decide por vida de base aqui — quem perde o chanceler perde a guerra (tratado em
  // heroDied). Só restam o colapso de recursos e a destruição da base principal.
  if (state.config.heroSetup && state.config.heroSetup.length > 0) {
    const blueStuck = sideIsBankrupt(state, "blue");
    const redStuck = sideIsBankrupt(state, "red");
    if (blueStuck && !redStuck)
      return finish(state, "derrota", "Recursos esgotados: sem Sov nem tropas, a operação parou.");
    if (redStuck && !blueStuck)
      return finish(state, "vitoria", "Recursos esgotados: o adversário ficou sem como reagir.");
    if (blueStuck && redStuck)
      return finish(state, "empate", "Recursos esgotados nos dois lados: a guerra travou.");
    // Janela da operação encerrada sem eliminação: decide quem está mais perto de
    // vencer a guerra de chanceleres — quem tem o seu em campo e mais saudável.
    if (state.t >= duration) {
      const blue = heroHealthFraction(state, "blue");
      const red = heroHealthFraction(state, "red");
      if (red < blue - 0.02)
        return finish(
          state,
          "vitoria",
          "Janela encerrada: o chanceler adversário está mais exposto.",
        );
      if (blue < red - 0.02)
        return finish(state, "derrota", "Janela encerrada: seu chanceler ficou mais exposto.");
      return finish(state, "empate", "Janela encerrada: os dois chanceleres seguem em campo.");
    }
    return;
  }

  // Objetivo "militar": neutralizar a capacidade de combate do adversário. Exige
  // EVIDÊNCIA de colapso real, não uma razão de baixas acumuladas — perder 70% de
  // tudo que já entrou em campo é o custo normal de uma ofensiva e não pode encerrar
  // a partida em 40 s. Vence quem tiver destruído a maior parte do exército adversário
  // E mantiver a própria força em campo, com o outro lado sem base de renda ativa.
  const th = militaryThreshold ?? 0;
  if (th > 0) {
    const blueInitial = initialCount(state, "blue");
    const redInitial = initialCount(state, "red");
    const blueAlive = aliveUnits(state, "blue");
    const redAlive = aliveUnits(state, "red");
    const redIncome = hasActiveBase(state, "red");
    const blueIncome = hasActiveBase(state, "blue");
    const redNeutralized =
      redInitial > 0 &&
      state.red.losses / redInitial >= th &&
      redAlive === 0 &&
      !redIncome &&
      sideIsBankrupt(state, "red");
    const blueNeutralized =
      blueInitial > 0 &&
      state.blue.losses / blueInitial >= th &&
      blueAlive === 0 &&
      !blueIncome &&
      sideIsBankrupt(state, "blue");
    if (redNeutralized && !blueNeutralized)
      return finish(
        state,
        "vitoria",
        "Superioridade militar: o dispositivo adversário foi neutralizado.",
      );
    if (blueNeutralized && !redNeutralized)
      return finish(state, "derrota", "Superioridade militar: seu dispositivo foi neutralizado.");
  }

  // Exaustão de recursos: com Sov FINITO, quem gasta tudo e não conquista nada fica
  // sem como agir. Um lado é declarado falido quando NÃO consegue mais jogar: sem Sov
  // para nenhuma carta da mão, sem tropas vivas em campo e sem base avançada pagando
  // renda. Se um lado faliu e o outro não, o que ainda joga vence a guerra de atrito.
  const blueStuck = sideIsBankrupt(state, "blue");
  const redStuck = sideIsBankrupt(state, "red");
  if (blueStuck && !redStuck)
    return finish(state, "derrota", "Recursos esgotados: sem Sov nem tropas, a operação parou.");
  if (redStuck && !blueStuck)
    return finish(state, "vitoria", "Recursos esgotados: o adversário ficou sem como reagir.");
  if (blueStuck && redStuck)
    return finish(state, "empate", "Recursos esgotados nos dois lados: a guerra travou.");

  const op = state.config.operationalTarget;
  if (op) {
    const p = allPoints.find((x) => x.id === op.controlPointId);
    if (p) {
      // "Manter" só conta com posse REAL e sem contestação: enquanto houver força
      // adversária dentro do raio, o ponto está em disputa e o relógio do objetivo
      // para. Sem isso, o dono do ponto acumulava o objetivo mesmo sob ataque (a
      // missão virava um botão de vitória). O contador não zera por tempo: só
      // reinicia quando a posse é de fato perdida.
      const bluePower = capturePower(state, "blue", p.x, p.y, p.radius);
      const redPower = capturePower(state, "red", p.x, p.y, p.radius);
      const contested = bluePower > 0 && redPower > 0;
      const blueHeld =
        p.owner === "blue"
          ? hold(state, "blue-op", !contested, dt)
          : hold(state, "blue-op", false, dt);
      const redHeld =
        p.owner === "red"
          ? hold(state, "red-op", !contested, dt)
          : hold(state, "red-op", false, dt);
      if (blueHeld >= op.seconds)
        return finish(state, "vitoria", `Objetivo operacional cumprido: ${p.name} mantido.`);
      if (redHeld >= op.seconds)
        return finish(state, "derrota", `Objetivo operacional perdido: ${p.name} tomado.`);
    }
  }

  if (state.t >= duration) {
    // Fim da janela da operação sem destruição de base: decide quem está mais perto
    // do objetivo real — a vida restante da Base Principal.
    const blueBase = baseHpFraction(state, "blue");
    const redBase = baseHpFraction(state, "red");
    if (redBase < blueBase - 0.02)
      return finish(state, "vitoria", "Janela encerrada: a base adversária está mais castigada.");
    if (blueBase < redBase - 0.02)
      return finish(state, "derrota", "Janela encerrada: sua base ficou mais exposta.");
    if (objectiveKind === "territorial") {
      const blueHeld = allPoints.filter((p) => p.owner === "blue").reduce((a, p) => a + p.value, 0);
      const redHeld = allPoints.filter((p) => p.owner === "red").reduce((a, p) => a + p.value, 0);
      if (blueHeld > redHeld)
        return finish(state, "vitoria", "Janela encerrada: superioridade territorial.");
      if (redHeld > blueHeld)
        return finish(state, "derrota", "Janela encerrada: inferioridade territorial.");
    }
    return finish(state, "empate", "Janela encerrada: nenhuma base foi tomada.");
  }
}

// Um lado tem base de renda ativa quando possui ao menos uma base avançada operacional
// (não em construção) paga em Sov ao longo do tempo — sinal de que ainda pode reagir.
function hasActiveBase(state: BattleState, side: Side): boolean {
  return state.structures.some(
    (s) => s.alive && s.side === side && s.kind === "base-avancada" && !s.underConstruction,
  );
}

// Um lado está "falido" quando não tem Sov para NENHUMA carta da mão, não tem tropa
// viva em campo e não tem base avançada operacional gerando renda. Nesse estado ele não
// pode mais influenciar a partida — é a derrota por exaustão de recursos.
function sideIsBankrupt(state: BattleState, side: Side): boolean {
  const cfg = side === "blue" ? state.blue : state.red;
  const cheapest = cfg.deck.hand.reduce(
    (min, h) => Math.min(min, effectiveCost(cardById(h.cardId), cfg.doctrine)),
    Infinity,
  );
  if (cfg.command >= cheapest) return false;
  if (cfg.units.some((u) => u.alive)) return false;
  // Com o Sov finito, a ÚNICA renda é territorial: um território sob controle devolve
  // recurso a cada minuto, então o lado ainda tem como reagir.
  const hasIncome = state.territories.some((t) => t.owner === side);
  if (hasIncome) return false;
  return true;
}

// "Saúde" do chanceler de um lado para o desempate por tempo: 0 quando morto, 1 quando
// vivo em campo com vida cheia, e 0.5 quando preso (ainda recuperável, mas sob risco).
function heroHealthFraction(state: BattleState, side: Side): number {
  const h = state.heroes[side];
  if (h.state === "morto") return 0;
  if (h.state === "preso") return 0.5;
  const unit = (side === "blue" ? state.blue : state.red).units.find(
    (u) => u.id === h.unitId && u.alive,
  );
  return unit ? Math.max(0, unit.hp / unit.maxHp) : 0.5;
}

// Fração de vida restante da Base Principal de um lado (1 = intacta).
function baseHpFraction(state: BattleState, side: Side): number {
  const base = state.structures.find((s) => s.side === side && s.kind === "base-principal");
  if (!base) return 0;
  return base.alive ? Math.max(0, base.hp / base.maxHp) : 0;
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
    const order: DeployOrder = { x: action.x, y: action.y };
    if (action.type === "deploy") {
      if (action.targetUnitId) order.targetUnitId = action.targetUnitId;
      if (action.targetStructureId) order.targetStructureId = action.targetStructureId;
      if (action.targetTerritoryId) order.targetTerritoryId = action.targetTerritoryId;
    }
    const ok = deploy(state, action.side, action.cardId, action.x, action.y, order);
    return ok ? { ok: true } : { ok: false, error: "Energia insuficiente." };
  }
  if (action.type === "reposicionar") {
    const order: DeployOrder = { x: action.x, y: action.y };
    if (action.targetUnitId) order.targetUnitId = action.targetUnitId;
    if (action.targetStructureId) order.targetStructureId = action.targetStructureId;
    if (action.targetTerritoryId) order.targetTerritoryId = action.targetTerritoryId;
    const sel: { groupId?: string; unitId?: string } = {};
    if (action.groupId) sel.groupId = action.groupId;
    if (action.unitId) sel.unitId = action.unitId;
    const opts: { holdAtArrival?: boolean } = {};
    if (action.holdAtArrival !== undefined) opts.holdAtArrival = action.holdAtArrival;
    const ok = reposition(state, action.side, sel, order, opts);
    return ok ? { ok: true } : { ok: false, error: "Nenhuma força selecionada." };
  }
  if (action.type === "separar") {
    const n = separate(state, action.side, action.groupId);
    return n > 0 ? { ok: true } : { ok: false, error: "Nenhuma tropa para separar." };
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
    coins: { blue: state.blue.coins, red: state.red.coins },
    income: { blue: state.blue.income, red: state.red.income },
    pointsHeld: points,
    prizeCardWon: state.prize?.extracted ? state.prize.cardId : null,
    prisoners: { blue: state.blue.prisonersTaken, red: state.red.prisonersTaken },
    capturedCards: [...state.blue.capturedCards],
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
