/**
 * Zwei Lücken, die `versatz-layer.mjs` und `versatz-confidence.mjs` offengelassen
 * hatten — beide betreffen die DARSTELLUNG, nicht die Punktabfrage:
 *
 *  B5  Das Flow-Gitter (`coarsenFrameU8`, Faktor 8) deckelt mit `floor(w/8)` und
 *      lässt die Restspalten fallen; gezeichnet wird es aber über die VOLLEN
 *      DE1200-Ecken (Mesh) → das Bild wird nach Osten gedehnt.
 *      Betrifft `flownowcast`, `poprob` und (zusätzlich zu B1) `confidence`.
 *      Die Kontrolle in `versatz-confidence.mjs` prüfte das MESH, nicht diese
 *      Dehnung — deshalb hier nachgeholt.
 *
 *  B6  Das DEM des Temperatur-Layers (`buildDemImage`) tastet auf
 *      `latMin + j·span/(rows−1)` ab — Zellmitten —, der ScalarLayer liest es
 *      mit derselben `uv` wie die Werte-Textur, also in Außenkanten-Konvention.
 *      Die Höhenkorrektur je Pixel greift damit auf Gelände aus der Nachbarschaft.
 *
 *   node audit/karten-layer-verortung/versatz-rest.mjs
 */

const P = Math.PI / 180;

// --- B5: Flow-/PoP-/Schleier-Gitter ---------------------------------------
// RADOLAN-RV-Frame: 1100 Spalten × 1200 Zeilen (DE1200, 1 km). FLOW_FACTOR = 8.
const NC = 1100, NR = 1200, F = 8;
const W = Math.floor(NC / F), H = Math.floor(NR / F);
console.log('=== B5  Flow-Gitter (flownowcast · poprob · confidence)');
console.log(`    ${NC}×${NR} Zellen ÷ ${F} → ${W}×${H} (floor)`);
console.log(`    abgedeckt: ${W * F}/${NC} Spalten, ${H * F}/${NR} Zeilen`
  + `  ⇒ ${NC - W * F} Spalten / ${NR - H * F} Zeilen fallen weg`);
for (const [achse, n, nat] of [['Ost–West', W, NC], ['Nord–Süd', H, NR]]) {
  // Texel i wird bei u=(i+0.5)/n gezeichnet; sein Block liegt bei (i·F + F/2)/nat.
  const off = (i) => ((i + 0.5) / n) * nat - (i * F + F / 2);
  const max = Math.max(Math.abs(off(0)), Math.abs(off(n - 1)));
  console.log(`    ${achse}: Versatz ${off(0).toFixed(2)} … ${off(n - 1).toFixed(2)} Zellen`
    + `  ⇒ bis ${max.toFixed(2)} km (1-km-Zellen)`);
}

// --- B6: DEM des Temperatur-Layers ----------------------------------------
// bounds = ICON-D2-Außenkanten (probe-d2grid.mjs), rows fest 700.
const lonSpan = 20.35 - (-3.95), latSpan = 58.09 - 43.17;
const rows = 700, cols = Math.max(64, Math.round(rows * (lonSpan / latSpan)));
const dLat = latSpan / (rows - 1), dLng = lonSpan / (cols - 1);
console.log('\n=== B6  DEM des Temperatur-Layers (Höhenkorrektur je Pixel)');
console.log(`    Raster ${cols}×${rows} über die ICON-D2-Außenkanten`);
console.log(`    Zelle ${dLng.toFixed(6)}° lon × ${dLat.toFixed(6)}° lat`
  + ` ≈ ${(dLng * 111.32 * Math.cos(50 * P)).toFixed(2)} × ${(dLat * 111.13).toFixed(2)} km`);
console.log(`    Abtastung auf j/(rows−1) = Zellmitten, gelesen als Außenkanten`);
console.log(`    ⇒ Versatz bis ±½ Zelle = ${(dLng / 2 * 111.32 * Math.cos(50 * P)).toFixed(2)} km lon`
  + ` · ${(dLat / 2 * 111.13).toFixed(2)} km lat`);
console.log('    (Temperaturwirkung nicht gemessen: sie ist das Geländerelief über diese Strecke,');
console.log('     im Flachland vernachlässigbar, im Hochgebirge der bestimmende Term.)');
