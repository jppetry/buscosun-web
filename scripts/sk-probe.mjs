/**
 * sk-probe.mjs — Phase SK (audit/schneefallgrenze-flaeche.md): the snow cap in a real browser (CDP, Dev server).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sk-probe.mjs --base=http://127.0.0.1:5197 [--place=innsbruck] [--out=audit/schneefallgrenze-flaeche] [--secs=12]
 *
 * Desktop 1440×900 with `?sk=1&z3d=1&ansicht3d=split`: layer "Schneegrenze" on, 2D cap/line/legend, ZT stage with the cap
 * below `zt-cone`, tap on a slope (popup), place card + bar click (map time), hover text. Field index blocked ⇒ hint, no
 * tint. Without the flag: today's ICON-D2 line note, no `sk-` layer. Mobile 390×844: Schnellblick card, 44-px targets.
 * Console errors/warnings of every run, plus the `[sk]` build times (`?sklog=1`).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5197', PLACE = args.place ?? 'innsbruck', OUT = args.out ?? 'audit/schneefallgrenze-flaeche';
const SECS = Number(args.secs ?? 12);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 180_000 });
const lines = [], skLog = [];
const watch = (ctx, opts = {}) => browser.on((msg) => {
  if (msg.sessionId !== ctx.sessionId) return;
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (msg.params.type === 'error' || msg.params.type === 'warning') lines.push(`[${opts.tag ?? ''}${msg.params.type}] ${text}`.slice(0, 300));
    if (msg.params.type === 'debug' && text.startsWith('[sk]')) skLog.push(`${opts.tag ?? ''}${text.slice(0, 160)}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') lines.push(`[${opts.tag ?? ''}exception] ${(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text ?? '').slice(0, 400)}`);
  if (msg.method === 'Fetch.requestPaused') ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 404, body: '' }).catch(() => {});
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
const waitFor = async (ctx, expr, maxS = 60) => { for (let i = 0; i < maxS * 2; i++) { const v = await ctx.evaluate(expr); if (v) return v; await sleep(500); } return null; };
const clickText = (ctx, sel, re) => ctx.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => ${re}.test(x.textContent.trim())); if (!b) return false; b.click(); return true; })()`);
const click = async (ctx, pt) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); };
const mapState = (ctx, handle) => ctx.evaluate(`(() => { const m = ${handle}; if (!m || !m.getStyle?.()) return { noStyle: true }; const ids = m.getStyle().layers.map((l) => l.id);
  const sk = ids.filter((i) => /^sk3?-/.test(i));
  return { sk, capIdx: ids.findIndex((i) => /^sk3?-cap$/.test(i)), nextAfterCap: ids[ids.findIndex((i) => /^sk3?-cap$/.test(i)) + 1] ?? null,
    radarIdx: ids.findIndex((i) => /^precip-rain/.test(i)), coneIdx: ids.indexOf('zt-cone'),
    lines: sk.length ? m.querySourceFeatures(sk[0].startsWith('sk3') ? 'sk3-line-src' : 'sk-line-src').length : 0,
    labels: sk.length ? m.queryRenderedFeatures({ layers: [sk[0].startsWith('sk3') ? 'sk3-label' : 'sk-label'] }).map((f) => f.properties.label).slice(0, 3) : [],
    drawnLines: sk.length ? m.queryRenderedFeatures({ layers: [sk[0].startsWith('sk3') ? 'sk3-line' : 'sk-line'] }).length : 0,
    capVisible: sk.length ? m.getLayoutProperty(sk[0].startsWith('sk3') ? 'sk3-cap' : 'sk-cap', 'visibility') : null,
    oldLine: ids.filter((i) => /snowline/i.test(i) && !/^sk/.test(i)).map((i) => i + ':' + m.getLayoutProperty(i, 'visibility')) }; })()`);

// ---------------------------------------------------------------- Desktop with flag
{
  const ctx = await browser.newContext({ width: 1440, height: 900 });
  watch(ctx, { tag: 'D ' });
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}?sk=1&z3d=1&ztdebug=1&sklog=1` });
  await waitFor(ctx, `!!window.__map && [...document.querySelectorAll('.rr-layer')].some((b) => /Schneegrenze/.test(b.textContent))`, 90);
  await sleep(SECS * 1000);
  console.log('Desktop: Ebene „Schneegrenze" an', await clickText(ctx, '.rr-layer', /^Schneegrenze/));
  await waitFor(ctx, `!!window.__map?.getLayer('sk-cap')`, 40);
  console.log('Desktop: Ansicht „Karte + 3D"', await clickText(ctx, '.zt-viewseg button', /Karte \+ 3D/));
  await waitFor(ctx, `!!window.__map?.getStyle?.() && !!window.__map.getLayer('sk-cap')`, 60);
  await ctx.evaluate(`(window.__map.jumpTo({ center: [11.25, 47.05], zoom: 8.6 }), 0)`);
  const ready = `/gültig|Keine Tönung|nicht verfügbar/.test(document.querySelector('.sk-leg-status, .sk-legend-m')?.innerText ?? '')`;
  console.log('Desktop: Legende fertig', !!(await waitFor(ctx, ready, 90)));
  await sleep(4000);
  console.log('Desktop 2D:', JSON.stringify(await mapState(ctx, 'window.__map')));
  console.log('Desktop Legende:', JSON.stringify(await ctx.evaluate(`document.querySelector('.sk-leg-status, .sk-legend-m')?.innerText?.replace(/\\s+/g, ' ') ?? null`)));
  console.log('Desktop alte Notiz sichtbar:', await ctx.evaluate(`[...document.querySelectorAll('.nc-radar-snownote')].some((e) => /ICON-D2-Temperatur/.test(e.textContent))`));
  await waitFor(ctx, `!!window.__ztStage?.getLayer('sk3-cap')`, 40);
  await ctx.evaluate(`(window.__ztStage.jumpTo({ center: [11.1, 47.0], zoom: 9.2 }), 0)`);
  await sleep(9000);
  console.log('Desktop 3D:', JSON.stringify(await mapState(ctx, 'window.__ztStage')));
  await shot(ctx, 'sk-desktop-split.png');
  await shot(ctx, 'sk-desktop-3d.png', '.zt-stage');
  // Readout card
  const card = await waitFor(ctx, `(() => { const c = document.querySelector('.rr-readout .sk-card'); return c && !c.querySelector('.ev-spinner') ? c.innerText.replace(/\\n+/g, ' | ') : null; })()`, 60);
  console.log('Desktop Karte am Ort:', JSON.stringify(card));
  await shot(ctx, 'sk-desktop-readout.png', '.rr-readout');
  // Hover on the 2D map
  const mc = await ctx.evaluate(`(() => { const r = window.__map.getCanvas().getBoundingClientRect(); return { x: r.x + r.width * 0.45, y: r.y + r.height * 0.55 }; })()`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mc.x, y: mc.y });
  await sleep(600);
  console.log('Desktop Hover:', JSON.stringify(await ctx.evaluate(`document.querySelector('.nc-radar-hover')?.innerText ?? null`)));
  // Bar click: +24 h ⇒ legend validity changes
  const before = await ctx.evaluate(`document.querySelector('.sk-leg-status, .sk-legend-m')?.innerText ?? ''`);
  console.log('Desktop Leiste Klick +24 h:', await ctx.evaluate(`(() => { const c = document.querySelectorAll('.rr-readout .sk-cell'); if (c.length < 25) return false; c[24].click(); return c.length; })()`));
  await sleep(6000);
  const after = await ctx.evaluate(`document.querySelector('.sk-leg-status, .sk-legend-m')?.innerText ?? ''`);
  console.log('Desktop Legende nach Klick:', JSON.stringify(after.replace(/\s+/g, ' ')), 'geändert:', before !== after);
  console.log('Desktop „Karte folgt wieder dem Slider":', await ctx.evaluate(`!!document.querySelector('.sk-follow')`));
  await shot(ctx, 'sk-desktop-plus24.png');
  // Tap on a slope in 3D (stage centre)
  const sc = await ctx.evaluate(`(() => { const r = window.__ztStage.getCanvas().getBoundingClientRect(); return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.6 }; })()`);
  await click(ctx, sc); await sleep(1500);
  console.log('Desktop 3D Antippen:', JSON.stringify(await ctx.evaluate(`document.querySelector('.sk-tap')?.innerText?.replace(/\\n+/g, ' | ') ?? null`)));
  await shot(ctx, 'sk-desktop-3d-tap.png', '.zt-stage');
  // Review finding 5: leaving 3D removes the stage map while a build may still run — the console must stay clean.
  console.log('Desktop: zurück auf „Karte"', await clickText(ctx, '.zt-viewseg button', /^Karte$/));
  await ctx.evaluate(`(window.__map.jumpTo({ center: [11.6, 47.25], zoom: 8.4 }), 0)`);
  await sleep(6000);
  console.log('Desktop nach Abbau der Bühne:', JSON.stringify(await mapState(ctx, 'window.__map')));
  await ctx.close();
}
// ---------------------------------------------------------------- field index blocked ⇒ hint, no tint
{
  const ctx = await browser.newContext({ width: 1440, height: 900 });
  watch(ctx, { tag: 'B ' });
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*point/field/v1/index.json*' }] });
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}?sk=1` });
  await sleep(SECS * 1000);
  await waitFor(ctx, `!!window.__map && [...document.querySelectorAll('.rr-layer')].some((b) => /Schneegrenze/.test(b.textContent))`, 90); await clickText(ctx, '.rr-layer', /^Schneegrenze/);
  await waitFor(ctx, `/Keine Tönung|nicht verfügbar|gültig/.test(document.querySelector('.sk-leg-status')?.innerText ?? '')`, 60);
  console.log('Ohne Feld: Legende', JSON.stringify(await ctx.evaluate(`document.querySelector('.sk-leg-status, .sk-legend-m')?.innerText?.replace(/\\s+/g, ' ') ?? null`)));
  console.log('Ohne Feld: Linien', JSON.stringify(await mapState(ctx, 'window.__map')));
  await shot(ctx, 'sk-desktop-ohne-feld.png');
  await ctx.close();
}
// ---------------------------------------------------------------- without flag
{
  const ctx = await browser.newContext({ width: 1440, height: 900 });
  watch(ctx, { tag: 'N ' });
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}` });
  await sleep(SECS * 1000);
  await waitFor(ctx, `!!window.__map && [...document.querySelectorAll('.rr-layer')].some((b) => /Schneegrenze/.test(b.textContent))`, 90); await clickText(ctx, '.rr-layer', /^Schneegrenze/);
  await sleep(9000);
  console.log('Ohne Schalter:', JSON.stringify(await mapState(ctx, 'window.__map')), 'Notiz ICON-D2:', await ctx.evaluate(`[...document.querySelectorAll('.nc-radar-snownote')].some((e) => /ICON-D2-Temperatur/.test(e.textContent))`), 'sk-Elemente:', await ctx.evaluate(`document.querySelectorAll('[class*="sk-"]').length`));
  await ctx.close();
}
// ---------------------------------------------------------------- Mobile
{
  const ctx = await browser.newContext({ width: 390, height: 844, mobile: true });
  watch(ctx, { tag: 'M ' });
  await ctx.send('Page.navigate', { url: `${BASE}/regenradar/${PLACE}?sk=1&sklog=1` });
  await sleep(SECS * 1000);
  console.log('Mobil: Reiter Layer', await clickText(ctx, '.rm-tab', /Layer/)); await sleep(600);
  console.log('Mobil: Schneegrenze an', await clickText(ctx, '.rm-layer', /Schneegrenze/)); await sleep(600);
  console.log('Mobil: Reiter Schnellblick', await clickText(ctx, '.rm-tab', /Schnellblick/));
  const card = await waitFor(ctx, `(() => { const c = document.querySelector('.rm-glance .sk-card'); return c && !c.querySelector('.ev-spinner') ? c.innerText.replace(/\\n+/g, ' | ') : null; })()`, 60);
  console.log('Mobil Karte am Ort:', JSON.stringify(card));
  console.log('Mobil Ziele:', JSON.stringify(await ctx.evaluate(`[...document.querySelectorAll('.rm-glance .sk-cell')].slice(0, 3).map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.width) + '×' + Math.round(r.height); }).concat([...document.querySelectorAll('.rm-glance .sk-cell')].length + ' Zellen')`)));
  console.log('Mobil Hinweis auf der Karte:', JSON.stringify(await ctx.evaluate(`(() => { const e = document.querySelector('.sk-leg-status, .sk-legend-m'); return e ? getComputedStyle(e).display + ' ' + e.innerText.replace(/\\s+/g, ' ').slice(0, 120) : null; })()`)));
  await sleep(4000);
  console.log('Mobil 2D:', JSON.stringify(await mapState(ctx, 'window.__map')));
  await shot(ctx, 'sk-mobil-schnellblick.png');
  await ctx.close();
}
console.log(`\n[sk]-Bauzeiten: ${skLog.length}`);
for (const l of skLog.slice(0, 12)) console.log('  ' + l);
console.log(`Konsole (Fehler/Warnungen): ${lines.length}`);
for (const l of lines) console.log('  ' + l);
await browser.close();
process.exit(0);
