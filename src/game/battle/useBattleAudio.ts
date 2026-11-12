import { useEffect, useRef } from "react";

import type { BattleState } from "./types";
import { playExplosion, playImpact, playLaunch, playShot } from "./audio";

// Liga o ÁUDIO aos eventos REAIS do motor. A cada render, compara os efeitos e projéteis
// com os já vistos e toca o som correspondente:
//  - explosão  → estrondo dimensionado pelo RAIO real do efeito;
//  - impacto   → estalo seco;
//  - disparo (muzzle) → estalo leve, amostrado (nem todo tiro vira som, para não virar
//    zumbido com dezenas de unidades atirando);
//  - míssil/foguete lançado → sopro de lançamento.
// A comparação por id evita repetir o som de um efeito que continua vivo por vários
// quadros. O mudo e o limite de taxa ficam no módulo de áudio.
export function useBattleAudio(state: BattleState, enabled: boolean): void {
  const seenFx = useRef<Set<string>>(new Set());
  const seenProj = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    const fxIds = new Set<string>();
    for (const e of state.effects) {
      fxIds.add(e.id);
      if (seenFx.current.has(e.id)) continue;
      if (e.kind === "explosion") playExplosion(Math.min(1, Math.max(0.2, e.radius / 12)));
      else if (e.kind === "impact") playImpact();
      else if (e.kind === "muzzle" && Math.random() < 0.25) playShot(0.3);
    }
    seenFx.current = fxIds;

    const projIds = new Set<string>();
    for (const p of state.projectiles) {
      projIds.add(p.id);
      if (seenProj.current.has(p.id)) continue;
      if (p.kind === "missile" || p.kind === "rocket") playLaunch();
    }
    seenProj.current = projIds;
  });
}
