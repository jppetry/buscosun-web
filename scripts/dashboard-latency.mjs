/**
 * dashboard-latency.mjs — Latenz des Dashboards und des Karten-Einstiegs (Phase DB, audit/dashboard.md §5.3/§9/§11).
 *
 *   node scripts/dashboard-latency.mjs --cur=http://127.0.0.1:5222 [--head=http://127.0.0.1:5221] [--n=5] [--profiles=desktop,mobile4g]
 *                                      [--shell --cur-dist=dist --head-dist=<pfad>]
 *
 * Produktions-Builds über `vite preview`. Je Lauf ein frischer Browser-Kontext (kalter Browser-Cache, leere IndexedDB) —
 * dieselbe Definition „kalt" wie AP12 (§9.14). Innerhalb EINES Browser-Laufs, Varianten abwechselnd (Leistungsanker:
 * nur innerhalb eines Laufs vergleichen). Ein erster Aufruf je Profil wärmt die Verbindung (`prime`) und zählt nicht.
 *
 *   Karte   ms bis zum ersten WebGL-Draw auf `/wetterkarte/wind/<ort>` — head gegen cur.
 *   Dashboard  ms bis zur ersten Fusion-Ausgabe im Dashboard (`performance.mark('dbd:fusion:first'|…)`) für den
 *              Deep-Link `?ansicht=dashboard`, dazu `core` (ganzes Fenster) — head gegen cur (E-DB-20).
 *
 * `--shell` (E-DB-20): `vite preview` liefert für Ort-Pfade `index.html` aus, Netlify dagegen die Route-Shell mit ihren
 * Vorlade-Hinweisen (`netlify.toml`: `/wetterkarte/<layer>` ⇒ `wetterkarte--<layer>.html`, `/wetterkarte/*` ⇒
 * `wetterkarte.html`). Mit dem Schalter steht vor jeder Basis ein kleiner Proxy, der Dokument-Anfragen auf
 * `/wetterkarte…` mit der Shell aus dem jeweiligen `dist` beantwortet und alles andere an `vite preview` weiterreicht.
 * Ohne `--h2` laufen beide Varianten über HTTP/1.1 (sechs Verbindungen je Host, die Drosselung kostet jede Anfrage
 * 170 ms) — ein Bau mit mehr Chunks ist dann benachteiligt. `--h2 --h2-cert=… --h2-key=…` spricht zwischen Browser und
 * Proxy HTTP/2 über TLS wie Netlify (selbst signiert, Chrome mit `--ignore-certificate-errors`); der Proxy holt bei
 * `vite preview` über HTTP/1.1 auf localhost, ungedrosselt.
 */
import http from 'node:http';
import http2 from 'node:http2';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, findHeadlessChrome, NET_PROFILES } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const N = Number(args.n ?? 5);
const PATH = args.path ?? '/wetterkarte/wind/garmisch-partenkirchen';
const PROFILES = (args.profiles ?? 'desktop,mobile4g').split(',');
const ONLY = args.only ?? 'map,dash';
const CUR_FIRST = !!args['cur-first'];
const SHELL = !!args.shell || !!args.h2;
const H2 = args.h2 ? { cert: readFileSync(args['h2-cert']), key: readFileSync(args['h2-key']) } : null;
// Verbindungsbezogene Kopfzeilen dürfen in HTTP/2 nicht vorkommen (RFC 9113 §8.2.2), Pseudo-Kopfzeilen nicht in HTTP/1.1.
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'http2-settings', 'host']);
const cleanHeaders = (h) => Object.fromEntries(Object.entries(h).filter(([k]) => !k.startsWith(':') && !HOP.has(k.toLowerCase())));
const PROF = {
  desktop: { width: 1440, height: 900, mobile: false, net: null, cpu: 1 },
  mobile4g: { width: 402, height: 874, mobile: true, net: NET_PROFILES.fast4g, cpu: 4 },
};
const FIRST_DRAW = `(() => { window.__firstDraw = null; for (const P of [window.WebGLRenderingContext && WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) { if (!P) continue; for (const k of ['drawArrays', 'drawElements']) { const f = P[k]; P[k] = function (...a) { if (window.__firstDraw == null) window.__firstDraw = performance.now(); return f.apply(this, a); }; } } })();`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : null; };

