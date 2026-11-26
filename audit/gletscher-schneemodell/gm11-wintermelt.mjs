#!/usr/bin/env node
/**
 * GM-11 phase 1c — winter melt of the snow core: diagnosis and candidate rules (measurement only). Rule: gm11-wintermelt-frozen.md (sha256 checked
 * before every scored step: plots-rules, glaciers, gatec). Nothing under scripts/glacier/** or src/** is changed: the variants live in the two
 * diagnostic copies below (`stepLevelV` of `stepLevel`, `simulateV` of `simulate`); Kontrolle A proves both bit for bit (Object.is) with every
 * variant off.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm11-wintermelt.mjs --step=<step> \
 *     --cache=<C:\dev\buscosun-glacier-cache> --out=<dir for full results> [--public=<repo report json>]
 *
 * Steps: anatomy (WFJ, step 2) · plots (step 3, description) · plots-rules (step 5a) · glaciers (steps 4 + 5b) · gatec (step 5c) · side26 (step 6).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { MELT, cosZenith, clearSky, simulate, emptyState } from '../../scripts/glacier/lib/meltcore.mjs';
import { stepLevel, emptyLevel } from '../../scripts/glacier/lib/snowpackcore.mjs';
import { SNOW, SNOW_ORIGIN, packDepthCm, packSwe, stepPack } from '../../scripts/glacier/lib/snowcore.mjs';
import { snowCoreSetup, SNOW_DENSITY_SOURCE_DEFAULT, precipRunOf } from '../../scripts/glacier/lib/snowcal.mjs';
import { fillShortGaps } from '../../scripts/glacier/melt.mjs';
import { loadWinters } from '../../scripts/glacier/snowcal-fit.mjs';
import { attachRadiation } from '../../scripts/glacier/snowcal-fit2.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const H = 3_600_000, D = 24 * H;
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : null; };
const freeGb = () => os.freemem() / 2 ** 30;
const STEP = args.step, CACHE = args.cache, OUT = args.out;
mkdirSync(OUT, { recursive: true });
const memLog = [];
function mem(label) { const g = freeGb(); memLog.push({ label, freeGb: r3(g) }); console.error(`[mem] ${label}: ${g.toFixed(2)} GB frei`); if (g < 3) throw new Error(`STOPP: nur ${g.toFixed(2)} GB frei`); }

// ---- the frozen rule (scored steps only) ----
const SCORED = new Set(['plots-rules', 'glaciers', 'gatec']);
let ruleSha = null;
if (SCORED.has(STEP)) {
  const frozen = readFileSync(join(HERE, 'gm11-wintermelt-frozen.md'), 'utf8').replace(/\r\n/g, '\n');
  ruleSha = createHash('sha256').update(frozen).digest('hex');
  const want = readFileSync(join(HERE, 'gm11-wintermelt-frozen.sha256'), 'utf8').trim().split(/\s+/)[0];
  if (ruleSha !== want) throw new Error(`Regel geändert: ${ruleSha} ≠ ${want}`);
}
/** Constants of the candidate rules and the verdict, as written in gm11-wintermelt-frozen.md. */
const RULE = Object.freeze({
  cI: 2.1, lF: 334,          // kJ kg⁻¹ K⁻¹ / kJ kg⁻¹ (literature: physical constants, DeWalle & Rango 2008, eq. of the cold content)
  tauSnowH: 72,              // h, the pack temperature as running mean of min(T, 0) (set)
  capK: 20,                  // K, cold content never above a pack at −20 K (set)
  winterMonths: [12, 1, 2, 3],
  springTolCm: 2.0, meltOutTolD: 3, removeMelt: 0.5, removeMae: 0.2, noEffect: 0.05, noEffectMelt: 0.2, summerTol: 0.05,
  kLo: 0.2, kHi: 8, kIter: 40, minWintersLowo: 4,
  pairKm: 10, pairDz: 300, hnwShare: 0.9, minPlotWinters: 3, tempHeldMax: 0.1, meltOutDays: 7, meltOutCm: 0.5,
});
const KCC = RULE.cI / RULE.lF;   // mm w.e. of cold content per mm SWE and K

// ---- variants ----
export const VARIANTS = Object.freeze({ core: {}, R1: { r1: true }, R2: { r2: true }, R3: { r3: true }, R4: { r1: true, r2: true } });
const DECAY = Math.exp(-1 / MELT.tauH);
const monthOf = (ms) => new Date(ms).getUTCMonth() + 1;

/**
 * Diagnostic copy of `stepLevel` (snowpackcore.mjs). With `V` empty it is `stepLevel` (Kontrolle A). Extra level state for R1: `lv.ts` (running mean
 * of min(T, 0)), `lv.cc` (cold content, mm w.e.). `log(o)` (optional) receives the terms of every hour.
 */
function stepLevelV(lv, { tMs, T, S, G }, par, c, V, log) {
  if (S > 0) lv.aS = lv.aS + (MELT.aFresh - lv.aS) * Math.min(1, S / 5);
  else if (!(V.r2 && T < 0)) lv.aS = MELT.aFirnSnow + (lv.aS - MELT.aFirnSnow) * DECAY;
  const Ti = T <= 0 ? T : MELT.bIce * T;
  const swe0 = packSwe(lv.pack);
  const alb = swe0 + S > MELT.sweMin ? lv.aS : par.aBare;
  let tTerm = 0, rTerm = 0;
  if (Ti > MELT.tT) { tTerm = par.TF * Ti; rTerm = par.SRF * (1 - alb) * G; }
  else if (V.r3 && Ti > 0) rTerm = (Ti / MELT.tT) * (par.SRF * (1 - alb) * G);
  let m = Ti > MELT.tT ? tTerm + rTerm : rTerm;
  let ccUsed = 0;
  if (V.r1) {
    lv.ts = (lv.ts ?? 0) + (Math.min(T, 0) - (lv.ts ?? 0)) / RULE.tauSnowH;
    const swe = swe0 + S;
    if (swe <= 0) lv.cc = 0;
    else {
      const cap = KCC * swe * RULE.capK;
      if (T <= 0) lv.cc = Math.max(lv.cc ?? 0, KCC * swe * -lv.ts);
      lv.cc = Math.min(cap, lv.cc ?? 0);
      if (m > 0) { ccUsed = Math.min(lv.cc, m); lv.cc -= ccUsed; m -= ccUsed; }
    }
  }
  if (V.noWinter && RULE.winterMonths.includes(monthOf(tMs))) m = 0;
  const melted = stepPack(lv.pack, { tMs, solidMm: S, meltMm: m, tC: T }, c).melted;
  if (log && (melted > 0 || ccUsed > 0)) log({ tMs, T, Ti, G, alb, tTerm, rTerm, ccUsed, m, melted, swe0 });
  return melted;
}

/**
 * Diagnostic copy of `simulate` (meltcore.mjs, model 'eti', no `ddf`). With `V` empty it is `simulate` (Kontrolle A). `t0Ms` = start of hour 0, used for
 * the month buckets (`buckets(month) → index`) of melt and accumulation per band, and for `V.noWinter`.
 */
