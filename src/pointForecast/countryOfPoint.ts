/**
 * Land eines Punkts — EINE Regel für Punktvorhersage und Kartengitter (V-FR-9/V-FR-11, `audit/fusion-release.md` §8.12/§8.13).
 *
 * Liegt der Punkt in genau einer Länder-Box (`COUNTRY_PROFILES[c].bounds`), ist es dieses Land. Wo sich Boxen überlappen,
 * entscheidet die Landesgrenze (`countryBorders.ts`, erzeugt aus `public/countries`, auf die Überlappung beschnitten); liegt
 * der Punkt in keinem der Länder (Liechtenstein, Italien, Frankreich …), bleibt es bei der Box-Regel.
 *
 * Eigenes Modul (statt `clustering.ts`), damit das Niederschlagsgitter der Karte die Regel nutzt, ohne das Clustering der
 * Routen zu laden.
 */
import { COUNTRY_PROFILES, countryBoxSlack, pickCountryByBox } from '../countryProfiles';
import { COUNTRY_BORDERS } from './countryBorders';
import type { Country } from '../types';

const COUNTRIES: readonly Country[] = ['DE', 'AT', 'CH'];

/** Punkt im Land: alle Ringe des Landes zusammen nach der Gerade-Ungerade-Regel (Löcher = Enklaven). Gilt nur im
 *  Rechteck `COUNTRY_BORDER_CLIP[c]` (Überlappung der Boxen) — die Ringe sind darauf beschnitten. */
export function inCountry(c: Country, lat: number, lng: number): boolean {
  const x = lng * 1e4, y = lat * 1e4;
  let inside = false;
  for (const r of COUNTRY_BORDERS[c]) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Land eines Punkts (s. Kopf). */
export function pickCountry(lat: number, lng: number): Country {
  const boxes = COUNTRIES.filter((c) => countryBoxSlack(c, lat, lng) >= 0);
  if (boxes.length >= 2) for (const c of boxes) if (inCountry(c, lat, lng)) return c;
  return pickCountryByBox(lat, lng);
}

/**
 * Dasselbe für viele Punkte einer Breite (Kartengitter): die Schnittpunkte der Grenzen mit dieser Breite einmal, dann je
 * Länge nur eine binäre Suche. Gleiche Formel wie `inCountry` ⇒ gleiches Ergebnis wie `pickCountry`, Punkt für Punkt.
 */
export function countryRowPicker(lat: number): (lng: number) => Country {
  const y = lat * 1e4;
  const xs = {} as Record<Country, Float64Array>;
  for (const c of COUNTRIES) {
    const cut: number[] = [];
    for (const r of COUNTRY_BORDERS[c]) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
        if ((yi > y) !== (yj > y)) cut.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
      }
    }
    xs[c] = Float64Array.from(cut).sort();
  }
  // inCountry kippt bei jedem Schnitt mit x < Schnitt ⇒ innen, wenn die Zahl der Schnitte rechts von x ungerade ist.
  const inside = (cuts: Float64Array, x: number): boolean => {
    let lo = 0, hi = cuts.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cuts[m] > x) hi = m; else lo = m + 1; }
    return ((cuts.length - lo) & 1) === 1;
  };
  // Das Kartengitter ruft das 307 200-mal im Hauptthread: Box-Werte der Breite je Zeile vorab, dann EINE Schleife je Zelle —
  // Zählen und Box-Regel (`countryBoxSlack`/`pickCountryByBox`, gleiche Formel, gleiche Reihenfolge, erster Größter gewinnt).
  const B = COUNTRIES.map((c) => COUNTRY_PROFILES[c].bounds);
  const dLatMin = B.map((b) => lat - b.latMin), dLatMax = B.map((b) => b.latMax - lat);
  const slack = new Float64Array(COUNTRIES.length);
  return (lng: number): Country => {
    let boxes = 0, best = 0, bestSlack = -Infinity;
    for (let k = 0; k < COUNTRIES.length; k++) {
      const s = Math.min(dLatMin[k], dLatMax[k], lng - B[k].lngMin, B[k].lngMax - lng);
      slack[k] = s;
      if (s >= 0) boxes++;
      if (s > bestSlack) { bestSlack = s; best = k; }
    }
    if (boxes >= 2) for (let k = 0; k < COUNTRIES.length; k++) if (slack[k] >= 0 && inside(xs[COUNTRIES[k]], lng * 1e4)) return COUNTRIES[k];
    return COUNTRIES[best];
  };
}
