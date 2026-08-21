/**
 * Unabhängige Gegenprobe zu B1, ohne Ortsliste und ohne Texel-Arithmetik:
 * für vier Städte die WAHRE Gitterfraktion in DE1200 (polar-stereografisch)
 * gegen die Fraktion, die das lon/lat-Rechteck des `ConfidenceLayer` unterstellt.
 *
 * Prüft nebenbei die Eck-Geometrie selbst: die PS-Spanne muss exakt
 * 1100 × 1200 km sein (DE1200, 1 km Zellen).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/karten-layer-verortung/spot-confidence.mjs
 */
import { DE1200_CORNERS, psFwd, psInv } from '../../src/sources/radolanGeo.ts';

const [NW, NE, , SW] = DE1200_CORNERS;
const pNW = psFwd(NW[0], NW[1]), pNE = psFwd(NE[0], NE[1]), pSW = psFwd(SW[0], SW[1]);
const x0 = pNW[0], x1 = pNE[0], y0 = pNW[1], y1 = pSW[1];
const SE = DE1200_CORNERS[2];

console.log('PS-Spanne  x:', ((x1 - x0) / 1000).toFixed(1), 'km   y:', ((y0 - y1) / 1000).toFixed(1), 'km  (Soll 1100 / 1200)');

const R = 6371.0088, P = Math.PI / 180;
for (const [name, lon, lat] of [
  ['Berlin', 13.41, 52.52], ['Stralsund', 13.09, 54.31],
  ['München', 11.58, 48.14], ['Köln', 6.96, 50.94],
]) {
  const [px, py] = psFwd(lon, lat);
  const uT = (px - x0) / (x1 - x0), vT = (y0 - py) / (y0 - y1);            // wahre Gitterfraktion
  const uR = (lon - NW[0]) / (SE[0] - NW[0]);                              // Rechteck: nur NW und SE
  const vR = (NW[1] - lat) / (NW[1] - SE[1]);
  const [glon, glat] = psInv(x0 + uR * (x1 - x0), y0 - vR * (y0 - y1));    // was das Rechteck dort zeigt
  const d = Math.hypot((glat - lat) * P * R, (glon - lon) * P * R * Math.cos(((lat + glat) / 2) * P));
  console.log(`${name.padEnd(11)} wahr u=${uT.toFixed(4)} v=${vT.toFixed(4)}`
    + ` | Rechteck u=${uR.toFixed(4)} v=${vR.toFixed(4)}  ⇒ ${d.toFixed(1)} km daneben`);
}
