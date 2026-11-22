/**
 * verify:sea-planner — Phase SP (`audit/seewetter-planer.md`): "Ausfahrt planen" on /seewetter.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-planner.mjs
 *
 * Fixtures are REAL files (`scripts/lib/fixtures/sea/`, cut out unchanged — see verify:sea-wind-band):
 *   su-spots-2026111712.json               the published spot file of run 17.11.2026 12 UTC (3 spots, 79 h)
 *   su-spots-2026111712-w2026111715.json   its wind refresh (from hour 11)
 *   su-catalog.json, static/spots.json     three spots / the whole catalogue of 56 (7 of them `tidal`)
 * The hours are built as the page builds them (`parseSpotsDoc` → `mergeWindDoc` → hour axis from a first index).
 *
 *   A  fixture: real shape, the literal values the anchors below quote
 *   B  window logic: maxima with hour, first hour above the limit, shore-class change, wind start → return, missing
 *      hours — each against literal values read off the real file AND an independent rule; negative controls
 *   C  relative wind and drift direction, incl. the wrap 350° → 10°
 *   D  geometry: distance, bearing, radius, start position of the boat for all 56 real spots
 *   E  window on the hour axis and the link (`pl`)
 *   F  sun at the return
 *   G  words: no drift distance or time, no "sicher", no percent, straight line said, footer; shares never combined
 *   H  display without a browser: band row "Fenster", findings panel, page wiring, CSS
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { parseSpotsDoc, mergeWindDoc } from '../src/sea/seaClient.ts';
import { SEA_SPOT_STEPS, seaCellCentre, SEA_SPOT_MAX_CELL_KM } from '../src/sea/seaContract.ts';
import { MS_TO_KN, SEA_PROFILE_BY_ID, SHORE_LABEL, classify, shoreAngle } from '../src/sea/seaProfiles.ts';
import { buildSeaUrl, parseSeaUrl, SEA_DEFAULT_STATE, SEA_PL_RE } from '../src/sea/seaState.ts';
import { absolutizeHourParam } from '../src/share/hourOffset.ts';
import { sunAltitudeDeg } from '../src/photo/sun.ts';
import * as P from '../src/sea/seaPlanner.ts';
import * as WZ from '../src/sea/seaSteps.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const J = (f) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const H = 3_600_000, N = SEA_SPOT_STEPS.length;

const RUN = '2026111712';
const OLD = J(`su-spots-${RUN}.json`), NEW = J(`su-spots-${RUN}-w2026111715.json`), CAT = J('su-catalog.json'), ALL = J('static/spots.json');
const SPO = 'st-peter-ording', FEH = 'fehmarn-gruener-brink', WAR = 'warnemuende';
const runMs = Date.UTC(2026, 10, 17, 12);
const pOld = parseSpotsDoc(OLD, RUN);
const doc = mergeWindDoc(pOld, { from: NEW.from, wind: NEW.wind, spots: NEW.spots });
const spotOf = (id) => CAT.spots.find((s) => s.id === id);
/** The page's hour axis: hour k = run index `first + k` (`SeaPage.tsx` `hourOf`). */
const hoursOf = (d, id, first) => Array.from({ length: N - first }, (_, k) => {
  const s = d.series[id], i = first + k;
  return { t: runMs + i * H, windMs: s.wind[i], gustMs: s.gust[i], windDir: s.windDir[i] };
});
const tOf = (i) => runMs + i * H;

// --- A: the real file ---------------------------------------------------------------------------------------------
const raw = NEW.spots[SPO].v;
add('A1 Fixture: echte Lauf-Datei (3 Spots × 79 h) und echte Wind-Auffrischung ab Stunde 11; die Seite liest sie wie im Betrieb',
  OLD.product === 'sea-spots-series' && NEW.product === 'sea-spots-wind' && NEW.from === 11 && pOld && Object.keys(doc.series).length === 3 && doc.series[SPO].wind.length === N && doc.windFrom === 11,
  `${Object.keys(doc.series).join(', ')}`);
add('A2 Anker aus der Datei (kodiert 0,1 m/s bzw. Grad): Wind 11–22, Böe 20–21, Richtung 28 und 37 am Spot St. Peter-Ording',
  JSON.stringify(raw.wind.slice(11, 23)) === '[67,65,70,75,80,85,95,101,110,114,113,99]' && raw.gust[20] === 169 && raw.gust[21] === 173 && raw.windDir[27] === 313 && raw.windDir[28] === 324 && raw.windDir[36] === 337 && raw.windDir[37] === 41
  && doc.series[SPO].wind[20] === 11.4 && doc.series[SPO].gust[21] === 17.3 && doc.series[SPO].windDir[28] === 324 && spotOf(SPO).normal === 217,
  `wind[20] ${doc.series[SPO].wind[20]} m/s · gust[21] ${doc.series[SPO].gust[21]} m/s`);

// --- B: window logic ------------------------------------------------------------------------------------------------
const F = 11;                                    // hour 0 of the axis = run index 11 (the refresh's first hour)
const hs = hoursOf(doc, SPO, F);
const kite = SEA_PROFILE_BY_ID.kite.limits, jolle = SEA_PROFILE_BY_ID.jolle.limits, sup = SEA_PROFILE_BY_ID.sup.limits;
const find = (hours, a, b, lim, normal = 217) => P.planFindings(hours, a, b, { normal, windMaxKn: lim?.windMax ?? null, gustMaxKn: lim?.gustMax ?? null });
const f1 = find(hs, 0, 11, kite);
add('B1 Höchstwerte im Fenster 11–22: Wind 11,4 m/s in Stunde 20, Böen 17,3 m/s in Stunde 21 (aus der Datei abgelesen)',
  f1.hours === 12 && f1.maxWind.ms === 11.4 && f1.maxWind.t === tOf(20) && f1.maxGust.ms === 17.3 && f1.maxGust.t === tOf(21) && f1.missingWind === 0,
  `Wind ${f1.maxWind.ms} @${(f1.maxWind.t - runMs) / H} · Böe ${f1.maxGust.ms} @${(f1.maxGust.t - runMs) / H}`);
// Independent rule: Math.max over the values, then the first index carrying it — on every window of every spot.
let nWin = 0, maxOk = true;
for (const id of [SPO, FEH, WAR]) {
  const all = hoursOf(doc, id, 0), sp = spotOf(id);
  for (let a = 0; a < N - 1; a += 3) for (const len of [1, 2, 5, 11, 30]) {
    const b = Math.min(N - 1, a + len), f = find(all, a, b, kite, sp.normal), win = all.slice(a, b + 1);
    for (const [key, got] of [['windMs', f.maxWind], ['gustMs', f.maxGust]]) {
      const vals = win.map((x) => x[key]).filter((x) => x != null);
      const want = vals.length ? Math.max(...vals) : null;
      const at = want == null ? null : win.find((x) => x[key] === want).t;
      if ((got?.ms ?? null) !== want || (got?.t ?? null) !== at) maxOk = false;
    }
    nWin++;
  }
}
add('B2 Höchstwerte = Math.max der Stundenwerte, bei Gleichstand die früheste Stunde — auf allen Fenstern der drei Spots', maxOk && nWin > 300, `${nWin} Fenster`);
const tie = find([{ t: 1, windMs: 5, gustMs: 9, windDir: 200 }, { t: 2, windMs: 7, gustMs: 9, windDir: 200 }, { t: 3, windMs: 7, gustMs: 8, windDir: 200 }], 0, 2, null);
add('B2b Gleichstand: die frühere Stunde zählt', tie.maxWind.t === 2 && tie.maxGust.t === 1);
const fJ = find(hs, 0, 11, jolle), fS = find(hs, 0, 11, sup);
add('B3 erste Stunde über der Grenze: Kite Böen 33 kn ab Stunde 21 (16,9 m/s = 32,9 kn in Stunde 20 noch darunter), Wind 28 kn nie; Jolle Wind 16 kn ab Stunde 16; SUP ab der Startstunde',
  f1.overGust?.t === tOf(21) && f1.overGust.limitKn === 33 && f1.overWind === null && fJ.overWind?.t === tOf(16) && fS.overWind?.t === tOf(11) && fS.overGust?.t === tOf(11)
  && 16.9 * MS_TO_KN < 33 && 17.3 * MS_TO_KN > 33 && 8.0 * MS_TO_KN < 16 && 8.5 * MS_TO_KN > 16,
  `Kite Böe @${(f1.overGust?.t - runMs) / H} · Jolle Wind @${(fJ.overWind?.t - runMs) / H}`);
