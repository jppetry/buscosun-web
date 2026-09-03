/**
 * Headless-Verifikation der Layer-Geometrie der Wetterkarte (Phase KL1–KL9,
 * `audit/karten-layer-verortung.md`).
 *
 * Der Vertrag, den dieses Skript festhält:
 *   **Die Stelle, an der die KARTE einen Gitterwert zeichnet, und die Stelle, an
 *   der die PUNKTABFRAGE ihn liest, sind derselbe Ort.**
 *
 * Gemessen wird gegen den ECHTEN App-Code (`subsampledCorners`, `texelCoord`,
 * `buildIndexMap`, `gridLatLon`) — nicht gegen eine Nachbildung. Die
 * Gitterparameter stammen aus `audit/karten-layer-verortung/probe-d2grid.mjs`,
 * das sie am echten GRIB gemessen hat.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-layer-geometry.mjs
 */
import { gribCorners, subsampledCorners } from '../src/sources/gribDecode.ts';
import { texelCoord } from '../src/wind/windPointSample.ts';
import { G, gridLatLon, buildIndexMap } from '../src/scalar/precipIndexMap.ts';
import { DE1200_CORNERS, psFwd, psInv, DE1200_WARP_N, de1200WarpMesh, de1200Node } from '../src/sources/radolanGeo.ts';
import { ensembleGrid } from '../src/scalar/confidenceImage.ts';
import {
  quadWarpMesh, quadWarpRows, warpRowsFor, latRowsFor, warpBandDeg, warpMeshGeometry, warpMeshFromProjection,
  equiFootprintMesh, uvBoundsToCorners, mercatorOf, mercXY, QUAD_WARP_COLS, WARP_TARGET_KM, WARP_MAX_ROWS, WARP_BAND_SAFETY, MERC_MAX_LAT,
  mercYTable, mercYFromTable, MERC_TABLE_DIM, MERC_TABLE_SIZE, MERC_TABLE_Y0, MERC_TABLE_Y1,
} from '../src/scalar/quadWarpMesh.ts';
import { readFileSync } from 'node:fs';
import { coarsenFrameU8, blockSpans } from '../src/ml/coarsen.ts';
import { cellCentersToEdges, incaWarpMesh, incaNodeFn, INCA_WARP_N } from '../src/sources/geosphereIncaGeo.ts';
import { rzcWarpMesh, rzcNodeFn, RZC_WARP_N } from '../src/sources/meteoSwissGeo.ts';
import { COMPOSITE_CORNERS, COMPOSITE_WARP_N, COMPOSITE_WARP_ROWS, compositeWarpMesh, PrecipCompositor } from '../src/scalar/precipComposite.ts';

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
// Gitter, wie sie die App wirklich lädt (am GRIB gemessen).
// ---------------------------------------------------------------------------
const D2 = { ni: 1215, nj: 746, lon1: -3.94, lon2: 20.34, lat1: 43.18, lat2: 58.08, di: 0.02, dj: 0.02 };
const EU = { ni: 1377, nj: 657, lon1: -23.5, lon2: 62.5, lat1: 29.5, lat2: 70.5, di: 0.0625, dj: 0.0625 };
const TARGET_WIDTH = 700;   // identisch in allen neun Raster-Quellen
const ssOf = (f) => Math.max(1, Math.ceil(f.ni / TARGET_WIDTH));

// ---------------------------------------------------------------------------
// (1) texelCoord IST die GPU-Konvention.
// ---------------------------------------------------------------------------
add('texelCoord: Texelmitte (i+0,5)/n trifft Texel i exakt',
  [0, 1, 7, 606, 607].every((i) => near(texelCoord((i + 0.5) / 608, 608), i, 1e-12)));
add('texelCoord klemmt am Rand (CLAMP_TO_EDGE), nie negativ / nie > n−1',
  texelCoord(0, 608) === 0 && texelCoord(1, 608) === 607
  && texelCoord(-1, 608) === 0 && texelCoord(2, 608) === 607);
add('texelCoord ist monoton', (() => {
  let prev = -1;
  for (let k = 0; k <= 1000; k++) { const t = texelCoord(k / 1000, 373); if (t < prev) return false; prev = t; }
  return true;
})());

// ---------------------------------------------------------------------------
// (2) subsampledCorners: Karte zeichnet jeden Wert auf SEINEN Abtastpunkt.
//     Das ist der Kern von KL3 — vorher lag dazwischen eine halbe Nativzelle.
// ---------------------------------------------------------------------------
for (const [name, f] of [['ICON-D2', D2], ['ICON-EU', EU]]) {
  const ss = ssOf(f);
  const W = Math.ceil(f.ni / ss), H = Math.ceil(f.nj / ss);
  const [NW, NE, , SW] = subsampledCorners(f, ss);
  const west = NW[0], east = NE[0], north = NW[1], south = SW[1];

  // Der Bildbauer legt in Ausgabespalte ii den Nativpunkt min(ni−1, ii·ss),
  // in Bildzeile y = H−1−jj den Nativpunkt min(nj−1, jj·ss) (north-up).
  let maxLon = 0, maxLat = 0;
  for (let ii = 0; ii < W; ii++) {
    const soll = f.lon1 + Math.min(f.ni - 1, ii * ss) * f.di;
    const ist = west + ((ii + 0.5) / W) * (east - west);      // Texelmitte des Shaders
    maxLon = Math.max(maxLon, Math.abs(ist - soll));
  }
  for (let y = 0; y < H; y++) {
    const jj = H - 1 - y;
    const soll = f.lat1 + Math.min(f.nj - 1, jj * ss) * f.dj;
    const ist = north + ((y + 0.5) / H) * (south - north);
    maxLat = Math.max(maxLat, Math.abs(ist - soll));
  }
  add(`${name}: Karte zeichnet jeden Wert auf seinen Abtastpunkt (${W}×${H})`,
    maxLon < 1e-9 && maxLat < 1e-9,
    `max Δlon ${maxLon.toExponential(2)}° · Δlat ${maxLat.toExponential(2)}°`);

  // Und der Regressionswächter: mit gribCorners wäre es NICHT null.
  const [gNW] = gribCorners(f);
  const altLat = Math.abs((gNW[1] + ((H - 1 - (H - 1) + 0.5) / H) * (gribCorners(f)[3][1] - gNW[1]))
    - (f.lat1 + (H - 1) * ss * f.dj));
  add(`${name}: der alte Weg (gribCorners) lag messbar daneben — der Fix ist kein No-op`,
    altLat > 1e-6, `${(altLat * 111.13).toFixed(2)} km`);

  // Karte ↔ Punktabfrage als ECHTER Rundlauf: nimm den Ort, an dem die Karte
  // Texel i zeichnet, gib ihn der Punktabfrage — sie muss exakt Texel i lesen.
  // (Ein Vergleich von texelCoord mit sich selbst würde nichts messen.)
  let maxRound = 0;
  for (const i of [0, 1, 2, Math.floor(W / 3), Math.floor(W / 2), W - 3, W - 2, W - 1]) {
    const lonGezeichnet = west + ((i + 0.5) / W) * (east - west);      // Shader
    const uvAbfrage = (lonGezeichnet - west) / (east - west);          // wie sampleXAt rechnet
    maxRound = Math.max(maxRound, Math.abs(texelCoord(uvAbfrage, W) - i));
  }
  for (const y of [0, 1, Math.floor(H / 2), H - 2, H - 1]) {
    const latGezeichnet = north + ((y + 0.5) / H) * (south - north);
    const uvAbfrage = (latGezeichnet - north) / (south - north);
    maxRound = Math.max(maxRound, Math.abs(texelCoord(uvAbfrage, H) - y));
  }
  add(`${name}: Rundlauf Karte → Punktabfrage trifft dasselbe Texel`,
    maxRound < 1e-9, `max ${maxRound.toExponential(2)} Texel`);
}

