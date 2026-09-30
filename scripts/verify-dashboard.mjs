/**
 * verify-dashboard.mjs — Gate des Wetter-Dashboards, rein und headless (Phase DB, audit/dashboard.md).
 *
 *   npm run verify:dashboard
 *
 * Prüft ohne Browser und ohne Netz:
 *   (1) URL-Zustand (`dashUrl.ts`): Schlüssel, Standardwerte, Rundlauf.
 *   (2) Herkunftstabelle (`origin.ts`) gegen die Abdeckungsmatrix im Phasendokument (Zeile für Zeile, Status gleich) und
 *       gegen verbotene Quellen (Live-Pfad, Rasterfusion).
 *   (3) Das View-Model aus ECHTER Fusion-Form: Fixture-Cube (scripts/lib/pvCubeFixtures.mjs) → Leser → buscosun Fusion
 *       (`getPointForecastFromCube`) → `buildDashboardVM`; jede Zusammenfassung wird unabhängig nachgerechnet.
 *   (4) Regeln an den gezeichneten Beispielen der Vorlage (Symbole, Tagestexte, Isothermen 6/10/14 °C …).
 *   (5) Wörtliche Warntexte, Zustände ohne Vorlage, „nicht verfügbar" nie mit Zahl.
 *   (6) optional `--dist`: Textsonde am Bau — nichts vom Dashboard im Start-Chunk, die Fixture in keinem Chunk.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildCubeFixture, FIX } from './lib/pvCubeFixtures.mjs';
import { memoryStore } from '../src/point/client/store.ts';
import { ClimaField } from '../src/ml/climaField.ts';
import { getPointForecastFromCube, CUBE_CELL_PLANES } from '../src/pointForecast/cubeSource.ts';
import { exceedance } from '../src/pointForecast/fusion/dist.ts';
import { solarPosition } from '../src/pointForecast/terrainPhysics.ts';
import { verifyDashUrl, DASH_RANGE_HOURS, DASH_RANGE_DAYS } from '../src/dashboard/dashUrl.ts';
import { ORIGIN } from '../src/dashboard/origin.ts';
import { buildDashboardVM, hourAxis, pWetOf } from '../src/dashboard/model/build.ts';
import { localParts, num } from '../src/dashboard/format.ts';
import {
  symbolFor, dayText, popLevel, confidenceClass, confidenceWord, isotherms, snowlineShown, uvColor, uvBarPct, pollenColor, thunderWord, tempAt, spreadText, GUST_WARN_MS,
  bandMarks, leadSentence, BAND_MARK_K, WET_DAY_MM,
} from '../src/dashboard/model/rules.ts';
import { nightsOf } from '../src/dashboard/data/forecastStore.ts';
import { templateVM } from '../src/dashboard/fixture.ts';
import { parseAtWarnings } from '../src/dashboard/data/atWarnings.ts';
import { parseWarnContext, GS_FIXTURE } from '../src/fire/sources/geosphereWarnContext.ts';

const H = 3_600_000;
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// (1) URL-Zustand
// ---------------------------------------------------------------------------
{
  const f = verifyDashUrl();
  add('(1) dashUrl: Schlüssel ansicht/zeitraum, Standardwerte nie geschrieben, Reihenfolge, Rundlauf', f.length === 0, f.join(' · '));
  add('(1) Zeiträume: Heute 24 h/1 Tag, 3 Tage 72 h/3, 7 Tage 168 h/7, 14 Tage 336 h/14',
    DASH_RANGE_HOURS.heute === 24 && DASH_RANGE_HOURS['3-tage'] === 72 && DASH_RANGE_HOURS['7-tage'] === 168 && DASH_RANGE_HOURS['14-tage'] === 336
    && DASH_RANGE_DAYS.heute === 1 && DASH_RANGE_DAYS['14-tage'] === 14);
}

// ---------------------------------------------------------------------------
// (2) Herkunftstabelle ⇄ Abdeckungsmatrix im Phasendokument
// ---------------------------------------------------------------------------
{
  const ids = Object.keys(ORIGIN);
  const want = Array.from({ length: 93 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  add('(2) origin.ts trägt genau P01–P93 (P89–P93 = E-DB-23)', ids.length === 93 && want.every((id) => ids.includes(id)), `${ids.length} Einträge`);
  const kinds = new Set(['fusion', 'fusion-derived', 'data', 'web', 'unavailable', 'ui']);
  add('(2) jede Herkunft hat eine gültige Art, Quelle und Pfad', ids.every((id) => kinds.has(ORIGIN[id].kind) && ORIGIN[id].source && ORIGIN[id].path));
  // Verboten: der Live-Pfad (getPointForecast ohne Cube) und die Rasterfusion. `src/fusion/elevation.ts` ist der
  // Terrarium-Leser (liegt nur historisch im Ordner der Rasterfusion) und ausdrücklich erlaubt.
  const bad = ids.filter((id) => /fusionEngine|loadFusedForecast|pointForecast\.ts|sampleSources|brightSkyForecast/.test(`${ORIGIN[id].source} ${ORIGIN[id].path}`)
    || (/src\/fusion\//.test(ORIGIN[id].path) && !/src\/fusion\/elevation\.ts/.test(ORIGIN[id].path)));
  add('(2) keine Herkunft zeigt auf den Live-Pfad oder die Rasterfusion', bad.length === 0, bad.join(', '));
  const doc = readFileSync('audit/dashboard.md', 'utf8');
  const sec = doc.slice(doc.indexOf('## 4. Abdeckungsmatrix'), doc.indexOf('## 5.'));
  const rows = [...sec.matchAll(/^\| (P\d\d) \|.*\| ([^|]+) \|\s*$/gm)].map((m) => [m[1], m[2].replace(/\*\*/g, '').trim()]);
  const docKind = (s) => (/^n\. v\./.test(s) ? 'unavailable' : /^F·abg/.test(s) ? 'fusion-derived' : /^F\b/.test(s) ? 'fusion' : /^A-data/.test(s) ? 'data' : /^A-web/.test(s) ? 'web' : /^UI/.test(s) ? 'ui' : '?');
  const mism = rows.filter(([id, st]) => !ORIGIN[id] || docKind(st) !== ORIGIN[id].kind).map(([id, st]) => `${id}: Doku ${docKind(st)} ≠ Code ${ORIGIN[id]?.kind}`);
  add('(2) die Abdeckungsmatrix (audit/dashboard.md §4 mit §4.7) nennt P01–P93 je einmal, mit derselben Herkunftsart wie origin.ts',
    rows.length === 93 && new Set(rows.map((r) => r[0])).size === 93 && mism.length === 0, mism.slice(0, 6).join(' · ') || `${rows.length} Zeilen`);
}

