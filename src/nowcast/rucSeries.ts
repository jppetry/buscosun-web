/**
 * rucSeries.ts — fits the 5-min form of ICON-D2-RUC to the hourly sums of buscosun Fusion 13 (phase RUC, E-RUC-4).
 *
 * The hourly value of buscosun Fusion is the verified product (Prüfstand); the RUC contributes only the FORM inside an hour.
 * Per hour (t − 1 h, t] with Fusion mean f and the twelve RUC interval means r₁…r₁₂ (mean r):
 *   f ≤ 0          ⇒ twelve zeros                     (`dry`)
 *   r ≤ 0 < f      ⇒ twelve times f                   (`flat`, no form known)
 *   f / r ≤ 4      ⇒ rᵢ · f / r                       (`form`)
 *   f / r > 4      ⇒ rᵢ · 4 + (f − 4 r) spread flat    (`mixed`, cap set — V-RUC-9 counts how often it binds)
 * In every case the mean of the twelve points equals f. An hour with a missing interval (byte 0) or without full RUC
 * coverage carries no points (the hourly bar stays as today). Pure functions; the switch is `?ruc=0` = fallback (default ON
 * since 23.10.2026, E-RUC-7).
 */
import type { RucPointSeries } from '../point/client/rucPoint';
import { RUC_CAP_FACTOR, RUC_STEP_MS } from '../point/rucFormat';
import type { FusionHourValue } from './minuteSeries';

const H = 3_600_000;
const PER_HOUR = H / RUC_STEP_MS;

export const RUC_QUERY_KEY = 'ruc';

/**
 * E-RUC-7, turned by Jan on 23.10.2026 before the shadow measurement: the 5-min form is ON by default; `?ruc=0` is the named
 * fallback (everything exactly as before phase RUC: hourly bars, hourly rain-window rules, engine interpolation).
 */
export function rucEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get(RUC_QUERY_KEY) !== '0'; } catch { return true; }
}

/**
 * `?rucbase=<origin>` reads the product from another base (local rebuild before the data repo carries `ruc/v1/`, §74 step 5);
 * `null` = the data repo via the cube's store. Only `http(s)` origins, nothing else is honoured.
 */
export function rucBaseFrom(search: string): string | null {
  try {
    const v = new URLSearchParams(search).get('rucbase');
    return v && /^https?:[/][/][^\s]+$/.test(v) ? v.replace(/[/]+$/, '') : null;
  } catch { return null; }
}

export type RucHourKind = 'dry' | 'flat' | 'form' | 'mixed';

export interface RucFittedPoint { fromMs: number; toMs: number; mmH: number; kind: RucHourKind }

export interface RucFittedHour {
  hourStartMs: number;
  hourEndMs: number;
  fusionMmH: number;
  rucMeanMmH: number;
  /** scaling factor applied to the form (0 for dry/flat, ≤ RUC_CAP_FACTOR otherwise). */
  factor: number;
  kind: RucHourKind;
}

export interface RucFitted {
  run: string;
  runAtMs: number;
  ageMin: number;
  /** span of the fitted points (first fromMs … last toMs); 0/0 without points. */
  fromMs: number;
  toMs: number;
  points: RucFittedPoint[];
  hours: RucFittedHour[];
  stats: { hours: number; dry: number; flat: number; form: number; mixed: number; missing: number };
}

/**
 * @param ruc         the point series of the newest run (`loadRucPoint`)
 * @param fusionHours hourly values of buscosun Fusion as the engine reduces them (`tMs` = END of the hour)
 */
export function fitRucToFusion(ruc: RucPointSeries, fusionHours: FusionHourValue[], _nowMs?: number): RucFitted {
  const byFrom = new Map<number, number | null>();
  for (const p of ruc.points) byFrom.set(p.fromMs, p.mmH);
  const points: RucFittedPoint[] = [];
  const hours: RucFittedHour[] = [];
  const stats = { hours: 0, dry: 0, flat: 0, form: 0, mixed: 0, missing: 0 };
  const sorted = [...fusionHours].filter((h) => Number.isFinite(h.tMs) && Number.isFinite(h.mmH)).sort((a, b) => a.tMs - b.tMs);
  for (const h of sorted) {
    const start = h.tMs - H;
    if (start < ruc.runAtMs) continue;
    const raw: number[] = [];
    let missing = false;
    for (let k = 0; k < PER_HOUR; k++) {
      const v = byFrom.get(start + k * RUC_STEP_MS);
      if (v === undefined) { raw.length = 0; break; }      // beyond the run's horizon: not covered
      if (v === null) { missing = true; break; }
      raw.push(v);
    }
    if (missing) { stats.missing++; continue; }
    if (raw.length !== PER_HOUR) continue;
    const f = h.mmH;
    const r = raw.reduce((a, b) => a + b, 0) / PER_HOUR;
    let kind: RucHourKind, factor = 0, vals: number[];
    if (f <= 0) { kind = 'dry'; vals = raw.map(() => 0); }
    else if (r <= 0) { kind = 'flat'; vals = raw.map(() => f); }
    else if (f / r <= RUC_CAP_FACTOR) { kind = 'form'; factor = f / r; vals = raw.map((v) => v * factor); }
    else { kind = 'mixed'; factor = RUC_CAP_FACTOR; const rest = f - RUC_CAP_FACTOR * r; vals = raw.map((v) => v * RUC_CAP_FACTOR + rest); }
    for (let k = 0; k < PER_HOUR; k++) points.push({ fromMs: start + k * RUC_STEP_MS, toMs: start + (k + 1) * RUC_STEP_MS, mmH: vals[k], kind });
    hours.push({ hourStartMs: start, hourEndMs: h.tMs, fusionMmH: f, rucMeanMmH: r, factor, kind });
    stats.hours++;
    stats[kind]++;
  }
  return {
    run: ruc.run, runAtMs: ruc.runAtMs, ageMin: ruc.ageMin,
    fromMs: points.length ? points[0].fromMs : 0, toMs: points.length ? points[points.length - 1].toMs : 0,
    points, hours, stats,
  };
}

/**
 * Mean of the 5-min intervals of (fromMs, toMs] (the interval containing each instant fromMs + 5, + 10, …, toMs); `null` when any
 * of them is missing or outside the fit. The engine samples its 15-min steps with it so that the sum over the steps of an hour
 * equals the hourly sum of buscosun Fusion (review I3) — a point value would make the sum depend on the second the page opens.
 */
export function rucMeanOver(fitted: RucFitted, fromMs: number, toMs: number): number | null {
  if (!fitted.points.length || toMs <= fromMs || fromMs < fitted.fromMs || toMs > fitted.toMs) return null;
  let sum = 0, n = 0;
  for (let t = fromMs + RUC_STEP_MS; t <= toMs + 1e-6; t += RUC_STEP_MS) {
    const v = rucAt(fitted, Math.min(t, toMs));
    if (v == null) return null;
    sum += v; n++;
  }
  return n ? sum / n : null;
}

/** Value of the interval that contains `etaMs` under (from, to]; `null` outside the fitted points or in a gap. */
export function rucAt(fitted: RucFitted, etaMs: number): number | null {
  const pts = fitted.points;
  if (!pts.length || etaMs < fitted.fromMs || etaMs > fitted.toMs) return null;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].toMs < etaMs) lo = mid + 1; else hi = mid;
  }
  const p = pts[lo];
  if (etaMs === fitted.fromMs && lo === 0) return p.mmH;
  return p.fromMs < etaMs && etaMs <= p.toMs ? p.mmH : null;
}
