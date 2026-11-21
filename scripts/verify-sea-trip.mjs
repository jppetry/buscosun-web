/**
 * verify:sea-trip — Phase AM (`audit/seewetter-ausfahrt.md`): the trip planner in three modes on /seewetter.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-trip.mjs
 *
 * Fixtures are REAL files (`scripts/lib/fixtures/sea/`):
 *   trip/wind.json                     buscosun Fusion at the 13 sample points of the leg Laboe → 54.62 N 10.30 E → Marstal,
 *                                      recorded 19.11.2026 with the client's cube path (`trip-record-fixtures.mjs`)
 *   trip/f-2026111812-019|022.png      CWAM field images of 19.11.2026 07:00 and 10:00 UTC, byte-exact
 *   ripples/uv-2026111812-006|009.png  u/v images of the BSH run for the same two hours (phase SR)
 *   static/areas.json, static/spots.json, dk/spots-dk.json   the published areas and catalogues
 *   su-spots-2026111712*.json, su-catalog.json               a published spot file with its wind refresh (Strand)
 *   audit/seewetter/fixtures/WODL45_EDZW_071200 | _070900    two real warning bulletins (one with a message)
 *
 *   A  fixtures: real shape, hashes, the reader of the engine's steps against a second rule
 *   B  route, position per hour, arrival = distance / speed (the current never enters)
 *   C  course per stretch incl. the wrap 350° → 10°; wind, wave and current relative to the course
 *   D  sampling against the real field files: wave and current at the positions of the leg, land, missing hours,
 *      and which hour has a field at all
 *   E  rows, status, pieces of the route, findings — against values read off the fixtures
 *   F  departure comparison
 *   G  area hit test and the official texts, verbatim
 *   H  Strand: order on the real spot file, dusk classes, default window
 *   I  link round trip for all three modes and an old `pl=` link
 *   J  wording; display without a browser; wiring
 * Every section carries negative controls.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { decodePng, encodePng, toRgba } from './lib/png.mjs';
import { parseSpotsDoc, mergeWindDoc } from '../src/sea/seaClient.ts';
import { SEA_MODELS, SEA_SPOT_STEPS, SEA_WATER, decodeDir, decodeHs, decodePeriod, mergeSpotCatalogs, seaCellCentre, seaFieldStepAt } from '../src/sea/seaContract.ts';
import { MS_TO_KN, SEA_PROFILE_BY_ID, shoreAngle } from '../src/sea/seaProfiles.ts';
import { buildSeaUrl, parseSeaUrl, SEA_DEFAULT_STATE, SEA_ET_RE, SEA_SD_RE } from '../src/sea/seaState.ts';
import { parseSeaBulletin } from '../src/sea/seaText.ts';
import { sunAltitudeDeg } from '../src/photo/sun.ts';
import { SEA_CURRENT_FIELD, SEA_CURRENT_UV, currentUvCell, decodeUvField, windAgainstCurrent } from '../src/sea/seaCurrent.ts';
import { FUSION_PARTS } from '../src/pointForecast/fusion/fusionRelease.ts';
import { fusionPathFor } from '../src/pointForecast/fusionForecast.ts';
import * as P from '../src/sea/seaPlanner.ts';
import * as T from '../src/sea/seaTrip.ts';
import * as D from '../src/sea/seaTripData.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const J = (f) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const H = 3_600_000, near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const UTC = (d, h, m = 0) => Date.UTC(2026, 10, d, h, m);

// --- A: fixtures ---------------------------------------------------------------------------------------------------
const WIND = J('trip/wind.json'), MAN = J('trip/manifest.json');
const CAT = mergeSpotCatalogs(J('static/spots.json').spots, J('dk/spots-dk.json').spots);
const AREAS = J('static/areas.json');
const laboe = CAT.find((s) => s.id === 'laboe'), marstal = CAT.find((s) => /marstal/.test(s.id));
const fieldOf = (step) => { const b = readFileSync(join(FIX, 'trip', `f-2026111812-${String(step).padStart(3, '0')}.png`)); const png = decodePng(b); return { bytes: b, rgba: toRgba(png), width: png.width, height: png.height }; };
const F19 = fieldOf(19), F22 = fieldOf(22);
const uvOf = (h) => decodeUvField(toRgba(decodePng(readFileSync(join(FIX, 'ripples', `uv-2026111812-00${h}.png`)))));
const UV6 = uvOf(6), UV9 = uvOf(9);
const RUN_MS = UTC(18, 12), T07 = UTC(19, 7), T10 = UTC(19, 10);
add('A1 Fixtures: 13 Probenpunkte mit je 81 Stunden von buscosun Fusion 14 (Cube-Pfad wie der Producer), zwei CWAM-Bilder 630 × 387 mit den Hashes des Manifests, zwei u/v-Bilder des BSH für dieselben Stunden',
  WIND.samples.length === 13 && WIND.samples.every((s) => s.hours.length === 81 && s.raw.length >= 81) && WIND.stage === 14 && /country: 'DE'.*includeRadarNowcast: false/.test(WIND.call)
  && F19.width === 630 && F19.height === 387 && F22.width === 630 && sha(F19.bytes) === MAN.files['f-2026111812-019.png'].sha256 && sha(F22.bytes) === MAN.files['f-2026111812-022.png'].sha256
  && UV6 && UV9 && UV6.nx === SEA_CURRENT_UV.nx && seaFieldStepAt((T07 - RUN_MS) / H) === 19 && seaFieldStepAt((T10 - RUN_MS) / H) === 22,
  `${WIND.samples.length} Punkte, Stand ${WIND.stage}, t1 ${WIND.t1}`);
// The reader of the engine's steps (`windSeriesOfSteps`) against a second rule on the raw means.
const stepsOf = (s) => s.raw.map(([validAtMs, w, g, d]) => ({ validAtMs, vars: { wind: { mean: w }, gust: { mean: g }, windDir: { mean: d } } }));
let readerOk = true, dropped = 0, noDir = 0;
for (const s of WIND.samples) {
  const got = D.windSeriesOfSteps(stepsOf(s));
  for (const [t, w, g, d] of s.raw) {
    const x = got.get(t), wq = w == null ? null : Math.round(w * 10), gq = g == null ? null : Math.round(g * 10);
    const gust = gq != null && wq != null && gq + 5 < wq ? null : gq;
    if (gust == null && gq != null) dropped++;
    if (wq == null) { if (x) readerOk = false; continue; }
    const dir = d == null ? null : ((Math.round(d) % 360) + 360) % 360;
    if (dir == null) noDir++;
    if (!x || !near(x.windMs, wq / 10) || (gust == null ? x.gustMs != null : !near(x.gustMs, gust / 10)) || x.windDir !== dir) readerOk = false;
  }
  if (JSON.stringify([...got].map(([t, v]) => [t, v.windMs, v.gustMs, v.windDir])) !== JSON.stringify(s.hours)) readerOk = false;
}
add('A2 Leser der Motor-Schritte: Wind und Böen auf 0,1 m/s, eine Böe unter dem Wind entfällt, eine Stunde ohne Richtung bleibt ohne — gegen eine zweite Regel auf den Rohwerten und gegen die aufgezeichnete Reihe',
  readerOk && noDir > 300, `${noDir} Stunden ohne Richtung, ${dropped} Böen entfallen`);
add('A3 außerhalb des Cubes: keine Schritte ⇒ keine Reihe (nie eine leere Reihe aus Nullen); halbe Stunden zählen nicht',
  D.windSeriesOfSteps([]) === null && D.windSeriesOfSteps(null) === null && D.windSeriesOfSteps([{ validAtMs: T07, vars: {} }]) === null
  && D.windSeriesOfSteps([{ validAtMs: T07 + 30 * 60_000, vars: { wind: { mean: 5 } } }]) === null && D.windSeriesOfSteps([{ validAtMs: T07, vars: { wind: { mean: 5 } } }]).get(T07).windMs === 5);

// --- B: route, position per hour, arrival ---------------------------------------------------------------------------
const PTS = WIND.points;
const route = T.tripRoute(PTS);
const legKm = [P.planDistKm(PTS[0], PTS[1]), P.planDistKm(PTS[1], PTS[2])];
add('B1 Route: zwei Teilstücke, Strecke = Summe der Großkreis-Abstände, Kurs je Teilstück = Anfangspeilung; der Start ist die Wasserzelle des Spots Laboe',
  route.legs.length === 2 && near(route.km, legKm[0] + legKm[1]) && near(route.km, WIND.km, 1e-9) && near(route.legs[0].course, P.planBearingDeg(PTS[0], PTS[1])) && near(route.legs[1].startKm, legKm[0])
  && PTS[0].spot === 'laboe' && near(PTS[0].lat, +seaCellCentre('cwam', laboe.cell.i, laboe.cell.j).lat.toFixed(4)) && T.spotOfPoint(PTS[0], CAT) === 'laboe' && T.spotOfPoint(PTS[1], CAT) === undefined && T.spotOfPoint(PTS[2], CAT) === marstal.id,
  `${route.km.toFixed(2)} km, Kurse ${route.legs.map((l) => l.course.toFixed(1)).join('° / ')}°`);
const SPEED = 8, tl = T.tripTimeline(route, SPEED, T07);
const wantMin = Math.round((route.km / (SPEED * 1.852)) * 60);
add('B2 Ankunft = Strecke / eingegebene Fahrt, auf die Minute; Dauer 3 h 41 min bei 8 kn',
  tl.durMin === wantMin && tl.arriveMs === T07 + wantMin * 60_000 && T.durText(tl.durMin) === '3 h 41 min' && tl.departMs === T07, `${T.durText(tl.durMin)}, ${T.nmText(route.km)}`);
const stopKm = tl.stops.map((s) => s.pos.km);
add('B3 Ort je volle Stunde: Stunde n liegt n × Fahrt hinter dem Start, auf dem richtigen Teilstück mit dessen Kurs; danach die Ankunft am Ziel mit ihrer Minute und der nächsten vollen Stunde als Wertestunde',
  tl.stops.length === 5 && tl.stops.slice(0, 4).every((s, n) => near(s.pos.km, n * SPEED * 1.852, 1e-9) && s.tMs === T07 + n * H && s.hourMs === s.tMs && !s.arrival)
  && tl.stops[0].start && tl.stops[1].pos.leg === 0 && tl.stops[2].pos.leg === 1 && tl.stops[3].pos.leg === 1 && near(tl.stops[1].pos.course, route.legs[0].course) && near(tl.stops[3].pos.course, route.legs[1].course)
  && near(P.planDistKm(PTS[0], tl.stops[1].pos), SPEED * 1.852, 1e-6) && near(P.planDistKm(PTS[1], tl.stops[2].pos), 2 * SPEED * 1.852 - legKm[0], 1e-6)
  && tl.stops[4].arrival && near(tl.stops[4].pos.lat, PTS[2].lat) && tl.stops[4].tMs === tl.arriveMs && tl.stops[4].hourMs === UTC(19, 11),
  stopKm.map((k) => k.toFixed(1)).join(' · '));
const tlExact = T.tripTimeline(T.tripRoute([{ lat: 54.5, lon: 10.3 }, P.planDestination({ lat: 54.5, lon: 10.3 }, 20, 3 * 5 * 1.852)]), 5, T07);
add('B4 Ankunft genau auf einer vollen Stunde: keine doppelte Spalte; ohne Teilstück, ohne Fahrt oder mit Fahrt 0 keine Zeitachse',
  tlExact.stops.length === 4 && tlExact.stops[3].arrival && tlExact.stops[3].tMs === T07 + 3 * H && tlExact.stops[3].hourMs === T07 + 3 * H
  && T.tripTimeline(T.tripRoute([PTS[0]]), 5, T07) === null && T.tripTimeline(route, 0, T07) === null && T.tripTimeline(T.tripRoute([PTS[0], PTS[0]]), 5, T07) === null);
const sm = T.tripSamples(route);
add('B5 Probenpunkte: je Teilstück Anfang, Ende und dazwischen keiner weiter als 5 km vom nächsten — die 13 aufgezeichneten; über 24 Punkte wächst der Abstand und die Seite sagt es',
  sm.samples.length === 13 && !sm.widened && sm.samples.every((s, i) => near(s.lat, WIND.samples[i].lat) && near(s.lon, WIND.samples[i].lon) && near(s.km, WIND.samples[i].km, 1e-3))
  && sm.samples.slice(1).every((s, i) => s.km - sm.samples[i].km <= T.SEA_TRIP_SAMPLE_KM + 1e-9) && near(sm.samples[5].lat, PTS[1].lat) && near(sm.samples[5].km, legKm[0], 1e-9)
  && (() => { const long = T.tripSamples(T.tripRoute([{ lat: 54.0, lon: 7.0 }, { lat: 54.0, lon: 11.0 }])); return long.widened && long.samples.length <= T.SEA_TRIP_MAX_SAMPLES && long.stepKm > 5 && /weiter als die üblichen 5 km/.test(T.tripSampleNote(long.samples.length, long.stepKm, true)); })()
  && T.nearestSample(sm.samples, 44.4) === 10 && T.nearestSample(sm.samples, 0) === 0 && T.nearestSample([], 3) === -1);

// --- C: course per stretch incl. the wrap; relative classes ---------------------------------------------------------
const o = { lat: 54.6, lon: 10.4 }, wA = P.planDestination(o, 350, 12), wB = P.planDestination(wA, 10, 12);
const wrap = T.tripRoute([o, wA, wB]);
add('C1 Kurs je Teilstück über Nord: 350° dann 10°; die Drehung ist +20°, nicht −340°',
  near(wrap.legs[0].course, 350, 1e-6) && near(wrap.legs[1].course, 10, 0.05) && near(P.angleDiff(wrap.legs[1].course, wrap.legs[0].course), 20, 0.05) && T.routePosAt(wrap, 18).leg === 1 && T.routePosAt(wrap, 6).leg === 0,
  wrap.legs.map((l) => l.course.toFixed(2)).join(' / '));
add('C2 Wind zum Kurs über Nord: Wind aus 5° auf Kurs 350° kommt von vorn, auf Kurs 190° von hinten; aus 80° auf Kurs 350° von der Seite; ohne Richtung keine Klasse',
  P.relativeWind(5, 350) === 'vorn' && P.relativeWind(5, 190) === 'hinten' && P.relativeWind(80, 350) === 'seite' && P.relativeWind(40, 350) === 'schraeg-vorn' && P.relativeWind(null, 350) === null);
add('C3 Strom zum Kurs („setzt nach“): 355° auf Kurs 5° = mit, 185° = gegen, 95° = quer; genau 45° noch mit, 46° quer; unter 0,2 kn keine Klasse — Gegenprobe: dieselben Winkel mit „kommt aus“ gelesen kehren mit/gegen um',
  T.currentToCourse({ kn: 0.6, to: 355 }, 5) === 'mit' && T.currentToCourse({ kn: 0.6, to: 185 }, 5) === 'gegen' && T.currentToCourse({ kn: 0.6, to: 95 }, 5) === 'quer'
  && T.currentToCourse({ kn: 0.6, to: 50 }, 5) === 'mit' && T.currentToCourse({ kn: 0.6, to: 51 }, 5) === 'quer' && T.currentToCourse({ kn: 0.6, to: 140 }, 5) === 'gegen' && T.currentToCourse({ kn: 0.6, to: 139 }, 5) === 'quer'
  && T.currentToCourse({ kn: 0.19, to: 355 }, 5) === null && T.currentToCourse({ kn: 0.2, to: 355 }, 5) === 'mit' && T.currentToCourse(null, 5) === null && T.currentToCourse({ kn: 1, to: 0 }, null) === null
  && T.currentToCourse({ kn: 0.6, to: (355 + 180) % 360 }, 5) === 'gegen');

// --- D: sampling against the real field files -----------------------------------------------------------------------
const G = SEA_MODELS.cwam.grid;
/** Second rule: the pixel of the nearest cell, read directly. */
const pixelWave = (f, pos) => {
  const i = Math.round((pos.lon - G.lon1) / G.di), j = Math.round((G.lat1 - pos.lat) / G.dj), o4 = (j * f.width + i) * 4;
  if (i < 0 || j < 0 || i >= G.ni || j >= G.nj || f.rgba[o4 + 3] !== SEA_WATER) return 'land';
  const hs = decodeHs(f.rgba[o4]);
  return { hs, dir: hs == null ? null : decodeDir(f.rgba[o4 + 1]), per: hs == null ? null : decodePeriod(f.rgba[o4 + 2]) };
};
const legPos = Array.from({ length: 23 }, (_, k) => T.routePosAt(route, (route.km * k) / 22));
const waves = legPos.map((p) => D.waveAt(F19, p));
add('D1 Welle am Ort aus dem echten CWAM-Bild (19.11. 07 UTC): an 23 Orten der Etappe gleich dem Pixel der nächsten Zelle (zweite Regel), alle im Wasser, Höhen 0,05–1 m',
  waves.every((w, k) => w !== 'land' && w && JSON.stringify(w) === JSON.stringify(pixelWave(F19, legPos[k])) && w.hs >= 0.05 && w.hs < 1.2 && w.per > 1 && w.dir >= 0 && w.dir < 360),
  waves.filter((_, k) => k % 5 === 0).map((w) => `${w.hs.toFixed(2)} m/${w.per.toFixed(1)} s`).join(' · '));
add('D2 Land und Rand: ein Ort an Land (Neumünster), einer außerhalb des Gitters (Hannover) ⇒ „Land“, nie ein Wert; ohne Bild der Stunde ⇒ keine Daten; die zweite Stunde (10 UTC) trägt andere Werte',
  D.waveAt(F19, { lat: 54.07, lon: 9.98 }) === 'land' && D.waveAt(F19, { lat: 52.37, lon: 9.73 }) === 'land' && D.waveAt(null, legPos[5]) === null && D.waveAt(undefined, legPos[5]) === null
  && legPos.some((p) => JSON.stringify(D.waveAt(F22, p)) !== JSON.stringify(D.waveAt(F19, p))) && legPos.every((p) => JSON.stringify(D.waveAt(F22, p)) === JSON.stringify(pixelWave(F22, p))));
