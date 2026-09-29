/**
 * DWD RV (Radar-Nowcast) im ODIM-HDF5-Format — der Leser für die Lieferung, die das RADOLAN-Binärformat
 * ablöst (DWD: Abschaltung der Altformate am 2026-10-20 08 UTC; `audit/fusion-expertenbericht-2026-09-29.md` §3.3).
 *
 *   composite/rv/composite_rv_<JJJJMMTT>_<HHMM>.tar      unkomprimiertes Tar, 25 Einträge
 *     composite_rv_<JJJJMMTT>_<HHMM>_<PPP>-hd5           je Vorlauf PPP = 000 … 120 min
 *
 * Am Objekt gemessen (Slot 2026-09-29 20:00 UTC, beide Formate desselben Laufs nebeneinander):
 *   - `/where` xsize 1100, ysize 1200 — dasselbe Gitter DE1200 wie das Altformat; Zeile 0 = Norden
 *     (das Altformat scannt von Süden und wird beim Lesen gedreht). Die Maske „kein Radar" ist in allen
 *     25 Feldern Zelle für Zelle dieselbe (15 566 329 von 33 000 000 Zellen, 0 Abweichungen).
 *   - `dataset1/data1/data` uint32, `what`: gain 0,001, offset −0,001 (float32), nodata 4294967295,
 *     undetect 0, quantity ACRR — Niederschlagshöhe in mm über das Intervall `starttime…endtime` (5 min).
 *   - `/what` date/time = LAUFZEIT (in allen 25 Feldern dieselbe), `dataset1/what` enddate/endtime = Gültigzeit.
 *   - jsfive liest hier die Attribute (anders als bei INCA-NetCDF).
 *   - Das Feld ist EIN Chunk (1200 × 1100), Filter nur deflate (Stufe 6, kein Shuffle).
 *
 * **Zwei Wege zu den Rohwerten.** jsfive baut das Feld Element für Element als gewöhnliches Array auf:
 * gemessen 188 ms je Feld, 4,7 s für die 25 Felder eines Laufs (im Browser mit dem Abruf 15 s). Der
 * schnelle Weg liest den einen Chunk selbst (B-Baum-Knoten, `DecompressionStream`) und legt ein
 * `Uint32Array` darüber. Er gilt nur für genau die gemessene Bauart; jede andere Datei und jede Umgebung
 * ohne `DecompressionStream` nimmt den jsfive-Weg. `verify:radar-repack` hält beide Wege Wert für Wert
 * gleich.
 *
 * **Die Werte sind feiner als im Altformat.** HDF5 trägt 0,001 mm, RADOLAN 0,01 mm (`PR E-02`). Das
 * Altformat ist die ABGESCHNITTENE Fassung desselben Felds, mit einer Einheit als Untergrenze für jedes
 * Echo: Einheit = max(1, ⌊mm / 0,01⌋). Gemessen über 46 175 nasse Zellen: die Regel trifft 45 492, die
 * übrigen 683 (1,5 %) liegen genau auf einer Einheitengrenze (Rohwert ≡ 1 mod 10), wo der DWD beim
 * Schreiben der beiden Formate verschieden gerundet hat — Abweichung dort eine Einheit (0,12 mm/h).
 *
 * `units: 'radolan'` (Voreinstellung) bildet das Altformat nach: die Frames bleiben die, auf die Farbskala,
 * Schwelle 0,06 mm/h und Nowcast-Member gebaut sind. `units: 'native'` gibt die feinen Werte zurück; damit
 * fielen die schwächsten Echos (Rohwert 1…5 = unter 0,06 mm/h, im Messlauf 27 % der nassen Zellen) aus dem
 * Bild — das ist eine Produktänderung und deshalb nicht die Voreinstellung (E-EX-6).
 *
 * DOM-frei: läuft im `hdf5Worker`, im Spiegel (`radar-derive.mjs`) und im Producer (`nowcastReader.mjs`).
 */

import { File as H5File } from 'jsfive';
import { precipToU8 } from '../scalar/RainLayer';
import { untar, type RadolanGrid, type DecodedRvFrame } from './radolanDecode';

/** RADOLAN-Einheit des RV-Produkts in mm (`PR E-02`) — dieselbe Zahl, die `parseHeader` aus dem Altformat liest. */
const RADOLAN_UNIT_MM = Math.pow(10, -2);

export type RvUnits = 'radolan' | 'native';

interface H5DataObjects {
  fh?: ArrayBuffer;
  filter_pipeline?: Array<Map<string, unknown>> | null;
  _chunks?: number[];
  _chunk_address?: number | bigint;
  _get_chunk_params?: () => void;
}
interface H5Node {
  attrs: Record<string, unknown>;
  value?: ArrayLike<number>;
  shape?: number[];
  dtype?: unknown;
  _dataobjects?: H5DataObjects;
}

