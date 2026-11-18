#!/usr/bin/env node
/**
 * verify:sea-dk — phase DK, the Danish coast on /seewetter (audit/seewetter-daenemark.md). No network, no browser.
 *
 * Fixtures `scripts/lib/fixtures/sea/dk/` = answers of the real DMI service (opendataapi.dmi.dk), byte-exact, recorded
 * 18.11.2026 with the producer's own URLs (`scripts/sea/spike/dk-record-fixtures.mjs`), plus three answers kept from
 * the step-0 measurement: DMI's 429 body, a model point on land (200, all null), a station without values.
 *
 *   A  fixtures are what was recorded (sha256 of every file against the manifest; negative control)
 *   B  contract: CoverageJSON → entries (DKSS, HARMONIE), land, DMI's error body, tampered answers
 *   C  catalogue: the eight spots, served as measured; outside the cube; without a gauge; rules with negative controls
 *   D  producer on a store with a DMI stand-in: file, pointer, refresh interval, unchanged, DMI failure, total failure
 *   E  page logic without a browser: DMI wind outside the cube, water level per hour, staleness, measurements
 *   F  source rules: host, no /grib, no key, credit, no warning of our own, workflow step
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as D from '../src/sea/seaDmi.ts';
import { spotCatalogProblems, mergeSpotCatalogs, seaCellCentre, SEA_SPOT_STEPS, SEA_PARAMS, SEA_MODELS, seaSpotsPath, seaRunJsonPath } from '../src/sea/seaContract.ts';
import { parseSpotsDoc, withDmiWind, loadDmi, loadDmiStationObs, loadStationObs, SEA_DMI_NONE } from '../src/sea/seaClient.ts';
import { seaInRevier, SEA_REVIERE, parseSeaUrl } from '../src/sea/seaState.ts';
import { CUBE_DOMAIN } from '../src/point/cubeFormat.ts';
import { collectDmi, buildDmi, fetchDmi, pruneDmi } from './sea/sea-dmi.mjs';
import { readCatalog, readStatus, dueRun, missingSpots } from './sea/sea-derive.mjs';
import { dkServing, DK_PROBE_FILE } from './sea/build-spots.mjs';
import { seaSpotSeoText } from '../src/sea/seaSeoText.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const DK = join(FIX, 'dk');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const bytes = (f) => readFileSync(join(DK, f));
const J = (f) => JSON.parse(bytes(f).toString('utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const H = 3_600_000;
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return e instanceof D.DmiAnswerError && re.test(e.message); } };

const MAN = J('manifest.json');
const CAT = J('spots-dk.json').spots;
const DE = JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots;
const byId = Object.fromEntries(CAT.map((s) => [s.id, s]));
const HVS = byId['hvide-sande'], GED = byId.gedser;

// --- A  fixtures -------------------------------------------------------------------------------------------------
{
  const names = Object.keys(MAN.files);
  const bad = names.filter((n) => !existsSync(join(DK, n)) || sha(bytes(n)) !== MAN.files[n].sha256 || bytes(n).length !== MAN.files[n].bytes);
  add('A1 jede Fixture ist byte-gleich mit ihrer Aufzeichnung (sha256, Länge)', names.length >= 14 && bad.length === 0, bad.join(', '));
  const onDisk = readdirSync(DK).filter((n) => n !== 'manifest.json');
  add('A2 im Ordner liegt keine Datei ohne Eintrag', onDisk.every((n) => MAN.files[n]), onDisk.filter((n) => !MAN.files[n]).join(', '));
  const urls = names.map((n) => MAN.files[n].url).filter(Boolean);
  add('A3 jede Antwort kam von opendataapi.dmi.dk, keine über /grib, keine mit Schlüssel', urls.length >= 13 && urls.every((u) => u.startsWith(`${D.DMI_HOST}/`) && !/grib|api-key|apikey/i.test(u)));
  const tampered = Buffer.from(bytes('wl-gedser.json')); tampered[tampered.length - 20] ^= 1;
  add('A4 Gegenprobe: ein gekipptes Bit fällt auf', sha(tampered) !== MAN.files['wl-gedser.json'].sha256);
}

// --- B  contract ---------------------------------------------------------------------------------------------------
{
  const doc = J('wl-gedser.json');
  const c = D.dmiCoverageOf(doc, [D.DMI_WL_PARAM]);
  add('B1 DKSS-Antwort: 121 Stunden, aufsteigend, stündlich, ein Gitterpunkt', c.t.length === 121 && c.t.every((t, i) => i === 0 || t - c.t[i - 1] === H) && Number.isFinite(c.lat) && Number.isFinite(c.lon), `${c.t.length} · ${c.lat}/${c.lon}`);
  const e = D.dmiWlEntry(doc, GED.dk.wl.coll, GED);
  const raw = doc.ranges[D.DMI_WL_PARAM].values;
  add('B2 Wasserstand: cm ganzzahlig = Meter × 100 gerundet, an jeder Stunde', e.cm.length === 121 && e.cm.every((cm, i) => cm === Math.round(raw[i] * 100)) && e.t0 === c.t[0], `${e.cm.slice(0, 4)} …`);
  add('B3 Modellpunkt mit Entfernung zum Spot, innerhalb der Werteprüfung', e.km >= 0 && e.km < 2 && e.coll === 'dkss_idw' && e.cm.every((x) => x >= D.DMI_WL_RANGE_CM[0] && x <= D.DMI_WL_RANGE_CM[1]), `${e.km} km`);
  add('B4 Punkt auf Land (200, lauter null) ⇒ benannter Grund, kein Eintrag', throwsWith(() => D.dmiWlEntry(J('edr-land-dkss_nsbs-hvide-sande.json'), 'dkss_nsbs', HVS), /kein Wert am Modellpunkt/));
  add('B5 DMIs 429-Körper ⇒ benannter Grund mit DMIs eigenen Worten', throwsWith(() => D.dmiCoverageOf(J('edr-429-dkss_idw.json'), [D.DMI_WL_PARAM]), /^DMI 429 Too Many Requests: Server is busy/));
  const w = D.dmiWindEntry(J('wind-hvide-sande.json'), HVS);
  const wr = J('wind-hvide-sande.json').ranges;
  add('B6 HARMONIE: 61 Stunden Wind/Böe/Richtung in 0,1 m/s und Grad', w.wind.length === 61 && w.gust.length === 61 && w.dir.length === 61 && w.wind.every((x, i) => x === Math.round(wr['wind-speed-10m'].values[i] * 10)) && w.dir.every((x) => x >= 0 && x <= 359), `${w.wind.slice(0, 3)} / ${w.gust.slice(0, 3)} / ${w.dir.slice(0, 3)}`);
  add('B7 Böe nie unter dem Wind (Toleranz 0,5 m/s)', w.gust.every((g, i) => g == null || g + 5 >= w.wind[i]));
  // tampered answers
  const short = clone(doc); short.ranges[D.DMI_WL_PARAM].values.pop();
  const rev = clone(doc); rev.domain.axes.t.values.reverse();
  const noParam = clone(doc); delete noParam.ranges[D.DMI_WL_PARAM];
  add('B8 Gegenprobe: gekürzte Spalte, umgedrehte Zeitachse, fehlender Parameter werden abgelehnt',
    throwsWith(() => D.dmiCoverageOf(short, [D.DMI_WL_PARAM]), /120 Werte bei 121 Zeiten/) && throwsWith(() => D.dmiCoverageOf(rev, [D.DMI_WL_PARAM]), /Zeitachse/) && throwsWith(() => D.dmiCoverageOf(noParam, [D.DMI_WL_PARAM]), /fehlt in der Antwort/) && throwsWith(() => D.dmiCoverageOf('<html>', [D.DMI_WL_PARAM]), /keine JSON-Antwort/));
  const gap = clone(doc); gap.ranges[D.DMI_WL_PARAM].values[5] = null;
  const eg = D.dmiWlEntry(gap, 'dkss_idw', GED);
  add('B9 eine Lücke bleibt eine Lücke (kein Füllen, kein Interpolieren)', eg.cm[5] === null && D.dmiWlAt(eg, eg.t0 + 5 * H) === null && D.dmiWlPoints(eg).length === 120);
}

// --- C  catalogue ----------------------------------------------------------------------------------------------------
{
  const all = mergeSpotCatalogs(DE, CAT);
  add('C1 acht dänische Spots, mit den 56 deutschen ohne Befund', CAT.length === 8 && all.length === 64 && spotCatalogProblems(all).length === 0, spotCatalogProblems(all).slice(0, 3).join(' | '));
  add('C2 jeder: country DK, kein Küstenabschnitt, kein WODL-Block, DMI-Station, ASCII-Kennung', CAT.every((s) => s.country === 'DK' && s.coast === null && s.wodlCoast === null && s.station?.net === 'dmi' && /^[a-z0-9-]+$/.test(s.id)));
  add('C3 Wasserzelle ≤ 3 km, höchstens zur Hälfte trocken', CAT.every((s) => s.cell.km <= 3 && (s.cell.dry ?? 0) <= 0.5), CAT.map((s) => `${s.id} ${s.cell.km}`).join(' '));
  const out = CAT.filter((s) => !s.dk.cube);
  add('C4 Spot außerhalb des Punkt-Cubes: nur Hvide Sande, Wind vom DMI', out.length === 1 && out[0].id === 'hvide-sande' && out[0].dk.wind === 'dmi' && seaCellCentre('cwam', HVS.cell.i, HVS.cell.j).lat > CUBE_DOMAIN.latMax);
  add('C5 im Cube ⇒ buscosun Fusion, nie beides', CAT.filter((s) => s.dk.cube).every((s) => s.dk.wind === 'fusion' && seaCellCentre('cwam', s.cell.i, s.cell.j).lat <= CUBE_DOMAIN.latMax) && CAT.filter((s) => s.dk.cube).length === 7);
  const bsh = CAT.filter((s) => s.dk.wl?.from === 'bsh'), dmi = CAT.filter((s) => s.dk.wl?.from === 'dmi');
  add('C6 BSH-Pegel nur bis 20 km (Rømø → List, Als Kegnæs → Kalkgrund)', bsh.length === 2 && bsh.every((s) => s.dk.wl.km <= D.DK_BSH_NEAR_KM) && byId.roemoe.dk.wl.gauge === 'list_hafen' && byId['als-kegnaes'].dk.wl.gauge === 'kalkgrund');
  add('C7 Spot ohne Pegel: sechs lesen das DMI-Modell an einem benannten Punkt', dmi.length === 6 && dmi.every((s) => D.DMI_WL_COLLECTIONS.includes(s.dk.wl.coll) && s.dk.wl.km <= 10) && GED.dk.wl.from === 'dmi', dmi.map((s) => `${s.id}:${s.dk.wl.coll}`).join(' '));
  // the catalogue is what the step-0 measurement says (no second truth)
  const probe = JSON.parse(readFileSync(resolve(ROOT, DK_PROBE_FILE), 'utf8')).rows;
  const fromProbe = CAT.every((s) => { const r = dkServing(probe.find((x) => x.id === s.id), seaCellCentre('cwam', s.cell.i, s.cell.j)); return JSON.stringify(r.dk) === JSON.stringify(s.dk) && JSON.stringify(r.station) === JSON.stringify(s.station); });
  add('C8 Station und Versorgung je Spot = Messung aus Schritt 0 (dk-probe.json)', fromProbe);
  add('C8b Fanø: die nächste Station (Nordby) lieferte nichts ⇒ die nächste liefernde steht im Katalog', byId.fanoe.station.id !== '06088' && probe.find((x) => x.id === 'fanoe').metObs[0].id === '06088' && probe.find((x) => x.id === 'fanoe').metObs[0].wind === 0);
  // negative controls on the rules
  const withCoast = clone(GED); withCoast.wodlCoast = 'Ostseekueste';
  const noDk = clone(GED); delete noDk.dk;
  const deWithDk = { ...clone(DE[0]), dk: GED.dk };
  const fusionOut = clone(HVS); fusionOut.dk.wind = 'fusion';
  const farGauge = clone(byId.roemoe); farGauge.dk.wl.km = 46.6;
  const bad = [withCoast, noDk, deWithDk, fusionOut, farGauge].map((s) => spotCatalogProblems([s]).length);
  add('C9 Gegenprobe: deutscher Küstenblock am dänischen Spot, fehlendes dk, dk am deutschen Spot, Fusion außerhalb des Cubes, Pegel 46 km', bad.every((n) => n > 0), bad.join('/'));
  add('C10 ohne die dänische Datei ist der Katalog der alte (56), doppelte Kennung und Spot ohne Land fallen weg',
    mergeSpotCatalogs(DE, null).length === 56 && mergeSpotCatalogs(DE, [{ ...GED, id: DE[0].id }]).length === 56 && mergeSpotCatalogs(DE, [{ ...GED, country: undefined }]).length === 56);
  add('C11 Revier „Dänemark“ = Land, „Nordsee“/„Ostsee“ = Meer; alter Link bleibt lesbar', SEA_REVIERE.includes('daenemark') && CAT.every((s) => seaInRevier(s, 'daenemark') && seaInRevier(s, s.region) && seaInRevier(s, 'alle')) && DE.every((s) => !seaInRevier(s, 'daenemark'))
    && parseSeaUrl('/seewetter/gedser', '?rv=daenemark').state.rv === 'daenemark' && parseSeaUrl('/seewetter', '?rv=ostsee').state.rv === 'ostsee');
}

// --- D  producer ------------------------------------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'sea-dk-'));
try {
  const store = join(tmp, 'store');
  mkdirSync(join(store, 'static'), { recursive: true });
  cpSync(join(FIX, 'static', 'spots.json'), join(store, 'static', 'spots.json'));
  cpSync(join(DK, 'spots-dk.json'), join(store, 'static', 'spots-dk.json'));
  const byUrl = new Map(Object.entries(MAN.files).filter(([n]) => /^(wl|wind)-/.test(n)).map(([n, m]) => [m.url, bytes(n).toString('utf8')]));
  const asked = [];
  /** DMI stand-in: the recorded answers by URL; `fail(url)` → an answer to serve instead (status, body). */
  const standIn = (fail = () => null) => async (url) => {
    asked.push(url);
    const f = fail(url);
    if (f) return { status: f.status, text: async () => f.body };
    return byUrl.has(url) ? { status: 200, text: async () => byUrl.get(url) } : { status: 404, text: async () => '{"status":404,"error":"Not Found"}' };
  };
  const fast = { pauseMs: 0, backoffMs: () => 0, tries: 3 };
  const now = Date.parse(MAN.recordedAt);
  const cat = readCatalog(store);
  add('D1 der Producer liest beide Katalogdateien (64); ohne die dänische die 56', cat.spots.length === 64 && cat.spots.filter((s) => s.country === 'DK').length === 8);

  const r1 = await buildDmi({ storeDir: store, nowMs: now, fetchImpl: standIn(), killed: false, ...fast });
  const st1 = readStatus(store);
  const doc1 = r1.built ? JSON.parse(readFileSync(join(store, r1.path), 'utf8')) : null;
  add('D2 ein Lauf: sechs Wasserstände, ein Wind, nichts ausgefallen, Werteprüfung ohne Befund', r1.built && r1.wl === 6 && r1.wind === 1 && r1.failed.length === 0 && D.seaDmiProblems(doc1).length === 0, JSON.stringify(r1).slice(0, 200));
  add('D3 sieben Abrufe, alle EDR /position auf opendataapi.dmi.dk, keiner über /grib, keiner mit Schlüssel', asked.length === 7 && asked.every((u) => /^https:\/\/opendataapi\.dmi\.dk\/v1\/forecastedr\/collections\/[a-z_]+\/position\?/.test(u) && !/grib|api-key/i.test(u)), `${asked.length}`);
  add('D4 Zeiger status.dmi zeigt auf die Datei; Lizenz und Quelle stehen in der Datei', D.dmiPointerOf(st1)?.path === r1.path && doc1.licence === 'CC BY 4.0' && doc1.credit === D.DMI_CREDIT && doc1.source.startsWith(D.DMI_HOST) && doc1.stamp === D.seaDmiStamp(now));
  add('D5 Wind nur für den Spot außerhalb des Cubes, Wasserstand nur für Spots ohne nahen BSH-Pegel', Object.keys(doc1.wind.spots).join() === 'hvide-sande' && !doc1.wl.spots.roemoe && !doc1.wl.spots['als-kegnaes'] && !!doc1.wl.spots.gedser && !!doc1.wl.spots['hvide-sande']);
  const n0 = asked.length;
  const r2 = await buildDmi({ storeDir: store, nowMs: now + 20 * 60_000, fetchImpl: standIn(), killed: false, ...fast });
  add('D6 jünger als 60 min ⇒ kein Abruf, nichts geschrieben', !r2.built && asked.length === n0 && /jünger als 60 min/.test(r2.reason));
  const r3 = await buildDmi({ storeDir: store, nowMs: now + 61 * 60_000, fetchImpl: standIn(), killed: false, ...fast });
  add('D7 gleiche Antworten ⇒ keine neue Datei, Zeiger bleibt', !r3.built && /unverändert/.test(r3.reason) && readdirSync(join(store, 'dmi')).length === 1 && D.dmiPointerOf(readStatus(store)).stamp === doc1.stamp);

  // DMI failure at one spot: 429 with DMI's own body on every try
  const body429 = bytes('edr-429-dkss_idw.json').toString('utf8');
  const urlGed = MAN.files['wl-gedser.json'].url;
  const before = asked.length;
  const r4 = await buildDmi({ storeDir: store, nowMs: now + 3 * H, fetchImpl: standIn((u) => (u === urlGed ? { status: 429, body: body429 } : null)), killed: false, ...fast });
  const doc4 = r4.built ? JSON.parse(readFileSync(join(store, r4.path), 'utf8')) : null;
  const tries = asked.slice(before).filter((u) => u === urlGed).length;
  add('D8 DMI-Ausfall an einem Spot: dreimal versucht, mit DMIs Grund in failed, die übrigen geschrieben', r4.built && tries === 3 && !doc4.wl.spots.gedser && doc4.failed.length === 1 && doc4.failed[0].id === 'gedser' && doc4.failed[0].what === 'wl' && /429 Too Many Requests: Server is busy/.test(doc4.failed[0].error) && Object.keys(doc4.wl.spots).length === 5, JSON.stringify(doc4?.failed));
  add('D8b kein alter Wert für den ausgefallenen Spot: die neue Datei trägt ihn nicht, der Zeiger zeigt auf die neue', D.dmiPointerOf(readStatus(store)).path === r4.path && doc1.wl.spots.gedser && !doc4.wl.spots.gedser);
  // a model point on land
  const land = bytes('edr-land-dkss_nsbs-hvide-sande.json').toString('utf8');
  const urlHvs = MAN.files['wl-hvide-sande.json'].url;
  const d5 = await collectDmi({ spots: cat.spots, nowMs: now, fetchImpl: standIn((u) => (u === urlHvs ? { status: 200, body: land } : null)), ...fast });
  add('D9 Modellpunkt auf Land ⇒ failed „kein Wert am Modellpunkt“, kein Eintrag', !d5.wl.spots['hvide-sande'] && d5.failed.some((f) => f.id === 'hvide-sande' && f.what === 'wl' && /kein Wert am Modellpunkt/.test(f.error)) && !!d5.wind.spots['hvide-sande']);
  // total failure: nothing written, pointer untouched
  const ptrBefore = JSON.stringify(readStatus(store).dmi), filesBefore = readdirSync(join(store, 'dmi')).join();
  let threw = '';
  try { await buildDmi({ storeDir: store, nowMs: now + 6 * H, fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); }, killed: false, ...fast }); } catch (e) { threw = e.message; }
  add('D10 DMI ganz ausgefallen ⇒ Schritt rot, Speicher unverändert', /DMI lieferte für keinen Spot/.test(threw) && /nicht erreichbar/.test(threw) && JSON.stringify(readStatus(store).dmi) === ptrBefore && readdirSync(join(store, 'dmi')).join() === filesBefore, threw.slice(0, 120));
  const n1 = asked.length;
  const rk = await buildDmi({ storeDir: store, nowMs: now + 9 * H, fetchImpl: standIn(), killed: true, ...fast });
  add('D11 Kill-Schalter: kein Abruf, nichts geschrieben', !rk.built && asked.length === n1);
  // retention
  for (const s of ['202611180400', '202611180500', '202611180600']) writeFileSync(join(store, 'dmi', `${s}.json`), '{}');
  const removed = pruneDmi(store);
  add('D12 Aufbewahrung: die drei neuesten Dateien bleiben', readdirSync(join(store, 'dmi')).length === D.SEA_DMI_KEPT && removed.length === 2 && !removed.includes('202611180600.json'));
  // fetchDmi: 5xx then success
  let k = 0;
  const flaky = await fetchDmi('x', { fetchImpl: async () => (++k < 3 ? { status: 503, text: async () => 'busy' } : { status: 200, text: async () => '{"ok":1}' }), pauseMs: 0, backoffMs: () => 0, tries: 3 });
  add('D13 fetchDmi: 503, 503, dann 200 ⇒ die dritte Antwort', k === 3 && flaky.status === 200 && flaky.json.ok === 1);
  // the catalogue grew after a run was published ⇒ that run is due again, once
  {
    const s2 = join(tmp, 'store-rebuild'), RUNX = '2026111712', nowX = Date.UTC(2026, 10, 18, 3);
    mkdirSync(join(s2, 'static'), { recursive: true });
    mkdirSync(join(s2, 'spots'), { recursive: true });
    mkdirSync(join(s2, 'run', 'cwam', RUNX), { recursive: true });
    cpSync(join(FIX, 'static', 'spots.json'), join(s2, 'static', 'spots.json'));
    const de56 = Object.fromEntries(JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots.map((x) => [x.id, { v: {} }]));
    writeFileSync(join(s2, seaSpotsPath(RUNX)), JSON.stringify({ product: 'sea-spots-series', run: RUNX, spots: de56 }));
    writeFileSync(join(s2, seaRunJsonPath('cwam', RUNX)), JSON.stringify({ product: 'sea-run', run: RUNX, spotProblems: [] }));
    const want = SEA_PARAMS.length * SEA_MODELS.cwam.steps.length;
    const inv = new Map([[`cwam/${RUNX}`, { model: 'cwam', run: RUNX, files: new Map(Array.from({ length: want }, (_, i) => [`f/${i}`, { size: 1, at: nowX }])), last: nowX - 2 * H }]]);
    const before = dueRun(inv, s2, nowX);
    cpSync(join(DK, 'spots-dk.json'), join(s2, 'static', 'spots-dk.json'));
    const grown = dueRun(inv, s2, nowX);
    add('D15 Katalog wächst nach der Veröffentlichung ⇒ der Lauf ist noch einmal fällig, mit den acht fehlenden Spots; vorher nicht', before.run === null && /schon veröffentlicht/.test(before.reason) && grown.run === RUNX && grown.rebuild?.length === 8 && missingSpots(s2, RUNX).includes('gedser'), JSON.stringify(grown).slice(0, 160));
    writeFileSync(join(s2, 'status.json'), JSON.stringify({ schema: 1, product: 'sea-status', field: { model: 'cwam', rebuiltFor: RUNX, recent: [] }, text: {} }));
    const once = dueRun(inv, s2, nowX);
    add('D16 nur EIN Nachbau je Lauf (kein Neubau alle 15 Minuten, auch wenn er scheitert)', once.run === null && /schon veröffentlicht/.test(once.reason));
    writeFileSync(join(s2, 'status.json'), JSON.stringify({ schema: 1, product: 'sea-status', field: { model: 'cwam', recent: [] }, text: {} }));
    writeFileSync(join(s2, seaRunJsonPath('cwam', RUNX)), JSON.stringify({ product: 'sea-run', run: RUNX, spotProblems: CAT.map((x) => `${x.id}: hs[3] = 9999`) }));
    add('D17 ein Spot, den der Lauf selbst verworfen hat, gilt nicht als fehlend', missingSpots(s2, RUNX).length === 0 && dueRun(inv, s2, nowX).run === null);
  }
  // a store without the Danish file: nothing asked
  rmSync(join(store, 'static', 'spots-dk.json'));
  const n2 = asked.length;
  const rn = await buildDmi({ storeDir: store, nowMs: now + 12 * H, fetchImpl: standIn(), killed: false, ...fast });
  add('D14 ohne die dänische Katalogdatei fragt der Producer das DMI nicht (Rückfall der Phase)', !rn.built && asked.length === n2 && /kein dänischer Spot/.test(rn.reason));

  // --- E  page logic -------------------------------------------------------------------------------------------------
  const RUN = '2026111712', runMs = Date.UTC(2026, 10, 17, 12), N = SEA_SPOT_STEPS.length;
  const base = parseSpotsDoc(JSON.parse(readFileSync(join(FIX, `su-spots-${RUN}.json`), 'utf8')), RUN);
  const someId = Object.keys(base.series)[0];
  // the run as it will carry the Danish spots: waves there, wind columns empty outside the cube
  const spotsDoc = { ...base, series: { ...base.series, 'hvide-sande': { ...clone(base.series[someId]), wind: new Array(N).fill(null), gust: new Array(N).fill(null), windDir: new Array(N).fill(null) } }, quantiles: { ...(base.quantiles ?? {}), 'hvide-sande': { wind: {}, gust: {} } } };
  const merged = withDmiWind(spotsDoc, mergeSpotCatalogs(DE, CAT), doc1);
  const e = doc1.wind.spots['hvide-sande'];
  const i0 = (e.t0 - runMs) / H;
  const s = merged.series['hvide-sande'];
  add('E1 Wind außerhalb des Cubes: DMI-Reihe auf der Stundenachse des Laufs, Wert für Wert', merged.windBy?.['hvide-sande'] === 'dmi' && e.wind.every((q, kk) => i0 + kk < 0 || i0 + kk >= N || (s.wind[i0 + kk] === q / 10 && s.gust[i0 + kk] === (e.gust[kk] == null ? null : e.gust[kk] / 10) && s.windDir[i0 + kk] === e.dir[kk])), `ab Stunde ${i0}`);
  add('E2 Stunden, die das DMI nicht deckt, bleiben leer (vor dem Lauf, nach +60 h)', s.wind.slice(0, Math.max(0, i0)).every((x) => x == null) && s.wind.slice(i0 + e.wind.length).every((x) => x == null) && i0 + e.wind.length < N);
  add('E3 ohne Spanne: keine Quantile am DMI-Spot; die Welle und alle anderen Spots bleiben, wie sie sind', !merged.quantiles?.['hvide-sande'] && JSON.stringify(s.hs) === JSON.stringify(spotsDoc.series['hvide-sande'].hs) && Object.keys(base.series).every((id) => merged.series[id] === spotsDoc.series[id]));
  const none = withDmiWind(spotsDoc, mergeSpotCatalogs(DE, CAT), null), part = withDmiWind(spotsDoc, mergeSpotCatalogs(DE, CAT), { ...doc1, wind: { ...doc1.wind, spots: {} } });
  add('E4 fehlt die DMI-Datei oder der Spot darin ⇒ leere Windspalten („keine Daten“), nie ein alter Wert', [none, part].every((d) => d.series['hvide-sande'].wind.every((x) => x == null) && d.windBy['hvide-sande'] === 'dmi'));
  add('E5 Katalog ohne dänische Spots ⇒ das Dokument bleibt dasselbe Objekt', withDmiWind(base, DE, doc1) === base);
  const wl = doc1.wl.spots.gedser;
  add('E6 Wasserstand zur Stunde: genau der Stundenwert; vor dem Lauf und nach seinem Ende kein Wert', D.dmiWlAt(wl, wl.t0 + 7 * H + 59 * 60_000) === wl.cm[7] && D.dmiWlAt(wl, wl.t0 - H) === null && D.dmiWlAt(wl, wl.t0 + 121 * H) === null && D.dmiWlEnd(wl) === wl.t0 + 120 * H);
  add('E7 veraltet nach 12 h; kaputter Zeiger = keiner', !D.seaDmiStale(doc1.builtAt, now + 12 * H) && D.seaDmiStale(doc1.builtAt, now + 12 * H + 1) && D.seaDmiStale('quatsch', now)
    && D.dmiPointerOf({ dmi: { stamp: doc1.stamp, path: 'dmi/andere.json', builtAt: doc1.builtAt } }) === null && D.dmiPointerOf(null) === null && D.dmiPointerOf({}) === null);
  // loadDmi with a fetch stand-in for the data store
  const realFetch = globalThis.fetch;
  let storeAsked = 0;
  globalThis.fetch = async (url) => { storeAsked++; return String(url).endsWith(r1.path) ? new Response(JSON.stringify(doc1), { status: 200 }) : new Response('nf', { status: 404 }); };
  try {
    const ptr = { stamp: doc1.stamp, path: r1.path, builtAt: doc1.builtAt };
    const ok = await loadDmi(ptr, now + H);
    const a0 = storeAsked;
    const stale = await loadDmi(ptr, now + 13 * H);
    const noPtr = await loadDmi(null, now);
    add('E8 loadDmi: frische Datei ⇒ ok; älter als 12 h ⇒ „keine Daten“ ohne Abruf; kein Zeiger ⇒ keine', ok.state === 'ok' && !!ok.doc?.wl.spots.gedser && stale.state === 'stale' && stale.doc === null && storeAsked === a0 && noPtr === SEA_DMI_NONE && noPtr.doc === null);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...doc1, wl: { ...doc1.wl, spots: { gedser: { ...wl, cm: wl.cm.map(() => 9999) } } } }), { status: 200 });
    const broken = await loadDmi(ptr, now + H);
    add('E9 Gegenprobe: eine Datei außerhalb der Werteprüfung wird nicht gezeigt', broken.state === 'error' && broken.doc === null);
    // measurements
    const obsNow = MAN.obsNowMs;
    const obsFile = { wind_speed: 'obs-06058-wind.json', wind_dir: 'obs-06058-dir.json', wind_max: 'obs-06058-gust.json' };
    const obsAsked = [];
    globalThis.fetch = async (url) => { obsAsked.push(String(url)); const p = /parameterId=([a-z_]+)/.exec(String(url))[1]; return new Response(bytes(obsFile[p]), { status: 200 }); };
    const o = await loadDmiStationObs('06058', undefined, obsNow);
    const newest = (f, p) => J(f).features.filter((x) => x.properties.parameterId === p).sort((a, b) => Date.parse(b.properties.observed) - Date.parse(a.properties.observed))[0].properties;
    const nw = newest('obs-06058-wind.json', 'wind_speed'), ng = newest('obs-06058-gust.json', 'wind_max'), nd = newest('obs-06058-dir.json', 'wind_dir');
    add('E10 Messung: neuester Wert je Größe aus der echten Antwort, Quelle „dmi“', o?.src === 'dmi' && o.ffMs === nw.value && o.fxMs === ng.value && o.ddDeg === nd.value && o.t === Date.parse(nw.observed), JSON.stringify(o));
    add('E11 drei Abrufe an opendataapi.dmi.dk/v2/metObs, ohne Schlüssel', obsAsked.length === 3 && obsAsked.every((u) => u.startsWith(`${D.DMI_HOST}/v2/metObs/collections/observation/items?stationId=06058&parameterId=`) && !/api-key/i.test(u)));
    const late = await loadDmiStationObs('06058', undefined, obsNow + 2 * H);
    add('E12 Werte älter als eine Stunde ⇒ keine Messung (kein alter Wert)', late === null);
    globalThis.fetch = async () => new Response(bytes('metobs-06088-wind_speed-empty.json'), { status: 200 });
    add('E13 Station ohne Werte (Nordby, echte Antwort) ⇒ keine Messung', (await loadDmiStationObs('06088', undefined, obsNow)) === null);
    globalThis.fetch = async () => new Response('busy', { status: 429 });
    add('E14 DMI antwortet 429 ⇒ keine Messung, kein Fehler', (await loadDmiStationObs('06058', undefined, obsNow)) === null);
    const viaStation = [];
    globalThis.fetch = async (url) => { viaStation.push(String(url)); return new Response(bytes('metobs-06088-wind_speed-empty.json'), { status: 200 }); };
    await loadStationObs(HVS.station, HVS, undefined, obsNow);
    add('E15 eine DMI-Station wird nie über obs/v1 oder die DWD-POI-Datei gelesen', viaStation.length === 3 && viaStation.every((u) => u.startsWith(D.DMI_HOST)));
  } finally { globalThis.fetch = realFetch; }
} finally { rmSync(tmp, { recursive: true, force: true }); }

