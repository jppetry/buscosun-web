/**
 * verify:road-driver — Phase DV (audit/autobahn-fahrerblick.md): the driver's view of „Was auf der Fahrbahn liegt“.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-driver.mjs [--dump=<dir>]
 *
 * No browser: the REAL component (`src/road/RoadDriverView.tsx`) and the schematic one are bundled with esbuild (in the
 * tree through Vite, no new dependency) and rendered with `react-dom/server`. The cross-sections are built by the real
 * `crossSectionOf()` from station fixtures — one per surface kind, so labels and texts are the page's, not invented here.
 *
 *   A  switch: `ROAD_XS_VIEW`, `?xsview=` beats the stored vote beats the constant, anything else is no vote
 *   B  8 surface kinds without a hazard: aria-label, every HUD text of the cross-section, the honesty note, no weather
 *      plane, „unbekannt“ / „nicht gemessen“ not painted as a state
 *   C  16 hazards × level 1…max × now / „ab“: tag word for word like the schematic view, tint of the level, the weather
 *      plane dimmed when ahead, levels change the scene
 *   D  the hazard never repaints the surface (sensor truth)
 *   E  markup: no NaN / undefined / Infinity, every `url(#…)` resolves, ids unique with two instances on one page
 *   F  motion: every moving layer travels whole tiles and covers the picture at both ends (seamless); the CSS carries
 *      every class and keyframe the markup uses and the reduced-motion rules
 *   G  contrast ≥ 4.5 : 1 of every HUD ink against its panel (glass over the worst backdrop: white), chips, tags
 *   H  wiring: the detail view picks the component by the switch, the schematic view renders as before
 *
 * `--dump=<dir>` writes one HTML gallery per viewport class (all scenes, real CSS and fonts) for screenshots.
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

// --- bundle the real modules ------------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'road-driver-'));
const out = join(tmp, 'bundle.mjs');
await build({
  stdin: {
    resolveDir: ROOT, loader: 'ts',
    contents: `
      export { default as RoadDriverView, DV_HUD, DV_CHIP, DV_NOTE, driverTag } from './src/road/RoadDriverView.tsx';
      export { default as RoadCrossSection } from './src/road/RoadCrossSection.tsx';
      export { crossSectionOf, HZ_SHORT } from './src/road/roadHzView.ts';
      export { ROAD_HAZARDS, COND } from './src/road/roadHazards.ts';
      export { AW_SEV_TINT } from './src/road/roadNivoTheme.ts';
      export { ROAD_XS_VIEW, roadXsViewFrom } from './src/road/roadFlag.ts';
      export { createElement, Fragment } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';
    `,
  },
  bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: out, logLevel: 'silent', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const M = await import(pathToFileURL(out).href);
const { RoadDriverView, RoadCrossSection, crossSectionOf, HZ_SHORT, ROAD_HAZARDS, COND, AW_SEV_TINT, DV_HUD, DV_CHIP, DV_NOTE, driverTag, createElement: h, Fragment, renderToStaticMarkup } = M;
const render = (xs, fx = null) => renderToStaticMarkup(h(RoadDriverView, { xs, fx }));
const renderOld = (xs, fx = null) => renderToStaticMarkup(h(RoadCrossSection, { xs, fx }));

// --- fixtures: one station per surface kind, through the real `crossSectionOf` --------------------------------
const SLOT = Date.UTC(2026, 10, 6, 5, 15);
const st = (o) => ({ id: 's1', g: 'g', n: 'Beispielberg', lat: 48, lon: 11, h: 500, road: 'A8', kind: 'A', dir: null, km: 34, t: SLOT, cls: 'ok', q: 'm', ns: 1, vis: null, ws: null, wg: null, wd: null, ...o });
const seg = { id: 'A8-034', stations: ['s1'], near: [] };
const xsOf = (point, airFc = null) => crossSectionOf(point ? seg : { ...seg, stations: [] }, new Map(point ? [['s1', point]] : []), SLOT, 'buscosun Fusion 14', airFc);
const KINDS = {
  trocken: xsOf(st({ rs: 10.6, ta: 6, td: 2.3, rh: 77, cond: COND.dry, wf: 0 })),
  feucht: xsOf(st({ rs: 3.4, ta: 4.1, td: 3.2, rh: 94, cond: COND.damp, wf: 0.08 })),
  nass: xsOf(st({ rs: 4.8, ta: 5.6, td: 4.3, rh: 96, cond: COND.wet, wf: 0.45 })),
  reif: xsOf(st({ rs: -1.6, ta: 0.6, td: -0.9, rh: 90, cond: COND.frost, wf: null })),
  eis: xsOf(st({ rs: -2.3, ta: -0.8, td: -1.6, rh: 95, cond: COND.ice, wf: null })),
  schnee: xsOf(st({ rs: -1.2, ta: -1.9, td: -2.7, rh: 93, cond: COND.snow, wf: null })),
  unbekannt: xsOf(st({ rs: null, ta: 3.9, td: 1.8, rh: 86, cond: null, wf: null, x: { rs: 'spike' } })),
  nichtgemessen: xsOf(null, { t: 5.8, td: 2.1 }),
};
const KIND_IDS = Object.keys(KINDS);
add('B0 Fixtures: die echte crossSectionOf() liefert je Messpunkt genau die acht Zustände (ein Zustand je Fixture)',
  KIND_IDS.every((k) => KINDS[k].kind === k) && KINDS.unbekannt.roadText === 'Fahrbahn: Sensor verworfen' && /\(Prognose\)/.test(KINDS.nichtgemessen.air) && /\(Prognose\)/.test(KINDS.nichtgemessen.dew),
  KIND_IDS.map((k) => `${k}→${KINDS[k].kind}`).join(' '));

// --- helpers on markup --------------------------------------------------------------------------------------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const idsOf = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const refsOf = (html) => [...html.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
const badNumbers = (html) => /NaN|undefined|Infinity/.test(html);
const stageOf = (html) => html.slice(html.indexOf('class="aw-dv-stage"'), html.indexOf('class="aw-dv-top"')).replace(/aria-label="[^"]*"/, '').replace(/awDv([A-Za-z0-9]+?)(R[a-z0-9]+|_r_[a-z0-9]+_?)(?=["#)])/g, 'awDv$1');
const unresolved = (html) => { const ids = new Set(idsOf(html)); return refsOf(html).filter((r) => !ids.has(r)); };
const classesOf = (html) => new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
const allMarkup = [];

// --- A: switch ------------------------------------------------------------------------------------------------
{
  const f = M.roadXsViewFrom, d = M.ROAD_XS_VIEW;
  const other = d === 'driver' ? 'schematic' : 'driver';
  add('A1 Schalter: ROAD_XS_VIEW ist einer der zwei Werte; ohne Stimme gilt die Konstante',
    (d === 'schematic' || d === 'driver') && f('', null) === d && f('?road=1', null) === d, `ROAD_XS_VIEW = '${d}'`);
  add('A2 ?xsview= schlägt die gemerkte Stimme, die gemerkte Stimme schlägt die Konstante — in beide Richtungen',
    f('?xsview=driver', null) === 'driver' && f('?xsview=schematic', null) === 'schematic' && f('?xsview=driver', 'schematic') === 'driver' && f('?xsview=schematic', 'driver') === 'schematic'
    && f('', other) === other && f('?seg=A8-034&ds=1', 'driver') === 'driver' && f('', 'driver', 'schematic') === 'driver' && f('', null, 'driver') === 'driver');
  add('A3 alles andere ist keine Stimme (leer, 1, Großschreibung, kaputte Query)',
    f('?xsview=', null) === d && f('?xsview=1', null) === d && f('?xsview=Driver', null) === d && f('', 'ja') === d && f('?xsview=foo', other) === other && f('%%%', null) === d);
}

// --- B: 8 kinds without a hazard --------------------------------------------------------------------------------
{
  const bad = [];
  for (const k of KIND_IDS) {
    const xs = KINDS[k], html = render(xs);
    allMarkup.push(html);
    const want = `aria-label="${esc(`Fahrbahn aus Fahrersicht: ${xs.label}, ${xs.roadText}`)}"`;
    const texts = [xs.air, xs.dew, xs.rh, xs.src, xs.roadText, xs.label, DV_NOTE];
    if (!html.includes(want)) bad.push(`${k}: aria-label`);
    for (const t of texts) if (!html.includes(esc(t))) bad.push(`${k}: Text „${t}“ fehlt`);
    if (/aw-dv-tag/.test(html)) bad.push(`${k}: Marke ohne Gefahr`);
    if (/aw-dv-wx|aw-dv-drift|aw-dv-fx/.test(html)) bad.push(`${k}: Wetterebene ohne Gefahr`);
    if ((html.match(/role="img"/g) ?? []).length !== 1) bad.push(`${k}: role=img ≠ 1`);
    if (!/viewBox="0 0 520 292"/.test(html)) bad.push(`${k}: viewBox`);
  }
  add('B1 acht Zustände ohne Gefahr: aria-label „Fahrbahn aus Fahrersicht: ‹Zustand›, ‹Fahrbahntext›“, alle sieben HUD-Texte (Luft, Taupunkt, Feuchte, Quelle, Fahrbahn, Zustand, Note), keine Marke, keine Wetterebene, ein role=img',
    bad.length === 0, bad.slice(0, 4).join(' | ') || `${KIND_IDS.length} Zustände`);

  const marks = { Refl: ['feucht', 'nass', 'eis'], Snow: ['schnee'], Frost: ['reif'], Hatch: ['unbekannt'] };
  const wrong = [];
  for (const [mark, kinds] of Object.entries(marks)) for (const k of KIND_IDS) {
    const has = new RegExp(`id="awDv${mark}`).test(render(KINDS[k]));
    if (has !== kinds.includes(k)) wrong.push(`${k}:${mark}=${has}`);
  }
  const ng = render(KINDS.nichtgemessen), un = render(KINDS.unbekannt);
  add('B2 Zustand = Sensor: Spiegelung nur feucht/nass/Eis, Schnee nur Schnee, Reif nur Reif; „unbekannt“ trägt nur die Schraffur, „nicht gemessen“ nur den gestrichelten Umriss (6 4) — keiner von beiden einen Zustand',
    wrong.length === 0 && /stroke-dasharray="6 4"/.test(ng) && !/stroke-dasharray="6 4"/.test(un) && KIND_IDS.filter((k) => /stroke-dasharray="6 4"/.test(render(KINDS[k]))).length === 1
    && /aw-dv-chip is-hatch/.test(un) && /aw-dv-chip is-dash/.test(ng) && /Fahrbahn: Sensor verworfen/.test(un) && /Fahrbahn: keine Messung/.test(ng),
    wrong.join(' ') || 'Marker je Zustand stimmen');
  const half = render({ ...KINDS.nass, filmMm: 0.1 }), full = render(KINDS.nass), none = render({ ...KINDS.nass, filmMm: 0 });
  const pud = (s) => Number(/<g opacity="([0-9.]+)"><ellipse[^>]*fill="#C3CCD4"/.exec(s)?.[1]);
  add('B3 „nass“: die Filmhöhe skaliert die Pfützen (≥ 0,2 mm voll, 0,1 mm halb, ohne Filmwert ein Drittel — nie null)',
    pud(full) === 0.9 && Math.abs(pud(half) - 0.45) < 0.01 && pud(none) > 0.3 && pud(none) < pud(half), `0,45 mm ${pud(full)} · 0,1 mm ${pud(half)} · 0 mm ${pud(none)}`);
}

// --- C: 16 hazards × levels × now / ahead ---------------------------------------------------------------------
const cases = [];
for (const hz of ROAD_HAZARDS) for (let lv = 1; lv <= hz.max; lv++) for (const at of [null, '14:00']) cases.push({ id: hz.id, lv, at });
{
  const bad = [], tagDiff = [], tintBad = [], aheadBad = [];
  const oldTag = (s) => /text-anchor="middle">([^<]+)<\/text>/.exec(s)?.[1] ?? null;
  for (const c of cases) {
    const xs = KINDS.nass, fx = { id: c.id, lv: c.lv, at: c.at, ev: null };
    const html = render(xs, fx), want = `${HZ_SHORT[c.id]} · ${c.at ? `ab ${c.at}` : `Stufe ${c.lv}`}${c.at ? ' · Prognose' : ''}`;
    allMarkup.push(html);
    const got = /class="aw-dv-tag[^"]*"[^>]*>([^<]+)</.exec(html)?.[1] ?? null;
    if (got !== esc(want) || driverTag(fx) !== want) bad.push(`${c.id}:${c.lv}${c.at ? ':ab' : ''} „${got}“`);
    if (oldTag(renderOld(xs, fx)) !== got) tagDiff.push(`${c.id}:${c.lv}`);
    if (!html.includes(`aria-label="${esc(`Fahrbahn aus Fahrersicht: ${xs.label}, ${xs.roadText}; Szene: ${want}`)}"`)) bad.push(`${c.id}:${c.lv} aria-label`);
    const t = AW_SEV_TINT[c.lv];
    if (!new RegExp(`class="aw-dv-tag[^"]*"[^>]*style="background:${t.bg};border-color:${t.border};color:${t.ink}"`).test(html)) tintBad.push(`${c.id}:${c.lv}`);
    const wx = /class="(aw-dv-wx[^"]*)"/.exec(html)?.[1];
    if (wx !== (c.at ? 'aw-dv-wx is-ahead' : 'aw-dv-wx')) aheadBad.push(`${c.id}:${c.lv}${c.at ? ':ab' : ''} „${wx}“`);
  }
  // evidence 'p' (forecast level now) says „· Prognose“ too — the rule of the schematic view
  const p = { id: 'nebel', lv: 2, at: null, ev: 'p' };
  const pTag = /class="aw-dv-tag[^"]*"[^>]*>([^<]+)</.exec(render(KINDS.trocken, p))?.[1];
  add(`C1 ${cases.length} Fälle (16 Gefahren × Stufe 1…max × jetzt/ab): Marke „‹Kurzname› · Stufe n“ bzw. „… · ab HH:MM · Prognose“, aria-label mit „; Szene: …“`, bad.length === 0, bad.slice(0, 4).join(' | ') || `${cases.length} Fälle, ${ROAD_HAZARDS.length} Gefahren`);
  add('C2 Marke Wort für Wort wie im Querschnitt (beide Komponenten gerendert und verglichen), auch „Stufe n · Prognose“ bei Nachweis p; Stufe 0 = keine Szene',
    tagDiff.length === 0 && pTag === 'Nebel · Stufe 2 · Prognose' && oldTag(renderOld(KINDS.trocken, p)) === pTag && !/aw-dv-tag|aw-dv-wx/.test(render(KINDS.trocken, { id: 'nebel', lv: 0, at: null, ev: null })), tagDiff.slice(0, 4).join(' ') || pTag);
  add('C3 Farbe der Marke = AW_SEV_TINT der Stufe (Grund, Rand, Schrift)', tintBad.length === 0, tintBad.slice(0, 6).join(' '));
  add('C4 Gefahr voraus („ab“): die Wetterebene ist gedimmt (is-ahead), jetzt nicht', aheadBad.length === 0, aheadBad.slice(0, 4).join(' | '));

  const flat = [];
  for (const hz of ROAD_HAZARDS) for (let lv = 1; lv < hz.max; lv++) {
    const a = stageOf(render(KINDS.trocken, { id: hz.id, lv, at: null, ev: null })), b = stageOf(render(KINDS.trocken, { id: hz.id, lv: lv + 1, at: null, ev: null }));
    if (a === b) flat.push(`${hz.id}:${lv}→${lv + 1}`);
  }
  const same = ROAD_HAZARDS.filter((hz) => stageOf(render(KINDS.trocken, { id: hz.id, lv: 1, at: null, ev: null })) === stageOf(render(KINDS.trocken)));
  const layers = (id, lv) => (render(KINDS.trocken, { id, lv, at: null, ev: null }).match(/class="aw-dv-drift"/g) ?? []).length;
  add('C5 jede Gefahr verändert das Bild, jede höhere Stufe verändert es weiter; Regen/Schnee/Hagel wachsen 1 → 2 → 3 Schichten',
    flat.length === 0 && same.length === 0 && [1, 2, 3].every((l) => layers('aqua', l) === l && layers('hagel', l) === l) && layers('schnee', 1) === 1 && layers('schnee', 3) > layers('schnee', 2) && layers('schnee', 2) > 1,
    [...flat, ...same.map((s) => `${s.id}=ohne`)].join(' ') || `aqua ${[1, 2, 3].map((l) => layers('aqua', l))} · schnee ${[1, 2, 3].map((l) => layers('schnee', l))} · hagel ${[1, 2, 3].map((l) => layers('hagel', l))}`);
  const fog = [1, 2, 3].map((l) => /class="aw-dv-veil" style="background:(linear-gradient[^"]+)"/.exec(render(KINDS.trocken, { id: 'nebel', lv: l, at: null, ev: null }))?.[1] ?? '');
  const atHorizon = fog.map((g) => Number(/,([0-9.]+)\) (?:41|50)%/.exec(g)?.[1])), atBottom = fog.map((g) => Number(/,([0-9.]+)\) 100%/.exec(g)?.[1]));
  add('C6 Nebel: am Horizont am dichtesten, zum Betrachter dünner, mit der Stufe dichter (Sicht fällt mit der Entfernung)',
    atHorizon.every((v, i) => v > atBottom[i]) && atHorizon[0] < atHorizon[1] && atHorizon[1] < atHorizon[2] && atBottom[0] < atBottom[1] && atBottom[1] < atBottom[2], `Horizont ${atHorizon} · unten ${atBottom}`);
  // the fifth ring of the sock is its tip: second point of the last polygon
  const tipY = [1, 2, 3].map((l) => {
    const g = /class="aw-dv-sock"[^>]*>(.*?)<\/g>/.exec(render(KINDS.trocken, { id: 'quer', lv: l, at: null, ev: null }))?.[1] ?? '';
    const pts = [...g.matchAll(/points="([^"]+)"/g)].map((m) => m[1].split(' '));
    return pts.length === 5 ? Number(pts[4][1].split(',')[1]) : NaN;
  });
  add('C7 Seitenwind: der Windsack steht mit der Stufe waagerechter (Spitze höher: 55° → 25° → 6° Hang)', tipY[0] > tipY[1] && tipY[1] > tipY[2], `Spitze y ${tipY}`);
  const lorry = (k) => /fill="#C8332B"/.test(render(KINDS[k], { id: 'gischt', lv: 2, at: null, ev: null }));
  add('C8 Gischt: Lkw mit Rückleuchten und Gischtfahne; gespiegelt nur auf feuchter, nasser oder vereister Fahrbahn',
    KIND_IDS.every((k) => /fill="#D23A30"/.test(render(KINDS[k], { id: 'gischt', lv: 1, at: null, ev: null })) && /aw-dv-spray/.test(render(KINDS[k], { id: 'gischt', lv: 1, at: null, ev: null })))
    && KIND_IDS.every((k) => lorry(k) === ['feucht', 'nass', 'eis'].includes(k)), KIND_IDS.filter(lorry).join(' '));
}

// --- D: the hazard never repaints the surface ------------------------------------------------------------------
{
  const wrong = [];
  const surfaceMarks = (s) => ['Refl', 'Snow', 'Frost', 'Hatch'].filter((m) => new RegExp(`id="awDv${m}`).test(s)).join('+') + (/stroke-dasharray="6 4"/.test(s) ? '+dash' : '');
  for (const k of KIND_IDS) {
    const base = surfaceMarks(render(KINDS[k]));
    for (const hz of ROAD_HAZARDS) { const got = surfaceMarks(render(KINDS[k], { id: hz.id, lv: hz.max, at: null, ev: null })); if (got !== base) wrong.push(`${k}×${hz.id}: ${base}→${got}`); }
  }
  add(`D1 ${KIND_IDS.length} Zustände × ${ROAD_HAZARDS.length} Gefahren (höchste Stufe): die Zustandsschicht bleibt die des Sensors (Schneefall macht aus trocken keinen Schnee, Regen aus Schnee kein Nass)`, wrong.length === 0, wrong.slice(0, 4).join(' | ') || `${KIND_IDS.length * ROAD_HAZARDS.length} Paare`);
}

// --- E: markup hygiene ------------------------------------------------------------------------------------------
{
  for (const k of KIND_IDS) for (const hz of ROAD_HAZARDS) allMarkup.push(render(KINDS[k], { id: hz.id, lv: hz.max, at: null, ev: null }));
  const nan = allMarkup.filter(badNumbers).length;
  const open = allMarkup.flatMap(unresolved);
  const dupIn = allMarkup.filter((s) => { const ids = idsOf(s); return new Set(ids).size !== ids.length; }).length;
  add(`E1 ${allMarkup.length} gerenderte Szenen: kein NaN / undefined / Infinity in Attributen oder Text`, nan === 0, `${nan} betroffen`);
  add('E2 jede url(#…)-Referenz zeigt auf eine id derselben Instanz (Verläufe, Muster, Filter, Clip), keine id doppelt in einer Instanz', open.length === 0 && dupIn === 0, open.slice(0, 5).join(' ') || `${allMarkup.reduce((n, s) => n + refsOf(s).length, 0)} Referenzen`);
  const two = renderToStaticMarkup(h(Fragment, null,
    h(RoadDriverView, { xs: KINDS.nass, fx: { id: 'gewitter', lv: 3, at: null, ev: null } }), h(RoadDriverView, { xs: KINDS.nass, fx: { id: 'gewitter', lv: 3, at: null, ev: null } }),
    h(RoadDriverView, { xs: KINDS.reif, fx: { id: 'gischt', lv: 2, at: '14:00', ev: null } }), h(RoadDriverView, { xs: KINDS.schnee, fx: { id: 'nebel', lv: 3, at: null, ev: null } }),
    h(RoadCrossSection, { xs: KINDS.nass, fx: { id: 'gewitter', lv: 3, at: null, ev: null } })));
  const ids = idsOf(two).filter((i) => i.startsWith('awDv'));
  add('E3 zwei gleiche und zwei weitere Instanzen auf einer Seite (neben dem Querschnitt): alle awDv-ids eindeutig, alle Referenzen aufgelöst', ids.length > 20 && new Set(ids).size === ids.length && unresolved(two).length === 0, `${ids.length} ids, ${new Set(ids).size} verschieden`);
}

// --- F: motion --------------------------------------------------------------------------------------------------
const css = readFileSync(join(ROOT, 'src', 'road', 'roadDeck.css'), 'utf8');
{
  const bad = []; let n = 0;
  for (const s of allMarkup) for (const m of s.matchAll(/<svg class="aw-dv-drift" viewBox="([^"]+)"[^>]*style="([^"]+)"><defs><pattern id="[^"]+" width="(\d+)" height="(\d+)"/g)) {
    n++;
    const [x0, y0, w, hh] = m[1].split(' ').map(Number), tw = Number(m[3]), th = Number(m[4]);
    const v = (k) => Number(new RegExp(`${k}:(-?[0-9.]+)%`).exec(m[2])?.[1]);
    const dx = (v('--dv-dx') * w) / 100, dy = (v('--dv-dy') * hh) / 100;
    const whole = (d, t) => Math.abs(d / t - Math.round(d / t)) < 1e-3;
    const left = (v('left') * 520) / 100, top = (v('top') * 292) / 100, width = (v('width') * 520) / 100, height = (v('height') * 292) / 100;
    const covers = (ox, oy) => left + ox <= 0.01 && top + oy <= 0.01 && left + ox + width >= 519.99 && top + oy + height >= 291.99;
    if (!whole(dx, tw) || !whole(dy, th) || (dx === 0 && dy === 0)) bad.push(`Kachel ${tw}×${th}: Weg ${dx.toFixed(2)}/${dy.toFixed(2)}`);
    if (!covers(0, 0) || !covers(dx, dy)) bad.push(`Kachel ${tw}×${th}: deckt das Bild nicht (${left.toFixed(0)},${top.toFixed(0)},${width.toFixed(0)},${height.toFixed(0)} · Weg ${dx.toFixed(0)}/${dy.toFixed(0)})`);
    if (Math.abs(left - x0) > 0.01 || Math.abs(top - y0) > 0.01 || Math.abs(width - w) > 0.01 || Math.abs(height - hh) > 0.01) bad.push(`Kachel ${tw}×${th}: Kasten ≠ viewBox`);
  }
  add(`F1 ${n} bewegte Schichten: jede wandert je Zyklus um ganze Kacheln (nahtlos) und deckt das Bild am Anfang und am Ende des Zyklus`, n > 50 && bad.length === 0, [...new Set(bad)].slice(0, 3).join(' | ') || `${n} Schichten`);

  const used = new Set(allMarkup.flatMap((s) => [...classesOf(s)]));
  const missing = [...used].filter((c) => c.startsWith('aw-dv') && !new RegExp(`\\.${c}[\\s,.:{>]`).test(css));
  const keyframes = [...css.matchAll(/animation:\s*(awDv[A-Za-z]+)/g)].map((m) => m[1]);
  const noKf = keyframes.filter((k) => !new RegExp(`@keyframes ${k}\\b`).test(css));
  add('F2 CSS: jede aw-dv-Klasse des Markups hat eine Regel, jede Animation ihre @keyframes; keine Klasse aw-xs- im Fahrerblick', missing.length === 0 && noKf.length === 0 && keyframes.length >= 9 && ![...used].some((c) => c.startsWith('aw-xs')),
    [...missing, ...noKf].join(' ') || `${[...used].filter((c) => c.startsWith('aw-dv')).length} Klassen, ${new Set(keyframes).size} Animationen`);
  const rm = /@media \(prefers-reduced-motion: reduce\) \{\s*\.aw-dv-wx, \.aw-dv-wx \* \{ animation: none !important; \}\s*\.aw-dv-bolt \{ opacity: 0\.9; \}\s*\.aw-dv-flash \{ opacity: 0; \}\s*\}/.test(css);
  const stillClean = allMarkup.every((s) => { const scene = s.slice(s.indexOf('<svg class="aw-dv-scene"'), s.indexOf('</svg>') + 6); return !/animation|aw-dv-(drift|twinkle|ring|heat|sock|flash|bolt|spray|fogbank)/.test(scene) && !/<animate/.test(s); });
  add('F3 reduzierte Bewegung: alle Animationen der Wetterebene stehen, der Blitz bleibt mit 0,9 sichtbar, das Aufblitzen aus (Regel wie .aw-xs-*); das Standbild trägt keine Animation, nirgends SMIL', rm && stillClean);
}

// --- G: contrast ------------------------------------------------------------------------------------------------
{
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const [pr, pg, pb, pa] = DV_HUD.panel;
  // the glass panel over the brightest thing behind it (snow, sun bloom, flash ≈ white)
  const panel = [pr, pg, pb].map((v) => v * pa + 255 * (1 - pa));
  const rows = [
    ...['ink', 'sub', 'src'].map((k) => [`HUD ${k} auf Glas über Weiß`, ratio(rgb(DV_HUD[k]), panel)]),
    ...Object.entries(DV_CHIP).map(([k, c]) => [`Chip ${k}`, ratio(rgb(c.ink), rgb(c.bg))]),
    ['Chip unbekannt auf hellem Streifen', ratio(rgb(DV_CHIP.unbekannt.ink), rgb('#F5F1E8'))],
    ...[1, 2, 3].map((l) => [`Marke Stufe ${l}`, ratio(rgb(AW_SEV_TINT[l].ink), rgb(AW_SEV_TINT[l].bg))]),
  ];
  const low = rows.filter((r) => r[1] < 4.5);
  add(`G1 Kontrast ≥ 4,5 : 1 für ${rows.length} Paare: HUD-Schriften auf dem Glasfeld über weißem Grund (schlechtester Fall), acht Zustands-Chips, drei Marken`, low.length === 0,
    low.map((r) => `${r[0]} ${r[1].toFixed(2)}`).join(' | ') || `kleinster Wert ${Math.min(...rows.map((r) => r[1])).toFixed(2)} (${rows.reduce((a, b) => (b[1] < a[1] ? b : a))[0]})`);
  const sizes = [...css.matchAll(/\.aw-dv[a-z-]*(?:\.[a-z-]+)?\s*\{[^}]*font-size:\s*([0-9.]+)px/g)].map((m) => Number(m[1]));
  add('G2 keine HUD-Schrift unter 12 px (alle font-size der aw-dv-Regeln)', sizes.length >= 7 && sizes.every((s) => s >= 12), `${sizes.join(', ')} px`);
}

// --- H: wiring --------------------------------------------------------------------------------------------------
{
  const detail = readFileSync(join(ROOT, 'src', 'road', 'RoadHazardDetail.tsx'), 'utf8');
  const route = readFileSync(join(ROOT, 'src', 'router', 'pages', 'RoadRoute.tsx'), 'utf8');
  add('H1 Einbau: die Detailansicht liest roadXsViewFrom(), lädt den Fahrerblick als eigenen Lazy-Chunk und rendert sonst den Querschnitt mit denselben Props; die Route merkt sich ?xsview=',
    /const xsView = useMemo\(\(\) => roadXsViewFrom\(\), \[\]\)/.test(detail) && /const RoadDriverView = lazy\(\(\) => import\('\.\/RoadDriverView'\)\)/.test(detail)
    && /xsView === 'driver'\s*\?\s*<Suspense fallback=\{.*?\}><RoadDriverView xs=\{xs\} fx=\{xsFx\} \/><\/Suspense>\s*:\s*<RoadCrossSection xs=\{xs\} fx=\{xsFx\} \/>/.test(detail) && /rememberRoadXsView\(loc\.search\)/.test(route));
  const old = renderOld(KINDS.nass, { id: 'aqua', lv: 2, at: null, ev: null });
  add('H2 der Querschnitt rendert wie bisher: viewBox 338 × 118, „Querschnitt der Fahrbahn: …“, Fußnote „Querschnitt schematisch, Schichtdicke überhöht“, Klassen aw-xs-*, keine aw-dv-*',
    /viewBox="0 0 338 118"/.test(old) && old.includes(`aria-label="${esc(`Querschnitt der Fahrbahn: ${KINDS.nass.label}, ${KINDS.nass.roadText}; Szene: Aquaplaning · Stufe 2`)}"`) && /Querschnitt schematisch, Schichtdicke überhöht/.test(old) && /aw-xs-rain/.test(old) && !/aw-dv/.test(old));
}

// --- optional: HTML gallery for screenshots (real CSS, real fonts) ---------------------------------------------
if (args.dump) {
  const dir = resolve(args.dump);
  mkdirSync(dir, { recursive: true });
  const fonts = readFileSync(join(ROOT, 'src', 'fonts.css'), 'utf8').replace(/url\('\/fonts\//g, `url('${pathToFileURL(join(ROOT, 'public', 'fonts')).href}/`);
  const fig = (title, xs, fx) => `<figure><figcaption>${esc(title)}</figcaption>${render(xs, fx)}</figure>`;
  const kinds = KIND_IDS.map((k) => fig(`Zustand: ${k} · ohne Gefahr`, KINDS[k], null));
  const base = { reif: 'reif', nass: 'feucht', glatteis: 'eis', schnee: 'schnee', aqua: 'nass', nebel: 'feucht', gischt: 'nass', sonne: 'nass', quer: 'trocken', baum: 'trocken', staub: 'trocken', gewitter: 'nass', hagel: 'trocken', blowup: 'trocken', frost1: 'trocken', sturz: 'trocken' };
  const hazards = ROAD_HAZARDS.map((hz) => { const lv = Math.min(2, hz.max); return fig(`Gefahr: ${hz.id} · Stufe ${lv} · Fahrbahn ${base[hz.id]}`, KINDS[base[hz.id]], { id: hz.id, lv, at: null, ev: null }); });
  const levels = ROAD_HAZARDS.flatMap((hz) => Array.from({ length: hz.max }, (_, i) => fig(`${hz.id} · Stufe ${i + 1}`, KINDS[base[hz.id]], { id: hz.id, lv: i + 1, at: null, ev: null })));
  const ahead = [fig('voraus: Aquaplaning ab 14:00 · Fahrbahn trocken', KINDS.trocken, { id: 'aqua', lv: 2, at: '14:00', ev: 'p' }), fig('voraus: Schneeglätte ab 14:00 · Fahrbahn feucht', KINDS.feucht, { id: 'schnee', lv: 2, at: '14:00', ev: 'p' })];
  const page = (name, figs, cols, w) => writeFileSync(join(dir, `${name}.html`), `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fahrerblick — ${name}</title><style>${fonts}\n${css}\nbody{margin:0;padding:12px;background:#F5F1E8;font-family:'League Spartan',system-ui,sans-serif;color:#2C2A26}.gal{display:grid;grid-template-columns:repeat(${cols},${w});gap:14px}figure{margin:0;min-width:0}figcaption{font-size:12px;font-weight:600;margin-bottom:2px}</style></head><body><div class="gal">${figs.join('')}</div></body></html>`);
  page('zustaende-desktop', kinds, 3, '440px'); page('gefahren-desktop', hazards, 3, '440px'); page('voraus-desktop', ahead, 2, '440px'); page('stufen-desktop', levels, 3, '440px');
  // the schematic view of the same 16 scenes — for the comparison of what a scene paints at rest (audit/autobahn-fahrerblick/page.mjs --only=idle)
  page('querschnitt-desktop', ROAD_HAZARDS.map((hz) => { const lv = Math.min(2, hz.max); return `<figure><figcaption>${esc(`Gefahr: ${hz.id} · Stufe ${lv} · Fahrbahn ${base[hz.id]}`)}</figcaption>${renderOld(KINDS[base[hz.id]], { id: hz.id, lv, at: null, ev: null })}</figure>`; }), 3, '440px');
  page('zustaende-mobil', kinds, 1, 'minmax(0,1fr)'); page('gefahren-mobil', hazards, 1, 'minmax(0,1fr)'); page('voraus-mobil', ahead, 1, 'minmax(0,1fr)');
  console.log(`  Galerie: ${dir}`);
}

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`\nverify:road-driver — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
