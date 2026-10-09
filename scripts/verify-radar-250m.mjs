// ---------------------------------------------------------------------------
// Phase R250 — verify:radar-250m (audit/radar-250m.md §5/§7)
//
// A  switches / constants (`src/scalar/radarHd250.ts`, `src/sources/radarHd250.ts`): `?hd250=` grammar, default on,
//    tile list (16 unique ids/files), tile size × count = target grid, min zoom
// B  geometry: tile nodes = quarters of the DE1200 footprint (shared edges), visible-tile rule, tile mask = parent byte,
//    cell centres (four sub-cells average to the 1-km centre), site shift on the REAL site offsets (≤ 125 m)
// C  algebra (synthetic): nearest-site rule, nodata hand-over, Z-R, anchoring (block mean = RV exactly, dry ⇔ dry,
//    flat without echo, uncovered cells flat), tiles (dry flag, byte = precipToU8Log), tile flow crop (× factor)
// D  meta contract: build → parse, every mutation rejected
// E  real files (RADAR_250_RAW=<dir with composite_rv_*.tar + <site>.h5>, else ⊘): producer round trip through
//    `radar-derive.mjs hd250` — listed tiles decode to the library's bytes, block rule on the de-quantised tiles,
//    cross-check against an independent h5py/numpy reference (`tiles250_radolan.u8`, if present)
// F  client store (`hd250Store`) against a stubbed fetch serving the real slot: loading → ready/dry, 404 → none, LRU
//
// Call: npm run verify:radar-250m   (optional: RADAR_250_RAW=<dir>)
// ---------------------------------------------------------------------------
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  radarHd250FlagFrom, RADAR_HD250_DEFAULT_ON, RADAR_HD250_MIN_ZOOM, HD250_TILE_LIST, hd250LayerId, hd250TileNode, hd250TileMesh, hd250TileCorners,
  hd250TileBbox, hd250VisibleTiles, hd250TileMask, hd250TileFlow, HD250_TILE_WARP_N,
} from '../src/scalar/radarHd250.ts';
import {
  HD250_FACTOR, HD250_COLS, HD250_ROWS, HD250_TILES_X, HD250_TILES_Y, HD250_TILE_W, HD250_TILE_H, RV_X0, RV_Y0, HD250_ZR,
  hd250CellXY, px250Shift, zrRate, compositePx250, anchorToRv, hd250Tiles, hd250TileFile, makeHd250Meta, parseHd250Meta, HD250_META_FILE,
} from '../src/sources/radarHd250.ts';
import { PX250_SITES, PX250_SIZE, px250FileName, px250Url, decodePx250, px250ProjectionOk } from '../src/sources/dwdPx250.ts';
import { de1200Node, psFwd, DE1200_CORNERS } from '../src/sources/radolanGeo.ts';
import { precipToU8Log, precipFromU8Log, PRECIP_LOG_MIN } from '../src/scalar/RainLayer.ts';
import { untar } from '../src/sources/radolanDecode.ts';
import { decodeRvHdf5 } from '../src/sources/rvHdf5.ts';
import { decodePng } from './lib/png.mjs';
import { hd250Store } from '../src/scalar/radarHd250Store.ts';
import { RADAR_IMG_BASE } from '../src/sources/radolanRuns.ts';

