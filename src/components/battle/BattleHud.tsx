import { cn } from "@/lib/utils";
import type { BattleUnit, Card, Order, SideState } from "@/game/battle/types";

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

// Ícone por categoria: leitura instantânea da carta durante o combate.
const CATEGORY_ICON: Record<string, string> = {
  infantaria: "🪖",
  blindado: "🛡",
  artilharia: "🎯",
  defesa: "🏰",
  reconhecimento: "🛰",
  apoio: "✈",
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

export function CommandBar({ side, compact = false }: { side: SideState; compact?: boolean }) {
  const pct = (side.command / side.commandMax) * 100;
  return (
    <div className="flex items-center gap-3">
      <div className={compact ? "w-36 sm:w-52" : "w-40"}>
        <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Energia</span>
          <span className="text-primary">
            {Math.floor(side.command)} / {side.commandMax}
          </span>
        </div>
        <div className="h-2.5 w-full border border-border bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-100"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
      <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
        +{side.regen.toFixed(2)}/s
      </span>
    </div>
  );
}

interface HandBarProps {
  side: SideState;
  pendingCardId: string | null;
  costOf: (cardId: string) => number;
  cardMeta: (cardId: string) => Card;
  onPick: (cardId: string) => void;
  onHover: (card: Card | null) => void;
}

export function HandBar({ side, pendingCardId, costOf, cardMeta, onPick, onHover }: HandBarProps) {
  const queue = side.deck.queue.map((id) => cardMeta(id));
  return (
    <div className="flex items-stretch gap-3">
      <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1">
        {side.deck.hand.map((h) => {
          const card = cardMeta(h.cardId);
          const cost = costOf(h.cardId);
          const affordable = side.command >= cost;
          const selected = pendingCardId === h.cardId;
          return (
            <button
              key={h.cardId}
              onClick={() => onPick(h.cardId)}
              onMouseEnter={() => onHover(card)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                "relative flex min-w-[92px] flex-1 flex-col items-start justify-between gap-1 border bg-gradient-to-b to-transparent p-2 text-left transition sm:min-w-[120px]",
                CATEGORY_BG[card.category] ?? "from-card",
                selected
                  ? "-translate-y-1 border-primary shadow-brass"
                  : "border-border hover:border-primary/60",
                !affordable && "opacity-45",
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className="text-lg leading-none">{CATEGORY_ICON[card.category] ?? "★"}</span>
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center font-mono text-sm font-bold",
                    affordable
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {cost}
                </span>
              </span>
              <span className="font-display text-sm font-bold uppercase leading-none sm:text-base">
                {card.name}
              </span>
              <span
                className={cn(
                  "border px-1 font-mono text-[9px] uppercase tracking-wider",
                  CATEGORY_TONE[card.category] ?? "border-border",
                )}
              >
                {CATEGORY_LABEL[card.category] ?? card.category}
              </span>
              {selected && (
                <span className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-primary px-1 font-mono text-[8px] uppercase tracking-wider text-primary-foreground">
                  escolhida
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="hidden w-36 flex-col border-l border-border pl-3 md:flex">
        <p className="label-mono mb-1">Próximas</p>
        <div className="flex flex-wrap gap-1">
          {queue.map((c, i) => (
            <span
              key={`${c.id}-${i}`}
              className="flex items-center gap-1 border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              <span>{CATEGORY_ICON[c.category] ?? "★"}</span>
              {c.short}
            </span>
          ))}
        </div>
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
