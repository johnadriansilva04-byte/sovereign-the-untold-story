import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GameButton } from "@/components/game/shell";
import { BattleArena } from "./BattleArena";
import { AiCommanderPanel, BattleLogPanel } from "./BattlePanels";
import { BattlePrep } from "./BattlePrep";
import { BattleResultScreen } from "./BattleResult";
import { BattleTopBar, ObjectiveStrip } from "./BattleTopBar";
import { CommandBar, HandBar, OrderBar, UnitInspector } from "./BattleHud";
import { cardById } from "@/game/battle/catalog";
import {
  buildBattleConfig,
  consequencesOf,
  missionById,
  type MissionDef,
} from "@/game/battle/missions";
import { useBattle } from "@/game/battle/useBattle";
import type {
  BattleConfig,
  BattleResult,
  Card,
  Commander,
  Doctrine,
  Order,
} from "@/game/battle/types";
import { difficultyById, modsFromAccessories, type Difficulty } from "@/game/progress/catalog";
import { activeAccessories, type ProfileState } from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";

type Phase = "preparacao" | "batalha" | "resultado";

interface Setup {
  mission: MissionDef;
  deck: string[];
  commander: Commander;
  doctrine: Doctrine;
  difficulty: Difficulty;
}

export interface BattleScreenProps {
  initialMissionId?: string | undefined;
  initialDifficulty?: Difficulty | undefined;
  /** Chamado quando a batalha termina (modo campanha). Devolve a recompensa concedida. */
  onComplete?: ((result: BattleResult, difficulty: Difficulty) => void) | undefined;
  /** Rótulo mostrado na tela de preparação ("Campanha", "Treino", "PvP"). */
  modeLabel?: string | undefined;
  /** Esconde o seletor de missão (modo PvP usa config própria). */
  hidePrep?: boolean | undefined;
  /** Configuração pronta (PvP). Quando presente, pula a preparação. */
  presetConfig?: BattleConfig | undefined;
  onExit?: (() => void) | undefined;
}

export function BattleScreen(props: BattleScreenProps) {
  const { profile, completeChapter } = useProfile();
  const [phase, setPhase] = useState<Phase>(props.presetConfig ? "batalha" : "preparacao");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [awarded, setAwarded] = useState(false);

  const config: BattleConfig | null = useMemo(() => {
    if (props.presetConfig) return props.presetConfig;
    if (!setup) return null;
    const mods = modsFromAccessories(activeAccessories(profile));
    return buildBattleConfig({
      nation: profile.nation,
      mission: setup.mission,
      deck: setup.deck,
      commander: setup.commander,
      doctrine: setup.doctrine,
      mods,
      aiDifficulty: toAiDifficulty(setup.difficulty),
      seed: hashSeed(`${setup.mission.id}:${setup.deck.join(",")}:${setup.difficulty}`),
    });
  }, [setup, props.presetConfig, profile]);

  const handleComplete = useCallback(
    (result: BattleResult) => {
      if (awarded) return;
      setAwarded(true);
      if (props.onComplete && setup) props.onComplete(result, setup.difficulty);
      else if (setup)
        completeChapter({
          chapterId: chapterIdFor(result.configId),
          result,
          difficulty: setup.difficulty,
        });
    },
    [awarded, props, setup, completeChapter],
  );

  if (phase === "preparacao" || !config) {
    return (
      <div className="space-y-4">
        {props.modeLabel && <p className="label-mono text-primary">Modo · {props.modeLabel}</p>}
        <BattlePrep
          profile={profile}
          initialMissionId={props.initialMissionId}
          initialDifficulty={props.initialDifficulty}
          onExit={props.onExit}
          onStart={(s) => {
            setSetup(s);
            setPhase("batalha");
          }}
        />
      </div>
    );
  }

  return (
    <LiveBattle
      key={`${config.id}-${config.seed}`}
      config={config}
      llmCommander={setup?.difficulty === "llm"}
      onComplete={handleComplete}
      onReplay={() => {
        setAwarded(false);
        setPhase("batalha");
      }}
      onNewMission={
        props.presetConfig
          ? undefined
          : () => {
              setSetup(null);
              setPhase("preparacao");
            }
      }
      onExit={props.onExit}
    />
  );
}

interface LiveProps {
  config: BattleConfig;
  llmCommander?: boolean;
  onComplete: (result: BattleResult) => void;
  onReplay: () => void;
  onNewMission?: (() => void) | undefined;
  onExit?: (() => void) | undefined;
}

