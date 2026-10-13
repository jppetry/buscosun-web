// Phase SE — SE-1 step C (R-SE-5) and the pictures: the producer's rule on the FULL field of collected slots.
// Per slot: the mask of the analysis with `fill` off and on (cells wet / masked by votes / by the fill / kept / unvoted),
// the outcome at every blue station pixel (for the scorer: R-SE-1 again with the fill), and with --leads the masked
// cells per forecast frame. With --png=<file> and --box=w,s,e,n a before/after picture of the box (analysis, log ramp).
// Output: <out>/field-<slot>.json. Uses the same functions as scripts/radar-mirror/clutter-step.mjs.
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-stoerecho/field.mjs
//          <store> <extractDir> --out=<dir> [--part=0/4] [--only=slot,…] [--leads] [--png=<file> --box=8.05,50.2,9.35,50.95]
//          [--rho=0.8 --zcap=15 --kernel=3]     (default: CLUTTER_RULE)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { untar } from '../../src/sources/radolanDecode.ts';
import { decodeRvHdf5, decodeRvHdf5Tar } from '../../src/sources/rvHdf5.ts';
import { psFwd, DE1200_CORNERS } from '../../src/sources/radolanGeo.ts';
import { decodePx250, PX250_SITES } from '../../src/sources/dwdPx250.ts';
import { decodeSweep } from '../../src/sources/dwdSweep.ts';
import { siteRho, siteLattice, sameScan, siteBlocks, clutterMask, applyClutterToRun, CLUTTER_RULE } from '../../src/sources/radarClutter.ts';
import { RADAR_DISPLAY_MIN_MMH } from '../../src/scalar/radarHd.ts';
import { precipToU8Log, precipRainRampLog } from '../../src/scalar/RainLayer.ts';
import { encodePng } from '../../scripts/lib/png.mjs';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const [store, exDir] = args.filter((a) => !a.startsWith('--'));
const out = opt.out ?? 'C:/dev/buscosun-radar-truth/se-field';
mkdirSync(out, { recursive: true });
const [part, parts] = (opt.part ?? '0/1').split('/').map(Number);
const RULE = { ...CLUTTER_RULE, ...(opt.rho ? { rhoMax: +opt.rho } : {}), ...(opt.zcap ? { zCapDbz: +opt.zcap } : {}), ...(opt.kernel ? { kernel: +opt.kernel } : {}) };
const stations = JSON.parse(readFileSync(join(exDir, 'stations.json'), 'utf8'));
const only = opt.only ? new Set(opt.only.split(',')) : null;
const slots = readdirSync(store).filter((d) => /^\d{8}_\d{4}$/.test(d)).sort().filter((d, i) => (only ? only.has(d) : i % parts === part));
const inflate = (b) => inflateSync(b);
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const lattices = new Map();
const t0 = Date.now();

