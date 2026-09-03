/**
 * NACHMESSUNG nach Gate GKL1 (2026-08-22) — je Layer der Wetterkarte:
 * liegt der gezeichnete Wert noch neben seinem Abtastpunkt?
 *
 * Anders als `versatz-layer.mjs` (das den Zustand VOR dem Fix maß und beide
 * Konventionen von Hand nachbaute) importiert dieses Skript die ECHTEN Module
 * und misst den Ist-Zustand. Wo es die Zahl VORHER gibt, steht sie daneben.
 *
 * Kein Netz: Gitterparameter aus `probe-d2grid.mjs` (am echten GRIB gemessen).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        audit/karten-layer-verortung/nachmessung.mjs
 */
import fs from 'node:fs';
import { gribCorners, subsampledCorners } from '../../src/sources/gribDecode.ts';
import { texelCoord } from '../../src/wind/windPointSample.ts';
import { G, gridLatLon, buildIndexMap } from '../../src/scalar/precipIndexMap.ts';
import { DE1200_CORNERS, psFwd, psInv } from '../../src/sources/radolanGeo.ts';
import { ensembleGrid } from '../../src/scalar/confidenceImage.ts';
import { blockSpans } from '../../src/ml/coarsen.ts';

const P = Math.PI / 180;
const kmLon = (lat) => 111.32 * Math.cos(lat * P);
const KM_LAT = 111.13;
const dKm = (lat1, lon1, lat2, lon2) =>
  Math.hypot((lat2 - lat1) * KM_LAT, (lon2 - lon1) * kmLon((lat1 + lat2) / 2));
const med = (a) => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
const f2 = (v) => v.toFixed(2);

const places = JSON.parse(fs.readFileSync('public/fire/places-dach.json', 'utf8')).places
  .filter((p) => p[5] >= 20000);

console.log(`Orte im Prüfsatz: ${places.length} (DACH, >= 20 000 EW)\n`);

// ===========================================================================
// 1) Reguläre lon/lat-Raster: ICON-D2 (subsampled + voll) und ICON-EU
// ===========================================================================
// Gitter am echten GRIB gemessen (audit/karten-layer-verortung/probe-d2grid.mjs)
const D2 = {
  ni: 1215, nj: 746, di: 0.02, dj: 0.02,
  lon1: -3.94, lat1: 43.18, lon2: -3.94 + 1214 * 0.02, lat2: 43.18 + 745 * 0.02,
};
const EU = {
  ni: 1377, nj: 657, di: 0.0625, dj: 0.0625,
  lon1: -23.5, lat1: 29.5, lon2: -23.5 + 1376 * 0.0625, lat2: 29.5 + 656 * 0.0625,
};

/**
 * Misst eine Raster-Familie:
 *  a) Karte <-> Wirklichkeit — Abstand zwischen dem Ort, an dem der Shader den
 *     Wert von Texel (i,j) zeichnet, und dem Ort, VON DEM dieser Wert stammt.
 *  b) Karte <-> Punktabfrage — Abstand zwischen der Texelkoordinate, die der
 *     Shader benutzt, und der, die die Punktabfrage benutzt (an echten Orten).
 * Beides einmal mit dem heutigen Weg (`subsampledCorners` + `texelCoord`) und
 * einmal mit dem alten (`gribCorners` + `u*(n-1)`).
 */
