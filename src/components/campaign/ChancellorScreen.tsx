import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { CampaignBackdrop } from "@/components/campaign/CampaignBackdrop";
import { ChancellorBust } from "@/components/battle/HeroCard";
import {
  CHANCELLOR_TRAITS,
  CHANCELLOR_UNIFORMS,
  defaultIdentity,
  traitById,
  uniformById,
  type ChancellorIdentity,
} from "@/game/battle/chancellor";
import {
  CHANCELLOR_GEAR,
  GEAR_SLOTS,
  TIER_NAME,
  chancellorLoadout,
  describeMods,
  equippedBySlot,
  type GearSlot,
} from "@/game/battle/chancellorGear";
import { chancellorIdentity } from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";

// TELA DO CHANCELER: duas funções no mesmo lugar — CRIAR o personagem (na entrada da
// campanha, antes da primeira operação) e equipá-lo depois. O retrato, o nome e o estilo
// ficam sempre visíveis à esquerda: é o rosto do jogador no campo.
export function ChancellorScreen({
  mode,
  onExit,
}: {
  mode: "create" | "armory";
  onExit: () => void;
}) {
  const { profile, setChancellor, toggleChancellorGear, buyChancellorGear } = useProfile();
  const initial = useMemo(() => chancellorIdentity(profile), [profile]);
  const [draft, setDraft] = useState<ChancellorIdentity>(() => ({
    ...initial,
    bio: profile.chancellor?.created ? initial.bio : "",
  }));
  const [slot, setSlot] = useState<GearSlot>("arma");
  // Na armaria o formulário começa recolhido: o foco é o equipamento; a identidade
  // continua a um clique ("Editar identidade").
  const [editing, setEditing] = useState(mode === "create");

  const created = Boolean(profile.chancellor?.created);
  const ownedGear = profile.chancellor?.ownedGear ?? [];
  const equipped = profile.chancellor?.equipped ?? [];
  const loadout = chancellorLoadout(draft, equipped);
  const uniform = uniformById(draft.uniformId);
  const trait = traitById(draft.traitId);

  const save = () => {
    setChancellor(draft);
    if (mode === "create" || created) onExit();
  };

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <CampaignBackdrop />
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="label-mono text-primary">
              {mode === "create" ? "Formação de comando" : "Chanceler em campo"}
            </p>
            <h1 className="font-display text-3xl font-black uppercase leading-none sm:text-4xl">
              {mode === "create" ? "Quem comanda é você" : "Seu chanceler"}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {mode === "create"
                ? "O chanceler é a única peça que decide a guerra: se ele cai, a operação está perdida. Escolha o nome, o uniforme e a forma de comandar."
                : "Case o equipamento com o seu jeito de jogar. Cada peça muda os atributos do chanceler de verdade."}
            </p>
          </div>
          {mode === "armory" && (
            <button
              onClick={onExit}
              className="border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              Voltar ao mapa
            </button>
          )}
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          {/* RETRATO / FICHA */}
          <aside className="hud-panel hud-corners flex flex-col gap-3 self-start p-3">
            <div className="flex items-center gap-3">
              <div className="shrink-0 border border-border/80">
                <ChancellorBust uniform={uniform.color} className="h-20 w-20" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-primary">
                  Seu chanceler
                </p>
                <p className="truncate font-display text-xl font-bold uppercase leading-tight">
                  {draft.name.trim() || "Sem nome"}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {trait.name} · {uniform.name}
                </p>
              </div>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {draft.bio || trait.bio}
            </p>

            <div className="border-t border-border/60 pt-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                Em campo
              </p>
              <ul className="mt-1 space-y-0.5">
                <Stat label="Arma" value={loadout.weaponName ?? "Fuzil de dotação"} />
                {Object.entries(loadout.mods).length === 0 ? (
                  <li className="font-mono text-[10px] uppercase text-muted-foreground">
                    Sem equipamento — o herói entra com a dotação básica.
                  </li>
                ) : (
                  describeMods(loadout.mods).map((line) => (
                    <li key={line} className="font-mono text-[10px] uppercase text-fact">
                      {line}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </aside>

          {/* FORMULÁRIO / ACERVO */}
          <div className="flex flex-col gap-4">
            {!editing && (
              <section className="hud-panel hud-corners flex flex-wrap items-center justify-between gap-2 p-3">
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Nome, uniforme e estilo de comando definem como o seu chanceler aparece no campo e
                  no relatório da operação.
                </p>
                <button
                  onClick={() => setEditing(true)}
                  className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  Editar identidade
                </button>
              </section>
            )}

            {editing && (
              <section className="hud-panel hud-corners flex flex-col gap-3 p-3">
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Nome de guerra
                </label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 22) })}
                  maxLength={22}
                  placeholder="Como a tropa vai te chamar"
                  className="w-full border border-border bg-background/70 px-3 py-2 font-display text-lg uppercase tracking-wide text-foreground outline-none focus:border-primary"
                />

                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Uniforme
                </p>
                <div className="flex flex-wrap gap-2">
                  {CHANCELLOR_UNIFORMS.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setDraft({ ...draft, uniformId: u.id })}
                      className={cn(
                        "flex items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                        draft.uniformId === u.id
                          ? "border-primary text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/60",
                      )}
                    >
                      <span
                        className="inline-block h-3 w-3 border border-black/40"
                        style={{ background: u.color }}
                      />
                      {u.name}
                    </button>
                  ))}
                </div>

                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Estilo de comando
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CHANCELLOR_TRAITS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          traitId: t.id,
                          bio: t.id === draft.traitId ? draft.bio : t.bio,
                        })
                      }
                      className={cn(
                        "border p-2 text-left transition",
                        draft.traitId === t.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/60",
                      )}
                    >
                      <p className="font-display text-sm font-bold uppercase">{t.name}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        {t.bio}
                      </p>
                    </button>
                  ))}
                </div>

                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Sua frase de comando (opcional)
                </label>
                <textarea
                  value={draft.bio}
                  onChange={(e) => setDraft({ ...draft, bio: e.target.value.slice(0, 160) })}
                  rows={2}
                  placeholder={trait.bio}
                  className="w-full resize-none border border-border bg-background/70 px-3 py-2 text-[12px] leading-snug text-foreground outline-none focus:border-primary"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={save}
                    disabled={!draft.name.trim()}
                    className="border border-primary bg-primary/15 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-primary transition hover:bg-primary/25 disabled:opacity-40"
                  >
                    {mode === "create" ? "Assumir o comando" : "Salvar chanceler"}
                  </button>
                  {mode === "armory" && (
                    <button
                      onClick={() => {
                        setDraft(initial);
                        setEditing(false);
                      }}
                      className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  )}
                  {mode === "create" && (
                    <button
                      onClick={() => {
                        setDraft(defaultIdentity());
                      }}
                      className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
                    >
                      Padrão
                    </button>
                  )}
                </div>
              </section>
            )}

            {created && (
              <GearSection
                slot={slot}
                onSlot={setSlot}
                owned={ownedGear}
                equipped={equipped}
                sovereigns={profile.sovereigns}
                onToggle={toggleChancellorGear}
                onBuy={buyChancellorGear}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-wider">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-foreground">{value}</span>
    </li>
  );
}

