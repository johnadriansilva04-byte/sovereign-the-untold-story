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
// Câmera do teatro (perspectiva de cima, alinhada)
// ---------------------------------------------------------------------------
//
// O campo é visto de cima com uma leve inclinação para trás: as duas metades
// ficam ALINHADAS (azul à esquerda, vermelho à direita), a borda do fundo recua
// e a da frente fica mais próxima — profundidade de mesa de guerra, sem o giro
// em diagonal que entortava o tabuleiro. É PURAMENTE apresentação: motor, IA,
// rotas e captura seguem nas coordenadas do mundo. O mapeamento toque→mundo
// desfaz a projeção analiticamente (o `getScreenCTM` mente sob perspectiva 3D).

/** Inclinação da câmera (graus): quanto o fundo do campo recua. */
export const FIELD_PITCH_DEG = 12;
/** Distância do observador (px CSS): menor = mais profundidade. */
export const FIELD_PERSPECTIVE = 2800;
/**
 * Escala padrão (usada quando não se conhece o tamanho do teatro — p.ex. nos testes).
 * Em produção o componente usa `fieldScalesFor(w, h)`, que faz o campo PREENCHER a
 * área útil sem cortar nenhuma borda.
 */
export const FIELD_SCALE = 0.95;

const PITCH_COS = Math.cos((FIELD_PITCH_DEG * Math.PI) / 180);
const PITCH_SIN = Math.sin((FIELD_PITCH_DEG * Math.PI) / 180);

export interface FieldScales {
  sx: number;
  sy: number;
}

/**
 * Escalas (x e y) que fazem o campo preencher um teatro de `w`×`h` px de layout.
 * A borda FRONTAL é a mais próxima do observador: depois da projeção ela é a mais
 * larga E a mais alta (o `denom` é menor lá), então é ela que limita as duas escalas
 * — por isso as duas dividem por `spread`. Sem isso o campo vira um tabuleiro pequeno
 * flutuando no centro, e sem o `spread` a borda frontal estoura a tela.
 */
export function fieldScalesFor(w: number, h: number): FieldScales {
  const spread = 1 / (1 - ((h / 2) * PITCH_SIN) / FIELD_PERSPECTIVE);
  return { sx: 0.98 / spread, sy: 0.98 / (PITCH_COS * spread) };
}

/**
 * Ponto do mundo → pixel de tela, relativo ao canto superior esquerdo do teatro.
 * `w`/`h` são o tamanho de layout (não transformado) do teatro.
 */
export function worldToScreen(
  wx: number,
  wy: number,
  w: number,
  h: number,
  scales: FieldScales = { sx: FIELD_SCALE, sy: FIELD_SCALE },
): { x: number; y: number } {
  const lx = (wx / WORLD_W) * w - w / 2;
  const ly = (wy / WORLD_H) * h - h / 2;
  const denom = 1 - (ly * PITCH_SIN) / FIELD_PERSPECTIVE;
  return {
    x: w / 2 + (scales.sx * lx) / denom,
    y: h / 2 + (scales.sy * ly * PITCH_COS) / denom,
  };
}

/** Pixel de tela (relativo ao teatro) → coordenada do mundo. Inverso exato de `worldToScreen`. */
export function screenToWorld(
  px: number,
  py: number,
  w: number,
  h: number,
  scales: FieldScales = { sx: FIELD_SCALE, sy: FIELD_SCALE },
): { x: number; y: number } {
  const x1 = (px - w / 2) / scales.sx;
  const y1 = (py - h / 2) / scales.sy;
  const ly = y1 / (PITCH_COS + (y1 * PITCH_SIN) / FIELD_PERSPECTIVE);
  const lx = x1 * (1 - (ly * PITCH_SIN) / FIELD_PERSPECTIVE);
  return { x: ((lx + w / 2) / w) * WORLD_W, y: ((ly + h / 2) / h) * WORLD_H };
}
