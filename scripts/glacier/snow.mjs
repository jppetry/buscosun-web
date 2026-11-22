#!/usr/bin/env node
/**
 * Phase GN — producer of the snow analysis per Austrian glacier (`audit/gletscher-snowgrid.md`, contract
 * `src/glacier/glacierSnowContract.ts`): "SNOWGRID Klima v2.1" of GeoSphere Austria (CC BY 4.0, DOI 10.60669/fsxx-6977) through its
 * API — never the raster files, and no raster is ever written. Three kinds of run:
 *
 *   --mode=cells   ONCE per catalogue build, locally: one day of the grid over the Austrian glaciers → which cells belong to which
 *                  glacier (centre inside the L1 outline, else the nearest cell with data)   → <out>/snow/static/cells/<build>.<n>.json
 *   --mode=clim    ONCE per cells file, locally: the reference years 1991–2020 of every cell → per glacier and calendar day the
 *                  percentiles of the snow depth                                          → <out>/snow/static/clim/<build>.<n>/<region>.json
 *   --mode=day     daily (workflow `glacier-snow.yml`): the newest day of the dataset and the days of the last week the store does
 *                  not hold yet → <out>/snow/<yyyymmdd>.json, README, and the two patches (`index.snow`, `status.lines.snow`).
 *                  Published days of that week are read again and compared: a difference is reported (`revised`), not written.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/snow.mjs --mode=day \
 *        --store=<glacier/v1 of a buscosun-data checkout> --out=<dir> --patch=<dir> [--now=<ISO>]
 *   … --mode=cells --store=<…> --out=<dir>            … --mode=clim --store=<…> --out=<dir> [--cells=<cells file to read instead of the store's>]
 *
 * The output is a tree for the glacier publisher (line `snow`); nothing here pushes. A day is published once. Swiss and German
 * glaciers have no entry (the grid covers Austria). buscosun Fusion is not involved and nothing is written to `obs/v1`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GLACIER_SNOW_CELLS_DIR, GLACIER_SNOW_CLIM_DIR, GLACIER_SNOW_DAY_MAX_BYTES, GLACIER_SNOW_DAY_RE, GLACIER_SNOW_DIR, GLACIER_SNOW_KEEP_DAYS, GLACIER_SNOW_SOURCE, GLACIER_SNOW_STATIC_RE,
  SNOWGRID_GRID_URL, SNOWGRID_MAX_VALUES_PER_REQUEST, SNOWGRID_METADATA_URL, SNOW_BACKFILL_DAYS, SNOW_CLIM_DAYS, SNOW_CLIM_PCTS, SNOW_COVERAGE, SNOW_COVERAGE_NOTE, SNOW_LIMITS,
  SNOW_MAX_REQUESTS_PER_RUN, SNOW_NEAREST_MAX_KM, SNOW_ORIGIN_NOTE, SNOW_POINTS_PER_REQUEST, SNOW_REF_YEARS, SNOW_REQUEST_PAUSE_MS, buildSnowCells, buildSnowDay, glacierSnowCellsPath,
  glacierSnowClimPath, glacierSnowDayPath, parseSnowAnswer, snowCellKey, snowCellsProblems, snowClimRow, snowDayMs, snowDayOf, snowDayProblems, snowEndDay, snowIsoOf, snowMmdd,
  snowRefValues, snowSeriesUrl,
} from '../../src/glacier/glacierSnowContract.ts';

const SELF = fileURLToPath(import.meta.url);
const UA = 'buscosun-glacier-snow (+https://buscosun.com)';
const RAW_STATIC = 'https://raw.githubusercontent.com/jppetry/buscosun-data/glacier/glacier/v1/static';
export const snowCatalogUrl = (build) => `${RAW_STATIC}/${build}/catalog.json`;
export const snowOutlineUrl = (build, region) => `${RAW_STATIC}/${build}/outline/${region}-L1.json`;
export const snowGridUrl = (day, bbox) => `${SNOWGRID_GRID_URL}?parameters=snow_depth&start=${snowIsoOf(day)}&end=${snowIsoOf(day)}&bbox=${bbox.join(',')}&output_format=geojson`;
/** Largest number of grid cells one bbox request of the cells run asks for (set; the service allows 1 000 000 values). */
export const SNOW_GRID_CELLS_PER_REQUEST = 25_000;
const DAY_MS = 86_400_000;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o) + '\n'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET a JSON document: deadline, ONE retry after a pause; throws with the status or the reason. */
export async function getJson(url, { fetchImpl = fetch, timeoutMs = 120_000, retries = 1, pauseMs = 3000 } = {}) {
  let last = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { last = e; if (i < retries) await sleep(pauseMs); }
  }
  throw new Error(`${url.slice(0, 160)}: ${last?.message ?? last}`);
}

