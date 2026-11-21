/**
 * Phase GW — pure core of "Wetter am Gletscher": the weather series of one answer of buscosun Fusion and the row of one glacier
 * (daily values for 14 days, hourly values for the first 48 h). No network, no files, no Fusion call: `melt.mjs` hands in the
 * answer it already has and the band temperatures it already computes (`tempAt`, lapse anchored on the freezing level).
 *
 * Rules (each one tested in verify:glacier-weather):
 *  - the solid share of precipitation follows the phase rule of the run: `temperature` = the rule of the melt core (`MELT.fsWarm`/`fsCold`)
 *    with the temperature at the elevation; `psnow` (phase GS) = the `pSnow` of the answer at the median elevation, moved to tongue and top
 *    by the difference the engine's own phase function gives between the temperature there and at the median elevation;
 *  - a sum is an expected value; its spread (phase GS) is the p10/p90 of the sums of K scenarios, never a sum of hourly quantiles;
 *    the p10/p90 of the temperature and of the gust are single-hour spreads;
 *  - a glacier on a neighbour's forcing gets the temperature at its own elevations and nothing else (`omit`);
 *  - an input that is missing makes the glacier a skip with a reason — a row never carries a filled-in value.
 */
import { MELT, rng, gauss, quantile } from './meltcore.mjs';
import { quantileOf, Phi } from '../../../src/pointForecast/fusion/dist.ts';
import { wetBulbC, snowProbabilityFromWetBulb } from '../../../src/pointForecast/fusion/meteo.ts';
import { PHASE_RH_BLEND, PHASE_RH_SATURATED } from '../../../src/pointForecast/fusion/priors.ts';
import {
  GLACIER_WEATHER_DAYS, GLACIER_WEATHER_HOURS, GLACIER_WEATHER_MIN_SHARE, GLACIER_WEATHER_DIR_MIN_HOURS, GLACIER_WEATHER_SNOWLINE_MIN,
  GLACIER_WEATHER_OMIT_NEIGHBOUR, GLACIER_WEATHER_NOTE, GLACIER_WEATHER_SNOWLINE_HOURS, GLACIER_WEATHER_PHASE_RULES, GLACIER_WEATHER_SPREAD_K,
  GLACIER_WEATHER_SPREAD_RHO, GLACIER_WEATHER_PHASE_KEEP_DAYS, GLACIER_WEATHER_PHASE_LIMIT, GLACIER_WEATHER_PHASE_MIN_DAYS, GLACIER_WEATHER_RUN_RE,
} from '../../../src/glacier/glacierWeatherContract.ts';

const H = 3_600_000;
const r1 = (x) => Math.round(x * 10) / 10 + 0;
const r2 = (x) => Math.round(x * 100) / 100 + 0;
const kmh = (ms) => Math.round(ms * 3.6);
const fin = Number.isFinite;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Solid share (0…1) of precipitation at temperature `T` — the rule of `simulate` in the melt core. */
export const solidFraction = (T) => Math.min(1, Math.max(0, (MELT.fsWarm - T) / (MELT.fsWarm - MELT.fsCold)));

/** Phase GS — the rule a run is built with unless the switch says otherwise (`--phase=…` of `melt.mjs`, or `GLACIER_WEATHER_PHASE`). */
export const WEATHER_PHASE_DEFAULT = 'temperature';
/** The rule the switch names; an unknown word is an error with a reason (the run then writes no weather), never a silent default. */
export function weatherPhaseOf(value) {
  if (value == null || value === '') return WEATHER_PHASE_DEFAULT;
  if (!GLACIER_WEATHER_PHASE_RULES.includes(value)) throw new Error(`unbekannte Phasenregel „${value}" (erlaubt: ${GLACIER_WEATHER_PHASE_RULES.join(', ')})`);
  return value;
}

/**
 * Hourly weather series of one Fusion answer, aligned to `hours` steps from `t0Ms` (NaN = the answer has no value there):
 * wind and gust (m/s), direction (degrees), p10/p90 of the temperature at the reference elevation, snowfall line (m); phase GS:
 * `pSnow` (0…1), median of the relative humidity (%), p10/p90 of the gust (m/s) and the distribution of the precipitation (`null` where
 * the answer has none). Precipitation, cloud cover and the temperature itself are the series of the melt forcing (`forcingFromForecast`).
 */
