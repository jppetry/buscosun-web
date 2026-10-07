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
  ROAD_STALE_MS, ROAD_RAW_BASE, ROAD_CDN_BASE, ROAD_REPO_DIR, ROAD_STATUS_PATH, ROAD_LIVE, ROAD_STUCK_PLATEAU, dwdCheckText, roadPointOk,
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
  add('C6 Sprung 1 → 12 °C: nur „wäre verworfen" (Beobachtung), Wert bleibt, Marke o.rs = jump (M2)', jump.quarantine.entries.some((e) => e.rule === 'jump' && e.observe) && pt(jump).rs === 12 && jump.balance.observe.jump === 1 && !jump.balance.byRule.jump && pt(jump).o?.rs === 'jump');
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
  add('D10b M2: der beobachtete Wert trägt die Marke o.rs = neighbours (Seite: „auffällig")', pt(nb).o?.rs === 'neighbours' && !pt(nb).x);
  add('D11b M2: Luft gegen T2m trägt die Marke o.ta = cube', pt(cube).o?.ta === 'cube');
  const ra = run([raw({ airT: 18, sensors: [{ roadT: 0.3, filmMm: 0, cond: 0 }] })]);
  add('D12 M1: Fahrbahn 17,7 K unter der eigenen Luft, keine Nachbarn ⇒ roadAir HART, Fahrbahn verworfen, keine Frostgefahr',
    q(ra, 'roadAir', 'rs').length === 1 && pt(ra).rs === null && pt(ra).x.rs === 'roadAir' && pt(ra).cls !== 'frost' && !ra.balance.observe.roadAir);
}

