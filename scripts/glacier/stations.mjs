#!/usr/bin/env node
/**
 * Phase GO — producer of the station measurements next to "Wetter am Gletscher" (`audit/gletscher-stationen.md`, contract
 * `src/glacier/glacierStationContract.ts`). One run every 30 minutes:
 *
 *   Land Tirol   the OGD file (CC BY 4.0); if it cannot be read, the Euregio feed filtered to the licensed operators
 *   Südtirol     `/stations` + `/sensors` of the province's service (CC0), plus the 5-min precipitation series of every rain gauge
 *   IMIS (SLF)   phase GI (`audit/gletscher-imis.md`): `/stations` + `/measurements` of the SLF service (CC BY 4.0) — two requests
 *                per run, one retry each after a pause, never more than `IMIS_MAX_REQUESTS_PER_RUN`; written to the section `ext`
 *   obs/v1       ONLY the stations the glacier mapping names (DWD, TAWES, SwissMetNet) — read from the mirror, never written to it
 *
 * Every value passes the checks of the contract (age, range, consistency, jump and stuck against the station's own earlier hours);
 * what fails is left out and listed under `rejected`. The output is a tree for the glacier publisher (line `stations`) plus the
 * two pointer patches — nothing here pushes:
 *
 *   <out>/stn/h/<slot>.json         the slot (`yyyymmddhh`, or `yyyymmddhh30` for the second half of the hour) — written ONCE: a
 *                                   second run in a slot the store already holds writes no slot file
 *                                   (the archive keeps what was published first; catalogue and mapping may still be renewed)
 *   <out>/stn/stations.json         the catalogue, only when it changed
 *   <out>/stn/map/<file>.json       glacier → nearest station per quantity, only when it was (re)built
 *   <out>/stn/README.md             sources, licences and what was changed — written when the store's copy is missing or differs
 *   <patch>/index-patch.json        { stations: { hour, slot, builtAt, n, map, mapAt } } — `hour` = newest FULL hour (pages from
 *                                   before the half-hour step read it), `slot` = newest slot
 *   <patch>/status-patch.json       { lines: { stations: … } }
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/stations.mjs \
 *        --store=<glacier/v1 of a buscosun-data checkout> --out=<dir> --patch=<dir> [--map] [--now=<ISO>]
 *
 * `--map` forces a new mapping; without it the mapping is rebuilt when the store has none for the current static build or the
 * store's is older than a day (`STN_MAP_REFRESH_MS`). A rebuilt mapping with the same content keeps the published file.
 * buscosun Fusion is not involved: this script reads `obs/v1` and writes below `glacier/v1/stn/` only.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BZ_BASE_URL, BZ_PRECIP_SENSOR, GLACIER_STN_CATALOG_PATH, GLACIER_STN_HOUR_RE, GLACIER_STN_MAP_RE, GLACIER_STN_SLOT_RE, GLACIER_STN_SOURCES, IMIS_MAX_REQUESTS_PER_RUN, IMIS_MEASUREMENTS_URL,
  IMIS_RETRY_PAUSE_MS, IMIS_STATIONS_URL, STN_EXT_ID_RE, STN_HSD_LIMITS, STN_ID_RULE, STN_JUMP_PER_H, STN_LIMITS, STN_MAP_REFRESH_MS, STN_MAX_AGE_MS, STN_OUTLINE_LEVEL, STN_STUCK_HOURS, STN_VARS,
  TIROL_FEED_URL, TIROL_OGD_URL, bzPrecipSums, buildStnMapDoc, checkReading, glacierStnHourPath, glacierStnMapPath, obsReadingOf, parseBz, parseImis, parseTirol, stnCandidates, stnHistoryOf,
  stnHourProblems, stnMapProblems, stnSlotMs, stnSlotOf,
} from '../../src/glacier/glacierStationContract.ts';

const SELF = fileURLToPath(import.meta.url);
const UA = 'buscosun-glacier-stations (+https://buscosun.com)';
export const OBS_RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/obs/v1';
export const glacierCatalogUrl = (build) => `https://raw.githubusercontent.com/jppetry/buscosun-data/glacier/glacier/v1/static/${build}/catalog.json`;
/** Outlines of one region of the static build (branch `glacier`), the level the mapping reads. */
export const glacierOutlineUrl = (build, region) => `https://raw.githubusercontent.com/jppetry/buscosun-data/glacier/glacier/v1/static/${build}/outline/${region}-L${STN_OUTLINE_LEVEL}.json`;
export const bzSeriesUrl = (code) => `${BZ_BASE_URL}/timeseries?station_code=${encodeURIComponent(code)}&sensor_code=${BZ_PRECIP_SENSOR}`;
/**
 * The README that travels with the data (CC BY 4.0 asks for the credit, the licence and what was changed NEXT to the data).
 * Generated from the contract, so it cannot drift from what the page says.
 */
