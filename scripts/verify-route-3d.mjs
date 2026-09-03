/**
 * verify:route-3d — die 3D-Ansicht der Tourenplanung (Linie R3D).
 *
 * Netz- und DOM-frei: importiert die ECHTEN Module über den TS-Strip-Loader —
 * `src/route/route3d/scene.ts` (Projektion), `src/route/route3d/model.ts`
 * (Szenen-Modell + Ehrlichkeits-Texte) und den geteilten Rechenkern
 * `src/threed/crossSection.ts`. Nichts wird nachgebaut.
 *
 * Geprüft werden vier Dinge:
 *  1. **Axonometrie** — die Projektion ist affin (Parallelprojektion), sonst
 *     stimmt die Aussage der Vorlage nicht (audit/route-3d.md §2.1).
 *  2. **Verdeckung** — Gelände- und Himmelspolygon teilen exakt dieselbe
 *     Profilkante; daran wird die Wand beschnitten (§5 B5).
 *  3. **Kopplung** — Position ↔ Zeit läuft über die ETA und ist umkehrbar.
 *  4. **Ehrlichkeit** — Auflösung aus `clustering.ts` statt „≈ 2 km" (B1),
 *     Quellen je Land statt eines Modells (B2), Lücken benannt (B6/E6),
 *     stufige Bänder statt stetiger Rampe, „abgeleitet" an der Wolkenbasis.
 *
 * Zusätzlich läuft die bis dahin unverdrahtete Selbstverifikation des
 * Vertikalschnitts mit (`verifyCrossSection`) — B6 des Audits.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  makeProjection, heightRange, heightTicks, terrainPath, skyPath, terrainCapPath,
  planePath, cellPath, ribbonPoints, freeSpan, layoutCards, reliefPath,
  DEFAULT_EXAGGERATION, MAX_EXAGGERATION,
} from '../src/route/route3d/scene.ts';
import {
  buildScene, buildWindCells, buildRainColumns, buildWarnZones,
  buildTerrainProfile, terrainAt, minTerrainBetween, PROFILE_MAX_NODES,
  RELIEF_OFFSETS_M, terrainNote, HAIL_NOTE,
  etaAtDist, distAtEta, columnAtDist, snapToStep, meanConfidence, confidenceWord,
  resolutionChip, resolutionNote, sourceNote, segmentEdges,
  WALL_STEP_M, RAIN_MIN_MMH, TIME_STEP_MS, UNCLEAR_BELOW, WIND_BAND_LABELS,
} from '../src/route/route3d/model.ts';
import {
  windBandIndex, windAtAGL, lclAgl, WIND_BANDS_KMH, DEFAULT_ALPHA,
  verifyCrossSection, assembleCrossSection,
} from '../src/threed/crossSection.ts';
import { verifyCurtainMesh } from '../src/threed/curtainMesh.ts';
import { verifySectionGeometry } from '../src/threed/sectionGeometry.ts';
import {
  buildRouteSection, resampleTerrain, interpTrack, routeCoords, wetCoords,
  segmentCoords, routeSegments, windPicks,
  curtainNote, NO_INVERSION_NOTE, SECTION_COLUMNS, CURTAIN_HEADROOM_M,
  CURTAIN_BAND_AGL_M, SECTION_LEVEL_STEP_M,
} from '../src/route/route3d/routeSection.ts';
import {
  buildSchedule, buildScheduleText, steppedBand, SCHEDULE_NOTE, TEMP_MARK_C, MAX_EVENTS,
} from '../src/route/route3d/schedule.ts';
import { radiusForTerrain, DEFAULT_ELEV_BAND_M } from '../src/pointForecast/clustering.ts';
import {
  rainWindows, windowAtDist, nextWindow, buildPearls, buildTimeline, columnAtEta,
  startAdvice, startAdviceNote, radarHorizonNote, radarHorizonChip, hhmm,
  ADVICE_MIN_GAIN_MIN, GUST_ALERT_KMH, PEARL_MIN_GAP,
} from '../src/route/route3d/corridor.ts';
import { sampleDurationsMin, START_OFFSETS_MIN } from '../src/pointForecast/weatherEnrichment.ts';
import {
  packTour, unpackTour, isFreshEntry, restoreStartMs, tourStoreEnabled,
  TOUR_MAX_AGE_MS, TOUR_STORE_VERSION,
} from '../src/route/tourStore.ts';
import {
  buildGoNoGoReport, DEFAULT_LIMITS, entryPasses, evaluateColumn, goSections, goStartNote,
  goStartSearch, kmLabel, leadSection, limitDef, LIMITS, LIMITS_STORE_KEY, overallStatus,
  reasonSentence, sanitizeLimits, sectionAtDist, STATUS_RANK, STATUS_WORD, summarizeLimits,
  unclearShort,
} from '../src/route/route3d/gonogo.ts';
import { verifyGoNoGo } from '../src/threed/goNoGo.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
const add = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/**
 * Quelltext ohne Kommentare. Textsonden, die pruefen, was die Ansicht NICHT
 * behauptet, muessen den Code lesen — nicht die Begruendung, warum etwas
 * weggelassen wurde. (Beide Sonden unten schlugen zuerst auf genau dieser
 * Begruendung an.)
 */
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

/* ============================ Fixtures ============================ */

const VP = { w: 1160, h: 520, padL: 62, padR: 26, padT: 26, padB: 34, depthX: 96, depthY: 74 };
const START = Date.UTC(2026, 6, 12, 6, 30); // Sa 12. Juli, 08:30 lokal

/** Eine Tour wie in der Vorlage: 18,4 km, 843 m → 1846 m. */
function makeSamples(n = 24, opts = {}) {
  const { country = 'DE', rainFrom = 8, rainTo = 14, warnFrom = 8, warnTo = 14, snowLine = null, withWarnings = true } = opts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const dist = f * 18_400;
    const ele = 843 + f * (1846 - 843) + Math.sin(f * 7) * 40;
    const etaMs = START + f * (3.73 * 3600_000);
    const km = dist / 1000;
    const raining = km >= rainFrom && km <= rainTo;
    const warned = withWarnings && km >= warnFrom && km <= warnTo;
    out.push({
      index: i, dist, lat: 47.4 + f * 0.1, lon: 10.3 + f * 0.05, ele,
      etaMs, arrivalOffsetMin: f * 224, segmentSpeedKmh: 5,
      batteryPctRemaining: 100 - f * 30,
      weather: {
        temperatureC: 14 - f * 9,
        apparentTempC: 11 - f * 10,
        windSpeedMps: 5 + f * 4,
        windDirectionDeg: 250,
        gustMps: 9 + f * 6,
        relativeHumidityPct: 70 + f * 20,
        cloudCoverPct: 60,
        uvIndex: null,
        precipitationMmH: raining ? 1.4 : 0,
        precipitationSource: raining ? 'radar' : null,
        precipitationType: raining ? 'rain' : 'none',
        snowLineM: snowLine,
        foehn: null,
        warnings: warned
          ? [{ source: 'dwd_cap', alertId: 'A1', event: 'Sturmböen', severity: 'Severe', level: 3,
               headline: 'Amtliche Warnung vor Sturmböen', onsetMs: START + 1800_000, expiresMs: START + 4 * 3600_000 }]
          : [],
        confidence: { temperature: 0.8, wind: 0.6, gust: 0.55, humidity: 0.7, precipitation: 0.8, clouds: 0.6, snowLine: 0.4, uvIndex: 0 },
        cellId: Math.floor(i / 6),
        sourcesUsed: [country === 'DE' ? 'mosmix' : 'arome'],
        isInterpolated: false,
        validityFlags: [],
      },
    });
  }
  return out;
}

const samples = makeSamples();
const points = samples.map((s) => ({ lat: s.lat, lon: s.lon, ele: s.ele, dist: s.dist }));
const scene = buildScene({ samples, points, countries: ['DE'], coverage: { snowLine: false } });

/* ============================ 1 · Axonometrie ============================ */
console.log('\n— Projektion (Parallelprojektion, affin) —');

const { floorM, topM } = heightRange(scene.columns.map((c) => c.terrainM), []);
const P = makeProjection(VP, scene.totalM, floorM, topM, DEFAULT_EXAGGERATION);

add('Tiefe verschiebt affin: derselbe Vektor an jedem Punkt', (() => {
  const probes = [[0, floorM], [5000, 1200], [18400, topM]];
  const vecs = probes.map(([d, a]) => {
    const p0 = P.project(d, a, 0);
    const p1 = P.project(d, a, 1);
    return [p1.x - p0.x, p1.y - p0.y];
  });
  return vecs.every(([dx, dy]) => near(dx, VP.depthX, 1e-9) && near(dy, -VP.depthY, 1e-9));
})(), `(${VP.depthX}, −${VP.depthY}) px`);

add('Parallelen bleiben parallel (zwei Höhenebenen)', (() => {
  const a1 = P.project(0, 1000), b1 = P.project(18400, 1000);
  const a2 = P.project(0, 2000), b2 = P.project(18400, 2000);
  const s1 = (b1.y - a1.y) / (b1.x - a1.x);
  const s2 = (b2.y - a2.y) / (b2.x - a2.x);
  return near(s1, s2, 1e-9);
})());

add('x wächst streng mit der Distanz, y fällt streng mit der Höhe', (() => {
  let ok = true;
  for (let d = 0; d < 18000; d += 1000) ok = ok && P.project(d, 1000).x < P.project(d + 1000, 1000).x;
  for (let a = floorM; a < topM - 100; a += 100) ok = ok && P.project(1000, a).y > P.project(1000, a + 100).y;
  return ok;
})());

add('Überhöhung ist gerechnet, nicht behauptet (scaleY / scaleX)', near(P.exaggeration, P.scaleY / P.scaleX, 1e-12), `${P.exaggeration.toFixed(2)}×`);

add('Wunsch-Überhöhung wird auf die Zeichenfläche gedeckelt und meldet das', (() => {
  const big = makeProjection(VP, 2000, 0, 3000, MAX_EXAGGERATION);
  return big.clamped === true && big.exaggeration < MAX_EXAGGERATION;
})());

add('kleine Überhöhung bleibt exakt erhalten (nicht gedeckelt)', (() => {
  const flat = makeProjection(VP, 200_000, 0, 1000, 1);
  return flat.clamped === false && near(flat.exaggeration, 1, 1e-9);
})());

add('Höhenbereich schließt Gelände UND Zusatzebenen ein', (() => {
  const r = heightRange([800, 1200, 1846], [2400, 2200]);
  return r.floorM <= 800 && r.topM >= 2400 + 100;
})(), `${floorM}…${topM} m`);

add('Höhenlinien liegen echt im Bereich und sind rund', (() => {
  const t = heightTicks(600, 2750);
  return t.length >= 2 && t.every((m) => m > 600 && m < 2750) && t.every((m) => m % 250 === 0);
})(), heightTicks(600, 2750).join(', '));

/* ============================ 2 · Verdeckung ============================ */
console.log('\n— Verdeckung (Gelände schneidet die Wand) —');

const cols = scene.columns.map((c) => ({ distM: c.distM, terrainM: c.terrainM }));
const tPath = terrainPath(P, cols);
const sPath = skyPath(P, cols);

add('Geländepolygon ist geschlossen', tPath.startsWith('M') && tPath.trim().endsWith('Z'));
add('Himmelspolygon ist geschlossen', sPath.startsWith('M') && sPath.trim().endsWith('Z'));

add('beide teilen exakt dieselbe Profilkante — die Wand wird genau am Gelände beschnitten', (() => {
  const edge = (d) => d.split(/\s+/).slice(0, cols.length).join(' ');
  return edge(tPath) === edge(sPath);
})());

add('das Himmelspolygon endet an der Szenendecke, nicht am Bildrand', (() => {
  const topY = P.project(0, topM).y;
  return sPath.includes(`,${Math.round(topY * 10) / 10}`);
})());

add('die Kappe der Extrusion nutzt DASSELBE Profil (kein erfundener zweiter Kamm)', (() => {
  const cap = terrainCapPath(P, cols);
  const front = cap.split(' L').slice(0, cols.length).join(' L');
  return front.replace(/^M/, '') === tPath.split(' L').slice(0, cols.length).join(' L').replace(/^M/, '');
})());

add('Höhenebene und Zelle sind Vierecke (4 Stützpunkte + Z)', (() => {
  const plane = planePath(P, 2400);
  const cell = cellPath(P, 0, 1000, 800, 1100);
  return plane.split(/[ML]/).length === 5 && cell.split(/[ML]/).length === 5;
})());

add('das Routenband hat genau so viele Punkte wie Spalten', ribbonPoints(P, cols).length === cols.length);

add('Ebenen-Beschriftung landet in der frei liegenden Spanne, nicht hinter dem Berg', (() => {
  // Im Browser gemessen: das Label „Wolkenbasis 1544 m" lag hinter dem 2 234-m-Gipfel
  // und wurde von der Verdeckungsmaske weggeschnitten.
  const span = freeSpan(cols, scene.cloudBase.meanM);
  if (!span) return false;
  const inFree = scene.columns
    .filter((c) => c.distM >= span.fromM && c.distM <= span.toM)
    .every((c) => c.terrainM < scene.cloudBase.meanM);
  return inFree && span.midM > span.fromM - 1e-9 && span.midM < span.toM + 1e-9;
})());

add('liegt die Ebene nirgends frei, gibt es kein Label (statt eines unsichtbaren)',
  freeSpan(cols, 0) === null);

/* ============================ 3 · Windwand ============================ */
console.log('\n— Windwand (fünf benannte Bänder, stufig) —');

add('Bandgrenzen kommen aus crossSection.ts, nicht aus der Ansicht',
  WIND_BAND_LABELS.length === 5 && WIND_BAND_LABELS[0] === `< ${WIND_BANDS_KMH[0]}` && WIND_BAND_LABELS[4] === `> ${WIND_BANDS_KMH[3]}`,
  WIND_BAND_LABELS.join(' | '));

add('Einstufung trifft die Kanten exakt', windBandIndex(14.9) === 0 && windBandIndex(15) === 1 && windBandIndex(45) === 3 && windBandIndex(60.1) === 4);

const cells = buildWindCells(scene.columns);
add('jede Spalte mit Wind bekommt Wandsegmente', cells.length > 0 && cells.every((c) => c.toM > c.fromM && c.hiM > c.loM), `${cells.length} Segmente`);

add('Segmente einer Spalte stoßen lückenlos aneinander (kein Loch, keine Überlappung)', (() => {
  const first = cells.filter((c) => near(c.fromM, cells[0].fromM, 1e-6)).sort((a, b) => a.loM - b.loM);
  for (let i = 1; i < first.length; i++) if (!near(first[i].loM, first[i - 1].hiM, 1e-6)) return false;
  return first.length > 1;
})());

add('Segmenthöhe ist das Höhenband des Modells', cells.every((c) => c.hiM - c.loM <= WALL_STEP_M + 1e-6), `${WALL_STEP_M} m`);

add('Wind nimmt mit der Höhe zu — das Band fällt über einer Spalte nie', (() => {
  const first = cells.filter((c) => near(c.fromM, cells[0].fromM, 1e-6)).sort((a, b) => a.loM - b.loM);
  for (let i = 1; i < first.length; i++) if (first[i].band < first[i - 1].band) return false;
  return true;
})());

add('die Wand rechnet mit windAtAGL aus demselben Kern wie der 2D-Schnitt', (() => {
  const c = scene.columns[0];
  const seg = cells.find((x) => near(x.fromM, cells[0].fromM, 1e-6) && x.loM === c.terrainM);
  const agl = (seg.loM + seg.hiM) / 2 - c.terrainM;
  return near(seg.kmh, windAtAGL(c.windKmh, agl, DEFAULT_ALPHA), 1e-9);
})());

/* ============================ 4 · Regen, Wolken, Warnungen ============================ */
console.log('\n— Regen · Wolkenbasis · Warnzonen —');

add('Regensäulen nur ab der Mindestrate', scene.rain.length > 0 && scene.rain.every((r) => r.mmH >= RAIN_MIN_MMH));
add('Regensäulen liegen im Regenabschnitt der Fixture (km 8–14)', (() => {
  const from = Math.min(...scene.rain.map((r) => r.fromM)) / 1000;
  const to = Math.max(...scene.rain.map((r) => r.toM)) / 1000;
  return from >= 7.4 && to <= 14.6;
})(), `${(Math.min(...scene.rain.map((r) => r.fromM)) / 1000).toFixed(1)}–${(Math.max(...scene.rain.map((r) => r.toM)) / 1000).toFixed(1)} km`);
add('die Quelle wird durchgereicht — Radar bleibt Radar', scene.rain.every((r) => r.source === 'radar'));
add('Regen reicht von der Strecke bis zur Wolkenbasis', scene.rain.every((r) => r.topM > r.baseM));

add('trockene Strecke ⇒ keine Säule und ein Satz, der es sagt', (() => {
  const dry = buildScene({ samples: makeSamples(12, { rainFrom: 99, rainTo: 99 }), points, countries: ['DE'] });
  return dry.rain.length === 0 && dry.availability.rain.any === false && dry.availability.rain.note.includes('trocken');
})());

add('Wolkenbasis ist Gelände + LCL — dieselbe Formel wie der Vertikalschnitt', (() => {
  const c = scene.columns[3];
  const w = samples[3].weather;
  return near(c.cloudBaseM, c.terrainM + lclAgl(w.temperatureC, w.relativeHumidityPct), 1e-9);
})());

add('Warnung wird EINE Raumzone (dedupliziert nach alertId)', scene.warnZones.length === 1, `${scene.warnZones.length}`);
add('die Zone trägt km-Spanne UND Zeitfenster', (() => {
  const z = scene.warnZones[0];
  return z.toM > z.fromM && z.toMs > z.fromMs && z.level === 3 && z.event === 'Sturmböen';
})(), `km ${(scene.warnZones[0].fromM / 1000).toFixed(1)}–${(scene.warnZones[0].toM / 1000).toFixed(1)}`);
add('die Zone deckt genau die gewarnten Samples', (() => {
  const z = scene.warnZones[0];
  const warned = scene.columns.filter((c, i) => samples[i].weather.warnings.length > 0);
  return near(z.fromM, Math.min(...warned.map((c) => c.distM)), 1e-6) && near(z.toM, Math.max(...warned.map((c) => c.distM)), 1e-6);
})());