/** zlib-Strom entpacken; `null`, wenn die Umgebung `DecompressionStream` nicht kennt. */
async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined' || typeof Response === 'undefined' || typeof Blob === 'undefined') return null;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Der schnelle Weg: das Feld als `Uint32Array`, wenn die Datei genau die gemessene Bauart hat — uint32
 * little-endian, EIN Chunk in der Größe des Felds, einziger Filter deflate, Filtermaske 0. Sonst `null`.
 *
 * B-Baum Version 1, Knotentyp 1 (Rohdaten-Chunks): `TREE`, Typ, Stufe, Zahl der Einträge, zwei
 * Geschwisteradressen, dann je Eintrag der Schlüssel (Chunk-Größe, Filtermaske, Offsets) und die Adresse.
 */
async function fastRaw(buf: ArrayBuffer, ds: H5Node, cells: number): Promise<Uint32Array | null> {
  try {
    const o = ds._dataobjects;
    if (!o || ds.dtype !== '<u4' || !Array.isArray(ds.shape) || ds.shape.length !== 2) return null;
    o._get_chunk_params?.();
    const chunks = o._chunks, fp = o.filter_pipeline;
    if (!chunks || chunks.length !== 2 || chunks[0] !== ds.shape[0] || chunks[1] !== ds.shape[1]) return null;
    if (!fp || fp.length !== 1 || Number(fp[0].get('filter_id')) !== 1) return null;
    const at = Number(o._chunk_address);
    const v = new DataView(buf);
    if (!(at > 0) || at + 64 > buf.byteLength) return null;
    if (v.getUint32(at, false) !== 0x54524545) return null;                       // 'TREE'
    if (v.getUint8(at + 4) !== 1 || v.getUint8(at + 5) !== 0 || v.getUint16(at + 6, true) !== 1) return null;
    const key = at + 24;
    const size = v.getUint32(key, true), mask = v.getUint32(key + 4, true);
    if (mask !== 0) return null;
    // Schlüssel: Größe 4 + Maske 4 + (2 Achsen + 1) · 8 Offsets, danach die Adresse des Chunks
    for (let i = 0; i < 3; i++) if (v.getUint32(key + 8 + i * 8, true) !== 0 || v.getUint32(key + 12 + i * 8, true) !== 0) return null;
    const addrLo = v.getUint32(key + 32, true), addrHi = v.getUint32(key + 36, true);
    if (addrHi !== 0 || addrLo + size > buf.byteLength) return null;
    const out = await inflateZlib(new Uint8Array(buf, addrLo, size));
    if (!out || out.byteLength !== cells * 4) return null;
    if (out.byteOffset % 4 === 0 && LITTLE_ENDIAN) return new Uint32Array(out.buffer, out.byteOffset, cells);
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength), raw = new Uint32Array(cells);
    for (let k = 0; k < cells; k++) raw[k] = dv.getUint32(k * 4, true);
    return raw;
  } catch {
    return null;                                                                  // jsfive übernimmt
  }
}
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

const str = (v: unknown): string => String(v ?? '').replace(/\0+$/, '').trim();
const num = (v: unknown, what: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`RV-HDF5: ${what} fehlt oder ist keine Zahl`);
  return n;
};

/** `JJJJMMTT` + `HHMMSS` (UTC) → ms. */
function odimTime(date: unknown, time: unknown, what: string): number {
  const d = str(date), t = str(time).padStart(6, '0');
  if (!/^\d{8}$/.test(d) || !/^\d{6}$/.test(t)) throw new Error(`RV-HDF5: ${what} unlesbar (${d} ${t})`);
  return Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6));
}

/**
 * Ein HDF5-Feld → dasselbe `RadolanGrid`, das `decodeRadolanRaw` aus dem Altformat liest: mm/h, Norden oben,
 * NaN außerhalb der Radarabdeckung, `validAt` = Laufzeit, `leadMinutes` = Vorlauf.
 */
export interface RvHdf5Options {
  units?: RvUnits;
  name?: string;
  /** `'jsfive'` erzwingt den langsamen Weg (Gegenprobe im Verifier). */
  reader?: 'auto' | 'jsfive';
}

