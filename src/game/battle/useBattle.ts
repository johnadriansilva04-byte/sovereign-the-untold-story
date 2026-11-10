import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { aiTick } from "@/game/battle/ai";
import { cardById } from "@/game/battle/catalog";
import { buildCommanderContext } from "@/game/battle/llm";
import {
  applyAction,
  computeResult,
  createBattle,
  deploy,
  effectiveCost,
  pushCommanderLog,
  stepBattle,
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
  issueOrder: (order: Order, unitId?: string, objectiveId?: string) => void;
  /** Manda a unidade selecionada para um ponto do mapa, ou para cima de um alvo. */
  moveSelected: (unitId: string, x: number, y: number, target?: DeployTarget) => boolean;
  restart: () => void;
  cardMeta: (cardId: string) => Card;
  costOf: (cardId: string) => number;
}

export function useBattle(
  config: BattleConfig,
  opts: { llmCommander?: boolean | undefined } = {},
): UseBattle {
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
            const context = buildCommanderContext(st, "red");
            void requestCommanderDecision({ data: { context } })
              .then((res) => {
                const cur = stateRef.current;
                if (res.ok && cur.running) {
                  const legal = context.legalCardIds.includes(res.cardId);
                  if (legal) {
                    deploy(cur, "red", res.cardId, res.x, res.y);
                    pushCommanderLog(cur, "red", `IA: ${res.reason}`);
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
  }, [wantsLlm]);

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
      } = { x, y, holdAtArrival: false };
      if (target?.unitId) order.targetUnitId = target.unitId;
      if (target?.structureId) order.targetStructureId = target.structureId;
      if (target?.territoryId) order.targetTerritoryId = target.territoryId;
      const ok = deploy(st, "blue", cardId, x, y, order);
      forceRender();
      return ok ? { ok } : { ok: false, error: "Comando insuficiente ou posição inválida." };
    },
    [],
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
      } = { type: "reposicionar", side: "blue", unitId, x, y, holdAtArrival: false };
      if (target?.unitId) action.targetUnitId = target.unitId;
      if (target?.structureId) action.targetStructureId = target.structureId;
      if (target?.territoryId) action.targetTerritoryId = target.territoryId;
      const ok = applyAction(stateRef.current, action).ok;
      forceRender();
      return ok;
    },
    [],
  );

  const issueOrder = useCallback((order: Order, unitId?: string, objectiveId?: string) => {
    const action = { type: "ordem", side: "blue", order } as {
      type: "ordem";
      side: Side;
      order: Order;
      unitId?: string;
      objectiveId?: string;
    };
    if (unitId) action.unitId = unitId;
    if (objectiveId) action.objectiveId = objectiveId;
    applyAction(stateRef.current, action);
    forceRender();
  }, []);

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
  const costOf = useCallback(
    (cardId: string) => effectiveCost(cardById(cardId), state.blue.doctrine),
    [state.blue.doctrine],
  );

  return {
    state,
    result,
    paused,
    speed,
    llmActive,
    setPaused,
    setSpeed,
    playCard,
    issueOrder,
    moveSelected,
    restart,
    cardMeta,
    costOf,
  };
}

export const sideLabel = (side: Side) => (side === "blue" ? "Aliado" : "Inimigo");
