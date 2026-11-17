/**
 * verify:sea-tide-window — Phase TF (`audit/tidenfenster.md`): the rules of the tide window on /seewetter.
 * Switch (default off), references by subtraction, threshold in link and storage, windows from the curve, the
 * tidal prediction only beyond the curve ("nur Gezeit"), hours and classes, the gauge-with-curve fallback (E-WL-10),
 * the deviation from the tide and the wording — each claim of an absence with a negative control.
 *
 * Fixtures `scripts/lib/fixtures/sea/tidewindow/` are the REAL, unchanged answers of the BSH OGC API of
 * 17.11.2026 23:20 MEZ for the gauges of St. Peter-Ording (Süderoogsand without a curve, Eider-Sperrwerk with one),
 * Cuxhaven and Kiel-Schilksee. The case "tidal prediction reaches further than the model curve" did not occur live
 * that day (V-TF-1) — it is DERIVED from the real Cuxhaven answer by removing model values, and named as derived.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-tide-window.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wlForecastOf, wlNearest, wlNearestWithCurve } from '../src/sea/waterLevel.ts';
import { SEA_TIDE_WINDOW_LIVE, seaTideWindowFrom } from '../src/sea/seaFlag.ts';
import { SEA_DEFAULT_STATE, SEA_MAX_T, buildSeaUrl, parseSeaUrl } from '../src/sea/seaState.ts';
import {
  TIDE_DEVIATION_LABEL, TIDE_HOUR_SLACK_MS, TIDE_MAX_GAP_MS, TIDE_STORAGE_KEY, TIDE_TIGHT_CM,
  encodeTideParam, isTideThreshold, loadTideThreshold, parseTideParam, saveTideThreshold, tideDeviationCm, tideHours,
  tideMarginCm, tideRefOf, tideRefs, tideSeries, tideSideText, tideThresholdText, tideVerdict, tideWindowLabel, tideWindowLines, tideWindows,
} from '../src/sea/tideWindow.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const SRC = join(HERE, '..', 'src', 'sea');
const read = (f) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const src = (f) => readFileSync(join(SRC, f), 'utf8');
/** Code without comments — a rule about the code must not trip over a comment that names the rule. */
const bare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
const H = 3_600_000;

const rawCux = read('tidewindow/cuxhaven_steubenhoeft.json');
const cux = wlForecastOf(rawCux);
const eider = wlForecastOf(read('tidewindow/eider-sperrwerk_aussenpegel.json'));
const kiel = wlForecastOf(read('tidewindow/kiel-holtenau.json'));
const sued = wlForecastOf(read('tidewindow/suederoogsand.json'));
const cat = read('waterlevel/gauges.json');
const spots = read('static/spots.json').spots;
const spot = (id) => spots.find((s) => s.id === id);
/** "Now" of the fixtures: the stamp of the model curve. */
const NOW = cux.curveAt;
const refsOf = (d) => tideRefs({ region: d.region, zeroNhnCm: d.zeroNhnCm, chartDatumCm: d.chartDatumCm, mhwCm: d.mhwCm, mlwCm: d.mlwCm });
const pageSrc = src('SeaPage.tsx'), readoutSrc = src('SeaReadout.tsx'), chartSrc = src('SeaCharts.tsx'), bandSrc = src('SeaBand.tsx');
const uiSrc = src('SeaTideWindow.tsx'), ruleSrc = src('tideWindow.ts');

// --- A: the switch (Rule 2: default off, named fallback) ----------------------------------------------
add('A1 Voreingestellt AUS: SEA_TIDE_WINDOW_LIVE = false; ?tf=1 schaltet ein, ?tf=0 schaltet auch einen Live-Stand aus',
  SEA_TIDE_WINDOW_LIVE === false && seaTideWindowFrom('') === false && seaTideWindowFrom('?tf=1') === true
  && seaTideWindowFrom('?tf=0', true) === false && seaTideWindowFrom('', true) === true && seaTideWindowFrom('?tf=2') === false
  && seaTideWindowFrom('?wl=0&tf=1') === true);