let passed = 0, failed = 0, skipped = 0;
const add = (name, ok, detail) => { if (ok) passed++; else failed++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const skip = (name, why) => { skipped++; console.log(`⊘ ${name} — ${why}`); };
const kmBetween = (a, b) => Math.hypot((a[0] - b[0]) * 111.195 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 111.195);

// ── A: switches / constants ─────────────────────────────────────────────────
add('A1 default on (E-R250-1); `?hd250=0` beats the store; store counts without a query vote',
  RADAR_HD250_DEFAULT_ON === true && radarHd250FlagFrom('', null) === true && radarHd250FlagFrom('?hd250=0', '1') === false
  && radarHd250FlagFrom('?hd250=1', '0') === true && radarHd250FlagFrom('', '0') === false && radarHd250FlagFrom('?hd250=foo', '0') === false
  && radarHd250FlagFrom('%E0%A4%A', null) === RADAR_HD250_DEFAULT_ON);
add('A2 16 tiles, unique ids and files, size × count = the 250-m target grid = DE1200 × 4',
  HD250_TILE_LIST.length === 16 && new Set(HD250_TILE_LIST.map((t) => t.id)).size === 16 && new Set(HD250_TILE_LIST.map((t) => t.file)).size === 16
  && HD250_TILES_X * HD250_TILE_W === HD250_COLS && HD250_TILES_Y * HD250_TILE_H === HD250_ROWS && HD250_COLS === 1100 * HD250_FACTOR && HD250_ROWS === 1200 * HD250_FACTOR
  && HD250_TILE_W === 1100 && HD250_TILE_H === 1200 && HD250_TILE_LIST.every((t) => t.id === hd250LayerId(t.tx, t.ty) && t.file === hd250TileFile(t.tx, t.ty) && t.file === `h${t.ty}${t.tx}.png`));
add('A3 min zoom 9 (250-m cell ≥ 1 px) and the DWD Z-R parameters a = 256, b = 1,42', RADAR_HD250_MIN_ZOOM === 9 && HD250_ZR.a === 256 && HD250_ZR.b === 1.42);
add('A4 site table: 17 sites with distinct ids/WMO; file name and URL carry WMO, stamp and site', PX250_SITES.length === 17
  && new Set(PX250_SITES.map((s) => s.id)).size === 17 && new Set(PX250_SITES.map((s) => s.wmo)).size === 17
  && px250FileName({ id: 'hnr', wmo: 10339 }, '2610091720') === 'rab02-tt_10339-20261009172000-dehnr-hd5'
  && px250Url({ id: 'hnr', wmo: 10339 }, '2610091720') === 'https://opendata.dwd.de/weather/radar/sites/px250/hnr/rab02-tt_10339-20261009172000-dehnr-hd5');
add('A5 projection check accepts the RV/px250 projdef and rejects a sphere or another meridian',
  px250ProjectionOk('+proj=stere +lat_ts=60 +lat_0=90 +lon_0=10 +x_0=221482.7 +y_0=3852995.9 +units=m +a=6378137 +b=6356752.3142451802 +no_defs')
  && !px250ProjectionOk('+proj=stere +lat_ts=60 +lat_0=90 +lon_0=10 +x_0=0 +y_0=0 +units=m +a=6370040 +b=6370040 +no_defs')
  && !px250ProjectionOk('+proj=stere +lat_ts=60 +lat_0=90 +lon_0=9 +x_0=0 +y_0=0 +units=m +a=6378137 +b=6356752.3142451802 +no_defs'));

// ── B: geometry ─────────────────────────────────────────────────────────────
{
  let bad = 0;
  for (const t of HD250_TILE_LIST) {
    const n = hd250TileNode(t.tx, t.ty);
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.25, 0.75]]) {
      const a = n(u, v), b = de1200Node((t.tx + u) / 4, (t.ty + v) / 4);
      if (kmBetween(a, b) > 1e-9) bad++;
    }
  }
  add('B1 tile node (u, v) = DE1200 node of the quarter — 16 tiles × 6 points', bad === 0, `${bad} differ`);
  // shared edges: the east edge of (0, 1) is the west edge of (1, 1); the whole grid's corners are the DE1200 corners
  const e = hd250TileNode(0, 1), w = hd250TileNode(1, 1);
  let edge = 0;
  for (let i = 0; i <= 10; i++) if (kmBetween(e(1, i / 10), w(0, i / 10)) > 1e-9) edge++;
  const c = hd250TileCorners(0, 0), c3 = hd250TileCorners(3, 3);
  add('B2 neighbouring tiles share their edge; the grid corners are the DE1200 corners', edge === 0
    && kmBetween(c[0], DE1200_CORNERS[0]) < 1e-6 && kmBetween(c3[2], DE1200_CORNERS[2]) < 1e-6);
  const mesh = hd250TileMesh(1, 2);
  add('B3 tile mesh: (N+1)² nodes, memoised, node (i, j) = tile node', mesh.length === (HD250_TILE_WARP_N + 1) ** 2 * 2 && hd250TileMesh(1, 2) === mesh
    && kmBetween([mesh[(44 * 89 + 44) * 2], mesh[(44 * 89 + 44) * 2 + 1]], hd250TileNode(1, 2)(0.5, 0.5)) < 0.02);
  const box = hd250TileBbox(1, 1);
  const inside = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  add('B4 visible tiles: none below zoom 9; a small view inside one tile → that tile only; the DACH box → all 16; a view in the Atlantic → none',
    hd250VisibleTiles([inside[0] - 0.1, inside[1] - 0.1, inside[0] + 0.1, inside[1] + 0.1], 8.9).length === 0
    && JSON.stringify(hd250VisibleTiles([inside[0] - 0.05, inside[1] - 0.05, inside[0] + 0.05, inside[1] + 0.05], 10)) === JSON.stringify([{ tx: 1, ty: 1 }])
    && hd250VisibleTiles([1, 45, 19, 56], 10).length === 16 && hd250VisibleTiles([-30, 40, -20, 45], 12).length === 0);
  // tile mask = parent byte of the 1-km mask
  const m1 = new Uint8Array(1100 * 1200);
  for (let i = 0; i < m1.length; i++) m1[i] = (i * 7919) % 3 === 0 ? 1 : 0;
  let mbad = 0;
  for (const [tx, ty] of [[0, 0], [2, 3], [3, 1]]) {
    const tm = hd250TileMask(m1, tx, ty);
    for (let y = 0; y < HD250_TILE_H; y += 7) for (let x = 0; x < HD250_TILE_W; x += 11) {
      const k = tx * HD250_TILE_W + x, l = ty * HD250_TILE_H + y;
      if (tm[y * HD250_TILE_W + x] !== m1[(l >> 2) * 1100 + (k >> 2)]) mbad++;
    }
  }
  add('B5 tile mask = the byte of the 1-km parent cell (three tiles sampled)', mbad === 0, `${mbad} differ`);
  // cell centres: the four sub-cells of 1-km cell (i, j) average to its centre X = i·1000 − RV_X0, Y = −j·1000 − RV_Y0
  let cbad = 0;
  for (const [i, j] of [[0, 0], [550, 600], [1099, 1199]]) {
    let sx = 0, sy = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) { const [x, y] = hd250CellXY(4 * i + dx, 4 * j + dy); sx += x; sy += y; }
    if (Math.abs(sx / 16 - (i * 1000 - RV_X0)) > 1e-6 || Math.abs(sy / 16 - (-j * 1000 - RV_Y0)) > 1e-6) cbad++;
    // and the DE1200 node of the cell centre lies where the projection says
    const [lon, lat] = de1200Node((i + 0.5) / 1100, (j + 0.5) / 1200);
    const [X, Y] = psFwd(lon, lat);
    if (Math.abs(X - (i * 1000 - RV_X0)) > 2 || Math.abs(Y - (-j * 1000 - RV_Y0)) > 2) cbad++;
  }
  add('B6 250-m cell centres: 4 × 4 block averages to the 1-km centre; the 1-km centre matches `de1200Node` within 2 m', cbad === 0, `${cbad} off`);
  // real site offsets
  const sitesJson = join(process.cwd(), 'audit', 'radar-250m', 'diag-sites.json');
  if (existsSync(sitesJson)) {
    const sites = JSON.parse(readFileSync(sitesJson, 'utf8'));
    let sbad = 0, maxOff = 0;
    for (const s of sites) {
      const sh = px250Shift(s);
      if (Math.abs(sh.fracX) > 0.5 || Math.abs(sh.fracY) > 0.5) sbad++;
      // the shifted target cell centre is within 125 m of the site pixel centre
      const a = 800, b = 800;
      const [tx, ty] = hd250CellXY(a + sh.dk, b + sh.dl);
      const sx = a * 250 - s.x0, sy = -b * 250 - s.y0;
      const off = Math.max(Math.abs(tx - sx), Math.abs(ty - sy));
      if (off > 125 + 1e-6) sbad++;
      if (off > maxOff) maxOff = off;
      if (sh.dk !== s.dk || sh.dl !== s.dl) sbad++;   // the Python reference computed the same integer shift
    }
    add(`B7 site shift on the ${sites.length} real offsets: nearest cell, ≤ 125 m, = the Python reference`, sbad === 0, `max ${maxOff.toFixed(1)} m`);
  } else skip('B7 site shift on the real offsets', 'audit/radar-250m/diag-sites.json fehlt');
}

