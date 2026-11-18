#!/usr/bin/env node
/**
 * verify:sea-watertemp — phase WT, water temperature on /seewetter (audit/seewetter-wassertemperatur.md). No network, no browser.
 *
 * Fixtures `scripts/lib/fixtures/sea/wt/` = answers of the real services (opendataapi.dmi.dk, pegelonline.wsv.de),
 * byte-exact, recorded 18.11.2026 with the URLs the producer, the page and the archive build
 * (`scripts/sea/spike/wt-record-fixtures.mjs`); DMI's 429 body is the one of `verify:sea-dk` (kept from its measurement).
 *
 *   A  fixtures are what was recorded (sha256 of every file against the manifest; negative control)
 *   B  contract: runs (instances), pinned position answer → entry, land, DMI's error body, wrong run, tampered answers
 *   C  catalogue = the step-0 measurement; rules with negative controls; spot without a station; waters and sluices
 *   D  producer on a store with a DMI stand-in: once per run, new run, failure, land, value lock, give-up, total failure
 *   E  measurements: PEGELONLINE and DMI answers → points, newest value, whole hours, stale and empty stations, value lock
 *   F  page logic without a browser: model view, measurement view, "never the model in its place", loaders
 *   G  threshold: link, storage, strictness, windows, neutral sentences
 *   H  archive: hourly day files, merge, daily record, full days, full years
 *   I  source rules: hosts, no /grib, no key, credits, the model's sentence, no flag, lazy chart, no advice
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as W from '../src/sea/seaWaterTemp.ts';
import * as V from '../src/sea/waterTemp.ts';
import { DMI_HOST, DMI_CREDIT, DMI_WL_COLLECTIONS, DmiAnswerError } from '../src/sea/seaDmi.ts';
import { buildSeaUrl, parseSeaUrl, SEA_DEFAULT_STATE, SEA_WT_RE } from '../src/sea/seaState.ts';
import { mergeSpotCatalogs } from '../src/sea/seaContract.ts';
import { loadWaterTemp, loadWtCatalog, loadWtObs, loadWtDaily } from '../src/sea/waterTempClient.ts';
import { collectWaterTemp, buildWaterTemp, pruneWaterTemp, readWtCatalog, WT_GIVE_UP } from './sea/sea-dmi.mjs';
import { readStatus } from './sea/sea-derive.mjs';
import { buildWtCatalog, wtUsableStations, wsvDisplayName, WT_PROBE_FILE, WT_WSV_WATERS, WT_ARCHIVE_KM } from './sea/build-watertemp.mjs';
import { archiveWaterTemp, archiveSea, wtArchiveDays, WT_ARCHIVE_DAYS, WT_ARCHIVE_MAX_DAYS } from './sea/sea-archive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const WT = join(FIX, 'wt');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const bytes = (f) => readFileSync(join(WT, f));
const text = (f) => bytes(f).toString('utf8');
const J = (f) => JSON.parse(text(f));
const clone = (x) => JSON.parse(JSON.stringify(x));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const H = 3_600_000, DAY = 24 * H;
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return e instanceof DmiAnswerError && re.test(e.message); } };

const MAN = J('manifest.json');
const CAT = J('watertemp.json');
const PROBE = JSON.parse(readFileSync(resolve(ROOT, WT_PROBE_FILE), 'utf8'));
const DE = JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots;
const DKS = JSON.parse(readFileSync(join(FIX, 'dk', 'spots-dk.json'), 'utf8')).spots;
const SPOTS = mergeSpotCatalogs(DE, DKS);
const spotOf = (id) => SPOTS.find((s) => s.id === id);
const PICK = MAN.spots.filter((id) => CAT.spots[id]?.model);
const NOW = Date.parse(MAN.recordedAt);
const body429 = readFileSync(join(FIX, 'dk', 'edr-429-dkss_idw.json'), 'utf8');
const runOf = (coll) => MAN.runs[coll];

// --- A  fixtures -------------------------------------------------------------------------------------------------
{
  const names = Object.keys(MAN.files);
  const bad = names.filter((n) => !existsSync(join(WT, n)) || sha(bytes(n)) !== MAN.files[n].sha256 || bytes(n).length !== MAN.files[n].bytes);
  add('A1 jede Fixture ist byte-gleich mit ihrer Aufzeichnung (sha256, Länge)', names.length >= 14 && bad.length === 0, bad.join(', '));
  const onDisk = readdirSync(WT).filter((n) => n !== 'manifest.json');
  add('A2 im Ordner liegt keine Datei ohne Eintrag', onDisk.every((n) => MAN.files[n]), onDisk.filter((n) => !MAN.files[n]).join(', '));
  const urls = names.map((n) => MAN.files[n].url).filter(Boolean);
  const dmi = urls.filter((u) => u.includes('dmi.dk')), wsv = urls.filter((u) => u.includes('pegelonline'));
  add('A3 jede Antwort kam von opendataapi.dmi.dk oder www.pegelonline.wsv.de; keine über /grib, keine mit Schlüssel', dmi.length >= 10 && wsv.length >= 3 && dmi.length + wsv.length === urls.length
    && dmi.every((u) => u.startsWith(`${DMI_HOST}/`)) && wsv.every((u) => u.startsWith(`${W.WSV_HOST}/webservices/rest-api/v2/`)) && !urls.some((u) => /grib|api-key|apikey/i.test(u)), `${dmi.length}/${wsv.length}`);
  const one = `wt-${PICK[0]}.json`;
  const tampered = Buffer.from(bytes(one)); tampered[tampered.length - 20] ^= 1;
  add('A4 Gegenprobe: ein gekipptes Bit fällt auf', sha(tampered) !== MAN.files[one].sha256);
  add('A5 alle HTTP-Antworten der Aufzeichnung sind 200', names.filter((n) => MAN.files[n].url).every((n) => MAN.files[n].status === 200));
}

// --- B  contract ---------------------------------------------------------------------------------------------------
const GED = 'gedser', gedColl = CAT.spots[GED].model.coll;
{
  const inst = W.dmiNewestInstance(J(`instances-${gedColl}.json`));
  const ids = J(`instances-${gedColl}.json`).instances.map((x) => x.id);
  add('B1 Liste der Läufe: der neueste gewinnt, Kennung ↔ Zeit', ids.length >= 2 && inst.id === [...ids].sort().at(-1) && inst.t0 === W.dmiInstanceMs(inst.id) && inst.t0 % (6 * H) === 0 && inst.t0 === runOf(gedColl).t0, `${inst.id} von ${ids.length}`);
  add('B2 Lauf-Kennung: nur die Form 2026-11-18T120000Z', W.dmiInstanceMs('2026-11-18T120000Z') === Date.UTC(2026, 10, 18, 12) && Number.isNaN(W.dmiInstanceMs('2026-11-18T12:00:00Z')) && Number.isNaN(W.dmiInstanceMs(null)));
  add('B3 DMIs 429-Körper und Unsinn sind keine Liste — mit DMIs eigenen Worten', throwsWith(() => W.dmiNewestInstance(JSON.parse(body429)), /^DMI 429 Too Many Requests: Server is busy/) && throwsWith(() => W.dmiNewestInstance('<html>'), /keine JSON-Antwort/) && throwsWith(() => W.dmiNewestInstance({ instances: [{ id: 'x' }] }), /kein Lauf/));
  const doc = J(`wt-${GED}.json`);
  const e = W.wtEntry(doc, gedColl, spotOf(GED), inst.t0);
  const raw = doc.ranges[W.WT_PARAM].values;
  add('B4 Antwort am Lauf: 121 Stunden ab Laufbeginn, 0,1 °C ganzzahlig = °C × 10 gerundet, an jeder Stunde', e.c.length === 121 && e.t0 === inst.t0 && e.c.every((x, i) => (raw[i] == null ? x === null : x === Math.round(raw[i] * 10))), `${e.c.slice(0, 4)} …`);
  add('B5 Gitterpunkt mit Abstand zum Spot, innerhalb der Grenze; Werte innerhalb −2,5 … 32 °C', e.km >= 0 && e.km <= W.WT_MODEL_MAX_KM && W.wtEntryProblems(GED, e).length === 0 && e.c.every((x) => x == null || (x >= W.WT_RANGE_T[0] && x <= W.WT_RANGE_T[1])), `${e.km} km`);
  add('B6 die Abfrage ist an den Lauf gebunden (…/instances/<lauf>/position) und nennt nur water-temperature', MAN.files[`wt-${GED}.json`].url === W.dmiInstancePositionUrl(gedColl, inst.id, CAT.spots[GED].model.lat, CAT.spots[GED].model.lon, [W.WT_PARAM]) && /\/instances\/\d{4}-\d\d-\d\dT\d{6}Z\/position\?/.test(MAN.files[`wt-${GED}.json`].url) && /parameter-name=water-temperature&/.test(MAN.files[`wt-${GED}.json`].url));
  const land = J(`wt-land-${MAN.land.id}.json`);
  add('B7 Modellpunkt auf Land (echte Antwort: 200, lauter null) ⇒ benannter Grund, kein Eintrag', land.ranges[W.WT_PARAM].values.every((x) => x == null) && throwsWith(() => W.wtEntry(land, MAN.land.coll, spotOf(MAN.land.id)), /kein Wert am Modellpunkt \(Land im Modell\)/));
  add('B8 Antwort eines anderen Laufs ⇒ abgelehnt (einmal je Lauf heißt: genau dieser Lauf)', throwsWith(() => W.wtEntry(doc, gedColl, spotOf(GED), inst.t0 + 6 * H), /gefragt war der Lauf/));
  const hot = clone(doc); hot.ranges[W.WT_PARAM].values[3] = 41.5;
  const cold = clone(doc); cold.ranges[W.WT_PARAM].values[3] = -3;
  add('B9 Werteprüfung: 41,5 °C und −3 °C werden abgelehnt, mit Wert und Grenzen', throwsWith(() => W.wtEntry(hot, gedColl, spotOf(GED)), /41\.5 °C außerhalb -2\.5 … 32 °C/) && throwsWith(() => W.wtEntry(cold, gedColl, spotOf(GED)), /außerhalb/));
  const short = clone(doc); short.ranges[W.WT_PARAM].values.pop();
  const noParam = clone(doc); delete noParam.ranges[W.WT_PARAM];
  add('B10 Gegenprobe: gekürzte Spalte, fehlender Parameter, DMIs 429-Körper werden abgelehnt', throwsWith(() => W.wtEntry(short, gedColl, spotOf(GED)), /120 Werte bei 121 Zeiten/) && throwsWith(() => W.wtEntry(noParam, gedColl, spotOf(GED)), /fehlt in der Antwort/) && throwsWith(() => W.wtEntry(JSON.parse(body429), gedColl, spotOf(GED)), /^DMI 429/));
  const gap = clone(doc); gap.ranges[W.WT_PARAM].values[5] = null;
  const eg = W.wtEntry(gap, gedColl, spotOf(GED));
  add('B11 eine Stunde ohne Wasser bleibt eine Lücke (kein Füllen, kein Interpolieren)', eg.c[5] === null && W.wtModelAt(eg, eg.t0 + 5 * H) === null && W.wtModelPoints(eg).length === 120 && Math.abs(W.wtModelDryShare(eg) - 1 / 121) < 1e-9);
  add('B12 Wert zur Stunde: genau der Stundenwert in °C; vor dem Lauf und nach seinem Ende keiner', W.wtModelAt(e, e.t0 + 7 * H + 59 * 60_000) === e.c[7] / 10 && W.wtModelAt(e, e.t0 - 1) === null && W.wtModelAt(e, e.t0 + 121 * H) === null && W.wtModelEnd(e) === e.t0 + 120 * H);
  const far = { ...e, km: W.WT_MODEL_MAX_KM + 0.1 };
  add('B13 Gegenprobe: Gitterpunkt weiter als die Grenze, t0 neben der Stunde, fremdes Teilmodell fallen in der Werteprüfung auf', W.wtEntryProblems('x', far).length === 1 && W.wtEntryProblems('x', { ...e, t0: e.t0 + 1 }).length === 1 && W.wtEntryProblems('x', { ...e, coll: 'dkss_xx' }).length === 1 && W.wtEntryProblems('x', { ...e, c: e.c.map(() => null) }).length === 1);
}

// --- C  catalogue ----------------------------------------------------------------------------------------------------
{
  const built = buildWtCatalog(PROBE);
  add('C1 der Katalog ist genau das, was der Bauer aus der Messung von Schritt 0 macht (keine zweite Wahrheit)', JSON.stringify(built) === JSON.stringify(CAT) && W.wtCatalogProblems(CAT).length === 0 && W.wtCatalogOf(CAT) === CAT, W.wtCatalogProblems(CAT).slice(0, 2).join(' | '));
  const ids = Object.keys(CAT.spots);
  add('C2 jeder der 64 Spots steht im Katalog', ids.length === 64 && SPOTS.every((s) => CAT.spots[s.id]) && PROBE.rows.length === 64);
  const withModel = ids.filter((id) => CAT.spots[id].model), noModel = ids.filter((id) => !CAT.spots[id].model);
  add('C3 Modellpunkt: Teilmodell bekannt, Gitterpunkt höchstens 5 km vom Spot — so wie gemessen', withModel.length >= 60 && withModel.every((id) => { const m = CAT.spots[id].model, r = PROBE.rows.find((x) => x.id === id); return DMI_WL_COLLECTIONS.includes(m.coll) && m.km <= W.WT_MODEL_MAX_KM && r.pick.coll === m.coll && r.pick.asked.lat === m.lat && r.pick.asked.lon === m.lon; }), `${withModel.length} mit, ohne: ${noModel.join(', ') || '–'}`);
  add('C3b gewählt ist ein Punkt mit Wasser in jeder Stunde des Laufs, wo die Messung einen fand', withModel.every((id) => { const r = PROBE.rows.find((x) => x.id === id); return r.pick.values === r.pick.n || !(r.candidates ?? []).some((c) => c.values === c.n); }));
  const withSt = ids.filter((id) => CAT.spots[id].station), noSt = ids.filter((id) => !CAT.spots[id].station);
  add('C4 Station nur bis 20 km; ein Spot ohne Station hat keine (Ostsee: PEGELONLINE misst dort keine Wassertemperatur)', W.WT_STATION_MAX_KM === 20 && withSt.length >= 8 && withSt.every((id) => CAT.spots[id].station.km <= W.WT_STATION_MAX_KM && CAT.stations.some((s) => s.key === CAT.spots[id].station.key))
    && noSt.includes('binz') && noSt.includes('warnemuende') && noSt.length > withSt.length, `${withSt.length} mit, ${noSt.length} ohne`);
  const usable = wtUsableStations(PROBE);
  const wsvUsable = usable.filter((s) => s.net === 'wsv');
  add('C5 WSV-Stationen nur an Nordsee, Jade, Weser, Elbe und kein Siel (ein Nebenfluss hinter einem Sperrwerk ist ein anderes Wasser)', wsvUsable.length >= 8 && wsvUsable.every((s) => WT_WSV_WATERS.map((w) => w.charAt(0) + w.slice(1).toLowerCase()).includes(s.water) && !/siel/i.test(s.name))
    && PROBE.wsv.some((s) => /SIEL/.test(s.name)) && PROBE.wsv.some((s) => s.water === 'ESTE') && !usable.some((s) => /Este|Oste|Lühe|Pinnau/.test(s.water ?? '')));
  const elbe = PROBE.rows.find((x) => x.id === 'elbe-wittenbergen');
  add('C5b Gegenprobe am echten Fall: Wittenbergen läge ohne die Regel an einem Sperrwerk der Este, mit ihr an einer Station in der Elbe', /ESTE/.test(elbe.nearestAny.water) && /SPERRWERK/.test(elbe.nearestAny.name) && CAT.stations.find((s) => s.key === CAT.spots['elbe-wittenbergen'].station?.key)?.water === 'Elbe');
  add('C6 nur Stationen, die in der Messung geliefert haben (Gedser Havn I, Hvide Sande Indsejling: „Active“, ohne Wert ⇒ nicht im Katalog)', CAT.stations.every((s) => usable.some((u) => u.key === s.key)) && !CAT.stations.some((s) => s.key === 'dmi:31616' || s.key === 'dmi:9005203') && PROBE.dmi.find((s) => s.id === '31616')?.n3h === 0);
  add('C7 Stationen des Archivs: die nächste je Spot bis 40 km — mehr als die, auf die ein Spot zeigt', CAT.stations.length >= new Set(withSt.map((id) => CAT.spots[id].station.key)).size && WT_ARCHIVE_KM === 40);
  add('C8 Messort aus dem Namen: Hafen/Havn, Anleger, Leuchtturm, Sperrwerk, sonst Pegel', W.wtSiteOf('HELGOLAND BINNENHAFEN') === 'hafen' && W.wtSiteOf('Gedser Havn II') === 'hafen' && W.wtSiteOf('PELLWORM ANLEGER') === 'anleger' && W.wtSiteOf('LEUCHTTURM ALTE WESER') === 'leuchtturm' && W.wtSiteOf('EIDER-SPERRWERK AP') === 'sperrwerk' && W.wtSiteOf('HÖRNUM') === 'pegel'
    && CAT.stations.every((s) => s.site === W.wtSiteOf(s.name)));
  add('C9 Namen lesbar gesetzt: „LIST AUF SYLT“ → „List auf Sylt“, „WHV NEUER VORHAFEN“ → „Wilhelmshaven Neuer Vorhafen“', wsvDisplayName('LIST AUF SYLT') === 'List auf Sylt' && wsvDisplayName('WHV NEUER VORHAFEN') === 'Wilhelmshaven Neuer Vorhafen' && wsvDisplayName('EIDER-SPERRWERK AP') === 'Eider-Sperrwerk AP' && wsvDisplayName('HÖRNUM') === 'Hörnum');
  // negative controls on the rules
  const farSt = clone(CAT); farSt.spots[withSt[0]].station.km = W.WT_STATION_MAX_KM + 0.1;
  const ghost = clone(CAT); ghost.spots[withSt[0]].station.key = 'wsv:0000';
  const farModel = clone(CAT); farModel.spots[withModel[0]].model.km = W.WT_MODEL_MAX_KM + 0.1;
  const dup = clone(CAT); dup.stations.push(dup.stations[0]);
  const badNet = clone(CAT); badNet.stations[0].net = 'marnet';
  const bad = [farSt, ghost, farModel, dup, badNet].map((c) => W.wtCatalogProblems(c).length);
  add('C10 Gegenprobe: Station 20,1 km, unbekannte Station, Modellpunkt 5,1 km, doppelte Station, fremdes Netz', bad.every((n) => n > 0) && W.wtCatalogOf(farSt) === null && W.wtCatalogOf({}) === null && W.wtCatalogOf(null) === null, bad.join('/'));
}

// --- D  producer ------------------------------------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'sea-wt-'));
let DOC1 = null;
try {
  /** A store with both spot catalogues and the water temperature catalogue cut down to the recorded spots. */
  const mkStore = (name) => {
    const store = join(tmp, name);
    mkdirSync(join(store, 'static'), { recursive: true });
    cpSync(join(FIX, 'static', 'spots.json'), join(store, 'static', 'spots.json'));
    cpSync(join(FIX, 'dk', 'spots-dk.json'), join(store, 'static', 'spots-dk.json'));
    writeFileSync(join(store, W.SEA_WT_CATALOG_PATH), JSON.stringify({ ...CAT, spots: Object.fromEntries(PICK.map((id) => [id, CAT.spots[id]])) }));
    return store;
  };
  const colls = [...new Set(PICK.map((id) => CAT.spots[id].model.coll))].sort();
  const byUrl = new Map(Object.entries(MAN.files).filter(([n]) => /^(wt|instances)-/.test(n) && !n.startsWith('wt-land')).map(([n, m]) => [m.url, text(n)]));
  const posUrl = (id, inst = runOf(CAT.spots[id].model.coll).id) => { const m = CAT.spots[id].model; return W.dmiInstancePositionUrl(m.coll, inst, m.lat, m.lon, [W.WT_PARAM]); };
  /** DMI stand-in: the recorded answers by URL; `alter(url)` → `{ status, body }` to serve instead. */
  const standIn = (asked, alter = () => null) => async (url) => {
    asked.push(url);
    const f = alter(url);
    if (f) return { status: f.status, text: async () => f.body };
    return byUrl.has(url) ? { status: 200, text: async () => byUrl.get(url) } : { status: 404, text: async () => '{"status":404,"error":"Not Found"}' };
  };
  /** A later run of one sub-model, made from the recorded answers: the list gains a newer id, the answers move by 6 h. */
  const laterRun = (coll) => {
    const old = runOf(coll), t0 = old.t0 + 6 * H;
    const id = new Date(t0).toISOString().replace(/:/g, '').replace('.000Z', 'Z');
    const list = JSON.parse(byUrl.get(W.dmiInstancesUrl(coll)));
    list.instances.unshift({ ...list.instances[0], id });
    const shifted = (spotId) => { const d = JSON.parse(byUrl.get(posUrl(spotId))); d.domain.axes.t.values = d.domain.axes.t.values.map((s) => new Date(Date.parse(s) + 6 * H).toISOString()); return JSON.stringify(d); };
    return { id, t0, list: JSON.stringify(list), shifted };
  };
  const fast = { pauseMs: 0, backoffMs: () => 0, tries: 3, killed: false };
  const isInst = (u) => /\/instances$/.test(u), isPos = (u) => /\/position\?/.test(u);

  const store = mkStore('store');
  const asked = [];
  add('D0 der Producer liest den Katalog aus dem Speicher; ohne die Datei gibt es keinen', readWtCatalog(store)?.product === W.SEA_WT_CATALOG_PRODUCT && readWtCatalog(join(tmp, 'nirgends')) === null);
  const r1 = await buildWaterTemp({ storeDir: store, nowMs: NOW, fetchImpl: standIn(asked), ...fast });
  const st1 = readStatus(store);
  const doc1 = r1.built ? JSON.parse(readFileSync(join(store, r1.path), 'utf8')) : null;
  DOC1 = doc1;
  add('D1 erster Lauf: jeder Spot mit Modellpunkt hat einen Eintrag, nichts ausgefallen, Werteprüfung ohne Befund', r1.built && r1.spots === PICK.length && r1.failed.length === 0 && W.seaWtProblems(doc1).length === 0 && PICK.every((id) => doc1.spots[id]?.t0 === runOf(CAT.spots[id].model.coll).t0), JSON.stringify(r1).slice(0, 200));
  add('D2 Abrufe: je Teilmodell einmal die Liste der Läufe, je Spot genau eine Abfrage — an den Lauf gebunden', asked.filter(isInst).length === colls.length && asked.filter(isPos).length === PICK.length && asked.length === colls.length + PICK.length && PICK.every((id) => asked.filter((u) => u === posUrl(id)).length === 1), `${asked.length}`);
  add('D3 alle Abrufe auf opendataapi.dmi.dk/v1/forecastedr, keiner über /grib, keiner mit Schlüssel, keine ungebundene Punktabfrage', asked.every((u) => u.startsWith(`${DMI_HOST}/v1/forecastedr/collections/dkss_`) && !/grib|api-key/i.test(u)) && asked.filter(isPos).every((u) => /\/instances\/[0-9TZ-]+\/position\?/.test(u)));
  add('D4 Zeiger status.wtemp zeigt auf die Datei; Lizenz, Quelle, Einheit und die Läufe je Teilmodell stehen in der Datei', W.wtPointerOf(st1)?.path === r1.path && doc1.licence === 'CC BY 4.0' && doc1.credit === DMI_CREDIT && doc1.source.startsWith(DMI_HOST) && doc1.unit === '0.1 °C' && doc1.param === 'water-temperature' && doc1.stamp === W.seaWtStamp(NOW) && colls.every((c) => doc1.runs[c] === runOf(c).t0));
  const n0 = asked.length;
  const r2 = await buildWaterTemp({ storeDir: store, nowMs: NOW + 20 * 60_000, fetchImpl: standIn(asked), ...fast });
  add('D5 jünger als 60 min ⇒ kein Abruf, nichts geschrieben', !r2.built && asked.length === n0 && /weniger als 60 min/.test(r2.reason));
  const r3 = await buildWaterTemp({ storeDir: store, nowMs: NOW + 61 * 60_000, fetchImpl: standIn(asked), ...fast });
  const after3 = asked.slice(n0);
  add('D6 eine Stunde später, derselbe DKSS-Lauf: nur die Listen der Läufe werden gefragt, KEIN Spot ein zweites Mal', !r3.built && /kein neuer DKSS-Lauf/.test(r3.reason) && after3.length === colls.length && after3.every(isInst) && r3.asked === colls.length);
  add('D7 keine neue Datei, der Zeiger bleibt, nur „zuletzt nachgesehen“ rückt vor', readdirSync(join(store, W.SEA_WT_DIR)).length === 1 && W.wtPointerOf(readStatus(store)).stamp === doc1.stamp && Date.parse(W.wtPointerOf(readStatus(store)).checkedAt) === NOW + 61 * 60_000 && W.wtPointerOf(st1).checkedAt === doc1.builtAt);

  // a new run of ONE sub-model
  const wsColl = CAT.spots[PICK[0]].model.coll;
  const wsSpots = PICK.filter((id) => CAT.spots[id].model.coll === wsColl), others = PICK.filter((id) => CAT.spots[id].model.coll !== wsColl);
  const nr = laterRun(wsColl);
  const serveNew = (extra = () => null) => (u) => extra(u) ?? (u === W.dmiInstancesUrl(wsColl) ? { status: 200, body: nr.list } : wsSpots.map((id) => (u === posUrl(id, nr.id) ? { status: 200, body: nr.shifted(id) } : null)).find(Boolean) ?? null);
  const n1 = asked.length;
  const r4 = await buildWaterTemp({ storeDir: store, nowMs: NOW + 6 * H, fetchImpl: standIn(asked, serveNew()), ...fast });
  const doc4 = r4.built ? JSON.parse(readFileSync(join(store, r4.path), 'utf8')) : null;
  const after4 = asked.slice(n1);
  add(`D8 neuer Lauf nur von ${wsColl}: genau dessen Spots werden gefragt (am neuen Lauf), die der anderen Teilmodelle nicht`, r4.built && after4.filter(isPos).length === wsSpots.length && wsSpots.every((id) => after4.includes(posUrl(id, nr.id))) && !others.some((id) => after4.some((u) => u === posUrl(id))), `${after4.filter(isPos).length} Punktabfragen`);
  add('D9 neue Datei: die neuen Einträge beginnen am neuen Lauf, die übrigen sind dieselben; runs nennt den neuen Lauf', !!doc4 && wsSpots.every((id) => doc4.spots[id].t0 === nr.t0) && others.every((id) => JSON.stringify(doc4.spots[id]) === JSON.stringify(doc1.spots[id])) && doc4.runs[wsColl] === nr.t0 && doc4.failed.length === 0 && W.wtPointerOf(readStatus(store)).path === r4.path);
  const all = asked.filter(isPos);
  add('D10 über alle Durchgänge: keine Punktabfrage zweimal (einmal je Spot und DKSS-Lauf)', new Set(all).size === all.length, `${all.length} Abfragen`);

  // failure at one spot while a new run is there: tried three times, DMI's reason, the entry of the run before stays
  const store2 = mkStore('store2');
  const asked2 = [];
  await buildWaterTemp({ storeDir: store2, nowMs: NOW, fetchImpl: standIn(asked2), ...fast });
  const victim = wsSpots[0], rest = wsSpots.slice(1);
  const fail429 = (u) => (u === posUrl(victim, nr.id) ? { status: 429, body: body429 } : null);
  const m0 = asked2.length;
  const r5 = await buildWaterTemp({ storeDir: store2, nowMs: NOW + 6 * H, fetchImpl: standIn(asked2, serveNew(fail429)), ...fast });
  const doc5 = r5.built ? JSON.parse(readFileSync(join(store2, r5.path), 'utf8')) : null;
  add('D11 DMI-Ausfall an einem Spot: dreimal versucht, mit DMIs Grund in failed', !!doc5 && asked2.slice(m0).filter((u) => u === posUrl(victim, nr.id)).length === 3 && doc5.failed.length === 1 && doc5.failed[0].id === victim && /429 Too Many Requests: Server is busy/.test(doc5.failed[0].error), JSON.stringify(doc5?.failed));
  add('D12 der Spot behält den Eintrag des Laufs davor (mit dessen eigener Laufzeit), die anderen tragen den neuen Lauf', !!doc5 && doc5.spots[victim].t0 === runOf(wsColl).t0 && rest.every((id) => doc5.spots[id].t0 === nr.t0));
  // … and once that run is older than 24 h the entry is gone: "keine Daten", never an old curve as the forecast
  const lateNow = runOf(wsColl).t0 + W.SEA_WT_STALE_MS + H;
  const r6 = await buildWaterTemp({ storeDir: store2, nowMs: lateNow, fetchImpl: standIn(asked2, serveNew(fail429)), ...fast });
  const doc6 = r6.built ? JSON.parse(readFileSync(join(store2, r6.path), 'utf8')) : null;
  add('D13 ist der Lauf davor älter als 24 h und der Spot fällt weiter aus ⇒ kein Eintrag mehr (nie ein alter Lauf als Vorhersage)', !!doc6 && !doc6.spots[victim] && doc6.failed.some((f) => f.id === victim) && W.SEA_WT_STALE_MS === 24 * H, JSON.stringify(Object.keys(doc6?.spots ?? {})));

  // land, value lock, wrong run — each a named failure without an entry
  const spotsPos = SPOTS;
  const catSmall = readWtCatalog(store);
  const landBody = text(`wt-land-${MAN.land.id}.json`);
  const hotBody = (() => { const d = JSON.parse(byUrl.get(posUrl(GED))); d.ranges[W.WT_PARAM].values[10] = 99; return JSON.stringify(d); })();
  const oldRunBody = (() => { const d = JSON.parse(byUrl.get(posUrl(GED))); d.domain.axes.t.values = d.domain.axes.t.values.map((s) => new Date(Date.parse(s) - 6 * H).toISOString()); return JSON.stringify(d); })();
  const one = async (body) => (await collectWaterTemp({ cat: catSmall, spots: spotsPos, prev: null, nowMs: NOW, fetchImpl: standIn([], (u) => (u === posUrl(GED) ? { status: 200, body } : null)), ...fast })).doc;
  const dLand = await one(landBody), dHot = await one(hotBody), dOld = await one(oldRunBody);
  add('D14 Modellpunkt auf Land ⇒ failed „kein Wert am Modellpunkt“, kein Eintrag; die übrigen Spots stehen', !dLand.spots[GED] && dLand.failed.some((f) => f.id === GED && /kein Wert am Modellpunkt/.test(f.error)) && Object.keys(dLand.spots).length === PICK.length - 1);
  add('D15 Werteprüfung: eine Antwort mit 99 °C ⇒ failed mit dem Wert, kein Eintrag', !dHot.spots[GED] && dHot.failed.some((f) => f.id === GED && /99 °C außerhalb/.test(f.error)));
  add('D16 Antwort eines anderen Laufs ⇒ failed „gefragt war der Lauf“, kein Eintrag', !dOld.spots[GED] && dOld.failed.some((f) => f.id === GED && /gefragt war der Lauf/.test(f.error)));

  // DMI down: the pass gives up after WT_GIVE_UP requests without an answer; nothing written, store untouched
  let calls = 0, threw = '';
  const emptyStore = mkStore('store3');
  try { await buildWaterTemp({ storeDir: emptyStore, nowMs: NOW, fetchImpl: async () => { calls++; throw new Error('getaddrinfo ENOTFOUND'); }, ...fast }); } catch (e) { threw = e.message; }
  add(`D17 DMI ganz ausgefallen: nach ${WT_GIVE_UP} Abrufen ohne Antwort fragt der Durchgang nicht weiter; Schritt rot, nichts geschrieben`, calls === WT_GIVE_UP * 3 && /für keinen Spot eine Wassertemperatur/.test(threw) && /nicht erreichbar/.test(threw) && !existsSync(join(emptyStore, W.SEA_WT_DIR)) && !readStatus(emptyStore).wtemp, `${calls} Aufrufe · ${threw.slice(0, 90)}`);
  let threw2 = '';
  try { await buildWaterTemp({ storeDir: store, nowMs: NOW + 9 * H, fetchImpl: async () => ({ status: 503, text: async () => 'busy' }), ...fast }); } catch (e) { threw2 = e.message; }
  const doc7 = JSON.parse(readFileSync(join(store, W.wtPointerOf(readStatus(store)).path), 'utf8'));
  add('D18 DMI antwortet nur 503, der Speicher hat noch frische Einträge ⇒ sie bleiben (mit ihrem Lauf), failed nennt jeden Spot; nichts Älteres wird erfunden', threw2 === '' && PICK.every((id) => doc7.spots[id] && doc7.failed.some((f) => f.id === id)) && wsSpots.every((id) => doc7.spots[id].t0 === nr.t0), threw2);
  const k0 = asked.length, sBefore = JSON.stringify(readStatus(store).wtemp), fBefore = readdirSync(join(store, W.SEA_WT_DIR)).join();
  const rk = await buildWaterTemp({ storeDir: store, nowMs: NOW + 12 * H, fetchImpl: standIn(asked), ...fast, killed: true });
  add('D19 Kill-Schalter: kein Abruf, nichts geschrieben', !rk.built && asked.length === k0 && JSON.stringify(readStatus(store).wtemp) === sBefore && readdirSync(join(store, W.SEA_WT_DIR)).join() === fBefore);
  const noCat = mkStore('store4'); rmSync(join(noCat, W.SEA_WT_CATALOG_PATH));
  const askedN = [];
  const rn = await buildWaterTemp({ storeDir: noCat, nowMs: NOW, fetchImpl: standIn(askedN), ...fast });
  add('D20 ohne die Katalogdatei fragt der Producer das DMI nicht (Rückfall der Phase)', !rn.built && askedN.length === 0 && /kein Katalog der Wassertemperatur/.test(rn.reason));
  for (const s of ['202611190400', '202611190500', '202611190600', '202611190700']) writeFileSync(join(store, W.SEA_WT_DIR, `${s}.json`), '{}');
  const removed = pruneWaterTemp(store);
  add('D21 Aufbewahrung: die drei neuesten Dateien bleiben', readdirSync(join(store, W.SEA_WT_DIR)).length === W.SEA_WT_KEPT && !removed.includes('202611190700.json') && removed.length >= 2);
  add('D22 die Datei der dänischen Spots (Phase DK) bleibt unberührt: eigener Ordner, eigener Zeiger', W.SEA_WT_DIR === 'wtemp' && !existsSync(join(store, 'dmi')) && readStatus(store).dmi === undefined);

  // --- F (loaders) need the store's files --------------------------------------------------------------------------
  const realFetch = globalThis.fetch;
  try {
    const ptr = { stamp: doc1.stamp, path: W.seaWtPath(doc1.stamp), builtAt: doc1.builtAt, checkedAt: doc1.builtAt };
    globalThis.fetch = async (url) => (String(url).endsWith(ptr.path) ? new Response(JSON.stringify(doc1), { status: 200 }) : new Response('nf', { status: 404 }));
    const ok = await loadWaterTemp(ptr);
    const none = await loadWaterTemp(null);
    globalThis.fetch = async () => new Response('nf', { status: 404 });
    const gone = await loadWaterTemp(ptr);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...doc1, product: 'etwas-anderes' }), { status: 200 });
    const wrong = await loadWaterTemp(ptr);
    add('F1 loadWaterTemp: Datei da ⇒ ok; kein Zeiger oder 404 ⇒ „keine Datei“; fremde Form ⇒ „nicht lesbar“ — nie ein Dokument daneben', ok.state === 'ok' && !!ok.doc?.spots[GED] && none.state === 'none' && none.doc === null && none.why === V.WT_WHY.noFile && gone.doc === null && gone.state === 'none' && wrong.doc === null && wrong.state === 'error' && wrong.why === V.WT_WHY.unreadable);
    globalThis.fetch = async (url) => (String(url).endsWith(W.SEA_WT_CATALOG_PATH) ? new Response(JSON.stringify({ product: 'x' }), { status: 200 }) : new Response('nf', { status: 404 }));
    const badCat = await loadWtCatalog();
    globalThis.fetch = async () => new Response('nf', { status: 404 });
    const noCatalog = await loadWtCatalog();
    globalThis.fetch = async (url) => (String(url).endsWith(W.SEA_WT_CATALOG_PATH) ? new Response(text('watertemp.json'), { status: 200 }) : new Response('nf', { status: 404 }));
    const goodCat = await loadWtCatalog();
    add('F2 loadWtCatalog: fremde Form oder 404 ⇒ null (die Seite zeigt dann keine Wassertemperatur); die echte Datei ⇒ der Katalog', badCat === null && noCatalog === null && goodCat?.stations.length === CAT.stations.length);
  } finally { globalThis.fetch = realFetch; }
} finally { rmSync(tmp, { recursive: true, force: true }); }

