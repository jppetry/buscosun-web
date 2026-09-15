/**
 * urbanTiff.mjs — dependency-free readers the urban product needs (E-13):
 * a (Big)TIFF IFD parser, a TIFF-LZW decoder, and the Mollweide projection
 * of the JRC GHSL tile grid.
 *
 * ── Why this exists next to `src/fire/detail/cogTiff.ts` ────────────────────
 * Measured on the real tiles (2026-09-14, R4_C19 of GHS-BUILT-S E2020 and
 * GHS-BUILT-H ANBH E2018, both R2023A, 54009, 100 m):
 *
 *   magic 43 = **BigTIFF** (8-byte offsets)      → `parseCogIfds` rejects it by name
 *   compression 5 = **LZW**, predictor 1         → `decodeTile*` only read 1 and 8
 *   tiled 256 × 256, 10 000 × 10 000, 1 600 tiles, PlanarConfig 1
 *   BUILT-S: 16 bit, SampleFormat 1 (uint),  GDAL_NODATA "65535"
 *   ANBH:    32 bit, SampleFormat 3 (float), GDAL_NODATA "255"
 *   ModelPixelScale (100, 100, 0), ModelTiepoint (0,0,0 → X0, Y0, 0)
 *
 * Neither the BigTIFF layout nor LZW is a two-line extension of the COG reader,
 * and that reader is shipped to the browser — the urban product is a producer-only
 * path, so the code lives here and stays out of the bundle.
 *
 * ── TIFF-LZW, the variant that matters ─────────────────────────────────────
 * MSB-first codes, 9…12 bits, ClearCode 256, EOI 257, first free entry 258, and
 * the "early change": the DECODER widens the code length as soon as the next free
 * entry index reaches 2^n − 1 (libtiff `maxcodep = codetab + nbitsmask − 1`),
 * because it lags the encoder by one dictionary entry. The ENCODER widens when
 * the next free index reaches 2^n. The self-test round-trips through both, and
 * the real tiles prove the decoder against libtiff's output (exact output length,
 * value ranges, and a lake transect in `build-urban.mjs`).
 *
 * ── Mollweide ──────────────────────────────────────────────────────────────
 * Forward: solve 2θ + sin 2θ = π sin φ (Newton), x = R·(2√2/π)·λ·cos θ,
 * y = R·√2·sin θ. The projection is spherical; the radius is a CHOICE, and the
 * two candidates differ by 0.11 % — 6.4 km in y at 48 °N, 6.7 km at 51 °N, more
 * than a t1 cell. ESRI:54009 "World_Mollweide" carries the WGS-84 ellipsoid in its WKT,
 * and both PROJ (`moll` forces `es = 0` and uses `a`) and ESRI's engine use the
 * SEMI-MAJOR axis 6 378 137 m as the sphere radius — not the authalic radius
 * 6 371 007.181 m. The GHSL grid origin −18 041 000 m is 2√2·6 378 137 = 18 040 096
 * rounded outward; with the authalic radius it would be 18 019 930. `build-urban.mjs`
 * proves the choice on the data (Lake Constance transect), this module only
 * offers both constants.
 */

// ---------------------------------------------------------------------------
// Mollweide
// ---------------------------------------------------------------------------

/** Sphere radius used by PROJ/ESRI for ESRI:54009 (WGS-84 semi-major axis). */
export const MOLLWEIDE_R_ESRI = 6378137;
/** WGS-84 authalic radius — the OTHER candidate; kept so the choice stays measurable. */
export const MOLLWEIDE_R_AUTHALIC = 6371007.181;

const SQRT2 = Math.SQRT2;
const DEG = Math.PI / 180;

/** The auxiliary angle θ for latitude φ (radians): 2θ + sin 2θ = π sin φ. */
export function mollweideTheta(phiRad) {
  const target = Math.PI * Math.sin(phiRad);
  // Poles: the equation degenerates (derivative → 0); the solution is ±π/2.
  if (Math.abs(phiRad) >= Math.PI / 2 - 1e-12) return Math.sign(phiRad) * Math.PI / 2;
  let theta = phiRad; // good start: θ ≈ φ for small latitudes
  for (let i = 0; i < 25; i++) {
    const f = 2 * theta + Math.sin(2 * theta) - target;
    const df = 2 + 2 * Math.cos(2 * theta);
    const step = f / df;
    theta -= step;
    if (Math.abs(step) < 1e-13) break;
  }
  return theta;
}

