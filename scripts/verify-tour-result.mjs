/**
 * verify:tour-result — phase TE (`audit/tour-ergebnis.md`): the pure derivations of the new route result and the stand
 * of buscosun Fusion the route part resolves to.
 *
 * Geometry and timing are REAL: the test routes in `test-routes/*.gpx` go through `buildTourTrack` and
 * `computeTimingIterated` (no wind; node has no DEM check). Weather values are NOT invented as a "typical day": each check
 * sets exactly the field it tests at the threshold edge (and a negative control on the other side) on the real samples.
 * Captured real samples (`window.__samples`) are Jan's step (MANUELLE-SCHRITTE §TE).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-tour-result.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { register } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const add = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const near = (a, b, eps) => Math.abs(a - b) <= eps;

/**
 * Node cannot load `movementTypes.tsx` (JSX icons), and `movementModels.ts` imports it. The types are read from its
 * source text with the semantics of its `profile()` builder and served to the app modules through a resolve hook — so the
 * app's real duration models run with the app's real defaults; a changed default changes this run, not a copy.
 */
const MT_SRC = readFileSync(join(ROOT, 'src/route/movementTypes.tsx'), 'utf8');
const MT = [...MT_SRC.matchAll(/id: '([a-z]+)', label: '([^']*)', category: '(foot|bike)'[\s\S]*?defaults: profile\(\{([^}]*)\}\)/g)].map((m) => {
  const kv = Object.fromEntries(m[4].split(',').map((x) => x.split(':').map((y) => y.trim())).filter((x) => x.length === 2).map(([k, v]) => [k, Number(v)]));
  return {
    id: m[1], label: m[2], category: m[3],
    defaults: { flatSpeedKmh: kv.flat, ascentRateMh: kv.ascent ?? 400, descentRateMh: kv.descent ?? 500, climbStrength: kv.climb ?? 3, maxDownhillKmh: kv.maxDown ?? 50, paceFactor: 1 },
  };
});
const stub = `export const MOVEMENT_TYPES = ${JSON.stringify(MT)}; export function getMovementType(id) { return MOVEMENT_TYPES.find((m) => m.id === id); }`;
const hook = `const STUB = ${JSON.stringify('data:text/javascript,' + encodeURIComponent(stub))};
export async function resolve(s, c, next) { if (/(^|[\\\\/])movementTypes(\\.tsx)?$/.test(s)) return { url: STUB, shortCircuit: true }; return next(s, c); }`;
register('data:text/javascript,' + encodeURIComponent(hook));
const getMovementType = (id) => MT.find((m) => m.id === id);

const { buildTourTrack } = await import('../src/route/tourTrack.ts');
const { computeTimingIterated } = await import('../src/route/tourTiming.ts');
const { MODELS } = await import('../src/route/movementModels.ts');
const { BREAK_DEFAULTS, defaultBreakConfig } = await import('../src/route/breaks.ts');
const { bearingAtDist, headwindComponentMps } = await import('../src/route/windEffect.ts');
const { TOUR_RESULT_V2, tourResultV2From } = await import('../src/route/tourResultFlag.ts');
const {
  WIND_CALM_MPS, WIND_CROSS_MPS, TOUR_WET_MMH, TEMP_CHANGE_K, GUST_EVENT_MPS, HEADWIND_EVENT_MPS,
  windRelationAt, windShares, weatherChanges, startFinishDelta, nearestSampleIndex, summarizeStartWindow,
  sampleSpansM, tourStand, sampleStand, confidenceWord, flagNotes,
} = await import('../src/route/tourResultModel.ts');
const { START_OFFSETS_MIN, START_COVERAGE_MIN, fusionVersionOfForecast } = await import('../src/pointForecast/weatherEnrichment.ts');
const { FUSION_CURRENT, FUSION_PARTS, FUSION_RELEASES, fusionName, fusionStage, fusionStageNote } = await import('../src/pointForecast/fusion/fusionRelease.ts');
const { fusionPathFor } = await import('../src/pointForecast/fusionForecast.ts');
const { pfRucMemberFrom } = await import('../src/pointForecast/pfFlags.ts');
const { WET_MMH } = await import('../src/nowcast/nowcastModel.ts');

/* ============================ real routes + timing ============================ */