export async function decodeRvHdf5(buf: ArrayBuffer, opts: RvHdf5Options = {}): Promise<RadolanGrid> {
  const f = new H5File(buf, opts.name ?? 'rv.h5') as unknown as { get(path: string): H5Node | undefined };
  const where = f.get('where')?.attrs, top = f.get('what')?.attrs;
  const dsWhat = f.get('dataset1/what')?.attrs, dWhat = f.get('dataset1/data1/what')?.attrs;
  const ds = f.get('dataset1/data1/data');
  if (!where || !top || !dsWhat || !dWhat || !ds) throw new Error('RV-HDF5: Gruppe /where, /what oder dataset1 fehlt');

  const cols = num(where.xsize, 'xsize'), rows = num(where.ysize, 'ysize');
  const data: ArrayLike<number> | undefined = (opts.reader === 'jsfive' ? null : await fastRaw(buf, ds, cols * rows)) ?? ds.value;
  if (!data) throw new Error('RV-HDF5: dataset1/data1/data ohne Werte');
  if (data.length !== cols * rows) throw new Error(`RV-HDF5: ${data.length} Werte für ${cols}×${rows}`);
  const quantity = str(dWhat.quantity);
  if (quantity !== 'ACRR') throw new Error(`RV-HDF5: Größe ${quantity || '?'} statt ACRR (Niederschlagshöhe)`);

  const runMs = odimTime(top.date, top.time, '/what date/time');
  const endMs = odimTime(dsWhat.enddate, dsWhat.endtime, 'dataset1/what enddate/endtime');
  const startMs = odimTime(dsWhat.startdate, dsWhat.starttime, 'dataset1/what startdate/starttime');
  const intervalMin = (endMs - startMs) / 60_000;
  if (!(intervalMin > 0 && intervalMin <= 60)) throw new Error(`RV-HDF5: Intervall ${intervalMin} min`);
  const leadMinutes = Math.round((endMs - runMs) / 60_000);

  const nodata = num(dWhat.nodata, 'nodata'), undetect = num(dWhat.undetect, 'undetect');
  // gain/offset stehen als float32 in der Datei (0,0009999999…). In Mikrometern sind sie ganze Zahlen, und
  // die Niederschlagshöhe bleibt es auch — die Einheitenregel unten hängt damit an keiner Gleitkommagrenze.
  const gainUm = Math.round(num(dWhat.gain, 'gain') * 1e6), offsetUm = Math.round(num(dWhat.offset, 'offset') * 1e6);
  if (!(gainUm > 0)) throw new Error(`RV-HDF5: gain ${dWhat.gain}`);
  const perHour = 60 / intervalMin;
  const unitUm = Math.round(RADOLAN_UNIT_MM * 1e6);
  const mmPerHourPerUnit = RADOLAN_UNIT_MM * perHour;       // wie `parseHeader`: PR-Faktor · (60 / Intervall)
  const native = opts.units === 'native';

  const rainRate = new Float32Array(cols * rows);
  for (let k = 0; k < rainRate.length; k++) {
    const r = data[k];
    if (r === nodata) { rainRate[k] = NaN; continue; }
    if (r === undetect) continue;                           // 0 = kein Echo
    const um = Math.max(0, r * gainUm + offsetUm);
    rainRate[k] = native ? (um / 1e6) * perHour : Math.max(1, Math.floor(um / unitUm)) * mmPerHourPerUnit;
  }
  return { cols, rows, rainRate, validAt: new Date(runMs), leadMinutes, product: 'RV' };
}

/** Beginnt der Puffer mit der HDF5-Signatur (`89 48 44 46 0D 0A 1A 0A`)? */
export function isHdf5(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x48 && bytes[2] === 0x44 && bytes[3] === 0x46
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

/**
 * Das HDF5-Tar eines RV-Laufs → dieselbe Ausgabe wie `decodeRvTar` für das Altformat: fertige Werte-Grids
 * (`precipToU8`-Bytes), nach Vorlauf aufsteigend.
 */
export async function decodeRvHdf5Tar(tarBytes: Uint8Array, opts: Omit<RvHdf5Options, 'name'> = {}): Promise<{ runAtMs: number; frames: DecodedRvFrame[] }> {
  const entries = untar(tarBytes);
  if (!entries.length) throw new Error('RV-HDF5: leeres tar');
  const frames: DecodedRvFrame[] = [];
  let runAtMs = NaN;
  for (const e of entries) {
    if (!isHdf5(e.data)) throw new Error(`RV-HDF5: ${e.name} ist keine HDF5-Datei`);
    // jsfive braucht einen eigenen ArrayBuffer — der Tar-Eintrag ist eine Teilsicht.
    const grid = await decodeRvHdf5(e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength) as ArrayBuffer, { ...opts, name: e.name });
    const named = /_(\d{3})-hd5$/.exec(e.name);
    if (named && Number(named[1]) !== grid.leadMinutes) {
      throw new Error(`RV-HDF5: ${e.name} trägt Vorlauf ${grid.leadMinutes} min`);
    }
    if (grid.leadMinutes === 0 || !Number.isFinite(runAtMs)) runAtMs = grid.validAt.getTime();
    const values = new Uint8Array(grid.rainRate.length);
    for (let k = 0; k < values.length; k++) values[k] = precipToU8(grid.rainRate[k]);
    frames.push({ leadMinutes: grid.leadMinutes, validAtMs: grid.validAt.getTime(), values, width: grid.cols, height: grid.rows });
  }
  frames.sort((a, b) => a.leadMinutes - b.leadMinutes);
  return { runAtMs, frames };
}
