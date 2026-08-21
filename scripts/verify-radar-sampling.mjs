/**
 * Headless-Verifikation der Radar-Punktverortung (RP1 = DE, RP2 = AT und CH) —
 * prüft am ECHTEN App-Code, dass die Punktabfrage dieselbe Gitterzelle trifft
 * wie die Karte, für alle drei Landesgitter.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-radar-sampling.mjs
 *
 * Hintergrund (`audit/radar-punktverortung.md`): die Karte rendert RADOLAN
 * DE1200 projektionskorrekt (`de1200WarpMesh`, Restfehler ~40 m), die
 * Punktabfrage interpolierte dagegen linear in lon/lat zwischen den 4 Ecken und
 * griff dadurch 13–36 km zu weit nördlich ins Gitter — Slider und Karte
 * beschrieben verschiedene Orte. Seit RP1 geht jede Punktabfrage über
 * `pointForecast/radarSample.ts`, das die Projektion aus der Quelle ableitet.
 *
 * Referenz für „richtig": das Gitter ist im polar-stereografischen Raum regulär
 * und achsparallel — die exakte Zelle folgt direkt aus `psFwd` (dieselbe
 * Funktion, aus der auch das Warp-Mesh der Karte gebaut wird). Kein Fetch, kein
 * GPU: die Frames sind synthetisch (Zellindex in den Werten kodiert).
 */
import {
  DE1200_CORNERS, DE1200_WARP_N, de1200WarpMesh, psFwd, psInv,
} from '../src/sources/radolanGeo.ts';
import { inverseBilinear, sampleRadarQuad } from '../src/pointForecast/quadSampler.ts';
import { anchorFor, projectionFor, sampleRadarPoint } from '../src/pointForecast/radarSample.ts';
import { cellCentersToEdges, incaFwd, incaInv, incaWarpMesh, INCA_WARP_N } from '../src/sources/geosphereIncaGeo.ts';
import { rzcFwd, rzcInv, rzcWarpMesh, RZC_WARP_N } from '../src/sources/meteoSwissGeo.ts';

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

const W = 1100, H = 1200;               // DE1200
const [pNW, pNE, , pSW] = DE1200_CORNERS.map(([lo, la]) => psFwd(lo, la));
const X0 = pNW[0], X1 = pNE[0], Y0 = pNW[1], Y1 = pSW[1];

/** Exakte Zelle (col,row) eines Ortes — Referenz, unabhängig vom Sampler.
 *  DE1200-Ecken sind AUSSENKANTEN (1100 km auf 1100 Zellen, in PS nachgerechnet),
 *  die Zelle ist also `floor(u·W)`, nicht `round(u·(W−1))`. */
function exactCell(lat, lon) {
  const [x, y] = psFwd(lon, lat);
  const u = (x - X0) / (X1 - X0), v = (y - Y0) / (Y1 - Y0);
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { col: Math.min(W - 1, Math.floor(u * W)), row: Math.min(H - 1, Math.floor(v * H)) };
}
/** Geographische Lage einer Zellmitte (für Distanzen in km). */
function cellLatLon(col, row) {
  const [lon, lat] = psInv(X0 + ((col + 0.5) / W) * (X1 - X0), Y0 + ((row + 0.5) / H) * (Y1 - Y0));
  return { lat, lon };
}
function distKm(a, b, c, d) {
  const R = 6371.0088, p = Math.PI / 180;
  return Math.hypot((c - a) * p * R, (d - b) * p * R * Math.cos((a + c) / 2 * p));
}
/** Frame, dessen Wert die Zelle eindeutig identifiziert (Streifenmuster je Zeile). */
function stripeFrame(period) {
  const v = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) {
    const val = (Math.floor(r / period) % 2) ? 200 : 0;
    if (val) v.fill(val, r * W, r * W + W);
  }
  return v;
}

