// HARNESS DE GUERRA (temporário, de diagnóstico). Roda duelos espelhados por carta e
import { writeFileSync } from "node:fs";
// mede: uso do teto de exército (33), baixas, resultado e se a IA joga com inteligência.
// NÃO é um teste de regressão: imprime relatório. Rodar com:
//   SIM=1 npx vitest run src/test/war-sim.test.ts
import { describe, it } from "vitest";

import { aiTickSide, configureAi, trainedAiWeights } from "@/game/battle/ai";
import { militaryCards, commanders } from "@/game/battle/catalog";
import { aliveUnits, computeResult, createBattle, MAX_UNITS_PER_SIDE, stepBattle } from "@/game/battle/engine";
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
    red: { ...base.red, deck: redDeck.slice(0, 8), commander, doctrine: commander.doctrine },
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

describe.skipIf(!RUN)("GUERRA — duelos espelhados por carta (infinito)", () => {
  it("relatório", () => {
    const out: string[] = [];
    out.push("=== MIRROR: 8x mesma carta nos dois lados, Sov infinito ===");
    for (const id of CARDS) {
      const deck = Array(8).fill(id) as string[];
      const r = sim(id, deck, deck, { infinite: true, seed: 12345 });
      out.push(line(r));
    }
    // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
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
    const FIRE = ["art-canhao", "art-obus", "mss-lmf", "mss-lancador", "def-aa", "inf-fuzileiros", "inf-engenheiro", "rec-drone"];
    const ARMOR = ["bld-tanque", "bld-vbld", "bld-caca-tanques", "inf-assalto", "inf-engenheiro", "rec-drone", "def-aa", "art-canhao"];
    const INFANTRY = ["inf-fuzileiros", "inf-assalto", "inf-antitanque", "inf-sniper", "inf-engenheiro", "art-morteiro", "rec-drone", "def-fortificacao"];
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
    // eslint-disable-next-line no-console
    writeFileSync(".agent_tmp/war-report.txt", out.join("\n") + "\n", { flag: "a" });
  }, 600000);
});
