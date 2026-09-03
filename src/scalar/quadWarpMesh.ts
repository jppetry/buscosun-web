/**
 * Warp-Mesh-Dichte — die EINE Stelle dafür, wie fein ein Custom-GL-Layer sein
 * Gitter unterteilt (`audit/karten-layer-verortung.md` §14 + §15).
 *
 * Ein Warp-Mesh tut zwei Dinge: (1) es hebt die Quellprojektion auf (RADOLAN
 * polar-stereografisch, INCA Lambert, rzc LV95 — `de1200WarpMesh` & Co.), und
 * (2) es unterteilt fein genug, dass die GPU-Interpolation stimmt. Aufgabe 2
 * braucht JEDES Gitter, auch ein reguläres lat/lon-Gitter: der Vertex-Shader
 * rechnet die Knoten nach Mercator, die GPU interpoliert dazwischen linear in
 * Mercator-y, die Texturzeilen (bzw. `v_equi_uv`) liegen aber äquidistant in
 * Breite. Über ein Breitenband Δφ ist der schlimmste Versatz
 *
 *     e = Δφ² · tan φ / 8 · R          (Δφ in rad; gemessen auf 1 % genau)
 *
 * — über die 10,2° des DACH-Komposits **30,5 km** (KL8, live 29,3 km), über die
 * 2,66°-Bänder des früheren 128 × 64-Weltmeshs **2,0 km** bei 50 N. Daraus folgt
 * die Zeilenregel: das Band darf höchstens `sqrt(8·e/(R·tan φ))` breit sein.
 * Ziel `WARP_TARGET_KM` = 1 m — unter dem Float32-Boden des Vertex-Pfads
 * (Knoten 0,22 m, Mercator-Weltkoordinate im Shader 1,2–2,4 m) und drei
 * Größenordnungen unter jeder Datenzelle (1–2,2 km).
 *
 * Zwei gemessene Lehren (§15.3): bei achsparallelen lat/lon-Gittern trägt
 * **nur** die Breitenunterteilung (Mercator-x ist in der Länge exakt linear);
 * bei projizierten Gittern krümmen sich beide Richtungen ⇒ N² — und deren
 * Knoten werden nicht einzeln invertiert (320² · `psInv` = 211 ms), sondern
 * aus einem exakten 64²-Gitter **bikubisch** verfeinert (Fehler ∝ h⁴, gemessen
 * ≤ 18 mm gegen die direkte Inverse; `warpMeshFromProjection`).
 *
 * Konvention identisch zu `RainLayer.setFrame(warpLnglat)`: (nx+1)·(ny+1)
 * lon/lat-Paare, Index `(j*(nx+1)+i)*2`, i = u (0 = West … 1 = Ost), j = v
 * (0 = Nord … 1 = Süd). Rein, DOM-frei, headless prüfbar
 * (`verify:layer-geometry`).
 *
 * Memoisiert je Ecken-REFERENZ: `RainLayer` entscheidet über `geomKey`
 * (Referenzgleichheit von `warpLnglat`), ob der GL-Puffer neu gebaut wird —
 * dieselben Ecken müssen deshalb dasselbe Array liefern.
 */

import type { QuadCorners } from './RainLayer';

/** Ziel-Restfehler des Meshs (km). 1 m — s. Kopfkommentar. */
export const WARP_TARGET_KM = 0.001;
/** Spalten eines lat/lon-Quads. Für die Verortung reicht 1 (Mercator-x ist in
 *  der Länge linear); 8 hält die Dreiecke handlich und deckt schief liegende
 *  Ecken mit ab. */
export const QUAD_WARP_COLS = 8;
/** Grobes Gitter, aus dem projizierte Meshes bikubisch verfeinert werden. */
export const WARP_COARSE_N = 64;
/** Harter Deckel der Zeilenzahl eines Footprint-Meshs (Welt ±85° braucht 2 921). */
export const WARP_MAX_ROWS = 4096;
/** Breitestes Band (Grad), das die Zeilenregel je vergibt (am Äquator ist tan φ → 0). */
export const WARP_MAX_BAND_DEG = 2;
/** Mercator-Grenzbreite (wie MapLibre). */
export const MERC_MAX_LAT = 85.05112878;
/** Die Bandformel ist der Leitterm; die 2-D-Simulation misst ~10 % mehr (1,1 m
 *  bei 192 Zeilen). Der Faktor deckt die Terme höherer Ordnung (Rest ∝ Faktor²). */