export function weatherSeriesOf(fc, { t0Ms, hours }) {
  const mk = () => new Float64Array(hours).fill(NaN);
  const w = mk(), g = mk(), d = mk(), t10 = mk(), t90 = mk(), sl = mk(), ps = mk(), rh = mk(), g10 = mk(), g90 = mk();
  const pDist = new Array(hours).fill(null);
  for (const s of fc?.cube?.v2?.axis?.steps ?? []) {
    const i = Math.round((s.validAtMs - t0Ms) / H);
    if (i < 0 || i >= hours) continue;
    const x = s.vars ?? {};
    w[i] = x.wind?.mean ?? NaN; g[i] = x.gust?.mean ?? NaN; d[i] = x.windDir?.mean ?? NaN;
    t10[i] = x.t2m?.p10 ?? NaN; t90[i] = x.t2m?.p90 ?? NaN; sl[i] = x.snowline?.mean ?? NaN;
    ps[i] = x.pSnow?.mean ?? NaN; rh[i] = x.rh?.p50 ?? NaN; g10[i] = x.gust?.p10 ?? NaN; g90[i] = x.gust?.p90 ?? NaN; pDist[i] = x.precip?.dist ?? null;
  }
  return { w, g, d, t10, t90, sl, ps, rh, g10, g90, pDist };
}

/** Prevailing direction (degrees, blowing from) of the hours `from`…`to`: mean of the unit vectors weighted with the wind speed; `null` below `minHours` hours with a direction. */
export function prevailingDir(dir, speed, from, to, minHours = GLACIER_WEATHER_DIR_MIN_HOURS) {
  let sx = 0, sy = 0, n = 0;
  for (let h = from; h < to; h++) {
    if (!fin(dir[h])) continue;
    const wgt = fin(speed[h]) ? Math.max(speed[h], 0.1) : 0.1, a = (dir[h] * Math.PI) / 180;
    sx += wgt * Math.sin(a); sy += wgt * Math.cos(a); n++;
  }
  if (n < minHours || (sx === 0 && sy === 0)) return null;
  return ((Math.round((Math.atan2(sx, sy) * 180) / Math.PI) % 360) + 360) % 360;
}

// --- Phase GS: the solid share from pSnow -------------------------------------------------------------------------------------------

const NODES = 21;
const Z = Array.from({ length: NODES }, (_, i) => quantileOf({ kind: 'normal', mu: 0, sigma: 1 }, (i + 0.5) / NODES));
/** Humidity the engine asks the phase question with: the median pulled towards saturation (the constants and the blend of `fuse.ts`, read, not copied). */
const rhPhaseOf = (rhPct) => (fin(rhPct) ? (1 - PHASE_RH_BLEND) * rhPct + PHASE_RH_BLEND * PHASE_RH_SATURATED : PHASE_RH_SATURATED);
/**
 * P(snow) of a normal temperature (mean, sigma) at a relative humidity (%): the engine's phase function (`snowProbability` of `meteo.ts`:
 * the wet-bulb logistic averaged over 21 quantile nodes) written for a mean that can be moved to another elevation.
 */
export function phaseProbability(tMean, sigma, rhPct) {
  const rh = rhPhaseOf(rhPct);
  if (!(sigma > 0)) return snowProbabilityFromWetBulb(wetBulbC(tMean, rh));
  let acc = 0;
  for (let i = 0; i < NODES; i++) acc += snowProbabilityFromWetBulb(wetBulbC(tMean + sigma * Z[i], rh));
  return acc / NODES;
}