function parseGpx(text) {
  const pts = [];
  const re = /<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"\s*>(?:\s*<ele>([-\d.]+)<\/ele>)?/g;
  let m;
  while ((m = re.exec(text))) pts.push({ lat: Number(m[1]), lon: Number(m[2]), ele: m[3] != null ? Number(m[3]) : undefined });
  const name = /<name>([^<]*)<\/name>/.exec(text)?.[1];
  return { name, points: pts };
}

add('Bewegungsarten aus movementTypes.tsx gelesen (8)', MT.length === 8, MT.map((m) => m.id).join(','));

const ROUTES = ['de-hilly-schauinsland', 'at-alpine-patscherkofel', 'ch-alpine-scheidegg', 'de-flat-berlin'];
const TYPES = ['gravel', 'wandern', 'ebike'];
const START = Date.UTC(2026, 10, 12, 8, 0);
const runs = [];
for (const r of ROUTES) {
  const parsed = parseGpx(readFileSync(join(ROOT, 'test-routes', `${r}.gpx`), 'utf8'));
  const track = await buildTourTrack(parsed, 'gpx');
  for (const id of TYPES) {
    const type = getMovementType(id);
    const res = computeTimingIterated(track, { ...type.defaults }, MODELS[id], defaultBreakConfig(BREAK_DEFAULTS[id]), START, type.category, null);
    runs.push({ route: r, id, track, samples: res.timing.sampleEtas, timing: res.timing });
  }
}
add('Testrouten: 4 Strecken × 3 Bewegungsarten gerechnet', runs.length === 12 && runs.every((x) => x.samples.length >= 2), runs.map((x) => `${x.route}/${x.id}:${x.samples.length}`).join(' '));
add('ETAs steigen entlang der Strecke (echte Zeitrechnung inkl. Pausen)', runs.every((x) => x.samples.every((s, i) => i === 0 || s.etaMs >= x.samples[i - 1].etaMs)));

const base = runs[0]; // Schauinsland, gravel
const P = base.track.points;
const S = base.samples;
const blank = () => ({
  temperatureC: null, apparentTempC: null, windSpeedMps: null, windDirectionDeg: null, gustMps: null, relativeHumidityPct: null,
  cloudCoverPct: null, uvIndex: null, precipitationMmH: null, precipitationSource: null, precipitationType: 'none', snowLineM: null,
  foehn: null, warnings: [], confidence: { temperature: 0, wind: 0, gust: 0, humidity: 0, precipitation: 0, clouds: 0, snowLine: 0, uvIndex: 0 },
  cellId: 0, sourcesUsed: [], isInterpolated: false, validityFlags: ['ok'],
});
const withW = (samples, f) => samples.map((s, i) => ({ ...s, weather: { ...blank(), ...f(s, i) } }));

/* ============================ switch ============================ */
add('Schalter: TOUR_RESULT_V2 ist an (Jan 11.11.), Rückfall ?tourv=1', TOUR_RESULT_V2 === true && !tourResultV2From('?tourv=1'));
add('Schalter: ?tourv=2 an, ?tourv=1 aus, sonst Vorgabe', tourResultV2From('?tourv=2', false) && !tourResultV2From('?tourv=1', true) && !tourResultV2From('', false) && tourResultV2From('', true) && !tourResultV2From('?x=1', false));

/* ============================ snapping ============================ */
add('Einrasten: jeder Sample-Abstand trifft sich selbst', base.samples.every((s, i) => nearestSampleIndex(S, s.dist) === i));
{
  let ok = true;
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i].dist, b = S[i + 1].dist;
    if (nearestSampleIndex(S, a + (b - a) * 0.4) !== i || nearestSampleIndex(S, a + (b - a) * 0.6) !== i + 1) { ok = false; break; }
  }
  add('Einrasten: 40 % der Lücke → links, 60 % → rechts', ok);
}
add('Einrasten: vor dem Start / hinter dem Ziel → Randpunkt, leer → −1', nearestSampleIndex(S, -500) === 0 && nearestSampleIndex(S, 1e9) === S.length - 1 && nearestSampleIndex([], 5) === -1);

