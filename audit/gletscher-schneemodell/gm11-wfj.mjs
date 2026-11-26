#!/usr/bin/env node
/**
 * GM-11 phase 1b, step 6 — the snow core WITHOUT a factor at Weissfluhjoch (SLF study plot 5WJ0, 2 536 m). Rule: gm11-hindcast-frozen.md
 * (sha256 checked). Input S: measured new-snow water `HNW_1D` (spread evenly over the 24 h before 06 UTC), temperature and global radiation of
 * SwissMetNet WFJ (2 691 m, moved to 2 536 m with −6.5 K/km). Input H: buscosun Fusion from the hindcast at archive point 06780, flat at 2 536 m
 * (file of gm11-hindcast-forcing.mjs with --site=wfj), amount × ramp of the H temperature, factor 1. Truth: snow depth `HS` at 06 UTC.
 * Constants of the operation (`snowCoreSetup`, density from snow-calibration.json). Writes only `--out`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm11-wfj.mjs \
 *     --slf=<all-stations.csv> --smn=<dir with raw-WFJ-2010-2019.csv>,<dir with raw-WFJ-2020-2029.csv> --forcing=<dir> --out=<json>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MELT, cosZenith, clearSky, cloudFactor } from '../../scripts/glacier/lib/meltcore.mjs';
import { stepLevel, emptyLevel } from '../../scripts/glacier/lib/snowpackcore.mjs';
import { SNOW, SNOW_ORIGIN, packDepthCm, packSwe } from '../../scripts/glacier/lib/snowcore.mjs';
import { snowCoreSetup, SNOW_DENSITY_SOURCE_DEFAULT } from '../../scripts/glacier/lib/snowcal.mjs';
import { fillShortGaps } from '../../scripts/glacier/melt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const H = 3_600_000, D = 24 * H;
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const frozen = readFileSync(join(HERE, 'gm11-hindcast-frozen.md'), 'utf8').replace(/\r\n/g, '\n');
const sha = createHash('sha256').update(frozen).digest('hex');
if (sha !== readFileSync(join(HERE, 'gm11-hindcast-frozen.sha256'), 'utf8').trim().split(/\s+/)[0]) throw new Error('Regel geändert');

const Z_PLOT = 2536, Z_SMN = 2691, LAPSE = -0.0065, LAT = 46.8296, LON = 9.8092;
const WINTERS = Array.from({ length: 15 }, (_, i) => 2012 + i), H_WINTERS = [2024, 2025, 2026];
const cal = J(join(REPO, 'scripts/glacier/melt-calibration.json')).fit;
const setup = snowCoreSetup({ density: SNOW_DENSITY_SOURCE_DEFAULT, base: SNOW, baseOrigin: SNOW_ORIGIN, table: J(join(REPO, 'scripts/glacier/snow-calibration.json')) });
const c = setup.c, par = { TF: cal.TF, SRF: cal.SRF, aBare: MELT.aIce };

// ---- SLF study plot 5WJ0 ----
const day = new Map();   // UTC day of the 06 UTC reading → { HS, HN, HNW }
for (const line of readFileSync(args.slf, 'utf8').split(/\r?\n/)) {
  if (!line.startsWith('5WJ0,')) continue;
  const [, ts, , HS, HN, HNW] = line.split(',');
  const ms = Date.UTC(+ts.slice(0, 4), +ts.slice(5, 7) - 1, +ts.slice(8, 10));
  const f = (v) => (v === '' || v == null ? null : +v);
  day.set(ms, { HS: f(HS), HN: f(HN), HNW: f(HNW) });
}
// ---- SwissMetNet WFJ hourly (end of hour, UTC) ----
const fromAll = Date.UTC(2011, 8, 1), toAll = Date.UTC(2026, 6, 2), nAll = (toAll - fromAll) / H;
const T = new Float64Array(nAll).fill(NaN), G = new Float64Array(nAll).fill(NaN);
const [smnA, smnB] = args.smn.split(',');
for (const p of [join(smnA, 'raw-WFJ-2010-2019.csv'), join(smnB, 'raw-WFJ-2020-2029.csv')]) {
  const lines = readFileSync(p, 'latin1').split(/\r?\n/), head = lines[0].split(';'), col = Object.fromEntries(head.map((x, i) => [x, i]));
  for (let li = 1; li < lines.length; li++) {
    const l = lines[li]; if (!l) continue;
    const x = l.split(';'), ts = x[col.reference_timestamp];
    const ms = Date.UTC(+ts.slice(6, 10), +ts.slice(3, 5) - 1, +ts.slice(0, 2), +ts.slice(11, 13), +ts.slice(14, 16));
    const i = Math.round((ms - fromAll) / H) - 1;
    if (i < 0 || i >= nAll) continue;
    const t = x[col.tre200h0], g = x[col.gre000h0];
    if (t !== '') T[i] = +t + LAPSE * (Z_PLOT - Z_SMN);
    if (g !== '') G[i] = +g;
  }
}
const Tf = fillShortGaps(T, 6);

/** One winter from 1 Oct 06 UTC to `endMs` 06 UTC: hourly `drive(hMs)` → { T, S, G }; returns the model depth (cm) and SWE at each 06 UTC. */
function run(startMs, endMs, drive, pr = par) {
  const lv = emptyLevel(), out = new Map(), meltMo = {};
  let held = 0, lastT = 0;
  for (let ms = startMs; ms < endMs; ms += H) {
    if ((ms - Date.UTC(2000, 0, 1, 6)) % D === 0) out.set(ms - 6 * H, { h: packDepthCm(lv.pack), swe: packSwe(lv.pack) });
    const d = drive(ms);
    let t = d.T; if (!Number.isFinite(t)) { t = lastT; held++; } else lastT = t;
    const mlt = stepLevel(lv, { tMs: ms, T: t, S: d.S, G: Number.isFinite(d.G) ? d.G : clearSky(cosZenith(LAT, LON, ms + H / 2), Z_PLOT) * 0.55 }, pr, c);
    const mo = new Date(ms).toISOString().slice(5, 7); meltMo[mo] = (meltMo[mo] ?? 0) + mlt;
  }
  out.set(endMs - 6 * H, { h: packDepthCm(lv.pack), swe: packSwe(lv.pack) });
  return { out, held, meltMo };
}
const MONTHS = ['10', '11', '12', '01', '02', '03', '04', '05', '06'];
function scoreWinter(Y, res, lastMonth = '06') {
  const errs = {}, pairs = [];
  for (const [ms, v] of res.out) {
    const mo = new Date(ms).toISOString().slice(5, 7);
    if (MONTHS.indexOf(mo) > MONTHS.indexOf(lastMonth)) continue;
    const m = day.get(ms); if (!m || m.HS == null) continue;
    (errs[mo] ??= []).push(v.h - m.HS); pairs.push({ ms, model: v.h, meas: m.HS });
  }
  // settling: HN ≥ 10 cm on day d, then three days with HN < 1 cm
  const settle = [];
  for (const [ms, m] of day) {
    if (ms < Date.UTC(Y - 1, 9, 2) || ms >= Date.UTC(Y, 5, 1) || !(m.HN >= 10)) continue;
    const nx = [1, 2, 3].map((k) => day.get(ms + k * D));
    if (!nx.every((x) => x && x.HN != null && x.HN < 1) || m.HS == null || nx[2].HS == null) continue;
    const a = res.out.get(ms), b = res.out.get(ms + 3 * D);
    if (!a || !b) continue;
    settle.push({ ms, meas: nx[2].HS - m.HS, model: b.h - a.h, hn: m.HN });
  }
  return { errs, pairs, settle };
}
const aggErr = (lists) => Object.fromEntries(MONTHS.map((mo) => { const e = lists.flatMap((l) => l[mo] ?? []); return [mo, { n: e.length, bias: r1(mean(e)), mae: r1(mean(e.map(Math.abs))) }]; }));
const aggSettle = (S) => ({ n: S.length, measMean: r1(mean(S.map((x) => x.meas))), modelMean: r1(mean(S.map((x) => x.model))), ratio: r3(mean(S.map((x) => x.model)) / mean(S.map((x) => x.meas))), mae: r1(mean(S.map((x) => Math.abs(x.model - x.meas)))) });

