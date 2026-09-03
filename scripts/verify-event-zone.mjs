/**
 * verify:event-zone — die Event-Zone (EZ) gegen dieselbe Wahrheit wie der Client.
 *
 * Netzfrei und DOM-frei: importiert die ECHTEN App-Module (`src/event/eventZone.ts`,
 * `eventState.ts`, `eventModel.ts`) über den TS-Strip-Loader, nichts wird
 * nachgebaut. Geprüft werden Geometrie (jede Zugrichtung, Deckel, Messpunkte),
 * die Einordnung der Spanne inklusive der gemessenen Schwelle aus
 * `audit/event-zone.md` §2 und der additive Permalink.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  zoneFromDrag, clampZone, isDrawnZone, zoneCenter, zoneContains,
  zoneWidthKm, zoneHeightKm, zoneAreaKm2, zoneSamplePoints, zoneCornerPoints,
  zoneRing, zoneSizeText, classifyZoneSpread,
  ZONE_MAX_EDGE_KM, ZONE_MIN_EDGE_KM, ZONE_SPREAD_SLIGHT, ZONE_SPREAD_STRONG,
} from '../src/event/eventZone.ts';
import { encodeEventState, decodeEventState } from '../src/event/eventState.ts';
import { isQueryComplete, defaultPhasesFor, defaultPlanB, todayISO, horizonEndISO, EVENT_ACTIVITIES } from '../src/event/eventModel.ts';
import { defaultTuningFor } from '../src/event/eventScoring.ts';
// ET (Terrain-Bühne): NUR das pure Modul — eventTerrainLoad/EventTerrainMap sind
// Browser-Module (Canvas/maplibre) und werden unten nur als Quelltext gelesen.
import {
  phasesWindow, representativeWindHour, windAtHour,
  zoneGrid, zoneTerrainMetrics, ZONE_GRID_MAX_POINTS, ZONE_GRID_MAX_TILES,
  horizonRayPoints, horizonAngles, horizonAt, sunBehindRidge, phaseMidMs,
  HORIZON_AZIMUTHS, HORIZON_MAX_KM, HORIZON_MIN_M, HORIZON_MAX_TILES, RIDGE_MIN_DEG,
} from '../src/event/eventTerrain.ts';
import { computeLightWindows } from '../src/photo/sun.ts';
import { solarPosition } from '../src/pointForecast/terrainPhysics.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcOf = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
const add = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Referenzfläche: ~2 km × ~2 km um Berlin-Mitte.
const A = { lat: 52.50, lon: 13.40 };
const B = { lat: 52.518, lon: 13.4295 };
const Z = zoneFromDrag(A, B);

console.log('\n— Geometrie —');
add('Zone ist normalisiert (west<east, south<north)', Z.west < Z.east && Z.south < Z.north,
  `${Z.west.toFixed(4)}…${Z.east.toFixed(4)} / ${Z.south.toFixed(4)}…${Z.north.toFixed(4)}`);

// Jede der vier Zugrichtungen muss dasselbe Rechteck ergeben.
const dirs = [
  zoneFromDrag(A, B),
  zoneFromDrag(B, A),
  zoneFromDrag({ lat: A.lat, lon: B.lon }, { lat: B.lat, lon: A.lon }),
  zoneFromDrag({ lat: B.lat, lon: A.lon }, { lat: A.lat, lon: B.lon }),
];
add('alle vier Zugrichtungen ergeben dieselbe Fläche',
  dirs.every((z) => near(z.west, Z.west) && near(z.east, Z.east) && near(z.south, Z.south) && near(z.north, Z.north)));

const w = zoneWidthKm(Z); const h = zoneHeightKm(Z);
add('Breite in km plausibel (Kosinus der Breite berücksichtigt)', w > 1.8 && w < 2.2, `${w.toFixed(2)} km`);
add('Höhe in km plausibel', h > 1.9 && h < 2.1, `${h.toFixed(2)} km`);
add('Fläche = Breite × Höhe', near(zoneAreaKm2(Z), w * h, 1e-9), `${zoneAreaKm2(Z).toFixed(2)} km²`);

const c = zoneCenter(Z);
add('Mittelpunkt liegt in der Zone', zoneContains(Z, c));
add('Punkt außerhalb wird als außerhalb erkannt', !zoneContains(Z, { lat: c.lat + 1, lon: c.lon }));
add('Ring ist geschlossen (5 Punkte, erster == letzter)', (() => {
  const r = zoneRing(Z);
  return r.length === 5 && r[0][0] === r[4][0] && r[0][1] === r[4][1];
})());

console.log('\n— Deckel und Mindestgröße (E5) —');
const huge = zoneFromDrag({ lat: 47, lon: 6 }, { lat: 55, lon: 15 });
const capped = clampZone(huge);
add(`Kante wird auf ${ZONE_MAX_EDGE_KM} km gedeckelt`,
  zoneHeightKm(capped) <= ZONE_MAX_EDGE_KM + 0.01 && zoneWidthKm(capped) <= ZONE_MAX_EDGE_KM + 0.01,
  `${zoneWidthKm(capped).toFixed(1)} × ${zoneHeightKm(capped).toFixed(1)} km`);
add('Deckeln hält den Mittelpunkt fest',
  near(zoneCenter(capped).lat, zoneCenter(huge).lat, 1e-9) && near(zoneCenter(capped).lon, zoneCenter(huge).lon, 1e-9));
add('kleine Zone bleibt beim Deckeln unverändert',
  JSON.stringify(clampZone(Z)) === JSON.stringify(Z));
add('verrutschter Klick ist keine Fläche', !isDrawnZone(zoneFromDrag(A, { lat: A.lat + 1e-5, lon: A.lon + 1e-5 })),
  `< ${ZONE_MIN_EDGE_KM} km Kante`);
add('aufgezogene Fläche ist eine Fläche', isDrawnZone(Z));
add('null/undefined sind keine Fläche', !isDrawnZone(null) && !isDrawnZone(undefined));
add('NaN-Ecke ist keine Fläche', !isDrawnZone({ ...Z, north: NaN }));

console.log('\n— Messpunkte —');
const pts = zoneSamplePoints(Z);
add('fünf Messpunkte (Mitte + vier Ecken)', pts.length === 5, pts.map((p) => p.id).join(','));
add('alle Messpunkte liegen IN der Zone', pts.every((p) => zoneContains(Z, p)));
add('Ecken sind eingerückt, liegen also nicht auf der Kante',
  pts.filter((p) => p.id !== 'center').every((p) => p.lat > Z.south && p.lat < Z.north && p.lon > Z.west && p.lon < Z.east));
add('Ecken tragen die richtige Himmelsrichtung', (() => {
  const by = Object.fromEntries(pts.map((p) => [p.id, p]));
  return by.nw.lat > by.sw.lat && by.ne.lon > by.nw.lon && by.se.lat < by.ne.lat && by.sw.lon < by.se.lon;
})());
add('Eckenliste lässt die Mitte weg (der Ort vertritt sie)',
  zoneCornerPoints(Z).length === 4 && !zoneCornerPoints(Z).some((p) => p.id === 'center'));
add('Größentext nennt Kanten und Fläche', /×/.test(zoneSizeText(Z)) && /km²/.test(zoneSizeText(Z)), zoneSizeText(Z));

console.log('\n— Einordnung der Spanne (Schwelle aus der Messung, audit §2) —');
const mk = (scores) => scores.map((s, i) => ({ id: ['center', 'nw', 'ne', 'se', 'sw'][i], label: ['Mitte', 'NW', 'NO', 'SO', 'SW'][i], score: s }));
add('weniger als zwei Werte ⇒ keine Spanne (null statt Scheinaussage)',
  classifyZoneSpread(mk([70])) === null && classifyZoneSpread([]) === null);
const uni = classifyZoneSpread(mk([70, 71, 70, 72, 70]));
add('Spanne unter der Schwelle heißt „uniform"', uni.band === 'uniform', `Spanne ${uni.spread}`);
add('„uniform" sagt ausdrücklich, dass die Quellen die Fläche nicht auflösen',
  /nicht auf/.test(uni.text) && /gewählten Ort/.test(uni.text));
const sli = classifyZoneSpread(mk([70, 65, 70, 72, 70]));
add(`Spanne ab ${ZONE_SPREAD_SLIGHT} heißt „slight"`, sli.band === 'slight', `Spanne ${sli.spread}`);
const str = classifyZoneSpread(mk([70, 55, 70, 72, 70]));
add(`Spanne ab ${ZONE_SPREAD_STRONG} heißt „strong"`, str.band === 'strong', `Spanne ${str.spread}`);
add('schwächster Punkt wird richtig benannt', str.worst.id === 'nw' && str.worst.score === 55);
add('bester Punkt wird richtig benannt', str.best.id === 'se' && str.best.score === 72);
add('min/max/spread sind zueinander konsistent', str.min === 55 && str.max === 72 && str.spread === 17);
add('nicht auswertbare Punkte (NaN) fallen aus der Spanne',
  classifyZoneSpread([...mk([70, 55]), { id: 'ne', label: 'NO', score: NaN }]).spread === 15);
add('gemessener Flachland-Fall (0,16 K ⇒ 0 Punkte Spanne) bleibt „uniform"',
  classifyZoneSpread(mk([74, 74, 74, 74, 74])).band === 'uniform');

console.log('\n— Permalink (E6, additiv) —');
const baseQuery = {
  activity: EVENT_ACTIVITIES[0],
  location: { name: 'Berlin', lat: 52.52, lon: 13.405, country: 'DE' },
  window: { mode: 'range', from: todayISO(), to: horizonEndISO() },
  phases: defaultPhasesFor('bbq'),
  tuning: defaultTuningFor('bbq'),
  planB: defaultPlanB(),
};
const withZone = { ...baseQuery, zone: Z };
const rt = decodeEventState(encodeEventState(withZone));
add('Zone überlebt den Rundlauf durch den Permalink', !!rt?.zone
  && near(rt.zone.west, Z.west, 1e-5) && near(rt.zone.east, Z.east, 1e-5)
  && near(rt.zone.south, Z.south, 1e-5) && near(rt.zone.north, Z.north, 1e-5));
const noZone = decodeEventState(encodeEventState(baseQuery));
add('ohne Zone steht kein `z` im Link', !/"z"/.test(decodeURIComponent(encodeEventState(baseQuery))));
add('ohne Zone lädt der Link als „keine Zone" (nie eine erfundene Fläche)', noZone?.zone === null);
add('Alt-Link ohne `z` bleibt gültig', (() => {
  const legacy = encodeEventState(baseQuery);
  const q = decodeEventState(legacy);
  return !!q && q.location.name === 'Berlin' && q.zone === null;
})());
add('unplausibles `z` wird verworfen, der Rest bleibt gültig', (() => {
  const payload = { a: ['bbq', 'Grillen'], l: [52.52, 13.405, 'Berlin', 'DE'], w: ['r', todayISO(), horizonEndISO()], p: [['Ganzer Tag', 8, 20]], z: [1, 2, 'x'] };
  const q = decodeEventState('#ev=' + encodeURIComponent(JSON.stringify(payload)));
  return !!q && q.zone === null;
})());
add('Null-Fläche im Link (west==east) wird verworfen', (() => {
  const payload = { a: ['bbq', 'Grillen'], l: [52.52, 13.405, 'Berlin', 'DE'], w: ['r', todayISO(), horizonEndISO()], p: [['Ganzer Tag', 8, 20]], z: [13.4, 52.5, 13.4, 52.5] };
  const q = decodeEventState('#ev=' + encodeURIComponent(JSON.stringify(payload)));
  return !!q && q.zone === null;
})());

console.log('\n— Anfrage-Validierung —');
add('Anfrage ohne Zone ist vollständig (Zone ist optional)', isQueryComplete(baseQuery));
add('Anfrage mit echter Zone ist vollständig', isQueryComplete(withZone));
add('Anfrage mit zone:null ist vollständig', isQueryComplete({ ...baseQuery, zone: null }));
add('Anfrage mit entarteter Zone ist NICHT vollständig',
  !isQueryComplete({ ...baseQuery, zone: { west: 13.4, south: 52.5, east: 13.4, north: 52.5 } }));

/* ==================== ET — Terrain-Bühne der Zone ==================== */

