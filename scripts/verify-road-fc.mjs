/**
 * verify:road-fc — AW-6.1 (audit/autobahnwetter.md §14): the route forecast `buscosun-data/road/fc/v1/`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-fc.mjs [--data=<clone of buscosun-data>]
 *
 * Offline (no network). A  contract: stamps, coding, value lock, pointer rule, retention, axis geometry
 *                       B  point builder: snapping onto a synthetic OSM extract, tunnel slide, station points, geo cache
 *                       C  producer end to end on the cube fixture (real engine): file = direct computation, sharded =
 *                          in-process, publish verdict, negative controls
 *                       D  publish against a local bare repo: pointer, retention, rejected push, force-push, foreign paths
 *                       E  workflow template against the constants, import closure inside the sparse patterns
 *                       F  client reader with a mocked fetch
 *                       G  (only with --data) the REAL points file and geo file of the data repo
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { encodePng, decodePng, toRgba } from './lib/png.mjs';
import { FIX, buildCubeFixture } from './lib/pvCubeFixtures.mjs';
import { installNodeShims } from './punktarchiv/lib/nodeShims.mjs';
import {
  ROAD_FC_REPO_DIR, ROAD_FC_INDEX_PATH, ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH, ROAD_FC_STEPS, ROAD_FC_HOURS, ROAD_FC_VAR_IDS, ROAD_FC_VARS, ROAD_FC_RANGE,
  ROAD_FC_SPACING_KM, ROAD_FC_SNAP_MAX_M, ROAD_FC_CRON, ROAD_FC_RETENTION, ROAD_FC_PUBLISH_GATE_MS, ROAD_FC_STALE_MS, ROAD_FC_DEAD_MS, ROAD_FC_MAX_FAILED_SHARE,
  ROAD_FC_CDN_BASE, ROAD_FC_RAW_BASE, ROAD_FC_ORIGIN, ROAD_FC_INTERPOLATED,
  roadFcStamp, roadFcStampToMs, roadFcT0, roadFcEncode, roadFcDecode, roadFcOriginCode, roadFcSeriesProblems, roadFcPointUsable, parseRoadFcFile,
  parseRoadFcIndex, roadFcPickRun, roadFcPrune, roadFcFreshness, roadFcAxisKms, roadFcAxisId, roadPointAtKm, roadLineKm, roadKmBetween,
  roadFcCorridorPath, roadFcStatePath, parseRoadFcPoints, ROAD_FC_ANCHOR_MODE,
} from '../src/road/roadFc.ts';
import { ROAD_REPO_DIR, ROAD_STATIONS_PATH, roadSlotOf, roadStamp } from '../src/road/roadContract.ts';
import { buildOsmIndex, nearestCarriageway, axisPointsOf, stationPointsOf, buildPoints, buildGeo, footOnSegment, refsOf } from './road/build-fc-points.mjs';
import { dirStore, geoBackend, makeIo, buildRun, publishVerdict, publishRun, nextIndex, seriesOf, swisTable, readSwisTable, anchorObsFor, ROAD_FC_ANCHOR, repeatVerdict, repeatVerdictOf } from './road/road-forecast.mjs';
import { memoryStore } from '../src/point/client/store.ts';
import { POINT_LEARNED_PATH, POINT_STACK_PATH } from '../src/point/cubeFormat.ts';
import { getPointForecastFromCube, clearCubeForecastCache, FUSION8_NOWCAST_HOUR_MEAN } from '../src/pointForecast/cubeSource.ts';
import { FUSION_CURRENT, FUSION_NAME, fusionName } from '../src/pointForecast/fusion/fusionRelease.ts';
import { getClimaField } from '../src/pointForecast/fusion/attach.ts';
import { loadRoadFc, loadRoadFcIndex } from '../src/road/roadClient.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const H = 3_600_000;
const results = [];
const add = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  [${detail}]` : ''}`); };
const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- A: contract ---------------------------------------------------------------------------------------
{
  const ms = Date.UTC(2026, 9, 4, 8, 13, 32);
  add('A1 Lauf-Stempel YYMMDDHHMM auf die Minute, Rundweg; Unsinn ⇒ NaN; t0 = volle Stunde',
    roadFcStamp(ms) === '2610040813' && roadFcStampToMs('2610040813') === Date.UTC(2026, 9, 4, 8, 13) && Number.isNaN(roadFcStampToMs('2613400813')) && Number.isNaN(roadFcStampToMs('x'))
    && roadFcT0(ms) === Date.UTC(2026, 9, 4, 8), roadFcStamp(ms));
  const rt = ROAD_FC_VAR_IDS.every((v) => { const [lo, hi] = ROAD_FC_RANGE[v]; return [lo, hi, (lo + hi) / 2, lo + (hi - lo) / 7].every((x) => Math.abs(roadFcDecode(v, roadFcEncode(v, x)) - x) <= 0.5 / ROAD_FC_VARS[v].scale + 1e-12); });
  add('A2 Kodierung: ganzzahlig, Rundweg je Größe innerhalb eines halben Schritts; null/NaN ⇒ null (fehlt ≠ 0)',
    rt && roadFcEncode('t', null) === null && roadFcEncode('t', NaN) === null && roadFcDecode('t', null) === null && roadFcEncode('t', -0.04) === -0 && Number.isInteger(roadFcEncode('rr', 1.234)));
  const good = () => Object.fromEntries(ROAD_FC_VAR_IDS.map((v) => [v, new Array(ROAD_FC_STEPS).fill(v === 'q' ? 0 : 5)]));
  const mut = (fn) => { const g = good(); fn(g); return roadFcSeriesProblems(g); };
  add('A3 Wertschloss: gute Reihe ohne Befund; falsche Länge, Kommazahl, Wert außerhalb des Bereichs, fehlende Größe je erkannt (Negativkontrollen)',
    roadFcSeriesProblems(good()).length === 0 && mut((g) => g.t.pop()).length === 1 && mut((g) => { g.td[3] = 1.5; }).length === 1 && mut((g) => { g.t[0] = 900; }).length === 1
    && mut((g) => { g.pp[48] = 101; }).length === 1 && mut((g) => { delete g.fx; }).length === 1 && mut((g) => { g.t[7] = null; }).length === 0);
  const pt = (over = {}) => ({ id: 'a1@0', kind: 'axis', km: 0, lat: 50, lon: 10, h: 100, mos: null, v: good(), ...over });
  const file = { schema: 1, product: 'road-fc', run: '2610040813', issuedAt: 'x', t0Ms: roadFcT0(ms), steps: ROAD_FC_STEPS, kind: 'corridor', id: 'a1', engine: {}, source: '', points: [pt(), pt({ id: 'bad', lat: 123 }), pt({ id: 'bad2', v: { ...good(), t: new Array(ROAD_FC_STEPS).fill(null) } }), pt({ id: 'bad3', v: { ...good(), n: [1] } })] };
  const parsed = parseRoadFcFile(file);
  add('A4 Client-Prüfung der Lauf-Datei: schlechte Punkte fallen heraus und werden gezählt (Breite 123°, Temperatur leer, Reihe zu kurz); falsches Produkt/Stempel/t0 ⇒ null',
    parsed?.points.length === 1 && parsed.dropped === 3 && parseRoadFcFile({ ...file, product: 'road-obs' }) === null && parseRoadFcFile({ ...file, run: '26' }) === null && parseRoadFcFile({ ...file, t0Ms: ms }) === null,
    `${parsed?.points.length} gut, ${parsed?.dropped} verworfen`);
  const half = good(); half.t = half.t.map((x, i) => (i % 2 ? null : x));
  const less = good(); less.t = less.t.map((x, i) => (i < 30 ? null : x));
  add('A5 brauchbar = Temperatur in mindestens der Hälfte der Stunden', roadFcPointUsable(pt({ v: half })) && !roadFcPointUsable(pt({ v: less })));
  const now = Date.UTC(2026, 9, 4, 12, 0);
  const run = (minAgo, pubAgo = minAgo - 3) => ({ run: roadFcStamp(now - minAgo * 60_000), issuedAt: new Date(now - minAgo * 60_000).toISOString(), t0Ms: roadFcT0(now - minAgo * 60_000), publishedAt: new Date(now - pubAgo * 60_000).toISOString(), points: 1, failed: 0 });
  const idx = parseRoadFcIndex({ schema: 1, product: 'road-fc-index', updatedAt: 'x', runs: [run(125), run(5), run(65), { run: 'kaputt' }] });
  add('A6 Zeiger: sortiert neueste zuerst, kaputte Einträge fallen heraus; ein Lauf zählt erst nach der Sperrfrist ab publishedAt, davor der Lauf davor',
    idx.runs.length === 3 && idx.runs[0].run === run(5).run && roadFcPickRun(idx, now).run === run(65).run && roadFcPickRun(idx, now + ROAD_FC_PUBLISH_GATE_MS).run === run(5).run
    && ROAD_FC_PUBLISH_GATE_MS >= 3 * 60_000, `gewählt ${roadFcPickRun(idx, now).run}, Sperrfrist ${ROAD_FC_PUBLISH_GATE_MS / 60_000} min`);
  const fresh = parseRoadFcIndex({ schema: 1, product: 'road-fc-index', runs: [run(2)] });
  add('A7 Zeiger: einziger Lauf noch in der Sperrfrist ⇒ trotzdem dieser (kein leeres Ergebnis); Schalter aus oder leer ⇒ null; falsches Produkt ⇒ null',
    roadFcPickRun(fresh, now).run === run(2).run && roadFcPickRun({ ...idx, killed: true }, now) === null && roadFcPickRun({ ...idx, runs: [] }, now) === null && roadFcPickRun(null, now) === null
    && parseRoadFcIndex({ schema: 1, product: 'road-status', runs: [] }) === null);
  const stamps = [0, 60, 120, 180, 181, 300].map((m) => roadFcStamp(now - m * 60_000));
  add(`A8 Aufbewahrung: älter als ${ROAD_FC_RETENTION.maxAgeMs / H} h fällt, genau ${ROAD_FC_RETENTION.maxAgeMs / H} h bleibt; nie unter ${ROAD_FC_RETENTION.minKeep} Läufe`,
    eq(roadFcPrune(stamps, now).sort(), [stamps[4], stamps[5]].sort()) && roadFcPrune([stamps[4], stamps[5]], now).length === 0 && eq(roadFcPrune([stamps[0], stamps[4], stamps[5]], now), [stamps[5]]),
    roadFcPrune(stamps, now).join(','));
  add('A9 Frische: live bis 3 h, veraltet bis 12 h, danach und mit Schalter tot',
    roadFcFreshness(now - ROAD_FC_STALE_MS, now) === 'live' && roadFcFreshness(now - ROAD_FC_STALE_MS - 1, now) === 'stale' && roadFcFreshness(now - ROAD_FC_DEAD_MS - 1, now) === 'dead'
    && roadFcFreshness(now, now, true) === 'dead' && roadFcFreshness(NaN, now) === 'dead');
  add('A10 Achspunkte: 0, 5, 10 … und das Ende nur, wenn es weiter als 2,5 km vom letzten Punkt liegt',
    eq(roadFcAxisKms(12.4), [0, 5, 10]) && eq(roadFcAxisKms(12.6), [0, 5, 10, 12.6]) && eq(roadFcAxisKms(10), [0, 5, 10]) && eq(roadFcAxisKms(2), [0]) && eq(roadFcAxisKms(3.14), [0, 3.1]) && ROAD_FC_SPACING_KM === 5
    && roadFcAxisId('a8-4', 35) === 'a8-4@35');
  const line = [[10, 50], [10.1, 50], [10.1, 50.1]];
  const L = roadLineKm(line), mid = roadPointAtKm(line, roadKmBetween(line[0], line[1]) + 1);
  add('A11 Punkt bei km auf der Achse: auf dem richtigen Segment, Enden geklemmt, km-Maß = das der Korridore (111,2 km/°)',
    Math.abs(mid[0] - 10.1) < 1e-9 && Math.abs((mid[1] - 50) * 111.2 - 1) < 1e-6 && eq(roadPointAtKm(line, -5), [10, 50]) && eq(roadPointAtKm(line, L + 9), [10.1, 50.1]) && Math.abs(roadKmBetween([10, 50], [10, 51]) - 111.2) < 1e-9);
  add('A12 Herkunft des Schritts: Stufe + 8 für interpoliert; unbekannte Stufe ⇒ null',
    roadFcOriginCode('t1', false) === 0 && roadFcOriginCode('t2', true) === ROAD_FC_ORIGIN.t2 + ROAD_FC_INTERPOLATED && roadFcOriginCode('station', false) === 3 && roadFcOriginCode('??', false) === null);
  add('A13 Pfade: eigene Linie road/fc/v1 (nicht unter road/v1, das der Spiegel bei jedem Push ersetzt), Lauf/c/Korridor, Lauf/s/Land',
    ROAD_FC_REPO_DIR === 'road/fc/v1' && !ROAD_FC_REPO_DIR.startsWith(`${ROAD_REPO_DIR}/`) && roadFcCorridorPath('2610040813', 'a8') === '2610040813/c/a8.json' && roadFcStatePath('2610040813', 'BW') === '2610040813/s/BW.json'
    && ROAD_FC_CDN_BASE.endsWith('@main/road/fc/v1') && ROAD_FC_RAW_BASE.endsWith('/main/road/fc/v1'));
}

// --- B: point builder ----------------------------------------------------------------------------------
const way = (ref, coords, tags = {}) => ({ type: 'way', tags: { highway: 'motorway', ...(ref ? { ref } : {}), ...tags }, geometry: coords.map(([lon, lat]) => ({ lon, lat })) });
{
  // A straight corridor along latitude 50 from lon 10 to 10.2 (≈ 14.3 km); OSM carriageway 0.0005° (≈ 56 m) north of it.
  const off = 0.0005;
  const osm = { elements: [
    way('A 8', [[9.99, 50 + off], [10.06, 50 + off]]),
    way('A 8', [[10.06, 50 + off], [10.08, 50 + off]], { tunnel: 'yes' }),                 // tunnel around km 5
    way('A 8;A 81', [[10.08, 50 + off], [10.21, 50 + off]], { bridge: 'viaduct' }),
    way('A 99', [[10.0, 50.0001], [10.21, 50.0001]]),                                      // another motorway, nearer
    { type: 'way', tags: { highway: 'motorway_link', ref: 'A 8' }, geometry: [{ lon: 10, lat: 50 }, { lon: 10.2, lat: 50 }] },
  ] };
  const index = buildOsmIndex(osm);
  const corridor = { id: 'a8-x', road: 'A8', lengthKm: roadLineKm([[10, 50], [10.2, 50]]), line: [[10, 50], [10.2, 50]], stations: [{ id: 'S1', km: 3.3, dir: 'O' }] };
  const ax = axisPointsOf(corridor, index);
  const byId = Object.fromEntries(ax.map((p) => [p.id, p]));
  add('B1 Achspunkt rastet auf die Fahrbahn der EIGENEN Autobahn (nicht auf die nähere A 99, nicht auf motorway_link): Breite der A 8, Abstand ≈ 56 m',
    index.ways === 4 && Math.abs(byId['a8-x@0'].lat - (50 + off)) < 1e-5 && Math.abs(byId['a8-x@0'].snap - 56) <= 1 && !byId['a8-x@0'].osmRef, `snap ${byId['a8-x@0'].snap} m`);
  add('B2 Tunnel unter der Nennlage (km 5): der Punkt gleitet entlang der Achse zur offenen Fahrbahn, km bleibt der Nennwert, slide benannt',
    byId['a8-x@5'].slide !== undefined && byId['a8-x@5'].km === 5 && (byId['a8-x@5'].lon < 10.06 || byId['a8-x@5'].lon > 10.08), `slide ${byId['a8-x@5'].slide} km, lon ${byId['a8-x@5'].lon}`);
  add('B3 Brücke aus OSM übernommen (km 10, Weg mit bridge und zwei Nummern „A 8;A 81")', byId['a8-x@10'].bridge === true && byId['a8-x@0'].bridge === undefined && eq(refsOf({ ref: 'A 8; a 81' }), ['A8', 'A81']));
  const far = axisPointsOf({ ...corridor, id: 'far', line: [[10, 50.02], [10.2, 50.02]] }, index);
  add(`B4 keine Fahrbahn der Autobahn innerhalb ${ROAD_FC_SNAP_MAX_M} m (Achse 2,2 km daneben): Punkt bleibt auf der Achse, snap null — nie still verschoben`,
    far.filter((p) => p.km > 0 && p.km < corridor.lengthKm - 1).every((p) => p.snap === null && Math.abs(p.lat - 50.02) < 1e-9));
  const other = axisPointsOf({ ...corridor, id: 'o', road: 'A7', line: [[10, 50], [10.05, 50]], lengthKm: roadLineKm([[10, 50], [10.05, 50]]) }, index);
  add('B5 Autobahn mit anderer Nummer zählt nur ganz nah (≤ 150 m) und wird benannt (osmRef)', other[0].snap !== null && other[0].osmRef === 'A99' && other[0].snap < 20, `${other[0].osmRef}, ${other[0].snap} m`);
  const f = footOnSegment([10.05, 50.001], [10, 50], [10.1, 50]);
  add('B6 Lotfußpunkt: Abstand 111 m (0,001° Breite), Fuß auf dem Segment; jenseits des Endes geklemmt', Math.abs(f.d - 111.2) < 0.5 && Math.abs(f.foot[0] - 10.05) < 1e-9 && footOnSegment([9.9, 50], [10, 50], [10.1, 50]).foot[0] === 10);
  const st = stationPointsOf({ S1: { n: 'Eins', bl: 'BY', lat: 50.00012, lon: 10.04567, oob: false }, S2: { n: 'Aus', bl: 'BY', lat: 50, lon: 10, oob: true }, S3: { n: 'Ohne', bl: 'BW', lat: null, lon: 10 }, S4: { n: 'Land', bl: 'HE', lat: 51, lon: 9 } }, [corridor]);
  add('B7 Stationspunkte: Katalogposition, Korridor + km wo der Korridor die Station führt, sonst Bundesland; außer Betrieb und ohne Koordinate fehlen',
    st.length === 2 && st[0].id === 'S1' && st[0].corridor === 'a8-x' && st[0].km === 3.3 && st[0].lat === 50.00012 && st[1].id === 'S4' && st[1].corridor === null && st[1].state === 'HE');
  const all = buildPoints({ corridors: [corridor], stations: { S1: { n: 'Eins', bl: 'BY', lat: 50.0001, lon: 10.045 } }, index });
  add('B8 Zählung: Achse/Station/eingerastet/verschoben/Brücke stimmen mit den Punkten; ohne OSM (--no-snap) bleibt jeder Achspunkt auf der Achse',
    all.counts.axis === ax.length && all.counts.station === 1 && all.counts.snapped === ax.filter((p) => p.snap != null).length && all.counts.slid === 1 && all.counts.bridge >= 1
    && axisPointsOf(corridor, null).every((p) => p.snap === null && p.lat === 50), `${JSON.stringify(all.counts)} ${ax.map((p) => `${p.id}:${p.slide ?? 0}`).join(' ')}`);
}

// --- C: producer end to end on the cube fixture ----------------------------------------------------------
installNodeShims();
const tmp = mkdtempSync(join(tmpdir(), 'verify-road-fc-'));
const nowMs = FIX.nowMs;
const fx = await buildCubeFixture();
let files = new Map(fx.files);
{
  // Learned tables and the station-value table in the form verify:pv-cube (29) uses — the stage `fs` needs them.
  const { newTables } = await import('../src/point/fusionFit/tables.ts');
  const { Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { V_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { TAU_GROUPS, STACK_TABLE_KIND, STACK_FIT_VERSION } = await import('../src/pointForecast/fusion/stationValue.ts');
  const tables = newTables('2026-09-14T00:00:00Z'); tables.period = { from: '2025-09-01', to: '2026-09-10' };
  const names = designNames('K', 'r1');
  for (let bin = 0; bin < 6; bin++) for (const v of ['t', 'td', 'u', 'v', 'gust', 'clct']) {
    const beta = new Array(names.length).fill(0); beta[Z_DIM] = 1;
    tables.mean[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names, beta, lambda: 1, n: 10000, days: 60, status: 'written' };
    const c = new Array(V_NAMES.length).fill(0); c[0] = 1;
    tables.variance[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 10000, days: 60, msr: 1, status: 'written' };
  }
  const entries = {};
  for (const v of ['t', 'td', 'ws', 'gust']) for (let g = 0; g < TAU_GROUPS.length; g++) for (const [f, b] of Object.entries({ B: [0.25], AB: [0.1, 0.5], S0: [0.2, 0.3], S: [0.1, 0.5, 0.2] })) entries[`${v}|${g}|${f}`] = { n: 500, beta: b, sigma: 0.8 };
  const stack = { schema: 1, kind: STACK_TABLE_KIND, fitVersion: STACK_FIT_VERSION, provenance: 'archive', builtAt: '2026-09-14T00:00:00Z', period: { from: '2026-09-01', to: '2026-09-13', issueDays: 13 }, rows: 1000, range: { maxKm: 5, maxDElevM: 50 }, tauGroups: TAU_GROUPS, entries };
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  files.set(POINT_LEARNED_PATH, enc(tables));
  files.set(POINT_STACK_PATH, enc(stack));
}
const writeTree = (dir, map) => { for (const [p, b] of map) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b); } };
const POINTS = [
  { id: 'a99@0', kind: 'axis', corridor: 'a99', km: 0, lat: FIX.lat, lon: FIX.lon, snap: 12 },
  { id: 'a99@5', kind: 'axis', corridor: 'a99', km: 5, lat: FIX.lat + 0.012, lon: FIX.lon + 0.01, snap: 30, bridge: true },
  { id: 'S900', kind: 'station', corridor: 'a99', km: 2.2, lat: FIX.lat + 0.006, lon: FIX.lon + 0.004, state: 'BY', name: 'Fixture Nord' },
  { id: 'S901', kind: 'station', corridor: null, km: null, lat: FIX.lat - 0.006, lon: FIX.lon - 0.004, state: 'BY', name: 'Fixture Land' },
];
// Terrain without network: every Terrarium tile is one flat PNG at the fixture height.
const flat = (() => { const e = FIX.hTrue + 32768, rgb = new Uint8Array(256 * 256 * 3); for (let i = 0; i < 256 * 256; i++) { rgb[3 * i] = Math.floor(e / 256); rgb[3 * i + 1] = e % 256; } return encodePng(256, 256, rgb, 3); })();
const tileFetch = async () => new Response(flat, { status: 200 });
const geoBuilt = await buildGeo(POINTS, { terrainOpts: { fetchImpl: tileFetch }, z0: false });
const geoDoc = { schema: 1, product: 'road-fc-geo', entries: geoBuilt.entries };
const pointsDoc = { schema: 1, product: 'road-fc-points', builtAt: 'x', spacingKm: 5, sources: [], counts: {}, points: POINTS };
const mkData = (name, map, pts = pointsDoc) => {
  const dir = join(tmp, name);
  writeTree(dir, map);
  mkdirSync(join(dir, ROAD_FC_REPO_DIR, 'static'), { recursive: true });
  writeFileSync(join(dir, ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH), JSON.stringify(pts));
  writeFileSync(join(dir, ROAD_FC_REPO_DIR, ROAD_FC_GEO_PATH), JSON.stringify(geoDoc));
  return dir;
};
const dataDir = mkData('data', files);
const readRun = (outDir, run) => {
  const out = {};
  for (const sub of ['c', 's']) { const d = join(outDir, run, sub); if (existsSync(d)) for (const f of readdirSync(d)) out[`${sub}/${f}`] = readFileSync(join(d, f), 'utf8'); }
  return out;
};
let built, runFiles;
{
  add('C0 Gelände vorab über den Leser des Clients: je Punkt ein Cache-Eintrag terrain/…, Höhe = Fixture, kein Punkt unvollständig',
    geoBuilt.entries.length === POINTS.length && geoBuilt.failed.length === 0 && geoBuilt.entries.every(([k, v]) => k.startsWith('terrain/') && Math.abs(v.elevationM - FIX.hTrue) < 1), `${geoBuilt.entries.length} Einträge, ${geoBuilt.entries[0]?.[1].elevationM} m`);
  built = await buildRun({ dataDir, outDir: join(tmp, 'out'), nowMs, inProcess: true });
  runFiles = readRun(join(tmp, 'out'), built.run);
  const cor = JSON.parse(runFiles['c/a99.json']), st = JSON.parse(runFiles['s/BY.json']);
  add('C1 Lauf: 4 von 4 Punkten, ein Korridor (2 Achspunkte + seine Station, nach km sortiert) und ein Land (Station ohne Korridor); Gelände aus dem Vorab-Cache (0 Netz-Treffer)',
    built.entry.points === 4 && built.entry.failed === 0 && built.entry.corridors === 1 && built.entry.states === 1 && eq(cor.points.map((p) => p.id), ['a99@0', 'S900', 'a99@5']) && eq(st.points.map((p) => p.id), ['S901'])
    && built.stats.geo.terrainMiss === 0 && cor.points[2].bridge === true && cor.points[1].name === 'Fixture Nord', JSON.stringify(built.stats.geo));
  add('C2 jede Datei besteht die Client-Prüfung ohne Verlust; Kopf: Lauf, t0 = volle Stunde, 49 Schritte, Motor = neuester Stand des Registers (Name und Nummer), Stufe fs, anchor none, Cube-Läufe und Tabellen-Hashes genannt',
    [cor, st].every((d) => { const p = parseRoadFcFile(d); return p && p.dropped === 0 && p.points.length === d.points.length; }) && cor.run === roadFcStamp(nowMs) && cor.t0Ms === roadFcT0(nowMs) && cor.steps === ROAD_FC_STEPS
    && cor.engine.name === FUSION_NAME && cor.engine.version === FUSION_CURRENT && cor.engine.stage === 'fs' && cor.engine.anchor === 'none' && cor.engine.hourMean === FUSION8_NOWCAST_HOUR_MEAN && cor.engine.runs.t1 === FIX.runs.t1 && cor.engine.runs.t2 === FIX.runs.t2
    && /^[0-9a-f]{12}$/.test(cor.engine.tables.learned) && /^[0-9a-f]{12}$/.test(cor.engine.tables.stack), JSON.stringify(cor.engine.runs));
  const verdict = publishVerdict(built);
  add('C3 Freigabe: Lauf mit Stufe fs an jedem Punkt ist frei', verdict.ok && built.stats.noStage === 0, verdict.reasons.join(' · '));

  // Direct computation, independent of the producer's store, memo decoders and coding helper.
  const rgba = (b) => { const png = decodePng(b); return { data: toRgba(png), width: png.width, height: png.height }; };
  const direct = async (p, at, extra = {}) => {
    clearCubeForecastCache();
    const cache = geoBackend(geoDoc);
    return getPointForecastFromCube({ lat: p.lat, lng: p.lon, country: 'DE', hours: ROAD_FC_HOURS, pointSource: 'cube', includeRadarNowcast: true }, {
      store: memoryStore(files), decodePng, decodeRgbPng: rgba, terrain: { decodeRgba: rgba, cache }, clima: getClimaField, obs: null, z0: { cache, cacheOnly: true },
      learnedSource: 'json', climaSource: 'json', stackSource: 'json', stage: 'fs', nowcastHourMean: true, nowMs: () => at, ...extra,
    });
  };
  const own = (fc, t0) => {
    const t = new Array(ROAD_FC_STEPS).fill(null), td = [...t], fx2 = [...t], n = [...t];
    for (const s of fc.cube.v2.axis.steps) { const i = (s.validAtMs - t0) / H; if (i < 0 || i >= ROAD_FC_STEPS) continue; t[i] = Math.round(s.vars.t2m.mean * 10); td[i] = Math.round(s.vars.td2m.mean * 10); fx2[i] = Math.round(s.vars.gust.mean * 10); n[i] = Math.round(s.vars.clct.mean); }
    return { t, td, fx: fx2, n };
  };
  const fileOf = (id) => [...cor.points, ...st.points].find((p) => p.id === id);
  let same = 0;
  for (const p of POINTS) { const o = own(await direct(p, nowMs), roadFcT0(nowMs)), f = fileOf(p.id).v; if (eq(o.t, f.t) && eq(o.td, f.td) && eq(o.fx, f.fx) && eq(o.n, f.n)) same++; }
  add('C4 Datei = direkte Rechnung von buscosun Fusion 8 am selben Punkt (eigener Speicher, eigene Dekoder, eigene Kodierung): T, Td, Böe, Bewölkung über 49 Stunden gleich, an allen 4 Punkten', same === POINTS.length, `${same}/${POINTS.length}`);
  const later = own(await direct(POINTS[0], nowMs + H), roadFcT0(nowMs + H));
  const noStage = own(await direct(POINTS[0], nowMs, { stage: undefined, learnedSource: 'none' }), roadFcT0(nowMs));
  add('C5 Negativkontrollen zu C4: eine Stunde später oder ohne die Stufe fs ergibt ANDERE Reihen — der Vergleich kann scheitern',
    !eq(later.t, fileOf('a99@0').v.t) && !eq(noStage.t, fileOf('a99@0').v.t));
  const full = fileOf('a99@0').v;
  add('C6 Reihen: 49 Werte je Größe, T/Td/Wind/Böe/Bewölkung ohne Lücke, Td ≤ T + σ-Rundung, Herkunft je Schritt gesetzt, Wahrscheinlichkeit 0…100',
    ROAD_FC_VAR_IDS.every((v) => full[v].length === ROAD_FC_STEPS) && ['t', 'ts', 'td', 'ff', 'fx', 'n', 'q'].every((v) => full[v].every((x) => x !== null)) && full.t.every((x, i) => full.td[i] <= x + 1)
    && full.pp.every((x) => x === null || (x >= 0 && x <= 100)) && full.q.every((x) => Number.isInteger(x) && x >= 0 && x <= 12), `q ${[...new Set(full.q)].join(',')}`);
  const fc0 = await direct(POINTS[0], nowMs);
  add('C7 seriesOf: Schritte außerhalb des Fensters werden nicht geschrieben, Ziel-Index = (gültig − t0) / 1 h', eq(seriesOf(fc0, roadFcT0(nowMs)).t, full.t) && seriesOf(fc0, roadFcT0(nowMs) + 100 * H).t.every((x) => x === null));

  // Sharded (child processes) = in-process.
  const sh = await buildRun({ dataDir, outDir: join(tmp, 'out-sh'), nowMs, shards: 2 });
  add('C8 zwei Scherben als Kindprozesse liefern byte-gleiche Dateien wie ein Prozess', eq(readRun(join(tmp, 'out-sh'), sh.run), runFiles) && sh.entry.points === 4);

  // Without the learned tables the engine computes without the stage — that is not Fusion 8 and must not be published.
  const bare = new Map(files); bare.delete(POINT_LEARNED_PATH);
  const b2 = await buildRun({ dataDir: mkData('data-bare', bare), outDir: join(tmp, 'out-bare'), nowMs, inProcess: true });
  const v2 = publishVerdict(b2);
  add('C9 ohne gelernte Tabellen: jeder Punkt rechnet ohne Stufe fs ⇒ Lauf GESPERRT, Grund genannt („nicht buscosun Fusion 8")', b2.stats.noStage === 4 && !v2.ok && v2.reasons.some((r) => /ohne Stufe fs/.test(r)), v2.reasons.join(' · '));
  // A point outside the cube: no result, named; above the share limit the run is blocked.
  const withBad = { ...pointsDoc, points: [...POINTS, { id: 'weit', kind: 'station', corridor: null, km: null, lat: 60.5, lon: 25, state: 'XX', name: 'außerhalb' }] };
  const b3 = await buildRun({ dataDir: mkData('data-bad', files, withBad), outDir: join(tmp, 'out-bad'), nowMs, inProcess: true });
  const v3 = publishVerdict(b3);
  add(`C10 Punkt außerhalb des Cubes: ohne Ergebnis, mit Grund aufgeführt, nicht in den Dateien; 1 von 5 > ${100 * ROAD_FC_MAX_FAILED_SHARE} % ⇒ Lauf gesperrt`,
    b3.entry.points === 4 && b3.entry.failed === 1 && b3.stats.failed[0].id === 'weit' && !!b3.stats.failed[0].error && !v3.ok && !Object.values(readRun(join(tmp, 'out-bad'), b3.run)).some((t) => t.includes('"weit"')),
    b3.stats.failed[0]?.error);
  const ds = dirStore(dataDir);
  add('C11 Verzeichnis-Speicher: fehlende Datei ⇒ null (wie 404), Datei wird einmal gelesen und als dieselbe Instanz geliefert (Dekodier-Merker), JSON lesbar',
    (await ds.bytes('point/gibtsnicht.bin')) === null && (await ds.bytes('point/index.json')) === (await ds.bytes('/point/index.json')) && (await ds.json('point/index.json'))?.schema != null && ds.stats.files === 1 && ds.withBase('x') === ds);
  const io = makeIo({ store: ds, cache: geoBackend(geoDoc), nowMs });
  add('C12 io des Producers = Voreinstellung des Browsers ohne Anker: Stufe fs, Tabellen json, Stundenmittel, obs null, z0 nur aus dem Vorab-Cache',
    io.stage === 'fs' && io.learnedSource === 'json' && io.climaSource === 'json' && io.stackSource === 'json' && io.nowcastHourMean === FUSION8_NOWCAST_HOUR_MEAN && io.obs === null && io.z0.cacheOnly === true && io.nowMs() === nowMs);
}

// --- D: publish against a local bare repo ----------------------------------------------------------------
{
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const bare = join(tmp, 'remote.git'), url = pathToFileURL(bare).href;
  mkdirSync(bare); git(bare, 'init', '--quiet', '--bare', '--initial-branch=main');
  const clone = (name) => { const d = join(tmp, name); git(tmp, '-c', 'core.autocrlf=false', 'clone', '--quiet', url, name); git(d, 'config', 'user.name', 't'); git(d, 'config', 'user.email', 't@t'); git(d, 'config', 'core.autocrlf', 'false'); return d; };
  const seed = clone('seed');
  writeTree(seed, new Map([
    [`${ROAD_FC_REPO_DIR}/${ROAD_FC_POINTS_PATH}`, Buffer.from('{"points":1}\n')],
    [`${ROAD_REPO_DIR}/status.json`, Buffer.from('{"mirror":true}\n')],
    ['point/index.json', Buffer.from('{"cube":true}\n')],
  ]));
  git(seed, 'add', '-A'); git(seed, 'commit', '--quiet', '-m', 'seed'); git(seed, 'push', '--quiet', 'origin', 'HEAD:main');
  const seedSha = git(seed, 'rev-parse', 'HEAD');
  const repo = clone('work');
  const T = Date.UTC(2026, 9, 4, 8, 20);
  const fake = (at) => {
    const run = roadFcStamp(at), dir = join(tmp, 'runs', run);
    mkdirSync(join(dir, 'c'), { recursive: true });
    writeFileSync(join(dir, 'c', 'a1.json'), JSON.stringify({ run }) + '\n');
    return { runDir: dir, entry: { run, issuedAt: new Date(at).toISOString(), t0Ms: roadFcT0(at), publishedAt: new Date(at).toISOString(), points: 1, failed: 0, corridors: 1, states: 0, engine: {}, ms: 1 } };
  };
  const pub = (at, extra = {}) => { const f = fake(at); return publishRun({ repoDir: repo, ...f, nowMs: () => at + 120_000, ...extra }); };
  const remoteIndex = () => { git(seed, 'fetch', '--quiet', 'origin', 'main'); return JSON.parse(git(seed, 'show', `origin/main:${ROAD_FC_REPO_DIR}/${ROAD_FC_INDEX_PATH}`)); };
  const remoteDirs = () => (git(seed, 'fetch', '--quiet', 'origin', 'main'), git(seed, 'ls-tree', '--name-only', `origin/main:${ROAD_FC_REPO_DIR}`).split('\n').filter((d) => /^\d{10}$/.test(d)).sort());

  const r1 = pub(T);
  const i1 = remoteIndex();
  const changed = git(seed, 'diff', '--name-only', seedSha, 'origin/main').split('\n');
  add('D1 erster Push: Zeiger nennt den Lauf, publishedAt = Zeit des Pushs (nicht der Rechnung), Commit fasst NUR road/fc/v1 an (road/v1 des Spiegels und point/ unberührt)',
    r1.attempt === 1 && i1.runs.length === 1 && i1.runs[0].run === roadFcStamp(T) && i1.runs[0].publishedAt === new Date(T + 120_000).toISOString() && i1.product === 'road-fc-index' && i1.killed === false
    && changed.every((f) => f.startsWith(`${ROAD_FC_REPO_DIR}/`)) && changed.length === 2, changed.join(' '));
  for (const h of [1, 2, 3]) pub(T + h * H);
  const before = remoteDirs();
  pub(T + 4 * H + 60_000);
  const i5 = remoteIndex(), after = remoteDirs();
  add('D2 Aufbewahrung im Repo: Läufe älter als 3 h (gemessen beim Push) fallen — bei stündlichem Takt bleiben 3; Verzeichnisse = Läufe des Zeigers, neueste zuerst',
    eq(before, [1, 2, 3].map((h) => roadFcStamp(T + h * H))) && eq(after, [roadFcStamp(T + 2 * H), roadFcStamp(T + 3 * H), roadFcStamp(T + 4 * H + 60_000)]) && eq(i5.runs.map((r) => r.run).sort(), after)
    && i5.runs[0].run === roadFcStamp(T + 4 * H + 60_000), `vorher ${before.join(',')} · nachher ${after.join(',')}`);
  add('D3 Zeiger besteht die Client-Prüfung; statische Punktdatei blieb byte-gleich', parseRoadFcIndex(i5)?.runs.length === 3 && git(seed, 'show', `origin/main:${ROAD_FC_REPO_DIR}/${ROAD_FC_POINTS_PATH}`) === '{"points":1}');

  // A rejected push (someone else pushed first): the hook refuses exactly one push.
  mkdirSync(join(bare, 'hooks'), { recursive: true });
  writeFileSync(join(bare, 'hooks', 'pre-receive'), '#!/bin/sh\nif [ -f ./reject-next ]; then rm -f ./reject-next; echo "abgelehnt (Test)" >&2; exit 1; fi\nexit 0\n');
  try { chmodSync(join(bare, 'hooks', 'pre-receive'), 0o755); } catch { /* Windows */ }
  writeFileSync(join(bare, 'reject-next'), '1');
  const logs = [];
  const r6 = pub(T + 5 * H, { log: (m) => logs.push(m) });
  add('D4 abgelehnter Push: neu aufsetzen auf origin/main, zweiter Versuch gelingt, der Lauf steht im Zeiger', r6.attempt === 2 && logs.length === 1 && /Push-Versuch 1\/\d+ abgelehnt/.test(logs[0]) && remoteIndex().runs[0].run === roadFcStamp(T + 5 * H), logs[0]);

  // Someone else pushes an unrelated commit in between: our next publish builds on it, nothing of theirs is lost.
  git(seed, 'fetch', '--quiet', 'origin', 'main');
  git(seed, 'checkout', '--quiet', '-B', 'main', 'origin/main'); writeFileSync(join(seed, ROAD_REPO_DIR, 'status.json'), '{"mirror":"neu"}\n');
  git(seed, 'add', '-A'); git(seed, 'commit', '--quiet', '-m', 'mirror'); git(seed, 'push', '--quiet', 'origin', 'HEAD:main');
  pub(T + 6 * H);
  git(seed, 'fetch', '--quiet', 'origin', 'main');
  add('D5 fremder Push dazwischen (Spiegel): unser Lauf setzt darauf auf, dessen Datei bleibt', git(seed, 'show', `origin/main:${ROAD_REPO_DIR}/status.json`) === '{"mirror":"neu"}' && remoteIndex().runs[0].run === roadFcStamp(T + 6 * H));

  // The map line force-pushes a fresh history that carries an OLDER tree: pointer and runs of that tree, ours gone.
  const old = clone('old'); git(old, 'checkout', '--quiet', '--orphan', 'fresh', seedSha); git(old, 'commit', '--quiet', '-m', 'data: fresh history'); git(old, 'push', '--quiet', '--force', 'origin', 'HEAD:main');
  const r8 = pub(T + 7 * H);
  const i8 = remoteIndex();
  add('D6 Force-Push der Kartenlinie (neue Historie, älterer Baum ohne unsere Läufe): der nächste Lauf heilt — Zeiger nennt genau die Läufe, die es gibt; Punktdatei wieder da',
    r8.attempt === 1 && eq(i8.runs.map((r) => r.run), [roadFcStamp(T + 7 * H)]) && eq(remoteDirs(), [roadFcStamp(T + 7 * H)]) && git(seed, 'show', `origin/main:${ROAD_FC_REPO_DIR}/${ROAD_FC_POINTS_PATH}`) === '{"points":1}'
    && git(seed, 'log', '--format=%s', 'origin/main').split('\n').length === 2);
  const r9 = pub(T + 7 * H, {});
  add('D7 derselbe Lauf noch einmal (Wiederholung des Jobs): nichts zu committen außer publishedAt ⇒ kein zweites Verzeichnis, Zeiger weiter 1 Lauf', remoteIndex().runs.length === 1 && remoteDirs().length === 1 && (r9.noop === true || r9.attempt === 1));
  // A change staged in the pushing clone (stale index) must never be pushed as ours — it set radar/ and road/v1 back
  // for 67 s on 04.10.2026 (hand push, not this function; the guard is here so the job can never do it).
  writeFileSync(join(repo, 'point', 'index.json'), '{"cube":"ALT"}\n');
  git(repo, 'add', '--', 'point/index.json');
  let refused = null;
  try { pub(T + 8 * H); } catch (e) { refused = e; }
  git(seed, 'fetch', '--quiet', 'origin', 'main');
  add('D9 fremde Änderung im Index des Klons (veralteter Stand): kein Push, Fehler nennt die Datei; point/ auf dem Remote unverändert, kein neuer Lauf im Zeiger',
    refused?.fatal === true && /point\/index\.json/.test(refused.message) && git(seed, 'show', 'origin/main:point/index.json') === '{"cube":true}' && remoteIndex().runs[0].run === roadFcStamp(T + 7 * H), refused?.message);
  git(repo, 'reset', '--quiet', '--hard', 'origin/main');
  const ni = nextIndex({ runs: [{ run: roadFcStamp(T - 5 * H) }, { run: roadFcStamp(T - H) }] }, fake(T).entry, T);
  add('D8 nextIndex: neuer Lauf vorn, zu alter Lauf in drop, killed wird durchgereicht', ni.index.runs[0].run === roadFcStamp(T) && eq(ni.drop, [roadFcStamp(T - 5 * H)]) && ni.index.runs.length === 2 && nextIndex(null, fake(T).entry, T, true).index.killed === true);
}