add('A2 Ohne Schalter bekommt keine Anzeige etwas: Sicht, Zeile im Band und zweiter Pegel hängen an tideActive/tideFeed',
  /const tideActive = tideOn && water;/.test(pageSrc) && /tideActive \? \{/.test(pageSrc) && /tide=\{tideView\}/.test(pageSrc)
  && /if \(!tideActive \|\| !gauge \|\| !spot\) return null;/.test(pageSrc) && /tide=\{tideFeed \? /.test(pageSrc)
  && /const tideGauge = tideActive \? /.test(pageSrc));
add('A3 Ohne Schalter bleiben Diagramm und Kartenfenster wie vor TF (alte Ebenenfolge, 48 h)',
  /\(tide \? \[Bands, Ref, 'grid', Deviation, 'lines', Threshold, 'axes', Now, Sel\] : \[Ref, 'grid', Area, 'lines', 'axes', Now, Sel\]\)/.test(chartSrc)
  && /nowMs \+ \(tide \? SEA_MAX_T : 48\) \* 3_600_000/.test(readoutSrc) && SEA_MAX_T === 78);

// --- B: references — only what the gauge delivers, only subtraction (E-TF-2, E-WL-9) -------------------
const rc = refsOf(cux), rk = refsOf(kiel);
add('B1 Cuxhaven: Pegelnull 0, NHN bei 503, Seekartennull bei 302, MThw bei 656 cm über Pegelnull — die gelieferten Höhen',
  rc.length === 4 && tideRefOf(rc, 'pnp').offsetCm === 0 && tideRefOf(rc, 'nhn').offsetCm === 503 && tideRefOf(rc, 'skn').offsetCm === 302
  && tideRefOf(rc, 'mhw').offsetCm === 656 && tideRefOf(rc, 'mhw').label === 'MThw'
  && rawCux.properties.gaugezero_relative_to_nhn === -503 && rawCux.properties.chartdatum_relative_to_gaugezero === 302,
  rc.map((r) => `${r.label} ${r.offsetCm}`).join(', '));
add('B2 Ostsee: das Wort ist MHW, nicht MThw (keine Tide)',
  tideRefOf(rk, 'mhw').label === 'MHW' && tideRefOf(rk, 'mhw').offsetCm === 626 && !rk.some((r) => /MThw/.test(r.label + r.over)),
  rk.map((r) => `${r.label} ${r.offsetCm}`).join(', '));
const placeholders = cat.gauges.filter((g) => ['fynshav', 'sonderborg', 'fino2'].includes(g.id));
add('B3 Platzhalter 0 wird kein Bezug: fynshav/sonderborg/fino2 bieten NHN nicht an, 0/0 kein MHW (V-WL-7)',
  placeholders.length === 3 && placeholders.every((g) => !tideRefOf(tideRefs(g), 'nhn'))
  && placeholders.filter((g) => g.id !== 'fino2').every((g) => tideRefs(g).length === 1 && tideRefs(g)[0].ref === 'pnp')
  && tideRefs({ region: 'baltic_sea', zeroNhnCm: -498, chartDatumCm: 498, mhwCm: 500, mlwCm: 500 }).some((r) => r.ref === 'mhw'),
  placeholders.map((g) => `${g.id}:${tideRefs(g).map((r) => r.ref).join('/')}`).join(' '));
const sCux = tideSeries(cux.curve);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wPnp = tideWindows(sCux.points, { mode: 'min', cm: 550, ref: 'pnp' }, 0, NOW);
add('B4 Dieselbe Höhe in vier Bezügen ergibt dieselben Fenster: 550 Pegelnull = 47 NHN = 248 Seekartennull = −106 MThw',
  wPnp.length > 3
  && same(wPnp, tideWindows(sCux.points, { mode: 'min', cm: 47, ref: 'nhn' }, 503, NOW))
  && same(wPnp, tideWindows(sCux.points, { mode: 'min', cm: 248, ref: 'skn' }, 302, NOW))
  && same(wPnp, tideWindows(sCux.points, { mode: 'min', cm: -106, ref: 'mhw' }, 656, NOW))
  && !same(wPnp, tideWindows(sCux.points, { mode: 'min', cm: 47, ref: 'nhn' }, 0, NOW)),
  `${wPnp.length} Fenster; Gegenprobe ohne Bezugshöhe weicht ab`);
add('B5 Verglichen wird „Wert − Bezugshöhe“ gegen die Zahl; ≥ 0 heißt erlaubte Seite',
  tideMarginCm(560, { mode: 'min', cm: 47, ref: 'nhn' }, 503) === 10 && tideMarginCm(560, { mode: 'max', cm: 47, ref: 'nhn' }, 503) === -10
  && tideMarginCm(550, { mode: 'min', cm: 550, ref: 'pnp' }, 0) === 0);

// --- C: link and storage (E-TF-2/3) ------------------------------------------------------------------
const th = { mode: 'min', cm: 550, ref: 'pnp' };
add('C1 Link: tw=min.550.pnp.<pegel> hin und zurück, auch negativ; der Pegel steht im Link',
  encodeTideParam(th, 'cuxhaven_steubenhoeft') === 'min.550.pnp.cuxhaven_steubenhoeft'
  && same(parseTideParam('min.550.pnp.cuxhaven_steubenhoeft'), { threshold: th, gaugeId: 'cuxhaven_steubenhoeft' })
  && same(parseTideParam(encodeTideParam({ mode: 'max', cm: -20, ref: 'nhn' }, 'kiel-holtenau')), { threshold: { mode: 'max', cm: -20, ref: 'nhn' }, gaugeId: 'kiel-holtenau' }));
add('C2 Unsinn wird verworfen: Komma, fünf Stellen, fremder Bezug, fehlender Pegel, leere Angabe',
  [null, '', 'min.5,5.pnp.x', 'min.55000.pnp.x', 'min.550.lat.x', 'min.550.pnp', 'mid.550.pnp.x', 'min.550.pnp.X Y', 'min..pnp.x'].every((v) => parseTideParam(v) === null)
  && encodeTideParam({ mode: 'min', cm: 5.5, ref: 'pnp' }, 'x') === null && encodeTideParam(th, 'Nicht Gültig') === null
  && !isTideThreshold({ mode: 'min', cm: 99999, ref: 'pnp' }) && isTideThreshold(th));
add('C3 Jede Pegel-Kennung des Katalogs passt in den Link (136 Pegel)',
  cat.gauges.length === 136 && cat.gauges.every((g) => parseTideParam(encodeTideParam(th, g.id))?.gaugeId === g.id));
const st = { ...SEA_DEFAULT_STATE, spot: 'cuxhaven-duhnen', tw: 'min.550.pnp.cuxhaven_steubenhoeft', tf: true };
const url = buildSeaUrl(st);
add('C4 Adresse: tw und tf stehen im Zustand der Seite und überleben den Weg hin und zurück; ohne sie bleibt die Adresse wie zuvor',
  url === '/seewetter/cuxhaven-duhnen?tw=min.550.pnp.cuxhaven_steubenhoeft&tf=1'
  && same(parseSeaUrl('cuxhaven-duhnen', url.split('?')[1]).state, st)
  && buildSeaUrl({ ...SEA_DEFAULT_STATE, spot: 'cuxhaven-duhnen' }) === '/seewetter/cuxhaven-duhnen'
  && parseSeaUrl(null, 'tw=quatsch').invalid.includes('tw') && parseSeaUrl(null, 'tw=quatsch').state.tw === null
  && parseSeaUrl(null, 'tf=0').state.tf === false, url);
const mem = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; })();
saveTideThreshold('cuxhaven_steubenhoeft', th, mem);
saveTideThreshold('kiel-holtenau', { mode: 'max', cm: 520, ref: 'pnp' }, mem);
const stored = same(loadTideThreshold('cuxhaven_steubenhoeft', mem), th) && loadTideThreshold('kiel-holtenau', mem).cm === 520 && loadTideThreshold('buesum', mem) === null;
saveTideThreshold('kiel-holtenau', null, mem);
add('C5 Speicher: je Pegel eine Schwelle unter sea.tide.v1, Löschen nimmt nur diesen Pegel; kaputter Speicher ergibt „keine“',
  stored && loadTideThreshold('kiel-holtenau', mem) === null && same(loadTideThreshold('cuxhaven_steubenhoeft', mem), th)
  && TIDE_STORAGE_KEY === 'sea.tide.v1' && loadTideThreshold('x', { getItem: () => '{kaputt' }) === null
  && loadTideThreshold('x', { getItem: () => JSON.stringify({ x: { mode: 'min', cm: 'viel', ref: 'pnp' } }) }) === null
  && loadTideThreshold('x', null) === null);

