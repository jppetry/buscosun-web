/**
 * SAT3 — FIRMS-Detektionen im Satellitenbild (`audit/brandradar-satellitenbilder.md` §13).
 *
 * Pur und DOM-frei: rechnet die Pixelgrundflächen der Detektionen (`footprintRing`, dieselbe
 * Regel wie der Karten-Layer) in Bildkoordinaten um — einmal für das 30-m-Bild (Plate-Carrée,
 * linear in Grad) und einmal für den 10-m-Viewer (UTM-Pixel des Granulats über `pixelOf`).
 *
 * Zwei Ehrlichkeitsregeln stecken hier drin, nicht in der Zeichnung:
 * 1. Das Rechteck ist die **Pixelgrundfläche** (scan × track), das Feuer liegt irgendwo darin —
 *    ohne `scan`/`track` gibt es kein Rechteck (GWIS-Notbetrieb zeichnet nichts).
 * 2. Der **Zeitbezug zur Szene**: eine Detektion NACH dem Aufnahmetag kann im Bild nichts
 *    erklären; sie wird als `after` markiert (gestrichelt), damit niemand unter ihr eine Narbe
 *    sucht, die es an diesem Tag noch nicht gab.
 */

import { footprintRing, type FirmsRow } from '../sources/firmsHotspots';

/** Ende des UTC-Kalendertags der Szene (exklusiv) — Detektionen davor „erklären" das Bild. */
export function sceneDayEndMs(dayIso: string): number {
  const [y, m, d] = dayIso.split('-').map(Number);
  return Date.UTC(y, m - 1, d + 1);
}

// --- 30-m-Bild (GIBS-Snapshot, EPSG:4326, BBox [S, W, N, O]) ------------------------------------

export interface DetRect30 {
  x: number; y: number; w: number; h: number;
  /** Aufnahme NACH dem Szenentag — kann im Bild nichts erklären. */
  after: boolean;
  day: boolean;
}

/**
 * Rechtecke in Bildpixeln des Snapshots. Plate-Carrée ⇒ Grad → Pixel ist linear in beiden
 * Achsen; Rechtecke ganz außerhalb des Bildes fallen weg, teils sichtbare bleiben ungeschnitten
 * (das SVG clippt selbst).
 */
export function detectionRects30m(
  rows: readonly FirmsRow[], bboxSWNO: readonly [number, number, number, number],
  w: number, h: number, dayIso: string,
): DetRect30[] {
  const [s, west, n, east] = bboxSWNO;
  const lonSpan = east - west;
  const latSpan = n - s;
  if (!(lonSpan > 0) || !(latSpan > 0)) return [];
  const end = sceneDayEndMs(dayIso);
  const out: DetRect30[] = [];
  for (const r of rows) {
    const ring = footprintRing(r);
    if (!ring) continue;
    const rw = ring[0][0], rs = ring[0][1], re = ring[2][0], rn = ring[2][1];
    if (re < west || rw > east || rn < s || rs > n) continue;
    const x = ((rw - west) / lonSpan) * w;
    const y = ((n - rn) / latSpan) * h;
    out.push({
      x, y,
      w: ((re - rw) / lonSpan) * w,
      h: ((rn - rs) / latSpan) * h,
      after: r.acqMs >= end,
      day: r.day,
    });
  }
  return out;
}

// --- 10-m-Viewer (UTM-Pixel des Granulats) ------------------------------------------------------

export type PixelOf = (lat: number, lon: number, epsg: number, transform: readonly number[]) => { px: number; py: number } | null;

export interface DetPoly {
  /** Vier Ecken in Vollauflösungs-Pixeln des Granulats: x0,y0,x1,y1,x2,y2,x3,y3 (W-S, O-S, O-N, W-N). */
  pts: number[];
  /** Achsparalleles Hüllrechteck derselben Ecken (Saat für die Narbe, Sichtbarkeitstest). */
  minX: number; minY: number; maxX: number; maxY: number;
  after: boolean;
  day: boolean;
}

/**
 * Rechtecke in Pixeln des Granulats. Behalten wird, was innerhalb `marginPx` um die Szene liegt
 * (`shape` = [Höhe, Breite]) — ein 7-Tage-Fenster hat ~6 000 Zeilen, der Viewer braucht die
 * paar Dutzend am Brand. Die Ecken laufen einzeln durch `pixelOf`: das Rechteck ist in Grad
 * achsparallel, in UTM leicht gedreht — die vier Punkte tragen das mit.
 */