// ---------------------------------------------------------------------------
// (3) View-Model aus echter Fusion-Form
// ---------------------------------------------------------------------------
const flatScales = (h) => ({ elevationM: h, ringMeanM: [h, h, h, h, h, h], spreadM: [0, 0, 0, 0, 0, 0], tpiM: [0, 0, 0, 0, 0, 0], horizonRad: [0, 0, 0, 0, 0, 0, 0, 0], sampledCount: 48 });
const flatTerrain = (h) => ({ elevationM: h, tpi500M: 0, tpi2000M: 0, svf: 1, slopeDeg: 0, aspectDeg: 0, horizonDeg: [0, 0, 0, 0, 0, 0, 0, 0], scales: flatScales(h), sinkDepthM: 0 });
const clima = new ClimaField({
  meta: { source: 'test', region: 'T', years: [2000, 2020], binDeg: 1, K: 0, tau: 1, lapsePerM: 0.0065, stationCount: 1 },
  stations: [{ id: 'A', name: 'A', lat: 48.14, lon: 11.58, elev: 525, tc: [12], sc: [5], wc: [0.3], tnc: [7], txc: [17], t50: null, base: 0.3, n: 9999 }],
});
const fx = await buildCubeFixture();
const io = { store: memoryStore(fx.files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue) };
const fc = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false }, io);
const cube = fc.cube;
const fusion = { v2: cube.v2, cells: cube.cells ?? [], emission: null, pending: [], notes: [...cube.notes, ...cube.v2.provenance.notes], pWet: pWetOf(cube.v2, exceedance), night0: solarPosition(FIX.lat, FIX.lon, cube.v2.axis.steps[0].validAtMs).elevationDeg < 0,
  nights: nightsOf({ name: 'München', lat: FIX.lat, lon: FIX.lon, country: 'DE' }, cube.v2.axis.steps, solarPosition) };
const place = { name: 'München', lat: FIX.lat, lon: FIX.lon, country: 'DE' };
const ok = (x) => ({ state: 'ok', ...x });
const extras = {
  warnings: { state: 'ok', channel: 'DWD CAP', items: [], stampMs: FIX.nowMs, note: null },
  uv: ok({ city: 'München', distanceKm: 2, days: [3, 4, 2], note: null }),
  pollen: ok({ region: 'Allgäu/Oberbayern', species: [{ name: 'Erle', levels: [0, 1, 2] }], note: null }),
  nowcast: { state: 'loading', sources: [], horizonLabel: '…', frames: [], slotMs: null, note: null },
  cells: { state: 'loading', text: null }, hail: { state: 'na', text: '— (nur CH)' },
  terrain: { state: 'loading', halfKm: 20, axisDeg: 225, profile: [], stations: [], outside: [], note: null },
  iconD2: { state: 'loading', thunderMax: null, rotationMax: null, snowFresh24: null, gustMax: null, run: null, note: null },
};
const inputs = (over = {}) => ({ nowMs: FIX.nowMs, place, range: '3-tage', fusionState: 'ok', fusionError: null, fusion, ...extras, ...over });

/** Alle `Shown` eines View-Models (Objekte mit `o` = P-Nummer und Feld `t`). */
function shownOf(obj, out = []) {
  if (obj && typeof obj === 'object') {
    if (typeof obj.o === 'string' && /^P\d\d$/.test(obj.o) && 't' in obj) out.push(obj);
    for (const v of Object.values(obj)) shownOf(v, out);
  }
  return out;
}
function invariants(vm, label) {
  const all = shownOf(vm);
  const naWithText = all.filter((s) => ORIGIN[s.o].kind === 'unavailable' && s.t != null);
  const textNoNa = all.filter((s) => s.t == null && s.na != null && typeof s.na !== 'string');
  const junk = all.filter((s) => s.t != null && /NaN|undefined|null|Infinity/.test(s.t));
  add(`(3) ${label}: „nicht verfügbar"-Herkünfte zeigen nie eine Zahl, kein Text trägt NaN/undefined/null (${all.length} Werte)`,
    naWithText.length === 0 && textNoNa.length === 0 && junk.length === 0,
    [...naWithText.map((s) => `${s.o}=${s.t}`), ...junk.map((s) => `${s.o}=${s.t}`)].slice(0, 5).join(' · '));
  return all;
}

