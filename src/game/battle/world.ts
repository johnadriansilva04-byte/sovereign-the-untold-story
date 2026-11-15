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

/**
 * Inclinação do teatro: o campo é uma MESA vista de cima e de frente, com o eixo de
 * progressão (mundo X, azul→vermelho) descendo na diagonal e o front (mundo Y) entrando
 * na profundidade. A câmera gira o plano no sentido HORÁRIO (mundo +x vira ↘ na tela,
 * mundo +y vira ↗) e depois deita a mesa com uma rotação 3D em torno do eixo horizontal.
 * O ângulo é uma MATRIZ (o SVG não tem 3D): `cameraMatrix3d` o converte para `matrix3d`.
 */
export const TILT_DEG = 60;
/**
 * Em retrato o campo é posto DE PÉ (girado −90°), então a mesa fica PLANA — sem
 * inclinação. Inclinar aqui só achataria o eixo vertical e a mesa deixaria de ser
 * vertical. `tilt = 0` mantém o tabuleiro em pé, ocupando a altura do celular.
 */
export const TILT_DEG_PORTRAIT = 0;

/** Giro no plano da mesa (graus). Em paisagem a linha azul→vermelha desce em diagonal
 * (base azul na ponta inferior esquerda, vermelha na superior direita); em retrato o campo
 * gira −90° para ficar DE PÉ — azul embaixo, vermelho em cima —, vertical como numa mesa de
 * guerra, preenchendo a altura do celular sem sobrar faixa morta nas laterais. */
export const ROTATE_DEG_LANDSCAPE = -41;
export const ROTATE_DEG_PORTRAIT = -90;

/** Escala (px de palco por unidade de mundo) da câmera plana, antes da inclinação. */
export function cameraScale(cam: Camera): number {
  return Math.hypot(cam.a, cam.b);
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
  /** Giro no plano (graus) — já embutido em `a`..`f`; guardado para endireitar rótulos. */
  rotateDeg: number;
  /** Inclinação da mesa (graus) — o giro no plano já está embutido em `a`..`f`. */
  tiltDeg: number;
  /** Centro do palco: pivô da inclinação (mesmo `transform-origin` do SVG). */
  originX: number;
  originY: number;
}

/**
 * Converte a câmera numa matriz `matrix3d` do CSS, aplicada ao próprio `svg` com
 * `transform-origin` no centro do palco. O giro no plano já está embutido na afim `A`
 * (`a`..`f`); aqui só entra a inclinação `P · Rx(−tilt) · A`, que deita a mesa em torno do
 * eixo horizontal do palco. Como o `matrix3d` é aplicado em torno do MESMO centro
 * (`originX`/`originY`), a composição fecha exatamente com `projectPoint` (usado no toque).
 */
export function cameraMatrix3d(cam: Camera, w: number, h: number): string {
  const t = (cam.tiltDeg * Math.PI) / 180;
  const ct = Math.cos(t);
  const st = Math.sin(t);
  const cy = h / 2;
  // Aplicado com `transform-origin: 0 0`: a matriz é a transformação COMPLETA
  // `translate(cx cy) · Rx(−tilt) · translate(−cx −cy) · A`, com a afim `A` em `a`..`f`.
  const ty = ct * cam.f + cy * (1 - ct);
  const tz = -st * cam.f + st * cy;
  const f = (v: number) => Number(v.toFixed(6));
  return [
    "matrix3d(",
    [
      f(cam.a),
      f(cam.b * ct),
      f(-cam.b * st),
      "0",
      f(cam.c),
      f(cam.d * ct),
      f(-cam.d * st),
      "0",
      // 3ª coluna = imagem do eixo z por Rx. A cena é plana (z=0), então esta coluna não
      // muda a projeção — mas mantém a matriz INVERTÍVEL. Com ela zerada o navegador
      // descarta a `matrix3d` e a arena some.
      "0",
      f(-st),
      f(ct),
      "0",
      f(cam.e),
      f(ty),
      f(tz),
      "1",
    ].join(","),
    ")",
  ].join("");
}

/**
 * Câmera que encaixa o campo num palco `w`×`h`, CENTRADO e com escala uniforme (sem
 * esticar). Em retrato o campo é girado −90° (azul embaixo, vermelho em cima); a
 * rotação é própria (determinante positivo), então nada fica espelhado.
 */
