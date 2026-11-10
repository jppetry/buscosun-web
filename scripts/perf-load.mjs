/**
 * perf-load.mjs — cold and warm page load of the five feature pages (Wetterkarte, Brandradar, Seewetter, Gletscher, Autobahn).
 *
 *   node scripts/perf-load.mjs --cur-dist=<dist> [--head-dist=<dist>] [--cert=cert.pem --key=key.pem]
 *        [--n=3] [--profiles=desktop,mobile4g] [--features=karte,brand,see,gletscher,autobahn] [--out=<file.json>] [--dump] [--order=25]
 *
 * Each build is served by `scripts/lib/shellServer.mjs` in its own process, the way Netlify serves it (route shells, cache
 * headers, ETag/304, brotli, HTTP/2 over TLS with `--cert`); chrome-headless-shell over CDP, SwiftShader WebGL. With a self-signed
 * certificate the browser trusts it by its SPKI hash (HTTP cache and service worker behave as on a valid certificate).
 *
 * One fresh browser context per run:
 *   cold  navigate to the page with an empty cache, IndexedDB and no service worker; wait until the network is quiet.
 *   warm  in the SAME context (HTTP cache, Cache Storage, IndexedDB, service worker as a returning visitor has them) open a blank
 *         page, then the feature page again; wait until quiet.
 * Per load: document TTFB, FCP, LCP, first WebGL draw, `usable` (= max(first draw, end of the last request of the start burst):
 * the page has drawn and fetched what it fetches on its own), requests (n, by class, bytes on the wire, served by SW / disk /
 * memory cache, failed), the first requests in order, main-thread gaps (rAF: max, sum over 50 ms ≈ blocking time), and the input
 * delay of a pointer move at `usable` (the handler runs when the main thread is free).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { X509Certificate, createHash } from 'node:crypto';
import { join } from 'node:path';
import { openBrowser, findHeadlessChrome, NET_PROFILES } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const N = Number(args.n ?? 3);
const PROFILES = (args.profiles ?? 'desktop,mobile4g').split(',');
const FEATURES = {
  karte: '/wetterkarte/temperatur/muenchen',
  brand: '/waldbrand',
  see: '/seewetter/borkum',
  gletscher: '/gletscher',
  autobahn: '/autobahnwetter/a8',
};
const FEATS = (args.features ?? Object.keys(FEATURES).join(',')).split(',');
const QUIET_MS = Number(args.quiet ?? 3000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r0 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x));
const q = (xs, p) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : null; };

const PROF = {
  desktop: { width: 1440, height: 900, mobile: false, net: null, cpu: 1, maxMs: 45_000 },
  mobile4g: { width: 402, height: 874, mobile: true, net: NET_PROFILES.fast4g, cpu: 4, maxMs: 90_000 },
};

// ---- build servers: `scripts/lib/shellServer.mjs` in child processes (Netlify's shells, cache headers, ETag, brotli, h2) ----------
const H2 = args.cert ? ['--cert=' + args.cert, '--key=' + args.key] : [];
/**
 * Chrome trusts the self-signed certificate by its SPKI hash. NOT `--ignore-certificate-errors`: a page with a certificate error is
 * kept out of the HTTP cache, so every warm load fetched all local files again (measured: 27 JS files, 533 kB per warm load).
 */
function spki(certFile) {
  const der = new X509Certificate(readFileSync(certFile)).publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('base64');
}
const servers = [];
function serve(dist) {
  if (!dist) return Promise.resolve(null);
  if (!existsSync(join(dist, 'index.html'))) { console.error(`dist fehlt: ${dist}`); process.exit(2); }
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [join('scripts', 'lib', 'shellServer.mjs'), dist, ...H2], { stdio: ['ignore', 'pipe', 'inherit'] });
    servers.push(child);
    let buf = '';
    child.stdout.on('data', (d) => { buf += String(d); const m = /READY (\S+)/.exec(buf); if (m) ok(m[1]); });
    child.on('exit', (c) => fail(new Error(`shellServer ${dist} beendet (${c})`)));
  });
}
const CUR = await serve(args['cur-dist'] ?? 'dist');
const HEAD = await serve(args['head-dist']);