export const WARP_BAND_SAFETY = 0.9;

const EARTH_R_KM = 6371.0088;
const DEG = Math.PI / 180;

/**
 * Breitestes Band (Grad), das bei der Breite `latDeg` (Betrag) noch höchstens
 * `targetKm` Mercator-Rest hat — die Umkehrung der Formel im Kopfkommentar,
 * mit `WARP_BAND_SAFETY`.
 */
export function warpBandDeg(latDeg: number, targetKm: number = WARP_TARGET_KM): number {
  const phi = Math.min(Math.abs(latDeg), 89.9) * DEG;
  const t = Math.max(Math.tan(phi), 1e-9);
  return Math.min(WARP_MAX_BAND_DEG, (WARP_BAND_SAFETY * Math.sqrt((8 * targetKm) / (EARTH_R_KM * t))) / DEG);
}

/**
 * Uniforme Zeilenzahl für ein Quad zwischen `latMin` und `latMax` (für Meshes,
 * deren uv über `j/ny` läuft — RainLayer/CloudLayer). Bemessen an der
 * äquatorfernsten Breite, also überall ≤ Ziel.
 */
export function warpRowsFor(latMin: number, latMax: number, targetKm: number = WARP_TARGET_KM): number {
  const span = Math.abs(latMax - latMin);
  const band = warpBandDeg(Math.max(Math.abs(latMin), Math.abs(latMax)), targetKm);
  return Math.max(1, Math.min(WARP_MAX_ROWS, Math.ceil(span / band - 1e-9)));
}

/**
 * Nicht-uniforme Zeilen (Breiten, Süd → Nord, erste = `latS`, letzte = `latN`)
 * für Meshes, deren Shader uv aus der Breite selbst rechnet (`v_equi_uv` der
 * ScalarLayer-Familie): jedes Band so breit, wie es seine äquatorfernste
 * Breite erlaubt — äquatornah 2°, bei 50 N 0,06°, bei 85 N 0,01°. Überschreitet
 * der Marsch `maxRows`, wird uniform mit `maxRows` unterteilt (gedeckelt,
 * gröber — nie unbegrenzt).
 */
export function latRowsFor(
  latS: number, latN: number, targetKm: number = WARP_TARGET_KM, maxRows: number = WARP_MAX_ROWS,
): Float64Array {
  const rows: number[] = [latS];
  let lat = latS;
  while (lat < latN && rows.length <= maxRows) {
    const guess = Math.min(latN, lat + warpBandDeg(Math.abs(lat), targetKm));
    const far = Math.max(Math.abs(lat), Math.abs(guess));
    lat = Math.min(latN, lat + warpBandDeg(far, targetKm));
    rows.push(lat);
  }
  if (rows.length > maxRows + 1) {
    const out = new Float64Array(maxRows + 1);
    for (let k = 0; k <= maxRows; k++) out[k] = latS + ((latN - latS) * k) / maxRows;
    return out;
  }
  return Float64Array.from(rows);
}

/** Zeilenzahl eines lat/lon-Quads aus seinen Ecken. */
export function quadWarpRows(corners: QuadCorners, targetKm: number = WARP_TARGET_KM): number {
  const lats = corners.map((c) => c[1]);
  return warpRowsFor(Math.min(...lats), Math.max(...lats), targetKm);
}

const quadCache = new WeakMap<QuadCorners, Map<string, Float32Array>>();

/**
 * Bilineares Mesh über ein Vier-Eck [NW, NE, SE, SW] in lon/lat: (nx+1)·(ny+1)
 * Knoten. Zeilen per Default aus `quadWarpRows` (≤ 1 m Rest).
 */
