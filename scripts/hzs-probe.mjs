/**
 * hzs-probe.mjs — Phase HZS (audit/hoehen-zeit-schnitt.md): the height-time section in a real browser (CDP headless).
 *
 *   node scripts/hzs-probe.mjs --base=http://127.0.0.1:5188 [--place=innsbruck] [--out=audit/hoehen-zeit-schnitt]
 *        [--fixture=1] [--q=?hzs=1] [--secs=10]
 *
 * Desktop 1440×900: opens "Karte + Höhe", waits for the chart, screenshots (also with hover and 14 days), reads the
 * sentence and the screen-reader text, console errors. Mobile 390×844 (DPR 3): tab "Höhe". `--fixture=1` additionally
 * stores the REAL buscosun Fusion answer at the place (v2 without member lists + cells) for `verify-height-time.mjs`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5188', PLACE = args.place ?? 'innsbruck', OUT = args.out ?? 'audit/hoehen-zeit-schnitt';
const Q = args.q ?? '?hzs=1', SECS = Number(args.secs ?? 10);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 180_000 });
const lines = [];
const watch = (ctx) => browser.on((msg) => {
  if (msg.sessionId !== ctx.sessionId) return;
  if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) lines.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
  if (msg.method === 'Runtime.exceptionThrown') lines.push(`[exception] ${(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text ?? '').slice(0, 500)}`);
});
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
const waitChart = async (ctx, maxS = 90) => {
  for (let i = 0; i < maxS; i++) {
    const st = await ctx.evaluate(`(() => ({ svg: !!document.querySelector('.hzs-svg'), state: document.querySelector('.hzs-state')?.innerText ?? null, foot: document.querySelector('.hzs-foot')?.innerText ?? null }))()`);
    if (st.svg && st.foot && !/folgen|lädt/.test(st.foot)) return st;
    if (st.state && /Lücke/.test(st.state)) return st;
    await sleep(1000);
  }
  return null;
};
const readOut = (ctx) => ctx.evaluate(`(() => ({
  sentence: document.querySelector('.hzs-sentence')?.innerText ?? null,
  sr: document.querySelector('.hzs-sr')?.innerText ?? null,
  foot: document.querySelector('.hzs-foot')?.innerText ?? null,
  bars: document.querySelectorAll('.hzs-svg rect[rx]').length,
  polylines: document.querySelectorAll('.hzs-svg polyline').length,
  polygons: document.querySelectorAll('.hzs-svg polygon').length,
}))()`);
const hoverAt = (ctx, frac) => ctx.evaluate(`(() => { const s = document.querySelector('.hzs-svg'); const b = s.getBoundingClientRect();
  const x = b.x + 42 + (b.width - 108) * ${frac}, y = b.y + b.height / 2;
  s.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' }));
  return new Promise((r) => setTimeout(() => r(document.querySelector('.hzs-tip')?.innerText ?? null), 300)); })()`);

// ---------------------------------------------------------------- Desktop
{
  const ctx = await browser.newContext({ width: 1440, height: 900 });
  watch(ctx);
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}${Q}` });
  await sleep(SECS * 1000);
  const toggled = await ctx.evaluate(`(() => { const b = [...document.querySelectorAll('.rr-viewtoggle button')].find((x) => /Höhe/.test(x.textContent)); if (!b) return false; b.click(); return true; })()`);
  console.log(`Desktop: Umschalter „Karte + Höhe" ${toggled ? 'gefunden' : 'FEHLT'}`);
  const st = await waitChart(ctx);
  console.log('Desktop: Zustand', JSON.stringify(st));
  await sleep(1500);
  console.log('Desktop: Auslese', JSON.stringify(await readOut(ctx), null, 1));
  await shot(ctx, `desktop-${PLACE}-48h.png`);
  await shot(ctx, `desktop-${PLACE}-48h-pane.png`, '.rr-hzs-pane');
  console.log('Desktop: Hover 30 %', JSON.stringify(await hoverAt(ctx, 0.3)));
  await shot(ctx, `desktop-${PLACE}-48h-hover.png`, '.rr-hzs-pane');
  await ctx.evaluate(`(() => { const b = [...document.querySelectorAll('.hzs-seg button')].find((x) => /14/.test(x.textContent)); b && b.click(); return !!b; })()`);
  await sleep(800);
  console.log('Desktop 14 T: Auslese', JSON.stringify(await readOut(ctx), null, 1));
  await shot(ctx, `desktop-${PLACE}-14d-pane.png`, '.rr-hzs-pane');
  if (args.fixture) {
    const fx = await ctx.evaluate(`(async () => {
      const cs = await import('/src/pointForecast/cubeSource.ts');
      const { getPointForecast } = await import('/src/pointForecast/pointForecast.ts');
      const loc = window.location.pathname.split('/').pop();
      const p = ${JSON.stringify({ innsbruck: [47.2692, 11.4041, 'AT'], muenchen: [48.1374, 11.5755, 'DE'], davos: [46.8027, 9.836, 'CH'], garmisch: [47.4917, 11.0955, 'DE'], obergurgl: [46.8697, 11.0275, 'AT'], 'st-moritz': [46.4983, 9.8384, 'CH'] })}[loc];
      const fc = await getPointForecast({ lat: p[0], lng: p[1], country: p[2], hours: 336, includeRadarNowcast: true, pointSource: 'cube' });
      const v2 = JSON.parse(JSON.stringify(fc.cube.v2));
      for (const s of v2.axis.steps) { s.members = []; for (const k of Object.keys(s.vars)) if (s.vars[k]) s.vars[k].members = []; }
      return { capturedAt: new Date().toISOString(), place: loc, lat: p[0], lon: p[1], country: p[2], nowMs: Date.now(), v2, cells: fc.cube.cells ?? null, note: 'members stripped (unused by the model)' };
    })()`);
    writeFileSync(`${OUT}/fixture-${PLACE}.json.gz`, gzipSync(JSON.stringify(fx), { level: 9 }));
    console.log(`  → ${OUT}/fixture-${PLACE}.json.gz (${fx.v2.axis.steps.length} Schritte, ${fx.cells?.length ?? 0} Zellzeilen, hTrue ${fx.v2.point.hTrue})`);
  }
  await ctx.close();
}

// ---------------------------------------------------------------- Mobil
{
  const ctx = await browser.newContext({ width: 390, height: 844, mobile: true });
  watch(ctx);
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}${Q}` });
  await sleep(SECS * 1000);
  const tabbed = await ctx.evaluate(`(() => { const b = [...document.querySelectorAll('.rm-tab')].find((x) => /Höhe/.test(x.textContent)); if (!b) return false; b.click(); return true; })()`);
  console.log(`Mobil: Reiter „Höhe" ${tabbed ? 'gefunden' : 'FEHLT'}`);
  console.log('Mobil: Zustand', JSON.stringify(await waitChart(ctx)));
  await sleep(1500);
  console.log('Mobil: Auslese', JSON.stringify(await readOut(ctx), null, 1));
  const tabs = await ctx.evaluate(`[...document.querySelectorAll('.rm-tab')].map((b) => { const r = b.getBoundingClientRect(); return b.textContent.trim() + ' ' + Math.round(r.width) + '×' + Math.round(r.height); })`);
  console.log('Mobil: Reiter', JSON.stringify(tabs));
  const seg = await ctx.evaluate(`[...document.querySelectorAll('.hzs-seg button')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.width) + '×' + Math.round(r.height); })`);
  console.log('Mobil: Zeitraum-Knöpfe', JSON.stringify(seg));
  await shot(ctx, `mobile-${PLACE}-48h.png`);
  await ctx.close();
}

console.log(`\nKonsole (Fehler/Warnungen): ${lines.length}`);
for (const l of lines) console.log('  ' + l);
await Promise.race([browser.close(), sleep(3000)]);
process.exit(0);
