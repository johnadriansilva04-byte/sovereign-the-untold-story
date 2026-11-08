import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell } from "@/components/game/shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  allCards,
  cardById,
  cardLevelMultiplier,
  copiesToLevel,
  MAX_CARD_LEVEL,
} from "@/game/battle/catalog";
import {
  accessories,
  accessoryById,
  unlockTiers,
  type AccessoryDef,
} from "@/game/progress/catalog";
import { isCardUnlocked } from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";

type Tab = "cartas" | "acessorios" | "baralhos";

const CATEGORY_TONE: Record<string, string> = {
  infantaria: "border-fact text-fact",
  blindado: "border-primary text-primary",
  artilharia: "border-doc text-doc",
  defesa: "border-ally text-ally",
  reconhecimento: "border-ai text-ai",
  apoio: "border-fiction text-fiction",
};

export function CollectionScreen() {
  const { profile, saveDeck, setActiveDeck, levelUpCard } = useProfile();
  const [tab, setTab] = useState<Tab>("cartas");
  const [detailCard, setDetailCard] = useState<string | null>(null);
  const [detailAcc, setDetailAcc] = useState<string | null>(null);

  const ownedCards = allCards.filter((c) => (profile.inventory.cards[c.id] ?? 0) > 0);
  const ownedAcc = accessories.filter((a) => (profile.inventory.accessories[a.id] ?? 0) > 0);
  const lockedCards = allCards.filter((c) => !(profile.inventory.cards[c.id] ?? 0));
  const activeDeck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];

  const tierOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of unlockTiers) for (const id of t.cards) map.set(id, t.id);
    return map;
  }, []);

  const toggleAccessory = (accId: string) => {
    if (!activeDeck) return;
    const has = activeDeck.accessories.includes(accId);
    saveDeck({
      ...activeDeck,
      accessories: has
        ? activeDeck.accessories.filter((a) => a !== accId)
        : [...activeDeck.accessories, accId],
    });
  };

  const toggleDeckCard = (cardId: string) => {
    if (!activeDeck) return;
    const has = activeDeck.cards.includes(cardId);
    if (has) saveDeck({ ...activeDeck, cards: activeDeck.cards.filter((c) => c !== cardId) });
    else if (activeDeck.cards.length < 8)
      saveDeck({ ...activeDeck, cards: [...activeDeck.cards, cardId] });
  };

  return (
    <GameShell full>
      <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-7xl flex-col px-4 py-3">
        {/* Cabeçalho compacto — progresso e recursos numa linha, sem rolagem */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-2.5">
          <div>
            <p className="label-mono text-primary">Inventário · Soberania militar</p>
            <h1 className="font-display text-2xl font-black uppercase leading-none">Coleção</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["cartas", "acessorios", "baralhos"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition",
                  tab === t
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
            <span>
              CARTAS <b className="text-foreground">{ownedCards.length}</b>/{allCards.length}
            </span>
            <span>
              ACESSÓRIOS <b className="text-foreground">{ownedAcc.length}</b>/{accessories.length}
            </span>
            <span>
              SOVEREIGNS <b className="text-foreground">{profile.sovereigns}</b>
            </span>
          </div>
        </div>

        {/* Conteúdo — ocupa a altura restante; grades internas roláveis apenas se necessário */}
        <div className="mt-2.5 min-h-0 flex-1">
          {tab === "cartas" && (
            <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-3">
              <CardColumn
                title={`Operacionais (${ownedCards.length})`}
                cards={ownedCards}
                profile={profile}
                tierOf={tierOf}
                onOpen={setDetailCard}
                onLevelUp={levelUpCard}
              />
              <CardColumn
                title={`Em desbloqueio (${lockedCards.length})`}
                cards={lockedCards}
                profile={profile}
                tierOf={tierOf}
                onOpen={setDetailCard}
                onLevelUp={levelUpCard}
                locked
              />
              <div className="hud-panel hud-corners flex min-h-0 flex-col p-3">
                <p className="label-mono mb-2">Faixas de desbloqueio</p>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {unlockTiers.map((t) => {
                    const owned = t.cards.filter(
                      (c) => (profile.inventory.cards[c] ?? 0) > 0,
                    ).length;
                    return (
                      <div key={t.id} className="border-l-2 border-primary/50 pl-2.5">
                        <div className="flex items-center justify-between">
                          <p className="font-display text-xs font-bold uppercase">{t.name}</p>
                          <span className="font-mono text-[9px] text-muted-foreground">
                            nv {t.level} · {owned}/{t.cards.length}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{t.summary}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.cards.map((c) => {
                            const has = (profile.inventory.cards[c] ?? 0) > 0;
                            return (
                              <button
                                key={c}
                                onClick={() => setDetailCard(c)}
                                className={cn(
                                  "border px-1 font-mono text-[9px] uppercase transition",
                                  has
                                    ? "border-primary/60 text-foreground hover:bg-accent"
                                    : "border-border text-muted-foreground/70",
                                )}
                              >
                                {cardById(c)?.short ?? c}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === "acessorios" && (
            <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-2">
              <PanelList title={`Equipáveis (${ownedAcc.length})`}>
                {ownedAcc.map((a) => (
                  <AccessoryRow
                    key={a.id}
                    acc={a}
                    equipped={activeDeck?.accessories.includes(a.id) ?? false}
                    onToggle={() => toggleAccessory(a.id)}
                    onOpen={() => setDetailAcc(a.id)}
                  />
                ))}
              </PanelList>
              <PanelList title={`Ainda bloqueados (${accessories.length - ownedAcc.length})`}>
                {accessories
                  .filter((a) => !(profile.inventory.accessories[a.id] ?? 0))
                  .map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setDetailAcc(a.id)}
                      className="w-full border border-border/50 p-2.5 text-left opacity-60 transition hover:opacity-100"
                    >
                      <p className="font-display text-sm font-bold uppercase">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground">{a.effect}</p>
                    </button>
                  ))}
              </PanelList>
            </div>
          )}

          {tab === "baralhos" && activeDeck && (
            <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-2">
              <div className="hud-panel hud-corners flex min-h-0 flex-col p-3">
                <p className="label-mono mb-2">Baralho ativo · {activeDeck.cards.length}/8</p>
                <div className="grid min-h-0 flex-1 grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4">
                  {ownedCards.map((c) => {
                    const on = activeDeck.cards.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleDeckCard(c.id)}
                        className={cn(
                          "border p-1.5 text-left transition",
                          on ? "border-primary bg-accent" : "border-border hover:border-primary/50",
                        )}
                      >
                        <span
                          className={cn(
                            "border px-1 font-mono text-[8px] uppercase",
                            CATEGORY_TONE[c.category],
                          )}
                        >
                          {c.short}
                        </span>
                        <p className="mt-0.5 font-display text-[10px] font-bold uppercase leading-tight">
                          {c.name}
                        </p>
                        <p className="font-mono text-[9px] text-muted-foreground">
                          custo {c.cost} · nv {profile.cardLevels[c.id] ?? 1}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <PanelList title="Perfis de baralho">
                {profile.decks.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setActiveDeck(d.id)}
                    className={cn(
                      "w-full border p-2.5 text-left transition",
                      d.id === profile.activeDeckId
                        ? "border-primary bg-accent"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <p className="font-display text-sm font-bold uppercase">{d.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {d.cards.length} cartas · {d.accessories.length} acessórios
                    </p>
                  </button>
                ))}
              </PanelList>
            </div>
          )}
        </div>
      </div>

      {detailCard && (
        <CardDetailDialog
          cardId={detailCard}
          onClose={() => setDetailCard(null)}
          onLevelUp={levelUpCard}
        />
      )}
      {detailAcc && <AccessoryDialog accId={detailAcc} onClose={() => setDetailAcc(null)} />}
    </GameShell>
  );
}

type Profile = ReturnType<typeof useProfile>["profile"];

function CardColumn({
  title,
  cards,
  profile,
  tierOf,
  onOpen,
  onLevelUp,
  locked,
}: {
  title: string;
  cards: typeof allCards;
  profile: Profile;
  tierOf: Map<string, string>;
  onOpen: (id: string) => void;
  onLevelUp: (id: string) => boolean;
  locked?: boolean;
}) {
  return (
    <div className="hud-panel hud-corners flex min-h-0 flex-col p-3">
      <p className="label-mono mb-2">{title}</p>
      {locked && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Alcance a faixa de comandante e a tecnologia exigida para liberar.
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1.5 overflow-y-auto pr-1">
        {cards.map((c) => {
          const qty = profile.inventory.cards[c.id] ?? 0;
          const level = profile.cardLevels[c.id] ?? 1;
          const need = copiesToLevel(level);
          const canLevel = qty >= need && level < MAX_CARD_LEVEL;
          const unlocked = isCardUnlocked(profile, c.id);
          return (
            <div
              key={c.id}
              className={cn(
                "border p-1.5",
                locked && "border-border/50 opacity-60",
                !unlocked && !locked && "border-border/70",
              )}
            >
              <button onClick={() => onOpen(c.id)} className="w-full text-left">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "border px-1 font-mono text-[8px] uppercase",
                      CATEGORY_TONE[c.category],
                    )}
                  >
                    {c.short}
                  </span>
                  <span className="font-mono text-[9px] text-primary">nv {level}</span>
                </div>
                <p className="mt-0.5 font-display text-[10px] font-bold uppercase leading-tight">
                  {c.name}
                </p>
                <p className="font-mono text-[9px] text-muted-foreground">
                  custo {c.cost} · ×{qty}
                  {!unlocked && !locked ? ` · ${tierOf.get(c.id) ?? "tecnologia"}` : ""}
                </p>
              </button>
              {!locked && (
                <button
                  disabled={!canLevel}
                  onClick={() => onLevelUp(c.id)}
                  className={cn(
                    "mt-1 w-full border px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider transition",
                    canLevel
                      ? "border-primary text-primary hover:bg-accent"
                      : "border-border text-muted-foreground/60",
                  )}
                >
                  {level >= MAX_CARD_LEVEL ? "máx" : `evoluir · ${need} cópias`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PanelList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hud-panel hud-corners flex min-h-0 flex-col p-3">
      <p className="label-mono mb-2">{title}</p>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}

function CardDetailDialog({
  cardId,
  onClose,
  onLevelUp,
}: {
  cardId: string;
  onClose: () => void;
  onLevelUp: (id: string) => boolean;
}) {
  const { profile } = useProfile();
  const card = cardById(cardId);
  if (!card) return null;
  const level = profile.cardLevels[cardId] ?? 1;
  const qty = profile.inventory.cards[cardId] ?? 0;
  const need = copiesToLevel(level);
  const mult = cardLevelMultiplier(level);
  const military = card.kind === "militar" ? card : null;
  const support = card.kind === "apoio" ? card : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[86vh] max-w-2xl overflow-hidden border-primary/40 bg-background">
        <DialogHeader>
          <DialogTitle className="text-left">
            <span className="label-mono text-primary">
              {card.category} · nível {level}
            </span>
            <span className="mt-1 block font-display text-3xl font-black uppercase leading-none">
              {card.name}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <p className="text-sm text-muted-foreground">{card.role}</p>

          <div className="grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-4">
            <Info label="Custo" value={`${card.cost} energia`} />
            <Info label="Possuídas" value={`×${qty}`} />
            <Info label="Multiplicador" value={`×${mult.toFixed(2)}`} />
            <Info
              label="Evoluir"
              value={level >= MAX_CARD_LEVEL ? "nível máximo" : `${need} cópias`}
            />
            {military && (
              <>
                <Info label="Vida" value={`${Math.round(military.hp * mult)}`} />
                <Info label="Dano" value={`${Math.round(military.dmg * mult)}`} />
                <Info label="Alcance" value={`${military.range}`} />
                <Info label="Cadência" value={`${military.cooldown.toFixed(1)}s`} />
                <Info label="Velocidade" value={`${military.speed}`} />
                <Info label="Alvos" value={military.targets} />
                <Info label="Domínio" value={military.domain} />
                <Info label="Modelo" value={military.model} />
              </>
            )}
            {support && (
              <>
                <Info label="Habilidade" value={support.ability} />
                {support.magnitude !== undefined && (
                  <Info label="Magnitude" value={`${support.magnitude}`} />
                )}
                {support.radius !== undefined && <Info label="Raio" value={`${support.radius}`} />}
                {support.duration !== undefined && (
                  <Info label="Duração" value={`${support.duration}s`} />
                )}
              </>
            )}
          </div>

          {military?.priority && (
            <p className="font-mono text-[11px] text-muted-foreground">
              Prioridade de alvo: {military.priority.join(" › ")}
            </p>
          )}
          {card.unlocksTech && (
            <p className="font-mono text-[11px] text-doc">
              Requer tecnologia: {card.unlocksTech.join(", ")}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 border-t border-border pt-3">
          <button
            disabled={qty < need || level >= MAX_CARD_LEVEL}
            onClick={() => onLevelUp(cardId)}
            className="bg-primary px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
          >
            {level >= MAX_CARD_LEVEL ? "Nível máximo" : `Evoluir (${need} cópias)`}
          </button>
          <button
            onClick={onClose}
            className="border border-border px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccessoryDialog({ accId, onClose }: { accId: string; onClose: () => void }) {
  const acc = accessoryById(accId);
  if (!acc) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl border-primary/40 bg-background">
        <DialogHeader>
          <DialogTitle className="text-left">
            <span className="label-mono text-primary">Acessório · {acc.kind}</span>
            <span className="mt-1 block font-display text-2xl font-black uppercase leading-none">
              {acc.name}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{acc.summary}</p>
          <p className="border-l-2 border-primary pl-3 text-sm">{acc.effect}</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
            <Info label="Custo" value={`${acc.cost} Sovereigns`} />
            <Info label="Ajustes" value={Object.keys(acc.mod).join(", ") || "—"} />
          </div>
        </div>
        <div className="flex justify-end border-t border-border pt-3">
          <button
            onClick={onClose}
            className="border border-border px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccessoryRow({
  acc,
  equipped,
  onToggle,
  onOpen,
}: {
  acc: AccessoryDef;
  equipped: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "border p-2.5 transition",
        equipped ? "border-primary bg-accent" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button onClick={onOpen} className="flex-1 text-left">
          <p className="font-display text-sm font-bold uppercase">{acc.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{acc.effect}</p>
        </button>
        <button
          onClick={onToggle}
          className={cn(
            "shrink-0 border px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition",
            equipped
              ? "border-primary text-primary"
              : "border-border text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          {equipped ? "equipado" : "equipar"}
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

export { accessoryById, cardById };
