/**
 * verify-cell-places.mjs — Phase ZO (`audit/zell-orte.md`): „Betroffene Orte und Ankunftsfenster" je KONRAD3D-Zelle.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-cell-places.mjs
 *
 * A Ortsliste: Datei = Ausgabe von build-cell-places.mjs (ab 5 000 Ew.), Parser verwirft kaputte Zeilen, Schalter `?zo=0`.
 * B Geometrie: `nearEllipse` mit r = 0 ≡ `pointInEllipse` (cellPolygons.ts) an Zufallspunkten; mit r > 0 = Abstand zur
 *   Ellipse ≤ r (Gegenprobe gegen dichte Abtastung); vergrößerte Ellipse ist hinreichend, nie zu viel.
 * C Konstruierte Zelle (Bahn nach Osten, r = 2 km): Ort auf der Bahn = Kern, 6 km daneben = Rand, 40 km daneben = nichts,
 *   im Umriss = „jetzt"; Fenster auf 5 min, Anfang < Ende ≤ 60, Rand-Fenster ⊇ Kern-Lage; Gegenprobe ohne Ellipse ⇒ nichts.
 * D Echte Läufe (Fixture 08/2026 + 07.10./08.10.2026): je Zelle ≤ 12 Zeilen, nach Zeit sortiert, gezählter Rest stimmt,
 *   Fenster im 5-min-Raster, vergangene Fenster fehlen, der gewählte Ort steht immer drin, wenn er betroffen ist.
 * E Satz zum Ort: Kern „voraussichtlich", Rand „streifen", Vorbeizug in km mit Uhrzeit, keine Zelle, leerer Lauf, keine
 *   Zellerkennung (Wien/Graz/Lugano außerhalb, München/Salzburg/Innsbruck/Zürich innerhalb).
 * F Wortsperre D-19 über alle erzeugten Sätze: nie „Warnung", „Gefahr", „Unwetter", „trifft", „Tornado".
 * G buscosun Fusion: P(≥ 5 mm) = exceedance derselben Verteilung, Böe ≥ 60 km/h in m/s, Lücke = null (nie 0),
 *   interpolierte Schritte zählen nie; nur Typen aus dem Motor importiert.
 * H Verdrahtung: cellPolygons.ts, MapView.tsx und der Motor unverändert gegen HEAD; Ortsliste lazy (`?url`), Schalter
 *   gelesen; Leiste ohne Schalter wie vorher (`cellRelevanceText`).
 */
process.env.TZ = 'Europe/Berlin';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseKonrad3d } from '../src/radar/konrad3d.ts';
import { pointInEllipse } from '../src/radar/cellPolygons.ts';
import {
  parseCellPlaces, cellPlacesEnabledFrom, nearEllipse, prepareCell, cellPassAt, cellPlaceList, cellPlaceVerdict,
  cellPlaceSentence, inKonradReach, windowText, windowBand, cellChoiceOrder, CELL_PLACES_MAX_ROWS,
} from '../src/radar/cellPlaces.ts';
import { cellFusionHint, arrivalHour, CELL_FUSION_GUST_KMH } from '../src/nowcast/cellFusionHint.ts';
import { exceedance } from '../src/pointForecast/fusion/dist.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function add(name, ok, detail = '') {
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const MIN = 60_000;
const KM_LAT = 110.57, KM_LON = 111.32;