// ---------------------------------------------------------------------------
// (3) ss = 1 muss gribCorners exakt reproduzieren (Wolken-Layer, kein Subsampling).
// ---------------------------------------------------------------------------
add('subsampledCorners(f, 1) === gribCorners(f) (Wolken-Pfad unverändert)',
  JSON.stringify(subsampledCorners(D2, 1)) === JSON.stringify(gribCorners(D2)));

// ---------------------------------------------------------------------------
// (4) Die Klemmung `min(n−1, k·ss)` darf das Bild nicht dehnen.
// ---------------------------------------------------------------------------
{
  // Konstruiertes Gitter, bei dem das letzte Ausgabetexel geklemmt wird:
  // ni = 7, ss = 2 → W = 4, letzter Abtastpunkt wäre 6 = ni−1 (keine Klemmung);
  // ni = 6, ss = 4 → W = 2, (W−1)·ss = 4 < 5 → kein Duplikat;
  // ni = 5, ss = 4 → W = 2, (W−1)·ss = 4 = ni−1 → passt. Klemmung greift bei ni = 3, ss = 4.
  const f = { ni: 3, nj: 3, lon1: 0, lon2: 2, lat1: 0, lat2: 2, di: 1, dj: 1 };
  const ss = 4;                       // W = H = 1, (W−1)·ss = 0 → Abtastpunkt 0
  const [NW, NE] = subsampledCorners(f, ss);
  add('Klemmung: ein einzelnes Texel wird um SEINEN Punkt zentriert, nicht über das Gitter gedehnt',
    near((NW[0] + NE[0]) / 2, f.lon1, 1e-12), `Mitte ${(NW[0] + NE[0]) / 2}, Punkt ${f.lon1}`);
}

// ---------------------------------------------------------------------------
// (5) DACH-Komposit: die Zelle wird dort befüllt, wo sie gezeichnet wird.
// ---------------------------------------------------------------------------
{
  const { lat, lon } = gridLatLon();
  let maxLon = 0, maxLat = 0;
  for (const c of [0, 1, 299, 598, 599]) {
    for (const r of [0, 1, 255, 510, 511]) {
      const i = r * G.w + c;
      const sollLon = G.lonMin + ((c + 0.5) / G.w) * (G.lonMax - G.lonMin);
      const sollLat = G.latMax - ((r + 0.5) / G.h) * (G.latMax - G.latMin);
      maxLon = Math.max(maxLon, Math.abs(lon[i] - sollLon));
      maxLat = Math.max(maxLat, Math.abs(lat[i] - sollLat));
    }
  }
  add('Komposit: Zellposition = Texelmitte der Zeichenfläche',
    maxLon < 1e-5 && maxLat < 1e-5, `Δ ${maxLon.toExponential(2)}° / ${maxLat.toExponential(2)}°`);
}

// ---------------------------------------------------------------------------
// (6) Komposit-Zugriff auf ICON-D2: Außenkanten-Konvention (KL7).
//     Die Ecken kommen aus gribCorners — der Zugriff muss `floor(u·n)` sein.
// ---------------------------------------------------------------------------
{
  const corners = gribCorners(D2);
  const probes = [];
  for (let k = 0; k < 400; k++) {
    // Punkte über die ganze Domäne, bewusst auch nahe den Rändern.
    const u = (k + 0.5) / 400, v = ((k * 7) % 400 + 0.5) / 400;
    probes.push([corners[3][1] + v * (corners[0][1] - corners[3][1]),
      corners[0][0] + u * (corners[1][0] - corners[0][0])]);
  }
  const latA = Float32Array.from(probes.map((p) => p[0]));
  const lonA = Float32Array.from(probes.map((p) => p[1]));
  const idx = buildIndexMap(corners, D2.ni, D2.nj, latA, lonA, 'lonlat');
  let daneben = 0, maxKm = 0;
  for (let i = 0; i < probes.length; i++) {
    if (idx[i] < 0) continue;
    const col = idx[i] % D2.ni, row = Math.floor(idx[i] / D2.ni);
    // Die Zelle, die der Punkt geometrisch trifft (north-up: row 0 = Nord).
    const uu = (lonA[i] - corners[0][0]) / (corners[1][0] - corners[0][0]);
    const vv = (corners[0][1] - latA[i]) / (corners[0][1] - corners[3][1]);
    const sollCol = Math.min(D2.ni - 1, Math.floor(uu * D2.ni));
    const sollRow = Math.min(D2.nj - 1, Math.floor(vv * D2.nj));
    if (col !== sollCol || row !== sollRow) {
      daneben++;
      maxKm = Math.max(maxKm, Math.hypot((col - sollCol) * D2.di * 71.5, (row - sollRow) * D2.dj * 111.13));
    }
  }
  add(`Komposit greift ICON-D2 in der richtigen Zelle ab (${probes.length} Sonden)`,
    daneben === 0, `${daneben} daneben, max ${maxKm.toFixed(2)} km`);
}

