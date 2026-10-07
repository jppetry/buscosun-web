/**
 * longRange.ts — phase F10, candidate K1 "Langfrist-Rückführung auf die Klimatologie" (`audit/fusion-10/stat.md`).
 *
 * Beyond 48 h the fused distributions of T, Td, wind speed and gust are blended towards the engine's own climatology
 * with a lead- and variable-dependent weight w and rescaled with an EMOS-like factor s on the standard deviation:
 *
 *   mean'  = w·μ + (1 − w)·μ_c
 *   var'   = s² · ( w·σ² + (1 − w)·σ_c² + w(1 − w)·(μ − μ_c)² )          (moment-matched two-component mixture)
 *
 * Pure module, no I/O. `blendDist` keeps the family of the input distribution: for `normal` the formulas act on
 * (mu, sigma) exactly; for `truncatedNormal`, `censoredNormal` (the gust family) and `rice` they act on the LOCATION/SCALE
 * parameters (mu/sigma, nu/sigma)
 * — an approximation, since those are not the moments of the truncated/Rice law (the error is second order in
 * σ/μ and vanishes for w = 1, s = 1). Any other kind is returned unchanged. With w = 1 and s = 1 the SAME object is
 * returned (identity by reference), so the engine is byte-identical whenever the table is the identity.
 *
 * The parameters live in `LONG_RANGE_TABLE` per variable × lead bin; `longRangeParams` interpolates linearly in lead
 * between the bin centres (knot (48 h, {1, 1}) in front, the last centre held beyond) so the forecast has no jumps.
 * Provenance travels with the table (fit window, slots, rows, date); the fitted values come from
 * `scripts/fusion10/fit-longrange.mjs` on hindcast slots OUTSIDE the vault of the Prüfstand.
 */
import { meanOf, phi, Phi, type Dist } from './dist';

export type LongRangeVar = 't' | 'td' | 'ws' | 'gust';
export const LONG_RANGE_VARS: readonly LongRangeVar[] = ['t', 'td', 'ws', 'gust'];

/** Leads at or below this are never touched (w = 1, s = 1). */
export const LONG_RANGE_FROM_H = 48;

/**
 * Second sub-feature of buscosun Fusion 10 (K3 of phase F10, `audit/fusion-10.md` §3.2): wind and gust keep the climatology
 * step (`FusionContext.priorShrink` except-list) from this lead on, only at points in these countries — the E-AX-11 pattern
 * (DE loses with the step, AT/CH gain) held in two independent pre-screen samples. `null` = sub-feature off.
 */
export const FUSION10_WIND_SHRINK_FROM_H: number | null = 126;
export const FUSION10_WIND_SHRINK_COUNTRIES: readonly string[] = Object.freeze(['AT', 'CH']);

/**
 * buscosun Fusion 11 (phase F11, `audit/fusion-11.md`): the two acceptance defects of Fusion 10 (V-F10-7/8) removed, nothing
 * else changed. With `FuseCubeOptions.longRangeFix: 1` (only together with `longRange: 1`):
 *  (1) V-F10-7 — the T bin 241–336 h is the identity (w = 1, s = 1; `LONG_RANGE_TABLE_F11`): the F10 fit had no blend gain
 *      there (w = 1) and the σ widening s = 1,05 cost 0,2–0,4 % CRPS in track R (coverage 80,8 → 82,3 %, too wide). A refit with a
 *      monotonicity constraint was rejected on the out-of-vault fit grid itself (every w ≤ 0,8 loses ≥ 0,5 % against the identity in
 *      that bin, `audit/fusion-10/longrange-fit.json`). `FUSION11_T_TAIL` = how the bin is reached: 'ramp' = the knot interpolation
 *      of `longRangeParams` towards (1, 1) at 288,5 h (`LONG_RANGE_TABLE_F11`), 'step' = the Fusion 10 table up to 240 h and the exact
 *      identity at every T lead ≥ 241 h — so T differs from Fusion 10 ONLY beyond 240 h. Pre-screen (hindcast outside the vault,
 *      8 slots 09/2025, role B, t 240–336 h vs Fusion 9): ramp −0,54 % (every country), step ±0,00 % ⇒ step (rule §2.1); the quick
 *      set (7 autumn days 2026, coverage there only 65 %) preferred the ramp (+0,43 %) — noted as V-F11-1.
 *  (2) V-F10-8 — the AT/CH wind/gust climatology step starts at `FUSION11_WIND_SHRINK_FROM_H` instead of 126 h and/or keeps the
 *      combination's σ (`FUSION11_WIND_SIGMA_FLOOR`, `FusionContext.priorShrink.sigmaFloor`): at 126–240 h the full step narrowed
 *      the AT bands 3,69 → 3,30 m/s for +0,6/+0,2 % CRPS and pushed the q10–q90 coverage below the champion's (G3 red); at 241–336 h
 *      the same step gained +8,9/+6,6 %.
 * The forms were chosen by the rule written down in `audit/fusion-11.md` §2 BEFORE the pre-screen numbers (hindcast outside the
 * vault + quick set), never on vault numbers. Set, not measured at the point.
 */
