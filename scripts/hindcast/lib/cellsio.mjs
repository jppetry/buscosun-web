/**
 * cellsio.mjs — reading the cell files of the hindcast (cells.mjs output) and the HCV1 cache files
 * (extract_openmeteo.py / extract_dynamical.py output). Node side of the cache format; no network.
 */
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { HINDCAST_ROOT } from './common.mjs';

export function loadTierCells(tierId, root = HINDCAST_ROOT) {
  return JSON.parse(readFileSync(join(root, 'cells', `${tierId}.json`), 'utf8'));
}

/** Extract list of a grid with a key → index map. */
export function loadExtract(grid, root = HINDCAST_ROOT) {
  const doc = JSON.parse(readFileSync(join(root, 'cells', `extract-${grid}.json`), 'utf8'));
  const idx = new Map(doc.cells.map(([r, c], k) => [`${r}_${c}`, k]));
  return { ...doc, idx };
}

/**
 * HCV1: gzip( 'HCV1' · u32 LE header length · header JSON · data ). dtype int16 (Open-Meteo, value = q / scale +
 * offset, −32768 missing) or float32 (dynamical, NaN missing), shape [n cells, nt] (+ members for ENS: [n, m, nt]).
 */
export function readHcv(path) {
  const raw = gunzipSync(readFileSync(path));
  if (raw.toString('latin1', 0, 4) !== 'HCV1') throw new Error(`${path}: not HCV1`);
  const hl = raw.readUInt32LE(4);
  const header = JSON.parse(raw.toString('utf8', 8, 8 + hl));
  const off = 8 + hl;
  const dtype = header.dtype ?? 'int16';
  // copy into an aligned buffer (the payload starts at an arbitrary byte offset); x86/ARM hosts are little-endian
  const ab = raw.buffer.slice(raw.byteOffset + off, raw.byteOffset + raw.length);
  let data;
  if (dtype === 'int16') data = new Int16Array(ab);
  else if (dtype === 'float32') data = new Float32Array(ab);
  else throw new Error(`${path}: dtype ${dtype}`);
  return { header, data };
}

/** Physical value of cell k at time index t (int16 cache: q / scale + offset; −32768 ⇒ null). */
export function hcvValue(h, k, t) {
  const nt = h.header.nt;
  const q = h.data[k * nt + t];
  if ((h.header.dtype ?? 'int16') === 'int16') return q === -32768 ? null : q / h.header.scale + (h.header.offset ?? 0);
  return Number.isFinite(q) ? q : null;
}

export function cachePath(model, variable, route, key, root = HINDCAST_ROOT) {
  return join(root, 'cache', model, variable, route, `${key}.hcv.gz`);
}
export const hasCache = (p) => existsSync(p);
