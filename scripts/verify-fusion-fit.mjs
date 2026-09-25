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
  const { dmTest, bootstrapSkill, benjaminiHochberg, ScoreAcc, BrierAcc, EtsAcc, PairAcc, crpsByCdf } = await import('./fusionfit/lib/stats.mjs');
  const { crpsNormal, crpsOf } = await import('../src/pointForecast/fusion/dist.ts');
  const rnd = lcg(5);
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  // 9a DM: a candidate that is better by 0,2 on every day is significant and negative; pure noise is not
  const better = new Map(), noise = new Map();
  for (let d = 0; d < 120; d++) { better.set(d, [-0.2 * 30 + 0.3 * gauss() * Math.sqrt(30), 30]); noise.set(d, [0.3 * gauss() * Math.sqrt(30), 30]); }
  const dmB = dmTest(better), dmN = dmTest(noise);
  add('9a Diebold–Mariano (HAC): Gewinn signifikant negativ, Rauschen nicht', dmB.stat < -3 && dmB.p < 0.01 && Math.abs(dmN.stat) < 2.5 && dmN.p > 0.01, `stat ${dmB.stat.toFixed(2)} p ${dmB.p.toExponential(1)} · Rauschen stat ${dmN.stat.toFixed(2)}`);
  // 9b bootstrap over days brackets the true skill
  const bd = new Map();
  for (let d = 0; d < 80; d++) bd.set(d, [0.8 * 20 + 2 * gauss(), 1.0 * 20 + 2 * gauss()]);
  const ci = bootstrapSkill(bd);
  add('9b Block-Bootstrap: 90-%-Intervall umschließt den wahren Skill 0,2', ci && ci[0] < 0.2 && ci[1] > 0.2 && ci[1] - ci[0] < 0.2, `[${ci?.map((x) => x.toFixed(3)).join(', ')}]`);
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

const passed = checks.filter((c) => c.ok).length;
console.log(`\nverify:fusion-fit ${passed}/${checks.length}`);
if (passed !== checks.length) process.exit(1);
