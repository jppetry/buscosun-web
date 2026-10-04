/**
 * verify:road-contract — Phase AW (audit/autobahnwetter.md §3): every rule of `src/road/roadContract.ts` against good
 * and bad cases, plus the client checks. The fixtures carry the real data form: a station decoded from the frozen slot
 * (03.10.2026 08:00 UTC) is copied and only the value under test is changed.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-contract.mjs
 *
 * Cases from the plan: −75,00 °C, hanging sensor, thaw plateau, jump, future time, unknown code, duplicate station,
 * slot below baseline; plus E-AW-7 (catalogue observe), E-AW-11 (stateNoTemp, iceWarm), DWD flags, limits, classes,
 * client freshness/flag/round trip.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeSwisFile } from '../src/road/swisBufr.ts';
import {
  validateRoadSlot, parseRoadObs, parseRoadH24, roadObsRoundTripOk, roadFreshness, roadExpectedSlot, roadFlagFrom,
  roadStamp, roadStampToMs, normaliseRoad, ROAD_GROUPS, ROAD_SLOT_MS, ROAD_STUCK_RUN, ROAD_RULES, ROAD_OBS_GATE_MS,
  ROAD_STALE_MS, ROAD_RAW_BASE, ROAD_CDN_BASE, ROAD_REPO_DIR, ROAD_STATUS_PATH, ROAD_LIVE,
} from '../src/road/roadContract.ts';
import { ROAD_HEALTH } from './health-manifests.mjs';
import { classifySensor, mostSevereCondition } from '../src/road/roadClasses.ts';
import { makeInDE } from './road/deMask.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SLOT = join(HERE, 'lib', 'fixtures', 'road', 'swis-2610030800');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const inDE = makeInDE();
const T0 = Date.UTC(2026, 9, 3, 8, 0);

// A real station: V164 Eschenlohe (FN-BY, A95), decoded from the fixture, as the derive hands it to the rules.
const recs = decodeSwisFile(new Uint8Array(readFileSync(join(SLOT, 'FN-BY.bin')))).records;
const base = recs.find((r) => r.id === 'V164');
const raw = (over = {}) => ({
  id: base.id, group: 'FN-BY', name: base.name, highway: base.highway, km: base.km, lat: base.lat, lon: base.lon,
  elevM: base.elevM, obsMs: T0, airT: 5, dewT: 2, rh: 80, visM: 5000,
  sensors: [{ roadT: 3.5, filmMm: 0, cond: 0 }], windMs: 3, gustMs: 6, windDir: 200,
  precipType: 0, precipRateMmH: 0, precipMm: 0, quality: 0, ...over,
});
const allGroupsOk = () => Object.fromEntries(ROAD_GROUPS.filter((g) => !g.sporadic).map((g) => [g.id, { state: 'ok', ageMin: 0, stations: 1 }]));
const catalog = { V164: { road: 'A95S', dir: 'S', lat: base.lat, lon: base.lon } };
const run = (stations, extra = {}) => validateRoadSlot({
  slotMs: T0, stations, catalog, catalogEtag: 'x', catalogState: 'ok', prev: null, inDE, groups: allGroupsOk(), createdAt: '2026-10-03T08:04:00Z', ...extra,
});
const pt = (res, id = 'V164') => res.obs.points.find((p) => p.id === id);
const q = (res, rule, field) => res.quarantine.entries.filter((e) => e.rule === rule && (!field || e.field === field));

add('A0 Fixture-Station V164 aus dem echten Slot (FN-BY, A95)', base && base.highway === 'A095S', base?.highway);

// --- B: value rules -----------------------------------------------------------------------------
{
  const ok = run([raw()]);
  add('B0 Gutfall: Punkt veröffentlicht, nichts verworfen, Klasse trocken, Herkunft ok', pt(ok) && ok.balance.rejected === 0 && pt(ok).cls === 'dry' && pt(ok).q === 'ok', JSON.stringify(pt(ok)?.x ?? {}));
  const ph = run([raw({ sensors: [{ roadT: -75, filmMm: 0, cond: 0 }] })]);
  add('B1 −75,00 °C ⇒ placeholder, Zustand/Film ⇒ stateNoTemp (E-AW-11), Klasse „keine gültige Messung"',
    q(ph, 'placeholder', 'rs').length === 1 && q(ph, 'stateNoTemp').length === 2 && pt(ph).cls === 'nodata' && pt(ph).x.rs === 'placeholder');
  const lim = run([raw({ airT: 51, rh: 101, windMs: 70, gustMs: 80, sensors: [{ roadT: 80, filmMm: 12, cond: 0 }] })]);
  add('B2 Grenzen: Luft 51 °C, Feuchte 101 %, Wind 70 m/s, Böe 80, Fahrbahn 80 °C, Film 12 mm ⇒ alle verworfen',
    ['ta', 'rh', 'ws', 'wg', 'rs'].every((f) => q(lim, 'limit', f).length === 1) && pt(lim).ta === null && pt(lim).rs === null);
  const dew = run([raw({ airT: 4, dewT: 4.6 })]);
  add('B3 Taupunkt > Luft + 0,5 K ⇒ Taupunkt verworfen, Luft bleibt', q(dew, 'dewAboveAir', 'td').length === 1 && pt(dew).td === null && pt(dew).ta === 4);
  const dewOk = run([raw({ airT: 4, dewT: 4.5 })]);
  add('B4 Grenzfall Taupunkt = Luft + 0,5 K bleibt', q(dewOk, 'dewAboveAir').length === 0 && pt(dewOk).td === 4.5);
  const gust = run([raw({ windMs: 8, gustMs: 7.9 })]);
  add('B5 Böe < Mittelwind ⇒ Böe verworfen', q(gust, 'gustBelowWind', 'wg').length === 1 && pt(gust).wg === null);
  const b7 = 2 ** (30 - 7);
  const sus = run([raw({ quality: b7 })]);
  add('B6 DWD-Bit 7 (ground temperature suspect) ⇒ Fahrbahn verworfen, Zustand folgt (stateNoTemp)', q(sus, 'dwdSuspect', 'rs').length === 1 && pt(sus).rs === null && pt(sus).cls === 'nodata');
  const b1 = run([raw({ quality: 2 ** 29 })]);
  add('B7 DWD-Bit 1 (keine automatische Prüfung) ⇒ Herkunft unchecked, nichts verworfen', pt(b1).q === 'unchecked' && b1.balance.rejected === 0);
  const by = run([raw({ quality: 2 ** 19 + 2 ** 13 + 2 ** 2 })]);
  add('B8 FN-BY-Muster Bits 11+17+28 ⇒ Zustand bleibt (17 ≠ Fahrbahnzustand), Herkunft unchecked', pt(by).cond === 0 && pt(by).q === 'unchecked' && by.balance.rejected === 0);
  const unk = run([raw({ sensors: [{ roadT: 3.5, filmMm: 0, cond: 9 }] })]);
  add('B9 unbekannter Zustandscode 9 ⇒ Kennzeichen, Zustand unbekannt, NIE trocken', pt(unk).cond === null && pt(unk).cls === 'unknown' && pt(unk).f.includes('unknownCode'));
  const iceW = run([raw({ sensors: [{ roadT: 8, filmMm: 0, cond: 5 }] })]);
  add('B10 E-AW-11 iceWarm: Code 5 (Eis) bei Fahrbahn +8 °C ⇒ Zustand verworfen, nicht „Glätte"', q(iceW, 'iceWarm', 'cond').length === 1 && pt(iceW).cls !== 'ice');
  const iceOk = run([raw({ airT: 0.5, dewT: -1, sensors: [{ roadT: -1, filmMm: 0, cond: 5 }] })]);
  add('B11 Gegenprobe: Eis bei Fahrbahn −1 °C ⇒ „Glätte gemessen"', pt(iceOk).cls === 'ice' && q(iceOk, 'iceWarm').length === 0);
  const iceEdge = run([raw({ airT: 4, dewT: 1, sensors: [{ roadT: 3, filmMm: 0, cond: 6 }] })]);
  add('B12 Grenzfall Glätte-Code bei genau +3 °C bleibt', pt(iceEdge).cls === 'ice');
  const noT = run([raw({ airT: 15, sensors: [{ roadT: null, filmMm: 0.2, cond: 6 }] })]);
  add('B13 E-AW-11 stateNoTemp: Glätte-Code und Film ohne Fahrbahntemperatur ⇒ verworfen', q(noT, 'stateNoTemp').length === 2 && pt(noT).cls === 'nodata');
}

// --- C: hanging sensor, plateau, jump (state across slots) --------------------------------------
{
  const series = (n, mk, extra = {}) => {
    let prev = null, res = null;
    for (let i = 0; i < n; i++) {
      res = validateRoadSlot({ slotMs: T0 + i * ROAD_SLOT_MS, stations: [{ ...raw(mk(i)), obsMs: T0 + i * ROAD_SLOT_MS }], catalog, catalogEtag: 'x', catalogState: 'ok', prev, inDE, groups: allGroupsOk(), ...extra });
      prev = res.state;
    }
    return res;
  };
  const r23 = series(ROAD_STUCK_RUN - 1, () => ({ airT: 10, sensors: [{ roadT: 1.23, filmMm: 0, cond: 0 }] }));
  const r24 = series(ROAD_STUCK_RUN, () => ({ airT: 10, sensors: [{ roadT: 1.23, filmMm: 0, cond: 0 }] }));
  add('C1 hängender Sensor: 23 gleiche Werte bleiben, der 24. wird verworfen', q(r23, 'stuck').length === 0 && q(r24, 'stuck', 'rs').length === 1 && pt(r24).rs === null);
  const plateau = series(30, () => ({ airT: 0.4, dewT: -0.5, sensors: [{ roadT: -2, filmMm: 0.3, cond: 2 }] }));
  add('C2 Tauplateau: Fahrbahn −2,00 °C 30 Slots bei Luft +0,4 °C bleibt (Salzlake)', q(plateau, 'stuck', 'rs').length === 0 && pt(plateau).rs === -2);
  const twoSensors = series(ROAD_STUCK_RUN, (i) => ({ airT: 15, sensors: [{ roadT: 10 + i * 0.1, filmMm: 0, cond: 0 }, { roadT: -0.01, filmMm: 0, cond: 0 }] }));
  add('C3 je Sensor: zweiter Sensor hängt bei −0,01 °C (K677), erster bewegt sich ⇒ nur der zweite verworfen',
    q(twoSensors, 'stuck', 'rs').length === 1 && pt(twoSensors).rs > 10);
  // 37 slots, every 4th value missing ⇒ 28 values of −30,00 °C; the last slot carries a value.
  const gaps = series(37, (i) => ({ airT: 16, sensors: [{ roadT: i % 4 === 3 ? null : -30, filmMm: 0, cond: 0 }] }));
  add('C4 Lücken ≤ 1 h zählen neutral (H267: −30,00 °C im Wechsel mit „fehlt") ⇒ verworfen', q(gaps, 'stuck', 'rs').length === 1);
  const longGap = series(37, (i) => ({ airT: 16, sensors: [{ roadT: i >= 18 && i < 24 ? null : -30, filmMm: 0, cond: 0 }] }));
  add('C4b Gegenprobe: eine Lücke > 1 h setzt die Zählung zurück', q(longGap, 'stuck', 'rs').length === 0);
  const air = series(ROAD_STUCK_RUN, () => ({ airT: 12.34, sensors: [{ roadT: 5 + Math.random(), filmMm: 0, cond: 0 }] }));
  add('C5 hängende Lufttemperatur ⇒ verworfen', q(air, 'stuck', 'ta').length === 1 && pt(air).ta === null);
  let prev = run([raw({ sensors: [{ roadT: 1, filmMm: 0, cond: 0 }] })]).state;
  const jump = validateRoadSlot({ slotMs: T0 + ROAD_SLOT_MS, stations: [{ ...raw({ sensors: [{ roadT: 12, filmMm: 0, cond: 0 }] }), obsMs: T0 + ROAD_SLOT_MS }], catalog, catalogEtag: 'x', catalogState: 'ok', prev, inDE, groups: allGroupsOk() });
  add('C6 Sprung 1 → 12 °C: nur „wäre verworfen" (Beobachtung), Wert bleibt', jump.quarantine.entries.some((e) => e.rule === 'jump' && e.observe) && pt(jump).rs === 12 && jump.balance.observe.jump === 1 && !jump.balance.byRule.jump);
  prev = run([raw({ sensors: [{ roadT: 1, filmMm: 0, cond: 0 }] })]).state;
  const small = validateRoadSlot({ slotMs: T0 + ROAD_SLOT_MS, stations: [{ ...raw({ sensors: [{ roadT: 5, filmMm: 0, cond: 0 }] }), obsMs: T0 + ROAD_SLOT_MS }], catalog, catalogEtag: 'x', catalogState: 'ok', prev, inDE, groups: allGroupsOk() });
  add('C7 Gegenprobe: Sprung 4 K bleibt unauffällig', !small.quarantine.entries.some((e) => e.rule === 'jump'));
}

// --- D: station rules ---------------------------------------------------------------------------
{
  const fut = run([raw({ obsMs: T0 + 6 * 60_000 })]);
  add('D1 Messzeit Slot + 6 min (Zukunft) ⇒ Station verworfen', q(fut, 'time').length === 1 && !pt(fut));
  const futOk = run([raw({ obsMs: T0 + 5 * 60_000 })]);
  add('D2 Grenzfall Slot + 5 min bleibt', !!pt(futOk));
  const old = run([raw({ obsMs: T0 - 3 * 3_600_000 - 60_000 })]);
  add('D3 Messzeit älter als 3 h ⇒ Station verworfen', q(old, 'time').length === 1 && !pt(old));
  const out = run([raw({ lon: 0 })]);
  add('D4 Länge 0 (P758) ⇒ outsideDE, Station verworfen', q(out, 'outsideDE').length === 1 && !pt(out));
  const salzburg = run([raw({ lat: 47.81, lon: 13.05 })]);
  add('D5 Koordinate in Salzburg ⇒ outsideDE', q(salzburg, 'outsideDE').length === 1);
  const border = ['P978', 'P977', 'P993'].map((id) => recs.find((r) => r.id === id));
  add('D6 Grenzanlagen Kiefersfelden Brücke, Oberaudorf, Piding (echte Bulletin-Koordinaten) bleiben',
    border.every((b) => b && pt(run([raw({ lat: b.lat, lon: b.lon })]))), border.map((b) => `${b?.id} ${b?.lat},${b?.lon}`).join(' · '));
  const nocat = run([{ ...raw(), id: 'X999' }]);
  add('D7 E-AW-7: keine Katalogzeile ⇒ nur beobachtet + Kennzeichen noCatalog, Punkt bleibt',
    nocat.obs.points.some((p) => p.id === 'X999' && p.f.includes('noCatalog')) && nocat.balance.observe.catalog === 1 && !nocat.balance.byRule.catalog);
  const dup = run([raw({ group: 'FN-BY', obsMs: T0 - 15 * 60_000, airT: 1 }), raw({ group: 'FN-NB', airT: 2 })]);
  add('D8 Doppelstation in zwei Reihen ⇒ ein Punkt, die jüngere Messung zählt, Kennzeichen duplicate',
    dup.obs.points.length === 1 && pt(dup).ta === 2 && pt(dup).g === 'FN-NB' && pt(dup).f.includes('duplicate'));
  const spread = run([raw({ sensors: [{ roadT: -1.4, filmMm: 0, cond: 1 }, { roadT: 4.0, filmMm: 0, cond: 0 }] })]);
  add('D9 Sensoren 5,4 K uneinig ⇒ Kennzeichen spread, kältester Wert, Spanne im Punkt',
    pt(spread).rs === -1.4 && pt(spread).rsHi === 4 && pt(spread).f.includes('spread') && pt(spread).ns === 2);
  const roads = [];
  const mk = (id, dLat, rs) => ({ ...raw({ sensors: [{ roadT: rs, filmMm: 0, cond: 0 }] }), id, lat: base.lat + dLat, elevM: base.elevM });
  roads.push(mk('N1', 0.02, 4), mk('N2', 0.04, 4.2), mk('N3', -0.03, 3.9), mk('N4', 0.05, 4.1), mk('V164', 0, 19));
  const nb = run(roads);
  add('D10 Nachbarn: 19 °C gegen Median 4 °C ⇒ „wäre verworfen" (Beobachtung), Wert bleibt',
    nb.quarantine.entries.some((e) => e.rule === 'neighbours' && e.id === 'V164' && e.observe) && pt(nb).rs === 19);
  const cube = run([raw({ airT: 20 })], { cubeT2m: { V164: 5 } });
  add('D11 Cube-Abgleich: Luft 20 °C gegen T2m 5 °C ⇒ „wäre verworfen" (Beobachtung)', cube.balance.observe.cube === 1 && pt(cube).ta === 20);
  const ra = run([raw({ airT: 18, sensors: [{ roadT: 0, filmMm: 0, cond: 0 }] })]);
  add('D12 Fahrbahn 18 K unter der eigenen Luft ⇒ roadAir „wäre verworfen" (V-AW-3)', ra.balance.observe.roadAir === 1 && pt(ra).rs === 0);
}

// --- E: slot lock -------------------------------------------------------------------------------
{
  const groups = allGroupsOk();
  Object.keys(groups).slice(0, 4).forEach((k) => { groups[k] = { state: 'missing', ageMin: null, stations: 0 }; });
  const below = run([raw()], { groups });
  add('E1 19 von 23 Reihen aktiv (Basis 23 − Toleranz 3 = 20) ⇒ Slot gesperrt (slotGroups)', !below.gate.publish && below.gate.reasons.some((r) => r.rule === 'slotGroups'));
  const g20 = allGroupsOk();
  Object.keys(g20).slice(0, 3).forEach((k) => { g20[k] = { state: 'missing', ageMin: null, stations: 0 }; });
  add('E2 20 von 23 Reihen aktiv ⇒ veröffentlicht', run([raw()], { groups: g20 }).gate.publish);
  // 13 delivered values per station; a broken road sensor costs 3 (road, film, state) ⇒ 18 of 20 ⇒ 54 / 260 > 10 %.
  const many = Array.from({ length: 20 }, (_, i) => ({ ...raw(), id: `S${i}`, sensors: [{ roadT: i < 18 ? -75 : 3, filmMm: 0, cond: 0 }] }));
  const share = run(many);
  add('E3 > 10 % der Werte verworfen ⇒ Slot gesperrt (slotShare)', !share.gate.publish && share.gate.reasons.some((r) => r.rule === 'slotShare'), `${(share.balance.share * 100).toFixed(1)} %`);
  const fine = run(Array.from({ length: 20 }, (_, i) => ({ ...raw(), id: `S${i}`, sensors: [{ roadT: i < 1 ? -75 : 3, filmMm: 0, cond: 0 }] })));
  add('E4 Gegenprobe: 1 von 20 Platzhaltern ⇒ veröffentlicht', fine.gate.publish, `${(fine.balance.share * 100).toFixed(1)} %`);
  const killed = run([raw()], { killed: true });
  add('E5 Kill-Switch ⇒ Slot ohne Punkte, killed: true', killed.obs.killed === true && killed.obs.points.length === 0);
  add('E6 Bilanz zählt verworfene Werte je Regel und je Reihe', share.balance.byRule.placeholder === 18 && share.balance.byRule.stateNoTemp === 36 && share.balance.byGroup['FN-BY'].rejected === 54, JSON.stringify(share.balance.byRule));
  add('E7 statistische Regeln stehen im Beobachtungsmodus, harte sind hart',
    ['jump', 'neighbours', 'cube', 'catalog', 'roadAir'].every((r) => ROAD_RULES[r].mode === 'observe')
    && ['limit', 'placeholder', 'dewAboveAir', 'gustBelowWind', 'dwdSuspect', 'stuck', 'stateNoTemp', 'iceWarm', 'time', 'outsideDE'].every((r) => ROAD_RULES[r].mode === 'hard'));
}

// --- F: classes and client ----------------------------------------------------------------------
{
  add('F1 Frostgefahr: Fahrbahn +0,5 °C nass', classifySensor({ roadT: 0.5, dewT: -1, filmMm: 0.2, cond: 2 }) === 'frost');
  add('F2 Frostgefahr: Fahrbahn −0,5 °C unter Taupunkt −0,2 °C, trocken gemeldet', classifySensor({ roadT: -0.5, dewT: -0.2, filmMm: 0, cond: 0 }) === 'frost');
  add('F3 E-AW-9: Fahrbahn +10 °C unter Taupunkt +11 °C ist kein Frost', classifySensor({ roadT: 10, dewT: 11, filmMm: 0, cond: 0 }) !== 'frost');
  add('F4 Nass ab Wasserfilm > 0 oder Code 1/2/7', classifySensor({ roadT: 5, dewT: 1, filmMm: 0.1, cond: 0 }) === 'wet' && classifySensor({ roadT: 5, dewT: 1, filmMm: 0, cond: 7 }) === 'wet');
  add('F5 fehlender Code ⇒ unbekannt, nie trocken', classifySensor({ roadT: 5, dewT: 1, filmMm: 0, cond: null }) === 'unknown');
  add('F6 schwerster Code: Eis vor nass vor trocken', mostSevereCondition([0, 2, 5]) === 5 && mostSevereCondition([0, 1]) === 1 && mostSevereCondition([null, 9]) === null);
  const res = run([raw(), { ...raw({ sensors: [{ roadT: -75, filmMm: 0, cond: 0 }] }), id: 'X1' }]);
  add('F7 Rundlauf: veröffentlichte Datei besteht den Client-Prüfer vollständig', roadObsRoundTripOk(res.obs));
  const tampered = JSON.parse(JSON.stringify(res.obs));
  tampered.points[0].cls = 'dry'; tampered.points[0].cond = 5;
  const back = parseRoadObs(tampered);
  add('F8 Client: Klasse passt nicht zu den Werten ⇒ Punkt verworfen (dropped)', back && back.dropped === 1);
  const badLimit = JSON.parse(JSON.stringify(res.obs)); badLimit.points[0].rs = -75; badLimit.points[0].cls = 'nodata';
  add('F9 Client: −75 °C im Bestand ⇒ Punkt verworfen', parseRoadObs(badLimit).dropped >= 1);
  add('F10 Client: fremdes Schema ⇒ null (keine Daten statt halb vertraut)', parseRoadObs({ ...res.obs, schema: 2 }) === null && parseRoadObs({ ...res.obs, slotMs: 1 }) === null);
  const slot = roadStampToMs('2610030800');
  add('F11 Frische: 44 min live, 46 min veraltet, > 3 h tot, Kill-Switch tot',
    roadFreshness(slot, slot + 44 * 60_000) === 'live' && roadFreshness(slot, slot + 46 * 60_000) === 'stale' && roadFreshness(slot, slot + 3 * 3_600_000 + 1) === 'dead' && roadFreshness(slot, slot + 60_000, true) === 'dead');
  add('F12 Zeit-Gate: um 08:09 gilt Slot 07:45, um 08:10 Slot 08:00', roadStamp(roadExpectedSlot(slot + 9 * 60_000)) === '2610030745' && roadStamp(roadExpectedSlot(slot + ROAD_OBS_GATE_MS)) === '2610030800');
  add('F13 Stempel: Rundweg und Ablehnung fremder Formen', roadStamp(roadStampToMs('2610030815')) === '2610030815' && Number.isNaN(roadStampToMs('2613030800')) && Number.isNaN(roadStampToMs('261003081')));
  add('F14 Flag ?road: Voreinstellung = ROAD_LIVE, ?road=1 an, ?road=0 schlägt localStorage und ROAD_LIVE',
    roadFlagFrom('', null, false) === false && roadFlagFrom('', null, true) === true && roadFlagFrom('?road=1', null, false) === true
    && roadFlagFrom('?road=0', '1', true) === false && roadFlagFrom('', '0', true) === false && roadFlagFrom('', '1', false) === true);
  add('F14b ROAD_LIVE an (Jan 03.10.: „ja") — ohne Parameter sichtbar', ROAD_LIVE === true && roadFlagFrom('', null) === true);
  add('F15 Straßennamen: A008 → A8, A095S → A95 (S), B017N → B17 (N), BAB 3 → A3',
    normaliseRoad('A008').road === 'A8' && normaliseRoad('A095S').road === 'A95' && normaliseRoad('A095S').dir === 'S' && normaliseRoad('B017N').road === 'B17' && normaliseRoad('BAB 3').road === 'A3');
  const h24 = { schema: 1, product: 'road-h24', group: 'FN-BY', slot: '2610030800', slots: ['2610030745', '2610030800'], stations: { V164: { rs: [1.2, null], ta: [3, 3.1], td: [1, 1] } } };
  add('F16 h24-Prüfer: gültig ⇒ Datei, Längen ungleich ⇒ null', !!parseRoadH24(h24) && parseRoadH24({ ...h24, stations: { V164: { rs: [1], ta: [3, 3], td: [1, 1] } } }) === null);
  // The health watcher is plain JS and carries its own copy of the limit and the paths (scripts/health-manifests.mjs).
  add('F17 Betriebs-Wächter: Grenze gleich ROAD_STALE_MS, Status- und CDN-Pfad gleich dem Vertrag',
    ROAD_HEALTH.staleMin * 60_000 === ROAD_STALE_MS && ROAD_HEALTH.cdnBase === ROAD_CDN_BASE
      && ROAD_HEALTH.statusUrl === `${ROAD_RAW_BASE}/${ROAD_STATUS_PATH}` && ROAD_RAW_BASE.endsWith(`/main/${ROAD_REPO_DIR}`),
    `${ROAD_HEALTH.staleMin} min · ${ROAD_HEALTH.statusUrl} · ${ROAD_HEALTH.cdnBase}`);
}

// --- K: corridor builder — no junction loops in the axis (review finding #4) ----------------------------
{
  const { removeLoops } = await import('./road/build-corridors.mjs');
  const kmLen = (c) => { let s = 0; for (let i = 1; i < c.length; i++) { const kx = 111.2 * Math.cos(((c[i][1] + c[i - 1][1]) / 2) * Math.PI / 180); s += Math.hypot((c[i][0] - c[i - 1][0]) * kx, (c[i][1] - c[i - 1][1]) * 111.2); } return s; };
  const LAT = 48, dLon = 0.01 / (111.2 * Math.cos(LAT * Math.PI / 180));   // 10 m east
  const straight = Array.from({ length: 401 }, (_, i) => [11 + i * dLon, LAT]);   // 4 km, 10 m spacing
  // A cloverleaf: leaves the axis at 2 km, turns a circle of ≈ 160 m radius (≈ 1 km) and rejoins at the same place.
  const loop = [];
  for (let k = 1; k < 64; k++) { const a = (k / 64) * 2 * Math.PI; loop.push([11 + 200 * dLon + Math.sin(a) * 16 * dLon, LAT + (1 - Math.cos(a)) * 0.16 / 111.2]); }
  const withLoop = [...straight.slice(0, 201), ...loop, ...straight.slice(200)];
  const out1 = removeLoops(withLoop);
  add('K1 Kleeblatt-Schleife (≈ 1 km) wird aus der Achse geschnitten — Länge wieder ≈ 4 km', Math.abs(kmLen(out1) - 4) < 0.05 && kmLen(withLoop) > 4.9, `${kmLen(withLoop).toFixed(2)} → ${kmLen(out1).toFixed(2)} km`);
  add('K2 dichte gerade Achse (10 m Abstand) bleibt unverändert', removeLoops(straight).length === straight.length);
  // U-turn onto the other carriageway 30 m north (chaining joined both directions at the end).
  const back = Array.from({ length: 101 }, (_, i) => [11 + (400 - i * 2) * dLon, LAT + 0.03 / 111.2]);
  const out3 = removeLoops([...straight, ...back]);
  add('K3 Wendung auf die Gegenfahrbahn (30 m daneben) wird abgeschnitten', Math.abs(kmLen(out3) - 4) < 0.1, `${kmLen([...straight, ...back]).toFixed(2)} → ${kmLen(out3).toFixed(2)} km`);
  // A 100-m spur out and back (ramp stub) at 1 km.
  const spur = [...Array.from({ length: 10 }, (_, i) => [11 + 100 * dLon, LAT + ((i + 1) * 0.01) / 111.2]), ...Array.from({ length: 9 }, (_, i) => [11 + 100 * dLon, LAT + ((9 - i) * 0.01) / 111.2])];
  const out4 = removeLoops([...straight.slice(0, 101), ...spur, ...straight.slice(101)]);
  // Tolerance 60 m: the cut lands on the earliest vertex within 50 m, a few tens of metres of the spur may remain —
  // noise against the 15–22 % inflation the rule removes (review finding #4).
  add('K4 Stichweg hin und zurück (2 × 100 m) wird bis auf ≤ 60 m entfernt', kmLen(out4) - 4 < 0.06, `${kmLen(out4).toFixed(3)} km`);
  // The chain starts mid-way (2 km), runs to the end (4 km), turns onto the opposite carriageway and runs back PAST
  // its start to 0 km (A 31 at Emden: the first draft lost the end with the station at Larrelt).
  const mid = [...straight.slice(200), ...Array.from({ length: 401 }, (_, i) => [11 + (400 - i) * dLon, LAT + 0.03 / 111.2])];
  const out5 = removeLoops(mid);
  const reach = (x) => out5.some((p) => Math.abs(p[0] - (11 + x * dLon)) < 2 * dLon);
  add('K5 Kette beginnt in der Mitte und kehrt über ihren Anfang hinaus zurück: ganze Strecke 0–4 km bleibt, beide Enden erreicht',
    Math.abs(kmLen(out5) - 4) < 0.15 && reach(0) && reach(400), `${kmLen(mid).toFixed(2)} → ${kmLen(out5).toFixed(2)} km`);
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:road-contract — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
