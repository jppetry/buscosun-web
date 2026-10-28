// ---------------------------------------------------------------------------
// Phase NC — verify:radar-nc (audit/radar-nowcast-dach.md §6): radar 25 × 5 min to +2 h everywhere in DACH
//
// A  switches and contract constants (`src/sources/radarNowcastImg.ts`): OFF by default (rule 2, Jan's brief), `?nc=1`
//    / `?chnc=1` / store, `?ncbase=` grammar, leads 24 × 5 (CH) and 34 × 5 (AT), crossover table with provenance
// B  meta schema: the producer's builders pass the client's parsers, every drift (vMax, frame count, file names, validity,
//    kinds, series) is rejected; one colour contract for every radar product (vMax = PRECIP_VMAX, one ramp in MapView,
//    the unknown veil grey)
// C  arithmetic (`radarNowcastExtrap.ts`, synthetic planes): zero flow = identity, constant flow = exact pixel shift with
//    the unknown columns at value 0, `wet-bilinear-round` never invents a byte below the measured minimum, between frames
//    reproduce their neighbours at frac 0 / 1, motion statistics (speed, direction FROM), series flow of a translated plane
// D  zones (`radarZones.ts`): weights add up to 1, named places land in their product, the band is a ramp at 14,0° E /
//    46,7° N, the zone mask on the real rzc grid (0 outside the country, 255 = ownership where no band runs, band < 5 %);
//    WITHOUT the switch byte-identical: MapView takes the ownership mask, `pickCompositeFrames` without the products
//    equals the pre-NC rule over the slider range, the stack and the point sampler gate on the flag
// E  pick by validity time: analysis at its own time, extrapolation frame nearest (± 3 min), nothing beyond; INCA refined
//    frame nearest, nothing before +15
// F  real data: the last rzc analyses and the newest INCA run — `--fixture <dir>` (rzc/<stamp>/{meta.json,frame.png,
//    g000.png}, inca/<stamp>/{meta.json,f015…f180.png}) or live from the data repo (raw.githubusercontent) — the whole
//    producer arithmetic re-run: 24 frames, unknown ⇒ 0, mass at +5 within 2 % of the analysis, no speckle at +120,
//    v1 and log plane share one wet mask, validity times, INCA 12 → 34 frames with the run's own bytes at every 15 min;
//    `--derived <dir>` additionally reads a slot pair written by `radar-derive.mjs` (corners = source, parsers accept)
//
// Call: npm run verify:radar-nc  (node … scripts/verify-radar-nc.mjs [--fixture <dir>] [--derived <dir>] [--offline])
// ---------------------------------------------------------------------------
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from './lib/png.mjs';
import {
  RADAR_NC_DEFAULT_ON, radarNcFlagFrom, radarNcBaseFrom, NC_STEP_MIN, RZC_NC_LEADS, INCA_5M_LEADS, RZC_NC_SERIES_MAX, RZC_NC_SERIES_MIN,
  RZC_NC_SERIES_SPAN_MS, NC_FLOW_FACTOR, NC_PICK_TOL_MS, RZC_NC_SOURCE, INCA_5M_SOURCE, rzcNcImgDir, inca5mImgDir, rzcNcUnknownFile,
  RZC_NC_LABEL, INCA_5M_LABEL, RZC_NC_CAVEATS, RZC_NC_UNKNOWN_WORD, NC_CROSSOVER_MIN, NC_CROSSOVER_BLEND_MIN, NC_CROSSOVER_PROVENANCE,
  makeRzcNcImgMeta, makeInca5mImgMeta, parseRzcNcImgMeta, parseInca5mImgMeta,
} from '../src/sources/radarNowcastImg.ts';
import { zeroFlow, flowFromSeries, motionStats, advectPlane, betweenPlanes } from '../src/sources/radarNowcastExtrap.ts';
import { estimateMorphFlow } from '../src/scalar/radarMorphFlow.ts';
import { RADAR_MORPH_HS } from '../src/scalar/radarHd.ts';
import { RADAR_HD_UNKNOWN_RAMP, RADAR_HD_CH_UNKNOWN_LAYER_ID, RADAR_HD_LAYER_IDS } from '../src/scalar/radarHd.ts';
import { PRECIP_VMAX, precipRainRamp } from '../src/scalar/RainLayer.ts';
import { RADAR_IMG_BASE, RADAR_CDN_BASE } from '../src/sources/radolanRuns.ts';
import { radarImgFrameFile, radarImgDualFile, makeRadarImgDual, parseRzcImgMeta, parseIncaImgMeta, RZC_IMG_WIDTH, RZC_IMG_HEIGHT, INCA_IMG_WIDTH, INCA_IMG_HEIGHT, radarImgStamp, radarImgStampToMs } from '../src/sources/radarImg.ts';
import { zoneWeights, zoneWeightsFor, zoneAt, zoneMaskForGrid, RADAR_ZONE_AT_RV_LNG_MAX, RADAR_ZONE_CH_RV_LAT_MIN, RADAR_ZONE_BLEND_DEG } from '../src/scalar/radarZones.ts';
import { countryMaskForGrid, fastCountryPicker, gridNodeFn, projectedSampler } from '../src/scalar/radarCountryMask.ts';
import { pickCompositeFrames, RV_MAX_H, INCA_MAX_H, RZC_MAX_H } from '../src/scalar/precipComposite.ts';