/** `pSnow` between two values of the answer: linear inside a gap of at most `maxGap` hours, held at the ends; a longer gap stays NaN (the hour then takes the temperature rule). */
export function fillPhase(ps, maxGap = 6) {
  const out = Float64Array.from(ps), n = out.length;
  for (let i = 0; i < n;) {
    if (fin(out[i])) { i++; continue; }
    let j = i; while (j < n && !fin(out[j])) j++;
    const a = i > 0 ? out[i - 1] : NaN, b = j < n ? out[j] : NaN;
    if (j - i <= maxGap) for (let k = i; k < j; k++) out[k] = fin(a) && fin(b) ? a + ((b - a) * (k - i + 1)) / (j - i + 1) : fin(a) ? a : b;
    i = j;
  }
  return out;
}

/**
 * Solid share (0…1) per hour at the three elevations.
 *   temperature  `solidFraction` of the temperature at the elevation.
 *   psnow        median elevation: the `pSnow` of the answer; tongue and top: that value plus the difference of the engine's phase function
 *                between the temperature there and at the median elevation (same sigma, same humidity — both `set` for the other elevation).
 *                An hour without `pSnow` (after `fillPhase`) takes the temperature rule and is counted in `fallback`.
 * `c` = pSnow − phase function at the median elevation: the offset the scenarios use so that their mean share is the expected one.
 * The other elevations are computed only where it precipitates (`p`), elsewhere they repeat the median value (it multiplies a zero).
 */
export function phaseShares({ rule, tz, sg, rh, ps, p }) {
  const hours = tz[1].length;
  const share = tz.map(() => new Float64Array(hours)), c = new Float64Array(hours).fill(NaN);
  const psf = rule === 'psnow' ? (ps ? fillPhase(ps) : new Float64Array(hours).fill(NaN)) : null;
  let fallback = 0;
  for (let h = 0; h < hours; h++) {
    const pm = psf ? psf[h] : NaN;
    if (!fin(pm)) { for (let lv = 0; lv < 3; lv++) share[lv][h] = solidFraction(tz[lv][h]); if (psf) fallback++; continue; }
    const s = sg?.[h] ?? 0, r0 = phaseProbability(tz[1][h], s, rh?.[h]);
    c[h] = pm - r0;
    share[1][h] = clamp01(pm);
    const wet = !p || p[h] > 0;
    for (const lv of [0, 2]) share[lv][h] = wet ? clamp01(pm + phaseProbability(tz[lv][h], s, rh?.[h]) - r0) : share[1][h];
  }
  return { share, c, fallback };
}

/**
 * Phase GS — spread of the daily sums: K scenarios, each ONE path of hourly precipitation and ONE path of the temperature error, both with
 * an hourly correlation `rho` (`set`) and independent of each other (`set`). Precipitation of an hour = the quantile of the answer's
 * distribution at the scenario's level; an hour without a distribution (between two model steps late in the run) takes the linear mix of
 * the neighbours' quantiles, as the answer itself does there. New snow = that precipitation × the share of the scenario's temperature.
 * Returns `{ pq, snq }` — [p10, p90] per day (mm, 0.1) of the scenario SUMS.
 */