// ---------------------------------------------------------------------------- A
{
  const raw = JSON.parse(read('src/radar/cellPlacesDach.json'));
  const places = parseCellPlaces(raw);
  let built = '';
  try { built = execFileSync(process.execPath, [join(ROOT, 'scripts/build-cell-places.mjs'), '--check'], { encoding: 'utf8' }); } catch { built = ''; }
  add('A1 Ortsliste = Ausgabe von build-cell-places.mjs (aus public/fire/places-dach.json)', /up to date/.test(built), built.trim());
  add('A2 nur Orte ab 5 000 Ew., DE/AT/CH, alle Zeilen gelesen', places.length === raw.places.length && places.length > 3000
    && places.every((p) => p.pop >= 5000 && ['DE', 'AT', 'CH'].includes(p.cc)), `${places.length} Orte`);
  add('A3 Parser verwirft kaputte Zeilen', parseCellPlaces({ places: [[1, 2, 'x', 'DE', 9000], [1, 2, 3, 'DE', 9000], [1, 2, 'y', 'IT', 9000], 'z'] }).length === 1
    && parseCellPlaces(null).length === 0);
  add('A4 Schalter: an ohne Angabe, aus nur mit ?zo=0', cellPlacesEnabledFrom('') && cellPlacesEnabledFrom('?zo=1') && !cellPlacesEnabledFrom('?zo=0') && cellPlacesEnabledFrom('?rc=1&zo=2'));
}

// ---------------------------------------------------------------------------- B
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let same = 0, n = 0, mink = 0, minkN = 0, suff = true;
  for (let k = 0; k < 400; k++) {
    const lat = 47 + rnd() * 6, lon = 6 + rnd() * 10;
    const maj = 2 + rnd() * 40, min = 1 + rnd() * maj, ang = rnd() * 360, r = rnd() * 5;
    const cos = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
    for (let j = 0; j < 10; j++) {
      const ex = (rnd() - 0.5) * 2 * (maj / 2 + 8), ny = (rnd() - 0.5) * 2 * (maj / 2 + 8);
      const tLon = lon + ex / (KM_LON * cos), tLat = lat + ny / KM_LAT;
      const a = Math.max(maj, min) / 2, b = Math.min(maj, min) / 2;
      n++;
      if (nearEllipse(ex, ny, 0, 0, a, b, ang, 0) === pointInEllipse([tLon, tLat], lon, lat, maj, min, ang)) same++;
      // Abstand zur gefüllten Ellipse, dicht abgetastet (Rand + innen = 0).
      const rot = (ang * Math.PI) / 180;
      const xe = ny * Math.cos(rot) + ex * Math.sin(rot), ye = -ny * Math.sin(rot) + ex * Math.cos(rot);
      let d = (xe / a) ** 2 + (ye / b) ** 2 <= 1 ? 0 : Infinity;
      if (d > 0) for (let i = 0; i < 4096; i++) { const t = (i / 4096) * 2 * Math.PI; d = Math.min(d, Math.hypot(xe - a * Math.cos(t), ye - b * Math.sin(t))); }
      if (Math.abs(d - r) > 0.08) { minkN++; if (nearEllipse(ex, ny, 0, 0, a, b, ang, r) === (d <= r)) mink++; }
      if ((xe / (a + r)) ** 2 + (ye / (b + r)) ** 2 <= 1 && d > r + 1e-9) suff = false;
    }
  }
  add('B1 nearEllipse(r = 0) ≡ pointInEllipse (dieselbe Drehung wie die gezeichnete Ellipse)', same === n, `${same}/${n}`);
  add('B2 nearEllipse(r) = „Abstand zur Ellipse ≤ r" (gegen 4 096-Punkt-Abtastung, ±80 m Grenzband ausgenommen)', mink === minkN, `${mink}/${minkN}`);
  add('B3 die um r vergrößerte Ellipse liegt ganz im Bereich „Abstand ≤ r" (hinreichend, nie zu viel)', suff);
}