/** Netlify-Regel für die Wetterkarte (netlify.toml): Sub-Route mit eigener Shell, sonst die Eltern-Shell. */
function netlifyShell(dist, pathname) {
  const seg = pathname.split('/').filter(Boolean);
  if (seg[0] !== 'wetterkarte') return null;
  if (seg.length === 2 && existsSync(join(dist, `wetterkarte--${seg[1]}.html`))) return join(dist, `wetterkarte--${seg[1]}.html`);
  return join(dist, 'wetterkarte.html');
}
function shellProxy(base, dist) {
  const target = new URL(base);
  const handler = (req, res) => {
    const shell = req.method === 'GET' && /text\/html/.test(req.headers.accept ?? '') ? netlifyShell(dist, new URL(req.url, base).pathname) : null;
    if (shell) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(readFileSync(shell)); return; }
    const up = http.request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...cleanHeaders(req.headers), host: target.host } }, (r) => { res.writeHead(r.statusCode ?? 502, cleanHeaders(r.headers)); r.pipe(res); });
    up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  };
  const srv = H2 ? http2.createSecureServer({ ...H2, allowHTTP1: true }, handler) : http.createServer(handler);
  const scheme = H2 ? 'https' : 'http';
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ url: `${scheme}://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}

const proxies = [];
async function baseFor(url, dist) {
  if (!url) return null;
  if (!SHELL) return url;
  if (!dist || !existsSync(join(dist, 'wetterkarte.html'))) { console.error(`--shell braucht ein gebautes dist mit wetterkarte.html (${dist})`); process.exit(2); }
  const p = await shellProxy(url, dist);
  proxies.push(p);
  return p.url;
}
const CUR = await baseFor(args.cur ?? 'http://127.0.0.1:5222', args['cur-dist'] ?? 'dist');
const HEAD = await baseFor(args.head ?? null, args['head-dist']);

const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(H2 ? ['--ignore-certificate-errors'] : [])] });

const DASH_PROBE = `(() => { const m = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null; const first = m('dbd:fusion:first') ?? m('dbd:fusion:core') ?? m('dbd:fusion:final'); return first == null ? null : { first, core: m('dbd:fusion:core') ?? m('dbd:fusion:final'), update: m('dbd:fusion:update'), start: m('dbd:fusion:start'), route: performance.getEntriesByType('resource').find((r) => /WetterkarteRoute-/.test(r.name))?.responseEnd ?? null, view: performance.getEntriesByType('resource').find((r) => /DashboardView-.*\\.js/.test(r.name))?.responseEnd ?? null, mapJs: performance.getEntriesByType('resource').find((r) => /\\/MapView-.*\\.js/.test(r.name))?.startTime ?? null, store: performance.getEntriesByType('resource').find((r) => /\\/forecastStore-.*\\.js/.test(r.name))?.responseEnd ?? null, storeStart: performance.getEntriesByType('resource').find((r) => /\\/forecastStore-.*\\.js/.test(r.name))?.startTime ?? null, cube: performance.getEntriesByType('resource').find((r) => /\\/cubeSource-.*\\.js/.test(r.name))?.responseEnd ?? null, jsBeforeStart: performance.getEntriesByType('resource').filter((r) => /\\/assets\\/[^/]+\\.js$/.test(r.name) && r.startTime < (m('dbd:fusion:start') ?? 0)).map((r) => r.name.split('/').pop().replace(/-[\\w-]{8}\\.js$/, '') + '@' + Math.round(r.startTime) + '-' + Math.round(r.responseEnd)).join(' ') }; })()`;

async function run(base, path, prof, kind) {
  const ctx = await browser.newContext({ width: prof.width, height: prof.height, mobile: prof.mobile, net: prof.net, cpu: prof.cpu });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: FIRST_DRAW });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(5000);' });
  await ctx.send('Page.navigate', { url: base + path });
  const t0 = Date.now();
  let out = null;
  let kbFirst = null;
  const kbNow = () => Math.round(ctx.requests().reduce((s, r) => s + (r.bytes ?? 0), 0) / 1024);
  while (Date.now() - t0 < 60_000) {
    await sleep(100);
    const r = await ctx.evaluate(kind === 'map' ? `window.__firstDraw` : DASH_PROBE).catch(() => null);
    if (r != null) { out = r; kbFirst ??= kbNow(); if (kind === 'map' || out.core != null) break; }
  }
  if (kind === 'dash' && out && out.core == null) { await sleep(3000); out = await ctx.evaluate(DASH_PROBE).catch(() => out) ?? out; }
  const kb = kbNow();
  // Welches Protokoll die App-Chunks wirklich nahmen (h2 mit `--h2`, sonst http/1.1).
  const proto = await ctx.evaluate(`performance.getEntriesByType('resource').find((r) => /\\/assets\\/index-.*\\.js$/.test(r.name))?.nextHopProtocol ?? null`).catch(() => null);
  // Karte: Aufschlüsselung des JS-Wegs bis zum ersten Draw (Zahl der Chunks, Ende des letzten, MapView/maplibre/Route).
  const js = kind !== 'map' ? null : await ctx.evaluate(`(() => {
    const js = performance.getEntriesByType('resource').filter((r) => /\\/assets\\/[^/]+\\.js$/.test(r.name) && r.startTime < (window.__firstDraw ?? 1e9));
    const f = (n) => js.find((r) => new RegExp('/assets/' + n + '-[\\\\w-]+\\\\.js$').test(r.name));
    const e = (r) => (r ? Math.round(r.responseEnd) : null);
    return { n: js.length, lastEnd: Math.round(Math.max(0, ...js.map((r) => r.responseEnd))), route: e(f('WetterkarteRoute')), mapView: e(f('MapView')), mapViewStart: f('MapView') ? Math.round(f('MapView').startTime) : null, maplibre: e(f('maplibre')) };
  })()`).catch(() => null);
  await ctx.close();
  return { v: out, kb, kbFirst, proto, js };
}

const r0 = (xs) => xs.filter((x) => x != null).map((x) => Math.round(x));
const stat = (xs) => ({ p50: q(r0(xs), 0.5), p95: q(r0(xs), 0.95), all: r0(xs) });
const res = {};
for (const pn of PROFILES) {
  const prof = PROF[pn];
  await run(CUR, PATH, prof, 'map'); // prime
  if (HEAD) await run(HEAD, PATH, prof, 'map');
  const map = { head: [], cur: [] };
  const dash = { head: [], cur: [] };
  const protos = new Set();
  const order = CUR_FIRST ? ['cur', 'head'] : ['head', 'cur'];
  for (let i = 0; i < N; i++) {
    // Reihenfolge wählbar (`--cur-first`), damit ein Reihenfolge-Effekt sichtbar wird.
    for (const v of order) {
      const base = v === 'head' ? HEAD : CUR;
      if (!base) continue;
      if (ONLY.includes('map')) { const m = await run(base, PATH, prof, 'map'); map[v].push({ ms: m.v, kb: m.kb, js: m.js }); protos.add(m.proto); }
      if (ONLY.includes('dash')) { const d = await run(base, `${PATH}?ansicht=dashboard`, prof, 'dash'); dash[v].push({ ...(d.v ?? {}), kb: d.kb, kbFirst: d.kbFirst }); protos.add(d.proto); }
    }
  }
  const dashOf = (xs) => ({
    first: stat(xs.map((d) => d.first)), core: stat(xs.map((d) => d.core)),
    kbAtFirst: xs.map((d) => d.kbFirst), kb: xs.map((d) => d.kb),
    breakdown: xs.map((d) => ({ route: d.route != null ? Math.round(d.route) : null, view: d.view != null ? Math.round(d.view) : null, store: d.store != null ? Math.round(d.store) : null, storeStart: d.storeStart != null ? Math.round(d.storeStart) : null, cube: d.cube != null ? Math.round(d.cube) : null, start: d.start != null ? Math.round(d.start) : null, first: d.first != null ? Math.round(d.first) : null, mapJs: d.mapJs != null ? Math.round(d.mapJs) : null, jsBeforeStart: d.jsBeforeStart })),
  });
  res[pn] = {
    shell: SHELL, protocols: [...protos],
    mapHead: HEAD ? { ...stat(map.head.map((m) => m.ms)), kb: map.head.map((m) => m.kb), js: map.head.map((m) => m.js) } : null,
    mapCur: { ...stat(map.cur.map((m) => m.ms)), kb: map.cur.map((m) => m.kb), js: map.cur.map((m) => m.js) },
    dashHead: HEAD ? dashOf(dash.head) : null,
    dashCur: dashOf(dash.cur),
  };
  console.log(pn, JSON.stringify(res[pn]));
}
await browser.close();
for (const p of proxies) p.close();
console.log(JSON.stringify(res, null, 1));
