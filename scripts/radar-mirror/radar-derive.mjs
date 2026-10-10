#!/usr/bin/env node
/**
 * RD3 — Derive-Schritt des Radar-Spiegels: EINE Quelldatei → fertig aufbereitete Dateien
 * (`audit/radar-datenrepo.md` §14). Wird je Slot vom Spiegel (`radar-mirror.mjs` im
 * Daten-Repo) als KINDPROZESS gespawnt — ein Derive-Fehler nimmt nur die Bild-Ablage,
 * nie den Roh-Push. Läuft aus dem buscosun-web-Klon (APP_DIR des Workflows), damit die
 * DECODER DES CLIENTS die Bytes erzeugen (BW-1-Regel: byte-identisch per Konstruktion):
 *   rv        composite_rv_<JJJJMMTT>_<HHMM>.tar (HDF5) oder DE1200_RV<stamp>.tar.bz2 (bis 2026-10-20)
 *                                      → 25 Graustufen-PNGs (precipToU8-Bytes) + meta.json
 *                                        + E-AX-16: je volle Stunde nach dem Slot ein Summenbild m<lead>.png (RGB,
 *                                        Stundenmittel der Frames im Fenster (t − 60 min, t], ≥ 6 Frames; meta.hourMeans)
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
import { decodeRvTar, isBz2, rvTarIsHdf5 } from '../../src/sources/radolanDecode.ts';
import { decodeRvHdf5Tar } from '../../src/sources/rvHdf5.ts';
import { parseIncaNetcdf } from '../../src/sources/incaParse.ts';
import { parseRzcHdf5 } from '../../src/sources/rzcParse.ts';
import { parseKonrad3d } from '../../src/radar/konrad3d.ts';
import {
  makeRvImgMeta, makeIncaImgMeta, makeRzcImgMeta, radarImgFrameFile, radarImgDualFile, makeRadarImgDual,
  parseRvImgMeta, parseIncaImgMeta, parseRzcImgMeta,
} from '../../src/sources/radarImg.ts';
import { rvHourMeanPlan, rvHourMeanImage, rvHourMeanMeta } from '../../src/sources/radarImgHourMean.ts';
import { precipToU8Log } from '../../src/scalar/RainLayer.ts';
import { RADAR_DISPLAY_MIN_MMH } from '../../src/scalar/radarHd.ts';
import { untar } from '../../src/sources/radolanDecode.ts';
import { decodeRvHdf5, isHdf5 } from '../../src/sources/rvHdf5.ts';
import { PX250_SITES, px250FileName, px250Url, decodePx250 } from '../../src/sources/dwdPx250.ts';
import {
  compositePx250, anchorToRv, hd250Tiles, makeHd250Meta, parseHd250Meta, hd250TileFile, HD250_META_FILE, HD250_TILE_W, HD250_TILE_H,
} from '../../src/sources/radarHd250.ts';
import { readdirSync, existsSync } from 'node:fs';

// Phase HD-3 (audit/radar-hochaufloesung.md §5, E-HD-3): mit `RADAR_IMG_DUAL=1` je Frame zusätzlich `g<lead>.png`
// (Grau + Alpha: Kanal 1 = derselbe `precipToU8`-Byte wie `f<lead>.png`, Kanal 2 = `precipToU8Log`) und `meta.dual`.
// Ohne den Schalter byte-gleich (keine zweite Quantisierung, keine Datei mehr).
const DUAL = process.env.RADAR_IMG_DUAL === '1';
// Phase RG (audit/radar-regenschwelle.md §6, E-RG-1…3 Jan 10.10.2026): mit `RADAR_LOG_NATIVE=1` wird die Log-Ebene (Kanal 2 der
// `g`-Frames) aus den NATIVEN RV-Werten gebaut statt aus den angehobenen RADOLAN-Einheiten — erst so greift ihre Untergrenze
// 0,06 mm/h = die an Stationen gemessene Darstellungsschwelle (`RADAR_DISPLAY_MIN_MMH`); die 250-m-Kacheln werden auf den nativen
// Werten verankert, Blöcke unter der Schwelle bleiben trocken. Kanal 1, `f`-Frames, `m`-Bilder: byte-gleich. Ohne den Schalter
// byte-gleich zum Stand vor RG. Gilt nur für die HDF5-Lieferform (das Altformat trägt keine feinen Werte).
const LOG_NATIVE = process.env.RADAR_LOG_NATIVE === '1';
const secondary = DUAL ? { secondary: precipToU8Log, ...(LOG_NATIVE ? { secondaryUnits: 'native' } : {}) } : {};
const dualExtra = DUAL && LOG_NATIVE ? { native: true, displayMin: RADAR_DISPLAY_MIN_MMH } : undefined;

const [source, inPath, outDir, stamp, extra] = process.argv.slice(2);
if (!source || !inPath || !outDir || !stamp) {
  console.error('usage: radar-derive.mjs <rv|inca|rzc|konrad3d> <inPath> <outSlotDir> <stamp>\n       radar-derive.mjs hd250 <rvTar> <rvPastSlotDir> <stamp> [sitesDir]');
  process.exit(2);
}

const t0 = Date.now();

// Phase R250 (audit/radar-250m.md §5 R250-3): `hd250` adds the 250-m tiles + `hd250.json` to an EXISTING rv-past slot
// directory (it holds `f000.png` already). Inputs: the RV tar of the slot (anchor = lead 0, HDF5 form) and the 17 px250
// site images — read from `sitesDir` (files `<site>.h5` or the DWD names) or downloaded from the DWD for this slot.
// Writes the tiles first and the meta LAST (the client reads only listed tiles); nothing else in the slot is touched.
if (source === 'hd250') {
  const tar = readFileSync(inPath);
  const tarBytes = new Uint8Array(tar.buffer, tar.byteOffset, tar.byteLength);
  const e0 = untar(tarBytes).find((e) => /_000-hd5$/.test(e.name));
  if (!e0 || !isHdf5(e0.data)) throw new Error('hd250: RV-Tar ohne HDF5-Analyse (_000-hd5) — nur die HDF5-Lieferform trägt den Anker');
  // Phase RG: mit RADAR_LOG_NATIVE die nativen Werte als Anker (Blockmittel = feiner Wert, Schwelle `RADAR_DISPLAY_MIN_MMH`).
  const rv = await decodeRvHdf5(e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength), { name: e0.name, ...(LOG_NATIVE ? { units: 'native' } : {}) });
  if (rv.leadMinutes !== 0) throw new Error(`hd250: Analyse trägt Vorlauf ${rv.leadMinutes}`);
  const sitesDir = extra || '';
  const fetchSite = async (site) => {
    if (sitesDir) {
      const cands = [join(sitesDir, `${site.id}.h5`), join(sitesDir, px250FileName(site, stamp))];
      const hit = cands.find((p) => existsSync(p)) ?? readdirSync(sitesDir).map((f) => join(sitesDir, f)).find((p) => p.endsWith(`-de${site.id}-hd5`));
      if (!hit) return null;
      const b = readFileSync(hit);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);
    try {
      const r = await fetch(px250Url(site, stamp), { signal: ac.signal, headers: { 'user-agent': 'buscosun-radar-mirror (buscosun-web/audit/radar-250m.md)' } });
      if (!r.ok) return null;
      return await r.arrayBuffer();
    } catch { return null; } finally { clearTimeout(timer); }
  };
  const bufs = await Promise.all(PX250_SITES.map(fetchSite));
  const grids = [], missing = [];
  for (let i = 0; i < PX250_SITES.length; i++) {
    const site = PX250_SITES[i];
    if (!bufs[i]) { missing.push(site.id); continue; }
    try {
      const g = await decodePx250(bufs[i], { name: `${site.id}.h5` });
      if (g.site !== site.id) throw new Error(`Datei nennt Standort ${g.site || '?'}`);
      if (g.timeMs !== rv.validAt.getTime()) throw new Error(`Scanzeit ${new Date(g.timeMs).toISOString()} ≠ Slot`);
      grids.push(g);
    } catch (e) { console.error(`hd250: ${site.id} verworfen (${e.message})`); missing.push(site.id); }
  }
  if (!grids.length) throw new Error('hd250: kein Standortbild lesbar');
  const comp = compositePx250(grids);
  const field = anchorToRv(rv.rainRate, comp, LOG_NATIVE ? { minRate: RADAR_DISPLAY_MIN_MMH } : {});
  const tiles = hd250Tiles(field.rate);
  mkdirSync(outDir, { recursive: true });
  const metaTiles = [];
  let files = 0, bytes = 0;
  for (const t of tiles) {
    if (!t.wet) continue;
    const png = encodePng(HD250_TILE_W, HD250_TILE_H, t.data, 1);
    const file = hd250TileFile(t.tx, t.ty);
    writeFileSync(join(outDir, file), png);
    files++; bytes += png.length;
    metaTiles.push({ tx: t.tx, ty: t.ty, file, bytes: png.length });
  }
  const meta = makeHd250Meta(stamp, rv.validAt.getTime(), grids.map((g) => g.site), missing, field, metaTiles, LOG_NATIVE ? { displayMin: RADAR_DISPLAY_MIN_MMH } : undefined);
  if (!parseHd250Meta(JSON.parse(JSON.stringify(meta)))) throw new Error('hd250: eigene hd250.json besteht den Client-Prüfer nicht');
  writeFileSync(join(outDir, HD250_META_FILE), JSON.stringify(meta) + '\n');
  files++;
  console.log(JSON.stringify({ ok: true, files, bytes, ms: Date.now() - t0, tiles: metaTiles.length, sites: grids.length, missing, blocks: meta.blocks }));
  process.exit(0);
}
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

/** HD-3: die Dual-PNGs (2 Kanäle verschränkt) je Frame — `undefined` ohne Schalter. */
function dualFrames(frames, rvNative = false) {
  if (!DUAL) return undefined;
  const out = [];
  for (const f of frames) {
    if (!f.values2) throw new Error('dual: Decoder lieferte keine zweite Ebene');
    const inter = new Uint8Array(f.values.length * 2);
    for (let i = 0; i < f.values.length; i++) { inter[i * 2] = f.values[i]; inter[i * 2 + 1] = f.values2[i]; }
    const png = encodePng(f.width, f.height, inter, 2);
    const file = radarImgDualFile(f.lead);
    put(file, png);
    out.push({ lead: f.lead, file, bytes: png.length });
  }
  return makeRadarImgDual(out, rvNative ? dualExtra : undefined);
}

