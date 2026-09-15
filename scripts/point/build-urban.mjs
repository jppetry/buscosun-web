/**
 * build-urban.mjs — the static product `point/static/urban/v1/` (E-13).
 *
 * ── What it is ─────────────────────────────────────────────────────────────
 * PAP 5 of `ABLAUFPLAENE.md` reads `imperv` (urban heat island term) and the
 * displacement height `d0` (two-stage blending-height wind correction). Both are
 * fields 23/24 of the requirements table in `audit/punktdaten-versorgung.md` and
 * have been MISSING since PD-A ("noch nicht gemessen (E-13)"). This producer
 * fills them from the JRC Global Human Settlement Layer, release R2023A:
 *
 *   GHS-BUILT-S E2020       built-up surface, m² per 100-m cell (0…10 000)  → imperv
 *   GHS-BUILT-H ANBH E2018  average net building height, m                  → bldgH, d0
 *
 * Same container, same chunk raster, same path rule as `point/static/hmodel/v1/`
 * (`staticHmodel.mjs`): BSPC with an own plane list, `nt = 1`, `runHours = 0`,
 * `TIMELESS`. A client that reads `(cy, cx)` for its point reads one more file.
 *
 * ── Three planes, and why three ────────────────────────────────────────────
 *   imperv  %   scale 1     built-up share × 100 — an APPROXIMATION of imperviousness:
 *                           GHS-BUILT-S counts building footprints, not roads or pavement.
 *   d0      m   scale 0.1   0.7 × ANBH, capped at 25.5 m (the classic rule of thumb;
 *                           the 0.7 is a CHOICE and stated as such in the manifest)
 *   bldgH   m   scale 0.1   the ANBH mean itself, so the 0.7 is not baked in — a
 *                           calibration that wants 0.6 or a height-dependent rule
 *                           still has the raw number.
 *
 * Aggregation: area mean over all 100-m source cells whose CENTRE falls into the
 * t1 cell (0.05°, cell = ±deg/2 around `lat0 + iy·deg`, exactly `cellOf`'s rule).
 * The source is Mollweide (ESRI:54009); the reprojection is analytic — no
 * resampling, no intermediate raster. Nodata cells are counted, not averaged; a
 * t1 cell without a single valid source cell is MISSING.
 *
 * ── The projection radius is a measured decision, not a constant ───────────
 * See `urbanTiff.mjs`. The task brief named R = 6 371 007.181 m (authalic); PROJ
 * and ESRI use 6 378 137 m for 54009. The difference is 6.4 km in y at 48 °N.
 * The build samples GHS-BUILT-S along 9.49 °E across Lake Constance under BOTH
 * radii (Rorschach and Friedrichshafen are built right up to the water, so the
 * zero band IS the lake); it lands where it belongs under exactly one of them.
 * The build uses that one (`--radius=` overrides, for the record; `--no-transect`
 * skips the proof).
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/point/build-urban.mjs
 *     [--self-test]            pure checks, no network, exit 0/1
 *     [--dry]                  download + inspect IFDs + decode one tile, write nothing
 *     [--tiles=R4_C19,R3_C19]  restrict the tile set (default: derived from the domain)
 *     [--tiers=t1]             tiers to aggregate (default t1)
 *     [--radius=esri|authalic] projection sphere (default esri = 6 378 137 m)
 *     [--no-transect]          skip the Lake Constance radius proof
 *   env URBAN_OUT  the `point/` directory to write into (default data/urban-probe/point)
 *   env URBAN_CACHE  zip cache (default .cache/urban)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import {
  CHUNK_CELLS, MISSING, TIER_BY_ID, cellOf, chunkExtent, chunkOf, decodeCubeChunk, dequantize,
  encodeCubeChunk, quantize, staticChunkPath, staticManifestPath,
} from '../../src/point/cubeFormat.ts';
import { zipEntries } from './mosmix.mjs';
import {
  MOLLWEIDE_R_AUTHALIC, MOLLWEIDE_R_ESRI, decodeTiffTile, ghslTileExtent, ghslTileName, ghslTileOf,
  mollweideForward, mollweideInverse, mollweideRow, parseGhslTileName, parseTiff, tiffGeoOrigin,
  urbanTiffSelfTest,
} from './urbanTiff.mjs';

// ---------------------------------------------------------------------------
// Product constants
// ---------------------------------------------------------------------------

export const URBAN_PRODUCT = 'urban';
export const URBAN_VERSION = 'v1';

/** d0 = D0_FACTOR × mean building height, capped. The factor is a rule of thumb (Grimmond & Oke 1999 range 0.5–0.8). */
export const D0_FACTOR = 0.7;
export const D0_CAP_M = 25.5;

/** The plane list = the meaning of the three columns in every chunk. Order is contract. */
export const URBAN_PLANES = Object.freeze([
  Object.freeze({ id: 'imperv', unit: '%', scale: 1, offset: 0, range: [0, 100],
    what: 'Built-up surface share (GHS-BUILT-S E2020), area mean over the cell. Approximation of imperviousness: roads and pavement are NOT included.' }),
  Object.freeze({ id: 'd0', unit: 'm', scale: 0.1, offset: 0, range: [0, D0_CAP_M],
    what: `Displacement height = ${D0_FACTOR} × bldgH, capped at ${D0_CAP_M} m. The factor is a choice — bldgH carries the raw mean.` }),
  Object.freeze({ id: 'bldgH', unit: 'm', scale: 0.1, offset: 0, range: [0, 300],
    what: 'Average net building height (GHS-BUILT-H ANBH E2018), area mean over all valid source cells INCLUDING unbuilt ones (which carry 0).' }),
]);

const GHSL_BASE = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL';
export const GHSL_DATASETS = Object.freeze({
  builtS: Object.freeze({
    key: 'builtS',
    name: 'GHS_BUILT_S_E2020_GLOBE_R2023A_54009_100',
    dir: `${GHSL_BASE}/GHS_BUILT_S_GLOBE_R2023A/GHS_BUILT_S_E2020_GLOBE_R2023A_54009_100/V1-0/tiles/`,
    file: (r, c) => `GHS_BUILT_S_E2020_GLOBE_R2023A_54009_100_V1_0_R${r}_C${c}.zip`,
    epoch: 'E2020',
    unit: 'm² built-up per 100-m cell (0…10 000)',
    expectedNodata: 65535,
  }),
  anbh: Object.freeze({
    key: 'anbh',
    name: 'GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_54009_100',
    dir: `${GHSL_BASE}/GHS_BUILT_H_GLOBE_R2023A/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_54009_100/V1-0/tiles/`,
    file: (r, c) => `GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_54009_100_V1_0_R${r}_C${c}.zip`,
    epoch: 'E2018',
    unit: 'm, average net building height per 100-m cell',
    expectedNodata: 255,
  }),
});