let passed = 0, failed = 0, skipped = 0;
const add = (name, ok, detail) => { if (ok) passed++; else failed++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const skip = (name, why) => { skipped++; console.log(`⊘ ${name} — ${why}`); };
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const FIXTURE = argOf('--fixture'), DERIVED = argOf('--derived'), OFFLINE = argv.includes('--offline');

const RZC_CORNERS = [[2.689419984817505, 49.3744010925293], [12.462300300598145, 49.36330032348633], [11.955599784851074, 43.61899948120117], [3.1687800884246826, 43.62900161743164]];
const INCA_CORNERS = [[8.090898567448969, 49.36722050753486], [17.749633984088593, 49.400784490264904], [17.436301138588583, 45.529428764230374], [8.462551055500136, 45.498222963663224]];

// ── A: switches and constants ────────────────────────────────────────────────
add('A1 OFF without any vote (rule 2, Jan\'s brief "ohne Schalter byte-gleich")', RADAR_NC_DEFAULT_ON === false && radarNcFlagFrom('', null) === false);
add('A2 `?nc=1` and the brief\'s `?chnc=1` switch it on', radarNcFlagFrom('?nc=1', null) === true && radarNcFlagFrom('?chnc=1', null) === true && radarNcFlagFrom('?x=1&chnc=1', '0') === true);
add('A3 `?nc=0` beats the stored value', radarNcFlagFrom('?nc=0', '1') === false && radarNcFlagFrom('?chnc=0', '1') === false);
add('A4 stored `radarnc` counts without a query vote', radarNcFlagFrom('', '1') === true && radarNcFlagFrom('', '0') === false);
add('A5 unknown word or broken query = no vote (store, else default)', radarNcFlagFrom('?nc=foo', '1') === true && radarNcFlagFrom('?nc=foo', null) === RADAR_NC_DEFAULT_ON && radarNcFlagFrom('%E0%A4%A', null) === RADAR_NC_DEFAULT_ON);
add('A6 `?ncbase=` takes an http(s) or root-relative base without trailing slash, else the mirror base',
  radarNcBaseFrom('?ncbase=/nc-test/') === '/nc-test' && radarNcBaseFrom('?ncbase=http://127.0.0.1:8080/x') === 'http://127.0.0.1:8080/x'
  && radarNcBaseFrom('?ncbase=ftp://x') === RADAR_IMG_BASE && radarNcBaseFrom('') === RADAR_IMG_BASE && RADAR_IMG_BASE.startsWith(RADAR_CDN_BASE)
  && rzcNcImgDir('20261028T1015', '/nc-test') === `/nc-test/${RZC_NC_SOURCE}/20261028T1015` && inca5mImgDir('20261028T1000') === `${RADAR_IMG_BASE}/${INCA_5M_SOURCE}/20261028T1000`);
add('A7 leads: CH 24 × 5 min (5 … 120), AT 34 × 5 min (15 … 180), series 3 … 6 analyses within 30 min, factor 4 like the morph',
  NC_STEP_MIN === 5 && RZC_NC_LEADS.length === 24 && RZC_NC_LEADS[0] === 5 && RZC_NC_LEADS[23] === 120 && RZC_NC_LEADS.every((l, i) => l === (i + 1) * 5)
  && INCA_5M_LEADS.length === 34 && INCA_5M_LEADS[0] === 15 && INCA_5M_LEADS[33] === 180 && INCA_5M_LEADS.filter((l) => l % 15 === 0).length === 12
  && RZC_NC_SERIES_MAX === 6 && RZC_NC_SERIES_MIN === 3 && RZC_NC_SERIES_SPAN_MS === 30 * 60_000 && NC_FLOW_FACTOR.rzc === 4 && NC_FLOW_FACTOR.inca === 4 && NC_PICK_TOL_MS === 3 * 60_000);
add('A8 crossover: DWD-RV 120 (measured, unchanged), INCA 120 and CH extrapolation 60 (set, V-NC-1), ramp 30 min',
  NC_CROSSOVER_MIN.radolan_rv === 120 && NC_CROSSOVER_MIN.inca_grid === 120 && NC_CROSSOVER_MIN.meteoswiss_rzc === 60 && NC_CROSSOVER_BLEND_MIN === 30
  && NC_CROSSOVER_PROVENANCE.radolan_rv === 'measured' && NC_CROSSOVER_PROVENANCE.inca_grid === 'set' && NC_CROSSOVER_PROVENANCE.meteoswiss_rzc === 'set');
add('A9 honest words: the labels name the method and the source, the caveats name the three weaknesses, grey = unknown',
  RZC_NC_LABEL === 'Hochrechnung buscosun aus MeteoSwiss-Radar' && INCA_5M_LABEL === 'INCA-Nowcast · auf 5 min verfeinert'
  && RZC_NC_CAVEATS.length === 3 && /Stauniederschlag/.test(RZC_NC_CAVEATS[0]) && /abgeschattete Täler/.test(RZC_NC_CAVEATS[1]) && /kurzlebige Schauer/.test(RZC_NC_CAVEATS[2])
  && /^grau = unbekannt/.test(RZC_NC_UNKNOWN_WORD));

// ── B: meta schema and colour contract ───────────────────────────────────────
const stamp = '20261028T1015', aMs = radarImgStampToMs(stamp);
const rows = RZC_NC_LEADS.map((lead) => ({ lead, file: radarImgFrameFile(lead), bytes: 100, validAtMs: aMs + lead * 60_000 }));
const urows = RZC_NC_LEADS.map((lead) => ({ lead, file: rzcNcUnknownFile(lead), bytes: 50 }));
const method = { flow: 'horn-schunck', factor: 4, alpha: RADAR_MORPH_HS.alpha, iters: RADAR_MORPH_HS.iters, sampling: 'wet-bilinear-round' };
const motion = { speedKmh: 12.3, fromDeg: 250, pairs: 5, wetCells: 400 };
const rzcMeta = makeRzcNcImgMeta({ stamp, analysisAtMs: aMs, corners: RZC_CORNERS, frames: rows, unknown: urows, series: ['20261028T0950', '20261028T0955', '20261028T1000', '20261028T1005', '20261028T1010', stamp], motion, method, dual: makeRadarImgDual(RZC_NC_LEADS.map((lead) => ({ lead, file: radarImgDualFile(lead), bytes: 120 }))) });
const rt = (m) => JSON.parse(JSON.stringify(m));
add('B1 rzc-nc: the producer\'s meta passes the client\'s parser (with dual), vMax = PRECIP_VMAX, 710 × 640, label and caveats carried',
  !!parseRzcNcImgMeta(rt(rzcMeta)) && rzcMeta.vMax === PRECIP_VMAX && rzcMeta.width === RZC_IMG_WIDTH && rzcMeta.height === RZC_IMG_HEIGHT && rzcMeta.label === RZC_NC_LABEL && rzcMeta.caveats.length === 3);
add('B2 rzc-nc: drift rejected — vMax, 23 frames, a foreign unknown file, series not ending at the stamp, motion out of range, dual with 23 rows',
  parseRzcNcImgMeta({ ...rt(rzcMeta), vMax: 30 }) === null
  && parseRzcNcImgMeta({ ...rt(rzcMeta), frames: rows.slice(0, 23) }) === null
  && parseRzcNcImgMeta({ ...rt(rzcMeta), unknown: urows.map((u, i) => (i === 3 ? { ...u, file: 'f020.png' } : u)) }) === null
  && parseRzcNcImgMeta({ ...rt(rzcMeta), series: ['20261028T1010'] }) === null
  && parseRzcNcImgMeta({ ...rt(rzcMeta), motion: { ...motion, fromDeg: 360 } }) === null
  && parseRzcNcImgMeta({ ...rt(rzcMeta), dual: { log: rzcMeta.dual.log, frames: rzcMeta.dual.frames.slice(0, 23) } }) === null);
const refMs = radarImgStampToMs('20261028T1000');
const irows = INCA_5M_LEADS.map((lead) => ({ lead, file: radarImgFrameFile(lead), bytes: 80, validAtMs: refMs + lead * 60_000, kind: lead % 15 === 0 ? 'inca' : 'between' }));
const incaMeta = makeInca5mImgMeta({ stamp: '20261028T1000', refAtMs: refMs, corners: INCA_CORNERS, frames: irows, method: { ...method, between: 'advect-both-round' } });
add('B3 inca-5m: 34 rows pass, validity = reftime + lead, kinds inca/between; a run with fewer frames passes (V-RL-2)',
  !!parseInca5mImgMeta(rt(incaMeta)) && incaMeta.vMax === PRECIP_VMAX && incaMeta.width === INCA_IMG_WIDTH && incaMeta.height === INCA_IMG_HEIGHT && incaMeta.label === INCA_5M_LABEL
  && !!parseInca5mImgMeta({ ...rt(incaMeta), frames: irows.slice(0, 7) }));
add('B4 inca-5m: drift rejected — validity off by a minute, an INCA frame at +20, a lead off the 5-min raster, descending leads, lead 10',
  parseInca5mImgMeta({ ...rt(incaMeta), frames: irows.map((f, i) => (i === 1 ? { ...f, validAtMs: f.validAtMs + 60_000 } : f)) }) === null
  && parseInca5mImgMeta({ ...rt(incaMeta), frames: irows.map((f) => (f.lead === 20 ? { ...f, kind: 'inca' } : f)) }) === null
  && parseInca5mImgMeta({ ...rt(incaMeta), frames: [{ ...irows[0], lead: 17, file: 'f017.png', validAtMs: refMs + 17 * 60_000 }] }) === null
  && parseInca5mImgMeta({ ...rt(incaMeta), frames: [irows[1], irows[0]] }) === null
  && parseInca5mImgMeta({ ...rt(incaMeta), frames: [{ ...irows[0], lead: 10, file: 'f010.png', validAtMs: refMs + 10 * 60_000, kind: 'between' }] }) === null);
{
  const mv = readFileSync(new URL('../src/MapView.tsx', import.meta.url), 'utf8');
  const rainIds = [...Object.values(RADAR_HD_LAYER_IDS)];
  const hdRamps = rainIds.every((id) => new RegExp(`id: RADAR_HD_LAYER_IDS\\.${id.slice(-2).toUpperCase()}, colorRamp: precipRainRamp,`).test(mv));
  const composite = /id: NOWCAST_LAYER_ID, colorRamp: precipRainRamp,/.test(mv);
  const swap = /layer\.setColorRamp\(log \? precipRainRampLog : precipRainRamp\)/.test(mv);
  const ramps = [...mv.matchAll(/colorRamp: (\w+)/g)].map((m) => m[1]);
  const foreign = ramps.filter((r) => /rain|precip/i.test(r) && !['precipRainRamp', 'precipRainRampLog', 'precipRamp'].includes(r));
  add('B5 one colour contract: composite and the three HD layers draw `precipRainRamp` (log plane: `precipRainRampLog`), no other rain ramp in MapView; the products carry the same vMax',
    hdRamps && composite && swap && foreign.length === 0 && rzcMeta.vMax === incaMeta.vMax && Object.keys(precipRainRamp).length >= 10, `ramps: ${[...new Set(ramps)].join(', ')}`);
  const veil = new RegExp(`id: RADAR_HD_CH_UNKNOWN_LAYER_ID, colorRamp: RADAR_HD_UNKNOWN_RAMP`).test(mv);
  const g = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(RADAR_HD_UNKNOWN_RAMP[1]);
  add('B6 the unknown veil is its own layer with a GREY ramp (r = g = b, transparent at 0) — never a rain colour',
    veil && RADAR_HD_CH_UNKNOWN_LAYER_ID !== RADAR_HD_LAYER_IDS.CH && RADAR_HD_UNKNOWN_RAMP[0] === 'rgba(0,0,0,0)' && !!g && g[1] === g[2] && g[2] === g[3] && Number(g[4]) > 0 && Number(g[4]) < 0.5);
}

// ── C: arithmetic on synthetic planes ────────────────────────────────────────
const W = 64, H = 48, F = 4;
const plane = new Uint8Array(W * H);
for (let y = 16; y < 28; y++) for (let x = 20; x < 36; x++) plane[y * W + x] = 40 + ((x + y) % 7) * 9;   // block, bytes 40 … 94
const cst = (u, v) => { const f = zeroFlow(W, H, F); f.u.fill(u); f.v.fill(v); return f; };
{
  const out = new Uint8Array(W * H), unk = new Uint8Array(W * H);
  const n = advectPlane(plane, W, H, zeroFlow(W, H, F), 7, out, unk);
  add('C1 zero flow: the advected plane is byte-identical to the input at any k, nothing unknown', same(out, plane) && n === 0 && unk.every((u) => u === 0));
}
{
  const out = new Uint8Array(W * H), unk = new Uint8Array(W * H);
  const n = advectPlane(plane, W, H, cst(1, 0), 3, out, unk);
  const shifted = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 3; x < W; x++) shifted[y * W + x] = plane[y * W + x - 3];
  let unkCols = true; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((unk[y * W + x] === 255) !== (x < 3)) unkCols = false;
  add('C2 constant flow 1 texel/step east, k = 3: the block moves exactly 3 px, the 3 western columns are UNKNOWN with value 0 (never "dry")',
    same(out, shifted) && n === 3 * H && unkCols && out.slice(0, 3).every((v) => v === 0));
}
{
  // random plane and random sub-texel flow: wet-bilinear-round never invents a byte below the smallest wet neighbour
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const p = new Uint8Array(W * H); for (let i = 0; i < p.length; i++) p[i] = rnd() < 0.3 ? 30 + Math.floor(rnd() * 200) : 0;
  const f = zeroFlow(W, H, F); for (let i = 0; i < f.u.length; i++) { f.u[i] = (rnd() - 0.5) * 1.6; f.v[i] = (rnd() - 0.5) * 1.6; }
  const out = new Uint8Array(W * H); advectPlane(p, W, H, f, 1, out);
  let bad = 0, wetIn = 0, wetOut = 0;
  for (let i = 0; i < out.length; i++) { if (p[i]) wetIn++; if (out[i]) { wetOut++; if (out[i] < 30 || out[i] > 229) bad++; } }
  add('C3 wet-bilinear-round: every wet output byte lies within the range of the wet input bytes (no invented light rain at edges), wet share stays within ±15 %',
    bad === 0 && Math.abs(wetOut - wetIn) / wetIn < 0.15, `wet ${wetIn} → ${wetOut}`);
}
{
  const b = new Uint8Array(W * H); for (let i = 0; i < b.length; i++) b[i] = plane[i] ? Math.min(255, plane[i] + 60) : 0;
  const o0 = new Uint8Array(W * H), o1 = new Uint8Array(W * H), oh = new Uint8Array(W * H);
  betweenPlanes(plane, b, W, H, zeroFlow(W, H, F), 0, o0); betweenPlanes(plane, b, W, H, zeroFlow(W, H, F), 1, o1); betweenPlanes(plane, b, W, H, zeroFlow(W, H, F), 0.5, oh);
  let mid = true; for (let i = 0; i < oh.length; i++) if (plane[i] && Math.abs(oh[i] - (plane[i] + b[i]) / 2) > 1) mid = false;
  add('C4 between frames: frac 0 = A, frac 1 = B byte for byte (zero flow); frac ½ = the mean where both are wet', same(o0, plane) && same(o1, b) && mid);
}
{
  const east = motionStats(cst(2, 0), plane, W, H, 5, 3), south = motionStats(cst(0, 2), plane, W, H, 5, 3), none = motionStats(cst(0, 0), new Uint8Array(W * H), W, H, 5, 0);
  add('C5 motion statistics: 2 texel/step east = 24 km/h FROM 270°, 2 texel/step south = FROM 0° (north-up grid), no wet cell ⇒ no direction',
    east.speedKmh === 24 && east.fromDeg === 270 && south.speedKmh === 24 && south.fromDeg === 0 && none.fromDeg === null && none.wetCells === 0 && east.pairs === 3);
}
{
  // a plane translated 1 px/step east over 4 frames: the series flow over the wet cells is ≈ +1 texel/step east, the dry pair is skipped
  const frames = [0, 1, 2, 3].map((k) => { const p = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) { const x = i % W; if (x - k >= 0 && plane[i - k]) p[i] = plane[i - k]; } return p; });
  const { flow, pairs } = flowFromSeries(frames, W, H, F);
  const m = motionStats(flow, frames[3], W, H, 5, pairs);
  const withDry = flowFromSeries([new Uint8Array(W * H), ...frames], W, H, F);
  // V-NC-7: the Horn–Schunck field gave 6,1 km/h here and a centroid that stalled after a few steps; the translation must
  // recover speed AND carry the echo the whole way (k = 12 steps ⇒ +12 px)
  const out = new Uint8Array(W * H); advectPlane(frames[3], W, H, flow, 12, out);
  const cen = (p) => { let s = 0, n = 0; for (let i = 0; i < p.length; i++) if (p[i]) { s += i % W; n++; } return s / n; };
  const moved = cen(out) - cen(frames[3]);
  add('C6 series flow of a plane moving 1 px/step east: 3 pairs, FROM 270° ± 5°, speed 12 km/h ± 10 %, the echo travels +12 px ± 1 after 12 steps (no stall, V-NC-7); a dry frame adds no pair',
    pairs === 3 && m.fromDeg !== null && Math.abs(m.fromDeg - 270) <= 5 && Math.abs(m.speedKmh - 12) <= 1.2 && Math.abs(moved - 12) <= 1 && withDry.pairs === 3, `${m.speedKmh} km/h aus ${m.fromDeg}° · Schwerpunkt +${moved.toFixed(1)} px`);
  // a wide Gaussian band at 4 px/step (48 km/h): speed within 5 %, centroid after 24 steps +96 px ± 3
  const gb = (cx) => { const p = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = Math.exp(-((x - cx) ** 2) / 72 - ((y - 24) ** 2) / 200); if (v > 0.1) p[y * W + x] = Math.round(20 + 200 * v); } return p; };
  const W2 = W, big = [0, 1, 2, 3].map((k) => gb(16 + 4 * k));
  const r2 = flowFromSeries(big, W2, H, F);
  const m2 = motionStats(r2.flow, big[3], W2, H, 5, r2.pairs);
  add('C7 a Gaussian band at 4 px/step (48 km/h): 3 pairs, 48 km/h ± 5 %, FROM 270°', r2.pairs === 3 && Math.abs(m2.speedKmh - 48) <= 2.4 && m2.fromDeg === 270, `${m2.speedKmh} km/h aus ${m2.fromDeg}°`);
}

