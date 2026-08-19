/**
 * DWD ICON-D2 — „Feuerwetter stündlich" as a native 2.2-km raster for the fire
 * deck (Phase WF2, `audit/waldbrand-forecast.md` §9; decision §13 (d): the
 * AREA comes from ICON-D2, the POINT from the fusion point forecast).
 *
 * Six ICON-D2 fields of the SAME run and step feed the per-cell hourly chain of
 * `src/fire/fwi/fireWeatherGrid.ts` (pure): `relhum_2m` (anchor, domain mask),
 * `t_2m`, `u_10m`/`v_10m`, `tot_prec` (Δ between steps = rain of the hour),
 * `h_snow` (snow mask). Output per step: an RGBA canvas with R = ISI/ISI_VMAX
 * (Stufe 1, no daily codes yet) or R = FWI/FWI_VMAX (with a BUI grid, WF5),
 * A = mask — the `ScalarLayer` contract shared with every other value raster.
 *
 * Structure follows `iconD2Thunder.ts` (run resolution, per-step Promise.all
 * with optional fields, bounded concurrency, progressive `onProgress`) and
 * `iconD2Relhum.ts` (image build, NaN ⇒ alpha 0, never 0). Differences that
 * matter:
 *  • The chain has STATE: step k needs step k−1. Steps are fetched in parallel
 *    but computed strictly in order behind a cursor.
 *  • The hour axis is "now + h" (MapView convention), and the newest run is
 *    2–5.5 h old ⇒ the steps are `stepsForNowWindow(steps, runAt, aheadHours)`,
 *    not a fixed 0…12, plus one earlier `tot_prec` step for the first Δ.
 *  • Wind is fetched via the WARMED wind proxy (`D2_WIND_PROXY_BASE`, same
 *    URLs as the wind layer ⇒ shared decompressed-GRIB cache); the other fields
 *    via `/_dwd_grib`. Both pass the edge whitelist by path prefix.
 *  • Per step the 608×373 chain costs ~90 ms in one go (measured in Node) —
 *    it is computed in slices with a yield to the main thread in between.
 *
 * Honesty: `mode` says whether the raster is ISI (no memory) or FWI; `start`
 * says how the chain was seeded; `notes` per frame report missing rain/wind.
 * NOT here: layer wiring, slider, legend (WF3/WF4), daily codes (WF5).
 * CC BY 4.0, no API key. Not warmed: `relhum_2m` (decision Q11) ⇒ first call
 * per session may pay the directory scan.
 */

import {
  resolveLatestRun, fetchStepField, gribCorners,
  D2_GRIB_PROXY_BASE, D2_WIND_PROXY_BASE, type GribField,
} from './iconD2Precip';
import { stepsForNowWindow } from './frameAtValidTime';
import {
  initFfmcState, stepFireWeather, allocFireWeatherBuffers,
  type FireWeatherStepFields, type FireWeatherNote,
} from '../fire/fwi/fireWeatherGrid';

export const ICON_D2_FIRE_WEATHER_ATTRIBUTION =
  'Datenbasis: <a href="https://www.dwd.de/DE/leistungen/opendata/opendata.html" '
  + 'target="_blank" rel="noopener">Deutscher Wetterdienst</a>, ICON-D2 '
  + '(relhum_2m · t_2m · u_10m · v_10m · tot_prec · h_snow), Rasterdaten bildlich '
  + 'wiedergegeben · CC BY 4.0 · FWI-Rechnung buscosun (Van Wagner 1977/1987), '
  + 'kein amtliches Produkt';

/** Default forecast horizon of the raster (hours ahead of now). */
/** Horizont ab jetzt. Jans Entscheidung 2026-08-19 (`audit/waldbrand-forecast.md` §15.5): die
 *  Stundenachse des Brandradars ist 0…+6 h (`HOUR_AXIS_MAX`, damit auch der Wind mitläuft) —
 *  der Producer lädt nicht mehr, als die Achse zeigt. Nicht aus `fire/` importiert:
 *  Quellen bleiben UI-frei; der Verifier prüft die Gleichheit. */
export const FIRE_WEATHER_AHEAD_H = 6;
/** Physical value range encoded into the R channel. EFFIS class bounds sit inside:
 *  FWI 11,2 / 21,3 / 38 / 50 / 70 · ISI 3,2 / 5 / 7,5 / 13,4 / 26,8. */
