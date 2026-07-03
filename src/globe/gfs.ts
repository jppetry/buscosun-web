/**
 * 3D-Globus · Live-Globaldaten aus NOAA GFS (Public Domain, frei kommerziell).
 *
 * Quelle: AWS Open Data Bucket `noaa-gfs-bdp-pds` (S3, Range-fähig) über den
 * Proxy `/_gfs` (dev: vite, prod: netlify.toml). Vorgehen wie `herbie`/`wgrib2`:
 *  1. `.idx`-Index des Laufs holen → Byte-Offsets je Feld.
 *  2. nur die gewünschten Felder per HTTP-Range laden (~75 KB statt ~500 MB).
 *  3. GRIB2 dekodieren — inkl. **DRT 3 (Complex Packing + Spatial Differencing)**,
 *     das GFS nutzt und der ICON-Decoder (nur DRT 0/1) nicht kann.
 *
 * 1°-Gitter (360×181), global. Kein Backend, kein API-Key, kein Rate-Limit —
 * passt zur „native/freie Quellen"-Haltung.
 */

// Browser: CORS-Proxy `/_gfs` (dev: vite, prod: netlify.toml). Node (Verify-
// Harness, kein `window`): kein CORS → direkt gegen den AWS-S3-Bucket. Für den
// Browser exakt wie zuvor.
const GFS_BASE = typeof window === 'undefined'
  ? 'https://noaa-gfs-bdp-pds.s3.amazonaws.com'
  : '/_gfs';

export interface GfsRun { date: string; hour: string; } // date=YYYYMMDD, hour=HH (UTC)