// The page's own classes say the same: the first hour whose verdict names the limit.
const sp0 = spotOf(SPO);
const firstReason = (lim, re) => { const h = hs.slice(0, 12).find((x) => classify({ ...x, hs: 0.3, ws: 0.2, wsPer: 3 }, lim, sp0.normal, sp0.lat, sp0.lon).reasons.some((r) => re.test(r))); return h?.t ?? null; };
add('B3b dieselbe Stunde wie die Einordnung der Seite (classify nennt „Böen über 33 kn“ / „Wind über 16 kn“ zuerst in dieser Stunde)',
  firstReason(kite, /^Böen über 33 kn/) === f1.overGust.t && firstReason(jolle, /^Wind über 16 kn/) === fJ.overWind.t);
const hole = clone(hs); hole[10].gustMs = null;          // the hour that was first above the limit loses its gust
const fHole = find(hole, 0, 11, kite);
const high = find(hs, 0, 11, { windMax: 40, gustMax: 40 });
const noLim = find(hs, 0, 11, { windMax: null, gustMax: null });
add('B4 Negativkontrollen: ohne den Wert der Stunde 21 gibt es keine Stunde über 33 kn mehr (und eine fehlende Böe wird gezählt); Grenze 40 kn ⇒ keine; ohne Grenze ⇒ keine; ein höherer Wert verschiebt den Höchstwert',
  fHole.overGust === null && fHole.missingGust === 1 && fHole.maxGust.t === tOf(20) && high.overWind === null && high.overGust === null && noLim.overWind === null && noLim.overGust === null
  && (() => { const m = clone(hs); m[3].windMs = 30; const f = find(m, 0, 11, kite); return f.maxWind.t === tOf(14) && f.overWind?.t === tOf(14); })());
// Shore angle over 11–39 (normal 217°): the file's directions give seven changes, "schräg ablandig" first at 28, "ablandig" first at 37.
const fSh = find(hs, 0, 28, kite);
const cls = hs.slice(0, 29).map((x) => shoreAngle(x.windDir, 217));
const want = cls.reduce((acc, c, i) => (i > 0 && c !== cls[i - 1] ? [...acc, i + F] : acc), []);
add('B5 Wechsel des Uferwinkels 11–39: erste Stunde „schräg ablandig“ = 28 (324° gegen Ufernormale 217°), erste Stunde „ablandig“ = 37 (41°); sieben Wechsel in den Stunden 12, 24, 25, 28, 37, 38, 39',
  fSh.shore.firstObliqueOff === tOf(28) && fSh.shore.firstOff === tOf(37) && JSON.stringify(fSh.shore.changes.map((c) => (c.t - runMs) / H)) === '[12,24,25,28,37,38,39]'
  && JSON.stringify(want) === '[12,24,25,28,37,38,39]' && fSh.shore.start === 'schraeg-auflandig' && fSh.shore.end === 'ablandig'
  && fSh.shore.changes[3].from === 'sideshore' && fSh.shore.changes[3].to === 'schraeg-ablandig',
  fSh.shore.changes.map((c) => `${(c.t - runMs) / H}:${c.to}`).join(' '));
const fEarly = find(hs, 0, 11, kite), fOffStart = find(hs, 26, 28, kite);
add('B5b Fenster vor dem Wechsel: keine Stunde ablandig (null, kein Ersatzwert); Fenster, das ablandig beginnt: die Startstunde ist die erste',
  fEarly.shore.firstObliqueOff === null && fEarly.shore.firstOff === null && fOffStart.shore.start === 'ablandig' && fOffStart.shore.firstOff === tOf(37) && fOffStart.shore.changes.length === 2);
const turned = clone(hs); for (const x of turned) if (x.windDir != null) x.windDir = (x.windDir + 180) % 360;
add('B5c Negativkontrolle: dieselbe Reihe um 180° gedreht ⇒ das Fenster 11–22 beginnt ablandig statt auflandig', find(turned, 0, 11, kite).shore.firstOff === tOf(12) && find(turned, 0, 11, kite).shore.start === 'schraeg-ablandig');
add('B6 Wind Start → Rückkehr 11–22: 6,7 → 9,9 m/s (+3,2), Richtung 176° → 214° = 38° nach rechts',
  f1.wind.start.windMs === 6.7 && f1.wind.end.windMs === 9.9 && Math.abs(f1.wind.deltaMs - 3.2) < 1e-9 && f1.wind.turnDeg === 38, `Δ ${f1.wind.deltaMs?.toFixed(1)} m/s · ${f1.wind.turnDeg}°`);
// Missing hours: the run's first four hours carry no wind (real), Warnemünde misses one direction at hour 48 (real).
const all0 = hoursOf(pOld, SPO, 0);
const nullWind = all0.slice(0, 7).filter((x) => x.windMs == null).length;
const fMiss = find(all0, 2, 6, kite), fNone = find(all0, 0, 3, kite);
add('B7 fehlende Stunden (echt: die ersten vier Stunden des Laufs ohne Wind): gezählt, Höchstwert nur aus den übrigen; ein Fenster ganz ohne Wert hat keinen Höchstwert und keine „erste Stunde“',
  nullWind === 4 && fMiss.hours === 5 && fMiss.missingWind === 2 && fMiss.maxWind && fMiss.maxWind.t >= tOf(4) && fNone.missingWind === 4 && fNone.maxWind === null && fNone.maxGust === null && fNone.overWind === null
  && fNone.shore.start === null && fNone.wind.deltaMs === null && fNone.wind.turnDeg === null, `2–6: ${fMiss.missingWind} von ${fMiss.hours} ohne Wind`);
const war = hoursOf(pOld, WAR, 0);
const fWar = find(war, 46, 50, kite, spotOf(WAR).normal);
add('B7b fehlende Richtung (echt: Warnemünde Stunde 48): als fehlend gezählt, der Wechsel wird über die Lücke hinweg erkannt, nicht an ihr erfunden',
  war[48].windDir === null && war[48].windMs != null && fWar.missingDir === 1 && fWar.missingWind === 0 && fWar.shore.changes.every((c) => c.t !== tOf(48)), `Wechsel ${fWar.shore.changes.map((c) => (c.t - runMs) / H).join(',') || 'keine'}`);
add('B7c Stunde ohne Reihe (null) oder hinter dem Ende der Reihe: fehlend, kein Absturz',
  find([null, hs[1], undefined], 0, 4, kite).missingWind === 4 && find([null, hs[1], undefined], 0, 4, kite).maxWind.t === hs[1].t && find(hs, 5, 2, kite).hours === 4);

// --- C: relative wind, drift --------------------------------------------------------------------------------------
const rel = P.relativeWind;
add('C1 Wind zum Rückweg über Nord hinweg: 350° gegen Kurs 10° und 10° gegen Kurs 350° = „von vorn“ (20°), nicht „von hinten“ (340°)',
  rel(350, 10) === 'vorn' && rel(10, 350) === 'vorn' && P.angleDiff(350, 10) === -20 && P.angleDiff(10, 350) === 20 && rel(359, 0) === 'vorn' && rel(0, 359.5) === 'vorn' && rel(355, 185) === 'hinten' && rel(5, 175) === 'hinten');
