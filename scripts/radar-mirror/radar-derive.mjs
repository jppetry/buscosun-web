#!/usr/bin/env node
/**
 * RD3 — Derive-Schritt des Radar-Spiegels: EINE Quelldatei → fertig aufbereitete Dateien
 * (`audit/radar-datenrepo.md` §14). Wird je Slot vom Spiegel (`radar-mirror.mjs` im
 * Daten-Repo) als KINDPROZESS gespawnt — ein Derive-Fehler nimmt nur die Bild-Ablage,
 * nie den Roh-Push. Läuft aus dem buscosun-web-Klon (APP_DIR des Workflows), damit die
 * DECODER DES CLIENTS die Bytes erzeugen (BW-1-Regel: byte-identisch per Konstruktion):
 *   rv        DE1200_RV<stamp>.tar.bz2 → 25 Graustufen-PNGs (precipToU8-Bytes) + meta.json
 *   inca      GeoSphere-NetCDF         → 12 PNGs + meta.json (Ecken aus der Datei)
 *   rzc       MeteoSwiss-ODIM-HDF5     → frame.png + meta.json
 *   konrad3d  KONRAD3D_<stamp>.xml     → cells.json ({schema:1, run: parseKonrad3d(...)})
 *
 * Aufruf: node --experimental-strip-types --import <app>/scripts/lib/register-ts.mjs \
 *           <app>/scripts/radar-mirror/radar-derive.mjs <quelle> <inPfad> <outSlotDir> <stamp>
 * Schreibt atomar (tmp-Verzeichnis + rename) und druckt EINE JSON-Zeile:
 *   {"ok":true,"files":26,"bytes":808960,"ms":1871}
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { decompressBz2 } from '../lib/bz2.mjs';
import { encodePng } from '../lib/png.mjs';
import { decodeRvTar } from '../../src/sources/radolanDecode.ts';
import { parseIncaNetcdf } from '../../src/sources/incaParse.ts';
import { parseRzcHdf5 } from '../../src/sources/rzcParse.ts';
import { parseKonrad3d } from '../../src/radar/konrad3d.ts';
import {
  makeRvImgMeta, makeIncaImgMeta, makeRzcImgMeta, radarImgFrameFile,
  parseRvImgMeta, parseIncaImgMeta, parseRzcImgMeta,
} from '../../src/sources/radarImg.ts';

const [source, inPath, outDir, stamp] = process.argv.slice(2);
if (!source || !inPath || !outDir || !stamp) {
  console.error('usage: radar-derive.mjs <rv|inca|rzc|konrad3d> <inPath> <outSlotDir> <stamp>');
  process.exit(2);
}

const t0 = Date.now();
const out = { files: 0, bytes: 0 };
const tmp = `${outDir}.tmp-${process.pid}`;
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const put = (name, data) => {
  writeFileSync(join(tmp, name), data);
  out.files++;
  out.bytes += data.length;
};

function pngFrames(frames) {
  const metaFrames = [];
  for (const f of frames) {
    const png = encodePng(f.width, f.height, f.values, 1);
    const file = radarImgFrameFile(f.lead);
    put(file, png);
    metaFrames.push({ lead: f.lead, file, bytes: png.length, ...(Number.isFinite(f.validAtMs) ? { validAtMs: f.validAtMs } : {}) });
  }
  return metaFrames;
}

const raw = readFileSync(inPath);
const rawBuf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);

if (source === 'rv') {
  const run = decodeRvTar(await decompressBz2(raw));
  const metaFrames = pngFrames(run.frames.map((f) => ({ ...f, lead: f.leadMinutes })));
  const meta = makeRvImgMeta(stamp, run.runAtMs, metaFrames);
  if (!parseRvImgMeta(JSON.parse(JSON.stringify(meta)))) throw new Error('rv: eigene meta.json besteht den Client-Prüfer nicht');
  put('meta.json', JSON.stringify(meta) + '\n');
} else if (source === 'inca') {
  const parsed = parseIncaNetcdf(rawBuf);
  const metaFrames = pngFrames(parsed.frames.map((f) => ({ ...f, lead: Math.round(f.leadHours * 60) })));
  const meta = makeIncaImgMeta(stamp, Date.now(), parsed.corners, metaFrames);
  if (!parseIncaImgMeta(JSON.parse(JSON.stringify(meta)))) throw new Error('inca: eigene meta.json besteht den Client-Prüfer nicht');
  put('meta.json', JSON.stringify(meta) + '\n');
} else if (source === 'rzc') {
  const parsed = parseRzcHdf5(rawBuf);
  const png = encodePng(parsed.width, parsed.height, parsed.values, 1);
  put('frame.png', png);
  const meta = makeRzcImgMeta(stamp, parsed.validAtMs, parsed.corners, png.length);
  if (!parseRzcImgMeta(JSON.parse(JSON.stringify(meta)))) throw new Error('rzc: eigene meta.json besteht den Client-Prüfer nicht');
  put('meta.json', JSON.stringify(meta) + '\n');
} else if (source === 'konrad3d') {
  const run = parseKonrad3d(new TextDecoder().decode(raw), `KONRAD3D_${stamp}.xml`);
  put('cells.json', JSON.stringify({ schema: 1, run }) + '\n');
} else {
  throw new Error(`unbekannte Quelle ${source}`);
}

// Windows: rename auf ein Verzeichnis scheitert sporadisch mit EPERM (Handles/AV) —
// Parent sicherstellen, kurz wiederholen, notfalls kopieren.
mkdirSync(dirname(outDir), { recursive: true });
rmSync(outDir, { recursive: true, force: true });
let renamed = false;
for (let i = 0; i < 5 && !renamed; i++) {
  try { renameSync(tmp, outDir); renamed = true; } catch { await new Promise((r) => setTimeout(r, 100)); }
}
if (!renamed) { cpSync(tmp, outDir, { recursive: true }); rmSync(tmp, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, files: out.files, bytes: out.bytes, ms: Date.now() - t0 }));