// ---------------------------------------------------------------------------- C
// Konstruierte Zelle bei München: Bahn genau nach Osten mit 30 km/h, r = 2 km, Umriss = Kreis r, Ellipsen kreisrund,
// Durchmesser 2 km (+5) … 24 km (+60).
const REF = Date.UTC(2026, 9, 9, 12, 0, 0); // 14:00 Ortszeit (MESZ)
function synthCell({ id = 1, lat = 48.2, lon = 11.4, kmh = 30, ellipse = true, areaKm2 = Math.PI * 4 } = {}) {
  const cos = Math.cos((lat * Math.PI) / 180);
  const fc = [];
  for (let k = 1; k <= 12; k++) {
    const lead = k * 5, km = (kmh * lead) / 60, dia = 2 + (22 * (k - 1)) / 11;
    fc.push({ leadMin: lead, lon: lon + km / (KM_LON * cos), lat, majorKm: ellipse ? dia : null, minorKm: ellipse ? dia : null, ellipseAngleDeg: ellipse ? 90 : null });
  }
  const hull = [];
  for (let i = 0; i < 24; i++) { const t = (i / 24) * 2 * Math.PI; hull.push([lon + (2 * Math.cos(t)) / (KM_LON * cos), lat + (2 * Math.sin(t)) / KM_LAT]); }
  return { id, refMs: REF, lon, lat, hull, areaKm2, forecast: fc, severity: 1, severityDecimal: 1, speedKmh: kmh };
}
const at = (cell, eastKm, northKm) => {
  const cos = Math.cos((cell.lat * Math.PI) / 180);
  return { lat: cell.lat + northKm / KM_LAT, lon: cell.lon + eastKm / (KM_LON * cos) };
};
{
  const c = synthCell();
  const pc = prepareCell(c);
  const pOn = at(c, 15, 0), pSide = at(c, 15, 6), pFar = at(c, 15, 40), pIn = at(c, 0.5, 0.3);
  const on = cellPassAt(pc, pOn.lat, pOn.lon), side = cellPassAt(pc, pSide.lat, pSide.lon), far = cellPassAt(pc, pFar.lat, pFar.lon), inn = cellPassAt(pc, pIn.lat, pIn.lon);
  add('C1 Ort auf der Bahn (15 km östlich) = Kern, Fenster um +30 min', on?.kind === 'core' && on.fromLead <= 30 && on.toLead >= 30, JSON.stringify(on));
  add('C2 6 km neben der Bahn = Rand (Ellipse ⊕ Zellkörper erreicht ihn, Zellkörper allein nicht)', side?.kind === 'edge', JSON.stringify(side));
  add('C3 40 km neben der Bahn = nicht betroffen', far === null);
  add('C4 im gemessenen Umriss = „jetzt", Fenster ab 0', inn?.kind === 'now' && inn.fromLead === 0 && inn.toLead > 0, JSON.stringify(inn));
  const grid = [on, side, inn].every((p) => p && p.fromLead % 5 === 0 && p.toLead % 5 === 0 && p.fromLead < p.toLead && p.toLead <= 60);
  add('C5 Fenster im 5-min-Raster, Anfang < Ende ≤ +60', grid);
  add('C6 Rand-Fenster kürzer und später als ein Kern-Fenster gleicher Lage (die Ellipse wächst)', side.fromLead >= on.fromLead && side.toLead - side.fromLead <= on.toLead - on.fromLead);
  const noEll = prepareCell(synthCell({ ellipse: false }));
  add('C7 Gegenprobe: ohne amtliche Ellipse kein Fenster, keine Liste (D-04)', cellPassAt(noEll, pOn.lat, pOn.lon) === null && cellPlaceList(noEll, [], { nowMs: REF }).noEllipse);
  // Kern vs. Rand an der Grenze: r = 2 km ⇒ 1,9 km neben der Bahn Kern, 2,2 km Rand.
  const k19 = at(c, 20, 1.9), k22 = at(c, 20, 2.2);
  add('C8 Grenze Kern/Rand bei r = 2 km: 1,9 km Kern, 2,2 km Rand', cellPassAt(pc, k19.lat, k19.lon)?.kind === 'core' && cellPassAt(pc, k22.lat, k22.lon)?.kind === 'edge');
  // Zwischen zwei Stützstellen (2,5 km östlich von +5 = 2,5 km): wird nicht übersprungen.
  const mid = at(c, 3.75, 0);
  add('C9 Ort zwischen zwei Stützstellen fällt nicht durch (Interpolation auf 1 min)', cellPassAt(pc, mid.lat, mid.lon)?.kind === 'core');
  add('C10 Band auf der 60-min-Achse', JSON.stringify(windowBand({ fromLead: 15, toLead: 45 })) === '{"x0":0.25,"x1":0.75}');
  add('C11 Fenster als Uhrzeit, begonnenes Fenster „jetzt–…"', windowText(REF + 20 * MIN, REF + 35 * MIN, REF) === '14:20–14:35' && windowText(REF, REF + 35 * MIN, REF + MIN) === 'jetzt–14:35');
}