export const URBAN_LICENCE = 'CC BY 4.0';
export const URBAN_ATTRIBUTION = 'Global Human Settlement Layer (GHSL), European Commission, Joint Research Centre — CC BY 4.0';
export const URBAN_CITATION = 'Pesaresi, M., Schiavina, M., Politis, P., Freire, S., Krasnodębska, K., Uhl, J. H., … Kemper, T. (2024). Advances on the Global Human Settlement Layer by joint assessment of Earth Observation and population survey data. International Journal of Digital Earth, 17(1). GHSL Data Package 2023 (R2023A).';

/** Probe points for the sanity report — city cores against rural controls. */
export const PROBE_POINTS = Object.freeze([
  { name: 'München (Marienplatz)', lat: 48.137, lon: 11.575, kind: 'city' },
  { name: 'Berlin (Alexanderplatz)', lat: 52.52, lon: 13.405, kind: 'city' },
  { name: 'Wien (Stephansplatz)', lat: 48.21, lon: 16.37, kind: 'city' },
  { name: 'Zürich (Hauptbahnhof)', lat: 47.38, lon: 8.54, kind: 'city' },
  { name: 'Zermatt', lat: 46.02, lon: 7.75, kind: 'alpine village' },
  { name: 'Rhön (Wasserkuppe)', lat: 50.5, lon: 9.94, kind: 'rural control' },
  { name: 'Bayerischer Wald (Nationalpark)', lat: 49.0, lon: 13.4, kind: 'rural control' },
]);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_OUT = join(REPO_ROOT, 'data', 'urban-probe', 'point');
const DEFAULT_CACHE = join(REPO_ROOT, '.cache', 'urban');

// ---------------------------------------------------------------------------
// Helpers shared with staticHmodel.mjs (same rule, same reason)
// ---------------------------------------------------------------------------

/** `POINT_OUT`/`URBAN_OUT` IS the `point/` directory; the path builders prepend `point/`. Strip it — PD-E wrote `point/point/static/` once. */
function inPointDir(outRoot, rel) {
  return join(outRoot, rel.replace(/^point\//, ''));
}

/** Fingerprint of a quantised column. Copy of the private helper in `staticHmodel.mjs` — same algorithm, so hashes are comparable. */
function columnHash(q) {
  return createHash('sha256').update(Buffer.from(q.buffer, q.byteOffset, q.byteLength)).digest('hex').slice(0, 16);
}

const fmtMiB = (b) => `${(b / 1048576).toFixed(1)} MiB`;
const now = () => performance.now();

// ---------------------------------------------------------------------------
// Tile set from the domain
// ---------------------------------------------------------------------------

/**
 * Which GHSL tiles a tier's grid touches. The grid is a lat/lon box; its image in
 * Mollweide is curved, so the boundary is sampled densely rather than at corners.
 * Cells are ±deg/2 around their centres — the box is widened by that half cell.
 */
export function tilesForTier(tier, R = MOLLWEIDE_R_ESRI) {
  const half = tier.deg / 2;
  const latMin = tier.lat0 - half, latMax = tier.lat0 + (tier.ny - 1) * tier.deg + half;
  const lonMin = tier.lon0 - half, lonMax = tier.lon0 + (tier.nx - 1) * tier.deg + half;
  const names = new Set();
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  const N = 400;
  const visit = (lat, lon) => {
    const p = mollweideForward(lat, lon, R);
    xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
    const t = ghslTileOf(p.x, p.y);
    names.add(ghslTileName(t.r, t.c));
  };
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    visit(latMin, lonMin + f * (lonMax - lonMin));
    visit(latMax, lonMin + f * (lonMax - lonMin));
    visit(latMin + f * (latMax - latMin), lonMin);
    visit(latMin + f * (latMax - latMin), lonMax);
  }
  // Fill the rectangle of tiles spanned by the extremes (a box could straddle a tile
  // whose corner no boundary sample hits).
  const a = ghslTileOf(xMin, yMax), b = ghslTileOf(xMax, yMin);
  for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) names.add(ghslTileName(r, c));
  return { tiles: [...names].sort(), box: { latMin, latMax, lonMin, lonMax }, moll: { xMin, xMax, yMin, yMax } };
}

// ---------------------------------------------------------------------------
// Download (cached)
// ---------------------------------------------------------------------------

