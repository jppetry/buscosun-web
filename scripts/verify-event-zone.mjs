/**
 * verify:event-zone — die Event-Zone (EZ) gegen dieselbe Wahrheit wie der Client.
 *
 * Netzfrei und DOM-frei: importiert die ECHTEN App-Module (`src/event/eventZone.ts`,
 * `eventState.ts`, `eventModel.ts`) über den TS-Strip-Loader, nichts wird
 * nachgebaut. Geprüft werden Geometrie (jede Zugrichtung, Deckel, Messpunkte),
 * die Einordnung der Spanne inklusive der gemessenen Schwelle aus
 * `audit/event-zone.md` §2 und der additive Permalink.
 */

import {
  zoneFromDrag, clampZone, isDrawnZone, zoneCenter, zoneContains,
  zoneWidthKm, zoneHeightKm, zoneAreaKm2, zoneSamplePoints, zoneCornerPoints,
  zoneRing, zoneSizeText, classifyZoneSpread,
  ZONE_MAX_EDGE_KM, ZONE_MIN_EDGE_KM, ZONE_SPREAD_SLIGHT, ZONE_SPREAD_STRONG,
} from '../src/event/eventZone.ts';
import { encodeEventState, decodeEventState } from '../src/event/eventState.ts';
import { isQueryComplete, defaultPhasesFor, defaultPlanB, todayISO, horizonEndISO, EVENT_ACTIVITIES } from '../src/event/eventModel.ts';
import { defaultTuningFor } from '../src/event/eventScoring.ts';

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

console.log(`\n${fail === 0 ? '✓' : '✗'} verify:event-zone — ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