// --- D: the series (E-TF-4) --------------------------------------------------------------------------
const count = (s) => s.points.reduce((a, p) => ({ ...a, [p.src]: (a[p.src] ?? 0) + 1 }), {});
add('D1 Echte Antwort Cuxhaven: Messung, dann Modellkurve; KEIN Gezeitenpunkt, weil die Modellkurve genauso weit reicht (V-TF-1)',
  count(sCux).measured === 82 && count(sCux).forecast === 839 && !count(sCux).tide && sCux.curveEnd === sCux.end
  && cux.curve.filter((p) => p.tide != null).length === 922 && sCux.points.every((p, i, a) => i === 0 || p.t > a[i - 1].t),
  `${JSON.stringify(count(sCux))}, Ende ${new Date(sCux.end).toISOString()}`);
const sKiel = tideSeries(kiel.curve);
add('D2 Ostsee: nur Messung und Modellkurve, keine Gezeit; die Kurve endet vor dem Ende der Stundenachse der Seite (V-TF-2)',
  !count(sKiel).tide && count(sKiel).forecast === 196 && kiel.curve.every((p) => p.tide == null)
  && sKiel.end - kiel.curveAt < SEA_MAX_T * H, `Kurve +${((sKiel.end - kiel.curveAt) / H).toFixed(1)} h, Achse +${SEA_MAX_T} h`);
// DERIVED from the real answer (V-TF-1): the model curve ends 30 h after "now", the tidal prediction runs on.
const CUT = NOW + 30 * H;
const derived = wlForecastOf({ ...rawCux, properties: { ...rawCux.properties, curve: rawCux.properties.curve.map((r) => {
  const t = Date.parse(r.timestamp.replace(' ', 'T'));
  if (t <= CUT) return r;
  const { automated_curve_forecast: _drop, ...rest } = r;
  return rest;
}) } });
const sDer = tideSeries(derived.curve);
add('D3 Abgeleiteter Fall „Gezeit reicht weiter“: hinter dem Ende der Modellkurve spricht die Gezeit, davor nie',
  count(sDer).tide > 100 && sDer.curveEnd <= CUT && sDer.end === sCux.end
  && sDer.points.filter((p) => p.src === 'tide').every((p) => p.t > sDer.curveEnd)
  && sDer.points.filter((p) => p.t <= sDer.curveEnd).every((p) => p.src !== 'tide'),
  `${count(sDer).tide} Gezeitenpunkte ab ${new Date(sDer.curveEnd).toISOString()}`);