/** The README that travels with the data (CC BY 4.0: credit, licence and what was changed next to the data). Generated from the contract. */
export function snowReadme() {
  const s = GLACIER_SNOW_SOURCE;
  return [
    '# glacier/v1/snow — Schneeanalyse je österreichischem Gletscher',
    '',
    'Täglich die Schneehöhe und der Schneewasserwert der Analyse SNOWGRID je Gletscher, dazu die Lage des Tageswerts unter den Wintern',
    `${SNOW_REF_YEARS[0]}–${SNOW_REF_YEARS[1]}. Eigenes Produkt der Gletscher-Linie: **buscosun Fusion liest diese Dateien nicht**, und sie stehen nicht in \`obs/v1\`.`,
    '',
    `**${SNOW_ORIGIN_NOTE}**`,
    '',
    `**Abdeckung:** ${SNOW_COVERAGE_NOTE} (\`coverage: '${SNOW_COVERAGE}'\`)`,
    '',
    '| Datei | Inhalt |',
    '|---|---|',
    `| \`<yyyymmdd>.json\` | ein Tag: je Gletscher \`[Schneehöhe cm, Schneewasserwert mm, Lage 0–100 oder null, Kennzeichen]\` (Kennzeichen −1 = unter jedem Referenzjahr, 1 = über jedem); \`missing\` nennt Gletscher ohne Wert mit Grund; ${GLACIER_SNOW_KEEP_DAYS} Tage aufbewahrt, keine Ablage (die Quelle hält die ganze Reihe) |`,
    '| `static/cells/<build>.<n>.json` | welche Gitterzellen zu welchem Gletscher gehören: Zellen, deren Mittelpunkt im Umriss liegt (`how: outline`), sonst die nächste Zelle mit Wert zum Katalogpunkt (`how: nearest`, höchstens ' + SNOW_NEAREST_MAX_KM + ' km) |',
    `| \`static/clim/<build>.<n>/<region>.json\` | je Gletscher und Kalendertag (366) die Perzentile ${SNOW_CLIM_PCTS.join(', ')} der Schneehöhe der Jahre ${SNOW_REF_YEARS[0]}–${SNOW_REF_YEARS[1]} in cm, ungeglättet; 29.02.: der Tag selbst in Schaltjahren, sonst das Mittel aus 28.02. und 01.03. |`,
    '',
    'Das Raster selbst liegt hier nicht.',
    '',
    '## Quelle und Lizenz',
    '',
    `- **${s.note}** — ${s.label}. Lizenz: [${s.licence}](${s.licenceUrl}). Quelle: ${s.url}, ${s.doi}. Geändert: ${s.changes}.`,
    '',
    '## Einheiten und Grenzen',
    '',
    `Schneehöhe in cm (die Quelle liefert m), Schneewasserwert in mm (kg/m²). Ein Wert außerhalb ${SNOW_LIMITS.hs[0]} … ${SNOW_LIMITS.hs[1]} cm bzw. ${SNOW_LIMITS.swe[0]} … ${SNOW_LIMITS.swe[1]} mm steht nicht im Dokument.`,
    'Je Gletscher EIN Wert: das Mittel seiner Zellen. Ein Gitterwert steht für ein Gebiet, nicht für einen Punkt; Unterschiede zwischen Nachbarzellen sind keine Auflösung.',
    'Die meisten Gletscher sind kleiner als eine Zelle und lesen genau eine; benachbarte kleine Gletscher teilen sich oft dieselbe Zelle und tragen dann denselben Wert.',
    '',
    'Code: `buscosun-web` `scripts/glacier/snow.mjs`, Vertrag `src/glacier/glacierSnowContract.ts`.',
    '',
  ].join('\n');
}

