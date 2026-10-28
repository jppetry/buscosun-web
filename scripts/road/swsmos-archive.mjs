#!/usr/bin/env node
/**
 * AW-6.2.1 / E-VS-7 — store of the DWD road-weather MOS (SWSMOS) in `jppetry/buscosun-archiv` `swsmos/v1/`
 * (`audit/autobahnwetter.md` §20.2 d, §20.3 (4)). The DWD keeps 48 hourly runs under
 * `weather/local_forecasts/swsmos/swsmos_<YYYYMMDDHHmmss>_opendata.csv.bz2` (2 MB bz2, 1 847 stations × 167 h); Gate G needs
 * SWSMOS TS/RC as a baseline for months. Stored THINNED — every run would be 48 MB a day:
 *
 *   <YYYY-MM-DD>/<HH>.json.gz   one run: the stations of our GMA catalogue (`road/v1/static/stations.json`), the columns
 *                               `SWSMOS_COLUMNS` (TL TS TD in 0.1 °C, RC as the code), leads 1 … `SWSMOS_LEADS` h.
 *                               Written once, never rewritten (a run is immutable).
 *   static/katalog.json         the DWD catalogue `swsKatalog.csv` (bridge, surface, airport, height), rewritten only when
 *                               its sha changes — the road-type and surface of 6.2.2 come from here.
 *   index.json, README.md       runs per day, stations, bytes; the README from the constants below.
 *
 * Runs every 3 h with the road archive (three runs are new each time; the 48-h window forgives a failed run).
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/swsmos-archive.mjs \
 *     --archive=<buscosun-archiv>/swsmos/v1 --stations=<buscosun-data>/road/v1/static/stations.json [--max=N] [--now=<ISO>]
 * Exit 0 = stored or nothing new · 1 = listing unreadable. The reducer (`reduceSwsmos`) is pure.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { decompressBz2 } from '../lib/bz2.mjs';

export const SWSMOS_BASE = 'https://opendata.dwd.de/weather/local_forecasts/swsmos';
export const SWSMOS_SCHEMA = 1;
/** Columns kept (as in the DWD header); TL/TS/TD in 0.1 °C, RC the code as delivered (1 … 6 — spike: 1/2 in October). */
export const SWSMOS_COLUMNS = Object.freeze(['TL', 'TS', 'TD', 'RC']);
/** Leads kept: the horizon of the virtual sensor (`ROAD_VS_STEPS` − 1). */
export const SWSMOS_LEADS = 48;
/** The DWD keeps this many hourly runs; a catch-up never looks further back. */
export const SWSMOS_DWD_WINDOW_H = 48;
export const SWSMOS_RUN_RE = /^swsmos_(\d{4})(\d{2})(\d{2})(\d{2})0000_opendata\.csv\.bz2$/;

const sha12 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);
function writeAtomic(p, body) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(`${p}.tmp`, body); renameSync(`${p}.tmp`, p); }

export const swsmosRunPath = (day, hh) => `${day}/${hh}.json.gz`;
export function swsmosRunOf(name) {
  const m = SWSMOS_RUN_RE.exec(name);
  return m ? { day: `${m[1]}-${m[2]}-${m[3]}`, hh: m[4], runMs: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) } : null;
}

/**
 * CSV text of one run → the thinned document. Pure. The second line is the run (`YYYYMMDDHHmm`); values use `.` as decimal
 * point (the DWD file does; a `,` is accepted). Stations not in `ids` and leads outside 1 … SWSMOS_LEADS are dropped; a
 * missing value is null; a lead that never appears stays null.
 */