// Current: at a cell centre the bilinear sample is the cell's own value; between cells it lies inside the four around it.
let curCentre = true, curInside = true, curN = 0;
for (const p of legPos) {
  const c = D.currentAt(UV6, p);
  if (!c || c === 'land') { curInside = false; continue; }
  curN++;
  const x = ((p.lon - G.lon1) / G.di) / SEA_CURRENT_UV.stride, y = ((G.lat1 - p.lat) / G.dj) / SEA_CURRENT_UV.stride;
  const xs = [Math.floor(x), Math.floor(x) + 1], ys = [Math.floor(y), Math.floor(y) + 1], us = [], vs = [];
  for (const cy of ys) for (const cx of xs) { const q = cy * UV6.nx + cx; if (UV6.ok[q]) { us.push(UV6.u[q]); vs.push(UV6.v[q]); } }
  const u = (c.kn / MS_TO_KN) * Math.sin((c.to * Math.PI) / 180), v = (c.kn / MS_TO_KN) * Math.cos((c.to * Math.PI) / 180);
  if (!(u >= Math.min(...us) - 1e-6 && u <= Math.max(...us) + 1e-6 && v >= Math.min(...vs) - 1e-6 && v <= Math.max(...vs) + 1e-6)) curInside = false;
}
for (const [cx, cy] of [[148, 122], [150, 110], [160, 100]]) {
  const cell = currentUvCell(cx, cy), q = cy * UV6.nx + cx;
  if (!UV6.ok[q]) continue;
  const c = D.currentAt(UV6, cell), ms = Math.hypot(UV6.u[q], UV6.v[q]);
  if (!c || c === 'land' || !near(c.kn, ms * MS_TO_KN, 1e-5) || (ms > 0 && !near(c.to, ((Math.atan2(UV6.u[q], UV6.v[q]) * 180) / Math.PI + 360) % 360, 1e-3))) curCentre = false;
}
const cur6 = legPos.map((p) => D.currentAt(UV6, p)), cur9 = legPos.map((p) => D.currentAt(UV9, p));
add('D3 Strom am Ort aus den echten u/v-Bildern des BSH: an allen 23 Orten ein Wert zwischen den vier Zellen um den Ort, an einer Zellmitte genau der Wert der Zelle; „setzt nach“ aus u (Ost) und v (Nord); an Land kein Wasserpunkt; ohne Bild keine Daten',
  curN === 23 && curInside && curCentre && D.currentAt(UV6, { lat: 54.07, lon: 9.98 }) === 'land' && D.currentAt(null, legPos[3]) === null
  && cur6.every((c) => c.kn >= 0 && c.kn < 1 && c.to >= 0 && c.to < 360) && cur6.some((c, k) => !near(c.kn, cur9[k].kn, 1e-3)),
  `07 UTC ${cur6.filter((_, k) => k % 5 === 0).map((c) => `${c.kn.toFixed(2)} kn → ${Math.round(c.to)}°`).join(' · ')}`);

add('D4 Stunde des Wellenfelds: nur das Feld GENAU dieser Stunde — stündlich bis +48 h, danach nur jede dritte (51, 54 …); +49, +50, +52 h, eine halbe Stunde, vor dem Lauf und hinter +78 h ⇒ keines, nie das Feld der Nachbarstunde (Gegenprobe: `seaFieldStepAt` selbst gäbe für +50 h das Feld von +48 h)',
  D.tripFieldStep(RUN_MS, T07) === 19 && D.tripFieldStep(RUN_MS, RUN_MS) === 0 && D.tripFieldStep(RUN_MS, RUN_MS + 48 * H) === 48 && D.tripFieldStep(RUN_MS, RUN_MS + 51 * H) === 51 && D.tripFieldStep(RUN_MS, RUN_MS + 78 * H) === 78
  && [49, 50, 52, 53, 79, -1, 19.5].every((l) => D.tripFieldStep(RUN_MS, RUN_MS + l * H) === null) && seaFieldStepAt(50) === 48);

// --- E: rows, status, pieces, findings --------------------------------------------------------------------------------
const windMap = new Map(WIND.samples.map((s) => [D.sampleKey(s), { series: new Map(s.hours.map(([t, w, g, d]) => [t, { windMs: w, gustMs: g, windDir: d }])), why: null }]));
const hoursMap = new Map([[T07, { wave: F19, uv: UV6 }], [T10, { wave: F22, uv: UV9 }]]);
const dataOf = (over = {}) => D.tripDataOf({ samples: sm.samples, wind: windMap, hours: hoursMap, spots: CAT, sight: null, runMs: RUN_MS, nowMs: UTC(19, 1), ...over });
const data = dataOf();
const NOLIM = { windMax: null, gustMax: null, hsMax: null }, names = { start: 'Laboe', end: 'Marstal' };
const rows = T.tripRows(tl, sm.samples, data, NOLIM, names);
const wAt = (si, t) => { const h = WIND.samples[si].hours.find((x) => x[0] === t); return { windMs: h[1], gustMs: h[2], windDir: h[3] }; };
const r0 = rows[0], r3 = rows[3], r4 = rows[4];
add('E1 Zeilen: je Stunde der Wind des nächsten Probenpunkts (Start: Punkt 0; 10 UTC bei 44,4 km: Punkt 10), Welle und Strom am Ort aus dem Bild DIESER Stunde; Ort „Laboe“, „8 sm“ …, „Marstal“',
  rows.length === 5 && JSON.stringify(r0.wind) === JSON.stringify(wAt(0, T07)) && JSON.stringify(r3.wind) === JSON.stringify(wAt(10, T10)) && JSON.stringify(r4.wind) === JSON.stringify(wAt(12, UTC(19, 11)))
  && JSON.stringify(r0.wave) === JSON.stringify(pixelWave(F19, tl.stops[0].pos)) && JSON.stringify(r3.wave) === JSON.stringify(pixelWave(F22, tl.stops[3].pos))
  && r3.cur && r3.cur !== 'land' && near(r3.cur.kn, D.currentAt(UV9, tl.stops[3].pos).kn) && rows.map((r) => r.place).join('|') === `Laboe|${T.nmText(SPEED * 1.852)}|${T.nmText(2 * SPEED * 1.852)}|${T.nmText(3 * SPEED * 1.852)}|Marstal` && rows[1].place === '8 sm',
  `Start ${(r0.wind.windMs * MS_TO_KN).toFixed(1)} kn aus ${r0.wind.windDir}°, 10 UTC ${(r3.wind.windMs * MS_TO_KN).toFixed(1)} kn aus ${r3.wind.windDir}°`);
add('E2 Stunden ohne Bild (08, 09, 11 UTC): Welle und Strom „keine Daten“, nie die Nachbarstunde; der Wind steht trotzdem da; diese Zeilen sind „ein Wert fehlt“, die mit allen Werten „innerhalb“',
  rows[1].wave === null && rows[2].wave === null && r4.wave === null && rows[1].cur === null && rows[1].wind.windMs != null && rows.map((r) => r.status).join(',') === 'in,missing,missing,in,missing');
const relOf = (r) => P.relativeWind(r.wind.windDir, r.stop.pos.course);
add('E3 Wind, Welle, Strom zum Kurs des Teilstücks: je Zeile nach der zweiten Regel (Winkel zur Anfangspeilung des Teilstücks); die Startstunde trägt in der echten Reihe keine Windrichtung ⇒ dort keine Klasse',
  rows.every((r) => r.rel === relOf(r)) && r0.wind.windDir === null && r0.rel === null && r3.rel != null && r3.waveRel === P.relativeWind(r3.wave.dir, route.legs[1].course) && r0.waveRel === P.relativeWind(r0.wave.dir, route.legs[0].course)
  && r3.curRel === T.currentToCourse(r3.cur, route.legs[1].course) && rows[1].waveRel === null && rows[1].curRel === null,
  rows.map((r) => r.rel).join(' · '));
// Limits just below the real maxima.
const gustKn = rows.map((r) => r.wind.gustMs * MS_TO_KN), windKn = rows.map((r) => r.wind.windMs * MS_TO_KN), maxG = Math.max(...gustKn), maxW = Math.max(...windKn);
const LIM = { windMax: Math.floor(maxW) - 1, gustMax: Math.floor(maxG) - 1, hsMax: 0.15 };
const rowsL = T.tripRows(tl, sm.samples, data, LIM, names), fL = T.tripFindings(rowsL, tl, LIM, 'kn', PTS[2]);
const wantOver = rowsL.map((r, k) => ({ wind: windKn[k] > LIM.windMax, gust: gustKn[k] > LIM.gustMax, wave: r.wave && r.wave !== 'land' ? r.wave.hs > LIM.hsMax : false }));
add('E4 „über deiner Grenze“: Wind, Böen, Welle je Stunde gegen die Grenze (zweite Regel in Knoten und Metern); eine Zeile darüber ist rot, auch wenn ihr ein anderer Wert fehlt',
  JSON.stringify(rowsL.map((r) => r.over)) === JSON.stringify(wantOver) && rowsL.every((r, k) => (r.status === 'over') === (wantOver[k].wind || wantOver[k].gust || wantOver[k].wave)) && rowsL.some((r) => r.status === 'over'),
  rowsL.map((r) => r.status).join(','));
const pieces = T.tripPieces(route, rowsL), cat = pieces.flatMap((p) => p.coords);
add('E5 Strang auf der Karte: Stücke in der Reihenfolge der Etappe, jedes von der halben Strecke zur Zeile davor bis zur halben zur Zeile danach, gleiche Nachbarn verschmolzen, lückenlos vom Start bis zum Ziel, der Wegpunkt liegt in seinem Stück',
  pieces.length >= 1 && near(cat[0][1], PTS[0].lat) && near(cat[cat.length - 1][0], PTS[2].lon) && pieces.slice(1).every((p, i) => p.status !== pieces[i].status && near(p.coords[0][0], pieces[i].coords.at(-1)[0]) && near(p.coords[0][1], pieces[i].coords.at(-1)[1]))
  && cat.some(([lon, lat]) => near(lon, PTS[1].lon) && near(lat, PTS[1].lat))
  && JSON.stringify(T.tripPieces(route, rows).map((p) => p.status)) === JSON.stringify(['in', 'missing', 'in', 'missing']),
  pieces.map((p) => `${p.status}(${p.coords.length})`).join(' '));
const maxGi = gustKn.indexOf(maxG);
add('E6 Befunde: Böen und Wind mit Höchstwert und seiner Stunde, „über deiner Grenze“ mit der Zahl der Stunden; gezählt wird nur, was über einer Grenze liegt; Welle gegen 0,15 m; fehlende Stunden werden gesagt; Ankunft gegen Sonnenuntergang',
  fL.list[0].kind === 'gust' && fL.list[0].over && fL.list[0].text.startsWith(`Böen bis ${Math.round(maxG)} kn um ${new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(rowsL[maxGi].stop.hourMs).slice(0, 2)} Uhr, über deiner Grenze ${LIM.gustMax} kn in ${wantOver.filter((x) => x.gust).length} von 5 Stunden`)
  && fL.list.find((x) => x.kind === 'wind').over && /zum Kurs (durchgehend|ab \d\d Uhr)/.test(fL.list.find((x) => x.kind === 'wind').text) && fL.list.find((x) => x.kind === 'wave').over === wantOver.some((x) => x.wave)
  && fL.over === fL.list.filter((x) => x.over).length && fL.over === 2 + (wantOver.some((x) => x.wave) ? 1 : 0)
  && fL.list.some((x) => x.kind === 'missing' && x.text === 'Welle: keine Daten für 3 von 5 Stunden.') && fL.list.some((x) => x.kind === 'missing' && x.text === 'Strom: keine Daten für 3 von 5 Stunden.')
  && fL.list.some((x) => x.kind === 'sun' && /^Ankunft \d+ h( \d+ min)? vor Sonnenuntergang \(1[56]:\d\d Uhr\)$/.test(x.text)) && fL.gaps,
  fL.list.map((x) => x.text).join(' | ').slice(0, 250));
const f0 = T.tripFindings(rows, tl, NOLIM, 'kn', PTS[2]);
add('E7 Gegenprobe: ohne Grenzen kein roter Befund und Zähler 0; mit Grenzen weit über den Werten ebenso; in Beaufort stehen die Werte in Bft, die Grenze bleibt in kn',
  f0.over === 0 && f0.list.every((x) => !x.over) && T.tripFindings(T.tripRows(tl, sm.samples, data, { windMax: 99, gustMax: 99, hsMax: 9 }, names), tl, { windMax: 99, gustMax: 99, hsMax: 9 }, 'kn', null).over === 0
  && /^Böen bis \d+ Bft um \d\d Uhr, über deiner Grenze \d+ kn /.test(T.tripFindings(rowsL, tl, LIM, 'bft', null).list[0].text) && T.overCountText(0) === 'kein Hinweis' && T.overCountText(1) === '1 Hinweis' && T.overCountText(3) === '3 Hinweise');
// Evening departure: the northern sample points carry no wind direction any more (real state of the cube on the day of recording).
const tlEve = T.tripTimeline(route, SPEED, UTC(19, 18)), rowsEve = T.tripRows(tlEve, sm.samples, data, NOLIM, names), fEve = T.tripFindings(rowsEve, tlEve, NOLIM, 'kn', PTS[2]);
add('E8 Stunde ohne Windrichtung (echte Lage: nördliche Punkte ab dem Abend ohne Richtung): Wind und Böen stehen da, kein Wind zum Kurs, der Befund nennt die Zahl; nach Sonnenuntergang heißt die Ankunft „bei Dunkelheit“',
  rowsEve.filter((r) => r.wind.windMs != null && r.wind.windDir == null).length >= 2 && rowsEve.filter((r) => r.wind.windDir == null).every((r) => r.rel === null && !r.wac)
  && fEve.list.some((x) => x.kind === 'missing' && /^Windrichtung fehlt für \d von 5 Stunden: dort kein Wind zum Kurs\.$/.test(x.text)) && fEve.list.some((x) => x.kind === 'sun' && / nach Sonnenuntergang \(\d\d:\d\d Uhr\), also bei Dunkelheit$/.test(x.text)),
  `${rowsEve.filter((r) => r.wind.windDir == null).length} von 5 ohne Richtung`);
const emptyWind = new Map([...windMap].map(([k, v], i) => [k, i >= 8 ? { series: null, why: 'outside' } : v]));
const rowsOut = T.tripRows(tl, sm.samples, dataOf({ wind: emptyWind }), LIM, names), fOut = T.tripFindings(rowsOut, tl, LIM, 'kn', null);
add('E9 außerhalb des Cubes (Punkte ohne Rechnung): dort kein Wind, keine Böen, kein Ersatz — die Zeilen sind „ein Wert fehlt“, der Befund sagt „keine Daten“ mit der Zahl der Stunden; Gegenprobe: mit allen Punkten fehlt nichts',
  rowsOut.slice(3).every((r) => r.wind === null && r.rel === null && r.status === 'missing' && !r.over.wind && !r.over.gust) && rowsOut[0].wind != null
  && fOut.list.some((x) => x.text === 'Wind: keine Daten für 2 von 5 Stunden. Höchstwerte und Grenzen gelten nur für die übrigen.') && !fL.list.some((x) => /^Wind: keine Daten/.test(x.text)));
const wacRow = T.tripRows(T.tripTimeline(route, SPEED, T07), sm.samples, { ...data, wind: () => ({ windMs: 8, gustMs: 10, windDir: 200 }), cur: () => ({ kn: 0.8, to: 200 }) }, NOLIM, names);
const wacOff = T.tripRows(T.tripTimeline(route, SPEED, T07), sm.samples, { ...data, wind: () => ({ windMs: 8, gustMs: 10, windDir: 200 }), cur: () => ({ kn: 0.4, to: 200 }) }, NOLIM, names);
add('E10 „Wind gegen Strom“ nach der Regel der Seite (über 120°, Wind ab 10 kn, Strom ab 0,5 kn): Wind aus 200° gegen Strom nach 200° ⇒ Hinweis mit Zeit und Strecke, nie rot, nie gezählt; mit 0,4 kn Strom keiner',
  wacRow.every((r) => r.wac) && windAgainstCurrent({ windFromDeg: 200, windKn: 8 * MS_TO_KN, curToDeg: 200, curKn: 0.8 }).against && wacOff.every((r) => !r.wac)
  && (() => { const f = T.tripFindings(wacRow, tl, NOLIM, 'kn', null), x = f.list.find((y) => y.kind === 'wac'); return x && !x.over && f.over === 0 && /^Wind gegen Strom von \d\d bis \d\d Uhr, zwischen 0 sm und \d+ sm$/.test(x.text); })());
const sight = { meta: { conv: { state: 'ok', runMs: UTC(19, 0), run: '2026111900', thunderTo: UTC(19, 12), capeTo: UTC(20, 3), why: null }, vis: { state: 'none', why: 'x' } }, spots: { laboe: { conv: Array.from({ length: 79 }, (_, i) => (i === 19 ? 1 : 0)) } } };
add('E11 Schauer/Gewitter: der Hinweis des nächsten Katalog-Spots bis 15 km, mit Namen und Abstand; weiter weg oder ohne Spalte nichts',
  (() => { const c = D.convAt(CAT, sight, RUN_MS, UTC(19, 1), tl.stops[0].pos, T07); return c && c.cls === 1 && c.spot === 'Laboe' && c.km < 3; })()
  && D.convAt(CAT, sight, RUN_MS, UTC(19, 1), tl.stops[0].pos, T10)?.cls === 0 && D.convAt(CAT, sight, RUN_MS, UTC(19, 1), T.routePosAt(route, 30), T07) === null && D.convAt(CAT, null, RUN_MS, UTC(19, 1), tl.stops[0].pos, T07) === null
  && T.SEA_TRIP_CONV_KM === 15 && (() => { const rr = T.tripRows(tl, sm.samples, dataOf({ sight }), NOLIM, names); return T.tripFindings(rr, tl, NOLIM, 'kn', null).list.some((x) => x.kind === 'conv' && /^Schauer möglich um \d\d Uhr \(Hinweis vom Spot Laboe, \d km vom Ort der Etappe\)$/.test(x.text)); })());

