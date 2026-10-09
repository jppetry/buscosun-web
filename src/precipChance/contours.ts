/**
 * Phase RC: Konturen auf einem regulären Gitter (Marching Squares) — Flächen „Wert ≥ Schwelle" als GeoJSON-MultiPolygon mit
 * Löchern und dieselben Ringe als Linien. Eigene, abhängigkeitsfreie Umsetzung (keine neue Bibliothek, STOPP-Regel).
 *
 * Gitter: `values[r · w + c]`, Zeile 0 = NORDEN (wie die Kartenfelder), Wert NaN = fehlt (zählt als „unter der Schwelle").
 * Rand: das Gitter wird gedanklich mit −∞ umrandet ⇒ jeder Ring schließt sich. Eine Kante zwischen Wert und Rand/Lücke
 * schneidet die Kontur in der Mitte (= Zellrand), sonst linear interpoliert.
 * Richtung: jede Strecke läuft so, dass „≥ Schwelle" links liegt — gesehen mit Norden oben, also gegen den Uhrzeigersinn um
 * die Fläche: Außenringe gegen, Löcher im Uhrzeigersinn (RFC 7946; Fläche > 0 bzw. < 0 in Länge/Breite). Sattelzellen nach
 * dem Mittelwert.
 *
 * Rein (kein DOM, kein Netz).
 */

export type Ring = Array<[number, number]>;

export interface GridGeo {
  width: number;
  height: number;
  /** Länge der Spalte 0, Breite der Zeile `height − 1` (Süden), Gitterweite (Grad). */
  lon0: number;
  lat0: number;
  deg: number;
}

type Edge = 0 | 1 | 2 | 3; // T, R, B, L
const T = 0, R = 1, B = 2, L = 3;
/** Ecke, die zwei benachbarte Kanten teilen (tl 0, tr 1, br 2, bl 3); −1 = gegenüberliegend. */
function sharedCorner(a: Edge, b: Edge): number {
  const k = a < b ? `${a}${b}` : `${b}${a}`;
  return k === '03' ? 0 : k === '01' ? 1 : k === '12' ? 2 : k === '23' ? 3 : -1;
}
const CORNER_POS: ReadonlyArray<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
const EDGE_MID: ReadonlyArray<[number, number]> = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];

/** Strecken je Fall (Bits tl 8, tr 4, br 2, bl 1); Sattel 5/10 je nach Mittelwert. */
function segmentsOf(cs: number, centerAbove: boolean): Array<[Edge, Edge]> {
  switch (cs) {
    case 1: return [[L, B]];
    case 2: return [[B, R]];
    case 3: return [[L, R]];
    case 4: return [[T, R]];
    case 5: return centerAbove ? [[T, L], [B, R]] : [[T, R], [L, B]];
    case 6: return [[T, B]];
    case 7: return [[T, L]];
    case 8: return [[T, L]];
    case 9: return [[T, B]];
    case 10: return centerAbove ? [[T, R], [L, B]] : [[T, L], [B, R]];
    case 11: return [[T, R]];
    case 12: return [[L, R]];
    case 13: return [[B, R]];
    case 14: return [[L, B]];
    default: return [];
  }
}

