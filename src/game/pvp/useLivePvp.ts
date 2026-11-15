// Hook React que liga a partida ONLINE (lockstep determinístico) à interface.
//
// Responsabilidades:
//  - criar o `LiveSim`/`LiveMatch` com a config compartilhada;
//  - abrir o transporte Realtime (Supabase) e plugar os handlers;
//  - dirigir o relógio com `requestAnimationFrame`, passando o tempo para `advance`;
//  - expor comandos (enviar tropa, ordens, mover, dirigir o chanceler) traduzidos em
//    `BattleAction` que o `LiveMatch` publica para o adversário.

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BattleAction,
  BattleConfig,
  BattleResult,
  BattleState,
  Card,
  DeployTarget,
  Order,
  Side,
} from "@/game/battle/types";
import { cardById } from "@/game/battle/catalog";
import { applyAction, effectiveCost } from "@/game/battle/engine";
import type { DeployBatchResult, DeployRequest } from "@/game/battle/engine";
import type { UseBattle } from "@/game/battle/useBattle";
import { sideForSeat, type Seat } from "./live";
import { LiveMatch } from "./match";
import { createSupabaseTransport, type TransportStatus } from "./transport";

export interface UseLivePvpOptions {
  /** Config ÚNICA da partida (mesma nos dois clientes, via `buildLiveConfig`). */
  config: BattleConfig;
  code: string;
  seat: Seat;
  onEnd?: (result: BattleResult) => void;
}

export interface UseLivePvp {
  state: BattleState | null;
  localSide: Side;
  status: TransportStatus;
  peerSeen: boolean;
  paused: boolean;
  setPaused: (p: boolean) => void;
  result: BattleResult | null;
  /** Aplica uma ação local (publicada ao adversário pelo lockstep). */
  dispatch: (action: BattleAction) => void;
  sendBatch: (
    requests: DeployRequest[],
    x: number,
    y: number,
    originStructureId?: string,
    target?: DeployTarget,
  ) => DeployBatchResult;
  issueOrder: (order: Order, unitId?: string, objectiveId?: string) => void;
  /** Ordem para o PELOTÃO inteiro (grupo) no PvP — publicada no lockstep. */
  issueGroupOrder: (order: Order, groupId: string, objectiveId?: string) => void;
  moveSelected: (unitId: string, x: number, y: number, target?: DeployTarget) => boolean;
  moveGroup: (groupId: string, x: number, y: number, target?: DeployTarget) => boolean;
  capture: (sel: { groupId?: string; unitId?: string }, targetUnitId: string) => boolean;
  driveUnit: (unitId: string, dx: number, dy: number) => boolean;
  costOf: (cardId: string) => number;
  /** Fonte plugável para a `BattleView` compartilhada (mesma API da batalha local). */
  useBattle: () => UseBattle;
}

