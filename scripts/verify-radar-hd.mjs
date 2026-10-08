// ---------------------------------------------------------------------------
// Phase HD — verify:radar-hd (audit/radar-hochaufloesung.md §5, gates G1/G4/G5)
//
// A  switches (`src/scalar/radarHd.ts`): grammar of `?hd=` / `localStorage.radarhd`, filter codes, layer ids
// B  ownership mask (`countryMaskForGrid`) = `pickCountry` at every pixel centre of the real grids (DE1200 1100×1200,
//    INCA 701×431, rzc 710×640 — the exact inverse per pixel as the slow reference), plus the fast picker against
//    `pickCountry` on random points; negative control: a shifted mask must differ
// C  frame rule: `pickCompositeFrames` is what `build()` draws — `build()` byte-identical to a re-implementation of the
//    pre-HD selection on synthetic sources over the whole slider range (incl. the `rvPast` mode)
// D  shader algebra: Node emulation of the four filters at texel centres — B-spline isolated texel 4/9, Catmull-Rom /
//    bilinear / nearest 1,00; Catmull-Rom clamped never leaves the inner 2×2 range (10 000 random positions)
// E  source contract: `RainLayer` default filter `bspline`, mask optional, nothing deleted; `?rr=legacy` map untouched
// F  HD-3 dual frames: log codec (round trip ≤ ½ step, dry ⇔ dry like v1), log ramp monotone, meta `dual` accepted /
//    rejected, decoders with `secondary` keep `values` byte-identical, 2-channel PNG round trip (encodePng ↔
//    decodeGrayAlphaPng), `?hdv2` switch; producer round trip on a REAL rzc file / RV tar when
//    `RADAR_HD_RAW=<dir>` names them (otherwise ⊘): `RADAR_IMG_DUAL=1` writes `g<lead>.png` whose channel 1 equals
//    `f<lead>.png` byte for byte and channel 2 equals `precipToU8Log` of the rates; without the switch the output is
//    byte-identical to the plain derive
//
// Call: npm run verify:radar-hd   (optional: RADAR_HD_RAW=<dir with rzc*.h5 / composite_rv_*.tar>)
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { radarHdFlagFrom, RAIN_FILTERS, RAIN_FILTER_CODE, RADAR_HD_DEFAULT_FILTER, RADAR_HD_DEFAULT_ON, RADAR_DUAL_DEFAULT_ON, RADAR_MORPH_DEFAULT_ON, RADAR_HD_LAYER_IDS, RADAR_HD_COUNTRIES } from '../src/scalar/radarHd.ts';
import { countryMaskForGrid, fastCountryPicker, gridNodeFn, projectedSampler, HD_GRID_COUNTRY } from '../src/scalar/radarCountryMask.ts';
import { pickCountry } from '../src/pointForecast/countryOfPoint.ts';
import { DE1200_CORNERS } from '../src/sources/radolanGeo.ts';
import { PrecipCompositor, pickCompositeFrames, RV_MAX_H, INCA_MAX_H, RZC_MAX_H } from '../src/scalar/precipComposite.ts';
import { G } from '../src/scalar/precipIndexMap.ts';

