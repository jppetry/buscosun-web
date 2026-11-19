// Phase RN trace: one read of the real reader against the real data repo, every request with offset, status, abort.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(repo, p)).href);
const t0 = Date.now();
const log = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  const rec = { url, at: Date.now() - t0, status: '…', done: null };
  log.push(rec);
  init?.signal?.addEventListener('abort', () => { if (rec.done == null) { rec.status += ' ABORTED'; rec.done = Date.now() - t0; } }, { once: true });
  try {
    const res = await realFetch(input, init);
    rec.status = String(res.status); rec.hdr = Date.now() - t0;
    return res;
  } catch (e) { rec.status = `ERR ${e?.name}`; rec.done = Date.now() - t0; throw e; }
};
const runs = await imp('src/sources/radolanRuns.ts');
const rv = await imp('src/sources/radolan.ts');
const now = Date.now();
const newest = runs.guessRvRuns(1, now)[0];
console.log(`newest guessed ${newest}, age ${Math.round((now - runs.rvStampToMs(newest)) / 1000)} s; rvRepoRuns(3) = ${runs.rvRepoRuns(3, now).join(', ')}`);
// event-loop stall meter: a 100-ms tick that reports how late it fires
let maxStall = 0, last = Date.now();
const tick = setInterval(() => { const d = Date.now() - last - 100; if (d > maxStall) maxStall = d; last = Date.now(); }, 100);
let nc = null, err = null;
try { nc = await rv.fetchRvNowcast(); } catch (e) { err = e; }
clearInterval(tick);
console.log(nc ? `read: run ${runs.rvStamp(nc.runAt)} · ${nc.frames.length} frames · ${Date.now() - t0} ms` : `read failed: ${err?.message}`);
console.log(`longest event-loop stall ${maxStall} ms; CDN usable afterwards: ${runs.radarCdnUsable()}`);
const short = (u) => u.replace('https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/radar/', 'CDN:').replace('https://raw.githubusercontent.com/jppetry/buscosun-data/main/radar/', 'RAW:');
const bySlot = {};
for (const r of log) { const k = short(r.url).replace(/\/[^/]+$/, ''); (bySlot[k] ??= []).push(r); }
for (const [k, rs] of Object.entries(bySlot)) {
  const st = {}; for (const r of rs) st[r.status] = (st[r.status] ?? 0) + 1;
  console.log(`  ${k}  ${rs.length} requests  @${rs[0].at}…${rs[rs.length - 1].at} ms  ${JSON.stringify(st)}`);
}
for (const r of log.filter((r) => !/^200$/.test(r.status) || /meta\.json|\.tar/.test(r.url)).slice(0, 14)) console.log(`    @${r.at} ms  hdr@${r.hdr ?? '–'}  ${r.status}  ${short(r.url)}`);
process.exit(0);