function simulateV({ bands, ela, t, g, p, zT, zP, pf, TF, SRF, state, accumulateOnly = false, pGrad = MELT.pGrad, corr: corrIn = null }, V = {}, t0Ms = 0, buckets = null, nBk = 0) {
  const nb = bands.zb.length, n = t.length;
  const swe = Float64Array.from(state.swe), aS = Float64Array.from(state.aS);
  const bal = new Float64Array(nb), meltH = new Float64Array(n);
  const decay = Math.exp(-1 / MELT.tauH);
  const aBare = bands.zb.map((z) => (z < ela ? MELT.aIce : MELT.aFirn));
  const corr = corrIn ?? bands.zb.map((z) => 1 + (pGrad * (z - zP)) / 100);
  const ts = new Float64Array(nb), cc = new Float64Array(nb);
  const mB = buckets ? Array.from({ length: nBk }, () => new Float64Array(nb)) : null, acc = new Float64Array(nb);
  for (let h = 0; h < n; h++) {
    const th = t[h], ph = Number.isFinite(p[h]) ? p[h] : 0, gh = Number.isFinite(g?.[h]) ? g[h] : 0;
    const mo = buckets || V.noWinter ? monthOf(t0Ms + h * H) : 0, bk = buckets ? buckets(mo) : -1;
    const winterOff = V.noWinter && RULE.winterMonths.includes(mo);
    let mh = 0;
    for (let b = 0; b < nb; b++) {
      const Tb = th + MELT.gamma * (bands.zb[b] - zT);
      const fs = Number.isNaN(Tb) ? 0.5 : Math.min(1, Math.max(0, (MELT.fsWarm - Tb) / (MELT.fsWarm - MELT.fsCold)));
      const S = pf * ph * corr[b] * fs;
      swe[b] += S; acc[b] += S;
      if (S > 0) aS[b] = aS[b] + (MELT.aFresh - aS[b]) * Math.min(1, S / 5);
      else if (!(V.r2 && Tb < 0)) aS[b] = MELT.aFirnSnow + (aS[b] - MELT.aFirnSnow) * decay;
      let melt = 0;
      if (!accumulateOnly && !Number.isNaN(th)) {
        const Ti = Tb <= 0 ? Tb : MELT.bIce * Tb;
        const alb = swe[b] > MELT.sweMin ? aS[b] : aBare[b];
        if (Ti > MELT.tT) melt = TF * Ti + SRF * (1 - alb) * gh;
        else if (V.r3 && Ti > 0) melt = (Ti / MELT.tT) * (SRF * (1 - alb) * gh);
        if (V.r1) {
          ts[b] += (Math.min(Tb, 0) - ts[b]) / RULE.tauSnowH;
          if (swe[b] <= 0) cc[b] = 0;
          else {
            if (Tb <= 0) cc[b] = Math.max(cc[b], KCC * swe[b] * -ts[b]);
            cc[b] = Math.min(KCC * swe[b] * RULE.capK, cc[b]);
            if (melt > 0) { const u = Math.min(cc[b], melt); cc[b] -= u; melt -= u; }
          }
        }
        if (winterOff) melt = 0;
      }
      const taken = Math.min(swe[b], melt);
      swe[b] -= taken;
      bal[b] += S - melt;
      mh += bands.w[b] * melt;
      if (mB && bk >= 0) mB[bk][b] += melt;
    }
    meltH[h] = mh;
  }
  const meltSum = meltH.reduce((x, y) => x + y, 0);
  return { meltH, bal, state: { swe, aS }, meltSum, balance: bands.w.reduce((s, w, b) => s + w * bal[b], 0), mB, acc };
}

// ---- inputs shared by the plot steps ----
const cal = J(join(REPO, 'scripts/glacier/melt-calibration.json')).fit;
const setup = snowCoreSetup({ density: SNOW_DENSITY_SOURCE_DEFAULT, base: SNOW, baseOrigin: SNOW_ORIGIN, table: J(join(REPO, 'scripts/glacier/snow-calibration.json')) });
const cDens = setup.c, PAR = { TF: cal.TF, SRF: cal.SRF, aBare: MELT.aIce };   // as gm11-wfj.mjs (§3q.6)
const LAPSE = -0.0065;
const fromAll = Date.UTC(2011, 8, 1), toAll = Date.UTC(2026, 6, 2), nAll = (toAll - fromAll) / H;
const hav = (lat1, lon1, lat2, lon2) => { const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180; const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * Math.PI) / 360) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(a)); };

let slfCache = null;
function slfAll() {
  if (slfCache) return slfCache;
  const by = new Map();
  for (const line of readFileSync(join(CACHE, 'gm3/slf/all-stations.csv'), 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('station_code')) continue;
    const [code, ts, , HS, HN, HNW] = line.split(',');
    const ms = Date.UTC(+ts.slice(0, 4), +ts.slice(5, 7) - 1, +ts.slice(8, 10));
    if (ms < Date.UTC(2011, 8, 1)) continue;
    const f = (v) => (v === '' || v == null ? null : +v);
    if (!by.has(code)) by.set(code, new Map());
    by.get(code).set(ms, { HS: f(HS), HN: f(HN), HNW: f(HNW) });
  }
  const meta = new Map();
  for (const line of readFileSync(join(CACHE, 'gm3/slf/stations.csv'), 'utf8').split(/\r?\n/).slice(1)) {
    if (!line) continue; const x = line.split(',');
    meta.set(x[1], { code: x[1], label: x[2], lon: +x[4], lat: +x[5], z: +x[6], network: x[0] });
  }
  return (slfCache = { by, meta });
}
function smnMeta() {
  const lines = readFileSync(join(CACHE, 'gm11/w26/smn/ogd-smn_meta_stations.csv'), 'latin1').split(/\r?\n/), head = lines[0].split(';'), col = Object.fromEntries(head.map((x, i) => [x, i]));
  const out = new Map();
  for (const l of lines.slice(1)) { if (!l) continue; const x = l.split(';'); out.set(x[col.station_abbr], { abbr: x[col.station_abbr], name: x[col.station_name], z: +x[col.station_height_masl], lat: +x[col.station_coordinates_wgs84_lat], lon: +x[col.station_coordinates_wgs84_lon] }); }
  return out;
}
const smnFiles = (abbr) => [join(CACHE, 'gm3/smn', `raw-${abbr}-2010-2019.csv`), existsSync(join(CACHE, 'gm11/w26/smn', `raw-${abbr}-2020-2029.csv`)) ? join(CACHE, 'gm11/w26/smn', `raw-${abbr}-2020-2029.csv`) : join(CACHE, 'gm3/smn', `raw-${abbr}-2020-2029.csv`)];
/** Hourly T, G, R (precipitation) of one SwissMetNet station on the hour grid from `fromAll` (index i = hour ending at fromAll + (i + 1) h). */
function smnSeries(abbr) {
  const T = new Float64Array(nAll).fill(NaN), G = new Float64Array(nAll).fill(NaN), R = new Float64Array(nAll).fill(NaN);
  for (const p of smnFiles(abbr)) {
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'latin1').split(/\r?\n/), head = lines[0].split(';'), col = Object.fromEntries(head.map((x, i) => [x, i]));
    for (let li = 1; li < lines.length; li++) {
      const l = lines[li]; if (!l) continue;
      const x = l.split(';'), ts = x[col.reference_timestamp];
      const ms = Date.UTC(+ts.slice(6, 10), +ts.slice(3, 5) - 1, +ts.slice(0, 2), +ts.slice(11, 13), +ts.slice(14, 16));
      const i = Math.round((ms - fromAll) / H) - 1;
      if (i < 0 || i >= nAll) continue;
      const t = x[col.tre200h0], g = x[col.gre000h0], r = x[col.rre150h0];
      if (t !== '' && t != null) T[i] = +t;
      if (g !== '' && g != null) G[i] = +g;
      if (r !== '' && r != null) R[i] = +r;
    }
  }
  return { T, G, R };
}

