/**
 * predict.ts — from a situation and the learned tables to the distributions of buscosun Fusion's learning stage
 * (phase FL, `audit/fusion-lernphase.md` §3.7). The same function serves the scorer (FL-AP4, on case rows) and the
 * client path (FL-AP5, form K only): one definition of how the tables act.
 *
 * Input is already "designed": the caller (rowFeatures glue or the client adapter) provides Z, the predictors per
 * variable and the σ_div/σ_ens per variable; this module looks up the stratum entries and builds the `Dist` per
 * variable. A missing entry (too-short, absent class, `no-skill`) yields `null` for that variable — the caller falls
 * back and says so (flag `learnedAbsent`).
 *
 * fusionFit@3 (FL-AP8c): σ carries the stratum's CRPS scale (`VarianceEntry.scale`, V-FL-15); the wind speed is the
 * truncated normal of `tables.speed` behind the u/v Rice where the stratum has a written law (V-FL-22, the direction
 * stays with u/v); the hurdle needs the cube's own dry probability (`pDryCube`, column `logitWetCube`, V-FL-18) and
 * respects the hurdle's `no-skill` verdict.
 *
 * Phase FX: a table fitted with the station-climatology column (`design.mean.clima = 'station'`, C1) needs μ_c per
 * variable in the situation — without it the variable is `absent` and the caller falls back as it does today; a
 * caller that knows its height band (`band`) gets a written band entry of the speed law over the pooled one (A1). Phase FX-5
 * (E-FX-8): the column is per VARIABLE — `design.mean.climaVars` names the variables that carry it (absent = all); the others
 * are predicted from the `none` design and need no μ_c (`tables.ts climaColumnsFor`, one definition).
 */
import type { Dist } from '../../pointForecast/fusion/dist';
import { meanDesignK, meanDesignP, varianceDesign, occurrenceDesign, amountDesign } from './design';
import { predictMean } from './fitMean';
import { predictSigma } from './fitVariance';
import { predictWet, predictAmountLn } from './fitPrecip';
import { speedLaw, type SpeedEntry, type SpeedBand } from './fitSpeed';
import { stratumKey, classKey, binIndex, type FitVar, type Form } from './strata';
import { climaColumnsFor, type FusionTables } from './tables';

export interface PredictSituation {
  z: Float64Array;
  leadH: number;
  route: number;
  srcMask: number;
  srcCount: number | null;
  dhM: number;
  dTsfcK: number | null;
  /** Form K predictors (cube member after PAP 3–5) per variable, null when absent. */
  k: Partial<Record<FitVar, number | null>>;
  /** Form P predictors: per source (class order) the height-corrected value and the source's Δh, per variable. */
  p: Partial<Record<FitVar, Array<{ yA: number; dhM: number }> | null>>;
  /** σ_div and σ_ens per variable (unit of the variable; wind: component σ). */
  sigDiv: Partial<Record<FitVar, number | null>>;
  sigEns: Partial<Record<FitVar, number | null>>;
  /** Precipitation: share of wet sources (P) or σ_div/(P̄+0,1) (K). */
  wetShare: number;
  /** fusionFit@3: the engine's dry probability at the cube member (the hurdle's cube column). Without it: no learned hurdle. */
  pDryCube?: number | null;
  /** Phase FX (C1): the station climatology μ_c per variable at the valid time — needed by a table with `design.mean.clima = 'station'`. */
  muC?: Partial<Record<FitVar, number | null>>;
  /** Phase FX (A1): the site's height band — a written band entry of the speed law then wins over the pooled one. */
  band?: SpeedBand;
}

export interface Predicted {
  form: Form;
  mu: Partial<Record<FitVar, number>>;
  sigma: Partial<Record<FitVar, number>>;
  dist: { temperature: Dist | null; dewPoint: Dist | null; windSpeed: Dist | null; gust: Dist | null; clouds: Dist | null; precipitation: Dist | null };
  windDirectionDeg: number | null;
  /** fusionFit@3: the speed law applied to `dist.windSpeed` (null = the Rice of the u/v model). */
  speed: SpeedEntry | null;
  absent: string[];
}

function meanAndSigma(tables: FusionTables, form: Form, v: FitVar, bin: number, cls: string, x: Float64Array | null, xv: Float64Array): { mu: number; sigma: number } | null {
  if (!x) return null;
  const key = stratumKey(form, v, bin, cls);
  const m = tables.mean[key], s = tables.variance[key];
  if (!m || m.status !== 'written' || m.beta.length !== x.length) return null;
  if (!s || s.status !== 'written') return null;
  return { mu: predictMean(x, m.beta), sigma: predictSigma(xv, s) };
}

/** The speed law of a stratum (written entries only): with a `band`, a written band entry `…|<band>` wins over the pooled one. */
export function speedEntryOf(tables: FusionTables, form: Form, leadH: number, cls: string, band?: SpeedBand): SpeedEntry | null {
  const key = `${form}|ws|${binIndex(leadH)}|${cls}`;
  const eb = band ? tables.speed?.[`${key}|${band}`] : undefined;
  if (eb && eb.status === 'written') return eb;
  const e = tables.speed?.[key];
  return e && e.status === 'written' ? e : null;
}

/**
 * The learned hurdle of a stratum at a situation and the cube's dry probability — `null` without a written (skilled)
 * occurrence and amount entry, without a cube probability or without a precipitation predictor. Shared by `predict`
 * and by the client, which knows `pDryCube` only after the engine's own fusion of the hour.
 */
