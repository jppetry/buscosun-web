/**
 * Vertical profile at a point from the height cube `atmo/v1` (ICON-D2 model levels, 43 levels, 0–48 h) — one tile of
 * ≈ 110–140 KB instead of the ≈ 40 ICON-EU pressure-level files. Feeds the emagram (Atmosphäre) and the 3D sounding
 * panel with the same `SoundingProfile` shape as `iconEuSounding`.
 *
 * Index: mutable pointer ⇒ raw.githubusercontent only. Tiles: immutable per run ⇒ jsDelivr `@main`, raw as hedge
 * after 2.5 s or on any non-ok answer (a fresh run path may still 404 at the jsDelivr edge, V-AW-25).
 *
 * Column choice: of the up to four grid points around the location, the one whose model terrain (HSURF) is closest to
 * the real terrain `surfaceM` (alpine valleys: the nearest 0.1° point may sit on the slope); without terrain the
 * nearest one. Never averaged.
 *
 * Fallback: `?snd=eu` forces the ICON-EU path; outside the cube grid, beyond the run's 48 h, or when the cube cannot be
 * read or fails the plausibility check, the ICON-EU path is used and the profile says so (`source`).
 */
import {
  ATMO_GRID, ATMO_INDEX_PATH, ATMO_SOURCE_LABEL, GRID_NX, GRID_NY, TILE_CELLS,
  checkColumnStep, decodeAtmoTile, gridLat, gridLon, runMs, tilePath,
  type AtmoColumn, type AtmoIndex, type AtmoTileHeader,
} from './atmoContract';
import { fetchSoundingAtPoint as fetchIconEuSounding, type SoundingLevel, type SoundingProfile } from '../sources/iconEuSounding';

const DATA_RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
const DATA_CDN = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main';
const RAW_HEDGE_MS = 2_500;
const INDEX_TTL_MS = 5 * 60_000;
const TILE_CACHE_MAX = 16;

export const ATMO_SOUNDING_SOURCE = { label: 'ICON-D2 · Höhen-Cube', detail: `${ATMO_SOURCE_LABEL}, 43 Flächen` } as const;
export const ICON_EU_SOUNDING_SOURCE = { label: 'ICON-EU', detail: 'ICON-EU (~7 km, Druckflächen)' } as const;

/** `?snd=eu` ⇒ the old ICON-EU path. */
function forceIconEu(): boolean {
  try { return new URLSearchParams(window.location.search).get('snd') === 'eu'; } catch { return false; }
}

let indexCache: { at: number; index: AtmoIndex } | null = null;

/** The cube pointer (5-min module cache). */
export async function loadAtmoIndex(signal?: AbortSignal): Promise<AtmoIndex> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.index;
  const res = await fetch(`${DATA_RAW}/${ATMO_INDEX_PATH}`, { signal, cache: 'no-cache' });
  if (!res.ok) throw new Error(`Höhen-Cube: Index ${res.status}`);
  const index = (await res.json()) as AtmoIndex;
  if (!Array.isArray(index?.runs) || !index.runs.length) throw new Error('Höhen-Cube: kein Lauf im Index');
  indexCache = { at: Date.now(), index };
  return index;
}