// ---------------------------------------------------------------------------
// (7) Vertrauens-Schleier im PoP-Modus (KL1): der Schleier wird auf ein
//     reguläres lon/lat-Gitter umgetastet. Jede Zielzelle muss auf eine
//     Quellzelle zeigen, die AM SELBEN ORT liegt — vorher waren es 76,7 km.
// ---------------------------------------------------------------------------
{
  const FW = Math.ceil(1100 / 8), FH = Math.ceil(1200 / 8);   // Flow-Gitter nach KL5
  const g = ensembleGrid(DE1200_CORNERS, FW, FH);
  const [NWc, NEc, SEc, SWc] = DE1200_CORNERS;
  const pNW = psFwd(NWc[0], NWc[1]), pNE = psFwd(NEc[0], NEc[1]);
  const pSE = psFwd(SEc[0], SEc[1]), pSW = psFwd(SWc[0], SWc[1]);
  const lons = DE1200_CORNERS.map((c) => c[0]), lats = DE1200_CORNERS.map((c) => c[1]);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const R = 6371.0088, P = Math.PI / 180;

  let maxKm = 0, getroffen = 0, gesamt = 0;
  for (let r = 0; r < g.h; r += 3) {
    for (let c = 0; c < g.w; c += 3) {
      const i = r * g.w + c;
      if (g.idx[i] < 0) continue;
      gesamt++;
      const zielLon = lonMin + ((c + 0.5) / g.w) * (lonMax - lonMin);
      const zielLat = latMax - ((r + 0.5) / g.h) * (latMax - latMin);
      // Wahre Lage der getroffenen GROBEN Quellzelle (Mitte ihres 8×8-Blocks).
      const sc = g.idx[i] % FW, sr = Math.floor(g.idx[i] / FW);
      const u = ((sc + 0.5) / FW), v = ((sr + 0.5) / FH);
      const x = (1 - u) * (1 - v) * pNW[0] + u * (1 - v) * pNE[0] + (1 - u) * v * pSW[0] + u * v * pSE[0];
      const y = (1 - u) * (1 - v) * pNW[1] + u * (1 - v) * pNE[1] + (1 - u) * v * pSW[1] + u * v * pSE[1];
      const [qLon, qLat] = psInv(x, y);
      const km = Math.hypot((qLat - zielLat) * P * R, (qLon - zielLon) * P * R * Math.cos(((qLat + zielLat) / 2) * P));
      maxKm = Math.max(maxKm, km);
      if (km < 8) getroffen++;   // < eine grobe Zelle (8 km)
    }
  }
  add(`Schleier (PoP): jede Zielzelle liest ihre eigene Quellzelle (${gesamt} Sonden)`,
    getroffen === gesamt && maxKm < 8, `max ${maxKm.toFixed(2)} km (vorher Median 76,7 km)`);
  add('Schleier (PoP): außerhalb der Radar-Domäne wird nichts gezeichnet',
    g.idx.some((v) => v < 0), `${g.idx.filter((v) => v < 0).length}/${g.idx.length} Zellen maskiert`);
}

// ---------------------------------------------------------------------------
// (7) Mercator-Platzierung (KL8 §14, KL9 §15). Bis hierher prüft dieses Skript
//     den uv-/Gitterraum — dort war alles konsistent, und der Regen lag trotzdem
//     29 km zu weit nördlich: der Vertex-Shader rechnet die Knoten nach
//     Mercator, die GPU interpoliert dazwischen linear in Mercator-y, die
//     Textur liegt breiten-linear. Genau das wird hier simuliert — für einen
//     Datenpunkt der Ort, an dem er auf dem BILDSCHIRM erscheint. Ziel seit KL9:
//     ≤ WARP_TARGET_KM (1 m) für JEDES Mesh der App.
// ---------------------------------------------------------------------------
const merY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMerY = (y) => ((Math.atan(Math.exp(y)) - Math.PI / 4) * 360) / Math.PI;
const KM_LAT = 110.57;
const R_KM = 6371.0088;
const distKm = (lo1, la1, lo2, la2) => {
  const dl = ((la2 - la1) * Math.PI) / 180, dn = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(dl / 2) ** 2 + Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dn / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
};
const fmtM = (km) => `${(km * 1000).toFixed(km < 0.01 ? 1 : 0)} m`;
/** 1-D: gezeichnete Breite des Datenpunkts bei `lat`, wenn ein lat/lon-Quad
 *  `corners` mit einem nx × ny-Mesh (Knotenzeilen breiten-linear) gezeichnet
 *  wird. nx = ny = 1 ist das nackte 4-Eck-Quad. */
function drawnLat(mesh, nx, ny, corners, lat) {
  const latMax = corners[0][1], latMin = corners[3][1];
  const v = (latMax - lat) / (latMax - latMin);          // Texturzeile: breiten-linear
  const s = Math.min(ny - 1e-9, Math.max(0, v * ny));
  const j = Math.floor(s), t = s - j;
  const stride = nx + 1;
  const a = mesh[(j * stride) * 2 + 1], b = mesh[((j + 1) * stride) * 2 + 1]; // Spalte i = 0
  return invMerY(merY(a) + t * (merY(b) - merY(a)));     // GPU: linear in Mercator
}
const worstKm1D = (mesh, nx, ny, corners) => {
  let w = 0;
  for (let lat = corners[3][1] + 0.005; lat < corners[0][1]; lat += 0.01) {
    w = Math.max(w, Math.abs(drawnLat(mesh, nx, ny, corners, lat) - lat) * KM_LAT);
  }
  return w;
};
/** 2-D: schlimmster Abstand zwischen gezeichneter und wahrer Lage eines
 *  Texturpunkts — beide Dreiecke je Masche (NW,NE,SE / NW,SE,SW), Interpolation
 *  linear in Mercator, `truth(u, v)` = wahre lon/lat des Texturpunkts. */