export const FUSION11_T_TAIL: 'ramp' | 'step' = 'step';
export const FUSION11_T_IDENTITY_FROM_H = 241;
/**
 * Pre-screen (rule §2.2 of `audit/fusion-11.md`, written before the numbers; role B vs Fusion 9): both forms keep Fusion 9's ws coverage
 * at 120–240 h (hindcast 75,3/75,3 %, quick set 75,1/75,1 %); 241 h loses in no ws/gust cell and gains ws 240–336 h +4,1 % (hindcast)
 * / +10,2 % (quick set); the σ floor at 126 h gains only +0,01/+0,37 % at 120–240 h and loses 0,25 % in CH there ⇒ 241 h, no floor.
 */
export const FUSION11_WIND_SHRINK_FROM_H: number = 241;
export const FUSION11_WIND_SIGMA_FLOOR: boolean = false;

export interface LongRangeEntry { w: number; s: number }
export interface LongRangeBin { id: string; fromH: number; toH: number; centreH: number }

export interface LongRangeTable {
  version: 1;
  provenance: {
    kind: 'identity' | 'hindcast';
    /** Fit window (issue days, 00 UTC hindcast slots), outside the vault. */
    fitWindow?: { from: string; to: string; everyDays: number };
    slots?: number;
    /** Rows per variable and bin that went into the fit. */
    rows?: Partial<Record<LongRangeVar, number[]>>;
    date?: string;
    note?: string;
  };
  bins: LongRangeBin[];
  /** One entry per bin, in the order of `bins`. */
  params: Record<LongRangeVar, LongRangeEntry[]>;
}

export const LONG_RANGE_BINS: readonly LongRangeBin[] = Object.freeze([
  { id: '49-72', fromH: 49, toH: 72, centreH: 60.5 },
  { id: '73-120', fromH: 73, toH: 120, centreH: 96.5 },
  { id: '121-168', fromH: 121, toH: 168, centreH: 144.5 },
  { id: '169-240', fromH: 169, toH: 240, centreH: 204.5 },
  { id: '241-336', fromH: 241, toH: 336, centreH: 288.5 },
]);

const ONES = (): LongRangeEntry[] => LONG_RANGE_BINS.map(() => ({ w: 1, s: 1 }));

/** Identity table: every bin w = 1, s = 1 — the engine computes exactly as without the option. */
export const LONG_RANGE_IDENTITY: LongRangeTable = Object.freeze({
  version: 1 as const,
  provenance: { kind: 'identity' as const, note: 'all w = 1, s = 1 — no blending, used to collect the unblended rows for the fit' },
  bins: [...LONG_RANGE_BINS],
  params: { t: ONES(), td: ONES(), ws: ONES(), gust: ONES() },
});

/**
 * Fitted table (F10-K1). Provenance `hindcast` — fitted by `scripts/fusion10/fit-longrange.mjs` (grid search on the
 * mean CRPS_Q over the 19 protocol quantiles) on 00-UTC hindcast slots of the window named below, every 6th day,
 * chain without station/measurement (as in track R). Values are set, never `measured` at the point.
 */