export function quadWarpMesh(
  corners: QuadCorners, nx: number = QUAD_WARP_COLS, ny: number = quadWarpRows(corners),
): Float32Array {
  const key = `${nx}x${ny}`;
  let per = quadCache.get(corners);
  const hit = per?.get(key);
  if (hit) return hit;
  const [nw, ne, se, sw] = corners;
  const stride = nx + 1;
  const out = new Float32Array(stride * (ny + 1) * 2);
  for (let j = 0; j <= ny; j++) {
    const v = j / ny;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const k = (j * stride + i) * 2;
      out[k] = (1 - u) * (1 - v) * nw[0] + u * (1 - v) * ne[0] + u * v * se[0] + (1 - u) * v * sw[0];
      out[k + 1] = (1 - u) * (1 - v) * nw[1] + u * (1 - v) * ne[1] + u * v * se[1] + (1 - u) * v * sw[1];
    }
  }
  if (!per) { per = new Map(); quadCache.set(corners, per); }
  per.set(key, out);
  return out;
}

export interface WarpMeshGeometry {
  /** (nx+1)·(ny+1) uv-Paare, Knotenreihenfolge wie das Mesh. */
  uv: Float32Array;
  /** Dreiecksindizes je Masche (NW,NE,SE / NW,SE,SW) — Uint16, solange es reicht. */
  indices: Uint16Array | Uint32Array;
}

const geomCache = new Map<string, WarpMeshGeometry>();

/**
 * uv- und Index-Puffer für ein nx × ny-Mesh (Knoten = Mesh-Array selbst, nicht
 * expandiert: 320² expandiert wären 9,8 MB, indiziert 4,1 MB). Memoisiert —
 * alle Layer mit gleicher Unterteilung teilen sich die Arrays.
 */
export function warpMeshGeometry(nx: number, ny: number): WarpMeshGeometry {
  const key = `${nx}x${ny}`;
  const hit = geomCache.get(key);
  if (hit) return hit;
  const stride = nx + 1, nodes = stride * (ny + 1);
  const uv = new Float32Array(nodes * 2);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const k = (j * stride + i) * 2;
    uv[k] = i / nx; uv[k + 1] = j / ny;
  }
  const indices = nodes <= 65536 ? new Uint16Array(nx * ny * 6) : new Uint32Array(nx * ny * 6);
  let p = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const nwI = j * stride + i, neI = nwI + 1, swI = nwI + stride, seI = swI + 1;
    indices[p++] = nwI; indices[p++] = neI; indices[p++] = seI;
    indices[p++] = nwI; indices[p++] = seI; indices[p++] = swI;
  }
  const g = { uv, indices };
  geomCache.set(key, g);
  return g;
}

/** Catmull-Rom-Gewichte für t ∈ [0,1]. */
function catmullRom(t: number): [number, number, number, number] {
  const t2 = t * t, t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

/**
 * Quadratisches n × n-Mesh eines PROJIZIERTEN Gitters: `node(u, v)` liefert die
 * exakte lon/lat-Lage des Gitterpunkts (u, v ∈ [0,1] — darf auch knapp außerhalb
 * liegen, für den Geisterring). Gerechnet wird ein `coarse`²-Gitter exakt (+ 1
 * Ring), die feinen Knoten bikubisch (Catmull-Rom, Fehler ∝ h⁴ — gemessen
 * ≤ 18 mm für DE1200 320², §15.4). Nicht für Gitter über die Datumsgrenze.
 */
export function warpMeshFromProjection(
  node: (u: number, v: number) => [number, number], n: number, coarse: number = WARP_COARSE_N,
): Float32Array {
  const out = new Float32Array((n + 1) * (n + 1) * 2);
  if (n <= coarse) {
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const ll = node(i / n, j / n), k = (j * (n + 1) + i) * 2;
      out[k] = ll[0]; out[k + 1] = ll[1];
    }
    return out;
  }
  const S = coarse + 3;                       // Geisterring ±1
  const c = new Float64Array(S * S * 2);
  for (let j = -1; j <= coarse + 1; j++) for (let i = -1; i <= coarse + 1; i++) {
    const ll = node(i / coarse, j / coarse), k = ((j + 1) * S + (i + 1)) * 2;
    c[k] = ll[0]; c[k + 1] = ll[1];
  }
  for (let j = 0; j <= n; j++) {
    const fy = (j / n) * coarse, cy = Math.min(coarse - 1, Math.floor(fy)), wy = catmullRom(fy - cy);
    for (let i = 0; i <= n; i++) {
      const fx = (i / n) * coarse, cx = Math.min(coarse - 1, Math.floor(fx)), wx = catmullRom(fx - cx);
      let lon = 0, lat = 0;
      for (let b = 0; b < 4; b++) {
        const row = (cy + b) * S + cx;
        let rlo = 0, rla = 0;
        for (let a = 0; a < 4; a++) { const k = (row + a) * 2; rlo += wx[a] * c[k]; rla += wx[a] * c[k + 1]; }
        lon += wy[b] * rlo; lat += wy[b] * rla;
      }
      const k = (j * (n + 1) + i) * 2;
      out[k] = lon; out[k + 1] = lat;
    }
  }
  return out;
}