/** Forward projection, degrees in → metres out. `lon0` = 0 for the GHSL grid. */
export function mollweideForward(lat, lon, R = MOLLWEIDE_R_ESRI) {
  const theta = mollweideTheta(lat * DEG);
  return {
    x: R * (2 * SQRT2 / Math.PI) * (lon * DEG) * Math.cos(theta),
    y: R * SQRT2 * Math.sin(theta),
  };
}

/** Inverse projection, metres in → degrees out. Returns `null` outside the ellipse. */
export function mollweideInverse(x, y, R = MOLLWEIDE_R_ESRI) {
  const s = y / (R * SQRT2);
  if (s < -1 || s > 1) return null;
  const theta = Math.asin(s);
  const sinPhi = (2 * theta + Math.sin(2 * theta)) / Math.PI;
  if (sinPhi < -1 || sinPhi > 1) return null;
  const cosTheta = Math.cos(theta);
  if (cosTheta === 0) return { lat: Math.asin(sinPhi) / DEG, lon: 0 };
  const lon = (Math.PI * x) / (2 * SQRT2 * R * cosTheta);
  if (lon < -Math.PI - 1e-9 || lon > Math.PI + 1e-9) return null;
  return { lat: Math.asin(sinPhi) / DEG, lon: lon / DEG };
}

/**
 * Per-ROW helpers: in Mollweide every parallel is a straight horizontal line, so a
 * raster row has ONE latitude and lon = x · k(row). `build-urban.mjs` computes the
 * two numbers once per row and multiplies per column.
 */
export function mollweideRow(y, R = MOLLWEIDE_R_ESRI) {
  const s = y / (R * SQRT2);
  if (s < -1 || s > 1) return null;
  const theta = Math.asin(s);
  const sinPhi = (2 * theta + Math.sin(2 * theta)) / Math.PI;
  const cosTheta = Math.cos(theta);
  if (cosTheta === 0 || sinPhi < -1 || sinPhi > 1) return null;
  return { lat: Math.asin(sinPhi) / DEG, k: Math.PI / (2 * SQRT2 * R * cosTheta) / DEG };
}

// ---------------------------------------------------------------------------
// GHSL tile grid (R2023A, 54009, 100 m): 1 000 000 m squares
// ---------------------------------------------------------------------------

export const GHSL_GRID = Object.freeze({ originX: -18041000, originY: 9000000, size: 1_000_000, cols: 36, rows: 18 });

/** Tile (row, col) — 1-based, row 1 at the top — containing a Mollweide point. */
export function ghslTileOf(x, y) {
  return {
    r: Math.floor((GHSL_GRID.originY - y) / GHSL_GRID.size) + 1,
    c: Math.floor((x - GHSL_GRID.originX) / GHSL_GRID.size) + 1,
  };
}

/** Upper-left corner and extent of a tile in metres. */
export function ghslTileExtent(r, c) {
  const x0 = GHSL_GRID.originX + (c - 1) * GHSL_GRID.size;
  const y0 = GHSL_GRID.originY - (r - 1) * GHSL_GRID.size;
  return { x0, y0, x1: x0 + GHSL_GRID.size, y1: y0 - GHSL_GRID.size };
}

export function ghslTileName(r, c) {
  return `R${r}_C${c}`;
}