add('„Gipfel in Wolke" nur, wenn das Gelände die Basis wirklich durchstößt', (() => {
  const low = buildScene({ samples: makeSamples(12), points, countries: ['DE'] });
  return low.peaksInCloud.every((p) => p.terrainM > low.cloudBase.meanM - 1e-6);
})());

/* ============================ 5 · Kopplung Position ↔ Zeit ============================ */
console.log('\n— Gekoppelte Regler (ETA ist die Wahrheit) —');

add('Position → Zeit ist monoton', (() => {
  let prev = -Infinity;
  for (let d = 0; d <= scene.totalM; d += scene.totalM / 40) {
    const t = etaAtDist(scene.columns, d);
    if (t < prev) return false;
    prev = t;
  }
  return true;
})());

add('Rundlauf Position → Zeit → Position trifft auf < 1 m', (() => {
  let worst = 0;
  for (let d = 0; d <= scene.totalM; d += scene.totalM / 37) {
    const back = distAtEta(scene.columns, etaAtDist(scene.columns, d));
    worst = Math.max(worst, Math.abs(back - d));
  }
  return worst < 1;
})());

add('Rundlauf Zeit → Position → Zeit trifft auf < 1 s', (() => {
  let worst = 0;
  for (let t = scene.startMs; t <= scene.endMs; t += (scene.endMs - scene.startMs) / 31) {
    const back = etaAtDist(scene.columns, distAtEta(scene.columns, t));
    worst = Math.max(worst, Math.abs(back - t));
  }
  return worst < 1000;
})());

add('außerhalb der Tour wird geklemmt statt extrapoliert',
  etaAtDist(scene.columns, -5000) === scene.startMs && etaAtDist(scene.columns, 1e9) === scene.endMs);

add('das Zeitband rastet auf 15 Minuten', (() => {
  const t = snapToStep(scene.startMs + 7 * 60_000, scene.startMs);
  return (t - scene.startMs) % TIME_STEP_MS === 0 && TIME_STEP_MS === 900_000;
})());

add('die Punkt-Abfrage nimmt die nächste Spalte', (() => {
  const c = columnAtDist(scene.columns, 9_200);
  return c && scene.columns.every((x) => Math.abs(x.distM - 9200) >= Math.abs(c.distM - 9200) - 1e-9);
})());

/* ============================ 6 · Ehrlichkeit ============================ */
console.log('\n— Ehrlichkeit (audit/route-3d.md §5) —');

add('B1: die Auflösung kommt aus clustering.ts, nicht als Literal „2 km"', (() => {
  const alp = resolutionChip('alpin');
  const fl = resolutionChip('flach');
  return alp.includes(String(Math.round(radiusForTerrain('alpin') / 1000)))
    && fl.includes(String(Math.round(radiusForTerrain('flach') / 1000)))
    && alp.includes(String(DEFAULT_ELEV_BAND_M))
    && alp !== fl;
})(), `alpin „${resolutionChip('alpin')}" · flach „${resolutionChip('flach')}"`);

add('B1: der lange Satz sagt, dass die Werte für die Umgebung gelten', resolutionNote('hügelig').includes('Umgebung') && resolutionNote('hügelig').includes('10 km'));

add('B2: die Quellenzeile nennt den Stack je Land — bei Grenztouren beide', (() => {
  const de = sourceNote(['DE']);
  const both = sourceNote(['DE', 'AT']);
  return de.includes('DWD') && !de.includes('GeoSphere') && both.includes('DWD') && both.includes('GeoSphere');
})(), sourceNote(['DE', 'AT']));

add('B2: ohne Länderangabe wird nichts erfunden (Rückfall auf DE, nicht auf „unbekannt")', sourceNote([]).includes('DWD'));

add('E6: Schneefallgrenze fehlt in DE — der Satz nennt AROME und AT/CH', (() => {
  const a = scene.availability.snowLine;
  return a.any === false && a.note.includes('AROME') && a.note.includes('Deutschland');
})(), scene.availability.snowLine.note);

add('E6: mit AROME-Wert ist die Schneefallgrenze da', (() => {
  const at = buildScene({ samples: makeSamples(12, { snowLine: 2200 }), points, countries: ['AT'], coverage: { snowLine: true } });
  return at.availability.snowLine.any === true && Math.round(at.snowLine.meanM) === 2200;
})());

add('E6: auf einer AT-Tour sagt die Warnzeile, dass DWD-Warnungen dort nicht greifen', (() => {
  const at = buildScene({ samples: makeSamples(12, { withWarnings: false }), points, countries: ['AT'], coverage: { snowLine: true } });
  return at.availability.warnings.any === false && at.availability.warnings.note.includes('DWD') && at.availability.warnings.note.includes('Österreich');
})());

add('E6: eine DE-Tour ohne Warnung sagt „keine Warnung", nicht „keine Quelle"', (() => {
  const de = buildScene({ samples: makeSamples(12, { withWarnings: false }), points, countries: ['DE'] });
  return de.availability.warnings.note.includes('keine amtliche Warnung');
})());

add('Konfidenz: unter der Schwelle heißt es „unklar"', (() => {
  const m = meanConfidence(scene.columns, 'wind');
  return confidenceWord(0.2) === 'unklar' && confidenceWord(UNCLEAR_BELOW) === 'mittel' && confidenceWord(0.9) === 'gut' && m > 0;
})(), `Wind ${meanConfidence(scene.columns, 'wind').toFixed(2)}`);

add('Konfidenz ohne Werte ist null, nicht 0 (kein falsches „unklar")', (() => {
  const bare = buildScene({ samples: samples.map((s) => ({ ...s, weather: undefined })), points, countries: ['DE'] });
  return meanConfidence(bare.columns, 'wind') === null && confidenceWord(null) === null;
})());

/* ============================ 7 · Textsonden auf die Ansicht ============================ */
console.log('\n— Ansicht (Textsonden auf Werte, nicht auf Zeilen) —');

const sceneSrc = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Scene3D.tsx'), 'utf8');
const viewSrc = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Route3DView.tsx'), 'utf8');

add('die Wand nimmt die STUFIGE Bandfarbe, nicht die stetige Rampe',
  sceneSrc.includes('BAND_COLORS[c.band]') && !sceneSrc.includes('windRampRGB'));
add('die Wolkenbasis trägt das Wort „abgeleitet" (E7)', sceneSrc.includes('abgeleitet'));
add('die Punkt-Abfrage unterscheidet Radar-Nowcast und Modellwert (Auftrag)',
  viewSrc.includes("'Radar-Nowcast'") && viewSrc.includes("'Modellwert'"));
add('leere Layer werden benannt statt still ausgeblendet', viewSrc.includes('ohne Daten') && viewSrc.includes('r3-gaps'));
add('die amtliche Warnung wird zitiert, nicht zusammengefasst (Sonderregel Warn-Layer)',
  viewSrc.includes('wortwörtlich') && viewSrc.includes('warn.headline'));
add('prefers-reduced-motion schaltet das Abspielen ab statt die Ansicht',
  viewSrc.includes('prefers-reduced-motion') && viewSrc.includes('r3-play-off'));
add('kein WebGL im 3D-Pfad (Weg A der Diagnose) — nichts zu prüfen, nichts zurückzufallen',
  !sceneSrc.includes('webgl') && !viewSrc.includes('webgl') && !viewSrc.includes('maplibre'));
add('die Szene ist beschriftet (Screenreader bekommt die aktiven Ebenen)',
  sceneSrc.includes('role="img"') && sceneSrc.includes('aria-label'));
add('der Umschalter steht im Ergebnis und meldet seinen Zustand', (() => {
  const tv = readFileSync(join(ROOT, 'src', 'route', 'TourView.tsx'), 'utf8');
  return tv.includes('r3-toggle') && tv.includes("aria-pressed={view === '3d'}");
})());
add('die 3D-Ansicht rendert INNERHALB von TourView (kein Remount, B3)', (() => {
  const tv = readFileSync(join(ROOT, 'src', 'route', 'TourView.tsx'), 'utf8');
  return tv.includes('<Route3DView') && !tv.includes('window.location.assign');
})());
add('Position und Marker sind mit der 2D-Ansicht geteilt (scrubDistM)', (() => {
  const tv = readFileSync(join(ROOT, 'src', 'route', 'TourView.tsx'), 'utf8');
  return tv.includes('distM={scrubDistM}') && tv.includes('onDist={setScrubDistM}');
})());

/* ==================== 8 · Zeitkorridor 1b — Regenfenster ==================== */
console.log('\n— Regenfenster (km x Zeit auf der Diagonale) —');
{
  const w = rainWindows(scene.columns);
  add('die Vorlagen-Tour hat genau ein Regenfenster', w.length === 1, `${w.length}`);

  const wet = scene.columns.filter((c) => (c.precipMmH ?? 0) >= RAIN_MIN_MMH);
  const iFirst = scene.columns.indexOf(wet[0]);
  const iLast = scene.columns.indexOf(wet[wet.length - 1]);
  // Ein Sample steht fuer seine Umgebung: das Fenster reicht bis zur Mitte
  // zum trockenen Nachbarn (sonst hat ein einzelnes nasses Sample Ausdehnung 0).
  add('das Fenster reicht bis zur Mitte zum trockenen Nachbarn',
    w[0]
    && near(w[0].fromM, (scene.columns[iFirst - 1].distM + wet[0].distM) / 2, 1e-9)
    && near(w[0].toM, (wet[wet.length - 1].distM + scene.columns[iLast + 1].distM) / 2, 1e-9));
  add('die Zeitgrenzen folgen derselben Regel (eine Diagonale, kein zweites Zeitmodell)',
    w[0]
    && w[0].fromMs === Math.round((scene.columns[iFirst - 1].etaMs + wet[0].etaMs) / 2)
    && w[0].toMs === Math.round((wet[wet.length - 1].etaMs + scene.columns[iLast + 1].etaMs) / 2));
  add('ein EINZELNES nasses Sample hat trotzdem Ausdehnung (Browser: „km 0,0–0,0")', (() => {
    const one = makeSamples(24, { rainFrom: 99, rainTo: 99 });
    one[10].weather.precipitationMmH = 1.2;
    one[10].weather.precipitationSource = 'nwp';
    one[10].weather.precipitationType = 'rain';
    const sc = buildScene({ samples: one, points, countries: ['DE'], coverage: { snowLine: false } });
    const ww = rainWindows(sc.columns);
    return ww.length === 1 && ww[0].toM > ww[0].fromM && ww[0].toMs > ww[0].fromMs;
  })());
  add('an der Streckenkante bleibt das Fenster an der Kante (kein Nachbar zum Mitteln)', (() => {
    const edgeWet = makeSamples(24, { rainFrom: 99, rainTo: 99 });
    edgeWet[0].weather.precipitationMmH = 1.2;
    edgeWet[0].weather.precipitationSource = 'nwp';
    edgeWet[0].weather.precipitationType = 'rain';
    const sc = buildScene({ samples: edgeWet, points, countries: ['DE'], coverage: { snowLine: false } });
    return rainWindows(sc.columns)[0].fromM === 0;
  })());
  add('die Spitze ist das Maximum der Raten im Fenster',
    w[0] && near(w[0].peakMmH, Math.max(...wet.map((c) => c.precipMmH)), 1e-9));
  add('die Quelle des Fensters ist benannt (Radar ist nicht Modell)', w[0] && w[0].source === 'radar');

  // Gemischte Quellen muessen als gemischt erscheinen, nicht als eine der beiden.
  const mixed = makeSamples();
  for (const s2 of mixed) {
    const mm = s2.weather.precipitationMmH;
    if (mm >= RAIN_MIN_MMH && s2.dist > 11_000) s2.weather.precipitationSource = 'nwp';
  }
  const mixedScene = buildScene({ samples: mixed, points, countries: ['DE'], coverage: { snowLine: false } });
  add('Radar + Modell im selben Fenster heisst "gemischt"',
    rainWindows(mixedScene.columns)[0]?.source === 'gemischt');

  const dry = makeSamples(24, { rainFrom: 99, rainTo: 99 });
  const dryScene = buildScene({ samples: dry, points, countries: ['DE'], coverage: { snowLine: false } });
  add('eine trockene Tour hat kein Fenster (keine erfundene Zelle)', rainWindows(dryScene.columns).length === 0);

  const two = makeSamples();
  for (const s2 of two) {
    const km = s2.dist / 1000;
    const rains = (km >= 3 && km <= 5) || (km >= 12 && km <= 14);
    s2.weather.precipitationMmH = rains ? 1.4 : 0;
    s2.weather.precipitationSource = rains ? 'radar' : null;
    s2.weather.precipitationType = rains ? 'rain' : 'none';
  }
  const twoScene = buildScene({ samples: two, points, countries: ['DE'], coverage: { snowLine: false } });
  const tw = rainWindows(twoScene.columns);
  add('zwei getrennte Regenabschnitte bleiben zwei Fenster', tw.length === 2, `${tw.length}`);
  add('die Fenster ueberlappen sich nicht', tw.length === 2 && tw[0].toM < tw[1].fromM);

  add('windowAtDist trifft innerhalb', !!windowAtDist(w, (w[0].fromM + w[0].toM) / 2));
  add('windowAtDist ist null ausserhalb', windowAtDist(w, w[0].fromM - 500) === null);
  add('nextWindow zeigt auf das kommende Fenster', nextWindow(tw, 0)?.fromM === tw[0].fromM);
  add('nextWindow ist null hinter dem letzten', nextWindow(tw, tw[1].toM + 1) === null);
}

/* ==================== 8b · Wetterperlen ==================== */
console.log('\n— Wetterperlen zur ETA —');
{
  const pearls = buildPearls(scene.columns, 6);
  add('die erste Perle ist der Start', pearls[0].kind === 'start' && near(pearls[0].distM, 0, 1e-9));
  add('die letzte Perle ist das Ziel',
    pearls[pearls.length - 1].kind === 'goal' && near(pearls[pearls.length - 1].distM, scene.totalM, 1e-9));
  add('die Perlen stehen in Streckenreihenfolge',
    pearls.every((p, i) => i === 0 || p.distM >= pearls[i - 1].distM));
  add('jede Perle traegt ihre echte Spalte (kein interpolierter Zwischenwert)',
    pearls.every((p) => near(p.col.distM, p.distM, 1e-9) && p.col.etaMs === p.atMs));
  add('die Stundenperlen liegen auf vollen Stunden',
    pearls.filter((p) => p.kind === 'hour').every((p) => {
      const d = new Date(p.atMs);
      // Naechste Spalte zur vollen Stunde: hoechstens ein halber Sample-Abstand daneben.
      const gap = (scene.endMs - scene.startMs) / (scene.columns.length - 1);
      return Math.abs(d.getTime() - Math.round(d.getTime() / 3600_000) * 3600_000) <= gap;
    }));
  add('keine Stundenperle faellt mit Start oder Ziel zusammen',
    pearls.filter((p) => p.kind === 'hour').every((p) => p.distM > 0 && p.distM < scene.totalM));
  add('der Deckel wird eingehalten und die Raender bleiben (mobil 3)', (() => {
    const m = buildPearls(scene.columns, 3);
    return m.length === 3 && m[0].kind === 'start' && m[2].kind === 'goal';
  })());
  add('keine zwei Perlen kleben aneinander (im Browser gesehen: 21:50 und 22:00)',
    pearls.every((p, i) => i === 0 || p.distM - pearls[i - 1].distM >= scene.totalM * PEARL_MIN_GAP - 1e-6),
    pearls.map((p) => (p.distM / 1000).toFixed(1)).join(' / '));
  add('eine Stundenperle dicht am Start wird verworfen, nicht verschoben', (() => {
    // Tour mit einer vollen Stunde 6 Minuten nach dem Start.
    const near0 = makeSamples(24, { rainFrom: 99, rainTo: 99 });
    const shift = START - (START % 3600_000) + 3600_000 - START - 6 * 60_000;
    for (const s2 of near0) s2.etaMs += shift;
    const sc = buildScene({ samples: near0, points, countries: ['DE'], coverage: { snowLine: false } });
    const pl = buildPearls(sc.columns, 6);
    return pl.every((p, i) => i === 0 || p.distM - pl[i - 1].distM >= sc.totalM * PEARL_MIN_GAP - 1e-6);
  })());
  add('die Liste darf enger stehen als die Szene (Zeichen-Auflage ist nicht fachlich)', (() => {
    const wide = buildPearls(scene.columns, 9, 0);
    return wide.length >= pearls.length;
  })());
  add('auch ohne Abstandsregel steht keine Spalte zweimal', (() => {
    const wide = buildPearls(scene.columns, 12, 0);
    const ids = wide.map((p) => p.col.index);
    return new Set(ids).size === ids.length;
  })());
  add('eine volle Stunde direkt nach dem Start dupliziert die Startzeile nicht', (() => {
    const s2 = makeSamples(24, { rainFrom: 99, rainTo: 99 });
    const shift = 3600_000 - (START % 3600_000) - 60_000; // volle Stunde 1 min nach Start
    for (const x of s2) x.etaMs += shift;
    const sc = buildScene({ samples: s2, points, countries: ['DE'], coverage: { snowLine: false } });
    const wide = buildPearls(sc.columns, 12, 0);
    const ids = wide.map((p) => p.col.index);
    return new Set(ids).size === ids.length;
  })());
  add('zwei Karten ueber nahen Punkten decken sich nicht (Pixel, nicht Kilometer)', (() => {
    // 1,3 km auseinander, Karte 132 px breit — im Browser lagen sie uebereinander.
    const boxes = layoutCards([{ x: 500, y: 400 }, { x: 560, y: 402 }], { w: 132, h: 48, lift: 78, minY: 50, stepY: 56 });
    return Math.abs(boxes[0].y - boxes[1].y) >= 48;
  })());
  add('weit auseinander liegende Karten werden NICHT unnoetig gehoben', (() => {
    const boxes = layoutCards([{ x: 100, y: 400 }, { x: 600, y: 400 }], { w: 132, h: 48, lift: 78, minY: 50, stepY: 56 });
    return boxes[0].y === boxes[1].y && boxes[0].y === 322;
  })());
  add('keine Karte wandert aus dem Bild (Deckel minY)', (() => {
    const many = Array.from({ length: 8 }, (_, i) => ({ x: 500 + i, y: 300 }));
    return layoutCards(many, { w: 132, h: 48, lift: 78, minY: 40, stepY: 56 }).every((b) => b.y >= 40);
  })());
  add('an der Decke wird nicht auf eine schon liegende Karte geklemmt', (() => {
    // Vor der Korrektur wurde erst gehoben und DANN geklemmt — die zweite Karte
    // landete dadurch genau auf der ersten (Browser-Fund am Tablet-Ziel).
    const boxes = layoutCards([{ x: 500, y: 200 }, { x: 520, y: 150 }], { w: 132, h: 48, lift: 78, minY: 100, stepY: 56 });
    return boxes[0].y === 122 && boxes[1].y === 100 && Math.abs(boxes[0].y - boxes[1].y) < 48;
  })());
  add('unter der Decke wird weiterhin ausgewichen', (() => {
    const boxes = layoutCards([{ x: 500, y: 400 }, { x: 520, y: 400 }], { w: 132, h: 48, lift: 78, minY: 50, stepY: 56 });
    return boxes[0].y === 322 && boxes[1].y === 266;
  })());
  add('ein belegter Kasten (Ebenen-Beschriftung) wird gemieden, aber nicht mitgeliefert', (() => {
    // Die Wolkenbasis traegt das Wort „abgeleitet" — eine Perle darf es nicht verdecken.
    const reserved = [{ x: 500, y: 320, w: 260, h: 20 }];
    const boxes = layoutCards([{ x: 500, y: 400 }], { w: 132, h: 48, lift: 78, minY: 50, stepY: 56, reserved });
    return boxes.length === 1 && boxes[0].y === 266;
  })());
  add('ohne belegten Kasten bleibt das Ergebnis unveraendert (Rueckwaertskompatibilitaet)', (() => {
    const a = layoutCards([{ x: 500, y: 400 }, { x: 560, y: 402 }], { w: 132, h: 48, lift: 78, minY: 50, stepY: 56 });
    const b = layoutCards([{ x: 500, y: 400 }, { x: 560, y: 402 }], { w: 132, h: 48, lift: 78, minY: 50, stepY: 56, reserved: [] });
    return JSON.stringify(a) === JSON.stringify(b) && a[0].y === 322 && a[1].y === 268;
  })());
  add('die Reihenfolge der Karten bleibt (es wird gehoben, nicht vertauscht)', (() => {
    const boxes = layoutCards([{ x: 100, y: 400 }, { x: 140, y: 400 }, { x: 180, y: 400 }], { w: 132, h: 48, lift: 78, minY: 20, stepY: 56 });
    return boxes[0].x === 100 && boxes[1].x === 140 && boxes[2].x === 180;
  })());
  add('columnAtEta findet die Spalte zur Uhrzeit zurueck', (() => {
    const c = scene.columns[9];
    return columnAtEta(scene.columns, c.etaMs)?.distM === c.distM;
  })());
}

