/**
 * verify:sea-contract — Phase SW (audit/seewetter.md §4): every rule of `src/sea/seaContract.ts` against good and bad
 * cases — paths, run stamps, client clock rules, value rules, run gate (quarantine cases), spot series lock, spot
 * catalogue rules, flag. The field fixtures are the real CWAM excerpts of `verify:sea-decode`; a bad case copies the
 * real field and changes only what is under test.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-contract.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGrib2 } from '../src/sources/gribDecode.ts';
import { decompressBz2 } from './lib/bz2.mjs';
import {
  SEA_MODELS, SEA_PARAMS, SEA_PARAMS_READ, SEA_PARAMS_NEVER, SEA_F_STEPS, SEA_C_STEPS, SEA_SPOT_STEPS, SEA_RETENTION,
  seaRunStamp, seaRunMs, seaRunOf, seaExpectedRun, seaFreshness, seaFieldStepAt, seaCompStepAt, seaFieldPath, seaCompPath,
  seaRunJsonPath, seaSpotsPath, seaTextPath, seaMaskHashPath, seaGribUrl, SEA_CDN_BASE, SEA_RAW_BASE, SEA_REPO_DIR,
  newCounts, cleanHs, cleanDir, cleanPeriod, cleanPeakWindSea, invalidShareOk, validateSeaRun, packMask,
  encodeSpotValue, decodeSpotValue, spotSeriesProblems, sanitizeGust, spotCatalogProblems, SEA_SPOT_VARS, SEA_SPOT_ORIGIN, seaFlagFrom, SEA_LIVE,
  SEA_STALE_MS, SEA_DEAD_MS, SEA_RUN_GATE_MS,
} from '../src/sea/seaContract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'lib', 'fixtures', 'sea', 'cwam-2026100700');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const T = (iso) => Date.parse(iso);

// --- P: paths and stamps -----------------------------------------------------------------------------
add('P1 Pfade versioniert unter sea/v1, Lauf-/Ausgabedateien unveränderlich je Pfad',
  SEA_REPO_DIR === 'sea/v1' && SEA_CDN_BASE.endsWith('@main/sea/v1') && SEA_RAW_BASE.endsWith('/main/sea/v1')
  && seaFieldPath('cwam', '2026100700', 7) === 'run/cwam/2026100700/f/007.png' && seaCompPath('cwam', '2026100712', 78) === 'run/cwam/2026100712/c/078.png'
  && seaRunJsonPath('cwam', '2026100700') === 'run/cwam/2026100700/run.json' && seaSpotsPath('2026100700') === 'spots/2026100700.json'
  && seaTextPath('WODL45', '2610071200') === 'text/WODL45/2610071200.json' && seaMaskHashPath('cwam') === 'static/mask-cwam.hash',
  seaFieldPath('cwam', '2026100700', 7));
add('P2 DWD-Pfad wie im Inventar', seaGribUrl('cwam', '2026100700', 'swh', 24) === 'https://opendata.dwd.de/weather/maritime/wave_models/cwam/grib/00/swh/CWAM_SWH_2026100700_024.grib2.bz2', seaGribUrl('cwam', '2026100700', 'swh', 24));
add('P3 Laufstempel hin und zurück; nur 00/12 UTC gültig', seaRunStamp(seaRunMs('2026100712')) === '2026100712' && Number.isNaN(seaRunMs('2026100706')) && Number.isNaN(seaRunMs('2026023100')) && seaRunOf(T('2026-10-07T17:59:00Z')) === T('2026-10-07T12:00:00Z'), '');
add('P4 Schritte: f 59 (0–48 stündlich, 51–78 dreistündlich), c 27, Spots 79', SEA_F_STEPS.length === 59 && SEA_F_STEPS[48] === 48 && SEA_F_STEPS[49] === 51 && SEA_F_STEPS[58] === 78 && SEA_C_STEPS.length === 27 && SEA_SPOT_STEPS.length === 79,
  `${SEA_F_STEPS.length}/${SEA_C_STEPS.length}/${SEA_SPOT_STEPS.length}`);
add('P5 Feldschritt zur Stunde: 49 → 48, 52 → 51, 78 → 78, 79 → keiner; Komponenten 4 → 3, 5 → 6',
  seaFieldStepAt(49) === 48 && seaFieldStepAt(52) === 51 && seaFieldStepAt(78) === 78 && seaFieldStepAt(79) === null && seaCompStepAt(4) === 3 && seaCompStepAt(5) === 6, '');
add('P6 Modelle: Seepunkte CWAM 124 011 / EWAM 138 388 / GWAM 686 000, Dateien 13 × 79 / 13 × 79 / 13 × 59',
  SEA_MODELS.cwam.seaPoints === 124011 && SEA_MODELS.ewam.seaPoints === 138388 && SEA_MODELS.gwam.seaPoints === 686000
  && SEA_PARAMS.length * SEA_MODELS.cwam.steps.length === 1027 && SEA_PARAMS.length * SEA_MODELS.gwam.steps.length === 767, '');
add('P7 WAM-Wind (sp_10m, dd_10m) wird nie gelesen und nie veröffentlicht', SEA_PARAMS_NEVER.every((p) => !SEA_PARAMS_READ.includes(p)) && SEA_PARAMS_READ.length === 11
  && !SEA_SPOT_VARS.some((v) => /sp_10m|dd_10m/.test(v)) && SEA_SPOT_ORIGIN.wind === 'fusion' && SEA_SPOT_ORIGIN.gust === 'fusion' && SEA_SPOT_ORIGIN.windDir === 'fusion', SEA_PARAMS_READ.join());

// --- K: client clock rules ----------------------------------------------------------------------------
const run0 = T('2026-10-07T00:00:00Z');
add('K1 erwarteter Lauf: 04:59 UTC ⇒ Vortag 12 UTC, 05:00 ⇒ 00 UTC (Tor + 5 h)', seaExpectedRun(T('2026-10-07T04:59:00Z')) === T('2026-10-06T12:00:00Z') && seaExpectedRun(T('2026-10-07T05:00:00Z')) === run0 && SEA_RUN_GATE_MS === 5 * 3600e3, '');
add('K2 Frische: 17 h live, 19 h „veraltet“, 31 h „Keine Daten“, Kill-Schalter „Keine Daten“ (Prüffrage 4)',
  seaFreshness(run0, run0 + 17 * 3600e3) === 'live' && seaFreshness(run0, run0 + 19 * 3600e3) === 'stale' && seaFreshness(run0, run0 + 31 * 3600e3) === 'dead'
  && seaFreshness(run0, run0 + 3600e3, true) === 'dead' && SEA_STALE_MS === 18 * 3600e3 && SEA_DEAD_MS === 30 * 3600e3, '');
add('K3 Aufbewahrung: aktueller + voriger Lauf, Texte 48 h', SEA_RETENTION.runsKept === 2 && SEA_RETENTION.textMaxAgeMs === 48 * 3600e3, JSON.stringify(SEA_RETENTION));

// --- V: value rules -----------------------------------------------------------------------------------
const c = newCounts();
const v = [cleanHs(-0.1, c), cleanHs(25, c), cleanHs(12.7, c), cleanHs(1.2, c), cleanDir(400, c), cleanDir(359.9, c),
  cleanPeriod(31, 1, c), cleanPeriod(1.0, 0.02, c), cleanPeriod(1.0, 0.5, c), cleanPeriod(1.0, null, c), cleanPeakWindSea(13, 0.2, c), cleanPeakWindSea(13, 0.5, c), cleanPeakWindSea(11, 0.1, c)];
add('V1 Hs −0,1 und 25 m ⇒ null (gezählt), 12,70 m ⇒ bleibt, gekappt gezählt; 1,2 bleibt', v[0] === null && v[1] === null && v[2] === 12.7 && v[3] === 1.2 && c.clipped === 1, JSON.stringify(v.slice(0, 4)));
add('V2 Richtung 400° ⇒ null; 359,9° bleibt', v[4] === null && v[5] === 359.9, '');
const cd = newCounts();
add('V2b GRIB-Packung: 360,001° ⇒ 0,001°, −0,03° ⇒ 359,97°, 360,2° ⇒ null (Toleranz ±0,05°)', Math.abs(cleanDir(360.001, cd) - 0.001) < 1e-9 && Math.abs(cleanDir(-0.03, cd) - 359.97) < 1e-9 && cleanDir(360.2, cd) === null && cd.invalid === 1, JSON.stringify(cd));
const gs = { wind: [100, 138, 50], gust: [120, 131, 54] };
add('V2c Böe unter Wind (echter Fall Fehmarn +42 h: 13,1 < 13,8 m/s) ⇒ diese Stunde Böe null, gezählt; Wind bleibt; 5,4 bei 5,0 bleibt', sanitizeGust(gs) === 1 && gs.gust[1] === null && gs.gust[0] === 120 && gs.gust[2] === 54 && gs.wind[1] === 138, JSON.stringify(gs));
add('V3 Periode 31 s ⇒ null; 1,0 s bei Hs 0,02 ⇒ null (Platzhalter); 1,0 s bei Hs 0,5 bleibt', v[6] === null && v[7] === null && v[8] === 1.0 && v[9] === null, JSON.stringify(v.slice(6, 10)));
add('V4 ppww 13 s bei shww 0,2 ⇒ null (Artefakt); bei 0,5 bleibt; 11 s bei 0,1 bleibt', v[10] === null && v[11] === 13 && v[12] === 11 && c.ppwwArtefact === 1, JSON.stringify(v.slice(10)));
add('V5 Zählung: außerhalb 4 (Hs ×2, Richtung, Periode), Platzhalter 2', c.invalid === 4 && c.placeholder === 2, JSON.stringify(c));
add('V6 Feld mit 0,1 % außerhalb frei, mit 0,11 % gesperrt', invalidShareOk({ ...newCounts(), cells: 124011, invalid: 124 }) && !invalidShareOk({ ...newCounts(), cells: 124011, invalid: 137 }), '');

// --- R: run gate on the real field --------------------------------------------------------------------
const f = decodeGrib2(new Uint8Array(await decompressBz2(readFileSync(join(DIR, 'CWAM_SWH_2026100700_024.grib2.bz2')))));
const grid = { ni: f.ni, nj: f.nj, lat1: f.lat1, lon1: f.lon1, lat2: f.lat2, lon2: f.lon2, di: f.di, dj: f.dj };
const hash = (vals) => createHash('sha256').update(packMask(vals)).digest('hex');
const mask = hash(f.values);
const good = { model: 'cwam', run: '2026100700', inventoryFiles: 1027, grids: [grid], seaPoints: [124011], maskHashes: [mask], expectedMaskHash: mask, counts: [{ ...newCounts(), cells: 124011 }] };
const r0 = validateSeaRun(good);
add('R1 echter Lauf: vollständig, Gitter/Maske/Seepunkte wie Vertrag ⇒ frei', r0.publish && !r0.quarantine, JSON.stringify(r0.reasons));
const r1 = validateSeaRun({ ...good, inventoryFiles: 1026 });
add('R2 1 026 statt 1 027 Dateien ⇒ nicht frei, KEINE Quarantäne (letzter guter Lauf bleibt)', !r1.publish && !r1.quarantine && r1.reasons[0].rule === 'incomplete', JSON.stringify(r1.reasons));
const moved = Float32Array.from(f.values); const k0 = moved.findIndex((x) => !Number.isNaN(x)); moved[k0] = NaN;
const r2 = validateSeaRun({ ...good, maskHashes: [hash(moved)], seaPoints: [124010] });
add('R3 eine Seezelle weniger (echtes Feld, eine Zelle maskiert) ⇒ Quarantäne (Maske + Seepunkte)', !r2.publish && r2.quarantine && r2.reasons.some((x) => x.rule === 'mask') && r2.reasons.some((x) => x.rule === 'seaPoints'), r2.reasons.map((x) => x.rule).join());
const r3 = validateSeaRun({ ...good, grids: [{ ...grid, nj: 386 }] });
add('R4 fremdes Gitter ⇒ Quarantäne', !r3.publish && r3.quarantine && r3.reasons[0].rule === 'grid', JSON.stringify(r3.reasons));
const r4 = validateSeaRun({ ...good, counts: [{ ...newCounts(), cells: 124011, invalid: 200 }] });
add('R5 200 Werte außerhalb (0,16 %) ⇒ Quarantäne', !r4.publish && r4.quarantine && r4.reasons[0].rule === 'invalidShare', JSON.stringify(r4.reasons));
const r5 = validateSeaRun({ ...good, expectedMaskHash: null });
add('R6 erster Lauf ohne gespeicherten Maskenhash ⇒ frei (Hash wird abgelegt)', r5.publish, '');
const r6 = validateSeaRun({ ...good, maskHashes: [mask, hash(moved)], seaPoints: [124011, 124011] });
add('R7 zwei verschiedene Masken im selben Lauf ⇒ Quarantäne', r6.quarantine && r6.reasons.some((x) => x.rule === 'mask'), r6.reasons.map((x) => x.rule).join());

// --- S: spot series and catalogue ----------------------------------------------------------------------
const series = Object.fromEntries(SEA_SPOT_VARS.map((k) => [k, SEA_SPOT_STEPS.map(() => encodeSpotValue(k, k.endsWith('Dir') || k === 'dir' ? 300 : k === 'wind' ? 8 : k === 'gust' ? 11 : 1.2))]));
add('S1 Spot-Reihe: Kodierung Hs cm, Periode 0,1 s, Wind 0,1 m/s, Richtung ganzzahlig 0–359; gültige Reihe ohne Befund',
  encodeSpotValue('hs', 1.234) === 123 && decodeSpotValue('tm', 64) === 6.4 && encodeSpotValue('wind', 8.26) === 83 && encodeSpotValue('windDir', 360) === 0 && encodeSpotValue('hs', null) === null
  && spotSeriesProblems(series).length === 0, JSON.stringify(spotSeriesProblems(series).slice(0, 2)));
const bad = { ...series, hs: series.hs.map((x, i) => (i === 3 ? -5 : x)), gust: series.gust.map((x, i) => (i === 7 ? 40 : x)), tm: series.tm.slice(1) };
const probs = spotSeriesProblems(bad);
add('S2 Spot-Reihe gesperrt bei Hs < 0, Böe deutlich unter Wind, falscher Länge', probs.some((p) => p.startsWith('hs[3]')) && probs.some((p) => p.startsWith('gust[7]')) && probs.some((p) => p.startsWith('tm: Länge')), probs.join(' | '));
const spot = { id: 'st-peter-ording', name: 'St. Peter-Ording', region: 'nordsee', kinds: ['kite'], lat: 54.3, lon: 8.62, normal: 265, normalFrom: 'mask', cell: { model: 'cwam', i: 172, j: 256, km: 1.2 }, seaArea: null, coast: null, wodlCoast: 'Nordseekueste', station: null };
const cp = spotCatalogProblems([spot, { ...spot }, { ...spot, id: 'Bad Id', lat: 50 }, { ...spot, id: 'far', cell: { ...spot.cell, km: 4 } }, { ...spot, id: 'n', normal: 360 }]);
add('S3 Katalog: doppelte Kennung, kein Slug, außerhalb CWAM, Zelle > 3 km, Ufernormale 360° werden gemeldet',
  cp.some((p) => p.includes('doppelt')) && cp.some((p) => p.includes('kein Slug')) && cp.some((p) => p.includes('außerhalb CWAM')) && cp.some((p) => p.includes('4 km')) && cp.some((p) => p.includes('Ufernormale 360')) && spotCatalogProblems([spot]).length === 0,
  cp.join(' | '));

// --- F: flag ----------------------------------------------------------------------------------------------
add('F1 Phasen-Flag: SEA_LIVE aus; ?sea=1 an; ?sea=0 schlägt localStorage „1“; localStorage „1“ ohne Query an',
  SEA_LIVE === false && seaFlagFrom('', null) === false && seaFlagFrom('?sea=1', null) === true && seaFlagFrom('?sea=0', '1') === false && seaFlagFrom('', '1') === true, '');

const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`\nverify:sea-contract — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