{
  add('(3) cubeSource reicht die Zellwerte durch (E-DB-8): cells an nativen Schritten mit allen Ebenen', fusion.cells.length > 0 && CUBE_CELL_PLANES.every((p) => p in fusion.cells[0].v),
    `${fusion.cells.length} Zeilen`);
  const vm = buildDashboardVM(inputs());
  invariants(vm, '3 Tage');
  const steps = [...cube.v2.axis.steps].sort((a, b) => a.validAtMs - b.validAtMs);
  const s0 = steps[0];
  add('(3) Jetzt = Stunde 0 der Fusion (T, Td, rF, Druck am Ort)', vm.now.temp.t === num(s0.vars.t2m.p50, 1) && vm.now.td.t?.startsWith(num(s0.vars.td2m.p50, 1))
    && vm.now.rh.t?.startsWith(num(s0.vars.rh.p50, 0)) && vm.now.psLabel === 'DRUCK AM ORT', `${vm.now.temp.t} · ${vm.now.td.t} · ${vm.now.ps.t}`);
  add('(3) Lauf aus der Provenienz der Stufe t1', vm.top.run.t === `${FIX.runs.t1.slice(8, 10)}Z`, vm.top.run.t);
  add('(3) Anker-Uhrzeit ist „nicht verfügbar" (V-DB-2), Status FUSION', vm.top.anchorTime.t == null && !!vm.top.anchorTime.na && /FUSION/.test(vm.top.status.text));
  const conf0 = s0.vars.t2m.confidence?.score;
  add('(3) Konfidenz-Kachel = Konfidenz-Index der Temperatur an Stunde 0', vm.conf.pct === (conf0 == null ? null : Math.round(conf0 * 100)), `${vm.conf.pct} %`);
  const wsum = vm.conf.weights.reduce((a, w) => a + w.pct, 0);
  add('(3) Gewichtsleiste aus den Membern der Temperatur, Summe ≈ 100 %, keine ERA5-Beschriftung', vm.conf.weights.length > 0 && wsum >= 97 && wsum <= 103 && !vm.conf.weights.some((w) => /ERA5/.test(w.label)), vm.conf.weightsText.t);
  add('(3) 3 Tage ⇒ 3 Tageskarten, erste hervorgehoben, Titel Heute/Morgen/Übermorgen',
    vm.zone.days.length === 3 && vm.zone.days[0].highlight && /^Heute · /.test(vm.zone.days[0].title) && /^Morgen · /.test(vm.zone.days[1].title) && /^Übermorgen · /.test(vm.zone.days[2].title));
  // Tag 2 unabhängig nachrechnen.
  const d1 = vm.zone.days[1];
  const inDay = steps.filter((s) => localParts(s.validAtMs).dayKey === d1.key);
  const tmax = Math.max(...inDay.map((s) => s.vars.t2m.p50)), tmin = Math.min(...inDay.map((s) => s.vars.t2m.p50));
  add('(3) Tmax/Tmin = Maximum/Minimum von t2m.p50 über den Kalendertag (Europe/Berlin)', d1.tmax.t === `${Math.round(tmax)}°` && d1.tmin.t === `${Math.round(tmin)}°`, `${d1.tmax.t}/${d1.tmin.t}`);
  const rain = inDay.reduce((a, s) => a + (s.vars.precip?.mean ?? 0), 0);
  add('(3) Regen = Summe der Stundenmittel (nicht der p50)', d1.rain.t === `${num(rain, 1)} mm`, `${d1.rain.t} ⇔ ${rain.toFixed(2)}`);
  const popMax = Math.max(...inDay.map((s) => (s.vars.precip?.dist ? exceedance(s.vars.precip.dist, 0) : 0)));
  add('(3) „max N %" = größte P(Niederschlag > 0) des Tages aus der Verteilung der Fusion', d1.rainSub.t === `max ${Math.round(popMax * 100)} %`, d1.rainSub.t);
  const nextKey = localParts(inDay[inDay.length - 1].validAtMs + 2 * H).dayKey;
  const night = steps.filter((s) => { const p = localParts(s.validAtMs); return p.dayKey === nextKey && p.h < 6; });
  const nightT = night.reduce((a, s) => a + s.vars.t2m.p50, 0) / night.length;
  add('(3) Phase NACHT = 00–06 Uhr des Folgetags, Temperatur = Mittel der Stunden', d1.phases[3].id === 'NACHT' && d1.phases[3].temp.t === `${Math.round(nightT)}°`, `${d1.phases[3].temp.t} ⇔ ${nightT.toFixed(2)}`);
  const gustPh = d1.phases.filter((p) => p.highlight);
  add(`(3) Hervorhebung nur bei Böen ≥ ${GUST_WARN_MS} m/s (dann „Böen N" statt Mittelwind)`, gustPh.every((p) => /^Böen \d+$/.test(p.wind.t ?? '')) && d1.phases.filter((p) => !p.highlight).every((p) => !/^Böen/.test(p.wind.t ?? '')));
  add('(3) Sonne ist „nicht verfügbar" (E-DB-10), UV aus der DWD-Eingabe', vm.zone.days.every((d) => d.sun.t == null && !!d.sun.na) && vm.zone.days[0].sunSub.t === 'UV 3');
  const hv = vm.zone.hourly;
  add('(3) Stundenverlauf: 73 Stunden (0–72 h), Beginn = Stunde 0, Tagesgrenzen an Mitternacht Ortszeit',
    hv.points.length === 73 && hv.startMs === s0.validAtMs && hv.dayLines.every((d) => localParts(d.t).h === 0), `${hv.points.length} Punkte, ${hv.dayLines.length} Tagesgrenzen`);
  add('(3) Achsenmarken: Desktop 02/08/14/20 Uhr, mobil ≤ 5 mit Wochentag', hv.ticks.every((t) => [2, 8, 14, 20].includes(localParts(t.t).h)) && hv.ticksMobile.length <= 5 && hv.ticksMobile.every((t) => /^\w{2} \d{2}:\d{2}$/.test(t.label)),
    `${hv.ticks.length} / ${hv.ticksMobile.length}`);
  add('(3) Band p10–p90 aus der Fusion (p10 ≤ p50 ≤ p90)', hv.points.every((p) => p.t10 == null || (p.t10 <= p.t50 + 1e-9 && p.t50 <= p.t90 + 1e-9)));
  add('(3) Kopf nennt die Herkunft der Bandbreite (sigmaKind), nicht pauschal „Ensemble"', vm.zone.head.ensemble.t === spreadText(s0.vars.t2m.sigmaKind, null, 72) || /bis \d+ h/.test(vm.zone.head.ensemble.t ?? ''), vm.zone.head.ensemble.t);
  add('(3) Bewölkung: Schichten nur aus nativen Schritten, Gesamt mit p10/p50/p90', vm.clouds.layers.length === 3 && vm.clouds.total.length > 0 && vm.clouds.total.every((t) => t.p50 == null || (t.p10 <= t.p50 + 1e-9 && t.p50 <= t.p90 + 1e-9)));
  const firstNull = steps.findIndex((s) => s.vars.windDir?.p50 == null);
  const expReach = firstNull <= 0 ? null : Math.round((steps[firstNull - 1].validAtMs - s0.validAtMs) / H);
  add('(3) Windrichtung „belastbar bis" = letzte Stunde vor der ersten Stunde ohne freigegebene Richtung', vm.wind.reachHours === (firstNull === -1 ? Math.round((steps.filter((s) => s.validAtMs <= s0.validAtMs + 336 * H).at(-1).validAtMs - s0.validAtMs) / H) : expReach), `${vm.wind.reachHours} h`);
  add('(3) Windrose: Anteile summieren sich auf 1 (oder 0 ohne Richtung)', (() => { const s = vm.wind.sectors.reduce((a, x) => a + x.share, 0); return near(s, 1, 1e-9) || s === 0; })());

  const vm14 = buildDashboardVM(inputs({ range: '14-tage' }));
  invariants(vm14, '14 Tage');
  add('(3) 14 Tage ⇒ 14 Tageskarten, 337 Stunden, Tage jenseits des Horizonts „nicht verfügbar" statt Zahl',
    vm14.zone.days.length === 14 && vm14.zone.hourly.points.length === 337 && vm14.zone.days.every((d) => d.tmax.t != null || !!d.tmax.na));
  const vmH = buildDashboardVM(inputs({ range: 'heute' }));
  const hNow = localParts(FIX.nowMs).h;
  const pastWant = [12, 18, 24].filter((to) => to <= hNow).length;
  const pastGot = vmH.zone.days[0].phases.filter((p) => p.temp.na && /vergangen/.test(p.temp.na)).length;
  add('(3) Heute ⇒ eine Tageskarte, 25 Stunden; heute abgelaufene Phasen „nicht verfügbar (vergangen)" statt Zahl', vmH.zone.days.length === 1 && vmH.zone.hourly.points.length === 25 && pastGot === pastWant, `${pastGot} vergangen um ${hNow} Uhr`);
}

