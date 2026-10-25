/**
 * rucCurve.ts — the 5-min form of ICON-D2-RUC drawn as a curve instead of steps (E-RUC-13, Jan 25.10.2026: "like the radar,
 * interpolated, but without losing accuracy"). The 5-min values are INTERVAL MEANS (mm per 5 min), not point samples: interpolating
 * the rates the way the radar minutes are interpolated would move mass between intervals and break the hourly sum of buscosun
 * Fusion (E-RUC-4). So the CUMULATIVE amount through the interval knots is interpolated with a monotone cubic Hermite spline
 * (Fritsch–Butland tangents) and the minute rate is its derivative. Guarantees, each checked in `verify:ruc` block K:
 *   1 every interval keeps exactly its mm (the spline passes through the knots) ⇒ every hourly sum stays the Fusion value;
 *   2 the rate is never negative (the cumulative curve is monotone);
 *   3 a run of equal steps stays a flat line (the spline reproduces linear data), zeros stay zeros.
 * Drawing only: first rain, peak and sum read the steps. Steps with a gap between them give separate runs (no bridge across a
 * missing hour). Switch `?mvcurve=0` = steps as before (Rule 2). Pure; no DOM.
 * Soft start at the radar seam (Jan 25.10.: "ein weicher Übergang, ohne die Daten zu verfälschen"): when the first run begins exactly
 * where the radar ends, its start tangent is the radar's last minute value instead of the first 5-min mean — the curve bends within the
 *  first interval, whose mm stay exact (the spline still passes through every knot). Clamped to 0 … 3 × the first mean (Fritsch–Carlson
 * box: the cubic stays monotone, the rate non-negative); above that, or with a dry first interval, the jump stays — the sources disagree
 * and the seam label says so. No 5-min sum and no hourly sum changes (verify:ruc K12/K13).
 */

export interface RucCurveOptions {
  /** Start tangent of a run that begins at `startAtMs` (mm/h, the radar's last minute); ignored for every other run. */
  startMmH?: number;
  startAtMs?: number;
}
/** Upper bound of the start tangent as a multiple of the first 5-min mean (Fritsch–Carlson monotone box). */
export const RUC_CURVE_START_CAP = 3;
const H = 3_600_000;
const MIN = 60_000;

export const RUC_CURVE_QUERY_KEY = 'mvcurve';

export function rucCurveEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get(RUC_CURVE_QUERY_KEY) !== '0'; } catch { return true; }
}

export interface RucStepLike { fromMs: number; toMs: number; mmH: number }
/** One sample of the curve: rate (mm/h, the spline's slope) and the cumulative amount since the run start (mm, the spline's value). */
export interface RucCurvePoint { tMs: number; mmH: number; mm: number }

/**
 * Minute curve per contiguous run of steps (sorted by time; a step that does not start where the previous ends opens a new run).
 * `endMs` clips the sampling, `stepMs` is the sample spacing (default one minute); the last sample of a run is its end.
 */
export function rucMinuteCurve(steps: readonly RucStepLike[], endMs = Infinity, stepMs = MIN, opts: RucCurveOptions = {}): RucCurvePoint[][] {
  const runs: RucStepLike[][] = [];
  for (const s of steps) {
    if (!(s.toMs > s.fromMs) || !Number.isFinite(s.mmH)) continue;
    const last = runs.length ? runs[runs.length - 1] : null;
    if (last && last[last.length - 1].toMs === s.fromMs) last.push(s); else runs.push([s]);
  }
  const out: RucCurvePoint[][] = [];
  for (const run of runs) {
    const n = run.length;
    // knots in hours from the run start; y = cumulative mm; δ = secant slope = the interval mean (mm/h)
    const x0 = run[0].fromMs;
    const x = new Array<number>(n + 1), y = new Array<number>(n + 1), hw = new Array<number>(n), d = new Array<number>(n);
    x[0] = 0; y[0] = 0;
    for (let k = 0; k < n; k++) {
      hw[k] = (run[k].toMs - run[k].fromMs) / H;
      d[k] = Math.max(0, run[k].mmH);
      x[k + 1] = (run[k].toMs - x0) / H;
      y[k + 1] = y[k] + d[k] * hw[k];
    }
    // tangents: Fritsch–Butland (weighted harmonic mean, zero where a neighbour is flat) keeps the cubic monotone; ends take the secant
    const m = new Array<number>(n + 1);
    m[0] = d[0]; m[n] = d[n - 1];
    // soft start at the radar seam: the radar's last minute as the tangent, clamped into the monotone box (0 … cap × first mean)
    if (opts.startMmH != null && Number.isFinite(opts.startMmH) && opts.startAtMs === x0) m[0] = Math.min(Math.max(0, opts.startMmH), RUC_CURVE_START_CAP * d[0]);
    for (let k = 1; k < n; k++) {
      if (d[k - 1] <= 0 || d[k] <= 0) { m[k] = 0; continue; }
      const w1 = 2 * hw[k] + hw[k - 1], w2 = hw[k] + 2 * hw[k - 1];
      m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
    }
    const pts: RucCurvePoint[] = [];
    const runEnd = Math.min(run[n - 1].toMs, endMs);
    let k = 0;
    const sampleAt = (t: number) => {
      while (k < n - 1 && t >= run[k].toMs) k++;
      const s = ((t - x0) / H - x[k]) / hw[k];
      const s2 = s * s;
      // Hermite basis: value and slope on the interval k at parameter s ∈ [0, 1]
      const h00 = 2 * s2 * s - 3 * s2 + 1, h10 = s2 * s - 2 * s2 + s, h01 = -2 * s2 * s + 3 * s2, h11 = s2 * s - s2;
      const mm = h00 * y[k] + h10 * hw[k] * m[k] + h01 * y[k + 1] + h11 * hw[k] * m[k + 1];
      const slope = m[k] * (3 * s2 - 4 * s + 1) + m[k + 1] * (3 * s2 - 2 * s) + d[k] * (6 * s - 6 * s2);
      pts.push({ tMs: t, mmH: Math.max(0, slope), mm });
    };
    for (let t = x0; t < runEnd; t += stepMs) sampleAt(t);
    sampleAt(runEnd);
    out.push(pts);
  }
  return out;
}

/** The curve sample at a minute (nearest earlier sample of its run), `null` outside every run. */
export function rucCurveAt(runs: readonly RucCurvePoint[][], tMs: number): RucCurvePoint | null {
  for (const run of runs) {
    if (!run.length || tMs < run[0].tMs || tMs > run[run.length - 1].tMs) continue;
    let lo = 0, hi = run.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (run[mid].tMs <= tMs) lo = mid; else hi = mid - 1; }
    return run[lo];
  }
  return null;
}
