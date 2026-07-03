/**
 * ECMWF IFS (Open Data, 0,25°) — globales 2D-Raster (Temperatur, Wind, Wolken,
 * Niederschlag) als coarse `ForecastGrid` für den Per-Land-Modell-Switcher
 * (Phase 4.7). IFS ist global (deckt DACH), CC BY 4.0, ohne Key.
 *
 * ECMWF Open Data liefert je Step eine GRIB2-Datei PLUS ein `.index`-Sidecar
 * (JSON-Lines mit `_offset`/`_length` je Feld) → **direkter HTTP-Range** je
 * Parameter (wie GFS/idx), keine Header-Walks. Felder ~0,7 MB. Reguläres lat-lon
 * (GDT 0, 1440×721), Längen-Ursprung 180° (0–360, gewrappt) → wrap-aware Sampling.
 * Der Decoder liest die Packung (DRT 0/1/42) direkt.
 *
 * Bewusst 3-stündlich 0–6 h gedeckelt; der FusionEngine interpoliert das coarse
 * Gitter per IDW (Engine-Qualitäts-Badge).
 */

import { decodeGrib2, type GribField } from './gribDecode';
import { correctCloudBias } from './cloudBias';
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const KELVIN = 273.15;
const MAX_STEP_DEFAULT = 6;

// Browser: CORS-Proxy `/_ecmwf`. Node (Verify): kein CORS → direkt.
const ECMWF_BASE = typeof window === 'undefined'
  ? 'https://data.ecmwf.int/forecasts'
  : '/_ecmwf/forecasts';

const EU_BOUNDS: ForecastBounds = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };

export interface EcmwfIfsOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

/** Pfad-Stamm einer (Lauf, Step)-Datei ohne Endung. */
function stem(date: string, hh: string, step: number): string {
  return `${ECMWF_BASE}/${date}/${hh}z/ifs/0p25/oper/${date}${hh}0000-${step}h-oper-fc`;
}

interface IfsRun { date: string; hh: string; runAt: Date; }
let runCache: { at: number; run: IfsRun } | null = null;
const RUN_TTL = 5 * 60 * 1000;

async function headOk(url: string, signal?: AbortSignal): Promise<boolean> {
  try { return (await fetch(url, { method: 'HEAD', signal })).ok; } catch { return false; }
}

/** Jüngsten publizierten Lauf finden (6-h-Läufe rückwärts; ~7–9 h Publikationslag). */
async function resolveRun(signal?: AbortSignal): Promise<IfsRun> {
  if (runCache && Date.now() - runCache.at < RUN_TTL) return runCache.run;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 6));
  for (let back = 1; back < 8; back++) {
    const cand = new Date(now.getTime() - back * 6 * 3600_000);
    const date = `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}`;
    const hh = pad2(cand.getUTCHours());
    if (await headOk(`${stem(date, hh, 0)}.index`, signal)) {
      const run = { date, hh, runAt: cand };
      runCache = { at: Date.now(), run };
      return run;
    }
  }
  throw new Error('ECMWF IFS: kein publizierter Lauf gefunden');
}

interface IdxEntry { param: string; levtype?: string; _offset: number; _length: number; }

/** `.index` laden (JSON-Lines) und nach Oberflächenfeldern indizieren. */
async function loadIndex(date: string, hh: string, step: number, signal?: AbortSignal): Promise<Map<string, IdxEntry>> {
  const res = await fetch(`${stem(date, hh, step)}.index`, { signal });
  if (!res.ok) throw new Error(`ECMWF IFS: index ${res.status}`);
  const map = new Map<string, IdxEntry>();
  for (const line of (await res.text()).trim().split('\n')) {
    if (!line) continue;
    const e = JSON.parse(line) as IdxEntry;
    if (e.levtype && e.levtype !== 'sfc') continue;
    if (!map.has(e.param)) map.set(e.param, e);
  }
  return map;
}

/** Ein Feld per Byte-Range aus der GRIB2-Datei holen + dekodieren. */
async function fetchField(date: string, hh: string, step: number, e: IdxEntry, signal?: AbortSignal): Promise<GribField> {
  const res = await fetch(`${stem(date, hh, step)}.grib2`, {
    headers: { Range: `bytes=${e._offset}-${e._offset + e._length - 1}` }, signal,
  });
  if (!res.ok && res.status !== 206) throw new Error(`ECMWF IFS: Range ${res.status}`);
  return decodeGrib2(new Uint8Array(await res.arrayBuffer()));
}