// --- E  measurements ---------------------------------------------------------------------------------------------------
const obsNow = MAN.obsNowMs;
const fileOf = (re) => Object.keys(MAN.files).find((n) => re.test(n));
const WSV5 = fileOf(/^obs-wsv-\d+\.json$/), DMI5 = fileOf(/^obs-dmi-\d+\.json$/), WSV1 = fileOf(/-pt6h\.json$/), STALE = fileOf(/-stale\.json$/), EMPTY = fileOf(/-empty\.json$/);
const wsvKey = `wsv:${/obs-wsv-(\d+)/.exec(WSV5)[1]}`, dmiKey = `dmi:${/obs-dmi-(\d+)/.exec(DMI5)[1]}`;
const wsvSt = CAT.stations.find((s) => s.key === wsvKey), dmiSt = CAT.stations.find((s) => s.key === dmiKey);
{
  const raw = J(WSV5);
  const s = W.wsvObsOf(raw);
  add('E1 PEGELONLINE: die echte Reihe ⇒ aufsteigende Punkte in °C, Wert für Wert, nichts verworfen', !!s && s.dropped === 0 && s.points.length === raw.length && s.points.every((p, i) => p.t === Date.parse(raw[i].timestamp) && p.c === raw[i].value && (i === 0 || p.t > s.points[i - 1].t)), `${s?.points.length} Werte`);
  add('E2 die Adresse ist die der Seite: Station, Reihe WT, die letzten 5 Tage', MAN.files[WSV5].url === W.wtObsUrl(wsvSt, obsNow) && MAN.files[WSV5].url === `${W.WSV_HOST}/webservices/rest-api/v2/stations/${wsvSt.id}/WT/measurements.json?start=P5D` && W.WT_PAST_DAYS === 5);
  const latest = W.wtLatest(s.points, obsNow);
  add('E3 aktueller Wert = der neueste der Antwort; zwei Stunden später gilt er nicht mehr als aktuell', latest?.t === Date.parse(raw.at(-1).timestamp) && latest.c === raw.at(-1).value && W.wtLatest(s.points, latest.t + W.WT_OBS_MAX_AGE_MS) !== null && W.wtLatest(s.points, latest.t + W.WT_OBS_MAX_AGE_MS + 1) === null && W.wtLatest([], obsNow) === null);
  const one = W.wsvObsOf(J(WSV1));
  const hourly = W.wtHourly(one.points);
  const exact = hourly.every((p) => { const near = one.points.reduce((b, q) => (Math.abs(q.t - p.t) < Math.abs(b.t - p.t) ? q : b)); return near.c === p.c && Math.abs(near.t - p.t) <= W.WT_HOUR_SNAP_MS && p.t % H === 0; });
  add('E4 Ausdünnen auf volle Stunden an echten 1-min-Werten: je Stunde der Wert, der ihr am nächsten liegt, sonst nichts', one.points.length > 300 && hourly.length >= 5 && hourly.length <= 7 && exact, `${one.points.length} → ${hourly.length}`);
  add('E5 eine Stunde ohne Wert in ihrer Nähe bleibt leer (kein Wert von nebenan)', W.wtHourly([{ t: 20 * 60_000, c: 7 }, { t: H + 11 * 60_000, c: 8 }, { t: 2 * H - 60_000, c: 9 }]).map((p) => `${p.t / H}:${p.c}`).join() === '2:9');
  const stale = W.wsvObsOf(J(STALE));
  const lastStale = stale.points.at(-1) ?? null;
  add('E6 Station mit tagealtem letztem Wert (echte Antwort) ⇒ kein aktueller Wert', !!stale && W.wtLatest(stale.points, obsNow) === null && (lastStale === null || obsNow - lastStale.t > W.WT_OBS_MAX_AGE_MS), lastStale ? new Date(lastStale.t).toISOString() : 'leer');
  const d = W.dmiTwObsOf(J(DMI5));
  const feats = J(DMI5).features;
  add('E7 DMI oceanObs: die echte Antwort ⇒ dieselben Werte, aufsteigend (die Antwort kommt neueste zuerst)', !!d && d.dropped === 0 && d.points.length === feats.length && d.points.at(-1).t === Math.max(...feats.map((f) => Date.parse(f.properties.observed))) && d.points.every((p, i) => i === 0 || p.t > d.points[i - 1].t) && feats.every((f) => d.points.some((p) => p.t === Date.parse(f.properties.observed) && p.c === f.properties.value)), `${d?.points.length} Werte`);
  add('E8 die Adresse ist die der Seite: oceanObs, tw, ab einer vollen Stunde vor 5 Tagen, ohne Schlüssel', MAN.files[DMI5].url === W.wtObsUrl(dmiSt, obsNow) && new RegExp(`^${DMI_HOST}/v2/oceanObs/collections/observation/items\\?stationId=${dmiSt.id}&parameterId=tw&datetime=\\d{4}-\\d\\d-\\d\\dT\\d\\d:00:00Z/\\.\\.&limit=1000$`).test(MAN.files[DMI5].url));
  const empty = W.dmiTwObsOf(J(EMPTY));
  add('E9 DMI-Station „Active“ ohne tw (echte Antwort) ⇒ keine Punkte, kein aktueller Wert', !!empty && empty.points.length === 0 && W.wtLatest(empty.points, obsNow) === null);
  add('E10 keine Reihe: HTML, Fehlerkörper, fremde Form ⇒ null — nicht „keine Werte“', W.wsvObsOf('<html>') === null && W.wsvObsOf({ message: 'x' }) === null && W.dmiTwObsOf([]) === null && W.dmiTwObsOf(JSON.parse(body429)) === null && W.wtObsOf('wsv', raw).points.length === raw.length && W.wtObsOf('dmi', J(DMI5)).points.length === feats.length);
  const bad = clone(raw); bad[5].value = 45.2; bad[6].value = -9; bad[7].value = null; bad[8].timestamp = 'gestern';
  const sb = W.wsvObsOf(bad);
  add('E11 Werteprüfung der Messung: 45,2 °C, −9 °C, null und eine unlesbare Zeit werden verworfen und gezählt', sb.dropped === 4 && sb.points.length === raw.length - 4 && sb.points.every((p) => p.c >= W.WT_RANGE_C[0] && p.c <= W.WT_RANGE_C[1]));
  const other = clone(J(DMI5)); other.features[0].properties.parameterId = 'sealev_dvr';
  add('E12 nur tw zählt: ein Wasserstand in derselben Antwort wird nie als Temperatur gelesen', W.dmiTwObsOf(other).points.length === feats.length - 1);
}

