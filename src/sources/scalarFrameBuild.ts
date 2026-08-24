/**
 * Pure, DOM-freie Bauschleifen der Ein-Kanal-Raster der Wetterkarte (BW-6a):
 * Böen, Blitzprognose, Schneedecke, Neuschnee, Gewitter- und Rotationspotenzial.
 *
 * Dieselbe Bewegung wie `tempFrameBuild.ts` (BW-1) und `../wind/windFrameBuild.ts`:
 * EIN Modul, das BEIDE Seiten importieren —
 *   • der Client (`iconD2*Source.ts`) setzt die Bytes per `putImageData` in ein
 *     Canvas und zeichnet sie unverändert wie bisher,
 *   • der Repack-Producer (`scripts/repack-icon-d2.mjs`, Node) schreibt sie als
 *     Grau+Alpha-PNG ins Daten-Repo.
 * Zwei gleich gemeinte Kopien würden irgendwann auseinanderdriften, und dann
 * zeichnete die Karte vom CDN andere Werte als der GRIB-Fallback. `verify:repack`
 * beweist die Byte-Identität je Familie und Lauf.
 *
 * Kanalvertrag (alle sechs Familien gleich, `ScalarLayer` liest nur R und A):
 *   R = normierter Wert 0…255 (Bereich je Familie, s. Konstanten)
 *   G = 0, B = 0 — der Browser expandiert Grau beim Dekodieren auf R = G = B;
 *       das ist hier unschädlich, weil nur der Temperatur-Layer `demRefine`
 *       trägt und G als Bezugshöhe liest (`audit/bandbreite.md` §25.4 (1)).
 *   A = 255 im Gitter, 0 außerhalb (Bitmap-Maske) — „kein Wert" ≠ 0.
 *
 * Abgetastet wird der ERSTE Punkt jedes Blocks (`min(n−1, k·ss)`), nicht die
 * Blockmitte; `subsampledCorners()` spannt die Bounds über genau diese Punkte
 * (KL3, `audit/karten-layer-verortung.md` B3). Wer hier die Abtastung ändert,
 * muss dort mitziehen.
 *
 * Bewusst NICHT hier: die Dev-Diagnosen der Client-Module (`import.meta.env.DEV`,
 * Vorzeichen-Logs) — sie sind in Node nicht lauffähig und gehören nicht zum Bild.
 */

import type { GribField } from './gribDecode';
import { thunderScore } from '../radar/thunderPotential';
import { rotationScore, smoothScores } from '../radar/rotationPotential';
import { freshSnowCmFromSwe } from '../nowcast/alpineSplit';

export interface ScalarRgba {
  /** w·h·4 Bytes, north-up (R = norm. Wert, G = B = 0, A = Maske). */
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Physikalischer Böen-Bereich der Normierung (m/s). 40 m/s ≈ Orkan (Bft 12). */
export const GUST_VMIN = 0;
export const GUST_VMAX = 40;
/** LPI-Bereich (J/kg) — 30 deckt DACH-Extremkonvektion. */
export const LPI_VMIN = 0;
export const LPI_VMAX = 30;
/** Schneedecke (cm), die als 1.0 kodiert wird. */
export const SNOW_DEPTH_VMAX_CM = 150;
/** Neuschnee (cm), der als 1.0 kodiert wird. */
export const SNOW_FRESH_VMAX_CM = 50;
/** Gewitterpotenzial-Score 0…100. */
export const THUNDER_VMIN = 0;
export const THUNDER_VMAX = 100;
/** Rotationspotenzial-Score 0…100. */
export const ROTATION_VMIN = 0;
export const ROTATION_VMAX = 100;

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Zwei Felder liegen auf demselben Gitter — sonst zeigte ein Nebenfeld den Wert eines anderen Orts. */
function sameGrid(ref: GribField, other: GribField | null): other is GribField {
  return !!other && other.ni === ref.ni && other.nj === ref.nj;
}

/**
 * Die eine Schleife aller Ein-Kanal-Familien: tastet mit Faktor `ss` ab, flippt
 * north-up, ruft `norm(k)` für den Index `k` im nativen Feld. `NaN` ⇒ A = 0.
 */
function buildScalar(ref: GribField, ss: number, norm: (k: number) => number): ScalarRgba {
  const { ni, nj } = ref;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      const idx = (y * w + ii) * 4;
      const t = norm(k);
      if (!Number.isFinite(t)) { rgba[idx + 3] = 0; continue; } // außerhalb Domäne → transparent
      rgba[idx] = Math.round(clamp01(t) * 255);
      rgba[idx + 3] = 255;
    }
  }
  return { rgba, width: w, height: h };
}