// --- E: workflow template --------------------------------------------------------------------------------
{
  // Line ends as in the repo — a Windows checkout may carry CRLF (V-AW-15).
  const wf = readFileSync(join(HERE, 'road', 'workflow-road-fc.yml'), 'utf8').replace(/\r\n/g, '\n');
  const code = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const cron = /cron:\s*'([^']+)'/.exec(code)?.[1];
  add(`E1 Takt = ROAD_FC_CRON (${ROAD_FC_CRON}), stündlich; Aufbewahrung ${ROAD_FC_RETENTION.maxAgeMs / H} h deckt zwei ausgefallene Läufe`, cron === ROAD_FC_CRON && /^\d+ \* \* \* \*$/.test(cron) && ROAD_FC_RETENTION.maxAgeMs >= 3 * H && ROAD_FC_STALE_MS >= ROAD_FC_RETENTION.maxAgeMs, cron);
  add('E2 kein --force, contents: write, eigene concurrency-Gruppe ohne Abbruch, kein Eingriff in fremde Workflows (kein Dispatch, kein actions: write)',
    !/--force|push\s+-f\b/.test(code) && /contents:\s*write/.test(code) && /group:\s*road-fc\b/.test(code) && /cancel-in-progress:\s*false/.test(code) && !/actions:\s*write/.test(code) && !/dispatches/.test(code));
  add('E7 zweiter Auslöser: nach jedem abgeschlossenen Lauf von „point" (workflow_run hört nur zu — kein Dispatch, point.yml unberührt); der Zeitplan bleibt',
    /workflow_run:\s*\n\s+workflows:\s*\[point\]\s*\n\s+types:\s*\[completed\]/.test(code) && /schedule:/.test(code) && /workflow_dispatch:/.test(code));
  const sparse = /sparse-checkout:\s*\|\n((?:\s{12}\S.*\n)+)/.exec(code)?.[1].trim().split(/\s+/) ?? [];
  add('E3 Checkout des Daten-Repos: sparse mit point (Cube, MOSMIX, Tabellen), radar/img (Stundenmittel), road (Punkte, Zeiger); ohne Blobs der übrigen Pfade',
    eq(sparse, ['point', 'radar/img', 'road']) && /filter:\s*blob:none/.test(code) && /fetch-depth:\s*1/.test(code), sparse.join(' '));
  const prodSrc = readFileSync(join(HERE, 'road', 'road-forecast.mjs'), 'utf8');
  add('E4 Aufruf: --data = Checkout, --publish; Schalter ROAD_FC aus der Repo-Variable; die Punktdatei verlangt nicht mehr der Workflow, der Producer holt sie bei Verlust aus dem Archiv, bevor er rechnet (V-AW-24)',
    /road-forecast\.mjs --data="\$GITHUB_WORKSPACE" --publish/.test(code) && /ROAD_FC:\s*\$\{\{ vars\.ROAD_FC \}\}/.test(code) && !/test -f road\/fc\/v1\/static\/points\.json/.test(code)
    && prodSrc.indexOf('await restoreFcStatic(') > 0 && prodSrc.indexOf('await restoreFcStatic(') < prodSrc.indexOf('await buildRun({ dataDir: flags.data') && /heal: healed\.restored/.test(prodSrc));
  const patterns = /sparse-checkout set --no-cone ([^\n]+)/.exec(code)?.[1].trim().split(/\s+/) ?? [];
  const seen = new Set(), bare = new Set();
  const walk = (abs) => {
    if (seen.has(abs)) return;
    seen.add(abs);
    // Type-only imports are stripped at load time (`--experimental-strip-types`) — they load nothing.
    const src = readFileSync(abs, 'utf8').replace(/^\s*(?:import|export)\s+type\s[^;]*;/gm, '');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
      const spec = m[1];
      if (!spec.startsWith('.')) { if (!spec.startsWith('node:') && /^[@a-z]/.test(spec) && !/\s/.test(spec)) bare.add(`${spec} ← ${relative(ROOT, abs).replace(/\\/g, '/')}`); continue; }
      let p = resolve(dirname(abs), spec);
      if (!existsSync(p) || !/\.[a-z]+$/.test(p)) for (const ext of ['.ts', '.tsx', '.mjs', '.js', '/index.ts']) if (existsSync(p + ext)) { p += ext; break; }
      if (existsSync(p) && /\.(ts|tsx|mjs|js)$/.test(p)) walk(p);
    }
    for (const m of src.matchAll(/register\('(\.\/[^']+)'/g)) walk(resolve(dirname(abs), m[1]));
  };
  walk(join(HERE, 'road', 'road-forecast.mjs'));
  walk(join(HERE, 'lib', 'register-ts.mjs'));
  const fl = [...seen].map((p) => relative(ROOT, p).replace(/\\/g, '/'));
  const outside = fl.filter((f) => !patterns.some((pt) => f === pt || f.startsWith(`${pt}/`)));
  add('E5 jede Datei, die der Producer lädt, liegt im sparse-Muster des App-Klons; dazu public/climaGrid.json (Klimatologie-Prior)', fl.length >= 30 && !outside.length && patterns.includes('public/climaGrid.json') && patterns.includes('package.json'),
    outside.length ? outside.slice(0, 5).join(' ') : `${fl.length} Dateien unter ${patterns.join(' ')}`);
  const pkgs = [...new Set([...bare].map((x) => x.split(' ← ')[0]))].sort();
  const installLine = code.split('\n').find((l) => l.includes('npm install --prefix "$RUNNER_TEMP"')) ?? '';
  const installed = installLine.trim().split(/\s+/).filter((x) => /^[@a-z][\w./-]*@[\d.]+$/.test(x)).map((x) => x.replace(/@[\d.]+$/, '')).sort();
  add('E6 npm-Pakete, die der Producer beim Import lädt = genau die, die der Workflow NEBEN den Klon installiert (bz2, jsfive); kein maplibre/react im Ladeweg',
    eq(pkgs, installed) && eq(pkgs, ['bz2', 'jsfive']), `lädt ${pkgs.join(', ')} · installiert ${installed.join(', ')}`);
}

