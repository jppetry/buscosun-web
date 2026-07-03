/**
 * Météo-France ARPEGE (global, 0,25°) — 2D-Raster (Temperatur + Wind) als coarse
 * `ForecastGrid` für den Per-Land-Modell-Switcher (Phase 4.6/4.13). Global, CC/
 * Etalab, ohne Key; gleicher OVH-S3 + `/_mf`-Proxy wie AROME-France.
 *
 * **Kernproblem (Gate 0):** ARPEGE-Pakete BÜNDELN Mehrfach-Steps (`SP1__000H024H`
 * = Steps 0–24) → ~264 MB je Datei, und es gibt **kein `.idx`-Sidecar**. Der
 * Zugriff erfolgt daher über einen **Header-Walk**: je Nachricht nur der Kopf
 * (Sektion 0 `totalLen` + Sektion 4 cat/num/level/Vorlaufzeit) per kleinem
 * Byte-Range gelesen, bis die gewünschten Felder gefunden sind; dann werden NUR
 * diese Nachrichten voll geladen (~0,5 MB) + dekodiert (GDT 0, DRT 42/AEC).
 * Reguläres lat-lon 1440×721, Längen-Ursprung 0 (0–360) → wrap-aware Sampling.
 *
 * SP1 enthält Temperatur + Wind (kein Wolken/Niederschlag → SP2, spätere Stufe).
 * Bewusst eng gedeckelt (Steps 0/3/6); Ergebnis wird in loadFusedForecast ~10 min
 * gecacht, sodass der (durch den Walk) teure Erstabruf nur einmal anfällt.
 */

import { decodeGrib2, type GribField } from './gribDecode';
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const KELVIN = 273.15;
const MAX_STEP_DEFAULT = 6;
// Browser: `/_mf`-Proxy. Node (Verify): kein CORS → direkt.
const MF_BASE = typeof window === 'undefined'
  ? 'https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt'
  : '/_mf/pnt';

const EU_BOUNDS: ForecastBounds = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };

export interface ArpegeOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

function sp1Url(run: string): string {
  return `${MF_BASE}/${run}/arpege/025/SP1/arpege__025__SP1__000H024H__${run}.grib2`;
}

interface ArpegeRun { run: string; runAt: Date; }
let runCache: { at: number; run: ArpegeRun } | null = null;
const RUN_TTL = 5 * 60 * 1000;

function pad2(n: number) { return String(n).padStart(2, '0'); }
function runStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:00:00Z`;
}

async function head4(url: string, signal?: AbortSignal): Promise<boolean> {
  try { return (await fetch(url, { headers: { Range: 'bytes=0-3' }, signal })).ok; } catch { return false; }
}

/** Jüngsten publizierten ARPEGE-Lauf finden (3-h-Läufe rückwärts, ~2,5 h Lag). */
async function resolveRun(signal?: AbortSignal): Promise<ArpegeRun> {
  if (runCache && Date.now() - runCache.at < RUN_TTL) return runCache.run;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 1; back < 8; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run = runStr(cand);
    if (await head4(sp1Url(run), signal)) { const r = { run, runAt: cand }; runCache = { at: Date.now(), run: r }; return r; }
  }
  throw new Error('ARPEGE: kein publizierter Lauf gefunden');
}

// --- Header-Walk: Ziel-Nachrichten (cat,num,level,step) → Byte-Bereiche --------

interface Target { key: string; cat: number; num: number; level: number; step: number; }
interface Found { offset: number; length: number; }

/** Kopf einer Nachricht ab `offset` lesen: totalLen + cat/num/level/Vorlaufzeit. */
async function readHeader(url: string, offset: number, signal?: AbortSignal): Promise<
  { totalLen: number; cat?: number; num?: number; level?: number; step?: number } | null> {
  const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + 767}` }, signal });
  if (!res.ok && res.status !== 206) return null;
  const b = new Uint8Array(await res.arrayBuffer());
  if (b.length < 16 || !(b[0] === 0x47 && b[1] === 0x52 && b[2] === 0x49 && b[3] === 0x42)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const totalLen = Number(dv.getBigUint64(8));
  let so = 16, cat, num, level, step;
  while (so < b.length - 4) {
    if (b[so] === 0x37 && b[so + 1] === 0x37 && b[so + 2] === 0x37 && b[so + 3] === 0x37) break;
    const sl = dv.getUint32(so), sn = b[so + 4];
    if (sn === 4) {
      cat = b[so + 9]; num = b[so + 10]; step = dv.getUint32(so + 18);
      const sfc = b[so + 22], sc = b[so + 23], sv = dv.getUint32(so + 24);
      level = (sfc !== 255 && sv !== 0xffffffff) ? sv * Math.pow(10, -(sc > 127 ? sc - 256 : sc)) : undefined;
    }
    if (sl < 5 || so + sl > b.length) break; so += sl;
  }
  return { totalLen, cat, num, level, step };
}