// ---------------------------------------------------------------------------
// (3b) E-DB-23: Bandbreite, Trichter, Marken, Nächte, Leitsatz — unabhängig nachgerechnet (audit/dashboard.md §12)
// ---------------------------------------------------------------------------
{
  const NB = ' ';
  const H1 = 3_600_000;
  const steps = [...cube.v2.axis.steps].sort((a, b) => a.validAtMs - b.validAtMs);
  const half = (s) => (s.vars.t2m?.p10 == null || s.vars.t2m?.p90 == null ? null : (s.vars.t2m.p90 - s.vars.t2m.p10) / 2);
  const vm = buildDashboardVM(inputs());
  const h0 = half(steps[0]);
  add('(3b) Bandbreite jetzt = halbe Breite p10–p90 an Stunde 0 („±x,x °C"), der 80-%-Satz nennt p10 und p90',
    vm.conf.band.o === 'P89' && vm.conf.band.t === `±${num(h0, 1)}${NB}°C`
    && vm.conf.bandRange.t === `jetzt: 80${NB}% zwischen ${num(steps[0].vars.t2m.p10, 1)} und ${num(steps[0].vars.t2m.p90, 1)}${NB}°C`, `${vm.conf.band.t} · ${vm.conf.bandRange.t}`);
  const withBand = steps.filter((s) => half(s) != null).map((s) => ({ h: Math.round((s.validAtMs - steps[0].validAtMs) / H1), half: half(s) }));
  const hEnd = withBand.at(-1).h;
  const wantFunnel = [withBand[0]];
  for (let from = 0; from < hEnd; from += 24) {
    const b = withBand.filter((p) => p.h > from && p.h <= from + 24);
    if (b.length) wantFunnel.push({ h: Math.min(from + 24, hEnd), half: Math.max(...b.map((p) => p.half)) });
  }
  add('(3b) Trichter = Hüllkurve: jetzt, dann je 24 h die größte halbe Bandbreite (unabhängig nachgerechnet); jede Stütze ≥ jede Stunde ihres Tages',
    JSON.stringify(vm.conf.funnel) === JSON.stringify(wantFunnel) && vm.conf.funnel[0].h === 0 && Math.abs(vm.conf.funnel[0].half - h0) < 1e-9
    && withBand.every((p) => p.h === 0 || p.half <= vm.conf.funnel.find((f) => f.h >= p.h).half + 1e-9), `${vm.conf.funnel.length} Stützen bis ${vm.conf.funnel.at(-1)?.h} h`);
  const wantMarks = BAND_MARK_K.map((k) => { const s = steps.find((x) => half(x) != null && half(x) >= k); return s ? { k, h: Math.round((s.validAtMs - steps[0].validAtMs) / H1) } : null; }).filter(Boolean);
  add('(3b) Trichter-Marken = erste Stunde, an der die halbe Bandbreite 2/3/4 °C erreicht',
    JSON.stringify(vm.conf.funnelMarks.map((m) => ({ k: m.k, h: m.h }))) === JSON.stringify(wantMarks), JSON.stringify(wantMarks));
  add('(3b) bandMarks, Gegenprobe: unter 2 °C keine Marke; genau 2 °C setzt sie; ein Sprung auf 5 °C setzt 3 und 4 an derselben Stunde',
    bandMarks([{ t: 1, half: 1.9 }, { t: 2, half: 1.99 }]).length === 0
    && bandMarks([{ t: 1, half: 1 }, { t: 2, half: 2 }, { t: 3, half: 5 }]).map((m) => `${m.k}@${m.t}`).join(',') === '2@2,3@3,4@3');
  const pts = vm.zone.hourly.points;
  const wantH = BAND_MARK_K.map((k) => pts.find((p) => p.t10 != null && p.t90 != null && (p.t90 - p.t10) / 2 >= k)).filter(Boolean).map((p) => p.t);
  add('(3b) Marken im Stundenverlauf nur im gewählten Zeitraum, an der ersten Stunde je Schwelle',
    JSON.stringify(vm.zone.hourly.marks.map((m) => m.t)) === JSON.stringify(wantH) && vm.zone.hourly.marks.every((m) => /^±[234]° ab \d\d Uhr$/.test(m.label)), `${vm.zone.hourly.marks.length} Marken`);
  add('(3b) Trichter-Marken tragen das Datum (zwei Mittwoche in 14 Tagen sind sonst nicht zu unterscheiden)',
    vm.conf.funnelMarks.length > 0 && vm.conf.funnelMarks.every((m) => /^±[234]° ab \S\S \d\d\.\d\d\.$/.test(m.label)), vm.conf.funnelMarks.map((m) => m.label).join(' · '));
  // Nächte: die Funktion des Dashboards (forecastStore.nightsOf) gegen den Sonnenstand selbst.
  const nights = fusion.nights;
  const elev = (t) => solarPosition(FIX.lat, FIX.lon, t).elevationDeg;
  const axisFrom = steps[0].validAtMs, axisTo = steps.at(-1).validAtMs + H1;
  const nightOk = nights.every(([a, b]) => b > a && elev((a + b) / 2) < -0.833
    && (a === axisFrom || elev(a - 20 * 60_000) > -0.833) && (b === axisTo || elev(b + 20 * 60_000) > -0.833));
  const spanDays = (axisTo - axisFrom) / 86_400_000;
  add('(3b) Nächte: Sonne in der Mitte jeder Nacht unter −0,833°, 20 min davor und danach darüber; etwa eine Nacht je Tag der Achse',
    nights.length >= Math.floor(spanDays) && nights.length <= Math.ceil(spanDays) + 1 && nightOk, `${nights.length} Nächte auf ${spanDays.toFixed(1)} Tagen`);
  const hn = vm.zone.hourly.nights;
  add('(3b) Nächte im Stundenverlauf auf den Zeitraum beschnitten', hn.length > 0 && hn.every((n) => n.from >= vm.zone.hourly.startMs && n.to <= vm.zone.hourly.endMs && n.to > n.from), `${hn.length} Nächte`);
  // Leitsatz: aus denselben Tageskarten nachgebaut.
  const d = vm.zone.days;
  const LONG = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };
  const mm = (t) => (t == null ? 0 : Number(t.replace(/[^\d,]/g, '').replace(',', '.')));
  const nameOf = (i) => (i === 1 ? 'Morgen' : LONG[/· (\S\S) /.exec(d[i].title)?.[1]] ?? '?');
  const part = (name, text, tail) => `${[name, text].filter(Boolean).join(' ')}${tail ? `${text ? ',' : ''} ${tail}` : ''}.`;
  const wetIdx = [1, 2].find((i) => d[i] && d[i].rain.t != null && mm(d[i].rain.t) >= WET_DAY_MM);
  let want = part('Heute', d[0].text.t, d[0].tmax.t ? `bis ${d[0].tmax.t}` : null);
  if (wetIdx) want += ` ${part(nameOf(wetIdx), d[wetIdx].text.t, d[wetIdx].rain.t)}`;
  else if (d[1]) want += ` ${part('Morgen', d[1].text.t, d[1].tmax.t ? `bis ${d[1].tmax.t}` : null)}`;
  add('(3b) Leitsatz aus denselben Tageskarten (Tagestext, Tmax, Menge des ersten nassen Folgetags) — widerspricht ihnen nie',
    vm.zone.lead.o === 'P91' && vm.zone.lead.t === want, vm.zone.lead.t);
  add('(3b) Leitsatz ist in jedem Zeitraum derselbe (immer heute, morgen, übermorgen)',
    ['heute', '7-tage', '14-tage'].every((r) => buildDashboardVM(inputs({ range: r })).zone.lead.t === vm.zone.lead.t));
  add('(3b) leadSentence: trockener Morgen ⇒ nasser Übermorgen mit Wochentag und Menge; beide trocken ⇒ morgen mit Tmax; ohne Werte ⇒ kein Satz',
    leadSentence([{ name: 'Heute', text: 'sonnig', tmax: '24°', rain: 0, rainText: `0,0${NB}mm` }, { name: 'Morgen', text: 'heiter', tmax: '22°', rain: 0.2, rainText: `0,2${NB}mm` }, { name: 'Freitag', text: 'Regen', tmax: '15°', rain: 8, rainText: `8,0${NB}mm` }]) === `Heute sonnig, bis 24°. Freitag Regen, 8,0${NB}mm.`
    && leadSentence([{ name: 'Heute', text: 'bedeckt', tmax: '12°', rain: 0, rainText: `0,0${NB}mm` }, { name: 'Morgen', text: 'heiter', tmax: '14°', rain: 0, rainText: `0,0${NB}mm` }]) === 'Heute bedeckt, bis 12°. Morgen heiter, bis 14°.'
    && leadSentence([{ name: 'Heute', text: null, tmax: null, rain: null, rainText: null }]) === null);
  const vmL = buildDashboardVM(inputs({ fusion: null, fusionState: 'loading' }));
  add('(3b) ohne Fusion: Bandbreite und Leitsatz laden (keine Zahl), Trichter, Marken und Nächte leer',
    vmL.conf.band.t == null && vmL.zone.lead.t == null && vmL.conf.funnel.length === 0 && vmL.conf.funnelMarks.length === 0 && vmL.zone.hourly == null);
}