// --- F  page logic ---------------------------------------------------------------------------------------------------
{
  const e = DOC1.spots[GED];
  const load = { doc: DOC1, state: 'ok', why: null };
  const at = e.t0 + 30 * H;
  const v = V.wtModelViewOf({ load, catalog: CAT, spotId: GED, tMs: at + 17 * 60_000, nowMs: NOW });
  add('F3 Modell zur gewählten Stunde: genau der Stundenwert, Laufbeginn, Ende, Punkt des Katalogs', v.state === 'ok' && v.c === e.c[30] / 10 && v.gap === null && v.runMs === e.t0 && v.until === e.t0 + 120 * H && v.point === CAT.spots[GED].model);
  const before = V.wtModelViewOf({ load, catalog: CAT, spotId: GED, tMs: e.t0 - H, nowMs: NOW }), beyond = V.wtModelViewOf({ load, catalog: CAT, spotId: GED, tMs: e.t0 + 121 * H, nowMs: NOW });
  const dryDoc = { ...DOC1, spots: { ...DOC1.spots, [GED]: { ...e, c: e.c.map((x, i) => (i === 30 ? null : x)) } } };
  const dry = V.wtModelViewOf({ load: { ...load, doc: dryDoc }, catalog: CAT, spotId: GED, tMs: at, nowMs: NOW });
  add('F4 Stunde vor dem Lauf, nach seinem Ende, in einer trockenen Stunde ⇒ kein Wert, mit benanntem Grund', before.c === null && before.gap === 'before' && beyond.c === null && beyond.gap === 'beyond' && dry.c === null && dry.gap === 'dry' && dry.state === 'ok');
  const noFile = V.wtModelViewOf({ load: { doc: null, state: 'none', why: V.WT_WHY.noFile }, catalog: CAT, spotId: GED, tMs: at, nowMs: NOW });
  const failedDoc = { ...DOC1, spots: Object.fromEntries(Object.entries(DOC1.spots).filter(([id]) => id !== GED)), failed: [{ id: GED, error: 'DMI 429 Too Many Requests: Server is busy. Please try again later.' }] };
  const failed = V.wtModelViewOf({ load: { ...load, doc: failedDoc }, catalog: CAT, spotId: GED, tMs: at, nowMs: NOW });
  const stale = V.wtModelViewOf({ load, catalog: CAT, spotId: GED, tMs: at, nowMs: e.t0 + W.SEA_WT_STALE_MS + 1 });
  const fresh = V.wtModelViewOf({ load, catalog: CAT, spotId: GED, tMs: at, nowMs: e.t0 + W.SEA_WT_STALE_MS });
  const locked = V.wtModelViewOf({ load: { ...load, doc: { ...DOC1, spots: { ...DOC1.spots, [GED]: { ...e, c: e.c.map(() => 999) } } } }, catalog: CAT, spotId: GED, tMs: at, nowMs: NOW });
  add('F5 „keine Daten“ mit Grund: keine Datei, vom DMI nicht geliefert (DMIs Worte), Lauf älter als 24 h, Eintrag außerhalb der Werteprüfung — nie ein Wert', [noFile, failed, stale, locked].every((x) => x.state === 'none' && x.c === null && x.entry === null && !!x.why) && /Server is busy/.test(failed.why) && stale.why === V.WT_WHY.stale && fresh.state === 'ok' && noFile.why === V.WT_WHY.noFile);
  const noPointCat = { ...CAT, spots: { ...CAT.spots, [GED]: { ...CAT.spots[GED], model: null } } };
  const noPoint = V.wtModelViewOf({ load, catalog: noPointCat, spotId: GED, tMs: at, nowMs: NOW });
  add('F6 Spot ohne Modellpunkt im Katalog ⇒ „keine Daten“, auch wenn die Datei einen Eintrag trüge', noPoint.state === 'none' && noPoint.why === V.WT_WHY.noPoint && V.wtModelViewOf({ load: 'loading', catalog: CAT, spotId: GED, tMs: at, nowMs: NOW }).state === 'loading');

  // measurement view
  const withSt = Object.keys(CAT.spots).find((id) => CAT.spots[id].station?.key === dmiKey) ?? Object.keys(CAT.spots).find((id) => CAT.spots[id].station);
  const stKey = CAT.spots[withSt].station.key;
  const pts = (stKey === dmiKey ? W.dmiTwObsOf(J(DMI5)) : W.wsvObsOf(J(WSV5))).points;
  const o = V.wtObsViewOf({ load: { points: pts, state: 'ok' }, catalog: CAT, spotId: withSt, nowMs: obsNow });
  add('F7 Messung am Spot: Station des Katalogs mit Name, Messort und Entfernung, neuester Wert mit seiner Zeit', o.state === 'ok' && o.station.key === stKey && o.km === CAT.spots[withSt].station.km && o.latest.t === pts.at(-1).t && o.latest.c === pts.at(-1).c && !!o.station.name && o.station.site in W.WT_SITE_LABEL);
  const late = V.wtObsViewOf({ load: { points: pts, state: 'ok' }, catalog: CAT, spotId: withSt, nowMs: pts.at(-1).t + 3 * H });
  add('F8 letzter Wert älter als zwei Stunden ⇒ „keine Messung“, der alte Wert wird nur mit seiner Zeit genannt, nie als aktueller gezeigt', late.state === 'none' && late.latest === null && late.last.t === pts.at(-1).t && /älter als zwei Stunden/.test(late.why));
  const err = V.wtObsViewOf({ load: { points: null, state: 'error' }, catalog: CAT, spotId: withSt, nowMs: obsNow });
  const silent = V.wtObsViewOf({ load: { points: [], state: 'ok' }, catalog: CAT, spotId: withSt, nowMs: obsNow });
  add('F9 Station nicht lesbar oder ohne Werte ⇒ „keine Messung“ mit Grund', err.state === 'none' && err.latest === null && /nicht lesbar/.test(err.why) && silent.state === 'none' && /keinen Wert geliefert/.test(silent.why) && V.wtObsViewOf({ load: 'loading', catalog: CAT, spotId: withSt, nowMs: obsNow }).state === 'loading');
  // no station near: no measurement — and the model is never put in its place
  const lonely = 'binz';
  const on = V.wtObsViewOf({ load: { points: pts, state: 'ok' }, catalog: CAT, spotId: lonely, nowMs: obsNow });
  const lonelyModel = { ...DOC1, spots: { ...DOC1.spots, [lonely]: { ...e } } };
  const mv = V.wtModelViewOf({ load: { ...load, doc: lonelyModel }, catalog: CAT, spotId: lonely, tMs: at, nowMs: NOW });
  add('F10 Spot ohne Station (Binz): keine Messung — auch wenn eine Reihe übergeben wird und das Modell einen Wert trägt', CAT.spots[lonely].station === null && on.state === 'nostation' && on.latest === null && on.last === null && on.station === null && on.why === V.WT_NO_STATION && mv.state === 'ok' && mv.c != null && /Das Modell steht nicht an ihrer Stelle/.test(V.WT_NO_STATION));
  const farCat = clone(CAT); farCat.spots[withSt].station.km = W.WT_STATION_MAX_KM + 5;
  add('F11 Gegenprobe: eine Station weiter als die Grenze gilt auch dann nicht als Messung des Spots, wenn ein Katalog sie nennt', V.wtObsViewOf({ load: { points: pts, state: 'ok' }, catalog: farCat, spotId: withSt, nowMs: obsNow }).state === 'nostation');
  add('F12 die beiden Sichten teilen keinen Wert: die Messsicht kennt kein Modell, die Modellsicht keine Station', !('c' in o) && !('station' in v) && !/wtModel|SeaWtDoc/.test(String(V.wtObsViewOf)) && !/wtLatest|station/.test(String(V.wtModelViewOf)));
}
{
  // loaders of the measurement and the record
  const realFetch = globalThis.fetch;
  try {
    const seen = [];
    globalThis.fetch = async (url) => { seen.push(String(url)); return new Response(bytes(WSV5), { status: 200 }); };
    const a = await loadWtObs(wsvSt, obsNow);
    const b = await loadWtObs(wsvSt, obsNow + 5 * 60_000);
    add('F13 loadWtObs: ein Abruf direkt bei PEGELONLINE mit der Adresse der Seite; innerhalb von 10 min kein zweiter', a.state === 'ok' && a.points.length === J(WSV5).length && seen.length === 1 && seen[0] === W.wtObsUrl(wsvSt, obsNow) && b === a);
    globalThis.fetch = async (url) => { seen.push(String(url)); return new Response(bytes(DMI5), { status: 200 }); };
    const d = await loadWtObs(dmiSt, obsNow);
    add('F14 loadWtObs an einer DMI-Station: direkt bei opendataapi.dmi.dk, nie über PEGELONLINE', d.state === 'ok' && d.points.length === J(DMI5).features.length && seen.at(-1).startsWith(`${DMI_HOST}/v2/oceanObs/`));
    const fake = { ...wsvSt, key: 'wsv:test1', id: 'test1' };
    globalThis.fetch = async () => new Response('busy', { status: 429 });
    const e1 = await loadWtObs(fake, obsNow);
    globalThis.fetch = async () => new Response('<html>Wartung</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const e2 = await loadWtObs({ ...fake, key: 'wsv:test2' }, obsNow);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const e3 = await loadWtObs({ ...fake, key: 'wsv:test3' }, obsNow);
    add('F15 429, eine HTML-Seite, Netzfehler ⇒ „nicht lesbar“ (points null), kein Wurf, kein alter Wert', [e1, e2, e3].every((x) => x.state === 'error' && x.points === null));
    globalThis.fetch = async () => new Response('nf', { status: 404 });
    add('F16 das eigene Tagesarchiv nicht lesbar ⇒ null (kein Verlauf wird behauptet)', (await loadWtDaily(obsNow)) === null && W.SEA_WT_DAILY_URL === 'https://raw.githubusercontent.com/jppetry/buscosun-archiv/main/sea/v1/wtemp-daily.json');
  } finally { globalThis.fetch = realFetch; }
}

// --- G  threshold -----------------------------------------------------------------------------------------------------
{
  const th = { side: 'over', c: 18 }, th2 = { side: 'under', c: 12.5 };
  add('G1 Link: wt=over.18 / wt=under.12.5 — kodiert und gelesen; Unsinn wird verworfen', V.encodeWtParam(th) === 'over.18' && V.encodeWtParam(th2) === 'under.12.5' && JSON.stringify(V.parseWtParam('over.18')) === JSON.stringify(th) && JSON.stringify(V.parseWtParam('under.12.5')) === JSON.stringify(th2) && JSON.stringify(V.parseWtParam('under.-1')) === JSON.stringify({ side: 'under', c: -1 })
    && [null, '', 'over', 'over.', 'über.18', 'over.18.55', 'over.99', 'under.-9', 'over.1e1', 'min.18'].every((x) => V.parseWtParam(x) === null) && SEA_WT_RE.test('over.18') && !SEA_WT_RE.test('over.18.55'));
  const st = parseSeaUrl('gedser', '?p=jolle&wt=over.18');
  const url = buildSeaUrl({ ...st.state, t: 3 });
  add('G2 Adresse der Seite: wt steht hinter pl, bleibt beim Schreiben erhalten, ein kaputter Wert fällt heraus; ohne Schwelle keine Spur', st.invalid.length === 0 && st.state.wt === 'over.18' && url === '/seewetter/gedser?p=jolle&t=3&wt=over.18' && parseSeaUrl('gedser', '?wt=warm').invalid.includes('wt') && parseSeaUrl('gedser', '?wt=warm').state.wt === null && SEA_DEFAULT_STATE.wt === null && buildSeaUrl({ ...SEA_DEFAULT_STATE, spot: 'gedser' }) === '/seewetter/gedser', url);
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); } };
  V.saveWtThreshold(th2, storage);
  const back = V.loadWtThreshold(storage);
  V.saveWtThreshold(null, storage);
  mem.set('x', '1');
  add('G3 Speicher: EINE Schwelle (sea.wtemp.v1), gelesen wie geschrieben, löschbar; kaputter Inhalt oder gesperrter Speicher ⇒ keine', JSON.stringify(back) === JSON.stringify(th2) && V.loadWtThreshold(storage) === null && V.WT_STORAGE_KEY === 'sea.wtemp.v1'
    && V.loadWtThreshold({ getItem: () => '{kaputt' }) === null && V.loadWtThreshold({ getItem: () => { throw new Error('gesperrt'); } }) === null && V.loadWtThreshold({ getItem: () => JSON.stringify({ side: 'over', c: 99 }) }) === null && V.loadWtThreshold(null) === null);
  add('G4 Eingabe: „18“, „12,5“, „−1“ gelten; „warm“, „18,55“, „99“, „“ nicht', V.parseWtInput('18') === 18 && V.parseWtInput(' 12,5 ') === 12.5 && V.parseWtInput('−1') === -1 && V.parseWtInput('12.5') === 12.5 && [' ', 'warm', '18,55', '99', '-3', '1e1'].every((x) => V.parseWtInput(x) === null));
  add('G5 „über“ und „unter“ sind streng: ein Wert genau auf der Schwelle liegt auf keiner Seite', V.wtOnSide(18.1, th) && !V.wtOnSide(18, th) && !V.wtOnSide(17.9, th) && V.wtOnSide(12.4, th2) && !V.wtOnSide(12.5, th2) && V.wtThresholdText(th) === 'über 18 °C' && V.wtThresholdText(th2) === 'unter 12,5 °C');
  // windows on the real entry: recomputed here hour by hour
  const e = DOC1.spots[GED];
  const vals = e.c.filter((x) => x != null).map((x) => x / 10).sort((a, b) => a - b);
  const mid = { side: 'over', c: Math.round(vals[Math.floor(vals.length / 2)] * 10) / 10 };
  const from = e.t0 + 3 * H + 5 * 60_000;
  const ws = V.wtWindows(e, mid, from);
  const inWin = (t) => ws.some((w) => t >= w.from && t < w.to);
  const hours = e.c.map((x, i) => ({ t: e.t0 + i * H, on: x != null && x / 10 > mid.c })).filter((h) => h.t >= e.t0 + 3 * H);
  add('G6 Zeiträume am echten Lauf: jede Stunde ab jetzt liegt genau dann in einem Zeitraum, wenn ihr Wert streng über der Schwelle liegt', ws.length >= 1 && hours.every((h) => inWin(h.t) === h.on) && ws.every((w) => w.from % H === 0 && w.to > w.from) && !inWin(e.t0), `${ws.length} Zeiträume bei ${mid.c} °C`);
  const gap = { ...e, c: e.c.map((x, i) => (i === 40 ? null : 200)) };
  const wg = V.wtWindows(gap, th, e.t0);
  add('G7 eine Stunde ohne Wert beendet den Zeitraum (keine Brücke über eine Lücke)', wg.length === 2 && wg[0].to === e.t0 + 40 * H && wg[1].from === e.t0 + 41 * H && wg[1].to === e.t0 + 121 * H);
  const sNone = V.wtModelSentence(e, { side: 'over', c: 30 }, from), sAll = V.wtModelSentence(e, { side: 'under', c: 30 }, from), sSome = V.wtModelSentence(e, mid, from);
  add('G8 Satz zum Modell: nie, in jeder Stunde, oder die Zeiträume — mit dem Ende des Laufs', /^Bis (Mo|Di|Mi|Do|Fr|Sa|So) \d\d Uhr liegt das Modell zu keiner Stunde über 30 °C\.$/.test(sNone) && /^Bis (Mo|Di|Mi|Do|Fr|Sa|So) \d\d Uhr liegt das Modell in jeder Stunde unter 30 °C\.$/.test(sAll) && /^Das Modell liegt über [\d,]+ °C: (Mo|Di|Mi|Do|Fr|Sa|So) \d\d Uhr bis /.test(sSome), `${sNone} | ${sAll} | ${sSome.slice(0, 80)}`);
  add('G8b mit einer Lücke im Lauf heißt es nicht „in jeder Stunde“', !/in jeder Stunde/.test(V.wtModelSentence(gap, th, e.t0)) && /Das Modell liegt über 18 °C: /.test(V.wtModelSentence(gap, th, e.t0)));
  const p = { t: obsNow, c: 7.2 };
  const sObs = [V.wtObsSentence(p, th), V.wtObsSentence({ ...p, c: 19.4 }, th), V.wtObsSentence({ ...p, c: 18 }, th)];
  add('G9 Satz zur Messung: unter, über, genau auf — die Zahl, ihre Zeit, die Schwelle', /^Die letzte Messung \(7,2 °C, (Mo|Di|Mi|Do|Fr|Sa|So) \d\d:\d\d Uhr\) liegt unter deiner Schwelle von 18 °C\.$/.test(sObs[0]) && / liegt über deiner Schwelle/.test(sObs[1]) && / liegt genau auf deiner Schwelle/.test(sObs[2]), sObs[0]);
  const advice = /\bsicher(e|er|es|en)?\b|ungefährlich|gefahrlos|Neopren|baden|Badewetter|schwimm|angenehm|zu kalt|zu warm|empfehl|Fisch|Dorsch|Hering|beiß|angel|solltest|lieber/i;
  const said = [sNone, sAll, sSome, ...sObs, V.WT_NO_STATION, W.WT_MODEL_NOTE, ...Object.values(V.WT_WHY), V.wtModelSentence({ ...e, c: e.c.slice(0, 2) }, th, e.t0 + 50 * H)].join(' ');
  add('G10 kein Rat in den Sätzen: weder „sicher“ noch Neopren, Baden, Fisch (mit Gegenprobe)', !advice.test(said) && advice.test('Zum Baden zu kalt, lieber mit Neopren.') && advice.test('Der Dorsch beißt ab 8 °C.') && advice.test('Das Wasser ist sicher.'));
}