export const FWI_VMIN = 0;
export const FWI_VMAX = 80;
export const ISI_VMIN = 0;
export const ISI_VMAX = 30;
/** Target width after subsampling (native 1215 columns are overkill for a raster). */
const TARGET_WIDTH = 700;
/** Parallel steps in flight (6 fields each). */
const CONCURRENCY = 3;
/** Cells per synchronous slice of the chain. Node: ~90 ms per 226 784 cells; a
 *  headless Chrome measured ~2× that ⇒ 40 k cells ≈ 30–35 ms, safely under 50 ms. */
const SLICE_CELLS = 40_000;

export type FireWeatherMode = 'fwi' | 'isi';
export type FireWeatherStart = 'equilibrium' | 'diurnal';

export interface FireWeatherFrame {
  validAt: Date;
  stepHours: number;
  /** RGBA canvas: R = value/vMax (0..1), A = mask (0 = outside domain / snow / no data). */
  image: HTMLCanvasElement;
  width: number;
  height: number;
  /** Data caveats of this step (missing previous accumulation, missing wind). */
  notes: FireWeatherNote[];
}

export interface IconD2FireWeather {
  runAt: Date;
  runStr: string;
  frames: FireWeatherFrame[];
  /** Equirect UV bounds (x0,y0,x1,y1) of the grid inside the global [0,1]². */
  uvBounds: [number, number, number, number];
  vMin: number;
  vMax: number;
  /** 'fwi' when a daily BUI grid was supplied, else 'isi' (no memory). */
  mode: FireWeatherMode;
  /** How the FFMC chain was seeded. */
  start: FireWeatherStart;
  /** Grid size of the frames (after subsampling). */
  width: number;
  height: number;
}

export interface FetchFireWeatherOptions {
  /** Daily BUI per cell on the SAME subsampled grid (WF5). `null` ⇒ ISI mode. */
  buiGrid?: Float32Array | null;
  aheadHours?: number;
  signal?: AbortSignal;
  /** Fires after every finished frame (near horizon first). */
  onProgress?: (partial: IconD2FireWeather) => void;
}

const lngToEquiX = (lng: number) => (lng + 180) / 360;
const latToEquiY = (lat: number) => (90 - lat) / 180;

/** Let the event loop breathe between chain slices (no long task). */
const yieldMain = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Subsample a GRIB field (row-major, j = 0 south) by stride `ss` into w×h. */
function subsample(f: GribField, ss: number, w: number, h: number): Float32Array {
  const { ni, nj, values } = f;
  const out = new Float32Array(w * h);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      out[jj * w + ii] = values[sj * ni + si];
    }
  }
  return out;
}

/** Fields of one step after grid check + subsampling; `null` for absent/mismatched. */
interface StepRaw {
  rh: Float32Array; t: Float32Array; u: Float32Array | null; v: Float32Array | null;
  tp: Float32Array | null; snow: Float32Array | null;
}

/**
 * Rasterise ISI or FWI of one step: R = value/vMax, A = 255·mask; rows flipped
 * to north-up (`iconD2Relhum.ts` pattern). Values are clamped to [vMin, vMax].
 */
