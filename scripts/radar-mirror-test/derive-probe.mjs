// ---------------------------------------------------------------------------
// RD3-M0 — Messsonde: Was kosten die abgeleiteten Radar-Dateien wirklich?
//
// Misst an ECHTEN Dateien (DWD/GeoSphere/MeteoSwiss direkt, kein CDN — eine
// Sonde darf keine jsDelivr-404 festhalten):
//   rv      RV-Tar → decodeRvTar → 25 Graustufen-PNGs (Bytes je Frame, Summe,
//           bz2/Dekode/Encode-ms); wählt über das DWD-Listing den größten UND
//           kleinsten Tar der letzten 48 h (nass/trocken-Spanne).
//   inca    GeoSphere-NetCDF → parseIncaNetcdf → 12 PNGs; nennt die im HDF5
//           lesbaren Wurzel-Variablen (Referenzzeit-Frage) und die Ecken.
//   rzc     STAC-Item → jüngstes rzc-Asset (Dateinamens-Muster!, ETag/Cache-
//           Header) → parseRzcHdf5 → 1 PNG.
//   konrad  DWD-Listing → jüngstes XML → parseKonrad3d → JSON-Größe (+gzip),
//           Roundtrip JSON.parse deep-equal.
//
// Aufruf:  node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
//            scripts/radar-mirror-test/derive-probe.mjs [rv|inca|rzc|konrad ...]
// Ohne Argumente laufen alle vier. REPACK_BZIP2=1 nutzt das bzip2-Binary.
// ---------------------------------------------------------------------------

import { gzipSync } from 'node:zlib';
import { decompressBz2 } from '../lib/bz2.mjs';
import { encodePng } from '../lib/png.mjs';
import { decodeRvTar } from '../../src/sources/radolanDecode.ts';
import { parseIncaNetcdf } from '../../src/sources/incaParse.ts';
import { parseRzcHdf5 } from '../../src/sources/rzcParse.ts';
import { parseKonrad3d } from '../../src/radar/konrad3d.ts';

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const log = (...a) => console.log('[m0]', ...a);

async function fetchBuf(url) {
  const t0 = Date.now();
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  return { buf, ms: Date.now() - t0, headers: r.headers };
}

/** nginx-Listing → [{name, bytes}] (Größen stehen als exakte Bytes in der Tabelle). */
function parseListing(html, re) {
  const out = [];
  for (const m of html.matchAll(re)) out.push({ name: m[1], bytes: Number(m[2]) });
  return out;
}

function encodeFrames(frames, label) {
  const sizes = [];
  let encMs = 0;
  for (const f of frames) {
    const t0 = Date.now();
    const png = encodePng(f.width, f.height, f.values, 1);
    encMs += Date.now() - t0;
    sizes.push(png.length);
  }
  const total = sizes.reduce((a, b) => a + b, 0);
  log(`${label}: ${frames.length} Frames → PNG min/median/max ${kb(Math.min(...sizes))}/${kb([...sizes].sort((a, b) => a - b)[sizes.length >> 1])}/${kb(Math.max(...sizes))}, Summe ${kb(total)}, encode ${encMs} ms gesamt (${Math.round(encMs / frames.length)} ms/Frame)`);
  return { sizes, total, encMs };
}

async function probeRvOne(name, bytes) {
  const { buf, ms: dlMs } = await fetchBuf(`https://opendata.dwd.de/weather/radar/composite/rv/${name}`);
  const t1 = Date.now();
  const raw = await decompressBz2(buf);
  const bz2Ms = Date.now() - t1;
  const t2 = Date.now();
  const run = decodeRvTar(raw);
  const decMs = Date.now() - t2;
  log(`rv ${name}: Tar ${kb(bytes)} (Download ${dlMs} ms) → entpackt ${kb(raw.length)}, bz2 ${bz2Ms} ms, Tar-Dekode ${decMs} ms, ${run.frames.length} Frames ${run.frames[0].width}x${run.frames[0].height}, Leads ${run.frames[0].leadMinutes}…${run.frames[run.frames.length - 1].leadMinutes} min`);
  const enc = encodeFrames(run.frames, `rv ${name}`);
  log(`rv ${name}: PNG-Summe/Tar = ${(enc.total / bytes).toFixed(2)}, Slot-Gesamtzeit bz2+dekode+encode = ${bz2Ms + decMs + enc.encMs} ms`);
}

async function probeRv() {
  const { buf } = await fetchBuf('https://opendata.dwd.de/weather/radar/composite/rv/');
  const files = parseListing(new TextDecoder().decode(buf), /href="(DE1200_RV\d{10}\.tar\.bz2)">[^<]*<\/a>\s+\S+ \S+\s+(\d+)/g)
    .filter((f) => f.bytes > 1000);
  if (!files.length) throw new Error('rv: Listing leer/unlesbar');
  files.sort((a, b) => a.bytes - b.bytes);
  const smallest = files[0];
  const biggest = files[files.length - 1];
  log(`rv: Listing ${files.length} Tars, Bytes min ${kb(smallest.bytes)} (${smallest.name}) / max ${kb(biggest.bytes)} (${biggest.name})`);
  await probeRvOne(biggest.name, biggest.bytes);
  if (smallest.name !== biggest.name) await probeRvOne(smallest.name, smallest.bytes);
}

