// Mess-Lab Niederschlag-Layer DE/AT/CH (03.11.): Ableger von audit/niederschlag-ladezeit/lab.mjs.
// Eigener Chromium (echte GPU), frischer Browser-Kontext je Lauf, kalter Cache. Hält ALLE [buscosun]-Konsolenzeilen,
// Warnungen/Fehler, die Radar-Abrufe und den Text der Layer-Sublabels (Status „⚠ Fehler"/„lädt…"/Stempel) fest.
//   node lab2.mjs <runs> <gapSec> <out.json> <url1> [url2 …]   (Läufe rotieren über die URLs)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [runsArg = '3', gapArg = '0', outJson = '', ...URLS] = process.argv.slice(2);
const RUNS = +runsArg, GAP = +gapArg * 1000, WAIT = +(process.env.LAB_WAIT ?? 30000);
const MOBILE = process.env.LAB_MOBILE === '1';
const CHROME = join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe');
const profile = mkdtempSync(join(tmpdir(), 'lab2-'));
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

async function oneRun(i, URL) {
  const { browserContextId } = await send('Target.createBrowserContext', {});
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId, newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable', { maxTotalBufferSize: 200 * 1024 * 1024 });
  if (MOBILE) {
    await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await s('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (process.env.LAB_4G === '1') await s('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8 });
    if (process.env.LAB_CPU) await s('Emulation.setCPUThrottlingRate', { rate: +process.env.LAB_CPU });
  } else {
    await s('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  }
  const logs = []; const reqs = new Map();
  let navWall = 0, navTs = 0;
  const unsub = (() => { const fn = (m) => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Runtime.consoleAPICalled') logs.push({ t: Math.round(p.timestamp - navWall), type: p.type, text: p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400) });
    else if (m.method === 'Runtime.exceptionThrown') logs.push({ t: Math.round(p.timestamp - navWall), type: 'exception', text: (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').slice(0, 400) });
    else if (m.method === 'Network.requestWillBeSent') { if (!navTs) { navTs = p.timestamp; } reqs.set(p.requestId, { url: p.request.url, t0: p.timestamp, prio: p.request.initialPriority }); }
    else if (m.method === 'Network.responseReceived') { const r = reqs.get(p.requestId); if (r) { r.status = p.response.status; r.xc = p.response.headers['x-cache'] ?? p.response.headers['X-Cache'] ?? null; r.ttfb = p.response.timing ? Math.round(p.response.timing.receiveHeadersEnd) : null; } }
    else if (m.method === 'Network.loadingFinished') { const r = reqs.get(p.requestId); if (r) { r.bytes = p.encodedDataLength; r.t1 = p.timestamp; } }
    else if (m.method === 'Network.loadingFailed') { const r = reqs.get(p.requestId); if (r) { r.failed = p.errorText; r.t1 = p.timestamp; } }
  }; listeners.add(fn); return () => listeners.delete(fn); })();
  const nowMs = Date.now();
  const stepMs = 300000; const newest = Math.floor((nowMs - 3.3 * 60000) / stepMs) * stepMs;
  const ageS = Math.round((nowMs - newest) / 1000);
  reqs.clear(); logs.length = 0; navTs = 0; navWall = Date.now();
  await s('Page.navigate', { url: URL });
  await wait(WAIT);
  // Sublabel-Texte der Layer-Zeilen (Dock) und der Statuszeile — zeigt „⚠ Fehler"/„lädt…"/Stempel
  const dom = await s('Runtime.evaluate', { expression: `JSON.stringify({
    subs: [...document.querySelectorAll('.mdk-layer-sub, .mdk-m-layer .mdk-layer-sub')].map(e => e.textContent).slice(0, 12),
    status: [...document.querySelectorAll('[class*="status"], .mdk-ro-src, .mdk-source')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 6),
    title: document.title,
  })`, returnByValue: true }).then((r) => JSON.parse(r.result.value ?? '{}')).catch((e) => ({ err: String(e) }));
  unsub();
  await send('Target.closeTarget', { targetId }).catch(() => {});
  await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  const rel = (ts) => Math.round((ts - navTs) * 1000);
  const net = [...reqs.values()].map((r) => ({ url: r.url.replace(/^https?:\/\/[^/]+/, (h) => h.includes('jsdelivr') ? 'CDN' : h.includes('raw.githubusercontent') ? 'RAW' : h.includes('buscosun.com') ? '' : h), st: r.status, xc: r.xc, kb: r.bytes != null ? Math.round(r.bytes / 1024) : null, t0: rel(r.t0), t1: r.t1 ? rel(r.t1) : null, ttfb: r.ttfb, prio: r.prio, failed: r.failed }));
  return { i, url: URL, at: new Date(nowMs).toISOString(), slotAgeS: ageS, logs, net, dom };
}

const results = [];
for (let i = 0; i < RUNS; i++) {
  const t = Date.now();
  const URL = URLS[i % URLS.length];
  try { const r = await oneRun(i, URL); results.push(r); summarize(r); } catch (e) { console.log('run', i, 'failed', e.message); }
  if (outJson) writeFileSync(outJson, JSON.stringify(results, null, 1));
  const rest = GAP - (Date.now() - t); if (i < RUNS - 1 && rest > 0) await wait(rest);
}
cleanup(); process.exit(0);

function summarize(r) {
  const pick = (re) => r.logs.find((l) => re.test(l.text));
  const rv = pick(/Niederschlag-Layer/), inca = pick(/GeoSphere INCA →|GeoSphere INCA nicht/), rzc = pick(/MeteoSwiss rzc →|MeteoSwiss rzc nicht/), chnc = pick(/CH Hochrechnung/), at5 = pick(/AT INCA · 5 min/);
  const radar = r.net.filter((n) => /radar|composite_rv|inca|rzc|_dwd_opendata|geosphere|geo\.admin/i.test(n.url));
  const kb = radar.reduce((a, n) => a + (n.kb ?? 0), 0);
  const bad = r.logs.filter((l) => l.type === 'error' || l.type === 'warning' || l.type === 'exception');
  const ms = (l) => (l ? `${l.t}` : '—');
  console.log(`#${r.i} ${r.at} ${r.url.replace(/^https?:\/\/[^/]+/, '')} slotAge=${r.slotAgeS}s  RV@${ms(rv)} INCA@${ms(inca)} rzc@${ms(rzc)} CHnc@${ms(chnc)} AT5m@${ms(at5)} radarKB=${kb} reqs=${radar.length} warn/err=${bad.length}`);
  console.log(`    subs: ${JSON.stringify(r.dom?.subs ?? r.dom)}`);
  for (const l of r.logs.filter((l) => /\[buscosun\]/.test(l.text))) console.log(`    log ${String(l.t).padStart(6)} ${l.type} ${l.text.slice(0, 220)}`);
  for (const l of bad.slice(0, 8)) console.log(`    ${l.type.toUpperCase()} ${String(l.t).padStart(6)} ${l.text.slice(0, 220)}`);
  const slow = radar.filter((n) => n.failed || (n.st && n.st >= 400) || ((n.t1 ?? 0) - n.t0 > 2500));
  for (const n of slow) console.log(`    net ${String(n.t0).padStart(6)}→${String(n.t1 ?? '…').padStart(6)} ${n.st ?? '-'} ${String(n.kb ?? '').padStart(6)}KB ${n.xc ?? ''} ${n.url.slice(0, 120)} ${n.failed ?? ''}`);
}
