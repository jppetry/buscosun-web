/**
 * DWD AICON (KI-Modell) — globales 2D-Raster (Temperatur, Wind, Niederschlag) als
 * coarse `ForecastGrid` für den Per-Land-Modell-Switcher (Phase 4.10). AICON ist
 * DWDs KI-Pendant zu ICON, global (deckt DACH), CC BY 4.0, ohne Key.
 *
 * AICON liegt auf opendata.dwd.de unter `v1/m/aicon/p/<PARAM>/r/<RUN>/s/PT…grib2`
 * als **rohes** GRIB2 (kein bz2) auf demselben **icosahedralen** Gitter wie
 * ICON global (2,95 M Zellen, identische Zellordnung) vor — publiziert aber keine
 * eigenen clat/clon. Der Adapter leiht sich daher den Nearest-Cell-Index von
 * `iconGlobalSource` (`iconGlobalNearestIndex`, empirisch gitter-identisch
 * verifiziert). Felder: T_2M/U_10M/V_10M/TOT_PREC — **kein CLCT** → Wolken bleiben
 * null (Engine ignoriert sie). Der FusionEngine interpoliert per IDW (Engine-Badge).
 */

import { decodeGrib2 } from './gribDecode';
import { iconGlobalNearestIndex } from './iconGlobalSource';
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const EU_BASE = '/_dwd_opendata/weather/nwp/v1/m/aicon/p';
const KELVIN = 273.15;
const MAX_STEP_DEFAULT = 6;

const EU_BOUNDS: ForecastBounds = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };

export interface AiconOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function pad3(n: number) { return String(n).padStart(3, '0'); }

/** Lauf-Zeitstempel im AICON-Pfadformat `YYYY-MM-DDTHH:00`. */
function runStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:00`;
}

/** Feld-URL (rohes grib2). */
function fieldUrl(run: string, param: string, step: number): string {
  return `${EU_BASE}/${param}/r/${run}/s/PT${pad3(step)}H00M.grib2`;
}

const RUN_TTL_MS = 3 * 60 * 1000;
let runCache: { run: string; runAt: Date; at: number } | null = null;

async function headOk(url: string, signal?: AbortSignal): Promise<boolean> {
  try { return (await fetch(url, { method: 'HEAD', signal })).ok; } catch { return false; }
}

/** Jüngsten publizierten AICON-Lauf finden (6-h-Läufe rückwärts, HEAD auf T_2M). */
async function resolveRun(signal?: AbortSignal): Promise<{ run: string; runAt: Date }> {
  if (runCache && Date.now() - runCache.at < RUN_TTL_MS) return runCache;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 6));
  for (let back = 0; back < 6; back++) {
    if (signal?.aborted) throw new Error('aborted');
    const cand = new Date(now.getTime() - back * 6 * 3600_000);
    const run = runStr(cand);
    if (await headOk(fieldUrl(run, 'T_2M', 0), signal)) {
      runCache = { run, runAt: cand, at: Date.now() };
      return runCache;
    }
  }
  throw new Error('AICON: kein publizierter Lauf gefunden');
}

async function fieldAtPoints(run: string, param: string, step: number, idx: Int32Array, signal?: AbortSignal): Promise<Float32Array> {
  const res = await fetch(fieldUrl(run, param, step), { signal });
  if (!res.ok) throw new Error(`AICON: ${res.status} (${param})`);
  const f = decodeGrib2(new Uint8Array(await res.arrayBuffer()));
  const out = new Float32Array(idx.length);
  for (let p = 0; p < idx.length; p++) { const v = f.values[idx[p]]; out[p] = Number.isFinite(v) ? v : NaN; }
  return out;
}

/** Lädt AICON als coarse `ForecastGrid` (Temperatur/Wind/Niederschlag; keine Wolken). */
export async function fetchAiconGrid(options: AiconOptions = {}): Promise<ForecastGrid> {
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

  // Koordinaten/Nearest-Index vom (gitter-identischen) ICON-global leihen.
  const idx = await iconGlobalNearestIndex(lats, lngs, options.signal);

  const VARS = ['T_2M', 'U_10M', 'V_10M', 'TOT_PREC'] as const;
  const data: Record<string, Float32Array[]> = {};
  await Promise.all(VARS.map(async (v) => {
    data[v] = await Promise.all(steps.map((s) =>
      fieldAtPoints(run, v, s, idx, options.signal).catch(() => new Float32Array(total).fill(NaN))));
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
      const accNow = data.TOT_PREC[h][k];
      const accPrev = h > 0 ? data.TOT_PREC[h - 1][k] : 0;
      const precip = Number.isFinite(accNow) && Number.isFinite(accPrev) ? Math.max(0, accNow - accPrev) : null;
      arr[k] = {
        temperature: t, u, v,
        cloudLow: null, cloudMid: null, cloudHigh: null,
        precipitation: precip,
        model: 'aicon',
      };
    }
    points.push(arr);
  }

  return { cols, rows, bounds: EU_BOUNDS, times, points, fetchedAt: Date.now() };
}
