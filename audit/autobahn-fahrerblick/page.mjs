/**
 * Phase DV — the driver's view in the REAL page (audit/autobahn-fahrerblick.md §6): switch off / on, `?xsfx=` for both
 * views, layout of the dossier, console, main-thread tasks when switching segments, screenshots.
 *
 *   node audit/autobahn-fahrerblick/page.mjs --base=http://localhost:5173 --out=<png dir> [--all=1] [--only=switch,xsfx,all,mobile,tasks,scene]
 *        [--views=schematic,driver] [--rounds=2] [--clicks=16] [--gallery=<dir of verify:road-driver --dump>]
 *
 * Needs the DEV server (`?xsfx=` is a dev-only override) and live data of the data repo (a segment with a hazard row).
 * Headless Chromium over CDP with SwiftShader for MapLibre — task times are those of a software renderer, so the two
 * views are compared WITHIN this run, not against a device.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openBrowser, findHeadlessChrome } from '../../scripts/lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://localhost:5173';
const OUT = resolve(args.out ?? 'dv-page');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// `--gpu=1`: the full Chromium of Playwright with the machine's GPU (recipe of audit/windpartikel-hochzoom) instead of the software renderer.
const GPU = !!args.gpu;
const { existsSync, readdirSync } = await import('node:fs');
const fullChrome = () => { const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright'); if (!existsSync(base)) return null; for (const d of readdirSync(base).filter((x) => /^chromium-[0-9]+$/.test(x)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))) { const exe = join(base, d, 'chrome-win64', 'chrome.exe'); if (existsSync(exe)) return exe; } return null; };
const chrome = GPU ? fullChrome() : findHeadlessChrome();
if (!chrome) { console.error(GPU ? 'kein Chromium (ms-playwright/chromium-*) gefunden' : 'kein chrome-headless-shell gefunden'); process.exit(2); }
const browser = await openBrowser(chrome, GPU
  ? { timeoutMs: 120_000, gpu: true, extraArgs: ['--headless=new', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] }
  : { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
{
  const ctx = await browser.newContext({});
  const r = await ctx.evaluate(`(() => { try { const g = document.createElement('canvas').getContext('webgl'); const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unbekannt'; } catch (e) { return 'kein WebGL'; } })()`);
  console.log(`  Renderer: ${r}`);
  await ctx.close();
}
const results = [];
const note = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  [${detail}]` : ''}`); };

/**
 * Motion is set EXPLICITLY: this machine's Windows has animation effects off, so Chromium reports `prefers-reduced-motion:
 * reduce` and no scene would move at all (found 06.11.: `document.getAnimations()` = 0). `--reduce=1` measures the standstill.
 */
const motion = (ctx) => ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: args.reduce ? 'reduce' : 'no-preference' }] });

