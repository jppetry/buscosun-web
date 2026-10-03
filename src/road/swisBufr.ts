/**
 * AW-2 — Decoder for the DWD road-weather bulletins (SWIS, `opendata.dwd.de/weather/weather_reports/
 * road_weather_stations/<folder>/swis2-ISXD70_*`), handwritten like the GRIB2 decoder: only what the
 * two layouts measured in the AW-0 spike need (`audit/autobahnwetter.md` §2), nothing generic beyond it.
 *
 *   layout `swis-local`        DWD template of March 2015 (`bufr_templates_sws_national_pdf.pdf`): edition 3 or 4,
 *                              master 13, centre 78, local descriptors 0 12 241 / 0 13 241 / 0 20 241 (16 series)
 *   layout `swis-local-film01` same template, master 23, replication 1 13 000 with 2 01 131 / 2 02 129 around
 *                              0 13 241 (water film 10 bit, 0.1 mm) — Hamburg/Schleswig-Holstein (3 series)
 *   layout `wmo-307102`        WMO sequence 3 07 102 (master 26/28): 0 12 128 / 0 13 116 / 0 20 138 (4 series)
 *
 * Uncompressed data only (every series measured is uncompressed); operators other than 2 01 / 2 02,
 * compression and any descriptor list other than the three fingerprints throw — a format change at the DWD
 * must block the slot (slot rule in `roadContract.ts`), not produce plausible-looking garbage.
 *
 * Producer-only module: imported by `scripts/road/road-derive.mjs` and the verifiers, never by the app bundle.
 * Reference: eccodes 2.47 decodes the same bytes identically (`verify:road-decode`, scaled integers equal).
 */

export type BufrValue = number | string | null;

export interface BufrMessage {
  edition: number;
  centre: number;
  subCentre: number;
  masterTablesVersion: number;
  localTablesVersion: number;
  /** Section 1 "typical" time — local time in some series (DWFN: 10:00 for an 08:00 UTC slot), never used as obs time. */
  typical: string;
  nSubsets: number;
  /** Unexpanded descriptors of section 3, as FXXYYY integers (e.g. 307102). */
  descriptors: number[];
  /** Per subset the expanded (descriptor, value) sequence in data order, replication factors included. */
  subsets: Array<Array<[number, BufrValue]>>;
}

type Kind = 'num' | 'str' | 'code' | 'flag';
interface ElementDef { kind: Kind; scale: number; ref: number; width: number }

const E = (kind: Kind, scale: number, ref: number, width: number): ElementDef => ({ kind, scale, ref, width });

/** Table B — exactly the elements of both layouts (scale/reference/width as eccodes reports them, local ones per DWD PDF p. 8–9). */
export const SWIS_TABLE_B: Readonly<Record<number, ElementDef>> = Object.freeze({
  1015: E('str', 0, 0, 160), 1018: E('str', 0, 0, 40),
  1101: E('code', 0, 0, 10), 1102: E('num', 0, 0, 30), 1104: E('str', 0, 0, 32), 1105: E('str', 0, 0, 40), 1106: E('num', -2, 0, 14),
  1241: E('str', 0, 0, 32), 1242: E('str', 0, 0, 40), 1243: E('num', -2, 0, 14),
  2241: E('code', 0, 0, 4), 2242: E('code', 0, 0, 4), 2243: E('flag', 0, 0, 6), 2244: E('code', 0, 0, 5), 2245: E('code', 0, 0, 4),
  3016: E('code', 0, 0, 4), 3017: E('flag', 0, 0, 6), 3018: E('code', 0, 0, 5), 3019: E('code', 0, 0, 4),
  4001: E('num', 0, 0, 12), 4002: E('num', 0, 0, 4), 4003: E('num', 0, 0, 6), 4004: E('num', 0, 0, 5), 4005: E('num', 0, 0, 6),
  4025: E('num', 0, -2048, 12),
  5001: E('num', 5, -9000000, 25), 6001: E('num', 5, -18000000, 26),
  7030: E('num', 1, -4000, 17), 7032: E('num', 2, 0, 16), 7061: E('num', 2, 0, 14),
  8021: E('code', 0, 0, 5),
  11001: E('num', 0, 0, 9), 11002: E('num', 1, 0, 12), 11041: E('num', 1, 0, 12), 11043: E('num', 0, 0, 9),
  12101: E('num', 2, 0, 16), 12103: E('num', 2, 0, 16), 12128: E('num', 2, 0, 16), 12129: E('num', 2, 0, 16),
  12241: E('num', 2, 0, 16), 12242: E('num', 2, 0, 16),
  13003: E('num', 0, 0, 7), 13011: E('num', 1, -1, 14), 13055: E('num', 4, 0, 8), 13116: E('num', 4, 0, 10), 13241: E('num', 3, 0, 7),
  20001: E('num', -1, 0, 13), 20021: E('flag', 0, 0, 30), 20024: E('code', 0, 0, 3), 20138: E('code', 0, 0, 4), 20241: E('code', 0, 0, 4),
  31001: E('num', 0, 0, 8),
  33005: E('flag', 0, 0, 30),
});

