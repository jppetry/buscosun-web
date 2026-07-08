/**
 * Pure (DOM-freier) RADOLAN-RV-Dekoder: TAR-Splitting + Binär-Header-Parsing +
 * Zell-Dekodierung + mm/h→Uint8-Quantisierung — extrahiert aus radolan.ts, damit
 * derselbe Code auch off-main im radolanWorker läuft (s. radolanWorker.ts).
 *
 * Vorher lief `decodeRvTar` (25 Frames × 1,32-Mio.-Zellen-Gitter DE1200, JEDER
 * Frame ein synchroner verschachtelter Loop OHNE jeden Yield dazwischen) direkt
 * im Aufrufer (radolan.ts `fetchRvTar`) auf dem Main Thread — gemessen ~2-3 s
 * blockierter Main Thread beim ersten Zuschalten von Niederschlag/Flow-Nowcast/
 * Regen-Chance (4×-CPU-Throttle). Die bz2-Dekompression war bereits off-main
 * (bz2Worker-Pool); dieser Schritt DANACH war es nicht.
 */

import { precipToU8 } from '../scalar/RainLayer';

export interface RadolanGrid {
  cols: number;
  rows: number;
  /** Niederschlagsrate in mm/h, NaN = außerhalb der Radarabdeckung. Norden oben. */
  rainRate: Float32Array;
  validAt: Date;
  /** Vorhersage-Vorlaufzeit in Minuten (0 für die Analyse / RY-live). */
  leadMinutes: number;
  /** Produktkürzel: 'RV' (Nowcast), 'RY' (live) … */
  product: string;
}

interface RadolanHeader {
  product: string;
  validAt: Date;
  cols: number;
  rows: number;
  leadMinutes: number;
  /** mm/h pro Rohwert-Einheit = PR-Faktor · (60 / Intervall-Minuten). */
  mmPerHourPerUnit: number;
}

function parseHeader(header: string): RadolanHeader {
  // Layout: PP DDHHMM ##### MMYY <Tokens in beliebiger Reihenfolge>
  // z.B. "RV260950100000526BY 2640189VS 5SW …PR E-02INT 5GP1200x1100VV 060…"
  const product = header.substring(0, 2);
  const dd = parseInt(header.substring(2, 4), 10);
  const hh = parseInt(header.substring(4, 6), 10);
  const min = parseInt(header.substring(6, 8), 10);
  const mon = parseInt(header.substring(13, 15), 10);
  const yy = parseInt(header.substring(15, 17), 10);
  const year = yy + (yy < 80 ? 2000 : 1900);
  const validAt = new Date(Date.UTC(year, mon - 1, dd, hh, min));

  const gp = header.match(/GP\s*(\d+)\s*x\s*(\d+)/);
  if (!gp) throw new Error('RADOLAN: GP-Token (Gittergröße) fehlt');
  const rows = parseInt(gp[1], 10);
  const cols = parseInt(gp[2], 10);

  const vv = header.match(/VV\s*(\d+)/);
  const leadMinutes = vv ? parseInt(vv[1], 10) : 0;

  const pr = header.match(/PR E([-+]?\d+)/);
  const prFactor = pr ? Math.pow(10, parseInt(pr[1], 10)) : 0.01;
  const intMatch = header.match(/INT\s+(\d+)/);
  const intervalMin = intMatch ? parseInt(intMatch[1], 10) : 5;
  const mmPerHourPerUnit = prFactor * (60 / intervalMin);

  return { product, validAt, cols, rows, leadMinutes, mmPerHourPerUnit };
}

/**
 * Dekodiert einen bereits entpackten RADOLAN-Binär-Frame in ein mm/h-Gitter.
 * RADOLAN scannt von SW (Zeile 0 = Süden, Spalte 0 = Westen) nach NE; wir
 * flippen die Zeilen, sodass das Ergebnis Norden-oben ist (Canvas-natürlich).
 */
