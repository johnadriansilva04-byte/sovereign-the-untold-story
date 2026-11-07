// Auto-treino da IA de SOVEREIGN por auto-jogo (self-play).
//
// A IA joga contra si mesma milhares de vezes, sob as MESMAS regras do humano, e os
// pesos de decisão são ajustados por escalada (hill-climbing): uma mutação só é aceita
// se a taxa de vitória do candidato contra a IA padrão melhorar.
//
// Nada disso roda no navegador: é uma ferramenta de desenvolvimento/teste. O resultado
// (pesos calibrados) é versionado como constante para deixar a IA competitiva.

import { arenaByTerrain, allDoctrines, commanders, startingDeck } from "./catalog";
import { computeResult, createBattle, stepBattle } from "./engine";
import { aiTickSide, configureAi, defaultAiWeights, type AiWeights } from "./ai";
import type { BattleConfig, Doctrine, SideConfig, TerrainKind } from "./types";

const TERRAINS: TerrainKind[] = [
  "Campo aberto",
  "Floresta",
  "Montanha",
  "Cidade",
  "Travessia de rio",
  "Região fortificada",
];

function sideCfg(commanderIdx: number, doctrine: Doctrine): SideConfig {
  return {
    countryId: "train",
    countryName: "Treino",
    flag: "⚙️",
    commander: commanders[commanderIdx % commanders.length]!,
    doctrine,
    deck: [...startingDeck],
    commandMax: 11,
    regen: 0.98,
    economyBonus: 0.03,
  };
}

function makeConfig(seed: number, terrain: TerrainKind, duration = 150): BattleConfig {
  // lados simétricos: o resultado reflete a diferença de pesos, não viés de mapa/carta
  return {
    id: "train",
    missionName: "Treino",
    objectiveKind: "territorial",
    objectiveText: "Controle territorial.",
    duration,
    arena: arenaByTerrain(terrain),
    blue: sideCfg(0, allDoctrines[0]!),
    red: sideCfg(0, allDoctrines[0]!),
    seed: seed >>> 0,
  };
}

export interface GameOutcome {
  winner: "blue" | "red" | "empate";
  scoreBlue: number;
  scoreRed: number;
}

// Uma partida de auto-jogo: azul e vermelho com pesos distintos.
export function playSelfPlay(
  seed: number,
  terrain: TerrainKind,
  blueWeights: AiWeights,
  redWeights: AiWeights,
  duration = 150,
): GameOutcome {
  const cfg = makeConfig(seed, terrain, duration);
  const state = createBattle(cfg);
  configureAi(state, "blue", blueWeights);
  configureAi(state, "red", redWeights);
  const dt = 0.25;
  const maxSteps = Math.ceil((cfg.duration + 20) / dt);
  let guard = 0;
  while (state.running && guard < maxSteps) {
    aiTickSide(state, "blue", dt);
    aiTickSide(state, "red", dt);
    stepBattle(state, dt);
    guard++;
  }
  const result = computeResult(state);
  const winner =
    result.outcome === "vitoria" ? "blue" : result.outcome === "derrota" ? "red" : "empate";
  return {
    winner,
    scoreBlue: result.territorialScore.blue,
    scoreRed: result.territorialScore.red,
  };
}

// Taxa de vitória do candidato (vermelho) contra a IA padrão (azul), em `games` partidas.
export function evaluateWeights(
  candidate: AiWeights,
  games: number,
  seedBase: number,
  baseline: AiWeights = defaultAiWeights,
): number {
  let wins = 0;
  let draws = 0;
  for (let i = 0; i < games; i++) {
    const terrain = TERRAINS[i % TERRAINS.length]!;
    const seed = (seedBase + i * 7919) >>> 0;
    const out = playSelfPlay(seed, terrain, baseline, candidate);
    if (out.winner === "red") wins += 1;
    else if (out.winner === "empate") draws += 1;
  }
  return (wins + draws * 0.5) / games;
}

function clampWeight(v: number): number {
  return Math.max(0.2, Math.min(3, Math.round(v * 100) / 100));
}

function mutate(w: AiWeights, rng: () => number): AiWeights {
  const keys = Object.keys(w) as (keyof AiWeights)[];
  const key = keys[Math.floor(rng() * keys.length)]!;
  const step = (rng() - 0.5) * 0.6;
  return { ...w, [key]: clampWeight(w[key] + step) };
}

// rng determinístico (mulberry32) para o treino ser reprodutível.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TrainOptions {
  iterations: number; // quantas mutações tentar
  gamesPerEval: number; // partidas por avaliação
  seed: number;
  start?: AiWeights;
}

export interface TrainReport {
  best: AiWeights;
  bestWinRate: number;
  startWinRate: number;
  improvements: { iteration: number; winRate: number; weights: AiWeights }[];
  totalGames: number;
}

// Escalada: aceita uma mutação apenas se ela vencer mais que o melhor conhecido.
export function trainAi(opts: TrainOptions): TrainReport {
  const rng = makeRng(opts.seed);
  let best: AiWeights = { ...(opts.start ?? defaultAiWeights) };
  const startWinRate = evaluateWeights(best, opts.gamesPerEval, opts.seed);
  let bestWinRate = startWinRate;
  const improvements: TrainReport["improvements"] = [];
  let totalGames = opts.gamesPerEval;

  for (let i = 0; i < opts.iterations; i++) {
    const cand = mutate(best, rng);
    const rate = evaluateWeights(cand, opts.gamesPerEval, opts.seed + (i + 1) * 104729);
    totalGames += opts.gamesPerEval;
    if (rate > bestWinRate + 1e-9) {
      best = cand;
      bestWinRate = rate;
      improvements.push({ iteration: i, winRate: rate, weights: cand });
    }
  }
  return { best, bestWinRate, startWinRate, improvements, totalGames };
}
