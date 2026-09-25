/**
 * fitSpeed.ts — the speed law of the learning stage (phase FL, fusionFit@3, V-FL-22; `audit/fusion-lernphase.md`
 * §11.8, §11.11): a speed EMOS BEHIND the u/v model. The Rice law from separate u/v means and variances sits too high
 * (E|V| > |E V|: measured +0,17…+0,39 m/s growing with the lead, PIT deciles 19–23 % at the bottom, 8–12 % at the top;
 * a σ scale of the Rice does not help — best c 0,85 with a worse PIT). The remedy measured 24.09.2026:
 *
 *   ff ~ TN(a + b·E_Rice, c·sd_Rice) truncated at 0,   E_Rice = E[Rice(ν, σ)],  sd_Rice² = 2σ² + ν² − E_Rice²,
 *
 * a ≈ −0,6 m/s, b 0,9–1,1, c 1,0–1,3: CRPS −2,9 % (0–6 h) … −4,3 % (246–336 h), PIT edge 0,24–0,26. The direction stays
 * with the u/v mean vector. Fitted per stratum on a grid by CRPS (closed form, Thorarinsdóttir & Gneiting 2010),
 * out of fold like the σ scale: per time fold the best triple on the training months, the held-out month scored at
 * it against the Rice itself; `no-skill` when the truncated normal does not win out of fold (the Rice stays).
 * A log-normal EMOS (Baran & Lerch 2015) is COMPARED on a stored subsample of the mid-range bins, never written.
 */
import { crpsTruncatedNormal, meanOf, cdfOf, Phi, type Dist } from '../../pointForecast/fusion/dist';
import { timeFolds, STRATUM_MIN } from './strata';
import { pitOuterOf } from './fitScale';

export const SPEED_NAMES = Object.freeze(['a', 'b', 'c'] as const);
const A_GRID = [-0.9, -0.6, -0.3, 0, 0.3];
const B_GRID = [0.9, 1.0, 1.1];
const C_GRID = [0.9, 1.0, 1.15, 1.3, 1.5];
/** The grid as triples (a, b, c), in this order — `SpeedAcc` indexes it. */
export const SPEED_GRID: ReadonlyArray<readonly [number, number, number]> = Object.freeze(A_GRID.flatMap((a) => B_GRID.flatMap((b) => C_GRID.map((c) => [a, b, c] as const))));

/** Mean and sd of a Rice law — the two moments the speed law is built on. */
export function riceMoments(nu: number, sigma: number): { m: number; sd: number } {
  const m = meanOf({ kind: 'rice', nu, sigma });
  return { m, sd: Math.sqrt(Math.max(1e-6, 2 * sigma * sigma + nu * nu - m * m)) };
}
/** The truncated normal of a triple at a Rice law. */
export function speedLaw(rice: { nu: number; sigma: number }, p: { a: number; b: number; c: number }): Extract<Dist, { kind: 'truncatedNormal' }> {
  const { m, sd } = riceMoments(rice.nu, rice.sigma);
  return { kind: 'truncatedNormal', mu: p.a + p.b * m, sigma: Math.max(1e-3, p.c * sd), lo: 0 };
}

class MonthAcc {
  n = 0; crpsRice = 0; outerRice = 0;
  readonly crps = new Float64Array(SPEED_GRID.length);
  readonly outer = new Float64Array(SPEED_GRID.length);
  readonly days = new Set<number>();
}

export interface SpeedCv {
  /** In-sample mean CRPS of the Rice and of the best triple (all months), PIT edges likewise. */
  crpsRice: number; crpsTn: number; pitOuterRice: number; pitOuterTn: number;
  /** Out of fold: held-out months at the fold's best triple against the Rice. */
  oof: { crps: number; crpsRice: number; pitOuter: number; pitOuterRice: number; n: number; folds: number } | null;
  winsOof: boolean;
}
export interface SpeedLn {
  /** Log-normal EMOS on the stored subsample, out of fold (fold LS fit of ln y on ln E, s from the training residuals): mean CRPS and PIT edge, against the TN at the fold's triple and the Rice on the SAME rows. */
  crps: number; pitOuter: number; crpsTn: number; crpsRice: number; n: number; a: number; b: number; s: number;
}
export interface SpeedEntry {
  form: 'P' | 'K'; var: 'ws'; bin: number; cls: string;
  names: readonly string[];
  family: 'truncatedNormal';
  a: number; b: number; c: number;
  n: number; days: number;
  status: 'written' | 'too-short' | 'no-skill';
  cv?: SpeedCv | null;
  ln?: SpeedLn | null;
}