add('C2 Klassen an den Grenzen 30 / 75 / 105 / 150° (dieselben wie der Uferwinkel), von links wie von rechts',
  ['vorn', 'vorn', 'schraeg-vorn', 'schraeg-vorn', 'seite', 'seite', 'schraeg-hinten', 'schraeg-hinten', 'hinten', 'hinten'].every((c, i) => rel([0, 30, 31, 75, 76, 105, 106, 150, 151, 180][i], 0) === c && rel(360 - [0, 30, 31, 75, 76, 105, 106, 150, 151, 180][i], 0) === c)
  && JSON.stringify(P.REL_BORDERS) === '[30,75,105,150]' && P.REL_LABEL.vorn === 'von vorn' && P.REL_LABEL['schraeg-vorn'] === 'schräg von vorn' && P.REL_LABEL.seite === 'von der Seite' && P.REL_LABEL['schraeg-hinten'] === 'schräg von hinten' && P.REL_LABEL.hinten === 'von hinten');
add('C3 ohne Richtung oder ohne Kurs: keine Klasse', rel(null, 10) === null && rel(10, null) === null && rel(NaN, 10) === null && rel(undefined, undefined) === null);
// Real wrap: Fehmarn's direction crosses north in the published file (355, 351, 1, 28 at hours 45–48).
const feh = hoursOf(pOld, FEH, 0);
const fFeh = find(feh, 46, 48, kite, spotOf(FEH).normal);
add('C4 echte Drehung über Nord (Fehmarn, Stunden 45–48: 355°, 351°, 1°, 28°): 351° → 28° = 37° nach rechts, nicht 323° nach links; Uferwinkel bleibt auflandig (Normale 17°)',
  JSON.stringify(feh.slice(45, 49).map((x) => x.windDir)) === '[355,351,1,28]' && fFeh.wind.turnDeg === 37 && fFeh.shore.changes.length === 0 && fFeh.shore.start === 'auflandig' && fFeh.shore.end === 'auflandig'
  && rel(feh[46].windDir, 5) === 'vorn' && rel(feh[47].windDir, 355) === 'vorn', `Drehung ${fFeh.wind.turnDeg}°`);
let driftOk = true, nDrift = 0;
for (const id of [SPO, FEH, WAR]) for (const x of hoursOf(doc, id, 0)) {
  const d = P.driftOf(x.windDir, spotOf(id).normal), sh = shoreAngle(x.windDir, spotOf(id).normal);
  if (x.windDir == null) { if (d !== null) driftOk = false; continue; }
  nDrift++;
  const side = sh === 'auflandig' || sh === 'schraeg-auflandig' ? 'see' : sh === 'sideshore' ? 'quer' : 'land';
  if (!d || d.toDeg !== (x.windDir + 180) % 360 || d.shore !== sh || d.side !== side || Object.keys(d).sort().join() !== 'shore,side,toDeg') driftOk = false;
}
add('C5 Drift-Pfeile: Richtung = Wind + 180°, Seite aus den Uferwinkel-Klassen (2 × von See, längs, 2 × vom Land) — nur Richtung und Seite, kein weiteres Feld (keine Strecke, keine Zeit)',
  driftOk && nDrift > 200 && P.driftOf(350, 0).toDeg === 170 && P.driftOf(10, 0).side === 'see' && P.driftOf(180, 0).side === 'land' && P.driftOf(90, 0).side === 'quer' && P.driftSideOf(null) === null, `${nDrift} echte Stunden`);

// --- D: geometry -----------------------------------------------------------------------------------------------------
const a = { lat: 54.2982, lon: 8.6157 };
const north = P.planDestination(a, 0, 5), east = P.planDestination(a, 90, 5);
add('D1 Strecke und Kurs: 5 km nach Norden = 0,04497° Breite; hin und zurück auf 1 m; Kurs N 0°, O 90°, zurück 180° / ≈ 270°',
  Math.abs(north.lat - a.lat - 5 / 111.195) < 1e-5 && Math.abs(P.planDistKm(a, north) - 5) < 1e-3 && Math.abs(P.planDistKm(a, east) - 5) < 1e-3 && P.planBearingDeg(a, north) < 1e-6 && Math.abs(P.planBearingDeg(a, east) - 90) < 1e-6
  && Math.abs(P.planBearingDeg(north, a) - 180) < 1e-6 && Math.abs(P.planBearingDeg(east, a) - 270) < 0.1, `${P.planDistKm(a, north).toFixed(4)} km`);
const inside = P.clampToRadius(a, P.planDestination(a, 123, 4.99)), outside = P.clampToRadius(a, P.planDestination(a, 123, 12));
add('D2 Radius (gesetzt, 5 km): 4,99 km bleibt, 12 km kommt auf den Kreis zurück, auf derselben Peilung; der Ring liegt überall auf 5 km und ist geschlossen',
  P.SEA_PLAN_RADIUS_KM === 5 && !inside.clamped && Math.abs(inside.km - 4.99) < 1e-3 && outside.clamped && Math.abs(P.planDistKm(a, outside) - 5) < 1e-3 && Math.abs(P.planBearingDeg(a, outside) - 123) < 1e-3
  && (() => { const r = P.radiusRing(a); return r.length === 73 && r[0][0] === r[72][0] && r[0][1] === r[72][1] && r.every(([lon, lat]) => Math.abs(P.planDistKm(a, { lat, lon }) - 5) < 1e-3); })()
  && (() => { const [w, s, e, n] = P.radiusBounds(a); return P.radiusRing(a).every(([lon, lat]) => lon >= w - 1e-9 && lon <= e + 1e-9 && lat >= s - 1e-9 && lat <= n + 1e-9); })());
let boats = 0, boatBad = [];
for (const s of ALL.spots) {
  const b = P.defaultBoat(s), km = P.planDistKm(s, b), cell = seaCellCentre(s.cell.model, s.cell.i, s.cell.j), ckm = P.planDistKm(s, cell);
  const onBearing = ckm < 0.05 || Math.abs(P.angleDiff(P.planBearingDeg(s, b), P.planBearingDeg(s, cell))) < 0.5;
  // Four decimals in the link: the position may lie a few metres off the exact distance.
  if (!(km >= P.SEA_PLAN_START_KM - 0.02 && km <= P.SEA_PLAN_RADIUS_KM + 0.02 && onBearing && Math.abs(km - Math.max(P.SEA_PLAN_START_KM, ckm)) < 0.02)) boatBad.push(s.id);
  boats++;
}
add('D3 Startlage des Boots an allen 56 echten Spots: in Richtung der Wasserzelle des Spots, mindestens 0,8 km, höchstens der Radius (die Zelle selbst liegt ≤ 3 km)', boats === 56 && boatBad.length === 0 && SEA_SPOT_MAX_CELL_KM <= P.SEA_PLAN_RADIUS_KM, boatBad.join(','));

// --- E: window on the axis, link -------------------------------------------------------------------------------------
const now = Date.UTC(2026, 10, 18, 9), W = (s, e, n = 67) => P.planWindow(now + s * H, now + e * H, now, n);
add('E1 Fenster auf der Stundenachse: unverändert im Bereich; vorbei ⇒ ab jetzt mit gleicher Dauer (moved); Start vorbei ⇒ gekürzt; hinter dem Ende ⇒ ans Ende; nie kürzer als 1 h; ohne zwei Stunden kein Fenster',
  JSON.stringify(W(3, 6)) === '{"start":3,"end":6,"moved":false,"cut":false}' && JSON.stringify(W(-9, -6)) === '{"start":0,"end":3,"moved":true,"cut":false}' && JSON.stringify(W(-2, 4)) === '{"start":0,"end":4,"moved":false,"cut":true}'
  && JSON.stringify(W(60, 70)) === '{"start":60,"end":66,"moved":false,"cut":true}' && JSON.stringify(W(80, 84)) === '{"start":62,"end":66,"moved":true,"cut":false}' && W(5, 5).end === 6 && W(66, 66).start === 65 && W(3, 6, 1) === null
  && JSON.stringify(P.defaultWindow(4, 67)) === '{"start":4,"end":7}' && JSON.stringify(P.defaultWindow(66, 67)) === '{"start":65,"end":66}' && P.defaultWindow(0, 1) === null);
