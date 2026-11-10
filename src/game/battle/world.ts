// Geometria do teatro de operações.
//
// O mundo é um RETÂNGULO largo: o eixo X é a linha de progressão (o azul avança
// da esquerda para a direita) e o eixo Y é a largura do front (flanco norte/sul).
// Manter as dimensões num único lugar garante que motor, IA e renderizador usem
// exatamente os mesmos limites — nenhum clampa coordenada por conta própria.

export const WORLD_W = 100;
export const WORLD_H = 46;

/** Limites de posicionamento de uma unidade (margem de 1 unidade nas bordas). */
export const WORLD_X_MIN = 1;
export const WORLD_X_MAX = WORLD_W - 1;
export const WORLD_Y_MIN = 1;
export const WORLD_Y_MAX = WORLD_H - 1;

/** Ponto de partida padrão de cada lado quando não há base no mapa (azul: oeste). */
export const HOME_POINT: Record<"blue" | "red", { x: number; y: number }> = {
  blue: { x: 9, y: WORLD_H / 2 },
  red: { x: WORLD_W - 9, y: WORLD_H / 2 },
};

/** Ângulo de mira inicial: o azul encara o leste (+x), o vermelho o oeste (−x). */
export const HOME_AIM: Record<"blue" | "red", number> = {
  blue: 0,
  red: Math.PI,
};

export function clampX(v: number): number {
  return Math.max(WORLD_X_MIN, Math.min(WORLD_X_MAX, v));
}

export function clampY(v: number): number {
  return Math.max(WORLD_Y_MIN, Math.min(WORLD_Y_MAX, v));
}

// ---------------------------------------------------------------------------
// Campo DIAGONAL (câmera superior inclinada)
// ---------------------------------------------------------------------------
//
// O teatro é apresentado em diagonal, como uma câmera levemente girada sobre o
// campo. A inclinação é PURAMENTE visual: o motor, a IA, as rotas e a captura
// continuam usando as coordenadas do mundo (X = progressão, Y = front). O
// renderizador aplica a rotação ao desenhar e o mapeamento de toque aplica a
// rotação inversa — assim o que o jogador toca é exatamente o ponto do mundo.

/** Rotação do campo, em graus, em torno do centro do teatro (negativo = sobe à direita). */
export const FIELD_TILT_DEG = -8;

const FIELD_CX = WORLD_W / 2;
const FIELD_CY = WORLD_H / 2;

/** `transform` SVG que inclina o teatro em diagonal (usar no grupo do campo). */
export function fieldTransform(): string {
  return `rotate(${FIELD_TILT_DEG} ${FIELD_CX} ${FIELD_CY})`;
}

/**
 * Caixa que envolve o teatro JÁ inclinado. Usada como `viewBox` do SVG para que a
 * rotação não corte os cantos do campo: o tabuleiro aparece inteiro sobre o fundo.
 */
export function fieldBounds(): { x: number; y: number; w: number; h: number } {
  const corners: [number, number][] = [
    [0, 0],
    [WORLD_W, 0],
    [0, WORLD_H],
    [WORLD_W, WORLD_H],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [wx, wy] of corners) {
    const f = fieldFromWorld(wx, wy);
    minX = Math.min(minX, f.x);
    maxX = Math.max(maxX, f.x);
    minY = Math.min(minY, f.y);
    maxY = Math.max(maxY, f.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** `viewBox` do SVG do teatro, cobrindo o campo inclinado sem cortar cantos. */
export function fieldViewBox(): string {
  const b = fieldBounds();
  return `${b.x} ${b.y} ${b.w} ${b.h}`;
}

/** Converte um ponto do desenho inclinado de volta para coordenadas do mundo. */
export function worldFromField(lx: number, ly: number): { x: number; y: number } {
  const a = (-FIELD_TILT_DEG * Math.PI) / 180;
  const dx = lx - FIELD_CX;
  const dy = ly - FIELD_CY;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: FIELD_CX + dx * cos - dy * sin, y: FIELD_CY + dx * sin + dy * cos };
}

/** Converte coordenadas do mundo para o ponto correspondente no desenho inclinado. */
export function fieldFromWorld(wx: number, wy: number): { x: number; y: number } {
  const a = (FIELD_TILT_DEG * Math.PI) / 180;
  const dx = wx - FIELD_CX;
  const dy = wy - FIELD_CY;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: FIELD_CX + dx * cos - dy * sin, y: FIELD_CY + dx * sin + dy * cos };
}