function GearSection({
  slot,
  onSlot,
  owned,
  equipped,
  sovereigns,
  onToggle,
  onBuy,
}: {
  slot: GearSlot;
  onSlot: (slot: GearSlot) => void;
  owned: string[];
  equipped: string[];
  sovereigns: number;
  onToggle: (gearId: string) => void;
  onBuy: (gearId: string) => void;
}) {
  const current = equippedBySlot(equipped);
  const items = CHANCELLOR_GEAR.filter((g) => g.slot === slot);
  const slotInfo = GEAR_SLOTS.find((s) => s.id === slot)!;

  return (
    <section className="hud-panel hud-corners flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            Armaria do chanceler
          </p>
          <p className="text-[11px] text-muted-foreground">{slotInfo.hint}</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Sovereigns <b className="text-foreground">{sovereigns}</b>
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {GEAR_SLOTS.map((s) => (
          <button
            key={s.id}
            onClick={() => onSlot(s.id)}
            className={cn(
              "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition",
              slot === s.id
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/60",
            )}
          >
            {s.name}
            {current[s.id] && <span className="ml-1 text-primary">●</span>}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-1.5">
        {items.map((gear) => {
          const has = owned.includes(gear.id);
          const isOn = equipped.includes(gear.id);
          return (
            <li
              key={gear.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1 border p-2",
                isOn ? "border-primary/70 bg-primary/10" : "border-border",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold uppercase leading-none">
                  {gear.name}
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {TIER_NAME[gear.tier]}
                  </span>
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{gear.desc}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase text-fact">
                  {describeMods(gear.mods).join(" · ")}
                </p>
              </div>
              <button
                onClick={() => (has ? onToggle(gear.id) : onBuy(gear.id))}
                disabled={!has && sovereigns < gear.cost}
                className={cn(
                  "shrink-0 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition",
                  isOn
                    ? "border-primary text-primary hover:bg-primary/10"
                    : has
                      ? "border-border text-foreground hover:border-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40",
                )}
              >
                {isOn ? "Equipado" : has ? "Equipar" : `Requisitar · ${gear.cost}`}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        Peças caem como prêmio de vitória; as que faltam podem ser requisitadas com Sovereigns.
      </p>
    </section>
  );
}
