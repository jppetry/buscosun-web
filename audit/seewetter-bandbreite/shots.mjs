#!/usr/bin/env node
/**
 * Phase SU — screenshots and a DOM check of /seewetter with and without quantiles in the spot file.
 *
 *   npm run build && npx vite preview --host 127.0.0.1 --port 5212 --strictPort
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/seewetter-bandbreite/shots.mjs
 *     --store=<copy of sea/v1 with status.json, spots/<run>.json and the local wind refresh> [--base=…] [--out=…]
 *
 * Headless Chromium over CDP (`scripts/lib/cdpBrowser.mjs`). Files that exist in `--store` answer the requests for
 * `…/buscosun-data@main/sea/v1/*` (jsDelivr and raw); everything else (run.json, field images, texts, water level,
 * basemap) comes from the live network. Two stores are shown:
 *   new   the store as it is: `status.wind` points at the wind refresh WITH quantiles (local producer run)
 *   old   the same store with `status.wind` removed: only the published run file, WITHOUT quantiles — today's data
 * The DOM check counts the elements of this phase in both; `old` must have none.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, findHeadlessChrome } from '../../scripts/lib/cdpBrowser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5212';
const STORE = resolve(String(args.store));
const OUT = resolve(args.out ?? join(HERE, 'shots'));
const SPOT = args.spot ?? 'st-peter-ording';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const statusNew = readFileSync(join(STORE, 'status.json'), 'utf8');
const statusOld = (() => { const s = JSON.parse(statusNew); delete s.wind; return JSON.stringify(s); })();
const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = [];

async function openPage({ path, width = 1440, height = 900, mobile = false, old = false }) {
  const ctx = await browser.newContext({ width, height, mobile });
  const errors = [];
  const off = browser.on(async (msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? msg.params.exceptionDetails?.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(`console.error: ${msg.params.args?.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)}`);
    if (msg.method !== 'Fetch.requestPaused') return;
    const m = /(?:buscosun-data@main|buscosun-data\/main)\/sea\/v1\/(.+?)(?:\?.*)?$/.exec(msg.params.request.url);
    const file = m ? join(STORE, ...m[1].split('/')) : null;
    if (m && m[1] === 'status.json') {
      await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: Buffer.from(old ? statusOld : statusNew).toString('base64') }).catch(() => {});
    } else if (file && existsSync(file) && !(old && /-w\d{10}\.json$/.test(file))) {
      await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: readFileSync(file).toString('base64') }).catch(() => {});
    } else await ctx.send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
  });
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*sea/v1/*' }] });
  await ctx.send('Network.setBypassServiceWorker', { bypass: true });
  await ctx.send('Network.setCacheDisabled', { cacheDisabled: true });
  await ctx.send('Page.navigate', { url: `${BASE}${path}` });
  return { ctx, errors, off };
}
const until = async (ctx, expr, ms = 40_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ctx.evaluate(expr).catch(() => false)) return true; await sleep(250); }
  return false;
};
const shot = async (ctx, name, clip = null) => {
  await sleep(2500);
  const r = await ctx.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
};
const COUNT = `(() => ({
  odds: document.querySelectorAll('.sw-odds').length, oddsShown: [...document.querySelectorAll('.sw-odds')].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'absolute' && getComputedStyle(e).display !== 'none').length,
  cells: document.querySelectorAll('.sw-su-cell').length, bands: document.querySelectorAll('.sw-su-band path').length, most: document.querySelectorAll('.sw-kpi-most').length,
  leg: document.querySelectorAll('.sw-su-leg').length, row: /über Grenze/.test(document.body.innerText), meist: /\\bmeist \\d/.test(document.body.innerText),
  sentence: document.querySelector('.sw-odds-tx')?.textContent ?? null, mostText: [...document.querySelectorAll('.sw-kpi-most')].map((e) => e.textContent),
  bandHours: document.querySelectorAll('.sw-band-table thead th[data-h]').length, kpis: document.querySelectorAll('.sw-kpi').length,
  barH: getComputedStyle(document.querySelector('.sw-root')).getPropertyValue('--sw-bar-h'),
}))()`;
/** The page's cover loader (first child of the root, `role="status"`) is gone. */
const LOADED = `[...document.querySelectorAll('.sw-root > [role="status"]')].every((e) => e.getAttribute('aria-hidden') === 'true')`;
const rectOf = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)), width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()`;

for (const old of [false, true]) {
  const tag = old ? 'alt' : 'neu';
  // --- desktop 1440 × 900: dossier, chapter Wetter ---------------------------------------------------------
  {
    const { ctx, errors, off } = await openPage({ path: `/seewetter/${SPOT}?p=kite`, old });
    await until(ctx, `!!document.querySelector('[data-ch="wetter"]')`);
    await ctx.evaluate(`document.querySelector('[data-ch="wetter"]').click()`);
    const ready = await until(ctx, `document.querySelectorAll('.sw-band-table thead th[data-h]').length > 10 && !!document.querySelector('.sw-chartpanel svg path')`);
    await until(ctx, LOADED);
    // an hour 9 h ahead (inside the refresh's hours), so the readout shows a band in the new store
    await ctx.evaluate(`document.querySelector('.sw-band-table thead th[data-h="9"] button')?.click()`);
    await sleep(800);
    const c = await ctx.evaluate(COUNT);
    report.push({ view: `desktop-${tag}`, ready, ...c, errors });
    await shot(ctx, `desktop-${tag}-stunde`);
    await ctx.evaluate(`document.querySelector('#sw-sec-verlauf')?.scrollIntoView({ block: 'start' })`);
    await shot(ctx, `desktop-${tag}-verlauf`);
    const r = await ctx.evaluate(rectOf('.sw-chartpanel'));
    if (r) await shot(ctx, `desktop-${tag}-diagramm`, r);
    await ctx.evaluate(`document.querySelector('.sw-ds .sw-band')?.scrollIntoView({ block: 'end' })`);
    await sleep(400);
    const b = await ctx.evaluate(rectOf('.sw-ds .sw-band'));
    if (b) await shot(ctx, `desktop-${tag}-band`, b);
    await ctx.evaluate(`(document.querySelector('.sw-odds') ?? document.querySelector('.sw-kpis'))?.scrollIntoView({ block: 'center' })`);
    await sleep(400);
    const k = await ctx.evaluate(rectOf('.sw-ds-now'));
    if (k) await shot(ctx, `desktop-${tag}-kacheln`, k);
    off(); await ctx.close();
  }
  // --- mobile 390 × 844: map with the spot card, then the dossier ----------------------------------------------
  {
    const { ctx, errors, off } = await openPage({ path: `/seewetter/${SPOT}?p=kite`, width: 390, height: 844, mobile: true, old });
    const ready = await until(ctx, `!!document.querySelector('.sw-mapcard') && !!document.querySelector('.sw-bar')`);
    await until(ctx, LOADED);
    await sleep(1500);
    // the first-visit gesture hint covers the map and the spot card: dismiss it as a visitor would
    await until(ctx, `[...document.querySelectorAll('button')].some((b) => /Los geht/.test(b.textContent ?? ''))`, 6_000);
    await sleep(700);
    await ctx.evaluate(`[...document.querySelectorAll('button')].find((b) => /Los geht/.test(b.textContent ?? ''))?.click()`);
    await sleep(900);
    const c1 = await ctx.evaluate(COUNT);
    report.push({ view: `mobil-karte-${tag}`, ready, ...c1, errors: [...errors] });
    await shot(ctx, `mobil-${tag}-karte`);
    await ctx.evaluate(`document.querySelector('.sw-mapcard-cta')?.click()`);
    await until(ctx, `!!document.querySelector('.sw-m-dossier [data-ch="wetter"]')`);
    await ctx.evaluate(`document.querySelector('.sw-m-dossier [data-ch="wetter"]').click()`);
    await until(ctx, `document.querySelectorAll('.sw-band-table thead th[data-h]').length > 10`);
    await ctx.evaluate(`document.querySelector('.sw-band-table thead th[data-h="9"] button')?.click()`);
    await sleep(800);
    const c2 = await ctx.evaluate(COUNT);
    const touch = await ctx.evaluate(`[...document.querySelectorAll('.sw-bar-btn')].map((e) => Math.round(e.getBoundingClientRect().height))`);
    report.push({ view: `mobil-dossier-${tag}`, ...c2, barButtonsPx: touch, errors });
    await shot(ctx, `mobil-${tag}-dossier`);
    await ctx.evaluate(`document.querySelector('.sw-m-dossier .sw-band')?.scrollIntoView({ block: 'center' })`);
    await shot(ctx, `mobil-${tag}-band`);
    off(); await ctx.close();
  }
}
await browser.close();
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
for (const r of report) console.log(JSON.stringify(r));
const alt = report.filter((r) => r.view.endsWith('-alt')), neu = report.filter((r) => r.view.endsWith('-neu'));
const clean = alt.every((r) => r.odds === 0 && r.cells === 0 && r.bands === 0 && r.most === 0 && r.leg === 0 && !r.row && !r.meist && r.errors.length === 0);
const there = neu.some((r) => r.cells > 0 && r.bands === 2 && r.most === 2 && r.row) && neu.every((r) => r.errors.length === 0);
console.log(`\nalte Datei: ${clean ? 'kein Element der Phase, keine Konsole-Fehler' : 'ABWEICHUNG'} · neue Datei: ${there ? 'Bänder, Zeile, „meist“ da, keine Konsole-Fehler' : 'ABWEICHUNG'}`);
process.exit(clean && there ? 0 : 1);
