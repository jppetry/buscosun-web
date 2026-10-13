/**
 * verify:road-hazards — Phase AW-7 (audit/autobahnwetter.md §19): the hazard contract `src/road/roadHazards.ts`, the segments
 * contract, the sun position, the detail text and the derive against fixtures. The fixtures carry the real data form: four
 * segments of the built `segments.json` (13.10.2026), the stations of the slot 2610131700 and the run 2610131712 of
 * `road/fc/v1` — a scenario copies a real station or point and changes only the values under test.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-hazards.mjs [--write-golden]
 *
 * Cases (startprompt §7): one scenario per hazard with expected level and evidence, sun position against three references
 * (0,5° tolerance), missing input → unknown, measurement gap → unknown (never filled by the model), forecast cap at Stufe 2,
 * golden texts per scenario (banned words scanned), entry and consistency locks, parser round trip, summary, segment
 * builder pieces (merge/split), derive end to end on the fixture store (missing inputs named, state merged, publish).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  ROAD_HAZARDS, ROAD_HAZARD_IDS, ROAD_HAZARD_GROUPS, ROAD_HZ_HOURS, ROAD_HZ_CAP_P, ROAD_HZ_T, evaluateSegment, roadHzEntryProblems,
  roadHzConsistencyProblems, parseRoadHz, roadHzSummary, hzEntryMax, seasonOf, segShadedOrBridged, measurementGap, precipBit,
} from '../src/road/roadHazards.ts';
import { parseRoadSegments, roadSegmentId, ROAD_SEGMENT_ID_RE, stretchBearings, kmOnLine, bearingDeg } from '../src/road/roadSegments.ts';
import { sunPosition, sunInEyes, bearingDiffDeg } from '../src/road/roadSun.ts';
import { roadNarrative, narrativeText, ROAD_NARRATIVE_BANNED } from '../src/road/roadNarrative.ts';
import { parseRoadObs } from '../src/road/roadContract.ts';
import { piecesOf, corridorJunctions, junctionIndex } from './road/build-segments.mjs';
import { deriveRoadHazards, rvPixel, cellsForSegments, stationInput } from './road/road-hazards.mjs';
import { createRoadMirror } from './road/road-mirror.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'lib', 'fixtures', 'road', 'hz');
const GOLDEN = join(FX, 'golden');
const WRITE_GOLDEN = process.argv.includes('--write-golden');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const segFile = parseRoadSegments(readJson(join(FX, 'store', 'static', 'segments.json')));
const SEG = Object.fromEntries(segFile.segments.map((s) => [s.id, s]));
const A8 = SEG['A8-034'];           // Weyarn – Irschenberg: bridges, forest 0,39, grade 7 %
const obs = parseRoadObs(readJson(join(FX, 'store', 'obs', '2610131700.json')));
const SLOT = obs.slotMs;            // 2026-10-13 17:00 UTC
const HOURS = Array.from({ length: ROAD_HZ_HOURS }, (_, i) => SLOT + i * 3_600_000);
const WINTER = Date.UTC(2026, 10, 15, 6, 15);   // the boards' scenario: 15.11.2026 06:15 UTC
const WHOURS = Array.from({ length: ROAD_HZ_HOURS }, (_, i) => WINTER + i * 3_600_000);

// --- Builders of inputs (real form, values under test changed) ------------------------------------
const realStation = obs.points.find((p) => p.id === 'V164') ?? obs.points[0];
const st = (over = {}) => ({
  id: realStation.id, name: realStation.n, t: SLOT, rs: 3.5, ta: 5, td: 2, rh: 80, vis: 5000, wf: 0, cond: 0, ws: 3, wg: 6, wd: 200, pt: null, pr: 0,
  rsTrendKh: 0, taHist: [[SLOT - 3 * 3_600_000, 6], [SLOT - 2 * 3_600_000, 5.5], [SLOT - 3_600_000, 5.2], [SLOT, 5]], rsMax: 8, roadRejected: false, suspect: false, inside: true, ...over,
});
const hour = (over = {}) => ({ t2m: 5, td2m: 2, rr: 0, pp: 5, sn: 0, ff: 2, fx: 4, dd: 200, n: 40, sl: 1500, t85: 0, vis: 20000, th: 5, lpi: 0, cape: 50, ns: 0, ...over });
const pt = (overHours = {}, over = {}) => ({
  id: A8.points[0], lat: A8.coords[0][1], lon: A8.coords[0][0], h: 650, mosKm: 8, tmaxToday: 12,
  hours: HOURS.map((_, i) => hour(typeof overHours === 'function' ? overHours(i) : overHours)), ...over,
});
const SEEN = { frostObsAt: '2026-10-01T05:00:00Z', frostFcAt: '2026-09-30T20:00:00Z' };
const input = (over = {}) => ({ seg: A8, slotMs: SLOT, hours: HOURS, stations: [st()], points: [pt()], radar: { rateNow: 0, rateH1: 0, rateH2: 0 }, cells: [], state: SEEN, missing: new Set(), ...over });
const run = (over) => evaluateSegment(input(over));
const lv = (r, id) => r.entry?.lv[id] ?? null;
const ev = (r, id) => r.entry?.ev[id] ?? null;
const bit = (n) => 2 ** (30 - n);

// --- A: catalogue ------------------------------------------------------------------------------------
add('A1 16 Gefahren in 7 Gruppen, feste Reihenfolge, jede Gruppe des Katalogs kommt vor', ROAD_HAZARDS.length === 16 && ROAD_HAZARD_GROUPS.length === 7
  && ROAD_HAZARD_GROUPS.every((g) => ROAD_HAZARDS.some((h) => h.group === g.id)) && ROAD_HAZARD_IDS[0] === 'reif' && ROAD_HAZARD_IDS[15] === 'sturz');
add('A2 Stufe 3 unmöglich für gischt, sonne, baum; staub nur Beobachtung; sonne je Richtung', ROAD_HAZARDS.find((h) => h.id === 'gischt').max === 2
  && ROAD_HAZARDS.find((h) => h.id === 'sonne').max === 2 && ROAD_HAZARDS.find((h) => h.id === 'baum').max === 2 && ROAD_HAZARDS.find((h) => h.id === 'staub').observeOnly === true
  && ROAD_HAZARDS.find((h) => h.id === 'sonne').perDirection === true);
add('A3 jede Schwelle ist eine benannte Konstante (ROAD_HZ_T je Gefahr, eingefroren)', ROAD_HAZARD_IDS.every((id) => ROAD_HZ_T[id] && Object.isFrozen(ROAD_HZ_T[id])));
add('A4 Deckelung der Prognose-Stufen = 2 (E-AW-34)', ROAD_HZ_CAP_P === 2);

// --- B: Glätte -----------------------------------------------------------------------------------------
{
  const r = run({ stations: [st({ rs: -1.4, td: -0.6, rh: 90, cond: 3 })] });
  add('B1 Reifnacht: Zustandscode Reif ⇒ reif Stufe 3, gemessen, why nennt Code und Tf', lv(r, 'reif')?.[0] === 3 && ev(r, 'reif')?.[0] === 'm' && r.entry.why.reif.some((w) => w.startsWith('code:Reif@')) && r.entry.why.reif.some((w) => w.startsWith('Tf:-1.4@')), JSON.stringify(r.entry?.why.reif));
  const r2 = run({ stations: [st({ rs: -0.5, td: 0.2, rh: 92, cond: 0 })] });
  add('B2 Tf ≤ 0 und Tf < Td ⇒ reif Stufe 2, abgeleitet', lv(r2, 'reif')?.[0] === 2 && ev(r2, 'reif')?.[0] === 'd');
  const r3 = run({ stations: [st({ rs: 0.8, td: 0.2, cond: 0 })] });
  add('B3 Tf ≤ +1 und Tf − Td ≤ 1 K ⇒ reif Stufe 1', lv(r3, 'reif')?.[0] === 1);
  const plain = { ...A8, f: { ...A8.f, bridges: [], forest: 0.1, cutting: 0 } };
  const r4 = run({ stations: [st({ rs: 1.8, td: 1.2, cond: 0 })] });
  const r4p = run({ seg: plain, stations: [st({ rs: 1.8, td: 1.2, cond: 0 })] });
  add('B4 Brücke/Schatten im Abschnitt hebt die Tf-Schwelle der Stufe 1 um 1 K (1,8 °C: A8 mit Brücken Stufe 1, ohne Merkmale keine)', segShadedOrBridged(A8) && lv(r4, 'reif')?.[0] === 1 && !segShadedOrBridged(plain) && !lv(r4p, 'reif'));
  // Persistence until Gate D: now 3 carries into the forecast hours while T2m ≤ +1 °C, evidence p.
  const r5 = run({ stations: [st({ rs: -1.4, td: -0.6, rh: 90, cond: 3 })], points: [pt((i) => ({ t2m: i <= 3 ? 0.5 : 3 }))] });
  add('B5 Fortschreibung: Stufe 3 jetzt bleibt +1…+3 h bei T2m ≤ +1 °C (Nachweis p, gedeckelt auf 2), danach Proxy', JSON.stringify(lv(r5, 'reif')) === '[3,2,2,2,0,0,0]' && ev(r5, 'reif') === 'mpppppp'.slice(0, 4) + '---', `${JSON.stringify(lv(r5, 'reif'))} ${ev(r5, 'reif')}`);
  const r6 = run({ stations: [], points: [pt({ t2m: 0.5, td2m: 0, n: 20, ff: 1 })] });
  add('B6 ohne GMA: Proxy aus dem Cube ⇒ reif Stufe 1, Nachweis p', lv(r6, 'reif')?.[0] === 1 && ev(r6, 'reif')?.[0] === 'p');
  const r7 = run({ stations: [st({ rs: 0.5, cond: 2, wf: 0.3, rsTrendKh: -0.8 })] });
  add('B7 überfrierende Nässe: Tf ≤ +1 und nass ⇒ nass Stufe 2', lv(r7, 'nass')?.[0] === 2 && ev(r7, 'nass')?.[0] === 'd');
  const r8 = run({ stations: [st({ rs: -0.2, cond: 5, wf: 0.1 })] });
  add('B8 Zustandscode Eis ⇒ nass Stufe 3 gemessen und reif Stufe 3', lv(r8, 'nass')?.[0] === 3 && ev(r8, 'nass')?.[0] === 'm' && lv(r8, 'reif')?.[0] === 3);
  const r9 = run({ stations: [st({ rs: -0.5, pt: bit(3), pr: 1.2 })] });
  add('B9 gefrierender Regen: Bit 3 „flüssig gefrierend“ ⇒ glatteis Stufe 3 gemessen', lv(r9, 'glatteis')?.[0] === 3 && ev(r9, 'glatteis')?.[0] === 'm');
  const r10 = run({ stations: [st({ rs: -0.3, pt: bit(5), pr: 0.8 })] });
  add('B10 flüssiger Niederschlag bei Tf ≤ 0 ⇒ glatteis Stufe 2 abgeleitet', lv(r10, 'glatteis')?.[0] === 2 && ev(r10, 'glatteis')?.[0] === 'd');
  const r11 = run({ stations: [st()], points: [pt((i) => ({ rr: i >= 2 ? 0.3 : 0, t2m: i >= 2 ? 0.5 : 4, t85: 2 }))] });
  add('B11 Warmfront: Niederschlag bei T2m ≤ +1 und T850 ≥ +1 ⇒ glatteis Stufe 1 ab +2 h (Prognose)', JSON.stringify(lv(r11, 'glatteis')) === '[0,0,1,1,1,1,1]' && ev(r11, 'glatteis')?.[2] === 'p', JSON.stringify(lv(r11, 'glatteis')));
  const r12 = run({ stations: [st({ rs: -0.5, cond: 4 })] });
  add('B12 Zustandscode Schnee ⇒ schnee Stufe 3 gemessen', lv(r12, 'schnee')?.[0] === 3 && ev(r12, 'schnee')?.[0] === 'm');
  const r13 = run({ stations: [st({ rs: 0.2, pt: bit(7), pr: 0.6 })] });
  add('B13 Schneefall gemessen bei Tf ≤ +1 ⇒ schnee Stufe 2', lv(r13, 'schnee')?.[0] === 2);
  const r14 = run({ stations: [st()], points: [pt((i) => ({ sl: i >= 1 ? 700 : 1500, rr: i >= 1 ? 0.5 : 0 }))] });
  add('B14 Schneefallgrenze ≤ Höhe + 200 m bei Niederschlag ⇒ schnee Stufe 1 ab +1 h', JSON.stringify(lv(r14, 'schnee')) === '[0,1,1,1,1,1,1]');
}

// --- C: Aquaplaning, Sicht, Wind ---------------------------------------------------------------------
{
  const r = run({ stations: [st({ wf: 1.2, cond: 2 })] });
  add('C1 Wasserfilm 1,2 mm ⇒ aqua Stufe 2, gischt Stufe 2, beide abgeleitet', lv(r, 'aqua')?.[0] === 2 && lv(r, 'gischt')?.[0] === 2 && ev(r, 'aqua')?.[0] === 'd');
  const r2 = run({ stations: [st()], radar: { rateNow: 27, rateH1: 6, rateH2: 0 } });
  add('C2 Radarrate 27 mm/h jetzt ⇒ aqua Stufe 3 (d), +1 h 6 mm/h ⇒ Stufe 1 (p), gischt nie über 2', lv(r2, 'aqua')?.[0] === 3 && lv(r2, 'aqua')?.[1] === 1 && ev(r2, 'aqua')?.[1] === 'p' && lv(r2, 'gischt')?.[0] === 2);
  const r3 = run({ stations: [st({ vis: 40, rh: 97, pr: 0, pt: null })] });
  add('C3 Nebelmorgen: Sicht 40 m ohne Niederschlag bei rF ≥ 95 % ⇒ nebel Stufe 3 abgeleitet', lv(r3, 'nebel')?.[0] === 3 && ev(r3, 'nebel')?.[0] === 'd');
  const r3b = run({ stations: [st({ vis: 40, rh: 97, pr: 2, pt: bit(5) })] });
  add('C3b Sicht 40 m MIT Regen ⇒ kein Nebel (Sichtminderung durch Regen fällt unter Gischt)', !lv(r3b, 'nebel')?.[0]);
  const r4 = run({ stations: [st()], points: [pt({ vis: 600 }, { mosKm: 12 })] });
  const r4b = run({ stations: [st()], points: [pt({ vis: 600 }, { mosKm: 25 })] });
  add('C4 MOSMIX-Sicht 600 m an Station ≤ 20 km ⇒ nebel Stufe 1 (p); Station 25 km ⇒ nicht', lv(r4, 'nebel')?.[0] === 1 && ev(r4, 'nebel')?.[0] === 'p' && !lv(r4b, 'nebel')?.[0]);
  // Tiefe Sonne: the boards' scenario — 15.11.2026 07:15 UTC at Irschenberg, sun ESE ≈ 125°, elevation ≈ 7°; A8 pieces bear ≈ 100–130°.
  const w = () => ({ seg: A8, slotMs: WINTER, hours: WHOURS, stations: [st({ t: WINTER, rs: -1.4, td: -0.6, rh: 90, cond: 3, wf: 0.05 })], points: [{ ...pt({ n: 20, t2m: -1 }), hours: WHOURS.map(() => hour({ n: 20, t2m: -1 })) }], radar: null, cells: [], state: null, missing: new Set(['radar', 'konrad', 'runs']) });
  const rs = evaluateSegment(w());
  const sunAt = (ms) => sunPosition(ms, A8.coords[0][1], A8.coords[0][0]);
  const expectHours = WHOURS.map((ms) => { const s = sunAt(ms); return A8.bearings.some((b) => sunInEyes(s, b)) || A8.bearings.some((b) => sunInEyes(s, (b + 180) % 360)); });
  add('C5 tiefe Sonne am 15.11. auf der A 8 Weyarn – Irschenberg: Stufe genau in den Stunden mit Sonne 0–15° und ≤ 25° neben einer Fahrtrichtung, Stufe 2 bei nasser Fahrbahn, dir gesetzt',
    !!lv(rs, 'sonne') && lv(rs, 'sonne').every((l, i) => (expectHours[i] ? l === 2 : l === 0)) && (rs.entry.dir?.sonne === 0 || rs.entry.dir?.sonne === 1) && ev(rs, 'sonne').split('').every((c, i) => (expectHours[i] ? c === 'p' : c === '-')),
    `${JSON.stringify(lv(rs, 'sonne'))} erwartet ${JSON.stringify(expectHours.map((x) => (x ? 2 : 0)))} dir ${rs.entry?.dir?.sonne}`);
  const rq = run({ stations: [st({ wg: 15, wd: (A8.bearings[0] + 90) % 360 })] });
  const rqPlain = run({ seg: { ...A8, f: { ...A8.f, bridges: [], embankment: 0, forest: 0.1 } }, stations: [st({ wg: 15, wd: (A8.bearings[0] + 90) % 360 })] });
  add('C6 Sturm quer: Böe 54 km/h senkrecht zur Achse ⇒ mit Brücken Stufe 2 (Schwellen −10 km/h), ohne Merkmale Stufe 1; 72 km/h quer mit Brücken ⇒ Stufe 3', lv(rq, 'quer')?.[0] === 2 && ev(rq, 'quer')?.[0] === 'd' && rq.entry.why.quer.includes('feature:bridge/dam/clearing') && lv(rqPlain, 'quer')?.[0] === 1 && lv(run({ stations: [st({ wg: 20, wd: (A8.bearings[0] + 90) % 360 })] }), 'quer')?.[0] === 3, JSON.stringify(rq.entry?.why.quer));
  const rq2 = run({ stations: [st({ wg: 29, wd: A8.bearings[0] })] });
  add('C7 Böe 104 km/h längs der Achse ⇒ quer Stufe 3 aus beliebiger Richtung', lv(rq2, 'quer')?.[0] === 3);
  const rb = run({ stations: [st({ wg: 22 })] });
  add('C8 Bäume: Böe 79 km/h bei Wald ≥ 30 % ⇒ baum Stufe 1; 25 m/s = 90 km/h ⇒ Stufe 2; nie 3', lv(rb, 'baum')?.[0] === 1 && lv(run({ stations: [st({ wg: 25 })] }), 'baum')?.[0] === 2 && lv(run({ stations: [st({ wg: 40 })] }), 'baum')?.[0] === 2);
  const rst = run({ seg: { ...A8, f: { ...A8.f, crop: 0.7 } }, stations: [st({ wg: 17 })], state: { dryH: 80 } });
  add('C9 Staub nur Beobachtung: Böe 61 km/h, Acker 70 %, 80 h trocken ⇒ ob.staub Stufe 1, nicht in lv', rst.entry?.ob?.staub?.[0] === 1 && !rst.entry.lv.staub);
}

// --- D: Gewitter, Hagel, Hitze, Wetterwechsel ---------------------------------------------------------
{
  const r = run({ cells: [{ id: 7, distKm: 0.4, over: true, crossMin: 0, hail: true }] });
  add('D1 Sommergewitter: KONRAD3D-Zelle über dem Abschnitt ⇒ gewitter Stufe 3 (d), Hagelkennung ⇒ hagel Stufe 2 (d)', lv(r, 'gewitter')?.[0] === 3 && ev(r, 'gewitter')?.[0] === 'd' && lv(r, 'hagel')?.[0] === 2 && ev(r, 'hagel')?.[0] === 'd');
  const r2 = run({ cells: [{ id: 8, distKm: 14, over: false, crossMin: 35, hail: false }] });
  add('D2 Zelle 14 km, Zugbahn kreuzt in 35 min ⇒ gewitter Stufe 2 jetzt und +1 h (Zugbahn), nicht +2 h', lv(r2, 'gewitter')?.[0] === 2 && lv(r2, 'gewitter')?.[1] === 2 && lv(r2, 'gewitter')?.[2] === 0, JSON.stringify(lv(r2, 'gewitter')));
  const r3 = run({ points: [pt((i) => ({ th: i >= 3 ? 55 : 10, lpi: 0, cape: 1200 }))] });
  add('D3 Gewitterpotenzial 55 ab +3 h ⇒ gewitter Stufe 1 (p); Hagel braucht thunder ≥ 60 ⇒ keine Hagel-Stufe', JSON.stringify(lv(r3, 'gewitter')) === '[0,0,0,1,1,1,1]' && !lv(r3, 'hagel')?.some((l) => l));
  const r3b = run({ points: [pt({ th: 70, cape: 1500 })] });
  add('D3b thunder 70 und CAPE 1 500 ⇒ hagel Stufe 1 (p)', lv(r3b, 'hagel')?.[0] === 1 && ev(r3b, 'hagel')?.[0] === 'p');
  const r4 = run({ stations: [st({ pt: bit(6), ta: 12 })] });
  add('D4 fester Niederschlag bei Luft ≥ +5 °C ⇒ hagel Stufe 3 („Hagel oder Graupel“, abgeleitet)', lv(r4, 'hagel')?.[0] === 3 && ev(r4, 'hagel')?.[0] === 'd');
  const concrete = { ...A8, f: { ...A8.f, concrete: 0.6 } };
  const r5 = run({ seg: concrete, points: [pt({}, { tmaxToday: 32 })], stations: [st({ taHist: [[SLOT, 28]] })] });
  add('D5 Hitze auf Beton: Tmax 32 °C laut Prognose ⇒ blowup Stufe 1 (p); zweiter Tag in Folge ⇒ Stufe 2', lv(r5, 'blowup')?.[0] === 1 && ev(r5, 'blowup')?.[0] === 'p'
    && lv(run({ seg: concrete, points: [pt({}, { tmaxToday: 32 })], state: { hotDays: [new Date(SLOT - 86_400_000).toISOString().slice(0, 10)] } }), 'blowup')?.[0] === 2);
  add('D5b ohne Betonbelag keine Hitze-Stufe und kein Eintrag (nicht „unbekannt“)', !run({ points: [pt({}, { tmaxToday: 35 })] }).entry?.lv.blowup);
  const r6 = run({ stations: [st({ rs: -0.3 })], state: null });
  add('D6 erster Frost: Tf ≤ 0 erstmals seit Saisonbeginn ⇒ frost1 Stufe 2 (d), Zustand merkt sich den Zeitpunkt; zweites Mal keine Stufe', lv(r6, 'frost1')?.[0] === 2 && r6.state.frostObsAt
    && !lv(run({ stations: [st({ rs: -0.3 })], state: r6.state }), 'frost1')?.some((l) => l));
  const r7 = run({ points: [pt((i) => ({ t2m: i >= 4 ? -0.5 : 4 }))], state: null });
  add('D7 erster Frost laut Prognose ab +4 h ⇒ frost1 Stufe 1 (p)', JSON.stringify(lv(r7, 'frost1')) === '[0,0,0,0,1,0,0]' && ev(r7, 'frost1')?.[4] === 'p', JSON.stringify(lv(r7, 'frost1')));
  add('D7b Saison: 31.07. gehört zur Vorsaison, 01.08. zur neuen', seasonOf(Date.UTC(2026, 6, 31)) === '2025' && seasonOf(Date.UTC(2026, 7, 1)) === '2026');
  const r8 = run({ stations: [st({ taHist: [[SLOT - 3 * 3_600_000, 9], [SLOT - 3_600_000, 4], [SLOT, 1]], cond: 2, wf: 0.2 })], points: [pt((i) => ({ t2m: i >= 1 ? -3 : 1 }))] });
  add('D8 Temperatursturz: 9 → −3 °C binnen 6 h mit Nulldurchgang auf nasser Fahrbahn ⇒ sturz Stufe 3 (p, gedeckelt auf 2)', lv(r8, 'sturz')?.[0] === 2 && ev(r8, 'sturz')?.[0] === 'p' && r8.entry.why.sturz.includes('zero:1'));
  const r8b = run({ stations: [st({ taHist: [[SLOT - 3 * 3_600_000, 12], [SLOT - 2 * 3_600_000, 11.5], [SLOT - 3_600_000, 4], [SLOT, 3]] })] });
  add('D8b gemessener Sturz 12 → 3 °C in 3 h ⇒ sturz Stufe 1 abgeleitet (Rate 7,5 K/h plausibel)', lv(r8b, 'sturz')?.[0] === 1 && ev(r8b, 'sturz')?.[0] === 'd');
  const r8c = run({ stations: [st({ taHist: [[SLOT - 2 * 3_600_000, 10], [SLOT - 3_600_000 - 900_000, -15], [SLOT, -16]] })] });
  add('D8c Sensorfehler −30 K in 75 min (M080 Heringen am 13.10.) ⇒ KEIN Sturz aus dieser Anlage', !lv(r8c, 'sturz')?.some((l) => l));
  const r8d = run({ stations: [st({ suspect: true, rs: -0.01, ta: -0.01 })] });
  add('D8d Anlage mit Beobachtungs-Treffer (Q290 Wolfskopf −0,01 °C, `o`) ⇒ kein erster Frost aus ihr', !lv(r8d, 'frost1')?.some((l) => l));
}

// --- E: D-04 — missing input, measurement gap, cap ----------------------------------------------------
{
  const r = run({ missing: new Set(['fc']), points: [] });
  add('E1 Prognose fehlt ⇒ Stunden +1…+6 unbekannt (null), jetzt bleibt gemessen', lv(r, 'reif') === null || (lv(r, 'nebel') ?? lv(r, 'quer') ?? []).slice(1).every((l) => l === null), JSON.stringify(r.entry?.lv));
  const rq = run({ missing: new Set(['fc']), points: [], stations: [st({ wg: 15, wd: (A8.bearings[0] + 90) % 360 })] });
  add('E1b … mit Sturm gemessen: quer jetzt Stufe 2 (d), +1…+6 h null', lv(rq, 'quer')?.[0] === 2 && lv(rq, 'quer').slice(1).every((l) => l === null));
  const r2 = run({ missing: new Set(['obs']), stations: [] });
  const noGmaSeg = { ...A8, stations: [], near: [] };
  const r2b = run({ seg: noGmaSeg, missing: new Set(['obs']), stations: [], points: [pt({ t2m: 0.5, td2m: 0, n: 20, ff: 1 })] });
  add('E2 Messung fehlt ⇒ fahrbahnabhängige Gefahren jetzt unbekannt, Prognose-Stunden aus dem Modell; ein Abschnitt ohne jede GMA rechnet jetzt wie immer aus dem Modell (p)', lv(r2, 'reif')?.[0] === null && lv(r2, 'aqua')?.[0] === null && typeof lv(r2, 'reif')?.[1] === 'number' && lv(r2b, 'reif')?.[0] === 1 && ev(r2b, 'reif')?.[0] === 'p');
  const r3 = run({ stations: [st({ rs: null, roadRejected: true, cond: null, wf: null })], points: [pt({ t2m: 0.5, td2m: 0, n: 20, ff: 1 })] });
  add('E3 Messlücke: die GMA des Abschnitts ist verworfen, keine gültige in 10 km ⇒ reif/nass/aqua jetzt unbekannt (nicht aus dem Modell aufgefüllt), why nennt gap:<id>, Prognose ab +1 h bleibt',
    measurementGap([st({ rs: null, roadRejected: true })]) && lv(r3, 'reif')?.[0] === null && lv(r3, 'nass')?.[0] === null && lv(r3, 'aqua')?.[0] === null && r3.entry.why.reif.some((w) => w.startsWith('gap:')) && typeof lv(r3, 'reif')?.[1] === 'number', JSON.stringify(r3.entry?.why.reif));
  const r3b = run({ stations: [st({ rs: null, roadRejected: true, cond: null }), st({ id: 'X999', name: 'Nachbar', inside: false, rs: 0.5, td: 0.3 })] });
  add('E3b Gegenprobe: eine gültige GMA in Reichweite hebt die Lücke auf ⇒ reif Stufe 1 aus dem Nachbarn', lv(r3b, 'reif')?.[0] === 1 && r3b.entry.why.reif.some((w) => w.endsWith('@X999')));
  const r4 = run({ radar: { rateNow: 30, rateH1: 30, rateH2: 0 }, missing: new Set(['radar']) });
  add('E4 Radar zu alt ⇒ seine Werte zählen nicht (aqua jetzt aus dem Film = 0, +1 h aus der Prognose)', !lv(r4, 'aqua')?.[0] && !lv(r4, 'aqua')?.[1]);
  const r5 = run({ radar: { rateNow: 0, rateH1: 30, rateH2: 0 } });
  add('E5 Deckelung: Radar-Nowcast 30 mm/h bei +1 h ⇒ aqua rechnerisch 3, als Prognose höchstens Stufe 2', lv(r5, 'aqua')?.[1] === 2 && ev(r5, 'aqua')?.[1] === 'p');
  const r6 = run({ stations: [], points: [pt((i) => ({ rr: 2, t2m: -1, t85: 3 }))] });
  add('E5b gefrierender Regen laut Prognose: Stufe 2 bleibt 2 (Regel und Deckel), nie 3 mit Nachweis p', lv(r6, 'glatteis')?.every((l) => l === 2) && ev(r6, 'glatteis') === 'ppppppp');
}

// --- F: sun position (three references, 0,5°) ---------------------------------------------------------
{
  const eq = sunPosition(Date.UTC(2026, 2, 20, 14, 46), 0, 0);
  const lonSub = -((14 + 46 / 60 - 12) * 15) - eq.eqTimeMin / 4;
  const sub = sunPosition(Date.UTC(2026, 2, 20, 14, 46), 0, lonSub);
  add('F1 Äquinoktium 20.03.2026 14:46 UTC: Deklination 0 ± 0,1°, Sonne im Zenit des subsolaren Punkts (90 ± 0,5°)', Math.abs(eq.declinationDeg) < 0.1 && Math.abs(sub.elevationDeg - 90) < 0.5, `${eq.declinationDeg.toFixed(3)} / ${sub.elevationDeg.toFixed(2)}`);
  const s = sunPosition(Date.UTC(2026, 5, 21, 8, 24), 48.137, 11.575);
  const noonMin = 720 - s.eqTimeMin - 11.575 * 4;
  const noon = sunPosition(Date.UTC(2026, 5, 21, 0, 0) + noonMin * 60_000, 48.137, 11.575);
  add('F2 Sommersonnenwende, München, wahrer Mittag: Höhe 90 − 48,137 + 23,44 = 65,30 ± 0,5°, Azimut 180 ± 0,5°', Math.abs(noon.elevationDeg - 65.30) < 0.5 && Math.abs(noon.azimuthDeg - 180) < 0.5, `${noon.elevationDeg.toFixed(2)} / ${noon.azimuthDeg.toFixed(2)}`);
  // Independent low-precision check (spherical formula with the computed declination and hour angle): Hamburg 21.12.2026 12:00 UTC.
  const h = sunPosition(Date.UTC(2026, 11, 21, 12, 0), 53.55, 9.99);
  const ha = ((720 + h.eqTimeMin + 9.99 * 4) / 4 - 180) * Math.PI / 180;
  const phi = 53.55 * Math.PI / 180, d = h.declinationDeg * Math.PI / 180;
  const elevRef = Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(ha)) * 180 / Math.PI;
  add('F3 Wintersonnenwende, Hamburg 12:00 UTC: Höhe gegen die unabhängige sphärische Formel ± 0,5° (Deklination −23,44 ± 0,1°)', Math.abs(h.elevationDeg - elevRef) < 0.5 && Math.abs(h.declinationDeg + 23.44) < 0.1, `${h.elevationDeg.toFixed(2)} gegen ${elevRef.toFixed(2)}`);
  add('F4 Winkelabstand: 350° zu 10° = 20°, 90° zu 270° = 180°; Sonne hinter dem Fahrer zählt nicht', bearingDiffDeg(350, 10) === 20 && bearingDiffDeg(90, 270) === 180 && !sunInEyes({ elevationDeg: 5, azimuthDeg: 100 }, 280) && sunInEyes({ elevationDeg: 5, azimuthDeg: 100 }, 120));
}

// --- G: locks, parser, summary ----------------------------------------------------------------------------
{
  const good = run({ stations: [st({ rs: -1.4, td: -0.6, rh: 90, cond: 3 })] });
  add('G1 ein regulärer Eintrag besteht die Eintrags-Sperre', roadHzEntryProblems(A8.id, good.entry, A8).length === 0, JSON.stringify(roadHzEntryProblems(A8.id, good.entry, A8)));
  const bad1 = { ...good.entry, ev: { ...good.entry.ev, reif: 'mm-----' } };
  add('G2 „gemessen“ in der Zukunft ⇒ Sperre', roadHzEntryProblems(A8.id, bad1, A8).some((p) => p.includes('gemessen in der Zukunft')));
  const bad2 = { lv: { gischt: [3, 0, 0, 0, 0, 0, 0] }, ev: { gischt: 'd------' }, why: { gischt: ['film:3@X'] } };
  add('G3 gischt Stufe 3 ⇒ Sperre; Prognose über der Deckelung ⇒ Sperre; Stufe ohne why ⇒ Sperre', roadHzEntryProblems('A8-034', bad2, A8).some((p) => p.includes('über 2'))
    && roadHzEntryProblems('A8-034', { lv: { aqua: [0, 3, 0, 0, 0, 0, 0] }, ev: { aqua: '-p-----' }, why: { aqua: ['rr:30@fc'] } }, A8).some((p) => p.includes('Deckelung'))
    && roadHzEntryProblems('A8-034', { lv: { aqua: [2, 0, 0, 0, 0, 0, 0] }, ev: { aqua: 'd------' }, why: { aqua: [] } }, A8).some((p) => p.includes('ohne why')));
  const noGma = { ...A8, stations: [], near: [] };
  add('G4 Glätte „gemessen“ ohne GMA im Abschnitt ⇒ Sperre; Aquaplaning aus dem Radar (d) ohne GMA ist erlaubt', roadHzEntryProblems('A8-034', good.entry, noGma).some((p) => p.includes('ohne GMA'))
    && roadHzEntryProblems('A8-034', { lv: { aqua: [2, 0, 0, 0, 0, 0, 0] }, ev: { aqua: 'd------' }, why: { aqua: ['rate:16@RV'] } }, noGma).length === 0);
  const hot = { lv: { blowup: [1, 1, 1, 1, 1, 1, 1] }, ev: { blowup: 'ppppppp' }, why: { blowup: ['Tmax:31@fc'] } };
  add('G5 Konsistenz: Hitze-Stufe bei T2m 12 °C ⇒ Sperre; Nebel Stufe 3 ohne Sicht < 50 m ⇒ Sperre', roadHzConsistencyProblems('A8-034', hot, [pt({ t2m: 12 })], []).length > 0
    && roadHzConsistencyProblems('A8-034', { lv: { nebel: [3, 0, 0, 0, 0, 0, 0] }, ev: { nebel: 'd------' }, why: { nebel: ['vis:120@X'] } }, [pt()], []).some((p) => p.includes('Sicht')));
  const file = { schema: 1, product: 'road-hz', slot: '2610131700', slotMs: SLOT, made: new Date(SLOT).toISOString(), hours: HOURS, inputs: { obs: '2610131700', fc: null, rv: null, konrad: null, runs: null, segments: 'x' }, missing: [], killed: false, capP: 2, seg: { [A8.id]: good.entry } };
  const parsed = parseRoadHz(JSON.parse(JSON.stringify(file)));
  add('G6 Parser: Rundweg der Datei, Eintrag mit Verstoß ⇒ Datei abgelehnt', !!parsed && parsed.seg[A8.id].lv.reif[0] === 3 && parseRoadHz({ ...file, seg: { [A8.id]: bad1 } }) === null);
  const sum = roadHzSummary({ seg: { a: good.entry, b: { lv: { quer: [0, 2, 0, 0, 0, 0, 0] }, ev: { quer: '-p-----' }, why: { quer: ['gust:95@fc'] } }, c: { lv: { aqua: [null, 0, 0, 0, 0, 0, 0] }, ev: { aqua: '-------' }, why: { aqua: ['gap:X'] } } } });
  add('G7 Zusammenfassung: Matrix Glätte jetzt 1 Abschnitt Stufe 3, Wind +1 h 1 Abschnitt Stufe 2, Aquaplaning jetzt 1 unbekannt; je Gefahr und gesamt', sum.matrix.glaette[0].n === 1 && sum.matrix.glaette[0].max === 3 && sum.matrix.wind[1].n === 1 && sum.matrix.wind[1].max === 2
    && sum.matrix.aqua[0].unknown === 1 && sum.byHazard.reif.now === 1 && sum.segments.window === 2 && sum.segments.unknown === 1, JSON.stringify(sum.segments));
  add('G8 hzEntryMax: höchste Stufe im Fenster mit Gefahr und Nachweis', hzEntryMax(good.entry).lv === 3 && hzEntryMax(good.entry).id === 'reif' && hzEntryMax(good.entry).ev === 'm');
}

// --- H: segments contract and builder pieces ------------------------------------------------------------
{
  add('H1 Fixture-Segmente bestehen den Vertrag (4 Abschnitte, Kennungen nach Muster, Stützpunkte mit Koordinaten)', segFile.segments.length === 4 && segFile.segments.every((s) => ROAD_SEGMENT_ID_RE.test(s.id) && s.coords.length === s.points.length));
  add('H2 Kennung: A8 km 34,2 ⇒ A8-034; Korridor a8-2 ⇒ A8.2-000 (Zusatz des Korridors, V-AW-47)', roadSegmentId('A8', 'a8', 34.2) === 'A8-034' && roadSegmentId('A8', 'a8-2', 0) === 'A8.2-000' && ROAD_SEGMENT_ID_RE.test('A8.2-000') && !ROAD_SEGMENT_ID_RE.test('A8-2-000'));
  add('H3 Peilung: Nord 0°, Ost 90°, Süd 180°; Stück-Peilungen im Bereich 0…359', Math.round(bearingDeg([10, 48], [10, 48.1])) === 0 && Math.round(bearingDeg([10, 48], [10.15, 48])) === 90 && Math.round(bearingDeg([10, 48.1], [10, 48])) === 180
    && stretchBearings([[10, 48], [10, 48.5]], 0, 55.6).every((b) => b >= 0 && b < 360));
  const corr = { id: 't1', road: 'T1', shields: ['T 1'], from: 'Anfang', to: 'Ende', lengthKm: 60, line: [[10, 48], [10, 48.54]], stations: [], towns: [] };
  const js = [{ km: 2, name: 'AS Nah' }, { km: 9, name: 'AS Neun' }, { km: 12, name: 'AS Zwölf' }, { km: 40, name: 'AS Vierzig' }];
  const pieces = piecesOf(corr, js);
  add('H4 Stücke: kurze Stücke (< 5 km) mit dem kürzeren Nachbarn vereint, lange (> 25 km) geteilt — hier 0–9, 9–12 vereint mit 12–40 ⇒ geteilt, 40–60',
    pieces.every((p) => p.kmTo - p.kmFrom >= 5 || pieces.length === 1) && pieces.every((p) => p.kmTo - p.kmFrom <= 25) && pieces.some((p) => p.how === 'split') && pieces[0].from === 'Anfang' && pieces[pieces.length - 1].to === 'Ende',
    pieces.map((p) => `${p.kmFrom}-${p.kmTo}:${p.how}`).join(' '));
  const ji = junctionIndex({ elements: [{ type: 'node', id: 1, lat: 48.1, lon: 10.0004, tags: { highway: 'motorway_junction', name: 'AS Test' } }, { type: 'node', id: 2, lat: 48.1, lon: 10.0012, tags: { highway: 'motorway_junction', name: 'AS Test' } }, { type: 'node', id: 3, lat: 48.1, lon: 10.02, tags: { highway: 'motorway_junction', name: 'Weit' } }] });
  const cj = corridorJunctions(corr, ji);
  add('H5 Knoten: zwei Knoten beider Fahrbahnen mit gleichem Namen ⇒ ein Knoten (km-Mittel); 1,5 km neben der Achse ⇒ keiner', cj.length === 1 && cj[0].name === 'AS Test' && Math.abs(cj[0].km - 11.1) < 0.3, JSON.stringify(cj));
  const on = kmOnLine(corr.line, [10.001, 48.27]);
  add('H6 km auf der Linie: Fußpunkt und Abstand', Math.abs(on.km - 30) < 0.2 && on.distKm < 0.1, JSON.stringify(on));
}

// --- I: derive readers and end to end on the fixture store ------------------------------------------------
{
  const m = rvPixel(11.575, 48.137);
  add('I1 RV-Pixel: München Spalte 669, Zeile 936 (polar-stereografisch, 1-km-Zellen); außerhalb ⇒ null', m && m.col === 669 && m.row === 936 && rvPixel(-20, 30) === null, JSON.stringify(m));
  const tmp = join(tmpdir(), `hz-verify-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'img', 'konrad3d', '20261013T170000'), { recursive: true });
  const seg = SEG['A8-034'];
  const cellOver = { id: 1, lon: seg.coords[0][0], lat: seg.coords[0][1], hull: [[seg.coords[0][0] - 0.05, seg.coords[0][1] - 0.05], [seg.coords[0][0] + 0.05, seg.coords[0][1] - 0.05], [seg.coords[0][0] + 0.05, seg.coords[0][1] + 0.05], [seg.coords[0][0] - 0.05, seg.coords[0][1] + 0.05]], forecast: [], hailFlag: 1 };
  const cellFar = { id: 2, lon: seg.coords[0][0] + 0.3, lat: seg.coords[0][1], hull: [], forecast: [{ leadMin: 30, lon: seg.coords[0][0] + 0.25, lat: seg.coords[0][1], minorKm: 3 }, { leadMin: 45, lon: seg.coords[0][0] + 0.01, lat: seg.coords[0][1], minorKm: 3 }], hailFlag: 0 };
  writeFileSync(join(tmp, 'img', 'konrad3d', '20261013T170000', 'cells.json'), JSON.stringify({ schema: 1, run: { refMs: SLOT, file: 'x', cells: [cellOver, cellFar] } }));
  const cells = cellsForSegments(join(tmp, 'img'), '20261013T170000', [seg]);
  const list = cells.bySeg.get(seg.id);
  add('I2 KONRAD3D: Zelle über dem Stützpunkt ⇒ over, Hagel; ferne Zelle mit Zugbahn ⇒ crossMin 45', list.length === 2 && list.find((c) => c.id === 1).over && list.find((c) => c.id === 1).hail && list.find((c) => c.id === 2).crossMin === 45 && !list.find((c) => c.id === 2).over, JSON.stringify(list));
  // Station input from the real slot: Q290 is suspect (o), M080's air was rejected (x.ta) ⇒ suspect; V164 not.
  const q290 = obs.points.find((p) => p.id === 'Q290'), m080 = obs.points.find((p) => p.id === 'M080');
  add('I3 Stationseingang: Q290 (o: jump/cube) und M080 (Luft verworfen) sind „suspect“, eine saubere Anlage nicht', q290 && m080 && stationInput(q290, null, SLOT, true).suspect && stationInput(m080, null, SLOT, true).suspect && !stationInput(realStation, null, SLOT, true).suspect);
  // End to end: the fixture store (obs, rings, segments, state), no radar/KONRAD/runs images, the fixture fc run.
  const store = join(tmp, 'store'), root = join(tmp, 'root');
  cpSync(join(FX, 'store'), store, { recursive: true });
  mkdirSync(join(root, 'road', 'fc'), { recursive: true });
  cpSync(join(FX, 'fc'), join(root, 'road', 'fc', 'v1'), { recursive: true });
  const out = join(tmp, 'out');
  const s = deriveRoadHazards({ storeDir: store, imgDir: join(tmp, 'img-none'), rootDir: root, outDir: out, stamp: '2610131700', nowMs: SLOT + 20 * 60_000 });
  const hz = parseRoadHz(readJson(join(out, 'hz', '2610131700.json')));
  const state = readJson(join(out, 'state.json'));
  add('I4 Derive Ende zu Ende: veröffentlicht, Eingänge obs + fc da, radar/konrad/runs als fehlend benannt, Datei besteht den Parser', s.publish && s.inputs.obs === '2610131700' && s.inputs.fc?.run === '2610131712' && JSON.stringify(s.missing) === '["konrad","radar","runs"]' && !!hz, JSON.stringify({ publish: s.publish, missing: s.missing, reasons: s.reasons }));
  add('I5 … Gewitter/Hagel/Aquaplaning-Radarstunden unbekannt (null), nicht 0; die Fusion des Laufs wird genannt', Object.values(hz.seg).some((e) => e.lv.gewitter?.some((l) => l === null) || e.lv.hagel?.some((l) => l === null)) && hz.inputs.fc.fusion === 'buscosun Fusion 12', JSON.stringify(Object.entries(hz.seg).map(([k, e]) => [k, Object.keys(e.lv)])));
  add('I6 … Zustand: state.json behält die Messlinie (stations) und trägt hz je Abschnitt mit Zählern', state.schema === 1 && state.stations && state.hz?.slot === '2610131700' && Object.keys(state.hz.seg).length === 4 && typeof state.hz.counts.reif === 'number');
  add('I7 … Q290 Wolfskopf (−0,01 °C, Beobachtungs-Treffer) löst in A6-276 keinen ersten Frost aus (D-8d am echten Slot)', !hz.seg['A6-276']?.lv.frost1);
  // Second run: the state carries, the derive is deterministic.
  const s2 = deriveRoadHazards({ storeDir: store, imgDir: join(tmp, 'img-none'), rootDir: root, outDir: join(tmp, 'out2'), stamp: '2610131700', nowMs: SLOT + 20 * 60_000 });
  add('I8 zweimal gerechnet ⇒ gleiche Datei (bis auf `made`)', JSON.stringify({ ...readJson(join(out, 'hz', '2610131700.json')), made: 0 }) === JSON.stringify({ ...readJson(join(tmp, 'out2', 'hz', '2610131700.json')), made: 0 }) && s2.publish);
  // The mirror keeps the repo's segments.json across copyInto (like corridors.json) and prunes hz/ like obs/.
  const mroot = join(tmp, 'clone'), mirror = join(tmp, 'mirror');
  mkdirSync(join(mroot, 'road', 'v1', 'static'), { recursive: true });
  cpSync(join(FX, 'store', 'static', 'segments.json'), join(mroot, 'road', 'v1', 'static', 'segments.json'));
  const rm = createRoadMirror({ appDir: join(HERE, '..'), mirrorDir: mirror, log: () => {}, now: () => SLOT });
  rm.seed(mroot);
  rm.copyInto(mroot);
  add('I9 Spiegel: static/segments.json des Repos überlebt copyInto (wie corridors.json), Status trägt den hz-Block', existsSync(join(mroot, 'road', 'v1', 'static', 'segments.json')) && rm.status.hz && 'lastPublishedSlot' in rm.status.hz);
  rmSync(tmp, { recursive: true, force: true });
}

// --- J: golden texts ---------------------------------------------------------------------------------------
{
  const ctx = { stationName: (id) => obs.points.find((p) => p.id === id)?.n ?? (id === 'X999' ? 'Nachbar' : null), hm: (ms) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)), slotMs: SLOT, hours: HOURS, fusion: 'buscosun Fusion 12' };
  const scenarios = {
    reifnacht: run({ stations: [st({ rs: -1.4, td: -0.6, rh: 90, cond: 3 })], points: [pt((i) => ({ t2m: i <= 3 ? 0.5 : 3, n: 20 }))] }),
    warmfront: run({ stations: [st({ rs: -0.5, pt: bit(3), pr: 1.2 })], points: [pt({ rr: 2, t2m: -1, t85: 3 })] }),
    nebelmorgen: run({ stations: [st({ vis: 40, rh: 97 })] }),
    sturm_talbruecke: run({ stations: [st({ wg: 20, wd: (A8.bearings[0] + 90) % 360 })] }),
    sommergewitter: run({ cells: [{ id: 7, distKm: 0.4, over: true, crossMin: 0, hail: true }], radar: { rateNow: 28, rateH1: 0, rateH2: 0 } }),
    hitze_beton: run({ seg: { ...A8, f: { ...A8.f, concrete: 0.6 } }, points: [pt({}, { tmaxToday: 32 })] }),
    erster_frost: run({ stations: [st({ rs: -0.3 })] }),
    tiefe_sonne: evaluateSegment({ seg: A8, slotMs: WINTER, hours: WHOURS, stations: [st({ t: WINTER, rs: 0.5, cond: 2, wf: 0.1 })], points: [{ ...pt({ n: 10, t2m: 0.3 }), hours: WHOURS.map(() => hour({ n: 10, t2m: 0.3 })) }], radar: null, cells: [], state: null, missing: new Set(['radar', 'konrad', 'runs']) }),
    messluecke: run({ stations: [st({ rs: null, roadRejected: true, cond: null, wf: null })], points: [pt({ t2m: 0.5, td2m: 0, n: 20, ff: 1 })] }),
    aquaplaning: run({ stations: [st({ wf: 1.2, cond: 2 })] }),
    schnee: run({ stations: [st({ rs: -0.5, cond: 4 })], points: [pt({ sl: 500, rr: 0.8, t2m: -1 })] }),
    temperatursturz: run({ stations: [st({ taHist: [[SLOT - 3 * 3_600_000, 9], [SLOT - 3_600_000, 4], [SLOT, 1]], cond: 2, wf: 0.2 })], points: [pt((i) => ({ t2m: i >= 1 ? -3 : 1 }))] }),
  };
  mkdirSync(GOLDEN, { recursive: true });
  for (const [name, r] of Object.entries(scenarios)) {
    const c = name === 'tiefe_sonne' ? { ...ctx, slotMs: WINTER, hours: WHOURS } : ctx;
    const text = narrativeText(roadNarrative(A8, r.entry, c));
    const file = join(GOLDEN, `${name}.txt`);
    if (WRITE_GOLDEN) writeFileSync(file, text + '\n');
    const golden = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r?\n$/, '') : null;
    const banned = ROAD_NARRATIVE_BANNED.filter((re) => re.test(text)).map(String);
    const SRC = /meldet|misst|messen|laut|Laut|Prognose|berechnet|OpenStreetMap|WorldCover|Höhenmodell|Radar|KONRAD3D|MOSMIX|ICON-D2|Glättemeldeanlage|Sonnenstand|StVO/;
    const numbersWithoutSource = text.split(/(?<=\.)\s+/).some((sentence) => /\d+(,\d+)? (°C|km\/h|mm|m|K|%)\b/.test(sentence) && !SRC.test(sentence));
    add(`J ${name}: goldener Text gleich, keine verbotenen Wörter, jede Zahl mit Quelle (${text.length} Zeichen)`, golden !== null && golden === text && banned.length === 0 && !numbersWithoutSource && text.length > 40,
      banned.length ? `verboten: ${banned.join(' ')}` : golden === null ? 'kein goldener Text (--write-golden)' : golden !== text ? `weicht ab: ${text.slice(0, 160)}` : numbersWithoutSource ? 'Zahl ohne Quelle' : undefined);
  }
  const t = narrativeText(roadNarrative(A8, scenarios.reifnacht.entry, ctx));
  add('J0 Reifnacht nennt Anlage, Uhrzeit, Zustand, Fahrbahn- und Taupunkttemperatur, Brücke ohne Messung und den Ausblick „laut Prognose“ mit Deckelungshinweis',
    /Auf der Fahrbahn liegt Reif\. Die Glättemeldeanlage .+ meldet um \d\d:\d\d den Zustand „Reif“ bei −1,4 °C/.test(t) && /Taupunkt liegt mit −0,6 °C darüber/.test(t) && /Brücke|Brücken/.test(t) && /Laut Prognose von buscosun Fusion 12/.test(t) && /auf Stufe 2 begrenzt/.test(t), t.slice(0, 300));
  const u = narrativeText(roadNarrative(A8, scenarios.messluecke.entry, ctx));
  add('J1 Messlücke: der Text sagt „unbekannt“, nennt den Grund und „keine Entwarnung“', /unbekannt/.test(u) && /verworfen/.test(u) && /keine Entwarnung/.test(u), u.slice(0, 200));
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:road-hazards — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