// A hole INSIDE the model curve (derived): the tidal prediction must not bridge it.
const HOLE0 = NOW + 10 * H, HOLE1 = NOW + 13 * H;
const holed = wlForecastOf({ ...rawCux, properties: { ...rawCux.properties, curve: rawCux.properties.curve.map((r) => {
  const t = Date.parse(r.timestamp.replace(' ', 'T'));
  if (t < HOLE0 || t > HOLE1) return r;
  const { automated_curve_forecast: _drop, ...rest } = r;
  return rest;
}) } });
const sHole = tideSeries(holed.curve);
add('D4 Ein Loch IN der Modellkurve wird nicht mit der Gezeit gefüllt — dort gibt es keinen Punkt',
  !count(sHole).tide && !sHole.points.some((p) => p.t >= HOLE0 && p.t <= HOLE1)
  && holed.curve.some((p) => p.t >= HOLE0 && p.t <= HOLE1 && p.tide != null));
add('D5 Pegel ohne Kurve (Süderoogsand, echte Antwort): leere Reihe, keine Fenster, jede Stunde „keine Kurve“',
  sued.curve.length === 0 && sued.events.length === 22 && tideSeries(sued.curve).points.length === 0 && tideSeries(sued.curve).end === null
  && tideWindows([], th, 0).length === 0 && tideHours([], th, 0, [NOW]).every((h) => h.state === 'none'));

// --- E: windows (E-TF-4) -----------------------------------------------------------------------------
/** The series' value at an instant, linear between its two neighbours (the same rule the windows use). */
const valueAt = (pts, t) => {
  const i = pts.findIndex((p) => p.t >= t);
  if (i <= 0) return pts[Math.max(0, i)].cm;
  const a = pts[i - 1], b = pts[i];
  return a.cm + ((b.cm - a.cm) * (t - a.t)) / (b.t - a.t);
};
const wAll = tideWindows(sCux.points, th, 0);
const inAny = (ws, t) => ws.some((w) => t >= w.from && t <= w.to);
add('E1 Jeder Punkt der echten Kurve liegt genau dann in einem Fenster, wenn er auf der erlaubten Seite ist',
  wAll.length > 5 && sCux.points.every((p) => (p.cm >= 550) === inAny(wAll, p.t)),
  `${wAll.length} Fenster über ${sCux.points.length} Punkte`);
add('E2 Fenster sind geordnet, überlappungsfrei, und jede Kante mit Durchgang liegt genau auf der Schwelle',
  wAll.every((w, i, a) => w.to > w.from && (i === 0 || w.from > a[i - 1].to))
  && wAll.filter((w) => !w.openStart).every((w) => Math.abs(valueAt(sCux.points, w.from) - 550) < 1e-6)
  && wAll.filter((w) => !w.openEnd).every((w) => Math.abs(valueAt(sCux.points, w.to) - 550) < 1e-6));
const wMax = tideWindows(sCux.points, { mode: 'max', cm: 550, ref: 'pnp' }, 0);
const dur = (ws) => ws.reduce((a, w) => a + (w.to - w.from), 0);
add('E3 „höchstens“ ist das Gegenstück: beide Richtungen zusammen decken die ganze Kurve',
  Math.abs(dur(wAll) + dur(wMax) - (sCux.end - sCux.points[0].t)) < 1000 && wMax.length > 5,
  `${(dur(wAll) / H).toFixed(1)} h + ${(dur(wMax) / H).toFixed(1)} h = ${((sCux.end - sCux.points[0].t) / H).toFixed(1)} h`);
const lo = Math.min(...sCux.points.map((p) => p.cm)), hi = Math.max(...sCux.points.map((p) => p.cm));
const never = tideWindows(sCux.points, { mode: 'min', cm: hi + 1, ref: 'pnp' }, 0);
const always = tideWindows(sCux.points, { mode: 'min', cm: lo - 1, ref: 'pnp' }, 0);
add('E4 Gegenproben: Schwelle über dem Höchstwert ⇒ kein Fenster; unter dem Tiefstwert ⇒ ein Fenster ohne Durchgang an beiden Enden',
  never.length === 0 && always.length === 1 && always[0].openStart && always[0].openEnd
  && always[0].from === sCux.points[0].t && always[0].to === sCux.end, `Kurve ${lo} … ${hi} cm`);