const newestStatic = (dir) => (existsSync(dir) ? readdirSync(dir).map((f) => f.replace(/\.json$/, '')).filter((v) => GLACIER_SNOW_STATIC_RE.test(v)).sort((a, b) => { const x = GLACIER_SNOW_STATIC_RE.exec(a), y = GLACIER_SNOW_STATIC_RE.exec(b); return x[1] === y[1] ? Number(x[2]) - Number(y[2]) : x[1] < y[1] ? -1 : 1; }).pop() ?? null : null);
const nextStatic = (dir, build) => { const cur = newestStatic(dir), m = cur ? GLACIER_SNOW_STATIC_RE.exec(cur) : null; return `${build}.${m && m[1] === build ? Number(m[2]) + 1 : 1}`; };

/**
 * `--mode=cells`: the cells of every Austrian glacier of the store's catalogue build. Requests: the metadata, the catalogue and
 * the outlines of our own repo, and as many bbox requests of ONE day of the grid as `SNOW_GRID_CELLS_PER_REQUEST` asks for.
 */
export async function runSnowCells({ storeDir, outDir, nowMs = Date.now(), get = (u) => getJson(u), pauseMs = SNOW_REQUEST_PAUSE_MS, log = () => {} }) {
  const index = readJson(join(storeDir, 'index.json'));
  const build = index?.static?.build;
  if (!build) throw new Error('index.json ohne static.build');
  const day = snowEndDay(await get(SNOWGRID_METADATA_URL));
  const glaciers = (await get(snowCatalogUrl(build))).glaciers.filter((g) => g.country === SNOW_COVERAGE);
  if (!glaciers.length) throw new Error('Katalog ohne österreichische Gletscher');
  const outlines = new Map();
  for (const region of [...new Set(glaciers.map((g) => g.region))].sort()) {
    const doc = await get(snowOutlineUrl(build, region));
    for (const f of doc?.features ?? []) { const c = f?.geometry?.coordinates; if (f?.properties?.id && Array.isArray(c)) outlines.set(f.properties.id, f.geometry.type === 'Polygon' ? [c] : c); }
  }
  // bbox of the glaciers, widened by ~3 km, cut into west–east tiles of at most SNOW_GRID_CELLS_PER_REQUEST cells
  const s = Math.min(...glaciers.map((g) => g.lat)) - 0.03, n = Math.max(...glaciers.map((g) => g.lat)) + 0.03, w = Math.min(...glaciers.map((g) => g.lon)) - 0.05, e = Math.max(...glaciers.map((g) => g.lon)) + 0.05;
  const kmNS = (n - s) * 111.2, kmWE = (e - w) * 111.2 * Math.cos(((s + n) / 2) * Math.PI / 180);
  const tiles = Math.max(1, Math.ceil((kmNS * kmWE) / SNOW_GRID_CELLS_PER_REQUEST));
  const grid = new Map();
  let requests = 0;
  for (let i = 0; i < tiles; i++) {
    const bbox = [s, w + ((e - w) * i) / tiles, n, w + ((e - w) * (i + 1)) / tiles].map((x) => Math.round(x * 1e4) / 1e4);
    if (requests++) await sleep(pauseMs);
    const ans = parseSnowAnswer(await get(snowGridUrl(day, bbox)));
    for (const c of ans.series) if (c.hs[0] != null) grid.set(c.key, { lat: c.lat, lon: c.lon });
    log(`Raster ${i + 1}/${tiles}: ${ans.series.length} Zellen (${bbox.join(',')})`);
  }
  const file = nextStatic(join(storeDir, GLACIER_SNOW_CELLS_DIR), build);
  const doc = buildSnowCells(glaciers.map((g) => ({ id: g.id, region: g.region, lat: g.lat, lon: g.lon, outline: outlines.get(g.id) })), [...grid.values()], { file, build, builtAt: new Date(nowMs).toISOString(), gridDay: day });
  const bad = snowCellsProblems(doc);
  if (bad.length) throw new Error(`Zellendatei fehlerhaft: ${bad.slice(0, 3).join('; ')}`);
  writeJson(join(outDir, glacierSnowCellsPath(file)), doc);
  return { file, gridDay: day, gridCells: grid.size, gridRequests: requests, ...doc.report };
}