/** Äquirektangular-uv-Bounds (x0,y0,x1,y1) → [NW, NE, SE, SW] in [lng, lat]:
 *  x = (lng+180)/360, y = (90−lat)/180 invertiert. */
export function uvBoundsToCorners(uv: [number, number, number, number]): QuadCorners {
  const west = uv[0] * 360 - 180, north = 90 - uv[1] * 180;
  const east = uv[2] * 360 - 180, south = 90 - uv[3] * 180;
  return [[west, north], [east, north], [east, south], [west, south]];
}

const footprintCache = new Map<string, Float32Array>();
const FOOTPRINT_CACHE_MAX = 8;

/**
 * Footprint-Mesh für die ScalarLayer-Familie (`ScalarLayer`, `ConfidenceLayer`,
 * Wind-Heatmap): expandierte Dreiecke (lon, lat je Vertex, `drawArrays`) über
 * die Daten-uvBounds statt über die ganze Welt — Zeilen nicht-uniform aus
 * `latRowsFor` (≤ 1 m), `QUAD_WARP_COLS` Spalten. Der Shader rechnet uv aus der
 * Breite selbst, deshalb sind die Zeilen frei platzierbar. Breite auf
 * ±`MERC_MAX_LAT` geklemmt (Welt-Bounds [0,0,1,1] ⇒ 2 921 Zeilen).
 */
export function equiFootprintMesh(
  uvBounds: [number, number, number, number], targetKm: number = WARP_TARGET_KM,
): Float32Array {
  const key = `${uvBounds.join(',')}|${targetKm}`;
  const hit = footprintCache.get(key);
  if (hit) return hit;
  const west = uvBounds[0] * 360 - 180, east = uvBounds[2] * 360 - 180;
  const north = Math.min(MERC_MAX_LAT, 90 - uvBounds[1] * 180);
  const south = Math.max(-MERC_MAX_LAT, 90 - uvBounds[3] * 180);
  const rows = latRowsFor(south, north, targetKm);
  const cols = QUAD_WARP_COLS, bands = rows.length - 1;
  const out = new Float32Array(bands * cols * 12);
  let p = 0;
  for (let j = 0; j < bands; j++) {
    const lat0 = rows[j], lat1 = rows[j + 1];
    for (let i = 0; i < cols; i++) {
      const lng0 = west + ((east - west) * i) / cols, lng1 = west + ((east - west) * (i + 1)) / cols;
      out[p++] = lng0; out[p++] = lat0; out[p++] = lng1; out[p++] = lat0; out[p++] = lng0; out[p++] = lat1;
      out[p++] = lng0; out[p++] = lat1; out[p++] = lng1; out[p++] = lat0; out[p++] = lng1; out[p++] = lat1;
    }
  }
  if (footprintCache.size >= FOOTPRINT_CACHE_MAX) footprintCache.delete(footprintCache.keys().next().value!);
  footprintCache.set(key, out);
  return out;
}

/** Mercator-Weltkoordinate (wie MapLibre: x, y ∈ [0,1], y nach Süden) in double. */
export function mercXY(lon: number, lat: number): [number, number] {
  const phi = Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, lat)) * DEG;
  return [(lon + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI)];
}

const mercCache = new WeakMap<Float32Array, Float32Array>();

/**
 * lon/lat-Paare → Mercator-Paare (Attribut `a_merc` der Raster-Vertex-Shader).
 * KL9/V-KL-3 (§15.6): der Vertex-Shader rechnete `log(tan(π/4 + φ/2))` selbst —
 * GPU-Transzendente in Float32 haben ~1e-6 relativen Fehler, auf 40 075 km
 * Weltumfang **bis 280 m** (Intel/ANGLE gemessen, `highp` ändert nichts). Hier
 * in double gerechnet bleibt nur der Float32-Speicherboden (my ≈ 0,34: 1,2 m;
 * mx ≈ 0,53: 2,4 m). Memoisiert je Array-Referenz (die Meshes sind es auch).
 */