/** One plot: day map, coordinates, SMN series, lapse to plot elevation. Returns the scored winters with their drive. */
function plotSetup(plot, st) {
  const { by } = slfAll(), day = by.get(plot.code), s = smnSeries(st.abbr);
  const T = new Float64Array(nAll); for (let i = 0; i < nAll; i++) T[i] = s.T[i] + LAPSE * (plot.z - st.z);
  const Tf = fillShortGaps(T, 6);
  const winters = [], dropped = [];
  for (let Y = 2012; Y <= 2026; Y++) {
    let snowDays = 0, miss = 0, sHN = 0, sHNW = 0, hsDays = 0;
    for (let ms = Date.UTC(Y - 1, 9, 2); ms <= Date.UTC(Y, 6, 1); ms += D) { const m = day.get(ms); if (m?.HS != null) hsDays++; if (m?.HN > 0) { snowDays++; if (m.HNW == null) miss++; else { sHN += m.HN; sHNW += m.HNW; } } }
    if (snowDays === 0 || hsDays < 200) { dropped.push({ Y, why: 'keine Messreihe', snowDays, hsDays }); continue; }
    if (miss / snowDays > 1 - RULE.hnwShare) { dropped.push({ Y, why: 'HNW < 90 % der Schneefalltage', snowDays, miss }); continue; }
    const start = Date.UTC(Y - 1, 9, 1, 6), end = Date.UTC(Y, 6, 1, 6);
    let tMiss = 0; for (let ms = start; ms < end; ms += H) if (!Number.isFinite(Tf[Math.round((ms - fromAll) / H)])) tMiss++;
    if (tMiss / ((end - start) / H) > RULE.tempHeldMax) { dropped.push({ Y, why: 'Temperatur fehlt > 10 % der Stunden', tMiss }); continue; }
    const ratio = sHN > 0 ? sHNW / sHN : 0;
    const water = (ms) => { const m = day.get(Math.floor(ms / D) * D + (ms % D >= 6 * H ? D : 0)); if (!m) return 0; return m.HNW != null ? m.HNW : m.HN > 0 ? m.HN * ratio : 0; };
    const drive = (ms) => { const i = Math.round((ms - fromAll) / H); return { T: Tf[i], S: water(ms) / 24, G: s.G[i] }; };
    winters.push({ Y, start, end, drive, filled: miss, hnwSum: sHNW });
  }
  return { day, winters, dropped, lat: plot.lat, lon: plot.lon, z: plot.z };
}

/** Runs one winter at a plot with variant V; `twin` = also run the original stepLevel and compare bitwise (Kontrolle A). */
function runPlot(P, w, V, { twin = false, log = null } = {}) {
  const lv = emptyLevel(), lv0 = twin ? emptyLevel() : null, out = new Map(), meltMo = {};
  let lastT = 0, held = 0, ctrlBad = 0, ctrlN = 0;
  for (let ms = w.start; ms < w.end; ms += H) {
    if ((ms - Date.UTC(2000, 0, 1, 6)) % D === 0) out.set(ms - 6 * H, { h: packDepthCm(lv.pack), swe: packSwe(lv.pack), aS: lv.aS });
    const d = w.drive(ms);
    let t = d.T; if (!Number.isFinite(t)) { t = lastT; held++; } else lastT = t;
    const inp = { tMs: ms, T: t, S: d.S, G: Number.isFinite(d.G) ? d.G : clearSky(cosZenith(P.lat, P.lon, ms + H / 2), P.z) * 0.55 };
    const mlt = stepLevelV(lv, inp, PAR, cDens, V, log);
    if (twin) {
      const m0 = stepLevel(lv0, inp, PAR, cDens); ctrlN++;
      if (!Object.is(m0, mlt) || !Object.is(lv0.aS, lv.aS) || !Object.is(packSwe(lv0.pack), packSwe(lv.pack)) || !Object.is(packDepthCm(lv0.pack), packDepthCm(lv.pack))) ctrlBad++;
    }
    const mo = String(monthOf(ms)).padStart(2, '0'); meltMo[mo] = (meltMo[mo] ?? 0) + mlt;
  }
  out.set(w.end - 6 * H, { h: packDepthCm(lv.pack), swe: packSwe(lv.pack), aS: lv.aS });
  if (twin && JSON.stringify(lv.pack) !== JSON.stringify(lv0.pack)) ctrlBad++;
  return { out, meltMo, held, ctrlBad, ctrlN };
}
const MONTHS = ['10', '11', '12', '01', '02', '03', '04', '05', '06'];
function meltOutOf(series, Y) {   // first day ≥ 1 March with depth < 0.5 cm on 7 days in a row; capped at 1 July
  const from = Date.UTC(Y, 2, 1), cap = Date.UTC(Y, 6, 1);
  for (let ms = from; ms <= cap; ms += D) {
    let ok = true; for (let k = 0; k < RULE.meltOutDays; k++) { const v = series(ms + k * D); if (v == null || !(v < RULE.meltOutCm)) { ok = false; break; } }
    if (ok) return ms;
  }
  return cap;
}
function scorePlot(P, w, res) {
  const err = {};
  for (const [ms, v] of res.out) { const mo = new Date(ms).toISOString().slice(5, 7); const m = P.day.get(ms); if (!m || m.HS == null) continue; (err[mo] ??= []).push(v.h - m.HS); }
  const mMeas = meltOutOf((ms) => { const m = P.day.get(ms); return m?.HS ?? (ms >= w.end - 6 * H ? 0 : null); }, w.Y);
  const mMod = meltOutOf((ms) => res.out.get(ms)?.h ?? (ms >= w.end - 6 * H ? res.out.get(w.end - 6 * H)?.h ?? null : null), w.Y);
  const winterMelt = ['12', '01', '02', '03'].reduce((s, mo) => s + (res.meltMo[mo] ?? 0), 0);
  return { err, meltOutMeas: mMeas, meltOutMod: mMod, meltOutErrD: (mMod - mMeas) / D, winterMelt, meltMo: res.meltMo };
}

