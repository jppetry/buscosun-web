/**
 * sat-blip-probe.mjs — does the 10 m viewer recover from a short loss of the connection? (phase SL)
 *
 * The dossier warms the picture before the chapter opens (`warmCogView`). This probe opens the chapter while those
 * tiles are still in flight, takes the network away for `--off` ms (CDP offline), gives it back and watches for
 * `--watch` ms. It reports whether the viewer settles (status line without "schärfere Ebene lädt", nothing in
 * flight) and how long the image bucket has been silent at the end: a viewer that still says "lädt" while no
 * request has started for longer than the longest retry pause (30 s) will never finish on its own.
 *
 *   node audit/brandradar-satellitenbilder/sat-blip-probe.mjs [--base http://127.0.0.1:5199] [--targets glacier,fire] [--off 3000] [--watch 90000]
 */
import { findHeadlessChrome, openBrowser } from '../../scripts/lib/cdpBrowser.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const BASE = arg('base', 'http://127.0.0.1:5199');
const OFF_MS = Number(arg('off', '3000'));
const WATCH_MS = Number(arg('watch', '90000'));
const QUERY = arg('query', '');
const TARGETS = {
  fire: { path: '/waldbrand/brand/40.34891_-4.74644_202607221411', open: `[...document.querySelectorAll('.br-ds button')].find((b) => b.textContent.includes('Satellit'))` },
  glacier: { path: '/gletscher?sel=ch-grosser-aletschgletscher&dossier=1', open: `[...document.querySelectorAll('.gl-ds-step')].find((b) => b.textContent.includes('Satellit'))` },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withQuery = (path) => (QUERY ? `${path}${path.includes('?') ? '&' : '?'}${QUERY}` : path);

// `--chrome <path>`: a full Chromium with a real GPU (see `sat-load-probe.mjs`).
const GPU_CHROME = arg('chrome', null);
const browser = await openBrowser(GPU_CHROME ?? findHeadlessChrome(), { timeoutMs: 120_000, ...(GPU_CHROME ? { gpu: true, extraArgs: ['--headless=new'] } : {}) });
try {
  for (const key of arg('targets', 'glacier,fire').split(',')) {
    const t = TARGETS[key];
    const ctx = await browser.newContext({ width: 1440, height: 900 });
    try {
      await ctx.send('Page.navigate', { url: BASE + withQuery(t.path) });
      const bucket = () => ctx.requests().filter((r) => r.url.includes('sentinel-cogs'));
      const tiles = () => bucket().filter((r) => r.range && !r.range.startsWith('bytes=0-'));
      const t0 = Date.now();
      for (;;) {
        if (await ctx.evaluate(`!!(${t.open})`).catch(() => false)) break;
        if (Date.now() - t0 > 90_000) throw new Error('Kapitel-Knopf nicht gefunden');
        await sleep(300);
      }
      // Wait for the warm start: the first tile request in flight.
      const tw = Date.now();
      while (tiles().filter((r) => r.t1 == null).length === 0 && Date.now() - tw < 30_000) await sleep(100);
      const warmInFlight = tiles().filter((r) => r.t1 == null).length;
      await ctx.evaluate(`(${t.open}).click()`);
      const ts = Date.now();
      while (!(await ctx.evaluate(`!!document.querySelector('.br-cog-status')`).catch(() => false)) && Date.now() - ts < 30_000) await sleep(100);
      await sleep(300); // one draw has seen the tiles in flight
      const inFlightAtCut = tiles().filter((r) => r.t1 == null).length;
      await ctx.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await sleep(OFF_MS);
      await ctx.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      const back = Date.now();
      let settledMs = null; let calm = 0; let status = '';
      while (Date.now() - back < WATCH_MS) {
        await sleep(500);
        status = (await ctx.evaluate(`document.querySelector('.br-cog-status')?.textContent ?? ''`).catch(() => '')) || status;
        const ready = status && !status.includes('lädt') && bucket().filter((r) => r.t1 == null).length === 0;
        calm = ready ? calm + 1 : 0;
        if (calm >= 3) { settledMs = Date.now() - back - 1000; break; }
      }
      const all = bucket();
      const wall = (r) => r.wall0 * 1000;
      const lastStart = Math.max(...all.map(wall));
      const startedAfter = all.filter((r) => wall(r) > back).length;
      console.log(`${key}: Warmstart-Kacheln unterwegs beim Öffnen ${warmInFlight}, beim Trennen ${inFlightAtCut} · ${OFF_MS} ms ohne Netz · ` +
        `${settledMs == null ? `NICHT fertig nach ${WATCH_MS / 1000} s` : `fertig nach ${settledMs} ms`} · Anfragen nach dem Wiederkommen ${startedAfter} · ` +
        `letzte Anfrage vor ${Math.round((Date.now() - lastStart) / 1000)} s · abgebrochen/fehlgeschlagen ${all.filter((r) => r.failed).length}\n  Status: ${status.replace(/Copernicus.*$/, '').trim()}`);
    } catch (e) {
      console.log(`${key}: FEHLER ${e?.message ?? e}`);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(0);