async function open(path, { width = 1440, height = 900, mobile = false, store = null } = {}) {
  const ctx = await browser.newContext({ width, height, mobile });
  const errors = [];
  const off = browser.on((msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? msg.params.exceptionDetails?.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)}`);
  });
  await motion(ctx);
  if (store) await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { ${Object.entries(store).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} } catch {}` });
  await ctx.send('Page.navigate', { url: `${BASE}${path}` });
  return { ctx, errors, off };
}
const until = async (ctx, expr, ms = 60_000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ctx.evaluate(expr).catch(() => false)) return true; await sleep(200); } return false; };
const shot = async (ctx, name, clipSel = null) => {
  let clip;
  if (clipSel) {
    const r = JSON.parse(await ctx.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(clipSel)}); if (!e) return 'null'; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return JSON.stringify({ x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: r.width + 12, height: r.height + 12 }); })()`));
    if (r) clip = { ...r, scale: 1 };
    await sleep(300);
  }
  const r = await ctx.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
};
/** Opens the first hazard row with a level (list → segment + dossier) and waits for the detail view. */
async function openFirstRow(ctx) {
  if (!(await until(ctx, `document.querySelectorAll('.aw-hz-row:not(.is-unknown)').length > 0 || document.querySelectorAll('.aw-hz-row').length > 0`, 90_000))) return false;
  await ctx.evaluate(`(document.querySelector('.aw-hz-row:not(.is-unknown)') ?? document.querySelector('.aw-hz-row')).click()`);
  return until(ctx, `!!document.querySelector('.aw-dossier-stage .aw-hz-detail, .aw-m-dossier .aw-hz-detail')`, 120_000);
}
const layout = (ctx) => ctx.evaluate(`JSON.stringify((() => {
  const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + (document.querySelector('.aw-dossier-body')?.scrollTop ?? 0)), Math.round(r.width), Math.round(r.height)]; };
  return { article: q('.aw-hz-article'), xscol: q('.aw-hz-xscol'), txtcol: q('.aw-hz-txtcol'), tiles: q('.aw-ds-tiles'), dirs: q('.aw-hz-dirs'), head: q('.aw-hz-xs-head'), xs: q('.aw-hz-xs'), dv: q('.aw-dv'), stage: q('.aw-dv-stage'), nav: q('.aw-hz-nav'),
    dvN: document.querySelectorAll('.aw-dv').length, xsN: document.querySelectorAll('.aw-hz-xs').length,
    tag: document.querySelector('.aw-dv-tag')?.textContent ?? [...document.querySelectorAll('.aw-hz-xs text')].map((t) => t.textContent).find((t) => / · (Stufe|ab) /.test(t)) ?? null,
    label: document.querySelector('.aw-dv-scene, .aw-hz-xs')?.getAttribute('aria-label'), url: location.pathname + location.search, stored: localStorage.getItem('xsview'),
    minFont: Math.min(...[...document.querySelectorAll('.aw-dv *')].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize))),
    interactive: document.querySelectorAll('.aw-dv a, .aw-dv button, .aw-dv [tabindex], .aw-dv input').length };
})())`).then(JSON.parse);

/** Main-thread tasks (trace events RunTask of the page's renderer) over `fn`; returns the durations ≥ 50 ms in ms. */
async function tasksDuring(ctx, fn) {
  const events = [];
  const off = browser.on((msg) => { if (msg.method === 'Tracing.dataCollected') events.push(...msg.params.value); });
  await browser.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] } });
  const pid = await ctx.evaluate(`(async () => { performance.mark('dv-probe'); return 1; })()`);
  await fn();
  const done = browser.waitFor((m) => m.method === 'Tracing.tracingComplete', 120_000);
  await browser.send('Tracing.end', {});
  await done; off();
  // the renderer main thread of THIS page: the thread that carries the user timing mark
  const mark = events.find((e) => e.name === 'dv-probe');
  const main = mark ? events.filter((e) => e.pid === mark.pid && e.tid === mark.tid) : [];
  const tasks = main.filter((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.ph === 'X' && e.dur >= 50_000).map((e) => Math.round(e.dur / 1000)).sort((a, b) => b - a);
  const paint = main.filter((e) => e.name === 'Paint' && e.ph === 'X').reduce((s, e) => s + e.dur, 0) / 1000;
  const raster = events.filter((e) => mark && e.pid === mark.pid && (e.name === 'RasterTask' || e.name === 'Rasterize') && e.ph === 'X').reduce((s, e) => s + e.dur, 0) / 1000;
  // what the longest task spent its time on (events inside it on the same thread, by name; nested events count twice)
  const top = main.filter((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.ph === 'X').sort((a, b) => b.dur - a.dur)[0];
  const by = new Map();
  if (top) for (const e of main) if (e.ph === 'X' && e !== top && e.ts >= top.ts && e.ts + (e.dur ?? 0) <= top.ts + top.dur && !/RunTask/.test(e.name)) by.set(e.name, (by.get(e.name) ?? 0) + e.dur / 1000);
  const inside = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');
  return { ok: !!mark && !!pid, tasks: [...new Set(tasks)], paintMs: Math.round(paint), paintN: main.filter((e) => e.name === 'Paint' && e.ph === 'X').length, rasterMs: Math.round(raster), n: main.length, inside };
}
const allErrors = [];
/** `--only=switch,xsfx,all,mobile,tasks` runs a part; without it everything (the 16 hazards only with `--all=1`). */
const run = (k) => !args.only || args.only.split(',').includes(k);

// --- 0: find a segment with a hazard row in the live data (list row → segment link in the path) ---------------
let segUrl = args.seg ?? null;
if (!segUrl) {
  const { ctx, off } = await open('/autobahnwetter');
  await openFirstRow(ctx);
  await until(ctx, `location.pathname.split('/').filter(Boolean).length >= 3 || /seg=/.test(location.search)`, 30_000);
  segUrl = await ctx.evaluate('location.pathname');
  off(); await ctx.close();
}
// --- 1: desktop, the schematic view by the query; then no parameter = the constant `ROAD_XS_VIEW` -----------------
if (run('switch')) {
  const d = await open(segUrl);
  const okD = await until(d.ctx, `!!document.querySelector('.aw-dossier-stage .aw-dv-scene, .aw-dossier-stage .aw-hz-xs')`, 120_000);
  const dl = await layout(d.ctx);
  note(`P0 ohne Parameter gilt die Konstante ROAD_XS_VIEW: gezeigt wird ${dl.dvN ? 'der Fahrerblick' : 'der Querschnitt'}, genau eine der zwei Ansichten, nichts in localStorage`, okD && dl.dvN + dl.xsN === 1 && dl.stored === null, `${dl.url} · ${dl.label}`);
  d.off(); allErrors.push(...d.errors); await d.ctx.close();
  const { ctx, errors, off } = await open(`${segUrl}?xsview=schematic`);
  const ok = await until(ctx, `!!document.querySelector('.aw-dossier-stage .aw-hz-xs')`, 120_000);
  await sleep(2500);
  const a = await layout(ctx);
  note('P1 ?xsview=schematic: der Abschnitt zeigt den Querschnitt (ein .aw-hz-xs, kein .aw-dv)', ok && a.xsN === 1 && a.dvN === 0 && a.stored === 'schematic', `${a.url} · ${a.label}`);
  await shot(ctx, 'p1-desktop-schalter-aus');
  await shot(ctx, 'p1-desktop-schalter-aus-ausschnitt', '.aw-hz-xsgrid');
  globalThis.offLayout = a;
  off(); allErrors.push(...errors); await ctx.close();
}
if (!segUrl || !(segUrl.includes('seg=') || segUrl.split('?')[0].split('/').filter(Boolean).length >= 3)) { console.error(`kein Abschnitt geöffnet (${segUrl}) — braucht Live-Daten mit einer Gefahrenzeile`); await browser.close(); process.exit(2); }
const sep = segUrl.includes('?') ? '&' : '?';

// --- 2: desktop, switch on by the query ---------------------------------------------------------------------
if (run('switch')) {
  const { ctx, errors, off } = await open(`${segUrl}${sep}xsview=driver`);
  const ok = await until(ctx, `!!document.querySelector('.aw-dossier-stage .aw-dv-scene')`, 90_000);
  await sleep(1500);
  const b = await layout(ctx), a = globalThis.offLayout;
  note('P2 ?xsview=driver: derselbe Abschnitt zeigt den Fahrerblick (ein .aw-dv, kein .aw-hz-xs); die Stimme steht in localStorage, die Query ist nach dem URL-Abgleich weg', ok && b.dvN === 1 && b.xsN === 0 && b.stored === 'driver' && !/xsview/.test(b.url), `${b.url} · ${b.label}`);
  const same = (k) => JSON.stringify(a[k]) === JSON.stringify(b[k]);
  note('P3 Dossier-Layout mit Schalter an: Artikel, Kacheln, Richtungsschalter, Überschrift und Textspalte stehen pixelgleich (x, y, Breite); nur die Bildspalte wird höher',
    ['tiles', 'dirs', 'head', 'nav'].every(same) && a.article[0] === b.article[0] && a.article[2] === b.article[2] && a.xscol[0] === b.xscol[0] && a.xscol[2] === b.xscol[2] && a.txtcol[0] === b.txtcol[0] && a.txtcol[1] === b.txtcol[1] && a.txtcol[2] === b.txtcol[2],
    `Bildspalte ${a.xscol[2]} × ${a.xscol[3]} → ${b.xscol[2]} × ${b.xscol[3]} px · Bühne ${b.stage?.[2]} × ${b.stage?.[3]} · Textspalte ${JSON.stringify(a.txtcol)} → ${JSON.stringify(b.txtcol)} · Artikelhöhe ${a.article[3]} → ${b.article[3]}`);
  note('P4 Fahrerblick in der Seite: keine Schrift unter 12 px, kein bedienbares Element im Bild (keine neuen Touch-Ziele)', b.minFont >= 12 && b.interactive === 0, `kleinste Schrift ${b.minFont} px · bedienbar ${b.interactive}`);
  await shot(ctx, 'p2-desktop-schalter-an');
  await shot(ctx, 'p2-desktop-schalter-an-ausschnitt', '.aw-hz-xsgrid');
  // back to the schematic view by the query
  off(); allErrors.push(...errors); await ctx.close();
}
if (run('switch')) {
  const { ctx, errors, off } = await open(`${segUrl}${sep}xsview=schematic`, { store: { xsview: 'driver' } });
  const ok = await until(ctx, `!!document.querySelector('.aw-dossier-stage .aw-hz-xs')`, 90_000);
  const c = await layout(ctx);
  note('P5 ?xsview=schematic schlägt eine gemerkte Stimme „driver“: wieder der Querschnitt', ok && c.xsN === 1 && c.dvN === 0 && c.stored === 'schematic', `${c.stored}`);
  off(); allErrors.push(...errors); await ctx.close();
}

// --- 3: ?xsfx= for both views (dev override), now and „ab“ ----------------------------------------------------
if (run('xsfx')) for (const [view, fx, want] of [['driver', 'nebel:2', /^Nebel · Stufe 2$/], ['schematic', 'nebel:2', /^Nebel · Stufe 2$/], ['driver', 'aqua:2:ab', /^Aquaplaning · ab \d\d:\d\d · Prognose$/], ['schematic', 'aqua:2:ab', /^Aquaplaning · ab \d\d:\d\d · Prognose$/]]) {
  const { ctx, errors, off } = await open(`${segUrl}${sep}xsview=${view}&xsfx=${fx}`);
  const ok = await until(ctx, view === 'driver' ? `!!document.querySelector('.aw-dv-tag')` : `[...document.querySelectorAll('.aw-hz-xs text')].some((t) => / · (Stufe|ab) /.test(t.textContent))`, 90_000);
  const c = await layout(ctx);
  note(`P6 ?xsview=${view}&xsfx=${fx}: die erzwungene Szene trägt die Marke`, ok && want.test(c.tag ?? ''), `„${c.tag}“`);
  if (fx.endsWith(':ab')) await shot(ctx, `p6-${view}-ab`, '.aw-hz-xsgrid');
  off(); allErrors.push(...errors); await ctx.close();
}

// --- 4: every hazard in the real page (driver view; `--all=1`) -----------------------------------------------
if (args.all && run('all')) {
  const HZ = [['reif', 2], ['nass', 2], ['glatteis', 2], ['schnee', 2], ['aqua', 2], ['nebel', 2], ['gischt', 2], ['sonne', 2], ['quer', 2], ['baum', 2], ['staub', 1], ['gewitter', 2], ['hagel', 2], ['blowup', 2], ['frost1', 2], ['sturz', 2]];
  let n = 0;
  for (const [id, lv] of HZ) {
    const { ctx, errors, off } = await open(segUrl, { store: { xsview: 'driver', awxsfx: `${id}:${lv}` } });
    if (await until(ctx, `!!document.querySelector('.aw-dossier-stage .aw-dv-tag')`, 90_000)) { await sleep(3000); await shot(ctx, `p7-desktop-${id}-${lv}`, '.aw-hz-xsgrid'); n++; }
    off(); allErrors.push(...errors); await ctx.close();
  }
  note('P7 alle 16 Gefahren in der echten Seite (1440 × 900, localStorage awxsfx): Szene mit Marke gerendert', n === HZ.length, `${n}/${HZ.length}`);
}

// --- 5: mobile 390 × 844 (DPR 3) ------------------------------------------------------------------------------
if (run('mobile')) for (const [view, fx] of [['schematic', null], ['driver', null], ['driver', 'gischt:2'], ['driver', 'nebel:2:ab']]) {
  const { ctx, errors, off } = await open(segUrl, { width: 390, height: 844, mobile: true, store: { xsview: view, ...(fx ? { awxsfx: fx } : {}) } });
  const sel = view === 'driver' ? '.aw-m-dossier .aw-dv-scene' : '.aw-m-dossier .aw-hz-xs';
  const ok = await until(ctx, `!!document.querySelector(${JSON.stringify(sel)})`, 90_000);
  await sleep(1200);
  const m = JSON.parse(await ctx.evaluate(`JSON.stringify((() => { const d = document.querySelector('.aw-dv'); if (!d) return { dv: false, sw: document.documentElement.scrollWidth };
    const s = d.querySelector('.aw-dv-stage').getBoundingClientRect(), r = d.querySelector('.aw-dv-road').getBoundingClientRect(), c = d.querySelector('.aw-dv-cap').getBoundingClientRect();
    return { dv: true, stage: [Math.round(s.width), Math.round(s.height)], roadBelow: r.top >= s.bottom - 0.5, capInside: c.bottom <= s.bottom + 0.5 && c.top >= s.top, sw: document.documentElement.scrollWidth,
      minFont: Math.min(...[...d.querySelectorAll('*')].filter((e) => [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize))) }; })())`));
  if (view === 'driver') note(`P8 mobil 390 × 844${fx ? ` (${fx})` : ''}: Fahrerblick im Mobil-Dossier, das Fahrbahn-Feld steht unter dem Bild, die Note im Bild, Schrift ≥ 12 px, keine horizontale Scrollbreite`, ok && m.dv && m.roadBelow && m.capInside && m.minFont >= 12 && m.sw <= 390, JSON.stringify(m));
  else note('P8 mobil 390 × 844, Schalter aus: der Querschnitt wie bisher, kein .aw-dv', ok && !m.dv && m.sw <= 390, JSON.stringify(m));
  await shot(ctx, `p8-mobil-${view}${fx ? `-${fx.replace(/:/g, '-')}` : ''}`, view === 'driver' ? '.aw-dv' : '.aw-hz-xs');
  if (!fx) await shot(ctx, `p8-mobil-${view}-seite`);
  off(); allErrors.push(...errors); await ctx.close();
}

// --- 6: switching segments — both views in turn within this run (S D S D …), per click the time until the next frame ---
const stat = (a) => { const s = a.slice().sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: s.length, med: Math.round(q(0.5)), p90: Math.round(q(0.9)), max: Math.round(s[s.length - 1] ?? 0) }; };
if (run('tasks')) {
  const views = (args.views ?? 'schematic,driver').split(','), rounds = Number(args.rounds ?? 2), clicks = Number(args.clicks ?? 16);
  const frames = Object.fromEntries(views.map((v) => [v, []])), tasks = Object.fromEntries(views.map((v) => [v, []])), idleInfo = {}, inside = {};
  let okAll = true;
  for (let round = 0; round < rounds; round++) for (const view of views) {
    const store = view === 'schematic' ? { xsview: 'schematic' } : view === 'driver' ? { xsview: 'driver' } : { xsview: 'driver', awxsfx: view.split('+')[1] === 'gewitter' ? 'gewitter:3' : view.split('+')[1] };
    const { ctx, errors, off } = await open(segUrl, { store });
    okAll = (await until(ctx, `!!document.querySelector('.aw-dossier-stage ${view === 'schematic' ? '.aw-hz-xs' : '.aw-dv-scene'}')`, 90_000)) && okAll;
    await sleep(4000);
    /** One switch; resolves with the ms from the click to the frame after its render (JS + style + layout + paint + commit). */
    const click = (label) => ctx.evaluate(`(async () => { const b = document.querySelector('.aw-hz-nav [aria-label="${label}"]'); const t0 = performance.now(); b.click(); await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); return performance.now() - t0; })()`);
    // warm: lazy chunks, fonts, both neighbours once
    await click('Nächster Abschnitt'); await sleep(1200); await click('Vorheriger Abschnitt'); await sleep(1200);
    const r = await tasksDuring(ctx, async () => { for (let i = 0; i < clicks; i++) { frames[view].push(await click(i % 2 ? 'Vorheriger Abschnitt' : 'Nächster Abschnitt')); await sleep(700); } });
    okAll = r.ok && okAll;
    tasks[view].push(...r.tasks); inside[view] = r.inside;
    const idle = await tasksDuring(ctx, async () => { await sleep(3000); });
    idleInfo[view] = `≥ 50 ms ${idle.tasks.slice(0, 3).join(', ') || 'keine'}, Paint ${idle.paintMs} ms, Raster ${idle.rasterMs} ms`;
    off(); allErrors.push(...errors); await ctx.close();
  }
  const st = Object.fromEntries(views.map((v) => [v, stat(frames[v])]));
  for (const v of views) {
    const over = tasks[v].filter((t) => t > 200);
    note(`P9 Abschnittswechsel (${v}, ${st[v].n} Klicks in ${rounds} Sitzungen): Klick → nächster Frame im Median und p90 ≤ 200 ms`, okAll && st[v].p90 <= 200,
      `Median ${st[v].med} · p90 ${st[v].p90} · max ${st[v].max} ms · Hauptthread-Aufgaben > 200 ms: ${over.length ? over.join(', ') : 'keine'} · in Ruhe (3 s): ${idleInfo[v]} · längste Aufgabe: ${inside[v]}`);
  }
  if (st.schematic && st.driver) note('P9b Fahrerblick gegen Querschnitt, selber Lauf: der Median des Abschnittswechsels steigt um höchstens 50 ms', st.driver.med - st.schematic.med <= 50, `Median ${st.schematic.med} → ${st.driver.med} ms (${st.driver.med - st.schematic.med >= 0 ? '+' : ''}${st.driver.med - st.schematic.med}) · p90 ${st.schematic.p90} → ${st.driver.p90} ms`);
}

// --- 7: the cost of ONE scene, without React and data (`--gallery=<dir>` of verify:road-driver --dump): take the scene out, put it back, wait for the frame ---
if (args.gallery && run('scene')) {
  const { pathToFileURL } = await import('node:url');
  for (const [file, width, height, mobile] of [['stufen-desktop.html', 1440, 900, false], ['gefahren-mobil.html', 390, 844, true], ['zustaende-mobil.html', 390, 844, true]]) {
    const ctx = await browser.newContext({ width, height, mobile });
    await motion(ctx);
    const loaded = browser.waitFor((m) => m.sessionId === ctx.sessionId && m.method === 'Page.loadEventFired');
    await ctx.send('Page.navigate', { url: pathToFileURL(join(resolve(args.gallery), file)).href });
    await loaded;
    await ctx.evaluate('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 1500)))');
    const rows = JSON.parse(await ctx.evaluate(`(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const out = [];
      for (const fig of document.querySelectorAll('figure')) {
        fig.scrollIntoView({ block: 'center' }); await frame();
        const dv = fig.querySelector('.aw-dv'), html = dv.outerHTML; let best = Infinity;
        for (let k = 0; k < 3; k++) { fig.querySelector('.aw-dv').remove(); await frame(); const t0 = performance.now(); fig.insertAdjacentHTML('beforeend', html); await frame(); best = Math.min(best, performance.now() - t0); }
        out.push([fig.querySelector('figcaption').textContent, Math.round(best)]);
      }
      return JSON.stringify(out);
    })()`));
    const ms = rows.map((r) => r[1]), s = stat(ms), slow = rows.slice().sort((a, b) => b[1] - a[1]).slice(0, 3).map((r) => `${r[0]} ${r[1]} ms`).join(' · ');
    note(`P11 eine Szene neu einsetzen (${file.replace('.html', '')}, ${width} × ${height}${mobile ? ', DPR 3' : ''}, ${s.n} Szenen, bester von 3): Einsetzen → nächster Frame ≤ 200 ms`, s.max <= 200, `Median ${s.med} · p90 ${s.p90} · max ${s.max} ms · langsamste: ${slow}`);
    await ctx.close();
  }
}

// --- 8: what ONE scene paints at rest — each scene alone on the page for 2 s, both views (`--gallery=<dir>`) ---------------
if (args.gallery && run('idle')) {
  const { pathToFileURL } = await import('node:url');
  const table = {};
  for (const [file, key] of [['querschnitt-desktop.html', 'schematic'], ['gefahren-desktop.html', 'driver']]) {
    const ctx = await browser.newContext({ width: 1440, height: 900 });
    await motion(ctx);
    const loaded = browser.waitFor((m) => m.sessionId === ctx.sessionId && m.method === 'Page.loadEventFired');
    await ctx.send('Page.navigate', { url: pathToFileURL(join(resolve(args.gallery), file)).href });
    await loaded;
    await ctx.evaluate('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 1000)))');
    const n = await ctx.evaluate('document.querySelectorAll("figure").length');
    for (let i = 0; i < n; i++) {
      const name = await ctx.evaluate(`(() => { const f = [...document.querySelectorAll('figure')]; f.forEach((x, k) => { x.style.display = k === ${i} ? '' : 'none'; }); return f[${i}].querySelector('figcaption').textContent.split(' · ')[0].replace('Gefahr: ', ''); })()`);
      await sleep(400);
      const anim = await ctx.evaluate('document.getAnimations().filter((a) => a.playState === "running").length');
      const r = await tasksDuring(ctx, async () => { await sleep(2000); });
      (table[name] ??= {})[key] = { paint: Math.round(r.paintN / 2), ms: r.paintMs / 2, anim, long: r.tasks.length };
    }
    await ctx.close();
  }
  const rows = Object.entries(table), sum = (k) => rows.reduce((a, [, v]) => a + (v[k]?.paint ?? 0), 0);
  const still = rows.filter(([, v]) => v.driver?.paint === 0).map(([k]) => k), paints = rows.filter(([, v]) => v.driver?.paint > 0).map(([k, v]) => `${k} ${v.driver.paint}`);
  note('P12 in Ruhe, jede Szene allein für 2 s: der Fahrerblick malt auf dem Hauptthread seltener als der Querschnitt (Paint-Ereignisse je Sekunde); keine Aufgabe ≥ 50 ms',
    rows.length === 16 && rows.every(([, v]) => v.driver && v.schematic && v.driver.long === 0) && rows.filter(([, v]) => v.driver.anim > 0).length >= 15 && (args.reduce ? true : sum('schematic') > 0) && sum('driver') <= sum('schematic'),
    `laufende Animationen: Querschnitt ${rows.reduce((a, [, v]) => a + v.schematic.anim, 0)}, Fahrerblick ${rows.reduce((a, [, v]) => a + v.driver.anim, 0)} · Paint-Ereignisse je Sekunde, Summe der 16 Szenen: Querschnitt ${sum('schematic')} → Fahrerblick ${sum('driver')} (Malzeit ${rows.reduce((a, [, v]) => a + v.schematic.ms, 0).toFixed(1)} → ${rows.reduce((a, [, v]) => a + v.driver.ms, 0).toFixed(1)} ms/s) · Fahrerblick ohne Malen (nur Compositor): ${still.join(', ') || '—'} · Fahrerblick mit Malen (je s): ${paints.join(', ') || '—'} · Querschnitt je Szene (je s): ${rows.map(([k, v]) => `${k} ${v.schematic?.paint}`).join(', ')}`);
}

const own = allErrors.filter((e) => /aw-dv|RoadDriverView|RoadHazardDetail|RoadCrossSection|roadFlag/i.test(e));
note('P10 Konsole: keine ungefangene Ausnahme und kein console.error in allen Abläufen', allErrors.length === 0, allErrors.length ? `${allErrors.length} Meldungen, davon aus dieser Phase: ${own.length} · ${[...new Set(allErrors)].slice(0, 3).join(' | ')}` : 'sauber');

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\ndv page — ${results.length - failed}/${results.length}${failed ? ` (${failed} FEHLER)` : ''} · PNG → ${OUT}`);
process.exit(failed ? 1 : 0);