export function mercatorOf(lnglat: Float32Array): Float32Array {
  const hit = mercCache.get(lnglat);
  if (hit) return hit;
  const out = new Float32Array(lnglat.length);
  for (let k = 0; k < lnglat.length; k += 2) {
    const m = mercXY(lnglat[k], lnglat[k + 1]);
    out[k] = m[0]; out[k + 1] = m[1];
  }
  mercCache.set(lnglat, out);
  return out;
}

// ---------------------------------------------------------------------------
// KL10 (§15.8): Mercator-y-Tabelle für die Wind-PARTIKEL. Deren Lage entsteht
// auf der GPU (Simulation) — es gibt keinen CPU-Knoten, dem man `a_merc`
// mitgeben könnte. Statt log(tan()) im Zeichen-Shader (bis 280 m, §15.6) liest
// er eine 64 × 64-RGBA8-Tabelle: Eintrag i = Mercator-y der equirect-Breite
// y = Y0 + i/(N−1)·(Y1−Y0) (Nord → Süd, ±85,05°), als 32-bit-Festkomma über
// vier Bytes, dazwischen linear gemischt (zwei Taps). Restfehler: Tabellenschritt
// 0,0415° ⇒ ≤ 0,7 m bei 58 N (Δφ²·tan φ/8·R), Float32-Dekode ≈ 1,2 m. Der
// Boden der Partikel bleibt ihre 2-Byte-Positionskodierung (~25 m über DACH).
// Weltweit und konstant ⇒ einmal gebaut, unabhängig von den Bounds.
// ---------------------------------------------------------------------------
export const MERC_TABLE_DIM = 64;
export const MERC_TABLE_SIZE = MERC_TABLE_DIM * MERC_TABLE_DIM;
/** equirect-y (0 = Nordpol … 1 = Südpol) des Nord- bzw. Südrands der Tabelle. */
export const MERC_TABLE_Y0 = (90 - MERC_MAX_LAT) / 180;
export const MERC_TABLE_Y1 = (90 + MERC_MAX_LAT) / 180;

let _mercTable: Uint8Array | null = null;

/** RGBA8-Bytes der Tabelle (N · 4), Eintrag i big-endian: my ≈ (b0·2²⁴ + b1·2¹⁶ + b2·2⁸ + b3) / 2³². */
export function mercYTable(): Uint8Array {
  if (_mercTable) return _mercTable;
  const N = MERC_TABLE_SIZE;
  const out = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const y = MERC_TABLE_Y0 + (i / (N - 1)) * (MERC_TABLE_Y1 - MERC_TABLE_Y0);
    const my = mercXY(0, 90 - y * 180)[1];
    const v = Math.min(4294967295, Math.max(0, Math.round(my * 4294967296)));
    out[i * 4] = Math.floor(v / 16777216) & 255;
    out[i * 4 + 1] = Math.floor(v / 65536) & 255;
    out[i * 4 + 2] = Math.floor(v / 256) & 255;
    out[i * 4 + 3] = v & 255;
  }
  _mercTable = out;
  return out;
}

/** Spiegel der Shader-Dekode (`mercYOf` in `wind/shaders.ts`) — für den Verifier. */
export function mercYFromTable(equiY: number, table: Uint8Array = mercYTable()): number {
  const N = MERC_TABLE_SIZE;
  const at = (i: number) => {
    const c = [table[i * 4] / 255, table[i * 4 + 1] / 255, table[i * 4 + 2] / 255, table[i * 4 + 3] / 255];
    return Math.fround((c[0] + c[1] / 256 + c[2] / 65536 + c[3] / 16777216) * (255 / 256));
  };
  const f = Math.min(1, Math.max(0, (equiY - MERC_TABLE_Y0) / (MERC_TABLE_Y1 - MERC_TABLE_Y0))) * (N - 1);
  const i = Math.floor(Math.min(f, N - 2));
  return at(i) + (f - i) * (at(i + 1) - at(i));
}
