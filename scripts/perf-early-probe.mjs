/**
 * perf-early-probe.mjs — DEV probe of the early analysis frame (Phase PF, M1): polls `window.__precipSources()` and `window.__pfDraw`
 * on a `vite dev` page every 200 ms and prints when the early frame, the full stack, the first radar texture upload and the draw
 * effect runs appear.   node scripts/perf-early-probe.mjs --base=http://127.0.0.1:5402 [--path=/regenradar/muenchen] [--wait=20]
 */
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5402';
const PATH = args.path ?? '/regenradar/muenchen';
const WAIT = Number(args.wait ?? 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INSTR = `(() => { const P = { tex: [] }; window.__perfTex = P; const RADAR = new Set(['1100x1200','701x431','710x640','600x512']);
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const p = C.prototype; for (const k of ['texImage2D','texSubImage2D']) { const f = p[k]; p[k] = function (...a) { let w = null, h = null; if (a.length >= 9 && typeof a[3] === 'number') { w = a[k === 'texImage2D' ? 3 : 4]; h = a[k === 'texImage2D' ? 4 : 5]; } if (w && h && RADAR.has(w + 'x' + h)) { const px = a[a.length - 1]; let nz = false; if (px && px.length) for (let i = 0; i < px.length; i += 97) if (px[i]) { nz = true; break; } if (P.tex.length < 40) P.tex.push([Math.round(performance.now()), w + 'x' + h, nz ? 'nz' : 'zero']); } return f.apply(this, a); }; } }
})()`;
const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ width: 1440, height: 900 });
const msgs = [];
browser.on((m) => { if (m.sessionId === ctx.sessionId && (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown')) msgs.push(m.method === 'Runtime.exceptionThrown' ? 'EXC ' + String(m.params.exceptionDetails?.exception?.description ?? '').slice(0, 300) : (m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)); });
await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTR });
await ctx.send('Page.navigate', { url: BASE + PATH });
const t0 = Date.now();
let lastKey = '';
while (Date.now() - t0 < WAIT * 1000) {
  await sleep(200);
  const s = await ctx.evaluate(`(() => { const s = window.__precipSources?.(); const d = window.__pfDraw ?? []; return { now: Math.round(performance.now()), early: !!s?.early, earlyT: s?.early ? s.early.runAt.toISOString() : null, rv: s?.rv?.frames?.length ?? 0, inca: !!s?.inca, rzc: !!s?.rzc, masks: Object.keys(s?.masks ?? {}).join(''), draws: d.length, lastDraw: d[d.length - 1] ?? null, tex: window.__perfTex?.tex ?? [] }; })()`).catch((e) => ({ err: String(e) }));
  const key = JSON.stringify([s.early, s.rv, s.inca, s.rzc, s.masks, s.draws, s.tex?.length]);
  if (key !== lastKey) { lastKey = key; console.log(`${String(Math.round((Date.now() - t0) / 100) / 10).padStart(5)} s  early=${s.early} rv=${s.rv} inca=${s.inca} rzc=${s.rzc} masks=${s.masks} draws=${s.draws} lastDraw=${JSON.stringify(s.lastDraw)} tex=${JSON.stringify((s.tex ?? []).slice(0, 6))}`); }
}
const d = await ctx.evaluate('JSON.stringify(window.__pfDraw ?? [])').catch(() => '[]');
console.log('--- draw effect runs ---'); for (const x of JSON.parse(d).slice(0, 30)) console.log(JSON.stringify(x));
console.log('--- console (first 25) ---'); for (const m of msgs.slice(0, 25)) console.log(m);
await ctx.close(); await browser.close();