function worstKm2D(mesh, nx, ny, truth, S = [0.25, 0.5, 0.75]) {
  const stride = nx + 1;
  const node = (i, j) => { const k = (j * stride + i) * 2; return [mesh[k], merY(mesh[k + 1])]; };
  let w = 0, at = [0, 0];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const NW = node(i, j), NE = node(i + 1, j), SE = node(i + 1, j + 1), SW = node(i, j + 1);
    for (const s of S) for (const t of S) {
      let x, y;
      if (s >= t) { const a = 1 - s, b = s - t, c = t; x = a * NW[0] + b * NE[0] + c * SE[0]; y = a * NW[1] + b * NE[1] + c * SE[1]; }
      else { const a = 1 - t, b = s, c = t - s; x = a * NW[0] + b * SE[0] + c * SW[0]; y = a * NW[1] + b * SE[1] + c * SW[1]; }
      const tr = truth((i + s) / nx, (j + t) / ny);
      const d = distKm(x, invMerY(y), tr[0], tr[1]);
      if (d > w) { w = d; at = tr; }
    }
  }
  return { km: w, at };
}
const bilinLL = (C) => (u, v) => {
  const [nw, ne, se, sw] = C;
  return [
    (1 - u) * (1 - v) * nw[0] + u * (1 - v) * ne[0] + u * v * se[0] + (1 - u) * v * sw[0],
    (1 - u) * (1 - v) * nw[1] + u * (1 - v) * ne[1] + u * v * se[1] + (1 - u) * v * sw[1],
  ];
};
{
  const cc = COMPOSITE_CORNERS;
  // (a) Das nackte Quad MUSS den live gemessenen Fehler reproduzieren — damit
  //     niemand still zum Quad zurückkehrt. Gemessen: Echo 49,1568 N gezeichnet
  //     bei 49,4221 (+29,3 km); Modell +28,8 km.
  const quad = quadWarpMesh(cc, 1, 1);
  const eQuad = (drawnLat(quad, 1, 1, cc, 49.1568) - 49.1568) * KM_LAT;
  add('B8: das nackte Komposit-Quad legt 49,157 N um +28…31 km nach Norden (= gemessener Fehler)',
    eQuad > 28 && eQuad < 31, `${eQuad.toFixed(1)} km`);
  // Toleranz 1e-6° ≈ 0,1 m — der Simulator klemmt die Texturzeile um 1e-9.
  add('B8: der Quad-Fehler ist an beiden Rändern 0 (deshalb nie als Versprung sichtbar)',
    near(drawnLat(quad, 1, 1, cc, cc[0][1]), cc[0][1], 1e-6)
    && near(drawnLat(quad, 1, 1, cc, cc[3][1]), cc[3][1], 1e-6));
  // (b) Die Zeilenregel: e = Δφ²·tan φ/8·R, umgekehrt Δφ = sqrt(8e/(R tan φ)).
  const band555 = Math.sqrt((8 * WARP_TARGET_KM) / (R_KM * Math.tan((55.5 * Math.PI) / 180))) * 180 / Math.PI;
  add('Zeilenregel: warpBandDeg(55,5 N) = 0,9 · sqrt(8e/(R·tan φ)) ≈ 0,048° (1 m Ziel, Leitterm × Sicherheit)',
    near(warpBandDeg(55.5), band555 * WARP_BAND_SAFETY, 1e-9) && band555 > 0.05 && band555 < 0.056,
    `${(band555 * WARP_BAND_SAFETY).toFixed(4)}° (Leitterm ${band555.toFixed(4)}°)`);
  add('Zeilenregel: Komposit 45,3–55,5 N — COMPOSITE_WARP_ROWS = warpRowsFor, > 192 (192 = Leitterm ohne Sicherheit ⇒ 1,1 m)',
    COMPOSITE_WARP_ROWS === warpRowsFor(45.3, 55.5) && COMPOSITE_WARP_ROWS > 192 && COMPOSITE_WARP_ROWS < 260, `${COMPOSITE_WARP_ROWS}`);
  // Anker gegen das alte Weltmesh: EIN 2,658°-Band bei 50 N ist > 1,5 km daneben.
  const band = (2 * MERC_MAX_LAT) / 64, j = Math.floor((50 + MERC_MAX_LAT) / band);
  const wb = [[5, -MERC_MAX_LAT + (j + 1) * band], [17, -MERC_MAX_LAT + (j + 1) * band], [17, -MERC_MAX_LAT + j * band], [5, -MERC_MAX_LAT + j * band]];
  const wWorld = worstKm1D(quadWarpMesh(wb, 1, 1), 1, 1, wb);
  add('B10: ein Band des früheren 128 × 64-Weltmeshs (2,66°) legt Werte bei 50 N > 1,5 km daneben',
    wWorld > 1.5 && wWorld < 2.5, `${wWorld.toFixed(2)} km`);
  // (c) Das Komposit-Mesh.
  const mesh = compositeWarpMesh();
  const nx = COMPOSITE_WARP_N, ny = COMPOSITE_WARP_ROWS, stride = nx + 1;
  add('compositeWarpMesh(): Knoten (0,0) = NW, (nx,0) = NE, (nx,ny) = SE, (0,ny) = SW',
    near(mesh[0], cc[0][0], 1e-6) && near(mesh[1], cc[0][1], 1e-6)
    && near(mesh[nx * 2], cc[1][0], 1e-6)
    && near(mesh[(ny * stride + nx) * 2 + 1], cc[2][1], 1e-6)
    && near(mesh[(ny * stride) * 2], cc[3][0], 1e-6)
    && mesh.length === stride * (ny + 1) * 2);
  add('compositeWarpMesh(): memoisiert (Referenz-stabil — sonst baut RainLayer den GL-Puffer je Frame)',
    mesh === compositeWarpMesh() && quadWarpMesh(cc) === mesh);
  const wComp = worstKm1D(mesh, nx, ny, cc), wComp2 = worstKm2D(mesh, nx, ny, bilinLL(cc));
  add('Niederschlag (Komposit-Mesh): Mercator-Rest ≤ 1 m über ganz DACH (1-D und 2-D-Simulation)',
    wComp <= WARP_TARGET_KM && wComp2.km <= WARP_TARGET_KM,
    `${fmtM(wComp)} / ${fmtM(wComp2.km)} (KL8 32 × 32: ${fmtM(worstKm1D(quadWarpMesh(cc, 32, 32), 32, 32, cc))}, Quad: ${worstKm1D(quad, 1, 1, cc).toFixed(1)} km)`);
  // (d) build() liefert das Mesh mit — beide Aufrufstellen erben es.
  const fr = new PrecipCompositor().build(0, {}, 0);
  add('PrecipCompositor.build() trägt warpLnglat/warpN/warpRows (MapView + RadarMap reichen sie durch)',
    fr.warpLnglat === mesh && fr.warpN === nx && fr.warpRows === ny
    && fr.warpLnglat.length === (fr.warpN + 1) * (fr.warpRows + 1) * 2);
  // (e) Wolken: natives ICON-D2-Gitter, 14,9° Spanne — CloudLayer nimmt quadWarpRows.
  const d2c = gribCorners(D2);
  const wCloudQuad = worstKm1D(quadWarpMesh(d2c, 1, 1), 1, 1, d2c);
  add('B9: das Wolken-Quad über native ICON-D2-Ecken läge > 60 km daneben',
    wCloudQuad > 60, `${wCloudQuad.toFixed(1)} km`);
  const cr = quadWarpRows(d2c), cm = quadWarpMesh(d2c);
  const wCloud = worstKm2D(cm, QUAD_WARP_COLS, cr, bilinLL(d2c));
  add('Wolken (CloudLayer-Mesh, Zeilen aus quadWarpRows): Mercator-Rest ≤ 1 m',
    wCloud.km <= WARP_TARGET_KM && cm.length === (QUAD_WARP_COLS + 1) * (cr + 1) * 2,
    `${cr} Zeilen, ${fmtM(wCloud.km)} bei ${wCloud.at[1].toFixed(2)} N`);
}