export function stnReadme() {
  const lim = Object.entries(STN_LIMITS).map(([k, [a, b]]) => `${k} ${a} … ${b}`).join(' · ');
  return [
    '# glacier/v1/stn — Stationsmessungen in der Nähe der Gletscher',
    '',
    'Alle 30 Minuten aus drei Messnetzen (Land Tirol, Provinz Bozen, IMIS des SLF), dazu die Werte der zugeordneten Stationen aus `obs/v1` (DWD, GeoSphere Austria, MeteoSchweiz).',
    'Eigenes Produkt der Gletscher-Linie: **buscosun Fusion liest diese Dateien nicht** (der Motor liest Messungen nur aus `obs/v1/`).',
    '',
    '| Datei | Inhalt |',
    '|---|---|',
    '| `stations.json` | Katalog (Form von `obs/v1/stations.json`, dazu `operator`): `stations` = Tirol und Südtirol, `ext.stations` = IMIS |',
    '| `h/<slot>.json` | Werte eines Laufs je Station (Form eines Eintrags von `obs/v1/latest.json`): `stations` = Tirol, Südtirol und `obs/v1`, `ext.stations` = IMIS; `hsd` = Änderung der Schneehöhe über 24/48/72 h in cm, wie das Netz sie liefert; der Slot heißt `yyyymmddhh` für die volle Stunde und `yyyymmddhh30` für die halbe; 72 h aufbewahrt; dauerhaft je Stunde eine Datei in `buscosun-archiv` `glacier/v1/<Tag>/stn-<slot>.json.gz` |',
    '| `map/<build>.<n>.json` | Gletscher → nächste Station je Größe (Abstand zum Umriss des Gletschers ≤ 5 km, 0 auf dem Eis; Stationshöhe in der Höhenspanne des Gletschers ±300 m): oberste Ebene = Netze und Größen des ersten Stands, `ext` = alle Netze und Größen |',
    '',
    'Der Abschnitt `ext` trägt, was seit dem ersten Stand dazukam. Ein älterer Stand der Seite liest ihn nicht und bleibt mit den übrigen Abschnitten richtig.',
    '',
    '## Quellen und Lizenzen',
    '',
    ...GLACIER_STN_SOURCES.map((s) => `- **${s.note}** — ${s.label}. Lizenz: [${s.licence}](${s.licenceUrl}). Quelle: ${s.url}. Geändert: ${s.changes}.`),
    '',
    'Aus dem Feed `static.avalanche.report` wird nur gelesen, wenn die OGD-Datei des Landes Tirol nicht antwortet, und dann nur Stationen der Betreiber `HD Tirol` und `LWD Tirol…`. Kein anderer Betreiber wird gespeichert.',
    '',
    `IMIS: Daten des WSL-Instituts für Schnee- und Lawinenforschung SLF, https://www.slf.ch — je Lauf zwei Abrufe (höchstens ${IMIS_MAX_REQUESTS_PER_RUN}), Halbstundenmittel; ein Teil der Daten ist vom SLF nicht geprüft.`,
    '',
    '## Einheiten und Prüfungen',
    '',
    `Einheiten wie in \`obs/v1\`: ${Object.entries(STN_VARS).map(([k, v]) => `\`${k}\` ${v}`).join(', ')}; Summen \`rr1h\`, \`rr6h\`, \`rr24h\` in mm.`,
    '',
    `Die Rohdaten sind ungeprüft. Ein Wert steht nur im Dokument, wenn er jünger als ${STN_MAX_AGE_MS / 3_600_000} Stunden ist, in der benannten Spanne liegt (${lim}), gegen den letzten Wert der Station nicht springt und nicht seit ${STN_STUCK_HOURS} Stunden stillsteht. Was herausfällt, steht mit Grund unter \`rejected\`.`,
    '',
    'Stationen stehen auf Fels oder Grat, nicht auf dem Eis.',
    '',
    'Code: `buscosun-web` `scripts/glacier/stations.mjs`, Vertrag `src/glacier/glacierStationContract.ts`.',
    '',
  ].join('\n');
}
/** Hours before the slot whose documents are read as the history of the checks (every slot file in that span). */
export const STN_HISTORY_HOURS = STN_STUCK_HOURS + 2;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o) + '\n'); };

