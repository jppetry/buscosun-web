/**
 * verify:sea-particles — Phase BS-P (`audit/seewetter-binnenseen.md` §9): wind particles on the Seewetter map.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-particles.mjs
 *
 * No browser and no WebGL here: the Wetterkarte's `WindLayer` is hosted unchanged, what this phase adds is the choice of
 * the hour, the fetch windows, the words and the wiring — that is what is checked. The picture itself is Jan's look.
 *
 *   A  pure logic (`seaParticles.ts`): window of the loaded field, an hour outside is never clamped, which window is
 *      fetched when, the legend names the field's source, when the particles rest
 *   B  switch: on for everyone (Jan 22.11.), `?swp=0` off — the page as before
 *   C  the layer's control flow against stand-ins for `WindLayer` and the wind reader (bundled with esbuild, the real
 *      `SeaParticleLayer.ts`): where the layer goes in, what it shows for which hour, one long fetch and no loop, a
 *      failed fetch, the refresh, taking it out again; a runaway fetch loop is stopped by the stand-in and reported
 *   D  wiring by source: off (`?swp=0`) = no chunk, no layer, no switch; the layer is the Wetterkarte's with its settings and clamps
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  SEA_PARTICLES_AHEAD_H, SEA_PARTICLES_BEFORE, SEA_PARTICLES_HINT, SEA_PARTICLES_LABEL, SEA_PARTICLES_LAYER_ID, SEA_PARTICLES_REFRESH_MS,
  particleHourOf, particleLegend, particleWindowOf, particlesFetchWant, particlesWanted,
} from '../src/sea/seaParticles.ts';
import { SEA_PARTICLES_LIVE, seaParticlesFrom } from '../src/sea/seaFlag.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8').replace(/\r\n/g, '\n');
const H = 3_600_000;
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: ok ? '' : String(detail) });

// --- A: pure logic ------------------------------------------------------------------------------------------------
const RUN = Date.UTC(2026, 10, 22, 0);
const W = particleWindowOf(RUN, [RUN + 3 * H, RUN + 4 * H]);
add('A1 Fenster = erste bis letzte Stunde des geladenen Felds; ohne Bild keines', W && W.runMs === RUN && W.fromMs === RUN + 3 * H && W.toMs === RUN + 4 * H
  && particleWindowOf(RUN, []) === null && particleWindowOf(NaN, [RUN]) === null && particleWindowOf(RUN, [RUN + 5 * H, RUN + 2 * H]).fromMs === RUN + 2 * H, JSON.stringify(W));
add('A2 eine Stunde außerhalb wird nie auf den Rand gezogen: davor / darin / dahinter',
  particleHourOf(W, RUN + 2 * H) === 'before' && particleHourOf(W, RUN + 3 * H) === 'in' && particleHourOf(W, RUN + 4 * H) === 'in'
  && particleHourOf(W, RUN + 4 * H + 1) === 'after' && particleHourOf(W, RUN + 40 * H) === 'after');
add('A3 Start mit dem Jetzt-Fenster; das lange Fenster nur, wenn die Stunde hinter dem Feld liegt, und nur einmal',
  particlesFetchWant(W, RUN + 3 * H, 0, 0) === null && particlesFetchWant(W, RUN + 5 * H, 0, 0) === SEA_PARTICLES_AHEAD_H
  && particlesFetchWant(W, RUN + 5 * H, SEA_PARTICLES_AHEAD_H, 0) === null && particlesFetchWant(W, RUN + 2 * H, 0, 0) === null && particlesFetchWant(null, RUN, 0, 9e9) === null
  && SEA_PARTICLES_AHEAD_H === 12);
add('A4 ein Feld älter als drei Stunden wird mit seinem Fenster neu geholt, ein jüngeres nicht',
  particlesFetchWant(W, RUN + 3 * H, 0, SEA_PARTICLES_REFRESH_MS + 1) === 0 && particlesFetchWant(W, RUN + 3 * H, 12, SEA_PARTICLES_REFRESH_MS + 1) === 12
  && particlesFetchWant(W, RUN + 3 * H, 12, SEA_PARTICLES_REFRESH_MS) === null && SEA_PARTICLES_REFRESH_MS === 3 * H);
const when = (ms) => `T${(ms - RUN) / H}`;
const okLine = particleLegend({ kind: 'ok', w: W }, when);
add('A5 Legende: nennt ICON-D2 mit Lauf und sagt „nicht buscosun Fusion“; keine Prozente, kein „sicher“',
  /ICON-D2 \(Lauf 00 UTC\)/.test(okLine) && /nicht buscosun Fusion/.test(okLine) && /Spots können davon abweichen/.test(okLine) && !/%|sicher/.test(okLine)
  && /Lauf 21 UTC/.test(particleLegend({ kind: 'ok', w: { ...W, runMs: RUN - 3 * H } }, when)), okLine);
add('A6 Legende außerhalb des Felds nennt, bis wann bzw. ab wann es reicht; laden, keine Daten und Ruhe haben eigene Worte',
  /keine für diese Stunde.*reicht bis T4 Uhr/.test(particleLegend({ kind: 'outside', side: 'after', w: W }, when))
  && /keine für diese Stunde.*beginnt T3 Uhr/.test(particleLegend({ kind: 'outside', side: 'before', w: W }, when))
  && particleLegend({ kind: 'loading' }, when) === 'Windpartikel laden.' && particleLegend({ kind: 'na' }, when) === 'Windpartikel: keine Daten.'
  && /ruhen in der Ebene Strömung/.test(particleLegend({ kind: 'rest' }, when)));
add('A7 gezeichnet nur mit Schalter der Phase UND Dock-Schalter UND Seedaten; in der Ebene „Strömung“ ruhen sie',
  particlesWanted({ flag: true, toggle: true, noData: false, isCur: false }) === 'on' && particlesWanted({ flag: true, toggle: true, noData: false, isCur: true }) === 'rest'
  && particlesWanted({ flag: false, toggle: true, noData: false, isCur: false }) === 'off' && particlesWanted({ flag: true, toggle: false, noData: false, isCur: false }) === 'off'
  && particlesWanted({ flag: true, toggle: true, noData: true, isCur: false }) === 'off' && particlesWanted({ flag: false, toggle: true, noData: false, isCur: true }) === 'off');
add('A8 Worte des Schalters: „Windpartikel“, die Quelle im Untertitel', SEA_PARTICLES_LABEL === 'Windpartikel' && /ICON-D2/.test(SEA_PARTICLES_HINT) && /nicht buscosun Fusion/.test(SEA_PARTICLES_HINT));

// --- B: switch ----------------------------------------------------------------------------------------------------
add('B1 an für alle (Jan 22.11., E-BS-18); `?swp=0` aus — der Rückfall; `?swp=1` an; kaputte Query = ab Werk',
  SEA_PARTICLES_LIVE === true && seaParticlesFrom('') === true && seaParticlesFrom('?swp=1') === true && seaParticlesFrom('?swp=0') === false
  && seaParticlesFrom('?l=hs&swp=0&t=3') === false && seaParticlesFrom('?swp=ja') === true);
add('B2 der Schalter der Phase wirkt in beiden Stellungen der Konstante: aus = `?swp=1` schaltet an, an = `?swp=0` schaltet aus',
  seaParticlesFrom('', true) === true && seaParticlesFrom('?swp=0', true) === false && seaParticlesFrom('', false) === false && seaParticlesFrom('?swp=1', false) === true && seaParticlesFrom('?swp=0', false) === false);

// --- C: the layer's control flow, real `SeaParticleLayer.ts` against stand-ins --------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'sea-particles-'));
const STUBS = {
  WindLayer: 'export class WindLayer { constructor(o) { this.id = o.id; this.o = o; this.calls = []; globalThis.__sp.layers.push(this); } setDensityMultiplier(x) { this.calls.push(["density", x]); } setShowHeatmap(x) { this.calls.push(["heatmap", x]); } setShowParticles(x) { this.calls.push(["particles", x]); } setSuspended(x) { this.calls.push(["suspended", x]); } setWindData(img, meta) { this.calls.push(["data", img, meta]); } }',
  weatherWindPreset: 'export const WEATHER_WIND_DENSITY = 0.55; export function weatherWindOptions(c) { return { preset: true, coarse: c }; }',
  iconD2WindSource: 'export function fetchIconD2Wind(signal, a, b, opts) { const sp = globalThis.__sp; sp.calls = (sp.calls ?? 0) + 1; if (sp.calls > 30) { globalThis.__spRunaway = true; return new Promise(() => {}); } return sp.fetch(signal, opts); } export function windFrameAtValidTime(w, t) { globalThis.__sp.asked.push(t); return w.frames.find((f) => f.validAt.getTime() === t) ?? w.frames[0]; }',
};
const out = join(tmp, 'layer.mjs');
await build({
  entryPoints: [join(ROOT, 'src/sea/SeaParticleLayer.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /\.\.\/wind\/(WindLayer|weatherWindPreset|iconD2WindSource)$/ }, (a) => ({ path: a.path.split('/').pop(), namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
  } }],
});
const { SeaParticleLayer } = await import(pathToFileURL(out).href);
const tick = () => new Promise((r) => setImmediate(r));
const realTimeout = globalThis.setTimeout, realClear = globalThis.clearTimeout, realNow = Date.now;
function stage({ coarse = false, has = true } = {}) {
  const sp = { layers: [], asked: [], fetches: [], fetch: null, timers: [], cleared: [] };
  globalThis.__sp = sp;
  globalThis.window = { matchMedia: () => ({ matches: coarse }) };
  globalThis.setTimeout = (fn, ms) => { sp.timers.push({ fn, ms }); return sp.timers.length; };
  globalThis.clearTimeout = (id) => { sp.cleared.push(id); };
  const map = { added: [], removed: [], layers: new Set(has ? [SEA_PARTICLES_BEFORE] : []),
    getLayer(id) { return this.layers.has(id) ? { id } : undefined; },
    addLayer(l, before) { this.added.push([l.id, before]); this.layers.add(l.id); },
    removeLayer(id) { this.removed.push(id); this.layers.delete(id); } };
  return { sp, map };
}
const frames = (steps) => steps.map((s) => ({ validAt: new Date(RUN + s * H), stepHours: s, image: `img${s}`, width: 608, height: 373, uMin: -1, uMax: 2, vMin: -3, vMax: 4 }));
const wind = (steps) => ({ runAt: new Date(RUN), frames: frames(steps), uvBounds: [0.1, 0.2, 0.3, 0.4] });
const last = (l, k) => l.calls.filter((c) => c[0] === k).pop();
try {
  // C1/C2: construction and the first field
  {
    const { sp, map } = stage();
    sp.fetch = (signal, opts) => { sp.fetches.push(opts); return Promise.resolve(wind([3, 4])); };
    const states = [];
    const layer = new SeaParticleLayer(map, RUN + 3 * H, (s) => states.push(s));
    const l = sp.layers[0];
    add('C1 die Schicht ist die der Wetterkarte: gemeinsame Voreinstellung, Flächengrenzen 2 500 / 48 000, Dichte 0,55, ohne Windfärbung; sie liegt unter den Pfeilen',
      sp.layers.length === 1 && l.o.preset === true && l.o.id === SEA_PARTICLES_LAYER_ID && l.o.minParticles === 2500 && l.o.maxParticles === 48000 && l.o.reduceMotionOnMove === false
      && last(l, 'density')[1] === 0.55 && last(l, 'heatmap')[1] === false && l.calls.find((c) => c[0] === 'particles')[1] === false
      && JSON.stringify(map.added) === JSON.stringify([[SEA_PARTICLES_LAYER_ID, SEA_PARTICLES_BEFORE]]), JSON.stringify([l.o, map.added]));
    await tick();
    const d = last(l, 'data');
    add('C2 erster Abruf = nur das Jetzt-Fenster; die Stunde im Feld wird gezeichnet, mit Normierung und Lage des Bilds; Meldung „ok“ mit Fenster',
      JSON.stringify(sp.fetches) === JSON.stringify([{ nowOnly: true, aheadHours: 0 }]) && d && d[1] === 'img3' && d[2].width === 608 && d[2].uMin === -1 && d[2].vMax === 4
      && JSON.stringify(d[2].uvBounds) === '[0.1,0.2,0.3,0.4]' && last(l, 'particles')[1] === true && states[0].kind === 'loading' && states.at(-1).kind === 'ok'
      && states.at(-1).w.toMs === RUN + 4 * H, JSON.stringify([sp.fetches, states]));
    // C3: a second hour inside, the same hour again
    const nData = () => l.calls.filter((c) => c[0] === 'data').length;
    layer.setTime(RUN + 4 * H);
    const afterFour = nData();
    layer.setTime(RUN + 4 * H);
    add('C3 Stundenwechsel im Feld setzt das Bild dieser Stunde, ohne neuen Abruf; dieselbe Stunde noch einmal tut nichts',
      afterFour === 2 && nData() === 2 && last(l, 'data')[1] === 'img4' && sp.fetches.length === 1);
    // C4: an hour behind the field → no particles at once, ONE long fetch, then the hour is drawn
    let release;
    sp.fetch = (signal, opts) => { sp.fetches.push(opts); return new Promise((r) => { release = () => r(wind([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])); }); };
    layer.setTime(RUN + 7 * H);
    const hidden = last(l, 'particles')[1] === false, sLoading = states.at(-1).kind;
    layer.setTime(RUN + 8 * H);   // while the long fetch runs: no second one
    const during = sp.fetches.length;
    release(); await tick();
    add('C4 Stunde hinter dem Feld: sofort keine Partikel (nie das Randbild), genau EIN Abruf des langen Fensters, danach die Stunde',
      hidden && sLoading === 'loading' && during === 2 && sp.fetches[1].aheadHours === SEA_PARTICLES_AHEAD_H && last(l, 'data')[1] === 'img8' && last(l, 'particles')[1] === true
      && states.at(-1).kind === 'ok', JSON.stringify([hidden, sLoading, during, sp.fetches]));
    // C5: beyond the long window → outside, no further fetch, never a loop
    layer.setTime(RUN + 30 * H);
    await tick(); await tick();
    const s5 = states.at(-1);
    layer.setTime(RUN + 31 * H); await tick();
    add('C5 Stunde hinter dem langen Fenster: „außerhalb“ mit dem Ende des Felds, kein weiterer Abruf, keine Schleife',
      s5.kind === 'outside' && s5.side === 'after' && s5.w.toMs === RUN + 12 * H && last(l, 'particles')[1] === false && sp.fetches.length === 2, JSON.stringify([s5, sp.fetches.length]));
    layer.setTime(RUN + 1 * H);
    add('C6 Stunde vor dem Feld: „außerhalb, davor“, kein Abruf', states.at(-1).kind === 'outside' && states.at(-1).side === 'before' && sp.fetches.length === 2);
    // C7: stage and removal
    layer.setActive(false); layer.setActive(true);
    const susp = l.calls.filter((c) => c[0] === 'suspended').map((c) => c[1]);
    layer.destroy();
    const n = states.length;
    layer.setTime(RUN + 4 * H);
    add('C7 Karte von der Bühne = Schleife der Schicht ruht; Ausschalten nimmt die Schicht aus der Karte, danach geschieht nichts mehr',
      JSON.stringify(susp) === '[true,false]' && JSON.stringify(map.removed) === JSON.stringify([SEA_PARTICLES_LAYER_ID]) && states.length === n && !map.getLayer(SEA_PARTICLES_LAYER_ID));
  }
  // C8: a failed first fetch — "laden" while a retry is pending, three retries, then "keine Daten"; never particles
  {
    const { sp, map } = stage();
    sp.fetch = (signal, opts) => { sp.fetches.push(opts); return Promise.reject(new Error('kein Bild')); };
    const states = [];
    const layer = new SeaParticleLayer(map, RUN + 3 * H, (s) => states.push(s));
    await tick();
    const first = states.at(-1).kind, t0 = sp.timers.length, ms = sp.timers[0]?.ms;
    for (let i = 0; i < 5 && sp.timers[i]; i++) { sp.timers[i].fn(); await tick(); }
    const l = sp.layers[0];
    add('C8 erster Abruf scheitert: „laden“, nach 60 s neu, höchstens dreimal, dann „keine Daten“; nie Partikel, nie ein Bild',
      first === 'loading' && t0 === 1 && ms === 60_000 && sp.fetches.length === 4 && sp.timers.length === 3 && states.at(-1).kind === 'na'
      && !l.calls.some((c) => c[0] === 'data') && l.calls.filter((c) => c[0] === 'particles').every((c) => c[1] === false), JSON.stringify([first, sp.fetches.length, sp.timers.length, states.at(-1)]));
    layer.destroy();
  }
  // C9: the long fetch fails — the field that is there stays, and it is not asked for again at every hour
  {
    const { sp, map } = stage();
    let n = 0;
    sp.fetch = (signal, opts) => { sp.fetches.push(opts); return n++ === 0 ? Promise.resolve(wind([3, 4])) : Promise.reject(new Error('weg')); };
    const states = [];
    const layer = new SeaParticleLayer(map, RUN + 3 * H, (s) => states.push(s));
    await tick();
    layer.setTime(RUN + 6 * H); await tick();
    layer.setTime(RUN + 7 * H); await tick();
    layer.setTime(RUN + 4 * H);
    const l = sp.layers[0];
    add('C9 das lange Fenster scheitert: „außerhalb“ statt Schleife (ein Versuch), das vorhandene Feld bleibt nutzbar',
      sp.fetches.length === 2 && states.some((s) => s.kind === 'outside' && s.side === 'after') && states.at(-1).kind === 'ok' && last(l, 'data')[1] === 'img4' && sp.timers.length === 0,
      JSON.stringify([sp.fetches.length, states.map((s) => s.kind)]));
    layer.destroy();
  }
  // C9b: the same hour of the same run is set once — not again when the longer window comes in
  {
    const { sp, map } = stage();
    let n = 0, release;
    sp.fetch = (signal, opts) => { sp.fetches.push(opts); return n++ === 0 ? Promise.resolve(wind([3, 4])) : new Promise((r) => { release = () => r(wind([3, 4, 5, 6, 7, 8])); }); };
    const states = [];
    const layer = new SeaParticleLayer(map, RUN + 3 * H, (s) => states.push(s));
    await tick();
    layer.setTime(RUN + 7 * H);   // behind the field: the long window is asked for
    layer.setTime(RUN + 3 * H);   // back before it arrives
    release(); await tick();
    const l = sp.layers[0];
    const datas = l.calls.filter((c) => c[0] === 'data').map((c) => c[1]);
    layer.setTime(RUN + 7 * H);
    add('C9b dieselbe Stunde desselben Laufs wird einmal gesetzt — nicht noch einmal, wenn das lange Fenster eintrifft; die neue Stunde danach schon',
      JSON.stringify(datas) === '["img3"]' && sp.fetches.length === 2 && last(l, 'data')[1] === 'img7' && last(l, 'particles')[1] === true && states.at(-1).kind === 'ok', JSON.stringify([datas, sp.fetches.length]));
    layer.destroy();
  }
  // C10: refresh after three hours at the next change of the hour, with the window it had; a newer run replaces the field
  {
    const { sp, map } = stage();
    let n = 0, now = RUN + 3.5 * H;
    Date.now = () => now;
    sp.fetch = (signal, opts) => { sp.fetches.push(opts); return Promise.resolve(n++ === 0 ? wind([3, 4]) : { ...wind([3, 4]), runAt: new Date(RUN + 3 * H), frames: frames([3, 4, 5]).map((f) => ({ ...f, image: `neu${f.stepHours}` })) }); };
    const states = [];
    const layer = new SeaParticleLayer(map, RUN + 3 * H, (s) => states.push(s));
    await tick();
    now += 2 * H; layer.setTime(RUN + 4 * H); await tick();
    const early = sp.fetches.length;
    now += 2 * H; layer.setTime(RUN + 3 * H); await tick();
    const l = sp.layers[0];
    add('C10 nach drei Stunden holt der nächste Stundenwechsel das Feld neu (gleiches Fenster); der neue Lauf ersetzt das alte Feld',
      early === 1 && sp.fetches.length === 2 && sp.fetches[1].aheadHours === 0 && last(l, 'data')[1] === 'neu3' && states.at(-1).kind === 'ok' && states.at(-1).w.runMs === RUN + 3 * H && states.at(-1).w.toMs === RUN + 5 * H,
      JSON.stringify([early, sp.fetches, states.at(-1)]));
    layer.destroy();
    Date.now = realNow;
  }
  // C11: taken out while a fetch runs — the answer is dropped, the request is aborted; touch device; map without the arrow layer
  {
    const { sp, map } = stage({ coarse: true, has: false });
    let release, sig;
    sp.fetch = (signal) => { sig = signal; return new Promise((r) => { release = () => r(wind([3, 4])); }); };
    const states = [];
    const layer = new SeaParticleLayer(map, RUN + 3 * H, (s) => states.push(s));
    const l = sp.layers[0];
    layer.destroy();
    release(); await tick();
    add('C11 Ausschalten während des Abrufs: abgebrochen, die Antwort wird verworfen; Touch-Gerät = Voreinstellung der Wetterkarte für Touch; ohne Pfeil-Ebene liegt die Schicht oben',
      sig.aborted === true && !l.calls.some((c) => c[0] === 'data') && states.every((s) => s.kind === 'loading') && l.o.coarse === true && l.o.reduceMotionOnMove === true
      && JSON.stringify(map.added) === JSON.stringify([[SEA_PARTICLES_LAYER_ID, undefined]]), JSON.stringify([sig.aborted, states, map.added]));
  }
  add('C12 kein Abruf läuft in eine Schleife (höchstens 30 Abrufe je Szene; der Stellvertreter hält sonst an)', globalThis.__spRunaway !== true);
} finally {
  globalThis.setTimeout = realTimeout; globalThis.clearTimeout = realClear; Date.now = realNow;
  delete globalThis.window; delete globalThis.__sp; delete globalThis.__spRunaway;
  rmSync(tmp, { recursive: true, force: true });
}

// --- D: wiring by source ------------------------------------------------------------------------------------------
const mapSrc = src('sea/SeaMap.tsx'), page = src('sea/SeaPage.tsx'), dock = src('sea/SeaDock.tsx'), layerSrc = src('sea/SeaParticleLayer.ts'), pure = src('sea/seaParticles.ts');
const count = (s, re) => (s.match(re) ?? []).length;
add('D1 Karte: die Schicht kommt nur über `import()` (eigener Chunk), statisch nur als Typ; aus = Schicht wieder heraus; beim Abbau der Karte zerstört',
  /import type \{ SeaParticleLayer \} from '\.\/SeaParticleLayer';/.test(mapSrc) && count(mapSrc, /from '\.\/SeaParticleLayer'/g) === 1 && /void import\('\.\/SeaParticleLayer'\)/.test(mapSrc)
  && /if \(particleT == null\) \{ particleLayer\.current\?\.destroy\(\); particleLayer\.current = null; return; \}/.test(mapSrc)
  && /particleLayer\.current\?\.destroy\(\);\n\s+particleLayer\.current = null;\n\s+if \(mapRef\.current === map\) mapRef\.current = null;/.test(mapSrc)
  && /pick = null, particles = null \}: Props\)/.test(mapSrc));
add('D2 Karte: die Schicht geht erst nach den eigenen Ebenen der Karte hinein (sonst läge sie über Pfeilen und Marken)',
  /if \(ready\.current\) start\(\); else map\.once\('load', \(\) => \{ if \(alive\) start\(\); \}\);/.test(mapSrc) && /id: 'sw-arrows'/.test(mapSrc) && SEA_PARTICLES_BEFORE === 'sw-arrows');
add('D3 Seite: ohne den Schalter der Phase keine Schicht, kein Dock-Schalter, keine Quelle, keine Legendenzeile; in „Strömung“ und ohne Seedaten keine Schicht',
  /const particlesFlag = useMemo\(\(\) => seaParticlesFrom\(\), \[\]\);/.test(page)
  && /const particleMode = particlesWanted\(\{ flag: particlesFlag, toggle: toggles\.particles, noData: !!noData, isCur \}\);/.test(page)
  && /const particleProp = useMemo\(\(\) => \(particleMode === 'on' \? \{ tMs: validMs, onState: setParticleState \} : null\), \[particleMode, validMs\]\);/.test(page)
  && /particles=\{particleProp\}/.test(page) && count(page, /particles=\{/g) === 1 && /hasParticles=\{particlesFlag\}/.test(page)
  && /\.\.\.\(particlesFlag \? \[\{ name: 'Deutscher Wetterdienst · ICON-D2'/.test(page) && /\{particleMode !== 'off' && <div className="sw-legend-note">\{particleLegend\(/.test(page)
  && /particles: false \};/.test(page) && /particles: seaParticlesFrom\(\) \}\)\);/.test(page));
add('D4 Seite: die Quelle nennt ICON-D2 und „nicht buscosun Fusion“ und ist nur „an“, wenn wirklich Partikel gezeichnet werden',
  /what: 'Windpartikel: Wind in 10 m als Feld des Modells \(nicht buscosun Fusion\)'/.test(page) && /on: particleMode === 'on' && particleState\.kind === 'ok' \}\] : \[\]\)/.test(page));
add('D5 Dock: der Schalter „Windpartikel“ steht nur mit `hasParticles` in der Liste, mit den Worten der Phase',
  /if \(p\.hasParticles\) toggles\.push\(\['particles', SEA_PARTICLES_LABEL, SEA_PARTICLES_HINT\]\);/.test(dock) && count(dock, /'particles'/g) === 1 && /particles: <path d=/.test(dock));
const mv = readFileSync(join(ROOT, 'src/MapView.tsx'), 'utf8');
const clamp = /minParticles: (\d+), maxParticles: (\d+),/.exec(mv), own = /minParticles: (\d+), maxParticles: (\d+), reduceMotionOnMove: coarse \}/.exec(layerSrc);
add('D6 die Schicht nimmt Voreinstellung und Flächengrenzen der Wetterkarte (aus `MapView.tsx` gelesen), Dichte aus der gemeinsamen Konstante',
  clamp && own && clamp[1] === own[1] && clamp[2] === own[2] && /\.\.\.weatherWindOptions\(coarse\), id: SEA_PARTICLES_LAYER_ID,/.test(layerSrc)
  && /setDensityMultiplier\(WEATHER_WIND_DENSITY\)/.test(layerSrc) && /reduceMotionOnMove: coarsePointer,/.test(mv), JSON.stringify([clamp?.slice(1), own?.slice(1)]));
const imports = [...layerSrc.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
add('D7 die Schicht liest nur die Partikel-Klasse, ihre Voreinstellung und den Windleser der Wetterkarte — nichts von buscosun Fusion, kein eigener Shader; die reine Logik importiert nichts',
  JSON.stringify(imports) === JSON.stringify(['../wind/WindLayer', '../wind/iconD2WindSource', '../wind/weatherWindPreset', './seaParticles', 'maplibre-gl'])
  && !/pointForecast|shaders|gl\.|WebGLRenderingContext|getContext/.test(layerSrc.replace(/\/\*\*[\s\S]*?\*\//, '')) && !/^import /m.test(pure), JSON.stringify(imports));
add('D8 der Abruf ist der der Wetterkarte im Jetzt-Modus (kein Hintergrund-Nachladen des ganzen Laufs)',
  count(layerSrc, /fetchIconD2Wind\(this\.ac\.signal, undefined, undefined, \{ nowOnly: true, aheadHours: aheadH \}\)/g) === 1 && count(layerSrc, /fetchIconD2Wind\(/g) === 1);

const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail.slice(0, 300)}]` : ''}`);
console.log(`\nverify:sea-particles — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
