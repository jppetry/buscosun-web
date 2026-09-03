// KL9-Beleg (2026-08-26): Mercator-Restfehler je Mesh und Unterteilung — Messgrundlage für §15.3 (Aufruf aus dem Repo-Root: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/karten-layer-verortung/kl9-mercsim.mjs).
import { DE1200_CORNERS, psFwd, psInv } from '../../src/sources/radolanGeo.ts';
import { cellCentersToEdges, incaFwd, incaInv } from '../../src/sources/geosphereIncaGeo.ts';
import { rzcFwd, rzcInv } from '../../src/sources/meteoSwissGeo.ts';
import { COMPOSITE_CORNERS } from '../../src/scalar/precipComposite.ts';

const merX = (lon) => (lon + 180) / 360;
const merY = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const invMerX = (x) => x * 360 - 180;
const invMerY = (y) => ((Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 4) * 360) / Math.PI;
const R = 6371.0088;
const distKm = (lo1, la1, lo2, la2) => {
  const dl = (la2 - la1) * Math.PI / 180, dn = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dl / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// truth(u,v) → [lon,lat]: wo der Texturpunkt (u,v) wirklich liegt.
const bilinLL = (C) => (u, v) => {
  const [nw, ne, se, sw] = C;
  return [
    (1 - u) * (1 - v) * nw[0] + u * (1 - v) * ne[0] + u * v * se[0] + (1 - u) * v * sw[0],
    (1 - u) * (1 - v) * nw[1] + u * (1 - v) * ne[1] + u * v * se[1] + (1 - u) * v * sw[1],
  ];
};
const projLinear = (C, fwd, inv, bilin) => {
  const P = C.map(([lo, la]) => fwd(lo, la));
  if (bilin) {
    return (u, v) => inv(
      (1 - u) * (1 - v) * P[0][0] + u * (1 - v) * P[1][0] + u * v * P[2][0] + (1 - u) * v * P[3][0],
      (1 - u) * (1 - v) * P[0][1] + u * (1 - v) * P[1][1] + u * v * P[2][1] + (1 - u) * v * P[3][1]);
  }
  const west = (P[0][0] + P[3][0]) / 2, ost = (P[1][0] + P[2][0]) / 2;
  const nord = (P[0][1] + P[1][1]) / 2, sued = (P[2][1] + P[3][1]) / 2;
  return (u, v) => inv(west + u * (ost - west), nord + v * (sued - nord));
};

/** Schlimmster Abstand (km) zwischen gezeichneter und wahrer Lage des Texturpunkts,
 *  Mesh nx×ny, GPU-Interpolation linear in Mercator je Dreieck. */
function worst(truth, nx, ny, S = [0.25, 0.5, 0.75]) {
  const node = new Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const ll = truth(i / nx, j / ny);
    node[j * (nx + 1) + i] = [merX(ll[0]), merY(ll[1])];
  }
  let w = 0, wAt = null;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const NW = node[j * (nx + 1) + i], NE = node[j * (nx + 1) + i + 1];
    const SE = node[(j + 1) * (nx + 1) + i + 1], SW = node[(j + 1) * (nx + 1) + i];
    for (const s of S) for (const t of S) {
      let x, y;
      if (s >= t) { const a = 1 - s, b = s - t, c = t; x = a * NW[0] + b * NE[0] + c * SE[0]; y = a * NW[1] + b * NE[1] + c * SE[1]; }
      else { const a = 1 - t, b = s, c = t - s; x = a * NW[0] + b * SE[0] + c * SW[0]; y = a * NW[1] + b * SE[1] + c * SW[1]; }
      const drawn = [invMerX(x), invMerY(y)];
      const tr = truth((i + s) / nx, (j + t) / ny);
      const d = distKm(drawn[0], drawn[1], tr[0], tr[1]);
      if (d > w) { w = d; wAt = tr; }
    }
  }
  return { km: w, at: wAt };
}

const D2 = [[-3.94, 58.08], [20.34, 58.08], [20.34, 43.18], [-3.94, 43.18]];
const AT_CENTERS = [[8.09813404083252, 49.362918853759766], [17.74226951599121, 49.396671295166016],
  [17.430356979370117, 45.53426742553711], [8.468643188476562, 45.50288391113281]];
const AT_C = cellCentersToEdges(AT_CENTERS, 701, 431);
const CH_C = [[2.689419984817505, 49.3744010925293], [12.462300300598145, 49.36330032348633],
  [11.955599784851074, 43.61899948120117], [3.1687800884246826, 43.62900161743164]];
// Weltmesh der ScalarLayer: Band 170,1°/64 = 2,658°; DACH-relevantes Band um 50 N.
const MERC_MAX_LAT = 85.05112878, band = 2 * MERC_MAX_LAT / 64;
const jBand = Math.floor((50 + MERC_MAX_LAT) / band);
const WORLD_BAND = [[5, -MERC_MAX_LAT + (jBand + 1) * band], [17, -MERC_MAX_LAT + (jBand + 1) * band],
  [17, -MERC_MAX_LAT + jBand * band], [5, -MERC_MAX_LAT + jBand * band]];