export function useLivePvp(opts: UseLivePvpOptions): UseLivePvp {
  const { config } = opts;
  const localSide = sideForSeat(opts.seat);

  const [, force] = useState(0);
  const [status, setStatus] = useState<TransportStatus>("connecting");
  const [peerSeen, setPeerSeen] = useState(false);
  const [paused, setPausedState] = useState(false);
  const [result, setResult] = useState<BattleResult | null>(null);
  const matchRef = useRef<LiveMatch | null>(null);
  const pausedRef = useRef(false);
  const onEndRef = useRef(opts.onEnd);
  onEndRef.current = opts.onEnd;

  const setPaused = useCallback((p: boolean) => {
    pausedRef.current = p;
    setPausedState(p);
  }, []);

  useEffect(() => {
    // Handlers delegados: o transporte é criado ANTES do match (ele é injetado no
    // construtor), então ele entrega os eventos a um invólucro que só existe depois.
    let match: LiveMatch | null = null;
    const transport = createSupabaseTransport(opts.code, opts.seat, {
      onStatus: (s) => setStatus(s),
      onCommand: (cmd) => match?.handlers().onCommand(cmd),
      onProgress: (t) => match?.handlers().onProgress(t),
      onHash: (h, t) => match?.handlers().onHash(h, t),
      onResyncRequest: () => match?.handlers().onResyncRequest(),
      onSnapshot: (s) => match?.handlers().onSnapshot(s),
    });
    match = new LiveMatch({
      config,
      seat: opts.seat,
      transport,
      onTick: () => force((n) => (n + 1) % 1_000_000),
      onPeerSeen: () => setPeerSeen(true),
      onEnd: (r) => {
        setResult(r);
        onEndRef.current?.(r);
      },
    });
    matchRef.current = match;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      // Pausa do jogador: o relógio do lockstep para; o adversário continua o dele.
      if (!pausedRef.current) match?.advance(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      transport.close();
      matchRef.current = null;
    };
  }, [config, opts.code, opts.seat]);

  const dispatch = useCallback((action: BattleAction) => {
    matchRef.current?.dispatch(action);
  }, []);

  const sendBatch = useCallback<UseLivePvp["sendBatch"]>(
    (requests, x, y, originStructureId, target) => {
      const m = matchRef.current;
      if (!m) return { ok: false, deployed: 0, spent: 0, error: "Partida não iniciada." };
      // Verifica custo no estado local (autoridade do host corrige por hash).
      const side = m.sim.state[localSide];
      const total = requests.reduce(
        (a, r) => a + effectiveCost(cardById(r.cardId), side.doctrine) * r.count,
        0,
      );
      if (total > side.command) {
        return { ok: false, deployed: 0, spent: 0, error: "Comando insuficiente." };
      }
      const action: BattleAction = {
        type: "lote",
        side: localSide,
        requests,
        x,
        y,
        holdAtArrival: false,
        ...(originStructureId ? { originStructureId } : {}),
        ...(target?.unitId ? { targetUnitId: target.unitId } : {}),
        ...(target?.structureId ? { targetStructureId: target.structureId } : {}),
        ...(target?.territoryId ? { targetTerritoryId: target.territoryId } : {}),
        ...(target?.escortId ? { escortId: target.escortId } : {}),
      };
      m.dispatch(action);
      return { ok: true, deployed: requests.reduce((a, r) => a + r.count, 0), spent: total };
    },
    [localSide],
  );

  const issueOrder = useCallback(
    (order: Order, unitId?: string, objectiveId?: string) => {
      const m = matchRef.current;
      if (!m) return;
      const action = { type: "ordem", side: localSide, order } as BattleAction & {
        unitId?: string;
        objectiveId?: string;
      };
      if (unitId) action.unitId = unitId;
      if (objectiveId) action.objectiveId = objectiveId;
      m.dispatch(action);
    },
    [localSide],
  );

  const issueGroupOrder = useCallback(
    (order: Order, groupId: string, objectiveId?: string) => {
      const m = matchRef.current;
      if (!m) return;
      const action = { type: "ordem", side: localSide, order, groupId } as BattleAction & {
        groupId?: string;
        objectiveId?: string;
      };
      if (objectiveId) action.objectiveId = objectiveId;
      m.dispatch(action);
    },
    [localSide],
  );

  const moveSelected = useCallback(
    (unitId: string, x: number, y: number, target?: DeployTarget) => {
      const m = matchRef.current;
      if (!m) return false;
      const action: BattleAction = {
        type: "reposicionar",
        side: localSide,
        unitId,
        x,
        y,
        holdAtArrival: false,
        ...(target?.unitId ? { targetUnitId: target.unitId } : {}),
        ...(target?.structureId ? { targetStructureId: target.structureId } : {}),
        ...(target?.territoryId ? { targetTerritoryId: target.territoryId } : {}),
      };
      m.dispatch(action);
      return true;
    },
    [localSide],
  );

  const moveGroup = useCallback(
    (groupId: string, x: number, y: number, target?: DeployTarget) => {
      const m = matchRef.current;
      if (!m) return false;
      const action: BattleAction = {
        type: "reposicionar",
        side: localSide,
        groupId,
        x,
        y,
        holdAtArrival: false,
        ...(target?.unitId ? { targetUnitId: target.unitId } : {}),
        ...(target?.structureId ? { targetStructureId: target.structureId } : {}),
        ...(target?.territoryId ? { targetTerritoryId: target.territoryId } : {}),
      };
      const ok = applyAction(m.sim.state, action).ok;
      m.dispatch(action);
      return ok;
    },
    [localSide],
  );

  const capture = useCallback(
    (sel: { groupId?: string; unitId?: string }, targetUnitId: string) => {
      const m = matchRef.current;
      if (!m) return false;
      const action: BattleAction = {
        type: "capturar",
        side: localSide,
        targetUnitId,
        ...(sel.groupId ? { groupId: sel.groupId } : {}),
        ...(sel.unitId ? { unitId: sel.unitId } : {}),
      };
      const ok = applyAction(m.sim.state, action).ok;
      m.dispatch(action);
      return ok;
    },
    [localSide],
  );

  const driveUnit = useCallback(
    (unitId: string, dx: number, dy: number) => {
      const m = matchRef.current;
      if (!m) return false;
      m.dispatch({ type: "dirigir", side: localSide, unitId, dx, dy });
      return true;
    },
    [localSide],
  );

  const costOf = useCallback(
    (cardId: string) => {
      const m = matchRef.current;
      const doctrine = (m?.sim.state[localSide] ?? config[localSide]).doctrine;
      return effectiveCost(cardById(cardId), doctrine);
    },
    [config, localSide],
  );

  const state = matchRef.current?.sim.state ?? null;

  // Adaptador para a interface compartilhada `BattleView`: apresenta a MESMA API da
  // batalha local (`UseBattle`), mas cada comando vira uma ação publicada no lockstep.
  // Chamado durante o render de `BattleView` (não é um hook React, apesar do nome).
  const useBattleAdapter = (): UseBattle => ({
    state: matchRef.current!.sim.state,
    result,
    localSide,
    paused,
    speed: 1,
    llmActive: false,
    setPaused,
    setSpeed: () => {},
    playCard: (cardId, x, y, target) => {
      const res = sendBatch([{ cardId, count: 1 }], x, y, undefined, target);
      return res.ok ? { ok: true } : { ok: false, ...(res.error ? { error: res.error } : {}) };
    },
    sendBatch,
    issueOrder,
    issueGroupOrder,
    moveSelected,
    moveGroup,
    capture,
    driveUnit,
    restart: () => {},
    cardMeta: (cardId: string): Card => cardById(cardId),
    costOf,
  });

  return {
    state,
    localSide,
    status,
    peerSeen,
    paused,
    setPaused,
    result,
    dispatch,
    sendBatch,
    issueOrder,
    issueGroupOrder,
    moveSelected,
    moveGroup,
    capture,
    driveUnit,
    costOf,
    useBattle: useBattleAdapter,
  };
}
