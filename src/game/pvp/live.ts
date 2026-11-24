// Núcleo do PvP ONLINE do SOVEREIGN — determinístico e independente de rede.
//
// Por que dá para jogar em tempo real sem servidor de jogo: o motor de batalha é
// DETERMINÍSTICO (RNG semeado; nada de Math.random nem relógio dentro de `stepBattle`).
// Então os dois clientes rodam a MESMA simulação com a MESMA semente e trocam apenas os
// COMANDOS (lockstep). O estado só diverge se os comandos divergirem — e `stateHash`
// detecta isso para o host ressincronizar.
//
// Este arquivo é puro (sem React, sem Supabase): é o que os testes exercitam.

import { arenaByTerrain, commanderById, commanders } from "@/game/battle/catalog";
import { commandCapacity, defaultNation, economyBonus, regenRate } from "@/game/battle/missions";
import { applyAction, createBattle, stepBattle } from "@/game/battle/engine";
import { HOME_POINT } from "@/game/battle/world";
import type { ChancellorLoadout } from "@/game/battle/chancellor";
import type {
  Arena,
  BattleAction,
  BattleConfig,
  BattleOutcome,
  BattleState,
  ChancellorMode,
  Doctrine,
  Side,
  TerrainKind,
} from "@/game/battle/types";

export type Seat = "host" | "guest";
export type LivePhase = "aguardando" | "sincronizando" | "jogando" | "encerrada";

/** Passo do motor (segundos). Igual ao do modo solo (10 passos/s). */
export const LIVE_DT = 0.1;

/**
 * Quantos ticks o jogador local pode avançar à frente do adversário. É a "janela" que
 * dá tempo de o comando atravessar a rede antes de o outro cliente chegar naquele tick.
 * ~4 ticks ≈ 400 ms de folga — suficiente para a maioria das conexões domésticas.
 */
export const INPUT_DELAY_TICKS = 4;

/** Intervalo (ms) entre heartbeats de progresso e de hash de estado. */
export const PROGRESS_INTERVAL_MS = 200;
export const HASH_INTERVAL_MS = 1500;

export const otherSeat = (s: Seat): Seat => (s === "host" ? "guest" : "host");
/** O host comanda o azul; o convidado comanda o vermelho. */
export const sideForSeat = (s: Seat): Side => (s === "host" ? "blue" : "red");

// ---------------------------------------------------------------------------
// Código de sala (compartilhável) e id de partida
// ---------------------------------------------------------------------------

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L) — o código é digitado à mão.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeRoomCode(rand: () => number = Math.random, len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  }
  return out;
}

export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .slice(0, 6);
}

export function randomSeed(rand: () => number = Math.random): number {
  return Math.floor(rand() * 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Código de sala DETERMINÍSTICO
// ---------------------------------------------------------------------------

/** Terrenos jogáveis no PvP, na ordem canônica (o índice entra no código da sala). */
export const PVP_TERRAINS: TerrainKind[] = [
  "Cidade",
  "Floresta",
  "Montanha",
  "Campo aberto",
  "Travessia de rio",
  "Região fortificada",
];

// Alfabeto sem caracteres ambíguos (mesmo do código aleatório). `normalizeRoomCode` já
// converte O→0 e I/L→1, então os dois alfabetos são compatíveis.
const CODE_BASE = CODE_ALPHABET.length;

/**
 * Empacota semente + terreno num código de sala. O convidado reconstrói a MESMA config
 * só com o código — não é preciso um canal separado para anunciar a partida.
 */
export function encodeRoom(seed: number, terrain: TerrainKind, len = 5): string {
  const ti = Math.max(0, PVP_TERRAINS.indexOf(terrain));
  const capacity = Math.floor(CODE_BASE ** len / PVP_TERRAINS.length);
  // A semente é reduzida à capacidade do código (bijeção dentro dessa faixa): com 5
  // caracteres cabem ~5,5 milhões de sementes distintas — de sobra para uma partida.
  const s = (seed >>> 0) % capacity;
  let n = BigInt(s) * BigInt(PVP_TERRAINS.length) + BigInt(ti);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Number(n % BigInt(CODE_BASE))];
    n /= BigInt(CODE_BASE);
  }
  return out;
}

/** Inverso de `encodeRoom`. Devolve `null` se o código for inválido. */
export function decodeRoom(code: string): { seed: number; terrain: TerrainKind } | null {
  const clean = normalizeRoomCode(code);
  if (clean.length < 4) return null;
  let n = 0n;
  let mult = 1n;
  for (const ch of clean) {
    const idx = CODE_ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    n += BigInt(idx) * mult;
    mult *= BigInt(CODE_BASE);
  }
  const ti = Number(n % BigInt(PVP_TERRAINS.length));
  const seed = Number(n / BigInt(PVP_TERRAINS.length)) >>> 0;
  return { seed, terrain: PVP_TERRAINS[ti]! };
}

// ---------------------------------------------------------------------------
// Comandos e ordenação determinística
// ---------------------------------------------------------------------------

