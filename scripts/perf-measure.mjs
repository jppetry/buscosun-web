/**
 * perf-measure.mjs — reproducible baseline/after measurement of the three findings of 10.10.2026 (audit/performance-2026-10-10.md):
 *
 *   click   `/` → click on the tile „Regenradar / Nowcast öffnen": input delay (handler start − event stamp), first DOM change,
 *           URL change, first WebGL draw of the new view.
 *   layer   `/wetterkarte/temperatur/<ort>` → click on the layer switch „Niederschlag": input delay, feedback (aria-checked),
 *           first radar texture + draw after the click.
 *   fusion  `/wetterkarte/wind/<ort>?ansicht=dashboard` → performance marks `dbd:fusion:first|core` (buscosun Fusion, Dashboard),
 *           the requests of the cube path (point/, obs/, tables) with bytes and timing.
 *   radar   `/regenradar/<ort>` → first map draw, first radar picture (first draw after a radar-sized texture upload), the moment the
 *           last radar file has arrived, bytes per origin class, rAF gaps (stand-in for long tasks — not observable in headless-shell),
 *           then a click on the play button (input delay + feedback).
 *
 *   node scripts/perf-measure.mjs --cur=http://127.0.0.1:5301 --cur-dist=dist [--head=http://127.0.0.1:5302 --head-dist=<dist>]
 *        [--n=3] [--profiles=desktop,mobile4g] [--scenarios=click,layer,fusion,radar] [--ort=muenchen] [--out=<file.json>]
 *        [--h2-cert=cert.pem --h2-key=key.pem] [--jsprofile]
 *
 * Production builds via `vite preview`; in front of each a shell proxy that answers document requests with the Netlify shell of the
 * route (`dist/<route>.html`, `dist/<route>--<sub>.html`, else index.html) and speaks HTTP/2 over TLS to the browser when a cert is
 * given (Netlify's transport; otherwise HTTP/1.1 with six connections penalises the build with more chunks). One fresh browser
 * context per run (cold cache, empty IndexedDB) — the definition of „kalt" since AP12. Variants alternate inside ONE browser; a
 * prime run per profile warms the connection and does not count. Only numbers measured inside one run are compared.
 */
import http from 'node:http';
import http2 from 'node:http2';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, findHeadlessChrome, NET_PROFILES } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const N = Number(args.n ?? 3);
const ORT = args.ort ?? 'muenchen';
const PROFILES = (args.profiles ?? 'desktop,mobile4g').split(',');
const SCENARIOS = (args.scenarios ?? 'click,layer,fusion,radar').split(',');
const H2 = args['h2-cert'] ? { cert: readFileSync(args['h2-cert']), key: readFileSync(args['h2-key']) } : null;
const JSPROFILE = !!args.jsprofile;
const QUERY = args.query ? String(args.query).replace(/^[?&]/, '') : '';
const withQuery = (path) => (QUERY ? `${path}${path.includes('?') ? '&' : '?'}${QUERY}` : path);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (xs, p) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : null; };
const r0 = (x) => (x == null ? null : Math.round(x));

const PROF = {
  desktop: { width: 1440, height: 900, mobile: false, net: null, cpu: 1 },
  mobile4g: { width: 402, height: 874, mobile: true, net: NET_PROFILES.fast4g, cpu: 4 },
};