const clipAt = wAll[2].from + (wAll[2].to - wAll[2].from) / 2;
const clipped = tideWindows(sCux.points, th, 0, clipAt);
add('E5 „ab jetzt“: Vergangenes entfällt, ein laufendes Fenster beginnt bei jetzt und ist als offen markiert',
  clipped.length === wAll.length - 2 && clipped[0].from === clipAt && clipped[0].openStart && clipped[0].to === wAll[2].to
  && clipped.slice(1).every((w, i) => same(w, wAll[i + 3])));
const gapPts = sCux.points.filter((p) => p.t < wAll[3].from + 20 * 60_000 || p.t > wAll[3].from + 20 * 60_000 + 2 * H);
const wGap = tideWindows(gapPts, th, 0);
add('E6 Eine Lücke über 45 min trennt: kein Fenster läuft über fehlende Punkte hinweg',
  TIDE_MAX_GAP_MS === 45 * 60_000 && wGap.some((w) => w.openEnd && w.to < sCux.end)
  && !wGap.some((w) => w.from < wAll[3].from + 30 * 60_000 && w.to > wAll[3].from + 20 * 60_000 + 2 * H - 60_000));
const wDer = tideWindows(sDer.points, th, 0, NOW);
add('E7 „nur Gezeit“ (abgeleitet): Fenster hinter dem Ende der Modellkurve sind markiert, davor keines; an der Naht wird getrennt',
  wDer.some((w) => w.tideOnly) && wDer.some((w) => !w.tideOnly)
  && wDer.filter((w) => w.tideOnly).every((w) => w.from > sDer.curveEnd) && wDer.filter((w) => !w.tideOnly).every((w) => w.to <= sDer.curveEnd)
  && wPnp.every((w) => !w.tideOnly),
  `${wDer.filter((w) => !w.tideOnly).length} aus der Kurve, ${wDer.filter((w) => w.tideOnly).length} nur Gezeit`);

// --- F: hours (E-TF-5) -------------------------------------------------------------------------------
const hour0 = Math.floor(NOW / H) * H;
const starts = Array.from({ length: SEA_MAX_T + 1 }, (_, k) => hour0 + k * H);
const hCux = tideHours(sCux.points, th, 0, starts);
const inHour = (pts, t) => pts.filter((p) => p.t >= t && p.t < t + H);
add('F1 Stunde gegen die echten Punkte: „ganz“ ⇒ alle Punkte erlaubt, „nicht“ ⇒ keiner, „zum Teil“ ⇒ gemischt oder Durchgang',
  hCux.length === starts.length && hCux.every((h, i) => {
    const ok = inHour(sCux.points, starts[i]).map((p) => p.cm >= 550);
    return h.state === 'in' ? ok.every(Boolean) : h.state === 'out' ? !ok.some(Boolean) : h.state === 'part';
  }) && ['in', 'part', 'out'].every((s) => hCux.some((h) => h.state === s)) && !hCux.some((h) => h.state === 'none'),
  hCux.map((h) => h.state[0]).join(''));
add('F2 Abstand zur Schwelle = kleinster Abstand der Punkte der Stunde, mit Vorzeichen',
  hCux.every((h, i) => h.marginCm === Math.min(...inHour(sCux.points, starts[i]).map((p) => p.cm - 550))));
const hKiel = tideHours(sKiel.points, { mode: 'min', cm: 480, ref: 'pnp' }, 0, starts);
const firstNone = hKiel.findIndex((h) => h.state === 'none');
add('F3 Ostsee: hinter dem Ende der Kurve „keine Kurve“ — nie „nicht“, nie der letzte Wert weitergeschrieben (V-TF-2)',
  firstNone > 40 && hKiel.slice(firstNone).every((h) => h.state === 'none' && h.marginCm === null)
  && hKiel.slice(0, firstNone).every((h) => h.state !== 'none') && starts[firstNone] + H > sKiel.end + TIDE_HOUR_SLACK_MS - H,
  `ab Stunde +${firstNone}: keine Kurve`);
const hDer = tideHours(sDer.points, th, 0, starts);
add('F4 „nur Gezeit“ je Stunde (abgeleitet): markiert hinter dem Ende der Modellkurve, davor nicht',
  hDer.some((h) => h.tideOnly) && hDer.every((h, i) => h.tideOnly === (h.state !== 'none' && starts[i] + H > sDer.curveEnd))
  && hCux.every((h) => !h.tideOnly));

// --- G: classes (E-TF-5) — fed only with a threshold ---------------------------------------------------
const V = (cls, reasons) => ({ cls, reasons, shore: null, daylight: true });
const HR = (state, marginCm = 40, tideOnly = false) => ({ state, marginCm, tideOnly });
const ok = V('passt', ['innerhalb deiner Grenzen']);
const out = tideVerdict(ok, HR('out', -30), 'min', 'Cuxhaven');
const part = tideVerdict(ok, HR('part', -5), 'min', 'Cuxhaven');
const near = tideVerdict(ok, HR('in', 4), 'min', 'Cuxhaven');
const none = tideVerdict(ok, HR('none', null), 'min', 'Cuxhaven');
add('G1 passt + Wasserstand: ganz im Fenster mit Abstand bleibt „passt“ (unverändert), außerhalb ⇒ „außerhalb“, Teil ⇒ „knapp“, < 10 cm ⇒ „knapp“, ohne Kurve ⇒ „keine Daten“',
  tideVerdict(ok, HR('in', 40), 'min', 'Cuxhaven') === ok && out.cls === 'ausserhalb' && part.cls === 'knapp' && near.cls === 'knapp'
  && none.cls === 'keine' && tideVerdict(ok, undefined, 'min', 'Cuxhaven').cls === 'keine' && TIDE_TIGHT_CM === 10
  && tideVerdict(ok, HR('in', 10), 'min', 'Cuxhaven') === ok,
  [out, part, near, none].map((v) => v.reasons[0]).join(' | '));
