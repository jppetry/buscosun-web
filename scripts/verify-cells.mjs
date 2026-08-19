/**
 * Headless-Verifikation des Zellbahnen-Layers (Phase Z1, Gate GZ1) — prüft den
 * ECHTEN App-Code (`src/radar/konrad3d.ts` + `src/radar/cellPolygons.ts`) gegen
 * ein ECHTES KONRAD3D-Fixture. Kein GPU / kein Netz / kein Vitest.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-cells.mjs
 *
 * Fixture: `scripts/fixtures/konrad3d-sample.xml` — Kopf + 3 unveränderte
 * `<feature>`-Blöcke aus `KONRAD3D_20260805T204000.xml` (Abruf 2026-08-05,
 * `audit/zellbahnen.md` §2). Enthält 43 Sentinel-Werte und 12 `not-a-date-time`.
 *
 * Deckt die Gate-GZ1-Checks:
 *   Schema-Pfade · Sentinel-Filter (end-to-end mutiert) · 12 Prognosepunkte ·
 *   Peilung ohne Richtungsfeld · amtlicher Trichter umschließt die Spur ·
 *   geschlossene GeoJSON-Ringe · ETA · keine Sentinel-Leckage in die Geometrie.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseKonrad3d, refMsFromFileName, num, isoMs } from '../src/radar/konrad3d.ts';
import {
  buildCellFeatures, coneRing, convexHull, ellipsePoints, etaMinutesToPoint, cellHeadline,
  // Phase Z2 (Gate GZ2) — Lesbarkeit und Standortbezug
  pointInEllipse, conePolygons, trackLengthKm, trackSpeedKmh, roundSpeed5, displaySpeedKmh,
  trackBearing, arrowAnchor, timeMarks, etaWindowToPoint, passByToPoint,
  cellLocationRelevance, cellRelevanceText, cellFeatureCounts, CELL_PASS_BY_MAX_KM,
} from '../src/radar/cellPolygons.ts';
import { bearingDeg, distKm } from '../src/radar/gridGeo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, 'fixtures', 'konrad3d-sample.xml');
const xml = readFileSync(FIXTURE, 'utf8');

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

/** Punkt-in-Polygon (Ray-Casting) — nur für die Verifikation. */
function inRing(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// (1) Parser gegen das echte Fixture
// ---------------------------------------------------------------------------
const run = parseKonrad3d(xml, 'KONRAD3D_20260805T204000.xml');

add('Referenzzeit des Laufs = 2026-08-05T20:40:00Z',
  run.refMs === Date.UTC(2026, 7, 5, 20, 40, 0), new Date(run.refMs).toISOString());
add('3 Zellen geparst', run.cells.length === 3, `${run.cells.length}`);
add('Dateiname → Referenzzeit',
  refMsFromFileName('KONRAD3D_20260805T204000.xml') === run.refMs, `${refMsFromFileName('KONRAD3D_20260805T204000.xml')}`);
add('unpassender Dateiname → null', refMsFromFileName('meso_latest.xml') === null);

const cell = run.cells.find((c) => c.id === 12);
add('Zelle 12 vorhanden', !!cell);

// Werte verbatim aus der Datei (audit/zellbahnen.md §2).
add('Schwerpunkt 47.00915 / 11.87933',
  Math.abs(cell.lat - 47.00915) < 1e-6 && Math.abs(cell.lon - 11.87933) < 1e-6, `${cell.lat}/${cell.lon}`);
add('height_msl 4930 m', cell.heightMslM === 4930, `${cell.heightMslM}`);
add('cell_speed 19.489 km/h', Math.abs(cell.speedKmh - 19.489) < 1e-9, `${cell.speedKmh}`);
add('max_value 58.95 dBZ', Math.abs(cell.dbzMax - 58.95) < 1e-9, `${cell.dbzMax}`);
add('hail_flag 1 gelesen', cell.hailFlag === 1, `${cell.hailFlag}`);
add('gust_flag 0 gelesen (0 ≠ fehlend)', cell.gustFlag === 0, `${cell.gustFlag}`);
add('maximum_estimated_wind_gust 48.645 km/h', Math.abs(cell.gustKmh - 48.645) < 1e-9, `${cell.gustKmh}`);
add('heavy_rain_potential 10.26 mm', Math.abs(cell.heavyRainMm - 10.26) < 1e-9, `${cell.heavyRainMm}`);
add('lightning_rate 14', cell.lightningRate === 14, `${cell.lightningRate}`);
add('number_detections 9', cell.detections === 9, `${cell.detections}`);
add('covered_area 86.5 km²', Math.abs(cell.areaKm2 - 86.5) < 1e-9, `${cell.areaKm2}`);
add('echo_top 8670 m', cell.echoTopM === 8670, `${cell.echoTopM}`);
add('merge/split false', cell.merged === false && cell.split === false, `${cell.merged}/${cell.split}`);
add('reference_time_first_detection gelesen',
  cell.firstDetectedMs === Date.UTC(2026, 7, 5, 20, 0, 0), new Date(cell.firstDetectedMs).toISOString());

// `<latitude>` darf NICHT auf `<latitudes>` matchen — sonst stünde der Schwerpunkt
// auf dem ersten Umrisspunkt. Genau dieser Fehler ist der Grund für findOpen().
add('Umriss ≠ Schwerpunkt (Tag-Namen exakt getrennt)',
  cell.hull.length > 3 && (cell.hull[0][1] !== cell.lat), `hull0=${cell.hull[0]}`);
add('Umriss 72 Punkte', cell.hull.length === 72, `${cell.hull.length}`);
add('Umriss ist NICHT vorgeschlossen (das macht die Geometrie)',
  cell.hull[0][0] !== cell.hull[cell.hull.length - 1][0]);
add('alle Umrisspunkte endlich + in DACH-Fenster',
  cell.hull.every(([lo, la]) => Number.isFinite(lo) && Number.isFinite(la) && la > 45 && la < 56 && lo > 1 && lo < 19));

// ---------------------------------------------------------------------------
// (2) Prognosespur — 12 Punkte, +5…+60 min, wachsende amtliche Ellipse
// ---------------------------------------------------------------------------
add('12 Prognosepunkte', cell.forecast.length === 12, `${cell.forecast.length}`);
add('Vorlaufzeiten +5…+60 in 5er-Schritten',
  cell.forecast.every((f, i) => f.leadMin === (i + 1) * 5), cell.forecast.map((f) => f.leadMin).join(','));
add('erste Stützstelle 47.01551 / 11.89683',
  Math.abs(cell.forecast[0].lat - 47.01551) < 1e-6 && Math.abs(cell.forecast[0].lon - 11.89683) < 1e-6);
add('Unsicherheitsellipse wächst monoton (major)',
  cell.forecast.every((f, i) => i === 0 || f.majorKm >= cell.forecast[i - 1].majorKm),
  cell.forecast.map((f) => f.majorKm.toFixed(1)).join(' → '));
add('major ≥ minor bei jeder Stützstelle', cell.forecast.every((f) => f.majorKm >= f.minorKm));
add('Gültigkeitszeit = refMs + lead', cell.forecast.every((f) => f.validMs === cell.refMs + f.leadMin * 60_000));

// Es gibt KEIN Richtungsfeld — die Peilung wird abgeleitet (audit §5).
const expectBearing = bearingDeg([cell.lon, cell.lat], [cell.forecast[0].lon, cell.forecast[0].lat]);
add('Peilung aus Schwerpunkt → erster Stützstelle',
  Math.abs(cell.bearing - expectBearing) < 1e-9, `${cell.bearing.toFixed(1)}°`);
add('Himmelsrichtung passt zur Peilung (NO)', cell.compass === 'NO', `${cell.compass}`);

// ---------------------------------------------------------------------------
// (3) Sentinel — das Fixture trägt 43 × -1000000000 und 12 × not-a-date-time
// ---------------------------------------------------------------------------
add('Fixture enthält Sentinel-Werte (sonst prüft der Test nichts)',
  (xml.match(/-1000000000/g) || []).length === 43 && (xml.match(/not-a-date-time/g) || []).length === 12);
add('num(): -1000000000.000 → null', num('<x>-1000000000.000</x>', 'x') === null);
add('num(): -1000000000 → null', num('<x>-1000000000</x>', 'x') === null);
add('num(): echter Negativwert bleibt erhalten', num('<x>-12.5</x>', 'x') === -12.5);
add('num(): 0 bleibt 0 (nicht „fehlend")', num('<x>0</x>', 'x') === 0);
add('isoMs(): not-a-date-time → null', isoMs('<t>not-a-date-time</t>', 't') === null);
add('isoMs(): echter Zeitstempel bleibt', isoMs('<t>2026-08-05T20:40:00Z</t>', 't') === Date.UTC(2026, 7, 5, 20, 40, 0));

// End-to-end: dieselbe Datei, aber cell_speed und Erstdetektion auf Sentinel
// gesetzt — die Zelle muss geparst werden, die Felder aber leer bleiben.
{
  const mutated = xml
    .replace('<cell_speed unit="km/h">19.489</cell_speed>', '<cell_speed unit="km/h">-1000000000.000</cell_speed>')
    .replace('<reference_time_first_detection format="ISO 8601">2026-08-05T20:00:00Z</reference_time_first_detection>',
      '<reference_time_first_detection format="ISO 8601">not-a-date-time</reference_time_first_detection>');
  const mrun = parseKonrad3d(mutated, 'mutated');
  const mcell = mrun.cells.find((c) => c.id === 12);
  add('[e2e] Sentinel-Speed → null (Zelle bleibt erhalten)', mcell && mcell.speedKmh === null, `${mcell?.speedKmh}`);
  add('[e2e] not-a-date-time → null', mcell && mcell.firstDetectedMs === null, `${mcell?.firstDetectedMs}`);
  add('[e2e] Kurzzeile lässt die fehlende Angabe weg statt zu raten',
    !cellHeadline(mcell).includes('km/h'), cellHeadline(mcell));
}

// ---------------------------------------------------------------------------
// (4) Geometrie — Ellipse, konvexe Hülle, amtlicher Trichter
// ---------------------------------------------------------------------------
{
  const pts = ellipsePoints(11, 48, 10, 4, 0, 24);
  add('ellipsePoints liefert 24 Punkte', pts.length === 24);
  const dists = pts.map((p) => distKm([11, 48], p));
  add('Ellipse: max Radius ≈ halbe Hauptachse (5 km)', Math.abs(Math.max(...dists) - 5) < 0.15, `${Math.max(...dists).toFixed(2)}`);
  add('Ellipse: min Radius ≈ halbe Nebenachse (2 km)', Math.abs(Math.min(...dists) - 2) < 0.15, `${Math.min(...dists).toFixed(2)}`);
  // angle=0 ⇒ Hauptachse nach Norden: der nördlichste Punkt ist weiter weg als der östlichste.
  const north = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  add('Ellipse: angle=0 richtet die Hauptachse nach Norden',
    distKm([11, 48], north) > 4.5, `${distKm([11, 48], north).toFixed(2)} km`);
}
{
  const hull = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]]);
  add('convexHull verwirft den Innenpunkt', hull.length === 4, `${hull.length}`);
}
{
  const ring = coneRing(cell);
  add('Trichter ist ein geschlossener Ring',
    ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1], `${ring.length} Punkte`);
  add('Trichter umschließt ALLE Prognosestützstellen',
    cell.forecast.every((f) => inRing(ring, [f.lon, f.lat])));
  add('Trichter umschließt den Schwerpunkt', inRing(ring, [cell.lon, cell.lat]));
  // Der Trichter ist AMTLICH: er entsteht nur aus den Ellipsen, ohne eigene
  // Aufweitung. Prüfbar daran, dass er ohne Ellipsen deutlich schmaler ausfällt.
  const bare = { ...cell, forecast: cell.forecast.map((f) => ({ ...f, majorKm: null, minorKm: null })) };
  const bareRing = coneRing(bare);
  // Fläche (Shoelace, Grad² — nur als Verhältnis benutzt): die nackte Spur ist
  // fast eine Linie, der amtliche Trichter eine echte Fläche.
  const area = (r) => {
    let s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    return Math.abs(s / 2);
  };
  add('Trichterfläche kommt aus der amtlichen Ellipse (≫ nackte Spur)',
    area(ring) > area(bareRing) * 3, `${area(ring).toExponential(2)} vs ${area(bareRing).toExponential(2)}`);
  // Reichweite: der Trichter muss am Spurende mindestens die halbe amtliche
  // Hauptachse abdecken — sonst wäre er selbstgebastelt statt übernommen.
  const last = cell.forecast[cell.forecast.length - 1];
  const reachKm = Math.max(...ring.map((p) => distKm([last.lon, last.lat], p)));
  add('Trichter reicht am Spurende bis zur amtlichen Halbachse',
    reachKm >= (last.majorKm / 2) * 0.9, `${reachKm.toFixed(1)} km ≥ ${(last.majorKm / 2).toFixed(1)} km`);
  add('Zelle ohne Prognosespur ⇒ kein Trichter (statt geratener)',
    coneRing({ ...cell, forecast: [] }).length === 0);
}

