#!/usr/bin/env node
/**
 * AW-2 — Station catalogue of the DWD road-weather stations (`sws_stations_xls.xlsx`) → `road/v1/static/stations.json`.
 * Plan: once a day compare the ETag, rebuild only on change; a failed build keeps the old catalogue and the status says
 * `catalog: stale` instead of running on silently (`audit/autobahnwetter.md`).
 *
 * Minimal XLSX reader on `node:zlib` — no dependency: the zip directory comes from `scripts/point/mosmix.mjs`
 * (`zipEntries`), the sheet is read by regex (one sheet, cached formula values `<v>`). AW-0 findings this handles:
 *   · the workbook claims UTF-8 but stores Windows-1252 bytes (`Stra\xdfe`) ⇒ strict UTF-8 first, else Windows-1252
 *   · every cell is a formula into an external workbook — only the cached value counts
 *   · columns are found by their header text, not by letter
 *
 *   node scripts/road/road-catalog.mjs <outFile> [--etag=<known etag>] [--file=<local xlsx>]
 *   → prints ONE JSON line {"ok":true,"changed":true|false,"etag":"…","count":1688}
 */
import { inflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipEntries } from '../point/mosmix.mjs';

export const ROAD_CATALOG_URL = 'https://www.dwd.de/DE/leistungen/opendata/help/stationen/sws_stations_xls.xlsx?__blob=publicationFile&v=11';
const UA = 'buscosun-road (buscosun-web/audit/autobahnwetter.md)';

/** Bytes → text: strict UTF-8, on failure Windows-1252 (AW-0: the DWD file mixes both claims). */
export function decodeXmlBytes(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

const unescapeXml = (s) => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
  if (e === 'amp') return '&'; if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'quot') return '"'; if (e === 'apos') return "'";
  return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
});

/** Rows of the first sheet as arrays indexed by column letter → text (cached values only). */
export function readXlsxRows(buf) {
  const entries = zipEntries(Buffer.from(buf));
  const get = (name) => {
    const e = entries.find((x) => x.name === name);
    if (!e) return null;
    return e.method === 8 ? inflateRawSync(e.raw) : e.method === 0 ? Buffer.from(e.raw) : null;
  };
  const sheetBytes = get('xl/worksheets/sheet1.xml');
  if (!sheetBytes) throw new Error('xlsx: xl/worksheets/sheet1.xml fehlt');
  const ssBytes = get('xl/sharedStrings.xml');
  const shared = ssBytes
    ? [...decodeXmlBytes(ssBytes).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unescapeXml(m[1].replace(/<[^>]+>/g, '')))
    : [];
  const sheet = decodeXmlBytes(sheetBytes);
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, attrs, inner = ''] = cm;
      let v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? '';
      if (/\bt="s"/.test(attrs) && v !== '') v = shared[Number(v)] ?? '';
      row[col] = unescapeXml(v).trim();
    }
    rows.push(row);
  }
  return rows;
}

const HEADERS = {
  id: /^Kennung/i, name: /^GMA-Name/i, state: /^Bundesland/i, maker: /^Einrichter/i, road: /^Stra.{1,3}e\s*\/\s*Fahrtrichtung/i,
  km: /^Strecken-?\s*kilometer/i, typ: /^Streckentyp/i, lage: /^Streckenlage/i, belag: /^Streckenbelag/i,
  lat: /^Breite/i, lon: /^L.{1,3}nge/i, elev: /^H.{1,3}he/i, folder: /^GDS-Verzeichnis/i, neu: /^Neu$/i, oob: /au.{1,3}er Betrieb/i,
};

const numOf = (s) => {
  if (s == null || s === '') return null;
  const v = Number(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/** Catalogue rows → `stations.json` body. Direction letter and normalised road come from the contract's rule. */
export function buildCatalog(rows, normaliseRoad) {
  if (!rows.length) throw new Error('xlsx: leer');
  const head = rows[0];
  const col = {};
  for (const [key, re] of Object.entries(HEADERS)) {
    const c = Object.keys(head).find((k) => re.test(head[k]));
    if (c) col[key] = c;
  }
  for (const need of ['id', 'name', 'road', 'lat', 'lon']) if (!col[need]) throw new Error(`xlsx: Spalte ${need} nicht gefunden`);
  const stations = {};
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const id = r[col.id];
    if (!id || !/^[A-Z0-9]{3,5}$/.test(id)) { if (Object.keys(r).length) skipped++; continue; }
    const rawRoad = r[col.road] || null;
    const norm = normaliseRoad(rawRoad);
    const kmRaw = numOf(r[col.km]);
    stations[id] = {
      n: r[col.name] || id,
      bl: r[col.state] || null,
      roadRaw: rawRoad,
      road: norm.road,
      kind: norm.kind,
      dir: norm.dir,
      // "Strecken-kilometer 100 m": the cell counts 100-m units.
      km: kmRaw == null ? null : Number((kmRaw / 10).toFixed(1)),
      typ: numOf(r[col.typ]), lage: numOf(r[col.lage]), belag: numOf(r[col.belag]),
      lat: numOf(r[col.lat]), lon: numOf(r[col.lon]), h: numOf(r[col.elev]),
      folder: r[col.folder] || null,
      neu: !!(col.neu && r[col.neu]),
      oob: !!(col.oob && r[col.oob]),
    };
  }
  return { stations, skipped, columns: col };
}

export async function fetchCatalog(knownEtag) {
  const headers = { 'user-agent': UA };
  if (knownEtag) headers['if-none-match'] = knownEtag;
  const r = await fetch(ROAD_CATALOG_URL, { headers });
  if (r.status === 304) return { changed: false, etag: knownEtag };
  if (!r.ok) throw new Error(`GET sws_stations_xls.xlsx: HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  return { changed: true, etag: r.headers.get('etag'), lastModified: r.headers.get('last-modified'), buf };
}

export function catalogFile(buf, meta, normaliseRoad) {
  const { stations, skipped } = buildCatalog(readXlsxRows(buf), normaliseRoad);
  return {
    schema: 1,
    product: 'road-stations',
    source: { url: ROAD_CATALOG_URL, etag: meta.etag ?? null, lastModified: meta.lastModified ?? null, fetchedAt: meta.fetchedAt ?? new Date().toISOString() },
    license: 'Deutscher Wetterdienst, Stationsliste SWIS — GeoNutzV',
    count: Object.keys(stations).length,
    skipped,
    stations,
  };
}

async function main() {
  const [outFile, ...rest] = process.argv.slice(2);
  if (!outFile) { console.error('usage: road-catalog.mjs <outFile> [--etag=…] [--file=…]'); process.exit(2); }
  const flag = (k) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const { normaliseRoad } = await import('../../src/road/roadContract.ts');
  let got;
  if (flag('file')) got = { changed: true, etag: flag('etag') ?? null, lastModified: null, buf: readFileSync(flag('file')) };
  else got = await fetchCatalog(flag('etag'));
  if (!got.changed) { console.log(JSON.stringify({ ok: true, changed: false, etag: got.etag })); return; }
  const file = catalogFile(got.buf, got, normaliseRoad);
  mkdirSync(dirname(outFile), { recursive: true });
  const tmp = `${outFile}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(file) + '\n');
  renameSync(tmp, outFile);
  console.log(JSON.stringify({ ok: true, changed: true, etag: file.source.etag, count: file.count, skipped: file.skipped }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
