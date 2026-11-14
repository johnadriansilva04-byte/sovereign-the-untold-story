// HARNESS DE GUERRA (temporário, de diagnóstico). Roda duelos espelhados por carta e
import { writeFileSync } from "node:fs";
// mede: uso do teto de exército (33), baixas, resultado e se a IA joga com inteligência.
// NÃO é um teste de regressão: imprime relatório. Rodar com:
//   SIM=1 npx vitest run src/test/war-sim.test.ts
import { describe, it } from "vitest";

import { aiTickSide, configureAi, trainedAiWeights } from "@/game/battle/ai";
import { militaryCards, commanders } from "@/game/battle/catalog";
import {
  aliveUnits,
  computeResult,
  createBattle,
  deploy,
  MAX_UNITS_PER_SIDE,
  stepBattle,
} from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import type { BattleConfig, BattleState, Side } from "@/game/battle/types";

const STEP = 0.25;
const RUN = Boolean(process.env["SIM"]);

const CARDS = militaryCards.map((c) => c.id).filter((id) => !id.startsWith("hero"));

interface SimResult {
  cardId: string;
  outcome: string;
  duration: number;
  blueMax: number;
  redMax: number;
  bluePeakAlive: number;
  redPeakAlive: number;
  blueDeployed: number;
  redDeployed: number;
  blueLosses: number;
  redLosses: number;
  blueKills: number;
  redKills: number;
  blueBaseHp: number;
  redBaseHp: number;
  territories: { blue: number; red: number };
}

function cfgFor(blueDeck: string[], redDeck: string[], seed: number, duration = 300): BattleConfig {
  const commander = commanders[0]!;
  const base = buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-standard"),
    deck: blueDeck,
    commander,
    doctrine: commander.doctrine,
    seed,
  });
  return {
    ...base,
    // Espelha TAMBÉM a economia (no jogo o azul é o jogador e ganha mais Sov). Sem isso o
    // duelo "espelhado" na verdade favorece o azul — assimetria de teste, não de motor.
    red: {
      ...base.red,
      deck: redDeck.slice(0, 8),
      commander,
      doctrine: commander.doctrine,
      economyBonus: base.blue.economyBonus,
      regen: base.blue.regen,
      commandMax: base.blue.commandMax,
    },
    duration,
  };
}

function sim(
  cardId: string,
  blueDeck: string[],
  redDeck: string[],
  opts: { infinite: boolean; seed: number },
): SimResult {
  const cfg = cfgFor(blueDeck, redDeck, opts.seed);
  const st: BattleState = createBattle(cfg);
  configureAi(st, "blue", trainedAiWeights);
  configureAi(st, "red", trainedAiWeights);
  if (opts.infinite) {
    st.blue.command = 1e9;
    st.blue.commandMax = 1e9;
    st.red.command = 1e9;
    st.red.commandMax = 1e9;
  }
  let bluePeakAlive = 0;
  let redPeakAlive = 0;
  const steps = Math.ceil((cfg.duration + 30) / STEP);
  for (let i = 0; i < steps && st.running; i++) {
    if (opts.infinite) {
      st.blue.command = 1e9;
      st.red.command = 1e9;
    }
    aiTickSide(st, "blue", STEP);
    aiTickSide(st, "red", STEP);
    stepBattle(st, STEP);
    bluePeakAlive = Math.max(bluePeakAlive, aliveUnits(st, "blue"));
    redPeakAlive = Math.max(redPeakAlive, aliveUnits(st, "red"));
  }
  const r = computeResult(st);
  const baseHp = (side: Side) => {
    const b = st.structures.find((s) => s.side === side && s.kind === "base-principal");
    return b ? Math.round((b.alive ? b.hp / b.maxHp : 0) * 100) : 0;
  };
  return {
    cardId,
    outcome: r.outcome,
    duration: Math.round(r.duration),
    blueMax: st.blue.deployed,
    redMax: st.red.deployed,
    bluePeakAlive,
    redPeakAlive,
    blueDeployed: st.blue.deployed,
    redDeployed: st.red.deployed,
    blueLosses: st.blue.losses,
    redLosses: st.red.losses,
    blueKills: st.blue.kills,
    redKills: st.red.kills,
    blueBaseHp: baseHp("blue"),
    redBaseHp: baseHp("red"),
    territories: r.territories,
  };
}