// ---------------------------------------------------------------------------------------------------------------------
// Shell proxy (Netlify's document rules on top of `vite preview`)
// ---------------------------------------------------------------------------------------------------------------------
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'http2-settings', 'host']);
const cleanHeaders = (h) => Object.fromEntries(Object.entries(h).filter(([k]) => !k.startsWith(':') && !HOP.has(k.toLowerCase())));
function netlifyShell(dist, pathname) {
  const seg = pathname.split('/').filter(Boolean);
  if (!seg.length) return join(dist, 'index.html');
  if (seg.length >= 2 && existsSync(join(dist, `${seg[0]}--${seg[1]}.html`))) return join(dist, `${seg[0]}--${seg[1]}.html`);
  if (existsSync(join(dist, `${seg[0]}.html`))) return join(dist, `${seg[0]}.html`);
  return join(dist, 'index.html');
}
function shellProxy(base, dist) {
  const target = new URL(base);
  const handler = (req, res) => {
    const u = new URL(req.url, base);
    const isDoc = req.method === 'GET' && /text\/html/.test(req.headers.accept ?? '') && !/\.[a-z0-9]{2,5}$/i.test(u.pathname);
    if (isDoc) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(readFileSync(netlifyShell(dist, u.pathname))); return; }
    const up = http.request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...cleanHeaders(req.headers), host: target.host } }, (r) => { res.writeHead(r.statusCode ?? 502, cleanHeaders(r.headers)); r.pipe(res); });
    up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  };
  const srv = H2 ? http2.createSecureServer({ ...H2, allowHTTP1: true }, handler) : http.createServer(handler);
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ url: `${H2 ? 'https' : 'http'}://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}
const proxies = [];
async function baseFor(url, dist) {
  if (!url) return null;
  if (!dist || !existsSync(join(dist, 'index.html'))) { console.error(`dist fehlt: ${dist}`); process.exit(2); }
  const p = await shellProxy(url, dist); proxies.push(p); return p.url;
}
const CUR = await baseFor(args.cur ?? 'http://127.0.0.1:5301', args['cur-dist'] ?? 'dist');
const HEAD = await baseFor(args.head ?? null, args['head-dist']);

// ---------------------------------------------------------------------------------------------------------------------
// In-page instrumentation (before the first script of the document)
// ---------------------------------------------------------------------------------------------------------------------
const INSTRUMENT = `(() => {
  const P = { firstDraw: null, radarTex: null, radarTexN: 0, radarDraw: null, radarTexNZ: null, radarDrawNZ: null, gaps: { max: 0, maxAt: 0, over50: 0, over100: 0, over200: 0, n: 0, list: [] }, input: [], click: null };
  window.__perf = P;
  const RADAR = new Set(['1100x1200', '701x431', '710x640', '600x512']);
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue; const p = C.prototype;
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) { const f = p[k]; if (!f) continue; p[k] = function (...a) { const t = performance.now(); if (P.firstDraw == null) P.firstDraw = t; if (P.radarTex != null && P.radarDraw == null) P.radarDraw = t; if (P.radarTexNZ != null && P.radarDrawNZ == null) P.radarDrawNZ = t; if (P.click && P.click.at != null && P.click.draw == null) P.click.draw = t; return f.apply(this, a); }; }
    for (const k of ['texImage2D', 'texSubImage2D']) { const f = p[k]; if (!f) continue; p[k] = function (...a) {
      let w = null, h = null;
      if (k === 'texImage2D' && a.length >= 9 && typeof a[3] === 'number') { w = a[3]; h = a[4]; }
      else if (k === 'texSubImage2D' && a.length >= 9 && typeof a[4] === 'number') { w = a[4]; h = a[5]; }
      else { const s = a[a.length - 1]; if (s && typeof s === 'object' && s.width) { w = s.width; h = s.height; } }
      if (w && h && RADAR.has(w + 'x' + h)) { const t = performance.now(); if (P.radarTex == null) P.radarTex = t; P.radarTexN++; const px = a[a.length - 1]; if (P.radarTexNZ == null && px && px.length) { for (let i = 0; i < px.length; i += 97) { if (px[i]) { P.radarTexNZ = t; break; } } } }
      return f.apply(this, a); }; }
  }
  let last = 0; const tick = (t) => { if (last) { const d = t - last; P.gaps.n++; if (d > P.gaps.max) { P.gaps.max = d; P.gaps.maxAt = t; } if (d > 50) P.gaps.over50++; if (d > 100) { P.gaps.over100++; if (P.gaps.list.length < 80) P.gaps.list.push([Math.round(t), Math.round(d)]); } if (d > 200) P.gaps.over200++; } last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  for (const ev of ['pointerdown', 'click']) window.addEventListener(ev, (e) => { P.input.push({ ev, delay: performance.now() - e.timeStamp, at: e.timeStamp }); }, true);
  P.arm = (sel, pred) => {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return null;
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
    const r = el.getBoundingClientRect();
    const C = { at: null, firstMutation: null, urlChange: null, paint: null, pred: null, path0: location.pathname + location.search };
    P.click = C; P.firstDraw = null; P.radarTex = null; P.radarTexN = 0; P.radarDraw = null; P.radarTexNZ = null; P.radarDrawNZ = null; P.input = [];
    const mo = new MutationObserver(() => { const t = performance.now(); if (C.at == null) return; if (C.firstMutation == null) { C.firstMutation = t; requestAnimationFrame(() => { C.paint = performance.now(); }); } if (C.urlChange == null && location.pathname + location.search !== C.path0) C.urlChange = t; if (C.pred == null && pred && pred(el)) C.pred = t; });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    C.mark = () => { C.at = performance.now(); };
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, label: el.getAttribute('aria-label') || el.title || el.className };
  };
  performance.setResourceTimingBufferSize(5000);
})();`;

const STATE = `(() => { const P = window.__perf; const m = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null;
  const res = performance.getEntriesByType('resource');
  const data = res.filter((r) => /buscosun-data|raw\\.githubusercontent/.test(r.name));
  const radar = data.filter((r) => /\\/radar\\/img\\//.test(r.name));
  const point = data.filter((r) => /\\/point\\//.test(r.name));
  const obs = data.filter((r) => /\\/obs\\//.test(r.name));
  const end = (xs) => xs.length ? Math.max(...xs.map((r) => r.responseEnd)) : null;
  const sum = (xs) => xs.reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0);
  return { firstDraw: P.firstDraw, radarTex: P.radarTex, radarTexN: P.radarTexN, radarDraw: P.radarDraw, radarTexNZ: P.radarTexNZ, radarDrawNZ: P.radarDrawNZ, gaps: { ...P.gaps, list: P.gaps.list.slice(0, 40) }, input: P.input.slice(-4), click: P.click && { at: P.click.at, firstMutation: P.click.firstMutation, urlChange: P.click.urlChange, paint: P.click.paint, pred: P.click.pred, draw: P.click.draw },
    marks: { start: m('dbd:fusion:start'), first: m('dbd:fusion:first'), core: m('dbd:fusion:core'), final: m('dbd:fusion:final') },
    radarN: radar.length, radarEnd: end(radar), radarKb: Math.round(sum(radar) / 1024), pointN: point.length, pointEnd: end(point), pointKb: Math.round(sum(point) / 1024), obsN: obs.length, obsEnd: end(obs), obsKb: Math.round(sum(obs) / 1024),
    dataN: data.length, dataKb: Math.round(sum(data) / 1024), jsKb: Math.round(sum(res.filter((r) => /\\/assets\\/.*\\.js$/.test(r.name))) / 1024), jsN: res.filter((r) => /\\/assets\\/.*\\.js$/.test(r.name)).length,
    path: location.pathname + location.search, consoleErrors: window.__perfErrors || null }; })()`;

// ---------------------------------------------------------------------------------------------------------------------
const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell'); process.exit(2); }
const browser = await openBrowser(chrome, { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(H2 ? ['--ignore-certificate-errors'] : [])] });

function classify(url, base) {
  let u; try { u = new URL(url); } catch { return 'other'; }
  if (u.host === new URL(base).host) return /\/assets\/.*\.js$/.test(u.pathname) ? 'js' : /\/assets\/.*\.css$/.test(u.pathname) ? 'css' : /\.(png|svg|woff2?|json|webp)$/.test(u.pathname) ? 'asset' : 'doc/other';
  if (/jsdelivr|raw\.githubusercontent/.test(u.host) && /buscosun-data/.test(u.pathname)) return /\/radar\//.test(u.pathname) ? 'data:radar' : /\/point\//.test(u.pathname) ? 'data:point' : /\/obs\//.test(u.pathname) ? 'data:obs' : 'data:other';
  if (/tile|basemaps|maptiler|openfreemap|carto|stadia|protomaps|terrarium|elevation-tiles/.test(u.host + u.pathname)) return 'tiles';
  return `foreign:${u.host}`;
}

async function newCtx(prof) {
  const ctx = await browser.newContext({ width: prof.width, height: prof.height, mobile: prof.mobile, net: prof.net, cpu: prof.cpu });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__perfErrors = []; window.addEventListener("error", (e) => window.__perfErrors.push(String(e.message).slice(0, 200)));' });
  const consoleMsgs = [];
  const off = browser.on((msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') consoleMsgs.push({ t: msg.params.timestamp, type: msg.params.type, text: (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 220) });
    else if (msg.method === 'Runtime.exceptionThrown') consoleMsgs.push({ t: msg.params.timestamp, type: 'exception', text: String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? '').slice(0, 220) });
  });
  if (JSPROFILE) { await ctx.send('Profiler.enable', {}); await ctx.send('Profiler.setSamplingInterval', { interval: 500 }); await ctx.send('Profiler.start', {}); }
  return { ctx, consoleMsgs, off };
}

function netSummary(ctx, base) {
  const reqs = ctx.requests();
  const by = {};
  for (const r of reqs) { const k = classify(r.url, base); by[k] ??= { n: 0, kb: 0 }; by[k].n++; by[k].kb += (r.bytes ?? 0) / 1024; }
  for (const k of Object.keys(by)) by[k].kb = Math.round(by[k].kb);
  const totalKb = Math.round(reqs.reduce((s, r) => s + (r.bytes ?? 0), 0) / 1024);
  return { n: reqs.length, totalKb, by };
}

async function jsProfileTop(ctx) {
  if (!JSPROFILE) return null;
  const { profile } = await ctx.send('Profiler.stop', {});
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const cf = byId.get(profile.samples[i]).callFrame;
    const key = `${cf.functionName || '(anonymous)'} ${cf.url ? cf.url.split('/').pop().replace(/-[\w-]{8}\.js$/, '') : ''}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const busy = [...self.entries()].filter(([k]) => !/^\((idle|program|garbage collector|root)\)/.test(k));
  const top = busy.sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, Math.round(v)]);
  return { totalMs: Math.round(total), busyMs: Math.round(busy.reduce((s, [, v]) => s + v, 0)), gcMs: Math.round(self.get('(garbage collector) :0') ?? 0), top };
}