const raw = readFileSync(inPath);
const rawBuf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);

if (source === 'rv') {
  // EX-3: beide Lieferformen des DWD, am INHALT erkannt — `composite_rv_*.tar` (ODIM-HDF5, nacktes Tar)
  // und bis 2026-10-20 `DE1200_RV*.tar.bz2` (RADOLAN-Binär).
  const tar = isBz2(raw) ? await decompressBz2(raw) : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const hdf5 = rvTarIsHdf5(tar);
  const run = hdf5 ? await decodeRvHdf5Tar(tar, secondary) : decodeRvTar(tar, secondary);
  const metaFrames = pngFrames(run.frames.map((f) => ({ ...f, lead: f.leadMinutes })));
  const dual = dualFrames(run.frames.map((f) => ({ ...f, lead: f.leadMinutes })), hdf5 && LOG_NATIVE);
  // E-AX-16 (audit/fusion-ausbau.md §6m): je volle Stunde nach dem Slot das Summenbild der Frames im Fenster (t − 60 min, t]
  // als `m<lead>.png` (RGB: Summe der Rohbytes + Zahl der gesättigten Frames) — aus DENSELBEN Bytes wie die Frame-PNGs.
  const byLead = new Map(run.frames.map((f) => [f.leadMinutes, f]));
  const hourMeans = rvHourMeanPlan(run.frames.map((f) => f.leadMinutes), run.runAtMs).map((entry) => {
    const frames = entry.leads.map((l) => byLead.get(l).values);
    const first = byLead.get(entry.leads[0]);
    const png = encodePng(first.width, first.height, rvHourMeanImage(frames, first.width, first.height), 3);
    const hm = rvHourMeanMeta(entry, png.length);
    put(hm.file, png);
    return hm;
  });
  const meta = makeRvImgMeta(stamp, run.runAtMs, metaFrames, hourMeans, dual);
  if (!parseRvImgMeta(JSON.parse(JSON.stringify(meta)))) throw new Error('rv: eigene meta.json besteht den Client-Prüfer nicht');
  put('meta.json', JSON.stringify(meta) + '\n');
} else if (source === 'inca') {
  const parsed = parseIncaNetcdf(rawBuf, secondary);
  const metaFrames = pngFrames(parsed.frames.map((f) => ({ ...f, lead: Math.round(f.leadHours * 60) })));
  const dual = dualFrames(parsed.frames.map((f) => ({ ...f, lead: Math.round(f.leadHours * 60) })));
  const meta = makeIncaImgMeta(stamp, Date.now(), parsed.corners, metaFrames, dual);
  if (!parseIncaImgMeta(JSON.parse(JSON.stringify(meta)))) throw new Error('inca: eigene meta.json besteht den Client-Prüfer nicht');
  put('meta.json', JSON.stringify(meta) + '\n');
} else if (source === 'rzc') {
  const parsed = parseRzcHdf5(rawBuf, secondary);
  const png = encodePng(parsed.width, parsed.height, parsed.values, 1);
  put('frame.png', png);
  const dual = dualFrames([{ ...parsed, lead: 0 }]);
  const meta = makeRzcImgMeta(stamp, parsed.validAtMs, parsed.corners, png.length, dual);
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
