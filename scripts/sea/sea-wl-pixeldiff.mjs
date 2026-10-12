/**
 * sea-wl-pixeldiff.mjs — Phase WL (`audit/wasserstand-bsh.md`, Gate G-WL-3): the Seewetter page with the named
 * fallback `?wl=0` against the page at HEAD.
 *
 *   node scripts/sea/sea-wl-pixeldiff.mjs --head=http://127.0.0.1:5213 --cur=http://127.0.0.1:5212 --out=<dir>
 *
 * Two production builds side by side (HEAD worktree vs working tree), ONE browser, two fresh contexts per
 * scenario, the page clock frozen on both sides. Pattern: `regenradar-wk-pixeldiff.mjs` (Phase HD gate G3).
 *
 * What this can and cannot show: the dock gains a fourth switch and three sentences changed — those are the
 * INTENDED changes of the phase (E-WL-1 keeps the switch reachable), so the honest result is a per-module
 * number, not a claim of zero. The map module is a live MapLibre canvas and differs between two runs by
 * construction; it is measured and named, never counted as a finding.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, findHeadlessChrome } from '../lib/cdpBrowser.mjs';
import { decodePng, toRgba } from '../lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const HEAD = args.head ?? 'http://127.0.0.1:5213';
const CUR = args.cur ?? 'http://127.0.0.1:5212';
const OUT = args.out ?? join(ROOT, 'audit', 'wasserstand-bsh', 'pixel');
const CLOCK = args.clock ?? '2026-10-12T15:30:00Z';
const THRESH = 12;
const SPOT = args.spot ?? 'cuxhaven-duhnen';

/** Modules of the design at 1440 × 900 (rail 62 · topbar 60 · dock 250 · readout 400 · map between). */
const BOXES = {
  ganze: [0, 0, 1440, 900],
  rail: [0, 0, 62, 900],
  topbar: [62, 0, 1378, 60],
  dock: [62, 60, 250, 840],
  karte: [312, 60, 728, 840],
  readout: [1040, 60, 400, 840],
};
const rgba = (b64) => { const d = decodePng(Buffer.from(b64, 'base64')); return { w: d.width, h: d.height, px: toRgba(d) }; };

function diffBox(a, b, [x, y, w, h]) {
  let n = 0, total = 0;
  for (let j = y; j < Math.min(y + h, a.h, b.h); j++) {
    for (let i = x; i < Math.min(x + w, a.w, b.w); i++) {
      const k = (j * a.w + i) * 4, l = (j * b.w + i) * 4;
      total++;
      if (Math.abs(a.px[k] - b.px[l]) > THRESH || Math.abs(a.px[k + 1] - b.px[l + 1]) > THRESH || Math.abs(a.px[k + 2] - b.px[l + 2]) > THRESH) n++;
    }
  }
  return { px: n, of: total, pct: total ? +((n / total) * 100).toFixed(2) : 0 };
}

const chrome = findHeadlessChrome();
const browser = await openBrowser(chrome, { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const clockScript = (iso) => `(() => { const T = ${Date.parse(iso)}; const R = Date; class D extends R { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } globalThis.Date = D; })()`;

async function shoot(base, path, scrollDock = false) {
  const ctx = await browser.newContext({ width: 1440, height: 900 });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: clockScript(CLOCK) });
  await ctx.send('Page.navigate', { url: base + path });
  await new Promise((r) => setTimeout(r, 11_000));
  // The dock scrolls (scrollHeight ≈ 3541 at a client height of 840): the switch block sits below the fold,
  // so the screenshot of the default view says nothing about it. This brings it into view.
  if (scrollDock) {
    await ctx.evaluate(`(() => { const d = document.querySelector('.sw-dock'); if (d) d.scrollTop = d.scrollHeight; return d ? d.scrollTop : -1; })()`);
    await new Promise((r) => setTimeout(r, 900));
  }
  const { data } = await ctx.send('Page.captureScreenshot', { format: 'png' });
  await ctx.close();
  return data;
}

mkdirSync(OUT, { recursive: true });
const scenarios = [
  { name: 'spot', head: `/seewetter/${SPOT}?tab=spot`, cur: `/seewetter/${SPOT}?tab=spot&wl=0` },
  { name: 'quellen', head: `/seewetter/${SPOT}?tab=quellen`, cur: `/seewetter/${SPOT}?tab=quellen&wl=0` },
  // The switch block of the dock, scrolled into view: at HEAD the blocked entry stood there, now the switch.
  { name: 'dock-schalter', head: `/seewetter/${SPOT}?tab=spot`, cur: `/seewetter/${SPOT}?tab=spot&wl=0`, scrollDock: true },
];
const report = { at: new Date().toISOString(), head: HEAD, cur: CUR, clock: CLOCK, threshold: THRESH, spot: SPOT, scenarios: [] };
for (const sc of scenarios) {
  const [a, b] = await Promise.all([shoot(HEAD, sc.head, sc.scrollDock), shoot(CUR, sc.cur, sc.scrollDock)]);
  writeFileSync(join(OUT, `${sc.name}-head.png`), Buffer.from(a, 'base64'));
  writeFileSync(join(OUT, `${sc.name}-wl0.png`), Buffer.from(b, 'base64'));
  const A = rgba(a), B = rgba(b);
  const boxes = Object.fromEntries(Object.entries(BOXES).map(([k, box]) => [k, diffBox(A, B, box)]));
  report.scenarios.push({ ...sc, size: `${A.w}×${A.h}`, boxes });
  console.log(`\n${sc.name}  (HEAD ${sc.head}  ↔  ?wl=0 ${sc.cur})`);
  for (const [k, v] of Object.entries(boxes)) console.log(`  ${k.padEnd(8)} ${String(v.px).padStart(8)} px von ${String(v.of).padStart(8)}  ${v.pct} %`);
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1) + '\n');
console.log(`\nBilder und report.json in ${OUT}`);
await browser.close();
