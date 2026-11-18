/**
 * verify:sea-wind-band — Phase SU (`audit/seewetter-bandbreite.md`): the band of wind and gust on /seewetter.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-wind-band.mjs
 *
 * Fixtures `scripts/lib/fixtures/sea/su-*.json` are REAL files, three spots each, cut out unchanged:
 *   su-spots-2026111712.json               the published spot file of run 17.11.2026 12 UTC (before phase SU: no quantiles)
 *   su-spots-2026111712-w2026111715.json   the wind refresh of that run as the producer of this phase writes it
 *                                          (local run 17.11. 23:57 UTC on the live cube, t1 2026111715: with quantiles)
 *   su-catalog.json                        the three spots of the live catalogue
 * plus `spots-2026100700.json` (56 spots, the first run of the line) as a second old file.
 *
 *   A  contract: the real file with quantiles passes the lock; each broken column is caught (negative controls)
 *   B  producer: quantiles = `quantiles()` of the engine's distribution, interpolated hours, encoding, the dropped gust
 *      takes its quantiles, a run without distributions writes the old shape; the wind refresh end to end and a run
 *      file put together by the producer's steps (the whole run on the CWAM excerpts: verify:sea-derive A6b); the
 *      archive carries the quantiles and names the files
 *   C  client: old files read as before (no band, no error), new ones carry the band, a broken spot loses only its band,
 *      the refresh merges from its hour on
 *   D  the share above the limit: interpolation, tails, tenths, ties, monotony; words without percent or "sicher"
 *   E  display without a browser: the hourly band of HEAD and of this tree are byte-equal on an old file; row, dots and
 *      chart runs with quantiles; classes and windows never read the quantiles
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import {
  SEA_Q_KEYS, SEA_Q_VARS, SEA_Q_PROBS, SEA_SPOT_STEPS, emptyQColumns, dropQuantilesWithoutMean, hasQuantiles, spotQuantileProblems,
  mergeSpotQuantiles, decodeSpotQuantiles, sanitizeGust, seaSpotsPath, seaSpotsWindPath, spotSeriesProblems, decodeSpotValue, SEA_SPOT_VARS,
} from '../src/sea/seaContract.ts';
import { parseSpotsDoc, mergeWindDoc, readSpotQuantiles } from '../src/sea/seaClient.ts';
import { q5At, overLimit, gustOverLimit, overOpacity, overDots, overWords, overSentence, mostText, BAND_LEGEND, BAND_NOTE, BAND_MEASURED } from '../src/sea/windBand.ts';
import { MS_TO_KN, SEA_PROFILE_BY_ID } from '../src/sea/seaProfiles.ts';
import { quantiles, quantileOf } from '../src/pointForecast/fusion/dist.ts';
import { spotWindSeries, stepQuantiles, spotBand, bandDoc, windRefresh } from './sea/sea-derive.mjs';
import { archiveSea } from './sea/sea-archive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const J = (f) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const tmp = mkdtempSync(join(tmpdir(), 'sea-wind-band-'));
const H = 3_600_000, N = SEA_SPOT_STEPS.length;

const RUN = '2026111712', T1 = '2026111715';
const OLD = J(`su-spots-${RUN}.json`), NEW = J(`su-spots-${RUN}-w${T1}.json`), CAT = J('su-catalog.json'), OLD56 = J('spots-2026100700.json');
const IDS = Object.keys(NEW.spots);
const SPO = 'st-peter-ording';

// --- A: contract on the real file -------------------------------------------------------------------------
add('A1 Fixture: echte Auffrischung mit Quantilen (3 Spots, je 2 Größen × 5 Spalten × 79 h), alte Datei ohne `q`',
  NEW.product === 'sea-spots-wind' && IDS.length === 3 && IDS.every((id) => SEA_Q_VARS.every((v) => SEA_Q_KEYS.every((k) => NEW.spots[id].q?.[v]?.[k]?.length === N)))
  && OLD.product === 'sea-spots-series' && Object.values(OLD.spots).every((s) => s.q === undefined) && Object.values(OLD56.spots).every((s) => s.q === undefined),
  `${IDS.join(', ')} · quantiles ${JSON.stringify(NEW.quantiles?.keys)}`);
const probs = IDS.flatMap((id) => spotQuantileProblems(NEW.spots[id].q, NEW.spots[id].v));
add('A2 Wertesperre: die echte Datei besteht (ganzzahlig 0–800, geordnet, 5 oder 0 je Stunde, keine Spanne ohne Mittelwert)', probs.length === 0, probs.slice(0, 2).join('; '));
let withMean = 0, withBand = 0, meanOut = 0;
for (const id of IDS) for (const v of SEA_Q_VARS) for (let i = 0; i < N; i++) {
  const m = NEW.spots[id].v[v][i];
  if (m == null) continue;
  withMean++;
  const lo = NEW.spots[id].q[v].q10[i], hi = NEW.spots[id].q[v].q90[i];
  if (lo != null) { withBand++; if (m < lo || m > hi) meanOut++; }
}
add('A3 jede Stunde mit Mittelwert trägt ihre Spanne, der Mittelwert liegt in q10–q90', withMean > 300 && withBand === withMean && meanOut === 0, `${withBand}/${withMean} · außerhalb ${meanOut}`);
const breakIt = (fn) => { const s = clone(NEW.spots[SPO]); fn(s); return spotQuantileProblems(s.q, s.v); };
const iOk = NEW.spots[SPO].v.gust.findIndex((x) => x != null);
const neg = {
  'nicht geordnet': breakIt((s) => { s.q.gust.q25[iOk] = s.q.gust.q90[iOk] + 1; }),
  'nicht ganzzahlig': breakIt((s) => { s.q.wind.q50[iOk] += 0.5; }),
  '4 von 5': breakIt((s) => { s.q.wind.q75[iOk] = null; }),
  'ohne Mittelwert': breakIt((s) => { s.v.gust[iOk] = null; }),
  'Länge': breakIt((s) => { s.q.wind.q10.pop(); }),
  'über 80 m/s': breakIt((s) => { s.q.gust.q90[iOk] = 801; }),
  'fremde Größe': breakIt((s) => { s.q.hs = s.q.wind; }),
  'kein Objekt': spotQuantileProblems('x', NEW.spots[SPO].v),
};
add('A4 Negativkontrollen: jede kaputte Spalte wird gemeldet (8 Fälle)', Object.values(neg).every((p) => p.length >= 1), Object.entries(neg).map(([k, p]) => `${k}: ${p.length}`).join(' · '));

// --- B: producer -------------------------------------------------------------------------------------------
const runMs = Date.UTC(2026, 10, 17, 12);
const dW = (mu) => ({ kind: 'truncatedNormal', mu, sigma: 1.4, lo: 0 }), dG = (mu) => ({ kind: 'normal', mu, sigma: 2.1 }), dR = { kind: 'rice', nu: 6, sigma: 1.5 };
const stepDist = (h, w, g, wd = dW(w)) => ({ validAtMs: runMs + h * H, vars: { wind: { mean: w, dist: wd, p10: null, p50: null, p90: null }, gust: { mean: g, dist: dG(g) }, windDir: { mean: 250 } } });
const stepInterp = (h, w, g, pw, pg) => ({ validAtMs: runMs + h * H, vars: { wind: { mean: w, dist: null, p10: pw[0], p50: pw[1], p90: pw[2] }, gust: { mean: g, dist: null, p10: pg[0], p50: pg[1], p90: pg[2] }, windDir: { mean: 250 } } });
const A = stepDist(5, 8, 12), B = stepDist(8, 11, 16, dR);
const qa = quantiles(A.vars.wind.dist), qb = quantiles(B.vars.wind.dist);
const lerp = (x, y, f) => x + (y - x) * f;
const I1 = stepInterp(6, 9, 13.3, [lerp(qa.q10, qb.q10, 1 / 3), lerp(qa.q50, qb.q50, 1 / 3), lerp(qa.q90, qb.q90, 1 / 3)], [9.9, 13.3, 16.8]);
const steps = [A, I1, stepInterp(7, 10, 14.7, [5, 10, 12], [11, 14.7, 18]), B, stepInterp(9, 11, 16, [8, 11, 14], [12, 16, 20])];
const sq = stepQuantiles(steps, 'wind');
add('B1 Stunde mit Verteilung: Quantile = quantiles() aus fusion/dist.ts (abgeschnittene Normal- und Rice-Verteilung), nur gelesen',
  SEA_Q_KEYS.every((k) => sq[0][k] === quantileOf(A.vars.wind.dist, SEA_Q_PROBS[k]) && sq[3][k] === quantileOf(dR, SEA_Q_PROBS[k])), JSON.stringify(sq[0]));
add('B2 interpolierte Stunde: q10/q50/q90 = p10/p50/p90 des Motors, q25/q75 linear zwischen den Nachbarn mit Verteilung, in q10…q50…q90 gehalten; ohne rechten Nachbarn keine Quantile',
  sq[1].q10 === I1.vars.wind.p10 && sq[1].q50 === I1.vars.wind.p50 && sq[1].q90 === I1.vars.wind.p90
  && Math.abs(sq[1].q25 - lerp(qa.q25, qb.q25, 1 / 3)) < 1e-12 && Math.abs(sq[1].q75 - lerp(qa.q75, qb.q75, 1 / 3)) < 1e-12
  && sq[2].q10 === 5 && sq[2].q25 >= 5 && sq[2].q25 <= 10 && sq[2].q75 >= 10 && sq[2].q75 <= 12 && sq[4] === null,
  `1/3: q25 ${sq[1].q25.toFixed(3)} · 2/3: ${JSON.stringify(sq[2])} · Rand: ${sq[4]}`);
const ser = spotWindSeries(steps, runMs);
add('B3 spotWindSeries: Quantile kodiert wie die Mittel (0,1 m/s, gerundet), nur an Stunden mit Mittelwert, Reihe besteht die Sperre',
  ser?.q && ser.q.wind.q10[5] === Math.round(qa.q10 * 10) && ser.q.gust.q90[8] === Math.round(quantileOf(B.vars.gust.dist, 0.9) * 10) && ser.q.wind.q10[4] === null && ser.q.wind.q10[9] === null
  && spotQuantileProblems(ser.q, ser).length === 0, `wind q10[5] ${ser?.q?.wind.q10[5]} · gust q90[8] ${ser?.q?.gust.q90[8]}`);
const noDist = steps.map((s) => ({ validAtMs: s.validAtMs, vars: { wind: { mean: s.vars.wind.mean, dist: null }, gust: { mean: s.vars.gust.mean, dist: null }, windDir: { mean: 250 } } }));
const serOld = spotWindSeries(noDist, runMs);
add('B4 Rechnung ohne Verteilung: Reihe in der alten Form (kein `q`); Rechnung ohne Windwert bleibt null (V-SW-18)',
  serOld && !('q' in serOld) && Object.keys(serOld).join() === 'wind,gust,windDir' && spotWindSeries(noDist.map((s) => ({ ...s, vars: {} })), runMs) === null, Object.keys(serOld ?? {}).join());
// The dropped gust: buscosun Fusion returns a gust below the wind at one hour — `sanitizeGust` drops it, its quantiles go with it.
const vDrop = { wind: ser.wind.slice(), gust: ser.gust.slice(), windDir: ser.windDir.slice() };
vDrop.gust[8] = vDrop.wind[8] - 20;
const qKeep = clone(ser.q);
const dropped = sanitizeGust(vDrop);
const ctl = spotQuantileProblems(clone(ser.q), vDrop);
const bandProblems = [];
const qDrop = spotBand(vDrop, clone(ser.q), 'x', bandProblems);
add('B5 verworfene Böe: sanitizeGust nimmt die Stunde, spotBand nimmt ihre fünf Quantile mit; Wind-Quantile der Stunde bleiben',
  dropped === 1 && vDrop.gust[8] === null && SEA_Q_KEYS.every((k) => qDrop.gust[k][8] === null && qDrop.wind[k][8] === qKeep.wind[k][8]) && qDrop.gust.q10[5] === qKeep.gust.q10[5] && bandProblems.length === 0,
  `gust[8] ${vDrop.gust[8]} · q ${SEA_Q_KEYS.map((k) => qDrop.gust[k][8]).join('/')}`);
add('B5n Negativkontrolle: ohne das Mitnehmen meldet die Sperre „ohne Mittelwert“', ctl.some((p) => /q\.gust\[8\] ohne Mittelwert/.test(p)), ctl.join('; '));
const badQ = clone(ser.q); badQ.wind.q25[5] = badQ.wind.q90[5] + 3;
const bp = [];
add('B6 Spalten, die die Sperre nicht bestehen: der Spot wird OHNE Spanne geschrieben, der Grund steht im Lauf', spotBand(ser, badQ, 'spot-x', bp) === null && /spot-x: q\.wind\[5\] nicht geordnet/.test(bp[0] ?? ''), bp[0]);

// Wind refresh end to end on a store with the real base file: stand-in for the engine = the real refresh series.
const store = join(tmp, 'store');
mkdirSync(join(store, 'static'), { recursive: true });
mkdirSync(join(store, 'spots'), { recursive: true });
writeFileSync(join(store, 'static', 'spots.json'), JSON.stringify(CAT));
writeFileSync(join(store, seaSpotsPath(RUN)), JSON.stringify(OLD));
const statusOf = () => ({ schema: 1, product: 'sea-status', updatedAt: null, killSwitch: false, field: { model: 'cwam', lastRun: RUN, lastPublishedRun: RUN, blocked: null, recent: [] }, text: {} });
writeFileSync(join(store, 'status.json'), JSON.stringify(statusOf()));
const nowMs = runMs + 11 * H + 57 * 60_000;
const windOf = (withQ) => async ({ spots }) => ({
  series: Object.fromEntries(spots.map((s) => [s.id, { wind: NEW.spots[s.id].v.wind.slice(), gust: NEW.spots[s.id].v.gust.slice(), windDir: NEW.spots[s.id].v.windDir.slice(), ...(withQ ? { q: clone(NEW.spots[s.id].q) } : {}) }])),
  failed: [], meta: { engine: 'buscosun Fusion 14', version: 14, computedAt: new Date(nowMs).toISOString(), runs: { t1: T1 } },
});
const r1 = await windRefresh({ storeDir: store, dataDir: 'x', nowMs, indexT1: T1, windImpl: windOf(true) });
const w1 = JSON.parse(readFileSync(join(store, seaSpotsWindPath(RUN, T1)), 'utf8'));
add('B7 Wind-Auffrischung schreibt `q` je Spot und die Beschreibung `quantiles`; Inhalt = echte Datei (Spalten und Quantile gleich)',
  r1.built && r1.bandSpots === 3 && w1.quantiles?.spots === 3 && IDS.every((id) => JSON.stringify(w1.spots[id]) === JSON.stringify(NEW.spots[id])), JSON.stringify({ built: r1.built, band: r1.bandSpots, from: r1.from }));
rmSync(join(store, seaSpotsWindPath(RUN, T1)));
writeFileSync(join(store, 'status.json'), JSON.stringify(statusOf()));
const r0 = await windRefresh({ storeDir: store, dataDir: 'x', nowMs, indexT1: T1, windImpl: windOf(false) });
const w0 = JSON.parse(readFileSync(join(store, seaSpotsWindPath(RUN, T1)), 'utf8'));
add('B8 Gegenprobe: dieselbe Auffrischung ohne Verteilung schreibt die alte Form (Spot nur mit `v`, kein `quantiles`)',
  r0.built && r0.bandSpots === 0 && w0.quantiles === undefined && IDS.every((id) => Object.keys(w0.spots[id]).join() === 'v'), Object.keys(w0.spots[SPO]).join());

// A run file with quantiles in the real shape: the published run file of 17.11. (waves and all 14 columns as they are)
// with the wind columns and quantiles of the real refresh, put together by the producer's own steps (`sanitizeGust`,
// `spotBand`, `bandDoc`) — the loop of `buildRun`. The whole run on the CWAM excerpts is `verify:sea-derive` A6b.
const RUN0 = '2026111800';
const DROP_H = NEW.spots[SPO].v.gust.findIndex((x, i) => x != null && i > 20);
const runFile = { ...clone(OLD), run: RUN0, runMs: Date.UTC(2026, 10, 18) };
const bpRun = [];
for (const id of IDS) {
  const v = { ...runFile.spots[id].v, wind: NEW.spots[id].v.wind.slice(), gust: NEW.spots[id].v.gust.slice(), windDir: NEW.spots[id].v.windDir.slice() };
  if (id === SPO) v.gust[DROP_H] = v.wind[DROP_H] - 30;   // gust far below the wind at one hour
  const gustDropped = sanitizeGust(v);
  const q = spotBand(v, clone(NEW.spots[id].q), id, bpRun);
  runFile.spots[id] = { cell: runFile.spots[id].cell, v, ...(q ? { q } : {}), ...(gustDropped ? { gustDropped } : {}) };
}
runFile.quantiles = bandDoc(3, bpRun);
const sp0 = runFile.spots[SPO];
add('B9 Lauf-Datei mit Spanne (echte Lauf-Datei + echte Auffrischung, Schritte des Producers): `q` neben `v`, schema 1, `v` wie bisher 14 Spalten, beide Sperren bestanden',
  runFile.schema === 1 && runFile.product === 'sea-spots-series' && runFile.quantiles.spots === 3 && bpRun.length === 0 && IDS.every((id) => Object.keys(runFile.spots[id].v).length === 14 && spotSeriesProblems(runFile.spots[id].v).length === 0 && spotQuantileProblems(runFile.spots[id].q, runFile.spots[id].v).length === 0),
  `Schlüssel ${Object.keys(sp0).join(',')}`);
add('B10 in der Lauf-Datei: Böe der Stunde verworfen (gustDropped 1) ⇒ ihre fünf Quantile null, Wind-Quantile bleiben, Nachbarstunde unberührt',
  sp0.gustDropped === 1 && sp0.v.gust[DROP_H] === null && SEA_Q_KEYS.every((k) => sp0.q.gust[k][DROP_H] === null && sp0.q.wind[k][DROP_H] === NEW.spots[SPO].q.wind[k][DROP_H] && sp0.q.gust[k][DROP_H + 1] === NEW.spots[SPO].q.gust[k][DROP_H + 1]),
  `Stunde ${DROP_H}: gust ${sp0.v.gust[DROP_H]} · q ${SEA_Q_KEYS.map((k) => sp0.q.gust[k][DROP_H]).join('/')}`);

// Archive: whole files, so the quantiles are carried; the index names the files that hold them.
const store3 = join(tmp, 'store3'), arch = join(tmp, 'archiv');
mkdirSync(join(store3, 'spots'), { recursive: true });
writeFileSync(join(store3, seaSpotsPath(RUN)), JSON.stringify(OLD));
writeFileSync(join(store3, seaSpotsWindPath(RUN, T1)), JSON.stringify(NEW));
writeFileSync(join(store3, seaSpotsPath(RUN0)), JSON.stringify(runFile));
const ar = await archiveSea({ storeDir: store3, archiveDir: arch, nowMs, poi: false });
const gz = (d, f) => JSON.parse(gunzipSync(readFileSync(join(arch, d, f))).toString('utf8'));
const idx = JSON.parse(readFileSync(join(arch, 'index.json'), 'utf8'));
add('B11 Archiv: Dateien unverändert (Quantile inbegriffen), Index nennt unter `band` genau die Dateien mit Quantilen — die alte Datei nicht',
  ar.spotsAdded === 3 && JSON.stringify(gz('2026-11-17', `spots-${RUN}-w${T1}.json.gz`)) === JSON.stringify(NEW) && JSON.stringify(gz('2026-11-18', `spots-${RUN0}.json.gz`).spots[SPO].q) === JSON.stringify(sp0.q)
  && JSON.stringify(idx.days['2026-11-17'].band) === JSON.stringify([`${RUN}-w${T1}`]) && JSON.stringify(idx.days['2026-11-18'].band) === JSON.stringify([RUN0]) && idx.days['2026-11-17'].spots.includes(RUN),
  JSON.stringify({ '17.11.': idx.days['2026-11-17'].band, '18.11.': idx.days['2026-11-18'].band }));

// --- C: client -----------------------------------------------------------------------------------------------
const decodeOld = (doc) => Object.fromEntries(Object.entries(doc.spots).filter(([, s]) => !spotSeriesProblems(s.v).length).map(([id, s]) => [id, Object.fromEntries(SEA_SPOT_VARS.map((k) => [k, s.v[k].map((q) => decodeSpotValue(k, q))]))]));
const pOld = parseSpotsDoc(OLD, RUN), pOld56 = parseSpotsDoc(OLD56, '2026100700');
add('C1 alte Dateien (17.11. und 07.10., 56 Spots): gelesen wie bisher — Reihen gleich der alten Dekodierung, kein `quantiles`, nichts abgelehnt',
  pOld && !('quantiles' in pOld) && JSON.stringify(pOld.series) === JSON.stringify(decodeOld(OLD)) && pOld.rejected.length === 0
  && pOld56 && !('quantiles' in pOld56) && Object.keys(pOld56.series).length === 56 && JSON.stringify(pOld56.series) === JSON.stringify(decodeOld(OLD56)),
  `Schlüssel ${Object.keys(pOld ?? {}).join(',')}`);
const pRun = parseSpotsDoc(runFile, RUN0);
add('C2 neue Lauf-Datei: `quantiles` je Spot in m/s (= Spalte / 10), Reihen unverändert gelesen',
  pRun?.quantiles && Object.keys(pRun.quantiles).length === 3 && pRun.quantiles[SPO].gust.q90[DROP_H + 1] === sp0.q.gust.q90[DROP_H + 1] / 10 && pRun.quantiles[SPO].gust.q90[DROP_H] === null
  && JSON.stringify(pRun.series) === JSON.stringify(decodeOld(runFile)), `gust q90 ${pRun?.quantiles?.[SPO].gust.q90[DROP_H + 1]} m/s`);
const broken = clone(runFile);
broken.spots[SPO].q.wind.q50[DROP_H] = broken.spots[SPO].q.wind.q10[DROP_H] - 1;
const pBroken = parseSpotsDoc(broken, RUN0);
add('C3 Negativkontrolle: ein Spot mit kaputter Spalte verliert NUR seine Spanne — Reihe bleibt, die anderen Spots behalten ihre',
  pBroken && !pBroken.quantiles[SPO] && Object.keys(pBroken.quantiles).length === 2 && JSON.stringify(pBroken.series[SPO]) === JSON.stringify(pRun.series[SPO]) && pBroken.rejected.length === 0,
  Object.keys(pBroken?.quantiles ?? {}).join(','));
add('C3b `q` ohne einen Wert oder kein Objekt ⇒ keine Spanne, kein Fehler', readSpotQuantiles({ wind: emptyQColumns() }, sp0.v) === null && readSpotQuantiles(42, sp0.v) === null && readSpotQuantiles(undefined, sp0.v) === null);
// Refresh onto the old base file (the live case right after the push): band from `from` on, none before.
const m1 = mergeWindDoc(pOld, { from: NEW.from, wind: NEW.wind, spots: NEW.spots });
const mq = m1.quantiles?.[SPO];
add('C4 Auffrischung mit Quantilen auf alte Lauf-Datei: Spanne ab ihrer Stunde, davor keine; Reihen wie ohne Phase SU',
  mq && mq.wind.q10[NEW.from] === NEW.spots[SPO].q.wind.q10[NEW.from] / 10 && mq.wind.q10[NEW.from - 1] === null && mq.gust.q90[78] === NEW.spots[SPO].q.gust.q90[78] / 10
  && JSON.stringify(m1.series) === JSON.stringify(mergeWindDoc(pOld, { from: NEW.from, wind: NEW.wind, spots: Object.fromEntries(IDS.map((id) => [id, { v: NEW.spots[id].v }])) }).series),
  `ab ${NEW.from}: ${mq?.wind.q10[NEW.from]} m/s`);
const m0 = mergeWindDoc(pRun, { from: 30, wind: NEW.wind, spots: Object.fromEntries(IDS.map((id) => [id, { v: { wind: runFile.spots[id].v.wind, gust: runFile.spots[id].v.gust, windDir: runFile.spots[id].v.windDir } }])) });
add('C5 Auffrischung OHNE Quantile auf Lauf-Datei mit Quantilen: ab ihrer Stunde keine Spanne (ein Wind ohne eigene Spanne zeigt keine), davor die des Laufs',
  m0.quantiles[SPO].wind.q10[30] === null && m0.quantiles[SPO].wind.q10[78] === null && m0.quantiles[SPO].wind.q10[29] === pRun.quantiles[SPO].wind.q10[29] && m0.windFrom === 30,
  `29: ${m0.quantiles[SPO].wind.q10[29]} · 30: ${m0.quantiles[SPO].wind.q10[30]}`);
const mm = mergeSpotQuantiles({ wind: { ...emptyQColumns(4), q10: [1, 2, 3, 4] } }, null, 2, 4);
add('C6 mergeSpotQuantiles rein: Eingaben unverändert, fehlende Seite = null', JSON.stringify(mm.wind.q10) === '[1,2,null,null]' && !('gust' in mm) && Object.keys(mergeSpotQuantiles(null, null, 0)).length === 0, JSON.stringify(mm.wind.q10));
add('C7 dropQuantilesWithoutMean / hasQuantiles / decode: Spalten ohne Wert zählen nicht als Spanne', !hasQuantiles({ wind: emptyQColumns() }) && !hasQuantiles(null) && hasQuantiles(NEW.spots[SPO].q)
  && decodeSpotQuantiles(NEW.spots[SPO].q).gust.q50[NEW.from] === NEW.spots[SPO].q.gust.q50[NEW.from] / 10 && dropQuantilesWithoutMean({ wind: [], gust: [] }, null) === 0);

// --- D: share above the limit ------------------------------------------------------------------------------------
const Q = { q10: 10, q25: 12, q50: 15, q75: 18, q90: 20 };
const t = (lim) => { const o = overLimit(Q, lim); return o.kind === 'tenths' ? o.tenths : o.kind; };
add('D1 lineare Interpolation zwischen den fünf Quantilen, auf Zehntel gerundet',
  t(20) === 1 && t(10) === 9 && t(15) === 5 && t(13.5) === 6 && t(12) === 8 && t(18) === 3 && t(19) === 2 && t(11) === 8,
  [20, 19, 18, 15, 13.5, 12, 11, 10].map((x) => `${x}→${t(x)}`).join(' '));
add('D2 außerhalb q10–q90 nur die Seite: über q90 „seltener als 1 von 10“, unter q10 „häufiger als 9 von 10“ — keine Zahl',
  t(20.01) === 'rare' && t(60) === 'rare' && t(9.99) === 'often' && t(0) === 'often' && overWords({ kind: 'rare' }) === 'seltener als 1 von 10 vergleichbaren Lagen' && overWords({ kind: 'often' }) === 'häufiger als 9 von 10 vergleichbaren Lagen');
const flat = { q10: 10, q25: 10, q50: 10, q75: 10, q90: 10 };
add('D3 gleiche Quantile (flaches Stück): Grenze auf dem Wert ⇒ 1 von 10, darunter „häufiger“, darüber „seltener“; halb flach ⇒ obere Wahrscheinlichkeit',
  overLimit(flat, 10).tenths === 1 && overLimit(flat, 9.9).kind === 'often' && overLimit(flat, 10.1).kind === 'rare' && overLimit({ q10: 8, q25: 10, q50: 10, q75: 14, q90: 16 }, 10).tenths === 5);
add('D4 Negativkontrolle: ungeordnete Quantile, NaN-Grenze, fehlende Spalte ⇒ kein Ergebnis', overLimit({ ...Q, q25: 21 }, 15) === null && overLimit(Q, NaN) === null && q5At(null, 0) === null && q5At({ ...emptyQColumns(2), q10: [1, 1] }, 0) === null && gustOverLimit(null, 33) === null && gustOverLimit(Q, null) === null);
let mono = true, ints = true, sides = true, n = 0;
for (const id of IDS) {
  const dq = decodeSpotQuantiles(NEW.spots[id].q).gust;
  for (let i = 0; i < N; i++) {
    const q = q5At(dq, i);
    if (!q) continue;
    let prev = Infinity;
    for (let kn = 0; kn <= 70; kn += 0.5) {
      const o = gustOverLimit(q, kn);
      const s = overOpacity(o) + (o.kind === 'often' ? 0.05 : 0) - (o.kind === 'rare' ? 0.05 : 0);
      if (s > prev + 1e-12) mono = false;
      prev = s; n++;
      if (o.kind === 'tenths' && !(Number.isInteger(o.tenths) && o.tenths >= 1 && o.tenths <= 9)) ints = false;
      if ((o.kind === 'rare') !== (kn > q.q90 * MS_TO_KN) || (o.kind === 'often') !== (kn < q.q10 * MS_TO_KN)) sides = false;
    }
  }
}
add('D5 echte Stunden × Grenzen 0–70 kn: Anteil fällt nie mit steigender Grenze, Zehntel ganz 1–9, Seiten genau außerhalb q10–q90', mono && ints && sides && n > 20000, `${n} Fälle`);
const qMs = { q10: 12 / MS_TO_KN, q25: 14 / MS_TO_KN, q50: 17 / MS_TO_KN, q75: 20 / MS_TO_KN, q90: 23 / MS_TO_KN };
add('D6 Böen in m/s gegen die Grenze in Knoten; Punkte und Deckkraft = Zehntel',
  gustOverLimit(qMs, 20).tenths === 3 && overDots(gustOverLimit(qMs, 20)) === 3 && overOpacity(gustOverLimit(qMs, 20)) === 0.3 && overDots({ kind: 'rare' }) === 0 && overOpacity({ kind: 'rare' }) === 0 && overDots({ kind: 'often' }) === 9 && overOpacity({ kind: 'often' }) === 1);
const words = [overSentence({ kind: 'tenths', tenths: 3 }, 33), overSentence({ kind: 'rare' }, 27.5), overSentence({ kind: 'often' }, 14), BAND_LEGEND, BAND_NOTE, BAND_MEASURED, mostText(qMs, 'kn'), mostText(qMs, 'bft'), mostText(qMs, 'kmh')];
add('D7 Wortlaut: „Böen über 33 kn: in etwa 3 von 10 vergleichbaren Lagen“, „meist 12–23 kn“, Legende „meist = 8 von 10 Fällen“',
  words[0] === 'Böen über 33 kn: in etwa 3 von 10 vergleichbaren Lagen' && words[1] === 'Böen über 27,5 kn: seltener als 1 von 10 vergleichbaren Lagen' && words[3] === 'meist = 8 von 10 Fällen'
  && words[6] === 'meist 12–23 kn' && mostText({ ...qMs, q90: qMs.q10 }, 'kn') === 'meist 12 kn' && mostText(null, 'kn') === null, words[6]);
const banned = /%|Prozent|\bsicher|Ampel/i;
add('D8 keine Prozentwerte, kein „sicher“ in den Texten — Gegenprobe: das Muster trifft „80 %“ und „sicher“', words.every((w) => !banned.test(w)) && banned.test('80 %') && banned.test('ist sicher') && !banned.test('Unsicherheit'), words.filter((w) => banned.test(w)).join(' | '));
add('D9 die Legende nennt die gemessene Zahl von Schritt 0 (Küstenstationen) neben dem Soll — und Schritt 0 hat eine Zahl',
  /rund 3 von 4/.test(BAND_NOTE) && (() => { const c = JSON.parse(readFileSync(join(ROOT, 'audit', 'seewetter-bandbreite', 'coverage-coast.json'), 'utf8')); const r = c.rows.filter((x) => x.set === 'coast10'); return r.length === 8 && r.every((x) => x.cov80 >= 70 && x.cov80 < 80) && c.stations.coast10.length === 14; })());

// --- E: display without a browser -----------------------------------------------------------------------------------
// The band of HEAD and the band of this tree, bundled the same way; HEAD's file resolves its imports in src/sea.
const headDir = join(tmp, 'head');
mkdirSync(headDir, { recursive: true });
writeFileSync(join(headDir, 'SeaBand.tsx'), execFileSync('git', ['show', 'HEAD:src/sea/SeaBand.tsx'], { cwd: ROOT }));
const out = join(tmp, 'bundle.mjs');
await build({
  stdin: {
    resolveDir: ROOT, loader: 'ts',
    contents: `
      export { default as SeaBand } from './src/sea/SeaBand.tsx';
      export { default as SeaBandHead } from ${JSON.stringify(join(headDir, 'SeaBand.tsx'))};
      export { default as SeaGustOdds } from './src/sea/SeaGustOdds.tsx';
      export { bandRuns } from './src/sea/SeaCharts.tsx';
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';
    `,
  },
  plugins: [{
    name: 'head-imports',
    setup(b) {
      // HEAD's SeaBand.tsx lies in a temp folder: its relative imports are the modules of src/sea, packages come from the repo.
      b.onResolve({ filter: /.*/ }, (a) => {
        if (!a.importer.startsWith(headDir)) return null;
        if (!a.path.startsWith('./')) return b.resolve(a.path, { resolveDir: ROOT, kind: a.kind });
        // A module of src/sea is a `.ts` or — since the band imports the drift arrow of `SeaCurrentPanel.tsx` (phase ST) — a `.tsx` file.
        const base = join(ROOT, 'src', 'sea', a.path.slice(2));
        return { path: existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx` };
      });
    },
  }],
  bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: out, logLevel: 'silent', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const M = await import(pathToFileURL(out).href);
const { SeaBand, SeaBandHead, SeaGustOdds, bandRuns, createElement: h, renderToStaticMarkup: html } = M;
const LIMIT = SEA_PROFILE_BY_ID.kite.limits.gustMax;
const hoursOf = (doc, withQ) => {
  const s = doc.series[SPO], q = withQ ? doc.quantiles?.[SPO] : null;
  return Array.from({ length: N - NEW.from }, (_, kk) => {
    const i = NEW.from + kk, gq = q5At(q?.gust, i), wq = q5At(q?.wind, i);
    return { t: runMs + i * H, windMs: s.wind[i], gustMs: s.gust[i], windDir: s.windDir[i], hs: s.hs[i], dir: s.dir[i], tm: s.tm[i], cls: 'passt', reason: 'x', daylight: i % 24 > 6 && i % 24 < 17, windQ: wq, gustQ: gq, over: gustOverLimit(gq, LIMIT) };
  });
};
const base = { unit: 'kn', selected: 3, onPick: () => {}, title: 'St. Peter-Ording · Kite', sub: 'x', footnote: 'y' };
const strip = (hs) => hs.map(({ windQ, gustQ, over, ...r }) => r);
const oldHours = hoursOf(pOld, false);
const headHtml = html(h(SeaBandHead, { ...base, hours: strip(oldHours) }));
const newOnOld = html(h(SeaBand, { ...base, hours: oldHours, over: null }));
add('E1 Stundenband auf einer alten Datei: Markup dieses Baums = Markup von HEAD, Byte für Byte (keine Zeile, kein Fuß, kein leeres Band)',
  headHtml.length > 5000 && newOnOld === headHtml && !/über Grenze|sw-su-cell/.test(newOnOld), `${headHtml.length} Zeichen`);
const newHours = hoursOf(m1, true);
const withRow = html(h(SeaBand, { ...base, hours: newHours, over: { limitKn: LIMIT } }));
const cells = [...withRow.matchAll(/sw-su-cell is-(tenths|rare|often)" data-over="([^"]+)">(?:<i style="opacity:([0-9.]+)"><\/i>)?/g)];
add('E1n Gegenprobe: mit Quantilen unterscheidet sich das Markup — Zeile „über Grenze“, eine Zelle je Stunde, Deckkraft = Zehntel',
  withRow !== headHtml && />über Grenze<\/th>/.test(withRow) && cells.length === newHours.length && cells.every((c, i) => { const o = newHours[i].over; return Number(c[3]) === overOpacity(o) && c[2] === String(o.kind === 'tenths' ? o.tenths : o.kind); })
  && withRow.includes(`Böen über ${LIMIT} kn`), `${cells.length} Zellen · ${[...new Set(cells.map((c) => c[2]))].join(',')}`);
const half = newHours.map((x, i) => (i % 2 ? { ...x, over: null } : x));
add('E2 Stunde ohne Spanne in der Zeile: schraffiert und benannt („keine Spanne für diese Stunde“), nie als 0 gezeichnet',
  (html(h(SeaBand, { ...base, hours: half, over: { limitKn: LIMIT } })).match(/sw-su-cell is-hatched/g) ?? []).length === Math.floor(newHours.length / 2));
const dots = (o) => html(h(SeaGustOdds, { over: o, limitKn: LIMIT, where: 'readout' }));
const on = (s) => (s.match(/class="is-on"/g) ?? []).length;
add('E3 zehn Punkte: n gefüllt; „seltener“ keiner gefüllt (erster blass), „häufiger“ neun gefüllt (zehnter umrandet); Readout und Leiste tragen Punkte und Satz, die Legende steht in der Notiz des Readouts',
  on(dots({ kind: 'tenths', tenths: 3 })) === 3 && (dots({ kind: 'tenths', tenths: 3 }).match(/<i/g) ?? []).length === 10 && on(dots({ kind: 'rare' })) === 0 && /is-less/.test(dots({ kind: 'rare' }))
  && on(dots({ kind: 'often' })) === 9 && /is-more/.test(dots({ kind: 'often' })) && dots({ kind: 'tenths', tenths: 3 }).includes(`Böen über ${LIMIT} kn: in etwa 3 von 10 vergleichbaren Lagen`)
  && html(h(SeaGustOdds, { over: { kind: 'tenths', tenths: 3 }, limitKn: LIMIT, where: 'bar' })).includes('in etwa 3 von 10') && /\{\(windMost \|\| gustMost\) && <span className="sw-su-note"> · \{BAND_NOTE\}<\/span>\}/.test(readFileSync(join(ROOT, 'src', 'sea', 'SeaReadout.tsx'), 'utf8')) && BAND_NOTE.startsWith(BAND_LEGEND));
const chartHours = newHours.map((x) => ({ t: x.t, windBand: x.windQ ? [x.windQ.q10, x.windQ.q90] : null, gustBand: x.gustQ ? [x.gustQ.q10, x.gustQ.q90] : null }));
const runsG = bandRuns(chartHours, 'gustBand'), runsOld = bandRuns(strip(oldHours), 'gustBand');
const gap = chartHours.map((x, i) => (i === 10 || i === 12 ? { ...x, gustBand: null } : x));
add('E4 Diagramm: ein Band je Lauf zusammenhängender Stunden in Knoten; Lücke wird nicht überbrückt, eine einzelne Stunde ist kein Band; alte Datei ⇒ kein Band',
  runsG.length === 1 && runsG[0].length === chartHours.length && Math.abs(runsG[0][0].hi - newHours[0].gustQ.q90 * MS_TO_KN) < 1e-9 && runsOld.length === 0
  && bandRuns(gap, 'gustBand').length === 2 && bandRuns(gap, 'gustBand')[0].length === 10 && bandRuns(gap, 'gustBand')[1][0].t === chartHours[13].t,
  `${runsG[0]?.length} Stunden · mit Lücke ${bandRuns(gap, 'gustBand').map((r) => r.length).join('+')}`);
// Classes and windows stay on the mean: the rule files never read the quantiles (control: the page does).
const src = (f) => readFileSync(join(ROOT, 'src', 'sea', f), 'utf8');
const reads = /windBand|gustQ|windQ|quantiles|q10|q90/;
add('E5 passt/knapp/außerhalb und Fenster lesen die Quantile nie (seaProfiles.ts, seaVerdicts.ts) — Gegenprobe: SeaPage.tsx liest sie',
  !reads.test(src('seaProfiles.ts')) && !reads.test(src('seaVerdicts.ts')) && reads.test(src('SeaPage.tsx')));
const page = src('SeaPage.tsx');
add('E6 je Stunde, nie für ein Fenster: „über Grenze“ wird nur aus den Quantilen EINER Stunde gerechnet (gustOverLimit(h.gustQ …)); kein Schalter um die Anzeige',
  /over: gustOverLimit\(h\.gustQ, limits\.gustMax\)/.test(page) && /gustOverLimit\(hour\?\.gustQ, limits\.gustMax\)/.test(page) && !/gustOverLimit\([^)]*win/i.test(page) && !/SEA_BAND_LIVE|\?su=|suFlag/.test(page + src('seaFlag.ts')));
const css = src('seaDeck.css');
add('E7 CSS: jede neue Klasse des Markups ist definiert; mobil nur in der Media Query der Seite (Leiste, --sw-bar-h), Desktop-Regel versteckt die Leiste',
  ['sw-odds', 'sw-odds-dots', 'sw-odds-tx', 'sw-su-cell', 'sw-kpi-most', 'is-more', 'is-less'].every((c) => css.includes(`.${c}`)) && /\.sw-odds\.is-bar \{ display: none; \}/.test(css)
  && /@media \(max-width: 767px\), \(max-width: 1439px\) and \(pointer: coarse\) \{[^@]*\.sw-root\.is-mobile\.has-odds \{ --sw-bar-h:/.test(css));

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail.slice(0, 260)}]` : ''}`);
console.log(`\nverify:sea-wind-band — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