/** The cells document a run reads: `--cells=<file>`, else the pointer's, else the newest of the store. */
function cellsOf(storeDir, index, cellsPath) {
  if (cellsPath) return readJson(cellsPath);
  const v = index?.snow?.cells ?? newestStatic(join(storeDir, GLACIER_SNOW_CELLS_DIR));
  if (!v || !existsSync(join(storeDir, glacierSnowCellsPath(v)))) throw new Error('keine Zellendatei im Speicher — zuerst `--mode=cells` laufen lassen und veröffentlichen');
  return readJson(join(storeDir, glacierSnowCellsPath(v)));
}

/** All cells of a cells document for a span of days, in chunks; returns `{ days, byKey }` and counts the requests in `count`. */
async function fetchCells(cells, startDay, endDay, { get, perRequest, params, pauseMs, count, cap }) {
  const byKey = new Map();
  let days = null;
  for (let i = 0; i < cells.length; i += perRequest) {
    if (cap != null && count.n >= cap) throw new Error(`Abruf-Deckel ${cap} erreicht`);
    if (count.n++) await sleep(pauseMs);
    const ans = parseSnowAnswer(await get(snowSeriesUrl(cells.slice(i, i + perRequest), startDay, endDay, params)));
    if (days && days.join() !== ans.days.join()) throw new Error('SNOWGRID: zwei Antworten mit verschiedenen Tagen');
    days = ans.days;
    for (const s of ans.series) byKey.set(s.key, s);
  }
  const lost = cells.filter((c) => !byKey.has(snowCellKey(c[0], c[1])));
  if (lost.length) throw new Error(`SNOWGRID: ${lost.length} Zellen fehlen in der Antwort (erste ${lost[0].join(',')}) — das Gitter passt nicht mehr zur Zellendatei`);
  return { days: days ?? [], byKey };
}

/**
 * `--mode=clim`: per glacier and calendar day the percentiles of the snow depth over the reference years, one document per region.
 * Requests: the cells in chunks that stay below the service's limit of values (one parameter, the whole reference period).
 */
export async function runSnowClim({ storeDir, outDir, cellsPath = null, nowMs = Date.now(), get = (u) => getJson(u, { timeoutMs: 300_000 }), pauseMs = SNOW_REQUEST_PAUSE_MS, log = () => {} }) {
  const index = existsSync(join(storeDir, 'index.json')) ? readJson(join(storeDir, 'index.json')) : null;
  const cellsDoc = cellsOf(storeDir, index, cellsPath);
  const start = `${SNOW_REF_YEARS[0]}0101`, end = `${SNOW_REF_YEARS[1]}1231`;
  const nDays = Math.round((snowDayMs(end) - snowDayMs(start)) / DAY_MS) + 1;
  const perRequest = Math.max(1, Math.floor(SNOWGRID_MAX_VALUES_PER_REQUEST / nDays));
  const count = { n: 0 };
  const { days, byKey } = await fetchCells(cellsDoc.cells, start, end, { get: async (u) => { const r = await get(u); log(`Referenz: Abruf ${count.n}`); return r; }, perRequest, params: ['snow_depth'], pauseMs, count, cap: null });
  if (days.length !== nDays) throw new Error(`Referenz: ${days.length} Tage statt ${nDays}`);
  const at = new Map(days.map((d, i) => [d, i]));
  const builtAt = new Date(nowMs).toISOString(), file = cellsDoc.file;
  const regions = {};
  for (const [id, entry] of Object.entries(cellsDoc.glaciers)) {
    const series = entry.cells.map((c) => byKey.get(snowCellKey(c[0], c[1])).hs);
    const valueOf = (year, mmdd) => { const i = at.get(`${year}${mmdd}`); if (i == null) return null; let sum = 0; for (const s of series) { if (s[i] == null) return null; sum += s[i]; } return sum / series.length; };
    (regions[entry.region] ??= {})[id] = SNOW_CLIM_DAYS.map((mmdd) => snowClimRow(snowRefValues(valueOf, mmdd)));
  }
  const out = [];
  for (const region of Object.keys(regions).sort()) {
    const doc = {
      schema: 1, kind: 'glacier/snow-clim', file, build: cellsDoc.build, region, builtAt, ref: SNOW_REF_YEARS, pcts: SNOW_CLIM_PCTS, unit: 'cm',
      rule: { feb29: 'leap years: the day; other years: mean of 28 Feb and 1 Mar', smoothing: 'none', minYears: 20 }, days: SNOW_CLIM_DAYS, hs: regions[region],
    };
    const p = join(outDir, glacierSnowClimPath(file, region));
    writeJson(p, doc);
    out.push([region, Object.keys(regions[region]).length, readFileSync(p).length]);
  }
  return { file, requests: count.n, days: nDays, cells: cellsDoc.cells.length, glaciers: Object.keys(cellsDoc.glaciers).length, regions: out };
}

