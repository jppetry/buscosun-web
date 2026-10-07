/**
 * sea-ui-diff.mjs — Phase SW (audit/seewetter.md §9): the Seewetter page against its design references.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-ui-diff.mjs \
 *     --base=http://127.0.0.1:4317 --got=<dir with desktop-default.png, mobile-default.png> --out=<dir>
 *
 * 1. Renders `reference/seewetter-desktop.dc.html` (1440 × 900) and `-mobile.dc.html` (390 × 844) through
 *    `reference/support.js` in headless Chromium (file://, DPR 1) — the same runtime as the other *.dc.html references.
 * 2. Compares them with the captures of `verify:sea-ui --shots` (desktop DPR 1; mobile DPR 3, scaled down 3:1 here)
 *    pixel by pixel (|ΔRGB| > 12 in one channel ⇒ different, threshold of the dashboard phase) — overall and per module
 *    rectangle of the design (rail, topbar, dock, map, band, readout; mobile: pill, share, chips, map, sheet).
 *
 * The map is a hand-drawn SVG in the reference and a real MapLibre map here, values are sample data there and the frozen
 * slot here: those modules differ by construction. The report is the evidence for the per-module deviations in §9.4.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openBrowser, findHeadlessChrome } from '../lib/cdpBrowser.mjs';
import { decodePng, encodePng, toRgba } from '../lib/png.mjs';

/** PNG bytes → { width, height, data: RGBA }. */
const rgba = (buf) => { const d = decodePng(buf); return { width: d.width, height: d.height, data: toRgba(d) }; };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const GOT = args.got;
const OUT = args.out ?? join(ROOT, 'audit', 'autobahnwetter', 'ui');
const THRESH = 12;
if (!GOT) { console.error('--got=<Ordner mit den Aufnahmen aus verify:sea-ui --shots> fehlt'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 90_000 });
async function renderRef(file, width, height) {
  const ctx = await browser.newContext({ width, height });
  await ctx.send('Page.navigate', { url: pathToFileURL(join(ROOT, 'reference', file)).href });
  await new Promise((r) => setTimeout(r, 4000));
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
// Desktop: module rectangles of the design (CSS px).
{
  const refBuf = await renderRef('seewetter-desktop.dc.html', 1440, 900);
  writeFileSync(join(OUT, 'ref-desktop-1440.png'), refBuf);
  const ref = rgba(refBuf);
  const got = rgba(readFileSync(join(GOT, 'desktop-default.png')));
  const boxes = { rail: [0, 0, 62, 900], topbar: [62, 0, 1378, 60], dock: [62, 60, 250, 840], map: [312, 60, 728, 630], band: [326, 690, 700, 198], readout: [1040, 60, 400, 840] };
  const r = compare(ref, got, boxes);
  writeFileSync(join(OUT, 'diff-desktop-1440.png'), encodePng(r.w, r.h, r.img, 4));
  report.desktop = { pct: Number(r.pct.toFixed(1)), modules: r.per };
}
// Mobile: capture is DPR 3, the reference DPR 1.
{
  const refBuf = await renderRef('seewetter-mobile.dc.html', 390, 844);
  writeFileSync(join(OUT, 'ref-mobile-390.png'), refBuf);
  const ref = rgba(refBuf);
  const raw = rgba(readFileSync(join(GOT, 'mobile-default.png')));
  const got = raw.width >= 390 * 3 ? downscale(raw, 3) : raw;
  const boxes = { pill: [12, 12, 314, 52], share: [334, 12, 44, 44], chips: [12, 74, 300, 44], map: [0, 120, 390, 250], sheet: [0, 370, 390, 474] };
  const r = compare(ref, got, boxes);
  writeFileSync(join(OUT, 'diff-mobile-390.png'), encodePng(r.w, r.h, r.img, 4));
  report.mobile = { pct: Number(r.pct.toFixed(1)), modules: r.per };
}
await browser.close();
writeFileSync(join(OUT, 'diff-report.json'), JSON.stringify({ threshold: THRESH, ...report }, null, 1) + '\n');
console.log(JSON.stringify(report, null, 1));