function line(r: SimResult): string {
  return [
    r.cardId.padEnd(20),
    `res=${r.outcome.padEnd(7)}`,
    `t=${String(r.duration).padStart(3)}s`,
    `picoAz=${String(r.bluePeakAlive).padStart(2)}/${MAX_UNITS_PER_SIDE}`,
    `picoVm=${String(r.redPeakAlive).padStart(2)}/${MAX_UNITS_PER_SIDE}`,
    `lançAz=${String(r.blueDeployed).padStart(3)}`,
    `lançVm=${String(r.redDeployed).padStart(3)}`,
    `bxaAz=${String(r.blueLosses).padStart(3)}`,
    `bxaVm=${String(r.redLosses).padStart(3)}`,
    `baseAz=${String(r.blueBaseHp).padStart(3)}%`,
    `baseVm=${String(r.redBaseHp).padStart(3)}%`,
    `terr=${r.territories.blue}-${r.territories.red}`,
  ].join(" ");
}

// Semeia um lado com o TETO de exército (33) usando UMA carta, posicionada na sua zona
// de desdobramento. O `deploy` já respeita o teto, então paramos ao encher. Assim medimos
// o duelo carta×carta com os dois lados CHEIOS, como o usuário pediu.
function fillSide(state: BattleState, side: Side, cardId: string): number {
  const zone = state.config.arena.deployZone[side];
  let n = 0;
  for (let guard = 0; guard < MAX_UNITS_PER_SIDE * 4; guard++) {
    if (aliveUnits(state, side) >= MAX_UNITS_PER_SIDE) break;
    const x = zone.x + (zone.w * ((n % 5) + 0.5)) / 5;
    const y = zone.y + (zone.h * ((Math.floor(n / 5) % 5) + 0.5)) / 5;
    const before = aliveUnits(state, side);
    if (!deploy(state, side, cardId, x, y, { x, y, skipRecharge: true })) break;
    if (aliveUnits(state, side) === before) break;
    n = aliveUnits(state, side);
  }
  return aliveUnits(state, side);
}

function simFilled(cardId: string, seed: number, duration = 300): SimResult {
  const commander = commanders[0]!;
  const base = buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-standard"),
    deck: [cardId],
    commander,
    doctrine: commander.doctrine,
    seed,
  });
  // Sov generoso: queremos o teto CHEIO, não a economia limitando o teste.
  base.blue = { ...base.blue, commandMax: 1e9, deck: [cardId] };
  base.red = { ...base.red, commandMax: 1e9, deck: [cardId] };
  const st = createBattle(base);
  st.blue.command = 1e9;
  st.red.command = 1e9;
  fillSide(st, "blue", cardId);
  fillSide(st, "red", cardId);
  return runFilled(st, cardId, duration);
}

// Semeia um lado com o teto (33) usando um BARALHO VARIADO, com LIMITE por carta: no
// máximo `perCard` unidades de cada carta. Evita o "33 da mesma carta" (que fica assimétrico
// por causa do mapa) e mede a IA com uma força COMPOSTA, como o usuário pediu.
function fillSideMixed(state: BattleState, side: Side, deck: string[], perCard: number): number {
  const zone = state.config.arena.deployZone[side];
  const used = new Map<string, number>();
  let slot = 0;
  for (let guard = 0; guard < MAX_UNITS_PER_SIDE * 8; guard++) {
    if (aliveUnits(state, side) >= MAX_UNITS_PER_SIDE) break;
    const cardId = deck[slot % deck.length]!;
    const count = used.get(cardId) ?? 0;
    if (count >= perCard) {
      slot++;
      // Todas as cartas já bateram o limite: para.
      if ([...deck].every((id) => (used.get(id) ?? 0) >= perCard)) break;
      continue;
    }
    const n = aliveUnits(state, side);
    const x = zone.x + (zone.w * ((n % 5) + 0.5)) / 5;
    const y = zone.y + (zone.h * ((Math.floor(n / 5) % 5) + 0.5)) / 5;
    if (!deploy(state, side, cardId, x, y, { x, y, skipRecharge: true })) {
      slot++;
      continue;
    }
    used.set(cardId, count + 1);
    slot++;
  }
  return aliveUnits(state, side);
}