// ---------------------------------------------------------------------------
// (8) Projizierte Gitter (KL9 §15.3/15.4): beide Richtungen krümmen sich ⇒ N²;
//     die Knoten kommen aus 64² exakt + bikubisch (Baukosten statt 211 ms Long
//     Task) — hier gegen die DIREKTE Inverse an jedem Knoten geprüft.
// ---------------------------------------------------------------------------
{
  const AT_C = cellCentersToEdges([[8.09813404083252, 49.362918853759766], [17.74226951599121, 49.396671295166016],
    [17.430356979370117, 45.53426742553711], [8.468643188476562, 45.50288391113281]], 701, 431);
  const CH_C = [[2.689419984817505, 49.3744010925293], [12.462300300598145, 49.36330032348633],
    [11.955599784851074, 43.61899948120117], [3.1687800884246826, 43.62900161743164]];
  const FAELLE = [
    ['DE1200 (polar-stereo, Regenradar DE / flownowcast / poprob)', de1200WarpMesh(), DE1200_WARP_N, de1200Node, 352],
    ['INCA (Lambert, Regenradar AT)', incaWarpMesh(AT_C), INCA_WARP_N, incaNodeFn(AT_C), 144],
    ['rzc (LV95, Regenradar CH)', rzcWarpMesh(CH_C), RZC_WARP_N, rzcNodeFn(CH_C), 160],
  ];
  for (const [name, mesh, N, node, expectN] of FAELLE) {
    add(`${name}: N = ${expectN}, (N+1)² Knoten`, N === expectN && mesh.length === (N + 1) * (N + 1) * 2);
    let maxNode = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = (j * (N + 1) + i) * 2, ll = node(i / N, j / N);
      maxNode = Math.max(maxNode, distKm(mesh[k], mesh[k + 1], ll[0], ll[1]));
    }
    // Float32-Knoten allein streuen bis 0,22 m — bikubisch gemessen ≤ 18 mm.
    add(`${name}: bikubische Knoten treffen die direkte Inverse (alle ${(N + 1) ** 2} Knoten < 0,3 m)`,
      maxNode < 0.0003, `max ${(maxNode * 1000).toFixed(3)} m`);
    const t0 = performance.now();
    const w = worstKm2D(mesh, N, N, node);
    add(`${name}: Mercator-Rest ≤ 1 m (2-D-Simulation, beide Dreiecke je Masche)`,
      w.km <= WARP_TARGET_KM, `${fmtM(w.km)} bei ${w.at[1].toFixed(2)} N, ${(performance.now() - t0).toFixed(0)} ms`);
  }
  // Anker gegen Rückfall: mit den alten 32² wären es > 50 m.
  const old = worstKm2D(warpMeshFromProjection(de1200Node, 32), 32, 32, de1200Node, [0.5]);
  add('DE1200 mit 32² (Stand RP1–KL8) läge > 50 m daneben — Anker gegen Rückfall', old.km > 0.05, fmtM(old.km));
  add('incaWarpMesh/rzcWarpMesh: memoisiert je Ecken-Referenz',
    incaWarpMesh(AT_C) === FAELLE[1][1] && rzcWarpMesh(CH_C) === FAELLE[2][1]);
  // Baukosten: einmal frisch (neue Ecken-Referenz) — kein Long Task.
  const t0 = performance.now(); warpMeshFromProjection(de1200Node, DE1200_WARP_N); const tDe = performance.now() - t0;
  add(`DE1200-Mesh ${DE1200_WARP_N}² baut in < 150 ms (64² psInv + bikubisch; direkt wären > 200 ms)`, tDe < 150, `${tDe.toFixed(0)} ms`);
}

// ---------------------------------------------------------------------------
// (9) Geometrie-Verträge: Index-Topologie, Footprint-Mesh der ScalarLayer-Familie.
// ---------------------------------------------------------------------------
{
  // warpMeshGeometry: dieselbe Dreiecksfolge wie die frühere Expansion (NW,NE,SE / NW,SE,SW).
  const g = warpMeshGeometry(3, 2);
  const exp = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
    const nw = j * 4 + i, ne = nw + 1, sw = nw + 4, se = sw + 1;
    exp.push(nw, ne, se, nw, se, sw);
  }
  add('warpMeshGeometry(3, 2): Dreiecksliste = NW,NE,SE / NW,SE,SW je Masche (wie die alte Expansion)',
    g.indices.length === 36 && exp.every((v, k) => g.indices[k] === v) && g.indices instanceof Uint16Array);
  add('warpMeshGeometry: uv des Knotens (i, j) = (i/nx, j/ny); uv(0,0) = NW',
    near(g.uv[(1 * 4 + 2) * 2], 2 / 3, 1e-6) && near(g.uv[(1 * 4 + 2) * 2 + 1], 1 / 2, 1e-6) && g.uv[0] === 0 && g.uv[1] === 0);
  add('warpMeshGeometry: Uint32-Indizes ab 65 537 Knoten (DE1200 321² = 103 041), memoisiert',
    warpMeshGeometry(320, 320).indices instanceof Uint32Array && warpMeshGeometry(320, 320) === warpMeshGeometry(320, 320)
    && warpMeshGeometry(255, 255).indices instanceof Uint16Array);

  // Footprint-Mesh (ScalarLayer / ConfidenceLayer / Wind-Heatmap): expandierte
  // Dreiecke über die Daten-uvBounds; der Shader rechnet uv aus der Breite selbst,
  // also zählt nur die Zeilenlage. Simulation je Band wie drawnLat.
  const bandsOf = (verts) => {
    const set = new Map();
    for (let p = 0; p + 11 < verts.length; p += 12) { const a = verts[p + 1], b = verts[p + 5]; set.set(`${a}|${b}`, [a, b]); }
    return [...set.values()];
  };
  const worstBands = (bands) => {
    let w = 0;
    for (const [a, b] of bands) for (const t of [0.25, 0.5, 0.75]) {
      const lat = a + t * (b - a), y = merY(a) + t * (merY(b) - merY(a));
      w = Math.max(w, Math.abs(invMerY(y) - lat) * KM_LAT);
    }
    return w;
  };
  const uvD2 = [(D2.lon1 + 180) / 360, (90 - D2.lat2) / 180, (D2.lon2 + 180) / 360, (90 - D2.lat1) / 180];
  const fp = equiFootprintMesh(uvD2), bD2 = bandsOf(fp);
  add('Footprint-Mesh ICON-D2 (43,2–58,1 N): Bänder aus latRowsFor, Mercator-Rest ≤ 1 m',
    worstBands(bD2) <= WARP_TARGET_KM && fp.length === bD2.length * QUAD_WARP_COLS * 12,
    `${bD2.length} Bänder, ${fmtM(worstBands(bD2))}, ${fp.length / 2} Vertices`);
  const c = uvBoundsToCorners(uvD2);
  add('Footprint-Mesh deckt genau die Bounds (West/Ost/Nord/Süd = uvBoundsToCorners)',
    near(fp[0], c[3][0], 1e-5) && near(fp[1], c[3][1], 1e-5)               // Float32-Knoten: 1e-5° ≈ 1 m
    && near(fp[fp.length - 2], c[1][0], 1e-5) && near(fp[fp.length - 1], c[1][1], 1e-5));
  add('Footprint-Mesh: memoisiert je Bounds', equiFootprintMesh(uvD2) === fp);
  const world = equiFootprintMesh([0, 0, 1, 1]), bW = bandsOf(world);
  add(`Footprint-Mesh Welt [0,0,1,1] (GFS): ≤ ${WARP_MAX_ROWS} Bänder, auf ±85,05 geklemmt, Rest ≤ 1 m`,
    bW.length <= WARP_MAX_ROWS && worstBands(bW) <= WARP_TARGET_KM
    && near(world[1], -MERC_MAX_LAT, 1e-5) && near(world[world.length - 1], MERC_MAX_LAT, 1e-5),
    `${bW.length} Bänder, ${fmtM(worstBands(bW))}, ${(world.byteLength / 1048576).toFixed(2)} MB`);
  const rows = latRowsFor(43.18, 58.08);
  let mono = rows[0] === 43.18 && rows[rows.length - 1] === 58.08;
  for (let k = 1; k < rows.length; k++) if (!(rows[k] > rows[k - 1])) mono = false;
  add('latRowsFor: erste Zeile = Süd, letzte = Nord, streng monoton; Bänder werden nach Norden schmaler',
    mono && rows[1] - rows[0] > rows[rows.length - 1] - rows[rows.length - 2],
    `${rows.length - 1} Zeilen, Band Süd ${(rows[1] - rows[0]).toFixed(4)}° → Nord ${(rows[rows.length - 1] - rows[rows.length - 2]).toFixed(4)}°`);
}

