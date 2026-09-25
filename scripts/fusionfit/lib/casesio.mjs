/**
 * casesio.mjs — the case container of phase FL (`audit/fusion-lernphase.md` §5.1): one row per (slot, tier, point,
 * native step), fixed-width little-endian records, gzip-streamed, one file per (month, tier).
 *
 *   CAS1 := gzip( 'CAS1' · u32 LE header length · header JSON (UTF-8) · rows )
 *   row  := the columns of `CASE_COLUMNS` in order, each `dtype` at its byte width; a missing value is the dtype's
 *           sentinel (i16 −32768, i32 −2^31, u8 255, u16 65535, u32 2^32−1). Physical values are integer-coded like
 *           the cube (`value = q·scale + offset`) — the same scales as `CUBE_PLANES` where the plane exists.
 *
 * The header carries no row count (the file is streamed); the sidecar `<file>.meta.json` written at `close()` does,
 * with the slot list, the exclusion counters and the sha256 of the gzip bytes. Readers count rows from the bytes.
 *
 * Column families (prefixes): keys · `obs_` truth · `c_` cube planes of the nearest cell (raw, dequantised) · `m_`
 * the cube member after PAP 3–5 (`samples[0]`), `ms_` its σ, `mss_` the σ_sys part · `v_` PAP 4 · `t_` PAP 5 ·
 * `f_` the fused distribution of the current engine (candidate „heutiger Cube") · `s<k>_` per-source raw values at
 * model height (order `FL_SOURCES`) · `b<j>_` the three non-nearest block cells (PAP 3 fit).
 */
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync, renameSync, writeFileSync, createReadStream } from 'node:fs';
import { dirname } from 'node:path';
import { createGzip, createGunzip, gunzipSync } from 'node:zlib';
import { once } from 'node:events';

export const CASES_SCHEMA = 1;
export const CASES_KIND = 'fusionfit/cases';
const MAGIC = 'CAS1';

