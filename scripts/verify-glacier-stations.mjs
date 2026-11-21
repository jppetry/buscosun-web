#!/usr/bin/env node
/**
 * verify-glacier-stations.mjs — Phase GO (`audit/gletscher-stationen.md`): station measurements of Land Tirol and South Tyrol next to
 * "Wetter am Gletscher". No network: the recorded answers in `scripts/lib/fixtures/glacier/stations/` are the byte-exact bodies of
 * the real services (21.11.2026), the glacier and `obs/v1` entries are a real excerpt.
 *
 *   A  fixtures are byte-exact (sha256) and are what the producer reads
 *   B  Tirol: reader, units, ids, the operator filter — a foreign operator in the feed is rejected (with a negative control)
 *   C  South Tyrol: reader, time zone words, precipitation sums
 *   D  plausibility: stale, future, range, jump, stuck, inconsistent, incomplete — each with a value that passes next to it
 *   E  mapping: window, nearest station, a glacier without a station
 *   F  producer end to end: hour document, catalogue, mapping, pointer, fallback to the feed, both networks down
 *   G  page: what is shown, "Keine Daten", nothing without a station, origin, fixed sentence, wording
 *   H  buscosun Fusion: byte-identical with and without the new files, with two negative controls; nothing in the engine imports the product
 *   I  publisher line, pruning, archive, workflow templates
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-stations.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import * as C from '../src/glacier/glacierStationContract.ts';
import { ageText, dzText, stationView, stationViewTexts } from '../src/glacier/glacierStationView.ts';
import { glacierForbiddenWords } from '../src/glacier/glacierContract.ts';
import { OBS_RAW, STN_HISTORY_HOURS, bzSeriesUrl, glacierCatalogUrl, mergeCatalog, runStations, stnReadme } from './glacier/stations.mjs';
import { archiveStations, hourDay, stnArchiveName } from './glacier/stations-archive.mjs';
import { GLACIER_LINES, GLACIER_POLICIES, checkPackage, pruneList } from './glacier/glacier-publish.mjs';
import { buildCubeFixture, FIX as CUBE } from './lib/pvCubeFixtures.mjs';
import { memoryStore } from '../src/point/client/store.ts';
import { ClimaField } from '../src/ml/climaField.ts';
import { getPointForecastFromCube, fetchCubeObs, clearCubeForecastCache } from '../src/pointForecast/cubeSource.ts';
import { resetObsMemo } from '../src/sources/obsStore.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FX = join(HERE, 'lib', 'fixtures', 'glacier', 'stations');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const H = 3_600_000, MIN = 60_000;
/** The clock of the run: a few minutes after the recordings (Tirol file 07:18 UTC, South Tyrol 07:22, obs/v1 07:24). */
const NOW = Date.parse('2026-11-21T07:35:00Z');
const tmp = mkdtempSync(join(tmpdir(), 'glacier-stations-'));
const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name)).split('\\').join('/')]));

// ── A: fixtures ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const FIXTURES = {
  'tirol-ogd.geojson': 'cf56a137cd4257422a4ca1b17dac08ecc1442dedac6828ba5e83c5badf229f2d',
  'bz-stations.json': '298c93e28d1ad1c441290772ef98a32665e78d3812a0e24a0b610bf6ad2908d5',
  'bz-sensors.json': 'b082dd414693398217e0bf465c98d772fd4897dc9ba1f2684bf5740e11aedfe9',
  'bz-timeseries-74200MS-N.json': '52ce6fda614a26f1dd7d1cb80c51ffee3c4a358f49537e5c37764b8fee519c8f',
};
{
  const got = Object.fromEntries(Object.keys(FIXTURES).map((f) => [f, sha(readFileSync(join(FX, f)))]));
  const attr = src('.gitattributes');
  add('A1 die vier aufgezeichneten Antworten (Tirol OGD, Südtirol Stationen, Sensoren, eine Niederschlagsreihe) sind Byte für Byte die der Dienste (sha256); das Repo wandelt ihre Zeilenenden nicht um (`-text` — die Antwort der Provinz trägt selbst CRLF)',
    Object.entries(FIXTURES).every(([f, h]) => got[f] === h) && /^scripts\/lib\/fixtures\/glacier\/stations\/\*\* -text\r?$/m.test(attr),
    JSON.stringify(got));
  add('A1 Gegenprobe: ein geändertes Byte ergibt einen anderen Hash', sha(Buffer.concat([readFileSync(join(FX, 'bz-timeseries-74200MS-N.json')), Buffer.from(' ')])) !== FIXTURES['bz-timeseries-74200MS-N.json']);
}
const tirolDoc = readJson(join(FX, 'tirol-ogd.geojson'));
const bzStations = readJson(join(FX, 'bz-stations.json')), bzSensors = readJson(join(FX, 'bz-sensors.json')), bzSeries = readJson(join(FX, 'bz-timeseries-74200MS-N.json'));
const EXTRACT = readJson(join(FX, 'glacier-obs-extract.json'));

// ── B: Tirol ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const tirol = C.parseTirol(tirolDoc);
{
  const ops = new Set(tirol.stations.map((s) => s.operator));
  const sj = tirol.stations.find((s) => s.name === 'Schaufeljoch'), sjR = tirol.readings.find((r) => r.id === sj?.id);
  add('B1 Tirol-Leser: 221 Stationen, 219 mit Zeitstempel und Werten (die zwei ohne Stempel tragen in der Datei auch keinen Wert), nur Betreiber `HD Tirol` und `LWD Tirol…`, Land AT, Höhe aus der Geometrie',
    tirol.stations.length === 221 && tirol.readings.length === 219 && tirol.skipped.length === 0 && tirol.stations.filter((s) => s.vars.length === 0).length === 2 && tirol.foreign.length === 0
    && C.parseTirol({ features: [{ ...tirolDoc.features[0], properties: { ...tirolDoc.features[0].properties, date: undefined } }] }).skipped.join() === 'Schaufeljoch: Werte ohne Zeitstempel'
    && [...ops].every(C.tirolOperatorAllowed) && ops.has('HD Tirol') && ops.has('LWD Tirol/TIWAG') && tirol.stations.every((s) => s.country === 'AT' && s.networks.join() === 'tirol' && Number.isInteger(s.elev))
    && sj?.elev === 3160 && sj.lat === 46.9772 && sj.lon === 11.1109, `${tirol.stations.length}/${tirol.readings.length}/${tirol.skipped.join(' | ')}`);
  add('B2 Einheiten: Wind und Böe der Datei stehen in km/h und werden in m/s geschrieben (Schaufeljoch 7,234 km/h → 2,01 m/s, 31,428 → 8,73), Temperatur, Feuchte, Richtung unverändert; der Stempel `08:10:00+01:00` ist 07:10 UTC',
    sjR && sjR.v.ff === 2.01 && sjR.v.fx === 8.73 && sjR.v.t === -10.3 && sjR.v.rh === 98.7 && sjR.v.dd === 135 && sjR.v.td === -10.5 && sjR.ms === Date.parse('2026-11-21T07:10:00Z') && sjR.v.snow === undefined && !sjR.sums,
    JSON.stringify(sjR));
  const ids = tirol.stations.map((s) => s.id), kapall = tirol.stations.filter((s) => s.name.startsWith('Kapall'));
  add('B3 Kennung = die ganze UUID der Datei: 221 verschiedene, auch dort, wo zwei Stationen dieselben ersten acht Stellen tragen (Kapall Schneestation / Windstation); eine doppelte Kennung bricht ab statt eine Station zu überschreiben',
    new Set(ids).size === 221 && ids.every((id) => /^tirol:[0-9a-f-]{36}$/.test(id)) && kapall.length === 2 && kapall[0].id.slice(0, 14) === kapall[1].id.slice(0, 14) && kapall[0].id !== kapall[1].id
    && (() => { try { C.parseTirol({ features: [tirolDoc.features[0], tirolDoc.features[0]] }); return false; } catch (e) { return /doppelt/.test(e.message); } })(), kapall.map((s) => s.id).join(' '));
  const n = (k) => tirol.stations.filter((s) => s.vars.includes(k)).length;
  add('B4 Größen im Katalog wie in Schritt 0 gezählt: Temperatur 217, Wind 82, Böe 80, Schneehöhe 120, Niederschlag 77, Strahlung 61; Niederschlag kommt als 6- und 24-h-Summe der Datei',
    n('t') === 217 && n('ff') === 82 && n('fx') === 80 && n('snow') === 120 && n('rr') === 77 && n('gr') === 61 && tirol.readings.filter((r) => r.sums?.rr24h).length === 77 && tirol.readings.filter((r) => r.sums?.rr6h).length === 77,
    [n('t'), n('ff'), n('fx'), n('snow'), n('rr'), n('gr')].join());
}
// the feed: the same 221 features plus invented entries of operators the real feed carries (never their real values — those are not licensed)
const FOREIGN_OPS = ['Tiroler Wasserkraft AG', 'Universität Innsbruck, Institut für Atmosphären- und Kryosphärenforschung', 'IGF/ÖAW (in Kooperation mit HD Tirol)', 'Südtirol - Alto Adige', 'Trentino', 'Esercito-Meteomont', 'Eurac Research', 'Bundesforschungszentrum für Wald - BFW', 'BOKU', 'Verbund Hydro Power AG', 'Nationalpark Hohe Tauern', 'ÖBB INFRA', 'fotho-electric.tirol', 'DIVERSE'];
const foreignFeature = (op, i) => ({ type: 'Feature', id: `ffffffff-${String(1000 + i)}-4fff-8fff-ffffffffffff`, geometry: { type: 'Point', coordinates: [11.1 + i / 100, 47.0, 2900 + i] }, properties: { name: `Erfundene Station ${i}`, operator: op, LT: 77.7, WG: 777, HS: 777, date: '2026-11-21T08:10:00+01:00', plot: `x${i}` } });
const feedDoc = { type: 'FeatureCollection', features: [...FOREIGN_OPS.map(foreignFeature), ...tirolDoc.features] };
{
  const feed = C.parseTirol(feedDoc);
  const same = JSON.stringify(feed.stations) === JSON.stringify(tirol.stations) && JSON.stringify(feed.readings) === JSON.stringify(tirol.readings);
  add('B5 fremder Betreiber im Feed: 14 Einträge fremder Betreiber (TIWAG, Universität Innsbruck, ÖAW, Südtirol, Trentino, Meteomont, Eurac, BFW, BOKU, Verbund, Nationalpark, ÖBB, …) werden verworfen; übrig bleiben genau die 221 Stationen und Werte der OGD-Datei; von den fremden bleibt nur Name und Betreiber in der Liste, kein Wert',
    same && feed.foreign.length === 14 && feed.foreign.every((f) => Object.keys(f).sort().join() === 'name,operator') && !JSON.stringify([feed.stations, feed.readings]).includes('Erfundene') && !JSON.stringify(feed).includes('77.7'),
    `${feed.stations.length} Stationen, ${feed.foreign.length} verworfen`);
  const yes = ['HD Tirol', 'LWD Tirol', 'LWD Tirol/TIWAG', 'LWD Tirol/HD Tirol'], no = ['Tiroler Wasserkraft AG', 'IGF/ÖAW (in Kooperation mit HD Tirol)', 'HD Tirol ', 'LWD Tirolx', 'Lwd Tirol', 'TIWAG/LWD Tirol', '', null, undefined, 7];
  add('B5 Gegenprobe des Filters: `HD Tirol`, `LWD Tirol` und `LWD Tirol/…` gelten; ein Name, der die Wörter nur enthält oder anders beginnt, gilt nicht — und ohne Filter stünden die erfundenen Stationen im Ergebnis',
    yes.every(C.tirolOperatorAllowed) && no.every((o) => !C.tirolOperatorAllowed(o))
    && C.parseTirol({ features: feedDoc.features.map((f) => ({ ...f, properties: { ...f.properties, operator: 'LWD Tirol' } })) }).stations.length === 235);
}

