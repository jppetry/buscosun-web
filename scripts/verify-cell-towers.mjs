/**
 * verify-cell-towers.mjs — Phase ZT (`audit/zelltuerme-3d.md`): 3D stage "Zelltürme auf Gelände" in the Regenradar.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-cell-towers.mjs
 *
 * A Heights: above ground = MSL − DEM at the ring vertex mean (the point MapLibre lifts the extrusion to), base below the
 *   ground clamped and flagged (Alps fixture cell 12: 1 609 m MSL under 2 990 m), extrusion = AGL × 1,3 (E-ZT-1),
 *   ground unknown ⇒ 0 and flagged; vertex mean skips the closing duplicate (MapLibre `accumulatePointsToCentroid`).
 * B Hail core (E-ZT-3): only with hail; area factor √(hail/cell), ≤ 0,92 (inside the walls); fallback scale when the area
 *   is missing; same vertex mean as the tower (same ground); core features come BEFORE towers (layer below).
 * C Colours: dBZ scale lower bounds, unknown grey; every fixture tower gets a colour of the scale.
 * D Trend (E-ZT-4): grows / weakens / steady / new / unknown from two runs; an id reused with another first detection is
 *   not the same cell; per-5-min normalisation; contradicting signals ⇒ steady.
 * E Slots (ZT-g): future/now ⇒ newest slot, past ⇒ 5-min floor, older than the window ⇒ too-old; a missing past slot is
 *   null (no fallback); a missing newest slot steps back once; the comparison run is the slot 5 min earlier.
 * F Radar picture (E-ZT-6): LUTs = the shader ramps (byte 0 transparent, top colours), rows in Mercator, a DE pixel is
 *   exactly LUT[value at `sampleRadarIndex`], a country without a frame stays transparent (Gegenprobe with frame).
 * G Flag and wiring: on by default (Jan 09.10.), `?z3d=0` = before; the deck reads it and loads the stage lazily; NowcastRadarMap and MapView only additive
 *   (ZT lines stripped ⇒ no HEAD line removed by ZT, Gegenprobe); no custom layer / no shader in the stage; tower source
 *   `maxzoom: 7`; core layer added before the tower layer; buscosun Fusion and the 2D cell modules unchanged.
 */
process.env.TZ = 'Europe/Berlin';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseKonrad3d } from '../src/radar/konrad3d.ts';
import {
  buildTowerFeatures, towerHeights, ringVertexMean, closedRing, hailCoreScale, hasHail, dbzColor,
  DBZ_COLOR_STOPS, DBZ_UNKNOWN_COLOR, TOWER_EXAGGERATION, HAIL_CORE_FALLBACK_SCALE,
} from '../src/nowcast/cellTowers/towerModel.ts';
import { cellTrend, matchPrevious, TREND_LABEL } from '../src/nowcast/cellTowers/towerTrend.ts';
import { konradSlotFor, loadTowerRuns, newestKonradSlot, KONRAD_LOOKBACK_MS, _clearKonradSlotCache } from '../src/nowcast/cellTowers/konradAt.ts';
import { linearLut, logLut, drapeRows, rowLat, drapeCorners } from '../src/nowcast/cellTowers/radarDrape.ts';
import { towers3dEnabledFrom, view3dFrom } from '../src/nowcast/cellTowers/towerFlag.ts';
import { sampleRadarIndex } from '../src/pointForecast/radarSample.ts';
import { DE1200_CORNERS } from '../src/sources/radolanGeo.ts';
import { precipToU8Log } from '../src/scalar/RainLayer.ts';
import { konradStamp } from '../src/sources/dwdKonrad3d.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const results = [];
const add = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const fx = (f) => parseKonrad3d(read(`scripts/fixtures/${f}`), f);
const runAlps = fx('konrad3d-sample.xml');
const runOct7 = fx('konrad3d-20261007T184500.xml');
const runOct8 = fx('konrad3d-20261008T143000.xml');

