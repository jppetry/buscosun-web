#!/usr/bin/env node
// SW-0 spike: do the open DWD CAP files carry lake (WARNCELLID 2…), high-sea (4…) or coast (5…) warnings?
// Every --every minutes fetch the DISTRICT and COMMUNEUNION LATEST zips (German), keep each new non-empty zip
// byte-exact under audit/seewetter/spike/cap/ and log which WARNCELLID types and event codes it contained.
// The CAP profile v2.1.14 lists lake warnings ("Wind auf Binnenseen") and high-sea codes 14/15/16; whether the open
// files carry them can only be seen while such a warning is active.
//
// Usage: node scripts/sea/spike/cap-watch.mjs [--loop] [--every=15]

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'audit/seewetter/spike/cap');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const VARIANTS = ['DISTRICT', 'COMMUNEUNION'];
const url = (v) => `https://opendata.dwd.de/weather/alerts/cap/${v}_DWD_STAT/Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMDWD_${v}_DE.zip`;

/** Minimal zip reader (local headers, stored or deflated) — enough for the DWD CAP archives. */
export function unzipEntries(buf) {
  const out = [];
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8), csize = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nlen).toString('utf8');
    const data = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + csize);
    out.push({ name, text: (method === 8 ? inflateRawSync(data) : data).toString('utf8') });
    p += 30 + nlen + xlen + csize;
  }
  return out;
}

async function once() {
  mkdirSync(OUT, { recursive: true });
  for (const v of VARIANTS) {
    try {
      const r = await fetch(url(v), { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const entries = unzipEntries(buf);
      const types = {}, events = {};
      for (const e of entries) {
        for (const m of e.text.matchAll(/<valueName>WARNCELLID<\/valueName>\s*<value>(\d)(\d+)<\/value>/g)) types[m[1]] = (types[m[1]] ?? 0) + 1;
        for (const m of e.text.matchAll(/<valueName>II<\/valueName>\s*<value>(\d+)<\/value>/g)) events[m[1]] = (events[m[1]] ?? 0) + 1;
      }
      const sea = Object.keys(types).filter((t) => '245'.includes(t));
      const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      const line = { at: new Date().toISOString(), variant: v, lastModified: r.headers.get('last-modified'), entries: entries.length, cellTypes: types, events, sea, sha };
      appendFileSync(join(OUT, 'log.jsonl'), JSON.stringify(line) + '\n');
      if (sea.length) {
        const f = join(OUT, `${v}_${sha}.zip`);
        if (!existsSync(f)) writeFileSync(f, buf);
      }
    } catch (e) { console.error(`[cap-watch] ${v}: ${e.message}`); }
  }
}

await once();
if (args.loop) for (;;) { await new Promise((r) => setTimeout(r, Number(args.every ?? 15) * 60_000)); await once(); }