/** Böen: `vmax_10m` (m/s) → R = (v − GUST_VMIN) / (GUST_VMAX − GUST_VMIN). */
export function buildGustRgba(g: GribField, ss: number): ScalarRgba {
  const span = GUST_VMAX - GUST_VMIN;
  return buildScalar(g, ss, (k) => (g.values[k] - GUST_VMIN) / span);
}

/** Blitzprognose: `lpi_max` (J/kg) → R = (v − LPI_VMIN) / (LPI_VMAX − LPI_VMIN). */
export function buildLpiRgba(lpi: GribField, ss: number): ScalarRgba {
  const span = LPI_VMAX - LPI_VMIN;
  return buildScalar(lpi, ss, (k) => (lpi.values[k] - LPI_VMIN) / span);
}

/** Schneedecke: `h_snow` (m) → R = cm / SNOW_DEPTH_VMAX_CM. */
export function buildSnowDepthRgba(hsnow: GribField, ss: number): ScalarRgba {
  return buildScalar(hsnow, ss, (k) => (hsnow.values[k] * 100) / SNOW_DEPTH_VMAX_CM);
}

/**
 * Neuschnee: `snow_gsp` (+ `snow_con`) [kg/m² = mm SWE] → cm über
 * `freshSnowCmFromSwe` (`rho_snow` bevorzugt, sonst 10:1-Näherung) → R = cm / SNOW_FRESH_VMAX_CM.
 * Domänenanker ist `snow_gsp`; Nebenfelder dürfen fehlen (→ 0 bzw. Näherung).
 */
export function buildSnowFreshRgba(gsp: GribField, con: GribField | null, rho: GribField | null, ss: number): ScalarRgba {
  const conOk = sameGrid(gsp, con);
  const rhoOk = sameGrid(gsp, rho);
  return buildScalar(gsp, ss, (k) => {
    const g = gsp.values[k];
    if (!Number.isFinite(g)) return NaN;
    const c = conOk ? con.values[k] : 0;
    const sweMm = g + (Number.isFinite(c) ? c : 0);
    const rhoV = rhoOk ? rho.values[k] : undefined;
    const cm = freshSnowCmFromSwe(sweMm, Number.isFinite(rhoV as number) ? (rhoV as number) : undefined);
    return cm / SNOW_FRESH_VMAX_CM;
  });
}

/**
 * Gewitterpotenzial: `thunderScore(cape, cin, lpi)` je Zelle auf den ROHEN Werten,
 * dann R = Score / 100. Domänenanker `cape_ml` (NaN dort → NaN → transparent);
 * fehlendes Nebenfeld → 0 (kein Deckel, keine Auslösung).
 */
export function buildThunderRgba(cape: GribField, cin: GribField | null, lpi: GribField | null, ss: number): ScalarRgba {
  const cinOk = sameGrid(cape, cin);
  const lpiOk = sameGrid(cape, lpi);
  const span = THUNDER_VMAX - THUNDER_VMIN;
  return buildScalar(cape, ss, (k) =>
    (thunderScore(cape.values[k], cinOk ? cin.values[k] : 0, lpiOk ? lpi.values[k] : 0) - THUNDER_VMIN) / span);
}

/**
 * Rotationspotenzial: `rotationScore` je (abgetasteter) Zelle, dann
 * NACHBARSCHAFTS-GLÄTTUNG `smoothScores` (Einzelpixel dämpfen, NaN-Maske erhalten),
 * dann R = Score / 100. Domänenanker `uh_max`.
 */
export function buildRotationRgba(uh: GribField, uhLow: GribField | null, sdi: GribField | null, ss: number): ScalarRgba {
  const { ni, nj } = uh;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);
  const lowOk = sameGrid(uh, uhLow);
  const sdiOk = sameGrid(uh, sdi);

  // 1) Score-Grid (north-up) — NaN außerhalb der Domäne.
  const scores = new Float32Array(w * h);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj;
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      scores[y * w + ii] = rotationScore(uh.values[k], lowOk ? uhLow.values[k] : 0, sdiOk ? sdi.values[k] : 0);
    }
  }
  // 2) Glättung — 3) Rasterisieren.
  const smooth = smoothScores(scores, w, h);
  const span = ROTATION_VMAX - ROTATION_VMIN;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const s = smooth[p];
    const idx = p * 4;
    if (!Number.isFinite(s)) { rgba[idx + 3] = 0; continue; }
    rgba[idx] = Math.round(clamp01((s - ROTATION_VMIN) / span) * 255);
    rgba[idx + 3] = 255;
  }
  return { rgba, width: w, height: h };
}