// ── C: South Tyrol ───────────────────────────────────────────────────────────────────────────────────────────────────────
const bz = C.parseBz(bzStations, bzSensors);
{
  const wf = bz.stations.find((s) => s.ref === '34200WS'), wfR = bz.readings.find((r) => r.id === 'bz:34200WS');
  add('C1 Südtirol-Leser: 230 Stationen des Dienstes, 97 mit Wettersensoren (Pegel bleiben draußen), 60 mit Regenmesser; Signalgipfel Wilder Freiger 3 399 m mit Temperatur, Feuchte, Wind, Böe, Richtung in m/s und °',
    bzStations.features.length === 230 && bz.stations.length === 97 && bz.precip.length === 60 && bz.stations.every((s) => s.country === 'IT' && s.operator === C.BZ_OPERATOR && s.id === `bz:${s.ref}`)
    && wf?.elev === 3399 && wf.vars.join() === 'dd,ff,fx,rh,t' && wfR?.ms === Date.parse('2026-11-21T07:10:00Z') && wfR.v.t === -12.5 && wfR.v.ff === 2.8 && wfR.v.fx === 7.9 && wfR.v.dd === 305 && wfR.v.rh === 90.4
    && !bz.stations.some((s) => /PG$/.test(s.ref)), `${bz.stations.length}/${bz.precip.length} ${JSON.stringify(wfR)}`);
  add('C2 Zeit: `…CET` ist UTC+1, `…CEST` UTC+2, alles andere kein Zeitpunkt; eine Station, deren Sensoren weder Wert noch Stempel tragen (Prags Rossalm), steht im Katalog, aber ohne Messung',
    C.parseBzTime('2026-11-21T08:10:00CET') === Date.parse('2026-11-21T07:10:00Z') && C.parseBzTime('2026-07-30T15:20:00CEST') === Date.parse('2026-07-30T13:20:00Z')
    && [null, undefined, '', '2026-11-21T08:10:00', '2026-11-21T08:10:00Z', '2026-11-21T08:10:00UTC', 7].every((x) => C.parseBzTime(x) === null)
    && bz.stations.some((s) => s.ref === '42830SF') && !bz.readings.some((r) => r.id === 'bz:42830SF') && bz.skipped.some((x) => /Prags Rossalm/.test(x)));
  const endMs = bz.readings.find((r) => r.id === 'bz:74200MS').ms;
  const sums = C.bzPrecipSums(bzSeries, endMs);
  const hand = bzSeries.filter((r) => { const ms = C.parseBzTime(r.DATE); return ms > endMs - H && ms <= endMs; });
  add('C3 Niederschlag Südtirol aus der 5-min-Reihe: die Stunde vor dem Stationsstempel sind 12 Werte (vollständig); die 24-h-Summe aus einer Reihe, die erst um Mitternacht beginnt, ist als unvollständig markiert; Werte nach dem Stationsstempel zählen nicht',
    hand.length === 12 && sums.rr1h.n === 12 && sums.rr1h.of === 12 && sums.rr1h.complete === true && sums.rr1h.mm === Math.round(hand.reduce((a, r) => a + r.VALUE, 0) * 10) / 10
    && sums.rr24h.of === 288 && sums.rr24h.n === 99 && sums.rr24h.n < 288 * C.STN_SUM_MIN_SHARE && sums.rr24h.complete === false
    && JSON.stringify(C.bzPrecipSums([{ DATE: '2026-11-21T08:15:00CET', VALUE: 9 }, ...bzSeries], endMs)) === JSON.stringify(sums) && Object.keys(C.bzPrecipSums('x', endMs)).length === 0,
    JSON.stringify(sums));
}

// ── D: plausibility ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const T0 = NOW - 10 * MIN;
  const chk = (r, hist = []) => C.checkReading({ id: 'x', ms: T0, ...r }, 'tirol', NOW, hist);
  const why = (res) => res.rejected.map((x) => `${x[1]}:${x[2]}`).sort().join();
  const good = chk({ v: { t: -3.2, td: -4, rh: 100.9, ff: 4, dd: 270, fx: 9, snow: -1, gr: 0 }, sums: { rr6h: { mm: 1.2 }, rr24h: { mm: 3 } } });
  add('D1 ein plausibler Satz geht unverändert durch (auch Feuchte 100,9 % und Schneehöhe −1 cm, wie die Rohdaten sie tragen), nichts wird verworfen',
    why(good) === '' && JSON.stringify(good.entry) === JSON.stringify({ t: new Date(T0).toISOString(), src: 'tirol', v: { t: -3.2, td: -4, rh: 100.9, ff: 4, dd: 270, fx: 9, snow: -1, gr: 0 }, rr6h: { mm: 1.2 }, rr24h: { mm: 3 } }), JSON.stringify(good));
  const stale = C.checkReading({ id: 'x', ms: NOW - C.STN_MAX_AGE_MS - MIN, v: { t: -3 }, sums: { rr24h: { mm: 1 } } }, 'bz', NOW);
  const fresh = C.checkReading({ id: 'x', ms: NOW - C.STN_MAX_AGE_MS + MIN, v: { t: -3 } }, 'bz', NOW);
  const future = C.checkReading({ id: 'x', ms: NOW + C.STN_FUTURE_MS + MIN, v: { t: -3 } }, 'bz', NOW);
  const mixed = C.checkReading({ id: 'x', ms: T0, v: { t: -3 }, older: { ff: { v: 5, ms: NOW - 4 * H }, fx: { v: 9, ms: NOW - 20 * MIN } } }, 'bz', NOW);
  add('D2 Höchstalter drei Stunden: eine Minute darüber ist „keine Daten“ (kein Eintrag, Grund `stale`, auch für die Summe), eine Minute darunter gilt; ein Stempel in der Zukunft fällt heraus; ein einzelner alter Fühler fällt heraus, der Rest der Station bleibt',
    stale.entry === null && why(stale) === 'rr24h:stale,t:stale' && fresh.entry?.v.t === -3 && future.entry === null && why(future) === 't:future'
    && why(mixed) === 'ff:stale' && mixed.entry.v.t === -3 && mixed.entry.older.fx.v === 9 && mixed.entry.older.ff === undefined && C.STN_MAX_AGE_MS === 3 * H, `${why(stale)} | ${why(mixed)}`);
  const range = chk({ v: { t: 60, rh: 120, ff: 80, fx: 85, snow: 1200, gr: 2000, td: -70, dd: 400 }, sums: { rr1h: { mm: 200 }, rr24h: { mm: -1 } } });
  const edge = chk({ v: { t: 40, rh: 105, ff: 75, fx: 90, snow: 1000, gr: 1500, dd: 360 } });
  add('D3 benannte Grenzen je Größe: Werte außerhalb (60 °C, 120 %, 80 m/s, 1 200 cm, 2 000 W/m², 200 mm in einer Stunde, …) stehen nicht im Eintrag; die Grenzwerte selbst gelten',
    range.entry?.v.fx === 85 && Object.keys(range.entry.v).join() === 'fx' && why(range) === 'dd:range,ff:range,gr:range,rh:range,rr1h:range,rr24h:range,snow:range,t:range,td:range' && why(edge) === '' && Object.keys(edge.entry.v).length === 7,
    why(range));
  const hist = [{ ms: T0 - H, v: { t: -5, snow: 40 } }];
  const jump = chk({ v: { t: 11, snow: 105 } }, hist), ok = chk({ v: { t: 9.9, snow: 99 } }, hist);
  const old = chk({ v: { t: 11 } }, [{ ms: T0 - 4 * H, v: { t: -5 } }]), slow = chk({ v: { t: 22 } }, [{ ms: T0 - 2 * H, v: { t: -5 } }]);
  add('D4 Sprung gegen den letzten angenommenen Wert der Station: +16 K in einer Stunde und +65 cm Schnee fallen heraus, +14,9 K und +59 cm bleiben; ein Vergleichswert, der älter als drei Stunden ist, zählt nicht; über zwei Stunden gilt die doppelte Spanne',
    why(jump) === 'snow:jump,t:jump' && jump.entry === null && why(ok) === '' && why(old) === '' && why(slow) === '' && why(chk({ v: { t: 26 } }, [{ ms: T0 - 2 * H, v: { t: -5 } }])) === 't:jump', `${why(jump)} | ${why(ok)}`);
  const run = (n, v) => Array.from({ length: n }, (_, i) => ({ ms: T0 - (i + 1) * H, v }));
  const stuckT = chk({ v: { t: -3.2 } }, run(6, { t: -3.2 })), fiveT = chk({ v: { t: -3.2 } }, run(5, { t: -3.2 })), movedT = chk({ v: { t: -3.2 } }, [...run(5, { t: -3.2 }), { ms: T0 - 6 * H, v: { t: -3.3 } }]);
  const stuckW = chk({ v: { t: -3, ff: 4.2, dd: 200, fx: 8 } }, run(6, { ff: 4.2, fx: 7 }));
  const rime = chk({ v: { t: -5, ff: 0, dd: 270, fx: 0 } }, run(6, { ff: 0, fx: 0 })), calm = chk({ v: { t: 5, ff: 0, dd: 270, fx: 0 } }, run(6, { ff: 0, fx: 0 }));
  const sameStamp = chk({ v: { t: -3.2 } }, Array.from({ length: 6 }, () => ({ ms: T0 - H, v: { t: -3.2 } })));
  add('D5 Stillstand: derselbe Zehntelgrad in sieben Ablesungen (jetzt + sechs frühere Stunden) fällt heraus, in sechs noch nicht, und nicht, wenn eine der sechs anders war; derselbe Wind ungleich null fällt mit seiner Richtung heraus, die Böe bleibt, wenn sie sich bewegt hat; Windstille über Stunden bei −5 °C gilt als vereister Geber, bei +5 °C bleibt sie eine Windstille',
    why(stuckT) === 't:stuck' && stuckT.entry === null && why(fiveT) === '' && why(movedT) === '' && why(stuckW) === 'dd:stuck,ff:stuck' && stuckW.entry.v.fx === 8 && stuckW.entry.v.dd === undefined
    && why(rime) === 'dd:stuck,ff:stuck,fx:stuck' && rime.entry.v.t === -5 && why(calm) === '' && calm.entry.v.ff === 0 && why(sameStamp) === '' && C.STN_STUCK_HOURS === 6,
    `${why(stuckT)} | ${why(stuckW)} | ${why(rime)} | ${why(calm)}`);
  const half = (n, v) => Array.from({ length: n }, (_, i) => ({ ms: T0 - (i + 1) * 30 * MIN, v }));
  const sixH = chk({ v: { t: -3.2 } }, half(12, { t: -3.2 })), threeH = chk({ v: { t: -3.2 } }, half(6, { t: -3.2 })), edgeIn = chk({ v: { t: -3.2 } }, half(11, { t: -3.2 })), edgeOut = chk({ v: { t: -3.2 } }, half(10, { t: -3.2 }));
  const movedHalf = chk({ v: { t: -3.2 } }, [...half(11, { t: -3.2 }).slice(0, 7), { ms: T0 - 4 * H, v: { t: -3.1 } }, ...half(11, { t: -3.2 }).slice(8)]);
  const beyond = chk({ v: { t: -3.2 } }, [...half(12, { t: -3.2 }), { ms: T0 - 7 * H, v: { t: 4 } }]);
  add('D5b Stillstand zählt Zeit, nicht Dokumente (Halbstundentakt): derselbe Zehntelgrad in zwölf Halbstunden-Ablesungen über sechs Stunden fällt heraus, in sechs Ablesungen über DREI Stunden nicht (die Regel wurde mit dem dichteren Takt nicht schärfer); Grenze: elf Ablesungen bis 5,5 h zurück fallen heraus, zehn bis 5 h nicht; ein einziger anderer Wert im Fenster hebt den Stillstand auf, ein anderer Wert vor dem Fenster (7 h) nicht',
    why(sixH) === 't:stuck' && why(threeH) === '' && threeH.entry.v.t === -3.2 && why(edgeIn) === 't:stuck' && why(edgeOut) === '' && why(movedHalf) === '' && why(beyond) === 't:stuck' && C.STN_STUCK_SLACK_MS === 30 * MIN,
    `${why(sixH)} | ${why(threeH)} | ${why(edgeIn)} | ${why(edgeOut)} | ${why(movedHalf)} | ${why(beyond)}`);
  const inc = chk({ v: { t: -3, td: -1.5, ff: 6, fx: 4, dd: 90 } }), incOk = chk({ v: { t: -3, td: -2.5, ff: 6, fx: 5.6 } });
  const sums = chk({ v: {}, sums: { rr1h: { mm: 0.4, n: 12, of: 12, complete: true }, rr24h: { mm: 2, n: 97, of: 288, complete: false } } });
  const lone = chk({ v: { dd: 90 } });
  add('D6 Widerspruch und unvollständige Summe: ein Taupunkt 1,5 K über der Temperatur und eine Böe 2 m/s unter dem Mittel fallen heraus (0,5 K bzw. 0,4 m/s Abstand bleiben); eine als unvollständig markierte Summe steht nicht im Eintrag, die vollständige daneben schon; eine Richtung ohne Windgeschwindigkeit wird nicht geschrieben',
    why(inc) === 'fx:inconsistent,td:inconsistent' && inc.entry.v.ff === 6 && why(incOk) === '' && why(sums) === 'rr24h:incomplete' && sums.entry.rr1h.mm === 0.4 && sums.entry.rr24h === undefined && lone.entry === null,
    `${why(inc)} | ${why(sums)}`);
  const earlier = [{ stations: { x: { t: '2026-11-21T06:10:00.000Z', v: { t: -4 } } } }, { stations: { x: { t: '2026-11-21T06:10:00.000Z', v: { t: -4 } } } }, { stations: { x: { t: '2026-11-21T05:10:00.000Z', v: { t: -5 } }, y: { t: 'kaputt', v: {} } } }];
  add('D7 Geschichte aus den früheren Stundendateien: je Stempel ein Eintrag (eine Station, die zwischen zwei Läufen nichts Neues gemeldet hat, zählt nicht doppelt), neueste zuerst',
    JSON.stringify(C.stnHistoryOf('x', earlier)) === JSON.stringify([{ ms: Date.parse('2026-11-21T06:10:00Z'), v: { t: -4 } }, { ms: Date.parse('2026-11-21T05:10:00Z'), v: { t: -5 } }]) && C.stnHistoryOf('y', earlier).length === 0);
}