// ---------------------------------------------------------------------------- A
{
  const ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  const m = ringVertexMean(ring);
  add('A1 vertex mean skips the closing duplicate (MapLibre centroid rule)', m && near(m[0], 1) && near(m[1], 1), JSON.stringify(m));
  const m2 = ringVertexMean([[0, 0], [2, 0], [2, 2], [0, 2]]);
  add('A1b open ring gives the same mean', m2 && near(m2[0], 1) && near(m2[1], 1));
  add('A1c Gegenprobe: counting the duplicate would move the mean', !near((0 + 2 + 2 + 0 + 0) / 5, 1));

  const c12 = runAlps.cells.find((c) => c.id === 12);
  const h12 = c12 && towerHeights(c12, 2990);
  add('A2 Alps cell 12: base 1 609 m MSL under 2 990 m ground ⇒ base 0 above ground, flagged',
    h12 && h12.baseBelowGround && h12.baseAglM === 0 && h12.baseMslM === 1609, JSON.stringify(h12));
  add('A3 top above ground = 8 670 − 2 990 = 5 680 m', h12 && h12.topAglM === 8670 - 2990);
  const hNull = c12 && towerHeights(c12, null);
  add('A4 ground unknown ⇒ reference 0 (MSL values), groundM null', hNull && hNull.groundM === null && hNull.topAglM === 8670 && !hNull.baseBelowGround);

  const ground = 300;
  const b = buildTowerFeatures(runOct7, () => ground);
  const towers = b.fc.features.filter((f) => f.properties.kind === 'tower');
  const okScale = towers.every((f) => {
    const cell = runOct7.cells.find((c) => c.id === f.properties.id);
    return near(f.properties.height, (cell.echoTopM - ground) * TOWER_EXAGGERATION, 1e-6)
      && near(f.properties.base, Math.max(0, cell.echoBottomM - ground) * TOWER_EXAGGERATION, 1e-6);
  });
  add('A5 extrusion base/height = AGL × 1,3 for every tower of 07.10.', towers.length === runOct7.cells.length && okScale, `${towers.length}/${runOct7.cells.length}`);
  add('A6 Gegenprobe: unexaggerated values would differ', towers.some((f) => !near(f.properties.height, f.properties.height / TOWER_EXAGGERATION)));
  const sampled = [];
  buildTowerFeatures(runOct8, (lon, lat) => { sampled.push([lon, lat]); return 500; });
  const means = runOct8.cells.map((c) => ringVertexMean(closedRing(c.hull)));
  add('A7 the DEM is sampled exactly at each ring vertex mean', sampled.length === means.length && sampled.every((p, i) => near(p[0], means[i][0]) && near(p[1], means[i][1])));
  const topBelow = buildTowerFeatures({ ...runOct8, cells: runOct8.cells.slice(0, 1) }, () => 99999);
  add('A8 top below ground ⇒ no tower, counted as skipped (nothing dropped silently)', topBelow.fc.features.length === 0 && topBelow.skipped[0]?.reason === 'top-below-ground');
}

