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
import { inflateSync } from 'node:zlib';
import { decodePng } from '../lib/png.mjs';
import { RADAR_IMG_CLUTTER_FILE, radarImgStampToMs } from '../../src/sources/radarImg.ts';
import { clutterStep, clutterSitesCache } from './clutter-step.mjs';
// Phase NC (audit/radar-nowcast-dach.md): the two derived nowcast products — CH extrapolation of the rzc analysis
// (`rzc-nc`, from the mirror's last 3–6 analyses) and the INCA run refined to 5 min (`inca-5m`). Contract and arithmetic
// are the client's modules; the producer only reads the mirror's PNGs and writes PNGs.
import {
  RZC_NC_LEADS, INCA_5M_LEADS, NC_STEP_MIN, RZC_NC_SERIES_MAX, RZC_NC_SERIES_SPAN_MS, NC_FLOW_FACTOR, rzcNcUnknownFile,
  makeRzcNcImgMeta, parseRzcNcImgMeta, makeInca5mImgMeta, parseInca5mImgMeta,
} from '../../src/sources/radarNowcastImg.ts';
import { flowFromSeries, motionStats, advectPlane, betweenPlanes, zeroFlow, NC_TRANSLATION_MAX_COARSE } from '../../src/sources/radarNowcastExtrap.ts';
import { estimateMorphFlow } from '../../src/scalar/radarMorphFlow.ts';
import { RADAR_MORPH_HS } from '../../src/scalar/radarHd.ts';
// Phase NC-B (src/sources/radarNowcastBlend.ts): with `RADAR_NC_BLEND=1` the CH extrapolation frames from +30 min on are a mix
// of the shifted analysis and the model rate (ICON-D2-RUC form `ruc/v1` fitted to the hourly mean of the cube field
// `point/field/v1` of the buscosun Fusion chain), weight linear to 1 at +120 min; `meta.blend` says so. Inputs are read
// from the data repo next to the mirror (walking up from the rzc image root) or, when they are not checked out, from
// raw.githubusercontent. OFF by default = byte-identical to before; any failure leaves the slot a pure translation.
import {
  cellIndexPlane, modelPlanes, blendFrame, RZC_NC_BLEND_WEIGHTS, RZC_NC_BLEND_START_MIN, RZC_NC_BLEND_FULL_MIN, RZC_NC_BLEND_MODEL, RZC_NC_BLEND_PROVENANCE,
} from '../../src/sources/radarNowcastBlend.ts';
import { parseRucManifest, rucLatestPath, rucChunkPath, RUC_CHUNK_WIDTH } from '../../src/point/rucFormat.ts';
import { parseFieldIndex, parseFieldManifest, FIELD_INDEX_PATH, FIELD_MANIFEST_FILE, fieldRunDir, fieldFileName, decodePrecipCumPixel, fieldPixelOffset } from '../../src/point/fieldFormat.ts';
import { TIER_BY_ID } from '../../src/point/cubeFormat.ts';
import { gridNodeFn, projectedSampler } from '../../src/scalar/radarCountryMask.ts';
const NC_BLEND = process.env.RADAR_NC_BLEND === '1';
const NC_BLEND_RAW = process.env.RADAR_NC_BLEND_BASE || 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';