// ---------------------------------------------------------------------------
// (4) Regeln an den gezeichneten Beispielen der Vorlage
// ---------------------------------------------------------------------------
{
  const k = (x) => (x ? `${x.kind}${x.drops ?? ''}${x.dark ? 'd' : ''}` : 'null');
  const cases = [
    [{ clct: 40, popMax: 0.1, mmhMax: 0, night: false }, 'sunCloud'], [{ clct: 10, popMax: 0.05, mmhMax: 0, night: false }, 'sun'],
    [{ clct: 5, popMax: 0.15, mmhMax: 0, night: true }, 'moon'], [{ clct: 80, popMax: 0.35, mmhMax: 0.05, night: false }, 'cloud'],
    [{ clct: 90, popMax: 0.65, mmhMax: 1.5, night: false }, 'rain2'], [{ clct: 50, popMax: 0.25, mmhMax: 0, night: true }, 'moonCloud'],
    [{ clct: 95, popMax: 0.7, mmhMax: 0.4, night: false }, 'rain1'], [{ clct: 100, popMax: 0.85, mmhMax: 3, night: false }, 'rain3d'],
    [{ clct: 90, popMax: 0.4, mmhMax: 0.05, night: true }, 'cloudd'],
  ];
  const bad = cases.filter(([a, want]) => k(symbolFor(a)) !== want).map(([a, want]) => `${JSON.stringify(a)} ⇒ ${k(symbolFor(a))} ≠ ${want}`);
  add('(4) Symbolregel reproduziert die Symbole der Vorlage (Sonne, Sonne+Wolke, Wolke, Regen 1–3, Mond, Mond+Wolke)', bad.length === 0, bad.join(' · '));
  const t1 = dayText({ clctDay: 30, clctMorning: 55, clctAfternoon: 20, rainSum: 0.2, popMax: 0.15, snowShare: 0, tmaxDelta: null, snowlineDrop: 0 });
  const t2 = dayText({ clctDay: 60, clctMorning: 60, clctAfternoon: 55, rainSum: 4.1, popMax: 0.65, snowShare: 0, tmaxDelta: -2, snowlineDrop: 0 });
  const t3 = dayText({ clctDay: 95, clctMorning: 95, clctAfternoon: 95, rainSum: 11.6, popMax: 0.85, snowShare: 0, tmaxDelta: -4, snowlineDrop: 450 });
  add('(4) Tagestexte der Vorlage: „heiter, später auflockernd" · „wechselnd bewölkt, Schauer" · „Regen, kühler, Schneegrenze sinkt"',
    t1 === 'heiter, später auflockernd' && t2 === 'wechselnd bewölkt, Schauer' && t3 === 'Regen, kühler, Schneegrenze sinkt', `${t1} | ${t2} | ${t3}`);
  add('(4) Farben der Wahrscheinlichkeit: 5 % hell, 10–55 % Stahl, ≥ 60 % fett', popLevel(0.05) === 'faint' && popLevel(0.1) === 'mid' && popLevel(0.55) === 'mid' && popLevel(0.65) === 'high');
  add('(4) Konfidenz: 86/74 % grün, 61 % ocker; 82 % „solide"', confidenceClass(0.86) === 'good' && confidenceClass(0.74) === 'good' && confidenceClass(0.61) === 'fair' && confidenceWord(0.82) === 'solide');
  const iso = isotherms(18.4, 708, 7.1, 3000);
  add('(4) Isothermen der Vorlage: 6/10/14 °C in 2 450/1 890/1 330 m (±15 m) aus 18,4 °C in 708 m und γ 7,1 K/km',
    iso.length === 3 && near(iso[0].h, 2450, 15) && near(iso[1].h, 1890, 15) && near(iso[2].h, 1330, 15) && iso.map((x) => x.t).join() === '6,10,14', iso.map((x) => `${x.t}@${Math.round(x.h)}`).join(' '));
  add('(4) Tabellenwerte der Vorlage aus einem Gradienten: 3 000 m 2,1°, 1 000 m 16,3° (±0,1)', near(tempAt(18.4, 708, 7.1, 3000), 2.1, 0.1) && near(tempAt(18.4, 708, 7.1, 1000), 16.3, 0.1));
  add('(4) Schneegrenze statt Böen nur bei Regen ≥ 1 mm, Grenze < Ort + 1 000 m, ohne Warnung (Vorlage Tag 3)',
    snowlineShown({ rainSum: 11.6, snowlineMin: 1650, hOrt: 708, warn: false }) && !snowlineShown({ rainSum: 4.1, snowlineMin: 2100, hOrt: 708, warn: false }) && !snowlineShown({ rainSum: 11.6, snowlineMin: 1650, hOrt: 708, warn: true }));
  add('(4) UV-Farben/-Höhen der Vorlage: 4 #D6D24E 50 %, 5 #E9A33C 62 %, 6 #D4632E 75–78 %', uvColor(4) === '#D6D24E' && uvColor(5) === '#E9A33C' && uvColor(6) === '#D4632E' && uvBarPct(4) === 50 && uvBarPct(5) === 63 && uvBarPct(6) === 75);
  add('(4) Pollenfarben der Vorlage: 0 neutral, 1 grün, 2 amber, 3 rot', pollenColor(0) === '#E0D6BE' && pollenColor(1) === '#7A9466' && pollenColor(2) === '#E9A33C' && pollenColor(3) === '#A32B1E');
  add('(4) Gewitterpotenzial-Wort: < 25 „gering"', thunderWord(10) === 'gering' && thunderWord(60) === 'erhöht');
  const ax = hourAxis(Date.UTC(2026, 8, 16, 12), Date.UTC(2026, 8, 19, 12), 72);
  add('(4) Achse für Mi 16.09. 14:00 + 72 h: Tagesgrenzen Do/Fr/Sa 00:00, Marken 20:00/02:00/08:00/14:00',
    ax.dayLines.map((d) => d.label).join() === 'Do 17.09.,Fr 18.09.,Sa 19.09.' && ax.ticks[0].label === '14:00' && ax.ticks[1].label === '20:00', ax.ticks.map((t) => t.label).slice(0, 5).join(' '));
}