// --- F: client reader --------------------------------------------------------------------------------------
{
  const realFetch = globalThis.fetch;
  const now = Date.UTC(2026, 9, 4, 12, 0);
  const mk = (minAgo) => ({ run: roadFcStamp(now - minAgo * 60_000), issuedAt: new Date(now - minAgo * 60_000).toISOString(), t0Ms: roadFcT0(now - minAgo * 60_000), publishedAt: new Date(now - (minAgo - 2) * 60_000).toISOString(), points: 1, failed: 0 });
  const index = { schema: 1, product: 'road-fc-index', updatedAt: 'x', killed: false, runs: [mk(4), mk(64)] };
  const good = Object.fromEntries(ROAD_FC_VAR_IDS.map((v) => [v, new Array(ROAD_FC_STEPS).fill(v === 'q' ? 0 : 5)]));
  const fileFor = (run) => ({ schema: 1, product: 'road-fc', run, issuedAt: 'x', t0Ms: roadFcT0(roadFcStampToMs(run)), steps: ROAD_FC_STEPS, kind: 'corridor', id: 'a8', engine: {}, source: '', points: [{ id: 'a8@0', kind: 'axis', km: 0, lat: 50, lon: 10, h: 1, mos: null, v: good }] });
  const calls = [];
  const serve = (routes) => { globalThis.fetch = async (u) => { const url = String(u); calls.push(url); const r = routes(url); return r === undefined ? new Response('nf', { status: 404 }) : new Response(JSON.stringify(r), { status: 200 }); }; };
  const older = mk(64).run, newer = mk(4).run;
  serve((u) => (u === `${ROAD_FC_RAW_BASE}/${ROAD_FC_INDEX_PATH}` ? index : u === `${ROAD_FC_CDN_BASE}/${roadFcCorridorPath(older, 'a8')}` ? fileFor(older) : undefined));
  const a = await loadRoadFc('corridor', 'a8', now);
  add('F1 Leser: Zeiger NUR über raw.githubusercontent, Lauf-Datei über jsDelivr; der frische Lauf (2 min veröffentlicht) wird übersprungen, der davor gelesen',
    a.reason === 'ok' && a.run.run === older && a.file.points.length === 1 && calls[0] === `${ROAD_FC_RAW_BASE}/${ROAD_FC_INDEX_PATH}` && calls.filter((c) => c.includes('index.json')).every((c) => c.startsWith('https://raw.githubusercontent.com/'))
    && calls[1] === `${ROAD_FC_CDN_BASE}/${roadFcCorridorPath(older, 'a8')}` && calls.length === 2, calls.map((c) => c.replace(/^https:\/\//, '').split('/')[0]).join(' → '));
  calls.length = 0;
  serve((u) => (u.endsWith(ROAD_FC_INDEX_PATH) ? index : u === `${ROAD_FC_RAW_BASE}/${roadFcStatePath(older, 'BW')}` ? { ...fileFor(older), kind: 'state', id: 'BW' } : undefined));
  const b = await loadRoadFc('state', 'BW', now);
  add('F2 404 am CDN (jsDelivr löst @main verspätet auf): dieselbe Datei einmal über raw nachgeholt', b.reason === 'ok' && b.file.kind === 'state' && calls.length === 3 && calls[2].startsWith(ROAD_FC_RAW_BASE));
  serve(() => undefined);
  const c = await loadRoadFc('corridor', 'a8', now);
  serve((u) => (u.endsWith(ROAD_FC_INDEX_PATH) ? index : undefined));
  const d = await loadRoadFc('corridor', 'a8', now);
  serve((u) => (u.endsWith(ROAD_FC_INDEX_PATH) ? { ...index, killed: true } : fileFor(older)));
  const e = await loadRoadFc('corridor', 'a8', now);
  serve((u) => (u.endsWith(ROAD_FC_INDEX_PATH) ? index : fileFor(newer)));
  const f = await loadRoadFc('corridor', 'a8', now);
  add('F3 Gründe statt leerer Anzeige: Zeiger nicht lesbar ⇒ no-index; Datei fehlt ⇒ no-file; Schalter aus ⇒ no-run; Datei eines ANDEREN Laufs unter dem Pfad ⇒ no-file',
    c.reason === 'no-index' && d.reason === 'no-file' && d.run.run === older && e.reason === 'no-run' && f.reason === 'no-file', [c, d, e, f].map((x) => x.reason).join(' '));
  serve((u) => (u.endsWith(ROAD_FC_INDEX_PATH) ? index : undefined));
  const idx = await loadRoadFcIndex();
  add('F4 loadRoadFcIndex liefert den geprüften Zeiger (neueste zuerst)', idx?.runs.length === 2 && idx.runs[0].run === newer);
  globalThis.fetch = realFetch;
}

// --- G: the real static files of the data repo (optional) ---------------------------------------------------
if (typeof flags.data === 'string') {
  const fcDir = join(flags.data, ROAD_FC_REPO_DIR);
  const doc = parseRoadFcPoints(JSON.parse(readFileSync(join(fcDir, ROAD_FC_POINTS_PATH), 'utf8')));
  const cor = JSON.parse(readFileSync(join(flags.data, ROAD_REPO_DIR, 'static', 'corridors.json'), 'utf8')).corridors;
  const ax = doc.points.filter((p) => p.kind === 'axis'), st = doc.points.filter((p) => p.kind === 'station');
  const ids = new Set(doc.points.map((p) => p.id));
  add('G1 echte Punktdatei: lesbar, Kennungen eindeutig, Zählung = Punkte, Quellen nennen OSM (ODbL), BKG und DWD',
    !!doc && ids.size === doc.points.length && doc.counts.axis === ax.length && doc.counts.station === st.length && doc.sources.some((s) => /ODbL/.test(s.license) && /OpenStreetMap/.test(s.attribution)) && doc.sources.length === 3,
    `${ax.length} Achse + ${st.length} Stationen`);
  const want = cor.flatMap((c) => roadFcAxisKms(c.lengthKm).map((km) => roadFcAxisId(c.id, km)));
  add('G2 Achspunkte = alle 5 km auf JEDEM Korridor der Korridordatei (keiner fehlt, keiner zu viel)', eq(ax.map((p) => p.id), want), `${want.length} erwartet, ${cor.length} Korridore`);
  const snapped = ax.filter((p) => p.snap != null), un = ax.filter((p) => p.snap == null);
  let offAxis = 0, maxMove = 0;
  const byC = new Map(cor.map((c) => [c.id, c]));
  for (const p of ax) {
    const c = byC.get(p.corridor), nominal = roadPointAtKm(c.line, p.km + (p.slide ?? 0));
    const move = 1000 * roadKmBetween(nominal, [p.lon, p.lat]);
    maxMove = Math.max(maxMove, move);
    if (p.snap == null ? move > 2 : Math.abs(move - p.snap) > 3) offAxis++;
  }
  const srt = snapped.map((p) => p.snap).sort((a, b) => a - b);
  add(`G3 Lage: eingerastete Punkte liegen genau snap Meter von der Nennlage (nachgerechnet), nie weiter als ${ROAD_FC_SNAP_MAX_M} m; nicht eingerastete liegen auf der Achse`,
    offAxis === 0 && srt[srt.length - 1] <= ROAD_FC_SNAP_MAX_M, `eingerastet ${snapped.length}/${ax.length}, p50 ${srt[Math.floor(srt.length / 2)]} m, p90 ${srt[Math.floor(srt.length * 0.9)]} m, max ${srt[srt.length - 1]} m; nicht eingerastet ${un.length}`);
  add('G4 nicht eingerastete Punkte sind benannt und selten (< 2 %)', un.length / ax.length < 0.02 && un.every((p) => p.snap === null), un.map((p) => p.id).join(' '));
  const stations = JSON.parse(readFileSync(join(flags.data, ROAD_REPO_DIR, 'static', 'stations.json'), 'utf8')).stations;
  const live = Object.entries(stations).filter(([, s]) => !s.oob && Number.isFinite(s.lat) && Number.isFinite(s.lon));
  add('G5 Stationspunkte = jede Katalogstation mit Koordinate, die nicht außer Betrieb ist, an der Katalogposition', st.length === live.length && st.every((p) => { const s = stations[p.id]; return s && Math.abs(s.lat - p.lat) < 1e-5 && Math.abs(s.lon - p.lon) < 1e-5; }), `${st.length}`);
  const geo = JSON.parse(readFileSync(join(fcDir, ROAD_FC_GEO_PATH), 'utf8'));
  const terr = geo.entries.filter(([k]) => k.startsWith('terrain/')), z0 = geo.entries.filter(([k]) => k.startsWith('z0:'));
  const tKeys = new Set(terr.map(([k]) => k.split('/').pop()));
  const missT = doc.points.filter((p) => !tKeys.has(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`));
  add('G6 Gelände vorab für JEDEN Punkt (Schlüssel = Punktkoordinate), Höhe gesetzt, Skalen mit Abtastungen; Rauhigkeit für ≥ 99 % der Punkte',
    missT.length === 0 && terr.every(([, v]) => v.elevationM != null && v.scales?.sampledCount > 0) && z0.length >= 0.99 * new Set(doc.points.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`)).size && geo.failed.length <= 0.01 * doc.points.length,
    `Gelände ${terr.length}, z0 ${z0.length}, unvollständig ${geo.failed.length}${missT.length ? `, ohne Gelände: ${missT.slice(0, 3).map((p) => p.id).join(' ')}` : ''}`);
}

// --- H: forecast store in buscosun-archiv -------------------------------------------------------------------
{
  const { archiveRoadFc, thinRun, fcArchivePath, ROAD_FC_ARCHIVE_STEPS, ROAD_FC_ARCHIVE_VARS } = await import('./road/road-fc-archive.mjs');
  const { gunzipSync } = await import('node:zlib');
  const { cpSync } = await import('node:fs');
  const fcDir = join(tmp, 'fcstore'), arch = join(tmp, 'fcarch');
  cpSync(join(tmp, 'out', built.run), join(fcDir, built.run), { recursive: true });
  const older = { ...built.entry, run: roadFcStamp(nowMs - 2 * H) };
  writeFileSync(join(fcDir, ROAD_FC_INDEX_PATH), JSON.stringify(nextIndex({ runs: [older] }, built.entry, nowMs).index));
  const r1 = archiveRoadFc({ fcDir, archiveDir: arch, nowMs });
  const doc = JSON.parse(gunzipSync(readFileSync(join(arch, r1.stored))).toString('utf8'));
  const src = JSON.parse(runFiles['c/a99.json']).points.find((p) => p.id === 'S900');
  add(`H1 Ablage: nur Stationspunkte (keine Achspunkte), die ersten ${ROAD_FC_ARCHIVE_STEPS} Stunden, Größen ${ROAD_FC_ARCHIVE_VARS.join('/')} — Werte = Anfang der Reihen der Lauf-Datei, Motor-Block übernommen`,
    r1.ok && r1.stations === 2 && eq(Object.keys(doc.stations), ['S900', 'S901']) && doc.steps === ROAD_FC_ARCHIVE_STEPS && eq(Object.keys(doc.stations.S900.v), [...ROAD_FC_ARCHIVE_VARS])
    && ROAD_FC_ARCHIVE_VARS.every((k) => eq(doc.stations.S900.v[k], src.v[k].slice(0, ROAD_FC_ARCHIVE_STEPS))) && doc.engine.name === FUSION_NAME && doc.stations.S900.at === 'a99' && doc.stations.S901.at === null
    && doc.run === built.run && doc.t0Ms === roadFcT0(nowMs), `${r1.stored}, ${r1.bytes} B`);
  add('H2 Pfad = UTC-Tag der Ausgabezeit / Lauf; nur der JÜNGSTE Lauf des Zeigers wird abgelegt (der ältere nicht)',
    r1.stored === fcArchivePath(built.run) && r1.stored.startsWith(new Date(nowMs).toISOString().slice(0, 10)) && !existsSync(join(arch, fcArchivePath(older.run))));
  const bytes1 = readFileSync(join(arch, r1.stored)).toString('base64'), idx1 = readFileSync(join(arch, 'index.json'), 'utf8');
  const r2 = archiveRoadFc({ fcDir, archiveDir: arch, nowMs: nowMs + H });
  add('H3 zweiter Lauf des Jobs mit demselben Stand: nichts geschrieben — Datei und Index byte-gleich (ein abgelegter Lauf wird nie überschrieben)',
    r2.ok && r2.stored === null && readFileSync(join(arch, r1.stored)).toString('base64') === bytes1 && readFileSync(join(arch, 'index.json'), 'utf8') === idx1);
  const idx = JSON.parse(idx1);
  add('H4 Index nennt den Lauf unter seinem Tag mit Stationszahl und Bytes', idx.days[r1.stored.slice(0, 10)]?.[built.run]?.stations === 2 && idx.days[r1.stored.slice(0, 10)][built.run].bytes === r1.bytes);
  const bad = join(tmp, 'fcbad');
  cpSync(fcDir, bad, { recursive: true });
  writeFileSync(join(bad, built.run, 'c', 'a99.json'), '{kaputt');
  const r3 = archiveRoadFc({ fcDir: bad, archiveDir: join(tmp, 'fcarch2'), nowMs });
  const r4 = archiveRoadFc({ fcDir: join(tmp, 'gibtsnicht'), archiveDir: join(tmp, 'fcarch2'), nowMs });
  add('H5 unlesbare Lauf-Datei oder kein Zeiger: Fehler mit Grund, nichts abgelegt (keine halbe Datei)', !r3.ok && /nicht lesbar/.test(r3.reason) && !r4.ok && !existsSync(join(tmp, 'fcarch2')));
  add('H6 thinRun ohne Dateien ⇒ null', thinRun([]) === null);
  const wf = readFileSync(join(HERE, 'punktarchiv-repo', 'workflow-road-archiv.yml'), 'utf8').replace(/\r\n/g, '\n');
  const code = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  add('H7 Archiv-Workflow: Daten-Klon nimmt road/fc/v1 mit, eigener Schritt mit continue-on-error VOR dem Commit, Ziel road/fc/v1 (unter road/, das der Commit erfasst)',
    /sparse-checkout set --no-cone road\/v1 road\/fc\/v1\b/.test(code) && /name: Archive route forecast\n\s*continue-on-error: true/.test(code) && code.includes(`--fc=../data/${ROAD_FC_REPO_DIR} --archive=../${ROAD_FC_REPO_DIR}`)
    && code.indexOf('Archive route forecast') < code.indexOf('Commit and push') && /git add -A -- road\s*$/m.test(code));
}

rmSync(tmp, { recursive: true, force: true });
// --- I: view model of the page (AW-6.1b) on a REAL run file ------------------------------------------------
{
  const V = await import('../src/road/roadFcView.ts');
  const S = await import('../src/road/roadState.ts');
  const RV = await import('../src/road/roadView.ts');
  const { ROAD_CLASS_LABEL } = await import('../src/road/roadClasses.ts');
  const file = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'road', 'fc-a8-2610040905.json'), 'utf8'));
  const parsed = parseRoadFcFile(file);
  const a8 = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'road', 'corridors-munich.json'), 'utf8')).corridors.find((c) => c.id === 'a8');
  const t0 = file.t0Ms;
  add('I0 Fixture ist ein echter Lauf: vom Leser des Clients angenommen, kein Punkt verworfen, Achspunkte alle 5 km',
    !!parsed && parsed.dropped === 0 && V.roadFcAxisPoints(file).length === roadFcAxisKms(a8.lengthKm).length, `${file.points.length} Punkte, ${V.roadFcAxisPoints(file).length} Achspunkte`);

  const st = [t0 - 31 * 60_000, t0 - 29 * 60_000, t0, t0 + 29 * 60_000, t0 + 31 * 60_000, t0 + 48 * H + 29 * 60_000, t0 + 48 * H + 31 * 60_000].map((ms) => V.roadFcStep(file, ms));
  add('I1 Stunde = nächster voller Schritt; vor dem ersten und nach dem letzten Schritt gibt es KEINEN Wert (kein Festhalten am Rand)', eq(st, [null, 0, 0, 0, 1, 48, null]), JSON.stringify(st));

  const ax = V.roadFcAxisPoints(file)[5];
  const v7 = V.roadFcValue(ax, file, t0 + 7 * H + 10 * 60_000);
  const manual = { t: ax.v.t[7] / 10, td: ax.v.td[7] / 10, pp: ax.v.pp[7], rr: ax.v.rr[7] / 100, ff: ax.v.ff[7] / 10, fx: ax.v.fx[7] / 10, n: ax.v.n[7] };
  const holed = { ...ax, v: { ...ax.v, t: ax.v.t.map((x, i) => (i === 7 ? null : x)) } };
  add('I2 Wert einer Stunde = Dekodierung des Vertrags am selben Schritt; fehlt die Lufttemperatur, gibt es keinen Wert (Gegenprobe: Nachbarschritt weicht ab oder ist ein anderer Schritt)',
    !!v7 && v7.step === 7 && v7.validMs === t0 + 7 * H && eq({ t: v7.t, td: v7.td, pp: v7.pp, rr: v7.rr, ff: v7.ff, fx: v7.fx, n: v7.n }, manual)
    && V.roadFcValue(holed, file, t0 + 7 * H) === null && V.roadFcValue(holed, file, t0 + 8 * H)?.step === 8, JSON.stringify(manual));

  const cls = [-0.1, 0, 0.1, 3, 3.1].map(V.roadFcAirClass).join();
  const marks = [[49, 0], [50, 0], [50, 29], [50, 30], [80, 100], [null, 100]].map(([pp, sn]) => V.roadFcPrecipMark({ pp, sn })).join();
  const texts = [{ pp: 10, rr: 0, sn: 0 }, { pp: 30, rr: 0.04, sn: 0 }, { pp: 60, rr: 0.42, sn: 10 }, { pp: 70, rr: 1.2, sn: 50 }, { pp: 90, rr: 2, sn: 95 }, { pp: null, rr: null, sn: null }].map(V.roadFcPrecipText);
  add('I3 Luft-Klassen an den Grenzen (≤ 0 · bis +3 · darüber), Niederschlags-Marke ab 50 %, Art aus dem Schnee-Anteil (30/70 %)',
    cls === 'frost,frost,near,near,above' && marks === 'none,rain,rain,snow,snow,none'
    && eq(texts, ['Niederschlag 10 %', 'Regen 30 %', 'Regen 60 % · 0,4 mm', 'Schneeregen 70 % · 1,2 mm', 'Schnee 90 % · 2,0 mm', '—']), `${cls} | ${marks} | ${texts.join(' / ')}`);

  // Band row: one cell per axis point, gapless from 0 to the corridor end, mirrored for the other direction.
  const ms = t0 + 5 * H;
  const band = V.roadFcBand(a8, file, 0, ms), back = V.roadFcBand(a8, file, 1, ms);
  const gapless = band.every((c, i) => (i === 0 ? c.fromKm === 0 : Math.abs(c.fromKm - band[i - 1].toKm) < 1e-9)) && Math.abs(band[band.length - 1].toKm - a8.lengthKm) < 1e-9;
  const mirrored = back.length === band.length && back.every((c, i) => { const o = band[band.length - 1 - i]; return c.id === o.id && Math.abs(c.fromKm - (a8.lengthKm - o.toKm)) < 1e-6 && c.cls === o.cls && c.mark === o.mark; });
  const byHand = V.roadFcAxisPoints(file).map((p) => V.roadFcAirClass(p.v.t[5] / 10)).join();
  add('I4 Prognose-Zeile: je Achspunkt eine Zelle, lückenlos von km 0 bis zum Ende, Klasse = Luft des Schritts (von Hand nachgerechnet); Gegenrichtung gespiegelt',
    band.length === V.roadFcAxisPoints(file).length && gapless && mirrored && band.map((c) => c.cls).join() === byHand, `${band.length} Zellen, Klassen ${[...new Set(band.map((c) => c.cls))].join('/')}`);

  // A lost point leaves a hole (never stretched neighbours); a point without a value is a hatched cell.
  const lostFile = { ...file, points: file.points.filter((p) => !(p.kind === 'axis' && (p.km === 50 || p.km === 55))) };
  const lost = V.roadFcBand(a8, lostFile, 0, ms);
  const i45 = lost.findIndex((c) => c.km === 45), i60 = lost.findIndex((c) => c.km === 60);
  const nullFile = { ...file, points: file.points.map((p) => (p.id === ax.id ? holed : p)) };
  const nullBand = V.roadFcBand(a8, nullFile, 0, t0 + 7 * H);
  add('I5 fehlen zwei Achspunkte, bleibt ein Loch (Nachbarn reichen höchstens 5 km); ein Punkt ohne Wert ist eine schraffierte Zelle, keine Farbe',
    i45 >= 0 && i60 === i45 + 1 && lost[i45].toKm === 50 && lost[i60].fromKm === 55 && nullBand.find((c) => c.id === ax.id)?.cls === 'gap' && nullBand.filter((c) => c.cls === 'gap').length === 1,
    `Loch km ${lost[i45]?.toKm}–${lost[i60]?.fromKm}`);

  // Gap rows of the route table: only axis points farther than 10 km from every station, on full 10 km.
  const noGap = V.roadFcGapPoints(a8, file);
  const thin = { ...a8, stations: a8.stations.filter((s) => s.km < 30 || s.km > 95) };
  const gaps = V.roadFcGapPoints(thin, file).map((p) => p.km);
  const wantGaps = V.roadFcAxisPoints(file).map((p) => p.km).filter((km) => km % 10 === 0 && thin.stations.every((s) => Math.abs(s.km - km) > 10));
  add('I6 Prognosepunkte als Tabellenzeilen nur, wo keine Messstelle im 10-km-Umkreis liegt (auf vollen 10 km): echter Korridor ' + noGap.length + ', mit Lücke km 30–95 ' + gaps.length,
    eq(gaps, wantGaps) && gaps.length >= 3 && gaps.every((km) => km > 30 && km < 95) && noGap.length < gaps.length, gaps.join(','));

  // Trip summary against brute force.
  const rows = V.roadFcAxisPoints(file).map((p, i) => ({ km: p.km, value: V.roadFcValue(p, file, t0 + (2 + Math.floor(i / 6)) * H) }));
  const trip = V.roadFcTrip([...rows, { km: 999, value: null }]);
  const brute = rows.reduce((a, r) => (r.value.t < a.value.t ? r : a));
  const wet = rows.filter((r) => r.value.pp >= 50).length;
  const txt = V.roadFcTripText(trip);
  add('I7 Wetter zur Ankunft: kälteste Luft und Zahl der Punkte mit Niederschlag ab 50 % = von Hand; Zeilen ohne Prognose zählen nicht',
    trip.n === rows.length && trip.coldest.km === brute.km && trip.coldest.value.t === brute.value.t && trip.wet === wet && txt.includes(RV.f1(brute.value.t)) && /^Prognose zur Ankunft: kälteste Luft/.test(txt), txt);

  const issued = Date.parse(file.issuedAt);
  const rv = [0, 2.9, 3.1, 11.9, 12.1].map((h) => V.roadFcRunView({ issuedAt: file.issuedAt }, issued + h * H));
  const none = V.roadFcRunView(null, issued);
  add('I8 Lauf-Etikett: bis 3 h „Lauf HH:MM", bis 12 h „· veraltet", danach und ohne Lauf keine Prognose (Chips gesperrt)',
    rv.map((x) => x.freshness).join() === 'live,live,stale,stale,dead' && eq(rv.map((x) => x.usable), [true, true, true, true, false]) && /^Lauf \d\d:\d\d$/.test(rv[0].label) && / · veraltet$/.test(rv[2].label) && !none.usable && none.label === 'keine Prognose',
    rv.map((x) => x.label).join(' | '));

  // URL state: forecast hour and forecast point.
  const u1 = S.parseRoadUrl('a8', '?st=a8%4070&t=3'), u2 = S.parseRoadUrl('a8-4', '?st=a8-4@127.5&t=6&dir=1'), u3 = S.parseRoadUrl('a8', '?st=a8@&t=2'), u4 = S.parseRoadUrl('a8', '?st=AB12&t=0');
  const round = S.parseRoadUrl('a8-4', S.buildRoadUrl(u2.state).split('?')[1] ? `?${S.buildRoadUrl(u2.state).split('?')[1]}` : '');
  add('I9 URL: t=1/3/6 und st=<Achspunkt> gültig (Rundweg gleich), t=2 und ein kaputter Achspunkt werden als ungültig gemeldet; Stations-Kennungen wie bisher',
    S.ROAD_FORECAST_ENABLED === true && u1.invalid.length === 0 && u1.state.st === 'a8@70' && u1.state.t === 3 && u2.invalid.length === 0 && u2.state.st === 'a8-4@127.5' && eq(round.state, u2.state)
    && eq(u3.invalid.sort(), ['st', 't']) && u4.invalid.length === 0 && u4.state.st === 'AB12' && V.isRoadFcAxisId('a8@70') && !V.isRoadFcAxisId('AB12') && !V.isRoadFcAxisId(null), S.buildRoadUrl(u2.state));

  // No forecast text speaks the language of the measured road classes.
  const roadWords = new RegExp(Object.values(ROAD_CLASS_LABEL).flatMap((l) => [l.label, l.short]).filter((w) => w && w.length > 3).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + '|Glätte|Glatteis|überfrier', 'i');
  const produced = [
    ...V.roadFcAxisPoints(file).flatMap((p) => [0, 6, 12, 30].map((h) => V.roadFcLine(V.roadFcValue(p, file, t0 + h * H)))),
    ...Object.values(V.ROAD_FC_AIR_LABEL), txt, ...rv.map((x) => x.label), V.roadFcAxisName(a8, ax, 0),
  ];
  const control = roadWords.test(ROAD_CLASS_LABEL.frost.label) && roadWords.test(ROAD_CLASS_LABEL.dry.label) && roadWords.test('Glätte gemessen');
  add('I10 kein Prognose-Text benutzt Wörter der gemessenen Fahrbahnklassen (Gegenprobe: das Muster trifft die Klassen-Etiketten); der Hinweis sagt „keine Prognose der Fahrbahn"',
    control && produced.length > 100 && produced.every((s) => typeof s === 'string' && s.length > 0 && !roadWords.test(s)) && /keine Prognose der Fahrbahn/.test(V.roadFcUiNote(null)) && V.roadFcUiNote(file).includes(V.roadFcEngineName(file))
      && V.roadFcEngineName({ engine: { name: fusionName(8) } }) === 'buscosun Fusion 8' && V.roadFcEngineName({ engine: { name: 'x', version: 12 } }) === 'buscosun Fusion 12' && V.roadFcEngineName(null) === 'buscosun Fusion' && V.roadFcEngineName({ engine: {} }) === 'buscosun Fusion',
    `${produced.length} Texte, z. B. „${produced[3]}"`);

  const def = V.defaultRoadFcAxis(file, ms);
  const coldest = V.roadFcAxisPoints(file).reduce((a, p) => (p.v.t[5] < a.v.t[5] ? p : a));
  add('I11 Korridor ohne Messstelle öffnet auf dem Achspunkt mit der kältesten Prognose-Luft der Stunde', def?.v.t[5] === coldest.v.t[5], `${def?.id} ${def?.v.t[5] / 10} °C`);
}

