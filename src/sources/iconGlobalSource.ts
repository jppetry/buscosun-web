/**
 * DWD ICON global (single-level) — 2D-Raster (Temperatur, Wind, Wolken, Nieder-
 * schlag) als coarse `ForecastGrid` für den Per-Land-Modell-Switcher (Phase 4.9).
 *
 * ICON global liegt auf opendata.dwd.de NUR **icosahedral** vor (GDT 101,
 * ~2,95 M Zellen), ein Feld je Datei (deterministisch, kein Ensemble). Der
 * erweiterte `gribDecode` liest es; die Zellkoordinaten kommen aus den zeit-
 * invarianten CLAT/CLON-Feldern (analog ICON-D2-EPS). Da das Gitter GLOBAL ist,
 * wird der Nearest-Cell-Index über einen **DACH-bbox-Vorfilter** gebaut (nur
 * Zellen nahe DACH statt aller 2,9 M), sonst wäre der Scan unnötig teuer.
 *
 * Pipeline: clat/clon einmal (gecacht) → bbox-Kandidaten → Nearest je Ausgabe-
 * punkt → je (Variable, Step) EINE bz2-Datei → `fetchDecompressedCached` →
 * `decodeGrib2` → abtasten. Der FusionEngine interpoliert per IDW (Engine-Badge).
 */

import { fetchDecompressedCached } from './iconD2Precip';
import { decodeGrib2, type GribField } from './gribDecode';
import { correctCloudBias } from './cloudBias';
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const EU_BASE = '/_dwd_opendata/weather/nwp/icon/grib';
const KELVIN = 273.15;
const MAX_STEP_DEFAULT = 6;

const EU_BOUNDS: ForecastBounds = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };

export interface IconGlobalOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function pad3(n: number) { return String(n).padStart(3, '0'); }

/** Single-Level-URL (Parameter GROSS im Dateinamen, Verzeichnis klein). */
function singleUrl(run: string, step: number, param: string): string {
  const hh = run.slice(8, 10);
  const name = `icon_global_icosahedral_single-level_${run}_${pad3(step)}_${param}.grib2.bz2`;
  return `${EU_BASE}/${hh}/${param.toLowerCase()}/${name}`;
}
function invariantUrl(run: string, param: 'CLAT' | 'CLON'): string {
  const hh = run.slice(8, 10);
  const name = `icon_global_icosahedral_time-invariant_${run}_${param}.grib2.bz2`;
  return `${EU_BASE}/${hh}/${param.toLowerCase()}/${name}`;
}

const RUN_TTL_MS = 3 * 60 * 1000;
let runCache: { run: string; runAt: Date; at: number } | null = null;

async function headOk(url: string, signal?: AbortSignal): Promise<boolean> {
  try { return (await fetch(url, { method: 'HEAD', signal })).ok; } catch { return false; }
}

/** Jüngsten publizierten Lauf finden (ICON global läuft alle 6 h; HEAD auf T_2M). */
async function resolveRun(signal?: AbortSignal): Promise<{ run: string; runAt: Date }> {
  if (runCache && Date.now() - runCache.at < RUN_TTL_MS) return runCache;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 6));
  for (let back = 0; back < 6; back++) {
    if (signal?.aborted) throw new Error('aborted');
    const cand = new Date(now.getTime() - back * 6 * 3600_000);
    const run = `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}${pad2(cand.getUTCHours())}`;
    if (await headOk(singleUrl(run, 0, 'T_2M'), signal)) {
      runCache = { run, runAt: cand, at: Date.now() };
      return runCache;
    }
  }
  throw new Error('ICON global: kein publizierter Lauf gefunden');
}

// --- clat/clon → Nearest-Cell-Index über DACH-bbox-Kandidaten (gecacht) --------

interface CellCoords { lat: Float32Array; lon: Float32Array; n: number; }
let coordsPromise: Promise<CellCoords> | null = null;

function normLon(lon: number): number { return lon > 180 ? lon - 360 : lon; }

