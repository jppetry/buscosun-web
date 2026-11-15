// Markup comparison of the driver's view and the cross-section: working tree against HEAD (git archive of src/).
//   git archive HEAD src | tar -x -C <dir>   then   node audit/autobahn-fahrerblick/head-compare.mjs . <dir>   (audit/autobahn-fahrerblick.md §9.3)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [ROOT, HEADDIR] = process.argv.slice(2).map((p) => resolve(p));
const { build } = await import(pathToFileURL(join(ROOT, 'node_modules', 'esbuild', 'lib', 'main.js')).href);
const tmp = mkdtempSync(join(tmpdir(), 'dv-cmp-'));
const bundle = async (dir, name) => {
  const out = join(tmp, `${name}.mjs`);
  await build({
    stdin: { resolveDir: dir, loader: 'ts', contents: `
      export { default as RoadDriverView } from './src/road/RoadDriverView.tsx';
      export { default as RoadCrossSection } from './src/road/RoadCrossSection.tsx';
      export { crossSectionOf } from './src/road/roadHzView.ts';
      export { ROAD_HAZARDS, COND } from './src/road/roadHazards.ts';
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';` },
    bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: out, logLevel: 'silent', jsx: 'automatic', nodePaths: [join(ROOT, 'node_modules')],
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  return import(pathToFileURL(out).href);
};
const NEW = await bundle(ROOT, 'new'), OLD = await bundle(HEADDIR, 'old');

const SLOT = Date.UTC(2026, 10, 6, 5, 15);
const st = (o) => ({ id: 's1', g: 'g', n: 'Beispielberg', lat: 48, lon: 11, h: 500, road: 'A8', kind: 'A', dir: null, km: 34, t: SLOT, cls: 'ok', q: 'm', ns: 1, vis: null, ws: null, wg: null, wd: null, ...o });
const seg = { id: 'A8-034', stations: ['s1'], near: [] };
const fixtures = (M) => {
  const xsOf = (point, airFc = null) => M.crossSectionOf(point ? seg : { ...seg, stations: [] }, new Map(point ? [['s1', point]] : []), SLOT, 'buscosun Fusion 14', airFc);
  const C = M.COND;
  return {
    trocken: xsOf(st({ rs: 10.6, ta: 6, td: 2.3, rh: 77, cond: C.dry, wf: 0 })),
    feucht: xsOf(st({ rs: 3.4, ta: 4.1, td: 3.2, rh: 94, cond: C.damp, wf: 0.08 })),
    'feucht-ohne-wf': xsOf(st({ rs: 3.4, ta: 4.1, td: 3.2, rh: 94, cond: C.damp, wf: null })),
    nass: xsOf(st({ rs: 4.8, ta: 5.6, td: 4.3, rh: 96, cond: C.wet, wf: 0.45 })),
    'nass-0,10': xsOf(st({ rs: 4.8, ta: 5.6, td: 4.3, rh: 96, cond: C.wet, wf: 0.1 })),
    'nass-0,00-gemessen': xsOf(st({ rs: 4.8, ta: 5.6, td: 4.3, rh: 96, cond: C.wet, wf: 0 })),
    'nass-ohne-wf': xsOf(st({ rs: 4.8, ta: 5.6, td: 4.3, rh: 96, cond: C.wet, wf: null })),
    reif: xsOf(st({ rs: -1.6, ta: 0.6, td: -0.9, rh: 90, cond: C.frost, wf: null })),
    eis: xsOf(st({ rs: -2.3, ta: -0.8, td: -1.6, rh: 95, cond: C.ice, wf: null })),
    schnee: xsOf(st({ rs: -1.2, ta: -1.9, td: -2.7, rh: 93, cond: C.snow, wf: null })),
    unbekannt: xsOf(st({ rs: null, ta: 3.9, td: 1.8, rh: 86, cond: null, wf: null, x: { rs: 'spike' } })),
    nichtgemessen: xsOf(null, { t: 5.8, td: 2.1 }),
  };
};
// React's useId differs per render tree only by position — both bundles render one component alone, so ids match.
const html = (M, Comp, xs, fx) => M.renderToStaticMarkup(M.createElement(Comp, { xs, fx }));
const FN = fixtures(NEW), FO = fixtures(OLD);
const scenes = [null];
for (const hz of NEW.ROAD_HAZARDS) for (let lv = 1; lv <= hz.max; lv++) for (const at of [null, '14:00']) scenes.push({ id: hz.id, lv, at, ev: null });
let n = 0; const diff = { driver: [], schematic: [] };
for (const k of Object.keys(FN)) for (const fx of scenes) {
  n++;
  const name = `${k}${fx ? ` × ${fx.id}:${fx.lv}${fx.at ? ':ab' : ''}` : ''}`;
  if (html(NEW, NEW.RoadDriverView, FN[k], fx) !== html(OLD, OLD.RoadDriverView, FO[k], fx)) diff.driver.push(name);
  if (html(NEW, NEW.RoadCrossSection, FN[k], fx) !== html(OLD, OLD.RoadCrossSection, FO[k], fx)) diff.schematic.push(name);
}
const group = (list) => { const m = new Map(); for (const s of list) { const [k, rest] = s.split(' × '); const key = `${k}${rest ? ` × ${rest.split(':')[0]}` : ''}`; m.set(key, (m.get(key) ?? 0) + 1); } return [...m].map(([k, c]) => `${k} (${c})`); };
console.log(`${n} Szenen je Ansicht (${Object.keys(FN).length} Fixtures × ${scenes.length} Szenen: ohne Gefahr + 16 Gefahren × Stufe × jetzt/ab)`);
console.log(`Fahrerblick: ${diff.driver.length} Szenen mit anderem Markup als HEAD`);
for (const g of group(diff.driver)) console.log(`  ${g}`);
console.log(`Querschnitt: ${diff.schematic.length} Szenen mit anderem Markup als HEAD`);
for (const g of group(diff.schematic)) console.log(`  ${g}`);
// expected: only fixtures without a film value (any scene) and the low sun on snow / frost
const expected = (s) => /^(nass-ohne-wf|feucht-ohne-wf)( |$)/.test(s) || /^(schnee|reif) × sonne:/.test(s);
const expectedOld = (s) => /^(nass-ohne-wf|feucht-ohne-wf)( |$)/.test(s);
const unexp = [...diff.driver.filter((s) => !expected(s)), ...diff.schematic.filter((s) => !expectedOld(s)).map((s) => `Querschnitt: ${s}`)];
const missing = [];
for (const k of ['nass-ohne-wf', 'feucht-ohne-wf']) for (const fx of scenes) { const name = `${k}${fx ? ` × ${fx.id}:${fx.lv}${fx.at ? ':ab' : ''}` : ''}`; if (!diff.driver.includes(name)) missing.push(name); if (!diff.schematic.includes(name)) missing.push(`Querschnitt: ${name}`); }
for (const k of ['schnee', 'reif']) for (const lv of [1, 2]) for (const at of ['', ':ab']) if (!diff.driver.includes(`${k} × sonne:${lv}${at}`)) missing.push(`${k} × sonne:${lv}${at}`);
console.log(`unerwartete Unterschiede: ${unexp.length}${unexp.length ? ` — ${unexp.slice(0, 8).join(' | ')}` : ''}`);
console.log(`erwartete, aber fehlende Unterschiede: ${missing.length}${missing.length ? ` — ${missing.slice(0, 8).join(' | ')}` : ''}`);
// negative control in words: what HEAD said for the two cases
const pud = (s) => /<g opacity="([0-9.]+)"><ellipse[^>]*fill="#C3CCD4"/.exec(s)?.[1];
const glare = (s) => /fill="url\(#awDvGlare[^"]*\)" opacity="([0-9.]+)"/.exec(s)?.[1];
const sun = { id: 'sonne', lv: 1, at: null, ev: null };
console.log(`HEAD: nass ohne wf „${FO['nass-ohne-wf'].label}“ Pfützen ${pud(html(OLD, OLD.RoadDriverView, FO['nass-ohne-wf'], null))} · feucht ohne wf „${FO['feucht-ohne-wf'].label}“ · Blendung Schnee ${glare(html(OLD, OLD.RoadDriverView, FO.schnee, sun))} Reif ${glare(html(OLD, OLD.RoadDriverView, FO.reif, sun))} trocken ${glare(html(OLD, OLD.RoadDriverView, FO.trocken, sun))}`);
console.log(`neu:  nass ohne wf „${FN['nass-ohne-wf'].label}“ Pfützen ${pud(html(NEW, NEW.RoadDriverView, FN['nass-ohne-wf'], null))} · feucht ohne wf „${FN['feucht-ohne-wf'].label}“ · Blendung Schnee ${glare(html(NEW, NEW.RoadDriverView, FN.schnee, sun))} Reif ${glare(html(NEW, NEW.RoadDriverView, FN.reif, sun))} trocken ${glare(html(NEW, NEW.RoadDriverView, FN.trocken, sun))}`);
rmSync(tmp, { recursive: true, force: true });
process.exit(unexp.length || missing.length ? 1 : 0);
