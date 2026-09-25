/**
 * strata.ts — how the learning stage of buscosun Fusion is stratified and cross-validated (phase FL,
 * `audit/fusion-lernphase.md` §5.4–§5.5): variables, the six lead bins of `calibDoc.ts`, the two forms P (per source)
 * and K (cube member), the source class (form P: the exact source set of a row; form K: the route), and the fold keys
 * time (calendar month with a one-month purge on both sides), region (the twelve strongest 1° tiles plus the rest) and
 * height band (< / ≥ 800 m).
 */
import { CALIB_BINS_H, calibBinOf } from '../calibDoc';

export const FIT_VARS = Object.freeze(['t', 'td', 'u', 'v', 'gust', 'clct', 'precip'] as const);
export type FitVar = (typeof FIT_VARS)[number];
export type Form = 'P' | 'K';
export const FORMS: readonly Form[] = Object.freeze(['P', 'K']);

/** Source order of the case files (`casesio.mjs` FL_SOURCES) — the bit order of `srcMask`. */
export const FL_SOURCES = Object.freeze(['icon_d2', 'icon_ch1_eps', 'icon_eu', 'ifs_hres', 'aifs_single', 'icon_ch2_eps', 'icon_global', 'ifs_ens'] as const);
export const ROUTE_NAMES = Object.freeze({ 1: 'run', 2: 'day0', 3: 'dyn' } as const);

/** Minimum evidence per stratum (rows, distinct days) — `set`, in the spirit of CALIB_N_MIN; reported in every entry. */
export const STRATUM_MIN = Object.freeze({ n: 5000, days: 30 });

export const binIndex = (leadH: number): number => calibBinOf(leadH);
export const binRange = (b: number): readonly [number, number] => CALIB_BINS_H[b];

/** Sources of a mask, in order. */
export function sourcesOfMask(mask: number): string[] {
  const out: string[] = [];
  for (let k = 0; k < FL_SOURCES.length; k++) if (mask & (1 << k)) out.push(FL_SOURCES[k]);
  return out;
}
/** The class key of a row for form P (exact source set, ensemble bit ignored) and form K (route). */
export function classKey(form: Form, srcMask: number, route: number): string {
  if (form === 'P') return `m${(srcMask & 0x7f).toString(16)}`;
  return `r${route}`;
}
export const stratumKey = (form: Form, v: FitVar, bin: number, cls: string): string => `${form}|${v}|${bin}|${cls}`;
export function parseStratum(key: string): { form: Form; v: FitVar; bin: number; cls: string } {
  const [form, v, bin, cls] = key.split('|');
  return { form: form as Form, v: v as FitVar, bin: Number(bin), cls };
}

/** Fold keys of a row: month `YYYY-MM`, region tile, height band. */
export interface FoldKeys { month: string; region: string; band: string }
export const monthOf = (validAtMs: number): string => new Date(validAtMs).toISOString().slice(0, 7);
export const groupKey = (k: FoldKeys): string => `${k.month}|${k.region}|${k.band}`;
export function parseGroup(key: string): FoldKeys { const [month, region, band] = key.split('|'); return { month, region, band }; }

/** Time folds: each month held out, its neighbours purged (leads reach 14 days). */
export function timeFolds(months: readonly string[]): Array<{ name: string; held: string[]; purged: string[] }> {
  const ms = [...months].sort();
  return ms.map((m, i) => ({ name: `time:${m}`, held: [m], purged: [ms[i - 1], ms[i + 1]].filter((x): x is string => !!x) }));
}
/** Region folds: each region held out (no purge). */
export function regionFolds(regions: readonly string[]): Array<{ name: string; held: string[]; purged: string[] }> {
  return [...regions].sort().map((r) => ({ name: `region:${r}`, held: [r], purged: [] }));
}
export function bandFolds(bands: readonly string[]): Array<{ name: string; held: string[]; purged: string[] }> {
  return [...bands].sort().map((b) => ({ name: `band:${b}`, held: [b], purged: [] }));
}

/**
 * Map group keys (month|region|band) to the fold specs of `chooseLambda`: a fold's `held`/`purged` are GROUP keys.
 * `axis` picks which component the fold reads.
 */
export function foldsOverGroups(groupKeys: readonly string[], axis: 'month' | 'region' | 'band'): Array<{ name: string; held: string[]; purged: string[] }> {
  const vals = [...new Set(groupKeys.map((k) => parseGroup(k)[axis]))];
  const specs = axis === 'month' ? timeFolds(vals) : axis === 'region' ? regionFolds(vals) : bandFolds(vals);
  return specs.map((f) => ({
    name: f.name,
    held: groupKeys.filter((k) => f.held.includes(parseGroup(k)[axis])),
    purged: groupKeys.filter((k) => f.purged.includes(parseGroup(k)[axis])),
  }));
}

/** Regions: the `top` most populous tiles keep their name, the rest is pooled. */
export function regionOf(tile: string, topTiles: ReadonlySet<string>): string { return topTiles.has(tile) ? tile : 'rest'; }