function buildFrameImage(values: Float32Array, mask: Uint8Array, w: number, h: number, vMin: number, vMax: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const span = vMax - vMin;
  for (let jj = 0; jj < h; jj++) {
    const y = h - 1 - jj; // S→N → north-up
    for (let ii = 0; ii < w; ii++) {
      const k = jj * w + ii;
      const idx = (y * w + ii) * 4;
      const v = values[k];
      if (!mask[k] || !Number.isFinite(v)) { img.data[idx + 3] = 0; continue; }
      const t = (v - vMin) / span;
      img.data[idx] = Math.round((t < 0 ? 0 : t > 1 ? 1 : t) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Loads the newest ICON-D2 run and computes the hourly fire-weather raster for
 * "now … now + aheadHours". Progressive: `onProgress` fires per finished frame.
 */
export async function fetchIconD2FireWeather(opts: FetchFireWeatherOptions = {}): Promise<IconD2FireWeather> {
  const { signal, onProgress } = opts;
  const aheadHours = opts.aheadHours ?? FIRE_WEATHER_AHEAD_H;
  const buiGrid = opts.buiGrid ?? null;
  const mode: FireWeatherMode = buiGrid ? 'fwi' : 'isi';
  const vMin = mode === 'fwi' ? FWI_VMIN : ISI_VMIN;
  const vMax = mode === 'fwi' ? FWI_VMAX : ISI_VMAX;

  // relhum_2m is the domain anchor and always published → resolves run + steps.
  const { runStr, runAt, steps } = await resolveLatestRun('relhum_2m', signal);
  const wanted = stepsForNowWindow(steps, runAt, aheadHours);
  if (wanted.length === 0) throw new Error('ICON-D2 Feuerwetter: keine Schritte im Fenster');
  // one earlier accumulation step for the first hour's rain (if the run has it)
  const prevStep = wanted[0] - 1;
  const havePrev = prevStep >= 0 && steps.includes(prevStep);

  // grid reference from the first relhum field
  const gridRef = await fetchStepField(runStr, 'relhum_2m', wanted[0], signal, D2_GRIB_PROXY_BASE);
  const c = gribCorners(gridRef); // [NW, NE, SE, SW] in [lon,lat]
  const uvBounds: [number, number, number, number] = [
    lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1]),
  ];
  const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
  const w = Math.ceil(gridRef.ni / ss);
  const h = Math.ceil(gridRef.nj / ss);
  const n = w * h;
  if (buiGrid && buiGrid.length !== n) throw new Error('ICON-D2 Feuerwetter: BUI-Gitter passt nicht zum Raster');
  const sameGrid = (f: GribField | null): f is GribField => !!f && f.ni === gridRef.ni && f.nj === gridRef.nj;

  const raw = new Map<number, StepRaw>();
  let prevAcc: Float32Array | null | undefined; // undefined = not fetched yet

  const fetchOpt = (param: string, step: number, base: string): Promise<GribField | null> =>
    fetchStepField(runStr, param, step, signal, base).catch(() => null);

  const loadStep = async (step: number): Promise<void> => {
    try {
      const [rh, t, u, v, tp, snow] = await Promise.all([
        step === wanted[0] ? Promise.resolve(gridRef) : fetchStepField(runStr, 'relhum_2m', step, signal, D2_GRIB_PROXY_BASE),
        fetchOpt('t_2m', step, D2_GRIB_PROXY_BASE),
        fetchOpt('u_10m', step, D2_WIND_PROXY_BASE),
        fetchOpt('v_10m', step, D2_WIND_PROXY_BASE),
        fetchOpt('tot_prec', step, D2_GRIB_PROXY_BASE),
        fetchOpt('h_snow', step, D2_GRIB_PROXY_BASE),
      ]);
      if (!sameGrid(rh) || !sameGrid(t)) return; // t_2m is mandatory (chain input)
      raw.set(step, {
        rh: subsample(rh, ss, w, h), t: subsample(t, ss, w, h),
        u: sameGrid(u) ? subsample(u, ss, w, h) : null,
        v: sameGrid(v) ? subsample(v, ss, w, h) : null,
        tp: sameGrid(tp) ? subsample(tp, ss, w, h) : null,
        snow: sameGrid(snow) ? subsample(snow, ss, w, h) : null,
      });
    } catch {
      // step missing → skipped; the chain continues from the next available one
    }
  };
  const loadPrev = async (): Promise<void> => {
    if (!havePrev) { prevAcc = null; return; }
    const tp = await fetchOpt('tot_prec', prevStep, D2_GRIB_PROXY_BASE);
    prevAcc = sameGrid(tp) ? subsample(tp, ss, w, h) : null;
  };

  // --- fetch: bounded concurrency over the wanted steps (+ the prev accumulation)
  const frames: FireWeatherFrame[] = [];
  const buffers = allocFireWeatherBuffers(n, mode === 'fwi');
  let state: Float32Array | null = null;
  let cursor = 0;            // index into `wanted` of the next step to COMPUTE
  let lastAcc: Float32Array | null | undefined; // accumulation of the previously computed step
  let computing = false;

  const emit = (): void => {
    if (onProgress) onProgress({ runAt, runStr, frames: [...frames], uvBounds, vMin, vMax, mode, start: 'equilibrium', width: w, height: h });
  };

  /** Compute every step that is ready in order (state chain), yielding between slices. */
  const drain = async (): Promise<void> => {
    if (computing) return; // a drain is already running; it will pick up new steps
    computing = true;
    try {
      while (cursor < wanted.length && raw.has(wanted[cursor])) {
        if (signal?.aborted) return;
        if (prevAcc === undefined) return; // first Δ needs the prev accumulation decision
        const step = wanted[cursor];
        const r = raw.get(step)!;
        const fields: FireWeatherStepFields = {
          stepHours: step, validAtMs: runAt.getTime() + step * 3_600_000,
          rh: r.rh, t2mK: r.t, u: r.u, v: r.v,
          totPrec: r.tp, totPrecPrev: lastAcc === undefined ? prevAcc : lastAcc,
          hSnow: r.snow,
        };
        if (!state) state = initFfmcState(fields, buiGrid);
        let result = stepFireWeather(state, fields, buiGrid, buffers, 0, 0);
        for (let from = 0; from < n; from += SLICE_CELLS) {
          result = stepFireWeather(state, fields, buiGrid, buffers, from, Math.min(n, from + SLICE_CELLS));
          if (from + SLICE_CELLS < n) await yieldMain();
          if (signal?.aborted) return;
        }
        const values = mode === 'fwi' ? result.fwi! : result.isi;
        frames.push({
          validAt: new Date(fields.validAtMs), stepHours: step,
          image: buildFrameImage(values, result.mask, w, h, vMin, vMax),
          width: w, height: h, notes: result.notes,
        });
        lastAcc = r.tp;
        raw.delete(step);
        cursor++;
        emit();
      }
    } finally {
      computing = false;
    }
  };

  let ptr = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
      await drain();
    }
  });
  await Promise.all([loadPrev().then(drain), ...workers]);
  await drain();
  // steps that never arrived block the chain behind them: skip them and go on
  while (cursor < wanted.length) {
    if (!raw.has(wanted[cursor])) { cursor++; continue; }
    await drain();
  }

  if (frames.length === 0) throw new Error('ICON-D2 Feuerwetter: keine Frames erzeugt');
  return { runAt, runStr, frames, uvBounds, vMin, vMax, mode, start: 'equilibrium', width: w, height: h };
}