/** One tile: jsDelivr first, raw.githubusercontent after 2.5 s or when the CDN does not answer ok. */
async function fetchTileBytes(path: string, signal?: AbortSignal): Promise<Uint8Array> {
  const acC = new AbortController(), acR = new AbortController();
  const onAbort = () => { acC.abort(); acR.abort(); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const get = async (url: string, ac: AbortController) => {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  try {
    let startRaw!: () => void;
    const rawGate = new Promise<void>((r) => { startRaw = r; });
    const timer = setTimeout(startRaw, RAW_HEDGE_MS);
    const cdn = get(`${DATA_CDN}/${path}`, acC).finally(() => clearTimeout(timer));
    cdn.catch(startRaw);
    const raw = rawGate.then(() => get(`${DATA_RAW}/${path}`, acR));
    const bytes = await Promise.any([cdn, raw]);
    acC.abort(); acR.abort();
    return bytes;
  } catch (e) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    throw e instanceof AggregateError ? e.errors[0] : e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export type AtmoTile = { header: AtmoTileHeader; columns: AtmoColumn[] };
const tileCache = new Map<string, Promise<AtmoTile>>();

/** One decoded tile of a run (module cache of the last 16). */
export function loadAtmoTile(run: string, ty: number, tx: number, signal?: AbortSignal): Promise<AtmoTile> {
  const path = tilePath(run, ty, tx);
  let p = tileCache.get(path);
  if (!p) {
    p = fetchTileBytes(path, signal).then(decodeAtmoTile);
    p.catch(() => tileCache.delete(path));
    tileCache.set(path, p);
    while (tileCache.size > TILE_CACHE_MAX) tileCache.delete(tileCache.keys().next().value!);
  }
  return p;
}

/** Dew point (°C) from T (°C) and RH (%), Magnus over water (same constants as the producer). */
function dewPoint(tC: number, rhPct: number): number {
  const rh = Math.max(1, Math.min(100, rhPct)) / 100;
  const g = Math.log(rh) + (17.62 * tC) / (243.12 + tC);
  return (243.12 * g) / (17.62 - g);
}

/** The cube profile at a point for the valid hour `now + leadHours`; throws when the cube cannot serve it. */
export async function fetchAtmoSoundingAtPoint(
  lat: number, lon: number, surfaceM = 0, leadHours = 0, signal?: AbortSignal,
): Promise<SoundingProfile> {
  const fy = (lat - ATMO_GRID.latMin) / ATMO_GRID.step, fx = (lon - ATMO_GRID.lonMin) / ATMO_GRID.step;
  if (fy < 0 || fx < 0 || fy > GRID_NY - 1 || fx > GRID_NX - 1) throw new Error('Höhen-Cube: Ort außerhalb des Gitters');

  const index = await loadAtmoIndex(signal);
  const hourMs = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const validMs = hourMs + Math.round(leadHours) * 3_600_000;
  const runs = [...index.runs].sort((a, b) => runMs(b.run) - runMs(a.run));
  const pick = runs.map((r) => ({ run: r.run, step: (validMs - runMs(r.run)) / 3_600_000 }))
    .find((r) => r.step >= 0 && index.steps.includes(r.step));
  if (!pick) throw new Error(`Höhen-Cube: kein Lauf deckt +${leadHours} h (neuester ${runs[0].run})`);

  // Up to four grid points around the location, nearest first.
  const iy0 = Math.floor(fy), ix0 = Math.floor(fx);
  const cands: Array<{ iy: number; ix: number; d: number }> = [];
  for (const iy of [iy0, iy0 + 1]) for (const ix of [ix0, ix0 + 1]) {
    if (iy >= GRID_NY || ix >= GRID_NX) continue;
    cands.push({ iy, ix, d: Math.hypot(gridLat(iy) - lat, (gridLon(ix) - lon) * Math.cos((lat * Math.PI) / 180)) });
  }
  cands.sort((a, b) => a.d - b.d);
  const tiles = await Promise.all(cands.map((c) => loadAtmoTile(pick.run, Math.floor(c.iy / TILE_CELLS), Math.floor(c.ix / TILE_CELLS), signal)));

  const s = index.steps.indexOf(pick.step);
  const usable = cands.map((c, i) => {
    const { header, columns } = tiles[i];
    const col = columns[(c.iy - header.y0) * header.nx + (c.ix - header.x0)];
    const nL = header.levels.length;
    const ok = !!col && Number.isFinite(col.hsurf) && s < header.steps.length
      && checkColumnStep(col.z, (id, l) => col.values[id][s * nL + l], nL).length === 0;
    return { ...c, col, nL, ok };
  }).filter((c) => c.ok);
  if (!usable.length) throw new Error('Höhen-Cube: keine plausible Säule am Ort');
  const best = surfaceM > 0
    ? usable.reduce((a, b) => (Math.abs(b.col.hsurf - surfaceM) < Math.abs(a.col.hsurf - surfaceM) ? b : a))
    : usable[0];

  const { col, nL } = best;
  const levels: SoundingLevel[] = [];
  for (let k = 0; k < nL; k++) {
    const i = s * nL + k;
    const tC = col.values.t[i];
    levels.push({
      pressureHpa: col.values.p[i], heightM: col.z[k], tempC: tC,
      dewC: Math.min(tC, dewPoint(tC, col.values.rh[i])), windU: col.values.u[i], windV: col.values.v[i],
    });
  }
  // Surface pressure: hypsometric from the lowest level (≈ 10 m above the model terrain) down to HSURF.
  const tv0 = levels[0].tempC + 273.15;
  const surfacePressureHpa = levels[0].pressureHpa * Math.exp((9.80665 * (levels[0].heightM - col.hsurf)) / (287.05 * tv0));

  const runAt = new Date(runMs(pick.run));
  return {
    lat, lon, runAt, validAt: new Date(validMs),
    // Heights are the model's: the profile stands on the model terrain of the chosen column.
    surfaceM: col.hsurf, surfacePressureHpa, levels,
    source: {
      ...ATMO_SOUNDING_SOURCE,
      detail: `${ATMO_SOUNDING_SOURCE.detail}, Säule ${col.lat.toFixed(1)}/${col.lon.toFixed(1)} · Modellgelände ${Math.round(col.hsurf)} m`,
    },
  };
}

/**
 * The profile for the emagram and the 3D panel: the height cube, the ICON-EU path as named fallback (`?snd=eu`, or
 * when the cube cannot serve this point and hour). `leadHours` = hours from now.
 */
export async function fetchProfileAtPoint(
  lat: number, lon: number, surfaceM = 0, leadHours = 0, signal?: AbortSignal,
): Promise<SoundingProfile> {
  if (!forceIconEu()) {
    try {
      return await fetchAtmoSoundingAtPoint(lat, lon, surfaceM, leadHours, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
      const why = e instanceof Error ? e.message : String(e);
      const eu = await fetchIconEuSounding(lat, lon, surfaceM, leadHours, signal);
      return { ...eu, source: { label: ICON_EU_SOUNDING_SOURCE.label, detail: `${ICON_EU_SOUNDING_SOURCE.detail} — Rückfall (${why})` } };
    }
  }
  const eu = await fetchIconEuSounding(lat, lon, surfaceM, leadHours, signal);
  return { ...eu, source: { ...ICON_EU_SOUNDING_SOURCE } };
}