/* ==================== 8c · Zeitfenster-Liste ==================== */
console.log('\n— Dein Zeitfenster —');
{
  const pearls = buildPearls(scene.columns, 6);
  const rows = buildTimeline(pearls, rainWindows(scene.columns), scene.warnZones);
  add('eine Zeile je Perle', rows.length === pearls.length);
  add('jede Zeile traegt Text — Farbe allein sagt nichts',
    rows.every((r) => typeof r.text === 'string' && r.text.trim().length > 3));
  add('jeder Ton ist einer der drei bekannten', rows.every((r) => ['ok', 'watch', 'alert'].includes(r.tone)));
  add('die Startzeile ist als Start benannt', rows[0].text.startsWith('Start · '));
  add('jede Stundenzeile sagt, WO man dann ist (die Frage von 1b)',
    rows.filter((r) => r.kind === 'hour').every((r) => /^km \d/.test(r.text) || /km \d/.test(r.text)),
    rows.find((r) => r.kind === 'hour')?.text);
  add('auch eine Regenzeile beginnt mit der eigenen Position',
    rows.filter((r) => r.kind === 'hour' && r.text.includes('(km ')).every((r) => /^km \d/.test(r.text)));
  add('die letzte Zeile ist als Ankunft benannt', rows[rows.length - 1].text.startsWith('Ankunft · '));

  // Im Fixture liegen Warnung UND Regen auf km 8..14 — die Warnung hat Vorrang.
  const inWarn = rows.find((r) => r.distM >= 8000 && r.distM <= 14_000);
  add('die amtliche Warnung schlaegt den Regen (Prioritaet)',
    !!inWarn && inWarn.text.includes('Sturmböen') && inWarn.tone === 'alert', inWarn?.text);

  const rainOnly = makeSamples(24, { withWarnings: false });
  const rainScene = buildScene({ samples: rainOnly, points, countries: ['DE'], coverage: { snowLine: false } });
  const rainRows = buildTimeline(buildPearls(rainScene.columns, 6), rainWindows(rainScene.columns), rainScene.warnZones);
  const wetRow = rainRows.find((r) => /Regen \(km /.test(r.text));
  add('ohne Warnung nennt die Zeile das Regenfenster', !!wetRow, wetRow?.text);
  add('zwei Stunden im selben Fenster ergeben nicht zweimal denselben Text', (() => {
    const inSame = rainRows.filter((r) => /Regen \(km /.test(r.text) && r.kind === 'hour');
    return new Set(inSame.map((r) => r.text)).size === inSame.length;
  })());

  const gusty = makeSamples(24, { rainFrom: 99, rainTo: 99, withWarnings: false });
  for (const s2 of gusty) s2.weather.gustMps = 20; // 72 km/h
  const gustScene = buildScene({ samples: gusty, points, countries: ['DE'], coverage: { snowLine: false } });
  const gustRows = buildTimeline(buildPearls(gustScene.columns, 6), [], []);
  add(`Boeen ueber ${GUST_ALERT_KMH} km/h werden benannt und als alert gefuehrt`,
    gustRows.every((r) => r.tone === 'alert' && r.text.includes('Böen')), gustRows[1]?.text);
}

/* ==================== 8d · Bessere Startzeit ==================== */
console.log('\n— Besserer Start (B11/B12) —');
{
  const mk = (offsetMin, wetMin, extra = {}) => ({
    offsetMin, wetMin, peakMmH: extra.peak ?? 2.4, totalMm: extra.total ?? wetMin / 20,
    peakGustMps: extra.gust ?? 12, radarShare: 0.5,
    coverage: extra.coverage ?? 1, complete: extra.complete ?? true,
  });

  add('ohne vollstaendige Basis gibt es keine Empfehlung',
    startAdvice([mk(0, 40, { complete: false }), mk(60, 0)], START) === null);
  add('ohne Kandidaten gibt es keine Empfehlung', startAdvice([mk(0, 40)], START) === null);

  const below = [mk(0, 40), mk(30, 40 - (ADVICE_MIN_GAIN_MIN - 1))];
  add('eine Ersparnis unter der Schwelle wird nicht empfohlen', startAdvice(below, START) === null);
  add('die Notiz nennt die Schwelle', startAdviceNote(below).includes(String(ADVICE_MIN_GAIN_MIN)));

  const real = [mk(-60, 55), mk(0, 47), mk(60, 12, { peak: 0.3, gust: 12.4 }), mk(90, 12, { peak: 0.3 })];
  const a = startAdvice(real, START);
  add('die beste Zeit wird gefunden', a?.offsetMin === 60, String(a?.offsetMin));
  add('bei Gleichstand gewinnt der kleinere Versatz (am wenigsten am Plan geruettelt)',
    startAdvice([mk(0, 47), mk(90, 12), mk(60, 12)], START)?.offsetMin === 60);
  add('die neue Startzeit ist Start + Versatz', a && a.newStartMs === START + 60 * 60_000);
  add('die Begruendung nennt beide Regenzeiten', a && a.reason.includes('12') && a.reason.includes('47'));
  add('die Begruendung nennt den Fahrzeit-Vorbehalt (B12)', a && a.reason.includes('Fahrzeiten'));
  add('die Boeen bleiben "unveraendert", wenn der Unterschied unter 1 m/s liegt', a?.gustWord === 'unverändert');
  add('staerkere Boeen werden benannt',
    startAdvice([mk(0, 47), mk(60, 12, { gust: 18 })], START)?.gustWord === 'stärker');
  add('unvollstaendige Kandidaten werden nie empfohlen',
    startAdvice([mk(0, 47), mk(60, 0, { complete: false })], START) === null);
  add('bei trockener Basis sagt die Notiz genau das',
    startAdviceNote([mk(0, 0), mk(60, 0)]).includes('trocken'));
  add('eine luekenhafte Abdeckung steht im Satz, statt Sicherheit vorzutaeuschen', (() => {
    const a2 = startAdvice([mk(0, 47, { coverage: 0.92 }), mk(60, 12, { coverage: 0.92 })], START);
    return !!a2 && /8 % der Strecke/.test(a2.reason);
  })(), startAdvice([mk(0, 47, { coverage: 0.92 }), mk(60, 12, { coverage: 0.92 })], START)?.reason.slice(-60));
  add('volle Abdeckung haengt keinen Vorbehalt an',
    !/kein Wert vor/.test(startAdvice([mk(0, 47), mk(60, 12)], START).reason));
  add('ohne vergleichbaren Eintrag nennt die Notiz die erreichte Abdeckung',
    /nur 60 % der Strecke/.test(startAdviceNote([mk(0, 47, { complete: false, coverage: 0.6 })])));
  add('das Kandidatenfenster liegt in der Reserve, die ohnehin geholt wird (B11)',
    START_OFFSETS_MIN.length === 17 && Math.max(...START_OFFSETS_MIN) === 120 && Math.min(...START_OFFSETS_MIN) === -120);
  add('das Fenster ist ein 15-Minuten-Raster',
    START_OFFSETS_MIN.every((m) => m % 15 === 0));

  // Zeitanteile: teleskopiert exakt auf die Gesamtdauer.
  const dur = sampleDurationsMin(samples);
  const totalMin = (samples[samples.length - 1].etaMs - samples[0].etaMs) / 60_000;
  add('die Zeitanteile summieren sich auf die Tourdauer', near(dur.reduce((a2, b) => a2 + b, 0), totalMin, 1e-6),
    `${dur.reduce((a2, b) => a2 + b, 0).toFixed(3)} vs ${totalMin.toFixed(3)}`);
  add('die Raender zaehlen nur ihre halbe Spanne',
    near(dur[0], (samples[1].etaMs - samples[0].etaMs) / 2 / 60_000, 1e-9));
  add('ein einzelnes Sample hat keine Dauer', sampleDurationsMin([{ etaMs: START }])[0] === 0);
}

/* ==================== 8e · Radar-Vorlauf (B9) ==================== */
console.log('\n— Radar-Vorlauf je Land —');
{
  const end = scene.endMs;
  add('ohne geladenen Vorlauf sagt der Satz genau das',
    radarHorizonNote([], end).includes('Kein Radar-Vorlauf'));
  const de = { country: 'DE', source: 'radolan_rv', frameCount: 25, validFromMs: START, validUntilMs: START + 2 * 3600_000 };
  add('endet der Vorlauf vor der Ankunft, nennt der Satz die Uhrzeit',
    radarHorizonNote([de], end).includes(hhmm(de.validUntilMs)) && radarHorizonNote([de], end).includes('danach Modell'));
  add('deckt der Vorlauf die Tour, sagt der Satz das',
    radarHorizonNote([{ ...de, validUntilMs: end + 60_000 }], end).includes('ganze Tour'));
  const ch = { country: 'CH', source: 'meteoswiss_rzc', frameCount: 1, validFromMs: START, validUntilMs: START };
  add('ein einzelnes Radarbild ist kein Vorlauf und wird so benannt',
    radarHorizonNote([ch], end).includes('kein Vorlauf'));
  add('bei zwei Laendern nennt der Satz beide',
    radarHorizonNote([de, ch], end).includes('Deutschland') && radarHorizonNote([de, ch], end).includes('Schweiz'));
  add('das Abzeichen nimmt den fruehesten echten Vorlauf',
    radarHorizonChip([{ ...de, validUntilMs: START + 3 * 3600_000 }, de], end).includes(hhmm(de.validUntilMs)));
  add('ohne echten Vorlauf sagt das Abzeichen "nur Modell"',
    radarHorizonChip([ch], end).includes('nur Modell'));
}

/* ==================== 8f · Ehrlichkeit des Korridors ==================== */
console.log('\n— Was der Korridor NICHT behauptet (B8/B10) —');
{
  const corr = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'corridor.ts'), 'utf8');
  const view1b = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Route3DView.tsx'), 'utf8');
  add('corridor.ts begruendet die beiden Weglassungen am Audit',
    corr.includes('B10') && corr.includes('B8') && corr.includes('audit/route-3d.md'));
  const corrCode = codeOnly(corr);
  const viewCode = codeOnly(view1b);
  const sceneCode = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Scene3D.tsx'), 'utf8'));
  add('keine Zuggeschwindigkeit ueber Grund im gerenderten Code (B10)',
    !/Zug\s*\d/.test(corrCode + sceneCode + viewCode)
    && !/zugKmh|cellSpeed|stormMotion/.test(corrCode + sceneCode + viewCode));
  add('keine Zellellipse in der Szene (B10)',
    !/<ellipse/.test(sceneCode));
  add('keine "Treffer-Wahrscheinlichkeit" im gerenderten Code (B8)',
    !/Treffer-?[Ww]ahrscheinlichkeit/.test(corrCode + sceneCode + viewCode));
  add('kein Prozentzeichen an einer Regenaussage (B8)',
    !/Regen[^<\n]{0,40}%/.test(viewCode));
  add('das Diagramm sagt ausdruecklich, dass es keine Wahrscheinlichkeit ist',
    view1b.includes('keine Wahrscheinlichkeit'));
  add('corridor.ts bleibt JSX-frei (headless importierbar)',
    !corr.includes("from 'react'") && !corr.includes('tourUi'));
  add('der Modus-Umschalter meldet seinen Zustand',
    view1b.includes("aria-pressed={mode === 'zeit'}") && view1b.includes("aria-pressed={mode === 'wetter'}"));
  add('Modus und Ebenen ueberleben den Besuch (localStorage, mit Rueckfall)',
    view1b.includes('MODE_STORE_KEY') && view1b.includes('LAYER_STORE_KEY') && view1b.includes('catch'));
  add('die Zeitbahn ist EINE Instanz, nur ihre Stellung wechselt',
    (view1b.match(/label="Uhrzeit"/g) || []).length === 1);
  add('die Anreicherung reicht Vorlauf und Startfenster durch (1b-1/1b-2)', (() => {
    const en = readFileSync(join(ROOT, 'src', 'pointForecast', 'weatherEnrichment.ts'), 'utf8');
    return en.includes('radar: RadarHorizon[]') && en.includes('startWindow: StartWindowEntry[]')
      && en.includes('evaluateStartOffsets');
  })());
  add('die Bewertung laeuft INNERHALB der Anreicherung (sonst kostet sie Abrufe, B11)', (() => {
    const en = readFileSync(join(ROOT, 'src', 'pointForecast', 'weatherEnrichment.ts'), 'utf8');
    const idx = en.indexOf('function evaluateStartOffsets');
    return idx > 0 && en.slice(idx).includes('radarByCountry') && en.slice(idx).includes('forecasts');
  })());
  add('die Tour reicht das Kandidatenfenster an die Anreicherung', (() => {
    const tv = readFileSync(join(ROOT, 'src', 'route', 'TourView.tsx'), 'utf8');
    return tv.includes('startOffsetsMin: START_OFFSETS_MIN');
  })());
}


/* ============ 8g · „ohne Daten" heisst fehlende Quelle, nicht leerer Layer ============ */
console.log('\n— leerer Layer vs. fehlende Quelle (auch in 1a) —');
{
  const dryDE = buildScene({
    samples: makeSamples(24, { rainFrom: 99, rainTo: 99, withWarnings: false }), points,
    countries: ['DE'], coverage: { snowLine: false },
  });
  add('trockene Strecke: der Regen-Layer sagt „trocken", nicht „ohne Daten"',
    dryDE.availability.rain.any === false && dryDE.availability.rain.emptyLabel === 'trocken');
  add('und sein Satz sagt dasselbe',
    dryDE.availability.rain.note.includes('trocken'));
  add('DE ohne Warnung: „keine Warnung" — die Quelle hat geliefert',
    dryDE.availability.warnings.any === false && dryDE.availability.warnings.emptyLabel === 'keine Warnung');
  add('AT/CH: da fehlt die Quelle wirklich, also KEIN Ersatzwort (es bleibt „ohne Daten")', (() => {
    const at = buildScene({
      samples: makeSamples(24, { rainFrom: 99, rainTo: 99, withWarnings: false }), points,
      countries: ['AT'], coverage: { snowLine: true },
    });
    return at.availability.warnings.any === false && at.availability.warnings.emptyLabel === undefined;
  })());
  add('ein Layer MIT Werten traegt gar kein Ersatzwort', (() => {
    const wet = buildScene({ samples: makeSamples(24, { rainFrom: 3, rainTo: 9 }), points, countries: ['DE'], coverage: { snowLine: false } });
    return wet.availability.rain.any === true && wet.availability.rain.emptyLabel === undefined && wet.availability.rain.note === '';
  })());
  add('die Ansicht reicht das Wort an beide Chip-Saetze durch (1a wie 1b)', (() => {
    const v = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Route3DView.tsx'), 'utf8');
    return v.includes('empty: av.rain.emptyLabel') && v.includes('empty: av.warnings.emptyLabel')
      && v.includes("empty: 'trocken'");
  })());
}