export function sumSpreads({ p, pDist, tz, sg, rh, rule, c, seed = 1, k = GLACIER_WEATHER_SPREAD_K, rho = GLACIER_WEATHER_SPREAD_RHO, days = GLACIER_WEATHER_DAYS }) {
  const hours = days * 24;
  const prev = new Int32Array(hours).fill(-1), next = new Int32Array(hours).fill(-1);
  for (let h = 0, last = -1; h < hours; h++) { if (pDist?.[h]) last = h; prev[h] = last; }
  for (let h = hours - 1, last = -1; h >= 0; h--) { if (pDist?.[h]) last = h; next[h] = last; }
  const amount = (h, u) => {
    const a = prev[h], b = next[h];
    if (a === h) return quantileOf(pDist[h], u);
    if (a < 0 || b < 0 || b - a > 6) return Math.max(0, p[h]);   // no distribution near: the expected value itself (no spread from this hour)
    const wgt = (h - a) / (b - a);
    return (1 - wgt) * quantileOf(pDist[a], u) + wgt * quantileOf(pDist[b], u);
  };
  const shareAt = (lv, h, zT) => {
    const T = tz[lv][h] + (sg?.[h] ?? 0) * zT;
    return rule === 'psnow' && fin(c?.[h]) ? clamp01(snowProbabilityFromWetBulb(wetBulbC(T, rhPhaseOf(rh?.[h]))) + c[h]) : solidFraction(T);
  };
  const sumP = Array.from({ length: days }, () => new Float64Array(k));
  const sumS = [0, 1, 2].map(() => Array.from({ length: days }, () => new Float64Array(k)));
  const r = rng(((seed ^ 0x5bd1e995) >>> 0) || 1), a = Math.sqrt(1 - rho * rho);
  for (let s = 0; s < k; s++) {
    let zP = gauss(r), zT = gauss(r);
    for (let h = 0; h < hours; h++) {
      zP = rho * zP + a * gauss(r); zT = rho * zT + a * gauss(r);
      if (!fin(p[h])) continue;
      const v = amount(h, Math.min(1 - 1e-9, Math.max(1e-9, Phi(zP))));
      if (!(v > 0)) continue;
      const d = (h / 24) | 0;
      sumP[d][s] += v;
      for (let lv = 0; lv < 3; lv++) sumS[lv][d][s] += v * shareAt(lv, h, zT);
    }
  }
  const q = (x) => { const srt = Float64Array.from(x).sort(); return [r1(quantile(srt, 0.1)), r1(quantile(srt, 0.9))]; };
  return { pq: sumP.map(q), snq: sumS.map((lv) => lv.map(q)) };
}

/**
 * Row and hourly row of one glacier.
 *   z     [tongue, median, top] elevations (m)
 *   tz    the temperature series (°C, hourly from the run hour) at these three elevations
 *   from  `own` or the id of the neighbour the forcing comes from
 *   p, n  precipitation (mm/h) and cloud fraction (0…1) of the forcing; `wx` = `weatherSeriesOf` of the same answer
 *   sg    sigma of the temperature at the median elevation (K, hourly); `phase` = the phase rule of the run; `seed` = seed of the scenarios
 * Returns `{ row, hourly, cmp }` or `{ skip: reason }`; `cmp` = the summed new snow per elevation under both phase rules (own forcing only).
 */
