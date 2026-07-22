/**
 * DWD ICON-D2-EPS — Ensemble-Mittel als coarse `ForecastGrid` für den Per-Land-
 * Modell-Switcher (Phase 4.1, `docs/model-switcher-gate0.md`).
 *
 * ICON-D2-EPS liegt auf opendata.dwd.de NUR als natives **icosahedrales** Gitter
 * vor (GDT 101, ~542 040 Zellen, ~20 Member je Step-Datei, DRT 42/CCSDS-AEC).
 * Der erweiterte `gribDecode` (GDT 101 + `decodeGrib2All`) liest das; die
 * Zellkoordinaten kommen aus den zeitinvarianten `clat`/`clon`-Feldern.
 *
 * Pipeline: je (Variable, Step) EINE Datei → alle Member dekodieren → Zell-
 * Ensemble-Mittel → an einem **coarse** Ausgabe-Gitter (clat/clon-Nearest)
 * abtasten → `ForecastGrid` (wie AROME/INCA). Der FusionEngine interpoliert es
 * per IDW auf die dichte Karte; das Raster trägt daher den Engine-Qualitäts-Badge.
 *
 * **Kostenrealität:** EPS-Dateien sind groß (~16 MB entpackt). Deshalb bewusst
 * eng gedeckelt (wenige Steps × wenige Member) und im Hintergrund geladen; die
 * entpackten Bytes werden über `fetchDecompressedCached` (Cache API) wieder-
 * verwendet, sodass Reloads schnell sind. CC BY 4.0, kein Key.
 *
 * Transport (Phase T2b-2, audit/layer-transport.md §H): Directory-Listings
 * (Lauf-Discovery) laufen weiter über `/_dwd_opendata`; die großen Byte-Fetches
 * laufen über den durablen Edge-Proxy `/_dwd_grib` — Base-Split wie Precip/T1.
 */

import { fetchDecompressedCached } from './iconD2Precip';
import { decodeGrib2All, type GribField } from './gribDecode';
import { correctCloudBias } from './cloudBias';
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

/** Basis für Directory-LISTINGS (Lauf-Discovery): bleibt auf dem Pass-Through-
 *  Rewrite — die datei-only Edge-Function kann keine Listings bedienen. */
const EPS_BASE = '/_dwd_opendata/weather/nwp/icon-d2-eps/grib';
/** Basis für die `.grib2.bz2`-BYTE-Fetches (Steps + clat/clon-Invarianten):
 *  Phase T2b-2 — durch den durablen Edge-Proxy (netlify/edge-functions/
 *  dwd-grib.ts) + Warm-Cron (scripts/warm-grib.mjs), wie Precip/T1. Dieselben
 *  Bytes, derselbe Decode — nur gecachte Herkunft statt 4–15 s DWD-Kaltpfad. */
const EPS_GRIB_PROXY_BASE = '/_dwd_grib/weather/nwp/icon-d2-eps/grib';
const KELVIN = 273.15;

/** Deckelung (Perf): so viele Member fürs Mittel, so viele Vorlaufstunden. */
const MAX_MEMBERS = 8;
const MAX_STEP_DEFAULT = 6;

export interface IconD2EpsOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function pad3(n: number) { return String(n).padStart(3, '0'); }

interface EpsRun { runStr: string; runAt: Date; steps: number[]; }
const runCache = new Map<string, { at: number; run: EpsRun }>();
const RUN_TTL = 3 * 60 * 1000;

/** Listet ein EPS-Param-Verzeichnis und parst die verfügbaren Steps (icosahedral). */
async function listSteps(runStr: string, param: string, signal?: AbortSignal): Promise<number[]> {
  const hh = runStr.slice(8, 10);
  const res = await fetch(`${EPS_BASE}/${hh}/${param}/`, { signal });
  if (!res.ok) return [];
  const html = await res.text();
  const re = new RegExp(`icon-d2-eps_germany_icosahedral_single-level_${runStr}_(\\d{3})_2d_${param}\\.grib2\\.bz2`, 'g');
  const steps = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) steps.add(parseInt(m[1], 10));
  return [...steps].sort((a, b) => a - b);
}