console.log('\n— ET2: Wind-Helfer —');
add('Eventfenster über Phasen (einfach)', (() => {
  const [s, e] = phasesWindow([{ id: 'a', label: 'x', hours: [12, 18] }]);
  return s === 12 && e === 18;
})());
add('Über-Mitternacht-Phase zählt bis 24', (() => {
  const [s, e] = phasesWindow([{ id: 'a', label: 'x', hours: [10, 14] }, { id: 'b', label: 'y', hours: [18, 2] }]);
  return s === 10 && e === 24;
})());
add('ohne Phasen gilt der Standardtag 8–20', (() => {
  const [s, e] = phasesWindow([]);
  return s === 8 && e === 20;
})());
add('Windstunde = Böen-Spitzenstunde, wenn bekannt', representativeWindHour(16, [8, 20]) === 16);
add('ohne Spitze: Fenster-Mitte', representativeWindHour(null, [8, 20]) === 14);
add('Windstunde wird auf ≤ 23 geklemmt', representativeWindHour(null, [23, 24]) === 23);
{
  const mkHour = (iso, dir, gust) => ({ timestamp: new Date(iso), windDirection: dir, gustSpeed: gust });
  const hours = [
    mkHour('2026-06-20T13:00:00', 200, 8),
    mkHour('2026-06-20T14:00:00', 230, 12),
    mkHour('2026-06-21T14:00:00', 90, 20),
  ];
  const hit = windAtHour(hours, '2026-06-20', 14);
  add('windAtHour trifft Stunde UND Kalendertag', hit.dirDeg === 230 && hit.gustMs === 12);
  add('windAtHour: falsches Datum ⇒ null', windAtHour(hours, '2026-06-22', 14).dirDeg === null);
  add('windAtHour: Quelle ohne Richtung ⇒ kein Pfeil', (() => {
    const noDir = [mkHour('2026-06-20T14:00:00', null, 12)];
    return windAtHour(noDir, '2026-06-20', 14).dirDeg === null;
  })());
}

