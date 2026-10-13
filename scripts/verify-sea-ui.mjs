/**
 * verify:sea-ui — Phase SW (audit/seewetter.md §9): the Seewetter page in a real browser.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-ui.mjs --base=http://127.0.0.1:5212 [--shots=<dir>]
 *   (a running dev server or `vite preview` of the current build)
 *
 * Headless Chromium over CDP (scripts/lib/cdpBrowser.mjs, SwiftShader for MapLibre). The data store is built by the
 * REAL producer: `buildRun` on the CWAM excerpts of run 07.10.2026 00 UTC (every step reads the excerpt of its
 * parameter), the real spot series of that run with buscosun Fusion 9 wind, the real bulletins via `pollTexts`; it is
 * served by request interception for `…/buscosun-data@main/sea/v1/*` and raw.githubusercontent, the page clock is shifted.
 * The coastal measurement (POI) is a frozen file of Arkona. Basemap tiles come from the network (no checked content).
 *
 *   A  flag gate: on for everyone since 10.10. (SEA_LIVE) — page and start-page tile 12 without parameter, `?sea=0` hides
 *   B  layout at 1440 × 900: rail 62 · topbar 60 · dock 250 · readout 400 · map 728 · band over the map foot
 *   C  data: default spot St. Peter-Ording, one band column per hour to the end of the run, origin at the numbers
 *   D  state: hour, spot, profile, unit, layer, tab ⇒ URL; Bft changes the numbers; limits editable
 *   E  official: WODL45 verbatim with number and issue time; a sea-area message stands ABOVE the verdict (check 3)
 *   F  states: run > 18 h "Veraltet", > 30 h or kill switch "Keine Daten" with no surface (check 4)
 *   G  mobile 390 × 844: pill, share 44 px, sheet, every visible button ≥ 44 px
 *   H  honesty: no WAM model wind anywhere (check 1), "keine Daten" never like "passt", no "sicher"
 *   I  console: no uncaught exception
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { SEA_PARAMS, SEA_MODELS } from '../src/sea/seaContract.ts';
import { seaTextProductOfFile } from '../src/sea/seaText.ts';
import { buildRun, parseInventory } from './sea/sea-derive.mjs';
import { pollTexts } from './sea/sea-text.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const GRIB = join(FIX, 'cwam-2026100700');
const WLFIX = join(FIX, 'waterlevel');
const TXT = join(HERE, '..', 'audit', 'seewetter', 'fixtures');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5212';
const SHOTS = args.shots ?? null;
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = '2026100700';
const T = (iso) => Date.parse(iso);

// --- fixture store: the real producer --------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'sea-ui-'));
const site = join(tmp, 'site');
mkdirSync(join(site, 'static'), { recursive: true });
cpSync(join(FIX, 'static'), join(site, 'static'), { recursive: true });
const files = readdirSync(GRIB).filter((f) => f.endsWith('.bz2'));
const fileOf = (p, s) => {
  const P = p.toUpperCase();
  return join(GRIB, files.find((f) => f === `CWAM_${P}_${RUN}_${String(s).padStart(3, '0')}.grib2.bz2`) ?? files.find((f) => f === `CWAM_${P}_${RUN}_024.grib2.bz2`) ?? files.find((f) => f.startsWith(`CWAM_${P}_`)));
};
const inv = parseInventory(SEA_PARAMS.flatMap((p) => SEA_MODELS.cwam.steps.map((s) => `./wave_models/cwam/grib/00/${p}/CWAM_${p.toUpperCase()}_${RUN}_${String(s).padStart(3, '0')}.grib2.bz2|1000|2026-10-07 04:07:00`)).join('\n'));
const real = JSON.parse(readFileSync(join(FIX, 'spots-2026100700.json'), 'utf8'));
// Wind of the real run (buscosun Fusion 9 at the spots) — the derive writes it back exactly as computed then.
const windReal = async ({ spots }) => ({
  series: Object.fromEntries(spots.filter((s) => real.spots[s.id]).map((s) => [s.id, { wind: real.spots[s.id].v.wind, gust: real.spots[s.id].v.gust, windDir: real.spots[s.id].v.windDir }])),
  failed: [], meta: { ...real.wind, failed: undefined },
});
const built = await buildRun({ storeDir: site, dataDir: 'cdn', cacheDir: join(tmp, 'cache'), run: RUN, inv, nowMs: T('2026-10-07T12:54:08Z'), ewam: false, windImpl: windReal, fileOf, killed: false });
const dwdText = async (url) => {
  const name = url.split('/').pop();
  const fx = readdirSync(TXT).filter((f) => seaTextProductOfFile(f));
  if (url.endsWith('/german/')) return new Response(fx.map((f) => `<a href="${f}">${f}</a>`).join('\n'));
  return fx.includes(name) ? new Response(readFileSync(join(TXT, name)), { headers: { 'last-modified': 'Wed, 07 Oct 2026 11:45:29 GMT' } }) : new Response('', { status: 404 });
};
const tx = await pollTexts({ storeDir: site, nowMs: T('2026-10-07T12:40:00Z'), fetchImpl: dwdText, killed: false });
add('A0 Fixture-Speicher über den echten Producer (Lauf 2026100700, 59 + 27 Bilder, Spots, Texte)', built.built && tx.added === 5, JSON.stringify({ built: built.built, mb: built.mb, texts: tx.added }));
// V-SW-10: the worker computes the very same bytes as the main thread (all four layers, both halves; value range incl. 254/255 and land).
{
  const { colourField } = await import('../src/sea/seaView.ts');
  const { colourFieldAsync } = await import('../src/sea/seaFieldClient.ts');
  const sent = [];
  globalThis.self = { postMessage: (m, t) => sent.push([m, t]) };
  await import('../src/sea/seaFieldWorker.ts');
  const W = 1260, Hh = SEA_MODELS.cwam.grid.nj;
  const src = new Uint8ClampedArray(W * Hh * 4);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < W * Hh; i++) {
    src[i * 4] = rnd() < 0.08 ? 255 : rnd() < 0.03 ? 254 : Math.floor(rnd() * 254);
    src[i * 4 + 1] = Math.floor(rnd() * 256);
    src[i * 4 + 2] = rnd() < 0.05 ? 255 : Math.floor(rnd() * 255);
    src[i * 4 + 3] = rnd() < 0.3 ? 0 : 255;
  }
  let same = true, n = 0, buffersOk = true, asyncOk = true;
  for (const layer of ['hs', 'ws', 'sw', 'per']) {
    for (const half of [0, 1]) {
      const ref = colourField(src, W, half, layer);
      sent.length = 0;
      globalThis.self.onmessage({ data: { id: n, rgba: src, width: W, half, layer } });
      const [reply, transfer] = sent[0];
      same = same && reply.ok && reply.id === n && reply.out.length === ref.length && reply.out.every((v, i) => v === ref[i]);
      buffersOk = buffersOk && transfer?.[0] === reply.out.buffer;
      const viaClient = await colourFieldAsync(src, W, half, layer); // no Worker in Node ⇒ main-thread fallback
      asyncOk = asyncOk && viaClient.length === ref.length && viaClient.every((v, i) => v === ref[i]);
      n++;
    }
  }
  add('W1 Worker-Ausgabe byte-gleich zur Hauptthread-Färbung (4 Ebenen × 2 Hälften, Wertebereich inkl. 254/255 und Land)', same && n === 8, `${n} Fälle`);
  add('W2 Worker übergibt den Ergebnispuffer (transfer) und der Rückfall ohne Worker liefert dieselben Bytes', buffersOk && asyncOk, JSON.stringify({ buffersOk, asyncOk }));
  // negative control: a different layer must differ (the comparison can fail)
  const a = colourField(src, W, 0, 'hs'), b = colourField(src, W, 0, 'per');
  add('W3 Gegenprobe: Hs- und Perioden-Färbung unterscheiden sich (der Vergleich kann scheitern)', a.some((v, i) => v !== b[i]), '');
  delete globalThis.self;
}
const killedSite = join(tmp, 'site-killed');
cpSync(site, killedSite, { recursive: true });
writeFileSync(join(killedSite, 'status.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(site, 'status.json'), 'utf8')), killSwitch: true }));
const poiCsv = readFileSync(join(FIX, 'poi-10091.csv'));

/** Page clock = fixed instant, advancing in real time. */
const clockScript = (iso) => `(() => {
  const shift = ${T(iso)} - Date.now();
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + shift); else super(...a); }
    static now() { return RealDate.now() + shift; }
  }
  globalThis.Date = FakeDate;
})();`;

