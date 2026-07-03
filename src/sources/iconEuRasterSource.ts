/**
 * DWD ICON-EU (single-level) — 2D-Raster (Temperatur, Wind, Wolken, Niederschlag)
 * als coarse `ForecastGrid` für den Per-Land-Modell-Switcher (Phase 4.4).
 *
 * Anders als ICON-EU-Druckflächen (nur Sounding, `iconEuSounding.ts`) liegen die
 * Single-Level-Felder als **reguläres** lat-lon-Gitter vor (GDT 0, 1377×657 @
 * 0,0625° ≈ 7 km; Domäne 23,5°W–62,5°E, 29,5–70,5°N → ganz DACH). Der bestehende
 * Decoder liest sie direkt; die bz2-Dateien sind klein (~1 MB/Feld).
 *
 * Pipeline: je (Variable, Step) EINE bz2-Datei → `fetchDecompressedCached` (bz2-
 * Worker + Cache) → `decodeGrib2` → an einem coarse DACH-Gitter (bilinear)
 * abtasten → `ForecastGrid`. Der FusionEngine interpoliert es per IDW auf die
 * dichte Karte; das Raster trägt daher den Engine-Qualitäts-Badge. CC BY 4.0.
 */

import { fetchDecompressedCached } from './iconD2Precip';
import { decodeGrib2, type GribField } from './gribDecode';
import { correctCloudBias } from './cloudBias';
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

// opendata.dwd.de blockt Browser-CORS → Dev-Proxy `/_dwd_opendata` (wie
// iconD2Precip/iconEuSounding). Verify läuft über einen eigenen Direkt-Fetch.
const EU_BASE = '/_dwd_opendata/weather/nwp/icon-eu/grib';
const KELVIN = 273.15;
const MAX_STEP_DEFAULT = 6;

/** Ausgabe-Gitter über DACH (ICON-EU deckt weit mehr ab). */
const EU_BOUNDS: ForecastBounds = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };

export interface IconEuRasterOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function pad3(n: number) { return String(n).padStart(3, '0'); }

/** Single-Level-URL. Dateiname trägt den Parameter in GROSSschrift (T_2M),
 *  das Verzeichnis kleingeschrieben (t_2m). */
function singleUrl(run: string, step: number, param: string): string {
  const hh = run.slice(8, 10);
  const name = `icon-eu_europe_regular-lat-lon_single-level_${run}_${pad3(step)}_${param}.grib2.bz2`;
  return `${EU_BASE}/${hh}/${param.toLowerCase()}/${name}`;
}

const RUN_TTL_MS = 3 * 60 * 1000;
let runCache: { run: string; runAt: Date; at: number } | null = null;

async function headOk(url: string, signal?: AbortSignal): Promise<boolean> {
  try { return (await fetch(url, { method: 'HEAD', signal })).ok; } catch { return false; }
}

/** Jüngsten publizierten Lauf finden (HEAD auf T_2M Step 0, 3-h-Schritte rückwärts). */
async function resolveRun(signal?: AbortSignal): Promise<{ run: string; runAt: Date }> {
  const t = Date.now();
  if (runCache && t - runCache.at < RUN_TTL_MS) return runCache;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 8; back++) {
    if (signal?.aborted) throw new Error('aborted');
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run = `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}${pad2(cand.getUTCHours())}`;
    if (await headOk(singleUrl(run, 0, 'T_2M'), signal)) {
      runCache = { run, runAt: cand, at: Date.now() };
      return runCache;
    }
  }
  throw new Error('ICON-EU: kein publizierter Single-Level-Lauf gefunden');
}

/** Bilineares Sampling eines regulären lat-lon-Felds. NaN außerhalb/maskiert.
 *  ICON-EU-Scanrichtung berücksichtigt (scanMode-Bit 0x40 = j nach Norden). */