export interface LiveCommand {
  seq: number;
  seat: Seat;
  /** Tick ABSOLUTO em que o comando deve ser aplicado nos dois clientes. */
  tick: number;
  action: BattleAction;
}

/**
 * Ordem canônica de aplicação dentro de um mesmo tick: host antes de guest, depois `seq`.
 * Os dois clientes usam exatamente esta função, então aplicam a MESMA sequência.
 */
export function compareCommands(a: LiveCommand, b: LiveCommand): number {
  if (a.tick !== b.tick) return a.tick - b.tick;
  const sa = a.seat === "host" ? 0 : 1;
  const sb = b.seat === "host" ? 0 : 1;
  if (sa !== sb) return sa - sb;
  return a.seq - b.seq;
}

// ---------------------------------------------------------------------------
// Configuração espelhada
// ---------------------------------------------------------------------------

export interface LiveSideInput {
  deck: string[];
  commanderId: string;
  doctrine: Doctrine;
  /** Nome/bandeira mostrados no HUD adversário. */
  name: string;
  flag: string;
  cardLevels?: Record<string, number>;
  /** Chanceler do jogador: rosto, nome e estilo aparecem no campo para os dois lados. */
  hero?: ChancellorLoadout;
}

/**
 * ESCALAÇÃO de um lado na sala: o que precisa ser IGUAL nos dois clientes. Cada jogador
 * anuncia a sua pelo transporte; os dois montam a config com as duas e a partida nasce
 * idêntica — sem isso, baralhos diferentes divergiam no primeiro tick.
 */
export interface LiveRoster {
  deck: string[];
  commanderId: string;
  doctrine: Doctrine;
  name: string;
  flag: string;
  hero?: ChancellorLoadout;
}

export interface LiveConfigInput {
  seed: number;
  terrain: TerrainKind;
  host: LiveSideInput;
  guest: LiveSideInput;
  duration?: number;
}

function sideConfig(input: LiveSideInput) {
  // Economia IGUAL para os dois lados: sem isso o azul herdaria os bônus de "jogador"
  // da campanha e o PvP nasceria desbalanceado.
  const cfg = {
    countryId: input.commanderId,
    countryName: input.name,
    flag: input.flag,
    commander: commanderById(input.commanderId) ?? commanders[0]!,
    doctrine: input.doctrine,
    deck: input.deck.slice(0, 8),
    commandMax: commandCapacity(defaultNation),
    regen: regenRate(defaultNation),
    economyBonus: economyBonus(defaultNation),
  };
  return {
    ...cfg,
    ...(input.cardLevels ? { cardLevels: input.cardLevels } : {}),
    ...(input.hero ? { hero: input.hero } : {}),
  };
}

function cloneArena(arena: Arena): Arena {
  return {
    ...arena,
    controlPoints: arena.controlPoints.map((p) => ({
      ...p,
      owner: "neutro" as const,
      progress: { blue: 0, red: 0 },
    })),
    obstacles: arena.obstacles.map((o) => ({ ...o })),
    routes: arena.routes.map((r) => ({ ...r })),
    frontiers: (arena.frontiers ?? []).map((f) => ({ ...f })),
    deployZone: { blue: { ...arena.deployZone.blue }, red: { ...arena.deployZone.red } },
  };
}

/**
 * Config ÚNICA da partida online. Os dois clientes chamam esta função com os MESMOS
 * argumentos (o host é a autoridade do `seed` e do conjunto), logo criam estados
 * idênticos. `host` joga no azul, `guest` no vermelho.
 */
export function buildLiveConfig(input: LiveConfigInput): BattleConfig {
  const arena = cloneArena(arenaByTerrain(input.terrain));
  // REGRA DO CHANCELER: cada batalha tem UM único chanceler, e o modo ALTERNA entre
  // proteger o nosso ("defender") e caçar o do adversário ("capturar"). Aqui a paridade
  // da semente decide o modo — os dois clientes chegam ao MESMO resultado.
  const mode: ChancellorMode = input.seed % 2 === 1 ? "capturar" : "defender";
  const chancellorSide: Side = mode === "defender" ? "blue" : "red";
  const base = arena.structures.find(
    (s) => s.side === chancellorSide && s.kind === "base-principal",
  );
  const post = base
    ? { x: base.x, y: base.y }
    : { x: HOME_POINT[chancellorSide].x, y: HOME_POINT[chancellorSide].y };
  return {
    id: `pvp-live-${input.seed}`,
    missionName: `PvP · ${input.host.name} × ${input.guest.name}`,
    objectiveKind: "territorial",
    objectiveText: "Domine os pontos de controle e imponha superioridade territorial.",
    duration: input.duration ?? 300,
    arena,
    blue: { ...sideConfig(input.host), countryId: "pvp-host" },
    red: { ...sideConfig(input.guest), countryId: "pvp-guest" },
    seed: input.seed,
    heroSetup: [{ side: chancellorSide, status: "livre", x: post.x, y: post.y }],
    chancellorMode: mode,
    heroDecisive: true,
  };
}

