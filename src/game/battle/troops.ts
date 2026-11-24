// EFETIVO E CONTRAPESOS — a guerra passa a ser medida em SOLDADOS, não em Sov.
//
// Regras (a mesma para os dois chanceleres, sem vantagem de partida):
//  1. Cada lado entra com o MESMO efetivo (500 soldados por padrão). Nada de economia
//     assimétrica na largada: quem decide é a escolha das cartas, não o recurso.
//  2. Enviar uma carta CUSTA soldados: a força da carta (squad) vezes o tamanho do
//     homem por categoria. Canhão custa mais gente que fuzileiro? Não — custa menos
//     HOMENS e mais material; o fuzileiro custa 10 homens por unidade.
//  3. CICLO DE CONTRAPESOS de seis pontas: cada categoria vence UMA e perde para UMA.
//     Canhão contra fuzileiro é vitória do canhão; canhão contra reconhecimento é
//     derrota. Nenhuma categoria é imbatível.
//  4. Território é POSIÇÃO, não direito: ele decide de onde você atira, não quantos
//     soldados você tem. O efetivo nunca cresce por conquista.
//  5. ASSINATURA: toda carta tem uma habilidade própria e um NEMESIS — a única carta
//     do ciclo capaz de derrubá-la com vantagem. Sem exceção, sem imunidade.

import type { Card, UnitCategory } from "./types";

// Efetivo inicial igual para os dois lados. 500 homens ≈ 10 pelotões completos.
export const TROOP_POOL = 500;

// Homens por unidade gerada. Infantaria é gente; blindado é tripulação pequena e
// material caro — por isso um tanque custa menos SOLDADOS e mais Sov.
export const MEN_PER_UNIT: Record<UnitCategory, number> = {
  infantaria: 10,
  blindado: 4,
  artilharia: 6,
  defesa: 5,
  reconhecimento: 4,
  apoio: 3,
};

// O ciclo, em ordem de "quem vence quem": cada categoria bate na próxima da lista e
// perde para a anterior. Com seis pontas, o ciclo fecha.
//   artilharia ▶ infantaria ▶ apoio ▶ defesa ▶ reconhecimento ▶ blindado ▶ artilharia
// O canhão arrasa o pelotão a céu aberto; o reconhecimento acha e mata a artilharia;
// o blindado atropela o apoio; e assim por diante, sem ponta solta.
export const COUNTER_RING: UnitCategory[] = [
  "artilharia",
  "infantaria",
  "apoio",
  "defesa",
  "reconhecimento",
  "blindado",
];

export const COUNTER_BONUS = 1.5;
export const COUNTER_PENALTY = 0.7;

// A categoria que esta vence (a seguinte no anel).
export function preyOf(category: UnitCategory): UnitCategory {
  const i = COUNTER_RING.indexOf(category);
  return COUNTER_RING[(i + 1) % COUNTER_RING.length]!;
}

// A categoria que vence esta (a anterior no anel). É o "predador" — o nemesis.
export function predatorOf(category: UnitCategory): UnitCategory {
  const i = COUNTER_RING.indexOf(category);
  return COUNTER_RING[(i + COUNTER_RING.length - 1) % COUNTER_RING.length]!;
}

// Multiplicador de dano do atirador contra a categoria do alvo.
export function counterMultiplier(
  attacker: UnitCategory | undefined,
  defender: UnitCategory | undefined,
): number {
  if (!attacker || !defender) return 1;
  if (attacker === defender) return 1;
  if (preyOf(attacker) === defender) return COUNTER_BONUS;
  if (predatorOf(attacker) === defender) return COUNTER_PENALTY;
  return 1;
}

// Homens que a carta coloca em campo (uma unidade gerada × tamanho do squad).
export function menFor(card: Card, units = 1): number {
  if (card.kind !== "militar") return 0;
  const per = MEN_PER_UNIT[card.category] ?? 10;
  return per * Math.max(1, units);
}

export interface Signature {
  // Nome da habilidade própria da carta.
  name: string;
  // O que ela faz, em uma linha (mostrado na ficha da carta).
  text: string;
  // Categoria que a derruba com vantagem — nunca ela mesma.
  weakTo: UnitCategory;
}

// Assinatura de cada carta: a habilidade que SÓ ela tem. Quando o catálogo já declara
// `ability`, ela é a assinatura; senão, a doutrina da carta (role) é a assinatura.
export function signatureOf(card: Card): Signature {
  const weakTo = predatorOf(card.category);
  const name = (card.ability ?? card.role).split(/[.;]/)[0]!.trim();
  const text =
    card.kind === "militar"
      ? `${card.role} — vence ${preyOf(card.category)}, perde para ${weakTo}.`
      : `${card.role} — apoio tático; não segura linha sozinho.`;
  return { name, text, weakTo };
}

// Efetivo é finito e igual para os dois: o que sobra de um lado é a conta que ele
// precisa fazer antes de enviar a próxima tropa.
export function troopFraction(troops: number, cap: number): number {
  if (!Number.isFinite(troops)) return 1;
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(1, troops / cap));
}
