/**
 * sat-load-probe.mjs — loading probe of the 10 m satellite viewer (`src/fire/FireCogViewer.tsx`), phase SL.
 *
 * Drives the REAL pages (Brandradar dossier chapter "Satellit", Gletscher dossier level "Satellit") in a headless
 * Chromium over CDP and runs the same step list on each: open → enlarge → zoom in twice → pan twice → zoom out
 * twice → a rapid zoom/pan burst. After every step it waits until the viewer has SETTLED (status line without
 * "schärfere Ebene lädt", no request to the image bucket in flight, twice in a row) or the step deadline passes.
 *
 * Per step it reports: time to settle (null = never), requests to the image bucket, distinct byte ranges among
 * them, the highest repeat count of one range, bytes on the wire, failed requests, and the status line at the end.
 * A range asked more than once inside one step with a view that stands still is a reload loop, not a cache miss.
 *
 * Usage (dev server or preview must run):
 *   node audit/brandradar-satellitenbilder/sat-load-probe.mjs --base http://127.0.0.1:5199 --out <file.json>
 *        [--targets fire,glacier] [--devices desktop,desktop-l,mobile] [--nets none,fast3g] [--shots <dir>] [--label vorher]
 *        [--query satload=0] [--chrome <path to a full chrome.exe>]
 *
 * `--chrome` starts a full Chromium with a real GPU (`--headless=new`). Without it the probe runs in
 * chrome-headless-shell WITHOUT a GPU — there the map behind the Brandradar dossier (raster basemap, repainted every
 * frame) holds the main thread for seconds (`bindTexture`, measured 17 of 26 s), the answers of the image bucket are
 * handled late and run into the viewer's 10 s deadline. That is the probe's machine, not the viewer: measure the
 * Brandradar page with `--chrome`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findHeadlessChrome, NET_PROFILES, openBrowser } from '../../scripts/lib/cdpBrowser.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const BASE = arg('base', 'http://127.0.0.1:5199');
const OUT = arg('out', null);
const SHOTS = arg('shots', null);
const LABEL = arg('label', 'lauf');
/** Extra query for the page, e.g. `satload=0` (the loading as before phase SL). */
const QUERY = arg('query', '');