// ---------------------------------------------------------------------------- B
{
  const c12 = runAlps.cells.find((c) => c.id === 12);
  add('B1 Alps cell 12 carries hail (flag/area)', c12 && hasHail(c12), `flag ${c12?.hailFlag} area ${c12?.hailAreaKm2}`);
  const b = buildTowerFeatures(runAlps, () => 1000);
  const cores = b.fc.features.filter((f) => f.properties.kind === 'core');
  const hailIds = runAlps.cells.filter(hasHail).map((c) => c.id);
  add('B2 one core per hail cell, none otherwise', cores.length === hailIds.length && cores.every((f) => hailIds.includes(f.properties.id)), `${cores.length} cores, hail ${hailIds}`);
  const s = hailCoreScale(c12);
  add('B3 core scale = √(hail area / cell area), ≤ 0,92', s.areaKnown && near(s.scale, Math.min(0.92, Math.sqrt(Math.min(1, c12.hailAreaKm2 / c12.areaKm2)))) && s.scale <= 0.92, JSON.stringify(s));
  const core = cores.find((f) => f.properties.id === 12);
  const tower = b.fc.features.find((f) => f.properties.kind === 'tower' && f.properties.id === 12);
  const mc = ringVertexMean(core.geometry.coordinates[0]), mt = ringVertexMean(tower.geometry.coordinates[0]);
  add('B4 core and tower share the vertex mean (same ground under both)', near(mc[0], mt[0], 1e-9) && near(mc[1], mt[1], 1e-9));
  add('B5 core top = hail echo top AGL × 1,3, below/at the tower top', near(core.properties.height, Math.min(c12.hailEchoTopM - 1000, c12.echoTopM - 1000) * TOWER_EXAGGERATION) && core.properties.height <= tower.properties.height);
  const firstTower = b.fc.features.findIndex((f) => f.properties.kind === 'tower');
  const lastCore = b.fc.features.map((f) => f.properties.kind).lastIndexOf('core');
  add('B6 cores precede towers in the collection', lastCore < firstTower);
  const flagOnly = { ...c12, hailAreaKm2: null, hailFlag: 1 };
  add('B7 flag without area ⇒ fallback scale, marked areaKnown false', hailCoreScale(flagOnly).scale === HAIL_CORE_FALLBACK_SCALE && !hailCoreScale(flagOnly).areaKnown);
  const noHail = buildTowerFeatures(runOct7, () => 0).fc.features.filter((f) => f.properties.kind === 'core');
  add('B8 07.10. (no hail in the run) ⇒ no core', noHail.length === 0 && !runOct7.cells.some(hasHail));
}

// ---------------------------------------------------------------------------- C
{
  add('C1 dBZ scale: 44,9 / 45 / 52 / 55 / 60', dbzColor(44.9) === DBZ_COLOR_STOPS[0].color && dbzColor(45) === DBZ_COLOR_STOPS[1].color
    && dbzColor(52) === DBZ_COLOR_STOPS[2].color && dbzColor(55) === DBZ_COLOR_STOPS[3].color && dbzColor(60) === DBZ_COLOR_STOPS[3].color);
  add('C2 no dBZ ⇒ grey', dbzColor(null) === DBZ_UNKNOWN_COLOR && dbzColor(NaN) === DBZ_UNKNOWN_COLOR);
  const cols = new Set(DBZ_COLOR_STOPS.map((s) => s.color));
  const all = [runOct7, runOct8, runAlps].flatMap((r) => buildTowerFeatures(r, () => 0).fc.features.filter((f) => f.properties.kind === 'tower'));
  add('C3 every fixture tower gets a colour of the scale', all.length > 0 && all.every((f) => cols.has(f.properties.color)), `${all.length} towers`);
}

// ---------------------------------------------------------------------------- D
{
  const cur = runOct7;
  const c = cur.cells[0];
  const mk = (patch, refShift = 5 * 60_000) => ({ refMs: cur.refMs - refShift, file: 'prev', cells: [{ ...c, ...patch }] });
  add('D1 echo top +400 m in 5 min ⇒ grows', cellTrend(c, cur.refMs, mk({ echoTopM: c.echoTopM - 400 })).trend === 'grows');
  add('D2 echo top −400 m ⇒ weakens', cellTrend(c, cur.refMs, mk({ echoTopM: c.echoTopM + 400 })).trend === 'weakens');
  add('D3 small change ⇒ steady', cellTrend(c, cur.refMs, mk({ echoTopM: c.echoTopM - 100, vil: c.vil })).trend === 'steady');
  add('D4 top up, VIL down ⇒ steady (no clear signal)', cellTrend(c, cur.refMs, mk({ echoTopM: c.echoTopM - 400, vil: (c.vil ?? 0) + 3 })).trend === 'steady');
  const t10 = cellTrend(c, cur.refMs, mk({ echoTopM: c.echoTopM - 400 }, 10 * 60_000));
  add('D5 per-5-min normalisation: +400 m in 10 min = +200 ⇒ steady', t10.trend === 'steady' && near(t10.dTopM, 200));
  const other = { refMs: cur.refMs - 300_000, file: 'p', cells: [{ ...c, firstDetectedMs: (c.firstDetectedMs ?? 0) - 3600_000 }] };
  add('D6 same id, other first detection ⇒ not matched', matchPrevious(c, other) === null);
  const fresh = { ...c, firstDetectedMs: cur.refMs - 60_000 };
  add('D7 not in the previous run and detected after it ⇒ new', cellTrend(fresh, cur.refMs, { refMs: cur.refMs - 300_000, file: 'p', cells: [] }).trend === 'new');
  add('D8 no comparison run ⇒ unknown; gap > 10 min ⇒ unknown', cellTrend(c, cur.refMs, null).trend === 'unknown' && cellTrend(c, cur.refMs, mk({}, 15 * 60_000)).trend === 'unknown');
  add('D9 words', TREND_LABEL.grows === 'wächst' && TREND_LABEL.steady === 'gleichbleibend' && TREND_LABEL.weakens === 'schwächt ab');
}

