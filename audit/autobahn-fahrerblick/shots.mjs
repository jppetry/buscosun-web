/**
 * Phase DV — screenshots of the driver's view (audit/autobahn-fahrerblick.md §6).
 *
 *   1) node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-driver.mjs --dump=<gallery dir>
 *   2) node audit/autobahn-fahrerblick/shots.mjs --gallery=<gallery dir> --out=<png dir> [--reduce=1]
 *
 * The gallery pages hold the REAL component markup (server-rendered by the verifier) with the real roadDeck.css and the
 * self-hosted fonts. Desktop pages are shot at 1440 × 900 (DPR 1), mobile pages at 390 × 844 (DPR 3, mobile emulation):
 * one overview per page plus one PNG per scene. Motion is set explicitly (`no-preference`); `--reduce=1` emulates
 * `prefers-reduced-motion: reduce` — the standstill a visitor with animation effects off sees.
 */
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openBrowser, findHeadlessChrome } from '../../scripts/lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
if (!args.gallery || !args.out) { console.error('usage: shots.mjs --gallery=<dir> --out=<dir> [--reduce=1]'); process.exit(2); }
const GAL = resolve(args.gallery), OUT = resolve(args.out);
mkdirSync(OUT, { recursive: true });
const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden'); process.exit(2); }
const browser = await openBrowser(chrome);
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let n = 0;
for (const file of readdirSync(GAL).filter((f) => f.endsWith('.html')).sort()) {
  const mobile = /-mobil\.html$/.test(file), name = file.replace(/\.html$/, '');
  const ctx = await browser.newContext({ width: mobile ? 390 : 1440, height: mobile ? 844 : 900, mobile });
  // explicit: Windows with animation effects off makes Chromium report `reduce` — then no scene moves (bolt shown, flash hidden)
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: args.reduce ? 'reduce' : 'no-preference' }] });
  const loaded = browser.waitFor((m) => m.sessionId === ctx.sessionId && m.method === 'Page.loadEventFired');
  await ctx.send('Page.navigate', { url: pathToFileURL(join(GAL, file)).href });
  await loaded;
  await ctx.evaluate('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 700)))');
  const info = JSON.parse(await ctx.evaluate(`JSON.stringify({
    h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth,
    spartan: document.fonts.check("700 14px 'League Spartan'"),
    figs: [...document.querySelectorAll('figure')].map((f) => { const r = f.getBoundingClientRect(); return { t: f.querySelector('figcaption').textContent, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }),
    minFont: Math.min(...[...document.querySelectorAll('.aw-dv *')].filter((e) => e.childNodes.length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize))),
    anims: document.getAnimations().filter((a) => a.playState === 'running').length,
    stage: (() => { const r = (document.querySelector('.aw-dv-stage') ?? document.querySelector('.aw-hz-xs')).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
    overflow: [...document.querySelectorAll('.aw-dv')].filter((d) => [...d.querySelectorAll('.aw-dv-top, .aw-dv-road, .aw-dv-cap')].some((e) => { const a = e.getBoundingClientRect(), b = d.getBoundingClientRect(); return a.left < b.left - 0.5 || a.right > b.right + 0.5 || a.top < b.top - 0.5 || a.bottom > b.bottom + 0.5; })).length,
    clash: [...document.querySelectorAll('.aw-dv')].filter((d) => { const t = d.querySelector('.aw-dv-top').getBoundingClientRect(), s = d.querySelector('.aw-dv-stage').getBoundingClientRect(); const lows = [...d.querySelectorAll('.aw-dv-road, .aw-dv-cap')].map((e) => e.getBoundingClientRect()).filter((r) => r.top < s.bottom - 1); const kids = [...d.querySelector('.aw-dv-top').children].map((e) => e.getBoundingClientRect()); return lows.some((l) => kids.some((k) => k.bottom > l.top + 0.5 && k.right > l.left && k.left < l.right)) || kids[0].right > kids[1].left + 0.5 || t.bottom > s.bottom + 0.5; }).length,
  })`));
  const shot = async (clip, out) => {
    const r = await ctx.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
    writeFileSync(out, Buffer.from(r.data, 'base64')); n++;
  };
  if (!mobile) await shot({ x: 0, y: 0, width: info.w, height: info.h }, join(OUT, `${name}.png`));
  for (const [i, f] of info.figs.entries()) await shot({ x: Math.max(0, f.x - 4), y: Math.max(0, f.y - 4), width: f.w + 8, height: f.h + 8 }, join(OUT, `${name}-${String(i + 1).padStart(2, '0')}-${slug(f.t)}.png`));
  console.log(`${name}: ${info.figs.length} Szenen · Bühne ${info.stage.join(' × ')} px · kleinste Schrift ${info.minFont} px · League Spartan geladen: ${info.spartan} · HUD außerhalb der Karte: ${info.overflow} · HUD-Felder überlappen: ${info.clash} · laufende Animationen: ${info.anims}`);
  await ctx.close();
}
await browser.close();
console.log(`${n} PNG → ${OUT}`);
