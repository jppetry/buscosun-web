/**
 * verify:geosphere-nwp — Phase GS (`audit/geosphere-v2.md`): die EINE Zuordnung der GeoSphere-NWP-Datensätze
 * (`src/sources/geosphereNwp.ts`) an synthetischen Antworten, an Fixtures beider Datensätze (30.09.2026, zwei Punkte)
 * und live gegen beide Datensätze; dazu Textsonden, dass beide Leser nur noch über die Zuordnung lesen.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-geosphere-nwp.mjs
 */
import { readFileSync } from 'node:fs';
import {
  geoSphereNwpVersion, geoSphereNwpUrl, geoSphereNwpParams, readGeoSphereHour,
  GEOSPHERE_NWP_DATASET, GEOSPHERE_NWP_SOURCE, GEOSPHERE_NWP_LABEL,
} from '../src/sources/geosphereNwp.ts';
import { SCHEDULED_CHANGES } from '../src/point/sourceMatrix.ts';
import { FOOTPRINT_M } from '../src/pointForecast/fusion/priors.ts';
import { familyOf } from '../src/pointForecast/leadTimeWeights.ts';

const checks = [];
const add = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const skip = (name, why) => console.log(`⊘     ${name} — ${why}`);
const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ── A: Version und Adresse ────────────────────────────────────────────────────
add('A1 Voreinstellung v2; `?nwp=v1` und der Speicher schalten auf v1; die Query schlägt den Speicher; Unsinn ⇒ v2',
  geoSphereNwpVersion('', null) === 'v2' && geoSphereNwpVersion('?nwp=v1', null) === 'v1' && geoSphereNwpVersion('', 'v1') === 'v1'
  && geoSphereNwpVersion('?nwp=v2', 'v1') === 'v2' && geoSphereNwpVersion('?nwp=3', 'x') === 'v2');
add('A2 Datensatz-Kennungen und Quell-Tags', GEOSPHERE_NWP_DATASET.v1 === 'nwp-v1-1h-2500m' && GEOSPHERE_NWP_DATASET.v2 === 'nwp-v2-1h-1km'
  && GEOSPHERE_NWP_SOURCE.v1 === 'arome_at' && GEOSPHERE_NWP_SOURCE.v2 === 'claef' && /C-LAEF/.test(GEOSPHERE_NWP_LABEL.v2));
add('A3 Adresse: Datensatz, Parameterliste je Version, Punktliste', geoSphereNwpUrl('v2', ['lat_lon=47.267,11.393'])
  === 'https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km?parameters=2t,10u,10v,10fg,2r,snowlmt,tcc,tp&lat_lon=47.267,11.393'
  && geoSphereNwpParams('v1', true) === 't2m,u10m,v10m,tcc,rr_acc' && geoSphereNwpParams('v2', true) === '2t,10u,10v,tcc,tp');

// ── B: Zuordnung an synthetischen Antworten ───────────────────────────────────
{
  const v1 = { t2m: { data: [10, 11] }, u10m: { data: [1, 2] }, v10m: { data: [0, -2] }, ugust: { data: [3, 0] }, vgust: { data: [4, 0] },
    rh2m: { data: [70, 80] }, snowlmt: { data: [1500, 1400] }, tcc: { data: [0.25, 1] }, rr_acc: { data: [0.5, 1.7] } };
  const a0 = readGeoSphereHour(v1, 0, 'v1'), a1 = readGeoSphereHour(v1, 1, 'v1');
  add('B1 v1: Böe = Betrag der Komponenten (3,4 ⇒ 5), Bewölkung ×100, Niederschlag = Differenz der Laufsumme, Stunde 0 gegen 0',
    a0.gust === 5 && a1.gust === 0 && a0.cloudTotalPct === 25 && a1.cloudTotalPct === 100 && a0.precipitation === 0.5 && near(a1.precipitation, 1.2, 1e-12)
    && a1.temperature === 11 && a1.u === 2 && a1.v === -2 && a1.relativeHumidity === 80 && a1.snowLine === 1400);
  const v2 = { '2t': { data: [10, 11] }, '10u': { data: [1, 2] }, '10v': { data: [0, -2] }, '10fg': { data: [5, 0] }, '2r': { data: [70, 80] },
    snowlmt: { data: [1500, 1400] }, tcc: { data: [25, 100] }, tp: { data: [-1, 1.2] } };
  const b0 = readGeoSphereHour(v2, 0, 'v2'), b1 = readGeoSphereHour(v2, 1, 'v2');
  add('B2 v2: Böe direkt, Bewölkung schon in %, Niederschlag = Stundensumme; Stunde 0 (kein Intervall, Füllwert negativ) ⇒ null',
    b0.gust === 5 && b1.gust === 0 && b0.cloudTotalPct === 25 && b1.cloudTotalPct === 100 && b0.precipitation === null && b1.precipitation === 1.2
    && b1.temperature === 11 && b1.u === 2 && b1.v === -2 && b1.relativeHumidity === 80 && b1.snowLine === 1400);
  add('B3 dieselbe Antwort ergibt in beiden Versionen dieselben Größen (bis auf Stunde 0 des Niederschlags)',
    JSON.stringify({ ...a1 }) === JSON.stringify({ ...b1 }));
  const bad = readGeoSphereHour({ '2t': { data: [null] }, tp: { data: [-3, -1000] } }, 1, 'v2');
  add('B4 Negativkontrolle: fehlende Größen ⇒ null, negativer Niederschlag jenseits Stunde 0 ⇒ null, nie NaN',
    bad.temperature === null && bad.gust === null && bad.precipitation === null && Object.values(bad).every((x) => x === null));
  const wrong = readGeoSphereHour(v2, 1, 'v1');
  add('B5 Negativkontrolle: eine v2-Antwort mit der v1-Tabelle gelesen verliert T/u/v/Böe/RH und liest die Bewölkung um den Faktor 100 falsch — die Zuordnung ist nicht austauschbar, ein Versionsfehler fiele auf',
    wrong.temperature === null && wrong.u === null && wrong.gust === null && wrong.relativeHumidity === null && wrong.cloudTotalPct === 10000, JSON.stringify(wrong));
}