/** Per stratum: the grid sums per month, plus (optionally) a subsample of rows for the log-normal comparison. */
export class SpeedAcc {
  readonly months = new Map<string, MonthAcc>();
  /** Stored rows [month index, y, E_Rice, sd_Rice, nu, sigma] for the LN comparison (only where the caller asks). */
  readonly sample: Array<[string, number, number, number, number, number]> = [];
  /** `y` = observed speed, (nu, sigma) the Rice of the row. Returns the row's CRPS at every triple (for callers that want it). */
  add(month: string, dayIdx: number, y: number, nu: number, sigma: number, keepSample = false): void {
    let m = this.months.get(month); if (!m) { m = new MonthAcc(); this.months.set(month, m); }
    const { m: E, sd } = riceMoments(nu, sigma);
    const rice: Dist = { kind: 'rice', nu, sigma };
    m.n += 1; m.days.add(dayIdx);
    m.crpsRice += crpsRice(rice, y); m.outerRice += pitOuterOf(cdfOf(rice, y));
    for (let i = 0; i < SPEED_GRID.length; i++) {
      const [a, b, c] = SPEED_GRID[i];
      const mu = a + b * E, sg = Math.max(1e-3, c * sd);
      m.crps[i] += crpsTruncatedNormal(mu, sg, 0, y);
      m.outer[i] += pitOuterOf(tnCdf(mu, sg, y));
    }
    if (keepSample) this.sample.push([month, y, E, sd, nu, sigma]);
  }
  get n(): number { let s = 0; for (const m of this.months.values()) s += m.n; return s; }
  get days(): number { const d = new Set<number>(); for (const m of this.months.values()) for (const x of m.days) d.add(x); return d.size; }
}

const SQRT2 = Math.SQRT2;
const tnCdf = (mu: number, sg: number, y: number): number => cdfOf({ kind: 'truncatedNormal', mu, sigma: sg, lo: 0 }, y);
/** CRPS of the Rice law by the CDF integral on [0, ν + 8σ] (96 cells) — the scorer's method (`stats.mjs crpsByCdf`), inlined without I/O. */
export function crpsRice(d: Extract<Dist, { kind: 'rice' }>, y: number, n = 96): number {
  const hi = d.nu + 8 * d.sigma + 1, h = hi / n;
  let acc = 0;
  for (let i = 0; i < n; i++) { const x = (i + 0.5) * h; const F = cdfOf(d, x); const s = x >= y ? 1 : 0; acc += (F - s) * (F - s); }
  return acc * h + (y > hi ? y - hi : 0);
}
/** CRPS of a log-normal law (Baran & Lerch 2015), parameters on the log scale. */
export function crpsLogNormal(m: number, s: number, y: number): number {
  const yy = Math.max(y, 1e-3), w = (Math.log(yy) - m) / s;
  return yy * (2 * Phi(w) - 1) - 2 * Math.exp(m + 0.5 * s * s) * (Phi(w - s) + Phi(s / SQRT2) - 1);
}

const argmin = (xs: ArrayLike<number>): number => { let b = 0; for (let i = 1; i < xs.length; i++) if (xs[i] < xs[b]) b = i; return b; };

/** Sum the month accumulators of a set of months. */
function sumMonths(acc: SpeedAcc, keep: (m: string) => boolean): MonthAcc {
  const out = new MonthAcc();
  for (const [k, m] of acc.months) { if (!keep(k)) continue; out.n += m.n; out.crpsRice += m.crpsRice; out.outerRice += m.outerRice; for (let i = 0; i < SPEED_GRID.length; i++) { out.crps[i] += m.crps[i]; out.outer[i] += m.outer[i]; } for (const d of m.days) out.days.add(d); }
  return out;
}