async function fetchTileZip(dataset, r, c, cacheDir, log) {
  const file = dataset.file(r, c);
  const path = join(cacheDir, file);
  if (existsSync(path) && statSync(path).size > 0) {
    return { path, bytes: statSync(path).size, ms: 0, cached: true, url: dataset.dir + file };
  }
  mkdirSync(cacheDir, { recursive: true });
  const url = dataset.dir + file;
  const t0 = now();
  // Measured 2026-09-14: the JRC server closed one of eight 40-MB transfers after
  // 35.7 MB ("other side closed"). A dropped socket is not a missing tile — retry.
  let buf = null, lastErr = null;
  for (let attempt = 1; attempt <= 3 && !buf; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(600_000) });
      if (!res.ok) throw new Error(`urban: ${url} → HTTP ${res.status}`);
      const b = Buffer.from(await res.arrayBuffer());
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > 0 && declared !== b.length) {
        throw new Error(`urban: ${file} truncated (${b.length} of ${declared} B)`);
      }
      buf = b;
    } catch (e) {
      lastErr = e;
      if (/HTTP 4\d\d/.test(String(e))) break; // a 404 does not heal by waiting
      log(`  ⚠ ${file}: attempt ${attempt} failed (${e?.cause?.code ?? e?.name ?? e}) — ${attempt < 3 ? 'retrying in 5 s' : 'giving up'}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  if (!buf) throw lastErr;
  const tmp = `${path}.part`;
  writeFileSync(tmp, buf);
  renameSync(tmp, path);
  const ms = now() - t0;
  log(`  ↓ ${file}: ${fmtMiB(buf.length)} in ${(ms / 1000).toFixed(1)} s (${(buf.length / 1048576 / (ms / 1000)).toFixed(1)} MiB/s)`);
  return { path, bytes: buf.length, ms, cached: false, url };
}

/** Zip → the GeoTIFF bytes. The central directory is authoritative (sizes in the local header may be 0). */
export function tiffFromZip(zipBuf) {
  const entries = zipEntries(zipBuf);
  const e = entries.find((x) => /\.tiff?$/i.test(x.name));
  if (!e) throw new Error(`urban: no .tif in zip (${entries.map((x) => x.name).join(', ')})`);
  if (e.method !== 8 && e.method !== 0) throw new Error(`urban: zip method ${e.method} for ${e.name}`);
  const t0 = now();
  const tif = e.method === 8 ? inflateRawSync(e.raw) : Buffer.from(e.raw);
  if (e.usz && tif.length !== e.usz) throw new Error(`urban: ${e.name} inflated to ${tif.length} B, central directory says ${e.usz}`);
  return { tif, name: e.name, inflateMs: now() - t0, compressed: e.csz, others: entries.filter((x) => x !== e).map((x) => x.name) };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export function newAccumulator(tier) {
  const cells = tier.ny * tier.nx;
  return {
    tier,
    S: { sum: new Float64Array(cells), cnt: new Uint32Array(cells), nodata: new Uint32Array(cells) },
    H: { sum: new Float64Array(cells), cnt: new Uint32Array(cells), nodata: new Uint32Array(cells) },
  };
}

/**
 * Add one raster block (a decoded TIFF tile, or a synthetic one in the self-test)
 * to a tier's accumulator. `block.x0/y0` = map coordinates of the UPPER-LEFT CORNER
 * of pixel (0,0) (PixelIsArea); centres are half a pixel in. `stride` is the row
 * pitch of `values` (a TIFF edge tile is stored full-size, `width` clips it).
 *
 * Returns the number of source cells that landed in a grid cell (valid or nodata).
 */
export function accumulateBlock(acc, block, kind, R = MOLLWEIDE_R_ESRI) {
  const { tier } = acc;
  const a = acc[kind];
  const { sum, cnt, nodata: nod } = a;
  const { x0, y0, sx, sy, width, height, values, nodata } = block;
  const stride = block.stride ?? width;
  const invDeg = 1 / tier.deg;
  let used = 0;
  for (let row = 0; row < height; row++) {
    const y = y0 - (row + 0.5) * sy;
    const m = mollweideRow(y, R);
    if (!m) continue;
    const iy = Math.round((m.lat - tier.lat0) * invDeg);
    if (iy < 0 || iy >= tier.ny) continue;
    const rowBase = iy * tier.nx;
    const vb = row * stride;
    for (let col = 0; col < width; col++) {
      const lon = (x0 + (col + 0.5) * sx) * m.k;
      const ix = Math.round((lon - tier.lon0) * invDeg);
      if (ix < 0 || ix >= tier.nx) continue;
      const v = values[vb + col];
      const k = rowBase + ix;
      used++;
      if (v === nodata || v !== v) { nod[k]++; continue; }
      sum[k] += v;
      cnt[k]++;
    }
  }
  return used;
}

/** Does a block (by its map extent) touch the tier's box at all? Corners suffice: lat is monotonic in y, lon in x. */
function blockTouches(tier, x0, y0, x1, y1, R) {
  const half = tier.deg / 2;
  const latMin = tier.lat0 - half, latMax = tier.lat0 + (tier.ny - 1) * tier.deg + half;
  const lonMin = tier.lon0 - half, lonMax = tier.lon0 + (tier.nx - 1) * tier.deg + half;
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => mollweideInverse(x, y, R));
  if (pts.some((p) => p == null)) return true; // outside the ellipse somewhere — let the row loop decide
  const bLatMin = Math.min(...pts.map((p) => p.lat)), bLatMax = Math.max(...pts.map((p) => p.lat));
  const bLonMin = Math.min(...pts.map((p) => p.lon)), bLonMax = Math.max(...pts.map((p) => p.lon));
  return !(bLatMax < latMin || bLatMin > latMax || bLonMax < lonMin || bLonMin > lonMax);
}

/** Accumulate every tile of one GeoTIFF into every tier accumulator. */
export function accumulateTiff(t, tif, geo, accs, kind, R, opts = {}) {
  let decoded = 0, skipped = 0, decodeMs = 0, accMs = 0;
  const stats = { min: Infinity, max: -Infinity, nodata: 0, zero: 0, nan: 0, n: 0 };
  const nodata = t.nodata;
  for (let tr = 0; tr < t.tilesDown; tr++) {
    const rows = Math.min(t.tileH, t.height - tr * t.tileH);
    const by0 = geo.y0 - tr * t.tileH * geo.sy;
    const by1 = by0 - rows * geo.sy;
    for (let tc = 0; tc < t.tilesAcross; tc++) {
      const cols = Math.min(t.tileW, t.width - tc * t.tileW);
      const bx0 = geo.x0 + tc * t.tileW * geo.sx;
      const bx1 = bx0 + cols * geo.sx;
      if (!accs.some((acc) => blockTouches(acc.tier, bx0, by0, bx1, by1, R))) { skipped++; continue; }
      const t0 = now();
      const values = decodeTiffTile(t, tif, tr * t.tilesAcross + tc);
      decodeMs += now() - t0;
      decoded++;
      if (opts.stats) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const v = values[r * t.tileW + c];
            stats.n++;
            if (v !== v) { stats.nan++; continue; }
            if (v === nodata) { stats.nodata++; continue; }
            if (v === 0) stats.zero++;
            if (v < stats.min) stats.min = v;
            if (v > stats.max) stats.max = v;
          }
        }
      }
      const t1 = now();
      for (const acc of accs) {
        accumulateBlock(acc, { x0: bx0, y0: by0, sx: geo.sx, sy: geo.sy, width: cols, height: rows, stride: t.tileW, values, nodata }, kind, R);
      }
      accMs += now() - t1;
    }
  }
  return { decoded, skipped, decodeMs, accMs, stats };
}

// ---------------------------------------------------------------------------
// Columns → quantised planes → chunks → manifest
// ---------------------------------------------------------------------------

/** Physical columns from the accumulators. NaN where no valid source cell exists. */
export function columnsFromAccumulator(acc) {
  const cells = acc.tier.ny * acc.tier.nx;
  const imperv = new Float32Array(cells).fill(NaN);
  const d0 = new Float32Array(cells).fill(NaN);
  const bldgH = new Float32Array(cells).fill(NaN);
  for (let k = 0; k < cells; k++) {
    if (acc.S.cnt[k] > 0) imperv[k] = (acc.S.sum[k] / acc.S.cnt[k]) / 10000 * 100; // m² of 10 000 m² → %
    if (acc.H.cnt[k] > 0) {
      const h = acc.H.sum[k] / acc.H.cnt[k];
      bldgH[k] = h;
      d0[k] = Math.min(D0_CAP_M, D0_FACTOR * h);
    }
  }
  return { imperv, d0, bldgH };
}

function quantizeColumn(grid, plane) {
  const out = new Int16Array(grid.length).fill(MISSING);
  for (let k = 0; k < grid.length; k++) if (Number.isFinite(grid[k])) out[k] = quantize(grid[k], plane);
  return out;
}

function planeStats(q, plane) {
  let covered = 0, min = Infinity, max = -Infinity, sum = 0, ge50 = 0;
  for (let k = 0; k < q.length; k++) {
    const v = q[k];
    if (v === MISSING) continue;
    covered++;
    const phys = dequantize(v, plane);
    sum += phys;
    if (phys < min) min = phys;
    if (phys > max) max = phys;
    if (plane.id === 'imperv' && phys >= 50) ge50++;
  }
  const r3 = (x) => Number(x.toFixed(3)); // 127 · 0.1 prints as 12.700000000000001 otherwise
  return { covered, min: covered ? r3(min) : null, max: covered ? r3(max) : null, mean: covered ? sum / covered : null, ge50 };
}

export function readStaticManifest(outRoot) {
  const p = inPointDir(outRoot, staticManifestPath(URBAN_PRODUCT, URBAN_VERSION));
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Write one tier of the product — or find it unchanged (hash per column, like hmodel).
 * @returns {Promise<{changed:boolean, chunks:number, bytes:number, planes:object[], reason:string}>}
 */
export async function writeStaticUrban(outRoot, acc, ctx) {
  const { tier } = acc;
  const cols = columnsFromAccumulator(acc);
  const quant = URBAN_PLANES.map((p) => quantizeColumn(cols[p.id], p));
  const planes = URBAN_PLANES.map((p, i) => {
    const s = planeStats(quant[i], p);
    return {
      id: p.id, unit: p.unit, scale: p.scale, offset: p.offset, range: p.range, what: p.what,
      hash: columnHash(quant[i]),
      covered: s.covered, min: s.min, max: s.max, mean: s.mean == null ? null : Number(s.mean.toFixed(3)),
    };
  });
  // Coverage — the numbers that show a projection or aggregation error at once.
  const cells = tier.ny * tier.nx;
  let srcUsedS = 0, srcNodataS = 0, srcUsedH = 0, srcNodataH = 0;
  for (let k = 0; k < cells; k++) { srcUsedS += acc.S.cnt[k]; srcNodataS += acc.S.nodata[k]; srcUsedH += acc.H.cnt[k]; srcNodataH += acc.H.nodata[k]; }
  const impervStats = planeStats(quant[0], URBAN_PLANES[0]);
  const coverage = {
    cells,
    cellsWithData: impervStats.covered,
    cellsMissing: cells - impervStats.covered,
    meanImpervPct: impervStats.mean == null ? null : Number(impervStats.mean.toFixed(2)),
    maxImpervPct: impervStats.max,
    cellsImpervGe50: impervStats.ge50,
    sourceCells: { builtS: { used: srcUsedS, nodata: srcNodataS }, anbh: { used: srcUsedH, nodata: srcNodataH } },
    sourceCellsPerGridCell: impervStats.covered ? Number((srcUsedS / impervStats.covered).toFixed(1)) : null,
  };

  const prev = readStaticManifest(outRoot);
  const prevTier = prev?.tiers?.[tier.id] ?? null;
  const same = prevTier && prevTier.planes?.length === planes.length
    && prevTier.planes.every((q, i) => q.id === planes[i].id && q.hash === planes[i].hash);
  if (same) {
    return { changed: false, chunks: prevTier.chunks ?? 0, bytes: prevTier.bytes ?? 0, planes, coverage, reason: 'unchanged (hash per column equal)' };
  }

  let bytes = 0, chunks = 0;
  for (let cy = 0; cy < tier.chunk.cy; cy++) {
    for (let cx = 0; cx < tier.chunk.cx; cx++) {
      const ext = chunkExtent(tier, cy, cx);
      const cut = quant.map((src) => {
        const out = new Int16Array(ext.ny * ext.nx);
        let w = 0;
        for (let ry = 0; ry < ext.ny; ry++) {
          const row = (ext.y0 + ry) * tier.nx + ext.x0;
          for (let rx = 0; rx < ext.nx; rx++) out[w++] = src[row + rx];
        }
        return out;
      });
      const buf = await encodeCubeChunk(
        { runHours: 0, tierIndex: tier.index, nt: 1, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: cut },
        undefined, URBAN_PLANES,
      );
      const abs = inPointDir(outRoot, staticChunkPath(URBAN_PRODUCT, URBAN_VERSION, tier.id, cy, cx));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, buf);
      bytes += buf.length;
      chunks++;
    }
  }

  const man = prev && prev.product === URBAN_PRODUCT ? prev : {
    product: URBAN_PRODUCT,
    version: URBAN_VERSION,
    kind: 'static',
    what: 'Built-up share (imperv), displacement height (d0) and mean building height (bldgH) per cube cell, from JRC GHSL R2023A.',
    why: 'PAP 5 needs imperv (urban heat island amplitude A_uhi(imperv, SVF)) and d0 (two-stage blending-height wind correction). Both were MISSING since PD-A (E-13).',
    container: 'BSPC like the cube, own plane list (three planes), nt = 1, runHours = 0, same chunk raster.',
    chunkCells: CHUNK_CELLS,
    planes: URBAN_PLANES.map((p) => ({ id: p.id, unit: p.unit, scale: p.scale, offset: p.offset, range: p.range, what: p.what })),
    aggregation: 'Area mean over all 100-m source cells whose centre falls into the cell (cell = ±deg/2 around lat0 + iy·deg, the cellOf rule). Analytic Mollweide → lat/lon per source cell; no resampling. Nodata cells are excluded from the mean; a cell without any valid source cell is MISSING (−32768).',
    source: {
      provider: 'European Commission, Joint Research Centre (JRC) — Global Human Settlement Layer',
      release: 'R2023A',
      datasets: Object.values(GHSL_DATASETS).map((d) => ({ key: d.key, name: d.name, epoch: d.epoch, unit: d.unit, urlPattern: `${d.dir}${d.file('<r>', '<c>')}`, nodata: d.expectedNodata })),
      grid: 'Mollweide (ESRI:54009), 100 m, tiles of 1 000 000 m, origin (−18 041 000, 9 000 000)',
      projectionRadiusM: ctx.R,
      projectionRadiusNote: ctx.radiusNote,
      tilesUsed: ctx.tiles,
      tileExtents: ctx.tileExtents,
      tiffFacts: ctx.tiffFacts,
    },
    licence: URBAN_LICENCE,
    attribution: URBAN_ATTRIBUTION,
    citation: URBAN_CITATION,
    caveats: [
      'imperv is the BUILT-UP SURFACE share (building footprints). Roads, car parks and pavement are not counted — real imperviousness is higher; by how much is NOT measured here (a sealed-surface product such as Copernicus HRL Imperviousness would be the reference).',
      'A 5-km cell mean averages away city cores: measured 2026-09-14, the 100-m pixel at Marienplatz (Munich) carries 67 % built-up, the t1 cell around it 29 %. The value describes the cell, not the point.',
      'Epochs differ: GHS-BUILT-S is E2020, GHS-BUILT-H ANBH is E2018. Growth between 2018 and 2020 is in imperv but not in bldgH/d0.',
      `d0 = ${D0_FACTOR} × bldgH is a rule of thumb (0.5–0.8 in the literature) and is capped at ${D0_CAP_M} m. bldgH carries the uncapped mean so the rule can be revised without rebuilding.`,
      'bldgH averages over ALL valid source cells, including unbuilt ones (height 0). It is the grid-box mean, not the mean height of buildings; where imperv is small, bldgH is small by construction.',
      'The projection sphere radius is measured, not assumed (see source.projectionRadiusNote).',
    ],
    timeless: 'point/static/ is exempt from retention (TIMELESS_PATHS).',
    tiers: {},
  };
  man.tiers[tier.id] = {
    planes, chunks, bytes,
    cy: tier.chunk.cy, cx: tier.chunk.cx, ny: tier.ny, nx: tier.nx, deg: tier.deg,
    lat0: tier.lat0, lon0: tier.lon0,
    builtAt: new Date().toISOString(),
    coverage,
    net: ctx.net ?? null,
  };
  man.updatedAt = new Date().toISOString();
  const mp = inPointDir(outRoot, staticManifestPath(URBAN_PRODUCT, URBAN_VERSION));
  mkdirSync(dirname(mp), { recursive: true });
  writeFileSync(mp, `${JSON.stringify(man, null, 2)}\n`);
  return { changed: true, chunks, bytes, planes, coverage, reason: prevTier ? 'columns changed' : 'first build' };
}

// ---------------------------------------------------------------------------
// Read-back probe (proves the WRITTEN product, not the array in memory)
// ---------------------------------------------------------------------------

export async function readUrbanPoint(outRoot, tier, lat, lon) {
  const cell = cellOf(tier, lat, lon);
  if (!cell) return null;
  const ch = chunkOf(cell.iy, cell.ix);
  const p = inPointDir(outRoot, staticChunkPath(URBAN_PRODUCT, URBAN_VERSION, tier.id, ch.cy, ch.cx));
  if (!existsSync(p)) return null;
  const chunk = await decodeCubeChunk(new Uint8Array(readFileSync(p)), { planes: URBAN_PLANES });
  const k = (cell.iy - chunk.y0) * chunk.nx + (cell.ix - chunk.x0);
  const out = { iy: cell.iy, ix: cell.ix, cy: ch.cy, cx: ch.cx };
  URBAN_PLANES.forEach((pl, i) => { out[pl.id] = dequantize(chunk.planes[i][k], pl); });
  return out;
}

// ---------------------------------------------------------------------------
// Lake Constance transect — the radius decision
// ---------------------------------------------------------------------------

/**
 * Sample GHS-BUILT-S along 9.49 °E from 47.40 to 47.75 °N under a given radius.
 * That meridian is chosen because BOTH shores are densely built right at the water:
 * Rorschach (CH, town ends at the shore ≈ 47.485 °N) and Friedrichshafen (DE, harbour
 * front at ≈ 47.648 °N). Orchards would also read 0 — a built-up flank on both sides
 * is what makes the band's edges sharp. A wrong radius shifts the sampled pixels
 * ~6.3 km north or south: the band moves by 0.057°, a third of its width.
 */
export const TRANSECT_EXPECTED = Object.freeze({ lon: 9.49, south: 47.485, north: 47.648, note: 'Rorschach shore … Friedrichshafen harbour front' });

export function lakeTransect(t, tif, geo, R, lon = TRANSECT_EXPECTED.lon, lat0 = 47.4, lat1 = 47.75, step = 0.0025) {
  const cache = new Map();
  const readPx = (px, py) => {
    if (px < 0 || py < 0 || px >= t.width || py >= t.height) return null;
    const tc = Math.floor(px / t.tileW), tr = Math.floor(py / t.tileH);
    const idx = tr * t.tilesAcross + tc;
    let tile = cache.get(idx);
    if (!tile) { tile = decodeTiffTile(t, tif, idx); cache.set(idx, tile); }
    return tile[(py - tr * t.tileH) * t.tileW + (px - tc * t.tileW)];
  };
  const samples = [];
  for (let lat = lat0; lat <= lat1 + 1e-9; lat += step) {
    const m = mollweideForward(lat, lon, R);
    const px = Math.floor((m.x - geo.x0) / geo.sx), py = Math.floor((geo.y0 - m.y) / geo.sy);
    const v = readPx(px, py);
    samples.push({ lat: Number(lat.toFixed(4)), v });
  }
  const glyph = (v) => (v == null ? ' ' : v === t.nodata ? 'N' : v === 0 ? '.' : v < 1000 ? ':' : v < 4000 ? 'o' : '#');
  const line = samples.map((s) => glyph(s.v)).join('');
  // Longest run of water-like samples (0 or nodata) — its latitude bounds are the shores.
  let best = { start: -1, len: 0 }, cur = { start: -1, len: 0 };
  samples.forEach((s, i) => {
    const water = s.v === 0 || s.v === t.nodata;
    if (water) { if (cur.start < 0) cur = { start: i, len: 1 }; else cur.len++; if (cur.len > best.len) best = { ...cur }; }
    else cur = { start: -1, len: 0 };
  });
  const south = best.len ? samples[best.start].lat : null;
  const north = best.len ? samples[best.start + best.len - 1].lat : null;
  const errKm = south == null ? null : Number((Math.hypot(south - TRANSECT_EXPECTED.south, north - TRANSECT_EXPECTED.north) * 111.2).toFixed(1));
  return { R, line, south, north, widthKm: best.len ? Number(((north - south) * 111.2).toFixed(1)) : 0, errKm };
}

// ---------------------------------------------------------------------------
// Self-test (exported for a verifier; no network, no files)
// ---------------------------------------------------------------------------

export async function urbanSelfTest() {
  const base = urbanTiffSelfTest();
  const checks = [...base.checks];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const tier = TIER_BY_ID.t1;

  // Tile set: the DACH box must come out as R3/R4 × C19/C20 under the ESRI radius.
  const ts = tilesForTier(tier);
  add('tilesForTier(t1) = R3_C19, R3_C20, R4_C19, R4_C20', ts.tiles.join(',') === 'R3_C19,R3_C20,R4_C19,R4_C20', ts.tiles.join(','));

  // Synthetic aggregation: 2 × 2 source cells around one t1 cell centre.
  const iy = 53, ix = 121; // 48.15 °N, 11.55 °E
  const centre = { lat: tier.lat0 + iy * tier.deg, lon: tier.lon0 + ix * tier.deg };
  const p = mollweideForward(centre.lat, centre.lon);
  const acc = newAccumulator(tier);
  const blockS = { x0: p.x - 100, y0: p.y + 100, sx: 100, sy: 100, width: 2, height: 2, values: Uint16Array.from([2500, 7500, 65535, 0]), nodata: 65535 };
  const blockH = { x0: p.x - 100, y0: p.y + 100, sx: 100, sy: 100, width: 2, height: 2, values: Float32Array.from([10, 20, 255, 30]), nodata: 255 };
  const usedS = accumulateBlock(acc, blockS, 'S');
  const usedH = accumulateBlock(acc, blockH, 'H');
  const k = iy * tier.nx + ix;
  add('synthetic: all four source cells land in the target cell', usedS === 4 && usedH === 4 && acc.S.cnt[k] === 3 && acc.S.nodata[k] === 1 && acc.H.cnt[k] === 3);
  const cols = columnsFromAccumulator(acc);
  add('synthetic: imperv = mean(2500,7500,0)/10000·100 = 33.33 %', Math.abs(cols.imperv[k] - 33.3333) < 1e-3, `${cols.imperv[k]}`);
  add('synthetic: bldgH = mean(10,20,30) = 20 m', Math.abs(cols.bldgH[k] - 20) < 1e-6);
  add(`synthetic: d0 = ${D0_FACTOR} × 20 = 14 m`, Math.abs(cols.d0[k] - 14) < 1e-6);
  add('synthetic: neighbouring cells stay NaN', !Number.isFinite(cols.imperv[k + 1]) && !Number.isFinite(cols.imperv[k - tier.nx]));
  // A source cell 0.03° east of the centre belongs to the NEXT cell (cell = ±0.025°).
  const acc2 = newAccumulator(tier);
  const q = mollweideForward(centre.lat, centre.lon + 0.03);
  accumulateBlock(acc2, { x0: q.x - 50, y0: q.y + 50, sx: 100, sy: 100, width: 1, height: 1, values: Uint16Array.from([10000]), nodata: 65535 }, 'S');
  add('synthetic: a centre 0.03° east falls into ix + 1, not ix', acc2.S.cnt[k] === 0 && acc2.S.cnt[k + 1] === 1);
  // All-nodata cell → MISSING, not 0.
  const acc3 = newAccumulator(tier);
  accumulateBlock(acc3, { ...blockS, values: Uint16Array.from([65535, 65535, 65535, 65535]) }, 'S');
  const c3 = columnsFromAccumulator(acc3);
  add('synthetic: all-nodata cell is MISSING, not 0', !Number.isFinite(c3.imperv[k]) && quantize(c3.imperv[k], URBAN_PLANES[0]) === MISSING);

  // Quantisation: percent integer, decimetre planes, cap.
  add('quantise imperv 33.33 % → 33', quantize(33.3333, URBAN_PLANES[0]) === 33);
  add('quantise d0 14 m → 140 (dm)', quantize(14, URBAN_PLANES[1]) === 140);
  add('quantise bldgH 20 m → 200 (dm)', quantize(20, URBAN_PLANES[2]) === 200);
  add(`cap: mean height 50 m → d0 ${D0_CAP_M} m → 255`, quantize(Math.min(D0_CAP_M, D0_FACTOR * 50), URBAN_PLANES[1]) === 255);
  add('dequantise round trip imperv 33', dequantize(33, URBAN_PLANES[0]) === 33);
  // Container round trip with the three-plane list, and the wrong-list negative control.
  const ext = chunkExtent(tier, 3, 7);
  const cut = URBAN_PLANES.map((_, i) => { const o = new Int16Array(ext.ny * ext.nx); for (let j = 0; j < o.length; j++) o[j] = j % 5 === 0 ? MISSING : (j * (i + 1)) % 250; return o; });
  const buf = await encodeCubeChunk({ runHours: 0, tierIndex: tier.index, nt: 1, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: cut }, undefined, URBAN_PLANES);
  const back = await decodeCubeChunk(buf, { planes: URBAN_PLANES });
  add('container round trip: 3 planes, nt = 1, values equal', back.nvar === 3 && back.nt === 1 && cut.every((c, i) => c.every((v, j) => back.planes[i][j] === v)));
  let threw = false;
  try { await decodeCubeChunk(buf, { planes: [{ id: 'one' }] }); } catch { threw = true; }
  add('container: wrong plane list throws', threw);
  // The radius decision is a data test — here only that the transect helper detects a band.
  return { checks, pass: checks.filter((c) => c.ok).length, total: checks.length };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { selfTest: false, dry: false, tiles: null, tiers: ['t1'], radius: 'esri', transect: true, out: process.env.URBAN_OUT || DEFAULT_OUT, cache: process.env.URBAN_CACHE || DEFAULT_CACHE };
  for (const s of argv) {
    if (s === '--self-test') a.selfTest = true;
    else if (s === '--dry') a.dry = true;
    else if (s === '--no-transect') a.transect = false;
    else if (s.startsWith('--tiles=')) a.tiles = s.slice(8).split(',').map((x) => x.trim()).filter(Boolean);
    else if (s.startsWith('--tiers=')) a.tiers = s.slice(8).split(',').map((x) => x.trim()).filter(Boolean);
    else if (s.startsWith('--radius=')) a.radius = s.slice(9);
    else if (s.startsWith('--out=')) a.out = s.slice(6);
    else throw new Error(`urban: unknown argument ${s}`);
  }
  for (const t of a.tiers) if (!TIER_BY_ID[t]) throw new Error(`urban: unknown tier ${t}`);
  if (a.radius !== 'esri' && a.radius !== 'authalic') throw new Error('urban: --radius=esri|authalic');
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (s) => console.log(s);

  if (args.selfTest) {
    const r = await urbanSelfTest();
    for (const c of r.checks) log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
    log(`urban self-test ${r.pass}/${r.total}`);
    process.exit(r.pass === r.total ? 0 : 1);
  }

  const T0 = now();
  const R = args.radius === 'esri' ? MOLLWEIDE_R_ESRI : MOLLWEIDE_R_AUTHALIC;
  const tiers = args.tiers.map((id) => TIER_BY_ID[id]);
  const derived = tilesForTier(tiers[0], R);
  const tiles = args.tiles ?? derived.tiles;
  log(`[urban] product ${URBAN_PRODUCT}/${URBAN_VERSION} · tiers ${args.tiers.join(',')} · R = ${R} m (${args.radius})`);
  log(`[urban] domain ${derived.box.latMin}…${derived.box.latMax} °N / ${derived.box.lonMin}…${derived.box.lonMax} °E → Mollweide x ${derived.moll.xMin.toFixed(0)}…${derived.moll.xMax.toFixed(0)}, y ${derived.moll.yMin.toFixed(0)}…${derived.moll.yMax.toFixed(0)}`);
  log(`[urban] tiles derived: ${derived.tiles.join(', ')}${args.tiles ? ` · restricted to ${tiles.join(', ')}` : ''}`);
  log(`[urban] cache ${args.cache} · out ${args.out}${args.dry ? ' · DRY (nothing written)' : ''}`);

  const accs = tiers.map(newAccumulator);
  const net = { files: 0, bytes: 0, ms: 0, cached: 0 };
  const tileExtents = {};
  const tiffFacts = {};
  let decodeMsTotal = 0, accMsTotal = 0, decodedTiles = 0, skippedTiles = 0;
  let transects = null;

  for (const name of tiles) {
    const { r, c } = parseGhslTileName(name);
    for (const ds of Object.values(GHSL_DATASETS)) {
      const dl = await fetchTileZip(ds, r, c, args.cache, log);
      net.files++; net.bytes += dl.bytes; net.ms += dl.ms; if (dl.cached) net.cached++;
      const zip = readFileSync(dl.path);
      const { tif, name: tifName, inflateMs, compressed, others } = tiffFromZip(zip);
      const t = parseTiff(tif);
      const geo = tiffGeoOrigin(t);
      // Tile extent: the file's own georeference against the naming scheme.
      const expect = ghslTileExtent(r, c);
      const extOk = geo.x0 === expect.x0 && geo.y0 === expect.y0 && geo.sx === 100 && geo.sy === 100
        && t.width * geo.sx === expect.x1 - expect.x0 && t.height * geo.sy === expect.y0 - expect.y1;
      const ul = mollweideInverse(geo.x0, geo.y0, R), lr = mollweideInverse(geo.x0 + t.width * geo.sx, geo.y0 - t.height * geo.sy, R);
      tileExtents[name] ??= {};
      tileExtents[name][ds.key] = { x0: geo.x0, y0: geo.y0, x1: geo.x0 + t.width * geo.sx, y1: geo.y0 - t.height * geo.sy, matchesScheme: extOk,
        approxLatLon: ul && lr ? { ul: [Number(ul.lat.toFixed(3)), Number(ul.lon.toFixed(3))], lr: [Number(lr.lat.toFixed(3)), Number(lr.lon.toFixed(3))] } : null };
      const facts = { bigTiff: t.bigTiff, littleEndian: t.le, width: t.width, height: t.height, bits: t.bits, sampleFormat: t.sampleFormat,
        compression: t.compression, predictor: t.predictor, planar: t.planar, layout: t.layout, tileW: t.tileW, tileH: t.tileH,
        tiles: t.offsets.length, nodata: t.nodata, nodataRaw: t.nodataRaw, pixelScale: t.pixelScale, tiepoint: t.tiepoint,
        geoKeys: t.geoKeys, citation: t.citation?.split('|')[0] ?? null, zipEntry: tifName, zipCompressed: compressed, tiffBytes: tif.length, zipOthers: others };
      tiffFacts[ds.key] ??= facts;
      log(`[urban] ${name} ${ds.key}: ${dl.cached ? 'cache' : 'net'} ${fmtMiB(dl.bytes)} → inflate ${fmtMiB(tif.length)} in ${inflateMs.toFixed(0)} ms · ${t.bigTiff ? 'BigTIFF' : 'TIFF'} ${t.le ? 'LE' : 'BE'} ${t.width}×${t.height} ${t.bits}-bit sf${t.sampleFormat} comp${t.compression} pred${t.predictor} ${t.layout} ${t.tileW}×${t.tileH} ×${t.offsets.length} nodata=${t.nodataRaw}`);
      log(`[urban]   tiepoint (${geo.x0}, ${geo.y0}) scale ${geo.sx}×${geo.sy} → scheme ${expect.x0},${expect.y0}: ${extOk ? 'MATCH' : 'MISMATCH'} · ≈ ${ul ? `${ul.lat.toFixed(2)}°N/${ul.lon.toFixed(2)}°E` : '?'} … ${lr ? `${lr.lat.toFixed(2)}°N/${lr.lon.toFixed(2)}°E` : '?'} · GeoKeys ${JSON.stringify(t.geoKeys)}`);
      if (t.nodata !== ds.expectedNodata) log(`[urban]   ⚠ nodata ${t.nodata} differs from the expected ${ds.expectedNodata} — the file wins`);

      if (args.transect && ds.key === 'builtS' && name === 'R4_C19') {
        transects = [MOLLWEIDE_R_ESRI, MOLLWEIDE_R_AUTHALIC].map((rr) => lakeTransect(t, tif, geo, rr));
        for (const tr of transects) {
          log(`[urban]   transect ${TRANSECT_EXPECTED.lon}°E 47.40→47.75°N (0.0025° steps) R=${tr.R}: longest 0-run ${tr.south}…${tr.north} °N (${tr.widthKm} km) · shore error ${tr.errKm} km`);
          log(`[urban]     ${tr.line}`);
        }
        log(`[urban]     expected: ${TRANSECT_EXPECTED.south} … ${TRANSECT_EXPECTED.north} °N (${TRANSECT_EXPECTED.note})  [. = 0  N = nodata  : <1000  o <4000  # ≥4000 m²]`);
        if (transects[0].errKm != null && transects[1].errKm != null && transects[0].errKm > transects[1].errKm) {
          log(`[urban]   ⚠ the AUTHALIC radius fits the shores better than the ESRI one — the build uses R=${R}; check --radius`);
        }
      }

      if (args.dry) {
        // Decode ONE tile to time the LZW path and show values — the tile containing Munich if in range.
        const m = mollweideForward(48.137, 11.575, R);
        const px = Math.floor((m.x - geo.x0) / geo.sx), py = Math.floor((geo.y0 - m.y) / geo.sy);
        const inside = px >= 0 && py >= 0 && px < t.width && py < t.height;
        const idx = inside ? Math.floor(py / t.tileH) * t.tilesAcross + Math.floor(px / t.tileW) : 0;
        const t0 = now();
        const vals = decodeTiffTile(t, tif, idx);
        const ms = now() - t0;
        let nod = 0, zero = 0, max = -Infinity;
        for (const v of vals) { if (v === t.nodata) nod++; else { if (v === 0) zero++; if (v > max) max = v; } }
        log(`[urban]   dry: tile ${idx} (${t.byteCounts[idx]} B LZW → ${vals.length} values) in ${ms.toFixed(1)} ms · nodata ${nod} · zero ${zero} · max ${max}${inside ? ` · Munich pixel (${px},${py}) = ${vals[(py % t.tileH) * t.tileW + (px % t.tileW)]}` : ''}`);
        continue;
      }

      const t0 = now();
      const res = accumulateTiff(t, tif, geo, accs, ds.key === 'builtS' ? 'S' : 'H', R, { stats: true });
      decodeMsTotal += res.decodeMs; accMsTotal += res.accMs; decodedTiles += res.decoded; skippedTiles += res.skipped;
      log(`[urban]   decoded ${res.decoded} tiles, skipped ${res.skipped} (outside the box) · LZW ${(res.decodeMs / 1000).toFixed(1)} s · aggregate ${(res.accMs / 1000).toFixed(1)} s · wall ${((now() - t0) / 1000).toFixed(1)} s`);
      log(`[urban]   values in decoded tiles: n ${res.stats.n} · nodata ${res.stats.nodata} · zero ${res.stats.zero} · NaN ${res.stats.nan} · min ${res.stats.min} · max ${res.stats.max}`);
    }
  }

  if (args.dry) {
    log(`[urban] dry run done in ${((now() - T0) / 1000).toFixed(1)} s · net ${net.files} files, ${fmtMiB(net.bytes)} (${net.cached} from cache)`);
    return;
  }

  const radiusNote = transects
    ? `Measured on GHS-BUILT-S R4_C19 along ${TRANSECT_EXPECTED.lon}°E (Lake Constance, ${TRANSECT_EXPECTED.note}): zero band ${transects[0].south}…${transects[0].north}°N (shore error ${transects[0].errKm} km) under R=${transects[0].R} vs ${transects[1].south}…${transects[1].north}°N (${transects[1].errKm} km) under R=${transects[1].R}; expected ${TRANSECT_EXPECTED.south}…${TRANSECT_EXPECTED.north}°N. Build used R=${R}.`
    : `Build used R=${R} (${args.radius}); transect not run.`;
  let totalBytes = 0, totalChunks = 0;
  for (const acc of accs) {
    const w = await writeStaticUrban(args.out, acc, {
      R, radiusNote, tiles, tileExtents, tiffFacts,
      net: { files: net.files, bytes: net.bytes, downloadMs: Math.round(net.ms), fromCache: net.cached, decodedTiles, skippedTiles, decodeMs: Math.round(decodeMsTotal), aggregateMs: Math.round(accMsTotal) },
    });
    totalBytes += w.bytes; totalChunks += w.chunks;
    log(`[urban] ${acc.tier.id}: ${w.reason} · ${w.chunks} chunks · ${fmtMiB(w.bytes)} · cells with data ${w.coverage.cellsWithData}/${w.coverage.cells} · mean imperv ${w.coverage.meanImpervPct} % · max ${w.coverage.maxImpervPct} % · ≥ 50 %: ${w.coverage.cellsImpervGe50} · source cells/grid cell ${w.coverage.sourceCellsPerGridCell}`);
    for (const p of w.planes) log(`[urban]   ${p.id.padEnd(6)} covered ${p.covered} · ${p.min}…${p.max} ${p.unit} · mean ${p.mean} · hash ${p.hash}`);
  }
  const mp = inPointDir(args.out, staticManifestPath(URBAN_PRODUCT, URBAN_VERSION));
  const manBytes = existsSync(mp) ? statSync(mp).size : 0;
  log(`[urban] output: ${totalChunks} chunks ${fmtMiB(totalBytes)} + static.json ${(manBytes / 1024).toFixed(1)} KiB → ${mp}`);

  // Probes from the WRITTEN chunks.
  for (const tier of tiers) {
    log(`[urban] probes (${tier.id}, read back from the chunks):`);
    for (const p of PROBE_POINTS) {
      const v = await readUrbanPoint(args.out, tier, p.lat, p.lon);
      const f = (x, d) => (x == null ? 'MISSING' : x.toFixed(d));
      log(`  ${p.name.padEnd(42)} ${p.kind.padEnd(14)} ${v ? `imperv ${f(v.imperv, 0).padStart(7)} %  d0 ${f(v.d0, 1).padStart(5)} m  bldgH ${f(v.bldgH, 1).padStart(5)} m  (cell ${v.iy}/${v.ix}, chunk ${v.cy}/${v.cx})` : 'outside domain / no chunk'}`);
    }
  }
  log(`[urban] net ${net.files} files, ${fmtMiB(net.bytes)}, download ${(net.ms / 1000).toFixed(1)} s (${net.cached} from cache) · LZW ${(decodeMsTotal / 1000).toFixed(1)} s · aggregate ${(accMsTotal / 1000).toFixed(1)} s · tiles decoded ${decodedTiles}, skipped ${skippedTiles}`);
  log(`WALL_URBAN=${Math.round((now() - T0) / 1000)}s`);
}

// PD-C4 idiom (`build-stations.mjs`): argv-based, so a Linux runner with an absolute
// path starts main() too — `import.meta.url === pathToFileURL(argv[1]).href` did not.
if (process.argv[1]?.endsWith('build-urban.mjs')) {
  main().catch((e) => { console.error('[urban]', e); process.exit(1); });
}