for (const [n, slot] of slots.entries()) {
  const file = join(out, `field-${slot}.json`);
  if (existsSync(file) && !opt.force && !opt.png) continue;
  const dir = join(store, slot);
  if (!existsSync(join(dir, 'rv.tar'))) continue;
  const tarBuf = readFileSync(join(dir, 'rv.tar'));
  const tar = new Uint8Array(tarBuf.buffer, tarBuf.byteOffset, tarBuf.byteLength);
  const e0 = untar(tar).find((e) => /_000-hd5$/.test(e.name));
  const rv = await decodeRvHdf5(e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength), { units: 'native', name: e0.name });
  const wet = new Uint8Array(rv.rainRate.length);
  for (let k = 0; k < wet.length; k++) wet[k] = precipToU8Log(rv.rainRate[k]);
  const tS = Date.now();
  const blocks = [];
  let withSweep = 0;
  for (const site of PX250_SITES) {
    const pg = join(dir, `px250-${site.id}.h5`), ps = join(dir, `rhohv-${site.id}.h5`);
    if (!existsSync(pg)) continue;
    let g; try { g = await decodePx250(ab(pg), { name: pg, inflate }); } catch { continue; }
    if (g.timeMs !== rv.validAt.getTime()) continue;
    let sr = null, dbz0 = NaN;
    if (existsSync(ps)) { try { const sw = await decodeSweep(ab(ps), { name: ps, inflate }); if (sameScan(g, sw)) { const key = `${g.site}|${g.x0}|${g.y0}`; if (!lattices.has(key)) lattices.set(key, siteLattice(g)); sr = siteRho(g, sw, lattices.get(key)); dbz0 = sw.dbz0; withSweep++; } } catch { /* fail-open */ } }
    blocks.push(siteBlocks(g, sr, dbz0, RULE));
  }
  const tB = Date.now();
  const plain = clutterMask(wet, blocks, { ...RULE, fill: false });
  const filled = clutterMask(wet, blocks, { ...RULE, fill: true });
  const tM = Date.now();
  const st = [];
  for (const [si, s] of stations.entries()) {
    if (!s.covered) continue;
    const k = s.row * 1100 + s.col;
    if (!(rv.rainRate[k] >= RADAR_DISPLAY_MIN_MMH - 1e-6)) continue;
    st.push([si, plain.mask[k], filled.mask[k], plain.vote[k]]);
  }
  const res = { slot, validAt: rv.validAt.toISOString(), rule: RULE, sites: blocks.length, withSweep, wet: plain.wet, masked: plain.masked, filled: filled.filled, kept: plain.kept, unvoted: plain.unvoted, ms: { sites: tB - tS, mask: tM - tB }, stations: st };
  if (opt.leads) {
    const run = await decodeRvHdf5Tar(tar, { secondary: precipToU8Log, secondaryUnits: 'native' });
    const planes = run.frames.map((f) => f.values2.slice());
    const before = planes.map((p) => { let c = 0; for (let k = 0; k < p.length; k++) if (p[k]) c++; return c; });
    const tL = Date.now();
    const per = applyClutterToRun(planes, (opt.fill ? filled : plain).mask);
    res.leads = run.frames.map((f, i) => [f.leadMinutes, before[i], per[i]]);
    res.ms.leads = Date.now() - tL;
    // R-SE-5: with an empty mask no plane may change
    res.planesChanged = planes.reduce((a, p, i) => { const o = run.frames[i].values2; let d = 0; for (let k = 0; k < p.length; k++) if (p[k] !== o[k]) d++; return a + d; }, 0);
  }
  writeFileSync(file, JSON.stringify(res));
  if (opt.png) {
    const [bw, bs, be, bn] = (opt.box ?? '8.05,50.2,9.35,50.95').split(',').map(Number);
    const [NW, NE, , SW] = DE1200_CORNERS; const pNW = psFwd(...NW), pNE = psFwd(...NE), pSW = psFwd(...SW);
    const ij = (lon, lat) => { const [x, y] = psFwd(lon, lat); return [Math.floor((x - pNW[0]) / (pNE[0] - pNW[0]) * 1100), Math.floor((y - pNW[1]) / (pSW[1] - pNW[1]) * 1200)]; };
    const [i0, j0] = ij(bw, bn), [i1, j1] = ij(be, bs);
    const W = i1 - i0, H = j1 - j0, S = Math.max(2, Math.floor(480 / W)), GAP = 6, PAN = 3;
    const stops = Object.entries(precipRainRampLog).map(([k, c]) => [+k * 255, c.match(/[\d.]+/g).map(Number)]).sort((a, b) => a[0] - b[0]);
    const colour = (u) => { let c = stops[1][1]; for (const [k, col] of stops) if (k <= u) c = col; return c; };
    const SAND = [240, 238, 232], IW = PAN * (W * S + GAP) - GAP, img = new Uint8Array(IW * H * S * 3);
    const put = (x, y, rgb) => { const o = (y * IW + x) * 3; img[o] = rgb[0]; img[o + 1] = rgb[1]; img[o + 2] = rgb[2]; };
    // panel 0: as delivered · panel 1: votes (red = masked, green = precipitation vote, grey = no vote) · panel 2: after the filter
    const use = opt.fill ? filled : plain;
    for (let p = 0; p < PAN; p++) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = (j + j0) * 1100 + i + i0, u = wet[k];
      let rgb = SAND;
      if (u) {
        if (p === 1) rgb = use.mask[k] ? [214, 80, 70] : use.vote[k] === 2 ? [70, 150, 90] : [150, 150, 150];
        else if (p === 0 || !use.mask[k]) { const c = colour(u); rgb = [0, 1, 2].map((q) => Math.round(SAND[q] + (c[q] - SAND[q]) * c[3])); }
      }
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) put(p * (W * S + GAP) + i * S + dx, j * S + dy, rgb);
    }
    for (const s of stations) if (s.covered && s.col >= i0 && s.col < i1 && s.row >= j0 && s.row < j1) for (let p = 0; p < PAN; p++) for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) put(p * (W * S + GAP) + (s.col - i0) * S + (S >> 1) + e, (s.row - j0) * S + (S >> 1) + d, [0, 0, 0]);
    writeFileSync(opt.png, encodePng(IW, H * S, img, 3));
    console.log(`→ ${opt.png} (${IW} × ${H * S}; links geliefert, Mitte Stimmen rot = ausgeblendet / grün = Niederschlag / grau = keine Stimme, rechts nach dem Filter)`);
  }
  if (only || n % 10 === 0) console.log(`${slot} (${n + 1}/${slots.length}) ${((Date.now() - t0) / 1000).toFixed(0)} s · nass ${plain.wet} · ausgeblendet ${plain.masked} (+ Randschluss ${filled.filled}) · Niederschlag-Stimme ${plain.kept} · ohne Stimme ${plain.unvoted} · Standorte ${blocks.length}/${withSweep} · ms ${JSON.stringify(res.ms)}${res.leads ? ' · Leads ' + res.leads.filter((x, i) => i % 6 === 0).map((x) => `${x[0]}:${x[2]}/${x[1]}`).join(' ') + ` · geändert ${res.planesChanged}` : ''}`);
}