add('G2 Wortlaut der Gründe: „unter/über deiner Schwelle am Pegel X“, „nur Gezeit“ wird genannt, „fehlt“ statt einer Wertung',
  out.reasons[0] === 'Wasserstand unter deiner Schwelle am Pegel Cuxhaven'
  && tideVerdict(ok, HR('out', -30), 'max', 'Cuxhaven').reasons[0] === 'Wasserstand über deiner Schwelle am Pegel Cuxhaven'
  && part.reasons[0] === 'Wasserstand nur einen Teil der Stunde über deiner Schwelle am Pegel Cuxhaven'
  && near.reasons[0] === 'Wasserstand nur 4 cm über deiner Schwelle am Pegel Cuxhaven'
  && none.reasons[0] === 'Wasserstand am Pegel Cuxhaven fehlt'
  && tideVerdict(ok, HR('out', -30, true), 'min', 'Cuxhaven').reasons[0].endsWith('(nur Gezeit)'));
const windOut = V('ausserhalb', ['Wind über 28 kn']), noWind = V('keine', ['Wind fehlt']), tight = V('knapp', ['Böen 31 kn nahe 33 kn']);
add('G3 Rangfolge wie classify: außerhalb schlägt fehlend schlägt knapp; Gründe werden angehängt, nie ersetzt',
  same(tideVerdict(windOut, HR('out', -30), 'min', 'X').reasons, ['Wind über 28 kn', 'Wasserstand unter deiner Schwelle am Pegel X'])
  && tideVerdict(windOut, HR('none', null), 'min', 'X') === windOut && tideVerdict(windOut, HR('part', -2), 'min', 'X') === windOut
  && tideVerdict(noWind, HR('out', -30), 'min', 'X').cls === 'ausserhalb'
  && same(tideVerdict(noWind, HR('none', null), 'min', 'X').reasons, ['Wind fehlt', 'Wasserstand am Pegel X fehlt'])
  && tideVerdict(noWind, HR('part', -2), 'min', 'X') === noWind
  && tideVerdict(tight, HR('none', null), 'min', 'X').cls === 'keine'
  && same(tideVerdict(tight, HR('part', -2), 'min', 'X').reasons, ['Böen 31 kn nahe 33 kn', 'Wasserstand nur einen Teil der Stunde über deiner Schwelle am Pegel X'])
  && tideVerdict(tight, HR('in', 40), 'min', 'X') === tight);
