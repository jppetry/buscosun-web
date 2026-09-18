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
