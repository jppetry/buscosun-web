/**
 * verify:road-ui — Phase AW (audit/autobahnwetter.md §6): the Autobahnwetter page in a real browser.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-ui.mjs --base=http://127.0.0.1:4173 [--shots=<dir>]
 *   (a running `vite preview` of the current build, or the dev server)
 *
 * Headless Chromium over CDP (scripts/lib/cdpBrowser.mjs) with SwiftShader for MapLibre. The data store is the frozen slot
 * of 03.10.2026 08:00 UTC, derived by the REAL producer (`road-derive.mjs`) into a temp dir and served by request
 * interception for `…/buscosun-data@main/road/v1/*` and raw.githubusercontent; the page's clock is shifted to the slot.
 * The basemap tiles come from the network (they carry no checked content).
 *
 *   A  flag gate: on for everyone since 03.10. (ROAD_LIVE) — page and start-page tile without parameter, `?road=0` hides
 *   B  layout at 1440 × 900: rail 62 · topbar 60 · dock 250 · readout 400 · band over the map foot
 *   C  data: default corridor A 8 München → Salzburg, band ticks = corridor stations, readout shows a station
 *   D  selection: band tick ⇒ readout + URL `st=`; flipping the direction ⇒ `dir=1`; tabs Strecke/Quellen
 *   E  time chips: all four selectable while a forecast run is loaded (AW-6.1b)
 *   P  weather forecast of buscosun Fusion 8 (AW-6.1b): band row, tiles, chip ⇒ URL `t=`, forecast point as selection,
 *      arrival rows, shared link; the fixture is a REAL run file (`fc-a8-2610040905.json`) restamped to the fixture clock
 *   Q  forecast states: no run, stale run, dead run ⇒ chips and band row follow, the measured page stays
 *   F  "no data" never looks like "dry": hatched ticks/badge for stations without a valid measurement
 *   G  states without data: all slots 404 ⇒ "Derzeit keine Messdaten"; kill switch; slot > 45 min ⇒ "Veraltet"; > 3 h ⇒ no data
 *   H  mobile 390 × 844: pill, share 44 px, time chips 36 px, sheet with grip; every visible button ≥ 44 px; motorway picker
 *   I  console: no uncaught exception
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { deriveRoadSlot } from './road/road-derive.mjs';
import { roadFcStamp, roadFcT0 } from '../src/road/roadFc.ts';
import { roadFcValue, roadFcAxisPoints } from '../src/road/roadFcView.ts';
import { f1, hm } from '../src/road/roadView.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'lib', 'fixtures', 'road');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:4173';
const SHOTS = args.shots ?? null;
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- fixture store: the real derive on the frozen slot ---------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'road-ui-'));
const inDir = join(tmp, 'in');
mkdirSync(inDir, { recursive: true });
for (const f of readdirSync(join(FIX, 'swis-2610030800'))) if (f.endsWith('.bin') && !f.startsWith('SD')) cpSync(join(FIX, 'swis-2610030800', f), join(inDir, f));
writeFileSync(join(inDir, 'groups.json'), '{}');
const store = join(tmp, 'store');
mkdirSync(store, { recursive: true });
const site = join(tmp, 'site');
const sum = deriveRoadSlot({ inDir, storeDir: store, outDir: site, stamp: '2610030800', nowIso: '2026-10-03T08:04:30Z' });
mkdirSync(join(site, 'static'), { recursive: true });
cpSync(join(FIX, 'corridors-munich.json'), join(site, 'static', 'corridors.json'));
const killedSite = join(tmp, 'site-killed');
mkdirSync(join(killedSite, 'obs'), { recursive: true });
{
  const o = JSON.parse(readFileSync(join(site, 'obs', '2610030800.json'), 'utf8'));
  writeFileSync(join(killedSite, 'obs', '2610030800.json'), JSON.stringify({ ...o, killed: true, points: [] }));
  cpSync(join(site, 'static'), join(killedSite, 'static'), { recursive: true });
}
add('A0 Fixture-Slot über den echten Producer abgeleitet (1 555 Punkte, freigegeben)', sum.publish && sum.points > 1400, `${sum.points} Punkte`);

// --- V: view model without a browser (review findings #7, #8) ---------------------------------------------
{
  const view = await import('../src/road/roadView.ts');
  const corr = (n) => ({ id: 'x', stations: Array.from({ length: n }, (_, i) => ({ id: `S${i}`, km: i })) });
  const by = (classes) => new Map(classes.map((c, i) => [`S${i}`, { id: `S${i}`, cls: c, rs: c === 'nodata' ? null : 4 }]));
  const s1 = view.corridorStatus(corr(30), by(['dry', ...Array(29).fill('unknown')]));
  add('V1 D-04 im Dock: 1 trockene + 29 Stationen ohne Zustand ⇒ Status-Punkt NICHT trocken', s1.worst !== 'dry' && view.isHatched(s1.worst), JSON.stringify(s1));
  const s2 = view.corridorStatus(corr(25), by([...Array(20).fill('dry'), 'unknown', 'unknown', 'nodata']));
  add('V2 überwiegend trocken gemessen ⇒ trocken; Zählung trennt „ohne Zustand" (2) von „ohne Messung" (1 + 2 fehlende)', s2.worst === 'dry' && s2.unknown === 2 && s2.nodata === 3 && s2.measured === 22, JSON.stringify(s2));
  const s3 = view.corridorStatus(corr(10), by(['dry', 'dry', 'wet', 'unknown']));
  add('V3 eine nasse Station bestimmt den Punkt (Warnwert vor allem anderen)', s3.worst === 'wet', JSON.stringify(s3));
  const now = Date.UTC(2026, 9, 3, 8, 30);
  const alerts = [
    { id: 'old', onsetMs: now - 3 * 3_600_000, effectiveMs: null, expiresMs: now - 60_000 },
    { id: 'now', onsetMs: now - 3_600_000, effectiveMs: null, expiresMs: now + 3_600_000 },
    { id: 'later', onsetMs: now + 3_600_000, effectiveMs: null, expiresMs: now + 7_200_000 },
  ];
  const act = typeof view.activeRoadWarnings === 'function' ? view.activeRoadWarnings(alerts, now).map((a) => a.id).join(',') : 'activeRoadWarnings fehlt';
  add('W1 Warnungen werden beim Zeichnen nach der Uhr gefiltert (abgelaufen/zukünftig fallen weg)', act === 'now', act);
  add('W2 Warnungen werden spätestens alle 5 min neu geholt', typeof view.ROAD_WARN_REFRESH_MS === 'number' && view.ROAD_WARN_REFRESH_MS <= 5 * 60_000, String(view.ROAD_WARN_REFRESH_MS));
  // E-AW-13 (Jan 03.10.): default station = most critical class first (ice, frost, wet), then the coldest road.
  const pt = (id, cls, rs) => ({ id, cls, rs });
  const pick = (ps) => (typeof view.defaultRoadStation === 'function' ? view.defaultRoadStation(ps)?.id ?? null : 'defaultRoadStation fehlt');
  const v4 = [
    pick([pt('dry', 'dry', -3), pt('wet', 'wet', 6), pt('unk', 'unknown', -5), pt('frost', 'frost', 0.5), pt('ice', 'ice', 2)]),
    pick([pt('dry', 'dry', -3), pt('wetWarm', 'wet', 6), pt('wetCold', 'wet', 3), pt('unk', 'unknown', -5)]),
    pick([pt('frostA', 'frost', 0.8), pt('frostB', 'frost', -1.2), pt('wet', 'wet', -4)]),
  ];
  add('V4 Voreinstellung (E-AW-13): kritischste Klasse zuerst (Glätte vor Frost vor Nässe), bei Gleichstand die kälteste Fahrbahn',
    v4.join() === 'ice,wetCold,frostB', v4.join());
  const v5 = [
    pick([pt('dry', 'dry', 1), pt('unk', 'unknown', -2), pt('none', 'nodata', null)]),
    pick([pt('n1', 'nodata', null), pt('n2', 'nodata', null)]),
    pick([pt('wetNoT', 'wet', null), pt('dry', 'dry', -6)]),
    pick([]),
  ];
  add('V5 ohne Warnklasse wie bisher die kälteste gemessene Fahrbahn; ohne Messung die erste Station; Nässe ohne Temperatur schlägt trocken; leer ⇒ keine',
    v5.join() === 'unk,n1,wetNoT,', v5.join());
}

const SLOT_MS = Date.UTC(2026, 9, 3, 8, 0);

// --- fixture: route forecast — a real run file of corridor a8, restamped (run, issue time, first hour) -------------
const fcReal = JSON.parse(readFileSync(join(FIX, 'fc-a8-2610040905.json'), 'utf8'));
const mkFcSite = (name, issuedMs) => {
  const dir = join(tmp, name);
  const run = roadFcStamp(issuedMs), t0Ms = roadFcT0(issuedMs), issuedAt = new Date(issuedMs).toISOString();
  const file = { ...fcReal, run, issuedAt, t0Ms };
  mkdirSync(join(dir, run, 'c'), { recursive: true });
  writeFileSync(join(dir, run, 'c', 'a8.json'), JSON.stringify(file));
  writeFileSync(join(dir, 'index.json'), JSON.stringify({
    schema: 1, product: 'road-fc-index', updatedAt: issuedAt, killed: false,
    runs: [{ run, issuedAt, t0Ms, publishedAt: new Date(issuedMs + 120_000).toISOString(), points: file.points.length, failed: 0, corridors: 1, states: 0, engine: file.engine, ms: 1 }],
  }));
  return { dir, file };
};
const fcLive = mkFcSite('fc-live', SLOT_MS - 5 * 60_000);
const fcStale = mkFcSite('fc-stale', SLOT_MS - 4 * 3_600_000);
const fcDead = mkFcSite('fc-dead', SLOT_MS - 13 * 3_600_000);
const fcNone = join(tmp, 'fc-none');
mkdirSync(fcNone, { recursive: true });
const fcAxis = roadFcAxisPoints(fcLive.file);
add('A0b Prognose-Fixture: echter Lauf des Korridors a8 (Achspunkte + Stationen, 49 Schritte)', fcAxis.length >= 20 && fcLive.file.points.length > fcAxis.length && fcLive.file.steps === 49, `${fcAxis.length} Achspunkte, ${fcLive.file.points.length} Punkte`);
/** Page clock = slot + offset (minutes), advancing in real time. */
const clockScript = (offsetMin) => `(() => {
  const shift = ${SLOT_MS + offsetMin * 60_000} - Date.now();
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + shift); else super(...a); }
    static now() { return RealDate.now() + shift; }
  }
  globalThis.Date = FakeDate;
})();`;

