/**
 * Leave-one-station-out (LOSO) verification engine (paper Sect. 5, eq. 16). The
 * acceptance instrument for every later fusionV2 phase: scores any predictor
 * config against held-out stations by CRPS (17) and MAE, stratified by variable
 * × terrain class, with paired block-bootstrap confidence intervals on the skill
 * difference (Diebold–Mariano-style, blocks absorbing autocorrelation).
 *
 * Terrain class uses a station-network TPI *proxy* (z_s − mean z of stations in
 * a local radius), NOT DEM TPI: the Node `--experimental-strip-types` harness
 * has no PNG decoder for Terrarium tiles (Rule 5 — no new dep), and a
 * network-relative TPI is arguably the more verification-relevant quantity at
 * station scale. Documented deviation (Rule 8).
 *
 * Blocks: this single-session harness resamples over stations (each station a
 * block); a multi-session archive resamples over days. The block key is
 * pluggable so the same code serves both.
 */

import { crpsGaussian } from './crps.ts';
import { PREDICTORS, idwAtPoint, type PredictorName, type PredictCtx } from './predictors.ts';
import type { Fixture, FixtureStation, OiVariable } from './fixture.ts';

export type TerrainClass = 'flat' | 'hilly' | 'alpine';

/** Local planar km distance between two equirect points (DACH-local). */
const REF_LAT = 50.5;
const KM_LAT = 110.574;
const KM_LNG = 111.32 * Math.cos((REF_LAT * Math.PI) / 180);
function kmDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = (ax - bx) * 360 * KM_LNG;
  const dy = (ay - by) * 180 * KM_LAT;
  return Math.hypot(dx, dy);
}

/**
 * Classify each station by a network-relative TPI proxy: elevation minus the
 * mean elevation of stations within `radiusKm`. Negative ⇒ valley, positive ⇒
 * ridge/summit; combined with absolute elevation into flat/hilly/alpine.
 */
export function classifyTerrain(stations: FixtureStation[], radiusKm = 40): Map<string, TerrainClass> {
  const cls = new Map<string, TerrainClass>();
  for (const s of stations) {
    let sum = 0, n = 0;
    for (const o of stations) {
      if (o === s) continue;
      if (kmDist(s.x, s.y, o.x, o.y) <= radiusKm) { sum += o.elev; n++; }
    }
    const tpi = n ? s.elev - sum / n : 0;
    let c: TerrainClass;
    if (s.elev > 1000 || tpi > 300) c = 'alpine';
    else if (s.elev < 400 && Math.abs(tpi) < 80) c = 'flat';
    else c = 'hilly';
    cls.set(s.id, c);
  }
  return cls;
}

/** σ_b for a variable ≈ RMS of the background innovations y − H(x_b) (first-pass;
 *  Desroziers (9) refines it in Phase 3). Used only for OI's predictive σ. */
export function estimateSigmaB(fixture: Fixture, v: OiVariable): number {
  let ss = 0, n = 0;
  for (const s of fixture.stations) {
    const y = s.truth[v];
    if (y == null || y !== y) continue;
    const hxb = idwAtPoint(fixture.background, s.x, s.y, s.elev, v);
    if (hxb !== hxb) continue;
    const d = y - hxb; ss += d * d; n++;
  }
  return n ? Math.sqrt(ss / n) : 1;
}

export interface Score { variable: OiVariable; terrain: TerrainClass | 'all'; predictor: PredictorName; n: number; mae: number; crps: number }
export interface Comparison {
  variable: OiVariable; terrain: TerrainClass | 'all'; baseline: PredictorName;
  n: number; maeOi: number; maeBase: number; gain: number; ciLow: number; ciHigh: number; significant: boolean;
}
export interface CrossSource { variable: OiVariable; source: string; meanDev: number; n: number }
export interface LosoResult {
  scores: Score[];
  comparisons: Comparison[];      // OI vs each baseline
  crossSource: CrossSource[];
  driftFlags: number;             // stations where OI drifts same-sign from ALL sources
  meta: { stations: number; synthetic: boolean };
}

interface Rec { terrain: TerrainClass; abs: Partial<Record<PredictorName, number>>; crps: Partial<Record<PredictorName, number>> }

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 4294967296;
}

const VARIABLES: OiVariable[] = ['t2m', 'windSpeed', 'precip', 'cloud'];
const PREDS: PredictorName[] = ['oi', 'idw', 'icond2', 'background'];