// ---- in-page instrumentation --------------------------------------------------------------------------------------------
const INSTRUMENT = `(() => {
  const P = { firstDraw: null, lcp: null, gaps: { max: 0, over50: 0, block: 0, n: 0, list: [] }, input: [], errors: [], fetches: [] };
  const f0 = window.fetch; window.fetch = function (i, o) { if (P.fetches.length < 40) P.fetches.push([Math.round(performance.now()), ('/' + String(i && i.url || i).split('/').slice(3).join('/')).slice(0, 70)]); return f0.apply(this, arguments); };
  window.__perf = P;
  P.marks = {};
  document.addEventListener('DOMContentLoaded', () => { P.marks.dcl = Math.round(performance.now()); });
  new MutationObserver((recs, mo) => { const r = document.getElementById('root'); if (r && recs.some((x) => x.target === r || r.contains(x.target))) { P.marks.rootMut = P.marks.rootMut ?? Math.round(performance.now()); } }).observe(document, { subtree: true, childList: true });
  const s0 = Object.getOwnPropertyDescriptor(Document.prototype, 'currentScript');
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue; const p = C.prototype;
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) { const f = p[k]; if (!f) continue; p[k] = function (...a) { if (P.firstDraw == null) P.firstDraw = performance.now(); return f.apply(this, a); }; }
  }
  let last = 0; const tick = (t) => { if (last) { const d = t - last; P.gaps.n++; if (d > P.gaps.max) P.gaps.max = d; if (d > 50) { P.gaps.over50++; P.gaps.block += d - 50; if (d > 150 && P.gaps.list.length < 30) P.gaps.list.push([Math.round(t - d), Math.round(d)]); } } last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  for (const ev of ['pointermove', 'pointerdown']) window.addEventListener(ev, (e) => { P.input.push({ ev, delay: performance.now() - e.timeStamp, at: e.timeStamp }); }, true);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  window.addEventListener('error', (e) => P.errors.push(String(e.message).slice(0, 160)));
  window.addEventListener('unhandledrejection', (e) => P.errors.push('rejection: ' + String(e.reason && (e.reason.message || e.reason)).slice(0, 160)));
})();`;
const STATE = `(() => { const P = window.__perf; const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
  return { marks: P.marks, fetches: P.fetches, gapList: P.gaps.list, firstDraw: P.firstDraw, lcp: P.lcp, fcp, ttfb: nav ? nav.responseStart : null, gaps: P.gaps, input: P.input.slice(-4), errors: P.errors.slice(0, 6),
    sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), visible: document.visibilityState, path: location.pathname }; })()`;

const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell'); process.exit(2); }
// One browser per (profile, feature): a long-lived headless-shell with attached service-worker sessions was seen to hang on
// `Target.createBrowserContext` after ~10 contexts.
let browser = null;
async function launch() {
  if (browser) await browser.close().catch(() => {});
  swSessions.clear();
  browser = await openBrowser(chrome, { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(H2.length ? [`--ignore-certificate-errors-spki-list=${spki(args.cert)}`] : [])] });
  browser.on(onSwMessage);
  await browser.send('Target.setDiscoverTargets', { discover: true });
}
// The service worker's own fetches (network-first data, revalidation of assets) are invisible to the page session: attach to every
// service-worker target and record its network like the page's.
const swReqs = new Map();
const swSessions = new Set();
let swNet = null;   // the network profile of the running context: the worker's fetches are throttled like the page's

async function onSwMessage(msg) {
  if (msg.method === 'Target.targetCreated' && msg.params.targetInfo.type === 'service_worker') {
    try {
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId: msg.params.targetInfo.targetId, flatten: true });
      swSessions.add(sessionId);
      await browser.send('Network.enable', {}, sessionId);
      if (swNet) await browser.send('Network.emulateNetworkConditions', swNet, sessionId).catch(() => {});
      await browser.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
    } catch { /* target gone */ }
    return;
  }
  if (!msg.sessionId || !swSessions.has(msg.sessionId)) return;
  const p = msg.params;
  if (msg.method === 'Network.requestWillBeSent') swReqs.set(p.requestId, { url: p.request.url, t0: p.timestamp });
  else if (msg.method === 'Network.responseReceived') { const r = swReqs.get(p.requestId); if (r) Object.assign(r, { status: p.response.status, fromCache: !!p.response.fromDiskCache }); }
  else if (msg.method === 'Network.requestServedFromCache') { const r = swReqs.get(p.requestId); if (r) r.fromMemory = true; }
  else if (msg.method === 'Network.loadingFinished') { const r = swReqs.get(p.requestId); if (r) { r.bytes = p.encodedDataLength; r.t1 = p.timestamp; } }
  else if (msg.method === 'Network.loadingFailed') { const r = swReqs.get(p.requestId); if (r) { r.failed = p.errorText; r.t1 = p.timestamp; } }
}