// ── C: Fixtures beider Datensätze (30.09.2026, Innsbruck + Klagenfurt) ────────
const fx = {};
for (const v of ['v1', 'v2']) {
  const j = JSON.parse(src(`scripts/lib/fixtures/geosphere-nwp/${v}-point-2026-09-30.json`));
  fx[v] = j;
  const rows = j.features.map((f) => j.timestamps.map((_, h) => readGeoSphereHour(f.properties.parameters, h, v)));
  const all = rows.flat();
  add(`C1 ${v}: ${j.features.length} Punkte × ${j.timestamps.length} Stunden, T/u/v/RH/Schneefallgrenze überall belegt`,
    all.every((g) => g.temperature != null && g.u != null && g.v != null && g.relativeHumidity != null && g.snowLine != null), `${all.length} Stunden`);
  add(`C2 ${v}: Bewölkung 0…100 %, Böe ≥ 0, Böe ≥ |Wind|, RH 0…100, Niederschlag ≥ 0 oder null`,
    all.every((g) => g.cloudTotalPct >= 0 && g.cloudTotalPct <= 100 && g.gust >= 0 && g.gust + 1e-9 >= Math.hypot(g.u, g.v) - 0.5
      && g.relativeHumidity >= 0 && g.relativeHumidity <= 100 && (g.precipitation === null || g.precipitation >= 0)));
  add(`C3 ${v}: Stunde 0 des Niederschlags ist ${v === 'v2' ? 'null (kein Intervall)' : 'die Laufsumme (0)'}`,
    rows.every((r) => (v === 'v2' ? r[0].precipitation === null : r[0].precipitation === 0)) && rows.every((r) => r[1].precipitation != null));
}
{
  const same = fx.v1.reference_time === fx.v2.reference_time && fx.v1.timestamps.length === fx.v2.timestamps.length
    && fx.v1.timestamps[0] === fx.v2.timestamps[0];
  add('C4 beide Fixtures: derselbe Lauf, dieselbe Zeitachse', same, `${fx.v1.reference_time} · ${fx.v1.timestamps.length} Stunden`);
  const dT = [];
  for (let i = 0; i < 2; i++) for (let h = 0; h < fx.v1.timestamps.length; h++) {
    dT.push(Math.abs(readGeoSphereHour(fx.v1.features[i].properties.parameters, h, 'v1').temperature - readGeoSphereHour(fx.v2.features[i].properties.parameters, h, 'v2').temperature));
  }
  dT.sort((a, b) => a - b);
  add('C5 Fixtures: Temperatur v1 gegen v2 im Median unter 3 K (anderes Modell, andere Zelle — aber dieselbe Größe)',
    dT[Math.floor(dT.length / 2)] < 3, `Median ${dT[Math.floor(dT.length / 2)].toFixed(2)} K · max ${dT.at(-1).toFixed(2)} K`);
}