const ORTE = [
  ['Flensburg', 54.7937, 9.4470], ['Kiel', 54.3233, 10.1228], ['Hamburg', 53.5511, 9.9937],
  ['Bremen', 53.0793, 8.8017], ['Hannover', 52.3759, 9.7320], ['Berlin', 52.5200, 13.4050],
  ['Leipzig', 51.3397, 12.3731], ['Dresden', 51.0504, 13.7373], ['Köln', 50.9375, 6.9603],
  ['Frankfurt', 50.1109, 8.6821], ['Nürnberg', 49.4521, 11.0767], ['Saarbrücken', 49.2402, 6.9969],
  ['Stuttgart', 48.7758, 9.1829], ['München', 48.1351, 11.5820], ['Freiburg', 47.9990, 7.8421],
  ['Konstanz', 47.6603, 9.1758], ['Görlitz', 51.1520, 14.9884], ['Aachen', 50.7753, 6.0839],
  ['Rostock', 54.0924, 12.0991], ['Passau', 48.5667, 13.4319],
];

// ---------------------------------------------------------------------------
// (1) Zellentreue: die projizierte Abtastung trifft die exakte Zelle (< 1 Zelle).
// ---------------------------------------------------------------------------
let maxCellErr = 0, maxKmErr = 0, worst = '';
for (const [name, lat, lon] of ORTE) {
  const want = exactCell(lat, lon);
  const uv = inverseBilinear(DE1200_CORNERS, lat, lon, psFwd);
  const got = { col: Math.min(W - 1, Math.floor(uv.u * W)), row: Math.min(H - 1, Math.floor(uv.v * H)) };
  const d = Math.hypot(got.col - want.col, got.row - want.row);
  const ll = cellLatLon(got.col, got.row);
  const km = distKm(lat, lon, ll.lat, ll.lon);
  if (d > maxCellErr) { maxCellErr = d; worst = name; }
  if (km > maxKmErr) maxKmErr = km;
}
add(`RADOLAN: Abtastzelle = exakte Zelle (${ORTE.length} Orte, max ${maxCellErr.toFixed(2)} Zellen bei ${worst})`,
  maxCellErr < 1, `max Ortsversatz ${maxKmErr.toFixed(2)} km`);
add('RADOLAN: Ortsversatz der getroffenen Zelle < 1,5 km (Zellmitte bei 1-km-Raster)', maxKmErr < 1.5,
  `${maxKmErr.toFixed(2)} km`);

// ---------------------------------------------------------------------------
// (2) Regressionsanker: OHNE Projektion ist der Fehler groß (das war der Bug).
//     Schützt davor, dass die Projektion still wieder verlorengeht.
// ---------------------------------------------------------------------------
let minNaiveKm = Infinity, maxNaiveKm = 0;
for (const [, lat, lon] of ORTE) {
  const uv = inverseBilinear(DE1200_CORNERS, lat, lon);            // alter Weg
  const ll = cellLatLon(Math.min(W - 1, Math.floor(uv.u * W)), Math.min(H - 1, Math.floor(uv.v * H)));
  const km = distKm(lat, lon, ll.lat, ll.lon);
  minNaiveKm = Math.min(minNaiveKm, km); maxNaiveKm = Math.max(maxNaiveKm, km);
}
add('Ohne Projektion bleibt der bekannte Versatz messbar (13–37 km) — Anker gegen Rückfall',
  minNaiveKm > 10 && maxNaiveKm > 30, `${minNaiveKm.toFixed(1)}–${maxNaiveKm.toFixed(1)} km`);
add('Projektion verbessert die Verortung um > Faktor 10', maxKmErr * 10 < maxNaiveKm,
  `${maxKmErr.toFixed(2)} km statt ${maxNaiveKm.toFixed(1)} km`);