/** Waits until no request of `cls` has started for `quietMs` (or `maxMs` since now). Returns ms waited. */
async function waitQuiet(ctx, base, pred, quietMs, maxMs) {
  const t0 = Date.now();
  let lastSeen = Date.now();
  let lastN = -1;
  while (Date.now() - t0 < maxMs) {
    await sleep(200);
    const n = ctx.requests().filter((r) => pred(classify(r.url, base), r)).length;
    if (n !== lastN) { lastN = n; lastSeen = Date.now(); }
    else if (Date.now() - lastSeen >= quietMs) break;
  }
  return Date.now() - t0;
}

async function clickOn(ctx, selector, predSrc, text) {
  const target = await ctx.evaluate(`(() => { const sel = ${JSON.stringify(selector)}; const tx = ${JSON.stringify(text ?? null)}; const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!tx || (e.textContent || '').includes(tx)); }); return els.length ? window.__perf.arm(els[0], ${predSrc ?? 'null'}) : null; })()`);
  if (!target) return { found: false };
  await ctx.evaluate('window.__perf.click.mark(), true');
  const t0 = Date.now();
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  const cdpMs = Date.now() - t0;   // how long the browser took to accept the three input events (busy main thread delays this too)
  return { found: true, target: target.label, cdpMs };
}