// ---------------------------------------------------------------------------
// (10) V-KL-3 (KL9 §15.6/§15.7, Jans Go 2026-08-27): Mercator kommt aus der CPU.
//      Die GPU rechnete log(tan(π/4+φ/2)) im Vertex-Shader mit bis 280 m Fehler
//      (Intel/ANGLE, Transform-Feedback gemessen). Jetzt liefert `mercatorOf`
//      (double) das Attribut `a_merc`; im Shader bleibt nur u_matrix · a_merc.
// ---------------------------------------------------------------------------
{
  const WORLD_M = 40075016.686;
  const mesh = compositeWarpMesh();
  const m = mercatorOf(mesh);
  let maxM = 0, maxF32 = 0;
  for (let k = 0; k < mesh.length; k += 2) {
    const lon = mesh[k], lat = mesh[k + 1];
    const my = 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
    const mx = (lon + 180) / 360;
    maxM = Math.max(maxM, Math.abs(m[k] - mx) * WORLD_M, Math.abs(m[k + 1] - my) * WORLD_M);
    maxF32 = Math.max(maxF32, Math.abs(Math.fround(mx) - mx) * WORLD_M, Math.abs(Math.fround(my) - my) * WORLD_M);
  }
  add('mercatorOf: Komposit-Knoten treffen die double-Formel bis auf den Float32-Speicherboden (< 3 m)',
    maxM < 0.003 * 1000 && maxM <= maxF32 + 1e-9 && m.length === mesh.length,
    `max ${maxM.toFixed(2)} m (Float32-Boden ${maxF32.toFixed(2)} m; GPU-Shader lag bis 280 m daneben)`);
  add('mercatorOf: memoisiert je Array-Referenz (RainLayer baut den GL-Puffer nur bei neuer Referenz)',
    mercatorOf(mesh) === m);
  const [mx0, my0] = mercXY(0, 0);
  add('mercXY: (0, 0) → (0,5, 0,5); ±85,05 klemmt auf [0,1]',
    near(mx0, 0.5, 1e-15) && near(my0, 0.5, 1e-15) && mercXY(0, 89)[1] >= -1e-9 && mercXY(0, -89)[1] <= 1 + 1e-9);

  // Text-Sonde an den Quelltexten: jeder Raster-Vertex-Shader nimmt a_merc,
  // rechnet keine Transzendente mehr und ist highp (V-KL-4). Partikel-Shader
  // (drawVert/segDrawVert) bleiben bewusst außen vor — ihre Lage entsteht auf der GPU.
  const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const vertexShaders = [
    ['RainLayer.vert', src('../src/scalar/RainLayer.ts'), /const vert = `([\s\S]*?)`;/],
    ['CloudLayer.vert', src('../src/scalar/CloudLayer.ts'), /const vert = `([\s\S]*?)`;/],
    ['ScalarLayer.meshVert', src('../src/scalar/ScalarLayer.ts'), /const meshVert = `([\s\S]*?)`;/],
    ['ConfidenceLayer.vert', src('../src/scalar/ConfidenceLayer.ts'), /const vert = `([\s\S]*?)`;/],
    ['shaders.heatmapVert', src('../src/wind/shaders.ts'), /export const heatmapVert = `([\s\S]*?)`;/],
    ['shaders.heatmapVertProjected', src('../src/wind/shaders.ts'), /export const heatmapVertProjected = `([\s\S]*?)`;/],
  ];
  for (const [name, text, re] of vertexShaders) {
    const body = (text.match(re) || [])[1] || '';
    add(`${name}: a_merc als Attribut, kein log(tan()), precision highp`,
      body.includes('attribute vec2 a_merc') && !body.includes('log(') && !body.includes('tan(')
      && body.includes('precision highp float') && (body.includes('vec4(a_merc, 0.0, 1.0)') || body.includes('projectTile(a_merc)')));
  }
  // Die Layer binden a_merc auch wirklich (sonst Attribut ohne Puffer = Schwarzbild).
  const binds = [
    ['RainLayer', src('../src/scalar/RainLayer.ts')], ['CloudLayer', src('../src/scalar/CloudLayer.ts')],
    ['ScalarLayer', src('../src/scalar/ScalarLayer.ts')], ['ConfidenceLayer', src('../src/scalar/ConfidenceLayer.ts')],
    ['WindLayer', src('../src/wind/WindLayer.ts')],
  ];
  add('alle fünf Layer binden p.a_merc an einen mercatorOf-Puffer',
    binds.every(([, t]) => /p\.a_merc as number/.test(t) && /mercatorOf\(/.test(t)),
    binds.filter(([, t]) => !(/p\.a_merc as number/.test(t) && /mercatorOf\(/.test(t))).map(([n]) => n).join(', ') || 'alle');
}

// ---------------------------------------------------------------------------
// (11) KL10 (§15.8, Jans Go 2026-08-27): Wind-Partikel — Mercator-y aus einer
//      64 × 64-RGBA8-Tabelle (CPU-double) statt log(tan()) im Zeichen-Shader.
//      Geprüft: Tabelle gegen die double-Formel, die JS-gespiegelte Shader-
//      Dekode (Float32) samt linearer Mischung über ganz DACH, und per Text-Sonde
//      die vier Zeichen-Shader + die Bindung im WindLayer. Die Simulation
//      (updateFrag) bleibt unverändert — das prüft die Sonde ebenfalls.
// ---------------------------------------------------------------------------
{
  const WORLD_M = 40075016.686;
  const tbl = mercYTable();
  add('mercYTable: 64 × 64 Einträge · 4 Byte, memoisiert',
    tbl.length === MERC_TABLE_SIZE * 4 && MERC_TABLE_SIZE === MERC_TABLE_DIM * MERC_TABLE_DIM && mercYTable() === tbl);
  // (a) Jeder Eintrag exakt gegen die double-Formel (32-bit-Festkomma: 9 mm).
  let maxEntry = 0;
  for (let i = 0; i < MERC_TABLE_SIZE; i++) {
    const y = MERC_TABLE_Y0 + (i / (MERC_TABLE_SIZE - 1)) * (MERC_TABLE_Y1 - MERC_TABLE_Y0);
    const my = mercXY(0, 90 - y * 180)[1];
    const v = (tbl[i * 4] * 16777216 + tbl[i * 4 + 1] * 65536 + tbl[i * 4 + 2] * 256 + tbl[i * 4 + 3]) / 4294967296;
    maxEntry = Math.max(maxEntry, Math.abs(v - my) * WORLD_M);
  }
  add('mercYTable: jeder Eintrag trifft die double-Formel (< 2 cm, 32-bit-Festkomma)', maxEntry < 0.02, `max ${(maxEntry * 1000).toFixed(1)} mm`);
  add('mercYTable: Ränder = ±85,05° (Nord = Mercator-y 0, Süd = 1), monoton steigend',
    near(mercYFromTable(MERC_TABLE_Y0), 0, 1e-6) && near(mercYFromTable(MERC_TABLE_Y1), 1, 1e-6)
    && (() => { let prev = -1; for (let i = 0; i < MERC_TABLE_SIZE; i++) { const y = MERC_TABLE_Y0 + (i / (MERC_TABLE_SIZE - 1)) * (MERC_TABLE_Y1 - MERC_TABLE_Y0); const v = mercYFromTable(y); if (v < prev) return false; prev = v; } return true; })());
  // (b) Die Shader-Dekode (Float32, zwei Taps + Mischung) über ganz DACH und
  //     dazwischen (nicht auf den Stützstellen): Rest = Tabellenschritt + Float32.
  let maxDach = 0, atDach = 0, maxWorld = 0;
  for (let lat = 43.18; lat <= 58.08; lat += 0.0037) {
    const y = (90 - lat) / 180;
    const e = Math.abs(mercYFromTable(y) - mercXY(0, lat)[1]) * WORLD_M;
    if (e > maxDach) { maxDach = e; atDach = lat; }
  }
  for (let lat = -85; lat <= 85; lat += 0.0137) maxWorld = Math.max(maxWorld, Math.abs(mercYFromTable((90 - lat) / 180) - mercXY(0, lat)[1]) * WORLD_M);
  add('Partikel-Mercator aus der Tabelle: Rest über DACH < 2 m (Tabellenschritt ≤ 0,7 m + Float32 ≈ 1,2 m; Shader-log/tan lag bis 280 m daneben)',
    maxDach < 2, `max ${maxDach.toFixed(2)} m bei ${atDach.toFixed(2)} N · Welt ±85° max ${maxWorld.toFixed(1)} m`);
  add('Partikel-Mercator: außerhalb ±85,05° geklemmt (kein NaN, wie das alte clamp)',
    Number.isFinite(mercYFromTable(0)) && Number.isFinite(mercYFromTable(1)) && mercYFromTable(0) === mercYFromTable(MERC_TABLE_Y0));
  // (c) Text-Sonde: vier Zeichen-Shader nehmen die Tabelle, keiner rechnet log/tan;
  //     updateFrag (Simulation) unverändert; GLSL-Konstanten = JS-Konstanten.
  const shadersTs = readFileSync(new URL('../src/wind/shaders.ts', import.meta.url), 'utf8');
  const block = (name) => (shadersTs.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;')) || [])[1] || '';
  for (const name of ['drawVert', 'drawVertProjected', 'segDrawVert', 'segDrawVertProjected']) {
    const b = block(name);
    add(`${name}: mercYOf() aus der Tabelle, kein log(tan()), highp`,
      b.includes('${MERC_TABLE_GLSL}') && b.includes('mercYOf(') && !b.includes('log(') && !b.includes('tan(') && b.includes('precision highp float'));
  }
  const glsl = block('MERC_TABLE_GLSL');
  add('MERC_TABLE_GLSL: Konstanten aus quadWarpMesh interpoliert, zwei Taps + mix, Sampler highp',
    glsl.includes('${MERC_TABLE_Y0}') && glsl.includes('${MERC_TABLE_Y1}') && glsl.includes('${MERC_TABLE_SIZE.toFixed(1)}')
    && glsl.includes('${MERC_TABLE_DIM.toFixed(1)}') && glsl.includes('uniform highp sampler2D u_merc_table') && glsl.includes('mix(mercTableAt(i), mercTableAt(i + 1.0), f - i)'));
  const upd = block('updateFrag');
  add('updateFrag (Simulation) unverändert: rechnet weiter in equirect mit cos-Verzerrung, ohne Tabelle',
    upd.length > 0 && !upd.includes('mercYOf') && upd.includes('cos(radians('));
  const wl = readFileSync(new URL('../src/wind/WindLayer.ts', import.meta.url), 'utf8');
  add('WindLayer: Tabelle einmal als NEAREST-Textur (64 × 64) angelegt, in beiden Draw-Pfaden auf Einheit 3 gebunden, in onRemove gelöscht',
    /createTexture\(gl, gl\.NEAREST, mercYTable\(\), MERC_TABLE_DIM, MERC_TABLE_DIM\)/.test(wl)
    && (wl.match(/bindTexture\(gl, this\.mercTableTexture!, 3\)/g) || []).length === 2
    && (wl.match(/u_merc_table as WebGLUniformLocation, 3\)/g) || []).length === 2
    && /deleteTexture\(this\.mercTableTexture\)/.test(wl));
}

// ---------------------------------------------------------------------------
// (12) KL11 / B5 (§15.9, Jans Go 2026-08-27): `coarsenFrameU8` kachelt die
//      Domäne flächengewichtet — 1100 RADOLAN-Spalten / 8 = 137,5 gingen mit
//      starren 8er-Blöcken nicht auf, gezeichnet wurde die Ausgabe aber über die
//      vollen 1100 km ⇒ bis 3,96 km Dehnung nach Osten (flownowcast, poprob,
//      PoP-Schleier). Jetzt: Blockbreite w/W', Randspalten anteilig.
// ---------------------------------------------------------------------------
{
  const w = 1100, h = 1200, F = 8;
  const W = Math.ceil(w / F), H = Math.ceil(h / F);
  // (a) Dehnung: Schwerpunkt der Zelle cx (in nativen Spalten) vs. gezeichnete Mitte (cx+0,5)·w/W.
  //     Alt (starre 8er-Blöcke): Schwerpunkt cx·8+4 ⇒ nach Osten bis 3,96 km daneben.
  const spans = blockSpans(w, W);
  let maxNewKm = 0, maxOldKm = 0;
  for (let cx = 0; cx < W; cx++) {
    const s = spans[cx];
    // Abgedecktes Intervall der Zelle aus den Randgewichten: erste Spalte deckt [i+1−wt, i+1),
    // letzte [i, i+wt) — es muss exakt [cx·w/W, (cx+1)·w/W) sein, dann ist der
    // Schwerpunkt der gezeichnete Zellmittelpunkt (cx+0,5)·w/W.
    const a = s.idx[0] + 1 - s.wt[0], b = s.idx[s.idx.length - 1] + s.wt[s.wt.length - 1];
    const centroid = (a + b) / 2, drawn = (cx + 0.5) * w / W;
    maxNewKm = Math.max(maxNewKm, Math.abs(centroid - drawn), Math.abs(a - cx * w / W), Math.abs(b - (cx + 1) * w / W)); // 1 Spalte = 1 km
    const oldC = Math.min(w, (cx + 1) * F), oldCentroid = (cx * F + oldC) / 2;
    maxOldKm = Math.max(maxOldKm, Math.abs(oldCentroid - drawn));
  }
  add('B5: starre 8er-Blöcke lagen bis 3,9–4,0 km neben ihrer Zeichenposition (Anker gegen Rückfall)',
    maxOldKm > 3.9 && maxOldKm < 4.0, `${maxOldKm.toFixed(2)} km`);
  add('B5 behoben: jede der 138 Zellen deckt exakt [cx·w/W, (cx+1)·w/W) — Schwerpunkt = Zeichenposition (Dehnung 0,00 km)',
    maxNewKm < 1e-9, `max ${(maxNewKm * 1000).toFixed(6)} m`);
  add(`blockSpans(1100, 138): jede Zelle deckt genau 1100/138 = 7,971 Spalten, Gewichte summieren zur Blockbreite`,
    spans.every((s) => Math.abs(s.wt.reduce((a, b) => a + b, 0) - w / W) < 1e-9) && spans[0].idx[0] === 0 && spans[W - 1].idx[spans[W - 1].idx.length - 1] === w - 1);
  // (b) Erhaltung: konstantes Feld bleibt konstant, Gesamtmasse bleibt erhalten, Ausgabe deckt alle Spalten.
  const frame = new Uint8Array(w * h);
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < frame.length; i++) frame[i] = rnd() < 0.15 ? Math.floor(rnd() * 256) : 0;
  const t = coarsenFrameU8(frame, w, h, F);
  let massNative = 0; for (let i = 0; i < frame.length; i++) massNative += frame[i] / 255;
  let massCoarse = 0; for (let i = 0; i < t.data.length; i++) massCoarse += t.data[i] * (w / W) * (h / H);
  add('coarsenFrameU8(1100×1200, 8) → 138×150, Gesamtmasse erhalten (Σ Zelle·Fläche = Σ nativ)',
    t.W === W && t.H === H && Math.abs(massCoarse - massNative) / massNative < 1e-9, `${massCoarse.toFixed(3)} vs ${massNative.toFixed(3)}`);
  const konst = coarsenFrameU8(new Uint8Array(w * h).fill(200), w, h, F);
  add('coarsenFrameU8: konstantes Feld bleibt konstant (auch in den Bruchteil-Zellen am Ostrand; Float32-Toleranz)',
    Array.from(konst.data).every((v) => Math.abs(v - 200 / 255) < 1e-6));
  // (c) Geht die Teilung glatt auf, ist das Ergebnis mit dem starren Blockmittel identisch.
  const w2 = 1096, h2 = 1200;
  const fr2 = frame.subarray(0, w2 * h2);
  const neu = coarsenFrameU8(fr2, w2, h2, F);
  let maxDiff = 0;
  for (let cy = 0; cy < h2 / F; cy++) for (let cx = 0; cx < w2 / F; cx++) {
    let s = 0; for (let dy = 0; dy < F; dy++) for (let dx = 0; dx < F; dx++) s += fr2[(cy * F + dy) * w2 + cx * F + dx];
    maxDiff = Math.max(maxDiff, Math.abs(neu.data[cy * (w2 / F) + cx] - (s / (F * F)) / 255));
  }
  add('coarsenFrameU8: bei glatter Teilung (1096 = 137·8) identisch mit dem starren 8er-Blockmittel (Float32-Toleranz)', maxDiff < 1e-6, `max Δ ${maxDiff.toExponential(1)}`);
  // (d) Anteilige Gewichtung ist wirklich aktiv: eine einzelne native Spalte auf einer Blockgrenze
  //     (Blockgrenze 137·7,971 = 1092,03: Spalte 1092 gehört zu 0,03 zu Zelle 136 und zu 0,97 zu Zelle 137).
  const probe = new Uint8Array(w * h); for (let y = 0; y < h; y++) probe[y * w + 1092] = 255;
  const tp = coarsenFrameU8(probe, w, h, F);
  const c136 = tp.data[136], c137 = tp.data[137];
  add('B5: native Spalte 1092 verteilt sich anteilig auf die Zellen 136/137 (Randspalten gewichtet, kein Sprung)',
    c136 > 0 && c137 > c136 && tp.data[135] === 0 && Math.abs(c136 / c137 - 0.03 / 0.97) < 0.02,
    `Zelle 136: ${(c136 * 255).toFixed(2)} · 137: ${(c137 * 255).toFixed(2)} (u8-Einheiten)`);
  // (e) Zeilen (1200/8 = 150) ohne Bruchteile: Ausgabe deckt genau alle 1200 Zeilen.
  const spansY = blockSpans(h, H);
  add('blockSpans(1200, 150): glatte Teilung ⇒ exakt 8 Zeilen je Block, Gewicht 1', spansY.every((s) => s.idx.length === 8 && s.wt.every((x) => Math.abs(x - 1) < 1e-12)));
}

// ---------------------------------------------------------------------------
const passed = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? '  OK ' : '  FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
console.log(passed === checks.length
  ? `\nALLE ${checks.length} CHECKS PASS`
  : `\n${passed}/${checks.length} — ${checks.length - passed} FEHLGESCHLAGEN`);
process.exit(passed === checks.length ? 0 : 1);
