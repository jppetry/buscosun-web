/**
 * Misst je Layer-Familie der Wetterkarte, wie weit die Stelle, an der die KARTE
 * einen Gitterwert zeichnet, von der Stelle abweicht, an der die PUNKTABFRAGE
 * denselben Wert liest — und wie weit beide von der WAHREN Zellposition liegen.
 *
 * Kein Netz: die Gitterparameter stammen aus der Sonde `probe-d2grid.mjs`
 * (am echten GRIB gemessen) bzw. aus den Konstanten des App-Codes.
 *
 *   node audit/karten-layer-verortung/versatz-layer.mjs
 */
import fs from 'node:fs';

const places = JSON.parse(fs.readFileSync('public/fire/places-dach.json', 'utf8')).places;
const R = 6371.0088, P = Math.PI / 180;
const distKm = (lat, lonA, lonB, latA, latB) => 0; // (unbenutzt)
const dKm = (lat1, lon1, lat2, lon2) =>
  Math.hypot((lat2 - lat1) * P * R, (lon2 - lon1) * P * R * Math.cos(((lat1 + lat2) / 2) * P));

// --- ICON-D2 regular-lat-lon, am GRIB gemessen (probe-d2grid.mjs) ------------
const D2 = { ni: 1215, nj: 746, lon1: -3.94, lat1: 43.18, di: 0.02, dj: 0.02 };
// gribCorners: Außenkanten = erste Zellmitte ∓ halbe Zelle
const D2_W = D2.lon1 - D2.di / 2, D2_E = D2.lon1 + (D2.ni - 1) * D2.di + D2.di / 2;
const D2_S = D2.lat1 - D2.dj / 2, D2_N = D2.lat1 + (D2.nj - 1) * D2.dj + D2.dj / 2;

/**
 * Eine Achse einer Gitterfamilie.
 *  aMin/aMax : die beiden Zahlen, die als uvBounds/corners in den Layer gehen
 *  n         : Spalten-/Zeilenzahl der AUSGABE-Textur
 *  srcOf(t)  : wahre Koordinate des Wertes, der in Ausgabe-Index t steckt
 */
function axis(aMin, aMax, n, srcOf) {
  return {
    // Shader (ScalarLayer/RainLayer/WindLayer): texture2D(uv) ⇒ Texel-Mitten bei
    // (i+0.5)/n, also Außenkanten-Konvention.
    render: (coord) => srcOf(((coord - aMin) / (aMax - aMin)) * n - 0.5),
    // Punktabfrage (bilinearChannel/bilinear/sampleRadarQuad-'center'): x = u·(n−1),
    // also Zellmitten-Konvention.
    query: (coord) => srcOf(((coord - aMin) / (aMax - aMin)) * (n - 1)),
    inside: (coord) => coord >= Math.min(aMin, aMax) && coord <= Math.max(aMin, aMax),
  };
}

const FAMILIEN = [];

// (A) ICON-D2 nativ, subsampled ss=2 (TARGET_WIDTH 700) — Temperatur, Böen,
//     Gewitter, Blitz-Prognose, Schnee, Rotation, Wind, Feuerwetter.
{
  const ss = Math.max(1, Math.ceil(D2.ni / 700));
  const W = Math.ceil(D2.ni / ss), H = Math.ceil(D2.nj / ss);
  FAMILIEN.push({
    name: `ICON-D2 nativ, subsampled ss=${ss} (${W}×${H})`,
    layer: 'temp · gust · thunder · lightningfc · snow · rotation · wind',
    zelleLon: ss * D2.di, zelleLat: ss * D2.dj,
    x: axis(D2_W, D2_E, W, (t) => D2.lon1 + t * ss * D2.di),
    // Bildzeile y (0 = Nord) traegt Quellzeile sj = (H-1-y)*ss  (buildTempImage:
    // `sj = jj*ss`, `y = h-1-jj`) — also NICHT die noerdlichste Quellzeile,
    // sondern die suedlichste ihres Blocks. Genau hier entsteht der Nordversatz.
    y: axis(D2_N, D2_S, H, (t) => D2.lat1 + (H - 1 - t) * ss * D2.dj),
  });
}

// (B) ICON-D2 nativ, NICHT subsampled — Wolken (CloudLayer, sampleCloudsAt).
FAMILIEN.push({
  name: `ICON-D2 nativ, voll (${D2.ni}×${D2.nj})`,
  layer: 'clouds',
  zelleLon: D2.di, zelleLat: D2.dj,
  x: axis(D2_W, D2_E, D2.ni, (t) => D2.lon1 + t * D2.di),
  y: axis(D2_N, D2_S, D2.nj, (t) => D2.lat1 + (D2.nj - 1) * D2.dj - t * D2.dj),
});