// ---- S: measured new-snow water ----
const meltByMonth = [];
const perWinter = [], allErr = [], allSettle = [], unusable = [], allErrNoMelt = [];
const parNoMelt = { ...par, TF: 0, SRF: 0 };   // diagnosis only: the same winter without melt
for (const Y of WINTERS) {
  const start = Date.UTC(Y - 1, 9, 1, 6), end = Date.UTC(Y, 6, 1, 6);
  let snowDays = 0, miss = 0, sHN = 0, sHNW = 0;
  for (let ms = Date.UTC(Y - 1, 9, 2); ms <= Date.UTC(Y, 6, 1); ms += D) { const m = day.get(ms); if (m?.HN > 0) { snowDays++; if (m.HNW == null) miss++; else { sHN += m.HN; sHNW += m.HNW; } } }
  if (snowDays === 0 || miss / snowDays > 0.1) { unusable.push({ Y, snowDays, missingHNW: miss }); continue; }
  const ratio = sHNW / sHN;   // fill of the few days with HN but without HNW: the winter's measured mean water per cm (stated in the report)
  const water = (ms) => { const m = day.get(Math.floor(ms / D) * D + (ms % D >= 6 * H ? D : 0)); if (!m) return 0; return m.HNW != null ? m.HNW : m.HN > 0 ? m.HN * ratio : 0; };
  const res = run(start, end, (ms) => { const i = Math.round((ms - fromAll) / H); return { T: Tf[i], S: water(ms) / 24, G: G[i] }; });
  const sc = scoreWinter(Y, res);
  allErrNoMelt.push(scoreWinter(Y, run(start, end, (ms) => { const i = Math.round((ms - fromAll) / H); return { T: Tf[i], S: water(ms) / 24, G: G[i] }; }, parNoMelt)).errs);
  allErr.push(sc.errs); meltByMonth.push(res.meltMo); allSettle.push(...sc.settle);
  const peak = sc.pairs.reduce((a, p) => (p.meas > a.meas ? p : a), { meas: -1 });
  perWinter.push({ Y, snowDays, filledHNW: miss, tempHeldH: res.held, peakMeasCm: r1(peak.meas), modelAtPeakCm: r1(peak.model), meanErrCm: r1(mean(sc.pairs.map((p) => p.model - p.meas))), settle: aggSettle(sc.settle), hnwSumMm: r1(sHNW) });
}