// --- H  archive --------------------------------------------------------------------------------------------------------
{
  const tmpA = mkdtempSync(join(tmpdir(), 'sea-wt-arch-'));
  try {
    const store = join(tmpA, 'store'), arch = join(tmpA, 'archiv');
    mkdirSync(join(store, 'static'), { recursive: true });
    const two = { ...CAT, stations: [wsvSt, dmiSt], spots: {} };
    writeFileSync(join(store, W.SEA_WT_CATALOG_PATH), JSON.stringify(two));
    const seen = [];
    const fetchImpl = async (url) => { seen.push(String(url)); return String(url).includes('pegelonline') ? new Response(bytes(WSV5), { status: 200 }) : new Response(bytes(DMI5), { status: 200 }); };
    const index = { schema: 1, product: 'sea-archive', days: {} };
    const r = await archiveWaterTemp({ storeDir: store, archiveDir: arch, index, nowMs: obsNow, fetchImpl, pauseMs: 0 });
    const days = readdirSync(arch).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort();
    const dayDoc = (d) => JSON.parse(gunzipSync(readFileSync(join(arch, d, 'wtemp.json.gz'))).toString('utf8'));
    const wsvHourly = W.wtHourly(W.wsvObsOf(J(WSV5)).points).filter((p) => p.t <= obsNow), dmiHourly = W.wtHourly(W.dmiTwObsOf(J(DMI5)).points).filter((p) => p.t <= obsNow);
    const stored = (key) => days.flatMap((d) => (dayDoc(d).stations[key] ?? []).map((x) => ({ t: Date.parse(x.t), c: x.c, d })));
    add('H1 Archiv, erster Lauf: zwei Abrufe (die Stationen des Katalogs), je die 31 Tage, die PEGELONLINE hält; Tagesdateien je UTC-Tag', seen.length === 2 && seen.includes(W.wtObsUrl(wsvSt, obsNow, WT_ARCHIVE_MAX_DAYS)) && seen.includes(W.wtObsUrl(dmiSt, obsNow, WT_ARCHIVE_MAX_DAYS)) && r.wtAsked === 31 && r.wtStations === 2 && days.length >= 5 && r.wtDays === days.length, `${days.join(' ')}`);
    const dl = (day) => ({ stations: { a: { days: { '2026-10-01': [1, 2, 3, 24], [day]: [1, 2, 3, 24] } }, b: { days: {} } } });
    const t0 = Date.UTC(2026, 10, 18, 19);
    add('H1b danach fragt ein Lauf, was die Lücke seit dem letzten abgelegten Tag schließt: mindestens 2 Tage, nach einer Woche Stillstand 9, nie mehr als 31', wtArchiveDays(dl('2026-11-18'), t0) === 2 && wtArchiveDays(dl('2026-11-17'), t0) === 3 && wtArchiveDays(dl('2026-11-11'), t0) === 9 && wtArchiveDays(dl('2026-09-01'), t0) === 31 && wtArchiveDays(null, t0) === 31 && wtArchiveDays({ stations: {} }, t0) === 31 && WT_ARCHIVE_DAYS === 2);
    add('H2 abgelegt ist genau die Reihe auf vollen Stunden, Wert für Wert, je Station unter ihrem Schlüssel und im richtigen Tag', [[wsvKey, wsvHourly], [dmiKey, dmiHourly]].every(([k, hh]) => { const s = stored(k); return s.length === hh.length && hh.every((p) => s.some((x) => x.t === p.t && x.c === p.c && x.d === new Date(p.t).toISOString().slice(0, 10))); }) && r.wtRows === wsvHourly.length + dmiHourly.length, `${r.wtRows} Werte`);
    const d0 = dayDoc(days[1]);
    add('H3 Tagesdatei nennt Produkt, Einheit und beide Quellen mit Lizenz', d0.product === W.SEA_WT_ARCHIVE_PRODUCT && d0.unit === '°C' && d0.sources.wsv === 'WSV PEGELONLINE, DL-DE Zero 2.0' && d0.sources.dmi === 'DMI, CC BY 4.0' && index.days[days[1]].wtempStations === 2);
    const daily = JSON.parse(readFileSync(join(arch, W.SEA_WT_DAILY_FILE), 'utf8'));
    const own = (key, d) => { const v = stored(key).filter((x) => x.d === d).map((x) => x.c); const r1 = (x) => Math.round(x * 10) / 10; return [r1(Math.min(...v)), r1(v.reduce((a, b) => a + b, 0) / v.length), r1(Math.max(...v)), v.length]; };
    add('H4 Tagesreihe: je Station und Tag [Minimum, Mittel, Maximum, Stunden] — hier unabhängig nachgerechnet', daily.product === W.SEA_WT_DAILY_PRODUCT && daily.minHours === W.WT_DAY_MIN_HOURS && [wsvKey, dmiKey].every((k) => days.every((d) => !stored(k).some((x) => x.d === d) || JSON.stringify(daily.stations[k].days[d]) === JSON.stringify(own(k, d)))) && daily.stations[wsvKey].name === wsvSt.name && daily.stations[dmiKey].net === 'dmi');
    const before = readFileSync(join(arch, days[1], 'wtemp.json.gz'));
    const r2 = await archiveWaterTemp({ storeDir: store, archiveDir: arch, index, nowMs: obsNow + 60_000, fetchImpl, pauseMs: 0 });
    add('H5 zweiter Durchgang mit denselben Antworten: fragt nur noch 2 Tage, nichts Neues, keine Datei angefasst (nur anhängen)', r2.wtAsked === WT_ARCHIVE_DAYS && r2.wtRows === 0 && r2.wtDays === 0 && before.equals(readFileSync(join(arch, days[1], 'wtemp.json.gz'))));
    // a later answer with a changed past value: the stored value stays
    const changed = clone(J(WSV5)); const firstHour = changed.find((x) => Date.parse(x.timestamp) % H === 0); const keep = firstHour.value; firstHour.value = keep + 1;
    await archiveWaterTemp({ storeDir: store, archiveDir: arch, index, nowMs: obsNow + 120_000, fetchImpl: async (url) => (String(url).includes('pegelonline') ? new Response(JSON.stringify(changed), { status: 200 }) : new Response(bytes(DMI5), { status: 200 })), pauseMs: 0 });
    add('H6 ein einmal abgelegter Wert wird nie ersetzt', stored(wsvKey).find((x) => x.t === Date.parse(firstHour.timestamp))?.c === keep);
    const rec = W.wtRecordOf(daily, dmiKey);
    const full = Object.entries(daily.stations[dmiKey].days).filter(([, s]) => s[3] >= W.WT_DAY_MIN_HOURS).map(([d]) => d).sort();
    add('H7 „Verlauf seit“: nur volle Tage (ab 18 Stundenwerten), aufsteigend, der erste nennt das Datum; angebrochene Tage fehlen', !!rec && rec.since === full[0] && rec.points.length === full.length && rec.points.every((p, i) => p.day === full[i] && p.min <= p.mean && p.mean <= p.max) && Object.keys(daily.stations[dmiKey].days).length > full.length, `seit ${rec?.since}, ${rec?.points.length} Tage`);
    add('H8 kein Verlauf wird behauptet: Station nicht im Archiv, fremdes Dokument, kaputte Tage', W.wtRecordOf(daily, 'wsv:0000') === null && W.wtRecordOf({ product: 'x' }, dmiKey) === null && W.wtRecordOf(null, dmiKey) === null
      && W.wtRecordOf({ ...daily, stations: { k: { days: { '2026-11-17': [9, 8, 7, 24], '2026-11-16': [5, 6, 7, 10], 'gestern': [5, 6, 7, 24], '2026-11-15': [5, 6, 99, 24] } } } }, 'k') === null);
    add('H9 ohne Katalog legt das Archiv keine Wassertemperatur ab und fragt niemanden', (await archiveWaterTemp({ storeDir: join(tmpA, 'leer'), archiveDir: arch, index, nowMs: obsNow, fetchImpl: async () => { throw new Error('darf nicht gefragt werden'); } })).wtRows === 0);
    const down = await archiveWaterTemp({ storeDir: store, archiveDir: join(tmpA, 'archiv2'), index: { days: {} }, nowMs: obsNow, fetchImpl: async (url) => (String(url).includes('pegelonline') ? new Response('Wartung', { status: 503 }) : new Response(bytes(DMI5), { status: 200 })), pauseMs: 0 });
    add('H10 eine Station antwortet nicht ⇒ sie fehlt in diesem Durchgang, die andere wird abgelegt', down.wtStations === 1 && down.wtRows === dmiHourly.length);
    // full years: only complete calendar years count towards a season curve
    const year = (y, n) => Array.from({ length: n }, (_, i) => { const t = Date.UTC(y, 0, 1 + i, 12); return { day: new Date(t).toISOString().slice(0, 10), t, min: 5, mean: 6, max: 7 }; });
    add('H11 volle Jahre: ab 347 vollen Tagen (95 %); 346 zählen nicht; die eigene Ablage hält noch keines; eine Jahreskurve braucht fünf', JSON.stringify(W.wtFullYears([...year(2021, 365), ...year(2022, 346), ...year(2024, 366), ...year(2025, 347)])) === '[2021,2024,2025]' && W.wtFullYears(rec.points).length === 0 && W.WT_SEASON_MIN_YEARS === 5 && W.WT_YEAR_MIN_DAYS === 347);
    // the whole archive pass carries the water temperature and leaves the rest as it was
    const full2 = join(tmpA, 'archiv3');
    mkdirSync(join(store, 'spots'), { recursive: true });
    const res = await archiveSea({ storeDir: store, archiveDir: full2, nowMs: obsNow, poi: false, fetchImpl });
    const idx = JSON.parse(readFileSync(join(full2, 'index.json'), 'utf8'));
    // the model file of the store is archived whole, once (past forecasts cannot be recovered)
    mkdirSync(join(store, W.SEA_WT_DIR), { recursive: true });
    writeFileSync(join(store, W.seaWtPath(DOC1.stamp)), JSON.stringify(DOC1));
    writeFileSync(join(store, W.SEA_WT_DIR, 'notiz.json'), '{}');
    const resM = await archiveSea({ storeDir: store, archiveDir: full2, nowMs: obsNow, poi: false, wtemp: false, fetchImpl });
    const dayM = `${DOC1.stamp.slice(0, 4)}-${DOC1.stamp.slice(4, 6)}-${DOC1.stamp.slice(6, 8)}`;
    const fileM = join(full2, dayM, `wtemp-model-${DOC1.stamp}.json.gz`);
    const again = await archiveSea({ storeDir: store, archiveDir: full2, nowMs: obsNow, poi: false, wtemp: false, fetchImpl });
    add('H13 die Modelldatei des Speichers wird ganz abgelegt, genau einmal, unter dem Tag ihres Stempels; fremde Dateien nicht', resM.wtModelAdded === 1 && existsSync(fileM) && JSON.stringify(JSON.parse(gunzipSync(readFileSync(fileM)).toString('utf8'))) === JSON.stringify(DOC1)
      && JSON.parse(readFileSync(join(full2, 'index.json'), 'utf8')).days[dayM].wtempModel.join() === DOC1.stamp && again.wtModelAdded === 0 && readdirSync(join(full2, dayM)).filter((f) => f.startsWith('wtemp-model')).length === 1);
    add('H12 der ganze Archivlauf legt die Wassertemperatur mit ab; --wtemp=0 lässt sie weg', res.wtRows > 0 && Object.values(idx.days).some((e) => e.wtempStations === 2) && (await archiveSea({ storeDir: store, archiveDir: join(tmpA, 'archiv4'), nowMs: obsNow, poi: false, wtemp: false, fetchImpl: async () => { throw new Error('nicht fragen'); } })).wtRows === 0);
  } finally { rmSync(tmpA, { recursive: true, force: true }); }
}

