/**
 * verify:glacier-ui — Phase GL (audit/gletscher.md): the glacier situation page in a real browser.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-ui.mjs --base=http://127.0.0.1:5191 [--shots=<dir>] [--tree=<v1 dir>]
 *   (a running dev server or `vite preview` of the current build)
 *
 * Headless Chromium over CDP (scripts/lib/cdpBrowser.mjs, SwiftShader for MapLibre). The data tree is assembled from the REAL
 * extract `scripts/lib/fixtures/glacier/static-extract.json` (eight real glaciers with their outlines, series, summary, the nine
 * official items) — or read from a full local build with `--tree=` — and served by request interception for
 * `…/buscosun-glacier@main/v1/*` and raw.githubusercontent. Basemap tiles come from the network (no checked content).
 *
 *   A  flag gate: GLACIER_LIVE is false ⇒ page, tile 13 and rail item exist only with `?gl=1`; noindex on the page
 *   B  layout at 1440 × 900: rail 62 · topbar 60 · dock 250 · readout 400 · map 728
 *   C  data: official sentences VERBATIM with date and source link; origin chip at every number; reference year at every area
 *   D  state: land, metric, search, selection ⇒ URL and back; locked metrics cannot be chosen
 *   E  states: killed / unreachable ⇒ "Keine Daten." and no number
 *   F  mobile 390 × 844: chips and rows ≥ 44 px, no horizontal overflow, big numbers do not break
 *   G  honesty: no tour words, nothing modelled or from satellite shown as a number, locked lines say why
 *   H  console: no uncaught exception
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { glacierForbiddenWords } from '../src/glacier/glacierContract.ts';

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
      const m = /buscosun-glacier(?:@main|\/main)\/v1\/(.+?)(?:\?.*)?$/.exec(url);
      if (m) {
        const file = join(root, ...m[1].split('/'));
        const ok = existsSync(file);
        await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: ok ? 200 : 404, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: ok ? readFileSync(file).toString('base64') : '' }).catch(() => {});
        return;
      }
      await ctx.send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
    }
  });
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*buscosun-glacier*' }] });
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
  const { ctx, errors, off } = await openPage({ path: '/gletscher' });
  const notFound = await until(ctx, `!!document.querySelector('h1') && /nicht gefunden|404/i.test(document.body.innerText) && !document.querySelector('.gl-root')`, 20_000);
  add('A1 ohne ?gl=1: /gletscher antwortet wie ein unbekannter Pfad (GLACIER_LIVE = false)', notFound);
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/' });
  await until(ctx, `!!document.querySelector('.deck-chips-count')`, 20_000);
  await sleep(800);
  const r = await ctx.evaluate(`({ tile: [...document.querySelectorAll('.deck-tile')].some((t) => /Gletscher/.test(t.getAttribute('aria-label') ?? '')), count: document.querySelector('.deck-chips-count')?.textContent ?? '' })`);
  add('A2 Startseite ohne Schalter: keine Gletscher-Kachel, Zähler „12 Werkzeuge“', !r.tile && /12/.test(r.count) && !/13/.test(r.count), JSON.stringify(r));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/?gl=1' });
  await until(ctx, `!!document.querySelector('.deck-chips-count')`, 20_000);
  await sleep(800);
  const r = await ctx.evaluate(`(() => { const t = [...document.querySelectorAll('.deck-bento > .deck-tile')].find((x) => /Gletscher/.test(x.getAttribute('aria-label') ?? '') && x.offsetParent !== null); const b = t?.getBoundingClientRect(); return { tile: !!t, eyebrow: t?.querySelector('.tile-eyebrow')?.textContent ?? null, count: document.querySelector('.deck-chips-count')?.textContent ?? '', w: b ? Math.round(b.width) : 0, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
  add('A3 Startseite mit ?gl=1: Kachel „13 · GLETSCHER“ sichtbar, Zähler 13, kein Überlauf', r.tile && /13/.test(r.eyebrow ?? '') && /13/.test(r.count) && r.w > 200 && !r.overflow, JSON.stringify(r));
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
  await click(ctx, '.gl-dock .gl-metric', 'Schmelze heute');
  await sleep(400);
  const lock = await ctx.evaluate(`(() => { const b = [...document.querySelectorAll('.gl-dock .gl-metric')].find((x) => x.textContent.includes('Schmelze heute')); return { disabled: b?.getAttribute('aria-disabled'), pressed: b?.getAttribute('aria-pressed'), text: b?.textContent ?? '' }; })()`);
  add('D3 gesperrte Metrik „Schmelze heute“: aria-disabled, nicht wählbar, URL unverändert, Text „gesperrt“', lock.disabled === 'true' && lock.pressed === 'false' && /gesperrt/.test(lock.text) && (await url(ctx)) === before, JSON.stringify(lock));
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
  add('D5 Auswahl: Steckbrief-Karte (Klasse, Fläche mit Bezugsjahr), Pill, URL sel=…; der Steckbrief-Knopf ist gesperrt, solange GL-4 fehlt', /^gl_at_hintereisferner/.test(sel.card) && sel.pill && sel.btn === true && /Klasse A/.test(sel.txt) && /Inventar 2023/.test(sel.txt) && /sel=at-hintereisferner/.test(u), JSON.stringify({ card: sel.card, btn: sel.btn, u }));
  add('D6 Karte der Auswahl nennt „Modell: folgt“ gesperrt statt einer Schmelzzahl (kein Platzhalterwert)', /Schmelze heute/.test(sel.txt) && /folgt/.test(sel.txt) && !/\d\s?(mm|cm)\s?(w\.?e\.?|Eis)/i.test(sel.txt), sel.txt.slice(-160));
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
    add('S1 mit Satellitendaten: „Ausaperung“ ist nicht mehr gesperrt, nur „Schmelze“ bleibt es; die Rangliste nennt „% schneefrei“ mit Herkunft Satellit, größte Ausaperung zuerst', r.aus.disabled !== 'true' && r.aus.pressed === 'true' && r.locked.length === 1 && /Schmelze/.test(r.locked[0]) && r.rows.length >= 3 && r.rows.every((x) => x.origin === 'satellite' && /% schneefrei/.test(x.val ?? '')) && nums.every((v, i, a) => i === 0 || v <= a[i - 1]) && /größte Ausaperung zuerst/.test(r.hint), JSON.stringify({ aus: r.aus, locked: r.locked, rows: r.rows.slice(0, 3), hint: r.hint }));
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

// --- E: states -------------------------------------------------------------------------------------------------
{
  const k = await openPage({ path: P, root: killedSite });
  const okK = await until(k.ctx, `!!document.querySelector('.gl-map-note')`, 30_000);
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