export function weatherOfGlacier({ id, z, tz, from = 'own', p, n, wx, sg = null, phase = WEATHER_PHASE_DEFAULT, seed = 1, days = GLACIER_WEATHER_DAYS, hoursOut = GLACIER_WEATHER_HOURS }) {
  const hours = days * 24;
  if (!(z.every(fin) && z[0] <= z[1] + 25 && z[1] <= z[2] + 25)) return { skip: 'elevations' };
  for (const t of tz) { if (t.length < hours) return { skip: 'temperature-gaps' }; for (let h = 0; h < hours; h++) if (!fin(t[h])) return { skip: 'temperature-gaps' }; }
  const dayOf = (fn) => Array.from({ length: days }, (_, d) => fn(24 * d, 24 * d + 24, d));
  const tn = tz.map((t) => dayOf((a, b) => { let m = Infinity; for (let h = a; h < b; h++) m = Math.min(m, t[h]); return r1(m); }));
  const tx = tz.map((t) => dayOf((a, b) => { let m = -Infinity; for (let h = a; h < b; h++) m = Math.max(m, t[h]); return r1(m); }));
  const hourly = { t: tz.map((t) => Array.from({ length: hoursOut }, (_, h) => r1(t[h]))) };
  const row = { id, z: z.map((v) => Math.round(v)), f: from, tn, tx };
  if (from !== 'own') { row.omit = GLACIER_WEATHER_OMIT_NEIGHBOUR; return { row, hourly }; }

  // own forcing: every day needs most of its hours, the hourly window all of them — otherwise the glacier is skipped, never filled
  const need = Math.ceil(GLACIER_WEATHER_MIN_SHARE * 24);
  const series = { wind: wx?.w, gust: wx?.g, precip: p, cloud: n };
  for (const [name, a] of Object.entries(series)) {
    if (!a || a.length < hours) return { skip: `few-hours:${name}` };
    for (let h = 0; h < hoursOut; h++) if (!fin(a[h])) return { skip: `few-hours:${name}` };
    for (let d = 0; d < days; d++) { let ok = 0; for (let h = 24 * d; h < 24 * d + 24; h++) if (fin(a[h])) ok++; if (ok < need) return { skip: `few-hours:${name}` }; }
  }
  const mean = (a, from, to) => { let s = 0, k = 0; for (let h = from; h < to; h++) if (fin(a[h])) { s += a[h]; k++; } return s / k; };
  // p10 / p90: the lowest hourly p10 and the highest hourly p90 of the day (single-hour spreads, never a spread of a sum)
  const tq = [];
  for (let d = 0; d < days; d++) {
    let lo = Infinity, hi = -Infinity;
    for (let h = 24 * d; h < 24 * d + 24; h++) { if (fin(wx.t10?.[h])) lo = Math.min(lo, wx.t10[h]); if (fin(wx.t90?.[h])) hi = Math.max(hi, wx.t90[h]); }
    if (!fin(lo) || !fin(hi)) return { skip: 'no-quantiles' };
    tq.push([r1(Math.min(lo, tn[1][d])), r1(Math.max(hi, tx[1][d]))]);
  }
  // phase GS: the solid share under both rules (the run writes one, the comparison needs both)
  const tzH = tz.map((t) => (t.length === hours ? t : t.subarray(0, hours)));
  const shares = { temperature: phaseShares({ rule: 'temperature', tz: tzH }), psnow: phaseShares({ rule: 'psnow', tz: tzH, sg, rh: wx.rh, ps: wx.ps, p }) };
  if (phase === 'psnow' && hours - shares.psnow.fallback < GLACIER_WEATHER_MIN_SHARE * hours) return { skip: 'few-hours:psnow' };
  const act = shares[phase];
  const snowSum = (sh, lv, a, b) => { let s = 0; for (let h = a; h < b; h++) if (fin(p[h])) s += Math.max(0, p[h]) * sh.share[lv][h]; return s; };
  // strongest gust of the day and the p10/p90 of THAT hour (a single-hour spread)
  const gx = [], gq = [];
  for (let d = 0; d < days; d++) {
    let m = 0, at = -1;
    for (let h = 24 * d; h < 24 * d + 24; h++) if (fin(wx.g[h]) && (at < 0 || wx.g[h] > m)) { m = Math.max(m, wx.g[h]); if (wx.g[h] >= m) at = h; }
    if (at < 0 || !fin(wx.g10?.[at]) || !fin(wx.g90?.[at])) return { skip: 'few-hours:gust-spread' };
    gx.push(kmh(m)); gq.push([Math.min(kmh(Math.max(0, wx.g10[at])), kmh(m)), Math.max(kmh(wx.g90[at]), kmh(m))]);
  }
  row.tq = tq;
  row.w = dayOf((a, b) => kmh(mean(wx.w, a, b)));
  row.gx = gx;
  row.wd = dayOf((a, b) => prevailingDir(wx.d, wx.w, a, b));
  row.p = dayOf((a, b) => { let s = 0; for (let h = a; h < b; h++) if (fin(p[h])) s += Math.max(0, p[h]); return r1(s); });
  row.sn = [0, 1, 2].map((lv) => dayOf((a, b) => r1(snowSum(act, lv, a, b))));
  row.c = dayOf((a, b) => Math.round(100 * Math.min(1, Math.max(0, mean(n, a, b)))));
  row.sl = dayOf((a, b) => { let s = 0, k = 0; for (let h = a; h < b; h++) if (fin(wx.sl?.[h])) { s += wx.sl[h]; k++; } return k >= GLACIER_WEATHER_SNOWLINE_MIN ? Math.round(s / k / 10) * 10 : null; });
  const sp = sumSpreads({ p, pDist: wx.pDist, tz: tzH, sg, rh: wx.rh, rule: phase, c: act.c, seed, days });
  row.pq = sp.pq; row.snq = sp.snq; row.gq = gq;
  const first = (fn) => Array.from({ length: hoursOut }, (_, h) => fn(h));
  hourly.w = first((h) => kmh(wx.w[h]));
  hourly.g = first((h) => kmh(wx.g[h]));
  hourly.d = first((h) => (fin(wx.d[h]) ? ((Math.round(wx.d[h]) % 360) + 360) % 360 : null));
  hourly.p = first((h) => r1(Math.max(0, p[h])));
  hourly.s = first((h) => Math.round(100 * act.share[1][h]));
  hourly.c = first((h) => Math.round(100 * Math.min(1, Math.max(0, n[h]))));
  // phase GS: the snowfall line of the answer per hour (never filled), new snow per hour at the three elevations
  hourly.sl = Array.from({ length: GLACIER_WEATHER_SNOWLINE_HOURS }, (_, h) => { const v = wx.sl?.[h]; return fin(v) && v >= 0 && v <= 7000 ? Math.round(v / 10) * 10 : null; });
  hourly.sn = [0, 1, 2].map((lv) => first((h) => r2(Math.max(0, p[h]) * act.share[lv][h])));
  // comparison of the two rules: summed new snow per elevation, wet glacier-days and how many of them move at the median elevation
  const cmp = { temperature: [0, 1, 2].map((lv) => snowSum(shares.temperature, lv, 0, hours)), psnow: [0, 1, 2].map((lv) => snowSum(shares.psnow, lv, 0, hours)), wet: 0, moved: 0, max: 0 };
  for (let d = 0; d < days; d++) {
    let pd = 0; for (let h = 24 * d; h < 24 * d + 24; h++) if (fin(p[h])) pd += Math.max(0, p[h]);
    if (pd < 1) continue;
    const move = Math.abs(snowSum(shares.psnow, 1, 24 * d, 24 * d + 24) - snowSum(shares.temperature, 1, 24 * d, 24 * d + 24));
    cmp.wet++; if (move > 1) cmp.moved++; cmp.max = Math.max(cmp.max, move);
  }
  return { row, hourly, cmp };
}