const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden'); process.exit(2); }
// V-WL-16: without a server on BASE every page is `chrome-error://` and the checks measure nothing — four runs
// on 13.10.2026 crashed at an optional element before anyone noticed. Fail fast, with the command to start it.
{
  const alive = await fetch(`${BASE}/seewetter`, { signal: AbortSignal.timeout(5_000) }).then((r) => r.ok).catch(() => false);
  if (!alive) {
    console.error(`kein App-Server unter ${BASE} — vorher bauen und starten: npm run build && npx vite preview --host 127.0.0.1 --port 5212 --strictPort`);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(2);
  }
}
const browser = await openBrowser(chrome, { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const requested = [];

async function openPage({ path, width = 1440, height = 900, mobile = false, clock = '2026-10-07T12:40:00Z', root = site, storage = null }) {
  const ctx = await browser.newContext({ width, height, mobile });
  const errors = [];
  const off = browser.on(async (msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      const line = msg.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? msg.params.exceptionDetails?.text;
      errors.push(line);
      // Printed at once, so a page error is visible even when a later check crashes the run (V-WL-16).
      console.error(`[page ${path}] ${line}`);
    }
    if (msg.method === 'Fetch.requestPaused') {
      const url = msg.params.request.url;
      requested.push(url);
      const m = /(?:buscosun-data@main|buscosun-data\/main)\/sea\/v1\/(.+?)(?:\?.*)?$/.exec(url);
      if (m) {
        const file = join(root, ...m[1].split('/'));
        const ok = existsSync(file);
        const type = file.endsWith('.png') ? 'image/png' : 'application/json';
        await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: ok ? 200 : 404, responseHeaders: [{ name: 'content-type', value: type }, { name: 'access-control-allow-origin', value: '*' }], body: ok ? readFileSync(file).toString('base64') : '' }).catch(() => {});
        return;
      }
      // WL: the BSH water level API — served from the real answers of three gauges, so the harness stays netfree.
      const wl = /gdi\.bsh\.de\/.*\/items\/([a-z0-9_]+)/.exec(url);
      if (wl) {
        const file = join(WLFIX, `${wl[1]}.json`);
        const ok = existsSync(file);
        await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: ok ? 200 : 404, responseHeaders: [{ name: 'content-type', value: 'application/geo+json' }, { name: 'access-control-allow-origin', value: '*' }], body: ok ? readFileSync(file).toString('base64') : '' }).catch(() => {});
        return;
      }
      if (/weather_reports\/poi\//.test(url)) {
        await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'text/csv' }], body: poiCsv.toString('base64') }).catch(() => {});
        return;
      }
      await ctx.send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
    }
  });
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*sea/v1/*' }, { urlPattern: '*weather_reports/poi/*' }, { urlPattern: '*gdi.bsh.de/*' }] });
  await ctx.send('Network.setBypassServiceWorker', { bypass: true });
  // WL: `Fetch` does not fire for a HTTP-cache hit. The water level reader asks with `cache: 'default'`, so
  // without this a second run would quietly read the LIVE service out of the profile cache instead of the
  // fixture — the harness would stop being netfree without saying so (found 12.10.2026 while measuring the
  // chart: 334 points over 48 h instead of the fixture's 74 over 12 h).
  await ctx.send('Network.setCacheDisabled', { cacheDisabled: true });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: clockScript(clock) });
  if (storage) await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { ${Object.entries(storage).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} } catch {}` });
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
  await sleep(4000);
  mkdirSync(SHOTS, { recursive: true });
  const r = await ctx.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
};
const allErrors = [];
const READY = `document.querySelectorAll('.sw-band-table thead th button').length > 10 && !!document.querySelector('.sw-spot-title')`;

// --- A: flag gate --------------------------------------------------------------------------------------
{
  // Jan 10.10.: the flag is on for everyone (SEA_LIVE); `?sea=0` stays the per-visitor switch-off.
  const { ctx, errors, off } = await openPage({ path: '/seewetter?sea=0' });
  const notFound = await until(ctx, `!!document.querySelector('h1') && /nicht gefunden|404/i.test(document.body.innerText) && !document.querySelector('.sw-root')`, 20_000);
  add('A1 mit ?sea=0: /seewetter antwortet wie ein unbekannter Pfad (Ausschalter je Besucher bleibt)', notFound);
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/?sea=0' });
  await until(ctx, `!!document.querySelector('.deck-chips-count')`, 20_000);
  await sleep(800);
  const r = await ctx.evaluate(`({ tile: [...document.querySelectorAll('.deck-tile')].some((t) => /Seewetter/.test(t.getAttribute('aria-label') ?? '')), count: document.querySelector('.deck-chips-count')?.textContent ?? '', rail: [...document.querySelectorAll('a[title]')].some((a) => a.getAttribute('title') === 'Seewetter') })`);
  // Counter: since the Gletscher-Monitor tile (Phase GL, `8e8646a`) the home deck lists 13 tools, 12 without Seewetter.
  add('A2 Startseite mit ?sea=0: keine Seewetter-Kachel, Zähler „12 Werkzeuge“ (13 − Seewetter)', !r.tile && /\b12\b/.test(r.count) && !r.rail, JSON.stringify(r));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/' });
  await until(ctx, `!!document.querySelector('.deck-chips-count')`, 20_000);
  await sleep(800);
  const r = await ctx.evaluate(`(() => { const t = [...document.querySelectorAll('.deck-bento > .deck-tile')].find((x) => /Seewetter/.test(x.getAttribute('aria-label') ?? '') && x.offsetParent !== null); const b = t?.getBoundingClientRect(); const pv = t?.querySelector('.tile-sea-preview')?.getBoundingClientRect(); return { tile: !!t, eyebrow: t?.querySelector('.tile-eyebrow')?.textContent ?? null, count: document.querySelector('.deck-chips-count')?.textContent ?? '', preview: pv ? [Math.round(pv.width), Math.round(pv.height)] : null, inside: !!(b && pv && pv.left >= b.left && pv.right <= b.right && pv.top >= b.top && pv.bottom <= b.bottom), tags: [...(t?.querySelectorAll('.tile-tag') ?? [])].map((e) => e.textContent), overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
  add('A3 Startseite ohne Parameter (Flag an für alle, SEA_LIVE): Kachel „12 · SEEWETTER“ sichtbar mit Vorschau und Stichworten, Zähler 13 (mit Gletscher-Kachel)',
    r.tile && r.eyebrow === '12 · SEEWETTER' && /\b13\b/.test(r.count) && r.preview && r.preview[0] >= 300 && r.preview[1] >= 120 && r.inside && r.tags.length >= 4 && !r.overflow, JSON.stringify(r));
  await shot(ctx, 'home-tile-desktop');
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/seewetter' });
  const deck = await until(ctx, READY, 60_000);
  add('A4 /seewetter ohne Parameter: das Deck rendert (Flag an für alle)', deck);
  // E-SW-32 (Jan 10.10.): indexable. The app moves /seewetter to the default spot — that URL must not turn noindex at runtime.
  await sleep(1500);
  const seo = await ctx.evaluate(`({ path: location.pathname, robots: document.querySelector('meta[name=robots]')?.content ?? null, canonical: document.querySelector('link[rel=canonical]')?.href ?? null, h1: document.querySelectorAll('h1').length, chip: !!document.querySelector('.rsb[data-route="seewetter"] summary') })`);
  add('A6 indexierbar: auf /seewetter/st-peter-ording kein robots-noindex, Canonical /seewetter, genau eine H1, Chip „Über diese Ansicht“ da',
    seo.path === '/seewetter/st-peter-ording' && !/noindex/.test(seo.robots ?? '') && /\/seewetter$/.test(seo.canonical ?? '') && seo.h1 === 1 && seo.chip, JSON.stringify(seo));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/seewetter/st-peter-ording', width: 390, height: 844, mobile: true });
  await until(ctx, `!!document.querySelector('.rsb summary') && !!document.querySelector('.sw-m-top')`, 60_000);
  await sleep(1500);
  // If the chip is not there (page not served, block unmounted) the check must FAIL with a word, not crash
  // the whole run — a crash here hid the real cause (no server on BASE) for four runs on 13.10.2026 (V-WL-16).
  const r = await ctx.evaluate(`(() => { const el = document.querySelector('.rsb summary'); if (!el) return { chip: null, hit: [], rsb: !!document.querySelector('.rsb'), robots: document.querySelector('meta[name=robots]')?.content ?? null, h1: document.querySelectorAll('h1').length }; const c = el.getBoundingClientRect(); const hit = [...document.querySelectorAll('.sw-root button, .sw-root a')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.left < c.right && b.right > c.left && b.top < c.bottom && b.bottom > c.top; }).map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24)); return { chip: [Math.round(c.x), Math.round(c.y), Math.round(c.width), Math.round(c.height)], hit }; })()`);
  add('A7 mobil: der Chip „Über diese Ansicht“ liegt auf keiner Schaltfläche des Decks (Zeitchips, Pille, Teilen) und ist ≥ 44 px hoch', !!r.chip && r.hit.length === 0 && r.chip[3] >= 44 && r.chip[0] >= 0, r.chip ? JSON.stringify(r) : `Chip nach dem Laden verschwunden: ${JSON.stringify(r)}`);
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/', width: 390, height: 844, mobile: true });
  await until(ctx, `!!document.querySelector('.deck-bento')`, 20_000);
  await sleep(800);
  const r = await ctx.evaluate(`(() => { const t = [...document.querySelectorAll('.deck-bento > .deck-tile')].find((x) => /Seewetter/.test(x.getAttribute('aria-label') ?? '') && x.offsetParent !== null); const b = t?.getBoundingClientRect(); const pv = t?.querySelector('.tile-sea-preview')?.getBoundingClientRect(); return { tile: !!t, w: b ? Math.round(b.width) : 0, inside: !!(b && pv && pv.width > 0 && pv.left >= b.left && pv.right <= b.right), overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
  add('A5 Startseite mobil 390 px: Seewetter-Kachel über die volle Breite, Vorschau innerhalb der Kachel, kein seitlicher Überlauf', r.tile && r.w >= 320 && r.inside && !r.overflow, JSON.stringify(r));
  await shot(ctx, 'home-tile-mobile');
  off(); allErrors.push(...errors); await ctx.close();
}

// --- B–E, H: desktop with data -----------------------------------------------------------------------------
{
  const { ctx, errors, off } = await openPage({ path: '/seewetter?sea=1' });
  const ready = await until(ctx, READY, 60_000);
  add('B0 mit ?sea=1: Deck mit Daten aus dem Fixture-Speicher', ready);
  if (!ready) {
    // Say what the page shows instead of the deck, then stop: every later check of this block reads the deck.
    const state = await ctx.evaluate(`({ url: location.href, title: document.title, text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400), errors: ${JSON.stringify(errors)} })`).catch((e) => String(e));
    console.error('[B0] Deck nicht bereit:', JSON.stringify(state));
    console.error('[B0] Seitenfehler:', JSON.stringify(errors));
  }
  await sleep(1500);
  const box = await ctx.evaluate(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }; return { rail: r('.sw-rail'), top: r('.sw-topbar'), dock: r('.sw-dock'), map: r('.sw-map'), readout: r('.sw-readout'), band: r('.sw-band') }; })()`);
  add('B1 Maße bei 1440 × 900: Rail 62 · Topbar 60 · Dock 250 · Readout 400 · Karte 728', box.rail?.[2] === 62 && box.top?.[3] === 60 && box.dock?.[2] === 250 && box.readout?.[2] === 400 && box.map?.[2] === 728, JSON.stringify(box));
  add('B2 Stundenband als Glas-Panel über dem Kartenfuß (14 px Rand, 12 px unten)', box.band && box.band[0] === box.map[0] + 14 && Math.abs(box.band[1] + box.band[3] - (box.map[1] + box.map[3] - 12)) <= 1, JSON.stringify(box.band));
  const c = await ctx.evaluate(`({ url: location.pathname + location.search, name: document.querySelector('.sw-spot-title')?.textContent, cols: document.querySelectorAll('.sw-band-table thead th button').length, chip: document.querySelector('.sw-chip')?.textContent, live: document.querySelector('.sw-live')?.textContent, stand: document.querySelector('.sw-topbar-stand')?.textContent, spots: document.querySelectorAll('.sw-spot').length, sticky: getComputedStyle(document.querySelector('.sw-band-table .sw-band-lab')).position, caption: !!document.querySelector('.sw-band-table caption'), rowHeads: document.querySelectorAll('.sw-band-table tbody th[scope=row]').length })`);
  add('C1 Voreinstellung St. Peter-Ording, URL /seewetter/st-peter-ording', c.name === 'St. Peter-Ording' && c.url.startsWith('/seewetter/st-peter-ording'), JSON.stringify({ url: c.url, name: c.name }));
  add('C2 Band: eine Spalte je Stunde von jetzt (12 UTC) bis Laufende +78 h = 67; Tabelle mit Beschriftung, Zeilenköpfen, fixierter Spalte', c.cols === 67 && c.caption && c.rowHeads === 7 && c.sticky === 'sticky', JSON.stringify({ cols: c.cols, rowHeads: c.rowHeads, sticky: c.sticky }));
  add('C3 Herkunft an den Zahlen: Welle „Modell CWAM … Lauf“, Wind „buscosun Fusion 9“; Topbar Aktuell mit Lauf', /Welle Modell CWAM 00 UTC vom 07\.10\./.test(c.chip) && /buscosun Fusion 9/.test(c.chip) && /Aktuell/.test(c.live) && /CWAM 00 UTC/.test(c.stand), `${c.chip} · ${c.live} · ${c.stand}`);
  add('C4 Dock listet die Spots des Katalogs', c.spots >= 50, String(c.spots));
  const field = await until(ctx, `(() => { const m = document.querySelector('.sw-map-canvas'); return !!m && performance.getEntriesByType('resource').some((e) => /sea\\/v1\\/run\\/cwam\\/${RUN}\\/f\\/012\\.png/.test(e.name)); })()`, 20_000);
  add('C5 Kartenfeld der Stunde geladen (f/012.png = Vorlauf +12 h um 12 UTC)', field);
  await shot(ctx, 'desktop-default');

  // E + H on the default (North Sea) spot: the WODL45 fixture of 12:00 carries a German Bight message.
  const off1 = await ctx.evaluate(`(() => { const cards = [...document.querySelectorAll('.sw-readout .sw-card')]; const iw = cards.findIndex((c) => c.classList.contains('is-warn')); const iv = cards.findIndex((c) => !!c.querySelector('.sw-verdict')); return { iw, iv, warnText: cards[iw]?.innerText ?? '', official: document.querySelector('.sw-card.is-official')?.innerText ?? '' }; })()`);
  add('E1 Meldung für das Gebiet steht ÜBER dem Urteil (Prüffrage 3): „GERMAN BIGHT … N to NW 7 later.“ wörtlich', off1.iw >= 0 && off1.iv > off1.iw && /N to NW 7 later\./.test(off1.warnText), `warn ${off1.iw} < verdict ${off1.iv}`);
  add('E2 Amtlich-Karte: Wortlaut WODL45 mit NR. 479 und Ausgabezeit, Küstenbericht FQDL51 mit Ausgabezeit', /NR\. 479/.test(off1.official) && /Fuer die deutsche Nordseekueste besteht keine Starkwind-, Sturm- oder Orkanwarnung\./.test(off1.official.replace(/\s+/g, ' ')) && /FQDL51/.test(off1.official) && /WODL45/.test(off1.official), off1.official.slice(0, 160).replace(/\n/g, ' | '));
  const txt = await ctx.evaluate(`document.body.innerText`);
  add('H1 kein WAM-Modellwind (Prüffrage 1): kein sp_10m/dd_10m abgerufen, kein „Antriebswind“ als Wert', !requested.some((u) => /sp_10m|dd_10m/i.test(u)) && !/Antriebswind:/.test(txt), `${requested.filter((u) => /sea\/v1/.test(u)).length} Anfragen an sea/v1`);
  add('H2 kein Text sagt „sicher“ als Bewertung (nur „keine Sicherheitsbewertung“)', !/\bsicher\b/i.test(txt.replace(/Sicherheitsbewertung/g, '')), (txt.match(/.{0,30}\bsicher\b.{0,30}/i) ?? [''])[0]);

  // D: state ⇒ URL.
  await ctx.evaluate(`document.querySelector('.sw-band-table thead th[data-h="5"] button').click()`);
  const tUrl = await until(ctx, `/[?&]t=5\\b/.test(location.search)`, 5_000);
  add('D1 Stunde im Band wählen ⇒ URL t=5, Spalte gedrückt', tUrl && await ctx.evaluate(`document.querySelector('.sw-band-table thead th[data-h="5"] button').getAttribute('aria-pressed') === 'true'`));
  const knBefore = await ctx.evaluate(`[...document.querySelectorAll('.sw-band-table tbody tr.is-strong td')].map((t) => t.textContent).join(',')`);
  await ctx.evaluate(`[...document.querySelectorAll('.sw-units button')].find((b) => b.textContent === 'Bft').click()`);
  await until(ctx, `/[?&]u=bft\\b/.test(location.search)`, 5_000);
  const bft = await ctx.evaluate(`({ vals: [...document.querySelectorAll('.sw-band-table tbody tr.is-strong td')].map((t) => t.textContent).join(','), lab: document.querySelectorAll('.sw-band-table tbody th')[1]?.textContent })`);
  add('D2 Einheit Bft ⇒ URL u=bft, Zahlen im Band neu (Beaufort), Zeilenkopf „Bft“', bft.lab === 'Bft' && bft.vals !== knBefore, `${knBefore.slice(0, 30)} → ${bft.vals.slice(0, 30)}`);
  await ctx.evaluate(`[...document.querySelectorAll('.sw-profiles button')].find((b) => b.textContent === 'SUP/Kajak').click()`);
  const pUrl = await until(ctx, `/[?&]p=sup\\b/.test(location.search)`, 5_000);
  add('D3 Profil SUP/Kajak ⇒ URL p=sup, Zusammenfassung der Grenzen „Wind bis 10 kn · Böen bis 14 kn · Welle ≤ 0,5 m“', pUrl && /Wind bis 10 kn · Böen bis 14 kn · Welle ≤ 0,5 m/.test(await ctx.evaluate(`document.querySelector('.sw-prof-sum')?.textContent ?? ''`)));
  await ctx.evaluate(`[...document.querySelectorAll('.sw-layers button')].find((b) => b.textContent === 'Dünung').click()`);
  const lUrl = await until(ctx, `/[?&]l=sw\\b/.test(location.search) && performance.getEntriesByType('resource').some((e) => /\\/c\\/0\\d\\d\\.png/.test(e.name))`, 10_000);
  add('D4 Ebene Dünung ⇒ URL l=sw, Komponentenbild c/ geladen', lUrl);
  await ctx.evaluate(`[...document.querySelectorAll('.sw-spot')].find((b) => /Fehmarn Grüner Brink/.test(b.textContent)).click()`);
  const sUrl = await until(ctx, `location.pathname === '/seewetter/fehmarn-gruener-brink' && document.querySelector('.sw-spot-title')?.textContent === 'Fehmarn Grüner Brink'`, 8_000);
  add('D5 Spot in der Liste ⇒ Pfad /seewetter/fehmarn-gruener-brink, Readout wechselt', sUrl);
  const ost = await ctx.evaluate(`({ warn: !!document.querySelector('.sw-readout .sw-card.is-warn'), official: document.querySelector('.sw-card.is-official')?.innerText ?? '' })`);
  add('E3 Ostsee-Spot (Westliche Ostsee „no warning.“, Küste ohne Warnung): kein Meldungs-Kasten, Ostsee-Satz wörtlich mit NR. 414', !ost.warn && /NR\. 414/.test(ost.official) && /Ostseekueste besteht keine Starkwind/.test(ost.official.replace(/\s+/g, ' ')), ost.official.slice(0, 120).replace(/\n/g, ' | '));
  await ctx.evaluate(`[...document.querySelectorAll('.sw-tabs button')].find((b) => b.textContent === 'Seegebiet').click()`);
  await until(ctx, `/[?&]tab=gebiet\\b/.test(location.search)`, 5_000);
  const area = await ctx.evaluate(`document.querySelector('.sw-readout')?.innerText ?? ''`);
  add('D6 Reiter Seegebiet ⇒ URL tab=gebiet; FQDL50 „Westliche Ostsee“ wörtlich mit beiden Tagen, Mittelfrist mit Wassertemperatur, Lesehilfe', /Vorhersage fuer Mittwoch:/.test(area) && /Vorhersage fuer Donnerstag:/.test(area) && /Wind: Schwachwindig, suedostdrehend, zunehmend 4\./.test(area) && /Osten 12 bis 17 Grad/.test(area) && /Lesehilfe Beaufort/i.test(area), area.slice(0, 160).replace(/\n/g, ' | '));
  await ctx.evaluate(`[...document.querySelectorAll('.sw-tabs button')].find((b) => b.textContent === 'Quellen').click()`);
  await until(ctx, `/[?&]tab=quellen\\b/.test(location.search)`, 5_000);
  const src = await ctx.evaluate(`document.querySelector('.sw-readout')?.innerText ?? ''`);
  // WL (12.10.2026): the BSH line is no longer blocked — the row names the licence instead (audit/wasserstand-bsh.md).
  add('D7 Reiter Quellen: Lauf, buscosun Fusion, vier Texte, Prüfer-Bilanz, BSH-Wasserstand mit Lizenz statt Sperre', /DWD CWAM/.test(src) && /buscosun Fusion 9/.test(src) && /FQDL50/.test(src) && /WODL45/.test(src) && /Prüfer-Bilanz/i.test(src) && /Wasserstand-Vorhersage \(BSH\)/.test(src) && /CC BY 4\.0/.test(src) && !/blockiert/.test(src), src.slice(0, 120).replace(/\n/g, ' | '));
  // Limits editable (dock): Böen bis 14 → 40 for SUP changes the summary and is stored locally.
  await ctx.evaluate(`[...document.querySelectorAll('.sw-dock .sw-link')].find((b) => /Grenzen/.test(b.textContent)).click()`);
  await until(ctx, `!!document.querySelector('.sw-limits input')`, 3_000);
  await ctx.evaluate(`(() => { const row = [...document.querySelectorAll('.sw-limit-row')].find((r) => /Böen bis/.test(r.textContent)); const i = row.querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '40'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  const lim = await ctx.evaluate(`({ sum: document.querySelector('.sw-prof-sum')?.textContent, stored: localStorage.getItem('sea.limits.v1') })`);
  add('D8 Grenzen im Dock änderbar, lokal gespeichert (sea.limits.v1)', /Böen bis 40 kn/.test(lim.sum ?? '') && /"gustMax":40/.test(lim.stored ?? ''), JSON.stringify(lim));
  // H3: a class "keine" is hatched, never coloured like "passt".
  const hatch = await ctx.evaluate(`(() => { const d = [...document.querySelectorAll('.sw-band-bar')]; const none = d.filter((x) => x.classList.contains('is-hatched')); const ok = d.filter((x) => (x.style.background || '').replace(/\\s/g, '') === 'rgb(141,176,122)'); return { none: none.length, okHatched: ok.filter((x) => x.classList.contains('is-hatched')).length, noneBg: none.map((x) => getComputedStyle(x).backgroundImage).every((b) => /repeating-linear-gradient/.test(b)) }; })()`);
  add('H3 „keine Daten“ im Band schraffiert, nie in der Farbe von „passt“', hatch.okHatched === 0 && hatch.noneBg, JSON.stringify(hatch));
  await shot(ctx, 'desktop-fehmarn');
  off(); allErrors.push(...errors); await ctx.close();
}

// --- F: states --------------------------------------------------------------------------------------------
{
  const { ctx, errors, off } = await openPage({ path: '/seewetter?sea=1', clock: '2026-10-07T19:30:00Z' });
  const ok = await until(ctx, `/Veraltet/.test(document.querySelector('.sw-live')?.textContent ?? '')`, 40_000);
  add('F1 Lauf 19,5 h alt (12-UTC-Lauf fehlt, Schritt zurück auf 00 UTC) ⇒ „Veraltet“, Fläche bleibt', ok && await ctx.evaluate(`/veraltet/.test(document.querySelector('.sw-chip')?.textContent ?? '')`));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/seewetter?sea=1', clock: '2026-10-08T06:40:00Z' });
  const ok = await until(ctx, `/Keine Daten/.test(document.querySelector('.sw-live')?.textContent ?? '') && !!document.querySelector('.sw-map-note')`, 40_000);
  await sleep(1500);
  const st = await ctx.evaluate(`({ note: document.querySelector('.sw-map-note')?.textContent ?? '', band: !!document.querySelector('.sw-band'), fieldReq: performance.getEntriesByType('resource').filter((e) => /\\/f\\/\\d{3}\\.png/.test(e.name)).length })`);
  add('F2 Lauf 30,7 h alt ⇒ „Keine Daten“, Hinweis „keine Seegangsfläche“, kein Band, kein Feld geladen (Prüffrage 4)', ok && /keine Seegangsfläche/.test(st.note) && !st.band && st.fieldReq === 0, JSON.stringify(st));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/seewetter?sea=1', root: killedSite });
  const ok = await until(ctx, `/Keine Daten/.test(document.querySelector('.sw-live')?.textContent ?? '') && /Kill-Schalter/.test(document.querySelector('.sw-map-note')?.textContent ?? '')`, 40_000);
  add('F3 Kill-Schalter (status.killSwitch) ⇒ „Keine Daten“ mit Grund, keine Fläche', ok);
  off(); allErrors.push(...errors); await ctx.close();
}

// --- G: mobile ------------------------------------------------------------------------------------------------
{
  const { ctx, errors, off } = await openPage({ path: '/seewetter/st-peter-ording?sea=1', width: 390, height: 844, mobile: true });
  const ready = await until(ctx, `!!document.querySelector('.sw-sheet-title') && document.querySelectorAll('.sw-band-table thead th button').length > 10`, 60_000);
  await sleep(1500);
  const m = await ctx.evaluate(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }; const small = [...document.querySelectorAll('button, a')].filter((b) => { const x = b.getBoundingClientRect(); return b.offsetParent !== null && x.width > 0 && x.bottom > 0 && x.top < innerHeight && x.left < innerWidth && (x.height < 44 && !b.closest('.sw-band-table') && !b.closest('.maplibregl-ctrl')) ; }).map((b) => (b.className || b.tagName) + ':' + Math.round(b.getBoundingClientRect().height)); return { pill: r('.sw-m-top .sw-pill'), share: r('.sw-m-share'), sheet: r('.sw-sheet'), title: document.querySelector('.sw-sheet-title')?.textContent, small }; })()`);
  add('G1 Mobil: Spot-Pille 52 px, Teilen 44 × 44, Sheet „Spot-Briefing“ am unteren Rand', ready && m.pill?.[3] === 52 && m.share?.[2] === 44 && m.share?.[3] === 44 && m.sheet && m.sheet[1] + m.sheet[3] === 844, JSON.stringify({ pill: m.pill, share: m.share, sheet: m.sheet }));
  add('G2 Mobil: Kopfzeile nennt zuerst die amtliche Meldung (German Bight) statt eines Urteils', /amtliche Meldung/.test(m.title ?? ''), m.title);
  add('G3 Mobil: jede sichtbare Schaltfläche außerhalb der Bandzellen ≥ 44 px hoch', m.small.length === 0, m.small.slice(0, 6).join(' '));
  const bandM = await ctx.evaluate(`(() => { const th = [...document.querySelectorAll('.sw-band.is-compact .sw-band-table thead th')].filter((t) => t.querySelector('button')); const b = th.map((t) => { const r = t.querySelector('button').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }); return { n: b.length, minW: Math.min(...b.map((x) => x[0])), minH: Math.min(...b.map((x) => x[1])) }; })()`);
  add('G4 Mobil: Stundenzellen des Bandes ≥ 44 × 44 px (V-SW-8)', bandM.n > 10 && bandM.minW >= 44 && bandM.minH >= 44, JSON.stringify(bandM));
  await shot(ctx, 'mobile-default');
  off(); allErrors.push(...errors); await ctx.close();
}

// --- K: V-SW-20 — an hour without sea state at the model cell is never shown as "0,0 m" ---------------------------
{
  const { seaNoSeaAt } = await import('../src/sea/seaContract.ts');
  const doc = JSON.parse(readFileSync(join(site, 'spots', `${RUN}.json`), 'utf8'));
  const FIRST = 12, N = 79 - FIRST;                         // page clock 12:40 UTC ⇒ axis = run hours 12 … 78
  const dryOn = (id) => Array.from({ length: N }, (_, kk) => seaNoSeaAt(doc.spots[id].v, FIRST + kk));
  const cat = JSON.parse(readFileSync(join(site, 'static', 'spots.json'), 'utf8')).spots;
  // A spot WITHOUT the hand flag `tidal` whose cell is dry at the chosen hour, and one without a single dry hour.
  const dryId = cat.find((s) => !s.tidal && s.region === 'nordsee' && dryOn(s.id)[0] && dryOn(s.id).filter(Boolean).length >= 10)?.id ?? null;
  const wetId = cat.find((s) => s.region === 'ostsee' && dryOn(s.id).every((d) => !d) && doc.spots[s.id].v.hs.slice(FIRST).every((x) => x !== 0))?.id ?? null;
  const nDry = dryId ? dryOn(dryId).filter(Boolean).length : 0;
  add('K0 Fixture: ein Nordsee-Spot ohne Handmarke „Watt“ mit trockener Zelle zur gewählten Stunde, ein Ostsee-Spot ohne eine solche Stunde', !!dryId && !!wetId, `${dryId} (${nDry} von ${N} h) · ${wetId}`);
  const READ = `(() => {
    const q = (s) => document.querySelector(s)?.textContent ?? '';
    const waveRow = [...document.querySelectorAll('.sw-band-table tbody tr')].find((r) => r.querySelector('th')?.textContent === 'Welle m');
    const cells = waveRow ? [...waveRow.querySelectorAll('td')] : [];
    const bars = [...document.querySelectorAll('.sw-band-bar')];
    const dryIdx = cells.map((c, i) => (c.querySelector('.sw-band-dry') ? i : -1)).filter((i) => i >= 0);
    return { hero: q('.sw-hero-mid'), sub: document.querySelectorAll('.sw-hero-sub')[1]?.textContent ?? '', verdict: q('.sw-verdict'), note: q('.sw-note.is-dry'), meta: q('.sw-spot-meta'),
      dryCells: dryIdx.length, zeroCells: cells.filter((c) => c.textContent.trim() === '0,0').length, sr: cells[dryIdx[0]]?.querySelector('.sw-sr')?.textContent ?? '',
      dryHatched: dryIdx.filter((i) => bars[i]?.classList.contains('is-hatched')).length, dryOk: dryIdx.filter((i) => ['rgb(141,176,122)', 'rgb(227,154,59)'].includes((bars[i]?.style.background || '').split(' ').join(''))).length, foot: q('.sw-band-foot'), legend: q('.sw-chart-legend'), callout: q('.sw-callout') || q('.maplibregl-marker.sw-callout') || '',
      vals: [...document.querySelectorAll('.sw-vals strong')].map((e) => e.textContent) };
  })()`;
  if (dryId && wetId) {
    // Profile Angeln (wind ≤ 16 kn, gusts ≤ 22 kn, wave ≤ 1,2 m; no shore-angle and no daylight rule): at 8 kn the hour was "passt".
    const { ctx, errors, off } = await openPage({ path: `/seewetter/${dryId}?p=angeln` });
    const ready = await until(ctx, `${READY} && !!document.querySelector('.sw-hero-mid')`, 60_000);
    await sleep(1500);
    const r = await ctx.evaluate(READ);
    add('K1 trockene Stunde: Anzeige „kein Seegang“ statt „0,0 m“, darunter „trockengefallen (Gezeit)“, Windsee und Dünung „–“, auch die Marke auf der Karte', ready && r.hero === 'kein Seegang' && /trockengefallen \(Gezeit\)/.test(r.sub) && r.vals[0] === '–' && r.vals[1] === '–' && !/0,0 m/.test(r.hero + r.vals.join(' ') + r.callout) && /kein Seegang/.test(r.callout), JSON.stringify({ hero: r.hero, sub: r.sub, vals: r.vals.slice(0, 2), callout: r.callout }));
    add(`K2 Stundenband: genau die ${nDry} Stunden des Zustands tragen ∅ (mit Text für Vorleser), keine Zelle „0,0“, die Fußzeile erklärt das Zeichen`, r.dryCells === nDry && r.zeroCells === 0 && r.sr === 'kein Seegang' && /∅ = Modellzelle ohne Wasser/.test(r.foot), JSON.stringify({ dry: r.dryCells, zero: r.zeroCells, foot: r.foot.slice(-60) }));
    add(`K3 Hinweis aus den Daten (Spot ohne Handmarke „Watt“): „Watt: … in ${nDry} der nächsten ${N} Stunden … keinen Seegang“, Verweis auf die Karte „Wasserstand“, Abstand der Modellzelle; Verlauf nennt „Modellzelle ohne Wasser“`,
      new RegExp(`^Watt: .*in ${nDry} der nächsten ${N} Stunden gibt es dort keinen Seegang`).test(r.note) && /Den Wasserstand selbst zeigt die Karte „Wasserstand“/.test(r.note) && /km vom Spot/.test(r.note) && !/Watt/.test(r.meta) && /Modellzelle ohne Wasser/.test(r.legend), r.note.slice(0, 140));
    add('K4 Einordnung (Profil Angeln, Grenze Welle ≤ 1,2 m): die trockene Stunde ist „keine Daten · Wasser an der Modellzelle fehlt“; im Band ist keine der Stunden des Zustands grün oder orange (schraffiert, oder rot wegen einer überschrittenen Grenze)', /keine Daten/.test(r.verdict) && /Wasser an der Modellzelle fehlt/.test(r.verdict) && r.dryOk === 0 && r.dryHatched > 0, `${r.verdict} · schraffiert ${r.dryHatched}/${nDry}, grün/orange ${r.dryOk}`);
    await shot(ctx, 'desktop-dry');
    off(); allErrors.push(...errors); await ctx.close();
    // Named fallback: the classes as before, the display still honest.
    const b = await openPage({ path: `/seewetter/${dryId}?p=angeln&seadry=0` });
    await until(b.ctx, `${READY} && !!document.querySelector('.sw-hero-mid')`, 60_000);
    await sleep(1200);
    const rb = await b.ctx.evaluate(READ);
    add('K5 Rückfall ?seadry=0: Klassen wie zuvor — dieselbe Stunde „passt“, im Band grüne Stunden im Zustand; die Anzeige bleibt „kein Seegang“ und der Hinweis verspricht keine fehlende Einordnung', /passt zu deinen Grenzen/.test(rb.verdict) && rb.dryOk > 0 && rb.hero === 'kein Seegang' && rb.dryCells === nDry && !/nicht nach deinem Profil eingeordnet/.test(rb.note) && /nicht nach deinem Profil eingeordnet/.test(r.note), `${rb.verdict} · grün/orange ${rb.dryOk}`);
    b.off(); allErrors.push(...b.errors); await b.ctx.close();
    // Negative control: a spot without one such hour shows numbers and none of the new marks.
    const w = await openPage({ path: `/seewetter/${wetId}?p=angeln` });
    await until(w.ctx, `${READY} && !!document.querySelector('.sw-hero-mid')`, 60_000);
    await sleep(1200);
    const rw = await w.ctx.evaluate(READ);
    add('K6 Gegenprobe (Spot ohne eine solche Stunde): Wellenhöhe als Zahl in m, kein ∅, kein Hinweis, keine Fußzeile dazu, kein Legendeneintrag', / m$/.test(rw.hero) && rw.dryCells === 0 && rw.note === '' && !/∅/.test(rw.foot) && !/Modellzelle ohne Wasser/.test(rw.legend), JSON.stringify({ hero: rw.hero, dry: rw.dryCells }));
    w.off(); allErrors.push(...w.errors); await w.ctx.close();
    // Mobile: the sheet's lead sentence.
    const m = await openPage({ path: `/seewetter/${dryId}?p=angeln`, width: 390, height: 844, mobile: true });
    await until(m.ctx, `!!document.querySelector('.sw-sheet-lead') && document.querySelectorAll('.sw-band-table thead th button').length > 10`, 60_000);
    await sleep(1200);
    const lead = await m.ctx.evaluate(`document.querySelector('.sw-sheet-lead')?.textContent ?? ''`);
    add('K7 mobil: der Satz im Spot-Briefing sagt „Kein Seegang: Modellzelle ohne Wasser“, nicht „Welle 0,0 m“', /Kein Seegang: Modellzelle ohne Wasser/.test(lead) && !/Welle 0,0/.test(lead), lead.slice(0, 120));
    await shot(m.ctx, 'mobile-dry');
    m.off(); allErrors.push(...m.errors); await m.ctx.close();
  }
}

// --- L: WL — Wasserstandsvorhersage des BSH (audit/wasserstand-bsh.md) -------------------------------------
// The water level fixtures are of 12.10.2026, so this block runs on that clock; the CWAM run of the store is
// then older than 30 h ("Keine Daten") — exactly the case in which the card must still stand on its own.
{
  const m = await openPage({ path: '/seewetter/cuxhaven-duhnen?tab=spot', clock: '2026-10-12T15:30:00Z' });
  await until(m.ctx, `!!document.querySelector('.sw-readout')`, 20_000);
  await until(m.ctx, `/Pegel /.test(document.querySelector('.sw-readout')?.innerText ?? '')`, 20_000).catch(() => {});
  // The harness must have ANSWERED the service itself — otherwise the block below would measure the live BSH
  // service and nobody would notice (the reader asks with `cache: 'default'`, so a cache hit skips Fetch).
  const bshSeen = requested.filter((u) => /gdi\.bsh\.de/.test(u));
  add('L0 Die BSH-Antwort kommt aus der Fixture, nicht aus dem Netz (netzfrei, Hausregel)',
    bshSeen.length >= 1 && bshSeen.every((u) => /\/items\/[a-z0-9_]+\?/.test(u)),
    `${bshSeen.length} abgefangen: ${bshSeen.map((u) => u.replace(/^.*\/items\//, '')).join(', ') || 'KEINE'}`);
  const card = await m.ctx.evaluate(`(() => {
    const el = [...document.querySelectorAll('.sw-card')].find((c) => /wasserstand . amtlich/i.test(c.innerText));
    if (!el) return null;
    return {
      txt: el.innerText,
      chart: !!el.querySelector('.sw-chart svg'),
      vertices: [...(el.querySelectorAll('.sw-chart svg path') ?? [])].map((p) => ((p.getAttribute('d') || '').match(/[LM]/g) || []).length).filter((n) => n > 5),
      events: [...el.querySelectorAll('.sw-wl-events li')].map((li) => li.innerText.split('\\n').join(' ')),
      links: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      cat: !!el.querySelector('.sw-wl-cat'),
      // WL-5: the fill glass — its text, the marks drawn, the water rect and the value line of the SVG.
      fill: (() => {
        const f = el.querySelector('.sw-wl-fill');
        if (!f) return null;
        const svg = f.querySelector('svg');
        const water = f.querySelector('.sw-wl-fill-water');
        const r = water ? water.getBoundingClientRect() : null;
        return {
          txt: f.innerText, kind: f.getAttribute('data-kind'), band: f.getAttribute('data-band'),
          marks: [...f.querySelectorAll('svg text')].map((t) => t.textContent),
          waterH: r ? Math.round(r.height) : -1, glassH: svg ? Math.round(svg.getBoundingClientRect().height) : -1,
          label: svg?.getAttribute('aria-label') ?? '',
          big: f.querySelector('strong')?.innerText ?? '',
        };
      })(),
    };
  })()`);
  add('L1b Füllstand (WL-5): Glas mit Wasserstand, Marken MThw/MTnw/NHN, Wert in cm über Pegelnull, Herkunft und Uhrzeit',
    !!card?.fill && card.fill.waterH > 0 && card.fill.waterH < card.fill.glassH
    && card.fill.marks.some((t) => /^MThw 656$/.test(t)) && card.fill.marks.some((t) => /^MTnw 366$/.test(t)) && card.fill.marks.some((t) => /^NHN 503$/.test(t))
    && /^\d+(,\d)? cm über Pegelnull$/i.test(card.fill.big.replace(/\s+/g, ' ')) && /Füllstand · (Vorhersage|gemessen) \d\d:\d\d Uhr/i.test(card.fill.txt)
    && (card.fill.kind === 'forecast' || card.fill.kind === 'measured') && /Füllstand des Pegels: \d+/.test(card.fill.label),
    card?.fill ? `${card.fill.big.replace(/\n/g, ' ')} · Wasser ${card.fill.waterH}/${card.fill.glassH} px · ${card.fill.marks.join(', ')}` : 'kein Glas');
  add('L1c Füllstand: Differenzen gegen MTnw/MThw und NHN als Subtraktion, Lage im Tidehub benannt — kein Wert erfunden',
    !!card?.fill && /cm gegen MTnw · [+−±]\d+(,\d)? cm gegen MThw/.test(card.fill.txt) && /cm (über|unter|auf) NHN/.test(card.fill.txt)
    && (card.fill.band === 'within' ? /Tidehub zu -?\d+ % gefüllt/.test(card.fill.txt) : /(über|unter) dem Tidehub/.test(card.fill.txt))
    && (() => {
      const big = Number(card.fill.big.replace(/\s.*$/s, '').replace(',', '.'));
      const m = card.fill.txt.match(/([+−±])(\d+(?:,\d)?) cm gegen MTnw · ([+−±])(\d+(?:,\d)?) cm gegen MThw/);
      if (!m) return false;
      const low = (m[1] === '−' ? -1 : 1) * Number(m[2].replace(',', '.')), highV = (m[3] === '−' ? -1 : 1) * Number(m[4].replace(',', '.'));
      return Math.abs(low - (big - 366)) < 0.11 && Math.abs(highV - (big - 656)) < 0.11;
    })(),
    card?.fill ? card.fill.txt.replace(/\n/g, ' | ') : '');
  add('L1 Die Karte „Wasserstand · amtlich (BSH)“ steht im Spot-Reiter, mit Pegelname, Entfernung und Bezugshöhen',
    !!card && /Pegel Cuxhaven, Steubenhöft, Elbe/.test(card.txt) && /km vom Spot/.test(card.txt)
    && /Pegelnull 503 cm unter NHN/.test(card.txt) && /MThw 656 cm/.test(card.txt) && /MTnw 366 cm/.test(card.txt),
    card ? card.txt.split('\n').slice(0, 4).join(' | ') : 'keine Karte');
  add('L2 cm über Pegelnull als Einheit, nicht in Meter über Meeresspiegel umgerechnet (E-WL-9)',
    !!card && /cm über Pegelnull/i.test(card.txt) && !/über Meeresspiegel|ü\. NN|m NHN/.test(card.txt), '');
  add('L2b Zahlen deutsch: die halbe Zentimeter-Unsicherheit steht mit Komma, nicht mit Punkt',
    !!card && /± 12,5 cm/.test(card.txt) && !/\d\.\d cm/.test(card.txt),
    (card?.events ?? []).find((e) => /12,5|12\.5/.test(e)) ?? 'kein halber Zentimeter in dieser Antwort');
  add('L3 Hoch- und Niedrigwasser mit Höhe; der amtliche Wert trägt ±, der automatische die Herkunft (V-WL-8)',
    !!card && card.events.length === 4 && /Hochwasser|Niedrigwasser/.test(card.events[0])
    && card.events.some((e) => /± \d+ cm/.test(e) && /amtlich/.test(e))
    && card.events.every((e) => /amtlich|automatisch \(MOS r[0-5]\)|nur Zeit, kein Wert/.test(e)),
    (card?.events ?? []).join('  //  ').slice(0, 220));
  add('L4 Verlauf gezeichnet (gemessen, Vorhersage, Gezeit) mit Legende',
    !!card && card.chart && /gemessen/.test(card.txt) && /Vorhersage/.test(card.txt) && /Gezeit/.test(card.txt), '');
  // The fixture holds 120 curve points of which 74 fall into the window now−6 h … now+48 h; the live service
  // would deliver roughly 330 over the full 48 h. The vertex count is therefore the honest proof of origin.
  add('L4b Der gezeichnete Verlauf stammt aus der Fixture: Stützstellen passen zum Fenster, nicht zum Live-Dienst',
    !!card && card.vertices.length === 3 && Math.max(...card.vertices) <= 74 && Math.max(...card.vertices) >= 30,
    JSON.stringify(card?.vertices ?? []));
  add('L5 Beide Zeitstempel sichtbar (Auftrag 3)',
    !!card && /Modellkurve \w+ \d\d\.\d\d\. \d\d:\d\d/.test(card.txt) && /amtliche Vorhersage \w+ \d\d\.\d\d\. \d\d:\d\d/.test(card.txt),
    (card?.txt.split(String.fromCharCode(10)).find((l) => l.startsWith('Modellkurve')) ?? ''));
  add('L6 Amtlicher Text wörtlich, als Gebietstext gekennzeichnet (E-WL-8)',
    !!card && /Amtlicher Text · Elbe/.test(card.txt) && /wörtlich/.test(card.txt)
    && /mittlere Hochwasser/.test(card.txt) && !/<b>/.test(card.txt),
    '');
  add('L7 Attribution sichtbar mit Link auf Lizenz, Quelle und amtlichen Warndienst (Auftrag 4/5)',
    !!card && /Bundesamt für Seeschifffahrt und Hydrographie \(BSH\)/.test(card.txt) && /eigene Darstellung/.test(card.txt)
    && card.links.some((h) => /creativecommons\.org\/licenses\/by\/4\.0/.test(h))
    && card.links.some((h) => /gdi\.bsh\.de/.test(h)) && card.links.some((h) => /sturmflutwarndienst\.de/.test(h))
    && /keine Gewähr/.test(card.txt) && /Verbindlich ist die amtliche Veröffentlichung/.test(card.txt),
    (card?.links ?? []).join(' | '));
  add('L8 Im Normalfall kein Kategorie-Kasten über den Zahlen (E-WL-6, V-WL-3)',
    !!card && card.cat === false && !/Kategorie des BSH/.test(card.txt), '');
  const gauges = await m.ctx.evaluate(`(() => { const s = document.querySelector('canvas') ? 1 : 0; return { canvas: s }; })()`);
  add('L9 Die Karte trägt die Pegel-Ebene (Quelle sw-gauges gesetzt)',
    !!gauges, '');
  await shot(m.ctx, 'waterlevel');
  m.off(); allErrors.push(...m.errors); await m.ctx.close();

  // ?wl=0: the page before WL — no card, no request to the service.
  const before = requested.length;
  const o = await openPage({ path: '/seewetter/cuxhaven-duhnen?tab=spot&wl=0', clock: '2026-10-12T15:30:00Z' });
  await until(o.ctx, `!!document.querySelector('.sw-readout')`, 20_000);
  await sleep(1500);
  const off = await o.ctx.evaluate(`(() => ({
    card: [...document.querySelectorAll('.sw-card')].some((c) => /wasserstand . amtlich/i.test(c.innerText)),
    dock: /Wasserstand-Vorhersage/.test(document.querySelector('.sw-dock')?.innerText ?? ''),
    blocked: /blockiert|Lizenz ungeklärt/.test(document.body.innerText),
  }))()`);
  add('L10 ?wl=0: keine Karte, kein Abruf an den Dienst, kein Abruf des Katalogs — der Schalter bleibt im Dock',
    off.card === false && off.dock === true
    && !requested.slice(before).some((u) => /gdi\.bsh\.de|static\/gauges\.json/.test(u)),
    requested.slice(before).filter((u) => /gdi|gauges/.test(u)).join(' | ') || 'keine');
  add('L11 Nirgends mehr „blockiert“ oder „Lizenz ungeklärt“ auf der Seite', off.blocked === false, '');
  o.off(); allErrors.push(...o.errors); await o.ctx.close();

  // Ostsee-Form: Kurve ohne Gezeit, keine Hoch-/Niedrigwasserzeiten — die Karte sagt es, statt „–“ zu zeigen.
  const bBefore = requested.length;
  const b = await openPage({ path: '/seewetter/warnemuende?tab=spot', clock: '2026-10-12T15:30:00Z' });
  await until(b.ctx, `!!document.querySelector('.sw-readout')`, 20_000);
  // Wait until the card has settled (neither absent nor "lädt"), then say which gauge requests the harness saw.
  await until(b.ctx, `(() => { const t = document.querySelector('.sw-readout')?.innerText ?? ''; return /wasserstand . amtlich/i.test(t) && !/Wasserstand lädt/.test(t); })()`, 20_000).catch(() => {});
  const bReq = requested.slice(bBefore).filter((u) => /gdi\.bsh\.de|gauges\.json/.test(u)).map((u) => u.replace(/^.*\/(items\/|static\/)/, '').replace(/\?.*$/, ''));
  add('L12a Ostsee-Seite: Katalog und der Pegel Warnemünde wurden abgefragt und aus der Fixture beantwortet',
    bReq.some((u) => /^gauges\.json/.test(u)) && bReq.some((u) => /^warnemuende$/.test(u)), bReq.join(', ') || 'keine Abrufe');
  const balt = await b.ctx.evaluate(`(() => {
    const el = [...document.querySelectorAll('.sw-card')].find((c) => /wasserstand . amtlich/i.test(c.innerText));
    return el ? {
      txt: el.innerText, chart: !!el.querySelector('.sw-chart svg'), events: el.querySelectorAll('.sw-wl-events li').length,
      fill: el.querySelector('.sw-wl-fill')?.innerText ?? null,
      marks: [...el.querySelectorAll('.sw-wl-fill svg text')].map((t) => t.textContent),
    } : null;
  })()`);
  add('L12b Ostsee-Füllstand: Marken MHW/MNW/NHN statt MThw/MTnw, „Spanne MNW–MHW“ statt Tidehub (keine Gezeit)',
    !!balt?.fill && balt.marks.some((t) => /^MHW \d+$/.test(t)) && balt.marks.some((t) => /^MNW \d+$/.test(t)) && balt.marks.some((t) => /^NHN \d+$/.test(t))
    && !balt.marks.some((t) => /MT[hn]w/.test(t)) && !/Tidehub/.test(balt.fill) && /gegen MNW .* gegen MHW|Spanne MNW–MHW/.test(balt.fill)
    && /MHW \d+ cm · MNW \d+ cm/.test(balt.txt) && !/MThw/.test(balt.txt),
    balt?.fill ? `${balt.fill.replace(/\n/g, ' | ')} · ${balt.marks.join(', ')}` : 'kein Glas');
  add('L12 Ostsee: kein Hoch-/Niedrigwasser — die Karte benennt es und zeichnet trotzdem den Verlauf (V-WL-6)',
    !!balt && balt.events === 0 && balt.chart === true
    && /führt keine Hoch-\/Niedrigwasserzeiten/.test(balt.txt) && /Ostsee/.test(balt.txt) && !/Gezeit/.test(balt.txt),
    balt ? balt.txt.split('\n').slice(0, 3).join(' | ') : 'keine Karte');
  b.off(); allErrors.push(...b.errors); await b.ctx.close();
}

add('I1 Konsole: keine unbehandelte Ausnahme', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));
await browser.close();
rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:sea-ui — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
