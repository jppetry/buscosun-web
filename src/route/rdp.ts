/**
 * Douglas-Peucker (RDP) Linienvereinfachung.
 *
 * Arbeitet auf in Meter projizierten Punkten (lokale Äquirektangular-Projektion),
 * damit Epsilon eine echte Meter-Bedeutung hat. Iterativ (Stack statt Rekursion),
 * damit auch Tracks mit 10.000+ Punkten nicht den Call-Stack sprengen.
 */

export interface XY {
  x: number;
  y: number;
}

/** Lon/Lat → lokale Meter-Koordinaten um eine Referenzbreite. */
export function projectMeters(points: Array<{ lat: number; lon: number }>): XY[] {
  if (points.length === 0) return [];
  const lat0 = points[Math.floor(points.length / 2)].lat;
  const mPerDegLat = 110_540;
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  return points.map((p) => ({ x: p.lon * mPerDegLon, y: p.lat * mPerDegLat }));
}

/** Lotabstand von p zur Geraden a–b (Meter). */
function perpDistance(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * Liefert die beibehaltenen Indizes (aufsteigend sortiert, inkl. Start/Ende)
 * für die RDP-Vereinfachung mit `epsilon` (Meter).
 */
export function rdpIndices(pts: XY[], epsilon: number): number[] {
  const n = pts.length;
  if (n <= 2) return pts.map((_, i) => i);

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo < 2) continue;
    let maxD = -1;
    let idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDistance(pts[i], pts[lo], pts[hi]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > epsilon && idx > 0) {
      keep[idx] = 1;
      stack.push([lo, idx], [idx, hi]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