// ── D: zones, and byte-identity without the switch ──────────────────────────
{
  let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let bad = 0;
  for (let i = 0; i < 5000; i++) { const w = zoneWeights(45.5 + rnd() * 10, 5 + rnd() * 13); if (Math.abs(w.rv + w.inca + w.rzc - 1) > 1e-9 || w.rv < 0 || w.inca < 0 || w.rzc < 0) bad++; }
  add('D1 the three weights add up to 1 and are never negative (5 000 random DACH points)', bad === 0);
  const P = { Lugano: [46.0, 8.95], Sion: [46.23, 7.36], StMoritz: [46.5, 9.84], Zürich: [47.37, 8.54], Bern: [46.95, 7.45], Basel: [47.56, 7.59], Chur: [46.85, 9.53],
    Wien: [48.21, 16.37], Graz: [47.07, 15.44], Linz: [48.31, 14.29], Klagenfurt: [46.62, 14.31], Innsbruck: [47.27, 11.39], Salzburg: [47.8, 13.04], Bregenz: [47.5, 9.75], München: [48.14, 11.58], Hamburg: [53.55, 10.0] };
  const z = Object.fromEntries(Object.entries(P).map(([k, [la, lo]]) => [k, zoneWeights(la, lo)]));
  add('D2 named places: Lugano/Sion/St. Moritz = rzc 1; Zürich/Bern/Basel/Chur = rv 1; Wien/Graz/Linz/Klagenfurt = inca 1; Innsbruck/Salzburg/Bregenz/München/Hamburg = rv 1',
    ['Lugano', 'Sion', 'StMoritz'].every((k) => z[k].rzc === 1) && ['Zürich', 'Bern', 'Basel', 'Chur'].every((k) => z[k].rv === 1)
    && ['Wien', 'Graz', 'Linz', 'Klagenfurt'].every((k) => z[k].inca === 1) && ['Innsbruck', 'Salzburg', 'Bregenz', 'München', 'Hamburg'].every((k) => z[k].rv === 1));
  const il = zoneWeights(46.686, 7.863), at14 = zoneWeightsFor('AT', 47.3, RADAR_ZONE_AT_RV_LNG_MAX), ch467 = zoneWeightsFor('CH', RADAR_ZONE_CH_RV_LAT_MIN, 8.0);
  // a hair beyond the half width (the ramp ends exactly there; 14,0 − 0,2 is not exactly representable)
  const wAt = zoneWeightsFor('AT', 47.3, RADAR_ZONE_AT_RV_LNG_MAX - RADAR_ZONE_BLEND_DEG.lng - 1e-9), eAt = zoneWeightsFor('AT', 47.3, RADAR_ZONE_AT_RV_LNG_MAX + RADAR_ZONE_BLEND_DEG.lng + 1e-9);
  add('D3 the band: Interlaken shares rv and rzc, 14,0° E in AT = 0,5 / 0,5, 46,7° N in CH = 0,5 / 0,5, ± the half width ends the ramp (1 / 0), ≈ ± 15 km',
    il.rv > 0 && il.rzc > 0 && at14.rv === 0.5 && at14.inca === 0.5 && ch467.rv === 0.5 && ch467.rzc === 0.5 && wAt.rv === 1 && eAt.inca === 1
    && Math.abs(RADAR_ZONE_BLEND_DEG.lng * 111 * Math.cos(47 * Math.PI / 180) - 15) < 1.5 && Math.abs(RADAR_ZONE_BLEND_DEG.lat * 111 - 15) < 1);
  add('D4 `zoneAt` names the product with the largest weight', zoneAt(46.0, 8.95) === 'rzc' && zoneAt(47.37, 8.54) === 'rv' && zoneAt(48.21, 16.37) === 'inca' && zoneAt(47.27, 11.39) === 'rv');
}
{
  const cols = RZC_IMG_WIDTH, rows = RZC_IMG_HEIGHT;
  const zone = zoneMaskForGrid('rzc', RZC_CORNERS, cols, rows), own = countryMaskForGrid('rzc', RZC_CORNERS, cols, rows);
  let outside = 0, band = 0, full = 0, zeroInside = 0, mismatch = 0;
  for (let i = 0; i < zone.length; i++) {
    if (!own[i]) { if (zone[i]) outside++; continue; }
    if (zone[i] === 255) full++; else if (zone[i] === 0) zeroInside++; else band++;
  }
  // south of the band every CH pixel is 255 (= ownership), north of it 0 — checked on a column through Bern (lng ≈ 7,45)
  const pick = fastCountryPicker();
  // the pixel centres on the real LV95 grid (the same projection the mask uses — a bilinear guess over the corners is off by up to 0,1°)
  const at = projectedSampler(gridNodeFn('rzc', RZC_CORNERS));
  for (let r = 0; r < rows; r += 7) for (let c = 0; c < cols; c += 7) {
    const [lon, lat] = at((c + 0.5) / cols, (r + 0.5) / rows);
    if (pick(lat, lon) !== 'CH') continue;
    const i = r * cols + c;
    if (lat < RADAR_ZONE_CH_RV_LAT_MIN - RADAR_ZONE_BLEND_DEG.lat - 0.05 && zone[i] !== 255) mismatch++;
    if (lat > RADAR_ZONE_CH_RV_LAT_MIN + RADAR_ZONE_BLEND_DEG.lat + 0.05 && zone[i] !== 0) mismatch++;
  }
  // ± 15 km of band across ≈ 220 km of CH north–south: ≈ 5 % of the CH pixels (measured 5,1 % — 11 470 of 224 048)
  add('D5 zone mask on the real rzc grid: 0 wherever the ownership mask is 0, 255 south of the band (= ownership), 0 north of it (RV draws there), the band 3 … 8 % of CH',
    outside === 0 && mismatch === 0 && band > 0 && band / (full + band + zeroInside) > 0.03 && band / (full + band + zeroInside) < 0.08 && zeroInside > 0 && full > 0,
    `full ${full} · band ${band} · north ${zeroInside} · outside ${outside} · mismatch ${mismatch}`);
  const zm = zoneMaskForGrid('radolan', [[3.0889, 55.8621], [18.7639, 55.8445], [16.6002, 45.6846], [4.6759, 45.6962]], 110, 120);
  add('D6 negative control: the RV grid\'s zone mask differs from its ownership mask only in AT/CH (ownership 255 ⇒ zone 255 everywhere in DE)', (() => {
    const om = countryMaskForGrid('radolan', [[3.0889, 55.8621], [18.7639, 55.8445], [16.6002, 45.6846], [4.6759, 45.6962]], 110, 120);
    let extra = 0, lost = 0; for (let i = 0; i < zm.length; i++) { if (zm[i] && !om[i]) extra++; if (!zm[i] && om[i]) lost++; }
    return extra > 0 && lost === 0;   // RV gains the north of CH / west of AT and loses nothing of DE
  })());
}
{
  const mv = readFileSync(new URL('../src/MapView.tsx', import.meta.url), 'utf8');
  const rf = readFileSync(new URL('../src/radar/radarFrames.ts', import.meta.url), 'utf8');
  const nc = readFileSync(new URL('../src/nowcast/radarNowcastNc.ts', import.meta.url), 'utf8');
  const rn = readFileSync(new URL('../src/sources/radarNowcast.ts', import.meta.url), 'utf8');
  add('D7 without the switch byte-identical: MapView takes the ownership mask (`ncRef.current ? zoneMaskOffMain : countryMaskOffMain`), the readers answer null (`radarNcFlagFrom()` in `cdnOk`), the point sampler falls through',
    /ncRef\.current \? zoneMaskOffMain : countryMaskOffMain/.test(mv) && /const cdnOk = \(\) => radarNcFlagFrom\(\)/.test(rn) && /if \(ncOn && country === 'AT'\)/.test(nc) && /if \(ncOn && country === 'CH'\)/.test(nc)
    && /fetchRzcNowcast\(/.test(rf) && /fetchInca5m\(/.test(rf));
  // pickCompositeFrames without the products = the rule before Phase NC over the slider range
  const now = Date.UTC(2026, 9, 28, 10, 20);
  const mk = (n) => { const v = new Uint8Array(4); v[0] = n; return v; };
  const rv = { runAt: new Date(now), corners: RZC_CORNERS, frames: [0, 5, 10, 60, 120].map((l) => ({ leadMinutes: l, values: mk(l + 1), width: 2, height: 2 })) };
  const inca = { corners: INCA_CORNERS, frames: [0.25, 0.5, 1, 2, 3].map((h) => ({ leadHours: h, values: mk(Math.round(h * 10)), width: 2, height: 2 })) };
  const rzc = { values: mk(99), width: 2, height: 2, corners: RZC_CORNERS, validAt: new Date(now) };
  const nearest = (arr, f) => arr.reduce((b, x) => (f(x) < f(b) ? x : b));
  let agree = true;
  for (const h of [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5]) {
    const p = pickCompositeFrames(h, { rv, inca, rzc }, now);
    const eRv = h <= RV_MAX_H + 1e-6 ? nearest(rv.frames, (f) => Math.abs(f.leadMinutes - h * 60)) : null;
    const eInca = h <= INCA_MAX_H + 1e-6 ? nearest(inca.frames, (f) => Math.abs(f.leadHours - h)) : null;
    const eRzc = h < RZC_MAX_H ? rzc : null;
    if (p.rv !== eRv || p.inca !== eInca || p.rzc !== eRzc) agree = false;
  }
  add('D8 without the products `pickCompositeFrames` = the rule before Phase NC (RV by lead ≤ 2 h, INCA by lead ≤ 3 h, CH analysis < 0,5 h) over the slider range', agree);
}

// ── E: pick by validity time ─────────────────────────────────────────────────
{
  const now = Date.UTC(2026, 9, 28, 10, 20);
  const mk = (n) => { const v = new Uint8Array(4); v[0] = n; return v; };
  const rzc = { values: mk(99), width: 2, height: 2, corners: RZC_CORNERS, validAt: new Date(now) };
  const ncFrames = RZC_NC_LEADS.map((l) => ({ leadMinutes: l, validAt: new Date(now + l * 60_000), values: mk(l), unknown: mk(l === 60 ? 255 : 0), width: 2, height: 2 }));
  const rzcNc = { stamp, analysisAt: new Date(now), corners: RZC_CORNERS, frames: ncFrames, motion, series: [stamp], caveats: [], label: RZC_NC_LABEL };
  const at = (min) => pickCompositeFrames(min / 60, { rzc, rzcNc }, now).rzc;
  add('E1 CH by validity: at the analysis time the ANALYSIS (measured wins), +4 min ⇒ the +5 frame, +60 ⇒ the +60 frame with its unknown mask and lead, +125 ⇒ nothing, −10 ⇒ nothing',
    at(0) === rzc && at(2) === rzc && at(4)?.values === ncFrames[0].values && at(60)?.leadMinutes === 60 && at(60)?.unknown?.[0] === 255 && at(60)?.corners === RZC_CORNERS && at(125) === null && at(-10) === null);
  const ref = now - 25 * 60_000;
  const i5 = { stamp: '20261028T0955', refAt: new Date(ref), corners: INCA_CORNERS, frames: INCA_5M_LEADS.map((l) => ({ leadMinutes: l, validAt: new Date(ref + l * 60_000), kind: l % 15 === 0 ? 'inca' : 'between', values: mk(l), width: 2, height: 2 })), label: INCA_5M_LABEL, note: '' };
  const atI = (min) => pickCompositeFrames(min / 60, { inca5: i5 }, now).inca;
  // now = ref + 25 ⇒ "now" is the +25 between frame; +10 min from now = the +35 frame; ref + 10 (now − 15) ⇒ nothing (first frame is +15)
  add('E2 AT by validity: "now" = the refined frame valid nearest to now (+25 of the run), +10 min ⇒ +35, before the run\'s first frame ⇒ nothing, beyond +180 ⇒ nothing',
    atI(0)?.leadHours === 25 / 60 && atI(10)?.leadHours === 35 / 60 && atI(-15) === null && atI(160) === null && atI(155)?.leadHours === 3);
}

// ── F: real data ─────────────────────────────────────────────────────────────
async function loadSeries() {
  const readSlot = (dir, s) => {
    const meta = parseRzcImgMeta(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')));
    if (!meta) throw new Error(`${s}: meta`);
    const f = decodePng(readFileSync(join(dir, 'frame.png')));
    const gFile = meta.dual?.frames[0]?.file;
    let values2;
    if (gFile && existsSync(join(dir, gFile))) { const g = decodePng(readFileSync(join(dir, gFile))); values2 = new Uint8Array(f.width * f.height); for (let i = 0; i < values2.length; i++) values2[i] = g.data[i * 2 + 1]; }
    return { stamp: s, meta, values: f.data, values2, width: f.width, height: f.height };
  };
  if (FIXTURE) {
    const root = join(FIXTURE, 'rzc');
    const slots = readdirSync(root).filter((d) => /^\d{8}T\d{4}$/.test(d)).sort().slice(-RZC_NC_SERIES_MAX);
    return { slots: slots.map((s) => readSlot(join(root, s), s)), source: `fixture ${root}` };
  }
  if (OFFLINE) return null;
  const raw = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/radar/img/v1/rzc';
  const newest = Math.floor((Date.now() - 8 * 60_000) / (5 * 60_000)) * 5 * 60_000;
  const slots = [];
  for (let k = 0; k < 10 && slots.length < RZC_NC_SERIES_MAX; k++) {
    const s = radarImgStamp(newest - k * 5 * 60_000);
    const get = async (f) => { const r = await fetch(`${raw}/${s}/${f}`); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };
    const m = await get('meta.json'); if (!m) continue;
    const meta = parseRzcImgMeta(JSON.parse(m.toString('utf8'))); if (!meta) continue;
    const fp = await get('frame.png'); if (!fp) continue;
    const f = decodePng(fp);
    let values2; const gFile = meta.dual?.frames[0]?.file;
    if (gFile) { const gp = await get(gFile); if (gp) { const g = decodePng(gp); values2 = new Uint8Array(f.width * f.height); for (let i = 0; i < values2.length; i++) values2[i] = g.data[i * 2 + 1]; } }
    slots.unshift({ stamp: s, meta, values: f.data, values2, width: f.width, height: f.height });
  }
  return { slots, source: 'live data repo' };
}
async function loadInca() {
  const readSlot = (dir, s) => {
    const meta = parseIncaImgMeta(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')));
    if (!meta) throw new Error(`${s}: meta`);
    return { stamp: s, meta, frames: meta.frames.map((f) => ({ lead: f.lead, values: decodePng(readFileSync(join(dir, f.file))).data })) };
  };
  if (FIXTURE) {
    const root = join(FIXTURE, 'inca');
    const slots = readdirSync(root).filter((d) => /^\d{8}T\d{4}$/.test(d)).sort();
    return slots.length ? readSlot(join(root, slots[slots.length - 1]), slots[slots.length - 1]) : null;
  }
  if (OFFLINE) return null;
  const raw = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/radar/img/v1/inca';
  const newest = Math.floor((Date.now() - 28 * 60_000) / (15 * 60_000)) * 15 * 60_000;
  for (let k = 0; k < 3; k++) {
    const s = radarImgStamp(newest - k * 15 * 60_000);
    const r = await fetch(`${raw}/${s}/meta.json`); if (!r.ok) continue;
    const meta = parseIncaImgMeta(await r.json()); if (!meta) continue;
    const frames = [];
    for (const f of meta.frames) { const p = await fetch(`${raw}/${s}/${f.file}`); if (!p.ok) break; frames.push({ lead: f.lead, values: decodePng(Buffer.from(await p.arrayBuffer())).data }); }
    if (frames.length === meta.frames.length) return { stamp: s, meta, frames };
  }
  return null;
}
const clusters = (a, w) => { const seen = new Uint8Array(a.length); const sizes = []; for (let i0 = 0; i0 < a.length; i0++) { if (!a[i0] || seen[i0]) continue; const st = [i0]; seen[i0] = 1; let n = 0; while (st.length) { const i = st.pop(); n++; const x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) { if (j < 0 || j >= a.length || seen[j] || !a[j]) continue; seen[j] = 1; st.push(j); } } sizes.push(n); } return sizes; };

let series = null, inca = null;
try { series = await loadSeries(); inca = await loadInca(); } catch (e) { console.log(`   (real data: ${e.message})`); }
if (!series || series.slots.length < 2) {
  skip('F real data', OFFLINE ? '--offline' : 'no rzc series reachable (pass --fixture <dir> or go online)');
} else {
  const { slots, source } = series;
  const newest = slots[slots.length - 1];
  const { width: w, height: h } = newest;
  const spanOk = slots.every((s) => radarImgStampToMs(newest.stamp) - radarImgStampToMs(s.stamp) <= RZC_NC_SERIES_SPAN_MS) && slots.every((s) => s.width === w && s.height === h);
  add(`F1 series (${source}): ${slots.length} analyses within 30 min on one 710 × 640 grid, metas pass the client's parser, newest ${newest.stamp}`, spanOk && w === RZC_IMG_WIDTH && h === RZC_IMG_HEIGHT && slots.length >= 2);
  const { flow, pairs } = flowFromSeries(slots.map((s) => s.values), w, h, NC_FLOW_FACTOR.rzc);
  const m = motionStats(flow, newest.values, w, h, NC_STEP_MIN, pairs);
  const wetAna = newest.values.reduce((n, v) => n + (v ? 1 : 0), 0);
  add(`F2 motion: finite, ${m.speedKmh} km/h aus ${m.fromDeg ?? '—'}° over ${m.wetCells} wet coarse cells (${pairs} pairs); dry series ⇒ 0 pairs`, Number.isFinite(m.speedKmh) && m.speedKmh < 150 && (wetAna === 0 ? pairs === 0 : true));
  const out = new Uint8Array(w * h), unk = new Uint8Array(w * h), out2 = newest.values2 ? new Uint8Array(w * h) : null;
  let unknownWet = 0, maskDiff = 0, massOk = true, speckleOk = true, keepOk = true, detail = [];
  const sumAna = newest.values.reduce((n, v) => n + v, 0);
  const anaSingles = clusters(newest.values, w).filter((n) => n === 1).length;
  for (const lead of RZC_NC_LEADS) {
    const k = lead / NC_STEP_MIN;
    const nU = advectPlane(newest.values, w, h, flow, k, out, unk);
    for (let i = 0; i < out.length; i++) if (unk[i] === 255 && out[i]) unknownWet++;
    if (out2) { advectPlane(newest.values2, w, h, flow, k, out2); for (let i = 0; i < out.length; i++) if ((out[i] > 0) !== (out2[i] > 0)) maskDiff++; }
    let wet = 0, sum = 0; for (let i = 0; i < out.length; i++) if (out[i]) { wet++; sum += out[i]; }
    if (lead === 5 && wetAna > 1000 && nU < 0.01 * w * h && Math.abs(sum - sumAna) / sumAna > 0.02) massOk = false;
    if (lead === 120 && wetAna > 1000 && wet < 0.8 * (wetAna - nU)) keepOk = false;
    if (lead === 120) { const s = clusters(out, w).filter((n) => n === 1).length; if (s > anaSingles + 10 + 0.05 * anaSingles) speckleOk = false; detail.push(`singletons ${anaSingles} → ${s}`); }
    if (lead === 5 || lead === 120) detail.push(`+${lead}: wet ${wet} sum ${sum} unknown ${nU}`);
  }
  add(`F3 24 advections: an UNKNOWN pixel never carries a value (${unknownWet} violations), v1 and log plane share one wet mask (${maskDiff} differences)`, unknownWet === 0 && maskDiff === 0);
  add(`F4 mass at +5 within 2 % of the analysis (wet ${wetAna}, sum ${sumAna}), ≥ 80 % of the wet pixels kept at +120 (minus unknown), no speckle invented`, massOk && keepOk && speckleOk, detail.join(' · '));
  const metaRows = RZC_NC_LEADS.map((lead) => ({ lead, file: radarImgFrameFile(lead), bytes: 1, validAtMs: (newest.meta.validAtMs ?? radarImgStampToMs(newest.stamp)) + lead * 60_000 }));
  const meta = makeRzcNcImgMeta({ stamp: newest.stamp, analysisAtMs: newest.meta.validAtMs ?? radarImgStampToMs(newest.stamp), corners: newest.meta.corners, frames: metaRows, unknown: RZC_NC_LEADS.map((lead) => ({ lead, file: rzcNcUnknownFile(lead), bytes: 1 })), series: slots.map((s) => s.stamp), motion: m, method: { flow: 'horn-schunck', factor: NC_FLOW_FACTOR.rzc, alpha: RADAR_MORPH_HS.alpha, iters: RADAR_MORPH_HS.iters, sampling: 'wet-bilinear-round' } });
  const p = parseRzcNcImgMeta(rt(meta));
  add('F5 the product meta built from the real series passes the parser; validity = analysis + lead; corners = the analysis\'s corners (same georeference by construction)',
    !!p && p.frames.every((f, i) => f.validAtMs === p.analysisAtMs + RZC_NC_LEADS[i] * 60_000) && JSON.stringify(p.corners) === JSON.stringify(newest.meta.corners) && p.series[p.series.length - 1] === newest.stamp);
  if (!inca) skip('F6 INCA refined', 'no INCA run reachable');
  else {
    const { width: iw, height: ih } = inca.meta;
    const src = inca.frames;
    const refined = [];
    const buf = new Uint8Array(iw * ih);
    let pairsI = 0, betweenOk = true, sameOk = true;
    for (let i = 0; i < src.length; i++) {
      refined.push({ lead: src[i].lead, kind: 'inca', values: src[i].values });
      const b = src[i + 1]; if (!b || b.lead - src[i].lead !== 15) continue;
      const f = estimateMorphFlow(src[i].values, b.values, iw, ih, NC_FLOW_FACTOR.inca); pairsI++;
      const wa = src[i].values.reduce((n, v) => n + (v ? 1 : 0), 0), wb = b.values.reduce((n, v) => n + (v ? 1 : 0), 0);
      for (const lead of [src[i].lead + 5, src[i].lead + 10]) {
        betweenPlanes(src[i].values, b.values, iw, ih, f, (lead - src[i].lead) / 15, buf);
        const wet = buf.reduce((n, v) => n + (v ? 1 : 0), 0);
        const lo = Math.min(wa, wb), hi = Math.max(wa, wb);
        if (hi > 200 && (wet < 0.7 * lo || wet > 1.3 * hi)) betweenOk = false;
        refined.push({ lead, kind: 'between', values: buf.slice() });
      }
    }
    for (const r of refined) if (r.kind === 'inca' && !same(r.values, src.find((s) => s.lead === r.lead).values)) sameOk = false;
    add(`F6 INCA ${inca.stamp} (${src.length} frames) → ${refined.length} refined frames (${pairsI} pairs): every INCA lead keeps the run's own bytes, between frames lie between their neighbours (wet count ±30 %)`,
      iw === INCA_IMG_WIDTH && ih === INCA_IMG_HEIGHT && refined.length === src.length + 2 * pairsI && sameOk && betweenOk && (src.length !== 12 || refined.length === 34));
    const im = makeInca5mImgMeta({ stamp: inca.stamp, refAtMs: radarImgStampToMs(inca.stamp), corners: inca.meta.corners, frames: refined.map((r) => ({ lead: r.lead, file: radarImgFrameFile(r.lead), bytes: 1, validAtMs: radarImgStampToMs(inca.stamp) + r.lead * 60_000, kind: r.kind })), method: { flow: 'horn-schunck', factor: 4, alpha: RADAR_MORPH_HS.alpha, iters: RADAR_MORPH_HS.iters, between: 'advect-both-round' } });
    add('F7 the refined meta from the real run passes the parser, kinds and validity times as the contract says, corners = the run\'s corners', !!parseInca5mImgMeta(rt(im)) && JSON.stringify(im.corners) === JSON.stringify(inca.meta.corners));
  }
}
if (DERIVED) {
  // a slot pair written by radar-derive.mjs (rzc-nc/<stamp>/, inca-5m/<stamp>/): parsers accept, every listed file exists, unknown ⇒ 0
  const rzcDirs = existsSync(join(DERIVED, 'rzc-nc')) ? readdirSync(join(DERIVED, 'rzc-nc')) : [];
  const incaDirs = existsSync(join(DERIVED, 'inca-5m')) ? readdirSync(join(DERIVED, 'inca-5m')) : [];
  let ok = rzcDirs.length > 0 && incaDirs.length > 0, why = [];
  for (const s of rzcDirs) {
    const d = join(DERIVED, 'rzc-nc', s);
    const m = parseRzcNcImgMeta(JSON.parse(readFileSync(join(d, 'meta.json'), 'utf8')));
    if (!m || m.stamp !== s) { ok = false; why.push(`${s}: meta`); continue; }
    for (const f of [...m.frames, ...m.unknown, ...(m.dual?.frames ?? [])]) if (!existsSync(join(d, f.file))) { ok = false; why.push(`${s}/${f.file} fehlt`); }
    for (let i = 0; i < m.frames.length; i += 6) {
      const v = decodePng(readFileSync(join(d, m.frames[i].file))).data, u = decodePng(readFileSync(join(d, m.unknown[i].file))).data;
      for (let k = 0; k < v.length; k++) if (u[k] === 255 && v[k]) { ok = false; why.push(`${s}/${m.frames[i].file}: unknown with value`); break; }
      if (m.dual) { const g = decodePng(readFileSync(join(d, m.dual.frames[i].file))); for (let k = 0; k < v.length; k++) if (g.data[k * 2] !== v[k]) { ok = false; why.push(`${s}/${m.dual.frames[i].file}: channel 1 ≠ f`); break; } }
    }
  }
  for (const s of incaDirs) {
    const d = join(DERIVED, 'inca-5m', s);
    const m = parseInca5mImgMeta(JSON.parse(readFileSync(join(d, 'meta.json'), 'utf8')));
    if (!m || m.stamp !== s) { ok = false; why.push(`${s}: meta`); continue; }
    for (const f of m.frames) if (!existsSync(join(d, f.file))) { ok = false; why.push(`${s}/${f.file} fehlt`); }
  }
  add(`F8 derived slots under ${DERIVED}: parsers accept, every listed file exists, unknown ⇒ 0, dual channel 1 = f`, ok, why.slice(0, 3).join('; '));
}

console.log(`\nverify:radar-nc — ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(failed ? 1 : 0);