/** Source order of `srcMask` and of the `s<k>_` columns — the union of the hindcast tier sources plus the ensemble. */
export const FL_SOURCES = Object.freeze(['icon_d2', 'icon_ch1_eps', 'icon_eu', 'ifs_hres', 'aifs_single', 'icon_ch2_eps', 'icon_global', 'ifs_ens']);
/** Per-source variables (raw at model height). */
export const FL_SRC_VARS = Object.freeze(['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'ps']);
/** Engine step flags → bit index of `flags`. */
export const FL_FLAGS = Object.freeze(['extrapolatedBelowModel', 'inversionBody', 'stdLapseFallback', 'chunkBorderTruncated', 'belowGround925',
  'nowcastFallbackModel', 'climatologyOnly', 'stale', 'seam', 'interpolated', 'noTerrain', 'nowcastSaturated', 'stationOnly', 'anchored',
  'gridTruncated', 'terrainTermsInactive', 'tpiSigmaUnknown', 'windBlendingInactive', 'gammaImplausible', 'day0Route', 'hmodelProxy']);
export const FL_ROUTES = Object.freeze({ run: 1, day0: 2, dyn: 3 });
export const FL_NETWORKS = Object.freeze({ cdc: 1, tawes: 2, smn: 3 });
export const FL_VERTICAL_CASES = Object.freeze({ A: 1, B: 2, C: 3, std: 4 });
export const FL_TIERS = Object.freeze({ t1: 1, t2: 2, t3: 3 });
/** Bits of `f_climaOnly`. */
export const FL_CLIMA_BITS = Object.freeze({ temperature: 1, dewPoint: 2, windSpeed: 4, gust: 8, clouds: 16, precipitation: 32 });
/** Bits of `truthFlags`. */
export const FL_TRUTH_FLAGS = Object.freeze({ tdDerived: 1, pDerived: 2 });

const U = { deg: [0.01, 'degC'], k: [0.01, 'K'], ms: [0.01, 'm/s'], mm: [0.01, 'mm/h'], pct: [0.1, 'pct'], hpa: [0.1, 'hPa'], m: [1, 'm'], kpkm: [0.01, 'K/km'], f3: [0.001, '-'], f4: [0.0001, '-'], deg1: [1, 'deg'], h: [1, 'h'], n: [1, '-'] };
const col = (name, dtype, unit = 'n', offset = 0) => ({ name, dtype, scale: U[unit][0], offset, unit: U[unit][1] });
const i16 = (name, unit) => col(name, 'i16', unit);

function buildColumns() {
  const c = [
    col('slotAtH', 'i32', 'h'), col('validAtH', 'i32', 'h'), i16('leadH', 'h'), i16('engineLeadH', 'h'),
    col('pointIdx', 'u16'), col('tier', 'u8'), col('route', 'u8'), col('srcMask', 'u16'), col('network', 'u8'), col('truthFlags', 'u8'),
    col('flags', 'u32'), col('verticalCase', 'u8'), col('srcCount', 'u8'), col('ensCount', 'u8'), col('gridN', 'u8'), col('basin', 'u8'),
    i16('obs_t', 'deg'), i16('obs_td', 'deg'), i16('obs_rh', 'pct'), i16('obs_ff', 'ms'), i16('obs_dd', 'deg1'), i16('obs_fx', 'ms'), i16('obs_rr', 'mm'), i16('obs_n', 'pct'), i16('obs_p', 'hpa'),
    i16('c_t2m', 'deg'), i16('c_td2m', 'deg'), i16('c_u10', 'ms'), i16('c_v10', 'ms'), i16('c_gust', 'ms'), i16('c_precip', 'mm'), i16('c_clct', 'pct'), i16('c_clcl', 'pct'), i16('c_clcm', 'pct'), i16('c_clch', 'pct'),
    i16('c_ps', 'hpa'), i16('c_t925', 'deg'), i16('c_t850', 'deg'), i16('c_t700', 'deg'), i16('c_rh925', 'pct'), i16('c_rh850', 'pct'), i16('c_rh700', 'pct'), i16('c_hModEff', 'm'), i16('c_snowlmt', 'm'),
    i16('c_t2m_sd', 'k'), i16('c_td2m_sd', 'k'), i16('c_u10_sd', 'ms'), i16('c_v10_sd', 'ms'), i16('c_gust_sd', 'ms'), i16('c_precip_sd', 'mm'), i16('c_clct_sd', 'pct'), i16('c_ps_sd', 'hpa'),
    i16('c_t2m_sd_ens', 'k'), i16('c_u10_sd_ens', 'ms'), i16('c_v10_sd_ens', 'ms'), i16('c_precip_sd_ens', 'mm'),
    i16('c_t2m_q10', 'deg'), i16('c_t2m_q90', 'deg'), i16('c_precip_q10', 'mm'), i16('c_precip_q90', 'mm'),
    i16('m_t', 'deg'), i16('m_td', 'deg'), i16('m_u', 'ms'), i16('m_v', 'ms'), i16('m_gust', 'ms'), i16('m_precip', 'mm'), i16('m_clct', 'pct'), i16('m_ps', 'hpa'), i16('m_hModEff', 'm'),
    i16('ms_t', 'k'), i16('ms_td', 'k'), i16('ms_wind', 'ms'), i16('ms_gust', 'ms'), i16('ms_clouds', 'pct'),
    i16('mss_t', 'k'), i16('mss_td', 'k'), i16('mss_wind', 'ms'), i16('mss_gust', 'ms'), i16('mss_clouds', 'pct'),
    i16('v_dh', 'm'), i16('v_delta', 'k'), i16('v_gamma', 'kpkm'),
    i16('t_fRad', 'f3'), i16('t_gCap', 'f3'), i16('t_gUhi', 'f3'), i16('t_fSaison', 'f3'), i16('t_foehn', 'f3'), i16('t_windFactor', 'f3'),
    i16('f_t_mu', 'deg'), i16('f_t_sig', 'k'), i16('f_td_mu', 'deg'), i16('f_td_sig', 'k'), i16('f_ws_nu', 'ms'), i16('f_ws_sig', 'ms'), i16('f_gust_mu', 'ms'), i16('f_gust_sig', 'ms'),
    i16('f_cl_mu', 'pct'), i16('f_cl_sig', 'pct'), i16('f_pr_pDry', 'f4'), i16('f_pr_mu', 'f3'), i16('f_pr_sig', 'f3'), i16('f_pSnow', 'f4'), col('f_climaOnly', 'u8'), i16('f_wdir', 'deg1'),
  ];
  for (let k = 0; k < FL_SOURCES.length; k++) {
    if (FL_SOURCES[k] === 'ifs_ens') continue;   // ensemble only: σ_ens/q planes of the cube carry it
    for (const v of FL_SRC_VARS) c.push(i16(`s${k}_${v}`, v === 't2m' || v === 'td2m' ? 'deg' : v === 'precip' ? 'mm' : v === 'clct' ? 'pct' : v === 'ps' ? 'hpa' : 'ms'));
  }
  for (let j = 0; j < 3; j++) { c.push(i16(`b${j}_t2m`, 'deg'), i16(`b${j}_u10`, 'ms'), i16(`b${j}_v10`, 'ms'), i16(`b${j}_hModEff`, 'm')); }
  return Object.freeze(c);
}
export const CASE_COLUMNS = buildColumns();
export const CASE_INDEX = Object.freeze(Object.fromEntries(CASE_COLUMNS.map((c, i) => [c.name, i])));

const WIDTH = { i16: 2, i32: 4, u8: 1, u16: 2, u32: 4 };
const SENT = { i16: -32768, i32: -2147483648, u8: 255, u16: 65535, u32: 4294967295 };
const LIM = { i16: [-32767, 32767], i32: [-2147483647, 2147483647], u8: [0, 254], u16: [0, 65534], u32: [0, 4294967294] };
export const ROW_BYTES = CASE_COLUMNS.reduce((a, c) => a + WIDTH[c.dtype], 0);
const OFFSETS = (() => { let o = 0; return CASE_COLUMNS.map((c) => { const x = o; o += WIDTH[c.dtype]; return x; }); })();

/** Encode one physical value into the column's integer code (clamped), NaN/null → sentinel. */
export function encodeCol(ci, v) {
  const c = CASE_COLUMNS[ci];
  if (v == null || !Number.isFinite(v)) return SENT[c.dtype];
  const q = Math.round((v - c.offset) / c.scale);
  const [lo, hi] = LIM[c.dtype];
  return q < lo ? lo : q > hi ? hi : q;
}
export function decodeCol(ci, q) {
  const c = CASE_COLUMNS[ci];
  return q === SENT[c.dtype] ? NaN : q * c.scale + c.offset;
}

function writeCode(view, off, dtype, q) {
  switch (dtype) {
    case 'i16': view.setInt16(off, q, true); break;
    case 'i32': view.setInt32(off, q, true); break;
    case 'u8': view.setUint8(off, q); break;
    case 'u16': view.setUint16(off, q, true); break;
    case 'u32': view.setUint32(off, q, true); break;
    default: throw new Error(`dtype ${dtype}`);
  }
}
function readCode(view, off, dtype) {
  switch (dtype) {
    case 'i16': return view.getInt16(off, true);
    case 'i32': return view.getInt32(off, true);
    case 'u8': return view.getUint8(off);
    case 'u16': return view.getUint16(off, true);
    case 'u32': return view.getUint32(off, true);
    default: throw new Error(`dtype ${dtype}`);
  }
}

/** A fresh row buffer: physical values (NaN = missing), indexed by `CASE_INDEX`. */
export const newRow = () => new Float64Array(CASE_COLUMNS.length).fill(NaN);

/**
 * Streaming writer. `header` = { tier, month, codeHash, engineVariant, featuresHash, cellsCommit, wcMirrorSha, points, … };
 * `push(row: Float64Array)` encodes and buffers, `close()` finishes the gzip stream, writes the sidecar and returns it.
 */
export async function openCasesWriter(path, header) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const file = createWriteStream(tmp);
  const gz = createGzip({ level: 6 });
  const hash = createHash('sha256');
  gz.on('data', (d) => hash.update(d));
  gz.pipe(file);
  const head = Buffer.from(JSON.stringify({ schema: CASES_SCHEMA, kind: CASES_KIND, ...header, columns: CASE_COLUMNS, rowBytes: ROW_BYTES, flagBits: FL_FLAGS, sources: FL_SOURCES, srcVars: FL_SRC_VARS }), 'utf8');
  const pre = Buffer.alloc(8);
  pre.write(MAGIC, 0, 'ascii');
  pre.writeUInt32LE(head.length, 4);
  const write = async (buf) => { if (!gz.write(buf)) await once(gz, 'drain'); };
  await write(pre);
  await write(head);
  const CHUNK_ROWS = 4096;
  let chunk = Buffer.alloc(ROW_BYTES * CHUNK_ROWS), view = new DataView(chunk.buffer, chunk.byteOffset, chunk.length), inChunk = 0, rows = 0;
  let pending = Promise.resolve();
  const flush = async () => {
    if (!inChunk) return;
    const out = chunk.subarray(0, inChunk * ROW_BYTES);
    chunk = Buffer.alloc(ROW_BYTES * CHUNK_ROWS); view = new DataView(chunk.buffer, chunk.byteOffset, chunk.length);
    inChunk = 0;
    await write(out);
  };
  return {
    path, header,
    get rows() { return rows; },
    push(row) {
      const base = inChunk * ROW_BYTES;
      for (let ci = 0; ci < CASE_COLUMNS.length; ci++) writeCode(view, base + OFFSETS[ci], CASE_COLUMNS[ci].dtype, encodeCol(ci, row[ci]));
      inChunk += 1; rows += 1;
      if (inChunk === CHUNK_ROWS) pending = pending.then(flush);
      return pending;
    },
    async close(meta = {}) {
      await pending;
      await flush();
      gz.end();
      await once(file, 'finish');
      renameSync(tmp, path);
      const side = { schema: CASES_SCHEMA, kind: `${CASES_KIND}/meta`, path, rows, rowBytes: ROW_BYTES, sha256: hash.digest('hex'), closedAt: new Date().toISOString(), ...meta };
      writeFileSync(`${path}.meta.json`, JSON.stringify(side, null, 1));
      return side;
    },
  };
}

function parseHead(buf) {
  if (buf.length < 8 || buf.toString('ascii', 0, 4) !== MAGIC) throw new Error('casesio: not a CAS1 file');
  const len = buf.readUInt32LE(4);
  if (buf.length < 8 + len) return null;
  const header = JSON.parse(buf.toString('utf8', 8, 8 + len));
  if (header.schema !== CASES_SCHEMA || header.kind !== CASES_KIND) throw new Error(`casesio: schema ${header.schema} / ${header.kind}`);
  if (header.rowBytes !== ROW_BYTES || header.columns.length !== CASE_COLUMNS.length || header.columns.some((c, i) => c.name !== CASE_COLUMNS[i].name || c.dtype !== CASE_COLUMNS[i].dtype))
    throw new Error('casesio: column layout differs from CASE_COLUMNS — rebuild the cases');
  return { header, dataStart: 8 + len };
}

/**
 * Decode `n` rows from `buf` (starting at byte 0) into per-column Float64Arrays; `wanted` = column indices (default all).
 * One monomorphic loop per dtype — a `switch` per value cost 240 ns each (measured on 18 662 × 110 values).
 */
export function decodeRows(buf, n, wanted = null) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.length);
  const idx = wanted ?? CASE_COLUMNS.map((_, i) => i);
  const out = {};
  const RB = ROW_BYTES;
  for (const ci of idx) {
    const arr = new Float64Array(n), c = CASE_COLUMNS[ci], dt = c.dtype, off = OFFSETS[ci], s = SENT[dt], sc = c.scale, of = c.offset;
    if (dt === 'i16') for (let r = 0, p = off; r < n; r++, p += RB) { const q = view.getInt16(p, true); arr[r] = q === s ? NaN : q * sc + of; }
    else if (dt === 'i32') for (let r = 0, p = off; r < n; r++, p += RB) { const q = view.getInt32(p, true); arr[r] = q === s ? NaN : q * sc + of; }
    else if (dt === 'u8') for (let r = 0, p = off; r < n; r++, p += RB) { const q = view.getUint8(p); arr[r] = q === s ? NaN : q * sc + of; }
    else if (dt === 'u16') for (let r = 0, p = off; r < n; r++, p += RB) { const q = view.getUint16(p, true); arr[r] = q === s ? NaN : q * sc + of; }
    else if (dt === 'u32') for (let r = 0, p = off; r < n; r++, p += RB) { const q = view.getUint32(p, true); arr[r] = q === s ? NaN : q * sc + of; }
    else throw new Error(`dtype ${dt}`);
    out[c.name] = arr;
  }
  return out;
}