// ---------------------------------------------------------------------------- D
const PLACES = parseCellPlaces(JSON.parse(read('src/radar/cellPlacesDach.json')));
const RUNS = ['scripts/fixtures/konrad3d-sample.xml', 'scripts/fixtures/konrad3d-20261007T184500.xml', 'scripts/fixtures/konrad3d-20261008T143000.xml']
  .map((f) => parseKonrad3d(read(f), f.split('/').pop()));
const sentences = [];
{
  let lists = 0, rows = 0, sorted = true, capped = true, counted = true, gridOk = true, nonEmpty = 0, cores = 0, edges = 0, past = true;
  for (const run of RUNS) {
    const nowMs = run.refMs;
    for (const cell of run.cells) {
      const pc = prepareCell(cell);
      const full = cellPlaceList(pc, PLACES, { nowMs, maxRows: 10_000 });
      const l = cellPlaceList(pc, PLACES, { nowMs });
      lists++; rows += l.rows.length;
      if (l.rows.length) nonEmpty++;
      capped &&= l.rows.length <= CELL_PLACES_MAX_ROWS;
      counted &&= l.rows.length + l.hiddenCore + l.hiddenEdge === full.rows.length;
      for (let i = 1; i < l.rows.length; i++) sorted &&= l.rows[i - 1].fromMs <= l.rows[i].fromMs;
      for (const r of full.rows) {
        gridOk &&= r.fromLead % 5 === 0 && r.toLead % 5 === 0 && r.fromLead < r.toLead && r.toLead <= 60 && r.fromMs === cell.refMs + r.fromLead * MIN;
        if (r.kind === 'edge') edges++; else cores++;
      }
      // Kern-Orte haben Vorrang vor dem Rand, wenn gekürzt wird.
      if (l.hiddenCore > 0) counted &&= l.rows.every((r) => r.kind !== 'edge');
      // Zeit vergeht: 40 min nach der Messzeit fehlen alle Fenster, die vorher endeten.
      const later = cellPlaceList(pc, PLACES, { nowMs: cell.refMs + 40 * MIN, maxRows: 10_000 });
      past &&= later.rows.every((r) => r.toMs >= cell.refMs + 40 * MIN) && later.rows.length <= full.rows.length;
    }
  }
  add('D1 echte Läufe: Listen entstehen', nonEmpty >= 10, `${lists} Zellen, ${nonEmpty} mit Orten, ${rows} Zeilen, ${cores} Kern/jetzt · ${edges} Rand (ungekürzt)`);
  add('D2 höchstens 12 Zeilen je Zelle', capped);
  add('D3 Rest gezählt: Zeilen + weggelassene = alle betroffenen Orte; beim Kürzen Kern vor Rand', counted);
  add('D4 nach Fensterbeginn sortiert', sorted);
  add('D5 Fenster im 5-min-Raster ab Messzeit, Anfang < Ende ≤ +60', gridOk);
  add('D6 vergangene Fenster fallen weg', past);
  // Der gewählte Ort: ein kleiner Ort (nicht im Verzeichnis) auf der Bahn einer echten Zelle steht immer in der Liste.
  const run = RUNS[1];
  const cell = run.cells.find((c) => c.id === 57);
  const f6 = cell.forecast[5];
  const chosen = { name: 'Testdorf', lat: f6.lat, lon: f6.lon, cc: 'DE', pop: null };
  const lc = cellPlaceList(prepareCell(cell), PLACES, { nowMs: run.refMs, chosen, maxRows: 1 });
  add('D7 gewählter Ort steht immer drin, auch bei voller Liste', lc.rows.length === 1 && lc.rows[0].chosen && lc.rows[0].place.name === 'Testdorf');
  const big = cellPlaceList(prepareCell(cell), PLACES, { nowMs: run.refMs, maxRows: 10_000 }).rows[0];
  const dup = cellPlaceList(prepareCell(cell), PLACES, { nowMs: run.refMs, chosen: { ...big.place, pop: null }, maxRows: 10_000 });
  add('D8 gewählter Ort aus dem Verzeichnis wird markiert, nicht verdoppelt', dup.rows.filter((r) => r.place.name === big.place.name).length === 1 && dup.rows.find((r) => r.place.name === big.place.name).chosen);
  // Gegenprobe: ein Ort 200 km entfernt ist nie betroffen.
  add('D9 Gegenprobe: 200 km entfernt nie betroffen', cellPassAt(prepareCell(cell), cell.lat + 1.8, cell.lon) === null);
  const order = cellChoiceOrder(run, { kind: 'pass', cellId: 41, pass: {} });
  add('D10 Zellwahl: die Zelle des Orts zuerst, dann nach Schweregrad', order[0] === 41 && order.length === run.cells.length);
}