// ---- H: buscosun Fusion from the hindcast ----
const hOut = [];
const fsOf = (t) => (Number.isNaN(t) ? 0.5 : Math.min(1, Math.max(0, (MELT.fsWarm - t) / (MELT.fsWarm - MELT.fsCold))));
for (const Y of H_WINTERS) {
  const p = join(args.forcing, `wfj-${Y}.json`);
  if (!existsSync(p)) { hOut.push({ Y, missing: true }); continue; }
  const F = J(p);
  const t = fillShortGaps(Float64Array.from(F.series.t[0], (v) => (v == null ? NaN : v))), pr = fillShortGaps(Float64Array.from(F.series.p[0], (v) => (v == null ? NaN : v)), 3), n = fillShortGaps(Float64Array.from(F.series.n[0], (v) => (v == null ? NaN : v)));
  const start = Date.UTC(Y - 1, 9, 1, 6), end = Date.UTC(Y, 4, 31, 6);
  const monthly = {};
  const drive = (ms) => {
    const i = Math.round((ms - F.fromMs) / H);
    const S = Number.isFinite(pr[i]) ? pr[i] * fsOf(t[i]) : 0;
    const mo = new Date(ms).toISOString().slice(0, 7); (monthly[mo] ??= { H: 0, S: 0 }).H += S;
    return { T: t[i], S, G: clearSky(cosZenith(LAT, LON, ms + H / 2), Z_PLOT) * (Number.isFinite(n[i]) ? cloudFactor(n[i]) : 0.55) };
  };
  const res = run(start, end, drive);
  // the same months with S, for comparison
  const resS = (() => {
    let sHN = 0, sHNW = 0; for (let ms = Date.UTC(Y - 1, 9, 2); ms <= Date.UTC(Y, 6, 1); ms += D) { const m = day.get(ms); if (m?.HN > 0 && m.HNW != null) { sHN += m.HN; sHNW += m.HNW; } }
    const ratio = sHNW / sHN;
    const water = (ms) => { const m = day.get(Math.floor(ms / D) * D + (ms % D >= 6 * H ? D : 0)); if (!m) return 0; return m.HNW != null ? m.HNW : m.HN > 0 ? m.HN * ratio : 0; };
    return run(start, end, (ms) => { const i = Math.round((ms - fromAll) / H); const w = water(ms) / 24; const mo = new Date(ms).toISOString().slice(0, 7); (monthly[mo] ??= { H: 0, S: 0 }).S += w; return { T: Tf[i], S: w, G: G[i] }; });
  })();
  const sh = scoreWinter(Y, res, '05'), ss = scoreWinter(Y, resS, '05');
  hOut.push({ Y, note: Y === 2025 ? 'Tresor des Prüfstands: nur gemessen' : Y === 2026 ? 'im Fit-Zeitraum der Lernstufe 5e' : '', tempHeldH: res.held,
    errH: aggErr([sh.errs]), errS: aggErr([ss.errs]), settleH: aggSettle(sh.settle), settleS: aggSettle(ss.settle),
    snowWaterMm: Object.fromEntries(Object.entries(monthly).map(([k, v]) => [k, { H: r1(v.H), measured: r1(v.S), ratio: v.S > 0 ? r3(v.H / v.S) : null }])),
    winterSum: (() => { const v = Object.values(monthly); const h = v.reduce((s, x) => s + x.H, 0), s = v.reduce((s2, x) => s2 + x.S, 0); return { H: r1(h), measured: r1(s), ratio: r3(h / s) }; })(),
    hModEffM: F.hModEffM });
}
const out = {
  kind: 'gm11/wfj', rule: { sha256: sha }, generated: new Date().toISOString(), site: { plot: '5WJ0', z: Z_PLOT, smn: 'WFJ', zSmn: Z_SMN, lapse: LAPSE },
  constants: { source: setup.source, rhoNew: c.rhoNew, TF: par.TF, SRF: par.SRF }, unusable,
  S: { winters: perWinter.length, byMonth: aggErr(allErr), byMonthNoMelt: aggErr(allErrNoMelt), meltMmPerMonth: Object.fromEntries(MONTHS.map((mo) => [mo, r1(mean(meltByMonth.map((x) => x[mo] ?? 0)))])), settle: aggSettle(allSettle), perWinter }, H: hOut,
  leftOut: 'Sonnblick und Zugspitze nicht in dieser Runde; Regen und Schmelzwasser in der Schneedecke sind nicht im Kern',
};
writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, S: { ...out.S, perWinter: undefined } }, null, 1));
