/**
 * verify-height-time.mjs — Phase HZS (audit/hoehen-zeit-schnitt.md): the height-time section in the Regenradar.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-height-time.mjs
 *
 * Fixtures are REAL buscosun Fusion answers (stage `fs`, 336 h) captured in the browser by `scripts/hzs-probe.mjs
 * --fixture=1` (Innsbruck 576 m, Obergurgl 1 927 m; member lists stripped, unused by the model).
 *
 * A Flag: default on since Jan's go (09.10., E-HZS-10), `?hzs=0` = fallback without the section (Rule 2).
 * B Snowfall line: only native cube steps, values = `vars.snowline` 1:1, gaps never bridged, beyond ≈ 120 h a named gap.
 * C Columns: window covered without overlap, a 3-h/6-h value stands for its whole step (never spread), value =
 *   `precip.mean`, phase thresholds 0,25/0,75 with counter-checks.
 * D Freezing level: hand calculation (independent hypsometric formula), ground, above 700 hPa (no extrapolation),
 *   levels below ground dropped, negative control; real fixture: one point per native cube step.
 * E Sentence "Schnee bis zu dir …": all kinds, band full / early only / none, dry note at the threshold (± counter-check).
 * F Terrain ring: disc sample count, percentiles ordered, sea clamped to 0, too few samples ⇒ null.
 * G Hover: a 3-h value covers its 3 h; screen-reader text names the parts.
 * H Wiring: flag gate in the deck, map prop optional, without the flag no new props; with `--phase` also: buscosun Fusion
 *   untouched in the working tree (phase guard, not in CI).
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  buildHeightTime, snowPointsFromV2, snowRuns, snowGapsOf, columnsFromV2, freezingLevel, freezeFromCells,
  terrainStatsOf, snowSentence, infoAt, srText, HZS_DRY_P, HZS_MIN_ABOVE_GROUND_HPA,
} from '../src/nowcast/heightTime/heightTimeModel.ts';
import { heightTimeEnabledFrom } from '../src/nowcast/heightTime/heightTimeFlag.ts';
import { discPoints, HZS_TERRAIN_RADIUS_KM, HZS_TERRAIN_STEP_KM } from '../src/nowcast/heightTime/terrainRing.ts';
import { exceedance } from '../src/pointForecast/fusion/dist.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const add = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const H = 3_600_000;
const fixture = (name) => JSON.parse(gunzipSync(readFileSync(join(ROOT, 'audit/hoehen-zeit-schnitt', `fixture-${name}.json.gz`))).toString('utf8'));
const IBK = fixture('innsbruck'), OGL = fixture('obergurgl');

// ---------------------------------------------------------------------------
console.log('\nA Schalter');
add('A1 voreingestellt an (ohne Parameter, ?hzs=1, anderer Name ?hz=0)', heightTimeEnabledFrom('') && heightTimeEnabledFrom('?hzs=1') && heightTimeEnabledFrom('?hz=0'));
add('A2 Rückfall ?hzs=0 / ?hzs=false aus', !heightTimeEnabledFrom('?hzs=0') && !heightTimeEnabledFrom('?x=2&hzs=false'));

// ---------------------------------------------------------------------------
console.log('\nB Schneefallgrenze (echte Antworten von buscosun Fusion)');
for (const [name, fx] of [['Innsbruck', IBK], ['Obergurgl', OGL]]) {
  const from = Math.floor(fx.nowMs / H) * H, to = from + 336 * H;
  const pts = snowPointsFromV2(fx.v2, from, to);
  const byT = new Map(fx.v2.axis.steps.filter((s) => !s.interpolated).map((s) => [s.validAtMs, s]));
  const native = new Set(fx.v2.axis.native);
  add(`B1 ${name}: nur native Cube-Schritte (t1/t2/t3, nie interpoliert, nie Station/Klima)`, pts.length > 0 && pts.every((p) => ['t1', 't2', 't3'].includes(p.tier) && native.has(p.tMs) && !byT.get(p.tMs).interpolated), `${pts.length} Punkte`);
  add(`B2 ${name}: Werte 1:1 aus vars.snowline (p10/p50/p90)`, pts.every((p) => { const v = byT.get(p.tMs).vars.snowline; return v ? p.p50 === v.p50 && p.p10 === (v.p50 == null ? null : v.p10) && p.p90 === (v.p50 == null ? null : v.p90) : p.p50 == null; }));
  const vals = pts.filter((p) => p.p50 != null);
  const lastMs = vals[vals.length - 1].tMs;
  add(`B3 ${name}: keine Schneefallgrenze nach ≈ 120 h (Stufe t3 führt keine)`, lastMs - from <= 122 * H && pts.filter((p) => p.tier === 't3').every((p) => p.p50 == null), `letzte ${((lastMs - from) / H).toFixed(0)} h`);
  const gaps = snowGapsOf(pts, from, to);
  add(`B4 ${name}: der Schwanz ist eine benannte Lücke bis zum Fensterende`, gaps.length > 0 && gaps[gaps.length - 1][1] === to && gaps[gaps.length - 1][0] <= lastMs + H, JSON.stringify(gaps.map(([a, b]) => [(a - from) / H, (b - from) / H])));
  const runs = snowRuns(pts);
  add(`B5 ${name}: Linienstücke enthalten keine Lücke`, runs.every((r) => r.every((p) => p.p50 != null)) && runs.reduce((n, r) => n + r.length, 0) === vals.length);
}
{
  const t0 = Date.UTC(2026, 9, 9, 0);
  const mk = (h, p50, p10 = null, p90 = null, tier = 't1') => ({ tMs: t0 + h * H, tier, p50, p10, p90, sigmaKind: null });
  const pts = [mk(1, 1000), mk(2, 1100), mk(3, null), mk(4, 1200)];
  const runs = snowRuns(pts);
  add('B6 eine Lücke trennt die Linie (Gegenprobe: ohne Lücke ein Stück)', runs.length === 2 && snowRuns([mk(1, 1000), mk(2, 1100), mk(4, 1200)]).length === 1);
  add('B7 Band nur, wo p10 UND p90 da sind', snowRuns([mk(1, 1000, 900, 1100), mk(2, 1000, 900, null), mk(3, 1000, 900, 1100)], 'band').length === 2);
}

// ---------------------------------------------------------------------------
console.log('\nC Niederschlagssäulen');
for (const [name, fx] of [['Innsbruck', IBK], ['Obergurgl', OGL]]) {
  for (const range of [48, 336]) {
    const from = Math.floor(fx.nowMs / H) * H, to = from + range * H;
    const cols = columnsFromV2(fx.v2, from, to, exceedance);
    let cover = from, ok = true;
    for (const c of cols) { if (c.fromMs !== cover) ok = false; cover = c.toMs; }
    add(`C1 ${name} ${range} h: lückenlos und ohne Überlapp`, ok && cover === to, `${cols.length} Säulen`);
    const byT = new Map(fx.v2.axis.steps.filter((s) => !s.interpolated).map((s) => [`${s.validAtMs}|${s.tier}`, s]));
    const withVal = cols.filter((c) => c.mmh != null);
    add(`C2 ${name} ${range} h: Wert = precip.mean des Schritts, Intervall = Schrittlänge der Stufe`, withVal.every((c) => {
      const s = byT.get(`${c.stepToMs}|${c.tier}`); const len = (c.stepToMs - c.stepFromMs) / H;
      return s && Math.abs(s.vars.precip.mean - c.mmh) < 1e-9 && len === { t1: 1, t2: 3, t3: 6, station: 1, clima: 1 }[c.tier];
    }));
    if (range === 336) add(`C3 ${name}: 3-h- und 6-h-Werte stehen über ihrer ganzen Länge (nie auf Stunden verteilt)`, withVal.some((c) => c.tier === 't2' && c.toMs - c.fromMs === 3 * H) && withVal.some((c) => c.tier === 't3' && c.toMs - c.fromMs === 6 * H) && withVal.every((c) => c.toMs - c.fromMs <= (c.stepToMs - c.stepFromMs)));
  }
}
{
  const step = (h, pSnow, mean = 1) => ({ validAtMs: Date.UTC(2026, 9, 9, h), leadH: h, tier: 't1', interpolated: false, members: [], flags: [],
    vars: { precip: { mean, p10: 0, p50: mean, p90: mean, sigma: null, dist: { kind: 'hurdleLogNormal', pDry: 0.4, mu: 0, sigma: 1 }, sigmaKind: 'set', confidence: null, members: [], calib: [] },
      pSnow: pSnow == null ? null : { p50: pSnow, mean: pSnow } } });
  const v2 = { point: { hTrue: 500 }, axis: { steps: [step(1, 0.25), step(2, 0.26), step(3, 0.74), step(4, 0.75), step(5, null)], native: [] } };
  const cols = columnsFromV2(v2, Date.UTC(2026, 9, 9, 0), Date.UTC(2026, 9, 9, 5), exceedance);
  add('C4 Phase: 0,25 Regen · 0,26 Schneeregen · 0,74 Schneeregen · 0,75 Schnee · ohne pSnow unbekannt', cols.map((c) => c.phase).join(',') === 'rain,sleet,sleet,snow,', cols.map((c) => c.phase).join(','));
  add('C5 P(nass) aus der Verteilung (1 − pDry)', Math.abs(cols[0].pWet - 0.6) < 1e-9);
}

// ---------------------------------------------------------------------------
console.log('\nD Nullgradgrenze');
{
  // independent hand calculation: z = h + Rd/g · T̄ · ln(ps/p), T̄ = mean of t2m and T_p (K)
  const RG = 287.05 / 9.80665;
  const zOf = (h, ps, t2, tp, p) => h + RG * ((t2 + tp) / 2 + 273.15) * Math.log(ps / p);
  const h = 500, ps = 955, t2 = 8, T = { 925: 4, 850: -2, 700: -10 };
  const z925 = zOf(h, ps, t2, 4, 925), z850 = zOf(h, ps, t2, -2, 850);
  const expect = z925 + (4 / (4 - -2)) * (z850 - z925);
  const r = freezingLevel(h, t2, ps, T);
  add('D1 Durchgang zwischen 925 und 850 hPa = Handrechnung', r.state === 'ok' && Math.abs(r.m - expect) < 0.01, `${r.m?.toFixed(1)} gegen ${expect.toFixed(1)} m`);
  const rNeg = freezingLevel(h, t2, ps, { 925: 4, 850: 2, 700: -10 });
  add('D2 Negativkontrolle: wärmere 850 hPa ⇒ höher, zwischen 850 und 700', rNeg.state === 'ok' && rNeg.m > z850 && Math.abs(rNeg.m - expect) > 300, `${rNeg.m?.toFixed(0)} m`);
  const g = freezingLevel(h, -0.5, ps, T);
  add('D3 T am Ort ≤ 0 ⇒ „am Boden" auf Ortshöhe', g.state === 'ground' && g.m === h);
  const a = freezingLevel(h, 20, ps, { 925: 16, 850: 10, 700: 2 });
  add('D4 alles warm ⇒ „über" der 700-hPa-Höhe, nicht fortgeschrieben', a.state === 'above' && Math.abs(a.m - zOf(h, ps, 20, 2, 700)) < 0.01, `${a.m?.toFixed(0)} m`);
  // Obergurgl-like: ps 810 hPa ⇒ 925/850 below ground, only 700 counts
  const b = freezingLevel(1927, 3, 810, { 925: 15, 850: 11, 700: -1 });
  const z700 = zOf(1927, 810, 3, -1, 700);
  add(`D5 Flächen unter Grund (ps − p < ${HZS_MIN_ABOVE_GROUND_HPA} hPa) fallen weg`, b.state === 'ok' && Math.abs(b.m - (1927 + (3 / 4) * (z700 - 1927))) < 0.01, `${b.m?.toFixed(0)} m`);
  const b2 = freezingLevel(1927, 3, 860, { 925: 15, 850: 11, 700: -1 });
  add('D6 Gegenprobe: 850 hPa 10 hPa über Grund zählt mit', b2.state === 'ok' && b2.m > z700 - 400 && Math.abs(b2.m - b.m) > 1);
  add('D7 fehlende Ortswerte ⇒ Lücke', freezingLevel(500, NaN, 950, T).state === 'none');
}
for (const [name, fx] of [['Innsbruck', IBK], ['Obergurgl', OGL]]) {
  const from = Math.floor(fx.nowMs / H) * H, to = from + 336 * H;
  const fz = freezeFromCells(fx.v2, fx.cells, from, to);
  const nCells = fx.cells.filter((c) => ['t1', 't2', 't3'].includes(c.tier) && c.validAtMs >= from && c.validAtMs <= to).length;
  const st = fz.reduce((o, f) => ({ ...o, [f.state]: (o[f.state] ?? 0) + 1 }), {});
  add(`D8 ${name}: ein Punkt je nativem Cube-Schritt mit Zellwerten, bis 336 h`, fz.length === nCells && fz[fz.length - 1].tMs - from > 300 * H, JSON.stringify(st));
  add(`D9 ${name}: Höhen plausibel (über Ort, unter 6 000 m)`, fz.filter((f) => f.state === 'ok').every((f) => f.m >= fx.v2.point.hTrue && f.m < 6000));
}

// ---------------------------------------------------------------------------
console.log('\nE Satz „Schnee bis zu dir …"');
{
  const t0 = Date.UTC(2026, 9, 14, 18); // Mi 20:00 MESZ
  const mk = (h, p50, p10, p90) => ({ tMs: t0 + h * H, tier: 't1', p50, p10, p90, sigmaKind: 'ensemble' });
  const wet = (p) => [{ fromMs: t0 - 10 * H, toMs: t0 + 30 * H, stepFromMs: 0, stepToMs: 0, tier: 't1', mmh: 1, pWet: p, pSnow: 1, phase: 'snow' }];
  const pts = [mk(0, 1500, 1200, 1800), mk(3, 1100, 800, 1400), mk(7, 900, 600, 1200), mk(11, 700, 400, 850)];
  const s = snowSentence(pts, 900, wet(0.8));
  add('E1 „Schnee bis zu dir ab Do 03:00 (zwischen 23:00 und 07:00)"', s.kind === 'reaches' && s.text === 'Schnee bis zu dir ab Do 03:00 (zwischen 23:00 und 07:00)', s.text);
  const sDry = snowSentence(pts, 900, wet(HZS_DRY_P - 0.01)), sWetEdge = snowSentence(pts, 900, wet(HZS_DRY_P));
  add('E2 trocken (P(nass) < 0,3) ⇒ „— aber kaum Niederschlag"; genau 0,3 ⇒ ohne Zusatz', sDry.text.endsWith('— aber kaum Niederschlag') && !sWetEdge.text.includes('kaum'));
  const early = snowSentence([mk(0, 1500, 1200, 1800), mk(3, 1100, 800, 1400), mk(7, 900, 600, 1200)].map((p) => ({ ...p, p90: p.p90 + 1000 })), 900, wet(0.8));
  add('E3 obere Grenze erreicht die Höhe nie ⇒ „(frühestens …)"', early.kind === 'reaches' && early.band === 'early-only' && /\(frühestens 23:00\)$/.test(early.text), early.text);
  const nob = snowSentence(pts.map((p) => ({ ...p, p10: null, p90: null })), 900, wet(0.8));
  add('E4 ohne Spanne ⇒ „(ohne Spanne)"', nob.band === 'none' && nob.text === 'Schnee bis zu dir ab Do 03:00 (ohne Spanne)', nob.text);
  add('E5 schon jetzt darunter ⇒ „liegt schon auf deiner Höhe"', snowSentence(pts, 1600, wet(0.8)).kind === 'already');
  const pos = snowSentence(pts, 650, wet(0.8));
  add('E6 nur die untere Grenze erreicht die Höhe ⇒ „möglich ab …"', pos.kind === 'possible' && pos.text.startsWith('Schnee bis zu dir möglich ab Do 03:00'), pos.text);
  const above = snowSentence(pts, 300, wet(0.8));
  add('E7 nie ⇒ „bleibt über dir (tiefster Wert ≈ 700 m, Do 07:00)"', above.kind === 'stays-above' && above.text === 'Schneefallgrenze bleibt über dir (tiefster Wert ≈ 700 m, Do 07:00)', above.text);
  add('E8 ohne Ortshöhe / ohne Werte ⇒ benannt', snowSentence(pts, null, []).kind === 'no-height' && snowSentence([mk(0, null, null, null)], 900, []).kind === 'no-data');
  const far = snowSentence([mk(0, 1500, 900, 1800), mk(30, 1100, 800, 1400), mk(40, 880, 600, 1200), mk(70, 700, 400, 850)], 900, wet(0.8));
  add('E9 zweite Zeit > 24 h entfernt ⇒ mit Wochentag', far.kind === 'reaches' && /zwischen Mi 20:00 und Sa \d\d:00/.test(far.text), far.text);
}
{
  const m = buildHeightTime({ v2: OGL.v2, cells: OGL.cells, terrain: null, nowMs: OGL.nowMs, rangeH: 336, exceed: exceedance });
  add('E10 Obergurgl 14 Tage (echt): Satz aus den Daten', ['reaches', 'possible', 'stays-above', 'already'].includes(m.sentence.kind), m.sentence.text);
}

// ---------------------------------------------------------------------------
console.log('\nF Gelände im Umkreis');
{
  const pts = discPoints(47.27, 11.40);
  const nExpect = Math.PI * (HZS_TERRAIN_RADIUS_KM / HZS_TERRAIN_STEP_KM) ** 2;
  add('F1 Kreisscheibe 10 km im 250-m-Raster', Math.abs(pts.length - nExpect) / nExpect < 0.02, `${pts.length} Proben (≈ ${nExpect.toFixed(0)})`);
  const kmLon = 111.32 * Math.cos((47.27 * Math.PI) / 180);
  add('F2 keine Probe außerhalb des Radius', pts.every(([lo, la]) => Math.hypot((lo - 11.40) * kmLon, (la - 47.27) * 111.32) <= HZS_TERRAIN_RADIUS_KM + 1e-6));
  const t = terrainStatsOf([-5, ...Array.from({ length: 99 }, (_, i) => 500 + i * 20), NaN], 10, 10);
  add('F3 Min/P10/P50/P90/Max geordnet, Meer ⇒ 0 m, NaN verworfen', t && t.minM === 0 && t.maxM === 500 + 98 * 20 && t.minM <= t.p10M && t.p10M <= t.p50M && t.p50M <= t.p90M && t.p90M <= t.maxM && t.n === 100);
  add('F4 zu wenige Proben ⇒ keine Statistik', terrainStatsOf([1, 2, 3], 10, 10) === null);
}

// ---------------------------------------------------------------------------
console.log('\nG Stunde unter dem Zeiger, Textfassung');
{
  const m = buildHeightTime({ v2: OGL.v2, cells: OGL.cells, terrain: { radiusKm: 10, zoom: 10, n: 5000, minM: 1300, p10M: 1700, p50M: 2300, p90M: 2900, maxM: 3448 }, nowMs: OGL.nowMs, rangeH: 336, exceed: exceedance });
  const t2 = m.snow.find((p) => p.tier === 't2' && p.p50 != null);
  const a = infoAt(m, t2.tMs - 2.5 * H), b = infoAt(m, t2.tMs - 3.5 * H);
  add('G1 ein 3-h-Wert gilt für seine 3 h (2,5 h davor derselbe, 3,5 h davor ein anderer)', a.snow === t2 && b.snow !== t2);
  const txt = srText(m, 'Obergurgl', 'buscosun Fusion 9');
  add('G2 Textfassung nennt Ort, Ortshöhe, Gelände, Grenze, Satz, Nullgrad, Lücke', ['Obergurgl', 'Ortshöhe 1 927 m', 'Tal 1 300 m, Grat 3 448 m', 'buscosun Fusion 9', 'liefert buscosun Fusion keine Schneefallgrenze', 'Nullgradgrenze'].every((w) => txt.includes(w)), txt.slice(0, 160) + ' …');
  add('G3 Höhenachse 5 000 m, wo der Grat über ≈ 3 800 m reicht; sonst 4 000 m', m.yMaxM === 4000 && buildHeightTime({ v2: OGL.v2, cells: null, terrain: { radiusKm: 10, zoom: 10, n: 100, minM: 1000, p10M: 1, p50M: 1, p90M: 1, maxM: 4200 }, nowMs: OGL.nowMs, rangeH: 48, exceed: null }).yMaxM === 5000);
}

// ---------------------------------------------------------------------------
console.log('\nH Verdrahtung');
{
  const deck = readFileSync(join(ROOT, 'src/nowcast/NowcastDeck.tsx'), 'utf8');
  const map = readFileSync(join(ROOT, 'src/nowcast/NowcastRadarMap.tsx'), 'utf8');
  add('H1 Deck: Schalter aus der URL, Panel als Lazy-Chunk', /heightTimeEnabledFrom\(/.test(deck) && /lazy\(\(\) => import\('\.\/heightTime\/HeightTimePanel'\)\)/.test(deck) && !/from '\.\/heightTime\/(heightTimeModel|HeightTimeChart|useHeightTime)'/.test(deck));
  add('H2 mit ?hzs=0 keine neuen Karten-Props (hzsMapProps/timeMapProps leer)', /const hzsMapProps = hzsOn \? \{ onPointChange: setHzsPoint \} : \{\};/.test(deck) && /const timeMapProps = hzsVisible \? \{ onTimeChange: setSliderMs \} : \{\};/.test(deck));
  add('H3 Ansicht „Karte + Höhe" und Reiter „Höhe" fallen mit ?hzs=0 weg', /\{hzsOn && <button[\s\S]{0,260}?>Karte \+ Höhe<\/button>\}/.test(deck) && /withHeight=\{hzsOn\}/.test(deck) && /withHeight \? \[\.\.\.MOBILE_TABS/.test(deck));
  add('H4 Karte: onPointChange optional, nur gemeldet, nichts sonst', /onPointChange\?: \(p:/.test(map) && /onPointChangeRef\.current\?\.\(point\)/.test(map));
  // Phase guard only on request (`--phase`): later phases may change buscosun Fusion legitimately — no permanent red.
  if (process.argv.includes('--phase')) {
  let diff = '';
  try { diff = execFileSync('git', ['diff', '--stat', 'HEAD', '--', 'src/pointForecast', 'src/point', 'src/fusion'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { diff = `git: ${e.message}`; }
  add('H5 buscosun Fusion, Punkt-Leser und Rasterfusion unverändert (git diff leer)', diff === '', diff || 'leer');
  } else console.log('· H5 (Phasenwache: buscosun Fusion unverändert) nur mit --phase');
}

console.log(`\n${pass} von ${pass + fail} Prüfungen bestanden${fail ? ` — ${fail} rot` : ''}`);
process.exit(fail ? 1 : 0);