function simMixed(deck: string[], perCard: number, seed: number, duration = 300): SimResult {
  const commander = commanders[0]!;
  const base = buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-standard"),
    deck,
    commander,
    doctrine: commander.doctrine,
    seed,
  });
  // ESPELHO DE VERDADE: no jogo o azul é o JOGADOR (bônus de economia, comandante e
  // doutrina próprios); aqui igualamos TUDO para medir a simetria do MOTOR, não a
  // assimetria de balanceamento. Sem isso o azul vence sempre — e não por culpa do motor.
  base.red = {
    ...base.red,
    commander,
    doctrine: commander.doctrine,
    economyBonus: base.blue.economyBonus,
    regen: base.blue.regen,
    commandMax: base.blue.commandMax,
    deck,
  };
  base.blue = { ...base.blue, commandMax: 1e9, deck };
  base.red = { ...base.red, commandMax: 1e9, deck };
  const st = createBattle(base);
  st.blue.command = 1e9;
  st.red.command = 1e9;
  fillSideMixed(st, "blue", deck, perCard);
  fillSideMixed(st, "red", deck, perCard);
  return runFilled(st, "variado", duration);
}

// Roda a batalha já semeada (Sov travado no teto para a IA repor até 33) e coleta métricas.
function runFilled(st: BattleState, cardId: string, duration: number): SimResult {
  configureAi(st, "blue", trainedAiWeights);
  configureAi(st, "red", trainedAiWeights);
  let bluePeakAlive = 0;
  let redPeakAlive = 0;
  const steps = Math.ceil((duration + 30) / STEP);
  for (let i = 0; i < steps && st.running; i++) {
    st.blue.command = 1e9;
    st.red.command = 1e9;
    aiTickSide(st, "blue", STEP);
    aiTickSide(st, "red", STEP);
    stepBattle(st, STEP);
    bluePeakAlive = Math.max(bluePeakAlive, aliveUnits(st, "blue"));
    redPeakAlive = Math.max(redPeakAlive, aliveUnits(st, "red"));
  }
  const r = computeResult(st);
  const baseHp = (side: Side) => {
    const b = st.structures.find((s) => s.side === side && s.kind === "base-principal");
    return b ? Math.round((b.alive ? b.hp / b.maxHp : 0) * 100) : 0;
  };
  return {
    cardId,
    outcome: r.outcome,
    duration: Math.round(r.duration),
    blueMax: st.blue.deployed,
    redMax: st.red.deployed,
    bluePeakAlive,
    redPeakAlive,
    blueDeployed: st.blue.deployed,
    redDeployed: st.red.deployed,
    blueLosses: st.blue.losses,
    redLosses: st.red.losses,
    blueKills: st.blue.kills,
    redKills: st.red.kills,
    blueBaseHp: baseHp("blue"),
    redBaseHp: baseHp("red"),
    territories: r.territories,
  };
}

const BALANCED_DECK = [
  "inf-fuzileiros",
  "inf-assalto",
  "inf-antitanque",
  "inf-engenheiro",
  "art-canhao",
  "bld-vbld",
  "rec-drone",
  "def-aa",
];

describe.skipIf(!RUN)("GUERRA — 33×33 VARIADO (limite por carta, simétrico)", () => {
  it("relatório", () => {
    const out: string[] = [];
    out.push("=== 33×33 VARIADO: baralho de 8 cartas, limite por carta, ambos CHEIOS ===");
    // Limite por carta: 33/8 ≈ 5, então teto de 5 por carta já enche os 33 com composição
    // VARIADA (nunca 33 do mesmo boneco). É o que o usuário pediu.
    for (const perCard of [5, 4, 3]) {
      const r = simMixed(BALANCED_DECK, perCard, 4242);
      out.push(`${line({ ...r, cardId: `lim${perCard}/carta` })}`);
    }
    // Espelho do mesmo baralho variado: deve ficar SIMÉTRICO (sem "um lado sempre vence").
    const mirror = simMixed(BALANCED_DECK, 5, 99);
    out.push(`${line({ ...mirror, cardId: "espelho-variado" })}`);
    writeFileSync(".agent_tmp/war-report.txt", out.join("\n") + "\n", { flag: "a" });
  }, 600000);
});