/** Phase GS — one entry of the comparison file from the `cmp` blocks of a run. */
export function phaseRunOf(run, rule, cmps) {
  const sum = (k) => [0, 1, 2].map((lv) => r1(cmps.reduce((s, c) => s + c[k][lv], 0)));
  return { run, rule, n: cmps.length, mm: { temperature: sum('temperature'), psnow: sum('psnow') }, wet: cmps.reduce((s, c) => s + c.wet, 0), moved: cmps.reduce((s, c) => s + c.moved, 0), max: r1(cmps.reduce((m, c) => Math.max(m, c.max), 0)) };
}
/** Phase GS — the comparison file with one more run: an entry of the same run is replaced, entries older than the keep time go. */
export function phaseDocWith(prev, entry, nowMs) {
  const ms = (run) => Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10));
  const runs = (prev?.kind === 'glacier/weather-phase' && Array.isArray(prev.runs) ? prev.runs : [])
    .filter((r) => GLACIER_WEATHER_RUN_RE.test(r?.run ?? '') && r.run !== entry.run && nowMs - ms(r.run) <= GLACIER_WEATHER_PHASE_KEEP_DAYS * 24 * H);
  return { schema: 1, kind: 'glacier/weather-phase', limit: GLACIER_WEATHER_PHASE_LIMIT, minDays: GLACIER_WEATHER_PHASE_MIN_DAYS, runs: [...runs, entry].sort((a, b) => (a.run < b.run ? -1 : 1)) };
}

/** Head shared by the daily document and the hourly chunks. */
export const weatherHead = ({ run, runAt, engine }) => ({ schema: 1, run, runAt, origin: 'model', engine, verified: { highElevation: false, note: GLACIER_WEATHER_NOTE } });
/** The phase rule a document names (`rules.phase`): the ramp of the melt core and which rule the run used. */
export const WEATHER_PHASE_RULE = Object.freeze({ warm: MELT.fsWarm, cold: MELT.fsCold, origin: 'set' });
/** The spread rule a document names (`rules.spread`). */
export const WEATHER_SPREAD_RULE = Object.freeze({ sums: 'scenarios', k: GLACIER_WEATHER_SPREAD_K, rho: GLACIER_WEATHER_SPREAD_RHO, gust: 'strongest-hour', origin: 'set' });
