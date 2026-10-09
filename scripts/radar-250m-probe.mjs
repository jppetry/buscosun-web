/**
 * radar-250m-probe.mjs — Phase R250: does the page draw the 250-m tiles? Serves a locally derived slot
 * (`radar-derive.mjs hd250 …` output) to the page by CDP interception under WHATEVER RV stamp the page asks for
 * (the mirror carries no 250-m product until Jan's push), jumps over the wettest tile at zoom 10 and reports the
 * state of the tile layers, the 1-km DE layer, the console and a screenshot.
 *
 *   node scripts/radar-250m-probe.mjs --dir=<slot dir with hd250.json + h??.png> [--base=http://127.0.0.1:5231]
 *        [--q=?hd250=1] [--zoom=10] [--tile=tx,ty] [--shot=.cache/radar-250m-probe.png] [--path=/wetterkarte/niederschlag/muenchen]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { hd250TileNode, HD250_TILE_LIST } from '../src/scalar/radarHd250.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5231', Q = args.q ?? '?hd250=1', DIR = args.dir, ZOOM = Number(args.zoom ?? 10);
if (!DIR) { console.error('--dir fehlt'); process.exit(2); }
const localMeta = JSON.parse(readFileSync(join(DIR, 'hd250.json'), 'utf8'));
const biggest = [...localMeta.tiles].sort((a, b) => b.bytes - a.bytes)[0];
const [tx, ty] = args.tile ? args.tile.split(',').map(Number) : [biggest.tx, biggest.ty];
const [lon, lat] = hd250TileNode(tx, ty)(0.5, 0.5);

const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden (OG_CHROME setzen)'); process.exit(2); }
const browser = await openBrowser(chrome, { timeoutMs: 120_000 });
const ctx = await browser.newContext({ width: 1440, height: 900 });
const lines = [];
const served = [];
browser.on((msg) => {
  if (msg.sessionId !== ctx.sessionId) return;
  if (msg.method === 'Runtime.consoleAPICalled') lines.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 400));
  if (msg.method === 'Runtime.exceptionThrown') lines.push(`[exception] ${(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text ?? '').slice(0, 600)}`);
  if (msg.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = msg.params;
  const m = /\/radar\/img\/v1\/rv-past\/(\d{10})\/(hd250\.json|h\d\d\.png)$/.exec(request.url);
  if (!m) { void browser.send('Fetch.continueRequest', { requestId }, ctx.sessionId).catch(() => {}); return; }
  const [, stamp, file] = m;
  served.push(`${stamp}/${file}`);
  let body, type = 'image/png';
  if (file === 'hd250.json') {
    const stampMs = Date.UTC(2000 + +stamp.slice(0, 2), +stamp.slice(2, 4) - 1, +stamp.slice(4, 6), +stamp.slice(6, 8), +stamp.slice(8, 10));
    body = Buffer.from(JSON.stringify({ ...localMeta, stamp, validAtMs: stampMs })); type = 'application/json';
  } else {
    try { body = readFileSync(join(DIR, file)); } catch { void browser.send('Fetch.fulfillRequest', { requestId, responseCode: 404, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }], body: '' }, ctx.sessionId).catch(() => {}); return; }
  }
  void browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: body.toString('base64') }, ctx.sessionId).catch(() => {});
});
await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*radar/img/v1/rv-past/*' }] });
const loaded = browser.waitFor((m) => m.sessionId === ctx.sessionId && m.method === 'Page.loadEventFired', 120_000);
await ctx.send('Page.navigate', { url: `${BASE}${args.path ?? '/wetterkarte/niederschlag/muenchen'}${Q}` });
await loaded;
// wait for the RV frames
let frames = null;
for (let i = 0; i < 90 && !frames; i++) {
  frames = await ctx.evaluate(`(() => { const s = window.__precipSources && window.__precipSources(); return s && s.rv && s.rv.frames.length ? { rv: s.rv.frames.length, masks: s.masks && Object.keys(s.masks) } : null; })()`);
  if (!frames) await new Promise((r) => setTimeout(r, 1000));
}
console.log('frames', JSON.stringify(frames));
await ctx.evaluate(`(() => { window.__map.jumpTo({ center: [${lon}, ${lat}], zoom: ${ZOOM}, bearing: 0, pitch: 0 }); return true; })()`);
// let the tiles arrive (meta + up to 4 tiles, decoded in the worker)
const t0 = Date.now();
let state = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  state = await ctx.evaluate(`(() => { const m = window.__map; const ids = ${JSON.stringify(HD250_TILE_LIST.map((t) => t.id))};
    const of = (id) => { const l = m.getLayer(id); if (!l) return null; const impl = l.implementation ?? l; return { id, vis: m.getLayoutProperty(id, 'visibility') || 'visible', opacity: impl.opacity, tex: impl.texW + 'x' + impl.texH, mask: !!impl.maskRef, morph: !!impl.morph, filter: impl.filter }; };
    return { zoom: +m.getZoom().toFixed(2), tiles: ids.map(of).filter(Boolean), de: of('precip-rain-hd-de'), status: (document.querySelector('[data-status="nowcast"], .wk-status, .mapDeck-status')?.textContent || '').slice(0, 200) }; })()`);
  if (state && state.tiles.some((t) => t.opacity > 0)) break;
}
console.log(`after ${Date.now() - t0} ms:`, JSON.stringify({ zoom: state?.zoom, shownTiles: state?.tiles.filter((t) => t.opacity > 0), de: state?.de, nTileLayers: state?.tiles.length }, null, 1));
console.log('served', served.length, served.slice(0, 8).join(' '));
const modelText = await ctx.evaluate(`(() => Array.from(document.querySelectorAll('*')).map((e) => e.childElementCount === 0 ? e.textContent : '').find((t) => /250 m/.test(t || '')) || '')()`);
console.log('status text with 250 m:', JSON.stringify(modelText));
const rect = await ctx.evaluate(`(() => { const c = document.querySelector('canvas.maplibregl-canvas'); const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
const shot = args.shot ?? '.cache/radar-250m-probe.png';
mkdirSync(dirname(shot), { recursive: true });
const { data } = await ctx.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(rect[0]), y: Math.round(rect[1]), width: Math.round(rect[2]), height: Math.round(rect[3]), scale: 1 } });
writeFileSync(shot, Buffer.from(data, 'base64'));
console.log('shot', shot);
for (const l of lines) if (/error|warn|shader|webgl|exception|hd250|250/i.test(l)) console.log(l);
console.log(`(${lines.length} console lines total)`);
await ctx.close();
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 3000))]);
process.exit(0);
