/**
 * Gate für **buscosun Fusion** (`src/pointForecast/fusion/`).
 *
 *   npm run verify:pv-fusion
 *
 * Importiert die ECHTEN Module (kein Copy) — was hier grün ist, ist exakt die
 * Rechnung, die der Browser fährt. Netzfrei und deterministisch, damit der Lauf
 * ins PR-Gate (`ci.yml`) kann.
 *
 * Die sechs Prüfmittel entsprechen der Kette aus `fuse.ts` und ihrem Adapter:
 *   dist          Verteilungsalgebra (inkl. analytischer Gegenprobe des CRPS)
 *   combine       Minimum-Varianz-Kombination mit Fehlerkorrelation
 *   terrainScale  Geländestreuung als physikalische Repräsentativitätsgrundlage
 *   meteo         Feuchtkugel, Phasenwahrscheinlichkeit, Regime-Aufweitung
 *   fuse          die vollständige Kette am Punkt
 *   attach        der Adapter mit synthetischer Klimatologie (K-1-Verdrahtung, K-3-Verweigerung)
 *
 * Jedes Prüfmittel enthält mindestens eine NEGATIVKONTROLLE — einen Fall, der
 * fehlschlagen MUSS, wenn ein Kernmechanismus still abgeschaltet wird. Ohne die
 * beweist ein grüner Lauf nichts (Lehre aus der Satelliten-Linie SAT2h).
 */
import { verifyDist } from '../src/pointForecast/fusion/dist.ts';
import { verifyCombine } from '../src/pointForecast/fusion/combine.ts';
import { verifyTerrainScale } from '../src/pointForecast/fusion/terrainScale.ts';
import { verifyMeteo } from '../src/pointForecast/fusion/meteo.ts';
import { verifyFuse } from '../src/pointForecast/fusion/fuse.ts';
import { verifyAttach } from '../src/pointForecast/fusion/attach.ts';
import { verifyAnchor } from '../src/pointForecast/anchor.ts';
import { verifyAnchorQC } from '../src/pointForecast/pointForecast.ts';
import { brightSkyEntryToHour, brightSkyToHourSamples, brightSkyHistoryToSamples } from '../src/pointForecast/sampleSources.ts';

/**
 * V-FI-25 (PA3, 2026-09-17): BrightSky liefert für MOSMIX-Stunden `relative_humidity: null`
 * und `dew_point` gesetzt (gemessen München 18.09. 06 UTC: t 13, rh null, td 8,7). Der
 * Sample-Builder bildete nur RH ab — MOSMIX trug weder Taupunkt noch Feuchte in buscosun
 * Fusion (86 % der Live-Taupunkte waren Klimatologie). Hier die Abbildung, Ende zu Ende bis
 * zum Sample; `fuse.ts` bevorzugt `s.dewPoint` seit H-2.
 */
function verifyBrightSkyDewPoint() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const entry = { timestamp: '2026-09-18T06:00:00+00:00', temperature: 13, wind_speed: 7.2, wind_direction: 270, wind_gust_speed: 18, relative_humidity: null, dew_point: 8.7, cloud_cover: 80, precipitation: 0 };
  const hour = brightSkyEntryToHour(entry, 'mosmix', 515);
  add('MOSMIX-Stunde: dew_point 8,7 wird zum Taupunkt, relative_humidity bleibt null (nicht erfunden)', hour.dewPoint === 8.7 && hour.relativeHumidity === null && hour.temperature === 13, JSON.stringify({ td: hour.dewPoint, rh: hour.relativeHumidity }));
  const obs = brightSkyEntryToHour({ ...entry, relative_humidity: 75, dew_point: null }, 'dwd_obs', 515);
  add('Messung: relative_humidity 75 bleibt, Taupunkt null (die Fusion rechnet ihn aus T/RH)', obs.relativeHumidity === 75 && obs.dewPoint === null);
  const station = { id: 1, lat: 48.14, lng: 11.58, height: 515 };
  const bs = { station, hours: [hour], historyModel: [hour], historyObs: [obs], obsStation: station };
  const s = brightSkyToHourSamples(bs, 48.14, 11.58)[0].samples[0];
  add('Sample der Vorhersage traegt dewPoint 8,7 (Quelle mosmix)', s.source === 'mosmix' && s.dewPoint === 8.7 && s.relativeHumidity === null);
  const hist = brightSkyHistoryToSamples(bs, 48.14, 11.58);
  const hs = [...hist.values()][0];
  add('Historie: MOSMIX-Stunde mit Taupunkt, Messung mit RH — beide als Samples', hs.some((x) => x.source === 'mosmix' && x.dewPoint === 8.7) && hs.some((x) => x.source === 'dwd_obs' && x.relativeHumidity === 75 && x.dewPoint === null));
  add('Negativkontrolle: ohne dew_point und ohne RH bleibt beides null (kein Wert ohne Herkunft)', (() => { const h = brightSkyEntryToHour({ ...entry, relative_humidity: null, dew_point: null }, 'mosmix', 515); return h.dewPoint === null && h.relativeHumidity === null; })());
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}

