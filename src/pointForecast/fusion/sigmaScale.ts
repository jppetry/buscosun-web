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

/** Scale at lead `leadH`: linear between the nodes, flat before the first and beyond the last centre. 1 when the table has no node. */
export function sigmaScaleAt(table: SigmaScaleTable, v: SigmaScaleVar, leadH: number): number {
  const c = table.centresH, s = table.nodes[v];
  if (!c?.length || !s || s.length !== c.length || !Number.isFinite(leadH)) return 1;
  if (leadH <= c[0]) return s[0];
  for (let i = 1; i < c.length; i++) {
    if (leadH <= c[i]) { const f = (leadH - c[i - 1]) / (c[i] - c[i - 1]); return s[i - 1] + f * (s[i] - s[i - 1]); }
  }
  return s[s.length - 1];
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