async function probeInca() {
  const url = 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km?parameters=rr&output_format=netcdf&bbox=45.51,8.11,49.47,17.73';
  const { buf, ms } = await fetchBuf(url);
  log(`inca: NetCDF ${kb(buf.length)} (Download ${ms} ms)`);
  // Wurzel-Variablen sichtbar machen (Referenzzeit-Frage): jsfive über den Parser hinaus.
  const { File: H5File } = await import('jsfive');
  const f = new H5File(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'inca.nc');
  log(`inca: HDF5-Wurzel-Schlüssel: ${f.keys.join(', ')}`);
  for (const key of ['time', 'reftime', 'forecast_reference_time']) {
    try {
      const v = f.get(key);
      if (v?.value != null) log(`inca: Variable ${key} = ${JSON.stringify(Array.from(v.value).slice(0, 3))}…`);
    } catch { /* nicht vorhanden */ }
  }
  const t0 = Date.now();
  const parsed = parseIncaNetcdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  log(`inca: Parse ${Date.now() - t0} ms, ${parsed.frames.length} Frames ${parsed.frames[0].width}x${parsed.frames[0].height}, Leads ${parsed.frames.map((x) => x.leadHours).join('/')} h`);
  log(`inca: Ecken [NW,NE,SE,SW] = ${JSON.stringify(parsed.corners.map((c) => c.map((v) => +v.toFixed(4))))}`);
  encodeFrames(parsed.frames, 'inca');
}

async function probeRzc() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { buf: itemBuf, headers } = await fetchBuf(`https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`);
  log(`rzc: STAC-Item ${kb(itemBuf.length)}, etag=${headers.get('etag')}, cache-control=${headers.get('cache-control')}`);
  const item = JSON.parse(new TextDecoder().decode(itemBuf));
  const keys = Object.keys(item.assets ?? {}).filter((k) => k.startsWith('rzc')).sort();
  const href = item.assets[keys[keys.length - 1]].href;
  log(`rzc: ${keys.length} rzc-Assets heute, jüngstes = ${href.split('/').pop()} (Muster berechenbar?)`);
  const { buf, ms, headers: h2 } = await fetchBuf(href);
  log(`rzc: HDF5 ${kb(buf.length)} (Download ${ms} ms), cache-control=${h2.get('cache-control')}`);
  const t0 = Date.now();
  const parsed = parseRzcHdf5(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  log(`rzc: Parse ${Date.now() - t0} ms, ${parsed.width}x${parsed.height}, validAt=${parsed.validAtMs ? new Date(parsed.validAtMs).toISOString() : 'null'}`);
  log(`rzc: Ecken = ${JSON.stringify(parsed.corners.map((c) => c.map((v) => +v.toFixed(4))))}`);
  encodeFrames([{ width: parsed.width, height: parsed.height, values: parsed.values }], 'rzc');
}

async function probeKonrad() {
  const { buf } = await fetchBuf('https://opendata.dwd.de/weather/radar/konrad3d/');
  const files = parseListing(new TextDecoder().decode(buf), /href="(KONRAD3D_\d{8}T\d{6}\.xml)">[^<]*<\/a>\s+\S+ \S+\s+(\d+)/g);
  if (!files.length) throw new Error('konrad: Listing leer/unlesbar');
  files.sort((a, b) => (a.name < b.name ? -1 : 1));
  // Größte Datei der letzten 48 h = konvektiv aktivster Slot; dazu die jüngste.
  const newest = files[files.length - 1];
  const fattest = [...files].sort((a, b) => b.bytes - a.bytes)[0];
  for (const pick of fattest.name === newest.name ? [newest] : [newest, fattest]) {
    const { buf: xml } = await fetchBuf(`https://opendata.dwd.de/weather/radar/konrad3d/${pick.name}`);
    const t0 = Date.now();
    const run = parseKonrad3d(new TextDecoder().decode(xml), pick.name);
    const parseMs = Date.now() - t0;
    const json = JSON.stringify(run);
    const back = JSON.parse(json);
    const roundtrip = JSON.stringify(back) === json;
    log(`konrad ${pick.name}: XML ${kb(pick.bytes)} → ${run.cells.length} Zellen, Parse ${parseMs} ms, JSON ${kb(json.length)} (gzip ${kb(gzipSync(json).length)}), Roundtrip deep-equal: ${roundtrip}`);
  }
}

const want = process.argv.slice(2);
const all = { rv: probeRv, inca: probeInca, rzc: probeRzc, konrad: probeKonrad };
for (const [name, fn] of Object.entries(all)) {
  if (want.length && !want.includes(name)) continue;
  try {
    await fn();
  } catch (e) {
    log(`${name}: FEHLGESCHLAGEN — ${e.message}`);
    process.exitCode = 1;
  }
}
