// Geometria do teatro de operações.
//
// O mundo é um RETÂNGULO largo: o eixo X é a linha de progressão (o azul avança
// da esquerda para a direita) e o eixo Y é a largura do front (flanco norte/sul).
// Manter as dimensões num único lugar garante que motor, IA e renderizador usem
// exatamente os mesmos limites — nenhum clampa coordenada por conta própria.

export const WORLD_W = 210;
/**
 * Profundidade do front (largura norte→sul). Subir este valor deixa o campo mais
 * FUNDO, com mais espaço de manobra entre as duas bases — não é só estética: o motor
 * usa o mesmo limite para movimento, alcance e captura. A razão WORLD_W:WORLD_H foi
 * escolhida como MEIO-TERMO entre a tela do celular (em retrato o campo é girado, e
 * quanto mais alto ele for, menos faixa morta sobra nas laterais) e o desktop (onde o
 * palco é largo e raso): nenhuma das duas orientações fica com o campo pequeno.
 */
export const WORLD_H = 130;

/**
 * BEIRADA do teatro: faixa de borda (em unidades de mundo) que fica FORA da área de
 * manobra. O conteúdo do catálogo é mapeado para dentro dela, então as bases nunca
 * encostam na parede — há respiro entre a base e a borda do mapa.
 */
export const FIELD_MARGIN_X = 8;
export const FIELD_MARGIN_Y = 6;

/**
 * Dimensões do espaço de PROJETO em que as arenas do catálogo foram escritas (100×46).
 * O catálogo mantém os números originais e `spreadX`/`deepenY` os reescalam para a área
 * ÚTIL do mundo atual (dentro das beiradas) — assim aumentar `WORLD_W`/`WORLD_H` não
 * exige reescrever à mão cada coordenada das arenas. Os RAIOS não são reescalados:
 * territórios e estruturas seguem círculos.
 */
export const DESIGN_W = 100;
export const DESIGN_H = 46;

/** Largura útil do campo (área de manobra, dentro das beiradas). */
export const FIELD_W = WORLD_W - 2 * FIELD_MARGIN_X;
/** Profundidade útil do campo (área de manobra, dentro das beiradas). */
export const FIELD_H = WORLD_H - 2 * FIELD_MARGIN_Y;

/** Reescala uma coordenada X do projeto (0..100) para a área útil do mundo. */
export function spreadX(x: number): number {
  return FIELD_MARGIN_X + (x * FIELD_W) / DESIGN_W;
}

/** Reescala uma coordenada Y do projeto (0..46) para a área útil do mundo. */
export function deepenY(y: number): number {
  return FIELD_MARGIN_Y + (y * FIELD_H) / DESIGN_H;
}

/** Limites de posicionamento de uma unidade (a beirada é intransponível). */
export const WORLD_X_MIN = FIELD_MARGIN_X;
export const WORLD_X_MAX = WORLD_W - FIELD_MARGIN_X;
export const WORLD_Y_MIN = FIELD_MARGIN_Y;
export const WORLD_Y_MAX = WORLD_H - FIELD_MARGIN_Y;

/** Ponto de partida padrão de cada lado quando não há base no mapa (azul: oeste). */
export const HOME_POINT: Record<"blue" | "red", { x: number; y: number }> = {
  blue: { x: spreadX(8), y: WORLD_H / 2 },
  red: { x: spreadX(92), y: WORLD_H / 2 },
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
// Câmera do teatro (vista de cima, alinhada)
// ---------------------------------------------------------------------------
//
// O campo é um RETÂNGULO largo: o eixo X é a linha de progressão (o azul avança da
// esquerda para a direita) e o eixo Y é a largura do front. A câmera encaixa esse
// retângulo no palco SEM DEFORMAR (escala uniforme) e, quando o palco é mais alto que
// largo (celular em pé), GIRA o campo 90° para ele ficar "de pé" — o azul embaixo, o
// vermelho em cima, como numa mesa de guerra vertical.
//
// A câmera é uma transformação AFIM, então pode ser aplicada como uma matriz do SVG e
// invertida analiticamente para o toque. Nada de `perspective`/`rotateX` em CSS: aquele
// caminho era frágil (uma vírgula errada na `transform` fazia o navegador descartá-la
// inteira e o campo ser esticado para caber) e o `getScreenCTM` mentia sob 3D.

export type FieldOrientation = "landscape" | "portrait";

/** O campo fica "de pé" quando o palco é mais alto que largo (celular em pé). */
export function orientationFor(w: number, h: number): FieldOrientation {
  return h > w ? "portrait" : "landscape";
}

/** Matriz afim no formato do SVG: `matrix(a b c d e f)` → x' = a·x + c·y + e, y' = b·x + d·y + f. */
export interface Camera {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  orientation: FieldOrientation;
}

/** Escala (px de palco por unidade de mundo) de uma câmera uniforme. */
export function cameraScale(cam: Camera): number {
  return Math.hypot(cam.a, cam.b);
}

/**
 * Câmera que encaixa o campo num palco `w`×`h`, CENTRADO e com escala uniforme (sem
 * esticar). Em retrato o campo é girado −90° (azul embaixo, vermelho em cima); a
 * rotação é própria (determinante positivo), então nada fica espelhado.
 */
export function cameraFor(w: number, h: number): Camera {
  const orient = orientationFor(w, h);
  if (orient === "portrait") {
    // Depois do giro o campo ocupa WORLD_H de largura × WORLD_W de altura.
    const s = Math.min(w / WORLD_H, h / WORLD_W);
    return {
      a: 0,
      b: -s,
      c: s,
      d: 0,
      e: (w - s * WORLD_H) / 2,
      f: (h + s * WORLD_W) / 2,
      orientation: orient,
    };
  }
  const s = Math.min(w / WORLD_W, h / WORLD_H);
  return {
    a: s,
    b: 0,
    c: 0,
    d: s,
    e: (w - s * WORLD_W) / 2,
    f: (h - s * WORLD_H) / 2,
    orientation: orient,
  };
}

/** Mundo → palco (px de layout). */
export function worldToStage(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: cam.a * wx + cam.c * wy + cam.e, y: cam.b * wx + cam.d * wy + cam.f };
}

/** Palco (px de layout) → mundo. Inverso exato de `worldToStage`. */
export function stageToWorld(cam: Camera, px: number, py: number): { x: number; y: number } {
  const det = cam.a * cam.d - cam.b * cam.c;
  const dx = px - cam.e;
  const dy = py - cam.f;
  return {
    x: (cam.d * dx - cam.c * dy) / det,
    y: (-cam.b * dx + cam.a * dy) / det,
  };
}

/**
 * Compatibilidade: ponto do mundo → pixel de tela relativo ao palco `w`×`h`.
 * Mantido porque testes e a pré-visualização calculam posições por aqui.
 */
export function worldToScreen(
  wx: number,
  wy: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return worldToStage(cameraFor(w, h), wx, wy);
}

/** Compatibilidade: pixel de tela relativo ao palco `w`×`h` → coordenada do mundo. */
export function screenToWorld(
  px: number,
  py: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return stageToWorld(cameraFor(w, h), px, py);
}

/**
 * Transformação local para um rótulo de texto ficar EM PÉ dentro do grupo da cena.
 * Em retrato a cena está girada −90°, então cada texto recebe +90° em volta do próprio
 * ponto; em paisagem nada é aplicado (retorna `undefined`).
 */
export function uprightText(portrait: boolean, x: number, y: number): string | undefined {
  return portrait ? `rotate(90 ${x} ${y})` : undefined;
}
