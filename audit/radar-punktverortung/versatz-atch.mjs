import fs from 'node:fs';
import { incaFwd, incaInv } from 'file:///C:/dev/buscosun-web/src/sources/geosphereIncaGeo.ts';
import { rzcFwd, rzcInv } from 'file:///C:/dev/buscosun-web/src/sources/meteoSwissGeo.ts';
import { inverseBilinear } from 'file:///C:/dev/buscosun-web/src/pointForecast/quadSampler.ts';

const places = JSON.parse(fs.readFileSync('C:/dev/buscosun-web/public/fire/places-dach.json', 'utf8')).places;
const distKm = (a, b, c, d) => { const R = 6371.0088, p = Math.PI / 180; return Math.hypot((c - a) * p * R, (d - b) * p * R * Math.cos((a + c) / 2 * p)); };

// corners wie die App sie jetzt führt (Außenkanten)
const AT_C = [[8.0909, 49.3672], [17.7496, 49.4008], [17.4363, 45.5294], [8.4626, 45.4982]];
const CH_C = [[2.689419984817505, 49.3744010925293], [12.462300300598145, 49.36330032348633],
              [11.955599784851074, 43.61899948120117], [3.1687800884246826, 43.62900161743164]];

function report(name, fwd, inv, C, W, H, cc) {
  const p = C.map(([lo, la]) => fwd(lo, la));
  const x0 = (p[0][0] + p[3][0]) / 2, x1 = (p[1][0] + p[2][0]) / 2;
  const y0 = (p[0][1] + p[1][1]) / 2, y1 = (p[2][1] + p[3][1]) / 2;
  const cellPos = (col, row) => inv(x0 + ((col + 0.5) / W) * (x1 - x0), y0 + ((row + 0.5) / H) * (y1 - y0));
  const rows = [];
  for (const [lat, lon, ort, , land, pop] of places) {
    if (land !== cc || pop < 10000) continue;
    const alt = inverseBilinear(C, lat, lon);            // Weg vor RP2: linear in lon/lat
    const neu = inverseBilinear(C, lat, lon, fwd);       // seit RP2: im Gitterraum
    if (!alt || !neu) continue;
    const cA = [Math.min(W - 1, Math.floor(alt.u * W)), Math.min(H - 1, Math.floor(alt.v * H))];
    const cN = [Math.min(W - 1, Math.floor(neu.u * W)), Math.min(H - 1, Math.floor(neu.v * H))];
    const [loA, laA] = cellPos(cA[0], cA[1]);
    const [loN, laN] = cellPos(cN[0], cN[1]);
    rows.push({ ort, altKm: distKm(lat, lon, laA, loA), neuKm: distKm(lat, lon, laN, loN),
                zellen: Math.hypot(cA[0] - cN[0], cA[1] - cN[1]) });
  }
  rows.sort((a, b) => b.altKm - a.altKm);
  const med = (arr) => arr.slice().sort((x, y) => x - y)[Math.floor(arr.length / 2)];
  console.log(`\n=== ${name} — ${rows.length} Orte ab 10 000 EW ===`);
  console.log('  vorher (4-Eck in lon/lat): Median', med(rows.map(r => r.altKm)).toFixed(2),
              'km · max', rows[0].altKm.toFixed(2), 'km (' + rows[0].ort + ')');
  console.log('  jetzt  (im Gitterraum)   : Median', med(rows.map(r => r.neuKm)).toFixed(2),
              'km · max', Math.max(...rows.map(r => r.neuKm)).toFixed(2), 'km');
  console.log('  Zellversatz alt→neu      : Median', med(rows.map(r => r.zellen)).toFixed(1),
              'Zellen · max', Math.max(...rows.map(r => r.zellen)).toFixed(0), 'Zellen (= km)');
  console.log('  Beispiele:');
  for (const r of rows.slice(0, 5)) console.log(`    ${r.ort.padEnd(16)} vorher ${r.altKm.toFixed(1).padStart(5)} km daneben → jetzt ${r.neuKm.toFixed(2)} km`);
}

report('AT — GeoSphere INCA', incaFwd, incaInv, AT_C, 701, 431, 'AT');
report('CH — MeteoSchweiz rzc', rzcFwd, rzcInv, CH_C, 710, 640, 'CH');