/**
 * V-FI-24 (Phase FI, 2026-09-18): `getPointForecast({ elevationM })` — eine Höhe von außen ersetzt die DEM-Höhe im
 * Live-Pfad (Lapse, Stationsgewichte, Fusion, `query.elevation`); ohne sie bleibt alles, wie es war. Ende zu Ende mit
 * einem gestubbten `fetch`: nur BrightSky antwortet (MOSMIX-Station Zugspitze, 2 964 m, 2 °C), alles andere 404 —
 * auch das Gelände, also DEM-Höhe 0 (die V-FI-11-Lage in klein). Eine Prüfung.
 */
async function verifyQueryElevation() {
  const checks = [];
  const { getPointForecast, pfCacheKey } = await import('../src/pointForecast/pointForecast.ts');
  const H = 3_600_000;
  const t0 = Math.floor(Date.now() / H) * H;
  const weather = Array.from({ length: 14 }, (_, i) => ({
    timestamp: new Date(t0 + (i - 2) * H).toISOString(), source_id: 1, temperature: 2, wind_speed: 20, wind_direction: 270,
    wind_gust_speed: 40, relative_humidity: 80, dew_point: -1, cloud_cover: 50, precipitation: 0, condition: 'dry',
  }));
  const body = JSON.stringify({ weather, sources: [{ id: 1, lat: 47.42, lon: 10.98, height: 2964, station_name: 'ZUGSPITZE', observation_type: 'forecast' }] });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).includes('api.brightsky.dev/weather') ? new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('', { status: 404 }));
  try {
    const q = { lat: 47.4211, lng: 10.9853, country: 'DE', hours: 8 };
    const strip = (fc) => JSON.stringify({ ...fc, fetchedAt: 0 });
    const unset = await getPointForecast({ ...q });
    const asNull = await getPointForecast({ ...q, lng: 10.9863, elevationM: null });
    const nan = await getPointForecast({ ...q, lng: 10.9873, elevationM: Number.NaN });
    const set = await getPointForecast({ ...q, lng: 10.9883, elevationM: 2964 });
    const t = (fc) => fc.hours[0]?.temperature;
    // Ohne Höhe gleich (Feld fehlt, null, NaN). Die Länge unterscheidet sich in der 3. Stelle, damit kein Aufruf den
    // Modul-Cache des vorigen trifft (Schlüssel `toFixed(3)`) — sonst wäre die Gleichheit trivial.
    const same = (a, b) => strip({ ...a, query: { ...a.query, lng: 0 } }) === strip({ ...b, query: { ...b.query, lng: 0 } });
    const keyOld = pfCacheKey(47.4211, 10.9853, 'DE', false, false, false, false);
    const ok = same(unset, asNull) && same(unset, nan) && unset.query.elevation === 0
      && keyOld === 'DE:47.421:10.985' && pfCacheKey(47.4211, 10.9853, 'DE', false, false, false, false, false, null) === keyOld
      && pfCacheKey(47.4211, 10.9853, 'DE', false, false, false, false, false, 2964) === `${keyOld}:h2964`
      && set.query.elevation === 2964 && Math.abs(t(set) - 2) < 0.6 && t(unset) - t(set) > 10;
    checks.push({ name: 'V-FI-24: ohne Höhe (fehlt/null/NaN) byte-gleich und Cache-Schlüssel unverändert; mit Stationshöhe 2 964 m trägt der Blend die Station ohne Lapse-Sprung (DEM hier 0 m ⇒ ohne Höhe +19 K), Schlüssel `:h2964`',
      ok, detail: `T(+0 h) ohne Höhe ${t(unset)?.toFixed(1)} °C auf ${unset.query.elevation} m · mit Höhe ${t(set)?.toFixed(1)} °C auf ${set.query.elevation} m · Schlüssel ${keyOld}` });
  } finally {
    globalThis.fetch = realFetch;
  }
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}

/**
 * V-FI-11 (Phase FI, 2026-09-18): BrightSky `/current_weather` füllt fehlende Größen einer Station aus einer anderen
 * (`fallback_source_ids`). Gemessen 18.09. 11:30 UTC an der Zugspitze (273006, 2 956 m): `temperature: 16,4` aus
 * Garmisch-Partenkirchen (11857, 719 m) — der Leser schrieb den Talwert der Gipfelhöhe zu, der Live-Pfad meldete
 * +0 h 17,2 °C (MOSMIX 2 °C). Die Antwortform unten ist die echte (Felder gekürzt). Eine Prüfung mit Negativkontrollen.
 */