// ── D: Verdrahtung ────────────────────────────────────────────────────────────
add('D1 Footprint `claef` 1 000 m, `arome_at` bleibt 2 500 m', FOOTPRINT_M.claef === 1_000 && FOOTPRINT_M.arome_at === 2_500);
add('D2 Familie: `claef` ist highres wie `arome_at`', familyOf('claef') === 'highres' && familyOf('arome_at') === 'highres');
{
  const p = src('src/pointForecast/sampleSources.ts'), g = src('src/sources/geosphereArome.ts');
  add('D3 beide Leser lesen über `readGeoSphereHour` und `geoSphereNwpUrl`; kein Datensatzname mehr im Leser',
    /readGeoSphereHour\(/.test(p) && /geoSphereNwpUrl\(/.test(p) && /readGeoSphereHour\(/.test(g) && /geoSphereNwpUrl\(/.test(g)
    && !/forecast\/nwp-v1/.test(p) && !/forecast\/nwp-v1/.test(g) && !/rr_acc|ugust/.test(p) && !/rr_acc|t2m\?\./.test(g));
  add('D4 der Quell-Tag kommt aus der Zuordnung (`GEOSPHERE_NWP_SOURCE`), nicht als Literal',
    /model: GEOSPHERE_NWP_SOURCE\[version\]/.test(p) && /model: GEOSPHERE_NWP_SOURCE\[version\]/.test(g) && !/'arome_at'/.test(p) && !/'arome_at'/.test(g));
  const pf = src('src/pointForecast/pointForecast.ts');
  add('D5 Live-Pfad: `claef` in den nativen Quellen AT/CH, Tag aus dem Leser übernommen', /'claef', 'arome_at', 'dwd_uv'/.test(pf) && /aromeTag/.test(pf));
  const labels = [src('src/countryProfiles.ts'), src('src/map/ModelSwitcher.tsx'), src('src/fusion/loadFusedForecast.ts'), src('src/pointForecast/PointForecastOverview.tsx'), src('src/fusion/modelCatalog.ts')];
  add('D6 Beschriftungen nennen C-LAEF (Länderprofil, Switcher, Rasterfusion, Panel, Katalog)', labels.every((s) => /C-LAEF/.test(s)));
  add('D7 SEO-Texte nennen kein „GeoSphere AROME" mehr', !/GeoSphere AROME/.test(src('src/seo/subRouteTexts.ts')) && !/aus AROME in Metern/.test(src('src/seo/layerSeoTexts.ts')));
}
{
  const c = SCHEDULED_CHANGES.find((x) => /nwp-v1-1h-2500m/.test(x.what));
  add('D8 Termin 04.11. im Register mit `resolved` und Beleg', !!c && c.on === '2026-11-04' && !!c.resolved && /geosphereNwp/.test(c.resolved.evidence));
}

// ── E: live gegen beide Datensätze (ohne Netz ⊘) ─────────────────────────────
try {
  const pts = ['lat_lon=47.267,11.393', 'lat_lon=46.628,14.309', 'lat_lon=48.208,16.373'];
  const [r1, r2] = await Promise.all(['v1', 'v2'].map((v) => fetch(geoSphereNwpUrl(v, pts), { signal: AbortSignal.timeout(25_000) })));
  if (!r1.ok || !r2.ok) throw new Error(`HTTP ${r1.status}/${r2.status}`);
  const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
  add('E1 live: beide Datensätze antworten für drei Punkte mit 40…61 Stunden (61 je Lauf, vergangene Stunden fallen weg)', j1.features.length === 3 && j2.features.length === 3
    && j1.timestamps.length >= 40 && j1.timestamps.length <= 61 && j2.timestamps.length >= 40 && j2.timestamps.length <= 61, `v1 ${j1.reference_time} · v2 ${j2.reference_time}`);
  // Die beiden Datensätze werden Minuten versetzt veröffentlicht; um einen Laufwechsel herum tragen sie verschiedene Läufe.
  const sameRun = j1.reference_time === j2.reference_time;
  if (!sameRun) skip('E3 live: Temperaturvergleich', `verschiedene Läufe (v1 ${j1.reference_time}, v2 ${j2.reference_time})`);
  const g2 = j2.features.map((f) => j2.timestamps.map((_, h) => readGeoSphereHour(f.properties.parameters, h, 'v2'))).flat();
  add('E2 live v2: alle Stunden belegt, Bewölkung 0…100, Böe ≥ 0, Niederschlag ab Stunde 1 belegt',
    g2.every((g) => g.temperature != null && g.cloudTotalPct >= 0 && g.cloudTotalPct <= 100 && g.gust >= 0)
    && j2.features.every((f) => readGeoSphereHour(f.properties.parameters, 1, 'v2').precipitation != null));
  if (sameRun) {
    const dT = j1.features.map((f, i) => Math.abs(readGeoSphereHour(f.properties.parameters, 6, 'v1').temperature - readGeoSphereHour(j2.features[i].properties.parameters, 6, 'v2').temperature));
    add('E3 live: Temperatur bei +6 h zwischen v1 und v2 an jedem Punkt unter 5 K', dT.every((d) => d < 5), dT.map((d) => d.toFixed(1)).join(' / ') + ' K');
  }
} catch (e) {
  skip('E live gegen beide Datensätze', String(e.message ?? e));
}

const passed = checks.filter((c) => c.ok).length;
console.log(`\nverify:geosphere-nwp — ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
