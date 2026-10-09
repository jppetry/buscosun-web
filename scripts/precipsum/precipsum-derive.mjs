#!/usr/bin/env node
/**
 * Phase NS, Stufe B2/B3 (E-NS-1/2) — gemessene Niederschlagssummen 1/3/6/12/24/48 h als Flächen für `/regenradar`
 * (`buscosun-data/precipsum/v1/`, Vertrag `src/precipSums/pastSumFormat.ts`, `audit/niederschlagssummen.md` §11).
 *
 * Je Lauf:
 *   1. Ende E = die jüngste volle UTC-Stunde, für die RADOLAN RW vorliegt (DE trägt die größte Fläche; AT/CH ohne ihre
 *      Stunde E sind in diesem Lauf eine benannte Lücke, der nächste Lauf füllt sie in einem NEUEN Ordner).
 *   2. Stundenfelder E − 47 h … E je Quelle: RW (DWD, eine Datei je Stunde), CombiPrecip (MeteoSchweiz STAC, eine Datei
 *      je Stunde), INCA-Analyse (GeoSphere, EIN Bereichsabruf für alle fehlenden Stunden — Rate-Limit 240/h, der
 *      Radar-Spiegel braucht ≈ 80/h). Jede Stunde wird einmal auf das DACH-Gitter G gelegt (nächstes Quellpixel, dieselbe
 *      Index-Map wie die Niederschlagskarte) und im Cache gehalten (`--cache`, im Workflow `actions/cache`); ohne Cache
 *      lädt der Lauf alles neu — das Ergebnis hängt nicht am Cache.
 *   3. Je Fenster die Summe je Zelle in der Quelle ihres Landes (`countryRowPicker` wie die Karte); eine fehlende Stunde
 *      ⇒ Lücke (nie 0, nie Teilsumme). PNG je Fenster + `latest.json`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/precipsum/precipsum-derive.mjs \
 *     --store=<precipsum/v1> [--cache=<dir>] [--now=<ISO>] [--end=<JJJJMMTTHH>] [--only=DE,CH]
 * Letzte Zeile: JSON `{ changed, dir, end, countries, … }`. Exit 1 nur, wenn kein Ende bestimmbar war.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { File as H5File } from 'jsfive';
import { encodePng } from '../lib/png.mjs';
import { G, buildCompositeIndexMap } from '../../src/scalar/precipIndexMap.ts';
import { DE1200_CORNERS } from '../../src/sources/radolanGeo.ts';
import { cellCentersToEdges } from '../../src/sources/geosphereIncaGeo.ts';
import { sumGeometry } from '../../src/precipSums/sumGrid.ts';
import {
  PAST_SUM_SCHEMA, PAST_SUM_WINDOWS_H, PAST_SUM_HOURS, PAST_SUM_UNIT_MM, PAST_SUM_KEEP_RUNS, PAST_SUM_COUNTRIES,
  PAST_SUM_COUNTRY_INDEX, PAST_SUM_SOURCES, pastSumStamp, pastSumRunDir, pastSumFileName, encodePastSumPixel, encodePastSumOutside,
  windowSumOnGrid, insideMaskOnGrid, PAST_SUM_DE_DAILY, PAST_SUM_DIR_RE,
} from '../../src/precipSums/pastSumFormat.ts';

const SELF = fileURLToPath(import.meta.url);
const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const H = 3_600_000;
const UA = 'buscosun-precipsum (+https://buscosun.com; buscosun-web/audit/niederschlagssummen.md)';
export const RW_URL = (stamp10) => `https://opendata.dwd.de/weather/radar/radolan/rw/raa01-rw_10000-${stamp10}-dwd---bin.hdf5`;
export const SF_URL = (stamp10) => `https://opendata.dwd.de/weather/radar/radolan/sf/raa01-sf_10000-${stamp10}-dwd---bin.hdf5`;
export const CPC_ITEM_URL = (day) => `https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`;
export const INCA_META_URL = 'https://dataset.api.hub.geosphere.at/v1/grid/historical/inca-v1-1h-1km/metadata';
/** Analyse-Domäne (V-NS-5: die Nowcast-Bbox des Spiegels liegt außerhalb und gibt 400). */
export const INCA_BBOX = '45.77,8.10,49.48,17.74';
export const INCA_URL = (fromIso, toIso) => `https://dataset.api.hub.geosphere.at/v1/grid/historical/inca-v1-1h-1km?parameters=RR&start=${fromIso}&end=${toIso}&bbox=${INCA_BBOX}&output_format=netcdf`;
/** INCA `RR` int32 in 0,001 kg m⁻² (jsfive liest die Attribute nicht; gemessen gegen TAWES, §11.1). */
export const INCA_RR_SCALE = 0.001;
/** INCA `time` = Sekunden seit 1961-01-01 UTC (gemessen: 2075482800 ⇔ 08.10.2026 19:00 UTC). */
export const INCA_EPOCH_MS = Date.UTC(1961, 0, 1);

