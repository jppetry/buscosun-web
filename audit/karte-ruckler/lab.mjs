// Mess-Lab für zwei Befunde (01.10.): Niederschlag lädt manchmal lange · Wind ruckelt 1–2 s nach dem Laden.
// Eigener Chromium (echte GPU, kein rAF-Drosseln), frischer Browser-Kontext je Lauf.
//
//   node lab.mjs <mode> <url> [runs] [gapSec] [outJson] [cpu] [warm]
//   mode = precip | wind
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [mode = 'wind', URL = 'https://buscosun.com/wetterkarte/wind', runsArg = '1', gapArg = '0', outJson = '', cpuArg = '1', warmArg = '0'] = process.argv.slice(2);
const RUNS = +runsArg, GAP = +gapArg * 1000, CPU = +cpuArg, WARM = warmArg === '1';
const CHROME = join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe');
const profile = mkdtempSync(join(tmpdir(), 'lab-'));
const args = [
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--headless=new',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion',
  '--force-device-scale-factor=1', '--window-size=1440,900', '--hide-scrollbars',
  '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu',
];
const child = spawn(CHROME, [...args, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
const cleanup = () => { try { child.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
const wsUrl = await new Promise((res, rej) => {
  let buf = ''; const to = setTimeout(() => rej(new Error('no devtools endpoint')), 30000);
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Instrumentierung im Dokument: rAF-Zeitstempel, LoAF mit Skript-Zuordnung, große Textur-Uploads.
const INIT = `(() => {
  const L = window.__lab = { raf: [], loaf: [], tex: [], marks: [] };
  const f = (t) => { L.raf.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) L.loaf.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration,
      scripts: (e.scripts || []).map((s) => ({ inv: s.invoker, type: s.invokerType, src: (s.sourceURL || '').split('/').pop(), fn: s.sourceFunctionName, pos: s.sourceCharPosition, dur: Math.round(s.duration), start: Math.round(s.startTime) })) }); })
    .observe({ type: 'long-animation-frame', buffered: true }); } catch (e) { L.loafErr = String(e); }
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    for (const name of ['texImage2D', 'texSubImage2D']) {
      const orig = C.prototype[name];
      C.prototype[name] = function (...a) {
        const t0 = performance.now(); const r = orig.apply(this, a); const dt = performance.now() - t0;
        let w = 0, h = 0;
        if (a.length >= 9) { w = a[3 + (name === 'texSubImage2D' ? 1 : 0)]; h = a[4 + (name === 'texSubImage2D' ? 1 : 0)]; }
        else { const src = a[a.length - 1]; w = src?.width ?? 0; h = src?.height ?? 0; }
        if (w * h >= 200000) L.tex.push({ t: Math.round(t0), name, w, h, ms: +dt.toFixed(1) });
        return r;
      };
    }
  }
})();`;

async function oneRun(i) {
  const { browserContextId } = await send('Target.createBrowserContext', {});
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId, newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable', { maxTotalBufferSize: 200 * 1024 * 1024 });
  await s('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  if (CPU > 1) await s('Emulation.setCPUThrottlingRate', { rate: CPU });
  await s('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
  const logs = []; const reqs = new Map();
  let navWall = 0, navTs = 0;
  const off = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const unsub = off((m) => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Runtime.consoleAPICalled') logs.push({ t: Math.round(p.timestamp - navWall), type: p.type, text: p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300) });
    else if (m.method === 'Network.requestWillBeSent') { if (!navTs) { navTs = p.timestamp; } reqs.set(p.requestId, { url: p.request.url, t0: p.timestamp, prio: p.request.initialPriority }); }
    else if (m.method === 'Network.responseReceived') { const r = reqs.get(p.requestId); if (r) { r.status = p.response.status; r.xc = p.response.headers['x-cache'] ?? p.response.headers['X-Cache'] ?? null; r.ttfb = p.response.timing ? Math.round(p.response.timing.receiveHeadersEnd) : null; } }
    else if (m.method === 'Network.loadingFinished') { const r = reqs.get(p.requestId); if (r) { r.bytes = p.encodedDataLength; r.t1 = p.timestamp; } }
    else if (m.method === 'Network.loadingFailed') { const r = reqs.get(p.requestId); if (r) { r.failed = p.errorText; r.t1 = p.timestamp; } }
  });
  const go = async () => {
    reqs.clear(); logs.length = 0; navTs = 0;
    navWall = Date.now();
    await s('Page.navigate', { url: URL });
  };
  if (WARM) { await go(); await wait(15000); }
  const nowMs = Date.now();
  // Phase im 5-min-Takt: Alter des jüngsten geratenen RV-Slots (guessRvRuns: Verzug 3,3 min)
  const stepMs = 300000; const newest = Math.floor((nowMs - 3.3 * 60000) / stepMs) * stepMs;
  const ageS = Math.round((nowMs - newest) / 1000);
  if (process.env.LAB_PROFILE) { await s('Profiler.enable'); await s('Profiler.setSamplingInterval', { interval: 250 }); await s('Profiler.start'); }
  await go();
  await wait(mode === 'precip' ? 30000 : +(process.env.LAB_WAIT ?? 12000));
  let profile = null, perfNowAtStop = null;
  if (process.env.LAB_PROFILE) {
    profile = (await s('Profiler.stop')).profile;
    perfNowAtStop = await s('Runtime.evaluate', { expression: 'performance.now()', returnByValue: true }).then((r) => r.result.value);
  }
  const lab =await s('Runtime.evaluate', { expression: 'JSON.stringify(window.__lab)', returnByValue: true }).then((r) => JSON.parse(r.result.value ?? '{}')).catch(() => ({}));
  unsub();
  await send('Target.closeTarget', { targetId }).catch(() => {});
  await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  const rel = (ts) => Math.round((ts - navTs) * 1000);
  const net = [...reqs.values()].map((r) => ({ url: r.url.replace(/^https?:\/\/[^/]+/, (h) => h.includes('jsdelivr') ? 'CDN' : h.includes('buscosun.com') ? '' : h), st: r.status, xc: r.xc, kb: r.bytes != null ? Math.round(r.bytes / 1024) : null, t0: rel(r.t0), t1: r.t1 ? rel(r.t1) : null, ttfb: r.ttfb, prio: r.prio, failed: r.failed }));
  if (profile) attribute(profile, perfNowAtStop, lab);
  return { i, at: new Date(nowMs).toISOString(), slotAgeS: ageS, logs, net, lab };
}

const results = [];
for (let i = 0; i < RUNS; i++) {
  const t = Date.now();
  try { const r = await oneRun(i); results.push(r); summarize(r); } catch (e) { console.log('run', i, 'failed', e.message); }
  if (outJson) writeFileSync(outJson, JSON.stringify(results, null, 1));
  const rest = GAP - (Date.now() - t); if (i < RUNS - 1 && rest > 0) await wait(rest);
}
cleanup(); process.exit(0);

function summarize(r) {
  if (mode === 'precip') {
    const log = r.logs.find((l) => /Niederschlag-Layer/.test(l.text));
    const radar = r.net.filter((n) => /radar|rv|composite|inca|rzc|_dwd_opendata/i.test(n.url));
    const kb = radar.reduce((a, n) => a + (n.kb ?? 0), 0);
    const tex = (r.lab.tex || []).filter((x) => (x.w === 1100 && x.h === 1200) || x.w * x.h >= 300000);
    console.log(`#${r.i} ${r.at} slotAge=${r.slotAgeS}s  rvLog@${log ? log.t : '—'}ms  radarKB=${kb}  ${log ? log.text.slice(40, 200) : ''}`);
    for (const n of radar) console.log(`    ${String(n.t0).padStart(6)}→${String(n.t1 ?? '…').padStart(6)} ${n.st ?? '-'} ${String(n.kb ?? '').padStart(6)}KB ${n.xc ?? ''} ${n.url.slice(0, 110)} ${n.failed ?? ''}`);
  } else {
    const raf = r.lab.raf || [];
    const gaps = [];
    for (let k = 1; k < raf.length; k++) { const d = raf[k] - raf[k - 1]; if (d > 50) gaps.push({ at: Math.round(raf[k - 1]), d: Math.round(d) }); }
    console.log(`#${r.i} ${r.at} frames=${raf.length} gaps>50ms: ${gaps.map((g) => `${g.at}+${g.d}`).join(' ')}`);
    for (const x of r.lab.tex || []) console.log(`    tex ${x.t} ${x.name} ${x.w}x${x.h} ${x.ms}ms`);
    for (const l of (r.lab.loaf || []).filter((l) => l.dur > 80)) console.log(`    loaf ${Math.round(l.start)} dur=${Math.round(l.dur)} block=${Math.round(l.block)} ${l.scripts.filter((s) => s.dur > 15).map((s) => `${s.type}:${s.inv}@${s.src}:${s.fn}:${s.pos}(${s.dur})`).join(' | ')}`);
    for (const l of r.logs.filter((l) => /buscosun|wind|Wind/i.test(l.text)).slice(0, 12)) console.log(`    log ${l.t} ${l.text.slice(0, 160)}`);
  }
}

function attribute(profile, perfNowAtStop, lab) {
  const off = profile.endTime / 1000 - perfNowAtStop;
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n) => `${n.callFrame.functionName || '(anon)'}@${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1}:${n.callFrame.columnNumber + 1}`;
  const times = []; let t = profile.startTime;
  for (const d of profile.timeDeltas) { t += d; times.push(t / 1000 - off); }
  const dt = (profile.endTime - profile.startTime) / 1000 / Math.max(1, profile.samples.length);
  for (const l of (lab.loaf || []).filter((x) => x.dur > 250)) {
    const self = new Map(), incl = new Map();
    for (let k = 0; k < profile.samples.length; k++) {
      if (times[k] < l.start || times[k] > l.start + l.dur) continue;
      const n = byId.get(profile.samples[k]);
      const key = label(n); self.set(key, (self.get(key) ?? 0) + 1);
      const seen = new Set(); let id = n.id;
      while (id != null) { const nn = byId.get(id); const kk = label(nn); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) ?? 0) + 1); } id = parent.get(id); }
    }
    const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([a, c]) => `${Math.round(c * dt)}ms ${a}`);
    console.log(`  ── loaf ${Math.round(l.start)} dur=${Math.round(l.dur)}  self:`); for (const x of top(self, 8)) console.log(`       ${x}`);
    console.log(`     incl (ohne root/program):`); for (const x of top(incl, 22).filter((s) => !/\(root\)|\(program\)|\(idle\)/.test(s))) console.log(`       ${x}`);
  }
}