// --- S  season curve ---------------------------------------------------------------------------------------------------
{
  const SEASON = J('wtemp-season.json');
  const SDIR = resolve(ROOT, 'audit/seewetter-wassertemperatur/season');
  const ev = (key) => JSON.parse(readFileSync(join(SDIR, `${key.replace(':', '-')}.json`), 'utf8'));
  const keys = Object.keys(SEASON.stations);
  add('S1 Jahresgang nur an Stationen des Katalogs, nur DMI (PEGELONLINE reicht 31 Tage zurück — gemessen), jede mit mindestens fünf vollen Jahren', keys.length >= 1 && keys.every((k) => k.startsWith('dmi:') && CAT.stations.some((s) => s.key === k) && SEASON.stations[k].years.length >= W.WT_SEASON_MIN_YEARS)
    && SEASON.minYears === 5 && SEASON.yearMinDays === W.WT_YEAR_MIN_DAYS && PROBE.wsv.filter((s) => s.history).every((s) => s.history.days < 33), keys.map((k) => `${k}:${SEASON.stations[k].years.length}`).join(' '));
  const same = keys.every((k) => { const r = W.wtSeasonFromDays(ev(k).days); return !!r && JSON.stringify(r.years) === JSON.stringify(SEASON.stations[k].years) && JSON.stringify(r.days) === JSON.stringify(SEASON.stations[k].days); });
  add('S2 die Datei ist genau das, was die Regel aus den abgelegten Tageswerten der Quelle macht (keine zweite Wahrheit)', same);
  // independent recomputation of three calendar days at the first station
  const k0 = keys[0], days0 = ev(k0).days, st0 = SEASON.stations[k0];
  const fullYear = (y) => Object.entries(days0).filter(([d, s]) => d.startsWith(`${y}-`) && s[3] >= W.WT_DAY_MIN_HOURS).length;
  const yearsOwn = [...new Set(Object.keys(days0).map((d) => +d.slice(0, 4)))].filter((y) => fullYear(y) >= W.WT_YEAR_MIN_DAYS).sort((a, b) => a - b);
  const own = (md) => { const v = yearsOwn.map((y) => days0[`${y}-${md}`]).filter((s) => s && s[3] >= W.WT_DAY_MIN_HOURS).map((s) => s[1]); const r = (x) => Math.round(x * 10) / 10; return v.length >= W.WT_SEASON_DAY_MIN_YEARS ? [r(Math.min(...v)), r(v.reduce((a, b) => a + b, 0) / v.length), r(Math.max(...v))] : null; };
  const idx = (md) => W.WT_SEASON_MD.indexOf(md);
  add('S3 unabhängig nachgerechnet: volle Jahre, und am 15.01., 15.07., 15.10. niedrigstes, mittleres, höchstes Tagesmittel genau dieser Jahre — ungeglättet', JSON.stringify(yearsOwn) === JSON.stringify(st0.years) && ['01-15', '07-15', '10-15'].every((md) => JSON.stringify(own(md)) === JSON.stringify(st0.days[idx(md)])), `${k0}: ${yearsOwn.join(' ')}`);
  add('S4 366 Kalendertage; ein Tag mit weniger als drei Jahren bleibt leer (29.02.), kein Tag wird aufgefüllt', W.WT_SEASON_MD.length === 366 && W.WT_SEASON_MD[59] === '02-29' && keys.every((k) => SEASON.stations[k].days.length === 366 && SEASON.stations[k].days.every((d, i) => { const o = W.wtSeasonFromDays(ev(k).days).days[i]; return (d === null) === (o === null); }))
    && JSON.stringify(st0.days[idx('02-29')]) === JSON.stringify(own('02-29')));
  // rule on synthetic years
  const mk = (y, n, c) => Object.fromEntries(Array.from({ length: n }, (_, i) => [new Date(Date.UTC(y, 0, 1 + i)).toISOString().slice(0, 10), [c - 1, c, c + 1, 24]]));
  const five = { ...mk(2019, 365, 5), ...mk(2020, 366, 6), ...mk(2021, 365, 7), ...mk(2022, 365, 8), ...mk(2023, 365, 9) };
  const s5 = W.wtSeasonFromDays(five);
  const four = W.wtSeasonFromDays({ ...mk(2019, 365, 5), ...mk(2020, 366, 6), ...mk(2021, 365, 7), ...mk(2022, 365, 8), ...mk(2023, 346, 9) });
  const thin = W.wtSeasonFromDays({ ...five, ...Object.fromEntries(Object.entries(mk(2024, 366, 30)).map(([d, s]) => [d, [s[0], s[1], s[2], 10]])) });
  add('S5 Regel an gesetzten Jahren: fünf volle Jahre ⇒ Mittel 7, Spanne 5 … 9; vier volle und eines mit 346 Tagen ⇒ kein Jahresgang; Tage unter 18 Stunden zählen nicht', !!s5 && JSON.stringify(s5.years) === '[2019,2020,2021,2022,2023]' && JSON.stringify(s5.days[0]) === '[5,7,9]' && s5.days[59] === null && four === null && JSON.stringify(thin.years) === '[2019,2020,2021,2022,2023]' && JSON.stringify(thin.days[0]) === '[5,7,9]');
  const read = W.wtSeasonOf(SEASON, k0);
  add('S6 Lesen auf der Seite: die Station mit ihren Jahren und Tagen; fremde Form, fehlende Station, zu wenige Jahre ⇒ kein Jahresgang', !!read && read.points.length >= 300 && read.points.every((p) => p.min <= p.mean && p.mean <= p.max) && JSON.stringify(read.years) === JSON.stringify(st0.years)
    && W.wtSeasonOf(SEASON, 'wsv:9570070') === null && W.wtSeasonOf({ product: 'x' }, k0) === null && W.wtSeasonOf(null, k0) === null && W.wtSeasonOf({ ...SEASON, stations: { [k0]: { ...st0, years: st0.years.slice(0, 4) } } }, k0) === null && W.wtSeasonOf({ ...SEASON, stations: { [k0]: { ...st0, days: st0.days.slice(0, 100) } } }, k0) === null);
  add('S7 die abgelegten Tageswerte nennen Quelle, Zeitraum und Zahl der Abrufe; kein Monat blieb ohne Antwort', keys.every((k) => { const e = ev(k); return e.station === k && /opendataapi\.dmi\.dk\/v2\/oceanObs/.test(e.source) && e.requests === (e.to - e.from + 1) * 12 && e.monthsWithoutAnswer === 0; }));
}

