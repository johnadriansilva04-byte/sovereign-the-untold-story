import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { aiTick } from "@/game/battle/ai";
import { cardById } from "@/game/battle/catalog";
import { buildCommanderContext } from "@/game/battle/llm";
import {
  applyAction,
  computeResult,
  createBattle,
  deploy,
  deployBatch,
  effectiveCost,
  pushCommanderLog,
  stepBattle,
  type DeployBatchResult,
  type DeployRequest,
} from "@/game/battle/engine";
import { requestCommanderDecision } from "@/game/battle/commanderFn";
import type {
  BattleConfig,
  BattleResult,
  BattleState,
  Card,
  DeployTarget,
  Order,
  Side,
} from "@/game/battle/types";

const TICK_MS = 100; // 10 passos por segundo
const DT = TICK_MS / 1000;
const LLM_INTERVAL = 2.6; // segundos entre consultas ao modelo
const LLM_MAX_FAILURES = 3; // depois disso, cai para a IA tática local

export interface UseBattle {
  state: BattleState;
  result: BattleResult | null;
  /** Lado que o jogador controla nesta partida (PvP: host=blue, convidado=red). */
  localSide: Side;
  paused: boolean;
  speed: number;
  llmActive: boolean;
  setPaused: (p: boolean) => void;
  setSpeed: (s: number) => void;
  playCard: (
    cardId: string,
    x: number,
    y: number,
    target?: DeployTarget,
  ) => { ok: boolean; error?: string };
  /** Envia uma OPERAÇÃO: lote de cartas a partir de uma base escolhida (mobile/teclado). */
  sendBatch: (
    requests: DeployRequest[],
    x: number,
    y: number,
    originStructureId?: string,
    target?: DeployTarget,
  ) => DeployBatchResult;
  issueOrder: (order: Order, unitId?: string, objectiveId?: string) => void;
  /** Ordem para o PELOTÃO inteiro (grupo): todos os sobreviventes da tropa obedecem. */
  issueGroupOrder: (order: Order, groupId: string, objectiveId?: string) => void;
  /** Manda a unidade selecionada para um ponto do mapa, ou para cima de um alvo. */
  moveSelected: (unitId: string, x: number, y: number, target?: DeployTarget) => boolean;
  /** Manda a TROPA inteira (grupo/esquadrão) para um ponto do mapa. */
  moveGroup: (groupId: string, x: number, y: number, target?: DeployTarget) => boolean;
  /** Ordem de CAPTURA: a tropa selecionada persegue e prende o alvo (chanceler ou a
   *  unidade da carta nova). Ao prender, um carro-prisão conduz o cativo à base. */
  capture: (sel: { groupId?: string; unitId?: string }, targetUnitId: string) => boolean;
  /** Vetor de comando em tempo real do chanceler (setas/analógico); (0,0) solta. */
  driveUnit: (unitId: string, dx: number, dy: number) => boolean;
  restart: () => void;
  cardMeta: (cardId: string) => Card;
  costOf: (cardId: string) => number;
}