// ---------------------------------------------------------------------------- E
{
  const now = Date.UTC(2026, 9, 9, 14, 7, 30);
  const newest = newestKonradSlot(now);
  add('E1 newest slot = floor((now − 5:30) / 5 min)', newest === Date.UTC(2026, 9, 9, 14, 0));
  const fut = konradSlotFor(now + 40 * 60_000, now);
  add('E2 future time ⇒ newest slot, marked future', fut.kind === 'slot' && fut.slotMs === newest && fut.future);
  const past = konradSlotFor(Date.UTC(2026, 9, 9, 13, 22, 10), now);
  add('E3 past time ⇒ 5-min floor', past.kind === 'slot' && past.slotMs === Date.UTC(2026, 9, 9, 13, 20) && !past.future);
  const old = konradSlotFor(newest - KONRAD_LOOKBACK_MS - 300_000, now);
  add('E4 older than the mirror window (≈ 115 min) ⇒ too-old', old.kind === 'too-old' && KONRAD_LOOKBACK_MS === 115 * 60_000);
  const env = (slotMs) => ({ schema: 1, run: { refMs: slotMs, file: `KONRAD3D_${konradStamp(new Date(slotMs))}.xml`, cells: [] } });
  const mockFetch = (have) => async (url) => {
    const m = String(url).match(/konrad3d\/(\d{8}T\d{6})\/cells\.json$/);
    const hit = m && have.find((ms) => konradStamp(new Date(ms)) === m[1]);
    return hit ? { ok: true, json: async () => env(hit) } : { ok: false, json: async () => null };
  };
  _clearKonradSlotCache();
  const r1 = await loadTowerRuns(now, now, mockFetch([newest - 300_000, newest - 600_000]));
  add('E5 newest slot missing ⇒ one step back, comparison run 5 min before that', r1.run?.refMs === newest - 300_000 && r1.prev?.refMs === newest - 600_000 && r1.pick.slotMs === newest - 300_000);
  _clearKonradSlotCache();
  const r2 = await loadTowerRuns(Date.UTC(2026, 9, 9, 13, 22), now, mockFetch([Date.UTC(2026, 9, 9, 13, 15)]));
  add('E6 missing past slot ⇒ null, no fallback to another run', r2.run === null);
  _clearKonradSlotCache();
  const r3 = await loadTowerRuns(Date.UTC(2026, 9, 9, 13, 22), now, mockFetch([Date.UTC(2026, 9, 9, 13, 20), Date.UTC(2026, 9, 9, 13, 15)]));
  add('E7 past slot found with its comparison run', r3.run?.refMs === Date.UTC(2026, 9, 9, 13, 20) && r3.prev?.refMs === Date.UTC(2026, 9, 9, 13, 15));
  _clearKonradSlotCache();
}