/** Model planes for the 24 leads of a CH extrapolation (null = no blend, with the reason logged). */
async function ncBlendInputs(rzcRoot, analysisAtMs, w, h, corners) {
  let root = null;
  for (let d = rzcRoot, i = 0; i < 7; i++, d = dirname(d)) if (existsSync(join(d, rucLatestPath()))) { root = d; break; }
  const readRel = async (rel) => {
    if (root && existsSync(join(root, rel))) return new Uint8Array(readFileSync(join(root, rel)));
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 30_000);
    try {
      const r = await fetch(`${NC_BLEND_RAW}/${rel}`, { signal: ac.signal, headers: { 'user-agent': 'buscosun-radar-mirror (buscosun-web/audit/radar-nowcast-dach.md)' } });
      if (!r.ok) return null;
      return new Uint8Array(await r.arrayBuffer());
    } finally { clearTimeout(timer); }
  };
  const readJson = async (rel) => { const b = await readRel(rel); return b ? JSON.parse(new TextDecoder().decode(b)) : null; };
  const tier = TIER_BY_ID.t1;
  // RUC: the newest run (`latest.json`), its chunks under the rzc grid
  const ruc = parseRucManifest(await readJson(rucLatestPath()));
  if (!ruc) throw new Error('ruc/v1/latest.json fehlt oder unlesbar');
  if (ruc.runAtMs > analysisAtMs + 3_600_000) throw new Error(`RUC-Lauf ${ruc.run} liegt nach der Analyse`);
  const cells = cellIndexPlane(w, h, projectedSampler(gridNodeFn('rzc', corners)), tier);
  const keys = new Set();
  for (let i = 0; i < cells.length; i++) if (cells[i] >= 0) { const iy = Math.floor(cells[i] / tier.nx), ix = cells[i] % tier.nx; keys.add(`${Math.floor(iy / 16)}_${Math.floor(ix / 16)}`); }
  const chunks = new Map();
  for (const key of keys) {
    const [cy, cx] = key.split('_').map(Number);
    const b = await readRel(rucChunkPath(ruc.run, cy, cx));
    if (!b) continue;
    const p = decodePng(b);
    if (p.channels !== 1 || p.width !== RUC_CHUNK_WIDTH) throw new Error(`RUC-Chunk ${key}: ${p.width}×${p.height}×${p.channels}`);
    chunks.set(key, { cy, cx, width: p.width, height: p.height, data: p.data });
  }
  if (!chunks.size) throw new Error(`kein RUC-Chunk des Laufs ${ruc.run} unter dem rzc-Gitter`);
  // field: the newest t1 run, hourly means from precipcum (C(L) − C(L − 1))
  const idx = parseFieldIndex(await readJson(FIELD_INDEX_PATH));
  const run = idx?.latestByTier?.t1?.run;
  if (!run) throw new Error('point/field/v1/index.json ohne t1-Lauf');
  const fm = parseFieldManifest(await readJson(`${fieldRunDir(run, 't1')}/${FIELD_MANIFEST_FILE}`));
  if (!fm) throw new Error(`field.json des Laufs ${run} unlesbar`);
  const cumByLead = new Map();
  const cumPlane = async (leadH) => {
    if (cumByLead.has(leadH)) return cumByLead.get(leadH);
    const lead = fm.leads.find((l) => l.leadH === leadH);
    const b = lead?.precipcum ? await readRel(`${fieldRunDir(run, 't1')}/${fieldFileName('precipcum', leadH)}`) : null;
    const p = b ? decodePng(b) : null;
    const plane = p && p.channels === 4 && p.width === tier.nx && p.height === tier.ny ? p.data : null;
    cumByLead.set(leadH, plane);
    return plane;
  };
  const H = 3_600_000;
  const hourEnds = [...new Set(RZC_NC_LEADS.map((l) => Math.ceil((analysisAtMs + l * 60_000) / H) * H))];
  for (const hEnd of hourEnds) { const L = (hEnd - fm.runAtMs) / H; if (Number.isInteger(L) && L >= 1) { await cumPlane(L); await cumPlane(L - 1); } }
  const hourMean = (iy, ix, hEnd) => {
    const L = (hEnd - fm.runAtMs) / H;
    if (!Number.isInteger(L) || L < 1) return null;
    const a = cumByLead.get(L), b = cumByLead.get(L - 1);
    if (!a || !b) return null;
    const o = fieldPixelOffset(tier, iy, ix);
    const ca = decodePrecipCumPixel(a[o], a[o + 1], a[o + 2], a[o + 3]), cb = decodePrecipCumPixel(b[o], b[o + 1], b[o + 2], b[o + 3]);
    if (ca == null || cb == null) return null;
    return Math.max(0, (ca - cb) / fm.stepH);
  };
  const mp = modelPlanes({ w, h, cells, tier, analysisAtMs, ruc: { runAtMs: ruc.runAtMs, steps: ruc.steps, chunks }, hourMean });
  const blend = {
    model: RZC_NC_BLEND_MODEL, rucRun: ruc.run, rucRunAtMs: ruc.runAtMs, fieldRun: run, fieldRunAtMs: fm.runAtMs,
    startMin: RZC_NC_BLEND_START_MIN, fullMin: RZC_NC_BLEND_FULL_MIN, weights: [...RZC_NC_BLEND_WEIGHTS],
    cellsModel: mp.cellsModel, cellsTotal: mp.cellsTotal, provenance: RZC_NC_BLEND_PROVENANCE,
  };
  return { planes: mp.planes, blend, kinds: mp.kinds, source: root ? 'lokal' : 'raw' };
}

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
// Phase SE (audit/radar-stoerecho.md §6): mit `RADAR_CLUTTER=1` nimmt der RV-Schritt Echos ohne Niederschlag (Vogelzug,
// Insekten, Restclutter — erkannt am ρHV der Polarscans desselben Niederschlagsscans) aus der Log-Ebene ALLER Frames und legt
// die Maske der Analyse als `clutter.png` in den Slot; der `hd250`-Schritt lässt dieselben Blöcke trocken. Nur zusammen mit
// der nativen Log-Ebene (RADAR_IMG_DUAL + RADAR_LOG_NATIVE, HDF5-Lieferform). Kanal 1, `f`-Frames, `m`-Bilder: byte-gleich.
// Ohne den Schalter byte-gleich zum Stand vor SE; ein Fehler im Filter lässt den Slot ungefiltert (nie ohne Bild).
const CLUTTER = process.env.RADAR_CLUTTER === '1' && DUAL && LOG_NATIVE;

