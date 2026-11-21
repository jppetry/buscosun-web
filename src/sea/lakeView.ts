/**
 * Phase BS — what the page derives for a lake spot from its catalogue block and the hours of buscosun Fusion. Pure.
 * The wind wave is an ESTIMATE of our own (`lakeWave.ts`, Shore Protection Manual 1984): never an official value, never
 * an input of a class. The gust hint is plain arithmetic on the gust of buscosun Fusion and says that it is not official.
 */
import { lakeFetchAt, lakeWindWave, type LakeWave } from './lakeWave';
import { lakeGustHint, type SeaSpotLake } from './seaLakes';

export interface LakeWaveAt extends LakeWave {
  /** Fetch the estimate was made with (m). */
  fetchM: number;
  /** No wind direction for the hour: the longest fetch of the table was used — the value is an UPPER bound ("höchstens"). */
  upper: boolean;
}

/** The estimated wind wave of one hour, or `null` without a wind. */
export function lakeWaveAt(lake: Pick<SeaSpotLake, 'fetch' | 'depthM'>, windMs: number | null | undefined, windDir: number | null | undefined): LakeWaveAt | null {
  if (windMs == null) return null;
  const along = lakeFetchAt(lake.fetch, windDir);
  const fetchM = along ?? Math.max(...lake.fetch);
  const w = lakeWindWave({ windMs, fetchM, depthM: lake.depthM });
  return w ? { ...w, fetchM, upper: along == null } : null;
}

export interface LakeHourIn { t: number; windMs: number | null; gustMs: number | null; windDir: number | null }

/** The highest estimated wave of the given hours (ties: the earliest), `null` without one wind value. */
export function lakeWaveMax(lake: Pick<SeaSpotLake, 'fetch' | 'depthM'>, hours: readonly LakeHourIn[]): { t: number; wave: LakeWaveAt } | null {
  let best: { t: number; wave: LakeWaveAt } | null = null;
  for (const h of hours) { const w = lakeWaveAt(lake, h.windMs, h.windDir); if (w && (!best || w.hsM > best.wave.hsM)) best = { t: h.t, wave: w }; }
  return best;
}

/**
 * The gust hint over the next `withinH` hours from `fromMs`: the highest class reached (1 = from 25 kn, 2 = from 34 kn) and
 * the first hour that reaches it; `null` when no hour reaches 25 kn (then the page shows no hint at all).
 */
export function lakeGustAhead(hours: readonly LakeHourIn[], fromMs: number, withinH = 24): { cls: 1 | 2; t: number } | null {
  let best: { cls: 1 | 2; t: number } | null = null;
  for (const h of hours) {
    if (h.t < fromMs || h.t > fromMs + withinH * 3_600_000) continue;
    const c = lakeGustHint(h.gustMs);
    if ((c === 1 || c === 2) && (!best || c > best.cls)) best = { cls: c, t: h.t };
  }
  return best;
}

/** Fetch along a direction in km with one decimal, for the words next to the rose. */
export const fetchKm = (m: number): string => (m / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The spokes of the fetch rose: 36 points (x east, y north, unit circle scaled by the square root of the share of the longest fetch). */
export function fetchRose(fetch: readonly number[]): { max: number; pts: Array<{ deg: number; r: number; x: number; y: number }> } {
  const max = Math.max(1, ...fetch);
  return { max, pts: fetch.map((f, k) => { const deg = k * 10, r = Math.sqrt(Math.max(0, f) / max), a = (deg * Math.PI) / 180; return { deg, r, x: Math.sin(a) * r, y: Math.cos(a) * r }; }) };
}