export function reduceSwsmos(text, ids) {
  const lines = text.split(/\r?\n/);
  const head = lines[0].split(';');
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  for (const k of ['ID', 'YYYYMMDDHHmm', ...SWSMOS_COLUMNS]) if (col[k] == null) throw new Error(`SWSMOS ohne Spalte ${k}`);
  const run = (lines[1] ?? '').trim();
  if (!/^\d{12}$/.test(run)) throw new Error(`SWSMOS: zweite Zeile ist kein Lauf (${run})`);
  const runMs = Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10), +run.slice(10, 12));
  const stations = {};
  const num = (s) => { if (s == null || s === '') return null; const x = Number(String(s).replace(',', '.')); return Number.isFinite(x) ? x : null; };
  let rows = 0, kept = 0;
  for (let i = 2; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    rows++;
    const f = l.split(';');
    const id = f[col.ID];
    if (!ids.has(id)) continue;
    const t = f[col.YYYYMMDDHHmm];
    if (!/^\d{12}$/.test(t)) continue;
    const ms = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12));
    const lead = Math.round((ms - runMs) / 3_600_000);
    if (lead < 1 || lead > SWSMOS_LEADS) continue;
    let st = stations[id];
    if (!st) { st = stations[id] = Object.fromEntries(SWSMOS_COLUMNS.map((c) => [c.toLowerCase(), new Array(SWSMOS_LEADS).fill(null)])); }
    const tl = num(f[col.TL]), ts = num(f[col.TS]), td = num(f[col.TD]), rc = num(f[col.RC]);
    st.tl[lead - 1] = tl == null ? null : Math.round(tl * 10);
    st.ts[lead - 1] = ts == null ? null : Math.round(ts * 10);
    st.td[lead - 1] = td == null ? null : Math.round(td * 10);
    st.rc[lead - 1] = rc == null ? null : Math.round(rc);
    kept++;
  }
  const rcCodes = {};
  for (const st of Object.values(stations)) for (const c of st.rc) if (c != null) rcCodes[c] = (rcCodes[c] ?? 0) + 1;
  return {
    schema: SWSMOS_SCHEMA, product: 'swsmos-archive', run, runMs, leads: SWSMOS_LEADS, columns: [...SWSMOS_COLUMNS], scale: { tl: 10, ts: 10, td: 10, rc: 1 },
    source: 'Deutscher Wetterdienst, SWSMOS (opendata.dwd.de/weather/local_forecasts/swsmos, CC BY 4.0); verändert: auf GMA-Stationen, vier Spalten und 48 h gekürzt',
    counts: { rows, kept, stations: Object.keys(stations).length, rcCodes },
    stations: Object.fromEntries(Object.keys(stations).sort().map((k) => [k, stations[k]])),
  };
}

/** The DWD catalogue (Windows-1252, `;`) → json rows; pure. */
export function parseKatalog(buf) {
  const text = new TextDecoder('windows-1252').decode(buf);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(';');
  const rows = lines.slice(1).map((l) => l.split(';')).filter((f) => f[0]);
  const num = (s) => { const x = Number(String(s ?? '').replace(',', '.')); return Number.isFinite(x) && s !== '' ? x : null; };
  return {
    schema: SWSMOS_SCHEMA, product: 'swsmos-katalog', header: head, count: rows.length,
    stations: Object.fromEntries(rows.map((f) => [f[0], { n: f[1], typ: num(f[2]), belag: num(f[3]), lat: num(f[4]), lon: num(f[5]), h: num(f[6]), flughafen: !!f[7], inaktiv: !!f[8] }])),
  };
}

export function readmeText() {
  return [
    '# swsmos/v1 — DWD-Straßenwetter-MOS (SWSMOS), gekürzt', '',
    `Je Lauf eine Datei \`<YYYY-MM-DD>/<HH>.json.gz\`: nur die Stationen des GMA-Katalogs von buscosun, Spalten ${SWSMOS_COLUMNS.join(' ')} (TL/TS/TD in 0,1 °C, RC der Code wie geliefert), Vorlauf 1 … ${SWSMOS_LEADS} h. Einmal geschrieben, nie neu.`,
    '`static/katalog.json`: der DWD-Katalog `swsKatalog.csv` (Streckentyp 1 freie Strecke / 2 Brücke, Belag 1 Asphalt / 2 Beton, Höhe), neu nur bei geänderter Prüfsumme.',
    'Quelle: Deutscher Wetterdienst, opendata.dwd.de/weather/local_forecasts/swsmos, CC BY 4.0. Zweck: Baseline des virtuellen Fahrbahnsensors (buscosun-web audit/autobahnwetter.md §20).', '',
  ].join('\n');
}

