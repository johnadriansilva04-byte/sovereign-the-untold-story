import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GameButton } from "@/components/game/shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BattleArena } from "./BattleArena";
import { AiCommanderPanel, BattleLogPanel } from "./BattlePanels";
import { BattlePrep } from "./BattlePrep";
import { BattleJoystick } from "./BattleJoystick";
import { BattleResultScreen } from "./BattleResult";
import { BattleTopBar, ObjectiveStrip } from "./BattleTopBar";
import {
  CommandBar,
  CARD_KEYS,
  HandBar,
  OperationBar,
  OrderBar,
  SelectedUnitStrip,
} from "./BattleHud";
import { launchBases } from "@/game/battle/engine";
import {
  buildBattleConfig,
  chapterMission,
  chapterNumberForMission,
  consequencesOf,
  enemyScalingForChapter,
  missionById,
  type MissionDef,
} from "@/game/battle/missions";
import { useBattle } from "@/game/battle/useBattle";
import { useBattleAudio } from "@/game/battle/useBattleAudio";
import { isAudioMuted, primeAudio, setAudioMuted } from "@/game/battle/audio";
import type {
  BattleConfig,
  BattleResult,
  BattleState,
  Card,
  Commander,
  DeployTarget,
  Doctrine,
  Order,
  Side,
} from "@/game/battle/types";
import { modsFromAccessories, type Difficulty } from "@/game/progress/catalog";
import { activeAccessories, cardLevelsForDeck, type ProfileState } from "@/game/progress/profile";
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
    const chapterNumber = chapterNumberForMission(setup.mission.id) ?? 1;
    const scale = enemyScalingForChapter(chapterNumber);
    return buildBattleConfig({
      nation: profile.nation,
      mission: setup.mission,
      chapterNumber,
      deck: setup.deck,
      commander: setup.commander,
      doctrine: setup.doctrine,
      mods,
      cardLevels: cardLevelsForDeck(profile),
      aiDifficulty: scale.aiDifficulty,
      seed: hashSeed(`${setup.mission.id}:${setup.deck.join(",")}:${chapterNumber}`),
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
  // Som de combate ligado aos eventos REAIS do motor (explosão/impacto/disparo).
  const [soundOn, setSoundOn] = useState(() => !isAudioMuted());
  useBattleAudio(state, soundOn && !battle.paused);
  // Seleção da OPERAÇÃO: quantas unidades de cada carta (1 clique = +1). O envio é
  // em lote, de uma base escolhida para um destino clicado. Nada de mão rotativa.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [originId, setOriginId] = useState<string | null>(null);
  const [destination, setDestination] = useState<{
    x: number;
    y: number;
    target?: DeployTarget;
  } | null>(null);
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

  // Bases de lançamento aliadas (base principal + bases avançadas operacionais), na
  // ordem de conquista. A numeração 1-6 do HUD e das teclas segue esta lista.
  //
  // `state` é um objeto MUTÁVEL cuja referência nunca muda entre quadros: usar `state`
  // como dependência do useMemo congela a lista para sempre (as bases 2, 3… jamais
  // apareciam). A chave de memo é derivada do conteúdo que importa — quais bases de
  // lançamento existem e em que ordem — recalculada a cada render.
  const baseKey = state.structures
    .filter(
      (s) =>
        s.alive &&
        s.side === "blue" &&
        (s.kind === "base-principal" || (s.kind === "base-avancada" && !s.underConstruction)),
    )
    .map((s) => s.id)
    .join(",");
  const bases = useMemo(() => launchBases(state, "blue"), [baseKey]);
  const baseLabels = useMemo(() => {
    const labels: Record<string, number> = {};
    bases.forEach((b, i) => (labels[b.id] = i + 1));
    return labels;
  }, [bases]);

  const totalUnits = useMemo(() => Object.values(counts).reduce((a, n) => a + n, 0), [counts]);
  const spent = useMemo(
    () => Object.entries(counts).reduce((a, [id, n]) => a + battle.costOf(id) * n, 0),
    [counts, battle],
  );
  const operationActive = totalUnits > 0;

  const clearSelection = useCallback(() => {
    setCounts({});
    setDestination(null);
  }, []);

  const addCard = useCallback(
    (cardId: string) => {
      const cost = battle.costOf(cardId);
      if (state.blue.command - spent < cost) return;
      // Primeira carta da operação: a origem padrão é a base principal (nº 1).
      setOriginId((o) => o ?? bases[0]?.id ?? null);
      setCounts((cur) => ({ ...cur, [cardId]: (cur[cardId] ?? 0) + 1 }));
    },
    [battle, state.blue.command, spent, bases],
  );

  const removeCard = useCallback((cardId: string) => {
    setCounts((cur) => {
      const n = cur[cardId] ?? 0;
      if (n <= 1) {
        const { [cardId]: _drop, ...rest } = cur;
        return rest;
      }
      return { ...cur, [cardId]: n - 1 };
    });
  }, []);

  const handleSend = useCallback(
    (dest?: { x: number; y: number; target?: DeployTarget }) => {
      if (totalUnits === 0) return;
      const at = dest ?? destination;
      if (!at) {
        toast.error("Toque no mapa para definir o destino da tropa.");
        return;
      }
      const requests = Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([cardId, count]) => ({ cardId, count }));
      const res = battle.sendBatch(requests, at.x, at.y, originId ?? undefined, at.target);
      if (!res.ok) {
        toast.error(res.error ?? "Envio recusado.");
        return;
      }
      clearSelection();
    },
    [battle, counts, destination, originId, totalUnits, clearSelection],
  );

  // CHANCELER em campo (aliado): habilita o CONTROLE DIRETO (setas no PC, analógico no
  // celular). Sem ele em campo, não há volante para dirigir.
  const blueHero = state.blue.units.find((u) => u.hero && u.alive) ?? null;
  const drive = useCallback(
    (dx: number, dy: number) => {
      if (blueHero) battle.driveUnit(blueHero.id, dx, dy);
    },
    [battle, blueHero],
  );

  // Teclas direcionais seguradas viram um VETOR (permite diagonal). Ao soltar todas, o
  // vetor zera e o chanceler para. Recalculado a cada evento para refletir combinações.
  const heldKeys = useRef<Set<string>>(new Set());
  const applyKeys = useCallback(() => {
    const h = heldKeys.current;
    const dx = (h.has("ARROWRIGHT") ? 1 : 0) - (h.has("ARROWLEFT") ? 1 : 0);
    const dy = (h.has("ARROWDOWN") ? 1 : 0) - (h.has("ARROWUP") ? 1 : 0);
    drive(dx, dy);
  }, [drive]);

  // Atalhos de teclado (PC): Z X C V B N M somam uma unidade da carta; 1-6 escolhem a
  // base de origem; ENTER envia; ESC limpa; SETAS dirigem o chanceler. Os handlers
  // vivem em refs para o listener não ser re-registrado a cada frame da batalha.
  const keyRef = useRef({
    addCard,
    handleSend,
    clearSelection,
    bases,
    deck: state.blue.deck.hand,
    heldKeys,
    applyKeys,
  });
  keyRef.current = {
    addCard,
    handleSend,
    clearSelection,
    bases,
    deck: state.blue.deck.hand,
    heldKeys,
    applyKeys,
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const {
        addCard: add,
        handleSend: send,
        clearSelection: clear,
        bases: bs,
        deck,
      } = keyRef.current;
      const k = e.key.toUpperCase();
      const cardIdx = (CARD_KEYS as readonly string[]).indexOf(k);
      if (cardIdx >= 0) {
        const h = deck[cardIdx];
        if (h) {
          e.preventDefault();
          add(h.cardId);
        }
        return;
      }
      if (k >= "1" && k <= "6") {
        const b = bs[Number(k) - 1];
        if (b) {
          e.preventDefault();
          setOriginId(b.id);
        }
        return;
      }
      if (k === "ENTER") {
        e.preventDefault();
        send();
        return;
      }
      if (k === "ESCAPE") {
        clear();
        setSelectedUnitId(null);
        return;
      }
      if (k.startsWith("ARROW")) {
        e.preventDefault();
        keyRef.current.heldKeys.current.add(k);
        keyRef.current.applyKeys();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (k.startsWith("ARROW")) {
        keyRef.current.heldKeys.current.delete(k);
        keyRef.current.applyKeys();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handleMoveSelected = useCallback(
    (unitId: string, x: number, y: number, target?: DeployTarget) => {
      battle.moveSelected(unitId, x, y, target);
    },
    [battle],
  );

  // Clicar/tocar no mapa com cartas na mão = DEFINIR DESTINO E ENVIAR NA HORA. Sem
  // etapa de confirmação: o clique no campo já manda a tropa marchar (era o "clico no
  // mapa e não acontece nada / tenho que clicar em Enviar tropa").
  const handlePickDestination = useCallback(
    (x: number, y: number, target?: DeployTarget) => {
      const dest = { x, y, ...(target ? { target } : {}) };
      setDestination(dest);
      handleSend(dest);
    },
    [handleSend],
  );

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
          selectedUnitId={selectedUnitId}
          onSelectUnit={setSelectedUnitId}
          onMoveSelected={handleMoveSelected}
          operationActive={operationActive}
          baseLabels={baseLabels}
          originId={originId}
          destination={destination}
          onPickOrigin={setOriginId}
          onPickDestination={handlePickDestination}
        />

        {/* ANALÓGICO do chanceler: só aparece com o herói em campo. No PC as setas fazem
            o mesmo; no celular este disco é o volante. */}
        {blueHero && !operationActive && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10">
            <div className="pointer-events-auto">
              <BattleJoystick onChange={drive} />
            </div>
          </div>
        )}

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
      <div className="shrink-0 border-t border-border bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur">
        <div className="flex w-full flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <CommandBar side={state.blue} compact />
            <FrontLineScore state={state} />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowReport(true)}
                className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                Relatório
              </button>
              <GameButton
                variant="ghost"
                aria-label={soundOn ? "Desligar som" : "Ligar som"}
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  setAudioMuted(!next);
                  if (next) primeAudio();
                }}
              >
                {soundOn ? "🔊" : "🔇"}
              </GameButton>
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
                      "px-1.5 py-0.5 font-mono text-[10px] uppercase",
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
            counts={counts}
            spent={spent}
            costOf={battle.costOf}
            cardMeta={battle.cardMeta}
            onAdd={addCard}
            onRemove={removeCard}
            onHover={setHovered}
          />

          <OperationBar
            bases={bases}
            baseLabels={baseLabels}
            originId={originId}
            onPickOrigin={setOriginId}
            totalUnits={totalUnits}
            spent={spent}
            command={state.blue.command}
            onClear={clearSelection}
          />

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
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

