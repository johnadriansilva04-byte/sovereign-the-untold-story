import { cn } from "@/lib/utils";
import type { Decision, DecisionTag } from "@/game/progress/decisions";

const TAG_STYLE: Record<DecisionTag, string> = {
  ousado: "border-destructive/60 text-destructive",
  prudente: "border-fact/60 text-fact",
  técnico: "border-primary/60 text-primary",
  político: "border-accent-foreground/50 text-accent-foreground",
};

const TAG_LABEL: Record<DecisionTag, string> = {
  ousado: "Ousado",
  prudente: "Prudente",
  técnico: "Técnico",
  político: "Político",
};

// Dilema de comando: a escolha muda a doutrina e/ou os modificadores reais de combate.
// Uma tela só, sem rolagem: a decisão fica em pé no campo antes da batalha começar.
export function DecisionCard({
  chapterNumber,
  act,
  title,
  decision,
  selected,
  onChoose,
  onCancel,
}: {
  chapterNumber: number;
  act: string;
  title: string;
  decision: Decision;
  selected?: string | undefined;
  onChoose: (optionId: string) => void;
  onCancel?: () => void;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center gap-4 px-4 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="label-mono text-primary">
            {act} · Capítulo {chapterNumber}
          </p>
          <h1 className="font-display text-3xl font-black uppercase leading-none sm:text-4xl">
            {title}
          </h1>
        </div>
        <span className="hidden shrink-0 border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:block">
          Decisão de comando
        </span>
      </div>

      <p className="max-w-3xl font-serif text-base italic leading-snug text-foreground/90">
        {decision.prompt}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {decision.options.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onChoose(opt.id)}
              className={cn(
                "hud-panel hud-corners group flex flex-col items-start gap-3 p-5 text-left transition",
                active ? "border-primary" : "border-border hover:border-primary/70",
              )}
            >
              <span
                className={cn(
                  "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  TAG_STYLE[opt.tag],
                )}
              >
                {TAG_LABEL[opt.tag]}
              </span>
              <span className="font-display text-xl font-black uppercase leading-tight">
                {opt.label}
              </span>
              <span className="font-serif text-sm leading-snug text-foreground/80">{opt.text}</span>
              <EffectSummary option={opt} />
              <span
                className={cn(
                  "mt-1 w-full px-6 py-2.5 text-center font-mono text-xs uppercase tracking-[0.2em] transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-primary/50 text-primary group-hover:bg-primary/10",
                )}
              >
                {active ? "Escolhido" : "Escolher e partir"}
              </span>
            </button>
          );
        })}
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="mx-auto border border-border px-6 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
        >
          Voltar ao mapa
        </button>
      )}
    </div>
  );
}

// Traduz o efeito do motor para o jogador: doutrina e modificadores reais.
function EffectSummary({ option }: { option: Decision["options"][number] }) {
  const lines: string[] = [];
  const { doctrine, mods, research, sovereigns } = option.effect;
  if (doctrine) lines.push(`Doutrina: ${doctrine}`);
  const cat: Record<string, string> = {
    infantaria: "infantaria",
    blindado: "blindados",
    artilharia: "artilharia",
    defesa: "defesa",
    reconhecimento: "reconhecimento",
    apoio: "apoio",
  };
  const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  for (const [k, v] of Object.entries(mods?.hp ?? {}))
    lines.push(`${cat[k] ?? k}: ${pct(v)} de vida`);
  for (const [k, v] of Object.entries(mods?.dmg ?? {}))
    lines.push(`${cat[k] ?? k}: ${pct(v)} de dano`);
  for (const [k, v] of Object.entries(mods?.speed ?? {}))
    lines.push(`${cat[k] ?? k}: ${pct(v)} de velocidade`);
  if (mods?.capture) lines.push(`Captura de território: ${pct(mods.capture)}`);
  if (mods?.sight) lines.push(`Visão: ${pct(mods.sight)}`);
  if (mods?.commandMax) lines.push(`Energia máxima: +${mods.commandMax}`);
  if (research) lines.push(`+${research} pesquisa`);
  if (sovereigns) lines.push(`+${sovereigns} Sovereigns`);
  if (!lines.length) return null;
  return (
    <ul className="w-full space-y-0.5 border-t border-border/60 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