function messeRaster(name, f, ss) {
  const W = Math.ceil(f.ni / ss), H = Math.ceil(f.nj / ss);
  const neu = subsampledCorners(f, ss);
  const alt = gribCorners(f);
  const erg = {};
  for (const [tag, c] of [['neu', neu], ['alt', alt]]) {
    const west = c[0][0], north = c[0][1], east = c[1][0], south = c[2][1];
    let maxKm = 0;
    for (let ii = 0; ii < W; ii++) {
      const si = Math.min(f.ni - 1, ii * ss);
      const trueLon = f.lon1 + si * f.di;
      const drawLon = west + ((ii + 0.5) / W) * (east - west);
      for (let jj = 0; jj < H; jj += 8) {
        const sj = Math.min(f.nj - 1, jj * ss);
        const y = H - 1 - jj;
        const trueLat = f.lat1 + sj * f.dj;
        const drawLat = north - ((y + 0.5) / H) * (north - south);
        const d = dKm(trueLat, trueLon, drawLat, drawLon);
        if (d > maxKm) maxKm = d;
      }
    }
    // Punktabfrage an echten Orten
    const rq = [];
    for (const [lat, lon] of places) {
      if (lon < Math.min(west, east) || lon > Math.max(west, east)) continue;
      if (lat < Math.min(north, south) || lat > Math.max(north, south)) continue;
      const u = (lon - west) / (east - west), v = (north - lat) / (north - south);
      const xShader = texelCoord(u, W), yShader = texelCoord(v, H);
      const xQ = tag === 'neu' ? texelCoord(u, W) : u * (W - 1);
      const yQ = tag === 'neu' ? texelCoord(v, H) : v * (H - 1);
      rq.push(Math.hypot(
        (xQ - xShader) * ss * f.di * kmLon(lat),
        (yQ - yShader) * ss * f.dj * KM_LAT,
      ));
    }
    erg[tag] = { maxKm, rqMed: med(rq), rqMax: Math.max(...rq), n: rq.length };
  }
  console.log(`--- ${name}  (${W}x${H}, Zelle ${(ss * f.di).toFixed(3)}° = ${f2(ss * f.di * kmLon(50))} x ${f2(ss * f.dj * KM_LAT)} km)`);
  console.log(`    Karte <-> Wirklichkeit :  JETZT ${erg.neu.maxKm.toExponential(2)} km   (vorher ${f2(erg.alt.maxKm)} km)`);
  console.log(`    Karte <-> Punktabfrage :  JETZT ${f2(erg.neu.rqMax)} km max   (vorher Median ${f2(erg.alt.rqMed)} / max ${f2(erg.alt.rqMax)} km, ${erg.alt.n} Orte)`);
  return erg;
}

const fam = {};
fam.d2 = messeRaster('ICON-D2 nativ, subsampled ss=2 — temp gust thunder lightningfc snow rotation wind', D2, Math.max(1, Math.ceil(D2.ni / 700)));
fam.clouds = messeRaster('ICON-D2 nativ, voll ss=1 — clouds', D2, 1);
fam.eu = messeRaster('ICON-EU nativ, subsampled ss=2 — wind auf Druckflächen', EU, Math.max(1, Math.ceil(EU.ni / 700)));

// ===========================================================================
// 2) DEM des Temperatur-Layers (B6) — Höhenkorrektur je Pixel
// ===========================================================================
{
  const ss = 2;
  const c = subsampledCorners(D2, ss);
  const lngMin = c[0][0], lngMax = c[1][0], latMin = c[2][1], latMax = c[0][1];
  const rows = 700;
  const lonSpan = lngMax - lngMin, latSpan = Math.max(0.01, latMax - latMin);
  const cols = Math.max(64, Math.round(rows * (lonSpan / latSpan)));
  const test = (dLat, dLng, lat0Of, lng0Of) => {
    let max = 0;
    for (let j = 0; j < rows; j += 3) {
      const y = rows - 1 - j;
      const drawLat = latMax - ((y + 0.5) / rows) * latSpan;
      const smpLat = lat0Of(j, dLat);
      for (let i = 0; i < cols; i += 7) {
        const drawLng = lngMin + ((i + 0.5) / cols) * lonSpan;
        const smpLng = lng0Of(i, dLng);
        const d = dKm(smpLat, smpLng, drawLat, drawLng);
        if (d > max) max = d;
      }
    }
    return max;
  };
  const jetzt = test(latSpan / rows, lonSpan / cols,
    (j, d) => latMin + (j + 0.5) * d, (i, d) => lngMin + (i + 0.5) * d);
  const vorher = test(latSpan / (rows - 1), lonSpan / (cols - 1),
    (j, d) => latMin + j * d, (i, d) => lngMin + i * d);
  console.log(`--- DEM des Temp-Layers (${cols}x${rows} Terrarium über dieselben Ecken)`);
  console.log(`    DEM-Pixel <-> seine Zeichenfläche :  JETZT ${jetzt.toExponential(2)} km   (vorher ${f2(vorher)} km)`);
  fam.dem = { jetzt, vorher };
}