export const LONG_RANGE_TABLE: LongRangeTable = Object.freeze({
  version: 1 as const,
  provenance: {
    kind: 'hindcast' as const,
    fitWindow: { from: '2025-09-08', to: '2026-09-21', everyDays: 12 },
    slots: 32,
    rows: { t: [92062, 184007, 92063, 138138, 184094], td: [92015, 183918, 92016, 138044, 183971], ws: [91937, 183744, 91924, 137877, 183812], gust: [91871, 183594, 91775, 137592, 183527] },
    date: '2026-10-07',
    note: 'audit/fusion-10/longrange-fit.json — 32 slots 2025-09-08…2026-09-15 (every 12th day), 700 800 steps, chain as in track R (no station/obs, LOSO climatology at role B); country rule ≤ 1 % worse applied (shrunk bins marked there); wind reset to identity after bench run 1 (A-F10-6)',
  },
  bins: [...LONG_RANGE_BINS],
  params: {
    t: [{ w: 0.975, s: 0.9 }, { w: 0.95, s: 0.95 }, { w: 0.9, s: 0.85 }, { w: 0.65, s: 0.9 }, { w: 1, s: 1.05 }],
    td: [{ w: 0.9, s: 0.75 }, { w: 0.925, s: 0.925 }, { w: 0.85, s: 0.8 }, { w: 0.55, s: 0.9 }, { w: 0.6, s: 1.05 }],
    // wind: the fit gave w = 1 everywhere and s = 1/1,05/1,05/1,05/0,8 (gain +0,0…+1,0 % on the fit window — within noise); the bench's
    // full test of 07.10. (run 1, development set) showed the σ scale significantly WORSE for AT/CH wind at 48–240 h (G2 red:
    // −0,2/−0,9/−1,5 %). Wind therefore stays at identity here; the wind sub-feature of Fusion 10 is the AT/CH climatology step
    // (`FUSION10_WIND_SHRINK_*`). Decision A-F10-6, audit/fusion-10.md §3.3/§3.4.
    ws: [{ w: 1, s: 1 }, { w: 1, s: 1 }, { w: 1, s: 1 }, { w: 1, s: 1 }, { w: 1, s: 1 }],
    gust: [{ w: 1, s: 1 }, { w: 0.9, s: 0.8 }, { w: 0.75, s: 0.875 }, { w: 0.7, s: 0.825 }, { w: 0.8, s: 0.875 }],
  },
});

/**
 * Fusion 11 table (V-F10-7): `LONG_RANGE_TABLE` with the T bin 241–336 h at the identity (w = 1, s = 1). Every other entry is
 * byte-identical to the Fusion 10 table; the provenance names the change.
 */
export const LONG_RANGE_TABLE_F11: LongRangeTable = Object.freeze({
  ...LONG_RANGE_TABLE,
  provenance: { ...LONG_RANGE_TABLE.provenance, note: `${LONG_RANGE_TABLE.provenance.note}; F11 (V-F10-7): T bin 241–336 h set to the identity (w = 1, s = 1) — the fit gave w = 1 there and s = 1,05 widened already-right bands (track R of Fusion 10)` },
  params: { ...LONG_RANGE_TABLE.params, t: LONG_RANGE_TABLE.params.t.map((e, i) => (LONG_RANGE_BINS[i].fromH >= FUSION11_T_IDENTITY_FROM_H ? { w: 1, s: 1 } : e)) },
});

/** Index of the bin that holds `leadH`, or −1 for leads ≤ 48 h / beyond the last bin. */
export function longRangeBinIndex(leadH: number, bins: readonly LongRangeBin[] = LONG_RANGE_BINS): number {
  for (let i = 0; i < bins.length; i++) if (leadH >= bins[i].fromH && leadH <= bins[i].toH) return i;
  return -1;
}

/**
 * (w, s) for a variable at a lead: w = s = 1 for leadH ≤ 48; otherwise linear interpolation in lead between the knots
 * (48, {1, 1}), (centre_1, p_1), …, (centre_n, p_n); beyond the last centre the last entry is held.
 */
