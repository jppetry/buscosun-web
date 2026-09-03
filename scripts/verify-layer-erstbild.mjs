/**
 * verify:layer-erstbild — LE2 (H3 HDF5 im Worker + H7 Netz-Prioritäten),
 * `audit/layer-erstbild.md` §9.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-layer-erstbild.mjs
 *
 * Prüft netzfrei (A–D, F) und an echten Dateien (E):
 *   A  die herausgelösten Parser sind DOM-frei und der Worker importiert nur sie
 *   B  die Verbraucher (INCA/rzc) gehen über die Brücke, kein jsfive mehr dort
 *   C  Kill-Switch `?h5worker=0` / `localStorage.h5worker` (Query schlägt Speicher)
 *   D  Rückfall: ohne `Worker` (Node) liefert die Brücke DENSELBEN Code-Pfad
 *   E  Byte-Identität: `parseIncaNetcdf`/`parseRzcHdf5` gegen die Referenzschleife
 *      (der Stand vor LE2, hier wortgleich nachgebaut) an einer echten INCA-NetCDF
 *      und rzc-HDF5 — Fixtures über `LE_FIXTURES=<dir>` (inca.nc, rzc.h5), sonst
 *      Live-Abruf; ohne Netz ⊘ statt Fehler
 *   F  H7: Prioritäten an den benannten Abrufstellen (Text + Verhalten mit
 *      gestubbtem `fetch`)
 */
import { readFileSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { File as H5File } from 'jsfive';
import { parseIncaNetcdf } from '../src/sources/incaParse.ts';
import { parseRzcHdf5 } from '../src/sources/rzcParse.ts';
import { parseIncaOffMain, parseRzcOffMain, hdf5WorkerEnabled, _hdf5WorkerActive, warmHdf5Worker } from '../src/sources/hdf5OffMain.ts';
import { fetchIncaGrid } from '../src/sources/geosphereIncaGrid.ts';
import { fetchRzcLatest } from '../src/sources/meteoSwissRadar.ts';
import { precipToU8 } from '../src/scalar/RainLayer.ts';
import { cellCentersToEdges } from '../src/sources/geosphereIncaGeo.ts';

const checks = [];
const skipped = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
const skip = (name, why) => skipped.push({ name, why });
const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---------------------------------------------------------------- A: DOM-frei
for (const f of ['src/sources/incaParse.ts', 'src/sources/rzcParse.ts', 'src/sources/hdf5Worker.ts']) {
  const s = src(f);
  add(`A: ${f} ohne document/window/fetch`, !/\b(document|window)\.|\bfetch\(/.test(s));
}
{
  const w = src('src/sources/hdf5Worker.ts');
  const imports = [...w.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]).sort();
  add('A: hdf5Worker importiert genau incaParse + rzcParse', imports.join(',') === './incaParse,./rzcParse', imports.join(','));
  add('A: hdf5Worker transferiert die Werte-Puffer', /postMessage\([^;]*valuesBuf[^;]*\)/s.test(w) && /\[r\.values\.buffer\]/.test(w));
}

// ---------------------------------------------------------------- B: Verbraucher
{
  const inca = src('src/sources/geosphereIncaGrid.ts');
  const rzc = src('src/sources/meteoSwissRadar.ts');
  add('B: geosphereIncaGrid ohne jsfive, über parseIncaOffMain', !/from 'jsfive'/.test(inca) && /parseIncaOffMain\(buf\)/.test(inca));
  add('B: meteoSwissRadar ohne jsfive, über parseRzcOffMain', !/from 'jsfive'/.test(rzc) && /parseRzcOffMain\(buf\)/.test(rzc));
  add('B: beide wärmen den Worker VOR dem fetch', /warmHdf5Worker\(\);[\s\S]{0,200}await fetch\(/.test(inca) && /warmHdf5Worker\(\);[\s\S]{0,200}await fetch\(href/.test(rzc));
  add('B: INCA „keine Frames" bleibt Fehler des Aufrufers (V-RL-2)', /frames\.length === 0\) throw/.test(inca));
  const bridge = src('src/sources/hdf5OffMain.ts');
  add('B: Brücke klont statt transferiert (Rückfall behält den Puffer)', /w\.postMessage\(\{ id, kind, buf \}\)/.test(bridge) && !/postMessage\(\{ id, kind, buf \}, \[/.test(bridge));
  add('B: Brücke fällt laut auf den Hauptthread zurück', /console\.warn\([^)]*Hauptthread übernimmt/.test(bridge) && /return parseIncaNetcdf\(buf\)/.test(bridge) && /return parseRzcHdf5\(buf\)/.test(bridge));
}

// ---------------------------------------------------------------- C: Kill-Switch
add('C: Standard = Worker an', hdf5WorkerEnabled('', null) === true);
add('C: localStorage.h5worker=0 ⇒ aus', hdf5WorkerEnabled('', '0') === false);
add('C: ?h5worker=0 ⇒ aus', hdf5WorkerEnabled('?h5worker=0', null) === false);
add('C: Query schlägt Speicher (0 vs 1)', hdf5WorkerEnabled('?h5worker=0', '1') === false && hdf5WorkerEnabled('?h5worker=1', '0') === true);
add('C: fremde Query-Keys ohne Wirkung', hdf5WorkerEnabled('?repack=0&l=wind', null) === true);

// ---------------------------------------------------------------- D: Rückfall ohne Worker (Node)
warmHdf5Worker();
add('D: in Node (kein Worker) ist der Worker-Pfad inaktiv', _hdf5WorkerActive() === false && typeof Worker === 'undefined');

// ---------------------------------------------------------------- E: Byte-Identität an echten Dateien
const INCA_URL = 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km?parameters=rr&output_format=netcdf&bbox=45.51,8.11,49.47,17.73';
const STAC = (day) => `https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`;
const toAb = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
async function fixture(name, live) {
  const dir = process.env.LE_FIXTURES;
  if (dir && existsSync(`${dir}/${name}`)) return toAb(readFileSync(`${dir}/${name}`));
  try { return await live(); } catch (e) { return { err: e instanceof Error ? e.message : String(e) }; }
}
async function liveInca() {
  const res = await fetch(INCA_URL, { signal: AbortSignal.timeout(40_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}
async function liveRzc() {
  const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
  for (const day of [d, new Date(d.getTime() - 864e5)].map((x) => `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}`)) {
    const r = await fetch(STAC(day), { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) continue;
    const item = await r.json();
    const keys = Object.keys(item.assets ?? {}).filter((k) => k.startsWith('rzc')).sort();
    if (!keys.length) continue;
    // MeteoSwiss listet ein Asset, bevor es abrufbar ist (403 am jüngsten gemessen,
    // audit/radar-datenrepo.md §14.5) — das jüngste ABRUFBARE nehmen, sonst fielen
    // die fünf rzc-Prüfungen dauerhaft aus.
    let last = null;
    for (const k of keys.slice(-4).reverse()) {
      const res = await fetch(item.assets[k].href, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return res.arrayBuffer();
      last = `HTTP ${res.status}`;
    }
    if (last) throw new Error(last);
  }
  throw new Error('kein rzc-Asset');
}

// Referenz = der Stand VOR LE2 (geosphereIncaGrid.ts / meteoSwissRadar.ts, wortgleich).
function refInca(buf) {
  const f = new H5File(buf, 'inca.nc');
  const rr = f.get('rr'); const [nt, ny, nx] = rr.shape; const v = rr.value;
  const lead = f.get('leadtime').value, lat = f.get('lat').value, lon = f.get('lon').value;
  const at = (r, c) => r * nx + c;
  const centers = [[lon[at(ny - 1, 0)], lat[at(ny - 1, 0)]], [lon[at(ny - 1, nx - 1)], lat[at(ny - 1, nx - 1)]], [lon[at(0, nx - 1)], lat[at(0, nx - 1)]], [lon[at(0, 0)], lat[at(0, 0)]]];
  const corners = cellCentersToEdges(centers, nx, ny);
  const frames = [];
  for (let t = 0; t < nt; t++) {
    const base = t * ny * nx; const values = new Uint8Array(nx * ny);
    for (let r = 0; r < ny; r++) {
      const dstRow = (ny - 1 - r) * nx, srcRow = base + r * nx;
      for (let c = 0; c < nx; c++) { const raw = v[srcRow + c]; const mmph = raw === -999 ? NaN : raw * 0.01 * 4; values[dstRow + c] = precipToU8(mmph); }
    }
    frames.push({ leadHours: lead[t], values, width: nx, height: ny });
  }
  return { frames, corners };
}
function refRzc(buf) {
  const f = new H5File(buf, 'rzc.h5');
  const where = f.get('where').attrs; const width = where.xsize, height = where.ysize;
  const rate = f.get('dataset1/data1/data').value;
  const values = new Uint8Array(width * height);
  for (let k = 0; k < values.length; k++) values[k] = precipToU8(rate[k]);
  const corners = [[where.UL_lon, where.UL_lat], [where.UR_lon, where.UR_lat], [where.LR_lon, where.LR_lat], [where.LL_lon, where.LL_lat]];
  let validAt = new Date();
  try { const what = f.get('what').attrs; const date = String(what.date); const time = String(what.time).padStart(6, '0'); validAt = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +time.slice(0, 2), +time.slice(2, 4))); } catch { /* jetzt */ }
  return { values, width, height, corners, validAt };
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const incaBuf = await fixture('inca.nc', liveInca);
let incaAb = null;
if (incaBuf.err) skip('E: INCA Parser == Referenz', `INCA nicht erreichbar (${incaBuf.err})`);
else {
  incaAb = incaBuf;
  const t0 = performance.now(); const p = parseIncaNetcdf(incaAb); const ms = performance.now() - t0;
  const r = refInca(incaAb);
  add('E: INCA Frames-Zahl und Maße == Referenz', p.frames.length === r.frames.length && p.frames.every((f, i) => f.width === r.frames[i].width && f.height === r.frames[i].height && f.leadHours === r.frames[i].leadHours), `${p.frames.length} Frames ${p.frames[0]?.width}×${p.frames[0]?.height}, Parse ${ms.toFixed(0)} ms`);
  add('E: INCA Werte byte-gleich (alle Frames)', p.frames.every((f, i) => same(f.values, r.frames[i].values)));
  add('E: INCA Ecken identisch', JSON.stringify(p.corners) === JSON.stringify(r.corners), JSON.stringify(p.corners.map((c) => c.map((x) => +x.toFixed(4)))));
  const off = await parseIncaOffMain(incaAb);
  add('D/E: parseIncaOffMain (Rückfall) byte-gleich', off.frames.every((f, i) => same(f.values, r.frames[i].values)) && JSON.stringify(off.corners) === JSON.stringify(r.corners));
}
const rzcBuf = await fixture('rzc.h5', liveRzc);
let rzcAb = null;
if (rzcBuf.err) skip('E: rzc Parser == Referenz', `MeteoSwiss nicht erreichbar (${rzcBuf.err})`);
else {
  rzcAb = rzcBuf;
  const t0 = performance.now(); const p = parseRzcHdf5(rzcAb); const ms = performance.now() - t0;
  const r = refRzc(rzcAb);
  add('E: rzc Maße + Ecken == Referenz', p.width === r.width && p.height === r.height && JSON.stringify(p.corners) === JSON.stringify(r.corners), `${p.width}×${p.height}, Parse ${ms.toFixed(0)} ms`);
  add('E: rzc Werte byte-gleich', same(p.values, r.values));
  add('E: rzc Validitätszeit == Referenz', p.validAtMs === r.validAt.getTime(), new Date(p.validAtMs ?? 0).toISOString());
  const off = await parseRzcOffMain(rzcAb);
  add('D/E: parseRzcOffMain (Rückfall) byte-gleich', same(off.values, r.values) && off.validAtMs === p.validAtMs);
}

// ---------------------------------------------------------------- F: H7 Prioritäten
{
  const rad = src('src/sources/radolan.ts');
  // RD2: der Tar-Leser wählt den Weg (CDN vs. Netlify) selbst — die Priorität
  // muss auf BEIDEN Wegen ankommen, der Standard bleibt high.
  add('F: RV-Tar fetch trägt priority, Standard high (beide Wege)', /fetchRvBytesCached\(ts: string, signal\?: AbortSignal, priority: RequestPriority = 'high'\)/.test(rad) && /fetch\(cdnUrl, \{ signal: dl\.signal, priority \}\)/.test(rad) && /fetch\(netlifyUrl, \{ signal, priority \}\)/.test(rad));
  add('F: fetchRvNowcast reicht die Priorität bis zum Tar', /loadRvNowcast\(opts\?\.priority\)/.test(rad) && /fetchRvTar\(ts, undefined, priority\)/.test(rad) && /fetchRvBytesCached\(ts, signal, priority\)/.test(rad));
  add('F: Frühstart-Tar bleibt high', /priority: 'high'/.test(src('src/sources/radolanRuns.ts')));
  const rep = src('src/sources/repackSource.ts');
  add('F: Repack-Bilder high (Standard), loadGridStep reicht durch', /priority: RequestPriority = 'high'\)/.test(rep) && /cache: 'default', priority \}/.test(rep) && /loadRgba\(stepUrl\(section, entry\.file\), signal, fam\.grid, priority\)/.test(rep));
  add('F: cape (eine Zahl) low', /loadGridStep\(section, 'cape', step, signal, 'low'\)/.test(src('src/sources/iconD2Cape.ts')));
  const kon = src('src/sources/dwdKonrad3d.ts');
  // RD2: dritter low-Abruf ist der CDN-Weg (gerechneter Zeitstempel statt Listing);
  // RD3: vierter ist das cells.json des Bild-Spiegels (vor dem XML desselben Stempels).
  add('F: KONRAD3D Listing + XML + CDN + cells.json low', (kon.match(/priority: 'low'/g) || []).length === 4);
  add('F: Brightsky-Fächer low (weather + current_weather)', /priority: 'low'/.test(src('src/sources/brightSkyForecast.ts')) && /priority: 'low'/.test(src('src/sources/brightSkyCurrent.ts')));
  const nrm = src('src/nowcast/NowcastRadarMap.tsx');
  add('F: Regenradar-Nachbarn low (RV/INCA/rzc)', /fetchRvNowcast\(ac\.signal, low\)/.test(nrm) && /fetchIncaGrid\(ac\.signal, low\)/.test(nrm) && /fetchRzcLatest\(ac\.signal, low\)/.test(nrm));
  const mv = src('src/MapView.tsx');
  add('F: Wetterkarte: eigenes Land Standard, Nachbarn low', /prioFor = \(country: 'DE' \| 'AT' \| 'CH'\) =>\s*\(countryRef\.current === country \? undefined : \{ priority: 'low' as const \}\)/.test(mv) && /fetchRvNowcast\(abort\.signal, prioFor\('DE'\)\)/.test(mv) && /fetchIncaGrid\(abort\.signal, prioFor\('AT'\)\)/.test(mv) && /fetchRzcLatest\(abort\.signal, prioFor\('CH'\)\)/.test(mv));
  add('F: Terrarium-Kacheln bleiben low (Bestand)', /priority: 'low'/.test(src('src/fusion/elevation.ts')));
}

// Verhalten: gestubbtes fetch — die Priorität kommt beim Abruf an, ohne Option keine.
// RD3: der Bild-Weg wird über den Kill-Switch (localStorage.radarimg = '0') abgeschaltet,
// damit die Sonden deterministisch den Direktweg messen (der Bild-Weg hat eigene
// Live-Belege in `verify:radar-repack`).
const _realLS = globalThis.localStorage;
globalThis.localStorage = { getItem: (k) => (k === 'radarimg' ? '0' : null) };
if (incaAb) {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push({ url: String(url), priority: init?.priority }); return new Response(incaAb.slice(0), { status: 200 }); };
  try {
    const g1 = await fetchIncaGrid(undefined, { priority: 'low' });
    add('F: fetchIncaGrid(low) ⇒ fetch(priority: low), Frames da', seen[0]?.priority === 'low' && g1.frames.length > 0, JSON.stringify(seen[0]?.priority));
  } catch (e) { add('F: fetchIncaGrid(low) läuft', false, e instanceof Error ? e.message : String(e)); }
  finally { globalThis.fetch = realFetch; }
}
if (rzcAb) {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), priority: init?.priority });
    if (String(url).includes('/api/stac/')) return new Response(JSON.stringify({ assets: { 'rzc2026': { href: 'https://example.invalid/rzc.h5' } } }), { status: 200 });
    return new Response(rzcAb.slice(0), { status: 200 });
  };
  try {
    const fr = await fetchRzcLatest(undefined, { priority: 'low' });
    add('F: fetchRzcLatest(low) ⇒ STAC + Datei low, Frame da', seen.length === 2 && seen.every((s) => s.priority === 'low') && fr.width > 0, JSON.stringify(seen.map((s) => s.priority)));
  } catch (e) { add('F: fetchRzcLatest(low) läuft', false, e instanceof Error ? e.message : String(e)); }
  finally { globalThis.fetch = realFetch; }
}
if (_realLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = _realLS;

// ---------------------------------------------------------------- Ausgabe
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
for (const s of skipped) console.log(`  ⊘ ${s.name} — ${s.why}`);
const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
console.log(`\nverify:layer-erstbild — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