// ---------------------------------------------------------------------------
// (5) GeoJSON für die Karte
// ---------------------------------------------------------------------------
const fc = buildCellFeatures(run);
const byKind = (k) => fc.features.filter((f) => f.properties.kind === k);
add('FeatureCollection wohlgeformt', fc.type === 'FeatureCollection' && Array.isArray(fc.features));
add('je 3 Trichter/Umrisse/Spuren/Punkte',
  byKind('cone').length === 3 && byKind('hull').length === 3 && byKind('path').length === 3 && byKind('dot').length === 3,
  `${byKind('cone').length}/${byKind('hull').length}/${byKind('path').length}/${byKind('dot').length}`);
add('Trichter liegen VOR den Umrissen (Zeichenreihenfolge)',
  fc.features.findIndex((f) => f.properties.kind === 'cone') < fc.features.findIndex((f) => f.properties.kind === 'hull'));
add('alle Polygonringe geschlossen',
  fc.features.filter((f) => f.geometry.type === 'Polygon').every((f) => {
    const r = f.geometry.coordinates[0];
    return r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  }));
add('Spur hat 13 Punkte (Schwerpunkt + 12)',
  byKind('path').every((f) => f.geometry.coordinates.length === 13));
add('jedes Feature trägt kind + id + sev',
  fc.features.every((f) => typeof f.properties.kind === 'string' && Number.isFinite(f.properties.id) && Number.isFinite(f.properties.sev)));

