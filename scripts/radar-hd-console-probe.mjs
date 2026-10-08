/**
 * radar-hd-console-probe.mjs — Phase HD: what the page logs while the precipitation layer loads (shader errors,
 * exceptions, WebGL state). `node scripts/radar-hd-console-probe.mjs --base=http://127.0.0.1:5231 --q=?hd=1 [--secs=30]`
 */
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5231', Q = args.q ?? '', SECS = Number(args.secs ?? 30);
const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 120_000 });
const ctx = await browser.newContext({ width: 1440, height: 900 });
const lines = [];
browser.on((msg) => {
  if (msg.sessionId !== ctx.sessionId) return;
  if (msg.method === 'Runtime.consoleAPICalled') lines.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 400));
  if (msg.method === 'Runtime.exceptionThrown') lines.push(`[exception] ${(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text ?? '').slice(0, 600)}`);
});
await ctx.send('Page.navigate', { url: `${BASE}${args.path ?? '/wetterkarte/niederschlag/muenchen'}${Q}` });
await new Promise((r) => setTimeout(r, SECS * 1000));
// optional camera for the picture (`--center=lon,lat --zoom=z`): the page as the user sees it, basemap included
if (args.center) {
  const [lon, lat] = args.center.split(',').map(Number);
  await ctx.evaluate(`(() => { window.__map.jumpTo({ center: [${lon}, ${lat}], zoom: ${Number(args.zoom ?? 8)}, bearing: 0, pitch: 0 }); return true; })()`);
  await new Promise((r) => setTimeout(r, 6000));
}
// optional click (`--click=<css selector> --afterClickMs=N`): e.g. the Regenradar's play button, then a shot mid-animation
// (HD-4: the in-between picture along the motion field). Under Git Bash pass paths with MSYS_NO_PATHCONV=1.
if (args.click) {
  const clicked = await ctx.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(args.click)}); if (!el) return false; el.click(); return true; })()`);
  console.log(`click ${args.click}: ${clicked}`);
  // while the animation runs: sample the morph state of the HD layers every 150 ms (how often a morph was active)
  const samples = [];
  const until = Date.now() + Number(args.afterClickMs ?? 1300);
  while (Date.now() < until) {
    samples.push(await ctx.evaluate(`(() => { const m = window.__map; return ['precip-rain-hd-de', 'precip-rain-hd-at', 'precip-rain-hd-ch'].map((id) => { const l = m.getLayer(id); const impl = l && (l.implementation ?? l); return impl && impl.morph ? +impl.morph.frac.toFixed(2) : null; }); })()`));
    await new Promise((r) => setTimeout(r, 150));
  }
  const n = samples.length, withMorph = samples.filter((s) => s.some((f) => f != null)).length;
  console.log(`morph samples: ${withMorph}/${n} with an active morph · fracs DE ${JSON.stringify(samples.map((s) => s[0]))}`);
}
const gl = await ctx.evaluate(`(() => { const c = document.querySelector('canvas.maplibregl-canvas'); if (!c) return { noCanvas: true, canvases: document.querySelectorAll('canvas').length, url: location.href, text: document.body.innerText.slice(0, 300) };
  const r = c.getBoundingClientRect(); const s = window.__precipSources ? window.__precipSources() : null; const m = window.__map;
  const ids = m ? m.getStyle().layers.map((l) => l.id) : null;
  return { rect: [r.x, r.y, r.width, r.height], css: [c.clientWidth, c.clientHeight], buffer: [c.width, c.height], styleLoaded: m && m.isStyleLoaded(), nLayers: ids && ids.length,
    precipLayers: ids && ids.filter((id) => /precip|rain|hd|nowcast|dim/.test(id)).map((id) => id + ':' + (m.getLayoutProperty(id, 'visibility') || 'visible')),
    hasLayer: m && ['precip-rain-layer', 'precip-rain-hd-de', 'precip-rain-hd-at', 'precip-rain-hd-ch'].map((id) => id + '=' + !!m.getLayer(id)),
    hdState: m && ['precip-rain-hd-de', 'precip-rain-hd-at', 'precip-rain-hd-ch'].map((id) => { const l = m.getLayer(id); if (!l) return id + ': absent'; const impl = l.implementation ?? l;
      return id + ': vis=' + (m.getLayoutProperty(id, 'visibility') || 'visible') + ' opacity=' + impl.opacity + ' tex=' + impl.texW + 'x' + impl.texH + ' filter=' + impl.filter + ' morph=' + (impl.morph ? ('frac ' + impl.morph.frac + ' b=' + impl.morph.b.length + ' flow=' + impl.morph.flow.w + 'x' + impl.morph.flow.h) : 'none') + ' mask=' + !!impl.maskRef; }),
    sources: s ? { rv: !!s.rv, inca: !!s.inca, rzc: !!s.rzc, masks: s.masks && Object.keys(s.masks), hd: s.hd } : null }; })()`);
console.log(JSON.stringify(gl, null, 1));
if (gl && gl.rect) {
  const { writeFileSync } = await import('node:fs');
  const [x, y, w, h] = gl.rect;
  const { data } = await ctx.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h), scale: 1 } });
  writeFileSync(args.shot ?? '.cache/radar-hd-probe.png', Buffer.from(data, 'base64'));
}
for (const l of lines) if (/error|warn|shader|webgl|exception|niederschlag|rain|hd/i.test(l)) console.log(l);
console.log(`(${lines.length} console lines total)`);
await ctx.close();
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 3000))]);
process.exit(0);