export function parseGhslTileName(name) {
  const m = /^R(\d+)_C(\d+)$/.exec(name);
  if (!m) throw new Error(`urban: tile name ${name} is not R<r>_C<c>`);
  return { r: Number(m[1]), c: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// (Big)TIFF IFD
// ---------------------------------------------------------------------------

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };

/**
 * First IFD of a classic or Big TIFF. Reads only what a raster reader needs and
 * the GeoTIFF tags that place the pixels; everything else is left where it is.
 *
 * @param {Buffer|Uint8Array} buf  the whole file (the tiles are 40 MB — fine)
 */
export function parseTiff(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.byteLength < 16) throw new Error('urban-tiff: file shorter than a TIFF header');
  const bom = dv.getUint16(0, false);
  const le = bom === 0x4949;
  if (!le && bom !== 0x4d4d) throw new Error('urban-tiff: no TIFF byte-order mark');
  const magic = dv.getUint16(2, le);
  let bigTiff;
  if (magic === 42) bigTiff = false;
  else if (magic === 43) {
    bigTiff = true;
    const offSize = dv.getUint16(4, le);
    if (offSize !== 8) throw new Error(`urban-tiff: BigTIFF with offset size ${offSize} (expected 8)`);
  } else throw new Error(`urban-tiff: unknown TIFF magic ${magic}`);

  const u64 = (o) => {
    const v = dv.getBigUint64(o, le);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('urban-tiff: 64-bit offset beyond 2^53');
    return Number(v);
  };
  const ifd = bigTiff ? u64(8) : dv.getUint32(4, le);
  const count = bigTiff ? u64(ifd) : dv.getUint16(ifd, le);
  const entrySize = bigTiff ? 20 : 12;
  const inlineMax = bigTiff ? 8 : 4;

  const tags = new Map();
  for (let i = 0; i < count; i++) {
    const eo = ifd + (bigTiff ? 8 : 2) + i * entrySize;
    const tag = dv.getUint16(eo, le);
    const type = dv.getUint16(eo + 2, le);
    const n = bigTiff ? u64(eo + 4) : dv.getUint32(eo + 4, le);
    const size = TYPE_SIZE[type];
    if (size == null) continue;
    const total = size * n;
    const valueField = eo + (bigTiff ? 12 : 8);
    const at = total <= inlineMax ? valueField : (bigTiff ? u64(valueField) : dv.getUint32(valueField, le));
    if (at + total > dv.byteLength) throw new Error(`urban-tiff: tag ${tag} data beyond file end`);
    tags.set(tag, { type, n, at });
  }

  const num = (t) => {
    const e = tags.get(t);
    if (!e) return null;
    const out = new Array(e.n);
    for (let j = 0; j < e.n; j++) {
      const o = e.at + j * TYPE_SIZE[e.type];
      switch (e.type) {
        case 1: case 7: out[j] = dv.getUint8(o); break;
        case 3: out[j] = dv.getUint16(o, le); break;
        case 4: out[j] = dv.getUint32(o, le); break;
        case 11: out[j] = dv.getFloat32(o, le); break;
        case 12: out[j] = dv.getFloat64(o, le); break;
        case 16: out[j] = u64(o); break;
        default: out[j] = NaN;
      }
    }
    return out;
  };
  const str = (t) => {
    const e = tags.get(t);
    if (!e || e.type !== 2) return null;
    let s = '';
    for (let j = 0; j < e.n; j++) { const c = dv.getUint8(e.at + j); if (c === 0) break; s += String.fromCharCode(c); }
    return s;
  };

  const width = num(256)?.[0];
  const height = num(257)?.[0];
  if (!width || !height) throw new Error('urban-tiff: no image dimensions');
  const bits = num(258)?.[0] ?? 8;
  const spp = num(277)?.[0] ?? 1;
  const tileW = num(322)?.[0] ?? null;
  const tileH = num(323)?.[0] ?? null;
  const tiled = tileW != null && tileH != null;
  const offsets = tiled ? num(324) : num(273);
  const byteCounts = tiled ? num(325) : num(279);
  if (!offsets || !byteCounts) throw new Error('urban-tiff: neither tile nor strip offsets present');
  const rowsPerStrip = tiled ? null : (num(278)?.[0] ?? height);

  // GeoKeyDirectory (34735): header (KeyDirectoryVersion, KeyRevision, MinorRevision, NumberOfKeys)
  // then 4 shorts per key: KeyID, TIFFTagLocation, Count, Value_Offset. Only inline SHORT values
  // (TagLocation 0) are decoded — that covers ModelType, RasterType, ProjectedCSType.
  const geoKeys = {};
  const gk = num(34735);
  if (gk && gk.length >= 4) {
    const nKeys = gk[3];
    for (let i = 0; i < nKeys; i++) {
      const [id, loc, cnt, val] = gk.slice(4 + i * 4, 8 + i * 4);
      if (loc === 0 && cnt === 1) geoKeys[id] = val;
    }
  }
  const nodataStr = str(42113);
  const nodata = nodataStr == null ? null : Number(nodataStr.trim());

  return {
    le, bigTiff, width, height, bits, samplesPerPixel: spp,
    sampleFormat: num(339)?.[0] ?? 1,
    compression: num(259)?.[0] ?? 1,
    predictor: num(317)?.[0] ?? 1,
    planar: num(284)?.[0] ?? 1,
    layout: tiled ? 'tiled' : 'stripped',
    tileW: tiled ? tileW : width,
    tileH: tiled ? tileH : rowsPerStrip,
    tilesAcross: tiled ? Math.ceil(width / tileW) : 1,
    tilesDown: tiled ? Math.ceil(height / tileH) : Math.ceil(height / rowsPerStrip),
    offsets, byteCounts,
    pixelScale: num(33550),
    tiepoint: num(33922),
    transform: num(34264),
    geoKeys,
    citation: str(34737),
    nodata: Number.isFinite(nodata) ? nodata : null,
    nodataRaw: nodataStr,
  };
}