function classify(url, base) {
  let u; try { u = new URL(url); } catch { return 'other'; }
  if (u.protocol === 'data:' || u.protocol === 'blob:') return 'inline';
  if (u.host === new URL(base).host) return /\/assets\/.*\.js$/.test(u.pathname) ? 'js' : /\/assets\/.*\.css$/.test(u.pathname) ? 'css' : /\/sw\.js$/.test(u.pathname) ? 'sw' : /\.html?$|^\/[^.]*$/.test(u.pathname) ? 'doc' : 'static';
  if (/buscosun-data|buscosun-archiv|buscosun-worldcover/.test(u.pathname)) return 'data:repo';
  if (/tile|basemaps|maptiler|openfreemap|carto|stadia|protomaps|terrarium|elevation|arcgisonline|tiles\./.test(u.host + u.pathname)) return 'tiles';
  if (/fonts\.(googleapis|gstatic)/.test(u.host)) return 'fonts';
  return `api:${u.host}`;
}

async function newCtx(prof) {
  swNet = prof.net;
  for (const sid of swSessions) await browser.send('Network.emulateNetworkConditions', prof.net ?? { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sid).catch(() => {});
  const ctx = await browser.newContext({ width: prof.width, height: prof.height, mobile: prof.mobile, net: prof.net, cpu: prof.cpu });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
  const consoleMsgs = [];
  const off = browser.on((msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) consoleMsgs.push(`${msg.params.type}: ${(msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)}`);
    else if (msg.method === 'Runtime.exceptionThrown') consoleMsgs.push(`exception: ${String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? '').slice(0, 200)}`);
  });
  return { ctx, consoleMsgs, off };
}

/** Wait until no request has started and none is in flight for `quietMs` (cap `maxMs`). */
async function waitQuiet(ctx, quietMs, maxMs) {
  const t0 = Date.now();
  let lastChange = Date.now(), lastSig = '';
  while (Date.now() - t0 < maxMs) {
    await sleep(200);
    const rs = ctx.requests();
    // a change = a request started or finished; a request that hangs does not hold the page „busy" for ever (counted as `hanging`)
    const sig = `${rs.length}:${rs.filter((r) => r.t1 == null).length}:${swReqs.size}`;
    if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= quietMs) return { quiet: true, ms: Date.now() - t0 };
  }
  return { quiet: false, ms: Date.now() - t0 };
}

