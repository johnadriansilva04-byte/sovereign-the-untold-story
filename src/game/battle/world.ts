// Geometria do teatro de operações.
//
// O mundo é um RETÂNGULO largo: o eixo X é a linha de progressão (o azul avança
// da esquerda para a direita) e o eixo Y é a largura do front (flanco norte/sul).
// Manter as dimensões num único lugar garante que motor, IA e renderizador usem
// exatamente os mesmos limites — nenhum clampa coordenada por conta própria.

export const WORLD_W = 210;
/**
 * Profundidade do front (norte→sul). Subir este valor deixa o campo mais FUNDO, com
 * mais espaço de manobra entre as duas bases — não é só estética: o motor usa o mesmo
 * limite para movimento, alcance e captura (a simulação lê este número diretamente).
 *
 * Este valor SUBIU de 130 para 190: o antigo retângulo 210×130 projetava uma faixa larga
 * e baixa, deixando uma área vazia embaixo do palco. Como o encaixe é uniforme (nunca
 * estica), a única forma de ocupar a altura disponível SEM aumentar o painel é aumentar
 * o TERRITÓRIO representado — mais profundidade de manobra dentro do mesmo retângulo
 * externo. As bases ficam na DIAGONAL (aliada a noroeste, inimiga a sudeste), o que
 * aproveita a profundidade extra.
 */
export const WORLD_H = 190;

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

/**
 * Ponto de partida padrão de cada lado quando não há base no mapa. Fica na MESMA diagonal
 * das bases principais: aliado no canto superior esquerdo (noroeste), inimigo no canto
 * inferior direito (sudeste). É o "lar" de último recurso do motor (IA e motor usam quando
 * uma arena não traz base), então precisa espelhar a disposição real do campo.
 */
export const HOME_POINT: Record<"blue" | "red", { x: number; y: number }> = {
  blue: { x: spreadX(12), y: deepenY(9) },
  red: { x: spreadX(88), y: deepenY(37) },
};

/** Ângulo de mira inicial: cada lado encara o outro na diagonal (aliado a sudeste, inimigo
 *  a noroeste). Calculado a partir dos dois pontos-base para não repetir a conta. */
export const HOME_AIM: Record<"blue" | "red", number> = {
  blue: Math.atan2(HOME_POINT.red.y - HOME_POINT.blue.y, HOME_POINT.red.x - HOME_POINT.blue.x),
  red: Math.atan2(HOME_POINT.blue.y - HOME_POINT.red.y, HOME_POINT.blue.x - HOME_POINT.red.x),
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

/**
 * O campo é LARGO (o eixo de progressão, azul→vermelho, corre da ESQUERDA para a DIREITA),
 * então o encaixe é sempre DEITADO, em qualquer aparelho — inclusive no celular em pé. O que
 * muda entre os dois é só a INCLINAÇÃO da mesa: no palco alto uma inclinação grande espremeria
 * o campo numa faixa estreita, então o retrato usa menos inclinação. Não há giro de 90°.
 */
export function orientationFor(w: number, h: number): FieldOrientation {
  return h > w ? "portrait" : "landscape";
}

/**
 * Giro no plano da mesa (graus). Fica em ZERO: com o campo LARGO (WORLD_W ≫ WORLD_H), girar
 * a mesa transformava o retângulo num DIAMANTE que só preenchia ~40% do palco, deixando as
 * pontas vazias. Sem giro, o retângulo encaixa de frente e preenche ~84% da área — o
 * território efetivamente representado cresce dentro do MESMO painel. A diagonal entre as
 * bases (aliada a noroeste, inimiga a sudeste) vem da POSIÇÃO delas no mapa, não da câmera.
 */
export const ROTATE_DEG = 0;

/** No CELULAR em pé o campo fica RETO, da esquerda para a direita (giro 0): a base aliada à
 * esquerda e a inimiga à direita, sem a diagonal — é o que o jogador espera num celular. A
 * inclinação fica pequena (20°) só para dar um pouco de profundidade, sem espremer o campo. */
export const ROTATE_DEG_PORTRAIT = 0;
export const TILT_DEG_PORTRAIT = 20;

/** Faixa de inclinação aceitável da mesa (graus). Dentro dela o encaixe é calculado para a
 *  projeção casar com a RAZÃO do palco; fora dela o campo é o mais largo (ou mais alto) que
 *  o limite permite, sem nunca deformar. */
export const TILT_MIN_DEG = 40;
export const TILT_MAX_DEG = 75;

/**
 * Inclinação da mesa que faz a PROJEÇÃO do campo casar com a razão do palco visível. O
 * campo é largo (razão `WORLD_W/WORLD_H`); inclinar a mesa comprime o eixo Y da projeção por
 * `cos(tilt)`, então a razão projetada é `mundo / cos(tilt)`. Resolvendo para casar com o
 * palco, o campo preenche LARGURA e ALTURA de fora a fora em qualquer tela — sem sobrar faixa
 * lateral (palco largo) nem faixa superior/inferior (palco alto). O ângulo é limitado à faixa
 * [40°, 75°] para a mesa nunca virar um risco nem perder a perspectiva de tabuleiro. Em
 * RETRATO a inclinação é fixa e pequena (o campo fica reto, base aliada à esquerda).
 */
export function tiltForStage(w: number, h: number, orient: FieldOrientation): number {
  if (orient === "portrait") return TILT_DEG_PORTRAIT;
  const visTop = HUD_TOP_INSET;
  const visBottom = Math.max(visTop + 1, h - FIELD_BOTTOM_PAD);
  const visH = visBottom - visTop;
  const stageAspect = w / visH;
  const worldAspect = WORLD_W / WORLD_H;
  const cosMax = Math.cos((TILT_MIN_DEG * Math.PI) / 180); // mesa mais "em pé"
  const cosMin = Math.cos((TILT_MAX_DEG * Math.PI) / 180); // mesa mais deitada
  const cosTilt = Math.max(cosMin, Math.min(cosMax, worldAspect / stageAspect));
  return (Math.acos(cosTilt) * 180) / Math.PI;
}

/** Escala (px de palco por unidade de mundo) da câmera plana, antes da inclinação. */
export function cameraScale(cam: Camera): number {
  return Math.hypot(cam.a, cam.b);
}

/**
 * Faixa (px de palco) reservada no TOPO para o HUD sobreposto (relógio/bases + linha de
 * comando). O campo é posicionado ABAIXO dela: sem isto o topo do teatro — onde ficam os
 * territórios do norte e a base aliada a noroeste — ficava sob a barra. O valor cobre as
 * DUAS linhas do HUD (a opaca, medida em ~99 px, e a de comando, translúcida). A base leva
 * um respiro equivalente (`FIELD_BOTTOM_PAD`), então a área visível do palco é o palco
 * menos essas duas faixas — é nela que a câmera encaixa o campo.
 */
export const HUD_TOP_INSET = 116;
/** Respiro (px de palco) na base, para o campo não colar no dock de cartas. */
export const FIELD_BOTTOM_PAD = 8;

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
  // O pivô da inclinação é o MESMO de `projectPoint` (`cam.originY`, o centro da área
  // visível do palco) — não o centro cru da tela, que ficaria sob o HUD.
  const cy = cam.originY;
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
 * esticar). O campo é sempre DEITADO (a base aliada à esquerda, a inimiga à direita): em
 * palco largo ele preenche a largura; em palco alto (celular em pé) sobra faixa em cima e
 * embaixo. A rotação é própria (determinante positivo), então nada fica espelhado.
 */