// ===========================================================================
// 3) DACH-Niederschlags-Komposit (B4) + sein ICON-D2-Zugriff (B7)
// ===========================================================================
{
  const { lat, lon } = gridLatLon();
  let max = 0;
  for (let r = 0; r < G.h; r += 3) {
    const drawLat = G.latMax - ((r + 0.5) / G.h) * (G.latMax - G.latMin);
    for (let c = 0; c < G.w; c += 7) {
      const i = r * G.w + c;
      const drawLon = G.lonMin + ((c + 0.5) / G.w) * (G.lonMax - G.lonMin);
      const d = dKm(lat[i], lon[i], drawLat, drawLon);
      if (d > max) max = d;
    }
  }
  // Zugriff auf ICON-D2 (voll aufgelöst) über GridKind 'lonlat'
  const cD2 = gribCorners(D2);
  const probeLat = new Float32Array(places.length), probeLon = new Float32Array(places.length);
  places.forEach((p, i) => { probeLat[i] = p[0]; probeLon[i] = p[1]; });
  const idx = buildIndexMap(cD2, D2.ni, D2.nj, probeLat, probeLon, 'lonlat');
  let falsch = 0, maxAcc = 0;
  for (let i = 0; i < places.length; i++) {
    if (idx[i] < 0) continue;
    // north-up: Zeile 0 = Nord (so liest der Kompositor `d2.values`)
    const si = idx[i] % D2.ni, sj = Math.floor(idx[i] / D2.ni);
    const gotLon = D2.lon1 + si * D2.di, gotLat = D2.lat2 - sj * D2.dj;
    const wantI = Math.round((probeLon[i] - D2.lon1) / D2.di);
    const wantJ = Math.round((D2.lat2 - probeLat[i]) / D2.dj);
    if (si !== wantI || sj !== wantJ) falsch++;
    const d = dKm(probeLat[i], probeLon[i], gotLat, gotLon);
    if (d > maxAcc) maxAcc = d;
  }
  console.log(`--- DACH-Niederschlags-Komposit ${G.w}x${G.h} (nowcast)`);
  console.log(`    Zellposition <-> Zeichenfläche :  JETZT ${max.toExponential(2)} km   (vorher 0,51 km Median / 1,14 km max)`);
  console.log(`    Zugriff auf ICON-D2 (Modellhälfte): ${falsch}/${places.length} Orte in der falschen Zelle` +
    `  (vorher 17 % / bis 2,7 km) · max Abstand zur Zellmitte ${f2(maxAcc)} km (Zelle 2,2 km => <= halbe Diagonale)`);
  fam.komposit = { max, falsch };
}