// --- M: data audit 06.10.2026 (audit/autobahnwetter-datenpruefung.md §5, M1–M5) — values from the real slot 06.10. 19:00 UTC
{
  const mk = (id, dLat, over) => ({ ...raw(over), id, lat: base.lat + dLat, elevM: base.elevM });
  const hood = (rs, ta) => [mk('N1', 0.02, { airT: ta, dewT: ta - 3, sensors: [{ roadT: rs, filmMm: 0, cond: 0 }] }), mk('N2', 0.04, { airT: ta + 0.4, dewT: ta - 3, sensors: [{ roadT: rs + 0.3, filmMm: 0, cond: 0 }] }),
    mk('N3', -0.03, { airT: ta - 0.3, dewT: ta - 3, sensors: [{ roadT: rs - 0.2, filmMm: 0, cond: 0 }] }), mk('N4', 0.05, { airT: ta + 0.1, dewT: ta - 3, sensors: [{ roadT: rs + 0.1, filmMm: 0, cond: 0 }] })];
  // M1 fill values (R-b, R-c) and road far below the air (R-a).
  const k677 = run([raw({ airT: 15.4, dewT: 9.1, sensors: [{ roadT: 0, filmMm: 0, cond: 0 }] })]);
  add('M1 Fahrbahn genau 0,00 °C bei Luft 15,4 °C (K677/O932) ⇒ fillValue, Zustand folgt, keine Frostgefahr',
    q(k677, 'fillValue', 'rs').length === 1 && pt(k677).rs === null && pt(k677).cls !== 'frost' && q(k677, 'stateNoTemp').length === 2);
  const f461 = run([raw({ airT: 12.3, dewT: 8, sensors: [{ roadT: 0, filmMm: 0.1, cond: 5 }] })]);
  add('M1b Eis-Code bei Fahrbahn 0,00 und Luft 12,3 °C (F461, die einzige „Glätte gemessen") ⇒ verworfen, keine Glätte',
    pt(f461).rs === null && pt(f461).cond === null && pt(f461).cls !== 'ice');
  const p969 = run([raw({ airT: -1, dewT: -1, sensors: [{ roadT: -1, filmMm: 0, cond: 0 }] })]);
  add('M1c Fahrbahn = Luft = Taupunkt = −1,00 (P969) ⇒ alle drei fillValue',
    ['rs', 'ta', 'td'].every((f) => q(p969, 'fillValue', f).length === 1) && pt(p969).rs === null && pt(p969).ta === null && pt(p969).cls !== 'frost');
  const real0 = run([raw({ airT: 1.8, dewT: 0.4, sensors: [{ roadT: 0, filmMm: 0.2, cond: 1 }] })]);
  add('M1d Gegenprobe: echte 0,00 °C bei Luft +1,8 °C bleibt (Frostgefahr bleibt Frostgefahr)', pt(real0).rs === 0 && pt(real0).cls === 'frost' && !q(real0, 'fillValue').length);
  const fog = run([raw({ airT: 9.4, dewT: 9.4, sensors: [{ roadT: 9.4, filmMm: 0, cond: 0 }] })]);
  add('M1e Gegenprobe Nebel-Sättigung 9,4/9,4/9,4 bleibt (kein Füllwert)', pt(fog).rs === 9.4 && pt(fog).ta === 9.4 && fog.balance.rejected === 0);
  const h637 = run([raw({ airT: 18.2, sensors: [{ roadT: -25, filmMm: 0, cond: 0 }] }), ...hood(17, 18)]);
  add('M1f Fahrbahn −25,00 °C bei Luft 18,2 und Nachbarn 17 °C (H637 Richrath) ⇒ Fahrbahn roadAir, Luft bleibt',
    q(h637, 'roadAir', 'rs').some((e) => e.id === 'V164') && pt(h637).rs === null && pt(h637).ta === 18.2 && pt(h637).cls !== 'frost');
  const n443 = run([raw({ airT: 41.69, dewT: 31.7, sensors: [{ roadT: 15.1, filmMm: 0, cond: 0 }] }), ...hood(14.8, 12.5)]);
  add('M1g Luft +41,7 °C bei Fahrbahn 15,1 und Nachbarn 14,8/12,5 °C (N443 Irxleben) ⇒ LUFT und Taupunkt roadAir, Fahrbahn bleibt',
    pt(n443).ta === null && pt(n443).td === null && pt(n443).x.ta === 'roadAir' && pt(n443).rs === 15.1);
  const m080 = run([raw({ airT: -23.7, dewT: -25, sensors: [{ roadT: 14.6, filmMm: 0, cond: 0 }] }), ...hood(14.6, 11.4)]);
  add('M1h Luft −23,7 °C bei Fahrbahn 14,6 und Nachbarn normal (M080 Heringen, nachts) ⇒ Luft verworfen, Fahrbahn bleibt',
    pt(m080).ta === null && pt(m080).rs === 14.6 && pt(m080).x.ta === 'roadAir');
  const e237 = run([raw({ airT: 11, sensors: [{ roadT: 42.8, filmMm: 0, cond: 0 }] }), ...hood(12.4, 9.6)]);
  add('M1i Fahrbahn 42,8 °C bei Luft 11 und Nachbarn 12,4 °C (E237 Nordkreuz) ⇒ Fahrbahn roadAir', pt(e237).rs === null && pt(e237).x.rs === 'roadAir');
  const hot = run([raw({ airT: 12, sensors: [{ roadT: 43, filmMm: 0, cond: 0 }] })]);
  add('M1j Fahrbahn 31 K über der Luft OHNE Nachbarn ⇒ nur beobachtet (Sommermittag nicht gemessen), Marke o.rs',
    pt(hot).rs === 43 && hot.balance.observe.roadAir === 1 && pt(hot).o?.rs === 'roadAir');
  // Thaw plateau cap: a value that never moves is stuck after 12 h even in thaw weather.
  const series = (n, mk2) => { let prev = null, res = null; for (let i = 0; i < n; i++) { res = validateRoadSlot({ slotMs: T0 + i * ROAD_SLOT_MS, stations: [{ ...raw(mk2(i)), obsMs: T0 + i * ROAD_SLOT_MS }], catalog, catalogEtag: 'x', catalogState: 'ok', prev, inDE, groups: allGroupsOk() }); prev = res.state; } return res; };
  const pl47 = series(ROAD_STUCK_PLATEAU.maxRun - 1, () => ({ airT: 0.4, dewT: -0.5, sensors: [{ roadT: 0, filmMm: 0.3, cond: 2 }] }));
  const pl48 = series(ROAD_STUCK_PLATEAU.maxRun, () => ({ airT: 0.4, dewT: -0.5, sensors: [{ roadT: 0, filmMm: 0.3, cond: 2 }] }));
  add('M1k Tauplateau gilt höchstens 12 h: 47 gleiche 0,00 °C bleiben, der 48. wird als hängend verworfen',
    pt(pl47).rs === 0 && q(pl48, 'stuck', 'rs').length === 1 && pt(pl48).rs === null);
  // M2 humidity and anemometer.
  const v049 = run([raw({ airT: 12.1, dewT: -39.8, rh: 0 })]);
  add('M2 Taupunkt −39,8 °C bei Luft 12,1 (V049, Feuchte 0 %) ⇒ Taupunkt und Feuchte dewSpread', pt(v049).td === null && pt(v049).rh === null && pt(v049).x.td === 'dewSpread');
  const jul = Date.UTC(2026, 6, 15, 14, 0);
  const summer = run([{ ...raw({ airT: 34, dewT: 6, rh: 18 }), obsMs: jul }], { slotMs: jul });
  add('M2b Gegenprobe Juli: Luft 34 / Taupunkt 6 (28 K) bleibt — Schwelle Mai–Sep. 30 K', pt(summer).td === 6 && pt(summer).rh === 18);
  const oct28 = run([raw({ airT: 34, dewT: 6, rh: 18 })]);
  add('M2c dieselben 28 K im Oktober ⇒ verworfen', pt(oct28).td === null);
  const p415 = run([raw({ windMs: 0.4, gustMs: 57.6 })]);
  add('M2d Böe 57,6 m/s bei Mittelwind 0,4 (P415 Rügland) ⇒ gustNoWind', pt(p415).wg === null && pt(p415).x.wg === 'gustNoWind');
  const storm = run([raw({ windMs: 14, gustMs: 41 })]);
  add('M2e Gegenprobe Sturm 41 m/s bei Mittelwind 14 m/s bleibt', pt(storm).wg === 41);
  // M3 precipitation fill value.
  const ko = run([raw({ precipRateMmH: 21.6, precipIntensity: 0, precipType: 0 })]);
  add('M3 21,6 mm/h bei Intensität 0 („No phenomena") und Art 0 (KO-RP) ⇒ precipFill', pt(ko).pr === null && pt(ko).x.pr === 'precipFill');
  const fn = run([raw({ precipRateMmH: 10.08, precipIntensity: 1, precipType: 0 })]);
  const mc = run([raw({ precipRateMmH: 20.16, precipIntensity: 3, precipType: null })]);
  const rain = run([raw({ precipRateMmH: 4.32, precipIntensity: null, precipType: 2 ** 25 })]);
  add('M3b Gegenproben: Intensität 1 (FN-BY 10,08), Intensität 3 (MC-MV 20,16), Art Regen ohne Intensität ⇒ bleiben',
    pt(fn).pr === 10.08 && pt(mc).pr === 20.16 && pt(rain).pr === 4.32);
  const legacy = run([raw({ precipRateMmH: 21.6, precipType: 0 })]);
  add('M3c Aufrufer ohne Feld precipIntensity (vor M3) wird nicht beurteilt', pt(legacy).pr === 21.6);
  // M5 DWD check text from the raw flag.
  add('M5 qf am Punkt: 0 ⇒ 0, Bit 1 ⇒ 2^29, fehlend (alle 30 Bits) ⇒ kein Feld',
    pt(run([raw({ quality: 0 })])).qf === 0 && pt(run([raw({ quality: 2 ** 29 })])).qf === 2 ** 29 && pt(run([raw({ quality: 2 ** 30 - 1 })])).qf === undefined);
  const t = (qf) => dwdCheckText(qf);
  add('M5b Prüftext: 0 ⇒ nichts beanstandet · Bit 1 ⇒ nicht durchgeführt · fehlt ⇒ unbekannt · FN-BY 11+17+28 ⇒ beanstandet, benannt',
    /nichts beanstandet/.test(t(0)) && /nicht durchgeführt/.test(t(2 ** 29)) && /unbekannt/.test(t(null)) && /unbekannt/.test(t(2 ** 30 - 1))
    && t(2 ** 19 + 2 ** 13 + 2 ** 2) === 'Prüfung des DWD: durchgeführt, beanstandet: Bodentemperatur (Tiefe 4), Eisansatz, reservierte Bits', t(2 ** 19 + 2 ** 13 + 2 ** 2));
  const good = pt(run([raw()]));
  add('M5c Client-Prüfer: gültige o/qf bestehen, kaputte fallen (o mit fremder Regel, qf negativ)',
    roadPointOk({ ...good, o: { rs: 'neighbours' } }) && !roadPointOk({ ...good, o: { rs: 'erfunden' } }) && !roadPointOk({ ...good, o: { zz: 'jump' } }) && !roadPointOk({ ...good, qf: -1 }));
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
  add('E7 statistische Regeln stehen im Beobachtungsmodus, harte sind hart (seit M1–M3: roadAir, fillValue, dewSpread, gustNoWind, precipFill hart)',
    ['jump', 'neighbours', 'cube', 'catalog'].every((r) => ROAD_RULES[r].mode === 'observe')
    && ['limit', 'placeholder', 'dewAboveAir', 'gustBelowWind', 'dwdSuspect', 'stuck', 'stateNoTemp', 'iceWarm', 'time', 'outsideDE',
      'roadAir', 'fillValue', 'dewSpread', 'gustNoWind', 'precipFill'].every((r) => ROAD_RULES[r].mode === 'hard'));
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

  // V-AW-16 / V-AW-22 (06.10.2026): spurs as sections of their own, stretches without carriageway trimmed or named.
  const { buildCorridors, unbuiltRuns } = await import('./road/build-corridors.mjs');
  const dLat = 0.01 / 111.2;
  const E = (km) => 11 + km * 100 * dLon;                              // km along the main axis (east)
  const main = Array.from({ length: 2001 }, (_, i) => [E(i / 100), LAT]);  // 20 km, 10 m spacing
  const spurOut = Array.from({ length: 300 }, (_, i) => [E(10) + 0.03 / (111.2 * Math.cos(LAT * Math.PI / 180)), LAT + (i + 1) * dLat]);   // 3 km north
  const spurBack = Array.from({ length: 300 }, (_, i) => [E(10), LAT + (300 - i) * dLat]);
  const line = [...main.slice(0, 1001), ...spurOut, ...spurBack, ...main.slice(1001)];
  const axes = { features: [{ type: 'Feature', properties: { bez: 'A99' }, geometry: { type: 'LineString', coordinates: line } }] };
  const places = [[LAT, E(0), 'Westdorf', null, 'DE', 9000], [LAT, E(20), 'Oststadt', null, 'DE', 9000], [LAT + 0.027, E(10), 'Nordweiler', null, 'DE', 6000]];
  const stations = { S1: { kind: 'A', road: 'A99', lat: LAT, lon: E(15), n: 'Haupt' }, S2: { kind: 'A', road: 'A99', lat: LAT + 2.9 * 111.2 ** -1, lon: E(10), n: 'Ast' } };
  const plain = buildCorridors({ axes, stations, obsPoints: [], places, deRings: [] });
  const withSpur = buildCorridors({ axes, stations, obsPoints: [], places, deRings: [], spurs: true });
  const cuts = [];
  const noCut = removeLoops(line), withCut = removeLoops(line, undefined, undefined, cuts);
  add('K6 removeLoops mit Sammler (V-AW-16): Ergebnis gleich wie ohne, der abgeschnittene Ast (≈ 3 km) liegt im Sammler',
    JSON.stringify(noCut) === JSON.stringify(withCut) && cuts.some((c) => kmLen(c) > 2.5), cuts.map((c) => kmLen(c).toFixed(2)).join(','));
  const sp = withSpur.find((c) => c.spur);
  add('K7 buildCorridors: ohne Option wie bisher (Ast-Station ohne Korridor); mit spurs ein eigener Abschnitt a99-2 (spur) für die Station am Ast, nach den regulären nummeriert, Hauptabschnitt unverändert',
    plain.length === 1 && plain[0].stations.map((s) => s.id).join() === 'S1' && withSpur.length === 2 && withSpur[0].id === 'a99' && JSON.stringify(withSpur[0]) === JSON.stringify(plain[0])
    && sp?.id === 'a99-2' && sp.stations.map((s) => s.id).join() === 'S2' && sp.lengthKm >= 2, JSON.stringify(withSpur.map((c) => [c.id, c.lengthKm, c.stations.map((s) => s.id)])));
  // OSM test: no carriageway on km 0–6 (start) and 12–18 (inside) of a straight 20-km axis.
  const ax2 = { features: [{ type: 'Feature', properties: { bez: 'A98' }, geometry: { type: 'LineString', coordinates: main } }] };
  const kmOf = (p) => (p[0] - 11) / (100 * dLon);
  const isBuilt = (p) => { const k = kmOf(p); return !(k <= 6.01 || (k >= 11.99 && k <= 18.01)); };
  const st2 = { T1: { kind: 'A', road: 'A98', lat: LAT, lon: E(9), n: 'Mitte' } };
  const trimmed = buildCorridors({ axes: ax2, stations: st2, obsPoints: [], places, deRings: [], isBuilt })[0];
  const guarded = buildCorridors({ axes: ax2, stations: { ...st2, T2: { kind: 'A', road: 'A98', lat: LAT, lon: E(15), n: 'Lücke' } }, obsPoints: [], places, deRings: [], isBuilt })[0];
  add('K8 ohne OSM-Fahrbahn (V-AW-22): ≥ 5 km am Anfang ⇒ abgeschnitten (Station-km verschiebt sich mit), innen ⇒ als unbuilt benannt; eine Messstelle in der Lücke verhindert beides an dieser Stelle; unbuiltRuns tastet je 0,5 km',
    trimmed.lengthKm === 14 && trimmed.trimmedKm === 6 && trimmed.stations[0].km === 3 && JSON.stringify(trimmed.unbuilt) === '[[6,12]]'
    && !guarded.unbuilt && guarded.lengthKm === 14 && JSON.stringify(unbuiltRuns(main, 20, isBuilt)) === JSON.stringify([[0, 6], [12, 18]]),
    JSON.stringify({ len: trimmed.lengthKm, trim: trimmed.trimmedKm, km: trimmed.stations[0].km, unbuilt: trimmed.unbuilt, guarded: guarded.unbuilt ?? null }));
  const { axisPointsOf, stationPointsOf } = await import('./road/build-fc-points.mjs');
  const pts = axisPointsOf({ id: 'a98', road: 'A98', lengthKm: trimmed.lengthKm, line: trimmed.line, unbuilt: trimmed.unbuilt }, null);
  const sts = stationPointsOf({ C1: { id: 'C1', lat: 50, lon: 10, n: 'Katalog', bl: 'BY' } }, [{ id: 'a98', stations: [{ id: 'N1', km: 3 }] }],
    [{ id: 'C1', lat: 51, lon: 11, g: 'FN-BY' }, { id: 'N1', lat: 50.5, lon: 10.5, g: 'KK-SH', n: 'Neu' }, { id: 'N2', lat: 52, lon: 9, g: 'xx' }, { id: 'N3', g: 'KK-SH' }]);
  add('K9 Punkte: kein Achspunkt in einer unbuilt-Lücke (V-AW-22); Stationen ohne Katalogzeile kommen aus der Meldung dazu (V-AW-7: Lage der Meldung, Datei nach der Reihe, noCatalog), Katalog-Stationen bleiben bei ihrer Lage, ohne Koordinaten keine',
    JSON.stringify(pts.map((p) => p.km)) === '[0,5,14]' && sts.length === 3 && sts[0].lat === 50 && sts[1].id === 'N1' && sts[1].noCatalog && sts[1].state === 'SH' && sts[1].corridor === 'a98' && sts[2].state === 'XX',
    JSON.stringify({ axis: pts.map((p) => p.km), st: sts.map((p) => [p.id, p.state, p.corridor]) }));
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:road-contract — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
