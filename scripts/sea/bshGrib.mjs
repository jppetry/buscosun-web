/**
 * Phase ST — producer-only GRIB2 reader for the BSH surface-current files (`Current_<pkg>_<run>_<day>.grb2`,
 * `audit/seewetter-stroemung.md` §1). The shared client decoder `src/sources/gribDecode.ts` does not read them (data
 * representation template 5.40, JPEG 2000) and is deliberately left as it is for the sources it serves.
 *
 * Reads exactly what was measured in the files and refuses the rest with a named reason (`BshGribError`):
 *   edition 2 · one field per message · grid template 3.0 (regular lat/lon) · product template 4.0 ·
 *   data representation 5.40 (JPEG 2000 code stream, `jp2k.mjs`) or 5.0 (simple packing) · bitmap in section 6 or none.
 * The valid time of a field is its reference time (section 1) plus the forecast time — the BSH writes every 15-min
 * step with its own reference time and forecast time 0.
 */
import { decodeJ2k, Jp2kError } from './jp2k.mjs';

export class BshGribError extends Error {}
const fail = (m) => { throw new BshGribError(`BSH-GRIB: ${m}`); };
const sgn32 = (dv, o) => { const v = dv.getUint32(o); return v & 0x80000000 ? -(v & 0x7fffffff) : v; };
const sgn16 = (dv, o) => { const v = dv.getUint16(o); return v & 0x8000 ? -(v & 0x7fff) : v; };
const TIME_UNIT_MS = { 0: 60_000, 1: 3_600_000, 13: 1000 };

/** Offsets of the messages of a file. A file that does not end on a complete message throws (truncated upload). */
export function bshMessages(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = [];
  let p = 0;
  while (p < raw.length) {
    if (p + 16 > raw.length || !(raw[p] === 0x47 && raw[p + 1] === 0x52 && raw[p + 2] === 0x49 && raw[p + 3] === 0x42)) fail(`kein GRIB-Kopf bei Byte ${p}`);
    if (raw[p + 7] !== 2) fail(`Edition ${raw[p + 7]} (nur GRIB2)`);
    const total = Number(dv.getBigUint64(p + 8));
    if (total < 20 || p + total > raw.length) fail(`Nachricht bei Byte ${p} unvollständig (${total} B angesagt, ${raw.length - p} B vorhanden)`);
    if (!(raw[p + total - 4] === 0x37 && raw[p + total - 3] === 0x37 && raw[p + total - 2] === 0x37 && raw[p + total - 1] === 0x37)) fail(`Nachricht bei Byte ${p} ohne Endekennung 7777`);
    out.push({ offset: p, length: total });
    p += total;
  }
  if (!out.length) fail('Datei ohne Nachricht');
  return out;
}

/**
 * The head of one message (everything but the values): valid time, parameter, grid, packing, and where bitmap and
 * data lie. `values: false` readers use this to pick the messages they need before any decoding.
 */