/** Upper-left corner + pixel size in map units — from the tiepoint, or the transform. */
export function tiffGeoOrigin(t) {
  if (t.tiepoint && t.tiepoint.length >= 6 && t.pixelScale && t.pixelScale.length >= 2) {
    const [i, j, , x, y] = t.tiepoint;
    const [sx, sy] = t.pixelScale;
    // The tiepoint may name any pixel; move it to (0,0).
    return { x0: x - i * sx, y0: y + j * sy, sx, sy };
  }
  if (t.transform && t.transform.length >= 16) {
    const m = t.transform;
    if (m[1] !== 0 || m[4] !== 0) throw new Error('urban-tiff: rotated ModelTransformation is not supported');
    return { x0: m[3], y0: m[7], sx: m[0], sy: -m[5] };
  }
  throw new Error('urban-tiff: no georeference (33922/33550 or 34264)');
}

// ---------------------------------------------------------------------------
// TIFF-LZW
// ---------------------------------------------------------------------------

const LZW_CLEAR = 256;
const LZW_EOI = 257;
const LZW_FIRST = 258;
const LZW_MAX_BITS = 12;
const LZW_TABLE = 1 << LZW_MAX_BITS;

/**
 * Decode one LZW-compressed tile/strip. `dstLen` is the exact expected byte count;
 * anything else (short, long, code beyond the table) is a NAMED error — a wrong
 * bit-width transition produces garbage that would otherwise look like data.
 */
export function lzwDecode(src, dstLen) {
  const out = new Uint8Array(dstLen);
  const prefix = new Int32Array(LZW_TABLE);
  const suffix = new Uint8Array(LZW_TABLE);
  const length = new Uint16Array(LZW_TABLE);
  const first = new Uint8Array(LZW_TABLE);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; length[i] = 1; first[i] = i; }

  let bitBuf = 0, bitCnt = 0, pos = 0;
  const srcLen = src.length;
  const readCode = (nbits) => {
    while (bitCnt < nbits) {
      if (pos >= srcLen) return -1;
      bitBuf = (bitBuf << 8) | src[pos++];
      bitCnt += 8;
    }
    bitCnt -= nbits;
    const code = (bitBuf >>> bitCnt) & ((1 << nbits) - 1);
    bitBuf &= (1 << bitCnt) - 1;
    return code;
  };

  // Write the string of `code` ending at out[at + length[code] - 1]; returns its length.
  const emit = (code, at) => {
    const len = length[code];
    if (at + len > dstLen) throw new Error(`urban-lzw: output overflow (${at + len} > ${dstLen})`);
    let i = at + len;
    let c = code;
    while (c >= LZW_FIRST) { out[--i] = suffix[c]; c = prefix[c]; }
    out[--i] = c;
    return len;
  };

  let nbits = 9;
  let next = LZW_FIRST;
  let prev = -1;
  let w = 0;
  for (;;) {
    const code = readCode(nbits);
    if (code < 0 || code === LZW_EOI) break;
    if (code === LZW_CLEAR) {
      nbits = 9; next = LZW_FIRST; prev = -1;
      continue;
    }
    if (prev < 0) {
      // First code after a Clear: a literal, no dictionary entry.
      if (code >= LZW_FIRST) throw new Error(`urban-lzw: code ${code} right after Clear`);
      w += emit(code, w);
      prev = code;
      continue;
    }
    if (code > next) throw new Error(`urban-lzw: code ${code} beyond next free entry ${next}`);
    if (next >= LZW_TABLE) throw new Error('urban-lzw: dictionary overflow without Clear');
    // New entry = prev + first char of (code < next ? code : prev)  — the KwKwK case.
    const firstChar = code < next ? first[code] : first[prev];
    prefix[next] = prev; suffix[next] = firstChar; length[next] = length[prev] + 1; first[next] = first[prev];
    next++;
    w += emit(code, w);
    prev = code;
    // Early change: widen when the NEXT free index reaches 2^n − 1.
    if (next >= (1 << nbits) - 1 && nbits < LZW_MAX_BITS) nbits++;
    if (w >= dstLen) break;
  }
  if (w !== dstLen) throw new Error(`urban-lzw: decoded ${w} bytes, expected ${dstLen}`);
  return out;
}