// ── E: mapping ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const glaciers = EXTRACT.catalog.glaciers;
const cands = C.stnCandidates(mergeCatalog(null, [...tirol.stations, ...bz.stations]), EXTRACT.obs.catalog.stations, EXTRACT.obs.latest.stations);
const mapDoc = C.buildStnMap(glaciers, cands, { file: `${EXTRACT.catalog.build}.1`, build: EXTRACT.catalog.build, builtAt: new Date(NOW).toISOString() });
{
  const g = (id) => mapDoc.glaciers[id], net = (h) => mapDoc.stations[h[0]].net, name = (h) => mapDoc.stations[h[0]].name;
  const alp = g('gl_at_alpeiner-ferner-3055'), hef = g('gl_at_hintereisferner-mit-toteis'), hal = g('gl_at_hallstaetter-gletscher'), sf = g('gl_de_noerdlicher-schneeferner'), ch = g('gl_ch_breithorngletscher-zermatt');
  add('E1 Zuordnung am echten Auszug: Alpeiner Ferner → Tiroler Stationen (Temperatur, Wind, Böe von der einen, Schneehöhe und Strahlung von der nächsten, die sie misst), Hintereisferner → zwei Südtiroler Stationen über den Kamm, Hallstätter Gletscher → TAWES, Nördlicher Schneeferner → DWD, Breithorngletscher → SwissMetNet; je Treffer Abstand in km und Höhenunterschied zur mittleren Höhe',
    alp && net(alp.t) === 'tirol' && alp.t[0] === alp.wind[0] && alp.snow[0] !== alp.t[0] && alp.t[1] === 3.7 && alp.t[2] === 27 && alp.snow[1] === 4.2 && alp.snow[2] === -545 && !alp.precip
    && hef && net(hef.t) === 'bz' && name(hef.t) === 'Schnals Teufelsegg' && name(hef.wind) === 'Schnals Grawand' && hef.t[1] === 1.8 && hef.wind[2] === 154
    && hal && net(hal.t) === 'obs' && hal.t[0] === 'at:11268' && sf?.t[0] === 'de:05792' && sf.t[2] === 373 && ch?.t[0] === 'ch:GOR' && Object.keys(hal).length === 6,
    JSON.stringify({ alp, hef }));
  const none = ['gl_at_goldbergkees-untere-teile', 'gl_ch_grosser-aletschgletscher', 'gl_at_grosselend-kees', 'gl_de_blaueis'];
  add('E2 Gletscher ohne Station: vier der zehn haben im Fenster keine (Goldbergkees: der Sonnblick steht mehr als 300 m über dem oberen Rand) — sie haben keinen Eintrag in der Zuordnung; der Bericht zählt 10 Gletscher, 6 mit Station',
    none.every((id) => !(id in mapDoc.glaciers)) && mapDoc.report.all.glaciers === 10 && mapDoc.report.all.withStation === 6 && Object.keys(mapDoc.glaciers).length === 6
    && mapDoc.report.byCountry.AT.withStation === 4 && mapDoc.report.byCountry.DE.withStation === 1 && mapDoc.report.byCountry.CH.withStation === 1 && C.stnMapProblems(mapDoc, new Set(glaciers.map((x) => x.id))).length === 0,
    JSON.stringify(mapDoc.report.all));
  const G = { id: 'g', country: 'AT', region: 'r', lat: 47, lon: 11, z: [2500, 2800, 3100] };
  const st = (id, dLat, elev, vars = ['t']) => ({ id, name: id, lat: 47 + dLat, lon: 11, elev, vars, net: 'tirol', op: 'LWD Tirol' });
  const one = (list) => C.buildStnMap([G], list, { file: '20261120-1.1', build: '20261120-1', builtAt: 'x' }).glaciers.g;
  const kmOf = (dLat) => C.stnDistanceKm(47, 11, 47 + dLat, 11);
  add('E3 Fenster mit Gegenproben: 4,9 km gilt, 5,1 km nicht; 300 m unter dem unteren und über dem oberen Rand gilt, 301 m nicht; von zwei Stationen gewinnt die nähere, die die Größe führt (eine nähere ohne Wind wird für Wind übersprungen); das Fenster ist 5 km und ±300 m',
    kmOf(0.044) < 5 && kmOf(0.046) > 5 && one([st('a', 0.044, 2800)])?.t[0] === 'a' && one([st('a', 0.046, 2800)]) === undefined
    && one([st('a', 0.01, 2200)])?.t[0] === 'a' && one([st('a', 0.01, 2199)]) === undefined && one([st('a', 0.01, 3400)])?.t[0] === 'a' && one([st('a', 0.01, 3401)]) === undefined
    && JSON.stringify(one([st('far', 0.03, 2800, ['t', 'ff']), st('near', 0.01, 2700, ['t'])])) === JSON.stringify({ t: ['near', 1.1, -100], wind: ['far', 3.3, 0] })
    && C.STN_MAP_KM === 5 && C.STN_MAP_DZ === 300, JSON.stringify(one([st('far', 0.03, 2800, ['t', 'ff']), st('near', 0.01, 2700, ['t'])])));
  const catVars = (id) => EXTRACT.obs.catalog.stations.find((x) => x.id === id).vars, nowVars = (id) => C.obsVarsNow(EXTRACT.obs.latest.stations[id]);
  add('E5 `obs/v1`-Stationen zählen mit dem, was sie JETZT liefern, nicht mit der Liste des Katalogs: die Zugspitze nennt dort Schneehöhe und Niederschlag (aus Tagesdateien), liefert im 10-min-Takt aber keine ⇒ der Schneeferner bekommt dafür keine Station statt eines dauerhaften „Keine Daten“; am Hallstätter Gletscher kommt der Wind vom Hunerkogel, weil die nähere Station gerade keinen misst',
    catVars('de:05792').includes('snow') && catVars('de:05792').includes('rr') && nowVars('de:05792').join() === 'dd,ff,fx,gr,rh,t,td' && !sf.snow && !sf.precip && Object.keys(sf).join() === 't,wind,gust,rad'
    && nowVars('at:11268').join() === 'rh,rr,snow,t,td' && hal.wind[0] === 'at:11267' && hal.precip[0] === 'at:11268' && C.obsVarsNow(undefined).length === 0 && C.obsVarsNow({ t: 'kaputt', v: { t: 1 } }).length === 0,
    `${nowVars('de:05792').join()} | ${JSON.stringify(sf)}`);
  const broken = clone(mapDoc); broken.glaciers['gl_at_alpeiner-ferner-3055'].t[0] = 'tirol:fehlt';
  add('E4 die Prüfregeln der Zuordnung greifen: eine Station, die in der Liste fehlt, ein Gletscher außerhalb des Katalogs und ein Dateiname, der nicht zum Build passt, werden bemerkt',
    C.stnMapProblems(broken).some((x) => /fehlt/.test(x)) && C.stnMapProblems(mapDoc, new Set(['anderer'])).length === 6 && C.stnMapProblems({ ...mapDoc, file: '20260101-1.1' }).some((x) => /Dateiname/.test(x)));
}