/** GET a JSON document with a deadline and retries; throws with the status or the reason. */
export async function getJson(url, { fetchImpl = fetch, timeoutMs = 30_000, retries = 2, pauseMs = null } = {}) {
  let last = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { last = e; if (i < retries) await new Promise((r) => setTimeout(r, pauseMs ?? 1500 * (i + 1))); }
  }
  throw new Error(`${url}: ${last?.message ?? last}`);
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } }));
}

/** Catalogue of this run merged with the store's: a station that is missing from one answer stays; `vars` is the union. */
export function mergeCatalog(prev, fresh) {
  const by = new Map((prev ?? []).map((s) => [s.id, s]));
  for (const s of fresh) { const p = by.get(s.id); by.set(s.id, p ? { ...s, vars: [...new Set([...(p.vars ?? []), ...s.vars])].sort() } : s); }
  return [...by.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * One run. `get(url)` returns parsed JSON (the verifier hands in recorded answers). Returns the summary; writes the tree and the
 * patches. Throws when no network answered — a run without any measurement must turn the job red, not publish an empty hour.
 *
 * The SLF service (IMIS) gets its own request path: `getOnce(url)` sends ONE request without any retry; this function sends at most
 * `IMIS_MAX_REQUESTS_PER_RUN` of them per run (two answers, each with one retry after `imisPauseMs`). When that is not enough the
 * network is left out of this run and says so in `sources` — the other networks deliver.
 */
export async function runStations({ storeDir, outDir, patchDir, nowMs = Date.now(), forceMap = false, get = (u) => getJson(u), getOnce = (u) => getJson(u, { retries: 0, timeoutMs: 60_000 }), imisPauseMs = IMIS_RETRY_PAUSE_MS, log = () => {} }) {
  const slot = stnSlotOf(nowMs), builtAt = new Date(nowMs).toISOString();
  const index = existsSync(join(storeDir, 'index.json')) ? readJson(join(storeDir, 'index.json')) : null;

  // earlier slots (history of the jump and stuck checks)
  const hDir = join(storeDir, 'stn', 'h');
  const held0 = (existsSync(hDir) ? readdirSync(hDir) : []).map((f) => f.replace(/\.json$/, '')).filter((k) => GLACIER_STN_SLOT_RE.test(k)).sort();
  const sinceMs = stnSlotMs(slot) - STN_HISTORY_HOURS * 3_600_000;
  const earlier = held0.filter((k) => k < slot && stnSlotMs(k) >= sinceMs).reverse()
    .map((k) => { try { return readJson(join(hDir, `${k}.json`)); } catch { return null; } }).filter(Boolean);

  const sources = [], readings = [], fresh = [];
  const srcOf = (id) => GLACIER_STN_SOURCES.find((s) => s.id === id);
  const head = (id, extra) => ({ id, label: srcOf(id).label, licence: srcOf(id).licence, note: srcOf(id).note, ...extra });

  // Tirol: the OGD file, else the feed with the operator filter
  {
    let parsed = null, via = 'ogd', error = null;
    try { parsed = parseTirol(await get(TIROL_OGD_URL)); } catch (e) {
      error = String(e.message ?? e); log(`Tirol OGD: ${error} — Rückfall auf den Feed`);
      try { parsed = parseTirol(await get(TIROL_FEED_URL)); via = 'feed'; } catch (e2) { error = `${error}; Feed: ${String(e2.message ?? e2)}`; }
    }
    if (parsed) {
      if (via === 'ogd' && parsed.foreign.length) log(`Tirol OGD: ${parsed.foreign.length} Einträge fremder Betreiber verworfen`);
      for (const r of parsed.readings) readings.push({ r, src: 'tirol' });
      fresh.push(...parsed.stations);
      sources.push(head('tirol', { fetchedAt: builtAt, via, stations: parsed.stations.length, ...(parsed.foreign.length ? { foreignDropped: parsed.foreign.length } : {}), ...(via === 'feed' ? { error } : {}) }));
    } else sources.push(head('tirol', { fetchedAt: null, via: 'none', stations: 0, error }));
  }

  // South Tyrol: stations + sensors, then the 5-min series of the rain gauges
  {
    let parsed = null, error = null;
    try { const [st, se] = await Promise.all([get(`${BZ_BASE_URL}/stations`), get(`${BZ_BASE_URL}/sensors`)]); parsed = parseBz(st, se); } catch (e) { error = String(e.message ?? e); log(`Südtirol: ${error}`); }
    if (parsed) {
      const byId = new Map(parsed.readings.map((r) => [r.id, r]));
      let seriesFailed = 0;
      await pool(parsed.precip, 4, async (code) => {
        const r = byId.get(`bz:${code}`);
        if (!r) return;
        try { const sums = bzPrecipSums(await get(bzSeriesUrl(code)), r.ms); if (Object.keys(sums).length) r.sums = sums; } catch { seriesFailed++; }
      });
      for (const r of parsed.readings) readings.push({ r, src: 'bz' });
      fresh.push(...parsed.stations);
      sources.push(head('bz', { fetchedAt: builtAt, via: 'service', stations: parsed.stations.length, ...(seriesFailed ? { error: `${seriesFailed} Niederschlagsreihen nicht lesbar` } : {}) }));
    } else sources.push(head('bz', { fetchedAt: null, via: 'none', stations: 0, error }));
  }
  // IMIS (SLF): the station list and the last 24 h of every station — two requests, one retry each, never more than the cap
  const freshExt = [];
  {
    let sent = 0, parsed = null, error = null;
    const ask = async (url) => {
      for (let attempt = 0; ; attempt++) {
        if (sent >= IMIS_MAX_REQUESTS_PER_RUN) throw new Error(`Abruf-Deckel ${IMIS_MAX_REQUESTS_PER_RUN} erreicht`);
        sent++;
        try { return await getOnce(url); } catch (e) {
          if (attempt >= 1) throw e;
          log(`IMIS: ${String(e.message ?? e)} — eine Wiederholung nach ${Math.round(imisPauseMs / 1000)} s`);
          await new Promise((r) => setTimeout(r, imisPauseMs));
        }
      }
    };
    try { const st = await ask(IMIS_STATIONS_URL); parsed = parseImis(st, await ask(IMIS_MEASUREMENTS_URL)); } catch (e) { error = String(e.message ?? e); log(`IMIS: ${error}`); }
    if (parsed) {
      for (const r of parsed.readings) readings.push({ r, src: 'imis' });
      freshExt.push(...parsed.stations);
      sources.push(head('imis', { fetchedAt: builtAt, via: 'service', stations: parsed.stations.length, requests: sent }));
    } else sources.push(head('imis', { fetchedAt: null, via: 'none', stations: 0, requests: sent, error }));
  }
  if (!sources.some((s) => s.stations > 0)) throw new Error(`kein Netz lesbar: ${sources.map((s) => `${s.id}: ${s.error}`).join(' | ')}`);

  // catalogue (written only when it changed)
  const catFile = join(storeDir, GLACIER_STN_CATALOG_PATH);
  const prevCat = existsSync(catFile) ? readJson(catFile) : null;
  // `stations` = the networks of phase GO; `ext` = networks added since (a producer from before phase GI reads only `stations`)
  const stations = mergeCatalog(prevCat?.stations, fresh);
  const extStations = mergeCatalog(prevCat?.ext?.stations, freshExt);
  const catChanged = JSON.stringify([prevCat?.stations ?? null, prevCat?.ext?.stations ?? []]) !== JSON.stringify([stations, extStations]);
  const catalog = { schema: 1, kind: 'glacier/stations', builtAt: catChanged ? builtAt : prevCat.builtAt, count: stations.length, idRule: STN_ID_RULE, stations, ext: { count: extStations.length, stations: extStations } };

  // mapping: the store's file for the current static build, or a new one
  const build = index?.static?.build ?? null;
  let mapFile = index?.stations?.map ?? null, map = null, mapBuilt = false, obsLatest = null, obsError = null;
  const getObsLatest = async () => { if (!obsLatest && !obsError) { try { obsLatest = await get(`${OBS_RAW}/latest.json`); } catch (e) { obsError = String(e.message ?? e); } } if (!obsLatest) throw new Error(`obs/v1 latest: ${obsError}`); return obsLatest; };
  const prevMapPath = mapFile ? join(storeDir, glacierStnMapPath(mapFile)) : null;
  if (prevMapPath && existsSync(prevMapPath)) map = readJson(prevMapPath);
  // `mapAt` = when the mapping was last recomputed (also when the result was the same and the file stayed)
  let mapAt = index?.stations?.mapAt ?? map?.builtAt ?? null;
  const mapOld = !!map && !(nowMs - Date.parse(mapAt) <= STN_MAP_REFRESH_MS);
  // a mapping from before phase GI (no section `ext`, distance from the catalogue point) is rebuilt at once
  if (build && (forceMap || !map || map.build !== build || mapOld || !map.ext)) {
    try {
      const catalogGlaciers = (await get(glacierCatalogUrl(build))).glaciers;
      // the outlines of every region (26 small files of our own repo); a glacier without an outline stops the mapping
      const outlines = new Map();
      await pool([...new Set(catalogGlaciers.map((g) => g.region))].sort(), 4, async (region) => {
        const doc = await get(glacierOutlineUrl(build, region));
        for (const f of doc?.features ?? []) { const c = f?.geometry?.coordinates; if (f?.properties?.id && Array.isArray(c)) outlines.set(f.properties.id, f.geometry.type === 'Polygon' ? [c] : c); }
      });
      const glaciers = catalogGlaciers.map((g) => ({ ...g, outline: outlines.get(g.id) }));
      const obsCat = await get(`${OBS_RAW}/stations.json`);
      const m = mapFile ? GLACIER_STN_MAP_RE.exec(mapFile) : null;
      const file = `${build}.${m && m[1] === build ? Number(m[2]) + 1 : 1}`;
      const next = buildStnMapDoc(glaciers, stnCandidates([...stations, ...extStations], obsCat.stations, (await getObsLatest()).stations ?? {}), { file, build, builtAt });
      const bad = stnMapProblems(next, new Set(glaciers.map((g) => g.id)));
      if (bad.length) throw new Error(`Zuordnung fehlerhaft: ${bad.slice(0, 3).join('; ')}`);
      const body = (d) => JSON.stringify([d.rule, d.stations, d.glaciers, d.ext?.rule ?? null, d.ext?.stations ?? null, d.ext?.glaciers ?? null]);
      const same = map && map.build === build && body(map) === body(next);
      if (!same) { map = next; mapFile = file; mapBuilt = true; }
      mapAt = builtAt;
    } catch (e) { log(`Zuordnung nicht gebaut: ${String(e.message ?? e)}`); if (!map || map.build !== build) { map = null; mapFile = null; mapAt = null; } }
  }

  // the mapped stations of obs/v1 (values unchanged, same checks)
  const obsIds = map ? [...new Set([...Object.entries(map.stations), ...Object.entries(map.ext?.stations ?? {})].filter(([, s]) => s.net === 'obs').map(([id]) => id))].sort() : [];
  if (obsIds.length) {
    try {
      const latest = await getObsLatest();
      let n = 0;
      for (const id of obsIds) { const e = latest.stations?.[id]; const r = obsReadingOf(id, e); if (r) { readings.push({ r, src: String(e.src ?? 'obs') }); n++; } }
      sources.push(head('obs', { fetchedAt: builtAt, via: `obs/v1 latest ${latest.builtAt ?? '?'}`, stations: n }));
    } catch (e) { sources.push(head('obs', { fetchedAt: null, via: 'none', stations: 0, error: String(e.message ?? e) })); }
  }

  // checks
  const out = {}, rejected = [];
  for (const { r, src } of readings) {
    const res = checkReading(r, src, nowMs, stnHistoryOf(r.id, earlier));
    rejected.push(...res.rejected);
    if (res.entry) out[r.id] = res.entry;
  }
  // `stations` = the networks of phase GO (what a page from before phase GI accepts there); `ext` = the networks added since
  const pick = (ext) => Object.fromEntries(Object.keys(out).filter((k) => STN_EXT_ID_RE.test(k) === ext).sort().map((k) => [k, out[k]]));
  const sorted = pick(false), sortedExt = pick(true);
  const doc = {
    schema: 1, kind: 'glacier/stations-hour', hour: slot, builtAt, sources,
    rules: { maxAgeMin: STN_MAX_AGE_MS / 60_000, limits: STN_LIMITS, jumpPerH: STN_JUMP_PER_H, stuckHours: STN_STUCK_HOURS, history: earlier.length, hsdLimits: STN_HSD_LIMITS },
    count: Object.keys(sorted).length, stations: sorted, ext: { count: Object.keys(sortedExt).length, stations: sortedExt },
    rejected: rejected.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1)),
  };
  const total = doc.count + doc.ext.count;
  const problems = stnHourProblems(doc);
  if (problems.length) throw new Error(`Stundendokument fehlerhaft: ${problems.slice(0, 3).join('; ')}`);

  // a slot is published once: the store's document stays, and the pointer keeps naming it
  const heldFile = join(storeDir, glacierStnHourPath(slot));
  const held = existsSync(heldFile) ? readJson(heldFile) : null;
  if (!held) writeJson(join(outDir, glacierStnHourPath(slot)), doc);
  if (catChanged) writeJson(join(outDir, GLACIER_STN_CATALOG_PATH), catalog);
  if (mapBuilt) writeJson(join(outDir, glacierStnMapPath(mapFile)), map);
  const readmeFile = join(storeDir, 'stn', 'README.md'), readme = stnReadme();
  const readmeChanged = !existsSync(readmeFile) || readFileSync(readmeFile, 'utf8') !== readme;
  if (readmeChanged) { mkdirSync(join(outDir, 'stn'), { recursive: true }); writeFileSync(join(outDir, 'stn', 'README.md'), readme); }
  // `hour` = the newest full hour the store holds after this run (a page from before the half-hour step reads only that name);
  // a store without any full hour yet names the slot
  const hour = [...held0, slot].filter((k) => GLACIER_STN_HOUR_RE.test(k)).sort().pop() ?? slot;
  const pointer = { hour, slot, builtAt: held ? held.builtAt : builtAt, n: held ? held.count + (held.ext?.count ?? 0) : total, map: mapFile, mapAt: mapFile ? mapAt : null };
  writeJson(join(patchDir, 'index-patch.json'), { stations: pointer });
  writeJson(join(patchDir, 'status-patch.json'), {
    lines: { stations: { hour, slot, checkedAt: builtAt, n: total, rejected: rejected.length, sources: Object.fromEntries(sources.map((s) => [s.id, { stations: s.stations, via: s.via, ...(s.error ? { error: s.error } : {}) }])) } },
  });
  return {
    hour, slot, hourWritten: !held, stations: total, rejected: rejected.length, catalog: stations.length + extStations.length, catalogChanged: catChanged, map: mapFile, mapBuilt,
    mapReport: mapBuilt ? (map.ext?.report ?? map.report).all : null, history: earlier.length, sources: sources.map((s) => `${s.id}:${s.stations}${s.error ? '!' : ''}`).join(' '),
  };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  for (const k of ['store', 'out', 'patch']) if (!args[k] || args[k] === true) { console.error(`--${k}=<Pfad> fehlt`); process.exit(2); }
  const nowMs = args.now && args.now !== true ? Date.parse(String(args.now)) : Date.now();
  if (!Number.isFinite(nowMs)) { console.error('--now: kein Zeitpunkt'); process.exit(2); }
  const res = await runStations({ storeDir: resolve(String(args.store)), outDir: resolve(String(args.out)), patchDir: resolve(String(args.patch)), nowMs, forceMap: !!args.map, log: (m) => console.error(`[stations] ${m}`) });
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main().catch((e) => { console.error(`[stations] Abbruch: ${e.message ?? e}`); process.exit(1); });