describe.skipIf(!RUN)("GUERRA — 33×33 forçado (canhão de campanha)", () => {
  it("relatório", () => {
    const out: string[] = [];
    out.push("=== 33×33: Canhão de Campanha (art-canhao) contra ele mesmo ===");
    const r = simFilled("art-canhao", 4242);
    out.push(line(r));
    writeFileSync(".agent_tmp/war-report.txt", out.join("\n") + "\n", { flag: "a" });
  }, 600000);
});

describe.skipIf(!RUN)("GUERRA — 33×33 forçado (carta × carta)", () => {
  it("relatório", () => {
    const out: string[] = [];
    out.push("=== 33×33: cada carta contra ela mesma, ambos os lados CHEIOS ===");
    for (const id of CARDS) {
      const r = simFilled(id, 4242);
      out.push(line(r));
    }
    writeFileSync(".agent_tmp/war-report.txt", out.join("\n") + "\n", { flag: "a" });
  }, 900000);
});

describe.skipIf(!RUN)("GUERRA — duelos espelhados por carta (infinito)", () => {
  it("relatório", () => {
    const out: string[] = [];
    out.push("=== MIRROR: 8x mesma carta nos dois lados, Sov infinito ===");
    for (const id of CARDS) {
      const deck = Array(8).fill(id) as string[];
      const r = sim(id, deck, deck, { infinite: true, seed: 12345 });
      out.push(line(r));
    }

    writeFileSync(".agent_tmp/war-report.txt", out.join("\n") + "\n", { flag: "a" });
  }, 600000);
});

describe.skipIf(!RUN)("GUERRA — duelos espelhados por carta (economia real)", () => {
  it("relatório", () => {
    const out: string[] = [];
    out.push("=== MIRROR: 8x mesma carta nos dois lados, economia REAL ===");
    for (const id of CARDS) {
      const deck = Array(8).fill(id) as string[];
      const r = sim(id, deck, deck, { infinite: false, seed: 12345 });
      out.push(line(r));
    }

    writeFileSync(".agent_tmp/war-report.txt", out.join("\n") + "\n", { flag: "a" });
  }, 600000);
});

describe.skipIf(!RUN)("GUERRA — misturado: composições contra composições", () => {
  it("relatório", () => {
    const out: string[] = [];
    out.push("=== MISTURADO: composições, Sov infinito ===");
    const BALANCED = [
      "inf-fuzileiros",
      "inf-assalto",
      "inf-antitanque",
      "inf-engenheiro",
      "art-canhao",
      "bld-vbld",
      "rec-drone",
      "def-aa",
    ];
    const FIRE = [
      "art-canhao",
      "art-obus",
      "mss-lmf",
      "mss-lancador",
      "def-aa",
      "inf-fuzileiros",
      "inf-engenheiro",
      "rec-drone",
    ];
    const ARMOR = [
      "bld-tanque",
      "bld-vbld",
      "bld-caca-tanques",
      "inf-assalto",
      "inf-engenheiro",
      "rec-drone",
      "def-aa",
      "art-canhao",
    ];
    const INFANTRY = [
      "inf-fuzileiros",
      "inf-assalto",
      "inf-antitanque",
      "inf-sniper",
      "inf-engenheiro",
      "art-morteiro",
      "rec-drone",
      "def-fortificacao",
    ];
    const matches: [string, string[], string[]][] = [
      ["balanceado vs balanceado", BALANCED, BALANCED],
      ["fogo vs blindado", FIRE, ARMOR],
      ["blindado vs infantaria", ARMOR, INFANTRY],
      ["infantaria vs fogo", INFANTRY, FIRE],
      ["fogo vs fogo", FIRE, FIRE],
      ["blindado vs blindado", ARMOR, ARMOR],
    ];
    for (const [name, blue, red] of matches) {
      const r = sim(name, blue, red, { infinite: true, seed: 777 });
      out.push(`${name.padEnd(28)} ${line({ ...r, cardId: "" })}`);
    }

    writeFileSync(".agent_tmp/war-report.txt", out.join("\n") + "\n", { flag: "a" });
  }, 600000);
});
