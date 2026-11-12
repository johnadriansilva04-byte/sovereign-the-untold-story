// Regiões territoriais — o mapa é dividido em ÁREAS COMPLETAS, uma por ponto de
// expansão. Cada região é o polígono de Voronoi do seu marcador: o conjunto de pontos
// mais próximos daquele marcador do que de qualquer outro. Assim o campo inteiro fica
// particionado, sem "manchas" soltas: conquistar um território pinta a ÁREA INTEIRA
// daquele polígono com a cor da facção, e a fronteira com os vizinhos permanece visível.
//
// O cálculo é puramente geométrico e determinístico: recorte de polígono por
// semiplanos (Sutherland–Hodgman) contra as mediatrizes de cada par de marcadores.

export interface Site {
  x: number;
  y: number;
}

export type Point = [number, number];
export type Polygon = Point[];

/** Recorta um polígono convexo mantendo os pontos onde f(p) ≤ 0 (Sutherland–Hodgman). */
function clipHalfPlane(poly: Polygon, nx: number, ny: number, c: number): Polygon {
  // Semi-plano: n·p ≤ c.
  if (poly.length === 0) return poly;
  const out: Polygon = [];
  const f = (p: Point) => nx * p[0] + ny * p[1] - c;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const fa = f(a);
    const fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa <= 0 && fb > 0) || (fa > 0 && fb <= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Região de Voronoi de cada marcador, limitada ao retângulo `bounds`. Devolve um
 * polígono por marcador, na MESMA ordem da entrada (o índice casa com o território).
 */
export function voronoiRegions(
  sites: Site[],
  bounds: { x: number; y: number; w: number; h: number },
): Polygon[] {
  const rect: Polygon = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.w, bounds.y],
    [bounds.x + bounds.w, bounds.y + bounds.h],
    [bounds.x, bounds.y + bounds.h],
  ];
  return sites.map((p, i) => {
    let poly: Polygon = rect;
    for (let j = 0; j < sites.length; j++) {
      if (j === i) continue;
      const q = sites[j]!;
      // Mediatriz de p e q: n·x ≤ c, com n = q − p e c = n·(p+q)/2.
      const nx = q.x - p.x;
      const ny = q.y - p.y;
      if (nx === 0 && ny === 0) continue;
      const c = nx * ((p.x + q.x) / 2) + ny * ((p.y + q.y) / 2);
      poly = clipHalfPlane(poly, nx, ny, c);
      if (poly.length === 0) break;
    }
    return poly;
  });
}

/** Caminho SVG (`d`) de um polígono. */
export function polygonPath(poly: Polygon): string {
  if (poly.length === 0) return "";
  const head = poly
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(" ");
  return `${head} Z`;
}

/** Centroide do polígono (para rótulos). Cai no marcador quando a área é degenerada. */
export function polygonCentroid(poly: Polygon, fallback: Site): Site {
  if (poly.length < 3) return fallback;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]!;
    const [x1, y1] = poly[(i + 1) % poly.length]!;
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(a) < 1e-6) return fallback;
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