/* ============================ wind relation ============================ */
{
  const s = S[Math.floor(S.length / 2)];
  const brg = bearingAtDist(P, s.dist);
  const at = (speed, dir) => windRelationAt({ dist: s.dist, weather: { ...blank(), windSpeedMps: speed, windDirectionDeg: dir } }, P);
  const tailFrom = (brg + 180) % 360;
  add('Wind: Rückenwind genau an der Ruhe-Schwelle → tail', at(WIND_CALM_MPS, tailFrom)?.rel === 'tail');
  add('Wind: knapp unter der Ruhe-Schwelle → calm (Gegenprobe)', at(WIND_CALM_MPS - 0.01, tailFrom)?.rel === 'calm');
  add('Wind: von vorn → head, Komponente = −Geschwindigkeit', at(6, brg)?.rel === 'head' && near(at(6, brg).componentMps, -6, 1e-9));
  add('Wind: von der Seite → cross', at(6, (brg + 90) % 360)?.rel === 'cross');
  // component exactly at the cross threshold: −6·cos θ = 0.7 → θ
  const th = (Math.acos(-WIND_CROSS_MPS / 6) * 180) / Math.PI;
  const atEdge = at(6, (brg + th) % 360);
  const th2 = (Math.acos(-(WIND_CROSS_MPS + 0.01) / 6) * 180) / Math.PI;
  add('Wind: Komponente = +0,7 m/s bleibt Seite, +0,71 → Rücken', atEdge?.rel === 'cross' && at(6, (brg + th2) % 360)?.rel === 'tail', `${atEdge?.componentMps}`);
  add('Wind: über der Schwelle ohne Richtung → null (E-FR-5, nie 0° = Nord)', at(6, null) === null);
  add('Wind: schwach ohne Richtung → calm', at(2, null)?.rel === 'calm');
  add('Wind: Komponente = headwindComponentMps (eine Formel)', near(at(7, 33).componentMps, headwindComponentMps(brg, 33, 7), 1e-12));
  add('Wind: kein Wert → null', windRelationAt({ dist: s.dist, weather: undefined }, P) === null);
}

/* ============================ shares by distance ============================ */
{
  const total = S[S.length - 1].dist - S[0].dist;
  const cut = S[0].dist + total * 0.3;
  const wx = withW(S, (s) => {
    const brg = bearingAtDist(P, s.dist);
    return s.dist < cut ? { windSpeedMps: 8, windDirectionDeg: brg } : { windSpeedMps: 8, windDirectionDeg: (brg + 180) % 360 };
  });
  const sh = windShares(wx, P);
  const spans = sampleSpansM(S);
  const exp = S.reduce((a, s, i) => a + (s.dist < cut ? spans[i] : 0), 0) / spans.reduce((a, b) => a + b, 0);
  const byCount = S.filter((s) => s.dist < cut).length / S.length;
  add('Anteile: nach Strecke gewichtet (Gegenwind = Streckenanteil)', near(sh.share.head, exp, 1e-9) && near(sh.share.head + sh.share.tail, 1, 1e-9), `head ${sh.share.head.toFixed(4)} exp ${exp.toFixed(4)} count ${byCount.toFixed(4)}`);
  add('Anteile: Spannen summieren sich zur Streckenlänge', near(spans.reduce((a, b) => a + b, 0), total, 1e-6));
  add('Anteile: stärkster Gegenwind gefunden (−8 m/s)', sh.strongestHead && near(sh.strongestHead.componentMps, -8, 1e-6) && S[sh.strongestHead.index].dist < cut);
  const none = windShares(withW(S, () => ({ windSpeedMps: 9, windDirectionDeg: null })), P);
  add('Anteile: ohne Richtung → „unknown", kein Gegenwind (Gegenprobe)', none.share.unknown === 1 && none.strongestHead === null);
}

