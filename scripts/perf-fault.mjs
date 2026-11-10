/**
 * perf-fault.mjs — what a feature page shows when a source hangs or fails (load-time line 10.11.2026).
 *
 *   node scripts/perf-fault.mjs --cur-dist=<dist> [--head-dist=<dist>]
 *        [--cases=sea-stall,road-fc-stall,fire-gwis-stall,karte-data-fail,offline-warm] [--wait=35000]
 *
 * Each case: a fresh browser context (desktop, no throttling), the service worker bypassed (the page's OWN handling is under
 * test), requests to the named hosts held for ever (`stall`) or refused (`fail`) via the CDP Fetch domain; after `--wait` ms
 * the visible status texts of the page are read. `offline-warm`: cold load with the service worker, then offline, reload — does
 * the page come up (shell + map) instead of a browser error page?
 * Output: per case and build the matched status lines; the verdict is for the reader (head = before, cur = after).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const WAIT = Number(args.wait ?? 35_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = {
  // CDN and raw both hang: catalogue, run, texts — before: „Lädt" for ever.
  'sea-stall': { path: '/seewetter/borkum', stall: ['*cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/sea/*', '*raw.githubusercontent.com/jppetry/buscosun-data/main/sea/*'], re: /Lädt|Keine Daten|nicht ladbar|nicht erreichbar|antwortet nicht|Aktuell|Veraltet/ },
  // the route-forecast pointer (raw only) hangs: before „Prognose lädt" for ever.
  'road-fc-stall': { path: '/autobahnwetter/a8', stall: ['*raw.githubusercontent.com/jppetry/buscosun-data/main/road/fc/v1/index.json*'], re: /Prognose lädt|Zeiger nicht lesbar|kein Lauf|älter als 12/ },
  // FIRMS (same-origin `/_firms`, not served by `vite preview` ⇒ fails) and the GWIS fallback hangs.
  'fire-gwis-stall': { path: '/waldbrand', stall: ['*gwis.jrc.ec.europa.eu*'], fail: ['*/_firms/*'], re: /GWIS|FIRMS|nicht erreichbar|keine Antwort|Fehler|lädt|Lädt|Brände|Detektion/ },
  // the data repo and the DWD proxies refuse: wind/temperature must say so in the layer status.
  'karte-data-fail': { path: '/wetterkarte/temperatur/muenchen', fail: ['*cdn.jsdelivr.net/gh/jppetry/buscosun-data*', '*raw.githubusercontent.com*', '*/_dwd*', '*/latest-grib.json*'], re: /nicht erreichbar|Fehler|Wind|Temperatur.*(lädt|Lädt)/ },
  'offline-warm': { path: '/seewetter/borkum', offline: true },
};
const CASE_IDS = (args.cases ?? Object.keys(CASES).join(',')).split(',');

// each build served like Netlify by `scripts/lib/shellServer.mjs` in its own process (HTTP/1.1: no certificate needed here)
const servers = [];
function serve(dist) {
  if (!dist || !existsSync(join(dist, 'index.html'))) { console.error(`dist fehlt: ${dist}`); process.exit(2); }
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [join('scripts', 'lib', 'shellServer.mjs'), dist], { stdio: ['ignore', 'pipe', 'inherit'] });
    servers.push(child);
    let buf = '';
    child.stdout.on('data', (d) => { buf += String(d); const m = /READY (\S+)/.exec(buf); if (m) ok(m[1]); });
    child.on('exit', (c) => fail(new Error(`shellServer ${dist} beendet (${c})`)));
  });
}
const bases = {};
for (const v of ['head', 'cur']) if (args[`${v}-dist`]) bases[v] = await serve(args[`${v}-dist`]);

const chrome = findHeadlessChrome();
const TEXT = (re) => `(() => { const re = new RegExp(${re}.source, 'i'); const seen = new Set(); const out = [];
  for (const el of document.querySelectorAll('[role="status"], [role="alert"], .sw-map-note, .sw-live, p, span, div, li')) {
    if (el.children.length > 3) continue; const t = (el.innerText || '').replace(/\\s+/g, ' ').trim();
    if (!t || t.length > 160 || !re.test(t) || seen.has(t)) continue; seen.add(t); out.push(t); if (out.length >= 8) break; }
  const all = (document.body.innerText || '').replace(/\\s+/g, ' '); const hits = []; let m; const g = new RegExp(re.source, 'gi'); while ((m = g.exec(all)) && hits.length < 6) hits.push(all.slice(Math.max(0, m.index - 60), m.index + 80)); return { lines: out, hits, blank: all.trim().length < 20, title: document.title }; })()`;

async function runCase(id, base) {
  const c = CASES[id];
  const browser = await openBrowser(chrome, { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await browser.newContext({ width: 1440, height: 900 });
    if (c.offline) {
      await ctx.send('Page.navigate', { url: base + c.path });
      await sleep(15_000);
      const sw = await ctx.evaluate('navigator.serviceWorker && navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller)').catch(() => null);
      await ctx.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await ctx.send('Page.reload', {});
      await sleep(10_000);
      const t = await ctx.evaluate(TEXT('/Lädt|Keine Daten|nicht|Aktuell|Veraltet|Seewetter|Spot/')).catch((e) => ({ error: String(e.message ?? e) }));
      return { sw, ...t };
    }
    await ctx.send('Network.setBypassServiceWorker', { bypass: true });
    const patterns = [...(c.stall ?? []), ...(c.fail ?? [])].map((urlPattern) => ({ urlPattern, requestStage: 'Request' }));
    const held = [];
    const failRe = (c.fail ?? []).map((p) => new RegExp(p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')));
    browser.on((msg) => {
      if (msg.sessionId !== ctx.sessionId || msg.method !== 'Fetch.requestPaused') return;
      const url = msg.params.request.url;
      if (failRe.some((re) => re.test(url))) void ctx.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'ConnectionRefused' }).catch(() => {});
      else held.push(url);   // stall: never answered
    });
    await ctx.send('Fetch.enable', { patterns });
    await ctx.send('Page.navigate', { url: base + c.path });
    await sleep(WAIT);
    const t = await ctx.evaluate(TEXT(c.re)).catch((e) => ({ error: String(e.message ?? e) }));
    return { held: held.length, ...t };
  } finally {
    await browser.close().catch(() => {});
  }
}

for (const id of CASE_IDS) {
  for (const v of ['head', 'cur']) {
    if (!bases[v]) continue;
    const r = await runCase(id, bases[v]);
    console.log(`${id} ${v}: ${JSON.stringify(r)}`);
  }
}
for (const c of servers) c.kill();
process.exit(0);