console.log('\n— ET3: Zonen-Raster + Kennzahlen —');
add(`E4 als Zahl festgenagelt (Raster ≤ ${ZONE_GRID_MAX_POINTS} Punkte, ≤ ${ZONE_GRID_MAX_TILES} Kacheln)`,
  ZONE_GRID_MAX_POINTS === 64 && ZONE_GRID_MAX_TILES === 16);
const grid = zoneGrid(Z);
add('Raster hält den Punktdeckel', grid.points.length <= ZONE_GRID_MAX_POINTS
  && grid.points.length === grid.cols * grid.rows, `${grid.cols} × ${grid.rows}`);
add('alle Rasterpunkte liegen IN der Zone', grid.points.every((p) => zoneContains(Z, p)));
add('Raster ist deterministisch', JSON.stringify(zoneGrid(Z)) === JSON.stringify(zoneGrid(Z)));
add('breite Zone bekommt mehr Spalten als Zeilen', (() => {
  const wide = zoneFromDrag({ lat: 52.5, lon: 12.5 }, { lat: 52.554, lon: 13.386 }); // ~60 × 6 km
  const g = zoneGrid(wide);
  return g.cols > g.rows;
})());
add('Mini-Zone bekommt mindestens 2 × 2 Stützen', (() => {
  const tiny = zoneFromDrag({ lat: 52.5, lon: 13.4 }, { lat: 52.501, lon: 13.4015 });
  const g = zoneGrid(tiny);
  return g.cols >= 2 && g.rows >= 2;
})());
{
  // Synthetische schiefe Ebene: 100 m an der Westkante → 150 m an der Ostkante.
  const plane = grid.points.map((p) => 100 + (50 * (p.lon - Z.west)) / (Z.east - Z.west));
  const m = zoneTerrainMetrics(Z, grid, plane);
  add('schiefe Ebene: min/max an den Kanten', !!m && m.minM > 100 && m.minM < 110 && m.maxM > 140 && m.maxM < 150,
    m ? `${m.minM.toFixed(1)}–${m.maxM.toFixed(1)} m` : 'null');
  add('tiefster Punkt liegt an der Westkante, höchster an der Ostkante',
    !!m && m.lowest.lon < zoneCenter(Z).lon && m.highest.lon > zoneCenter(Z).lon);
  // 50 m Anstieg über ~2,0 km Breite ⇒ atan(50/2000) ≈ 1,43°.
  const expected = (Math.atan(50 / (zoneWidthKm(Z) * 1000)) * 180) / Math.PI;
  add('mittlere Neigung trifft die Ebene', !!m && near(m.meanSlopeDeg, expected, 0.15),
    m ? `${m.meanSlopeDeg.toFixed(2)}° (erwartet ${expected.toFixed(2)}°)` : 'null');
  add('flaches Gelände: Neigung ≈ 0, Unterschied 0', (() => {
    const flat = zoneTerrainMetrics(Z, grid, grid.points.map(() => 500));
    return !!flat && flat.meanSlopeDeg < 0.01 && flat.spreadM === 0;
  })());
  add('NaN-tolerant: 20 % Lücken ändern die Aussage nicht', (() => {
    const holey = plane.map((e, i) => (i % 5 === 0 ? NaN : e));
    const hm = zoneTerrainMetrics(Z, grid, holey);
    return !!hm && hm.minM > 100 && hm.maxM < 150 && hm.validCount < hm.totalCount;
  })());
  add('über die Hälfte Lücken ⇒ null (halb gemessen ist keine Aussage)',
    zoneTerrainMetrics(Z, grid, plane.map((e, i) => (i % 2 === 0 ? NaN : NaN))) === null);
  add('falsche Listenlänge ⇒ null', zoneTerrainMetrics(Z, grid, plane.slice(1)) === null);
}

