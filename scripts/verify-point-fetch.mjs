/**
 * verify-point-fetch.mjs — deadlines of the point-cube download layer (phase PT1,
 * `audit/punkt-cron-t1-stillstand.md`).
 *
 * The t1 tier stalled from 2026-11-17 on because ONE upstream (GeoSphere `nwp-v2-1h-1km`) hung or
 * answered 502/503, and neither a request nor a source had a time limit. This verifier drives the
 * REAL functions of `scripts/point/adapters/shared.mjs` against a local HTTP server that behaves
 * like the broken upstream, and the real drop rule of `scripts/point/sourceBudget.mjs`.
 *
 * No network. Runtime ≈ 15 s (the waits are the behaviour under test).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-point-fetch.mjs
 */
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The limits are read once at module load ⇒ set them BEFORE the dynamic import.
const TIMEOUT_S = 0.4, OUTAGE_S = 1;
const cache = mkdtempSync(join(tmpdir(), 'point-fetch-'));
process.env.POINT_CACHE = cache;
process.env.POINT_FETCH_TIMEOUT_S = String(TIMEOUT_S);
process.env.POINT_OUTAGE_WAIT_S = String(OUTAGE_S);
delete process.env.POINT_FAULT_INJECT;

const results = [];
const add = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

// ── a local upstream that misbehaves on purpose ──────────────────────────────
const hits = {};
const open = new Set();
const srv = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const n = hits[path] = (hits[path] ?? 0) + 1;
  open.add(res);
  res.on('close', () => open.delete(res));
  const send = (status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
  if (path.startsWith('/hang')) return;                                    // never answers
  if (path === '/stall') { res.writeHead(200, { 'content-length': '1000' }); res.write('abc'); return; }   // headers, then silence
  if (path === '/outage') return send(503, '{"message":"failure to get a peer from the ring-balancer"}');
  if (path === '/later') return n <= 3 ? send(503, 'later', { 'retry-after': '1' }) : send(200, 'ok');
  if (path === '/limit') return n <= 2 ? send(429, 'slow down') : send(200, 'ok');
  if (path === '/gone') return send(404, 'nope');
  if (path === '/bad') return send(502, 'bad gateway');
  if (path === '/slow') return void setTimeout(() => send(200, 'ok'), 150);
  if (path === '/ok.json') return send(200, '{"a":1}', { 'content-type': 'application/json' });
  return send(200, 'ok');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;

/** Settle a promise or report it as still pending after `ms` — a hang must fail the check, not the verifier. */
async function within(promise, ms) {
  const t0 = Date.now();
  let timer;
  const guard = new Promise((r) => { timer = setTimeout(() => r({ state: 'pending' }), ms); });
  const run = promise.then((value) => ({ state: 'resolved', value }), (error) => ({ state: 'rejected', error }));
  const out = await Promise.race([run, guard]);
  clearTimeout(timer);
  return { ...out, ms: Date.now() - t0 };
}
const text = (u8) => (u8 ? Buffer.from(u8).toString('utf8') : u8);

const { fetchBytes, fetchJson, headOk, fetchRanges, netStats } = await import('./point/adapters/shared.mjs');

// One hung URL may cost two deadlines, plus scheduling slack — never more.
const HANG_MAX_MS = 2 * TIMEOUT_S * 1000 + 1500;

console.log('\n(A) one request has a deadline');
{
  const r = await within(fetchBytes(`${base}/hang`), 6000);
  add('A1 a request that never answers is given up', r.state === 'rejected', `${r.state} after ${r.ms} ms`);
  add('A2 … within two deadlines', r.state === 'rejected' && r.ms <= HANG_MAX_MS, `${r.ms} ms, limit ${HANG_MAX_MS} ms`);
  add('A3 … after at most three attempts (a hang is expensive, five retries are not affordable)',
    hits['/hang'] >= 2 && hits['/hang'] <= 3, `${hits['/hang']} attempts`);
  add('A4 … and is an error that names the deadline, never "not there" (AbortError ≠ absent)',
    r.state === 'rejected' && /Frist|timeout/i.test(r.error?.message ?? ''), r.error?.message ?? String(r.value));
}
{
  const r = await within(fetchBytes(`${base}/stall`), 6000);
  add('A5 a body that stops arriving is given up as well', r.state === 'rejected' && r.ms <= HANG_MAX_MS, `${r.state} after ${r.ms} ms`);
}
{
  const r = await within(fetchBytes(`${base}/slow`), 6000);
  add('A6 a slow answer inside the deadline is still taken', r.state === 'resolved' && text(r.value) === 'ok', `${r.state} after ${r.ms} ms`);
}
{
  const r = await within(fetchJson(`${base}/hang.json`), 6000);
  add('A7 fetchJson: a hung list is given up within two deadlines', r.state === 'rejected' && r.ms <= HANG_MAX_MS, `${r.state} after ${r.ms} ms`);
  const ok = await within(fetchJson(`${base}/ok.json`), 6000);
  add('A8 fetchJson: a healthy list still parses', ok.state === 'resolved' && ok.value?.a === 1);
}
{
  const r = await within(headOk(`${base}/hang-head`), 6000);
  add('A9 headOk: a hung probe ends within two deadlines', r.state !== 'pending' && r.ms <= HANG_MAX_MS, `${r.state} after ${r.ms} ms`);
}
{
  const r = await within(fetchRanges(`${base}/hang-range`, [{ offset: 0, length: 4 }]), 6000);
  add('A10 fetchRanges: a hung range request is given up within two deadlines', r.state === 'rejected' && r.ms <= HANG_MAX_MS, `${r.state} after ${r.ms} ms`);
}

console.log('\n(B) an outage is not a rate limit');
{
  const r = await within(fetchBytes(`${base}/outage`), 8000);
  const lim = OUTAGE_S * 1000 + 2500;
  add('B1 503 without Retry-After is given up after the outage wait, not after ten minutes',
    r.state === 'rejected' && r.ms <= lim, `${r.state} after ${r.ms} ms, limit ${lim} ms`);
  add('B2 … and the error says outage', r.state === 'rejected' && /503/.test(r.error?.message ?? '') && /Ausfall/.test(r.error?.message ?? ''), r.error?.message ?? '');
}
{
  const r = await within(fetchBytes(`${base}/later`), 12000);
  add('B3 503 WITH Retry-After keeps the long throttle budget (3 s of waiting > outage wait) and succeeds',
    r.state === 'resolved' && text(r.value) === 'ok' && r.ms > OUTAGE_S * 1000, `${r.state} after ${r.ms} ms, ${hits['/later']} requests`);
}
{
  const r = await within(fetchBytes(`${base}/limit`), 12000);
  add('B4 429 is throttling as before: waited out, no attempt spent', r.state === 'resolved' && text(r.value) === 'ok', `${r.state} after ${r.ms} ms`);
}

console.log('\n(C) what must not change');
{
  const r = await within(fetchBytes(`${base}/gone`), 6000);
  add('C1 404 is an answer: null, one request', r.state === 'resolved' && r.value === null && hits['/gone'] === 1, `${hits['/gone']} request(s)`);
}
{
  const r = await within(fetchBytes(`${base}/bad`), 12000);
  add('C2 a fast error (502) still gets five attempts and then throws its status',
    r.state === 'rejected' && /HTTP 502/.test(r.error?.message ?? '') && hits['/bad'] === 5, `${hits['/bad']} attempts, ${r.ms} ms`);
}
{
  const r1 = await within(fetchBytes(`${base}/plain`), 6000);
  const before = netStats().cached;
  const r2 = await within(fetchBytes(`${base}/plain`), 6000);
  add('C3 a good answer is cached on disk (second call without a request)',
    text(r1.value) === 'ok' && text(r2.value) === 'ok' && hits['/plain'] === 1 && netStats().cached === before + 1);
}

console.log('\n(D) a source has a time budget');
const budget = await import('./point/sourceBudget.mjs').catch((e) => { add('D0 scripts/point/sourceBudget.mjs loads', false, e.message.split('\n')[0]); return null; });
if (budget) {
  const { noteLostTime, SRC_MAX_LOST_MS, SRC_SLOW_CALL_MS } = budget;
  add('D0 defaults: 300 s lost time per source and tier, a call counts as slow from 30 s', SRC_MAX_LOST_MS === 300_000 && SRC_SLOW_CALL_MS === 30_000,
    `${SRC_MAX_LOST_MS} / ${SRC_SLOW_CALL_MS}`);

  // healthy source: long successful calls never count
  const healthy = { id: 'icon_d2' };
  let v = null;
  for (let i = 0; i < 1000 && !v; i++) v = noteLostTime(healthy, true, 40_000);
  add('D1 a source without any error is never dropped for being slow', v === null && (healthy.msLost ?? 0) === 0, `msLost ${healthy.msLost ?? 0}`);

  // hung source: two calls that each waited two deadlines
  const hung = { id: 'claef', errors: 0 };
  hung.errors = 1; const h1 = noteLostTime(hung, false, 240_000);
  hung.errors = 2; const h2 = noteLostTime(hung, false, 240_000);
  add('D2 failed calls add up: 240 s is inside the budget, 480 s is not', h1 === null && typeof h2 === 'string' && /480 s/.test(h2), `${h1} | ${h2}`);

  // flapping source: one error, then answers that take 50 s each
  const flap = { id: 'claef', errors: 1 };
  noteLostTime(flap, false, 10_000);
  const seq = [];
  for (let i = 0; i < 8; i++) seq.push(noteLostTime(flap, true, 50_000));
  const at = seq.findIndex((x) => x);
  add('D3 after its first error a source also pays for slow answers (10 s + 6 × 50 s > 300 s)', at === 5, `dropped at slow call ${at + 1}`);

  // recovered source: one error, afterwards fast
  const ok = { id: 'ifs_hres', errors: 1 };
  noteLostTime(ok, false, 5_000);
  let w = null;
  for (let i = 0; i < 500 && !w; i++) w = noteLostTime(ok, true, 4_000);
  add('D4 fast answers after an error cost nothing', w === null && ok.msLost === 5_000, `msLost ${ok.msLost}`);

  // the producer uses the rule, and keeps the count rule next to it
  const prod = readFileSync(join(ROOT, 'scripts/point/build-point-cube.mjs'), 'utf8');
  add('D5 safeCall applies the time budget and writes it as `dropped`',
    /import \{ noteLostTime \} from '\.\/sourceBudget\.mjs'/.test(prod) && /noteLostTime\(c, ok, /.test(prod));
  add('D6 the error-count rule is still there', /c\.errors > SRC_MAX_ERRORS/.test(prod));
}

for (const res of open) res.destroy();
srv.closeAllConnections?.();
srv.close();
try { rmSync(cache, { recursive: true, force: true }); } catch { /* a leftover temp folder is not a failure */ }

const failed = results.filter((r) => !r.ok);
console.log(`\nverify:point-fetch — ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
