// Phase RN live probe: the real reader against the real data repo (real clock, real fetch — only logged).
// Usage: node --experimental-strip-types --import <repo>/scripts/lib/register-ts.mjs rn-live.mjs <repo>
// Waits for the window BEFORE the image gate of the newest slot (age 200…255 s), reads, then follows `rvFollowUpInMs`.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(repo, p)).href);
const log = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  const rec = { url, at: Date.now(), status: 0 };
  log.push(rec);
  if (url.startsWith('/')) { rec.status = -1; throw new TypeError(`relative URL (DWD/Netlify way) requested: ${url}`); }
  const res = await realFetch(input, init);
  rec.status = res.status;
  return res;
};

const runs = await imp('src/sources/radolanRuns.ts');
const rv = await imp('src/sources/radolan.ts');
const hostOf = (u) => (u.startsWith('/') ? '(relative → Netlify/DWD)' : new URL(u).host);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmmss = (ms) => new Date(ms).toISOString().slice(11, 19);

const summary = (from) => {
  const part = log.slice(from);
  const hosts = {};
  for (const r of part) hosts[hostOf(r.url)] = (hosts[hostOf(r.url)] ?? 0) + 1;
  const st = {};
  for (const r of part) st[r.status] = (st[r.status] ?? 0) + 1;
  const dwd = part.filter((r) => r.url.includes('_dwd_opendata') || r.url.includes('opendata.dwd.de')).length;
  return { requests: part.length, hosts, status: st, dwd };
};

// 1) wait for the pre-gate window of the newest guessed slot
for (;;) {
  const now = Date.now();
  const newest = runs.guessRvRuns(1, now)[0];
  const age = now - runs.rvStampToMs(newest);
  if (age >= 200_000 && age <= 255_000) break;
  await sleep(2000);
}
{
  const now = Date.now();
  const newest = runs.guessRvRuns(1, now)[0];
  const age = Math.round((now - runs.rvStampToMs(newest)) / 1000);
  console.log(`[${hhmmss(now)} UTC] newest guessed slot ${newest}, age ${age} s (image gate ${runs.RV_IMG_GATE_MS / 1000} s) — rvDwdDirect=${runs.rvDwdDirect()}`);
  console.log(`  rvRepoRuns(3) = ${runs.rvRepoRuns(3, now).join(', ')}`);
  const n0 = log.length;
  const t = Date.now();
  const nc = await rv.fetchRvNowcast();
  console.log(`  read #1: run ${runs.rvStamp(nc.runAt)} · ${nc.frames.length} frames · ${Date.now() - t} ms · ${JSON.stringify(summary(n0))}`);
  const fu = rv.rvFollowUpInMs(nc.runAt.getTime());
  console.log(`  rvFollowUpInMs = ${fu} ms`);
  let held = nc;
  let wait = fu;
  for (let i = 2; wait != null && i <= 5; i++) {
    await sleep(wait);
    const n1 = log.length;
    const t1 = Date.now();
    const nc2 = await rv.fetchRvNowcast();
    const ageNow = Math.round((Date.now() - runs.rvStampToMs(newest)) / 1000);
    console.log(`[${hhmmss(Date.now())} UTC] read #${i} (slot ${newest} now ${ageNow} s old): run ${runs.rvStamp(nc2.runAt)} · same object as before: ${nc2 === held} · ${Date.now() - t1} ms · ${JSON.stringify(summary(n1))}`);
    held = nc2;
    wait = rv.rvFollowUpInMs(nc2.runAt.getTime());
    console.log(`  rvFollowUpInMs = ${wait}`);
  }
}
const all = summary(0);
console.log(`TOTAL ${JSON.stringify(all)}`);
console.log(all.dwd === 0 ? 'RESULT: 0 requests to the DWD' : `RESULT: ${all.dwd} requests to the DWD`);
process.exit(0);
