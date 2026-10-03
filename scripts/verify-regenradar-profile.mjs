// ---------------------------------------------------------------------------
// Phase RR — verify:regenradar-profile (audit/regenradar-datenangleich.md §5, Gate GRR)
//
// A  the profile table (`src/map/mapProfile.ts`): layer mapping, profile switches, `?rr=legacy`, time and morph helpers
// B  composite rules of the profile (`radarProfileComposite`): look-back = measurements only, neighbours, tolerances
// C  `PrecipCompositor.build()` WITHOUT `rvPast` is byte-identical to HEAD — on real mirror frames (DE/AT/CH) over the
//    whole slider range, plus two negative controls (the comparison must be able to fail)
// D  `build()` WITH `rvPast`: RV by validity time — frame of the asked time, look-back analysis, gap stays empty,
//    foreign grid skipped, the "now" frame equals the Wetterkarte's frame at slider hour 0
// E  source contract: new MapView props optional, profile renders only the map, `?rr=legacy` fallback, the strip on
//    the cube chain with named fallback, nothing deleted, buscosun Fusion and the shaders untouched (git diff)
// F  `assembleNowcast` stays pure: in-app checks + `nwpSource` only passed through
//
// Real frames come from the radar mirror (jsDelivr, gated slots — no 404 poisoning); offline ⇒ C/D marked ⊘, not red.
// Call: npm run verify:regenradar-profile
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  RADAR_PROFILE, RADAR_PROFILE_LAYERS, radarProfileLayers, radarMapLegacyFrom, profileHourOf,
  radarProfileComposite, PROFILE_PAST_TOL_MS, PROFILE_RZC_PICK_TOL_MS, morphStep, PROFILE_MORPH_STEPS, lerpValues,
} from '../src/map/mapProfile.ts';
import { PrecipCompositor, RV_PICK_TOL_MS } from '../src/scalar/precipComposite.ts';
import { DE1200_CORNERS } from '../src/sources/radolanGeo.ts';
import { rvImgDir, incaImgDir, rzcImgDir, radarImgStamp, parseRvImgMeta, parseIncaImgMeta, parseRzcImgMeta } from '../src/sources/radarImg.ts';
import { rvStamp, RV_IMG_GATE_MS } from '../src/sources/radolanRuns.ts';
import { guessIncaStamps } from '../src/sources/geosphereIncaGrid.ts';
import { decodeGrayPng } from '../src/sources/grayPng.ts';
import { assembleNowcast, verifyNowcastEngine } from '../src/nowcast/nowcastEngine.ts';