export interface GfsGrid {
  values: Float32Array; // ni·nj, Scan-Reihenfolge (row 0 = Nord, col 0 = 0°E)
  ni: number; nj: number; scanMode: number;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function pad3(n: number) { return String(n).padStart(3, '0'); }

function runPath(run: GfsRun, fhour: number): string {
  return `${GFS_BASE}/gfs.${run.date}/${run.hour}/atmos/gfs.t${run.hour}z.pgrb2.1p00.f${pad3(fhour)}`;
}

// --- Lauf-Auflösung ---------------------------------------------------------

let cachedRun: { run: GfsRun; at: number } | null = null;

/** Findet den jüngsten publizierten GFS-Lauf (idx der f000 vorhanden). */
export async function resolveLatestGfsRun(signal?: AbortSignal): Promise<GfsRun> {
  if (cachedRun && Date.now() - cachedRun.at < 10 * 60_000) return cachedRun.run;
  // Neuesten Tag aus dem Bucket-Listing holen.
  const ym = new Date();
  // Bucket nach Tagen listen (Prefix grob über die letzten ~2 Monate).
  const prefixes = [yyyymm(ym), yyyymm(addMonths(ym, -1))];
  let latestDay = '';
  for (const pfx of prefixes) {
    try {
      const res = await fetch(`${GFS_BASE}/?list-type=2&prefix=gfs.${pfx}&delimiter=/&max-keys=400`, { signal });
      if (!res.ok) continue;
      const txt = await res.text();
      const days = [...txt.matchAll(/<Prefix>gfs\.(\d{8})\//g)].map((m) => m[1]).sort();
      if (days.length) latestDay = days[days.length - 1] > latestDay ? days[days.length - 1] : latestDay;
    } catch { /* nächste */ }
  }
  if (!latestDay) throw new Error('GFS: kein Lauf im Bucket gefunden');

  // Beim neuesten Tag den spätesten komplett publizierten Lauf suchen (idx prüfen).
  const tryDays = [latestDay, prevDay(latestDay)];
  for (const day of tryDays) {
    for (const hour of ['18', '12', '06', '00']) {
      const run = { date: day, hour };
      try {
        const head = await fetch(`${runPath(run, 0)}.idx`, { method: 'GET', headers: { Range: 'bytes=0-64' }, signal });
        if (head.ok || head.status === 206) { cachedRun = { run, at: Date.now() }; return run; }
      } catch { /* nächster */ }
    }
  }
  throw new Error('GFS: kein publizierter Lauf erreichbar');
}

function yyyymm(d: Date) { return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}`; }
function addMonths(d: Date, m: number) { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; }
function prevDay(yyyymmdd: string) {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

// --- Feld-Abruf (idx → Range → Decode) --------------------------------------

interface IdxEntry { start: number; end: number | null; }

const idxCache = new Map<string, string[]>();
async function loadIdx(run: GfsRun, fhour: number, signal?: AbortSignal): Promise<string[]> {
  const key = `${run.date}${run.hour}/${fhour}`;
  const hit = idxCache.get(key);
  if (hit) return hit;
  const res = await fetch(`${runPath(run, fhour)}.idx`, { signal });
  if (!res.ok) throw new Error(`GFS idx ${res.status}`);
  const lines = (await res.text()).trim().split('\n');
  idxCache.set(key, lines);
  return lines;
}

function findRange(lines: string[], match: string): IdxEntry | null {
  const i = lines.findIndex((l) => l.includes(match));
  if (i < 0) return null;
  const start = parseInt(lines[i].split(':')[1], 10);
  const end = i + 1 < lines.length ? parseInt(lines[i + 1].split(':')[1], 10) - 1 : null;
  return { start, end };
}

// Dekodierte Felder cachen (Lauf ist unveränderlich) → Overlay-/Höhen-Wechsel
// re-nutzen u/v/temp ohne erneuten Fetch+Decode. Singleton-Worker hält den Cache.
const gridCache = new Map<string, GfsGrid>();
const GRID_CACHE_MAX = 72;  // ~24 Animationsframes × 3 Felder (je ~260 KB)

/** Lädt + dekodiert ein GFS-Feld (z. B. ":TMP:2 m above ground:"), mit Cache. */
export async function fetchGfsGrid(run: GfsRun, fhour: number, match: string, signal?: AbortSignal): Promise<GfsGrid> {
  const key = `${run.date}${run.hour}/${fhour}/${match}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const lines = await loadIdx(run, fhour, signal);
  const rng = findRange(lines, match);
  if (!rng) throw new Error(`GFS: Feld nicht im Index: ${match}`);
  const range = `bytes=${rng.start}-${rng.end ?? ''}`;
  const res = await fetch(runPath(run, fhour), { headers: { Range: range }, signal });
  if (!res.ok && res.status !== 206) throw new Error(`GFS Range ${res.status}`);
  const grid = decodeGribGfs(new Uint8Array(await res.arrayBuffer()));
  gridCache.set(key, grid);
  if (gridCache.size > GRID_CACHE_MAX) gridCache.delete(gridCache.keys().next().value!);
  return grid;
}

// --- GRIB2-Decoder (GDT 0 lat-lon · DRT 0/1 simple ODER DRT 3 complex+diff) --

function sm16(v: number): number { return v & 0x8000 ? -(v & 0x7fff) : v; }

export function decodeGribGfs(raw: Uint8Array): GfsGrid {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let p = 0;
  while (p < raw.length - 4 && !(raw[p] === 71 && raw[p + 1] === 82 && raw[p + 2] === 73 && raw[p + 3] === 66)) p++;
  if (p >= raw.length - 4) throw new Error('GRIB2: kein Indikator');

  let s5 = -1, s7 = -1, s6 = -1;
  let ni = 0, nj = 0, scanMode = 0;
  let off = p + 16;
  while (off < raw.length - 4) {
    if (raw[off] === 0x37 && raw[off + 1] === 0x37 && raw[off + 2] === 0x37 && raw[off + 3] === 0x37) break;
    const len = dv.getUint32(off), num = raw[off + 4];
    if (len < 5 || off + len > raw.length) throw new Error('GRIB2: Sektionslänge');
    if (num === 3) {
      const gdt = dv.getUint16(off + 12);
      if (gdt !== 0) throw new Error('GRIB2 GDT ' + gdt);
      ni = dv.getUint32(off + 30); nj = dv.getUint32(off + 34); scanMode = raw[off + 71];
    } else if (num === 5) s5 = off;
    else if (num === 6) s6 = off;
    else if (num === 7) s7 = off;
    off += len;
  }
  if (s5 < 0 || s7 < 0 || !ni || !nj) throw new Error('GRIB2: Sektionen fehlen');

  const drt = dv.getUint16(s5 + 9);
  const R = dv.getFloat32(s5 + 11);
  const E = sm16(dv.getUint16(s5 + 15));
  const D = sm16(dv.getUint16(s5 + 17));
  const sE = Math.pow(2, E), sD = Math.pow(10, -D);

  const npoints = ni * nj;
  const out = new Float32Array(npoints);

  if (drt === 0 || drt === 1) {
    // Simple Packing (mit optionaler Bitmap).
    const nbits = raw[s5 + 19];
    let bitmap: Uint8Array | null = null;
    if (s6 >= 0) { const bmi = raw[s6 + 5]; if (bmi === 0) bitmap = raw.subarray(s6 + 6, s6 + dv.getUint32(s6)); }
    const data = raw.subarray(s7 + 5);
    let di = 0;
    for (let k = 0; k < npoints; k++) {
      const present = !bitmap || ((bitmap[k >> 3] >> (7 - (k & 7))) & 1) === 1;
      if (!present) { out[k] = NaN; continue; }
      let v = 0;
      if (nbits === 0) v = 0;
      else if (nbits === 16) v = (data[di * 2] << 8) | data[di * 2 + 1];
      else { let bo = di * nbits; for (let b = 0; b < nbits; b++) { v = (v << 1) | ((data[bo >> 3] >> (7 - (bo & 7))) & 1); bo++; } }
      out[k] = (R + v * sE) * sD;
      di++;
    }
    return { values: out, ni, nj, scanMode };
  }

  if (drt !== 2 && drt !== 3) throw new Error('GRIB2 DRT ' + drt);

  // Complex Packing (DRT 2) / + Spatial Differencing (DRT 3).
  const nbits = raw[s5 + 19];
  const NG = dv.getUint32(s5 + 31);
  const refGW = raw[s5 + 35], nbitsGW = raw[s5 + 36];
  const refGL = dv.getUint32(s5 + 37), incrGL = raw[s5 + 41], lastGL = dv.getUint32(s5 + 42), nbitsGL = raw[s5 + 46];
  const order = drt === 3 ? raw[s5 + 47] : 0;
  const extraOct = drt === 3 ? raw[s5 + 48] : 0;

  let dpos = s7 + 5, bitbuf = 0, bitcnt = 0;
  const rd = (n: number): number => {
    if (n === 0) return 0;
    while (bitcnt < n) { bitbuf = (bitbuf << 8) | raw[dpos++]; bitcnt += 8; }
    bitcnt -= n;
    return (bitbuf >>> bitcnt) & ((1 << n) - 1);
  };
  const align = () => { bitbuf = 0; bitcnt = 0; };
  const rdExtra = (): number => {
    let v = 0; for (let i = 0; i < extraOct; i++) v = (v << 8) | raw[dpos++];
    const sign = 1 << (extraOct * 8 - 1);
    return v & sign ? -(v & (sign - 1)) : v;
  };

  // Spatial-Diff-Erstwerte + Bias (gMin).
  const firstVals: number[] = [];
  let gMin = 0;
  if (drt === 3) { for (let i = 0; i < order; i++) firstVals.push(rdExtra()); gMin = rdExtra(); }

  const gref = new Int32Array(NG); for (let i = 0; i < NG; i++) gref[i] = rd(nbits); align();
  const gw = new Int32Array(NG); for (let i = 0; i < NG; i++) gw[i] = refGW + rd(nbitsGW); align();
  const gl = new Int32Array(NG); for (let i = 0; i < NG; i++) gl[i] = refGL + rd(nbitsGL) * incrGL; gl[NG - 1] = lastGL; align();

  const vals = new Float64Array(npoints);
  let k = 0;
  for (let g = 0; g < NG; g++) {
    const w = gw[g], base = gref[g], L = gl[g];
    if (w === 0) { for (let j = 0; j < L && k < npoints; j++) vals[k++] = base; }
    else { for (let j = 0; j < L && k < npoints; j++) vals[k++] = base + rd(w); }
  }

  if (drt === 3 && order > 0) {
    for (let i = order; i < npoints; i++) vals[i] += gMin;
    if (order >= 1) vals[0] = firstVals[0];
    if (order >= 2) vals[1] = firstVals[1];
    if (order === 1) { for (let i = 1; i < npoints; i++) vals[i] += vals[i - 1]; }
    else if (order === 2) { for (let i = 2; i < npoints; i++) vals[i] = vals[i] + 2 * vals[i - 1] - vals[i - 2]; }
  }

  for (let i = 0; i < npoints; i++) out[i] = (R + vals[i] * sE) * sD;
  return { values: out, ni, nj, scanMode };
}

// --- Resampling GFS (0..360°E, Nord→Süd) → äquirektangular -180..180 ---------

/** Sampelt das GFS-Gitter an (lng,lat) **bilinear**. lng −180..180, lat −90..90.
 *  Bilinear statt Nearest ist entscheidend: das 1°-Gitter (360×181) sähe sonst
 *  beim Hochsampeln als harte Kacheln aus (GPU-Glättung kann identische Blöcke
 *  nicht mehr verschmelzen). Längengrad wrappt (col 359↔0). */
export function sampleGfs(grid: GfsGrid, lng: number, lat: number): number {
  const { values, ni, nj } = grid;
  const gLon = ((lng % 360) + 360) % 360;      // 0..360 (Spaltenschritt = 360/ni)
  const fx = (gLon / 360) * ni;
  const x0 = Math.floor(fx) % ni, x1 = (x0 + 1) % ni, tx = fx - Math.floor(fx);
  const fy = Math.max(0, Math.min(nj - 1, 90 - lat));  // Zeile (Nord→Süd)
  const y0 = Math.floor(fy), y1 = Math.min(nj - 1, y0 + 1), ty = fy - y0;
  const v00 = values[y0 * ni + x0], v10 = values[y0 * ni + x1];
  const v01 = values[y1 * ni + x0], v11 = values[y1 * ni + x1];
  // NaN-tolerant (Felder mit Bitmap): mittelt nur über vorhandene Nachbarn.
  if (Number.isNaN(v00) || Number.isNaN(v10) || Number.isNaN(v01) || Number.isNaN(v11)) {
    let s = 0, n = 0;
    for (const w of [[v00, (1 - tx) * (1 - ty)], [v10, tx * (1 - ty)], [v01, (1 - tx) * ty], [v11, tx * ty]] as const) {
      if (!Number.isNaN(w[0])) { s += w[0] * w[1]; n += w[1]; }
    }
    return n > 0 ? s / n : NaN;
  }
  const top = v00 + (v10 - v00) * tx, bot = v01 + (v11 - v01) * tx;
  return top + (bot - top) * ty;
}

// --- Farb-Rampen (worker-tauglich, rein) ------------------------------------
function ramp(stops: Array<[number, [number, number, number]]>, x: number): [number, number, number] {
  if (x <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, c0] = stops[i], [x1, c1] = stops[i + 1];
    if (x >= x0 && x <= x1) { const t = (x - x0) / (x1 - x0); return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]; }
  }
  return last[1];
}
const TEMP_STOPS: Array<[number, [number, number, number]]> = [
  [-60, [30, 20, 80]], [-50, [40, 55, 118]], [-40, [45, 78, 150]], [-30, [48, 108, 172]],
  [-20, [60, 138, 182]], [-10, [80, 164, 178]], [-2, [98, 178, 158]], [6, [118, 182, 122]],
  [14, [162, 184, 88]], [22, [196, 174, 72]], [28, [208, 138, 60]], [34, [196, 92, 54]],
  [42, [168, 52, 46]], [50, [128, 26, 36]],
];
export function tempColorC(c: number): [number, number, number] { return ramp(TEMP_STOPS, c); }
const RH_STOPS: Array<[number, [number, number, number]]> = [
  [0, [120, 96, 64]], [25, [156, 140, 88]], [45, [150, 160, 100]], [60, [104, 156, 116]], [78, [70, 144, 152]], [92, [54, 100, 170]], [100, [60, 70, 150]],
];
const MSLP_STOPS: Array<[number, [number, number, number]]> = [
  [955, [78, 42, 120]], [980, [60, 96, 168]], [1000, [90, 150, 168]], [1013, [150, 168, 140]], [1024, [206, 176, 92]], [1040, [196, 110, 64]], [1060, [150, 56, 52]],
];