// ---------------------------------------------------------------------------
// (3) Karte ↔ Punktabfrage: dieselbe (lat,lon) landet auf demselben Mesh-Knoten.
//     Prüft die Kette gegen die Geometrie, die der RainLayer wirklich zeichnet.
// ---------------------------------------------------------------------------
// Randknoten bleiben ausgespart: das Mesh ist Float32, seine Kantenknoten liegen
// dadurch um Zentimeter AUSSERHALB des Quads und fallen durch den (unveränderten,
// harten) Bbox-Vorfilter von `inverseBilinear` — ein Darstellungsartefakt der
// Mesh-Koordinaten, keine Frage der Verortung. Geprüft wird das Innere.
const mesh = de1200WarpMesh(), N = DE1200_WARP_N;
let maxMeshKm = 0, meshNull = 0, meshPunkte = 0;
for (let j = 1; j < N; j++) {
  for (let i = 1; i < N; i++) {
    const k = (j * (N + 1) + i) * 2;
    const lon = mesh[k], lat = mesh[k + 1];
    const uv = inverseBilinear(DE1200_CORNERS, lat, lon, psFwd);
    meshPunkte++;
    if (!uv) { meshNull++; continue; }
    // Der Knoten liegt per Konstruktion bei (u,v) = (i/N, j/N).
    const du = Math.abs(uv.u - i / N), dv = Math.abs(uv.v - j / N);
    const km = Math.hypot(du * 1100, dv * 1200);   // Gitter ist 1100×1200 km
    maxMeshKm = Math.max(maxMeshKm, km);
  }
}
add(`Punktabfrage trifft die Mesh-Knoten der Karte (${meshPunkte} innere Knoten, uv-Deckung < 1 m)`,
  meshNull === 0 && maxMeshKm < 0.001, `${(maxMeshKm * 1000).toFixed(2)} m, ${meshNull} ohne Treffer`);

// ---------------------------------------------------------------------------
// (4) Fassade: Projektion je Quelle korrekt zugeordnet (die eine Entscheidung).
// ---------------------------------------------------------------------------
add('Gitterlage DE: psFwd (polar-stereografisch) + Ecken = Außenkanten',
  projectionFor('radolan_rv') === psFwd && anchorFor('radolan_rv') === 'edge');
add('Gitterlage AT: incaFwd (Lambert) + Ecken = Außenkanten',
  projectionFor('inca_grid') === incaFwd && anchorFor('inca_grid') === 'edge');
add('Gitterlage CH: rzcFwd (LV95/somerc) + Ecken = Außenkanten',
  projectionFor('meteoswiss_rzc') === rzcFwd && anchorFor('meteoswiss_rzc') === 'edge');

// ---------------------------------------------------------------------------
// (5) Werte-Ebene: an einem Streifenmuster (40 km Periode) liefert die Fassade
//     den Wert der exakten Zelle — genau hier kippte „nass/trocken".
// ---------------------------------------------------------------------------
const frame = stripeFrame(40);
let wertFehler = 0, kipp = 0;
for (const [, lat, lon] of ORTE) {
  const want = exactCell(lat, lon);
  const soll = frame[want.row * W + want.col] === 0 ? 0 : (200 / 255) * 20;
  const ist = sampleRadarPoint('radolan_rv', frame, W, H, DE1200_CORNERS, lat, lon, 20);
  const alt = sampleRadarQuad(frame, W, H, DE1200_CORNERS, lat, lon, 20);
  if (Math.abs(ist - soll) > 1e-9) wertFehler++;
  if ((alt > 0) !== (soll > 0)) kipp++;
}
add('sampleRadarPoint liefert den Wert der exakten Zelle (20 Orte, Streifenmuster)', wertFehler === 0,
  `${wertFehler} Abweichung(en)`);
add('der alte Weg hätte an denselben Orten nass/trocken vertauscht', kipp > 0, `${kipp} von ${ORTE.length} Orte`);

// ---------------------------------------------------------------------------
// (6) Funktionserhalt: reguläre lat/lon-Gitter (ICON-D2) unverändert exakt.
// ---------------------------------------------------------------------------
const REG = [[5, 56], [17, 56], [17, 45], [5, 45]];      // achsparalleles lon/lat-Quad
let regFehler = 0;
for (const [lat, lon] of [[50, 10], [46, 6], [55.5, 16], [45.2, 5.4], [52.52, 13.405]]) {
  const uv = inverseBilinear(REG, lat, lon);
  if (!uv) { if (lat <= 56 && lat >= 45 && lon >= 5 && lon <= 17) regFehler++; continue; }
  const uSoll = (lon - 5) / 12, vSoll = (56 - lat) / 11;
  if (Math.abs(uv.u - uSoll) > 1e-9 || Math.abs(uv.v - vSoll) > 1e-9) regFehler++;
}
add('reguläres lat/lon-Quad bleibt exakt (ICON-D2-Pfad unverändert)', regFehler === 0, `${regFehler} Abweichung(en)`);
add('außerhalb des Quads weiterhin null (Abdeckungsgrenze)',
  inverseBilinear(DE1200_CORNERS, 41.0, 10.0, psFwd) === null
  && sampleRadarPoint('radolan_rv', frame, W, H, DE1200_CORNERS, 41.0, 10.0, 20) === null);