/**
 * `--mode=day`: one daily run. `get(url)` returns parsed JSON (the verifier hands in recorded answers). Writes the tree and the two
 * patches; returns the summary. Throws when the service does not answer — a failed run must turn the job red, not publish nothing
 * silently. A run that finds no new day writes no day document and still patches the status line.
 */
export async function runSnowDay({ storeDir, outDir, patchDir, nowMs = Date.now(), get = (u) => getJson(u), pauseMs = SNOW_REQUEST_PAUSE_MS, log = () => {} }) {
  const builtAt = new Date(nowMs).toISOString();
  const index = existsSync(join(storeDir, 'index.json')) ? readJson(join(storeDir, 'index.json')) : null;
  const cellsDoc = cellsOf(storeDir, index, null);
  // the climatology belongs to ONE cells file (same name): places from other cells would compare different ground
  const climHeld = index?.snow?.clim ?? newestStatic(join(storeDir, GLACIER_SNOW_CLIM_DIR));
  const climV = climHeld === cellsDoc.file && existsSync(join(storeDir, GLACIER_SNOW_CLIM_DIR, climHeld)) ? climHeld : null;
  const count = { n: 1 };
  const endDay = snowEndDay(await get(SNOWGRID_METADATA_URL));
  // the last week up to the newest day of the dataset
  const window = Array.from({ length: SNOW_BACKFILL_DAYS }, (_, i) => snowDayOf(new Date(snowDayMs(endDay) - (SNOW_BACKFILL_DAYS - 1 - i) * DAY_MS).toISOString()));
  const { days, byKey } = await fetchCells(cellsDoc.cells, window[0], endDay, { get, perRequest: SNOW_POINTS_PER_REQUEST, params: ['snow_depth', 'swe_tot'], pauseMs, count, cap: SNOW_MAX_REQUESTS_PER_RUN });
  // climatology rows of a calendar day, read lazily per region
  const climDocs = new Map();
  const climOf = (region) => {
    if (!climV) return null;
    if (!climDocs.has(region)) { const p = join(storeDir, glacierSnowClimPath(climV, region)); climDocs.set(region, existsSync(p) ? readJson(p) : null); }
    return climDocs.get(region);
  };
  const written = [], revised = [], noData = [], held = [];
  for (const day of window) {
    const i = days.indexOf(day);
    const di = SNOW_CLIM_DAYS.indexOf(snowMmdd(day));
    const doc = i < 0 ? null : buildSnowDay({
      day, builtAt, cellsDoc, clim: climV, byKey, index: i,
      climRow: (id) => climOf(cellsDoc.glaciers[id].region)?.hs?.[id]?.[di] ?? null,
    });
    const heldFile = join(storeDir, glacierSnowDayPath(day));
    if (existsSync(heldFile)) {
      held.push(day);
      // a published day is not rewritten; a later difference of the source is reported
      const old = readJson(heldFile);
      if (doc) {
        const ids = new Set([...Object.keys(old.glaciers ?? {}), ...Object.keys(doc.glaciers)]);
        let diff = 0;
        for (const id of ids) { const a = old.glaciers?.[id], b = doc.glaciers[id]; if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) diff++; }
        if (diff) revised.push([day, diff]);
      }
      continue;
    }
    if (!doc || doc.count === 0) { noData.push(day); continue; }
    const bad = snowDayProblems(doc);
    if (bad.length) throw new Error(`Tagesdokument ${day} fehlerhaft: ${bad.slice(0, 3).join('; ')}`);
    const text = JSON.stringify(doc) + '\n';
    if (Buffer.byteLength(text) > GLACIER_SNOW_DAY_MAX_BYTES) throw new Error(`Tagesdokument ${day} über ${GLACIER_SNOW_DAY_MAX_BYTES} Bytes`);
    mkdirSync(join(outDir, GLACIER_SNOW_DIR), { recursive: true });
    writeFileSync(join(outDir, glacierSnowDayPath(day)), text);
    written.push([day, doc.count, doc.missing.length]);
  }
  const readmeFile = join(storeDir, GLACIER_SNOW_DIR, 'README.md'), readme = snowReadme();
  if (!existsSync(readmeFile) || readFileSync(readmeFile, 'utf8') !== readme) { mkdirSync(join(outDir, GLACIER_SNOW_DIR), { recursive: true }); writeFileSync(join(outDir, GLACIER_SNOW_DIR, 'README.md'), readme); }
  // the pointer names the newest day that has a document (published before, or written now)
  const all = [...held, ...written.map((x) => x[0])].sort();
  const newest = all.pop() ?? index?.snow?.day ?? null;
  const newestN = newest ? (written.find((x) => x[0] === newest)?.[1] ?? readJson(join(storeDir, glacierSnowDayPath(newest))).count) : 0;
  const stale = index?.static?.build && index.static.build !== cellsDoc.build ? `Zellen aus Build ${cellsDoc.build}, der Katalog ist ${index.static.build}` : null;
  if (newest) writeJson(join(patchDir, 'index-patch.json'), { snow: { day: newest, builtAt: written.some((x) => x[0] === newest) ? builtAt : (index?.snow?.builtAt ?? builtAt), n: newestN, cells: cellsDoc.file, clim: climV } });
  writeJson(join(patchDir, 'status-patch.json'), {
    lines: { snow: { day: newest, checkedAt: builtAt, sourceEnd: endDay, requests: count.n, written: written.map((x) => x[0]), revised, noData, ...(stale ? { stale } : {}), ...(climV ? {} : { clim: climHeld ? `Klimatologie ${climHeld} gehört nicht zur Zellendatei ${cellsDoc.file} — Lage bleibt leer` : 'keine Klimatologie im Speicher — Lage bleibt leer' }) } },
  });
  log(`Quelle bis ${endDay}; geschrieben ${written.map((x) => x[0]).join(',') || '—'}; überarbeitet ${revised.map((x) => x.join(':')).join(',') || '—'}`);
  return { day: newest, sourceEnd: endDay, requests: count.n, written, revised, noData, held, cells: cellsDoc.file, clim: climV, stale };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const mode = String(args.mode ?? 'day');
  const need = mode === 'day' ? ['store', 'out', 'patch'] : ['store', 'out'];
  for (const k of need) if (!args[k] || args[k] === true) { console.error(`--${k}=<Pfad> fehlt`); process.exit(2); }
  const nowMs = args.now && args.now !== true ? Date.parse(String(args.now)) : Date.now();
  if (!Number.isFinite(nowMs)) { console.error('--now: kein Zeitpunkt'); process.exit(2); }
  const common = { storeDir: resolve(String(args.store)), outDir: resolve(String(args.out)), nowMs, log: (m) => console.error(`[snow] ${m}`) };
  let res;
  if (mode === 'cells') res = await runSnowCells(common);
  else if (mode === 'clim') res = await runSnowClim({ ...common, cellsPath: args.cells && args.cells !== true ? resolve(String(args.cells)) : null });
  else if (mode === 'day') res = await runSnowDay({ ...common, patchDir: resolve(String(args.patch)) });
  else { console.error(`--mode=${mode}: cells | clim | day`); process.exit(2); }
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main().catch((e) => { console.error(`[snow] Abbruch: ${e.message ?? e}`); process.exit(1); });