// --- Variablen / Höhen ------------------------------------------------------
export type Height = 'sfc' | '850' | '500' | '250';
export type OverlayKind = 'none' | 'wind' | 'temp' | 'rh' | 'mslp';
export interface GlobeSel { height: Height; overlay: OverlayKind; }

function fieldNames(h: Height) {
  if (h === 'sfc') return { u: ':UGRD:10 m above ground:', v: ':VGRD:10 m above ground:', t: ':TMP:2 m above ground:', rh: ':RH:2 m above ground:' };
  return { u: `:UGRD:${h} mb:`, v: `:VGRD:${h} mb:`, t: `:TMP:${h} mb:`, rh: `:RH:${h} mb:` };
}

export interface GlobeRaw {
  run: GfsRun; fhour: number; validMs: number; w: number; h: number;
  windRGBA: Uint8ClampedArray;
  windMeta: { width: number; height: number; uMin: number; uMax: number; vMin: number; vMax: number };
  windU: Float32Array; windV: Float32Array;
  tempC: Float32Array;                 // Readout-Temperatur (°C) am Level
  overlay: OverlayKind;
  overlayRGBA: Uint8ClampedArray | null;
}

function resampleScalar(g: GfsGrid, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { const lat = 90 - (y / (h - 1)) * 180; for (let x = 0; x < w; x++) { out[y * w + x] = sampleGfs(g, -180 + (x / (w - 1)) * 360, lat); } }
  return out;
}