export function cameraFor(w: number, h: number): Camera {
  const orient = orientationFor(w, h);
  // Giro no plano: em paisagem a progressão (mundo X) desce na diagonal para a direita,
  // pondo a base aliada na ponta INFERIOR esquerda e a inimiga na ponta SUPERIOR direita;
  // em retrato (celular em pé) o campo é girado quase de pé para preencher a tela alta,
  // mantendo a leitura em diagonal.
  const rotateDeg = orient === "portrait" ? ROTATE_DEG_PORTRAIT : ROTATE_DEG_LANDSCAPE;
  const tiltDeg = orient === "portrait" ? TILT_DEG_PORTRAIT : TILT_DEG;
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ct = Math.cos((tiltDeg * Math.PI) / 180);
  const cx = w / 2;
  const cy = h / 2;
  // Escala-base unitária: a matriz afim mapeia o campo centrado na origem do palco.
  // `s` é resolvido depois, medindo a projeção REAL (inclinação inclusa).
  const affine = (s: number) => ({
    a: s * cos,
    b: s * sin,
    c: -s * sin,
    d: s * cos,
    e: cx - (s * cos * (WORLD_W / 2) - s * sin * (WORLD_H / 2)),
    f: cy - (s * sin * (WORLD_W / 2) + s * cos * (WORLD_H / 2)),
  });
  const build = (s: number): Camera => {
    const m = affine(s);
    return {
      ...m,
      orientation: orient,
      rotateDeg,
      tiltDeg,
      originX: cx,
      originY: cy,
    };
  };
  // Mede a projeção dos 4 cantos com escala 1 e resolve `s` para a mesa ocupar o palco.
  const unit = build(1);
  const corners: Array<[number, number]> = [
    [0, 0],
    [WORLD_W, 0],
    [0, WORLD_H],
    [WORLD_W, WORLD_H],
  ];
  const proj = corners.map(([x, y]) => projectPoint(unit, x, y));
  const bw = Math.max(...proj.map((p) => p.x)) - Math.min(...proj.map((p) => p.x));
  const bh = Math.max(...proj.map((p) => p.y)) - Math.min(...proj.map((p) => p.y));
  // Encaixe com pequena folga: a mesa cobre o palco de fora a fora sem cortar os cantos.
  const s = Math.min(w / bw, h / bh) * 0.94;
  return build(s);
}

/**
 * Projeta um ponto do MUNDO no palco com a câmera inclinada (mesma conta que o
 * `matrix3d` do SVG faz, em 2D). Usada pelo toque e pela camada de rótulos sobreposta.
 */
export function projectPoint(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  const px = cam.a * wx + cam.c * wy + cam.e;
  const py = cam.b * wx + cam.d * wy + cam.f;
  const ct = Math.cos((cam.tiltDeg * Math.PI) / 180);
  return { x: px, y: ct * py + cam.originY * (1 - ct) };
}

/** Inverso exato de `projectPoint`: palco (px de layout) → mundo. */
export function unprojectPoint(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  const ct = Math.cos((cam.tiltDeg * Math.PI) / 180);
  const px = sx;
  const py = (sy - cam.originY * (1 - ct)) / ct;
  const det = cam.a * cam.d - cam.b * cam.c;
  const dx = px - cam.e;
  const dy = py - cam.f;
  return {
    x: (cam.d * dx - cam.c * dy) / det,
    y: (-cam.b * dx + cam.a * dy) / det,
  };
}

/** Mundo → palco (px de layout). */
export function worldToStage(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return projectPoint(cam, wx, wy);
}

/** Palco (px de layout) → mundo. Inverso exato de `worldToStage`. */
export function stageToWorld(cam: Camera, px: number, py: number): { x: number; y: number } {
  return unprojectPoint(cam, px, py);
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
 * Transformação local para um rótulo de texto ficar EM PÉ (e sem achatamento) dentro do
 * grupo da cena inclinada. Desfaz o giro no plano da câmera e estica o eixo vertical por
 * `1/cos(tilt)` para anular o encurtamento da perspectiva — assim o texto lê como se
 * estivesse numa camada de tela, sem virar de lado nem ficar "pisado".
 */
export function uprightText(
  cam: Pick<Camera, "rotateDeg" | "tiltDeg"> | undefined,
  x: number,
  y: number,
): string | undefined {
  if (!cam) return undefined;
  const ct = Math.cos((cam.tiltDeg * Math.PI) / 180);
  if (ct <= 0.001) return undefined;
  const inv = 1 / ct;
  return `translate(${x} ${y}) rotate(${-cam.rotateDeg}) scale(1 ${inv}) translate(${-x} ${-y})`;
}
