#!/usr/bin/env node
/**
 * Phase DK — records the fixtures of `verify:sea-dk` byte-exact from the real DMI service, with exactly the URLs the
 * producer (`sea-dmi.mjs`) and the page (`loadDmiStationObs`) build. Measurement tool, not product code.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/dk-record-fixtures.mjs
 *     --dk=<spots-dk.json> [--out=scripts/lib/fixtures/sea/dk]
 *
 * Writes one file per answer and `manifest.json` (url, HTTP status, bytes, sha256, time). Files that are already in the
 * manifest under `kept` (the recorded 429, the land point, the empty station) are not asked again — their hashes are
 * taken from the files as they lie there.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seaCellCentre } from '../../../src/sea/seaContract.ts';
import { DMI_WL_PARAM, DMI_WIND_COLLECTION, DMI_WIND_PARAMS, DMI_OBS_PARAMS, DMI_OBS_MAX_AGE_MS, dmiPositionUrl, dmiObsUrl } from '../../../src/sea/seaDmi.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = resolve(ROOT, String(args.out ?? 'scripts/lib/fixtures/sea/dk'));
mkdirSync(OUT, { recursive: true });
const cat = JSON.parse(readFileSync(resolve(String(args.dk)), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const files = {};
async function record(name, url, what) {
  for (let a = 1; a <= 4; a++) {
    await sleep(1500);
    const r = await fetch(url, { headers: { 'user-agent': 'buscosun-sea (fixture recording)', accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (r.status === 429 || r.status >= 500) { console.log(`${name}: HTTP ${r.status}, Versuch ${a}`); await sleep(8000 * a); continue; }
    writeFileSync(join(OUT, name), buf);
    files[name] = { what, url, status: r.status, bytes: buf.length, sha256: sha(buf), at: new Date().toISOString() };
    console.log(`${name}: ${r.status}, ${buf.length} B`);
    return;
  }
  throw new Error(`${name}: DMI antwortet nicht`);
}

for (const sp of cat.spots) {
  if (sp.dk?.wl?.from === 'dmi') await record(`wl-${sp.id}.json`, dmiPositionUrl(sp.dk.wl.coll, sp.dk.wl.lat, sp.dk.wl.lon, [DMI_WL_PARAM]), `DKSS ${sp.dk.wl.coll} am Punkt des Katalogs`);
  if (sp.dk?.wind === 'dmi') { const p = seaCellCentre('cwam', sp.cell.i, sp.cell.j); await record(`wind-${sp.id}.json`, dmiPositionUrl(DMI_WIND_COLLECTION, +p.lat.toFixed(5), +p.lon.toFixed(5), DMI_WIND_PARAMS), 'HARMONIE DINI an der Wasserzelle'); }
}
// Measurements of one station, as the page asks for them.
const nowMs = Date.now();
const st = cat.spots.find((s) => s.id === 'hvide-sande').station;
for (const [k, p] of Object.entries(DMI_OBS_PARAMS)) await record(`obs-${st.id}-${k}.json`, dmiObsUrl(st.id, p, nowMs - DMI_OBS_MAX_AGE_MS), `metObs ${st.name}, ${p}`);

// Answers kept from the step-0 measurement (they cannot be asked for on demand).
const kept = {
  'edr-429-dkss_idw.json': { what: 'EDR unter Last: HTTP 429, DMIs eigener Fehlerkörper (Messung 18.11. 01:45 UTC)', url: 'https://opendataapi.dmi.dk/v1/forecastedr/collections/dkss_idw/position?coords=POINT(10.53476%2054.85423)&crs=crs84&parameter-name=sea-mean-deviation&f=CoverageJSON', status: 429 },
  'edr-land-dkss_nsbs-hvide-sande.json': { what: 'DKSS Nordsee am Zellpunkt von Hvide Sande: 200, lauter null (Land im Modell)', url: 'https://opendataapi.dmi.dk/v1/forecastedr/collections/dkss_nsbs/position?coords=POINT(8.11807%2056.00419)&crs=crs84&parameter-name=sea-mean-deviation&f=CoverageJSON', status: 200 },
  'metobs-06088-wind_speed-empty.json': { what: 'metObs Nordby (Fanø): Station „Active“, aber kein Wert in 3 Stunden', url: 'https://opendataapi.dmi.dk/v2/metObs/collections/observation/items?stationId=06088&parameterId=wind_speed&datetime=2026-11-17T22:44:40Z/..&limit=100', status: 200 },
};
for (const [name, m] of Object.entries(kept)) {
  if (!existsSync(join(OUT, name))) throw new Error(`${name} fehlt`);
  const buf = readFileSync(join(OUT, name));
  files[name] = { ...m, bytes: buf.length, sha256: sha(buf), at: '2026-11-18T01:45:00Z', kept: true };
}
writeFileSync(join(OUT, 'spots-dk.json'), readFileSync(resolve(String(args.dk))));
files['spots-dk.json'] = { what: 'Katalog der dänischen Spots, wie build-spots.mjs ihn schrieb', bytes: readFileSync(join(OUT, 'spots-dk.json')).length, sha256: sha(readFileSync(join(OUT, 'spots-dk.json'))), at: cat.built };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ about: 'Fixtures von verify:sea-dk — jede Antwort byte-gleich vom echten DMI-Dienst (opendataapi.dmi.dk, CC BY 4.0), aufgezeichnet von scripts/sea/spike/dk-record-fixtures.mjs.', recordedAt: new Date(nowMs).toISOString(), obsNowMs: nowMs, files }, null, 1) + '\n');
console.log(`manifest.json: ${Object.keys(files).length} Dateien`);