async function run(base, prof, scenario) {
  const { ctx, consoleMsgs, off } = await newCtx(prof);
  const out = { scenario, base: base === CUR ? 'cur' : 'head' };
  try {
    if (scenario === 'radar') {
      await ctx.send('Page.navigate', { url: base + withQuery(`/regenradar/${ORT}`) });
      const t0 = Date.now();
      let s = null;
      while (Date.now() - t0 < 90_000) { await sleep(100); s = await ctx.evaluate(STATE).catch(() => null); if (s?.radarDrawNZ != null) break; }
      out.firstDraw = r0(s?.firstDraw); out.radarDraw = r0(s?.radarDrawNZ); out.radarTex = r0(s?.radarTexNZ); out.radarTexZero = r0(s?.radarTex);
      await waitQuiet(ctx, base, (c) => c === 'data:radar', 4000, 75_000);
      s = await ctx.evaluate(STATE);
      out.radarAllMs = r0(s.radarEnd); out.radarN = s.radarN; out.radarKb = s.radarKb; out.dataKb = s.dataKb; out.jsKb = s.jsKb; out.jsN = s.jsN;
      out.rvLog = consoleMsgs.find((m) => /RADOLAN-RV-Datei/.test(m.text))?.text ?? null;
      // click: play
      const c = await clickOn(ctx, 'button.mdk-td-play, button.rm-play, button.rdr-tl-play, button[title*="abspielen"], button[aria-label*="abspielen"]', '(el) => el.getAttribute("aria-pressed") === "true"');
      await sleep(1500);
      const s2 = await ctx.evaluate(STATE);
      out.play = { ...c, inputDelay: r0(Math.max(0, ...(s2.input ?? []).map((i) => i.delay))), feedbackMs: s2.click?.pred != null && s2.click.at != null ? r0(s2.click.pred - s2.click.at) : null, paintMs: s2.click?.paint != null && s2.click.at != null ? r0(s2.click.paint - s2.click.at) : null };
      out.gaps = s2.gaps;
    } else if (scenario === 'fusion') {
      await ctx.send('Page.navigate', { url: base + withQuery(`/wetterkarte/wind/${ORT}?ansicht=dashboard`) });
      const t0 = Date.now();
      let s = null;
      while (Date.now() - t0 < 90_000) { await sleep(100); s = await ctx.evaluate(STATE).catch(() => null); if (s?.marks?.core != null || s?.marks?.final != null) break; }
      if (s && s.marks.first == null) { await sleep(3000); s = await ctx.evaluate(STATE); }
      out.start = r0(s?.marks?.start); out.first = r0(s?.marks?.first ?? s?.marks?.core); out.core = r0(s?.marks?.core ?? s?.marks?.final);
      await waitQuiet(ctx, base, (c) => c.startsWith('data:'), 3000, 30_000);
      s = await ctx.evaluate(STATE);
      out.pointN = s.pointN; out.pointKb = s.pointKb; out.pointEnd = r0(s.pointEnd); out.obsN = s.obsN; out.obsKb = s.obsKb; out.obsEnd = r0(s.obsEnd); out.dataKb = s.dataKb; out.jsKb = s.jsKb; out.jsN = s.jsN; out.firstDraw = r0(s.firstDraw);
      out.gaps = s.gaps;
      out.pfLog = consoleMsgs.filter((m) => /\[pf\]|cube|Fusion/.test(m.text)).slice(0, 6).map((m) => m.text);
    } else if (scenario === 'click') {
      const loaded = browser.waitFor((m) => m.sessionId === ctx.sessionId && m.method === 'Page.loadEventFired', 60_000);
      await ctx.send('Page.navigate', { url: `${base}/` });
      await loaded;
      await waitQuiet(ctx, base, () => true, 1500, 10_000);
      const c = await clickOn(ctx, 'button.deck-tile[aria-label="Regenradar / Nowcast öffnen"]', null);
      const t0 = Date.now();
      let s = null;
      while (Date.now() - t0 < 60_000) { await sleep(100); s = await ctx.evaluate(STATE).catch(() => null); if (s?.click?.draw != null && s?.click?.urlChange != null) break; }
      out.tile = c;
      out.inputDelay = r0(Math.max(0, ...(s?.input ?? []).map((i) => i.delay)));
      out.firstMutation = s?.click?.at != null && s?.click?.firstMutation != null ? r0(s.click.firstMutation - s.click.at) : null;
      out.paint = s?.click?.at != null && s?.click?.paint != null ? r0(s.click.paint - s.click.at) : null;
      out.urlChange = s?.click?.at != null && s?.click?.urlChange != null ? r0(s.click.urlChange - s.click.at) : null;
      out.firstDrawAfterClick = s?.click?.at != null && s?.click?.draw != null ? r0(s.click.draw - s.click.at) : null;
      out.path = s?.path; out.gaps = s?.gaps; out.jsKb = s?.jsKb; out.jsN = s?.jsN;
    } else if (scenario === 'layer') {
      await ctx.send('Page.navigate', { url: base + withQuery(`/wetterkarte/temperatur/${ORT}`) });
      const t0 = Date.now();
      let s = null;
      while (Date.now() - t0 < 60_000) { await sleep(100); s = await ctx.evaluate(STATE).catch(() => null); if (s?.firstDraw != null) break; }
      out.firstDraw = r0(s?.firstDraw);
      await waitQuiet(ctx, base, () => true, 2000, 20_000);
      const gapsBefore = (await ctx.evaluate(STATE)).gaps;
      if (prof.mobile) { const opened = await clickOn(ctx, '.mdk-bar-btn', null, 'Layer'); out.sheet = opened; await sleep(1200); }
      const c = await clickOn(ctx, '[role="switch"][title*="Niederschlag"], .mdk-layer[title*="Niederschlag"], .mdk-m-layer[title*="Niederschlag"]', '(el) => el.getAttribute("aria-checked") === "true"');
      const t1 = Date.now();
      while (Date.now() - t1 < 60_000) { await sleep(100); s = await ctx.evaluate(STATE).catch(() => null); if (s?.radarDrawNZ != null) break; }
      await waitQuiet(ctx, base, (k) => k === 'data:radar', 3000, 40_000);
      s = await ctx.evaluate(STATE);
      out.switch = c;
      out.inputDelay = r0(Math.max(0, ...(s?.input ?? []).map((i) => i.delay)));
      out.feedback = s?.click?.at != null && s?.click?.pred != null ? r0(s.click.pred - s.click.at) : null;
      out.paint = s?.click?.at != null && s?.click?.paint != null ? r0(s.click.paint - s.click.at) : null;
      out.radarDrawAfterClick = s?.click?.at != null && s?.radarDrawNZ != null ? r0(s.radarDrawNZ - s.click.at) : null;
      out.radarAllAfterClick = s?.click?.at != null && s?.radarEnd != null ? r0(s.radarEnd - s.click.at) : null;
      out.radarN = s?.radarN; out.radarKb = s?.radarKb;
      out.gapsBefore = gapsBefore; out.gaps = s?.gaps;
    }
    out.net = netSummary(ctx, base);
    if (args.dump) {
      const reqs = ctx.requests();
      const tNav = Math.min(...reqs.map((r) => r.t0));
      out.requests = reqs.map((r) => ({ cls: classify(r.url, base), url: r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 140), kb: Math.round((r.bytes ?? 0) / 10.24) / 100, start: Math.round((r.t0 - tNav) * 1000), end: r.t1 != null ? Math.round((r.t1 - tNav) * 1000) : null, status: r.status ?? r.failed ?? null, cache: r.xCache ?? null }));
    }
    out.console = consoleMsgs.filter((m) => m.type === 'error' || m.type === 'exception' || m.type === 'warning').slice(0, 8).map((m) => `${m.type}: ${m.text}`);
    out.profile = await jsProfileTop(ctx);
  } catch (e) {
    out.error = String(e?.message ?? e);
  } finally {
    off();
    await ctx.close();
  }
  return out;
}