const [source, inPath, outDir, stamp, extra] = process.argv.slice(2);
if (!source || !inPath || !outDir || !stamp) {
  console.error('usage: radar-derive.mjs <rv|inca|rzc|konrad3d> <inPath> <outSlotDir> <stamp>\n       radar-derive.mjs hd250 <rvTar> <rvPastSlotDir> <stamp> [sitesDir]\n       radar-derive.mjs rzc-nc <rzcImgRootDir> <outSlotDir> <stamp>\n       radar-derive.mjs inca-5m <incaSlotDir> <outSlotDir> <stamp>');
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
  // Phase SE: der RV-Schritt desselben Slots hat die Standortbilder schon geholt (`clutterSitesCache`) — von dort lesen,
  // was da ist, den Rest wie bisher vom DWD.
  const siteCache = !sitesDir && CLUTTER && existsSync(clutterSitesCache(stamp)) ? clutterSitesCache(stamp) : '';
  const fetchSite = async (site) => {
    if (sitesDir) {
      const cands = [join(sitesDir, `${site.id}.h5`), join(sitesDir, px250FileName(site, stamp))];
      const hit = cands.find((p) => existsSync(p)) ?? readdirSync(sitesDir).map((f) => join(sitesDir, f)).find((p) => p.endsWith(`-de${site.id}-hd5`));
      if (!hit) return null;
      const b = readFileSync(hit);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
    if (siteCache && existsSync(join(siteCache, `${site.id}.h5`))) {
      const b = readFileSync(join(siteCache, `${site.id}.h5`));
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
      // Phase SE §6.5: zlib von Node statt `DecompressionStream` (51 ms statt ≈ 1 s je Standortbild, dieselben Bytes).
      const g = await decodePx250(bufs[i], { name: `${site.id}.h5`, inflate: (b) => inflateSync(b) });
      if (g.site !== site.id) throw new Error(`Datei nennt Standort ${g.site || '?'}`);
      if (g.timeMs !== rv.validAt.getTime()) throw new Error(`Scanzeit ${new Date(g.timeMs).toISOString()} ≠ Slot`);
      grids.push(g);
    } catch (e) { console.error(`hd250: ${site.id} verworfen (${e.message})`); missing.push(site.id); }
  }
  if (siteCache) rmSync(siteCache, { recursive: true, force: true });
  if (!grids.length) throw new Error('hd250: kein Standortbild lesbar');
  // Phase SE: die Maske der Analyse aus dem RV-Slot desselben Stempels (`rv/<stamp>/clutter.png`, Geschwister von
  // `rv-past/<stamp>`): maskierte 1-km-Blöcke bleiben trocken. Keine Datei (nichts gefunden, Filter aus oder gescheitert)
  // ⇒ wie bisher; eine unlesbare Datei ⇒ wie bisher, benannt.
  let clutterBlocks;
  if (CLUTTER) {
    const maskPath = join(outDir, '..', '..', 'rv', stamp, RADAR_IMG_CLUTTER_FILE);
    clutterBlocks = 0;
    if (existsSync(maskPath)) {
      try {
        const m = decodePng(readFileSync(maskPath));
        if (m.width !== 1100 || m.height !== 1200 || m.channels !== 1) throw new Error(`Maske ${m.width}×${m.height}×${m.channels}`);
        for (let k = 0; k < m.data.length; k++) if (m.data[k] && rv.rainRate[k] >= RADAR_DISPLAY_MIN_MMH - 1e-6) { rv.rainRate[k] = 0; clutterBlocks++; }
      } catch (e) { console.error(`hd250: Störecho-Maske unlesbar (${e.message}) — Kacheln ungefiltert`); clutterBlocks = undefined; }
    }
  }
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
  const meta = makeHd250Meta(stamp, rv.validAt.getTime(), grids.map((g) => g.site), missing, field, metaTiles, LOG_NATIVE ? { displayMin: RADAR_DISPLAY_MIN_MMH, ...(clutterBlocks !== undefined ? { clutterBlocks } : {}) } : undefined);
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
function dualFrames(frames, rvNative = false, clutter = undefined) {
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
  return makeRadarImgDual(out, rvNative ? { ...dualExtra, ...(clutter ? { clutter } : {}) } : undefined);
}

// Phase NC: the two derived products read a DIRECTORY of the mirror's PNGs (no raw file).
const raw = source === 'rzc-nc' || source === 'inca-5m' ? Buffer.alloc(0) : readFileSync(inPath);
const rawBuf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);

if (source === 'rv') {
  // EX-3: beide Lieferformen des DWD, am INHALT erkannt — `composite_rv_*.tar` (ODIM-HDF5, nacktes Tar)
  // und bis 2026-10-20 `DE1200_RV*.tar.bz2` (RADOLAN-Binär).
  const tar = isBz2(raw) ? await decompressBz2(raw) : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const hdf5 = rvTarIsHdf5(tar);
  const run = hdf5 ? await decodeRvHdf5Tar(tar, secondary) : decodeRvTar(tar, secondary);
  const metaFrames = pngFrames(run.frames.map((f) => ({ ...f, lead: f.leadMinutes })));
  // Phase SE: der Filter arbeitet auf KOPIEN der Log-Ebenen und ersetzt sie erst nach Erfolg — ein Fehler mitten im Schritt
  // hinterlässt keinen halb gefilterten Slot.
  let clutterMeta;
  if (CLUTTER && hdf5) {
    try {
      const planes = run.frames.map((f) => f.values2.slice());
      const res = await clutterStep({ stamp, slotMs: run.runAtMs, planes, leads: run.frames.map((f) => f.leadMinutes) });
      run.frames.forEach((f, i) => { f.values2 = planes[i]; });
      if (res.png) put(RADAR_IMG_CLUTTER_FILE, res.png);
      clutterMeta = res.clutter;
      console.error(`clutter: ${res.clutter.cells} von ${res.clutter.wet} Zellen aus der Log-Ebene (${res.clutter.sites} Standorte mit Scan${res.clutter.missing.length ? `, ohne: ${res.clutter.missing.join(',')}` : ''}) in ${res.ms} ms`);
    } catch (e) { console.error(`clutter: Slot ungefiltert (${e.message})`); }
  }
  const dual = dualFrames(run.frames.map((f) => ({ ...f, lead: f.leadMinutes })), hdf5 && LOG_NATIVE, clutterMeta);
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
} else if (source === 'rzc-nc') {
  // Phase NC: inPath = the mirror's rzc image root (`img/rzc/`). The series = the slots ≤ stamp within 30 min, the newest
  // = stamp (its `g000.png` when the slot carries the log plane, else `frame.png`).
  const slots = readdirSync(inPath).filter((f) => /^\d{8}T\d{4}$/.test(f) && !f.includes('.tmp-'))
    .map((s) => ({ s, ms: radarImgStampToMs(s) }))
    .filter((x) => Number.isFinite(x.ms) && x.ms <= radarImgStampToMs(stamp) && x.ms >= radarImgStampToMs(stamp) - RZC_NC_SERIES_SPAN_MS)
    .sort((a, b) => a.ms - b.ms).slice(-RZC_NC_SERIES_MAX);
  if (!slots.length || slots[slots.length - 1].s !== stamp) throw new Error(`rzc-nc: Analyse ${stamp} liegt nicht im Bestand`);
  const read = (s) => {
    const dir = join(inPath, s);
    const meta = parseRzcImgMeta(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')));
    if (!meta) throw new Error(`rzc-nc: ${s}/meta.json unlesbar`);
    const dualFile = meta.dual?.frames[0]?.file;
    if (dualFile && existsSync(join(dir, dualFile))) {
      const g = decodePng(readFileSync(join(dir, dualFile)));
      if (g.width !== meta.width || g.height !== meta.height || g.channels !== 2) throw new Error(`rzc-nc: ${s}/${dualFile} ${g.width}×${g.height}×${g.channels}`);
      const values = new Uint8Array(g.width * g.height), values2 = new Uint8Array(g.width * g.height);
      for (let i = 0; i < values.length; i++) { values[i] = g.data[i * 2]; values2[i] = g.data[i * 2 + 1]; }
      return { meta, values, values2 };
    }
    const f = decodePng(readFileSync(join(dir, 'frame.png')));
    if (f.width !== meta.width || f.height !== meta.height || f.channels !== 1) throw new Error(`rzc-nc: ${s}/frame.png ${f.width}×${f.height}×${f.channels}`);
    return { meta, values: f.data, values2: undefined };
  };
  const series = slots.map((x) => read(x.s));
  const newest = series[series.length - 1];
  const { width: w, height: h } = newest.meta;
  if (!series.every((x) => x.meta.width === w && x.meta.height === h)) throw new Error('rzc-nc: Gittermaße der Serie ungleich');
  const factor = NC_FLOW_FACTOR.rzc;
  const { flow, pairs } = series.length >= 2 ? flowFromSeries(series.map((x) => x.values), w, h, factor) : { flow: zeroFlow(w, h, factor), pairs: 0 };
  const motion = motionStats(flow, newest.values, w, h, NC_STEP_MIN, pairs);
  const analysisAtMs = newest.meta.validAtMs ?? radarImgStampToMs(stamp);
  // Phase NC-B: model planes per lead (null = pure translation, as before)
  let nb = null;
  if (NC_BLEND) {
    try { nb = await ncBlendInputs(inPath, analysisAtMs, w, h, newest.meta.corners); }
    catch (e) { console.error(`rzc-nc: Modell-Mischung ausgelassen — ${e.message}`); }
  }
  const frames = [], unknownRows = [], dualRows = [];
  const buf = new Uint8Array(w * h), buf2 = newest.values2 ? new Uint8Array(w * h) : null, ubuf = new Uint8Array(w * h);
  const mix = nb ? new Uint8Array(w * h) : null, mix2 = nb && buf2 ? new Uint8Array(w * h) : null;
  let changed = 0;
  for (const [li, lead] of RZC_NC_LEADS.entries()) {
    const k = lead / NC_STEP_MIN;
    advectPlane(newest.values, w, h, flow, k, buf, ubuf);
    if (buf2) advectPlane(newest.values2, w, h, flow, k, buf2);
    if (nb && RZC_NC_BLEND_WEIGHTS[li] > 0) {
      changed += blendFrame({ w: RZC_NC_BLEND_WEIGHTS[li], radar: buf, radarLog: buf2, model: nb.planes[li], unknown: ubuf, out: mix, outLog: mix2 });
      buf.set(mix); if (buf2) buf2.set(mix2);
    }
    const fpng = encodePng(w, h, buf, 1);
    const ffile = radarImgFrameFile(lead);
    put(ffile, fpng);
    frames.push({ lead, file: ffile, bytes: fpng.length, validAtMs: analysisAtMs + lead * 60_000 });
    const upng = encodePng(w, h, ubuf, 1);
    const ufile = rzcNcUnknownFile(lead);
    put(ufile, upng);
    unknownRows.push({ lead, file: ufile, bytes: upng.length });
    if (buf2) {
      const inter = new Uint8Array(w * h * 2);
      for (let i = 0; i < buf.length; i++) { inter[i * 2] = buf[i]; inter[i * 2 + 1] = buf2[i]; }
      const gpng = encodePng(w, h, inter, 2);
      const gfile = radarImgDualFile(lead);
      put(gfile, gpng);
      dualRows.push({ lead, file: gfile, bytes: gpng.length });
    }
  }
  const meta = makeRzcNcImgMeta({
    stamp, analysisAtMs, corners: newest.meta.corners, frames, unknown: unknownRows, series: slots.map((x) => x.s), motion,
    // V-NC-7: one translation per pair (correlation shift), not the Horn–Schunck field — see radarNowcastExtrap.ts
    method: { flow: 'translation', factor, maxCoarse: NC_TRANSLATION_MAX_COARSE, sampling: 'wet-bilinear-round' },
    ...(buf2 ? { dual: makeRadarImgDual(dualRows) } : {}),
    ...(nb ? { blend: nb.blend } : {}),
  });
  if (!parseRzcNcImgMeta(JSON.parse(JSON.stringify(meta)))) throw new Error('rzc-nc: eigene meta.json besteht den Client-Prüfer nicht');
  put('meta.json', JSON.stringify(meta) + '\n');
  console.error(`rzc-nc: ${series.length} Analysen, ${pairs} Paare, ${motion.speedKmh} km/h aus ${motion.fromDeg ?? '—'}°, ${motion.wetCells} nasse Zellen`
    + (nb ? ` · Mischung mit buscosun Fusion (RUC ${nb.blend.rucRun}, Feld ${nb.blend.fieldRun}, ${nb.source}): ${nb.blend.cellsModel}/${nb.blend.cellsTotal} Zellen, Stunden ${JSON.stringify(nb.kinds)}, ${changed} Pixel geändert` : ''));
} else if (source === 'inca-5m') {
  // Phase NC: inPath = the mirror's INCA slot (`img/inca/<stamp>/`): the run's frames, refined to 5 min along the motion.
  const meta0 = parseIncaImgMeta(JSON.parse(readFileSync(join(inPath, 'meta.json'), 'utf8')));
  if (!meta0 || meta0.stamp !== stamp) throw new Error(`inca-5m: ${stamp}/meta.json unlesbar oder fremder Stempel`);
  const { width: w, height: h } = meta0;
  const dualOf = meta0.dual ? new Map(meta0.dual.frames.map((d) => [d.lead, d.file])) : null;
  const src = meta0.frames.map((f) => {
    const g = dualOf?.get(f.lead);
    if (g && existsSync(join(inPath, g))) {
      const d = decodePng(readFileSync(join(inPath, g)));
      if (d.width !== w || d.height !== h || d.channels !== 2) throw new Error(`inca-5m: ${g} ${d.width}×${d.height}×${d.channels}`);
      const values = new Uint8Array(w * h), values2 = new Uint8Array(w * h);
      for (let i = 0; i < values.length; i++) { values[i] = d.data[i * 2]; values2[i] = d.data[i * 2 + 1]; }
      return { lead: f.lead, values, values2 };
    }
    const d = decodePng(readFileSync(join(inPath, f.file)));
    if (d.width !== w || d.height !== h || d.channels !== 1) throw new Error(`inca-5m: ${f.file} ${d.width}×${d.height}×${d.channels}`);
    return { lead: f.lead, values: d.data, values2: undefined };
  });
  const allDual = src.every((f) => !!f.values2);
  const factor = NC_FLOW_FACTOR.inca;
  const refAtMs = radarImgStampToMs(stamp);
  const frames = [], dualRows = [];
  const emit = (lead, values, values2, kind) => {
    const fpng = encodePng(w, h, values, 1);
    const ffile = radarImgFrameFile(lead);
    put(ffile, fpng);
    frames.push({ lead, file: ffile, bytes: fpng.length, validAtMs: refAtMs + lead * 60_000, kind });
    if (allDual) {
      const inter = new Uint8Array(w * h * 2);
      for (let i = 0; i < values.length; i++) { inter[i * 2] = values[i]; inter[i * 2 + 1] = values2[i]; }
      const gpng = encodePng(w, h, inter, 2);
      const gfile = radarImgDualFile(lead);
      put(gfile, gpng);
      dualRows.push({ lead, file: gfile, bytes: gpng.length });
    }
  };
  const buf = new Uint8Array(w * h), buf2 = allDual ? new Uint8Array(w * h) : null;
  let pairs = 0;
  for (let i = 0; i < src.length; i++) {
    const a = src[i];
    emit(a.lead, a.values, a.values2, 'inca');
    const b = src[i + 1];
    if (!b || b.lead - a.lead !== 15) continue;   // a gap in the run: no in-between pictures across it
    const flow = estimateMorphFlow(a.values, b.values, w, h, factor);
    pairs++;
    for (const lead of [a.lead + NC_STEP_MIN, a.lead + 2 * NC_STEP_MIN]) {
      const frac = (lead - a.lead) / 15;
      betweenPlanes(a.values, b.values, w, h, flow, frac, buf);
      if (buf2) betweenPlanes(a.values2, b.values2, w, h, flow, frac, buf2);
      emit(lead, buf, buf2, 'between');
    }
  }
  if (!frames.every((f) => INCA_5M_LEADS.includes(f.lead))) throw new Error('inca-5m: Lead außerhalb des Rasters');
  const meta = makeInca5mImgMeta({
    stamp, refAtMs, corners: meta0.corners, frames,
    method: { flow: 'horn-schunck', factor, alpha: RADAR_MORPH_HS.alpha, iters: RADAR_MORPH_HS.iters, between: 'advect-both-round' },
    ...(allDual ? { dual: makeRadarImgDual(dualRows) } : {}),
  });
  if (!parseInca5mImgMeta(JSON.parse(JSON.stringify(meta)))) throw new Error('inca-5m: eigene meta.json besteht den Client-Prüfer nicht');
  put('meta.json', JSON.stringify(meta) + '\n');
  console.error(`inca-5m: ${src.length} INCA-Frames → ${frames.length} Frames (${pairs} Paare)`);
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
