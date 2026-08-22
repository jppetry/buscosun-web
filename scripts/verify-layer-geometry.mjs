/**
 * Headless-Verifikation der Layer-Geometrie der Wetterkarte (Phase KL1–KL7,
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
import { DE1200_CORNERS, psFwd, psInv } from '../src/sources/radolanGeo.ts';
import { ensembleGrid } from '../src/scalar/confidenceImage.ts';

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
const passed = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? '  OK ' : '  FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
console.log(passed === checks.length
  ? `\nALLE ${checks.length} CHECKS PASS`
  : `\n${passed}/${checks.length} — ${checks.length - passed} FEHLGESCHLAGEN`);
process.exit(passed === checks.length ? 0 : 1);
