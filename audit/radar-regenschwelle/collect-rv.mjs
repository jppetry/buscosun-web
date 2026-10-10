// Phase RG — collector: keeps the lead-0 analysis (`…_000-hd5`, ≈ 300 KB) of every RV tar the DWD currently lists
// (48 h rolling) in a local store. Re-run any time (cron-free, local); only missing slots are fetched, the tar is not kept.
// Usage: node audit/radar-regenschwelle/collect-rv.mjs <storeDir> [--parallel=6] [--max=N]
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const [store, ...rest] = process.argv.slice(2);
if (!store) { console.error('usage: collect-rv.mjs <storeDir> [--parallel=6] [--max=N]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const PAR = +(opt.parallel ?? 6), MAX = +(opt.max ?? 1e9);
const BASE = 'https://opendata.dwd.de/weather/radar/composite/rv/';
mkdirSync(store, { recursive: true });
const have = new Set(readdirSync(store).filter((f) => /^composite_rv_\d{8}_\d{4}_000-hd5$/.test(f)));
const html = await (await fetch(BASE)).text();
const names = [...new Set([...html.matchAll(/composite_rv_(\d{8}_\d{4})\.tar/g)].map((m) => m[1]))].sort();
const todo = names.filter((s) => !have.has(`composite_rv_${s}_000-hd5`)).slice(-MAX);
console.log(`listed ${names.length} (${names[0]} … ${names[names.length - 1]}), have ${have.size}, fetch ${todo.length}`);
// minimal ustar reader: 512-byte headers, size octal at 124, name at 0
function tarEntry(bytes, wanted) {
  let o = 0; const td = new TextDecoder();
  while (o + 512 <= bytes.length) {
    const name = td.decode(bytes.subarray(o, o + 100)).replace(/\0.*$/, ''); if (!name) break;
    const size = parseInt(td.decode(bytes.subarray(o + 124, o + 136)).replace(/\0.*$/, '').trim(), 8) || 0;
    if (wanted.test(name)) return bytes.subarray(o + 512, o + 512 + size);
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}
let ok = 0, fail = 0, idx = 0;
async function worker() {
  while (idx < todo.length) {
    const s = todo[idx++];
    const url = `${BASE}composite_rv_${s}.tar`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) { fail++; console.log(`${s} HTTP ${r.status}`); continue; }
      const bytes = new Uint8Array(await r.arrayBuffer());
      const e = tarEntry(bytes, /_000-hd5$/);
      if (!e) { fail++; console.log(`${s} no _000 entry`); continue; }
      writeFileSync(join(store, `composite_rv_${s}_000-hd5`), e);
      ok++;
    } catch (err) { fail++; console.log(`${s} ${err.message}`); }
  }
}
await Promise.all(Array.from({ length: PAR }, worker));
console.log(`done: ok ${ok}, failed ${fail}, store now ${readdirSync(store).length} files`);