/* ============================ changes ============================ */
{
  const n = S.length;
  const a = Math.floor(n * 0.3), b = Math.floor(n * 0.6);
  const rain = weatherChanges(withW(S, (_, i) => ({ precipitationMmH: i >= a && i < b ? TOUR_WET_MMH : 0.05 })), P);
  add('Wechsel: Regen setzt bei genau 0,1 mm/h ein und hört auf', rain.length === 2 && rain[0].kind === 'rain-start' && rain[0].index === a && rain[1].kind === 'rain-stop' && rain[1].index === b, JSON.stringify(rain.map((e) => [e.kind, e.index])));
  const dry = weatherChanges(withW(S, () => ({ precipitationMmH: TOUR_WET_MMH - 0.001 })), P);
  add('Wechsel: knapp unter 0,1 mm/h überall → kein Ereignis (Gegenprobe)', dry.length === 0);
  const gaps = weatherChanges(withW(S, (_, i) => ({ precipitationMmH: i % 2 ? null : 0 })), P);
  add('Wechsel: fehlende Werte sind keine Wechsel', gaps.length === 0);
  add('Nass-Schwelle = nowcastModel.WET_MMH (V-TE-5)', TOUR_WET_MMH === WET_MMH);

  // temperature: drop TEMP_CHANGE_K at the first sample within the window
  const k = S.findIndex((s) => s.dist - S[0].dist > 200);
  const cool = weatherChanges(withW(S, (_, i) => ({ temperatureC: i >= k ? 10 - TEMP_CHANGE_K : 10 })), P);
  add('Wechsel: Abkühlung um genau 2 K innerhalb des Fensters', cool.length === 1 && cool[0].kind === 'cooling' && cool[0].index === k, JSON.stringify(cool.map((e) => [e.kind, e.index])));
  const flat = weatherChanges(withW(S, (_, i) => ({ temperatureC: i >= k ? 10 - TEMP_CHANGE_K + 0.01 : 10 })), P);
  add('Wechsel: 1,99 K → kein Ereignis (Gegenprobe)', flat.length === 0);

  const g = Math.floor(n / 2);
  const gust = weatherChanges(withW(S, (_, i) => ({ gustMps: i >= g ? GUST_EVENT_MPS : GUST_EVENT_MPS - 0.1 })), P);
  add('Wechsel: erste Böe ≥ 36 km/h', gust.length === 1 && gust[0].kind === 'gust' && gust[0].index === g);
  const gust0 = weatherChanges(withW(S, () => ({ gustMps: 15 })), P);
  add('Wechsel: Böe schon am Start ist Zustand, kein Wechsel', gust0.length === 0);

  const hw = weatherChanges(withW(S, (s, i) => {
    const brg = bearingAtDist(P, s.dist);
    return i >= g ? { windSpeedMps: HEADWIND_EVENT_MPS + 3, windDirectionDeg: brg } : { windSpeedMps: 6, windDirectionDeg: (brg + 180) % 360 };
  }), P);
  add('Wechsel: Umschlag auf Gegenwind ≥ 2 m/s', hw.filter((e) => e.kind === 'headwind').length === 1 && hw.find((e) => e.kind === 'headwind').index === g);

  const d0 = startFinishDelta(withW(S, () => ({ temperatureC: 12, windSpeedMps: 3, cloudCoverPct: 50, precipitationMmH: 0 })), 0);
  add('Start→Ziel: gleiches Wetter → „kaum", Deltas 0', d0.level === 'kaum' && d0.tempK === 0 && d0.wetShare === 0);
  const d1 = startFinishDelta(withW(S, (_, i) => ({ temperatureC: i === n - 1 ? 6 : 12 })), 0);
  add('Start→Ziel: −6 K → „deutlich"', d1.level === 'deutlich' && d1.tempK === -6);
  const d2 = startFinishDelta(withW(S, () => ({ temperatureC: 12 })), 1);
  add('Start→Ziel: ein Wechsel unterwegs hebt auf „spürbar"', d2.level === 'spürbar');
}

/* ============================ start window ============================ */
{
  const e = (offsetMin, wetMin, complete = true) => ({ offsetMin, wetMin, peakMmH: 0, totalMm: 0, peakGustMps: 0, peakWindMps: 0, minApparentC: null, radarShare: 0, coverage: complete ? 1 : START_COVERAGE_MIN - 0.1, complete });
  const now = START - 30 * 60_000;
  const s1 = summarizeStartWindow([e(-15, 10), e(0, 40), e(15, 5, false), e(30, 10), e(60, 0, false)], START_OFFSETS_MIN, START, now);
  add('Startfenster: unvollständige Einträge werden nie empfohlen', s1.best && s1.best.complete && s1.best.offsetMin === -15, `best ${s1.best?.offsetMin}`);
  add('Startfenster: Gleichstand → kleinere Verschiebung (−15 vor +30)', s1.best.offsetMin === -15 && s1.betterExists);
  const s2 = summarizeStartWindow([e(-15, 10), e(0, 10), e(15, 10)], START_OFFSETS_MIN, START, now);
  add('Startfenster: jetzt gleich gut → keine bessere Zeit', s2.best.offsetMin === 0 && !s2.betterExists);
  const rows = s1.rows.filter((r) => r.past).map((r) => r.offsetMin);
  add('Startfenster: Zeilen vor „jetzt" sind Vergangenheit', rows.length > 0 && rows.every((o) => START + o * 60_000 < now) && !s1.rows.find((r) => r.offsetMin === 0).past, rows.join(','));
  const s3 = summarizeStartWindow([], START_OFFSETS_MIN, START, now);
  add('Startfenster: leer → nichts empfohlen', s3.best === null && !s3.betterExists && s3.rows.length === START_OFFSETS_MIN.length);
}

