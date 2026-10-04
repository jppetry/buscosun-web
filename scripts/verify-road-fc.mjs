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
import { encodePng, decodePng, toRgba } from './lib/png.mjs';
import { FIX, buildCubeFixture } from './lib/pvCubeFixtures.mjs';
import { installNodeShims } from './punktarchiv/lib/nodeShims.mjs';
import {
  ROAD_FC_REPO_DIR, ROAD_FC_INDEX_PATH, ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH, ROAD_FC_STEPS, ROAD_FC_HOURS, ROAD_FC_VAR_IDS, ROAD_FC_VARS, ROAD_FC_RANGE,
  ROAD_FC_SPACING_KM, ROAD_FC_SNAP_MAX_M, ROAD_FC_CRON, ROAD_FC_RETENTION, ROAD_FC_PUBLISH_GATE_MS, ROAD_FC_STALE_MS, ROAD_FC_DEAD_MS, ROAD_FC_MAX_FAILED_SHARE,
  ROAD_FC_CDN_BASE, ROAD_FC_RAW_BASE, ROAD_FC_ORIGIN, ROAD_FC_INTERPOLATED,
  roadFcStamp, roadFcStampToMs, roadFcT0, roadFcEncode, roadFcDecode, roadFcOriginCode, roadFcSeriesProblems, roadFcPointUsable, parseRoadFcFile,
  parseRoadFcIndex, roadFcPickRun, roadFcPrune, roadFcFreshness, roadFcAxisKms, roadFcAxisId, roadPointAtKm, roadLineKm, roadKmBetween,
  roadFcCorridorPath, roadFcStatePath, parseRoadFcPoints,
} from '../src/road/roadFc.ts';
import { ROAD_REPO_DIR } from '../src/road/roadContract.ts';
import { buildOsmIndex, nearestCarriageway, axisPointsOf, stationPointsOf, buildPoints, buildGeo, footOnSegment, refsOf } from './road/build-fc-points.mjs';
import { dirStore, geoBackend, makeIo, buildRun, publishVerdict, publishRun, nextIndex, seriesOf } from './road/road-forecast.mjs';
import { memoryStore } from '../src/point/client/store.ts';
import { POINT_LEARNED_PATH, POINT_STACK_PATH } from '../src/point/cubeFormat.ts';
import { getPointForecastFromCube, clearCubeForecastCache, FUSION8_NOWCAST_HOUR_MEAN } from '../src/pointForecast/cubeSource.ts';
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
  add('C2 jede Datei besteht die Client-Prüfung ohne Verlust; Kopf: Lauf, t0 = volle Stunde, 49 Schritte, Motor „buscosun Fusion 8", Stufe fs, anchor none, Cube-Läufe und Tabellen-Hashes genannt',
    [cor, st].every((d) => { const p = parseRoadFcFile(d); return p && p.dropped === 0 && p.points.length === d.points.length; }) && cor.run === roadFcStamp(nowMs) && cor.t0Ms === roadFcT0(nowMs) && cor.steps === ROAD_FC_STEPS
    && cor.engine.name === 'buscosun Fusion 8' && cor.engine.stage === 'fs' && cor.engine.anchor === 'none' && cor.engine.hourMean === FUSION8_NOWCAST_HOUR_MEAN && cor.engine.runs.t1 === FIX.runs.t1 && cor.engine.runs.t2 === FIX.runs.t2
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
  const sparse = /sparse-checkout:\s*\|\n((?:\s{12}\S.*\n)+)/.exec(code)?.[1].trim().split(/\s+/) ?? [];
  add('E3 Checkout des Daten-Repos: sparse mit point (Cube, MOSMIX, Tabellen), radar/img (Stundenmittel), road (Punkte, Zeiger); ohne Blobs der übrigen Pfade',
    eq(sparse, ['point', 'radar/img', 'road']) && /filter:\s*blob:none/.test(code) && /fetch-depth:\s*1/.test(code), sparse.join(' '));
  add('E4 Aufruf: --data = Checkout, --publish; Schalter ROAD_FC aus der Repo-Variable; Punktdatei wird vor dem Lauf verlangt',
    /road-forecast\.mjs --data="\$GITHUB_WORKSPACE" --publish/.test(code) && /ROAD_FC:\s*\$\{\{ vars\.ROAD_FC \}\}/.test(code) && code.includes(`${ROAD_FC_REPO_DIR}/${ROAD_FC_POINTS_PATH}`));
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
    && ROAD_FC_ARCHIVE_VARS.every((k) => eq(doc.stations.S900.v[k], src.v[k].slice(0, ROAD_FC_ARCHIVE_STEPS))) && doc.engine.name === 'buscosun Fusion 8' && doc.stations.S900.at === 'a99' && doc.stations.S901.at === null
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
const failed = results.filter((r) => !r.ok).length;
console.log(`\nverify:road-fc — ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
