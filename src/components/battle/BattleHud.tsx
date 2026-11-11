import { cn } from "@/lib/utils";
import type { BattleUnit, Card, Order, SideState, Structure } from "@/game/battle/types";

const CATEGORY_TONE: Record<string, string> = {
  infantaria: "border-fact text-fact",
  blindado: "border-primary text-primary",
  artilharia: "border-doc text-doc",
  defesa: "border-ally text-ally",
  reconhecimento: "border-ai text-ai",
  apoio: "border-fiction text-fiction",
};

const CATEGORY_LABEL: Record<string, string> = {
  infantaria: "Infantaria",
  blindado: "Blindado",
  artilharia: "Artilharia",
  defesa: "Defesa",
  reconhecimento: "Reconhecimento",
  apoio: "Apoio",
};

// Ícone por categoria: fallback quando a carta não tem ícone próprio (ver cardIcon).
const CATEGORY_ICON_FALLBACK: Record<string, string> = {
  infantaria: "🪖",
  blindado: "🛡️",
  artilharia: "🎯",
  defesa: "🏰",
  reconhecimento: "🛰️",
  apoio: "✈️",
};

// Cores por categoria para o fundo da carta (identidade visual).
const CATEGORY_BG: Record<string, string> = {
  infantaria: "from-fact/25",
  blindado: "from-primary/25",
  artilharia: "from-doc/25",
  defesa: "from-ally/25",
  reconhecimento: "from-ai/25",
  apoio: "from-fiction/25",
};

