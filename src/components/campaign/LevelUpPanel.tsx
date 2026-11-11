import {
  allCards,
  cardArmorFraction,
  cardLevelMultiplier,
  cardSpeedMultiplier,
  unitsPerDeploy,
} from "@/game/battle/catalog";
import type { LevelUpInfo } from "@/game/progress/profile";

/**
 * Painel de promoção: mostra a carta que SUBIU DE NÍVEL com os atributos antes × depois.
 * É a página "viva" que o jogador vê ao vencer — progressão real (vida, dano, velocidade,
 * resistência e o marco de unidades por envio), não só um aviso.
 */
export function LevelUpPanel({ levelUps }: { levelUps: LevelUpInfo[] }) {
  if (levelUps.length === 0) return null;
  return (
    <div className="w-full space-y-2 border border-primary/60 bg-primary/5 p-4 text-left [@media(max-height:560px)]:p-2.5">
      <p className="label-mono text-primary">Promoção de campo · nível aumentado</p>
      {levelUps.map((u) => {
        const card = allCards.find((c) => c.id === u.cardId);
        if (!card) return null;
        const military = card.kind === "militar" ? card : null;
        const stat = (lvl: number) => ({
          hp: Math.round((military?.hp ?? 0) * cardLevelMultiplier(lvl)),
          dmg: Math.round((military?.dmg ?? 0) * cardLevelMultiplier(lvl)),
          speed: (military?.speed ?? 0) * cardSpeedMultiplier(lvl),
          armor: Math.round(cardArmorFraction(lvl) * 100),
        });
        const before = stat(u.from);
        const after = stat(u.to);
        return (
          <div key={u.cardId}>
            <div className="flex items-center justify-between">
              <p className="font-display text-sm font-bold uppercase leading-tight">{card.name}</p>
              <p className="font-mono text-xs text-primary">
                nv {u.from} → <b className="text-fact">nv {u.to}</b>
              </p>
            </div>
            {military && (
              <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-muted-foreground">
                <li>
                  Vida {before.hp} → <b className="text-foreground">{after.hp}</b>
                </li>
                <li>
                  Dano {before.dmg} → <b className="text-foreground">{after.dmg}</b>
                </li>
                <li>
                  Velocidade {before.speed.toFixed(1)} →{" "}
                  <b className="text-foreground">{after.speed.toFixed(1)}</b>
                </li>
                <li>
                  Resistência {before.armor}% → <b className="text-foreground">{after.armor}%</b>
                </li>
                {unitsPerDeploy(u.to) > unitsPerDeploy(u.from) && (
                  <li className="text-fact">
                    Unidades por envio: {unitsPerDeploy(u.from)} → {unitsPerDeploy(u.to)} (elite)
                  </li>
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
