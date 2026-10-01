/**
 * verify-fusion-fit.mjs — headless gate of phase FL (`audit/fusion-lernphase.md` §9): the pieces the fit and the
 * feature table stand on, each with a negative control. Network-free and deterministic.
 *
 *   npm run verify:fusion-fit                       — synthetic checks only
 *   node … scripts/verify-fusion-fit.mjs --features=C:\dev\buscosun-hindcast\features\points.v1.json
 *                                                   — plus structural checks of a built feature table
 *
 * FL-AP1 blocks:
 *   1 provenance `hindcast` (E-F-23, V-FL-1): accepted with evidence, rejected without, rejected in schema 1,
 *     named in the calib text; `measured` unchanged.
 *   2 `fitCalib` with `provenance: 'hindcast'` writes hindcast entries whose document the client validator accepts;
 *     the default stays `measured`; `bootstrapDays`/`blockOf`/`lcg` are exported and deterministic.
 *   3 disk cache backend: round trip, miss, corrupt entry is a miss, sweep keep/no-keep.
 *   4 feature library: bands, tile, lake threshold, hmodel per source from a cell recipe (absent named), nearest
 *     sonde, `featureRow` flags (`noTerrain` when the DEM did not deliver), stable JSON.
 *   5 (optional) built table: schema, counts, every row banded and tiled, hmodel coverage, DEM-vs-station spread.
 * FL-AP3/AP4 blocks 8 and 9 (fit core, statistics); since FL-AP8a (fusionFit@2, V-FL-26) block 8 also checks the
 *   site × diurnal interaction columns: 8e″ recovers one true interaction from a synthetic stratum (effect size, not raw β —
 *   the site columns are collinear per region), 8k/8k′ pin the 14 products and their place after the ȳ/ŷ_m columns.
 * Phase FX block 11 (research iteration, stage 1): half-month time folds (C8 — `halfMonthOf`, ±1-half-month purge with a
 *   gap ≥ 13 d, leak negative control like 8e′ on half keys) and the scorer's calibration measures (M1/C5 — `sdOf` against a
 *   quantile grid with the latent σ as negative control, randomised PIT on the atoms, the three spread/skill forms).
 * Phase FX block 12 (stage 2): the station-climatology column μ_c with the ρ_f ridge target (C1, V-FX-5 — design byte-equal
 *   without it, recovery of β_cube = ρ / β_μc = 1 − ρ on a 24-site synthetic stratum, shuffled-μ_c and no-μ_c controls, `predict`
 *   absent without μ_c), the opened speed grid v4 with the second family `sd` and the band entries (A1, V-FX-6 — v3 reproduces
 *   fusionFit@3, edge flags, `speedEntryOf` with a band), the σ-scale write rule (V-FX-7, `scaleForVar`).
 * Phase FX-4 block 13 (E-FX-1, §6.4): the μ_c estimators of `climaProduct.ts` — the climatology's own lapse (`fitLapse`, clean and
 *   confounded sets), leave-station-out recovery on 72 synthetic stations of the real data shape (trend, kriging, idw with/without
 *   height slope) against shuffled neighbours, the leak check (the held-out station never in `used`) with a deliberately leaking
 *   control, `byVar` overrides, `muAt`/`trendVector` sets, `validateClimaProduct` with named rejections.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCalibDocument, calibOverridesFrom, calibMetaText, CALIB_BINS_H, CALIB_N_MIN, CALIB_EVIDENCE_PROVENANCES, isEvidence } from '../src/point/calibDoc.ts';
import { fitCalib, calibDocumentWith, bootstrapDays, blockOf, lcg, FIT_VERSION } from '../src/point/calibFit.ts';
import { CALIBRATION_V1 } from '../src/point/calibration.ts';
import { diskBackend } from './fusionfit/lib/diskCache.mjs';
import { band2Of, band3Of, tileOf, lakeMinBodyPx, hmodelOfPoint, nearestSonde, featureRow, stableStringify, FEATURES_SCHEMA, FEATURES_KIND } from './fusionfit/lib/featureLib.mjs';
import { LANDCOVER_SET } from '../src/point/client/landCover.ts';

const checks = [];
const add = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));

// ── Block 1: provenance hindcast in calibDoc ──────────────────────────────────
{
  const bins = CALIB_BINS_H.length;
  const entry = (provenance, n = 5000, days = 60) => ({
    value: { t2m: Array(bins).fill(1.1) }, provenance, source: 'test', updatedAt: '2026-09-23T00:00:00Z', unit: 'K',
    n: { t2m: Array(bins).fill(n) }, days: { t2m: Array(bins).fill(days) }, period: { from: '2025-09-01', to: '2026-09-21' },
    estimator: 'Momente', fitVersion: FIT_VERSION, binsH: CALIB_BINS_H,
  });
  const doc = (schema, e) => ({ schema, sigmaSys: e });
  const vh = validateCalibDocument(doc(2, entry('hindcast')));
  add('1a hindcast mit Beleg gilt', vh.accepted.includes('sigmaSys') && vh.rejected.length === 0, JSON.stringify(vh.rejected));
  const oh = calibOverridesFrom(vh);
  add('1b Provenienz steht im Beleg und im Text', oh?.meta.sigmaSys?.provenance === 'hindcast' && calibMetaText(oh?.meta.sigmaSys).startsWith('hindcast — n 30000'), calibMetaText(oh?.meta.sigmaSys));
  const vlow = validateCalibDocument(doc(2, entry('hindcast', CALIB_N_MIN.sigmaSys.n - 1)));
  add('1c hindcast ohne Beleg verworfen (Negativkontrolle)', vlow.accepted.length === 0 && vlow.rejected.some((r) => r.path === 'sigmaSys' && /n \d+ < /.test(r.why)), JSON.stringify(vlow.rejected));
  const v1 = validateCalibDocument(doc(1, entry('hindcast')));
  add('1d Schema 1 trägt kein hindcast', v1.accepted.length === 0 && v1.rejected[0]?.why === 'Schema 1 trägt kein hindcast', JSON.stringify(v1.rejected));
  const vm = validateCalibDocument(doc(2, entry('measured')));
  const om = calibOverridesFrom(vm);
  add('1e measured unverändert', vm.accepted.includes('sigmaSys') && om?.meta.sigmaSys?.provenance === 'measured' && calibMetaText(om?.meta.sigmaSys).startsWith('measured — '), calibMetaText(om?.meta.sigmaSys));
  const vs = validateCalibDocument(doc(2, entry('set')));
  add('1f set bleibt Setzung (nicht geprüft, nicht angenommen)', vs.accepted.length === 0 && vs.rejected.length === 0);
  add('1g Belegklassen-Liste', CALIB_EVIDENCE_PROVENANCES.length === 2 && isEvidence('hindcast') && isEvidence('measured') && !isEvidence('set') && !isEvidence(null));
}

// ── Block 2: fitCalib with provenance hindcast ─────────────────────────────────
{
  const rnd = lcg(7);
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const DAY = 86_400_000, START = Date.UTC(2025, 8, 1);
  const cases = [];
  for (let d = 0; d < 40; d++) {
    const day = new Date(START + d * DAY).toISOString().slice(0, 10);
    for (let p = 0; p < 40; p++) {
      for (let b = 0; b < CALIB_BINS_H.length; b++) {
        const leadH = CALIB_BINS_H[b][0] + 1, mu = 10 + 5 * gauss(), sn = 0.6, sys = 1.0 + 0.3 * b;
        cases.push({ kind: 'sigma', var: 't2m', pointId: `P${p}`, day, slotAtMs: START + d * DAY, validAtMs: START + d * DAY + leadH * 3_600_000, leadH, lat: 47 + (p % 8) * 0.9, lon: 7 + Math.floor(p / 8) * 1.7, country: 'DE', elevM: 300, mu, obs: mu + Math.sqrt(sn * sn + sys * sys) * gauss(), sigmaNonSys: sn, sigmaEns: null, flags: [], sigmaMember: Math.sqrt(sn * sn + sys * sys) });
      }
    }
  }
  const asOfMs = START + 60 * DAY;
  const rh = fitCalib(cases, { asOfMs, provenance: 'hindcast', nMin: { sigmaSys: { n: 500, days: 20 } } });
  add('2a Fit mit hindcast schreibt sigmaSys', rh.verdict === 'ok' && rh.entries.sigmaSys?.provenance === 'hindcast' && /buscosun-hindcast/.test(rh.entries.sigmaSys?.source ?? ''), rh.entries.sigmaSys?.source);
  const v = rh.entries.sigmaSys?.value?.t2m ?? [];
  add('2b Rückgewinnung σ_sys ±15 % je Bin', v.length === CALIB_BINS_H.length && v.every((x, b) => x != null && Math.abs(x / (1.0 + 0.3 * b) - 1) < 0.15), JSON.stringify(v));
  const docH = calibDocumentWith(CALIBRATION_V1, rh.entries, new Date(asOfMs).toISOString());
  const vh = validateCalibDocument(docH);
  add('2c Dokument mit hindcast-Einträgen gilt beim Client-Prüfer', vh.accepted.includes('sigmaSys') && vh.rejected.length === 0, JSON.stringify(vh.rejected));
  const rm = fitCalib(cases, { asOfMs, nMin: { sigmaSys: { n: 500, days: 20 } } });
  add('2d Voreinstellung bleibt measured', rm.entries.sigmaSys?.provenance === 'measured' && /buscosun-archiv/.test(rm.entries.sigmaSys?.source ?? ''));
  const rs = fitCalib(cases, { asOfMs, provenance: 'hindcast', source: 'Testarchiv X', nMin: { sigmaSys: { n: 500, days: 20 } } });
  add('2e source-Text überschreibbar (E-F-28)', /^Testarchiv X, Fit/.test(rs.entries.sigmaSys?.source ?? ''), rs.entries.sigmaSys?.source);
  const sig = cases.filter((c) => c.leadH === 1);
  const [lo, hi] = bootstrapDays(sig, (cs) => cs.reduce((a, c) => a + (c.obs - c.mu), 0) / cs.length);
  const [lo2, hi2] = bootstrapDays(sig, (cs) => cs.reduce((a, c) => a + (c.obs - c.mu), 0) / cs.length);
  add('2f bootstrapDays exportiert, deterministisch, Intervall umschließt 0', lo < 0 && hi > 0 && lo === lo2 && hi === hi2, `[${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
  add('2g blockOf = 1°-Kachel', blockOf({ lat: 47.9, lon: 7.1 }) === '47_7' && blockOf({ lat: 47.0, lon: 7.99 }) === '47_7' && blockOf({ lat: 46.99, lon: 8 }) === '46_8');
  const a = lcg(12345), b = lcg(12345);
  add('2h lcg exportiert und saatgleich', Array.from({ length: 5 }, () => a()).join() === Array.from({ length: 5 }, () => b()).join());
}

// ── Block 3: disk cache backend ───────────────────────────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'fusionfit-cache-'));
  try {
    const c = diskBackend(dir, { keep: true });
    const bytes = new Uint8Array([1, 2, 3, 4, 250]);
    await c.put('k/one', { bytes, storedAt: 1000 });
    const hit = await c.get('k/one');
    add('3a Rundweg put/get', hit && hit.storedAt === 1000 && hit.bytes.length === 5 && hit.bytes[4] === 250 && c.kind === 'disk');
    add('3b unbekannter Schlüssel = miss', (await c.get('k/two')) === null && c.stats.misses === 1);
    // corrupt: truncate the bin
    const { createHash } = await import('node:crypto');
    const h = createHash('sha1').update('k/one').digest('hex');
    writeFileSync(join(dir, h.slice(0, 2), `${h}.bin`), new Uint8Array([1]));
    add('3c gekürzter Eintrag = miss, kein Fehler (Negativkontrolle)', (await c.get('k/one')) === null);
    await c.put('k/one', { bytes, storedAt: 1000 });
    add('3d sweep mit keep ist wirkungslos', (await c.sweep(Date.now())) === 0 && (await c.get('k/one')) !== null);
    const c2 = diskBackend(dir, { keep: false });
    await c2.put('k/new', { bytes, storedAt: Date.now() });
    const n = await c2.sweep(5000);
    add('3e sweep ohne keep räumt nur alte Einträge', n === 1 && (await c2.get('k/one')) === null && (await c2.get('k/new')) !== null, `geräumt ${n}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ── Block 4: feature library ──────────────────────────────────────────────────
{
  add('4a Höhenbänder', band2Of(799) === 'lt800' && band2Of(800) === 'ge800' && band3Of(499) === 'lt500' && band3Of(500) === '500to1200' && band3Of(1199) === '500to1200' && band3Of(1200) === 'ge1200');
  add('4b Kachel wie blockOf', tileOf(47.9, 7.1) === blockOf({ lat: 47.9, lon: 7.1 }));
  const px = lakeMinBodyPx(37, 37);
  add('4c Seenschwelle ≥ 1 km² in Spiegelpixeln', px === Math.ceil(1e6 / (37 * 37)) && px > LANDCOVER_SET.minBodyPx && lakeMinBodyPx(0, 37) === null, `${px} px`);
  const cells = {
    points: { A: { lat: 48, lon: 11, cell: { iy: 10, ix: 20, lat: 48.0, lon: 11.0, offsetKm: 1.2 }, chunk: { cy: 0, cx: 1 }, block: [{ iy: 10, ix: 20, dy: 0, dx: 0, distKm: 1.2, centre: { lat: 48, lon: 11 } }, { iy: 11, ix: 20, dy: 1, dx: 0, distKm: 4, centre: { lat: 48.05, lon: 11 } }] } },
    cells: { '10_20': { hmodel: { icon_d2: 500, icon_eu: 520, ifs_hres: null } }, '11_20': { hmodel: { icon_d2: 530, icon_eu: 540, ifs_hres: 480 } } },
  };
  const hm = hmodelOfPoint(cells, 'A');
  add('4d hmodel je Quelle: nächste Zelle, Mittel, Spanne, Abwesende, Block', hm && hm.bySource.icon_d2 === 500 && hm.hModEffCells === 510 && hm.spreadM === 20 && hm.absent.join() === 'ifs_hres' && hm.block.length === 2 && hm.block[1].hmodel.ifs_hres === 480 && hmodelOfPoint(cells, 'B') === null, JSON.stringify(hm?.absent));
  const s = nearestSonde(48.1, 11.5, 500, [{ id: 'X', name: 'far', lat: 52, lon: 13, elev: 100 }, { id: 'Y', name: 'near', lat: 48.25, lon: 11.55, elev: 484 }]);
  add('4e nächste Radiosonde', s?.id === 'Y' && s.distKm > 15 && s.distKm < 20 && s.dElevM === -16, JSON.stringify(s));
  const point = { id: 'A', name: 'Test', country: 'DE', lat: 48, lon: 11, elev: 500, demM: 505, profile: 'DE', truth: { poi: true } };
  const terrainOk = { lat: 48, lon: 11, elevationM: 520, tpi500M: -3, tpi2000M: -20, slopeDeg: 2, aspectDeg: 180, horizonDeg: Array(8).fill(3), svf: 0.98, scales: { sampledCount: 900 }, sinkDepthM: 12, source: 'x', tiles: { near: 1, far: 1, failed: 0, bytes: 1, fromCache: 0 }, fromCache: false, timing: { totalMs: 5 } };
  const lc = { z0True: 0.1, z0Mod: { t1: 0.2 }, coverage: { point: 1 }, shares: [[40, 0.7]], radiusM: 500, source: 'wc', landCover: { v: 1, point: { cov: 1, p: [0, 0.1, 0.2, 0.7, 0, 0] }, cells: {}, dWater: { m: 300, aboveM: null, reason: 'found', bodyPx: 12 } }, fetched: { files: 1 } };
  const row = featureRow(point, { terrain: terrainOk, landCover: lc, dLake: { m: 4200, aboveM: null, reason: 'found', bodyPx: 900, minBodyPx: 731 }, urban: { byColumn: { imperv: 12, d0: 1.1, bldgH: 6 }, provenance: {}, chunk: { path: 'u' } }, hmodel: { t1: hm, t2: null, t3: null }, sonde: s });
  add('4f Zeile: Bänder, Kachel, Flags (nur hmodelAbsent), keine Laufzeitfelder', row.band2 === 'lt800' && row.band3 === '500to1200' && row.tile === '48_11' && row.flags.join() === 'hmodelAbsent:t1:ifs_hres' && row.terrain.timing === undefined && row.landCover.fetched === undefined && row.dLake.m === 4200 && row.urban.byColumn.imperv === 12, row.flags.join());
  const rowNo = featureRow({ ...point, elev: 900 }, { terrain: { ...terrainOk, scales: null, elevationM: 1050 }, landCover: null, dLake: null, urban: null, hmodel: { t1: null, t2: null, t3: null }, sonde: null });
  add('4g Negativkontrolle: ohne Skalen ⇒ noTerrain, ohne Landbedeckung/Urban benannt, DEM≠Station>100', ['noTerrain', 'noLandCover', 'noUrban', 'demVsStationGt100'].every((f) => rowNo.flags.includes(f)) && rowNo.band2 === 'ge800', rowNo.flags.join());
  const s1 = stableStringify({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } }), s2 = stableStringify({ a: { c: 2, d: [3, { y: 2, z: 1 }] }, b: 1 });
  add('4h stableStringify sortiert Schlüssel, hält Reihenfolge in Arrays', s1 === s2 && s1 === '{"a":{"c":2,"d":[3,{"y":2,"z":1}]},"b":1}', s1);
}

// ── Block 5 (optional): a built feature table ─────────────────────────────────
if (typeof flags.features === 'string') {
  if (!existsSync(flags.features)) add('5 Tabelle vorhanden', false, flags.features);
  else {
    const doc = JSON.parse(readFileSync(flags.features, 'utf8'));
    const rows = Object.values(doc.byPoint ?? {});
    add('5a Kopf: Schema, Art, Spiegel-SHA, Zellen-Commit, codeHash', doc.schema === FEATURES_SCHEMA && doc.kind === FEATURES_KIND && /^[0-9a-f]{40}$/.test(doc.wcMirrorSha ?? '') && /^[0-9a-f]{40}$/.test(doc.cellsCommit ?? '') && typeof doc.codeHash === 'string', `${rows.length} Punkte, codeHash ${doc.codeHash}`);
    add('5b jede Zeile hat id/lat/lon/elevM/Band/Kachel/flags', rows.every((r) => r.id && Number.isFinite(r.lat) && Number.isFinite(r.lon) && Number.isFinite(r.elevM) && r.band2 && r.band3 && r.tile && Array.isArray(r.flags)));
    const noT = rows.filter((r) => r.flags.includes('noTerrain'));
    add('5c Gelände an ≥ 99 % der Punkte', rows.length > 0 && noT.length <= Math.ceil(rows.length * 0.01), `noTerrain ${noT.length}: ${noT.slice(0, 5).map((r) => r.id).join(',')}`);
    const withHm = rows.filter((r) => r.hmodel?.t1?.bySource && Object.keys(r.hmodel.t1.bySource).length);
    add('5d hmodel t1 je Quelle an allen Punkten', withHm.length === rows.length, `${withHm.length}/${rows.length}`);
    const dh = rows.filter((r) => r.terrain?.elevationM != null).map((r) => Math.abs(r.terrain.elevationM - r.elevM)).sort((a, b) => a - b);
    const q = (p) => dh[Math.min(dh.length - 1, Math.floor(p * (dh.length - 1)))];
    add('5e DEM gegen Stationshöhe: p50 ≤ 15 m, p90 ≤ 120 m (Gipfelstationen erwartet)', dh.length && q(0.5) <= 15 && q(0.9) <= 120, `p50 ${q(0.5)} · p90 ${q(0.9)} · max ${dh[dh.length - 1]} m`);
    const lakes = rows.filter((r) => r.dLake?.reason === 'found');
    const ponds = rows.filter((r) => r.landCover?.landCover?.dWater?.reason === 'found');
    add('5f Seen (≥ 1 km²) seltener als Gewässer (A_min 10 px) — V-FL-6', lakes.length < ponds.length && lakes.every((r) => r.dLake.m >= (r.landCover?.landCover?.dWater?.m ?? 0)), `Seen ${lakes.length}, Gewässer ${ponds.length}`);
    const withLc = rows.filter((r) => r.landCover?.z0True != null), withU = rows.filter((r) => r.urban?.byColumn);
    add('5g Landbedeckung und Urban an ≥ 95 % der Punkte', withLc.length >= rows.length * 0.95 && withU.length >= rows.length * 0.95, `z0 ${withLc.length}, urban ${withU.length} / ${rows.length}`);
    add('5h Radiosonde je Punkt ≤ 250 km', rows.every((r) => r.sonde && r.sonde.distKm <= 250), rows.filter((r) => !r.sonde || r.sonde.distKm > 250).map((r) => r.id).slice(0, 5).join(','));
    add('5i Datei ist stabil serialisiert (Schlüssel sortiert)', stableStringify(doc, 1) === readFileSync(flags.features, 'utf8'));
  }
} else console.log('      (Block 5 übersprungen: --features=<pfad> nicht angegeben)');

// ── Block 6: the case container (FL-AP2) ─────────────────────────────────────
{
  const { openCasesWriter, readCasesSync, readCases, newRow, CASE_INDEX, CASE_COLUMNS, ROW_BYTES, FL_FLAGS, FL_SOURCES } = await import('./fusionfit/lib/casesio.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'fusionfit-cases-'));
  try {
    const path = join(dir, 't1.cas.gz');
    const w = await openCasesWriter(path, { tier: 't1', month: '2026-01', codeHash: 'test', points: ['A', 'B'] });
    const rows = [];
    for (let i = 0; i < 3; i++) {
      const r = newRow();
      r[CASE_INDEX.slotAtH] = 490000 + i; r[CASE_INDEX.validAtH] = 490001 + i; r[CASE_INDEX.leadH] = 1 + i; r[CASE_INDEX.pointIdx] = i % 2;
      r[CASE_INDEX.flags] = (i === 2 ? 0xFFFFFFFE : 5); r[CASE_INDEX.obs_t] = i === 1 ? NaN : -12.346 + i; r[CASE_INDEX.f_pr_pDry] = 0.98765; r[CASE_INDEX.c_hModEff] = 40000; r[CASE_INDEX.srcMask] = 0b1010;
      rows.push(r); await w.push(r);
    }
    const side = await w.close({ counters: { rows: 3 } });
    add('6a Sidecar: Zeilen, rowBytes, sha256', side.rows === 3 && side.rowBytes === ROW_BYTES && /^[0-9a-f]{64}$/.test(side.sha256) && existsSync(`${path}.meta.json`), `${side.rows} Zeilen · ${ROW_BYTES} B/Zeile · ${CASE_COLUMNS.length} Spalten`);
    const { header, rows: n, cols } = readCasesSync(path);
    add('6b Rundweg: Werte auf ihre Quantisierung genau, NaN bleibt NaN, u32 voll, i16 geklemmt', n === 3 && header.tier === 't1' && Math.abs(cols.obs_t[0] + 12.35) < 1e-9 && Number.isNaN(cols.obs_t[1]) && cols.flags[2] === 0xFFFFFFFE && cols.flags[0] === 5 && Math.abs(cols.f_pr_pDry[0] - 0.9877) < 1e-9 && cols.c_hModEff[0] === 32767 && cols.srcMask[1] === 10 && cols.leadH[2] === 3, `obs_t ${cols.obs_t[0]} · pDry ${cols.f_pr_pDry[0]} · hModEff ${cols.c_hModEff[0]}`);
    let streamed = 0, batches = 0;
    const st = await readCases(path, { columns: ['leadH', 'obs_t'], batchRows: 2, onBatch: (c, k) => { streamed += k; batches += 1; if (batches === 1 && c.leadH[1] !== 2) throw new Error('batch'); } });
    add('6c Streaming-Leser: Spaltenauswahl, Batches, Zeilenzahl', streamed === 3 && batches === 2 && st.rows === 3 && st.header.columns.length === CASE_COLUMNS.length);
    // torn file: valid header, 2 rows and 5 stray bytes
    const { gzipSync } = await import('node:zlib');
    const head = Buffer.from(JSON.stringify({ schema: 1, kind: 'fusionfit/cases', columns: CASE_COLUMNS, rowBytes: ROW_BYTES }), 'utf8');
    const pre = Buffer.alloc(8); pre.write('CAS1', 0, 'ascii'); pre.writeUInt32LE(head.length, 4);
    writeFileSync(join(dir, 'torn.cas.gz'), gzipSync(Buffer.concat([pre, head, Buffer.alloc(ROW_BYTES * 2 + 5)])));
    let torn = false; try { readCasesSync(join(dir, 'torn.cas.gz')); } catch (e) { torn = /trailing/.test(e.message); }
    add('6d zerrissene Datei wird erkannt (Negativkontrolle)', torn);
    add('6e Flag-Bits und Quellenordnung fest', FL_FLAGS.length <= 32 && FL_FLAGS.indexOf('day0Route') >= 0 && FL_SOURCES[0] === 'icon_d2' && FL_SOURCES.length === 8);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ── Block 8: the fit core on synthetic data (FL-AP3) ──────────────────────────
{
  const { Gram, ridge, chooseLambda, variancePenalty } = await import('../src/point/fusionFit/gram.ts');
  const { solveSpd, invSpd, nearestPd, jacobiEigen } = await import('../src/point/fusionFit/linalg.ts');
  const { buildZ, Z_DIM, Z_INDEX, windComponents, dTsfcProxy } = await import('../src/point/fusionFit/features.ts');
  const { meanDesignK, meanDesignP, interactionDesign, varianceDesign, occurrenceDesign, V_NAMES, O_NAMES, INTER_NAMES, K_MODS, P_MODS } = await import('../src/point/fusionFit/design.ts');
  const { fitStratum, minVarianceWeights, ErrorStats, designDim, designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { fitVarianceStratum, predictSigma } = await import('../src/point/fusionFit/fitVariance.ts');
  const { LogisticAcc, logisticStart, predictWet } = await import('../src/point/fusionFit/fitPrecip.ts');
  const { climaDesign, C_DIM, fitClimaMean, LagAcc, AnomalyRing } = await import('../src/point/fusionFit/fitClima.ts');
  const { AnchorAcc } = await import('../src/point/fusionFit/fitAnchor.ts');
  const { foldsOverGroups, stratumKey, parseStratum } = await import('../src/point/fusionFit/strata.ts');
  const { validateTables, newTables } = await import('../src/point/fusionFit/tables.ts');
  const rnd = lcg(99);
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  // 8a linalg: solve and inverse against a known system, eigen repair
  {
    const A = new Float64Array([4, 1, 0, 1, 3, 1, 0, 1, 2]), b = new Float64Array([1, 2, 3]);
    const s = solveSpd(A, 3, b); const x = s?.x ?? new Float64Array(3);
    const r = [4 * x[0] + x[1] - 1, x[0] + 3 * x[1] + x[2] - 2, x[1] + 2 * x[2] - 3];
    const inv = invSpd(A, 3);
    const I = inv ? [0, 1, 2].map((i) => [0, 1, 2].reduce((a, k) => a + A[i * 3 + k] * inv[k * 3 + i], 0)) : [0, 0, 0];
    const bad = new Float64Array([1, 2, 2, 1]);   // indefinite
    const rep = nearestPd(bad, 2); const ev = jacobiEigen(rep, 2).values;
    add('8a Cholesky-Lösung, Inverse, PD-Reparatur', s && s.jitter === 0 && r.every((e) => Math.abs(e) < 1e-12) && I.every((d) => Math.abs(d - 1) < 1e-12) && ev.every((e) => e > 0), `Residuen ${r.map((e) => e.toExponential(1)).join()} · Eigen ${Array.from(ev).map((e) => e.toFixed(3)).join()}`);
  }
  // 8b features: Z is finite and O(1), the decoupling proxy and wind components behave
  {
    const site = { hTrueM: 700, tpi500M: -30, tpi2000M: -120, svf: 0.85, sinkDepthM: 40, slopeDeg: 12, aspectDeg: 180, z0True: 0.2, lcShares: [0.05, 0.1, 0.5, 0.3, 0.05, 0], dWaterM: 800, dLakeM: 6000, impervPct: 12, d0M: 1.1, lonDeg: 11.5 };
    const z = buildZ(site, { dhM: -300, z0ModTier: 0.1, foehnFactor: 1, fRad: 0.6, dTsfcK: -2.5, validAtMs: Date.UTC(2026, 0, 15, 3), leadH: 30, binFromH: 25, binToH: 48 });
    const ok = z.length === Z_DIM && Array.from(z).every(Number.isFinite) && z[Z_INDEX['1']] === 1 && Math.abs(z[Z_INDEX.dh] + 0.3) < 1e-12 && Math.abs(z[Z_INDEX.slopeCosA] + 1.2) < 1e-9 && Math.abs(z[Z_INDEX.lnZ0Ratio] - Math.log(2)) < 1e-12 && Math.abs(z[Z_INDEX.leadFrac] - 5 / 23) < 1e-12 && Math.abs(z[Z_INDEX.lake] - 0.3) < 1e-12;
    const w = windComponents(10, 270);   // wind FROM west blows toward east: u = +10
    add('8b Z-Vektor: Dimension, Skalen, Exposition, Rauhigkeitsverhältnis, Vorlaufanteil; Windkomponenten; Entkopplungs-Proxy', ok && Math.abs(w.u - 10) < 1e-9 && Math.abs(w.v) < 1e-9 && Math.abs(dTsfcProxy(5, 2, 1457) - 3) < 1e-12, `dh ${z[Z_INDEX.dh]} · u ${w.u.toFixed(3)}`);
  }
  // 8c ridge with a target recovers a known linear model; chooseLambda picks a small λ when n is large
  {
    const p = 6, beta = new Float64Array([1.5, -0.8, 0.3, 0, 2.0, 0.5]);
    const groups = new Map();
    for (let m = 0; m < 6; m++) for (let r = 0; r < 3; r++) {
      const g = new Gram(p);
      for (let i = 0; i < 400; i++) {
        const x = new Float64Array(p); x[0] = 1; for (let j = 1; j < p; j++) x[j] = gauss();
        let y = 0; for (let j = 0; j < p; j++) y += beta[j] * x[j]; y += 0.5 * gauss();
        g.add(x, y, m * 30 + (i % 30)); g.addExtra('base', (y - x[4]) ** 2);
      }
      groups.set(`2026-0${m + 1}|R${r}|lt800`, g);
    }
    const all = Gram.sum(groups.values(), p);
    const r0 = ridge(all, 1e-4, variancePenalty(all), null);
    const err = Array.from(r0.beta).map((b, j) => Math.abs(b - beta[j]));
    const cv = chooseLambda(groups, p, foldsOverGroups([...groups.keys()], 'month'), [0.01, 0.1, 1, 10], variancePenalty(all), null, 'base');
    const target = new Float64Array(p); target[4] = 1;
    const rShrunk = ridge(all, 1e4, variancePenalty(all), target);
    add('8c Ridge: Rückgewinnung ±0,05, Zeitfalten-λ klein, starke Schrumpfung landet am Ziel', err.every((e) => e < 0.05) && cv && cv.lambda <= 0.1 && cv.perFold.length === 6 && cv.baseSse != null && cv.heldSse < cv.baseSse && Math.abs(rShrunk.beta[4] - 1) < 0.05 && Math.abs(rShrunk.beta[1]) < 0.05, `max|Δβ| ${Math.max(...err).toFixed(3)} · λ ${cv?.lambda} · skill ${(1 - cv.heldSse / cv.baseSse).toFixed(3)} · β₄→Ziel ${rShrunk.beta[4].toFixed(3)}`);
  }
  // 8d minimum-variance weights: two sources with error variances 1 and 4, uncorrelated ⇒ w = 0,8 / 0,2
  {
    const es = new ErrorStats(2);
    for (let i = 0; i < 20000; i++) es.add(new Float64Array([1 * gauss() + 0.5, 2 * gauss() - 0.2]));
    const { bias, cov } = es.covariance();
    const { w, effective } = minVarianceWeights(cov, 2, 0);
    add('8d Σ-Gewichte und Bias aus den Fehlerstatistiken', Math.abs(w[0] - 0.8) < 0.03 && Math.abs(w[1] - 0.2) < 0.03 && Math.abs(bias[0] - 0.5) < 0.03 && Math.abs(bias[1] + 0.2) < 0.05 && effective > 1.3 && effective < 1.6, `w ${Array.from(w).map((x) => x.toFixed(3)).join('/')} · n_eff ${effective.toFixed(2)}`);
  }
  // 8e a full stratum through fitStratum (form K) with known coefficients, plus the variance model
  {
    const site = { hTrueM: 500, tpi500M: 0, tpi2000M: 0, svf: 1, sinkDepthM: 0, slopeDeg: 0, aspectDeg: 0, z0True: 0.1, lcShares: [0, 0, 0.3, 0.7, 0, 0], dWaterM: 5000, dLakeM: null, impervPct: 5, d0M: 0.5, lonDeg: 10 };
    // since fusionFit@2 the design carries the site × diurnal interactions (V-FL-26): the synthetic sites vary per region and
    // band so those columns are neither zero nor collinear with Z, and the truth carries ONE of them (dh·hCos1 with 0,6 K/km)
    const siteOf = (rg, band) => ({
      ...site, hTrueM: band === 'ge800' ? 1200 : 400, tpi500M: band === 'ge800' ? 80 : -30, svf: band === 'ge800' ? 0.7 : 1,
      sinkDepthM: { '46_7': 0, '48_11': 40, rest: 90 }[rg], lcShares: [0, 0, { '46_7': 0.1, '48_11': 0.3, rest: 0.6 }[rg], 0.7, 0, 0], impervPct: { '46_7': 2, '48_11': 5, rest: 30 }[rg],
    });
    const B_INTER = 0.6, iInter = designNames('K', 'r1').indexOf('dh·hCos1');
    const truthOf = (yA, dh, hCos1) => 0.7 + 0.9 * yA - 1.2 * (dh / 1000) + B_INTER * (dh / 1000) * hCos1;   // intercept 0,7, slope 0,9, −1,2 K per km of Δh, +0,6 K/km · cos(diurnal)
    const vg = new Gram(V_NAMES.length);
    const pK = designDim('K', 'r1');
    const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
    // the axis maps as fit.mjs builds them: every row once per axis, keyed by that axis only (V-FL-21)
    const newAxes = () => ({ month: new Map(), region: new Map(), band: new Map() });
    const axes = newAxes(), axesShift = newAxes();
    const addAxes = (A, m, rg, band, x, y, day, baseSq) => {
      for (const [axis, k] of [['month', `${m}|*|*`], ['region', `*|${rg}|*`], ['band', `*|*|${band}`]]) {
        let g = A[axis].get(k); if (!g) { g = new Gram(pK); A[axis].set(k, g); }
        g.add(x, y, day); g.addExtra('base', baseSq);
      }
    };
    // a second copy where one month carries a foreign offset (+6 K): an honest time fold must see it as a loss, a leaky one hides it
    const SHIFT_MONTH = '2026-02';
    for (let mi = 0; mi < months.length; mi++) for (const rg of ['46_7', '48_11', 'rest']) for (const band of ['lt800', 'ge800']) {
      for (let i = 0; i < 120; i++) {
        const dh = 400 * gauss(), t = Date.UTC(2025, 9 + mi, 1 + (i % 28), i % 24);
        const z = buildZ(siteOf(rg, band), { dhM: dh, z0ModTier: 0.1, foehnFactor: 1, fRad: 0.3, dTsfcK: 0, validAtMs: t, leadH: 10, binFromH: 7, binToH: 24 });
        const yA = 8 + 6 * gauss();
        const sigDiv = 0.5 + Math.abs(gauss());
        const sigma = Math.sqrt(0.5 + 0.8 * sigDiv * sigDiv);
        const mu = truthOf(yA, dh, z[Z_INDEX.hCos1]);
        const y = mu + sigma * gauss();
        const x = meanDesignK(z, yA, dh, 0, 5);
        addAxes(axes, months[mi], rg, band, x, y, mi * 30 + (i % 28), (y - yA) ** 2);
        const ys = y + (months[mi] === SHIFT_MONTH ? 6 : 0);
        addAxes(axesShift, months[mi], rg, band, x, ys, mi * 30 + (i % 28), (ys - yA) ** 2);
        vg.add(varianceDesign(z, sigDiv, null), (y - mu) ** 2, mi * 30 + (i % 28));
      }
    }
    const e = fitStratum('K', 't', 1, 'r1', axes, null, 'base', { n: 1000, days: 20 });
    // negative control of the CV itself: the same data with the month groups merged into the region map (the 23.09. leak)
    // negative control of the CV itself on the shifted copy: honest axes see the foreign month as a loss; with the month groups
    // merged into the region and band maps (the 23.09. leak, V-FL-21) the held-out rows sit in the training and the loss vanishes
    const eHonest = fitStratum('K', 't', 1, 'r1', axesShift, null, 'base', { n: 1000, days: 20 });
    const leaky = { month: new Map([...axesShift.month, ...axesShift.region, ...axesShift.band]), region: axesShift.region, band: axesShift.band };
    const eLeaky = fitStratum('K', 't', 1, 'r1', leaky, null, 'base', { n: 1000, days: 20 });
    add('8e′ V-FL-21: die ehrliche Zeitfalte sieht den verschobenen Monat als Verlust, das Leck versteckt ihn', eHonest.cv.time && eLeaky.cv.time && eLeaky.cv.time.mse < eHonest.cv.time.mse * 0.7 && eHonest.cv.time.skill < e.cv.time.skill, `ehrlich MSE ${eHonest.cv.time?.mse.toFixed(2)} (${eHonest.status}) gegen leck ${eLeaky.cv.time?.mse.toFixed(2)} · sauber ${e.cv.time?.mse.toFixed(2)}`);
    const bDh = e.beta[Z_INDEX.dh], bY = e.beta[Z_DIM], b0 = e.beta[0];
    const v = fitVarianceStratum('K', 't', 1, 'r1', vg, { n: 1000, days: 20 });
    const sig = predictSigma(varianceDesign(buildZ(site, { dhM: 0, z0ModTier: 0.1, foehnFactor: 1, fRad: 0.3, dTsfcK: 0, validAtMs: Date.UTC(2026, 0, 1), leadH: 10, binFromH: 7, binToH: 24 }), 1, null), v);
    // the K prior pulls the ȳ coefficient toward 1 (ridge target), so 0,9 comes back as ≈ 0,95 at λ 0,1; the skill against the
    // raw member is bounded by the noise (σ² ≈ 1,8 against a systematic 0,6) ⇒ ≈ 0,2
    add('8e fitStratum K: Steigung 0,9 (±0,1, Prior zieht zu 1) und −1,2 K/km (±0,4) zurückgewonnen, Zeit/Region/Band-CV mit Gewinn > 0,05; Varianzmodell trifft σ(σ_div=1) ±15 %', e.status === 'written' && Math.abs(bY - 0.9) < 0.1 && Math.abs(bDh + 1.2) < 0.4 && e.cv.time?.skill > 0.05 && e.cv.region?.skill > 0.05 && e.cv.band?.skill > 0.05 && v.status === 'written' && Math.abs(sig / Math.sqrt(1.3) - 1) < 0.15, `β_y ${bY.toFixed(3)} · β_dh ${bDh.toFixed(3)} · β₀ ${b0.toFixed(2)} · λ ${e.lambda} · skill t/r/b ${e.cv.time?.skill.toFixed(3)}/${e.cv.region?.skill.toFixed(3)}/${e.cv.band?.skill.toFixed(3)} · σ ${sig.toFixed(3)} (wahr ${Math.sqrt(1.3).toFixed(3)})`);
    // V-FL-26: the one true interaction (dh·hCos1 = 0,6 K/km) comes back; the 13 others carry no effect. The site columns are
    // constant per region/band and all multiply the same harmonic, so the raw β of the smallest-scale one (imperv·hCos1, scale
    // 0,02…0,30) is poorly determined at zero cost — the honest measure is the effect β·sd(column), not the raw coefficient.
    const interOff = Z_DIM + K_MODS.length;
    const mom = Gram.sum(axes.month.values(), pK).moments();
    const effect = INTER_NAMES.map((n, i) => [n, Math.abs(e.beta[interOff + i]) * Math.sqrt(mom.variance[interOff + i]), e.beta[interOff + i]]);
    const spill = effect.filter(([n]) => n !== 'dh·hCos1').sort((a, b) => b[1] - a[1]);
    const trueEffect = B_INTER * Math.sqrt(mom.variance[iInter]);
    add('8e″ V-FL-26: Wechselwirkung dh·hCos1 (0,6 K/km) ±0,3 zurückgewonnen; die 13 übrigen tragen je < 0,1 K und < ½ des wahren Effekts (β·sd); names.length = beta.length', e.names.length === e.beta.length && iInter === interOff + INTER_NAMES.indexOf('dh·hCos1') && Math.abs(e.beta[iInter] - B_INTER) < 0.3 && spill[0][1] < 0.1 && spill[0][1] < trueEffect / 2, `β_inter ${e.beta[iInter].toFixed(3)} (Effekt ${(e.beta[iInter] * Math.sqrt(mom.variance[iInter])).toFixed(3)} K, wahr ${trueEffect.toFixed(3)}) · größter Rest ${spill[0][0]} β ${spill[0][2].toFixed(3)} = ${spill[0][1].toFixed(3)} K · p ${pK}`);
    const tooShort = fitStratum('K', 't', 1, 'r1', axes, null, 'base', { n: 1e9, days: 20 });
    add('8f Mindestbeleg: too-short ohne Koeffizienten (Negativkontrolle)', tooShort.status === 'too-short' && tooShort.beta.length === 0);
  }
  // 8k the interaction columns are exactly the 14 named products, in order, and both forms append them after the ȳ/ŷ_m columns
  {
    const z = new Float64Array(Z_DIM);
    for (let i = 0; i < Z_DIM; i++) z[i] = 0.5 + 0.37 * i * (i % 2 ? 1 : -1);   // distinct, non-zero, mixed signs
    const out = interactionDesign(z, new Float64Array(3 + INTER_NAMES.length), 3);
    const expected = INTER_NAMES.map((n) => { const [a, b] = n.split('·'); return z[Z_INDEX[a]] * z[Z_INDEX[b]]; });
    const exact = INTER_NAMES.every((_, i) => out[3 + i] === expected[i]) && out[0] === 0 && out[2] === 0;
    const SPEC = ['sink·hCos1', 'sink·hSin1', 'tpi500·hCos1', 'tpi500·hSin1', 'svf·hCos1', 'dh·hCos1', 'lcForest·hCos1', 'lcUrban·hCos1', 'imperv·hCos1', 'absDh·hCos1', 'dTsfc·hCos1', 'dTsfc·tpi500', 'sink·dCos1', 'dh·dCos1'];
    const xK = meanDesignK(z, 3, 250, 1.5, 4), xP = meanDesignP(z, [{ yA: 2, dhM: 100 }, { yA: 4, dhM: -300 }], 0.5);
    const tailK = Array.from(xK.slice(Z_DIM + K_MODS.length)), tailP = Array.from(xP.slice(Z_DIM + 2 * P_MODS.length));
    const namesP = designNames('P', `m${(1 | 4).toString(16)}`);
    add('8k V-FL-26: interactionDesign = die 14 benannten Produkte in Spezifikationsreihenfolge; Form K und P tragen sie NACH den ȳ/ŷ_m-Spalten, Dimension = designNames', exact && JSON.stringify(SPEC) === JSON.stringify(INTER_NAMES)
      && xK.length === designNames('K', 'r1').length && xP.length === namesP.length && namesP[Z_DIM] === 'icon_d2' && namesP[Z_DIM + 3] === 'icon_eu' && xK[Z_DIM] === 3 && xP[Z_DIM + 3] === 4
      && JSON.stringify(tailK) === JSON.stringify(expected) && JSON.stringify(tailP) === JSON.stringify(expected), `p_K ${xK.length} · p_P(2 Quellen) ${xP.length} · Produkte ${expected.slice(0, 3).map((v) => v.toFixed(3)).join('/')}`);
    // negative control: a product built from the wrong pair must differ
    add('8k′ Negativkontrolle: eine vertauschte Paarung ergibt ein anderes Produkt', z[Z_INDEX.sink] * z[Z_INDEX.hSin1] !== expected[0]);
  }
  // 8g logistic IRLS recovers a known occurrence model in three steps
  {
    const p = O_NAMES.length, bTrue = new Float64Array(p); bTrue[0] = -1.5; bTrue[1] = 2.0; bTrue[2] = 1.0;
    const rows = [];
    for (let i = 0; i < 20000; i++) { const x = new Float64Array(p); x[0] = 1; x[1] = Math.abs(gauss()); x[2] = rnd(); for (let j = 3; j < p; j++) x[j] = 0.3 * gauss(); let eta = 0; for (let j = 0; j < p; j++) eta += bTrue[j] * x[j]; const y = rnd() < 1 / (1 + Math.exp(-eta)) ? 1 : 0; rows.push([x, y]); }
    let beta = logisticStart(p, rows.reduce((a, r) => a + r[1], 0) / rows.length);
    let acc = null;
    for (let it = 0; it < 4; it++) { acc = new LogisticAcc(p); for (let i = 0; i < rows.length; i++) acc.add(rows[i][0], rows[i][1], beta, i % 40); beta = acc.solve(); }
    const d = [0, 1, 2].map((j) => Math.abs(beta[j] - bTrue[j]));
    add('8g IRLS: Auftrittsmodell nach 4 Schritten ±0,15', d.every((x) => x < 0.15), `β ${Array.from(beta).slice(0, 3).map((x) => x.toFixed(3)).join('/')} (wahr −1,5/2/1)`);
  }
  // 8h climatology: a synthetic diurnal+annual series is recovered; lag correlation of an AR(1) anomaly
  {
    const g = new Gram(C_DIM), x = new Float64Array(C_DIM);
    const lag = new LagAcc([1, 6, 24]), ring = new AnomalyRing(50);
    let a = 0;
    for (let h = 0; h < 24 * 1500; h++) {
      const ms = Date.UTC(2024, 0, 1) + h * 3_600_000;
      climaDesign(ms, 10, x);
      const mu = 9 - 8 * x[2] + 4 * (-x[6]);   // annual cosine, diurnal cosine (min at local 0 h)
      a = 0.9 * a + 0.3 * gauss();
      g.add(x, mu + a, Math.floor(h / 24));
      ring.push(h, a); lag.add(a, (l) => ring.at(h, l));
    }
    const m = fitClimaMean(g);
    const rho = lag.rho();
    add('8h Klimatologie: Jahres- und Tagesgang zurückgewonnen; AR(1)-Lagkorrelation ρ(1) ≈ 0,9, ρ(24) ≈ 0,08 (±0,06, 36 000 h)', m.beta && Math.abs(m.beta[0] - 9) < 0.1 && Math.abs(m.beta[2] + 8) < 0.15 && Math.abs(m.beta[6] + 4) < 0.15 && Math.abs(rho[0].rho - 0.9) < 0.03 && Math.abs(rho[2].rho - 0.9 ** 24) < 0.06, `β₀ ${m.beta?.[0].toFixed(2)} · dC1 ${m.beta?.[2].toFixed(2)} · hC1 ${m.beta?.[6].toFixed(2)} · ρ ${rho.map((r) => `${r.lagH}h ${r.rho}`).join(' ')}`);
  }
  // 8i anchor: an error that decays like exp(−τ/4) gives τ ≈ 4 h
  {
    const acc = new AnchorAcc();
    for (let k = 0; k < 3000; k++) { const e1 = gauss(); for (let L = 1; L <= 48; L++) acc.add(L, e1, Math.exp(-(L - 1) / 3.5) * e1 + Math.sqrt(1 - Math.exp(-2 * (L - 1) / 3.5)) * gauss()); }
    const curve = acc.curve(), tau = AnchorAcc.tauOf(curve);
    add('8i Anker: τ aus der Persistenzkurve = 5 h (ρ(τ) = e^{−(τ−1)/3,5}: ρ(4) 0,42 > 1/e > ρ(5) 0,32)', tau === 5 && Math.abs(curve[0].rho - 1) < 0.01, `τ ${tau} · ρ(2) ${curve[1].rho}`);
  }
  add('8j Tabellen-Schema: leeres Dokument gültig, falsche fitVersion verworfen', validateTables(newTables('2026-09-23T00:00:00Z')).length === 0 && validateTables({ ...newTables('x'), fitVersion: 'other' }).length === 1 && parseStratum(stratumKey('P', 't', 2, 'm1f')).cls === 'm1f');
}

// ── Block 9: the verification statistics (FL-AP4) ─────────────────────────────
{
  const { dmTest, bootstrapSkill, benjaminiHochberg, ScoreAcc, BrierAcc, EtsAcc, PairAcc, crpsByCdf, studentTCdf } = await import('./fusionfit/lib/stats.mjs');
  const { crpsNormal, crpsOf } = await import('../src/pointForecast/fusion/dist.ts');
  const rnd = lcg(5);
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  // 9a DM: a candidate that is better by 0,2 on every day is significant and negative; pure noise is not
  const better = new Map(), noise = new Map();
  for (let d = 0; d < 120; d++) { better.set(d, [-0.2 * 30 + 0.3 * gauss() * Math.sqrt(30), 30]); noise.set(d, [0.3 * gauss() * Math.sqrt(30), 30]); }
  const dmB = dmTest(better), dmN = dmTest(noise);
  add('9a Diebold–Mariano (HAC): Gewinn signifikant negativ, Rauschen nicht', dmB.stat < -3 && dmB.p < 0.01 && Math.abs(dmN.stat) < 2.5 && dmN.p > 0.01, `stat ${dmB.stat.toFixed(2)} p ${dmB.p.toExponential(1)} · Rauschen stat ${dmN.stat.toFixed(2)}`);
  // 9a' small-sample form (phase EX): Student t against table values, the HLN factor at 13 days, and the counter-check
  // that a statistic the normal form called significant is not significant at 13 days
  {
    const tOk = Math.abs(studentTCdf(2.178813, 12) - 0.975) < 1e-5 && Math.abs(studentTCdf(12.7062, 1) - 0.975) < 1e-5
      && Math.abs(studentTCdf(-2.178813, 12) - 0.025) < 1e-5 && Math.abs(studentTCdf(1.959964, 1e7) - 0.975) < 1e-5 && studentTCdf(0, 5) === 0.5;
    add("9a' Student-t: t₀,₉₇₅ bei 12 und 1 Freiheitsgraden, Symmetrie, Grenzfall Normalverteilung", tOk,
      `${studentTCdf(2.178813, 12).toFixed(6)} · ${studentTCdf(12.7062, 1).toFixed(6)} · ${studentTCdf(1.959964, 1e7).toFixed(6)}`);
    const short = new Map();
    const r13 = lcg(77);
    const g13 = () => { const u = r13() || 1e-9, v = r13(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    for (let d = 0; d < 13; d++) short.set(d, [(-0.12 + 0.2 * g13()) * 30, 30]);
    const dm13 = dmTest(short);
    add("9a' Harvey–Leybourne–Newbold: bei 13 Tagen (L = 3) Faktor 0,730, p aus t₁₂ größer als aus der Normalverteilung",
      dm13.n === 13 && dm13.lag === 3 && Math.abs(dm13.hln - Math.sqrt((13 + 1 - 8 + 12 / 13) / 13)) < 1e-12 && Math.abs(dm13.hln - 0.7298) < 1e-3
      && Math.abs(dm13.stat - dm13.statNormal * dm13.hln) < 1e-12 && dm13.p > dm13.pNormal,
      `Faktor ${dm13.hln.toFixed(4)} · stat ${dm13.statNormal.toFixed(2)} → ${dm13.stat.toFixed(2)} · p ${dm13.pNormal.toFixed(4)} → ${dm13.p.toFixed(4)}`);
    add("9a' bei 120 Tagen (L = 7) ist der Faktor 0,9375 — die Korrektur schrumpft mit der Länge der Reihe", Math.abs(dmB.hln - 0.9375) < 1e-3 && dmB.hln < 1 && Math.abs(dmB.stat) < Math.abs(dmB.statNormal), `Faktor ${dmB.hln.toFixed(4)}`);
    // counter-check: search a 13-day series the normal form calls significant (p < 0,05) and the small-sample form does not
    let found = null;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const r = lcg(seed); const g = () => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      const mm = new Map();
      for (let d = 0; d < 13; d++) mm.set(d, [(-0.1 + 0.2 * g()) * 30, 30]);
      const t = dmTest(mm);
      if (t.pNormal < 0.05 && t.p >= 0.05) found = { seed, pNormal: t.pNormal, p: t.p };
    }
    add("9a' Gegenprobe: es gibt 13-Tage-Reihen, die nur die Normalform signifikant nennt (die Korrektur ist nicht wirkungslos)", !!found,
      found ? `Seed ${found.seed}: p ${found.pNormal.toFixed(3)} → ${found.p.toFixed(3)}` : 'keine gefunden');
  }
  // 9b bootstrap over days brackets the true skill
  const bd = new Map();
  for (let d = 0; d < 80; d++) bd.set(d, [0.8 * 20 + 2 * gauss(), 1.0 * 20 + 2 * gauss()]);
  const ci = bootstrapSkill(bd);
  add('9b Block-Bootstrap: 90-%-Intervall umschließt den wahren Skill 0,2', ci && ci[0] < 0.2 && ci[1] > 0.2 && ci[1] - ci[0] < 0.2, `[${ci?.map((x) => x.toFixed(3)).join(', ')}]`);
  {
    // 9b' moving blocks (phase EX): days that hang together (one regime per 6 days) widen the interval against the same
    // days in shuffled order — a bootstrap that draws single days cannot tell the two apart
    const reg = new Map(), shuf = new Map();
    const rr = lcg(9);
    const rows = [];
    for (let d = 0; d < 90; d++) { const lvl = Math.floor(d / 6) % 2 === 0 ? 0.6 : 1.0; rows.push([lvl * 20 + 0.5 * (rr() - 0.5), 20]); }
    rows.forEach((r, d) => reg.set(d, r));
    const order = rows.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.forEach((src, d) => shuf.set(d, rows[src]));
    const ciReg = bootstrapSkill(reg), ciShuf = bootstrapSkill(shuf);
    const wReg = ciReg[1] - ciReg[0], wShuf = ciShuf[1] - ciShuf[0];
    add("9b' gleitende Blöcke: zusammenhängende Tage geben ein breiteres Intervall als dieselben Tage gemischt", wReg > 1.3 * wShuf,
      `Breite ${wReg.toFixed(3)} gegen ${wShuf.toFixed(3)}`);
  }
  // 9c Benjamini–Hochberg: monotone, the smallest p scaled by m
  const adj = benjaminiHochberg([0.001, 0.02, 0.03, 0.5, NaN]);
  add('9c Benjamini–Hochberg: monoton, p_min·m, NaN bleibt NaN', Math.abs(adj[0] - 0.004) < 1e-12 && adj[1] <= adj[2] && adj[2] <= adj[3] && Math.abs(adj[3] - 0.5) < 1e-12 && Number.isNaN(adj[4]), adj.map((x) => (Number.isNaN(x) ? 'NaN' : x.toFixed(3))).join('/'));
  // 9d accumulators: a calibrated normal forecast gives PIT ≈ flat, spread/skill ≈ 1; ETS of a perfect forecast = 1
  const sa = new ScoreAcc(), ea = new EtsAcc(), ba = new BrierAcc();
  const { pitOf } = await import('../src/pointForecast/fusion/dist.ts');
  for (let i = 0; i < 20000; i++) { const mu = 10 * gauss(), y = mu + 1.5 * gauss(); const d = { kind: 'normal', mu, sigma: 1.5 }; sa.add(mu - y, crpsNormal(mu, 1.5, y), pitOf(d, y), 1.5); ea.add(mu < 0, y < 0); const p = 1 - (1 - 0.5 * (1 + Math.tanh(-mu / 1.5))); ba.add(Math.min(1, Math.max(0, p)), y < 0 ? 1 : 0); }
  const ss = sa.summary(), es = ea.summary(), bs = ba.summary();
  add('9d ScoreAcc/EtsAcc/BrierAcc: Spread/Skill ≈ 1, PIT-Ränder ≈ 0,2, ETS > 0,7, Brier < Basisrate', Math.abs(ss.spreadSkill - 1) < 0.05 && Math.abs(ss.pitOuter - 0.2) < 0.03 && es.ets > 0.7 && bs.brier < bs.baseRate * (1 - bs.baseRate), `S/S ${ss.spreadSkill.toFixed(3)} · PIT ${ss.pitOuter.toFixed(3)} · ETS ${es.ets.toFixed(3)} · Brier ${bs.brier.toFixed(3)} (Basis ${bs.baseRate.toFixed(3)})`);
  // 9e CRPS by CDF integral equals the closed form for a normal, and the quantile form for a Rice law
  const dn = { kind: 'normal', mu: 3, sigma: 2 };
  const e1 = Math.abs(crpsByCdf(dn, 4.2, 3 - 10 * 2, 3 + 10 * 2, 400) - crpsNormal(3, 2, 4.2));
  const dr = { kind: 'rice', nu: 4, sigma: 1.5 };
  const cq = crpsOf(dr, 2.5, 512);
  const e2 = Math.abs(crpsByCdf(dr, 2.5, 0, dr.nu + 8 * dr.sigma + 1, 96) - cq) / cq;
  add('9e crpsByCdf: Normal ±0,002 gegen die geschlossene Form, Rice ±2,5 % gegen die 512-Quantil-Form', e1 < 0.002 && e2 < 0.025, `Δ Normal ${e1.toExponential(1)} · Δ Rice ${(100 * e2).toFixed(2)} %`);
  // 9f PairAcc: skill and DM in one
  const pa = new PairAcc();
  for (let d = 0; d < 60; d++) for (let i = 0; i < 20; i++) pa.add(d, 0.8 + 0.2 * gauss(), 1.0 + 0.2 * gauss());
  const ps = pa.summary();
  add('9f PairAcc: Skill ≈ 0,2, DM signifikant, Bootstrap-Intervall', ps && Math.abs(ps.skill - 0.2) < 0.03 && ps.dm.p < 0.01 && ps.ci90 && ps.ci90[0] > 0.1, `skill ${ps?.skill.toFixed(3)} p ${ps?.dm.p.toExponential(1)}`);
  // 9g the normal CDF behind the DM p-values is Φ, not Φ(z·√2) (V-FL-25: the A&S copy in the old scorer gave Φ(1,96) = 0,997)
  const { Phi } = await import('./fusionfit/lib/stats.mjs');
  add('9g Φ(1,96) = 0,975 ±1e-4 und DM-p bei |stat| = 1,96 ≈ 0,05', Math.abs(Phi(1.959964) - 0.975) < 1e-4 && Math.abs(2 * (1 - Phi(1.96)) - 0.05) < 1e-3, `Φ(1,96) ${Phi(1.959964).toFixed(5)} · p ${(2 * (1 - Phi(1.96))).toFixed(4)}`);
}

// ── Block 7 (optional): built case files — V-FF-1…4 ─────────────────────────
if (typeof flags.cases === 'string') {
  const { readCases, readCasesSync, CASE_INDEX, FL_FLAGS } = await import('./fusionfit/lib/casesio.mjs');
  const { readHindcastSlot } = await import('./hindcast/lib/slotio.mjs');
  const { readdirSync, statSync } = await import('node:fs');
  const root = typeof flags.root === 'string' ? flags.root : 'C:/dev/buscosun-hindcast';
  const months = readdirSync(flags.cases).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
  const files = [];
  for (const m of months) for (const t of ['t1', 't2', 't3']) { const p = join(flags.cases, m, `${t}.cas.gz`); if (existsSync(`${p}.meta.json`)) files.push({ month: m, tier: t, path: p, meta: JSON.parse(readFileSync(`${p}.meta.json`, 'utf8')) }); }
  add('7 Falldateien gefunden', files.length > 0, `${files.length} Dateien in ${months.length} Monaten`);
  const day0Bit = 1 << FL_FLAGS.indexOf('day0Route');
  let recN = 0, recBad = 0, rowsMeta = 0, rowsRead = 0, leak = 0, leadBad = 0, maskBad = 0, obsT = 0, fusedT = 0, total = 0, noFused = 0;
  let maeSame = 0, maeShift = 0, nPairs = 0;
  const SHIFT_H = 6;   // one hour is no control for temperature (hourly autocorrelation ≈ 0,9); six hours cross the diurnal cycle
  for (const f of files) {
    recN += f.meta.counters?.recombineN ?? 0; recBad += f.meta.counters?.recombineBad ?? 0; rowsMeta += f.meta.rows; noFused += f.meta.counters?.noFused ?? 0;
    const ring = [];   // the last SHIFT_H rows (point, slot, validAt, mu, obs)
    const r = await readCases(f.path, { columns: ['slotAtH', 'validAtH', 'leadH', 'engineLeadH', 'pointIdx', 'flags', 'srcMask', 'srcCount', 'obs_t', 'f_t_mu'], onBatch: (c, n) => {
      for (let i = 0; i < n; i++) {
        total += 1;
        if (!(c.validAtH[i] > c.slotAtH[i])) leak += 1;
        const d0 = (c.flags[i] & day0Bit) !== 0;
        if (d0 ? !(c.leadH[i] === 1 || c.leadH[i] === 2) : c.leadH[i] !== c.engineLeadH[i]) leadBad += 1;
        const m = c.srcMask[i]; let pc = 0; for (let b = 0; b < 8; b++) if (m & (1 << b)) pc += 1;
        if (m > 0 && Number.isFinite(c.srcCount[i]) && pc !== c.srcCount[i]) maskBad += 1;
        if (Number.isFinite(c.obs_t[i])) obsT += 1;
        if (Number.isFinite(c.f_t_mu[i])) fusedT += 1;
        // V-FF-3: the truth SHIFT_H hours later under this forecast must be worse than the hour itself (lead ≤ 60 h;
        // any tier — the ring holds the last rows of the same point and slot, whatever the step raster)
        const old = ring.find((o) => o.p === c.pointIdx[i] && o.s === c.slotAtH[i] && o.v + SHIFT_H === c.validAtH[i]);
        if (old && old.lead <= 60 && Number.isFinite(old.mu) && Number.isFinite(old.obs) && Number.isFinite(c.obs_t[i])) {
          maeSame += Math.abs(old.mu - old.obs); maeShift += Math.abs(old.mu - c.obs_t[i]); nPairs += 1;
        }
        ring.push({ p: c.pointIdx[i], s: c.slotAtH[i], v: c.validAtH[i], lead: c.leadH[i], mu: c.f_t_mu[i], obs: c.obs_t[i] });
        if (ring.length > SHIFT_H) ring.shift();
      }
    } });
    rowsRead += r.rows;
  }
  add('7a V-FF-1 Rekombination der Einzelquellen = Slot-Ebene (Δ/2, vor der Quantisierung)', recN > 0 && recBad === 0, `${recBad} von ${recN} daneben`);
  add('7b V-FF-4 Zeilenzahl = Sidecar, Sidecar = gelesen', rowsMeta === rowsRead && rowsRead === total, `${rowsRead} Zeilen`);
  add('7c Leck-Wächter: jede Zeile validAt > asOf; Vorlauf Tag 0 ∈ {1, 2}, sonst = Motor-Vorlauf', leak === 0 && leadBad === 0, `Leck ${leak}, Vorlauf falsch ${leadBad}`);
  add('7d Quellmaske ⇔ srcCount', maskBad === 0, `${maskBad} Zeilen`);
  add('7e Belegung: Wahrheit T ≥ 95 %, Verteilung T ≥ 99 %', obsT >= total * 0.95 && fusedT >= total * 0.99, `obs_t ${(100 * obsT / total).toFixed(1)} % · f_t ${(100 * fusedT / total).toFixed(1)} % · noFused ${noFused}`);
  add(`7f V-FF-3 Negativkontrolle: um +${SHIFT_H} h verschobene Wahrheit verschlechtert den Fehler (Vorlauf ≤ 60 h)`, nPairs > 100 && maeShift > maeSame * 1.3, `MAE ${(maeSame / Math.max(1, nPairs)).toFixed(3)} gegen verschoben ${(maeShift / Math.max(1, nPairs)).toFixed(3)} K (n ${nPairs})`);
  // V-FF-2 adapter fidelity on the first slot of the first file: row cube value == slot plane, hModEff == slot
  {
    const f = files[0];
    const { header, rows, cols } = readCasesSync(f.path, ['slotAtH', 'validAtH', 'pointIdx', 'c_t2m', 'c_hModEff', 'route']);
    const slotAtMs = cols.slotAtH[0] * 3_600_000;
    const day = new Date(slotAtMs).toISOString().slice(0, 10);
    const slotKey = `${day}/${new Date(slotAtMs).toISOString().slice(11, 13)}00.json.gz`;
    let same = 0, diff = 0, hm = 0, hmBad = 0;
    try {
      // day-0 rows carry the block start as slotAt; the slot file is the 00 UTC one
      const slot = readHindcastSlot(join(root, 'slots', cols.route[0] === 2 ? `${day}/0000.json.gz` : slotKey));
      const c = slot.cube[f.tier];
      for (let r = 0; r < rows && r < 20000; r++) {
        const id = header.points[cols.pointIdx[r]];
        const it = c.validAtMs.indexOf(cols.validAtH[r] * 3_600_000);
        const bp = c.byPoint[id]; if (!bp || it < 0) continue;
        const q = bp.planes.t2m?.[it]; if (q == null) continue;
        if (Math.abs(q * 0.01 - cols.c_t2m[r]) < 1e-9) same += 1; else diff += 1;
        // hModEff varies per step in the hindcast (the source-mix sawtooth, V-FI-104) — compare the step's own plane value
        const hq = bp.planes.hModEff?.[it];
        if (hq != null && hq !== -32768) { hm += 1; if (Math.abs(hq - cols.c_hModEff[r]) > 0.5) hmBad += 1; }
      }
    } catch (e) { diff = -1; add('7g Slot des ersten Falls lesbar', false, String(e?.message ?? e)); }
    if (diff >= 0) add('7g V-FF-2 Adapter-Treue: Zellwert der Zeile = Slot-Ebene (t2m und hModEff je Schritt)', same > 0 && diff === 0 && hmBad === 0, `${same} gleich, ${diff} anders, hModEff ${hmBad}/${hm} anders (${f.month} ${f.tier})`);
  }
} else console.log('      (Block 7 übersprungen: --cases=<verzeichnis> nicht angegeben)');

// ── Block 10: fusionFit@3 (FL-AP8c) — σ-Skala, Speed-EMOS, Hürden-Spalte, je mit Negativkontrolle ──────────────
{
  const { ScaleAcc, chooseScale, SCALE_GRID, pitOuterOf } = await import('../src/point/fusionFit/fitScale.ts');
  const { SpeedAcc, fitSpeedStratum, speedLaw, riceMoments, SPEED_GRID } = await import('../src/point/fusionFit/fitSpeed.ts');
  const { LogisticAcc, logisticStart, predictWet, withOccurrenceCv, BrierPair } = await import('../src/point/fusionFit/fitPrecip.ts');
  const { O_NAMES, occurrenceDesign, logitWetCube, varianceDesign, V_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { predictSigma } = await import('../src/point/fusionFit/fitVariance.ts');
  const { validateTables, newTables, FIT_VERSION } = await import('../src/point/fusionFit/tables.ts');
  const { predict, predictPrecip } = await import('../src/point/fusionFit/predict.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { Z_DIM, buildZ } = await import('../src/point/fusionFit/features.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { crpsCensoredNormal, crpsTruncatedNormal, crpsNormal, crpsOf, cdfOf, quantileOf, meanOf, pitOf, Phi } = await import('../src/pointForecast/fusion/dist.ts');
  const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
  const rnd = lcg(2026);
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
  // 10a σ-Skala: eine zensierte Größe [0, 100], deren latente σ 1,3× über der σ des Varianzmodells liegt ⇒ k = 1,3 out of fold; Kontrolle: σ stimmt ⇒ k ≈ 1, kein Gewinn
  {
    const run = (kTrue) => {
      const acc = new ScaleAcc();
      const crps = new Float64Array(SCALE_GRID.length), outer = new Float64Array(SCALE_GRID.length);
      for (let mi = 0; mi < months.length; mi++) for (let i = 0; i < 1500; i++) {
        const mu = 50 + 35 * gauss(), sig = 12 + 6 * Math.abs(gauss());
        const y = Math.min(100, Math.max(0, mu + kTrue * sig * gauss()));
        for (let j = 0; j < SCALE_GRID.length; j++) { const s = sig * SCALE_GRID[j]; crps[j] = crpsCensoredNormal(mu, s, 0, 100, y); outer[j] = pitOuterOf(pitOf({ kind: 'censoredNormal', mu, sigma: s, lo: 0, hi: 100 }, y)); }
        acc.add(months[mi], crps, outer);
      }
      return chooseScale(acc);
    };
    const wide = run(1.3), same = run(1.0);
    add('10a V-FL-15: σ-Skala 1,3 einer zensierten Größe out of fold zurückgewonnen (k ∈ {1,2; 1,3; 1,4}, oof-CRPS fällt ≥ 1 %, PIT-Rand fällt); Kontrolle σ×1 ⇒ k ∈ {0,9; 1; 1,1} und kein Gewinn > 0,3 %',
      wide && [1.2, 1.3, 1.4].includes(wide.k) && wide.winsOof && wide.oof.crps < wide.oof.crpsBase * 0.99 && wide.oof.pitOuter < wide.oof.pitOuterBase
      && same && [0.9, 1, 1.1].includes(same.k) && same.oof.crps > same.oof.crpsBase * 0.997,
      `weit k ${wide?.k} oof ${wide?.oof.crpsBase.toFixed(3)} → ${wide?.oof.crps.toFixed(3)} PIT ${wide?.oof.pitOuterBase.toFixed(3)} → ${wide?.oof.pitOuter.toFixed(3)} · gleich k ${same?.k} oof ${same?.oof.crpsBase.toFixed(3)} → ${same?.oof.crps.toFixed(3)} (wins ${same?.winsOof})`);
    // the scale acts through predictSigma, never through the coefficients
    const z = buildZ({ hTrueM: 500, tpi500M: 0, tpi2000M: 0, svf: 1, sinkDepthM: 0, slopeDeg: 0, aspectDeg: 0, z0True: 0.1, lcShares: [0, 0, 0.3, 0.7, 0, 0], dWaterM: 5000, dLakeM: null, impervPct: 5, d0M: 0.5, lonDeg: 10 }, { dhM: 0, z0ModTier: 0.1, foehnFactor: 1, fRad: 0.3, dTsfcK: 0, validAtMs: Date.UTC(2026, 0, 1), leadH: 10, binFromH: 7, binToH: 24 });
    const xv = varianceDesign(z, 1, null);
    const e = { c: [1, 0.5, 0, 0, 0, 0, 0, 0, 0], floor: 0.01 };
    add('10a′ predictSigma: scale 1,3 = 1,3 × ohne Skala; ohne Feld oder ≤ 0 unverändert', near(predictSigma(xv, { ...e, scale: 1.3 }), 1.3 * predictSigma(xv, e), 1e-12) && predictSigma(xv, { ...e, scale: 0 }) === predictSigma(xv, e) && near(predictSigma(xv, e), Math.sqrt(1.5), 1e-12));
  }
  // 10b Speed-EMOS: Wahrheit ~ TN(−0,6 + 1,0·E_Rice, 1,3·sd_Rice) ⇒ (a, b, c) = (−0,6, 1, 1,3) und `written`; Kontrolle: Wahrheit = Rice selbst ⇒ Gewinn < 1 %
  {
    const tnSample = (mu, sg) => { for (let k = 0; k < 100; k++) { const y = mu + sg * gauss(); if (y >= 0) return y; } return 0; };
    const run = (truthTn) => {
      const acc = new SpeedAcc();
      for (let mi = 0; mi < months.length; mi++) for (let i = 0; i < 1200; i++) {
        const nu = Math.abs(2.5 + 2.5 * gauss()), sig = 1 + 0.8 * Math.abs(gauss());
        let y;
        if (truthTn) { const { m, sd } = riceMoments(nu, sig); y = tnSample(-0.6 + 1.0 * m, 1.3 * sd); }
        else { const ang = 2 * Math.PI * rnd(); y = Math.hypot(nu * Math.cos(ang) + sig * gauss(), nu * Math.sin(ang) + sig * gauss()); }
        acc.add(months[mi], mi * 30 + (i % 28), y, nu, sig, mi >= 4);
      }
      return fitSpeedStratum('K', 4, 'r1', acc, { n: 1000, days: 20 });
    };
    const tn = run(true), rice = run(false);
    add('10b V-FL-22: (a, b, c) = (−0,6, 1,0, 1,3) einer TN-Wahrheit zurückgewonnen (a ±0,3, b ±0,1, c ∈ {1,15; 1,3; 1,5}), `written`, oof-CRPS ≥ 3 % unter der Rice; Kontrolle Rice-Wahrheit ⇒ Gewinn < 1 %',
      tn.status === 'written' && Math.abs(tn.a + 0.6) <= 0.3 && Math.abs(tn.b - 1) <= 0.1 && [1.15, 1.3, 1.5].includes(tn.c) && tn.cv.oof.crps < tn.cv.oof.crpsRice * 0.97
      && rice.cv.oof.crps > rice.cv.oof.crpsRice * 0.99,
      `TN a ${tn.a} b ${tn.b} c ${tn.c} ${tn.status} oof ${tn.cv.oof.crpsRice.toFixed(4)} → ${tn.cv.oof.crps.toFixed(4)} · Rice-Wahrheit a ${rice.a} b ${rice.b} c ${rice.c} ${rice.status} oof ${rice.cv.oof.crpsRice.toFixed(4)} → ${rice.cv.oof.crps.toFixed(4)}`);
    add('10b′ LN-Vergleich auf der Teilstichprobe: da (n ≥ 2 000), auf denselben Zeilen TN und Rice beziffert; bei TN-Wahrheit liegt die LN über der TN', tn.ln && tn.ln.n >= 2000 && tn.ln.crps > tn.ln.crpsTn && Number.isFinite(tn.ln.b), tn.ln ? `LN ${tn.ln.crps.toFixed(4)} TN ${tn.ln.crpsTn.toFixed(4)} Rice ${tn.ln.crpsRice.toFixed(4)} n ${tn.ln.n} a ${tn.ln.a} b ${tn.ln.b}` : 'kein ln');
    const law = speedLaw({ nu: 4, sigma: 1.5 }, { a: -0.6, b: 1, c: 1.3 }), mo = riceMoments(4, 1.5);
    add('10b″ speedLaw: μ = a + b·E_Rice, σ = c·sd_Rice, lo 0; Gitter 75 Tripel mit (0, 1, 1) darunter', law.kind === 'truncatedNormal' && near(law.mu, -0.6 + mo.m, 1e-12) && near(law.sigma, 1.3 * mo.sd, 1e-12) && law.lo === 0 && SPEED_GRID.length === 75 && SPEED_GRID.some(([a, b, c]) => a === 0 && b === 1 && c === 1));
  }
  // 10c Hürde: Spalte logit(1 − pDry_Cube) mit wahrem β 0,8 (Intercept −0,3) per IRLS zurückgewonnen; die CV-Regel: Gewinn ⇒ written, keiner oder kein Beleg ⇒ no-skill
  {
    const p = O_NAMES.length;
    add('10c O_NAMES: 11 Spalten, die letzte logitWetCube; logit(0,5) = 0, Klemmung symmetrisch, Design trägt sie an Position 10', p === 11 && O_NAMES[10] === 'logitWetCube' && logitWetCube(0.5) === 0 && near(logitWetCube(0) + logitWetCube(1), 0, 1e-12) && logitWetCube(0.2) > 0
      && occurrenceDesign(new Float64Array(Z_DIM), 1, 0.5, 0.2, 0.3)[10] === logitWetCube(0.3));
    const bTrue = new Float64Array(p); bTrue[0] = -0.3; bTrue[10] = 0.8;
    const rows = [];
    for (let i = 0; i < 20000; i++) { const x = new Float64Array(p); x[0] = 1; x[1] = Math.abs(gauss()); x[2] = rnd(); for (let j = 3; j < 10; j++) x[j] = 0.3 * gauss(); x[10] = logitWetCube(Math.min(0.999, Math.max(0.001, 0.5 + 0.25 * gauss()))); let eta = 0; for (let j = 0; j < p; j++) eta += bTrue[j] * x[j]; rows.push([x, rnd() < 1 / (1 + Math.exp(-eta)) ? 1 : 0]); }
    let beta = logisticStart(p, rows.reduce((a, r) => a + r[1], 0) / rows.length);
    for (let it = 0; it < 4; it++) { const acc = new LogisticAcc(p); for (let i = 0; i < rows.length; i++) acc.add(rows[i][0], rows[i][1], beta, i % 40); beta = acc.solve(); }
    add('10c′ IRLS gewinnt β_logitWetCube 0,8 (±0,1) und den Intercept −0,3 (±0,1) zurück, die übrigen Spalten < 0,1 (Effekt β·sd)', Math.abs(beta[10] - 0.8) < 0.1 && Math.abs(beta[0] + 0.3) < 0.1 && [1, 2, 3, 4, 5, 6, 7, 8, 9].every((j) => Math.abs(beta[j]) * (j === 1 ? 0.6 : j === 2 ? 0.29 : 0.3) < 0.1), `β₀ ${beta[0].toFixed(3)} β₁₀ ${beta[10].toFixed(3)}`);
    const e = { form: 'K', var: 'precip', bin: 1, cls: 'r1', names: O_NAMES, beta: Array.from(beta), n: 20000, days: 60, wetShare: 0.4, iterations: 3, llPerRow: -0.6, status: 'written' };
    const bp = new BrierPair(); bp.add(0.3, 0.5, 0); bp.add(0.8, 0.5, 1);
    const win = withOccurrenceCv(e, { brier: 0.10, brierCube: 0.12, skill: null, n: 100, folds: 8 }, { '2026-01': Array.from(beta) });
    const lose = withOccurrenceCv(e, { brier: 0.12, brierCube: 0.11, skill: null, n: 100, folds: 8 }, null);
    const none = withOccurrenceCv(e, null, null);
    add('10c″ CV-Regel der Hürde: Brier < Cube ⇒ written mit Skill 1 − 0,10/0,12; Brier ≥ Cube ⇒ no-skill; kein Beleg ⇒ no-skill; BrierPair summiert (0,09+0,04 gegen 0,25+0,25)',
      win.status === 'written' && near(win.cv.skill, 1 - 0.1 / 0.12, 1e-12) && win.folds['2026-01'].length === p && lose.status === 'no-skill' && none.status === 'no-skill' && none.cv === null && near(bp.sse, 0.13, 1e-12) && near(bp.sseCube, 0.5, 1e-12) && bp.n === 2);
    // V-FL-36: the in-memory fit — reservoir thinning to the cap, damped Newton converges and recovers the same β, exact fold CV
    // beats the cube where the truth carries more than the cube column; a shuffled truth (no signal) ends `no-skill`
    const { HurdleRows, irlsDamped, fitOccurrenceRows } = await import('../src/point/fusionFit/fitPrecip.ts');
    const { timeFolds } = await import('../src/point/fusionFit/strata.ts');
    const monthsH = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
    const wsAll = rows.reduce((a, r) => a + r[1], 0) / rows.length;
    const mk = (shuffle) => {
      const r = new HurdleRows(p, 12000);
      for (let i = 0; i < rows.length; i++) { const [x, y] = rows[i]; const yy = shuffle ? rows[(i * 7919 + 13) % rows.length][1] : y; r.add(x, yy, monthsH[Math.floor(i / 2500)], shuffle ? 1 - wsAll : 1 - 1 / (1 + Math.exp(-x[10])), Math.floor(i / 50)); }
      return r;
    };
    const rr = mk(false);
    const all = new Uint8Array(rr.n).fill(1);
    const fitD = irlsDamped(rr, all, logisticStart(p, 0.45));
    const eR = fitOccurrenceRows('K', 1, 'r1', rr, timeFolds(monthsH), { n: 1000, days: 20 });
    const eS = fitOccurrenceRows('K', 1, 'r1', mk(true), timeFolds(monthsH), { n: 1000, days: 20 });
    add('10c‴ V-FL-36: Reservoir-Stichprobe: 12 000 von 20 000 Zeilen, alle 8 Monate anteilig (je 1 500 ± 300); gedämpftes Newton konvergiert (≤ 15 Schritte) auf β_logitWetCube 0,8 ±0,15 / β₀ −0,3 ±0,15; fitOccurrenceRows: 8 Falten, oof Brier < Cube ⇒ written; gemischte Wahrheit gegen die konstante Nässerate ⇒ no-skill',
      rr.n === 12000 && rr.offered === 20000 && rr.months.length === 8 && monthsH.every((m) => { const mi = rr.months.indexOf(m); let c = 0; for (let i = 0; i < rr.n; i++) if (rr.monthIdx[i] === mi) c += 1; return Math.abs(c - 1500) <= 300; }) && fitD.converged && fitD.iterations <= 15 && Math.abs(fitD.beta[10] - 0.8) < 0.15 && Math.abs(fitD.beta[0] + 0.3) < 0.15
      && eR.status === 'written' && eR.cv && eR.cv.folds === 8 && eR.cv.brier < eR.cv.brierCube && Object.keys(eR.folds).length === 8 && eS.status === 'no-skill' && eS.cv && eS.cv.brier >= eS.cv.brierCube,
      `conv ${fitD.converged} folds ${eR.cv?.folds}/${Object.keys(eR.folds ?? {}).length} status ${eR.status} · n ${rr.n}/${rr.offered} · ${fitD.iterations} Schritte β₁₀ ${fitD.beta[10].toFixed(3)} β₀ ${fitD.beta[0].toFixed(3)} · oof ${eR.cv?.brier} gegen ${eR.cv?.brierCube} (Skill ${eR.cv?.skill?.toFixed(3)}) · gemischt ${eS.cv?.brier} gegen ${eS.cv?.brierCube} ${eS.status}`);
  }
  // 10d Tabellen: @2 fällt mit benannter Meldung, @3 gilt; Speed-Eintrag mit c ≤ 0 und Hürde falscher Länge fallen
  {
    const t3 = newTables('2026-09-25T00:00:00Z');
    const t2 = { ...t3, fitVersion: 'fusionFit@2', design: { ...t3.design, occurrence: t3.design.occurrence.slice(0, 10), speed: undefined } };
    const e2 = validateTables(t2);
    const bad = { ...t3, speed: { 'K|ws|0|r1': { form: 'K', var: 'ws', bin: 0, cls: 'r1', names: ['a', 'b', 'c'], family: 'truncatedNormal', a: -0.6, b: 1, c: 0, n: 9000, days: 60, status: 'written' } }, occurrence: { 'K|precip|0|r1': { form: 'K', var: 'precip', bin: 0, cls: 'r1', names: O_NAMES, beta: new Array(10).fill(0), n: 9000, days: 60, wetShare: 0.3, iterations: 3, llPerRow: -0.5, status: 'written' } } };
    add('10d validateTables: fusionFit@2 ⇒ `fitVersion fusionFit@2 ≠ fusionFit@3` + fehlende design.occurrence/speed; @3 leer gültig; c ≤ 0 und β-Länge 10 fallen', FIT_VERSION === 'fusionFit@3' && e2.includes('fitVersion fusionFit@2 ≠ fusionFit@3') && e2.some((x) => x.startsWith('design.occurrence')) && e2.some((x) => x.startsWith('design.speed')) && validateTables(t3).length === 0
      && validateTables(bad).some((x) => x.startsWith('speed K|ws|0|r1')) && validateTables(bad).some((x) => x.startsWith('occurrence K|precip|0|r1')), e2.join('; '));
  }
  // 10e predict: Speed-Gesetz greift nur mit Eintrag, die Böe behält den Rice-Boden, die Hürde braucht pDry_Cube und ist im Identitätsfall exakt der Cube
  {
    const T = newTables('2026-09-25T00:00:00Z');
    const names = designNames('K', 'r1');
    const site = { hTrueM: 500, tpi500M: 0, tpi2000M: 0, svf: 1, sinkDepthM: 0, slopeDeg: 0, aspectDeg: 0, z0True: 0.1, lcShares: [0, 0, 0.3, 0.7, 0, 0], dWaterM: 5000, dLakeM: null, impervPct: 5, d0M: 0.5, lonDeg: 10 };
    const z = buildZ(site, { dhM: 0, z0ModTier: 0.1, foehnFactor: 1, fRad: 0.3, dTsfcK: 0, validAtMs: Date.UTC(2026, 0, 1), leadH: 10, binFromH: 7, binToH: 24 });
    for (const v of ['u', 'v', 'gust']) {
      const beta = new Array(names.length).fill(0); beta[Z_DIM] = 1;
      T.mean[stratumKey('K', v, 1, 'r1')] = { form: 'K', var: v, bin: 1, cls: 'r1', names, beta, lambda: 1, n: 9000, days: 60, status: 'written' };
      const c = new Array(V_NAMES.length).fill(0); c[0] = 1;
      T.variance[stratumKey('K', v, 1, 'r1')] = { form: 'K', var: v, bin: 1, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 9000, days: 60, msr: 1, status: 'written' };
    }
    const occBeta = new Array(O_NAMES.length).fill(0); occBeta[10] = 1;
    T.occurrence['K|precip|1|r1'] = { form: 'K', var: 'precip', bin: 1, cls: 'r1', names: O_NAMES, beta: occBeta, n: 9000, days: 60, wetShare: 0.3, iterations: 3, llPerRow: -0.5, status: 'written' };
    T.amount['K|precip|1|r1'] = { form: 'K', var: 'precip', bin: 1, cls: 'r1', names: ['1', 'lnP', 'lnSigDiv', 'tpi2000', 'slope', 'lcForest'], beta: [Math.log(2), 0, 0, 0, 0, 0], sigma: 0.5, n: 9000, days: 60, status: 'written' };
    const sit = { z, leadH: 10, route: 1, srcMask: 0, srcCount: 3, dhM: 0, dTsfcK: 0, k: { u: 3, v: 4, gust: 2, precip: Math.log1p(0.4) }, p: {}, sigDiv: {}, sigEns: {}, wetShare: 0.2 };
    const p0 = predict(T, 'K', sit);
    T.speed['K|ws|1|r1'] = { form: 'K', var: 'ws', bin: 1, cls: 'r1', names: ['a', 'b', 'c'], family: 'truncatedNormal', a: -0.6, b: 1, c: 1.3, n: 9000, days: 60, status: 'written' };
    const p1 = predict(T, 'K', sit);
    const mo = riceMoments(5, 1);
    T.speed['K|ws|1|r1'].status = 'no-skill';
    const p2 = predict(T, 'K', sit);
    add('10e predict: ohne Eintrag Rice(5, 1); mit Eintrag TN(−0,6 + E, 1,3·sd) und `speed` benannt; no-skill ⇒ Rice; Richtung gleich; Böen-Boden = ν 5 in allen drei Fällen',
      p0.dist.windSpeed.kind === 'rice' && near(p0.dist.windSpeed.nu, 5, 1e-12) && p0.speed === null
      && p1.dist.windSpeed.kind === 'truncatedNormal' && near(p1.dist.windSpeed.mu, -0.6 + mo.m, 1e-12) && near(p1.dist.windSpeed.sigma, 1.3 * mo.sd, 1e-12) && p1.speed?.a === -0.6
      && p2.dist.windSpeed.kind === 'rice' && p2.speed === null && p0.windDirectionDeg === p1.windDirectionDeg
      && [p0, p1, p2].every((p) => p.dist.gust.kind === 'censoredNormal' && near(p.dist.gust.mu, 5, 1e-12)),
      `Rice ν ${p0.dist.windSpeed.nu} · TN μ ${p1.dist.windSpeed.mu.toFixed(4)} σ ${p1.dist.windSpeed.sigma.toFixed(4)} · Böe μ ${p1.dist.gust.mu}`);
    const pr = predictPrecip(T, 'K', sit, 0.7), prNo = predictPrecip(T, 'K', sit, null);
    T.occurrence['K|precip|1|r1'].status = 'no-skill';
    const prNs = predictPrecip(T, 'K', sit, 0.7);
    add('10e′ Hürde: Identitäts-β (nur logitWetCube = 1) ⇒ pDry = pDry_Cube exakt, Menge ln 2 / 0,5; ohne pDry_Cube null (absent); no-skill ⇒ null; predict ohne pDryCube nennt precip absent',
      pr && near(pr.dist.pDry, 0.7, 1e-12) && near(pr.dist.mu, Math.log(2), 1e-12) && pr.dist.sigma === 0.5 && near(pr.mean, 0.3 * 2 * Math.exp(0.125), 1e-9) && prNo === null && prNs === null && p0.absent.includes('precip') && p0.dist.precipitation === null,
      `pDry ${pr?.dist.pDry} mean ${pr?.mean.toFixed(4)}`);
  }
  // 10f die geschlossenen CRPS-Formen gegen den generischen Integrator und gegeneinander (Negativkontrollen: die Familien unterscheiden sich, wo sie es müssen)
  {
    const tn = { kind: 'truncatedNormal', mu: 1.2, sigma: 1.5, lo: 0 };
    const eTn = [0.3, 1.0, 2.5, 5].map((y) => Math.abs(crpsTruncatedNormal(1.2, 1.5, 0, y) - crpsOf(tn, y, 4096)));
    const far = Math.abs(crpsTruncatedNormal(12, 1.5, 0, 11) - crpsNormal(12, 1.5, 11));
    const cnBelow = Math.abs(crpsCensoredNormal(50, 20, 0, 100, -3) - crpsOf({ kind: 'censoredNormal', mu: 50, sigma: 20, lo: 0, hi: 100 }, -3, 4096));
    const cn = [0, 20, 50, 100, 104].map((y) => Math.abs(crpsCensoredNormal(50, 20, 0, 100, y) - crpsOf({ kind: 'censoredNormal', mu: 50, sigma: 20, lo: 0, hi: 100 }, y, 4096)));
    const cnFar = Math.abs(crpsCensoredNormal(50, 5, -1000, 1000, 47) - crpsNormal(50, 5, 47));
    const q = quantileOf(tn, 0.3), back = cdfOf(tn, q);
    const mean = meanOf(tn); let num = 0; for (let i = 0; i < 20000; i++) num += quantileOf(tn, (i + 0.5) / 20000) / 20000;
    add('10f TN: CRPS geschlossen = Integrator (±2e-3), = Normal bei μ/σ = 8 (±1e-4), cdf(q(0,3)) = 0,3, Mittel = ∫q (±1e-3), cdf(lo) = 0, PIT über cdf; zensierte Normal: CRPS geschlossen = Integrator an 0/20/50/100/104 und unter lo (±3e-3), = Normal bei fernen Grenzen',
      eTn.every((e) => e < 2e-3) && far < 1e-4 && near(back, 0.3, 1e-6) && near(mean, num, 1e-3) && cdfOf(tn, 0) === 0 && cdfOf(tn, -1) === 0 && pitOf(tn, 2) === cdfOf(tn, 2)
      && cn.every((e) => e < 3e-3) && cnBelow < 3e-3 && cnFar < 1e-6,
      `TN Δ ${eTn.map((e) => e.toExponential(1)).join('/')} fern ${far.toExponential(1)} · CN Δ ${cn.map((e) => e.toExponential(1)).join('/')} unter lo ${cnBelow.toExponential(1)} fern ${cnFar.toExponential(1)} · Mittel ${mean.toFixed(4)}/${num.toFixed(4)}`);
    // negative control: the truncated and the censored normal differ where the mass below 0 is not negligible, and agree where it is
    const dLow = Math.abs(crpsTruncatedNormal(0.5, 1, 0, 0.8) - crpsCensoredNormal(0.5, 1, 0, 1e6, 0.8)), dHigh = Math.abs(crpsTruncatedNormal(9, 1, 0, 8.5) - crpsCensoredNormal(9, 1, 0, 1e6, 8.5));
    add('10f′ Negativkontrolle: gestutzt ≠ zensiert bei μ/σ = 0,5 (Δ > 0,02), gleich bei μ/σ = 9 (Δ < 1e-6); Φ(1,96) = 0,975', dLow > 0.02 && dHigh < 1e-6 && near(Phi(1.959964), 0.975, 1e-4), `Δ ${dLow.toFixed(4)} / ${dHigh.toExponential(1)}`);
  }
}

// ── Block 11: phase FX stage 1 — half-month folds (C8) and the scorer's calibration measures (M1/C5), each with a negative control ──
{
  const { halfMonthOf, foldKeyOf, monthOf, timeFolds, foldsOverGroups } = await import('../src/point/fusionFit/strata.ts');
  const { sdOf, pitRandomOf, ScoreAcc } = await import('./fusionfit/lib/stats.mjs');
  const { quantileOf, cdfOf, pitOf, crpsNormal, Phi } = await import('../src/pointForecast/fusion/dist.ts');
  const { Gram, chooseLambda, variancePenalty } = await import('../src/point/fusionFit/gram.ts');
  const { buildZ, Z_INDEX, Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { meanDesignK } = await import('../src/point/fusionFit/design.ts');
  const { fitStratum, designDim } = await import('../src/point/fusionFit/fitMean.ts');
  const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
  // 11a the half-month key and the scheme switch
  {
    const k1 = halfMonthOf(Date.UTC(2026, 1, 15, 23)), k2 = halfMonthOf(Date.UTC(2026, 1, 16, 0)), k3 = halfMonthOf(Date.UTC(2026, 0, 31, 12));
    add('11a halfMonthOf: 15.02. 23 UTC ⇒ 2026-02a, 16.02. 00 UTC ⇒ 2026-02b, 31.01. ⇒ 2026-01b; foldKeyOf(month) = monthOf, foldKeyOf(half) = halfMonthOf', k1 === '2026-02a' && k2 === '2026-02b' && k3 === '2026-01b' && foldKeyOf(Date.UTC(2026, 1, 16), 'month') === '2026-02' && foldKeyOf(Date.UTC(2026, 1, 16), 'month') === monthOf(Date.UTC(2026, 1, 16)) && foldKeyOf(Date.UTC(2026, 1, 16), 'half') === '2026-02b', `${k1} ${k2} ${k3}`);
  }
  // 11b timeFolds on sorted half keys: ±1 half-month purge; the gap between a held half and its nearest training half ≥ 13 d (February b), never 0
  {
    const keys = ['2025-12a', '2025-12b', '2026-01a', '2026-01b', '2026-02a', '2026-02b', '2026-03a', '2026-03b', '2026-04a', '2026-04b'];
    const folds = timeFolds([...keys].reverse());   // unsorted on purpose — timeFolds sorts
    const feb = folds.find((f) => f.held[0] === '2026-02b');
    const startOf = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, k.endsWith('a') ? 1 : 16);
    const endOf = (k) => (k.endsWith('a') ? Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 16) : Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 1));
    const DAY = 86_400_000;
    const gapOf = (fs) => { let g = Infinity; for (const f of fs) { const out = new Set([...f.held, ...f.purged]); for (const k of keys) { if (out.has(k)) continue; const d = k > f.held[0] ? (startOf(k) - endOf(f.held[0])) / DAY : (startOf(f.held[0]) - endOf(k)) / DAY; g = Math.min(g, d); } } return g; };
    const gap = gapOf(folds), gapNoPurge = gapOf(folds.map((f) => ({ ...f, purged: [] })));
    const fg = foldsOverGroups(['2026-02a|R|lt800', '2026-02b|R|lt800', '2026-03a|R|ge800'], 'month');
    add('11b timeFolds auf Halbmonaten: 2026-02b hält nur sich, purgt genau 2026-02a und 2026-03a; kleinste Lücke gehaltene ↔ Trainingshälfte = 13 d (Februar b); ohne Purge 0 d (Negativkontrolle); foldsOverGroups liest den Halbmonat als erste Komponente',
      folds.length === 10 && feb && feb.held.length === 1 && JSON.stringify(feb.purged) === '["2026-02a","2026-03a"]' && gap === 13 && gapNoPurge === 0 && fg.length === 3 && fg[1].held[0] === '2026-02b|R|lt800' && fg[1].purged.length === 2, `Lücke ${gap} d, ohne Purge ${gapNoPurge} d, purged ${feb?.purged.join(',')}`);
  }
  // 11c leak negative control on half folds (like 8e′): a month (both halves) with a foreign +6-K offset costs the honest half folds, the leaky
  //     axes hide it; and the ±1-half purge itself: without it the fold that holds 2026-02a trains on the shifted 2026-02b and learns part of the bump
  {
    const rnd = lcg(1101);
    const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const site = { hTrueM: 500, tpi500M: 0, tpi2000M: 0, svf: 1, sinkDepthM: 0, slopeDeg: 0, aspectDeg: 0, z0True: 0.1, lcShares: [0, 0, 0.3, 0.7, 0, 0], dWaterM: 5000, dLakeM: null, impervPct: 5, d0M: 0.5, lonDeg: 10 };
    const siteOf = (rg, band) => ({ ...site, hTrueM: band === 'ge800' ? 1200 : 400, tpi500M: band === 'ge800' ? 80 : -30, svf: band === 'ge800' ? 0.7 : 1, sinkDepthM: { '46_7': 0, '48_11': 40, rest: 90 }[rg], lcShares: [0, 0, { '46_7': 0.1, '48_11': 0.3, rest: 0.6 }[rg], 0.7, 0, 0], impervPct: { '46_7': 2, '48_11': 5, rest: 30 }[rg] });
    const pK = designDim('K', 'r1');
    const newAxes = () => ({ month: new Map(), region: new Map(), band: new Map() });
    const axes = newAxes(), axesShift = newAxes();
    const addAxes = (A, key, rg, band, x, y, day, baseSq) => { for (const [axis, k] of [['month', `${key}|*|*`], ['region', `*|${rg}|*`], ['band', `*|*|${band}`]]) { let g = A[axis].get(k); if (!g) { g = new Gram(pK); A[axis].set(k, g); } g.add(x, y, day); g.addExtra('base', baseSq); } };
    const SHIFT_MONTH = '2026-02';   // both halves shifted: the honest fold of either half must not see the other (purged)
    const halves = new Set();
    for (let mi = 0; mi < 8; mi++) for (const rg of ['46_7', '48_11', 'rest']) for (const band of ['lt800', 'ge800']) for (let i = 0; i < 120; i++) {
      const dh = 400 * gauss(), t = Date.UTC(2025, 9 + mi, 1 + (i % 28), i % 24), key = halfMonthOf(t);
      halves.add(key);
      const z = buildZ(siteOf(rg, band), { dhM: dh, z0ModTier: 0.1, foehnFactor: 1, fRad: 0.3, dTsfcK: 0, validAtMs: t, leadH: 10, binFromH: 7, binToH: 24 });
      const yA = 8 + 6 * gauss(), sigDiv = 0.5 + Math.abs(gauss());
      const y = 0.7 + 0.9 * yA - 1.2 * (dh / 1000) + 0.6 * (dh / 1000) * z[Z_INDEX.hCos1] + Math.sqrt(0.5 + 0.8 * sigDiv * sigDiv) * gauss();
      const x = meanDesignK(z, yA, dh, 0, 5), day = mi * 30 + (i % 28);
      addAxes(axes, key, rg, band, x, y, day, (y - yA) ** 2);
      const ys = y + (key.startsWith(SHIFT_MONTH) ? 6 : 0);
      addAxes(axesShift, key, rg, band, x, ys, day, (ys - yA) ** 2);
    }
    const min = { n: 1000, days: 20 };
    const clean = fitStratum('K', 't', 1, 'r1', axes, null, 'base', min);
    const honest = fitStratum('K', 't', 1, 'r1', axesShift, null, 'base', min);
    const leaky = fitStratum('K', 't', 1, 'r1', { month: new Map([...axesShift.month, ...axesShift.region, ...axesShift.band]), region: axesShift.region, band: axesShift.band }, null, 'base', min);
    add('11c Halbmonatsfalten, Leck-Negativkontrolle (wie 8e′): 16 Falten (eine je Hälfte), die ehrliche Zeitfalte sieht den verschobenen Monat als Verlust (MSE > 1,2 × sauber, Skill kleiner), das Leck (Region/Band-Gruppen im Zeit-Axis) versteckt ihn (MSE < 0,7 × ehrlich); sauber `written` mit Steigung 0,9 ±0,1',
      halves.size === 16 && clean.cv.time?.folds === 16 && honest.cv.time && leaky.cv.time && honest.cv.time.mse > clean.cv.time.mse * 1.2 && honest.cv.time.skill < clean.cv.time.skill && leaky.cv.time.mse < honest.cv.time.mse * 0.7 && clean.status === 'written' && Math.abs(clean.beta[Z_DIM] - 0.9) < 0.1,
      `Hälften ${halves.size} · Falten ${clean.cv.time?.folds} · MSE sauber ${clean.cv.time?.mse.toFixed(2)} ehrlich ${honest.cv.time?.mse.toFixed(2)} leck ${leaky.cv.time?.mse.toFixed(2)} · Skill sauber ${clean.cv.time?.skill.toFixed(3)} ehrlich ${honest.cv.time?.skill.toFixed(3)} · β_y ${clean.beta[Z_DIM]?.toFixed(3)}`);
    // the purge itself, on the same half-keyed time axis: fold specs with and without the ±1-half purge at the fitted λ
    const pen = variancePenalty(Gram.sum(axesShift.month.values(), pK)), target = new Float64Array(pK); target[Z_DIM] = 1;
    const specs = foldsOverGroups([...axesShift.month.keys()], 'month');
    const cvPurge = chooseLambda(axesShift.month, pK, specs, [honest.lambda], pen, target, 'base');
    const cvNoPurge = chooseLambda(axesShift.month, pK, specs.map((f) => ({ ...f, purged: [] })), [honest.lambda], pen, target, 'base');
    const mseP = cvPurge.heldSse / cvPurge.heldN, mseN = cvNoPurge.heldSse / cvNoPurge.heldN;
    add('11c′ Purge ±1 Halbmonat: Faltennamen time:YYYY-MMa|b (16), die Falte mit Purge = fitStratum-Zeit-CV (±1e-9); ohne Purge trainiert die 2026-02a-Falte auf der verschobenen 2026-02b-Hälfte und der Verlust sinkt (Negativkontrolle)',
      cvPurge.perFold.length === 16 && cvPurge.perFold.every((f) => /^time:\d{4}-\d{2}[ab]$/.test(f.name)) && near(mseP, honest.cv.time.mse, 1e-9) && mseN < mseP,
      `MSE mit Purge ${mseP.toFixed(3)} ohne ${mseN.toFixed(3)} · Falten ${cvPurge.perFold.map((f) => f.name.slice(5)).slice(0, 4).join(',')}…`);
  }
  // 11d sdOf against a 20 000-node quantile grid; negative control: the latent σ is not the observable sd
  {
    const gridSd = (d, n = 20000) => { let s = 0, s2 = 0; for (let i = 0; i < n; i++) { const q = quantileOf(d, (i + 0.5) / n); s += q; s2 += q * q; } const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m)); };
    const cn = [[50, 40, 0, 100], [95, 60, 0, 100], [5, 3, 0, 90]].map(([mu, sigma, lo, hi]) => { const d = { kind: 'censoredNormal', mu, sigma, lo, hi }; const c = sdOf(d), g = gridSd(d); return { c, g, rel: Math.abs(c / g - 1) }; });
    const tn = [[1.2, 1.5], [-0.5, 1], [4, 0.8]].map(([mu, sigma]) => { const d = { kind: 'truncatedNormal', mu, sigma, lo: 0 }; const c = sdOf(d), g = gridSd(d); return { c, g, rel: Math.abs(c / g - 1) }; });
    const dr = { kind: 'rice', nu: 4, sigma: 1.5 }, rc = sdOf(dr), rg = gridSd(dr, 4000);
    const nn = sdOf({ kind: 'normal', mu: 3, sigma: 2 });
    add('11d sdOf: zensierte Normal (Tobit) an drei Parametersätzen ±1e-3 relativ zum Quantilgitter, TN an drei ±1e-3, Rice ±2e-3, Normal = σ, Hürde null',
      cn.every((x) => x.rel < 1e-3) && tn.every((x) => x.rel < 1e-3) && Math.abs(rc / rg - 1) < 2e-3 && nn === 2 && sdOf({ kind: 'hurdleLogNormal', pDry: 0.3, mu: 0, sigma: 0.5 }) === null,
      `CN ${cn.map((x) => `${x.c.toFixed(3)}/${x.g.toFixed(3)}`).join(' ')} · TN ${tn.map((x) => `${x.c.toFixed(4)}/${x.g.toFixed(4)}`).join(' ')} · Rice ${rc.toFixed(4)}/${rg.toFixed(4)}`);
    const dNeg = { kind: 'censoredNormal', mu: 50, sigma: 60, lo: 0, hi: 100 };
    add('11d′ Negativkontrolle: latente σ 60 ≠ Tobit-sd (Δ > 10 %) bei (50, 60, 0, 100); TN-sd < σ bei μ/σ = −0,5', Math.abs(dNeg.sigma / sdOf(dNeg) - 1) > 0.1 && tn[1].c < 1, `Tobit ${sdOf(dNeg).toFixed(3)} gegen σ 60 · TN ${tn[1].c.toFixed(4)}`);
  }
  // 11e randomised PIT: identical to cdfOf without atoms, uniform on the atom's interval, deterministic in u
  {
    const rnd = lcg(1105);
    const dn = { kind: 'normal', mu: 3, sigma: 2 };
    const eqN = [0, 2.5, 3, 6].every((y) => pitRandomOf(dn, y, rnd()) === cdfOf(dn, y));
    const dc = { kind: 'censoredNormal', mu: 30, sigma: 25, lo: 0, hi: 100 };
    const Flo = cdfOf(dc, 0), Fhi = Phi((100 - 30) / 25);
    let lo = [], hi = [];
    for (let i = 0; i < 2000; i++) { lo.push(pitRandomOf(dc, 0, rnd())); hi.push(pitRandomOf(dc, 100, rnd())); }
    const mLo = lo.reduce((a, b) => a + b, 0) / lo.length, mHi = hi.reduce((a, b) => a + b, 0) / hi.length;
    const dh = { kind: 'hurdleLogNormal', pDry: 0.3, mu: 0, sigma: 0.5 };
    const hu = [0, 0.25, 0.999].map((u) => pitRandomOf(dh, 0, u));
    add('11e pitRandomOf: Normal = cdfOf; zensiert y = lo mit 2 000 Ziehungen alle in [0, F(lo)] und Mittel F(lo)/2 ±0,02, y = hi gespiegelt in [F(hi⁻), 1] um (1 + F(hi⁻))/2; Hürde y = 0 in [0, pDry] = u·pDry; innen = cdfOf',
      eqN && lo.every((p) => p >= 0 && p <= Flo) && near(mLo, Flo / 2, 0.02) && hi.every((p) => p >= Fhi && p <= 1) && near(mHi, (1 + Fhi) / 2, 0.02) && hu.every((p, i) => near(p, [0, 0.25, 0.999][i] * 0.3, 1e-12)) && pitRandomOf(dc, 40, 0.7) === cdfOf(dc, 40),
      `F(lo) ${Flo.toFixed(4)} Mittel ${mLo.toFixed(4)} · F(hi⁻) ${Fhi.toFixed(4)} Mittel ${mHi.toFixed(4)}`);
    add('11e′ Negativkontrolle: pitOf legt das Atom deterministisch in die Mitte (u wirkungslos), pitRandomOf variiert mit u', pitOf(dc, 0) === pitRandomOf(dc, 0, 0.5) && pitRandomOf(dc, 0, 0.25) !== pitRandomOf(dc, 0, 0.75) && pitOf(dc, 0) === pitOf(dc, 0), `${pitRandomOf(dc, 0, 0.25).toFixed(4)} / ${pitRandomOf(dc, 0, 0.75).toFixed(4)}`);
  }
  // 11f ScoreAcc: constant sd ⇒ the three spread/skill forms coincide; varying sd ⇒ rms > mean, latent separate, all reported
  {
    const rnd = lcg(1106);
    const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const a = new ScoreAcc(), b = new ScoreAcc();
    for (let i = 0; i < 4000; i++) { const e = 1.5 * gauss(); a.add(e, crpsNormal(0, 1.5, -e), 0.5, 1.5, 1.5); b.add(e, crpsNormal(0, 1.5, -e), 0.5, 1.0, i % 2 ? 0.5 : 1.5); }
    const sa = a.summary(), sb = b.summary();
    add('11f ScoreAcc: konstante sd ⇒ rms = mean = latent (±1e-12); sd 0,5/1,5 ⇒ rms (√1,25/RMSE) > mean (1/RMSE) = latent, alle drei gemeldet; ohne sd steht σ ein',
      near(sa.spreadSkill, sa.spreadSkillMean, 1e-12) && near(sa.spreadSkill, sa.spreadSkillLatent, 1e-12) && near(sa.spreadSkill, 1.5 / sa.rmse, 1e-12)
      && near(sb.spreadSkill, Math.sqrt(1.25) / sb.rmse, 1e-12) && near(sb.spreadSkillMean, 1 / sb.rmse, 1e-12) && near(sb.spreadSkillLatent, 1 / sb.rmse, 1e-12) && sb.spreadSkill > sb.spreadSkillMean
      && (() => { const c = new ScoreAcc(); c.add(1, 0.5, 0.5, 2); const s = c.summary(); return s.spreadSkill === 2 && s.spreadSkillLatent === 2; })() && (() => { const c = new ScoreAcc(); c.add(1, 0.5, 0.5, 2, null); return c.summary().spreadSkill === null; })(),
      `konstant ${sa.spreadSkill.toFixed(4)}/${sa.spreadSkillMean.toFixed(4)}/${sa.spreadSkillLatent.toFixed(4)} · variabel rms ${sb.spreadSkill.toFixed(4)} mean ${sb.spreadSkillMean.toFixed(4)} latent ${sb.spreadSkillLatent.toFixed(4)}`);
  }
}

// ── Block 12: phase FX stage 2 — μ_c column with ρ_f target (C1, V-FX-5), opened speed grid / second family / band entries (A1, V-FX-6), σ-scale rule (V-FX-7), each with a negative control ──
{
  const { meanDesignK, meanDesignP, CLIMA_NAMES, V_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { designNames, fitStratum, ridgeTarget } = await import('../src/point/fusionFit/fitMean.ts');
  const { validateTables, newTables } = await import('../src/point/fusionFit/tables.ts');
  const { predict, speedEntryOf } = await import('../src/point/fusionFit/predict.ts');
  const { SpeedAcc, fitSpeedStratum, speedLaw, riceMoments, speedEdge, SPEED_CANDIDATES, SPEED_GRID } = await import('../src/point/fusionFit/fitSpeed.ts');
  const { scaleForVar, SCALE_VARS_DEFAULT } = await import('../src/point/fusionFit/fitScale.ts');
  const { buildZ, Z_DIM, Z_INDEX } = await import('../src/point/fusionFit/features.ts');
  const { Gram } = await import('../src/point/fusionFit/gram.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
  const rnd = lcg(1202);
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const eqArr = (a, b) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
  const T0 = newTables('2026-09-25T00:00:00Z');
  const withClima = (T, clima) => ({ ...T, design: { ...T.design, mean: { ...T.design.mean, clima } } });
  // 12a the design: `none` byte-equal to a call without the new arguments, `station` one more LAST column = μ_c; designNames; validateTables on `clima`
  {
    const z = new Float64Array(Z_DIM);
    for (let i = 0; i < Z_DIM; i++) z[i] = 0.3 + 0.21 * i * (i % 2 ? 1 : -1);
    const k0 = meanDesignK(z, 3, 250, 1.5, 4), kN = meanDesignK(z, 3, 250, 1.5, 4, 'none', 7.5), kS = meanDesignK(z, 3, 250, 1.5, 4, 'station', 7.5);
    const srcs = [{ yA: 2, dhM: 100 }, { yA: 4, dhM: -300 }];
    const p0 = meanDesignP(z, srcs, 0.5), pN = meanDesignP(z, srcs, 0.5, 'none', 7.5), pS = meanDesignP(z, srcs, 0.5, 'station', 7.5);
    let threw = false; try { meanDesignK(z, 3, 250, 1.5, 4, 'station', null); } catch (e) { threw = /μ_c/.test(String(e?.message)); }
    const nK = designNames('K', 'r1'), nKS = designNames('K', 'r1', 'station'), nPS = designNames('P', 'm5', 'station');
    add('12a V-FX-5 Design: none = Aufruf ohne die neuen Argumente (Form K und P byte-gleich, μ_c ignoriert); station hängt GENAU eine Spalte μ_c ans Ende (alle Offsets unverändert); designNames trägt muC als letzten Namen; station ohne μ_c wirft benannt',
      eqArr(k0, kN) && eqArr(p0, pN) && kS.length === k0.length + 1 && eqArr(kS.slice(0, k0.length), k0) && kS[kS.length - 1] === 7.5 && pS.length === p0.length + 1 && eqArr(pS.slice(0, p0.length), p0) && pS[pS.length - 1] === 7.5
      && nK.length === k0.length && nKS.length === kS.length && nKS[nKS.length - 1] === 'muC' && nPS.length === pS.length && nPS[nPS.length - 1] === 'muC' && CLIMA_NAMES.length === 1 && threw,
      `p_K ${k0.length} → ${kS.length} · p_P ${p0.length} → ${pS.length} · letzte Spalte ${kS[kS.length - 1]}`);
    const eFoo = validateTables(withClima(T0, 'foo')), eNone = validateTables(withClima(T0, 'none')), eSt = validateTables(withClima(T0, 'station')), eAbs = validateTables(T0);
    add('12a′ validateTables: design.mean.clima "foo" verworfen (benannt), undefined/none/station gültig (Negativkontrolle: das leere Dokument bleibt gültig)', eFoo.length === 1 && /^design\.mean\.clima foo/.test(eFoo[0]) && eNone.length === 0 && eSt.length === 0 && eAbs.length === 0, eFoo.join('; '));
    // the ridge target: form K ρ on ȳ and 1 − ρ on μ_c; without ρ 1 and 0; form P the Σ-weights times ρ at the source offsets, the bias on the intercept
    const pK = nKS.length, tK = ridgeTarget('K', 'r1', pK, null, { clima: 'station', rhoTarget: 0.3 }), tK1 = ridgeTarget('K', 'r1', nK.length, null, {}), tKs0 = ridgeTarget('K', 'r1', pK, null, { clima: 'station' });
    const prior = { bias: -0.2, weights: { icon_d2: 0.6, icon_eu: 0.4 }, effective: 1.9, cov: [] };
    const tP = ridgeTarget('P', 'm5', nPS.length, prior, { clima: 'station', rhoTarget: 0.5 }), tP1 = ridgeTarget('P', 'm5', designNames('P', 'm5').length, prior, {});
    const sumAbs = (t) => Array.from(t).reduce((a, x) => a + Math.abs(x), 0);
    add('12a″ ridgeTarget: K mit ρ 0,3 ⇒ 0,3 auf cube und 0,7 auf muC (sonst 0); ohne ρ 1 / 0 (heutiges Ziel, keine weitere Masse); P mit Σ-Gewichten 0,6/0,4 und ρ 0,5 ⇒ 0,3/0,2 an den Quellspalten, 0,5 auf muC, Bias −0,2 im Intercept; ohne ρ 0,6/0,4 und 0',
      near(tK[Z_DIM], 0.3, 1e-12) && near(tK[pK - 1], 0.7, 1e-12) && near(sumAbs(tK), 1, 1e-12) && tK1.length === nK.length && tK1[Z_DIM] === 1 && near(sumAbs(tK1), 1, 1e-12) && tKs0[Z_DIM] === 1 && tKs0[pK - 1] === 0
      && near(tP[Z_DIM], 0.3, 1e-12) && near(tP[Z_DIM + 3], 0.2, 1e-12) && near(tP[nPS.length - 1], 0.5, 1e-12) && near(tP[0], -0.2, 1e-12) && near(sumAbs(tP), 1.2, 1e-12) && near(tP1[Z_DIM], 0.6, 1e-12) && near(tP1[Z_DIM + 3], 0.4, 1e-12) && near(sumAbs(tP1), 1.2, 1e-12),
      `K ${tK[Z_DIM]}/${tK[pK - 1]} · P ${tP[Z_DIM]}/${tP[Z_DIM + 3]}/${tP[nPS.length - 1]}`);
  }
  // 12b fitStratum recovery on a synthetic stratum with a site climatology (24 sites with their own level and diurnal/annual amplitude):
  //     truth y = μ_c(s) + 0,3·(ȳ − μ_c(s)) + noise ⇒ station + ρ 0,3 recovers β_cube 0,3 / β_μc 0,7; today's call on y = ȳ + noise keeps β_cube ≈ 1
  //     (negative control); the design without μ_c and the shuffled μ_c lose the time-fold skill
  {
    const NS = 24, RG = ['46_7', '48_11', '47_9', 'rest'];
    const sitesS = Array.from({ length: NS }, (_, s) => {
      const u = 0.3 * rnd(), f = 0.5 * rnd(), hi = s % 3 === 0;
      return {
        rg: RG[s % 4], band: hi ? 'ge800' : 'lt800',
        site: { hTrueM: hi ? 900 + 300 * rnd() : 300 + 400 * rnd(), tpi500M: 100 * gauss(), tpi2000M: 150 * gauss(), svf: 0.7 + 0.3 * rnd(), sinkDepthM: 100 * rnd(), slopeDeg: 15 * rnd(), aspectDeg: 360 * rnd(), z0True: 0.05 + 0.4 * rnd(), lcShares: [0, u, f, 1 - u - f, 0, 0], dWaterM: 20000 * rnd(), dLakeM: null, impervPct: 40 * rnd(), d0M: 2 * rnd(), lonDeg: 8 + 6 * rnd() },
        L: 15 * rnd(), A: 1 + 4 * rnd(), D: 2 + 6 * rnd(),
      };
    });
    const muCOf = (st, z) => st.L + st.A * z[Z_INDEX.hCos1] + st.D * z[Z_INDEX.dCos1];
    const RHO = 0.3;
    const newAxes = () => ({ month: new Map(), region: new Map(), band: new Map() });
    const axS = newAxes(), axN = newAxes(), axX = newAxes(), axC = newAxes();
    const addAxes = (A, m, rg, band, x, y, day, baseSq) => { for (const [axis, k] of [['month', `${m}|*|*`], ['region', `*|${rg}|*`], ['band', `*|*|${band}`]]) { let g = A[axis].get(k); if (!g) { g = new Gram(x.length); A[axis].set(k, g); } g.add(x, y, day); g.addExtra('base', baseSq); } };
    const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
    for (let mi = 0; mi < months.length; mi++) for (let s = 0; s < NS; s++) for (let i = 0; i < 60; i++) {
      const st = sitesS[s], dh = 300 * gauss(), t = Date.UTC(2025, 9 + mi, 1 + (i % 28), (i * 7) % 24), day = mi * 30 + (i % 28);
      const z = buildZ(st.site, { dhM: dh, z0ModTier: 0.1, foehnFactor: 1, fRad: 0.3, dTsfcK: 0, validAtMs: t, leadH: 10, binFromH: 7, binToH: 24 });
      const muC = muCOf(st, z), muX = muCOf(sitesS[(s + 1) % NS], z), anom = 5 * gauss(), yA = muC + anom;
      // srcCount varies per row: a constant one makes ȳ·srcCount/5 identical to ȳ and the ridge would split their sum by the targets
      const sc = 2 + (i % 4);
      const y = muC + RHO * anom + gauss();
      addAxes(axS, months[mi], st.rg, st.band, meanDesignK(z, yA, dh, 0, sc, 'station', muC), y, day, (y - yA) ** 2);
      addAxes(axN, months[mi], st.rg, st.band, meanDesignK(z, yA, dh, 0, sc), y, day, (y - yA) ** 2);
      addAxes(axX, months[mi], st.rg, st.band, meanDesignK(z, yA, dh, 0, sc, 'station', muX), y, day, (y - yA) ** 2);
      const yC = 0.7 + yA + gauss();   // the control truth: slope 1 with an intercept (as block 8e), so the baseline ȳ leaves skill to find
      addAxes(axC, months[mi], st.rg, st.band, meanDesignK(z, yA, dh, 0, sc), yC, day, (yC - yA) ** 2);
    }
    const min = { n: 1000, days: 20 };
    const eS = fitStratum('K', 't', 1, 'r1', axS, null, 'base', min, { clima: 'station', rhoTarget: RHO });
    const eN = fitStratum('K', 't', 1, 'r1', axN, null, 'base', min);
    const eX = fitStratum('K', 't', 1, 'r1', axX, null, 'base', min, { clima: 'station', rhoTarget: RHO });
    const eC = fitStratum('K', 't', 1, 'r1', axC, null, 'base', min);
    const iMu = eS.names.length - 1, iCube = Z_DIM;
    // effect size of every other column (β·sd, V-FL-34) — the site information must sit in μ_c, not spill into Z
    const mom = Gram.sum(axS.month.values(), eS.names.length).moments();
    const spill = eS.names.map((n, j) => [n, Math.abs(eS.beta[j]) * Math.sqrt(mom.variance[j])]).filter(([n]) => n !== '1' && n !== 'cube' && n !== 'muC').sort((a, b) => b[1] - a[1]);
    add('12b V-FX-5 Rückgewinnung: station + ρ 0,3 ⇒ β_cube 0,3 ±0,08, β_μc 0,7 ±0,1, written, Einträge tragen clima/rhoTarget, muC letzter Name; jede andere Spalte < 0,3 K Effekt (β·sd); Negativkontrolle heutiger Aufruf auf y = 0,7 + ȳ + Rauschen ⇒ β_cube 1 ±0,1, written, ohne clima/rhoTarget-Felder',
      eS.status === 'written' && near(eS.beta[iCube], RHO, 0.08) && near(eS.beta[iMu], 1 - RHO, 0.1) && eS.clima === 'station' && eS.rhoTarget === RHO && eS.names[iMu] === 'muC' && eS.beta.length === eS.names.length && spill[0][1] < 0.3
      && eC.status === 'written' && near(eC.beta[iCube], 1, 0.1) && eC.clima === undefined && eC.rhoTarget === undefined && eC.names.length === eS.names.length - 1,
      `β_cube ${eS.beta[iCube].toFixed(3)} β_μc ${eS.beta[iMu].toFixed(3)} λ ${eS.lambda} ${eS.status} clima ${eS.clima} ρ ${eS.rhoTarget} ${eS.names[iMu]} ${eS.beta.length}/${eS.names.length} · größter Rest ${spill[0][0]} ${spill[0][1].toFixed(3)} K · Kontrolle β_cube ${eC.beta[iCube].toFixed(3)} ${eC.status} ${eC.clima} ${eC.rhoTarget} ${eC.names.length}`);
    // the target must not be what recovers it: with a WRONG target (ρ 0,8) the data still says 0,3 — the CV picks a small λ (λ = 1 is a 50-% pull in `gram.ts`)
    const eW = fitStratum('K', 't', 1, 'r1', axS, null, 'base', min, { clima: 'station', rhoTarget: 0.8 });
    add('12b″ Negativkontrolle des Ziels: station + falsches ρ 0,8 ⇒ β_cube bleibt 0,3 ±0,1 und β_μc 0,7 ±0,1 (die Daten identifizieren die Spalte, die CV wählt λ ≤ 0,3); Eintrag trägt rhoTarget 0,8',
      near(eW.beta[iCube], RHO, 0.1) && near(eW.beta[iMu], 1 - RHO, 0.1) && eW.lambda <= 0.3 && eW.rhoTarget === 0.8 && eW.lambda < eS.lambda,
      `β_cube ${eW.beta[iCube].toFixed(3)} β_μc ${eW.beta[iMu].toFixed(3)} λ ${eW.lambda} (richtiges Ziel λ ${eS.lambda})`);
    // rhoSelect cv: both targets with their own λ, the lower held-out MSE wins — on the ρ-0,3 truth the ρ target (β identical to the fixed call),
    // on the slope-1 control today's target; the fixed call carries none of the cv fields (default path unchanged)
    const eCv = fitStratum('K', 't', 1, 'r1', axS, null, 'base', min, { clima: 'station', rhoTarget: RHO, rhoSelect: 'cv' });
    const eCvC = fitStratum('K', 't', 1, 'r1', axC, null, 'base', min, { rhoTarget: RHO, rhoSelect: 'cv' });
    add('12b‴ rhoSelect cv: ρ-0,3-Wahrheit ⇒ Ziel ρ gewählt (rhoTargetChosen 0,3, MSE_ρ < MSE_1), β und λ byte-gleich zum festen ρ-Aufruf; Steigung-1-Kontrolle ⇒ Ziel 1 gewählt (β_cube 1 ±0,1, MSE_1 ≤ MSE_ρ); der feste Aufruf trägt keine cv-Felder',
      eCv.rhoTargetChosen === RHO && eCv.rhoTargetCv && eCv.rhoTargetCv.rho < eCv.rhoTargetCv.one && JSON.stringify(eCv.beta) === JSON.stringify(eS.beta) && eCv.lambda === eS.lambda && eCv.rhoTarget === RHO
      && eCvC.rhoTargetChosen === 1 && eCvC.rhoTargetCv && eCvC.rhoTargetCv.one <= eCvC.rhoTargetCv.rho && near(eCvC.beta[iCube], 1, 0.1) && eS.rhoTargetChosen === undefined && eS.rhoTargetCv === undefined && eC.rhoTargetChosen === undefined,
      `ρ-Wahrheit gewählt ${eCv.rhoTargetChosen} (MSE 1 ${eCv.rhoTargetCv?.one} ρ ${eCv.rhoTargetCv?.rho}, λ ${eCv.lambda}) · Kontrolle gewählt ${eCvC.rhoTargetChosen} (MSE 1 ${eCvC.rhoTargetCv?.one} ρ ${eCvC.rhoTargetCv?.rho}) β_cube ${eCvC.beta[iCube].toFixed(3)}`);
    add('12b′ Zeitfalten-Skill: die μ_c-Spalte trägt Ortsinformation — MSE(station) < ½ MSE(ohne μ_c) und < ½ MSE(Nachbar-μ_c, Negativkontrolle); die gemischte Spalte verliert den Skill gegen die richtige und liegt nicht unter dem Design ohne μ_c',
      eS.cv.time && eN.cv.time && eX.cv.time && eS.cv.time.mse < 0.5 * eN.cv.time.mse && eS.cv.time.mse < 0.5 * eX.cv.time.mse && eX.cv.time.skill < eS.cv.time.skill && eX.cv.time.mse > 0.9 * eN.cv.time.mse,
      `MSE Zeit station ${eS.cv.time?.mse.toFixed(3)} (Skill ${eS.cv.time?.skill.toFixed(3)}) · ohne μ_c ${eN.cv.time?.mse.toFixed(3)} (${eN.cv.time?.skill.toFixed(3)}) · Nachbar-μ_c ${eX.cv.time?.mse.toFixed(3)} (${eX.cv.time?.skill.toFixed(3)}, β_μc ${eX.beta[iMu]?.toFixed(3)})`);
  }
  // 12c predict: a station table without μ_c ⇒ the variable is absent; with μ_c the column acts; a none table ignores μ_c and returns the same μ as before
  {
    const site = { hTrueM: 500, tpi500M: 0, tpi2000M: 0, svf: 1, sinkDepthM: 0, slopeDeg: 0, aspectDeg: 0, z0True: 0.1, lcShares: [0, 0, 0.3, 0.7, 0, 0], dWaterM: 5000, dLakeM: null, impervPct: 5, d0M: 0.5, lonDeg: 10 };
    const z = buildZ(site, { dhM: 0, z0ModTier: 0.1, foehnFactor: 1, fRad: 0.3, dTsfcK: 0, validAtMs: Date.UTC(2026, 0, 1), leadH: 10, binFromH: 7, binToH: 24 });
    const names = designNames('K', 'r1'), key = stratumKey('K', 't', 1, 'r1');
    const beta = new Array(names.length).fill(0); beta[0] = 1; beta[Z_DIM] = 1;   // μ = ȳ + 1
    const c = new Array(V_NAMES.length).fill(0); c[0] = 1;
    const T = { ...newTables('2026-09-25T00:00:00Z'), mean: { [key]: { form: 'K', var: 't', bin: 1, cls: 'r1', names, beta, lambda: 1, n: 9000, days: 60, status: 'written' } }, variance: { [key]: { form: 'K', var: 't', bin: 1, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 9000, days: 60, msr: 1, status: 'written' } } };
    const TS = { ...withClima(T, 'station'), mean: { [key]: { ...T.mean[key], names: [...names, 'muC'], beta: [...beta, 0.5] } } };
    const sit = { z, leadH: 10, route: 1, srcMask: 0, srcCount: 3, dhM: 0, dTsfcK: 0, k: { t: 12 }, p: {}, sigDiv: {}, sigEns: {}, wetShare: 0 };
    const p0 = predict(T, 'K', sit), pIgn = predict(T, 'K', { ...sit, muC: { t: 4 } });
    const pAbs = predict(TS, 'K', sit), pNaN = predict(TS, 'K', { ...sit, muC: { t: NaN } }), pOn = predict(TS, 'K', { ...sit, muC: { t: 4 } });
    const vS = validateTables(TS), vBad = validateTables({ ...TS, mean: { [key]: T.mean[key] } });
    add('12c predict: station-Tabelle ohne μ_c ⇒ t absent (dist null), μ_c NaN ebenso; mit μ_c 4 ⇒ μ = 1 + 12 + 0,5·4 = 15; none-Tabelle gibt mit und ohne μ_c dieselbe μ 13 (Negativkontrolle); validateTables: station-Tabelle gültig, ein geschriebener Eintrag ohne muC-Spalte darin fällt benannt',
      near(p0.mu.t, 13, 1e-12) && near(pIgn.mu.t, 13, 1e-12) && JSON.stringify(pIgn.dist) === JSON.stringify(p0.dist)
      && pAbs.absent.includes('t') && pAbs.dist.temperature === null && pAbs.mu.t === undefined && pNaN.absent.includes('t') && near(pOn.mu.t, 15, 1e-12) && !pOn.absent.includes('t')
      && vS.length === 0 && vBad.some((x) => /ohne μ_c-Spalte/.test(x)),
      `none ${p0.mu.t} · station ohne ${pAbs.absent.join(',')} · mit ${pOn.mu.t} · ${vBad.join('; ')}`);
  }
  // 12d speed: v3 reproduces the fusionFit@3 fit (block 10b) without the new fields; v4 picks the `sd` family on an sd-truth and `add` on an add-truth,
  //     edge flags where the optimum sits at the border, `speedLaw` with absent law = add
  {
    const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
    const tnSample = (mu, sg) => { for (let k = 0; k < 100; k++) { const y = mu + sg * gauss(); if (y >= 0) return y; } return 0; };
    const run = (grid, truth) => {
      const acc = new SpeedAcc(grid);
      for (let mi = 0; mi < months.length; mi++) for (let i = 0; i < 1200; i++) {
        const nu = Math.abs(2.5 + 2.5 * gauss()), sig = 0.6 + 1.5 * Math.abs(gauss());
        const { m, sd } = riceMoments(nu, sig);
        let y;
        if (truth === 'rice') { const ang = 2 * Math.PI * rnd(); y = Math.hypot(nu * Math.cos(ang) + sig * gauss(), nu * Math.sin(ang) + sig * gauss()); }
        else if (truth === 'add') y = tnSample(-0.6 + 1.0 * m, 1.3 * sd);
        else if (truth === 'sd') y = tnSample(-0.6 * sd + 1.0 * m, 1.2 * sd);
        else y = tnSample(-2.5 + 1.0 * m, 1.0 * sd);   // `far`: the optimum lies outside the grid
        acc.add(months[mi], mi * 30 + (i % 28), y, nu, sig, false);
      }
      return fitSpeedStratum('K', 4, 'r1', acc, { n: 1000, days: 20 });
    };
    const v3add = run('v3', 'add'), v3rice = run('v3', 'rice');
    add('12d V-FX-6 Gitter v3 = fusionFit@3 (Negativkontrolle): 75 Tripel in Gitterreihenfolge, TN-Wahrheit (−0,6, 1, 1,3) zurückgewonnen (a ±0,3, b ±0,1, c ∈ {1,15; 1,3; 1,5}), written, ohne law/grid/edge-Felder; Rice-Wahrheit ⇒ kein Gewinn > 1 %',
      SPEED_GRID.length === 75 && SPEED_CANDIDATES.v3.length === 75 && SPEED_CANDIDATES.v3.every((c, i) => c.law === 'add' && c.a === SPEED_GRID[i][0] && c.b === SPEED_GRID[i][1] && c.c === SPEED_GRID[i][2]) && SPEED_CANDIDATES.v4.length === 612 && SPEED_CANDIDATES.v4.filter((c) => c.law === 'add').length === 324
      && v3add.status === 'written' && Math.abs(v3add.a + 0.6) <= 0.3 && Math.abs(v3add.b - 1) <= 0.1 && [1.15, 1.3, 1.5].includes(v3add.c) && v3add.law === undefined && v3add.grid === undefined && v3add.edge === undefined && v3add.cv.byLaw === undefined
      && v3rice.cv.oof.crps > v3rice.cv.oof.crpsRice * 0.99,
      `v3 add-Wahrheit a ${v3add.a} b ${v3add.b} c ${v3add.c} ${v3add.status} oof ${v3add.cv.oof.crpsRice.toFixed(4)} → ${v3add.cv.oof.crps.toFixed(4)} · Rice-Wahrheit a ${v3rice.a} b ${v3rice.b} c ${v3rice.c} ${v3rice.status}`);
    const v4sd = run('v4', 'sd'), v4add = run('v4', 'add'), v4far = run('v4', 'far');
    add('12d′ Gitter v4: sd-Wahrheit TN(−0,6·sd + E, 1,2·sd) ⇒ Familie sd mit a −0,6 ±0,3, b 1 ±0,15, c ∈ {1,1; 1,25}, schlägt add out of fold, written, grid v4, kein Randparameter; add-Wahrheit ⇒ Familie add mit a −0,6 ±0,3 (Symmetrie-Negativkontrolle); beide Familien im Beleg cv.byLaw',
      v4sd.status === 'written' && v4sd.law === 'sd' && v4sd.grid === 'v4' && Math.abs(v4sd.a + 0.6) <= 0.3 && Math.abs(v4sd.b - 1) <= 0.15 && [1.1, 1.25].includes(v4sd.c) && v4sd.cv.byLaw.sd.oof.crps < v4sd.cv.byLaw.add.oof.crps && v4sd.edge.length === 0
      && v4add.status === 'written' && v4add.law === 'add' && Math.abs(v4add.a + 0.6) <= 0.3 && v4add.cv.byLaw.add.oof.crps <= v4add.cv.byLaw.sd.oof.crps && Array.isArray(v4add.edge),
      `sd-Wahrheit ${v4sd.law} a ${v4sd.a} b ${v4sd.b} c ${v4sd.c} oof sd ${v4sd.cv.byLaw.sd.oof.crps.toFixed(4)} add ${v4sd.cv.byLaw.add.oof.crps.toFixed(4)} Rice ${v4sd.cv.oof.crpsRice.toFixed(4)} · add-Wahrheit ${v4add.law} a ${v4add.a} b ${v4add.b} c ${v4add.c} oof add ${v4add.cv.byLaw.add.oof.crps.toFixed(4)} sd ${v4add.cv.byLaw.sd.oof.crps.toFixed(4)}`);
    add('12d″ Randflags: Wahrheit TN(−2,5 + E, sd) liegt außerhalb des v4-Gitters ⇒ a = −1,8 mit edge ⊇ [a]; speedEdge nennt für das Fit-4-Gesetz (−0,9, 1,1, 1) auf v3 genau a und b, für (−0,9, 1, 1,1) auf v4 nichts (Negativkontrolle)',
      v4far.a === -1.8 && v4far.edge.includes('a') && JSON.stringify(speedEdge('v3', { law: 'add', a: -0.9, b: 1.1, c: 1 })) === '["a","b"]' && speedEdge('v4', { law: 'add', a: -0.9, b: 1, c: 1.1 }).length === 0 && JSON.stringify(speedEdge('v4', { law: 'sd', a: 0.3, b: 0.7, c: 1.7 })) === '["a","b","c"]',
      `fern a ${v4far.a} b ${v4far.b} c ${v4far.c} edge ${v4far.edge.join('')}`);
    const r = { nu: 4, sigma: 1.5 }, mo = riceMoments(4, 1.5);
    const lAbs = speedLaw(r, { a: -0.6, b: 1, c: 1.3 }), lAdd = speedLaw(r, { a: -0.6, b: 1, c: 1.3, law: 'add' }), lSd = speedLaw(r, { a: -0.6, b: 1, c: 1.3, law: 'sd' });
    add('12d‴ speedLaw: ohne law = add (byte-gleich), sd ⇒ μ = a·sd + b·E ≠ add, σ gleich', JSON.stringify(lAbs) === JSON.stringify(lAdd) && near(lAbs.mu, -0.6 + mo.m, 1e-12) && near(lSd.mu, -0.6 * mo.sd + mo.m, 1e-12) && lSd.mu !== lAdd.mu && lSd.sigma === lAdd.sigma, `add μ ${lAdd.mu.toFixed(4)} sd μ ${lSd.mu.toFixed(4)}`);
  }
  // 12e speedEntryOf / predict with a band: a written band entry wins, pooled without band, with an unknown band or with a no-skill band entry; validateTables on keys and law
  {
    const mk = (a, status, extra = {}) => ({ form: 'K', var: 'ws', bin: 1, cls: 'r1', names: ['a', 'b', 'c'], family: 'truncatedNormal', a, b: 1, c: 1.3, n: 9000, days: 60, status, ...extra });
    const T = { ...newTables('2026-09-25T00:00:00Z'), speed: { 'K|ws|1|r1': mk(-0.6, 'written'), 'K|ws|1|r1|ge800': mk(0.3, 'written', { band: 'ge800', law: 'sd', grid: 'v4', edge: [] }), 'K|ws|1|r1|lt800': mk(-1.5, 'no-skill', { band: 'lt800' }) } };
    const site = { hTrueM: 500, tpi500M: 0, tpi2000M: 0, svf: 1, sinkDepthM: 0, slopeDeg: 0, aspectDeg: 0, z0True: 0.1, lcShares: [0, 0, 0.3, 0.7, 0, 0], dWaterM: 5000, dLakeM: null, impervPct: 5, d0M: 0.5, lonDeg: 10 };
    const z = buildZ(site, { dhM: 0, z0ModTier: 0.1, foehnFactor: 1, fRad: 0.3, dTsfcK: 0, validAtMs: Date.UTC(2026, 0, 1), leadH: 10, binFromH: 7, binToH: 24 });
    const names = designNames('K', 'r1');
    for (const v of ['u', 'v']) {
      const beta = new Array(names.length).fill(0); beta[Z_DIM] = 1;
      T.mean[stratumKey('K', v, 1, 'r1')] = { form: 'K', var: v, bin: 1, cls: 'r1', names, beta, lambda: 1, n: 9000, days: 60, status: 'written' };
      const c = new Array(V_NAMES.length).fill(0); c[0] = 1;
      T.variance[stratumKey('K', v, 1, 'r1')] = { form: 'K', var: v, bin: 1, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 9000, days: 60, msr: 1, status: 'written' };
    }
    const sit = { z, leadH: 10, route: 1, srcMask: 0, srcCount: 3, dhM: 0, dTsfcK: 0, k: { u: 3, v: 4 }, p: {}, sigDiv: {}, sigEns: {}, wetShare: 0 };
    const mo = riceMoments(5, 1);
    const pG = predict(T, 'K', { ...sit, band: 'ge800' }), pL = predict(T, 'K', { ...sit, band: 'lt800' }), pN = predict(T, 'K', sit);
    const vOk = validateTables(T), vKey = validateTables({ ...T, speed: { 'K|ws|1|r1|foo': mk(0, 'written') } }), vLaw = validateTables({ ...T, speed: { 'K|ws|1|r1': mk(0, 'written', { law: 'x' }) } });
    add('12e speedEntryOf: mit Band ge800 der geschriebene Bandeintrag (a 0,3, sd), ohne Band der gepoolte (−0,6), Band lt800 mit no-skill-Eintrag ⇒ gepoolt (Negativkontrolle), unbekanntes Band ⇒ gepoolt; predict trägt es (TN μ = 0,3·sd + E gegen −0,6 + E); validateTables: Bandschlüssel gültig, Schlüssel …|foo und law x fallen benannt',
      speedEntryOf(T, 'K', 10, 'r1', 'ge800').a === 0.3 && speedEntryOf(T, 'K', 10, 'r1').a === -0.6 && speedEntryOf(T, 'K', 10, 'r1', 'lt800').a === -0.6 && speedEntryOf(T, 'K', 10, 'r1', 'other').a === -0.6
      && pG.speed?.band === 'ge800' && near(pG.dist.windSpeed.mu, 0.3 * mo.sd + mo.m, 1e-12) && pL.speed?.band === undefined && near(pL.dist.windSpeed.mu, -0.6 + mo.m, 1e-12) && JSON.stringify(pN.dist.windSpeed) === JSON.stringify(pL.dist.windSpeed)
      && vOk.length === 0 && vKey.some((x) => /^speed K\|ws\|1\|r1\|foo: Schlüssel/.test(x)) && vLaw.some((x) => /^speed K\|ws\|1\|r1: law x/.test(x)),
      `ge800 μ ${pG.dist.windSpeed.mu.toFixed(4)} · gepoolt μ ${pL.dist.windSpeed.mu.toFixed(4)} · ${vKey.join('; ')} · ${vLaw.join('; ')}`);
  }
  // 12f the σ-scale write rule (V-FX-7): outside `--scaleVars` always 1, clouds mandatory inside, the others only where they win
  {
    const win = { k: 0.9, winsOof: true }, lose = { k: 1.3, winsOof: false };
    add('12f scaleForVar: Voreinstellung t/td/gust/clct — t gewinnt ⇒ 0,9, t verliert ⇒ 1, clct verliert ⇒ 1,3 (Pflicht); --scaleVars=clct — t gewinnt ⇒ 1 (Regel), gust gewinnt ⇒ 1, clct verliert ⇒ 1,3; Negativkontrolle --scaleVars=t: clct ⇒ 1',
      JSON.stringify(SCALE_VARS_DEFAULT) === '["t","td","gust","clct"]' && scaleForVar('t', win) === 0.9 && scaleForVar('t', lose) === 1 && scaleForVar('clct', lose) === 1.3 && scaleForVar('td', win, SCALE_VARS_DEFAULT) === 0.9
      && scaleForVar('t', win, ['clct']) === 1 && scaleForVar('gust', win, ['clct']) === 1 && scaleForVar('clct', lose, ['clct']) === 1.3 && scaleForVar('clct', win, ['clct']) === 0.9 && scaleForVar('clct', lose, ['t']) === 1 && scaleForVar('t', win, ['t']) === 0.9);
  }
}

// ── Block 13: phase FX-4 — the μ_c estimators of `climaProduct.ts` (E-FX-1): recovery on synthetic stations of the real data shape, shuffled neighbours as negative control, leave-station-out leak check with a deliberately leaking control, product validation ──
{
  const { estimateCoefficients, fitLapse, fitTrend, trendVector, muAt, validateClimaProduct, TREND_SETS, TREND_NAMES, CLIMA_PRODUCT_KIND, CLIMA_PRODUCT_SCHEMA, distKm } = await import('../src/point/fusionFit/climaProduct.ts');
  const { C_DIM, C_NAMES, CLIMA_VARS, climaDesign } = await import('../src/point/fusionFit/fitClima.ts');
  const rnd = lcg(1304);
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  // 72 synthetic stations on a 9 × 8 grid over 46…52° N, 6…15° E with heights 100…2 500 m and terrain features of the real shape (siteOf-like)
  const N = 72, stations = [];
  for (let i = 0; i < N; i++) {
    const row = Math.floor(i / 9), col = i % 9;
    const lat = 46.2 + row * 0.8 + 0.1 * gauss(), lon = 6.5 + col * 1.05 + 0.1 * gauss();
    const alpine = lat < 48;
    const hTrueM = Math.round(alpine ? 400 + 2100 * rnd() : 50 + 500 * rnd());
    const site = { hTrueM, tpi500M: (rnd() - 0.5) * (alpine ? 300 : 40), tpi2000M: (rnd() - 0.5) * (alpine ? 800 : 80), svf: alpine ? 0.7 + 0.3 * rnd() : 0.97 + 0.03 * rnd(), sinkDepthM: rnd() * (alpine ? 200 : 20), slopeDeg: rnd() * (alpine ? 25 : 3), aspectDeg: rnd() * 360, z0True: 0.03 + 0.5 * rnd(), lcShares: [0.02, 0.1 * rnd(), 0.4 * rnd(), 0.4, 0.02, 0], dWaterM: 500 + 15000 * rnd(), dLakeM: 20000, impervPct: 20 * rnd(), d0M: 2 * rnd(), lonDeg: lon };
    stations.push({ id: `S${String(i).padStart(2, '0')}`, lat, lon, elevM: hTrueM, country: alpine ? 'AT' : 'DE', net: 'test', site, feat: Array.from(trendVector(site, lat, TREND_SETS.terrain)) });
  }
  // truth: T level = 12 − 6·h(km) + 0,4·(lat − 48) + 0,3·svf-anomaly + smooth field + noise; diurnal amplitude 4 − 1,5·h; u level 1 + 0,8·h; clct 60 + 6·h
  const smooth = (lat, lon) => 1.2 * Math.sin(lat * 1.1) * Math.cos(lon * 0.7);
  for (const s of stations) {
    const h = s.elevM / 1000, x = s.feat;
    const t = new Array(C_DIM).fill(0), u = new Array(C_DIM).fill(0), cl = new Array(C_DIM).fill(0);
    t[0] = 12 - 6 * h + 0.4 * (s.lat - 48) + 3 * (x[7] - 0.9) + smooth(s.lat, s.lon) + 0.15 * gauss(); t[1] = -4 + 0.1 * gauss(); t[2] = -6 + 0.1 * gauss(); t[6] = -(4 - 1.5 * h) + 0.1 * gauss();
    u[0] = 1 + 0.8 * h + 0.1 * gauss(); u[5] = 0.5 + 0.05 * gauss();
    cl[0] = 60 + 6 * h + 0.5 * gauss(); cl[2] = 5;
    s.mu = { t, u, clct: cl };
  }
  const regionOf = (id) => { const st = stations.find((x) => x.id === id); return `${Math.floor(st.lat)}_${Math.floor(st.lon / 3)}`; };
  const rows = (v, exclude) => stations.filter((s) => s.mu[v] && s.id !== exclude).map((s) => ({ id: s.id, x: s.feat, y: s.mu[v] }));
  const trendFor = (exclude) => { const beta = {}, lambda = {}; for (const v of ['t', 'u', 'clct']) { const f = fitTrend(rows(v, exclude), regionOf); beta[v] = f.beta.map((b) => Array.from(b)); lambda[v] = f.lambda; } return { names: TREND_SETS.terrain, beta, lambda }; };
  const lapseFor = (exclude) => Object.fromEntries(['t', 'u', 'clct'].map((v) => [v, Array.from(fitLapse(stations, v, exclude))]));
  const base = { schema: CLIMA_PRODUCT_SCHEMA, kind: CLIMA_PRODUCT_KIND, fitVersion: 'test', provenance: 'hindcast', builtAt: '2026-09-26T00:00:00Z', design: C_NAMES, vars: ['t', 'u', 'clct'], stations, source: { clima: 'test', sha256: null, period: null, days: null, points: N }, licence: ['test'], notes: [] };
  const specs = {
    idw3: { kind: 'idw', k: 3, power: 2, heightSlope: 'tTd' },
    idw3n: { kind: 'idw', k: 3, power: 2, heightSlope: 'none' },
    ridgeT: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none' },
    ridgeTx: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none', byVar: { clct: { kind: 'idw', k: 3, power: 2, heightSlope: 'none' } } },
    krigT3: { kind: 'kriging', k: 3, power: 2, heightSlope: 'none' },
  };
  // 13a the climatology's own lapse: the annual-mean slope of T over height is recovered (−6 K/km), of u (+0,8), leave-one-out changes it little
  {
    // a clean set (level = 12 − 6·h + noise, nothing else) recovers the slope exactly; on the confounded stations (svf and latitude co-vary with height) the marginal slope is steeper — by design
    const clean = stations.map((st, i) => ({ ...st, id: `C${i}`, mu: { t: [12 - 6 * st.elevM / 1000 + 0.1 * gauss(), 0, 0, 0, 0, 0, -(4 - 1.5 * st.elevM / 1000), 0, 0, 0, 0, 0, 0] } }));
    const lc = fitLapse(clean, 't'), l = fitLapse(stations, 't'), lu = fitLapse(stations, 'u'), l1 = fitLapse(stations, 't', 'S00');
    add('13a fitLapse: an einem reinen Höhensatz Steigung des T-Jahresmittels −6 K/km (±0,15) und der Tagesgang-Amplitude +1,5 K/km (±0,15) aus den Stationen selbst; am verschränkten Satz (svf, Breite mit der Höhe) steiler (−6,5…−7,5, Konstruktion); u +0,8 m/s je km; ohne eine Station fast gleich; < 3 Stationen ⇒ null',
      Math.abs(lc[0] + 6) < 0.15 && Math.abs(lc[6] - 1.5) < 0.15 && l[0] < -6.5 && l[0] > -7.5 && Math.abs(lu[0] - 0.8) < 0.15 && Math.abs(l1[0] - l[0]) < 0.1 && fitLapse(stations.slice(0, 2), 't') === null,
      `rein γ_T ${lc[0].toFixed(2)} K/km · γ_amp ${lc[6].toFixed(2)} · verschränkt γ_T ${l[0].toFixed(2)} · γ_u ${lu[0].toFixed(2)} · LOO ${l1[0].toFixed(2)}`);
  }
  // 13b leave-station-out recovery: per station the estimate WITHOUT it against its own coefficients — RMS of the annual mean and of the hourly design
  const mom = (() => { const M = new Float64Array(C_DIM * C_DIM), x = new Float64Array(C_DIM), n = 365 * 24; for (let h = 0; h < n; h++) { climaDesign(Date.UTC(2025, 0, 1) + h * 3_600_000, 10, x); for (let i = 0; i < C_DIM; i++) for (let j = 0; j < C_DIM; j++) M[i * C_DIM + j] += x[i] * x[j] / n; } return M; })();
  const rmsOf = (est, truth) => { let q = 0; for (let i = 0; i < C_DIM; i++) for (let j = 0; j < C_DIM; j++) q += (est[i] - truth[i]) * mom[i * C_DIM + j] * (est[j] - truth[j]); return Math.sqrt(Math.max(0, q)); };
  const loso = {};   // cand → var → [rms]
  const leaks = [];
  for (const s of stations) {
    const trend = trendFor(s.id), lapse = lapseFor(s.id);
    const target = { lat: s.lat, lon: s.lon, elevM: s.elevM, feat: s.feat };
    for (const [cand, spec] of Object.entries(specs)) {
      const est = estimateCoefficients({ ...base, estimator: spec, lapse, trend: spec.kind === 'idw' ? null : trend }, target, { exclude: s.id });
      if (est.used.includes(s.id)) leaks.push(`${cand}:${s.id}`);
      for (const v of ['t', 'u', 'clct']) if (est.mu[v]) ((loso[cand] ??= {})[v] ??= []).push(rmsOf(est.mu[v], s.mu[v]));
    }
    // shuffled neighbour (negative control): the coefficients of the station 31 places on, at this station
    const o = stations[(stations.indexOf(s) + 31) % N];
    for (const v of ['t', 'u', 'clct']) ((loso.shuffle ??= {})[v] ??= []).push(rmsOf(o.mu[v], s.mu[v]));
  }
  const rms = (a) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);
  const R = Object.fromEntries(Object.entries(loso).map(([c, byV]) => [c, Object.fromEntries(Object.entries(byV).map(([v, a]) => [v, rms(a)]))]));
  // the truth carries a smooth 1,2-K spatial field no feature explains: the trends stop at ≈ 1,1–1,2 K, the neighbours see it (idw3 ≤ 1,0 K), kriging (trend + neighbour residuals) beats the plain trend
  add('13b Leave-Station-out: die Gelände-Trends holen Höhe/Lage/svf der T-Klimatologie zurück (RMS ≤ 1,3 K gegen ≥ 4 K der verwürfelten Nachbarn; der glatte 1,2-K-Feldanteil bleibt), idw3 mit Höhensteigung ≤ 1,0 K, ohne Höhensteigung ≥ 2,5 K (die Alpenhöhen); Kriging ≤ Trend; jede Kandidatin schlägt die Verwürfelung um mindestens den Faktor 2',
    R.ridgeT.t < 1.3 && R.krigT3.t < 1.3 && R.krigT3.t <= R.ridgeT.t && R.shuffle.t > 4 && R.idw3.t < 1.0 && R.idw3n.t > 2.5 && Object.keys(specs).every((c) => R[c].t * 2 < R.shuffle.t && R[c].u * 2 < R.shuffle.u),
    `T: ridgeT ${R.ridgeT.t.toFixed(2)} · krigT3 ${R.krigT3.t.toFixed(2)} · idw3 ${R.idw3.t.toFixed(2)} · idw3n ${R.idw3n.t.toFixed(2)} · shuffle ${R.shuffle.t.toFixed(2)} K; u: ridgeT ${R.ridgeT.u.toFixed(2)} · shuffle ${R.shuffle.u.toFixed(2)}`);
  add('13c Leck-Prüfung: in keiner der ' + (N * Object.keys(specs).length) + ' LOSO-Schätzungen steht die ausgelassene Station unter `used`', leaks.length === 0, leaks.slice(0, 3).join(', '));
  {
    // the deliberately leaking control: without `exclude` the estimate at a station's own place uses that station — the same check must catch it
    const s = stations[5], est = estimateCoefficients({ ...base, estimator: specs.idw3, lapse: lapseFor(null), trend: null }, { lat: s.lat, lon: s.lon, elevM: s.elevM, feat: s.feat }, {});
    const estX = estimateCoefficients({ ...base, estimator: specs.idw3, lapse: lapseFor(s.id), trend: null }, { lat: s.lat, lon: s.lon, elevM: s.elevM, feat: s.feat }, { exclude: s.id });
    add('13c′ Negativkontrolle (absichtlich leckend): ohne `exclude` steht die Station selbst unter `used`, ihr Abstand ist 0 und ihre Koeffizienten kommen (fast) unverändert zurück; mit `exclude` weder Station noch Abstand 0',
      est.used.includes(s.id) && est.nearestKm < 0.05 && Math.abs(est.mu.t[0] - s.mu.t[0]) < 0.05 && !estX.used.includes(s.id) && estX.nearestKm > 20 && Math.abs(estX.mu.t[0] - s.mu.t[0]) > 0.05,
      `used ${est.used.slice(0, 3).join(',')} · nearest ${est.nearestKm.toFixed(3)} / ${estX.nearestKm.toFixed(1)} km`);
  }
  // 13d byVar: cloud cover takes idw3 while T takes the trend (`how` names it); the composite equals its parts
  {
    const s = stations[10], trend = trendFor(s.id), lapse = lapseFor(s.id), target = { lat: s.lat, lon: s.lon, elevM: s.elevM, feat: s.feat };
    const comp = estimateCoefficients({ ...base, estimator: specs.ridgeTx, lapse, trend }, target, { exclude: s.id });
    const rg = estimateCoefficients({ ...base, estimator: specs.ridgeT, lapse, trend }, target, { exclude: s.id });
    const id3 = estimateCoefficients({ ...base, estimator: specs.idw3n, lapse, trend: null }, target, { exclude: s.id });
    const eq = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-12);
    add('13d byVar: ridgeTx rechnet T mit dem Trend (how ridge, byte-gleich zu ridgeT) und die Bewölkung mit idw3 (how idw, byte-gleich zu idw3 ohne Steigung); ohne Merkmale fällt der Trend benannt auf idw zurück',
      comp.how.t === 'ridge' && comp.how.clct === 'idw' && eq(Array.from(comp.mu.t), Array.from(rg.mu.t)) && eq(Array.from(comp.mu.clct), Array.from(id3.mu.clct))
      && estimateCoefficients({ ...base, estimator: specs.ridgeT, lapse, trend }, { ...target, feat: null }, { exclude: s.id }).how.t === 'idw-fallback',
      `how ${JSON.stringify(comp.how)}`);
  }
  // 13e muAt = the design row at the target's longitude times the coefficients; trendVector sets and order
  {
    const s = stations[3], est = { mu: { t: Float64Array.from(s.mu.t) }, nearestKm: 0, used: [], how: {} };
    const ms = Date.UTC(2025, 6, 15, 12), x = climaDesign(ms, s.lon), want = s.mu.t.reduce((a, b, i) => a + b * x[i], 0);
    const full = trendVector(s.site, s.lat), terr = trendVector(s.site, s.lat, TREND_SETS.terrain), geo = trendVector(s.site, s.lat, TREND_SETS.geo);
    let threw = false; try { trendVector(s.site, s.lat, ['1', 'nix']); } catch (e) { threw = /nix/.test(String(e?.message)); }
    add('13e muAt trägt Σ β·x an der Ziel-Länge; trendVector: full 22, terrain 12, geo 5 Spalten (Intercept 1, Höhe km, Höhe², Δlat, Δlon voran), unbekannter Name wirft benannt',
      Math.abs(muAt(est, ms, s.lon).t - want) < 1e-12 && full.length === TREND_NAMES.length && terr.length === 12 && geo.length === 5 && geo[0] === 1 && Math.abs(geo[1] - s.elevM / 1000) < 1e-12 && Math.abs(geo[3] - (s.lat - 48)) < 1e-12 && threw && terr[5] === full[5],
      `muAt ${muAt(est, ms, s.lon).t.toFixed(4)} · dims ${full.length}/${terr.length}/${geo.length}`);
  }
  // 13f validateClimaProduct: the synthetic product passes; wrong kind, unknown trend set, nested byVar, missing lapse with a height slope, missing licence are named
  {
    const ok = { ...base, estimator: specs.ridgeTx, lapse: null, trend: trendFor(null) };
    const v0 = validateClimaProduct(ok);
    const vKind = validateClimaProduct({ ...ok, kind: 'x' }), vSet = validateClimaProduct({ ...ok, trend: { ...ok.trend, names: ['1', 'hKm'] } });
    const vNest = validateClimaProduct({ ...ok, estimator: { ...specs.ridgeTx, byVar: { clct: { ...specs.idw3n, byVar: {} } } } });
    const vLapse = validateClimaProduct({ ...ok, estimator: specs.idw3, trend: null }), vLic = validateClimaProduct({ ...ok, licence: [] });
    const vIdw = validateClimaProduct({ ...ok, estimator: specs.idw3, lapse: lapseFor(null), trend: null });
    add('13f validateClimaProduct: gültiges Produkt ohne Befund (Trend- und idw-Form); kind, fremder Merkmalssatz, verschachteltes byVar, Höhensteigung ohne lapse und fehlende Lizenz werden benannt',
      v0.length === 0 && vIdw.length === 0 && vKind.some((e) => /^kind/.test(e)) && vSet.some((e) => /TREND_SETS/.test(e)) && vNest.some((e) => /byVar clct/.test(e)) && vLapse.some((e) => /lapse/.test(e)) && vLic.some((e) => /licence/.test(e)),
      [v0, vKind, vSet, vNest, vLapse, vLic].map((v) => v.join(';') || 'ok').join(' | '));
  }
  add('13g distKm: Wien–München ≈ 355 km (±5), Punkt zu sich selbst 0', Math.abs(distKm(48.21, 16.37, 48.14, 11.58) - 355) < 5 && distKm(47, 8, 47, 8) === 0);
}

// ── Block 14: phase FX-5 (E-FX-8, §6.5) — the μ_c column per VARIABLE (`design.mean.climaVars`): one decision (`climaColumnsFor`) for tables, predict and the fit; a listed variable needs μ_c, an unlisted one is predicted from the `none` design byte-identically; the narrowed product carries nothing for other variables; each with a negative control ──
{
  const { climaColumnsFor, parseClimaVars, validateTables, newTables } = await import('../src/point/fusionFit/tables.ts');
  const { meanDesignK, varianceDesign, CLIMA_NAMES, V_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { predict } = await import('../src/point/fusionFit/predict.ts');
  const { Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { validateClimaProduct, estimateCoefficients, CLIMA_PRODUCT_KIND, CLIMA_PRODUCT_SCHEMA, TREND_SETS } = await import('../src/point/fusionFit/climaProduct.ts');
  const { C_NAMES, C_DIM } = await import('../src/point/fusionFit/fitClima.ts');
  const eqArr = (a, b) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
  // 14a the decision: none table → none for every variable; station without a list → station for all; station + list → only the listed
  {
    const S = { clima: 'station' }, SL = { clima: 'station', climaVars: ['t', 'td', 'gust'] }, N = { clima: 'none' }, NL = { clima: 'none', climaVars: ['t'] };
    const all = ['t', 'td', 'u', 'v', 'gust', 'clct', 'precip'];
    add('14a climaColumnsFor: none-Tabelle ⇒ none für jede Größe (auch mit Liste); station ohne Liste ⇒ station für alle (Fit 5b/5c lesbar); station + [t,td,gust] ⇒ station nur dort, u/v/clct/precip none; undefined ⇒ none',
      all.every((v) => climaColumnsFor(N, v) === 'none' && climaColumnsFor(NL, v) === 'none' && climaColumnsFor(undefined, v) === 'none' && climaColumnsFor(S, v) === 'station')
      && ['t', 'td', 'gust'].every((v) => climaColumnsFor(SL, v) === 'station') && ['u', 'v', 'clct', 'precip'].every((v) => climaColumnsFor(SL, v) === 'none'));
    let e1 = '', e2 = '', e3 = '';
    try { parseClimaVars('t,x'); } catch (e) { e1 = String(e?.message); }
    try { parseClimaVars(''); } catch (e) { e2 = String(e?.message); }
    try { parseClimaVars('t,t'); } catch (e) { e3 = String(e?.message); }
    add('14a′ parseClimaVars: "t, td,gust" ⇒ [t,td,gust]; unbekannte Größe, leere Liste und Dublette werfen benannt', JSON.stringify(parseClimaVars('t, td,gust')) === '["t","td","gust"]' && /unbekannte Größe x/.test(e1) && /leer/.test(e2) && /doppelte/.test(e3), `${e1} · ${e2} · ${e3}`);
  }
  // 14b validateTables: the list needs a station table and FIT_VARS members; a listed variable's written entry must end with μ_c, an unlisted one must not (negative control: the same entries under a list-less station table are rejected the other way round)
  {
    const T = newTables('2026-09-27T00:00:00Z');
    const nT = designNames('K', 'r1', 'station'), nU = designNames('K', 'r1');
    const entry = (v, names) => ({ form: 'K', var: v, bin: 5, cls: 'r1', names, beta: names.map(() => 0.1), lambda: 1, n: 9000, days: 60, status: 'written', cv: { time: null, region: null, band: null } });
    const mk = (mean, climaVars, clima = 'station') => ({ ...T, design: { ...T.design, mean: { ...T.design.mean, clima, ...(climaVars ? { climaVars } : {}) } }, mean });
    const good = mk({ [stratumKey('K', 't', 5, 'r1')]: entry('t', nT), [stratumKey('K', 'u', 5, 'r1')]: entry('u', nU) }, ['t', 'td', 'gust']);
    const badU = mk({ [stratumKey('K', 'u', 5, 'r1')]: entry('u', nT) }, ['t', 'td', 'gust']);
    const badT = mk({ [stratumKey('K', 't', 5, 'r1')]: entry('t', nU) }, ['t', 'td', 'gust']);
    const noList = mk({ [stratumKey('K', 't', 5, 'r1')]: entry('t', nT), [stratumKey('K', 'u', 5, 'r1')]: entry('u', nU) }, null);
    const vGood = validateTables(good), vU = validateTables(badU), vT = validateTables(badT), vNo = validateTables(noList);
    const vX = validateTables(mk({}, ['t', 'x'])), vE = validateTables(mk({}, [])), vN = validateTables(mk({}, ['t'], 'none'));
    add('14b validateTables: [t,td,gust] mit t-Eintrag (μ_c) und u-Eintrag (ohne) gültig; u MIT μ_c benannt; t OHNE μ_c benannt; Negativkontrolle: dieselben Einträge ohne Liste ⇒ der u-Eintrag wird als "ohne μ_c" benannt; Liste mit fremder Größe, leere Liste und Liste ohne station benannt',
      vGood.length === 0 && vU.some((e) => /K\|u\|5\|r1: μ_c-Spalte, obwohl/.test(e)) && vT.some((e) => /K\|t\|5\|r1: ohne μ_c-Spalte/.test(e)) && vNo.some((e) => /K\|u\|5\|r1: ohne μ_c-Spalte/.test(e))
      && vX.some((e) => /climaVars: erwartet/.test(e)) && vE.some((e) => /climaVars: erwartet/.test(e)) && vN.some((e) => /climaVars ohne design.mean.clima = station/.test(e)),
      [vGood, vU, vT, vNo, vX, vE, vN].map((v) => v.join(';') || 'ok').join(' | '));
    // 14c predict: under the list, t needs μ_c (absent without), u is predicted without μ_c and byte-equal to the same β under a none table; under a list-less station table u needs μ_c too (negative control)
    const z = new Float64Array(Z_DIM); for (let i = 0; i < Z_DIM; i++) z[i] = 0.2 + 0.1 * i * (i % 2 ? 1 : -1);
    const bT = nT.map((_, i) => (i === Z_DIM ? 0.7 : i === nT.length - 1 ? 0.3 : 0)), bU = nU.map((_, i) => (i === Z_DIM ? 0.9 : 0));
    const ve = { form: 'K', var: 'x', bin: 5, cls: 'r1', c: V_NAMES.map((_, i) => (i === 0 ? 1 : 0)), floor: 0.01, n: 9000, days: 60, status: 'written' };
    const meanT = { ...entry('t', nT), beta: bT }, meanU = { ...entry('u', nU), beta: bU }, meanV = { ...entry('v', nU), beta: bU };
    const tab = (climaVars, clima = 'station') => ({ ...mk({ 'K|t|5|r1': meanT, 'K|u|5|r1': meanU, 'K|v|5|r1': meanV }, climaVars, clima), variance: { 'K|t|5|r1': { ...ve, var: 't' }, 'K|u|5|r1': { ...ve, var: 'u' }, 'K|v|5|r1': { ...ve, var: 'v' } }, occurrence: {}, amount: {}, speed: {} });
    const TL = tab(['t', 'td', 'gust']), TS = tab(null), TN = { ...tab(null, 'none'), mean: { 'K|u|5|r1': meanU, 'K|v|5|r1': meanV } };
    const sit = { z, leadH: 300, route: 1, srcMask: 1, srcCount: 3, dhM: 0, dTsfcK: null, k: { t: 10, u: 2, v: -1 }, p: {}, sigDiv: {}, sigEns: {}, wetShare: 0 };
    const pL = predict(TL, 'K', { ...sit, muC: { t: 4 } }), pLno = predict(TL, 'K', { ...sit, muC: {} }), pS = predict(TS, 'K', { ...sit, muC: { t: 4 } }), pN = predict(TN, 'K', sit);
    add('14c predict: unter [t,td,gust] braucht t μ_c (μ = 0,7·ȳ + 0,3·μ_c = 8,2; ohne μ_c absent), u/v rechnen ohne μ_c und sind byte-gleich zur none-Tabelle mit denselben β (Rice ν gleich); Negativkontrolle: die station-Tabelle OHNE Liste meldet u/v ohne μ_c als absent',
      Math.abs(pL.mu.t - 8.2) < 1e-9 && pLno.absent.includes('t') && !pLno.absent.includes('u') && pL.mu.u === pN.mu.u && pL.mu.v === pN.mu.v && pL.dist.windSpeed && pN.dist.windSpeed && pL.dist.windSpeed.nu === pN.dist.windSpeed.nu
      && pS.absent.includes('u') && pS.absent.includes('v') && Math.abs(pS.mu.t - 8.2) < 1e-9,
      `μ_t ${pL.mu.t} · u ${pL.mu.u} = ${pN.mu.u} · absent(list, no μ_c) ${pLno.absent.join(',')} · absent(station, u ohne μ_c) ${pS.absent.join(',')}`);
    void meanDesignK; void varianceDesign; void CLIMA_NAMES;
  }
  // 14d the narrowed product: `vars` [t,td,gust] with a trend only for those is valid; a trend, lapse or station coefficient for a variable outside `vars` is named; estimateCoefficients returns only the product's variables
  {
    const st = [{ id: 'A', lat: 48, lon: 10, elevM: 500, country: 'DE', mu: { t: new Array(C_DIM).fill(1) } }, { id: 'B', lat: 48.5, lon: 10.5, elevM: 700, country: 'DE', mu: {} }];
    const trend = (vars) => ({ names: TREND_SETS.geo, beta: Object.fromEntries(vars.map((v) => [v, Array.from({ length: C_DIM }, () => TREND_SETS.geo.map(() => 0.5))])), lambda: {} });
    const base = { schema: CLIMA_PRODUCT_SCHEMA, kind: CLIMA_PRODUCT_KIND, fitVersion: 'test', provenance: 'hindcast', builtAt: '2026-09-27T00:00:00Z', design: C_NAMES, estimator: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none' }, lapse: null, source: { clima: 'test', sha256: null, period: null, days: null, points: 2 }, licence: ['test'], notes: [] };
    const narrow = { ...base, vars: ['t', 'td', 'gust'], trend: trend(['t', 'td', 'gust']), stations: st.map((s) => ({ ...s, mu: {} })) };
    const vN = validateClimaProduct(narrow);
    const vTr = validateClimaProduct({ ...narrow, trend: trend(['t', 'td', 'gust', 'u']) });
    const vLa = validateClimaProduct({ ...narrow, estimator: { ...base.estimator, heightSlope: 'tTd' }, lapse: { t: new Array(C_DIM).fill(0), u: new Array(C_DIM).fill(0) } });
    const vSt = validateClimaProduct({ ...narrow, stations: st.map((s) => ({ ...s, mu: { u: new Array(C_DIM).fill(0) } })) });
    const vEmpty = validateClimaProduct({ ...narrow, vars: [] });
    const est = estimateCoefficients(narrow, { lat: 48.2, lon: 10.2, elevM: 600, feat: [1, 0.6, 0.36, 0.2, 0.2] });
    add('14d validateClimaProduct: Produkt mit vars [t,td,gust] und Trend nur dafür gültig; Trend/lapse/Stationskoeffizient für u werden benannt; leere vars benannt; estimateCoefficients liefert genau t, td, gust (kein u)',
      vN.length === 0 && vTr.some((e) => /^trend u: Größe nicht in vars/.test(e)) && vLa.some((e) => /^lapse u: Größe nicht in vars/.test(e)) && vSt.some((e) => /station A: mu u nicht in vars/.test(e)) && vEmpty.some((e) => /^vars$/.test(e))
      && JSON.stringify(Object.keys(est.mu).sort()) === '["gust","t","td"]',
      [vN, vTr, vLa, vSt, vEmpty].map((v) => v.join(';') || 'ok').join(' | ') + ` · est ${Object.keys(est.mu).join(',')}`);
  }
}

// ── Block 15: phase FV (`audit/fusion-validierung.md` §1.3, V-FX-44) — the row thinning of fit and scorer: `legacy` is the old rule
// bit for bit, `hash` keeps every station in every tier at the same row share; negative controls: the legacy rule and a naive
// product/XOR of the keys lose stations on the coarse tiers ──
{
  const { thinSelect, mix32, parseThin, THIN_MODES } = await import('./fusionfit/lib/thin.mjs');
  // 15a legacy = (validAtH + pointIdx) % stride for every key of a dense grid; unknown mode throws; absent flag = legacy
  {
    let same = 0, diff = 0;
    for (const s of [1, 4, 6, 12]) { const L = thinSelect('legacy', s); for (let v = 490_000; v < 490_400; v++) for (let p = 0; p < 405; p++) { if (L(v, p) === ((v + p) % s === 0)) same += 1; else diff += 1; } }
    let threw = false; try { thinSelect('random', 6); } catch { threw = true; }
    add('15a thin legacy = (validAtH + pointIdx) % stride an jedem Schlüssel (Stride 1/4/6/12, 648 000 Paare); fremder Modus wirft; fehlendes Flag = legacy',
      diff === 0 && same === 648_000 && threw && parseThin(undefined) === 'legacy' && parseThin(true) === 'legacy' && parseThin('hash') === 'hash' && JSON.stringify(THIN_MODES) === '["legacy","hash"]',
      `gleich ${same}, abweichend ${diff}, wirft ${threw}`);
  }
  // 15b the real data shape: 389 stations, 13 months of valid hours — t1 hourly, t2 3-hourly, t3 6-hourly (the case files' rasters)
  {
    const H0 = Math.floor(Date.UTC(2025, 8, 1) / 3_600_000), H1 = Math.floor(Date.UTC(2026, 8, 22) / 3_600_000);
    const tierStep = { t1: 1, t2: 3, t3: 6 };
    const naive = (s) => (v, p) => ((Math.imul(v, 0x9e3779b1) ^ Math.imul(p, 0x85ebca6b)) >>> 0) % s === 0;
    const survey = (sel) => {
      const out = {};
      for (const [t, step] of Object.entries(tierStep)) {
        const per = new Array(389).fill(0); let rows = 0, kept = 0;
        for (let v = H0; v < H1; v += step) for (let p = 0; p < 389; p++) { rows += 1; if (sel(v, p)) { kept += 1; per[p] += 1; } }
        const withRows = per.filter((x) => x > 0).length, share = kept / rows, perShare = per.map((x) => x / (rows / 389));
        out[t] = { withRows, share, minShare: Math.min(...perShare), maxShare: Math.max(...perShare) };
      }
      return out;
    };
    const h6 = survey(thinSelect('hash', 6)), h12 = survey(thinSelect('hash', 12));
    const l6 = survey(thinSelect('legacy', 6)), l12 = survey(thinSelect('legacy', 12)), n6 = survey(naive(6));
    const allKept = (o, s) => Object.values(o).every((x) => x.withRows === 389 && Math.abs(x.share - 1 / s) < 0.005 && x.minShare > 0.5 / s && x.maxShare < 1.5 / s);
    add('15b hash hält jede der 389 Stationen in t1/t2/t3 bei Stride 6 und 12, Zeilenanteil ±0,5 %-Pkt um 1/Stride, je Station 0,5–1,5 × 1/Stride; Negativkontrollen: die alte Regel behält bei Stride 6 in t3 65 und in t2 130 Stationen (= V-FX-44, gemessen in diag-fv0-thin), ein naives Produkt/XOR der Schlüssel verliert ebenfalls Stationen',
      allKept(h6, 6) && allKept(h12, 12) && l6.t3.withRows === 65 && l6.t2.withRows === 130 && l6.t1.withRows === 389 && l12.t3.withRows < 389 && Object.values(n6).some((x) => x.withRows < 389),
      `hash/6 ${Object.entries(h6).map(([t, x]) => `${t} ${x.withRows} (${(100 * x.share).toFixed(2)} %, je Station ${(6 * x.minShare).toFixed(2)}…${(6 * x.maxShare).toFixed(2)})`).join(' · ')} · legacy/6 ${Object.entries(l6).map(([t, x]) => `${t} ${x.withRows}`).join(' ')} · legacy/12 t3 ${l12.t3.withRows} · naiv/6 ${Object.entries(n6).map(([t, x]) => `${t} ${x.withRows}`).join(' ')}`);
  }
  // 15c both scripts select rows through thin.mjs only — no hand-written `% stride` row rule left (list check, not a count)
  {
    const src = (f) => readFileSync(join(import.meta.dirname, 'fusionfit', f), 'utf8');
    const fitS = src('fit.mjs'), scoreS = src('score.mjs');
    const oldRule = /\(\s*(?:b\.)?cols\.validAtH\[i\]\s*\+\s*(?:b\.)?cols\.pointIdx\[i\]\s*\)\s*%\s*stride/;
    const negative = oldRule.test('(b.cols.validAtH[i] + b.cols.pointIdx[i]) % stride === 0');
    add('15c fit.mjs und score.mjs wählen Zeilen nur über lib/thin.mjs (Import + thinSelect), keine eigene (validAtH + pointIdx) % stride-Regel mehr; Negativkontrolle: das Muster erkennt die alte Zeile',
      negative && /from '\.\/lib\/thin\.mjs'/.test(fitS) && /from '\.\/lib\/thin\.mjs'/.test(scoreS) && /thinSelect\(thin, stride\)/.test(fitS) && /thinSelect\(thin, stride\)/.test(scoreS) && !oldRule.test(fitS) && !oldRule.test(scoreS),
      `Muster erkennt die alte Zeile: ${negative}`);
    void mix32;
  }
}

// ── Block 16: phase FV stage 2 (`audit/fusion-validierung.md` §1.6, §1.7) — the archive adapter on a synthetic slot of the real
// form (schema 1 and 2), the frozen fold rule, the leave-station-out μ_c as a one-station product, the distribution scores of the
// archive scorer; each with a negative control ──
{
  const A = await import('./fusionfit/lib/archiveAdapter.mjs');
  const { scoreDist, qs3Of, quantiles3 } = await import('./fusionfit/lib/distScore.mjs');
  const { crpsNormal, crpsOf } = await import('../src/pointForecast/fusion/dist.ts');
  const { crpsByCdf } = await import('./fusionfit/lib/stats.mjs');
  const { estimateCoefficients, muAt } = await import('../src/point/fusionFit/climaProduct.ts');
  const { C_DIM: CD, climaDesign: cDes } = await import('../src/point/fusionFit/fitClima.ts');
  const H = 3_600_000, S = A.ARCHIVE_SENTINEL;
  const runAt = '2026-09-22T21:00:00Z', runMs = Date.parse(runAt), slotAtMs = Date.parse('2026-09-22T23:20:00Z');
  const mkSlot = (schema) => ({
    kind: 'punktarchiv/slot', schema, slotAt: new Date(slotAtMs).toISOString(), slotAtMs, index: { commit: 'x' },
    scales: { cube: { t1: { t2m: { scale: 0.01, offset: 0 }, u10: { scale: 0.02, offset: 0 }, hModEff: { scale: 1, offset: 0 } } }, truth: { t: { scale: 0.01, offset: 0 }, ff: { scale: 0.01, offset: 0 }, dd: { scale: 1, offset: 0 }, fx: { scale: 0.01, offset: 0 }, fxh: { scale: 0.01, offset: 0 }, rr1: { scale: 0.01, offset: 0 }, rr1h: { scale: 0.01, offset: 0 }, n: { scale: 0.1, offset: 0 } } },
    points: [{ id: 'P1', name: 'ONE', lat: 48, lon: 11, elev: 500, demM: 480, country: 'DE' }, { id: 'P2', name: 'TWO', lat: 47, lon: 14, elev: 1500, demM: 1200, country: 'AT' }],
    cube: { t1: { run: '2026092221', runAt, sourceRun: '2026092221', sourceRunAt: runAt, leadHours: [0, 1, 2], sources: [{ id: 'icon_d2', runAt, steps: 3, stepsCoverage: 'full' }],
      byPoint: { P1: { cell: { iy: 1, ix: 2, lat: 48.01, lon: 11.02, offsetKm: 1.5 }, hModEffM: 510, belowGroundHPa: [[], [925], []], planes: { t2m: [1000, 1100, S], u10: [100, 150, 200], hModEff: [510, 510, 510] }, empty: ['clct'] } } } },
    nowcast: { scale: { mmh: { scale: 0.01, offset: 0, unit: 'mm/h' } }, byPoint: { P1: { covering: ['radvor_rv'], bySource: { radvor_rv: { stamp: '2609222320', slotAgeMin: 0, probes: 1, extrapolationH: 2, validAtSuspect: null,
      frames: [{ lead: 0, validAtMs: slotAtMs, mmh: 150, saturated: false }, { lead: 5, validAtMs: slotAtMs + 5 * 60_000, mmh: S, saturated: false }, { lead: 10, validAtMs: slotAtMs + 10 * 60_000, mmh: 0, saturated: false }] } } } } },
    stations: { run: '2026092221', runAt, ageAtBuildH: 1.7, leadHours: [1, 2], scales: { t2m: { scale: 0.01, offset: 0 } },
      byPoint: { P1: { station: { id: 'P1', distanceKm: 0.1, dElevM: 300 }, planes: { t2m: [900, 950] } }, P2: { station: { id: 'X', distanceKm: 5, dElevM: 150 }, planes: { t2m: [100, 110] } } } },
    truth: { byPoint: {
      P1: { poi: { obsAtMs: [slotAtMs - 2 * H + 20 * 60_000 - 20 * 60_000, slotAtMs - 20 * 60_000 - 20 * 60_000 + 20 * 60_000], t: [1500, 1400], ff: [300, S], dd: [270, S], fx: [800, S], fxh: [S, S], rr1: [10, 0], n: [500, 600] } },
      P2: { poi: { obsAtMs: [slotAtMs - 20 * 60_000], t: [0] }, tawes: { obsAtMs: [slotAtMs - 20 * 60_000, slotAtMs + 40 * 60_000], t: [300, 999], ff: [100, 100], dd: [0, 0], fx: [900, 900], ...(schema >= 2 ? { fxh: [1000, 1000] } : {}), rr1: [60, 60], rr1h: [20, 20] } },
    } },
  });
  const s2 = mkSlot(2), s1 = mkSlot(1);
  // 16a cube series: the slot's own scales and sentinel, validAt = runAt + lead, belowGround carried, no block
  {
    const ser = A.archiveSeries(s2, 't1', 'P1');
    const wrongScale = 150 * 0.01;   // the u10 plane dequantised with a foreign 0,01 scale instead of the slot's 0,02
    add('16a archiveSeries: Werte mit den Skalen DES SLOTS (u10 150 × 0,02 = 3 m/s), Sentinel ⇒ null, leere Ebene null, Gültigzeit = runAt + Vorlauf, belowGroundHPa je Schritt, neighbours [] (PAP 3 mit N = 1); Negativkontrolle: fremde Skala gäbe 1,5 m/s; fehlender Punkt ⇒ null',
      ser && ser.steps.length === 3 && Math.abs(ser.steps[1].values.u10 - 3) < 1e-12 && ser.steps[1].values.u10 !== wrongScale && ser.steps[2].values.t2m === null && ser.steps[0].values.clct === null
      && ser.steps[2].validAtMs === runMs + 2 * H && JSON.stringify(ser.steps[1].belowGroundHPa) === '[925]' && Array.isArray(ser.neighbours) && ser.neighbours.length === 0 && ser.hModEffM === 510 && A.archiveSeries(s2, 't1', 'P2') === null,
      `u10 ${ser?.steps[1].values.u10} · t2m[2] ${ser?.steps[2].values.t2m} · validAt[2] ${ser && new Date(ser.steps[2].validAtMs).toISOString()}`);
  }
  // 16b station selection (today's client rule): at the point (≤ 0,25 km) the height criterion falls; 5 km with |Δh| > 100 m is rejected; schema-1 height from demM
  {
    const a = A.archiveStation(s2, 'P1', 500), b = A.archiveStation(s2, 'P2', 1500), a1 = A.archiveStation(s1, 'P1', 500);
    add('16b archiveStation: Station 0,1 km am Punkt mit Δh 300 m angenommen (E-F-12), 5 km mit Δh 150 m abgelehnt (SELECTION 100 m); Stationshöhe Schema 2 = elev + dElevM (800), Schema 1 = demM + dElevM (780); Schritte = runAt + Vorlauf mit den Stationsskalen',
      a.series && !b.series && /vertritt den Punkt nicht/.test(b.reason) && a.series.station.elev === 800 && a1.series.station.elev === 780 && a.series.steps[0].validAtMs === runMs + H && Math.abs(a.series.steps[1].values.t2m - 9.5) < 1e-12,
      `${a.reason} · ${b.reason} · Schema 1 Höhe ${a1.series?.station.elev}`);
  }
  // 16c truth network per point = the hindcast's; fxh / POI fx; rr1 vs rr1h; nothing from POI at an AT point
  {
    const ctry = (id) => (id === 'P1' ? 'DE' : 'AT');
    const t2 = A.archiveTruth(s2, ctry), t1 = A.archiveTruth(s1, ctry);
    const p1 = t2.get('P1'), p2 = t2.get('P2'), p2s1 = t1.get('P2');
    add('16c archiveTruth: DE ⇒ poi, AT ⇒ tawes (auch wenn der Punkt POI trägt — Negativkontrolle: die POI-Reihe des AT-Punkts, t = 0 °C, wird nie gelesen); Böe = fxh bzw. POI-fx; Schema 1 TAWES ohne fxh ⇒ null; Niederschlag POI rr1 / TAWES rr1h',
      p1.net === 'poi' && p2.net === 'tawes' && p2.rows[0].t === 3 && p1.rows[0].fxh === 8 && p2.rows[0].fxh === 10 && p2s1.rows[0].fxh === null && p1.rows[0].rr === 0.1 && p2.rows[0].rr === 0.2 && !p2.rows.some((r) => r.t === 0),
      `P1 ${p1.net} fxh ${p1.rows[0].fxh} rr ${p1.rows[0].rr} · P2 ${p2.net} t ${p2.rows[0].t} fxh ${p2.rows[0].fxh} (Schema 1 ${p2s1.rows[0].fxh}) rr ${p2.rows[0].rr}`);
  }
  // 16d the anchor input: the latest reading ≤ slotAt; a reading after the slot (+40 min) is never taken
  {
    const ctry = (id) => (id === 'P1' ? 'DE' : 'AT');
    const tr = A.archiveTruth(s2, ctry);
    const o = A.archiveObs(s2, tr.get('P2'), { id: 'P2', name: 'TWO', lat: 47, lon: 14, elevM: 1500 });
    add('16d archiveObs: jüngste Messung ≤ slotAt (TAWES 23:00, t 3 °C, Wind aus ff/dd, Böe fxh), die Messung 40 min NACH dem Slot (t 9,99 °C) wird nie genommen (Negativkontrolle), Abstand 0, Stationshöhe',
      o.length === 1 && o[0].validAtMs <= slotAtMs && o[0].temperature === 3 && o[0].gust === 10 && o[0].distanceM === 0 && o[0].elevM === 1500 && Math.abs(o[0].v + 1) < 1e-12,
      `obs ${o.map((x) => `${new Date(x.validAtMs).toISOString().slice(11, 16)} t ${x.temperature} v ${x.v?.toFixed(2)}`).join(' ')}`);
  }
  // 16e the frozen fold rule: issue ≤ hindcast end ⇒ half-month of the valid time, capped at 2026-09b; month table ⇒ 2026-09; after ⇒ full
  {
    const END = Date.parse('2026-09-21T23:59:59.999Z'), iss14 = Date.parse('2026-09-14T20:46:00Z'), iss21 = Date.parse('2026-09-21T23:21:00Z'), iss22 = Date.parse('2026-09-22T23:20:00Z');
    const k = (sch, i, v) => A.foldKeyFV(sch, i, Date.parse(v), END);
    const naiveOct = (() => { const d = new Date('2026-10-01T06:00:00Z'); return `${d.toISOString().slice(0, 7)}${d.getUTCDate() <= 15 ? 'a' : 'b'}`; })();
    add('16e foldKeyFV (§1.7 eingefroren): Ausgabe 14.09. Gültigkeit 15.09. ⇒ 2026-09a, 16.09. ⇒ 2026-09b; Ausgabe 21.09. 23:21 (vor Tagesende) Gültigkeit 01.10. ⇒ 2026-09b (gedeckelt — Negativkontrolle: die Scorer-Regel „Halbmonat der Gültigzeit" gäbe 2026-10a, einen Schlüssel ohne Falten ⇒ volle β = Leck); Monatstabelle ⇒ 2026-09; Ausgabe 22.09. ⇒ null (volle Tabellen)',
      k('half', iss14, '2026-09-15T12:00:00Z') === '2026-09a' && k('half', iss14, '2026-09-16T00:00:00Z') === '2026-09b' && k('half', iss21, '2026-10-01T06:00:00Z') === '2026-09b' && naiveOct === '2026-10a'
      && k('month', iss14, '2026-09-30T00:00:00Z') === '2026-09' && k('half', iss22, '2026-09-23T00:00:00Z') === null && k('month', iss22, '2026-09-23T00:00:00Z') === null,
      `naiv ${naiveOct}`);
  }
  // 16f the LOSO μ_c as a one-station product: estimateCoefficients returns the station's LOSO vector unchanged, μ_c(t) = the scorer's dot product; negative control: the station's own climatology gives another μ_c
  {
    const loso = Array.from({ length: CD }, (_, j) => 10 - 0.3 * j), own = Array.from({ length: CD }, (_, j) => 12 + 0.1 * j);
    const T = { fitVersion: 'fusionFit@3', builtAt: 'x', design: { mean: { clima: 'station', climaVars: ['t', 'td', 'gust'] } }, climaMu: { candidate: 'ridgeTx', byPoint: { P1: { t: loso, td: loso, gust: loso, u: loso } } } };
    const prod = A.losoClimaProduct(T, { id: 'P1', name: 'ONE', lat: 48, lon: 11, elevM: 500, country: 'DE' });
    const est = estimateCoefficients(prod, { lat: 48, lon: 11, elevM: 500, feat: null });
    const ms = Date.parse('2026-09-23T12:00:00Z'), x = new Float64Array(CD); cDes(ms, 11, x);
    const dot = (m) => m.reduce((s, c, j) => s + c * x[j], 0);
    const mu = muAt(est, ms, 11);
    add('16f losoClimaProduct: Ein-Stations-Produkt (idw k 1, ohne Höhensteigung) ⇒ estimateCoefficients gibt den LOSO-Vektor exakt zurück, μ_c(t) = Skalarprodukt wie score.mjs muCOfTable, nur die gelisteten Größen (u nicht); Negativkontrolle: die eigene Stationsklimatologie gäbe ein anderes μ_c',
      prod && JSON.stringify(Array.from(est.mu.t)) === JSON.stringify(loso) && Math.abs(mu.t - dot(loso)) < 1e-9 && Math.abs(mu.t - dot(own)) > 1 && !('u' in est.mu) && JSON.stringify(prod.vars) === '["t","td","gust"]' && A.losoClimaProduct({ ...T, climaMu: null }, { id: 'P1' }) === null,
      `μ_c(t) ${mu.t?.toFixed(3)} = ${dot(loso).toFixed(3)} (eigene ${dot(own).toFixed(3)})`);
  }
  // 16h the radar rates are integer-coded like every archive column (`nowcast.scale.mmh` 0,01 mm/h — V-FV-2: FV-A run 1 read them raw)
  {
    const nc = A.archiveNowcast(s2, 'P1');
    const f = nc.nowcast[0]?.frames ?? [];
    let threw = false; try { A.archiveNowcast({ ...s2, nowcast: { ...s2.nowcast, scale: undefined } }, 'P1'); } catch { threw = true; }
    add('16h archiveNowcast: Radarrate mit der Skala des Slots (150 ⇒ 1,5 mm/h), Sentinel ⇒ null, 0 bleibt 0, covering durchgereicht; Negativkontrolle: roh gelesen wären es 150 mm/h (V-FV-2, FV-A Lauf 1); ohne Skala wirft der Anpasser statt zu raten',
      Math.abs(f[0]?.mmh - 1.5) < 1e-12 && f[0].mmh !== 150 && f[1]?.mmh === null && f[2]?.mmh === 0 && JSON.stringify(nc.covering) === '["radvor_rv"]' && threw,
      `mmh ${f.map((x) => x.mmh).join(' / ')} · ohne Skala wirft ${threw}`);
  }
  // 16g the distribution scores: the dist.ts primitives of score.mjs; QS3 of a point value = |e|; QS3 of Normal quantiles is proper (the true quantiles beat shifted ones on average)
  {
    const dn = { kind: 'normal', mu: 2, sigma: 1.5 }, dr = { kind: 'rice', nu: 3, sigma: 1 }, dc = { kind: 'censoredNormal', mu: 40, sigma: 30, lo: 0, hi: 100 };
    const a = scoreDist(dn, 3.1, 0.3), b = scoreDist(dr, 2, 0.3), c = scoreDist(dc, 100, 0.3);
    let good = 0, bad = 0; const g = lcg(7); g();
    for (let i = 0; i < 4000; i++) { const u1 = Math.max(1e-12, g()), u2 = g(); const y = 2 + 1.5 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); good += qs3Of(quantiles3(dn), y); bad += qs3Of(quantiles3({ ...dn, mu: 3 }), y); }
    add('16g distScore: Normal-CRPS = crpsNormal, Rice-CRPS = CDF-Integral (riceN 96) wie score.mjs, zensiert = crpsOf(…, 256), Punktwert zensiert = Median; QS3 eines Punktwerts = |Fehler| (beide Vorzeichen); Negativkontrolle Eigentlichkeit: um 1 σ verschobene Quantile verlieren im Mittel (4 000 Züge)',
      Math.abs(a.crps - crpsNormal(2, 1.5, 3.1)) < 1e-12 && Math.abs(b.crps - crpsByCdf(dr, 2, 0, 3 + 8 + 1, 96)) < 1e-12 && Math.abs(c.crps - crpsOf(dc, 100, 256)) < 1e-12 && Math.abs(qs3Of([1.5, 1.5, 1.5], 2) - 0.5) < 1e-12 && Math.abs(qs3Of([1.5, 1.5, 1.5], 1) - 0.5) < 1e-12 && good < bad,
      `QS3 wahr ${(good / 4000).toFixed(4)} gegen verschoben ${(bad / 4000).toFixed(4)}`);
  }
  // 16i (phase AX, V-AX-4): readArchiveSlot reads schema 1, 2 AND 3 (PA4, the archive since 29.09.2026 — cube/stations/nowcast/truth
  // unchanged, live.fusion columnar via the AP9 decoder) and still refuses an unknown schema and a foreign kind
  {
    const { gzipSync } = await import('node:zlib');
    const dir = mkdtempSync(join(tmpdir(), 'fusionfit-slot-'));
    const wr = (name, obj) => { const p = join(dir, name); writeFileSync(p, gzipSync(Buffer.from(JSON.stringify(obj)))); return p; };
    const s3 = mkSlot(3), r3 = A.readArchiveSlot(wr('s3.json.gz', s3));
    const ser3 = A.archiveSeries(r3, 't1', 'P1'), tr3 = A.archiveTruth(r3, (id) => (id === 'P1' ? 'DE' : 'AT'));
    let threw5 = false, threwKind = false;
    // AX §6j (01.10.2026): schema 4 adds `stationsS` (the MOSMIX-S series, same form) and `incaAnalysis` — read like schema 3;
    // `archiveStation(…, 'stationsS')` reads the S block, null where a slot does not carry it; schema 5 is still refused
    const s4 = mkSlot(4); s4.stationsS = { ...s4.stations, product: 'mosmix_s' };
    const r4 = A.readArchiveSlot(wr('s4.json.gz', s4));
    const stS4 = A.archiveStation(r4, 'P1', 500, 'stationsS'), stS3 = A.archiveStation(r3, 'P1', 500, 'stationsS');
    try { A.readArchiveSlot(wr('s5.json.gz', mkSlot(5))); } catch { threw5 = true; }
    try { A.readArchiveSlot(wr('sk.json.gz', { ...mkSlot(3), kind: 'punktarchiv/index' })); } catch { threwKind = true; }
    rmSync(dir, { recursive: true, force: true });
    add('16i readArchiveSlot (V-AX-4, AX §6j): Schema 3 wird gelesen wie Schema 2 (Serie, Wahrheit und Station gleich dekodiert); Schema 4 ebenso, archiveStation(…, \'stationsS\') liest die MOSMIX-S-Reihe und ist null, wo der Slot sie nicht trägt; Negativkontrollen: Schema 5 und ein fremder kind werfen; die Liste der lesbaren Schemata ist [1, 2, 3, 4]',
      r3?.schema === 3 && ser3 && Math.abs(ser3.steps[1].values.u10 - 3) < 1e-12 && tr3.get('P2')?.rows[0].fxh === 10 && A.archiveStation(r3, 'P1', 500).series?.station.elev === 800
        && r4?.schema === 4 && A.archiveSeries(r4, 't1', 'P1') && stS4.series?.station.elev === 800 && stS3.series === null && threw5 && threwKind && JSON.stringify(A.ARCHIVE_SCHEMAS_READABLE) === '[1,2,3,4]',
      `Schema ${r3?.schema}/${r4?.schema} · u10 ${ser3?.steps[1].values.u10} · fxh ${tr3.get('P2')?.rows[0].fxh} · S-Reihe in 4 ${stS4.series ? 'ja' : 'nein'}, in 3 ${stS3.series ? 'ja' : 'null'} · Schema 5 wirft ${threw5} · fremder kind wirft ${threwKind}`);
  }
}

// ── Block 17: phase FS (`audit/fusion-stationswert.md` §2.2) — the fitted station-value candidates: recovery of known b, w, c, the
// leave-day-out purge (a leak planted in the neighbouring valid day must not reach the fold), the forms per row, each with a negative control ──
{
  const F = await import('./fusionfit/lib/stackFit.mjs');
  const g = lcg(4711); g();
  const gauss = () => { const u1 = Math.max(1e-12, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
  // 17a recovery: r = 0,3 + 0,7·I + 0,2·D + noise over 12 valid days
  {
    const s = new F.FoldSums();
    for (let d = 0; d < 12; d++) for (let i = 0; i < 400; i++) { const I = 1.5 * gauss(), D = 1.2 * gauss(); s.add('k', d, F.FORMS.S.x(I, D), 0.3 + 0.7 * I + 0.2 * D + 0.5 * gauss()); }
    const f = s.fit('k', null), fo = s.fit('k', 5);
    const few = new F.FoldSums(); for (let i = 0; i < 50; i++) few.add('k', 0, [1, gauss()], gauss());
    const ff = few.fit('k', null);
    add('17a stackFit: b, w, c aus 4 800 Zeilen zurückgewonnen (0,3 / 0,7 / 0,2 auf ±0,03), σ = Residuen-rms 0,5, die Falte ohne die Gültigtage 4–6 zählt 3 600 Zeilen; Negativkontrolle: unter 200 Zeilen bleibt der Kandidat MOSMIX (Parameter 0, nicht geschrieben)',
      f.written && Math.abs(f.beta[0] - 0.3) < 0.03 && Math.abs(f.beta[1] - 0.7) < 0.03 && Math.abs(f.beta[2] - 0.2) < 0.03 && Math.abs(f.sigma - 0.5) < 0.03 && fo.n === 3600 && !ff.written && ff.beta.every((x) => x === 0),
      `β ${f.beta.map((x) => x.toFixed(3)).join(' / ')} σ ${f.sigma.toFixed(3)} · Falte n ${fo.n}`);
  }
  // 17b the purge: the truth of valid day 6 is planted as the predictor on the days 5…7 (the same truth under neighbouring issue days);
  // the fold of day 6 must not see it — without the purge (purge 0) the neighbours leak
  {
    const s = new F.FoldSums();
    for (let d = 0; d < 12; d++) for (let i = 0; i < 300; i++) { const r = gauss(); const leak = d >= 5 && d <= 7; s.add('k', d, [1, leak ? r : gauss()], r); }
    const purged = s.fit('k', 6), naive = s.fit('k', 6, { purge: 0 }), all = s.fit('k', null);
    add('17b Leave-Day-out mit Sperre ±1 Gültigtag: die Falte des Tages 6 sieht das in den Tagen 5–7 gepflanzte Leck nicht (w ≈ 0); Negativkontrolle: ohne Sperre (nur der Tag selbst) und im In-sample-Fit trägt das Leck ein Gewicht',
      Math.abs(purged.beta[1]) < 0.05 && naive.beta[1] > 0.1 && all.beta[1] > 0.15 && purged.n === 2700 && naive.n === 3300,
      `w gesperrt ${purged.beta[1].toFixed(3)} · ohne Sperre ${naive.beta[1].toFixed(3)} · in-sample ${all.beta[1].toFixed(3)}`);
  }
  // 17c forms, groups, values
  {
    const v0 = F.stackValue(12.34, [1, 0.7, -2], [0, 0, 0], false), v1 = F.stackValue(1, [1, -3], [0, 1], true), v2 = F.stackValue(1, [1, -3], [0, 1], false);
    const dW = F.stackDist('ws', -0.4, 0.8), dT = F.stackDist('t', 3, 1.1);
    add('17c Formen: mit Innovation und Lernstufe S, ohne Lernstufe AB, ohne Innovation S0/B, mosmix+anker ohne Innovation = MOSMIX (null); τ-Gruppen 1…6 einzeln, 7–12 … 121–240, außerhalb −1; Nullform = MOSMIX exakt; Wind/Böe bei 0 begrenzt und zensiert; Negativkontrolle: ohne Grenze wäre der Wind negativ',
      F.formOf('stack', 1, 1) === 'S' && F.formOf('stack', 1, null) === 'AB' && F.formOf('stack', null, 1) === 'S0' && F.formOf('stack', null, null) === 'B' && F.formOf('mosmix+anker', null, 1) === null && F.formOf('mosmix+anker+bias', null, 1) === 'B'
      && F.tauGroup(1) === 0 && F.tauGroup(6) === 5 && F.tauGroup(7) === 6 && F.tauGroup(12) === 6 && F.tauGroup(48) === 8 && F.tauGroup(240) === 10 && F.tauGroup(241) === -1 && F.tauGroup(0) === -1 && F.tauGroup(null) === -1
      && v0 === 12.34 && v1 === 0 && v2 === -2 && dW.kind === 'censoredNormal' && dW.lo === 0 && dT.kind === 'normal',
      `Nullform ${v0} · Wind begrenzt ${v1} (unbegrenzt ${v2})`);
  }
  // 17d distance
  {
    const km = F.haversineKm(48.137, 11.575, 47.421, 10.985);   // München – Zugspitze ≈ 91 km
    add('17d haversineKm: München – Zugspitze 88–94 km, ein Punkt zu sich selbst 0; Negativkontrolle: vertauschte Achsen geben eine andere Strecke',
      km > 88 && km < 94 && F.haversineKm(48, 11, 48, 11) === 0 && Math.abs(F.haversineKm(11.575, 48.137, 10.985, 47.421) - km) > 5, `${km.toFixed(1)} km`);
  }
}

const passed = checks.filter((c) => c.ok).length;
console.log(`\nverify:fusion-fit ${passed}/${checks.length}`);
if (passed !== checks.length) process.exit(1);