/** Ringe der Fläche „Wert ≥ thr" in Gitterkoordinaten (x = Spalte, y = Zeile, y nach unten). */
export function isoRingsGrid(values: ArrayLike<number>, w: number, h: number, thr: number): Ring[] {
  const get = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= w || y >= h) return -Infinity;
    const v = values[y * w + x];
    return Number.isNaN(v) ? -Infinity : v;
  };
  const stride = w + 2;
  // Kanten-Schlüssel: waagrechte Kante (x, y)–(x+1, y) gerade, senkrechte (x, y)–(x, y+1) ungerade; x, y ab −1.
  const hKey = (x: number, y: number) => ((y + 1) * stride + (x + 1)) * 2;
  const vKey = (x: number, y: number) => ((y + 1) * stride + (x + 1)) * 2 + 1;
  const frac = (a: number, b: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0.5;
    if (b === a) return 0.5;
    return Math.max(0, Math.min(1, (thr - a) / (b - a)));
  };
  const next = new Map<number, number>();
  const pos = new Map<number, [number, number]>();
  for (let cy = -1; cy < h; cy++) {
    for (let cx = -1; cx < w; cx++) {
      const vtl = get(cx, cy), vtr = get(cx + 1, cy), vbr = get(cx + 1, cy + 1), vbl = get(cx, cy + 1);
      const above = [vtl >= thr, vtr >= thr, vbr >= thr, vbl >= thr];
      const cs = (above[0] ? 8 : 0) | (above[1] ? 4 : 0) | (above[2] ? 2 : 0) | (above[3] ? 1 : 0);
      if (cs === 0 || cs === 15) continue;
      const centre = (vtl + vtr + vbr + vbl) / 4;
      for (const [e1, e2] of segmentsOf(cs, centre >= thr)) {
        // Richtung: „≥ thr" links (in y-unten-Koordinaten liegt ein Punkt links, wenn das Kreuzprodukt < 0 ist).
        const c = sharedCorner(e1, e2);
        const corner = c >= 0 ? c : 0;
        const wantLeft = c >= 0 ? above[c] : above[0];
        const p1 = EDGE_MID[e1], p2 = EDGE_MID[e2], q = CORNER_POS[corner];
        const z = (p2[0] - p1[0]) * (q[1] - p1[1]) - (p2[1] - p1[1]) * (q[0] - p1[0]);
        const [a, b] = (z < 0) === wantLeft ? [e1, e2] : [e2, e1];
        const key = (e: Edge): number => {
          if (e === T) { if (!pos.has(hKey(cx, cy))) pos.set(hKey(cx, cy), [cx + frac(vtl, vtr), cy]); return hKey(cx, cy); }
          if (e === B) { if (!pos.has(hKey(cx, cy + 1))) pos.set(hKey(cx, cy + 1), [cx + frac(vbl, vbr), cy + 1]); return hKey(cx, cy + 1); }
          if (e === L) { if (!pos.has(vKey(cx, cy))) pos.set(vKey(cx, cy), [cx, cy + frac(vtl, vbl)]); return vKey(cx, cy); }
          if (!pos.has(vKey(cx + 1, cy))) pos.set(vKey(cx + 1, cy), [cx + 1, cy + frac(vtr, vbr)]);
          return vKey(cx + 1, cy);
        };
        next.set(key(a), key(b));
      }
    }
  }
  const rings: Ring[] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const ring: Ring = [];
    let k: number | undefined = start;
    let guard = next.size + 1;
    while (k !== undefined && !seen.has(k) && guard-- > 0) {
      seen.add(k);
      ring.push(pos.get(k) as [number, number]);
      k = next.get(k);
    }
    if (ring.length >= 3 && k === start) { ring.push([ring[0][0], ring[0][1]]); rings.push(ring); }
  }
  return rings;
}

/** Gitter → Länge/Breite (Zeile 0 = Norden). */
export function ringToLonLat(r: Ring, g: GridGeo): Ring {
  return r.map(([x, y]) => [g.lon0 + x * g.deg, g.lat0 + (g.height - 1 - y) * g.deg] as [number, number]);
}

/** Vorzeichenbehaftete Fläche (Shoelace) — > 0 gegen den Uhrzeigersinn (y nach oben). */
export function signedArea(r: Ring): number {
  let s = 0;
  for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return s / 2;
}

export function pointInRing(p: [number, number], r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Fläche „Wert ≥ thr" als MultiPolygon in Länge/Breite: Außenringe (Fläche > 0) mit den Löchern (Fläche < 0), die in ihnen
 * liegen — ein Loch gehört zum kleinsten Außenring, der es enthält.
 */
export function isoMultiPolygon(values: ArrayLike<number>, g: GridGeo, thr: number): Ring[][] {
  const rings = isoRingsGrid(values, g.width, g.height, thr).map((r) => ringToLonLat(r, g));
  const outers: Array<{ ring: Ring; area: number; holes: Ring[] }> = [];
  const holes: Ring[] = [];
  for (const r of rings) {
    const a = signedArea(r);
    if (a > 0) outers.push({ ring: r, area: a, holes: [] });
    else if (a < 0) holes.push(r);
  }
  for (const h of holes) {
    let best: (typeof outers)[number] | null = null;
    for (const o of outers) {
      if (o.area <= -signedArea(h)) continue;
      if (pointInRing(h[0], o.ring) && (!best || o.area < best.area)) best = o;
    }
    best?.holes.push(h);
  }
  return outers.map((o) => [o.ring, ...o.holes]);
}

/** Alle Ringe der Kontur als Linien (Länge/Breite) — für die beschrifteten Konturlinien. */
export function isoLines(values: ArrayLike<number>, g: GridGeo, thr: number): Ring[] {
  return isoRingsGrid(values, g.width, g.height, thr).map((r) => ringToLonLat(r, g));
}