/**
 * TIFF-LZW encoder — exists for the self-test only (round trip through a
 * decoder that was never fed anything else would prove nothing). Mirrors
 * libtiff: Clear first, widen when the next free index reaches 2^n, Clear
 * again before the table fills, EOI last.
 */
export function lzwEncode(bytes) {
  const out = [];
  let bitBuf = 0, bitCnt = 0;
  const put = (code, nbits) => {
    bitBuf = (bitBuf << nbits) | code;
    bitCnt += nbits;
    while (bitCnt >= 8) { out.push((bitBuf >>> (bitCnt - 8)) & 0xff); bitCnt -= 8; bitBuf &= (1 << bitCnt) - 1; }
  };
  let dict = new Map();
  let next = LZW_FIRST;
  let nbits = 9;
  put(LZW_CLEAR, nbits);
  if (bytes.length === 0) { put(LZW_EOI, nbits); if (bitCnt > 0) out.push((bitBuf << (8 - bitCnt)) & 0xff); return Uint8Array.from(out); }
  let ent = bytes[0];
  for (let i = 1; i < bytes.length; i++) {
    const c = bytes[i];
    const key = ent * 256 + c;
    const hit = dict.get(key);
    if (hit != null) { ent = hit; continue; }
    put(ent, nbits);
    if (next === LZW_TABLE - 2) {
      // Table (almost) full: reset like libtiff (CODE_MAX − 1 = 4094).
      put(LZW_CLEAR, nbits);
      dict = new Map(); next = LZW_FIRST; nbits = 9;
    } else {
      dict.set(key, next++);
      if (next >= (1 << nbits) && nbits < LZW_MAX_BITS) nbits++;
    }
    ent = c;
  }
  put(ent, nbits);
  // The encoder's dictionary is one entry ahead of the decoder's; the decoder
  // widens one step later, so EOI goes out at the width the DECODER expects.
  // libtiff's PostEncode: free_ent++ (a phantom entry), widen if it exceeds maxcode.
  put(LZW_EOI, next + 1 >= (1 << nbits) && nbits < LZW_MAX_BITS ? nbits + 1 : nbits);
  if (bitCnt > 0) out.push((bitBuf << (8 - bitCnt)) & 0xff);
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// Tile decode
// ---------------------------------------------------------------------------

/** Raw bytes of one tile/strip, predictor undone. Named errors for everything unmeasured. */
export function decodeTiffTileBytes(t, buf, idx) {
  if (t.planar !== 1) throw new Error(`urban-tiff-unsupported: PlanarConfiguration ${t.planar}`);
  if (t.samplesPerPixel !== 1) throw new Error(`urban-tiff-unsupported: ${t.samplesPerPixel} samples per pixel`);
  if (t.predictor !== 1) throw new Error(`urban-tiff-unsupported: Predictor ${t.predictor} (measured 1 on GHSL R2023A)`);
  const off = t.offsets[idx], len = t.byteCounts[idx];
  if (off == null || len == null) throw new Error(`urban-tiff: tile ${idx} out of range`);
  const bytesPerSample = t.bits / 8;
  const rows = t.layout === 'tiled' ? t.tileH : Math.min(t.tileH, t.height - idx * t.tileH);
  const expected = t.tileW * rows * bytesPerSample;
  const src = buf.subarray(off, off + len);
  if (t.compression === 1) {
    if (src.length !== expected) throw new Error(`urban-tiff: raw tile ${src.length} B, expected ${expected}`);
    return src;
  }
  if (t.compression === 5) return lzwDecode(src, expected);
  throw new Error(`urban-tiff-unsupported: Compression ${t.compression} (this reader knows 1 and 5=LZW)`);
}

/** One tile as a typed array in the file's sample type (uint8/uint16/uint32/float32). */
export function decodeTiffTile(t, buf, idx) {
  const raw = decodeTiffTileBytes(t, buf, idx);
  const n = raw.length / (t.bits / 8);
  // A fresh Uint8Array from lzwDecode is 4-byte aligned; a raw subarray may not be — copy then.
  const aligned = raw.byteOffset % 4 === 0 ? raw : raw.slice();
  const platformLe = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  if (t.bits === 8) return t.sampleFormat === 2 ? new Int8Array(aligned.buffer, aligned.byteOffset, n) : new Uint8Array(aligned.buffer, aligned.byteOffset, n);
  const dv = new DataView(aligned.buffer, aligned.byteOffset, aligned.byteLength);
  if (t.bits === 16 && t.sampleFormat === 1) {
    if (t.le === platformLe) return new Uint16Array(aligned.buffer, aligned.byteOffset, n);
    const o = new Uint16Array(n); for (let i = 0; i < n; i++) o[i] = dv.getUint16(i * 2, t.le); return o;
  }
  if (t.bits === 32 && t.sampleFormat === 3) {
    if (t.le === platformLe) return new Float32Array(aligned.buffer, aligned.byteOffset, n);
    const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = dv.getFloat32(i * 4, t.le); return o;
  }
  if (t.bits === 32 && t.sampleFormat === 1) {
    if (t.le === platformLe) return new Uint32Array(aligned.buffer, aligned.byteOffset, n);
    const o = new Uint32Array(n); for (let i = 0; i < n; i++) o[i] = dv.getUint32(i * 4, t.le); return o;
  }
  throw new Error(`urban-tiff-unsupported: ${t.bits} bit, SampleFormat ${t.sampleFormat}`);
}

// ---------------------------------------------------------------------------
// Self-test (no network, no files)
// ---------------------------------------------------------------------------

export function urbanTiffSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  // Mollweide: known values and round trip.
  const o = mollweideForward(0, 0);
  add('Mollweide 0/0 → 0/0', Math.abs(o.x) < 1e-6 && Math.abs(o.y) < 1e-6);
  const pole = mollweideForward(90, 0);
  add('Mollweide lat 90 → y = R·√2', Math.abs(pole.y - MOLLWEIDE_R_ESRI * Math.SQRT2) < 1e-3, `${pole.y}`);
  const east = mollweideForward(0, 180);
  add('Mollweide lon 180 at equator → x = 2√2·R', Math.abs(east.x - 2 * Math.SQRT2 * MOLLWEIDE_R_ESRI) < 1e-3, `${east.x}`);
  // PROJ reference (proj=moll, a=6378137): lat 48.137, lon 11.575 → x 950 143.36, y 5 706 296.56 (computed here, not cited —
  // the decisive check is the lake transect in build-urban). Round trip is what this test proves.
  let worst = 0;
  for (const [lat, lon] of [[48.137, 11.575], [52.52, 13.405], [46.02, 7.75], [55.5, 17.5], [45.5, 5.5], [-33.9, 151.2], [0, -179.9]]) {
    const p = mollweideForward(lat, lon);
    const back = mollweideInverse(p.x, p.y);
    const q = mollweideForward(back.lat, back.lon);
    worst = Math.max(worst, Math.hypot(q.x - p.x, q.y - p.y));
  }
  add('Mollweide round trip ≤ 1 m (7 points)', worst <= 1, `worst ${worst.toExponential(2)} m`);
  const row = mollweideRow(5706296.56);
  const inv = mollweideInverse(950143.36, 5706296.56);
  add('mollweideRow: lat and k reproduce the inverse', Math.abs(row.lat - inv.lat) < 1e-9 && Math.abs(row.k * 950143.36 - inv.lon) < 1e-9);
  {
    // y scales with R: Δy = ΔR · y / R — 6.4 km at 48 °N, 6.7 km at 51 °N. More than a t1 cell.
    const a = mollweideForward(48, 11), b = mollweideForward(48, 11, MOLLWEIDE_R_AUTHALIC);
    const expect = (MOLLWEIDE_R_ESRI - MOLLWEIDE_R_AUTHALIC) * a.y / MOLLWEIDE_R_ESRI;
    add('Mollweide: the two radii differ by ΔR·y/R ≈ 6.4 km in y at 48 °N',
      Math.abs((a.y - b.y) - expect) < 1 && expect > 6000, `${(a.y - b.y).toFixed(0)} m`);
  }

  // GHSL grid.
  const t = ghslTileOf(-41000 + 1, 6000000 - 1);
  add('GHSL tile of (−40 999, 5 999 999) is R4_C19', t.r === 4 && t.c === 19);
  const ext = ghslTileExtent(4, 19);
  add('GHSL R4_C19 extent starts at (−41 000, 6 000 000)', ext.x0 === -41000 && ext.y0 === 6000000 && ext.x1 === 959000 && ext.y1 === 5000000);
  add('GHSL tile name round trip', ghslTileName(3, 20) === 'R3_C20' && parseGhslTileName('R3_C20').c === 20);

  // LZW round trips: known tiny sequence, repetitive data (dictionary growth through
  // every width), random data (no compression, many literals), and > 4094 entries (Clear).
  const rt = (bytes, label) => {
    let ok = false, detail = '';
    try {
      const enc = lzwEncode(bytes);
      const dec = lzwDecode(enc, bytes.length);
      ok = dec.length === bytes.length && dec.every((v, i) => v === bytes[i]);
      detail = `${bytes.length} → ${enc.length} B`;
    } catch (e) { detail = String(e); }
    add(`LZW round trip: ${label}`, ok, detail);
  };
  rt(Uint8Array.from([7, 7, 7, 8, 8, 7, 7, 7, 7]), 'known 9-byte sequence');
  rt(new Uint8Array(0), 'empty');
  {
    const a = new Uint8Array(20000); for (let i = 0; i < a.length; i++) a[i] = (i * 7) % 13; rt(a, '20 000 B periodic');
  }
  {
    const a = new Uint8Array(70000); let s = 12345; for (let i = 0; i < a.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; a[i] = s >>> 16; } rt(a, '70 000 B pseudo-random (forces Clear)');
  }
  {
    const a = new Uint8Array(131072); for (let i = 0; i < a.length; i++) a[i] = i < 65536 ? 0 : (i >> 4) & 0xff; rt(a, '131 072 B = one uint16 256² tile');
  }
  // Hand-checked bit stream: Clear(256) then literal 'A'(65) then EOI(257) at 9 bits.
  // 100000000 001000001 100000001 → 27 bits, grouped: 10000000 00010000 01100000 001+00000
  // → bytes 0x80 0x10 0x60 0x20 (worked out by hand, not with the encoder).
  {
    const enc = lzwEncode(Uint8Array.from([65]));
    const hex = Array.from(enc, (b) => b.toString(16).padStart(2, '0')).join(' ');
    add('LZW bit layout MSB-first (Clear, A, EOI)', hex === '80 10 60 20', hex);
    const dec = lzwDecode(Uint8Array.from([0x80, 0x10, 0x60, 0x20]), 1);
    add('LZW decodes the hand-written stream', dec.length === 1 && dec[0] === 65);
  }
  // Negative controls: a wrong expected length must throw, not return.
  {
    const enc = lzwEncode(Uint8Array.from([1, 2, 3, 4]));
    let threw = false; try { lzwDecode(enc, 5); } catch { threw = true; }
    add('LZW: expected length mismatch throws', threw);
  }

  // TIFF parser on a synthetic classic TIFF and a synthetic BigTIFF (tiled, LZW, u16, geo tags).
  for (const big of [false, true]) {
    try {
      const px = new Uint16Array(16 * 16); for (let i = 0; i < px.length; i++) px[i] = (i * 37) & 0xffff;
      const raw = new Uint8Array(px.buffer);
      const enc = lzwEncode(raw);
      const file = writeSyntheticTiff({ big, width: 16, height: 16, tileW: 16, tileH: 16, bits: 16, sampleFormat: 1, compression: 5, tiles: [enc], nodata: '65535', x0: -41000, y0: 6000000, scale: 100 });
      const t2 = parseTiff(file);
      const geo = tiffGeoOrigin(t2);
      const vals = decodeTiffTile(t2, file, 0);
      const same = vals.length === px.length && vals.every((v, i) => v === px[i]);
      add(`${big ? 'BigTIFF' : 'TIFF'} synthetic: IFD + LZW tile + geo`,
        t2.bigTiff === big && t2.compression === 5 && t2.bits === 16 && t2.layout === 'tiled' && t2.nodata === 65535
        && geo.x0 === -41000 && geo.y0 === 6000000 && geo.sx === 100 && same);
    } catch (e) { add(`${big ? 'BigTIFF' : 'TIFF'} synthetic`, false, String(e)); }
  }
  return { checks, pass: checks.filter((c) => c.ok).length, total: checks.length };
}