export function useBattle(
  config: BattleConfig,
  opts: { llmCommander?: boolean | undefined; localSide?: Side | undefined } = {},
): UseBattle {
  const local: Side = opts.localSide ?? "blue";
  const enemy: Side = local === "blue" ? "red" : "blue";
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const stateRef = useRef<BattleState>(createBattle(config));
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [llmActive, setLlmActive] = useState(Boolean(opts.llmCommander));
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  pausedRef.current = paused;
  speedRef.current = speed;

  const wantsLlm = Boolean(opts.llmCommander);
  const llmFailedRef = useRef(false);
  const llmTimerRef = useRef(0);
  const llmInFlightRef = useRef(false);
  const llmFailuresRef = useRef(0);

  const configKey = useMemo(
    () => JSON.stringify({ id: config.id, seed: config.seed, llm: wantsLlm }),
    [config.id, config.seed, wantsLlm],
  );

  useEffect(() => {
    stateRef.current = createBattle(config);
    llmFailedRef.current = false;
    llmTimerRef.current = 0;
    llmFailuresRef.current = 0;
    setLlmActive(wantsLlm);
    forceRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    let acc = 0;
    const loop = (now: number) => {
      const elapsed = Math.min(0.5, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      if (!pausedRef.current && st.running) {
        const scaled = elapsed * speedRef.current;
        acc += scaled;
        const useLlm = wantsLlm && !llmFailedRef.current;
        while (acc >= DT) {
          if (!useLlm) aiTick(st, DT);
          stepBattle(st, DT);
          acc -= DT;
          if (!st.running) break;
        }
        if (useLlm && st.running) {
          llmTimerRef.current += scaled;
          if (llmTimerRef.current >= LLM_INTERVAL && !llmInFlightRef.current) {
            llmTimerRef.current = 0;
            llmInFlightRef.current = true;
            const context = buildCommanderContext(st, enemy);
            void requestCommanderDecision({ data: { context } })
              .then((res) => {
                const cur = stateRef.current;
                if (res.ok && cur.running) {
                  const legal = context.legalCardIds.includes(res.cardId);
                  if (legal) {
                    deploy(cur, enemy, res.cardId, res.x, res.y);
                    pushCommanderLog(cur, enemy, `IA: ${res.reason}`);
                  }
                  llmFailuresRef.current = 0;
                } else {
                  llmFailuresRef.current += 1;
                }
              })
              .catch(() => {
                llmFailuresRef.current += 1;
              })
              .finally(() => {
                llmInFlightRef.current = false;
                if (llmFailuresRef.current >= LLM_MAX_FAILURES && !llmFailedRef.current) {
                  llmFailedRef.current = true;
                  setLlmActive(false);
                }
              });
          }
        }
      }
      forceRender();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [wantsLlm, enemy]);

  const playCard = useCallback(
    (cardId: string, x: number, y: number, target?: DeployTarget) => {
      const st = stateRef.current;
      // Ordem do JOGADOR: a força marcha até o ponto e, de lá, volta a caçar o
      // inimigo (holdAtArrival=false) — não congela no destino. Quando o clique
      // acertou um alvo (inimigo/estrutura/território), a força já marcha para atacá-lo.
      const order: {
        x: number;
        y: number;
        holdAtArrival: boolean;
        targetUnitId?: string;
        targetStructureId?: string;
        targetTerritoryId?: string;
        escortId?: string;
      } = { x, y, holdAtArrival: false };
      if (target?.unitId) order.targetUnitId = target.unitId;
      if (target?.structureId) order.targetStructureId = target.structureId;
      if (target?.territoryId) order.targetTerritoryId = target.territoryId;
      if (target?.escortId) order.escortId = target.escortId;
      const ok = deploy(st, local, cardId, x, y, order);
      forceRender();
      return ok ? { ok } : { ok: false, error: "Comando insuficiente ou posição inválida." };
    },
    [local],
  );

  const sendBatch = useCallback(
    (
      requests: DeployRequest[],
      x: number,
      y: number,
      originStructureId?: string,
      target?: DeployTarget,
    ) => {
      const st = stateRef.current;
      const order: {
        x: number;
        y: number;
        holdAtArrival: boolean;
        originStructureId?: string;
        targetUnitId?: string;
        targetStructureId?: string;
        targetTerritoryId?: string;
        escortId?: string;
      } = { x, y, holdAtArrival: false };
      if (originStructureId) order.originStructureId = originStructureId;
      if (target?.unitId) order.targetUnitId = target.unitId;
      if (target?.structureId) order.targetStructureId = target.structureId;
      if (target?.territoryId) order.targetTerritoryId = target.territoryId;
      if (target?.escortId) order.escortId = target.escortId;
      const res = deployBatch(st, local, requests, order);
      forceRender();
      return res;
    },
    [local],
  );

  const moveSelected = useCallback(
    (unitId: string, x: number, y: number, target?: DeployTarget) => {
      const action: {
        type: "reposicionar";
        side: Side;
        unitId: string;
        x: number;
        y: number;
        holdAtArrival: boolean;
        targetUnitId?: string;
        targetStructureId?: string;
        targetTerritoryId?: string;
      } = { type: "reposicionar", side: local, unitId, x, y, holdAtArrival: false };
      if (target?.unitId) action.targetUnitId = target.unitId;
      if (target?.structureId) action.targetStructureId = target.structureId;
      if (target?.territoryId) action.targetTerritoryId = target.territoryId;
      const ok = applyAction(stateRef.current, action).ok;
      forceRender();
      return ok;
    },
    [local],
  );

  const moveGroup = useCallback(
    (groupId: string, x: number, y: number, target?: DeployTarget) => {
      const action: {
        type: "reposicionar";
        side: Side;
        groupId: string;
        x: number;
        y: number;
        holdAtArrival: boolean;
        targetUnitId?: string;
        targetStructureId?: string;
        targetTerritoryId?: string;
      } = { type: "reposicionar", side: local, groupId, x, y, holdAtArrival: false };
      if (target?.unitId) action.targetUnitId = target.unitId;
      if (target?.structureId) action.targetStructureId = target.structureId;
      if (target?.territoryId) action.targetTerritoryId = target.territoryId;
      const ok = applyAction(stateRef.current, action).ok;
      forceRender();
      return ok;
    },
    [local],
  );

  const capture = useCallback(
    (sel: { groupId?: string; unitId?: string }, targetUnitId: string) => {
      const action: {
        type: "capturar";
        side: Side;
        targetUnitId: string;
        groupId?: string;
        unitId?: string;
      } = { type: "capturar", side: local, targetUnitId };
      if (sel.groupId) action.groupId = sel.groupId;
      if (sel.unitId) action.unitId = sel.unitId;
      const ok = applyAction(stateRef.current, action).ok;
      forceRender();
      return ok;
    },
    [local],
  );

  const issueOrder = useCallback(
    (order: Order, unitId?: string, objectiveId?: string) => {
      const action = { type: "ordem", side: local, order } as {
        type: "ordem";
        side: Side;
        order: Order;
        unitId?: string;
        objectiveId?: string;
        groupId?: string;
      };
      if (unitId) action.unitId = unitId;
      if (objectiveId) action.objectiveId = objectiveId;
      applyAction(stateRef.current, action);
      forceRender();
    },
    [local],
  );

  /** Ordem para o PELOTÃO (grupo) inteiro — todos os sobreviventes daquela tropa obedecem. */
  const issueGroupOrder = useCallback(
    (order: Order, groupId: string, objectiveId?: string) => {
      const action = { type: "ordem", side: local, order, groupId } as {
        type: "ordem";
        side: Side;
        order: Order;
        groupId: string;
        objectiveId?: string;
      };
      if (objectiveId) action.objectiveId = objectiveId;
      applyAction(stateRef.current, action);
      forceRender();
    },
    [local],
  );

  // CONTROLE DIRETO: define o vetor de comando do chanceler (setas/analógico). Fica
  // gravado na unidade e é lido a cada passo do motor; (0,0) solta o volante.
  const driveUnit = useCallback(
    (unitId: string, dx: number, dy: number) => {
      const st = stateRef.current;
      for (const u of st[local].units) {
        if (u.id !== unitId) continue;
        u.driveX = dx;
        u.driveY = dy;
        return true;
      }
      return false;
    },
    [local],
  );

  const restart = useCallback(() => {
    stateRef.current = createBattle(config);
    llmFailedRef.current = false;
    llmFailuresRef.current = 0;
    llmTimerRef.current = 0;
    setPaused(false);
    forceRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  const state = stateRef.current;
  const result = state.outcome ? computeResult(state) : null;

  const cardMeta = useCallback((cardId: string) => cardById(cardId), []);
  const doctrine = state[local].doctrine;
  const costOf = useCallback(
    (cardId: string) => effectiveCost(cardById(cardId), doctrine),
    [doctrine],
  );

  return {
    state,
    result,
    localSide: local,
    paused,
    speed,
    llmActive,
    setPaused,
    setSpeed,
    playCard,
    sendBatch,
    issueOrder,
    issueGroupOrder,
    moveSelected,
    moveGroup,
    capture,
    driveUnit,
    restart,
    cardMeta,
    costOf,
  };
}

export const sideLabel = (side: Side) => (side === "blue" ? "Aliado" : "Inimigo");
