// Wind particle density vs. zoom — measurement lab (own Chromium, real GPU,
// background/occlusion throttling disabled so rAF runs at full rate).
//
//   node wind-zoom-lab.mjs <outDir> [headless|headed] [variantsJson]
//
// variantsJson: [{ "name": "alt", "setup": "wl.zoomInThinExp = 0" }, ...]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe');
const outDir = process.argv[2] ?? '.';
const mode = process.argv[3] ?? 'headed';
const variants = JSON.parse(process.argv[4] ?? '[{"name":"ist","setup":""}]');
const ZOOMS = [4.5, 5.5, 6, 7, 8, 9, 10, 11, 12, 13];
const SHOT_ZOOMS = new Set([6, 9, 11, 12.5]);
const VW = Number(process.env.LAB_W ?? 1440), VH = Number(process.env.LAB_H ?? 900), MOB = process.env.LAB_MOBILE === '1';
const URL = process.env.LAB_URL ?? 'http://localhost:5214/wetterkarte/wind?lat=50.30&lon=10.40&z=6';
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'wind-lab-'));
const args = [
  '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion',
  '--force-device-scale-factor=1', '--window-size=1440,1000', '--hide-scrollbars',
  '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu',
];
if (mode === 'headless') args.push('--headless=new');
const child = spawn(CHROME, [...args, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { child.kill(); } catch {} });
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  const to = setTimeout(() => rej(new Error('no devtools endpoint')), 30000);
  child.stderr.on('data', (d) => { buf += String(d); const m = buf.match(/ws:\/\/[^\s]+/); if (m) { clearTimeout(to); res(m[0]); } });
});
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1; const pending = new Map(); const listeners = new Set();
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id != null && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); return; }
  for (const l of listeners) l(msg);
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = nextId++; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Page.enable'); await s('Runtime.enable');
await s('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: MOB ? 3 : 1, mobile: MOB }); if (MOB) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const consoleMsgs = [];
listeners.add((m) => { if (m.sessionId === sessionId && m.method === 'Runtime.consoleAPICalled' && /warn|error/.test(m.params.type)) consoleMsgs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`); if (m.sessionId === sessionId && m.method === 'Runtime.exceptionThrown') consoleMsgs.push('exception: ' + m.params.exceptionDetails.text); });
const ev = async (expr) => { const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await s('Page.navigate', { url: URL });
await wait(3000);
const ready = await ev(`(async () => { for (let i = 0; i < 80; i++) { const wl = window.__map?.style?._layers?.wind?.implementation; if (wl?.windData) return true; await new Promise(r => setTimeout(r, 500)); } return false; })()`);
if (!ready) throw new Error('wind data never arrived');
await ev(`(() => {
  const m = window.__map; const wl = m.style._layers.wind.implementation; window.__wl = wl;
  window.__fps = () => new Promise(res => { let n = 0; const t0 = performance.now(); const f = (t) => { n++; if (t - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); });
  window.__ink = () => {
    const gl = wl.gl; const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER, wl.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, wl.backgroundTexture, 0);
    const w = wl.screenWidth, h = wl.screenHeight; const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    let cov = 0, sum = 0; const n = w * h;
    for (let i = 3; i < px.length; i += 4) { const a = px[i]; sum += a; if (a > 40) cov++; }
    return { cov: +(cov / n * 100).toFixed(2), meanA: +(sum / n / 255 * 100).toFixed(2) };
  };
  return true;
})()`);
const gpu = await ev(`(() => { const g = window.__wl.gl; const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; })()`);
console.log('GPU:', gpu, '| mode:', mode);

const results = {};
for (const v of variants) {
  if (v.setup) await ev(`(() => { const wl = window.__wl; ${v.setup}; return true; })()`);
  const rows = [];
  for (const z of ZOOMS.concat([12.5])) {
    await ev(`window.__map.jumpTo({ zoom: ${z} }), true`);
    await wait(3200);
    const r = await ev(`(async () => {
      const m = window.__map; const wl = window.__wl;
      const fps = await window.__fps();
      const ink = window.__ink();
      const cssW = m.getCanvas().clientWidth, cssH = m.getCanvas().clientHeight;
      const drawn = wl.getEffectiveParticleCount();
      return { z: ${z}, fps, state: wl._numParticles, drawn, perMP: Math.round(drawn / (cssW * cssH / 1e6)), spacingPx: +Math.sqrt(cssW * cssH / drawn).toFixed(1), ...ink, tier: wl.perfState?.tier, trailScale: wl.perfState?.trailScale };
    })()`);
    rows.push(r);
    if (SHOT_ZOOMS.has(z)) {
      const { data } = await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: VW, height: VH, scale: 1 } });
      writeFileSync(join(outDir, `${v.name}-z${String(z).replace('.', '_')}.png`), Buffer.from(data, 'base64'));
    }
    console.log(v.name, JSON.stringify(r));
  }
  results[v.name] = rows;
}
writeFileSync(join(outDir, 'results.json'), JSON.stringify({ gpu, mode, url: URL, when: new Date().toISOString(), results, console: consoleMsgs }, null, 2));
console.log('console warnings/errors:', consoleMsgs.length ? consoleMsgs : 'none');
try { ws.close(); } catch {}
child.kill();
await wait(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