// ---------------------------------------------------------------------------- F
{
  const lin = linearLut(), log = logLut();
  add('F1 byte 0 transparent in both LUTs', lin[3] === 0 && log[3] === 0);
  add('F2 linear LUT top = rgba(150,40,140,0.9) (precipRainRamp 1.0)', lin[255 * 4] === 150 && lin[255 * 4 + 1] === 40 && lin[255 * 4 + 2] === 140 && lin[255 * 4 + 3] === Math.round(0.9 * 255));
  const u20 = precipToU8Log(20);
  add('F3 log LUT at 20 mm/h = rgba(150,40,140,0.9) (precipRainRampLog 20)', log[u20 * 4] === 150 && log[u20 * 4 + 1] === 40 && log[u20 * 4 + 2] === 140, `u=${u20}`);
  add('F3b log LUT at 0,06 mm/h has α 0,42 (first visible stop)', Math.abs(log[precipToU8Log(0.06) * 4 + 3] - Math.round(0.42 * 255)) <= 1);
  const box = { west: 6, south: 45, east: 16, north: 55 };
  const yMerc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const h = 200;
  const dy = [0, 1, 2].map((j) => yMerc(rowLat(box, h, j)) - yMerc(rowLat(box, h, j + 1)));
  add('F4 rows evenly spaced in Mercator (not in latitude)', near(dy[0], dy[1], 1e-9) && near(dy[1], dy[2], 1e-9) && !near(rowLat(box, h, 0) - rowLat(box, h, 1), rowLat(box, h, h - 2) - rowLat(box, h, h - 1), 1e-6));
  const W = 1100, H = 1200;
  const values = new Uint8Array(W * H);
  let seed = 7; for (let i = 0; i < values.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; values[i] = seed >>> 24; }
  const pick = { timeMs: 0, DE: { values, width: W, height: H, corners: DE1200_CORNERS }, AT: null, CH: null };
  const w = 120, hh = 120;
  const rgba = new Uint8ClampedArray(w * hh * 4);
  drapeRows(pick, box, w, hh, rgba, 0, hh);
  // Pixel nearest to München and to Wien.
  const px = (lat, lon) => {
    const i = Math.floor(((lon - box.west) / (box.east - box.west)) * w);
    let j = 0, best = Infinity;
    for (let k = 0; k < hh; k++) { const d = Math.abs(rowLat(box, hh, k) - lat); if (d < best) { best = d; j = k; } }
    return { i, j, lat: rowLat(box, hh, j), lon: box.west + ((box.east - box.west) * (i + 0.5)) / w };
  };
  const mu = px(48.14, 11.58);
  const idx = sampleRadarIndex('radolan_rv', W, H, DE1200_CORNERS, mu.lat, mu.lon);
  const o = (mu.j * w + mu.i) * 4, u = values[idx];
  add('F5 München pixel = linear LUT at the value `sampleRadarIndex` reads', idx != null && rgba[o] === lin[u * 4] && rgba[o + 1] === lin[u * 4 + 1] && rgba[o + 2] === lin[u * 4 + 2] && rgba[o + 3] === lin[u * 4 + 3], `u=${u}`);
  const wi = px(48.21, 16.37 > box.east ? 15.9 : 16.37);
  const ow = (wi.j * w + Math.min(w - 1, wi.i)) * 4;
  add('F6 Austria without a frame stays transparent (like its HD layer)', rgba[ow + 3] === 0);
  const pick2 = { ...pick, AT: { values: new Uint8Array(W * H).fill(200), width: W, height: H, corners: DE1200_CORNERS } };
  const rgba2 = new Uint8ClampedArray(w * hh * 4);
  drapeRows(pick2, box, w, hh, rgba2, 0, hh);
  let atPainted = 0;
  for (let p = 3; p < rgba2.length; p += 4) if (rgba2[p] > 0 && rgba[p] === 0) atPainted++;
  add('F6b Gegenprobe: with an AT frame pixels in Austria get colour', atPainted > 0, `${atPainted} px`);
  const c = drapeCorners(box);
  add('F7 image corners TL, TR, BR, BL', c[0][0] === 6 && c[0][1] === 55 && c[2][0] === 16 && c[2][1] === 45);
}