console.log('\n— ET4: Horizont + Sonne —');
{
  const { rays, distancesM } = horizonRayPoints({ lat: 47, lon: 11 });
  add(`Strahlen: ${HORIZON_AZIMUTHS} Azimute × ${distancesM.length} Stützen`,
    rays.length === HORIZON_AZIMUTHS && rays.every((r) => r.length === distancesM.length));
  add(`Distanzen ${HORIZON_MIN_M} m … ${HORIZON_MAX_KM} km, streng monoton`, (() => {
    if (!near(distancesM[0], HORIZON_MIN_M, 0.01)) return false;
    if (!near(distancesM[distancesM.length - 1], HORIZON_MAX_KM * 1000, 1)) return false;
    return distancesM.every((d, i) => i === 0 || d > distancesM[i - 1]);
  })());
  add('Azimut 0 geht nach Norden, 90 nach Osten', (() => {
    const north = rays[0][distancesM.length - 1];
    const east = rays[HORIZON_AZIMUTHS / 4][distancesM.length - 1];
    return north.lat > 47 && Math.abs(north.lon - 11) < 1e-6 && east.lon > 11 && Math.abs(east.lat - 47) < 1e-6;
  })());
  add(`Kachel-Deckel des Horizonts festgenagelt (${HORIZON_MAX_TILES})`, HORIZON_MAX_TILES === 32);

  // Synthetische Wand: 100 m hoch in 1 000 m Entfernung ⇒ 5,71° (mit Krümmungsabzug).
  const dists = [60, 1000, 20000];
  const wall = horizonAngles(0, dists, [[0, 100, 0]]);
  add('synthetische Wand: 100 m auf 1 000 m ⇒ ~5,71°', near(wall[0], 5.706, 0.05), `${wall[0].toFixed(3)}°`);
  // Krümmungsterm: ein Punkt auf Standhöhe in 20 km liegt UNTER der Waagerechten.
  const curved = horizonAngles(0, dists, [[NaN, NaN, 0]]);
  add('Erdkrümmung zieht den 20-km-Punkt auf −0,09°', near(curved[0], -0.0899, 0.01), `${curved[0].toFixed(4)}°`);
  add('Strahl ganz ohne Werte ⇒ NaN', Number.isNaN(horizonAngles(0, dists, [[NaN, NaN, NaN]])[0]));

  const angles = [0, 10, NaN, 20];
  add('horizonAt interpoliert linear zwischen den Stützen', near(horizonAt(angles, 45), 5, 1e-9));
  add('horizonAt überbrückt NaN-Nachbarn', horizonAt(angles, 200) === 20 || horizonAt(angles, 200) === 10);
  add('horizonAt wrappt 360 → 0', (() => {
    const v = horizonAt(angles, 350);
    return Number.isFinite(v) && v < 20 && v >= 0;
  })());
}
{
  const lat = 47.3; const lon = 11.0; const dateISO = '2026-06-20';
  const dayStart = new Date(`${dateISO}T00:00:00`).getTime();
  const light = computeLightWindows(dateISO, lat, lon);
  // Grat im Westsektor (10° über [220°, 310°]) — die Sommersonne muss dahinter
  // verschwinden, BEVOR sie astronomisch untergeht.
  const ridge = (az) => (az >= 220 && az <= 310 ? 10 : 0);
  const behind = sunBehindRidge(ridge, lat, lon, dateISO, dayStart + 12 * 3.6e6, dayStart + 24 * 3.6e6);
  add('Grat-Fall: „hinter dem Grat" vor dem Sonnenuntergang',
    behind.kind === 'behind-ridge' && !!light.sunset && behind.atMs < light.sunset.getTime(),
    behind.kind === 'behind-ridge' ? new Date(behind.atMs).toLocaleTimeString('de-DE') : behind.kind);
  const free = sunBehindRidge(() => 0, lat, lon, dateISO, dayStart + 12 * 3.6e6, dayStart + 24 * 3.6e6);
  add('flacher Horizont: frei bis Sonnenuntergang (Zeit aus computeLightWindows)',
    free.kind === 'free-until-sunset' && !!light.sunset && free.sunsetMs === light.sunset.getTime());
  add(`Horizont unter ${RIDGE_MIN_DEG}° ist kein Grat (Sonnenuntergang, nicht „hinter dem Grat")`, (() => {
    const soft = sunBehindRidge(() => 0.5, lat, lon, dateISO, dayStart + 12 * 3.6e6, dayStart + 24 * 3.6e6);
    return soft.kind === 'free-until-sunset';
  })());
  add('Winter-Nachtfenster: Sonne unter dem Horizont', (() => {
    const winterStart = new Date('2026-01-15T22:00:00').getTime();
    const r = sunBehindRidge(() => 0, 47.3, 11.0, '2026-01-15', winterStart, winterStart + 2 * 3.6e6);
    return r.kind === 'below-horizon';
  })());
  // Anker der Astronomie: Berlin, Sommermittag (11 UTC ≈ Sonnenhöchststand).
  const noon = solarPosition(52.52, 13.405, Date.UTC(2026, 5, 20, 11, 0, 0));
  add('solarPosition-Anker: Berlin-Sommermittag steht hoch im Süden',
    noon.elevationDeg > 45 && noon.azimuthDeg > 150 && noon.azimuthDeg < 210,
    `${noon.elevationDeg.toFixed(1)}° / ${noon.azimuthDeg.toFixed(0)}°`);
  add('Phasen-Mitte (13–15 Uhr ⇒ 14:00)', phaseMidMs(dateISO, [13, 15]) === dayStart + 14 * 3.6e6);
  add('Phasen-Mitte über Mitternacht (18–2 ⇒ 21:00)', phaseMidMs(dateISO, [18, 2]) === dayStart + 21 * 3.6e6);
}