// ---------------------------------------------------------------------------
// Self-verification (network- and DOM-free)
// ---------------------------------------------------------------------------

export interface FireWeatherCheck { name: string; ok: boolean; detail?: string }

export function verifyIconD2FireWeather(): { checks: FireWeatherCheck[]; passed: number; total: number } {
  const checks: FireWeatherCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('Attribution nutzt die DWD-Formel für ABGELEITETE Daten und sagt „kein amtliches Produkt"',
    /Datenbasis:/.test(ICON_D2_FIRE_WEATHER_ATTRIBUTION)
      && /bildlich wiedergegeben/.test(ICON_D2_FIRE_WEATHER_ATTRIBUTION)
      && /kein amtliches Produkt/.test(ICON_D2_FIRE_WEATHER_ATTRIBUTION));
  add('Attribution nennt alle sechs Felder',
    ['relhum_2m', 't_2m', 'u_10m', 'v_10m', 'tot_prec', 'h_snow'].every((p) => ICON_D2_FIRE_WEATHER_ATTRIBUTION.includes(p)));
  add('EFFIS-Klassengrenzen liegen im kodierten Wertebereich (FWI ≤ 80, ISI ≤ 30)',
    FWI_VMAX >= 70 && ISI_VMAX >= 26.8 && FWI_VMIN === 0 && ISI_VMIN === 0);
  add('Horizont-Default ist 6 h (Stundenachse des Brandradars, §15.5)', FIRE_WEATHER_AHEAD_H === 6);
  add('Wind-Proxy und GRIB-Proxy sind verschiedene, benannte Pfade',
    D2_WIND_PROXY_BASE.startsWith('/_dwd_wind/') && D2_GRIB_PROXY_BASE.startsWith('/_dwd_grib/')
      && D2_WIND_PROXY_BASE.endsWith('/weather/nwp/icon-d2/grib') && D2_GRIB_PROXY_BASE.endsWith('/weather/nwp/icon-d2/grib'));
  // subsample keeps GRIB order (j = 0 south) and picks stride cells
  {
    const f = { ni: 4, nj: 3, values: Float32Array.from([0, 1, 2, 3, 10, 11, 12, 13, 20, 21, 22, 23]) } as unknown as GribField;
    const s = subsample(f, 2, 2, 2);
    add('subsample nimmt jede 2. Zelle, Reihenfolge bleibt', s[0] === 0 && s[1] === 2 && s[2] === 20 && s[3] === 22);
  }
  add('SLICE_CELLS teilt ein 608×373-Raster in ≥ 3 Scheiben', Math.ceil(608 * 373 / SLICE_CELLS) >= 3);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