// ── F: producer end to end ───────────────────────────────────────────────────────────────────────────────────────────
const mkStore = (name) => { const d = join(tmp, name); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'index.json'), JSON.stringify({ schema: 1, kind: 'glacier/index', static: { build: EXTRACT.catalog.build } })); return d; };
const asked = [];
const getOf = ({ ogd = true, feed = true, bzOk = true, obsLatest = EXTRACT.obs.latest, tirolOver = null } = {}) => async (url) => {
  asked.push(url);
  if (url === C.TIROL_OGD_URL) { if (!ogd) throw new Error('HTTP 503'); return tirolOver ?? tirolDoc; }
  if (url === C.TIROL_FEED_URL) { if (!feed) throw new Error('HTTP 503'); return feedDoc; }
  if (url.startsWith(C.BZ_BASE_URL)) {
    if (!bzOk) throw new Error('HTTP 500');
    if (url === `${C.BZ_BASE_URL}/stations`) return bzStations;
    if (url === `${C.BZ_BASE_URL}/sensors`) return bzSensors;
    if (url === bzSeriesUrl('74200MS')) return bzSeries;
    return [];
  }
  if (url === `${OBS_RAW}/stations.json`) return EXTRACT.obs.catalog;
  if (url === `${OBS_RAW}/latest.json`) return obsLatest;
  if (url === glacierCatalogUrl(EXTRACT.catalog.build)) return EXTRACT.catalog;
  throw new Error(`unerwartete Adresse ${url}`);
};
const store1 = mkStore('store1'), out1 = join(tmp, 'out1'), patch1 = join(tmp, 'patch1');
const res1 = await runStations({ storeDir: store1, outDir: out1, patchDir: patch1, nowMs: NOW, get: getOf() });
const hour1 = readJson(join(out1, 'stn', 'h', '202611210730.json'));
{
  const files = walk(out1).sort();
  const ids = Object.keys(hour1.stations), nets = (p) => ids.filter((i) => i.startsWith(p)).length;
  add('F1 ein Lauf aus den Aufzeichnungen: Stunde 202611210730, Baum nur unter `stn/` (Stundendatei, Katalog, Zuordnung, README), das Dokument besteht die eigenen Regeln; Tirol 219 Stationen mit Werten, Südtirol 95, dazu die vier `obs/v1`-Stationen, die die Zuordnung nennt (zwei TAWES, eine DWD, eine SwissMetNet)',
    res1.slot === '202611210730' && files.join() === 'stn/README.md,stn/h/202611210730.json,stn/map/20261120-1.1.json,stn/stations.json' && C.stnHourProblems(hour1).length === 0 && hour1.count === ids.length
    && nets('tirol:') === 219 && nets('bz:') === 95 && nets('at:') === 2 && nets('de:') === 1 && nets('ch:') === 1 && hour1.sources.map((s) => `${s.id}:${s.via.split(' ')[0]}:${s.stations}`).join() === 'tirol:ogd:221,bz:service:97,obs:obs/v1:4',
    `${files.join()} | ${nets('tirol:')}/${nets('bz:')}/${ids.length} | ${hour1.sources.map((s) => `${s.id}:${s.via}:${s.stations}`).join()}`);
  const rej = hour1.rejected.map((x) => x.join(':'));
  add('F2 alt und unplausibel werden nie weitergereicht: die Südtiroler Station mit Stempel 04:30 UTC (Gsies Regelspitze, 3 h 5 min alt) steht mit keinem Wert im Dokument, jede ihrer fünf Größen steht mit dem Grund `stale` unter `rejected`; die unvollständige 24-h-Summe steht nur dort; kein Wert im Dokument ist älter als drei Stunden',
    !('bz:45100WS' in hour1.stations) && ['dd', 'ff', 'fx', 'rh', 't'].every((k) => rej.includes(`bz:45100WS:${k}:stale`)) && rej.includes('bz:74200MS:rr24h:incomplete') && hour1.stations['bz:74200MS'].rr1h.complete === true && !hour1.stations['bz:74200MS'].rr24h
    && Object.values(hour1.stations).every((e) => NOW - Date.parse(e.t) <= C.STN_MAX_AGE_MS && Object.values(e.older ?? {}).every((o) => NOW - Date.parse(o.t) <= C.STN_MAX_AGE_MS)),
    rej.filter((x) => x.startsWith('bz:45100WS')).join());
  const bad = clone(tirolDoc); const f0 = bad.features.find((f) => f.properties.name === 'Schaufeljoch'); f0.properties.LT = 55; f0.properties.RH = 130;
  const outB = join(tmp, 'outB');
  await runStations({ storeDir: mkStore('storeB'), outDir: outB, patchDir: join(tmp, 'patchB'), nowMs: NOW, get: getOf({ tirolOver: bad }) });
  const hB = readJson(join(outB, 'stn', 'h', '202611210730.json')), idS = C.tirolIdOf(f0.id);
  add('F2 Gegenprobe im Lauf: dieselbe Datei mit 55 °C und 130 % Feuchte am Schaufeljoch — die zwei Werte fehlen im Dokument und stehen mit `range` unter `rejected`, Wind und Böe derselben Station bleiben; im unveränderten Lauf steht die Temperatur',
    hB.stations[idS].v.t === undefined && hB.stations[idS].v.rh === undefined && hB.stations[idS].v.ff === 2.01 && hB.rejected.some((x) => x.join(':') === `${idS}:t:range`) && hB.rejected.some((x) => x.join(':') === `${idS}:rh:range`)
    && hour1.stations[idS].v.t === -10.3, JSON.stringify(hB.stations[idS]));
  const cat = readJson(join(out1, 'stn', 'stations.json')), map = readJson(join(out1, 'stn', 'map', '20261120-1.1.json'));
  const idx = readJson(join(patch1, 'index-patch.json')), stp = readJson(join(patch1, 'status-patch.json'));
  add('F3 Katalog, Zuordnung und Zeiger: 318 Stationen im Katalog (Form von `obs/v1`: id, name, lat, lon, elev, country, networks, vars + Betreiber); die Zuordnung ist die aus E; der Zeiger nennt Stunde, Zahl und Zuordnungsdatei, der Status die Quellen',
    cat.kind === 'glacier/stations' && cat.count === 318 && cat.stations.length === 318 && cat.stations.every((s) => ['id', 'name', 'lat', 'lon', 'elev', 'country', 'networks', 'vars', 'operator'].every((k) => k in s))
    && JSON.stringify(map.glaciers) === JSON.stringify(mapDoc.glaciers) && JSON.stringify(idx) === JSON.stringify({ stations: { hour: '202611210730', slot: '202611210730', builtAt: new Date(NOW).toISOString(), n: hour1.count, map: '20261120-1.1', mapAt: new Date(NOW).toISOString() } })
    && stp.lines.stations.hour === '202611210730' && stp.lines.stations.slot === '202611210730' && res1.slot === '202611210730' && stp.lines.stations.sources.tirol.stations === 221 && Object.keys(idx).join() === 'stations', JSON.stringify(idx));
  add('F4 was der Lauf holt: die OGD-Datei, zwei Antworten aus Südtirol und 60 Niederschlagsreihen, Katalog und `latest.json` von `obs/v1` (nur gelesen) und den Gletscherkatalog des Builds — nie den Feed, solange die OGD-Datei antwortet',
    asked.filter((u) => u === C.TIROL_OGD_URL).length === 2 && !asked.includes(C.TIROL_FEED_URL) && asked.filter((u) => u.includes('/timeseries?')).length === 120 && asked.filter((u) => u.includes('/timeseries?')).every((u) => u.endsWith('&sensor_code=N'))
    && asked.every((u) => [C.TIROL_OGD_URL, C.BZ_BASE_URL, OBS_RAW, 'https://raw.githubusercontent.com/jppetry/buscosun-data/glacier/glacier/v1/static/'].some((p) => u.startsWith(p))), String(asked.length));
}
// second hour on top of the first: history, unchanged catalogue and mapping are not rewritten
{
  const store2 = mkStore('store2');
  cpSync(join(out1, 'stn'), join(store2, 'stn'), { recursive: true });
  writeFileSync(join(store2, 'index.json'), JSON.stringify({ schema: 1, kind: 'glacier/index', static: { build: EXTRACT.catalog.build }, stations: readJson(join(patch1, 'index-patch.json')).stations }));
  // one hour later the services answer with the same bodies: every stamp is 60 min older, all still inside the three hours
  const out2 = join(tmp, 'out2');
  const res2 = await runStations({ storeDir: store2, outDir: out2, patchDir: join(tmp, 'patch2'), nowMs: NOW + H, get: getOf() });
  add('F5 zweite Stunde auf dem Stand der ersten: nur die neue Stundendatei entsteht (Katalog und Zuordnung sind unverändert und werden nicht neu geschrieben), die Prüfungen lesen eine frühere Stunde als Geschichte, der Zeiger behält die Zuordnungsdatei',
    walk(out2).join() === 'stn/h/202611210830.json' && res2.catalogChanged === false && res2.mapBuilt === false && res2.map === '20261120-1.1' && res2.history === 1 && readJson(join(out2, 'stn', 'h', '202611210830.json')).rules.history === 1
    && STN_HISTORY_HOURS === C.STN_STUCK_HOURS + 2, `${walk(out2).join()} ${JSON.stringify(res2)}`);
  // the same hour again, on a store that already holds it
  cpSync(join(out2, 'stn', 'h', '202611210830.json'), join(store2, 'stn', 'h', '202611210830.json'));
  const heldBytes = readFileSync(join(store2, 'stn', 'h', '202611210830.json'));
  const resH = await runStations({ storeDir: store2, outDir: join(tmp, 'outH'), patchDir: join(tmp, 'patchH'), nowMs: NOW + H + 20 * MIN, get: getOf() });
  const pH = readJson(join(tmp, 'patchH', 'index-patch.json')).stations;
  add('F5 eine Stunde wird EINMAL veröffentlicht: ein zweiter Lauf in einer Stunde, die der Speicher schon hält, schreibt keine Stundendatei (das Archiv hält die erste Fassung — beide bleiben gleich); der Zeiger nennt weiter die veröffentlichte Fassung',
    resH.hourWritten === false && !existsSync(join(tmp, 'outH', 'stn', 'h')) && pH.slot === '202611210830' && pH.hour === '202611210830' && pH.builtAt === new Date(NOW + H).toISOString() && Buffer.compare(heldBytes, readFileSync(join(store2, 'stn', 'h', '202611210830.json'))) === 0 && res2.hourWritten === true,
    JSON.stringify(pH));
  const res3 = await runStations({ storeDir: store2, outDir: join(tmp, 'out3'), patchDir: join(tmp, 'patch3'), nowMs: NOW + H, forceMap: true, get: getOf() });
  add('F5 `--map` baut die Zuordnung neu; ist sie inhaltlich dieselbe, bleibt die veröffentlichte Datei (kein neuer Name für denselben Inhalt)', res3.mapBuilt === false && res3.map === '20261120-1.1');
  const nCat = () => asked.filter((u) => u === glacierCatalogUrl(EXTRACT.catalog.build)).length, before = nCat();
  const res4 = await runStations({ storeDir: store2, outDir: join(tmp, 'out4'), patchDir: join(tmp, 'patch4'), nowMs: NOW + 2 * H, get: getOf() });
  const mid = nCat();
  const res5 = await runStations({ storeDir: store2, outDir: join(tmp, 'out5'), patchDir: join(tmp, 'patch5'), nowMs: NOW + 25 * H, get: getOf() });
  add('F5 die Zuordnung wird einmal am Tag neu gerechnet: zwei Stunden nach ihrem Bau liest der Lauf den Gletscherkatalog nicht, 25 Stunden danach schon (`STN_MAP_REFRESH_MS`); bei gleichem Inhalt bleibt die Datei, der Zeiger merkt sich den Zeitpunkt (`mapAt`), damit nicht jede weitere Stunde neu rechnet',
    mid === before && nCat() === before + 1 && res4.mapBuilt === false && res5.mapBuilt === false && res5.map === '20261120-1.1' && C.STN_MAP_REFRESH_MS === 24 * H
    && readJson(join(tmp, 'patch4', 'index-patch.json')).stations.mapAt === new Date(NOW).toISOString() && readJson(join(tmp, 'patch5', 'index-patch.json')).stations.mapAt === new Date(NOW + 25 * H).toISOString(), `${before}/${mid}/${nCat()}`);
  // half-hour cadence: keys, the pointer's two fields, history by time
  const at = (iso) => C.stnSlotOf(Date.parse(iso));
  const seq = Array.from({ length: 150 }, (_, i) => C.stnSlotOf(Date.parse('2026-12-30T00:10:00Z') + i * 30 * MIN));
  add('F7 Slot-Schlüssel: die volle Stunde heißt wie bisher `yyyymmddhh`, die halbe `yyyymmddhh30`; 07:29:59 gehört zur vollen Stunde, 07:30:00 zur halben; als Zeichenketten sortiert liegen 150 Slots über den Jahreswechsel in der Zeitfolge, jeder Schlüssel führt auf seinen Beginn zurück; andere Minuten sind kein Schlüssel',
    at('2026-11-21T07:00:00Z') === '2026112107' && at('2026-11-21T07:29:59Z') === '2026112107' && at('2026-11-21T07:30:00Z') === '202611210730' && at('2026-11-21T07:59:59Z') === '202611210730' && at('2026-12-31T23:45:00Z') === '202612312330'
    && [...seq].sort().join() === seq.join() && new Set(seq).size === 150 && seq.every((k, i) => C.stnSlotMs(k) === Date.parse('2026-12-30T00:00:00Z') + i * 30 * MIN && C.GLACIER_STN_SLOT_RE.test(k) && C.stnSlotOf(C.stnSlotMs(k)) === k)
    && ['202611210715', '202611210700', '20261121073', '2026112107300', '202611210760'].every((k) => !C.GLACIER_STN_SLOT_RE.test(k)) && C.GLACIER_STN_HOUR_RE.test('2026112107') && !C.GLACIER_STN_HOUR_RE.test('202611210730')
    && C.stnSlotHour('202611210730') === '2026112107' && C.stnSlotHour('2026112107') === '2026112107' && C.GLACIER_STN_SLOT_MIN === 30, `${at('2026-11-21T07:29:59Z')} ${at('2026-11-21T07:30:00Z')}`);
  const storeS = mkStore('storeS');
  cpSync(join(out1, 'stn'), join(storeS, 'stn'), { recursive: true });
  writeFileSync(join(storeS, 'index.json'), JSON.stringify({ schema: 1, kind: 'glacier/index', static: { build: EXTRACT.catalog.build }, stations: readJson(join(patch1, 'index-patch.json')).stations }));
  const outS1 = join(tmp, 'outS1'), outS2 = join(tmp, 'outS2');
  const resS1 = await runStations({ storeDir: storeS, outDir: outS1, patchDir: join(tmp, 'patchS1'), nowMs: NOW + 37 * MIN, get: getOf() });
  cpSync(join(outS1, 'stn'), join(storeS, 'stn'), { recursive: true });
  const resS2 = await runStations({ storeDir: storeS, outDir: outS2, patchDir: join(tmp, 'patchS2'), nowMs: NOW + 67 * MIN, get: getOf() });
  const pS1 = readJson(join(tmp, 'patchS1', 'index-patch.json')).stations, pS2 = readJson(join(tmp, 'patchS2', 'index-patch.json')).stations;
  const dS2 = readJson(join(outS2, 'stn', 'h', '202611210830.json'));
  add('F8 zwei Läufe je Stunde: 08:12 UTC schreibt die volle Stunde `2026112108`, 08:42 UTC die halbe `202611210830` — je eine eigene Datei, die zweite liest zwei frühere Slots als Geschichte; der Zeiger nennt mit `slot` den jüngsten Slot und mit `hour` die jüngste VOLLE Stunde, deren Datei es gibt (das liest eine Seite von vor diesem Schritt: zehn Ziffern, `doc.hour` = Name)',
    walk(outS1).join() === 'stn/h/2026112108.json' && walk(outS2).join() === 'stn/h/202611210830.json' && resS1.history === 1 && resS2.history === 2 && dS2.hour === '202611210830' && C.stnHourProblems(dS2).length === 0
    && pS1.hour === '2026112108' && pS1.slot === '2026112108' && pS2.hour === '2026112108' && pS2.slot === '202611210830' && pS2.builtAt === dS2.builtAt && pS2.n === dS2.count
    && C.GLACIER_STN_HOUR_RE.test(pS2.hour) && readJson(join(storeS, 'stn', 'h', `${pS2.hour}.json`)).hour === pS2.hour && Object.keys(pS2).join() === 'hour,slot,builtAt,n,map,mapAt', JSON.stringify([pS1, pS2]));
  add('F9 welche Datei die Seite liest: mit `slot` den Slot, mit einem Zeiger von vor diesem Schritt (ohne `slot`) die Stunde, bei einem unlesbaren `slot` die Stunde — Gegenprobe: derselbe Zeiger ohne `slot` führt auf die andere Datei',
    C.stnPointerKey(pS2) === '202611210830' && C.stnPointerKey({ hour: '2026112116' }) === '2026112116' && C.stnPointerKey({ hour: '2026112108', slot: '202611210815' }) === '2026112108' && C.stnPointerKey({ hour: pS2.hour }) !== C.stnPointerKey(pS2)
    && /hourKey = pointer \? stnPointerKey\(pointer\) : null/.test(src('src/glacier/GlacierStationCard.tsx')) && /if \(!GLACIER_STN_SLOT_RE\.test\(hour\)\) return null;/.test(src('src/glacier/glacierClient.ts')));
  // history is counted in hours before the slot, not in documents
  const storeT = mkStore('storeT'); mkdirSync(join(storeT, 'stn', 'h'), { recursive: true });
  for (const k of ['2026112023', '202611202330', '2026112100', '202611210700', 'fremd']) writeFileSync(join(storeT, 'stn', 'h', `${k}.json`), JSON.stringify({ ...hour1, hour: k }));
  const resT = await runStations({ storeDir: storeT, outDir: join(tmp, 'outT'), patchDir: join(tmp, 'patchT'), nowMs: NOW, get: getOf() });
  add('F10 Geschichte der Prüfungen = alle Slot-Dateien der letzten acht Stunden vor dem Slot: von 23:00 (8,5 h), 23:30 (genau 8 h) und 00:00 (7,5 h) zählen die zwei jüngeren; ein Name, der kein Slot ist, wird nicht gelesen',
    resT.history === 2 && STN_HISTORY_HOURS === 8, String(resT.history));
  const merged = mergeCatalog([{ id: 'a', vars: ['t'], name: 'alt' }, { id: 'z', vars: ['ff'] }], [{ id: 'a', vars: ['ff'], name: 'neu' }]);
  add('F6 Katalog über die Zeit: eine Station, die in einer Antwort fehlt, bleibt; ihre Größen sind die Vereinigung (ein Fühler, der eine Stunde aussetzt, verliert seine Zuordnung nicht)',
    JSON.stringify(merged) === JSON.stringify([{ id: 'a', vars: ['ff', 't'], name: 'neu' }, { id: 'z', vars: ['ff'] }]));
}
{
  const outF = join(tmp, 'outF');
  const resF = await runStations({ storeDir: mkStore('storeF'), outDir: outF, patchDir: join(tmp, 'patchF'), nowMs: NOW, get: getOf({ ogd: false }) });
  const hF = readJson(join(outF, 'stn', 'h', '202611210730.json'));
  const tirolIds = (h) => Object.keys(h.stations).filter((i) => i.startsWith('tirol:')).sort().join();
  add('F7 Rückfall auf den Feed: antwortet die OGD-Datei nicht, liest der Lauf den Feed — mit dem Betreiber-Filter: dieselben 219 Tiroler Stationen und Werte wie aus der OGD-Datei, keine der 14 fremden; die Quelle nennt `feed`, die Zahl der verworfenen Einträge und den Fehler der OGD-Datei',
    tirolIds(hF) === tirolIds(hour1) && JSON.stringify(Object.entries(hF.stations).filter(([i]) => i.startsWith('tirol:'))) === JSON.stringify(Object.entries(hour1.stations).filter(([i]) => i.startsWith('tirol:')))
    && !JSON.stringify(hF).includes('Erfundene') && !JSON.stringify(readJson(join(outF, 'stn', 'stations.json'))).includes('Erfundene')
    && hF.sources[0].via === 'feed' && hF.sources[0].foreignDropped === 14 && /HTTP 503/.test(hF.sources[0].error) && resF.stations === res1.stations, JSON.stringify(hF.sources[0]));
  const outN = join(tmp, 'outN');
  const resN = await runStations({ storeDir: mkStore('storeN'), outDir: outN, patchDir: join(tmp, 'patchN'), nowMs: NOW, get: getOf({ bzOk: false }) });
  const hN = readJson(join(outN, 'stn', 'h', '202611210730.json'));
  let both = null;
  try { await runStations({ storeDir: mkStore('storeX'), outDir: join(tmp, 'outX'), patchDir: join(tmp, 'patchX'), nowMs: NOW, get: getOf({ ogd: false, feed: false, bzOk: false }) }); } catch (e) { both = e.message; }
  add('F8 ein Netz fällt aus: der Lauf schreibt die Stunde mit dem anderen und nennt den Fehler in der Quelle; fallen beide aus, bricht er ab und schreibt nichts (keine leere Stunde)',
    resN.sources.startsWith('tirol:221 bz:0!') && !Object.keys(hN.stations).some((i) => i.startsWith('bz:')) && hN.sources[1].error === 'HTTP 500' && C.stnHourProblems(hN).length === 0
    && /weder Tirol noch Südtirol lesbar/.test(both ?? '') && !existsSync(join(tmp, 'outX')), `${resN.sources} | ${both}`);
}