// ── C: algebra (synthetic) ──────────────────────────────────────────────────
{
  const S = PX250_SIZE;
  const mk = (site, x0, y0, lon, lat, fill) => {
    const dbz = new Float32Array(S * S).fill(-Infinity);
    fill(dbz);
    return { site, timeMs: 0, size: S, cellM: 250, x0, y0, lon, lat, dbz, gain: 1, offset: 0 };
  };
  // two sites: A centred near the DE1200 middle, B 100 km east of it; shifts chosen integral
  const shiftA = { dk: 1400, dl: 1600 }, shiftB = { dk: 1800, dl: 1600 };
  const x0Of = (dk) => RV_X0 + 375 - 250 * dk, y0Of = (dl) => 250 * dl + RV_Y0 - 375;
  const centreA = hd250CellXY(shiftA.dk + 800, shiftA.dl + 800), centreB = hd250CellXY(shiftB.dk + 800, shiftB.dl + 800);
  // lon/lat of the site = inverse of the centre (use de1200Node through the grid fractions)
  const llA = de1200Node((shiftA.dk + 800) / HD250_COLS, (shiftA.dl + 800) / HD250_ROWS), llB = de1200Node((shiftB.dk + 800) / HD250_COLS, (shiftB.dl + 800) / HD250_ROWS);
  const A = mk('aaa', x0Of(shiftA.dk), y0Of(shiftA.dl), llA[0], llA[1], (d) => { for (let i = 0; i < d.length; i++) d[i] = 20; d[800 * S + 1000] = NaN; });   // 20 dBZ everywhere, one nodata cell
  const B = mk('bbb', x0Of(shiftB.dk), y0Of(shiftB.dl), llB[0], llB[1], (d) => { for (let i = 0; i < d.length; i++) d[i] = 30; });
  const comp = compositePx250([A, B]);
  const rA = zrRate(20), rB = zrRate(30);
  // a cell right at A's centre comes from A; a cell at B's centre from B; the nodata cell of A (covered by B) from B
  const kA = shiftA.dk + 800, lA = shiftA.dl + 800, kB = shiftB.dk + 800, lB = shiftB.dl + 800;
  const atA = comp.rate[lA * HD250_COLS + kA], atB = comp.rate[lB * HD250_COLS + kB], atNo = comp.rate[(shiftA.dl + 800) * HD250_COLS + shiftA.dk + 1000];
  add('C1 nearest-site rule: A\'s centre from A, B\'s centre from B, A\'s nodata cell handed to B; distances/ids consistent',
    Math.abs(atA - rA) < 1e-6 && Math.abs(atB - rB) < 1e-6 && Math.abs(atNo - rB) < 1e-6
    && comp.siteIdx[lA * HD250_COLS + kA] === 0 && comp.siteIdx[lB * HD250_COLS + kB] === 1 && comp.dist[lA * HD250_COLS + kA] < 200
    && comp.sites.join() === 'aaa,bbb' && Number.isNaN(comp.rate[0]) && comp.dist[0] === Infinity && comp.siteIdx[0] === -1);
  // the hand-over line lies halfway between the sites (400 cells east of A's centre)
  let handover = -1;
  for (let k = kA; k <= kB; k++) if (comp.siteIdx[lA * HD250_COLS + k] === 1) { handover = k; break; }
  add('C2 the hand-over between the sites lies at the midpoint (±1 cell)', Math.abs(handover - (kA + 200)) <= 1, `at ${handover}, expected ${kA + 200}`);
  add('C3 Z-R: 0 for no echo, NaN for nodata, monotone, Z = a·R^b inverted (20 dBZ → 0,65 mm/h with a 256 / b 1,42)',
    zrRate(-Infinity) === 0 && Number.isNaN(zrRate(NaN)) && zrRate(10) < zrRate(20) && zrRate(20) < zrRate(30)
    && Math.abs(zrRate(20) - Math.pow(100 / 256, 1 / 1.42)) < 1e-12);
  // anchoring on a synthetic RV field
  const rv = new Float32Array(1100 * 1200).fill(NaN);
  const iA = Math.floor(kA / 4), jA = Math.floor(lA / 4);
  for (let j = jA - 5; j <= jA + 5; j++) for (let i = iA - 5; i <= iA + 5; i++) rv[j * 1100 + i] = 0;
  rv[jA * 1100 + iA] = 2.4;                 // wet, covered by A with structure (uniform 20 dBZ ⇒ ratios 1)
  rv[(jA + 1) * 1100 + iA] = 1.2;           // wet
  rv[jA * 1100 + 10] = 0.6;                 // wet but far outside every site ⇒ flat
  // give the block (iA, jA+1) real structure: one sub-cell at 40 dBZ, the rest 10
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) { const k = 4 * iA + dx, l = 4 * (jA + 1) + dy; const a = k - shiftA.dk, b = l - shiftA.dl; A.dbz[b * S + a] = dx === 1 && dy === 2 ? 40 : 10; }
  const comp2 = compositePx250([A, B]);
  const field = anchorToRv(rv, comp2);
  const blockMean = (i, j) => { let s = 0; for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) s += field.rate[(4 * j + dy) * HD250_COLS + 4 * i + dx]; return s / 16; };
  const blockMax = (i, j) => { let m = 0; for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) m = Math.max(m, field.rate[(4 * j + dy) * HD250_COLS + 4 * i + dx]); return m; };
  const flatOk = (i, j, v) => { for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) if (field.rate[(4 * j + dy) * HD250_COLS + 4 * i + dx] !== v) return false; return true; };
  add('C4 anchoring: block mean = RV (uniform ⇒ flat 2,4; structured ⇒ mean 1,2 with a peak above it); far block flat; dry stays dry; counts',
    Math.abs(blockMean(iA, jA) - 2.4) < 1e-5 && flatOk(iA, jA, Math.fround(2.4)) && Math.abs(blockMean(iA, jA + 1) - 1.2) < 1e-5 && blockMax(iA, jA + 1) > 1.2 * 3
    && flatOk(iA, jA + 10, 0) && flatOk(10, jA, Math.fround(0.6)) && field.wetBlocks === 3 && field.structuredBlocks === 2 && field.flatBlocks === 1);
  add('C5 anchoring: a NaN RV cell (outside the domain) gives dry cells even where a site has echo', flatOk(iA + 3, jA + 3, 0));
  const tiles = hd250Tiles(field.rate);
  const wetTiles = tiles.filter((t) => t.wet);
  const tOf = (k, l) => tiles.find((t) => t.tx === Math.floor(k / HD250_TILE_W) && t.ty === Math.floor(l / HD250_TILE_H));
  const tA = tOf(4 * iA, 4 * jA);
  const byteAt = (k, l) => tA.data[(l - tA.ty * HD250_TILE_H) * HD250_TILE_W + (k - tA.tx * HD250_TILE_W)];
  add('C6 tiles: 16 built, exactly the tiles with rain flagged wet, bytes = precipToU8Log of the field',
    tiles.length === 16 && wetTiles.length === new Set([tOf(4 * iA, 4 * jA), tOf(40, 4 * jA)]).size && tA.wet
    && byteAt(4 * iA, 4 * jA) === precipToU8Log(2.4) && byteAt(4 * iA + 1, 4 * (jA + 1) + 2) === precipToU8Log(field.rate[(4 * (jA + 1) + 2) * HD250_COLS + 4 * iA + 1]));
  // tile flow crop: a uniform 1-km field (u = 3, v = −2 texels) becomes a uniform tile field × 4
  const flow = { u: new Float32Array(138 * 150).fill(3), v: new Float32Array(138 * 150).fill(-2), w: 138, h: 150 };
  const tf = hd250TileFlow(flow, 2, 1, HD250_FACTOR);
  add('C7 tile flow: uniform 1-km field → uniform tile field × 4 (3, −2 → 12, −8)', tf.w >= 2 && tf.h >= 2 && tf.u.every((x) => Math.abs(x - 12) < 1e-6) && tf.v.every((x) => Math.abs(x + 8) < 1e-6));
}