/* ==================== 9 · Tour im Gerätespeicher (V-R3D-1) ==================== */
console.log('\n— Tour ueberlebt den Reload (V-R3D-1) —');
{
  const NOW = Date.UTC(2026, 7, 28, 21, 0, 0);
  const mkTrack = (n = 40) => {
    const points = [];
    for (let i = 0; i < n; i++) {
      const p = { lat: 47 + i * 1e-3, lon: 11 + i * 2e-3, ele: 600 + i * 12.5, dist: i * 210.5 };
      if (i % 3 === 0) p.time = 1_700_000_000_000 + i * 60_000;
      points.push(p);
    }
    return {
      points,
      samples: [0, 5, 13, 27, n - 1].map((i) => points[i]),
      waypoints: [{ dist: 1052.5, lat: 47.005, lon: 11.01, name: 'Huette' }],
      meta: {
        name: 'Test', sourceFormat: 'gpx', totalDistanceM: points[n - 1].dist,
        ascentM: 500, descentM: 0, minEleM: 600, maxEleM: 1087.5,
        pointCount: n, sampleCount: 5, elevationEnriched: true, elevationAvailable: true,
        hasTime: true, startTime: null, endTime: null, terrain: 'alpin',
      },
    };
  };
  const plan = {
    direction: 'reverse', typeId: 'hiking_alpine',
    profile: { flatKmh: 3.5, ascentMh: 300 }, breakCfg: { auto: true, custom: [] },
    startMs: NOW + 3 * 3600_000, ebikeCfg: { capacityWh: 500 }, weatherRequested: true,
  };
  const track = mkTrack();
  const packed = packTour(track, plan, { fileLabel: 'tour.gpx', savedMs: NOW });
  const back = unpackTour(packed);

  add('der Track kommt Punkt fuer Punkt zurueck', !!back && back.track.points.length === track.points.length
    && track.points.every((p, i) => {
      const q = back.track.points[i];
      return q.lat === p.lat && q.lon === p.lon && q.ele === p.ele && q.dist === p.dist && (q.time ?? null) === (p.time ?? null);
    }));
  add('Samples stehen als INDIZES in der Ablage, nicht als Kopien',
    packed.sampleIdx instanceof Uint32Array && packed.sampleIdx.length === track.samples.length
    && [...packed.sampleIdx].join(',') === '0,5,13,27,39');
  add('nach dem Entpacken sind Samples wieder DIESELBEN Objekte wie in points',
    !!back && back.track.samples.length === 5
    && back.track.samples.every((sp) => back.track.points.includes(sp)));
  add('die Spalten sind Float64Array (100k Punkte ≈ 3,2 MB statt ~6,5 MB JSON)',
    packed.lat instanceof Float64Array && packed.lon instanceof Float64Array
    && packed.ele instanceof Float64Array && packed.dist instanceof Float64Array);
  add('Wegpunkte und Meta bleiben erhalten',
    !!back && back.track.waypoints.length === 1 && back.track.waypoints[0].name === 'Huette'
    && back.track.meta.terrain === 'alpin' && back.track.meta.pointCount === 40);
  add('der Plan kommt vollstaendig zurueck (Richtung, Art, Pausen, Startzeit, Ergebnis-Zustand)',
    !!back && back.plan.direction === 'reverse' && back.plan.typeId === 'hiking_alpine'
    && back.plan.weatherRequested === true && back.plan.startMs === plan.startMs
    && back.plan.profile.flatKmh === 3.5 && back.plan.breakCfg.auto === true);
  add('Dateiname und Speicherzeitpunkt sind dabei (die Notiz nennt beide)',
    !!back && back.fileLabel === 'tour.gpx' && back.savedMs === NOW);

  // Der eine Teil, der NICHT mitgespeichert werden darf.
  const keys = new Set();
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 4 || ArrayBuffer.isView(o)) return;
    for (const k of Object.keys(o)) { keys.add(k); walk(o[k], d + 1); }
  };
  walk(packed);
  add('kein Wetter in der Ablage — es waere nach Minuten falsch',
    ![...keys].some((k) => /weather|precip|temperature|wind|gust|snowLine|uvIndex/i.test(k) && k !== 'weatherRequested'),
    [...keys].filter((k) => /weather/i.test(k)).join(','));
  add('tourStore.ts kennt die Wetter-Kette gar nicht', (() => {
    const src = readFileSync(join(ROOT, 'src', 'route', 'tourStore.ts'), 'utf8');
    return !/weatherEnrichment|pointForecast|SampleWeather/.test(src);
  })());

  // Ein kaputter oder fremder Eintrag darf nie die App mitreissen.
  add('fremde Schema-Version wird verworfen', unpackTour({ ...packed, v: TOUR_STORE_VERSION + 1 }) === null);
  add('ungleich lange Spalten werden verworfen',
    unpackTour({ ...packed, lon: packed.lon.slice(0, 5) }) === null);
  add('eine Strecke mit einem Punkt wird verworfen',
    unpackTour({ ...packed, lat: packed.lat.slice(0, 1), lon: packed.lon.slice(0, 1), ele: packed.ele.slice(0, 1), dist: packed.dist.slice(0, 1), time: null }) === null);
  add('gar kein Eintrag ist kein Fehler', unpackTour(null) === null && unpackTour(undefined) === null);
  add('Sample-Indizes ausserhalb der Strecke werden uebergangen, nicht geglaubt', (() => {
    const bad = unpackTour({ ...packed, sampleIdx: Uint32Array.from([0, 5, 9999, 39]) });
    return !!bad && bad.track.samples.length === 3;
  })());

  add('frisch gespeichert gilt', isFreshEntry(NOW, NOW));
  add('sechs Tage alt gilt noch', isFreshEntry(NOW - 6 * 24 * 3600_000, NOW));
  add('acht Tage alt gilt nicht mehr', !isFreshEntry(NOW - 8 * 24 * 3600_000, NOW));
  add('das Alterslimit ist sieben Tage', TOUR_MAX_AGE_MS === 7 * 24 * 3600_000);
  add('ein Eintrag aus der Zukunft (Uhr verstellt) gilt nicht', !isFreshEntry(NOW + 3600_000, NOW));

  // Startzeit: Massstab ist `horizonState`, nicht eine zweite eigene Regel.
  add('eine gueltige Startzeit bleibt stehen', (() => {
    const r = restoreStartMs(NOW + 2 * 3600_000, NOW);
    return r.startMs === NOW + 2 * 3600_000 && r.moved === false;
  })());
  add('eine halbe Stunde in der Vergangenheit bleibt auch stehen (Tour laeuft)', (() => {
    const r = restoreStartMs(NOW - 30 * 60_000, NOW);
    return r.startMs === NOW - 30 * 60_000 && r.moved === false;
  })());
  add('drei Stunden vorbei rueckt auf jetzt — und sagt es', (() => {
    const r = restoreStartMs(NOW - 3 * 3600_000, NOW);
    return r.startMs === NOW && r.moved === true;
  })());
  add('jenseits des Vorhersage-Horizonts rueckt ebenfalls auf jetzt', (() => {
    const r = restoreStartMs(NOW + 20 * 24 * 3600_000, NOW);
    return r.startMs === NOW && r.moved === true;
  })());
  add('Unsinn statt Zahl rueckt auf jetzt', restoreStartMs(NaN, NOW).startMs === NOW);

  add('ohne Browser ist der Speicher aus (DOM-frei importierbar)', tourStoreEnabled() === false);
  add('Kill-Switch ist dokumentiert und heisst `tour`', (() => {
    const src = readFileSync(join(ROOT, 'src', 'route', 'tourStore.ts'), 'utf8');
    return src.includes("get('tour')") && src.includes("getItem('tour')");
  })());

  // Verdrahtung
  const tv = readFileSync(join(ROOT, 'src', 'route', 'TourView.tsx'), 'utf8');
  const rp = readFileSync(join(ROOT, 'src', 'route', 'RoutePage.tsx'), 'utf8');
  add('gespeichert wird entprellt, nicht bei jedem Reglerzug',
    tv.includes('TOUR_SAVE_DEBOUNCE_MS') && tv.includes('setTimeout') && tv.includes('clearTimeout'));
  add('gespeichert wird der ORIGINAL-Track plus Richtung, nicht der gedrehte',
    /saveTour\(packTour\(track, plan/.test(tv) && /direction, typeId, profile, breakCfg, startMs, ebikeCfg, weatherRequested/.test(tv));
  add('wiederhergestellt wird nur, solange nichts anderes laeuft',
    rp.includes("prev.kind === 'idle'"));
  add('„Andere Datei" und „verwerfen" loeschen den Eintrag wirklich',
    (rp.match(/clearTour\(\)/g) || []).length >= 2 && rp.includes('discardTour'));
  add('die wiederhergestellte Tour sagt, woher sie kommt',
    tv.includes('Zuletzt geplante Tour wiederhergestellt') && tv.includes('verwerfen'));
  add('und sie sagt es auch, wenn die Startzeit ruecken musste',
    tv.includes('startMoved') && /Startzeit lag außerhalb der Vorhersage/.test(tv));
  add('das Wetter wird nach dem Wiederherstellen neu geholt, nicht behauptet',
    tv.includes('Das Wetter wird frisch geholt'));
}

/* ============== 10 · Rahmen und Szene sind zwei Fragen (V-R3D-3) ============== */
console.log('\n— „Startzeit uebernehmen" faellt nicht mehr auf 2D zurueck (V-R3D-3) —');
{
  const tv = readFileSync(join(ROOT, 'src', 'route', 'TourView.tsx'), 'utf8');
  const tvCode = codeOnly(tv);
  add('die aktive Ansicht haengt NICHT am Wetterzustand',
    /const in3d = showResult && view === '3d';/.test(tvCode));
  add('die Szene haengt am Wetterzustand — und nur sie',
    /const show3d = in3d && weatherState\.kind === 'ready';/.test(tvCode));
  add('Krume und Mobil-Kopf folgen der Ansicht',
    /const crumb = in3d \?/.test(tvCode) && /const mobileHeader = in3d \?/.test(tvCode));
  add('der Wartezweig steht VOR dem 2D-Ergebnis (sonst greift er nie)',
    tvCode.indexOf('} else if (in3d) {') > 0
    && tvCode.indexOf('} else if (in3d) {') < tvCode.indexOf('} else if (showResult) {'));
  add('gezeichnet wird weiterhin nur mit fertigem Wetter UND Zeitplan',
    /if \(show3d && weatherState\.kind === 'ready' && timing\)/.test(tvCode));
  add('das Wartefeld zeigt keine Wetterwerte (der alte Stand gilt nicht mehr)', (() => {
    const i = tvCode.indexOf('function ThreeDStandby');
    if (i < 0) return false;
    const body = tvCode.slice(i);
    return !/°|mm\/h|m\/s|displaySamples|weatherState\.samples/.test(body);
  })());
  add('das Wartefeld nennt einen Ausweg, wenn das Wetter scheitert',
    /Zum 2D-Ergebnis/.test(tv));
  add('seine Klassen stehen in routeDeck.css — route3d.css laedt erst mit dem Lazy-Chunk', (() => {
    const deck = readFileSync(join(ROOT, 'src', 'route', 'routeDeck.css'), 'utf8');
    const r3 = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'route3d.css'), 'utf8');
    return deck.includes('.r3-standby') && deck.includes('.r3-restore') && !r3.includes('.r3-standby');
  })());
  add('das Wartefeld haelt die Hoehe, damit der Rahmen nicht springt', (() => {
    const deck = readFileSync(join(ROOT, 'src', 'route', 'routeDeck.css'), 'utf8');
    return /\.r3-standby \{[^}]*min-height/.test(deck);
  })());
  add('seine Laufleiste steht bei `prefers-reduced-motion` still', (() => {
    const deck = readFileSync(join(ROOT, 'src', 'route', 'routeDeck.css'), 'utf8');
    const i = deck.indexOf('prefers-reduced-motion');
    return i > 0 && deck.slice(i, i + 200).includes('r3-standby-bar');
  })());
}

/* ============================ 11 · Bestand mitgeprüft (B6) ============================ */
console.log('\n— Vertikalschnitt-Kern (bis R3D unverdrahtet) —');
{
  const r = verifyCrossSection();
  for (const c of r.checks) add(`[crossSection] ${c.case}`, c.ok, c.detail);
}

/* ============================ 12 · Go/No-Go (1c, §17) ============================ */
console.log('\n— Grenzwerte: Bewertung je Spalte und Rangfolge (C3) —');
{
  const ctx = { warnKnown: true };
  const base = () => ({
    index: 0, distM: 0, terrainM: 1000, etaMs: START, lat: 47, lon: 10,
    tempC: 5, apparentC: 5, windKmh: 20, gustKmh: 30, windDirDeg: 250, windRel: null,
    windComponentKmh: null, precipMmH: 0, precipSource: null, precipType: 'none',
    humidityPct: 70, cloudBaseM: 1500, cloudCoverPct: 50, snowLineM: null, batteryPct: null,
    warnLevel: null,
    confidence: { temperature: 0.8, wind: 0.7, gust: 0.7, precipitation: 0.8 },
  });

  add('deutlich unter dem Grenzwert → Go', evaluateColumn(base(), { gust: 60 }, ctx).status === 'go');
  add('innerhalb der Spanne → knapp',
    evaluateColumn({ ...base(), gustKmh: 57 }, { gust: 60 }, ctx).status === 'knapp');
  add('über dem Grenzwert → No-Go',
    evaluateColumn({ ...base(), gustKmh: 65 }, { gust: 60 }, ctx).status === 'no-go');

  // Die Rangfolge ist der Kern von C3 — beide Richtungen einzeln geprüft.
  const shakyOver = evaluateColumn(
    { ...base(), gustKmh: 65, confidence: { ...base().confidence, gust: 0.2 } }, { gust: 60 }, ctx);
  add('Überschreitung bleibt No-Go, auch bei Konfidenz 0,2 (nicht „unklar")', shakyOver.status === 'no-go');

  const shakyOk = evaluateColumn(
    { ...base(), confidence: { ...base().confidence, gust: 0.2 } }, { gust: 60 }, ctx);
  add('geringe Konfidenz wird nie zu „Go" aufgelöst', shakyOk.status === 'unklar', shakyOk.status);
  add('… und nennt den Grund „confidence"', shakyOk.unclear[0]?.why === 'confidence');

  const shakyNear = evaluateColumn(
    { ...base(), gustKmh: 57, confidence: { ...base().confidence, gust: 0.2 } }, { gust: 60 }, ctx);
  add('„unklar" schlägt „knapp"', shakyNear.status === 'unklar');

  const noVal = evaluateColumn({ ...base(), gustKmh: null }, { gust: 60 }, ctx);
  add('fehlender Wert ist „unklar", nicht „Go"', noVal.status === 'unklar');
  add('… und nennt den Grund „missing"', noVal.unclear[0]?.why === 'missing');

  // Der Warn-Grenzwert ist DE-only: ohne Quelle ist „keine Warnung" keine Aussage.
  add('Warn-Grenzwert ohne Quelle (AT/CH) → unklar, nicht Go',
    evaluateColumn(base(), { warn: 2 }, { warnKnown: false }).status === 'unklar');
  add('Warn-Grenzwert mit Quelle und ohne Warnung → Go',
    evaluateColumn(base(), { warn: 2 }, { warnKnown: true }).status === 'go');
  add('Warnstufe über dem Grenzwert → No-Go',
    evaluateColumn({ ...base(), warnLevel: 4 }, { warn: 2 }, { warnKnown: true }).status === 'no-go');

  const multi = evaluateColumn(
    { ...base(), gustKmh: 80, precipMmH: 2.2 }, { gust: 60, rain: 2 }, ctx);
  add('mehrere Treffer stehen schlimmster zuerst (vergleichbar über Einheiten)',
    multi.hits[0]?.id === 'gust' && multi.hits[0].severity > multi.hits[1].severity,
    `${multi.hits.map((h) => `${h.id}:${h.severity.toFixed(1)}`).join(' ')}`);

  add('Rangfolge no-go > unklar > knapp > go',
    STATUS_RANK['no-go'] > STATUS_RANK.unklar && STATUS_RANK.unklar > STATUS_RANK.knapp
      && STATUS_RANK.knapp > STATUS_RANK.go);
  add('jeder Zustand hat sein Wort (Farbe trägt nie allein)',
    ['go', 'knapp', 'unklar', 'no-go'].every((k) => typeof STATUS_WORD[k] === 'string' && STATUS_WORD[k].length > 1));
}

console.log('\n— Abschnitte (C10: ein Sample steht für seine Umgebung) —');
{
  const ctx = { warnKnown: true };
  // Böen laufen 32,4 → 54 km/h: ein Grenzwert von 45 teilt die Strecke.
  const secs = goSections(scene.columns, { gust: 45 }, ctx);
  add('die Strecke zerfällt in mehrere Abschnitte', secs.length >= 2, `${secs.length}`);
  add('sie decken die Strecke lückenlos ab',
    near(secs[0].fromM, scene.columns[0].distM, 1e-6)
    && near(secs[secs.length - 1].toM, scene.columns[scene.columns.length - 1].distM, 1e-6));
  add('sie stoßen ohne Lücke und ohne Überlappung aneinander',
    secs.every((s, i) => i === 0 || near(s.fromM, secs[i - 1].toM, 1e-6)));
  add('die Kante liegt auf der Mitte zum Nachbarn (geteilte Regel)', (() => {
    const s = secs[1];
    const e = segmentEdges(scene.columns, s.fromIdx, s.toIdx);
    return near(s.fromM, e.fromM, 1e-9) && near(s.toMs, e.toMs, 1);
  })());
  add('jeder Abschnitt trägt sein Zeitfenster', secs.every((s) => s.toMs >= s.fromMs));

  // Ein einzelnes abweichendes Sample: ohne Mitten-Regel hätte es Ausdehnung 0.
  const one = scene.columns.map((c, i) => (i === 10 ? { ...c, gustKmh: 99 } : { ...c, gustKmh: 10 }));
  const oneSec = goSections(one, { gust: 45 }, ctx).find((s) => s.status === 'no-go');
  add('ein einzelnes abweichendes Sample hat Ausdehnung > 0', !!oneSec && oneSec.toM > oneSec.fromM,
    oneSec ? `${Math.round(oneSec.toM - oneSec.fromM)} m` : 'kein Abschnitt');

  const bad = goSections(one, { gust: 45 }, ctx).find((s) => s.status === 'no-go');
  add('`lead` ist der ausschlaggebende Treffer', bad?.lead?.id === 'gust' && bad.lead.kind === 'over');
  add('`leadIdx` zeigt auf die Spalte, an der entschieden wurde', bad?.leadIdx === 10);

  add('overallStatus ist der schlechteste Abschnitt',
    overallStatus(secs) === secs.reduce((a, s) => (STATUS_RANK[s.status] > STATUS_RANK[a] ? s.status : a), 'go'));
  add('durchweg Go liefert keine Leitkarte (nichts einzurahmen)',
    leadSection(goSections(scene.columns, { gust: 200 }, ctx)) === null);
  add('sectionAtDist trifft den Abschnitt unter der Position', (() => {
    const s = secs[1];
    return sectionAtDist(secs, (s.fromM + s.toM) / 2)?.fromIdx === s.fromIdx;
  })());

  add('der Begründungssatz nennt IMMER den Grenzwert (C8)', (() => {
    const s = goSections(one, { gust: 45 }, ctx).find((x) => x.status === 'no-go');
    const t = reasonSentence(s);
    return t.includes('45') && t.includes('Grenzwert');
  })());
  add('der „unklar"-Satz bleibt in jeder Kombination deutsch', (() => {
    // „Zwischen km A und B Gefühlt ist zu unsicher" war keiner (§18.4).
    const mk = (u) => reasonSentence({ fromM: 3800, toM: 5800, status: 'unklar', lead: null, unclear: u });
    const a = mk([{ id: 'apparent', why: 'confidence' }]);
    const b = mk([{ id: 'rain', why: 'missing' }, { id: 'gust', why: 'confidence' }]);
    return a.includes('Prognose zu unsicher für die gefühlte Temperatur')
      && b.includes('kein Wert für Regen') && b.includes('für Böen')
      && !/für der |für den |Böen ist/.test(a + b);
  })());
  add('… weil jede Größe eine Nennform für Sätze trägt (nicht den Chip-Text)',
    LIMITS.every((d) => typeof d.noun === 'string' && d.noun.length > 2 && d.noun !== 'Gefühlt'));
  add('eine „unklar"-Zeile nennt den GRUND, nicht den Messwert', (() => {
    // Im Browser stand „unklar · Böen 35 km/h" bei Grenzwert 40 — die Zahl
    // hielt, unsicher war die Konfidenz. Der Wert beantwortet dort die
    // falsche Frage (§18.4).
    const shaky = unclearShort([{ id: 'gust', why: 'confidence' }]);
    const miss = unclearShort([{ id: 'rain', why: 'missing' }]);
    const both = unclearShort([{ id: 'rain', why: 'missing' }, { id: 'gust', why: 'confidence' }]);
    return shaky.includes('unsicher') && !/\d/.test(shaky)
      && miss.includes('kein Wert') && both.includes('ohne Wert') && both.includes('unsicher');
  })());
  add('… und die Ansicht setzt genau diesen Text', (() => {
    const v = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Route3DView.tsx'), 'utf8'));
    const i = v.indexOf('r3-sec-val');
    return v.slice(i, i + 260).includes("s.status === 'unklar'") && v.slice(i, i + 260).includes('unclearShort');
  })());
  add('… und bei „unklar" verspricht er keine Entscheidung', (() => {
    const cols = scene.columns.map((c) => ({ ...c, gustKmh: null }));
    const s = goSections(cols, { gust: 45 }, ctx)[0];
    return reasonSentence(s).includes('keine Entscheidung');
  })());
  add('… und nennt eine deckungsgleiche amtliche Warnung', (() => {
    const s = goSections(one, { gust: 45 }, ctx).find((x) => x.status === 'no-go');
    const t = reasonSentence(s, [{ fromM: 0, toM: 18_400, fromMs: START, toMs: START + 1e7, level: 3, event: 'Sturmböen', headline: 'x' }]);
    return t.includes('Stufe 3') && t.includes('Sturmböen');
  })());
}