// --- J: measurement anchor from the road weather stations (V-AW-21) ----------------------------------------
{
  const V = await import('../src/road/roadFcView.ts');
  const { ROAD_CLASS_LABEL } = await import('../src/road/roadClasses.ts');
  const { thinRun } = await import('./road/road-fc-archive.mjs');
  const slotMs = roadSlotOf(nowMs);
  const base = Object.fromEntries(Object.values(runFiles).flatMap((t) => JSON.parse(t).points).map((p) => [p.id, p]));
  const OFF = 2;   // the stations measure 2 K above the unanchored forecast of their own point
  const cat = {
    S900: { n: 'Fixture Nord', lat: POINTS[2].lat, lon: POINTS[2].lon, h: FIX.hTrue },
    S901: { n: 'Fixture Land', lat: POINTS[3].lat, lon: POINTS[3].lon, h: FIX.hTrue },
    S902: { n: 'falsch verortet', lat: FIX.lat + 0.01, lon: FIX.lon, h: FIX.hTrue },
    S903: { n: 'ohne Höhe', lat: FIX.lat - 0.01, lon: FIX.lon },
    S904: { n: 'weit', lat: FIX.lat + 0.5, lon: FIX.lon, h: FIX.hTrue },
  };
  cat.S900x = cat.S900;
  const row = (id, ta, extra = {}) => ({ id, n: cat[id].n, lat: cat[id].lat, lon: cat[id].lon, t: slotMs, ta, td: ta - 3, rh: 80, ws: 4, wd: 270, wg: 7, ...extra });
  const rows = [
    row('S900', base.S900.v.t[0] / 10 + OFF), row('S901', base.S901.v.t[0] / 10 + OFF),
    row('S902', 5, { lat: FIX.lat + 0.6 }), row('S903', 5), row('S904', 5), row('S900x', null), { id: 'S905', lat: 1, lon: 1, t: slotMs },
  ];
  const table = swisTable(rows, cat, POINTS);
  add('J1 Messtabelle: nur Stationen mit Lufttemperatur; als Nachbar taugt nur, wessen Meldeposition zum Katalog passt (≤ 2 km) und wessen Höhe bekannt ist — die eigene Station zählt in jedem Fall',
    table.size === 5 && table.get('S900').place && table.get('S901').place && !table.get('S902').place && !table.get('S903').place && table.get('S904').place && !table.has('S900x') && !table.has('S905'),
    [...table.values()].map((m) => `${m.id}:${m.place ? 1 : 0}`).join(' '));
  const own = anchorObsFor(POINTS[2], table), ownW = anchorObsFor(POINTS[2], table, { wind: true });
  const ax = anchorObsFor(POINTS[0], table), lo = anchorObsFor(POINTS[2], table, { leaveOut: true });
  add('J2 Auswahl: Stationspunkt = genau die eigene Messung (Abstand 0, Höhe des Punkts, nur Temperatur/Feuchte — kein Wind); Achspunkt = platzierte Nachbarn nach Abstand, ≤ 30 km, mit Kataloghöhe; ausgelassen = nie die eigene',
    own.length === 1 && own[0].distanceM === 0 && own[0].elevM === null && own[0].stationId === 'S900' && own[0].u === null && own[0].v === null && own[0].gust === null && own[0].validAtMs === slotMs && own[0].source === 'swis'
    && Math.abs(ownW[0].u - 4) < 1e-9 && Math.abs(ownW[0].v) < 1e-9 && ownW[0].gust === 7
    && eq(ax.map((o) => o.stationId), ['S900', 'S901']) && ax.every((o) => o.distanceM > 0 && o.distanceM <= ROAD_FC_ANCHOR.maxKm * 1000 && o.elevM === FIX.hTrue) && ax[0].distanceM <= ax[1].distanceM
    && eq(lo.map((o) => o.stationId), ['S901']) && anchorObsFor(POINTS[0], table, { noNeighbours: true }).length === 0,
    `Achspunkt: ${ax.map((o) => `${o.stationId} ${(o.distanceM / 1000).toFixed(1)} km`).join(', ')}`);

  const withObs = (name, atMs, doc = {}) => {
    const dir = mkData(name, files);
    mkdirSync(join(dir, ROAD_REPO_DIR, 'obs'), { recursive: true });
    mkdirSync(join(dir, ROAD_REPO_DIR, 'static'), { recursive: true });
    writeFileSync(join(dir, ROAD_REPO_DIR, ROAD_STATIONS_PATH), JSON.stringify({ stations: cat }));
    writeFileSync(join(dir, ROAD_REPO_DIR, 'obs', `${roadStamp(atMs)}.json`), JSON.stringify({ slot: roadStamp(atMs), killed: false, points: rows.map((r) => ({ ...r, t: atMs })), ...doc }));
    return dir;
  };
  const dA = withObs('data-anchor', slotMs);
  const rt = readSwisTable(dA, nowMs, POINTS);
  const st = await buildRun({ dataDir: dA, outDir: join(tmp, 'out-st'), nowMs, inProcess: true, anchor: 'stations' });
  const stFiles = readRun(join(tmp, 'out-st'), st.run);
  const stPts = Object.fromEntries(Object.values(stFiles).flatMap((t) => JSON.parse(t).points).map((p) => [p.id, p]));
  const eng = JSON.parse(stFiles['c/a99.json']).engine;
  const d = (id, i) => (stPts[id].v.t[i] - base[id].v.t[i]) / 10;
  add('J3 Lauf „stations": der Kopf nennt, was geschah (anchor swis, Messslot, 2 verankerte Punkte); an der Station steht der Versatz Messung − Cube-Wert am Punkt (positiv, eigene Messung, Gewicht 100 %) und die Prognose rückt in seine Richtung, nie über die Messung hinaus',
    rt?.slot === roadStamp(slotMs) && eng.anchor === 'swis' && eng.anchorMode === 'stations' && eng.anchorSlot === roadStamp(slotMs) && eng.anchored === 2 && st.entry.engine.anchored === 2
    && ['S900', 'S901'].every((id) => stPts[id].anc[0] > 0 && stPts[id].anc[1] === 100 && stPts[id].anc[2] === 1 && d(id, 0) > 0.3 && d(id, 0) <= OFF + 0.05 && [1, 6, 24].every((i) => d(id, i) >= 0 && d(id, i) <= OFF + 0.05)),
    `S900: anc ${JSON.stringify(stPts.S900.anc)}, ΔT +0 h ${d('S900', 0)} · +1 h ${d('S900', 1)} · +6 h ${d('S900', 6)} · +24 h ${d('S900', 24)} K`);
  add('J4 Lauf „stations": Achspunkte bleiben byte-gleich zum Lauf ohne Anker und tragen kein anc',
    ['a99@0', 'a99@5'].every((id) => JSON.stringify(stPts[id]) === JSON.stringify(base[id]) && stPts[id].anc === undefined));
  const all = await buildRun({ dataDir: dA, outDir: join(tmp, 'out-all'), nowMs, inProcess: true, anchor: 'all' });
  const allPts = Object.fromEntries(Object.values(readRun(join(tmp, 'out-all'), all.run)).flatMap((t) => JSON.parse(t).points).map((p) => [p.id, p]));
  add('J5 Lauf „all": Achspunkte nehmen die Nachbarn (anc: fremde Messung, Gewicht nach Abstand), die Prognose rückt in Richtung des Versatzes; Stationspunkte wie in „stations"',
    ['a99@0', 'a99@5'].every((id) => allPts[id].anc && allPts[id].anc[2] === 0 && allPts[id].anc[1] > 0 && allPts[id].anc[1] <= 100 && allPts[id].v.t[0] > base[id].v.t[0]) && all.entry.engine.anchored === 4
    && JSON.stringify(allPts.S900) === JSON.stringify(stPts.S900), `a99@0: anc ${JSON.stringify(allPts['a99@0'].anc)}`);

  // Negative controls: the anchored run must be able to equal the unanchored one.
  const none = await buildRun({ dataDir: dA, outDir: join(tmp, 'out-none'), nowMs, inProcess: true, anchor: 'none' });
  const old = await buildRun({ dataDir: withObs('data-old', slotMs - 2 * H), outDir: join(tmp, 'out-old'), nowMs, inProcess: true, anchor: 'stations' });
  const quarter = await buildRun({ dataDir: withObs('data-quarter', slotMs - 15 * 60_000), outDir: join(tmp, 'out-quarter'), nowMs, inProcess: true, anchor: 'stations' });
  const hourAgo = await buildRun({ dataDir: withObs('data-hour', slotMs - H), outDir: join(tmp, 'out-hour'), nowMs, inProcess: true, anchor: 'stations' });
  const dead = await buildRun({ dataDir: withObs('data-killed', slotMs, { killed: true }), outDir: join(tmp, 'out-killed'), nowMs, inProcess: true, anchor: 'stations' });
  const noObs = await buildRun({ dataDir: mkData('data-noobs', files), outDir: join(tmp, 'out-noobs'), nowMs, inProcess: true, anchor: 'stations' });
  add('J6 Gegenproben: Schalter „none", Messung der vorigen oder vorvorigen Stunde, nur eine Viertelstunden-Messung (keine volle Stunde), abgeschalteter Slot (killed) und Klon ohne Messdatei ergeben je den Lauf OHNE Anker — byte-gleich zu C, Kopf sagt anchor none',
    [none, old, hourAgo, quarter, dead, noObs].every((b) => eq(readRun(b.runDir.replace(/[\\/][^\\/]+$/, ''), b.run), runFiles) && b.entry.engine.anchor === 'none' && b.entry.engine.anchored === undefined)
    && !eq(stFiles, runFiles));
  const sh = await buildRun({ dataDir: dA, outDir: join(tmp, 'out-st-sh'), nowMs, shards: 2, anchor: 'stations' });
  add('J7 zwei Scherben als Kindprozesse = ein Prozess, auch mit Anker (der Schalter und die Messtabelle erreichen die Kindprozesse)', eq(readRun(join(tmp, 'out-st-sh'), sh.run), stFiles) && sh.entry.engine.anchored === 2);

  // Direct computation: the engine with exactly this measurement through its own hook.
  const rgba = (b) => { const png = decodePng(b); return { data: toRgba(png), width: png.width, height: png.height }; };
  clearCubeForecastCache();
  const cache = geoBackend(geoDoc);
  const fcD = await getPointForecastFromCube({ lat: POINTS[2].lat, lng: POINTS[2].lon, country: 'DE', hours: ROAD_FC_HOURS, pointSource: 'cube', includeRadarNowcast: true }, {
    store: memoryStore(files), decodePng, decodeRgbPng: rgba, terrain: { decodeRgba: rgba, cache }, clima: getClimaField, z0: { cache, cacheOnly: true },
    obs: async () => [{ source: 'swis', lat: POINTS[2].lat, lon: POINTS[2].lon, elevM: null, distanceM: 0, validAtMs: slotMs, temperature: rows[0].ta, relativeHumidity: 80, dewPoint: rows[0].td, u: null, v: null, gust: null }],
    learnedSource: 'json', climaSource: 'json', stackSource: 'json', stage: 'fs', nowcastHourMean: true, nowMs: () => nowMs,
  });
  const sD = seriesOf(fcD, roadFcT0(nowMs));
  add('J8 Datei = direkte Rechnung von buscosun Fusion 8 mit derselben Messung am Eingang des Motors (eigener Speicher): T, Td, Wind, Böe über 49 Stunden gleich; der Motor nennt den Anker aus swis',
    eq(sD.t, stPts.S900.v.t) && eq(sD.td, stPts.S900.v.td) && eq(sD.ff, stPts.S900.v.ff) && eq(sD.fx, stPts.S900.v.fx) && !eq(sD.t, base.S900.v.t) && fcD.cube.notes.some((n) => /^anchor: 1 Paar\(e\) aus swis/.test(n)),
    fcD.cube.notes.find((n) => n.startsWith('anchor: ')));
  add('J9 Wind und Böe der Station bleiben vom Temperatur-Anker unberührt (kein Wind am Eingang)', eq(stPts.S900.v.ff, base.S900.v.ff) && eq(stPts.S900.v.fx, base.S900.v.fx) && eq(stPts.S900.v.dd, base.S900.v.dd));

  const parsed = parseRoadFcFile(JSON.parse(stFiles['c/a99.json']));
  const thin = thinRun([parsed]);
  const roadWords = new RegExp(Object.values(ROAD_CLASS_LABEL).flatMap((l) => [l.label, l.short]).filter((w) => w && w.length > 3).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + '|Glätte|Glatteis|überfrier', 'i');
  const texts = [V.roadFcAnchorText(parsed.points.find((p) => p.id === 'S900'), parsed), V.roadFcAnchorText(allPts['a99@0'], { engine: all.entry.engine }), V.roadFcAnchorText(parsed.points.find((p) => p.id === 'a99@0'), parsed), V.roadFcAnchorText(stPts.S900, { engine: { ...eng, anchor: 'none' } }), V.roadFcAnchorText(null, null)];
  add('J10 Leser, Archiv und Text: die Client-Prüfung behält anc, das Archiv legt es zur Station ab, der Text nennt eigene Messung mit Uhrzeit und Versatz / Messstellen im Umkreis mit Gewicht / „ohne Messungs-Anker" — kein Wort der Fahrbahnklassen',
    parsed.dropped === 0 && eq(parsed.points.find((p) => p.id === 'S900').anc, stPts.S900.anc) && eq(thin.stations.S900.anc, stPts.S900.anc) && thin.engine.anchor === 'swis'
    && /eigenen|dieser Messstelle/.test(texts[0]) && texts[0].includes(`Messung − Modell +${(stPts.S900.anc[0] / 10).toFixed(1).replace('.', ',')} K`) && /\d{2}:\d{2}/.test(texts[0]) && /im Umkreis/.test(texts[1]) && /Gewicht \d+ %/.test(texts[1])
    && texts[2] === 'ohne Messungs-Anker' && texts[3] === 'ohne Messungs-Anker' && texts[4] === 'ohne Messungs-Anker' && texts.every((t) => !roadWords.test(t)), texts[0]);
  add('J11 Schalter des Vertrags ist einer der drei Modi und der Producer kennt ihn als Voreinstellung', ['none', 'stations', 'all'].includes(ROAD_FC_ANCHOR_MODE), ROAD_FC_ANCHOR_MODE);

  // E-AW-30 (Jan, 06.10.2026): the station points are anchored by default.
  const { ROAD_FC_ANCHOR_SOURCE_TEXT, roadFcSourceText } = await import('../src/road/roadFc.ts');
  const def = await buildRun({ dataDir: dA, outDir: join(tmp, 'out-default'), nowMs, inProcess: true });
  const defFiles = readRun(join(tmp, 'out-default'), def.run);
  const wfLines = readFileSync(join(HERE, 'road', 'workflow-road-fc.yml'), 'utf8').split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');
  add('J12 E-AW-30: Voreinstellung „stations" — ein Lauf ohne Angabe verankert die Stationspunkte (byte-gleich zum Lauf „stations"), der Workflow setzt keinen anderen Modus; ohne Messdatei bleibt der Lauf byte-gleich zum Lauf ohne Anker (C)',
    ROAD_FC_ANCHOR_MODE === 'stations' && def.entry.engine.anchored === 2 && def.entry.engine.anchorMode === 'stations' && eq(defFiles, stFiles) && !/ROAD_FC_ANCHOR\s*:/.test(wfLines),
    `${def.entry.engine.anchor} · ${def.entry.engine.anchored} Punkte`);
  const srcSt = JSON.parse(stFiles['c/a99.json']).source, srcNone = JSON.parse(runFiles['c/a99.json']).source;
  const sumSt = V.roadFcAnchorSummary(parsed), sumNone = V.roadFcAnchorSummary({ engine: { ...eng, anchor: 'none' } }), sumNull = V.roadFcAnchorSummary(null);
  add('J13 Quelle und Quellen-Reiter nennen den Anker nur, wenn der Lauf verankert hat: Quelltext + Satz zur Luftmessung der Glättemeldeanlagen (sonst der Grundtext); Zusammenfassung „verankert … von HH:MM" / „ohne Messungs-Anker" / ohne Datei keine Aussage — kein Wort der Fahrbahnklassen',
    srcSt === `${roadFcSourceText(FUSION_NAME)} ${ROAD_FC_ANCHOR_SOURCE_TEXT}` && srcNone === roadFcSourceText(FUSION_NAME) && srcNone.startsWith(`${FUSION_NAME} `) && /Glättemeldeanlagen/.test(ROAD_FC_ANCHOR_SOURCE_TEXT)
    && /verankert/.test(sumSt) && /\d{2}:\d{2}/.test(sumSt) && /ohne Anker/.test(sumSt) && /ohne Messungs-Anker/.test(sumNone) && !/verankert/.test(sumNull)
    && [sumSt, sumNone, sumNull].every((t) => !roadWords.test(t)), sumSt);
}