// ===========================================================================
// 4) Flow-Nowcast / PoP (B5) — DE1200 auf FLOW_FACTOR 8 gegröbert
// ===========================================================================
{
  const NW = 1100, NH = 1200, factor = 8;
  // Seit KL11 (2026-08-27) ist die Blockung in `src/ml/coarsen.ts` (rein,
  // importierbar): die ECHTE Kachelung `blockSpans` wird gemessen, nicht mehr
  // eine am Quelltext gelesene Formel.
  const W = Math.max(1, Math.ceil(NW / factor)), H = Math.max(1, Math.ceil(NH / factor));
  console.log(`    (Kachelung aus src/ml/coarsen.ts: blockSpans(${NW}, ${W}) — flächengewichtet, KL11)`);
  const spanX = 1100, spanY = 1200; // DE1200: exakt 1100 x 1200 km in PS-Koordinaten

  // JETZT: Schwerpunkt des von blockSpans abgedeckten Intervalls je Zelle.
  const messeSpans = (Wb) => {
    const spans = blockSpans(NW, Wb);
    let maxErr = 0, errAt = 0;
    const je = [];
    for (let b = 0; b < Wb; b++) {
      const s = spans[b];
      const a = s.idx[0] + 1 - s.wt[0], z = s.idx[s.idx.length - 1] + s.wt[s.wt.length - 1];
      const trueX = (a + z) / 2;                    // km ab Westkante (1 Spalte = 1 km)
      const drawX = ((b + 0.5) / Wb) * spanX;
      const e = drawX - trueX;
      je.push(e);
      if (Math.abs(e) > Math.abs(maxErr)) { maxErr = e; errAt = b; }
    }
    return { maxErr, errAt, je };
  };
  // VORHER (starre 8er-Blöcke, floor 137 / ceil 138): zum Vergleich weiter gerechnet.
  const messeStarr = (Wb) => {
    let maxErr = 0, errAt = 0;
    const je = [];
    for (let b = 0; b < Wb; b++) {
      const first = b * factor, last = Math.min(NW - 1, b * factor + factor - 1);
      if (first > NW - 1) break;
      const trueX = (first + last) / 2 + 0.5;
      const drawX = ((b + 0.5) / Wb) * spanX;
      const e = drawX - trueX;
      je.push(e);
      if (Math.abs(e) > Math.abs(maxErr)) { maxErr = e; errAt = b; }
    }
    return { maxErr, errAt, je };
  };
  const jetzt = messeSpans(W);                        // KL11: flächengewichtet, 138
  const vorher = messeStarr(Math.floor(NW / factor)); // starr floor -> 137 (KL1-Stand)
  const kl5 = messeStarr(W);                          // starr ceil  -> 138 (KL5-Stand)

  // an echten deutschen Orten: wie weit greift der Shader daneben?
  // psFwd liefert METER ab dem Pol — auf die NW-Ecke des DE1200-Gitters
  // beziehen, dann sind x/y Kilometer ab West- bzw. Nordkante.
  const pNW = psFwd(DE1200_CORNERS[0][0], DE1200_CORNERS[0][1]);
  const rel = (lon, lat) => { const q = psFwd(lon, lat); return [(q[0] - pNW[0]) / 1000, (pNW[1] - q[1]) / 1000]; };
  const proj = places.map(([lat, lon, name]) => ({ name, lat, lon, p: rel(lon, lat) }))
    .filter((o) => o.p[0] >= 0 && o.p[0] <= spanX && o.p[1] >= 0 && o.p[1] <= spanY);
  const stat = (Wb, je) => {
    const v = [];
    for (const o of proj) {
      const u = o.p[0] / spanX;
      const b = Math.min(Wb - 1, Math.max(0, Math.floor(u * Wb)));
      v.push(Math.abs(je[Math.min(b, je.length - 1)]));
    }
    return { medi: med(v), max: Math.max(...v), n: v.length };
  };
  const sJ = stat(W, jetzt.je), sV = stat(Math.floor(NW / factor), vorher.je);

  // y-Achse: 1200/8 = 150 geht glatt auf -> kein Fehler
  console.log(`--- Flow-Nowcast / PoP: DE1200 ${NW}x${NH} -> ${W}x${H} (FLOW_FACTOR ${factor})`);
  console.log(`    1100 / ${factor} = 137,5 -> die Blöcke kacheln die Domäne NICHT glatt.`);
  console.log(`    Blockmitte <-> Zeichenfläche (Ost-West):`);
  const sK5 = stat(W, kl5.je);
  console.log(`      JETZT  (KL11 flächengewichtet, ${W} Zellen): max ${jetzt.maxErr.toExponential(2)} km bei Zelle ${jetzt.errAt}` +
    ` · an Orten Median ${sJ.medi.toExponential(2)} / max ${sJ.max.toExponential(2)} km (${sJ.n} Orte in DE1200)`);
  console.log(`      KL5    (starr ceil, ${W} Blöcke)  : max ${f2(kl5.maxErr)} km bei Block ${kl5.errAt}` +
    ` · an Orten Median ${f2(sK5.medi)} / max ${f2(sK5.max)} km`);
  console.log(`      KL1    (starr floor, ${Math.floor(NW / factor)} Blöcke): max ${f2(vorher.maxErr)} km bei Block ${vorher.errAt}` +
    ` · an Orten Median ${f2(sV.medi)} / max ${f2(sV.max)} km`);
  console.log(`      Nord-Süd: ${NH} / ${factor} = ${NH / factor} glatt -> 0,00 km`);
  const ost = proj.slice().sort((a, b) => b.p[0] - a.p[0])[0];
  console.log(`      östlichster Ort: ${ost.name} (x = ${ost.p[0].toFixed(0)} km)`);
  fam.flow = { W, H, jetzt, vorher, kl5, sJ, sV, sK5 };
}