/** Where the viewer is reached. `fire` is a large mapped fire (start view fitted to its area), `fire-s` a small one. */
const TARGETS = {
  fire: { path: arg('fire', '/waldbrand/brand/40.34891_-4.74644_202607221411'), open: `[...document.querySelectorAll('.br-ds button')].find((b) => b.textContent.includes('Satellit'))` },
  'fire-s': { path: arg('fire-s', ''), open: `[...document.querySelectorAll('.br-ds button')].find((b) => b.textContent.includes('Satellit'))` },
  glacier: { path: arg('glacier', '/gletscher?sel=ch-grosser-aletschgletscher&dossier=1'), open: `[...document.querySelectorAll('.gl-ds-step')].find((b) => b.textContent.includes('Satellit'))` },
};
const DEVICES = {
  desktop: { width: 1440, height: 900, mobile: false },
  'desktop-l': { width: 1920, height: 1080, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
};
const BUCKET = 'sentinel-cogs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATUS_JS = `(() => {
  const box = document.querySelector('.br-cog-full, .br-cog-inline');
  const st = document.querySelector('.br-cog-status');
  const wait = document.querySelector('.br-cog-full .br-sat-wait, .br-cog-inline .br-sat-wait');
  return { box: box ? [box.clientWidth, box.clientHeight] : null, full: !!document.querySelector('.br-cog-full'),
    status: st ? st.textContent : null, wait: wait ? wait.textContent : null };
})()`;

async function run(browser, targetKey, deviceKey, netKey) {
  const target = TARGETS[targetKey];
  const dev = DEVICES[deviceKey];
  const slow = netKey !== 'none';
  const stepMs = slow ? 75_000 : 30_000;
  // The link profile is set once the page stands (below): the probe measures the viewer, not the dev server's module graph.
  const ctx = await browser.newContext({ width: dev.width, height: dev.height, mobile: dev.mobile });
  const out = { target: targetKey, device: deviceKey, net: netKey, dpr: null, steps: [] };
  try {
    if (dev.mobile) await ctx.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    await ctx.send('Page.navigate', { url: BASE + target.path + (QUERY ? (target.path.includes('?') ? '&' : '?') + QUERY : '') });
    out.dpr = null;
    // The dossier button that opens the satellite chapter.
    const t0 = Date.now();
    for (;;) {
      const ok = await ctx.evaluate(`!!(${target.open})`).catch(() => false);
      if (ok) break;
      if (Date.now() - t0 > 90_000) throw new Error('Kapitel-Knopf nicht gefunden');
      await sleep(300);
    }
    out.dpr = await ctx.evaluate('window.devicePixelRatio');
    if (NET_PROFILES[netKey]) await ctx.send('Network.emulateNetworkConditions', NET_PROFILES[netKey]);

    const bucketReqs = () => ctx.requests().filter((r) => r.url.includes(BUCKET));
    /** One step: `act()` then wait for the settled viewer; numbers are of the requests STARTED inside the step. */
    const step = async (name, act) => {
      const before = new Set(bucketReqs());
      const started = Date.now();
      await act();
      let settledAt = null; let calm = 0; let last = null;
      while (Date.now() - started < stepMs) {
        await sleep(500);
        last = await ctx.evaluate(STATUS_JS).catch(() => null);
        const inFlight = bucketReqs().filter((r) => r.t1 == null).length;
        const ready = last && last.status && !last.status.includes('lädt') && inFlight === 0;
        calm = ready ? calm + 1 : 0;
        if (calm >= 3) { settledAt = Date.now() - started - 1000; break; }
      }
      const mine = bucketReqs().filter((r) => !before.has(r));
      const byRange = new Map();
      for (const r of mine) { const k = `${r.url.split('/').slice(-2).join('/')}|${r.range}`; byRange.set(k, (byRange.get(k) ?? 0) + 1); }
      const rec = {
        step: name, settledMs: settledAt, requests: mine.length, distinctRanges: byRange.size,
        maxRepeat: Math.max(0, ...byRange.values()), mb: +(mine.reduce((s, r) => s + (r.bytes ?? 0), 0) / 1048576).toFixed(2),
        failed: mine.filter((r) => r.failed).length, inFlightAtEnd: mine.filter((r) => r.t1 == null).length,
        box: last?.box ?? null, status: (last?.status ?? last?.wait ?? '').replace(/Copernicus.*$/, '').trim(),
      };
      out.steps.push(rec);
      console.log(`  ${name.padEnd(9)} ${rec.settledMs == null ? 'NIE'.padStart(6) : String(rec.settledMs).padStart(6)} ms  ${String(rec.requests).padStart(4)} Anfr.  ${String(rec.distinctRanges).padStart(4)} Bereiche  max×${rec.maxRepeat}  ${String(rec.mb).padStart(6)} MB  Fehler ${rec.failed}  | ${rec.status}`);
      if (SHOTS && ['open', 'zoomIn1', 'zoomOut1'].includes(name)) {
        mkdirSync(SHOTS, { recursive: true });
        const shot = await ctx.send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
        writeFileSync(join(SHOTS, `${LABEL}-${targetKey}-${deviceKey}-${netKey}-${name}.jpg`), Buffer.from(shot.data, 'base64'));
      }
      return rec;
    };

    const cx = dev.width / 2, cy = dev.height / 2;
    const wheel = (deltaY) => ctx.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY });
    /** Zoom by a factor on the scale (0.64 = closer): the wheel on desktop, a two-finger pinch on mobile. */
    const zoom = async (factor) => {
      if (!dev.mobile) return wheel(100 * Math.log(factor) / Math.log(1.25));
      const d0 = 90, d1 = d0 / factor;
      const pts = (d) => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
      await ctx.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) });
      for (let i = 1; i <= 6; i++) { await ctx.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + ((d1 - d0) * i) / 6) }); await sleep(16); }
      await ctx.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const pan = async (dx, dy) => {
      if (dev.mobile) {
        await ctx.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
        for (let i = 1; i <= 6; i++) { await ctx.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + (dx * i) / 6, y: cy + (dy * i) / 6, id: 1 }] }); await sleep(16); }
        await ctx.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        return;
      }
      await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 6; i++) { await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + (dx * i) / 6, y: cy + (dy * i) / 6, button: 'left', buttons: 1 }); await sleep(16); }
      await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + dx, y: cy + dy, button: 'left', buttons: 0, clickCount: 1 });
    };

    // The slow link runs the short list (a healthy 10 m view of four tiles is 8 MB = 40 s there): the same steps, fewer of them.
    await step('open', () => ctx.evaluate(`(${target.open}).click()`));
    // Without a viewer (scene search or file header failed) there is nothing to enlarge: the step is recorded as it stands.
    await step('full', () => ctx.evaluate(`document.querySelector('.br-cog-ctrl button[aria-label^="Vergr"]')?.click()`));
    await step('zoomIn1', () => zoom(0.64));
    if (!slow) await step('zoomIn2', () => zoom(0.64));
    await step('pan1', () => pan(-0.4 * dev.width, -0.3 * dev.height));
    if (!slow) await step('pan2', () => pan(0.6 * dev.width, 0));
    await step('zoomOut1', () => zoom(1.95));
    if (!slow) await step('zoomOut2', () => zoom(1.95));
    if (!slow) await step('burst', async () => { for (const f of [0.64, 0.64, 0.64]) { await zoom(f); await sleep(250); } await pan(-0.5 * dev.width, 0.2 * dev.height); await sleep(250); await zoom(1.56); });
  } catch (e) {
    out.error = String(e?.message ?? e);
    out.page = await ctx.evaluate('document.body.innerText.slice(0, 300)').catch(() => null);
    console.log(`  FEHLER: ${out.error}`);
  } finally {
    await ctx.close();
  }
  return out;
}

const GPU_CHROME = arg('chrome', null);
const chrome = GPU_CHROME ?? findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden'); process.exit(2); }
const results = [];
for (const t of arg('targets', 'fire,glacier').split(',')) {
  for (const d of arg('devices', 'desktop,mobile').split(',')) {
    for (const n of arg('nets', 'none,fast3g').split(',')) {
      if (!TARGETS[t]?.path) continue;
      console.log(`
${t} · ${d} · ${n}${QUERY ? ` · ${QUERY}` : ''}`);
      // A browser of its own per run: a second context after a long first run did not get the page up in 90 s.
      const browser = await openBrowser(chrome, { timeoutMs: 120_000, ...(GPU_CHROME ? { gpu: true, extraArgs: ['--headless=new'] } : {}) });
      try { results.push(await run(browser, t, d, n)); } finally { await browser.close(); }
    }
  }
}
if (OUT) writeFileSync(OUT, JSON.stringify({ label: LABEL, query: QUERY, gpu: !!GPU_CHROME, at: new Date().toISOString(), base: BASE, results }, null, 1));
process.exit(0);