// ---------------------------------------------------------------------------
// (5) Warnungen wörtlich, Zustände ohne Vorlage
// ---------------------------------------------------------------------------
{
  const w = { headline: 'Amtliche WARNUNG vor WINDBÖEN', description: 'Es treten Windböen mit Geschwindigkeiten um 60 km/h (17 m/s, Bft 7) aus südwestlicher Richtung auf.', sender: 'Deutscher Wetterdienst', channel: 'DWD CAP', onsetMs: FIX.nowMs - H, expiresMs: FIX.nowMs + 20 * H, severityRank: 2 };
  const low = { ...w, headline: 'Amtliche WARNUNG vor FROST', description: 'Es tritt leichter Frost auf.', severityRank: 1 };
  const vm = buildDashboardVM(inputs({ warnings: { state: 'ok', channel: 'DWD CAP', items: [low, w], stampMs: FIX.nowMs, note: null } }));
  add('(5) Warnung wörtlich: Überschrift und Beschreibung unverändert, nur mit „ — " verbunden; höchste Stufe zuerst; „1 von 2"',
    vm.warning.state === 'active' && vm.warning.quote === `${w.headline} — ${w.description}` && /wörtlich zitiert/.test(vm.warning.footer) && /1 von 2/.test(vm.warning.footer), vm.warning.quote);
  add('(5) Warnung aktiv ⇒ Tageskarte „Warnung aktiv" am betroffenen Tag', vm.zone.days[0].mid.subWarn || vm.zone.days[0].mid.label === 'SCHNEEGRENZE');
  const none = buildDashboardVM(inputs());
  add('(5) keine Warnung ⇒ ruhiger Zustand ohne erfundenen Text', none.warning.state === 'none' && none.warning.quote == null);
  const err = buildDashboardVM(inputs({ warnings: { state: 'error', channel: 'DWD CAP', items: [], stampMs: null, note: 'Warnungen nicht abrufbar (x) — kein Ersatztext' } }));
  add('(5) Warnungen gescheitert ⇒ Fehlerzustand, kein Ersatztext', err.warning.state === 'error' && err.warning.quote == null);
  const loading = buildDashboardVM(inputs({ fusionState: 'loading', fusion: null }));
  const lShown = shownOf(loading).filter((s) => ['fusion', 'fusion-derived'].includes(ORIGIN[s.o].kind));
  add('(5) Fusion lädt ⇒ kein Fusionswert trägt eine Zahl (nur „…")', loading.status === 'loading' && lShown.every((s) => s.t == null || /^[A-ZÄÖÜa-zäöü· →.0-9]+$/.test(s.t) && !/\d{2}°|%|m\/s|mm/.test(s.t)), `${lShown.length} Fusionswerte`);
  const failed = buildDashboardVM(inputs({ fusionState: 'error', fusionError: 'Index nicht lesbar', fusion: null }));
  add('(5) Fusion gescheitert ⇒ Status error, KEIN Rückfall (keine Werte)', failed.status === 'error' && failed.error === 'Index nicht lesbar' && failed.top.status.text === 'FUSION FEHLER');
  const fShown = shownOf(failed).filter((x) => ['fusion', 'fusion-derived'].includes(ORIGIN[x.o].kind));
  add('(5) Fusion gescheitert ⇒ jeder Fusionswert „nicht verfügbar" mit Grund (kein ewiges „…"), Nebenquellen unberührt',
    fShown.length > 0 && fShown.every((x) => x.t == null && /Fusion nicht erreichbar|vergangen|Horizont|keine Sonnenschein|Messzeit/.test(x.na ?? '')) && failed.uv.caption.t != null, `${fShown.length} Werte`);
  const noplace = buildDashboardVM(inputs({ place: null, fusion: null, fusionState: 'loading' }));
  add('(5) ohne Ort ⇒ Zustand noplace', noplace.status === 'noplace' && noplace.top.status.text === 'KEIN ORT');
  // Nowcast-Überschrift
  const t0 = FIX.nowMs;
  const dry = buildDashboardVM(inputs({ nowcast: { state: 'ok', sources: ['radvor_rv'], horizonLabel: '0–2 h DE', frames: [0, 10, 20].map((m) => ({ t: t0 + m * 60_000, mmh: 0 })), slotMs: t0, note: null } }));
  const wet = buildDashboardVM(inputs({ nowcast: { state: 'ok', sources: ['radvor_rv'], horizonLabel: '0–2 h DE', frames: [0, 10, 20].map((m) => ({ t: t0 + m * 60_000, mmh: m === 20 ? 1.2 : 0 })), slotMs: t0, note: null } }));
  add('(5) Nowcast: ohne Regen „Trocken bis mind. <Horizont>", mit Regen „Trocken bis <erste nasse Zeit>"', /^Trocken bis mind\. \d{2}:\d{2}$/.test(dry.nowcast.headline.t) && /^Trocken bis \d{2}:\d{2}$/.test(wet.nowcast.headline.t), `${dry.nowcast.headline.t} | ${wet.nowcast.headline.t}`);
  add('(5) Blitze 1 h ist „nicht verfügbar"', dry.nowcast.chips.some((c) => c.o === 'P58' && c.t == null && !!c.na));
  // Terrain: Normal und Inversion
  const prof = Array.from({ length: 181 }, (_, i) => ({ s: -20 + (40 * i) / 180, h: 520 + 400 * Math.abs(Math.sin(i / 30)) }));
  const ter = { state: 'ok', halfKm: 20, axisDeg: 225, profile: prof, stations: [{ name: 'Hohenpeißenberg', s: 5, h: 977, t: null }], outside: ['Augsburg'], note: null };
  const tv = buildDashboardVM(inputs({ terrain: ter }));
  const row0 = fusion.cells.find((r) => r.tier === 't1');
  const inv = row0 && row0.v.zInv != null && row0.v.zBase != null && row0.v.zInv > row0.v.zBase && (row0.v.dTInv ?? 0) > 0;
  add('(5) Terrain: Tabelle absteigend, letzte Zeile = Ort; Wind je Höhe „nicht verfügbar"; mit Inversion keine Isothermen',
    tv.terrain.state === 'ok' && tv.terrain.table.at(-1).ort && tv.terrain.table.slice(0, -1).every((r, i, a) => i === 0 || a[i - 1].h > r.h)
    && tv.terrain.table.filter((r) => !r.ort).every((r) => r.wind.t == null && !!r.wind.na) && (!inv || tv.terrain.isotherms.length === 0),
    `${tv.terrain.chip.t} · ${tv.terrain.isotherms.length} Isothermen`);
  add('(5) Terrain: Stationen außerhalb werden benannt', tv.terrain.readout.note.some((p) => typeof p === 'string' && /Augsburg liegt außerhalb des ±20-km-Schnitts/.test(p)));
}