/** Wrap-aware Nearest-Sampling eines globalen regulären lat-lon-Felds. */
function sampleGlobal(f: GribField, lat: number, lon: number): number {
  const lon1 = f.lon1 < 0 ? f.lon1 + 360 : f.lon1;
  const di = Math.abs(f.di), dj = Math.abs(f.dj);
  const t = ((lon % 360) + 360) % 360;
  let ci = Math.round((((t - lon1) % 360) + 360) % 360 / di);
  ci = ((ci % f.ni) + f.ni) % f.ni;
  const north = Math.max(f.lat1, f.lat2);
  let rj = Math.max(0, Math.min(f.nj - 1, Math.round((north - lat) / dj)));
  return f.values[rj * f.ni + ci];
}

/** Lädt ARPEGE (SP1: Temperatur + Wind) als coarse `ForecastGrid`. */
export async function fetchArpegeGrid(options: ArpegeOptions = {}): Promise<ForecastGrid> {
  const cols = options.cols ?? 24;
  const rows = options.rows ?? 20;
  const total = cols * rows;
  const cap = Math.min(options.hours ?? MAX_STEP_DEFAULT, MAX_STEP_DEFAULT);
  const steps: number[] = [];
  for (let s = 0; s <= cap; s += 3) steps.push(s);

  const { run, runAt } = await resolveRun(options.signal);
  const url = sp1Url(run);

  // Ziel-Nachrichten: 2t / 10u / 10v je Step.
  const VARS = [
    { k: 't', cat: 0, num: 0, level: 2 },
    { k: 'u', cat: 2, num: 2, level: 10 },
    { k: 'v', cat: 2, num: 3, level: 10 },
  ];
  const targets = new Map<string, Target>();
  for (const v of VARS) for (const s of steps) targets.set(`${v.k}-${s}`, { key: `${v.k}-${s}`, cat: v.cat, num: v.num, level: v.level, step: s });

  // Header-Walk bis alle Ziele gefunden (oder Sicherheits-Cap erreicht).
  const found = new Map<string, Found>();
  let off = 0;
  for (let i = 0; i < 700 && found.size < targets.size; i++) {
    const h = await readHeader(url, off, options.signal);
    if (!h) break;
    for (const [key, t] of targets) {
      if (found.has(key)) continue;
      if (h.cat === t.cat && h.num === t.num && h.step === t.step &&
          (h.level === undefined || Math.abs(h.level - t.level) < 0.5)) {
        found.set(key, { offset: off, length: h.totalLen });
      }
    }
    off += h.totalLen;
  }

  // Ausgabe-Gitter.
  const lats = new Array<number>(total), lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = EU_BOUNDS.latMin + (j / Math.max(1, rows - 1)) * (EU_BOUNDS.latMax - EU_BOUNDS.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = EU_BOUNDS.lngMin + (i / Math.max(1, cols - 1)) * (EU_BOUNDS.lngMax - EU_BOUNDS.lngMin);
      lats[j * cols + i] = lat; lngs[j * cols + i] = lng;
    }
  }

  // Ziel-Nachrichten voll laden + abtasten.
  async function grid(key: string): Promise<Float32Array | null> {
    const f = found.get(key);
    if (!f) return null;
    const res = await fetch(url, { headers: { Range: `bytes=${f.offset}-${f.offset + f.length - 1}` }, signal: options.signal });
    if (!res.ok && res.status !== 206) return null;
    const field = decodeGrib2(new Uint8Array(await res.arrayBuffer()));
    const out = new Float32Array(total);
    for (let k = 0; k < total; k++) out[k] = sampleGlobal(field, lats[k], lngs[k]);
    return out;
  }

  const times: Date[] = [];
  const points: ForecastHourPoint[][] = [];
  for (const step of steps) {
    const [t, u, v] = await Promise.all([grid(`t-${step}`), grid(`u-${step}`), grid(`v-${step}`)]);
    if (!t && !u && !v) continue;
    times.push(new Date(runAt.getTime() + step * 3600_000));
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const tv = t ? t[k] : NaN, uv = u ? u[k] : NaN, vv = v ? v[k] : NaN;
      arr[k] = {
        temperature: Number.isFinite(tv) ? tv - KELVIN : null,
        u: Number.isFinite(uv) ? uv : null,
        v: Number.isFinite(vv) ? vv : null,
        cloudLow: null, cloudMid: null, cloudHigh: null,
        precipitation: null,
        model: 'arpege',
      };
    }
    points.push(arr);
  }
  if (points.length === 0) throw new Error('ARPEGE: keine Felder gefunden');

  return { cols, rows, bounds: EU_BOUNDS, times, points, fetchedAt: Date.now() };
}
