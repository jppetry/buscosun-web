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
 *
 * Phase FX (A1, V-FX-6 — absorbs V-FL-38): in Fit 4 the written a sat at the lower grid edge (−0,9) in 8/10 K strata and
 * b at the upper (1,1) in 7/10 — two of three parameters were a grid artefact; and a constant a per stratum mixes the
 * Rice excess E|V| − |EV| ≈ σ²/2ν (large at weak wind) with the site exposure (DE −0,24…−0,40 m/s, AT +0,19…+0,37 bias).
 * So a fit can choose the grid: `v3` = the 5×3×5 of fusionFit@3 (kept, byte-identical), `v4` = an opened grid
 * a −1,8…+0,6 × b 0,7…1,45 × c 0,8…1,7 (324 triples) PLUS a second family
 *
 *   `sd`:  ff ~ TN(a·sd_Rice + b·E_Rice, c·sd_Rice)         (a −1,8…+0,3, same b and c: 288 triples),
 *
 * (b up to 1,45 and the sd axis down to −1,8 since the first 4-month smoke put the 126–336 h sd optima at a −1,2 / b 1,3),
 *
 * whose offset scales with the Rice's own spread. Both families are accumulated in one `SpeedAcc`; per family the best
 * triple on all months and the out-of-fold CRPS, the family with the lower out-of-fold CRPS is written (tie → `add`).
 * `SpeedEntry.law` (absent = `add`, so Fit-4 tables stay readable), `grid` and `edge` (which of a/b/c sit at their axis's
 * border) are written under v4 only. The band verdict (`fit.mjs --speedBands`) fits the same per height band < / ≥ 800 m
 * and keys the entry `…|<band>`; `predict.ts speedEntryOf` prefers a written band entry when the caller knows its band.
 */
import { crpsTruncatedNormal, meanOf, cdfOf, Phi, type Dist } from '../../pointForecast/fusion/dist';
import { timeFolds, STRATUM_MIN } from './strata';
import { pitOuterOf } from './fitScale';

export const SPEED_NAMES = Object.freeze(['a', 'b', 'c'] as const);
export type SpeedLaw = 'add' | 'sd';
export type SpeedGrid = 'v3' | 'v4';
export type SpeedBand = 'lt800' | 'ge800';
export interface SpeedCandidate { law: SpeedLaw; a: number; b: number; c: number }
const A_V3 = [-0.9, -0.6, -0.3, 0, 0.3], B_V3 = [0.9, 1.0, 1.1], C_V3 = [0.9, 1.0, 1.15, 1.3, 1.5];
const A_V4 = [-1.8, -1.5, -1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6], B_V4 = [0.7, 0.85, 1.0, 1.15, 1.3, 1.45], C_V4 = [0.8, 0.95, 1.1, 1.25, 1.45, 1.7];
const A_SD = [-1.8, -1.5, -1.2, -0.9, -0.6, -0.3, 0, 0.3];
/** The axes per grid and family (edge detection reads the first and last value of each). */
export const SPEED_AXES: Readonly<Record<SpeedGrid, Partial<Record<SpeedLaw, { a: readonly number[]; b: readonly number[]; c: readonly number[] }>>>> = Object.freeze({
  v3: { add: { a: A_V3, b: B_V3, c: C_V3 } },
  v4: { add: { a: A_V4, b: B_V4, c: C_V4 }, sd: { a: A_SD, b: B_V4, c: C_V4 } },
});
const triples = (law: SpeedLaw, ax: { a: readonly number[]; b: readonly number[]; c: readonly number[] }): SpeedCandidate[] => ax.a.flatMap((a) => ax.b.flatMap((b) => ax.c.map((c) => ({ law, a, b, c }))));
/** The candidates of a grid, in accumulation order (v3: the 75 `add` triples of fusionFit@3; v4: 324 `add` then 288 `sd`). */
export const SPEED_CANDIDATES: Readonly<Record<SpeedGrid, readonly SpeedCandidate[]>> = Object.freeze({
  v3: triples('add', SPEED_AXES.v3.add!),
  v4: [...triples('add', SPEED_AXES.v4.add!), ...triples('sd', SPEED_AXES.v4.sd!)],
});
/** The v3 grid as triples (a, b, c) — the fusionFit@3 export, kept for its readers. */
export const SPEED_GRID: ReadonlyArray<readonly [number, number, number]> = Object.freeze(SPEED_CANDIDATES.v3.map((t) => [t.a, t.b, t.c] as const));
/** Which of a/b/c of a candidate sit at the first or last value of their axis in a grid. */
export function speedEdge(grid: SpeedGrid, cand: SpeedCandidate): string[] {
  const ax = SPEED_AXES[grid][cand.law];
  if (!ax) return [];
  const at = (xs: readonly number[], v: number) => v === xs[0] || v === xs[xs.length - 1];
  return (['a', 'b', 'c'] as const).filter((k) => at(ax[k], cand[k]));
}
/** Index of a candidate in a grid's accumulation order (−1 when the grid has no such triple). */
export const speedCandidateIndex = (grid: SpeedGrid, cand: SpeedCandidate): number => SPEED_CANDIDATES[grid].findIndex((c) => c.law === cand.law && c.a === cand.a && c.b === cand.b && c.c === cand.c);