{
  // Kopie mit Wächter: der AT-Leser des Dashboards liefert dasselbe wie der des Brandradars (ohne dessen fireContext-Feld).
  const strip = (c) => c && ({ ...c, warnings: c.warnings.map(({ fireContext, ...w }) => w) });
  const fix = GS_FIXTURE();
  const variant = JSON.stringify({ properties: { location: { properties: { gemeindenr: '70101', name: 'Innsbruck' } }, warnings: [{ properties: { warntypid: '2', warnstufeid: 3, text: 'Starkregen „wörtlich"', begin: '2026-09-30 06:00:00+00', end: 'x', create: null } }, { properties: { wtype: 9, wlevel: 1 } }, { bad: true }] } });
  const same = [fix, variant, 'kein json', '{}'].every((txt) => JSON.stringify(strip(parseWarnContext(txt, 1))) === JSON.stringify(parseAtWarnings(txt, 1)));
  add('(5) AT-Warnungen: die Kopie im Dashboard (atWarnings.ts) parst wie der Brandradar-Leser (Fixture + Varianten, wörtliche Texte)', same);
}

// ---------------------------------------------------------------------------
// (6) Vorlagen-Fixture wohlgeformt; optional Textsonde am Bau
// ---------------------------------------------------------------------------
{
  const vm = templateVM();
  invariants(vm, 'Vorlagen-Fixture');
  add('(6) Fixture: 3 Tage, 72 h, Garmisch-Partenkirchen, Stunde 0 = 14:00 MESZ', vm.zone.days.length === 3 && vm.zone.hourly.points.length === 73 && localParts(vm.zone.hourly.startMs).h === 14);
  if (process.argv.includes('--dist')) {
    const dir = 'dist/assets';
    if (!existsSync(dir)) add('(6) --dist: kein Bau vorhanden', false);
    else {
      const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
      const idx = readFileSync(join('dist', 'index.html'), 'utf8');
      const eager = [...idx.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
      const eagerHit = eager.filter((f) => /dbd-|Vorlagen-Fixture|STUNDENVERLAUF|buildDashboardVM/.test(readFileSync(join(dir, f), 'utf8')));
      add('(6) Start-Chunk(s) ohne Dashboard-Code (Textsonde „STUNDENVERLAUF", „dbd-")', eager.length > 0 && eagerHit.length === 0, `eager: ${eager.join(', ')}`);
      const fixtureHit = files.filter((f) => /Vorlagen-Fixture|dbfixture/.test(readFileSync(join(dir, f), 'utf8')));
      add('(6) die Vorlagen-Fixture liegt in keinem Chunk des Produktions-Baus', fixtureHit.length === 0, fixtureHit.join(', '));
      const dashHit = files.filter((f) => /STUNDENVERLAUF ÜBER DEN GEWÄHLTEN ZEITRAUM/.test(readFileSync(join(dir, f), 'utf8')));
      add('(6) Gegenprobe: der Dashboard-Text steht in genau einem Lazy-Chunk', dashHit.length === 1 && !eager.includes(dashHit[0]), dashHit.join(', '));
    }
  }
}

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'OK   ' : 'FAIL '} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
if (failed) { console.log(`${failed} FEHLGESCHLAGEN.`); process.exit(1); }