// ---------------------------------------------------------------------------- E
{
  const c = synthCell();
  const run = { refMs: REF, cells: [c] };
  const on = at(c, 15, 0), side = at(c, 15, 6), by = at(c, 15, 14), far = at(c, 15, 40);
  const vOn = cellPlaceVerdict(run, on.lat, on.lon, REF), vSide = cellPlaceVerdict(run, side.lat, side.lon, REF);
  const vBy = cellPlaceVerdict(run, by.lat, by.lon, REF), vFar = cellPlaceVerdict(run, far.lat, far.lon, REF);
  const s = (v, now = REF) => { const t = cellPlaceSentence(v, now); if (t) sentences.push(t); return t; };
  add('E1 Kern: „erreicht dich voraussichtlich HH:MM–HH:MM"', /^Zelle 1 erreicht dich voraussichtlich \d\d:\d\d–\d\d:\d\d\.$/.test(s(vOn)), s(vOn));
  add('E2 Rand: „kann dich HH:MM–HH:MM streifen"', vSide.kind === 'pass' && vSide.pass.kind === 'edge' && /^Zelle 1 kann dich \d\d:\d\d–\d\d:\d\d streifen\.$/.test(s(vSide)), s(vSide));
  add('E3 Vorbeizug 14 km (auf 5 km gerundet): „zieht etwa 15 km südlich vorbei (am nächsten gegen 14:30)"', vBy.kind === 'passby' && s(vBy) === 'Zelle 1 zieht etwa 15 km südlich vorbei (am nächsten gegen 14:30).', s(vBy));
  add('E4 weiter als 25 km: keine Zelle in der Nähe', vFar.kind === 'none' && /^Keine Zelle/.test(s(vFar)));
  // Gefunden im Browser (Köln, Lauf 07.10.): die Zelle war 3–4 km entfernt und zog schon weg — nie „keine Zelle".
  const behind = at(c, -1, 4);
  const vBehind = cellPlaceVerdict(run, behind.lat, behind.lon, REF + 8 * MIN);
  add('E4b nächster Punkt schon vorbei: „am nächsten jetzt", nicht „keine Zelle"', vBehind.kind === 'passby' && /am nächsten jetzt\)\.$/.test(s(vBehind, REF + 8 * MIN)), s(vBehind, REF + 8 * MIN));
  add('E5 leerer Lauf im Radarbereich: kein Satz (die Leiste nennt „keine Zellen erkannt")', cellPlaceVerdict({ refMs: REF, cells: [] }, 48.14, 11.58, REF).kind === 'empty' && cellPlaceSentence({ kind: 'empty' }, REF) === null);
  const wien = cellPlaceVerdict({ refMs: REF, cells: [] }, 48.21, 16.37, REF);
  add('E6 Wien: keine Zellerkennung, ausgesprochen', wien.kind === 'no-coverage' && /keine Zelldaten/.test(s(wien)), s(wien));
  const reach = { München: [48.14, 11.58], Salzburg: [47.8, 13.04], Innsbruck: [47.27, 11.39], Zürich: [47.37, 8.54], Basel: [47.56, 7.59] };
  const out = { Wien: [48.21, 16.37], Graz: [47.07, 15.44], Lugano: [46.0, 8.95], Genf: [46.2, 6.14], Klagenfurt: [46.62, 14.31] };
  add('E7 Reichweite der deutschen Radare: München/Salzburg/Innsbruck/Zürich/Basel ja', Object.values(reach).every(([la, lo]) => inKonradReach(la, lo)));
  add('E8 … Wien/Graz/Lugano/Genf/Klagenfurt nein', Object.values(out).every(([la, lo]) => !inKonradReach(la, lo)));
  const inn = at(c, 0.5, 0.3);
  const vNow = cellPlaceVerdict(run, inn.lat, inn.lon, REF);
  add('E9 unter der Zelle: „ist gerade über dir, laut amtlicher Bahn bis etwa …"', /^Zelle 1 ist gerade über dir, laut amtlicher Bahn bis etwa \d\d:\d\d\.$/.test(s(vNow)), s(vNow));
  // Früheste Zelle gewinnt; gleich früh: Kern vor Rand.
  const c2 = synthCell({ id: 2, lon: 11.4 + 6 / (KM_LON * Math.cos((48.2 * Math.PI) / 180)) });
  const v2 = cellPlaceVerdict({ refMs: REF, cells: [c, c2] }, on.lat, on.lon, REF);
  add('E10 zwei Zellen: die früher ankommende spricht', v2.kind === 'pass' && v2.cellId === 2, JSON.stringify(v2));
  // Alle echten Läufe an allen Orten der Liste.
  for (const r of RUNS) for (const p of PLACES.slice(0, 400)) s(cellPlaceVerdict(r, p.lat, p.lon, r.refMs), r.refMs);
}

