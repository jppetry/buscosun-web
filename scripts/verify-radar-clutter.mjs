#!/usr/bin/env node
// Phase SE — Radarechos ohne Niederschlag (audit/radar-stoerecho.md).
//
// A  geometry: great-circle azimuth/distance, ray table of a sweep (true azimuth intervals, gaps, faulty rays), the
//    east/north lattice of a site image against the exact mapping, `siteRho` on a synthetic image + sweep.
// B  evidence: noise correction of ρHV, SNR floor, block binning (`siteBlocks`), the vote from a statistic
//    (`voteFromStat`), `siteVote` (own echo, no sweep = precipitation, neighbour vote, rich threshold).
// C  mask: `clutterMask` (one "no precipitation" vote and no "precipitation" vote), the fill, label propagation into
//    forecast frames against a brute-force nearest-label reference, `applyClutterToRun` (empty mask = no byte read or
//    written), and the sort-free vote `siteVoteFast` = `siteVote` on random fields for six rule variants.
// D  contracts: `meta.dual.clutter` and `hd250.json blocks.clutter` pass the client parsers; mutations fail.
// E  frozen rules: the hash files name the sha256 of `claims-frozen.txt` / `claims-addendum-1.txt`, and §4 / §5a of the
//    audit still equal those copies.
// F  reproduction on REAL rows (fixture radar-clutter-cases.json: DWD stations × RV analyses × site statistics): the
//    numbers of §5/§5b recomputed with `voteFromStat` — θ* is admissible and chosen by R-SE-1/2 among the kernel-3
//    candidates of the fixture, the hold-out passes, R85 keeps R-SE-1; negative controls: ρc < 0,90 breaks R-SE-1, and a
//    rule without the echo cap loses more rain.
// G  wiring: producer switch `RADAR_CLUTTER`, workflow template line, CI step, npm script, the rule constant.
// H  (RADAR_SE_RAW=<slot directory of audit/radar-stoerecho/collect.mjs>) real files: sweep reader (fast path = jsfive,
//    injected zlib = default), px250 with injected zlib = default, mapping px250 ↔ dbzh sweep, fast vote = reference on
//    every wet cell, producer round trip with and without the switch (f/m/g channel 1 byte-identical; g channel 2
//    differs only in masked cells; `clutter.png` = the mask; hd250 leaves exactly those blocks dry) and without site
//    files (fail-open: planes byte-identical to the switch off).
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  azimuthDistance, siteLattice, siteRho, sameScan, snrDb, rhoNoiseCorrected, siteBlocks, blockStat, voteFromStat, siteVote,
  siteVoteFast, siteSummary, clutterMask, propagateLabels, analysisLabels, applyClutterToRun,
  CLUTTER_RULE, CLUTTER_RULE_MEASURED, CLUTTER_SNR_OFFSET_DB, CLUTTER_SNR_MIN_DB, CLUTTER_MIN_CELLS, CLUTTER_RICH_CELLS, RV_COLS, RV_ROWS,
} from '../src/sources/radarClutter.ts';
import { sweepRayLut, decodeSweep, sweepNamesFromListing, sweepLatestName } from '../src/sources/dwdSweep.ts';
import { decodePx250, PX250_SITES } from '../src/sources/dwdPx250.ts';
import { psFwd, psInv } from '../src/sources/radolanGeo.ts';
import { px250Shift, makeHd250Meta, parseHd250Meta, HD250_COLS, HD250_ROWS } from '../src/sources/radarHd250.ts';
import { makeRadarImgDual, makeRvImgMeta, parseRvImgMeta, radarImgFrameFile, radarImgDualFile, RADAR_IMG_CLUTTER_FILE } from '../src/sources/radarImg.ts';
import { RADAR_DISPLAY_MIN_MMH } from '../src/scalar/radarHd.ts';
import { decodePng } from './lib/png.mjs';

