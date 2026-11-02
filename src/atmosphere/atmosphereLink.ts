/**
 * Vertikalschnitt (Atmosphäre · Querschnitt) · Link auf EINE Schnittlinie — rein, ohne Imports.
 *
 * ── Was hier „die Einheit" ist ──────────────────────────────────────────────
 * Der Vertikalschnitt hat keinen Katalog: seine Einheit ist die vom Nutzer gezogene (oder aus einer Tour geladene) LINIE
 * von 2–24 Punkten, optional an einen Ort gebunden (`/atmosphaere/querschnitt/<ort>?schnitt=lat,lon;lat,lon&t=…`). Die Kennung
 * IST die Linie — ihre Koordinaten, auf 4 Nachkommastellen gerundet (≈ 11 m), in der Reihenfolge des Ziehens. Das ist
 * seit SH3 so (`atmosphereUrl.ts`) und stabil, weil die Linie nichts Veränderliches enthält; der Zustand dazu (Prognose) ist
 * immer der aktuelle. Eine eigene Route je Linie brauchte es deshalb nicht neu zu geben — hier steht nur, was die Vorschau
 * und die Hinweise aus dem Link selbst lesen.
 *
 * Gleiche Regeln wie `parseAtmosphereQuery`: Punkt = `lat,lon` gültig (|lat| ≤ 90, |lon| ≤ 180), Linie ≥ 2 Punkte, höchstens
 * 24 (`CUT_MAX_POINTS`); alles andere ist keine Schnittlinie (`verify-share.mjs` prüft beide Leser gegeneinander).
 */

export const CUT_LINK_MAX_POINTS = 24;

export interface CutInfo {
  points: Array<{ lat: number; lon: number }>;
  /** Länge der Linie über alle Stützpunkte, in km (Großkreis je Teilstück). */
  km: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
function legKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** `schnitt=`-Wert → Linie; `null`, wenn es keine ist. */
export function parseCutLine(raw: string | null | undefined): CutInfo | null {
  if (!raw) return null;
  const pts: CutInfo['points'] = [];
  for (const part of raw.split(';')) {
    const [a, b] = part.split(',');
    const lat = a === '' || a == null ? NaN : Number(a), lon = b === '' || b == null ? NaN : Number(b);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) pts.push({ lat, lon });
  }
  if (pts.length < 2) return null;
  const used = pts.slice(0, CUT_LINK_MAX_POINTS);
  let km = 0;
  for (let i = 1; i < used.length; i++) km += legKm(used[i - 1], used[i]);
  return { points: used, km };
}

const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2).replace('.', ',')}° ${v >= 0 ? pos : neg}`;
const coord = (p: { lat: number; lon: number }) => `${deg(p.lat, 'N', 'S')}, ${deg(p.lon, 'E', 'W')}`;
const kmText = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace('.', ',');

/** Titel + Beschreibung zu einer Schnittlinie; nur Werte aus dem Link, nichts Erfundenes. */
export function describeCutLink(placeName: string | null, cut: CutInfo, whenText: string | null): { title: string; description: string } {
  const first = cut.points[0], last = cut.points[cut.points.length - 1];
  return {
    title: `Vertikalschnitt${placeName ? ` ${placeName}` : ''} — ${kmText(cut.km)} km Höhenwind${whenText ? ` · Prognose ${whenText}` : ''}`,
    description: `Höhenwind, Böen, Windscherung und Wolkenbasis entlang einer ${kmText(cut.km)} km langen Linie (${coord(first)} → ${coord(last)}) über dem Gelände: `
      + 'Modellwerte aus buscosun Fusion und ICON-D2. Der Link zeigt immer die aktuelle Prognose für diese Linie. Keine amtliche Warnung und keine Freigabe für Flug oder Bergtour.',
  };
}
