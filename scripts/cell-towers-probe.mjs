/**
 * cell-towers-probe.mjs — Phase ZT (audit/zelltuerme-3d.md): the 3D stage "Zelltürme auf Gelände" in a real browser (CDP).
 *
 *   node scripts/cell-towers-probe.mjs --base=http://127.0.0.1:5191 [--place=innsbruck] [--out=audit/zelltuerme-3d] [--secs=12]
 *
 * KONRAD3D usually has no cells in October, so every `konrad3d/<slot>/cells.json` request is answered with the Alps
 * fixture (`konrad3d-sample.xml`, hail cell 12 near the Brenner) shifted to that slot; the slot 5 min before the newest
 * carries cell 12 with a 450 m lower echo top (⇒ trend "wächst"). The DWD listing fallback answers 503.
 * Desktop 1440×900: split view, tower tap ⇒ Steckbrief, "3D" only, look-back (6 steps back), Wien (no cell data), map
 * view, default (switch, start view Karte, no 3D chunk) and `?z3d=0` (no ZT element). Mobile 390×844: tab "3D", touch targets. Console errors/warnings of every run.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { parseKonrad3d } from '../src/radar/konrad3d.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5191', PLACE = args.place ?? 'innsbruck', OUT = args.out ?? 'audit/zelltuerme-3d';
const SECS = Number(args.secs ?? 12);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const base = parseKonrad3d(readFileSync('scripts/fixtures/konrad3d-sample.xml', 'utf8'), 'konrad3d-sample.xml');
const newest = () => Math.floor((Date.now() - 330_000) / 300_000) * 300_000;
const stampMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13));
function runFor(slotMs) {
  const run = structuredClone(base);
  const d = slotMs - run.refMs;
  const sh = (v) => (Number.isFinite(v) ? v + d : v);
  run.refMs = sh(run.refMs);
  for (const c of run.cells) {
    // First detection is a fixed moment of the cell's life (same in every slot) — anchored to the newest slot.
    c.refMs = sh(c.refMs); c.firstDetectedMs = Number.isFinite(c.firstDetectedMs) ? newest() - 3600_000 : c.firstDetectedMs;
    for (const f of c.forecast) f.validMs = sh(f.validMs);
    if (slotMs === newest() - 300_000 && c.id === 12 && c.echoTopM != null) c.echoTopM -= 450;
  }
  return run;
}
const served = [];
const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 180_000 });
const lines = [];
async function setup(ctx) {
  browser.on((msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) lines.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
    if (msg.method === 'Runtime.exceptionThrown') lines.push(`[exception] ${(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text ?? '').slice(0, 500)}`);
    if (msg.method === 'Fetch.requestPaused') {
      const url = msg.params.request.url;
      const m = url.match(/konrad3d\/(\d{8}T\d{6})\/cells\.json/);
      if (!m) { ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 503, body: '' }).catch(() => {}); return; }
      const run = runFor(stampMs(m[1]));
      served.push(m[1]);
      const body = Buffer.from(JSON.stringify({ schema: 1, run }));
      ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: body.toString('base64') }).catch(() => {});
    }
  });
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*konrad3d/*/cells.json*' }, { urlPattern: '*_dwd_opendata/weather/radar/konrad3d/*' }] });
}
const shot = async (ctx, file, clipSel) => {
  let clip;
  if (clipSel) {
    const r = await ctx.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(clipSel)}); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })()`);
    if (r) clip = { x: Math.round(r[0]), y: Math.round(r[1]), width: Math.round(r[2]), height: Math.round(r[3]), scale: 1 };
  }
  const { data } = await ctx.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  writeFileSync(`${OUT}/${file}`, Buffer.from(data, 'base64'));
  console.log(`  → ${OUT}/${file}`);
};
const waitFor = async (ctx, expr, maxS = 60) => { for (let i = 0; i < maxS * 2; i++) { const v = await ctx.evaluate(expr); if (v) return v; await sleep(500); } return null; };
const idle = (ctx) => ctx.evaluate(`new Promise((r) => { const m = window.__ztStage; if (!m) return r(false); if (m.loaded() && m.areTilesLoaded()) return r(true); m.once('idle', () => r(true)); setTimeout(() => r('timeout'), 20000); })`);
const stageState = (ctx) => ctx.evaluate(`(() => ({
  note: document.querySelector('.zt-note')?.innerText ?? null,
  stamp: document.querySelector('.zt-stamp')?.innerText ?? null,
  legend: document.querySelector('.zt-legend')?.innerText?.replace(/\\s+/g, ' ') ?? null,
  towers: window.__ztStage?.querySourceFeatures('zt-towers').filter((f) => f.properties.kind === 'tower').length ?? null,
  cores: window.__ztStage?.querySourceFeatures('zt-towers').filter((f) => f.properties.kind === 'core').length ?? null,
  radarVisible: window.__ztStage?.getLayoutProperty('zt-radar', 'visibility') ?? null,
  pitch: window.__ztStage ? Math.round(window.__ztStage.getPitch()) : null,
  stageW: Math.round(document.querySelector('.zt-stage')?.getBoundingClientRect().width ?? 0),
  mapW: Math.round(document.querySelector('.nc-radar-stage')?.getBoundingClientRect().width ?? 0),
  mapVis: document.querySelector('.nc-radar-stage') ? getComputedStyle(document.querySelector('.nc-radar-stage')).visibility : null,
}))()`);
// Screen point on tower `id` (the extrusion stands up from the projected foot; walk upwards until the layer is hit).
const towerPoint = (ctx, id) => ctx.evaluate(`(() => {
  const m = window.__ztStage; const f = m.querySourceFeatures('zt-towers').find((x) => x.properties.kind === 'tower' && x.properties.id === ${id});
  if (!f) return null; const ring = f.geometry.coordinates[0]; let sx = 0, sy = 0, n = ring.length - 1;
  for (let i = 0; i < n; i++) { sx += ring[i][0]; sy += ring[i][1]; }
  const p = m.project([sx / n, sy / n]); const r = m.getCanvas().getBoundingClientRect();
  for (let dy = 0; dy < 260; dy += 6) { const q = [p.x, p.y - dy]; if (m.queryRenderedFeatures(q, { layers: ['zt-tower'] }).some((g) => g.properties.id === ${id})) return { x: r.x + q[0], y: r.y + q[1] }; }
  return null; })()`);
const click = async (ctx, pt) => {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
};
const clickText = (ctx, sel, re) => ctx.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => ${re}.test(x.textContent.trim())); if (!b) return false; b.click(); return true; })()`);
const facts = (ctx) => waitFor(ctx,`document.querySelector('.zt-facts')?.innerText?.replace(/\\n+/g, ' | ') ?? null`);

// ---------------------------------------------------------------- Desktop
{
  const ctx = await browser.newContext({ width: 1440, height: 900 });
  await setup(ctx);
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}?z3d=1&ansicht3d=split&ztdebug=1` });
  await sleep(SECS * 1000);
  console.log('Desktop: Umschalter', JSON.stringify(await ctx.evaluate(`[...document.querySelectorAll('.zt-viewseg button')].map((b) => b.textContent + (b.classList.contains('is-active') ? ' *' : ''))`)));
  console.log('Desktop: Dock', JSON.stringify(await ctx.evaluate(`(() => { const d = document.querySelector('.zt-dockwrap'); return d ? { cls: d.className, w: Math.round(d.getBoundingClientRect().width) } : null; })()`)));
  await waitFor(ctx, `!!window.__ztStage && window.__ztStage.isStyleLoaded()`);
  await ctx.evaluate(`(window.__ztStage.jumpTo({ center: [11.62, 47.12], zoom: 8.6 }), 0)`);
  await waitFor(ctx, `(window.__ztStage?.querySourceFeatures('zt-towers').length ?? 0) > 0`, 40);
  console.log('Desktop: idle', await idle(ctx));
  await sleep(1500);
  console.log('Desktop split:', JSON.stringify(await stageState(ctx), null, 1));
  console.log('Desktop: Hauptkarte folgt', JSON.stringify(await ctx.evaluate(`(() => { const s = window.__ztStage.getCenter(); return { stage: [s.lng.toFixed(3), s.lat.toFixed(3), window.__ztStage.getZoom().toFixed(2)] }; })()`)));
  await shot(ctx, 'desktop-split.png');
  const pt = await towerPoint(ctx, 12);
  console.log('Desktop: Turm 12 auf dem Schirm', JSON.stringify(pt));
  if (pt) { await click(ctx, pt); await sleep(1200); }
  console.log('Desktop: Steckbrief', JSON.stringify(await facts(ctx)));
  await shot(ctx, 'desktop-split-steckbrief.png');
  await shot(ctx, 'desktop-readout-steckbrief.png', '.rr-readout');
  // Drape test: the radar is often dry — paint a test pattern into the SAME canvas source twice (magenta, then green) the way
  // the drape effect does (putImageData + setCoordinates + play/pause) and check the relief shows the second one.
  const paint = (rgb) => ctx.evaluate(`(() => { const m = window.__ztStage, s = m.getSource('zt-radar'), c = s.getCanvas();
    c.width = 64; c.height = 64; const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) if (((x + y) / 8) % 2 === 0) { g.fillStyle = 'rgba(${rgb},0.85)'; g.fillRect(x, y, 8, 8); }
    s.setCoordinates([[11.2, 47.35], [11.75, 47.35], [11.75, 47.0], [11.2, 47.0]]); s.play(); s.pause();
    m.setLayoutProperty('zt-radar', 'visibility', 'visible'); m.triggerRepaint(); return true; })()`);
  await paint('230,0,200'); await sleep(1200); await idle(ctx);
  await shot(ctx, 'drape-test-1-magenta.png', '.zt-stage');
  await paint('0,200,60'); await sleep(1200); await idle(ctx);
  await shot(ctx, 'drape-test-2-gruen.png', '.zt-stage');
  // Dock "Alle Einstellungen"
  await ctx.evaluate(`document.querySelector('.zt-dockmore')?.click()`); await sleep(400);
  console.log('Desktop: Dock offen', JSON.stringify(await ctx.evaluate(`(() => { const d = document.querySelector('.zt-dockwrap .rr-dock'); return d ? Math.round(d.getBoundingClientRect().width) : null; })()`)));
  await shot(ctx, 'desktop-dock-offen.png');
  await ctx.evaluate(`document.querySelector('.zt-dockmore')?.click()`); await sleep(300);
  // "3D" only
  console.log('Desktop: 3D', await clickText(ctx, '.zt-viewseg button', /^3D$/));
  await sleep(2500); await idle(ctx);
  console.log('Desktop 3D:', JSON.stringify(await stageState(ctx)));
  await shot(ctx, 'desktop-3d.png');
  // Look-back: back to "Karte + 3D", 6 steps back on the time axis
  await clickText(ctx, '.zt-viewseg button', /Karte \+ 3D/); await sleep(1500);
  // Scrub to the left edge (loads the measured look-back frames), then step further back with the keyboard.
  const tr = await ctx.evaluate(`(() => { const b = document.querySelector('.rdr-tl-track').getBoundingClientRect(); return { x: b.x + 2, y: b.y + b.height / 2 }; })()`);
  await click(ctx, tr); await sleep(5000);
  await ctx.evaluate(`document.querySelector('.rdr-tl-track')?.focus()`);
  for (let i = 0; i < 6; i++) {
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await sleep(250);
  }
  console.log('Desktop: Zeitachse Text', JSON.stringify(await ctx.evaluate(`document.querySelector('.rdr-timeline')?.innerText?.slice(0, 60) ?? null`)));
  console.log('Desktop Rückblick (Zustand):', JSON.stringify(await stageState(ctx)));
  // Forward: +30 min ⇒ towers stay, the ellipse of the slider time is highlighted.
  for (let i = 0; i < 12; i++) {
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await sleep(300);
    if (i < 4) {
      const tl = await ctx.evaluate(`document.querySelector('.rdr-timeline')?.innerText?.split('\\n').slice(0, 2).join(' ') ?? null`);
      const f = await ctx.evaluate(`JSON.stringify(window.__ztStage.getFilter('zt-cone-now')[2])`);
      console.log(`Desktop Schritt +${i + 1}: ${tl} · Ellipse ${f} · Türme ${await ctx.evaluate(`window.__ztStage.querySourceFeatures('zt-towers').length`)}`);
      if (i === 1) await shot(ctx, 'desktop-zukunft-ellipse.png');
    }
  }
  await sleep(1500);
  console.log('Desktop Zukunft: Zeitachse', JSON.stringify(await ctx.evaluate(`document.querySelector('.rdr-timeline')?.innerText?.slice(0, 40) ?? null`)),
    'Ellipse', JSON.stringify(await ctx.evaluate(`JSON.stringify(window.__ztStage.getFilter('zt-cone-now'))`)), JSON.stringify(await stageState(ctx)));
  await shot(ctx, 'desktop-zukunft.png');
  console.log('Desktop: Zeitachse', JSON.stringify(await ctx.evaluate(`document.querySelector('.rdr-tl-track')?.getAttribute('aria-valuetext') ?? document.querySelector('.rdr-tl-track')?.getAttribute('aria-valuenow')`)));
  await sleep(2500); await idle(ctx);
  console.log('Desktop Rückblick:', JSON.stringify(await stageState(ctx)));
  await shot(ctx, 'desktop-rueckblick.png');
  // Austria east: no cell data
  await ctx.evaluate(`(window.__ztStage.jumpTo({ center: [16.37, 48.2], zoom: 8 }), 0)`); await sleep(2500);
  console.log('Desktop Wien:', JSON.stringify(await stageState(ctx)));
  await shot(ctx, 'desktop-wien.png');
  // Reset
  await ctx.evaluate(`(window.__ztStage.easeTo({ pitch: 20, bearing: 70, duration: 0 }), 0)`); await sleep(300);
  await ctx.evaluate(`document.querySelector('.zt-reset')?.click()`); await sleep(1200);
  console.log('Desktop: nach Zurücksetzen', JSON.stringify(await ctx.evaluate(`({ pitch: Math.round(window.__ztStage.getPitch()), bearing: Math.round(window.__ztStage.getBearing()) })`)));
  // Map view: no stage
  await clickText(ctx, '.zt-viewseg button', /^Karte$/); await sleep(1500);
  console.log('Desktop Karte:', JSON.stringify(await ctx.evaluate(`({ stage: !!document.querySelector('.zt-stage'), aside: !!document.querySelector('.zt-aside'), slim: !!document.querySelector('.zt-dockwrap.is-slim') })`)));
  await shot(ctx, 'desktop-karte.png');
  await ctx.close();
}
// ---------------------------------------------------------------- without flag
{
  const ctx = await browser.newContext({ width: 1440, height: 900 });
  await setup(ctx);
  // Default (switched on 09.10.): switch there, start view "Karte", no stage and no 3D chunk until chosen.
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}` });
  await sleep(SECS * 1000);
  console.log('Voreinstellung:', JSON.stringify(await ctx.evaluate(`({ viewseg: [...document.querySelectorAll('.zt-viewseg button')].map((b) => b.textContent + (b.classList.contains('is-active') ? ' *' : '')), stage: !!document.querySelector('.zt-stage'), chunk: performance.getEntriesByType('resource').some((e) => /TowerStage-/.test(e.name)) })`)));
  await shot(ctx, 'desktop-voreinstellung.png');
  // Fallback `?z3d=0`: the Regenradar before ZT — no ZT element.
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}?z3d=0` });
  await sleep(SECS * 1000);
  console.log('Rückfall ?z3d=0:', JSON.stringify(await ctx.evaluate(`({ zt: document.querySelectorAll('[class*="zt-"]').length, viewseg: !!document.querySelector('.zt-viewseg') })`)));
  await shot(ctx, 'desktop-ohne-schalter.png');
  await ctx.close();
}
// ---------------------------------------------------------------- Mobile
{
  const ctx = await browser.newContext({ width: 390, height: 844, mobile: true });
  await setup(ctx);
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}?z3d=1&ztdebug=1` });
  await sleep(SECS * 1000);
  console.log('Mobil: Reiter 3D', await clickText(ctx, '.rm-tab', /3D/));
  await waitFor(ctx, `!!window.__ztStage && window.__ztStage.isStyleLoaded()`);
  await ctx.evaluate(`(window.__ztStage.jumpTo({ center: [11.62, 47.12], zoom: 8.6 }), 0)`);
  await waitFor(ctx, `(window.__ztStage?.querySourceFeatures('zt-towers').length ?? 0) > 0`, 40);
  await idle(ctx); await sleep(1500);
  console.log('Mobil:', JSON.stringify(await stageState(ctx)));
  console.log('Mobil: pixelRatio', await ctx.evaluate(`window.__ztStage.getPixelRatio()`));
  const pt = await towerPoint(ctx, 12);
  if (pt) { await click(ctx, pt); await sleep(1200); }
  console.log('Mobil: Steckbrief', JSON.stringify(await facts(ctx)));
  console.log('Mobil: Ziele', JSON.stringify(await ctx.evaluate(`[...document.querySelectorAll('.rm-tab, .zt-reset, .zt-legend--mobile > summary, .maplibregl-ctrl-group button')].map((b) => { const r = b.getBoundingClientRect(); return (b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 18) + ' ' + Math.round(r.width) + '×' + Math.round(r.height); })`)));
  await shot(ctx, 'mobil-3d.png');
  await ctx.close();
}
console.log(`\nKONRAD3D-Slots bedient: ${[...new Set(served)].length} (${[...new Set(served)].slice(0, 6).join(', ')} …)`);
console.log(`Konsole (Fehler/Warnungen): ${lines.length}`);
for (const l of lines) console.log('  ' + l);
await browser.close();
process.exit(0);
