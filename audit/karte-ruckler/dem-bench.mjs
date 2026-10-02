// Experiment: DEM-Bau (buildDemImage) heute vs. mit vorgerechneten Kachel-Koordinaten — gleiche Bytes?
import { decodePng, toRgba } from 'file:///C:/dev/buscosun-web/scripts/lib/png.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const B = { lngMin: -3.9599999999999977, lngMax: 20.360000000000003, latMin: 43.16, latMax: 58.080000000000005 };
const Z = 7, DEM_MAX = 4500;
const lng2tileX = (lng, z) => ((lng + 180) / 360) * (1 << z);
const lat2tileY = (lat, z) => { const rad = (lat * Math.PI) / 180; return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * (1 << z); };
const dec = (d, i) => d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;

mkdirSync('tiles', { recursive: true });
const x0 = Math.floor(lng2tileX(B.lngMin, Z)), x1 = Math.floor(lng2tileX(B.lngMax, Z));
const y0 = Math.floor(lat2tileY(B.latMax, Z)), y1 = Math.floor(lat2tileY(B.latMin, Z));
const tiles = new Map();
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
  const f = `tiles/${Z}-${x}-${y}.png`;
  if (!existsSync(f)) { const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`); writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
  const img = toRgba(decodePng(readFileSync(f)));
  tiles.set(`${Z}/${x}/${y}`, { z: Z, x, y, data: img.data ?? img });
}
console.log('tiles', tiles.size, `x ${x0}..${x1} y ${y0}..${y1}`);

// ── heute (wortgleich aus elevation.ts + iconD2TempSource.buildDemImage) ──
function sampleOld(lng, lat) {
  const fx = lng2tileX(lng, Z), fy = lat2tileY(lat, Z);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const tile = tiles.get(`${Z}/${tx}/${ty}`);
  if (!tile) return NaN;
  const px = (fx - tx) * 256, py = (fy - ty) * 256;
  const i0 = Math.max(0, Math.min(255, Math.floor(px))), j0 = Math.max(0, Math.min(255, Math.floor(py)));
  const i1 = Math.min(255, i0 + 1), j1 = Math.min(255, j0 + 1);
  const fxr = px - i0, fyr = py - j0;
  const e00 = dec(tile.data, (j0 * 256 + i0) * 4), e10 = dec(tile.data, (j0 * 256 + i1) * 4);
  const e01 = dec(tile.data, (j1 * 256 + i0) * 4), e11 = dec(tile.data, (j1 * 256 + i1) * 4);
  const e0 = e00 * (1 - fxr) + e10 * fxr, e1 = e01 * (1 - fxr) + e11 * fxr;
  return e0 * (1 - fyr) + e1 * fyr;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function buildOld() {
  const rows = 700, lonSpan = B.lngMax - B.lngMin, latSpan = Math.max(0.01, B.latMax - B.latMin);
  const cols = Math.max(64, Math.round(rows * (lonSpan / latSpan)));
  const dLat = latSpan / rows, dLng = lonSpan / cols;
  const grid = new Float32Array(cols * rows); const subs = [-0.3, 0, 0.3];
  for (let j = 0; j < rows; j++) {
    const lat0 = B.latMin + (j + 0.5) * dLat;
    for (let i = 0; i < cols; i++) {
      const lng0 = B.lngMin + (i + 0.5) * dLng;
      let peak = -Infinity;
      for (const sj of subs) for (const si of subs) { const e = sampleOld(lng0 + si * dLng, lat0 + sj * dLat); if (Number.isFinite(e) && e > peak) peak = e; }
      grid[j * cols + i] = peak > -Infinity ? peak : NaN;
    }
  }
  const out = new Uint8ClampedArray(cols * rows * 4);
  for (let j = 0; j < rows; j++) { const y = rows - 1 - j; for (let i = 0; i < cols; i++) { const e = grid[j * cols + i]; const idx = (y * cols + i) * 4; out[idx] = Math.round(clamp01(e / DEM_MAX) * 255); out[idx + 3] = 255; } }
  return { cols, rows, out };
}

// ── neu: Kachel-Koordinaten je Spalte/Zeile vorgerechnet, Kachel per Array-Index ──
function buildNew() {
  const rows = 700, lonSpan = B.lngMax - B.lngMin, latSpan = Math.max(0.01, B.latMax - B.latMin);
  const cols = Math.max(64, Math.round(rows * (lonSpan / latSpan)));
  const dLat = latSpan / rows, dLng = lonSpan / cols;
  const subs = [-0.3, 0, 0.3];
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const tileArr = new Array(tw * th).fill(null);
  for (const t of tiles.values()) tileArr[(t.y - y0) * tw + (t.x - x0)] = t.data;
  // je Sub-Spalte: fx (identische Ausdrücke wie sampleOld ⇒ identische Doubles)
  const FX = new Float64Array(cols * 3), FY = new Float64Array(rows * 3);
  for (let i = 0; i < cols; i++) { const lng0 = B.lngMin + (i + 0.5) * dLng; for (let s = 0; s < 3; s++) FX[i * 3 + s] = lng2tileX(lng0 + subs[s] * dLng, Z); }
  for (let j = 0; j < rows; j++) { const lat0 = B.latMin + (j + 0.5) * dLat; for (let s = 0; s < 3; s++) FY[j * 3 + s] = lat2tileY(lat0 + subs[s] * dLat, Z); }
  const sample = (fx, fy) => {
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const cx = tx - x0, cy = ty - y0;
    const data = cx >= 0 && cx < tw && cy >= 0 && cy < th ? tileArr[cy * tw + cx] : null;
    if (!data) return NaN;
    const px = (fx - tx) * 256, py = (fy - ty) * 256;
    const i0 = Math.max(0, Math.min(255, Math.floor(px))), j0 = Math.max(0, Math.min(255, Math.floor(py)));
    const i1 = Math.min(255, i0 + 1), j1 = Math.min(255, j0 + 1);
    const fxr = px - i0, fyr = py - j0;
    const e00 = dec(data, (j0 * 256 + i0) * 4), e10 = dec(data, (j0 * 256 + i1) * 4);
    const e01 = dec(data, (j1 * 256 + i0) * 4), e11 = dec(data, (j1 * 256 + i1) * 4);
    const e0 = e00 * (1 - fxr) + e10 * fxr, e1 = e01 * (1 - fxr) + e11 * fxr;
    return e0 * (1 - fyr) + e1 * fyr;
  };
  const grid = new Float32Array(cols * rows);
  let maxSlice = 0;
  for (let j0r = 0; j0r < rows; j0r += 50) {
    const t0 = performance.now();
    for (let j = j0r; j < Math.min(rows, j0r + 50); j++) {
      for (let i = 0; i < cols; i++) {
        let peak = -Infinity;
        for (let sj = 0; sj < 3; sj++) for (let si = 0; si < 3; si++) { const e = sample(FX[i * 3 + si], FY[j * 3 + sj]); if (Number.isFinite(e) && e > peak) peak = e; }
        grid[j * cols + i] = peak > -Infinity ? peak : NaN;
      }
    }
    maxSlice = Math.max(maxSlice, performance.now() - t0);
  }
  const out = new Uint8ClampedArray(cols * rows * 4);
  for (let j = 0; j < rows; j++) { const y = rows - 1 - j; for (let i = 0; i < cols; i++) { const e = grid[j * cols + i]; const idx = (y * cols + i) * 4; out[idx] = Math.round(clamp01(e / DEM_MAX) * 255); out[idx + 3] = 255; } }
  return { cols, rows, out, maxSlice };
}

for (let rep = 0; rep < 3; rep++) {
  let t = performance.now(); const a = buildOld(); const tOld = performance.now() - t;
  t = performance.now(); const b = buildNew(); const tNew = performance.now() - t;
  let diff = 0; for (let k = 0; k < a.out.length; k++) if (a.out[k] !== b.out[k]) diff++;
  // Negativkontrolle: ein absichtlich verschobenes Raster muss abweichen
  let neg = 0; for (let k = 4; k < a.out.length; k++) if (a.out[k] !== b.out[k - 4]) { neg++; if (neg > 10) break; }
  console.log(`rep ${rep}: ${a.cols}x${a.rows}  alt ${tOld.toFixed(0)} ms  neu ${tNew.toFixed(0)} ms (größte 50-Zeilen-Scheibe ${b.maxSlice.toFixed(1)} ms)  abweichende Bytes ${diff}  Negativkontrolle>10: ${neg > 10}`);
}