// ---------------------------------------------------------------------------
// (7) AT — GeoSphere INCA, Lambert (EPSG:31287-Geometrie auf WGS84).
//     Die Parameter sind am gelieferten lat/lon-Feld verifiziert (Kopf von
//     geosphereIncaGeo.ts); hier laufen die Konsequenzen mit: Gitter regulär,
//     Zellgröße 1 km, Punktabfrage trifft die Zelle, Inverse ist konsistent.
// ---------------------------------------------------------------------------
const AT_W = 701, AT_H = 431;
// Zellmittelpunkte der vier Eckzellen, wie sie im INCA-NetCDF stehen …
const AT_CENTERS = [[8.09813404083252, 49.362918853759766], [17.74226951599121, 49.396671295166016],
                    [17.430356979370117, 45.53426742553711], [8.468643188476562, 45.50288391113281]];
// … und die daraus beim Laden gerechneten Außenkanten (das, was die App führt).
const AT_C = cellCentersToEdges(AT_CENTERS, AT_W, AT_H);
{
  const pm = AT_CENTERS.map(([lo, la]) => incaFwd(lo, la));
  const breiteM = (pm[1][0] + pm[2][0]) / 2 - (pm[0][0] + pm[3][0]) / 2;
  const hoeheM = (pm[0][1] + pm[1][1]) / 2 - (pm[2][1] + pm[3][1]) / 2;
  const zellB = breiteM / (AT_W - 1), zellH = hoeheM / (AT_H - 1);
  add('AT: Gitter in Lambert regulär — Zellgröße 1 km (± 1 m)',
    Math.abs(zellB - 1000) < 1 && Math.abs(zellH - 1000) < 1,
    zellB.toFixed(2) + ' × ' + zellH.toFixed(2) + ' m');

  const pe = AT_C.map(([lo, la]) => incaFwd(lo, la));
  const breiteE = (pe[1][0] + pe[2][0]) / 2 - (pe[0][0] + pe[3][0]) / 2;
  const hoeheE = (pe[0][1] + pe[1][1]) / 2 - (pe[2][1] + pe[3][1]) / 2;
  add('AT: cellCentersToEdges macht daraus die Außenkanten (n·Zellgröße statt (n−1)·Zellgröße)',
    Math.abs(breiteE - AT_W * zellB) < 10 && Math.abs(hoeheE - AT_H * zellH) < 10,
    (breiteE / 1000).toFixed(3) + ' × ' + (hoeheE / 1000).toFixed(3) + ' km');

  let rtMax = 0;
  for (const [lat, lon] of [[48.208, 16.372], [47.269, 11.404], [47.071, 15.439], [46.624, 14.308]]) {
    const [x, y] = incaFwd(lon, lat); const [lo2, la2] = incaInv(x, y);
    rtMax = Math.max(rtMax, distKm(lat, lon, la2, lo2) * 1000);
  }
  add('AT: incaInv kehrt incaFwd um (< 1 mm)', rtMax < 0.001, rtMax.toExponential(1) + ' m');

  // Punktabfrage an den ORIGINAL-Zellmitten aus dem NetCDF (Ground Truth des Gitters)
  const frame = new Uint8Array(AT_W * AT_H);
  const pc = AT_CENTERS.map(([lo, la]) => incaFwd(lo, la));
  const cellCenter = (col, row) => incaInv(
    pc[0][0] + (col / (AT_W - 1)) * (pc[1][0] - pc[0][0]),
    pc[0][1] + (row / (AT_H - 1)) * (pc[3][1] - pc[0][1]));
  let treffer = 0, versuche = 0;
  for (const [col, row] of [[0, 0], [350, 215], [700, 430], [100, 400], [600, 50], [350, 0], [0, 215]]) {
    const [lon, lat] = cellCenter(col, row);
    frame.fill(0); frame[row * AT_W + col] = 200;
    versuche++;
    if (sampleRadarPoint('inca_grid', frame, AT_W, AT_H, AT_C, lat, lon, 20) > 0) treffer++;
  }
  add('AT: Punktabfrage trifft die Zellmitte (' + treffer + '/' + versuche + ' Zellen, inkl. Ränder)',
    treffer === versuche);
}

