/**
 * glacier-ui-diff.mjs — Phase GL (audit/gletscher.md §GL-1): the glacier situation page against its design references.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/glacier-ui-diff.mjs \
 *     --base=http://127.0.0.1:5191 --tree=<v1 dir of a built tree> [--out=<dir>]
 *
 * 1. Renders `reference/gletscher-desktop-lage.dc.html` (1440 × 900) and `gletscher-mobile-lage.dc.html` (390 × 844) through
 *    `reference/support.js` in headless Chromium (file://, DPR 1) — the same runtime as the other *.dc.html references.
 * 2. Opens the app page with the full local data tree (served from a loopback port, `?glbase=`), captures it (desktop DPR 1,
 *    mobile DPR 3 scaled down 3:1) and compares pixel by pixel (|ΔRGB| > 12 in one channel ⇒ different, threshold of the
 *    dashboard phase) — overall and per module rectangle of the design.
 *
 * The map is a hand-drawn SVG in the reference and a real MapLibre map with a live basemap here, the numbers of the reference
 * are partly illustrative: those modules differ by construction. The report is the evidence for the per-module deviations.
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openBrowser, findHeadlessChrome } from '../lib/cdpBrowser.mjs';
import { decodePng, encodePng, toRgba } from '../lib/png.mjs';

const rgba = (buf) => { const d = decodePng(buf); return { width: d.width, height: d.height, data: toRgba(d) }; };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5191';
const OUT = args.out ?? join(ROOT, 'audit', 'gletscher', 'ui');
const TREE = args.tree ? resolve(args.tree) : null;
const THRESH = 12;
if (!TREE || !existsSync(join(TREE, 'index.json'))) { console.error('--tree=<v1-Ordner mit index.json> fehlt'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

// loopback data server (`?glbase=` only accepts loopback hosts)
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).replace(/^\/v1\//, '');
  const file = resolve(TREE, p);
  const head = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
  if (!file.startsWith(TREE) || !existsSync(file)) { res.writeHead(404, head).end(); return; }
  res.writeHead(200, { ...head, 'content-type': 'application/json' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const APP = `${BASE}/gletscher?gl=1&glbase=${encodeURIComponent(`http://127.0.0.1:${PORT}/v1`)}`;

const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 90_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function renderRef(file, width, height) {
  const ctx = await browser.newContext({ width, height });
  await ctx.send('Page.navigate', { url: pathToFileURL(join(ROOT, 'reference', file)).href });
  await sleep(4000);
  const shot = await ctx.send('Page.captureScreenshot', { format: 'png' });
  await ctx.close();
  return Buffer.from(shot.data, 'base64');
}
async function renderApp(width, height, mobile, ready) {
  const ctx = await browser.newContext({ width, height, mobile });
  await ctx.send('Page.navigate', { url: APP });
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) { if (await ctx.evaluate(ready).catch(() => false)) break; await sleep(250); }
  await sleep(6000); // basemap tiles + point layer
  const shot = await ctx.send('Page.captureScreenshot', { format: 'png' });
  await ctx.close();
  return Buffer.from(shot.data, 'base64');
}

/** Box-filter downscale by an integer factor (mobile capture DPR 3 → CSS px). */
function downscale(img, f) {
  const w = Math.floor(img.width / f), h = Math.floor(img.height / f);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0, 0];
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const i = ((y * f + dy) * img.width + (x * f + dx)) * 4;
      for (let c = 0; c < 4; c++) acc[c] += img.data[i + c];
    }
    const o = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = Math.round(acc[c] / (f * f));
  }
  return { width: w, height: h, data: out };
}

function compare(ref, got, boxes) {
  const w = Math.min(ref.width, got.width), h = Math.min(ref.height, got.height);
  const img = new Uint8Array(w * h * 4);
  let bad = 0;
  const per = Object.fromEntries(Object.keys(boxes).map((k) => [k, { n: 0, bad: 0 }]));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ri = (y * ref.width + x) * 4, gi = (y * got.width + x) * 4, o = (y * w + x) * 4;
    const d = Math.max(Math.abs(ref.data[ri] - got.data[gi]), Math.abs(ref.data[ri + 1] - got.data[gi + 1]), Math.abs(ref.data[ri + 2] - got.data[gi + 2]));
    const isBad = d > THRESH;
    if (isBad) bad++;
    img[o] = isBad ? 220 : got.data[gi] * 0.25 + 190; img[o + 1] = isBad ? 40 : got.data[gi + 1] * 0.25 + 190; img[o + 2] = isBad ? 40 : got.data[gi + 2] * 0.25 + 190; img[o + 3] = 255;
    for (const [k, [bx, by, bw, bh]] of Object.entries(boxes)) {
      if (x >= bx && x < bx + bw && y >= by && y < by + bh) { per[k].n++; if (isBad) per[k].bad++; }
    }
  }
  return { pct: (100 * bad) / (w * h), per: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, Number(((100 * v.bad) / Math.max(1, v.n)).toFixed(1))])), img, w, h };
}

const report = {};
{
  const refBuf = await renderRef('gletscher-desktop-lage.dc.html', 1440, 900);
  writeFileSync(join(OUT, 'ref-desktop-1440.png'), refBuf);
  const gotBuf = await renderApp(1440, 900, false, `document.querySelectorAll('.gl-card[data-country]').length === 3 && !!document.querySelector('.gl-rank li')`);
  writeFileSync(join(OUT, 'app-desktop-1440.png'), gotBuf);
  const boxes = (JSON.parse(args.boxesDesktop ?? 'null')) ?? { rail: [0, 0, 62, 900], topbar: [62, 0, 1378, 60], dock: [62, 60, 250, 840], map: [312, 60, 728, 538], chart: [312, 598, 728, 302], readout: [1040, 60, 400, 840] };
  const r = compare(rgba(refBuf), rgba(gotBuf), boxes);
  writeFileSync(join(OUT, 'diff-desktop-1440.png'), encodePng(r.w, r.h, r.img, 4));
  report.desktop = { pct: Number(r.pct.toFixed(1)), modules: r.per };
}
{
  const refBuf = await renderRef('gletscher-mobile-lage.dc.html', 390, 844);
  writeFileSync(join(OUT, 'ref-mobile-390.png'), refBuf);
  const gotRaw = await renderApp(390, 844, true, `document.querySelectorAll('.gl-m-cards .gl-card').length === 3 && !!document.querySelector('.gl-rank li')`);
  writeFileSync(join(OUT, 'app-mobile-390-dpr3.png'), gotRaw);
  const raw = rgba(gotRaw);
  const got = raw.width >= 390 * 3 ? downscale(raw, 3) : raw;
  const boxes = (JSON.parse(args.boxesMobile ?? 'null')) ?? { topbar: [0, 0, 390, 56], map: [0, 56, 390, 330], chips: [0, 386, 390, 65], below: [0, 451, 390, 393] };
  const r = compare(rgba(refBuf), got, boxes);
  writeFileSync(join(OUT, 'diff-mobile-390.png'), encodePng(r.w, r.h, r.img, 4));
  report.mobile = { pct: Number(r.pct.toFixed(1)), modules: r.per };
}
await browser.close();
server.close();
writeFileSync(join(OUT, 'diff-report.json'), JSON.stringify({ threshold: THRESH, ...report }, null, 1) + '\n');
console.log(JSON.stringify(report, null, 1));