export interface LosoOptions {
  variables?: OiVariable[];
  bootstrapN?: number;
  obsVarRatioByNetwork?: Record<string, number>;
  seed?: number;
}

export function runLoso(fixture: Fixture, opts: LosoOptions = {}): LosoResult {
  const variables = opts.variables ?? VARIABLES;
  const B = opts.bootstrapN ?? 1000;
  const ratios = opts.obsVarRatioByNetwork ?? { dwd: 0.1, tawes: 0.12, smn: 0.12 };
  const terrain = classifyTerrain(fixture.stations);
  const rnd = lcg(opts.seed ?? 7);

  const scores: Score[] = [];
  const comparisons: Comparison[] = [];

  for (const v of variables) {
    const sigmaB = estimateSigmaB(fixture, v);
    const recs: Rec[] = [];
    for (const held of fixture.stations) {
      const y = held.truth[v];
      if (y == null || y !== y) continue;
      const assimObs = fixture.stations.filter((s) => s !== held);
      const ctx: PredictCtx = {
        fixture, assimObs, target: { x: held.x, y: held.y, elev: held.elev },
        variable: v, sigmaB, obsVarRatioByNetwork: ratios,
      };
      const rec: Rec = { terrain: terrain.get(held.id)!, abs: {}, crps: {} };
      for (const name of PREDS) {
        const p = PREDICTORS[name](ctx);
        if (p.mu !== p.mu) continue;
        rec.abs[name] = Math.abs(p.mu - y);
        rec.crps[name] = crpsGaussian(p.mu, p.sigma, y);
      }
      recs.push(rec);
    }

    // Aggregate per terrain (+ 'all').
    const groups: Array<TerrainClass | 'all'> = ['all', 'flat', 'hilly', 'alpine'];
    for (const g of groups) {
      const sub = g === 'all' ? recs : recs.filter((r) => r.terrain === g);
      for (const name of PREDS) {
        const absVals = sub.map((r) => r.abs[name]).filter((x): x is number => x != null);
        const crpsVals = sub.map((r) => r.crps[name]).filter((x): x is number => x != null);
        if (!absVals.length) continue;
        scores.push({
          variable: v, terrain: g, predictor: name, n: absVals.length,
          mae: mean(absVals), crps: mean(crpsVals),
        });
      }
      // Paired block-bootstrap: OI vs each baseline on |error| difference.
      for (const base of ['idw', 'icond2', 'background'] as PredictorName[]) {
        const paired = sub.filter((r) => r.abs.oi != null && r.abs[base] != null);
        if (paired.length < 3) continue;
        const gain = mean(paired.map((r) => r.abs[base]! - r.abs.oi!));   // >0 ⇒ OI better
        const boot: number[] = [];
        for (let b = 0; b < B; b++) {
          let s = 0;
          for (let i = 0; i < paired.length; i++) {
            const r = paired[(rnd() * paired.length) | 0];
            s += r.abs[base]! - r.abs.oi!;
          }
          boot.push(s / paired.length);
        }
        boot.sort((a, z) => a - z);
        const ciLow = boot[Math.floor(0.025 * B)];
        const ciHigh = boot[Math.floor(0.975 * B)];
        comparisons.push({
          variable: v, terrain: g, baseline: base, n: paired.length,
          maeOi: mean(paired.map((r) => r.abs.oi!)), maeBase: mean(paired.map((r) => r.abs[base]!)),
          gain, ciLow, ciHigh, significant: ciLow > 0 || ciHigh < 0,
        });
      }
    }
  }

  const { crossSource, driftFlags } = crossSourceCheck(fixture, ratios);
  return {
    scores, comparisons, crossSource, driftFlags,
    meta: { stations: fixture.stations.length, synthetic: fixture.meta.synthetic === true },
  };
}

/**
 * Cross-source consistency: at every station, compare the OI analysis against
 * each untouched raw source (background per-source + native ICON-D2) for t2m,
 * and report the mean signed deviation OI − source. A station where OI deviates
 * from ALL sources with the same sign by > 3 K is flagged — the engine must
 * never silently drift away from every one of its inputs at once.
 */