function pairPlots() {
  const { by, meta } = slfAll(), sm = smnMeta();
  const cached = [...new Set([...readdirNames(join(CACHE, 'gm3/smn')), ...readdirNames(join(CACHE, 'gm11/w26/smn'))])];
  const withTG = [];
  for (const abbr of cached) {
    const s = sm.get(abbr); if (!s) continue;
    withTG.push(s);
  }
  const rows = [];
  for (const [code, day] of by) {
    const p = meta.get(code);
    let snowDays = 0, hnw = 0; for (const m of day.values()) if (m.HN > 0) { snowDays++; if (m.HNW != null) hnw++; }
    if (!p) { rows.push({ code, drop: 'nicht im Stationskatalog' }); continue; }
    const share = snowDays ? hnw / snowDays : 0;
    if (snowDays === 0 || hnw === 0) { rows.push({ code, label: p.label, z: p.z, drop: 'kein Wasserwert des Neuschnees', share: r3(share) }); continue; }
    const near = withTG.map((s) => ({ s, km: hav(p.lat, p.lon, s.lat, s.lon), dz: s.z - p.z })).filter((x) => x.km <= RULE.pairKm && Math.abs(x.dz) <= RULE.pairDz).sort((a, b) => a.km - b.km);
    rows.push({ code, label: p.label, z: p.z, lat: p.lat, lon: p.lon, share: r3(share), snowDays, candidates: near.map((x) => ({ abbr: x.s.abbr, km: r1(x.km), dz: Math.round(x.dz) })) });
  }
  return rows;
}
function readdirNames(dir) { try { return [...new Set(readdirSyncSafe(dir).filter((f) => /^raw-[A-Z0-9]{3}-/.test(f)).map((f) => f.slice(4, 7)))]; } catch { return []; } }
import { readdirSync } from 'node:fs';
const readdirSyncSafe = (d) => (existsSync(d) ? readdirSync(d) : []);

/** The pairing rule of step 3: share of snowfall days with HNW ≥ 90 % (2011–2026 pooled); nearest SMN station of the cache ≤ 10 km and ±300 m that
 *  has temperature AND global radiation in ≥ 90 % of the hours of the scored winters; the first such station in order of distance; ≥ 3 scored winters. */
function choosePlots() {
  const rows = pairPlots(), chosen = [], dropped = [];
  for (const r of rows) {
    if (r.drop) { dropped.push(r); continue; }
    if (r.share < RULE.hnwShare) { dropped.push({ ...r, drop: `Wasserwert an ${Math.round(r.share * 100)} % der Schneefalltage`, candidates: undefined }); continue; }
    if (!r.candidates.length) { dropped.push({ ...r, drop: 'keine SwissMetNet-Station ≤ 10 km und ±300 m im Speicher' }); continue; }
    let ok = null; const tried = [];
    for (const cnd of r.candidates) {
      const s = smnSeries(cnd.abbr); let nT = 0, nG = 0; for (let i = 0; i < nAll; i++) { if (Number.isFinite(s.T[i])) nT++; if (Number.isFinite(s.G[i])) nG++; }
      tried.push({ ...cnd, shareT: r3(nT / nAll), shareG: r3(nG / nAll) });
      if (nG / nAll >= 0.5 && nT / nAll >= 0.5) { ok = cnd; break; }
    }
    if (!ok) { dropped.push({ ...r, drop: 'Station ohne Globalstrahlung/Temperatur', tried }); continue; }
    chosen.push({ ...r, station: ok, tried });
  }
  return { chosen, dropped };
}

// ================================================================================================================================================
const report = { kind: `gm11/wintermelt/${STEP}`, generated: new Date().toISOString(), rule: ruleSha ? { sha256: ruleSha } : 'Beschreibung, vor der Regel', mem: memLog };

if (STEP === 'anatomy' || STEP === 'plots' || STEP === 'plots-rules') {
  mem('start');
  const sm = smnMeta();
  let plots;
  if (STEP === 'anatomy') plots = [{ code: '5WJ0', label: 'Weissfluhjoch', z: 2536, lat: 46.8296, lon: 9.8092, station: { abbr: 'WFJ' } }];
  else { const c = choosePlots(); plots = c.chosen; report.dropped = c.dropped; report.pairing = 'Wasserwert ≥ 90 % der Schneefalltage (2011–2026), nächste SwissMetNet-Station des Speichers ≤ 10 km und ±300 m mit Temperatur und Globalstrahlung, ≥ 3 gewertete Winter'; }
  report.plots = [];
  let ctrlBadAll = 0, ctrlNAll = 0;
  for (const pl of plots) {
    mem(`Messfeld ${pl.code}`);
    const st = sm.get(pl.station.abbr);
    const P = plotSetup(pl, st);
    if (P.winters.length < (STEP === 'anatomy' ? 1 : RULE.minPlotWinters)) { report.plots.push({ code: pl.code, label: pl.label, z: pl.z, station: st.abbr, dropped: P.dropped, scored: P.winters.length, drop: 'weniger als drei gewertete Winter' }); continue; }
    const variantsHere = STEP === 'plots-rules' ? Object.keys(VARIANTS) : ['core'];
    const per = {};
    for (const vk of variantsHere) {
      const ws = [];
      for (const w of P.winters) {
        const hours = [];
        const res = runPlot(P, w, VARIANTS[vk], { twin: vk === 'core', log: STEP === 'anatomy' ? (o) => hours.push(o) : null });
        if (vk === 'core') { ctrlBadAll += res.ctrlBad; ctrlNAll += res.ctrlN; }
        const sc = scorePlot(P, w, res);
        ws.push({ Y: w.Y, ...sc, hours, out: STEP === 'anatomy' ? res.out : null, held: res.held, filled: w.filled, hnwSum: w.hnwSum });
      }
      per[vk] = ws;
    }
    // no-melt diagnosis for the description
    if (STEP !== 'plots-rules') per.noWinter = P.winters.map((w) => { const res = runPlot(P, w, { noWinter: true }); return { Y: w.Y, ...scorePlot(P, w, res) }; });
    const agg = (ws, mos) => { const e = ws.flatMap((x) => mos.flatMap((mo) => x.err[mo] ?? [])); return { n: e.length, bias: r1(mean(e)), mae: r1(mean(e.map(Math.abs))) }; };
    const byMonth = (ws) => Object.fromEntries(MONTHS.map((mo) => [mo, agg(ws, [mo])]));
    const meltMonth = (ws) => Object.fromEntries(MONTHS.map((mo) => [mo, r1(mean(ws.map((x) => x.meltMo[mo] ?? 0)))]));
    const summary = (ws) => ({ winters: ws.length, winterMeltMm: r1(mean(ws.map((x) => x.winterMelt))), meltMm: meltMonth(ws), byMonth: byMonth(ws), decMar: agg(ws, ['12', '01', '02', '03']), janMar: agg(ws, ['01', '02', '03']), aprJun: agg(ws, ['04', '05', '06']),
      meltOut: { maeD: r1(mean(ws.map((x) => Math.abs(x.meltOutErrD)))), biasD: r1(mean(ws.map((x) => x.meltOutErrD))) } });
    const rec = { code: pl.code, label: pl.label, z: pl.z, station: st.abbr, stationZ: st.z, km: pl.station.km ?? null, dropped: P.dropped, scoredWinters: P.winters.map((w) => w.Y), filledDays: P.winters.reduce((s, w) => s + w.filled, 0),
      tempHeldH: per.core.reduce((s, x) => s + x.held, 0), variants: Object.fromEntries(Object.entries(per).filter(([k]) => k !== 'noWinter').map(([k, ws]) => [k, summary(ws)])), noWinterMelt: per.noWinter ? summary(per.noWinter) : undefined,
      meltOutDates: per.core.map((x) => ({ Y: x.Y, meas: new Date(x.meltOutMeas).toISOString().slice(0, 10), model: new Date(x.meltOutMod).toISOString().slice(0, 10) })) };
    if (STEP === 'anatomy') rec.anatomy = anatomyOf(per.core, P);
    report.plots.push(rec);
  }
  report.controlA = { hours: ctrlNAll, notIdentical: ctrlBadAll, green: ctrlBadAll === 0 };
  if (ctrlBadAll) console.error('STOPP: Kontrolle A nicht bitgleich');
  if (STEP === 'plots-rules') report.verdicts = plotVerdicts(report.plots.filter((p) => p.variants));
}