/** Jüngsten publizierten EPS-Lauf finden (Rückwärtssuche in 3-h-Schritten). */
async function resolveLatestEpsRun(signal?: AbortSignal): Promise<EpsRun> {
  const cached = runCache.get('t_2m');
  if (cached && Date.now() - cached.at < RUN_TTL) return cached.run;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 6; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const runStr = `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}${pad2(cand.getUTCHours())}`;
    let steps: number[];
    try { steps = await listSteps(runStr, 't_2m', signal); } catch { continue; }
    if (steps.length > 0 && Math.max(...steps) >= MAX_STEP_DEFAULT) {
      const run: EpsRun = { runStr, runAt: cand, steps };
      runCache.set('t_2m', { at: Date.now(), run });
      return run;
    }
  }
  throw new Error('ICON-D2-EPS: kein publizierter Lauf gefunden');
}

// --- clat/clon → Nearest-Cell-Index (invariant, pro Ausgabe-Gitter gecacht) -----

interface CellCoords { lat: Float32Array; lon: Float32Array; n: number; }
let coordsPromise: Promise<CellCoords> | null = null;

/** clat/clon values sind Radiant, falls |max|<1.6 → in Grad wandeln. */
function toDegrees(values: Float32Array): Float32Array {
  let maxAbs = 0;
  for (let i = 0; i < values.length; i++) { const a = Math.abs(values[i]); if (a > maxAbs) maxAbs = a; }
  const f = maxAbs < 1.6 ? 180 / Math.PI : 1;
  if (f === 1) return values;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i] * f;
  return out;
}

async function invariant(runStr: string, param: string, signal?: AbortSignal): Promise<GribField> {
  const hh = runStr.slice(8, 10);
  const name = `icon-d2-eps_germany_icosahedral_time-invariant_${runStr}_000_0_${param}.grib2.bz2`;
  const raw = await fetchDecompressedCached(`${EPS_GRIB_PROXY_BASE}/${hh}/${param}/${name}`, signal);
  const fields = decodeGrib2All(raw);
  if (!fields.length) throw new Error(`ICON-D2-EPS ${param}: leer`);
  return fields[0];
}

function getCellCoords(runStr: string, signal?: AbortSignal): Promise<CellCoords> {
  if (!coordsPromise) {
    coordsPromise = (async () => {
      const [clat, clon] = await Promise.all([
        invariant(runStr, 'clat', signal),
        invariant(runStr, 'clon', signal),
      ]);
      return { lat: toDegrees(clat.values), lon: toDegrees(clon.values), n: clat.ni };
    })().catch((e) => { coordsPromise = null; throw e; });
  }
  return coordsPromise;
}

/**
 * Baut für ein coarse Ausgabe-Gitter je Zelle den Index der nächsten
 * icosahedralen Zelle (ein linearer Scan über ~542 k Zellen je Ausgabepunkt,
 * einmalig; die Zellzahl ist klein → ~10⁸ Ops, ~1 s, dann gecacht).
 */
function nearestIndex(coords: CellCoords, lats: number[], lngs: number[]): Int32Array {
  const out = new Int32Array(lats.length);
  const { lat, lon, n } = coords;
  for (let p = 0; p < lats.length; p++) {
    const la = lats[p], lo = lngs[p];
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dLa = lat[i] - la, dLo = lon[i] - lo;
      const d = dLa * dLa + dLo * dLo;
      if (d < bestD) { bestD = d; best = i; }
    }
    out[p] = best;
  }
  return out;
}

/** Zell-Ensemble-Mittel eines (Variable, Step)-Files an den Ausgabepunkten. */
async function meanAtPoints(
  runStr: string, param: string, step: number, idx: Int32Array, signal?: AbortSignal,
): Promise<Float32Array> {
  const hh = runStr.slice(8, 10);
  const name = `icon-d2-eps_germany_icosahedral_single-level_${runStr}_${pad3(step)}_2d_${param}.grib2.bz2`;
  const raw = await fetchDecompressedCached(`${EPS_GRIB_PROXY_BASE}/${hh}/${param}/${name}`, signal);
  const members = decodeGrib2All(raw).slice(0, MAX_MEMBERS);
  const out = new Float32Array(idx.length);
  for (let p = 0; p < idx.length; p++) {
    const cell = idx[p];
    let sum = 0, cnt = 0;
    for (const f of members) { const v = f.values[cell]; if (Number.isFinite(v)) { sum += v; cnt++; } }
    out[p] = cnt ? sum / cnt : NaN;
  }
  return out;
}