/** Mean and sd of a Rice law — the two moments the speed law is built on. */
export function riceMoments(nu: number, sigma: number): { m: number; sd: number } {
  const m = meanOf({ kind: 'rice', nu, sigma });
  return { m, sd: Math.sqrt(Math.max(1e-6, 2 * sigma * sigma + nu * nu - m * m)) };
}
/** μ of a law at the Rice moments: `add` a + b·E, `sd` a·sd + b·E (absent law = `add`, the fusionFit@3 form). */
const lawMu = (law: SpeedLaw | undefined, a: number, b: number, E: number, sd: number): number => (law === 'sd' ? a * sd + b * E : a + b * E);
/** The truncated normal of a triple at a Rice law. */
export function speedLaw(rice: { nu: number; sigma: number }, p: { a: number; b: number; c: number; law?: SpeedLaw }): Extract<Dist, { kind: 'truncatedNormal' }> {
  const { m, sd } = riceMoments(rice.nu, rice.sigma);
  return { kind: 'truncatedNormal', mu: lawMu(p.law, p.a, p.b, m, sd), sigma: Math.max(1e-3, p.c * sd), lo: 0 };
}

class MonthAcc {
  n = 0; crpsRice = 0; outerRice = 0;
  readonly crps: Float64Array;
  readonly outer: Float64Array;
  readonly days = new Set<number>();
  constructor(k: number) { this.crps = new Float64Array(k); this.outer = new Float64Array(k); }
}

export interface SpeedOof { crps: number; crpsRice: number; pitOuter: number; pitOuterRice: number; n: number; folds: number }
export interface SpeedCv {
  /** In-sample mean CRPS of the Rice and of the best triple (all months), PIT edges likewise. */
  crpsRice: number; crpsTn: number; pitOuterRice: number; pitOuterTn: number;
  /** Out of fold: held-out months at the fold's best triple against the Rice. */
  oof: SpeedOof | null;
  winsOof: boolean;
  /** Phase FX (v4): per family the best triple on all months, its in-sample CRPS, edge flags and out-of-fold CRPS. */
  byLaw?: Partial<Record<SpeedLaw, { a: number; b: number; c: number; crpsTn: number; edge: string[]; oof: SpeedOof | null }>>;
  /** Phase FX (band entries): mean CRPS over all months of the band's rows at the POOLED stratum's written law, for the report. */
  crpsPooledLaw?: number | null;
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
  /** Phase FX (A1): the family of the law (absent = `add`), the grid it was searched on, the parameters at their axis border — v4 only. */
  law?: SpeedLaw;
  grid?: SpeedGrid;
  edge?: string[];
  /** Phase FX (band verdict): the height band of a band entry (absent = pooled over both bands). */
  band?: SpeedBand;
}