// Estado do objetivo central: onde está cada chanceler. Traduz o `heroes` do motor em
// uma leitura direta — PRESO / EM CAMPO / MORTO — com a vida do nosso quando exposto.
function HeroObjective({ state }: { state: BattleState }) {
  const label = (side: Side) => {
    const h = state.heroes[side];
    if (h.state === "morto") return "morto";
    if (h.state === "preso") return "preso";
    if (h.state === "fugindo") return "fugindo";
    const unit = (side === "blue" ? state.blue : state.red).units.find(
      (u) => u.id === h.unitId && u.alive,
    );
    const pct = unit ? `${Math.round((unit.hp / unit.maxHp) * 100)}%` : "em campo";
    return h.state === "seguro" ? `${pct} seguro` : pct;
  };
  const tone = (side: Side) => {
    const h = state.heroes[side];
    if (h.state === "morto") return side === "blue" ? "text-enemy" : "text-ally";
    if (h.state === "preso" || h.state === "fugindo") return "text-primary";
    return "text-foreground";
  };
  return (
    <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <span aria-hidden>👤</span>
      Chanceler
      <span className={cn("tabular-nums", tone("blue"))}>{label("blue")}</span>
      <span className="text-border">×</span>
      <span className={cn("tabular-nums", tone("red"))}>{label("red")}</span>
    </span>
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
  // O CHANCELER só existe nas missões com cenário de herói (`heroSetup`). Sem ele, a
  // linha de chanceler não pode aparecer — senão o HUD anuncia "em campo" para os dois
  // lados numa partida que não tem chanceler nenhum.
  const hasHeroes = (state.config.heroSetup?.length ?? 0) > 0;
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
      {hasHeroes && (
        <>
          <span className="h-3 w-px bg-border" />
          <HeroObjective state={state} />
        </>
      )}
      <span className="h-3 w-px bg-border" />
      {/* Sov do adversário: a guerra de atrito é pública — o jogador precisa ver
          quanto recurso o inimigo ainda tem para decidir entre atacar e segurar. */}
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="text-enemy">{state.red.flag}</span>
        Sov
        <span
          className={cn(
            "tabular-nums",
            state.red.command <= state.red.commandMax * 0.2 ? "text-enemy" : "text-foreground",
          )}
        >
          {Math.floor(state.red.command)}
        </span>
      </span>
    </div>
  );
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
