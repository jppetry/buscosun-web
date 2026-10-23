#!/usr/bin/env node
/**
 * ruc-measure.mjs — T9 of phase RUC (`audit/niederschlag-ruc.md` §6): measures, after ≥ 14 days of shadow, whether the 5-min
 * form of ICON-D2-RUC places the onset of rain better than the same series as hourly blocks.
 *
 * Inputs
 *   `<store>/stations/<run>-<catalog>.png`   the raw RUC rates at the measuring stations (0–12 h, 5 min; producer T2)
 *   `<store>/stations/catalog-<catalog>.json` column j = station id j
 *   `<obs>/<day>.json.gz`                     dense day files of `scripts/obsfusion/build-dense-obs.mjs` (10-min `rr` per station)
 *
 * The RULE is frozen in `MEASURE_RULE` (hash printed in every report, recorded in the audit before the data existed):
 *   truth   = first 10-min stamp T (end of the interval) with rr ≥ 0,1 mm in the lead window 2–12 h; only stamps the day
 *             file covers count (≥ 25 of 61 needed, the dense-day files cover 7 h per day); a case counts for the onset only
 *             when the truth is dry at the first covered stamp; > 20 % gaps inside the covered part ⇒ invalid
 *   form a  = first stamp T with (r[k] + r[k+1]) / 12 ≥ 0,1 mm (the two 5-min intervals ending at T)
 *   block b = first stamp inside the first hour whose mean rate ≥ 0,6 mm/h (= 0,1 mm per 10-min slice, the same threshold)
 *   error   = forecast − truth in minutes; hit = |error| ≤ 30 min; Brier = mean squared wet/dry mismatch per stamp
 *   verdict = a better when MAE(a) ≤ MAE(b) AND hit(a) ≥ hit(b) over all onset cases; spans = max(|q25|, |q75|) of the
 *             form's error per lead class, rounded up to 5 min (replace the set ±15/30/45 of E-RUC-6)
 * Limits named: the station series carry the raw RUC (not the Fusion-scaled form of the client), the dense day files cover
 * [slot − 7 h, slot] per day, the > 12 h class is not measurable with 0–12 h series.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/ruc/ruc-measure.mjs --store=<ruc/v1 dir>
 *        --obs=<obs-dense dir> [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--out=<report.json>]
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { decodePng } from '../lib/png.mjs';
import { quantile } from '../../src/nowcast/rainWindow.ts';
import { RUC_STEP_MS, RUC_STATION_STEPS, decodeRucByte, parseRucStationsFile, rucRunMs } from '../../src/point/rucFormat.ts';

const MIN = 60_000, H = 3_600_000, TEN = 10 * MIN;

export const MEASURE_RULE = Object.freeze({
  schema: 1,
  truthWetMm10: 0.1,
  fcWetMm10: 0.1,
  hourWetMmH: 0.6,
  leadFromMin: 120,
  leadToMin: 720,
  hitWindowMin: 30,
  /** a case needs this many 10-min stamps covered by the day file inside the lead window (the dense-day files cover 7 h per day, V-RUC-18) */
  minCovered: 25,
  leadClasses: Object.freeze([Object.freeze(['≤3h', 120, 180]), Object.freeze(['3–12h', 180, 720])]),
  maxMissing: 0.2,
});

export function ruleHash() {
  return createHash('sha256').update(JSON.stringify(MEASURE_RULE)).digest('hex').slice(0, 16);
}

/**
 * One station × one run. `ruc5`: rate mm/h per 5-min interval from the run (index k = (runAt + 5k, runAt + 5(k+1)]), `null`
 * = no value. `truth`: `{ t0Ms, stepMs, rr }` with 10-min stamps (end of the interval) and rr in mm per 10 min (`null` = gap).
 */
