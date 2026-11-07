import { useState } from "react";

import { cn } from "@/lib/utils";
import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { allCards, cardById } from "@/game/battle/catalog";
import { accessories, accessoryById, type AccessoryDef } from "@/game/progress/catalog";
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
  const { profile, saveDeck, setActiveDeck } = useProfile();
  const [tab, setTab] = useState<Tab>("cartas");

  const ownedCards = allCards.filter((c) => (profile.inventory.cards[c.id] ?? 0) > 0);
  const ownedAcc = accessories.filter((a) => (profile.inventory.accessories[a.id] ?? 0) > 0);
  const missingCards = allCards.filter((c) => !(profile.inventory.cards[c.id] ?? 0));
  const missingAcc = accessories.filter((a) => !(profile.inventory.accessories[a.id] ?? 0));

  const activeDeck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];

  const toggleAccessory = (accId: string) => {
    if (!activeDeck) return;
    const has = activeDeck.accessories.includes(accId);
    const accessoriesNext = has
      ? activeDeck.accessories.filter((a) => a !== accId)
      : [...activeDeck.accessories, accId];
    saveDeck({ ...activeDeck, accessories: accessoriesNext });
  };

  const toggleDeckCard = (cardId: string) => {
    if (!activeDeck) return;
    const has = activeDeck.cards.includes(cardId);
    if (has) {
      saveDeck({ ...activeDeck, cards: activeDeck.cards.filter((c) => c !== cardId) });
    } else if (activeDeck.cards.length < 8) {
      saveDeck({ ...activeDeck, cards: [...activeDeck.cards, cardId] });
    }
  };

  return (
    <GameShell>
      <PageTitle kicker="Inventário" title="Coleção">
        O que você conquistou na campanha é o que você leva para o PvP. Cada carta e cada acessório
        tem origem em uma vitória.
      </PageTitle>

      <div className="mb-5 flex flex-wrap gap-2">
        {(["cartas", "acessorios", "baralhos"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition",
              tab === t
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "cartas" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`Cartas possuídas (${ownedCards.length})`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ownedCards.map((c) => (
                <div key={c.id} className="border border-border p-2">
                  <span
                    className={cn(
                      "border px-1 font-mono text-[9px] uppercase",
                      CATEGORY_TONE[c.category],
                    )}
                  >
                    {c.short}
                  </span>
                  <p className="mt-1 font-display text-xs font-bold uppercase leading-tight">
                    {c.name}
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {c.category} · custo {c.cost} · ×{profile.inventory.cards[c.id]}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={`Ainda bloqueadas (${missingCards.length})`}>
            <p className="mb-3 text-xs text-muted-foreground">
              Conquiste nas batalhas da campanha para desbloquear.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {missingCards.map((c) => (
                <div key={c.id} className="border border-border/50 p-2 opacity-50">
                  <span className="border border-border px-1 font-mono text-[9px] uppercase text-muted-foreground">
                    {c.short}
                  </span>
                  <p className="mt-1 font-display text-xs font-bold uppercase leading-tight">
                    {c.name}
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {c.unlocksTech?.join(", ") ?? "campanha"}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === "acessorios" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`Acessórios (${ownedAcc.length})`}>
            <div className="space-y-2">
              {ownedAcc.map((a) => (
                <AccessoryRow
                  key={a.id}
                  acc={a}
                  equipped={activeDeck?.accessories.includes(a.id) ?? false}
                  onToggle={() => toggleAccessory(a.id)}
                />
              ))}
            </div>
          </Panel>
          <Panel title={`Ainda bloqueados (${missingAcc.length})`}>
            <div className="space-y-2">
              {missingAcc.map((a) => (
                <div key={a.id} className="border border-border/50 p-3 opacity-50">
                  <p className="font-display text-sm font-bold uppercase">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground">{a.effect}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === "baralhos" && activeDeck && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`Baralho ativo · ${activeDeck.cards.length}/8`}>
            <p className="mb-3 text-xs text-muted-foreground">
              Escolha as cartas que entram em campo. As 4 primeiras ficam na mão.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ownedCards.map((c) => {
                const on = activeDeck.cards.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleDeckCard(c.id)}
                    className={cn(
                      "border p-2 text-left transition",
                      on ? "border-primary bg-accent" : "border-border hover:border-primary/50",
                    )}
                  >
                    <p className="font-display text-[11px] font-bold uppercase leading-tight">
                      {c.name}
                    </p>
                    <p className="font-mono text-[9px] text-muted-foreground">custo {c.cost}</p>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              Acessórios equipados: {activeDeck.accessories.length}
            </p>
          </Panel>
          <Panel title="Perfis de baralho">
            <div className="space-y-2">
              {profile.decks.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setActiveDeck(d.id)}
                  className={cn(
                    "w-full border p-3 text-left transition",
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
            </div>
          </Panel>
        </div>
      )}
    </GameShell>
  );
}

function AccessoryRow({
  acc,
  equipped,
  onToggle,
}: {
  acc: AccessoryDef;
  equipped: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full border p-3 text-left transition",
        equipped ? "border-primary bg-accent" : "border-border hover:border-primary/50",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold uppercase">{acc.name}</p>
        <span
          className={cn(
            "font-mono text-[9px] uppercase",
            equipped ? "text-primary" : "text-muted-foreground",
          )}
        >
          {equipped ? "equipado" : "equipar"}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{acc.effect}</p>
      <p className="font-mono text-[10px] text-doc">{acc.summary}</p>
    </button>
  );
}

export { accessoryById, cardById };