const link = { startMs: Date.UTC(2026, 10, 18, 14), endMs: Date.UTC(2026, 10, 18, 17), lat: 54.3012, lon: 8.6034 };
const enc = P.encodePlanParam(link);
add('E2 Link: `pl=2026111814_2026111817_54.3012_8.6034` (UTC-Stunden, Lage auf 4 Stellen), hin und zurück gleich',
  enc === '2026111814_2026111817_54.3012_8.6034' && JSON.stringify(P.parsePlanParam(enc)) === JSON.stringify(link) && SEA_PL_RE.test(enc) && String(SEA_PL_RE) === String(P.PLAN_PARAM_RE), enc);
const bad = ['2026111817_2026111814_54.3012_8.6034', '2026111814_2026111814_54.3012_8.6034', '2026133014_2026133017_54.3012_8.6034', '2026111814_2026111817_94.3012_8.6034', '2026111814_2026111817_54.3012_48.6034',
  '2026111814_2026121817_54.3012_8.6034', '2026111814_2026111817_54_8', 'x', '', null];
add('E3 Negativkontrollen: Rückkehr vor oder gleich Start, kein Datum, Lage außerhalb, Fenster über 200 h, falsche Form ⇒ kein Plan', bad.every((x) => P.parsePlanParam(x) === null), bad.filter((x) => P.parsePlanParam(x) !== null).join(' | '));
const st = parseSeaUrl(SPO, `?p=jolle&t=5&pl=${enc}`);
const url = buildSeaUrl(st.state);
add('E4 Adresse: Profil, Start, Rückkehr und Bootslage stehen im Link (`p`, `pl`), gleiche Zustände geben gleiche Adressen; ohne Planer bleibt die Adresse wie bisher; ein kaputtes `pl` wird verworfen und gemeldet; die absolute Zeit `t` fasst `pl` nicht an',
  st.invalid.length === 0 && st.state.pl === enc && st.state.p === 'jolle' && url === `/seewetter/${SPO}?p=jolle&t=5&pl=${enc}` && parseSeaUrl(SPO, url.split('?')[1]).state.pl === enc
  && buildSeaUrl({ ...SEA_DEFAULT_STATE, spot: SPO }) === `/seewetter/${SPO}` && SEA_DEFAULT_STATE.pl === null && parseSeaUrl(SPO, '?pl=kaputt').invalid.includes('pl') && parseSeaUrl(SPO, '?pl=kaputt').state.pl === null
  && absolutizeHourParam(url, 5, now).endsWith(`&pl=${enc}`) && absolutizeHourParam(url, 5, now).includes('t=2026-11-18T14'), url);

// --- F: sun at the return --------------------------------------------------------------------------------------------
const noon = Date.UTC(2026, 10, 18, 12), eve = Date.UTC(2026, 10, 18, 20);
const sDay = P.sunAround(noon, sp0.lat, sp0.lon), sNight = P.sunAround(eve, sp0.lat, sp0.lon);
const alt = (ms) => sunAltitudeDeg(new Date(ms), sp0.lat, sp0.lon);
const hmUtc = (ms) => new Date(ms).toISOString().slice(11, 16);
add('F1 Sonnenuntergang St. Peter-Ording 18.11.2026: zwischen 15:10 und 15:32 UTC, auf die Minute am Übergang der Sonnenhöhe (−0,833°); mittags „vor“, abends „nach“ demselben Untergang, mit dem Aufgang des Folgetags',
  sDay.up && sDay.sunset > Date.UTC(2026, 10, 18, 15, 10) && sDay.sunset < Date.UTC(2026, 10, 18, 15, 32) && alt(sDay.sunset - 60_000) > -0.833 && alt(sDay.sunset) <= -0.833
  && !sNight.up && Math.abs(sNight.sunset - sDay.sunset) <= 60_000 && sNight.sunrise > Date.UTC(2026, 10, 19, 6, 40) && sNight.sunrise < Date.UTC(2026, 10, 19, 7, 20),
  `Untergang ${hmUtc(sDay.sunset)} UTC · Aufgang ${hmUtc(sNight.sunrise)} UTC`);
const lDay = P.sunLine(noon, sDay), lNight = P.sunLine(eve, sNight);
add('F2 Satz zur Rückkehr: „… vor Sonnenuntergang (16:xx Uhr)“ bzw. „… nach Sonnenuntergang …, also bei Dunkelheit“; ohne Untergang in 24 h sagt der Satz das',
  /^Rückkehr 3 h( \d+ min)? vor Sonnenuntergang \(16:\d\d Uhr\)\.$/.test(lDay) && /^Rückkehr 4 h( \d+ min)? nach Sonnenuntergang \(Mi 16:\d\d Uhr\), also bei Dunkelheit\. Sonnenaufgang Do 0[78]:\d\d Uhr\.$/.test(lNight)
  && P.sunLine(noon, { up: true, sunset: null, sunrise: null }) === 'Sonnenuntergang um die Rückkehr nicht bestimmbar.', `${lDay} | ${lNight}`);

// --- G: words --------------------------------------------------------------------------------------------------------
const texts = [];
for (const [id, d] of [[SPO, doc], [FEH, pOld], [WAR, pOld]]) {
  const sp = spotOf(id), all = hoursOf(d, id, 0);
  for (const [s, e] of [[11, 22], [11, 39], [0, 3], [2, 6], [46, 50], [30, 78]]) for (const lim of [kite, jolle, sup, { windMax: null, gustMax: null }]) for (const unit of ['kn', 'bft', 'kmh']) {
    const f = find(all, s, e, lim, sp.normal), sun = P.sunAround(tOf(e), sp.lat, sp.lon);
    texts.push(...P.planEvents(f, unit, sun.sunset, tOf(s), tOf(e)).map((x) => x.text), ...P.planSummary(f, unit, { windMaxKn: lim.windMax, gustMaxKn: lim.gustMax }), P.sunLine(tOf(e), sun), P.badgeText(all[s], unit));
  }
  texts.push(P.lineLabel(P.defaultBoat(ALL.spots.find((x) => x.id === id)), sp, all[20].windDir), P.lineLabel(sp, sp, 200), P.lineLabel(P.planDestination(sp, 40, 3), sp, null));
}
const consts = [P.PLAN_FOOTER, P.PLAN_LINE_NOTE, P.PLAN_RADIUS_NOTE, P.PLAN_HOURLY_NOTE, P.PLAN_DRIFT_NOTE, P.PLAN_TIDAL_NOTE, P.PLAN_MOVED_NOTE, P.PLAN_CUT_NOTE, P.PLAN_ASK_SPOT, P.PLAN_COLOUR_NOTE,
  ...Object.values(P.REL_LABEL), ...Object.values(P.DRIFT_SIDE_LABEL)];
const every = [...new Set([...texts, ...consts])];
const banned = /%|Prozent|\bsicher|\bunsicher|Ampel|von 10\b|Lagen\b/i;
const driftNumber = /(treib|drift|abdrift|versetz)[^.]*\d/i;
// A distance to the shore = a length next to "Ufer"/"Wasserkante" (a bare direction such as "längs des Ufers" is none).
const shoreDist = /\d\s*(km|m)\b[^.]*\b(Ufer|Wasserkante)|\b(Ufer|Wasserkante)[^.]*\d\s*(km|m)\b|Uferabstand|Abstand[^.]*Ufer|Entfernung[^.]*Ufer/i;
add('G1 Wortlaut auf echten Fenstern: kein „sicher“/„unsicher“, kein Prozent, keine Anteile „von 10“ für ein Fenster — Gegenprobe: das Muster trifft „80 %“, „ist sicher“, „unsicher“, „in 3 von 10 Lagen“',
  every.length > 60 && every.every((w) => !banned.test(w)) && banned.test('80 %') && banned.test('ist sicher') && banned.test('unsicher') && banned.test('in etwa 3 von 10 vergleichbaren Lagen') && !banned.test('Die Versicherung'),
  `${every.length} Texte · ${every.filter((w) => banned.test(w)).slice(0, 2).join(' | ')}`);