export function runValidMs(run: GfsRun, fhour: number): number {
  const base = Date.UTC(+run.date.slice(0, 4), +run.date.slice(4, 6) - 1, +run.date.slice(6, 8), +run.hour);
  return base + fhour * 3600_000;
}

/** Lädt die Felder eines Vorlaufs nur in den Cache (Fetch+Decode, KEIN Resample)
 *  — Vorab-Laden kommender Animationsframes, damit `buildGlobeData` dann sofort
 *  aus dem Cache rendert (flüssiges Abspielen). Best-effort (Fehler ignoriert). */
export async function prefetchFields(run: GfsRun, fhour: number, sel: GlobeSel): Promise<void> {
  const f = fieldNames(sel.height);
  const jobs: Promise<unknown>[] = [
    fetchGfsGrid(run, fhour, f.u), fetchGfsGrid(run, fhour, f.v), fetchGfsGrid(run, fhour, f.t),
  ];
  if (sel.overlay === 'rh') jobs.push(fetchGfsGrid(run, fhour, f.rh));
  if (sel.overlay === 'mslp') jobs.push(fetchGfsGrid(run, fhour, ':PRMSL:mean sea level:'));
  await Promise.allSettled(jobs);
}

/** Lädt + verarbeitet alle Globus-Felder zu ROHEN Buffern (kein document/canvas)
 *  → im Worker lauffähig, Buffer per Transfer zurück an den Main-Thread. */