async function profileTop(ctx, untilUs = Infinity) {
  const { profile } = await ctx.send('Profiler.stop', {});
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map(), total = new Map();
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const name = (cf) => `${cf.functionName || '(anon)'} ${cf.url ? cf.url.split('/').pop().replace(/-[\w-]{8}\.js$/, '') : ''}:${cf.lineNumber + 1}`;
  let ts = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    ts += profile.timeDeltas[i] ?? 0;
    if (ts > untilUs) break;   // only the window up to the first data request (same monotonic clock as the Network events)
    const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    let id = profile.samples[i];
    const k = name(byId.get(id).callFrame); self.set(k, (self.get(k) ?? 0) + dt);
    const seen = new Set();
    while (id != null) { const kk = name(byId.get(id).callFrame); if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) ?? 0) + dt); } id = parent.get(id); }
  }
  const skip = (k) => /^\((idle|program|garbage collector|root)\)/.test(k);
  const top = (m) => [...m.entries()].filter(([k]) => !skip(k)).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${Math.round(v)} ${k}`);
  return { self: top(self), total: top(total) };
}

async function load(ctx, consoleMsgs, base, path, prof, wantProfile = false) {
  if (wantProfile) { await ctx.send('Profiler.enable', {}); await ctx.send('Profiler.setSamplingInterval', { interval: 500 }); await ctx.send('Profiler.start', {}); }
  ctx.resetRequests();
  swReqs.clear();
  consoleMsgs.length = 0;
  await ctx.send('Page.navigate', { url: base + path });
  const w = await waitQuiet(ctx, QUIET_MS, prof.maxMs);
  const s = await ctx.evaluate(STATE).catch(() => null);
  // input probe: a pointer move in the middle of the page (harmless: no click, no drag)
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(prof.width / 2), y: Math.round(prof.height / 2) });
  await sleep(400);
  const s2 = await ctx.evaluate(STATE).catch(() => null);
  const reqs = ctx.requests();
  const doc = reqs.find((r) => r.type === 'Document') ?? reqs[0];
  const t0 = doc?.t0 ?? 0;
  const done = reqs.filter((r) => r.t1 != null && !r.url.startsWith('data:'));
  const lastEnd = done.length ? Math.max(...done.map((r) => (r.t1 - t0) * 1000)) : null;
  const by = {};
  let wireKb = 0, swN = 0, diskN = 0, memN = 0, failed = [];
  for (const r of reqs) {
    if (r.url.startsWith('data:') || r.url.startsWith('blob:')) continue;
    const k = classify(r.url, base); by[k] ??= { n: 0, kb: 0 }; by[k].n++; by[k].kb += (r.bytes ?? 0) / 1024;
    if (!r.fromSw && !r.fromCache && !r.fromMemory) wireKb += (r.bytes ?? 0) / 1024;
    if (r.fromSw) swN++; if (r.fromCache) diskN++; if (r.fromMemory) memN++;
    if (r.failed || (r.status && r.status >= 400)) failed.push(`${r.status ?? r.failed} ${r.url.slice(0, 120)}`);
  }
  for (const k of Object.keys(by)) by[k].kb = Math.round(by[k].kb);
  // what the service worker fetched over the network on behalf of the page (its disk-cache hits excluded)
  const swFetched = [...swReqs.values()].filter((r) => !r.fromCache && !r.fromMemory);
  const swWireKb = swFetched.reduce((a, r) => a + (r.bytes ?? 0), 0) / 1024;
  const swBy = {};
  for (const r of swFetched) { const k = classify(r.url, base); swBy[k] ??= { n: 0, kb: 0 }; swBy[k].n++; swBy[k].kb += (r.bytes ?? 0) / 1024; }
  for (const k of Object.keys(swBy)) swBy[k].kb = Math.round(swBy[k].kb);
  // Data identity (before/after): every data file the page read (data repo, foreign APIs; tiles and app assets left out) with its
  // status and size on the wire — same URL list and same bytes ⇒ the page computed from the same data.
  const dataRows = new Map();
  for (const r of [...reqs, ...swReqs.values()]) {
    const k = classify(r.url, base);
    if (!(k === 'data:repo' || k.startsWith('api:')) || r.method === 'OPTIONS') continue;
    const prev = dataRows.get(r.url);
    const bytes = r.fromCache || r.fromMemory || r.fromSw ? null : (r.bytes ?? null);
    dataRows.set(r.url, { status: r.status ?? prev?.status ?? r.failed ?? null, bytes: bytes ?? prev?.bytes ?? null });
  }
  const dataSig = [...dataRows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([u, v]) => `${v.status} ${v.bytes ?? '-'} ${u}`);
  const hanging = reqs.filter((r) => r.t1 == null && !r.url.startsWith('data:')).map((r) => r.url.slice(0, 100));
  const order = [...reqs].filter((r) => !r.url.startsWith('data:') && !r.url.startsWith('blob:')).sort((a, b) => a.t0 - b.t0).slice(0, Number(args.order ?? 25))
    .map((r) => `${Math.round((r.t0 - t0) * 1000)}…${r.t1 != null ? Math.round((r.t1 - t0) * 1000) : '—'} ${classify(r.url, base)} ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}${r.fromSw ? ' [sw]' : r.fromCache ? ' [disk]' : r.fromMemory ? ' [mem]' : ''}`);
  const firstDraw = s?.firstDraw ?? null;
  const dataT0 = reqs.filter((r) => classify(r.url, base) === 'data:repo').reduce((m, r) => Math.min(m, r.t0), Infinity);
  const profile = wantProfile ? { untilFirstData: await profileTop(ctx, dataT0 * 1e6).catch((e) => String(e)), firstDataMs: Math.round((dataT0 - t0) * 1000) } : undefined;
  return {
    profile,
    quiet: w.quiet, waitedMs: w.ms,
    ttfb: r0(s?.ttfb), fcp: r0(s?.fcp), lcp: r0(s?.lcp), firstDraw: r0(firstDraw), lastReq: r0(lastEnd),
    usable: r0(Math.max(firstDraw ?? 0, lastEnd ?? 0)),
    reqN: reqs.length, wireKb: Math.round(wireKb + swWireKb), swNetN: swFetched.length, swBy, dataSig, swNetKb: Math.round(swWireKb), hanging, swN, diskN, memN, failedN: failed.length, failed: failed.slice(0, 6), by,
    jsKb: by.js?.kb ?? 0, jsN: by.js?.n ?? 0,
    gapsMax: r0(s?.gaps?.max), block: r0(s?.gaps?.block), over50: s?.gaps?.over50 ?? null,
    inputDelay: r0(s2?.input?.filter((i) => i.ev === 'pointermove').at(-1)?.delay),
    sw: s?.sw ?? null, errors: s?.errors ?? [], console: consoleMsgs.slice(0, 6),
    ...(args.dump ? { order, marks: s?.marks, fetches: s?.fetches, gapList: s?.gapList } : {}),
  };
}

async function run(base, prof, feat) {
  const { ctx, consoleMsgs, off } = await newCtx(prof);
  const out = { feat, base: base === CUR ? 'cur' : 'head' };
  try {
    out.cold = await load(ctx, consoleMsgs, base, FEATURES[feat], prof, !!args.jsprofile);
    // a returning visitor: the service worker has had time to install and take control
    await ctx.evaluate('navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false').catch(() => null);
    await sleep(1500);
    await ctx.send('Page.navigate', { url: 'about:blank' });
    await sleep(500);
    out.warm = await load(ctx, consoleMsgs, base, FEATURES[feat], prof);
  } catch (e) {
    out.error = String(e?.message ?? e);
  } finally {
    off();
    for (const sid of swSessions) await browser.send('Target.detachFromTarget', { sessionId: sid }).catch(() => {});
    swSessions.clear();
    await ctx.close();
  }
  return out;
}

const KEYS = ['ttfb', 'fcp', 'lcp', 'firstDraw', 'usable', 'reqN', 'wireKb', 'jsKb', 'block', 'gapsMax', 'inputDelay', 'failedN'];
const line = (r) => KEYS.map((k) => `${k}=${r?.[k] ?? '—'}`).join(' ') + (r?.quiet === false ? ' NOT-QUIET' : '') + (r ? ` sw=${r.sw} swN=${r.swN} swNet=${r.swNetN}/${r.swNetKb}kB disk=${r.diskN} hang=${r.hanging.length}` : '');
const results = {};
for (const pn of PROFILES) {
  const prof = PROF[pn];
  results[pn] = {};
  for (const feat of FEATS) {
    await launch();
    await run(CUR, prof, feat);   // prime (connection set-up of the browser process, not counted)
    const runs = { cur: [], head: [] };
    for (let i = 0; i < N; i++) {
      for (const v of ['head', 'cur']) {
        const base = v === 'head' ? HEAD : CUR;
        if (!base) continue;
        const r = await run(base, prof, feat);
        runs[v].push(r);
        console.log(`${pn} ${feat} ${v} #${i + 1} COLD ${line(r.cold)}${r.error ? ' ERROR ' + r.error : ''}`);
        console.log(`${pn} ${feat} ${v} #${i + 1} WARM ${line(r.warm)}`);
      }
    }
    const summary = (xs, phase) => Object.fromEntries(KEYS.map((k) => [k, q(xs.map((r) => r[phase]?.[k] ?? null), 0.5)]));
    results[pn][feat] = {};
    for (const v of ['cur', 'head']) {
      if (!runs[v].length) continue;
      results[pn][feat][v] = { cold: summary(runs[v], 'cold'), warm: summary(runs[v], 'warm'), runs: runs[v] };
      console.log(`== ${pn} ${feat} ${v} p50 COLD`, JSON.stringify(results[pn][feat][v].cold));
      console.log(`== ${pn} ${feat} ${v} p50 WARM`, JSON.stringify(results[pn][feat][v].warm));
    }
  }
}
if (args.out) writeFileSync(args.out, JSON.stringify({ at: new Date().toISOString(), args, results }, null, 1));
console.log('fertig');
await browser.close().catch(() => {});
for (const c of servers) c.kill();
process.exit(0);