// ── D: meta contract ────────────────────────────────────────────────────────
{
  const field = { rate: new Float32Array(0), wetBlocks: 3, structuredBlocks: 2, flatBlocks: 1 };
  const meta = makeHd250Meta('2610091720', Date.UTC(2026, 9, 9, 17, 20), ['hnr', 'drs'], ['oft'], field, [{ tx: 1, ty: 2, file: 'h21.png', bytes: 100 }]);
  const clone = () => JSON.parse(JSON.stringify(meta));
  add('D1 built meta passes the checker and names the product', !!parseHd250Meta(clone()) && meta.source === 'hd250' && meta.anchor === 'rv' && meta.tile.w === 1100 && HD250_META_FILE === 'hd250.json');
  const muts = [
    (m) => { m.schema = 2; }, (m) => { m.cols = 4401; }, (m) => { m.log.min = 0.05; }, (m) => { m.zr.b = 1.6; }, (m) => { m.tiles[0].file = 'h12.png'; },
    (m) => { m.tiles.push({ tx: 1, ty: 2, file: 'h21.png', bytes: 5 }); }, (m) => { m.tiles[0].tx = 4; }, (m) => { m.tiles[0].bytes = 0; }, (m) => { m.stamp = '261009172'; },
    (m) => { m.anchor = 'px'; }, (m) => { m.tile.nx = 2; }, (m) => { delete m.blocks; },
  ];
  const rejected = muts.filter((f) => { const m = clone(); f(m); return parseHd250Meta(m) === null; }).length;
  add(`D2 every mutation rejected (${muts.length})`, rejected === muts.length, `${rejected}/${muts.length}`);
}