add('G2 keine Drift-Strecke und keine Drift-Zeit, kein Abstand zum Ufer in irgendeinem Text — Gegenprobe: die Muster treffen „treibt 2 km“ und „1,2 km zum Ufer“; die Linie nennt den Startort',
  every.every((w) => !driftNumber.test(w) && !shoreDist.test(w)) && driftNumber.test('Das Boot treibt 2 km ab') && shoreDist.test('1,2 km zum Ufer') && shoreDist.test('Abstand zum Ufer') && !shoreDist.test(P.DRIFT_SIDE_LABEL.quer) && texts.filter((w) => /zum Startort/.test(w)).length >= 9
  && !Object.keys(P).some((k) => /shoreDist|uferAbstand|driftKm|driftMin|driftSpeed|driftTime/i.test(k)), every.filter((w) => driftNumber.test(w) || shoreDist.test(w)).slice(0, 2).join(' | '));
add('G3 feste Sätze: Fuß „Amtliche Warnungen gehen vor.“; die Linie ist eine gerade Verbindung, kein Kurs; der Radius ist ein gesetzter Wert und nennt den Grund; Stundenwerte; Watt ohne Wasserkante',
  P.PLAN_FOOTER === 'Amtliche Warnungen gehen vor.' && /gerade Verbindung/.test(P.PLAN_LINE_NOTE) && /kein Kurs/.test(P.PLAN_LINE_NOTE) && P.PLAN_RADIUS_NOTE.includes(`${P.SEA_PLAN_RADIUS_KM} km`) && /gesetzter Wert/.test(P.PLAN_RADIUS_NOTE)
  && /am Spot gerechnet/.test(P.PLAN_RADIUS_NOTE) && /Stundenwerte/.test(P.PLAN_HOURLY_NOTE) && /nicht zur Wasserkante/.test(P.PLAN_TIDAL_NOTE) && /nur, wohin der Wind drückt/.test(P.PLAN_DRIFT_NOTE));
const ev = P.planEvents(f1, 'kn', sDay.sunset, tOf(11), tOf(22)), sm = P.planSummary(f1, 'kn', { windMaxKn: 28, gustMaxKn: 33 });
add('G4 Befunde 11–22 (Kite, kn) im Wortlaut: „Höchster Stundenwert im Fenster: Wind 22 kn“ in Stunde 20, „Böen über deiner Grenze ab … (Grenze 33 kn)“ in Stunde 21, nach der Zeit geordnet; fürs Fenster „Wind: kein Stundenwert im Fenster über deiner Grenze (28 kn).“',
  ev.some((x) => x.kind === 'maxWind' && x.t === tOf(20) && x.text === 'Höchster Stundenwert im Fenster: Wind 22 kn') && ev.some((x) => x.kind === 'maxGust' && x.t === tOf(21) && x.text === 'Höchster Stundenwert im Fenster: Böen 34 kn')
  && ev.some((x) => x.kind === 'overGust' && x.warn && /^Böen über deiner Grenze ab Mi 10:00 \(Grenze 33 kn\)$/.test(x.text)) && ev.every((x, i) => i === 0 || x.t >= ev[i - 1].t) && !ev.some((x) => x.kind === 'overWind')
  && sm.includes('Wind: kein Stundenwert im Fenster über deiner Grenze (28 kn).') && sm.includes('Uferwinkel: in keiner Stunde des Fensters ablandig oder schräg ablandig.') && sm.some((x) => /^Wind zum Start 13 kn aus S, zur Rückkehr 19 kn aus SW\. Der Wind dreht um 38° nach rechts\.$/.test(x)),
  ev.map((x) => `${x.at} ${x.kind}`).join(' · '));
const smOff = P.planSummary(fSh, 'kn', { windMaxKn: 28, gustMaxKn: 33 }), evOff = P.planEvents(fSh, 'kn', null, tOf(11), tOf(39));
add('G5 Uferwinkel im Wortlaut: „Erste Stunde schräg ablandig: Mi 17:00.“ und „Erste Stunde ablandig: Do 02:00.“; der Wechsel hängt an seiner Stunde und ist markiert; ein Fenster ohne Windwert sagt das',
  smOff.includes('Erste Stunde schräg ablandig: Mi 17:00.') && smOff.includes('Erste Stunde ablandig: Do 02:00.') && evOff.filter((x) => x.kind === 'shore').length === 7
  && evOff.find((x) => x.t === tOf(28)).warn && /schräg ablandig \(erste Stunde im Fenster\), davor sideshore/.test(evOff.find((x) => x.t === tOf(28)).text) && !evOff.find((x) => x.t === tOf(12)).warn
  && P.planSummary(fNone, 'kn', { windMaxKn: 28, gustMaxKn: 33 })[0] === 'Für keine Stunde des Fensters liegt ein Windwert vor.' && P.planSummary(fMiss, 'kn', {})[0].startsWith('2 von 5 Stunden des Fensters haben keinen Windwert.'),
  smOff.join(' | ').slice(0, 200));
add('G6 Strecke und Abzeichen: „unter 100 m“, „350 m“, „2,4 km“; Abzeichen „13 kn, Böen 23 kn, aus S“; ohne Windwert sagt es das',
  P.distText(0.04) === 'unter 100 m' && P.distText(0.349) === '350 m' && P.distText(2.44) === '2,4 km' && P.badgeText(hs[0], 'kn') === '13 kn, Böen 23 kn, aus S' && P.badgeText(all0[0], 'kn') === 'kein Windwert für diese Stunde' && P.badgeText(null, 'kn') === 'kein Windwert für diese Stunde'
  && /^3,0 km zum Startort, Wind (von vorn|schräg von vorn|von der Seite|schräg von hinten|von hinten)$/.test(P.lineLabel(P.planDestination(sp0, 40, 3), sp0, 200)) && P.lineLabel(P.planDestination(sp0, 40, 3), sp0, null) === '3,0 km zum Startort, Windrichtung fehlt');