/* ============================ confidence, flags ============================ */
add('Konfidenz: 0,75 hoch, 0,55 mittel, 0,54 niedrig, 0/null → kein Wort', confidenceWord(0.75) === 'hoch' && confidenceWord(0.55) === 'mittel' && confidenceWord(0.54) === 'niedrig' && confidenceWord(0) === null && confidenceWord(null) === null);
add('Flags: beyond_horizon / fusion_failed / radar_override in Worten', flagNotes(['beyond_horizon', 'fusion_failed', 'radar_override']).length === 3 && flagNotes(['ok']).length === 0);

/* ============================ stand of buscosun Fusion ============================ */
{
  const route = FUSION_PARTS.find((x) => x.id === 'route');
  add('Register: Teil „route" ist an und nimmt den Cube-Pfad', route?.on === true && fusionPathFor('route', '') === 'cube');
  add('Register: ?pf=live zwingt den Live-Pfad (Schalter bleibt)', fusionPathFor('route', '?pf=live') === 'live');
  const st = fusionStage();
  add(`Register: aktueller Stand = ${fusionName(FUSION_CURRENT)} und = 14`, st.version === FUSION_CURRENT && FUSION_CURRENT === 14 && st.label === 'buscosun Fusion 14', st.label);
  const ruc = FUSION_RELEASES.find((r) => r.io?.key === 'rucMember');
  const off = fusionStage((r) => r === ruc);
  add('Gegenprobe ?rucm=0: Schalter liest aus, Stufe = 13', pfRucMemberFrom('?rucm=0') === false && pfRucMemberFrom('') === true && off.version === 13 && off.label.startsWith('buscosun Fusion 13'), off.label);
  const fc14 = { cube: { notes: [fusionStageNote(st, ', Stationswert')] } };
  const fc13 = { cube: { v2: { provenance: { notes: [fusionStageNote(off, '')] } } } };
  add('Stand aus der Notiz: 14 (cube.notes) und 13 (v2.provenance.notes), live → null', fusionVersionOfForecast(fc14) === 14 && fusionVersionOfForecast(fc13) === 13 && fusionVersionOfForecast({}) === null && fusionVersionOfForecast(null) === null);
  const t14 = tourStand({ clusterFusion: [14, 14, 14], pointSource: 'fusion' });
  add('Anzeige: alle Abschnitte 14 → „buscosun Fusion 14", kein Rückfall', t14.text === fusionName(FUSION_CURRENT) && t14.fallback === null, t14.text);
  const t13 = tourStand({ clusterFusion: [13, 13], pointSource: 'fusion' });
  add('Anzeige mit ?rucm=0: „buscosun Fusion 13" + Rückfall-Hinweis', t13.text === 'buscosun Fusion 13' && /Rückfall/.test(t13.fallback ?? ''), `${t13.text} | ${t13.fallback}`);
  const tmix = tourStand({ clusterFusion: [14, null], pointSource: 'mixed' });
  add('Anzeige gemischt: Live-Abschnitte werden benannt', tmix.text === 'buscosun Fusion 14' && /1 von 2/.test(tmix.fallback ?? ''), tmix.fallback);
  const tlive = tourStand({ clusterFusion: [null], pointSource: 'live' });
  add('Anzeige ?pf=live: Live-Punktvorhersage mit Rückfall', tlive.text === 'Live-Punktvorhersage' && !!tlive.fallback);
  const w = { ...blank(), cellId: 1 };
  add('Je Wert: Stand des eigenen Clusters', sampleStand({ weather: w }, { clusterFusion: [14, 13] }).text === 'buscosun Fusion 13' && !!sampleStand({ weather: w }, { clusterFusion: [14, 13] }).fallback);
  add('Je Wert: fusion_failed wird als Rückfall genannt', /Rückfall/.test(sampleStand({ weather: { ...w, validityFlags: ['fusion_failed'] } }, { clusterFusion: [14, 14] }).fallback ?? ''));
}

/* ============================ report ============================ */
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
console.log(`\nverify:tour-result ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
