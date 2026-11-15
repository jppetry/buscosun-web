/**
 * Phase GW — pure core of "Wetter am Gletscher": the weather series of one answer of buscosun Fusion and the row of one glacier
 * (daily values for 14 days, hourly values for the first 48 h). No network, no files, no Fusion call: `melt.mjs` hands in the
 * answer it already has and the band temperatures it already computes (`tempAt`, lapse anchored on the freezing level).
 *
 * Rules (each one tested in verify:glacier-weather):
 *  - the solid share of precipitation is the rule of the melt core (`MELT.fsWarm`/`fsCold`) with the temperature at the elevation;
 *  - a sum is an expected value (no spread); the p10/p90 of the temperature are single-hour spreads at the median elevation;
 *  - a glacier on a neighbour's forcing gets the temperature at its own elevations and nothing else (`omit`);
 *  - an input that is missing makes the glacier a skip with a reason — a row never carries a filled-in value.
 */
import { MELT } from './meltcore.mjs';
import {
  GLACIER_WEATHER_DAYS, GLACIER_WEATHER_HOURS, GLACIER_WEATHER_MIN_SHARE, GLACIER_WEATHER_DIR_MIN_HOURS, GLACIER_WEATHER_SNOWLINE_MIN,
  GLACIER_WEATHER_OMIT_NEIGHBOUR, GLACIER_WEATHER_NOTE,
} from '../../../src/glacier/glacierWeatherContract.ts';

const H = 3_600_000;
const r1 = (x) => Math.round(x * 10) / 10 + 0;
const kmh = (ms) => Math.round(ms * 3.6);
const fin = Number.isFinite;

/** Solid share (0…1) of precipitation at temperature `T` — the rule of `simulate` in the melt core. */
export const solidFraction = (T) => Math.min(1, Math.max(0, (MELT.fsWarm - T) / (MELT.fsWarm - MELT.fsCold)));

/**
 * Hourly weather series of one Fusion answer, aligned to `hours` steps from `t0Ms` (NaN = the answer has no value there):
 * wind and gust (m/s), direction (degrees), p10/p90 of the temperature at the reference elevation, snowfall line (m).
 * Precipitation, cloud cover and the temperature itself are the series of the melt forcing (`forcingFromForecast`).
 */
export function weatherSeriesOf(fc, { t0Ms, hours }) {
  const mk = () => new Float64Array(hours).fill(NaN);
  const w = mk(), g = mk(), d = mk(), t10 = mk(), t90 = mk(), sl = mk();
  for (const s of fc?.cube?.v2?.axis?.steps ?? []) {
    const i = Math.round((s.validAtMs - t0Ms) / H);
    if (i < 0 || i >= hours) continue;
    const x = s.vars ?? {};
    w[i] = x.wind?.mean ?? NaN; g[i] = x.gust?.mean ?? NaN; d[i] = x.windDir?.mean ?? NaN;
    t10[i] = x.t2m?.p10 ?? NaN; t90[i] = x.t2m?.p90 ?? NaN; sl[i] = x.snowline?.mean ?? NaN;
  }
  return { w, g, d, t10, t90, sl };
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

/**
 * Row and hourly row of one glacier.
 *   z     [tongue, median, top] elevations (m)
 *   tz    the temperature series (°C, hourly from the run hour) at these three elevations
 *   from  `own` or the id of the neighbour the forcing comes from
 *   p, n  precipitation (mm/h) and cloud fraction (0…1) of the forcing; `wx` = `weatherSeriesOf` of the same answer
 * Returns `{ row, hourly }` or `{ skip: reason }`.
 */
export function weatherOfGlacier({ id, z, tz, from = 'own', p, n, wx, days = GLACIER_WEATHER_DAYS, hoursOut = GLACIER_WEATHER_HOURS }) {
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
  const tMed = tz[1];
  // p10 / p90: the lowest hourly p10 and the highest hourly p90 of the day (single-hour spreads, never a spread of a sum)
  const tq = [];
  for (let d = 0; d < days; d++) {
    let lo = Infinity, hi = -Infinity;
    for (let h = 24 * d; h < 24 * d + 24; h++) { if (fin(wx.t10?.[h])) lo = Math.min(lo, wx.t10[h]); if (fin(wx.t90?.[h])) hi = Math.max(hi, wx.t90[h]); }
    if (!fin(lo) || !fin(hi)) return { skip: 'no-quantiles' };
    tq.push([r1(Math.min(lo, tn[1][d])), r1(Math.max(hi, tx[1][d]))]);
  }
  row.tq = tq;
  row.w = dayOf((a, b) => kmh(mean(wx.w, a, b)));
  row.gx = dayOf((a, b) => { let m = 0; for (let h = a; h < b; h++) if (fin(wx.g[h])) m = Math.max(m, wx.g[h]); return kmh(m); });
  row.wd = dayOf((a, b) => prevailingDir(wx.d, wx.w, a, b));
  row.p = dayOf((a, b) => { let s = 0; for (let h = a; h < b; h++) if (fin(p[h])) s += Math.max(0, p[h]); return r1(s); });
  row.sn = tz.map((t) => dayOf((a, b) => { let s = 0; for (let h = a; h < b; h++) if (fin(p[h])) s += Math.max(0, p[h]) * solidFraction(t[h]); return r1(s); }));
  row.c = dayOf((a, b) => Math.round(100 * Math.min(1, Math.max(0, mean(n, a, b)))));
  row.sl = dayOf((a, b) => { let s = 0, k = 0; for (let h = a; h < b; h++) if (fin(wx.sl?.[h])) { s += wx.sl[h]; k++; } return k >= GLACIER_WEATHER_SNOWLINE_MIN ? Math.round(s / k / 10) * 10 : null; });
  const first = (fn) => Array.from({ length: hoursOut }, (_, h) => fn(h));
  hourly.w = first((h) => kmh(wx.w[h]));
  hourly.g = first((h) => kmh(wx.g[h]));
  hourly.d = first((h) => (fin(wx.d[h]) ? ((Math.round(wx.d[h]) % 360) + 360) % 360 : null));
  hourly.p = first((h) => r1(Math.max(0, p[h])));
  hourly.s = first((h) => Math.round(100 * solidFraction(tMed[h])));
  hourly.c = first((h) => Math.round(100 * Math.min(1, Math.max(0, n[h]))));
  return { row, hourly };
}

/** Head shared by the daily document and the hourly chunks. */
export const weatherHead = ({ run, runAt, engine }) => ({ schema: 1, run, runAt, origin: 'model', engine, verified: { highElevation: false, note: GLACIER_WEATHER_NOTE } });
/** The phase rule a document names (`rules.phase`). */
export const WEATHER_PHASE_RULE = Object.freeze({ warm: MELT.fsWarm, cold: MELT.fsCold, origin: 'set' });
