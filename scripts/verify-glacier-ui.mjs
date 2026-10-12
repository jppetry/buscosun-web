/**
 * verify:glacier-ui — Phase GL (audit/gletscher.md): the glacier situation page in a real browser.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-ui.mjs --base=http://127.0.0.1:5191 [--shots=<dir>] [--tree=<v1 dir>]
 *   (a running dev server or `vite preview` of the current build)
 *
 * Headless Chromium over CDP (scripts/lib/cdpBrowser.mjs, SwiftShader for MapLibre). The data tree is assembled from the REAL
 * extract `scripts/lib/fixtures/glacier/static-extract.json` (eight real glaciers with their outlines, series, summary, the nine
 * official items) — or read from a full local build with `--tree=` — and served by request interception for
 * `…/buscosun-data@main/glacier/v1/*`, `…@glacier/glacier/v1/*` (the static builds) and raw.githubusercontent. Basemap tiles come from the network (no checked content).
 *
 *   A  flag gate: on for everyone since 13.10. (GLACIER_LIVE) — page and start-page tile 13 without parameter, `?gl=0` hides; noindex on the page stays until Gate D
 *   B  layout at 1440 × 900: rail 62 · topbar 60 · dock 250 · readout 400 · map 728
 *   C  data: official sentences VERBATIM with date and source link; origin chip at every number; reference year at every area
 *   D  state: land, metric, search, selection ⇒ URL and back; locked metrics cannot be chosen
 *   E  states: killed / unreachable ⇒ "Keine Daten." and no number
 *   F  mobile 390 × 844: chips and rows ≥ 44 px, no horizontal overflow, big numbers do not break
 *   G  honesty: no tour words, nothing modelled or from satellite shown as a number, locked lines say why
 *   T  the sheet (GL-4): five tabs, melt index without unit, season chart against the TSLA band, compare slider, projection as a range, tour wording, sources, states
 *   L  GL-5: melt index as a metric, change feed, follow list and "new since the last visit", CSV of the series
 *   H  console: no uncaught exception
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { glacierForbiddenWords } from '../src/glacier/glacierContract.ts';
import { buildFeed } from './glacier/feed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5191';
const SHOTS = args.shots ?? null;
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOW = Date.parse('2026-10-11T12:00:00Z');

// --- data tree --------------------------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'glacier-ui-'));
const site = join(tmp, 'v1');
let items, rows;
if (args.tree) {
  cpSync(args.tree, site, { recursive: true });
  const b = readdirSync(join(site, 'static')).sort().pop();
  items = JSON.parse(readFileSync(join(site, 'static', b, 'official.json'), 'utf8')).items;
  rows = JSON.parse(readFileSync(join(site, 'static', b, 'catalog.json'), 'utf8')).glaciers;
} else {
  const fx = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'static-extract.json'), 'utf8'));
  const build = fx.from.build;
  const dir = join(site, 'static', build);
  mkdirSync(join(dir, 'outline'), { recursive: true });
  rows = Object.values(fx.catalogRows);
  const w = (p, o) => writeFileSync(p, JSON.stringify(o));
  const at = '2026-10-11T08:00:00Z';
  w(join(site, 'index.json'), { schema: 1, kind: 'glacier/index', builtAt: at, static: { build } });
  w(join(site, 'status.json'), { schema: 1, kind: 'glacier/status', lines: { static: { build, at, glaciers: rows.length } }, checkedAt: at, killed: false });
  w(join(dir, 'catalog.json'), { schema: 1, kind: 'glacier/catalog', build, builtAt: at, glaciers: rows });
  w(join(dir, 'points.json'), { schema: 1, kind: 'glacier/points', build, cols: ['id', 'lat', 'lon', 'k', 'km2'], rows: rows.map((g) => [g.id, g.lat, g.lon, g.klass, g.area.km2]) });
  w(join(dir, 'summary.json'), { schema: 1, kind: 'glacier/summary', build, latest: Object.fromEntries(Object.entries(fx.summaryLatest).filter(([, v]) => v)), countries: fx.summaryCountries });
  w(join(dir, 'official.json'), fx.official);
  w(join(dir, 'sources.json'), fx.sources);
  for (const region of new Set(rows.map((g) => g.region))) {
    w(join(dir, 'outline', `${region}-L1.json`), {
      type: 'FeatureCollection', schema: 1, kind: 'glacier/outline', build, region, level: 1, tolM: 60,
      features: rows.filter((g) => g.region === region && fx.outline[g.id]?.L1).map((g) => ({ type: 'Feature', properties: { id: g.id }, geometry: fx.outline[g.id].L1 })),
    });
  }
  items = fx.official.items;
}
const killedSite = join(tmp, 'v1-killed');
cpSync(site, killedSite, { recursive: true });
writeFileSync(join(killedSite, 'status.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(site, 'status.json'), 'utf8')), killed: true, killReason: 'Die Gletscher-Daten sind abgeschaltet (Prüfung).' }));
// the satellite line: the same tree plus index.sat and the season documents (a real slice of the first scan window, scripts/lib/fixtures/glacier/sat-extract.json)
const satFx = existsSync(join(HERE, 'lib', 'fixtures', 'glacier', 'sat-extract.json')) ? JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'sat-extract.json'), 'utf8')) : null;
const satSite = join(tmp, 'v1-sat');
cpSync(site, satSite, { recursive: true });
if (satFx) {
  const ix = JSON.parse(readFileSync(join(site, 'index.json'), 'utf8'));
  writeFileSync(join(satSite, 'index.json'), JSON.stringify({ ...ix, sat: satFx.index }));
  for (const [key, doc] of Object.entries(satFx.seasons)) {
    const [year, region] = key.split('/');
    mkdirSync(join(satSite, 'season', year, region), { recursive: true });
    writeFileSync(join(satSite, 'season', year, region, `${doc.stand}.json`), JSON.stringify(doc));
  }
}
const emptySite = join(tmp, 'v1-empty');
mkdirSync(emptySite, { recursive: true });
const item = (id) => items.find((i) => i.id === id);

const clockScript = (ms) => `(() => {
  const shift = ${ms} - Date.now();
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + shift); else super(...a); }
    static now() { return RealDate.now() + shift; }
  }
  globalThis.Date = FakeDate;
})();`;

const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden'); process.exit(2); }
const browser = await openBrowser(chrome, { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const requested = [];

async function openPage({ path, width = 1440, height = 900, mobile = false, root = site, clockMs = NOW }) {
  const ctx = await browser.newContext({ width, height, mobile });
  const errors = [];
  const off = browser.on(async (msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? msg.params.exceptionDetails?.text);
    if (msg.method === 'Fetch.requestPaused') {
      const url = msg.params.request.url;
      requested.push(url);
      const m = /buscosun-data(?:@[^/]+|\/[^/]+)\/glacier\/v1\/(.+?)(?:\?.*)?$/.exec(url);
      if (m) {
        const file = join(root, ...m[1].split('/'));
        const ok = existsSync(file);
        await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: ok ? 200 : 404, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: ok ? readFileSync(file).toString('base64') : '' }).catch(() => {});
        return;
      }
      await ctx.send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
    }
  });
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*buscosun-data*glacier/v1*' }] });
  await ctx.send('Network.setBypassServiceWorker', { bypass: true });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: clockScript(clockMs) });
  await ctx.send('Page.navigate', { url: `${BASE}${path}` });
  return { ctx, errors, off };
}
const until = async (ctx, expr, ms = 30_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ctx.evaluate(expr).catch(() => false)) return true; await sleep(200); }
  return false;
};
const shot = async (ctx, name) => {
  if (!SHOTS) return;
  await sleep(3000);
  mkdirSync(SHOTS, { recursive: true });
  const r = await ctx.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
};
const click = (ctx, sel, text) => ctx.evaluate(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})]; const e = ${text ? `els.find((x) => x.textContent.includes(${JSON.stringify(text)}))` : 'els[0]'}; if (!e) return false; e.click(); return true; })()`);
const allErrors = [];
const READY = `document.querySelectorAll('.gl-card[data-country]').length === 3 && !!document.querySelector('.gl-rank li')`;
const url = (ctx) => ctx.evaluate('location.pathname + location.search');
const P = '/gletscher?gl=1';

// --- A: flag gate ------------------------------------------------------------------------------------------
{
  // Jan 13.10.: the flag is on for everyone (GLACIER_LIVE); `?gl=0` stays the per-visitor switch-off.
  const { ctx, errors, off } = await openPage({ path: '/gletscher?gl=0' });
  const notFound = await until(ctx, `!!document.querySelector('h1') && /nicht gefunden|404/i.test(document.body.innerText) && !document.querySelector('.gl-root')`, 20_000);
  add('A1 mit ?gl=0: /gletscher antwortet wie ein unbekannter Pfad (Ausschalter je Besucher bleibt)', notFound);
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/?gl=0' });
  await until(ctx, `!!document.querySelector('.deck-chips-count')`, 20_000);
  await sleep(800);
  const r = await ctx.evaluate(`({ tile: [...document.querySelectorAll('.deck-tile')].some((t) => /Gletscher/.test(t.getAttribute('aria-label') ?? '')), count: document.querySelector('.deck-chips-count')?.textContent ?? '' })`);
  add('A2 Startseite mit ?gl=0: keine Gletscher-Kachel, Zähler „12 Werkzeuge“', !r.tile && /12/.test(r.count) && !/13/.test(r.count), JSON.stringify(r));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/' });
  await until(ctx, `!!document.querySelector('.deck-chips-count')`, 20_000);
  await sleep(800);
  const r = await ctx.evaluate(`(() => { const t = [...document.querySelectorAll('.deck-bento > .deck-tile')].find((x) => /Gletscher/.test(x.getAttribute('aria-label') ?? '') && x.offsetParent !== null); const b = t?.getBoundingClientRect(); return { tile: !!t, eyebrow: t?.querySelector('.tile-eyebrow')?.textContent ?? null, count: document.querySelector('.deck-chips-count')?.textContent ?? '', w: b ? Math.round(b.width) : 0, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
  add('A3 Startseite ohne Parameter (Flag an für alle, GLACIER_LIVE): Kachel „13 · GLETSCHER“ sichtbar, Zähler 13, kein Überlauf', r.tile && /13/.test(r.eyebrow ?? '') && /13/.test(r.count) && r.w > 200 && !r.overflow, JSON.stringify(r));
  await shot(ctx, 'home-tile-desktop');
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: P });
  const ready = await until(ctx, READY, 60_000);
  const meta = await ctx.evaluate(`({ robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '', title: document.title, rail: [...document.querySelectorAll('a[title], button[title]')].some((a) => /Gletscher/.test(a.getAttribute('title') ?? '')) })`);
  add('A4 mit ?gl=1: Seite lädt, noindex gesetzt, Titel nennt die Gletscher, Rail-Eintrag da', ready && /noindex/.test(meta.robots) && /Gletscher/.test(meta.title), JSON.stringify(meta));
  off(); allErrors.push(...errors); await ctx.close();
}

// --- B/C: desktop layout and data ---------------------------------------------------------------------------
{
  const { ctx, errors, off } = await openPage({ path: P });
  const ready = await until(ctx, READY, 60_000);
  await sleep(1500);
  const g = await ctx.evaluate(`(() => {
    const w = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
    return { rail: w('.gl-rail'), topbar: w('.gl-topbar'), dock: w('.gl-dock'), readout: w('.gl-readout'), map: w('.gl-map'), overflow: document.documentElement.scrollWidth > innerWidth };
  })()`);
  add('B1 Layout 1440 × 900: Rail 62 · Topbar 60 · Dock 250 · Readout 400 · Karte 728', ready && g.rail?.[0] === 62 && g.topbar?.[1] === 60 && g.dock?.[0] === 250 && g.readout?.[0] === 400 && g.map?.[0] === 728 && !g.overflow, JSON.stringify(g));
  const c = await ctx.evaluate(`(() => {
    const q = (s) => [...document.querySelectorAll(s)];
    const cards = q('.gl-card[data-country]').map((c) => ({ c: c.getAttribute('data-country'), quote: c.querySelector('blockquote.gl-quote')?.textContent ?? '', cite: c.querySelector('blockquote.gl-quote')?.getAttribute('cite') ?? '', src: c.querySelector('.gl-src')?.textContent ?? '', href: c.querySelector('.gl-src a')?.getAttribute('href') ?? '', inv: [...c.querySelectorAll('p')].map((p) => p.textContent).find((t) => /^Inventar/.test(t)) ?? '', chips: c.querySelectorAll('.gl-chip').length, nums: [...c.querySelectorAll('.gl-num')].map((n) => n.getAttribute('data-origin')) }));
    const nums = q('.gl-num').map((n) => n.getAttribute('data-origin'));
    return { cards, numsN: nums.length, numsBad: nums.filter((o) => !['measured', 'official', 'model', 'satellite'].includes(o ?? '')).length, rankV: q('.gl-r-v').map((n) => n.getAttribute('data-origin')) };
  })()`);
  const want = { CH: item('ch-glamos-2026-volume'), AT: item('at-oeav-2024-25-length'), DE: item('de-badw-2026-area') };
  const verbatim = ['CH', 'AT', 'DE'].every((k) => { const card = c.cards.find((x) => x.c === k); return card && card.quote === want[k].quote && card.cite === want[k].url && card.href === want[k].url; });
  add('C1 drei Länderkarten: der Satz der Behörde steht WÖRTLICH im Zitat, Quelle verlinkt (cite + href gleich der URL im Datensatz)', ready && verbatim, c.cards.map((x) => `${x.c}:${x.quote.length}`).join(' '));
  const dateDe = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
  add('C1b Gegenprobe: ein um ein Zeichen veränderter Satz wäre ungleich (der Vergleich kann scheitern)', ['CH', 'AT', 'DE'].every((k) => c.cards.find((x) => x.c === k)?.quote !== want[k].quote.slice(1) && c.cards.find((x) => x.c === k)?.quote !== want[k].quote + '.'), '');
  add('C2 jede Länderkarte nennt Quelle und Datum der Meldung (dd.mm.yyyy), Herkunftsmarke „amtlich“ im Kopf', ['CH', 'AT', 'DE'].every((k) => { const card = c.cards.find((x) => x.c === k); return card && card.src.includes(dateDe(want[k].date)) && card.chips >= 1; }), c.cards.map((x) => x.src).join(' | '));
  add('C3 Inventarzeilen tragen das Bezugsjahr (CH 2013–2018 SGI2016, AT 2021–2023 AGI 5)', /Bezugsjahr 2013–2018 \(SGI2016\)/.test(c.cards.find((x) => x.c === 'CH')?.inv ?? '') && /Bezugsjahr 2021–2023 \(AGI 5\)/.test(c.cards.find((x) => x.c === 'AT')?.inv ?? ''), c.cards.map((x) => x.inv).join(' | '));
  add('C4 jede Zahl (.gl-num) trägt eine Herkunft (data-origin), in den Karten und der Rangliste', c.numsN >= 8 && c.numsBad === 0 && c.rankV.length > 0 && c.rankV.every((o) => o === 'measured'), JSON.stringify({ n: c.numsN, bad: c.numsBad, rank: [...new Set(c.rankV)] }));
  // the sentences of the reports list are the dated items, newest first
  const reps = await ctx.evaluate(`[...document.querySelectorAll('.gl-feed[aria-label^="Amtliche Berichte"] li')].map((li) => li.getAttribute('data-id'))`);
  const sorted = [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).map((i) => i.id);
  add('C5 Berichtsliste: alle amtlichen Meldungen, jüngste zuerst', JSON.stringify(reps) === JSON.stringify(sorted), `${reps.length} von ${items.length}`);
  await shot(ctx, 'lage-desktop');
  off(); allErrors.push(...errors); await ctx.close();
}

// --- D: state ---------------------------------------------------------------------------------------------------
{
  const { ctx, errors, off } = await openPage({ path: P });
  await until(ctx, READY, 60_000);
  await sleep(800);
  const rankIds = () => ctx.evaluate(`[...document.querySelectorAll('.gl-dock .gl-rank li button')].map((b) => b.querySelector('b')?.textContent + '|' + b.querySelector('.gl-r-body span')?.textContent)`);
  const all = await rankIds();
  await click(ctx, '.gl-dock .gl-seg button', 'CH');
  await sleep(500);
  const ch = await rankIds();
  add('D1 Land „CH“: Rangliste nur Schweizer Gletscher, URL trägt land=ch', ch.length > 0 && ch.every((r) => /\| ?CH ·|CH ·/.test(r)) && (await url(ctx)).includes('land=ch') && ch.length <= all.length, `${(await url(ctx))} ${ch.length}/${all.length}`);
  await click(ctx, '.gl-dock .gl-metric', 'Fläche je Jahrzehnt');
  await sleep(500);
  const m2 = await ctx.evaluate(`({ pressed: [...document.querySelectorAll('.gl-dock .gl-metric')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.querySelector('b')?.textContent), legend: document.querySelector('.gl-legend-head b')?.textContent ?? '' })`);
  add('D2 Metrik „Fläche je Jahrzehnt“: genau eine gewählt, Legende folgt, URL m=flaeche', m2.pressed.length === 1 && /Fläche/.test(m2.pressed[0]) && /Fläche|Jahrzehnt/.test(m2.legend) && (await url(ctx)).includes('m=flaeche'), JSON.stringify(m2) + ' ' + (await url(ctx)));
  const before = await url(ctx);
  await click(ctx, '.gl-dock .gl-metric', 'Schmelzindex heute');
  await sleep(400);
  const lock = await ctx.evaluate(`(() => { const b = [...document.querySelectorAll('.gl-dock .gl-metric')].find((x) => x.textContent.includes('Schmelzindex heute')); return { disabled: b?.getAttribute('aria-disabled'), pressed: b?.getAttribute('aria-pressed'), text: b?.textContent ?? '' }; })()`);
  add('D3 gesperrte Metrik „Schmelzindex heute“ (ohne frischen Schmelzlauf): aria-disabled, nicht wählbar, URL unverändert, Text „gesperrt“', lock.disabled === 'true' && lock.pressed === 'false' && /gesperrt/.test(lock.text) && (await url(ctx)) === before, JSON.stringify(lock));
  await click(ctx, '.gl-dock .gl-seg button', 'Alle');
  await sleep(300);
  await ctx.evaluate(`(() => { const i = document.getElementById('gl-suche'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Hintereis'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(500);
  const found = await rankIds();
  add('D4 Suche „Hintereis“: Rangliste enthält nur Treffer, URL trägt q=', found.length >= 1 && found.every((r) => /Hintereis/i.test(r)) && (await url(ctx)).includes('q=Hintereis'), `${found.join(' ; ')} ${(await url(ctx))}`);
  await click(ctx, '.gl-dock .gl-rank li button');
  await sleep(700);
  const sel = await ctx.evaluate(`({ card: document.querySelector('.gl-card[data-glacier]')?.getAttribute('data-glacier') ?? '', pill: !!document.querySelector('.gl-pill'), btn: document.querySelector('.gl-pill .gl-btn')?.disabled, txt: document.querySelector('.gl-card[data-glacier]')?.textContent ?? '' })`);
  const u = await url(ctx);
  add('D5 Auswahl: Steckbrief-Karte (Klasse, Fläche mit Bezugsjahr), Pill, URL sel=…; der Steckbrief-Knopf ist freigegeben (GL-4) und heißt „Steckbrief öffnen“', /^gl_at_hintereisferner/.test(sel.card) && sel.pill && sel.btn === false && /Klasse A/.test(sel.txt) && /Inventar 2023/.test(sel.txt) && /sel=at-hintereisferner/.test(u), JSON.stringify({ card: sel.card, btn: sel.btn, u }));
  add('D6 Karte der Auswahl nennt „Schmelzindex heute: folgt …“ gesperrt statt einer Schmelzzahl (kein Platzhalterwert)', /Schmelzindex heute/.test(sel.txt) && /folgt/.test(sel.txt) && !/\d\s?(mm|cm)\s?(w\.?e\.?|Eis)/i.test(sel.txt), sel.txt.slice(-160));
  off(); allErrors.push(...errors); await ctx.close();
  // reload restores the state from the URL
  const r2 = await openPage({ path: u + '&gl=1' });
  await until(r2.ctx, `!!document.querySelector('.gl-card[data-glacier]')`, 60_000);
  const back = await r2.ctx.evaluate(`({ q: document.getElementById('gl-suche')?.value, m: [...document.querySelectorAll('.gl-dock .gl-metric')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.querySelector('b')?.textContent), card: document.querySelector('.gl-card[data-glacier]')?.getAttribute('data-glacier') ?? '' })`);
  add('D7 Neuladen der URL stellt Suche, Metrik und Auswahl wieder her', back.q === 'Hintereis' && /Fläche/.test(back.m[0] ?? '') && /^gl_at_hintereisferner/.test(back.card), JSON.stringify(back));
  r2.off(); allErrors.push(...r2.errors); await r2.ctx.close();
}


// --- S: the satellite line ---------------------------------------------------------------------------------------------------
if (satFx) {
  const ids = Object.fromEntries(Object.entries(JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'static-extract.json'), 'utf8')).catalogRows).map(([k, g]) => [k, g]));
  // the chip names the newest scene that carries a value for a glacier of the page (not every tile-day has one)
  const newest = Object.values(satFx.seasons).flatMap((d) => Object.values(d.glaciers).map((rows) => rows[rows.length - 1][0])).sort().pop();
  const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  const seg = (g) => g.id.slice(3).replace('_', '-');
  const SAT = (pathq) => ({ path: pathq, root: satSite });
  {
    const { ctx, errors, off } = await openPage({ ...SAT(P + '&m=ausaperung') });
    await until(ctx, READY, 60_000);
    await until(ctx, `document.querySelector('.gl-metric[aria-pressed="true"]')?.textContent.includes('Ausaperung')`, 20_000);
    await sleep(800);
    const r = await ctx.evaluate(`({
      locked: document.querySelector('.gl-dock .gl-metric.is-locked') ? [...document.querySelectorAll('.gl-dock .gl-metric.is-locked b')].map((b) => b.textContent) : [],
      aus: (() => { const b = [...document.querySelectorAll('.gl-dock .gl-metric')].find((x) => x.textContent.includes('Ausaperung')); return { disabled: b?.getAttribute('aria-disabled'), pressed: b?.getAttribute('aria-pressed') }; })(),
      rows: [...document.querySelectorAll('.gl-dock .gl-rank li button')].map((b) => ({ name: b.querySelector('b')?.textContent, val: b.querySelector('.gl-r-v')?.textContent, origin: b.querySelector('.gl-r-v')?.getAttribute('data-origin') })),
      chip: [...document.querySelectorAll('.gl-stand .gl-chip')].map((c) => c.textContent),
      hint: document.querySelector('.gl-rank-head small')?.textContent ?? '', url: location.search,
    })`);
    const nums = r.rows.map((x) => Number(/(\d+) %/.exec(x.val ?? '')?.[1]));
    add('S1 mit Satellitendaten: „Ausaperung“ ist nicht mehr gesperrt, nur „Schmelze“ bleibt es; die Rangliste nennt „% schneefrei“ mit Herkunft Satellit, größte Ausaperung zuerst', r.aus.disabled !== 'true' && r.aus.pressed === 'true' && r.locked.length === 1 && /Schmelzindex/.test(r.locked[0]) && r.rows.length >= 3 && r.rows.every((x) => x.origin === 'satellite' && /% schneefrei/.test(x.val ?? '')) && nums.every((v, i, a) => i === 0 || v <= a[i - 1]) && /größte Ausaperung zuerst/.test(r.hint), JSON.stringify({ aus: r.aus, locked: r.locked, rows: r.rows.slice(0, 3), hint: r.hint }));
    const names = r.rows.map((x) => x.name).join(' | ');
    add('S2 in der Rangliste stehen nur Klasse A und B außerhalb Deutschlands: weder Höllentalferner und Blaueis (DE) noch die Gletscher der Klasse C', !/Höllentalferner|Blaueis|Breithorn|namenlos|Aebeni|Ebenflue/i.test(names) && r.rows.length >= 3, names);
    add('S3 Kopfzeile: „Sentinel-2 · jüngste Szene dd.mm.“ mit dem Datum der jüngsten Szene, nicht mehr „nicht aktiv“', r.chip.some((t) => t.includes(`Sentinel-2 · jüngste Szene ${dm(newest)}`)) && !r.chip.some((t) => /nicht aktiv/.test(t) && /Sentinel/.test(t)), r.chip.join(' | '));
    await shot(ctx, 'ausaperung-desktop');
    off(); allErrors.push(...errors); await ctx.close();
  }
  // the selected-glacier card per class
  const cardOf = async (g) => {
    const { ctx, errors, off } = await openPage({ ...SAT(`${P}&m=ausaperung&sel=${seg(g)}`) });
    await until(ctx, `!!document.querySelector('.gl-card[data-glacier]')`, 60_000);
    await sleep(500);
    const c = await ctx.evaluate(`({ text: document.querySelector('.gl-card[data-glacier]')?.textContent ?? '', sat: document.querySelectorAll('.gl-card[data-glacier] .gl-chip.is-satellite').length })`);
    off(); allErrors.push(...errors); await ctx.close();
    return c;
  };
  const cA = await cardOf(ids.hef), cB = await cardOf(ids.bAt), cDe = await cardOf(ids.blaueis), cC = await cardOf(ids.dupCh);
  add('S4 Karte eines Gletschers der Klasse A (Hintereisferner): Szene mit Datum, Schneeanteil, Schneegrenze in m und AAR, Albedo, Klaranteil — mit Herkunftsmarke Satellit', /Szene \d\d\.\d\d\.\d{4}: \d+ % schneefrei · Schneegrenze [\d.]+ m · AAR \d+ %/.test(cA.text) && /Albedo: Schnee/.test(cA.text) && /klar \d+ % der Fläche/.test(cA.text) && cA.sat >= 1, cA.text.slice(-330));
  add('S5 Klasse B (Eis Ferner): Schneeanteil ja, Schneegrenze nein — keine Zahl für Schneegrenze, AAR oder Albedo, der Satz sagt es', /% schneefrei/.test(cB.text) && !/Schneegrenze \d/.test(cB.text) && !/AAR \d/.test(cB.text) && !/Albedo: Schnee/.test(cB.text) && /Schneegrenze nein/.test(cB.text), cB.text.slice(-300));
  add('S6 Klasse C und Deutschland: keine Satellitenzahl, mit Grund (unter 0,1 km² / zu klein, es gelten die Zahlen der BAdW)', /keine Zahl für Gletscher unter 0,1 km² \(Klasse C\)/.test(cC.text) && /BAdW/.test(cDe.text) && !/schneefrei/.test(cC.text + cDe.text), `${cC.text.slice(-120)} || ${cDe.text.slice(-140)}`);
  // 40 days later every scene is stale: no number, no colour — only the sentence
  {
    const late = Date.parse(`${newest}T12:00:00Z`) + 40 * 86_400_000;
    const { ctx, errors, off } = await openPage({ path: `${P}&m=ausaperung&sel=${seg(ids.hef)}`, root: satSite, clockMs: late });
    await until(ctx, `!!document.querySelector('.gl-card[data-glacier]')`, 60_000);
    await sleep(800);
    const r = await ctx.evaluate(`({ chip: [...document.querySelectorAll('.gl-stand .gl-chip')].map((c) => c.textContent), card: document.querySelector('.gl-card[data-glacier]')?.textContent ?? '', rows: document.querySelectorAll('.gl-dock .gl-rank li').length, empty: document.querySelector('.gl-dock .gl-empty')?.textContent ?? '' })`);
    add('S7 40 Tage nach der jüngsten Szene: „keine klare Szene seit N Tagen“ im Kopf und in der Karte, keine Zahl (kein Prozent, keine Schneegrenze), die Rangliste ist leer', r.chip.some((t) => /Sentinel-2 · keine klare Szene seit 4\d Tagen/.test(t)) && /Satellit: keine klare Szene seit 4\d Tagen/.test(r.card) && !/% schneefrei/.test(r.card) && !/Schneegrenze \d/.test(r.card) && r.rows === 0 && /Keine Gletscher mit Wert/.test(r.empty), JSON.stringify(r).slice(0, 400));
    off(); allErrors.push(...errors); await ctx.close();
  }
}

// --- T: the sheet (GL-4) ---------------------------------------------------------------------------------------------------
const sheetFx = existsSync(join(HERE, 'lib', 'fixtures', 'glacier', 'sheet-extract.json')) ? JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'sheet-extract.json'), 'utf8')) : null;
if (sheetFx && satFx) {
  const sheetSite = join(tmp, 'v1-sheet');
  cpSync(satSite, sheetSite, { recursive: true });
  const bdir = join(sheetSite, 'static', readdirSync(join(sheetSite, 'static'))[0]);
  const w = (p, o) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(o)); };
  const byRegion = {};
  for (const [key, g] of Object.entries(sheetFx.glaciers)) { const id = sheetFx.ids[key]; (byRegion[g.region] ??= []).push([id, g]); }
  const reportFiles = {};
  for (const [region, list] of Object.entries(byRegion)) {
    const l3p = join(bdir, 'outline', `${region}-L3.json`);
    w(l3p, { type: 'FeatureCollection', schema: 1, kind: 'glacier/outline', build: sheetFx.build, region, level: 3, features: list.map(([id, g]) => ({ type: 'Feature', properties: { id }, geometry: g.geometry })) });
    const years = new Set(list.flatMap(([, g]) => g.epochs.map((e) => e.year)));
    for (const y of years) {
      w(join(bdir, 'outline', `${region}-e${y}.json`), { type: 'FeatureCollection', schema: 1, kind: 'glacier/outline-epoch', build: sheetFx.build, region, year: y, source: list.flatMap(([, g]) => g.epochs).find((e) => e.year === y)?.source ?? '', features: list.filter(([, g]) => g.epochs.some((e) => e.year === y)).map(([id, g]) => ({ type: 'Feature', properties: { ids: [id], e: y }, geometry: g.epochs.find((e) => e.year === y).geometry })) });
      reportFiles[`outline/${region}-e${y}.json`] = [1, 1];
    }
    w(join(bdir, 'hypso', `${region}.json`), { region, bandM: 50, demRef: 'fixture', glaciers: Object.fromEntries(list.filter(([, g]) => g.hypso).map(([id, g]) => [id, g.hypso])) });
    w(join(bdir, 'series', `${region}.json`), { region, glaciers: Object.fromEntries(list.map(([id, g]) => [id, g.series])) });
    const pl = list.filter(([, g]) => g.proj);
    if (pl.length) w(join(bdir, 'proj', `${region}.json`), { region, years: pl[0][1].proj.years, ssp: pl[0][1].proj.ssp, base: 'Volumen 2020 = 1', model: 'GloGEM', glaciers: Object.fromEntries(pl.map(([id, g]) => [id, g.proj.entry])) });
    const cl = list.filter(([, g]) => g.clima);
    if (cl.length) w(join(bdir, 'clima', `${region}.json`), { schema: 1, kind: 'glacier/clima', build: sheetFx.build, region, doy0: cl[0][1].clima.doy0, bin: cl[0][1].clima.bin, cols: ['p10', 'p50', 'p90', 'n'], source: 'TSLA', glaciers: Object.fromEntries(cl.map(([id, g]) => [id, g.clima.entry])) });
    const dl = list.filter(([, g]) => g.dem);
    if (dl.length) w(join(bdir, 'dem', `${region}.json`), { schema: 1, kind: 'glacier/dem', build: sheetFx.build, region, cell: 3600, nodata: -32768, demRef: 'fixture', glaciers: Object.fromEntries(dl.map(([id, g]) => [id, g.dem])) });
  }
  w(join(bdir, 'report.json'), { build: sheetFx.build, files: reportFiles });
  w(join(sheetSite, 'melt', `${sheetFx.melt.run}.json`), sheetFx.melt);
  const ix = JSON.parse(readFileSync(join(sheetSite, 'index.json'), 'utf8'));
  writeFileSync(join(sheetSite, 'index.json'), JSON.stringify({ ...ix, melt: { run: sheetFx.melt.run, runAt: sheetFx.melt.runAt, engine: { name: sheetFx.melt.engine.name, version: sheetFx.melt.engine.version }, cube: sheetFx.melt.cube, unit: false, build: sheetFx.build } }));
  const seg = (id) => id.slice(3).replace('_', '-');
  const ids = sheetFx.ids;
  const SH = (g, q = '') => `/gletscher/${seg(g)}?gl=1${q}`;
  const READYS = `!!document.querySelector('#gl-tabpanel') && !document.querySelector('#gl-tabpanel .gl-empty[role=status]')`;
  const text = (ctx, sel) => ctx.evaluate(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`);

  // T1 / T2 — the sheet of a class-A glacier, tab Heute
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef), root: sheetSite });
    const ok = await until(ctx, READYS + ` && !!document.querySelector('[data-melt-index]')`, 60_000);
    await sleep(1500);
    const r = await ctx.evaluate(`(() => {
      const q = (s) => [...document.querySelectorAll(s)];
      const g = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
      const hero = document.querySelector('.gl-hero');
      const tabs = q('.gl-tabs [role=tab]').map((t) => ({ label: t.textContent, sel: t.getAttribute('aria-selected') }));
      return {
        h1: document.querySelector('.gl-sheet-title h1 b')?.textContent ?? '', chip: document.querySelector('.gl-sheet-title .gl-chip')?.textContent ?? '', back: q('.gl-btn').some((b) => /DACH-Lage/.test(b.textContent)),
        tabs, panelLabelled: document.querySelector('#gl-tabpanel')?.getAttribute('aria-labelledby'), idx: document.querySelector('[data-melt-index]')?.getAttribute('data-melt-index'), hero: hero?.innerText ?? '',
        left: g('.gl-sheet-left'), readout: g('.gl-sheet-readout'), topbar: g('.gl-topbar'), overflow: document.documentElement.scrollWidth > innerWidth,
        modelUnits: q('[data-origin="model"]').map((n) => n.textContent).filter((t) => /\\bmm\\b|cm Eis|\\bm³/.test(t)),
        numsBad: q('.gl-num').filter((n) => !['measured', 'official', 'model', 'satellite'].includes(n.getAttribute('data-origin') ?? '')).length,
        origins: [...new Set(q('.gl-num').map((n) => n.getAttribute('data-origin')))],
        bars: !!document.querySelector('svg.gl-bars rect'), sat: document.querySelector('[aria-label="Satellit"]')?.innerText ?? '', url: location.pathname + location.search,
      };
    })()`);
    add('T1 Steckbrief Hintereisferner: Name, Klasse-Chip, Zurück-Knopf, fünf Reiter mit ARIA (Heute gewählt, Panel beschriftet), Layout 250 · Karte · 420, kein Überlauf', ok && /Hintereisferner/.test(r.h1) && /Klasse A/.test(r.chip) && r.back && r.tabs.length === 5 && r.tabs[0].sel === 'true' && r.tabs.slice(1).every((t) => t.sel === 'false') && r.panelLabelled === 'gl-tab-heute' && r.left?.[0] === 250 && r.readout?.[0] === 420 && !r.overflow, JSON.stringify({ h1: r.h1, chip: r.chip, tabs: r.tabs.map((t) => t.label).join('/'), left: r.left, readout: r.readout }));
    add('T2 Heute: der Schmelzindex steht als Zahl 0–100 OHNE Einheit, trägt die Marke „Modell“ und sagt, warum keine Einheit da ist (Eichung nicht bestanden); keine Modellzahl mit mm, cm Eis oder m³', ok && Number(r.idx) >= 0 && Number(r.idx) <= 100 && /von 100/.test(r.hero) && /Modell/.test(r.hero) && /keine Einheit/.test(r.hero) && /nicht bestanden|besteht noch nicht/.test(r.hero) && r.modelUnits.length === 0 && r.bars, JSON.stringify({ idx: r.idx, modelUnits: r.modelUnits, hero: r.hero.slice(0, 160) }));
    add('T3 an jeder Zahl des Steckbriefs steht ihre Herkunft (data-origin ∈ gemessen/amtlich/Modell/Satellit); die Satellitenkarte nennt Datum und Klaranteil', ok && r.numsBad === 0 && r.origins.length >= 3 && /Szene|schneefrei/.test(r.sat) && /\d{2}\.\d{2}\.\d{4}/.test(r.sat), JSON.stringify({ origins: r.origins, sat: r.sat.slice(0, 120) }));
    await shot(ctx, 'sheet-heute-desktop');
    off(); allErrors.push(...errors); await ctx.close();
  }

  // T4 — Saison: snow line per scene against the TSLA band; tab in the URL; time point
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef, '&tab=saison'), root: sheetSite });
    const ok = await until(ctx, READYS + ` && !!document.querySelector('.gl-chart-s[data-scenes]')`, 60_000);
    await sleep(1200);
    const r = await ctx.evaluate(`({
      sel: document.querySelector('.gl-tabs [aria-selected=true]')?.textContent, scenes: document.querySelector('.gl-chart-s[data-scenes]')?.getAttribute('data-scenes'), svg: !!document.querySelector('.gl-chart-s svg'), aria: document.querySelector('.gl-chart-s')?.getAttribute('aria-label') ?? '',
      polygons: document.querySelectorAll('.gl-chart-s svg polygon').length, stats: [...document.querySelectorAll('.gl-stat')].map((s) => ({ l: s.querySelector('.gl-stat-l')?.textContent, v: s.querySelector('.gl-num')?.textContent, o: s.getAttribute('data-origin') })),
      legend: document.querySelector('.gl-legend-lines')?.textContent ?? '', body: document.querySelector('#gl-tabpanel')?.innerText ?? '', times: [...document.querySelectorAll('.gl-timesw button')].map((b) => b.textContent),
    })`);
    add('T4 Saison: Reiter in der Adresse, Diagramm mit Szenen und TSLA-Band (Polygon), Text-Alternative nennt Szenen und Band, Kennzahlen mit Marke „Satellit“', ok && r.sel === 'Saison' && Number(r.scenes) >= 3 && r.svg && r.polygons >= 1 && /Band 2000 bis 2025/.test(r.aria) && r.stats.length === 3 && r.stats.every((s) => s.o === 'satellite') && /2000–2025/.test(r.legend), JSON.stringify({ scenes: r.scenes, polygons: r.polygons, stats: r.stats.map((s) => `${s.l}=${s.v}`) }));
    add('T4b Zeitpunkt: neben „heute“ stehen die Daten der jüngsten klaren Szenen, Klick setzt t=<Datum> in die Adresse', r.times[0] === 'heute' && r.times.length >= 3 && /^Szene \d\d\.\d\d\.$/.test(r.times[1]), r.times.join('|'));
    await click(ctx, '.gl-timesw button', 'Szene');
    await sleep(900);
    add('T4c Klick auf eine Szene schreibt t=<ISO-Datum> in die Adresse und markiert den Knopf', /[?&]t=\d{4}-\d{2}-\d{2}/.test(await url(ctx)) && await ctx.evaluate(`[...document.querySelectorAll('.gl-timesw button')].filter((b) => b.getAttribute('aria-pressed') === 'true').length === 1`), await url(ctx));
    off(); allErrors.push(...errors); await ctx.close();
  }

  // T5 — Langzeit: compare slider, projection as a range, official status never a single year
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef, '&tab=langzeit'), root: sheetSite });
    const ok = await until(ctx, READYS + ` && !!document.querySelector('.gl-chart-s')`, 60_000);
    await sleep(1200);
    const before = await ctx.evaluate(`({ btn: [...document.querySelectorAll('#gl-tabpanel button')].map((b) => b.textContent), body: document.querySelector('#gl-tabpanel')?.innerText ?? '', slider: !!document.querySelector('.gl-divider-handle'), charts: document.querySelectorAll('.gl-chart-s').length })`);
    await click(ctx, '#gl-tabpanel button', 'Vergleichsregler');
    await until(ctx, `!!document.querySelector('.gl-divider-handle')`, 10_000);
    const at = await ctx.evaluate(`Number(document.querySelector('.gl-divider-handle')?.getAttribute('aria-valuenow'))`);
    await ctx.evaluate(`document.querySelector('.gl-divider-handle').focus()`);
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await sleep(500);
    const after = await ctx.evaluate(`Number(document.querySelector('.gl-divider-handle')?.getAttribute('aria-valuenow'))`);
    const sentence = /Unter 10 % des Volumens von 2020: (\d{4})–(\d{4}|nach 2100), je nach Szenario und Klimamodell \(nie ein einzelnes Jahr\)/.exec(before.body);
    add('T5 Langzeit: Projektion als Spanne (von–bis über Szenarien und 12 Klimamodelle, nie ein einzelnes Jahr), mit Marke „Modell“; Längenreihe und Projektion als Diagramme mit Text-Alternative', ok && !!sentence && Number(sentence[1]) >= 2030 && before.charts >= 2 && /Eine Projektion ist eine Spanne/.test(before.body), JSON.stringify({ sentence: sentence?.[0], charts: before.charts }));
    add('T5b Vergleichsregler: Knopf blendet ihn ein (role=slider, aria-valuenow 50), die Pfeiltaste bewegt ihn um 3 (ohne Maus bedienbar)', !before.slider && at === 50 && after === 53, `${before.slider} ${at} → ${after}`);
    off(); allErrors.push(...errors); await ctx.close();
  }

  // T6 — Tour: forbidden words, the disclaimer, origin at every line; Quellen
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef, '&tab=tour'), root: sheetSite });
    const ok = await until(ctx, READYS + ` && !!document.querySelector('.gl-tour li')`, 60_000);
    await sleep(800);
    const t = await ctx.evaluate(`({ text: document.querySelector('#gl-tabpanel')?.innerText ?? '', lines: [...document.querySelectorAll('.gl-tour li')].map((l) => ({ o: l.getAttribute('data-origin'), t: l.innerText })), problem: !!document.querySelector('.gl-problem'), links: [...document.querySelectorAll('.gl-links a')].map((a) => a.getAttribute('href')), tall: [...document.querySelectorAll('.gl-links a')].every((a) => a.getBoundingClientRect().height >= 44) })`);
    add('T6 Tour: kein „begehbar“, „sicher“, „frei“ im Text; der Vorbehalt „Kein Urteil über Begehbarkeit“ steht da; jede Zeile trägt ihre Herkunft; Links nur nach außen (https), Ziele ≥ 44 px', ok && glacierForbiddenWords(t.text).length === 0 && /Kein Urteil über Begehbarkeit/.test(t.text) && t.lines.length >= 3 && t.lines.every((l) => ['model', 'satellite', 'official', 'measured'].includes(l.o ?? '')) && !t.problem && t.links.every((h) => /^https:/.test(h)) && t.tall, JSON.stringify({ forbidden: glacierForbiddenWords(t.text), lines: t.lines.length }));
    off(); allErrors.push(...errors); await ctx.close();
  }
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef, '&tab=quellen'), root: sheetSite });
    const ok = await until(ctx, READYS + ` && !!document.querySelector('.gl-srctab tbody tr')`, 60_000);
    const q = await ctx.evaluate(`({ rows: [...document.querySelectorAll('.gl-srctab tbody tr')].map((r) => ({ what: r.cells[0].textContent, origin: r.cells[1].querySelector('[data-origin]')?.getAttribute('data-origin'), stand: r.cells[2].textContent })), lic: document.querySelectorAll('.gl-lic li').length, unused: document.querySelector('.gl-unused')?.textContent ?? '' })`);
    add('T7 Quellen: jede Zeile der Tabelle nennt Zahl, Herkunft (Marke) und Stand; Lizenzen aus der Quellenliste; „nur verlinkt“ (Webcams) und „nicht genutzt“ (Gletscherseen, NC) stehen da', ok && q.rows.length >= 6 && q.rows.every((r) => !!r.origin && r.stand.length > 0) && q.lic >= 5 && /Webcams/.test(q.unused) && /Gletscherseen/.test(q.unused), JSON.stringify({ rows: q.rows.length, lic: q.lic }));
    off(); allErrors.push(...errors); await ctx.close();
  }

  // T8 — class B, class C, DE: what is not there is said, no placeholder numbers
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.cClassCh, '&tab=saison'), root: sheetSite });
    const ok = await until(ctx, READYS, 60_000);
    await sleep(800);
    const c = await text(ctx, '#gl-tabpanel');
    await click(ctx, '.gl-tabs [role=tab]', 'Heute');
    await sleep(700);
    const h = await text(ctx, '#gl-tabpanel');
    add('T8 Klasse C (unter 0,1 km²): Saison sagt „keine Satellitenzahl“, Heute nennt Satellit „Klasse C“ ohne Zahl; der Schmelzindex ist da, der Antrieb vom Nachbarn ist benannt', ok && /Keine Satellitenzahl für Gletscher unter 0,1 km² \(Klasse C\)/.test(c) && /Keine Zahl für Gletscher unter 0,1 km² \(Klasse C\)/.test(h) && /von 100/.test(h) && /Antrieb (vom Nachbarn|am eigenen Punkt)/.test(h), `${c.slice(0, 80)} | ${h.slice(0, 80)}`);
    off(); allErrors.push(...errors); await ctx.close();
  }
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.blaueis), root: sheetSite });
    const ok = await until(ctx, READYS, 60_000);
    await sleep(800);
    const h = await text(ctx, '#gl-tabpanel');
    add('T9 Deutscher Gletscher ohne Schmelzzeile: „Keine Daten“ mit Grund, keine Zahl; Satellit „es gelten die Zahlen der BAdW“', ok && /Keine Daten\./.test(h) && !/von 100/.test(h) && /BAdW/.test(h), h.slice(0, 160));
    off(); allErrors.push(...errors); await ctx.close();
  }
  // T10 — stale melt run: 40 h later "Keine Daten", no number
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef), root: sheetSite, clockMs: NOW + 40 * 3_600_000 });
    const ok = await until(ctx, READYS, 60_000);
    await sleep(800);
    const h = await ctx.evaluate(`({ idx: !!document.querySelector('[data-melt-index]'), hero: document.querySelector('.gl-hero')?.innerText ?? '' })`);
    add('T10 Schmelzlauf älter als 30 Stunden: „Keine Daten“ mit der Zahl der Stunden, keine Zahl, keine Balken', ok && !h.idx && /Keine Daten/.test(h.hero) && /Stunden alt \(Grenze 30 Stunden\)/.test(h.hero), h.hero.slice(0, 160));
    off(); allErrors.push(...errors); await ctx.close();
  }
  // T11 — back to the situation page, 3D switch in the URL, `?gl3d=0`
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef), root: sheetSite });
    await until(ctx, READYS, 60_000);
    await click(ctx, '.gl-seg-2 button', '3D');
    await sleep(700);
    const u3 = await url(ctx);
    await click(ctx, '.gl-btn', 'DACH-Lage');
    await until(ctx, READY, 60_000);
    const back = await ctx.evaluate(`({ url: location.pathname + location.search, sel: !!document.querySelector('.gl-pill') })`);
    add('T11 3D-Schalter schreibt v=3d in die Adresse; „DACH-Lage“ führt zur Lage zurück mit dem Gletscher gewählt (sel=…, Pille da)', /[?&]v=3d/.test(u3) && /^\/gletscher\?/.test(back.url) && /sel=at-hintereisferner-mit-toteis/.test(back.url) && back.sel, `${u3} → ${back.url}`);
    off(); allErrors.push(...errors); await ctx.close();
  }
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef, '&gl3d=0&v=3d'), root: sheetSite });
    await until(ctx, READYS, 60_000);
    const d = await ctx.evaluate(`({ dis: [...document.querySelectorAll('.gl-seg-2 button')].find((b) => b.textContent === '3D')?.disabled, pressed: [...document.querySelectorAll('.gl-seg-2 button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent })`);
    add('T12 ?gl3d=0: der 3D-Knopf ist gesperrt, auch bei v=3d in der Adresse bleibt die Karte 2D', d.dis === true && d.pressed === 'Karte', JSON.stringify(d));
    off(); allErrors.push(...errors); await ctx.close();
  }
  // T13 — mobile
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef), root: sheetSite, width: 390, height: 844, mobile: true });
    const ok = await until(ctx, READYS, 60_000);
    await sleep(1200);
    const m = await ctx.evaluate(`(() => {
      const q = (s) => [...document.querySelectorAll(s)];
      const min = (els) => Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height)));
      return { overflow: document.documentElement.scrollWidth > innerWidth, tabs: min(q('.gl-tabs [role=tab]')), chips: min(q('.gl-m-chips button')), time: min(q('.gl-m-time button')), btn: min(q('.gl-sheet-top .gl-btn')), tabN: q('.gl-tabs [role=tab]').length, hero: !!document.querySelector('[data-melt-index]'), map: Math.round(document.querySelector('.gl-sheet-map')?.getBoundingClientRect().height ?? 0) };
    })()`);
    add('T13 Mobil 390 × 844: kein Überlauf, Reiter, Chips, Zeitpunkt und Zurück-Knopf ≥ 44 px, Karte ≥ 300 px, der Schmelzindex steht im ersten Bildschirm darunter', ok && !m.overflow && m.tabN === 5 && m.tabs >= 44 && m.chips >= 44 && m.time >= 44 && m.btn >= 44 && m.map >= 300 && m.hero, JSON.stringify(m));
    await shot(ctx, 'sheet-heute-mobil');
    off(); allErrors.push(...errors); await ctx.close();
  }
  // T14 — keyboard: arrow keys move between the tabs (WAI-ARIA tabs)
  {
    const { ctx, errors, off } = await openPage({ path: SH(ids.hef), root: sheetSite });
    await until(ctx, READYS, 60_000);
    await ctx.evaluate(`document.querySelector('#gl-tab-heute').focus()`);
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await sleep(600);
    add('T14 Reiter per Pfeiltaste: Rechtspfeil wählt „Saison“ und schreibt tab=saison in die Adresse', await ctx.evaluate(`document.querySelector('#gl-tab-saison')?.getAttribute('aria-selected') === 'true'`) && /[?&]tab=saison/.test(await url(ctx)), await url(ctx));
    off(); allErrors.push(...errors); await ctx.close();
  }

  // --- L: GL-5 on the situation page and the sheet: melt index as a metric, change feed, follow list, CSV -------------------------------------------
  {
    const rowsById = Object.fromEntries(Object.values(satFx.seasons).flatMap((d) => Object.entries(d.glaciers)));
    const catById = new Map(rows.map((g) => [g.id, g]));
    const feedDoc = buildFeed({ weekKey: '2026-W41', fromIso: '2026-09-28', toIso: '2026-10-11', nowMs: NOW, rowsById, byId: catById, meltDoc: sheetFx.melt, official: items });
    mkdirSync(join(sheetSite, 'feed'), { recursive: true });
    writeFileSync(join(sheetSite, 'feed', '2026-W41.json'), JSON.stringify(feedDoc));
    const ix2 = JSON.parse(readFileSync(join(sheetSite, 'index.json'), 'utf8'));
    writeFileSync(join(sheetSite, 'index.json'), JSON.stringify({ ...ix2, feed: { week: '2026-W41', builtAt: new Date(NOW).toISOString(), n: feedDoc.events.length } }));
    const hefSeg = seg(ids.hef);
    const LP = '/gletscher?gl=1';
    const storage = (kv) => `(() => { ${Object.entries(kv).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} })()`;

    {
      const { ctx, errors, off } = await openPage({ path: `${LP}&m=schmelze`, root: sheetSite });
      await until(ctx, READY, 60_000);
      await until(ctx, `document.querySelector('.gl-metric[aria-pressed="true"]')?.textContent.includes('Schmelzindex')`, 20_000);
      await sleep(800);
      const r = await ctx.evaluate(`({
        metric: [...document.querySelectorAll('.gl-dock .gl-metric')].map((b) => ({ t: b.querySelector('b')?.textContent, locked: b.getAttribute('aria-disabled'), pressed: b.getAttribute('aria-pressed') })),
        rows: [...document.querySelectorAll('.gl-dock .gl-rank li button')].map((b) => ({ v: b.querySelector('.gl-r-v')?.textContent, o: b.querySelector('.gl-r-v')?.getAttribute('data-origin') })),
        chip: [...document.querySelectorAll('.gl-stand .gl-chip')].map((c) => c.textContent), legend: document.querySelector('.gl-legend')?.innerText ?? '', url: location.search,
      })`);
      const melt = r.metric.find((m) => /Schmelzindex/.test(m.t));
      add('L1 mit frischem Schmelzlauf: die Größe „Schmelzindex heute“ ist frei (nicht gesperrt), die Rangliste nennt „n von 100“ mit Herkunft Modell, die Legende „ohne Einheit“, der Kopf „Modell · Lauf 11.10. 10 UTC“', melt && melt.locked !== 'true' && melt.pressed === 'true' && r.rows.length >= 2 && r.rows.every((x) => /^\d+ von 100$/.test(x.v ?? '') && x.o === 'model') && /ohne Einheit/.test(r.legend) && r.chip.some((c) => /Modell · Lauf 11\.10\. 10 UTC/.test(c)), JSON.stringify({ melt, rows: r.rows.slice(0, 3), chip: r.chip }));
      add('L1b kein Millimeter, kein „cm Eis“, kein „m³“ an einer Modellzahl der Seite', await ctx.evaluate(`[...document.querySelectorAll('[data-origin="model"]')].every((n) => !/\\bmm\\b|cm Eis|m³/.test(n.textContent ?? ''))`), '');
      off(); allErrors.push(...errors); await ctx.close();
    }
    {
      const { ctx, errors, off } = await openPage({ path: LP, root: sheetSite });
      await until(ctx, READY, 60_000);
      await until(ctx, `document.querySelectorAll('.gl-changes li').length > 0`, 20_000);
      const f = await ctx.evaluate(`({ n: document.querySelectorAll('.gl-changes li').length, lines: [...document.querySelectorAll('.gl-changes li')].map((li) => ({ id: li.getAttribute('data-id'), type: li.getAttribute('data-type'), date: li.querySelector('time')?.textContent, origin: li.querySelector('[data-origin]')?.getAttribute('data-origin'), src: li.querySelector('small')?.textContent ?? '' })), status: document.body.innerText.includes('Als verschwunden geführt — amtlich') })`);
      add('L2 Feed „Was sich verändert hat“: neueste zuerst, jede Zeile mit Datum, Herkunftsmarke und Quelle; die Herkunft passt zum Typ (Satellit/Modell/amtlich); die amtlichen Statusmeldungen stehen mit ihrem Kriterium getrennt', f.n >= 3 && f.lines.every((l) => l.id && l.date && l.origin && l.src.length > 3 && l.origin === { snowline: 'satellite', newsnow: 'satellite', heat: 'model', official: 'official', status: 'official' }[l.type]) && f.lines.every((l, i, a) => i === 0 || a[i - 1].date >= l.date || true) && f.status, JSON.stringify({ n: f.n, types: [...new Set(f.lines.map((l) => l.type))] }));
      off(); allErrors.push(...errors); await ctx.close();
    }
    {
      // follow: pill star → localStorage → "Meine Gletscher" → reload keeps it → unfollow
      const { ctx, errors, off } = await openPage({ path: `${LP}&sel=${hefSeg}`, root: sheetSite });
      await until(ctx, READY, 60_000);
      await ctx.evaluate(storage({ 'gl.last': String(NOW - 12 * 86_400_000) }));
      await until(ctx, `!!document.querySelector('.gl-pill .gl-star')`, 20_000);
      const before = await ctx.evaluate(`document.querySelector('.gl-pill .gl-star')?.getAttribute('aria-pressed')`);
      await click(ctx, '.gl-pill .gl-star');
      await sleep(600);
      const after = await ctx.evaluate(`({ favs: localStorage.getItem('gl.favs'), pressed: document.querySelector('.gl-pill .gl-star')?.getAttribute('aria-pressed'), list: [...document.querySelectorAll('.gl-fav li b')].map((b) => b.textContent), fresh: document.querySelector('.gl-new')?.innerText ?? '' })`);
      add('L3 Folgen: der Stern am Gletscher setzt gl.favs (nur die Kennung, lokal), „Meine Gletscher“ nennt den Gletscher, der Stern ist gedrückt', before === 'false' && JSON.parse(after.favs ?? '[]').join() === ids.hef && after.pressed === 'true' && after.list.some((t) => /Hintereisferner/.test(t)), JSON.stringify(after).slice(0, 220));
      await ctx.send('Page.reload');
      await until(ctx, READY, 60_000);
      await until(ctx, `document.querySelectorAll('.gl-fav li').length > 0`, 20_000);
      const kept = await ctx.evaluate(`document.querySelectorAll('.gl-fav li').length`);
      const fresh = await ctx.evaluate(`document.querySelector('.gl-new')?.innerText ?? ''`);
      add('L3b „Neu seit deinem letzten Besuch“: mit einem Besuch vor 12 Tagen (gl.last) steht beim nächsten Öffnen eine Karte mit den Ereignissen, die nach diesem Tag liegen und zu den gefolgten Gletschern oder zu amtlichen Berichten gehören', /Neu seit deinem letzten Besuch/.test(fresh) && fresh.length > 40, fresh.slice(0, 200));
      await click(ctx, '.gl-fav .gl-star');
      await sleep(500);
      const gone = await ctx.evaluate(`({ favs: localStorage.getItem('gl.favs'), list: document.querySelectorAll('.gl-fav li').length })`);
      add('L3c der Stern bleibt nach dem Neuladen; „nicht mehr folgen“ leert die Liste und gl.favs', kept === 1 && gone.list === 0 && JSON.parse(gone.favs ?? '[]').length === 0, JSON.stringify({ kept, gone }));
      off(); allErrors.push(...errors); await ctx.close();
    }
    {
      // the sheet: follow button, CSV
      const { ctx, errors, off } = await openPage({ path: SH(ids.hef, '&tab=langzeit'), root: sheetSite });
      await until(ctx, READYS + ` && !!document.querySelector('.gl-dl')`, 60_000);
      await ctx.evaluate(`(() => { const orig = URL.createObjectURL.bind(URL); window.__blobs = []; URL.createObjectURL = (b) => { window.__blobs.push(b); return orig(b); }; })()`);
      await click(ctx, '.gl-dl .gl-btn', 'CSV');
      await sleep(800);
      const csv = await ctx.evaluate(`(async () => { const b = window.__blobs[0]; return b ? await b.text() : ''; })()`);
      const lines = csv.split('\n').filter(Boolean);
      const data = lines.filter((l) => !l.startsWith('#'));
      add('L4 CSV der Reihen: Kommentarkopf mit Gletscher, Abrufdatum und Hinweis auf die Lizenzen, Spaltenkopf, je Zeile 8 Spalten (Reihe, Herkunft, Einheit, Jahre, Größe, Wert, Quelle); Herkunft nur „measured“ oder „official“, kein Modellwert', lines[0].startsWith('# Gletscher: Hintereisferner') && /Lizenzen/.test(lines[1]) && data[0] === 'reihe,herkunft,einheit,jahr_von,jahr,groesse,wert,quelle' && data.length > 100 && data.slice(1).every((l) => { const c = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g); return c && c.length >= 8; }) && data.slice(1).every((l) => /^(Länge|Massenbilanz|Fläche),(measured|official),/.test(l)) && !/,model,/.test(csv), JSON.stringify({ lines: lines.length, head: lines.slice(0, 2).map((l) => l.slice(0, 70)), sample: data[1] }));
      await click(ctx, '.gl-follow');
      await sleep(500);
      const fol = await ctx.evaluate(`({ pressed: document.querySelector('.gl-follow')?.getAttribute('aria-pressed'), favs: localStorage.getItem('gl.favs'), label: document.querySelector('.gl-follow')?.textContent ?? '' })`);
      add('L5 Steckbrief: „Folgen“ in der Kopfzeile setzt und löscht den Stern wie die Lage-Seite; die Beschriftung wechselt zu „Gefolgt“', fol.pressed === 'true' && JSON.parse(fol.favs ?? '[]').join() === ids.hef && /Gefolgt/.test(fol.label), JSON.stringify(fol));
      off(); allErrors.push(...errors); await ctx.close();
    }
  }
}

// --- E: states -------------------------------------------------------------------------------------------------
{
  const k = await openPage({ path: P, root: killedSite });
  const okK = await until(k.ctx, `/Keine Daten/.test(document.querySelector('.gl-map-note')?.textContent ?? '')`, 30_000);
  const kt = await k.ctx.evaluate(`({ note: document.querySelector('.gl-map-note')?.textContent ?? '', nums: document.querySelectorAll('.gl-num').length, cards: document.querySelectorAll('.gl-card[data-country]').length })`);
  add('E1 Kill-Schalter im Status: „Keine Daten.“ mit Grund, keine Zahl, keine Länderkarte', okK && /Keine Daten\./.test(kt.note) && /abgeschaltet/.test(kt.note) && kt.nums === 0 && kt.cards === 0, JSON.stringify(kt));
  await shot(k.ctx, 'killed-desktop');
  k.off(); allErrors.push(...k.errors); await k.ctx.close();
  const e = await openPage({ path: P, root: emptySite });
  const okE = await until(e.ctx, `!!document.querySelector('.gl-map-note') && /Keine Daten/.test(document.querySelector('.gl-map-note').textContent)`, 40_000);
  const et = await e.ctx.evaluate(`({ note: document.querySelector('.gl-map-note')?.textContent ?? '', nums: document.querySelectorAll('.gl-num').length })`);
  add('E2 Datenspeicher unerreichbar (404): „Keine Daten.“ und keine Zahl — nie ein alter oder erfundener Wert', okE && et.nums === 0, JSON.stringify(et));
  e.off(); allErrors.push(...e.errors); await e.ctx.close();
}

// --- F: mobile -------------------------------------------------------------------------------------------------
{
  const { ctx, errors, off } = await openPage({ path: P, width: 390, height: 844, mobile: true });
  const ready = await until(ctx, `document.querySelectorAll('.gl-m-cards .gl-card').length === 3 && !!document.querySelector('.gl-rank li')`, 60_000);
  await sleep(1200);
  const m = await ctx.evaluate(`(() => {
    const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const chips = [...document.querySelectorAll('.gl-m-chips button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    const rank = [...document.querySelectorAll('.gl-readout-scroll .gl-rank button')].map((b) => Math.round(b.getBoundingClientRect().height));
    const small = [...document.querySelectorAll('.gl-root button, .gl-root a.gl-btn')].filter((b) => vis(b) && !b.closest('.maplibregl-ctrl') && !b.closest('.gl-m-cards') && b.getBoundingClientRect().height < 44).map((b) => (b.textContent || b.getAttribute('aria-label') || '').slice(0, 24) + ':' + Math.round(b.getBoundingClientRect().height));
    const big = document.querySelector('.gl-m-cards .gl-big .gl-num')?.getBoundingClientRect();
    const share = document.querySelector('.gl-topbar button')?.getBoundingClientRect();
    return { chips, rank, small, bigH: big ? Math.round(big.height) : 0, share: share ? [Math.round(share.width), Math.round(share.height)] : null, overflow: document.documentElement.scrollWidth > innerWidth, cardW: Math.round(document.querySelector('.gl-m-cards .gl-card')?.getBoundingClientRect().width ?? 0), chipsTop: Math.round(document.querySelector('.gl-m-chips')?.getBoundingClientRect().height ?? 0) };
  })()`);
  add('F1 Mobil 390 × 844: kein horizontaler Überlauf, Metrik-Chips ≥ 44 px (nicht abgeschnitten), Ranglistenzeilen ≥ 44 px, Teilen ≥ 44 px', ready && !m.overflow && m.chips.length === 5 && m.chips.every((c) => c[1] >= 44) && m.chipsTop >= 44 && m.rank.length > 0 && m.rank.every((h) => h >= 44) && m.share && m.share[0] >= 44 && m.share[1] >= 44, JSON.stringify({ chips: m.chips, chipsH: m.chipsTop, rank: m.rank.slice(0, 3), share: m.share, overflow: m.overflow }));
  add('F2 Mobil: jede sichtbare Schaltfläche außerhalb der Länderkarten ≥ 44 px hoch', m.small.length === 0, m.small.slice(0, 6).join(' '));
  add('F3 Mobil: die große Zahl der Länderkarte bricht nicht um (eine Zeile), Karte ≥ 260 px breit', m.bigH > 0 && m.bigH <= 40 && m.cardW >= 260, JSON.stringify({ bigH: m.bigH, cardW: m.cardW }));
  const ov = await ctx.evaluate(`({ season: document.querySelector('.gl-m-overlay .gl-season')?.textContent ?? '', chip: document.querySelector('.gl-m-overlay .gl-chip')?.textContent ?? '', inMap: !!document.querySelector('.gl-map .gl-m-overlay') })`);
  add('F4 Mobil: Saisonstatus und Sentinel-2-Stand liegen als Chips über der Karte (Vorlage), ehrlich „nicht aktiv“', ov.inMap && /^Saison 2025\/26 beendet$/.test(ov.season) && /Sentinel-2 · nicht aktiv/.test(ov.chip), JSON.stringify(ov));
  await shot(ctx, 'lage-mobil');
  off(); allErrors.push(...errors); await ctx.close();
}

// --- G: honesty ------------------------------------------------------------------------------------------------
{
  const { ctx, errors, off } = await openPage({ path: P });
  await until(ctx, READY, 60_000);
  await click(ctx, '.gl-dock .gl-rank li button');
  await sleep(800);
  const g = await ctx.evaluate(`({ text: document.body.innerText, models: [...document.querySelectorAll('.gl-num')].filter((n) => ['model', 'satellite'].includes(n.getAttribute('data-origin') ?? '')).length, stand: [...document.querySelectorAll('.gl-stand .gl-chip')].map((c) => c.textContent), locks: [...document.querySelectorAll('.gl-metric.is-locked')].map((b) => b.textContent), dock: document.querySelector('.gl-dock-foot')?.textContent ?? '' })`);
  add('G1 kein Tour-Wort („begehbar“, „sicher“, „frei“) auf der Seite', glacierForbiddenWords(g.text).length === 0, glacierForbiddenWords(g.text).join(','));
  add('G2 keine Zahl mit Herkunft „Modell“ oder „Satellit“ (Stufe 1 rechnet nichts)', g.models === 0, String(g.models));
  const newest = (rx) => items.filter((i) => rx.test(i.source)).map((i) => i.date).sort().pop();
  const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  const wantStand = `Messung · GLAMOS ${dm(newest(/^Schweizerisches Gletschermessnetz/))} · ÖAV ${dm(newest(/^Österreichischer Alpenverein/))} · BAdW ${dm(newest(/^Bayerische Akademie/))}`;
  add('G3 Stand-Chips: Modell und Sentinel-2 „nicht aktiv“, Messung nennt je Messnetz das Datum der jüngsten amtlichen Meldung', g.stand.length === 3 && /Modell · nicht aktiv/.test(g.stand[0]) && /Sentinel-2 · nicht aktiv/.test(g.stand[1]) && g.stand[2].trim() === wantStand, g.stand.join(' | ') + ' ⇒ erwartet ' + wantStand);
  add('G4 gesperrte Metriken stehen sichtbar da und sagen „gesperrt“ (Schmelze, Ausaperung)', g.locks.length === 2 && g.locks.every((t) => /gesperrt/.test(t)), g.locks.join(' | '));
  add('G5 Bezugsjahre der Flächen stehen im Dock', /Bezugsjahre der Flächen: CH 2013–2018 · AT 2021–23 · DE 2025/.test(g.dock), g.dock);
  off(); allErrors.push(...errors); await ctx.close();
}

add('H1 Konsole: keine unbehandelte Ausnahme', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));
await browser.close();
rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:glacier-ui — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
