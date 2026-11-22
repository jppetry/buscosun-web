#!/usr/bin/env node
/**
 * Phase GN — records the fixtures of `verify:glacier-snow` in `scripts/lib/fixtures/glacier/snow/` (`audit/gletscher-snowgrid.md`):
 * real answers of the GeoSphere API, stored byte for byte, for ONE small area at the main ridge of the Ötztal Alps (Hintereisferner,
 * with cells without a value across the border), and the real catalogue entries and L1 outlines of the Austrian glaciers in it.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/make-snow-fixture.mjs \
 *        --catalog=<static catalog.json> --outlines=<dir with <region>-L1.json> [--end=<yyyymmdd, default: newest day of the dataset>]
 *
 * Requests: the metadata, one bbox of the grid for one day, one time-series request for the last seven days (both quantities) and
 * one for the reference years (snow depth) — four requests to the GeoSphere API.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SNOWGRID_METADATA_URL, SNOW_BACKFILL_DAYS, SNOW_REF_YEARS, buildSnowCells, parseSnowAnswer, snowDayMs, snowDayOf, snowEndDay, snowSeriesUrl } from '../../src/glacier/glacierSnowContract.ts';
import { snowGridUrl } from './snow.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'lib', 'fixtures', 'glacier', 'snow');
const UA = 'buscosun-glacier-snow (+https://buscosun.com)';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
for (const k of ['catalog', 'outlines']) if (!args[k] || args[k] === true) { console.error(`--${k}=<Pfad> fehlt`); process.exit(2); }
/** The area: south, west, north, east. The glaciers of the extract lie at least a cell's width inside it. */
const BBOX = [46.76, 10.73, 46.84, 10.85];
const MARGIN = [0.014, 0.02];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const grab = async (url) => { const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(300_000) }); if (!res.ok) throw new Error(`${url.slice(0, 120)}: HTTP ${res.status}`); return Buffer.from(await res.arrayBuffer()); };

const catalog = JSON.parse(readFileSync(resolve(String(args.catalog)), 'utf8'));
const glaciers = catalog.glaciers.filter((g) => g.country === 'AT' && g.lat > BBOX[0] + MARGIN[0] && g.lat < BBOX[2] - MARGIN[0] && g.lon > BBOX[1] + MARGIN[1] && g.lon < BBOX[3] - MARGIN[1]);
if (glaciers.length < 4) { console.error(`nur ${glaciers.length} Gletscher im Ausschnitt`); process.exit(1); }
const outlines = {};
for (const region of [...new Set(glaciers.map((g) => g.region))].sort()) {
  const f = JSON.parse(readFileSync(join(String(args.outlines), `${region}-L1.json`), 'utf8'));
  outlines[region] = { ...f, features: f.features.filter((x) => glaciers.some((g) => g.id === x.properties.id)) };
}
mkdirSync(OUT, { recursive: true });
const recorded = { note: 'GN fixtures: answers of the GeoSphere API for SNOWGRID Klima v2.1, bodies stored byte for byte', recordedAt: new Date().toISOString(), bbox: BBOX, files: {} };
const save = (name, url, body) => { writeFileSync(join(OUT, name), body); recorded.files[name] = { url, bytes: body.length, sha256: sha(body) }; console.log(`${name}: ${body.length} B`); };

const metaBody = await grab(SNOWGRID_METADATA_URL);
save('metadata.json', SNOWGRID_METADATA_URL, metaBody);
const end = args.end && args.end !== true ? String(args.end) : snowEndDay(JSON.parse(metaBody.toString('utf8')));
await sleep(400);
const gridUrl = snowGridUrl(end, BBOX);
const gridBody = await grab(gridUrl);
save('grid.json', gridUrl, gridBody);
const grid = parseSnowAnswer(JSON.parse(gridBody.toString('utf8'))).series.filter((c) => c.hs[0] != null).map((c) => ({ lat: c.lat, lon: c.lon }));
const outlineOf = (id) => { for (const f of Object.values(outlines)) { const x = f.features.find((y) => y.properties.id === id); if (x) return x.geometry.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry.coordinates; } return undefined; };
const cells = buildSnowCells(glaciers.map((g) => ({ id: g.id, region: g.region, lat: g.lat, lon: g.lon, outline: outlineOf(g.id) })), grid, { file: `${catalog.build}.1`, build: catalog.build, builtAt: recorded.recordedAt, gridDay: end });
const start = snowDayOf(new Date(snowDayMs(end) - (SNOW_BACKFILL_DAYS - 1) * 86_400_000).toISOString());
await sleep(400);
const weekUrl = snowSeriesUrl(cells.cells, start, end);
save('week.json', weekUrl, await grab(weekUrl));
await sleep(400);
const refUrl = snowSeriesUrl(cells.cells, `${SNOW_REF_YEARS[0]}0101`, `${SNOW_REF_YEARS[1]}1231`, ['snow_depth']);
save('ref.json', refUrl, await grab(refUrl));
writeFileSync(join(OUT, 'glaciers.json'), JSON.stringify({
  note: `GN fixture: real excerpt — the ${glaciers.length} Austrian glaciers of the catalogue of build ${catalog.build} inside ${BBOX.join(',')} (less a margin) and their L1 outlines, entries unchanged`,
  build: catalog.build, glaciers, outlines,
}) + '\n');
recorded.end = end; recorded.start = start; recorded.cells = cells.report;
writeFileSync(join(OUT, 'recorded.json'), JSON.stringify(recorded, null, 1) + '\n');
console.log(JSON.stringify(cells.report), `${start}–${end}`);