function anatomyOf(ws, P) {
  const byMo = {}, albBins = {}, cold = { meanBelow0: 0, nightBelowM5: 0, all: 0 }, aBareHours = { n: 0, mm: 0 };
  const binOf = (d) => (d == null ? 'nie' : d <= 0 ? '0' : d <= 1 ? '1' : d <= 2 ? '2' : d <= 5 ? '3–5' : d <= 10 ? '6–10' : d <= 20 ? '11–20' : '>20');
  for (const w of ws) {
    // daily mean T, night minimum (18–06 UTC before the day), last snowfall day (≥ 1 mm water)
    const dayT = new Map(), nightMin = new Map(), snowDay = [];
    for (let ms = w.hours.length ? Date.UTC(w.Y - 1, 9, 1) : 0, end = Date.UTC(w.Y, 6, 1); ms < end && w.hours.length; ms += D) {
      let s = 0, n = 0, mn = Infinity;
      for (let h = 0; h < 24; h++) { const t = P.winters.find((x) => x.Y === w.Y).drive(ms + h * H).T; if (Number.isFinite(t)) { s += t; n++; } }
      for (let h = -6; h < 6; h++) { const t = P.winters.find((x) => x.Y === w.Y).drive(ms + h * H).T; if (Number.isFinite(t)) mn = Math.min(mn, t); }
      dayT.set(ms, n ? s / n : NaN); nightMin.set(ms, mn);
      const m = P.day.get(ms + D); if (m && ((m.HNW ?? 0) >= 1 || (m.HN ?? 0) >= 1)) snowDay.push(ms);   // reading at 06 UTC of the next day = snow of this day
    }
    const meltDays = new Map();
    for (const o of w.hours) {
      if (!(o.melted > 0)) continue;
      const mo = String(monthOf(o.tMs)).padStart(2, '0'), dms = Math.floor(o.tMs / D) * D;
      const f = o.m > 0 ? o.melted / o.m : 0;
      const b = (byMo[mo] ??= { hours: 0, days: new Set(), mm: 0, tMm: 0, rMm: 0, Tsum: 0, Gsum: 0, albSum: 0, atBare: 0 });
      b.hours++; b.days.add(dms); b.mm += o.melted; b.tMm += o.tTerm * f; b.rMm += o.rTerm * f; b.Tsum += o.T; b.Gsum += o.G; b.albSum += o.alb; if (o.alb === PAR.aBare) b.atBare++;
      if (!['12', '01', '02', '03'].includes(mo)) continue;
      cold.all += o.melted;
      if (dayT.get(dms) < 0) cold.meanBelow0 += o.melted;
      if (nightMin.get(dms) < -5) cold.nightBelowM5 += o.melted;
      if (o.alb === PAR.aBare) { aBareHours.n++; aBareHours.mm += o.melted; }
      const last = snowDay.filter((x) => x <= dms).pop();
      const k = binOf(last == null ? null : (dms - last) / D);
      const a = (albBins[k] ??= { hours: 0, albSum: 0, mm: 0 }); a.hours++; a.albSum += o.alb; a.mm += o.melted;
      meltDays.set(dms, (meltDays.get(dms) ?? 0) + o.melted);
    }
  }
  const nW = ws.length;
  return {
    winters: nW,
    byMonth: Object.fromEntries(Object.entries(byMo).sort().map(([mo, b]) => [mo, { meltHoursPerWinter: r1(b.hours / nW), meltDaysPerWinter: r1(b.days.size / nW), mmPerWinter: r1(b.mm / nW), shareTempTerm: r3(b.tMm / b.mm), shareRadTerm: r3(b.rMm / b.mm), meanT: r1(b.Tsum / b.hours), meanG: Math.round(b.Gsum / b.hours), meanAlbedo: r3(b.albSum / b.hours), hoursOnBareAlbedo: b.atBare }])),
    decMar: { mmPerWinter: r1(cold.all / nW), shareOnDaysMeanBelow0: r3(cold.meanBelow0 / cold.all), shareAfterNightBelowM5: r3(cold.nightBelowM5 / cold.all), hoursOnBareAlbedo: aBareHours.n, mmOnBareAlbedo: r1(aBareHours.mm / nW) },
    albedoByDaysSinceSnowfall: Object.fromEntries(['0', '1', '2', '3–5', '6–10', '11–20', '>20', 'nie'].filter((k) => albBins[k]).map((k) => [k, { meltHours: albBins[k].hours, meanAlbedo: r3(albBins[k].albSum / albBins[k].hours), mmPerWinter: r1(albBins[k].mm / nW) }])),
    measuredSurface: 'nicht vorhanden: die SwissMetNet-Stundendateien von WFJ im Speicher (2010–2026) tragen die Spalten olo000h0 (langwellige Ausstrahlung), osr000h0 (reflektierte Kurzwelle) und ods000h0 leer; eine Oberflächentemperatur des Schnees steht in keiner Quelle von §4',
  };
}