/** ICON-D2-Domäne (aus clat/clon-Extent), leicht eingerückt für das Ausgabe-Gitter. */
const EPS_BOUNDS: ForecastBounds = { lngMin: 1.0, lngMax: 17.0, latMin: 44.0, latMax: 57.0 };

/**
 * Lädt das ICON-D2-EPS-Ensemble-Mittel als coarse `ForecastGrid`. Bewusst eng
 * gedeckelt (≤ MAX_STEP_DEFAULT h, ≤ MAX_MEMBERS Member) — der teure Teil ist das
 * bz2-Entpacken der großen EPS-Dateien; Reloads treffen den Decompressed-Cache.
 */
export async function fetchIconD2EpsGrid(options: IconD2EpsOptions = {}): Promise<ForecastGrid> {
  const cols = options.cols ?? 14;
  const rows = options.rows ?? 9;
  const total = cols * rows;
  const run = await resolveLatestEpsRun(options.signal);
  // 3-stündliche Stützstellen (0/3/6 h): EPS-Dateien sind groß (~16 MB entpackt,
  // ~20 Member) → wenige Steps × 5 Variablen halten die Ladelast tragbar. Der
  // FusionEngine/frameInterp glättet die Zwischenstunden.
  const cap = Math.min(options.hours ?? MAX_STEP_DEFAULT, MAX_STEP_DEFAULT);
  const wanted = run.steps.filter((s) => s <= cap && s % 3 === 0);
  if (wanted.length === 0) throw new Error('ICON-D2-EPS: keine Steps im Horizont');

  // Ausgabe-Gitter über die EPS-Domäne.
  const lats = new Array<number>(total), lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = EPS_BOUNDS.latMin + (j / Math.max(1, rows - 1)) * (EPS_BOUNDS.latMax - EPS_BOUNDS.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = EPS_BOUNDS.lngMin + (i / Math.max(1, cols - 1)) * (EPS_BOUNDS.lngMax - EPS_BOUNDS.lngMin);
      lats[j * cols + i] = lat; lngs[j * cols + i] = lng;
    }
  }

  const coords = await getCellCoords(run.runStr, options.signal);
  const idx = nearestIndex(coords, lats, lngs);

  // Alle (Variable, Step) parallel (bounded via Promise.all über die kleine Menge).
  const VARS = ['t_2m', 'u_10m', 'v_10m', 'clct', 'tot_prec'] as const;
  const fieldData: Record<string, Float32Array[]> = {};
  await Promise.all(VARS.map(async (v) => {
    fieldData[v] = await Promise.all(wanted.map((s) =>
      meanAtPoints(run.runStr, v, s, idx, options.signal).catch(() => new Float32Array(total).fill(NaN)),
    ));
  }));

  const times: Date[] = [];
  const points: ForecastHourPoint[][] = [];
  for (let h = 0; h < wanted.length; h++) {
    times.push(new Date(run.runAt.getTime() + wanted[h] * 3600_000));
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const tK = fieldData.t_2m[h][k];
      const t = Number.isFinite(tK) ? tK - KELVIN : null;
      const u = Number.isFinite(fieldData.u_10m[h][k]) ? fieldData.u_10m[h][k] : null;
      const v = Number.isFinite(fieldData.v_10m[h][k]) ? fieldData.v_10m[h][k] : null;
      const clRaw = fieldData.clct[h][k];
      const total100 = correctCloudBias(Number.isFinite(clRaw) ? clRaw : null);
      // tot_prec ist akkumuliert → Stundenrate = Differenz zum Vorschritt.
      const accNow = fieldData.tot_prec[h][k];
      const accPrev = h > 0 ? fieldData.tot_prec[h - 1][k] : 0;
      const precip = Number.isFinite(accNow) && Number.isFinite(accPrev) ? Math.max(0, accNow - accPrev) : null;
      arr[k] = {
        temperature: t, u, v,
        cloudLow: total100 != null ? total100 * 0.55 : null,
        cloudMid: total100 != null ? total100 * 0.30 : null,
        cloudHigh: total100 != null ? total100 * 0.15 : null,
        precipitation: precip,
        model: 'icon_d2_eps',
      };
    }
    points.push(arr);
  }

  return { cols, rows, bounds: EPS_BOUNDS, times, points, fetchedAt: Date.now() };
}
