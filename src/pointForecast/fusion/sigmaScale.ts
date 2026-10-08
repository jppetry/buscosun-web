/**
 * sigmaScale.ts — phase OF, step OF-7 (`audit/obs-fusion.md` §11): the two tables behind the candidate `fusion-12r`, both
 * measured on hindcast slots OUTSIDE the vault of the Prüfstand and before the development set of track P
 * (`scripts/obsfusion/of7.mjs`, result `audit/obs-fusion/of7-fit.json`). Pure module, no I/O. (The first ρ form was the Cauchy
 * product of `spatialWeight`; the bins carry a floor of 0,08–0,12 at 60–120 km that this form cannot hold without flattening
 * the near range, so the form became an exponential decay on a floor — changed on the hindcast residuals, before any Prüfstand run.)
 *
 * (1) `SIGMA_SCALE_TABLE` — lever 4 of the G3 note: a factor on σ of the fused T, Td, wind speed and gust per lead window,
 *     fitted so that the q10–q90 coverage of the chain WITHOUT anchor meets the nominal 80 % of gate G3 (pooled over
 *     countries and roles). One node per protocol window, interpolated linearly in lead between the window centres and held
 *     flat outside (`sigmaScaleAt`), so the bands have no jumps at the window borders. `FuseCubeOptions.sigmaScale`.
 * (2) `ANCHOR_RHO_TABLE` — lever 1: the correlation ρ(d, Δh) of the chain's error at one station with the error at another
 *     (same valid time, lead 1–3 h), fitted per variable to the form ρ₀ / ((1 + (d/D)²)(1 + (Δh/H)²)) — the shape of
 *     `spatialWeight`, but with MEASURED ρ₀, D and H. Wind is measured on the speed error and applied to u and v.
 *     `FuseCubeOptions.anchorRho` (only together with `anchorSigma`): the σ formula of OF-6 assumed the anchor's
 *     representativity `fraction` to be that correlation; with ρ measured the explained share becomes
 *     r·a²·(2ρ/f − 1) instead of r·a² (`anchorSigmaFactorRho` in cubeSource.ts).
 *
 * Both tables carry their provenance; the identity table makes the engine byte-identical (used by the verifier).
 */

export type SigmaScaleVar = 't' | 'td' | 'ws' | 'gust';
export const SIGMA_SCALE_VARS: readonly SigmaScaleVar[] = ['t', 'td', 'ws', 'gust'];

export interface SigmaScaleTable {
  version: 1;
  provenance: { kind: 'identity' | 'hindcast'; note: string; fitWindow?: { from: string; to: string }; slots?: number; rows?: number; date?: string; nominal?: number };
  /** Lead (h) of each node = centre of the protocol windows 0–6 · 6–24 · 24–48 · 48–120 · 120–240 · 240–336. */
  centresH: readonly number[];
  /** Factor on σ at each node, per variable; 1 = unchanged. */
  nodes: Record<SigmaScaleVar, readonly number[]>;
  /** V-OF-16: nodes per country (ISO-2); a point in a listed country takes these, any other point the pooled `nodes`. */
  byCountry?: Readonly<Record<string, Record<SigmaScaleVar, readonly number[]>>>;
}

export const SIGMA_SCALE_CENTRES_H: readonly number[] = Object.freeze([3.5, 15.5, 36.5, 84.5, 180.5, 288.5]);

const ONES = (): readonly number[] => Object.freeze(SIGMA_SCALE_CENTRES_H.map(() => 1));

/** Identity: every node 1 — the engine computes exactly as without the option (same object returned by `sigmaScaleAt` = 1). */
export const SIGMA_SCALE_IDENTITY: SigmaScaleTable = Object.freeze({
  version: 1 as const,
  provenance: { kind: 'identity' as const, note: 'all nodes 1 — no scaling' },
  centresH: SIGMA_SCALE_CENTRES_H,
  nodes: Object.freeze({ t: ONES(), td: ONES(), ws: ONES(), gust: ONES() }),
});

/**
 * The fitted table (OF-7, `audit/obs-fusion/of7-fit.json`, 2026-10-08): 159 hindcast slots (window A: t1 route `run`
 * 2026-06-18 … 2026-09-13 at 00/12 UTC every 2nd day — the only period with a real stage-1 run, so the 0–48 h nodes are
 * SUMMER-only; window B: 00 UTC 2025-09-08 … 2026-06-16 every 4th day, t2/t3, leads ≥ 51 h), 19,8 M rows at 365 stations,
 * vault 2024-04-01 … 2025-08-31 and the archive set from 2026-09-14 untouched. Coverage q10–q90 of the chain without anchor,
 * pooled (all countries, both roles), before → 80,0 % after: T 88,6/87,1/86,3/82,1/81,2/79,4 %, Td 83,2/83,5/83,7/80,7/80,4/80,8 %,
 * wind 83,1/83,5/79,8/76,2/78,0/77,6 %, gust 84,7/84,9/84,8/80,4/80,8/80,2 %. CRPS_Q moves by −0,9 … +1,8 % (reported, not fitted).
 */