/** Fit one stratum: the triple on all months, the out-of-fold verdict, the LN comparison where a sample was kept. */
export function fitSpeedStratum(form: 'P' | 'K', bin: number, cls: string, acc: SpeedAcc, min: { n: number; days: number } = STRATUM_MIN): SpeedEntry {
  const months = [...acc.months.keys()].sort();
  const all = sumMonths(acc, () => true);
  const base = { form, var: 'ws' as const, bin, cls, names: SPEED_NAMES, family: 'truncatedNormal' as const, n: all.n, days: all.days.size };
  if (all.n < min.n || all.days.size < min.days) return { ...base, a: 0, b: 1, c: 1, status: 'too-short' };
  const iAll = argmin(all.crps);
  const [a, b, c] = SPEED_GRID[iAll];
  // out of fold: best triple on the training months, the held-out month at it
  let oofC = 0, oofR = 0, oofO = 0, oofOR = 0, oofN = 0, folds = 0;
  const foldTriple = new Map<string, number>();
  for (const f of timeFolds(months)) {
    const train = sumMonths(acc, (m) => !f.held.includes(m) && !f.purged.includes(m));
    const held = acc.months.get(f.held[0]);
    if (!held || !train.n || !held.n) continue;
    const iStar = argmin(train.crps);
    foldTriple.set(f.held[0], iStar);
    oofC += held.crps[iStar]; oofR += held.crpsRice; oofO += held.outer[iStar]; oofOR += held.outerRice; oofN += held.n; folds += 1;
  }
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  const oof = oofN ? { crps: r6(oofC / oofN), crpsRice: r6(oofR / oofN), pitOuter: r6(oofO / oofN), pitOuterRice: r6(oofOR / oofN), n: oofN, folds } : null;
  const cv: SpeedCv = { crpsRice: r6(all.crpsRice / all.n), crpsTn: r6(all.crps[iAll] / all.n), pitOuterRice: r6(all.outerRice / all.n), pitOuterTn: r6(all.outer[iAll] / all.n), oof, winsOof: !!oof && oof.crps < oof.crpsRice };
  // the log-normal comparison on the stored subsample: LS of ln y on ln E per fold, s from the training residuals
  let ln: SpeedLn | null = null;
  if (acc.sample.length >= 2000) {
    const byMonth = new Map<string, Array<[number, number, number, number, number]>>();
    for (const [m, y, E, sd, nu, sg] of acc.sample) { let arr = byMonth.get(m); if (!arr) { arr = []; byMonth.set(m, arr); } arr.push([y, E, sd, nu, sg]); }
    let sC = 0, sO = 0, sT = 0, sR = 0, n = 0, aSum = 0, bSum = 0, sSum = 0, k = 0;
    for (const f of timeFolds([...byMonth.keys()].sort())) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0, nn = 0;
      for (const [m, rows] of byMonth) { if (f.held.includes(m) || f.purged.includes(m)) continue; for (const [y, E] of rows) { const x = Math.log(Math.max(E, 0.05)), yy = Math.log(Math.max(y, 0.2)); sx += x; sy += yy; sxx += x * x; sxy += x * yy; nn += 1; } }
      const held = byMonth.get(f.held[0]);
      if (!held || nn < 200) continue;
      const den = sxx - (sx * sx) / nn; if (!(den > 0)) continue;
      const bL = (sxy - (sx * sy) / nn) / den, aL = (sy - bL * sx) / nn;
      let s2 = 0;
      for (const [m, rows] of byMonth) { if (f.held.includes(m) || f.purged.includes(m)) continue; for (const [y, E] of rows) { const e = Math.log(Math.max(y, 0.2)) - (aL + bL * Math.log(Math.max(E, 0.05))); s2 += e * e; } }
      const sL = Math.sqrt(Math.max(1e-6, s2 / nn));
      const iStar = foldTriple.get(f.held[0]) ?? iAll;
      const [fa, fb, fc] = SPEED_GRID[iStar];
      for (const [y, E, sd, nu, sg] of held) {
        const mm = aL + bL * Math.log(Math.max(E, 0.05));
        sC += crpsLogNormal(mm, sL, y); sO += pitOuterOf(Phi((Math.log(Math.max(y, 1e-3)) - mm) / sL));
        sT += crpsTruncatedNormal(fa + fb * E, Math.max(1e-3, fc * sd), 0, y);
        sR += crpsRice({ kind: 'rice', nu, sigma: sg }, y);
        n += 1;
      }
      aSum += aL; bSum += bL; sSum += sL; k += 1;
    }
    if (n) ln = { crps: r6(sC / n), pitOuter: r6(sO / n), crpsTn: r6(sT / n), crpsRice: r6(sR / n), n, a: r6(aSum / k), b: r6(bSum / k), s: r6(sSum / k) };
  }
  return { ...base, a, b, c, status: cv.winsOof ? 'written' : 'no-skill', cv, ln };
}