/**
 * O resultado do motor é sempre do ponto de vista do AZUL. Numa sala cada cliente tem
 * o seu assento, então o convidado (vermelho) lê o resultado invertido.
 */
export function outcomeForSeat(outcome: BattleOutcome, seat: Seat): BattleOutcome {
  if (seat === "host" || outcome === "empate") return outcome;
  return outcome === "vitoria" ? "derrota" : "vitoria";
}

// ---------------------------------------------------------------------------
// Hash de estado (detecção de divergência)
// ---------------------------------------------------------------------------

/**
 * Resumo determinístico do estado, para comparar entre clientes. Não precisa cobrir
 * TUDO — basta cobrir o que muda com o combate (tempo, tick, posições/vida, donos).
 */
export function stateHash(state: BattleState): number {
  let h = 2166136261;
  const mix = (n: number) => {
    const v = Math.round(n * 1000) | 0;
    h ^= v & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 16777619);
  };
  mix(state.t);
  mix(state.tick);
  mix(state.running ? 1 : 0);
  mix(state.outcome ? 1 : 0);
  for (const side of ["blue", "red"] as Side[]) {
    const cfg = side === "blue" ? state.blue : state.red;
    mix(cfg.command);
    mix(cfg.deployed);
    mix(cfg.losses);
    mix(cfg.kills);
    for (const u of cfg.units) {
      if (!u.alive) continue;
      mix(u.x);
      mix(u.y);
      mix(u.hp);
    }
  }
  for (const t of state.territories) {
    mix(t.owner === "blue" ? 1 : t.owner === "red" ? 2 : 0);
    mix(t.progress.blue);
    mix(t.progress.red);
  }
  for (const s of state.structures) {
    mix(s.alive ? 1 : 0);
    mix(s.hp);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Simulação lockstep (pura — sem React, sem rede)
// ---------------------------------------------------------------------------

export interface LiveSimOptions {
  localSeat: Seat;
  /** Janela de ticks que o local pode adiantar. Padrão: INPUT_DELAY_TICKS. */
  inputDelay?: number;
}

/**
 * Uma réplica da batalha que só avança quando é seguro: nunca passa de
 * `remoteProgress + inputDelay`, para dar tempo de o comando do adversário chegar no
 * tick certo. Aplicar os mesmos comandos na mesma ordem nos dois clientes mantém o
 * estado idêntico (determinismo).
 */
export class LiveSim {
  readonly state: BattleState;
  readonly localSeat: Seat;
  private readonly inputDelay: number;
  private queue: LiveCommand[] = [];
  private nextSeq = 1;
  /** Maior tick já reportado pelo adversário (libera o avanço local). */
  remoteProgress = 0;
  /** Ticks avançados localmente. */
  localTick = 0;

  constructor(config: BattleConfig, opts: LiveSimOptions) {
    this.state = createBattle(config);
    this.localSeat = opts.localSeat;
    this.inputDelay = opts.inputDelay ?? INPUT_DELAY_TICKS;
  }

  /** Tick em que um comando emitido AGORA será aplicado nos dois clientes. */
  scheduledTick(): number {
    return this.localTick + this.inputDelay;
  }

  /** Cria e agenda um comando local, devolvendo-o para publicação. */
  localAction(action: BattleAction): LiveCommand {
    const cmd: LiveCommand = {
      seq: this.nextSeq++,
      seat: this.localSeat,
      tick: this.scheduledTick(),
      action,
    };
    this.queue.push(cmd);
    return cmd;
  }

  /** Recebe um comando do adversário (o eco do próprio é ignorado por seq). */
  receive(cmd: LiveCommand): void {
    if (cmd.seat === this.localSeat) return;
    if (this.queue.some((c) => c.seat === cmd.seat && c.seq === cmd.seq)) return;
    this.queue.push(cmd);
  }

  /** O adversário avançou até `tick`. */
  noteRemoteProgress(tick: number): void {
    if (tick > this.remoteProgress) this.remoteProgress = tick;
  }

  /**
   * Avança UM passo, se permitido. Devolve `true` se avançou. Comandos devidos para o
   * tick atual são aplicados em ordem determinística ANTES do passo.
   */
  step(): boolean {
    if (!this.state.running) return false;
    if (this.localTick > this.remoteProgress + this.inputDelay) return false;
    this.applyDue(this.localTick);
    stepBattle(this.state, LIVE_DT);
    this.localTick += 1;
    return true;
  }

  private applyDue(tick: number): void {
    const due = this.queue.filter((c) => c.tick <= tick).sort(compareCommands);
    if (!due.length) return;
    for (const c of due) applyAction(this.state, c.action);
    this.queue = this.queue.filter((c) => !due.includes(c));
  }

  hash(): number {
    return stateHash(this.state);
  }

  /** Cópia serializável do estado (para o host ressincronizar o convidado). */
  snapshot(): BattleState {
    return JSON.parse(JSON.stringify(this.state)) as BattleState;
  }
}