const results = {};
const stat = (xs) => ({ p50: q(xs, 0.5), min: q(xs, 0), max: q(xs, 1), all: xs });
const KEYS = {
  click: ['inputDelay', 'firstMutation', 'paint', 'urlChange', 'firstDrawAfterClick'],
  layer: ['inputDelay', 'feedback', 'paint', 'radarDrawAfterClick', 'radarAllAfterClick', 'radarKb'],
  fusion: ['first', 'core', 'pointEnd', 'obsEnd', 'pointKb', 'obsKb', 'dataKb', 'jsKb'],
  radar: ['firstDraw', 'radarDraw', 'radarAllMs', 'radarKb', 'dataKb', 'jsKb'],
};
for (const pn of PROFILES) {
  const prof = PROF[pn];
  results[pn] = {};
  for (const sc of SCENARIOS) {
    await run(CUR, prof, sc);   // prime (connection, not counted)
    const runs = { cur: [], head: [] };
    for (let i = 0; i < N; i++) {
      for (const v of ['head', 'cur']) {
        const base = v === 'head' ? HEAD : CUR;
        if (!base) continue;
        const r = await run(base, prof, sc);
        runs[v].push(r);
        const gap = r.gaps ? `gaps max ${r0(r.gaps.max)} >100:${r.gaps.over100} >200:${r.gaps.over200}` : '';
        console.log(`${pn} ${sc} ${v} #${i + 1}: ${KEYS[sc].map((k) => `${k}=${r[k] ?? '—'}`).join(' ')} ${gap} ${r.play ? `play inputDelay=${r.play.inputDelay} feedback=${r.play.feedbackMs}` : ''}${r.error ? ' ERROR ' + r.error : ''}`);
      }
    }
    const summary = (xs) => Object.fromEntries(KEYS[sc].map((k) => [k, stat(xs.map((r) => r[k]))]).concat([['gapsMax', stat(xs.map((r) => r.gaps?.max != null ? Math.round(r.gaps.max) : null))], ['gapsOver200', stat(xs.map((r) => r.gaps?.over200 ?? null))], ['gapsOver100', stat(xs.map((r) => r.gaps?.over100 ?? null))]]).concat(sc === 'radar' ? [['playInputDelay', stat(xs.map((r) => r.play?.inputDelay ?? null))], ['playFeedback', stat(xs.map((r) => r.play?.feedbackMs ?? null))]] : []));
    results[pn][sc] = { cur: { summary: summary(runs.cur), runs: runs.cur }, head: HEAD ? { summary: summary(runs.head), runs: runs.head } : null };
    console.log(`== ${pn} ${sc} cur p50:`, JSON.stringify(Object.fromEntries(Object.entries(results[pn][sc].cur.summary).map(([k, v]) => [k, v.p50]))));
    if (HEAD) console.log(`== ${pn} ${sc} head p50:`, JSON.stringify(Object.fromEntries(Object.entries(results[pn][sc].head.summary).map(([k, v]) => [k, v.p50]))));
  }
}
await browser.close();
for (const p of proxies) p.close();
if (args.out) writeFileSync(args.out, JSON.stringify({ at: new Date().toISOString(), args, h2: !!H2, results }, null, 1));
console.log('fertig');
