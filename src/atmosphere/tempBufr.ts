/**
 * Decoder for the radiosonde bulletins of the DWD (`opendata.dwd.de/weather/weather_reports/radiosonde/bufr/`, the GTS
 * TEMP traffic of the European stations), handwritten like the GRIB2 and SWIS decoders: only what the files measured on
 * 20.10.2026 carry, nothing generic beyond it.
 *
 *   3 09 052  TEMP (WMO), level group 3 03 054: time offset, significance, p, gpm, lat/lon displacement, T, Td, dd, ff
 *   3 09 057  TEMP high resolution (DWD and others), level group 3 03 056 = 3 03 054 with 2 07 001 on p and gpm
 *   plus the radiosonde metadata (3 01 128, 3 01 150, 0 01 081 …) some centres put around the sequence.
 *
 * Uncompressed data only. Compression, 3 09 056 (descent), 3 09 050 (PILOT), operators other than 2 01 / 2 02 / 2 05 /
 * 2 07 / 2 08 and any element missing from TEMP_TABLE_B throw `BufrSkip` — the mirror skips that message and counts it,
 * a format change must not produce plausible-looking garbage.
 *
 * Producer-only module (`scripts/radiosonde/rs-mirror.mjs`), never imported by the app bundle.
 * Reference: eccodes 2.47 decodes the same bytes identically (checked on the 62 bulletins of 20.10.2026 00–02 UTC).
 */

export class BufrSkip extends Error {
  descriptors?: number[];
}

type Kind = 'num' | 'str' | 'code';
interface ElementDef { kind: Kind; scale: number; ref: number; width: number }
const N = (scale: number, ref: number, width: number): ElementDef => ({ kind: 'num', scale, ref, width });
const C = (width: number): ElementDef => ({ kind: 'code', scale: 0, ref: 0, width });
const S = (bits: number): ElementDef => ({ kind: 'str', scale: 0, ref: 0, width: bits });

/** Table B — the elements of the measured layouts (width/scale/reference as eccodes 2.47 reports them). */
export const TEMP_TABLE_B: Readonly<Record<number, ElementDef>> = Object.freeze({
  1001: N(0, 0, 7), 1002: N(0, 0, 10), 1011: S(72), 1015: S(160),
  1081: S(160), 1082: N(0, 0, 14), 1083: N(0, 0, 3), 1095: S(32),
  1125: N(0, 0, 4), 1126: N(0, 0, 16), 1127: N(0, 0, 16), 1128: S(128),
  2003: C(4), 2011: C(8), 2013: C(4), 2014: C(7), 2015: C(4), 2016: C(5), 2017: C(5), 2066: C(6), 2067: N(-5, 0, 15),
  2080: C(6), 2081: C(5), 2082: N(3, 0, 12), 2083: C(4), 2084: C(4), 2085: N(3, 0, 13), 2086: N(1, 0, 10),
  2095: C(5), 2096: C(5), 2097: C(5), 2102: N(0, 0, 8), 2103: C(2), 2191: C(4),
  4001: N(0, 0, 12), 4002: N(0, 0, 4), 4003: N(0, 0, 6), 4004: N(0, 0, 5), 4005: N(0, 0, 6), 4006: N(0, 0, 6),
  4086: N(0, -8192, 15),
  5001: N(5, -9000000, 25), 5015: N(5, -9000000, 25), 6001: N(5, -18000000, 26), 6015: N(5, -18000000, 26),
  7004: N(-1, 0, 14), 7007: N(0, -1000, 17), 7030: N(1, -4000, 17), 7031: N(1, -4000, 17),
  8002: C(6), 8021: C(5), 8042: C(18),
  10009: N(0, -1000, 17),
  11001: N(0, 0, 9), 11002: N(1, 0, 12), 11044: N(0, 0, 9), 11045: N(1, 0, 12), 11054: N(0, 0, 9), 11055: N(1, 0, 12),
  11061: N(1, 0, 12), 11062: N(1, 0, 12),
  12101: N(2, 0, 16), 12103: N(2, 0, 16),
  13047: N(0, -60, 6),
  20011: C(4), 20012: C(6), 20013: N(-1, -40, 11),
  22043: N(2, 0, 15),
  25061: S(96), 25065: N(2, -1000, 11), 25066: N(2, -1000, 11),
  31001: N(0, 0, 8), 31002: N(0, 0, 16),
  33024: C(4), 35035: C(5),
});