export function LiveBattle({
  config,
  llmCommander,
  onComplete,
  onReplay,
  onNewMission,
  onExit,
}: LiveProps) {
  const battle = useBattle(config, { llmCommander });
  const { state, result } = battle;
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<Card | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (result && !completedRef.current) {
      completedRef.current = true;
      onComplete(result);
    }
  }, [result, onComplete]);

  const pendingCard = pendingCardId ? cardById(pendingCardId) : null;
  const pendingIsGlobal =
    pendingCard?.kind === "apoio" &&
    ["ataque_aereo", "fumaca", "interferencia", "reconhecimento"].includes(pendingCard.ability);

  const handlePlace = useCallback(
    (x: number, y: number) => {
      if (!pendingCardId) return;
      const res = battle.playCard(pendingCardId, x, y);
      if (!res.ok) {
        toast.error(res.error ?? "Ação recusada.");
        return;
      }
      setPendingCardId(null);
    },
    [battle, pendingCardId],
  );

  const handlePick = useCallback((cardId: string) => {
    setPendingCardId((cur) => (cur === cardId ? null : cardId));
  }, []);

  const handleOrder = useCallback(
    (order: Order) => {
      battle.issueOrder(order, selectedUnitId ?? undefined);
    },
    [battle, selectedUnitId],
  );

  const selectedUnit = state.blue.units.find((u) => u.id === selectedUnitId) ?? null;

  if (result) {
    return (
      <BattleResultScreen
        result={result}
        consequence={consequencesOf(result, missionById(config.id))}
        onReplay={onReplay}
        onNewMission={onNewMission}
        onReturnToMap={onExit ?? onNewMission ?? onReplay}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <BattleTopBar state={state} />
      <ObjectiveStrip state={state} />

      {battle.llmActive && (
        <p className="border-b border-ai/40 bg-ai/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ai">
          Comandante IA (LLM) ativo · o modelo decide em tempo real
        </p>
      )}

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <BattleArena
            state={state}
            pendingCardId={pendingCardId}
            pendingIsGlobal={Boolean(pendingIsGlobal)}
            selectedUnitId={selectedUnitId}
            onPlace={handlePlace}
            onSelectUnit={setSelectedUnitId}
            onSelectPoint={() => undefined}
          />

          <div className="hud-panel hud-corners space-y-3 p-3">
            <CommandBar side={state.blue} />
            <HandBar
              side={state.blue}
              pendingCardId={pendingCardId}
              costOf={battle.costOf}
              cardMeta={battle.cardMeta}
              onPick={handlePick}
              onHover={setHovered}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <OrderBar onOrder={handleOrder} hasSelection={Boolean(selectedUnitId)} />
              <div className="flex items-center gap-2">
                <GameButton variant="ghost" onClick={() => battle.setPaused(!battle.paused)}>
                  {battle.paused ? "Retomar" : "Pausar"}
                </GameButton>
                <div className="flex border border-border">
                  {[1, 2, 3].map((s) => (
                    <button
                      key={s}
                      onClick={() => battle.setSpeed(s)}
                      className={cn(
                        "px-2 py-1 font-mono text-[10px] uppercase",
                        battle.speed === s
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-primary",
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <UnitInspector unit={selectedUnit} />
          {hovered && <CardDetail card={hovered} cost={battle.costOf(hovered.id)} />}
          <AiCommanderPanel state={state} />
          <BattleLogPanel state={state} />
        </div>
      </div>
    </div>
  );
}

function CardDetail({ card, cost }: { card: Card; cost: number }) {
  return (
    <div className="hud-panel hud-corners p-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold uppercase">{card.name}</p>
        <span className="bg-primary px-2 font-mono text-xs font-bold text-primary-foreground">
          {cost}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{card.role}</p>
      {card.kind === "militar" && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
          <dt className="text-muted-foreground">Vida</dt>
          <dd className="text-right">{card.hp}</dd>
          <dt className="text-muted-foreground">Dano</dt>
          <dd className="text-right">{card.dmg}</dd>
          <dt className="text-muted-foreground">Alcance</dt>
          <dd className="text-right">{card.range}</dd>
          <dt className="text-muted-foreground">Velocidade</dt>
          <dd className="text-right">{card.speed}</dd>
          <dt className="text-muted-foreground">Alvos</dt>
          <dd className="text-right">{card.targets === "ambos" ? "Terra/Aéreo" : card.targets}</dd>
        </dl>
      )}
    </div>
  );
}

export function toAiDifficulty(d: Difficulty) {
  const def = difficultyById(d);
  return {
    intervalMult: def.aiIntervalMult,
    commandMult: def.aiCommandMult,
    reserveBonus: def.aiReserveBonus,
    isLlm: def.isLlm,
  };
}

function chapterIdFor(missionId: string): string {
  const idx = missionById(missionId);
  return missionToChapter[idx.id] ?? "c1";
}

const missionToChapter: Record<string, string> = {
  "m-apagao": "c1",
  "m-castello": "c2",
  "m-desfile": "c3",
  "m-trampolim": "c4",
  "m-petroleo": "c5",
  "m-torre": "c6",
  "m-curriculo": "c7",
  "m-camelot": "c8",
  "m-rua": "c9",
  "m-brothersam": "c10",
  "m-final": "c11",
};

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type { ProfileState };
