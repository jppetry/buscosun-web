/**
 * Misst den Verortungsfehler des Vertrauens-Schleiers (`confidence`) im
 * PoP-Modus: `buildEnsembleConfidenceImage` reduziert die POLAR-STEREOGRAFISCHEN
 * DE1200-Ecken auf ein achsparalleles lon/lat-Rechteck (nur NW und SE) und
 * rendert es über den `ConfidenceLayer` linear in Äquirektangular.
 *
 * Zum Vergleich: derselbe Rechenweg für `poprob`/`flownowcast`, die dasselbe
 * Gitter über `de1200WarpMesh` zeichnen (RP1) — die Kontrolle muss ~0 liefern.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/karten-layer-verortung/versatz-confidence.mjs
 */
import fs from 'node:fs';
import { DE1200_CORNERS, psFwd, psInv, de1200WarpMesh, DE1200_WARP_N } from '../../src/sources/radolanGeo.ts';

const places = JSON.parse(fs.readFileSync('public/fire/places-dach.json', 'utf8')).places;
const P = Math.PI / 180, R = 6371.0088;
const dKm = (a1, o1, a2, o2) => Math.hypot((a2 - a1) * P * R, (o2 - o1) * P * R * Math.cos(((a1 + a2) / 2) * P));

// DE1200: 1100 Spalten × 1200 Zeilen, 1 km. Flow-Gitter: floor(n/8).
const NC = 1100, NR = 1200, F = 8;
const W = Math.floor(NC / F), H = Math.floor(NR / F);

const [NW, NE, SE, SW] = DE1200_CORNERS;
const pNW = psFwd(NW[0], NW[1]), pNE = psFwd(NE[0], NE[1]),
      pSE = psFwd(SE[0], SE[1]), pSW = psFwd(SW[0], SW[1]);

/** Wahre Geo-Position der DE1200-Zelle (c, r) — c 0=West, r 0=Nord (north-up). */
function trueCell(c, r) {
  const u = (c + 0.5) / NC, v = (r + 0.5) / NR;
  const x = (1 - u) * (1 - v) * pNW[0] + u * (1 - v) * pNE[0] + (1 - u) * v * pSW[0] + u * v * pSE[0];
  const y = (1 - u) * (1 - v) * pNW[1] + u * (1 - v) * pNE[1] + (1 - u) * v * pSW[1] + u * v * pSE[1];
  return psInv(x, y); // [lon, lat]
}
/** Wahre Position der GROBEN Flow-Zelle (i, j) = Mitte ihres 8×8-Blocks. */
const trueCoarse = (i, j) => trueCell(i * F + (F - 1) / 2, j * F + (F - 1) / 2);

// --- (E) Vertrauens-Schleier: Rechteck aus NUR NW und SE -------------------
const x0 = (NW[0] + 180) / 360, y0 = (90 - NW[1]) / 180;
const x1 = (SE[0] + 180) / 360, y1 = (90 - SE[1]) / 180;

// --- Kontrolle: dasselbe Gitter über das Warp-Mesh (poprob/flownowcast) ----
const MESH = de1200WarpMesh(), MN = DE1200_WARP_N;
const node = (i, j) => { const k = (j * (MN + 1) + i) * 2; return [MESH[k], MESH[k + 1]]; };

const rowsE = [], rowsK = [];
for (const [lat, lon, ort, , land, pop] of places) {
  if (pop < 20000) continue;

  // (E) Rückwärts durch das Rechteck: wo liest der Schleier an diesem Ort?
  const ex = (lon + 180) / 360, ey = (90 - lat) / 180;
  const u = (ex - x0) / (x1 - x0), v = (ey - y0) / (y1 - y0);
  if (u < 0 || u > 1 || v < 0 || v > 1) continue;              // außerhalb des Rechtecks
  const ti = u * W - 0.5, tj = v * H - 0.5;                    // Texel-Konvention des Shaders
  const [tlon, tlat] = trueCoarse(ti, tj);
  rowsE.push({ ort, land, km: dKm(lat, lon, tlat, tlon) });

  // Kontrolle: das Warp-Mesh bilinear invertieren (grob, aber ausreichend:
  // wir suchen die Masche und interpolieren in ihr).
  let best = null;
  for (let j = 0; j < MN && !best; j++) {
    for (let i = 0; i < MN; i++) {
      const a = node(i, j), b = node(i + 1, j), c = node(i + 1, j + 1), d = node(i, j + 1);
      const loMin = Math.min(a[0], b[0], c[0], d[0]), loMax = Math.max(a[0], b[0], c[0], d[0]);
      const laMin = Math.min(a[1], b[1], c[1], d[1]), laMax = Math.max(a[1], b[1], c[1], d[1]);
      if (lon < loMin || lon > loMax || lat < laMin || lat > laMax) continue;
      // Newton auf der Masche
      let s = 0.5, t = 0.5;
      for (let it = 0; it < 12; it++) {
        const bx = (1 - s) * (1 - t) * a[0] + s * (1 - t) * b[0] + s * t * c[0] + (1 - s) * t * d[0];
        const by = (1 - s) * (1 - t) * a[1] + s * (1 - t) * b[1] + s * t * c[1] + (1 - s) * t * d[1];
        const rx = bx - lon, ry = by - lat;
        const dsx = (1 - t) * (b[0] - a[0]) + t * (c[0] - d[0]);
        const dsy = (1 - t) * (b[1] - a[1]) + t * (c[1] - d[1]);
        const dtx = (1 - s) * (d[0] - a[0]) + s * (c[0] - b[0]);
        const dty = (1 - s) * (d[1] - a[1]) + s * (c[1] - b[1]);
        const det = dsx * dty - dsy * dtx; if (Math.abs(det) < 1e-14) break;
        s -= (dty * rx - dtx * ry) / det; t -= (-dsy * rx + dsx * ry) / det;
      }
      if (s >= -0.01 && s <= 1.01 && t >= -0.01 && t <= 1.01) {
        const uu = (i + s) / MN, vv = (j + t) / MN;
        best = trueCell(uu * NC - 0.5, vv * NR - 0.5);
        break;
      }
    }
  }
  if (best) rowsK.push({ ort, land, km: dKm(lat, lon, best[1], best[0]) });
}

const med = (a) => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
const report = (name, rows) => {
  rows.sort((a, b) => b.km - a.km);
  console.log(`\n=== ${name} — ${rows.length} Orte ≥ 20 000 EW`);
  console.log(`    Median ${med(rows.map(r => r.km)).toFixed(2)} km · max ${rows[0].km.toFixed(2)} km (${rows[0].ort})`);
  console.log('    größte Abweichungen: ' + rows.slice(0, 6).map(r => `${r.ort} ${r.km.toFixed(1)}`).join(' · ') + ' km');
};
report('confidence (PoP-Modus): DE1200 als lon/lat-Rechteck', rowsE);
report('  davon nur DE (dort trägt RADOLAN Daten)', rowsE.filter((r) => r.land === 'DE'));
report('KONTROLLE poprob/flownowcast: DE1200 über de1200WarpMesh (RP1)', rowsK);
report('  Kontrolle, nur DE', rowsK.filter((r) => r.land === 'DE'));