/** Table D — the WMO sequences of both TEMP layouts (expansion as eccodes 2.47, master 40). */
export const TEMP_TABLE_D: Readonly<Record<number, readonly number[]>> = Object.freeze({
  301111: [1001, 1002, 1011, 2011, 2013, 2014, 2003],
  301113: [8021, 4001, 4002, 4003, 4004, 4005, 4006],
  301114: [5001, 6001, 7030, 7031, 7007, 33024],
  301128: [1081, 1082, 1083, 1095, 2015, 2016, 2017, 2066, 2067, 2080, 2081, 2082, 2083, 2084, 2085, 2086, 2095, 2096, 2097, 2103, 2191, 25061, 35035],
  301150: [1125, 1126, 1127, 1128],
  302049: [8002, 20011, 20013, 20012, 20012, 20012, 8002],
  303051: [4086, 8042, 7004, 5015, 6015, 11061, 11062],
  303054: [4086, 8042, 7004, 10009, 5015, 6015, 12101, 12103, 11001, 11002],
  303056: [4086, 8042, 207001, 7004, 10009, 207000, 5015, 6015, 12101, 12103, 11001, 11002],
  309052: [301111, 301113, 301114, 302049, 22043, 101000, 31002, 303054, 101000, 31001, 303051],
  309057: [301150, 301111, 301128, 301113, 301114, 302049, 22043, 101000, 31002, 303056, 101000, 31001, 303051],
});

export type BufrValue = number | string | null;

export interface BufrMessage {
  edition: number;
  centre: number;
  masterTablesVersion: number;
  /** Unexpanded descriptors of section 3 (FXXYYY integers). */
  descriptors: number[];
  /** Per subset the expanded (descriptor, value) sequence in data order, replication factors included. */
  subsets: Array<Array<[number, BufrValue]>>;
}

class BitReader {
  private pos = 0;
  private readonly buf: Uint8Array;
  private readonly start: number;
  private readonly endBit: number;
  constructor(buf: Uint8Array, start: number, endBit: number) { this.buf = buf; this.start = start; this.endBit = endBit; }
  read(width: number): number {
    if (this.pos + width > this.endBit) throw new BufrSkip('data section ends early');
    let v = 0;
    for (let i = 0; i < width; i++) {
      const bit = this.start * 8 + this.pos + i;
      v = v * 2 + ((this.buf[bit >> 3] >> (7 - (bit & 7))) & 1);
    }
    this.pos += width;
    return v;
  }
}

interface Ops { width: number; scale: number; e207: number; strBytes: number }

function decodeElement(r: BitReader, code: number, op: Ops): BufrValue {
  const def = TEMP_TABLE_B[code];
  if (!def) throw new BufrSkip(`element ${code} not in TEMP_TABLE_B`);
  if (def.kind === 'str') {
    const n = op.strBytes || def.width / 8;
    let s = ''; let allOnes = true;
    for (let i = 0; i < n; i++) { const c = r.read(8); if (c !== 255) allOnes = false; s += String.fromCharCode(c); }
    return allOnes ? null : s.replace(/[\0\s]+$/, '');
  }
  const numeric = def.kind === 'num';
  const width = def.width + (numeric ? op.width + (op.e207 ? Math.ceil((10 * op.e207 + 2) / 3) : 0) : 0);
  const scale = def.scale + (numeric ? op.scale + op.e207 : 0);
  const ref = numeric && op.e207 ? def.ref * 10 ** op.e207 : def.ref;
  const raw = r.read(width);
  // All bits set = missing (not for the replication factors; a width-1 element has no missing value).
  if (width > 1 && raw === 2 ** width - 1 && code !== 31001 && code !== 31002) return null;
  if (!numeric) return raw;
  const v = (raw + ref) / 10 ** scale;
  return scale > 0 ? Number(v.toFixed(scale)) : v;
}

