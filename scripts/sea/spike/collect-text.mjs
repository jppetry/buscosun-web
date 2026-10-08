#!/usr/bin/env node
// SW-0 spike: collect DWD maritime text bulletins byte-exact (raw bytes + SHA-256).
//
// Lists https://opendata.dwd.de/weather/maritime/forecast/german/, downloads every issue file
// (<PROD>_EDZW_<DDHHMM>, not _LATEST) that is not yet in the collection, sequentially, and writes
//   audit/seewetter/fixtures/collected/<name>          raw bytes, never re-encoded
//   audit/seewetter/fixtures/collected/index.json      name, bytes, sha256, lastModified, fetchedAt, header line
// With --loop it repeats every --every minutes (default 15) until killed.
//
// Usage: node scripts/sea/spike/collect-text.mjs [--loop] [--every=15] [--out=<dir>]

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renameRetrySync } from './renameRetry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE = 'https://opendata.dwd.de/weather/maritime/forecast/german/';
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const OUT = resolve(ROOT, typeof args.out === 'string' ? args.out : 'audit/seewetter/fixtures/collected');
const EVERY_MIN = Number(args.every ?? 15);
const PRODUCTS = ['FQEN50', 'FQEN51', 'WODL45', 'FXDL40', 'FQMM60'];

mkdirSync(OUT, { recursive: true });
const indexPath = join(OUT, 'index.json');

function loadIndex() {
  if (!existsSync(indexPath)) return { source: BASE, license: 'Deutscher Wetterdienst, GeoNutzV', files: {} };
  return JSON.parse(readFileSync(indexPath, 'utf8'));
}

function saveIndex(idx) {
  const tmp = indexPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(idx, null, 1) + '\n');
  renameRetrySync(tmp, indexPath);
}

function headerLine(buf) {
  // WMO bulletin: SOH, CR CR LF, sequence number, CR CR LF, heading "TTAAii CCCC YYGGgg"
  const text = buf.toString('latin1');
  const m = /([A-Z]{4}\d{2} [A-Z]{4} \d{6})/.exec(text.slice(0, 120));
  return m ? m[1] : null;
}

async function once() {
  const idx = loadIndex();
  let listing;
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`listing HTTP ${r.status}`);
    listing = await r.text();
  } catch (e) {
    console.error(`[collect-text] ${new Date().toISOString()} listing failed: ${e.message}`);
    return 0;
  }
  const names = [...listing.matchAll(/href="([A-Z0-9]+_EDZW_\d{6})"/g)].map((m) => m[1])
    .filter((n) => PRODUCTS.includes(n.slice(0, 6)));
  let added = 0;
  for (const name of names) {
    if (idx.files[name]) continue;
    try {
      const r = await fetch(BASE + name, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(join(OUT, name), buf);
      idx.files[name] = {
        bytes: buf.length,
        sha256: createHash('sha256').update(buf).digest('hex'),
        lastModified: r.headers.get('last-modified'),
        fetchedAt: new Date().toISOString(),
        header: headerLine(buf),
      };
      added++;
      saveIndex(idx);
    } catch (e) {
      console.error(`[collect-text] ${name}: ${e.message}`);
    }
  }
  console.log(`[collect-text] ${new Date().toISOString()} listed ${names.length}, added ${added}, total ${Object.keys(idx.files).length}`);
  return added;
}

await once();
if (args.loop) {
  for (;;) {
    await new Promise((r) => setTimeout(r, EVERY_MIN * 60_000));
    await once();
  }
}