export function predictPrecip(tables: FusionTables, form: Form, s: PredictSituation, pDryCube: number | null | undefined): { dist: Extract<Dist, { kind: 'hurdleLogNormal' }>; mean: number } | null {
  const bin = binIndex(s.leadH);
  const cls = classKey(form, s.srcMask, s.route);
  const key = stratumKey(form, 'precip', bin, cls);
  const occ = tables.occurrence[key], amt = tables.amount[key];
  const pMeanLn = form === 'K' ? s.k.precip : (s.p.precip && s.p.precip.length ? s.p.precip.reduce((a, x) => a + x.yA, 0) / s.p.precip.length : null);
  if (!(occ?.status === 'written' && amt?.status === 'written' && pMeanLn != null && pDryCube != null && Number.isFinite(pDryCube))) return null;
  const pMean = Math.expm1(Math.max(0, pMeanLn));
  const xo = occurrenceDesign(s.z, pMean, s.wetShare, s.sigDiv.precip ?? null, pDryCube);
  if (occ.beta.length !== xo.length) return null;
  const pWet = predictWet(xo, occ.beta);
  const lnAmt = predictAmountLn(amountDesign(s.z, pMean, s.sigDiv.precip ?? null), amt.beta);
  return { dist: { kind: 'hurdleLogNormal', pDry: 1 - pWet, mu: lnAmt, sigma: amt.sigma }, mean: pWet * Math.exp(lnAmt + 0.5 * amt.sigma * amt.sigma) };
}

export function predict(tables: FusionTables, form: Form, s: PredictSituation): Predicted {
  const bin = binIndex(s.leadH);
  const cls = classKey(form, s.srcMask, s.route);
  const absent: string[] = [];
  const mu: Predicted['mu'] = {}, sigma: Predicted['sigma'] = {};
  // phase FX (C1): a station table needs μ_c per variable — without a finite μ_c the variable is absent (the caller falls back);
  // phase FX-5 (E-FX-8): only for the variables the table lists (`climaColumnsFor`), the others take the `none` design
  const designOf = (v: FitVar): Float64Array | null => {
    const clima = climaColumnsFor(tables.design.mean, v);
    let muC: number | null = null;
    if (clima === 'station') { const m = s.muC?.[v]; if (m == null || !Number.isFinite(m)) return null; muC = m; }
    if (form === 'K') { const y = s.k[v]; return y == null ? null : meanDesignK(s.z, y, s.dhM, s.dTsfcK, s.srcCount, clima, muC); }
    const src = s.p[v]; return src && src.length ? meanDesignP(s.z, src, s.dTsfcK, clima, muC) : null;
  };
  const scalar = (v: FitVar): { mu: number; sigma: number } | null => {
    const r = meanAndSigma(tables, form, v, bin, cls, designOf(v), varianceDesign(s.z, s.sigDiv[v] ?? null, s.sigEns[v] ?? null));
    if (!r) { absent.push(v); return null; }
    mu[v] = r.mu; sigma[v] = r.sigma; return r;
  };
  const t = scalar('t'), td = scalar('td'), u = scalar('u'), vv = scalar('v'), gust = scalar('gust'), clct = scalar('clct');
  // precipitation: hurdle from occurrence + amount on the same stratum; the mean design carries ln1p of the predictor
  let precipitation: Dist | null = null;
  {
    const pr = predictPrecip(tables, form, s, s.pDryCube);
    if (pr) { precipitation = pr.dist; mu.precip = pr.mean; } else absent.push('precip');
  }
  let windSpeed: Dist | null = null, windDirectionDeg: number | null = null, speed: SpeedEntry | null = null, riceNu = 0;
  if (u && vv) {
    const nu = Math.hypot(u.mu, vv.mu);
    const sig = Math.sqrt(0.5 * (u.sigma * u.sigma + vv.sigma * vv.sigma));
    windSpeed = { kind: 'rice', nu, sigma: sig }; riceNu = nu;
    windDirectionDeg = nu / sig >= 1 ? ((Math.atan2(-u.mu, -vv.mu) * 180) / Math.PI + 360) % 360 : null;
    // fusionFit@3 (V-FL-22): the speed law of the stratum replaces the Rice for the SPEED; the direction above stays.
    speed = speedEntryOf(tables, form, s.leadH, cls, s.band);
    if (speed) windSpeed = speedLaw({ nu, sigma: sig }, speed);
  }
  return {
    form, mu, sigma,
    dist: {
      temperature: t ? { kind: 'normal', mu: t.mu, sigma: t.sigma } : null,
      dewPoint: td ? { kind: 'normal', mu: t ? Math.min(td.mu, t.mu) : td.mu, sigma: td.sigma } : null,
      windSpeed,
      // the gust floor stays the u/v Rice's ν (as before fusionFit@3), whatever family the speed takes
      gust: gust ? { kind: 'censoredNormal', mu: Math.max(gust.mu, riceNu), sigma: gust.sigma, lo: 0, hi: 90 } : null,
      clouds: clct ? { kind: 'censoredNormal', mu: clct.mu, sigma: clct.sigma, lo: 0, hi: 100 } : null,
      precipitation,
    },
    windDirectionDeg, speed, absent,
  };
}
