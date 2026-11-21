/**
 * range-bench.mjs — do parallel byte-range requests to ONE file of the image bucket stall in the browser? (phase SL)
 *
 * The viewer loads its tiles as range requests to one `TCI.tif`, six at a time. This bench asks the same kind of
 * requests from a bare page (no app): `batches` rounds of six ranges of ~190 KB, each round started when the one
 * before is through. Modes:
 *   default   — plain `fetch` (the browser's HTTP cache takes part)
 *   no-store  — `cache: 'no-store'` (the cache is bypassed)
 *   key       — plain `fetch`, but every range has its own address (`?r=<from>-<to>`): its own cache entry
 * Each mode gets its own browser context and its own byte offsets; `--again 1` asks the same ranges a second time
 * in the same context (does the answer come from the cache?). `--whole 1` adds the comparison "one tile of 1.9 MB
 * in one request / in six parts" per mode.
 *
 *   node audit/brandradar-satellitenbilder/range-bench.mjs [--base http://127.0.0.1:5199] [--batches 3] [--modes default,no-store,key]
 */
import { findHeadlessChrome, openBrowser } from '../../scripts/lib/cdpBrowser.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const BASE = arg('base', 'http://127.0.0.1:5199');
const BATCHES = Number(arg('batches', '3'));
const AGAIN = arg('again', '1') === '1';
const WHOLE = arg('whole', '0') === '1';
const HREF = arg('href', 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/30/T/UK/2026/8/S2B_30TUK_20260808_0_L2A/TCI.tif');
const PART = 190_000;

/** In the page: `rounds` = list of rounds, each a list of [from, to]; all requests of a round start together. */
const RUN = (href, mode, rounds) => `(async () => {
  const out = [];
  const rounds = ${JSON.stringify(rounds)};
  for (let b = 0; b < rounds.length; b++) {
    const t0 = performance.now();
    await Promise.all(rounds[b].map(async ([from, to], i) => {
      const e = { b, i, head: null, body: null, res: null };
      out.push(e);
      const ac = new AbortController();
      const kill = setTimeout(() => ac.abort(), 30000);
      try {
        const url = ${JSON.stringify(href)}${mode === 'key' ? " + '?r=' + from + '-' + to" : ''};
        const r = await fetch(url, { headers: { Range: 'bytes=' + from + '-' + to }, signal: ac.signal${mode === 'no-store' ? ", cache: 'no-store'" : ''} });
        e.head = Math.round(performance.now() - t0); e.res = r.status;
        e.n = (await r.arrayBuffer()).byteLength;
        e.body = Math.round(performance.now() - t0);
      } catch (err) { e.res = 'ERR ' + err.name; e.body = Math.round(performance.now() - t0); }
      clearTimeout(kill);
    }));
  }
  return out;
})()`;

const six = (start, len) => Array.from({ length: 6 }, (_, i) => [start + i * len, start + (i + 1) * len - 1]);
const show = (title, rows, nRounds) => {
  console.log(`  ${title}`);
  for (let b = 0; b < nRounds; b++) {
    const r = rows.filter((x) => x.b === b);
    console.log(`    Runde ${b + 1}: Kopf nach ${r.map((x) => String(x.head ?? '—').padStart(5)).join(' ')} ms · fertig nach ${r.map((x) => String(x.body).padStart(5)).join(' ')} ms · ${[...new Set(r.map((x) => x.res))].join(',')}`);
  }
  const heads = rows.map((x) => x.head).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`    Kopf-Wartezeit: Median ${heads[Math.floor(heads.length / 2)]} ms, Maximum ${heads[heads.length - 1]} ms, ohne Antwort in 30 s: ${rows.filter((x) => x.head == null).length} von ${rows.length}`);
};

const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 300_000 });
try {
  let start = Number(arg('start', '1000000'));
  for (const mode of arg('modes', 'default,no-store,key').split(',')) {
    const ctx = await browser.newContext({ url: `${BASE}/robots.txt` });
    const rounds = Array.from({ length: BATCHES }, (_, b) => six(start + b * 6 * PART, PART));
    console.log(`\ncache mode: ${mode}`);
    show('erster Abruf', await ctx.evaluate(RUN(HREF, mode, rounds)), BATCHES);
    if (AGAIN) {
      ctx.resetRequests();
      show('dieselben Bereiche noch einmal', await ctx.evaluate(RUN(HREF, mode, rounds)), BATCHES);
      const rs = ctx.requests().filter((r) => r.url.includes('sentinel-cogs'));
      console.log(`    davon aus dem Cache: ${rs.filter((r) => r.fromCache || r.fromMemory).length} von ${rs.length}, Bytes auf dem Draht ${rs.reduce((s, r) => s + (r.bytes ?? 0), 0)}`);
    }
    start += BATCHES * 6 * PART;
    if (WHOLE) {
      // One tile of the 10 m level (1.9 MB): in one request, then (other bytes of the same size) in six parts side by side.
      const size = 1_900_000;
      const one = await ctx.evaluate(RUN(HREF, mode, [[[start, start + size - 1]]]));
      const parts = await ctx.evaluate(RUN(HREF, mode, [six(start + size, Math.ceil(size / 6))]));
      console.log(`  1,9 MB in einem Abruf: ${one[0].body} ms · in sechs Teilen: ${Math.max(...parts.map((x) => x.body))} ms (${[...new Set([...one, ...parts].map((x) => x.res))].join(',')})`);
      start += 2 * size + 6;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
process.exit(0);