// Barra de Sov: recurso FINITO de guerra. Sem renda passiva — só bases avançadas
// pagam (lote a cada 45 s) e abates devolvem o valor do alvo + 50%. Quando zera e o
// lado não tem mais tropas nem renda, ele quebra e a guerra acaba.
export function CommandBar({
  side,
  compact = false,
  align = "left",
}: {
  side: SideState;
  compact?: boolean;
  align?: "left" | "right";
}) {
  const pct = (side.command / side.commandMax) * 100;
  const low = pct <= 20;
  const right = align === "right";
  return (
    <div className={cn("flex items-center gap-3", right && "flex-row-reverse")}>
      <div className={compact ? "w-36 sm:w-52" : "w-40"}>
        <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>{side.flag} Sov</span>
          <span className={cn("tabular-nums", low ? "text-destructive" : "text-primary")}>
            {Math.floor(side.command)} / {side.commandMax}
          </span>
        </div>
        <div className="h-2.5 w-full border border-border bg-muted">
          <div
            className={cn(
              "h-full transition-[width] duration-100",
              low ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
      {side.income > 0 && (
        <span className="hidden font-mono text-[10px] text-primary sm:inline">
          +{Math.round(side.income * 45)}/45s
        </span>
      )}
    </div>
  );
}

interface HandBarProps {
  side: SideState;
  /** Quantidade selecionada por carta (o "1 clique = +1 unidade" da operação). */
  counts: Record<string, number>;
  /** Sov já comprometido pela seleção atual (para o saldo restante). */
  spent: number;
  costOf: (cardId: string) => number;
  cardMeta: (cardId: string) => Card;
  onAdd: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onHover: (card: Card | null) => void;
}

// Teclas de atalho das cartas equipadas (PC). A carta na posição i usa KEYS[i]; a
// associação é FIXA na partida (o baralho não rotaciona), então a tecla nunca troca
// de carta no meio do combate.
export const CARD_KEYS = ["Z", "X", "C", "V", "B", "N", "M", "L"] as const;

export function HandBar({
  side,
  counts,
  spent,
  costOf,
  cardMeta,
  onAdd,
  onRemove,
  onHover,
}: HandBarProps) {
  const remaining = side.command - spent;
  return (
    <div className="flex items-stretch gap-2">
      <div className="grid flex-1 grid-cols-4 gap-1.5 sm:grid-cols-8">
        {side.deck.hand.map((h, slot) => {
          const card = cardMeta(h.cardId);
          const cost = costOf(h.cardId);
          const count = counts[h.cardId] ?? 0;
          const affordable = remaining >= cost;
          const ready = h.ready !== false;
          const readyIn = h.readyIn ?? 0;
          const key = CARD_KEYS[slot];
          return (
            <button
              // Posição FIXA por slot: o baralho é equipado antes da partida e NÃO
              // rotaciona — a carta nunca troca de lugar nem de tecla no combate.
              key={slot}
              disabled={!ready}
              onClick={() => onAdd(h.cardId)}
              onContextMenu={(e) => {
                e.preventDefault();
                onRemove(h.cardId);
              }}
              onMouseEnter={() => onHover(card)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                "relative flex min-w-0 flex-col items-start justify-between gap-0.5 overflow-hidden border bg-gradient-to-b to-transparent px-1.5 py-1 text-left transition",
                CATEGORY_BG[card.category] ?? "from-card",
                count > 0
                  ? "-translate-y-0.5 border-primary shadow-brass"
                  : "border-border hover:border-primary/60",
                (!affordable && count === 0) || !ready ? "opacity-45" : undefined,
              )}
            >
              {!ready && (
                // Recarga: a carta usada some por alguns segundos. A barra desce de
                // baixo para cima até liberar a carta de novo (posição nunca muda).
                <span
                  className="absolute inset-x-0 bottom-0 bg-foreground/25"
                  style={{ height: `${Math.min(100, readyIn * 12)}%` }}
                  aria-hidden
                />
              )}
              <span className="flex w-full items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <span className="hidden h-4 min-w-4 items-center justify-center border border-border px-0.5 font-mono text-[9px] font-bold text-muted-foreground sm:flex">
                    {key}
                  </span>
                  {count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center bg-primary px-1 font-mono text-[11px] font-black text-primary-foreground">
                      {count}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center font-mono text-[11px] font-bold",
                    affordable && ready
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {cost}
                </span>
              </span>
              <span className="line-clamp-1 font-display text-[11px] font-bold uppercase leading-tight">
                {card.name}
              </span>
              <span
                className={cn(
                  "border px-1 font-mono text-[8px] uppercase tracking-wider",
                  CATEGORY_TONE[card.category] ?? "border-border",
                )}
              >
                {!ready
                  ? `recarga ${readyIn.toFixed(0)}s`
                  : (CATEGORY_LABEL[card.category] ?? card.category)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function OrderBar({
  onOrder,
  hasSelection,
}: {
  onOrder: (o: Order) => void;
  hasSelection: boolean;
}) {
  const orders: { o: Order; label: string }[] = [
    { o: "avancar", label: "Avançar" },
    { o: "defender", label: "Defender" },
    { o: "manter", label: "Manter" },
    { o: "recuar", label: "Recuar" },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="label-mono">{hasSelection ? "Ordens da unidade" : "Ordens gerais"}</span>
      {orders.map((x) => (
        <button
          key={x.o}
          onClick={() => onOrder(x.o)}
          className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}

interface OperationBarProps {
  bases: Structure[];
  baseLabels: Record<string, number>;
  originId: string | null;
  onPickOrigin: (id: string) => void;
  totalUnits: number;
  spent: number;
  command: number;
  onClear: () => void;
}

// Barra de comando da OPERAÇÃO (mobile e PC): mostra a base de origem (toque ou tecla
// 1-6), o total de unidades selecionadas e o Sov comprometido. O ENVIO é automático:
// basta tocar no mapa, que a força marcha na hora — sem botão de confirmação.
export function OperationBar({
  bases,
  baseLabels,
  originId,
  onPickOrigin,
  totalUnits,
  spent,
  command,
  onClear,
}: OperationBarProps) {
  const active = totalUnits > 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label-mono shrink-0">Origem</span>
      <div className="flex flex-wrap gap-1">
        {bases.map((b) => {
          const n = baseLabels[b.id];
          const chosen = b.id === originId;
          return (
            <button
              key={b.id}
              onClick={() => onPickOrigin(b.id)}
              title={b.name}
              className={cn(
                "flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase transition",
                chosen
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <span className="font-bold">{n}</span>
              <span className="hidden max-w-24 truncate sm:inline">{b.name}</span>
            </button>
          );
        })}
      </div>

      <span className="ml-auto flex items-center gap-2">
        {active ? (
          <span className="animate-pulse border border-primary bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
            Toque no mapa para enviar · {totalUnits} un · {spent}/{Math.round(command)} sov
          </span>
        ) : (
          <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Escolha uma carta para montar a força
          </span>
        )}
        <button
          disabled={!active}
          onClick={onClear}
          className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground disabled:opacity-40"
        >
          Limpar
        </button>
      </span>
    </div>
  );
}

export function UnitInspector({ unit }: { unit: BattleUnit | null }) {
  if (!unit) {
    return (
      <div className="hud-panel hud-corners p-3">
        <p className="label-mono">Informações da unidade</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Selecione uma unidade no teatro para ver vida, alcance, velocidade e função.
        </p>
      </div>
    );
  }
  return (
    <div className="hud-panel hud-corners p-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold uppercase">{unit.name}</p>
        <span
          className={cn("border px-1 font-mono text-[9px] uppercase", CATEGORY_TONE[unit.category])}
        >
          {CATEGORY_LABEL[unit.category]}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
        <Row label="Vida" value={`${Math.round(unit.hp)} / ${unit.maxHp}`} />
        <Row label="Dano" value={Math.round(unit.dmg)} />
        <Row label="Alcance" value={unit.range} />
        <Row label="Velocidade" value={unit.speed.toFixed(1)} />
        <Row label="Alvos" value={unit.targets === "ambos" ? "Terra/Aéreo" : unit.targets} />
        <Row label="Ordem" value={unit.order} />
      </dl>
      <div className="mt-2 flex flex-wrap gap-1">
        {unit.smoke > 0 && <Tag>Fumaça</Tag>}
        {unit.jammed > 0 && <Tag tone="ai">Interferido</Tag>}
        {unit.revealed > 0 && <Tag tone="doc">Revelado</Tag>}
        {unit.engaged && <Tag tone="enemy">Em combate</Tag>}
      </div>
    </div>
  );
}

// Faixa compacta da unidade selecionada: cabe no dock (uma linha, sem rolagem) e
// NÃO cobre o teatro de operações. Substitui o antigo painel sobreposto à esquerda.
export function SelectedUnitStrip({ unit }: { unit: BattleUnit | null }) {
  if (!unit) return null;
  const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
  return (
    <div
      data-testid="selected-unit"
      className="flex items-center gap-2 border border-primary/50 bg-card/70 px-2 py-1 font-mono text-[10px] text-muted-foreground"
    >
      <span className="font-display text-xs font-bold uppercase text-foreground">{unit.name}</span>
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-16 border border-border bg-muted">
          <span
            className={cn(
              "block h-full",
              hpPct > 50 ? "bg-fact" : hpPct > 20 ? "bg-primary" : "bg-destructive",
            )}
            style={{ width: `${hpPct}%` }}
          />
        </span>
        <span className="tabular-nums">
          {Math.round(unit.hp)}/{unit.maxHp}
        </span>
      </span>
      <span className="hidden sm:inline">dano {Math.round(unit.dmg)}</span>
      <span className="hidden sm:inline">alc {unit.range}</span>
      <span className="uppercase">{unit.order}</span>
      {unit.engaged && <span className="text-enemy">em combate</span>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </>
  );
}

function Tag({
  children,
  tone = "fact",
}: {
  children: React.ReactNode;
  tone?: "fact" | "ai" | "doc" | "enemy";
}) {
  const cls = {
    fact: "border-fact text-fact",
    ai: "border-ai text-ai",
    doc: "border-doc text-doc",
    enemy: "border-enemy text-enemy",
  }[tone];
  return (
    <span className={cn("border px-1 font-mono text-[9px] uppercase tracking-wider", cls)}>
      {children}
    </span>
  );
}