let passed = 0, failed = 0, skipped = 0;
const add = (name, ok, detail) => { if (ok) passed++; else failed++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const skip = (name, why) => { skipped++; console.log(`⊘ ${name} — ${why}`); };
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ─── A geometry ───
{
  const [azN, sN] = azimuthDistance(50, 8, 51, 8), [azE, sE] = azimuthDistance(50, 8, 50, 9), [azS] = azimuthDistance(50, 8, 49, 8), [azW] = azimuthDistance(50, 8, 50, 7);
  add('A1 azimuthDistance: 1° north = 111,19 km at 0°, 1° east at 50° N = 71,47 km near 90°, south 180°, west near 270°',
    near(azN, 0, 1e-9) && near(sN, 111194.9, 1) && near(sE, 71474, 30) && near(azE, 89.62, 0.05) && near(azS, 180, 1e-9) && near(azW, 270.38, 0.05),
    `N ${sN.toFixed(0)} m, E ${sE.toFixed(0)} m az ${azE.toFixed(2)}°, W az ${azW.toFixed(2)}°`);
}
function synthSweep(over = {}) {
  const nrays = 360, nbins = 600;
  const startAz = new Float32Array(nrays), stopAz = new Float32Array(nrays), elDeg = new Float32Array(nrays).fill(0.8);
  for (let r = 0; r < nrays; r++) { startAz[r] = r + 0.03; stopAz[r] = (r + 1.02) % 360; }
  const values = new Float32Array(nrays * nbins);
  for (let r = 0; r < nrays; r++) for (let b = 0; b < nbins; b++) values[r * nbins + b] = (r + b / 1000) / 400;   // encodes ray and bin
  return { site: 'tst', quantity: 'URHOHV', slotMs: 1000, nrays, nbins, rscaleM: 250, rstartM: 0, startAz, stopAz, elDeg, lon: 8.713, lat: 49.985, heightM: 246, values, dbz0: -41, pulseWidthUs: 0.81, ...over };
}
{
  const s = synthSweep();
  const lut = sweepRayLut(s);
  add('A2 sweepRayLut: tenth 5 → ray 0, tenth 0 → ray 359 (its interval ends at 0,02°), tenth 905 → ray 90, every tenth covered',
    lut[5] === 0 && lut[0] === 359 && lut[905] === 90 && !Array.from(lut).includes(-1), `lut[0] ${lut[0]}, lut[5] ${lut[5]}`);
  const s2 = synthSweep(); s2.stopAz[10] = 10.75; s2.startAz[20] = 20.0; s2.stopAz[20] = 30.0;   // a 0,28° gap after ray 10, and a ray of 10°
  const lut2 = sweepRayLut(s2);
  add('A2b a gap of ≤ 0,3° between two rays is closed by a neighbour; a ray wider than 5° is dropped — it does not overwrite the rays of its sector, and its own 1° stays open beyond 0,3° from the neighbours',
    lut2[108] >= 10 && lut2[108] <= 11 && lut2[109] >= 10 && lut2[109] <= 11 && lut2[250] === 24 && lut2[205] === -1 && lut2[202] === 19 && lut2[209] === 21, `lut[108] ${lut2[108]}, lut[250] ${lut2[250]}, lut[202…209] ${Array.from(lut2.subarray(202, 210)).join(',')}`);
}
// a site image geometry as the DWD ships it: site at the image centre of a 1600 × 1600 × 250 m grid
function synthGrid(lon, lat, over = {}) {
  const [sx, sy] = psFwd(lon, lat);
  const size = 1600, cellM = 250;
  return { site: 'tst', timeMs: 1000, size, cellM, x0: (size / 2) * cellM - sx, y0: -(size / 2) * cellM - sy, lon, lat, dbz: new Float32Array(size * size).fill(-Infinity), gain: 1, offset: 0, ...over };
}
{
  const g = synthGrid(8.713, 49.985), L = siteLattice(g), rnd = rng(7);
  let mx = 0;
  for (let k = 0; k < 4000; k++) {
    const a = Math.floor(rnd() * 1600), b = Math.floor(rnd() * 1600);
    const [lon, lat] = psInv(a * 250 - g.x0, -b * 250 - g.y0);
    const [az, s] = azimuthDistance(g.lat, g.lon, lat, lon);
    const p = Math.min(L.n - 2, Math.floor(a / L.step)), q = Math.min(L.n - 2, Math.floor(b / L.step)), fx = (a - p * L.step) / L.step, fy = (b - q * L.step) / L.step, k0 = q * L.n + p;
    const e = L.east[k0] * (1 - fx) * (1 - fy) + L.east[k0 + 1] * fx * (1 - fy) + L.east[k0 + L.n] * (1 - fx) * fy + L.east[k0 + L.n + 1] * fx * fy;
    const n = L.north[k0] * (1 - fx) * (1 - fy) + L.north[k0 + 1] * fx * (1 - fy) + L.north[k0 + L.n] * (1 - fx) * fy + L.north[k0 + L.n + 1] * fx * fy;
    mx = Math.max(mx, Math.hypot(e - s * Math.sin(az * Math.PI / 180), n - s * Math.cos(az * Math.PI / 180)));
  }
  // the lattice is float32: at 280 km the last bit is ≈ 0,03 m; measured on real site geometries 0,11 m in float64
  add('A3 siteLattice: bilinear east/north against the exact mapping at 4 000 random cells within 2 m (bins are 250 m)', mx < 2, `max ${mx.toFixed(2)} m, ${L.n} × ${L.n} nodes`);
  // echo cells due east at 50 km and due north at 100 km of the radar
  const c = 800;
  g.dbz[c * 1600 + (c + 200)] = 10; g.dbz[(c - 400) * 1600 + c] = 5; g.dbz[c * 1600 + c + 700] = 20;   // the last one lies beyond 150 km
  const sw = synthSweep({ site: 'tst' });
  const sr = siteRho(g, sw, L);
  const east = sr.rho[c * 1600 + c + 200] * 400, north = sr.rho[(c - 400) * 1600 + c] * 400;
  const rayE = Math.floor(east), binE = Math.round((east - rayE) * 1000), rayN = Math.floor(north), binN = Math.round((north - rayN) * 1000);
  // the projection is not true to scale at 50° N (factor 1,057): 50 000 m in the grid are 47,3 km on the ground
  add('A4 siteRho: a cell 50 km east in the grid reads ray 88–91 near bin 189 (47,3 km on the ground), a cell 100 km north ray 0/359/1 near bin 378; a cell without echo and a cell beyond the sweep carry no value',
    rayE >= 88 && rayE <= 91 && near(binE, 189, 3) && (rayN <= 1 || rayN >= 358) && near(binN, 378, 4) && Number.isNaN(sr.rho[0]) && Number.isNaN(sr.rho[c * 1600 + c + 700]) && sr.echoCells === 3 && sr.rhoCells === 2,
    `east ray ${rayE} bin ${binE} (${sr.rangeKm[c * 1600 + c + 200].toFixed(2)} km), north ray ${rayN} bin ${binN}`);
  add('A5 sameScan: same site, same slot, quantity URHOHV; a sweep of the next slot, of another site or of DBZH does not belong',
    sameScan(g, sw) && !sameScan(g, { ...sw, slotMs: 301000 }) && !sameScan(g, { ...sw, site: 'oft' }) && !sameScan(g, { ...sw, quantity: 'DBZH' }) && !sameScan({ ...g, site: '' }, { ...sw, site: '' }));
}
{
  const html = '<a href="ras07-pcpng01_sweeph5onem_urhohv_00-2026101222303400-oft-10629-hd5">x</a>\n<a href="ras07-pcpng01_sweeph5onem_urhohv_00-2026101222353400-oft-10629-hd5">x</a>\n<a href="ras07-pcpng01_sweeph5onem_urhohv_00-LATEST-oft-10629-hd5">x</a>\n<a href="ras07-pcpng01_sweeph5onem_dbzh_00-2026101222353400-oft-10629-hd5">x</a>';
  const m = sweepNamesFromListing(html, 'urhohv');
  add('A6 listing: the minute stamp names the file (seconds are not constructible), LATEST and other quantities are not listed',
    m.size === 2 && m.get('202610122235') === 'ras07-pcpng01_sweeph5onem_urhohv_00-2026101222353400-oft-10629-hd5' && sweepLatestName('urhohv', { id: 'oft', wmo: 10629 }) === 'ras07-pcpng01_sweeph5onem_urhohv_00-LATEST-oft-10629-hd5');
}

// ─── B evidence ───
const RULE = CLUTTER_RULE;
add('B1 rule constant: ρc < 0,80 (0,85 from 72 evidence cells), cap 15 dBZ, kernel 3, fill on, no neighbour vote; offset 2,5 dB and floor 3 dB; measured 2026-10-13',
  RULE.rhoMax === 0.8 && RULE.rhoMaxRich === 0.85 && RULE.richCells === 72 && CLUTTER_RICH_CELLS === 72 && RULE.zCapDbz === 15 && RULE.kernel === 3 && RULE.fill === true && RULE.neighbourVote === false
  && RULE.snrOffsetDb === 2.5 && CLUTTER_SNR_OFFSET_DB === 2.5 && RULE.snrMinDb === 3 && CLUTTER_SNR_MIN_DB === 3 && RULE.minCells === 4 && CLUTTER_MIN_CELLS === 4 && CLUTTER_RULE_MEASURED === '2026-10-13' && Object.isFrozen(RULE));
add('B2 noise correction: factor 1,1 at 10 dB, 2 at 0 dB, → 1 at 40 dB; SNR = dBZ − dBZ0 − 20·log10(r/km)',
  near(rhoNoiseCorrected(0.8, 10), 0.88, 1e-9) && near(rhoNoiseCorrected(0.5, 0), 1.0, 1e-9) && near(rhoNoiseCorrected(0.97, 40), 0.97, 1e-4) && near(snrDb(5, 100, -41), 6, 1e-9) && near(snrDb(5, 10, -41), 26, 1e-9));
// a site image with three blocks: bird-like (ρ 0,6), rain-like (ρ 0,97), too weak for evidence
function scene() {
  const g = synthGrid(8.713, 49.985), { dk, dl } = px250Shift(g);
  const S = 1600, rho = new Float32Array(S * S).fill(NaN), rangeKm = new Float32Array(S * S);
  const put = (i, j, z, r, n = 16) => { let c = 0; for (let q = 0; q < 4; q++) for (let p = 0; p < 4; p++) { if (c++ >= n) return; const a = 4 * i + p - dk, b = 4 * j + q - dl; g.dbz[b * S + a] = z; rho[b * S + a] = r; rangeKm[b * S + a] = 50; } };
  // RV cells: block grid origin of the image
  const i0 = Math.ceil(dk / 4) + 150, j0 = Math.ceil(dl / 4) + 150;
  for (let dj = 0; dj < 6; dj++) for (let di = 0; di < 6; di++) put(i0 + di, j0 + dj, 8, 0.60);        // birds: 6 × 6 km
  for (let dj = 0; dj < 6; dj++) for (let di = 0; di < 6; di++) put(i0 + 20 + di, j0 + dj, 8, 0.93);   // rain of the same strength
  for (let dj = 0; dj < 6; dj++) for (let di = 0; di < 6; di++) put(i0 + 40 + di, j0 + dj, -5, 0.60);  // SNR below the floor
  for (let dj = 0; dj < 6; dj++) for (let di = 0; di < 6; di++) put(i0 + 60 + di, j0 + dj, 25, 0.60);  // strong echo with low ρHV (hail, melting layer)
  return { g, sr: { site: 'tst', rho, rangeKm, echoCells: 0, rhoCells: 0 }, i0, j0 };
}
{
  const { g, sr, i0, j0 } = scene();
  const sb = siteBlocks(g, sr, -41, RULE);
  const k = (i, j) => (j - sb.j0) * sb.w + i - sb.i0;
  // SNR of 8 dBZ at 50 km: 8 + 41 − 33,98 = 15,02 dB, minus 2,5 ⇒ 12,52 dB ⇒ factor 1,0560
  add('B3 siteBlocks: 16 echo and 16 evidence cells in a bird block, corrected ρHV 0,6 · 1,0560 = 0,6336; a block at −5 dBZ has echo but no evidence (SNR −0,5 dB)',
    sb.nEcho[k(i0, j0)] === 16 && sb.nEv[k(i0, j0)] === 16 && near(sb.vals[k(i0, j0) * 16], 0.6 * (1 + 10 ** (-(8 + 41 - 20 * Math.log10(50) - 2.5) / 10)), 1e-6) && near(sb.vals[k(i0, j0) * 16], 0.6336, 1e-4) && sb.nEcho[k(i0 + 40, j0)] === 16 && sb.nEv[k(i0 + 40, j0)] === 0 && sb.zMax[k(i0, j0)] === 8 && sb.hasSweep,
    `ρc ${sb.vals[k(i0, j0) * 16].toFixed(4)}`);
  const stB = blockStat(sb, i0 + 2, j0 + 2, 3), stR = blockStat(sb, i0 + 22, j0 + 2, 3);
  add('B4 blockStat (3 × 3): 144 echo and evidence cells inside a patch, median = the patch value; null where the site has no echo',
    stB.nEcho === 144 && stB.nEv === 144 && near(stB.med, 0.6337, 1e-3) && near(stR.med, 0.9823, 1e-3) && blockStat(sb, i0 + 10, j0 + 2, 3) === null);
  add('B5 siteVote: birds 1, rain 2, weak echo 0 (no evidence), strong echo with low ρHV 2 (cap), outside the echo 0',
    siteVote(sb, i0 + 2, j0 + 2, RULE) === 1 && siteVote(sb, i0 + 22, j0 + 2, RULE) === 2 && siteVote(sb, i0 + 42, j0 + 2, RULE) === 0 && siteVote(sb, i0 + 62, j0 + 2, RULE) === 2 && siteVote(sb, i0 + 10, j0 + 2, RULE) === 0);
  const noSweep = siteBlocks(g, null, NaN, RULE);
  add('B6 a site without a sweep votes precipitation wherever it has an echo, and nothing elsewhere (fail-open)',
    !noSweep.hasSweep && siteVote(noSweep, i0 + 2, j0 + 2, RULE) === 2 && siteVote(noSweep, i0 + 42, j0 + 2, RULE) === 2 && siteVote(noSweep, i0 + 10, j0 + 2, RULE) === 0);
  const N = { ...RULE, neighbourVote: true };
  add('B7 neighbour vote (Nachtrag A1 "N", off in the rule): the cell next to the patch gets the patch vote only with the option',
    siteVote(sb, i0 - 1, j0 + 2, RULE) === 0 && siteVote(sb, i0 - 1, j0 + 2, N) === 1 && siteVote(noSweep, i0 - 1, j0 + 2, N) === 0 && siteVote(sb, i0 - 2, j0 + 2, N) === 0);
  const st = (nEv, med, zMax = 8) => ({ nEv, med, zMax });
  add('B8 voteFromStat: 11 cells no vote, 12 cells at 0,79 → 1, at 0,80 → 2; 72 cells at 0,84 → 1 (rich threshold), 71 cells at 0,84 → 2; 0,7 at 15 dBZ → 2',
    voteFromStat(st(11, 0.5), RULE) === 0 && voteFromStat(st(12, 0.79), RULE) === 1 && voteFromStat(st(12, 0.8), RULE) === 2 && voteFromStat(st(72, 0.84), RULE) === 1
    && voteFromStat(st(71, 0.84), RULE) === 2 && voteFromStat(st(72, 0.85), RULE) === 2 && voteFromStat(st(144, 0.7, 15), RULE) === 2 && voteFromStat(st(144, 0.7, 14.9), RULE) === 1 && voteFromStat(null, RULE) === 0);
}

// ─── C mask ───
{
  const { g, sr, i0, j0 } = scene();
  const sb = siteBlocks(g, sr, -41, RULE);
  const wet = new Uint8Array(RV_COLS * RV_ROWS);
  const patch = (i, j, n = 6) => { for (let dj = 0; dj < n; dj++) for (let di = 0; di < n; di++) wet[(j + dj) * RV_COLS + i + di] = 30; };
  patch(i0, j0); patch(i0 + 20, j0); patch(i0 + 40, j0); patch(i0 + 60, j0);
  wet[(j0 + 2) * RV_COLS + i0 + 6] = 30; wet[(j0 + 2) * RV_COLS + i0 + 7] = 30;   // two wet cells beside the birds without a site echo (composite filled them)
  wet[(j0 + 30) * RV_COLS + i0] = 30;                                              // wet, no site anywhere near
  const noFill = clutterMask(wet, [sb], { ...RULE, fill: false }), cm = clutterMask(wet, [sb], RULE);
  const at = (m, i, j) => m[j * RV_COLS + i];
  add('C1 clutterMask without fill: the 36 bird cells masked, rain and strong echo kept, weak echo and site-less cells unvoted; a dry cell is never masked',
    noFill.masked === 36 && noFill.filled === 0 && noFill.kept === 72 && noFill.unvoted === 36 + 3 && noFill.wet === 147 && at(noFill.mask, i0 + 2, j0 + 2) === 1 && at(noFill.mask, i0 + 22, j0 + 2) === 0
    && at(noFill.mask, i0 + 6, j0 + 2) === 0 && at(noFill.mask, i0 + 10, j0 + 2) === 0 && noFill.mask.reduce((a, x) => a + x, 0) === 36,
    `masked ${noFill.masked}, kept ${noFill.kept}, unvoted ${noFill.unvoted}`);
  add('C2 fill: the two site-less cells beside the birds join the mask (≥ 3 masked neighbours, no precipitation vote in 5 × 5); the weak patch and the far cell do not',
    cm.masked === 36 && cm.filled === 2 && at(cm.mask, i0 + 6, j0 + 2) === 1 && at(cm.mask, i0 + 7, j0 + 2) === 1 && at(cm.mask, i0 + 42, j0 + 2) === 0 && at(cm.mask, i0, j0 + 30) === 0);
  // a precipitation vote in reach blocks the fill
  const twoSites = clutterMask(wet, [sb, siteBlocks(g, null, NaN, RULE)], RULE);
  add('C3 a second site that sees the same echo without a readable sweep keeps every cell (precipitation vote wins)', twoSites.masked === 0 && twoSites.filled === 0 && twoSites.kept === 144);

  // propagation: the bird patch moves 3 km east, the rain patch 3 km south; a new echo appears far away
  const labels = analysisLabels(wet, cm.mask);
  const next = new Uint8Array(RV_COLS * RV_ROWS);
  const patchN = (i, j, n = 6) => { for (let dj = 0; dj < n; dj++) for (let di = 0; di < n; di++) next[(j + dj) * RV_COLS + i + di] = 30; };
  patchN(i0 + 3, j0); patchN(i0 + 20, j0 + 3); patchN(i0 + 3, j0 + 60, 3);
  const l1 = propagateLabels(labels, next, 8);
  let moved = 0, rain = 0, fresh = 0;
  for (let dj = 0; dj < 6; dj++) for (let di = 0; di < 6; di++) { if (l1[(j0 + dj) * RV_COLS + i0 + 3 + di] === 2) moved++; if (l1[(j0 + 3 + dj) * RV_COLS + i0 + 20 + di] === 1) rain++; }
  for (let dj = 0; dj < 3; dj++) for (let di = 0; di < 3; di++) if (l1[(j0 + 60 + dj) * RV_COLS + i0 + 3 + di] === 1) fresh++;
  add('C4 propagateLabels: the masked patch keeps its label after a 3-km shift, the rain patch stays precipitation, an echo 50 km away is new = precipitation',
    moved === 36 && rain === 36 && fresh === 9, `moved ${moved}/36, rain ${rain}/36, new ${fresh}/9`);
  // brute force: nearest labelled cell in chamfer 3-4 distance, limit 24, precipitation wins ties
  const rnd = rng(11), prev = new Uint8Array(RV_COLS * RV_ROWS), nxt = new Uint8Array(RV_COLS * RV_ROWS), seeds = [];
  for (let k = 0; k < 260; k++) { const i = 300 + Math.floor(rnd() * 70), j = 400 + Math.floor(rnd() * 70), lab = rnd() < 0.45 ? 2 : 1; if (!prev[j * RV_COLS + i]) { prev[j * RV_COLS + i] = lab; seeds.push([i, j, lab]); } }
  for (let j = 395; j < 475; j++) for (let i = 295; i < 375; i++) if (rnd() < 0.5) nxt[j * RV_COLS + i] = 9;
  const fast = propagateLabels(prev, nxt, 8);
  let cmp = 0, bad = 0;
  for (let j = 395; j < 475; j++) for (let i = 295; i < 375; i++) {
    if (!nxt[j * RV_COLS + i]) { if (fast[j * RV_COLS + i] !== 0) bad++; continue; }
    let d1 = 1e9, d2 = 1e9;
    for (const [si, sj, lab] of seeds) { const dx = Math.abs(si - i), dy = Math.abs(sj - j), d = 4 * Math.min(dx, dy) + 3 * (Math.max(dx, dy) - Math.min(dx, dy)); if (lab === 2) d2 = Math.min(d2, d); else d1 = Math.min(d1, d); }
    const want = d2 <= 24 && d2 < d1 ? 2 : 1;
    cmp++; if (fast[j * RV_COLS + i] !== want) bad++;
  }
  add('C5 propagateLabels (window around the masked cells) = brute-force nearest label on 3 000+ wet cells with 260 random seeds', cmp > 3000 && bad === 0, `${cmp} compared, ${bad} differ`);
  const planes = [wet.slice(), next.slice()];
  const before = planes.map((p) => p.slice());
  const none = applyClutterToRun(planes, new Uint8Array(RV_COLS * RV_ROWS));
  const same = planes.every((p, f) => p.every((v, k) => v === before[f][k]));
  const counts = applyClutterToRun(planes, cm.mask);
  add('C5b applyClutterToRun: an empty mask changes no byte and reports 0 per frame; the mask zeroes 38 cells of the analysis and 36 of the forecast frame, the rain stays',
    none.join() === '0,0' && same && counts.join() === '38,36' && planes[0][(j0 + 2) * RV_COLS + i0 + 2] === 0 && planes[0][(j0 + 2) * RV_COLS + i0 + 22] === 30 && planes[1][(j0 + 2) * RV_COLS + i0 + 5] === 0 && planes[1][(j0 + 5) * RV_COLS + i0 + 22] === 30,
    `counts ${counts.join(',')}`);
}
{
  // random blocks: evidence counts 0 … 16, values around the thresholds (with exact hits), all six variants
  const rnd = rng(23), g = synthGrid(8.713, 49.985), { dk, dl } = px250Shift(g), S = 1600;
  const rho = new Float32Array(S * S).fill(NaN), rangeKm = new Float32Array(S * S);
  const picks = [0.6, 0.7, 0.79, 0.8, 0.81, 0.84, 0.85, 0.86, 0.9, 0.97];
  const ci = Math.ceil(dk / 4) + 100, cj = Math.ceil(dl / 4) + 100;
  for (let j = cj; j < cj + 60; j++) for (let i = ci; i < ci + 60; i++) {
    if (rnd() < 0.15) continue;
    const n = Math.floor(rnd() * 17), z = rnd() < 0.1 ? 16 : 4 + rnd() * 10;
    for (let c = 0; c < n; c++) { const a = 4 * i + (c % 4) - dk, b = 4 * j + (c >> 2) - dl; g.dbz[b * S + a] = z; rho[b * S + a] = picks[Math.floor(rnd() * picks.length)] / (1 + 10 ** (-(z + 41 - 20 * Math.log10(30) - 2.5) / 10)); rangeKm[b * S + a] = 30; }
  }
  let n = 0, diff = 0; const seen = new Set();
  for (const extra of [{}, { neighbourVote: true }, { rhoMaxRich: 0.9 }, { neighbourVote: true, rhoMaxRich: 0.8 }, { kernel: 1 }, { rhoMax: 0.85, rhoMaxRich: 0.85, zCapDbz: 20 }]) {
    const rule = { ...RULE, ...extra }, sb = siteBlocks(g, { site: 'tst', rho, rangeKm, echoCells: 0, rhoCells: 0 }, -41, rule), su = siteSummary(sb, rule);
    for (let j = cj - 2; j < cj + 62; j++) for (let i = ci - 2; i < ci + 62; i++) { const a = siteVote(sb, i, j, rule), f = siteVoteFast(su, i, j, rule); n++; seen.add(a); if (a !== f) diff++; }
  }
  add('C6 siteVoteFast (counts instead of a sort) = siteVote on 24 000+ random cells, six rule variants, all three votes occur', n > 24000 && diff === 0 && seen.size === 3, `${n} cells, ${diff} differ`);
}

// ─── D contracts ───
{
  const leads = Array.from({ length: 25 }, (_, i) => i * 5);
  const frames = leads.map((l) => ({ lead: l, file: radarImgFrameFile(l), bytes: 10 }));
  const dualFrames = leads.map((l) => ({ lead: l, file: radarImgDualFile(l), bytes: 10 }));
  const rule = { rhoMax: 0.8, zCapDbz: 15, kernel: 3, fill: true, rhoMaxRich: 0.85 };
  const full = { cells: 1890, wet: 8838, sites: 17, missing: [], rule, file: RADAR_IMG_CLUTTER_FILE, bytes: 3039 };
  const meta = (clutter, native = true) => JSON.parse(JSON.stringify(makeRvImgMeta('2610122235', 1, frames, undefined, native ? makeRadarImgDual(dualFrames, { native: true, displayMin: 0.06, clutter }) : { ...makeRadarImgDual(dualFrames), clutter })));
  const ok = parseRvImgMeta(meta(full)), empty = parseRvImgMeta(meta({ cells: 0, wet: 100, sites: 16, missing: ['oft'], rule }));
  add('D1 meta.dual.clutter: a slot with a mask and a slot where nothing was found pass the client parser; a slot without the field too',
    !!ok && ok.dual.clutter.cells === 1890 && ok.dual.clutter.file === 'clutter.png' && !!empty && empty.dual.clutter.file === undefined && !!parseRvImgMeta(meta(undefined)));
  const bad = [
    { ...full, cells: 9000 }, { ...full, file: undefined, bytes: undefined }, { ...full, file: 'mask.png' }, { cells: 0, wet: 1, sites: 1, missing: [], rule, file: RADAR_IMG_CLUTTER_FILE, bytes: 5 },
    { ...full, rule: { ...rule, kernel: 2 } }, { ...full, rule: { ...rule, rhoMaxRich: 0.7 } }, { ...full, rule: { ...rule, fill: 1 } }, { ...full, missing: [1] }, { ...full, sites: -1 }, { ...full, cells: 1.5 },
  ].map((c) => parseRvImgMeta(meta(c)));
  add('D2 mutations fail: more cells than wet, mask without file, foreign file name, file without cells, kernel 2, rich threshold under the base, fill not boolean, missing not strings, negative sites, fractional cells; and a mask on a non-native plane',
    bad.every((x) => x === null) && parseRvImgMeta(meta(full, false)) === null, bad.map((x) => (x ? 'ok' : '∅')).join(''));
  const field = { rate: new Float32Array(0), wetBlocks: 6948, structuredBlocks: 6179, flatBlocks: 769, belowMinBlocks: 3359 };
  const hm = (extra) => JSON.parse(JSON.stringify(makeHd250Meta('2610122235', 1, ['oft'], [], field, [], extra)));
  const a = parseHd250Meta(hm({ displayMin: 0.06, clutterBlocks: 1890 })), b = parseHd250Meta(hm({ displayMin: 0.06 })), c = hm({ displayMin: 0.06, clutterBlocks: 1890 });
  c.blocks.clutter = -1;
  add('D3 hd250.json: blocks.clutter passes, is absent without the filter, and a negative count fails', !!a && a.blocks.clutter === 1890 && !!b && b.blocks.clutter === undefined && parseHd250Meta(c) === null);
}

// ─── E frozen rules ───
{
  const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  const sha = (p) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
  const audit = read('audit/radar-stoerecho.md').replace(/\r\n/g, '\n');
  const section = (from, to) => { const a = audit.indexOf(from), b = to ? audit.indexOf(to, a + 1) : -1; return a < 0 ? '' : audit.slice(a, b < 0 ? undefined : b); };
  const h1 = read('audit/radar-stoerecho/claims-frozen.sha256').split(/\s/)[0], h2 = read('audit/radar-stoerecho/claims-addendum-1.sha256').split(/\s/)[0];
  add('E1 the hash files name the sha256 of the frozen copies (protocol §4 and Nachtrag A1 §5a)', h1 === sha('audit/radar-stoerecho/claims-frozen.txt') && h2 === sha('audit/radar-stoerecho/claims-addendum-1.txt'), `${h1.slice(0, 12)} / ${h2.slice(0, 12)}`);
  add('E2 §4 and §5a of the audit still equal the frozen copies (nothing rewritten after the measurement)',
    norm(section('## §4 Messprotokoll', '\n## §5 ')) === norm(read('audit/radar-stoerecho/claims-frozen.txt')) && norm(section('## §5a Nachtrag A1', '\n## §5b ')) === norm(read('audit/radar-stoerecho/claims-addendum-1.txt')));
  add('E3 the rule in the code is what the frozen texts allow: θ* from the 30 candidates of §4.2, R85 from the six of §5a',
    [0.70, 0.75, 0.80, 0.85, 0.90].includes(RULE.rhoMax) && [10, 15, 20].includes(RULE.zCapDbz) && [1, 3].includes(RULE.kernel) && [RULE.rhoMax, 0.85, 0.90].includes(RULE.rhoMaxRich)
    && /`rhoMax` ∈ \{0,70 · 0,75 · 0,80 · 0,85 · 0,90\} × `zCap` ∈ \{10 · 15 · 20 dBZ\} × `kernel` ∈ \{1 · 3\}/.test(audit) && /`rhoMaxRich` ∈ \{0,85 · 0,90\}/.test(audit));
}

// ─── F reproduction on real rows ───
{
  const fx = JSON.parse(read('scripts/lib/fixtures/radar-clutter-cases.json'));
  const rows = fx.rows;   // [block, minutes, stationId, w1, w2, [[hasSweep, nEv3, zMax3, med3], …]]
  const NIGHT = (Date.UTC(2026, 9, 12, 17) - Date.UTC(2026, 9, 10)) / 60000;
  const masked = (r, rule) => {
    let clutter = false;
    for (const [hasSweep, nEv, zMax, med] of r[5]) {
      if (!hasSweep) return false;
      const v = med === null ? 0 : voteFromStat({ nEv, zMax, med }, rule);
      if (v === 2) return false;
      if (v === 1) clutter = true;
    }
    return clutter;
  };
  const count = (sel, rule) => { let n = 0; for (const r of sel) if (masked(r, rule)) n++; return n; };
  const boot = (sel, rule) => {   // upper bound of the 90-% block bootstrap of the masked share (seed and draws as the scorer)
    const per = new Map(); for (const r of sel) { const e = per.get(r[0]) ?? [0, 0]; e[0] += masked(r, rule) ? 1 : 0; e[1]++; per.set(r[0], e); }
    const arr = [...per.values()], rnd = rng(12345), d = [];
    for (let t = 0; t < 1000; t++) { let a = 0, b = 0; for (let k = 0; k < arr.length; k++) { const x = arr[Math.floor(rnd() * arr.length)]; a += x[0]; b += x[1]; } if (b > 0) d.push(a / b); }
    d.sort((x, y) => x - y); return d[Math.floor(0.95 * d.length)];
  };
  const A = rows.filter((r) => r[3] === 0), B = rows.filter((r) => r[3] === 1), even = (r) => r[0] % 2 === 0;
  const BASE = { ...RULE, rhoMaxRich: RULE.rhoMax };
  add('F1 fixture: 3 251 real blue station intervals — 181 dry and 2 911 wet at indicator stations, 165 dry in the bird night at gauge stations',
    rows.length === 3251 && A.length === 181 && B.length === 2911 && rows.filter((r) => r[1] >= NIGHT && r[4] === 0).length === 165, `${rows.length} rows`);
  const selA = A.filter(even), selB = B.filter(even), holdA = A.filter((r) => !even(r)), holdB = B.filter((r) => !even(r));
  const sA = count(selA, BASE), sB = count(selB, BASE), hA = count(holdA, BASE), hB = count(holdB, BASE);
  add('F2 θ* (0,80 · 15 dBZ · 3 × 3) as §5: selection half clears 8/85 and loses 11/1 426 (0,77 %, upper bound 1,19 %), hold-out 4/96 and 7/1 485 (0,47 %)',
    selA.length === 85 && selB.length === 1426 && sA === 8 && sB === 11 && holdA.length === 96 && holdB.length === 1485 && hA === 4 && hB === 7 && near(boot(selB, BASE), 0.0119, 0.0006),
    `sel ${sA}/${selA.length}, ${sB}/${selB.length} (hi ${(100 * boot(selB, BASE)).toFixed(2)} %), hold ${hA}/${holdA.length}, ${hB}/${holdB.length}`);
  // R-SE-1/2 among the 15 kernel-3 candidates the fixture can score (it stores the 3 × 3 statistics)
  const cands = [];
  for (const zCapDbz of [10, 15, 20]) for (const rhoMax of [0.70, 0.75, 0.80, 0.85, 0.90]) { const rule = { ...RULE, rhoMax, rhoMaxRich: rhoMax, zCapDbz }; const v = count(selB, rule) / selB.length; cands.push({ rhoMax, zCapDbz, a: count(selA, rule) / selA.length, v, ok: v <= 0.01 && boot(selB, rule) <= 0.02 }); }
  const okC = cands.filter((c) => c.ok), best = Math.max(...okC.map((c) => c.a));
  const star = okC.filter((c) => best - c.a < 0.01).sort((x, y) => x.rhoMax - y.rhoMax || x.zCapDbz - y.zCapDbz)[0];
  add('F3 R-SE-1/2 recomputed: of the 15 kernel-3 candidates 10 are admissible (0,85 · 15, 0,90 · 15 and everything from 0,80 · 20 on are not) and the choice is 0,80 · 15 dBZ', okC.length === 10 && !cands.find((c) => c.rhoMax === 0.85 && c.zCapDbz === 15).ok && star.rhoMax === 0.8 && star.zCapDbz === 15, `${okC.length} admissible, choice ${star.rhoMax} · ${star.zCapDbz}`);
  const night = rows.filter((r) => r[1] >= NIGHT && r[4] === 0);
  add('F4 bird night (W2): θ* clears 117 of 165 dry blue intervals (70,9 %), the rule with R85 more', count(night, BASE) === 117 && count(night, RULE) > 117 && count(night, RULE) / night.length >= 0.5, `θ* ${count(night, BASE)}, rule ${count(night, RULE)} of ${night.length}`);
  const rA = count(A, RULE), rB = count(B, RULE);
  add('F5 the rule (θ* + R85, without the fill — the fixture has no neighbours): 14/181 cleared, 20/2 911 lost (0,69 %); R-SE-1 holds on the selection half (12/1 426, upper bound ≤ 2 %), hold-out 8/1 485',
    rA === 14 && rB === 20 && count(selB, RULE) === 12 && boot(selB, RULE) <= 0.02 && count(holdB, RULE) === 8, `A ${rA}/181, B ${rB}/2911, sel ${count(selB, RULE)}, hold ${count(holdB, RULE)}`);
  const loose = { ...RULE, rhoMax: 0.9, rhoMaxRich: 0.9 }, noCap = { ...RULE, zCapDbz: 99 };
  add('F6 negative controls: ρc < 0,90 loses more than 1 % of the rain on the selection half (R-SE-1 binds); without the echo cap the loss grows',
    count(selB, loose) / selB.length > 0.01 && count(B, noCap) > rB, `0,90: ${(100 * count(selB, loose) / selB.length).toFixed(2)} %, no cap: ${count(B, noCap)} vs ${rB}`);
}

// ─── G wiring ───
{
  const derive = read('scripts/radar-mirror/radar-derive.mjs'), step = read('scripts/radar-mirror/clutter-step.mjs'), tpl = read('scripts/radar-mirror/workflow-radar.yml');
  add('G1 producer: `RADAR_CLUTTER=1` only together with the native log plane; the step works on copies; a failure leaves the slot unfiltered',
    /const CLUTTER = process\.env\.RADAR_CLUTTER === '1' && DUAL && LOG_NATIVE;/.test(derive) && /f\.values2\.slice\(\)/.test(derive) && /clutter: Slot ungefiltert/.test(derive) && /if \(CLUTTER && hdf5\)/.test(derive));
  add('G2 the step applies CLUTTER_RULE, fetches sweep + site image per site, and the hd250 step reads the mask of the same stamp',
    /clutterMask\(planes\[0\], blocks, CLUTTER_RULE\)/.test(step) && /sweepLatestName\(SWEEP_KEYS\.rhohv, site\)/.test(step) && /sameScan\(g, sweep\)/.test(step) && /'rv', stamp, RADAR_IMG_CLUTTER_FILE/.test(derive));
  add('G3 workflow template names the switch with its condition (Jan\'s gate)', /RADAR_CLUTTER: '[01]'/.test(tpl) && /radar-stoerecho\.md/.test(tpl));
  add('G4 npm script and CI step', /"verify:radar-clutter"/.test(read('package.json')) && /verify:radar-clutter/.test(read('.github/workflows/ci.yml')));
  const client = ['src/MapView.tsx', 'src/scalar/RainLayer.ts', 'src/scalar/radarHd.ts'].map(read).join('\n');
  add('G5 the client bundle does not import the filter (producer only): no reference to radarClutter or dwdSweep in MapView/RainLayer/radarHd, and radarImg.ts imports neither', !/radarClutter|dwdSweep/.test(client) && !/radarClutter|dwdSweep/.test(read('src/sources/radarImg.ts'))
    && /radarClutter/.test(step) && /dwdSweep/.test(step));   // the pattern does match where the import exists
}

// ─── H real files ───
const RAW = process.env.RADAR_SE_RAW;
if (!RAW || !existsSync(join(RAW, 'rv.tar'))) {
  for (const n of ['H1 sweep reader', 'H2 px250 with injected zlib', 'H3 mapping px250 ↔ dbzh sweep', 'H4 fast vote = reference', 'H5 producer round trip', 'H6 hd250 with the mask', 'H7 fail-open without site files']) skip(n, 'RADAR_SE_RAW=<Slot-Verzeichnis des Sammlers> nicht gesetzt');
} else {
  const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const inflate = (b) => inflateSync(b);
  const site = PX250_SITES.find((s) => s.id === 'oft');
  const swFast = await decodeSweep(ab(join(RAW, 'rhohv-oft.h5')), { inflate }), swWeb = await decodeSweep(ab(join(RAW, 'rhohv-oft.h5'))), swJs = await decodeSweep(ab(join(RAW, 'rhohv-oft.h5')), { reader: 'jsfive' });
  const eq = (a, b) => a.length === b.length && a.every((v, k) => Object.is(v, b[k]));
  add('H1 sweep reader on the real URHOHV file: 360 × 600 × 250 m, site oft, dBZ0 from the file; fast path with Node zlib = default inflate = jsfive, value for value',
    swFast.quantity === 'URHOHV' && swFast.nrays === 360 && swFast.nbins === 600 && swFast.rscaleM === 250 && swFast.site === 'oft' && swFast.dbz0 < -30 && swFast.dbz0 > -50 && eq(swFast.values, swJs.values) && eq(swFast.values, swWeb.values),
    `dBZ0 ${swFast.dbz0.toFixed(1)}, slot ${new Date(swFast.slotMs).toISOString()}`);
  const gFast = await decodePx250(ab(join(RAW, 'px250-oft.h5')), { inflate }), gWeb = await decodePx250(ab(join(RAW, 'px250-oft.h5')));
  add('H2 px250 with the injected zlib = the reader as before, value for value; same slot as the sweep', eq(gFast.dbz, gWeb.dbz) && gFast.x0 === gWeb.x0 && sameScan(gFast, swFast));
  if (existsSync(join(RAW, 'dbzh-oft.h5'))) {
    const z = await decodeSweep(ab(join(RAW, 'dbzh-oft.h5')), { inflate });
    // read the DBZH sweep through the same mapping; negative control: the same sweep turned by 10°
    const agree = (sweep) => {
      const sr = siteRho(gFast, { ...sweep, quantity: 'URHOHV' }, siteLattice(gFast));
      let both = 0, close = 0, echo = 0;
      for (let k = 0; k < gFast.dbz.length; k++) { if (!(gFast.dbz[k] > -Infinity)) continue; echo++; if (sr.rho[k] === sr.rho[k]) { both++; if (Math.abs(sr.rho[k] - gFast.dbz[k]) < 1) close++; } }
      return { echo, both: both / echo, close: close / Math.max(1, both) };
    };
    const ok = agree(z), turned = agree({ ...z, startAz: z.startAz.map((a) => (a + 10) % 360), stopAz: z.stopAz.map((a) => (a + 10) % 360) });
    add('H3 mapping: the px250 echo cells find an echo in the DBZH sweep of the same scan at ≥ 85 %, ≥ 50 % of those within 1 dB — and clearly fewer when the sweep is turned by 10° (negative control)',
      ok.echo > 1000 && ok.both >= 0.85 && ok.close >= 0.5 && turned.close < 0.8 * ok.close,
      `${ok.echo} echo cells, ${(100 * ok.both).toFixed(1)} % with sweep echo, ${(100 * ok.close).toFixed(1)} % within 1 dB; turned by 10°: ${(100 * turned.both).toFixed(1)} % / ${(100 * turned.close).toFixed(1)} %`);
  } else skip('H3 mapping px250 ↔ dbzh sweep', 'dbzh-oft.h5 fehlt im Slot');
  // all sites, the rule, fast = reference on every wet cell
  const { untar } = await import('../src/sources/radolanDecode.ts');
  const { decodeRvHdf5 } = await import('../src/sources/rvHdf5.ts');
  const { precipToU8Log } = await import('../src/scalar/RainLayer.ts');
  const tarBuf = readFileSync(join(RAW, 'rv.tar'));
  const e0 = untar(new Uint8Array(tarBuf.buffer, tarBuf.byteOffset, tarBuf.byteLength)).find((e) => /_000-hd5$/.test(e.name));
  const rv = await decodeRvHdf5(e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength), { units: 'native', name: e0.name });
  const blocks = [];
  for (const s of PX250_SITES) {
    const pg = join(RAW, `px250-${s.id}.h5`), ps = join(RAW, `rhohv-${s.id}.h5`);
    if (!existsSync(pg)) continue;
    const g = await decodePx250(ab(pg), { inflate }); let sr = null, dbz0 = NaN;
    if (existsSync(ps)) { const sw = await decodeSweep(ab(ps), { inflate }); if (sameScan(g, sw)) { sr = siteRho(g, sw, siteLattice(g)); dbz0 = sw.dbz0; } }
    blocks.push(siteBlocks(g, sr, dbz0, RULE));
  }
  const sums = blocks.map((sb) => siteSummary(sb, RULE));
  const wet = new Uint8Array(rv.rainRate.length); for (let k = 0; k < wet.length; k++) wet[k] = precipToU8Log(rv.rainRate[k]);
  let n = 0, diff = 0;
  for (let j = 0; j < RV_ROWS; j++) for (let i = 0; i < RV_COLS; i++) { if (!wet[j * RV_COLS + i]) continue; for (let b = 0; b < blocks.length; b++) { n++; if (siteVote(blocks[b], i, j, RULE) !== siteVoteFast(sums[b], i, j, RULE)) diff++; } }
  const cm = clutterMask(wet, blocks, RULE);
  add('H4 real slot: the sort-free vote equals the reference on every wet cell and site', n > 1000 && diff === 0, `${n} votes, ${diff} differ; wet ${cm.wet}, masked ${cm.masked} + fill ${cm.filled}, kept ${cm.kept}, unvoted ${cm.unvoted}`);

  // producer round trip
  const stamp = new Date(rv.validAt).toISOString().replace(/[-:T]/g, '').slice(2, 12);
  const tmp = mkdtempSync(join(tmpdir(), 'verify-clutter-'));
  const derive = join(ROOT, 'scripts/radar-mirror/radar-derive.mjs');
  const run = (dir, args, env) => spawnSync(process.execPath, ['--experimental-strip-types', '--import', join(ROOT, 'scripts/lib/register-ts.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]:)/, 'file:///$1'), derive, ...args], { env: { ...process.env, RADAR_IMG_DUAL: '1', RADAR_LOG_NATIVE: '1', ...env }, encoding: 'utf8' });
  const outOff = join(tmp, 'off', 'rv', stamp), outOn = join(tmp, 'on', 'rv', stamp), outOpen = join(tmp, 'open', 'rv', stamp);
  const emptyDir = join(tmp, 'nosites'); mkdirSync(emptyDir, { recursive: true });
  const r0 = run(outOff, ['rv', join(RAW, 'rv.tar'), outOff, stamp], { RADAR_CLUTTER: '' });
  const r1 = run(outOn, ['rv', join(RAW, 'rv.tar'), outOn, stamp], { RADAR_CLUTTER: '1', RADAR_CLUTTER_DIR: RAW });
  const r2 = run(outOpen, ['rv', join(RAW, 'rv.tar'), outOpen, stamp], { RADAR_CLUTTER: '1', RADAR_CLUTTER_DIR: emptyDir });
  if (r0.status !== 0 || r1.status !== 0 || r2.status !== 0) add('H5 producer round trip', false, `exit ${r0.status}/${r1.status}/${r2.status}: ${(r0.stderr + r1.stderr + r2.stderr).slice(-400)}`);
  else {
    const files = readdirSync(outOff).sort(), filesOn = readdirSync(outOn).sort();
    const same = (a, b) => Buffer.compare(readFileSync(a), readFileSync(b)) === 0;
    const fm = files.filter((f) => /^[fm]\d{3}\.png$/.test(f));
    const metaOn = parseRvImgMeta(JSON.parse(readFileSync(join(outOn, 'meta.json'), 'utf8'))), metaOff = parseRvImgMeta(JSON.parse(readFileSync(join(outOff, 'meta.json'), 'utf8')));
    const cl = metaOn?.dual?.clutter;
    const maskPng = cl?.file ? decodePng(readFileSync(join(outOn, cl.file))) : null;
    let ch1 = 0, ch2Outside = 0, zeroed = 0, notZero = 0, g0Masked = 0, later = 0;
    const gs = files.filter((f) => /^g\d{3}\.png$/.test(f));
    for (const f of gs) {
      const a = decodePng(readFileSync(join(outOff, f))).data, b = decodePng(readFileSync(join(outOn, f))).data;
      for (let k = 0; k < a.length; k += 2) {
        if (a[k] !== b[k]) ch1++;
        if (a[k + 1] !== b[k + 1]) { if (b[k + 1] !== 0) notZero++; zeroed++; if (f === 'g000.png') { g0Masked++; if (!maskPng || !maskPng.data[k >> 1]) ch2Outside++; } else later++; }
      }
    }
    let maskCells = 0; if (maskPng) for (let k = 0; k < maskPng.data.length; k++) if (maskPng.data[k]) maskCells++;
    add('H5 producer with the switch: every f/m frame byte-identical, g channel 1 identical in all 25 frames; channel 2 changes only to 0, in the analysis exactly at the cells of clutter.png; meta passes the client parser and names the rule',
      fm.length >= 25 && fm.every((f) => same(join(outOff, f), join(outOn, f))) && filesOn.length === files.length + (cl?.file ? 1 : 0) && ch1 === 0 && notZero === 0 && ch2Outside === 0 && !!metaOn && !!metaOff && metaOff.dual.clutter === undefined
      && !!cl && cl.cells === cm.masked + cm.filled && cl.wet === cm.wet && (cl.cells === 0 || (maskCells === cl.cells && g0Masked === cl.cells && maskPng.width === 1100 && maskPng.height === 1200 && maskPng.channels === 1))
      && cl.rule.rhoMax === RULE.rhoMax && cl.rule.rhoMaxRich === RULE.rhoMaxRich && cl.sites === blocks.filter((b) => b.hasSweep).length,
      `${fm.length} f/m frames identical, ${gs.length} g frames: channel 1 diff ${ch1}, analysis ${g0Masked} cells = mask ${maskCells}, forecast frames ${later} cells, clutter ${JSON.stringify({ cells: cl?.cells, wet: cl?.wet, sites: cl?.sites })}`);
    // hd250 with and without the mask (sites from the slot directory, named <site>.h5)
    const sitesDir = join(tmp, 'sites'); mkdirSync(sitesDir, { recursive: true });
    for (const s of PX250_SITES) if (existsSync(join(RAW, `px250-${s.id}.h5`))) copyFileSync(join(RAW, `px250-${s.id}.h5`), join(sitesDir, `${s.id}.h5`));
    const past = (v) => { const d = join(tmp, v, 'rv-past', stamp); mkdirSync(d, { recursive: true }); copyFileSync(join(tmp, v, 'rv', stamp, 'f000.png'), join(d, 'f000.png')); return d; };
    const pOff = past('off'), pOn = past('on');
    const h0 = run(pOff, ['hd250', join(RAW, 'rv.tar'), pOff, stamp, sitesDir], { RADAR_CLUTTER: '' }), h1 = run(pOn, ['hd250', join(RAW, 'rv.tar'), pOn, stamp, sitesDir], { RADAR_CLUTTER: '1' });
    if (h0.status !== 0 || h1.status !== 0) add('H6 hd250 with the mask', false, `exit ${h0.status}/${h1.status}: ${(h0.stderr + h1.stderr).slice(-300)}`);
    else {
      const m0 = parseHd250Meta(JSON.parse(readFileSync(join(pOff, 'hd250.json'), 'utf8'))), m1 = parseHd250Meta(JSON.parse(readFileSync(join(pOn, 'hd250.json'), 'utf8')));
      // every 250-m cell of a masked block is dry in the tiles; outside the mask the tiles are byte-identical
      const full = (dir, m) => { const out = new Uint8Array(HD250_COLS * HD250_ROWS); for (const t of m.tiles) { const p = decodePng(readFileSync(join(dir, t.file))).data; for (let y = 0; y < 1200; y++) out.set(p.subarray(y * 1100, (y + 1) * 1100), (t.ty * 1200 + y) * HD250_COLS + t.tx * 1100); } return out; };
      const t0 = full(pOff, m0), t1 = full(pOn, m1);
      let wetInMask = 0, diffOutside = 0;
      for (let l = 0; l < HD250_ROWS; l++) for (let k = 0; k < HD250_COLS; k++) { const inMask = maskPng ? maskPng.data[(l >> 2) * 1100 + (k >> 2)] : 0; if (inMask) { if (t1[l * HD250_COLS + k]) wetInMask++; } else if (t0[l * HD250_COLS + k] !== t1[l * HD250_COLS + k]) diffOutside++; }
      add('H6 hd250: with the mask the masked blocks are dry in all 16 cells, every other 250-m cell is byte-identical; blocks.clutter = the mask cells, wet + clutter = wet without the filter',
        !!m0 && !!m1 && m0.blocks.clutter === undefined && m1.blocks.clutter === (cl?.cells ?? 0) && m1.blocks.wet + m1.blocks.clutter === m0.blocks.wet && wetInMask === 0 && diffOutside === 0,
        `blocks ${JSON.stringify(m1.blocks)}, without ${JSON.stringify(m0.blocks)}`);
    }
    const metaOpen = parseRvImgMeta(JSON.parse(readFileSync(join(outOpen, 'meta.json'), 'utf8')));
    add('H7 fail-open: with the switch but without any site file every g frame is byte-identical to the switch off; the meta says cells 0, sites 0, 17 missing',
      gs.every((f) => same(join(outOff, f), join(outOpen, f))) && !existsSync(join(outOpen, RADAR_IMG_CLUTTER_FILE)) && !!metaOpen && metaOpen.dual.clutter.cells === 0 && metaOpen.dual.clutter.sites === 0 && metaOpen.dual.clutter.missing.length === 17,
      `clutter ${JSON.stringify(metaOpen?.dual?.clutter && { cells: metaOpen.dual.clutter.cells, sites: metaOpen.dual.clutter.sites, missing: metaOpen.dual.clutter.missing.length })}`);
  }
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} bestanden${skipped ? `, ${skipped} übersprungen` : ''}`);
process.exit(failed ? 1 : 0);