let passed = 0, failed = 0, skipped = 0;
const add = (name, ok, detail) => { if (ok) passed++; else failed++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const skip = (name, why) => { skipped++; console.log(`⊘ ${name} — ${why}`); };
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;

// ── A: switches ──────────────────────────────────────────────────────────────
// E-HD-2 (Jan 08.10.): HD is the default; `?hd=0` / store `0` is the named fallback (the composite picture of HEAD 96d9725).
add('A1 on without any vote (E-HD-2), with the default filter', RADAR_HD_DEFAULT_ON === true && radarHdFlagFrom('', null).on && radarHdFlagFrom('', null).filter === RADAR_HD_DEFAULT_FILTER);
add('A2 `?hd=1` on with the default filter', radarHdFlagFrom('?hd=1', null).on && radarHdFlagFrom('?hd=1', null).filter === RADAR_HD_DEFAULT_FILTER);
add('A3 `?hd=<filter>` picks the filter', RAIN_FILTERS.every((f) => radarHdFlagFrom(`?hd=${f}`, null).on && radarHdFlagFrom(`?hd=${f}`, null).filter === f));
add('A4 `?hd=0` beats the stored value', !radarHdFlagFrom('?hd=0', '1').on && !radarHdFlagFrom('?hd=0', 'catmull').on);
add('A5 stored value counts without a query vote', radarHdFlagFrom('', '1').on && radarHdFlagFrom('', 'nearest').filter === 'nearest' && !radarHdFlagFrom('', '0').on);
add('A6 unknown word = no vote (falls through to the store, else the default)', !radarHdFlagFrom('?hd=foo', '0').on && radarHdFlagFrom('?hd=foo', '1').on && radarHdFlagFrom('?hd=foo', null).on === RADAR_HD_DEFAULT_ON);
add('A7 broken query = no vote', radarHdFlagFrom('%E0%A4%A', null).on === RADAR_HD_DEFAULT_ON && !radarHdFlagFrom('%E0%A4%A', '0').on);
add('A8 default filter is Catmull-Rom; codes 0..3 unique; bspline is 0 (the pre-HD path)',
  RADAR_HD_DEFAULT_FILTER === 'catmull' && RAIN_FILTER_CODE.bspline === 0 && new Set(RAIN_FILTERS.map((f) => RAIN_FILTER_CODE[f])).size === 4);
add('A9 three layer ids, one per country, distinct from the composite layer', RADAR_HD_COUNTRIES.length === 3
  && new Set(Object.values(RADAR_HD_LAYER_IDS)).size === 3 && !Object.values(RADAR_HD_LAYER_IDS).includes('precip-rain-layer'));

// ── B: ownership mask ────────────────────────────────────────────────────────
const INCA_CORNERS = [[8.090898567448969, 49.36722050753486], [17.749633984088593, 49.400784490264904], [17.436301138588583, 45.529428764230374], [8.462551055500136, 45.498222963663224]];
const RZC_CORNERS = [[2.689419984817505, 49.3744010925293], [12.462300300598145, 49.36330032348633], [11.955599784851074, 43.61899948120117], [3.1687800884246826, 43.62900161743164]];
const GRIDS = [
  { kind: 'radolan', corners: DE1200_CORNERS, cols: 1100, rows: 1200 },
  { kind: 'inca', corners: INCA_CORNERS, cols: 701, rows: 431 },
  { kind: 'rzc', corners: RZC_CORNERS, cols: 710, rows: 640 },
];
{
  // fast picker vs pickCountry on random points over the DACH box (incl. the overlaps)
  const pick = fastCountryPicker();
  let bad = 0; const N = 200_000;
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < N; i++) { const lat = 45 + rnd() * 11, lng = 5 + rnd() * 13; if (pick(lat, lng) !== pickCountry(lat, lng)) bad++; }
  add(`B1 fast picker = pickCountry on ${N} random points`, bad === 0, `${bad} differ`);
}
for (const g of GRIDS) {
  const t0 = Date.now();
  const mask = countryMaskForGrid(g.kind, g.corners, g.cols, g.rows);
  const ms = Date.now() - t0;
  // slow reference: exact node function per pixel centre (no bicubic refinement), pickCountry
  const node = gridNodeFn(g.kind, g.corners);
  let bad = 0, own = 0;
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const [lon, lat] = node((c + 0.5) / g.cols, (r + 0.5) / g.rows);
    const ref = pickCountry(lat, lon) === HD_GRID_COUNTRY[g.kind] ? 1 : 0;
    if (ref !== mask[r * g.cols + c]) bad++;
    own += ref;
  }
  add(`B2 ${g.kind} ${g.cols}×${g.rows}: mask = pickCountry at every pixel centre (exact inverse)`, bad === 0, `${bad} of ${g.cols * g.rows} differ, ${own} own, ${ms} ms`);
  // bicubic refinement error at pixel centres
  const at = projectedSampler(node);
  let maxErr = 0;
  for (let r = 0; r < g.rows; r += 37) for (let c = 0; c < g.cols; c += 41) {
    const u = (c + 0.5) / g.cols, v = (r + 0.5) / g.rows;
    const a = node(u, v), b = at(u, v);
    const dKm = Math.hypot((a[0] - b[0]) * 111.195 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 111.195);
    if (dKm > maxErr) maxErr = dKm;
  }
  add(`B3 ${g.kind}: bicubic refinement of the pixel centres ≤ 0,1 m`, maxErr <= 1e-4, `${(maxErr * 1000).toFixed(3)} m`);
  // negative control: a mask shifted by one row must differ
  const shifted = new Uint8Array(mask.length); shifted.set(mask.subarray(g.cols), 0);
  add(`B4 ${g.kind}: negative control — shifted mask differs`, !same(mask, shifted));
}