function expand(r: BitReader, list: readonly number[], out: Array<[number, BufrValue]>, op: Ops): void {
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const f = Math.floor(d / 100000), x = Math.floor(d / 1000) % 100, y = d % 1000;
    if (f === 0) { out.push([d, decodeElement(r, d, op)]); continue; }
    if (f === 3) {
      const seq = TEMP_TABLE_D[d];
      if (!seq) throw new BufrSkip(`sequence ${d} not in TEMP_TABLE_D`);
      expand(r, seq, out, op);
      continue;
    }
    if (f === 1) {
      let times = y;
      let start = i + 1;
      if (y === 0) {
        const fac = list[i + 1];
        if (fac !== 31001 && fac !== 31002) throw new BufrSkip(`delayed replication factor ${fac}`);
        const v = decodeElement(r, fac, op);
        out.push([fac, v]);
        times = Number(v);
        start = i + 2;
      }
      const group = list.slice(start, start + x);
      if (group.length !== x) throw new BufrSkip('replication runs past the descriptor list');
      for (let k = 0; k < times; k++) expand(r, group, out, op);
      i = start + x - 1;
      continue;
    }
    // f === 2: operators
    if (x === 1) op.width = y === 0 ? 0 : y - 128;
    else if (x === 2) op.scale = y === 0 ? 0 : y - 128;
    else if (x === 7) op.e207 = y;
    else if (x === 8) op.strBytes = y;
    else if (x === 5) {
      let s = '';
      for (let k = 0; k < y; k++) s += String.fromCharCode(r.read(8));
      out.push([d, s.replace(/[\0\s]+$/, '')]);
    } else throw new BufrSkip(`operator ${d}`);
  }
}

const u24 = (b: Uint8Array, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];

/** One message (`buf` starts at "BUFR"). Throws `BufrSkip` for any layout outside the measured ones. */
export function decodeBufrMessage(buf: Uint8Array): BufrMessage {
  const total = u24(buf, 4);
  const edition = buf[7];
  if (edition !== 3 && edition !== 4) throw new BufrSkip(`edition ${edition}`);
  let o = 8;
  const s1 = u24(buf, o);
  const centre = edition === 4 ? u16(buf, o + 4) : buf[o + 5];
  const optional = (buf[o + (edition === 4 ? 9 : 7)] & 0x80) !== 0;
  const masterTablesVersion = buf[o + (edition === 4 ? 13 : 10)];
  o += s1;
  if (optional) o += u24(buf, o);
  const s3 = u24(buf, o);
  const nSubsets = u16(buf, o + 4);
  const compressed = (buf[o + 6] & 0x40) !== 0;
  if (compressed) throw new BufrSkip('compressed data');
  const descriptors: number[] = [];
  for (let p = o + 7; p + 1 < o + s3; p += 2) {
    const fx = buf[p], yy = buf[p + 1];
    const d = (fx >> 6) * 100000 + (fx & 0x3f) * 1000 + yy;
    if (d !== 0) descriptors.push(d);
  }
  o += s3;
  const s4 = u24(buf, o);
  if (o + s4 + 4 > total) throw new BufrSkip('section 4 runs past the message');
  const r = new BitReader(buf, o + 4, (s4 - 4) * 8);
  const subsets: BufrMessage['subsets'] = [];
  try {
    for (let s = 0; s < nSubsets; s++) {
      const out: Array<[number, BufrValue]> = [];
      expand(r, descriptors, out, { width: 0, scale: 0, e207: 0, strBytes: 0 });
      subsets.push(out);
    }
  } catch (e) {
    if (e instanceof BufrSkip) e.descriptors = descriptors;
    throw e;
  }
  return { edition, centre, masterTablesVersion, descriptors, subsets };
}