/** Per stratum: the grid sums per month, plus (optionally) a subsample of rows for the log-normal comparison. */
export class SpeedAcc {
  readonly grid: SpeedGrid;
  readonly cands: readonly SpeedCandidate[];
  readonly months = new Map<string, MonthAcc>();
  /** Stored rows [month index, y, E_Rice, sd_Rice, nu, sigma] for the LN comparison (only where the caller asks). */
  readonly sample: Array<[string, number, number, number, number, number]> = [];
  constructor(grid: SpeedGrid = 'v3') { this.grid = grid; this.cands = SPEED_CANDIDATES[grid]; }
  /** `y` = observed speed, (nu, sigma) the Rice of the row. */
  add(month: string, dayIdx: number, y: number, nu: number, sigma: number, keepSample = false): void {
    let m = this.months.get(month); if (!m) { m = new MonthAcc(this.cands.length); this.months.set(month, m); }
    const { m: E, sd } = riceMoments(nu, sigma);
    const rice: Dist = { kind: 'rice', nu, sigma };
    m.n += 1; m.days.add(dayIdx);
    m.crpsRice += crpsRice(rice, y); m.outerRice += pitOuterOf(cdfOf(rice, y));
    const cands = this.cands;
    for (let i = 0; i < cands.length; i++) {
      const { law, a, b, c } = cands[i];
      const mu = lawMu(law, a, b, E, sd), sg = Math.max(1e-3, c * sd);
      m.crps[i] += crpsTruncatedNormal(mu, sg, 0, y);
      m.outer[i] += pitOuterOf(tnCdf(mu, sg, y));
    }
    if (keepSample) this.sample.push([month, y, E, sd, nu, sigma]);
  }
  get n(): number { let s = 0; for (const m of this.months.values()) s += m.n; return s; }
  get days(): number { const d = new Set<number>(); for (const m of this.months.values()) for (const x of m.days) d.add(x); return d.size; }
  /** Mean CRPS over all months at one candidate index (for the band report against the pooled law); null when unknown. */
  crpsAt(i: number): number | null {
    if (i < 0 || i >= this.cands.length) return null;
    let s = 0, n = 0; for (const m of this.months.values()) { s += m.crps[i]; n += m.n; }
    return n ? s / n : null;
  }
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

/** argmin of `xs` over the index list `idx` (the candidates of one family), in list order — the first minimum wins. */
const argminOver = (xs: ArrayLike<number>, idx: readonly number[]): number => { let b = idx[0]; for (let k = 1; k < idx.length; k++) if (xs[idx[k]] < xs[b]) b = idx[k]; return b; };

/** Sum the month accumulators of a set of months. */
function sumMonths(acc: SpeedAcc, keep: (m: string) => boolean): MonthAcc {
  const out = new MonthAcc(acc.cands.length);
  for (const [k, m] of acc.months) { if (!keep(k)) continue; out.n += m.n; out.crpsRice += m.crpsRice; out.outerRice += m.outerRice; for (let i = 0; i < acc.cands.length; i++) { out.crps[i] += m.crps[i]; out.outer[i] += m.outer[i]; } for (const d of m.days) out.days.add(d); }
  return out;
}

/**
 * Fit one stratum: per family the triple on all months and the out-of-fold verdict, the family with the lower out-of-fold
 * CRPS (tie → `add`), the LN comparison where a sample was kept. `opts.band` marks a band entry; `opts.pooledLaw` (band
 * entries) names the pooled stratum's written law, scored on this accumulator's rows for the report.
 */
export function fitSpeedStratum(form: 'P' | 'K', bin: number, cls: string, acc: SpeedAcc, min: { n: number; days: number } = STRATUM_MIN, opts: { band?: SpeedBand; pooledLaw?: SpeedCandidate | null } = {}): SpeedEntry {
  const months = [...acc.months.keys()].sort();
  const all = sumMonths(acc, () => true);
  const v4 = acc.grid !== 'v3';
  const base = { form, var: 'ws' as const, bin, cls, names: SPEED_NAMES, family: 'truncatedNormal' as const, n: all.n, days: all.days.size, ...(opts.band ? { band: opts.band } : {}) };
  if (all.n < min.n || all.days.size < min.days) return { ...base, a: 0, b: 1, c: 1, status: 'too-short' };
  const laws: SpeedLaw[] = [...new Set(acc.cands.map((c) => c.law))];
  const idxOf = (law: SpeedLaw) => acc.cands.map((c, i) => (c.law === law ? i : -1)).filter((i) => i >= 0);
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  const folds = timeFolds(months);
  // per family: best triple on all months; out of fold: best triple on the training months, the held-out month at it
  const perLaw = laws.map((law) => {
    const idx = idxOf(law);
    const iAll = argminOver(all.crps, idx);
    let oofC = 0, oofR = 0, oofO = 0, oofOR = 0, oofN = 0, nFolds = 0;
    const foldTriple = new Map<string, number>();
    for (const f of folds) {
      const train = sumMonths(acc, (m) => !f.held.includes(m) && !f.purged.includes(m));
      const held = acc.months.get(f.held[0]);
      if (!held || !train.n || !held.n) continue;
      const iStar = argminOver(train.crps, idx);
      foldTriple.set(f.held[0], iStar);
      oofC += held.crps[iStar]; oofR += held.crpsRice; oofO += held.outer[iStar]; oofOR += held.outerRice; oofN += held.n; nFolds += 1;
    }
    const oof: SpeedOof | null = oofN ? { crps: r6(oofC / oofN), crpsRice: r6(oofR / oofN), pitOuter: r6(oofO / oofN), pitOuterRice: r6(oofOR / oofN), n: oofN, folds: nFolds } : null;
    return { law, iAll, oof, foldTriple, cand: acc.cands[iAll] };
  });
  // the family: lower out-of-fold CRPS wins, a tie or a missing verdict keeps `add`
  let win = perLaw[0];
  for (const c of perLaw.slice(1)) if (c.oof && (!win.oof || c.oof.crps < win.oof.crps)) win = c;
  const { iAll, oof, foldTriple, cand } = win;
  const cv: SpeedCv = { crpsRice: r6(all.crpsRice / all.n), crpsTn: r6(all.crps[iAll] / all.n), pitOuterRice: r6(all.outerRice / all.n), pitOuterTn: r6(all.outer[iAll] / all.n), oof, winsOof: !!oof && oof.crps < oof.crpsRice };
  if (v4) {
    cv.byLaw = Object.fromEntries(perLaw.map((c) => [c.law, { a: c.cand.a, b: c.cand.b, c: c.cand.c, crpsTn: r6(all.crps[c.iAll] / all.n), edge: speedEdge(acc.grid, c.cand), oof: c.oof }]));
  }
  if (opts.band && opts.pooledLaw !== undefined) { const i = opts.pooledLaw ? speedCandidateIndex(acc.grid, opts.pooledLaw) : -1; const x = acc.crpsAt(i); cv.crpsPooledLaw = x == null ? null : r6(x); }
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
      const fc = acc.cands[foldTriple.get(f.held[0]) ?? iAll];
      for (const [y, E, sd, nu, sg] of held) {
        const mm = aL + bL * Math.log(Math.max(E, 0.05));
        sC += crpsLogNormal(mm, sL, y); sO += pitOuterOf(Phi((Math.log(Math.max(y, 1e-3)) - mm) / sL));
        sT += crpsTruncatedNormal(lawMu(fc.law, fc.a, fc.b, E, sd), Math.max(1e-3, fc.c * sd), 0, y);
        sR += crpsRice({ kind: 'rice', nu, sigma: sg }, y);
        n += 1;
      }
      aSum += aL; bSum += bL; sSum += sL; k += 1;
    }
    if (n) ln = { crps: r6(sC / n), pitOuter: r6(sO / n), crpsTn: r6(sT / n), crpsRice: r6(sR / n), n, a: r6(aSum / k), b: r6(bSum / k), s: r6(sSum / k) };
  }
  // `law`/`grid`/`edge` only on the opened grid: a v3 fit writes the fusionFit@3 entry byte for byte (absent law = `add`)
  return { ...base, a: cand.a, b: cand.b, c: cand.c, status: cv.winsOof ? 'written' : 'no-skill', cv, ln, ...(v4 ? { law: cand.law, grid: acc.grid, edge: speedEdge(acc.grid, cand) } : {}) };
}