const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden'); process.exit(2); }
const browser = await openBrowser(chrome, { timeoutMs: 90_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function openPage({ path, width = 1440, height = 900, mobile = false, offsetMin = 12, root = site, fcRoot = fcLive.dir }) {
  const ctx = await browser.newContext({ width, height, mobile });
  const errors = [];
  const served = [];
  const off = browser.on(async (msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? msg.params.exceptionDetails?.text);
    if (msg.method === 'Fetch.requestPaused') {
      const url = msg.params.request.url;
      const fcm = /(?:buscosun-data@main|buscosun-data\/main)\/road\/fc\/v1\/(.+?)(?:\?.*)?$/.exec(url);
      if (fcm) {
        const file = join(fcRoot, ...fcm[1].split('/'));
        served.push(`fc/${fcm[1]}`);
        const ok = existsSync(file);
        await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: ok ? 200 : 404, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: ok ? readFileSync(file).toString('base64') : '' }).catch(() => {});
        return;
      }
      const m = /(?:buscosun-data@main|buscosun-data\/main)\/road\/v1\/(.+?)(?:\?.*)?$/.exec(url);
      if (m) {
        const file = join(root, ...m[1].split('/'));
        served.push(m[1]);
        if (existsSync(file)) {
          await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: readFileSync(file).toString('base64') }).catch(() => {});
        } else {
          await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 404, responseHeaders: [{ name: 'access-control-allow-origin', value: '*' }], body: '' }).catch(() => {});
        }
        return;
      }
      // DWD warnings fail on purpose (the page fetches them through the same-origin proxy `/_dwd_opendata/…`):
      // the test must never depend on the live feed.
      if (/(?:opendata\.dwd\.de|\/_dwd_opendata)\/weather\/alerts\//.test(url)) {
        await ctx.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'Failed' }).catch(() => {});
        return;
      }
      await ctx.send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
    }
  });
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*road/v1/*' }, { urlPattern: '*road/fc/v1/*' }, { urlPattern: '*opendata.dwd.de/weather/alerts/*' }, { urlPattern: '*/_dwd_opendata/weather/alerts/*' }] });
  // The app's service worker answers same-origin requests (warnings via `/_dwd_opendata/…`) before page-level
  // interception sees them — bypass it, the test must not depend on the live DWD feed.
  await ctx.send('Network.enable', {});
  await ctx.send('Network.setBypassServiceWorker', { bypass: true });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: clockScript(offsetMin) });
  await ctx.send('Page.navigate', { url: `${BASE}${path}` });
  return { ctx, errors, served, off };
}
const until = async (ctx, expr, ms = 20_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ctx.evaluate(expr).catch(() => false)) return true; await sleep(150); }
  return false;
};
const shot = async (ctx, name) => {
  if (!SHOTS) return;
  // SwiftShader is slow: wait for an idle frame of the map (test hook `data-idle`), then a little longer.
  await until(ctx, `!!document.querySelector('.aw-map-canvas')?.dataset.idle`, 45_000);
  await sleep(1500);
  mkdirSync(SHOTS, { recursive: true });
  const r = await ctx.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
};
const allErrors = [];

// --- A: flag gate ---------------------------------------------------------------------------------
{
  // Jan 03.10.: the flag is on for everyone (ROAD_LIVE); `?road=0` stays the per-visitor switch-off.
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=0' });
  const notFound = await until(ctx, `!!document.querySelector('h1') && /nicht gefunden|404/i.test(document.body.innerText) && !document.querySelector('.aw-root')`, 15_000);
  add('A1 mit ?road=0: Route antwortet wie ein unbekannter Pfad (Ausschalter je Besucher bleibt)', notFound);
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter' });
  const deck = await until(ctx, `!!document.querySelector('.aw-root') && document.querySelectorAll('.aw-band-tick').length > 5`, 30_000);
  add('A3 ohne Parameter: das Deck rendert (Flag an für alle, ROAD_LIVE)', deck);
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/' });
  const tile = await until(ctx, `[...document.querySelectorAll('.deck-bento > .deck-tile')].some((t) => /Autobahnwetter/.test(t.getAttribute('aria-label') ?? '') && t.offsetParent !== null)`, 20_000);
  const count = await ctx.evaluate(`document.querySelector('.deck-chips-count')?.textContent ?? ''`);
  add('A4 Startseite ohne Parameter: Kachel Autobahnwetter sichtbar, Zähler „11 Werkzeuge"', tile && /11/.test(count), count);
  off(); allErrors.push(...errors); await ctx.close();
}

// --- B–F: desktop with data ---------------------------------------------------------------------------
{
  const { ctx, errors, served, off } = await openPage({ path: '/autobahnwetter?road=1' });
  const ready = await until(ctx, `document.querySelectorAll('.aw-band-tick').length > 5 && !!document.querySelector('.aw-station-name')`, 30_000);
  add('A2 mit ?road=1: Deck mit Daten aus dem Fixture-Slot', ready, served.slice(0, 4).join(' '));
  await sleep(2500);
  const box = await ctx.evaluate(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }; return { rail: r('.aw-rail'), top: r('.aw-topbar'), dock: r('.aw-dock'), map: r('.aw-map'), readout: r('.aw-readout'), band: r('.aw-band') }; })()`);
  add('B1 Maße bei 1440 × 900: Rail 62 · Topbar 60 · Dock 250 · Readout 400 · Karte dazwischen',
    box.rail?.[2] === 62 && box.top?.[3] === 60 && box.dock?.[2] === 250 && box.readout?.[2] === 400 && box.map?.[2] === 1440 - 62 - 250 - 400, JSON.stringify(box));
  add('B2 Streckenband als Panel über dem Kartenfuß (16 px Rand)', box.band && box.band[0] === box.map[0] + 16 && Math.abs(box.band[1] + box.band[3] - (box.map[1] + box.map[3] - 16)) <= 1, JSON.stringify(box.band));
  const c = await ctx.evaluate(`({ pill: document.querySelector('.aw-pill-title')?.textContent, ticks: document.querySelectorAll('.aw-band-tick').length, name: document.querySelector('.aw-station-name')?.textContent, url: location.pathname + location.search, live: document.querySelector('.aw-live')?.textContent, stand: document.querySelector('.aw-topbar-stand')?.textContent, rows: document.querySelectorAll('.aw-road').length })`);
  add('C1 Voreinstellung A 8 „München → Salzburg", 30 Messpunkte im Band, URL /autobahnwetter/a8', c.pill === 'München → Salzburg' && c.ticks === 30 && c.url.startsWith('/autobahnwetter/a8'), JSON.stringify(c));
  add('C2 Topbar: Live, Messung 10:00 Ortszeit, Reihenzahl', /Live/.test(c.live) && /10:00/.test(c.stand) && /von \d+ DWD-Reihen/.test(c.stand), `${c.live} · ${c.stand}`);
  add('C3 Dock listet die Korridore + AT/CH-Zeilen ohne Messung', c.rows >= 9 + 4, String(c.rows));
  {
    // The page shows the station the view model picks on the fixture slot (E-AW-13), not its own choice.
    const view = await import('../src/road/roadView.ts');
    const obsFix = JSON.parse(readFileSync(join(site, 'obs', '2610030800.json'), 'utf8'));
    const a8 = JSON.parse(readFileSync(join(FIX, 'corridors-munich.json'), 'utf8')).corridors.find((x) => x.id === 'a8');
    const byIdFix = new Map(obsFix.points.map((p) => [p.id, p]));
    const want = view.defaultRoadStation?.(a8.stations.map((s) => byIdFix.get(s.id)).filter(Boolean));
    add('C4 Readout zeigt ohne st= die Station der Voreinstellung (E-AW-13)', !!want && c.name === want.n, `${c.name} · erwartet ${want?.n} (${want?.cls}, ${want?.rs} °C)`);
  }
  await shot(ctx, 'desktop-1440');

  // D: selection via a band tick, URL, direction, tabs.
  const pick = await ctx.evaluate(`(() => { const t = [...document.querySelectorAll('.aw-band-tick')][3]; const label = t.getAttribute('aria-label'); t.click(); return label; })()`);
  await sleep(900);
  const sel = await ctx.evaluate(`({ name: document.querySelector('.aw-station-name')?.textContent, url: location.search })`);
  add('D1 Klick auf einen Messpunkt im Band ⇒ Readout zeigt ihn, URL trägt st=', pick.startsWith(sel.name ?? '#') && /[?&]st=[A-Z0-9]+/.test(sel.url), `${pick} → ${sel.name} · ${sel.url}`);
  await ctx.evaluate(`document.querySelector('.aw-pill .aw-icon-btn').click()`);
  await sleep(900);
  const flipped = await ctx.evaluate(`({ t: document.querySelector('.aw-pill-title')?.textContent, url: location.search })`);
  add('D2 Fahrtrichtung wechseln ⇒ „Salzburg → München", URL dir=1', flipped.t === 'Salzburg → München' && /dir=1/.test(flipped.url), JSON.stringify(flipped));
  await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][1].click()`);
  await sleep(600);
  const strecke = await ctx.evaluate(`({ rows: document.querySelectorAll('.aw-table-row:not(.is-fc-row)').length, url: location.search, note: document.querySelector('.aw-readout .aw-note')?.textContent ?? '' })`);
  add('D3 Reiter Strecke: Tabelle mit allen 30 Messpunkten, URL tab=strecke, Hinweis „Messpunkt ≠ Strecke"', strecke.rows === 30 && /tab=strecke/.test(strecke.url) && /Zwischen zwei Messpunkten/.test(strecke.note), JSON.stringify({ rows: strecke.rows, url: strecke.url }));
  await shot(ctx, 'desktop-1440-strecke');
  await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][2].click()`);
  await sleep(400);
  const q = await ctx.evaluate(`({ blocked: document.querySelectorAll('.aw-source.is-blockiert').length, active: document.querySelectorAll('.aw-source.is-aktiv').length, text: document.querySelector('.aw-readout')?.innerText ?? '' })`);
  add('D4 Reiter Quellen: blockierte Quellen sichtbar (3), aktive genannt', q.blocked === 3 && q.active >= 2, JSON.stringify({ blocked: q.blocked, active: q.active }));
  add('D5 Quellen nennen GeoNames (CC BY 4.0) für die Ortsnamen der Korridore (review #9)', /GeoNames/.test(q.text) && /CC BY 4\.0/.test(q.text));
  await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][0].click()`);
  await sleep(300);

  // E: time chips.
  await until(ctx, `!!document.querySelector('.aw-band-fc')`, 15_000);
  const tc = await ctx.evaluate(`[...document.querySelectorAll('.aw-times button')].map((b) => [b.textContent, b.disabled, b.getAttribute('aria-pressed')])`);
  add('E1 Zeitchips: alle vier wählbar, „Jetzt" aktiv (Prognose-Lauf geladen, AW-6.1b)', tc.length === 4 && tc.every((x) => x[1] === false) && tc[0][2] === 'true' && tc.slice(1).every((x) => x[2] === 'false'), JSON.stringify(tc));

  // F: hatched for no valid measurement.
  const hatch = await ctx.evaluate(`(() => {
    const ticks = [...document.querySelectorAll('.aw-band-tick')];
    const nod = ticks.filter((t) => /Keine gültige Messung|Zustand unbekannt/.test(t.getAttribute('aria-label')));
    const flat = nod.filter((t) => !t.classList.contains('is-hatched'));
    if (nod[0]) nod[0].click();
    return { n: nod.length, flat: flat.length };
  })()`);
  await sleep(700);
  const badge = await ctx.evaluate(`({ cls: document.querySelector('.aw-badge')?.className, txt: document.querySelector('.aw-badge')?.textContent })`);
  add('F1 Messpunkte ohne gültige Messung sind im Band schraffiert, nie flächig', hatch.flat === 0, JSON.stringify(hatch));
  add('F2 ihr Readout-Badge ist schraffiert („keine gültige Messung"/„unbekannt")', hatch.n === 0 || /is-hatched/.test(badge.cls ?? ''), JSON.stringify(badge));
  // F3: "keine gültige Messung" only where nothing valid arrived — a station with a road value is measured, even when
  // its condition is unknown (first draft labelled Schweinbach +16,0 °C "keine gültige Messung").
  const heads = [];
  const nHatched = await ctx.evaluate(`[...document.querySelectorAll('.aw-band-tick.is-hatched')].length`);
  for (let i = 0; i < Math.min(nHatched, 8); i++) {
    await ctx.evaluate(`[...document.querySelectorAll('.aw-band-tick.is-hatched')][${i}].click()`);
    await sleep(350);
    heads.push(await ctx.evaluate(`({ hero: document.querySelector('.aw-hero-val')?.textContent, eyebrow: document.querySelector('.aw-station .aw-eyebrow')?.textContent, dots: document.querySelectorAll('.aw-chart circle').length })`));
  }
  const wrong = heads.filter((h) => (h.hero !== '—') === /keine gültige Messung/.test(h.eyebrow ?? ''));
  add('F3 Readout-Kopf: „keine gültige Messung" genau dann, wenn kein Fahrbahnwert da ist', heads.length > 0 && wrong.length === 0 && heads.some((h) => h.hero !== '—'), JSON.stringify(wrong.length ? wrong : heads.slice(0, 2)));
  add('F4 Verlauf 24 h: der jüngste Fahrbahnwert ist als Punkt sichtbar (auch bei einem Slot im Ring)', heads.filter((h) => h.hero !== '—').every((h) => h.dots >= 1), JSON.stringify(heads.map((h) => h.dots)));
  // B3: the border label must not cover the ticks of the band (first draft: a long label hid five ticks at the A 8 end).
  const overlap = await ctx.evaluate(`(() => {
    const labels = [...document.querySelectorAll('.aw-band-border span')].map((e) => e.getBoundingClientRect());
    const ticks = [...document.querySelectorAll('.aw-band-tick')].map((e) => e.getBoundingClientRect());
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return { labels: labels.length, covered: ticks.filter((t) => labels.some((l) => hit(l, t))).length };
  })()`);
  add('B3 Grenzbeschriftung im Band verdeckt keinen Messpunkt', overlap.labels > 0 && overlap.covered === 0, JSON.stringify(overlap));

  // M: review findings #5, #6, #8, #9 in the browser.
  const src = await ctx.evaluate(`({ line: document.querySelector('.aw-sources')?.textContent ?? '', dwd: !!document.querySelector('.aw-readout a[href*="dwd.de"]'), note: [...document.querySelectorAll('.aw-readout .aw-note')].map((e) => e.textContent).join(' | ') })`);
  add('M1 Herkunftszeile in der Form „Datenbasis: Deutscher Wetterdienst …" (docs/API.md §7)', /Datenbasis: Deutscher Wetterdienst/.test(src.line), src.line.slice(0, 160));
  add('M2 Warnungen nicht abrufbar ⇒ kein Ersatztext, aber ein Link zu den amtlichen DWD-Warnungen', src.dwd && /nicht abrufbar/.test(src.note), src.note.slice(0, 160));
  const corrFix = JSON.parse(readFileSync(join(FIX, 'corridors-munich.json'), 'utf8')).corridors;
  const before = await ctx.evaluate(`({ path: location.pathname, search: location.search, title: document.querySelector('.aw-pill-title')?.textContent })`);
  const picked = await ctx.evaluate(`(() => { const rows = [...document.querySelectorAll('.aw-dock .aw-road:not(.is-static)')]; const r = rows.find((x) => !x.classList.contains('is-active') && /A 9\\b/.test(x.textContent)) ?? rows.find((x) => !x.classList.contains('is-active')); const t = r.querySelector('.aw-road-title')?.textContent; r.click(); return t; })()`);
  const target = corrFix.find((c) => c.title === picked);
  await sleep(1500);
  await until(ctx, `Number(document.querySelector('.aw-map-canvas')?.dataset.idle ?? 0) > Date.now() - 1500`, 20_000);
  await sleep(800);
  const b = await ctx.evaluate(`(document.querySelector('.aw-map-canvas')?.dataset.bounds ?? '').split(',').map(Number)`);
  const lons = target?.line.map((p) => p[0]) ?? [], lats = target?.line.map((p) => p[1]) ?? [];
  const bb = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  const inside = b.length === 4 && bb[0] >= b[0] && bb[1] >= b[1] && bb[2] <= b[2] && bb[3] <= b[3];
  const tight = b.length === 4 && (b[2] - b[0]) < 6 * Math.max(0.2, bb[2] - bb[0]);
  add('M3 Korridor im Dock gewählt ⇒ die Karte fährt zu ihm (ganz im Bild, nicht DACH-weit)', !!target && inside && tight, `${picked} · Karte ${b.map((v) => v.toFixed(2)).join(',')} · Korridor ${bb.map((v) => v.toFixed(2)).join(',')}`);
  await ctx.evaluate(`history.back()`);
  const back = await until(ctx, `location.pathname === ${JSON.stringify(before.path)} && document.querySelector('.aw-pill-title')?.textContent === ${JSON.stringify(before.title)}`, 10_000);
  const after = await ctx.evaluate(`({ path: location.pathname, title: document.querySelector('.aw-pill-title')?.textContent })`);
  add('M4 Zurück-Taste nach Korridorwechsel ⇒ Seite zeigt wieder den vorigen Korridor (URL und Inhalt gleich)', back, `${before.path} „${before.title}" → ${after.path} „${after.title}"`);
  // P: weather forecast of buscosun Fusion 8 (AW-6.1b). Expected values come from the fixture file through the view model.
  {
    const pageNow = async () => ctx.evaluate('Date.now()');
    // The checks before changed the corridor and came back: the forecast of a8 is read again — wait for its row.
    await until(ctx, `document.querySelectorAll('.aw-band-fc-cell').length > 5 && /a8/.test(location.pathname)`, 15_000);
    const p1 = await ctx.evaluate(`({ cells: document.querySelectorAll('.aw-band-fc-cell').length, label: document.querySelector('.aw-band-fc-label')?.textContent ?? '', stand: document.querySelector('.aw-topbar-stand')?.textContent ?? '', legend: document.querySelector('.aw-legend')?.textContent ?? '' })`);
    add('P1 Band: Prognose-Zeile mit einer Zelle je Achspunkt, Beschriftung „Prognose Luft jetzt … Lauf 09:55"', p1.cells === fcAxis.length && /Prognose Luft jetzt/.test(p1.label) && /Lauf 09:55/.test(p1.label) && /Prognose Lauf 09:55/.test(p1.stand) && /Prognose Luft/.test(p1.legend), JSON.stringify(p1));
    // Tiles of the default station against the file.
    const stName = await ctx.evaluate(`document.querySelector('.aw-station-name')?.textContent ?? ''`);
    const obsFix = JSON.parse(readFileSync(join(site, 'obs', '2610030800.json'), 'utf8'));
    const stId = obsFix.points.find((x) => x.n === stName)?.id;
    const stFc = fcLive.file.points.find((x) => x.id === stId);
    const now1 = await pageNow();
    const wantTiles = [1, 3, 6].map((h) => { const v = stFc ? roadFcValue(stFc, fcLive.file, now1 + h * 3_600_000) : null; return v ? `${f1(v.t)}°` : '—'; });
    const tiles = await ctx.evaluate(`[...document.querySelectorAll('button.aw-prog-tile')].map((b) => [b.querySelector('span')?.textContent, b.querySelector('strong')?.textContent, b.disabled])`);
    add('P2 Kacheln +1/+3/+6 h der Station: Luft aus der Lauf-Datei (Wert = Rechenmodell auf der Fixture), „Jetzt" bleibt die gemessene Fahrbahn',
      !!stFc && tiles.length === 4 && tiles[0][0] === 'Jetzt' && tiles.slice(1).every((x, i) => /Luft/.test(x[0]) && x[1] === wantTiles[i] && x[2] === false), JSON.stringify({ stId, tiles, wantTiles }));
    const chart = await ctx.evaluate(`({ pts: (document.querySelector('.aw-chart-fc-t')?.getAttribute('points') ?? '').trim().split(/\\s+/).filter(Boolean).length, note: document.querySelector('.aw-fc-note')?.textContent ?? '' })`);
    add('P3 Verlauf: gestrichelte Prognose-Luft rechts von „jetzt" (≥ 5 Stundenwerte), Hinweis „keine Prognose der Fahrbahn"', chart.pts >= 5 && /keine Prognose der Fahrbahn/.test(chart.note) && /Lauf 09:55/.test(chart.note), JSON.stringify(chart));
    // Chip +3 h.
    await ctx.evaluate(`[...document.querySelectorAll('.aw-times button')][2].click()`);
    const t3 = await until(ctx, `/[?&]t=3/.test(location.search) && /\\+3 h/.test(document.querySelector('.aw-band-fc-label')?.textContent ?? '')`, 8000);
    const p4 = await ctx.evaluate(`({ on: [...document.querySelectorAll('button.aw-prog-tile.is-on')].map((b) => b.querySelector('span')?.textContent), grid: document.querySelector('.aw-fc-grid-title')?.textContent ?? '', cells: document.querySelectorAll('.aw-fc-grid .aw-cell').length, label: document.querySelector('.aw-band-fc-label')?.textContent, ticks: document.querySelectorAll('.aw-band-tick').length })`);
    add('P4 Chip +3 h ⇒ URL t=3, Band-Zeile „+3 h · 13:00", Kachel +3 h markiert, Werte der Stunde (6 Zellen); die Messpunkte im Band bleiben',
      t3 && p4.on.length === 1 && /\+3 h/.test(p4.on[0]) && /Prognose \+3 h · gültig 13:00/.test(p4.grid) && p4.cells === 6 && /13:00/.test(p4.label) && p4.ticks === 30, JSON.stringify(p4));
    // A forecast point of the axis as the selection.
    const pickIdx = Math.floor(fcAxis.length / 2);
    const cellId = await ctx.evaluate(`(() => { const c = [...document.querySelectorAll('.aw-band-fc-cell')][${pickIdx}]; c.click(); return c.getAttribute('aria-label'); })()`);
    const ax = await until(ctx, `!!document.querySelector('.aw-axis') && /st=a8(%40|@)/.test(location.search)`, 8000);
    const now2 = await pageNow();
    const p5 = await ctx.evaluate(`({ eyebrow: document.querySelector('.aw-axis .aw-eyebrow')?.textContent, name: document.querySelector('.aw-axis .aw-station-name')?.textContent, hero: document.querySelector('.aw-axis .aw-hero-val')?.textContent, st: new URLSearchParams(location.search).get('st'), callout: document.querySelector('.aw-callout')?.textContent ?? '', sel: document.querySelectorAll('.aw-band-fc-cell.is-sel').length, badge: document.querySelector('.aw-axis .aw-badge')?.textContent ?? '' })`);
    const axFc = fcLive.file.points.find((x) => x.id === p5.st);
    const axWant = axFc ? roadFcValue(axFc, fcLive.file, now2 + 3 * 3_600_000) : null;
    add('P5 Klick auf eine Prognose-Zelle ⇒ Karte „Prognosepunkt · buscosun Fusion 8", URL st=a8@<km>, Luftwert = Datei (+3 h), Callout „Prognose Luft …", Klasse in Luft-Worten',
      ax && /Prognosepunkt · buscosun Fusion 8/.test(p5.eyebrow ?? '') && /A 8 · km \d+/.test(p5.name ?? '') && !!axWant && p5.hero === `${f1(axWant.t)} °C` && /Prognose Luft/.test(p5.callout) && p5.sel === 1 && /^Luft /.test(p5.badge),
      JSON.stringify({ ...p5, want: axWant ? f1(axWant.t) : null, cellId }));
    await shot(ctx, 'desktop-1440-prognose');
    // Arrival rows.
    await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][1].click()`);
    await sleep(600);
    const p6 = await ctx.evaluate(`({ fc: [...document.querySelectorAll('.aw-table-name em.is-fc')].map((e) => e.textContent), brief: document.querySelector('.aw-brief')?.textContent ?? '', rows: document.querySelectorAll('.aw-table-row:not(.is-fc-row)').length, chips: [...document.querySelectorAll('.aw-table-row:not(.is-fc-row) .aw-table-chip')].map((e) => e.textContent).join('|') })`);
    add('P6 Reiter Strecke: Zeilen mit späterer Ankunft tragen „zur Ankunft: Luft … · Niederschlag/Regen/Schnee …", Briefing mit „Prognose zur Ankunft"; die Zustands-Chips bleiben Messklassen',
      p6.rows === 30 && p6.fc.length >= 5 && p6.fc.every((x) => /^zur Ankunft: Luft [+−±][\d,]+ °C · (Niederschlag|Regen|Schneeregen|Schnee) \d+ %/.test(x)) && /Prognose zur Ankunft: kälteste Luft/.test(p6.brief) && !/Prognose/.test(p6.chips),
      JSON.stringify({ n: p6.fc.length, first: p6.fc[0], brief: p6.brief.slice(-120) }));
    await shot(ctx, 'desktop-1440-strecke-prognose');
    await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][2].click()`);
    await sleep(300);
    const p7 = await ctx.evaluate(`document.querySelector('.aw-readout')?.innerText ?? ''`);
    add('P7 Quellen: buscosun Fusion 8 aktiv, OpenStreetMap (ODbL) genannt, Quelltext des Vertrags, Fahrbahn-Prognose weiter „geplant"',
      /buscosun Fusion 8/.test(p7) && /OpenStreetMap-Mitwirkende, ODbL/.test(p7) && /keine Fahrbahnmessung, kein amtliches Warnprodukt/.test(p7) && /buscosun Fusion — Fahrbahn/.test(p7));
  }
  off(); allErrors.push(...errors); await ctx.close();
}
{
  // P8: a shared link with a forecast point and hour opens exactly there.
  const { ctx, errors, off } = await openPage({ path: `/autobahnwetter/a8?st=${encodeURIComponent(fcAxis[3].id)}&t=6&road=1` });
  const ok = await until(ctx, `!!document.querySelector('.aw-axis') && [...document.querySelectorAll('.aw-times button')][3]?.getAttribute('aria-pressed') === 'true'`, 30_000);
  await sleep(900);
  const s = await ctx.evaluate(`({ q: location.search, grid: document.querySelector('.aw-fc-grid-title')?.textContent ?? '' })`);
  const q = new URLSearchParams(s.q);
  add('P8 geteilter Link mit st=<Achspunkt>&t=6 öffnet den Prognosepunkt bei +6 h, URL bleibt', ok && q.get('st') === fcAxis[3].id && q.get('t') === '6' && /Prognose \+6 h/.test(s.grid), JSON.stringify(s));
  off(); allErrors.push(...errors); await ctx.close();
}

// --- Q: forecast states --------------------------------------------------------------------------------------
for (const [id, fcRoot, what, want] of [
  ['Q1', fcNone, 'kein Zeiger (404)', { chips: true, row: false, note: /nicht verfügbar \(Zeiger nicht lesbar\)/ }],
  ['Q2', fcStale.dir, 'Lauf 4 h alt', { chips: false, row: true, label: /veraltet/ }],
  ['Q3', fcDead.dir, 'Lauf 13 h alt', { chips: true, row: false, note: /nicht verfügbar \(letzter Lauf älter als 12 Stunden\)/ }],
]) {
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1', fcRoot });
  await until(ctx, `document.querySelectorAll('.aw-band-tick').length > 5 && !!document.querySelector('.aw-station-name') && (!!document.querySelector('.aw-band-fc') || /nicht verfügbar \\((?!Prognose lädt)/.test(document.querySelector('.aw-fc-note')?.textContent ?? ''))`, 30_000);
  const r = await ctx.evaluate(`({ dis: [...document.querySelectorAll('.aw-times button')].slice(1).every((b) => b.disabled), any: [...document.querySelectorAll('.aw-times button')].slice(1).some((b) => b.disabled), row: !!document.querySelector('.aw-band-fc'), label: document.querySelector('.aw-band-fc-label')?.textContent ?? '', note: document.querySelector('.aw-fc-note')?.textContent ?? '', station: !!document.querySelector('.aw-station .aw-hero-val'), ticks: document.querySelectorAll('.aw-band-tick').length })`);
  const ok = r.station && r.ticks === 30 && r.row === want.row && (want.chips ? r.dis : !r.any) && (!want.note || want.note.test(r.note)) && (!want.label || want.label.test(r.label));
  add(`${id} Prognose: ${what} ⇒ ${want.row ? 'Zeile und Chips bleiben, „veraltet" benannt' : 'Chips gesperrt, keine Prognose-Zeile, Grund genannt'}; die Messung bleibt vollständig`, ok, JSON.stringify(r));
  off(); allErrors.push(...errors); await ctx.close();
}

// --- G: states without data -------------------------------------------------------------------------------
{
  const empty = mkdtempSync(join(tmpdir(), 'road-ui-empty-'));
  cpSync(join(site, 'static'), join(empty, 'static'), { recursive: true });
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1', root: empty });
  const ok = await until(ctx, `/Derzeit keine Messdaten/.test(document.querySelector('.aw-map-note')?.textContent ?? '') && /Keine Daten/.test(document.querySelector('.aw-live')?.textContent ?? '')`, 25_000);
  const ticks = await ctx.evaluate(`[...document.querySelectorAll('.aw-band-tick')].every((t) => t.classList.contains('is-hatched'))`);
  add('G1 alle Slots 404 ⇒ Hinweis „Derzeit keine Messdaten", Topbar „Keine Daten", Band nur schraffiert', ok && ticks);
  const q4 = await until(ctx, `!!document.querySelector('.aw-axis') && document.querySelectorAll('.aw-band-fc-cell').length > 5`, 15_000);
  add('Q4 ohne Messdaten, aber mit Prognose-Lauf: die Detailspalte öffnet einen Prognosepunkt, die Prognose-Zeile steht', q4);
  await shot(ctx, 'state-nodata');
  off(); allErrors.push(...errors); await ctx.close();
  rmSync(empty, { recursive: true, force: true });
}
{
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1', root: killedSite });
  const ok = await until(ctx, `/Kill-Switch/.test(document.querySelector('.aw-map-note')?.textContent ?? '')`, 25_000);
  add('G2 Kill-Switch im Slot ⇒ „Derzeit keine Messdaten" mit Grund', ok);
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1', offsetMin: 56 });
  const ok = await until(ctx, `/Veraltet/.test(document.querySelector('.aw-live')?.textContent ?? '') && !!document.querySelector('.aw-chip.is-stale')`, 25_000);
  add('G3 Slot 56 min alt (Zeit-Gate 10 min ⇒ Slot 08:00 noch gültig, > 45 min) ⇒ „Veraltet", Chip grau', ok);
  await shot(ctx, 'state-stale');
  off(); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1', offsetMin: 200 });
  const ok = await until(ctx, `/Derzeit keine Messdaten/.test(document.querySelector('.aw-map-note')?.textContent ?? '')`, 25_000);
  add('G4 > 3 h ohne neuen Slot (Schritt zurück findet nichts) ⇒ „Derzeit keine Messdaten"', ok);
  off(); allErrors.push(...errors); await ctx.close();
}

// --- H: mobile -------------------------------------------------------------------------------------------
{
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a8?road=1', width: 390, height: 844, mobile: true });
  const ready = await until(ctx, `!!document.querySelector('.aw-sheet') && /Kälteste Stelle|Keine gültige/.test(document.querySelector('.aw-sheet-title')?.textContent ?? '')`, 30_000);
  await sleep(1500);
  const m = await ctx.evaluate(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }; return { pill: r('.aw-m-top .aw-pill'), share: r('.aw-m-share'), chip: r('.aw-m-times .aw-times button'), grip: r('.aw-sheet-grip'), rail: !!document.querySelector('.aw-rail') }; })()`);
  add('H1 mobil: Karte vollflächig ohne Rail, Pille 52 px hoch, Teilen 44 × 44, Zeitchips 36 px', ready && !m.rail && m.pill?.[1] === 52 && m.share?.[0] >= 44 && m.share?.[1] >= 44 && m.chip?.[1] === 36, JSON.stringify(m));
  const mfc = await ctx.evaluate(`({ row: !!document.querySelector('.aw-miniband.is-fc'), segs: document.querySelectorAll('.aw-miniband.is-fc .aw-band-seg').length, chips: [...document.querySelectorAll('.aw-m-times .aw-times button')].every((b) => !b.disabled) })`);
  add('H4 mobil: Prognose-Zeile unter dem Mini-Band, Zeitchips wählbar', mfc.row && mfc.segs > 5 && mfc.chips, JSON.stringify(mfc));
  await shot(ctx, 'mobile-390-peek');
  await ctx.evaluate(`document.querySelector('.aw-sheet-grip').click()`);
  await sleep(700);
  // Every visible button of the sheet and the top bar (segment chips are 36 px by design; the band is not on mobile).
  const small = await ctx.evaluate(`[...document.querySelectorAll('.aw-sheet button, .aw-m-top button')].filter((b) => b.offsetParent && !b.closest('.aw-seg')).map((b) => { const r = b.getBoundingClientRect(); return [b.className || b.getAttribute('aria-label') || b.textContent.slice(0, 12), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => Math.min(w, h) < 44)`);
  const rows = await ctx.evaluate(`document.querySelectorAll('.aw-sheet-row').length`);
  add('H2 Sheet aufgeklappt: kritische Punkte mit Ankunftszeit + Aktionen; Bedienelemente ≥ 44 px', rows >= 1 && small.length === 0, small.length ? JSON.stringify(small.slice(0, 5)) : `${rows} Zeilen`);
  await shot(ctx, 'mobile-390-open');
  // H3: the pill opens the motorway picker (the only way to change the motorway on a phone).
  await ctx.evaluate(`document.querySelector('.aw-m-top .aw-pill').click()`);
  await sleep(500);
  const picker = await ctx.evaluate(`({ open: !!document.querySelector('.aw-m-dock'), rows: document.querySelectorAll('.aw-m-dock .aw-road:not(.is-static)').length, small: [...document.querySelectorAll('.aw-m-dock button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).length })`);
  await ctx.evaluate(`[...document.querySelectorAll('.aw-m-dock .aw-road')].find((b) => /A 93/.test(b.textContent))?.click()`);
  await sleep(900);
  const after = await ctx.evaluate(`({ open: !!document.querySelector('.aw-m-dock'), title: document.querySelector('.aw-m-top .aw-pill-title')?.textContent, url: location.pathname })`);
  add('H3 Korridor-Pille öffnet die Autobahnwahl (≥ 44 px), Auswahl schließt sie und wechselt Korridor + Pfad', picker.open && picker.rows >= 9 && picker.small === 0 && !after.open && after.url.startsWith('/autobahnwetter/a93'), JSON.stringify({ picker, after }));
  off(); allErrors.push(...errors); await ctx.close();
}

add('I1 keine ungefangene Ausnahme in allen Abläufen', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));

await browser.close();
rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`\nverify:road-ui — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