console.log('\n— Chips: schlechtester Wert je Grenzwert —');
{
  const sums = summarizeLimits(scene.columns, { gust: 45, rain: 2 }, { warnKnown: true });
  const gust = sums.find((s) => s.id === 'gust');
  add('der Chip zeigt den schlechtesten Wert der Strecke', gust.kind === 'over' && gust.value > 45,
    `${gust.value?.toFixed(1)}`);
  add('… an der Spalte, an der er auftrat', scene.columns[gust.atIdx].gustKmh === gust.value);
  const rain = sums.find((s) => s.id === 'rain');
  add('ein gehaltener Grenzwert heißt „ok", nicht „ohne Daten"', rain.kind === 'ok' || rain.kind === 'near');
  add('eine fehlende Quelle heißt „missing" (nicht „alles in Ordnung")',
    summarizeLimits(scene.columns, { warn: 2 }, { warnKnown: false })[0].kind === 'missing');
}

console.log('\n— Startzeit-Suche gegen die Grenzwerte (C4) —');
{
  const mk = (offsetMin, over = {}) => ({
    offsetMin, wetMin: 0, peakMmH: 0.2, totalMm: 0.1,
    peakGustMps: 8, peakWindMps: 5, minApparentC: 6,
    radarShare: 1, coverage: 1, complete: true, ...over,
  });
  const limits = { gust: 40, rain: 2, apparent: 0 };

  add('alle prüfbaren Größen unter dem Grenzwert → besteht', entryPasses(mk(0), limits));
  add('eine Größe darüber → besteht nicht', !entryPasses(mk(0, { peakGustMps: 20 }), limits));
  add('gefühlte Temperatur unter dem Grenzwert → besteht nicht',
    !entryPasses(mk(0, { minApparentC: -3 }), limits));
  add('ein fehlender Wert gilt NICHT als bestanden',
    !entryPasses(mk(0, { minApparentC: null }), limits));

  const entries = [mk(-60, { peakGustMps: 20 }), mk(-30), mk(0), mk(30)];
  const hit = goStartSearch(entries, limits, START);
  add('die Suche nimmt den frühesten passenden Start', hit?.offsetMin === -30, `${hit?.offsetMin}`);
  add('… und rechnet ihn in eine Uhrzeit um', hit?.startMs === START - 30 * 60_000);
  add('unvollständige Kandidaten werden nicht empfohlen',
    goStartSearch([mk(-45, { complete: false }), mk(0)], limits, START)?.offsetMin === 0);
  add('ohne passenden Start gibt es keinen Vorschlag',
    goStartSearch([mk(0, { peakGustMps: 30 })], limits, START) === null);

  // Was die Suche NICHT prüfen kann, sagt sie (statt es zu verschweigen).
  const withWarn = goStartSearch(entries, { ...limits, warn: 2 }, START);
  add('die amtliche Warnung wird als ungeprüft ausgewiesen', withWarn?.unchecked.includes('warn'));
  add('… und ist deshalb ohne `fromStart` definiert', !limitDef('warn').fromStart);
  add('alle anderen Grenzwerte SIND prüfbar',
    LIMITS.filter((d) => d.id !== 'warn').every((d) => typeof d.fromStart === 'function'));
  add('die Notiz nennt die ungeprüfte Größe beim Namen',
    goStartNote(entries, withWarn).includes('Amtliche Warnung'));
  add('ohne Treffer sagt die Notiz genau das',
    goStartNote(entries, null).includes('Keine Startzeit'));
  add('ohne brauchbare Kandidaten sagt sie den Horizont',
    goStartNote([mk(0, { complete: false })], null).includes('Horizont'));
}

console.log('\n— Anreicherung: der Kandidat rechnet denselben Weg (C4) —');
{
  const src = readFileSync(join(ROOT, 'src', 'pointForecast', 'weatherEnrichment.ts'), 'utf8');
  const body = src.slice(src.indexOf('function evaluateStartOffsets'));
  add('`evaluateStartOffsets` korrigiert auf die Sample-Höhe', codeOnly(body).includes('correctForElevation('));
  add('… mit der Ankerhöhe des Cluster-Forecasts', codeOnly(body).includes('pf?.query.elevation'));
  add('… und der echten Sample-Höhe', codeOnly(body).includes('s.ele'));
  add('der Kandidat trägt Mittelwind und gefühlte Temperatur',
    codeOnly(src).includes('peakWindMps') && codeOnly(src).includes('minApparentC'));
  add('die alte Warnung „nie als absolute Zahl" steht nicht mehr im Vertrag',
    !src.includes('nie als absolute Zahl anzeigen'));
}

console.log('\n— Grenzwerte gehören nicht in den Tour-Speicher (C5) —');
{
  add('eigener localStorage-Schlüssel', LIMITS_STORE_KEY === 'bsc.route3d.limits');
  add('… und NICHT der des Drohnen-Panels', LIMITS_STORE_KEY !== 'buscosun.threed.gonogo.v1');
  add('der Tour-Speicher kennt keine Grenzwerte', (() => {
    const src = readFileSync(join(ROOT, 'src', 'route', 'tourStore.ts'), 'utf8');
    return !src.includes('limit') && !src.includes('gonogo');
  })());
  add('fremde Schlüssel werden verworfen',
    sanitizeLimits({ gust: 40, sicht: 1, quatsch: 9 }).sicht === undefined);
  add('Werte werden auf die Reglergrenzen geklemmt',
    sanitizeLimits({ gust: 9999 }).gust === limitDef('gust').max);
  add('unbrauchbare Eingaben fallen auf die Startwerte zurück',
    JSON.stringify(sanitizeLimits({ gust: 'viel' })) === JSON.stringify(DEFAULT_LIMITS));
  add('die Startwerte sind NICHT je Bewegungsart verschieden (keine erfundene Fachkenntnis)', (() => {
    const src = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'gonogo.ts'), 'utf8');
    return !codeOnly(src).includes('MovementId') && !codeOnly(src).includes('bergwandern');
  })());
}

console.log('\n— Was 1c bewusst NICHT behauptet (C1/C7) —');
{
  const src = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'gonogo.ts'), 'utf8');
  const code = codeOnly(src);
  add('es gibt keinen Grenzwert „Sicht"',
    !LIMITS.some((d) => /sicht|visib/i.test(d.id) || /sicht/i.test(d.label)));
  // Wortgrenze, sonst schlaegt die Sonde auf „An-sicht" an — dieselbe Falle
  // wie §14.5, nur diesmal in einem deutschen Kompositum.
  add('… und im Rechenteil steht keine Sichtweite', !/sicht|visibility/i.test(code));
  add('der Katalog enthält nur Größen, die am Sample hängen',
    LIMITS.every((d) => typeof d.read === 'function'));
  add('der Bericht baut keinen Link', !/location\.href|https?:\/\//.test(code));
  add('… und sagt selbst, dass er Text ist', src.includes('Kein Link') || src.includes('kein Link'));
  add('die Ansicht teilt Text, keine URL', (() => {
    const v = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Route3DView.tsx'), 'utf8'));
    const i = v.indexOf('async function shareReport');
    const body = v.slice(i, i + 700);
    return body.includes('navigator.share({ text })') && !body.includes('url:');
  })());
}

console.log('\n— Bericht (Muster GoNoGoPanel, je Abschnitt) —');
{
  const secs = goSections(scene.columns, { gust: 45, rain: 2 }, { warnKnown: true });
  const txt = buildGoNoGoReport({
    title: 'Oberstdorf → Kemptner Hütte', movementLabel: 'Bergwandern',
    startMs: scene.startMs, endMs: scene.endMs, totalM: scene.totalM,
    stackLabel: 'DWD ICON-D2', sections: secs, limits: { gust: 45, rain: 2, warn: 2 },
    unavailable: ['warn'],
  });
  add('der Bericht nennt Strecke, Zeit und Quelle',
    txt.includes('Oberstdorf') && txt.includes('DWD ICON-D2') && txt.includes('Zeitfenster'));
  add('… die eingestellten Grenzwerte', txt.includes('Böen ≤ 45 km/h'));
  add('… markiert die auf dieser Strecke unbelegten', txt.includes('nicht belegt'));
  add('… jeden Abschnitt mit Status und Begründung',
    secs.every((s) => txt.includes(`km ${kmLabel(s.fromM)}–${kmLabel(s.toM)}`)));
  add('… den Gesamtstatus', txt.includes('GESAMT:'));
  add('… und den Vorbehalt „keine amtliche Empfehlung"', txt.includes('keine amtliche Empfehlung'));
  add('… samt der „unklar"-Regel', txt.includes('keine Entscheidung'));
}