// --- K: repeat guard (V-AW-31) -----------------------------------------------------------------------------
{
  const T = Date.UTC(2026, 9, 4, 15, 37, 40);
  const tables = { learned: 'aaa', stack: 'bbb', clima: 'ccc' };
  const entry = (over = {}) => ({ run: roadFcStamp(T), t0Ms: roadFcT0(T), engine: { name: FUSION_NAME, version: FUSION_CURRENT, anchor: 'none', runs: { t1: '2026100412', t2: '2026100412', t3: null, stations: '2026100409', nowcast: 'radvor_rv:2610041530' }, tables, ...over } });
  const pointIndex = (over = {}) => ({ latestByTier: { t1: { run: '2026100412' }, t2: { run: '2026100412' }, t3: { run: '2026100400' }, ...over.tiers }, stations: { runs: [{ run: over.stations ?? '2026100409' }, { run: '2026100403' }] }, stationsS: { runs: [{ run: over.s ?? '2026100414' }] } });
  const v = (o = {}) => repeatVerdict({ fcIndex: { killed: false, runs: [entry(o.engine)] }, pointIndex: pointIndex(o.point), nowMs: o.now ?? T + 2 * 60_000, tables: o.tables ?? tables, anchorSlotReady: !!o.slot });
  const same = v(), sameS = v({ point: { s: '2026100415' } }), sameT3 = v({ point: { tiers: { t3: { run: '2026100412' } } } });
  add('K1 der Fall vom 04.10.: zweiter Auslöser 2 min nach dem Lauf, selbe Stunde, selbe Cube- und Stationsläufe ⇒ Wiederholung; ein neuer MOSMIX-S-Lauf und ein neuer t3-Lauf (beides keine Eingaben des letzten Laufs) ändern daran nichts',
    same.repeat === true && sameS.repeat === true && sameT3.repeat === true && /2026100412/.test(same.reason), same.reason);
  const cases = {
    stunde: v({ now: T + 23 * 60_000 }), t1: v({ point: { tiers: { t1: { run: '2026100415' } } } }), t2: v({ point: { tiers: { t2: { run: '2026100418' } } } }),
    stations: v({ point: { stations: '2026100415' } }), tabelle: v({ tables: { ...tables, stack: 'neu' } }), messung: v({ slot: true }),
    leer: repeatVerdict({ fcIndex: { runs: [] }, pointIndex: pointIndex(), nowMs: T }), aus: repeatVerdict({ fcIndex: { killed: true, runs: [entry()] }, pointIndex: pointIndex(), nowMs: T }),
    ohneIndex: repeatVerdict({ fcIndex: { runs: [entry()] }, pointIndex: null, nowMs: T }), ohneEingaben: repeatVerdict({ fcIndex: { runs: [{ run: roadFcStamp(T), t0Ms: roadFcT0(T) }] }, pointIndex: pointIndex(), nowMs: T }),
  };
  add('K2 Gegenproben, je ein neuer Lauf mit benanntem Grund: neue Stunde, neuer t1-, t2- oder Stationslauf, geänderte Tabelle, Messung der vollen Stunde jetzt da (Anker an, letzter Lauf ohne), leerer oder abgeschalteter Zeiger, point/index.json nicht lesbar, Eingaben des letzten Laufs unbekannt',
    Object.values(cases).every((c) => c.repeat === false && c.reason) && /Stunde/.test(cases.stunde.reason) && /t1 2026100412 → 2026100415/.test(cases.t1.reason) && /stations/.test(cases.stations.reason) && /Messung/.test(cases.messung.reason),
    Object.entries(cases).filter(([, c]) => c.repeat !== false).map(([k]) => k).join(',') || cases.t1.reason);
  // The product follows a new stand of buscosun Fusion by itself: a newest run built with an older stand is never a repeat.
  const older = v({ engine: { name: fusionName(FUSION_CURRENT - 1), version: FUSION_CURRENT - 1 } }), byName = v({ engine: { name: fusionName(FUSION_CURRENT - 1), version: undefined } }), nameOnly = v({ engine: { version: undefined } }), unknown = v({ engine: { name: undefined, version: undefined } });
  add('K2b Stand von buscosun Fusion: letzter Lauf mit dem Stand davor (als Nummer oder nur im Namen) ⇒ neuer Lauf, Grund nennt beide Stände; ohne Angabe ⇒ neuer Lauf; nur der Name mit dem aktuellen Stand ⇒ Wiederholung (Gegenprobe)',
    older.repeat === false && older.reason === `${fusionName(FUSION_CURRENT - 1)} → ${FUSION_NAME}` && byName.repeat === false && byName.reason === older.reason && unknown.repeat === false && /unbekannt/.test(unknown.reason) && nameOnly.repeat === true, older.reason);
  add('K3 ein Lauf, der schon mit Anker rechnete, wird durch dieselbe Messdatei nicht wiederholt', v({ engine: { anchor: 'swis' }, slot: true }).repeat === true);
  // On a checkout: the pointer files of a real directory, the hashes of its tables.
  const dir = mkdtempSync(join(tmpdir(), 'road-fc-k-'));
  const put = (f, o) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), typeof o === 'string' ? o : JSON.stringify(o)); };
  put(POINT_LEARNED_PATH, 'L'); put(POINT_STACK_PATH, 'S');
  put('point/index.json', pointIndex());
  const first = repeatVerdictOf(dir, T + 2 * 60_000, 'none');
  const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
  const real = entry(); real.engine.tables = { learned: h('L'), stack: h('S'), clima: null };
  put(`${ROAD_FC_REPO_DIR}/${ROAD_FC_INDEX_PATH}`, { schema: 1, killed: false, runs: [real] });
  const second = repeatVerdictOf(dir, T + 2 * 60_000, 'none');
  put(POINT_STACK_PATH, 'S2');
  const third = repeatVerdictOf(dir, T + 2 * 60_000, 'none');
  put(POINT_STACK_PATH, 'S'); put(`${ROAD_REPO_DIR}/obs/${roadStamp(roadFcT0(T))}.json`, { points: [] });
  const off = repeatVerdictOf(dir, T + 2 * 60_000, 'none'), on = repeatVerdictOf(dir, T + 2 * 60_000, 'stations');
  rmSync(dir, { recursive: true, force: true });
  add('K4 am Klon: ohne Zeiger kein Überspringen; mit Zeiger und gleichen Tabellen-Hashes Wiederholung; geänderte Tabellendatei ⇒ neuer Lauf; die Messdatei der Stunde zählt nur bei eingeschaltetem Anker',
    first.repeat === false && second.repeat === true && third.repeat === false && /stack/.test(third.reason) && off.repeat === true && on.repeat === false, `${first.reason} | ${second.reason} | ${third.reason}`);
  const src = readFileSync(join(HERE, 'road', 'road-forecast.mjs'), 'utf8');
  const wf = readFileSync(join(HERE, 'road', 'workflow-road-fc.yml'), 'utf8').split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');
  add('K5 Verdrahtung: der Producer fragt nur bei --publish und vor buildRun, --always / ROAD_FC_ALWAYS=1 rechnet immer; der Workflow setzt ROAD_FC_ALWAYS nur beim Start von Hand',
    /if \(flags\.publish && !flags\.always && process\.env\.ROAD_FC_ALWAYS !== '1'( && !healed\.restored\.length)?\)/.test(src) && src.indexOf('repeatVerdictOf(flags.data') < src.indexOf('await buildRun({ dataDir: flags.data') && src.indexOf('repeatVerdictOf(flags.data') > 0
    && /ROAD_FC_ALWAYS:\s*\$\{\{ github\.event_name == 'workflow_dispatch' && '1' \|\| '' \}\}/.test(wf));
}