async function fetchBuf(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function archiveSwsmos({ archiveDir, stationsFile, nowMs = Date.now(), max = 6, log = () => {} }) {
  const ids = new Set(Object.keys(JSON.parse(readFileSync(stationsFile, 'utf8')).stations));
  const idxFile = join(archiveDir, 'index.json');
  const idx = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : { schema: SWSMOS_SCHEMA, product: 'swsmos-archive-index', updatedAt: null, days: {}, katalog: null };
  const html = await (await fetch(`${SWSMOS_BASE}/`, { signal: AbortSignal.timeout(30_000) })).text();
  const names = [...html.matchAll(/href="(swsmos_\d{14}_opendata\.csv\.bz2)"/g)].map((m) => m[1]).sort();
  if (!names.length) throw new Error('SWSMOS-Verzeichnis ohne Läufe');
  const todo = names.map((n) => ({ n, ...swsmosRunOf(n) })).filter((r) => r.runMs && nowMs - r.runMs <= SWSMOS_DWD_WINDOW_H * 3_600_000 && !existsSync(join(archiveDir, swsmosRunPath(r.day, r.hh)))).slice(-max);
  let stored = 0;
  for (const r of todo) {
    const bz = await fetchBuf(`${SWSMOS_BASE}/${r.n}`);
    const csv = new TextDecoder().decode(await decompressBz2(bz));
    const doc = reduceSwsmos(csv, ids);
    const gz = gzipSync(JSON.stringify(doc), { level: 9 });
    writeAtomic(join(archiveDir, swsmosRunPath(r.day, r.hh)), gz);
    (idx.days[r.day] ??= []).push({ hh: r.hh, stations: doc.counts.stations, bytes: gz.length, rc: doc.counts.rcCodes });
    idx.days[r.day].sort((a, b) => (a.hh < b.hh ? -1 : 1));
    stored++;
    log(`${r.day} ${r.hh}: ${doc.counts.stations} Stationen, ${(gz.length / 1024).toFixed(0)} KB gz, RC ${JSON.stringify(doc.counts.rcCodes)}`);
  }
  // Catalogue: once per run of the job, stored when changed.
  try {
    const kb = await fetchBuf(`${SWSMOS_BASE}/swsKatalog.csv.bz2`);
    const raw = await decompressBz2(kb);
    const sha = sha12(raw);
    if (idx.katalog?.sha !== sha) {
      const kat = parseKatalog(raw);
      writeAtomic(join(archiveDir, 'static', 'katalog.json'), JSON.stringify({ ...kat, sha, fetchedAt: new Date(nowMs).toISOString() }));
      idx.katalog = { sha, count: kat.count, updatedAt: new Date(nowMs).toISOString() };
      log(`Katalog neu: ${kat.count} Zeilen, sha ${sha}`);
    }
  } catch (e) { log(`Katalog nicht geholt: ${e.message}`); }
  if (stored || !existsSync(idxFile)) {
    idx.updatedAt = new Date(nowMs).toISOString();
    writeAtomic(idxFile, `${JSON.stringify(idx, null, 1)}\n`);
    writeAtomic(join(archiveDir, 'README.md'), readmeText());
  }
  return { stored, available: names.length, days: Object.keys(idx.days).length };
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  const log = (m) => console.log(`[swsmos] ${m}`);
  if (!flags.archive || !flags.stations) { console.error('--archive=<buscosun-archiv>/swsmos/v1 und --stations=<buscosun-data>/road/v1/static/stations.json fehlen'); process.exit(2); }
  const nowMs = typeof flags.now === 'string' ? Date.parse(flags.now) : Date.now();
  const r = await archiveSwsmos({ archiveDir: flags.archive, stationsFile: flags.stations, nowMs, max: flags.max ? Number(flags.max) : 6, log });
  log(`${r.stored} Läufe abgelegt (${r.available} beim DWD, ${r.days} Tage im Archiv)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