// --- R  the card as markup (no browser: bundled with esbuild, rendered with react-dom/server) --------------------------
{
  const tmpR = mkdtempSync(join(tmpdir(), 'sea-wt-card-'));
  try {
    const out = join(tmpR, 'card.mjs');
    await build({
      stdin: { resolveDir: ROOT, loader: 'ts', contents: `
        export { default as Panel, wtWhereText, wtYearsText } from './src/sea/SeaWaterTempPanel.tsx';
        export { createElement } from 'react';
        export { renderToStaticMarkup } from 'react-dom/server';` },
      bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: out, logLevel: 'silent', jsx: 'automatic',
      define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
      banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    });
    const { Panel, wtWhereText, wtYearsText, createElement: h, renderToStaticMarkup } = await import(pathToFileURL(out).href);
    const text = (view) => renderToStaticMarkup(h(Panel, { view })).replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
    const e = DOC1.spots[GED], at = e.t0 + 30 * H;
    const dmiPts = W.dmiTwObsOf(J(DMI5)).points, wsvPts = W.wsvObsOf(J(WSV5)).points;
    const model = (spotId, load = { doc: DOC1, state: 'ok', why: null }) => V.wtModelViewOf({ load, catalog: CAT, spotId, tMs: at, nowMs: NOW });
    const obs = (spotId, pts) => V.wtObsViewOf({ load: pts ? { points: pts, state: 'ok' } : null, catalog: CAT, spotId, nowMs: obsNow });
    const base = { obsHourly: [], record: null, season: null, threshold: null, onThreshold: () => {}, tMs: at, nowMs: obsNow };
    // Gedser: DMI station at the spot, model, threshold, season curve
    const byDay = new Map();
    for (const p of W.wtHourly(dmiPts)) { const d = new Date(p.t).toISOString().slice(0, 10); (byDay.get(d) ?? byDay.set(d, []).get(d)).push(p.c); }
    const daily = { schema: 1, product: W.SEA_WT_DAILY_PRODUCT, stations: { [dmiKey]: { name: dmiSt.name, net: 'dmi', days: Object.fromEntries([...byDay].map(([d, v]) => [d, W.wtDayStat(v)])) } } };
    const rec = W.wtRecordOf(daily, dmiKey), season = W.wtSeasonOf(J('wtemp-season.json'), dmiKey);
    const th = { side: 'over', c: 18 };
    const full = text({ ...base, model: model(GED), obs: obs(GED, dmiPts), obsHourly: W.wtHourly(dmiPts), record: rec, season, threshold: th });
    const mv = model(GED), ov = obs(GED, dmiPts);
    add('R1 Karte mit Messung und Modell: beide Zahlen, jede mit ihrer Quelle; der Satz am Modell; Messort, Station, Entfernung', full.includes(`${V.wtNum(ov.latest.c)} °C`) && full.includes(`${V.wtNum(mv.c)} °C`) && full.includes(`${W.WT_MODEL_NOTE}.`) && full.includes('im Hafen, DMI-Station Gedser Havn II, 0,2 km vom Spot') && (full.match(/DMI, CC BY 4\.0/g) ?? []).length >= 2 && full.includes('Rohwert ohne Prüfung') && full.includes('auf 0,1 °C gerundet') && full.includes('oberste Schicht des Sturmflutmodells DKSS'), full.slice(0, 300));
    add('R2 Schwelle: der Satz zum Ausfüllen, je ein Satz zur Messung und zum Modell, der Hinweis „streng größer“', full.includes('Zeig, wann das Wasser') && full.includes(V.wtObsSentence(ov.latest, th)) && full.includes(V.wtModelSentence(e, th, obsNow)) && full.includes('heißt streng größer als 18 °C') && full.includes('Schwelle löschen'));
    add('R3 Jahresgang an Gedser: Titel, die vollen Jahre der Quelle als Liste, „nicht geglättet“, dazu das eigene Jahr seit dem ersten vollen Tag', !!season && full.includes('Jahresgang an der Station Gedser Havn II') && full.includes(`${season.years.length} volle Jahre (${wtYearsText(season.years)})`) && full.includes('Nicht geglättet und nicht aufgefüllt') && full.includes('dieses Jahr aus unserer eigenen Ablage, seit ') && wtYearsText([2015, 2016, 2017, 2019, 2022, 2023]) === '2015–2017, 2019, 2022–2023' && !full.includes('Verlauf seit'));
    // a WSV spot without a season curve: "Verlauf seit" and why there is no year curve
    const wsvSpot = Object.keys(CAT.spots).find((id) => CAT.spots[id].station?.key === wsvKey);
    const wsvDaily = { schema: 1, product: W.SEA_WT_DAILY_PRODUCT, stations: { [wsvKey]: { days: { '2026-11-16': [8, 8.4, 8.9, 24], '2026-11-17': [8.1, 8.3, 8.6, 24] } } } };
    const wsvText = text({ ...base, model: model(wsvSpot), obs: obs(wsvSpot, wsvPts), obsHourly: W.wtHourly(wsvPts), record: W.wtRecordOf(wsvDaily, wsvKey) });
    add('R4 WSV-Spot: Vermerk „WSV PEGELONLINE, DL-DE Zero 2.0“ an der Messung, „DMI, CC BY 4.0“ am Modell; „Verlauf seit 16.11.2026“ und der Grund, warum es keine Jahreskurve gibt', wsvText.includes('WSV PEGELONLINE, DL-DE Zero 2.0') && wsvText.includes('DMI, CC BY 4.0') && wsvText.includes(wtWhereText(wsvSt)) && wsvText.includes('Verlauf seit 16.11.2026') && wsvText.includes('Keine Jahreskurve: die Quelle liefert für diese Station keine 5 vollen Jahre (PEGELONLINE hält 31 Tage)') && !wsvText.includes('Jahresgang an der Station'));
    add('R4b Messort in Worten: Hafen, Pegel — mit Gewässer bei der WSV', wtWhereText({ net: 'wsv', name: 'Helgoland Binnenhafen', water: 'Nordsee', site: 'hafen' }) === 'im Hafen, WSV-Pegel Helgoland Binnenhafen (Nordsee)' && wtWhereText({ net: 'wsv', name: 'List auf Sylt', water: 'Nordsee', site: 'pegel' }) === 'am WSV-Pegel List auf Sylt (Nordsee)' && wtWhereText({ net: 'dmi', name: 'Gedser Havn II', water: null, site: 'hafen' }) === 'im Hafen, DMI-Station Gedser Havn II');
    // no station near: the measurement half says so, the model keeps its own value, no measured number appears
    const lone = text({ ...base, model: model('binz', { doc: { ...DOC1, spots: { ...DOC1.spots, binz: e } }, state: 'ok', why: null }), obs: obs('binz', dmiPts) });
    add('R5 Spot ohne Station: „keine Station in der Nähe“ und „Das Modell steht nicht an ihrer Stelle.“ — der Modellwert steht nur in der Modellhälfte, keine Quelle einer Messung', lone.includes('keine Station in der Nähe') && lone.includes('Das Modell steht nicht an ihrer Stelle.') && (lone.match(new RegExp(`${V.wtNum(e.c[30] / 10).replace(',', ',')} °C`, 'g')) ?? []).length === 1 && !lone.includes('WSV PEGELONLINE') && !lone.includes('Rohwert ohne Prüfung') && !lone.includes('Verlauf seit') && !lone.includes('Jahresgang'));
    // no model: "keine Daten" with DMI's words; the measurement stays
    const failedDoc = { ...DOC1, spots: Object.fromEntries(Object.entries(DOC1.spots).filter(([id]) => id !== GED)), failed: [{ id: GED, error: 'DMI 429 Too Many Requests: Server is busy. Please try again later.' }] };
    const noModel = text({ ...base, model: model(GED, { doc: failedDoc, state: 'ok', why: null }), obs: obs(GED, dmiPts), threshold: th });
    add('R6 Modell fehlt: „keine Daten“ mit DMIs Grund, die Messung bleibt; zur Schwelle heißt es, dass sich für das Modell nichts sagen lässt', noModel.includes('keine Daten') && noModel.includes('Server is busy') && noModel.includes(`${V.wtNum(ov.latest.c)} °C`) && noModel.includes('Keine Daten des Modells — zur Schwelle lässt sich für das Modell nichts sagen.') && !noModel.includes(W.WT_MODEL_NOTE));
    const loading = text({ ...base, model: V.wtModelViewOf({ load: 'loading', catalog: CAT, spotId: GED, tMs: at, nowMs: NOW }), obs: V.wtObsViewOf({ load: 'loading', catalog: CAT, spotId: GED, nowMs: obsNow }), record: 'loading' });
    const dryView = { ...mv, c: null, gap: 'dry' };
    const dryText = text({ ...base, model: dryView, obs: obs(GED, dmiPts) });
    add('R7 Laden und trockene Stunde: „lädt …“ in beiden Hälften; „ohne Wasser“ mit dem Grund, nie eine Zahl', (loading.match(/lädt …/g) ?? []).length >= 3 && dryText.includes('ohne Wasser') && dryText.includes('führt die Modellzelle kein Wasser') && !dryText.includes(`${V.wtNum(mv.c)} °C`));
    const allText = [full, wsvText, lone, noModel, loading, dryText].join(' ');
    const advice = /\bsicher(e|er|es|en)?\b|ungefährlich|gefahrlos|Neopren|Badewetter|zum Baden|Fisch|beißt|empfehl|solltest/i;
    add('R8 in keinem Zustand der Karte steht ein Rat oder „sicher“ (mit Gegenprobe)', !advice.test(allText) && advice.test('Zum Baden mit Neopren.') && allText.length > 3000);
  } finally { rmSync(tmpR, { recursive: true, force: true }); }
}