export function measureCase({ runAtMs, ruc5, truth, country = null }) {
  const R = MEASURE_RULE;
  const out = { valid: false, onsetCase: false, country, truthOnsetMin: null, aOnsetMin: null, bOnsetMin: null, errA: null, errB: null, hitA: false, hitB: false, kindA: 'invalid', kindB: 'invalid', brierA: NaN, brierB: NaN, nSlices: 0 };
  if (!truth || truth.stepMs !== TEN || !Array.isArray(truth.rr) || (truth.t0Ms - runAtMs) % TEN !== 0) return out;
  let dA = 0, dB = 0, n = 0, missing = 0, covered = 0;
  let firstTruthWet = null, firstAWet = null, firstBWet = null, firstStampWet = null;
  for (let lead = R.leadFromMin; lead <= R.leadToMin; lead += 10) {
    const T = runAtMs + lead * MIN;
    const i = (T - truth.t0Ms) / TEN;
    if (i < 0 || i >= truth.rr.length) continue;   // not covered by the day file
    covered++;
    const rr = truth.rr[i];
    if (rr == null || !Number.isFinite(rr)) { missing++; continue; }
    const k = (T - TEN - runAtMs) / RUC_STEP_MS;
    const r0 = ruc5[k], r1 = ruc5[k + 1];
    if (r0 == null || r1 == null) { missing++; continue; }
    const h = Math.floor((T - runAtMs - 1) / H);
    let hm = 0, hn = 0;
    for (let j = 12 * h; j < 12 * h + 12 && j < ruc5.length; j++) { const v = ruc5[j]; if (v != null) { hm += v; hn++; } }
    if (hn < 12) { missing++; continue; }
    const tw = rr >= R.truthWetMm10 ? 1 : 0;
    const aw = (r0 + r1) / 12 >= R.fcWetMm10 ? 1 : 0;
    const bw = hm / 12 >= R.hourWetMmH ? 1 : 0;
    if (firstStampWet === null) firstStampWet = tw === 1;
    if (tw && firstTruthWet === null) firstTruthWet = lead;
    if (aw && firstAWet === null) firstAWet = lead;
    if (bw && firstBWet === null) firstBWet = lead;
    dA += (aw - tw) ** 2; dB += (bw - tw) ** 2; n++;
  }
  if (covered < R.minCovered || missing / covered > R.maxMissing || n === 0) return out;
  out.valid = true;
  out.nSlices = n;
  out.brierA = dA / n; out.brierB = dB / n;
  out.onsetCase = firstStampWet === false;
  if (!out.onsetCase) return out;
  out.truthOnsetMin = firstTruthWet; out.aOnsetMin = firstAWet; out.bOnsetMin = firstBWet;
  const kind = (fc) => (firstTruthWet != null ? (fc != null ? 'both' : 'miss') : (fc != null ? 'falseAlarm' : 'dry'));
  out.kindA = kind(firstAWet); out.kindB = kind(firstBWet);
  if (out.kindA === 'both') { out.errA = firstAWet - firstTruthWet; out.hitA = Math.abs(out.errA) <= R.hitWindowMin; }
  if (out.kindB === 'both') { out.errB = firstBWet - firstTruthWet; out.hitB = Math.abs(out.errB) <= R.hitWindowMin; }
  return out;
}

const ceil5 = (x) => Math.ceil(x / 5) * 5;

function groupStats(cases) {
  const g = { n: cases.length, bothA: 0, bothB: 0, missA: 0, missB: 0, falseA: 0, falseB: 0, dry: 0, maeA: null, maeB: null, hitA: null, hitB: null, q25A: null, q50A: null, q75A: null, q25B: null, q75B: null, brierA: null, brierB: null };
  const eA = [], eB = [];
  let hA = 0, hB = 0, bA = 0, bB = 0, bn = 0;
  for (const c of cases) {
    if (Number.isFinite(c.brierA) && Number.isFinite(c.brierB)) { bA += c.brierA; bB += c.brierB; bn++; }
    if (!c.onsetCase) continue;
    if (c.kindA === 'both') { g.bothA++; eA.push(c.errA); if (c.hitA) hA++; } else if (c.kindA === 'miss') g.missA++; else if (c.kindA === 'falseAlarm') g.falseA++;
    if (c.kindB === 'both') { g.bothB++; eB.push(c.errB); if (c.hitB) hB++; } else if (c.kindB === 'miss') g.missB++; else if (c.kindB === 'falseAlarm') g.falseB++;
    if (c.kindA === 'dry' && c.kindB === 'dry') g.dry++;
  }
  if (eA.length) { g.maeA = eA.reduce((s, e) => s + Math.abs(e), 0) / eA.length; g.hitA = hA / eA.length; g.q25A = quantile(eA, 0.25); g.q50A = quantile(eA, 0.5); g.q75A = quantile(eA, 0.75); }
  if (eB.length) { g.maeB = eB.reduce((s, e) => s + Math.abs(e), 0) / eB.length; g.hitB = hB / eB.length; g.q25B = quantile(eB, 0.25); g.q75B = quantile(eB, 0.75); }
  if (bn) { g.brierA = bA / bn; g.brierB = bB / bn; }
  return g;
}