export const SIGMA_SCALE_TABLE: SigmaScaleTable = Object.freeze({
  version: 1 as const,
  provenance: { kind: 'hindcast' as const, note: 'OF-7 fit 2026-10-08 — coverage q10–q90 of the chain without anchor on 80 % per window, hindcast outside the vault; the 0–48 h nodes come from summer 2026 only (the only stage-1 runs)', fitWindow: { from: '2025-09-08', to: '2026-09-13' }, slots: 159, rows: 19_786_671, date: '2026-10-08', nominal: 0.8 },
  centresH: SIGMA_SCALE_CENTRES_H,
  nodes: Object.freeze({
    t: Object.freeze([0.775, 0.834, 0.829, 0.972, 0.963, 1.021]),
    td: Object.freeze([0.926, 0.911, 0.9, 1, 0.991, 0.98]),
    ws: Object.freeze([0.897, 0.859, 1.026, 1.192, 1.064, 1.132]),
    gust: Object.freeze([0.885, 0.871, 0.869, 1.02, 0.963, 0.995]),
  }),
});

/**
 * `FuseCubeOptions.sigmaScale: 2` — the same fit with the three nodes ≤ 48 h held at 1: those nodes rest on summer 2026 alone
 * (the learned σ at 7–48 h was itself fitted on 95 summer days, E-FL-3), the nodes ≥ 48 h on a full year. Declared BEFORE the
 * Prüfstand runs as the variant that keeps only the seasonally founded part (`audit/obs-fusion.md` §11.5).
 */
export const SIGMA_SCALE_TABLE_LONG: SigmaScaleTable = Object.freeze({
  ...SIGMA_SCALE_TABLE,
  provenance: { ...SIGMA_SCALE_TABLE.provenance, note: `${SIGMA_SCALE_TABLE.provenance.note}; nodes ≤ 48 h held at 1 (sigmaScale: 2)` },
  nodes: Object.freeze(Object.fromEntries(SIGMA_SCALE_VARS.map((v) => [v, Object.freeze(SIGMA_SCALE_TABLE.nodes[v].map((s, i) => (SIGMA_SCALE_CENTRES_H[i] <= 48 ? 1 : s)))])) as Record<SigmaScaleVar, readonly number[]>),
});

/**
 * `FuseCubeOptions.sigmaScale: 3` — the track-P hypothesis of E-OF-5 (`audit/obs-fusion.md` §11.8; written before any track-P day
 * exists, derived from the development-set picture of 12r and therefore never judged on it again): the fitted nodes ≤ 48 h for
 * wind and gust, for T and Td from 6 h on (node 0–6 h = 1: the summer-only 0–6 h node narrowed the autumn bands below the band),
 * and NO scaling beyond 48 h for any variable — there the hindcast and the archive disagree (V-OF-18: wind in AT/CH covers 72–75 %
 * on the hindcast but widening it by 19 % cost 1,7–4,1 % CRPS on the archive; T 240–336 h covers 79 % on the hindcast, 64 % on the
 * archive), and on the hindcast itself the wind nodes > 48 h improved coverage while worsening CRPS (a shape, not a scale, problem).
 * The per-country fit of V-OF-16 is reported in `of7-fit.json` (`byLandNodes`) and not used.
 */
export const SIGMA_SCALE_TABLE_P: SigmaScaleTable = Object.freeze({
  ...SIGMA_SCALE_TABLE,
  provenance: { ...SIGMA_SCALE_TABLE.provenance, note: `${SIGMA_SCALE_TABLE.provenance.note}; track-P hypothesis E-OF-5: T/Td node 0–6 h = 1, every node > 48 h = 1 (sigmaScale: 3)` },
  nodes: Object.freeze(Object.fromEntries(SIGMA_SCALE_VARS.map((v) => [v, Object.freeze(SIGMA_SCALE_TABLE.nodes[v].map((s, i) => (SIGMA_SCALE_CENTRES_H[i] > 48 || ((v === 't' || v === 'td') && i === 0) ? 1 : s)))])) as Record<SigmaScaleVar, readonly number[]>),
});

/**
 * Scale at lead `leadH`: linear between the nodes, flat before the first and beyond the last centre. 1 when the table has no
 * node. With `country` and a `byCountry` entry for it, that country's nodes; otherwise the pooled nodes.
 */
