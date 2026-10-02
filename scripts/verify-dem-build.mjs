/**
 * verify:dem-build — Phase RK (audit/karte-ruckler.md): das Höhenbild der Temperatur entsteht
 * byte-gleich zur bisherigen Rechnung, aber ohne den 2-s-Block auf dem Hauptthread.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-dem-build.mjs
 *
 * Die Referenz unten ist die Rechnung von `buildDemImage` (iconD2TempSource.ts) und `sample`
 * (elevation.ts) vor RK-1, WORTGLEICH übernommen. Fixture-Kacheln haben die echte Datenform
 * (Terrarium-RGBA 256 × 256, Meer, negative Höhen, eine fehlende Kachel) über den echten Bounds
 * des ICON-D2-Repack-Gitters. Mit `DEM_TILES=<Ordner>` (Dateien `7-<x>-<y>.png`, z. B. aus
 * `audit/karte-ruckler/dem-bench.mjs`) läuft der Vergleich zusätzlich auf echten Kacheln.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const checks = [];
const skipped = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const skip = (name, why) => skipped.push({ name, why });

// Echte Bounds des Repack-Gitters (index.json, Lauf 2026100112) — ergeben 1141 × 700.
const BOUNDS = { lngMin: -3.9599999999999977, lngMax: 20.360000000000003, latMin: 43.16, latMax: 58.080000000000005 };
const Z = 7, ROWS = 700, DEM_MAX = 4500;

// ── Referenz (Stand vor RK-1, wortgleich) ────────────────────────────────────
function lng2tileX(lng, z) { return ((lng + 180) / 360) * (1 << z); }
function lat2tileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return (
    (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * (1 << z)
  );
}
function decodeTerrariumPixel(data, idx) { const r = data[idx]; const g = data[idx + 1]; const b = data[idx + 2]; return r * 256 + g + b / 256 - 32768; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }   // iconD2TempSource.ts
function referenceLookup(tiles, zoom) {
  return function sample(lng, lat) {
    const fx = lng2tileX(lng, zoom);
    const fy = lat2tileY(lat, zoom);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const tile = tiles.get(`${zoom}/${tx}/${ty}`);
    if (!tile) return NaN;
    const px = (fx - tx) * 256;
    const py = (fy - ty) * 256;
    const i0 = Math.max(0, Math.min(255, Math.floor(px)));
    const j0 = Math.max(0, Math.min(255, Math.floor(py)));
    const i1 = Math.min(255, i0 + 1);
    const j1 = Math.min(255, j0 + 1);
    const fxr = px - i0;
    const fyr = py - j0;
    const e00 = decodeTerrariumPixel(tile.data, (j0 * 256 + i0) * 4);
    const e10 = decodeTerrariumPixel(tile.data, (j0 * 256 + i1) * 4);
    const e01 = decodeTerrariumPixel(tile.data, (j1 * 256 + i0) * 4);
    const e11 = decodeTerrariumPixel(tile.data, (j1 * 256 + i1) * 4);
    const e0 = e00 * (1 - fxr) + e10 * fxr;
    const e1 = e01 * (1 - fxr) + e11 * fxr;
    return e0 * (1 - fyr) + e1 * fyr;
  };
}
function referenceDem(tileMap, bounds, subs = [-0.3, 0, 0.3]) {
  const sample = referenceLookup(tileMap, Z);
  const rows = 700;
  const lonSpan = bounds.lngMax - bounds.lngMin;
  const latSpan = Math.max(0.01, bounds.latMax - bounds.latMin);
  const cols = Math.max(64, Math.round(rows * (lonSpan / latSpan)));
  const dLat = latSpan / rows, dLng = lonSpan / cols;
  const grid = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const lat0 = bounds.latMin + (j + 0.5) * dLat;
    for (let i = 0; i < cols; i++) {
      const lng0 = bounds.lngMin + (i + 0.5) * dLng;
      let peak = -Infinity;
      for (const sj of subs) for (const si of subs) {
        const e = sample(lng0 + si * dLng, lat0 + sj * dLat);
        if (Number.isFinite(e) && e > peak) peak = e;
      }
      grid[j * cols + i] = peak > -Infinity ? peak : NaN;
    }
  }
  const data = new Uint8ClampedArray(cols * rows * 4);   // = createImageData (mit 0 gefüllt)
  for (let j = 0; j < rows; j++) {
    const y = rows - 1 - j;
    for (let i = 0; i < cols; i++) {
      const e = grid[j * cols + i];
      const idx = (y * cols + i) * 4;
      data[idx] = Math.round(clamp01(e / DEM_MAX) * 255);
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 255;
    }
  }
  return { width: cols, height: rows, rgba: data };
}

// ── Fixture-Kacheln: Terrarium-Kodierung, Gebirge + Meer + negative Höhen, eine Kachel fehlt ──
const x0 = Math.floor(lng2tileX(BOUNDS.lngMin, Z)), x1 = Math.floor(lng2tileX(BOUNDS.lngMax, Z));
const y0 = Math.floor(lat2tileY(BOUNDS.latMax, Z)), y1 = Math.floor(lat2tileY(BOUNDS.latMin, Z));
function encodeTerrarium(e, data, idx) {
  const v = e + 32768;
  data[idx] = Math.floor(v / 256); data[idx + 1] = Math.floor(v) % 256; data[idx + 2] = Math.floor((v - Math.floor(v)) * 256); data[idx + 3] = 255;
}
function fixtureTiles() {
  const list = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    if (x === x0 + 3 && y === y0 + 2) { list.push({ x, y, data: null }); continue; }   // fehlende Kachel ⇒ NaN-Pfad
    const data = new Uint8ClampedArray(256 * 256 * 4);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const gx = (x - x0) * 256 + i, gy = (y - y0) * 256 + j;
      // Alpenkamm im Süden, Mittelgebirge, Meer im Norden (≤ 0, teils −30 m), Pixelrauschen
      const alps = 4200 * Math.exp(-(((gy - 1900) / 180) ** 2)) * (0.6 + 0.4 * Math.sin(gx / 37));
      const hills = 700 * (0.5 + 0.5 * Math.sin(gx / 91) * Math.cos(gy / 73));
      const sea = gy < 500 ? -30 + (gy % 7) : 0;
      const noise = ((gx * 7919 + gy * 104729) % 97) / 9.7;
      encodeTerrarium(gy < 500 ? sea : alps + hills + noise, data, (j * 256 + i) * 4);
    }
    list.push({ x, y, data });
  }
  return list;
}
const toMap = (list) => new Map(list.filter((t) => t.data).map((t) => [`${Z}/${t.x}/${t.y}`, { data: t.data }]));
function toTiles(list) {
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const data = new Array(nx * ny).fill(null);
  for (const t of list) data[(t.y - y0) * nx + (t.x - x0)] = t.data;
  return { zoom: Z, x0, y0, nx, ny, data };
}

// ── Prüfungen ────────────────────────────────────────────────────────────────
let mod = null;
try { mod = await import('../src/sources/demGrid.ts'); } catch (e) { add('Modul src/sources/demGrid.ts lädt', false, String(e?.message ?? e).slice(0, 160)); }

const diffBytes = (a, b) => { if (a.length !== b.length) return Infinity; let d = 0; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) d++; return d; };
const noYield = () => Promise.resolve();

if (mod && typeof mod.buildDemRgba === 'function') {
  const list = fixtureTiles();
  const t0 = performance.now();
  const ref = referenceDem(toMap(list), BOUNDS);
  const tRef = performance.now() - t0;
  const t1 = performance.now();
  const got = await mod.buildDemRgba(toTiles(list), BOUNDS, ROWS, DEM_MAX, { yieldFn: noYield });
  const tNew = performance.now() - t1;
  add('Maße wie heute (1141 × 700)', got.width === ref.width && got.height === ref.height && ref.width === 1141, `${got.width}×${got.height}`);
  add('Höhenbild byte-gleich zur bisherigen Rechnung (Fixture mit Meer, negativen Höhen, fehlender Kachel)',
    diffBytes(got.rgba, ref.rgba) === 0, `${diffBytes(got.rgba, ref.rgba)} abweichende Bytes von ${ref.rgba.length}`);
  // Negativkontrolle: dieselbe Referenz mit leicht anderem Subraster MUSS abweichen — sonst prüft der Vergleich nichts.
  const neg = referenceDem(toMap(list), BOUNDS, [-0.3, 0, 0.31]);
  add('Negativkontrolle: verändertes Subraster weicht ab', diffBytes(neg.rgba, got.rgba) > 0, `${diffBytes(neg.rgba, got.rgba)} Bytes`);
  // Die fehlende Kachel muss wie heute 0 ergeben (NaN ⇒ 0 im Uint8ClampedArray), nicht 255 oder Müll.
  let zeros = 0; for (let k = 0; k < got.rgba.length; k += 4) if (got.rgba[k] === 0) zeros++;
  add('fehlende Kachel und Meer ergeben 0 wie heute', zeros > 0 && zeros === (() => { let z = 0; for (let k = 0; k < ref.rgba.length; k += 4) if (ref.rgba[k] === 0) z++; return z; })(), `${zeros} Nullzellen`);
  add('neue Rechnung höchstens halb so teuer wie die alte (selber Lauf)', tNew < tRef / 2, `alt ${tRef.toFixed(0)} ms, neu ${tNew.toFixed(0)} ms`);

  // Zeitscheiben: mit echtem Zeitbudget gibt die Rechnung regelmäßig ab, kein Block deutlich über dem Budget.
  let yields = 0, last = performance.now(), maxBlock = 0;
  const yieldFn = () => { const now = performance.now(); maxBlock = Math.max(maxBlock, now - last); yields++; return new Promise((r) => setImmediate(() => { last = performance.now(); r(); })); };
  const sliced = await mod.buildDemRgba(toTiles(list), BOUNDS, ROWS, DEM_MAX, { yieldFn, sliceMs: 8 });
  maxBlock = Math.max(maxBlock, performance.now() - last);
  add('mit Zeitbudget 8 ms: gibt mindestens 10-mal ab', yields >= 10, `${yields} Rückgaben`);
  add('mit Zeitbudget 8 ms: kein Block über 40 ms', maxBlock <= 40, `größter Block ${maxBlock.toFixed(1)} ms`);
  add('Zeitscheiben ändern kein Byte', diffBytes(sliced.rgba, ref.rgba) === 0);

  // Abbruch: ein abgebrochenes Signal beendet die Rechnung mit AbortError statt sie zu Ende zu rechnen.
  const ac = new AbortController();
  let n = 0;
  const abortingYield = () => { if (++n === 3) ac.abort(); return Promise.resolve(); };
  let err = null;
  try { await mod.buildDemRgba(toTiles(list), BOUNDS, ROWS, DEM_MAX, { yieldFn: abortingYield, sliceMs: 0, signal: ac.signal }); } catch (e) { err = e; }
  add('Abbruch: AbortError nach der laufenden Scheibe', err && (err.name === 'AbortError'), err ? `${err.name}` : 'kein Fehler');

  // Echte Kacheln (optional)
  const dir = process.env.DEM_TILES;
  if (dir && existsSync(dir)) {
    const { decodePng, toRgba } = await import('./lib/png.mjs');
    const real = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const f = join(dir, `${Z}-${x}-${y}.png`);
      real.push({ x, y, data: existsSync(f) ? (() => { const r = toRgba(decodePng(readFileSync(f))); return r.data ?? r; })() : null });
    }
    const r1 = referenceDem(toMap(real), BOUNDS);
    const r2 = await mod.buildDemRgba(toTiles(real), BOUNDS, ROWS, DEM_MAX, { yieldFn: noYield });
    add(`[echt] Höhenbild byte-gleich auf ${real.filter((t) => t.data).length} echten Terrarium-Kacheln`, diffBytes(r1.rgba, r2.rgba) === 0, `${diffBytes(r1.rgba, r2.rgba)} abweichend`);
  } else {
    skip('[echt] Vergleich auf echten Terrarium-Kacheln', 'DEM_TILES nicht gesetzt');
  }
} else if (mod) {
  add('demGrid.ts exportiert buildDemRgba', false);
}

// ── Verdrahtung und Unverändertheit ─────────────────────────────────────────
const crlf = (t) => t.replace(/\r\n/g, '\n');   // Arbeitsbaum CRLF (autocrlf), `git show` LF
const src = (p) => crlf(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const temp = src('src/sources/iconD2TempSource.ts');
const elev = src('src/fusion/elevation.ts');
add('iconD2TempSource baut das Höhenbild über buildDemRgba + loadElevationTiles',
  /buildDemRgba\(/.test(temp) && /loadElevationTiles\(/.test(temp));
add('iconD2TempSource ruft loadElevationLookup nicht mehr für das Höhenbild', !/loadElevationLookup\(/.test(temp));
add('elevation.ts exportiert loadElevationTiles', /export async function loadElevationTiles\(/.test(elev));

// Die Rasterfusion bleibt unverändert: `loadElevationLookup` und seine Helfer wortgleich zu HEAD.
const fnText = (text, name) => {
  const start = text.search(new RegExp(`(export )?(async )?function ${name}\\(`));
  if (start < 0) return null;
  let depth = 0, k = text.indexOf('{', start);
  for (; k < text.length; k++) { if (text[k] === '{') depth++; else if (text[k] === '}' && --depth === 0) break; }
  return text.slice(start, k + 1);
};
let head = null;
try { head = execSync('git show HEAD:src/fusion/elevation.ts', { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); head = crlf(head); } catch { /* kein Git */ }
if (head) {
  for (const name of ['loadElevationLookup', 'loadTile', 'decodeTerrariumPixel', 'lng2tileX', 'lat2tileY']) {
    add(`elevation.ts: ${name} wortgleich zu HEAD`, fnText(elev, name) !== null && fnText(elev, name) === fnText(head, name));
  }
} else {
  skip('elevation.ts wortgleich zu HEAD', 'git nicht verfügbar');
}
// Dieselben Formeln in demGrid.ts wie in elevation.ts (eine Quelle der Wahrheit im Text, geprüft statt behauptet).
if (existsSync(new URL('../src/sources/demGrid.ts', import.meta.url))) {
  const dg = src('src/sources/demGrid.ts');
  const body = (t, n) => (fnText(t, n) ?? '').replace(/^[^{]*\{/, '').replace(/\s+/g, ' ').trim();
  for (const name of ['lng2tileX', 'lat2tileY', 'decodeTerrariumPixel']) {
    add(`demGrid.ts: ${name} rechnet wortgleich zu elevation.ts`, body(dg, name) !== '' && body(dg, name) === body(elev, name));
  }
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
for (const s of skipped) console.log(`  ⊘ ${s.name} — ${s.why}`);
console.log(`\nverify:dem-build — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