export function longRangeParams(variable: LongRangeVar, leadH: number, table: LongRangeTable = LONG_RANGE_TABLE): LongRangeEntry {
  if (!(leadH > LONG_RANGE_FROM_H)) return { w: 1, s: 1 };
  const ps = table.params[variable];
  const bins = table.bins;
  if (!ps || !ps.length || ps.length !== bins.length) return { w: 1, s: 1 };
  let x0 = LONG_RANGE_FROM_H, w0 = 1, s0 = 1;
  for (let i = 0; i < bins.length; i++) {
    const x1 = bins[i].centreH, p1 = ps[i];
    if (leadH <= x1) {
      const f = (leadH - x0) / (x1 - x0);
      return { w: w0 + (p1.w - w0) * f, s: s0 + (p1.s - s0) * f };
    }
    x0 = x1; w0 = p1.w; s0 = p1.s;
  }
  return { w: w0, s: s0 };
}

/** Location and scale of the families the blend acts on; `null` for any other kind. */
export function locScaleOf(d: Dist): { loc: number; scale: number } | null {
  switch (d.kind) {
    case 'normal':
    case 'truncatedNormal':
    case 'censoredNormal':
      return { loc: d.mu, scale: d.sigma };
    case 'rice':
      return { loc: d.nu, scale: d.sigma };
    default:
      return null;
  }
}

/** Standard deviation of a distribution (closed forms for normal, truncatedNormal, rice; NaN otherwise). */
export function sdOf(d: Dist): number {
  switch (d.kind) {
    case 'normal':
    case 'censoredNormal':   // the latent sd — the censoring at 0/90 m/s is far out for the gust of the climatology
      return d.sigma;
    case 'truncatedNormal': {
      if (!(d.sigma > 0)) return 0;
      const a = (d.lo - d.mu) / d.sigma, Z = 1 - Phi(a);
      if (!(Z > 1e-12)) return 0;
      const lam = phi(a) / Z;
      return d.sigma * Math.sqrt(Math.max(0, 1 + a * lam - lam * lam));
    }
    case 'rice': {
      const m = meanOf(d);
      return Math.sqrt(Math.max(0, 2 * d.sigma * d.sigma + d.nu * d.nu - m * m));
    }
    default:
      return NaN;
  }
}

/**
 * Blends `dist` towards the climatology `clima` with weight w on the forecast and rescales the spread by s.
 * Returns `dist` itself (===) when w === 1 && s === 1, or when the family is not one of normal/truncatedNormal/censoredNormal/rice.
 * The climatology's location/scale is taken from its own parameters when it is of a blendable family, otherwise
 * from its mean and standard deviation (e.g. a Rice climatology against a truncated-normal speed law).
 */
export function blendDist(dist: Dist, clima: Dist, w: number, s: number): Dist {
  if (w === 1 && s === 1) return dist;
  if (!(w >= 0 && w <= 1) || !(s > 0)) return dist;
  const ls = locScaleOf(dist);
  if (!ls) return dist;
  let muC: number, sigC: number;
  if (clima.kind === dist.kind) { const c = locScaleOf(clima)!; muC = c.loc; sigC = c.scale; }
  else { muC = meanOf(clima); sigC = sdOf(clima); }
  if (!Number.isFinite(muC) || !Number.isFinite(sigC)) return dist;
  const mu = ls.loc, sig = ls.scale;
  const loc = w * mu + (1 - w) * muC;
  const v = w * sig * sig + (1 - w) * sigC * sigC + w * (1 - w) * (mu - muC) * (mu - muC);
  const scale = s * Math.sqrt(Math.max(0, v));
  switch (dist.kind) {
    case 'normal': return { kind: 'normal', mu: loc, sigma: scale };
    case 'truncatedNormal': return { kind: 'truncatedNormal', mu: loc, sigma: scale, lo: dist.lo };
    case 'censoredNormal': return { kind: 'censoredNormal', mu: loc, sigma: scale, lo: dist.lo, hi: dist.hi };
    case 'rice': return { kind: 'rice', nu: Math.max(0, loc), sigma: scale };
    default: return dist;
  }
}