function sampleField(f: GribField, lat: number, lon: number): number {
  const jNorth = (f.scanMode & 64) !== 0;
  const lat0 = jNorth ? Math.min(f.lat1, f.lat2) : Math.max(f.lat1, f.lat2);
  const dlat = Math.abs(f.dj), dlon = Math.abs(f.di);
  const lon0 = Math.min(f.lon1, f.lon2);
  let dl = lon - lon0; if (dl < -180) dl += 360; else if (dl > 180) dl -= 360;
  const fi = dl / dlon;
  const fj = jNorth ? (lat - lat0) / dlat : (lat0 - lat) / dlat;
  if (fi < 0 || fi > f.ni - 1 || fj < 0 || fj > f.nj - 1) return NaN;
  const i0 = Math.floor(fi), j0 = Math.floor(fj);
  const i1 = Math.min(i0 + 1, f.ni - 1), j1 = Math.min(j0 + 1, f.nj - 1);
  const ti = fi - i0, tj = fj - j0;
  const v = f.values;
  const a = v[j0 * f.ni + i0], b = v[j0 * f.ni + i1], c = v[j1 * f.ni + i0], d = v[j1 * f.ni + i1];
  const corners = [a, b, c, d].filter(Number.isFinite);
  if (corners.length < 4) return corners.length ? corners[0] : NaN;
  return a * (1 - ti) * (1 - tj) + b * ti * (1 - tj) + c * (1 - ti) * tj + d * ti * tj;
}

async function fieldAtPoints(
  run: string, step: number, param: string, lats: number[], lngs: number[], signal?: AbortSignal,
): Promise<Float32Array> {
  const raw = await fetchDecompressedCached(singleUrl(run, step, param), signal);
  const f = decodeGrib2(raw);
  const out = new Float32Array(lats.length);
  for (let k = 0; k < lats.length; k++) out[k] = sampleField(f, lats[k], lngs[k]);
  return out;
}

/**
 * Lädt ICON-EU (single-level) als coarse `ForecastGrid`: Temperatur, Wind,
 * Gesamtbewölkung, Niederschlag. Bewusst 3-stündlich gedeckelt (0–6 h); die
 * kleinen bz2-Felder treffen den Decompressed-Cache → Reloads schnell.
 */
export async function fetchIconEuRasterGrid(options: IconEuRasterOptions = {}): Promise<ForecastGrid> {
  const cols = options.cols ?? 24;
  const rows = options.rows ?? 20;
  const total = cols * rows;
  const cap = Math.min(options.hours ?? MAX_STEP_DEFAULT, MAX_STEP_DEFAULT);
  const steps: number[] = [];
  for (let s = 0; s <= cap; s += 3) steps.push(s);

  const { run, runAt } = await resolveRun(options.signal);

  const lats = new Array<number>(total), lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = EU_BOUNDS.latMin + (j / Math.max(1, rows - 1)) * (EU_BOUNDS.latMax - EU_BOUNDS.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = EU_BOUNDS.lngMin + (i / Math.max(1, cols - 1)) * (EU_BOUNDS.lngMax - EU_BOUNDS.lngMin);
      lats[j * cols + i] = lat; lngs[j * cols + i] = lng;
    }
  }

  const VARS = ['T_2M', 'U_10M', 'V_10M', 'CLCT', 'TOT_PREC'] as const;
  const data: Record<string, Float32Array[]> = {};
  await Promise.all(VARS.map(async (v) => {
    data[v] = await Promise.all(steps.map((s) =>
      fieldAtPoints(run, s, v, lats, lngs, options.signal).catch(() => new Float32Array(total).fill(NaN))));
  }));

  const times: Date[] = [];
  const points: ForecastHourPoint[][] = [];
  for (let h = 0; h < steps.length; h++) {
    times.push(new Date(runAt.getTime() + steps[h] * 3600_000));
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const tK = data.T_2M[h][k];
      const t = Number.isFinite(tK) ? tK - KELVIN : null;
      const u = Number.isFinite(data.U_10M[h][k]) ? data.U_10M[h][k] : null;
      const v = Number.isFinite(data.V_10M[h][k]) ? data.V_10M[h][k] : null;
      const clRaw = data.CLCT[h][k];
      const total100 = correctCloudBias(Number.isFinite(clRaw) ? clRaw : null);
      // tot_prec ist akkumuliert → Stundenrate = Differenz zum Vorschritt.
      const accNow = data.TOT_PREC[h][k];
      const accPrev = h > 0 ? data.TOT_PREC[h - 1][k] : 0;
      const precip = Number.isFinite(accNow) && Number.isFinite(accPrev) ? Math.max(0, accNow - accPrev) : null;
      arr[k] = {
        temperature: t, u, v,
        cloudLow: total100 != null ? total100 * 0.55 : null,
        cloudMid: total100 != null ? total100 * 0.30 : null,
        cloudHigh: total100 != null ? total100 * 0.15 : null,
        precipitation: precip,
        model: 'icon_eu',
      };
    }
    points.push(arr);
  }

  return { cols, rows, bounds: EU_BOUNDS, times, points, fetchedAt: Date.now() };
}
