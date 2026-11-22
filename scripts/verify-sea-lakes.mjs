#!/usr/bin/env node
/**
 * verify:sea-lakes — phase BS, the inland lakes on /seewetter (audit/seewetter-binnenseen.md). No network, no browser.
 *
 * Fixtures `scripts/lib/fixtures/sea/lakes/` = answers of the real services, byte-exact, recorded 21.11.2026
 * (`scripts/sea/spike/lake-record-fixtures.mjs`): DWD lake warning cells and three CAP messages that name lake cells,
 * three outlines (EU-Hydro, swisstopo, DLM250), WSV, LINDAS, Alplakes (answer and CORS refusal), the catalogue as built
 * and an excerpt of obs/v1.
 *
 *   A  fixtures are what was recorded (sha256 of every file against the manifest; negative control)
 *   B  wind wave: the Shore Protection Manual's worked cases, limits, fetch table
 *   C  outlines: area, shore point, normal, water point, fetch; a spot without water; an unlicensed source
 *   D  catalogue: 28 lakes, 70 spots, rules with negative controls; lake with and without a warning cell; stations
 *   E  producer with a wind stand-in: file, pointer, due rule, carry-over, abort instead of nulls, Alplakes
 *   F  the coastal series are byte-identical with and without the lake catalogue (negative control)
 *   G  page logic without a browser: series, measurement (stale, implausible), water, official warnings verbatim
 *   H  source rules: hosts, link-only sources, words, workflow, no switch
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../src/sea/seaLakes.ts';
import * as W from '../src/sea/lakeWave.ts';
import { lakeWaveAt, lakeWaveMax, lakeGustAhead, fetchRose } from '../src/sea/lakeView.ts';
import { lakeAlertsOf } from '../src/sea/lakeWarn.ts';
import { parseCapAlert } from '../src/warnings/capAlerts.ts';
import { spotCatalogProblems, mergeSpotCatalogs, spotWaterPoint, seaCellCentre, SEA_SPOT_STEPS, SEA_PARAMS, SEA_MODELS, seaSpotsPath, seaSpotsWindPath } from '../src/sea/seaContract.ts';
import { parseSpotsDoc, withLakes, loadLakes, SEA_LAKES_NONE } from '../src/sea/seaClient.ts';
import { seaInRevier, SEA_REVIERE } from '../src/sea/seaState.ts';
import { verdictOf } from '../src/sea/seaVerdicts.ts';
import { CUBE_DOMAIN } from '../src/point/cubeFormat.ts';
import * as B from './sea/build-lake-spots.mjs';
import { readLakeCatalog, lakesDue, buildLakes, pruneLakes, collectLakeWt, buildLakeWt } from './sea/sea-lakes.mjs';
import { buildRun, windRefresh, readCatalog, readStatus, parseInventory } from './sea/sea-derive.mjs';
import { lakeObsRows } from './sea/sea-archive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const LK = join(FIX, 'lakes');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const bytes = (f) => readFileSync(join(LK, f));
const J = (f) => JSON.parse(bytes(f).toString('utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const H = 3_600_000;
const tmp = mkdtempSync(join(tmpdir(), 'sea-lakes-'));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const thrown = async (fn) => { try { await fn(); return null; } catch (e) { return String(e?.message ?? e); } };
// V-BS-10: block F builds the full wave run three times (≈ 8 min). It runs alone with `--bytes` (`verify:sea-lakes-bytes`);
// the default run carries the fast form F0 (catalogue and wind refresh) and everything else.
const BYTES = process.argv.includes('--bytes');

const MAN = J('manifest.json');
const CATDOC = J('spots-lakes.json');
const SPOTS = CATDOC.spots, LAKES = CATDOC.lakes;
const byId = Object.fromEntries(SPOTS.map((s) => [s.id, s]));
const lakeById = Object.fromEntries(LAKES.map((l) => [l.id, l]));
const SRC = JSON.parse(readFileSync(join(ROOT, 'scripts/sea/lakes-src.json'), 'utf8'));
const srcLake = (id) => SRC.lakes.find((l) => l.id === id), srcSpots = (id) => SRC.spots.filter((s) => s.lake === id);
const COAST = JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots;

// --- A  fixtures -------------------------------------------------------------------------------------------------
if (!BYTES) {
  const names = Object.keys(MAN.files);
  const bad = names.filter((n) => !existsSync(join(LK, n)) || sha(bytes(n)) !== MAN.files[n].sha256 || bytes(n).length !== MAN.files[n].bytes);
  add('A1 jede Fixture ist byte-gleich mit ihrer Aufzeichnung (sha256, Länge)', names.length >= 15 && bad.length === 0, bad.join(', '));
  const onDisk = readdirSync(LK).filter((n) => n !== 'manifest.json');
  add('A2 im Ordner liegt keine Datei ohne Eintrag', onDisk.every((n) => MAN.files[n]), onDisk.filter((n) => !MAN.files[n]).join(', '));
  const t = Buffer.from(bytes('wsv-current-wt-waren.json')); t[10] ^= 1;
  add('A3 Gegenprobe: ein gekipptes Bit fällt auf', sha(t) !== MAN.files['wsv-current-wt-waren.json'].sha256);
  add('A4 der Ausschnitt aus obs/v1 nennt sich Ausschnitt und trägt den Hash der ganzen Antwort', MAN.files['obs-latest-lakes.json'].kind === 'excerpt' && /^[0-9a-f]{64}$/.test(MAN.files['obs-latest-lakes.json'].of.sha256));
  const hosts = names.map((n) => MAN.files[n].url).filter(Boolean).map((u) => { try { return new URL(u.split(' ')[0]).host; } catch { return ''; } });
  add('A5 keine Fixture stammt von OSM oder einer nur verlinkten Quelle', hosts.every((h) => !/openstreetmap|overpass|nominatim|gkd\.bayern|hydro\.ooe|wasser\.bgld/.test(h)), hosts.join(' '));
}

// --- B  wind wave (Shore Protection Manual 1984) -------------------------------------------------------------------
if (!BYTES) {
  const ep5 = W.spmDepthLimited(22, 24_400, 11);
  add('B1 Rechenbeispiel 5 (S. 3-66): F 24,4 km, U_A 22 m/s, d 11 m ⇒ H_s 1,5 m, T 4,4 s', near(ep5.hsM, 1.5, 0.05) && near(ep5.periodS, 4.4, 0.05), JSON.stringify(ep5));
  add('B2 Rechenbeispiel 4: U 23,5 m/s ⇒ U_A 34,5 m/s', near(W.windStressFactor(23.5), 34.5, 0.05), W.windStressFactor(23.5));
  const d10 = W.spmDeep(34.5, 10_000), d100 = W.spmDeep(34.5, 100_000);
  add('B3 Rechenbeispiel 4: F 10 km ⇒ H 1,75 m, T 4,4 s; F 100 km ⇒ T 9,4 s', near(d10.hsM, 1.75, 0.03) && near(d10.periodS, 4.4, 0.05) && near(d100.periodS, 9.4, 0.05), JSON.stringify([d10, d100]));
  add('B4 Gegenprobe: mit einem falschen Beiwert (0,3 statt 0,283) fiele Beispiel 5 durch', !near(ep5.hsM * 0.3 / 0.283, 1.5, 0.05));
  const full = W.spmDeep(10, 5_000_000);
  add('B5 Tiefwasser: die voll entwickelte See deckelt (g·H/U_A² = 0,2433, g·T/U_A = 8,134)', full.capped && near(full.hsM, 0.2433 * 100 / 9.81, 1e-9) && near(full.periodS, 8.134 * 10 / 9.81, 1e-9));
  const a = W.lakeWindWave({ windMs: 10, fetchM: 8000, depthM: 20 }), b = W.lakeWindWave({ windMs: 14, fetchM: 8000, depthM: 20 }), c = W.lakeWindWave({ windMs: 10, fetchM: 16_000, depthM: 20 }), s = W.lakeWindWave({ windMs: 10, fetchM: 8000, depthM: 1 });
  add('B6 mehr Wind, mehr Fetch ⇒ höhere Welle; flaches Wasser ⇒ niedrigere', b.hsM > a.hsM && c.hsM > a.hsM && s.hsM < a.hsM, JSON.stringify([a.hsM, b.hsM, c.hsM, s.hsM]));
  add('B7 über 90 m die Tiefwassergleichungen, bis 90 m die Gleichungen für konstante Tiefe', W.lakeWindWave({ windMs: 10, fetchM: 8000, depthM: 91 }).regime === 'deep' && W.lakeWindWave({ windMs: 10, fetchM: 8000, depthM: 90 }).regime === 'depth');
  add('B8 ohne Wind, Fetch oder Tiefe keine Schätzung; Fetch 0 ⇒ Welle 0', W.lakeWindWave({ windMs: null, fetchM: 1, depthM: 1 }) === null && W.lakeWindWave({ windMs: 5, fetchM: null, depthM: 1 }) === null && W.lakeWindWave({ windMs: 5, fetchM: 1, depthM: 0 }) === null && W.lakeWindWave({ windMs: 5, fetchM: 0, depthM: 5 }).hsM === 0);
  const tab = Array.from({ length: 36 }, (_, k) => k * 100);
  add('B9 Fetch-Tabelle: linear zwischen zwei Richtungen, über Nord hinweg', W.lakeFetchAt(tab, 15) === 150 && W.lakeFetchAt(tab, 355) === 1750 && W.lakeFetchAt(tab, 360) === 0 && W.lakeFetchAt(tab, null) === null && W.lakeFetchAt(tab.slice(1), 10) === null);
  const lk = { fetch: tab, depthM: 20 };
  const up = lakeWaveAt(lk, 10, null), dir = lakeWaveAt(lk, 10, 90);
  add('B10 ohne Windrichtung: Obergrenze über die längste Strecke, als solche markiert', up.upper === true && up.fetchM === 3500 && dir.upper === false && dir.fetchM === 900 && up.hsM > dir.hsM);
  add('B11 höchste Schätzung über die Stunden; Böenhinweis ab 25 kn und ab 34 kn', lakeWaveMax(lk, [{ t: 1, windMs: 4, gustMs: 5, windDir: 90 }, { t: 2, windMs: 9, gustMs: 12, windDir: 90 }]).t === 2
    && L.lakeGustHint(24.9 / 1.943844) === 0 && L.lakeGustHint(25.1 / 1.943844) === 1 && L.lakeGustHint(34.1 / 1.943844) === 2 && L.lakeGustHint(null) === null
    && lakeGustAhead([{ t: 0, windMs: 5, gustMs: 10, windDir: 0 }, { t: 2 * H, windMs: 9, gustMs: 14, windDir: 0 }, { t: 5 * H, windMs: 12, gustMs: 18, windDir: 0 }], 0).cls === 2
    && lakeGustAhead([{ t: 0, windMs: 5, gustMs: 10, windDir: 0 }], 0) === null);
  add('B12 Fetch-Rose: 36 Speichen, die längste am Rand', fetchRose(tab).pts.length === 36 && near(Math.max(...fetchRose(tab).pts.map((p) => p.r)), 1, 1e-9));
}

// --- C  outlines ----------------------------------------------------------------------------------------------------
if (!BYTES) {
  const cases = [['traunsee', 'euhydro'], ['murtensee', 'swisstopo'], ['steinhuder-meer', 'dlm250']];
  for (const [id, source] of cases) {
    const lake = srcLake(id), polys = B.outlinePolys(lake, bytes(`outline-${id}.json`), srcSpots(id));
    const area = B.lakeAreaKm2(polys);
    add(`C1 ${id}: Umriss aus ${source}, Fläche innerhalb 10 % der Quelle`, lake.outline === source && Math.abs(area - lake.areaKm2) / lake.areaKm2 < 0.1, `${area.toFixed(1)} / ${lake.areaKm2}`);
    const bb = B.lakeBbox(polys), diag = B.distKm(bb[1], bb[0], bb[3], bb[2]);
    for (const sp of srcSpots(id)) {
      const g = B.spotGeometry(sp, polys), cat = byId[sp.id];
      add(`C2 ${sp.id}: Uferpunkt ≤ ${B.LAKE_SNAP_MAX_M} m, Wasserpunkt im See, Normale zeigt aufs Wasser`, g.snapM <= B.LAKE_SNAP_MAX_M && B.inLake(polys, g.pt.lon, g.pt.lat) && !B.inLake(polys, ...(() => { const p = B.plane(g.lat, g.lon).from(-Math.sin(g.normal * Math.PI / 180) * 0.25, -Math.cos(g.normal * Math.PI / 180) * 0.25); return [p[0], p[1]]; })()), JSON.stringify({ snapM: g.snapM, normal: g.normal }));
      add(`C3 ${sp.id}: Fetch-Tabelle 36 Werte, keiner länger als die Diagonale des Sees, zur Landseite kurz`, g.fetch.length === 36 && Math.max(...g.fetch) <= diag * 1000 + 50 && g.fetch[Math.round(((g.normal + 180) % 360) / 10) % 36] < 1000, `max ${Math.max(...g.fetch)} m, Diagonale ${diag.toFixed(1)} km`);
      add(`C4 ${sp.id}: der Katalog trägt genau diese Geometrie`, cat.lat === g.lat && cat.lon === g.lon && cat.normal === g.normal && JSON.stringify(cat.lake.fetch) === JSON.stringify(g.fetch) && cat.lake.pt.lat === g.pt.lat);
    }
  }
  const tr = B.outlinePolys(srcLake('traunsee'), bytes('outline-traunsee.json'), srcSpots('traunsee'));
  const far = await thrown(() => B.spotGeometry({ id: 'x', lat: 47.95, lon: 13.60 }, tr));
  add('C5 Spot ohne Wasser: eine Lage weitab des Sees wird mit Grund abgelehnt', /vom Ufer des Sees/.test(far ?? ''), far);
  // A pond narrower than every offset: there is no water point in front of the shore.
  const pond = [[[[10, 50], [10.0002, 50], [10.0002, 50.0001], [10, 50.0001], [10, 50]]]];
  const noPt = await thrown(() => B.spotGeometry({ id: 'x', lat: 50.00005, lon: 10.0001 }, pond));
  add('C6 Spot ohne Wasserzelle: kein Wasserpunkt vor dem Ufer ⇒ abgelehnt, nichts erfunden', /kein Wasserpunkt|Ufernormale/.test(noPt ?? ''), noPt);
  const osm = await thrown(() => B.outlineUrl({ id: 'x', outline: 'osm', pick: {} }, []));
  add('C7 nicht zugelassene Umrissquelle (OSM) wird abgelehnt', /nicht zugelassen/.test(osm ?? ''), osm);
  // Two parts that touch are one water; a gap of 200 m ends the radial.
  const sq = (x0, x1) => [[[x0, -0.5], [x1, -0.5], [x1, 0.5], [x0, 0.5], [x0, -0.5]]];
  const touching = [sq(-1, 1), sq(1, 3)], apart = [sq(-1, 1), sq(1.2, 3)];
  add('C8 Fetch: sich berührende Teilflächen zählen als ein Wasser, eine Lücke beendet den Strahl', near(B.radialKm(touching, 90), 3, 1e-6) && near(B.radialKm(apart, 90), 1, 1e-6), `${B.radialKm(touching, 90)} / ${B.radialKm(apart, 90)}`);
  add('C9 Fetch: außerhalb des Wassers ist die Strecke 0', B.radialKm([sq(5, 6)], 90) === 0);
}

// --- D  catalogue ---------------------------------------------------------------------------------------------------
if (!BYTES) {
  add('D1 28 Seen, 70 Spots, jeder Spot an einem See der Tabelle', LAKES.length === 28 && SPOTS.length === 70 && SPOTS.every((s) => lakeById[s.lake.id]));
  add('D2 Regeln des Katalogs: kein Befund', B.lakeCatalogProblems({ lakes: LAKES, spots: SPOTS }).length === 0 && L.lakeTableProblems(LAKES).length === 0, B.lakeCatalogProblems({ lakes: LAKES, spots: SPOTS }).slice(0, 3).join(' | '));
  const merged = mergeSpotCatalogs(COAST, null, SPOTS);
  add('D3 zusammen mit der Küste: kein Befund, die Küsteneinträge unverändert vorn', spotCatalogProblems(merged).length === 0 && merged.length === COAST.length + 70 && JSON.stringify(merged.slice(0, COAST.length)) === JSON.stringify(COAST), spotCatalogProblems(merged).slice(0, 3).join(' | '));
  add('D4 ohne übergebenen Seekatalog bleibt der Katalog der von heute', JSON.stringify(mergeSpotCatalogs(COAST, null)) === JSON.stringify(COAST) && mergeSpotCatalogs(COAST, null, [{ ...SPOTS[0], lake: undefined }]).length === COAST.length);
  add('D5 jeder Wasserpunkt liegt im Punkt-Cube und höchstens 1,5 km vom Spot', SPOTS.every((s) => s.lake.pt.lat >= CUBE_DOMAIN.latMin && s.lake.pt.lat <= CUBE_DOMAIN.latMax && s.lake.pt.lon >= CUBE_DOMAIN.lonMin && s.lake.pt.lon <= CUBE_DOMAIN.lonMax && s.lake.pt.km <= L.LAKE_PT_MAX_KM));
  add('D6 der Wasserpunkt eines Seespots ist sein lake.pt, der eines Küstenspots die Mitte seiner CWAM-Zelle', spotWaterPoint(SPOTS[0]).lat === SPOTS[0].lake.pt.lat && JSON.stringify(spotWaterPoint(COAST[0])) === JSON.stringify(seaCellCentre('cwam', COAST[0].cell.i, COAST[0].cell.j)) && spotWaterPoint({}) === null);
  // Warning cells: recomputed from the recorded DWD geometry.
  const cells = B.readWarnCells(join(LK, 'dwd-warngebiete-binnenseen.json'));
  add('D7 23 Warnzellen mit Geometrie, alle mit 2 beginnend', cells.length === 23 && cells.every((c) => L.isLakeWarncell(c.id)) && !L.isLakeWarncell('908417000') && !L.isLakeWarncell('105315000'));
  const again = SPOTS.every((s) => (B.warnCellAt(cells, s.lake.pt.lat, s.lake.pt.lon)?.id ?? null) === (s.lake.warncell?.id ?? null));
  add('D8 die Warnzelle jedes Spots folgt aus der aufgezeichneten Geometrie', again);
  const withCell = [...new Set(SPOTS.filter((s) => s.lake.warncell).map((s) => s.lake.id))].sort();
  add('D9 Seen mit Warnzelle: Bodensee (drei Zellen), Chiemsee, Starnberger See, Ammersee, Müritz, Steinhuder Meer, Plöner und Selenter See', JSON.stringify(withCell) === JSON.stringify(['ammersee', 'bodensee', 'chiemsee', 'grosser-ploener-see', 'mueritz', 'selenter-see', 'starnberger-see', 'steinhuder-meer']) && lakeById.bodensee.warncells.length === 3, withCell.join(', '));
  add('D10 See ohne Warnzelle: Attersee — keine Zelle am Spot, keine in der Tabelle, aber ein verlinkter Dienst', byId['attersee-attersee'].lake.warncell === null && lakeById.attersee.warncells.length === 0 && lakeById.attersee.service.length > 0);
  const obs = J('obs-latest-lakes.json');
  const winds = SPOTS.map((s) => s.lake.stations.wind).filter(Boolean);
  add('D11 Windstationen: 69 von 70, jede aus obs/v1, höchstens 25 km und 150 m über/unter dem See', winds.length === 69 && winds.every((w) => obs.stations[w.id] && w.km <= 25 && Math.abs(w.dElevM) <= 150) && byId['steinhuder-meer-mardorf'].lake.stations.wind === null);
  add('D12 gemessene Wassertemperatur nur von WSV-Pegeln am See (Müritz, Plauer See, Schweriner See)', JSON.stringify([...new Set(SPOTS.filter((s) => s.lake.stations.wt).map((s) => s.lake.id))].sort()) === JSON.stringify(['mueritz', 'plauer-see', 'schweriner-see']) && SPOTS.every((s) => !s.lake.stations.wt || s.lake.stations.wt.net === 'wsv'));
  add('D13 Pegel nur von WSV und BAFU; österreichische und bayerische Seen ohne', SPOTS.every((s) => !s.lake.stations.level || ['wsv', 'bafu'].includes(s.lake.stations.level.net)) && ['attersee-attersee', 'chiemsee-prien', 'neusiedler-see-rust'].every((id) => byId[id].lake.stations.level === null) && byId['zuerichsee-zuerich'].lake.stations.level.net === 'bafu' && byId['bodensee-konstanz'].lake.stations.level.net === 'wsv');
  add('D14 Modellbecken an 18 Seen; keines am Neusiedler See und an den norddeutschen Seen', new Set(SPOTS.filter((s) => s.lake.model).map((s) => s.lake.id)).size === 18 && !byId['neusiedler-see-rust'].lake.model && !byId['mueritz-waren'].lake.model);
  // Negative controls of the rules.
  const mut = (f) => { const s = clone(byId['bodensee-lindau']); f(s); return L.lakeBlockProblems(s.id, s, s.lake); };
  add('D15 Gegenproben: CWAM-Zelle, Küstenabschnitt, kurze Fetch-Tabelle, ferner Wasserpunkt, Tiefe ohne Quelle fallen auf', mut((s) => { s.cell = { model: 'cwam', i: 1, j: 1, km: 0 }; }).length === 1 && mut((s) => { s.coast = { id: '5', name: 'x' }; }).length === 1 && mut((s) => { s.lake.fetch.pop(); }).length === 1 && mut((s) => { s.lake.pt.km = 2; }).length === 1 && mut((s) => { s.lake.depthFrom = ''; }).length === 1 && mut(() => {}).length === 0);
  add('D16 nicht lizenzierte Quelle abgelehnt: eine GKD-Station als Temperaturstation, eine Landkreis-Zelle als Seezelle', /ohne klare Lizenz/.test(mut((s) => { s.lake.stations.wt = { net: 'gkd', id: '18400503', name: 'Stock', km: 1, lat: 0, lon: 0 }; }).join()) && /keine Binnensee-Zelle/.test(mut((s) => { s.lake.warncell = { id: '908417000', name: 'x' }; }).join()));
  add('D17 fremde Landesparameter nur mit Vermerk; Umriss nur aus den drei zugelassenen Quellen', mut((s) => { s.lake.fusion = { country: 'CH' }; }).length === 1 && mut((s) => { s.lake.fusion = { country: 'CH', note: L.lakeForeignNote('französischen', 'CH') }; }).length === 0
    && L.lakeTableProblems([{ ...LAKES[0], outline: { source: 'osm', credit: 'x' } }]).length === 1 && L.lakeFusionCountry(lakeById.genfersee, 'FR') === 'CH' && L.lakeFusionCountry(lakeById['neusiedler-see'], 'HU') === 'AT' && L.lakeFusionCountry(lakeById.genfersee, 'CH') === 'CH' && L.lakeFusionCountry(lakeById.attersee, 'IT') === null);
  add('D18 Höhe und Tiefe je Spot aus der Seetabelle, mit Quelle', SPOTS.every((s) => s.lake.elevM === lakeById[s.lake.id].elevM && s.lake.depthM === lakeById[s.lake.id].depthM && /^https:\/\/(de|en)\.wikipedia\.org\//.test(s.lake.depthFrom)));
}

// --- E  producer ----------------------------------------------------------------------------------------------------
const RUN = '2026100700', runMs = Date.UTC(2026, 9, 7, 0);
const GEO = { schema: 1, product: 'sea-lake-geo', failed: [], entries: [['terrain/v2/z11r1+z8r1/47.5000,9.7000', { elevationM: 395.23 }]] };
function mkStore(name, { cat = true, geo = true, run = RUN } = {}) {
  const dir = join(tmp, name);
  mkdirSync(join(dir, 'static'), { recursive: true }); mkdirSync(join(dir, 'spots'), { recursive: true });
  writeFileSync(join(dir, 'spots', `${run}.json`), JSON.stringify({ schema: 1, product: 'sea-spots-series', run, spots: {} }));
  writeFileSync(join(dir, 'status.json'), JSON.stringify({ schema: 1, product: 'sea-status', updatedAt: null, killSwitch: false, field: { model: 'cwam', lastRun: run, lastPublishedRun: run, blocked: null, recent: [] }, text: {} }));
  if (cat) cpSync(join(LK, 'spots-lakes.json'), join(dir, 'static', 'spots-lakes.json'));
  if (geo) writeFileSync(join(dir, 'static', 'lake-geo.json'), JSON.stringify(GEO));
  return dir;
}
const seen = [];
const windLake = (t1, at, base, { drop = [], bad = [] } = {}) => async ({ spots, geoDoc }) => {
  const from = Math.round((Math.floor(at / H) * H - runMs) / H);
  seen.push({ n: spots.length, geo: geoDoc?.product, points: spots.map((s) => spotWaterPoint(s)), countries: spots.map((s) => s.lake?.fusion?.country) });
  return {
    series: Object.fromEntries(spots.filter((s) => !drop.includes(s.id)).map((s, k) => [s.id, {
      wind: SEA_SPOT_STEPS.map((h) => (h < from ? null : base + (h % 7) + (k % 3))), gust: SEA_SPOT_STEPS.map((h) => (h < from ? null : bad.includes(s.id) ? 900 : base + 20 + (h % 7) + (k % 3))), windDir: SEA_SPOT_STEPS.map((h) => (h < from || h % 4 === 0 ? null : (h * 11) % 360)),
    }])),
    failed: drop.map((id) => ({ id, error: 'kein Cube-Ergebnis' })), meta: { engine: 'buscosun Fusion 14', version: 14, computedAt: new Date(at).toISOString(), runs: { t1 } },
  };
};
if (!BYTES) {
  const s0 = mkStore('e0', { cat: false });
  add('E1 ohne Seekatalog: nicht fällig, nichts gerechnet, nichts geschrieben (Rückfall der Phase)', lakesDue(s0, '2026100706').due === false && /kein Seekatalog/.test(lakesDue(s0, '2026100706').reason) && readLakeCatalog(s0) === null && (await buildLakes({ storeDir: s0, dataDir: 'cdn', nowMs: runMs + 5 * H, indexT1: '2026100706', windImpl: windLake('2026100706', runMs + 5 * H, 40) })).built === false && !existsSync(join(s0, 'lakes')));
  const s1 = mkStore('e1', { geo: false });
  const before = readFileSync(join(s1, 'status.json'), 'utf8');
  const noGeo = await thrown(() => buildLakes({ storeDir: s1, dataDir: 'cdn', nowMs: runMs + 5 * H, indexT1: '2026100706', windImpl: windLake('2026100706', runMs + 5 * H, 40) }));
  add('E2 Katalog ohne lake-geo.json: Abbruch mit Grund, Speicher unverändert', /lake-geo\.json fehlt/.test(noGeo ?? '') && !existsSync(join(s1, 'lakes')) && readFileSync(join(s1, 'status.json'), 'utf8') === before, noGeo);
  const s = mkStore('e2');
  const at1 = runMs + 5 * H + 20 * 60_000;
  const r1 = await buildLakes({ storeDir: s, dataDir: 'cdn', nowMs: at1, indexT1: '2026100706', windImpl: windLake('2026100706', at1, 40) });
  const st1 = readStatus(s), doc1 = JSON.parse(readFileSync(join(s, r1.path), 'utf8'));
  add('E3 Rechnung geschrieben: Datei, Zeiger, 70 Spots, ab Stunde 5', r1.built && r1.path === L.seaLakesPath(RUN, '2026100706') && st1.lakes.path === r1.path && st1.lakes.spots === 70 && doc1.from === 5 && Object.keys(doc1.spots).length === 70 && L.seaLakesDocProblems(doc1).length === 0, JSON.stringify(r1).slice(0, 200));
  add('E4 jede Reihe besteht die Wertsperre; vor der Rechenstunde steht kein Wert', Object.values(doc1.spots).every((x) => L.lakeSeriesProblems(x.v, 79).length === 0 && x.v.wind.slice(0, 5).every((v) => v === null) && x.v.wind[5] != null));
  const call = seen[seen.length - 1];
  add('E5 gerechnet wird am Wasserpunkt jedes Spots, mit den Landesparametern seines Landes und den Geländeeinträgen der Seen', call.n === 70 && call.geo === 'sea-lake-geo' && call.points.every((p, k) => p.lat === SPOTS[k].lake.pt.lat) && call.countries.filter((c) => c === 'CH').length === SPOTS.filter((x) => x.lake.land === 'CH').length && call.countries.includes('AT') && call.countries.includes('DE'));
  add('E6 der Zeiger ist lesbar; eine andere Datei unter dem Zeiger zählt nicht', L.lakesPointerOf(st1)?.path === r1.path && L.lakesPointerOf({ lakes: { ...st1.lakes, path: 'lakes/x.json' } }) === null && L.lakesPointerOf({}) === null);
  add('E7 derselbe t1 noch einmal: nicht fällig', lakesDue(s, '2026100706').due === false && (await buildLakes({ storeDir: s, dataDir: 'cdn', nowMs: at1 + 15 * 60_000, indexT1: '2026100706', windImpl: windLake('2026100706', at1, 40) })).built === false);
  const at2 = runMs + 8 * H + 20 * 60_000;
  const r2 = await buildLakes({ storeDir: s, dataDir: 'cdn', nowMs: at2, indexT1: '2026100709', windImpl: windLake('2026100709', at2, 60) });
  const doc2 = JSON.parse(readFileSync(join(s, r2.path), 'utf8')), a = doc1.spots['bodensee-lindau'].v, b = doc2.spots['bodensee-lindau'].v;
  add('E8 neuer t1: neue Datei; die Stunden davor stammen aus der vorigen Rechnung dieses Laufs', r2.built && doc2.from === 8 && [5, 6, 7].every((i) => b.wind[i] === a.wind[i] && b.gust[i] === a.gust[i]) && b.wind[8] !== a.wind[8] && b.wind.slice(0, 5).every((v) => v === null) && existsSync(join(s, r1.path)), JSON.stringify({ from: doc2.from }));
  // A failing spot and an implausible series: named, never written.
  const at3 = runMs + 11 * H;
  const r3 = await buildLakes({ storeDir: s, dataDir: 'cdn', nowMs: at3, indexT1: '2026100712', windImpl: windLake('2026100712', at3, 50, { drop: ['murtensee-murten'], bad: ['attersee-attersee'] }) });
  const doc3 = JSON.parse(readFileSync(join(s, r3.path), 'utf8'));
  add('E9 ein Spot ohne Rechnung steht in failed, eine unplausible Reihe in rejected — keiner bekommt einen Eintrag', r3.built && r3.spots === 68 && !doc3.spots['murtensee-murten'] && !doc3.spots['attersee-attersee'] && doc3.wind.failed[0].id === 'murtensee-murten' && /attersee-attersee/.test(doc3.rejected[0]));
  // V-SW-18: no spot at all ⇒ abort, nothing written, the pointer stays.
  const ptr = JSON.stringify(readStatus(s).lakes), files = readdirSync(join(s, 'lakes')).length;
  const none = await thrown(() => buildLakes({ storeDir: s, dataDir: 'cdn', nowMs: runMs + 14 * H, indexT1: '2026100715', windImpl: async () => ({ series: {}, failed: [{ id: 'x', error: 'Klimatologie von buscosun Fusion fehlt' }], meta: null }) }));
  add('E10 kein Spot mit Wind: Abbruch mit dem Grund des Motors, keine Datei mit Nullen, Zeiger unverändert (V-SW-18)', /kein Spot mit Wind — Klimatologie/.test(none ?? '') && JSON.stringify(readStatus(s).lakes) === ptr && readdirSync(join(s, 'lakes')).length === files, none);
  // A new wave run: due again, the lake file names the new run.
  writeFileSync(join(s, 'spots', '2026100712.json'), JSON.stringify({ schema: 1, product: 'sea-spots-series', run: '2026100712', spots: {} }));
  const stx = readStatus(s); stx.field.lastPublishedRun = '2026100712'; writeFileSync(join(s, 'status.json'), JSON.stringify(stx));
  add('E11 neuer Seegangslauf: die Seen sind wieder fällig (ihre Stundenachse ist die des Laufs)', lakesDue(s, '2026100712').due === true && lakesDue(s, '2026100712').run === '2026100712');
  // Retention.
  for (const t of ['2026100701', '2026100702', '2026100703', '2026100704', '2026100705']) writeFileSync(join(s, 'lakes', `${RUN}-w${t}.json`), '{}');
  rmSync(join(s, 'spots', `${RUN}.json`)); writeFileSync(join(s, 'spots', `${RUN}.json`), '{}');
  pruneLakes(s);
  add('E12 Aufbewahrung: höchstens vier Dateien je Lauf', readdirSync(join(s, 'lakes')).filter((f) => f.startsWith(RUN)).length === L.SEA_LAKES_KEPT_PER_RUN);
  add('E13 Kill-Schalter: nichts gerechnet', (await buildLakes({ storeDir: mkStore('e3'), dataDir: 'cdn', nowMs: at1, indexT1: '2026100706', windImpl: windLake('2026100706', at1, 40), killed: true })).built === false);

  // Alplakes.
  const ans = J('alplakes-1d-point-murten.json'), basin = L.alplakesBasinOf(ans);
  add('E14 Alplakes-Antwort: 3-stündliche Werte in 0,1 °C, aufsteigende Stunden', typeof basin === 'object' && basin.h.length === ans.time.length && basin.h.every((x, i) => i === 0 || x > basin.h[i - 1]) && basin.c.every((x) => x === null || Number.isInteger(x)) && near(L.lakeWtAt(basin, basin.h[3] * H), ans.variables.T.data[3], 0.051), JSON.stringify(basin).slice(0, 80));
  add('E15 Gegenproben: falsche Einheit, kürzere Spalte, leere Antwort werden mit Grund abgelehnt', /Einheit/.test(L.alplakesBasinOf({ ...ans, variables: { T: { ...ans.variables.T, unit: 'K' } } })) && /Länge/.test(L.alplakesBasinOf({ ...ans, variables: { T: { ...ans.variables.T, data: ans.variables.T.data.slice(1) } } })) && /Zeitachse/.test(L.alplakesBasinOf({})));
  add('E16 die Stunde hinter der Reihe bekommt keinen Wert (nie fortgeschrieben)', L.lakeWtAt(basin, (basin.h[basin.h.length - 1] + 2) * H) === null && L.lakeWtAt(basin, (basin.h[basin.h.length - 1] + 1) * H) !== null && L.lakeWtAt(null, 0) === null);
  add('E17 die Abruf-Adresse: ein Becken, 1 m Tiefe, gestern bis vier Tage voraus', /^https:\/\/alplakes-api\.eawag\.ch\/simulations\/1d\/point\/simstrat\/murten\/\d{12}\/\d{12}\/1\?variables=T$/.test(L.alplakesPointUrl('murten', runMs)));
  let asked = 0;
  const okFetch = async () => { asked++; return { ok: true, status: 200, headers: { get: () => null }, json: async () => ans }; };
  const w = mkStore('e4');
  const rw = await buildLakeWt({ storeDir: w, nowMs: runMs, fetchImpl: okFetch, pauseMs: 0, killed: false });
  const wdoc = JSON.parse(readFileSync(join(w, rw.path), 'utf8'));
  add('E18 Modelltemperatur geschrieben: 22 Becken, je EIN Abruf, Lizenz und Nennung im Dokument, Zeiger', rw.built && asked === 22 && Object.keys(wdoc.basins).length === 22 && wdoc.licence === 'CC BY 4.0' && wdoc.credit === 'Data: Alplakes, Eawag (CC BY 4.0)' && L.lakesWtProblems(wdoc).length === 0 && L.lakesWtPointerOf(readStatus(w))?.path === rw.path, `${asked} Abrufe`);
  asked = 0;
  add('E19 jünger als 6 h: kein Abruf', (await buildLakeWt({ storeDir: w, nowMs: runMs + 5 * H, fetchImpl: okFetch, pauseMs: 0, killed: false })).built === false && asked === 0);
  let n429 = 0;
  const one429 = await collectLakeWt({ keys: ['murten', 'zug'], nowMs: runMs, pauseMs: 0, fetchImpl: async (u) => { if (u.includes('/zug/')) { n429++; return { ok: false, status: 429, headers: { get: () => null } }; } return okFetch(); } });
  add('E20 Drossel (429): drei Versuche, dann steht das Becken in failed; das andere ist da', n429 === 3 && one429.failed.length === 1 && one429.failed[0].key === 'zug' && /429/.test(one429.failed[0].error) && !!one429.basins.murten);
  const w2 = mkStore('e5');
  const dead = await thrown(() => buildLakeWt({ storeDir: w2, nowMs: runMs, fetchImpl: async () => ({ ok: false, status: 503, headers: { get: () => null } }), pauseMs: 0, killed: false }));
  add('E21 Alplakes fällt ganz aus: Abbruch mit Grund, nichts geschrieben, nach drei Becken nicht weiter gefragt', /kein Becken mit Antwort/.test(dead ?? '') && !existsSync(join(w2, 'lakes')) && !readStatus(w2).lakesWt, dead);
  add('E22 CORS-Absage von Alplakes ist aufgezeichnet — die Seite liest das Modell nie selbst', bytes('alplakes-preflight.txt').toString('utf8') === 'Disallowed CORS origin');
  const od = { t0: '2026-11-20T10:50:00.000Z', n: 14, step: 'PT10M', stations: { 'de:1': { ff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], dd: new Array(14).fill(200), fx: [9, 2, 3, 4, 5, 6, 30, 8, 9, 10, 11, 12, 13, 14] } } };
  const rows = lakeObsRows(od, 'de:1');
  add('E23 Archiv: Stundenzeilen der Seestationen — Wind zur vollen Stunde, Böe = höchste der Stunde', rows.length === 3 && rows[0].t === '2026-11-20T11:00:00.000Z' && rows[0].ff === 2 && rows[0].fx === 9 && rows[1].ff === 8 && rows[1].fx === 30 && rows[2].fx === 14 && lakeObsRows(od, 'de:2').length === 0, JSON.stringify(rows));
}

// --- F0 the coast does not notice the lakes — fast form, in every run ------------------------------------------------
// The wave producer and the wind refresh take their spots from `readCatalog` alone. Shown on the recorded spot file of
// run 2026100700: the catalogue is the same with and without the lake catalogue in the store, and the wind refresh
// (no wave build) writes the same bytes. The stand-in's wind depends on the NUMBER of spots it is asked for — 70 lake
// spots leaking into the catalogue would move every value.
if (!BYTES) {
  const baseSpots = readFileSync(join(FIX, 'spots-2026100700.json'));
  const now = Date.parse('2026-10-07T12:20:00Z');
  const windN = (t1) => async ({ spots }) => ({
    series: Object.fromEntries(spots.map((s) => [s.id, { wind: SEA_SPOT_STEPS.map((h) => (h < 12 ? null : 80 + h + (spots.length % 11))), gust: SEA_SPOT_STEPS.map((h) => (h < 12 ? null : 110 + h + (spots.length % 11))), windDir: SEA_SPOT_STEPS.map((h) => (h < 12 ? null : (h * 7 + spots.length) % 360)) }])),
    failed: [], meta: { engine: 'buscosun Fusion 14', version: 14, computedAt: new Date(now).toISOString(), runs: { t1 } },
  });
  const dkOne = { ...clone(COAST[COAST.length - 1]), id: 'gegenprobe-dk', country: 'DK', coast: null, wodlCoast: null, station: null, dk: { cube: true, wind: 'fusion', wl: null } };
  const make = async (name, { lakes, extra = null }) => {
    const dir = join(tmp, name);
    mkdirSync(join(dir, 'static'), { recursive: true }); mkdirSync(join(dir, 'spots'), { recursive: true });
    cpSync(join(FIX, 'static', 'spots.json'), join(dir, 'static', 'spots.json'));
    writeFileSync(join(dir, 'spots', `${RUN}.json`), baseSpots);
    writeFileSync(join(dir, 'status.json'), JSON.stringify({ schema: 1, product: 'sea-status', updatedAt: null, killSwitch: false, field: { model: 'cwam', lastRun: RUN, lastPublishedRun: RUN, blocked: null, recent: [] }, text: {} }));
    if (lakes) { cpSync(join(LK, 'spots-lakes.json'), join(dir, 'static', 'spots-lakes.json')); writeFileSync(join(dir, 'static', 'lake-geo.json'), JSON.stringify(GEO)); }
    if (extra) writeFileSync(join(dir, 'static', 'spots-dk.json'), JSON.stringify({ schema: 1, product: 'sea-spots', part: 'dk', spots: [extra] }));
    const wr = await windRefresh({ storeDir: dir, dataDir: 'cdn', nowMs: now, indexT1: '2026100712', windImpl: windN('2026100712') });
    return { dir, wr, cat: JSON.stringify(readCatalog(dir).spots), wind: wr.built ? readFileSync(join(dir, seaSpotsWindPath(RUN, '2026100712'))) : null, run: readFileSync(join(dir, 'spots', `${RUN}.json`)) };
  };
  const plain = await make('f0-plain', { lakes: false }), withL = await make('f0-lakes', { lakes: true }), grown = await make('f0-grown', { lakes: false, extra: dkOne });
  add('F0a der Katalog des Wellenproducers ist mit und ohne Seekatalog im Speicher derselbe und trägt keinen Seespot', plain.cat === withL.cat && !readCatalog(withL.dir).spots.some((s) => s.lake) && readCatalog(withL.dir).spots.length === COAST.length && existsSync(join(withL.dir, 'static', 'spots-lakes.json')));
  add('F0b die Wind-Auffrischung auf der aufgezeichneten Lauf-Datei ist mit und ohne Seekatalog byte-gleich; die Lauf-Datei bleibt unberührt; der Speicher mit Seen trägt danach keine Seereihe',
    plain.wr.built && withL.wr.built && Buffer.compare(plain.wind, withL.wind) === 0 && Buffer.compare(withL.run, baseSpots) === 0 && !existsSync(join(withL.dir, 'lakes')) && plain.wr.spots > 50, `${plain.wind?.length} / ${withL.wind?.length} B, ${plain.wr.spots} Spots`);
  add('F0c Gegenprobe: ein zusätzlicher Küstenspot ändert Katalog und Datei — der Vergleich ist nicht blind', grown.wr.built && grown.cat !== plain.cat && Buffer.compare(plain.wind, grown.wind) !== 0);
  const derive = readFileSync(join(ROOT, 'scripts/sea/sea-derive.mjs'), 'utf8');
  const bodyOf = (name) => { const i = derive.indexOf(`export async function ${name}(`); return derive.slice(i, derive.indexOf('\nexport ', i + 10)); };
  add('F0d Quelltext: Lauf und Wind-Auffrischung lesen ihre Spots nur über readCatalog; readCatalog kennt nur spots.json und spots-dk.json; der volle Byte-Vergleich (drei Wellenläufe) ist ein eigenes Skript',
    bodyOf('buildRun').length > 500 && bodyOf('windRefresh').length > 500 && derive.indexOf('export function readCatalog(') > 0 && derive.indexOf('// --- inventory') > derive.indexOf('export function readCatalog(')
    && (COAST.length + 70) % 11 !== COAST.length % 11
    && /const cat = readCatalog\(storeDir\);/.test(bodyOf('buildRun')) && /const cat = readCatalog\(storeDir\);/.test(bodyOf('windRefresh')) && !/lake/i.test(derive.slice(derive.indexOf('export function readCatalog('), derive.indexOf('// --- inventory')))
    && /"verify:sea-lakes-bytes": "[^"]*scripts\/verify-sea-lakes\.mjs --bytes"/.test(readFileSync(join(ROOT, 'package.json'), 'utf8')));
}

// --- F  the coast does not notice the lakes — the full byte comparison (`--bytes`, three wave builds) ------------------
if (BYTES) {
  const GRIB = join(FIX, 'cwam-2026100700');
  const files = readdirSync(GRIB).filter((f) => f.endsWith('.bz2'));
  const fileOf = (p, s) => {
    const P = p.toUpperCase();
    const own = files.find((f) => f === `CWAM_${P}_${RUN}_${String(s).padStart(3, '0')}.grib2.bz2`);
    return join(GRIB, own ?? files.find((f) => f === `CWAM_${P}_${RUN}_024.grib2.bz2`) ?? files.find((f) => f.startsWith(`CWAM_${P}_`)));
  };
  const two = COAST.filter((s) => ['st-peter-ording', 'fehmarn-gruener-brink'].includes(s.id));
  const inv = parseInventory(SEA_PARAMS.flatMap((p) => SEA_MODELS.cwam.steps.map((s) => `./wave_models/cwam/grib/00/${p}/CWAM_${p.toUpperCase()}_${RUN}_${String(s).padStart(3, '0')}.grib2.bz2|1000|2026-10-07 04:07:00`)).join('\n'));
  const now = Date.parse('2026-10-07T05:10:00Z');
  const windCoast = (t1) => async ({ spots }) => ({
    series: Object.fromEntries(spots.map((s, k) => [s.id, { wind: SEA_SPOT_STEPS.map((h) => (h < 5 ? null : 80 + h + k)), gust: SEA_SPOT_STEPS.map((h) => (h < 5 ? null : 110 + h + k)), windDir: SEA_SPOT_STEPS.map((h) => (h < 5 ? null : (h * 7) % 360)) }])),
    failed: [], meta: { engine: 'buscosun Fusion 14', version: 14, computedAt: new Date(now).toISOString(), runs: { t1 } },
  });
  const make = async (name, { lakes, extra = null }) => {
    const dir = join(tmp, name);
    mkdirSync(join(dir, 'static'), { recursive: true });
    writeFileSync(join(dir, 'static', 'spots.json'), JSON.stringify({ schema: 1, product: 'sea-spots', spots: two }));
    if (lakes) { cpSync(join(LK, 'spots-lakes.json'), join(dir, 'static', 'spots-lakes.json')); writeFileSync(join(dir, 'static', 'lake-geo.json'), JSON.stringify(GEO)); }
    if (extra) writeFileSync(join(dir, 'static', 'spots-dk.json'), JSON.stringify({ schema: 1, product: 'sea-spots', part: 'dk', spots: [extra] }));
    const r = await buildRun({ storeDir: dir, dataDir: 'cdn', cacheDir: join(tmp, `${name}-cache`), run: RUN, inv, nowMs: now, ewam: false, windImpl: windCoast('2026100703'), fileOf, killed: false });
    const wr = await windRefresh({ storeDir: dir, dataDir: 'cdn', nowMs: now + 3 * H, indexT1: '2026100706', windImpl: windCoast('2026100706') });
    return { dir, built: r.built && wr.built, spots: readFileSync(join(dir, seaSpotsPath(RUN))), wind: readFileSync(join(dir, seaSpotsWindPath(RUN, '2026100706'))) };
  };
  const dk = { ...clone(two[1]), id: 'gegenprobe-dk', country: 'DK', coast: null, wodlCoast: null, station: null, dk: { cube: true, wind: 'fusion', wl: null } };
  const [plain, withL, grown] = await Promise.all([make('f-plain', { lakes: false }), make('f-lakes', { lakes: true }), make('f-grown', { lakes: false, extra: dk })]);
  add('F1 beide Speicher bauen den Lauf und die Wind-Auffrischung', plain.built && withL.built);
  add('F2 spots/<lauf>.json ist mit und ohne Seekatalog byte-gleich', Buffer.compare(plain.spots, withL.spots) === 0, `${plain.spots.length} / ${withL.spots.length} B`);
  add('F3 die Wind-Auffrischung ist mit und ohne Seekatalog byte-gleich', Buffer.compare(plain.wind, withL.wind) === 0);
  add('F4 der Katalog des Wellenproducers kennt keinen Seespot; der Speicher mit Seen trägt keine Seereihe', readCatalog(withL.dir).spots.length === 2 && !readCatalog(withL.dir).spots.some((s) => s.lake) && !existsSync(join(withL.dir, 'lakes')) && Object.keys(JSON.parse(withL.spots.toString('utf8')).spots).length === 2);
  // Negative control: the same comparison DOES notice a catalogue that grows by a coastal spot.
  add('F5 Gegenprobe: ein zusätzlicher Küstenspot ändert die Datei — der Vergleich ist nicht blind', grown.built && Buffer.compare(plain.spots, grown.spots) !== 0 && Object.keys(JSON.parse(grown.spots.toString('utf8')).spots).length === 3);
}

// --- G  page logic --------------------------------------------------------------------------------------------------
if (!BYTES) {
  // Series: a coastal document plus the lake file.
  const coastRaw = { schema: 1, product: 'sea-spots-series', run: RUN, runMs, steps: 79, wind: { engine: 'buscosun Fusion 14', failed: [] }, spots: { 'st-peter-ording': { v: Object.fromEntries(['hs', 'dir', 'tm', 'ws', 'wsDir', 'wsPer', 'wsPeak', 'sw', 'swDir', 'swPer', 'swPeak', 'wind', 'gust', 'windDir'].map((k) => [k, new Array(79).fill(k === 'gust' ? 90 : 50)])) } } };
  const doc = parseSpotsDoc(coastRaw, RUN);
  const s = mkStore('g1');
  const at = runMs + 6 * H;
  const r = await buildLakes({ storeDir: s, dataDir: 'cdn', nowMs: at, indexT1: '2026100706', windImpl: windLake('2026100706', at, 40) });
  const lakeDoc = JSON.parse(readFileSync(join(s, r.path), 'utf8'));
  const both = withLakes(doc, lakeDoc);
  add('G1 die Seite liest die Seespots wie jeden Spot: Wind in m/s auf derselben Stundenachse, alle Wellenspalten leer', Object.keys(both.series).length === 71 && both.series['bodensee-lindau'].wind[6] === lakeDoc.spots['bodensee-lindau'].v.wind[6] / 10 && both.series['bodensee-lindau'].hs.every((x) => x === null) && both.lakeWind.t1 === '2026100706');
  add('G2 die Küstenreihe ist danach dieselbe', JSON.stringify(both.series['st-peter-ording']) === JSON.stringify(doc.series['st-peter-ording']));
  add('G3 eine Seedatei eines anderen Laufs wird nicht angehängt; eine unplausible Reihe bleibt draußen', withLakes(doc, { ...lakeDoc, run: '2026100712' }) === doc && withLakes(doc, null) === doc
    && !withLakes(doc, { ...lakeDoc, spots: { ...lakeDoc.spots, 'bodensee-lindau': { v: { ...lakeDoc.spots['bodensee-lindau'].v, wind: lakeDoc.spots['bodensee-lindau'].v.wind.map(() => 900) } } } }).series['bodensee-lindau']);
  const stale = await loadLakes({ run: RUN, t1: '2026100706', path: r.path, builtAt: new Date(at).toISOString() }, at + 13 * H);
  add('G4 eine Rechnung älter als 12 h wird nicht gezeigt; ohne Zeiger „keine Rechnung“', stale.state === 'stale' && stale.doc === null && (await loadLakes(null, at)) === SEA_LAKES_NONE);
  add('G5 Revier „Seen“ nimmt genau die Seespots; Nordsee und Ostsee keinen', SEA_REVIERE.includes('seen') && seaInRevier(SPOTS[0], 'seen') && !seaInRevier(COAST[0], 'seen') && !seaInRevier(SPOTS[0], 'nordsee') && !seaInRevier(SPOTS[0], 'ostsee') && seaInRevier(SPOTS[0], 'alle'));
  // Classes stay off at lakes.
  const inp = { series: { x: { wind: [12], gust: [16], windDir: [200], hs: [null], ws: [null], wsPer: [null], tm: [null] } }, limits: { windMin: 10, windMax: 30, gustMax: 35, spreadMax: null, hsMax: null, wsMax: null, steepMinPerS: null, steepHsM: null }, firstIdx: 0, nowHour: Date.UTC(2026, 5, 1, 10), nHours: 1 };
  const vLake = verdictOf(inp, { id: 'x', normal: 20, lat: 47.5, lon: 9.7, lake: {} }, 0), vCoast = verdictOf(inp, { id: 'x', normal: 20, lat: 47.5, lon: 9.7 }, 0);
  add('G6 Profilklassen an Seen aus: keine Klasse, aber Uferseite und Tageslicht bleiben; an der Küste unverändert', L.LAKE_VERDICTS === false && vLake.cls === 'keine' && vLake.reasons[0] === L.LAKE_VERDICT_OFF_SHORT && vLake.shore === vCoast.shore && vLake.daylight === vCoast.daylight && vCoast.cls !== 'keine', JSON.stringify([vLake, vCoast]));

  // Measurement of the lake station (obs/v1).
  const obs = J('obs-latest-lakes.json'), nowObs = Date.parse(obs.builtAt);
  const id = byId['bodensee-lindau'].lake.stations.wind.id, e = obs.stations[id], o = L.lakeObsOf(e, nowObs);
  add('G7 Messung aus der echten Antwort: Wind, Richtung, Böe der Station', o && o.ffMs === (e.v.ff ?? e.older?.ff?.v) && o.fxMs === (e.v.fx ?? e.older?.fx?.v) && o.dropped.length === 0, JSON.stringify(o));
  add('G8 veraltete Messung: älter als 90 Minuten ⇒ keine Messung, kein alter Wert', L.lakeObsOf(e, nowObs + 3 * H) === null && L.lakeObsOf(e, o.t + 60_000) !== null);
  const wild = L.lakeObsOf({ ...e, v: { ...e.v, ff: 80, fx: 90 }, older: {} }, nowObs), low = L.lakeObsOf({ ...e, v: { ...e.v, ff: 12, fx: 6 }, older: {} }, nowObs);
  add('G9 unplausible Messung: 80 m/s Wind wird verworfen, eine Böe unter dem Wind auch — mit Grund', wild === null && low && low.ffMs === 12 && low.fxMs === null && /unter dem Wind/.test(low.dropped.join()), JSON.stringify(low));
  add('G10 Station ohne Eintrag oder mit leerem Eintrag: keine Messung', L.lakeObsOf(undefined, nowObs) === null && L.lakeObsOf({}, nowObs) === null);

  // Water: WSV and BAFU.
  const wt = J('wsv-current-wt-waren.json'), wv = J('wsv-current-w-konstanz.json'), tWt = Date.parse(wt.timestamp);
  add('G11 WSV: Wassertemperatur und Pegel aus den echten Antworten', L.wsvCurrentOf(wt, tWt + 20 * 60_000, L.WSV_WT_RANGE_C).value === wt.value && L.wsvCurrentOf(wv, Date.parse(wv.timestamp) + 60_000, L.WSV_W_RANGE_CM).value === wv.value);
  add('G12 WSV: älter als drei Stunden oder außerhalb der Wertsperre ⇒ keine Messung', L.wsvCurrentOf(wt, tWt + 4 * H, L.WSV_WT_RANGE_C) === null && L.wsvCurrentOf({ ...wt, value: 41 }, tWt, L.WSV_WT_RANGE_C) === null && L.wsvCurrentOf({}, tWt, L.WSV_WT_RANGE_C) === null);
  const lin = J('lindas-lake-stations.json'), tLin = Date.parse(lin.results.bindings[0].time.value), lv = L.bafuLevelsOf(lin, tLin + 30 * 60_000);
  add('G13 BAFU: 34 Seestationen mit Pegel in m ü. M., keine einzige mit Wassertemperatur', Object.keys(lv).length === 34 && near(lv['2209'].value, 405.56, 0.5) && lin.results.bindings.every((b) => !b.temp));
  add('G14 BAFU: veraltete Antwort ⇒ kein Wert; jede Pegelstation des Katalogs steht in der Antwort', Object.keys(L.bafuLevelsOf(lin, tLin + 5 * H)).length === 0 && SPOTS.filter((x) => x.lake.stations.level?.net === 'bafu').every((x) => lv[x.lake.stations.level.id]));

  // Official DWD lake warnings: by cell, verbatim.
  const cap = (f) => parseCapAlert(bytes(f).toString('utf8'));
  const a57 = cap('cap-II57.xml'), a58 = cap('cap-II58.xml'), a51 = cap('cap-II51.xml');
  const tNow = (a57.onsetMs ?? a57.sentMs) + 60_000;
  const west = lakeAlertsOf([a57, a58, a51], '208439000', tNow), ost = lakeAlertsOf([a57, a58, a51], '208440000', (a58.onsetMs ?? a58.sentMs) + 60_000), stein = lakeAlertsOf([a57, a58, a51], '203259000', (a51.onsetMs ?? a51.sentMs) + 60_000);
  add('G15 Ereignis 57 STARKWIND: Zelle Bodensee - West, Überschrift und Text wörtlich aus der Meldung', a57.eventCode === 57 && west.length === 1 && west[0].headline === a57.headline && west[0].description === a57.description && west[0].area === 'Bodensee - West' && bytes('cap-II57.xml').toString('utf8').includes(west[0].headline), JSON.stringify(west[0] ?? null).slice(0, 160));
  add('G16 Ereignis 58 STURM: Zellen Bodensee - Ost und - Mitte', a58.eventCode === 58 && ost.length === 1 && ost[0].headline === a58.headline && lakeAlertsOf([a58], '208438000', (a58.onsetMs ?? a58.sentMs) + 60_000).length === 1);
  add('G17 Ereignis 51 WINDBÖEN: die Seezelle Steinhuder Meer steht in einer gewöhnlichen Windwarnung — zugeordnet über die Zelle, nicht den Code', a51.eventCode === 51 && stein.length === 1 && stein[0].area === 'Steinhuder Meer' && stein[0].headline === a51.headline);
  add('G18 See ohne Zelle, fremde Zelle, abgelaufene oder zurückgezogene Meldung: keine Warnung', lakeAlertsOf([a57, a58, a51], null, tNow).length === 0 && lakeAlertsOf([a57, a58, a51], '209913000', tNow).length === 0
    && lakeAlertsOf([{ ...a57, expiresMs: tNow - 1 }], '208439000', tNow).length === 0 && lakeAlertsOf([{ ...a57, msgType: 'Cancel' }], '208439000', tNow).length === 0 && lakeAlertsOf([{ ...a57, status: 'Test' }], '208439000', tNow).length === 0);
  add('G19 eine angekündigte Meldung ist als „noch nicht begonnen“ gekennzeichnet', lakeAlertsOf([a57], '208439000', (a57.onsetMs ?? a57.sentMs) - H)[0]?.active === false && west[0].active === true);
}

// --- H  source rules ------------------------------------------------------------------------------------------------
if (!BYTES) {
  const read = (f) => readFileSync(join(ROOT, f), 'utf8');
  const ui = read('src/sea/SeaLakeReadout.tsx'), view = read('src/sea/lakeView.ts'), contract = read('src/sea/seaLakes.ts'), client = read('src/sea/lakeClient.ts'), producer = read('scripts/sea/sea-lakes.mjs'), builder = read('scripts/sea/build-lake-spots.mjs'), wf = read('scripts/sea/workflow-sea.yml'), page = read('src/sea/SeaPage.tsx');
  const strings = (src) => (src.match(/'[^'\n]*'|`[^`]*`|>[^<>{}\n]+</g) ?? []).join('\n');
  add('H1 kein Wort „sicher“ in den Texten der Seen', !/\bsicher(e|er|es|en|heit)?\b/i.test(strings(ui) + strings(view) + strings(contract)));
  add('H1b Gegenprobe: die Prüfung findet das Wort, wenn es dasteht', /\bsicher(e|er|es|en|heit)?\b/i.test(strings(`const x = 'Das Wasser ist sicher.';`)));
  add('H2 die Windwelle heißt überall „geschätzte Windwelle (eigene Rechnung)“ und nennt ihr Verfahren', L.LAKE_WAVE_LABEL === 'geschätzte Windwelle (eigene Rechnung)' && ui.includes('LAKE_WAVE_LABEL') && ui.includes('LAKE_WAVE_SOURCE') && /nicht gemessen und nicht amtlich/.test(ui));
  add('H3 der Böenhinweis sagt, dass er nicht amtlich ist', /kein amtlicher Hinweis und keine Warnung/.test(L.LAKE_GUST_HINT_NOTE) && ui.includes('LAKE_GUST_HINT_NOTE') && JSON.stringify(L.LAKE_GUST_HINT_KN) === '[25,34]');
  add('H4 ohne Warnzelle steht wörtlich „Kein amtlicher Warnstatus im Datenbestand“ mit dem zuständigen Dienst', L.LAKE_NO_WARNING === 'Kein amtlicher Warnstatus im Datenbestand' && ui.includes('LAKE_NO_WARNING') && /lake\?\.service/.test(ui));
  add('H5 Alplakes fragt nur der Producer: die Browser-Leser kennen den Host nicht', !/alplakes-api/.test(client + ui + page) && /alplakesPointUrl/.test(producer));
  add('H6 nur verlinkte Quellen werden nirgends abgerufen (GKD, Hydro OÖ, Wasserportal Burgenland)', !/gkd\.bayern|hydro\.ooe|wasser\.bgld/.test(client + producer + builder) && L.LAKE_LINK_ONLY.length === 3);
  add('H7 der Katalogbau fragt kein OSM', !/openstreetmap|overpass|nominatim/i.test(builder.replace(/no OSM|\(no OSM\)|OSM\)/g, '')) && /sgx\.geodatenzentrum\.de/.test(builder) && /api3\.geo\.admin\.ch/.test(builder) && /image\.discomap\.eea\.europa\.eu/.test(builder));
  add('H8 kein Schalter in der Seite: kein Query-Parameter für die Seen', !/[?&'"](lakes|seen|lk)=/.test(page + ui + client));
  add('H9 Workflow-Vorlage: Schritt „Lakes due?“ vor dem Cube-Checkout, Schritt „Lakes“ nach Feldlauf und Wind, roter Schritt meldet sich', wf.indexOf('name: Lakes due?') > 0 && wf.indexOf('name: Lakes due?') < wf.indexOf('name: Cube checkout') && wf.indexOf('name: Lakes (buscosun Fusion') > wf.indexOf('name: Wind refresh\n') && /steps\.ldue\.outputs\.due == '1'/.test(wf) && /steps\.lakes\.outcome == 'failure'/.test(wf));
  add('H10 der Producer schreibt nie in spots/<lauf>.json', !/seaSpotsPath\([^)]*\)\s*,\s*[^)]*write|writeAtomic\(join\(storeDir, seaSpotsPath/.test(producer));
  add('H11 das Seen-Dossier ist ein eigener träger Chunk', /const SeaLakeReadout = lazy\(\(\) => import\('\.\/SeaLakeReadout'\)\)/.test(page));
  add('H12 mobil nur per Media Query: die Stile der Seen stehen vor dem Planer-Abschnitt', (() => { const css = read('src/sea/seaDeck.css'); return css.indexOf('Phase BS — Binnenseen') > 0 && css.indexOf('Phase BS — Binnenseen') < css.indexOf('Phase SP — „Ausfahrt planen“') && /@media \(max-width: 767px\) \{\s*\.sw-lk-chips/.test(css); })());
}

// --- I  wind direction (V-BS-1): the fill at interpolated hours and the words for an hour without a direction ------------
if (!BYTES) {
  const N = null, fill = (dir, interp, max) => L.fillLakeDir(dir, interp, max);
  const a1 = fill([80, N, 100], [1]), north = fill([350, N, N, 20], [1, 2]), south = fill([20, N, N, 350], [1, 2]), six = fill([0, N, N, N, N, N, 60], [1, 2, 3, 4, 5]);
  add('I1 fillLakeDir: eine interpolierte Stunde ohne Richtung bekommt den Wert auf dem kürzeren Bogen zwischen den beiden Nachbarschritten — auch über Nord (350°→20°: 0° und 10°; zurück 10° und 0°) und über mehrere Stunden (0°→60° in Sechsteln); ganze Grad 0–359; gezählt',
    JSON.stringify(a1) === '{"dir":[80,90,100],"filled":1}' && JSON.stringify(north.dir) === '[350,0,10,20]' && north.filled === 2 && JSON.stringify(south.dir) === '[20,10,0,350]' && JSON.stringify(six.dir) === '[0,10,20,30,40,50,60]' && six.filled === 5
    && JSON.stringify(fill([359, N, 1], [1]).dir) === '[359,0,1]' && JSON.stringify(fill([10, N, 10], [1]).dir) === '[10,10,10]' && [a1, north, south, six].every((r) => r.dir.every((x) => Number.isInteger(x) && x >= 0 && x <= 359)),
    JSON.stringify([a1, north.dir, south.dir, six.dir]));
  const src = [80, N, 100, N, 120];
  const gate = fill(src, [1]);
  add('I2 fillLakeDir füllt NUR interpolierte Stunden: eine Stunde ohne Richtung, die nicht interpoliert ist (Sperre des Motors), bleibt null; eine interpolierte Stunde MIT Richtung bleibt, wie sie ist; die Eingabe wird nicht verändert; ohne Liste eine unveränderte Kopie',
    JSON.stringify(gate.dir) === '[80,90,100,null,120]' && gate.filled === 1 && JSON.stringify(src) === '[80,null,100,null,120]' && JSON.stringify(fill([80, 33, 100], [1])) === '{"dir":[80,33,100],"filled":0}'
    && [null, undefined, []].every((i) => { const r = fill(src, i); return r.filled === 0 && JSON.stringify(r.dir) === JSON.stringify(src) && r.dir !== src; }));
  add('I3 fillLakeDir lässt leer, was die Regel nicht deckt: Nachbarschritt ohne Richtung, Sprung über 90° (90° selbst wird gefüllt, 91° nicht), keine Stunde davor oder dahinter, Index außerhalb oder keine ganze Zahl; die Grenze ist die Konstante (90, set) und lässt sich nur als Argument ändern',
    fill([N, N, 100], [1]).filled === 0 && fill([80, N, N], [1]).filled === 0 && fill([N, 80], [0]).filled === 0 && fill([80, N], [1]).filled === 0
    && JSON.stringify(fill([0, N, 90], [1]).dir) === '[0,45,90]' && fill([0, N, 91], [1]).filled === 0 && fill([300, N, 29], [1]).filled === 1 && fill([300, N, 31], [1]).filled === 0
    && fill([80, N, 100], [5, -1, 1.5]).filled === 0 && fill([0, N, 91], [1], 120).filled === 1 && fill([0, N, 40], [1], 30).filled === 0 && L.LAKE_DIR_FILL_MAX_DEG === 90);
  const kn = (x) => x / 1.943844;
  add('I4 lakeNoDirText: bis 6 kn (gerundet, set) „schwacher Wind ohne verlässliche Richtung“, darüber und ohne Wind „Richtung für diese Stunde nicht bestimmt“',
    L.LAKE_WEAK_WIND_KN === 6 && L.LAKE_NO_DIR_WEAK === 'schwacher Wind ohne verlässliche Richtung' && L.LAKE_NO_DIR === 'Richtung für diese Stunde nicht bestimmt'
    && L.lakeNoDirText(0) === L.LAKE_NO_DIR_WEAK && L.lakeNoDirText(kn(6)) === L.LAKE_NO_DIR_WEAK && L.lakeNoDirText(kn(6.4)) === L.LAKE_NO_DIR_WEAK && L.lakeNoDirText(kn(6.6)) === L.LAKE_NO_DIR && L.lakeNoDirText(kn(15)) === L.LAKE_NO_DIR
    && L.lakeNoDirText(null) === L.LAKE_NO_DIR && L.lakeNoDirText(undefined) === L.LAKE_NO_DIR);
  // Producer: the stand-in has no direction at every fourth hour; with `interp` naming those hours the file carries them.
  const at = runMs + 5 * H + 20 * 60_000, fourth = SEA_SPOT_STEPS.filter((h) => h > 5 && h % 4 === 0);
  const withInterp = (impl, hours) => async (a) => { const r = await impl(a); return { ...r, interp: Object.fromEntries(Object.keys(r.series).map((id) => [id, hours])) }; };
  const build = async (name, impl) => { const dir = mkStore(name); const r = await buildLakes({ storeDir: dir, dataDir: 'cdn', nowMs: at, indexT1: '2026100706', windImpl: impl }); return JSON.parse(readFileSync(join(dir, r.path), 'utf8')); };
  const dPlain = await build('i-plain', windLake('2026100706', at, 40)), dFill = await build('i-fill', withInterp(windLake('2026100706', at, 40), fourth));
  const lindau = dFill.spots['bodensee-lindau'].v.windDir, lindau0 = dPlain.spots['bodensee-lindau'].v.windDir;
  const strip = (d) => { const c = clone(d); for (const sp of Object.values(c.spots)) for (const i of fourth) sp.v.windDir[i] = null; delete c.dirFilled; return JSON.stringify(c); };
  add('I5 Producer: die Seedatei trägt die gefüllten Stunden (Stunde 8: 88° zwischen 77° und 99°, Stunde 32 über Nord: 352°), zählt sie in dirFilled (18 je Spot × 70) und nennt die Regel mit 90° in about; ohne `interp` ist dirFilled 0 und keine Stunde gefüllt',
    lindau[8] === 88 && lindau[32] === 352 && lindau0[8] === null && lindau[4] === null && fourth.length === 18 && dFill.dirFilled === 18 * 70 && dPlain.dirFilled === 0 && /höchstens 90°/.test(dFill.about) && /dirFilled/.test(dFill.about) && /null bleibt null/.test(dFill.about)
    && Object.values(dFill.spots).every((x) => L.lakeSeriesProblems(x.v, 79).length === 0), JSON.stringify([lindau[8], lindau[32], dFill.dirFilled]));
  add('I6 Negativkontrolle Seedatei: ohne die interpolierten Stunden und ohne dirFilled sind beide Dateien gleich — Wind, Böe und jede andere Stunde der Richtung unverändert; Gegenprobe: eine veränderte nicht interpolierte Stunde fällt auf',
    strip(dFill) === strip(dPlain) && JSON.stringify(dFill) !== JSON.stringify(dPlain) && strip((() => { const c = clone(dFill); c.spots['bodensee-lindau'].v.windDir[9] += 1; return c; })()) !== strip(dPlain));
  const read = (f) => readFileSync(join(ROOT, f), 'utf8');
  const ui = read('src/sea/SeaLakeReadout.tsx'), producer = read('scripts/sea/sea-lakes.mjs'), derive = read('scripts/sea/sea-derive.mjs'), ci = read('.github/workflows/ci.yml');
  add('I7 Verdrahtung: der Producer der Seen füllt mit fillLakeDir aus der Liste `interp` von spotWind; die Küstendateien nutzen dieselbe Funktion und Konstante (spotDirFill); das Seen-Dossier sagt an Wind, Windwelle und Fetch-Rose lakeNoDirText',
    /fillLakeDir\(w\.windDir, wind\.interp\?\.\[sp\.id\]\)/.test(producer) && /interp\[sp\.id\] = steps\.filter\(\(st\) => st\.interpolated\)/.test(derive) && /series: out, failed, sightIn, interp,/.test(derive)
    && /return interp \? fillLakeDir\(dir, interp\) : \{ dir: dir\.slice\(\), filled: 0 \};/.test(derive) && /import \{ fillLakeDir, LAKE_DIR_FILL_MAX_DEG \} from '\.\.\/\.\.\/src\/sea\/seaLakes\.ts';/.test(derive)
    && (ui.match(/lakeNoDirText\(h\.windMs\)/g) ?? []).length === 3 && !/Richtung für diese Stunde nicht bestimmt|die Windrichtung ist nicht bestimmt/.test(ui));
  add('I8 CI: verify:sea-lakes läuft im Workflow, genau einmal und auch nach einem roten Schritt davor; der Byte-Vergleich (verify:sea-lakes-bytes) läuft dort nicht (drei volle Wellenläufe)',
    (ci.match(/ci-run\.mjs verify:sea-lakes\b(?!-)/g) ?? []).length === 1 && /if: \$\{\{ !cancelled\(\) \}\}\s*\n\s*run: node scripts\/ci-run\.mjs verify:sea-lakes\s*\n/.test(ci.replace(/\r\n/g, '\n')) && !/verify:sea-lakes-bytes\s*\n/.test(ci.replace(/\r\n/g, '\n').replace(/^\s*#.*$/gm, '')));
}

// --- J: the map can reach every lake (V-BS-40, 22.11.2026) --------------------------------------------------------
{
  const mapSrc = readFileSync(join(ROOT, 'src/sea/SeaMap.tsx'), 'utf8');
  const vb = (/SEA_VIEW_BOUNDS: \[number, number, number, number\] = \[([^\]]+)\]/.exec(mapSrc)?.[1] ?? '').split(',').map(Number);
  const pan = { w: vb[0] - 6, s: Math.min(vb[1] - 4, L.SEA_PAN_SOUTH), e: vb[2] + 6, n: vb[3] + 4 };
  const inside = (lon, lat, m, south = pan.s) => lon > pan.w + m && lon < pan.e - m && lat > south + m && lat < pan.n - m;
  const out = CATDOC.spots.filter((s) => !inside(s.lon, s.lat, 1)).map((s) => s.id);
  const boxOut = CATDOC.lakes.filter((l) => !(inside(l.bbox[0], l.bbox[1], 1) && inside(l.bbox[2], l.bbox[3], 1))).map((l) => l.id);
  // Negative control: with the south edge from before phase BS (CWAM view minus 4°) most lake spots lie outside.
  const before = CATDOC.spots.filter((s) => !inside(s.lon, s.lat, 0, vb[1] - 4));
  add('J1 der verschiebbare Bereich der Karte reicht mit mindestens 1° Rand über jeden Seespot und jeden Seeumriss; Gegenprobe: mit dem alten Südrand (49,2° N) lagen 56 Spots an 19 Seen außerhalb',
    vb.length === 4 && vb.every(Number.isFinite) && out.length === 0 && boxOut.length === 0 && before.length === 56 && new Set(before.map((s) => s.lake.id)).size === 19
    && /maxBounds: \[\[SEA_VIEW_BOUNDS\[0\] - 6, Math\.min\(SEA_VIEW_BOUNDS\[1\] - 4, SEA_PAN_SOUTH\)\], \[SEA_VIEW_BOUNDS\[2\] \+ 6, SEA_VIEW_BOUNDS\[3\] \+ 4\]\],/.test(mapSrc)
    && (mapSrc.match(/maxBounds/g) ?? []).length === 1, JSON.stringify({ pan, out, boxOut, before: before.length }));
}

rmSync(tmp, { recursive: true, force: true });
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok || !c.detail ? '' : `\n    ${c.detail}`}`);
console.log(`\nverify:sea-lakes${BYTES ? '-bytes' : ''} — ${checks.length - failed.length}/${checks.length}${BYTES ? '' : '  (ohne Block F: der Byte-Vergleich mit drei vollen Wellenläufen läuft mit verify:sea-lakes-bytes)'}`);
if (failed.length) process.exit(1);