export function sigmaScaleAt(table: SigmaScaleTable, v: SigmaScaleVar, leadH: number, country?: string | null): number {
  const c = table.centresH, s = (country && table.byCountry?.[country]?.[v]) || table.nodes[v];
  if (!c?.length || !s || s.length !== c.length || !Number.isFinite(leadH)) return 1;
  if (leadH <= c[0]) return s[0];
  for (let i = 1; i < c.length; i++) {
    if (leadH <= c[i]) { const f = (leadH - c[i - 1]) / (c[i] - c[i - 1]); return s[i - 1] + f * (s[i] - s[i - 1]); }
  }
  return s[s.length - 1];
}

// ---------------------------------------------------------------------------
// V-OF-15: the anchor of K stations. The σ coupling needs cov and var of the AVERAGED innovation set Ī the dense anchor
// really uses (K = OBS_DENSE_ANCHOR_K best of the nearest stations, weights spatialWeight, wind/gust damped over 10 km), not
// ρ and σ₁² of a single station: with k = f·w(τ) on Ī the variance left is σ_τ² − 2k·w·cov(e₁, Ī) + k²·var(Ī), i.e.
// factor² = 1 − r·a²·(2C/f − V) with C = cov(e₁, Ī)/var(e₁) and V = var(Ī)/var(e₁), both measured on the hindcast per
// variable × class of f (= max weight of the set). OF-7's ρ form is the special case C = ρ, V = 1.
// ---------------------------------------------------------------------------
export interface AnchorKSetClass { fLo: number; fHi: number; n: number; C: number | null; V: number | null }
export interface AnchorKSetTable {
  version: 1;
  provenance: { kind: 'set' | 'hindcast'; note: string; fitWindow?: { from: string; to: string }; slots?: number; date?: string; k?: number };
  t: readonly AnchorKSetClass[];
  /** Measured on the wind speed error with the damped weights, applied to u and v. */
  wind: readonly AnchorKSetClass[];
  gust: readonly AnchorKSetClass[];
}

/**
 * The fitted K-set table (OF-7b, `audit/obs-fusion/of7-kset.json`, 2026-10-08): 352 hindcast slots (2026-06-18 … 2026-09-13, all
 * four daily slots — the stage-1 runs), 128 480 calls, per point the K = 6 best of the 12 nearest other Prüfnetz stations. A class
 * needs ≥ 2 000 rows and C > 0; an unpopulated class is taken from the nearest populated one below (`anchorKSetOf`). The Prüfnetz
 * is sparser than the dense set of the product, so the high-f classes (close stations) are thin: wind/gust have no rows at
 * f 0,7–0,85 and 704 rows with C < 0 at f ≥ 0,85 (⇒ null, the 0,5–0,7 class stands in). Factorisation check R(τ)/(w(τ)·C) ≈ 0,9–1,3
 * for T at τ 2–6 h (reported in the JSON per class and lead).
 */
export const ANCHOR_KSET_TABLE: AnchorKSetTable = Object.freeze({
  version: 1 as const,
  provenance: { kind: 'hindcast' as const, note: 'OF-7b fit 2026-10-08 — cov/var of the averaged innovation set of the K = 6 best of the 12 nearest stations per f-class, hindcast t1 runs 2026-06-18 … 2026-09-13 (summer), classes with ≥ 2 000 rows and C > 0', fitWindow: { from: '2026-06-18', to: '2026-09-13' }, slots: 352, date: '2026-10-08', k: 6 },
  t: Object.freeze([
    { fLo: 0, fHi: 0.15, n: 27_186, C: 0.176, V: 0.359 },
    { fLo: 0.15, fHi: 0.3, n: 51_699, C: 0.259, V: 0.385 },
    { fLo: 0.3, fHi: 0.5, n: 21_703, C: 0.321, V: 0.482 },
    { fLo: 0.5, fHi: 0.7, n: 14_760, C: 0.299, V: 0.476 },
    { fLo: 0.7, fHi: 0.85, n: 5_972, C: 0.452, V: 0.529 },
    { fLo: 0.85, fHi: 1.0001, n: 5_280, C: 0.438, V: 0.503 },
  ]),
  wind: Object.freeze([
    { fLo: 0, fHi: 0.15, n: 116_713, C: 0.12, V: 0.737 },
    { fLo: 0.15, fHi: 0.3, n: 3_514, C: 0.105, V: 0.861 },
    { fLo: 0.3, fHi: 0.5, n: 3_516, C: 0.438, V: 0.921 },
    { fLo: 0.5, fHi: 0.7, n: 2_112, C: 0.459, V: 0.776 },
    { fLo: 0.7, fHi: 0.85, n: 0, C: null, V: null },
    { fLo: 0.85, fHi: 1.0001, n: 704, C: null, V: null },
  ]),
  gust: Object.freeze([
    { fLo: 0, fHi: 0.15, n: 116_682, C: 0.208, V: 0.797 },
    { fLo: 0.15, fHi: 0.3, n: 3_513, C: 0.364, V: 0.901 },
    { fLo: 0.3, fHi: 0.5, n: 3_514, C: 0.571, V: 0.888 },
    { fLo: 0.5, fHi: 0.7, n: 2_112, C: 0.54, V: 0.814 },
    { fLo: 0.7, fHi: 0.85, n: 0, C: null, V: null },
    { fLo: 0.85, fHi: 1.0001, n: 702, C: null, V: null },
  ]),
});