// --- I  source rules ---------------------------------------------------------------------------------------------------
{
  const src = (f) => readFileSync(join(ROOT, f), 'utf8');
  const contract = src('src/sea/seaWaterTemp.ts'), logic = src('src/sea/waterTemp.ts'), client = src('src/sea/waterTempClient.ts'), panel = src('src/sea/SeaWaterTempPanel.tsx'), chart = src('src/sea/SeaWaterTempChart.tsx');
  const hook = src('src/sea/useSeaWaterTemp.ts'), page = src('src/sea/SeaPage.tsx'), readout = src('src/sea/SeaReadout.tsx'), prod = src('scripts/sea/sea-dmi.mjs'), arch = src('scripts/sea/sea-archive.mjs'), css = src('src/sea/seaDeck.css');
  const all = [contract, logic, client, panel, chart, hook];
  const hosts = (t) => [...t.matchAll(/https?:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]);
  const allowed = new Set(['www.pegelonline.wsv.de', 'www.govdata.de', 'raw.githubusercontent.com']);
  const found = [...new Set(all.flatMap(hosts))];
  add('I1 Hosts der Phase: PEGELONLINE (Daten), govdata.de (Lizenztext), raw.githubusercontent.com (eigenes Archiv); DMI nur über die Konstante DMI_HOST', found.every((h) => allowed.has(h)) && found.includes('www.pegelonline.wsv.de') && /DMI_HOST/.test(contract) && DMI_HOST === 'https://opendataapi.dmi.dk', found.join(', '));
  const forbidden = (t) => /['"`/]grib|\/stac|api-key|X-Gravitee|marnet|copernicus|cmems/i.test(t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''));
  add('I2 kein /grib-Endpunkt, kein API-Schlüssel, kein MARNET, kein CMEMS — in Vertrag, Logik, Leser, Karte, Producer, Archiv', ![...all, prod, arch].some(forbidden));
  add('I2b Gegenprobe: die Sonde erkennt einen /grib-Abruf, einen Schlüssel und CMEMS', forbidden("fetch(`${DMI_HOST}/v1/forecastdata/grib/x`)") && forbidden("url + '?api-key=' + k") && forbidden("const host = 'nrt.cmems-du.eu'") && forbidden("fetch(marnetUrl('/stac/items'))"));
  add('I3 Quellenvermerke wörtlich: „DMI, CC BY 4.0“ und „WSV PEGELONLINE, DL-DE Zero 2.0“, beide an der Karte und in der Quellenliste der Seite', DMI_CREDIT === 'DMI, CC BY 4.0' && W.WSV_CREDIT === 'WSV PEGELONLINE, DL-DE Zero 2.0' && /DMI_CREDIT/.test(panel) && /WSV_CREDIT/.test(panel) && /DMI_LICENCE_URL/.test(panel) && /WSV_LICENCE_URL/.test(panel) && /credit: WSV_CREDIT/.test(page) && /credit: DMI_CREDIT/.test(page));
  add('I4 der Satz am Modellwert steht wörtlich im Vertrag und an der Karte', W.WT_MODEL_NOTE === 'Modell für das offene Wasser, im flachen Uferwasser kann es wärmer oder kälter sein' && /\{WT_MODEL_NOTE\}/.test(panel));
  add('I5 an der Messung steht, wo gemessen wird: Messort, Netz, Name, Gewässer, Entfernung', /wtWhereText\(v\.station\)/.test(panel) && /km vom Spot/.test(panel) && Object.values(W.WT_SITE_LABEL).join() === 'im Hafen,am Anleger,am Leuchtturm,am Sperrwerk,am Pegel');
  add('I6 kein Schalter für die Phase: weder Flag noch Query-Parameter (wt ist die Schwelle, kein Schalter)', !/SEA_WT_LIVE|seaWaterTempFrom|[?&](wtemp|watertemp)=/.test(src('src/sea/seaFlag.ts') + page + hook + client + readout));
  add('I7 das Diagramm ist ein eigener, träge geladener Chunk: nur die Karte lädt es, über lazy()', /lazy\(\(\) => import\('\.\/SeaWaterTempChart'\)/.test(panel) && !/from '\.\/SeaWaterTempChart'/.test(page + readout + hook + panel.replace(/import type[^\n]*/g, '')) && /@nivo\/line/.test(chart));
  add('I8 Seite: der Abschnitt „Wassertemperatur“ steht im Kapitel Wasserstand, ohne das Kapitel (?wl=0) unter Wetter; ohne Katalog gibt es ihn nicht', (readout.match(/id="sw-sec-wtemp"/g) ?? []).length === 2 && /!hasWater && p\.waterTemp/.test(readout) && /spot && wtemp\.view \? <SeaWaterTempPanel/.test(page) && /if \(!catalog \|\| !a\.spotId\) return null/.test(hook));
  add('I9 keine Mischung im Leser: kein Abruf fällt von einer Quelle auf die andere zurück', !/catch[^}]*wtObsUrl|fallback|ersatzweise/i.test(client.replace(/\/\*[\s\S]*?\*\//g, '')));
  const own = [panel, logic].join(' ').replace(/import[^;]*;/g, '');
  const safe = /\bsicher(e|er|es|en)?\b|ungefährlich|gefahrlos|Neopren|Badewetter|Fischvorhersage|beißt/i;
  add('I10 kein „sicher“, kein Neopren, keine Fischvorhersage in Karte und Sätzen (mit Gegenprobe)', !safe.test(own) && safe.test('Hier ist es sicher.') && !/dangerouslySetInnerHTML/.test(panel + chart));
  add('I11 Stile der Phase stehen vor dem Planer (dessen Media Query bleibt die letzte), mobil nur per Media Query', css.indexOf('Phase WT') > css.indexOf('Phase ST') && css.indexOf('Phase WT') < css.indexOf('Phase SP') && /\.sw-wt-pair \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css) && !/@media[^{]*(max|min)-width: (?!767px|1439px)\d+px/.test(css.slice(css.indexOf('Phase WT'), css.indexOf('Phase SP'))));
  add('I12 Producer: der DMI-Schritt des Workflows ruft dasselbe Skript — kein neuer Schritt, kein neuer Workflow nötig', /scripts\/sea\/sea-dmi\.mjs --store=\.\.\/store/.test(src('scripts/sea/workflow-sea.yml')) && /buildWaterTemp\(common\)/.test(prod) && /process\.exitCode = rc/.test(prod));
  add('I13 Archiv-Workflow: sein Checkout (scripts/sea, scripts/lib, src/sea) genügt — der Vertrag importiert nur aus src/sea', /sparse-checkout set --no-cone scripts\/sea scripts\/lib src\/sea package\.json/.test(src('scripts/sea/workflow-sea-archiv.yml')) && [...contract.matchAll(/from '([^']+)'/g)].every((m) => m[1] === './seaDmi') && [...src('src/sea/seaDmi.ts').matchAll(/from '([^']+)'/g)].length === 0);
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? `  — ${c.detail}` : ''}`);
console.log(`\n  ${checks.length - failed.length}/${checks.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