add('G4 Ohne Schwelle keine Einspeisung: die Seite ruft tideVerdict nur über tideFeed, und tideFeed gibt es nur mit Stunden UND Richtung',
  /const tideFeed = tideModel\?\.hours && tideModel\.mode \? tideModel : null;/.test(pageSrc)
  && /return tideFeed \? base\.map\(\(v, i\) => tideVerdict\(/.test(pageSrc) && (pageSrc.match(/tideVerdict\(/g) ?? []).length === 1
  && /const on = tide && ref && series\.points\.length > 1 \? tide : null;/.test(pageSrc)
  && /hours: on \? tideHours\(/.test(pageSrc) && /mode: on \? on\.mode : null/.test(pageSrc));
add('G5 Die gesetzte 10-cm-Regel ist im UI als gesetzt benannt (kein Wert ohne Herkunft)',
  /sind gesetzt, nicht gemessen/.test(uiSrc) && /TIDE_TIGHT_CM/.test(uiSrc));

// --- H: the gauge that carries the curve (E-WL-10, E-TF-1) ---------------------------------------------
const spo = spot('st-peter-ording'), duh = spot('cuxhaven-duhnen'), sch = spot('kiel-schilksee');
const nSpo = wlNearest(cat.gauges, spo.lat, spo.lon), cSpo = wlNearestWithCurve(cat.gauges, spo.lat, spo.lon, new Set([nSpo.gauge.id]));
add('H1 St. Peter-Ording: nächster Pegel Süderoogsand OHNE Kurve (echte Antwort), nächster MIT Kurve Eider-Sperrwerk — mit Entfernung',
  nSpo.gauge.id === 'suederoogsand' && !nSpo.gauge.has.curve && sued.curve.length === 0
  && cSpo.gauge.id === 'eider-sperrwerk_aussenpegel' && eider.curve.length > 900 && cSpo.km > nSpo.km && cSpo.km < 20,
  `${nSpo.gauge.name} ${nSpo.km.toFixed(1)} km → ${cSpo.gauge.name} ${cSpo.km.toFixed(1)} km`);
add('H2 Cuxhaven-Duhnen und Kiel-Schilksee: der nächste Pegel trägt die Kurve selbst (kein zweiter Pegel)',
  wlNearest(cat.gauges, duh.lat, duh.lon).gauge.id === 'cuxhaven_steubenhoeft' && wlNearestWithCurve(cat.gauges, duh.lat, duh.lon).gauge.id === 'cuxhaven_steubenhoeft'
  && wlNearest(cat.gauges, sch.lat, sch.lon).gauge.id === 'kiel-holtenau' && wlNearestWithCurve(cat.gauges, sch.lat, sch.lon).gauge.id === 'kiel-holtenau');
const next = wlNearestWithCurve(cat.gauges, spo.lat, spo.lon, new Set([nSpo.gauge.id, cSpo.gauge.id]));
add('H3 Ausschluss: ein Pegel, dessen Live-Antwort keine Kurve trug, wird übersprungen; ohne Kandidat null',
  next.gauge.id !== cSpo.gauge.id && next.gauge.has.curve && next.km > cSpo.km
  && wlNearestWithCurve(cat.gauges.filter((g) => !g.has.curve), spo.lat, spo.lon) === null && wlNearestWithCurve([], 54, 8) === null,
  `danach ${next.gauge.name} ${next.km.toFixed(1)} km`);
add('H4 Die Live-Antwort entscheidet, der Katalog ist nur der Hinweis; höchstens drei Versuche',
  /const own = gaugeDoc \? gaugeDoc\.curve\.length > 0 : gauge\.has\.curve;/.test(pageSrc) && /const TIDE_CURVE_TRIES = 3;/.test(pageSrc)
  && /d\.curve\.length === 0\) setNoCurveIds/.test(pageSrc));
add('H5 Zwei Pegel = zwei Karten mit Namen und Entfernung; Ereignisse und amtlicher Text bleiben am nächsten Pegel',
  /part="curve" near=\{p\.waterLevel\.gauge\?\.name \?\? null\}/.test(readoutSrc) && /part === 'all' && events\.length > 0/.test(readoutSrc)
  && /part === 'all' && doc\.text/.test(readoutSrc) && /Jede Höhe gilt nur an diesem Pegel/.test(readoutSrc)
  && /km vom Spot/.test(readoutSrc.slice(readoutSrc.indexOf("part === 'curve' && (")))
  && !/interpol/i.test(bare(pageSrc)));

// --- I: deviation from the tide (E-TF-6) --------------------------------------------------------------
const both = cux.curve.find((p) => p.forecast != null && p.tide != null);
add('I1 Abweichung = Modellkurve − Gezeit am selben Punkt; ohne eines von beiden keine Zahl (Ostsee: nie)',
  tideDeviationCm(both) === both.forecast - both.tide && tideDeviationCm(null) === null
  && tideDeviationCm({ t: 1, forecast: 500, tide: null, measured: null }) === null
  && tideDeviationCm({ t: 1, forecast: null, tide: 500, measured: 480 }) === null && kiel.curve.every((p) => tideDeviationCm(p) === null),
  `${both.forecast} − ${both.tide} = ${tideDeviationCm(both)} cm`);
add('I2 Beschriftung wörtlich wie beauftragt, an Legende und Zeile; die Fläche wird nur zwischen beiden Linien gezeichnet',
  TIDE_DEVIATION_LABEL === 'Abweichung von der Gezeit (eigene Rechnung)' && /TIDE_DEVIATION_LABEL/.test(uiSrc) && /TIDE_DEVIATION_LABEL/.test(readoutSrc)
  && /className="sw-tf-dev"/.test(chartSrc) && /x\.id === 'Vorhersage'\), g = series\.find\(\(x\) => x\.id === 'Gezeit'\)/.test(chartSrc)
  && /deviation: window\.some\(\(pt\) => pt\.forecast != null && pt\.tide != null\)/.test(readoutSrc));

// --- K: wording (brief) and display ------------------------------------------------------------------
const FORBIDDEN = [/genug\s+Wasser/i, /\bsicher(e|er|es|en)?\b/i, /\bWassertiefe reicht/i];
const tfFiles = [['tideWindow.ts', ruleSrc], ['SeaTideWindow.tsx', uiSrc], ['SeaBand.tsx', bandSrc]];
const offenders = tfFiles.filter(([, t]) => FORBIDDEN.some((re) => re.test(t)));
add('K1 Kein „genug Wasser“, kein „sicher“ in Regeln, Regler und Stundenband', offenders.length === 0, offenders.map(([f]) => f).join(', '));
add('K1b Gegenprobe: das Muster erkennt beide Wörter',
  FORBIDDEN.some((re) => re.test('Hier ist genug Wasser.')) && FORBIDDEN.some((re) => re.test('Die Einfahrt ist sicher.')) && !FORBIDDEN.some((re) => re.test('über deiner Schwelle am Pegel X')));
add('K2 Der Satz der Anzeige: „über deiner Schwelle am Pegel X“ bzw. „unter …“',
  tideSideText('min', 'Cuxhaven, Steubenhöft, Elbe') === 'über deiner Schwelle am Pegel Cuxhaven, Steubenhöft, Elbe'
  && tideSideText('max', 'Kiel-Holtenau') === 'unter deiner Schwelle am Pegel Kiel-Holtenau'
  && /Fenster \{side\}/.test(uiSrc) && /tideSideText\(/.test(pageSrc));
add('K3 Schwelle in Worten: Zahl, Richtung und Bezug; negativ liest sich als „unter“',
  tideThresholdText(th, tideRefOf(rc, 'pnp')) === 'mindestens 550 cm über Pegelnull'
  && tideThresholdText({ mode: 'max', cm: -20, ref: 'nhn' }, tideRefOf(rc, 'nhn')) === 'höchstens 20 cm unter NHN'
  && tideThresholdText({ mode: 'min', cm: -106, ref: 'mhw' }, tideRefOf(rc, 'mhw')) === 'mindestens 106 cm unter MThw dieses Pegels');
const D = (iso) => Date.parse(iso);
add('K4 Zeiten der Fenster in Ortszeit; offenes Ende und offener Anfang werden gesagt statt eine Uhrzeit zu erfinden',
  tideWindowLabel({ from: D('2026-11-18T05:10:00Z'), to: D('2026-11-18T10:40:00Z'), tideOnly: false, openStart: false, openEnd: false }) === 'Mi 06:10–11:40'
  && tideWindowLabel({ from: D('2026-11-18T21:50:00Z'), to: D('2026-11-19T02:20:00Z'), tideOnly: false, openStart: false, openEnd: false }) === 'Mi 22:50 – Do 03:20'
  && tideWindowLabel({ from: D('2026-11-18T05:10:00Z'), to: D('2026-11-18T10:40:00Z'), tideOnly: false, openStart: true, openEnd: false }) === 'bis Mi 11:40'
  && tideWindowLabel({ from: D('2026-11-18T05:10:00Z'), to: D('2026-11-18T10:40:00Z'), tideOnly: true, openStart: false, openEnd: true }) === 'ab Mi 06:10'
  && tideWindowLabel({ from: D('2026-11-18T05:10:00Z'), to: D('2026-11-18T10:40:00Z'), tideOnly: false, openStart: false, openEnd: false }, true) === '06:10–11:40'
  && JSON.stringify(tideWindowLines({ from: D('2026-11-18T05:10:00Z'), to: D('2026-11-18T10:40:00Z'), tideOnly: false, openStart: false, openEnd: false })) === '["06:10","–11:40"]'
  && tideWindowLines({ from: D('2026-11-18T05:10:00Z'), to: D('2026-11-18T10:40:00Z'), tideOnly: false, openStart: true, openEnd: false })[0] === 'bis'
  && tideWindowLines({ from: D('2026-11-18T05:10:00Z'), to: D('2026-11-18T10:40:00Z'), tideOnly: true, openStart: false, openEnd: true }).join(' ') === 'ab 06:10');
add('K5 Anzeige: Bänder mit Zeit und Schwellenlinie im Diagramm, Zeile „Pegel“ im Stundenband, „nur Gezeit“ benannt',
  /className="sw-tf-bands"/.test(chartSrc) && /className="sw-tf-line"/.test(chartSrc) && /\{w\.label\[0\]\}/.test(chartSrc) && /\{w\.label\[1\]\}/.test(chartSrc)
  && /sw-band-tide/.test(bandSrc) && />Pegel<\/th>/.test(bandSrc) && /\(nur Gezeit\)/.test(bandSrc) && /<em>nur Gezeit<\/em>/.test(uiSrc)
  && /Fenster, nur Gezeit/.test(uiSrc));
add('K6 Die Schwellenlinie trägt keine Warnfarbe der Seite (eigene Zahl, keine Warnung)',
  !/#B5482E|#8A3320/i.test(chartSrc.slice(chartSrc.indexOf('const Threshold ='), chartSrc.indexOf('const Deviation =')))
  && /#B5482E/.test(chartSrc), 'Gegenprobe: die Windgrenze im selben Modul trägt sie');
add('K7 Mobil: der Regler sitzt in der unteren Leiste, die Karte im Dossier nennt nur die Schwelle (Media Query)',
  /\['tide', 'Schwelle', /.test(pageSrc) && /mobTab === 'tide' && tideView/.test(pageSrc)
  && /\.sw-m-dossier \.sw-tf-inline \{ display: none; \}/.test(src('seaDeck.css')) && /\.sw-tf-mobile \{ display: none; \}/.test(src('seaDeck.css')));

const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`\nverify:sea-tide-window — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
