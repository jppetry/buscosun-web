// Phase RG — collector for the DWD 10-min precipitation truth: fetches every `now/` zip (≈ 0,7 MB for ≈ 1 370 stations,
// today's rows, hourly refresh) and merges the rows into one file per UTC day in the store (`<store>/<YYYYMMDD>.txt`,
// same columns as the DWD product; newer rows replace older ones for the same station and stamp). Run it a few times a day
// (before 00:00 UTC for a complete day); `--recent` additionally fetches `recent/` (≈ 280 MB, yesterday and the 500 days
// before — only the days named in `--days=YYYYMMDD,…` are kept) to close gaps. Station list is written to `<store>/stations.txt`.
// Usage: node audit/radar-regenschwelle/collect-cdc.mjs <store> [--recent --days=20261008,20261009] [--parallel=16]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
const [store, ...rest] = process.argv.slice(2);
if (!store) { console.error('usage: collect-cdc.mjs <store> [--recent --days=…] [--parallel=16]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const PAR = +(opt.parallel ?? 16);
const BASE = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes/precipitation/';
mkdirSync(store, { recursive: true });

/** Minimal zip reader (stored or deflate entries) — returns the first `produkt_*.txt` as latin1 text. */
function unzipProdukt(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  while (o + 30 <= bytes.length && v.getUint32(o, true) === 0x04034b50) {
    const method = v.getUint16(o + 8, true), csize = v.getUint32(o + 18, true), nlen = v.getUint16(o + 26, true), xlen = v.getUint16(o + 28, true);
    const name = Buffer.from(bytes.subarray(o + 30, o + 30 + nlen)).toString('latin1');
    const data = bytes.subarray(o + 30 + nlen + xlen, o + 30 + nlen + xlen + csize);
    if (/^produkt_.*\.txt$/.test(name)) return Buffer.from(method === 8 ? inflateRawSync(data) : data).toString('latin1');
    o += 30 + nlen + xlen + csize;
  }
  return null;
}
const dayFiles = new Map();   // day → Map(key → line)
function loadDay(day) {
  if (dayFiles.has(day)) return dayFiles.get(day);
  const m = new Map(); const p = join(store, `${day}.txt`);
  if (existsSync(p)) for (const line of readFileSync(p, 'latin1').split(/\r?\n/)) { const c = line.split(';'); if (c.length >= 6 && c[0].trim() !== 'STATIONS_ID') m.set(`${+c[0]}|${c[1].trim()}`, line.trim()); }
  dayFiles.set(day, m); return m;
}
function merge(text, keepDays) {
  let n = 0;
  for (const line of text.split(/\r?\n/)) { const c = line.split(';'); if (c.length < 6 || c[0].trim() === 'STATIONS_ID') continue; const stamp = c[1].trim(), day = stamp.slice(0, 8); if (keepDays && !keepDays.has(day)) continue; loadDay(day).set(`${+c[0]}|${stamp}`, line.trim()); n++; }
  return n;
}
async function fetchDir(sub, re, keepDays) {
  const html = await (await fetch(BASE + sub)).text();
  const names = [...new Set([...html.matchAll(re)].map((m) => m[0]))].sort();
  const list = /Beschreibung_Stationen\.txt/.exec(html)?.[0] ? html.match(/zehn_\w+_rr_Beschreibung_Stationen\.txt/)?.[0] : null;
  if (list) writeFileSync(join(store, `stations-${sub.replace('/', '')}.txt`), Buffer.from(await (await fetch(BASE + sub + list)).arrayBuffer()));
  let idx = 0, ok = 0, rows = 0, fail = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (idx < names.length) { const f = names[idx++]; try { const r = await fetch(BASE + sub + f, { signal: AbortSignal.timeout(120_000) }); if (!r.ok) { fail++; continue; } const t = unzipProdukt(new Uint8Array(await r.arrayBuffer())); if (!t) { fail++; continue; } rows += merge(t, keepDays); ok++; } catch (e) { fail++; } } }));
  console.log(`${sub}: ${names.length} listed, ${ok} merged (${rows} rows), ${fail} failed`);
}
await fetchDir('now/', /10minutenwerte_nieder_\d{5}_now\.zip/g, null);
if ('recent' in opt) { const days = new Set((opt.days ?? '').split(',').filter(Boolean)); if (!days.size) throw new Error('--recent braucht --days=YYYYMMDD,…'); await fetchDir('recent/', /10minutenwerte_nieder_\d{5}_akt\.zip/g, days); }
for (const [day, m] of dayFiles) { const lines = [...m.values()].sort(); writeFileSync(join(store, `${day}.txt`), 'STATIONS_ID;MESS_DATUM;  QN;RWS_DAU_10;RWS_10;RWS_IND_10;eor\n' + lines.join('\n') + '\n', 'latin1'); console.log(`${day}: ${lines.length} rows`); }