export function decodeRadolanRaw(raw: Uint8Array): RadolanGrid {
  let etx = -1;
  for (let i = 0; i < Math.min(raw.length, 4096); i++) {
    if (raw[i] === 0x03) { etx = i; break; }
  }
  if (etx < 0) throw new Error('RADOLAN: kein ETX-Terminator im Header');

  const meta = parseHeader(new TextDecoder('ascii').decode(raw.subarray(0, etx)));
  const payload = raw.subarray(etx + 1);
  const expected = meta.cols * meta.rows * 2;
  if (payload.length < expected) {
    throw new Error(`RADOLAN: Payload zu kurz — ${payload.length} < ${expected}`);
  }

  const { cols, rows, mmPerHourPerUnit } = meta;
  const rainRate = new Float32Array(cols * rows);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  for (let j = 0; j < rows; j++) {
    const dstRow = rows - 1 - j; // Süd→Nord flippen
    const srcBase = j * cols;
    const dstBase = dstRow * cols;
    for (let i = 0; i < cols; i++) {
      const v = view.getUint16((srcBase + i) * 2, /* littleEndian */ true);
      // Jedes gesetzte Flag-Bit (insb. 0x2000 / Wert 0x29C4) = kein Messwert.
      // Echte Werte bleiben < 0x1000 (40,95 mm/5min wären physikalisch absurd),
      // touchieren die Flag-Bits also nie.
      rainRate[dstBase + i] = (v & 0xf000) !== 0 ? NaN : v * mmPerHourPerUnit;
    }
  }

  return {
    cols, rows, rainRate,
    validAt: meta.validAt,
    leadMinutes: meta.leadMinutes,
    product: meta.product,
  };
}

/** mm/h-Feld → kompaktes Uint8-Werte-Grid (north-up) für die RainLayer-Textur. */
function ratesToValues(rate: Float32Array): Uint8Array {
  const v = new Uint8Array(rate.length);
  for (let k = 0; k < rate.length; k++) v[k] = precipToU8(rate[k]);
  return v;
}

interface TarEntry {
  name: string;
  data: Uint8Array;
}

/** Minimaler USTAR-Reader: liest 512-Byte-Header + Datenblöcke. */
export function untar(buf: Uint8Array): TarEntry[] {
  const out: TarEntry[] = [];
  const ascii = new TextDecoder('ascii');
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = ascii
      .decode(buf.subarray(off, off + 100))
      .replace(/\0[\s\S]*$/, '')
      .trim();
    if (!name) break; // zwei Null-Blöcke markieren das Ende
    const sizeOctal = ascii
      .decode(buf.subarray(off + 124, off + 136))
      .replace(/[^0-7]/g, '');
    const size = sizeOctal ? parseInt(sizeOctal, 8) : 0;
    const start = off + 512;
    out.push({ name, data: buf.subarray(start, start + size) });
    off = start + Math.ceil(size / 512) * 512;
  }
  return out;
}

export interface DecodedRvFrame {
  leadMinutes: number;
  validAtMs: number;
  values: Uint8Array;
  width: number;
  height: number;
}

/**
 * Entpackt + dekodiert ALLE Einträge eines RV-Tars zu fertigen Werte-Grids —
 * der teure Kern (25 Frames × 1,32-Mio.-Zellen DE1200-Gitter, je ein
 * verschachtelter Loop), off-main lauffähig (radolanWorker.ts) mit demselben
 * Code als Main-Thread-Fallback.
 */
export function decodeRvTar(tarBytes: Uint8Array): { runAtMs: number; frames: DecodedRvFrame[] } {
  const entries = untar(tarBytes);
  if (!entries.length) throw new Error('RADOLAN-RV: leeres tar');

  const frames: DecodedRvFrame[] = [];
  let runAtMs = Date.now();
  for (const e of entries) {
    const grid = decodeRadolanRaw(e.data);
    if (grid.leadMinutes === 0) runAtMs = grid.validAt.getTime();
    frames.push({
      leadMinutes: grid.leadMinutes,
      validAtMs: grid.validAt.getTime(),
      values: ratesToValues(grid.rainRate),
      width: grid.cols,
      height: grid.rows,
    });
  }
  frames.sort((a, b) => a.leadMinutes - b.leadMinutes);
  return { runAtMs, frames };
}