const cases = [
  ['Komposit DACH (lat/lon)', bilinLL(COMPOSITE_CORNERS)],
  ['ICON-D2 nativ (lat/lon)', bilinLL(D2)],
  ['Weltmesh-Band 2,66° (ScalarLayer heute, 1 Zeile)', bilinLL(WORLD_BAND)],
  ['DE1200 (polar-stereo)', projLinear(DE1200_CORNERS, psFwd, psInv, true)],
  ['INCA AT (Lambert)', projLinear(AT_C, incaFwd, incaInv, false)],
  ['rzc CH (LV95)', projLinear(CH_C, rzcFwd, rzcInv, false)],
];
const fmt = (km) => km >= 1 ? `${km.toFixed(2)} km` : `${(km * 1000).toFixed(2)} m`;
for (const [name, truth] of cases) {
  console.log(`\n== ${name}`);
  for (const [nx, ny] of [[1, 1], [32, 32], [16, 16], [64, 64], [128, 128], [256, 256], [1, 64], [1, 256], [1, 512], [1, 1024], [4, 512], [8, 256], [8, 512], [32, 256], [32, 512], [64, 512]]) {
    const t0 = performance.now();
    const r = worst(truth, nx, ny, nx * ny > 40000 ? [0.5] : [0.25, 0.5, 0.75]);
    console.log(`  ${String(nx).padStart(3)}×${String(ny).padEnd(4)} → ${fmt(r.km).padStart(10)}  (bei ${r.at[1].toFixed(2)} N, ${(performance.now() - t0).toFixed(0)} ms)`);
  }
}
// Analytik: e = Δlat² · tan φ / 8 · R
console.log('\nFormel e(Δlat, φ): Komposit Zeilen 32 →', fmt(((10.2 / 32) * Math.PI / 180) ** 2 * Math.tan(55.5 * Math.PI / 180) / 8 * R),
  '· D2 Zeilen 32 →', fmt(((14.9 / 32) * Math.PI / 180) ** 2 * Math.tan(58.08 * Math.PI / 180) / 8 * R),
  '· Welt Band 2,658° bei 50 N →', fmt(((band) * Math.PI / 180) ** 2 * Math.tan(50 * Math.PI / 180) / 8 * R));

// --- Baukosten der projizierten Meshes (Knoten-Inverse) ---
const cost = (name, n, fn) => { const t0 = performance.now(); for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) fn(i / n, j / n); console.log(`${name} ${n}²: ${(performance.now() - t0).toFixed(0)} ms`); };
cost('DE1200 psInv', 320, projLinear(DE1200_CORNERS, psFwd, psInv, true));
cost('DE1200 psInv', 256, projLinear(DE1200_CORNERS, psFwd, psInv, true));
cost('INCA incaInv', 128, projLinear(AT_C, incaFwd, incaInv, false));
cost('rzc rzcInv', 160, projLinear(CH_C, rzcFwd, rzcInv, false));
for (const [name, truth, n] of [['DE 320', projLinear(DE1200_CORNERS, psFwd, psInv, true), 320], ['AT 128', projLinear(AT_C, incaFwd, incaInv, false), 128], ['CH 160', projLinear(CH_C, rzcFwd, rzcInv, false), 160], ['CH 128', projLinear(CH_C, rzcFwd, rzcInv, false), 128]]) {
  const r = worst(truth, n, n, [0.5]); console.log(`  ${name}² → ${fmt(r.km)}`);
}
// --- Nicht-uniforme Zeilen (Weltmesh / Footprint): Δ(φ) = sqrt(8e/(R tan φ)) ---
function latRows(latS, latN, eKm = 0.001, maxDeg = 2) {
  const rows = [latS];
  let lat = latS;
  while (lat < latN) {
    const far = Math.max(Math.abs(lat), Math.abs(lat + 0.0001));
    const d0 = Math.sqrt(8 * eKm / (R * Math.max(1e-6, Math.tan(Math.min(far, 89) * Math.PI / 180)))) * 180 / Math.PI;
    const far2 = Math.max(Math.abs(lat), Math.abs(lat + Math.min(d0, maxDeg)));
    const d = Math.min(maxDeg, Math.sqrt(8 * eKm / (R * Math.max(1e-6, Math.tan(Math.min(far2, 89) * Math.PI / 180)))) * 180 / Math.PI);
    lat = Math.min(latN, lat + d);
    rows.push(lat);
  }
  return rows;
}
const worstRows = (rows, samples = [0.25, 0.5, 0.75]) => {
  let w = 0, at = 0;
  for (let k = 0; k + 1 < rows.length; k++) {
    const a = rows[k], b = rows[k + 1];
    for (const t of samples) {
      const lat = a + t * (b - a);
      const y = merY(a) + t * (merY(b) - merY(a));
      const d = Math.abs(invMerY(y) - lat) * Math.PI / 180 * R;
      if (d > w) { w = d; at = lat; }
    }
  }
  return { km: w, at };
};
for (const [name, s, n] of [['Welt ±85,05', -MERC_MAX_LAT, MERC_MAX_LAT], ['D2 43,18–58,08', 43.18, 58.08], ['Komposit 45,3–55,5', 45.3, 55.5]]) {
  const rows = latRows(s, n); const r = worstRows(rows);
  console.log(`${name}: ${rows.length - 1} Zeilen → ${fmt(r.km)} bei ${r.at.toFixed(2)}`);
}