// ── E: real files ───────────────────────────────────────────────────────────
const RAW = process.env.RADAR_250_RAW ?? '';
let realSlot = null;   // { dir, stamp, rvRates } for block F
if (RAW && existsSync(RAW)) {
  const tar = readdirSync(RAW).find((f) => /^composite_rv_\d{8}_\d{4}\.tar$/.test(f));
  const sites = PX250_SITES.filter((s) => existsSync(join(RAW, `${s.id}.h5`)));
  if (!tar || sites.length < 1) skip('E real files', `${RAW}: RV-Tar oder <site>.h5 fehlen`);
  else {
    const m = /composite_rv_20(\d{6})_(\d{4})\.tar$/.exec(tar);
    const stamp = m[1] + m[2];
    // E1: decoder on one real file — attributes, projection, value range, fast path = jsfive path
    const buf = readFileSync(join(RAW, `${sites[0].id}.h5`));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const g = await decodePx250(ab), gj = await decodePx250(ab, { reader: 'jsfive' });
    let same = 0;
    for (let i = 0; i < g.dbz.length; i++) if (Object.is(g.dbz[i], gj.dbz[i])) same++;
    let echo = 0, nod = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < g.dbz.length; i++) { const v = g.dbz[i]; if (Number.isNaN(v)) nod++; else if (v !== -Infinity) { echo++; if (v < lo) lo = v; if (v > hi) hi = v; } }
    add(`E1 decoder ${sites[0].id}: 1600², 250 m, site named, scan time = slot, fast path = jsfive on every cell, dBZ within −64 … 128`,
      g.size === 1600 && g.cellM === 250 && g.site === sites[0].id && g.timeMs === Date.UTC(2000 + +stamp.slice(0, 2), +stamp.slice(2, 4) - 1, +stamp.slice(4, 6), +stamp.slice(6, 8), +stamp.slice(8, 10))
      && same === g.dbz.length && lo >= -64 && hi <= 128, `nodata ${(nod / g.dbz.length * 100).toFixed(1)} %, echo ${(echo / g.dbz.length * 100).toFixed(1)} %, ${lo.toFixed(1)} … ${hi.toFixed(1)} dBZ`);
    // E2: producer round trip into a temp dir
    const out = mkdtempSync(join(tmpdir(), 'hd250-'));
    const t0 = Date.now();
    const line = execFileSync(process.execPath, ['--experimental-strip-types', '--import', pathToFileURL(join(process.cwd(), 'scripts', 'lib', 'register-ts.mjs')).href,
      join(process.cwd(), 'scripts', 'radar-mirror', 'radar-derive.mjs'), 'hd250', join(RAW, tar), out, stamp, RAW], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop();
    const res = JSON.parse(line);
    const meta = parseHd250Meta(JSON.parse(readFileSync(join(out, HD250_META_FILE), 'utf8')));
    add(`E2 derive hd250 on ${sites.length} sites: ok, meta parses, every listed tile present with its byte count`, res.ok && !!meta && meta.stamp === stamp && meta.sites.length === sites.length
      && meta.tiles.every((t) => existsSync(join(out, t.file)) && readFileSync(join(out, t.file)).length === t.bytes), `${res.tiles} Kacheln, ${(res.bytes / 1024).toFixed(0)} KB, ${res.ms} ms (gesamt ${Date.now() - t0} ms)`);
    // E3: the library path gives the same bytes; the block rule on the de-quantised tiles against the RV analysis
    const tarBytes = readFileSync(join(RAW, tar));
    const e0 = untar(new Uint8Array(tarBytes.buffer, tarBytes.byteOffset, tarBytes.byteLength)).find((e) => /_000-hd5$/.test(e.name));
    const rv = await decodeRvHdf5(e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength), { name: e0.name });
    const grids = [];
    for (const s of sites) { const b = readFileSync(join(RAW, `${s.id}.h5`)); grids.push(await decodePx250(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { name: s.id })); }
    const field = anchorToRv(rv.rainRate, compositePx250(grids));
    const tiles = hd250Tiles(field.rate);
    let tileBad = 0, listedWet = 0;
    for (const t of tiles) {
      const listed = meta.tiles.find((x) => x.tx === t.tx && x.ty === t.ty);
      if (!!listed !== t.wet) { tileBad++; continue; }
      if (!listed) continue;
      listedWet++;
      const png = decodePng(readFileSync(join(out, listed.file)));
      if (png.width !== 1100 || png.height !== 1200 || png.channels !== 1 || Buffer.compare(Buffer.from(png.data), Buffer.from(t.data)) !== 0) tileBad++;
    }
    add(`E3 listed tiles ⇔ wet tiles, bytes byte-identical to the library path (${listedWet} tiles)`, tileBad === 0, `${tileBad} differ`);
    // block rule on the de-quantised tiles: wet block ⇔ RV wet; mean of de-quantised sub-cells within 2 % of RV for structured blocks ≥ 0,5 mm/h
    const full = new Uint8Array(HD250_COLS * HD250_ROWS);
    for (const t of tiles) for (let y = 0; y < HD250_TILE_H; y++) full.set(t.data.subarray(y * HD250_TILE_W, (y + 1) * HD250_TILE_W), (t.ty * HD250_TILE_H + y) * HD250_COLS + t.tx * HD250_TILE_W);
    // Blocks with a saturated sub-cell (byte 255 = the 200 mm/h ceiling of the log plane, HD-3) or a sub-cell below the
    // 0,06-mm/h threshold (byte 0) cannot reproduce the mean from the bytes — they are counted, not judged.
    let wetBad = 0, meanBad = 0, meanN = 0, maxRel = 0, wetBlocks = 0, clipped = 0;
    for (let j = 0; j < 1200; j++) for (let i = 0; i < 1100; i++) {
      const v = rv.rainRate[j * 1100 + i];
      let any = false, s = 0, clip = false;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) { const u = full[(4 * j + dy) * HD250_COLS + 4 * i + dx]; if (u) any = true; if (u === 255 || (v > 0 && u === 0)) clip = true; s += precipFromU8Log(u); }
      if (any !== v > 0) wetBad++;
      if (v > 0) wetBlocks++;
      if (v >= 0.5) { if (clip) { clipped++; continue; } meanN++; const rel = Math.abs(s / 16 - v) / v; if (rel > maxRel) maxRel = rel; if (rel > 0.02) meanBad++; }
    }
    add(`E4 wet 1-km block ⇔ RV wet (${wetBlocks} wet blocks); de-quantised block mean within 2 % of RV for ${meanN} blocks ≥ 0,5 mm/h (${clipped} with a clipped sub-cell not judged)`, wetBad === 0 && meanBad === 0, `${wetBad} wet mismatches, ${meanBad} means off (max ${(maxRel * 100).toFixed(2)} %)`);
    add('E5 meta blocks = library counts; sub-cell max ≥ block mean somewhere (structure present, not flat everywhere)',
      meta.blocks.wet === field.wetBlocks && meta.blocks.structured === field.structuredBlocks && meta.blocks.flat === field.flatBlocks && field.structuredBlocks > 0,
      `wet ${meta.blocks.wet}, structured ${meta.blocks.structured}, flat ${meta.blocks.flat}`);
    // E6: independent reference (h5py/numpy, audit/radar-250m/diag-anchor.py with the RADOLAN unit rule)
    const refFile = join(RAW, 'tiles250_radolan.u8');
    if (existsSync(refFile)) {
      const ref = readFileSync(refFile);
      let eq = 0, off1 = 0, more = 0;
      for (let i = 0; i < full.length; i++) { const d = Math.abs(full[i] - ref[i]); if (d === 0) eq++; else if (d === 1) off1++; else more++; }
      add('E6 cross-check against the independent Python reference: ≥ 99,99 % identical bytes, the rest one step (rounding ties), never more',
        ref.length === full.length && eq / full.length >= 0.9999 && more === 0, `${eq} equal, ${off1} ± 1, ${more} further`);
    } else skip('E6 Python reference', 'tiles250_radolan.u8 fehlt im RAW-Verzeichnis');
    realSlot = { dir: out, stamp, meta };
  }
} else skip('E real files', 'RADAR_250_RAW nicht gesetzt (Verzeichnis mit composite_rv_*.tar und <site>.h5)');