/** All messages of a bulletin file; a broken or unsupported message is skipped and counted, never fatal. */
export function decodeBufrFile(buf: Uint8Array): {
  messages: Array<BufrMessage & { offset: number }>;
  skipped: Array<{ offset: number; reason: string; descriptors?: number[] }>;
} {
  const messages: Array<BufrMessage & { offset: number }> = [];
  const skipped: Array<{ offset: number; reason: string; descriptors?: number[] }> = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    if (!(buf[i] === 0x42 && buf[i + 1] === 0x55 && buf[i + 2] === 0x46 && buf[i + 3] === 0x52)) { i++; continue; }
    const total = u24(buf, i + 4);
    const end = i + total;
    const sealed = total > 8 && end <= buf.length && buf[end - 4] === 0x37 && buf[end - 3] === 0x37 && buf[end - 2] === 0x37 && buf[end - 1] === 0x37;
    if (!sealed) { skipped.push({ offset: i, reason: 'wrong message length' }); i += 4; continue; }
    try { messages.push({ ...decodeBufrMessage(buf.subarray(i, end)), offset: i }); }
    catch (e) {
      if (!(e instanceof BufrSkip)) throw e;
      skipped.push({ offset: i, reason: e.message, descriptors: e.descriptors });
    }
    i = end;
  }
  return { messages, skipped };
}

/** One ascent level as decoded (SI units of the bulletin converted: hPa, m, °C, m/s, degrees). */
export interface TempLevel {
  /** Seconds since launch. */
  dt: number | null;
  /** 0 08 042 flags (standard level, tropopause, significant T/wind …). */
  sig: number | null;
  pHpa: number | null;
  zM: number | null;
  dLat: number | null;
  dLon: number | null;
  tC: number | null;
  tdC: number | null;
  ddDeg: number | null;
  ffMs: number | null;
}

export interface TempSounding {
  wmo: string | null;
  shipId: string | null;
  lat: number;
  lon: number;
  elevM: number | null;
  /** Launch time (0 08 021 = 18), ms. */
  launchMs: number;
  /** 3 09 052 or 3 09 057. */
  sequence: number;
  centre: number;
  levels: TempLevel[];
}

const K0 = 273.15;
const num = (v: BufrValue | undefined): number | null => (typeof v === 'number' ? v : null);

/** The ascent of one subset; null when the subset is not a TEMP ascent (descent, PILOT) or lacks position or time. */
export function tempSounding(msg: BufrMessage, subset: ReadonlyArray<[number, BufrValue]>): TempSounding | null {
  const sequence = msg.descriptors.find((d) => d === 309052 || d === 309057);
  if (!sequence) return null;
  const first = (code: number) => subset.find(([c]) => c === code)?.[1];
  const blk = num(first(1001)), st = num(first(1002));
  const lat = num(first(5001)), lon = num(first(6001));
  const y = num(first(4001)), mo = num(first(4002)), d = num(first(4003)), h = num(first(4004)), mi = num(first(4005)), s = num(first(4006));
  if (lat == null || lon == null || y == null || mo == null || d == null || h == null || mi == null) return null;
  const levels: TempLevel[] = [];
  for (let i = 0; i < subset.length; i++) {
    if (subset[i][0] !== 4086 || subset[i + 3]?.[0] !== 10009) continue;
    const g = subset.slice(i, i + 10).map(([, v]) => num(v));
    const [dt, sig, pPa, z, dLat, dLon, tK, tdK, dd, ff] = g;
    levels.push({
      dt, sig, pHpa: pPa == null ? null : pPa / 100, zM: z, dLat, dLon,
      tC: tK == null ? null : Number((tK - K0).toFixed(2)), tdC: tdK == null ? null : Number((tdK - K0).toFixed(2)), ddDeg: dd, ffMs: ff,
    });
    i += 9;
  }
  const shipId = first(1011);
  return {
    wmo: blk != null && st != null ? `${String(blk).padStart(2, '0')}${String(st).padStart(3, '0')}` : null,
    shipId: typeof shipId === 'string' && shipId ? shipId : null,
    lat, lon, elevM: num(first(7030)) ?? num(first(7007)),
    launchMs: Date.UTC(y, mo - 1, d, h, mi, s ?? 0),
    sequence, centre: msg.centre, levels,
  };
}