// ===========================================================================
// 5) Vertrauens-Schleier im PoP-Modus (B1)
// ===========================================================================
{
  const sCols = 138, sRows = 150; // = Flow-Gitter (ceil)
  const g = ensembleGrid(DE1200_CORNERS, sCols, sRows);
  const lonMin = g.uvBounds[0] * 360 - 180, lonMax = g.uvBounds[2] * 360 - 180;
  const latMax = 90 - g.uvBounds[1] * 180, latMin = 90 - g.uvBounds[3] * 180;
  const d = [];
  let maskiert = 0;
  for (let r = 0; r < g.h; r++) {
    const la = latMax - ((r + 0.5) / g.h) * (latMax - latMin);
    for (let c = 0; c < g.w; c++) {
      const i = r * g.w + c;
      if (g.idx[i] < 0) { maskiert++; continue; }
      const lo = lonMin + ((c + 0.5) / g.w) * (lonMax - lonMin);
      const si = g.idx[i] % sCols, sj = Math.floor(g.idx[i] / sCols);
      // Zellmitte des Quellblocks in PS-Koordinaten -> lon/lat
      const q = psFwd(DE1200_CORNERS[0][0], DE1200_CORNERS[0][1]);
      const [slon, slat] = psInv(q[0] + ((si + 0.5) / sCols) * 1100 * 1000, q[1] - ((sj + 0.5) / sRows) * 1200 * 1000);
      d.push(dKm(la, lo, slat, slon));
    }
  }
  console.log(`--- Vertrauens-Schleier, PoP-Modus (${g.w}x${g.h} reguläres lon/lat aus ${sCols}x${sRows} DE1200)`);
  console.log(`    Zielzelle <-> gelesene Quellzelle : Median ${f2(med(d))} / max ${f2(Math.max(...d))} km` +
    `  (vorher Median 76,7 / max 93,7 km)`);
  console.log(`    außerhalb der Radar-Domäne maskiert: ${maskiert}/${g.w * g.h} Zellen (vorher: keine)`);
  fam.schleier = { med: med(d), max: Math.max(...d), maskiert, w: g.w, h: g.h };
}

// ===========================================================================
// 6) IDW-Rasterer (B2) — nur bei explizit gewähltem EXTERNEM Raster-Modell
// ===========================================================================
{
  const b = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };
  for (const [cols, rows, tag] of [[100, 80, 'Phase B'], [80, 64, 'Phase A']]) {
    const dx = (b.lngMax - b.lngMin) / (cols - 1), dy = (b.latMax - b.latMin) / (rows - 1);
    let max = 0;
    for (let j = 0; j < rows; j++) {
      const trueLat = b.latMax - j * dy;
      const drawLat = b.latMax - ((j + 0.5) / rows) * (b.latMax - b.latMin);
      for (let i = 0; i < cols; i++) {
        const trueLon = b.lngMin + i * dx;
        const drawLon = b.lngMin + ((i + 0.5) / cols) * (b.lngMax - b.lngMin);
        max = Math.max(max, dKm(trueLat, trueLon, drawLat, drawLon));
      }
    }
    console.log(`--- IDW-Rasterer ${cols}x${rows} (${tag}) — Zellmitten als Außenkanten gezeichnet`);
    console.log(`    Karte <-> Wirklichkeit : max ${f2(max)} km   (UNVERÄNDERT — B2 offen)`);
  }
}

console.log('\nFertig.');