function plotVerdicts(plots) {
  const pool = (k, f) => { const xs = plots.map((p) => f(p.variants[k])).filter((x) => x != null); return mean(xs); };
  const core = { decMar: pool('core', (v) => v.decMar.mae), aprJun: pool('core', (v) => v.aprJun.mae), meltOut: pool('core', (v) => v.meltOut.maeD), melt: pool('core', (v) => v.winterMeltMm) };
  const out = {};
  for (const k of Object.keys(VARIANTS)) {
    if (k === 'core') continue;
    const v = { decMar: pool(k, (x) => x.decMar.mae), aprJun: pool(k, (x) => x.aprJun.mae), meltOut: pool(k, (x) => x.meltOut.maeD), melt: pool(k, (x) => x.winterMeltMm) };
    const dMae = (core.decMar - v.decMar) / core.decMar, dMelt = (core.melt - v.melt) / core.melt;
    const breaks = v.aprJun - core.aprJun > RULE.springTolCm || v.meltOut - core.meltOut > RULE.meltOutTolD;
    const verdict = breaks ? 'breaks spring' : dMelt >= RULE.removeMelt && dMae >= RULE.removeMae ? 'removes the winter melt' : Math.abs(dMae) < RULE.noEffect && Math.abs(dMelt) < RULE.noEffectMelt ? 'no effect' : 'partial';
    out[k] = { decMarMaeCm: r1(v.decMar), aprJunMaeCm: r1(v.aprJun), meltOutMaeD: r1(v.meltOut), winterMeltMm: r1(v.melt), decMarMaeChange: r3(-dMae), winterMeltChange: r3(-dMelt), verdict };
  }
  return { core: { decMarMaeCm: r1(core.decMar), aprJunMaeCm: r1(core.aprJun), meltOutMaeD: r1(core.meltOut), winterMeltMm: r1(core.melt) }, rules: out, note: 'Mittel der Messfelder (jedes Messfeld gleich gewichtet)' };
}

