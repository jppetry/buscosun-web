/**
 * regenradar-wk-pixeldiff.mjs — Phase RR, gate question 2 (audit/regenradar-datenangleich.md §5): the Wetterkarte
 * WITHOUT profile must render exactly as at HEAD.
 *
 *   node scripts/regenradar-wk-pixeldiff.mjs --head=http://localhost:5213 --cur=http://localhost:5212 --out=<dir> [--only=a,b]
 *
 * Two production builds side by side (HEAD worktree vs working tree), ONE browser, two fresh contexts per scenario,
 * navigated at the same moment and shot after the same wait. Scenarios with `block: true` fail every weather/data
 * request (only same-origin app files and the static OpenFreeMap basemap pass) — the picture is then deterministic:
 * chrome, basemap, dim, DACH mask, loading states. The live scenario lets everything through; both builds read the same
 * slots, wind particles are not involved (precipitation route). Threshold like `dashboard:pixeldiff`: |ΔRGB| > 12 in a
 * channel ⇒ differing pixel; exact-equal pixels are counted too. Output: both shots, a diff image, `report.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { decodePng, encodePng, toRgba } from './lib/png.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const HEAD = args.head ?? 'http://localhost:5213';
const CUR = args.cur ?? 'http://localhost:5212';
const OUT = args.out ?? join(process.cwd(), '.cache', 'rr-pixeldiff');
const THRESH = 12;

const SCENARIOS = [
  { id: 'wk-wind-desktop', path: '/wetterkarte/wind/muenchen', mobile: false, block: true, waitS: 14 },
  { id: 'wk-wind-mobile', path: '/wetterkarte/wind/muenchen', mobile: true, block: true, waitS: 14 },
  { id: 'wk-overview-desktop', path: '/wetterkarte', mobile: false, block: true, waitS: 14 },
  { id: 'wk-overview-mobile', path: '/wetterkarte', mobile: true, block: true, waitS: 14 },
  { id: 'warnungen-desktop', path: '/warnungen/muenchen', mobile: false, block: true, waitS: 14 },
  { id: 'wk-niederschlag-live-desktop', path: '/wetterkarte/niederschlag/muenchen?l=zellbahnen,blitze,schnee,schneegrenze', mobile: false, block: false, waitS: 40 },
  { id: 'wk-niederschlag-live-mobile', path: '/wetterkarte/niederschlag/muenchen?l=zellbahnen,blitze,schnee,schneegrenze', mobile: true, block: false, waitS: 40 },
  // Phase HD gate G3: the Regenradar (profile `radar`) without the switch must render as at HEAD too.
  { id: 'rr-live-desktop', path: '/regenradar', mobile: false, block: false, waitS: 40 },
  { id: 'rr-live-mobile', path: '/regenradar', mobile: true, block: false, waitS: 40 },
].filter((s) => !args.only || args.only.split(',').includes(s.id));

mkdirSync(OUT, { recursive: true });
const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden (OG_CHROME setzen)'); process.exit(2); }
const browser = await openBrowser(chrome, { timeoutMs: 90_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function allowed(url, base) {
  let u; try { u = new URL(url); } catch { return true; }
  if (u.protocol === 'data:' || u.protocol === 'blob:') return true;
  const b = new URL(base);
  if (u.host === b.host) return !/^\/_[a-z_]+\//.test(u.pathname);   // app files yes, data proxies (/_dwd_…, /_meteoalarm …) no
  return u.host === 'tiles.openfreemap.org';
}

async function open(base, sc) {
  const ctx = await browser.newContext({ width: sc.mobile ? 390 : 1440, height: sc.mobile ? 844 : 900, mobile: sc.mobile });
  if (sc.mobile) await ctx.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (sc.block) {
    // The block must hold in EVERY target of the page — dedicated workers (radar/GRIB decode, MapLibre tiles) and the
    // service worker fetch on their own; a page-only block let data through there (first run: 5–69 % "differences"
    // that were arrival timing, not code). Children start paused until their Fetch interception is on.
    const sessions = new Set([ctx.sessionId]);
    browser.on((msg) => {
      if (msg.method === 'Target.attachedToTarget' && sessions.has(msg.sessionId)) {
        const sid = msg.params.sessionId;
        sessions.add(sid);
        void (async () => {
          await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid).catch(() => {});
          await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sid).catch(() => {});
          await browser.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
        })();
        return;
      }
      if (msg.method !== 'Fetch.requestPaused' || !sessions.has(msg.sessionId)) return;
      const { requestId, request } = msg.params;
      if (allowed(request.url, base)) void browser.send('Fetch.continueRequest', { requestId }, msg.sessionId).catch(() => {});
      else void browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, msg.sessionId).catch(() => {});
    });
    await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await ctx.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  }
  return ctx;
}

function diff(a, b) {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const out = new Uint8Array(w * h * 4);
  let differ = 0, exact = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ia = (y * a.width + x) * 4, ib = (y * b.width + x) * 4, io = (y * w + x) * 4;
    const d = Math.max(Math.abs(a.data[ia] - b.data[ib]), Math.abs(a.data[ia + 1] - b.data[ib + 1]), Math.abs(a.data[ia + 2] - b.data[ib + 2]));
    if (d === 0) exact++;
    if (d > THRESH) { differ++; out[io] = 255; out[io + 1] = 0; out[io + 2] = 0; out[io + 3] = 255; }
    else { const g = (a.data[ia] + a.data[ia + 1] + a.data[ia + 2]) / 3 * 0.35; out[io] = g; out[io + 1] = g; out[io + 2] = g; out[io + 3] = 255; }
  }
  return { w, h, differ, exact, total: w * h, sizeMatch: a.width === b.width && a.height === b.height, png: encodePng(w, h, out, 4) };
}

const report = { at: new Date().toISOString(), head: HEAD, cur: CUR, threshold: THRESH, scenarios: [] };
for (const sc of SCENARIOS) {
  const [ca, cb] = await Promise.all([open(HEAD, sc), open(CUR, sc)]);
  await Promise.all([ca.send('Page.navigate', { url: HEAD + sc.path }), cb.send('Page.navigate', { url: CUR + sc.path })]);
  await sleep(sc.waitS * 1000);
  const [sa, sb] = await Promise.all([ca.send('Page.captureScreenshot', { format: 'png' }), cb.send('Page.captureScreenshot', { format: 'png' })]);
  const pa = Buffer.from(sa.data, 'base64'), pb = Buffer.from(sb.data, 'base64');
  writeFileSync(join(OUT, `${sc.id}.head.png`), pa);
  writeFileSync(join(OUT, `${sc.id}.cur.png`), pb);
  const da = decodePng(pa), db = decodePng(pb);
  const r = diff({ width: da.width, height: da.height, data: toRgba(da) }, { width: db.width, height: db.height, data: toRgba(db) });
  writeFileSync(join(OUT, `${sc.id}.diff.png`), r.png);
  const row = { id: sc.id, path: sc.path, mobile: sc.mobile, block: sc.block, waitS: sc.waitS, size: `${r.w}×${r.h}`, sizeMatch: r.sizeMatch,
    differPct: +(100 * r.differ / r.total).toFixed(4), differPx: r.differ, exactPct: +(100 * r.exact / r.total).toFixed(4) };
  report.scenarios.push(row);
  console.log(`${sc.id.padEnd(30)} ${row.size.padEnd(10)} abweichend ${String(row.differPx).padStart(7)} px (${row.differPct} %) · exakt gleich ${row.exactPct} %`);
  await Promise.all([ca.close(), cb.close()]);
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
// `browser.close()` hung once after all shots (first run) — the report is written, so do not wait on it forever.
await Promise.race([browser.close(), sleep(5000)]);
process.exit(0);