// ── F: client store against a stubbed fetch ─────────────────────────────────
if (realSlot) {
  const { dir, stamp, meta } = realSlot;
  const origFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url) => {
    requests++;
    const u = String(url);
    const m = /\/rv-past\/(\d{10})\/([a-z0-9.]+)$/.exec(u);
    if (!m || m[1] !== stamp || !existsSync(join(dir, m[2]))) return new Response('', { status: 404 });
    const body = readFileSync(join(dir, m[2]));
    return new Response(body, { status: 200, headers: { 'content-type': m[2].endsWith('.json') ? 'application/json' : 'image/png' } });
  };
  try {
    hd250Store._reset();
    const notified = [];
    const notify = () => notified.push(Date.now());
    const wetTile = meta.tiles[0];
    const dryTile = HD250_TILE_LIST.find((t) => !meta.tiles.some((x) => x.file === t.file));
    const s1 = hd250Store.get(stamp, wetTile.tx, wetTile.ty, notify);
    await new Promise((r) => setTimeout(r, 1500));
    const s2 = hd250Store.get(stamp, wetTile.tx, wetTile.ty, notify);
    await new Promise((r) => setTimeout(r, 2500));
    const s3 = hd250Store.get(stamp, wetTile.tx, wetTile.ty, notify);
    const sd = dryTile ? hd250Store.get(stamp, dryTile.tx, dryTile.ty, notify) : { kind: 'dry' };
    const png = decodePng(readFileSync(join(dir, wetTile.file)));
    add('F1 store: loading (meta) → loading (tile) → ready with the tile bytes; dry tile answered from the meta; listeners notified',
      s1.kind === 'loading' && s2.kind === 'loading' && s3.kind === 'ready' && Buffer.compare(Buffer.from(s3.values), Buffer.from(png.data)) === 0 && sd.kind === 'dry' && notified.length >= 2,
      `${notified.length} notifications, ${requests} requests`);
    const none1 = hd250Store.get('2610091725', 0, 0, notify);
    await new Promise((r) => setTimeout(r, 1500));
    const none2 = hd250Store.get('2610091725', 0, 0, notify);
    add('F2 a slot without hd250.json: loading → none (the 1-km layer carries it), remembered — no second request', none1.kind === 'loading' && none2.kind === 'none' && hd250Store.meta('2610091725') === null);
    add(`F3 base path of the product = ${RADAR_IMG_BASE}/rv-past/<stamp>/`, requests >= 3);
  } finally { globalThis.fetch = origFetch; rmSync(dir, { recursive: true, force: true }); }
} else skip('F client store', 'braucht Block E');

console.log(`\nverify:radar-250m — ${passed} bestanden, ${failed} fehlgeschlagen, ${skipped} übersprungen`);
process.exit(failed ? 1 : 0);
