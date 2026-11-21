#!/usr/bin/env node
/**
 * Phase BS — records the fixtures of `verify:sea-lakes` byte-exact into `scripts/lib/fixtures/sea/lakes/` and writes the
 * manifest (sha256, bytes, where each file came from). Three kinds of files:
 *
 *   copied    answers the step-0 measurement stored (`audit/seewetter-binnenseen/spike/raw/`), the outlines the catalogue
 *             was cut from (`--cache`), three CAP messages with lake cells kept from the hourly states of the DWD district
 *             file (`--cap=<dir>`), the catalogue as built (`--cat=<dir>`)
 *   fetched   answers asked now with the URLs of the product code: WSV `currentmeasurement.json` (W, WT), one DLM250
 *             answer in a small box (Steinhuder Meer)
 *   excerpt   `obs-latest-lakes.json`: the entries of the catalogue's wind stations cut from `obs/v1/latest.json` (565 KB);
 *             the manifest carries the sha256 of the whole answer and says that the file is an excerpt
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/lake-record-fixtures.mjs
 *     --cache=<outline cache> --cat=<dir with spots-lakes.json> --cap=<dir with the three example XML>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { wsvCurrentUrl } from '../../../src/sea/seaLakes.ts';
import { outlineUrl } from '../build-lake-spots.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = join(ROOT, 'scripts/lib/fixtures/sea/lakes');
const RAW = join(ROOT, 'audit/seewetter-binnenseen/spike/raw');
const UA = 'buscosun-sea (https://buscosun.com; audit/seewetter-binnenseen.md)';
const sha = (b) => createHash('sha256').update(b).digest('hex');
mkdirSync(OUT, { recursive: true });
const old = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : { files: {} };
const man = { about: 'Fixtures von verify:sea-lakes — byte-gleich aufgezeichnete Antworten (Phase BS, audit/seewetter-binnenseen.md). Nicht von Hand ändern; neu aufzeichnen mit scripts/sea/spike/lake-record-fixtures.mjs.', recordedAt: new Date().toISOString(), files: {} };
const put = (name, buf, meta) => { writeFileSync(join(OUT, name), buf); man.files[name] = { sha256: sha(buf), bytes: buf.length, ...meta }; console.log(`${name.padEnd(44)} ${String(buf.length).padStart(7)} B  ${meta.kind}`); };
const get = async (url) => { const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };

const src = JSON.parse(readFileSync(join(ROOT, 'scripts/sea/lakes-src.json'), 'utf8'));
const lake = (id) => src.lakes.find((l) => l.id === id);
const spotsOf = (id) => src.spots.filter((s) => s.lake === id);

// The cell geometry recorded on 21.11.2026 stays as it is (the builder reads this very file).
const cells = readFileSync(join(OUT, 'dwd-warngebiete-binnenseen.json'));
put('dwd-warngebiete-binnenseen.json', cells, { kind: 'copied', url: 'https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=dwd:Warngebiete_Binnenseen&outputFormat=application/json', recorded: old.files['dwd-warngebiete-binnenseen.json']?.recorded ?? '2026-11-21T08:45Z' });

for (const [name, url] of [
  ['lindas-lake-stations.json', 'https://lindas.admin.ch/query (POST, SPARQL of lake-probe.mjs)'],
  ['alplakes-1d-point-murten.json', 'https://alplakes-api.eawag.ch/simulations/1d/point/simstrat/murten/<start>/<end>/1?variables=T'],
  ['alplakes-preflight.txt', 'https://alplakes-api.eawag.ch/simulations/1d/metadata (OPTIONS, Origin https://buscosun.com) — answer 400'],
  ['wsv-mueritz.json', 'https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/bd317edd-214a-4e11-a9dc-3cc71a2907c3.json?includeTimeseries=true&includeCurrentMeasurement=true'],
]) put(name, readFileSync(join(RAW, name)), { kind: 'copied', url, from: 'audit/seewetter-binnenseen/spike/raw' });

const cache = resolve(String(args.cache));
for (const id of ['traunsee', 'murtensee']) put(`outline-${id}.json`, readFileSync(join(cache, `outline-${id}.json`)), { kind: 'copied', url: outlineUrl(lake(id), spotsOf(id)), source: lake(id).outline });
// DLM250 in a small box around the Steinhuder Meer (the builder's own box answers with 390 KB).
const dlmUrl = 'https://sgx.geodatenzentrum.de/wfs_dlm250?service=WFS&version=2.0.0&request=GetFeature&TYPENAMES=dlm250:objart_44006_f&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&COUNT=5000&BBOX=9.250,52.420,9.420,52.520,EPSG:4326';
put('outline-steinhuder-meer.json', await get(dlmUrl), { kind: 'fetched', url: dlmUrl, source: 'dlm250' });

const capDir = resolve(String(args.cap));
for (const f of readdirSync(capDir).filter((x) => x.endsWith('.xml')).sort()) {
  const ii = /example-(II\d+)-/.exec(f)?.[1] ?? 'II';
  put(`cap-${ii}.xml`, readFileSync(join(capDir, f)), { kind: 'copied', url: 'https://opendata.dwd.de/weather/alerts/cap/DISTRICT_DWD_STAT/Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip (Stundenstände 19.–21.11.2026)', message: f.replace(/^example-II\d+-/, '') });
}

put('wsv-current-wt-waren.json', await get(wsvCurrentUrl(lake('mueritz').wsv.uuid, 'WT')), { kind: 'fetched', url: wsvCurrentUrl(lake('mueritz').wsv.uuid, 'WT') });
put('wsv-current-w-konstanz.json', await get(wsvCurrentUrl(lake('bodensee').wsv.uuid, 'W')), { kind: 'fetched', url: wsvCurrentUrl(lake('bodensee').wsv.uuid, 'W') });

const catFile = join(resolve(String(args.cat)), 'spots-lakes.json');
const cat = readFileSync(catFile);
put('spots-lakes.json', cat, { kind: 'copied', from: 'scripts/sea/build-lake-spots.mjs --out', note: 'der Katalog, wie er gebaut und ins Daten-Repo gelegt wurde' });

const latestUrl = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/obs/v1/latest.json';
const latestBuf = await get(latestUrl), latest = JSON.parse(latestBuf.toString('utf8'));
const ids = [...new Set(JSON.parse(cat.toString('utf8')).spots.map((s) => s.lake.stations.wind?.id).filter(Boolean))].sort();
const excerpt = { schema: latest.schema, kind: latest.kind, builtAt: latest.builtAt, count: ids.length, stations: Object.fromEntries(ids.map((id) => [id, latest.stations[id]]).filter(([, e]) => e)) };
put('obs-latest-lakes.json', Buffer.from(JSON.stringify(excerpt) + '\n'), { kind: 'excerpt', url: latestUrl, of: { sha256: sha(latestBuf), bytes: latestBuf.length }, note: `Ausschnitt: die Einträge der ${ids.length} Windstationen des Seekatalogs, unverändert aus der Antwort übernommen` });

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(man, null, 1) + '\n');
console.log(`manifest.json: ${Object.keys(man.files).length} Dateien, ${Object.values(man.files).reduce((a, f) => a + f.bytes, 0)} B`);
