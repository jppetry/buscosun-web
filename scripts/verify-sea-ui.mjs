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
 *   A  flag gate: off by default (SEA_LIVE false) — route 404, no tile; `?sea=1` page + tile 12 + palette 13
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
const browser = await openBrowser(chrome, { timeoutMs: 120_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const requested = [];

async function openPage({ path, width = 1440, height = 900, mobile = false, clock = '2026-10-07T12:40:00Z', root = site, storage = null }) {
  const ctx = await browser.newContext({ width, height, mobile });
  const errors = [];
  const off = browser.on(async (msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? msg.params.exceptionDetails?.text);
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
      if (/weather_reports\/poi\//.test(url)) {
        await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'text/csv' }], body: poiCsv.toString('base64') }).catch(() => {});
        return;
      }
      await ctx.send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
    }
  });
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*sea/v1/*' }, { urlPattern: '*weather_reports/poi/*' }] });
  await ctx.send('Network.setBypassServiceWorker', { bypass: true });
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
  const { ctx, errors, off } = await openPage({ path: '/seewetter' });
  const notFound = await until(ctx, `!!document.querySelector('h1') && /nicht gefunden|404/i.test(document.body.innerText) && !document.querySelector('.sw-root')`, 20_000);
  add('A1 ohne ?sea=1: /seewetter antwortet wie ein unbekannter Pfad (SEA_LIVE aus)', notFound);
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/' });
  await until(ctx, `!!document.querySelector('.deck-chips-count')`, 20_000);
  await sleep(800);
  const r = await ctx.evaluate(`({ tile: [...document.querySelectorAll('.deck-tile')].some((t) => /Seewetter/.test(t.getAttribute('aria-label') ?? '')), count: document.querySelector('.deck-chips-count')?.textContent ?? '', rail: [...document.querySelectorAll('a[title]')].some((a) => a.getAttribute('title') === 'Seewetter') })`);
  add('A2 Startseite ohne Flag: keine Seewetter-Kachel, Zähler unverändert „11 Werkzeuge“', !r.tile && /11/.test(r.count) && !r.rail, JSON.stringify(r));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/?sea=1' });
  await until(ctx, `!!document.querySelector('.deck-chips-count')`, 20_000);
  await sleep(800);
  const r = await ctx.evaluate(`({ tile: [...document.querySelectorAll('.deck-tile')].some((t) => /Seewetter/.test(t.getAttribute('aria-label') ?? '') && t.offsetParent !== null), eyebrow: [...document.querySelectorAll('.tile-eyebrow')].map((e) => e.textContent).find((t) => /SEEWETTER/.test(t)) ?? null, count: document.querySelector('.deck-chips-count')?.textContent ?? '' })`);
  add('A3 Startseite mit ?sea=1: Kachel „12 · SEEWETTER“ sichtbar, Zähler 12', r.tile && r.eyebrow === '12 · SEEWETTER' && /12/.test(r.count), JSON.stringify(r));
  off(); allErrors.push(...errors); await ctx.close();
}

// --- B–E, H: desktop with data -----------------------------------------------------------------------------
{
  const { ctx, errors, off } = await openPage({ path: '/seewetter?sea=1' });
  const ready = await until(ctx, READY, 60_000);
  add('B0 mit ?sea=1: Deck mit Daten aus dem Fixture-Speicher', ready);
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
  add('D7 Reiter Quellen: Lauf, buscosun Fusion, vier Texte, Prüfer-Bilanz, gesperrte BSH-Vorhersage', /DWD CWAM/.test(src) && /buscosun Fusion 9/.test(src) && /FQDL50/.test(src) && /WODL45/.test(src) && /Prüfer-Bilanz/i.test(src) && /blockiert/.test(src), src.slice(0, 120).replace(/\n/g, ' | '));
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

add('I1 Konsole: keine unbehandelte Ausnahme', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));
await browser.close();
rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:sea-ui — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