// --- F  source rules ---------------------------------------------------------------------------------------------------
{
  const src = (f) => readFileSync(join(ROOT, f), 'utf8');
  const dmiTs = src('src/sea/seaDmi.ts'), prod = src('scripts/sea/sea-dmi.mjs'), client = src('src/sea/seaClient.ts'), readout = src('src/sea/SeaReadout.tsx'), page = src('src/sea/SeaPage.tsx'), wf = src('scripts/sea/workflow-sea.yml');
  const hosts = (t) => [...t.matchAll(/https?:\/\/([a-z0-9.-]*dmi[a-z0-9.-]*)/g)].map((m) => m[1]);
  const apiHosts = [...hosts(dmiTs), ...hosts(prod), ...hosts(client)].filter((h) => h !== 'www.dmi.dk');
  add('F1 der einzige DMI-Datenhost ist opendataapi.dmi.dk (www.dmi.dk nur als Link)', apiHosts.length >= 1 && apiHosts.every((h) => h === 'opendataapi.dmi.dk'), [...new Set(apiHosts)].join(', '));
  const usesGrib = (t) => /['"`/]grib|\/stac|api-key|X-Gravitee/i.test(t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''));
  add('F2 kein /grib-Endpunkt, kein API-Schlüssel in Vertrag, Producer und Leser', !usesGrib(dmiTs) && !usesGrib(prod) && !usesGrib(client));
  add('F2b Gegenprobe: die Sonde erkennt einen /grib-Abruf und einen Schlüssel', usesGrib("fetch(`${DMI_HOST}/v1/forecastdata/grib/x`)") && usesGrib("url + '?api-key=' + k"));
  add('F3 Quellenvermerk „DMI, CC BY 4.0“ je Merkmal: Wasserstandskarte, Windzeile, Messzeile, Quellenliste der Karte', D.DMI_CREDIT === 'DMI, CC BY 4.0' && (readout.match(/DMI_CREDIT/g) ?? []).length >= 3 && /DMI_LICENCE_URL/.test(readout) && /credit: DMI_CREDIT/.test(page));
  add('F4 Hinweis zur Kalibrierung steht wörtlich im Vertrag und an der Windzeile', D.DK_FUSION_NOTE === 'Kalibrierung für Deutschland, in Dänemark nicht geprüft' && /DK_FUSION_NOTE/.test(readout));
  add('F5 dänischer Spot: kein deutscher Küsten-Warnstatus — findWarning verzweigt vor dem Küstenblock, die Karte verlinkt das DMI', /if \(spot\.country === 'DK'\) \{[\s\S]{0,700}coast: null/.test(readout) && readout.indexOf("spot.country === 'DK'") < readout.indexOf('doc.parts.coasts.find') && /DkNoWarnCard/.test(readout) && /DMI_WARN_URL/.test(readout) && /keinen amtlichen Warnstatus/.test(D.DK_NO_WARNING));
  const own = [D.DK_NO_WARNING, D.DMI_WL_REFERENCE_NOTE, D.DK_FUSION_NOTE, ...CAT.map((s) => { const t = seaSpotSeoText(s.id); return [t.h1, t.lead, ...t.body, ...t.facts.map((f) => f.text)].join(' '); })].join(' ');
  const safe = /\bsicher(e|er|es|en)?\b|ungefährlich|gefahrlos/i;
  add('F6 kein „sicher“ in den Texten der Phase (mit Gegenprobe)', !safe.test(own) && safe.test('Die Ausfahrt ist sicher.') && !/dangerouslySetInnerHTML/.test(readout));
  add('F7 jeder dänische Steckbrief nennt Dänemark, das DMI und dass es hier keinen Warnstatus gibt', CAT.every((s) => { const t = seaSpotSeoText(s.id); const all = [t.lead, ...t.body, ...t.facts.map((f) => f.text)].join(' '); return /Dänemark/.test(t.h1) && /DMI/.test(all) && /kein(en)? (amtlichen )?Warnstatus/.test(all) && t.official.href === D.DMI_WARN_URL; }));
  add('F8 Hvide Sande nennt den DMI-Wind, die übrigen den Hinweis zur Kalibrierung', /HARMONIE/.test(seaSpotSeoText('hvide-sande').lead) && !/buscosun Fusion \(/.test(seaSpotSeoText('hvide-sande').lead) && CAT.filter((s) => s.id !== 'hvide-sande').every((s) => seaSpotSeoText(s.id).lead.includes(D.DK_FUSION_NOTE)));
  // the step's commands without its comment lines (one of them explains why there is no `| tee`)
  const step = (/- name: DMI \(water level and wind for the Danish spots\)[\s\S]*?(?=\n      - name: )/.exec(wf)?.[0] ?? '').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  add('F9 Workflow: der DMI-Schritt ist continue-on-error, überspringt sich ohne Producer und reicht den Exit-Code durch (kein tee)', /continue-on-error: true/.test(step) && /sea-dmi\.mjs noch nicht auf main/.test(step) && /exit \$RC/.test(step) && !/\| tee/.test(step) && /steps\.dmi\.outcome == 'failure'/.test(wf));
  add('F10 kein Schalter für die Phase: weder Flag noch Query-Parameter', !/[?&]dk=|SEA_DK_LIVE|seaDkFrom/.test(src('src/sea/seaFlag.ts') + page + client));
  add('F11 die Seite stürzt nicht, wenn der Lauf einen Katalog-Spot noch nicht trägt (Reihe fehlt ⇒ Text statt Stunden)', /const noSeries = usable && !!spot && !spotsDoc!\.series\[spot\.id\]/.test(page) && /spot && usable && !noSeries \? Array\.from/.test(page) && /noData=\{noData \?\? noSeriesText\}/.test(page));
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? `  — ${c.detail}` : ''}`);
console.log(`\n  ${checks.length - failed.length}/${checks.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