/**
 * Minimal TIFF/BigTIFF writer for the self-test — little-endian, one IFD, tiled,
 * single band. Not used by the producer.
 */
export function writeSyntheticTiff({ big, width, height, tileW, tileH, bits, sampleFormat, compression, tiles, nodata, x0, y0, scale }) {
  const entries = [];
  const blobs = []; // { bytes, patch: (offset) => void }
  const nodataBytes = Buffer.from(`${nodata}\0`, 'latin1');
  const tileOffsets = new Array(tiles.length).fill(0);
  const tileCounts = tiles.map((t) => t.length);
  const tags = [
    { tag: 256, type: 3, values: [width] }, { tag: 257, type: 3, values: [height] },
    { tag: 258, type: 3, values: [bits] }, { tag: 259, type: 3, values: [compression] },
    { tag: 262, type: 3, values: [1] }, { tag: 277, type: 3, values: [1] }, { tag: 284, type: 3, values: [1] },
    { tag: 317, type: 3, values: [1] }, { tag: 322, type: 3, values: [tileW] }, { tag: 323, type: 3, values: [tileH] },
    { tag: 324, type: big ? 16 : 4, values: tileOffsets, isOffsets: true },
    { tag: 325, type: big ? 16 : 4, values: tileCounts },
    { tag: 339, type: 3, values: [sampleFormat] },
    { tag: 33550, type: 12, values: [scale, scale, 0] },
    { tag: 33922, type: 12, values: [0, 0, 0, x0, y0, 0] },
    { tag: 34735, type: 3, values: [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 32767] },
    { tag: 42113, type: 2, values: Array.from(nodataBytes) },
  ].sort((a, b) => a.tag - b.tag);
  const headerLen = big ? 16 : 8;
  const entryLen = big ? 20 : 12;
  const inlineMax = big ? 8 : 4;
  const ifdLen = (big ? 8 : 2) + tags.length * entryLen + (big ? 8 : 4);
  let cursor = headerLen + ifdLen;
  // Place tag data blobs, then the tiles.
  const dataAt = new Map();
  for (const t of tags) {
    const size = TYPE_SIZE[t.type] * t.values.length;
    if (size > inlineMax) { dataAt.set(t.tag, cursor); cursor += size + (size % 2); }
  }
  for (let i = 0; i < tiles.length; i++) { tileOffsets[i] = cursor; cursor += tiles[i].length + (tiles[i].length % 2); }
  const buf = Buffer.alloc(cursor);
  buf.write('II', 0, 'latin1');
  if (big) { buf.writeUInt16LE(43, 2); buf.writeUInt16LE(8, 4); buf.writeUInt16LE(0, 6); buf.writeBigUInt64LE(BigInt(headerLen), 8); }
  else { buf.writeUInt16LE(42, 2); buf.writeUInt32LE(headerLen, 4); }
  let p = headerLen;
  if (big) { buf.writeBigUInt64LE(BigInt(tags.length), p); p += 8; } else { buf.writeUInt16LE(tags.length, p); p += 2; }
  const writeVal = (at, type, v) => {
    switch (type) {
      case 2: case 1: buf.writeUInt8(v, at); break;
      case 3: buf.writeUInt16LE(v, at); break;
      case 4: buf.writeUInt32LE(v, at); break;
      case 12: buf.writeDoubleLE(v, at); break;
      case 16: buf.writeBigUInt64LE(BigInt(v), at); break;
      default: throw new Error(`synthetic tiff: type ${type}`);
    }
  };
  for (const t of tags) {
    buf.writeUInt16LE(t.tag, p); buf.writeUInt16LE(t.type, p + 2);
    if (big) buf.writeBigUInt64LE(BigInt(t.values.length), p + 4); else buf.writeUInt32LE(t.values.length, p + 4);
    const vf = p + (big ? 12 : 8);
    const size = TYPE_SIZE[t.type] * t.values.length;
    if (size <= inlineMax) {
      t.values.forEach((v, i) => writeVal(vf + i * TYPE_SIZE[t.type], t.type, v));
    } else {
      const at = dataAt.get(t.tag);
      if (big) buf.writeBigUInt64LE(BigInt(at), vf); else buf.writeUInt32LE(at, vf);
      t.values.forEach((v, i) => writeVal(at + i * TYPE_SIZE[t.type], t.type, v));
    }
    p += entryLen;
  }
  if (big) buf.writeBigUInt64LE(0n, p); else buf.writeUInt32LE(0, p);
  tiles.forEach((t, i) => buf.set(t, tileOffsets[i]));
  return buf;
}
