import { cn } from "@/lib/utils";
import {
  cardArmorFraction,
  cardById,
  cardLevelMultiplier,
  cardSpeedMultiplier,
} from "@/game/battle/catalog";

const CATEGORY_TONE: Record<string, string> = {
  infantaria: "border-fact text-fact",
  blindado: "border-primary text-primary",
  artilharia: "border-doc text-doc",
  defesa: "border-ally text-ally",
  reconhecimento: "border-ai text-ai",
  apoio: "border-fiction text-fiction",
};

/** Carta em tamanho grande — usada nas telas de desbloqueio e de promoção. */
export function CardFace({ cardId, level }: { cardId: string; level: number }) {
  const card = cardById(cardId);
  const military = card.kind === "militar" ? card : null;
  const mult = cardLevelMultiplier(level);
  const stats = military
    ? [
        { label: "Vida", value: String(Math.round(military.hp * mult)) },
        { label: "Dano", value: String(Math.round(military.dmg * mult)) },
        { label: "Alcance", value: military.range.toFixed(0) },
        { label: "Velocidade", value: (military.speed * cardSpeedMultiplier(level)).toFixed(1) },
        { label: "Resistência", value: `${Math.round(cardArmorFraction(level) * 100)}%` },
      ]
    : [];

  return (
    <div
      className={cn(
        "animate-card-flip flex w-full max-w-xs flex-col gap-2 border-2 bg-card p-4 shadow-brass",
        CATEGORY_TONE[card.category] ?? "border-border text-foreground",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            CATEGORY_TONE[card.category] ?? "border-border",
          )}
        >
          {card.short}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          custo {card.cost}
        </span>
      </div>
      <p className="font-display text-2xl font-black uppercase leading-none">{card.name}</p>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Nível {level}</p>
      {stats.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/60 pt-2 font-mono text-[11px]">
          {stats.map((s) => (
            <div key={s.label} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd className="text-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.kind === "militar" && card.role && (
        <p className="font-serif text-xs italic leading-snug text-foreground/80">{card.role}</p>
      )}
    </div>
  );
}
