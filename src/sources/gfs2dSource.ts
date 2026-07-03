/**
 * NOAA GFS (0,25°… hier 1,0°) — globales 2D-Raster (Temperatur, Wind, Wolken,
 * Niederschlag) als coarse `ForecastGrid` für den Per-Land-Modell-Switcher
 * (Phase 4.5). GFS ist global (deckt DACH), Public Domain, ohne Key/Rate-Limit.
 *
 * Wiederverwendung der Globus-Infrastruktur (`globe/gfs.ts`): idx → HTTP-Range →
 * DRT-3-Decoder (`fetchGfsGrid`/`sampleGfs`) — nur wenige günstige Byte-Range-
 * Reads je Feld (~75 KB statt ~500 MB). Aufgelöst auf 1,0° (Globus-Raster) →
 * bewusst **grob** (Katalog-Coverage 'coarse'); der FusionEngine interpoliert es
 * per IDW auf die Karte und es trägt den Engine-Qualitäts-Badge.
 *
 * Feldsatz wie `pointForecast/gfsPoint.ts`: TMP/UGRD/VGRD (2 m/10 m), TCDC
 * (Gesamtbewölkung), APCP (akkumuliert → Stundenrate per Differenz).
 */

import { resolveLatestGfsRun, fetchGfsGrid, sampleGfs, runValidMs, type GfsRun } from '../globe/gfs';
import { correctCloudBias } from './cloudBias';
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const KELVIN = 273.15;
const MAX_STEP_DEFAULT = 6;

const EU_BOUNDS: ForecastBounds = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };

const MATCH = {
  t: ':TMP:2 m above ground:',
  u: ':UGRD:10 m above ground:',
  v: ':VGRD:10 m above ground:',
  apcp: ':APCP:surface:',
  tcc: ':TCDC:entire atmosphere',
} as const;

export interface Gfs2dOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

/** Ein GFS-Feld an den Ausgabepunkten abtasten (NaN, wenn Feld fehlt). */
function sampleAt(grid: Awaited<ReturnType<typeof fetchGfsGrid>> | null, lats: number[], lngs: number[]): Float32Array {
  const out = new Float32Array(lats.length);
  for (let k = 0; k < lats.length; k++) out[k] = grid ? sampleGfs(grid, lngs[k], lats[k]) : NaN;
  return out;
}

/**
 * Lädt GFS als coarse `ForecastGrid` (Temperatur/Wind/Wolken/Niederschlag).
 * 3-stündlich 0–6 h; Byte-Range-Reads sind klein und werden im gfs.ts-Cache
 * wiederverwendet.
 */
export async function fetchGfs2dGrid(options: Gfs2dOptions = {}): Promise<ForecastGrid> {
  const cols = options.cols ?? 24;
  const rows = options.rows ?? 20;
  const total = cols * rows;
  const cap = Math.min(options.hours ?? MAX_STEP_DEFAULT, MAX_STEP_DEFAULT);
  const steps: number[] = [];
  for (let s = 0; s <= cap; s += 3) steps.push(s);

  const run: GfsRun = await resolveLatestGfsRun(options.signal);

  const lats = new Array<number>(total), lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = EU_BOUNDS.latMin + (j / Math.max(1, rows - 1)) * (EU_BOUNDS.latMax - EU_BOUNDS.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = EU_BOUNDS.lngMin + (i / Math.max(1, cols - 1)) * (EU_BOUNDS.lngMax - EU_BOUNDS.lngMin);
      lats[j * cols + i] = lat; lngs[j * cols + i] = lng;
    }
  }

  // Je Step die Felder holen (jeweils tolerant: fehlt eins → NaN).
  const perStep = await Promise.all(steps.map(async (step) => {
    const [t, u, v, apcp, tcc] = await Promise.all([
      fetchGfsGrid(run, step, MATCH.t, options.signal).catch(() => null),
      fetchGfsGrid(run, step, MATCH.u, options.signal).catch(() => null),
      fetchGfsGrid(run, step, MATCH.v, options.signal).catch(() => null),
      step > 0 ? fetchGfsGrid(run, step, MATCH.apcp, options.signal).catch(() => null) : Promise.resolve(null),
      fetchGfsGrid(run, step, MATCH.tcc, options.signal).catch(() => null),
    ]);
    return {
      t: sampleAt(t, lats, lngs), u: sampleAt(u, lats, lngs), v: sampleAt(v, lats, lngs),
      apcp: sampleAt(apcp, lats, lngs), tcc: sampleAt(tcc, lats, lngs),
    };
  }));

  const times: Date[] = [];
  const points: ForecastHourPoint[][] = [];
  for (let h = 0; h < steps.length; h++) {
    const s = perStep[h];
    times.push(new Date(runValidMs(run, steps[h])));
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const tK = s.t[k];
      const t = Number.isFinite(tK) ? tK - KELVIN : null;
      const u = Number.isFinite(s.u[k]) ? s.u[k] : null;
      const v = Number.isFinite(s.v[k]) ? s.v[k] : null;
      const total100 = correctCloudBias(Number.isFinite(s.tcc[k]) ? s.tcc[k] : null);
      // APCP ist ab Laufbeginn akkumuliert (0–6 h monoton) → Rate = Differenz.
      const accNow = s.apcp[k];
      const accPrev = h > 0 ? perStep[h - 1].apcp[k] : 0;
      const precip = Number.isFinite(accNow)
        ? Math.max(0, accNow - (Number.isFinite(accPrev) ? accPrev : 0)) : null;
      arr[k] = {
        temperature: t, u, v,
        cloudLow: total100 != null ? total100 * 0.55 : null,
        cloudMid: total100 != null ? total100 * 0.30 : null,
        cloudHigh: total100 != null ? total100 * 0.15 : null,
        precipitation: precip,
        model: 'gfs',
      };
    }
    points.push(arr);
  }

  return { cols, rows, bounds: EU_BOUNDS, times, points, fetchedAt: Date.now() };
}
