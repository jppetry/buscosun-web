// Screenshots of the DV follow-up gallery (V-DV-13 / V-DV-14) via scripts/lib/headlessShot.mjs.
//   node audit/autobahn-fahrerblick/nachtrag-shots.mjs . <gallery dir of verify-road-driver --dump> <png dir>   (audit/autobahn-fahrerblick.md §9.3)
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, gal, out] = process.argv.slice(2).map((p) => resolve(p));
const { openShooter, findHeadlessChrome } = await import(pathToFileURL(join(root, 'scripts', 'lib', 'headlessShot.mjs')).href);
mkdirSync(out, { recursive: true });
const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden'); process.exit(2); }
const sh = await openShooter(chrome);
const probe = `document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 700))).then(() => JSON.stringify({
  h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth,
  spartan: document.fonts.check("700 14px 'League Spartan'"),
  reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
  figs: [...document.querySelectorAll('figure')].map((f) => { const r = f.getBoundingClientRect(); const s = f.querySelector('.aw-dv-stage').getBoundingClientRect(); return {
    t: f.querySelector('figcaption').textContent, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, stage: [Math.round(s.width), Math.round(s.height)],
    chip: f.querySelector('.aw-dv-chip').textContent, chipPx: parseFloat(getComputedStyle(f.querySelector('.aw-dv-chip')).fontSize),
    aria: f.querySelector('.aw-dv-scene').getAttribute('aria-label'),
    pud: f.querySelector('ellipse[fill="#C3CCD4"]')?.parentElement.getAttribute('opacity') ?? null,
    glare: [...f.querySelectorAll('polygon')].find((p) => /Glare/.test(p.getAttribute('fill') ?? ''))?.getAttribute('opacity') ?? null,
    out: [...f.querySelectorAll('.aw-dv-top, .aw-dv-road, .aw-dv-cap')].some((e) => { const a = e.getBoundingClientRect(), b = f.querySelector('.aw-dv').getBoundingClientRect(); return a.left < b.left - 0.5 || a.right > b.right + 0.5 || a.top < b.top - 0.5 || a.bottom > b.bottom + 0.5; }),
  }; }),
}))`;
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const [name, o] of [['nachtrag-desktop', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }], ['nachtrag-mobil', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }]]) {
  const url = pathToFileURL(join(gal, `${name}.html`)).href;
  // the viewport itself (1440 × 900 / 390 × 844), then one PNG per scene
  const info = JSON.parse(await sh.shot(url, join(out, `${name}-viewport.png`), { ...o, probe }));
  for (const [i, f] of info.figs.entries())
    await sh.shot(url, join(out, `${name}-${i + 1}-${slug(f.t)}.png`), { ...o, settleMs: 500, clip: { x: Math.max(0, f.x - 4), y: Math.max(0, f.y - 4), width: f.w + 8, height: f.h + 8 } });
  console.log(`${name}: Seite ${info.w} × ${info.h} · League Spartan ${info.spartan} · reduced-motion ${info.reduce}`);
  for (const f of info.figs) console.log(`  ${f.t}\n    Bühne ${f.stage.join(' × ')} · Chip „${f.chip}“ ${f.chipPx} px · Pfützen ${f.pud} · Blendung ${f.glare} · HUD außerhalb: ${f.out}\n    aria: ${f.aria}`);
}
await sh.close();
console.log(`PNG → ${out}`);
