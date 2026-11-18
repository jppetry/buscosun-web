/**
 * Phase ST — JPEG 2000 codestream reader for the producer (`audit/seewetter-stroemung.md` §1.3). Not a general
 * decoder: it reads the lossless single-component streams GRIB2 data representation template 5.40 carries in the BSH
 * surface-current files (written by JasPer: one tile, reversible 5/3 wavelet, no quantisation, default code-block
 * style, maximal precincts) and REFUSES everything else with a named reason (`Jp2kError`) — a stream this reader was
 * not checked against is "keine Daten", never a guessed value.
 *
 * Checked only on one-dimensional images (1 × n, n × 1 — how the BSH stores the water points); a two-dimensional image is
 * refused, because the significance contexts with both horizontal and vertical neighbours were never exercised.
 *
 * Why here and not in `src/sources/gribDecode.ts`: the shared decoder serves every other source and stays untouched
 * (brief of phase ST); the browser never reads these files.
 *
 * Structure (ITU-T T.800): markers → tier 2 (packet headers, tag trees) → tier 1 (MQ arithmetic decoder, bit-plane
 * passes with the context tables of Annex D) → inverse reversible wavelet (Annex F) → DC level shift.
 * Checked value for value against two independent decoders (OpenJPEG via Pillow, ecCodes) in `verify:sea-current`'s
 * recorded reference — see the audit.
 */

export class Jp2kError extends Error {}
const fail = (m) => { throw new Jp2kError(`JPEG 2000: ${m}`); };