export async function buildGlobeData(run: GfsRun, fhour: number, sel: GlobeSel, signal?: AbortSignal): Promise<GlobeRaw> {
  const f = fieldNames(sel.height);
  const W = 720, H = 361, N = W * H;
  const base = await Promise.all([
    fetchGfsGrid(run, fhour, f.u, signal),
    fetchGfsGrid(run, fhour, f.v, signal),
    fetchGfsGrid(run, fhour, f.t, signal),
  ]);
  const u = resampleScalar(base[0], W, H), v = resampleScalar(base[1], W, H), tK = resampleScalar(base[2], W, H);

  // Wind-RGBA (u→R, v→G, normiert) + Meta.
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < N; i++) { if (u[i] < uMin) uMin = u[i]; if (u[i] > uMax) uMax = u[i]; if (v[i] < vMin) vMin = v[i]; if (v[i] > vMax) vMax = v[i]; }
  const windRGBA = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const o = i * 4; windRGBA[o] = Math.round(((u[i] - uMin) / (uMax - uMin || 1)) * 255); windRGBA[o + 1] = Math.round(((v[i] - vMin) / (vMax - vMin || 1)) * 255); windRGBA[o + 3] = 255; }

  const tempC = new Float32Array(N);
  for (let i = 0; i < N; i++) tempC[i] = tK[i] - 273.15;

  // Overlay-RGBA je nach Auswahl.
  let overlayRGBA: Uint8ClampedArray | null = null;
  if (sel.overlay !== 'none') {
    overlayRGBA = new Uint8ClampedArray(N * 4);
    if (sel.overlay === 'wind') {
      for (let i = 0; i < N; i++) { const c = ramp(WIND_RAMP, Math.hypot(u[i], v[i])); const o = i * 4; overlayRGBA[o] = c[0]; overlayRGBA[o + 1] = c[1]; overlayRGBA[o + 2] = c[2]; overlayRGBA[o + 3] = 255; }
    } else if (sel.overlay === 'temp') {
      for (let i = 0; i < N; i++) { const c = ramp(TEMP_STOPS, tempC[i]); const o = i * 4; overlayRGBA[o] = c[0]; overlayRGBA[o + 1] = c[1]; overlayRGBA[o + 2] = c[2]; overlayRGBA[o + 3] = 255; }
    } else if (sel.overlay === 'rh') {
      const rhG = await fetchGfsGrid(run, fhour, f.rh, signal); const rh = resampleScalar(rhG, W, H);
      for (let i = 0; i < N; i++) { const c = ramp(RH_STOPS, rh[i]); const o = i * 4; overlayRGBA[o] = c[0]; overlayRGBA[o + 1] = c[1]; overlayRGBA[o + 2] = c[2]; overlayRGBA[o + 3] = 255; }
    } else if (sel.overlay === 'mslp') {
      const pG = await fetchGfsGrid(run, fhour, ':PRMSL:mean sea level:', signal); const p = resampleScalar(pG, W, H);
      for (let i = 0; i < N; i++) { const c = ramp(MSLP_STOPS, p[i] / 100); const o = i * 4; overlayRGBA[o] = c[0]; overlayRGBA[o + 1] = c[1]; overlayRGBA[o + 2] = c[2]; overlayRGBA[o + 3] = 255; }
    }
  }

  return {
    run, fhour, validMs: runValidMs(run, fhour), w: W, h: H,
    windRGBA, windMeta: { width: W, height: H, uMin, uMax, vMin, vMax },
    windU: u, windV: v, tempC, overlay: sel.overlay, overlayRGBA,
  };
}

// Wind-Geschwindigkeits-Rampe (m/s) — gespiegelt aus windSample.WIND_STOPS, hier
// inline gehalten, damit der Worker keine DOM-Module (windSample) importieren muss.
const WIND_RAMP: Array<[number, [number, number, number]]> = [
  [0, [42, 48, 74]], [3, [38, 92, 110]], [6, [44, 142, 120]], [10, [96, 184, 92]],
  [15, [184, 200, 72]], [20, [232, 176, 60]], [28, [236, 112, 56]], [38, [212, 60, 72]],
  [50, [184, 60, 134]], [70, [222, 162, 220]],
];