const two = (n) => String(n).padStart(2, '0');
/** RW-Stempel JJMMTTHHMM. */
export function rwStamp(ms) { const d = new Date(ms); return `${two(d.getUTCFullYear() % 100)}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}`; }
const isoHour = (ms) => new Date(ms).toISOString().slice(0, 16);
const dayOf = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}`; };
const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const str = (v) => String(v ?? '').replace(/\0+$/, '');
function odimMs(date, time) {
  const d = str(date), t = str(time).padStart(6, '0');
  const ms = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6));
  if (!Number.isFinite(ms)) throw new Error(`ODIM-Zeit ${d} ${t}`);
  return ms;
}

// ── Leser (Bytes → Quellgitter in mm, NaN = ungültig, Zeile 0 = Norden) ───────────────────────────────────────

/** DWD RADOLAN RW / SF (ODIM-HDF5): uint16, gain 0,1, nodata 65535, undetect 0 = 0 mm; RW 1 h, SF 24 h. */
export function readRw(bytes, prod = 'RW', intervalH = 1) {
  const f = new H5File(ab(bytes), `${prod.toLowerCase()}.h5`);
  const dsWhat = f.get('dataset1/what').attrs, dWhat = f.get('dataset1/data1/what').attrs;
  if (str(dsWhat.prodname) !== prod) throw new Error(`${prod}: Produkt ${str(dsWhat.prodname)}`);
  if (str(dWhat.quantity) !== 'ACRR') throw new Error(`${prod}: Größe ${str(dWhat.quantity)}`);
  const ds = f.get('dataset1/data1/data');
  const [rows, cols] = ds.shape;
  if (cols !== 1100 || rows !== 1200) throw new Error(`${prod}: Gitter ${cols}×${rows} statt 1100×1200`);
  const startMs = odimMs(dsWhat.startdate, dsWhat.starttime), endMs = odimMs(dsWhat.enddate, dsWhat.endtime);
  if (endMs - startMs !== intervalH * H) throw new Error(`${prod}: Intervall ${(endMs - startMs) / 60_000} min`);
  const gain = Number(dWhat.gain), offset = Number(dWhat.offset), nodata = Number(dWhat.nodata), undetect = Number(dWhat.undetect);
  const raw = ds.value;
  const values = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    values[i] = r === nodata ? NaN : r === undetect ? 0 : Math.max(0, r * gain + offset);
  }
  return { values, cols, rows, corners: DE1200_CORNERS, grid: 'radolan', endMs };
}

export const readSf = (bytes) => readRw(bytes, 'SF', 24);

/** MeteoSchweiz CombiPrecip (ODIM-HDF5): float64 mm, NaN = keine Abdeckung, Ecken aus `/where`. */
export function readCpc(bytes) {
  const f = new H5File(ab(bytes), 'cpc.h5');
  const dsWhat = f.get('dataset1/what').attrs, dWhat = f.get('dataset1/data1/what').attrs, where = f.get('where').attrs;
  if (!/^CHCPC_00060$/.test(str(dsWhat.prodname))) throw new Error(`CPC: Produkt ${str(dsWhat.prodname)}`);
  if (str(dWhat.quantity) !== 'ACRR') throw new Error(`CPC: Größe ${str(dWhat.quantity)}`);
  const ds = f.get('dataset1/data1/data');
  const [rows, cols] = ds.shape;
  if (cols !== where.xsize || rows !== where.ysize) throw new Error('CPC: Form passt nicht zu /where');
  const startMs = odimMs(dsWhat.startdate, dsWhat.starttime), endMs = odimMs(dsWhat.enddate, dsWhat.endtime);
  if (endMs - startMs !== H) throw new Error(`CPC: Intervall ${(endMs - startMs) / 60_000} min`);
  const gain = Number(dWhat.gain ?? 1), offset = Number(dWhat.offset ?? 0);
  const raw = ds.value;
  const values = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    values[i] = r == null || !Number.isFinite(r) ? NaN : Math.max(0, r * gain + offset);
  }
  const corners = [[where.UL_lon, where.UL_lat], [where.UR_lon, where.UR_lat], [where.LR_lon, where.LR_lat], [where.LL_lon, where.LL_lat]];
  return { values, cols, rows, corners, grid: 'rzc', endMs };
}

/** GeoSphere INCA-Analyse (NetCDF-4): `RR` (t, y, x) int32 · 0,001 mm, Zeile 0 = Süden ⇒ gedreht; eine Stunde je t. */
export function readIncaRange(bytes) {
  const f = new H5File(ab(bytes), 'inca.nc');
  const rr = f.get('RR');
  const [nt, ny, nx] = rr.shape;
  const v = rr.value;
  const time = Array.from(f.get('time').value);
  const lat = f.get('lat').value, lon = f.get('lon').value;
  const at = (r, c) => r * nx + c;
  const centers = [
    [lon[at(ny - 1, 0)], lat[at(ny - 1, 0)]], [lon[at(ny - 1, nx - 1)], lat[at(ny - 1, nx - 1)]],
    [lon[at(0, nx - 1)], lat[at(0, nx - 1)]], [lon[at(0, 0)], lat[at(0, 0)]],
  ];
  if (!(lat[at(ny - 1, 0)] > lat[at(0, 0)])) throw new Error('INCA: Zeile 0 ist nicht Süden');
  const corners = cellCentersToEdges(centers, nx, ny);
  const hours = [];
  for (let t = 0; t < nt; t++) {
    const endMs = INCA_EPOCH_MS + time[t] * 1000;
    if (endMs % H !== 0) throw new Error(`INCA: Zeit ${time[t]} ist keine volle Stunde`);
    const values = new Float32Array(nx * ny);
    const base = t * nx * ny;
    for (let r = 0; r < ny; r++) {
      const dst = (ny - 1 - r) * nx, src = base + r * nx;
      for (let c = 0; c < nx; c++) { const x = v[src + c]; values[dst + c] = x < 0 ? NaN : x * INCA_RR_SCALE; }
    }
    hours.push({ values, cols: nx, rows: ny, corners, grid: 'inca', endMs });
  }
  return hours;
}

// ── Projektion auf G ─────────────────────────────────────────────────────────────────────────────────────

const idxMemo = new Map();
export function toGrid(field) {
  const key = `${field.grid}:${field.cols}x${field.rows}:${field.corners.flat().map((x) => x.toFixed(5)).join(',')}`;
  let idx = idxMemo.get(key);
  if (!idx) { idx = buildCompositeIndexMap(field.corners, field.cols, field.rows, field.grid); idxMemo.set(key, idx); }
  const out = new Float32Array(idx.length);
  for (let i = 0; i < idx.length; i++) out[i] = idx[i] < 0 ? NaN : field.values[idx[i]];
  return out;
}

// ── Cache der Stundenfelder auf G ────────────────────────────────────────────────────────────────────────

function makeCache(dir) {
  const path = (src, endMs) => (dir ? join(dir, src, `${pastSumStamp(endMs)}.f32.gz`) : null);
  return {
    get(src, endMs) {
      const p = path(src, endMs);
      if (!p || !existsSync(p)) return null;
      try { const b = gunzipSync(readFileSync(p)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice(); } catch { return null; }
    },
    put(src, endMs, grid) {
      const p = path(src, endMs);
      if (!p) return;
      mkdirSync(join(dir, src), { recursive: true });
      writeFileSync(`${p}.tmp`, gzipSync(Buffer.from(grid.buffer, grid.byteOffset, grid.byteLength), { level: 6 }));
      renameSync(`${p}.tmp`, p);
    },
    prune(oldestMs) {
      if (!dir) return;
      for (const src of ['rw', 'sf', 'cpc', 'inca']) {
        const d = join(dir, src);
        if (!existsSync(d)) continue;
        for (const f of readdirSync(d)) { const ms = Date.UTC(+f.slice(0, 4), +f.slice(4, 6) - 1, +f.slice(6, 8), +f.slice(8, 10)); if (!(ms >= oldestMs)) rmSync(join(d, f), { force: true }); }
      }
    },
  };
}

// ── Abrufe ───────────────────────────────────────────────────────────────────────────────────────────────

async function get(url, fetchImpl, as = 'bytes', timeoutMs = 60_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: ac.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return as === 'json' ? await r.json() : new Uint8Array(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

/** Liegt RW für die Stunde vor? (HEAD, ohne die Datei zu laden.) */
async function rwExists(endMs, fetchImpl) {
  const r = await fetchImpl(RW_URL(rwStamp(endMs)), { method: 'HEAD', headers: { 'user-agent': UA } });
  return r.ok;
}

async function loadRw(hoursMs, cache, fetchImpl, log) {
  const out = new Map();
  let fetched = 0;
  await pool(hoursMs, 6, async (ms) => {
    const hit = cache.get('rw', ms);
    if (hit) { out.set(ms, hit); return; }
    try {
      const b = await get(RW_URL(rwStamp(ms)), fetchImpl);
      if (!b) return;
      const f = readRw(b);
      if (f.endMs !== ms) throw new Error(`RW ${rwStamp(ms)} endet ${isoHour(f.endMs)}`);
      const g = toGrid(f);
      cache.put('rw', ms, g); out.set(ms, g); fetched++;
    } catch (e) { log(`RW ${isoHour(ms)}: ${e.message}`); }
  });
  return { fields: out, fetched };
}

/** SF-Felder für die gegebenen Enden (:50). */
async function loadSf(endsMs, cache, fetchImpl, log) {
  const out = new Map();
  let fetched = 0;
  await pool(endsMs, 2, async (ms) => {
    const hit = cache.get('sf', ms);
    if (hit) { out.set(ms, hit); return; }
    try {
      const b = await get(SF_URL(rwStamp(ms)), fetchImpl);
      if (!b) return;
      const f = readSf(b);
      if (f.endMs !== ms) throw new Error(`endet ${isoHour(f.endMs)}`);
      const g = toGrid(f);
      cache.put('sf', ms, g); out.set(ms, g); fetched++;
    } catch (e) { log(`SF ${isoHour(ms)}: ${e.message}`); }
  });
  return { fields: out, fetched };
}

async function loadCpc(hoursMs, cache, fetchImpl, log) {
  const out = new Map();
  const need = hoursMs.filter((ms) => { const hit = cache.get('cpc', ms); if (hit) out.set(ms, hit); return !hit; });
  let fetched = 0;
  if (!need.length) return { fields: out, fetched };
  const hrefs = new Map();
  for (const day of [...new Set(need.map(dayOf))]) {
    try {
      const item = await get(CPC_ITEM_URL(day), fetchImpl, 'json', 30_000);
      for (const [name, a] of Object.entries(item?.assets ?? {})) {
        const m = /^cpc(\d{2})(\d{3})(\d{2})(\d{2})\d_00060\.001\.h5$/.exec(name);
        if (!m || m[4] !== '00') continue;
        const ms = Date.UTC(2000 + +m[1], 0, 1) + (+m[2] - 1) * 86_400_000 + +m[3] * H;
        hrefs.set(ms, a.href);
      }
    } catch (e) { log(`CPC ${day}: ${e.message}`); }
  }
  await pool(need, 4, async (ms) => {
    const href = hrefs.get(ms);
    if (!href) return;
    try {
      const b = await get(href, fetchImpl);
      if (!b) return;
      const f = readCpc(b);
      if (f.endMs !== ms) throw new Error(`endet ${isoHour(f.endMs)}`);
      const g = toGrid(f);
      cache.put('cpc', ms, g); out.set(ms, g); fetched++;
    } catch (e) { log(`CPC ${isoHour(ms)}: ${e.message}`); }
  });
  return { fields: out, fetched };
}

async function loadInca(hoursMs, cache, fetchImpl, log) {
  const out = new Map();
  const need = hoursMs.filter((ms) => { const hit = cache.get('inca', ms); if (hit) out.set(ms, hit); return !hit; });
  let fetched = 0, calls = 0;
  if (!need.length) return { fields: out, fetched, calls };
  try {
    const meta = await get(INCA_META_URL, fetchImpl, 'json', 30_000); calls++;
    const lastMs = Date.parse(meta?.end_time);
    const want = need.filter((ms) => ms <= lastMs);
    if (!want.length) return { fields: out, fetched, calls, note: `Analyse bis ${isoHour(lastMs)} UTC` };
    const wantSet = new Set(want);
    for (const [from, to] of incaBlocks(want)) {
      try {
        calls++;
        const b = await get(INCA_URL(isoHour(from), isoHour(to)), fetchImpl, 'bytes', 120_000);
        if (!b) throw new Error('Bereich nicht geliefert');
        const got = readIncaRange(b);
        let hit = 0;
        for (const f of got) {
          if (!wantSet.has(f.endMs)) continue;
          const g = toGrid(f);
          cache.put('inca', f.endMs, g); out.set(f.endMs, g); fetched++; hit++;
        }
        // Eine Zeitachse, die keine der angefragten Stunden trifft, ist ein Lesefehler — nie still übergehen.
        if (!hit) throw new Error(`keine angefragte Stunde in der Antwort (${got.length} Stunden, erste ${got[0] ? isoHour(got[0].endMs) : '—'})`);
      } catch (e) { log(`INCA ${isoHour(from)}…${isoHour(to)}: ${e.message}`); }
    }
  } catch (e) { log(`INCA: ${e.message}`); }
  return { fields: out, fetched, calls };
}

/**
 * Die API liefert höchstens 10 000 000 Datenpunkte je Abruf (gemessen: 48 h = 15 279 600 ⇒ HTTP 400), eine Stunde der
 * Analyse-Domäne sind 281 101 ⇒ höchstens 35 h. Blöcke zu ≤ `INCA_BLOCK_H` zusammenhängenden Stunden (Lücken im Bedarf
 * werden mitgeholt, wenn sie im Block liegen — ein Abruf ist teurer als ein paar Stunden mehr).
 */
export const INCA_BLOCK_H = 24;
export function incaBlocks(hoursMs) {
  const s = [...hoursMs].sort((a, b) => a - b);
  const blocks = [];
  for (const ms of s) {
    const last = blocks[blocks.length - 1];
    if (last && ms - last[0] < INCA_BLOCK_H * H) last[1] = ms;
    else blocks.push([ms, ms]);
  }
  return blocks;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// ── Lauf ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Ende E: die jüngste volle Stunde ≤ jetzt − Latenz(RW), für die RW vorliegt (höchstens 3 Stunden zurück). */
export async function pickEnd(nowMs, fetchImpl) {
  let e = Math.floor((nowMs - PAST_SUM_SOURCES.DE.latencyMin * 60_000) / H) * H;
  for (let k = 0; k < 3; k++, e -= H) if (await rwExists(e, fetchImpl)) return e;
  return null;
}

/**
 * Maske „Zellmitte in DE, AT oder CH" aus den Landesumrissen `public/countries/{DE,AT,CH}.geojson` (dieselben Umrisse,
 * aus denen `countryBorders.ts` erzeugt ist; im Workflow-Klon über die Sparse-Liste `public/countries`). Außerhalb ist
 * keine der drei Quellen mit Regenmessern angeeicht ⇒ dort keine Aussage.
 */
let maskMemo = null;
export function dachMask(geom = sumGeometry(), root = APP_ROOT) {
  if (maskMemo) return maskMemo;
  const mask = new Uint8Array(geom.width * geom.height);
  for (const cc of PAST_SUM_COUNTRIES) {
    const j = JSON.parse(readFileSync(join(root, 'public', 'countries', `${cc}.geojson`), 'utf8'));
    const g = j.geometry ?? j.features?.[0]?.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const rings = polys.flat(1);
    const m = insideMaskOnGrid(geom.lat, geom.lon, geom.width, geom.height, rings);
    for (let i = 0; i < m.length; i++) mask[i] |= m[i];
  }
  maskMemo = mask;
  return mask;
}

/**
 * Baut die Fenster für das Ende E aus Stundenfeldern (Map je Land: endMs → Float32 auf G). Rein bis auf `writeFile`.
 */
export function buildRun({ endMs, fields, sf = new Map(), geom = sumGeometry(), notes = {}, inside = dachMask(geom) }) {
  const hoursMs = Array.from({ length: PAST_SUM_HOURS }, (_, k) => endMs - k * H);
  const byCountry = PAST_SUM_COUNTRIES.map((c) => hoursMs.map((ms) => fields[c]?.get(ms) ?? null));
  const countries = {};
  for (const c of PAST_SUM_COUNTRIES) {
    const hs = byCountry[PAST_SUM_COUNTRY_INDEX[c]];
    let maxW = 0;
    for (const w of PAST_SUM_WINDOWS_H) if (hs.slice(0, w).every(Boolean)) maxW = w;
    countries[c] = { hours: hs.filter(Boolean).length, hasEnd: !!hs[0], maxWindowH: maxW, ...(notes[c] ? { note: notes[c] } : {}) };
  }
  // DE 24/48 h aus SF (Ende E − 10 min); fehlt eine SF-Datei, die RW-Kette (benannt, Ordner `-rw`).
  const sfEnd = endMs - PAST_SUM_DE_DAILY.endOffsetMin * 60_000;
  const sfFor = (w) => Array.from({ length: w / 24 }, (_, k) => sf.get(sfEnd - k * 24 * H) ?? null);
  const deDaily = Object.fromEntries(PAST_SUM_DE_DAILY.windowsH.map((w) => [w, sfFor(w).every(Boolean)]));
  const deFallback = PAST_SUM_DE_DAILY.windowsH.some((w) => !deDaily[w]);
  if (deFallback) countries.DE.note = [countries.DE.note, '24/48 h ohne SF — RW-Kette'].filter(Boolean).join(' · ');
  const withEnd = PAST_SUM_COUNTRIES.filter((c) => countries[c].hasEnd);
  const baseDir = pastSumRunDir(endMs, withEnd, deFallback);
  const hash = createHash('sha256');
  const windows = {}, images = {};
  for (const w of PAST_SUM_WINDOWS_H) {
    const useSf = deDaily[w] === true;
    const lists = byCountry.map((hs, ci) => (ci === 0 && useSf ? sfFor(w) : hs.slice(0, w)));
    const sum = windowSumOnGrid(geom.country, lists);
    const rgba = new Uint8Array(sum.length * 4);
    let valid = 0, wet = 0, maxMm = 0, outside = 0;
    for (let i = 0; i < sum.length; i++) {
      if (!inside[i]) { encodePastSumOutside(rgba, i * 4); outside++; continue; }
      const v = sum[i];
      if (!Number.isNaN(v)) { valid++; if (v >= PAST_SUM_UNIT_MM / 2) wet++; if (v > maxMm) maxMm = v; }
      encodePastSumPixel(Number.isNaN(v) ? null : v, rgba, i * 4);
    }
    const file = pastSumFileName(w);
    images[file] = rgba;
    hash.update(file).update(rgba);
    windows[String(w)] = {
      file, de: { product: useSf ? 'SF' : 'RW', end: new Date(useSf ? sfEnd : endMs).toISOString() },
      valid, gap: sum.length - valid - outside, wet, maxMm: Math.round(maxMm * 100) / 100,
    };
  }
  // Inhalts-Hash im Ordnernamen: ein Ordner wird nie überschrieben, also muss jeder andere Inhalt einen anderen Namen haben.
  const dir = `${baseDir}-${hash.digest('hex').slice(0, 8)}`;
  const manifest = {
    schema: PAST_SUM_SCHEMA, kind: 'precipsum/past', end: new Date(endMs).toISOString(), dir,
    grid: { w: G.w, h: G.h, lonMin: G.lonMin, lonMax: G.lonMax, latMin: G.latMin, latMax: G.latMax },
    unitMm: PAST_SUM_UNIT_MM, countries, windows, sources: PAST_SUM_SOURCES, builtAt: new Date().toISOString(),
  };
  return { manifest, images, dir };
}

/** Schreibt einen Lauf in den Speicher (atomar je Ordner), setzt `latest.json`, beschneidet alte Läufe. */
export function writeRun(store, { manifest, images, dir }) {
  mkdirSync(store, { recursive: true });
  const latestPath = join(store, 'latest.json');
  const prev = existsSync(latestPath) ? JSON.parse(readFileSync(latestPath, 'utf8')) : null;
  // Nie zurück: ein älteres Ende (z. B. ein verspäteter Lauf) schreibt weder Ordner noch Manifest.
  if (prev && Date.parse(prev.end) > Date.parse(manifest.end)) return { changed: false, older: true };
  const target = join(store, dir);
  let changed = false;
  if (!existsSync(target)) {
    const tmp = `${target}.tmp-${process.pid}`;
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    for (const [file, rgba] of Object.entries(images)) writeFileSync(join(tmp, file), encodePng(G.w, G.h, rgba, 4));
    renameSync(tmp, target);
    changed = true;
  }
  const strip = (m) => (m ? JSON.stringify({ ...m, builtAt: null }) : '');
  if (strip(prev) !== strip(manifest)) { writeFileSync(latestPath, JSON.stringify(manifest, null, 1) + '\n'); changed = true; }
  const runs = readdirSync(store).filter((d) => PAST_SUM_DIR_RE.test(d) && !/\.tmp-\d+$/.test(d)).sort();
  // Behalten: der Ordner des Manifests + die jüngsten Läufe (Reserve für einen veralteten Manifest-Stand am CDN).
  const keep = new Set([dir, ...runs.slice(-PAST_SUM_KEEP_RUNS)]);
  for (const d of runs) if (!keep.has(d)) { rmSync(join(store, d), { recursive: true, force: true }); changed = true; }
  for (const d of readdirSync(store)) if (/\.tmp-\d+$/.test(d)) rmSync(join(store, d), { recursive: true, force: true });
  return { changed };
}

/**
 * Wartezeit auf ein spätes Land: fehlt an der jüngsten RW-Stunde E eine Quelle (INCA kommt ≈ 35 min nach dem
 * Stundenende, RW ≈ 26), die Stunde davor ist aber vollständig, bleibt der Lauf bis `PAST_SUM_WAIT_MS` nach E bei E − 1 h —
 * sonst stünde jede Stunde ein Land 10–30 min lang als Lücke in der Karte. Danach gilt E mit der benannten Lücke.
 */
export const PAST_SUM_WAIT_MS = 75 * 60_000;
export function chooseEnd(newestMs, nowMs, has, only = PAST_SUM_COUNTRIES) {
  const complete = (e) => only.every((c) => has(c, e));
  if (!complete(newestMs) && complete(newestMs - H) && nowMs - newestMs < PAST_SUM_WAIT_MS) {
    return { endMs: newestMs - H, waitingFor: only.filter((c) => !has(c, newestMs)) };
  }
  return { endMs: newestMs, waitingFor: [] };
}

export async function derive({ store, cacheDir = null, nowMs = Date.now(), endMs = null, only = PAST_SUM_COUNTRIES, fetchImpl = fetch, log = (m) => console.error(`[precipsum] ${m}`) }) {
  const t0 = Date.now();
  const newest = endMs ?? await pickEnd(nowMs, fetchImpl);
  if (newest == null) return { ok: false, error: 'RW: keine Stunde in den letzten 3 h' };
  // Eine Stunde mehr als die Fenster, damit die Wartestufe (E − 1 h) ohne zweiten Abruf volle 48 h hat.
  const hoursMs = Array.from({ length: PAST_SUM_HOURS + 1 }, (_, k) => newest - k * H);
  const cache = makeCache(cacheDir);
  const [de, ch, at] = await Promise.all([
    only.includes('DE') ? loadRw(hoursMs, cache, fetchImpl, log) : { fields: new Map(), fetched: 0 },
    only.includes('CH') ? loadCpc(hoursMs, cache, fetchImpl, log) : { fields: new Map(), fetched: 0 },
    only.includes('AT') ? loadInca(hoursMs, cache, fetchImpl, log) : { fields: new Map(), fetched: 0 },
  ]);
  const fields = { DE: de.fields, AT: at.fields, CH: ch.fields };
  const pick = endMs != null ? { endMs, waitingFor: [] } : chooseEnd(newest, nowMs, (c, e) => fields[c].has(e), only);
  const sfEnd = pick.endMs - PAST_SUM_DE_DAILY.endOffsetMin * 60_000;
  const sf = only.includes('DE') ? await loadSf([sfEnd, sfEnd - 24 * H], cache, fetchImpl, log) : { fields: new Map(), fetched: 0 };
  cache.prune(newest - (PAST_SUM_HOURS + 6) * H);
  const notes = {};
  if (at.note && !fields.AT.has(pick.endMs)) notes.AT = at.note;
  for (const c of PAST_SUM_COUNTRIES) if (!only.includes(c)) notes[c] = 'in diesem Lauf nicht abgerufen';
  const run = buildRun({ endMs: pick.endMs, fields, sf: sf.fields, notes });
  const w = writeRun(store, run);
  return {
    ok: true, changed: w.changed, older: !!w.older, dir: run.dir, end: run.manifest.end, newest: new Date(newest).toISOString(),
    waitingFor: pick.waitingFor, countries: run.manifest.countries,
    fetched: { rw: de.fetched, sf: sf.fetched, cpc: ch.fetched, inca: at.fetched, incaCalls: at.calls ?? 0 },
    windows: Object.fromEntries(Object.entries(run.manifest.windows).map(([k, v]) => [k, { de: v.de.product, valid: v.valid, gap: v.gap, wet: v.wet, maxMm: v.maxMm }])),
    ms: Date.now() - t0,
  };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  if (!args.store) { console.error('--store=<dir> fehlt'); process.exit(2); }
  const endMs = args.end ? Date.UTC(+args.end.slice(0, 4), +args.end.slice(4, 6) - 1, +args.end.slice(6, 8), +args.end.slice(8, 10)) : null;
  const res = await derive({
    store: resolve(String(args.store)), cacheDir: args.cache ? resolve(String(args.cache)) : null,
    nowMs: args.now ? Date.parse(String(args.now)) : Date.now(), endMs,
    only: args.only ? String(args.only).split(',').map((s) => s.trim().toUpperCase()) : PAST_SUM_COUNTRIES,
  });
  console.log(JSON.stringify(res));
  if (!res.ok) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main().catch((e) => { console.error(e); process.exit(1); });
