#!/usr/bin/env node
/**
 * Phase WT — records the fixtures of `verify:sea-watertemp` byte-exact from the real services, with exactly the URLs the
 * producer (`sea-dmi.mjs`), the page (`loadWtObs`) and the archive build. Measurement tool, not product code.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/wt-record-fixtures.mjs
 *     [--cat=scripts/lib/fixtures/sea/wt/watertemp.json] [--out=scripts/lib/fixtures/sea/wt]
 *
 * Writes one file per answer and `manifest.json` (url, HTTP status, bytes, sha256, time). Recorded:
 *   instances-<coll>.json     the runs of every DKSS sub-model the chosen spots use (DMI EDR)
 *   wt-<spot>.json            the pinned position answer of a handful of spots (one per sub-model, a Wadden point, a ring point)
 *   wt-land-<spot>.json       a model point on land: the spot's own cell in a sub-model that has no water there (200, all null)
 *   obs-wsv-<id>.json         PEGELONLINE `WT` of one station over the page's days (a 5-minute station — the 1-minute ones weigh 400 KB)
 *   obs-wsv-<id>-pt6h.json    six hours of a 1-minute station (the thinning to whole hours on real 1-minute values)
 *   obs-wsv-<id>-stale.json   a station whose last value is days old
 *   obs-dmi-<id>.json         DMI oceanObs `tw` of one station over the page's days
 *   obs-dmi-<id>-empty.json   a DMI station that is „Active“ and delivers no `tw`
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seaCellCentre } from '../../../src/sea/seaContract.ts';
import { WT_PARAM, WSV_HOST, dmiInstancesUrl, dmiInstancePositionUrl, dmiNewestInstance, wtObsUrl } from '../../../src/sea/seaWaterTemp.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = resolve(ROOT, String(args.out ?? 'scripts/lib/fixtures/sea/wt'));
mkdirSync(OUT, { recursive: true });
const catFile = resolve(ROOT, String(args.cat ?? 'scripts/lib/fixtures/sea/wt/watertemp.json'));
const cat = JSON.parse(readFileSync(catFile, 'utf8'));
const FIX = resolve(ROOT, 'scripts/lib/fixtures/sea');
const spots = [...JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots, ...JSON.parse(readFileSync(join(FIX, 'dk', 'spots-dk.json'), 'utf8')).spots];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const files = {};
async function record(name, url, what) {
  for (let a = 1; a <= 4; a++) {
    if (url.includes('dmi.dk')) await sleep(1500);
    const r = await fetch(url, { headers: { 'user-agent': 'buscosun-sea (fixture recording)', accept: 'application/json' }, signal: AbortSignal.timeout(90_000) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (r.status === 429 || r.status >= 500) { console.log(`${name}: HTTP ${r.status}, Versuch ${a}`); await sleep(8000 * a); continue; }
    writeFileSync(join(OUT, name), buf);
    files[name] = { what, url, status: r.status, bytes: buf.length, sha256: sha(buf), at: new Date().toISOString() };
    console.log(`${name}: ${r.status}, ${buf.length} B`);
    return buf;
  }
  throw new Error(`${name}: keine Antwort`);
}

// The spots of the verifier's small catalogue: one per sub-model, a Wadden point, a point found in a ring.
const PICK = String(args.spots ?? 'helgoland,sylt-list,buesum,gedser,langeland-bagenkop,middelfart,hvide-sande,elbe-wittenbergen').split(',');
const colls = [...new Set(PICK.map((id) => cat.spots[id]?.model?.coll).filter(Boolean))].sort();
const inst = {};
for (const coll of colls) inst[coll] = dmiNewestInstance(JSON.parse((await record(`instances-${coll}.json`, dmiInstancesUrl(coll), `DKSS ${coll}: Liste der Läufe`)).toString('utf8')));
for (const id of PICK) {
  const m = cat.spots[id]?.model;
  if (!m) { console.log(`${id}: kein Modellpunkt im Katalog`); continue; }
  await record(`wt-${id}.json`, dmiInstancePositionUrl(m.coll, inst[m.coll].id, m.lat, m.lon, [WT_PARAM]), `DKSS ${m.coll}, Lauf ${inst[m.coll].id}, am Punkt des Katalogs`);
}
// A model point on land: a spot whose own cell carries no water in its sub-model (measured in step 0) — asked at the cell.
const landId = String(args.land ?? 'kiel-schilksee');
const landSpot = spots.find((s) => s.id === landId);
const landColl = String(args['land-coll'] ?? 'dkss_idw');
const lc = seaCellCentre('cwam', landSpot.cell.i, landSpot.cell.j);
if (!inst[landColl]) inst[landColl] = dmiNewestInstance(JSON.parse((await record(`instances-${landColl}.json`, dmiInstancesUrl(landColl), `DKSS ${landColl}: Liste der Läufe`)).toString('utf8')));
await record(`wt-land-${landId}.json`, dmiInstancePositionUrl(landColl, inst[landColl].id, +lc.lat.toFixed(5), +lc.lon.toFixed(5), [WT_PARAM]), `DKSS ${landColl} an der Wasserzelle von ${landId}: 200, lauter null (Land im Modell)`);

// Measurements, as the page asks for them.
const nowMs = Date.now();
const st = (key) => cat.stations.find((s) => s.key === key);
const wsv5 = st(String(args.wsv ?? 'wsv:71160198')), dmiSt = st(String(args.dmi ?? 'dmi:31623'));
await record(`obs-${wsv5.key.replace(':', '-')}.json`, wtObsUrl(wsv5, nowMs), `PEGELONLINE WT ${wsv5.name}, die Tage der Seite`);
await record(`obs-${dmiSt.key.replace(':', '-')}.json`, wtObsUrl(dmiSt, nowMs), `DMI oceanObs tw ${dmiSt.name}, die Tage der Seite`);
const wsv1 = st(String(args.wsv1 ?? 'wsv:9570070'));
await record(`obs-${wsv1.key.replace(':', '-')}-pt6h.json`, `${WSV_HOST}/webservices/rest-api/v2/stations/${wsv1.id}/WT/measurements.json?start=PT6H`, `PEGELONLINE WT ${wsv1.name}, sechs Stunden in 1-min-Werten`);
const staleId = String(args.stale ?? '5940060');
await record(`obs-wsv-${staleId}-stale.json`, wtObsUrl({ net: 'wsv', id: staleId }, nowMs), 'PEGELONLINE WT Fahrenholz UP: der letzte Wert ist Tage alt');
const emptyId = String(args.empty ?? '31616');
await record(`obs-dmi-${emptyId}-empty.json`, wtObsUrl({ net: 'dmi', id: emptyId }, nowMs), 'DMI oceanObs Gedser Havn I: Station „Active“, aber kein tw in fünf Tagen');

const catBuf = readFileSync(catFile);
files['watertemp.json'] = { what: 'Katalog der Wassertemperatur, wie build-watertemp.mjs ihn schrieb', bytes: catBuf.length, sha256: sha(catBuf), at: cat.built };
// The season curves, as build-wtemp-season.mjs wrote them (built before the recording; not asked for here).
if (existsSync(join(OUT, 'wtemp-season.json'))) {
  const sb = readFileSync(join(OUT, 'wtemp-season.json'));
  files['wtemp-season.json'] = { what: 'Jahresgang an den Stationen mit fünf vollen Jahren, wie build-wtemp-season.mjs ihn schrieb', bytes: sb.length, sha256: sha(sb), at: JSON.parse(sb.toString('utf8')).built };
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  about: 'Fixtures von verify:sea-watertemp — jede Antwort byte-gleich vom echten Dienst (opendataapi.dmi.dk, CC BY 4.0; pegelonline.wsv.de, DL-DE Zero 2.0), aufgezeichnet von scripts/sea/spike/wt-record-fixtures.mjs.',
  recordedAt: new Date(nowMs).toISOString(), obsNowMs: nowMs, spots: PICK, land: { id: landId, coll: landColl },
  runs: Object.fromEntries(Object.entries(inst).map(([c, i]) => [c, i])), files,
}, null, 1) + '\n');
console.log(`manifest.json: ${Object.keys(files).length} Dateien`);