/** Table D — the three WMO date/position sequences and the WMO road-weather sequence (expansion as eccodes 2.47, master 26). */
export const SWIS_TABLE_D: Readonly<Record<number, readonly number[]>> = Object.freeze({
  301011: [4001, 4002, 4003],
  301012: [4004, 4005],
  301021: [5001, 6001],
  307102: [
    1101, 1102, 1018, 1015, 1104, 1105, 1106, 3017, 3018, 3019, 301011, 301012, 301021, 7030,
    7032, 12101, 12103, 13003, 7032, 20001,
    109000, 31001, 3016, 12128, 102000, 31001, 7061, 12129, 7061, 13116, 20138,
    4025, 20024, 13055, 20021, 13011,
    7032, 8021, 4025, 11001, 11002, 8021, 4025, 11043, 11041,
    33005,
  ],
});

/** Section-3 fingerprints of the three layouts (AW-0, 03.10.2026: 23 of 23 active series match one of them). */
export const SWIS_LAYOUTS: Readonly<Record<'swis-local' | 'swis-local-film01' | 'wmo-307102', readonly number[]>> = Object.freeze({
  'swis-local': [
    1018, 1015, 1241, 1242, 1243, 2243, 2244, 2245, 301011, 301012, 301021, 7030,
    7032, 12101, 12103, 13003, 7032, 20001,
    109000, 31001, 2242, 12241, 102000, 31001, 7061, 12242, 7061, 13241, 20241,
    4025, 20024, 13055, 20021, 13011,
    7032, 8021, 4025, 11001, 11002, 8021, 4025, 11043, 11041,
    33005,
  ],
  'swis-local-film01': [
    1018, 1015, 1241, 1242, 1243, 2243, 2244, 2245, 301011, 301012, 301021, 7030,
    7032, 12101, 12103, 13003, 7032, 20001,
    113000, 31001, 2242, 12241, 102000, 31001, 7061, 12242, 7061, 201131, 202129, 13241, 202000, 201000, 20241,
    4025, 20024, 13055, 20021, 13011,
    7032, 8021, 4025, 11001, 11002, 8021, 4025, 11043, 11041,
    33005,
  ],
  'wmo-307102': [307102],
});
export type SwisLayout = keyof typeof SWIS_LAYOUTS;

export class BufrFormatError extends Error {}