// ---------------------------------------------------------------------------
// (8) CH — MeteoSchweiz rzc, LV95/somerc. Die Projektion steht im Produkt selbst
//     (`/where.projdef`); geprüft wird, dass sie das Gitter wirklich beschreibt.
// ---------------------------------------------------------------------------
const CH_C = [[2.689419984817505, 49.3744010925293], [12.462300300598145, 49.36330032348633],
              [11.955599784851074, 43.61899948120117], [3.1687800884246826, 43.62900161743164]];
const CH_W = 710, CH_H = 640;
{
  const p = CH_C.map(([lo, la]) => rzcFwd(lo, la));
  const breite = (p[1][0] + p[2][0]) / 2 - (p[0][0] + p[3][0]) / 2;
  const hoehe = (p[0][1] + p[1][1]) / 2 - (p[2][1] + p[3][1]) / 2;
  add('CH: Ecken in LV95 achsparallel (< 5 m)',
    Math.abs(p[0][0] - p[3][0]) < 5 && Math.abs(p[0][1] - p[1][1]) < 5,
    'dx ' + (p[0][0] - p[3][0]).toFixed(2) + ' m · dy ' + (p[0][1] - p[1][1]).toFixed(2) + ' m');
  add('CH: Spannweite = xsize·xscale × ysize·yscale (710 × 640 km, ± 10 m)',
    Math.abs(breite - CH_W * 1000) < 10 && Math.abs(hoehe - CH_H * 1000) < 10,
    (breite / 1000).toFixed(3) + ' × ' + (hoehe / 1000).toFixed(3) + ' km');
  const bern = rzcFwd(7.4395833, 46.9524056);
  add('CH: Projektionsursprung trifft den LV95-Nullpunkt Bern (± 1 km)',
    Math.abs(bern[0] - 2600000) < 1000 && Math.abs(bern[1] - 1200000) < 1000,
    Math.round(bern[0]) + ' / ' + Math.round(bern[1]));
  let rtMax = 0;
  for (const [lat, lon] of [[47.377, 8.54], [46.948, 7.447], [46.204, 6.143], [46.005, 8.951]]) {
    const [E, N] = rzcFwd(lon, lat); const [lo2, la2] = rzcInv(E, N);
    rtMax = Math.max(rtMax, distKm(lat, lon, la2, lo2) * 1000);
  }
  add('CH: rzcInv kehrt rzcFwd um (< 1 cm)', rtMax < 0.01, rtMax.toFixed(4) + ' m');

  const frame = new Uint8Array(CH_W * CH_H);
  const pj = CH_C.map(([lo, la]) => rzcFwd(lo, la));
  const x0 = (pj[0][0] + pj[3][0]) / 2, x1 = (pj[1][0] + pj[2][0]) / 2;
  const y0 = (pj[0][1] + pj[1][1]) / 2, y1 = (pj[2][1] + pj[3][1]) / 2;
  const cellCenter = (col, row) => rzcInv(
    x0 + ((col + 0.5) / CH_W) * (x1 - x0), y0 + ((row + 0.5) / CH_H) * (y1 - y0));
  let treffer = 0, versuche = 0;
  for (const [col, row] of [[0, 0], [355, 320], [709, 639], [100, 500], [600, 60], [355, 0], [0, 320]]) {
    const [lon, lat] = cellCenter(col, row);
    frame.fill(0); frame[row * CH_W + col] = 200;
    versuche++;
    if (sampleRadarPoint('meteoswiss_rzc', frame, CH_W, CH_H, CH_C, lat, lon, 20) > 0) treffer++;
  }
  add('CH: Punktabfrage trifft die Zellmitte (' + treffer + '/' + versuche + ' Zellen, inkl. Ränder)',
    treffer === versuche);
}