// --- F: departure comparison ----------------------------------------------------------------------------------------
const axis = { fromMs: UTC(19, 6), toMs: UTC(22, 6) };
const cmp = T.tripCompare(route, SPEED, T07, sm.samples, data, LIM, 'kn', axis);
const overAt = (dep) => { const t = T.tripTimeline(route, SPEED, dep); const rr = T.tripRows(t, sm.samples, data, LIM, names); let n = 0; if (rr.some((r) => r.wind?.windMs * MS_TO_KN > LIM.windMax)) n++; if (rr.some((r) => r.wind?.gustMs * MS_TO_KN > LIM.gustMax)) n++; if (rr.some((r) => r.wave && r.wave !== 'land' && r.wave.hs > LIM.hsMax)) n++; return n; };
add('F1 „Abfahrt vergleichen“: gewählte Stunde, zwei Stunden früher, zwei später; je die Zahl der Befunde über deinen Grenzen (zweite Regel je Abfahrt neu gerechnet); eine Abfahrt vor der Vorhersage wird nicht gerechnet',
  cmp.length === 3 && cmp.map((c) => (c.departMs - T07) / H).join() === '-2,0,2' && cmp[1].chosen && !cmp[0].chosen && cmp[0].over === null && cmp[0].arriveMs === null
  && cmp[1].over === overAt(T07) && cmp[2].over === overAt(UTC(19, 9)) && cmp[1].over === fL.over && cmp[2].arriveMs === UTC(19, 9) + tl.durMin * 60_000,
  cmp.map((c) => (c.over == null ? '–' : c.over)).join(' / '));
const cmpLate = T.tripCompare(route, SPEED, UTC(19, 9), sm.samples, data, LIM, 'kn', axis), cmpNo = T.tripCompare(route, SPEED, UTC(19, 9), sm.samples, data, NOLIM, 'kn', axis);
add('F2 Gegenprobe: mit der späteren Abfahrt als gewählter zählt dieselbe Stunde dasselbe (07 UTC bleibt 07 UTC); ohne Grenzen überall 0; Lücken werden gemeldet',
  cmpLate[0].over === cmp[1].over && cmpLate[1].over === cmp[2].over && cmpNo.every((c) => c.over === 0) && cmp[1].gaps === true);

// --- G: areas and official texts ---------------------------------------------------------------------------------------
const direct = T.tripRoute([PTS[0], PTS[2]]), hits = T.tripAreas(direct, AREAS.features);
add('G1 Gebietstest (Laboe → Marstal, gerade): Westliche Ostsee und Küstenabschnitt Flensburg bis Fehmarn ab dem Start, Belte und Sund vor Marstal — in der Reihenfolge der Etappe, wie in Schritt 0 gemessen',
  hits.map((h) => h.name).join('|') === 'Westliche Ostsee|Flensburg bis Fehmarn|Belte und Sund' && hits[0].kind === 'sea' && hits[1].kind === 'coast' && hits[0].fromKm === 0 && hits[2].fromKm > 45 && near(hits[2].toKm, direct.km, 1e-6)
  && hits[0].toKm < hits[2].fromKm + 1, hits.map((h) => `${h.name} ${h.fromKm.toFixed(1)}–${h.toKm.toFixed(1)}`).join(' · '));
const bight = AREAS.features.find((f) => f.properties.name === 'Deutsche Bucht');
add('G2 Punkt in Fläche: Helgoland-Reede in „Deutsche Bucht“, Hannover in keiner; eine Etappe an Land quert kein Gebiet; ohne Teilstück keine Treffer',
  T.pointInArea(bight, 7.95, 54.25) && !AREAS.features.some((f) => T.pointInArea(f, 9.73, 52.37)) && T.tripAreas(T.tripRoute([{ lat: 52.3, lon: 9.7 }, { lat: 52.5, lon: 9.9 }]), AREAS.features).length === 0 && T.tripAreas(T.tripRoute([PTS[0]]), AREAS.features).length === 0);
const bull = (name) => parseSeaBulletin(new Uint8Array(readFileSync(join(ROOT, 'audit', 'seewetter', 'fixtures', name))), name, Date.UTC(2026, 9, 7, 13)).doc;
const W12 = bull('WODL45_EDZW_071200'), W09 = bull('WODL45_EDZW_070900');
const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const offB = T.tripOfficial(hits, W12, false);
const wb = W12.parts.seaAreas.find((a) => a.name === 'WESTERN BALTIC'), coastB = W12.parts.coasts.find((c) => c.coast === 'Ostseekueste');
add('G3 amtliche Texte der gequerten Gebiete im Wortlaut (echter WODL45 vom 07.10.): Westliche Ostsee = der Block WESTERN BALTIC, Zeichen für Zeichen, mit Ausgabezeit; die deutsche Ostseeküste = ihr Block; „Belte und Sund“ nennt der Bericht nicht ⇒ „Kein amtlicher Warnstatus“',
  offB.length === 3 && offB[0].title === 'Seegebiet Westliche Ostsee (WESTERN BALTIC)' && offB[0].text === wb.text && collapse(W12.raw).includes(collapse(wb.text)) && /^WODL45, herausgegeben .+ Uhr$/.test(offB[0].issued) && offB[0].note === null
  && offB[1].title === 'Seegebiet Belte und Sund' && offB[1].text === null && offB[1].note.startsWith('Kein amtlicher Warnstatus.') && /nicht „keine Warnung“/.test(offB[1].note)
  && offB[2].title === 'Deutsche Ostseeküste (Flensburg bis Fehmarn)' && offB[2].text === coastB.text && collapse(W12.raw).includes(collapse(coastB.text)),
  offB.map((x) => `${x.title}: ${(x.text ?? x.note).slice(0, 40)}`).join(' | '));