// --- L: pointer watch (V-AW-28) and copy of the static files (V-AW-24) ---------------------------------
{
  const A = await import('./road/road-fc-archive.mjs');
  const T = Date.UTC(2026, 9, 6, 3, 25);
  const idx = (minAgo, extra = {}) => ({ schema: 1, product: 'road-fc-index', killed: false, runs: minAgo == null ? [] : [{ run: roadFcStamp(T - minAgo * 60_000), issuedAt: new Date(T - minAgo * 60_000).toISOString(), t0Ms: 0, publishedAt: new Date(T - minAgo * 60_000).toISOString() }], ...extra });
  const age = (i) => A.roadFcPointerAge(parseRoadFcIndex(i), T);
  const fresh = age(idx(70)), edge = age(idx(180)), old = age(idx(181)), killed = age(idx(400, { killed: true })), empty = age(idx(null)), none = A.roadFcPointerAge(null, T);
  add('L1 Wächter des Zeigers (V-AW-28): jüngster Lauf ≤ 3 h ⇒ grün, 3 h 1 min ⇒ rot mit Lauf und Alter; Schalter aus ⇒ grün und benannt; leerer oder fehlender Zeiger ⇒ rot — dieselbe Grenze wie „veraltet" auf der Seite',
    !fresh.stale && !edge.stale && old.stale && /181 min/.test(old.reason) && !killed.stale && killed.killed && empty.stale && none.stale && ROAD_FC_STALE_MS === 180 * 60_000, old.reason);
  // CLI of the archive job: the sibling road/fc/v1 of the store is checked without a workflow change.
  const data = join(tmp, 'arch-data'), arch = join(tmp, 'arch-out');
  const storeDir = join(data, 'road', 'v1'), fcDir = join(data, 'road', 'fc', 'v1');
  mkdirSync(join(storeDir, 'h24', 'XX'), { recursive: true }); mkdirSync(fcDir, { recursive: true }); mkdirSync(arch, { recursive: true });
  const slot = roadStamp(roadSlotOf(T - 10 * 60_000));
  writeFileSync(join(storeDir, 'h24', 'XX', `${slot}.json`), JSON.stringify({ schema: 1, product: 'road-h24', group: 'XX', slot, slots: [slot], stations: { S1: { rs: [1], ta: [2], td: [0], k: 'd' } } }));
  writeFileSync(join(storeDir, 'status.json'), JSON.stringify({ recent: [] }));
  const cli = (fcAgeMin) => {
    writeFileSync(join(fcDir, ROAD_FC_INDEX_PATH), JSON.stringify(idx(fcAgeMin)));
    try {
      const out = execFileSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--import', pathToFileURL(join(HERE, 'lib', 'register-ts.mjs')).href, join(HERE, 'road', 'road-archive.mjs'), `--store=${storeDir}`, `--archive=${join(arch, 'road', 'v1')}`, `--now=${new Date(T).toISOString()}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, out };
    } catch (e) { return { code: e.status, out: String(e.stdout) }; }
  };
  const ok = cli(65), stale = cli(240);
  add('L2 Archiv-Job (road-archive.mjs, Aufruf wie im Workflow, ohne --fc): Streckenprognose 65 min alt ⇒ Exit 0; 240 min alt ⇒ Exit 3 mit ::error:: „Streckenprognose", die Ablage ist trotzdem geschrieben',
    ok?.code === 0 && /"fc":\{"stale":false/.test(ok.out) && stale.code === 3 && /::error::Streckenprognose: jüngster Lauf \d{10} ist 240 min alt/.test(stale.out) && existsSync(join(arch, 'road', 'v1', 'index.json')),
    `${ok?.code} / ${stale.code}`);

  // Static copy: written once, unchanged ⇒ nothing, changed ⇒ rewritten; an unreadable points file is no backup.
  const src = mkData('static-src', new Map());
  const archFc = join(tmp, 'static-arch');
  const s1 = A.syncFcStatic({ fcDir: join(src, ROAD_FC_REPO_DIR), archiveDir: archFc }), s2 = A.syncFcStatic({ fcDir: join(src, ROAD_FC_REPO_DIR), archiveDir: archFc });
  const man = JSON.parse(readFileSync(join(archFc, A.ROAD_FC_ARCHIVE_STATIC_MANIFEST), 'utf8'));
  const plain = readFileSync(join(src, ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH));
  const { gunzipSync } = await import('node:zlib');
  const roundTrip = gunzipSync(readFileSync(join(archFc, `${ROAD_FC_POINTS_PATH}.gz`)));
  writeFileSync(join(src, ROAD_FC_REPO_DIR, ROAD_FC_GEO_PATH), JSON.stringify({ ...geoDoc, entries: geoDoc.entries.slice(1) }));
  const s3 = A.syncFcStatic({ fcDir: join(src, ROAD_FC_REPO_DIR), archiveDir: archFc });
  const bad = mkData('static-bad', new Map(), { schema: 1, product: 'falsch' });
  const s4 = A.syncFcStatic({ fcDir: join(bad, ROAD_FC_REPO_DIR), archiveDir: join(tmp, 'static-arch-bad') });
  add('L3 Kopie im Archiv (V-AW-24): beide Dateien als .gz + Manifest mit sha-256 der Klartextdatei, Rundweg byte-gleich; zweiter Lauf schreibt nichts; geänderte Geländedatei ⇒ nur sie neu; eine unlesbare Punktdatei wird nicht gesichert',
    eq(s1.written, [ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH]) && s2.written.length === 0 && Buffer.compare(roundTrip, plain) === 0 && man.files[ROAD_FC_POINTS_PATH].sha256 === createHash('sha256').update(plain).digest('hex')
    && eq(s3.written, [ROAD_FC_GEO_PATH]) && eq(s4.written, [ROAD_FC_GEO_PATH]) && eq(s4.missing, [ROAD_FC_POINTS_PATH]), JSON.stringify(s1));

  // Restore: the archive dir served as "raw" (bytes or null), tampered copy refused.
  const served = (dir, tamper = null) => async (url) => { const rel = url.replace(/^.*?road\/fc\/v1\//, ''); const f = join(dir, rel); if (!existsSync(f)) return null; const b = readFileSync(f); return tamper && rel === tamper ? gzipBroken(b) : new Uint8Array(b); };
  const { gzipSync } = await import('node:zlib');
  const gzipBroken = () => new Uint8Array(gzipSync(Buffer.from('{"verändert":true}')));
  const lost = mkData('static-lost', new Map());
  const lostFc = join(lost, ROAD_FC_REPO_DIR);
  rmSync(join(lostFc, ROAD_FC_POINTS_PATH)); rmSync(join(lostFc, ROAD_FC_GEO_PATH));
  let calls = 0;
  const fetchCount = (f) => async (u) => { calls++; return f(u); };
  const back = await A.restoreFcStatic(lostFc, { fetchBytes: fetchCount(served(archFc)) });
  const pointsBack = readFileSync(join(lostFc, ROAD_FC_POINTS_PATH));
  const callsAfter = calls;
  const again = await A.restoreFcStatic(lostFc, { fetchBytes: fetchCount(served(archFc)) });
  const lost2 = mkData('static-lost2', new Map()); rmSync(join(lost2, ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH));
  const tampered = await A.restoreFcStatic(join(lost2, ROAD_FC_REPO_DIR), { fetchBytes: served(archFc, `${ROAD_FC_POINTS_PATH}.gz`) });
  const noArchive = await A.restoreFcStatic(join(lost2, ROAD_FC_REPO_DIR), { fetchBytes: async () => null });
  add('L4 Rückholung im Producer: fehlen beide Dateien, kommen sie aus dem Archiv (Prüfsumme gegen das Manifest), die Punktdatei ist byte-gleich zur Quelle; nichts fehlt ⇒ kein Abruf; veränderte Kopie ⇒ abgelehnt, Datei bleibt weg; kein Archiv ⇒ benannt, kein Absturz',
    eq(back.restored.map((r) => r.rel), [ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH]) && Buffer.compare(pointsBack, plain) === 0 && callsAfter === 3 && again.restored.length === 0 && calls === callsAfter
    && tampered.restored.length === 0 && /Prüfsumme/.test(tampered.failed[0]?.reason) && !existsSync(join(lost2, ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH)) && /Manifest/.test(noArchive.failed[0]?.reason),
    JSON.stringify(tampered.failed));
  // A restored file rides along with the next push and heals the data repo; if the remote got it back meanwhile, no clash.
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const bare = join(tmp, 'heal.git'), url = pathToFileURL(bare).href;
  mkdirSync(bare); git(bare, 'init', '--quiet', '--bare', '--initial-branch=main');
  const clone = (name) => { const d = join(tmp, name); git(tmp, '-c', 'core.autocrlf=false', 'clone', '--quiet', url, name); git(d, 'config', 'user.name', 't'); git(d, 'config', 'user.email', 't@t'); git(d, 'config', 'core.autocrlf', 'false'); return d; };
  const seed = clone('heal-seed');
  writeTree(seed, new Map([[`${ROAD_REPO_DIR}/status.json`, Buffer.from('{}\n')]]));
  git(seed, 'add', '-A'); git(seed, 'commit', '--quiet', '-m', 'seed'); git(seed, 'push', '--quiet', 'origin', 'HEAD:main');
  // Two jobs both started without the static files; the first heals the repo, the second must not clash with it.
  const work = clone('heal-work'), work2 = clone('heal-work2');
  const healed = await A.restoreFcStatic(join(work, ROAD_FC_REPO_DIR), { fetchBytes: served(archFc) });
  const healed2 = await A.restoreFcStatic(join(work2, ROAD_FC_REPO_DIR), { fetchBytes: served(archFc) });
  const runDir = join(tmp, 'heal-run', '2610060312'); mkdirSync(join(runDir, 'c'), { recursive: true }); writeFileSync(join(runDir, 'c', 'a1.json'), '{}\n');
  const entry = { run: '2610060312', issuedAt: new Date(T).toISOString(), t0Ms: roadFcT0(T), publishedAt: new Date(T).toISOString(), points: 1, failed: 0, corridors: 1, states: 0, engine: {}, ms: 1 };
  publishRun({ repoDir: work, runDir, entry, nowMs: () => T, heal: healed.restored });
  git(seed, 'fetch', '--quiet', 'origin', 'main');
  const remoteHas = git(seed, 'show', `origin/main:${ROAD_FC_REPO_DIR}/${ROAD_FC_POINTS_PATH}`) === plain.toString('utf8').trim();
  const touched = git(seed, 'diff', '--name-only', 'origin/main~1', 'origin/main').split('\n');
  const runDir2 = join(tmp, 'heal-run', '2610060412'); mkdirSync(join(runDir2, 'c'), { recursive: true }); writeFileSync(join(runDir2, 'c', 'a1.json'), '{}\n');
  let clash = null;
  try { publishRun({ repoDir: work2, runDir: runDir2, entry: { ...entry, run: '2610060412' }, nowMs: () => T + H, heal: healed2.restored }); } catch (e) { clash = e; }
  git(seed, 'fetch', '--quiet', 'origin', 'main');
  const still = git(seed, 'show', `origin/main:${ROAD_FC_REPO_DIR}/${ROAD_FC_POINTS_PATH}`) === plain.toString('utf8').trim();
  add('L5 Heilung: die zurückgeholten Dateien gehen mit dem nächsten Push ins Daten-Repo (Commit nur unter road/fc/v1); ein zweiter Job, der sie ebenfalls zurückgeholt hatte, pusht danach ohne Konflikt mit den nun verfolgten Dateien',
    remoteHas && touched.every((f) => f.startsWith(`${ROAD_FC_REPO_DIR}/`)) && touched.includes(`${ROAD_FC_REPO_DIR}/${ROAD_FC_GEO_PATH}`) && clash === null && still && healed2.restored.length === 2,
    clash ? String(clash.message).split('\n')[0] : touched.join(' '));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nverify:road-fc — ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