export function crossSourceCheck(
  fixture: Fixture, ratios: Record<string, number>,
): { crossSource: CrossSource[]; driftFlags: number } {
  const v: OiVariable = 't2m';
  const sigmaB = estimateSigmaB(fixture, v);
  const sources = new Map<string, { sum: number; n: number }>();
  const sourceNames = new Set<string>(fixture.background.map((s) => s.source));
  sourceNames.add('icon_d2');
  let driftFlags = 0;

  for (const held of fixture.stations) {
    const assimObs = fixture.stations.filter((s) => s !== held);
    const oi = PREDICTORS.oi({
      fixture, assimObs, target: { x: held.x, y: held.y, elev: held.elev },
      variable: v, sigmaB, obsVarRatioByNetwork: ratios,
    }).mu;
    if (oi !== oi) continue;
    const devs: number[] = [];
    for (const name of sourceNames) {
      const samples = name === 'icon_d2'
        ? fixture.icond2
        : fixture.background.filter((s) => s.source === name);
      const est = idwAtPoint(samples, held.x, held.y, held.elev, v);
      if (est !== est) continue;
      const dev = oi - est;
      devs.push(dev);
      const acc = sources.get(name) ?? { sum: 0, n: 0 };
      acc.sum += dev; acc.n++; sources.set(name, acc);
    }
    if (devs.length && devs.every((d) => d > 3) || devs.length && devs.every((d) => d < -3)) driftFlags++;
  }

  const crossSource: CrossSource[] = [...sources.entries()].map(([source, a]) => ({
    variable: v, source, meanDev: a.n ? a.sum / a.n : NaN, n: a.n,
  }));
  return { crossSource, driftFlags };
}

function mean(a: number[]): number { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }

export interface SpreadSkill {
  variable: OiVariable; n: number;
  /** Pearson corr(predicted σ, |error|) — must be POSITIVE (Phase 5 gate). */
  corr: number;
  /** Fraction of |y−μ| within one predicted σ (target ≈ 0.683 if calibrated). */
  coverage68: number;
  /** Single inflation factor that would make std((y−μ)/σ)=1 (eq. 15 admits one). */
  inflation: number;
  /** 10-bin PIU rank histogram of Φ((y−μ)/σ) — flat ≈ calibrated. */
  rankHist: number[];
}

/**
 * Spread–skill + calibration for the OI σ (eq. 15) under LOSO. Positive
 * corr(σ, |error|) means the uncertainty field is informative (the Phase 5
 * gate); coverage68 / inflation / rankHist quantify calibration and give the
 * fitted inflation factor.
 */
export function spreadSkill(
  fixture: Fixture, variable: OiVariable = 't2m',
  ratios: Record<string, number> = { dwd: 0.1, tawes: 0.12, smn: 0.12 },
): SpreadSkill {
  const sigmaB = estimateSigmaB(fixture, variable);
  const sig: number[] = [], absErr: number[] = [], z: number[] = [];
  for (const held of fixture.stations) {
    const y = held.truth[variable];
    if (y == null || y !== y) continue;
    const p = PREDICTORS.oi({
      fixture, assimObs: fixture.stations.filter((s) => s !== held),
      target: { x: held.x, y: held.y, elev: held.elev },
      variable, sigmaB, obsVarRatioByNetwork: ratios,
    });
    if (p.mu !== p.mu || !(p.sigma > 0)) continue;
    sig.push(p.sigma); absErr.push(Math.abs(p.mu - y)); z.push((y - p.mu) / p.sigma);
  }
  const n = sig.length;
  // Pearson correlation of σ vs |error|.
  const ms = mean(sig), me = mean(absErr);
  let cov = 0, vs = 0, ve = 0;
  for (let i = 0; i < n; i++) { const a = sig[i] - ms, b = absErr[i] - me; cov += a * b; vs += a * a; ve += b * b; }
  const corr = vs > 0 && ve > 0 ? cov / Math.sqrt(vs * ve) : 0;
  const coverage68 = n ? z.filter((v) => Math.abs(v) < 1).length / n : NaN;
  const inflation = n ? Math.sqrt(mean(z.map((v) => v * v))) : NaN;
  // Normal-CDF (A&S) for the PIT rank histogram.
  const erf = (x: number) => { const s = x < 0 ? -1 : 1, ax = Math.abs(x), t = 1 / (1 + 0.3275911 * ax); return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax)); };
  const phi = (v: number) => 0.5 * (1 + erf(v * Math.SQRT1_2));
  const rankHist = new Array<number>(10).fill(0);
  for (const v of z) { const b = Math.min(9, Math.max(0, Math.floor(phi(v) * 10))); rankHist[b]++; }
  return { variable, n, corr, coverage68, inflation, rankHist };
}