let passed = 0, failed = 0, skipped = 0;
const add = (name, ok, detail) => { if (ok) passed++; else failed++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const skip = (name, why) => { skipped++; console.log(`⊘ ${name} — ${why}`); };
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const nonZero = (v) => { let n = 0; for (let i = 0; i < v.length; i++) if (v[i]) n++; return n; };
const H = 3_600_000, MIN = 60_000;

// ── A: profile table ─────────────────────────────────────────────────────────
add('A1 deck layers → MapView layers (precip→nowcast, cells, lightning, snow, snowline)',
  JSON.stringify(radarProfileLayers(['precip', 'cells', 'lightning', 'snow', 'snowline'])) === JSON.stringify(['nowcast', 'cells', 'lightning', 'snow', 'snowline']));
add('A2 order = profile table, duplicates and unknown ids dropped (E-RR-3: accum/coverage/rain/graupel/hail → nothing)',
  JSON.stringify(radarProfileLayers(['snowline', 'accum', 'precip', 'precip', 'coverage', 'graupel', 'hail', 'rain', 'wind'])) === JSON.stringify(['nowcast', 'snowline']));
add('A3 the profile can only ever switch on its five layers', RADAR_PROFILE_LAYERS.length === 5
  && radarProfileLayers(['precip', 'cells', 'lightning', 'snow', 'snowline', 'temp', 'wind', 'gust', 'clouds']).every((k) => RADAR_PROFILE_LAYERS.includes(k)));
add('A4 profile switches: no chrome, no city temperatures, no prefetch, zoom 8, draggable marker, zoom+locate, no scale, compact attribution',
  RADAR_PROFILE.chrome === 'none' && RADAR_PROFILE.tempLabels === false && RADAR_PROFILE.prefetch === false
  && RADAR_PROFILE.camera.zoom === 8 && RADAR_PROFILE.marker.draggable === true
  && RADAR_PROFILE.controls.navigation && RADAR_PROFILE.controls.geolocate && !RADAR_PROFILE.controls.scale && RADAR_PROFILE.controls.compactAttribution);
add('A5 `?rr=legacy` exact → old radar map; anything else → MapView profile',
  radarMapLegacyFrom('?rr=legacy') && radarMapLegacyFrom('?lat=1&rr=legacy') && !radarMapLegacyFrom('') && !radarMapLegacyFrom('?rr=LEGACY')
  && !radarMapLegacyFrom('?rr=1') && !radarMapLegacyFrom('?pf=live'));
add('A6 profileHourOf: absolute time → hours from now (past negative)',
  profileHourOf(1e12 + 30 * MIN, 1e12) === 0.5 && profileHourOf(1e12 - 15 * MIN, 1e12) === -0.25);
add('A7 morph steps 5 % (20 per frame), clamped', PROFILE_MORPH_STEPS === 20 && morphStep(0.024) === 0 && morphStep(0.026) === 0.05
  && morphStep(0.51) === 0.5 && morphStep(-1) === 0 && morphStep(2) === 1);
{
  const a = new Uint8Array([0, 10, 200, 255]), b = new Uint8Array([100, 10, 0, 255]), out = new Uint8Array(4);
  const m0 = [...lerpValues(a, b, 0, out)], m1 = [...lerpValues(a, b, 1, out)], mh = [...lerpValues(a, b, 0.5, out)];
  add('A8 lerp: endpoints exact, midpoint truncated like the old radar map (lerpU8)',
    JSON.stringify(m0) === '[0,10,200,255]' && JSON.stringify(m1) === '[100,10,0,255]' && JSON.stringify(mh) === '[50,10,100,255]', JSON.stringify(mh));
}

// ── B: composite rules of the profile (synthetic, network-free) ─────────────
{
  const now = Date.UTC(2026, 9, 3, 12, 0);
  const runAt = now - 7 * MIN;
  const fr = (n) => ({ values: new Uint8Array([n]), width: 1, height: 1 });
  const rv = { runAt: new Date(runAt), corners: DE1200_CORNERS, frames: [{ leadMinutes: 0, validAt: new Date(runAt), ...fr(1) }] };
  const inca = { corners: [[0, 1], [1, 1], [1, 0], [0, 0]], frames: [{ leadHours: 0.25, ...fr(2) }] };
  const rzcNow = { ...fr(3), corners: inca.corners, validAt: new Date(now - 10 * MIN) };
  const rzcOld = { ...fr(4), corners: inca.corners, validAt: new Date(now - 40 * MIN) };
  const atNow = radarProfileComposite(runAt, now, { rv, inca, rzc: rzcNow, rvPast: [], rzcPast: [rzcOld] });
  add('B1 the "now" frame (RV analysis, 7 min old) is NOT look-back: INCA + rzc drawn, RV by validity time (rvPast mode)',
    !atNow.past && atNow.sources.inca === inca && atNow.sources.rzc === rzcNow && Array.isArray(atNow.sources.rvPast)
    && Math.abs(atNow.h - (-7 / 60)) < 1e-12);
  const past = radarProfileComposite(runAt - 30 * MIN, now, { rv, inca, rzc: rzcNow, rvPast: [], rzcPast: [rzcOld] });
  add('B2 look-back (−30 min): INCA off (no analysis), CH = rzc analysis valid then (Δ 3 min ≤ 5 min)',
    past.past && past.sources.inca === null && past.sources.rzc === rzcOld);
  const gap = radarProfileComposite(runAt - 60 * MIN, now, { rv, inca, rzc: rzcNow, rvPast: [], rzcPast: [rzcOld] });
  add('B3 look-back without a CH analysis within 5 min → no CH picture (never the current one)', gap.past && gap.sources.rzc === null
    && PROFILE_RZC_PICK_TOL_MS === 5 * MIN);
  const edge = radarProfileComposite(runAt - PROFILE_PAST_TOL_MS + 1, now, { rv, inca, rzc: rzcNow });
  const edge2 = radarProfileComposite(runAt - PROFILE_PAST_TOL_MS - 1, now, { rv, inca, rzc: rzcNow });
  add('B4 look-back starts 2,5 min before the newest measurement (old radar map NEIGHBOR_PAST_TOL_H)', !edge.past && edge2.past
    && PROFILE_PAST_TOL_MS === 2.5 * MIN);
  const noRadar = radarProfileComposite(now - 10 * MIN, now, { rv: null, inca: null, rzc: null });
  add('B5 without any measurement the look-back is judged against the clock', noRadar.past && noRadar.sources.rvPast.length === 0);
}

// ── C/D: real frames from the mirror ────────────────────────────────────────
const WORK = resolve('.cache/rr-profile');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

/** HEAD's precipComposite.ts with absolute imports — the reference of "byte-identical". */
async function loadHeadCompositor() {
  const src = execFileSync('git', ['show', 'HEAD:src/scalar/precipComposite.ts'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const base = resolve('src/scalar');
  const rewritten = src.replace(/from '(\.{1,2}\/[^']+)'/g, (_m, spec) => `from '${pathToFileURL(resolve(base, spec)).href}.ts'`);
  const file = resolve(WORK, 'head-precipComposite.ts');
  writeFileSync(file, rewritten);
  return (await import(pathToFileURL(file).href)).PrecipCompositor;
}

async function getBytes(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function getJson(url) { return JSON.parse(Buffer.from(await getBytes(url)).toString('utf8')); }
async function decode(url) { return (await decodeGrayPng(await getBytes(url))).values; }

async function loadRvSlot(stampMs, { onlyAnalysis = false } = {}) {
  const st = rvStamp(new Date(stampMs));
  const meta = parseRvImgMeta(await getJson(`${rvImgDir(st)}/meta.json`));
  if (!meta) throw new Error(`rv meta ${st} invalid`);
  const frames = [];
  for (const f of meta.frames) {
    if (onlyAnalysis && f.lead !== 0) continue;
    frames.push({ leadMinutes: f.lead, validAt: new Date(meta.runAtMs + f.lead * MIN), values: await decode(`${rvImgDir(st)}/${f.file}`), width: meta.width, height: meta.height });
  }
  return { runAt: new Date(meta.runAtMs), frames, corners: DE1200_CORNERS, stamp: st };
}
async function firstRvSlot(nowMs, skipSlots = 0, opts) {
  const newest = Math.floor((nowMs - RV_IMG_GATE_MS) / (5 * MIN)) * 5 * MIN;
  let lastErr;
  for (let k = skipSlots; k < skipSlots + 4; k++) {
    try { return await loadRvSlot(newest - k * 5 * MIN, opts); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
async function loadInca(nowMs) {
  let lastErr;
  for (const st of guessIncaStamps(3, nowMs)) {
    try {
      const meta = parseIncaImgMeta(await getJson(`${incaImgDir(st)}/meta.json`));
      if (!meta) throw new Error(`inca meta ${st} invalid`);
      const frames = [];
      for (const f of meta.frames) frames.push({ leadHours: f.lead / 60, values: await decode(`${incaImgDir(st)}/${f.file}`), width: meta.width, height: meta.height });
      return { frames, corners: meta.corners, stamp: st };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
async function loadRzc(nowMs) {
  let lastErr;
  const newest = Math.floor((nowMs - 15 * MIN) / (5 * MIN)) * 5 * MIN;
  for (let k = 0; k < 6; k++) {
    const st = radarImgStamp(newest - k * 5 * MIN);
    try {
      const meta = parseRzcImgMeta(await getJson(`${rzcImgDir(st)}/meta.json`));
      if (!meta) throw new Error(`rzc meta ${st} invalid`);
      const values = await decode(`${rzcImgDir(st)}/frame.png`);
      return { values, width: meta.width, height: meta.height, corners: meta.corners, validAt: new Date(meta.validAtMs ?? newest - k * 5 * MIN), stamp: st };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/** Copy of a frame with a lead-specific tag in a 64-px-wide stripe — selection becomes visible even on a dry day. */
function tagged(frame, tag) {
  const v = new Uint8Array(frame.values);
  for (let y = 0; y < frame.height; y++) for (let x = 500; x < 564; x++) v[y * frame.width + x] = (tag % 250) + 1;
  return { ...frame, values: v };
}

let real = null;
try {
  const t0 = Date.now();
  const nowMs = Date.now();
  const [rv, inca, rzc] = await Promise.all([firstRvSlot(nowMs), loadInca(nowMs), loadRzc(nowMs)]);
  const pastSlot = await firstRvSlot(rv.runAt.getTime() + RV_IMG_GATE_MS, 3, { onlyAnalysis: true });   // 15 min older
  real = { rv, inca, rzc, pastSlot };
  console.log(`  real frames: RV ${rv.stamp} (${rv.frames.length} frames, ${nonZero(rv.frames[0].values)} wet cells at lead 0), RV look-back ${pastSlot.stamp}, INCA ${inca.stamp} (${inca.frames.length}), rzc ${rzc.stamp} — ${Date.now() - t0} ms`);
} catch (e) {
  skip('C/D real frames', `mirror not reachable (${e instanceof Error ? e.message : e})`);
}

if (real) {
  const HeadCompositor = await loadHeadCompositor();
  const head = new HeadCompositor();
  const cur = new PrecipCompositor();
  const { rv, inca, rzc, pastSlot } = real;
  const nowMs = rv.runAt.getTime() + 7 * MIN;
  const hours = [0, 0.1, 0.25, 0.5, 1, 1.5, 2, 2.05, 2.5, 3, 3.5];
  let allSame = true, cells = 0;
  const detail = [];
  for (const h of hours) {
    const a = head.build(h, { rv, inca, rzc }, nowMs).values;
    const b = cur.build(h, { rv, inca, rzc }, nowMs).values;
    if (!same(a, b)) { allSame = false; detail.push(`h=${h}`); }
    cells += a.length;
  }
  add('C1 build() without rvPast byte-identical to HEAD — real RV/INCA/rzc, 11 slider hours 0…3,5 h',
    allSame, allSame ? `${cells} cells compared` : `differs at ${detail.join(', ')}`);
  {
    const a = head.build(0.5, { rv }, nowMs).values, b = cur.build(0.5, { rv, rvPast: null }, nowMs).values;
    add('C2 rvPast: null counts as "absent" (byte-identical)', same(a, b));
  }
  // Negative control 1: the comparison sees a different RV choice (absolute mode picks lead 35 instead of lead 30).
  {
    const tRv = { ...rv, frames: rv.frames.map((f) => tagged(f, f.leadMinutes)) };
    const a = head.build(0.5, { rv: tRv }, nowMs).values;
    const b = cur.build(0.5, { rv: tRv, rvPast: [] }, nowMs).values;
    add('C3 negative control: rvPast mode (validity time) differs from lead mode when the run is 7 min old', !same(a, b));
  }
  // Negative control 2: one byte of one source changed ⇒ the comparison must fail.
  {
    const r2 = { ...rv, frames: rv.frames.map((f, i) => (i === 0 ? tagged(f, 99) : f)) };
    const a = head.build(0, { rv, inca, rzc }, nowMs).values;
    const b = cur.build(0, { rv: r2, inca, rzc }, nowMs).values;
    add('C4 negative control: a changed source frame is detected', !same(a, b));
  }

  // ── D: rvPast mode = RV by validity time ─────────────────────────────────
  const tRv = { ...rv, frames: rv.frames.map((f) => tagged(f, f.leadMinutes + 1)) };
  const runMs = rv.runAt.getTime();
  {
    let ok = true; const bad = [];
    for (const lead of [0, 5, 30, 60, 115, 120]) {
      const T = runMs + lead * MIN;
      const a = cur.build((T - nowMs) / H, { rv: tRv, rvPast: [] }, nowMs).values;
      const b = head.build(lead / 60, { rv: tRv }, nowMs).values;   // the Wetterkarte's frame of that lead
      if (!same(a, b)) { ok = false; bad.push(lead); }
    }
    add('D1 asked time = run + lead → exactly the frame of that lead (0, 5, 30, 60, 115, 120 min)', ok, bad.length ? `wrong at ${bad.join(',')}` : '');
  }
  {
    const pa = pastSlot.frames[0];
    const pastFrame = { validAt: pa.validAt, ...tagged(pa, 200) };
    const T = pa.validAt.getTime();
    const a = cur.build((T - nowMs) / H, { rv: tRv, rvPast: [pastFrame] }, nowMs).values;
    const asRun = { runAt: pa.validAt, corners: DE1200_CORNERS, frames: [{ leadMinutes: 0, validAt: pa.validAt, values: pastFrame.values, width: pa.width, height: pa.height }] };
    const b = head.build(0, { rv: asRun }, nowMs).values;
    add(`D2 look-back: time of a real older analysis (${pastSlot.stamp}) → exactly that analysis`, same(a, b));
    const gapT = runMs - 60 * MIN;
    const g = cur.build((gapT - nowMs) / H, { rv: tRv, rvPast: [pastFrame] }, nowMs).values;
    const empty = head.build(0, {}, nowMs).values;
    add('D3 a gap (> 5 min from every frame) stays empty — no neighbour frame drawn for the wrong time', same(g, empty) && RV_PICK_TOL_MS === 5 * MIN);
    const foreign = { validAt: pa.validAt, values: new Uint8Array(10), width: 5, height: 2 };
    const f = cur.build((T - nowMs) / H, { rv: tRv, rvPast: [foreign] }, nowMs).values;
    add('D4 a look-back frame on another grid is skipped (the DE index map belongs to the run)', same(f, empty));
    const beyond = cur.build((runMs + 130 * MIN - nowMs) / H, { rv: tRv, rvPast: [] }, nowMs).values;
    add('D5 beyond +120 min (+5 min tolerance) no RV — the radar horizon stays the horizon', same(beyond, empty));
  }
  {
    // The profile's "now" frame (time = RV run) equals the Wetterkarte's frame at slider hour 0 — real data, all three countries.
    const input = radarProfileComposite(runMs, nowMs, { rv, inca, rzc, rvPast: [], rzcPast: [] });
    const a = cur.build(input.h, input.sources, nowMs).values;
    const b = head.build(0, { rv, inca, rzc }, nowMs).values;
    add('D6 profile at the "now" frame == Wetterkarte at hour 0 (real RV + INCA + rzc)', same(a, b), `${nonZero(b)} wet cells`);
    const later = radarProfileComposite(runMs + 30 * MIN, nowMs, { rv, inca, rzc, rvPast: [], rzcPast: [] });
    const c = cur.build(later.h, later.sources, nowMs).values;
    const d = head.build(later.h, { rv: { ...rv, frames: rv.frames.filter((fr) => fr.leadMinutes === 30) }, inca, rzc }, nowMs).values;
    add('D7 profile at run + 30 min: RV lead 30, INCA/rzc by hours from now (Wetterkarte rule)', same(c, d));
  }
}

// ── E: source contract ───────────────────────────────────────────────────────
const read = (p) => readFileSync(resolve(p), 'utf8');
const mv = read('src/MapView.tsx');
const propsBlock = mv.slice(mv.indexOf('interface Props {'), mv.indexOf('// Layer-Katalog (SEO/GEO 2026'));
add('E1 MapView: every new prop is optional (profile, timeMs, timeBracket, radarPast, profileSnowMode, onPointPick, onPointHover, onMapReady)',
  ['profile?:', 'timeMs?:', 'timeBracket?:', 'radarPast?:', 'profileSnowMode?:', 'onPointPick?:', 'onPointHover?:', 'onMapReady?:'].every((p) => propsBlock.includes(p)));
{
  const i = mv.indexOf('  if (profile) {\n    return (');
  const j = i < 0 ? mv.indexOf('  if (profile) {\r\n    return (') : i;
  const block = j < 0 ? '' : mv.slice(j, mv.indexOf('  if (embedded) {', j));
  add('E2 profile render branch = only the map container (no deck chrome), before the embedded branch',
    j > 0 && block.includes('ref={containerRef}') && !/Deck|FeatureRail|PointForecastPanel|forecast-slider/.test(block));
}
add('E3 every profile-only branch reads `profile` (temp labels, prefetch, temperature load, clamp, snow-line reuse)',
  mv.includes('(profile && !RADAR_PROFILE.tempLabels)') && mv.includes('(profile && !RADAR_PROFILE.prefetch)')
  && mv.includes('!profile || RADAR_PROFILE.tempLabels || active.has(\'snowline\')') && mv.includes('if (profile) return;')
  && /if \(profile\) \{\s+const k = profileSnowlineKeyRef\.current;/.test(mv));
// V-RR-9: the layer cleanups (cells, hail DE, hail CH, warnings) only touch the map while it is still mounted — with and
// without profile. Before the fix, leaving the Wetterkarte with one of these layers on threw in production.
add('E3b V-RR-9 cleanup guard `mapRef.current === map` on cells, hail DE, hail CH and warnings, no longer profile-only',
  !mv.includes('if (!profile || mapRef.current === map)')
  && /if \(mapRef\.current === map\) \{\s+\(map\.getSource\(CELLS_SOURCE_ID\)/.test(mv)
  && /if \(mapRef\.current === map\) \{\s+\(map\.getSource\(HAIL_DE_SOURCE_ID\)/.test(mv)
  && mv.includes('if (mapRef.current === map && map.getLayer(HAIL_CH_LAYER_ID))')
  && /if \(mapRef\.current === map\) \{\s+\(map\.getSource\(WARN_SOURCE_ID\)/.test(mv));
const nrm = read('src/nowcast/NowcastRadarMap.tsx');
add('E4 Regenradar: MapView profile by default, old RadarMap behind `?rr=legacy` and as fallback if the chunk fails',
  nrm.includes('radarMapLegacyFrom(') && nrm.includes('<RadarMap') && nrm.includes('profile="radar"') && nrm.includes('loadMapView()')
  && nrm.includes('Rückfall auf die eigene Radarkarte'));
const eng = read('src/nowcast/nowcastEngine.ts');
add('E5 strip on the cube chain: dynamic import of cubeSource, pointSource cube, includeRadarNowcast, ?pf via pfSourceFrom, named fallback',
  eng.includes("import('../pointForecast/cubeSource')") && eng.includes("pointSource: 'cube'") && eng.includes('includeRadarNowcast: true')
  && eng.includes('pfSourceFrom(') && eng.includes('Rückfall auf den Live-Pfad') && !/^import .*cubeSource/m.test(eng));
add('E6 nothing deleted: old radar map, phase heuristic, accumulation, coverage, snow-line contour helper still there',
  ['src/radar/RadarMap.tsx', 'src/radar/precipPhase.ts', 'src/radar/accumulation.ts', 'src/radar/coverageMask.ts', 'src/radar/radarState.ts']
    .every((p) => existsSync(resolve(p))) && read('src/radar/precipPhase.ts').includes('export function snowLineGeoJSON'));
{
  const diff = (paths) => execFileSync('git', ['diff', '--name-only', 'HEAD', '--', ...paths], { encoding: 'utf8' }).trim();
  const fusion = diff(['src/pointForecast', 'src/point']);
  add('E7 buscosun Fusion untouched (src/pointForecast, src/point: no diff to HEAD)', fusion === '', fusion);
  const shaders = diff(['src/scalar/RainLayer.ts', 'src/scalar/ScalarLayer.ts', 'src/wind']);
  add('E8 no shader/WebGL pipeline change (RainLayer, ScalarLayer, WindLayer: no diff to HEAD)', shaders === '', shaders);
}

// ── F: assembleNowcast stays pure ─────────────────────────────────────────────
{
  const v = verifyNowcastEngine();
  add('F1 in-app engine checks (dry / rain / snow→rain / heavy / freezing)', v.failed === 0, `${v.passed}/${v.passed + v.failed}`);
  const now = 1_700_000_000_000;
  const base = {
    nowMs: now, radarValidUntilMs: 0, radarSource: '', runAtMs: now, fetchedAtMs: now, radarSampleAt: () => null,
    nwp: Array.from({ length: 9 }, (_, i) => ({ tMs: now + i * H, mmH: i % 3 ? 1.2 : 0, conf: 0.4, snowLineM: 1500, tempC: 4 })),
  };
  const plain = assembleNowcast(base);
  const cube = assembleNowcast({ ...base, nwpSource: 'cube' });
  const { nwpSource, ...rest } = cube;
  add('F2 nwpSource is only passed through — everything else identical, absent without input',
    nwpSource === 'cube' && JSON.stringify(rest) === JSON.stringify(plain) && !('nwpSource' in plain));
}

console.log(`\nverify:regenradar-profile — ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(failed ? 1 : 0);