// ── G: page ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const bundleFile = join(tmp, 'card.mjs');
await build({
  stdin: { resolveDir: ROOT, loader: 'ts', contents: `
    export { GlacierStationBlock } from './src/glacier/GlacierStationCard.tsx';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  ` },
  bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: bundleFile, logLevel: 'silent', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { GlacierStationBlock, createElement: h, renderToStaticMarkup: html } = await import(pathToFileURL(bundleFile).href);
{
  const gOf = (id) => glaciers.find((x) => x.id === id);
  const vAlp = stationView(mapDoc, hour1, 'gl_at_alpeiner-ferner-3055', NOW);
  const txt = (v) => v.stations.map((s) => `${s.name}|${s.elev}|${s.km}|${s.dz}|${s.values.map((x) => `${x.q}=${x.text ?? `∅${x.why}`}`).join(';')}`).join(' # ');
  const s0 = vAlp.stations[0], s1 = vAlp.stations[1];
  const e0 = hour1.stations[s0.id], e1 = hour1.stations[s1.id];
  add('G1 Anzeige am Alpeiner Ferner: zwei Stationen, die nähere zuerst — Temperatur, Wind („km/h aus <Richtung>“), Böe von der einen, Schneehöhe und Strahlung von der anderen; jede mit Name, Höhe, Abstand, Höhenunterschied und dem Stempel ihrer Werte; die Zahlen sind die des Stundendokuments (Wind m/s × 3,6 gerundet)',
    vAlp.stations.length === 2 && s0.km === 3.7 && s0.dz === 27 && s1.km === 4.2 && s1.dz === -545 && s0.values.map((x) => x.q).join() === 't,wind,gust' && s1.values.map((x) => x.q).join() === 'snow,rad'
    && s0.values[0].text === `${String(e0.v.t).replace('.', ',').replace('-', '−')} °C` && s0.values[1].text.startsWith(`${Math.round(e0.v.ff * 3.6)} km/h`) && / aus (N|NO|O|SO|S|SW|W|NW)$/.test(s0.values[1].text)
    && s0.values[2].text === `${Math.round(e0.v.fx * 3.6)} km/h` && s1.values[0].text === `${Math.max(0, Math.round(e1.v.snow))} cm` && s0.ms === Date.parse(e0.t) && s0.operator === 'LWD Tirol' && vAlp.sources.map((x) => x.id).join() === 'tirol',
    txt(vAlp));
  add('G2 Gletscher ohne Station: die Sicht ist `null` — die Karte rendert nichts, auch keinen leeren Rahmen; ebenso ohne Zuordnung',
    ['gl_at_goldbergkees-untere-teile', 'gl_ch_grosser-aletschgletscher', 'gl_at_grosselend-kees', 'gl_de_blaueis', 'gl_gibt_es_nicht'].every((id) => stationView(mapDoc, hour1, id, NOW) === null) && stationView(null, hour1, 'gl_at_alpeiner-ferner-3055', NOW) === null);
  const late = stationView(mapDoc, hour1, 'gl_at_alpeiner-ferner-3055', NOW + 3 * H);
  const noHour = stationView(mapDoc, null, 'gl_at_alpeiner-ferner-3055', NOW);
  add('G3 die Seite prüft das Alter selbst: drei Stunden später steht bei jeder Größe „Keine Daten“ mit dem Grund „älter als drei Stunden“ und kein Wert; ist die Stundendatei nicht ladbar, steht das als Grund — die Stationen bleiben genannt',
    late.stations.every((s) => s.ms === null && s.values.every((x) => x.text === null && x.why === 'älter als drei Stunden')) && noHour.stations.length === 2 && noHour.stations.every((s) => s.values.every((x) => x.text === null && /nicht ladbar/.test(x.why))),
    txt(late));
  // a station whose values the producer dropped: the row names the check; a station absent from the hour: "kein Wert im jüngsten Abruf"
  const hourRej = clone(hour1); delete hourRej.stations[s0.id]; hourRej.rejected.push([s0.id, 't', 'stuck'], [s0.id, 'ff', 'range']);
  const vRej = stationView(mapDoc, hourRej, 'gl_at_alpeiner-ferner-3055', NOW);
  add('G4 verworfen ist „Keine Daten“ mit dem Grund der Prüfung: Temperatur „Fühler steht seit Stunden auf demselben Wert“, Wind „außerhalb der plausiblen Spanne“, die Böe ohne Eintrag „kein Wert im jüngsten Abruf“ — nie der verworfene Wert',
    vRej.stations.find((s) => s.id === s0.id).values.map((x) => `${x.text}|${x.why}`).join(';') === 'null|Fühler steht seit Stunden auf demselben Wert;null|außerhalb der plausiblen Spanne;null|kein Wert im jüngsten Abruf', txt(vRej));
  const vHef = stationView(mapDoc, hour1, 'gl_at_hintereisferner-mit-toteis', NOW), vHal = stationView(mapDoc, hour1, 'gl_at_hallstaetter-gletscher', NOW);
  const pre = vHal.stations[0].values.find((x) => x.q === 'precip');
  add('G5 Netze und Quellenvermerk: Hintereisferner zeigt Südtiroler Stationen mit dem Vermerk der Provinz, der Hallstätter Gletscher die TAWES-Station aus dem Messspiegel mit Niederschlag als Summe („… mm in 24 Stunden“); der Vermerk nennt nur die Netze, deren Stationen dastehen',
    vHef.sources.map((x) => x.id).join() === 'bz' && vHef.stations.every((s) => s.net === 'bz' && s.operator === C.BZ_OPERATOR) && vHal.sources.map((x) => x.id).join() === 'obs' && vHal.stations[0].operator === 'GeoSphere Austria'
    && /^\d+,\d mm in (24 Stunden|1 Stunde)$/.test(pre.text ?? ''), `${txt(vHef)} ## ${txt(vHal)}`);
  const markup = html(h(GlacierStationBlock, { view: vAlp, z: gOf('gl_at_alpeiner-ferner-3055').z, nowMs: NOW }));
  const markupRej = html(h(GlacierStationBlock, { view: vRej, z: gOf('gl_at_alpeiner-ferner-3055').z, nowMs: NOW }));
  const nMeasured = (markup.match(/data-origin="measured"/g) ?? []).length;
  add('G6 die Karte (ohne Browser gerendert): Überschrift, der feste Satz „Station auf Fels oder Grat, nicht auf dem Eis.“, je Station Name, Höhe, „km entfernt“, Höhenunterschied in Worten, Alter und Betreiber; jeder Wert trägt `data-origin="measured"`, kein Element `model`; der Vermerk „Datenquelle: Land Tirol - data.tirol.gv.at“ mit Link zur Lizenz CC BY 4.0',
    markup.includes('GEMESSEN IN DER NÄHE') && markup.includes('Station auf Fels oder Grat, nicht auf dem Eis.') && C.GLACIER_STN_SITE_NOTE === 'Station auf Fels oder Grat, nicht auf dem Eis'
    && markup.includes(`${s0.name}<span>`) && markup.includes('3,7 km entfernt, 27 m über der mittleren Höhe des Gletschers. LWD Tirol.') && markup.includes('4,2 km entfernt, 545 m unter der mittleren Höhe des Gletschers.')
    && markup.includes(`>${ageText(NOW - s0.ms)}</time>`) && nMeasured === 1 + 2 + 5 && !markup.includes('data-origin="model"') && (markup.match(/class="gl-num"/g) ?? []).length === 5
    && markup.includes('>Datenquelle: Land Tirol - data.tirol.gv.at</a> (<a href="https://creativecommons.org/licenses/by/4.0/"') && !markup.includes('Südtirol'), `measured ${nMeasured}`);
  add('G6 „Keine Daten“ in der Karte: der verworfene Wert erscheint nicht, an seiner Stelle steht „Keine Daten.“ mit dem Grund, ohne `gl-num`; die Station ohne gezeigten Wert trägt kein Alter',
    (markupRej.match(/<strong>Keine Daten\.<\/strong>/g) ?? []).length === 3 && markupRej.includes('Fühler steht seit Stunden auf demselben Wert.') && (markupRej.match(/class="gl-num"/g) ?? []).length === 2 && (markupRej.match(/<time /g) ?? []).length === 1);
  const notes = C.GLACIER_STN_SOURCES;
  add('G7 Quellenvermerke des Features wörtlich: „Datenquelle: Land Tirol - data.tirol.gv.at“ (CC BY 4.0) und „Autonome Provinz Bozen – Südtirol“ (CC0), jeweils mit Lizenzadresse und dem, was geändert wurde; dieselben Zeilen stehen in der Lizenzliste des Steckbriefs',
    notes.find((x) => x.id === 'tirol').note === 'Datenquelle: Land Tirol - data.tirol.gv.at' && notes.find((x) => x.id === 'tirol').licence === 'CC BY 4.0' && notes.find((x) => x.id === 'bz').note === 'Autonome Provinz Bozen – Südtirol' && notes.find((x) => x.id === 'bz').licence === 'CC0'
    && notes.every((x) => /^https:\/\/creativecommons\.org\//.test(x.licenceUrl) && x.changes.length > 20) && C.glacierStnSourceRows().length === 3 && C.glacierStnSourceRows().every((r) => r.attribution && r.licenceUrl && /^Von buscosun bearbeitet/.test(r.changes))
    && /more=\{stationPointer \? glacierStnSourceRows\(\) : undefined\}/.test(src('src/glacier/GlacierBrief.tsx')) && /const sources = listed && more \? \[\.\.\.listed, \.\.\.more\] : listed;/.test(src('src/glacier/GlacierSheetTabs.tsx')));
  const card = src('src/glacier/GlacierStationCard.tsx'), view = src('src/glacier/glacierStationView.ts'), brief = src('src/glacier/GlacierBrief.tsx'), page = src('src/glacier/GlacierPage.tsx');
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const all = [...glaciers.flatMap((g) => { const v = stationView(mapDoc, hour1, g.id, NOW); return v ? stationViewTexts(v, NOW) : []; }), ...stationViewTexts(vRej, NOW), ...stationViewTexts(late, NOW), markup.replace(/<[^>]+>/g, ' '), ...Object.values(C.STN_REJECT_TEXT)];
  add('G8 kein Urteil: kein Satz der Karte, keiner Sicht und kein Grund enthält eines der gesperrten Wörter (`glacierForbiddenWords`) oder ein Wort über Gefahr; die Karte vergleicht nicht mit dem Modell (kein „wärmer“, „kälter“, „Abweichung“, „Differenz“) — und die Prüfung selbst schlägt an einem Satz mit „begehbar“ an',
    all.length > 40 && all.every((t) => glacierForbiddenWords(t).length === 0 && !/gefahr|gefährlich|warnung|wärmer|kälter|abweichung|differenz/i.test(t)) && glacierForbiddenWords('Der Gletscher ist begehbar.').join() === 'begehbar'
    && !/gefahr|gefährlich|warnung|wärmer|kälter|abweichung|differenz|begehbar/i.test(code(card) + code(view)));
  add('G9 ohne Schalter an für alle, neben dem Modellwert: der Steckbrief hängt die Karte direkt unter „Wetter am Gletscher“, sobald der Zeiger `index.stations` da ist — keine Abfrage der Adresse, kein Flag; die Seite reicht den Zeiger an beide Einbauten (Blatt und Dossier); die Karte liest die Stundendatei nur für einen Gletscher mit Station',
    /const stationCard = stationPointer \? <GlacierStationCard /.test(brief) && /<>\{modelCard\}\{stationCard\}<\/>/.test(brief) && (page.match(/stationPointer=\{d!?\.stations\}/g) ?? []).length === 2 && /stations: index\.stations \?\? null/.test(page)
    && !/location|URLSearchParams|glacierFlag|localStorage/.test(code(card) + code(view)) && /if \(!hourKey \|\| !mapped\) return;/.test(card) && /return view \? <GlacierStationBlock /.test(card));
  const css = src('src/glacier/glacierSheet.css');
  const mq = css.slice(css.lastIndexOf('@media', css.indexOf('.gl-stn-values { grid-template-columns: repeat(2')));
  add('G10 Gestaltung im Command-Deck: nur Farbwerte der Gletscher-Tokens (kein eigener Farbwert in den Regeln `gl-stn-*` außer Weiß), Mobil allein in der Media Query der Seite (767 px / 1439 px grob), keine Animation',
    !/#[0-9a-fA-F]{3,8}/.test((css.match(/^\.gl-stn[^\n]*$/gm) ?? []).join('\n').replace(/#fff\b/g, '')) && (css.match(/^\.gl-stn[^\n]*$/gm) ?? []).length >= 20
    && mq.startsWith('@media (max-width: 767px), (max-width: 1439px) and (pointer: coarse)') && !/animation|transition/.test((css.match(/^\s*\.gl-stn[^\n]*$/gm) ?? []).join('\n')));
}

// ── H: buscosun Fusion does not read the product ────────────────────────────────────────────────────────────────────
{
  const cube = await buildCubeFixture();
  const flatScales = (z) => ({ elevationM: z, ringMeanM: [z, z, z, z, z, z], spreadM: [0, 0, 0, 0, 0, 0], tpiM: [0, 0, 0, 0, 0, 0], horizonRad: [0, 0, 0, 0, 0, 0, 0, 0], sampledCount: 48 });
  const flatTerrain = (z) => ({ elevationM: z, tpi500M: 0, tpi2000M: 0, svf: 1, slopeDeg: 0, aspectDeg: 0, horizonDeg: [0, 0, 0, 0, 0, 0, 0, 0], scales: flatScales(z), sinkDepthM: 0 });
  const clima = new ClimaField({
    meta: { source: 'test', region: 'T', years: [2000, 2020], binDeg: 1, K: 0, tau: 1, lapsePerM: 0.0065, stationCount: 1 },
    stations: [{ id: 'A', name: 'A', lat: 48.14, lon: 11.58, elev: 525, tc: [12], sc: [5], wc: [0.3], tnc: [7], txc: [17], t50: null, base: 0.3, n: 9999 }],
  });
  // obs/v1 around the cube fixture's point (Munich): the real excerpt of phase OF, values unchanged
  const sample = readJson(join(HERE, 'lib', 'fixtures', 'obs-v1-sample.json'));
  // every stamp is set to the first hour of the cube fixture's axis (12 min before its clock): the anchor pairs a measurement with a cube hour
  const stampAt = new Date(CUBE.nowMs - 12 * MIN).toISOString(), builtAt = new Date(CUBE.nowMs - 6 * MIN).toISOString();
  const obsLatest = { ...sample.latest, builtAt, stations: Object.fromEntries(Object.entries(sample.latest.stations).map(([id, e]) => [id, {
    ...e, ...(e.t ? { t: stampAt } : {}), ...(e.older ? { older: Object.fromEntries(Object.entries(e.older).map(([k, o]) => [k, { ...o, t: stampAt }])) } : {}),
  }])) };
  const obsCat = { ...sample.catalog, builtAt };
  // the data repo as the client sees it: path → document
  const base = new Map([['obs/v1/stations.json', obsCat], ['obs/v1/latest.json', obsLatest]]);
  const stnFiles = new Map([
    ['glacier/v1/index.json', { schema: 1, kind: 'glacier/index', static: { build: EXTRACT.catalog.build }, stations: readJson(join(patch1, 'index-patch.json')).stations }],
    ...walk(out1).filter((f) => f.endsWith('.json')).map((f) => [`glacier/v1/${f}`, readJson(join(out1, f))]),
  ]);
  const realFetch = globalThis.fetch;
  const run = async (repo) => {
    resetObsMemo(); clearCubeForecastCache();
    const reads = [];
    globalThis.fetch = async (url) => {
      const u = String(url), m = /buscosun-data(?:@main|\/main)\/([^?]+)/.exec(u);
      reads.push(m ? m[1] : u);
      const doc = m ? repo.get(m[1]) : undefined;
      return new Response(doc === undefined ? '' : JSON.stringify(doc), { status: doc === undefined ? 404 : 200, headers: { 'content-type': 'application/json' } });
    };
    try {
      const io = { store: memoryStore(cube.files), terrain: false, clima: async () => clima, nowMs: () => CUBE.nowMs, terrainOverride: flatTerrain(CUBE.hTrue), obs: fetchCubeObs, obsDense: true };
      const fc = await getPointForecastFromCube({ lat: CUBE.lat, lng: CUBE.lon, country: 'DE', hours: 72, pointSource: 'cube', includeRadarNowcast: false }, io);
      const body = JSON.stringify({ hours: fc.hours, flags: fc.cube.flags, provenance: fc.cube.provenance });
      return { sha: sha(body), bytes: body.length, reads: [...new Set(reads)].sort(), notes: fc.cube.notes ?? [], n: fc.hours.length };
    } finally { globalThis.fetch = realFetch; }
  };
  const a1 = await run(base), a2 = await run(base);
  const withStn = await run(new Map([...base, ...stnFiles]));
  add('H1 buscosun Fusion Byte für Byte gleich: der Cube-Pfad des Clients (echter Leser, echte `obs/v1`-Anbindung, 73 Stunden) rechnet mit und ohne die neuen Dateien im Daten-Repo dieselbe Antwort (sha256 über Stunden, Flags, Herkunft); zweimal ohne ist ebenfalls gleich (die Rechnung ist wiederholbar)',
    a1.sha === a2.sha && withStn.sha === a1.sha && a1.n === 73 && a1.bytes > 100_000, `${a1.sha.slice(0, 12)} ${withStn.sha.slice(0, 12)} ${a1.bytes} B`);
  add('H2 gelesen wird nur `obs/v1`: der Lauf fragt `obs/v1/stations.json` und `obs/v1/latest.json` und sonst nichts aus dem Daten-Repo — mit den neuen Dateien dieselben zwei Adressen, keine unter `glacier/`',
    a1.reads.join() === 'obs/v1/latest.json,obs/v1/stations.json' && withStn.reads.join() === a1.reads.join() && [...stnFiles.keys()].every((k) => k.startsWith('glacier/v1/')) && stnFiles.size === 4, withStn.reads.join());
  // negative control 1: the measurements matter at all — without obs/v1 the answer differs
  const noObs = await run(new Map());
  // negative control 2: the SAME Tirol values, written into obs/v1 next to the point, DO change the answer
  const picks = tirol.readings.filter((r) => r.v.t != null && r.v.ff != null && r.v.fx != null).slice(0, 4);
  const injCat = clone(obsCat), injLatest = clone(obsLatest);
  picks.forEach((r, i) => {
    const id = `de:9990${i}`;
    injCat.stations.push({ id, name: `Tiroler Werte ${i}`, lat: CUBE.lat + 0.004 * (i + 1), lon: CUBE.lon + 0.004, elev: CUBE.hTrue, country: 'DE', region: 'Bayern', networks: ['dwd10'], vars: ['dd', 'ff', 'fx', 'rh', 't', 'td'] });
    injLatest.stations[id] = { t: stampAt, src: 'dwd10', v: { t: r.v.t, td: r.v.td, rh: r.v.rh, ff: r.v.ff, dd: r.v.dd, fx: r.v.fx } };
  });
  injCat.count = injCat.stations.length; injLatest.count = Object.keys(injLatest.stations).length;
  const injected = await run(new Map([['obs/v1/stations.json', injCat], ['obs/v1/latest.json', injLatest]]));
  add('H3 Gegenproben: ohne `obs/v1` rechnet der Motor eine ANDERE Antwort (die Messungen wirken also), und dieselben Tiroler Werte — in `obs/v1` neben den Punkt geschrieben statt unter `glacier/v1/stn/` — ändern die Antwort ebenfalls: die Gleichheit in H1 kommt vom Ort der Dateien, nicht von einer tauben Prüfung',
    noObs.sha !== a1.sha && injected.sha !== a1.sha && injected.sha !== noObs.sha && picks.length === 4, `ohne ${noObs.sha.slice(0, 12)} · injiziert ${injected.sha.slice(0, 12)} · Basis ${a1.sha.slice(0, 12)}`);
  // nothing in the engine, the point readers or the sources imports the product or names its path
  const dirs = ['src/pointForecast', 'src/point', 'src/sources', 'src/fusion', 'src/ml', 'src/nowcast', 'scripts/point', 'scripts/obs', 'scripts/pruefstand'];
  const NEEDLE = /glacierStation|GlacierStation|glacier\/v1\/stn|glacier\/stations(-archive)?\.mjs|['"`]stn\//;
  const hits = dirs.flatMap((d) => (existsSync(join(ROOT, d)) ? walk(join(ROOT, d)).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f)).filter((f) => NEEDLE.test(readFileSync(join(ROOT, d, f), 'utf8'))).map((f) => `${d}/${f}`) : []));
  const nFiles = dirs.reduce((n, d) => n + (existsSync(join(ROOT, d)) ? walk(join(ROOT, d)).length : 0), 0);
  const producer = src('scripts/glacier/stations.mjs'), contract = src('src/glacier/glacierStationContract.ts');
  add('H4 keine Verbindung im Code: keine Datei des Motors, der Punkt-Leser, der Quellen, der Rasterfusion, des Nowcasts, des Punkt-Crons, des Messspiegels oder des Prüfstands nennt den Vertrag, den Producer oder den Pfad; der Vertrag importiert nur den Gletscher-Vertrag, der Producer schreibt keinen Pfad unter `obs/` (er liest dort) — und das Suchmuster findet den Vertrag selbst',
    hits.length === 0 && nFiles > 300 && NEEDLE.test(contract) && NEEDLE.test(`import x from './glacierStationContract'`)
    && [...contract.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]).join() === './glacierContract'
    && !/writeJson\([^)]*obs/.test(producer) && [...producer.matchAll(/writeJson\(join\((outDir|patchDir), ([^)]*)\)/g)].length === 5 && C.GLACIER_STN_DIR === 'stn' && C.glacierStnHourPath('2026112107') === 'stn/h/2026112107.json',
    `${hits.join(' ')} (${nFiles} Dateien)`);
}

// ── I: publisher line, pruning, archive, workflows ──────────────────────────────────────────────────────────────────
{
  const pkg = checkPackage('stations', out1);
  const badTree = join(tmp, 'badtree'); mkdirSync(join(badTree, 'obs'), { recursive: true }); writeFileSync(join(badTree, 'obs', 'x.json'), '{}');
  const meltTree = join(tmp, 'melttree'); mkdirSync(join(meltTree, 'melt'), { recursive: true }); writeFileSync(join(meltTree, 'melt', 'x.json'), '{}');
  const thrown = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
  add('I1 Linie `stations` des Gletscher-Publishers: sie darf nur `stn/` schreiben — der Baum des Laufs geht durch, eine Datei unter `obs/` oder `melt/` wird abgewiesen; die anderen Linien dürfen `stn/` nicht schreiben',
    GLACIER_LINES.stations.join() === 'stn' && pkg.files.length === 4 && /außerhalb der Linie stations/.test(thrown(() => checkPackage('stations', badTree))) && /außerhalb der Linie stations/.test(thrown(() => checkPackage('stations', meltTree)))
    && ['sat', 'melt', 'feed', 'static'].every((l) => /außerhalb der Linie/.test(thrown(() => checkPackage(l, out1)))));
  const names = { 'stn/h': ['2026111807.json', '2026111808.json', '2026112106.json', '2026112107.json', 'fremd.txt', '202611180630.json', '202611180730.json', '202611210630.json', '202611180615.json'], 'stn/map': ['20261011-1.1.json', '20261120-1.1.json', '20261120-1.2.json'] };
  const pruned = pruneList((p) => names[p] ?? [], GLACIER_POLICIES.stations, Date.parse('2026-11-21T07:30:00Z'));
  add('I2 Aufbewahrung: Slot-Dateien älter als 72 h gehen (die vom 18.11. 07:00 und 06:30 UTC; nicht die von 07:30 — genau 72 h — und 08:00), die zwei neuesten Zuordnungen bleiben; eine fremde Datei und ein Name mit anderen Minuten werden nicht angefasst',
    pruned.sort().join() === 'stn/h/202611180630.json,stn/h/2026111807.json,stn/map/20261011-1.1.json' && C.GLACIER_STN_KEEP_MS === 72 * H, pruned.join());
  // archive
  const data = join(tmp, 'data-stn'); cpSync(join(out1, 'stn'), data, { recursive: true });
  writeFileSync(join(data, 'h', '2026112108.json'), JSON.stringify({ ...hour1, hour: '2026112108' }));
  writeFileSync(join(data, 'h', '2026112109.json'), '{"kaputt":');
  writeFileSync(join(data, 'h', '2026112110.json'), JSON.stringify({ ...hour1, hour: '2026112199' }));
  writeFileSync(join(data, 'h', '202611210830.json'), JSON.stringify({ ...hour1, hour: '202611210830' }));
  const arch = join(tmp, 'archiv'), aOut = join(tmp, 'aout');
  const r1 = archiveStations({ stnDir: data, archiveDir: arch, outDir: aOut });
  const gzFile = join(aOut, '2026-11-21', 'stn-202611210730.json.gz');
  const back = existsSync(gzFile) ? gunzipSync(readFileSync(gzFile)) : Buffer.alloc(0);
  cpSync(aOut, arch, { recursive: true });
  // 72 h later the full hour 08 is gone from the data repo while its half is still there: the archive holds the hour, the half stays out
  rmSync(join(data, 'h', '2026112108.json'));
  const r2 = archiveStations({ stnDir: data, archiveDir: arch, outDir: join(tmp, 'aout2') });
  const catName = walk(aOut).find((f) => /stn-stations-/.test(f));
  add('I3 Ablage bleibt stündlich: je Stunde EINE Datei als `<Tag>/stn-<slot>.json.gz`, ausgepackt Byte für Byte die veröffentlichte — die volle Stunde 08; die halbe 08:30 NICHT, solange ihre volle Stunde im Daten-Repo oder (zweiter Lauf, Stunde dort schon gelöscht) in der Ablage liegt; die halbe 07:30 doch, weil es die volle Stunde 07 nirgends gibt (ausgefallener Lauf — die Reihe behält keine Lücke); ein kaputtes Dokument und eines, dessen Schlüssel nicht zum Namen passt, werden nicht abgelegt; der Katalog kommt einmal je Stand dazu; ein zweiter Lauf legt nichts doppelt ab',
    r1.written.join() === '202611210730,2026112108' && r1.skipped.join() === '2026112109,2026112110' && r1.slots === 5 && r1.hours === 4 && Buffer.compare(back, readFileSync(join(data, 'h', '202611210730.json'))) === 0 && back.length > 1000
    && !walk(aOut).some((f) => /stn-202611210830/.test(f)) && hourDay('2026112107') === '2026-11-21' && hourDay('202611212330') === '2026-11-21' && stnArchiveName('2026112107') === 'stn-2026112107.json.gz' && stnArchiveName('202611210730') === 'stn-202611210730.json.gz'
    && catName === '2026-11-21/stn-stations-20261121T073500Z.json.gz' && r1.catalog === 'stn-stations-20261121T073500Z.json.gz' && r2.written.length === 0 && r2.held === 1 && r2.slots === 4 && r2.hours === 3 && r2.catalog === null && !existsSync(join(tmp, 'aout2')),
    JSON.stringify(r1));
  const wf = src('scripts/glacier/workflow-glacier-stations.yml'), wa = src('scripts/glacier/workflow-glacier-stations-archiv.yml'), pub = src('scripts/glacier/glacier-publish.mjs');
  add('I4 Workflow-Vorlagen: alle 30 Minuten (:12 und :42, 18 min hinter der Slot-Grenze) bzw. alle 6 h (:53), ohne Secrets und Token, Producer frisch aus `buscosun-web` mit Leerlauf, solange er dort fehlt, Kill-Schalter, `set -o pipefail` vor `tee`, Veröffentlichen nur über `glacier-publish.mjs` (`--line=stations` bzw. `--archive`), nie `--force`; kein Schritt schreibt nach `obs/`',
    /cron: '12,42 \* \* \* \*'/.test(wf) && !/cron: '27 /.test(wf) && /cron: '53 \*\/6 \* \* \*'/.test(wa) && [wf, wa].every((y) => !/secrets\./.test(y) && !/token/i.test(y) && /producer not on \$REF yet/.test(y) && /set -o pipefail/.test(y) && !/git push|--force(?!-)/.test(y.replace(/^#.*$/gm, '').replace(/^\s*- name:.*$/gm, '')))
    && /--line=stations --src=out/.test(wf) && /Kill switch/.test(wf) && /scripts\/glacier\/stations\.mjs --store=\.\.\/data\/glacier\/v1 --out=\.\.\/out --patch=\.\.\/patch/.test(wf) && /group: glacier-stations\n/.test(wf.replace(/\r/g, ''))
    && /glacier-publish\.mjs --archive --repo=archiv/.test(wa) && /stations-archive\.mjs/.test(wa) && /sparse-checkout set --no-cone \/glacier\/v1\/stn\//.test(wa) && !/obs\/v1/.test((wf + wa).replace(/^#.*$/gm, '').replace(/^\s*- name:.*$/gm, ''))
    && /stations: \['stn'\]/.test(pub) && /grep -q "stations: \\\['stn'\\\]"/.test(wf));
  const readme = stnReadme();
  add('I5 README beim Produkt: Namensnennung, Lizenz mit Adresse und „Geändert“ für beide Netze stehen neben den Daten (CC BY 4.0), dazu der Satz, dass buscosun Fusion die Dateien nicht liest, und die benannten Grenzen; erzeugt aus dem Vertrag',
    readme === readFileSync(join(out1, 'stn', 'README.md'), 'utf8') && readme.includes('**Datenquelle: Land Tirol - data.tirol.gv.at**') && readme.includes('[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)') && readme.includes('**Autonome Provinz Bozen – Südtirol**')
    && readme.includes('[CC0](https://creativecommons.org/publicdomain/zero/1.0/)') && (readme.match(/Geändert: /g) ?? []).length === 3 && readme.includes('buscosun Fusion liest diese Dateien nicht') && readme.includes('t -45 … 40') && readme.includes('Alle 30 Minuten aus zwei Messnetzen') && readme.includes('`yyyymmddhh30`') && !readme.includes('undefined'));
  const pkgJson = readJson(join(ROOT, 'package.json'));
  add('I6 Einbindung: `npm run verify:glacier-stations` ist angelegt; der Vertrag nennt Netze, Grenzen und Fenster als benannte Konstanten',
    /verify-glacier-stations\.mjs$/.test(pkgJson.scripts['verify:glacier-stations'] ?? '') && C.STN_LIMITS.t.join() === '-45,40' && C.STN_JUMP_PER_H.t === 15 && Object.keys(C.STN_LIMITS).length === 11);
}

rmSync(tmp, { recursive: true, force: true });
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-stations ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