const u24 = (b: Uint8Array, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const fxy = (d: number) => [Math.floor(d / 100000), Math.floor(d / 1000) % 100, d % 1000] as const;
const two = (n: number) => String(n).padStart(2, '0');

class BitReader {
  private pos: number;
  private readonly b: Uint8Array;
  private readonly start: number;
  private readonly end: number;
  constructor(b: Uint8Array, start: number, end: number) {
    this.b = b;
    this.start = start;
    this.end = end;
    this.pos = start * 8;
  }
  /** Unsigned integer of `width` ≤ 32 bits (arithmetic, so 32-bit fields stay positive). */
  read(width: number): number {
    if (this.pos + width > this.end * 8) throw new BufrFormatError(`data section overrun (${width} bits at bit ${this.pos - this.start * 8})`);
    let v = 0;
    for (let i = 0; i < width; i++) {
      const p = this.pos + i;
      v = v * 2 + ((this.b[p >> 3] >> (7 - (p & 7))) & 1);
    }
    this.pos += width;
    return v;
  }
}

/** Table C operators 2 01 (data width) and 2 02 (scale) — they apply to numeric elements only (WMO-No. 306, Table C). */
interface OperatorState { width: number; scale: number }

function decodeElement(r: BitReader, code: number, op: OperatorState = { width: 0, scale: 0 }): BufrValue {
  const base = SWIS_TABLE_B[code];
  if (!base) throw new BufrFormatError(`descriptor ${code} not in the SWIS table`);
  const def = base.kind === 'num' && code !== 31001 ? { ...base, width: base.width + op.width, scale: base.scale + op.scale } : base;
  if (def.kind === 'str') {
    const bytes: number[] = [];
    let allOnes = true;
    for (let i = 0; i < def.width / 8; i++) {
      const c = r.read(8);
      if (c !== 0xff) allOnes = false;
      bytes.push(c);
    }
    if (allOnes) return null;
    // The PDF promises IA5 without umlauts, the bulletins carry Latin-1 (`Brabschütz`, AW-0) — decoded as Latin-1.
    // Blanks and NULs on either side are padding (DWFN right-aligns: ` V164`).
    return String.fromCharCode(...bytes).replace(/^[\s\0]+|[\s\0]+$/g, '') || null;
  }
  const raw = r.read(def.width);
  const missing = 2 ** def.width - 1;
  if (raw === missing && code !== 31001) return null;
  if (def.kind !== 'num' || code === 31001) return raw + def.ref;
  const v = raw + def.ref;
  // Rounded to the descriptor's resolution so the double equals the decimal the bits encode.
  return def.scale > 0 ? Number((v / 10 ** def.scale).toFixed(def.scale)) : v * 10 ** -def.scale;
}

function expand(r: BitReader, list: readonly number[], out: Array<[number, BufrValue]>, op: OperatorState): void {
  let i = 0;
  while (i < list.length) {
    const d = list[i];
    const [f, x, y] = fxy(d);
    if (f === 0) {
      out.push([d, decodeElement(r, d, op)]);
      i++;
    } else if (f === 1) {
      let count: number;
      let groupStart: number;
      if (y === 0) {
        const factorDesc = list[i + 1];
        if (factorDesc !== 31001) throw new BufrFormatError(`delayed replication with factor ${factorDesc}`);
        const v = decodeElement(r, factorDesc) as number;
        out.push([factorDesc, v]);
        count = v;
        groupStart = i + 2;
      } else {
        count = y;
        groupStart = i + 1;
      }
      const group = list.slice(groupStart, groupStart + x);
      if (group.length !== x) throw new BufrFormatError(`replication ${d} runs past the descriptor list`);
      for (let k = 0; k < count; k++) expand(r, group, out, op);
      i = groupStart + x;
    } else if (f === 3) {
      const seq = SWIS_TABLE_D[d];
      if (!seq) throw new BufrFormatError(`sequence ${d} not in the SWIS table`);
      expand(r, seq, out, op);
      i++;
    } else if (x === 1) {
      op.width = y === 0 ? 0 : y - 128;
      i++;
    } else if (x === 2) {
      op.scale = y === 0 ? 0 : y - 128;
      i++;
    } else {
      throw new BufrFormatError(`operator descriptor ${d} not supported`);
    }
  }
}

/** Decodes ONE BUFR message (edition 3 or 4) from the start of `buf`. */
export function decodeBufrMessage(buf: Uint8Array): BufrMessage {
  if (buf.length < 8 || buf[0] !== 0x42 || buf[1] !== 0x55 || buf[2] !== 0x46 || buf[3] !== 0x52) throw new BufrFormatError('no BUFR indicator');
  const total = u24(buf, 4);
  const edition = buf[7];
  if (edition !== 3 && edition !== 4) throw new BufrFormatError(`BUFR edition ${edition}`);
  if (total > buf.length) throw new BufrFormatError(`message length ${total} > ${buf.length} bytes`);
  if (String.fromCharCode(buf[total - 4], buf[total - 3], buf[total - 2], buf[total - 1]) !== '7777') throw new BufrFormatError('no end section 7777');

  let o = 8;
  const l1 = u24(buf, o);
  let centre: number, subCentre: number, optional: boolean, mtv: number, ltv: number, typical: string;
  if (edition === 4) {
    centre = u16(buf, o + 4); subCentre = u16(buf, o + 6); optional = (buf[o + 9] & 0x80) !== 0;
    mtv = buf[o + 13]; ltv = buf[o + 14];
    typical = `${u16(buf, o + 15)}-${two(buf[o + 17])}-${two(buf[o + 18])}T${two(buf[o + 19])}:${two(buf[o + 20])}`;
  } else {
    subCentre = buf[o + 4]; centre = buf[o + 5]; optional = (buf[o + 7] & 0x80) !== 0;
    mtv = buf[o + 10]; ltv = buf[o + 11];
    typical = `${2000 + buf[o + 12]}-${two(buf[o + 13])}-${two(buf[o + 14])}T${two(buf[o + 15])}:${two(buf[o + 16])}`;
  }
  o += l1;
  if (optional) o += u24(buf, o);

  const l3 = u24(buf, o);
  const nSubsets = u16(buf, o + 4);
  const flags = buf[o + 6];
  if (flags & 0x40) throw new BufrFormatError('compressed data not supported');
  const descriptors: number[] = [];
  for (let p = o + 7; p + 1 < o + l3; p += 2) {
    const v = u16(buf, p);
    if (p + 2 >= o + l3 && v === 0) break; // pad byte
    descriptors.push((v >> 14) * 100000 + ((v >> 8) & 0x3f) * 1000 + (v & 0xff));
  }
  o += l3;

  const l4 = u24(buf, o);
  const r = new BitReader(buf, o + 4, o + l4);
  const subsets: Array<Array<[number, BufrValue]>> = [];
  for (let s = 0; s < nSubsets; s++) {
    const out: Array<[number, BufrValue]> = [];
    expand(r, descriptors, out, { width: 0, scale: 0 });
    subsets.push(out);
  }
  return { edition, centre, subCentre, masterTablesVersion: mtv, localTablesVersion: ltv, typical, nSubsets, descriptors, subsets };
}

/** Every message of a bulletin file (the DWD files carry exactly one; concatenation is tolerated). */
export function decodeBufrFile(buf: Uint8Array): BufrMessage[] {
  const out: BufrMessage[] = [];
  let o = 0;
  while (o + 8 <= buf.length) {
    if (buf[o] !== 0x42 || buf[o + 1] !== 0x55 || buf[o + 2] !== 0x46 || buf[o + 3] !== 0x52) { o++; continue; }
    const len = u24(buf, o + 4);
    out.push(decodeBufrMessage(buf.subarray(o, o + len)));
    o += len;
  }
  if (!out.length) throw new BufrFormatError('no BUFR message in file');
  return out;
}

export function swisLayoutOf(msg: BufrMessage): SwisLayout {
  for (const [name, list] of Object.entries(SWIS_LAYOUTS) as Array<[SwisLayout, readonly number[]]>) {
    if (list.length === msg.descriptors.length && list.every((d, i) => d === msg.descriptors[i])) return name;
  }
  throw new BufrFormatError(`unknown SWIS layout: ${msg.descriptors.join(' ')}`);
}

// --- SWIS records ------------------------------------------------------------------------------

export interface SwisSensor {
  /** Code table 0 02 242 / 0 03 016 (0–7 lane/track, null missing). */
  pos: number | null;
  /** Road surface temperature in °C. */
  roadT: number | null;
  /** Sub-surface temperatures (depth in m, °C). */
  subT: Array<{ depthM: number | null; t: number | null }>;
  /** Water film thickness in mm (local layout: 1 mm resolution, WMO layout: 0.1 mm). */
  filmMm: number | null;
  /** Road surface condition, code table 0 20 241 = 0 20 138 (0 dry … 7 not dry, null missing). */
  cond: number | null;
}

export interface SwisRecord {
  layout: SwisLayout;
  id: string | null;
  name: string | null;
  state: string | null;
  highway: string | null;
  /** Route kilometre (descriptor in m with 100 m resolution), in km. */
  km: number | null;
  stationType: number | null;
  roadType: number | null;
  construction: number | null;
  /** Observation time in ms (UTC), NaN when the date/time fields are missing or impossible. */
  obsMs: number;
  lat: number | null;
  lon: number | null;
  elevM: number | null;
  airT: number | null;
  dewT: number | null;
  rh: number | null;
  visM: number | null;
  sensors: SwisSensor[];
  precipPeriodMin: number | null;
  precipIntensity: number | null;
  /** Precipitation intensity in mm/h (0.36 mm/h resolution). */
  precipRateMmH: number | null;
  /** Flag table 0 20 021 (bit n = 2^(30−n)). */
  precipType: number | null;
  precipMm: number | null;
  windPeriodMin: number | null;
  windDir: number | null;
  windMs: number | null;
  gustPeriodMin: number | null;
  gustDir: number | null;
  gustMs: number | null;
  /** Flag table 0 33 005 (bit n = 2^(30−n)). */
  quality: number | null;
}

const kToC = (v: BufrValue): number | null => (typeof v === 'number' ? Number((v - 273.15).toFixed(2)) : null);
const num = (v: BufrValue): number | null => (typeof v === 'number' ? v : null);
const str = (v: BufrValue): string | null => (typeof v === 'string' ? v : null);

/** Maps one decoded subset to named fields; the n-th 0 04 025 is precipitation / wind / gust period (fixed by the layouts). */
export function swisRecord(layout: SwisLayout, seq: ReadonlyArray<[number, BufrValue]>): SwisRecord {
  const rec: SwisRecord = {
    layout, id: null, name: null, state: null, highway: null, km: null, stationType: null, roadType: null, construction: null,
    obsMs: NaN, lat: null, lon: null, elevM: null, airT: null, dewT: null, rh: null, visM: null, sensors: [],
    precipPeriodMin: null, precipIntensity: null, precipRateMmH: null, precipType: null, precipMm: null,
    windPeriodMin: null, windDir: null, windMs: null, gustPeriodMin: null, gustDir: null, gustMs: null, quality: null,
  };
  const t: Partial<Record<number, number | null>> = {};
  let sensor: SwisSensor | null = null;
  let depth: number | null = null;
  let periods = 0;
  for (const [d, v] of seq) {
    switch (d) {
      case 1018: rec.id = str(v); break;
      case 1015: rec.name = str(v); break;
      case 1241: case 1104: rec.state = str(v); break;
      case 1242: case 1105: rec.highway = str(v); break;
      case 1243: case 1106: rec.km = typeof v === 'number' ? v / 1000 : null; break;
      case 2243: case 3017: rec.stationType = num(v); break;
      case 2244: case 3018: rec.roadType = num(v); break;
      case 2245: case 3019: rec.construction = num(v); break;
      case 4001: case 4002: case 4003: case 4004: case 4005: if (!(d in t)) t[d] = num(v); break;
      case 5001: rec.lat = num(v); break;
      case 6001: rec.lon = num(v); break;
      case 7030: rec.elevM = num(v); break;
      case 12101: rec.airT = kToC(v); break;
      case 12103: rec.dewT = kToC(v); break;
      case 13003: rec.rh = num(v); break;
      case 20001: rec.visM = num(v); break;
      case 2242: case 3016:
        sensor = { pos: num(v), roadT: null, subT: [], filmMm: null, cond: null };
        rec.sensors.push(sensor);
        break;
      case 12241: case 12128: if (sensor) sensor.roadT = kToC(v); break;
      case 7061: depth = num(v); break;
      case 12242: case 12129: if (sensor) sensor.subT.push({ depthM: depth, t: kToC(v) }); break;
      case 13241: case 13116: if (sensor) sensor.filmMm = typeof v === 'number' ? Number((v * 1000).toFixed(1)) : null; break;
      case 20241: case 20138: if (sensor) sensor.cond = num(v); sensor = null; break;
      case 4025:
        if (periods === 0) rec.precipPeriodMin = num(v);
        else if (periods === 1) rec.windPeriodMin = num(v);
        else if (periods === 2) rec.gustPeriodMin = num(v);
        periods++;
        break;
      case 20024: rec.precipIntensity = num(v); break;
      case 13055: rec.precipRateMmH = typeof v === 'number' ? Number((v * 3600).toFixed(2)) : null; break;
      case 20021: rec.precipType = num(v); break;
      case 13011: rec.precipMm = num(v); break;
      case 11001: rec.windDir = num(v); break;
      case 11002: rec.windMs = num(v); break;
      case 11043: rec.gustDir = num(v); break;
      case 11041: rec.gustMs = num(v); break;
      case 33005: rec.quality = num(v); break;
      default: break;
    }
  }
  const [y, mo, da, h, mi] = [t[4001], t[4002], t[4003], t[4004], t[4005]];
  if (y != null && mo != null && da != null && h != null && mi != null && mo >= 1 && mo <= 12 && da >= 1 && da <= 31 && h <= 23 && mi <= 59) {
    rec.obsMs = Date.UTC(y, mo - 1, da, h, mi);
  }
  return rec;
}

/** All station records of a bulletin file. */
export function decodeSwisFile(buf: Uint8Array): { messages: BufrMessage[]; records: SwisRecord[] } {
  const messages = decodeBufrFile(buf);
  const records: SwisRecord[] = [];
  for (const m of messages) {
    const layout = swisLayoutOf(m);
    for (const s of m.subsets) records.push(swisRecord(layout, s));
  }
  return { messages, records };
}