/** Groups: all, per lead class (by the truth onset, else by the forecast onset), per country; verdict and spans. */
export function aggregate(cases) {
  const valid = cases.filter((c) => c.valid);
  const leadOf = (c) => c.truthOnsetMin ?? c.aOnsetMin ?? c.bOnsetMin ?? null;
  const groups = { all: groupStats(valid) };
  for (const [name, lo, hi] of MEASURE_RULE.leadClasses) groups[name] = groupStats(valid.filter((c) => { const l = leadOf(c); return l != null && l >= lo && l < hi; }));
  for (const country of [...new Set(valid.map((c) => c.country).filter(Boolean))].sort()) groups[country] = groupStats(valid.filter((c) => c.country === country));
  const all = groups.all;
  const aBetter = all.maeA != null && all.maeB != null && all.maeA <= all.maeB && (all.hitA ?? 0) >= (all.hitB ?? 0);
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`);
  const f1 = (x) => (x == null ? '—' : x.toFixed(1));
  const verdict = {
    aBetter,
    reason: `Form MAE ${f1(all.maeA)} min ${aBetter ? '≤' : 'gegen'} Stundenblock MAE ${f1(all.maeB)} min; Treffer ±${MEASURE_RULE.hitWindowMin} min ${pct(all.hitA)} ${aBetter ? '≥' : 'gegen'} ${pct(all.hitB)} (${all.bothA} / ${all.bothB} Fälle mit Beginn)`,
  };
  const spans = {};
  for (const [name] of MEASURE_RULE.leadClasses) {
    const g = groups[name];
    spans[name] = g.q25A != null ? { halfMin: Math.max(5, ceil5(Math.max(Math.abs(g.q25A), Math.abs(g.q75A)))), q25: g.q25A, q75: g.q75A, n: g.bothA } : { halfMin: null, n: 0 };
  }
  return { groups, verdict, spans };
}

/** Reads the station series and the dense day files and measures every station × run with a measurement in the lead window. */
export function measureRuc({ storeDir, obsDir, from = null, to = null, log = () => {} }) {
  const stDir = join(storeDir, 'stations');
  const catalogs = new Map();
  const runs = [];
  for (const f of existsSync(stDir) ? readdirSync(stDir) : []) {
    const m = /^catalog-([0-9a-f]{8})\.json$/.exec(f);
    if (m) catalogs.set(m[1], JSON.parse(readFileSync(join(stDir, f), 'utf8')).ids);
    const r = parseRucStationsFile(f);
    if (r) runs.push({ ...r, file: join(stDir, f) });
  }
  runs.sort((a, b) => a.run.localeCompare(b.run));
  const dayCache = new Map();
  const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const loadDay = (day) => {
    if (!dayCache.has(day)) {
      const p = join(obsDir, `${day}.json.gz`);
      dayCache.set(day, existsSync(p) ? JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')) : null);
    }
    return dayCache.get(day);
  };
  const cases = [];
  const used = new Set();
  let runsUsed = 0;
  for (const r of runs) {
    if (from && r.run.slice(0, 8) < from.replace(/-/g, '')) continue;
    if (to && r.run.slice(0, 8) > to.replace(/-/g, '')) continue;
    const ids = catalogs.get(r.catalog);
    if (!ids) { log(`${r.run}: Katalog ${r.catalog} fehlt — ausgelassen`); continue; }
    const runAtMs = rucRunMs(r.run);
    const png = decodePng(readFileSync(r.file));
    if (png.width !== ids.length || png.height < RUC_STATION_STEPS) { log(`${r.run}: Reihe ${png.width} × ${png.height} passt nicht zum Katalog (${ids.length})`); continue; }
    const winFrom = runAtMs + MEASURE_RULE.leadFromMin * MIN, winTo = runAtMs + MEASURE_RULE.leadToMin * MIN;
    const days = [...new Set([dayOf(winFrom), dayOf(winTo)])].map(loadDay).filter(Boolean);
    if (!days.length) continue;
    let any = false;
    for (let j = 0; j < ids.length; j++) {
      const id = ids[j];
      const day = days.find((d) => d.stations?.[id]?.cols?.rr && d.t0Ms <= winFrom && d.t0Ms + d.n * d.stepMs >= winTo) ?? days.find((d) => d.stations?.[id]?.cols?.rr);
      if (!day) continue;
      const st = day.stations[id];
      const ruc5 = [];
      for (let k = 0; k < RUC_STATION_STEPS; k++) ruc5.push(decodeRucByte(png.data[k * png.width + j]));
      const c = measureCase({ runAtMs, ruc5, truth: { t0Ms: day.t0Ms, stepMs: day.stepMs, rr: st.cols.rr }, country: st.country ?? id.slice(0, 2).toUpperCase() });
      if (!c.valid) continue;
      cases.push({ ...c, id, run: r.run });
      used.add(id); any = true;
    }
    if (any) runsUsed++;
  }
  const agg = aggregate(cases);
  return { rule: MEASURE_RULE, ruleHash: ruleHash(), runs: runsUsed, runsSeen: runs.length, stationsUsed: used.size, cases: cases.length, ...agg };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
  if (!args.store || !args.obs) { console.error('ruc-measure: --store=<ruc/v1 dir> --obs=<obs-dense dir> [--from] [--to] [--out]'); process.exit(2); }
  const rep = measureRuc({ storeDir: resolve(args.store), obsDir: resolve(args.obs), from: args.from ?? null, to: args.to ?? null, log: (m) => console.error(`[ruc-measure] ${m}`) });
  if (args.out) writeFileSync(resolve(args.out), JSON.stringify(rep, null, 2));
  const g = rep.groups;
  const row = (name) => `| ${name} | ${g[name].n} | ${g[name].bothA}/${g[name].bothB} | ${g[name].maeA?.toFixed(1) ?? '—'} / ${g[name].maeB?.toFixed(1) ?? '—'} | ${g[name].hitA != null ? Math.round(g[name].hitA * 100) : '—'} % / ${g[name].hitB != null ? Math.round(g[name].hitB * 100) : '—'} % | ${g[name].missA}/${g[name].missB} | ${g[name].falseA}/${g[name].falseB} | ${g[name].brierA?.toFixed(3) ?? '—'} / ${g[name].brierB?.toFixed(3) ?? '—'} |`;
  console.log(`Regel ${rep.ruleHash} · Läufe ${rep.runs}/${rep.runsSeen} · Stationen ${rep.stationsUsed} · Fälle ${rep.cases}`);
  console.log('| Gruppe | Fälle | Beginn a/b | MAE a / b (min) | Treffer ±30 a / b | Verfehlt a/b | Fehlalarm a/b | Brier a / b |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const name of Object.keys(g)) console.log(row(name));
  console.log(`Verdikt: ${rep.verdict.aBetter ? 'Form besser ⇒ E-RUC-7 drehen' : 'Form NICHT besser ⇒ E-RUC-7 bleibt'} — ${rep.verdict.reason}`);
  console.log(`Spannen (max |q25|,|q75| der Form, auf 5 min): ${JSON.stringify(rep.spans)}`);
  console.log(JSON.stringify({ ruleHash: rep.ruleHash, runs: rep.runs, cases: rep.cases, verdict: rep.verdict.aBetter, spans: rep.spans }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