/**
 * (C, V) for the class that holds `f`; a class without values (too few rows) takes the nearest populated class BELOW it (a
 * sparser set, conservative), else the nearest above; null when the table has no populated class at all.
 */
export function anchorKSetOf(classes: readonly AnchorKSetClass[], f: number): { C: number; V: number; cls: AnchorKSetClass } | null {
  if (!classes?.length || !Number.isFinite(f)) return null;
  const ff = Math.min(1, Math.max(0, f));
  let idx = classes.findIndex((c) => ff >= c.fLo && ff < c.fHi);
  if (idx < 0) idx = ff >= 1 ? classes.length - 1 : 0;
  const ok = (c: AnchorKSetClass | undefined) => !!c && c.C != null && c.V != null && Number.isFinite(c.C) && Number.isFinite(c.V);
  for (let i = idx; i >= 0; i--) if (ok(classes[i])) return { C: classes[i].C as number, V: classes[i].V as number, cls: classes[i] };
  for (let i = idx + 1; i < classes.length; i++) if (ok(classes[i])) return { C: classes[i].C as number, V: classes[i].V as number, cls: classes[i] };
  return null;
}

/** ρ = ρ₀ · (c + (1 − c)·e^(−d/D)) / (1 + (Δh/H)²): `c` = the floor the shared synoptic error keeps at 60–120 km, D in km, H in m. */
export interface AnchorRhoParams { rho0: number; c: number; dKm: number; hM: number }
export interface AnchorRhoTable {
  version: 1;
  provenance: { kind: 'set' | 'hindcast'; note: string; fitWindow?: { from: string; to: string }; slots?: number; pairs?: Record<string, number>; date?: string };
  t: AnchorRhoParams;
  /** Measured on the wind speed error, applied to u and v. */
  wind: AnchorRhoParams;
  gust: AnchorRhoParams;
}

/**
 * The fitted ρ table (OF-7). Until the fit is written: a set shape without floor (ρ₀ = 1, c = 0, D = 20 km, H = 200 m) — the
 * provenance says which.
 */
export const ANCHOR_RHO_TABLE: AnchorRhoTable = Object.freeze({
  version: 1 as const,
  // Measured bins (Δh < 100 m) T: 0,71 (2,5 km) · 0,54 (7,5) · 0,34 (15) · 0,29 (27,5) · 0,17 (47,5) · 0,12 (90 km); wind 0,26 · 0,36 ·
  // 0,23 · 0,21 · 0,13 · 0,08; gust 0,43 · 0,54 · 0,30 · 0,29 · 0,18 · 0,11 — against spatialWeight 0,93 · 0,83 · 0,60 · 0,33 · 0,14 · 0,04.
  provenance: { kind: 'hindcast' as const, note: 'OF-7 fit 2026-10-08 — error correlation between stations at the same valid time, lead 1–3 h, 1,54–1,57 M pairs ≤ 120 km per variable, t1 runs 2026-06-18 … 2026-09-13 (summer), weighted least squares on the bins (weight min(n, 5000))', fitWindow: { from: '2026-06-18', to: '2026-09-13' }, slots: 89, pairs: { t: 1_537_876, wind: 1_574_707, gust: 1_574_296 }, date: '2026-10-08' },
  t: { rho0: 0.71, c: 0.2, dKm: 20, hM: 300 },
  wind: { rho0: 0.3, c: 0.24, dKm: 40, hM: 500 },
  gust: { rho0: 0.6, c: 0.16, dKm: 25, hM: 500 },
});

/** ρ(d, Δh) = ρ₀ · (c + (1 − c)·e^(−d/D)) / (1 + (Δh/H)²), clamped to [0, 1]; `distanceM`, `dElevM` in metres. */
export function anchorRhoOf(p: AnchorRhoParams, distanceM: number, dElevM: number): number {
  if (!p || !(p.dKm > 0) || !(p.hM > 0) || !Number.isFinite(p.rho0) || !Number.isFinite(p.c)) return 0;
  const d = Math.max(0, Number.isFinite(distanceM) ? distanceM : 0) / (p.dKm * 1000);
  const h = Math.abs(Number.isFinite(dElevM) ? dElevM : 0) / p.hM;
  const c = Math.max(0, Math.min(1, p.c));
  return Math.max(0, Math.min(1, (p.rho0 * (c + (1 - c) * Math.exp(-d))) / (1 + h * h)));
}
