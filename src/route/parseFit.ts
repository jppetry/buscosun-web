/**
 * Minimaler FIT-Decoder (Garmin/Wahoo Binärformat).
 *
 * Liest nur, was für die Strecke nötig ist: die „record"-Nachrichten
 * (global message number 20) mit Position, Höhe, Distanz und Zeit. Definition-
 * und Datennachrichten werden gemäß FIT-Spezifikation verarbeitet, alle nicht
 * benötigten Felder übersprungen. Developer-Felder werden korrekt überlesen.
 *
 * Referenz: FIT Protocol — Encoded Data, Record Format.
 */

import type { ParsedFile, RoutePoint } from './routeModel';

const RECORD_MESG = 20; // global message number "record"
// Semicircles → Grad: deg = value * 180 / 2^31
const SEMI_TO_DEG = 180 / 2 ** 31;
// FIT-Epoch: Sekunden seit 1989-12-31 00:00:00 UTC.
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);

interface FieldDef {
  fieldNum: number;
  size: number;
  baseType: number;
}
interface MsgDef {
  globalNum: number;
  littleEndian: boolean;
  fields: FieldDef[];
  /** Gesamtgröße der Developer-Felder in Bytes (werden übersprungen). */
  devSize: number;
}

export function parseFit(buffer: ArrayBuffer): ParsedFile {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (buffer.byteLength < 14) throw new Error('FIT-Datei ist zu kurz.');

  const headerSize = view.getUint8(0);
  // ".FIT"-Signatur in den Bytes 8..11 prüfen.
  const sig = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (sig !== '.FIT') throw new Error('Keine gültige FIT-Datei (Signatur fehlt).');

  const dataSize = view.getUint32(4, true);
  let pos = headerSize;
  const dataEnd = Math.min(headerSize + dataSize, buffer.byteLength);

  const defs = new Map<number, MsgDef>(); // local message type → definition
  const points: RoutePoint[] = [];

  while (pos < dataEnd) {
    const recHeader = view.getUint8(pos++);

    if (recHeader & 0x80) {
      // Compressed-Timestamp-Header: nutzt vorhandene Definition, keine Position
      // relevant → wir können die Datennachricht nicht generisch überspringen,
      // ohne ihre Größe zu kennen. Diese Variante ist bei Strecken praktisch
      // nicht im Einsatz; wir brechen defensiv ab.
      const localType = (recHeader >> 5) & 0x03;
      const def = defs.get(localType);
      if (!def) break;
      pos += dataFieldsSize(def);
      continue;
    }

    const localType = recHeader & 0x0f;

    if (recHeader & 0x40) {
      // Definition-Nachricht.
      pos++; // reserved
      const arch = view.getUint8(pos++); // 0 = little endian
      const littleEndian = arch === 0;
      const globalNum = view.getUint16(pos, littleEndian);
      pos += 2;
      const numFields = view.getUint8(pos++);
      const fields: FieldDef[] = [];
      for (let i = 0; i < numFields; i++) {
        const fieldNum = view.getUint8(pos++);
        const size = view.getUint8(pos++);
        const baseType = view.getUint8(pos++);
        fields.push({ fieldNum, size, baseType });
      }
      let devSize = 0;
      if (recHeader & 0x20) {
        // Developer-Felder: num + je 3 Bytes Definition; ihre Datengröße zählt.
        const numDev = view.getUint8(pos++);
        for (let i = 0; i < numDev; i++) {
          pos++; // field number
          const size = view.getUint8(pos++);
          pos++; // dev data index
          devSize += size;
        }
      }
      defs.set(localType, { globalNum, littleEndian, fields, devSize });
      continue;
    }

    // Daten-Nachricht.
    const def = defs.get(localType);
    if (!def) break; // ohne Definition nicht interpretierbar
    if (def.globalNum === RECORD_MESG) {
      const pt = readRecord(view, pos, def);
      if (pt) points.push(pt);
    }
    pos += dataFieldsSize(def);
  }

  if (points.length === 0) throw new Error('Keine Streckenpunkte in der FIT-Datei gefunden.');
  return { tracks: [{ points }] };
}

function dataFieldsSize(def: MsgDef): number {
  let s = def.devSize;
  for (const f of def.fields) s += f.size;
  return s;
}

function readRecord(view: DataView, start: number, def: MsgDef): RoutePoint | null {
  let off = start;
  let lat: number | undefined;
  let lon: number | undefined;
  let ele: number | undefined;
  let time: number | undefined;
  const le = def.littleEndian;

  for (const f of def.fields) {
    const at = off;
    off += f.size;
    switch (f.fieldNum) {
      case 0: { // position_lat (sint32 semicircles)
        const v = view.getInt32(at, le);
        if (v !== 0x7fffffff) lat = v * SEMI_TO_DEG;
        break;
      }
      case 1: { // position_long (sint32 semicircles)
        const v = view.getInt32(at, le);
        if (v !== 0x7fffffff) lon = v * SEMI_TO_DEG;
        break;
      }
      case 2: { // altitude (uint16, scale 5, offset 500)
        const v = view.getUint16(at, le);
        if (v !== 0xffff) ele = v / 5 - 500;
        break;
      }
      case 78: { // enhanced_altitude (uint32, scale 5, offset 500)
        const v = view.getUint32(at, le);
        if (v !== 0xffffffff) ele = v / 5 - 500;
        break;
      }
      case 253: { // timestamp (uint32, FIT epoch seconds)
        const v = view.getUint32(at, le);
        if (v !== 0xffffffff) time = FIT_EPOCH_MS + v * 1000;
        break;
      }
      default:
        break;
    }
  }

  if (lat == null || lon == null) return null;
  const pt: RoutePoint = { lat, lon };
  if (ele != null) pt.ele = ele;
  if (time != null) pt.time = time;
  return pt;
}