// ================================================================================================================================================
if (STEP === 'glaciers') {
  mem('start');
  const gm3 = join(CACHE, 'gm3'), w26 = join(CACHE, 'gm11/w26');
  const tmpd = join(OUT, 'tmp'); mkdirSync(tmpd, { recursive: true });
  const sub = (doc, name, f) => { const p = join(tmpd, name); writeFileSync(p, JSON.stringify({ ...doc, gy: doc.gy.filter(f) })); return p; };
  const prep = (truthPath, cache) => { const { winters, fromMs, unusable } = loadWinters({ truthPath, cache }); attachRadiation(winters, (id) => J(join(cache, `rad-${id}.json`)), fromMs); return { winters, unusable }; };
  const A = prep(sub(J(join(gm3, 'truth', 'gy.json')), 'a.json', (o) => o.country === 'CH' && o.year >= 2012 && o.year <= 2025), gm3);
  mem('Winter 2012–2025 geladen');
  const B = prep(sub(J(join(w26, 'gy-2526.json')), 'b.json', (o) => o.country === 'CH' && o.year === 2026), w26);
  mem('Winter 2026 geladen');
  const recs = [...A.winters, ...B.winters].sort((a, b) => a.key.localeCompare(b.key) || a.year - b.year);
  report.unusable = [...A.unusable, ...B.unusable];
  const precip = precipRunOf(J(join(REPO, 'scripts/glacier/snow-calibration.json')), [...new Set(recs.map((r) => r.region))]);
  const bandsOf = (rec) => ({ zb: rec.b.map((x) => x.z), w: rec.b.map((x) => x.w) });
  const base = (rec, pf, V, bk = null, nBk = 0) => simulateV({ bands: bandsOf(rec), ela: rec.zMed, t: rec.t, g: rec.g, p: rec.p, zT: rec.zT, zP: rec.zMed, pf, TF: cal.TF, SRF: cal.SRF, state: emptyState(rec.b.length), pGrad: 0 }, V, Date.parse(`${rec.t0}T00:00:00Z`), bk, nBk);
  const measOf = (rec) => rec.b.reduce((s, x) => s + x.w * x.bw, 0);
  // Kontrolle A on every glacier winter at the country value
  let bad = 0;
  for (const rec of recs) {
    const F = precip.factorOf(rec.region);
    const a = simulate({ bands: bandsOf(rec), ela: rec.zMed, t: rec.t, g: rec.g, p: rec.p, zT: rec.zT, zP: rec.zMed, pf: F, TF: cal.TF, SRF: cal.SRF, state: emptyState(rec.b.length), pGrad: 0, model: 'eti' });
    const b = base(rec, F, {});
    const same = a.meltH.every((v, i) => Object.is(v, b.meltH[i])) && a.bal.every((v, i) => Object.is(v, b.bal[i])) && a.state.swe.every((v, i) => Object.is(v, b.state.swe[i])) && a.state.aS.every((v, i) => Object.is(v, b.state.aS[i])) && Object.is(a.meltSum, b.meltSum);
    if (!same) bad++;
  }
  report.controlA = { glacierWinters: recs.length, notIdentical: bad, green: bad === 0 };
  if (bad) { writeFileSync(join(OUT, 'glaciers.json'), JSON.stringify(report, null, 1)); throw new Error('STOPP: Kontrolle A nicht bitgleich'); }
  mem('Kontrolle A');
  const kStar = (rec, V) => { const want = measOf(rec); let lo = RULE.kLo, hi = RULE.kHi; const f = (k) => base(rec, k, V).balance - want; if (f(lo) > 0 || f(hi) < 0) return null; for (let i = 0; i < RULE.kIter; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  // step 4: melt split per window (country value, core)
  const BK = (mo) => (mo === 10 || mo === 11 ? 0 : mo === 12 || mo <= 3 ? 1 : 2), BKN = ['Okt–Nov', 'Dez–Mär', 'Apr–Mai'];
  const zClass = (z) => Math.floor(z / 250) * 250;
  const bandAgg = new Map(), perGlacier = new Map();
  const VK = ['core', 'noWinter', 'R1', 'R2', 'R3', 'R4'];
  const VV = { ...VARIANTS, noWinter: { noWinter: true } };
  let i = 0;
  for (const rec of recs) {
    if (i++ % 40 === 0) mem(`Gletscherwinter ${i}/${recs.length}`);
    const F = precip.factorOf(rec.region), meas = measOf(rec);
    const r = base(rec, F, {}, BK, 3);
    rec.b.forEach((x, b) => { const k = zClass(x.z); const a = bandAgg.get(k) ?? { n: 0, acc: 0, m: [0, 0, 0], w: 0 }; a.n++; a.w += x.w; a.acc += x.w * r.acc[b]; for (let j = 0; j < 3; j++) a.m[j] += x.w * r.mB[j][b]; bandAgg.set(k, a); });
    const row = { key: rec.key, name: rec.name, year: rec.year, region: rec.region, F, k: {}, err: {}, meltDecMar: r.mB[1].reduce((s, v, b) => s + rec.b[b].w * v, 0), acc: rec.b.reduce((s, x, b) => s + x.w * r.acc[b], 0) };
    for (const vk of VK) { row.k[vk] = kStar(rec, VV[vk]); row.err[vk] = base(rec, F, VV[vk]).balance - meas; }
    if (!perGlacier.has(rec.key)) perGlacier.set(rec.key, []);
    perGlacier.get(rec.key).push({ row, rec });
  }
  mem('k* fertig');
  // LOWO (leave one winter out): factor of winter Y = median k* of the glacier's other winters; error of the glacier-wide winter balance at Y
  const lowo = Object.fromEntries(VK.map((vk) => [vk, []]));
  for (const [, list] of perGlacier) {
    if (list.length < RULE.minWintersLowo) continue;
    for (const { row, rec } of list) for (const vk of VK) {
      const others = list.filter((x) => x.row.year !== row.year).map((x) => x.row.k[vk]).filter((k) => k != null);
      if (others.length < RULE.minWintersLowo - 1) continue;
      lowo[vk].push(Math.abs(base(rec, median(others), VV[vk]).balance - measOf(rec)));
    }
  }
  mem('LOWO fertig');
  const rows = [...perGlacier.values()].flat().map((x) => x.row);
  const gl = [...perGlacier.entries()].map(([key, list]) => {
    const o = { key, name: list[0].row.name, winters: list.length };
    for (const vk of VK) { const ks = list.map((x) => x.row.k[vk]).filter((k) => k != null); o[vk] = { kMed: r3(median(ks)), kCv: ks.length > 2 ? r3(sd(ks) / mean(ks)) : null, n: ks.length }; }
    o.ratioNoWinter = o.core.kMed ? r3(o.noWinter.kMed / o.core.kMed) : null;
    return o;
  });
  const sumV = (vk) => ({ s2: r1(mean(rows.map((r) => Math.abs(r.err[vk])))), bias: r1(mean(rows.map((r) => r.err[vk]))), kMedOfGlaciers: r3(median(gl.map((g) => g[vk].kMed).filter((x) => x != null))), kCvMedian: r3(median(gl.map((g) => g[vk].kCv).filter((x) => x != null))), lowoS2: r1(mean(lowo[vk])), lowoN: lowo[vk].length });
  report.glaciers = {
    glacierWinters: rows.length, glaciers: gl.length, winters: [...new Set(rows.map((r) => r.year))].sort(),
    windows: Object.fromEntries([...bandAgg.entries()].sort((a, b) => a[0] - b[0]).map(([z, a]) => [`${z}–${z + 250}`, { bandWinters: a.n, accMm: r1(a.acc / a.w), ...Object.fromEntries(BKN.map((nm, j) => [nm, { mm: r1(a.m[j] / a.w), shareOfAcc: r3(a.m[j] / a.acc) }])) }])),
    decMarMeltShareOfAccMedian: r3(median(rows.map((r) => r.meltDecMar / r.acc))),
    ratioNoWinterMedian: r3(median(gl.map((g) => g.ratioNoWinter).filter((x) => x != null))), ratioNoWinterP10P90: [r3(quant(gl.map((g) => g.ratioNoWinter).filter((x) => x != null), 0.1)), r3(quant(gl.map((g) => g.ratioNoWinter).filter((x) => x != null), 0.9))],
    byVariant: Object.fromEntries(VK.map((vk) => [vk, sumV(vk)])),
    note: 'Grundlage Landeswert, Antrieb S (Station + RhiresD), pGrad 0, Fenster t0 … t1 der Wahrheit; noWinter = Schmelze Dez–Mär abgeschaltet (nur Diagnose); k* = der für alle Stufen gleiche Faktor, der die gletscherweite Winterbilanz genau trifft; LOWO = Faktor eines Winters aus dem Median von k* der übrigen Winter desselben Gletschers (≥ 4 Winter)',
  };
  writeFileSync(join(OUT, 'glaciers-full.json'), JSON.stringify({ rows, gl }, null, 1));   // measured-derived values per glacier winter: cache only (E-GL-17)
  report.perGlacier = gl.map((g) => ({ name: g.name, winters: g.winters, kCore: g.core.kMed, kNoWinter: g.noWinter.kMed, ratioNoWinter: g.ratioNoWinter, kR4: g.R4.kMed, kCvCore: g.core.kCv, kCvR4: g.R4.kCv }));
}
function quant(a, q) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }

// ================================================================================================================================================
if (STEP === 'gatec') {
  mem('start');
  const GC = join(CACHE, 'gate-c'), FROM_MS = Date.UTC(2022, 9, 1);
  const hourIdx = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - FROM_MS) / H);
  const fillGaps = (a, maxGap = 3) => { const out = Float64Array.from(a, (v) => (v == null ? NaN : v)); for (let i = 0; i < out.length;) { if (Number.isNaN(out[i])) { let j = i; while (j < out.length && Number.isNaN(out[j])) j++; if (i > 0 && j < out.length && j - i <= maxGap) for (let k = i; k < j; k++) out[k] = out[i - 1] + ((out[j] - out[i - 1]) * (k - i + 1)) / (j - i + 1); i = j; } else i++; } return out; };
  const fc = {}; const fOf = (a) => fc[a] ??= (() => { const d = J(join(GC, `forcing-${a}.json`)); return { height: d.height, t: fillGaps(d.t), g: fillGaps(d.g), p: Float64Array.from(d.p, (v) => (v == null ? NaN : v)) }; })();
  const gy = J(join(GC, 'gy.json'));
  const rows = []; let bad = 0;
  for (const o of gy) {
    const tg = fOf(o.tg), pp = fOf(o.pp);
    const w0 = hourIdx(o.year - 1, 10, 1), w1 = hourIdx(o.year, 5, 1), s1 = hourIdx(o.year, 10, 1);
    let gT = 0, gG = 0; for (let i = w1; i < s1; i++) { if (Number.isNaN(tg.t[i])) gT++; if (Number.isNaN(tg.g[i])) gG++; }
    if (gT / (s1 - w1) > 0.15 || gG / (s1 - w1) > 0.15 || o.bs == null) continue;
    const bands = { zb: Float64Array.from(o.zb), w: Float64Array.from(o.w) }, n = o.zb.length;
    const win = simulate({ bands, ela: o.ela, t: tg.t.subarray(w0, w1), g: tg.g.subarray(w0, w1), p: pp.p.subarray(w0, w1), zT: tg.height, zP: pp.height, pf: cal.pf, TF: 0, SRF: 0, state: emptyState(n), accumulateOnly: true });
    const sArgs = { bands, ela: o.ela, t: tg.t.subarray(w1, s1), g: tg.g.subarray(w1, s1), p: pp.p.subarray(w1, s1), zT: tg.height, zP: pp.height, pf: cal.pf, TF: cal.TF, SRF: cal.SRF, state: win.state };
    const ref = simulate({ ...sArgs, model: 'eti' }), core = simulateV(sArgs, {}, FROM_MS + w1 * H);
    if (!(ref.meltH.every((v, i) => Object.is(v, core.meltH[i])) && Object.is(ref.meltSum, core.meltSum))) bad++;
    const row = { id: o.id, year: o.year, core: core.meltSum };
    for (const vk of ['R1', 'R2', 'R3', 'R4']) row[vk] = simulateV(sArgs, VARIANTS[vk], FROM_MS + w1 * H).meltSum;
    rows.push(row);
  }
  report.controlA = { glacierYears: rows.length, notIdentical: bad, green: bad === 0 };
  const tot = (k) => rows.reduce((s, r) => s + r[k], 0);
  report.gatec = { glacierYears: rows.length, summerMeltMeanMm: r1(tot('core') / rows.length), byRule: Object.fromEntries(['R1', 'R2', 'R3', 'R4'].map((k) => { const ch = tot(k) / tot('core') - 1; return [k, { meanMm: r1(tot(k) / rows.length), change: r3(ch), maxAbsChangeOneYear: r3(Math.max(...rows.map((r) => Math.abs(r[k] / r.core - 1)))), refitNeeded: Math.abs(ch) > RULE.summerTol }]; })),
    note: 'Gate C wie gate-c.mjs: Winter nur Akkumulation mit pf der Eichung, Sommer 01.05.–30.09. mit TF/SRF der Eichung unverändert; Änderung der Sommerschmelze über alle Gletscherjahre' };
}