// (C) Fusion/Open-Meteo-IDW-Gitter — greift, sobald im Modell-Switcher ein
//     gerastertes Modell gewählt ist (fusionFor(...) === true). Bounds =
//     DACH_VIEW (countryProfiles.ts), Auflösung 100×80 (MapView Phase B).
for (const [cols, rows, tag] of [[100, 80, 'Phase B'], [80, 64, 'Phase A']]) {
  const b = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };
  const dx = (b.lngMax - b.lngMin) / (cols - 1), dy = (b.latMax - b.latMin) / (rows - 1);
  FAMILIEN.push({
    name: `Fusion-IDW ${cols}×${rows} (${tag}) — Zellmitten als Bounds`,
    layer: 'temp · wind · clouds · precip bei gewähltem Raster-Modell',
    zelleLon: dx, zelleLat: dy,
    x: axis(b.lngMin, b.lngMax, cols, (t) => b.lngMin + t * dx),
    y: axis(b.latMax, b.latMin, rows, (t) => b.latMax - t * dy),
  });
}

// (D) DACH-Niederschlags-Komposit (precipIndexMap.G) — gridLatLon() legt die
//     Werte auf c/(w−1), COMPOSITE_CORNERS gehen als Außenkanten in den RainLayer.
{
  const G = { lonMin: 5.5, lonMax: 17.4, latMin: 45.3, latMax: 55.5, w: 600, h: 512 };
  const dx = (G.lonMax - G.lonMin) / (G.w - 1), dy = (G.latMax - G.latMin) / (G.h - 1);
  FAMILIEN.push({
    name: `DACH-Niederschlags-Komposit ${G.w}×${G.h}`,
    layer: 'nowcast (Karte)',
    zelleLon: dx, zelleLat: dy,
    x: axis(G.lonMin, G.lonMax, G.w, (t) => G.lonMin + t * dx),
    y: axis(G.latMax, G.latMin, G.h, (t) => G.latMax - t * dy),
    keineAbfrage: true,   // die Punktabfrage geht an den Quellgittern vorbei
  });
}

const med = (a) => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];

for (const F of FAMILIEN) {
  const rows = [];
  for (const [lat, lon, ort, , , pop] of places) {
    if (pop < 20000) continue;
    if (!F.x.inside(lon) || !F.y.inside(lat)) continue;
    const rLon = F.x.render(lon), rLat = F.y.render(lat);
    const qLon = F.x.query(lon), qLat = F.y.query(lat);
    rows.push({
      ort,
      rq: dKm(rLat, rLon, qLat, qLon),          // Karte ↔ Punktabfrage
      rt: dKm(lat, lon, rLat, rLon),            // Karte ↔ Wirklichkeit
      qt: dKm(lat, lon, qLat, qLon),            // Punktabfrage ↔ Wirklichkeit
      // Vorzeichenbehaftete Achskomponenten der KARTE (Grad):
      //  dLat < 0 ⇒ der gezeichnete Wert stammt von SÜDLICH des Zeichenorts,
      //             das Feld erscheint also nach NORDEN verschoben.
      rdLat: rLat - lat, rdLon: rLon - lon,
      qdLat: qLat - lat, qdLon: qLon - lon,
    });
  }
  rows.sort((a, b) => b.rq - a.rq);
  console.log(`\n=== ${F.name}`);
  console.log(`    Layer: ${F.layer}`);
  console.log(`    Zelle: ${(F.zelleLon).toFixed(4)}° lon × ${(F.zelleLat).toFixed(4)}° lat`
    + ` ≈ ${(F.zelleLon * 111.32 * Math.cos(50 * P)).toFixed(2)} × ${(F.zelleLat * 111.13).toFixed(2)} km`);
  console.log(`    ${rows.length} Orte ≥ 20 000 EW im Gitter`);
  if (!F.keineAbfrage) {
    console.log(`    Karte ↔ Punktabfrage : Median ${med(rows.map(r => r.rq)).toFixed(2)} km · max ${rows[0].rq.toFixed(2)} km (${rows[0].ort})`);
    console.log(`    Punktabfrage ↔ Wirklichkeit: Median ${med(rows.map(r => r.qt)).toFixed(2)} km · max ${Math.max(...rows.map(r => r.qt)).toFixed(2)} km`);
  } else {
    console.log(`    (keine Punktabfrage auf diesem Gitter — die Slider-Abfrage liest die Quellgitter)`);
  }
  console.log(`    Karte ↔ Wirklichkeit : Median ${med(rows.map(r => r.rt)).toFixed(2)} km · max ${Math.max(...rows.map(r => r.rt)).toFixed(2)} km`);
  const span = (v) => `${Math.min(...v).toFixed(4)}…${Math.max(...v).toFixed(4)}°`;
  console.log(`      ↳ Karte  je Achse: Δlat ${span(rows.map(r => r.rdLat))} · Δlon ${span(rows.map(r => r.rdLon))}`);
  if (!F.keineAbfrage) {
    console.log(`      ↳ Abfrage je Achse: Δlat ${span(rows.map(r => r.qdLat))} · Δlon ${span(rows.map(r => r.qdLon))}`);
  }
}