// --- MQ arithmetic decoder (Annex C) ---------------------------------------------------------------------------
const QE = Uint16Array.from([
  0x5601, 0x3401, 0x1801, 0x0ac1, 0x0521, 0x0221, 0x5601, 0x5401, 0x4801, 0x3801, 0x3001, 0x2401, 0x1c01, 0x1601, 0x5601, 0x5401,
  0x5101, 0x4801, 0x3801, 0x3401, 0x3001, 0x2801, 0x2401, 0x2201, 0x1c01, 0x1801, 0x1601, 0x1401, 0x1201, 0x1101, 0x0ac1, 0x09c1,
  0x08a1, 0x0521, 0x0441, 0x02a1, 0x0221, 0x0141, 0x0111, 0x0085, 0x0049, 0x0025, 0x0015, 0x0009, 0x0005, 0x0001, 0x5601,
]);
const NMPS = Uint8Array.from([
  1, 2, 3, 4, 5, 38, 7, 8, 9, 10, 11, 12, 13, 29, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
  33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 45, 46,
]);
const NLPS = Uint8Array.from([
  1, 6, 9, 12, 29, 33, 6, 14, 14, 14, 17, 18, 20, 21, 14, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 46,
]);
const SWITCH = Uint8Array.from([
  1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

class Mq {
  /** `data` must carry two bytes 0xFF behind `end` (the decoder then feeds 1-bits past the codeword, C.3.4). */
  constructor(data, end) {
    this.d = data; this.bp = 0; this.end = end;
    this.c = (data[0] << 16) >>> 0; this.ct = 0; this.a = 0x8000;
    this.byteIn();
    this.c = (this.c << 7) >>> 0;
    this.ct -= 7;
    // contexts: state index and most probable symbol
    this.ix = new Uint8Array(19); this.mps = new Uint8Array(19);
    this.ix[0] = 4; this.ix[17] = 46; this.ix[18] = 3;
  }
  byteIn() {
    const d = this.d;
    if (this.bp >= this.end) { this.c = (this.c + 0xff00) >>> 0; this.ct = 8; return; }
    const next = d[this.bp + 1];
    if (d[this.bp] === 0xff) {
      if (next > 0x8f) { this.c = (this.c + 0xff00) >>> 0; this.ct = 8; }
      else { this.bp++; this.c = (this.c + (next << 9)) >>> 0; this.ct = 7; }
    } else { this.bp++; this.c = (this.c + (next << 8)) >>> 0; this.ct = 8; }
  }
  bit(cx) {
    const i = this.ix[cx], qe = QE[i];
    let d, a = this.a - qe;
    if ((this.c >>> 16) < qe) {
      // LPS exchange
      if (a < qe) { d = this.mps[cx]; this.ix[cx] = NMPS[i]; }
      else { d = 1 - this.mps[cx]; if (SWITCH[i]) this.mps[cx] = d; this.ix[cx] = NLPS[i]; }
      a = qe;
    } else {
      this.c = (this.c - (qe << 16)) >>> 0;
      if (a & 0x8000) { this.a = a; return this.mps[cx]; }
      // MPS exchange
      if (a < qe) { d = 1 - this.mps[cx]; if (SWITCH[i]) this.mps[cx] = d; this.ix[cx] = NLPS[i]; }
      else { d = this.mps[cx]; this.ix[cx] = NMPS[i]; }
    }
    do {
      if (this.ct === 0) this.byteIn();
      a <<= 1; this.c = (this.c << 1) >>> 0; this.ct--;
    } while ((a & 0x8000) === 0);
    this.a = a;
    return d;
  }
}

// --- Tier 1: one code block (Annex D) ----------------------------------------------------------------------------
const SIG = 1, NEG = 2, VISITED = 4, REFINED = 8;
const CX_UNI = 17, CX_RUN = 18;
/** Orientation of a sub-band: 0 = LL or LH, 1 = HL, 2 = HH (selects the significance context table D.1). */
function zcContext(F, p, pw, orient) {
  let h = (F[p - 1] & SIG) + (F[p + 1] & SIG), v = (F[p - pw] & SIG) + (F[p + pw] & SIG);
  const d = (F[p - pw - 1] & SIG) + (F[p - pw + 1] & SIG) + (F[p + pw - 1] & SIG) + (F[p + pw + 1] & SIG);
  if (orient === 2) {
    const hv = h + v;
    if (d >= 3) return 8;
    if (d === 2) return hv >= 1 ? 7 : 6;
    if (d === 1) return hv >= 2 ? 5 : hv === 1 ? 4 : 3;
    return hv >= 2 ? 2 : hv;
  }
  if (orient === 1) { const t = h; h = v; v = t; }
  if (h === 2) return 8;
  if (h === 1) return v >= 1 ? 7 : d >= 1 ? 6 : 5;
  if (v === 2) return 4;
  if (v === 1) return 3;
  return d >= 2 ? 2 : d;
}
const contrib = (f) => (f & SIG ? (f & NEG ? -1 : 1) : 0);
function signBit(mq, F, p, pw) {
  let h = contrib(F[p - 1]) + contrib(F[p + 1]), v = contrib(F[p - pw]) + contrib(F[p + pw]);
  h = h > 1 ? 1 : h < -1 ? -1 : h; v = v > 1 ? 1 : v < -1 ? -1 : v;
  const c = 3 * h + v;
  return c >= 0 ? mq.bit(9 + c) : mq.bit(9 - c) ^ 1;
}

/**
 * Decodes `passes` coding passes of a `w` × `h` code block whose most significant coded bit-plane is `planes - 1`.
 * Returns signed integers (Int32Array, row-major). The caller guarantees `passes === 3 * planes - 2` (lossless).
 */
function decodeBlock(bytes, len, w, h, orient, planes, passes) {
  const mq = new Mq(bytes, len);
  const pw = w + 2, F = new Uint8Array(pw * (h + 2)), M = new Int32Array(w * h);
  const at = (x, y) => (y + 1) * pw + x + 1;
  const become = (p, k, bp) => { F[p] |= SIG | (signBit(mq, F, p, pw) ? NEG : 0); M[k] = 1 << bp; };
  let pass = 0;
  for (let bp = planes - 1; bp >= 0 && pass < passes; bp--) {
    if (bp !== planes - 1) {
      // significance propagation
      for (let y0 = 0; y0 < h; y0 += 4) for (let x = 0; x < w; x++) for (let y = y0; y < y0 + 4 && y < h; y++) {
        const p = at(x, y);
        if (F[p] & SIG) continue;
        const cx = zcContext(F, p, pw, orient);
        if (cx === 0) continue;
        if (mq.bit(cx)) become(p, y * w + x, bp);
        F[p] |= VISITED;
      }
      if (++pass >= passes) break;
      // magnitude refinement
      for (let y0 = 0; y0 < h; y0 += 4) for (let x = 0; x < w; x++) for (let y = y0; y < y0 + 4 && y < h; y++) {
        const p = at(x, y);
        if ((F[p] & (SIG | VISITED)) !== SIG) continue;
        const cx = F[p] & REFINED ? 16 : zcContext(F, p, pw, 2) === 0 && (F[p - 1] | F[p + 1] | F[p - pw] | F[p + pw]) % 2 === 0 ? 14 : 15;
        if (mq.bit(cx)) M[y * w + x] |= 1 << bp;
        F[p] |= REFINED;
      }
      if (++pass >= passes) break;
    }
    // cleanup
    for (let y0 = 0; y0 < h; y0 += 4) for (let x = 0; x < w; x++) {
      let y = y0;
      if (y0 + 3 < h) {
        let empty = true;
        for (let k = 0; k < 4 && empty; k++) { const p = at(x, y0 + k); if (F[p] & (SIG | VISITED) || zcContext(F, p, pw, orient) !== 0) empty = false; }
        if (empty) {
          if (!mq.bit(CX_RUN)) continue;
          const r = (mq.bit(CX_UNI) << 1) | mq.bit(CX_UNI);
          y = y0 + r;
          become(at(x, y), y * w + x, bp);
          y++;
        }
      }
      for (; y < y0 + 4 && y < h; y++) {
        const p = at(x, y);
        if (F[p] & (SIG | VISITED)) continue;
        if (mq.bit(zcContext(F, p, pw, orient))) become(p, y * w + x, bp);
      }
    }
    pass++;
    for (let p = 0; p < F.length; p++) F[p] &= ~VISITED;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (F[at(x, y)] & NEG) M[y * w + x] = -M[y * w + x];
  return M;
}

// --- Tier 2: tag trees and packet headers (Annex B) ----------------------------------------------------------------
class TagTree {
  constructor(w, h) {
    this.levels = [];
    for (;;) { this.levels.push({ w, h, value: new Int32Array(w * h).fill(0x7fffffff), low: new Int32Array(w * h) }); if (w === 1 && h === 1) break; w = (w + 1) >> 1; h = (h + 1) >> 1; }
  }
  /** Is the value of leaf (x, y) below `threshold`? Reads only the bits the standard prescribes (B.10.2). */
  below(bits, x, y, threshold) {
    let low = 0;
    for (let l = this.levels.length - 1; l >= 0; l--) {
      const lv = this.levels[l], k = (y >> l) * lv.w + (x >> l);
      if (low > lv.low[k]) lv.low[k] = low; else low = lv.low[k];
      while (low < threshold && low < lv.value[k]) { if (bits.bit()) lv.value[k] = low; else low++; }
      lv.low[k] = low;
    }
    const leaf = this.levels[0];
    return leaf.value[y * leaf.w + x] < threshold;
  }
}

class HeaderBits {
  constructor(d, pos, end) { this.d = d; this.pos = pos; this.end = end; this.buf = 0; this.ct = 0; }
  byteIn() {
    this.buf = (this.buf << 8) & 0xffff;
    this.ct = this.buf === 0xff00 ? 7 : 8;
    if (this.pos >= this.end) fail('Paketkopf endet vor dem Ende des Tile-Teils');
    this.buf |= this.d[this.pos++];
  }
  bit() { if (this.ct === 0) this.byteIn(); this.ct--; return (this.buf >> this.ct) & 1; }
  bits(n) { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | this.bit(); return v; }
  /** End of a packet header: the rest of the byte is dropped, a stuffed byte after 0xFF is skipped. */
  align() { if ((this.buf & 0xff) === 0xff) this.byteIn(); this.ct = 0; }
}

// --- Inverse reversible 5/3 wavelet, one dimension in place (F.3.8.2, whole-sample symmetric extension) -------------
function inverse53(a, off, stride, n) {
  if (n === 1) return;                       // one low-pass sample at an even position stays as it is
  const at = (i) => off + (i < 0 ? -i : i >= n ? 2 * (n - 1) - i : i) * stride;
  for (let i = 0; i < n; i += 2) a[off + i * stride] -= (a[at(i - 1)] + a[at(i + 1)] + 2) >> 2;
  for (let i = 1; i < n; i += 2) a[off + i * stride] += (a[at(i - 1)] + a[at(i + 1)]) >> 1;
}

// --- Codestream ----------------------------------------------------------------------------------------------------
const u16 = (d, o) => (d[o] << 8) | d[o + 1];
const u32 = (d, o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const ceilDiv = (a, b) => Math.ceil(a / b);

/** The parameters of a codestream this reader accepts — also what the audit table prints. */
export function j2kHeader(d) {
  if (u16(d, 0) !== 0xff4f) fail('kein Codestream (SOC fehlt)');
  const h = { width: 0, height: 0, bits: 0, signed: false, levels: 0, cbw: 0, cbh: 0, ppx: 15, ppy: 15, layers: 1, progression: 0, sop: false, eph: false, guard: 0, expn: null, comment: null, body: [] };
  let p = 2, siz = false, cod = false, inTile = false, tileEnd = 0;
  const qc = (o, len) => { const s = d[o]; if ((s & 0x1f) !== 0) fail(`Quantisierung Stil ${s & 0x1f} (nur ohne Quantisierung, reversibel)`); return { guard: s >> 5, expn: Array.from(d.subarray(o + 1, o + len), (b) => b >> 3) }; };
  for (;;) {
    if (p + 2 > d.length) fail('Codestream endet ohne EOC');
    const m = u16(d, p);
    if (m === 0xffd9) break;
    if (m === 0xff93) {
      if (!inTile) fail('SOD ohne SOT');
      const end = tileEnd || d.length - 2;
      h.body.push([p + 2, end]);
      p = end; inTile = false;
      continue;
    }
    const len = u16(d, p + 2), o = p + 4;
    if (m === 0xff51) {
      const [xs, ys, xo, yo, xt, yt, xto, yto] = [4, 8, 12, 16, 20, 24, 28, 32].map((k) => u32(d, o + k - 2));
      const comps = u16(d, o + 34);
      if (comps !== 1) fail(`${comps} Komponenten (nur eine)`);
      if (xo || yo || xto || yto) fail('Bild- oder Tile-Versatz ungleich 0');
      if (xt < xs || yt < ys) fail('mehr als ein Tile');
      if (d[o + 37] !== 1 || d[o + 38] !== 1) fail('Unterabtastung der Komponente');
      h.width = xs; h.height = ys; h.bits = (d[o + 36] & 0x7f) + 1; h.signed = !!(d[o + 36] & 0x80);
      siz = true;
    } else if (m === 0xff52) {
      const scod = d[o];
      h.sop = !!(scod & 2); h.eph = !!(scod & 4);
      h.progression = d[o + 1]; h.layers = u16(d, o + 2);
      if (d[o + 4] !== 0) fail('Mehrkomponenten-Transformation');
      h.levels = d[o + 5]; h.cbw = 1 << (d[o + 6] + 2); h.cbh = 1 << (d[o + 7] + 2);
      if (d[o + 8] !== 0) fail(`Codeblock-Stil 0x${d[o + 8].toString(16)} (nur der Standardstil)`);
      if (d[o + 9] !== 1) fail('irreversible 9/7-Wavelet (nur reversibel 5/3)');
      // Precinct sizes: one byte per resolution when defined, else 2^15; this reader takes one size for all resolutions.
      if (scod & 1) { const pp = d.subarray(o + 10, o + 11 + h.levels); if (pp.some((x) => x !== pp[0])) fail('Precinct-Größen je Auflösung verschieden'); h.ppx = pp[0] & 15; h.ppy = pp[0] >> 4; if (h.ppx < 1 || h.ppy < 1) fail('Precinct-Größe 1'); }
      cod = true;
    } else if (m === 0xff5c) { const q = qc(o, len - 2); h.guard = q.guard; h.expn ??= q.expn; if (!inTile) h.expnMain = q.expn; }
    else if (m === 0xff5d) { if (d[o] !== 0) fail('QCC einer fremden Komponente'); const q = qc(o + 1, len - 3); h.guard = q.guard; h.expn = q.expn; }
    else if (m === 0xff90) {
      if (u16(d, o) !== 0) fail('mehr als ein Tile');
      const psot = u32(d, o + 2);
      tileEnd = psot ? p + psot : 0; inTile = true;
    } else if (m === 0xff64) { if (!h.comment) h.comment = String.fromCharCode(...d.subarray(o + 2, o + len - 2)); }
    else if (m === 0xff53 || m === 0xff5e || m === 0xff5f || m === 0xff60 || m === 0xff61) fail(`Marker 0x${m.toString(16)} (COC/RGN/POC/PPM/PPT) nicht unterstützt`);
    else if (!(m === 0xff55 || m === 0xff57 || m === 0xff58 || m === 0xff63)) fail(`unbekannter Marker 0x${m.toString(16)}`);
    p += 2 + len;
  }
  if (!siz || !cod || !h.expn || !h.body.length) fail('SIZ, COD, QCD oder Tile-Teil fehlt');
  if (h.expn.length < 3 * h.levels + 1) fail('zu wenige Exponenten für die Teilbänder');
  if (h.bits > 30) fail(`${h.bits} bit je Wert`);
  return h;
}

/**
 * A codestream → its samples (Int32Array, `width` × `height`, row-major, DC level shift applied).
 * Throws `Jp2kError` for everything outside the subset named at the top, and for a stream that is not lossless
 * (a code block with fewer coding passes than its bit-planes need).
 */
export function decodeJ2k(d) {
  const h = j2kHeader(d);
  const { width: W, height: H, levels: NL } = h;
  // Measured and checked: the BSH writes the water points as ONE row or ONE column. The contexts with horizontal AND
  // vertical neighbours are never reached by such a stream — a two-dimensional image is therefore refused, not guessed.
  if (W > 1 && H > 1) fail(`zweidimensionales Bild ${W} × ${H} (dieser Leser ist nur an den eindimensionalen Strömen des BSH geprüft)`);
  // Resolutions, sub-bands, precincts and code blocks (B.5–B.7). Origin 0, so every partition starts at 0.
  const res = [];
  for (let r = 0; r <= NL; r++) {
    const s = 1 << (NL - r), w = ceilDiv(W, s), ht = ceilDiv(H, s);
    // Precincts of this resolution (2^15 samples when the stream defines none), in sub-band samples half of that above r = 0.
    const npx = ceilDiv(w, 1 << h.ppx), npy = ceilDiv(ht, 1 << h.ppy);
    const pcw = 1 << (h.ppx - (r ? 1 : 0)), pch = 1 << (h.ppy - (r ? 1 : 0));
    const cbw = Math.min(h.cbw, pcw), cbh = Math.min(h.cbh, pch);
    const bands = [];
    const band = (orient, xob, yob, index) => {
      const nb = r === 0 ? NL : NL - r + 1, q = 1 << nb, half = 1 << (nb - 1);
      const bw = Math.max(0, ceilDiv(W - half * xob, q)), bh = Math.max(0, ceilDiv(H - half * yob, q));
      const b = { orient, xob, yob, w: bw, h: bh, planes: h.guard + h.expn[index] - 1, precincts: [] };
      for (let py = 0; py < npy; py++) for (let px = 0; px < npx; px++) {
        const x0 = px * pcw, x1 = Math.min(x0 + pcw, bw), y0 = py * pch, y1 = Math.min(y0 + pch, bh);
        const pc = { blocks: [], incl: null, zero: null };
        if (x1 > x0 && y1 > y0) {
          const cx0 = Math.floor(x0 / cbw), cy0 = Math.floor(y0 / cbh), nx = ceilDiv(x1, cbw) - cx0, ny = ceilDiv(y1, cbh) - cy0;
          pc.incl = new TagTree(nx, ny); pc.zero = new TagTree(nx, ny);
          for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
            const bx = Math.max(x0, (cx0 + cx) * cbw), by = Math.max(y0, (cy0 + cy) * cbh);
            pc.blocks.push({ cx, cy, x: bx, y: by, w: Math.min(x1, (cx0 + cx + 1) * cbw) - bx, h: Math.min(y1, (cy0 + cy + 1) * cbh) - by, included: false, zeroPlanes: 0, lblock: 3, passes: 0, segs: [], len: 0 });
          }
        }
        b.precincts.push(pc);
      }
      bands.push(b);
    };
    if (r === 0) band(0, 0, 0, 0);
    else { band(1, 1, 0, 3 * (r - 1) + 1); band(0, 0, 1, 3 * (r - 1) + 2); band(2, 1, 1, 3 * (r - 1) + 3); }
    res.push({ w, h: ht, bands, precincts: npx * npy });
  }
  // Packets in progression order (one component): layer–resolution–precinct, or resolution first.
  const order = [];
  if (h.progression === 0) { for (let l = 0; l < h.layers; l++) for (let r = 0; r <= NL; r++) for (let p = 0; p < res[r].precincts; p++) order.push([l, r, p]); }
  else if (h.progression === 1) { for (let r = 0; r <= NL; r++) for (let l = 0; l < h.layers; l++) for (let p = 0; p < res[r].precincts; p++) order.push([l, r, p]); }
  else if (h.progression === 2) { for (let r = 0; r <= NL; r++) for (let p = 0; p < res[r].precincts; p++) for (let l = 0; l < h.layers; l++) order.push([l, r, p]); }
  else fail(`Progression ${h.progression} (nur LRCP, RLCP, RPCL)`);
  // The packet data of all tile-parts in one run of bytes.
  let body;
  if (h.body.length === 1) body = d.subarray(h.body[0][0], h.body[0][1]);
  else { body = new Uint8Array(h.body.reduce((a, [s, e]) => a + e - s, 0)); let o = 0; for (const [s, e] of h.body) { body.set(d.subarray(s, e), o); o += e - s; } }
  let pos = 0;
  for (const [layer, r, p] of order) {
    if (h.sop && body[pos] === 0xff && body[pos + 1] === 0x91) pos += 6;
    const bits = new HeaderBits(body, pos, body.length);
    const queue = [];
    if (bits.bit()) {
      for (const b of res[r].bands) {
        const pc = b.precincts[p];
        for (const cb of pc.blocks) {
          let incl;
          if (cb.included) incl = bits.bit();
          else incl = pc.incl.below(bits, cb.cx, cb.cy, layer + 1) ? 1 : 0;
          if (!incl) continue;
          if (!cb.included) {
            let i = 1;
            while (!pc.zero.below(bits, cb.cx, cb.cy, i)) { if (++i > 64) fail('Null-Bitebenen-Baum läuft nicht aus'); }
            cb.zeroPlanes = i - 1; cb.included = true;
          }
          let np;
          if (!bits.bit()) np = 1;
          else if (!bits.bit()) np = 2;
          else { np = bits.bits(2); if (np !== 3) np += 3; else { np = bits.bits(5); if (np !== 31) np += 6; else np = 37 + bits.bits(7); } }
          while (bits.bit()) cb.lblock++;
          const n = bits.bits(cb.lblock + (31 - Math.clz32(np)));
          queue.push([cb, np, n]);
        }
      }
    }
    bits.align();
    pos = bits.pos;
    if (h.eph) { if (body[pos] === 0xff && body[pos + 1] === 0x92) pos += 2; else fail('EPH-Marker fehlt'); }
    for (const [cb, np, n] of queue) {
      if (pos + n > body.length) fail('Codeblock-Daten laufen über das Ende des Tile-Teils');
      cb.segs.push([pos, pos + n]); cb.len += n; cb.passes += np; pos += n;
    }
  }
  if (pos !== body.length) fail(`${body.length - pos} Bytes des Tile-Teils nach dem letzten Paket ungelesen`);
  // Tier 1 and the inverse wavelet, resolution by resolution.
  let cur = new Int32Array(res[0].w * res[0].h);
  for (let r = 0; r <= NL; r++) {
    const R = res[r];
    const out = r === 0 ? cur : new Int32Array(R.w * R.h);
    if (r > 0) { const P = res[r - 1]; for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) out[2 * y * R.w + 2 * x] = cur[y * P.w + x]; }
    for (const b of R.bands) for (const pc of b.precincts) for (const cb of pc.blocks) {
      if (!cb.included || cb.passes === 0) continue;
      const planes = b.planes - cb.zeroPlanes;
      if (planes <= 0 || planes > 30) fail(`Codeblock mit ${planes} Bitebenen`);
      if (cb.passes !== 3 * planes - 2) fail(`Strom nicht verlustfrei: ${cb.passes} von ${3 * planes - 2} Kodierdurchgängen`);
      const bytes = new Uint8Array(cb.len + 2);
      let o = 0;
      for (const [s, e] of cb.segs) { bytes.set(body.subarray(s, e), o); o += e - s; }
      bytes[o] = 0xff; bytes[o + 1] = 0xff;
      const M = decodeBlock(bytes, cb.len, cb.w, cb.h, b.orient, planes, cb.passes);
      const sx = r === 0 ? 1 : 2, ox = r === 0 ? 0 : b.xob, oy = r === 0 ? 0 : b.yob;
      for (let y = 0; y < cb.h; y++) for (let x = 0; x < cb.w; x++) out[(sx * (cb.y + y) + oy) * R.w + sx * (cb.x + x) + ox] = M[y * cb.w + x];
    }
    if (r > 0) {
      for (let y = 0; y < R.h; y++) inverse53(out, y * R.w, 1, R.w);
      for (let x = 0; x < R.w; x++) inverse53(out, x, R.w, R.h);
    }
    cur = out;
  }
  if (!h.signed) { const dc = 1 << (h.bits - 1); for (let k = 0; k < cur.length; k++) cur[k] += dc; }
  return { width: W, height: H, bits: h.bits, signed: h.signed, samples: cur, header: h };
}
