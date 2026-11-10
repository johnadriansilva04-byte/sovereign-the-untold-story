import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GameButton } from "@/components/game/shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BattleArena } from "./BattleArena";
import { AiCommanderPanel, BattleLogPanel } from "./BattlePanels";
import { BattlePrep } from "./BattlePrep";
import { BattleResultScreen } from "./BattleResult";
import { BattleTopBar, ObjectiveStrip } from "./BattleTopBar";
import { CommandBar, HandBar, OrderBar, SelectedUnitStrip } from "./BattleHud";
import { cardById } from "@/game/battle/catalog";
import { GLOBAL_SUPPORT } from "@/game/battle/engine";
import {
  buildBattleConfig,
  chapterMission,
  consequencesOf,
  missionById,
  type MissionDef,
} from "@/game/battle/missions";
import { useBattle } from "@/game/battle/useBattle";
import type {
  BattleConfig,
  BattleResult,
  BattleState,
  Card,
  Commander,
  DeployTarget,
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
  // Cada nova tentativa ("Repetir operação") remonta a batalha viva com um novo id,
  // reiniciando estado/tempo. Sem isso o botão não fazia nada.
  const [runId, setRunId] = useState(0);

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

  // Dificuldade efetiva: no modo preparação vem do Setup; no modo campanha/PvP
  // (presetConfig) ela vive na própria config — antes `setup` era null e o
  // registro de conclusão nunca acontecia, travando o avanço da campanha.
  const effectiveDifficulty: Difficulty =
    setup?.difficulty ?? props.initialDifficulty ?? "veterano";

  const handleComplete = useCallback(
    (result: BattleResult) => {
      if (awarded) return;
      setAwarded(true);
      if (props.onComplete) props.onComplete(result, effectiveDifficulty);
      else
        completeChapter({
          chapterId: chapterIdFor(result.configId),
          result,
          difficulty: effectiveDifficulty,
        });
    },
    [awarded, props, effectiveDifficulty, completeChapter],
  );

  if (phase === "preparacao" || !config) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        {props.modeLabel && (
          <p className="shrink-0 label-mono text-primary">Modo · {props.modeLabel}</p>
        )}
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
      key={`${config.id}-${config.seed}-${runId}`}
      config={config}
      llmCommander={effectiveDifficulty === "llm"}
      onComplete={handleComplete}
      onReplay={() => {
        setAwarded(false);
        setRunId((n) => n + 1);
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
  const [showReport, setShowReport] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
  }, [config.id, config.seed]);

  useEffect(() => {
    if (result && !completedRef.current) {
      completedRef.current = true;
      onComplete(result);
    }
  }, [result, onComplete]);

  const pendingCard = pendingCardId ? cardById(pendingCardId) : null;
  const pendingIsGlobal =
    pendingCard?.kind === "apoio" && GLOBAL_SUPPORT.includes(pendingCard.ability);

  const handlePlace = useCallback(
    (x: number, y: number, target?: DeployTarget) => {
      if (!pendingCardId) return;
      const res = battle.playCard(pendingCardId, x, y, target);
      if (!res.ok) {
        toast.error(res.error ?? "Ação recusada.");
        return;
      }
      setPendingCardId(null);
    },
    [battle, pendingCardId],
  );

  const handleMoveSelected = useCallback(
    (unitId: string, x: number, y: number, target?: DeployTarget) => {
      battle.moveSelected(unitId, x, y, target);
    },
    [battle],
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Barra superior compacta: relógio, bandeiras e vida da base */}
      <div className="flex items-stretch">
        {onExit && (
          <button
            onClick={() => setConfirmExit(true)}
            aria-label="Abandonar operação"
            className="shrink-0 border-b border-r border-border bg-background/95 px-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-destructive"
          >
            ✕ Sair
          </button>
        )}
        <div className="min-w-0 flex-1">
          <BattleTopBar state={state} />
        </div>
      </div>

      {/* Diálogo de confirmação de saída */}
      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogContent className="max-w-sm border-destructive/40 bg-background">
          <DialogHeader>
            <DialogTitle className="text-left font-display uppercase">
              Abandonar a operação?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A partida em andamento será perdida e o progresso desta operação não será registrado.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <GameButton variant="ghost" onClick={() => setConfirmExit(false)}>
              Continuar lutando
            </GameButton>
            <GameButton onClick={onExit}>Abandonar</GameButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Teatro de operações: ocupa TODO o espaço restante, sem rolagem */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,oklch(0.2_0.02_120),oklch(0.12_0.01_120))]">
        <BattleArena
          state={state}
          pendingCardId={pendingCardId}
          pendingIsGlobal={Boolean(pendingIsGlobal)}
          selectedUnitId={selectedUnitId}
          onPlace={handlePlace}
          onSelectUnit={setSelectedUnitId}
          onMoveSelected={handleMoveSelected}
          onSelectPoint={() => undefined}
        />

        {/* Aviso de comandante LLM, sobreposto no topo do campo */}
        {battle.llmActive && (
          <p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 border border-ai/40 bg-background/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ai">
            Comandante IA (LLM) ativo
          </p>
        )}

        {/* Inspeção da unidade selecionada: agora é uma faixa no dock, abaixo do
            teatro — não sobrepõe o campo nem abre painel de texto sobre ele. */}

        {/* Relatório de batalha: log tático + leitura da IA, sob demanda */}
        <Dialog open={showReport} onOpenChange={setShowReport}>
          <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden border-primary/40 bg-background">
            <DialogHeader>
              <DialogTitle className="text-left">
                <span className="label-mono text-primary">Relatório de batalha</span>
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <ObjectiveStrip state={state} />
              <AiCommanderPanel state={state} />
              <BattleLogPanel state={state} />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dock de controle: relógio/pausa + energia + cartas + ordens, sem rolagem */}
      <div className="shrink-0 border-t border-border bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur">
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <CommandBar side={state.blue} compact />
            <FrontLineScore state={state} />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowReport(true)}
                className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                Relatório
              </button>
              <GameButton
                variant="ghost"
                aria-label={battle.paused ? "Retomar" : "Pausar"}
                onClick={() => battle.setPaused(!battle.paused)}
              >
                {battle.paused ? "▶" : "❚❚"}
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

          <HandBar
            side={state.blue}
            pendingCardId={pendingCardId}
            costOf={battle.costOf}
            cardMeta={battle.cardMeta}
            onPick={handlePick}
            onHover={setHovered}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <OrderBar onOrder={handleOrder} hasSelection={Boolean(selectedUnitId)} />
            {selectedUnit ? (
              <SelectedUnitStrip unit={selectedUnit} />
            ) : (
              hovered && (
                <span className="hidden font-mono text-[10px] text-muted-foreground sm:block">
                  {hovered.name} · {hovered.role}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Placar de frente: leitura instantânea de quem domina o campo, sem abrir o relatório.
function FrontLineScore({ state }: { state: BattleState }) {
  const terrBlue = state.territories.filter((t) => t.owner === "blue").length;
  const terrRed = state.territories.filter((t) => t.owner === "red").length;
  const advBlue = state.structures.filter(
    (s) => s.side === "blue" && s.kind === "base-avancada" && !s.underConstruction,
  ).length;
  const advRed = state.structures.filter(
    (s) => s.side === "red" && s.kind === "base-avancada" && !s.underConstruction,
  ).length;
  // Bases neutras do centro: quantas ainda faltam conquistar e o total da partida.
  const neutralBases = state.territories.filter((t) => t.base);
  const neutralLeft = neutralBases.filter((t) => t.owner === "neutro").length;
  const cell = (v: number, other: number, tone: "ally" | "enemy") => (
    <span
      className={cn(
        "tabular-nums",
        v > other ? (tone === "ally" ? "text-ally" : "text-enemy") : "text-muted-foreground",
      )}
    >
      {v}
    </span>
  );
  return (
    <div className="hidden items-center gap-3 border border-border bg-card/50 px-2 py-1 sm:flex">
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Território
        {cell(terrBlue, terrRed, "ally")}
        <span className="text-border">×</span>
        {cell(terrRed, terrBlue, "enemy")}
      </span>
      <span className="h-3 w-px bg-border" />
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Bases
        {cell(advBlue, advRed, "ally")}
        <span className="text-border">×</span>
        {cell(advRed, advBlue, "enemy")}
      </span>
      {neutralBases.length > 0 && (
        <>
          <span className="h-3 w-px bg-border" />
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Neutras a tomar
            <span
              className={cn("tabular-nums", neutralLeft === 0 ? "text-foreground" : "text-primary")}
            >
              {neutralLeft}
            </span>
            <span className="text-border">/{neutralBases.length}</span>
          </span>
        </>
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
  return missionToChapter[missionById(missionId).id] ?? "c1";
}

const missionToChapter: Record<string, string> = Object.fromEntries(
  Object.entries(chapterMission).map(([chapter, mission]) => [mission, chapter]),
);

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type { ProfileState };