// ---------------------------------------------------------------------------
// (9) Der Kontrakt für AT und CH: an den Knoten des Warp-Mesh, das der RainLayer
//     seit RP2 zeichnet, trifft die Punktabfrage exakt die gezeichnete Zelle.
// ---------------------------------------------------------------------------
const MESH_FAELLE = [
  ['AT', incaWarpMesh(AT_C), INCA_WARP_N, AT_C, AT_W, AT_H, 'inca_grid', incaFwd],
  ['CH', rzcWarpMesh(CH_C), RZC_WARP_N, CH_C, CH_W, CH_H, 'meteoswiss_rzc', rzcFwd],
];
for (const [name, mesh, N, C, W, H, source, projFn] of MESH_FAELLE) {
  // Gemessen wird der VERSATZ in Zellen, nicht Zell-Identität: eine Maschenmitte
  // kann rechnerisch genau auf einer Zellgrenze liegen, wo schon Millimeter die
  // Zelle kippen — das sagt nichts über die Verortung. Der Kontrakt ist: die
  // Position, die die Karte an dieser Stelle zeigt, und die Position, die die
  // Punktabfrage dort liest, liegen weniger als 1/10 Zelle auseinander.
  const node = (i, j) => { const k = (j * (N + 1) + i) * 2; return [mesh[k], mesh[k + 1]]; };
  let maxDCol = 0, maxDRow = 0, geprueft = 0, zellTreffer = 0, zellGeprueft = 0;
  const frame = new Uint8Array(W * H);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      // Prüfpunkt bewusst NICHT die Maschenmitte: bei glatten Teilern (CH: 640/16)
      // fällt die Mitte exakt auf Zellgrenzen, wo der Zell-Check nichts aussagt.
      const S = 0.37, T = 0.41;
      const a = node(i, j), b = node(i + 1, j), c = node(i + 1, j + 1), d = node(i, j + 1);
      const lon = (1 - S) * (1 - T) * a[0] + S * (1 - T) * b[0] + S * T * c[0] + (1 - S) * T * d[0];
      const lat = (1 - S) * (1 - T) * a[1] + S * (1 - T) * b[1] + S * T * c[1] + (1 - S) * T * d[1];
      const uv = inverseBilinear(C, lat, lon, projFn);
      if (!uv) { maxDCol = Infinity; continue; }
      const colIst = uv.u * W, rowIst = uv.v * H;
      const colSoll = ((i + S) / N) * W, rowSoll = ((j + T) / N) * H;
      maxDCol = Math.max(maxDCol, Math.abs(colIst - colSoll));
      maxDRow = Math.max(maxDRow, Math.abs(rowIst - rowSoll));
      geprueft++;
      // Zell-Identität nur dort verlangen, wo die Mitte nicht auf einer Grenze liegt.
      const randCol = Math.min(colIst % 1, 1 - (colIst % 1));
      const randRow = Math.min(rowIst % 1, 1 - (rowIst % 1));
      if (Math.min(randCol, randRow) > 0.1) {
        const col = Math.min(W - 1, Math.floor(colSoll)), row = Math.min(H - 1, Math.floor(rowSoll));
        frame.fill(0); frame[row * W + col] = 200;
        zellGeprueft++;
        if (sampleRadarPoint(source, frame, W, H, C, lat, lon, 20) > 0) zellTreffer++;
      }
    }
  }
  add(name + ': Karte und Punktabfrage decken sich (' + geprueft + ' Mesh-Maschen, < 1/10 Zelle)',
    maxDCol < 0.1 && maxDRow < 0.1,
    'max ' + Math.max(maxDCol, maxDRow).toFixed(3) + ' Zellen ≈ ' + Math.round(Math.max(maxDCol, maxDRow) * 1000) + ' m');
  add(name + ': dieselbe Zelle abseits der Zellgrenzen (' + zellTreffer + '/' + zellGeprueft + ')',
    zellTreffer === zellGeprueft, (zellGeprueft - zellTreffer) + ' daneben');
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
}
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