/**
 * Streaming reader: `onBatch(cols, n, header)` per batch of ≤ `batchRows` rows (cols = { name: Float64Array }).
 * Returns { header, rows }. Memory ≤ batchRows × rowBytes plus one gzip window.
 */
export async function readCases(path, { columns = null, batchRows = 65536, onBatch } = {}) {
  const wanted = columns ? columns.map((n) => { const i = CASE_INDEX[n]; if (i == null) throw new Error(`casesio: unknown column ${n}`); return i; }) : null;
  // zlib streams inflate in the threadpool, one job per output chunk: with the default 16 KB a 6-MB file took 1,0 s,
  // with 8-MB chunks 0,15 s (measured 23.09.) — the same order as gunzipSync, without holding the whole file
  const gunzip = createGunzip({ chunkSize: 8 * 1024 * 1024 });
  const src = createReadStream(path, { highWaterMark: 8 * 1024 * 1024 });
  src.pipe(gunzip);
  let head = null, headBuf = Buffer.alloc(0), rows = 0;
  const batchBytes = batchRows * ROW_BYTES;
  // pieces are collected and joined ONCE per batch — joining each gunzip chunk onto a growing buffer was quadratic
  // (measured 75 µs per row on an 11-MB batch; now ≈ 1 µs)
  let pieces = [], pending = 0;
  const drain = async (final) => {
    let buf = pieces.length === 1 ? pieces[0] : Buffer.concat(pieces, pending);
    pieces = []; pending = 0;
    let off = 0;
    while (buf.length - off >= batchBytes) {
      if (onBatch) await onBatch(decodeRows(buf.subarray(off, off + batchBytes), batchRows, wanted), batchRows, head);
      rows += batchRows; off += batchBytes;
    }
    if (final) {
      const rest = buf.length - off, n = Math.floor(rest / ROW_BYTES);
      if (n * ROW_BYTES !== rest) throw new Error(`casesio: ${rest - n * ROW_BYTES} trailing bytes — torn file`);
      if (n && onBatch) await onBatch(decodeRows(buf.subarray(off, off + n * ROW_BYTES), n, wanted), n, head);
      rows += n;
    } else if (off < buf.length) { pieces.push(buf.subarray(off)); pending = buf.length - off; }
  };
  for await (const piece of gunzip) {
    let data = piece;
    if (!head) {
      headBuf = Buffer.concat([headBuf, piece]);
      const h = parseHead(headBuf);
      if (!h) continue;
      head = h.header;
      data = headBuf.subarray(h.dataStart);
      headBuf = Buffer.alloc(0);
    }
    pieces.push(data); pending += data.length;
    if (pending >= batchBytes) await drain(false);
  }
  if (!head) throw new Error('casesio: empty or headerless file');
  await drain(true);
  return { header: head, rows };
}

/** Whole file in memory (tests, small files). */
export function readCasesSync(path, columns = null) {
  const buf = gunzipSync(readFileSync(path));
  const h = parseHead(buf);
  if (!h) throw new Error('casesio: truncated header');
  const data = buf.subarray(h.dataStart);
  const n = Math.floor(data.length / ROW_BYTES);
  if (n * ROW_BYTES !== data.length) throw new Error('casesio: trailing bytes');
  const wanted = columns ? columns.map((x) => CASE_INDEX[x]) : null;
  return { header: h.header, rows: n, cols: decodeRows(data, n, wanted) };
}