export function detectionPolysPx(
  rows: readonly FirmsRow[], epsg: number, transform: readonly number[],
  shape: readonly [number, number], marginPx: number, dayIso: string, pixelOf: PixelOf,
): DetPoly[] {
  const end = sceneDayEndMs(dayIso);
  const out: DetPoly[] = [];
  const [h, w] = shape;
  for (const r of rows) {
    // Grober Vorfilter am Mittelpunkt, bevor vier Projektionen laufen.
    const c = pixelOf(r.lat, r.lon, epsg, transform);
    if (!c || c.px < -marginPx || c.px > w + marginPx || c.py < -marginPx || c.py > h + marginPx) continue;
    const ring = footprintRing(r);
    if (!ring) continue;
    const pts: number[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let ok = true;
    for (let i = 0; i < 4; i++) {
      const p = pixelOf(ring[i][1], ring[i][0], epsg, transform);
      if (!p) { ok = false; break; }
      pts.push(p.px, p.py);
      if (p.px < minX) minX = p.px; if (p.px > maxX) maxX = p.px;
      if (p.py < minY) minY = p.py; if (p.py > maxY) maxY = p.py;
    }
    if (!ok) continue;
    out.push({ pts, minX, minY, maxX, maxY, after: r.acqMs >= end, day: r.day });
  }
  return out;
}

// --- Selbstverifikation --------------------------------------------------------------------------

export interface DetCheck { name: string; ok: boolean; detail?: string }

export function verifySatDetections(): { checks: DetCheck[]; passed: number; total: number } {
  const checks: DetCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const row = (lat: number, lon: number, acqMs: number, extra: Partial<FirmsRow> = {}): FirmsRow => ({
    lat, lon, acqMs, frp: 5, confidence: 'nominal', brightTi4: null, brightTi5: null,
    scanKm: 0.4, trackKm: 0.4, satellite: 'N', day: true, source: 'VIIRS_NOAA20_NRT' as FirmsRow['source'], ...extra,
  });
  const day = '2025-08-24';
  const end = sceneDayEndMs(day);
  add('sceneDayEndMs: Ende des UTC-Tags (24.08. 24:00 = 25.08. 00:00 UTC)', end === Date.UTC(2025, 7, 25));

  // 30 m: BBox [S, W, N, O] 0,2° × 0,25°, Bild 600×480 — Mitte landet in der Bildmitte.
  const bb: [number, number, number, number] = [50.6, 6.2, 50.8, 6.45];
  const mid = detectionRects30m([row(50.7, 6.325, end - 1)], bb, 600, 480, day);
  add('30 m: Mittelpunkt-Detektion liegt in der Bildmitte', mid.length === 1
    && Math.abs(mid[0].x + mid[0].w / 2 - 300) < 0.5 && Math.abs(mid[0].y + mid[0].h / 2 - 240) < 0.5);
  add('30 m: 0,4 km scan ⇒ Rechteck ~8,6 px breit bei 0,25°/600 px (cos 50,7°)', mid.length === 1
    && Math.abs(mid[0].w - (0.4 / (111.32 * Math.cos(50.7 * Math.PI / 180))) / 0.25 * 600) < 0.05);
  add('30 m: Nord ist oben (höhere Breite ⇒ kleineres y)', (() => {
    const a = detectionRects30m([row(50.75, 6.3, end - 1), row(50.65, 6.3, end - 1)], bb, 600, 480, day);
    return a.length === 2 && a[0].y < a[1].y;
  })());
  add('30 m: Detektion außerhalb der BBox fällt weg, teils sichtbare bleibt',
    detectionRects30m([row(51.5, 6.3, end - 1)], bb, 600, 480, day).length === 0
    && detectionRects30m([row(50.8, 6.3, end - 1)], bb, 600, 480, day).length === 1);
  add('30 m: ohne scan/track KEIN Rechteck (kein geratenes)',
    detectionRects30m([row(50.7, 6.3, end - 1, { scanKm: null, trackKm: null })], bb, 600, 480, day).length === 0);
  add('30 m: Aufnahme am Szenentag = nicht „after", ab Mitternacht danach = „after"',
    detectionRects30m([row(50.7, 6.3, end - 1)], bb, 600, 480, day)[0].after === false
    && detectionRects30m([row(50.7, 6.3, end)], bb, 600, 480, day)[0].after === true);
  add('30 m: kaputte BBox ⇒ leer statt NaN-Rechtecke', detectionRects30m([row(50.7, 6.3, 0)], [1, 1, 1, 1], 600, 480, day).length === 0);

  // 10 m: lineare Stellvertreter-Projektion — px = lon·1000, py = (60 − lat)·1000 (Nord oben).
  const fakePixelOf: PixelOf = (lat, lon) => ({ px: lon * 1000, py: (60 - lat) * 1000 });
  const polys = detectionPolysPx([row(50.7, 6.3, end - 1), row(50.7, 6.3, end), row(-10, 6.3, 0)], 32632, [10, 0, 0, 0, -10, 0], [60_000, 12_000], 500, day, fakePixelOf);
  add('10 m: Detektionen weit außerhalb der Szene (+Rand) fallen weg', polys.length === 2);
  add('10 m: vier Ecken je Rechteck, Hülle umschließt sie',
    polys[0].pts.length === 8 && polys[0].minX <= Math.min(polys[0].pts[0], polys[0].pts[2])
    && polys[0].maxY >= Math.max(polys[0].pts[1], polys[0].pts[3]));
  add('10 m: Zeitbezug wie beim 30-m-Bild', polys[0].after === false && polys[1].after === true);
  add('10 m: unprojizierbare Ecke ⇒ Rechteck fällt weg, kein Teilpolygon',
    detectionPolysPx([row(50.7, 6.3, 0)], 32632, [10, 0, 0, 0, -10, 0], [60_000, 12_000], 500, day, () => null).length === 0);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