async function invariant(run: string, param: 'CLAT' | 'CLON', signal?: AbortSignal): Promise<GribField> {
  const raw = await fetchDecompressedCached(invariantUrl(run, param), signal);
  return decodeGrib2(raw);
}

function getCellCoords(run: string, signal?: AbortSignal): Promise<CellCoords> {
  if (!coordsPromise) {
    coordsPromise = (async () => {
      const [clat, clon] = await Promise.all([invariant(run, 'CLAT', signal), invariant(run, 'CLON', signal)]);
      const lon = new Float32Array(clon.values.length);
      for (let i = 0; i < lon.length; i++) lon[i] = normLon(clon.values[i]);
      return { lat: clat.values, lon, n: clat.ni };
    })().catch((e) => { coordsPromise = null; throw e; });
  }
  return coordsPromise;
}

/**
 * Nearest-Cell-Index je Ausgabepunkt. Da das Gitter global ist, werden zuerst
 * die Zellen im DACH-bbox (+2° Rand) als Kandidaten gesammelt und nur über diese
 * gescannt (statt über alle ~2,9 M Zellen).
 */
function nearestIndex(coords: CellCoords, lats: number[], lngs: number[]): Int32Array {
  const { lat, lon, n } = coords;
  const latLo = EU_BOUNDS.latMin - 2, latHi = EU_BOUNDS.latMax + 2;
  const lonLo = EU_BOUNDS.lngMin - 2, lonHi = EU_BOUNDS.lngMax + 2;
  const cand: number[] = [];
  for (let i = 0; i < n; i++) {
    if (lat[i] >= latLo && lat[i] <= latHi && lon[i] >= lonLo && lon[i] <= lonHi) cand.push(i);
  }
  const out = new Int32Array(lats.length);
  for (let p = 0; p < lats.length; p++) {
    const la = lats[p], lo = lngs[p];
    let best = -1, bestD = Infinity;
    for (const i of cand) {
      const dLa = lat[i] - la, dLo = lon[i] - lo;
      const d = dLa * dLa + dLo * dLo;
      if (d < bestD) { bestD = d; best = i; }
    }
    out[p] = best;
  }
  return out;
}

async function fieldAtPoints(run: string, step: number, param: string, idx: Int32Array, signal?: AbortSignal): Promise<Float32Array> {
  const raw = await fetchDecompressedCached(singleUrl(run, step, param), signal);
  const f = decodeGrib2(raw);
  const out = new Float32Array(idx.length);
  for (let p = 0; p < idx.length; p++) { const v = f.values[idx[p]]; out[p] = Number.isFinite(v) ? v : NaN; }
  return out;
}

/** Lädt ICON global als coarse `ForecastGrid` (Temperatur/Wind/Wolken/Niederschlag). */
export async function fetchIconGlobalGrid(options: IconGlobalOptions = {}): Promise<ForecastGrid> {
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

  const coords = await getCellCoords(run, options.signal);
  const idx = nearestIndex(coords, lats, lngs);

  const VARS = ['T_2M', 'U_10M', 'V_10M', 'CLCT', 'TOT_PREC'] as const;
  const data: Record<string, Float32Array[]> = {};
  await Promise.all(VARS.map(async (v) => {
    data[v] = await Promise.all(steps.map((s) =>
      fieldAtPoints(run, s, v, idx, options.signal).catch(() => new Float32Array(total).fill(NaN))));
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
      const accNow = data.TOT_PREC[h][k];
      const accPrev = h > 0 ? data.TOT_PREC[h - 1][k] : 0;
      const precip = Number.isFinite(accNow) && Number.isFinite(accPrev) ? Math.max(0, accNow - accPrev) : null;
      arr[k] = {
        temperature: t, u, v,
        cloudLow: total100 != null ? total100 * 0.55 : null,
        cloudMid: total100 != null ? total100 * 0.30 : null,
        cloudHigh: total100 != null ? total100 * 0.15 : null,
        precipitation: precip,
        model: 'icon_global',
      };
    }
    points.push(arr);
  }

  return { cols, rows, bounds: EU_BOUNDS, times, points, fetchedAt: Date.now() };
}