// ================================================================================================================================================
if (STEP === 'side26') {
  mem('start');
  const winterSum = (getDay, Y) => { let s = 0, n = 0, miss = 0; for (let ms = Date.UTC(Y - 1, 9, 1); ms < Date.UTC(Y, 4, 1); ms += D) { const v = getDay(ms); n++; if (v == null || !Number.isFinite(v)) miss++; else s += v; } return { sum: s, miss, n }; };
  const ok = (x) => x.miss / x.n <= 0.05;
  const ratio = (s) => { if (![2024, 2025, 2026].every((y) => ok(s[y]))) return null; return s[2026].sum / ((s[2024].sum + s[2025].sum) / 2); };
  const ratio25 = (s) => (ok(s[2025]) && ok(s[2026]) ? s[2026].sum / s[2025].sum : null);
  // RhiresD at the glaciers (w26 file = the forcing of gm11\w26; gm3 file = the forcing of the calibration)
  const rw = J(join(CACHE, 'gm11/w26/rhires.json')), rg = J(join(CACHE, 'gm3/rhires.json'));
  const dOf = (r) => (key) => (ms) => { const i = Math.round((ms - Date.parse(r.day0 + 'T00:00:00Z')) / D); return r.points[key]?.p?.[i]; };
  const six = ['B36-26', 'C14-10', 'E23-16', 'B43-03', 'E23-18', 'B56-03'];
  const gl = Object.keys(rw.points).map((key) => {
    // 2023/24 and 2024/25 from the calibration file (gm3, from 2011), 2025/26 from gm11\w26 (from 2024-01-01: it lacks Oct–Dec 2023)
    const s = { 2024: winterSum(dOf(rg)(key), 2024), 2025: winterSum(dOf(rg)(key), 2025), 2026: winterSum(dOf(rw)(key), 2026) };
    const w25 = winterSum(dOf(rw)(key), 2025);
    return { key, six: six.includes(key), w24: r1(s[2024].sum), w25: r1(s[2025].sum), w26: r1(s[2026].sum), ratio: r3(ratio(s)), ratio25: r3(ratio25(s)), sameFile2025: w25.miss ? null : r3(s[2025].sum / w25.sum) };
  });
  // SLF plots: new-snow water (HNW) Oct–Apr
  const { by, meta } = slfAll();
  const plots = [];
  for (const [code, day] of by) {
    const s = Object.fromEntries([2024, 2025, 2026].map((Y) => [Y, winterSum((ms) => { const m = day.get(ms + D); return m == null ? null : m.HNW ?? (m.HN === 0 ? 0 : null); }, Y)]));
    const r = ratio(s), r25 = ratio25(s); if (r == null && r25 == null) continue;
    plots.push({ code, label: meta.get(code)?.label, z: meta.get(code)?.z, ratio: r3(r), ratio25: r3(r25), w24: r1(s[2024].sum), w25: r1(s[2025].sum), w26: r1(s[2026].sum) });
  }
  mem('Messfelder');
  // SwissMetNet gauges (rre150h0) Oct–Apr
  const gauges = [];
  for (const abbr of readdirNames(join(CACHE, 'gm11/w26/smn'))) {
    const s0 = smnSeries(abbr), m = smnMeta().get(abbr);
    const daily = (ms) => { let t = 0; for (let h = 0; h < 24; h++) { const i = Math.round((ms - fromAll) / H) + h; const v = s0.R[i]; if (!Number.isFinite(v)) return null; t += v; } return t; };
    const s = Object.fromEntries([2024, 2025, 2026].map((Y) => [Y, winterSum(daily, Y)]));
    const r = ratio(s), r25 = ratio25(s); if (r == null && r25 == null) continue;
    gauges.push({ abbr, name: m?.name, z: m?.z, ratio: r3(r), ratio25: r3(r25), w24: r1(s[2024].sum), w25: r1(s[2025].sum), w26: r1(s[2026].sum) });
  }
  mem('Messnetz');
  const files = readdirSyncSafe(join(CACHE, 'gm11/w26/rhiresd'));
  const q = (a) => ({ n: a.length, median: r3(median(a)), p10: r3(quant(a, 0.1)), p90: r3(quant(a, 0.9)) });
  report.side26 = {
    rhiresFiles: files, w26RhiresDays: rw.dates?.length ?? null,
    glaciersRhires: { all: q(gl.map((g) => g.ratio).filter((x) => x != null)), all25: q(gl.map((g) => g.ratio25).filter((x) => x != null)), six: gl.filter((g) => g.six) },
    sameFile2025: { note: 'Wintersumme 2024/25 am Gletscher: Eich-Datei gm3 / Datei gm11\\w26', ratio: q(gl.map((g) => g.sameFile2025).filter((x) => x != null)) },
    slfPlotsHnw: q(plots.map((p) => p.ratio).filter((x) => x != null)), slfPlotsHnw25: q(plots.map((p) => p.ratio25).filter((x) => x != null)), slfPlots: plots,
    gaugesSmn: q(gauges.map((g) => g.ratio).filter((x) => x != null)), gaugesSmn25: q(gauges.map((g) => g.ratio25).filter((x) => x != null)), gauges,
    note: 'ratio = Wintersumme Okt–Apr 2025/26 / Mittel der Winter 2023/24 und 2024/25, ratio25 = 2025/26 / 2024/25; nur Reihen mit ≤ 5 % fehlenden Tagen in jedem der drei Winter',
  };
}

writeFileSync(join(OUT, `${STEP}.json`), JSON.stringify(report, (k, v) => (v instanceof Map ? undefined : v), 1));
if (args.public) {
  const pub = JSON.parse(readFileSync(join(OUT, `${STEP}.json`), 'utf8'));
  writeFileSync(args.public, JSON.stringify(pub, null, 1));
}
console.log(JSON.stringify({ step: STEP, controlA: report.controlA, mem: memLog.at(-1) }));
