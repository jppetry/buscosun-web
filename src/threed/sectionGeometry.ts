/**
 * 3D-Wetter · Schnittlinien-Geometrie (US-A1-Basis, pur).
 *
 * Eine Schnittlinie besteht aus ≥ 2 Wegpunkten. Für den Vertikalschnitt wird
 * sie nach Bogenlänge in N gleich beabstandete Spalten resampelt (Haversine).
 * Reine Geometrie — keine Daten, keine DOM-Abhängigkeit, headless testbar.
 */

export interface GeoPoint { lat: number; lon: number }

export interface SectionColumn {
  lat: number;
  lon: number;
  /** Distanz vom Startpunkt entlang der Linie (m). */
  distanceM: number;
  /** Spaltenindex 0..N-1. */
  index: number;
}

export interface LineBounds { latMin: number; latMax: number; lonMin: number; lonMax: number }

const R_EARTH = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Großkreis-Distanz in Metern (Haversine). */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Gesamtlänge der Polylinie (m). */
export function lineLengthMeters(points: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineMeters(points[i - 1], points[i]);
  return total;
}

/**
 * Resampelt die Polylinie in `columns` gleich beabstandete Spalten (nach
 * Bogenlänge). Endpunkte bleiben exakt erhalten. Für entartete Linien (Länge 0)
 * werden alle Spalten auf den Startpunkt gelegt.
 */
export function resampleLine(points: GeoPoint[], columns: number): SectionColumn[] {
  if (points.length < 2 || columns < 2) {
    const p = points[0] ?? { lat: 0, lon: 0 };
    return Array.from({ length: Math.max(1, columns) }, (_, i) => ({ ...p, distanceM: 0, index: i }));
  }
  // Segment-Distanzen + kumulative Längen.
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversineMeters(points[i - 1], points[i]));
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: columns }, (_, i) => ({ ...points[0], distanceM: 0, index: i }));

  const out: SectionColumn[] = [];
  let seg = 0;
  for (let i = 0; i < columns; i++) {
    const target = (i / (columns - 1)) * total;
    while (seg < points.length - 2 && cum[seg + 1] < target) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const t = segLen > 0 ? (target - cum[seg]) / segLen : 0;
    const a = points[seg], b = points[seg + 1];
    out.push({
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
      distanceM: target,
      index: i,
    });
  }
  return out;
}

/** BBox der Linie, optional um `padDeg` aufgeweitet (für DEM-Kachel-Abdeckung). */
export function lineBounds(points: GeoPoint[], padDeg = 0): LineBounds {
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const p of points) {
    latMin = Math.min(latMin, p.lat); latMax = Math.max(latMax, p.lat);
    lonMin = Math.min(lonMin, p.lon); lonMax = Math.max(lonMax, p.lon);
  }
  if (!Number.isFinite(latMin)) { latMin = latMax = lonMin = lonMax = 0; }
  return { latMin: latMin - padDeg, latMax: latMax + padDeg, lonMin: lonMin - padDeg, lonMax: lonMax + padDeg };
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface GeoCheck { case: string; ok: boolean; detail: string }

export function verifySectionGeometry(): { checks: GeoCheck[]; passed: number; failed: number } {
  const checks: GeoCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  // Haversine: bekannte Strecke (~111 km je Breitengrad).
  const dLat = haversineMeters({ lat: 47.0, lon: 11.0 }, { lat: 48.0, lon: 11.0 });
  add('1° Breite ≈ 111 km', Math.abs(dLat - 111_195) < 500, `${Math.round(dLat)} m`);

  // Resample gerade Linie: gleichmäßige Abstände + Endpunkte exakt.
  const line = resampleLine([{ lat: 47.0, lon: 11.0 }, { lat: 47.0, lon: 11.2 }], 5);
  add('5 Spalten', line.length === 5);
  add('Start exakt', Math.abs(line[0].lon - 11.0) < 1e-9 && line[0].distanceM === 0);
  add('Ende exakt', Math.abs(line[4].lon - 11.2) < 1e-9);
  const d01 = line[1].distanceM - line[0].distanceM;
  const d34 = line[4].distanceM - line[3].distanceM;
  add('gleichmäßige Abstände', Math.abs(d01 - d34) < 1, `${d01.toFixed(1)} vs ${d34.toFixed(1)}`);
  add('Distanz monoton', line.every((c, i) => i === 0 || c.distanceM >= line[i - 1].distanceM));

  // Polylinie mit Knick: Gesamtlänge = Summe der Segmente.
  const pts = [{ lat: 47.0, lon: 11.0 }, { lat: 47.1, lon: 11.0 }, { lat: 47.1, lon: 11.2 }];
  const total = lineLengthMeters(pts);
  const rl = resampleLine(pts, 9);
  add('letzte Spalte = Gesamtlänge', Math.abs(rl[8].distanceM - total) < 1, `${Math.round(rl[8].distanceM)} vs ${Math.round(total)}`);

  // Bounds enthalten alle Punkte + Padding.
  const b = lineBounds(pts, 0.05);
  add('Bounds enthält Punkte + Pad', b.latMin <= 46.95 && b.latMax >= 47.15 && b.lonMax >= 11.25);

  // Entartet: identische Punkte → keine Exception, Distanz 0.
  const deg = resampleLine([{ lat: 47, lon: 11 }, { lat: 47, lon: 11 }], 4);
  add('entartete Linie ok', deg.length === 4 && deg.every((c) => c.distanceM === 0));

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifySectionGeometry: typeof verifySectionGeometry }).__verifySectionGeometry = verifySectionGeometry;
}