// ---------------------------------------------------------------------------- F
{
  const banned = /warn|gefahr|unwetter|trifft|tornado/i;
  const bad = sentences.filter((t) => banned.test(t));
  add('F1 Wortsperre D-19 über alle erzeugten Sätze', bad.length === 0 && sentences.length > 400, `${sentences.length} Sätze${bad.length ? ` · z. B. ${bad[0]}` : ''}`);
  const card = read('src/nowcast/CellPlacesCard.tsx');
  const texts = [...card.matchAll(/>([^<>{}]{3,})</g)].map((m) => m[1]).join(' | ');
  add('F2 Karte der Orte: Hinweis statt Warnung, Fuß „keine Warnung · maßgeblich sind die DWD-Warnungen"',
    /Hinweis aus dem Radar, keine Warnung · maßgeblich sind die DWD-Warnungen/.test(card) && !/\b(Gefahr|Unwetter|trifft|Tornado)\b/i.test(texts));
}

// ---------------------------------------------------------------------------- G
{
  const H = 3_600_000;
  const t0 = Date.UTC(2026, 9, 9, 12, 0, 0);
  const hurdle = (pDry, med = 2) => ({ kind: 'hurdleLogNormal', pDry, mu: Math.log(med), sigma: 1.2 });
  const gustD = (mu) => ({ kind: 'normal', mu, sigma: 3 });
  const step = (tMs, dist, gust, o = {}) => ({
    validAtMs: tMs, leadH: 0, tier: 't1', interpolated: !!o.interp, flags: [],
    members: [{ product: 'cube-t1', tag: 't1' }],
    vars: {
      precip: o.interp ? { dist: null, calib: [], members: [] } : dist ? { dist, calib: [], members: [{ tag: 't1', weight: 1 }] } : null,
      gust: o.interp ? null : gust ? { dist: gust } : null,
    },
  });
  const v2 = { axis: { steps: [step(t0 + H, hurdle(0.3), gustD(15)), step(t0 + 1.5 * H, null, null, { interp: true }), step(t0 + 2 * H, hurdle(0.6, 6), gustD(18)), step(t0 + 3 * H, null, null)] } };
  const h1 = cellFusionHint(v2, arrivalHour(t0 + 20 * MIN, t0), exceedance);
  add('G1 P(≥ 5 mm) = exceedance derselben Verteilung, Schritt der Ankunftsstunde', h1.heavy && Math.abs(h1.heavy.p - exceedance(hurdle(0.3), 5)) < 1e-12 && h1.heavy.fromMs === t0 && h1.heavy.toMs === t0 + H);
  add('G2 Böe ≥ 60 km/h in m/s gerechnet (60/3,6), derselbe Schritt', h1.gust && Math.abs(h1.gust.p - exceedance(gustD(15), CELL_FUSION_GUST_KMH / 3.6)) < 1e-12 && h1.gust.toMs === t0 + H);
  const h2 = cellFusionHint(v2, arrivalHour(t0 + 70 * MIN, t0), exceedance);
  add('G3 interpolierter Schritt zählt nie — die Stunde 13–14 nimmt den nativen Schritt 14:00', h2.heavy && Math.abs(h2.heavy.p - exceedance(hurdle(0.6, 6), 5)) < 1e-12 && h2.gust && h2.gust.fromMs === t0 + H);
  const h3 = cellFusionHint(v2, arrivalHour(t0 + 130 * MIN, t0), exceedance);
  add('G4 ohne Verteilung = Lücke (null), nie 0 %', h3.heavy === null && h3.gust === null);
  add('G5 begonnenes Fenster ⇒ laufende Stunde', arrivalHour(t0 - 30 * MIN, t0 + 10 * MIN).fromMs === t0);
  const hint = read('src/nowcast/cellFusionHint.ts');
  add('G6 nur Typen aus dem Motor importiert (buscosun Fusion wird nur gelesen)', !/^import (?!type)[^;]*pointForecast\/fusion\//m.test(hint));
}

// ---------------------------------------------------------------------------- H
{
  const unchanged = (p) => { try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', p], { cwd: ROOT }); return true; } catch { return false; } };
  add('H1 cellPolygons.ts, cellLayers.ts, konrad3d.ts unverändert gegen HEAD', unchanged('src/radar/cellPolygons.ts') && unchanged('src/radar/cellLayers.ts') && unchanged('src/radar/konrad3d.ts'));
  add('H2 MapView.tsx unverändert gegen HEAD', unchanged('src/MapView.tsx'));
  add('H3 buscosun Fusion unverändert gegen HEAD (src/pointForecast/fusion)', unchanged('src/pointForecast/fusion'));
  const hook = read('src/nowcast/useCellPlaces.ts');
  add('H4 Ortsliste lazy als gehashtes Asset (`?url`), nur bei Zellen geladen', /cellPlacesDach\.json\?url/.test(hook) && /import\('\.\.\/radar\/cellPlacesDach\.json\?url'\)/.test(hook));
  const map = read('src/nowcast/NowcastRadarMap.tsx');
  add('H5 Leiste: ohne Schalter der Satz von vorher (`cellRelevanceText`), mit Schalter der neue', /cellRelevanceText\(cellRel\)/.test(map) && /cellPlaceSentence\(/.test(map) && /cellPlacesEnabledFrom\(/.test(map));
  const deck = read('src/nowcast/NowcastDeck.tsx');
  add('H6 Readout (Desktop) und Schnellblick (mobil) zeigen die Karte nur mit Schalter', (deck.match(/<CellPlacesCard /g) || []).length === 2 && /cellPlacesEnabledFrom\(/.test(deck));
  const card = read('src/nowcast/CellPlacesCard.tsx');
  add('H7 außerhalb der Radarreichweite nur der Satz (keine Liste, keine Haltestellen), außer die Zelle wurde angetippt',
    /zo\.verdict\.kind === 'no-coverage' && !zo\.picked/.test(card) && /zoQuiet = zo\.verdict\?\.kind === 'no-coverage' && !zo\.picked/.test(deck) && /zo\.list && !zoQuiet/.test(deck));
}

console.log(`\n${fail === 0 ? '✓' : '✗'} verify:cell-places ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
