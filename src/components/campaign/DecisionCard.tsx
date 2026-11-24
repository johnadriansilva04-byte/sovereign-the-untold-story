import { cn } from "@/lib/utils";
import type { Decision, DecisionTag } from "@/game/progress/decisions";

const TAG_STYLE: Record<DecisionTag, string> = {
  ousado: "border-destructive/60 text-destructive",
  prudente: "border-fact/60 text-fact",
  técnico: "border-primary/60 text-primary",
  político: "border-accent-foreground/50 text-accent-foreground",
};

const TAG_BAR: Record<DecisionTag, string> = {
  ousado: "bg-destructive",
  prudente: "bg-fact",
  técnico: "bg-primary",
  político: "bg-accent-foreground",
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
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center gap-4 px-4 py-4 [@media(max-height:560px)]:gap-1 [@media(max-height:560px)]:py-1">
      {/* O cabeçalho fica sobre a arte do fundo: o painel escuro garante leitura. */}
      <div className="border border-border bg-background/80 p-3 backdrop-blur-sm [@media(max-height:560px)]:p-2">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="label-mono text-primary">
              {act} · Capítulo {chapterNumber}
            </p>
            <h1 className="font-display text-3xl font-black uppercase leading-none sm:text-4xl [@media(max-height:560px)]:text-xl">
              {title}
            </h1>
          </div>
          <span className="hidden shrink-0 border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:block">
            Decisão de comando
          </span>
        </div>

        <p className="mt-2 max-w-3xl font-serif text-base italic leading-snug text-foreground/90 [@media(max-height:560px)]:mt-1 [@media(max-height:560px)]:text-xs">
          {decision.prompt}
        </p>
      </div>

      <div className="grid min-h-0 gap-3 sm:grid-cols-2 [@media(max-height:560px)]:grid-cols-2 [@media(max-height:560px)]:gap-1.5">
        {decision.options.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onChoose(opt.id)}
              aria-pressed={active}
              className={cn(
                "group relative flex min-h-0 flex-1 flex-col overflow-hidden border bg-background/85 p-4 text-left backdrop-blur-sm transition [@media(max-height:560px)]:p-2.5",
                active
                  ? "border-primary shadow-brass"
                  : "border-border hover:border-primary/70 hover:bg-background",
              )}
            >
              {/* Faixa lateral na cor do tipo de decisão: o jogador lê o tempero antes do texto. */}
              <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 w-[3px]", TAG_BAR[opt.tag] ?? "bg-border")}
              />
              <span className="flex items-center justify-between gap-2 pl-2">
                <span
                  className={cn(
                    "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                    TAG_STYLE[opt.tag],
                  )}
                >
                  {TAG_LABEL[opt.tag]}
                </span>
                {active && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
                    Escolhido
                  </span>
                )}
              </span>
              <span className="mt-2 pl-2 font-display text-2xl font-black uppercase leading-none [@media(max-height:560px)]:text-lg">
                {opt.label}
              </span>
              <span className="mt-1.5 pl-2 font-serif text-sm leading-snug text-foreground/80 [@media(max-height:560px)]:hidden">
                {opt.text}
              </span>
              <EffectSummary option={opt} />
              <span
                className={cn(
                  "mt-auto flex items-center justify-between gap-2 border-t pl-2 pt-2 font-mono text-[11px] uppercase tracking-[0.18em] transition [@media(max-height:560px)]:pt-1 [@media(max-height:560px)]:text-[10px]",
                  active
                    ? "border-primary/50 text-primary"
                    : "border-border/60 text-muted-foreground",
                )}
              >
                {active ? "Decisão tomada" : "Escolher esta opção"}
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center border text-[12px] transition",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-primary/50 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
                  )}
                >
                  →
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="mx-auto border border-border bg-background/80 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground backdrop-blur-sm transition hover:text-foreground [@media(max-height:560px)]:py-1"
        >
          Voltar ao mapa
        </button>
      )}
    </div>
  );
}

// Traduz o efeito do motor para o jogador: doutrina e modificadores reais, em linhas
// de "rótulo → valor" para a leitura ser imediata em vez de uma lista corrida.
function EffectSummary({ option }: { option: Decision["options"][number] }) {
  const rows: { label: string; value: string }[] = [];
  const { doctrine, mods, research, sovereigns } = option.effect;
  if (doctrine) rows.push({ label: "Doutrina", value: doctrine });
  const cat: Record<string, string> = {
    infantaria: "Infantaria",
    blindado: "Blindados",
    artilharia: "Artilharia",
    defesa: "Defesa",
    reconhecimento: "Reconhecimento",
    apoio: "Apoio",
  };
  const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  for (const [k, v] of Object.entries(mods?.hp ?? {}))
    rows.push({ label: `${cat[k] ?? k} · vida`, value: pct(v) });
  for (const [k, v] of Object.entries(mods?.dmg ?? {}))
    rows.push({ label: `${cat[k] ?? k} · dano`, value: pct(v) });
  for (const [k, v] of Object.entries(mods?.speed ?? {}))
    rows.push({ label: `${cat[k] ?? k} · velocidade`, value: pct(v) });
  if (mods?.capture) rows.push({ label: "Captura de território", value: pct(mods.capture) });
  if (mods?.sight) rows.push({ label: "Visão", value: pct(mods.sight) });
  if (mods?.commandMax) rows.push({ label: "Energia máxima", value: `+${mods.commandMax}` });
  if (research) rows.push({ label: "Pesquisa", value: `+${research}` });
  if (sovereigns) rows.push({ label: "Sovereigns", value: `+${sovereigns}` });
  if (!rows.length) return null;
  return (
    <dl className="mt-2 w-full space-y-0.5 border-t border-border/60 pl-2 pt-2 font-mono text-[10px] uppercase tracking-wider">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="text-right font-bold text-fact">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