// ── C: frame rule ────────────────────────────────────────────────────────────
{
  const W = 20, H = 10;
  const frame = (seed) => { const v = new Uint8Array(W * H); for (let i = 0; i < v.length; i++) v[i] = (i * 31 + seed * 17) % 251; return v; };
  const runAt = new Date('2026-10-08T15:05:00Z');
  const rv = { runAt, corners: DE1200_CORNERS, frames: Array.from({ length: 25 }, (_, k) => ({ leadMinutes: k * 5, validAt: new Date(runAt.getTime() + k * 300_000), values: frame(k), width: W, height: H })) };
  const inca = { corners: INCA_CORNERS, frames: Array.from({ length: 12 }, (_, k) => ({ leadHours: (k + 1) / 4, values: frame(100 + k), width: W, height: H })) };
  const rzc = { values: frame(200), width: W, height: H, corners: RZC_CORNERS, validAt: runAt };
  const d2 = { corners: [[5, 55], [17, 55], [17, 45], [5, 45]], frames: Array.from({ length: 6 }, (_, k) => ({ validAt: new Date(runAt.getTime() + k * 3600_000), values: frame(300 + k), width: W, height: H })) };
  const nowMs = runAt.getTime() + 120_000;
  // pre-HD selection, re-implemented verbatim
  const nearestBy = (arr, dist) => { let best = arr[0], bd = dist(arr[0]); for (const x of arr) { const d = dist(x); if (d < bd) { bd = d; best = x; } } return best; };
  const oldPick = (h, s) => ({
    rv: h <= RV_MAX_H + 1e-6 && s.rv?.frames.length ? nearestBy(s.rv.frames, (f) => Math.abs(f.leadMinutes - h * 60)) : null,
    inca: h <= INCA_MAX_H + 1e-6 && s.inca?.frames.length ? nearestBy(s.inca.frames, (f) => Math.abs(f.leadHours - h)) : null,
    rzc: h < RZC_MAX_H && s.rzc ? s.rzc : null,
    d2: s.d2?.frames.length ? nearestBy(s.d2.frames, (f) => Math.abs(f.validAt.getTime() - (nowMs + h * 3600_000))) : null,
  });
  let bad = 0, n = 0;
  for (let h = 0; h <= 6; h += 1 / 12) {
    for (const s of [{ rv, inca, rzc, d2 }, { rv, inca: null, rzc: null, d2 }, { rv: null, inca, rzc, d2: null }, { rv, inca, rzc }]) {
      const a = pickCompositeFrames(h, s, nowMs), b = oldPick(h, s);
      n++; if (a.rv !== b.rv || a.inca !== b.inca || a.rzc !== b.rzc || a.d2 !== b.d2) bad++;
    }
  }
  add(`C1 pickCompositeFrames = the pre-HD selection (${n} slider hours × source sets)`, bad === 0, `${bad} differ`);
  // build() draws exactly the picked frames: every composite cell equals the picked frame's value at its index map entry
  const comp = new PrecipCompositor();
  let badCells = 0, checked = 0;
  for (const h of [0, 0.25, 0.5, 1, 2, 2.5, 3, 4]) {
    const cf = comp.build(h, { rv, inca, rzc, d2 }, nowMs);
    const p = pickCompositeFrames(h, { rv, inca, rzc, d2 }, nowMs);
    const idx = { 0: comp.deIdx, 1: comp.atIdx, 2: comp.chIdx }, pf = { 0: p.rv, 1: p.inca, 2: p.rzc };
    for (let i = 0; i < cf.values.length; i += 97) {
      const c = comp.country[i]; const j = idx[c]?.[i];
      let want = 0;
      if (pf[c] && j >= 0) want = pf[c].values[j];
      else if (p.d2 && comp.d2Idx && comp.d2Idx[i] >= 0) want = p.d2.values[comp.d2Idx[i]];
      checked++; if (cf.values[i] !== want) badCells++;
    }
  }
  add(`C2 build() gathers exactly the picked frames (${checked} cells over 8 hours)`, badCells === 0, `${badCells} differ`);
  add('C3 composite grid unchanged (600 × 512, 5,5–17,4 E, 45,3–55,5 N)', G.w === 600 && G.h === 512 && G.lonMin === 5.5 && G.lonMax === 17.4 && G.latMin === 45.3 && G.latMax === 55.5);
  // rvPast mode: picked by validity time
  const past = [{ validAt: new Date(runAt.getTime() - 600_000), values: frame(500), width: W, height: H }];
  const pp = pickCompositeFrames(-10 / 60 - 120_000 / 3_600_000, { rv, rvPast: past }, nowMs);
  add('C4 rvPast mode picks the analysis valid at the asked time', pp.rv === past[0]);
}