console.log('\n— ET: Verdrahtung (Quelltext-Sonden) —');
{
  const etm = srcOf('src/event/EventTerrainMap.tsx');
  const result = srcOf('src/event/EventResult.tsx');
  const scanSrc = srcOf('src/event/eventZoneScan.ts');
  const zoneMap = srcOf('src/event/EventZoneMap.tsx');
  const elev = srcOf('src/route/enrichElevation.ts');

  // ET1 — die Karten-Pflichtfallen.
  add('Terrain-Karte: Terrarium-DEM + setTerrain', /raster-dem/.test(etm) && /terrarium/.test(etm) && /setTerrain/.test(etm));
  add('liberty-Patch auf style.load (nicht load)', /style\.load'?,?\s*\(\)\s*=>\s*patchLibertyRefLength/.test(etm.replace(/\s+/g, ' ')) || /on\('style\.load', \(\) => patchLibertyRefLength/.test(etm));
  add('Attribution wird nach load eingeklappt (BD2e)', /maplibregl-ctrl-attrib\[open\]/.test(etm));
  add('Hillshade liegt unter den Beschriftungen', /type === 'symbol'/.test(etm));
  add('Hillshade-Beleuchtung ist kartenfest verankert', /'hillshade-illumination-anchor': 'map'/.test(etm));
  add('Norden bleibt oben (BEARING = 0)', /const BEARING = 0/.test(etm));
  add('Pfeile: beide Ausrichtungen an der Karte (R3D-6-Falle)',
    /'icon-rotation-alignment': 'map'/.test(etm) && /'icon-pitch-alignment': 'map'/.test(etm));
  add('Ergebnis lädt die Karte lazy', /lazy\(\(\) => import\('\.\/EventTerrainMap'\)\)/.test(result) && /<EventTerrainMap/.test(result));

  // ET2 — behalten statt neu abrufen; das Abrufmuster bleibt (V-EZ-3).
  add('Scan behält das DaySummary je Ecke (V-ET-1)', /summary: day\.summary/.test(scanSrc));
  add('Ecken laufen weiter NACHEINANDER (V-EZ-3-Wache)',
    /for \(const p of toFetch\)/.test(scanSrc) && !/Promise\.all\(toFetch/.test(scanSrc) && /STEP_PAUSE_MS = 300/.test(scanSrc));
  add('Caption nennt Senkenlage UND Hangexposition (V-ET-3)',
    /Senkenlage/.test(result) && /Hangexposition/.test(result) && !/aus Geländehöhe und Stationsnähe/.test(result));
  add('Pfeil-Satz: Modellwind, keine Umströmung', /keine Umströmung/.test(result));

  // ET3 — DEM-Ehrlichkeit + unveränderte Bestandssemantik.
  add('DEM-Vorbehalt steht im Ergebnis (~30 m, ohne Gebäude)', /ohne Gebäude/.test(result) && /~30 m/.test(result));
  add('sampleElevations: Kachel-Deckel additiv, Default unverändert', /maxTiles = MAX_TILES/.test(elev));

  // ET4 — Beleuchtung ≠ Schatten; Astronomie hängt nicht am Wetter.
  add('E5-Pflichtsatz: Beleuchtung, kein Schattenwurf', /kein Schattenwurf/.test(result) && /Beleuchtung/.test(result));
  add('Sonnen-Block gilt jenseits des Wetter-Horizonts', /jenseits des Wetter-Horizonts/.test(result));
  add('Phase steuert die Hillshade-Beleuchtung', /'hillshade-illumination-direction'/.test(etm));

  // ET5 — Wizard-Umschalter, Zeichnen bleibt flach.
  // Whitespace-tolerant: JSX bricht den Knopftext um (Lehre aus SF0 §Textsonden).
  add('Wizard: Umschalter Karte | Gelände', /Gelände\s*<\/button>/.test(zoneMap) && /Karte\s*<\/button>/.test(zoneMap));
  add('Wizard-Vorschau läuft im preview-Modus (kein Wetter)', /mode="preview"/.test(zoneMap));
  add('Zeichen-Knöpfe sind im Gelände-Modus gesperrt', /disabled=\{view === 'terrain'\}/.test(zoneMap));
  add('der Grund steht dabei (nur auf der flachen Karte)', /nur auf der flachen Karte/.test(zoneMap));
  add('Zurückschalten ruft map.resize() (versteckter Container maß 0)', /\.resize\(\)/.test(zoneMap));
}

console.log(`\n${fail === 0 ? '✓' : '✗'} verify:event-zone — ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