export function bshHead(raw, offset, length) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const h = { discipline: raw[offset + 6], grid: null, bitmap: null, data: null, fields: 0 };
  let o = offset + 16;
  const end = offset + length - 4;
  while (o + 5 <= end) {
    const len = dv.getUint32(o), num = raw[o + 4];
    if (len < 5 || o + len > end) fail('Sektionslänge ungültig');
    if (num === 1) {
      h.centre = dv.getUint16(o + 5);
      h.refMs = Date.UTC(dv.getUint16(o + 12), raw[o + 14] - 1, raw[o + 15], raw[o + 16], raw[o + 17], raw[o + 18]);
      h.refSignificance = raw[o + 11];
    } else if (num === 3) {
      const gdt = dv.getUint16(o + 12);
      if (gdt !== 0) fail(`Gitter-Template 3.${gdt} (nur 3.0, reguläres Länge/Breite-Gitter)`);
      const basic = dv.getUint32(o + 38), sub = dv.getUint32(o + 42);
      const unit = basic === 0 || basic === 0xffffffff ? 1e-6 : basic / (sub === 0xffffffff ? 1 : sub);
      h.grid = {
        ni: dv.getUint32(o + 30), nj: dv.getUint32(o + 34), la1: sgn32(dv, o + 46) * unit, lo1: sgn32(dv, o + 50) * unit,
        la2: sgn32(dv, o + 55) * unit, lo2: sgn32(dv, o + 59) * unit, di: dv.getUint32(o + 63) * unit, dj: dv.getUint32(o + 67) * unit, scanMode: raw[o + 71],
      };
      if (dv.getUint32(o + 6) !== h.grid.ni * h.grid.nj) fail('Punktzahl der Gitterdefinition ≠ Ni × Nj');
    } else if (num === 4) {
      const pdt = dv.getUint16(o + 7);
      if (pdt !== 0) fail(`Produkt-Template 4.${pdt} (nur 4.0)`);
      h.cat = raw[o + 9]; h.num = raw[o + 10];
      const unit = TIME_UNIT_MS[raw[o + 17]];
      if (unit == null) fail(`Zeiteinheit ${raw[o + 17]}`);
      h.leadMs = dv.getUint32(o + 18) * unit;
      h.surface = raw[o + 22]; h.surfaceValue = dv.getUint32(o + 24) / 10 ** (raw[o + 23] & 0x80 ? -(raw[o + 23] & 0x7f) : raw[o + 23]);
    } else if (num === 5) {
      const drt = dv.getUint16(o + 9);
      if (drt !== 40 && drt !== 0) fail(`Daten-Template 5.${drt} (nur 5.40 JPEG 2000 und 5.0 einfache Packung)`);
      h.pack = { drt, n: dv.getUint32(o + 5), R: dv.getFloat32(o + 11), E: sgn16(dv, o + 15), D: sgn16(dv, o + 17), bits: raw[o + 19], lossy: drt === 40 ? raw[o + 21] : 0 };
    } else if (num === 6) {
      const ind = raw[o + 5];
      if (ind === 0) h.bitmap = [o + 6, o + len];
      else if (ind !== 255) fail(`Bitmap-Kennung ${ind}`);
    } else if (num === 7) { h.data = [o + 5, o + len]; h.fields++; }
    o += len;
  }
  if (h.fields !== 1) fail(`${h.fields} Felder in einer Nachricht (nur eines)`);
  if (!h.grid || h.cat == null || !h.pack || h.refMs == null || !Number.isFinite(h.refMs)) fail('Sektion 1, 3, 4 oder 5 fehlt');
  h.t = h.refMs + h.leadMs;
  return h;
}

/**
 * The values of one message in the file's own scan order (`Float32Array`, `NaN` = masked by the bitmap), with its head.
 * Throws `BshGribError` — also for a JPEG 2000 stream the reader refuses and for a sample count that does not fit.
 */
export function bshField(raw, offset, length) {
  const h = bshHead(raw, offset, length);
  const { ni, nj } = h.grid, cells = ni * nj;
  const { n, R, E, D, bits } = h.pack;
  let packed;
  const data = raw.subarray(h.data[0], h.data[1]);
  if (h.pack.drt === 40) {
    if (h.pack.lossy !== 0) fail('JPEG 2000 als verlustbehaftet gekennzeichnet');
    if (bits === 0) packed = null;
    else {
      let img;
      try { img = decodeJ2k(data); } catch (e) { if (e instanceof Jp2kError) fail(e.message); throw e; }
      if (img.samples.length !== n) fail(`${img.samples.length} Werte im Codestream, ${n} angesagt`);
      if (img.bits !== bits) fail(`${img.bits} bit im Codestream, ${bits} in Sektion 5`);
      packed = img.samples;
    }
  } else if (bits === 0) packed = null;
  else {
    if (bits > 32) fail(`${bits} bit je Wert`);
    if (data.length * 8 < n * bits) fail('Datensektion kürzer als die angesagten Werte');
    packed = new Float64Array(n);
    let bp = 0;
    for (let k = 0; k < n; k++) { let v = 0; for (let b = 0; b < bits; b++, bp++) v = v * 2 + ((data[bp >> 3] >> (7 - (bp & 7))) & 1); packed[k] = v; }
  }
  const scale = 2 ** E, dec = 10 ** D;
  const values = new Float32Array(cells).fill(NaN);
  if (h.bitmap) {
    const bm = raw.subarray(h.bitmap[0], h.bitmap[1]);
    if (bm.length * 8 < cells) fail('Bitmap kürzer als das Gitter');
    let k = 0;
    for (let c = 0; c < cells; c++) if (bm[c >> 3] & (0x80 >> (c & 7))) { if (k >= n) fail('Bitmap trägt mehr Punkte als die Datensektion'); values[c] = (R + (packed ? packed[k] : 0) * scale) / dec; k++; }
    if (k !== n) fail(`Bitmap trägt ${k} Punkte, die Datensektion ${n}`);
  } else {
    if (n !== cells) fail(`${n} Werte für ${cells} Gitterpunkte ohne Bitmap`);
    for (let c = 0; c < cells; c++) values[c] = (R + (packed ? packed[c] : 0) * scale) / dec;
  }
  return { ...h, values };
}