// ── D: shader algebra ────────────────────────────────────────────────────────
{
  const bsplineW = (t) => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 3 * t2 - 3 * t + 1) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6]; };
  const catmullW = (t) => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2]; };
  // the shader's `cubicWeights` (B-spline, 4-tap form) at t = 0 equals (1, 4, 1, 0)/6
  const shaderCubic = (v) => { const n = [1, 2, 3, 4].map((k) => k - v); const s = n.map((x) => x * x * x); const x = s[0], y = s[1] - 4 * s[0], z = s[2] - 4 * s[1] + 6 * s[0]; return [x, y, z, 6 - x - y - z].map((k) => k / 6); };
  add('D1 shader cubicWeights(0) = (1, 4, 1, 0)/6 = B-spline weights', shaderCubic(0).every((w, i) => Math.abs(w - bsplineW(0)[i]) < 1e-12));
  add('D2 isolated texel: B-spline centre 4/9, Catmull-Rom 1, neighbour B-spline 1/9', Math.abs(bsplineW(0)[1] ** 2 - 4 / 9) < 1e-12 && Math.abs(catmullW(0)[1] ** 2 - 1) < 1e-12 && Math.abs(bsplineW(0)[1] * bsplineW(0)[0] - 1 / 9) < 1e-12);
  const W = 16, H = 16; const tex = new Float32Array(W * H);
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < tex.length; i++) tex[i] = rnd() < 0.3 ? rnd() : 0;
  const clampI = (x, n) => (x < 0 ? 0 : x >= n ? n - 1 : x);
  const at = (x, y) => tex[clampI(y, H) * W + clampI(x, W)];
  const catmull = (u, v) => {
    const x = u * W - 0.5, y = v * H - 0.5; const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const wx = catmullW(fx), wy = catmullW(fy); let s = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) s += wx[i] * wy[j] * at(x0 - 1 + i, y0 - 1 + j);
    const lo = Math.min(at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)), hi = Math.max(at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1));
    return { raw: s, clamped: Math.min(hi, Math.max(lo, s)), lo, hi };
  };
  let exact = 0, overshoot = 0, clampedOut = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const r = catmull((x + 0.5) / W, (y + 0.5) / H); if (Math.abs(r.clamped - at(x, y)) < 1e-9) exact++; }
  for (let k = 0; k < 10_000; k++) { const r = catmull(rnd(), rnd()); if (r.raw < r.lo - 1e-9 || r.raw > r.hi + 1e-9) overshoot++; if (r.clamped < r.lo - 1e-12 || r.clamped > r.hi + 1e-12) clampedOut++; }
  add('D3 Catmull-Rom reproduces every texel at its centre (interpolating)', exact === W * H, `${exact}/${W * H}`);
  add('D4 unclamped Catmull-Rom overshoots on sparse data; the clamp never leaves the inner 2×2 range', overshoot > 0 && clampedOut === 0, `${overshoot} raw overshoots of 10 000, ${clampedOut} after clamp`);
}