console.log('\n— Verdrahtung 1c —');
{
  const sceneSrc12 = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Scene3D.tsx'), 'utf8');
  const viewSrc12 = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Route3DView.tsx'), 'utf8');
  const css12 = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'route3d.css'), 'utf8');

  add('die Szene kennt den dritten Modus', /SceneMode = 'wetter' \| 'zeit' \| 'gonogo'/.test(sceneSrc12));
  add('der gespeicherte Modus akzeptiert ihn', /raw === 'zeit' \|\| raw === 'gonogo'/.test(viewSrc12));
  add('das Routenband färbt sich nach Status', codeOnly(sceneSrc12).includes('STATUS_COLORS[st]'));
  add('die Zonen stehen nur an Abschnitten, die nicht Go sind',
    codeOnly(sceneSrc12).includes("sections.filter((x) => x.status !== 'go')"));
  add('die Legende nennt alle vier Wörter',
    /\['go', 'knapp', 'unklar', 'no-go'\] as const/.test(sceneSrc12));
  add('die Farben der Szene und des CSS meinen dasselbe Rot',
    sceneSrc12.includes("'no-go': '#D7263D'") && css12.includes('--go-bad: #D7263D'));
  add('im Grenzwert-Modus bleibt keine Ebene ohne Schalter eingeschaltet', (() => {
    const i = viewSrc12.indexOf("mode === 'gonogo'\n      // Im Grenzwert-Modus");
    const body = viewSrc12.slice(i, i + 900);
    return ['temp', 'wind', 'rain', 'cloud', 'snow', 'warn', 'pearls', 'wetseg', 'arrows']
      .every((k) => body.includes(`${k}: false`));
  })());
  add('die Reglerbahnen tragen den Status', viewSrc12.includes('statusBands') && viewSrc12.includes('timeBands'));
  add('der Druck läuft über `window.print()` — kein PDF-Paket', (() => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies ?? {});
    return viewSrc12.includes('window.print()') && !deps.some((d) => /pdf|jspdf|print/i.test(d));
  })());
  add('… und die Laufzeit-Abhängigkeiten sind unverändert sieben', (() => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return Object.keys(pkg.dependencies ?? {}).length === 7;
  })());
  add('das Druckbild lässt die Bedienung weg', /@media print \{[\s\S]{0,320}r3-sliders/.test(css12));
  add('mobil misst jedes Bedienelement 44 px', (() => {
    const i = css12.lastIndexOf('@media (max-width: 767px)');
    const m = css12.slice(i);
    return ['.r3-limit ', '.r3-secs-why', '.r3-gowin-apply', '.r3-report-main']
      .every((sel) => new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{[^}]*44px`).test(m));
  })());
  add('die „Warum"-Karte sitzt auf der Bühne und wird nicht abgeschnitten',
    css12.includes('.r3-stage .r3-why') && /\.r3-stage \{[^}]*position: relative/.test(css12));
}

/* ============================ 13 · Bestand mitgeprüft (C2) ============================ */
console.log('\n— Go/No-Go am Punkt (Epic E, bis 1c unverdrahtet) —');
{
  const r = verifyGoNoGo();
  for (const c of r.checks) add(`[goNoGo] ${c.case}`, c.ok, c.detail);
  add('[goNoGo] es bleibt bei ZWEI Zuständen — die Tour-Frage ist eine andere', (() => {
    const src = readFileSync(join(ROOT, 'src', 'threed', 'goNoGo.ts'), 'utf8');
    return src.includes("status: 'go' | 'no-go'") && !src.includes('unklar');
  })());
}

/* ============================ 14 · Gelände exakt (R3D-4) ============================ */
console.log('\n— Gelände (R3D-4/G1) —');
{
  // Synthetisches Gelände mit echten Kuppen: 20 km, 2 000 Trackpunkte,
  // Wetterspalten alle 2 km (die Regel für flaches Gelände).
  const N = 2000;
  const TOTAL = 20_000;
  const eleAt = (d) => 800 + 300 * Math.sin(d / 900) + 60 * Math.sin(d / 210);
  const track = Array.from({ length: N }, (_, i) => {
    const dist = (TOTAL * i) / (N - 1);
    return { dist, ele: eleAt(dist) };
  });
  // Die Spalten sind in der App IMMER Track-Punkte (`selectSamples` gibt
  // `idxs.map(i => points[i])` zurück) — der Test bildet das nach, statt
  // runde Distanzen zu erfinden, die es im Track nicht gibt.
  const colIdx = [];
  for (let i = 0; i < N; i += 200) colIdx.push(i);
  if (colIdx[colIdx.length - 1] !== N - 1) colIdx.push(N - 1);
  const colDists = colIdx.map((i) => track[i].dist);
  const chain = colIdx.map((i) => ({ distM: track[i].dist, terrainM: track[i].ele }));

  const profile = buildTerrainProfile(track, colDists);
  const maxErr = (nodes) => track.reduce((m, t) => Math.max(m, Math.abs(t.ele - terrainAt(nodes, t.dist))), 0);
  const errChain = maxErr(chain);
  const errProfile = maxErr(profile);

  add('die Spaltenkette liegt am echten Gelände weit daneben', errChain > 100, `${errChain.toFixed(1)} m`);
  add('das Profil trifft es', errProfile < 5, `${errProfile.toFixed(1)} m`);
  add('… um mindestens den Faktor 20 besser', errChain / Math.max(1e-9, errProfile) > 20,
    `${(errChain / Math.max(1e-9, errProfile)).toFixed(0)}×`);

  add('der höchste Punkt überlebt die Ausdünnung',
    Math.abs(Math.max(...profile.map((n) => n.terrainM)) - Math.max(...track.map((t) => t.ele))) < 1e-9);
  add('der tiefste Punkt überlebt sie auch',
    Math.abs(Math.min(...profile.map((n) => n.terrainM)) - Math.min(...track.map((t) => t.ele))) < 1e-9);
  add('die Knoten bleiben aufsteigend', profile.every((n, i) => i === 0 || n.distM >= profile[i - 1].distM));
  add('die Knotenzahl bleibt unter dem Deckel', profile.length <= PROFILE_MAX_NODES,
    `${profile.length} ≤ ${PROFILE_MAX_NODES}`);
  add('jede Wetterspalte ist ein Knoten — sonst schwebte das Band neben dem Profil',
    colDists.every((d) => profile.some((n) => Math.abs(n.distM - d) < 1e-6)));

  add('leere Eingabe ergibt kein Profil', buildTerrainProfile([]).length === 0);
  add('zwei Punkte ergeben zwei Knoten',
    buildTerrainProfile([{ dist: 0, ele: 5 }, { dist: 10, ele: 7 }]).length === 2);
  add('NaN-Höhen fallen heraus, statt eine Null zu behaupten',
    buildTerrainProfile([{ dist: 0, ele: 5 }, { dist: 5, ele: NaN }, { dist: 10, ele: 7 }])
      .every((n) => Number.isFinite(n.terrainM)));

  // terrainAt / minTerrainBetween
  const nodes = [{ distM: 0, terrainM: 100 }, { distM: 100, terrainM: 200 }, { distM: 200, terrainM: 50 }];
  add('`terrainAt` interpoliert linear', Math.abs(terrainAt(nodes, 50) - 150) < 1e-9);
  add('… und klemmt an den Enden statt zu extrapolieren',
    terrainAt(nodes, -500) === 100 && terrainAt(nodes, 9999) === 50);
  add('`minTerrainBetween` findet das Minimum innerhalb der Spanne',
    Math.abs(minTerrainBetween(nodes, 90, 200) - 50) < 1e-9);
  add('… und nimmt die interpolierten Kanten mit',
    Math.abs(minTerrainBetween(nodes, 0, 50) - 100) < 1e-9);

  // Wand und Regen stehen auf dem Boden, nicht daneben
  const cols = [
    { index: 0, distM: 0, terrainM: 1000, etaMs: 0, lat: 47, lon: 11, tempC: 5, apparentC: 5,
      windKmh: 20, gustKmh: 30, windDirDeg: 180, windRel: null, windComponentKmh: 0,
      precipMmH: 2, precipSource: 'nwp', precipType: 'rain', humidityPct: 70,
      cloudBaseM: 2000, cloudCoverPct: 50, snowLineM: null, batteryPct: null, warnLevel: null, confidence: null },
    { index: 1, distM: 2000, terrainM: 1000, etaMs: 3600e3, lat: 47.01, lon: 11, tempC: 5, apparentC: 5,
      windKmh: 20, gustKmh: 30, windDirDeg: 180, windRel: null, windComponentKmh: 0,
      precipMmH: 2, precipSource: 'nwp', precipType: 'rain', humidityPct: 70,
      cloudBaseM: 2000, cloudCoverPct: 50, snowLineM: null, batteryPct: null, warnLevel: null, confidence: null },
  ];
  // Eine Senke ZWISCHEN den beiden Abtastpunkten — genau der Fall aus §19.4.
  const dip = [
    { distM: 0, terrainM: 1000 }, { distM: 1000, terrainM: 700 }, { distM: 2000, terrainM: 1000 },
  ];
  const cellsFlat = buildWindCells(cols, undefined, undefined, []);
  const cellsDip = buildWindCells(cols, undefined, undefined, dip);
  const lowestFlat = Math.min(...cellsFlat.map((c) => c.loM));
  const lowestDip = Math.min(...cellsDip.map((c) => c.loM));
  add('ohne Profil beginnt die Windwand am Abtastpunkt', lowestFlat === 1000);
  add('mit Profil reicht sie bis zum tiefsten Gelände der Spanne', lowestDip === 700, `${lowestDip} m`);
  add('… und die Zahl der Segmente ändert sich dadurch nicht',
    cellsFlat.length === cellsDip.length);
  add('… die Höhe über Grund bleibt die des Abtastpunktes',
    cellsFlat.map((c) => c.kmh).join('|') === cellsDip.map((c) => c.kmh).join('|'));

  const rainDip = buildRainColumns(cols, 2000, dip);
  add('die Regensäule beginnt ebenfalls am tiefsten Gelände',
    rainDip.every((r) => r.baseM <= 1000) && Math.min(...rainDip.map((r) => r.baseM)) === 700);

  // reliefPath
  const vp = { w: 1000, h: 400, padL: 50, padR: 20, padT: 20, padB: 30, depthX: 90, depthY: 70 };
  const pr = makeProjection(vp, 2000, 500, 1500);
  const rp0 = reliefPath(pr, dip, 0);
  const rp1 = reliefPath(pr, dip, 1);
  add('`reliefPath` schließt die Silhouette', rp0.endsWith('Z') && rp0.startsWith('M'));
  add('… und setzt sie mit der Tiefe um genau `depthX` nach hinten', (() => {
    const x0 = Number(rp0.slice(1).split(',')[0]);
    const x1 = Number(rp1.slice(1).split(',')[0]);
    return Math.abs((x1 - x0) - vp.depthX) < 0.2;
  })());
  add('ein Profil mit einem Knoten ergibt keine Fläche', reliefPath(pr, [dip[0]], 1) === '');
}

console.log('\n— Gelände in der Szene und im Text (R3D-4/G3+G5) —');
{
  const samples = [
    { index: 0, dist: 0, lat: 47, lon: 11, ele: 1000, etaMs: 0, arrivalOffsetMin: 0, segmentSpeedKmh: 10, weather: null },
    { index: 1, dist: 2000, lat: 47.02, lon: 11, ele: 1400, etaMs: 3600e3, arrivalOffsetMin: 60, segmentSpeedKmh: 10, weather: null },
  ];
  const pts = [];
  for (let d = 0; d <= 2000; d += 10) pts.push({ lat: 47 + d / 100000, lon: 11, ele: 1000 + 400 * (d / 2000) + 120 * Math.sin(d / 130), dist: d });
  const sc = buildScene({ samples, points: pts, countries: ['DE'] });
  add('die Szene trägt ein eigenes Geländeprofil', sc.terrain.length > sc.columns.length,
    `${sc.terrain.length} Knoten für ${sc.columns.length} Spalten`);
  add('ohne gemessenes Relief bleibt die Liste leer, statt eines zu behaupten', sc.relief.length === 0);
  add('mit Relief reicht die Szene es durch', (() => {
    const withRelief = buildScene({
      samples, points: pts, countries: ['DE'],
      relief: [{ offsetM: 2000, nodes: [{ distM: 0, terrainM: 900 }, { distM: 2000, terrainM: 1100 }] }],
    });
    return withRelief.relief.length === 1 && withRelief.relief[0].offsetM === 2000;
  })());
  add('„Gipfel in Wolke" wird am Profil geprüft, nicht an den Spalten', (() => {
    // Die Kuppe zwischen den Abtastpunkten liegt über der Wolkenbasis, die
    // Abtastpunkte selbst nicht — genau der Fall, den die Spaltenkette verfehlt.
    const s2 = samples.map((s) => ({ ...s, weather: { temperatureC: 10, apparentTempC: 10, windSpeedMps: 3,
      windDirectionDeg: 180, gustMps: 5, relativeHumidityPct: 99, cloudCoverPct: 90, uvIndex: null,
      precipitationMmH: 0, precipitationSource: null, precipitationType: 'none', snowLineM: null, foehn: null,
      warnings: [], confidence: { temperature: 1, wind: 1, gust: 1, humidity: 1, precipitation: 1, clouds: 1, snowLine: 1, uvIndex: 1 },
      cellId: 0, sourcesUsed: [], isInterpolated: false, validityFlags: ['ok'] } }));
    const s3 = buildScene({ samples: s2, points: pts, countries: ['DE'] });
    if (!s3.cloudBase) return false;
    const onCols = s3.columns.some((c) => c.terrainM > s3.cloudBase.meanM);
    return s3.peaksInCloud.length > 0 || onCols === false;
  })());

  // Textbausteine
  const noteFile = terrainNote('file', null, []);
  const noteChecked = terrainNote('file', 3, RELIEF_OFFSETS_M);
  const noteFilled = terrainNote('dem-filled', null, RELIEF_OFFSETS_M);
  const noteReplaced = terrainNote('dem-replaced', 115.7, RELIEF_OFFSETS_M);
  add('ungeprüfte Höhen sagen, dass sie ungeprüft sind', /nicht gegen das Höhenmodell geprüft/.test(noteFile));
  add('geprüfte Höhen nennen die Abweichung', /3 m Abweichung/.test(noteChecked));
  add('ersetzte Höhen nennen den Grund mit Zahl', /116 m/.test(noteReplaced));
  add('ergänzte Höhen sind etwas anderes als ersetzte',
    noteFilled !== noteReplaced && /keine brauchbaren/.test(noteFilled));
  add('ohne Relief behauptet der Satz keins', /Extrusion desselben Profils/.test(noteFile));
  add('mit Relief nennt er die gemessenen Abstände', /2 km und 5 km/.test(noteChecked));
  add('der Gelände-Satz nennt NIE die Wetter-Auflösung — die steht daneben',
    ![noteFile, noteChecked, noteFilled, noteReplaced].some((t) => /\b(6|10|14) km\b/.test(t)));

  add('der Hagel-Satz nennt beide Quellen',
    /KONRAD3D/.test(HAIL_NOTE) && /(POH|MESHS)/.test(HAIL_NOTE));
  add('… sagt, dass sie für „jetzt" gelten', /jetzt/.test(HAIL_NOTE));
  add('… und benennt die Lücke in Österreich', /Österreich/.test(HAIL_NOTE));
  add('… und behauptet nirgends einen Hagel-Wert',
    !/Hagelwahrscheinlichkeit|Korngröße|mm Hagel/.test(HAIL_NOTE));

  add('die Punkt-Kette führt weiterhin kein Hagelfeld — sonst wäre der Satz falsch', (() => {
    const t = codeOnly(readFileSync(join(ROOT, 'src', 'pointForecast', 'types.ts'), 'utf8'));
    const i = t.indexOf('interface SampleWeather');
    const body = t.slice(i, t.indexOf('\n}', i));
    return !/\bhail|hagel/i.test(body);
  })());
  add('und die Karte schaltet Hagel nur im Jetzt — die Grundlage des Satzes', (() => {
    const mv = readFileSync(join(ROOT, 'src', 'MapView.tsx'), 'utf8');
    return /HAIL_LAYER_IDS[\s\S]{0,120}forecastHour === 0/.test(mv);
  })());
}

console.log('\n— Verdrahtung des Geländes (R3D-4) —');
{
  const sc14 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Scene3D.tsx'), 'utf8'));
  add('die Silhouette wird aus dem Profil gezeichnet', sc14.includes('terrainPath(p, profile)'));
  add('die Verdeckungsmaske ebenfalls', sc14.includes('skyPath(p, profile)'));
  add('… also aus derselben Kante wie die Silhouette',
    sc14.includes('terrainPath(p, profile)') && sc14.includes('skyPath(p, profile)')
    && !sc14.includes('skyPath(p, cols)'));
  add('das Routenband folgt dem Profil, nicht der Spaltengeraden',
    sc14.includes('ribbonPoints(p, profile)') && sc14.includes('ribbonSegment(p, profile'));
  add('die Kappe steht nur, wenn kein Relief gemessen wurde',
    /scene\.relief\.length === 0 && <path d=\{terrainCapPath/.test(sc14));
  add('das Relief wird von hinten nach vorne gezeichnet',
    /sort\(\(a, b\) => b\.offsetM - a\.offsetM\)/.test(sc14));
  add('die Label-Freifläche wird am Profil gesucht', sc14.includes('freeSpan(profile'));

  const rv14 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Route3DView.tsx'), 'utf8'));
  add('die 3D-Ansicht holt das Relief selbst — und nur sie', rv14.includes('sampleReliefProfiles('));
  add('… mit Abbruch beim Verlassen', /sampleReliefProfiles\([\s\S]{0,400}ac\.signal/.test(rv14));
  add('… und reicht es an die Szene', /buildScene\(\{[^}]*relief[ ,}]/.test(rv14));
  add('die Fußzeile nennt die Herkunft der Höhen', rv14.includes('terrainNote(elevation.source'));
  add('und in „Wetter entlang der Route" auch die Hagel-Lücke', rv14.includes('HAIL_NOTE'));

  const tt14 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'tourTrack.ts'), 'utf8'));
  add('die Höhen der Datei werden gegen das Gelände geprüft', tt14.includes('compareToDem('));
  add('… nur mit Kill-Switch-Freigabe', tt14.includes('demCheckEnabled()'));
  add('… und erst ab einer benannten Schwelle ersetzt',
    /cmp\.medianAbsM > ELE_TRUST_M/.test(tt14) && /ELE_TRUST_M = 50/.test(tt14));
  add('die Abweichung wird IMMER berichtet, auch wenn nichts ersetzt wird',
    /elevationDeltaM = Math\.round/.test(tt14));
  add('„nicht geprüft" bleibt von „stimmt" unterscheidbar',
    /elevationDeltaM: number \| null/.test(tt14));
  add('die Gegenprobe hat eine Frist — sie läuft vor dem ersten Bild',
    /withDeadline\(compareToDem\(/.test(tt14) && /DEM_CHECK_MS = 4_000/.test(tt14));
  add('… und das Ersetzen auch', /withDeadline\(sampleElevations\(/.test(tt14));
  add('läuft sie ab, bleibt es bei „nicht geprüft" statt bei Warten',
    /resolve\(null\), ms\)/.test(tt14));

  const tv14 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'TourView.tsx'), 'utf8'));
  add('die Tour reicht die Herkunft an die 3D-Ansicht durch',
    /elevation=\{\{ source: eff\.meta\.elevationSource/.test(tv14));

  const rs14 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'RouteSummary.tsx'), 'utf8'));
  add('die Vorschau unterscheidet „ergänzt" von „ersetzt"',
    rs14.includes("elevationSource === 'dem-filled'") && rs14.includes("elevationSource === 'dem-replaced'"));
  add('… und nennt beim Ersetzen die Abweichung', /Datei wich \$\{Math\.round\(meta\.elevationDeltaM\)\} m ab/.test(rs14));

  const css14 = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'route3d.css'), 'utf8');
  add('das Relief trägt keine Kammlinie', /\.r3-relief-band \{[^}]*stroke: none/.test(css14));
  add('Schnee ist ohne Farbvergleich zu erkennen',
    /\.r3-rain--snow line \{[^}]*stroke-dasharray/.test(css14) && sc14.includes("col.type === 'snow' ? 0"));
}

/* ============================ 15 · Die Tour in 3D (R3D-5) ============================ */
console.log('\n— Tour als Vertikalschnitt (R3D-5/T1) —');
{
  const pts = [];
  for (let d = 0; d <= 8000; d += 20) {
    pts.push({ lat: 47.2 + d / 200000, lon: 11.4 + d / 400000, ele: 600 + 1400 * (d / 8000), dist: d });
  }
  const mkCol = (i, distM, terrainM, over = {}) => ({
    index: i, distM, terrainM, etaMs: 1e12 + i * 3600e3, lat: 47.2, lon: 11.4,
    tempC: 12, apparentC: 12, windKmh: 20, gustKmh: 34, windDirDeg: 250, windRel: null,
    windComponentKmh: 0, precipMmH: 0, precipSource: null, precipType: 'none',
    humidityPct: 70, cloudBaseM: null, cloudCoverPct: 40, snowLineM: null,
    batteryPct: null, warnLevel: null, confidence: null, ...over,
  });
  const cols = [mkCol(0, 0, 600), mkCol(1, 4000, 1300), mkCol(2, 8000, 2000)];

  const res = buildRouteSection(cols, pts);
  add('die Tour liefert einen Schnitt', res != null);
  add('… mit einem Anker je brauchbarem Sample', res.anchorCount === 3, String(res.anchorCount));
  add('… und der Zahl aller Samples daneben', res.sampleCount === 3);
  add('… und den Spalten des Bildes', res.section.columns.length === SECTION_COLUMNS, String(res.section.columns.length));

  add('ohne Temperatur oder Wind entsteht kein Anker',
    buildRouteSection([mkCol(0, 0, 600, { tempC: null }), mkCol(1, 8000, 2000, { windKmh: null })], pts) === null);
  add('ohne Strecke entsteht nichts', buildRouteSection(cols, [pts[0]]) === null);
  add('fehlende Bewölkung wird gemeldet, nicht zu 0 % erklärt',
    buildRouteSection([mkCol(0, 0, 600, { cloudCoverPct: null }), mkCol(1, 8000, 2000)], pts).cloudsUsable === false);
  add('… und mit vollständigen Werten steht sie zur Verfügung', res.cloudsUsable === true);

  // E3 — die Anker gelten nicht zur selben Zeit
  add('der Tour-Schnitt beurteilt KEINE Inversion', res.section.inversion.present === false);
  add('… und sagt, dass er sie nicht geprüft hat',
    res.section.inversion.basis === 'none' && /verschiedenen Zeiten/.test(res.section.inversion.note));
  add('… das Temperaturfeld folgt deshalb der Lapse-Rate (kein Kaltluftsee)', (() => {
    const c = res.section.columns[Math.floor(SECTION_COLUMNS / 2)];
    return c.cells.every((cell, i) => i === 0 || cell.tempC < c.cells[i - 1].tempC);
  })());

  // E2 — derselbe Rechenkern, kein zweiter Weg
  add('die Vertikale kommt aus `windAtAGL` — Zelle für Zelle nachgerechnet', (() => {
    const c = res.section.columns[20];
    return c.cells.every((cell) => Math.abs(cell.windKmh - windAtAGL(c.surface.windKmh, cell.agl, DEFAULT_ALPHA)) < 1e-9);
  })());
  add('… auch für die Böen', (() => {
    const c = res.section.columns[60];
    return c.cells.every((cell) => Math.abs(cell.gustKmh - windAtAGL(c.surface.gustKmh, cell.agl, DEFAULT_ALPHA)) < 1e-9);
  })());

  // Decke
  const maxT = Math.max(...res.section.columns.map((c) => c.terrainM));
  add('die Schnitt-Zellen sind fein genug für eine 300-m-Bahn', (() => {
    const lv = res.section.heightLevels;
    return lv.length > 1 && lv[1] - lv[0] === SECTION_LEVEL_STEP_M && SECTION_LEVEL_STEP_M <= 50;
  })(), `${SECTION_LEVEL_STEP_M} m`);
  add('… und eine Spalte trägt in der Bahn mehrere Zellen', (() => {
    const c = res.section.columns[10];
    const inBand = c.cells.filter((x) => x.agl <= CURTAIN_BAND_AGL_M);
    return inBand.length >= 8;
  })());
  add('die Wand wird über der Strecke gedeckelt, nicht auf 3 000 m gesetzt',
    res.section.topM <= maxT + CURTAIN_HEADROOM_M + 250 && res.section.topM >= 2000,
    `${res.section.topM} m über max ${Math.round(maxT)} m`);
  add('… und der Standard der Atmosphären-Ansicht bleibt unverändert', (() => {
    const plain = assembleCrossSection({
      columns: [{ index: 0, distanceM: 0, lat: 47, lon: 11, terrainM: 600 },
                { index: 1, distanceM: 8000, lat: 47.1, lon: 11.1, terrainM: 2000 }],
      anchors: [{ distanceM: 0, elevM: 600, windKmh: 20, windDirDeg: 250, gustKmh: 34, tempC: 12, cloudPct: 40, humidityPct: 70 }],
    });
    return plain.topM === 3500;
  })());

  // Die Inversions-Option selbst
  add('mit `estimate` erkennt derselbe Kern die Inversion weiterhin', (() => {
    const warmAbove = assembleCrossSection({
      columns: [{ index: 0, distanceM: 0, lat: 47, lon: 11, terrainM: 600 },
                { index: 1, distanceM: 8000, lat: 47.1, lon: 11.1, terrainM: 1800 }],
      anchors: [
        { distanceM: 0, elevM: 600, windKmh: 6, windDirDeg: 250, gustKmh: 8, tempC: 1, cloudPct: 10, humidityPct: 85 },
        { distanceM: 8000, elevM: 1800, windKmh: 6, windDirDeg: 250, gustKmh: 8, tempC: 8, cloudPct: 10, humidityPct: 50 },
      ],
    });
    return warmAbove.inversion.present === true && warmAbove.inversion.basis === 'observed';
  })());
  add('… und mit `none` beurteilt er sie nicht — bei denselben Werten', (() => {
    const same = assembleCrossSection({
      columns: [{ index: 0, distanceM: 0, lat: 47, lon: 11, terrainM: 600 },
                { index: 1, distanceM: 8000, lat: 47.1, lon: 11.1, terrainM: 1800 }],
      anchors: [
        { distanceM: 0, elevM: 600, windKmh: 6, windDirDeg: 250, gustKmh: 8, tempC: 1, cloudPct: 10, humidityPct: 85 },
        { distanceM: 8000, elevM: 1800, windKmh: 6, windDirDeg: 250, gustKmh: 8, tempC: 8, cloudPct: 10, humidityPct: 50 },
      ],
      inversion: 'none',
    });
    return same.inversion.present === false && same.inversion.basis === 'none';
  })());

  // Geometrie-Helfer
  const rs = resampleTerrain(pts, 20);
  add('`resampleTerrain` liefert genau so viele Spalten wie verlangt', rs.length === 20);
  add('… mit aufsteigender Distanz', rs.every((c, i) => i === 0 || c.distanceM > rs[i - 1].distanceM));
  add('… Anfang und Ende liegen auf dem Track',
    Math.abs(rs[0].terrainM - pts[0].ele) < 1e-6 && Math.abs(rs[19].terrainM - pts[pts.length - 1].ele) < 1e-6);
  add('… und die Höhe dazwischen ist interpoliert, nicht neu geholt',
    Math.abs(rs[10].terrainM - (600 + 1400 * (rs[10].distanceM / 8000))) < 1);

  add('`interpTrack` klemmt an den Enden', (() => {
    const a = interpTrack(pts, -500);
    const b = interpTrack(pts, 99999);
    return a.eleM === pts[0].ele && b.eleM === pts[pts.length - 1].ele;
  })());
  add('… und trifft einen Punkt in der Mitte', Math.abs(interpTrack(pts, 4000).eleM - 1300) < 1);
  add('… auch auf einem langen Track (binäre Suche)', (() => {
    const big = [];
    for (let i = 0; i < 50_000; i++) big.push({ lat: 47, lon: 11, ele: i, dist: i * 2 });
    return Math.abs(interpTrack(big, 60_000).eleM - 30_000) < 1e-6;
  })());

  add('`routeCoords` dünnt aus und behält beide Enden', (() => {
    const c = routeCoords(pts, 50);
    return c.length <= 52 && c[0][1] === pts[0].lat && c[c.length - 1][1] === pts[pts.length - 1].lat;
  })());
  add('`wetCoords` setzt exakte Kanten an die Fenster', (() => {
    const w = wetCoords(pts, [{ fromM: 1000, toM: 3000 }]);
    if (w.length !== 1) return false;
    const a = interpTrack(pts, 1000);
    const b = interpTrack(pts, 3000);
    return Math.abs(w[0][0][1] - a.lat) < 1e-9 && Math.abs(w[0][w[0].length - 1][1] - b.lat) < 1e-9;
  })());
  add('… und macht aus einem entarteten Fenster keine Linie',
    wetCoords(pts, [{ fromM: 500, toM: 500 }]).length === 0);

  add('`routeSegments` gibt je Spalte ein Stück — mit der Mitten-Regel', (() => {
    const segs = routeSegments(cols, pts, () => '#fff');
    if (segs.length !== 3) return false;
    // Die Grenze zwischen Spalte 0 und 1 liegt bei (0+4000)/2 = 2000.
    return Math.abs(segs[0].toM - 2000) < 1e-6 && Math.abs(segs[1].fromM - 2000) < 1e-6;
  })());
  add('… und lässt aus, wofür es keine Farbe gibt',
    routeSegments(cols, pts, (i) => (i === 1 ? null : '#fff')).length === 2);
  add('… die Stücke schließen lückenlos aneinander an', (() => {
    const segs = routeSegments(cols, pts, () => '#fff');
    return segs.every((sg, i) => i === 0 || Math.abs(sg.fromM - segs[i - 1].toM) < 1e-6);
  })());
  add('`segmentCoords` ist die eine Stelle für beide Spuren',
    JSON.stringify(segmentCoords(pts, 1000, 3000)) === JSON.stringify(wetCoords(pts, [{ fromM: 1000, toM: 3000 }])[0]));
  add('`windPicks` nimmt nur Spalten mit bestimmbarer Windrelation', (() => {
    const withRel = cols.map((c, i) => ({ ...c, windRel: i === 1 ? null : 'head' }));
    return windPicks(withRel, 5).length === 2;
  })());
  add('… und dünnt gleichmäßig aus, wenn es mehr sind als gefragt', (() => {
    const many = Array.from({ length: 40 }, (_, i) => ({ windRel: 'head', windDirDeg: 180, i }));
    const picked = windPicks(many, 5);
    return picked.length === 5 && picked[0].i === 0 && picked[4].i === 39;
  })());
}

console.log('\n— Was die Wand trägt, und was nicht (R3D-5/E5) —');
{
  const wind = curtainNote({ useGust: false, temp: false, clouds: false });
  const alles = curtainNote({ useGust: true, temp: true, clouds: true });
  add('der Satz beginnt AM BODEN, nicht in der Luft',
    /^Die Wetterlage am Boden liegt AN der Strecke/.test(wind));
  add('… und zählt auf, was dort liegt', /Farbe = Temperatur/.test(wind) && /Pfeile = Wind/.test(wind)
    && /blau = Regen/.test(wind) && /rot = amtliche Warnung/.test(wind));
  add('… nennt die Bahn mit ihrer Höhe über Grund', new RegExp(`Bahn ${CURTAIN_BAND_AGL_M} m über Grund`).test(wind));
  add('… und was in der Bahn steht: Wind bzw. Böen', /zeigt Wind —/.test(wind) && /zeigt Böen, Temperatur und Wolken —/.test(alles));
  add('… und dass Schneefallgrenze und Warntext NICHT in der Wand stehen',
    /in der Wand stehen sie nicht/.test(wind));
  add('… und behauptet keinen Hagel', !/Hagel/.test(alles));
  add('die Bahn ist niedriger als die Decke — sonst wäre es wieder Atmosphäre',
    CURTAIN_BAND_AGL_M < 1500 && CURTAIN_BAND_AGL_M >= 100, `${CURTAIN_BAND_AGL_M} m`);
  add('der Inversions-Satz nennt den Grund', /Ankunftszeit/.test(NO_INVERSION_NOTE) && /Zeitunterschied/.test(NO_INVERSION_NOTE));
}

console.log('\n— Verdrahtung der Gelände-Ansicht (R3D-5) —');
{
  const tm = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'RouteTerrainMap.tsx'), 'utf8');
  const tmCode = codeOnly(tm);

  add('die Ansicht benutzt den vorhandenen Vorhang-Layer', tmCode.includes('new CurtainLayer('));
  add('… und schreibt KEINE Shader — die WebGL-Pipeline bleibt unberührt (E4)',
    !/gl_FragColor|gl_Position|precision (highp|mediump|lowp)|attribute vec|varying vec/.test(tmCode));
  add('… Karte und Wand tragen dieselbe Überhöhung (E6)', (() => {
    const terr = /setTerrain\(\{ source: DEM_SRC, exaggeration: TERRAIN_EXAGGERATION \}\)/.test(tmCode);
    const wall = /new CurtainLayer\(\{[^}]*exaggeration: TERRAIN_EXAGGERATION/.test(tmCode);
    return terr && wall;
  })());
  add('… und es ist EINE Konstante, nicht zwei Zahlen',
    (tmCode.match(/TERRAIN_EXAGGERATION = /g) || []).length === 1);
  add('das Relief kommt aus derselben DEM-Quelle wie die Schummerung', (() => {
    const hs = /type: 'hillshade',\s*source: DEM_SRC/.test(tmCode);
    return hs && (tmCode.match(/const DEM_SRC = /g) || []).length === 1;
  })());
  add('ohne WebGL nennt die Ansicht den Schnitt als Weg', /noWebgl/.test(tmCode) && /Schnitt/.test(tm));
  add('die geteilte Position wird gelesen UND geschrieben (E8)',
    tmCode.includes('interpTrack(pointsRef.current, markerRef.current)') && tmCode.includes('pick(d)'));
  add('der Klick trifft den nächsten Streckenpunkt', tmCode.includes('nearestDist('));
  add('die Startansicht schaut von der TIEFEN Seite die Strecke hinauf',
    /const lowFirst = /.test(tmCode) && /brg - VIEW_OFFSET_DEG/.test(tmCode));
  add('… und dieselbe Peilung geht in Kamera und Anpassung', (() => {
    const i = tmCode.indexOf('const view = brg - VIEW_OFFSET_DEG');
    const tail = tmCode.slice(i, i + 700);
    return (tail.match(/bearing: view/g) || []).length === 2;
  })());
  add('die liberty-Korrektur wird geteilt, nicht kopiert (V-RL-3)',
    tmCode.includes("from '../../map/libertyStyle'") && tmCode.includes('patchLibertyRefLength(map)'));
  add('… und greift auf `style.load`, nicht erst auf `load`',
    /map\.on\('style\.load', \(\) => patchLibertyRefLength\(map\)\)/.test(tmCode));
  add('auch der Radar-Weg nimmt jetzt dieselbe Stelle', (() => {
    const rm = codeOnly(readFileSync(join(ROOT, 'src', 'radar', 'RadarMap.tsx'), 'utf8'));
    return rm.includes("from '../map/libertyStyle'") && !/function patchLibertyRefLength/.test(rm);
  })());
  add('… und die flache Karte des Ergebnisses ebenso (sie warf dieselbe Warnung)', (() => {
    const rm = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'RouteMap.tsx'), 'utf8'));
    return rm.includes("from '../map/libertyStyle'")
      && /map\.on\('style\.load', \(\) => patchLibertyRefLength\(map\)\)/.test(rm);
  })());

  const rv15 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Route3DView.tsx'), 'utf8'));
  add('die Bühne ist umschaltbar und wird gespeichert',
    rv15.includes("useState<'section' | 'terrain'>") && rv15.includes('STAGE_STORE_KEY'));
  add('die Karte kommt lazy — wer nur den Schnitt öffnet, lädt sie nicht',
    /lazy\(\(\) => import\('\.\/RouteTerrainMap'\)\)/.test(rv15));
  add('der Schnitt wird nur für die Gelände-Bühne gebaut',
    /stage === 'terrain' \? buildRouteSection/.test(rv15));
  add('die Gelände-Bühne beantwortet „Wetter entlang der Route"',
    /const dmode: SceneMode = stage === 'terrain' \? 'wetter' : mode/.test(rv15));
  add('… und sagt, wo Zeitkorridor und Grenzwerte stehen', rv15.includes('r3-modehint'));
  add('die Fußzeile nennt den Inhalt der Wand und die fehlende Inversion',
    rv15.includes('curtainNote(') && rv15.includes('NO_INVERSION_NOTE'));
  // §23/R3D-8 — der Boden ist die Hauptsache, und die Logik liegt an EINER Stelle
  const rs16 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'routeSection.ts'), 'utf8'));
  const tp16 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'RouteTerrainPanel.tsx'), 'utf8'));

  add('der Wind-Chip ist ein Umschalter, kein Ein/Aus — sonst hiesse „aus" „kein Wind"',
    /label: 'Böen statt Mittelwind'/.test(rs16) && !/tLayers\.gust \? '/.test(rs16));
  add('die Chip-Zeile trennt „Am Boden" von „In der Luft"',
    /r3-chipgrp">Am Boden</.test(rv15) && /r3-chipgrp">In der Luft</.test(rv15));
  add('… und „Am Boden" steht zuerst',
    rv15.indexOf('>Am Boden<') < rv15.indexOf('>In der Luft<'));
  add('… auch im Ergebnis', tp16.indexOf('>Am Boden<') < tp16.indexOf('>In der Luft<'));
  add('… und im Ergebnis steht die Karte VOR den Schaltern (sonst liegt sie unter dem Falz)',
    tp16.indexOf('r3-tpanel-map') < tp16.indexOf('r3-tpanel-chips'));
  add('… in der 3D-Ansicht umgekehrt — dort steht die Bühne ohnehin oben',
    rv15.indexOf('r3-chiprow') < rv15.indexOf('<Scene3D'));
  add('am Boden ist beim Start alles an, in der Luft nur die Bahn', (() => {
    const m = /const DEFAULT_TLAYERS: TerrainLayerFlags = \{([\s\S]*?)\};/.exec(rs16);
    if (!m) return false;
    const d = m[1];
    const on = (k) => new RegExp(`${k}: true`).test(d);
    const off = (k) => new RegExp(`${k}: false`).test(d);
    return on('routeTemp') && on('arrows') && on('rain') && on('warn')
      && on('wall') && off('gust') && off('wallTemp') && off('clouds') && off('streamlines');
  })());
  add('die Strecke trägt Temperatur, Warnung und Windpfeile',
    /routeSegments\(scene\.columns/.test(rs16) && /warnSegments/.test(rs16) && /windPicks\(scene\.columns/.test(rs16));
  add('der Pfeil zeigt, WOHIN der Wind weht', /\(c\.windDirDeg \?\? 0\) \+ 180/.test(rs16));
  add('… und ein leerer Pfeil-Layer sagt, dass der Wind zu schwach ist',
    /empty: av\.wind\.any \? 'zu schwach'/.test(rs16)
    && /Unter 4 m\/s schiebt und bremst der Wind nicht/.test(rs16));
  add('ein alter Speicherstand schleppt keine toten Schalter ein',
    /typeof parsed\[k\] === 'boolean'/.test(rs16));

  // R3D-8 — beide Ansichten nehmen DIESELBE Stelle, nicht je eine Kopie
  add('die Bühne und das Ergebnis bauen die Bodenspuren aus derselben Funktion',
    /buildGroundLayers\(/.test(rv15) && /buildGroundLayers\(/.test(tp16));
  add('… und nehmen dieselbe Chip-Liste',
    /terrainChips\(/.test(rv15) && /terrainChips\(/.test(tp16));
  add('… und denselben Schalter-Speicher',
    /loadTLayers\(\)/.test(rv15) && /loadTLayers\(\)/.test(tp16) && (rs16.match(/TLAYER_STORE_KEY = /g) || []).length === 1);
  add('… und denselben Chip-Knopf', /TerrainChipButton/.test(rv15) && /TerrainChipButton/.test(tp16));
  // R3D-8 — das Ergebnis oeffnet mit dem Gelaende, die flache Karte bleibt
  const tv18 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'TourView.tsx'), 'utf8'));
  add('das Ergebnis startet mit dem Gelände', /=== 'flat' \? 'flat' : 'terrain'/.test(tv18));
  add('… und die flache Karte bleibt erreichbar — sie kann Pausen und Wegpunkte',
    /<RouteMap/.test(tv18) && /setResultMap\('flat'\)/.test(tv18));
  add('… der Umschalter erscheint erst mit berechnetem Wetter',
    /const canTerrain = weatherState\.kind === 'ready'/.test(tv18) && /\{canTerrain && \(/.test(tv18));
  add('… die Gelände-Ansicht kommt lazy', /lazy\(\(\) => import\('\.\/route3d\/RouteTerrainPanel'\)\)/.test(tv18));
  add('… und die Position ist dieselbe wie im Scrubber',
    /markerM=\{scrubDistM \?\? 0\}/.test(tv18) && /onPickDist=\{handlePickDist\}/.test(tv18));
  add('der Umschalter steht AUSSERHALB der Karte — beide Karten liegen anders', (() => {
    const css = readFileSync(join(ROOT, 'src', 'route', 'routeDeck.css'), 'utf8');
    return /\.rd-mapcol \{/.test(css) && tv18.indexOf('rd-mapsw') < tv18.indexOf('rd-mapwrap');
  })());
  add('mobil misst der Umschalter 44 px', (() => {
    const css = readFileSync(join(ROOT, 'src', 'route', 'routeDeck.css'), 'utf8');
    const i = css.indexOf('@media (max-width: 767px)');
    return /\.rd-mapsw button \{ min-height: 44px/.test(css.slice(i));
  })());
  add('sein CSS liegt in `routeDeck.css` — es ist VOR dem Lazy-Chunk sichtbar', (() => {
    const deck = readFileSync(join(ROOT, 'src', 'route', 'routeDeck.css'), 'utf8');
    const r3 = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'route3d.css'), 'utf8');
    return /\.rd-mapsw \{/.test(deck) && !/\.rd-mapsw \{/.test(r3);
  })());

  add('die Palette liegt im puren Modul, nicht in der Komponente', (() => {
    const model = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'model.ts'), 'utf8'));
    const scene = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Scene3D.tsx'), 'utf8'));
    return /export const TEMP_COLORS = \[/.test(model) && !/export const TEMP_COLORS = \[/.test(scene);
  })());

  add('die Karte zeichnet die Bahn, nicht die Wand bis zur Decke',
    /setCurtain\(l\.wall \? s\.columns : \[\], s\.topM, image, CURTAIN_BAND_AGL_M\)/.test(tmCode));
  add('… und die Boden-Ebenen liegen in EINER Auffrischung',
    /function updateGround\(/.test(tmCode) && /TEMP_SRC/.test(tmCode) && /WARN_SRC/.test(tmCode) && /ARROW_SRC/.test(tmCode));
  add('die schlichte Linie tritt zurück, wenn die Temperatur färbt',
    /setLayoutProperty\('r3-route-main', 'visibility'/.test(tmCode));
  add('die Warnspur liegt UNTER der Temperatur, der Regen darüber',
    tmCode.indexOf("id: 'r3-route-warn'") < tmCode.indexOf("id: 'r3-route-temp'")
    && tmCode.indexOf("id: 'r3-route-temp'") < tmCode.indexOf("id: 'r3-route-wet'"));
  add('die Pfeile drehen mit der Karte, nicht mit dem Bildschirm',
    /'icon-rotation-alignment': 'map'/.test(tmCode));
  add('… und werden NACH dem Vorhang gezeichnet, sonst deckt die Bahn sie zu',
    tmCode.indexOf('new CurtainLayer(') < tmCode.indexOf("id: 'r3-route-arrows'"));
  add('die Positionsmarke steht schon beim Aufbau, nicht erst beim Scrubben',
    /readyRef\.current = true;[\s\S]{0,200}updatePos\(\);/.test(tmCode));

  const css15 = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'route3d.css'), 'utf8');
  add('die Karte gehört nicht aufs Papier', /@media print \{[\s\S]{0,400}r3-tmap-shell/.test(css15));
  add('mobil misst der Bühnen-Umschalter 44 px', (() => {
    const i = css15.indexOf('@media (max-width: 767px)');
    return /\.r3-stagesw button \{[^}]*44px/.test(css15.slice(i));
  })());
}

console.log('\n— Bestand mitgeprüft (E9) —');
{
  const m = verifyCurtainMesh();
  for (const c of m.checks) add(`[curtainMesh] ${c.case}`, c.ok, c.detail);
  const g = verifySectionGeometry();
  for (const c of g.checks) add(`[sectionGeometry] ${c.case}`, c.ok, c.detail);
}

/* ============================ 16 · Zeitplan (R3D-7) ============================ */
console.log('\n— Zeitplan: Ereignisse statt Zustände (R3D-7/S1) —');
{
  const H = 3600e3;
  const T0 = 1e12;
  const col = (i, over = {}) => ({
    index: i, distM: i * 1000, terrainM: 600 + i * 100, etaMs: T0 + i * H,
    lat: 47 + i * 0.01, lon: 11, tempC: 12, apparentC: 12,
    windKmh: 18, gustKmh: 28, windDirDeg: 250, windRel: 'cross', windComponentKmh: 0,
    precipMmH: 0, precipSource: null, precipType: 'none', humidityPct: 70,
    cloudBaseM: null, cloudCoverPct: 30, snowLineM: null,
    batteryPct: null, warnLevel: null, confidence: null, ...over,
  });
  const plain = [col(0), col(1), col(2), col(3)];

  const base = buildSchedule({ columns: plain, windows: [], warnZones: [] });
  add('Start und Ankunft stehen immer im Plan',
    base.events[0].kind === 'start' && base.events[base.events.length - 1].kind === 'goal');
  add('… und tragen die belegten Werte', /12 °C/.test(base.events[0].text) && /Böen 28 km\/h/.test(base.events[0].text));
  add('… und behaupten nichts, was fehlt',
    buildSchedule({ columns: [col(0, { tempC: null, gustKmh: null, windKmh: null }), col(1)], windows: [], warnZones: [] })
      .events[0].text === 'Start');
  add('eine Spalte ergibt keinen Plan', buildSchedule({ columns: [col(0)], windows: [], warnZones: [] }).events.length === 0);
  add('ohne Änderung bleibt es bei Start und Ankunft', base.events.length === 2, String(base.events.length));

  /* --- Niederschlag ---------------------------------------------------- */
  const win = [
    { fromM: 1000, toM: 2000, fromMs: T0 + H, toMs: T0 + 2 * H, peakMmH: 1.4, source: 'radar', type: 'rain' },
    { fromM: 2500, toM: 3000, fromMs: T0 + 2.5 * H, toMs: T0 + 3 * H, peakMmH: 6, source: 'nwp', type: 'snow' },
  ];
  const rain = buildSchedule({ columns: plain, windows: win, warnZones: [] });
  const kinds = rain.events.map((e) => e.kind);
  add('jedes Regenfenster bringt Beginn UND Ende',
    kinds.filter((k) => k === 'rain-start').length === 2 && kinds.filter((k) => k === 'rain-end').length === 2);
  add('… mit dem richtigen Wort je Art',
    rain.events.some((e) => /^Regen setzt ein/.test(e.text)) && rain.events.some((e) => /^Schnee setzt ein/.test(e.text)));
  add('… und der genannten Quelle',
    rain.events.some((e) => /Radar-Nowcast/.test(e.text)) && rain.events.some((e) => /Modellwert/.test(e.text)));
  add('starker Niederschlag ist „alert", schwacher „watch"', (() => {
    const a = rain.events.find((e) => /^Regen setzt ein/.test(e.text));
    const b = rain.events.find((e) => /^Schnee setzt ein/.test(e.text));
    return a.tone === 'watch' && b.tone === 'alert';
  })());
  add('der Artwechsel bekommt eine eigene Zeile',
    rain.events.some((e) => e.kind === 'precip-type' && e.text === 'Aus Regen wird Schnee'));
  add('… und zwei Fenster derselben Art keine', (() => {
    const same = buildSchedule({
      columns: plain, warnZones: [],
      windows: [win[0], { ...win[1], type: 'rain' }],
    });
    return !same.events.some((e) => e.kind === 'precip-type');
  })());

  /* --- Warnungen -------------------------------------------------------- */
  const warn = buildSchedule({
    columns: plain, windows: [],
    warnZones: [{ fromM: 500, toM: 2500, fromMs: T0 + 0.5 * H, toMs: T0 + 2.5 * H, level: 3, event: 'Sturmböen', headline: 'x' }],
  });
  add('die amtliche Warnung beginnt und endet mit Namen und Stufe',
    warn.events.some((e) => e.kind === 'warn-start' && /Sturmböen \(Stufe 3\)/.test(e.text))
    && warn.events.some((e) => e.kind === 'warn-end' && /Sturmböen/.test(e.text)));
  add('… und der Beginn ist ein Alarm', warn.events.find((e) => e.kind === 'warn-start').tone === 'alert');

  /* --- Windband mit Hysterese ------------------------------------------- */
  add('`steppedBand` ohne Vorgeschichte nimmt das rohe Band',
    steppedBand(46, [15, 30, 45, 60], 2, null) === 3);
  add('… und wechselt erst, wenn die Kante um die Hysterese überschritten ist',
    steppedBand(46, [15, 30, 45, 60], 2, 2) === 2 && steppedBand(48, [15, 30, 45, 60], 2, 2) === 3);
  add('… abwärts ebenso',
    steppedBand(44, [15, 30, 45, 60], 2, 3) === 3 && steppedBand(42, [15, 30, 45, 60], 2, 3) === 2);

  const flutter = buildSchedule({
    columns: [col(0, { gustKmh: 44 }), col(1, { gustKmh: 46 }), col(2, { gustKmh: 44 }), col(3, { gustKmh: 46 })],
    windows: [], warnZones: [],
  });
  add('ein Wert, der um die Kante pendelt, erzeugt KEINE Zeile',
    !flutter.events.some((e) => e.kind === 'wind-band'));
  const real = buildSchedule({
    columns: [col(0, { gustKmh: 20 }), col(1, { gustKmh: 38 }), col(2, { gustKmh: 55 }), col(3, { gustKmh: 20 })],
    windows: [], warnZones: [],
  });
  add('ein echter Bandwechsel schon', real.events.filter((e) => e.kind === 'wind-band').length >= 2);
  add('… und nennt das Band, nicht die Zahl',
    real.events.filter((e) => e.kind === 'wind-band').every((e) => /Band \d+–\d+ km\/h|Band < \d+|Band > \d+/.test(e.text)));
  add('… steigend und fallend sind unterscheidbar',
    real.events.some((e) => /steigen ins Band/.test(e.text)) && real.events.some((e) => /fallen ins Band/.test(e.text)));

  /* --- Windrichtung ------------------------------------------------------ */
  const rel = buildSchedule({
    columns: [col(0, { windRel: 'tail' }), col(1, { windRel: 'tail' }), col(2, { windRel: 'head' }), col(3, { windRel: 'head' })],
    windows: [], warnZones: [],
  });
  add('ein Richtungswechsel ergibt genau eine Zeile',
    rel.events.filter((e) => e.kind === 'wind-rel').length === 1
    && /dreht auf Gegenwind/.test(rel.events.find((e) => e.kind === 'wind-rel').text));

  /* --- Temperatur-Marken, interpoliert ----------------------------------- */
  const temp = buildSchedule({
    columns: [col(0, { tempC: 17 }), col(1, { tempC: 13 }), col(2, { tempC: 3 }), col(3, { tempC: 3 })],
    windows: [], warnZones: [],
  });
  const marks = temp.events.filter((e) => e.kind === 'temp-mark');
  add('jede überschrittene 5-°C-Marke bekommt eine Zeile', marks.length === 3, marks.map((m) => m.text).join(' | '));
  add('… mit „fällt unter" in der richtigen Richtung', marks.every((m) => /fällt unter/.test(m.text)));
  add('… und die 15er-Marke liegt zwischen den beiden Spalten', (() => {
    const m = marks.find((x) => /15 °C/.test(x.text));
    // 17 → 13 über 1 000 m: die 15 liegt bei der Hälfte.
    return Math.abs(m.distM - 500) < 1 && Math.abs(m.atMs - (T0 + 0.5 * H)) < 1000;
  })());
  add('ein Sprung über zwei Marken ergibt zwei Zeilen', (() => {
    const two = buildSchedule({ columns: [col(0, { tempC: 16 }), col(1, { tempC: 4 })], windows: [], warnZones: [] });
    return two.events.filter((e) => e.kind === 'temp-mark').length === 3;
  })());
  add('eine Temperatur, die um die Marke pendelt, erzeugt keine Zeile', (() => {
    const f = buildSchedule({
      columns: [col(0, { tempC: 10.2 }), col(1, { tempC: 9.8 }), col(2, { tempC: 10.2 }), col(3, { tempC: 9.8 })],
      windows: [], warnZones: [],
    });
    return f.events.filter((e) => e.kind === 'temp-mark').length === 0;
  })());
  add('die Frostmarke der gefühlten Temperatur ist eine eigene Aussage', (() => {
    const fr = buildSchedule({
      columns: [col(0, { apparentC: 3 }), col(1, { apparentC: -2 }), col(2, { apparentC: -2 }), col(3, { apparentC: 1 })],
      windows: [], warnZones: [],
    });
    const e = fr.events.filter((x) => x.kind === 'frost');
    return e.length === 2 && /fällt unter 0 °C/.test(e[0].text) && /steigt wieder über 0 °C/.test(e[1].text);
  })());

  /* --- Wolkenbasis und Schneefallgrenze ---------------------------------- */
  const cloud = buildSchedule({
    columns: [col(0, { terrainM: 600, cloudBaseM: 1200 }), col(1, { terrainM: 1000, cloudBaseM: 1200 }),
              col(2, { terrainM: 1400, cloudBaseM: 1200 }), col(3, { terrainM: 900, cloudBaseM: 1200 })],
    windows: [], warnZones: [],
  });
  add('der Weg steigt in die Wolkenbasis und kommt wieder heraus',
    cloud.events.some((e) => e.kind === 'cloud-in') && cloud.events.some((e) => e.kind === 'cloud-out'));
  add('… und die Zeile sagt „abgeleitet"', /abgeleitet/.test(cloud.events.find((e) => e.kind === 'cloud-in').text));
  add('ohne Wolkenbasis gibt es keine Zeile',
    !buildSchedule({ columns: plain, windows: [], warnZones: [] }).events.some((e) => e.kind === 'cloud-in'));

  const snow = buildSchedule({
    columns: [col(0, { terrainM: 1000, snowLineM: 1800 }), col(1, { terrainM: 1600, snowLineM: 1800 }),
              col(2, { terrainM: 2100, snowLineM: 1800 }), col(3, { terrainM: 2100, snowLineM: 1800 })],
    windows: [], warnZones: [],
  });
  add('die Schneefallgrenze wird als Übergang gemeldet',
    snow.events.some((e) => e.kind === 'snowline-up' && /1800 m/.test(e.text)));
  add('… nur wo die Quelle sie liefert (AT/CH)',
    !buildSchedule({ columns: plain, windows: [], warnZones: [] }).events.some((e) => e.kind === 'snowline-up'));

  /* --- Grenzwerte (K2) ---------------------------------------------------- */
  const secs = [
    { fromIdx: 0, toIdx: 1, fromM: 0, toM: 1500, fromMs: T0, toMs: T0 + 1.5 * H, status: 'go', lead: null, leadIdx: 0, unclear: [] },
    { fromIdx: 1, toIdx: 2, fromM: 1500, toM: 2500, fromMs: T0 + 1.5 * H, toMs: T0 + 2.5 * H, status: 'no-go',
      lead: { id: 'gust', value: 52, limit: 40, excess: 12, kind: 'over', severity: 1, conf: 0.8 }, leadIdx: 2, unclear: [] },
    { fromIdx: 2, toIdx: 3, fromM: 2500, toM: 3000, fromMs: T0 + 2.5 * H, toMs: T0 + 3 * H, status: 'go', lead: null, leadIdx: 3, unclear: [] },
  ];
  const lim = buildSchedule({ columns: plain, windows: [], warnZones: [], sections: secs });
  add('ein Grenzwert-Wechsel bekommt eine Zeile — der erste Abschnitt nicht',
    lim.events.filter((e) => e.kind === 'limit-break').length === 1
    && lim.events.filter((e) => e.kind === 'limit-ok').length === 1);
  add('… und sie sagt „dein Grenzwert" samt Wert gegen Grenze',
    /Dein Grenzwert: No-Go — Böen 52 km\/h gegen 40 km\/h/.test(lim.events.find((e) => e.kind === 'limit-break').text));
  add('ohne Abschnitte steht kein Grenzwert im Plan',
    !buildSchedule({ columns: plain, windows: [], warnZones: [] }).events.some((e) => e.kind.startsWith('limit')));

  /* --- Ordnung und Deckel -------------------------------------------------- */
  add('der Plan ist nach Uhrzeit geordnet',
    rain.events.every((e, i) => i === 0 || e.atMs >= rain.events[i - 1].atMs));
  add('bei gleicher Zeit steht der Start zuerst und die Ankunft zuletzt', (() => {
    const all = buildSchedule({ columns: plain, windows: win, warnZones: [] }).events;
    return all[0].kind === 'start' && all[all.length - 1].kind === 'goal';
  })());
  add('ein Deckel kürzt nie still — `omitted` sagt die Zahl', (() => {
    const capped = buildSchedule({ columns: plain, windows: win, warnZones: [], maxEvents: 3 });
    return capped.events.length === 3 && capped.omitted > 0;
  })());
  add('… und ohne Deckelung ist `omitted` null', rain.omitted === 0);

  /* --- Text ---------------------------------------------------------------- */
  const txt = buildScheduleText({
    tourName: 'Testtour',
    schedule: rain,
    clock: (ms) => new Date(ms).toISOString().slice(11, 16),
    gaps: ['Lücke A'],
  });
  add('der Text nennt die Tour', /Zeitplan · Wetter entlang der Route — Testtour/.test(txt));
  add('… enthält jede Zeile', rain.events.every((e) => txt.includes(e.text)));
  add('… trägt Uhrzeit und Kilometer je Zeile', /\d\d:\d\d {2}km \d+,\d/.test(txt));
  add('… den Vorbehalt', txt.includes(SCHEDULE_NOTE));
  add('… die genannten Lücken', txt.includes('Lücke A'));
  add('… und KEINEN Link (B3)', !/https?:\/\//.test(txt));
  add('ein leerer Plan sagt es im Text',
    /ändert sich nichts/.test(buildScheduleText({ tourName: 'x', schedule: { events: [], omitted: 0 }, clock: () => '00:00' })));

  add('der Vorbehalt sagt, dass es um ÄNDERUNGEN geht',
    /Änderungen, nicht Zustände/.test(SCHEDULE_NOTE));
  add('… und dass zwischen zwei Abtastpunkten etwas fehlen kann',
    /dazwischen/.test(SCHEDULE_NOTE));
}

console.log('\n— Verdrahtung des Zeitplans (R3D-7) —');
{
  const rv16 = codeOnly(readFileSync(join(ROOT, 'src', 'route', 'route3d', 'Route3DView.tsx'), 'utf8'));
  add('der Plan hängt an keinem Modus und an keiner Bühne', (() => {
    const i = rv16.indexOf('<SchedulePanel');
    if (i < 0) return false;
    // Er steht zwischen dem Regler-Abschnitt und der Fußzeile — nicht in einem
    // `dmode ===`- oder `stage ===`-Zweig.
    const before = rv16.slice(Math.max(0, i - 400), i);
    return !/dmode === |stage === /.test(before);
  })());
  add('… bekommt die Grenzwert-Abschnitte (K2)', /sections,\s*\}\),\s*\[scene\.columns, scene\.warnZones, windows, sections\]/.test(rv16));
  add('… und die strukturellen Lücken samt Hagel',
    /scene\.availability\.warnings\.any/.test(rv16) && /scene\.availability\.snowLine\.any/.test(rv16)
    && /g\.push\(HAIL_NOTE\)/.test(rv16));
  add('eine Zeile setzt die Position', /onPick=\{\(m\) => setPos\(m\)\}/.test(rv16));
  add('„Als Text kopieren" teilt Text, keinen Link',
    /buildScheduleText\(/.test(rv16) && /navigator\.clipboard\.writeText\(text\)/.test(rv16));

  const css16 = readFileSync(join(ROOT, 'src', 'route', 'route3d', 'route3d.css'), 'utf8');
  const printIdx = css16.indexOf('@media print');
  const printBlock = css16.slice(printIdx, css16.indexOf('}\n', css16.indexOf('.r3-plan-row button', printIdx)));
  add('im Druck bleibt der Plan stehen — er IST die Schriftform',
    !/\.r3-plan[ ,{]/.test(css16.slice(printIdx, printIdx + 400).split('display: none')[0] + '')
    || !new RegExp('display: none[^}]*\\.r3-plan\\b').test(printBlock));
  add('… ohne den Kopieren-Knopf', /\.r3-plan-copy \{ display: none/.test(printBlock));
  add('… und ohne eine Zeile mitten zu zerreißen', /\.r3-plan-row \{ break-inside: avoid/.test(printBlock));
  add('mobil misst jede Zeile 44 px', (() => {
    const i = css16.indexOf('@media (max-width: 767px)');
    const m = css16.slice(i);
    return /\.r3-plan-row button \{[^}]*44px/.test(m) && /\.r3-plan-copy \{ min-height: 44px/.test(m);
  })());
}

console.log(`\n${fail === 0 ? '✓' : '✗'} verify:route-3d — ${pass}/${pass + fail}\n`);
process.exit(fail === 0 ? 0 : 1);