// Sentinel-Leckage: keine einzige Zahl in der gesamten Geometrie darf im
// Sentinel-Bereich liegen (das ist der Trichter-mit−1-Milliarde-Meter-Fehler).
{
  let worst = Infinity;
  const walk = (v) => {
    if (typeof v === 'number') worst = Math.min(worst, v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(fc.features.map((f) => f.geometry));
  add('keine Sentinel-Zahl in der Geometrie', worst > -9e8, `min=${worst}`);
  add('keine NaN-Koordinate', !JSON.stringify(fc).includes('null,'), undefined);
}

// ---------------------------------------------------------------------------
// (6) ETA zum Standort
// ---------------------------------------------------------------------------
{
  const target = [cell.forecast[5].lon, cell.forecast[5].lat]; // exakt auf der Spur (+30 min)
  const eta = etaMinutesToPoint(cell, target);
  add('ETA trifft die Spur', eta !== null && eta.minutes <= 30, `${eta?.minutes} min`);
  add('ETA nennt die früheste Stützstelle, nicht irgendeine',
    eta !== null && eta.minutes === cell.forecast.find((f) => distKm([f.lon, f.lat], target) <= Math.max(Math.sqrt(cell.areaKm2 / Math.PI), (f.minorKm ?? 0) / 2)).leadMin);
  add('weit entfernter Standort ⇒ keine ETA (statt Zahl geraten)',
    etaMinutesToPoint(cell, [7.0, 51.0]) === null);
}

// Wortwahl (D-19): die Kurzzeile darf nie Warnsprache führen.
{
  const forbidden = ['Tornado', 'Warnung', 'Gefahr', 'Unwetter', 'trifft'];
  const texts = run.cells.map(cellHeadline);
  add('Kurzzeilen ohne Warnsprache (D-19)',
    texts.every((t) => !forbidden.some((w) => t.includes(w))), texts[0]);
}

// ===========================================================================
// PHASE Z2 (Gate GZ2) — Lesbarkeit und Standortbezug.
// Alles hierunter ist NEU; die 64 Checks oben bleiben wortgleich stehen und
// sind damit der Regressionsnachweis für Z1 (`audit/zellbahnen-karte.md` §8).
// ===========================================================================

const cell231 = run.cells.find((c) => c.id === 231);
const noTrack = { ...cell, forecast: [] };
const noEllipse = { ...cell, forecast: cell.forecast.map((f) => ({ ...f, majorKm: null, minorKm: null })) };
const shortTrack = { ...cell, forecast: cell.forecast.filter((f) => f.leadMin <= 30) };
/** Punkt in `dKm` Entfernung unter der Peilung `brg` von [lon,lat]. */
function offsetKm([lon, lat], brg, dKm) {
  const rad = (brg * Math.PI) / 180;
  const north = dKm * Math.cos(rad), east = dKm * Math.sin(rad);
  return [lon + east / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + north / 110.57];
}

// ---------------------------------------------------------------------------
// (7) pointInEllipse — muss EXAKT invers zu ellipsePoints() sein
// ---------------------------------------------------------------------------
{
  const [lon, lat, maj, min, ang] = [11, 48, 10, 4, 35];
  const ring = ellipsePoints(lon, lat, maj, min, ang, 24);
  // Jeder Randpunkt leicht nach innen gezogen muss drin, leicht nach außen
  // gezogen muss draußen sein. Das prüft Halbachsen UND Drehung in einem.
  const shrink = (p, k) => [lon + (p[0] - lon) * k, lat + (p[1] - lat) * k];
  add('pointInEllipse: alle 24 Randpunkte leicht nach innen liegen DRIN',
    ring.every((p) => pointInEllipse(shrink(p, 0.98), lon, lat, maj, min, ang)));
  add('pointInEllipse: alle 24 Randpunkte leicht nach außen liegen DRAUSSEN',
    ring.every((p) => !pointInEllipse(shrink(p, 1.02), lon, lat, maj, min, ang)));
  add('pointInEllipse: Mittelpunkt liegt drin', pointInEllipse([lon, lat], lon, lat, maj, min, ang));
  // angle=0 ⇒ Hauptachse nach Norden (a=5 km, b=2 km): 4 km Nord drin, 4 km Ost draußen.
  add('pointInEllipse: Drehung wirkt (4 km Nord drin, 4 km Ost draußen)',
    pointInEllipse(offsetKm([lon, lat], 0, 4), lon, lat, 10, 4, 0)
    && !pointInEllipse(offsetKm([lon, lat], 90, 4), lon, lat, 10, 4, 0));
  add('pointInEllipse: Ellipse ohne Ausdehnung trifft nie',
    !pointInEllipse([lon, lat], lon, lat, 0, 0, 0));
}

// ---------------------------------------------------------------------------
// (8) conePolygons — der Trichter als Stufen (Z2-3)
// ---------------------------------------------------------------------------
{
  const steps = conePolygons(cell);
  add('conePolygons: 12 Stufen (je Stützstelle eine)', steps.length === 12, `${steps.length}`);
  add('conePolygons: jede Stufe ist ein geschlossener Ring mit 25 Punkten',
    steps.every((s) => s.ring.length === 25
      && s.ring[0][0] === s.ring[24][0] && s.ring[0][1] === s.ring[24][1]));
  add('conePolygons: Halbachsen wachsen MONOTON (das ist die Aussage des Verlaufs)',
    steps.every((s, i) => i === 0 || (s.majorKm >= steps[i - 1].majorKm && s.minorKm >= steps[i - 1].minorKm)),
    steps.map((s) => s.majorKm.toFixed(1)).join(' → '));
  add('conePolygons: Aufweitung 2,322 km → 16,884 km (Faktor 7,3 am Fixture)',
    Math.abs(steps[0].majorKm - 2.322) < 1e-9 && Math.abs(steps[11].majorKm - 16.884) < 1e-9,
    `${steps[0].majorKm} → ${steps[11].majorKm}`);
  add('conePolygons: leadMin je Stufe +5…+60',
    steps.every((s, i) => s.leadMin === (i + 1) * 5));
  add('conePolygons: Stützstelle ohne amtliche Ellipse ⇒ KEINE Stufe (statt geschätzter)',
    conePolygons(noEllipse).length === 0);
  add('conePolygons: Zelle ohne Spur ⇒ keine Stufen', conePolygons(noTrack).length === 0);
  // Der Rückfall bleibt: coneRing() umschließt die Stufen weiterhin.
  add('coneRing bleibt der Rückfall und umschließt jede Stufenmitte',
    cell.forecast.every((f) => inRing(coneRing(cell), [f.lon, f.lat])));
}

// ---------------------------------------------------------------------------
// (9) Eine Geschwindigkeit — aus der gezeichneten Spur (Z2-6, S-Z2-2)
// ---------------------------------------------------------------------------
{
  add('trackSpeedKmh Zelle 12 = 18,076 km/h (aus der Spur, nicht cell_speed 19,489)',
    Math.abs(trackSpeedKmh(cell) - 18.076) < 0.001, `${trackSpeedKmh(cell).toFixed(3)}`);
  // Kernaussage von §2.5: die Zahl passt zur GEZEICHNETEN Geometrie. Deshalb
  // gegen die Länge der Spur aus dem GeoJSON gerechnet, nicht gegen sich selbst.
  const pathFeature = buildCellFeatures(run).features
    .find((f) => f.properties.kind === 'path' && f.properties.id === 12);
  let drawnKm = 0;
  const co = pathFeature.geometry.coordinates;
  for (let i = 1; i < co.length; i++) drawnKm += distKm(co[i - 1], co[i]);
  const impliedKmh = (drawnKm / 60) * 60;
  add('trackSpeedKmh deckt sich mit der GEZEICHNETEN Spur (< 1 %)',
    Math.abs(trackSpeedKmh(cell) - impliedKmh) / impliedKmh < 0.01,
    `${trackSpeedKmh(cell).toFixed(3)} vs ${impliedKmh.toFixed(3)} km/h`);
  add('trackLengthKm ist die Segmentsumme, nicht die Luftlinie (Zelle 231)',
    trackLengthKm(cell231) > distKm([cell231.lon, cell231.lat],
      [cell231.forecast[11].lon, cell231.forecast[11].lat]),
    `${trackLengthKm(cell231).toFixed(3)} km`);
  add('trackSpeedKmh ohne Spur ⇒ null (statt 0)', trackSpeedKmh(noTrack) === null);
  add('roundSpeed5: 18,076 → 20 · 22,889 → 25', roundSpeed5(18.076) === 20 && roundSpeed5(22.889) === 25);
  add('roundSpeed5: Grenzfall 22,5 → 25 · 22,49 → 20', roundSpeed5(22.5) === 25 && roundSpeed5(22.49) === 20);
  add('displaySpeedKmh Zelle 12 = 20 km/h', displaySpeedKmh(cell) === 20, `${displaySpeedKmh(cell)}`);
  // Verfügbarkeit kommt weiterhin aus dem amtlichen Feld: sagt das Produkt
  // „nicht bestimmt", nennen wir keine Geschwindigkeit — auch wenn die Spur
  // rechnerisch eine hergäbe. Genau das hält den Z1-Sentinel-Test am Leben.
  add('displaySpeedKmh: Sentinel-cell_speed ⇒ null, obwohl die Spur eine Zahl hergäbe',
    displaySpeedKmh({ ...cell, speedKmh: null }) === null && trackSpeedKmh({ ...cell, speedKmh: null }) !== null);
  add('Kurzzeile nennt die Spur-Geschwindigkeit (20), nicht cell_speed (19)',
    cellHeadline(cell).includes('20 km/h') && !cellHeadline(cell).includes('19 km/h'), cellHeadline(cell));
}

// ---------------------------------------------------------------------------
// (10) Peilung über die Spur statt aus dem ersten Segment (Z2-1, §2.6)
// ---------------------------------------------------------------------------
{
  const pts231 = [[cell231.lon, cell231.lat], ...cell231.forecast.map((f) => [f.lon, f.lat])];
  const firstSeg = bearingDeg(pts231[0], pts231[1]);
  const lastSeg = bearingDeg(pts231[11], pts231[12]);
  const full = trackBearing(cell231);
  add('Zelle 231: Erst-Segment 54,98° und Letzt-Segment 48,61° (die Spur dreht)',
    Math.abs(firstSeg - 54.98) < 0.01 && Math.abs(lastSeg - 48.61) < 0.01,
    `${firstSeg.toFixed(2)}° / ${lastSeg.toFixed(2)}°`);
  add('trackBearing über die volle Spur = 51,63° und liegt STRIKT dazwischen',
    Math.abs(full - 51.63) < 0.01 && full < firstSeg && full > lastSeg, `${full.toFixed(2)}°`);
  add('trackBearing unterscheidet sich messbar (> 1°) von der Erst-Segment-Peilung',
    Math.abs(full - cell231.bearing) > 1, `Δ ${Math.abs(full - cell231.bearing).toFixed(2)}°`);
  add('trackBearing bleibt nah an der Popup-Peilung (< 5°, sonst widerspräche sich die Karte)',
    run.cells.every((c) => Math.abs(trackBearing(c) - c.bearing) < 5),
    run.cells.map((c) => Math.abs(trackBearing(c) - c.bearing).toFixed(2)).join(' / '));
  add('trackBearing(cell, 15) peilt auf die +15-Stützstelle',
    Math.abs(trackBearing(cell231, 15)
      - bearingDeg([cell231.lon, cell231.lat], [cell231.forecast[2].lon, cell231.forecast[2].lat])) < 1e-9);
  add('trackBearing ohne Spur ⇒ null (keine geratene Richtung, D-04)', trackBearing(noTrack) === null);
}

// ---------------------------------------------------------------------------
// (11) Pfeilkopf und Zeitmarken (Z2-1, Z2-2)
// ---------------------------------------------------------------------------
{
  const a = arrowAnchor(cell);
  const last = cell.forecast[11];
  add('arrowAnchor sitzt am SPURENDE (letzte Stützstelle)',
    a.lon === last.lon && a.lat === last.lat);
  add('arrowAnchor dreht mit trackBearing', Math.abs(a.bearing - trackBearing(cell)) < 1e-9);
  add('arrowAnchor ohne Spur ⇒ null (kein Pfeil ohne Beleg)', arrowAnchor(noTrack) === null);

  const marks = timeMarks(cell);
  add('timeMarks: genau 3 Marken +15/+30/+60',
    marks.length === 3 && marks.map((m) => m.leadMin).join(',') === '15,30,60');
  add('timeMarks sitzen exakt auf den Stützstellen der Spur',
    marks.every((m) => cell.forecast.some((f) => f.leadMin === m.leadMin && f.lon === m.lon && f.lat === m.lat)));
  add('timeMarks: Spur endet bei +30 ⇒ KEINE +60-Marke jenseits des Spurendes',
    timeMarks(shortTrack).map((m) => m.leadMin).join(',') === '15,30');
  add('timeMarks: nicht angeforderter Lead erzeugt keine Marke',
    timeMarks(cell, [45]).length === 1 && timeMarks(cell, [45])[0].leadMin === 45);
  add('timeMarks: Lead außerhalb des Rasters erzeugt nichts (statt zu interpolieren)',
    timeMarks(cell, [17]).length === 0);
  add('timeMarks ohne Spur ⇒ leer', timeMarks(noTrack).length === 0);
}

// ---------------------------------------------------------------------------
// (12) Standortbezug — ETA als SPANNE, Vorbeizug als Aussage (Z2-4, S-Z2-3a)
// ---------------------------------------------------------------------------
{
  const onTrack = [cell.forecast[5].lon, cell.forecast[5].lat]; // +30 min, exakt auf der Spur
  const w = etaWindowToPoint(cell, onTrack);
  add('etaWindowToPoint: Punkt auf der Spur liefert eine Spanne', w !== null,
    w ? `${w.earliestMin}–${w.latestMin} min` : 'null');
  add('etaWindowToPoint: earliestMin < latestMin — IMMER eine Spanne, nie ein Punktwert',
    w.earliestMin < w.latestMin, `${w.earliestMin} < ${w.latestMin}`);
  add('etaWindowToPoint: die Spanne schließt die tatsächliche Stützstelle (+30) ein',
    w.earliestMin <= 30 && w.latestMin >= 30);
  add('etaWindowToPoint: distanceKm ist der Abstand zum JETZIGEN Schwerpunkt',
    Math.abs(w.distanceKm - distKm([cell.lon, cell.lat], onTrack)) < 1e-9);
  add('etaWindowToPoint: weit entfernter Standort ⇒ null', etaWindowToPoint(cell, [7.0, 51.0]) === null);
  add('etaWindowToPoint: OHNE amtliche Ellipse ⇒ null, auch direkt auf der Spur (§5.2)',
    etaWindowToPoint(noEllipse, onTrack) === null);
  // Der Zellkörper zählt mit: ein Punkt knapp neben der Spur, aber innerhalb des
  // Radius √(areaKm2/π) = 5,25 km, wird getroffen (Jans Entscheidung S-Z2-3a).
  const bodyHit = offsetKm(onTrack, trackBearing(cell) + 90, 4);
  add('etaWindowToPoint: Zellkörper zählt mit (4 km querab bei 5,25 km Radius trifft)',
    etaWindowToPoint(cell, bodyHit) !== null);

  const abeam = offsetKm(onTrack, trackBearing(cell) + 90, 15);
  add('etaWindowToPoint: 15 km querab ⇒ kein Treffer', etaWindowToPoint(cell, abeam) === null);
  const pb = passByToPoint(cell, abeam);
  add('passByToPoint: querab liegender Standort liefert positiven missKm',
    pb !== null && pb.missKm > 10 && pb.missKm < 20, `${pb?.missKm.toFixed(1)} km`);
  add('passByToPoint: atLeadMin liegt im Spurfenster 0…60', pb.atLeadMin >= 0 && pb.atLeadMin <= 60, `${pb.atLeadMin} min`);
  // Kern des Lotabstands: er ist NIE größer als der Abstand zum nächsten
  // Stützpunkt — sonst wäre nur auf die Stützpunkte gemessen worden.
  const nearestVertexKm = Math.min(...[[cell.lon, cell.lat], ...cell.forecast.map((f) => [f.lon, f.lat])]
    .map((p) => distKm(p, abeam)));
  add('passByToPoint misst auf die SEGMENTE, nicht nur auf die Stützpunkte',
    pb.missKm <= nearestVertexKm + 1e-9, `${pb.missKm.toFixed(3)} ≤ ${nearestVertexKm.toFixed(3)} km`);
  add('passByToPoint ohne Spur ⇒ null', passByToPoint(noTrack, abeam) === null);

  const solo = { ...run, cells: [cell] };
  const relHit = cellLocationRelevance(solo, onTrack);
  add('cellLocationRelevance: Ort im Pfad ⇒ ETA-Spanne für genau diese Zelle',
    relHit !== null && relHit.kind === 'eta' && relHit.cellId === 12);
  const relPass = cellLocationRelevance(solo, abeam);
  add('cellLocationRelevance: Ort querab ⇒ Vorbeizug statt Leerzustand',
    relPass !== null && relPass.kind === 'passby' && relPass.cellId === 12);
  add(`cellLocationRelevance: jenseits ${CELL_PASS_BY_MAX_KM} km ⇒ null (die Karte behauptet nichts)`,
    cellLocationRelevance(solo, offsetKm(onTrack, trackBearing(cell) + 90, 60)) === null);
  add('cellLocationRelevance: leerer Lauf ⇒ null',
    cellLocationRelevance({ ...run, cells: [] }, onTrack) === null);
  // Die früheste gewinnt, nicht die nächste: eine zweite Zelle, die denselben
  // Punkt später erreicht, darf die frühere nicht verdrängen.
  add('cellLocationRelevance nimmt die FRÜHESTE Zelle',
    cellLocationRelevance({ ...run, cells: [cell231, cell, run.cells[2]] }, onTrack).cellId === 12);
}

// ---------------------------------------------------------------------------
// (13) Wortlaute des Standortbezugs (Z2-E2/E3/E4, D-19)
// ---------------------------------------------------------------------------
{
  const onTrack = [cell.forecast[5].lon, cell.forecast[5].lat];
  const abeam = offsetKm(onTrack, trackBearing(cell) + 90, 15);
  const solo = { ...run, cells: [cell] };
  const etaText = cellRelevanceText(cellLocationRelevance(solo, onTrack));
  const passText = cellRelevanceText(cellLocationRelevance(solo, abeam));
  add('ETA-Satz nennt eine SPANNE („20–35 min"), keinen Punktwert',
    /erreicht dich in \d+–\d+ min/.test(etaText), etaText);
  add('Vorbeizug-Satz ist eine Aussage mit Abstand, Seite und Zeitpunkt',
    /zieht ~\d+ km (nord|süd|ost|west)\S* an dir vorbei/.test(passText), passText);
  const forbidden = ['Tornado', 'Warnung', 'Gefahr', 'Unwetter', 'trifft'];
  const allTexts = [etaText, passText, ...run.cells.map(cellHeadline)];
  add('alle Z2-Textbausteine ohne Warnsprache (D-19)',
    allTexts.every((t) => !forbidden.some((wrd) => t.includes(wrd))));
}

// ---------------------------------------------------------------------------
// (14) GeoJSON mit den Z2-Sorten
// ---------------------------------------------------------------------------
{
  const fc2 = buildCellFeatures(run);
  const counts = cellFeatureCounts(fc2);
  add('neue Sorten: 36 Trichterstufen (3 × 12), 9 Zeitmarken (3 × 3), 3 Pfeile',
    counts['cone-step'] === 36 && counts.mark === 9 && counts.arrow === 3,
    JSON.stringify(counts));
  add('Z1-Sorten unverändert: je 3 cone/hull/path/dot',
    counts.cone === 3 && counts.hull === 3 && counts.path === 3 && counts.dot === 3);
  const order = ['cone', 'cone-step', 'hull', 'path', 'mark', 'arrow', 'dot']
    .map((k) => fc2.features.findIndex((f) => f.properties.kind === k));
  add('Zeichenreihenfolge cone → cone-step → hull → path → mark → arrow → dot',
    order.every((v, i) => i === 0 || v > order[i - 1]), order.join(','));
  add('jede Trichterstufe trägt leadMin', fc2.features
    .filter((f) => f.properties.kind === 'cone-step').every((f) => Number.isFinite(f.properties.leadMin)));
  add('jeder Pfeil trägt eine endliche Peilung', fc2.features
    .filter((f) => f.properties.kind === 'arrow').every((f) => Number.isFinite(f.properties.bearing)));
  add('dot trägt die ANGEZEIGTE Geschwindigkeit (gerundet, aus der Spur)',
    fc2.features.find((f) => f.properties.kind === 'dot' && f.properties.id === 12)
      .properties.trackSpeedKmh === 20);
  add('ohne Standort trägt KEIN Feature affects', !fc2.features.some((f) => 'affects' in f.properties));

  const fcAff = buildCellFeatures(run, { affectsCellId: 12 });
  const affKinds = [...new Set(fcAff.features.filter((f) => f.properties.affects === 1)
    .map((f) => f.properties.kind))].sort();
  add('affects sitzt auf Umriss, Spur, Pfeil und Punkt der EINEN Zelle',
    affKinds.join(',') === 'arrow,dot,hull,path', affKinds.join(','));
  add('affects trifft ausschließlich die benannte Zelle',
    fcAff.features.filter((f) => f.properties.affects === 1).every((f) => f.properties.id === 12));
  add('affects ist 1, nie null — sonst bräche der Z1-Check „keine NaN-Koordinate"',
    !JSON.stringify(fcAff).includes('"affects":null') && !JSON.stringify(fcAff).includes('null,'));
  add('kein Sentinel in der Z2-Geometrie', (() => {
    let worst = Infinity;
    const walk = (v) => {
      if (typeof v === 'number') worst = Math.min(worst, v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(fcAff.features.map((f) => f.geometry));
    return worst > -9e8;
  })());
  add('affectsCellId auf eine unbekannte Zelle zeichnet niemanden aus',
    !buildCellFeatures(run, { affectsCellId: 999999 }).features.some((f) => 'affects' in f.properties));
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
