/**
 * verify:sea-sight — Phase SG (`audit/seewetter-sicht-konvektion.md`): sight and the shower/thunderstorm hint on /seewetter.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-sight.mjs
 *
 * Fixtures `scripts/lib/fixtures/sea/sight/` are REAL files, unchanged (sha256 below, `.gitattributes -text`):
 *   repack/index.json                     the index of buscosun-data as published 18.11.2026 19:07 UTC (four runs)
 *   repack/runs/2026111815/*.png          four images of run 18.11. 15 UTC: thunder steps 0 and 12, cape steps 6 and 27
 *   poi-10091.csv / -10020 / -10130       DWD POI files fetched 18.11. 19:38 UTC: Arkona (visibility in every row),
 *                                         List/Sylt (no visibility at all), Elpersbüttel (one empty row)
 *   dmi-06096-visib.json / -06149         DMI metObs answers 18.11. 20:01 UTC: Rømø/Juvre (values), Gedser (none)
 * plus the spot files of phase SU (`su-*.json`) and the bulletins of `audit/seewetter/fixtures/`.
 *
 *   A  contract: class rules at their thresholds, scales and thresholds hang on the constants they name, value lock, merge
 *   B  sight hint: the two parts of roadVsVis.ts at the class limits, snow share, missing input
 *   C  repack: fixtures byte-exact; the run that is read; values at a cell against an independent decode (with negative
 *      controls); scale drift, old run, unreadable index, missing image, point outside the domain
 *   D  series: hours before, inside and beyond the horizon of the two families; rain chance; interpolated hours
 *   E  producer: wind refresh end to end (columns, document block), without the engine's steps the old file shape,
 *      SEA_SIGHT=0, an unreadable repack never stops the wind
 *   F  client: old and new files, broken columns, the refresh, "keine Daten" instead of a stale or missing value
 *   G  measured visibility: POI rows against the file's own text, unit, age, station without visibility; DMI answers
 *   H  the official line verbatim and complete
 *   I  planner and classes: the first convective hour; the hints never reach passt / knapp / außerhalb
 *   J  words and display without a browser: hint not warning, fog only "möglich", no "sicher", no switch; band and card markup
 *   K  archive: the columns are carried and named, POI rows carry visibility, DMI visibility per day
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { decodePng } from './lib/png.mjs';
import {
  SEA_CONV, SEA_VIS, SEA_REPACK_SCALE, SEA_SPOT_STEPS, SEA_SIGHT_VARS, convClassOf, visCodeOf, visClassOfCode, spotSightProblems, mergeSpotSight,
  sightMetaOf, seaConvStale, hasSight, emptySightColumns, seaSpotsPath, seaSpotsWindPath,
} from '../src/sea/seaContract.ts';
import { dirRepack, pickRepackRun, readFamily, readRepack, fusionSightSteps, visCodeAt, spotSightSeries, sightFor, REPACK_SOURCE } from './sea/sea-sight.mjs';
import { windRefresh } from './sea/sea-derive.mjs';
import { parsePoi, archiveSea } from './sea/sea-archive.mjs';
import * as S from '../src/sea/seaSight.ts';
import { parseSpotsDoc, mergeWindDoc, readSpotSight } from '../src/sea/seaClient.ts';
import * as P from '../src/sea/seaPlanner.ts';
import { classify, SEA_PROFILE_BY_ID } from '../src/sea/seaProfiles.ts';
import { hazeVisibilityM, precipVisibilityM } from '../src/road/vs/roadVsVis.ts';
import { thunderLevelOf } from '../src/radar/thunderPotential.ts';
import { capeScore } from '../src/radar/convectiveIndex.ts';
import { THUNDER_VMIN, THUNDER_VMAX } from '../src/sources/scalarFrameBuild.ts';
import { CAPE_MAX } from '../src/scalar/RainLayer.ts';
import { RAIN_GATE_P } from '../src/nowcast/rainGate.ts';
import { parseSeaBulletin } from '../src/sea/seaText.ts';
import { dmiObsLatest, DMI_OBS_MAX_AGE_MS } from '../src/sea/seaDmi.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIXS = join(HERE, 'lib', 'fixtures', 'sea');
const FIX = join(FIXS, 'sight');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const clone = (x) => JSON.parse(JSON.stringify(x));
const tmp = mkdtempSync(join(tmpdir(), 'sea-sight-'));
const H = 3_600_000, N = SEA_SPOT_STEPS.length;
const T = (iso) => Date.parse(iso);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const src = (f) => readFileSync(join(ROOT, 'src', 'sea', f), 'utf8');

// --- A: contract ---------------------------------------------------------------------------------------------------
const cc = (thunder, capeJkg, pWet) => convClassOf({ thunder, capeJkg, pWet });
add('A1 Gewitter möglich genau ab Index 30 UND Regenchance 30 % (darunter Schauer bzw. kein Hinweis)',
  cc(30, 0, 0.3) === 2 && cc(29.99, 0, 0.3) === 1 && cc(30, 0, 0.2999) === 0 && cc(100, 4000, 0.29) === 0 && cc(30, null, 1) === 2, [cc(30, 0, 0.3), cc(29.99, 0, 0.3), cc(30, 0, 0.2999)].join('/'));
add('A2 Schauer möglich ab CAPE 100 J/kg ODER Index 8, jeweils ab 30 % Regenchance',
  cc(0, 100, 0.3) === 1 && cc(0, 99.9, 0.3) === 0 && cc(8, 0, 0.3) === 1 && cc(7.99, 0, 0.3) === 0 && cc(7.99, 99.9, 1) === 0 && cc(8, 100, 0.29) === 0);
add('A3 jenseits des Gewitter-Index spricht nur CAPE: höchstens „Schauer möglich“, auch bei 4000 J/kg', cc(null, 4000, 1) === 1 && cc(null, 99, 1) === 0);
add('A4 keine Aussage ohne beide Repack-Werte oder ohne Regenchance (nie eine Klasse aus einer Lücke)',
  cc(null, null, 0.9) === null && cc(50, 500, null) === null && cc(NaN, NaN, 0.9) === null && cc(50, 500, NaN) === null);
add('A5 Schwellen hängen an den Konstanten, die sie nennen: Stufen des Gewitter-Index, erster Stützpunkt von capeScore, Regen-Kante der Anzeigen',
  thunderLevelOf(SEA_CONV.thunderShower - 0.01).level === 'none' && thunderLevelOf(SEA_CONV.thunderShower).level === 'low'
  && thunderLevelOf(SEA_CONV.thunderStorm - 0.01).level === 'low' && thunderLevelOf(SEA_CONV.thunderStorm).level === 'elevated'
  && capeScore(SEA_CONV.capeShowerJkg) === 5 && capeScore(SEA_CONV.capeShowerJkg / 2) === 2.5 && SEA_CONV.rainChance === RAIN_GATE_P,
  `Index ${SEA_CONV.thunderShower}/${SEA_CONV.thunderStorm} · CAPE ${SEA_CONV.capeShowerJkg} · P ${SEA_CONV.rainChance}`);
add('A6 Skalen des Repack = die Konstanten seines Producers (THUNDER_VMIN/VMAX, CAPE_MAX)',
  SEA_REPACK_SCALE.thunder[0] === THUNDER_VMIN && SEA_REPACK_SCALE.thunder[1] === THUNDER_VMAX && SEA_REPACK_SCALE.cape[0] === 0 && SEA_REPACK_SCALE.cape[1] === CAPE_MAX);
add('A7 Sicht-Code an den Klassengrenzen 10 km und 4 km; „Nebel möglich“ nur aus dem Feuchte-Teil',
  visCodeOf(10_000, null) === 0 && visCodeOf(9_999, null) === 1 && visCodeOf(20_000, 9_999) === 2 && visCodeOf(20_000, 10_000) === 0 && visCodeOf(9_999, 300) === 3
  && visCodeOf(4_000, null) === 1 && visCodeOf(3_999, null) === 4 && visCodeOf(20_000, 50) === 2 && visCodeOf(null, 50) === null && visCodeOf(NaN, null) === null);
add('A8 drei grobe Klassen aus fünf Codes', [0, 1, 2, 3, 4, null, 5].map(visClassOfCode).join() === 'gut,eingeschraenkt,eingeschraenkt,eingeschraenkt,nebel,,');
const okCols = emptySightColumns(); okCols.conv[5] = 2; okCols.vis[5] = 4;
const bad = (f) => { const c = clone(okCols); f(c); return spotSightProblems(c); };
add('A9 Wertsperre: gültige Spalten bestehen; jede kaputte wird gefangen (Wert, Bruch, Länge, fremde Spalte, kein Objekt)',
  spotSightProblems(okCols).length === 0 && bad((c) => { c.conv[1] = 3; }).length === 1 && bad((c) => { c.vis[1] = 5; }).length === 1 && bad((c) => { c.vis[1] = 0.5; }).length === 1
  && bad((c) => { c.conv[1] = -1; }).length === 1 && bad((c) => { c.conv.pop(); }).length === 1 && bad((c) => { c.fog = []; }).length === 1 && bad((c) => { delete c.vis; }).length === 1 && spotSightProblems(null).length === 1);
const mb = emptySightColumns(), mu = emptySightColumns(); mb.conv[3] = 1; mb.conv[10] = 1; mb.vis[3] = 2; mu.conv[10] = 0; mu.vis[11] = 4;
const mm = mergeSpotSight(mb, mu, 8);
add('A10 Zusammenführen ab Stunde `from`: davor der Lauf, danach die Auffrischung samt ihrer Lücken; ohne Auffrischung danach nichts',
  mm.conv[3] === 1 && mm.vis[3] === 2 && mm.conv[10] === 0 && mm.vis[11] === 4 && mm.vis[9] === null && mergeSpotSight(mb, null, 8).conv[10] === null && mergeSpotSight(mb, null, 8).conv[3] === 1 && hasSight(mm) && !hasSight(emptySightColumns()));
const metaOk = { conv: { state: 'ok', run: '2026111815', runMs: T('2026-11-18T15:00:00Z'), thunderTo: T('2026-11-19T03:00:00Z'), capeTo: T('2026-11-19T18:00:00Z'), source: REPACK_SOURCE }, vis: { state: 'ok' }, spots: 3 };
add('A11 Dokumentblock: gültig gelesen; „none“ nur mit Grund; alles andere ist kein Block (alte Datei)',
  sightMetaOf(metaOk)?.conv.state === 'ok' && sightMetaOf({ conv: { state: 'none', why: 'x' }, vis: { state: 'ok' } })?.conv.why === 'x' && sightMetaOf({ conv: { state: 'none' }, vis: { state: 'ok' } }) === null
  && sightMetaOf({ ...metaOk, conv: { ...metaOk.conv, run: '18.11.' } }) === null && sightMetaOf(undefined) === null && sightMetaOf({ conv: metaOk.conv }) === null);
add('A12 ein Repack-Lauf älter als 12 h gilt als veraltet (Grenze: 12 h gilt noch)',
  !seaConvStale(metaOk.conv.runMs, metaOk.conv.runMs + 12 * H) && seaConvStale(metaOk.conv.runMs, metaOk.conv.runMs + 12 * H + 1) && seaConvStale(NaN, 0) && SEA_CONV.maxRunAgeH === SEA_CONV.thunderMaxLeadH);

// --- B: sight hint from the road line's diagnosis -----------------------------------------------------------------
const vAt = (tC, tdC, rr = 0, pSnow = 0) => visCodeAt({ tC, tdC, rr, pSnow });
const spread10 = ((SEA_VIS.reducedM / 1000 - 1) / 19) * 2, spread4 = ((SEA_VIS.fogM / 1000 - 1) / 19) * 2;
add('B1 Feuchte-Teil: die Klassengrenzen liegen bei den Taupunktdifferenzen, die hazeVisibilityM auf 10 km und 4 km setzt (0,947 K / 0,316 K)',
  Math.abs(hazeVisibilityM(10, 10 - spread10) - 10_000) <= 1 && vAt(10, 10 - spread10 - 0.01) === 0 && vAt(10, 10 - spread10 + 0.01) === 1 && vAt(10, 10 - spread4 - 0.01) === 1 && vAt(10, 10 - spread4 + 0.01) === 4 && vAt(10, 10) === 4,
  `${spread10.toFixed(3)} K / ${spread4.toFixed(3)} K`);
add('B2 Niederschlagsteil entscheidet nur Ja/Nein unter 10 km (≈ 0,1 mm/h Regen): nie „Nebel möglich“, auch bei 20 mm/h',
  precipVisibilityM(0.09, 0) > 10_000 && precipVisibilityM(0.11, 0) < 10_000 && vAt(10, 5, 0.09) === 0 && vAt(10, 5, 0.11) === 2 && vAt(10, 5, 20) === 2 && precipVisibilityM(20, 0) < 300 && vAt(10, 9.5, 20) === 3,
  `${precipVisibilityM(0.09, 0)} m / ${precipVisibilityM(0.11, 0)} m`);
add('B3 Schneeanteil: dieselbe Menge als Schnee greift früher (0,05 mm/h: Regen nein, Schnee ja); Anteil außerhalb 0–1 wird begrenzt',
  vAt(0, -5, 0.05, 0) === 0 && vAt(0, -5, 0.05, 1) === 2 && vAt(0, -5, 0.05, 7) === 2 && vAt(0, -5, 0.05, -3) === 0);
add('B4 ohne Temperatur oder Taupunkt keine Klasse (auch bei Niederschlag)', vAt(null, 5, 3) === null && vAt(10, null, 3) === null && visCodeAt(null) === null && visCodeAt({}) === null);

// --- C: the repack, byte-exact ------------------------------------------------------------------------------------
const SHA = {
  'repack/index.json': '0edda4b258204b41c5a4b7524444ce40f98c1c6f92422d774b4179c0ac8b97b2',
  'repack/runs/2026111815/cape-006.png': '708642e38ca13c3ee4c8633d679e5a2ff0087de088c8fd3bccf0a3ab7ffe35b2',
  'repack/runs/2026111815/cape-027.png': '05634f3d45d4bdfdf4273ce3e27a042087b4792d9ce413cadb8718e32eb58041',
  'repack/runs/2026111815/thunder-000.png': 'a91b00d00769f156a1bf9ad825625daa3b6ccad0257bdbde93ec711fdbcdf598',
  'repack/runs/2026111815/thunder-012.png': '7e52f7244dbed85518463b32f6c4af87b9f808b93c4b782f2d9d581ad116c50a',
  'poi-10020.csv': '5bba9d90cfee5e4ad04ecf86b61cc206435373f44d70810d2ae90f991d762bf4',
  'poi-10091.csv': '2e36b014553f381e78a3476d6d6b162a0b8bf789acbe9aa68dcbe723f96e83db',
  'poi-10130.csv': '1519ceb05c6bbc39f6250c332b3a4524eace12f071cfd9df8472a3346dfff964',
  'dmi-06096-visib.json': 'd98f4189a31fbb22c08163461e0a143691a5f1414c47e38d0b4c56807c53649d',
  'dmi-06149-visib.json': '2bf4543835954b26fb3f95d8c695aa5e5f0feb84db6ddefca95cb17a9f311405',
};
const shaBad = Object.entries(SHA).filter(([f, h]) => sha(readFileSync(join(FIX, f))) !== h).map(([f]) => f);
add('C0 Fixtures byte-genau (SHA-256 vom Abruf, .gitattributes -text greift)', shaBad.length === 0, shaBad.join(' ') || `${Object.keys(SHA).length}/${Object.keys(SHA).length}`);
const RDIR = join(FIX, 'repack');
const reader = dirRepack(RDIR);
const INDEX = JSON.parse(readFileSync(join(RDIR, 'index.json'), 'utf8'));
const RUN15 = T('2026-11-18T15:00:00Z');
const NOW = T('2026-11-18T16:30:00Z');
const pick = pickRepackRun(INDEX, NOW);
add('C1 gelesen wird der neueste Lauf, der nicht in der Zukunft liegt: 15 UTC um 16:30 (der Index nennt schon 18 UTC); Schritte 0–12 und 0–27',
  pick.run === '2026111815' && pick.runMs === RUN15 && pick.thunder.steps.size === 13 && pick.cape.steps.size === 28 && pick.thunder.width === 608 && pick.cape.width === 1215
  && pickRepackRun(INDEX, T('2026-11-18T19:10:00Z')).run === '2026111818', `${pick.run} · thunder ${pick.thunder?.steps.size} · cape ${pick.cape?.steps.size}`);
// Independent decode: the brightest cell of an image, its position from the corners by the formula of the grid itself.
const brightest = (file, grid, alpha) => {
  const p = decodePng(readFileSync(join(RDIR, 'runs', '2026111815', file)));
  let best = -1, k = -1;
  for (let i = 0; i < p.width * p.height; i++) { if (alpha && !p.data[i * 2 + 1]) continue; const v = p.data[i * p.channels]; if (v > best) { best = v; k = i; } }
  const col = k % p.width, row = Math.floor(k / p.width), c = grid.corners;
  return { raw: best, col, row, lon: c.nw[0] + (col / (p.width - 1)) * (c.ne[0] - c.nw[0]), lat: c.nw[1] - (row / (p.height - 1)) * (c.nw[1] - c.sw[1]), png: p };
};
const R15 = INDEX.runs.find((r) => r.run === '2026111815');
const bT0 = brightest('thunder-000.png', R15.grid, true), bT12 = brightest('thunder-012.png', R15.grid, true), bC6 = brightest('cape-006.png', R15.cape.grid, false);
const dLon = (R15.grid.corners.ne[0] - R15.grid.corners.nw[0]) / (R15.grid.width - 1);
const cells = [
  { id: 't0', lat: bT0.lat, lon: bT0.lon }, { id: 't12', lat: bT12.lat, lon: bT12.lon }, { id: 'c6', lat: bC6.lat, lon: bC6.lon },
  { id: 'off', lat: bT0.lat, lon: bT0.lon + 3 * dLon }, { id: 'out', lat: 60.5, lon: 8 }, { id: 'sea', lat: 54.18, lon: 7.9 },
];
const rp = await readRepack({ reader, cells, nowMs: NOW });
const near = (a, b, eps = 1e-9) => a != null && Math.abs(a - b) <= eps;
add('C2 Wert an der Zelle = unabhängige Dekodierung: hellste Zelle des Gewitter-Bilds (Schritt 0 und 12) und des CAPE-Bilds (Schritt 6)',
  rp.state === 'ok' && near(rp.thunder.get(0).t0, (bT0.raw / 255) * 100) && near(rp.thunder.get(12).t12, (bT12.raw / 255) * 100) && near(rp.cape.get(6).c6, (bC6.raw / 255) * 4000) && bT0.raw > 100 && bC6.raw > 20,
  `Index ${rp.thunder?.get(0)?.t0?.toFixed(1)} (roh ${bT0.raw}) · ${rp.thunder?.get(12)?.t12?.toFixed(1)} · CAPE ${rp.cape?.get(6)?.c6?.toFixed(0)} J/kg`);
const flipped = { ...pick.thunder, steps: new Map([[0, 'thunder-000.png']]), quad: [pick.thunder.quad[3], pick.thunder.quad[2], pick.thunder.quad[1], pick.thunder.quad[0]] };
const rf = await readFamily({ reader, path: 'runs/2026111815', fam: flipped, kind: 'thunder', cells });
add('C2n Negativkontrolle: drei Zellen daneben und mit vertauschten Nord-/Süd-Ecken steht an der Stelle ein anderer Wert',
  rp.thunder.get(0).off !== rp.thunder.get(0).t0 && rf.steps.get(0).t0 !== rp.thunder.get(0).t0, `daneben ${rp.thunder.get(0).off?.toFixed(1)} · gespiegelt ${rf.steps.get(0).t0?.toFixed?.(1) ?? rf.steps.get(0).t0}`);
add('C3 Punkt außerhalb des Bilds: kein Wert (nie 0); Punkt in der Deutschen Bucht: ruhige Lage (Index ≤ 3, CAPE < 100 J/kg)',
  rp.thunder.get(0).out === null && rp.cape.get(6).out === null && rp.thunder.get(0).sea <= 3 && rp.cape.get(6).sea < 100, `Bucht ${rp.thunder.get(0).sea?.toFixed(1)} / ${rp.cape.get(6).sea?.toFixed(0)} J/kg`);
add('C4 fehlende Bilder (der Ausschnitt trägt 4 von 41): nur die vorhandenen Schritte tragen Werte, die Reichweite endet beim letzten gelesenen',
  [...rp.thunder.keys()].join() === '0,12' && [...rp.cape.keys()].join() === '6,27' && rp.thunderTo === RUN15 + 12 * H && rp.capeTo === RUN15 + 27 * H);
const drift = clone(INDEX); for (const r of drift.runs) r.thunder.vMax = 50;
const pd = pickRepackRun(drift, NOW);
const drift2 = clone(drift); for (const r of drift2.runs) r.cape.vMax = 5000;
add('C5 Skalen-Drift: eine Familie mit fremder Skala wird nicht gelesen; beide fremd ⇒ kein Lauf, mit Grund',
  pd.run === '2026111815' && pd.thunder === null && pd.cape?.steps.size === 28 && !pickRepackRun(drift2, NOW).run && /Skala/.test(pickRepackRun(drift2, NOW).why));
const old = await readRepack({ reader, cells, nowMs: T('2026-11-19T07:00:01Z') });
const older = pickRepackRun({ runs: [R15] }, RUN15 + 12 * H + 1), edge = pickRepackRun({ runs: [R15] }, RUN15 + 12 * H);
add('C6 Lauf älter als 12 h: kein Wert, der Grund nennt Lauf und Grenze (Grenzfall 12 h wird noch gelesen)',
  !older.run && /2026111815.*älter als 12 Stunden/.test(older.why) && edge.run === '2026111815' && old.state === 'none' && /älter als 12 Stunden/.test(old.why), older.why);
const broken = await readRepack({ reader: { index: async () => { throw new Error('HTTP 503 index.json'); }, bytes: async () => { throw new Error('x'); } }, cells, nowMs: NOW });
const noImg = await readRepack({ reader: { index: async () => INDEX, bytes: async () => { throw new Error('HTTP 404'); } }, cells, nowMs: NOW });
add('C7 unlesbarer Index oder kein einziges Bild: Zustand „none“ mit Grund, kein Wurf', broken.state === 'none' && /503/.test(broken.why) && noImg.state === 'none' && /nicht lesbar/.test(noImg.why) && pickRepackRun({}, NOW).why && pickRepackRun(null, NOW).why);

// --- D: the series of a spot ----------------------------------------------------------------------------------------
const WAVE = T('2026-11-17T12:00:00Z');   // wave run of the SU fixtures; repack run 15 UTC on 18.11. = hour 27 of its axis
const fus = (over = {}) => Array.from({ length: 60 }, (_, k) => ({ t: WAVE + (20 + k) * H, tC: 8, tdC: 5, rr: 0, pSnow: 0, pWet: 0.5, ...(over[20 + k] ?? {}) }));
const synth = { state: 'ok', run: '2026111815', runMs: RUN15, thunder: new Map(), cape: new Map() };
for (let s = 0; s <= 12; s++) synth.thunder.set(s, { x: 40 });
for (let s = 0; s <= 27; s++) synth.cape.set(s, { x: 3000 });
const ser = spotSightSeries({ id: 'x', fusion: fus({ 30: { pWet: 0.1 }, 31: { pWet: null } }), runMs: WAVE, repack: synth });
add('D1 Stunden vor dem Repack-Lauf: keine Aussage; Schritt 0–12 mit Index 40: „Gewitter möglich“; 13–27 nur CAPE: höchstens „Schauer möglich“; ab +28 h keine Aussage',
  ser.conv.slice(0, 27).every((x) => x === null) && ser.conv[27] === 2 && ser.conv[39] === 2 && ser.conv[40] === 1 && ser.conv[54] === 1 && ser.conv.slice(55).every((x) => x === null),
  `27:${ser.conv[27]} 39:${ser.conv[39]} 40:${ser.conv[40]} 54:${ser.conv[54]} 55:${ser.conv[55]}`);
add('D2 Regenchance: unter 30 % kein Hinweis trotz Index 40; ohne Regenchance keine Aussage', ser.conv[30] === 0 && ser.conv[31] === null);
add('D3 der Sicht-Hinweis hängt nicht am Repack: Werte von der ersten Fusion-Stunde bis zur letzten, auch ohne Repack; davor und danach nichts',
  ser.vis[19] === null && ser.vis[20] === 0 && ser.vis[78] === 0 && spotSightSeries({ id: 'x', fusion: fus(), runMs: WAVE, repack: { state: 'none', why: 'x' } }).vis[40] === 0
  && spotSightSeries({ id: 'x', fusion: fus(), runMs: WAVE, repack: { state: 'none', why: 'x' } }).conv.every((x) => x === null));
const real = spotSightSeries({ id: 't12', fusion: fus({ 33: { pWet: 0.29 } }), runMs: WAVE, repack: rp });
const realC = spotSightSeries({ id: 'c6', fusion: fus(), runMs: WAVE, repack: rp });
const realSea = spotSightSeries({ id: 'sea', fusion: fus(), runMs: WAVE, repack: rp });
add('D4 mit den echten Bildern: an der hellsten Gewitter-Zelle von Schritt 12 „Gewitter möglich“, an der hellsten CAPE-Zelle von Schritt 6 „Schauer möglich“, in der Deutschen Bucht kein Hinweis; Stunden ohne Bild ohne Aussage',
  real.conv[39] === 2 && realC.conv[33] === 1 && realSea.conv[33] === 0 && realSea.conv[39] === 0 && realSea.conv[54] === 0 && realSea.conv.filter((x) => x != null).length === 4 && realSea.conv[28] === null,
  `t12@39 ${real.conv[39]} · c6@33 ${realC.conv[33]} · Bucht ${realSea.conv.filter((x) => x != null).length} Stunden`);
const step = (k, dist, extra = {}) => ({ validAtMs: WAVE + k * H, vars: { t2m: { mean: 8 }, td2m: { mean: 7.9 }, precip: { mean: 0.4, dist }, pSnow: { mean: 0 }, ...extra } });
const hurdle = (pDry) => ({ kind: 'hurdleLogNormal', pDry, mu: 0, sigma: 1 });
const fs = fusionSightSteps([step(0, null), step(1, hurdle(0.8)), step(2, null), step(3, null), step(4, hurdle(0.2)), step(5, null)]);
add('D5 Regenchance = 1 − pDry der Verteilung von buscosun Fusion; interpolierte Stunden linear zwischen den Nachbarn mit Verteilung, am Rand keine',
  near(fs[1].pWet, 0.2, 1e-9) && near(fs[4].pWet, 0.8, 1e-9) && near(fs[2].pWet, 0.4, 1e-9) && near(fs[3].pWet, 0.6, 1e-9) && fs[0].pWet === null && fs[5].pWet === null && fs[2].tC === 8 && fs[2].rr === 0.4 && visCodeAt(fs[2]) === 4,
  fs.map((x) => x.pWet?.toFixed(2) ?? '–').join(' '));

// --- E: producer -------------------------------------------------------------------------------------------------------
const RUN = '2026111712', T1 = '2026111715';
const OLD = JSON.parse(readFileSync(join(FIXS, `su-spots-${RUN}.json`), 'utf8')), NEW = JSON.parse(readFileSync(join(FIXS, `su-spots-${RUN}-w${T1}.json`), 'utf8')), CAT = JSON.parse(readFileSync(join(FIXS, 'su-catalog.json'), 'utf8'));
const IDS = Object.keys(NEW.spots);
const store = join(tmp, 'store');
mkdirSync(join(store, 'static'), { recursive: true });
mkdirSync(join(store, 'spots'), { recursive: true });
writeFileSync(join(store, 'static', 'spots.json'), JSON.stringify(CAT));
writeFileSync(join(store, seaSpotsPath(RUN)), JSON.stringify(OLD));
const statusOf = () => ({ schema: 1, product: 'sea-status', updatedAt: null, killSwitch: false, field: { model: 'cwam', lastRun: RUN, lastPublishedRun: RUN, blocked: null, recent: [] }, text: {} });
const FROM = 28;   // 16 UTC on 18.11.
const windOf = (withSteps) => async ({ spots }) => ({
  series: Object.fromEntries(spots.map((s) => [s.id, { wind: NEW.spots[s.id].v.wind.slice(), gust: NEW.spots[s.id].v.gust.slice(), windDir: NEW.spots[s.id].v.windDir.slice() }])),
  failed: [], meta: { engine: 'buscosun Fusion 14', version: 14, computedAt: new Date(NOW).toISOString(), runs: { t1: T1 } },
  ...(withSteps ? { sightIn: Object.fromEntries(spots.map((s) => [s.id, Array.from({ length: N - FROM }, (_, k) => ({ t: WAVE + (FROM + k) * H, tC: 8, tdC: k === 4 ? 7.9 : 5, rr: k === 6 ? 1 : 0, pSnow: 0, pWet: 0.5 }))])) } : {}),
});
const refresh = async (windImpl, repack) => {
  rmSync(join(store, seaSpotsWindPath(RUN, T1)), { force: true });
  writeFileSync(join(store, 'status.json'), JSON.stringify(statusOf()));
  const res = await windRefresh({ storeDir: store, dataDir: 'x', nowMs: NOW, indexT1: T1, windImpl, repack });
  return { res, doc: JSON.parse(readFileSync(join(store, seaSpotsWindPath(RUN, T1)), 'utf8')) };
};
const e1 = await refresh(windOf(true), reader);
const s1 = e1.doc.spots[IDS[0]]?.s;
add('E1 Wind-Auffrischung schreibt `s` je Spot (zwei Spalten × 79 h, Wertsperre besteht) und den Block `sight` mit Lauf, Reichweiten, Quelle und Schwellen',
  e1.res.built && e1.res.sightSpots === 3 && e1.res.sightConv === 'ok' && IDS.every((id) => SEA_SIGHT_VARS.every((k) => e1.doc.spots[id].s?.[k]?.length === N) && spotSightProblems(e1.doc.spots[id].s).length === 0)
  && e1.doc.sight.conv.run === '2026111815' && e1.doc.sight.conv.thunderTo === RUN15 + 12 * H && e1.doc.sight.conv.capeTo === RUN15 + 27 * H && e1.doc.sight.conv.source === REPACK_SOURCE
  && e1.doc.sight.rules.conv.thunderStorm === SEA_CONV.thunderStorm && e1.doc.sight.rules.conv.from === 'set' && e1.doc.sight.rules.vis.fogM === SEA_VIS.fogM && sightMetaOf(e1.doc.sight)?.spots === 3,
  JSON.stringify({ built: e1.res.built, spots: e1.res.sightSpots, conv: e1.res.sightConv }));
add('E2 Inhalt: Sicht-Code aus den Fusion-Werten der Stunde (Feuchte, Niederschlag), Schauer-Hinweis nur an Stunden mit Bild (0 = kein Hinweis in der ruhigen Lage)',
  s1 && s1.vis[FROM] === 0 && s1.vis[FROM + 4] === 4 && s1.vis[FROM + 6] === 2 && s1.vis.slice(0, FROM).every((x) => x === null)
  && s1.conv[33] === 0 && s1.conv[39] === 0 && s1.conv[54] === 0 && s1.conv.filter((x) => x != null).length === 3, s1 ? `conv ${s1.conv.map((x, i) => (x == null ? '' : `${i}:${x}`)).filter(Boolean).join(' ')}` : 'kein s');
add('E3 Wind unverändert: die drei Windspalten der Datei sind die der Rechnung, Byte für Byte', IDS.every((id) => JSON.stringify(e1.doc.spots[id].v) === JSON.stringify(NEW.spots[id].v)));
const e0 = await refresh(windOf(false), reader);
add('E4 Gegenprobe: eine Windrechnung ohne die Schritte des Motors schreibt die Form vor der Phase (Spot nur mit `v`, kein Block `sight`)',
  e0.res.built && e0.res.sightSpots === 0 && e0.doc.sight === undefined && IDS.every((id) => e0.doc.spots[id].s === undefined && Object.keys(e0.doc.spots[id]).join() === 'v'));
process.env.SEA_SIGHT = '0';
const eOff = await refresh(windOf(true), reader);
delete process.env.SEA_SIGHT;
add('E5 Producer-Schalter SEA_SIGHT=0: keine Spalten, kein Block, Wind wie immer', eOff.res.built && eOff.doc.sight === undefined && IDS.every((id) => eOff.doc.spots[id].s === undefined));
const eBroken = await refresh(windOf(true), { index: async () => { throw new Error('HTTP 503'); }, bytes: async () => { throw new Error('x'); } });
add('E6 Repack nicht lesbar: der Wind wird geschrieben, der Sicht-Hinweis auch, die Spalte `conv` bleibt leer und der Block nennt den Grund',
  eBroken.res.built && eBroken.res.sightConv === 'none' && /503/.test(eBroken.doc.sight.conv.why) && IDS.every((id) => eBroken.doc.spots[id].s.conv.every((x) => x === null) && eBroken.doc.spots[id].s.vis[FROM] === 0 && JSON.stringify(eBroken.doc.spots[id].v) === JSON.stringify(NEW.spots[id].v)));
const sf = await sightFor({ sightIn: { 'st-peter-ording': [{ t: WAVE + FROM * H, tC: null, tdC: null, rr: 0, pSnow: 0, pWet: null }] }, spots: CAT.spots, runMs: WAVE, nowMs: NOW, reader });
add('E7 ein Spot ohne eine einzige Aussage wird ohne `s` geschrieben; leere Eingabe ⇒ nichts', Object.keys(sf.spots).length === 0 && sf.doc.vis.state === 'none' && (await sightFor({ sightIn: {}, spots: CAT.spots, runMs: WAVE, nowMs: NOW, reader })) === null);

// --- F: client ---------------------------------------------------------------------------------------------------------
const pOld = parseSpotsDoc(OLD, RUN);
add('F1 alte Datei: gelesen wie bisher, ohne `sight` — Hinweis und Schauer-Hinweis sagen „keine Daten“ mit Grund', pOld && pOld.sight === undefined
  && S.sightHintAt(pOld.sight, IDS[0], 40).state === 'none' && /trägt den Hinweis noch nicht/.test(S.sightHintAt(pOld.sight, IDS[0], 40).why) && S.sightConvAt(pOld.sight, IDS[0], 40, WAVE + 40 * H, NOW).cls === null);
const m1 = mergeWindDoc(pOld, { from: e1.doc.from, wind: e1.doc.wind, sight: e1.doc.sight, spots: e1.doc.spots });
add('F2 Auffrischung mit Hinweisen: ab ihrer Stunde trägt das Dokument Spalten und Block; Wind und Seegang wie ohne die Phase',
  m1.sight?.meta.conv.state === 'ok' && IDS.every((id) => m1.sight.spots[id].vis[FROM + 4] === 4 && m1.sight.spots[id].vis[FROM - 1] === null)
  && JSON.stringify(m1.series) === JSON.stringify(mergeWindDoc(pOld, { from: e0.doc.from, wind: e0.doc.wind, spots: e0.doc.spots }).series));
const withS = clone(OLD); for (const id of IDS) withS.spots[id].s = clone(e1.doc.spots[id].s); withS.sight = clone(e1.doc.sight);
const pNew = parseSpotsDoc(withS, RUN);
const m0 = mergeWindDoc(pNew, { from: e0.doc.from, wind: e0.doc.wind, spots: e0.doc.spots });
add('F3 Laufdatei mit Hinweisen, danach eine Auffrischung OHNE: ab dann kein Hinweis (kein alter Wert unter einem neueren Wind)', pNew.sight && Object.keys(pNew.sight.spots).length === 3 && m0.sight === undefined && m0.windFrom === e0.doc.from);
const brokenDoc = clone(withS); brokenDoc.spots[IDS[0]].s.conv[40] = 7;
const pBroken = parseSpotsDoc(brokenDoc, RUN);
add('F4 Spalten, die die Sperre nicht bestehen: nur dieser Spot verliert die Hinweise, seine Reihe bleibt', pBroken.sight.spots[IDS[0]] === undefined && pBroken.sight.spots[IDS[1]] && pBroken.series[IDS[0]] && readSpotSight({ conv: [1], vis: [1] }, N) === null);
const data = m1.sight, id0 = IDS[0];
const hint4 = S.sightHintAt(data, id0, FROM + 4), hintNo = S.sightHintAt(data, id0, 5), hintSpot = S.sightHintAt(data, 'hvide-sande', FROM);
add('F5 Sicht-Hinweis der Stunde: Klasse mit Code; Stunde ohne Wert und Spot ohne Rechnung sagen „keine Daten“ mit Grund',
  hint4.state === 'ok' && hint4.cls === 'nebel' && hint4.code === 4 && hintNo.state === 'none' && /kein Wert/.test(hintNo.why) && hintSpot.state === 'none' && /keine Rechnung/.test(hintSpot.why));
const cv = (i, nowMs = NOW) => S.sightConvAt(data, id0, i, WAVE + i * H, nowMs);
add('F6 Schauer-Hinweis der Stunde: Klasse nur an Stunden mit Bild; hinter dem Gewitter-Index „nur CAPE“; hinter +27 h „keine Daten“ mit der Reichweite',
  cv(39).state === 'ok' && cv(39).cls === 0 && !cv(39).capeOnly && cv(54).cls === 0 && cv(54).capeOnly && cv(55).state === 'none' && /reicht bis/.test(cv(55).why) && cv(40).state === 'none' && cv(55).capeTo === RUN15 + 27 * H);
add('F7 nie ein alter Wert: derselbe Hinweis ist 12 h nach dem Repack-Lauf „keine Daten“ (Grenzfall genau 12 h gilt noch); „none“ des Producers reicht den Grund durch',
  cv(39, RUN15 + 12 * H).cls === 0 && cv(39, RUN15 + 12 * H + 1).state === 'none' && /älter als 12 Stunden/.test(cv(39, RUN15 + 12 * H + 1).why) && cv(39, RUN15 + 12 * H + 1).cls === null
  && /503/.test(S.sightConvAt({ spots: {}, meta: sightMetaOf(eBroken.doc.sight) }, id0, 39, WAVE + 39 * H, NOW).why));
add('F8 Reichweite in Worten: zwei Horizonte, wenn der Gewitter-Index früher endet', /Gewitter reicht bis .* Schauer bis /.test(S.convReachText(cv(39))) && S.convReachText({ thunderTo: null, capeTo: null }) === null);

// --- G: measured visibility ------------------------------------------------------------------------------------------
const poi = (id) => readFileSync(join(FIX, `poi-${id}.csv`), 'utf8');
const rowsA = S.poiSightRows(poi('10091'));
const lineOf = (text, hhmm) => text.split('\n').find((l) => l.startsWith(`18.11.26;${hhmm};`)).split(';');
const colVis = poi('10091').split('\n')[0].split(';').indexOf('horizontal_visibility');
const rawVis18 = lineOf(poi('10091'), '18:00')[colVis];
const T18 = T('2026-11-18T18:00:00Z');
const latest = S.poiSightLatest(poi('10091'), T18 + 98 * 60_000);
add('G1 POI Arkona: 25 Stundenzeilen, alle mit Sicht; der jüngste Wert ist die Zahl, die in der Datei steht (18:00 UTC, km → m)',
  rowsA.length === 25 && rowsA.every((r) => r.visKm != null && r.tC != null && r.tdC != null) && rawVis18 === '9,5' && latest?.t === T18 && latest.visM === 9500 && latest.src === 'poi' && poi('10091').split('\n')[1].split(';')[colVis] === 'km',
  `${rawVis18} km → ${latest?.visM} m`);
add('G2 nie ein alter Wert: derselbe Wert ist nach mehr als 3 Stunden „keine Daten“ (Grenzfall 3 h gilt noch); Zeilen aus der Zukunft zählen nicht',
  S.poiSightLatest(poi('10091'), T18 + 3 * H)?.visM === 9500 && S.poiSightLatest(poi('10091'), T18 + 3 * H + 1) === null && S.poiSightLatest(poi('10091'), T18 - 2 * H)?.t === T18 - 2 * H);
add('G3 Station ohne Sicht (List/Sylt): keine Daten — obwohl Temperatur und Taupunkt da sind',
  S.poiSightLatest(poi('10020'), T18 + H) === null && S.poiSightRows(poi('10020')).length === 25 && S.poiSightRows(poi('10020')).every((r) => r.visKm === null && r.tC != null));
const rowsE = S.poiSightRows(poi('10130'));
add('G4 Station mit einer leeren Zeile (Elpersbüttel): die Lücke bleibt eine Lücke, der jüngste Wert ist der davor', rowsE.filter((r) => r.visKm == null).length === 1 && rowsE[0].visKm === null && S.poiSightLatest(poi('10130'), T18 + 98 * 60_000)?.t === T18 - H);
const otherUnit = poi('10091').split('\n').map((l, i) => (i === 1 ? l.split(';').map((u, k) => (k === colVis ? 'm' : u)).join(';') : l)).join('\n');
add('G5 Negativkontrolle Einheit: steht in der Einheitenzeile nicht km, wird kein Wert gelesen (nie eine falsche Größenordnung); leerer Text ⇒ nichts',
  S.poiSightLatest(otherUnit, T18 + H) === null && S.poiSightRows('').length === 0 && S.poiSightLatest('', T18) === null);
add('G6 Worte der Sichtweite: Meter unter 1 km, eine Nachkommastelle bis 10 km, Deckel „über 50 km“', S.visText(600) === '600 m' && S.visText(9500) === '9,5 km' && S.visText(12_400) === '12 km' && S.visText(75_000) === 'über 50 km');
const dmiA = JSON.parse(readFileSync(join(FIX, 'dmi-06096-visib.json'), 'utf8')), dmiB = JSON.parse(readFileSync(join(FIX, 'dmi-06149-visib.json'), 'utf8'));
const T20 = T('2026-11-18T20:00:00Z');
const dl = dmiObsLatest(dmiA, S.DMI_VIS_PARAM, T20 + 60_000);
add('G7 DMI metObs: jüngster Wert des 10-Minuten-Mittels (Rømø/Juvre 20:00 UTC, 49 514 m); älter als eine Stunde oder Station ohne Sicht (Gedser) ⇒ keine Daten',
  dl?.t === T20 && dl.value === 49514 && dmiObsLatest(dmiA, S.DMI_VIS_PARAM, T20 + DMI_OBS_MAX_AGE_MS + 60_000) === null && dmiObsLatest(dmiB, S.DMI_VIS_PARAM, T20) === null && dmiObsLatest(dmiA, 'visibility', T20 + 60_000) === null, `${dl?.value} m`);

// --- H: the official line ---------------------------------------------------------------------------------------------
const bull = (f) => parseSeaBulletin(new Uint8Array(readFileSync(join(ROOT, 'audit', 'seewetter', 'fixtures', f))), f, T('2026-10-07T12:00:00Z')).doc;
const d50 = bull('FQEN50_EDZW_070800'), d51 = bull('FQEN51_EDZW_070800');
const spo = CAT.spots.find((s) => s.seaArea?.name === 'Deutsche Bucht') ?? CAT.spots[0];
const off = S.officialSight(spo, d50, d51, {});
const flat = (s) => s.replace(/\s+/g, ' ');
add('H1 amtliche Zeile: je Vorhersagetag das ganze Feld „Sicht/Wetter“ des Seegebiets, wörtlich im Bericht enthalten (nur Umbrüche aufgelöst), mit Produkt und Ausgabe',
  off.state === 'ok' && off.product === 'FQDL50' && off.days.length === 2 && off.days.every((d) => d.text.length > 5 && flat(d50.raw).includes(`Sicht/Wetter: ${d.text}`) && flat(d50.raw).includes(`${d.label}:`)) && off.issuedAt === d50.issuedAt && off.head === `Seewetterbericht ${spo.seaArea.name}`,
  off.days.map((d) => d.text).join(' | '));
const coastOnly = S.officialSight({ seaArea: null, coast: spo.coast }, d50, d51, { FQDL51: true });
add('H2 Spot ohne Seegebiet: die Zeile seines Küstenabschnitts (FQDL51), als veraltet gekennzeichnet, wenn der Bericht es ist; ohne beides oder ohne Bericht „keine Daten“ mit Grund',
  coastOnly.state === 'ok' && coastOnly.product === 'FQDL51' && coastOnly.stale && flat(d51.raw).includes(`Sicht/Wetter: ${coastOnly.days[0].text}`)
  && S.officialSight({ seaArea: null, coast: null }, d50, d51, {}).state === 'none' && /keinem Seegebiet/.test(S.officialSight({ seaArea: null, coast: null }, d50, d51, {}).why)
  && /nicht lesbar/.test(S.officialSight(spo, null, null, {}).why) && /laden/.test(S.officialSight(spo, null, null, {}, true).why));

// --- I: planner and classes -------------------------------------------------------------------------------------------
const ph = (k, conv) => ({ t: WAVE + k * H, windMs: 6, gustMs: 9, windDir: 250, conv });
const win = (convs) => P.planFindings(convs.map((c, k) => ph(k, c)), 0, convs.length - 1, { normal: 217 });
const fA = win([0, 0, 1, 1, 2, 0]), fB = win([0, 0, 0]), fC = win([0, 0, null, null]), fD = win([null, null]), fE = win([0, 2, 1]);
const evA = P.planEvents(fA, 'kn', null, WAVE, WAVE + 5 * H).filter((e) => e.kind === 'conv');
add('I1 Planer: EIN Eintrag — die erste Stunde im Fenster mit Hinweis, mit der Klasse dieser Stunde; ein späteres „Gewitter möglich“ steht in derselben Zeile',
  fA.conv.first.t === WAVE + 2 * H && fA.conv.first.cls === 1 && fA.conv.firstThunder === WAVE + 4 * H && fA.conv.known === 6 && evA.length === 1 && evA[0].t === WAVE + 2 * H && !evA[0].warn
  && /^Schauer möglich ab .* \(erste Stunde im Fenster\), Gewitter möglich ab .*\. Hinweis aus Modellwerten, keine Warnung\.$/.test(evA[0].text) && /^Gewitter möglich ab /.test(P.planConvText(fE.conv)), evA[0]?.text);
const sum = (f) => P.planSummary(f, 'kn', { conv: true }).filter((l) => /^Schauer und Gewitter/.test(l));
add('I2 Zusammenfassung: eine Zeile, wo der Hinweis nichts findet, nicht reicht oder fehlt; keine, wenn der Eintrag es schon sagt; ohne `conv` (alte Aufrufer) nie',
  sum(fA).length === 0 && /in keiner Stunde/.test(sum(fB)[0]) && /für 2 von 4 Stunden .* keine Aussage/.test(sum(fC)[0]) && /keine Daten/.test(sum(fD)[0]) && sum(fB).length === 1
  && P.planSummary(fD, 'kn', {}).every((l) => !/Schauer/.test(l)) && P.planEvents(fB, 'kn', null, WAVE, WAVE + 2 * H).every((e) => e.kind !== 'conv'));
const lim = SEA_PROFILE_BY_ID.kite.limits;
const hourBase = { t: WAVE + 30 * H, windMs: 9, gustMs: 14, windDir: 250, hs: 0.8, ws: 0.6, wsPer: 4, dry: false };
const vPlain = JSON.stringify(classify(hourBase, lim, 217, 54.3, 8.6));
add('I3 die Hinweise ändern passt / knapp / außerhalb nie: dieselbe Stunde mit „Gewitter möglich“ und „Nebel möglich“ erhält dasselbe Urteil; classify und der Urteils-Cache lesen die Spalten nicht',
  vPlain === JSON.stringify(classify({ ...hourBase, conv: 2, vis: 4 }, lim, 217, 54.3, 8.6)) && !/\bconv\b|\bvis\b|sight/i.test(readFileSync(join(ROOT, 'src', 'sea', 'seaProfiles.ts'), 'utf8')) && !/\bconv\b|sight/i.test(src('seaVerdicts.ts')));

// --- J: words and display without a browser --------------------------------------------------------------------------
const words = [...S.CONV_LABEL, ...Object.values(S.VIS_LABEL), ...Object.values(S.VIS_REASON), S.GUST_CONV_LEGEND, S.SIGHT_HINT_NOTE, S.VIS_RULE, S.VIS_CHECK_NOTE, S.VIS_ROW_NOTE, S.VIS_ROW_KEY, S.CONV_RULE, S.CONV_SOURCE,
  P.planConvText(fA.conv), P.planConvText(fE.conv), ...sum(fB), ...sum(fC), ...sum(fD), P.PLAN_CONV_NOTE, hintNo.why, hintSpot.why, cv(55).why, cv(39, RUN15 + 13 * H).why, S.convReachText(cv(39)), S.visCellWords(4), S.visCellWords(null)];
const warnOk = (w) => w.replace(/keine Warnung|Amtliche Warnungen gehen vor/g, '');
add('J1 Hinweis, nie Warnung: „Warnung“ steht nur in „keine Warnung“ und „Amtliche Warnungen gehen vor“ — Gegenprobe: das Muster trifft „Gewitterwarnung“',
  words.every((w) => !/[Ww]arn/.test(warnOk(w))) && /[Ww]arn/.test(warnOk('Gewitterwarnung ab 15 Uhr')) && /keine Warnung/.test(S.SIGHT_HINT_NOTE) && /Hinweis/.test(S.SIGHT_HINT_NOTE), words.filter((w) => /[Ww]arn/.test(warnOk(w))).join(' | '));
const fogBad = /Nebel(?!( ist)? möglich)/;
add('J2 Nebel wird nie behauptet: das Wort steht nur als „Nebel möglich“ / „Nebel ist möglich“ — Gegenprobe: „Nebel ab 6 Uhr“ fällt auf', words.every((w) => !fogBad.test(w)) && fogBad.test('Nebel ab 6 Uhr') && !fogBad.test('„Nebel möglich“'), words.filter((w) => fogBad.test(w)).join(' | '));
add('J3 kein „sicher“ in den Texten — Gegenprobe: das Muster trifft „ist sicher“, nicht „Sicht“', words.every((w) => !/\bsicher/i.test(w)) && /\bsicher/i.test('das ist sicher') && !/\bsicher/i.test('Sicht'));
add('J4 der Satz der Legende wörtlich; die Zeile sagt, dass sie an der Küste kaum geprüft ist, und die Karte nennt die Zahlen von Schritt 0',
  S.GUST_CONV_LEGEND === 'Bei Schauern liegen Böen oft deutlich über dem Mittelwind.' && /an der Küste erst an einem Tag geprüft/.test(S.VIS_ROW_NOTE)
  && S.VIS_CHECK_NOTE.includes('549') === false && /22 Stationen/.test(S.VIS_CHECK_NOTE) && /97 %/.test(S.VIS_CHECK_NOTE) && /29 %/.test(S.VIS_CHECK_NOTE) && /64 %/.test(S.VIS_CHECK_NOTE) && /erst an 22 Stationsstunden/.test(S.VIS_CHECK_NOTE) && /1,1 K trockener/.test(S.VIS_CHECK_NOTE) && /seltener, als es sollte/.test(S.VIS_CHECK_NOTE));
const pair = JSON.parse(readFileSync(join(ROOT, 'audit', 'seewetter-sicht-konvektion', 'spike', 'rule-check.json'), 'utf8'));
add('J5 die genannten Zahlen sind die gemessenen von Schritt 0 (Regel auf Messwerten, 549 Paare an 22 Stationen)',
  pair.pairs === S.VIS_CHECK.pairs && pair.stations === S.VIS_CHECK.stations && pair.gut.above10Pct === S.VIS_CHECK.gutAbove10 && pair.eingeschraenkt.below10Pct === S.VIS_CHECK.reducedBelow10 && pair.nebel.below10Pct === S.VIS_CHECK.fogBelow10 && pair.nebel.below4Pct === S.VIS_CHECK.fogBelow4,
  JSON.stringify({ n: pair.pairs, gut: pair.gut.above10Pct, eing: pair.eingeschraenkt.below10Pct, nebel: pair.nebel.below10Pct }));
const hc = JSON.parse(readFileSync(join(ROOT, 'audit', 'seewetter-sicht-konvektion', 'spike', 'hint-check.json'), 'utf8'));
const sumOf = (a) => a.reduce((x, y) => x + y, 0);
add('J5b der Hinweis wie gebaut (Werte von buscosun Fusion vor der Messung): die genannten Zahlen sind die der Paarung — auch die, dass die Rechnung trockener war',
  hc.pairs === S.VIS_HINT_CHECK.pairs && sumOf(hc.table.gut) === S.VIS_HINT_CHECK.gut && hc.table.gut[0] === S.VIS_HINT_CHECK.gutAbove10 && sumOf(hc.table.eingeschraenkt) === S.VIS_HINT_CHECK.reduced
  && hc.table.eingeschraenkt[1] + hc.table.eingeschraenkt[2] === S.VIS_HINT_CHECK.reducedBelow10 && sumOf(hc.table.nebel) === S.VIS_HINT_CHECK.fog && Math.round(hc.spreadFusionMinusMeasuredK.median * 10) / 10 === S.VIS_HINT_CHECK.spreadBiasK,
  JSON.stringify({ n: hc.pairs, gut: hc.table.gut, eing: hc.table.eingeschraenkt, bias: hc.spreadFusionMinusMeasuredK.median }));
const page = src('SeaPage.tsx'), bandSrc = src('SeaBand.tsx'), panelSrc = src('SeaSightPanel.tsx'), readout = src('SeaReadout.tsx');
add('J6 ohne Schalter an für alle: die Seite reicht `sight` immer an Band und Readout; kein Flag, kein Query-Schalter der Phase',
  /current=\{!!spotCur\} sight \/>/.test(page) && /const sightNode = spot && usable && !noSeries \? <SeaSightPanel/.test(page) && /sight=\{sightNode\} \/>/.test(page) && !/SEA_SIGHT_LIVE|sightFlag|[?&]sg=|get\('sg'\)|get\('sight'\)/.test(page + src('seaFlag.ts') + src('seaSight.ts') + src('seaState.ts')));
add('J7 Quellen je Baustein: POI, DMI, ICON-D2 und der Seewetterdienst stehen in der Karte; die Quellen-Liste führt drei Zeilen',
  /POI_SOURCE/.test(panelSrc) && /DMI_CREDIT/.test(panelSrc) && /CONV_SOURCE/.test(panelSrc) && /OFFICIAL_SOURCE/.test(panelSrc) && /ICON-D2/.test(S.CONV_SOURCE) && /Deutscher Wetterdienst/.test(S.POI_SOURCE) && /sightSourceRows\(spot, spotsDoc\)/.test(readout));
const out = join(tmp, 'bundle.mjs');
await build({
  stdin: { resolveDir: ROOT, loader: 'ts', contents: `
    export { default as SeaBand } from './src/sea/SeaBand.tsx';
    export { default as SeaSightPanel } from './src/sea/SeaSightPanel.tsx';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';` },
  bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: out, logLevel: 'silent', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const M = await import(pathToFileURL(out).href);
const h = M.createElement, html = M.renderToStaticMarkup;
const convs = [null, 0, 1, 2, 0, null], viss = [null, 0, 2, 4, 1, 3];
const bandHours = convs.map((c, k) => ({ t: WAVE + (30 + k) * H, windMs: 6, gustMs: 9 + k, windDir: 250, hs: 0.5, dir: 270, tm: 4, cls: 'passt', reason: 'x', daylight: true, conv: c, vis: viss[k] }));
const baseBand = { unit: 'kn', selected: 1, onPick: () => {}, title: 'St. Peter-Ording · Kite', sub: 'x', footnote: 'y', hours: bandHours };
const bandOn = html(h(M.SeaBand, { ...baseBand, sight: true })), bandOff = html(h(M.SeaBand, baseBand));
const sgCells = [...bandOn.matchAll(/sw-band-bar sw-sg-cell (is-[a-z]+)"/g)].map((m) => m[1]);
const marks = [...bandOn.matchAll(/class="sw-sg-mark is-(\d)"/g)].map((m) => m[1]);
const gustRow = (s) => /<th scope="row" class="sw-band-lab">Böen<\/th>(.*?)<\/tr>/.exec(s)[1].replace(/<span class="sw-sg-mark.*?<\/span><\/span>/g, '').replace(/ has-conv/g, '').replace(/ title="[^"]*"/g, '');
add('J8 Stundenband: Zeile „Sicht“ mit einer Zelle je Stunde (drei Klassen, ohne Aussage schraffiert), Marken nur an den zwei konvektiven Stunden, die Böen-Zahlen bleiben dieselben',
  />Sicht<\/th>/.test(bandOn) && sgCells.join() === 'is-hatched,is-gut,is-eingeschraenkt,is-nebel,is-eingeschraenkt,is-eingeschraenkt' && marks.slice(0, 2).join() === '1,2' && (bandOn.match(/has-conv/g) ?? []).length === 2 && gustRow(bandOn) === gustRow(bandOff)
  && bandOn.includes(S.GUST_CONV_LEGEND) && bandOn.includes(S.VIS_ROW_NOTE), `${sgCells.join(' ')} · Marken ${marks.join('')}`);
add('J8n Gegenprobe: ohne `sight` (jeder Aufrufer vor der Phase) keine Zeile, keine Marke, kein Fuß der Phase', !/sw-sg-|>Sicht<\/th>|Bei Schauern/.test(bandOff) && bandOff.length > 2000);
const calm = html(h(M.SeaBand, { ...baseBand, sight: true, hours: bandHours.map((x) => ({ ...x, conv: 0 })) }));
add('J9 ohne konvektive Stunde steht keine Marken-Legende im Fuß (die Zeile Sicht behält ihre)', !calm.includes(S.GUST_CONV_LEGEND) && calm.includes(S.VIS_ROW_NOTE) && !/sw-sg-mark/.test(calm));
const view = (over = {}) => ({ tMs: WAVE + 39 * H, nowMs: NOW, station: { name: 'Arkona', km: 3.2, net: 'DWD' }, obs: latest, official: off, hint: hint4, conv: { ...cv(39), cls: 1 }, engine: 'buscosun Fusion 14', ...over });
const card = html(h(M.SeaSightPanel, { view: view() }));
add('J10 Karte „Sicht“: Messwert mit Station, Entfernung und Zeit; amtliche Zeile vollständig; Hinweis mit Klasse; Schauer-Hinweis mit dem Böen-Satz; Regeln aufklappbar',
  card.includes('9,5 km') && /DWD-Station Arkona, 3,2 km vom Spot, gemessen/.test(card) && off.days.every((d) => card.includes(`Sicht/Wetter: ${d.text.replace(/&/g, '&amp;')}`)) && card.includes('Nebel möglich') && card.includes('Schauer möglich') && card.includes(S.GUST_CONV_LEGEND)
  && card.includes('Wie die beiden Hinweise entstehen') && card.includes('FQDL50'));
const cardNone = html(h(M.SeaSightPanel, { view: view({ obs: null, official: S.officialSight({ seaArea: null, coast: null }, null, null, {}), hint: hintNo, conv: cv(55) }) }));
add('J11 fehlt etwas, steht „keine Daten“ mit Grund — an allen vier Stellen, nie ein Wert', (cardNone.match(/[Kk]eine Daten/g) ?? []).length === 4 && !/\d km<\/strong>/.test(cardNone) && /meldet derzeit keine Sichtweite/.test(cardNone) && /reicht bis/.test(cardNone) && !/sw-sg-mark/.test(cardNone));
// Phase BS-N (V-BS-5): the card at a lake spot. Its station comes from obs/v1 (no visibility there — checked on the recorded
// excerpt), the Seewetterdienst writes no line for lakes, the hint is not checked at lakes. The coast keeps its sentences.
{
  const lakeObs = JSON.parse(readFileSync(join(ROOT, 'scripts/lib/fixtures/sea/lakes/obs-latest-lakes.json'), 'utf8'));
  const obsKeys = new Set(Object.values(lakeObs.stations).flatMap((e) => [...Object.keys(e.v ?? {}), ...Object.keys(e.older ?? {})]));
  const lakeSpot = JSON.parse(readFileSync(join(ROOT, 'scripts/lib/fixtures/sea/lakes/spots-lakes.json'), 'utf8')).spots.find((x) => x.id === 'bodensee-lindau');
  const st = lakeSpot.lake.stations.wind, offLake = S.officialSight(lakeSpot, null, null, {}, true);
  const lakeView = (station) => view({ station: null, obs: null, official: offLake, lake: { station } });
  const cardLake = html(h(M.SeaSightPanel, { view: lakeView({ name: st.name, km: st.km }) })), cardLakeNo = html(h(M.SeaSightPanel, { view: lakeView(null) }));
  const text = (s) => s.replace(/<[^>]+>/g, ' ');
  add('J11b Seespot: statt „Diesem Spot ist keine Messstation zugeordnet“ steht die Station des Sees mit dem Satz, dass sie im Datenbestand keine Sichtweite liefert (obs/v1 trägt in der Aufzeichnung keine Sichtgröße); ohne Station „keine Station in der Nähe“; keine Quellenzeile einer Messung, die es nicht gibt',
    !obsKeys.has('vis') && !obsKeys.has('vv') && obsKeys.has('ff') && cardLake.includes(S.lakeSightNoVis(st.name, st.km)) && /liefert im Datenbestand Wind und Böen, aber keine Sichtweite/.test(cardLake)
    && !/keine Messstation zugeordnet/.test(cardLake) && !cardLake.includes(S.POI_SOURCE) && !/Messung an Land/.test(cardLake) && cardLakeNo.includes(S.LAKE_SIGHT_NO_STATION) && !/keine Messstation zugeordnet/.test(cardLakeNo),
    [...obsKeys].sort().join(' '));
  add('J11c Seespot: die amtliche Zeile sagt, dass die Berichte des Seewetterdienstes für Nord- und Ostsee gelten (kein „Seegebiet“, kein „Küstenabschnitt“, auch nicht „laden“); der Prüfhinweis beginnt mit „An Binnenseen ist der Hinweis nicht geprüft“ und nennt danach die Messung an der Küste; Hinweis und Schauer-Hinweis stehen wie an der Küste',
    offLake.state === 'none' && offLake.why === S.LAKE_SIGHT_OFFICIAL_NONE && text(cardLake).includes(S.LAKE_SIGHT_OFFICIAL_NONE) && !/Seegebiet|Küstenabschnitt|Texte laden/.test(text(cardLake).replace(S.LAKE_VIS_CHECK_NOTE, ''))
    && S.LAKE_VIS_CHECK_NOTE.startsWith('An Binnenseen ist der Hinweis nicht geprüft') && S.LAKE_VIS_CHECK_NOTE.endsWith(S.VIS_CHECK_NOTE) && text(cardLake).includes(S.LAKE_VIS_CHECK_NOTE)
    && cardLake.includes('Nebel möglich') && cardLake.includes('Schauer möglich') && cardLake.includes(S.VIS_RULE) && (cardLake.match(/[Kk]eine Daten/g) ?? []).length === 2);
  add('J11d Küste unverändert: ohne `lake` steht die Karte Zeichen für Zeichen wie zuvor (Messung, Quelle, Prüfhinweis der Küste); ein Küstenspot ohne Gebiet behält seinen Satz',
    html(h(M.SeaSightPanel, { view: view({ lake: undefined }) })) === card && card.includes(S.POI_SOURCE) && text(card).includes(S.VIS_CHECK_NOTE) && !text(card).includes('An Binnenseen')
    && /keinem Seegebiet und keinem Küstenabschnitt/.test(S.officialSight({ seaArea: null, coast: null }, null, null, {}).why));
  const bandProps = { ...baseBand, sight: true }, bandLake = html(h(M.SeaBand, { ...bandProps, lake: true })), bandCoast = html(h(M.SeaBand, bandProps));
  add('J11e Stundenband am Seespot: die Zeile Sicht nennt „an Binnenseen nicht geprüft“ (Fuß und Titel), an der Küste weiter „an der Küste erst an einem Tag geprüft“; sonst sind beide Bänder gleich; kein verbotenes Wort in den neuen Sätzen',
    bandLake.includes(S.LAKE_VIS_ROW_NOTE) && !bandLake.includes(S.VIS_ROW_NOTE) && bandCoast.includes(S.VIS_ROW_NOTE) && !bandCoast.includes(S.LAKE_VIS_ROW_NOTE) && bandLake.split(S.LAKE_VIS_ROW_NOTE).join(S.VIS_ROW_NOTE) === bandCoast
    && [S.lakeSightNoVis('X', 1.5), S.LAKE_SIGHT_NO_STATION, S.LAKE_SIGHT_OFFICIAL_NONE, S.LAKE_VIS_CHECK_NOTE, S.LAKE_VIS_ROW_NOTE].every((t) => !/\bsicher\b|Warnung besteht|keine Gefahr/i.test(t))
    && /lake=\{!!spot\.lake\} current=\{!!spotCur\} sight \/>/.test(page) && /lake: spot\.lake \? \{ station: spot\.lake\.stations\.wind \?/.test(page));
}
const css = src('seaDeck.css');
const used =[...new Set([...(bandSrc + panelSrc).matchAll(/sw-sg-[a-z]+/g)].map((m) => m[0]))];
add('J12 CSS: jede Klasse der Phase ist definiert; die mobile Anordnung steht nur in der Media Query der Seite; der Schleier nutzt keine Klassenfarbe',
  used.length >= 12 && used.every((c) => css.includes(`.${c}`)) && /@media \(max-width: 767px\), \(max-width: 1439px\) and \(pointer: coarse\) \{\s*\.sw-sg-pair \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css)
  && !/\.sw-sg-cell[^{]*\{[^}]*(--sw-ok|--sw-tight|--sw-out)/.test(css), used.filter((c) => !css.includes(`.${c}`)).join(' ') || `${used.length} Klassen`);

// --- K: archive ----------------------------------------------------------------------------------------------------------
const aStore = join(tmp, 'astore'), aDir = join(tmp, 'archiv');
mkdirSync(join(aStore, 'static'), { recursive: true });
mkdirSync(join(aStore, 'spots'), { recursive: true });
writeFileSync(join(aStore, 'static', 'spots.json'), JSON.stringify({ product: 'sea-spots', spots: [{ id: 'kap-arkona', station: { id: '10091' } }, { id: 'list', station: { id: '10020' } }] }));
writeFileSync(join(aStore, 'static', 'spots-dk.json'), JSON.stringify({ product: 'sea-spots', spots: [{ id: 'roemoe', country: 'DK', station: { id: '06096', net: 'dmi' } }, { id: 'gedser', country: 'DK', station: { id: '06149', net: 'dmi' } }] }));
writeFileSync(join(aStore, seaSpotsPath(RUN)), JSON.stringify(OLD));
writeFileSync(join(aStore, seaSpotsWindPath(RUN, T1)), JSON.stringify(e1.doc));
const asked = [];
const fetchStub = async (url) => {
  const u = String(url); asked.push(u);
  const m = /poi\/(\d+)-BEOB\.csv$/.exec(u);
  if (m) return ['10091', '10020'].includes(m[1]) ? new Response(poi(m[1])) : new Response('', { status: 404 });
  const d = /stationId=(\d+)&parameterId=visib_mean_last10min/.exec(u);
  if (d) return new Response(readFileSync(join(FIX, `dmi-${d[1]}-visib.json`)));
  return new Response('', { status: 404 });
};
const ar = await archiveSea({ storeDir: aStore, archiveDir: aDir, nowMs: T20 + 5 * 60_000, wtemp: false, fetchImpl: fetchStub });
const idx = JSON.parse(readFileSync(join(aDir, 'index.json'), 'utf8'));
const gz = (p) => JSON.parse(gunzipSync(readFileSync(join(aDir, p))).toString('utf8'));
const aWind = gz(`2026-11-17/spots-${RUN}-w${T1}.json.gz`);
add('K1 Archiv: die Spot-Dateien liegen ganz darin (Spalten `s` und Block `sight` unverändert), der Index nennt die Datei mit Hinweisen unter `sight` — und nur sie',
  ar.spotsAdded === 2 && JSON.stringify(aWind.spots[IDS[0]].s) === JSON.stringify(e1.doc.spots[IDS[0]].s) && aWind.sight.conv.run === '2026111815' && JSON.stringify(idx.days['2026-11-17'].sight) === JSON.stringify([`${RUN}-w${T1}`]));
const aPoi = gz('2026-11-18/poi.json.gz'), row18 = aPoi.stations['10091'].find((r) => r.t === '2026-11-18T18:00:00.000Z'), rowList = aPoi.stations['10020'][0];
const direct = parsePoi(poi('10091')).find((r) => r.t === '2026-11-18T18:00:00.000Z');
add('K2 POI im Archiv: Sicht (km), Temperatur, Taupunkt, Niederschlag neben Wind und Böe; Station ohne Sicht ohne den Schlüssel; die Einheiten stehen in der Tagesdatei',
  row18.vv === 9.5 && typeof row18.tt === 'number' && typeof row18.td === 'number' && 'rr' in row18 && typeof row18.ff === 'number' && JSON.stringify(direct) === JSON.stringify(row18) && !('vv' in rowList) && 'tt' in rowList && /km/.test(aPoi.units.vv),
  JSON.stringify(row18));
const aVis = gz('2026-11-18/vis-dmi.json.gz');
add('K3 Sicht der DMI-Stationen: nur volle Stunden, in Metern, je Station; die Station ohne Sicht hat keine Zeilen; ein zweiter Durchgang fügt nichts doppelt hinzu',
  ar.visDmiStations === 2 && ar.visDmiRows >= 1 && aVis.unit === 'm' && aVis.stations['06096'].every((r) => r.t.endsWith(':00:00.000Z') && r.m > 0) && aVis.stations['06096'].some((r) => r.t === '2026-11-18T20:00:00.000Z' && r.m === 49514) && !aVis.stations['06149']
  && (await archiveSea({ storeDir: aStore, archiveDir: aDir, nowMs: T20 + 6 * 60_000, wtemp: false, fetchImpl: fetchStub })).visDmiRows === 0, `${ar.visDmiRows} Zeilen`);
add('K4 das Archiv liest nur innerhalb von src/sea (der Archiv-Workflow checkt nur scripts/sea, scripts/lib, src/sea aus): seaSight.ts importiert nichts von außerhalb',
  [...src('seaSight.ts').matchAll(/from '([^']+)'/g)].every((m) => /^\.\/[A-Za-z]+$/.test(m[1])) && !/from '/.test(src('seaSightObs.ts')) && /from '\.\.\/\.\.\/src\/sea\/seaSightObs\.ts'/.test(readFileSync(join(HERE, 'sea', 'sea-archive.mjs'), 'utf8'))
  && !/roadVsVis|sea-sight|seaSight\.ts/.test(readFileSync(join(HERE, 'sea', 'sea-archive.mjs'), 'utf8')) && /from '\.\/seaSightObs'/.test(src('seaClient.ts')) && !/^import \{[^}]*\} from '\.\/seaSight';/m.test(src('seaClient.ts')));
let roadSame = false;
try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'src/road/vs/roadVsVis.ts'], { cwd: ROOT }); roadSame = true; } catch { roadSame = false; }
add('K5 die Autobahn-Linie ist unberührt: roadVsVis.ts ist die Datei von HEAD, wird vom Producer nur importiert und von keiner Datei der Seite',
  roadSame && /from '..\/..\/src\/road\/vs\/roadVsVis.ts'/.test(readFileSync(join(HERE, 'sea', 'sea-sight.mjs'), 'utf8')) && readdirSync(join(ROOT, 'src', 'sea')).every((f) => !/from '[^']*roadVsVis/.test(src(f))));

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail.slice(0, 260)}]` : ''}`);
console.log(`\nverify:sea-sight — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