// ---------------------------------------------------------------------------- G
{
  add('G1 on by default (missing, 1, other) — `?z3d=0`/false/off = the Regenradar before ZT', towers3dEnabledFrom('') && towers3dEnabledFrom('?z3d=1') && towers3dEnabledFrom('?a=1&z3d=on') && towers3dEnabledFrom('?z3d=2')
    && !towers3dEnabledFrom('?z3d=0') && !towers3dEnabledFrom('?a=1&z3d=false') && !towers3dEnabledFrom('?z3d=off'));
  add('G2 `?ansicht3d=` views, unknown ⇒ map', view3dFrom('?ansicht3d=split') === 'split' && view3dFrom('?ansicht3d=3d') === '3d' && view3dFrom('?ansicht3d=x') === 'map' && view3dFrom('') === 'map');
  const deck = read('src/nowcast/NowcastDeck.tsx');
  add('G3 deck: stage lazy (no static import of TowerStage), flag read, props only with the flag',
    /lazy\(\(\) => import\('\.\/cellTowers\/TowerStage'\)\)/.test(deck) && !/^import TowerStage/m.test(deck)
    && /const z3dOn = useMemo\(\(\) => towers3dEnabledFrom\(/.test(deck) && /const ztMapProps = z3dOn \?/.test(deck) && /\{\.\.\.ztMapProps\}/.test(deck));
  add('G3b deck: topbar switch, slim dock and tab "3D" only with the flag', /\{z3dOn && \(\s*<div className="zt-viewseg"/.test(deck) && /if \(!z3dOn\) return dock;/.test(deck) && /with3d=\{z3dOn\}/.test(deck));
  const stage = read('src/nowcast/cellTowers/TowerStage.tsx');
  add('G4 stage: no custom layer, no shader source (built-in 3D only)', !/type:\s*'custom'/.test(stage) && !/renderingMode/.test(stage) && !/gl_Position|precision highp/.test(stage));
  add('G5 tower source `maxzoom: 7` (no tile seam, spike)', /addSource\(SRC_TOWERS, \{ type: 'geojson', data: emptyFc\(\), maxzoom: 7 \}\)/.test(stage));
  const iCore = stage.indexOf("id: 'zt-tower-core'"), iTower = stage.indexOf("id: 'zt-tower', type: 'fill-extrusion'");
  add('G6 core layer added before (= below) the tower layer', iCore > 0 && iTower > iCore);
  add('G7 terrain exaggeration of the stage = tower factor', /setTerrain\(\{ source: DEM_SRC, exaggeration: TOWER_EXAGGERATION \}\)/.test(stage));

  // G8: NowcastRadarMap and MapView only additive — strip the ZT lines; ZT must not have removed a HEAD line.
  const lf = (t) => t.replace(/\r\n/g, '\n');
  const tmp = mkdtempSync(join(tmpdir(), 'zt-'));
  const diffCounts = (a, b) => {
    writeFileSync(join(tmp, 'a'), a); writeFileSync(join(tmp, 'b'), b);
    let out = '';
    try { out = execFileSync('git', ['-c', 'core.autocrlf=false', 'diff', '--no-index', '-U0', join(tmp, 'a'), join(tmp, 'b')], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = String(e.stdout ?? ''); }
    const lines = out.split('\n');
    return { minus: lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length, plus: lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)) };
  };
  const ztMark = /Phase ZT|ProfileRadarPick|radarPickCbRef|lastRadarPick|hasRadarPickCb|onProfileRadarPick|stageAside|stage3d|zt-has-aside|zt-aside/;
  const stripZtMapView = (t) => t
    .replace(/\n  \/\*\* Phase ZT \(`audit\/zelltuerme-3d\.md`[^\n]*\n[^\n]*\n  onProfileRadarPick\?: \(pick: ProfileRadarPick\) => void;\n\}\n\n\/\*\* Phase ZT: HD frames[^\n]*\nexport interface ProfileRadarPick \{\n(?:  [^\n]*\n){4}\}\n/, '\n}\n')
    .replace(/\n  onProfileRadarPick,\n\}: Props\) \{\n  \/\/ Phase ZT: last reported[^\n]*\n(?:  [^\n]*\n){6}/, '\n}: Props) {\n')
    .replace(/        \/\/ Phase ZT: report the frames[^\n]*\n        if \(radarPickCbRef\.current\) \{\n(?:          [^\n]*\n|            [^\n]*\n|              [^\n]*\n)*?        \}\n/, '');
  const stripZtRadarMap = (t) => t
    .replace(", type ReactNode } from 'react';\nimport type { ProfileRadarPick } from '../MapView';", " } from 'react';")
    .replace(/\n  \/\*\* Phase ZT \([^\n]*\n[^\n]*\n  stageAside\?: ReactNode;\n  stage3d\?: 'split' \| '3d';\n  \/\*\* Phase ZT: HD frames[^\n]*\n  onProfileRadarPick\?: \(pick: ProfileRadarPick\) => void;/, '')
    .replace(', stageAside, stage3d, onProfileRadarPick }: Props)', ' }: Props)')
    .replace('<div className={`rt-card nc-radar${stageAside ? ` zt-has-aside zt-mode-${stage3d ?? \'split\'}` : \'\'}`}>', '<div className="rt-card nc-radar">')
    .replace(/\n              \{\.\.\.\(onProfileRadarPick \? \{ onProfileRadarPick \} : \{\}\)\}\n              \{\.\.\.\(stageAside && stage3d === '3d' \? \{ suspended: true \} : \{\}\)\}/, '')
    .replace(/      \{\/\* Phase ZT: 3D stage beside the map[^\n]*\n      \{stageAside && <div className="zt-aside">\{stageAside\}<\/div>\}\n\n/, '');
  // HEAD lines right next to a ZT block — the Gegenprobe changes one character there.
  const anchors = { 'src/MapView.tsx': '  suspended = false, onOpenDashboard,\n', 'src/nowcast/NowcastRadarMap.tsx': '      {/* Zeitachse (Scrubber) · Punkt-Streifen · Datenqualität.\n' };
  for (const [p, strip, label] of [['src/MapView.tsx', stripZtMapView, 'G8'], ['src/nowcast/NowcastRadarMap.tsx', stripZtRadarMap, 'G9']]) {
    const head = lf(execFileSync('git', ['show', `HEAD:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }));
    const cur = lf(read(p));
    const stripped = strip(cur);
    const dCur = diffCounts(head, cur), dStr = diffCounts(head, stripped);
    // A HEAD line that ZT extended counts as "removed" in the diff of the current file; stripping ZT restores it. So: after
    // stripping no ZT line is left and no more HEAD lines are missing than before (the rest are other phases' lines).
    add(`${label} ${p}: ZT lines stripped ⇒ no ZT line left, no HEAD line lost through ZT (others' uncommitted lines allowed)`,
      stripped !== cur && !dStr.plus.some((l) => ztMark.test(l)) && dStr.minus <= dCur.minus,
      `ZT lines ${dCur.plus.length - dStr.plus.length}, HEAD lines restored by stripping ${dCur.minus - dStr.minus}, HEAD lines changed by others ${dStr.minus}`);
    const a = anchors[p];
    const tampered = cur.includes(a) ? strip(cur.replace(a, a.replace('\n', ' \n'))) : null;
    const dT = tampered ? diffCounts(head, tampered) : null;
    add(`${label}b Gegenprobe: one foreign character on a HEAD line next to a ZT block is caught`, !!dT && dT.minus > dStr.minus);
  }
  const unchanged = (p) => { try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', p], { cwd: ROOT }); return true; } catch { return false; } };
  add('G10 buscosun Fusion and the 2D cell modules unchanged (konrad3d.ts, cellPolygons.ts, cellLayers.ts, dwdKonrad3d.ts)',
    unchanged('src/pointForecast/fusion') && unchanged('src/radar/konrad3d.ts') && unchanged('src/radar/cellPolygons.ts') && unchanged('src/radar/cellLayers.ts') && unchanged('src/sources/dwdKonrad3d.ts'));
}

let fail = 0;
for (const r of results) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
}
console.log(`\nverify:cell-towers ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