export function cameraFor(w: number, h: number): Camera {
  const orient = orientationFor(w, h);
  // Giro no plano: uma leve diagonal (mundo X desce para a direita) dá profundidade à mesa,
  // com a base aliada na ponta ESQUERDA e a inimiga na DIREITA. Mesmo valor em qualquer tela.
  const rotateDeg = orient === "portrait" ? ROTATE_DEG_PORTRAIT : ROTATE_DEG;
  // A inclinação NÃO é fixa: é resolvida para a projeção do campo casar com a razão do
  // palco, o que elimina as faixas laterais em telas largas (e as faixas de topo/base em
  // telas altas) SEM aumentar o zoom — o território representado é o mesmo.
  const tiltDeg = tiltForStage(w, h, orient);
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Área VISÍVEL do palco: o topo é reservado ao HUD sobreposto e a base tem um respiro
  // para o dock. O campo é encaixado e centralizado AQUI, não no palco cru — assim ele não
  // fica escondido sob a barra nem colado no dock.
  const visTop = HUD_TOP_INSET;
  const visBottom = Math.max(visTop + 1, h - FIELD_BOTTOM_PAD);
  const visH = visBottom - visTop;
  const cx = w / 2;
  const cy = visTop + visH / 2;
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
  // Mede a projeção dos 4 cantos com escala 1 e resolve `s` para a mesa ocupar a área visível.
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
  // Encaixe com folga MÍNIMA: a mesa cobre a área visível de fora a fora, sem cortar os
  // cantos. A folga é pequena de propósito — é o que elimina as faixas laterais.
  const s = Math.min(w / bw, visH / bh) * 0.995;
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
 * Transformação local para uma PEÇA ficar EM PÉ sobre a mesa inclinada.
 *
 * A câmera achata o eixo vertical do palco por `cos(tilt)` (em telas largas o fator chega
 * a 0,4). Aplicado a uma peça desenhada de cima — tanque, canhão, base — o achatamento
 * transformava o desenho numa lâmina torta. Aqui o achatamento é desfeito ANTES do giro de
 * tela: em tela o resultado é exatamente `R(ângulo)`, ou seja, a peça mantém a forma e a
 * rotação que teria numa mesa vista de frente, como uma miniatura em pé. O chão (terreno,
 * territórios, sombras) continua projetado normalmente — é o que dá a perspectiva.
 */
export function standMatrix(
  cam: Pick<Camera, "rotateDeg" | "tiltDeg"> | undefined,
  angleDeg: number,
): string {
  const ct = Math.max(0.05, Math.cos(((cam?.tiltDeg ?? 0) * Math.PI) / 180));
  const phi = ((cam?.rotateDeg ?? 0) * Math.PI) / 180;
  const theta = (angleDeg * Math.PI) / 180;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // M = R(−phi) · diag(1, 1/cos tilt) · R(theta), com M = [[a c],[b d]] no formato do SVG.
  const a = cp * c + (sp * s) / ct;
  const b = -sp * c + (cp * s) / ct;
  const cc = cp * -s + (sp * c) / ct;
  const d = sp * s + (cp * c) / ct;
  const f = (v: number) => Number(v.toFixed(5));
  return `matrix(${f(a)} ${f(b)} ${f(cc)} ${f(d)} 0 0)`;
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