async function verifyBrightSkyCurrentFallback() {
  const checks = [];
  const { fetchBrightSkyCurrentGrid } = await import('../src/sources/brightSkyCurrent.ts');
  const zugspitze = { id: 273006, station_name: 'Zugspitze', height: 2956, lat: 47.421, lon: 10.9848, observation_type: 'synop' };
  const garmisch = { id: 11857, station_name: 'Garmisch-Partenkirch', height: 719.3, lat: 47.483, lon: 11.0621, observation_type: 'synop' };
  const weather = {
    timestamp: '2026-09-18T11:30:00+00:00', source_id: 273006, temperature: 16.4, relative_humidity: 62, wind_speed_10: 21.2, wind_direction_10: 250,
    wind_gust_speed_10: 40.3, precipitation_10: 0,
    fallback_source_ids: { temperature: 11857, relative_humidity: 11857, precipitation_60: 11857, pressure_msl: 11857, dew_point: 11857, precipitation_30: 11857, precipitation_10: 11857 },
  };
  const run = async (body) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    try {
      const g = await fetchBrightSkyCurrentGrid({ bounds: { lngMin: 10.98, lngMax: 10.99, latMin: 47.42, latMax: 47.43 }, cols: 1, rows: 1 });
      return g.points[0];
    } finally { globalThis.fetch = realFetch; }
  };
  const fixed = await run({ weather, sources: [zugspitze, garmisch] });
  const noFallback = await run({ weather: { ...weather, fallback_source_ids: undefined }, sources: [zugspitze, garmisch] });
  const reordered = await run({ weather, sources: [garmisch, zugspitze] });
  const at = (pts, elev) => pts.find((p) => p.elev === elev) ?? null;
  const zF = at(fixed, 2956), gF = at(fixed, 719.3), zR = at(reordered, 2956), gR = at(reordered, 719.3);
  const ok = fixed.length === 2 && zF.temperature === null && zF.relativeHumidity === null && zF.precipitation === null
    && zF.u != null && zF.v != null && zF.gust != null
    && gF && gF.temperature === 16.4 && gF.relativeHumidity === 62 && gF.precipitation === 0 && gF.u === null && gF.gust === null && gF.lat === 47.483
    && noFallback.length === 1 && noFallback[0].elev === 2956 && noFallback[0].temperature === 16.4
    && reordered.length === 2 && zR.temperature === null && gR?.temperature === 16.4;
  checks.push({ name: 'V-FI-11: eine geborgte Größe (Garmischer Temperatur in der Zugspitz-Antwort) gehört der Station, die sie gemessen hat — sie steht auf 719 m in Garmisch, nicht auf 2 956 m; eigene Größen der Zugspitze (Wind, Böe) bleiben; Station = `source_id` auch bei anderer Reihenfolge; Negativkontrolle ohne `fallback_source_ids`: ein Punkt, 16,4 °C an der Zugspitze',
    ok, detail: `Zugspitze T ${zF?.temperature} · Wind u ${zF?.u?.toFixed(1)} · Garmisch T ${gF?.temperature} RH ${gF?.relativeHumidity} Wind ${gF?.u} · ohne Fallback ${noFallback.length} Punkt, T ${noFallback[0]?.temperature} auf ${noFallback[0]?.elev} m` });
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}

const SUITES = [
  ['Verteilungen (dist)', verifyDist],
  ['Kombination (combine)', verifyCombine],
  ['Geländeskalen (terrainScale)', verifyTerrainScale],
  ['Meteorologie (meteo)', verifyMeteo],
  ['Fusionskette (fuse)', verifyFuse],
  ['Adapter (attach)', verifyAttach],
  // Altpfad: Stationsanker als Innovations-Persistenz (V-PV-19) — reine Rechnung
  // und die Verdrahtung in `getPointForecast` (`verifyAnchorQC`).
  ['Stationsanker (anchor)', verifyAnchor],
  ['Stationsanker im Blend (pointForecast)', verifyAnchorQC],
  ['Eingaben: BrightSky-Taupunkt (sampleSources, V-FI-25)', verifyBrightSkyDewPoint],
  ['Abfragehöhe von außen (getPointForecast, V-FI-24)', verifyQueryElevation],
  ['Eingaben: BrightSky-Stationsmessung ohne fremde Werte (brightSkyCurrent, V-FI-11)', verifyBrightSkyCurrentFallback],
];

let total = 0;
let failed = 0;

for (const [title, run] of SUITES) {
  const res = await run();
  console.log(`\n${title}:\n`);
  for (const c of res.checks) {
    const mark = c.ok ? '✓' : '✗';
    const detail = c.detail ? `  — ${c.detail}` : '';
    console.log(`  ${mark} ${c.name}${detail}`);
  }
  console.log(`\n  ${res.passed}/${res.checks.length} passed, ${res.failed} failed`);
  total += res.checks.length;
  failed += res.failed;
}

console.log(`\n────────────────────────────────────────────`);
console.log(`  Gesamt: ${total - failed}/${total} passed, ${failed} failed\n`);

process.exit(failed === 0 ? 0 : 1);