const nsRoute = T.tripRoute([{ lat: 54.19, lon: 7.9 }, { lat: 53.9, lon: 8.6 }]), nsHits = T.tripAreas(nsRoute, AREAS.features), offN = T.tripOfficial(nsHits, W12, false);
const gb = W12.parts.seaAreas.find((a) => a.name === 'GERMAN BIGHT');
add('G4 Warnfall (GERMAN BIGHT „N to NW 7 later.“): der Wortlaut steht unverändert da, nichts verschärft oder abgeschwächt; derselbe Kasten am Bericht ohne Warnung trägt dessen Satz; veraltet ⇒ Zusatz „gilt als unbekannt“; nicht lesbar ⇒ gesagt, nie „keine Warnung“',
  nsHits.some((h) => h.name === 'Deutsche Bucht') && offN.find((x) => /Deutsche Bucht/.test(x.title)).text === gb.text && /N to NW 7 later\./.test(gb.text) && gb.status === 'unknown'
  && T.tripOfficial(nsHits, W09, false).find((x) => /Deutsche Bucht/.test(x.title)).text === W09.parts.seaAreas.find((a) => a.name === 'GERMAN BIGHT').text
  && offN.some((x) => /^Deutsche Nordseeküste \(/.test(x.title) && x.text === W12.parts.coasts.find((c) => c.coast === 'Nordseekueste').text)
  && T.tripOfficial(nsHits, W12, true).every((x) => x.text == null || /älter als 4 Stunden und gilt deshalb als unbekannt/.test(x.note))
  && T.tripOfficial(nsHits, null, false).every((x) => x.text === null && (x.note === T.TRIP_STATUS_UNREADABLE || x.note.startsWith(T.TRIP_NO_STATUS))),
  offN.map((x) => x.title).join(' | '));

// --- H: Strand -------------------------------------------------------------------------------------------------------
const RUN = '2026111712', SU = J('su-catalog.json'), runMs = UTC(17, 12), N = SEA_SPOT_STEPS.length;
const sdoc = (() => { const NEW = J(`su-spots-${RUN}-w2026111715.json`); return mergeWindDoc(parseSpotsDoc(J(`su-spots-${RUN}.json`), RUN), { from: NEW.from, wind: NEW.wind, spots: NEW.spots }); })();
const FIRST = 5;
const hourOf = (id, k) => { const s = sdoc.series[id], i = FIRST + k; return s && i < N ? { t: runMs + i * H, windMs: s.wind[i], gustMs: s.gust[i], windDir: s.windDir[i], hs: s.hs[i] } : null; };
const win = { start: 6, end: 30 };
const sRows = T.strandRows(SU.spots, hourOf, win, 10, 'see');
const count = (sp, side) => { let n = 0; for (let k = win.start; k <= win.end; k++) { const a = shoreAngle(hourOf(sp.id, k)?.windDir ?? null, sp.normal); if (side === 'see' ? a === 'auflandig' || a === 'schraeg-auflandig' : a === 'ablandig' || a === 'schraeg-ablandig') n++; } return n; };
const byId = Object.fromEntries(sRows.map((r) => [r.id, r]));
add('H1 Strand auf der echten Spot-Datei (Lauf 17.11. 12 UTC, 3 Spots, 25 Stunden): Stunden mit Wind von See je Spot = zweite Regel (auflandig + schräg auflandig), die Liste absteigend danach; die gewählte Stunde trägt Wind, Welle und Uferwinkel der Datei',
  sRows.length === 3 && SU.spots.every((sp) => byId[sp.id].seaHours === count(sp, 'see') && byId[sp.id].landHours === count(sp, 'land') && byId[sp.id].knownHours === 25)
  && sRows.every((r, i) => i === 0 || sRows[i - 1].seaHours >= r.seaHours) && new Set(sRows.map((r) => r.seaHours)).size > 1
  && sRows.every((r) => r.hour.t === runMs + 15 * H && r.hour.windMs === sdoc.series[r.id].wind[15] && r.hour.hs === sdoc.series[r.id].hs[15] && r.shore === shoreAngle(r.hour.windDir, SU.spots.find((s) => s.id === r.id).normal)),
  sRows.map((r) => `${r.name} ${r.seaHours}/${r.landHours}`).join(' · '));
const sLand = T.strandRows(SU.spots, hourOf, win, 10, 'land');
const flipped = T.strandRows(SU.spots.map((s) => ({ ...s, normal: (s.normal + 180) % 360 })), hourOf, win, 10, 'see');
add('H2 Reihenfolge umkehrbar: „Wind vom Land zuerst“ sortiert nach den Stunden vom Land; gleiche Zahl behält die Reihenfolge des Katalogs; Gegenprobe: die Ufernormale um 180° gedreht vertauscht See und Land je Spot (bis auf Stunden genau auf einer Klassengrenze)',
  sLand.every((r, i) => i === 0 || sLand[i - 1].landHours >= r.landHours) 
  && T.strandRows(SU.spots, () => null, win, 10).map((r) => r.id).join() === SU.spots.map((s) => s.id).join() && T.strandRows(SU.spots, () => null, win, 10).every((r) => r.knownHours === 0 && r.side === null && r.hour === null)
  && flipped.every((r) => Math.abs(r.seaHours - byId[r.id].landHours) <= 1 && Math.abs(r.landHours - byId[r.id].seaHours) <= 1) && flipped.some((r) => r.seaHours !== byId[r.id].seaHours),
  `${sLand.map((r) => `${r.name} ${r.landHours}`).join(' · ')} | gedreht ${flipped.map((r) => `${r.seaHours}/${r.landHours}`).join(' ')}`);
add('H3 Worte der Liste: „Wind von See an n von m Stränden“ für die gewählte Stunde, je Strand „x von 25 Stunden von See“ — eine Zählung, kein Urteil',
  T.strandHead(sRows) === `Wind von See an ${sRows.filter((r) => r.side === 'see').length} von 3 Stränden` && T.strandCountText(sRows[0], 'see', 25) === `${sRows[0].seaHours} von 25 Stunden von See`
  && T.strandCountText(sLand[0], 'land', 25) === `${sLand[0].landHours} von 25 Stunden vom Land` && T.strandCountText({ seaHours: 0, landHours: 0, knownHours: 0 }, 'see', 5) === 'keine Windrichtung im Fenster'
  && T.strandHead([]) === 'Für diese Stunde liegt an keinem Strand eine Windrichtung vor');
const feh = SU.spots.find((s) => s.id === 'fehmarn-gruener-brink');
const alt = (t) => sunAltitudeDeg(new Date(t + 30 * 60_000), feh.lat, feh.lon);
const duskRow = Array.from({ length: 24 }, (_, hh) => T.duskOf(UTC(19, hh), feh.lat, feh.lon));
add('H4 hell / Dämmerung / dunkel aus dem Sonnenstand zur halben Stunde (Fehmarn, 19.11.): mittags hell, um Sonnenuntergang Dämmerung (Sonne zwischen −0,833° und −6°), abends dunkel; jede Stunde nach der zweiten Regel; Gegenprobe im Juni: 19 UTC noch hell',
  duskRow.every((d, hh) => { const a = alt(UTC(19, hh)); return d === (a > -0.833 ? 'hell' : a > -6 ? 'daemmerung' : 'dunkel'); }) && duskRow[11] === 'hell' && duskRow[15] === 'daemmerung' && duskRow[18] === 'dunkel' && duskRow[2] === 'dunkel'
  && duskRow.filter((d) => d === 'daemmerung').length >= 2 && T.duskOf(Date.UTC(2026, 5, 21, 19), feh.lat, feh.lon) === 'hell',
  duskRow.map((d) => d[0]).join(''));
const dw = (t) => { const w = T.strandDefaultWindow(t); return [new Date(w.startMs).toISOString().slice(0, 13), new Date(w.endMs).toISOString().slice(0, 13)].join('…'); };
add('H5 Fenster beim Öffnen: heute 17–22 Uhr Ortszeit (Winter 16–21 UTC, Sommer 15–20 UTC); während des Fensters und in seiner letzten Stunde bleibt es; ab 23 Uhr das von morgen; auf der Stundenachse gekürzt, außerhalb keines',
  dw(UTC(19, 10)) === '2026-11-19T16…2026-11-19T21' && dw(UTC(19, 20, 30)) === '2026-11-19T16…2026-11-19T21' && dw(UTC(19, 21, 30)) === '2026-11-19T16…2026-11-19T21' && dw(UTC(19, 22, 30)) === '2026-11-20T16…2026-11-20T21' && dw(Date.UTC(2026, 6, 1, 10)) === '2026-07-01T15…2026-07-01T20'
  && JSON.stringify(T.strandHours(UTC(19, 16), UTC(19, 21), UTC(19, 10), 60)) === JSON.stringify({ start: 6, end: 11, cut: false })
  && JSON.stringify(T.strandHours(UTC(19, 16), UTC(19, 21), UTC(19, 18), 60)) === JSON.stringify({ start: 0, end: 3, cut: true }) && T.strandHours(UTC(19, 16), UTC(19, 21), UTC(19, 23), 60) === null);

// --- I: link ---------------------------------------------------------------------------------------------------------
const et = T.encodeEtappeParam({ departMs: T07, speedKn: 5.5, points: PTS }), etBack = T.parseEtappeParam(et);
add('I1 Link Etappe: Abfahrt als volle UTC-Stunde, Fahrt × 10, Punkte auf vier Stellen — hin und zurück gleich; nach dem Lesen bekommt ein Punkt auf einer Wasserzelle seinen Spot zurück',
  et === '2026111907_55_544043x102153.546200x103000.548542x105348' && etBack.departMs === T07 && etBack.speedKn === 5.5 && etBack.points.every((p, i) => near(p.lat, PTS[i].lat) && near(p.lon, PTS[i].lon))
  && T.encodeEtappeParam(etBack) === et && T.spotOfPoint(etBack.points[0], CAT) === 'laboe' && T.spotOfPoint(etBack.points[2], CAT) === marstal.id
  && T.parseEtappeParam(T.encodeEtappeParam({ departMs: T07, speedKn: 12, points: [{ lat: 55.4567, lon: 6.1736 }] })).points[0].lon === 6.1736, et);
add('I2 Link Etappe, Gegenproben: 13 Punkte, Fahrt 0, eine Breite außerhalb, eine halbe Stunde, ein fremdes Trennzeichen ⇒ kein Plan; die Form in `seaState.ts` ist dieselbe wie in `seaTrip.ts`',
  T.parseEtappeParam(`2026111907_50_${Array.from({ length: 13 }, () => '544043x102153').join('.')}`) === null && T.parseEtappeParam('2026111907_0_544043x102153') === null && T.parseEtappeParam('2026111907_50_704043x102153') === null
  && T.parseEtappeParam('2026111925_50_544043x102153') === null && T.parseEtappeParam('2026111907_50_544043,102153') === null && T.parseEtappeParam(null) === null && T.parseEtappeParam('') === null
  && String(SEA_ET_RE) === String(T.ET_PARAM_RE) && String(SEA_SD_RE) === String(T.SD_PARAM_RE));
const sd = T.encodeStrandParam({ startMs: UTC(19, 16), endMs: UTC(19, 21) });
add('I3 Link Strand: Fenster als zwei volle UTC-Stunden, hin und zurück gleich; Ende vor Beginn oder mehr als 24 Stunden ⇒ kein Fenster',
  sd === '2026111916_2026111921' && JSON.stringify(T.parseStrandParam(sd)) === JSON.stringify({ startMs: UTC(19, 16), endMs: UTC(19, 21) }) && T.parseStrandParam('2026111921_2026111916') === null && T.parseStrandParam('2026111916_2026112117') === null && T.parseStrandParam('x') === null);
const OLD_PL = '2026111814_2026111817_54.3210_8.5990';
const urlOf = (over) => buildSeaUrl({ ...SEA_DEFAULT_STATE, spot: 'laboe', p: 'yacht', ...over });
const rt = (over) => { const u = urlOf(over), i = u.indexOf('?'); return parseSeaUrl('laboe', i < 0 ? '' : u.slice(i)); };
add('I4 Adresse der Seite, alle drei Modi hin und zurück: `pl` (Vor Ort), `et` (Etappe), `sd` (Strand) — der Schlüssel nennt den Modus; ohne Planer bleibt die Adresse wie zuvor',
  rt({ pl: OLD_PL }).state.pl === OLD_PL && rt({ pl: OLD_PL }).invalid.length === 0 && rt({ et }).state.et === et && rt({ sd }).state.sd === sd && rt({ et }).state.pl === null
  && T.tripModeOfLink(rt({ pl: OLD_PL }).state) === 'ort' && T.tripModeOfLink(rt({ et }).state) === 'etappe' && T.tripModeOfLink(rt({ sd }).state) === 'strand' && T.tripModeOfLink(rt({}).state) === null
  && urlOf({}) === '/seewetter/laboe?p=yacht' && urlOf({ et }) === `/seewetter/laboe?p=yacht&et=${et}` && !/%/.test(urlOf({ et })) && urlOf({ sd }) === `/seewetter/laboe?p=yacht&sd=${sd}`);
add('I5 ein alter Link der Phase SP öffnet weiter: `?pl=…` ohne die neuen Schlüssel wird gelesen wie zuvor (dieselbe Form, dieselben Werte) und öffnet „Vor Ort“; ein kaputtes `et` wird verworfen, der Rest der Adresse bleibt',
  (() => { const r = parseSeaUrl('st-peter-ording', `?p=kite&pl=${OLD_PL}`); const p = P.parsePlanParam(r.state.pl); return r.invalid.length === 0 && r.state.et === null && r.state.sd === null && p && p.startMs === UTC(18, 14) && p.endMs === UTC(18, 17) && p.lat === 54.321 && p.lon === 8.599; })()
  && (() => { const r = parseSeaUrl('laboe', `?p=yacht&et=kaputt&pl=${OLD_PL}`); return r.invalid.join() === 'et' && r.state.et === null && r.state.pl === OLD_PL && r.state.p === 'yacht'; })());
add('I6 Modus beim Öffnen: Yacht und Motorboot ⇒ Etappe, Kite, Wing, SUP, Jolle, Angeln ⇒ Vor Ort; Strand ist nie Voreinstellung und kein achtes Profil; Fahrt beim Öffnen 5 / 12 / 4 kn, gehalten in 0,5–40 kn',
  ['yacht', 'motor'].every((p) => T.defaultTripMode(p) === 'etappe') && ['kite', 'wing', 'sup', 'jolle', 'angeln'].every((p) => T.defaultTripMode(p) === 'ort') && Object.keys(SEA_PROFILE_BY_ID).length === 7
  && Object.keys(SEA_PROFILE_BY_ID).every((p) => T.defaultTripMode(p) !== 'strand') && T.TRIP_MODES.join() === 'ort,etappe,strand' && T.defaultSpeedKn('yacht') === 5 && T.defaultSpeedKn('motor') === 12 && T.defaultSpeedKn('kite') === 4
  && T.clampSpeedKn(0) === 0.5 && T.clampSpeedKn(99) === 40 && T.clampSpeedKn(6.26) === 6.3 && T.clampSpeedKn(NaN) === 4);

// --- J: wording, display, wiring ---------------------------------------------------------------------------------------
const texts = [
  ...Object.values(T).filter((v) => typeof v === 'string'), ...Object.values(T.TRIP_MODE_WHAT), ...Object.values(T.TRIP_LEGEND), T.TRIP_ARRIVAL_HOUR_NOTE(T07), T.tripSampleNote(13, 5, false), T.tripSampleNote(24, 12.2, true),
  ...fL.list.map((x) => x.text), ...fEve.list.map((x) => x.text), ...fOut.list.map((x) => x.text), ...offB.flatMap((x) => [x.title, x.note ?? '']), ...T.tripOfficial(nsHits, null, true).map((x) => x.note ?? ''),
  T.strandHead(sRows), ...sRows.map((r) => T.strandCountText(r, 'see', 25)), ...Object.values(T.SHORE_SIDE_WORD), ...Object.values(T.DUSK_LABEL),
];
const banned = /\b(un)?sicher\b|gefahrlos|ungefährlich|\bDrift|Abdrift|\d\s?%|Prozent|empfohlen|Empfehlung|ideal|\bbeste[rsn]?\b|lohnt|Fangaussicht|beiß/i;
/** The one sentence that names what the page does NOT compute. */
const allowed = (t) => t.replace('Eine gemeinsame Drift rechnet die Seite nicht.', '');
const hits2 = texts.filter((t) => banned.test(allowed(t)));
add(`J1 Wortlaut (${texts.length} Texte): kein „sicher“/„unsicher“, keine Drift, keine Prozente, keine Empfehlung, keine Bewertung von Stränden — Gegenprobe: das Muster trifft fünf Sätze, die so nicht stehen dürfen`,
  texts.length > 50 && hits2.length === 0 && ['Die Etappe ist sicher.', 'Unsicher ab 12 Uhr.', 'Drift 2 km nach Nordost', 'in 30 % der Fälle', 'Bester Strand heute'].every((t) => banned.test(t)), hits2.join(' | '));
add('J2 was gesagt sein muss: gerade Linie, kein Kurs, keine Navigationsgrundlage, keine Landprüfung; Ankunft aus Strecke und Fahrt, der Strom wird nicht verrechnet; Wind und Strom getrennt, keine gemeinsame Drift gerechnet; Strand: nur die Windrichtung zum Ufer, keine Fangprognose; Fuß „Amtliche Warnungen gehen vor.“',
  /gerade Linie zwischen deinen Punkten, kein Kurs, keine Navigationsgrundlage/.test(T.TRIP_LINE_NOTE) && /Land, Flachwasser und Fahrwasser prüft die Seite nicht/.test(T.TRIP_LINE_NOTE)
  && /Ankunft folgt aus Strecke und eingegebener Fahrt/.test(T.TRIP_ARRIVAL_NOTE) && /verändert die Ankunft aber nicht/.test(T.TRIP_ARRIVAL_NOTE) && /Wind und Strom stehen getrennt/.test(T.TRIP_TWO_NOTE) && /Eine gemeinsame Drift rechnet die Seite nicht/.test(T.TRIP_TWO_NOTE)
  && T.STRAND_NOTE === 'Gezeigt wird nur die Windrichtung zum Ufer. Keine Bewertung der Strände, keine Fangprognose.' && P.PLAN_FOOTER === 'Amtliche Warnungen gehen vor.' && /Stundenwert/.test(T.TRIP_HOURLY_NOTE));

const tmp = mkdtempSync(join(tmpdir(), 'sea-trip-'));
const out = join(tmp, 'bundle.mjs');
await build({
  stdin: { resolveDir: ROOT, loader: 'ts', contents: `
    export { EtappeRouteStep, EtappeTimeStep, EtappeTable, EtappeResult, StrandRevierStep, StrandTimeStep, StrandStrip, StrandPanel } from './src/sea/SeaTripPanels.tsx';
    export { default as SeaPlanPanel } from './src/sea/SeaPlanPanel.tsx';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  ` },
  bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: out, logLevel: 'silent', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const UI = await import(pathToFileURL(out).href);
const h = UI.createElement, html = UI.renderToStaticMarkup, cnt = (s, re) => (s.match(re) ?? []).length, plain = (s) => s.replace(/<[^>]+>/g, ' ');
const etState = { points: PTS, speedKn: SPEED, departMs: T07 };
const view = {
  route, names: { start: 'Laboe', end: 'Marstal', way: ['Laboe', null, 'Marstal'] }, timeline: tl, rows: rowsL, pieces, findings: fL, compare: cmp, samples: { n: 13, stepKm: 5, widened: false },
  wind: { done: 13, total: 13, none: 0, why: null }, areas: hits, official: offB, sel: 3, level: 'Wasserstand in Marstal bei Ankunft (11:41 Uhr): −12 cm gegen das Mittelwasser des Modells (Sturmflutmodell des DMI)', beyond: false,
};
const tbl = html(h(UI.EtappeTable, { view, unit: 'kn', onPick: () => {} }));
add('J3 Tabelle „Entlang der Etappe“: Zeilen Uhr, Ort, Wind zum Kurs, Wind, Böen, Welle, Strom, Wetter; eine Spalte je Stunde plus Ankunft (11:41 Ortszeit mit Hinweis auf die Wertestunde); oben der Strang in den Farben der Route; Werte über der Grenze markiert, Stunden ohne Bild „keine Daten“',
  ['Uhr', 'Ort', 'Wind zum Kurs', 'Wind kn', 'Böen kn', 'Welle m', 'Strom kn', 'Wetter'].every((x) => tbl.includes(`<th scope="row">${x}</th>`)) && cnt(tbl, /<th scope="col"/g) === 5
  && new RegExp(`>${T.stopClock(tl.stops[4])}<`).test(tbl) && cnt(tbl, /class="sw-am-strand"/g) === 1 && cnt(tbl, /<td class="is-(in|over|missing)/g) === 5 && cnt(tbl, /class="is-over"/g) >= 2 && cnt(tbl, /keine Daten/g) >= 6
  && tbl.includes('Stundenwert von') && cnt(tbl, /aria-pressed="true"/g) === 1 && tbl.includes('innerhalb deiner Grenzen') && tbl.includes('darüber') && tbl.includes('ein Wert fehlt'),
  `${tbl.length} Zeichen`);
const res = html(h(UI.EtappeResult, { view, etappe: etState, unit: 'kn', profile: 'yacht', noData: null, onClose: () => {} }));
add('J4 Befunde: Kopf „Laboe → Marstal“ mit Zeit und Profil, die Zahl der Hinweise über deiner Grenze, zwei Karten Abfahrt und Ankunft, die Liste (rot nur die über der Grenze), Wasserstand bei Ankunft, der amtliche Kasten im Wortlaut mit „Kein amtlicher Warnstatus“, Fuß',
  res.includes('<h2>Laboe → Marstal</h2>') && /· Yacht<\/p>/.test(res) && res.includes(`${T.overCountText(fL.over)} über deiner Grenze`) && res.indexOf('Abfahrt ') < res.indexOf('Ankunft ') && cnt(res, /class="sw-am-card(?: is-sel)?"/g) === 2
  && cnt(res, /<li class="is-over">/g) === fL.over && res.includes('gegen das Mittelwasser des Modells') && res.includes('Amtlich · Seegebiete auf der Route') && res.includes(wb.text.trim().slice(0, 30)) && res.includes('Kein amtlicher Warnstatus.')
  && res.includes('keine Navigationsgrundlage') && res.trimEnd().endsWith(`${P.PLAN_FOOTER}</p></section>`) && !banned.test(allowed(plain(res))),
  [res.includes('<h2>Laboe → Marstal</h2>'), /· Yacht<\/p>/.test(res), res.includes(`${T.overCountText(fL.over)} über deiner Grenze`), res.indexOf('Abfahrt ') < res.indexOf('Ankunft '), cnt(res, /class="sw-am-card/g), cnt(res, /<li class="is-over">/g), fL.over, res.includes(wb.text.trim().slice(0, 30)), (allowed(plain(res)).match(banned) ?? [''])[0]].join(','));
const resNone = html(h(UI.EtappeResult, { view: null, etappe: { ...etState, points: [] }, unit: 'kn', profile: 'yacht', noData: null, onClose: () => {} }));
const resLoad = html(h(UI.EtappeResult, { view: { ...view, wind: { done: 4, total: 13, none: 0, why: null } }, etappe: etState, unit: 'kn', profile: 'yacht', noData: null, onClose: () => {} }));
const resOut = html(h(UI.EtappeResult, { view: { ...view, wind: { done: 13, total: 13, none: 5, why: 'outside' } }, etappe: etState, unit: 'kn', profile: 'yacht', noData: null, onClose: () => {} }));
add('J5 leer, ladend, außerhalb: ohne Punkte die Aufforderung, den Start zu setzen (kein Wert, der Fuß bleibt); beim Rechnen „Wind an 4 von 13 Punkten“; außerhalb des Cubes „keine Daten“ mit der Zahl der Punkte',
  resNone.includes('Start setzen.') && resNone.includes(T.TRIP_ASK_START) && !resNone.includes('sw-am-card') && resNone.includes(P.PLAN_FOOTER) && resLoad.includes('Wind an 4 von 13 Punkten der Etappe gerechnet')
  && resOut.includes('Wind und Böen: keine Daten.') && resOut.includes('Betroffen: 5 von 13 Punkten der Etappe (außerhalb des Punkt-Cubes, etwa nördlich von 55,5° N)'));
// AM-W (`audit/seewetter-ausfahrt.md` §13): what one sets for a leg is two pages of the assistant.
const routeProps = { etappe: etState, view, armed: false, onArm: () => {}, onRemove: () => {}, onReverse: () => {} };
const rStep = html(h(UI.EtappeRouteStep, routeProps));
const tStep = html(h(UI.EtappeTimeStep, { etappe: etState, view, onSpeed: () => {}, onDepart: () => {}, canEarlier: true, canLater: true }));
const rEmpty = html(h(UI.EtappeRouteStep, { ...routeProps, etappe: { ...etState, points: [] }, view: null })), rOne = html(h(UI.EtappeRouteStep, { ...routeProps, etappe: { ...etState, points: PTS.slice(0, 1) }, view: null }));
const inOrder = (s, list) => list.every((x, i) => s.includes(x) && (i === 0 || s.indexOf(list[i - 1]) < s.indexOf(x)));
add('J6 Etappe, zwei Seiten des Assistenten (AM-W): „Strecke“ trägt Start, Wegpunkte, Ziel, Strecke, „Wegpunkt auf der Karte setzen“, umkehren und löschen — ohne Punkte bzw. ohne Ziel die Aufforderung und keinen Knopf; „Fahrt und Abfahrt“ trägt die Fahrt, Strecke · Dauer, Abfahrt und Ankunft, früher / später und „Abfahrt vergleichen“ (drei Zeiten mit Zahl); keine Seite trägt, was auf eine andere gehört',
  inOrder(rStep, ['>Etappe</h3>', '<dt>Start</dt><dd>Laboe</dd>', '1 gesetzt', '<dt>Ziel</dt><dd>Marstal</dd>', `<dt>Strecke</dt><dd>${T.nmText(route.km)}</dd>`, 'Wegpunkt auf der Karte setzen', 'Richtung umkehren', 'Alle Punkte löschen'])
  && !/>Fahrt<|sw-am-cmp|Abfahrt|Deine Grenzen|Wer fährt|Art der Ausfahrt/.test(rStep)
  && rEmpty.includes(T.TRIP_ASK_START) && rOne.includes(T.TRIP_ASK_END) && !/sw-am-add|sw-am-tools/.test(rEmpty + rOne) && rEmpty.includes('<dt>Start</dt><dd>auf der Karte setzen</dd>')
  && inOrder(tStep, ['>Fahrt</h3>', 'value="8"', `${T.nmText(route.km)} · 3 h 41 min`, T.TRIP_ARRIVAL_NOTE, '>Abfahrt</h3>', '<dt>Abfahrt</dt>', '<dt>Ankunft</dt>', 'Abfahrt eine Stunde', 'Abfahrt vergleichen'])
  && cnt(tStep, /class="sw-am-cmp"[\s\S]*?<\/div>/g) === 1 && tStep.includes('außerhalb der Vorhersage') && tStep.includes(T.overCountText(cmp[1].over))
  && !/Wegpunkt|Richtung umkehren|Deine Grenzen|Wer fährt|Art der Ausfahrt/.test(tStep) && !banned.test(allowed(plain(rStep + tStep))),
  [inOrder(rStep, ['>Etappe</h3>', '<dt>Start</dt><dd>Laboe</dd>', '1 gesetzt', '<dt>Ziel</dt><dd>Marstal</dd>']), rEmpty.includes(T.TRIP_ASK_START), rOne.includes(T.TRIP_ASK_END), tStep.includes('value="8"'), tStep.includes(`${T.nmText(route.km)} · 3 h 41 min`), (allowed(plain(rStep + tStep)).match(banned) ?? [''])[0]].join(','));
// AM-S (§12): Strand in three pieces — input (left), the hours of the window (foot of the map), the list (right).
const sWin = { startMs: UTC(19, 16), endMs: UTC(19, 21), hours: 6, cut: false };
const sCan = { startEarlier: false, startLater: true, endEarlier: true, endLater: true };
const sRevProps = { order: 'see', onOrder: () => {}, revier: 'alle', onRevier: () => {}, hasDk: true, count: 64 };
const sWinProps = { win: sWin, onShift: () => {}, can: sCan };
const sRev = html(h(UI.StrandRevierStep, sRevProps)), sTime = html(h(UI.StrandTimeStep, sWinProps));
const sCalls = [], sWalk = (el, out = []) => { if (Array.isArray(el)) el.forEach((x) => sWalk(x, out)); else if (el && typeof el === 'object' && el.props) { out.push(el); sWalk(el.props.children, out); } return out; };
const revEls = sWalk(UI.StrandRevierStep({ ...sRevProps, onOrder: (o) => sCalls.push(o), onRevier: (r) => sCalls.push(r) }));
const timeEls = sWalk(UI.StrandTimeStep({ ...sWinProps, onShift: (which, by) => sCalls.push(which + by) }));
const sStep = (label) => timeEls.find((e) => e.props.label === label && typeof e.props.onShift === 'function');
sStep('Beginn')?.props.onShift(1); sStep('Ende')?.props.onShift(-1);
revEls.find((e) => e.type === 'button' && e.props.children === 'Wind vom Land zuerst')?.props.onClick(); revEls.find((e) => e.type === 'button' && e.props.children === 'Ostsee')?.props.onClick();
const sRevNoDk = html(h(UI.StrandRevierStep, { ...sRevProps, hasDk: false, count: 1 })), sTimeNone = html(h(UI.StrandTimeStep, { ...sWinProps, win: null }));
add('J7a Strand, zwei Seiten des Assistenten (AM-W): „Revier“ trägt die Reviere (vier, ohne dänische Spots drei), die Zahl der Spots und die Reihenfolge der Liste; „Zeitfenster“ den Kasten „Fenster“ mit Beginn und Ende je mit Schrittschalter und der Länge — und KEINE trägt „Wer fährt?“ (E-AM-30: das Profil ändert an dieser Liste nichts) oder die Liste selbst; die Schalter greifen am richtigen Ende und tragen dessen Sperren; ohne Fenster kein Schrittschalter',
  inOrder(sRev, ['>Revier</h3>', '64 Spots in diesem Revier.', 'Reihenfolge der Liste', 'Wind von See zuerst', 'Wind vom Land zuerst'])
  && cnt(sRev.slice(0, sRev.indexOf('Reihenfolge der Liste')), /<button/g) === 4 && cnt(sRevNoDk.slice(0, sRevNoDk.indexOf('Reihenfolge der Liste')), /<button/g) === 3 && sRevNoDk.includes('1 Spot in diesem Revier.')
  && inOrder(sTime, ['>Fenster</h3>', '<dt>Beginn</dt>', '<dt>Ende</dt>', '<dt>Länge</dt><dd>6 Stunden</dd>'])
  && /<dt>Beginn<\/dt><dd class="sw-pl-when"><time>Do 17:00<\/time><span class="sw-pl-step" role="group" aria-label="Beginn verschieben"><button type="button" disabled="" aria-label="Beginn eine Stunde früher">/.test(sTime)
  && /<dt>Ende<\/dt><dd class="sw-pl-when"><time>Do 22:00<\/time><span class="sw-pl-step" role="group" aria-label="Ende verschieben"><button type="button" aria-label="Ende eine Stunde früher">/.test(sTime) && cnt(sTime, /disabled=""/g) === 1
  && sCalls.join() === 'start1,end-1,land,ostsee' && sStep('Beginn').props.canEarlier === false && sStep('Ende').props.canEarlier === true && sStep('Ende').props.canLater === true
  && !/sw-pl-step|<dt>Beginn<\/dt>/.test(sTimeNone) && sTimeNone.includes('Gerade steht kein Fenster auf den Stunden der Vorhersage.')
  && !/Wer fährt\?|sw-am-list|sw-am-strip|sw-pl-foot/.test(sRev + sTime) && !/>Fenster<\/h3>/.test(sRev) && !/Revier|Reihenfolge/.test(sTime) && !banned.test(plain(sRev + sTime)), sCalls.join());
const sStripProps = { strip: [15, 16, 17, 18, 19, 20, 21, 22].map((hh, i) => ({ k: i, t: UTC(19, hh), inWin: hh >= 16 && hh <= 21, see: 2, known: 3, dusk: T.duskOf(UTC(19, hh), feh.lat, feh.lon) })), pickK: 3, onPick: () => {} };
const sStrip = html(h(UI.StrandStrip, sStripProps));
add('J7b Strand, Stunden des Fensters (Kartenfuß, E-AM-31): im Kasten der Etappen-Tabelle, acht Stunden mit „n/m“ und hell / Dämm. / dunkel, die gewählte Stunde gedrückt, die Stunden des Fensters markiert; im Kopf der Satz, was gezählt wird, und der Farbschlüssel der Spot-Marken; ohne Stunden kein Kasten',
  sStrip.startsWith('<section class="sw-am-tablebox sw-am-stripbox" aria-label="Stunden des Fensters">') && cnt(sStrip, /<ol class="sw-am-strip">[\s\S]*?<\/ol>/g) === 1 && cnt(sStrip, /<small>(hell|Dämm\.|dunkel)<\/small>/g) === 8 && sStrip.includes('<small>dunkel</small>')
  && cnt(sStrip, /aria-pressed="true"/g) === 1 && cnt(sStrip, /<li class="is-in/g) === 6 && cnt(sStrip, /<strong>2\/3<\/strong>/g) === 8 && sStrip.includes('Je Stunde: Strände mit Wind von See, von allen mit Windrichtung')
  && /<ul class="sw-am-key is-shore" aria-label="Farbe der Spots auf der Karte"><li><i class="is-see"><\/i>von See<\/li><li><i class="is-quer"><\/i>längs des Ufers<\/li><li><i class="is-land"><\/i>vom Land<\/li><\/ul>/.test(sStrip)
  && sStrip.indexOf('sw-am-key') < sStrip.indexOf('<ol class="sw-am-strip">') && html(h(UI.StrandStrip, { ...sStripProps, strip: [] })) === '' && !banned.test(plain(sStrip)));
const sPanelProps = { win: sWin, noData: null, head: T.strandHead(sRows), rows: sRows, order: 'see', unit: 'bft', levels: new Map([[sRows[0].id, 'Pegel Kiel-Holtenau 512 cm über Pegelnull']]), selectedId: null, onSpot: () => {}, onClose: () => {} };
const sPanel = html(h(UI.StrandPanel, sPanelProps));
add('J7c Strand, Liste (rechts): Fenster und Zählsatz im Kopf, die Liste in der gerechneten Reihenfolge mit Wind (in der Einheit der Seite), Welle, Pegel wo vorhanden, Uferwinkel als Wort; kein Urteil, keine Fangprognose, Hinweise, Fuß — und nichts, was man einstellt: kein Umschalter, kein Revier, kein Schrittschalter, keine Stundenleiste, keine Reihenfolge; ein angeschnittenes Fenster und fehlende Daten werden gesagt',
  /<h2>Do 17 bis 22 Uhr<\/h2>/.test(sPanel) && sPanel.includes(`<p>${T.strandHead(sRows)}</p>`) && sRows.every((r, i, a) => sPanel.includes(`<strong>${r.name}</strong>`) && (i === 0 || sPanel.indexOf(`<strong>${a[i - 1].name}</strong>`) < sPanel.indexOf(`<strong>${r.name}</strong>`)))
  && / Bft( aus [A-Z]+)? · /.test(sPanel) && sPanel.includes('Pegel Kiel-Holtenau 512 cm über Pegelnull') && sPanel.includes(T.STRAND_NOTE) && sPanel.includes(T.STRAND_ORDER_NOTE) && sPanel.trimEnd().endsWith(`${P.PLAN_FOOTER}</p></section>`) && !banned.test(plain(sPanel))
  && !/sw-am-mode|sw-am-revier|sw-pl-step|sw-am-strip|sw-am-order|Wind von See zuerst|sw-am-key/.test(sPanel) && cnt(sPanel, /<button/g) === sRows.length + 1
  && html(h(UI.StrandPanel, { ...sPanelProps, win: { ...sWin, cut: true } })).includes('Ein Teil des Fensters liegt außerhalb der Vorhersage.') && !sPanel.includes('Ein Teil des Fensters')
  && html(h(UI.StrandPanel, { ...sPanelProps, win: null, noData: 'Kein geprüfter Lauf.' })).includes('<strong>Kein Fenster.</strong> Kein geprüfter Lauf.') && !html(h(UI.StrandPanel, { ...sPanelProps, win: null, noData: 'x' })).includes('sw-am-list'));
const card = (when) => ({ when, wind: '13 kn', lines: [], color: '#8DB07A', canEarlier: true, canLater: true });
const pageS = readFileSync(join(ROOT, 'src/sea/SeaPage.tsx'), 'utf8').replace(/\r\n/g, '\n');
add('J7d Strand, Seite (AM-W): die Stunden des Fensters liegen auf der Ergebnis-Seite am Kartenfuß, rechts die Liste; der Kartenrand unten macht Platz für den Kasten; mobil trägt das Blatt Seite, Stunden, Liste in dieser Reihenfolge; ohne gültigen Lauf kein Kasten; die Liste trägt nichts, was man einstellt',
  /: step !== 'ergebnis' \? null : wizMode === 'etappe' \? 'table' : 'strip';/.test(pageS) && /footKind === 'strip' \? strandStripBox : null;/.test(pageS)
  && /\{isMobile \? <>\{footEl\}\{wizResult\}<\/> : layersFold\}/.test(pageS) && /footKind === 'strip' \? 210 : 40,/.test(pageS)
  && /const strandStripBox = strand && strandWin && !tripNoData && strandStrip\.length > 0 \?/.test(pageS) && cnt(pageS, /<StrandPanel /g) === 1 && cnt(pageS, /<StrandRevierStep /g) === 1 && cnt(pageS, /<StrandTimeStep /g) === 1
  && !/<StrandPanel [^>]*on(Mode|Close)/.test(pageS));
const spFind = { spotName: 'Laboe', when: 'Mi 00:00 bis Mi 03:00', profileLabel: 'Kite', noData: null, official: null, start: card('Mi 00:00'), ret: card('Mi 03:00'), events: [], summary: [], notes: [], moved: null, now: 'x', onClose: () => {} };
const ortFind = html(h(UI.SeaPlanPanel, spFind));
add('J8 Befunde je Art (AM-W): die Befunde von „Vor Ort“ tragen Kopf (Ort, Zeit, Profil), Schiene und Fuß, die der Etappe ihren Kopf — und keine trägt, was man einstellt (Profile, Art der Ausfahrt, Schrittschalter); im Assistenten (ohne `onClose`) tragen alle drei keinen eigenen Schließen-Knopf',
  ortFind.includes('<h2>Laboe</h2><p>Mi 00:00 bis Mi 03:00 · Kite</p>') && ortFind.includes('sw-pl-rail') && ortFind.trimEnd().endsWith(`${P.PLAN_FOOTER}</p></section>`) && !/sw-wz-|sw-profiles|sw-pl-step/.test(ortFind + res)
  && res.startsWith('<section class="sw-pl sw-am-res"') && ortFind.startsWith('<section class="sw-pl"') && cnt(res, /aria-label="Planer schließen"/g) === 1 && cnt(ortFind, /aria-label="Planer schließen"/g) === 1
  && cnt(html(h(UI.EtappeResult, { view, etappe: etState, unit: 'kn', profile: 'yacht', noData: null })), /<button/g) === 0
  && cnt(html(h(UI.StrandPanel, { ...sPanelProps, onClose: undefined })), /<button/g) === sRows.length && cnt(html(h(UI.SeaPlanPanel, { ...spFind, onClose: undefined })), /<button/g) === 0);

const src = (f) => readFileSync(join(ROOT, f), 'utf8');
const page = src('src/sea/SeaPage.tsx'), mapSrc = src('src/sea/SeaMap.tsx'), css = src('src/sea/seaDeck.css'), dataSrc = src('src/sea/seaTripData.ts'), lib = src('src/sea/seaTrip.ts'), hook = src('src/sea/useSeaTrip.ts'), panels = src('src/sea/SeaTripPanels.tsx');
add('J9 buscosun Fusion: ein Eintrag `sea` im Register, an; der Aufruf ist der gemessene (Cube-Pfad, `country: \'DE\'`, ohne Radar) hinter `fusionPathFor(\'sea\')`; kein Live-Pfad und kein `getFusionForecast` dahinter; `?pf=live` ⇒ keine Daten statt eines anderen Modells',
  FUSION_PARTS.filter((p) => p.id === 'sea').length === 1 && FUSION_PARTS.find((p) => p.id === 'sea').on === true && fusionPathFor('sea', '') === 'cube' && fusionPathFor('sea', '?pf=live') === 'live'
  && /fusionPathFor\('sea',[^)]*\) !== 'cube'\) return \{ series: null, why: 'off' \}/.test(dataSrc) && /getPointForecast\(\{ lat: pos\.lat, lng: pos\.lon, country, hours: SEA_TRIP_FUSION_HOURS, pointSource: 'cube', includeRadarNowcast: false \}\)/.test(dataSrc)
  // Phase BS: the country is a parameter with the measured call as its default — a leg on a lake asks with the lake's country.
  && /export function loadTripWind\(pos: PlanPos, country: 'DE' \| 'AT' \| 'CH' = 'DE'\)/.test(dataSrc)
  && /import\('\.\.\/pointForecast\/cubeSource'\)/.test(dataSrc) && cnt(dataSrc, /getPointForecast\(/g) === 1 && !/getFusionForecast|sourceMode|open-meteo|brightsky/i.test(dataSrc.replace(/\/\*[\s\S]*?\*\//g, '')) && !/pointForecast/.test(lib));
add('J10 Karte: Route als Linien-Ebenen (dunkel, rot, gestrichelt auf heller Unterlage), Punkte als ziehbare Marker, Boot als Marker; Strand färbt die Spot-Marke nach der Windrichtung zum Ufer — keine eigene GL-Ebene, kein Shader, keine gefärbte Küstenlinie',
  cnt(mapSrc, /id: 'sw-trip-[a-z]+', type: 'line'/g) === 4 && /'sw-trip-over'[^\n]*'line-color': '#B5482E'/.test(mapSrc) && /'sw-trip-missing'[^\n]*'line-dasharray'/.test(mapSrc) && /new maplibregl\.Marker\(\{ element: el, draggable: true, anchor: 'center' \}\)/.test(mapSrc)
  && /\['has', 'shore'\], \['concat', 'sw-shore-', \['get', 'shore'\]\]/.test(mapSrc) && !/type: 'custom'|getContext\('webgl|gl_Position/.test(mapSrc + lib + panels) && !/coast|Küstenlinie/i.test(mapSrc.slice(mapSrc.indexOf('Phase AM, Strand'), mapSrc.indexOf('Phase AM, Strand') + 900).replace(/shore/g, '')));
add('J11 Seite: kein Schalter um die Phase; die Einstiege der Phase SP bleiben (Knopf über der Legende, Eintrag „Ausfahrt“); das Profil setzt den Modus beim Öffnen; der Link trägt `et` und `sd`; die Ebenen klappen unter die Eingabe (nicht entfernt)',
  !/SEA_TRIP\w*_LIVE|tripFlag|seaTripFrom|\?am=|\?trip=/.test(page + lib + hook + src('src/sea/seaFlag.ts')) && /<button type="button" className="sw-pl-open" onClick=\{openPlanner\}>/.test(page) && /\['plan', 'Ausfahrt',/.test(page)
  && /setTripMode\(defaultTripMode\(profile\)\)/.test(page) && /const et = etappe && etappe\.points\.length > 0 \? encodeEtappeParam\(etappe\) : null;/.test(page) && /const sd = strand \? encodeStrandParam\(strand\) : null;/.test(page)
  && /<details className="sw-am-layers"><summary>Ebenen der Karte<\/summary>\{dockOf\('layers'\)\}<\/details>/.test(page) && /onMode=\{wizPickMode\}/.test(page)
  && /const wizPickMode = useCallback\(\(m: TripMode\) => \{ modePicked\.current = true; setTripMode\(m\); \}, \[setTripMode\]\);/.test(page));
const mq = '@media (max-width: 767px), (max-width: 1439px) and (pointer: coarse) {';
const used = [...new Set([...(panels + src('src/sea/SeaTripSwitch.tsx')).matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)].flatMap((m) => (m[1] ?? m[2]).match(/sw-am-[a-z]+/g) ?? [])), 'sw-am-pt', 'sw-am-boat', 'sw-am-boatlabel', 'sw-am-dockin', 'sw-am-foot', 'sw-am-layers'];
const breakpoints = [...css.slice(css.indexOf('Phase AM (audit/seewetter-ausfahrt.md)')).matchAll(/@media[^{]*\{/g)].map((m) => m[0]);
add(`J12 CSS: jede der ${used.length} Klassen dieser Phase ist definiert; mobil nur in der Media Query der Seite, keine anderen Breakpoints als 767 und 1439; Rot nur an „über deiner Grenze“`,
  used.every((c) => css.includes(`.${c}`)) && css.slice(css.lastIndexOf(mq)).includes('.sw-pl-sheet .sw-wz-body') && breakpoints.every((b) => b === '@media (max-width: 1439px) {')
  && [...css.slice(css.indexOf('Phase AM (audit/seewetter-ausfahrt.md)')).matchAll(/^([^\n{]*)\{[^}]*(#8A3320|#B5482E|--sw-out)[^}]*\}/gm)].every((m) => /is-over/.test(m[1])),
  used.filter((c) => !css.includes(`.${c}`)).join(','));

// --- K: follow-up AM-N (V-AM-7, V-AM-8, V-AM-12) ---------------------------------------------------------------------
const MIN = T.PLAN_SHEET_SOURCES_MIN_GAP_PX;
const peek = T.planSheetSources({ h: 344, gap: 302 }), full = T.planSheetSources({ h: 700, gap: 8 });
add('K1 Quellenzeile über dem Blatt (E-AM-16): Blatt in Ruhe ⇒ Zeile und Knopf um die gemessene Höhe gehoben; ganz offen (8 px Karte unter der Kopfzeile) ⇒ beide ruhen; die Grenze selbst hebt noch; ohne Messung, mit Höhe 0 oder NaN ändert sich nichts',
  peek.lift === 344 && peek.hidden === false && full.hidden === true && full.lift === 0 && T.planSheetSources({ h: 300.4, gap: MIN }).lift === 300 && T.planSheetSources({ h: 300, gap: MIN }).hidden === false
  && T.planSheetSources({ h: 300, gap: MIN - 1 }).hidden === true && T.planSheetSources(null) === null && T.planSheetSources({ h: 0, gap: 400 }) === null && T.planSheetSources({ h: NaN, gap: 400 }) === null && T.planSheetSources({ h: 300, gap: NaN }) === null
  && MIN === 56, JSON.stringify([peek, full]));
const sheetTag = (page.match(/<div ref=\{plSheetRef\} className=\{`sw-pl-sheet[^\n]*/) ?? [''])[0];
const mobMain = (page.match(/<main className="sw-map is-mobile msl-host"[^\n]*/) ?? [''])[0], deskMain = (page.match(/<main className=\{`sw-map msl-host[^\n]*/) ?? [''])[0];
add('K2 Verdrahtung V-AM-8: das Blatt wird gemessen (Höhe und freie Karte unter der Kopfzeile, ResizeObserver + Fenstergröße, beim Schließen zurückgesetzt); die mobile Karte trägt `--msl-bottom` nur gehoben, die Wurzel die Klasse; am Desktop trägt die Karte nichts davon',
  sheetTag.length > 0 && /new ResizeObserver\(read\)/.test(page) && /window\.addEventListener\('resize', read\)/.test(page) && /ro\.disconnect\(\); window\.removeEventListener\('resize', read\); setPlSheetBox\(null\);/.test(page)
  && /querySelector\('\.sw-map \.sw-m-top'\)/.test(page) && /const plSheetSrc = planSheetSources\(plSheetBox\);/.test(page) && /plSheetSrc && !plSheetSrc\.hidden \? \{ \['--msl-bottom' as string\]: `\$\{plSheetSrc\.lift\}px` \} : undefined/.test(mobMain)
  && /plSheetSrc \? \(plSheetSrc\.hidden \? ' is-plsheet-full' : ' has-plsheet'\) : ''/.test(page) && deskMain.length > 0 && !/msl-bottom|plSheet/.test(deskMain) && cnt(page, /ref=\{plSheetRef\}/g) === 1);
const lastMqCss = css.slice(css.lastIndexOf(mq), css.indexOf('\n}', css.lastIndexOf(mq)));
const liftRule = '.sw-root.is-mobile.has-plsheet .sw-map.is-mobile .maplibregl-ctrl-bottom-right { bottom: var(--msl-bottom, 0px); }';
const zeroRule = (css.match(/\n\s*(\.sw-root\.is-mobile \.sw-map\.is-mobile \.maplibregl-ctrl-bottom-right)[^{]*\{ bottom: 0; \}/) ?? [])[1] ?? '';
const classes = (sel) => (sel.match(/\.[a-z-]+/gi) ?? []).length;
add('K3 CSS V-AM-8: die Hebe-Regel steht in der letzten mobilen Media Query, hinter der Regel `bottom: 0` der Seite und mit mehr Klassen als sie (sonst gewinnt die Null); ganz offen ruhen Zeile UND Knopf; außerhalb der Media Query gibt es die Regeln nicht',
  lastMqCss.includes(liftRule) && zeroRule.length > 0 && css.indexOf(zeroRule) < css.indexOf(liftRule) && classes(liftRule.slice(0, liftRule.indexOf('{'))) > classes(zeroRule)
  && /\.sw-root\.is-mobile\.is-plsheet-full \.sw-map\.is-mobile \.maplibregl-ctrl-bottom-right, \.sw-root\.is-mobile\.is-plsheet-full \.sw-map\.is-mobile \.msl \{ display: none; \}/.test(lastMqCss)
  && cnt(css, /has-plsheet/g) === 1 && cnt(css, /is-plsheet-full/g) === 2 && !/--msl-bottom:/.test(css),
  [lastMqCss.includes(liftRule), zeroRule, classes(liftRule.slice(0, liftRule.indexOf('{'))), classes(zeroRule)].join(' | '));
const dockRule = '.sw-root.is-mobile:has(.sw-m-dock) .msl-host.msl-host .maplibregl-ctrl-bottom-right, .sw-root.is-mobile:has(.sw-m-dock) .msl-host.msl-host .msl { display: none; }';
const mqOf = (rule) => { const at = css.indexOf(rule), open = css.lastIndexOf('\n@media', at); return at < 0 || open < 0 ? '' : css.slice(open + 1, css.indexOf('{', open) + 1); };
add('K3b CSS V-AM-17: unter den bildschirmfüllenden Blättern der unteren Leiste (Spot, Ebenen, Schwelle — alle `.sw-m-dock`) ruhen Quellenzeile und Knopf wie unter dem Dossier; die Regel steht in der mobilen Media Query und trifft den Planer (kein `.sw-m-dock`) nicht',
  cnt(css, /:has\(\.sw-m-dock\)/g) === 2 && mqOf(dockRule) === mq && mqOf('.sw-root.is-mobile:has(.sw-m-dossier) .msl-host.msl-host .maplibregl-ctrl-bottom-right { display: none; }') === mq
  && cnt(page, /className="sw-m-dock[ "]/g) === 2 && !/sw-pl-sheet[^`"]*sw-m-dock|sw-m-dock[^`"]*sw-pl-sheet/.test(page), mqOf(dockRule));
const hints = [...page.matchAll(/<MapGestureHint [^\n]*/g)].map((m) => m[0]);
add('K4 Kartenhinweis V-AM-7 (E-AM-15): beide Einbauten (mobil, Desktop) hängen an `hintOn`; der Hinweis ruht mit offenem Planer, mit der Frage nach dem Spot und für den Rest des Besuchs, sobald einer offen war; ein Link mit `et`, `sd` oder `pl` beginnt so; ohne Planer bleibt er, wie er war (`always`)',
  hints.length === 2 && hints.every((x) => /enabled=\{[^}]*&& hintOn\}/.test(x) && / always /.test(x) && /!inDossier/.test(x)) && /mobTab === 'map' && !inDossier && hintOn/.test(hints[0])
  && /const hintOn = !tripOpen && !planAsk && !hintRest;/.test(page) && /const \[hintRest, setHintRest\] = useState\(\(\) => !!\(etappe \|\| strand \|\| linkPl\)\);/.test(page)
  && /useEffect\(\(\) => \{ if \(tripOpen \|\| planAsk\) setHintRest\(true\); \}, \[tripOpen, planAsk\]\);/.test(page) && cnt(page, /setHintRest\(/g) === 1 && !/setHintRest\(false\)/.test(page),
  hints.length);
const ci = src('.github/workflows/ci.yml');
add('K5 CI V-AM-12: `verify:sea-trip` läuft im Workflow, genau einmal, hinter dem Tidenfenster und auch nach einem roten Schritt davor; der Prüfer selbst holt nichts aus dem Netz',
  cnt(ci, /node scripts\/ci-run\.mjs verify:sea-trip\r?\n/g) === 1 && ci.indexOf('verify:sea-tide-window') < ci.indexOf('verify:sea-trip') && /- name: Verifier — Ausfahrt planen\r?\n\s+if: \$\{\{ !cancelled\(\) \}\}\r?\n\s+run: node scripts\/ci-run\.mjs verify:sea-trip\r?\n/.test(ci)
  && !/\bfetch\(|https?:\/\//.test(src('scripts/verify-sea-trip.mjs').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^'\n]*'/g, "''")));

// K6 (V-AM-16): the real loaders of `seaClient.ts` behind `loadTripHour`, with the store, the image decoder and the canvas
// replaced by the fixture files. The shared cache hands every caller one promise per file — a caller that aborts must not
// turn the leg's wave into „keine Daten“.
{
  const served = [], cut = [], keep = { fetch: globalThis.fetch, cib: globalThis.createImageBitmap, oc: globalThis.OffscreenCanvas };
  // The arrow field of the current (90 × 55) has no recorded fixture: an image of the contract's size, built here (K7 tests the plumbing, not the values).
  const arrowPng = encodePng(SEA_CURRENT_FIELD.nx, SEA_CURRENT_FIELD.ny, new Uint8Array(SEA_CURRENT_FIELD.nx * SEA_CURRENT_FIELD.ny * 4).fill(255), 4);
  const fileOf = (url) => (/\/current\/[^/]+\/f\/\d{3}\.png$/.test(url) ? arrowPng : /\/f\/\d{3}\.png$/.test(url) ? F19.bytes : /\/uv\/\d{3}\.png$/.test(url) ? readFileSync(join(FIX, 'ripples', 'uv-2026111812-006.png')) : null);
  let dead = false;
  globalThis.fetch = (url, init) => new Promise((res, rej) => {
    served.push(String(url));
    const t = setTimeout(() => { const b = dead ? null : fileOf(String(url)); res(b ? { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : { ok: false, status: 404 }); }, 15);
    init?.signal?.addEventListener('abort', () => { clearTimeout(t); cut.push(String(url)); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  });
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const askedOf = (run) => served.filter((u) => u.includes(`/${run}/`)).length, cutOf = (run) => cut.filter((u) => u.includes(`/${run}/`)).length;
  const lost = [], onLost = (e) => lost.push(String(e?.name ?? e));
  process.on('unhandledRejection', onLost);
  globalThis.createImageBitmap = async (blob) => { const png = decodePng(Buffer.from(await blob.arrayBuffer())); return { width: png.width, height: png.height, rgba: toRgba(png), close() {} }; };
  globalThis.OffscreenCanvas = class { getContext() { let img = null; return { drawImage: (b) => { img = b; }, getImageData: () => ({ data: new Uint8ClampedArray(img.rgba) }) }; } };
  const { loadField, loadCurrentField, loadCurrentUv } = await import('../src/sea/seaClient.ts');
  const posK = legPos[5], want = JSON.stringify(D.waveAt(F19, posK));
  const hourOf = (run, signal) => D.loadTripHour({ run, runMs: RUN_MS, curDoc: { run, t0: T07 - 6 * H, uv: { hours: 72 } }, hourMs: T07, signal });
  // (a) the leg's own first pass is aborted while its files are on the way (the current file arrived): the second pass has the wave
  const ac1 = new AbortController(), first = hourOf('2026111801', ac1.signal);
  ac1.abort();
  const second = await hourOf('2026111801', new AbortController().signal);
  await first;
  // (b) the map asked for the same file first and aborts (hour or layer changed): the leg asks again and has the wave
  const acMap = new AbortController(), mapLoad = loadField('2026111802', 'f', 19, acMap.signal).then(() => 'img', (e) => e?.name);
  const legP = hourOf('2026111802', new AbortController().signal);
  acMap.abort();
  const leg = await legP, mapEnd = await mapLoad;
  // (c) the leg stops asking while the map waits for the same file: the map still gets its image
  const acLeg = new AbortController(), legGone = hourOf('2026111803', acLeg.signal), mapWaits = loadField('2026111803', 'f', 19, new AbortController().signal).catch(() => null);
  acLeg.abort();
  const mapImg = await mapWaits;
  await legGone;
  // (d) negative control: a file that is not there is „keine Daten“ after ONE read per way, not a loop
  dead = true;
  const n0 = served.length, none = await hourOf('2026111804', new AbortController().signal), asked = served.length - n0;
  // (e) negative control: an abort that IS the leg's own ends the asking
  dead = false;
  const acOwn = new AbortController(), ownMap = new AbortController(), mapFirst = loadField('2026111805', 'f', 19, ownMap.signal).catch(() => null);
  const ownP = hourOf('2026111805', acOwn.signal);
  acOwn.abort(); ownMap.abort();
  const n1 = served.length, own = await ownP;
  await mapFirst;
  await tick();
  const ownAsked = served.length - n1, ownCut = cutOf('2026111805');
  // (f) the leg alone stops asking: nobody waits for its two files any more ⇒ both reads end (no bandwidth for an abandoned leg)
  const acAlone = new AbortController(), aloneP = hourOf('2026111806', acAlone.signal);
  acAlone.abort();
  const alone = await aloneP;
  await tick();
  const tripSrc = src('src/sea/seaTripData.ts');
  add('K6 V-AM-16 (seit V-AM-18 an der Wurzel in `seaClient.ts`, ohne Nachfragen in der Etappe): ein fremder Abbruch ist für die Etappe keine Antwort — (a) ihr eigener erster Durchlauf wird abgebrochen, der zweite hat Welle UND Strom, jede Datei EINMAL geholt; (b) die Karte bricht denselben Abruf ab, die Etappe bekommt ihr Bild aus demselben Abruf; (c) die Etappe hört auf zu fragen, die Karte bekommt ihr Bild trotzdem; (d) eine fehlende Datei bleibt „keine Daten“ nach je einem Abruf je Weg; (e) nach dem eigenen Abbruch hat sie keinen Wert und fragt nicht weiter; (f) hört sie allein auf, enden ihre zwei Abrufe',
    JSON.stringify(D.waveAt(second.wave, posK)) === want && want.includes('"hs"') && second.uv != null && D.currentAt(second.uv, posK) != null && askedOf('2026111801') === 2 && cutOf('2026111801') === 0
    && JSON.stringify(D.waveAt(leg.wave, posK)) === want && mapEnd === 'AbortError' && askedOf('2026111802') === 2 && cutOf('2026111802') === 0 && mapImg != null && mapImg.width === 630
    && none.wave === null && none.uv === null && asked === 4 && own.wave === null && own.uv === null && ownAsked === 0 && ownCut === 2
    && alone.wave === null && alone.uv === null && askedOf('2026111806') === 2 && cutOf('2026111806') === 2
    && !/SEA_TRIP_SHARED_TRIES|sharedLoad/.test(tripSrc) && cnt(tripSrc, /, x\.signal\)\.catch\(\(\) => null\)/g) === 2,
    JSON.stringify({ a: [D.waveAt(second.wave, posK), second.uv != null, askedOf('2026111801'), cutOf('2026111801')], b: [D.waveAt(leg.wave, posK), mapEnd, askedOf('2026111802')], c: mapImg?.width ?? null, d: [none.wave, none.uv, asked], e: [own.wave, ownAsked, ownCut], f: [alone.wave, alone.uv, askedOf('2026111806'), cutOf('2026111806')] }));

  // K7 (V-AM-18): the shared loaders themselves, as the map uses them. A read belongs to everybody who waits for it, not to
  // whoever asked first.
  const name = (p) => p.then((v) => (v == null ? null : 'ok'), (e) => e?.name);
  // (a) the map changes the layer on the same file while it loads (Wellenhöhe ↔ Periode): React runs the cleanup of the old
  //     effect and the new effect in one pass — the second ask must not get the dying read
  const a1 = new AbortController(), aOld = name(loadField('2026111811', 'f', 19, a1.signal));
  a1.abort();
  const aImg = await loadField('2026111811', 'f', 19, new AbortController().signal).catch((e) => e?.name);
  const a = [await aOld, aImg?.width ?? aImg, askedOf('2026111811'), cutOf('2026111811')];
  // (b) the only caller leaves (the time is dragged on): the read ends, and a later ask reads again
  const b1 = new AbortController(), bOld = name(loadField('2026111812', 'f', 19, b1.signal));
  b1.abort();
  await tick();
  const bCut = cutOf('2026111812'), bImg = await loadField('2026111812', 'f', 19, new AbortController().signal).catch(() => null);
  const b = [await bOld, bCut, bImg?.width ?? null, askedOf('2026111812')];
  // (c) two callers, one leaves later: the other one has its image from the one read
  const c1 = new AbortController(), cGone = name(loadField('2026111813', 'f', 19, c1.signal)), cStay = loadField('2026111813', 'f', 19, new AbortController().signal).then((i) => i?.width ?? null, (x) => x?.name);
  await tick(2);
  c1.abort();
  const c = [await cGone, await cStay, askedOf('2026111813'), cutOf('2026111813')];
  // (d) a caller without a signal (the page warms the next hour of the current) holds the read; the answer is kept
  const dHold = loadCurrentUv('2026111814', 6).catch(() => null), d1 = new AbortController(), dGone = name(loadCurrentUv('2026111814', 6, d1.signal));
  d1.abort();
  const dGrid = await dHold, dKept = await loadCurrentUv('2026111814', 6, new AbortController().signal).catch(() => null);
  const d = [await dGone, dGrid != null, dKept === dGrid, askedOf('2026111814'), cutOf('2026111814')];
  // (e) the same pass as (a) on the two loaders of the current
  const e1 = new AbortController(), eOld = name(loadCurrentUv('2026111815', 6, e1.signal));
  e1.abort();
  const eUv = await loadCurrentUv('2026111815', 6, new AbortController().signal).catch((x) => x?.name);
  const e2 = new AbortController(), eOld2 = name(loadCurrentField('2026111815', 7, e2.signal));
  e2.abort();
  const eArr = await loadCurrentField('2026111815', 7, new AbortController().signal).catch((x) => x?.name);
  const e = [await eOld, eUv != null && typeof eUv === 'object', await eOld2, eArr?.length ?? eArr, askedOf('2026111815'), cutOf('2026111815')];
  // (f) negative controls: a signal that is already aborted asks nothing; a read that failed is not remembered, one that answered is
  const f0 = new AbortController();
  f0.abort();
  const fDead = await name(loadField('2026111816', 'f', 19, f0.signal)), fAsked = askedOf('2026111816');
  dead = true;
  const fNone = await loadField('2026111817', 'f', 19, new AbortController().signal).catch((x) => x?.name);
  dead = false;
  const fThen = await loadField('2026111817', 'f', 19, new AbortController().signal).catch(() => null), fSame = await loadField('2026111817', 'f', 19).catch(() => null);
  const f = [fDead, fAsked, fNone, fThen?.width ?? null, fSame === fThen, askedOf('2026111817')];
  // (g) a caller asks in the moment between the end of an abandoned read and the settling of its promise (the page does
  //     ask from inside promise continuations: the warm-up of the next hour): it gets a read of its own, not the ended one
  const g1 = new AbortController(), gOld = name(loadField('2026111818', 'f', 19, g1.signal));
  g1.abort();
  await null;
  const gImg = await loadField('2026111818', 'f', 19, new AbortController().signal).catch(() => null);
  const g = [await gOld, gImg?.width ?? null, askedOf('2026111818'), cutOf('2026111818')];
  await tick(5);
  process.off('unhandledRejection', onLost);
  globalThis.fetch = keep.fetch; globalThis.createImageBitmap = keep.cib; globalThis.OffscreenCanvas = keep.oc;
  const client = src('src/sea/seaClient.ts');
  add('K7 V-AM-18: ein geteilter Abruf gehört allen, die auf ihn warten — (a) Ebenenwechsel auf derselben Datei, während sie lädt (Abbruch und neue Frage im selben Durchlauf): der alte Frager endet mit Abbruch, der neue hat sein Bild aus demselben EINEN Abruf; (b) geht der einzige Frager, endet der Abruf (keine Bandbreite beim Ziehen der Zeit) und eine spätere Frage lädt neu; (c) von zwei Fragern geht einer: der andere hat sein Bild, ein Abruf, keiner beendet; (d) ein Frager ohne Signal hält den Abruf, die Antwort bleibt im Speicher; (e) dasselbe wie (a) am u/v-Feld und am Pfeilfeld der Strömung; (f) Gegenproben: ein schon abgebrochenes Signal fragt nichts, ein gescheiterter Abruf wird nicht gemerkt, ein beantworteter schon; (g) wer genau zwischen dem Ende eines verlassenen Abrufs und dessen Abschluss fragt, bekommt einen eigenen Abruf und nicht den beendeten; kein Versprechen bleibt ohne Abnehmer',
    JSON.stringify(a) === '["AbortError",630,1,0]' && JSON.stringify(b) === '["AbortError",1,630,2]' && JSON.stringify(c) === '["AbortError",630,1,0]' && JSON.stringify(d) === '["AbortError",true,true,1,0]'
    && JSON.stringify(e) === `["AbortError",true,"AbortError",${SEA_CURRENT_FIELD.nx * SEA_CURRENT_FIELD.ny * 4},2,0]` && JSON.stringify(f) === '["AbortError",0,null,630,true,3]' && JSON.stringify(g) === '["AbortError",630,2,1]' && lost.length === 0
    // wiring: all three loaders read through the shared entry with ITS signal — none hands the caller's signal to the store
    && cnt(client, /= sharedRead\(/g) === 3 && cnt(client, /fetchSea\(path, 'bytes', own\)/g) === 3 && !/fetchSea\(path, 'bytes', signal\)/.test(client),
    JSON.stringify({ a, b, c, d, e, f, g, lost }));
}

// --- L: arrows beside the route (V-AM-9, §9) ---------------------------------------------------------------------------
{
const rad = (d) => (d * Math.PI) / 180, n360 = (d) => ((d % 360) + 360) % 360;
/** Second rule for the side: the from-vector lies to the right of the course vector (z of the cross product < 0), east/north axes. */
const sideByCross = (from, course) => (Math.sin(rad(course)) * Math.cos(rad(from)) - Math.cos(rad(course)) * Math.sin(rad(from)) <= 1e-9 ? 1 : -1);
add('L1 Seite der Route: Wind aus Ost auf Nordkurs steht an Steuerbord, aus West an Backbord; genau von vorn und von achtern zählt Steuerbord; über Nord hinweg (Kurs 350°, Wind aus 10° ⇒ Steuerbord; Kurs 10°, Wind aus 350° ⇒ Backbord); auf 648 Paaren dieselbe Antwort wie die zweite Regel',
  T.tripArrowSide(90, 0) === 1 && T.tripArrowSide(270, 0) === -1 && T.tripArrowSide(0, 0) === 1 && T.tripArrowSide(180, 0) === 1 && T.tripArrowSide(10, 350) === 1 && T.tripArrowSide(350, 10) === -1 && T.tripArrowSide(200, 13) === -1
  && Array.from({ length: 36 }, (_, i) => i * 10).every((c) => Array.from({ length: 18 }, (_, k) => k * 20 + 7).every((f) => T.tripArrowSide(f, c) === sideByCross(f, c))));
const arrL = T.tripArrows(rowsL, 'kn'), windA = arrL.filter((a) => a.kind === 'wind'), curA = arrL.filter((a) => a.kind === 'cur');
const withDir = rowsL.map((r, i) => ({ r, i })).filter((x) => x.r.wind?.windMs != null && x.r.wind.windDir != null);
const curBest = rowsL.map((r, i) => ({ r, i })).filter((x) => x.r.cur && x.r.cur !== 'land' && x.r.cur.kn >= 0.2).sort((p, q) => q.r.cur.kn - p.r.cur.kn)[0];
add('L2 Pfeile aus den echten Zeilen (E-AM-17, E-AM-20, E-AM-21): ein Windpfeil je Stopp mit Wert UND Richtung (die Startstunde in Laboe trägt keine ⇒ kein Pfeil), am Ort des Stopps, zeigt dorthin, wohin der Wind weht, trägt die Zahl der Tabellenspalte und Rot genau dort, wo der WIND über der Grenze liegt; EIN Strompfeil am Stopp mit dem stärksten Strom ab 0,2 kn, auf der anderen Seite als der Windpfeil dort, „Strom 0,3 kn“',
  rowsL[0].wind.windDir === null && rowsL[0].wind.windMs != null && !windA.some((a) => a.row === 0) && windA.length === withDir.length && windA.length === 4
  && withDir.every(({ r, i }) => { const a = windA.find((x) => x.row === i); return a && a.lat === r.stop.pos.lat && a.lon === r.stop.pos.lon && near(a.to, n360(r.wind.windDir + 180)) && a.label === `${Math.round(r.wind.windMs * MS_TO_KN)} kn` && a.over === (r.wind.windMs * MS_TO_KN > LIM.windMax) && near(a.off, n360(r.stop.pos.course + 90 * sideByCross(r.wind.windDir, r.stop.pos.course))); })
  && windA.every((a) => a.over) && curA.length === 1 && curBest && curA[0].row === curBest.i && near(curA[0].to, curBest.r.cur.to) && curA[0].label === 'Strom 0,3 kn' && curA[0].over === false
  && near(n360(curA[0].off - windA.find((a) => a.row === curBest.i).off), 180) && rowsL.filter((r) => r.cur && r.cur !== 'land').some((r) => r.cur.kn < 0.2),
  JSON.stringify(arrL.map((a) => [a.kind, a.row, Math.round(a.to), Math.round(a.off), a.label, a.over])));
const noDir = rowsL.map((r) => ({ ...r, wind: { ...r.wind, windDir: null } })), calm = rowsL.map((r) => ({ ...r, cur: r.cur && r.cur !== 'land' ? { ...r.cur, kn: 0.19 } : r.cur }));
const gustRows = T.tripRows(tl, sm.samples, data, { windMax: 99, gustMax: 1, hsMax: 9 }, names);
const curOnly = T.tripArrows(noDir, 'kn'), landRows = rowsL.map((r) => ({ ...r, cur: 'land' })), tie = rowsL.map((r) => ({ ...r, cur: { kn: 0.5, to: 90 } }));
add('L3 Gegenproben: ohne Richtung kein Windpfeil (der Strompfeil bleibt und steht dann auf der Seite, von der der Strom kommt); Strom unter 0,2 kn, „kein Wasserpunkt“ oder ohne Wert ⇒ kein Strompfeil; gleich starker Strom ⇒ der erste Stopp; die Einheit der Seite steht an der Zahl (Bft, km/h), der Strom bleibt in Knoten; ohne Zeilen nichts',
  curOnly.length === 1 && curOnly[0].kind === 'cur' && near(curOnly[0].off, n360(rowsL[3].stop.pos.course + 90 * sideByCross(n360(rowsL[3].cur.to + 180), rowsL[3].stop.pos.course)))
  && T.tripArrows(calm, 'kn').every((a) => a.kind === 'wind') && T.tripArrows(calm, 'kn').length === 4 && T.tripArrows(landRows, 'kn').every((a) => a.kind === 'wind') && T.tripArrows(rowsL.map((r) => ({ ...r, cur: null })), 'kn').length === 4
  && T.tripArrows(tie, 'kn').find((a) => a.kind === 'cur').row === 0 && T.tripArrows(rowsL, 'bft').filter((a) => a.kind === 'wind').every((a) => / Bft$/.test(a.label)) && T.tripArrows(rowsL, 'kmh').filter((a) => a.kind === 'wind').every((a) => / km\/h$/.test(a.label))
  && T.tripArrows(rowsL, 'bft').find((a) => a.kind === 'cur').label === 'Strom 0,3 kn' && T.tripArrows([], 'kn').length === 0 && T.tripArrows(rowsL.map((r) => ({ ...r, wind: null })), 'kn').every((a) => a.kind === 'cur')
  // Red follows the WIND alone: with a wind limit nobody reaches and a gust limit everybody breaks, the route is red and no arrow is.
  && gustRows.every((r) => r.status === 'over' && !r.over.wind) && T.tripArrows(gustRows, 'kn').filter((a) => a.kind === 'wind').length === 4 && T.tripArrows(gustRows, 'kn').every((a) => a.over === false)
  // The strongest current, not the first one above the threshold.
  && T.tripArrows(rowsL.map((r, i) => ({ ...r, cur: { kn: [0.3, 0.6, 0.4, 0.25, 0.1][i], to: 90 } })), 'kn').find((a) => a.kind === 'cur').row === 1 && T.tripArrows(rowsL.map((r, i) => ({ ...r, cur: { kn: [0.3, 0.6, 0.4, 0.25, 0.1][i], to: 90 } })), 'kn').find((a) => a.kind === 'cur').label === 'Strom 0,6 kn');
const OFF = T.SEA_TRIP_ARROW_OFF_PX, LEN = T.SEA_TRIP_ARROW_LEN_PX, steps = Array.from({ length: 24 }, (_, i) => i * 15);
// The route through the stop, as the layout sees it: a line at a right angle to the bearing of the arrow's side.
const lineDist = (off, x, y) => x * Math.sin(rad(off)) - y * Math.cos(rad(off));
let clear = Infinity, labelClear = Infinity, offLen = true, flipOk = true;
for (const off of steps) for (const to of steps) for (const flip of [false, true]) {
  const a = { off, to, label: 'Strom 0,8 kn', over: false }, p = T.tripArrowPx(a, flip), side = flip ? -1 : 1;
  const half = { x: Math.sin(rad(to)) * LEN / 2, y: -Math.cos(rad(to)) * LEN / 2 };
  clear = Math.min(clear, side * lineDist(off, p.dx, p.dy) - Math.abs(lineDist(off, half.x, half.y)));
  const r = T.tripArrowRects(a, { x: 0, y: 0 }, flip).label;
  for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) labelClear = Math.min(labelClear, side * lineDist(off, x, y));
  if (Math.abs(Math.hypot(p.dx, p.dy) - OFF) > 0.8) offLen = false;
  const q = T.tripArrowPx(a, !flip);
  if (Math.abs(p.dx + q.dx) > 1 || Math.abs(p.dy + q.dy) > 1) flipOk = false;
}
const north = T.tripArrowPx({ off: 0, to: 0 }), south = T.tripArrowPx({ off: 180, to: 90 }), east = T.tripArrowPx({ off: 90, to: 0 }), west = T.tripArrowPx({ off: 270, to: 0 });
const wide = T.tripArrowRects({ off: 270, to: 0, label: 'Strom 0,8 kn', over: false }, { x: 100, y: 100 }), red = T.tripArrowRects({ off: 90, to: 0, label: '28 kn', over: true }, { x: 100, y: 100 });
add('L4 Lage am Bildschirm (E-AM-18, Norden oben): die Pfeilmitte steht 34 px neben dem Stopp, gewendet genau gegenüber; über 1 152 Lagen (Seite × Pfeilrichtung × gewendet) bleibt jedes Pfeilende mindestens 18 px von der Route, und auch die breiteste Zahl („Strom 0,8 kn“) berührt die Route nicht — über einem Pfeil nördlich der Route, unter einem südlich, neben einer Route links oder rechts bündig und von ihr weg; ein stehender Pfeil rückt die Zahl weiter ab als ein liegender',
  OFF === 34 && LEN === 30 && offLen && flipOk && clear >= 18 && labelClear >= 5 && north.dx === 0 && north.dy === -34 && north.labelDy === -27 && north.align === 0 && south.dy === 34 && south.labelDy === 12 && south.align === 0
  && east.dx === 34 && east.dy === 0 && east.labelDy === -27 && east.align === 1 && west.dx === -34 && west.align === -1 && T.tripArrowPx({ off: 0, to: 90 }).labelDy === -12 && T.tripArrowPx({ off: 90, to: 0 }, true).dx === -34
  && T.tripArrowLabelW({ label: 'Strom 0,8 kn', over: false }) === 90 && wide.label.x + wide.label.w === 100 - 34 + 10 && wide.label.x === 100 - 34 + 10 - 90 && red.label.x === 100 + 34 - 10 && red.label.w === Math.round(5 * 7.5) + 14
  && wide.arrow.w === T.SEA_TRIP_ARROW_BOX_PX && near(wide.centre.x, 66) && near(wide.centre.y, 100), 'Pfeil ' + clear.toFixed(1) + ' px, Zahl ' + labelClear.toFixed(1) + ' px von der Route');
// A leg heading north on the screen: stops 30 px (or more) apart, wind from the east: every arrow on the right, pointing west.
const W = (row, over = false, label = '12 kn') => ({ kind: 'wind', row, over, off: 90, to: 270, label });
const col = (n, step) => Array.from({ length: n }, (_, i) => ({ x: 200, y: 600 - i * step }));
const seven = Array.from({ length: 7 }, (_, i) => W(i)), sevenOver = seven.map((a) => (a.row === 4 ? W(4, true) : a));
const idx = (l) => l.map((x) => x.i), lay = (arr, pts, sel, blocked = [], min) => T.tripArrowLayout(arr, pts, sel, blocked, min);
const kSel = lay(seven, col(7, 30), 3), kOver = lay(sevenOver, col(7, 30), 3), kOverNoSel = lay(sevenOver, col(7, 30), -1);
const centreOf = (pts, x) => ({ x: pts[x.i].x + x.dx, y: pts[x.i].y + x.dy });
const apart = (l, pts) => l.every((a, i) => l.every((b, j) => i === j || Math.hypot(centreOf(pts, a).x - centreOf(pts, b).x, centreOf(pts, a).y - centreOf(pts, b).y) >= T.SEA_TRIP_ARROW_MIN_PX));
const withCur = [...seven, { kind: 'cur', row: 3, over: false, off: 270, to: 0, label: 'Strom 0,3 kn' }], curPts = [...col(7, 30), col(7, 30)[3]];
// The boat's label stands right of stop 3 (where its arrow wants to be); the name of the start stands under stop 0.
const boatLabel = { x: 222, y: 300 - 13, w: 110, h: 26 }, startPill = { x: 160, y: 612, w: 80, h: 24 }, both = [{ x: 100, y: 270, w: 200, h: 70 }];
const kBlocked = lay(seven, col(7, 100), 3, [boatLabel]), sel3 = kBlocked.find((x) => x.i === 3), free3 = lay(seven, col(7, 100), 3).find((x) => x.i === 3);
const lowWind = [{ kind: 'wind', row: 0, over: false, off: 180, to: 0, label: '3 kn' }], kPill = lay(lowWind, [{ x: 200, y: 600 }], 0, [startPill]), kNone = lay(seven, col(7, 100), 3, both);
add('L5 Ausdünnen und Ausweichen (E-AM-19, E-AM-23): sieben Pfeile im Abstand von 30 px ⇒ es bleiben die, die 58 px halten, zuerst der der gewählten Spalte; liegt einer über deiner Grenze daneben, bleibt der gewählte; ohne gewählte Spalte bleibt der über der Grenze; der Strompfeil bleibt immer, auch zwischen zwei Etiketten; steht das Etikett des Boots dort, wo der Pfeil hin will, wechselt er die Seite (und nur er); steht auf beiden Seiten eins, fällt er weg; bei 100 px bleiben alle; aufsteigend',
  T.SEA_TRIP_ARROW_MIN_PX === 58 && idx(kSel).includes(3) && apart(kSel, col(7, 30)) && kSel.length === 3 && kSel.every((x) => x.flip === false && x.dx === 34 && x.align === 1) && idx(kOver).includes(3) && !idx(kOver).includes(4)
  && idx(kOverNoSel).includes(4) && !idx(kOverNoSel).includes(3) && !idx(kOverNoSel).includes(5) && apart(kOverNoSel, col(7, 30)) && idx(lay(withCur, curPts, 3)).includes(7) && idx(lay(withCur, curPts, 3)).includes(3)
  && lay(withCur, curPts, 3, both.map((b) => ({ ...b, y: 480 }))).some((x) => x.i === 7 && x.flip === false) && idx(lay(seven, col(7, 100), 3)).length === 7 && free3.flip === false && sel3.flip === true && sel3.dx === -34 && sel3.align === -1
  && kBlocked.filter((x) => x.flip).length === 1 && kBlocked.length === 7 && kPill.length === 1 && kPill[0].flip === true && kPill[0].dy === -34 && !idx(kNone).includes(3) && kNone.length === 6
  && [kSel, kOver, kOverNoSel, kBlocked].every((k) => idx(k).every((v, i) => i === 0 || idx(k)[i - 1] < v)) && lay([], [], 0).length === 0 && lay(seven, col(7, 30), 3, [], 0).length === 7 && lay(seven, [null, ...col(6, 100)], 3).length === 6,
  JSON.stringify([idx(kSel), idx(kOver), idx(kOverNoSel), kBlocked.filter((x) => x.flip).map((x) => x.i), idx(kNone)]));
const arrCss = (sel) => (css.match(new RegExp('\\n' + sel.replace(/[.]/g, '\\.') + ' \\{([^}]*)\\}')) ?? [])[1] ?? '';
const syncA = mapSrc.slice(mapSrc.indexOf('function syncArrows()'), mapSrc.indexOf('function syncTrip()'));
add('L6 Karte und Seite: die Pfeile sind Marker wie Punkte und Boot (keine Symbol- und keine eigene GL-Ebene), nehmen keine Klicks, werden NACH Route, Punkten und Boot gesetzt (sie weichen deren Etiketten, am Bildschirm gemessen), nach einem Zoom neu, verschwinden beim Ziehen eines Punkts und beim Schließen; die Seite gibt die Pfeile der Zeilen und die gewählte Spalte; ohne gültigen Lauf keine; die Marke bekommt keine eigene position',
  syncA.length > 200 && /tripArrowLayout\(t\.arrows, t\.arrows\.map\(\(a\) => map\.project\(\[a\.lon, a\.lat\]\)\), t\.arrowSel, blocked\)/.test(syncA) && /new maplibregl\.Marker\(\{ element: el, anchor: 'center', offset: \[p\.dx, p\.dy\] \}\)/.test(syncA)
  && /if \(!map \|\| !t \|\| tripDrag\.current \|\| !t\.arrows\.length\) return;/.test(syncA) && /label\.textContent = a\.label;/.test(syncA) && !/innerHTML = a\.|draggable/.test(syncA) && /setAttribute\('aria-hidden', 'true'\)/.test(syncA)
  && /querySelector\('span'\)/.test(syncA) && /querySelector\('\.sw-am-boatlabel'\)/.test(syncA) && /getBoundingClientRect\(\)/.test(syncA) && /function syncTrip\(\) \{ syncRoute\(\); syncArrows\(\); \}/.test(mapSrc)
  && /map\.on\('zoomend', syncArrows\);/.test(mapSrc) && /m\.on\('dragstart', \(\) => \{ tripDrag\.current = true; syncArrows\(\); \}\);/.test(mapSrc) && /for \(const m of tripMarks\.current\.arr\) m\.remove\(\);/.test(mapSrc)
  && cnt(mapSrc, /id: 'sw-trip-[a-z]+'/g) === 4 && /arrows: tripArrowList, arrowSel: tripView\?\.sel \?\? -1,/.test(page) && /const tripArrowsNow = tripView && !noData \? tripArrows\(tripView\.rows, unit\) : \[\];/.test(page)
  && /pointer-events: none/.test(arrCss('.sw-am-arr')) && !/position/.test(arrCss('.sw-am-arr')) && arrCss('.sw-am-arr').length > 10 && /position: absolute/.test(arrCss('.sw-am-arr-l'))
  && /left: calc\(50% - 10px\); transform: translate\(0, -50%\)/.test(arrCss('.sw-am-arr-l.is-from')) && /left: calc\(50% \+ 10px\); transform: translate\(-100%, -50%\)/.test(arrCss('.sw-am-arr-l.is-to')) && T.SEA_TRIP_ARROW_LABEL_IN_PX === 10
  && ['sw-am-arr-g', 'sw-am-arr-case', 'sw-am-arr-core', 'sw-am-arr-l', 'sw-am-keyarr'].every((c) => css.includes('.' + c)) && /stroke-dasharray/.test(arrCss('.sw-am-arr.is-cur .sw-am-arr-core.is-shaft, .sw-am-keyarr.is-cur .sw-am-arr-core.is-shaft')));
add('L7 Legende der Tabelle: zu den drei Farben der Route kommen die zwei Pfeile mit ihrem Wortlaut — „Wind, wenn du dort bist“ (die Stunde der Spalte, nicht die der Seite) und „stärkster Strom der Etappe“; die Pfeile sind Zeichnung, kein Text für den Vorleser',
  T.TRIP_LEGEND.wind === 'Wind, wenn du dort bist' && T.TRIP_LEGEND.cur === 'stärkster Strom der Etappe' && cnt(tbl, /<svg class="sw-am-keyarr is-(wind|cur)"[^>]*aria-hidden="true"/g) === 2 && tbl.indexOf('ein Wert fehlt') < tbl.indexOf('Wind, wenn du dort bist')
  && tbl.indexOf('Wind, wenn du dort bist') < tbl.indexOf('stärkster Strom der Etappe') && cnt(tbl, /<ul class="sw-am-key"/g) === 1 && tbl.includes('aria-label="Route und Pfeile auf der Karte"'));
}

// --- M: a leg on an inland lake (phase BS-N, V-BS-4, audit/seewetter-binnenseen.md §8) -----------------------------------
// No wave and no current model on a lake: the rows are not "missing" for them, the table leaves both rows out, the
// findings do not list them. The lake is recognised by a lake spot at an end or by the outline; the note for water
// outside DE/AT/CH reads the border from the country outlines of the site (real files), not from the clipped borders.
{
  const LT = await import('../src/sea/lakeTrip.ts');
  const LK = await import('../src/sea/seaLakes.ts');
  const BL = await import('./sea/build-lake-spots.mjs');
  const { inCountry } = await import('../src/pointForecast/countryOfPoint.ts');
  const lakeCat = JSON.parse(readFileSync(join(FIX, 'lakes', 'spots-lakes.json'), 'utf8')), lakeSrc = JSON.parse(readFileSync(join(ROOT, 'scripts/sea/lakes-src.json'), 'utf8'));
  const LSPOTS = lakeCat.spots, LAKES = lakeCat.lakes, lakeOf = (id) => LAKES.find((l) => l.id === id), lspot = (id) => LSPOTS.find((x) => x.id === id);
  const geo = (c) => JSON.parse(readFileSync(join(ROOT, 'public', 'countries', `${c}.geojson`), 'utf8')).geometry;
  const CH = geo('CH'), AT = geo('AT');
  // The recorded EU-Hydro answer of the Traunsee as the map's outline (MultiPolygon).
  const traun = { properties: { id: 'traunsee' }, geometry: { type: 'MultiPolygon', coordinates: BL.outlinePolys(lakeSrc.lakes.find((l) => l.id === 'traunsee'), readFileSync(join(FIX, 'lakes', 'outline-traunsee.json')), lakeSrc.spots.filter((x) => x.lake === 'traunsee')) } };
  const atSpot = (id) => { const x = lspot(id); return { lat: x.lake.pt.lat, lon: x.lake.pt.lon, spot: id }; };
  const free = [{ lat: 47.88, lon: 13.795 }, { lat: 47.84, lon: 13.79 }];
  const bySpot = LT.tripLakeOf([atSpot('genfersee-lausanne'), { lat: 46.41, lon: 6.59 }], LSPOTS, LAKES, null);
  const byShape = LT.tripLakeOf(free, LSPOTS, LAKES, [traun]);
  add('M1 See der Etappe: ein Seespot am Start oder Ziel ⇒ sein See mit seinen Landesparametern; zwei freie Punkte im aufgezeichneten Umriss des Traunsees ⇒ Traunsee mit den Parametern des nächsten Spots (AT); ohne Umrisse nur die Spot-Regel; eine Etappe auf der Ostsee, ein Punkt an Land und eine leere Etappe ⇒ kein See',
    bySpot?.lake.id === 'genfersee' && bySpot.country === 'CH' && LT.tripLakeOf([{ lat: 46.41, lon: 6.59 }, atSpot('genfersee-lausanne')], LSPOTS, LAKES, null)?.lake.id === 'genfersee'
    && free.every((q) => LT.inLakeGeo(traun.geometry, q.lon, q.lat)) && byShape?.lake.id === 'traunsee' && byShape.country === 'AT' && LT.tripLakeOf(free, LSPOTS, LAKES, null) === null
    && LT.tripLakeOf(PTS, [...CAT, ...LSPOTS], LAKES, [traun]) === null && LT.tripLakeOf([{ lat: 47.95, lon: 13.6 }, { lat: 47.96, lon: 13.6 }], LSPOTS, LAKES, [traun]) === null && LT.tripLakeOf([], LSPOTS, LAKES, [traun]) === null
    && !LT.inLakeGeo(null, 13.79, 47.88) && !LT.inLakeGeo({ type: 'Point', coordinates: [13.79, 47.88] }, 13.79, 47.88),
    JSON.stringify([bySpot?.lake.id, bySpot?.country, byShape?.lake.id, byShape?.country]));

  // Rows and findings: the real leg and wind, but no field of any hour (what the hook loads on a lake: nothing).
  const lakeData = dataOf({ hours: new Map() }), SEA = {}, LAKE = { noSea: true };
  const rSea = T.tripRows(tl, sm.samples, lakeData, LIM, names, SEA), rLake = T.tripRows(tl, sm.samples, lakeData, LIM, names, LAKE);
  const fSea = T.tripFindings(rSea, tl, LIM, 'kn', PTS[2], SEA), fLake = T.tripFindings(rLake, tl, LIM, 'kn', PTS[2], LAKE);
  const rLakeNo = T.tripRows(tl, sm.samples, lakeData, NOLIM, names, LAKE), fLakeNo = T.tripFindings(rLakeNo, tl, NOLIM, 'kn', PTS[2], LAKE);
  const cSea = T.tripCompare(route, SPEED, T07, sm.samples, lakeData, NOLIM, 'kn', axis), cLake = T.tripCompare(route, SPEED, T07, sm.samples, lakeData, NOLIM, 'kn', axis, LAKE);
  add('M2 Zeilen und Befunde auf dem See: ohne Wellenfeld ist keine Zeile „ein Wert fehlt“ (Wind und Böen liegen vor), die Befunde nennen weder „Welle: keine Daten“ noch „Strom: keine Daten“, „soweit Werte vorliegen“ entfällt, der Vergleich der Abfahrten meldet keine fehlenden Werte; Wind- und Böen-Befunde und ihre Grenzen bleiben dieselben — Gegenprobe: dieselbe Etappe als Seestrecke meldet beides',
    rLakeNo.every((r) => r.status === 'in') && T.tripRows(tl, sm.samples, lakeData, NOLIM, names, SEA).every((r) => r.status === 'missing')
    && !fLake.list.some((x) => /^(Welle|Strom): keine Daten/.test(x.text)) && fSea.list.filter((x) => /^(Welle|Strom): keine Daten/.test(x.text)).length === 2 && fLakeNo.gaps === false && fSea.gaps === true
    && JSON.stringify(fLake.list.filter((x) => x.kind === 'wind' || x.kind === 'gust')) === JSON.stringify(fSea.list.filter((x) => x.kind === 'wind' || x.kind === 'gust')) && fLake.over === fSea.over
    && rLake.every((r, i) => r.over.wind === rSea[i].over.wind && r.over.gust === rSea[i].over.gust && JSON.stringify(r.wind) === JSON.stringify(rSea[i].wind))
    && cLake.every((c) => c.gaps === false) && cSea.some((c) => c.gaps === true),
    JSON.stringify([rLakeNo.map((r) => r.status).join(), fLake.list.map((x) => x.kind).join(), fSea.list.map((x) => x.kind).join()]));
  // A missing WIND is still missing on a lake.
  const rOut = T.tripRows(tl, sm.samples, dataOf({ wind: emptyWind, hours: new Map() }), NOLIM, names, LAKE), fOutL = T.tripFindings(rOut, tl, NOLIM, 'kn', null, LAKE);
  add('M3 ein fehlender Wind bleibt auch auf dem See „ein Wert fehlt“ und steht in den Befunden', rOut.some((r) => r.status === 'missing') && fOutL.gaps === true && fOutL.list.some((x) => /^Wind: keine Daten/.test(x.text)));

  // Display.
  const lakeInfo = (foreign) => ({ id: 'genfersee', name: 'Genfersee', country: 'CH', foreign });
  const lakeView = { ...view, rows: rLake, findings: fLake, compare: cLake, official: [], level: null, lake: lakeInfo(null) };
  const tblLake = html(h(UI.EtappeTable, { view: lakeView, unit: 'kn', onPick: () => {} })), tblSea = html(h(UI.EtappeTable, { view: { ...view, lake: null }, unit: 'kn', onPick: () => {} }));
  add('M4 Tabelle auf dem See: die Zeilen „Welle m“ und „Strom kn“ fehlen (nicht „keine Daten“), der Schlüssel nennt keinen Strompfeil; Uhr, Ort, Wind zum Kurs, Wind, Böen und Wetter bleiben — an der Küste steht die Tabelle wie zuvor',
    !tblLake.includes('Welle m') && !tblLake.includes('Strom kn') && !tblLake.includes(T.TRIP_LEGEND.cur) && !/keine Daten/.test(tblLake) && ['Uhr', 'Ort', 'Wind zum Kurs', 'Wind kn', 'Böen kn', 'Wetter'].every((x) => tblLake.includes(`<th scope="row">${x}</th>`)) && tblLake.includes(T.TRIP_LEGEND.wind)
    && cnt(tblLake, /<tr>/g) === cnt(tblSea, /<tr>/g) - 2 && tblSea === tbl && tblSea.includes('Welle m') && tblSea.includes(T.TRIP_LEGEND.cur));
  const resLake = plain(html(h(UI.EtappeResult, { view: lakeView, etappe: etState, unit: 'kn', profile: 'yacht', noData: null }))), resSea = plain(html(h(UI.EtappeResult, { view, etappe: etState, unit: 'kn', profile: 'yacht', noData: null })));
  const timeLake = plain(html(h(UI.EtappeTimeStep, { etappe: etState, view: lakeView, onSpeed: () => {}, onDepart: () => {}, canEarlier: true, canLater: true })));
  add('M5 Befunde auf dem See: die Karten Abfahrt und Ankunft nennen keine Welle, der Satz erklärt, warum Welle und Strom fehlen, die Hinweise sprechen nicht vom Strom und nicht vom Takt des Wellenmodells; gezählt werden nur Wind und Böen — an der Küste stehen alle Sätze wie zuvor',
    !/Welle: keine Daten|Welle \d/.test(resLake) && resLake.includes(LT.LAKE_TRIP_NOTE) && !resLake.includes(T.TRIP_WAVE_NOTE) && !resLake.includes(T.TRIP_TWO_NOTE) && !resLake.includes(T.TRIP_ARRIVAL_NOTE) && resLake.includes(LT.LAKE_TRIP_ARRIVAL_NOTE) && resLake.includes(T.TRIP_LINE_NOTE) && resLake.includes(T.TRIP_HOURLY_NOTE)
    && /kein Wellenmodell und kein Strömungsmodell/.test(LT.LAKE_TRIP_NOTE) && timeLake.includes('Wind und Böen (auf dem See gibt es kein Wellenmodell).') && !timeLake.includes('Wind, Böen, Welle.') && timeLake.includes(LT.LAKE_TRIP_ARRIVAL_NOTE)
    && resSea.includes(T.TRIP_WAVE_NOTE) && resSea.includes(T.TRIP_TWO_NOTE) && resSea.includes(T.TRIP_ARRIVAL_NOTE) && !resSea.includes(LT.LAKE_TRIP_NOTE) && /Welle/.test(resSea));

  // Water outside DE/AT/CH, on the real outlines.
  const genf = { lake: lakeOf('genfersee'), country: 'CH' }, neus = { lake: lakeOf('neusiedler-see'), country: 'AT' }, lug = { lake: lakeOf('luganersee'), country: 'CH' }, boden = { lake: lakeOf('bodensee'), country: 'DE' };
  const lausanne = { lat: 46.5, lon: 6.63 }, evian = { lat: 46.41, lon: 6.59 };
  const fGenf = LT.tripForeignOf(genf, { CH }, [lausanne, evian]);
  add('M6 fremdes Ufer am Genfersee (Umriss der Schweiz aus public/countries): ein Punkt vor Évian liegt in keinem Heimatland ⇒ Vermerk „… Landesparametern für die Schweiz gerechnet; am französischen Ufer nicht geprüft“ mit 1 von 2 Punkten; nur Schweizer Wasser ⇒ kein Vermerk; Umriss nicht geladen ⇒ unbekannt (undefined), nichts behauptet; ein See ohne fremdes Ufer ⇒ nie',
    fGenf?.land === 'FR' && fGenf.n === 1 && fGenf.of === 2 && fGenf.note === LK.lakeForeignNote('französischen', 'CH') && fGenf.note === 'buscosun Fusion mit den Landesparametern für die Schweiz gerechnet; am französischen Ufer nicht geprüft'
    && LT.tripForeignOf(genf, { CH }, [lausanne]) === null && LT.tripForeignOf(genf, {}, [lausanne, evian]) === undefined && LT.tripForeignOf(genf, { CH }, []) === null
    && LT.tripForeignOf(boden, {}, [evian]) === null && JSON.stringify(LT.lakeHomeLands(lakeOf('bodensee'))) === '["DE","AT","CH"]' && JSON.stringify(LT.lakeHomeLands(genf.lake)) === '["CH"]',
    JSON.stringify(fGenf));
  const fNeus = LT.tripForeignOf(neus, { AT }, [{ lat: 47.8, lon: 16.7 }, { lat: 47.72, lon: 16.68 }]), melide = { lat: 45.955, lon: 8.953 }, ceresio = { lat: 45.905, lon: 8.9 };
  const fLug = LT.tripForeignOf(lug, { CH }, [melide, ceresio]);
  add('M7 Neusiedler See und Luganersee: vor Fertőrákos „ungarischen“, vor Porto Ceresio „italienischen“; das Schweizer Südbecken bei Melide ist Schweizer Wasser — die beschnittene Grenze aus countryBorders.ts kennt es nicht (deshalb der ganze Umriss)',
    fNeus?.land === 'HU' && fNeus.n === 1 && /am ungarischen Ufer nicht geprüft/.test(fNeus.note) && /für Österreich gerechnet/.test(fNeus.note) && fLug?.land === 'IT' && fLug.n === 1 && /am italienischen Ufer nicht geprüft/.test(fLug.note)
    && LT.tripForeignOf(lug, { CH }, [melide]) === null && LT.inLakeGeo(CH, melide.lon, melide.lat) && inCountry('CH', melide.lat, melide.lon) === false,
    JSON.stringify([fNeus, fLug]));
  const resFor = plain(html(h(UI.EtappeResult, { view: { ...lakeView, lake: lakeInfo(fGenf) }, etappe: etState, unit: 'kn', profile: 'yacht', noData: null })));
  const resUnk = plain(html(h(UI.EtappeResult, { view: { ...lakeView, lake: lakeInfo(undefined) }, etappe: etState, unit: 'kn', profile: 'yacht', noData: null })));
  add('M8 Anzeige des Vermerks: „Ein Teil der Etappe liegt vor dem französischen Ufer: buscosun Fusion mit den Landesparametern für die Schweiz gerechnet; am französischen Ufer nicht geprüft.“ — ohne fremdes Wasser und bei unbekanntem Umriss steht er nicht da',
    resFor.includes('Ein Teil der Etappe liegt vor dem französischen Ufer: buscosun Fusion mit den Landesparametern für die Schweiz gerechnet; am französischen Ufer nicht geprüft.') && !/nicht geprüft/.test(resLake) && !/nicht geprüft/.test(resUnk)
    && LT.lakeForeignTripText({ ...fGenf, n: 2 }).startsWith('Die Etappe liegt vor dem französischen Ufer: '));
  const lakeTexts = [LT.LAKE_TRIP_NOTE, LT.LAKE_TRIP_ARRIVAL_NOTE, LT.lakeForeignTripText(fGenf), LT.lakeForeignTripText(fNeus), LT.lakeForeignTripText(fLug)];
  const hookSrc = readFileSync(join(ROOT, 'src/sea/useSeaTrip.ts'), 'utf8'), pageSrc = readFileSync(join(ROOT, 'src/sea/SeaPage.tsx'), 'utf8');
  add('M9 Wortlaut und Verdrahtung: kein verbotenes Wort in den Texten der See-Etappe; der Haken lädt auf dem See kein Wellen- und kein Strömungsfeld, fragt buscosun Fusion mit dem Land der See-Etappe und bekommt Seetabelle und Umrisse von der Seite; die Landesumrisse kommen von der eigenen Seite (/countries/), nicht aus src/pointForecast',
    lakeTexts.every((t) => !banned.test(t)) && /if \(!route \|\| !etappe \|\| noSea\) return \[\] as number\[\];/.test(hookSrc) && /const tripCountry: LakeLand = tripLake\?\.country \?\? 'DE';/.test(hookSrc) && /loadTripWind\(s, tripCountry\)/.test(hookSrc)
    && /lakes: lakeTable, lakeShapes: lakeShapes\?\.features,/.test(pageSrc) && /fetch\(`\/countries\/\$\{land\}\.geojson`\)/.test(readFileSync(join(ROOT, 'src/sea/lakeClient.ts'), 'utf8')) && !/pointForecast/.test(readFileSync(join(ROOT, 'src/sea/lakeTrip.ts'), 'utf8').replace(/^ \*.*$/gm, '')));
}

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail.slice(0, 260)}]` : ''}`);
console.log(`\nverify:sea-trip — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
