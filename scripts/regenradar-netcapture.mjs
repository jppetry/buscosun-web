/**
 * regenradar-netcapture.mjs — network capture of a cold Regenradar load (Phase RR, audit/regenradar-datenangleich.md §2).
 *
 *   node scripts/regenradar-netcapture.mjs --base=http://127.0.0.1:5211 [--path=/regenradar/muenchen] [--wait=30]
 *        [--layers=precip,cells,lightning,snow,snowline] [--profile=desktop|mobile] [--out=<file.json>] [--label=<text>]
 *        [--shot=<file.png>]
 *
 * One fresh browser context (empty cache, empty IndexedDB, empty localStorage = the cold user). `--layers` seeds the
 * deck's persisted layer set (`buscosun.radar.lastview.v1`) before the app boots, so a capture can include the layers
 * that are off by default. Every request is listed with its origin class (buscosun-data / jsDelivr other / raw GitHub /
 * same origin incl. the Netlify/Vite proxies / foreign origin) — the data claim of gate GRR is read off this list.
 * Console messages (log/warn/error) and uncaught exceptions are collected as well.
 */
import { writeFileSync } from 'node:fs';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5211';
const PATH = args.path ?? '/regenradar/muenchen';
const WAIT_S = Number(args.wait ?? 30);
const LAYERS = args.layers ? String(args.layers).split(',').filter(Boolean) : null;
const PROFILE = args.profile === 'mobile'
  ? { width: 390, height: 844, mobile: true }
  : { width: 1440, height: 900, mobile: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Origin class of one request URL — the vocabulary of audit §2. */
export function originClass(url, base) {
  let u;
  try { u = new URL(url); } catch { return 'other'; }
  if (u.protocol === 'data:' || u.protocol === 'blob:') return 'inline';
  const b = new URL(base);
  if (u.host === b.host) {
    if (/^\/_(dwd_opendata|dwd_grib|dwd_wind|meteoalarm|gfs|cscs|mf|ecmwf|firms)\//.test(u.pathname)) return `proxy ${u.pathname.split('/')[1]}`;
    return 'same-origin';
  }
  if (u.host === 'cdn.jsdelivr.net') return /\/gh\/jppetry\/buscosun-data@/.test(u.pathname) ? 'buscosun-data (jsDelivr)' : 'jsDelivr (other)';
  if (u.host === 'raw.githubusercontent.com') return /\/jppetry\/buscosun-data\//.test(u.pathname) ? 'buscosun-data (raw)' : 'raw GitHub (other)';
  return `foreign ${u.host}`;
}

async function main() {
  const browser = await openBrowser(findHeadlessChrome());
  const ctx = await browser.newContext({ ...PROFILE });
  const consoleMsgs = [];
  browser.on((msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
      consoleMsgs.push({ type: msg.params.type, text: text.slice(0, 400) });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleMsgs.push({ type: 'exception', text: String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? '').slice(0, 400) });
    } else if (msg.method === 'Log.entryAdded') {
      consoleMsgs.push({ type: `log:${msg.params.entry.level}`, text: `${msg.params.entry.text} ${msg.params.entry.url ?? ''}`.slice(0, 400) });
    }
  });
  await ctx.send('Log.enable', {});
  // Workers fetch too (MapLibre vector tiles, radar decode workers): auto-attach them and record their requests.
  const workerReqs = new Map();
  // The app's service worker proxies page fetches — its requests would double-count, so only dedicated workers count.
  const workerSessions = new Set();
  const attachedTypes = {};
  browser.on((msg) => {
    if (msg.method === 'Target.attachedToTarget' && msg.sessionId === ctx.sessionId) {
      const sid = msg.params.sessionId;
      const type = msg.params.targetInfo?.type ?? '?';
      attachedTypes[type] = (attachedTypes[type] ?? 0) + 1;
      if (type === 'worker') workerSessions.add(sid);
      void browser.send('Network.enable', {}, sid).catch(() => {});
      void browser.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
      return;
    }
    if (!workerSessions.has(msg.sessionId)) return;
    const p = msg.params;
    if (msg.method === 'Network.requestWillBeSent') workerReqs.set(p.requestId, { url: p.request.url, worker: true });
    else if (msg.method === 'Network.responseReceived') { const r = workerReqs.get(p.requestId); if (r) r.status = p.response.status; }
    else if (msg.method === 'Network.loadingFinished') { const r = workerReqs.get(p.requestId); if (r) r.bytes = p.encodedDataLength; }
    else if (msg.method === 'Network.loadingFailed') { const r = workerReqs.get(p.requestId); if (r) r.failed = p.errorText; }
  });
  await ctx.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  if (LAYERS) {
    const seed = JSON.stringify({ layers: LAYERS, palette: 'classic', basemap: 'streets', opacity: 0.85 });
    await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('buscosun.radar.lastview.v1', ${JSON.stringify(seed)}); } catch {}` });
  }
  // `--frames`: rAF gap recorder from the first script on (long tasks are not observable in headless-shell, CLAUDE.md —
  // the largest gap between two animation frames is the stand-in, as in RK-1). `--play`: press the deck's play button
  // after `--playAfter` s (default 15) so the gaps cover playback with composite + cells + snow.
  if (args.frames) {
    await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const g = { max: 0, over50: 0, over100: 0, over200: 0, n: 0, maxAt: 0 }; let last = 0;
      window.__rrGaps = g;
      const tick = (t) => { if (last) { const d = t - last; g.n++; if (d > g.max) { g.max = d; g.maxAt = t; } if (d > 50) g.over50++; if (d > 100) g.over100++; if (d > 200) g.over200++; } last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    })();` });
  }
  // `--jsprofile`: CPU sampling profile of the page's main thread over the whole wait — self time per function, to tell
  // a JavaScript block from a software-WebGL stall when a frame gap shows up.
  if (args.jsprofile) {
    await ctx.send('Profiler.enable', {});
    await ctx.send('Profiler.setSamplingInterval', { interval: 500 });
    await ctx.send('Profiler.start', {});
  }
  const t0 = Date.now();
  await ctx.send('Page.navigate', { url: BASE + PATH });
  if (args.play) {
    const after = Number(args.playAfter ?? 15);
    await sleep(after * 1000);
    const pressed = await ctx.evaluate(`(() => { const b = document.querySelector('.rdr-tl-play, .nc-tl-play, button[aria-label*="Abspielen"], button[title*="Abspielen"]'); if (!b) return 'no-button'; b.click(); return b.getAttribute('aria-label') || b.title || b.className; })()`).catch((e) => `error ${e}`);
    console.log(`# play pressed at ${after} s: ${pressed}`);
    await ctx.evaluate('window.__rrGaps && Object.assign(window.__rrGaps, { max: 0, over50: 0, over100: 0, over200: 0, n: 0 }), true').catch(() => {});
    await sleep(Math.max(0, WAIT_S - after) * 1000);
  } else {
    await sleep(WAIT_S * 1000);
  }
  const gaps = args.frames ? await ctx.evaluate('JSON.stringify(window.__rrGaps || null)').catch(() => 'null') : 'null';
  if (args.frames) console.log(`# frame gaps${args.play ? ' (during playback)' : ''}: ${gaps}`);
  if (args.jsprofile) {
    const { profile } = await ctx.send('Profiler.stop', {});
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const dts = profile.timeDeltas;
    for (let i = 0; i < profile.samples.length; i++) {
      const n = byId.get(profile.samples[i]);
      const cf = n.callFrame;
      const key = `${cf.functionName || '(anonymous)'} ${cf.url ? cf.url.split('/').pop() : ''}:${cf.lineNumber + 1}`;
      self.set(key, (self.get(key) ?? 0) + (dts[i + 1] ?? 0) / 1000);
    }
    const top = [...self.entries()].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 18);
    console.log('# JS self time (ms), top functions:');
    for (const [k, v] of top) console.log(`#   ${v.toFixed(0).padStart(6)}  ${k}`);
    const gc = self.get('(garbage collector) :0') ?? 0;
    console.log(`#   GC ${gc.toFixed(0)} ms · total samples ${profile.samples.length}`);
  }
  // `--shot=<file.png>`: screenshot of the viewport at the end of the wait (gate evidence next to the request list).
  if (args.shot) {
    const { data } = await ctx.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(args.shot, Buffer.from(data, 'base64'));
  }
  const reqs = [...ctx.requests(), ...workerReqs.values()];
  const rows = reqs.map((r) => ({
    cls: originClass(r.url, BASE), url: r.url, status: r.status ?? null, bytes: r.bytes ?? null, ms: r.ms ?? null,
    failed: r.failed ?? null, xCache: r.xCache ?? null, worker: !!r.worker,
  }));
  const byClass = {};
  for (const r of rows) {
    const k = r.cls;
    byClass[k] ??= { n: 0, bytes: 0 };
    byClass[k].n++; byClass[k].bytes += r.bytes ?? 0;
  }
  const out = { attachedTypes, frameGaps: JSON.parse(gaps), label: args.label ?? null, base: BASE, path: PATH, profile: args.profile ?? 'desktop', layers: LAYERS, startedAt: new Date(t0).toISOString(), waitS: WAIT_S, byClass, requests: rows, console: consoleMsgs };
  if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 1));
  // Short human summary on stdout (data rows only — Vite module requests are summarised by count).
  console.log(`# attached: ${JSON.stringify(attachedTypes)}`);
  console.log(`# ${BASE}${PATH} · ${out.profile} · layers=${LAYERS ? LAYERS.join(',') : '(Voreinstellung)'} · ${WAIT_S} s · ${out.startedAt}`);
  for (const [k, v] of Object.entries(byClass).sort()) console.log(`${k.padEnd(34)} ${String(v.n).padStart(4)} Abrufe ${String(Math.round(v.bytes / 1024)).padStart(7)} KiB`);
  console.log('--- Datenabrufe (ohne same-origin) ---');
  for (const r of rows) {
    if (r.cls === 'same-origin' || r.cls === 'inline') continue;
    const u = r.url.length > 170 ? r.url.slice(0, 167) + '…' : r.url;
    console.log(`${r.worker ? 'W ' : '  '}${r.cls.padEnd(28)} ${String(r.status ?? r.failed ?? '—').padEnd(5)} ${String(Math.round((r.bytes ?? 0) / 1024)).padStart(6)} KiB  ${u}`);
  }
  console.log('--- Konsole (warn/error/exception) ---');
  for (const m of consoleMsgs) if (m.type !== 'log' && m.type !== 'info' && m.type !== 'debug') console.log(`${m.type}: ${m.text}`);
  await ctx.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