// ── E: source contract ───────────────────────────────────────────────────────
{
  const rain = readFileSync(new URL('../src/scalar/RainLayer.ts', import.meta.url), 'utf8');
  add('E1 RainLayer: filter option defaults to bspline (pre-HD path), uniform branch 0 = sampleBicubic', /options\.filter \?\? 'bspline'/.test(rain) && /return sampleBicubic\(sm, uv\);/.test(rain) && /if \(u_filter == 1\) return sampleCatmull\(sm, uv\);/.test(rain));
  add('E2 RainLayer: mask optional, NEAREST, discard only with u_mask_on', /mask\?: Uint8Array \| null/.test(rain) && /TEXTURE_MAG_FILTER, gl\.NEAREST/.test(rain) && /u_mask_on > 0\.5 &&/.test(rain));
  add('E3 RainLayer: Catmull-Rom 16 taps clamped to the inner 2×2 (lo/hi)', /return clamp\(s, lo, hi\);/.test(rain) && /i >= 1 && i <= 2 && j >= 1 && j <= 2/.test(rain));
  const mv = readFileSync(new URL('../src/MapView.tsx', import.meta.url), 'utf8');
  add('E4 MapView: HD layers exist only with the switch; composite layer hidden only with the switch', /hd\.on \? \[/.test(mv) && /modelSourceRef\.current\.radar && !hdRef\.current\.on/.test(mv));
  add('E5 MapView: the composite is still built and uploaded with HD on (named fallback)', /if \(hd\.on\) syncHd\(pickCompositeFrames\(forecastHour/.test(mv));
  const legacy = readFileSync(new URL('../src/radar/RadarMap.tsx', import.meta.url), 'utf8');
  add('E6 the old radar map (`?rr=legacy`) does not know HD', !/radarHd|RADAR_HD/.test(legacy));
  const worker = readFileSync(new URL('../src/scalar/precipIndexWorker.ts', import.meta.url), 'utf8');
  add('E7 worker: mask op additive, index op unchanged without `op`', /op === 'mask'/.test(worker) && /buildCompositeIndexMap\(corners, sCols, sRows, grid\)/.test(worker));
}

// ── F: HD-3 dual frames ──────────────────────────────────────────────────────
{
  const { precipToU8, precipToU8Log, precipFromU8Log, precipRainRampLog, PRECIP_LOG_MIN, PRECIP_LOG_MAX, PRECIP_LOG_STEPS } = await import('../src/scalar/RainLayer.ts');
  const { radarDualFlagFrom } = await import('../src/scalar/radarHd.ts');
  const { makeRvImgMeta, parseRvImgMeta, makeRzcImgMeta, parseRzcImgMeta, makeIncaImgMeta, parseIncaImgMeta, makeRadarImgDual, radarImgDualFile, RADAR_IMG_DUAL_LOG } = await import('../src/sources/radarImg.ts');
  const { decodeGrayAlphaPng, decodeGrayPng } = await import('../src/sources/grayPng.ts');
  const { encodePng } = await import('./lib/png.mjs');
  // codec
  let maxRel = 0, dryMismatch = 0, nonMono = 0, prev = -1;
  for (let i = 0; i <= 4000; i++) {
    const mm = i === 0 ? 0 : 0.01 * Math.exp((Math.log(500 / 0.01) * i) / 4000);
    const u = precipToU8Log(mm);
    if ((u === 0) !== (precipToU8(mm) === 0)) dryMismatch++;
    if (u < prev) nonMono++; prev = u;
    if (u >= 1 && mm >= PRECIP_LOG_MIN && mm <= PRECIP_LOG_MAX) maxRel = Math.max(maxRel, Math.abs(Math.log(precipFromU8Log(u) / mm)));
  }
  const halfStep = Math.log(PRECIP_LOG_MAX / PRECIP_LOG_MIN) / PRECIP_LOG_STEPS / 2;
  add('F1 log codec: dry ⇔ dry exactly as v1 (0,06 mm/h), monotone, round trip ≤ ½ step (3,2 %/2)', dryMismatch === 0 && nonMono === 0 && maxRel <= halfStep + 1e-12, `max |ln| ${maxRel.toFixed(5)} ≤ ${halfStep.toFixed(5)}`);
  add('F2 log codec ends: 0,06 → 1, 200 → 255, > 200 clamps to 255, NaN → 0', precipToU8Log(0.06) === 1 && precipToU8Log(200) === 255 && precipToU8Log(5000) === 255 && precipToU8Log(NaN) === 0 && precipToU8Log(0.059) === 0);
  const stops = Object.keys(precipRainRampLog).map(Number).sort((a, b) => a - b);
  add('F3 log ramp: 15 stops, strictly increasing, same colours as the linear ramp up to 20 mm/h, white at 200', stops.length === 15 && stops.every((s, i) => i === 0 || s > stops[i - 1])
    && precipRainRampLog[precipToU8Log(20) / 255] === 'rgba(150,40,140,0.90)' && precipRainRampLog[precipToU8Log(0.06) / 255] === 'rgba(150,200,245,0.59)' && precipRainRampLog[1] === 'rgba(255,255,255,0.98)');
  // switch
  add('F4 `?hdv2=1` on, `?hdv2=0` beats the store, store `0`/`1` count, default on (E-HD-3)', radarDualFlagFrom('?hdv2=1', null) && !radarDualFlagFrom('?hdv2=0', '1') && radarDualFlagFrom('', '1') && !radarDualFlagFrom('', '0') && radarDualFlagFrom('', null) === RADAR_DUAL_DEFAULT_ON && RADAR_DUAL_DEFAULT_ON === true);
  // meta
  const frames = Array.from({ length: 25 }, (_, k) => ({ lead: k * 5, file: `f${String(k * 5).padStart(3, '0')}.png`, bytes: 10 }));
  const dual = makeRadarImgDual(frames.map((f) => ({ lead: f.lead, file: radarImgDualFile(f.lead), bytes: 20 })));
  const rvMeta = makeRvImgMeta('2610081505', 1791471900000, frames, undefined, dual);
  const rt = (m) => JSON.parse(JSON.stringify(m));
  add('F5 rv meta with dual round-trips through the parser; without dual too', parseRvImgMeta(rt(rvMeta)) !== null && parseRvImgMeta(rt(makeRvImgMeta('2610081505', 1791471900000, frames))) !== null && dual.log.min === RADAR_IMG_DUAL_LOG.min);
  const bad1 = rt(rvMeta); bad1.dual.log.max = 100;
  const bad2 = rt(rvMeta); bad2.dual.frames[3].file = 'f015.png';
  const bad3 = rt(rvMeta); bad3.dual.frames.pop();
  add('F6 rv meta: wrong log constants / wrong file name / missing frame are rejected', parseRvImgMeta(bad1) === null && parseRvImgMeta(bad2) === null && parseRvImgMeta(bad3) === null);
  const corners = [[8.09, 49.37], [17.75, 49.4], [17.44, 45.53], [8.46, 45.5]];
  const rzcMeta = makeRzcImgMeta('20261008T1510', 1791472200000, corners, 100, makeRadarImgDual([{ lead: 0, file: 'g000.png', bytes: 200 }]));
  const incaFrames = [15, 30, 45].map((l) => ({ lead: l, file: `f${String(l).padStart(3, '0')}.png`, bytes: 5 }));
  const incaMeta = makeIncaImgMeta('20261008T1445', 1, corners, incaFrames, makeRadarImgDual(incaFrames.map((f) => ({ lead: f.lead, file: radarImgDualFile(f.lead), bytes: 9 }))));
  add('F7 rzc / inca meta with dual accepted (rzc dual file g000.png)', parseRzcImgMeta(rt(rzcMeta)) !== null && parseIncaImgMeta(rt(incaMeta)) !== null);
  // 2-channel PNG round trip
  {
    const W = 37, H = 23; const a = new Uint8Array(W * H), b = new Uint8Array(W * H);
    let seed = 99; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < a.length; i++) { a[i] = rnd() < 0.4 ? Math.floor(rnd() * 256) : 0; b[i] = a[i] ? Math.floor(rnd() * 256) : 0; }
    const inter = new Uint8Array(W * H * 2); for (let i = 0; i < a.length; i++) { inter[i * 2] = a[i]; inter[i * 2 + 1] = b[i]; }
    const png = encodePng(W, H, inter, 2);
    const d = await decodeGrayAlphaPng(new Uint8Array(png));
    add('F8 2-channel PNG round trip (encodePng ↔ decodeGrayAlphaPng): both planes byte-identical', d.width === W && d.height === H && same(d.values, a) && same(d.values2, b));
    let rejected = false; try { await decodeGrayPng(new Uint8Array(png)); } catch (e) { rejected = /Farbtyp 4/.test(String(e)); }
    let rejected2 = false; try { await decodeGrayAlphaPng(new Uint8Array(encodePng(W, H, a, 1))); } catch (e) { rejected2 = /Farbtyp 0/.test(String(e)); }
    add('F9 the gray reader rejects a dual PNG and the dual reader rejects a gray PNG (named errors)', rejected && rejected2);
  }
  // producer round trip on real files
  const rawDir = process.env.RADAR_HD_RAW;
  const { existsSync, readdirSync, mkdtempSync, readFileSync: rf, rmSync } = await import('node:fs');
  if (!rawDir || !existsSync(rawDir)) {
    skip('F10 producer round trip (RADAR_IMG_DUAL=1) on a real rzc file / RV tar', 'RADAR_HD_RAW nicht gesetzt');
  } else {
    const { execFileSync } = await import('node:child_process');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { parseRzcHdf5 } = await import('../src/sources/rzcParse.ts');
    const files = readdirSync(rawDir);
    const runDerive = (source, inPath, outDir, stamp, env) => execFileSync(process.execPath, [
      '--experimental-strip-types', '--import', pathToFileURL(join(process.cwd(), 'scripts', 'lib', 'register-ts.mjs')).href,
      join(process.cwd(), 'scripts', 'radar-mirror', 'radar-derive.mjs'), source, inPath, outDir, stamp,
    ], { encoding: 'utf8', timeout: 300_000, env: { ...process.env, REPACK_BZIP2: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const tmp = mkdtempSync(join(tmpdir(), 'hd-dual-'));
    for (const [source, re, stampOf] of [['rzc', /^rzc.*\.h5$/, (f) => `2026${f.slice(3, 8)}T${f.slice(8, 12)}`], ['rv', /^composite_rv_.*\.tar$/, (f) => f.slice(15, 17) + f.slice(17, 19) + f.slice(19, 21) + f.slice(22, 26)]]) {
      const f = files.find((x) => re.test(x));
      if (!f) { skip(`F10 ${source}: producer round trip`, `keine Datei in ${rawDir}`); continue; }
      const inPath = join(rawDir, f), stamp = stampOf(f);
      const outA = join(tmp, `${source}-plain`), outB = join(tmp, `${source}-dual`);
      runDerive(source, inPath, outA, stamp, { RADAR_IMG_DUAL: '' });
      runDerive(source, inPath, outB, stamp, { RADAR_IMG_DUAL: '1' });
      const listA = readdirSync(outA).sort(), listB = readdirSync(outB).sort();
      const plainSame = listA.every((n) => n === 'meta.json' ? JSON.stringify(JSON.parse(rf(join(outA, n), 'utf8'))) === JSON.stringify((({ dual: _d, ...r }) => r)(JSON.parse(rf(join(outB, n), 'utf8')))) : Buffer.compare(rf(join(outA, n)), rf(join(outB, n))) === 0);
      const gFiles = listB.filter((n) => /^g\d{3}\.png$/.test(n));
      add(`F10 ${source}: without the switch the derive is byte-identical; with it every f-frame has a g-frame (${gFiles.length})`, plainSame && gFiles.length === listA.filter((n) => /^(f\d{3}|frame)\.png$/.test(n)).length && listB.every((n) => listA.includes(n) || /^g\d{3}\.png$/.test(n)));
      const meta = JSON.parse(rf(join(outB, 'meta.json'), 'utf8'));
      const parsed = source === 'rzc' ? parseRzcImgMeta(meta) : parseRvImgMeta(meta);
      add(`F11 ${source}: meta.dual passes the client parser`, parsed !== null && parsed.dual && parsed.dual.frames.length === gFiles.length);
      let ch1Same = 0, ch2Ok = 0, n = 0;
      for (const d of meta.dual.frames) {
        n++;
        const g = await decodeGrayAlphaPng(new Uint8Array(rf(join(outB, d.file))));
        const fFile = source === 'rzc' ? 'frame.png' : `f${String(d.lead).padStart(3, '0')}.png`;
        const v1 = await decodeGrayPng(new Uint8Array(rf(join(outB, fFile))));
        if (same(g.values, v1.values)) ch1Same++;
        // channel 2 against the rates: dry ⇔ dry and v1 byte ≥ 1 ⇔ log byte ≥ 1 everywhere; monotone pairing
        let ok = true;
        for (let i = 0; i < g.values.length; i++) if ((g.values[i] === 0) !== (g.values2[i] === 0)) { ok = false; break; }
        if (ok) ch2Ok++;
      }
      add(`F12 ${source}: channel 1 of every g-frame = f-frame byte for byte (${ch1Same}/${n}); channel 2 dry ⇔ dry (${ch2Ok}/${n})`, ch1Same === n && ch2Ok === n);
      if (source === 'rzc') {
        const p = parseRzcHdf5(rf(inPath).buffer.slice(0), { secondary: precipToU8Log });
        const g = await decodeGrayAlphaPng(new Uint8Array(rf(join(outB, 'g000.png'))));
        add('F13 rzc: channel 2 = precipToU8Log of the parsed rates, byte for byte; `values` unchanged by `secondary`', same(g.values2, p.values2) && same(g.values, p.values));
      }
    }
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ── G: HD-4 morph along the motion field ─────────────────────────────────────
{
  const { estimateMorphFlow, morphAt } = await import('../src/scalar/radarMorphFlow.ts');
  const { encodeFlow } = await import('../src/scalar/RainLayer.ts');
  const { radarMorphFlagFrom, RADAR_MORPH_MAX_TEXELS, RADAR_MORPH_FACTOR } = await import('../src/scalar/radarHd.ts');
  add('G1 `?hdmorph=1` on, `?hdmorph=0` beats the store, store `0` off, default on (E-HD-5); factors DE 8 / AT 4 / CH 4', radarMorphFlagFrom('?hdmorph=1', null) && !radarMorphFlagFrom('?hdmorph=0', '1') && !radarMorphFlagFrom('', '0') && radarMorphFlagFrom('', null) === RADAR_MORPH_DEFAULT_ON && RADAR_MORPH_DEFAULT_ON === true && RADAR_MORPH_FACTOR.DE === 8 && RADAR_MORPH_FACTOR.AT === 4);
  // flow encoding round trip (LUMINANCE_ALPHA bytes ↔ texels)
  const fl = { u: Float32Array.from([-40, -3.3, 0, 7.25, 40, 99]), v: Float32Array.from([1, -1, 0.5, -0.5, 0, -99]), w: 3, h: 2 };
  const enc = encodeFlow(fl);
  const dec = (b) => (b / 127.5 - 1) * RADAR_MORPH_MAX_TEXELS;
  let maxErr = 0;
  for (let i = 0; i < 6; i++) { const cu = Math.max(-40, Math.min(40, fl.u[i])), cv = Math.max(-40, Math.min(40, fl.v[i])); maxErr = Math.max(maxErr, Math.abs(dec(enc[i * 2]) - cu), Math.abs(dec(enc[i * 2 + 1]) - cv)); }
  add('G2 flow bytes: round trip within half a step (40/127,5 texel), clamped at ±40', maxErr <= RADAR_MORPH_MAX_TEXELS / 127.5 / 2 + 1e-9 && enc[10] === 255 && enc[11] === 0, `max ${maxErr.toFixed(3)} texel`);
  // synthetic: a blob moving (+4, +1) — the in-between picture at ½ lies on the path with its peak kept; the linear mix does not
  const W = 64, H = 64, sig = 4;
  const blob = (cx, cy) => { const f = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = Math.round(255 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sig * sig))); return f; };
  const A = blob(28, 30), B = blob(32, 31);
  const flow = estimateMorphFlow(A, B, W, H, 1);
  const ci = 30 * W + 30;
  add('G3 flow at the blob ≈ (+4, +1) texel per interval', Math.abs(flow.u[ci] - 4) < 1.5 && Math.abs(flow.v[ci] - 1) < 1.5, `(${flow.u[ci].toFixed(2)}, ${flow.v[ci].toFixed(2)})`);
  const field = (frac) => { const out = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = morphAt(A, B, W, H, flow, frac, x, y); return out; };
  const stats = (f) => { let sx = 0, sy = 0, s = 0, mx = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = f[y * W + x]; s += v; sx += x * v; sy += y * v; if (v > mx) mx = v; } return { cx: sx / s, cy: sy / s, peak: mx }; };
  const m0 = stats(field(0)), m1 = stats(field(1)), mh = stats(field(0.5));
  const lerp = new Float32Array(W * H); for (let i = 0; i < lerp.length; i++) lerp[i] = (A[i] + B[i]) / 2 / 255;
  const ml = stats(lerp);
  add('G4 frac 0 = frame A, frac 1 = frame B (centroids)', Math.abs(m0.cx - 28) < 0.05 && Math.abs(m0.cy - 30) < 0.05 && Math.abs(m1.cx - 32) < 0.05 && Math.abs(m1.cy - 31) < 0.05, `A (${m0.cx.toFixed(2)}, ${m0.cy.toFixed(2)}) B (${m1.cx.toFixed(2)}, ${m1.cy.toFixed(2)})`);
  add('G5 frac ½: ONE blob on the path (centroid ≈ (30, 30,5)), peak ≥ 0,9 and clearly above the linear mix (two half blobs)', Math.abs(mh.cx - 30) < 0.6 && Math.abs(mh.cy - 30.5) < 0.6 && mh.peak >= 0.9 && mh.peak >= ml.peak + 0.05, `morph peak ${mh.peak.toFixed(3)} at (${mh.cx.toFixed(2)}, ${mh.cy.toFixed(2)}) · lerp peak ${ml.peak.toFixed(3)}`);
  // coarsened flow scales back to native texels
  const A8 = new Uint8Array(W * 8 * H * 8), B8 = new Uint8Array(W * 8 * H * 8);
  for (let y = 0; y < H * 8; y++) for (let x = 0; x < W * 8; x++) { A8[y * W * 8 + x] = A[Math.floor(y / 8) * W + Math.floor(x / 8)]; B8[y * W * 8 + x] = B[Math.floor(y / 8) * W + Math.floor(x / 8)]; }
  const f8 = estimateMorphFlow(A8, B8, W * 8, H * 8, 8);
  add('G6 coarsened (factor 8) flow comes back in native texels (≈ +32, +8) on a 64²-grid', f8.w === W && f8.h === H && Math.abs(f8.u[ci] - 32) < 12 && Math.abs(f8.v[ci] - 8) < 12, `(${f8.u[ci].toFixed(1)}, ${f8.v[ci].toFixed(1)})`);
  const rain = readFileSync(new URL('../src/scalar/RainLayer.ts', import.meta.url), 'utf8');
  add('G7 shader: morph reads A at −frac·d and B at +(1−frac)·d and mixes; without u_morph_on the single-frame path', /sampleAny\(u_value, v_uv - u_frac \* d\)/.test(rain) && /sampleAny\(u_value_b, v_uv \+ \(1\.0 - u_frac\) \* d\)/.test(rain) && /t = sampleAny\(u_value, v_uv\);/.test(rain));
  const mv = readFileSync(new URL('../src/MapView.tsx', import.meta.url), 'utf8');
  add('G8 MapView: morph only with the switch, inside the profile bracket, linear mix as the fallback while the flow is computed', /if \(hdMorphRef\.current\) \{/.test(mv) && /flowCached\(x\.values, y\.values\)/.test(mv) && /layer\.setMorph\(morph \?\? null\)/.test(mv));
}

console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(failed ? 1 : 0);