/** Wrap-aware Nearest-Sampling eines globalen regulären lat-lon-Felds (Längen-
 *  Ursprung beliebig, 0–360 mit Umlauf). */
function sampleGlobal(f: GribField, lat: number, lon: number): number {
  const lon1 = f.lon1 < 0 ? f.lon1 + 360 : f.lon1;
  const di = Math.abs(f.di), dj = Math.abs(f.dj);
  const t = ((lon % 360) + 360) % 360;
  let ci = Math.round((((t - lon1) % 360) + 360) % 360 / di);
  ci = ((ci % f.ni) + f.ni) % f.ni;
  const north = Math.max(f.lat1, f.lat2);
  let rj = Math.round((north - lat) / dj);
  rj = Math.max(0, Math.min(f.nj - 1, rj));
  return f.values[rj * f.ni + ci];
}

/** Lädt ECMWF IFS als coarse `ForecastGrid` (Temperatur/Wind/Wolken/Niederschlag). */
export async function fetchEcmwfIfsGrid(options: EcmwfIfsOptions = {}): Promise<ForecastGrid> {
  const cols = options.cols ?? 24;
  const rows = options.rows ?? 20;
  const total = cols * rows;
  const cap = Math.min(options.hours ?? MAX_STEP_DEFAULT, MAX_STEP_DEFAULT);
  const steps: number[] = [];
  for (let s = 0; s <= cap; s += 3) steps.push(s);

  const { date, hh, runAt } = await resolveRun(options.signal);

  const lats = new Array<number>(total), lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = EU_BOUNDS.latMin + (j / Math.max(1, rows - 1)) * (EU_BOUNDS.latMax - EU_BOUNDS.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = EU_BOUNDS.lngMin + (i / Math.max(1, cols - 1)) * (EU_BOUNDS.lngMax - EU_BOUNDS.lngMin);
      lats[j * cols + i] = lat; lngs[j * cols + i] = lng;
    }
  }

  const PARAMS = ['2t', '10u', '10v', 'tcc', 'tp'] as const;
  const perStep = await Promise.all(steps.map(async (step) => {
    const idx = await loadIndex(date, hh, step, options.signal).catch(() => null);
    if (!idx) return null;
    const out: Record<string, Float32Array> = {};
    await Promise.all(PARAMS.map(async (p) => {
      const e = idx.get(p);
      const arr = new Float32Array(total).fill(NaN);
      if (e) {
        const f = await fetchField(date, hh, step, e, options.signal).catch(() => null);
        if (f) for (let k = 0; k < total; k++) arr[k] = sampleGlobal(f, lats[k], lngs[k]);
      }
      out[p] = arr;
    }));
    return out;
  }));

  const times: Date[] = [];
  const points: ForecastHourPoint[][] = [];
  for (let h = 0; h < steps.length; h++) {
    const s = perStep[h];
    if (!s) continue;
    times.push(new Date(runAt.getTime() + steps[h] * 3600_000));
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const tK = s['2t'][k];
      const t = Number.isFinite(tK) ? tK - KELVIN : null;
      const u = Number.isFinite(s['10u'][k]) ? s['10u'][k] : null;
      const v = Number.isFinite(s['10v'][k]) ? s['10v'][k] : null;
      // IFS tcc ist 0..1 → auf 0..100 skalieren.
      const tccRaw = s['tcc'][k];
      const total100 = correctCloudBias(Number.isFinite(tccRaw) ? tccRaw * 100 : null);
      // IFS tp ist akkumuliert in METERN → mm = ×1000; Rate = Differenz zum Vorschritt.
      const accNow = Number.isFinite(s['tp'][k]) ? s['tp'][k] * 1000 : NaN;
      const accPrev = h > 0 && perStep[h - 1] && Number.isFinite(perStep[h - 1]!['tp'][k])
        ? perStep[h - 1]!['tp'][k] * 1000 : 0;
      const precip = Number.isFinite(accNow) ? Math.max(0, accNow - accPrev) : null;
      arr[k] = {
        temperature: t, u, v,
        cloudLow: total100 != null ? total100 * 0.55 : null,
        cloudMid: total100 != null ? total100 * 0.30 : null,
        cloudHigh: total100 != null ? total100 * 0.15 : null,
        precipitation: precip,
        model: 'ecmwf_ifs',
      };
    }
    points.push(arr);
  }
  if (points.length === 0) throw new Error('ECMWF IFS: keine Felder dekodiert');

  return { cols, rows, bounds: EU_BOUNDS, times, points, fetchedAt: Date.now() };
}