// --- H: display without a browser ------------------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'sea-planner-'));
const out = join(tmp, 'bundle.mjs');
await build({
  stdin: { resolveDir: ROOT, loader: 'ts', contents: `
    export { default as SeaBand } from './src/sea/SeaBand.tsx';
    export { default as SeaPlanPanel, OrtSpotStep, OrtTimeStep, PlanOfficial } from './src/sea/SeaPlanPanel.tsx';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  ` },
  bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: out, logLevel: 'silent', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { SeaBand, SeaPlanPanel, OrtSpotStep, OrtTimeStep, PlanOfficial, createElement: h, renderToStaticMarkup: html } = await import(pathToFileURL(out).href);
const bandHours = hs.slice(0, 40).map((x) => ({ ...x, hs: 0.4, dir: 250, tm: 3.1, cls: 'passt', reason: 'x', daylight: true }));
const base = { unit: 'kn', selected: 3, onPick: () => {}, title: 'St. Peter-Ording', sub: 'x', footnote: 'y', hours: bandHours };
const plain = html(h(SeaBand, base));
const withPlan = html(h(SeaBand, { ...base, plan: { start: 4, end: 9, onChange: () => {} } }));
const count = (s, re) => (s.match(re) ?? []).length;
add('H1 Stundenband ohne Planer: keine Zeile „Fenster“, keine Klasse dieser Phase (Byte-Gleichheit mit HEAD prüft verify:sea-wind-band E1)',
  plain.length > 5000 && !/sw-band-planrow|is-plan|data-ph|sw-pl-|Fenster/.test(plain));
add('H2 mit Planer: eine Zeile „Fenster“ mit einer Zelle je Stunde, genau zwei Griffe (Start, Rückkehr) mit Namen und Uhrzeit, die Stunden dazwischen markiert; Griffe als Tasten bedienbar',
  count(withPlan, /data-ph="/g) === 40 && count(withPlan, /data-grip="start"/g) === 1 && count(withPlan, /data-grip="end"/g) === 1 && count(withPlan, /<td data-ph="\d+" class="[^"]* is-in/g) === 6
  && /aria-label="Start \S+ \d\d Uhr\. Ziehen oder mit den Pfeiltasten verschieben\."/.test(withPlan) && /aria-label="Rückkehr /.test(withPlan) && />Fenster<\/th>/.test(withPlan) && withPlan !== plain,
  `${count(withPlan, /is-in/g)} Zellen im Fenster`);
const touch = html(h(SeaBand, { ...base, compact: true, plan: { start: 4, end: 9, onChange: () => {}, touch: true } }));
add('H2b mobil (zwei Griffe): die Zeile trägt `is-touch`, dieselben zwei Griffe', /sw-band-planrow is-touch/.test(touch) && count(touch, /data-grip=/g) === 2 && !/sw-band-planrow is-touch/.test(withPlan));
const card = (when) => ({ when, wind: '13 kn, Böen 23 kn, aus S', lines: ['Uferwinkel: schräg auflandig (Wind von See)'], color: '#8DB07A', canEarlier: true, canLater: true });
const panelProps = {
  spotName: 'St. Peter-Ording', when: 'Mi 00:00 bis Mi 11:00', profileLabel: 'Kite', noData: null, official: null, start: card('Mi 00:00'), ret: card('Mi 11:00'),
  events: ev, summary: sm, notes: [P.PLAN_LINE_NOTE, P.PLAN_RADIUS_NOTE, P.PLAN_DRIFT_NOTE, P.PLAN_HOURLY_NOTE], moved: null, now: 'Karte zeigt Mi 03:00', onClose: () => {},
};
const panel = html(h(SeaPlanPanel, panelProps));
add('H3 Befunde (rechte Spalte, AM-O): Kopf mit Startort, Zeit und Profil; zwei Karten „Start“ und „Rückkehr“ an den Enden der Schiene, die Befunde dazwischen in der Reihenfolge der Zeit, darunter „Im ganzen Fenster“, die Hinweise (offen, nicht eingeklappt) und der Fuß — und NICHTS, was man einstellt: keine Profile, kein Umschalter, kein Schrittschalter, kein „Spot wechseln“',
  panel.indexOf('>Start</h3>') > 0 && panel.indexOf('>Start</h3>') < panel.indexOf('Höchster Stundenwert im Fenster: Wind 22 kn') && panel.indexOf('Höchster Stundenwert im Fenster: Wind 22 kn') < panel.indexOf('>Rückkehr</h3>')
  && panel.indexOf('>Rückkehr</h3>') < panel.indexOf('Im ganzen Fenster') && panel.includes(P.PLAN_LINE_NOTE) && panel.includes(P.PLAN_RADIUS_NOTE) && panel.trimEnd().endsWith(`${P.PLAN_FOOTER}</p></section>`)
  && count(panel, /class="sw-pl-ev/g) === ev.length && !banned.test(panel.replace(/<[^>]+>/g, ' '))
  && panel.includes('<h2>St. Peter-Ording</h2><p>Mi 00:00 bis Mi 11:00 · Kite</p>') && panel.indexOf('<h2>') < panel.indexOf('>Start</h3>') && !/sw-pl-step|sw-profiles|sw-am-mode|Spot wechseln|<details|sw-pl-play/.test(panel)
  && count(panel, /<button/g) === 1 && /aria-label="Planer schließen"/.test(panel) && html(h(SeaPlanPanel, { ...panelProps, when: null })).includes('<h2>St. Peter-Ording</h2><p>Kite</p>')
  // AM-W: inside the assistant the findings carry no button of their own — its head closes the planner.
  && count(html(h(SeaPlanPanel, { ...panelProps, onClose: undefined })), /<button/g) === 0);
const official = html(h(SeaPlanPanel, { ...panelProps, official: { why: 'Für dein Gebiet liegt eine Meldung vor.', texts: [{ head: 'Seegebiet GERMAN BIGHT (WODL45, englischer Teil):', text: 'N to NW 7 later. ' }] } }));
const none = html(h(SeaPlanPanel, { ...panelProps, noData: 'Kein geprüfter Seegangslauf der letzten 24 Stunden veröffentlicht.', start: null, ret: null }));
add('H4 amtliche Meldung im Wortlaut ÜBER den Karten; ohne Daten kein Fenster, keine Karte — der Fuß bleibt',
  official.indexOf('N to NW 7 later. ') > 0 && official.indexOf('N to NW 7 later. ') < official.indexOf('>Start</h3>') && official.includes('Bitte zuerst lesen') && !panel.includes('sw-pl-official')
  && none.includes('Kein Fenster planbar') && !none.includes('sw-pl-rail') && none.includes(P.PLAN_FOOTER)
  && html(h(PlanOfficial, { why: 'Für dein Gebiet liegt eine Meldung vor.', texts: [{ head: 'Seegebiet GERMAN BIGHT (WODL45, englischer Teil):', text: 'N to NW 7 later. ' }] })) === official.slice(official.indexOf('<div class="sw-pl-official"'), official.indexOf('</div>', official.indexOf('<div class="sw-pl-official"')) + 6));
// AM-W (`audit/seewetter-ausfahrt.md` §13): what one sets for „Vor Ort“ is two pages of the assistant.
const timeProps = {
  start: { when: 'Mi 00:00', canEarlier: false, canLater: true }, ret: { when: 'Mi 11:00', canEarlier: true, canLater: true },
  onShift: () => {}, hours: '11 Stunden', moved: null,
};
const timeStep = html(h(OrtTimeStep, timeProps)), timeNone = html(h(OrtTimeStep, { ...timeProps, start: null, ret: null, hours: null }));
const timeOrder = ['>Fenster</h3>', '<dt>Start</dt>', '<dt>Rückkehr</dt>', '<dt>Länge</dt><dd>11 Stunden</dd>', WZ.WIZ_BAND_NOTE];
add('H11 Seite „Zeitfenster“ (AM-W): Start und Rückkehr je mit Schrittschalter (früher / später, benannt; was nicht geht, ist gesperrt), die Länge des Fensters, der Hinweis auf die zwei Griffe im Stundenband — und nichts von einer anderen Seite: kein Profil, keine Art der Ausfahrt, kein Spot, keine Grenzen, kein Befund; ohne Fenster kein Schrittschalter; ein verschobenes Fenster wird gesagt',
  timeOrder.every((x, i) => timeStep.includes(x) && (i === 0 || timeStep.indexOf(timeOrder[i - 1]) < timeStep.indexOf(x))) && count(timeStep, /class="sw-pl-step"/g) === 2
  && /<dd class="sw-pl-when"><time>Mi 00:00<\/time><span class="sw-pl-step" role="group" aria-label="Start verschieben"><button type="button" disabled="" aria-label="Start eine Stunde früher">/.test(timeStep)
  && /aria-label="Start eine Stunde später"/.test(timeStep) && /<time>Mi 11:00<\/time><span class="sw-pl-step" role="group" aria-label="Rückkehr verschieben"><button type="button" aria-label="Rückkehr eine Stunde früher">/.test(timeStep)
  && count(timeStep, /disabled=""/g) === 1 && !/Wer fährt|Art der Ausfahrt|Startort|Deine Grenzen|sw-pl-rail|sw-pl-end|sw-pl-official|Im ganzen Fenster|sw-pl-foot/.test(timeStep) && !banned.test(timeStep.replace(/<[^>]+>/g, ' '))
  && /Stundenband/.test(WZ.WIZ_BAND_NOTE) && /Boot/.test(WZ.WIZ_BOAT_NOTE) && timeNone.includes('Gerade steht kein Fenster auf den Stunden der Vorhersage.') && !/sw-pl-step|Fenster abspielen/.test(timeNone)
  && html(h(OrtTimeStep, { ...timeProps, moved: P.PLAN_MOVED_NOTE })).includes(P.PLAN_MOVED_NOTE) && !timeStep.includes('sw-pl-moved'));
// The component called as a function: its element tree carries the handlers, so a stepper wired to the wrong end shows.
const calls = [], tree = OrtTimeStep({ ...timeProps, onShift: (which, by) => calls.push(`${which}${by}`) });
const walk = (el, out = []) => { if (Array.isArray(el)) el.forEach((x) => walk(x, out)); else if (el && typeof el === 'object' && el.props) { out.push(el); walk(el.props.children, out); } return out; };
const els = walk(tree), stepOf = (label) => els.find((e) => e.props.label === label && typeof e.props.onShift === 'function');
stepOf('Start')?.props.onShift(1); stepOf('Rückkehr')?.props.onShift(-1);
add('H11b die Schrittschalter greifen am richtigen Ende: „Start später“ verschiebt den Start um +1, „Rückkehr früher“ das Ende um −1 (nicht umgekehrt); der Schalter „Rückkehr“ trägt die Sperren der Rückkehr, nicht die des Starts',
  calls.join() === 'start1,end-1' && stepOf('Start').props.canEarlier === false && stepOf('Start').props.canLater === true && stepOf('Rückkehr').props.canEarlier === true, calls.join());
const spotProps = { spotName: 'St. Peter-Ording', boat: '2,0 km', picker: h('div', { className: 'sw-dock-picker' }, 'Liste'), onOpenPicker: null };
const spotStep = html(h(OrtSpotStep, spotProps)), asking = html(h(OrtSpotStep, { ...spotProps, spotName: null, boat: null }));
const phoneCalls = [];
walk(OrtSpotStep({ spotName: null, boat: null, onOpenPicker: () => phoneCalls.push('pick') })).find((e) => e.type === 'button')?.props.onClick();
const phoneAsk = html(h(OrtSpotStep, { spotName: null, boat: null, onOpenPicker: () => {} })), phoneSet = html(h(OrtSpotStep, { spotName: 'Juist', boat: '850 m', onOpenPicker: () => {} }));
const sketchOf = (s) => [...(s.match(/<ol class="sw-wz-sketch"[\s\S]*?<\/ol>/)?.[0] ?? '').matchAll(/<li class="is-(\w+)"[\s\S]*?<strong>([^<]+)<\/strong>/g)].map((m) => `${m[2]}:${m[1]}`).join();
add('H12 Seite „Startort“ (AM-W, gekürzt Jan 19.11.): mit Spot EINE Karte, die nur den Startort mit Haken und Namen nennt (kein Boot-Satz, kein „Weiter“, kein eingeklappter Radius), darunter die Skizze in zwei Bildern (Spot antippen erledigt, Boot ziehen dran; der Radius steht als „≤ 5 km“ im Bild) und der Knopf „Anderen Spot wählen“ (die Liste klappt erst darauf auf); ohne Spot (E-AM-28) keine Karte, die Skizze mit „Spot antippen“ als dem, was dran ist — die Seite beginnt mit der Liste (Desktop) bzw. mit dem Knopf „Spot wählen“ (Telefon), der die Liste öffnet; mit Spot heißt er „Spot wechseln“; nichts von einer anderen Seite',
  spotStep.includes('<b>St. Peter-Ording</b>') && !/vor dem Startort|Zieh es auf der Karte|Warum höchstens|Dann legst du fest/.test(spotStep)
  && sketchOf(spotStep) === 'Spot antippen:done,Boot ziehen:now' && sketchOf(asking) === 'Spot antippen:now,Boot ziehen:next' && spotStep.includes(`≤ ${P.SEA_PLAN_RADIUS_KM} km</text>`) && !asking.includes('sw-wz-guidebox')
  && spotStep.indexOf('St. Peter-Ording') < spotStep.indexOf('sw-wz-sketch') && spotStep.indexOf('sw-wz-sketch') < spotStep.indexOf('Anderen Spot wählen') && spotStep.includes('>Anderen Spot wählen</button>') && !spotStep.includes('sw-dock-picker')
  && !/vor dem Startort|sw-am-box|Warum höchstens/.test(asking) && asking.includes('>Spot wählen</h3>') && asking.includes('sw-dock-picker')
  && phoneCalls.join() === 'pick' && phoneAsk.includes('>Spot wählen</button>') && !phoneAsk.includes('sw-am-box') && phoneSet.includes('>Spot wechseln</button>') && phoneSet.includes('<b>Juist</b>') && !/vor dem Startort/.test(phoneSet) && !phoneSet.includes('sw-dock-picker')
  && !/Wer fährt|Art der Ausfahrt|Deine Grenzen|sw-pl-step|Fenster abspielen|sw-pl-rail/.test(spotStep + asking + phoneAsk + phoneSet) && !banned.test((spotStep + asking + phoneAsk).replace(/<[^>]+>/g, ' ')));
const src = (f) => readFileSync(join(ROOT, 'src', 'sea', f), 'utf8');
const page = src('SeaPage.tsx'), lib = src('seaPlanner.ts'), mapSrc = src('SeaMap.tsx'), css = src('seaDeck.css');
add('H5 Einstiege: Knopf „Ausfahrt planen“ über der Legende in `sw-ov-right` und vierter Eintrag „Ausfahrt“ der unteren Leiste — beide ohne `disabled`; ohne gewählten Spot fragt der Planer zuerst nach dem Spot',
  /<button type="button" className="sw-pl-open" onClick=\{openPlanner\}>/.test(page) && /<div className="sw-ov-right">\{planBtn\}\{legend\}<\/div>/.test(page) && !/sw-pl-open[^>]*disabled/.test(page)
  // Since 22.11.2026 both entry points exist only while the planner is shown (`plannerOn`, H6) — where they are, unchanged.
  && /\.\.\.\(plannerOn \? \[\['plan', 'Ausfahrt', <path key="p"/.test(page) && /const planBtn = wizOpen \|\| !plannerOn \? null : \(/.test(page) && /if \(id === 'plan'\) \{ openPlanner\(\); return; \}/.test(page) && /if \(!spotInUrl \|\| !spot\) \{ setPlanAsk\(true\);/.test(page) && page.includes('{PLAN_ASK_SPOT}'));
const leftLine = (page.match(/\{wizard \? <aside className="sw-dock sw-am-dockin sw-wz-col" aria-label="Ausfahrt planen">\{wizard\}<\/aside> : dockOf\('layers'\)\}/) ?? [''])[0];
const wizLine = (page.match(/const wizard = wizOpen && step \? \([\s\S]*?\n  \) : null;/) ?? [''])[0];
add('H13 Seite (AM-W): links steht der Assistent, sobald der Planer offen ist ODER nach dem Spot fragt, sonst der Ebenen-Dock; die Ebenen klappen unter die Seite des Assistenten (nicht entfernt); rechts stehen die Befunde nur auf der Ergebnis-Seite; das Stundenband liegt am Kartenfuß, wo es die Eingabe ist (Zeitfenster) und im Ergebnis; mobil trägt das Blatt amtliche Meldung, Seite, Stundenwerte, Befunde in dieser Reihenfolge, und die Meldung steht dort nicht doppelt',
  leftLine.length > 0 && /const wizOpen = tripOpen \|\| planAsk;/.test(page)
  && /const layersFold = !isMobile && <details className="sw-am-layers"><summary>Ebenen der Karte<\/summary>\{dockOf\('layers'\)\}<\/details>;/.test(page) && count(page, /layersFold\}/g) === 1
  && /\{isMobile && step === 'ergebnis' && wizMode === 'ort' && planOfficial && <PlanOfficial \{\.\.\.planOfficial\} \/>\}\s*\{wizPage\}\s*\{isMobile \? <>\{footEl\}\{wizResult\}<\/> : layersFold\}/.test(wizLine) && /official=\{isMobile \? null : planOfficial\}/.test(page)
  && /const wizResult = step !== 'ergebnis' \? null : etappe \? etappeResult : strand \? strandPanel : planner;/.test(page) && /\{wizard \? wizResult && <aside className="sw-readout is-plan"/.test(page)
  && /: wizMode === 'ort' \? \(planOpen && \(step === 'zeit' \|\| step === 'ergebnis'\) \? 'band' : null\)/.test(page) && /const footEl = footKind === 'band' \? band : /.test(page)
  && /<div className=\{`sw-pl-dock\$\{footKind === 'band' \? '' : ' sw-am-foot'\}`\}>\s*<details className="sw-pl-legend"><summary>Legende<\/summary>\{legend\}<\/details>\s*\{!inDossier && footEl\}/.test(page)
  && /spotName=\{own \? \(ownSpot \? `\$\{OWN_NAME\} · \$\{ownPosText\(own\)\}` : null\) : planOpen && spot \? spot\.name : null\}/.test(page) && /start=\{planOpen \? planStart : null\} ret=\{planOpen \? planRet : null\}/.test(page)
  && count(page, /<OrtSpotStep /g) === 1 && count(page, /<OrtTimeStep /g) === 1 && count(page, /<SeaPlanPanel /g) === 1 && !/<SeaPlanPanel [^>]*on(Mode|Profile|Close)/.test(page), [leftLine.length, wizLine.length].join(','));
// Jan, 22.11.2026: „den Button … ausblenden, ich möchte das Feature erst noch weiterentwickeln“ — until then the planner had no
// switch at all (Jan's decision of 18.11.). Hidden for everyone, shown with `?planer=1`; nothing of it is removed.
{
  const F = await import('../src/sea/seaFlag.ts');
  const S = await import('../src/sea/seaState.ts');
  const withPlan = { ...S.SEA_DEFAULT_STATE, t: 3, pl: 'a', et: 'b', sd: 'c', ps: 'd' }, bare = { ...S.SEA_DEFAULT_STATE, t: 3 };
  const cut = S.seaWithoutPlanner(withPlan);
  add('H6 der Planer ist ausgeblendet (Jan 22.11.): ab Werk aus, `?planer=1` zeigt ihn, `?planer=0` blendet ihn auch nach dem Einschalten aus; ohne ihn liest die Seite keinen Plan aus dem Link (pl, et, sd, ps), alles andere bleibt; beide Einstiege hängen an diesem einen Schalter',
    F.SEA_PLANNER_LIVE === false && F.seaPlannerFrom('') === false && F.seaPlannerFrom('?planer=1') === true && F.seaPlannerFrom('?l=ws&planer=1') === true && F.seaPlannerFrom('?planer=ja') === false
    && F.seaPlannerFrom('', true) === true && F.seaPlannerFrom('?planer=0', true) === false
    && cut.pl === null && cut.et === null && cut.sd === null && cut.ps === null && cut.t === 3 && cut.l === withPlan.l && S.seaWithoutPlanner(bare) === bare && withPlan.pl === 'a'
    && /const plannerOn = useMemo\(\(\) => seaPlannerFrom\(\), \[\]\);/.test(page)
    && /const initial = useMemo\(\(\) => \(plannerOn \? initialIn : seaWithoutPlanner\(initialIn\)\), \[plannerOn, initialIn\]\);/.test(page)
    && /const popState = useMemo\(\(\) => \(plannerOn \|\| !popIn \? popIn : seaWithoutPlanner\(popIn\)\), \[plannerOn, popIn\]\);/.test(page)
    // Three mentions of `openPlanner`: its definition and the two entry points — no third way in.
    && (page.match(/openPlanner/g) ?? []).length === 3 && /const planBtn = wizOpen \|\| !plannerOn \? null : \(/.test(page) && /\.\.\.\(plannerOn \? \[\['plan', 'Ausfahrt',/.test(page));
}
const reads = /windBand|gustQ|windQ|quantiles|q10|q90|overLimit/;
add('H7 die Befunde fürs Fenster lesen die Anteile „über Grenze“ nie (seaPlanner.ts kennt keine Quantile) — Gegenprobe: die Seite liest sie, und im Planer nur für EINE Stunde („Nur diese Stunde: …“)',
  !reads.test(lib) && reads.test(page) && /lines\.push\(`Nur diese Stunde: \$\{overSentence\(o, limits\.gustMax\)\}`\)/.test(page) && !/gustOverLimit\([^)]*(win|plan)/i.test(page));
add('H8 Watt: der Hinweis steht nur an Spots mit `tidal` (7 von 56 im Katalog); Wasserstand zur Rückkehr nur mit Pegelkurve',
  /\.\.\.\(spot\.tidal \? \[PLAN_TIDAL_NOTE\] : \[\]\)/.test(page) && ALL.spots.filter((s) => s.tidal).length === 7 && /if \(isReturn && tideDoc && tideDoc\.curve\.length > 0\)/.test(page));
add('H9 Karte: Boot als ziehbarer MapLibre-Marker, im Radius gehalten; Linie und Ring als Linien-Ebenen — keine eigene GL-Ebene, kein Shader',
  /new maplibregl\.Marker\(\{ element: boatEl, draggable: true/.test(mapSrc) && /clampToRadius\(pl\.launch/.test(mapSrc) && count(mapSrc, /id: 'sw-plan-[a-z-]+', type: 'line'/g) === 3
  && !/type: 'custom'|getContext\('webgl|gl_Position/.test(mapSrc + lib));
const mq = '@media (max-width: 767px), (max-width: 1439px) and (pointer: coarse) {';
const lastMq = css.slice(css.lastIndexOf(mq));
const used = ['sw-pl-open', 'sw-pl-boat', 'sw-pl-drift', 'sw-pl-hull', 'sw-pl-linelabel', 'sw-pl-launch', 'sw-pl-dock', 'sw-pl-legend', 'sw-band-planrow', 'sw-pl-grip', 'sw-pl-span', 'sw-pl-head', 'sw-pl-close',
  'sw-pl-official', 'sw-pl-when', 'sw-pl-now', 'sw-pl-moved', 'sw-pl-rail', 'sw-pl-end', 'sw-pl-knot', 'sw-pl-step', 'sw-pl-ev', 'sw-pl-block', 'sw-pl-foot', 'sw-pl-ask', 'sw-pl-sheet', 'sw-pl-sheetgrip'];
add('H10 CSS: jede Klasse des Markups ist definiert; das Blatt gibt es nur in der Media Query der Seite (außerhalb `display: none`); die Bewegung der Pfeile ruht unter „reduzierte Bewegung“',
  used.every((c) => css.includes(`.${c}`)) && /\n\.sw-pl-sheet \{ display: none; \}/.test(css) && /\.sw-pl-sheet \{ display: flex;/.test(lastMq) && !/\.sw-pl-sheet \{ display: flex;/.test(css.slice(0, css.lastIndexOf(mq)))
  && /@media \(prefers-reduced-motion: reduce\) \{\s*\.sw-pl-drift path \{ animation: none;/.test(css), used.filter((c) => !css.includes(`.${c}`)).join(','));

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail.slice(0, 260)}]` : ''}`);
console.log(`\nverify:sea-planner — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
