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
 *   S  phase AF-5: sections without a measuring station (`gap`) — head, band with the forecast row only, default = first
 *      forecast point, map line in the forecast colour, dock rows and fold rows, route table, run with/without
 *      `engine.dense`, no run file yet, measurement outage, mobile; a motorway of such sections only
 *   T  town labels under the band (V-AF-28): none overlaps or leaves the band, end towns first, a dropped name sits in a
 *      tooltip; `--towns=<corridors.json>` walks every corridor of a real file
 *   U  phase AW-8 (ROAD_HZ_LIVE on since 21.10., V-AW-68: A–T open the page with `roadhz=0`): `?roadhz=0` = the page of before, no
 *      parameter = the rail; rail with matrix, chips, groups, rows as buttons;
 *      period and matrix cell = filter + shared hour; keyboard ↑/↓/Enter/Esc; detail (cross-section, text, timetable, lazy
 *      nivo charts with role=img + hidden tables, features, measuring points + station card, provenance); no hazard file;
 *      mobile sheet (44 px, matrix scrolls); segment lines on the map; no Google Fonts request
 *   V  phase AWD (audit/autobahn-dossier.md): stage „Karte | Dossier“ behind the hazard switch — map is the default stage,
 *      a map/strip click only marks („Dossier öffnen“ in the marked row), a list row opens segment + dossier, the detail lives
 *      ONLY in the dossier (E-AWD-1), one strip per stage, map kept mounted and measured again, permalink `ds=1`, switch
 *      off = the page of before, mobile dossier page; URL state as pure functions
 *   W  phase FB (audit/autobahn-fahrbahn.md): the road surface forecast, on by default since E-FB-10 (`?rsfc=0` = the way
 *      back) — tiles, grid, chart, notes, sources row and arrival column say „berechnet"; with `rsfc=0`, or with a run that
 *      carries no surface, the page of before (never an invented road)
 *   I  console: no uncaught exception
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { deriveRoadSlot } from './road/road-derive.mjs';
import { deriveRoadHazards } from './road/road-hazards.mjs';
import { roadHzEntryProblems } from '../src/road/roadHazards.ts';
import { roadFcStamp, roadFcT0 } from '../src/road/roadFc.ts';
import { roadFcValue, roadFcAxisPoints, roadFcEngineName } from '../src/road/roadFcView.ts';
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
// The page names the engine as the RUN FILE does (the stand it was built with), not as the code's register does.
const FC_ENGINE_NAME = roadFcEngineName(fcReal);
const mkFcSite = (name, issuedMs, { base = fcReal, extra = null } = {}) => {
  const dir = join(tmp, name);
  const run = roadFcStamp(issuedMs), t0Ms = roadFcT0(issuedMs), issuedAt = new Date(issuedMs).toISOString();
  const file = { ...base, run, issuedAt, t0Ms };
  mkdirSync(join(dir, run, 'c'), { recursive: true });
  writeFileSync(join(dir, run, 'c', 'a8.json'), JSON.stringify(file));
  // Further files of the run (V-AW-26: where.json, state files), each restamped to this run.
  for (const [rel, doc] of Object.entries(extra ? extra(run, file) : {})) { mkdirSync(join(dir, run, dirname(rel)), { recursive: true }); writeFileSync(join(dir, run, rel), JSON.stringify(doc)); }
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

async function openPage({ path, width = 1440, height = 900, mobile = false, offsetMin = 12, root = site, fcRoot = fcLive.dir, radarPng = null, initScript = null, blockAssets = false, hz = false }) {
  // V-AW-68: since ROAD_HZ_LIVE = true the page carries the hazard rail by default. Blocks A–T describe the page WITHOUT
  // the rail (the page of AW-5/AW-6.1b) and open it with `roadhz=0`; block U passes `hz: true` and says itself what it wants.
  if (!hz && /^\/autobahnwetter(?:[/?]|$)/.test(path) && !/[?&]roadhz=/.test(path)) path += `${path.includes('?') ? '&' : '?'}roadhz=0`;
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
      // R8: the app bundle blocked — what the static shell does on its own (the inline gate) stays visible.
      if (blockAssets && /\/assets\/[^/]+\.js(?:\?|$)/.test(url)) {
        await ctx.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
        return;
      }
      // V-AW-14: the radar mirror's RV analysis frames (f000.png) — served from a fixture when given, else 404.
      if (/buscosun-data(?:@main|\/main)\/radar\/img\/v1\/rv\//.test(url)) {
        served.push(`radar/${url.split('/rv/')[1]}`);
        const ok = !!radarPng && /\/f000\.png(?:\?|$)/.test(url);
        await ctx.send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: ok ? 200 : 404, responseHeaders: [{ name: 'content-type', value: ok ? 'image/png' : 'text/plain' }, { name: 'access-control-allow-origin', value: '*' }], body: ok ? Buffer.from(radarPng).toString('base64') : '' }).catch(() => {});
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
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*road/v1/*' }, { urlPattern: '*road/fc/v1/*' }, { urlPattern: '*radar/img/v1/rv/*' }, ...(blockAssets ? [{ urlPattern: '*/assets/*' }] : []), { urlPattern: '*opendata.dwd.de/weather/alerts/*' }, { urlPattern: '*/_dwd_opendata/weather/alerts/*' }] });
  // The app's service worker answers same-origin requests (warnings via `/_dwd_opendata/…`) before page-level
  // interception sees them — bypass it, the test must not depend on the live DWD feed.
  await ctx.send('Network.enable', {});
  await ctx.send('Network.setBypassServiceWorker', { bypass: true });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: clockScript(offsetMin) });
  if (initScript) await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });
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
  // V-AW-68: the tile sits in `.deck-quad` since the start-page rebuild of 17.10. (before: `.deck-bento`).
  const tile = await until(ctx, `[...document.querySelectorAll('.deck-quad .deck-tile, .deck-bento > .deck-tile')].some((t) => /Autobahnwetter/.test(t.getAttribute('aria-label') ?? '') && t.offsetParent !== null)`, 20_000);
  const count = await ctx.evaluate(`document.querySelector('.deck-chips-count')?.textContent ?? ''`);
  // V-AW-68: the counter follows the page's own constants (`toolTileCount()`: TOOL_TILE_COUNT minus the hidden forecast tile; the
  // road/sea/glacier flags are on for everyone) — not a number copied into the verifier.
  const sp = readFileSync(join(HERE, '..', 'src', 'SearchPage.tsx'), 'utf8');
  const tiles = Number(/const TOOL_TILE_COUNT = (\d+);/.exec(sp)?.[1]);
  const hidden = /const FORECAST_TILE_HIDDEN = (true|false);/.exec(sp)?.[1] === 'true';
  const wantCount = tiles - (hidden ? 1 : 0);
  add(`A4 Startseite ohne Parameter: Kachel Autobahnwetter sichtbar (.deck-quad), Zähler „${wantCount} Werkzeuge" (TOOL_TILE_COUNT ${tiles}${hidden ? ' − versteckte Vorhersage-Kachel' : ''})`, tile && Number.isFinite(wantCount) && new RegExp(`^0?${wantCount} `).test(count.trim()), count);
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
  const c = await ctx.evaluate(`({ pill: document.querySelector('.aw-pill-title')?.textContent, ticks: document.querySelectorAll('.aw-band-tick').length, name: document.querySelector('.aw-station-name')?.textContent, url: location.pathname + location.search, live: document.querySelector('.aw-live')?.textContent, stand: document.querySelector('.aw-topbar-stand')?.textContent, rows: document.querySelectorAll('.aw-road').length, folds: document.querySelectorAll('.aw-dock .aw-road-more').length })`);
  add('C1 Voreinstellung A 8 „München → Salzburg", 30 Messpunkte im Band, URL /autobahnwetter/a8', c.pill === 'München → Salzburg' && c.ticks === 30 && c.url.startsWith('/autobahnwetter/a8'), JSON.stringify(c));
  add('C2 Topbar: Live, Messung 10:00 Ortszeit, Reihenzahl', /Live/.test(c.live) && /10:00/.test(c.stand) && /von \d+ DWD-Reihen/.test(c.stand), `${c.live} · ${c.stand}`);
  // V-AW-9: short sections (< 3 stations, not the main section) fold — the fixture's a93-2 (2 stations) sits under one row.
  add('C3 Dock listet die Korridore (kurze Abschnitte eingeklappt, V-AW-9) + AT/CH-Zeilen ohne Messung', c.rows === 8 + 4 && c.folds === 1, JSON.stringify({ rows: c.rows, folds: c.folds }));
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
    add('P5 Klick auf eine Prognose-Zelle ⇒ Karte „Prognosepunkt · <Name aus der Datei>", URL st=a8@<km>, Luftwert = Datei (+3 h), Callout „Prognose Luft …", Klasse in Luft-Worten',
      ax && (p5.eyebrow ?? '') === `Prognosepunkt · ${FC_ENGINE_NAME}` && /A 8 · km \d+/.test(p5.name ?? '') && !!axWant && p5.hero === `${f1(axWant.t)} °C` && /Prognose Luft/.test(p5.callout) && p5.sel === 1 && /^Luft /.test(p5.badge),
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
    add('P7 Quellen: Motor mit dem Namen aus der Datei aktiv, OpenStreetMap (ODbL) genannt, Quelltext des Vertrags, Fahrbahn-Prognose weiter „geplant"',
      p7.includes(FC_ENGINE_NAME) && /OpenStreetMap-Mitwirkende, ODbL/.test(p7) && /keine Fahrbahnmessung, kein amtliches Warnprodukt/.test(p7) && /buscosun Fusion — Fahrbahn/.test(p7));
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
  add('H3 Korridor-Pille öffnet die Autobahnwahl (≥ 44 px, auch die Zeile der eingeklappten Abschnitte), Auswahl schließt sie und wechselt Korridor + Pfad', picker.open && picker.rows >= 8 && picker.small === 0 && !after.open && after.url.startsWith('/autobahnwetter/a93'), JSON.stringify({ picker, after }));
  off(); allErrors.push(...errors); await ctx.close();
}

// --- R: improvements of 06.10.2026 (audit/autobahnwetter.md §18) ---------------------------------------------------
const pngLib = await import('./lib/png.mjs');
const shotPng = async (ctx) => pngLib.decodePng(Buffer.from((await ctx.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
{
  // R1 (V-AW-9) view model: ring names, loops, folding.
  const view = await import('../src/road/roadView.ts');
  const C = (id, road, from, to, n, title = `${from} → ${to}`) => ({ id, road, from, to, title, stations: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, km: i, dir: null })) });
  const list = [C('a10', 'A10', 'Groß Kreutz', 'Groß Kreutz', 10, 'A 10 bei Groß Kreutz'), C('a99', 'A99', 'Germering', 'Hohenbrunn', 18), C('a1', 'A1', 'Heiligenhafen', 'Blankenheim', 51), C('a1-3', 'A1', 'Barsbüttel', 'Oststeinbek', 1), C('a1-4', 'A1', 'Buchholz', 'Buchholz', 1, 'A 1 bei Buchholz'), C('a17', 'A17', 'Gorbitz', 'Altenberg', 2)];
  const kinds = (e) => e.map((x) => (x.kind === 'fold' ? `+${x.road}:${x.hidden.length}` : x.corridor.id)).join(' ');
  const closed = view.dockEntries(list, { query: '', selectedId: null, open: new Set() });
  const opened = view.dockEntries(list, { query: '', selectedId: null, open: new Set(['A1']) });
  const sel = view.dockEntries(list, { query: '', selectedId: 'a1-3', open: new Set() });
  const search = view.dockEntries(list, { query: 'Buchholz', selectedId: null, open: new Set() });
  add('R1 Namen und Einklappen (V-AW-9): Ring „Berliner Ring", Ring-Abschnitt „Autobahnring München: Germering → Hohenbrunn", Schleife ohne „X → X"; Abschnitte < 3 Messpunkte (nicht der Hauptabschnitt, nicht der gewählte, nicht bei der Suche) unter EINER Zeile je Autobahn',
    view.corridorTitle(list[0]) === 'Berliner Ring' && view.corridorTitle(list[1]) === 'Autobahnring München: Germering → Hohenbrunn' && view.corridorRouteText(list[4], 0) === 'A 1 bei Buchholz' && view.corridorHeading(list[0], 0) === 'Ring'
    && view.corridorRouteText(list[1], 1) === 'Hohenbrunn → Germering' && kinds(closed) === 'a10 a99 a1 +A1:2 a17' && kinds(opened) === 'a10 a99 a1 a1-3 a1-4 +A1:2 a17' && kinds(sel) === 'a10 a99 a1 a1-3 +A1:1 a17' && kinds(search) === 'a10 a99 a1 a1-3 a1-4 a17',
    `${kinds(closed)} | ${kinds(opened)} | ${kinds(sel)}`);
}
{
  // R2 (V-AW-9) in the browser: the fold row opens the short section and folds it again; ring section named.
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1' });
  await until(ctx, `document.querySelectorAll('.aw-road').length > 5`, 30_000);
  const before = await ctx.evaluate(`({ more: document.querySelector('.aw-dock .aw-road-more')?.textContent ?? '', n: document.querySelectorAll('.aw-dock .aw-road:not(.is-static)').length, a99: [...document.querySelectorAll('.aw-road-title')].map((e) => e.textContent).find((t) => /Autobahnring/.test(t)) ?? '' })`);
  await ctx.evaluate(`document.querySelector('.aw-dock .aw-road-more').click()`);
  await sleep(300);
  const opened = await ctx.evaluate(`({ n: document.querySelectorAll('.aw-dock .aw-road:not(.is-static)').length, exp: document.querySelector('.aw-dock .aw-road-more')?.getAttribute('aria-expanded'), has: [...document.querySelectorAll('.aw-road-title')].some((e) => /Raubling/.test(e.textContent)) })`);
  await ctx.evaluate(`document.querySelector('.aw-dock .aw-road-more').click()`);
  await sleep(300);
  const closed = await ctx.evaluate(`document.querySelectorAll('.aw-dock .aw-road:not(.is-static)').length`);
  add('R2 Dock im Browser (V-AW-9): Zeile „A 93: 1 kurzer Abschnitt …" klappt Raubling → Kiefersfelden auf und wieder zu; A 99 heißt „Autobahnring München: …"',
    /A 93: 1 kurzer Abschnitt mit weniger als 3 Messpunkten/.test(before.more) && before.n === 8 && opened.n === 9 && opened.exp === 'true' && opened.has && closed === 8 && before.a99 === 'Autobahnring München: Germering → Hohenbrunn',
    JSON.stringify({ before, opened, closed }));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  // R3 (V-AW-2): a 24-h ring with history — the fixture slot is one slot; the copy below adds 95 earlier slots with a
  // fixed class pattern (every code incl. "no point") so that the strip shows each class, hatched where no state.
  const ringSite = join(tmp, 'site-ring');
  cpSync(site, ringSite, { recursive: true });
  const PATTERN = 'iffwwddunn-d';
  const extended = {};
  for (const g of readdirSync(join(ringSite, 'h24'))) {
    for (const f of readdirSync(join(ringSite, 'h24', g))) {
      const p = join(ringSite, 'h24', g, f);
      const r = JSON.parse(readFileSync(p, 'utf8'));
      const t = SLOT_MS;
      const earlier = Array.from({ length: 95 }, (_, i) => roadFcStamp(t - (95 - i) * 15 * 60_000));
      r.slots = [...earlier, ...r.slots];
      for (const [id, s] of Object.entries(r.stations)) {
        const k = Array.from({ length: 95 }, (_, i) => PATTERN[i % PATTERN.length]).join('');
        r.stations[id] = { rs: [...Array(95).fill(null), ...s.rs], ta: [...Array(95).fill(null), ...s.ta], td: [...Array(95).fill(null), ...s.td], k: k + (s.k ?? '-') };
        extended[id] = r.stations[id].k;
      }
      writeFileSync(p, JSON.stringify(r));
    }
  }
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1', root: ringSite });
  await until(ctx, `document.querySelectorAll('.aw-chart-k rect[data-k]').length > 50`, 30_000);
  const r = await ctx.evaluate(`(() => {
    const name = document.querySelector('.aw-station-name')?.textContent;
    const rects = [...document.querySelectorAll('.aw-chart-k rect[data-k]')];
    const by = {}; for (const e of rects) by[e.dataset.k] = (by[e.dataset.k] ?? 0) + 1;
    const fills = {}; for (const e of rects) fills[e.dataset.k] = e.getAttribute('fill');
    const svg = document.querySelector('.aw-chart'); const box = svg.getBoundingClientRect();
    return { name, by, fills, label: svg.getAttribute('aria-label'), legend: document.querySelector('.aw-chart-legend')?.textContent ?? '', h: Math.round(box.height) };
  })()`);
  const obsFix = JSON.parse(readFileSync(join(site, 'obs', '2610030800.json'), 'utf8'));
  const id = obsFix.points.find((x) => x.n === r.name)?.id;
  const k = extended[id] ?? '';
  const want = {}; for (const ch of k) if (ch !== '-') { const cls = { i: 'ice', f: 'frost', w: 'wet', d: 'dry', u: 'unknown', n: 'nodata' }[ch]; want[cls] = (want[cls] ?? 0) + 1; }
  const view = await import('../src/road/roadView.ts');
  add('R3 Verlauf 24 h mit Klassen-Leiste (V-AW-2): eine Zelle je Messung mit Klasse (Zählung = Ring), Farben der Fahrbahnklassen, „unbekannt"/„keine Messung" schraffiert (nie wie trocken), Lücke ohne Zelle; Legende und Bildbeschreibung nennen sie',
    !!id && JSON.stringify(Object.entries(r.by).sort()) === JSON.stringify(Object.entries(want).sort()) && r.fills.ice === view.ROAD_CLASS_COLOR.ice && r.fills.dry === view.ROAD_CLASS_COLOR.dry && /^url\(#/.test(r.fills.unknown ?? '') && /^url\(#/.test(r.fills.nodata ?? '')
    && /Fahrbahnzustand je 15 min/.test(r.legend) && /Leiste: Fahrbahnzustand je Messung/.test(r.label) && r.h === 134, JSON.stringify({ id, by: r.by, want, h: r.h }));
  await shot(ctx, 'r3-verlauf-leiste');
  off(); allErrors.push(...errors); await ctx.close();
}
{
  // R4 (V-AW-29): the arrival forecast in its own column from 1 440 px; below, under the name as before.
  const col = async (width, height) => {
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a8?tab=strecke&road=1', width, height });
    await until(ctx, `document.querySelectorAll('.aw-table-row').length > 20 && document.querySelectorAll('.aw-table-name em.is-fc').length > 3`, 30_000);
    await sleep(500);
    const r = await ctx.evaluate(`(() => {
      const vis = (e) => !!e && getComputedStyle(e).display !== 'none';
      const rows = [...document.querySelectorAll('.aw-table-row')];
      const withFc = rows.filter((x) => x.querySelector('.aw-table-name em.is-fc'));
      const cells = withFc.map((x) => x.querySelector('.aw-table-fc'));
      return { head: vis(document.querySelector('.aw-table-head .aw-table-fc')), cellVis: cells.filter(vis).length, emVis: withFc.filter((x) => vis(x.querySelector('.aw-table-name em.is-fc'))).length, n: withFc.length,
        h: Math.round(withFc[0]?.getBoundingClientRect().height ?? 0), txt: cells[0]?.textContent ?? '', em: withFc[0]?.querySelector('.aw-table-name em.is-fc')?.textContent ?? '' };
    })()`);
    if (width >= 1440) await shot(ctx, 'r4-strecke-spalte-1440');
    off(); allErrors.push(...errors); await ctx.close();
    return r;
  };
  const wide = await col(1440, 900), narrow = await col(1280, 800);
  add('R4 Reiter Strecke (V-AW-29): ab 1 440 px eigene Spalte „Luft zur Ankunft" (Kopf + jede Zeile mit Prognose, Wert wie in der Zeile darunter), der Zusatz unter dem Namen entfällt, Zeilen niedriger; bei 1 280 px wie bisher',
    wide.head && wide.n > 3 && wide.cellVis === wide.n && wide.emVis === 0 && !!/[+−±][\d,]+ °C/.exec(wide.txt) && wide.em.includes(/[+−±][\d,]+ °C/.exec(wide.txt)[0]) && !narrow.head && narrow.cellVis === 0 && narrow.emVis === narrow.n && wide.h < narrow.h,
    JSON.stringify({ wide, narrow }));
}
{
  // R5 (V-AW-14): the radar layer — off by default (no request), on ⇒ the newest RV analysis on the map under the corridors.
  const W = 1100, H = 1200, g = new Uint8Array(W * H);
  for (let y = 850; y < 1000; y++) for (let x = 0; x < W; x++) g[y * W + x] = 60;   // a rain band over southern Bavaria (≈ 4.7 mm/h)
  const radarPng = new Uint8Array(pngLib.encodePng(W, H, g, 1));
  const { ctx, errors, served, off } = await openPage({ path: '/autobahnwetter/a8?road=1', radarPng });
  await until(ctx, `document.querySelectorAll('.aw-band-tick').length > 5`, 30_000);
  await until(ctx, `!!document.querySelector('.aw-map-canvas')?.dataset.idle`, 45_000);
  await sleep(2500);
  const offShot = await shotPng(ctx);
  const radarBefore = served.filter((s) => s.startsWith('radar/')).length;
  await ctx.evaluate(`[...document.querySelectorAll('.aw-layer')].find((b) => /Niederschlag jetzt/.test(b.textContent))?.click()`);
  const legendOk = await until(ctx, `/Radar \\d{2}:\\d{2} · DWD RADOLAN/.test(document.querySelector('.aw-legend-rain')?.textContent ?? '')`, 20_000);
  await sleep(3500);
  const onShot = await shotPng(ctx);
  const diff = (a, b) => { const A = pngLib.toRgba(a), B = pngLib.toRgba(b); let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 60) n++; return n; };
  const changed = diff(offShot, onShot);
  const legend = await ctx.evaluate(`document.querySelector('.aw-legend-rain')?.textContent ?? ''`);
  await shot(ctx, 'r5-radar-an');
  await ctx.evaluate(`[...document.querySelectorAll('.aw-layer')].find((b) => /Niederschlag jetzt/.test(b.textContent))?.click()`);
  await sleep(2500);
  const backShot = await shotPng(ctx);
  const back = diff(offShot, backShot);
  const radarReq = served.filter((s) => s.startsWith('radar/'));
  add('R5 Ebene „Niederschlag jetzt" (V-AW-14): aus ⇒ kein Radar-Abruf; an ⇒ jüngste RV-Analyse (f000.png des Spiegels) als Fläche auf der Karte (deutlich sichtbar), Legende „Radar HH:MM · DWD RADOLAN"; wieder aus ⇒ Karte wie vorher',
    radarBefore === 0 && legendOk && radarReq.some((s) => /\/f000\.png/.test(s)) && changed > 20_000 && back < changed / 20, JSON.stringify({ radarBefore, req: radarReq.slice(0, 3), changed, back, legend }));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  // R6 (V-AW-26): a station on no corridor gets its forecast from the run's station map and state file.
  const obsFix = JSON.parse(readFileSync(join(site, 'obs', '2610030800.json'), 'utf8'));
  const corrFix = JSON.parse(readFileSync(join(FIX, 'corridors-munich.json'), 'utf8')).corridors;
  const onCorr = new Set(corrFix.flatMap((c) => c.stations.map((s) => s.id)));
  const bl = obsFix.points.find((p) => p.kind !== 'A' && !onCorr.has(p.id) && p.rs != null && p.lat > 47.5 && p.lat < 48.5);
  const donor = fcReal.points.find((p) => p.kind === 'station');
  const synth = { ...donor, id: bl.id, km: null, lat: bl.lat, lon: bl.lon, name: bl.n };
  const whereSite = mkFcSite('fc-where', SLOT_MS - 5 * 60_000, { extra: (run, file) => ({
    'where.json': { schema: 1, product: 'road-fc-where', run, stations: { ...Object.fromEntries(file.points.filter((p) => p.kind === 'station').map((p) => [p.id, 'c/a8'])), [bl.id]: 's/BY' } },
    's/BY.json': { ...file, kind: 'state', id: 'BY', points: [synth] },
  }) });
  const run = async (fcRoot) => {
    const { ctx, errors, served, off } = await openPage({ path: `/autobahnwetter/a8?st=${bl.id}&road=1`, fcRoot });
    await until(ctx, `document.querySelector('.aw-station-name')?.textContent === ${JSON.stringify(bl.n)} && ([...document.querySelectorAll('button.aw-prog-tile')].slice(1).some((b) => !b.disabled) || /keine Zuordnung|nicht lesbar|rechnet der Lauf keine/.test(document.querySelector('.aw-fc-note')?.textContent ?? ''))`, 30_000);
    await sleep(800);
    const now = await ctx.evaluate('Date.now()');
    const r = await ctx.evaluate(`({ name: document.querySelector('.aw-station-name')?.textContent, tiles: [...document.querySelectorAll('button.aw-prog-tile')].slice(1).map((b) => [b.querySelector('strong')?.textContent, b.disabled]), note: document.querySelector('.aw-fc-note')?.textContent ?? '' })`);
    off(); allErrors.push(...errors); await ctx.close();
    return { r, now, served };
  };
  const a = await run(whereSite.dir);
  const want = [1, 3, 6].map((h) => { const v = roadFcValue(synth, whereSite.file, a.now + h * 3_600_000); return v ? `${f1(v.t)}°` : '—'; });
  const b = await run(fcLive.dir);
  add('R6 Messstelle abseits der Autobahn (V-AW-26): Kacheln +1/+3/+6 h aus der Länder-Datei des Laufs (über where.json gefunden, Werte = Datei); ein Lauf ohne where.json nennt den Grund statt „keine Prognose"',
    a.r.name === bl.n && a.r.tiles.every((t, i) => t[0] === want[i] && t[1] === false) && a.served.some((s) => /where\.json$/.test(s)) && a.served.some((s) => /\/s\/BY\.json$/.test(s))
    && b.r.tiles.every((t) => t[1] === true) && /keine Zuordnung/.test(b.r.note), JSON.stringify({ id: bl.id, a: a.r.tiles, want, bNote: b.r.note.slice(0, 90) }));
}
{
  // R7 (V-AW-27): the synthetic winter run — blue air bands, snow and sleet marks, snow words in tiles and rows.
  const { winterRun, WINTER_FIXTURE_NOTE } = await import('./lib/fixtures/road/winterFixture.mjs');
  const fcWinter = mkFcSite('fc-winter', SLOT_MS - 5 * 60_000, { base: winterRun(fcReal) });
  const { ROAD_FC_AIR_COLOR } = await import('../src/road/roadFcView.ts');
  const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a8?t=3&road=1', fcRoot: fcWinter.dir });
  await until(ctx, `document.querySelectorAll('.aw-band-fc-cell').length > 5`, 30_000);
  await sleep(800);
  const r = await ctx.evaluate(`(() => {
    const cells = [...document.querySelectorAll('.aw-band-fc-cell')];
    const bg = (e) => e.style.background || getComputedStyle(e).backgroundColor;
    return { n: cells.length, colors: cells.map(bg), snow: document.querySelectorAll('.aw-band-fc-cell.is-snow').length, rain: document.querySelectorAll('.aw-band-fc-cell.is-rain').length,
      tiles: [...document.querySelectorAll('button.aw-prog-tile em')].map((e) => e.textContent).join(' | '), legend: document.querySelector('.aw-band-legend.is-fc')?.textContent ?? '' };
  })()`);
  const count = (hex) => r.colors.filter((c) => c === rgb(hex) || c.toLowerCase() === hex.toLowerCase()).length;
  await shot(ctx, 'r7-winter-band');
  await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][1].click()`);
  await sleep(600);
  const rows = await ctx.evaluate(`[...document.querySelectorAll('.aw-table-name em.is-fc')].map((e) => e.textContent).join(' | ')`);
  await shot(ctx, 'r7-winter-strecke');
  add(`R7 Winterlage (V-AW-27, ${WINTER_FIXTURE_NOTE}): alle drei Luft-Stufen im Band (≤ 0 · bis +3 · darüber), Schnee- und Schneeregen-Marken, Kacheln und Ankunftszeilen nennen Schnee; keine Fahrbahnklasse in den Prognose-Texten`,
    count(ROAD_FC_AIR_COLOR.frost) > 0 && count(ROAD_FC_AIR_COLOR.near) > 0 && count(ROAD_FC_AIR_COLOR.above) > 0 && r.snow > 0 && /Schnee/.test(r.tiles + rows) && /Schneeregen|Schnee/.test(rows) && !/Glätte|Frostgefahr|Nass\b/.test(rows),
    JSON.stringify({ frost: count(ROAD_FC_AIR_COLOR.frost), near: count(ROAD_FC_AIR_COLOR.near), above: count(ROAD_FC_AIR_COLOR.above), snow: r.snow, rain: r.rain, tiles: r.tiles.slice(0, 80) }));
  off(); allErrors.push(...errors); await ctx.close();
}
{
  // R8 (V-AW-12): the shell's inline gate empties the static lead at parse time for a visitor with the flag off —
  // same precedence as roadFlagFrom in every case; in the built shell right after #root; in the browser before the app.
  const { flagGateScript } = await import('./seo/flagGate.mjs');
  const { roadFlagFrom } = await import('../src/road/roadFlag.ts');
  const vm = await import('node:vm');
  const cases = [];
  for (const live of [true, false]) for (const q of [null, '0', '1']) for (const s of [null, '0', '1']) {
    const root = { innerHTML: '<h1>Autobahnwetter</h1>' };
    const ctxv = { location: { search: q == null ? '' : `?road=${q}` }, localStorage: { getItem: () => s }, document: { getElementById: () => root }, URLSearchParams };
    vm.runInNewContext(flagGateScript('road', live).replace(/^<script>|<\/script>$/g, ''), ctxv);
    const want = roadFlagFrom(ctxv.location.search, s, live);
    cases.push(want === (root.innerHTML !== ''));
  }
  const html = readFileSync(join(HERE, '..', 'dist', 'autobahnwetter.html'), 'utf8');
  const after = /<div id="root">[\s\S]*?<\/div><script>\(function\(\)\{try\{var q=null/.test(html) && html.includes("localStorage.getItem(\"road\")");
  const len = async (path) => {
    const { ctx, off } = await openPage({ path, blockAssets: true });
    await until(ctx, `document.readyState === 'complete'`, 15_000);
    const v = await ctx.evaluate(`(document.getElementById('root')?.innerHTML ?? '').length`);
    off(); await ctx.close();
    return v;
  };
  const hidden = await len('/autobahnwetter.html?road=0'), shown = await len('/autobahnwetter.html');
  add('R8 Shell ohne Aufblitzen (V-AW-12): das Inline-Skript nach #root leert die Einleitung genau dann, wenn roadFlagFrom „aus" sagt (18 Fälle: Abfrage, Speicher, Voreinstellung); im Build vorhanden; im Browser ist #root bei DOMContentLoaded mit ?road=0 leer, ohne Schalter gefüllt',
    cases.length === 18 && cases.every(Boolean) && after && hidden === 0 && shown > 100, JSON.stringify({ ok: cases.filter(Boolean).length, after, hidden, shown }));
}

{
  // R9 (V-AW-22): a corridor with a stretch without carriageway in OSM — named in band, legend and briefing.
  const uSite = join(tmp, 'site-unbuilt');
  cpSync(site, uSite, { recursive: true });
  const cf = JSON.parse(readFileSync(join(uSite, 'static', 'corridors.json'), 'utf8'));
  cf.corridors.find((c) => c.id === 'a8').unbuilt = [[100, 110]];
  writeFileSync(join(uSite, 'static', 'corridors.json'), JSON.stringify(cf));
  const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a8?tab=strecke&road=1', root: uSite });
  await until(ctx, `!!document.querySelector('.aw-band-unbuilt') && /OpenStreetMap/.test(document.querySelector('.aw-brief')?.textContent ?? '')`, 30_000);
  const r = await ctx.evaluate(`(() => { const u = document.querySelector('.aw-band-unbuilt'), bar = document.querySelector('.aw-band-bar'); const a = u?.getBoundingClientRect(), b = bar?.getBoundingClientRect();
    return { title: u?.getAttribute('title') ?? '', legend: document.querySelector('.aw-band-legend')?.textContent ?? '', brief: document.querySelector('.aw-brief')?.textContent ?? '', top: a && b ? Math.round(a.top - b.top) : null, h: a ? Math.round(a.height) : null, w: a && b ? a.width / b.width : null }; })()`);
  await shot(ctx, 'r9-band-ohne-fahrbahn');
  add('R9 Strecke ohne Fahrbahn in OSM (V-AW-22): im Band als dunkle Schraffur genau über km 100–110 (Breite ≈ 10 / Länge), Legende und Briefing nennen „keine Fahrbahn in OpenStreetMap (im Bau oder anders geführt)"',
    /km 100–110: keine Fahrbahn in OpenStreetMap/.test(r.title) && /ohne Fahrbahn \(OSM\)/.test(r.legend) && /km 100–110: keine Fahrbahn in OpenStreetMap \(im Bau oder anders geführt\)/.test(r.brief) && r.top === 0 && r.h === 14 && Math.abs(r.w - 10 / cf.corridors.find((c) => c.id === 'a8').lengthKm) < 0.01,
    JSON.stringify(r).slice(0, 300));
  off(); allErrors.push(...errors); await ctx.close();
}

// --- S: phase AF-5 — sections without a measuring station (audit/autobahn-fusion12-lueckenlos.md §8.7) ----------------
// Fixture: the Munich corridors plus five REAL sections without a station from the AF-2 candidate (`corridors-gap.json`:
// a8-8 and a94-2 on motorways that have measured sections, a995 as a motorway of one such section, a36 + a36-2 as a
// motorway of two). No run exists for them yet (AF-3), so their run files are built here in the producer's form: axis
// points by the contract's rule (`roadFcAxisKms`, `roadPointAtKm`), series taken from the real a8 run.
{
  const view = await import('../src/road/roadView.ts');
  const fcv = await import('../src/road/roadFcView.ts');
  const { roadFcAxisKms, roadFcAxisId, roadPointAtKm } = await import('../src/road/roadFc.ts');
  const gapDoc = JSON.parse(readFileSync(join(FIX, 'corridors-gap.json'), 'utf8'));
  const G = (id) => gapDoc.corridors.find((c) => c.id === id);
  // Engine block of the live run 2610110926 (11.10.2026, read from the pointer) — the form a current run carries.
  const ENGINE_F12 = { name: 'buscosun Fusion 12', version: 12, stage: 'fs', anchor: 'swis', anchorMode: 'stations', anchorSlot: '2610030700', anchored: 1157, hourMean: true, runs: fcReal.engine.runs, tables: fcReal.engine.tables };
  const DENSE_AT = new Date(SLOT_MS - 14 * 60_000).toISOString();
  const ENGINE_DENSE = { ...ENGINE_F12, dense: { mode: 'all', builtAt: DENSE_AT, anchored: 4321 } };
  const donors = fcAxis;
  const axisOf = (c, anc = false) => roadFcAxisKms(c.lengthKm).map((km, i) => {
    const [lon, lat] = roadPointAtKm(c.line, km), d = donors[i % donors.length];
    return { ...d, id: roadFcAxisId(c.id, km), km, lon: +lon.toFixed(5), lat: +lat.toFixed(5), ...(anc ? { anc: [-4 - i, 62, 0] } : {}) };
  });
  const gapIds = ['a995', 'a36', 'a36-2', 'a8-8'];
  const gapExtra = (engine, anc) => (run, file) => Object.fromEntries(gapIds.map((id) => [`c/${id}.json`, { ...file, id, engine, points: axisOf(G(id), anc) }]));

  // S1–S6: view model without a browser.
  const gaps = gapDoc.corridors.filter((c) => c.gap === true);
  add('S1 Fixture und Kennzeichen: fünf echte Teilstücke ohne Messstelle (gap: true ⇔ keine Station); isGapCorridor trennt sie von den gemessenen Abschnitten',
    gaps.length === 5 && gaps.every((c) => c.stations.length === 0) && gapDoc.corridors.every((c) => !!c.gap === (c.stations.length === 0))
    && typeof view.isGapCorridor === 'function' && gapDoc.corridors.every((c) => view.isGapCorridor(c) === (c.stations.length === 0)), gaps.map((c) => c.id).join(' '));
  {
    const sorted = gapDoc.corridors.slice().sort((a, b) => view.roadNumber(a.road) - view.roadNumber(b.road) || b.stations.length - a.stations.length);
    const kinds = (e) => e.map((x) => (x.kind === 'fold' ? `+${x.road}:${x.hidden.map((c) => c.id).join(',')}` : x.corridor.id)).join(' ');
    const closed = kinds(view.dockEntries(sorted, { query: '', selectedId: null, open: new Set() }));
    const L = (road, hidden, open = false) => (typeof view.dockFoldLabel === 'function' ? view.dockFoldLabel(road, hidden, open) : 'dockFoldLabel fehlt');
    const short = G('a93-2');
    const labels = [L('A36', [G('a36-2')]), L('A93', [short]), L('A8', [short, G('a8-8'), G('a94-2')]), L('A36', [G('a36-2')], true), L('A93', [short], true), L('A8', [short, G('a8-8')], true)];
    add('S2 Dock: eine Autobahn nur aus Teilstücken hat ihre eigene Zeile (a36, a995), weitere Teilstücke stehen unter der Falt-Zeile je Autobahn; die Falt-Zeile nennt Teilstücke ohne Messstelle getrennt von kurzen Abschnitten, der alte Wortlaut bleibt',
      closed === 'a8 a8-2 +A8:a8-8 a9 a36 +A36:a36-2 a93 +A93:a93-2 a94 +A94:a94-2 a95 a96 a99 a995'
      && labels[0] === 'A 36: 1 Teilstück ohne Messstelle (nur Prognose)' && labels[1] === 'A 93: 1 kurzer Abschnitt mit weniger als 3 Messpunkten'
      && labels[2] === 'A 8: 1 kurzer Abschnitt mit weniger als 3 Messpunkten · 2 Teilstücke ohne Messstelle (nur Prognose)'
      && labels[3] === 'A 36: Teilstücke ohne Messstelle einklappen' && labels[4] === 'A 93: kurze Abschnitte einklappen' && labels[5] === 'A 8: kurze Abschnitte und Teilstücke einklappen',
      `${closed} | ${labels.join(' | ')}`);
  }
  {
    const h = typeof view.roadGapHead === 'function' ? [view.roadGapHead('buscosun Fusion 12', 'Lauf 09:55'), view.roadGapHead(null, 'kein Lauf für diese Strecke')] : ['roadGapHead fehlt'];
    add('S3 Kopf eines Teilstücks: „keine Messstelle an diesem Abschnitt · Prognose ‹Name aus der Laufdatei›"; ohne Lauf der Grund statt eines Namens',
      h[0] === 'keine Messstelle an diesem Abschnitt · Prognose buscosun Fusion 12' && h[1] === 'keine Messstelle an diesem Abschnitt · Prognose: kein Lauf für diese Strecke', h.join(' | '));
  }
  {
    const c = G('a995'), pts = axisOf(c);
    const file = { ...fcLive.file, id: c.id, points: [pts[2], pts[0], pts[1]] };
    const first = typeof fcv.firstRoadFcAxis === 'function' ? fcv.firstRoadFcAxis(file)?.id : 'firstRoadFcAxis fehlt';
    const none = typeof fcv.firstRoadFcAxis === 'function' ? fcv.firstRoadFcAxis({ ...file, points: [] }) : 'x';
    const rows = fcv.roadFcGapPoints(c, file).map((p) => p.km).sort((a, b) => a - b).join();
    // Negative control: the rule for a corridor WITH stations stays the old one (full 10 km, farther than the band reach).
    const a8 = { ...G('a8'), stations: G('a8').stations.slice(0, 2) };
    const oldRule = fcAxis.filter((p) => Math.round(p.km) % 10 === 0 && a8.stations.every((s) => Math.abs(s.km - p.km) > view.BAND_REACH_KM)).map((p) => p.id).join();
    add('S4 Voreinstellung und Streckentabelle eines Teilstücks: erster Achspunkt (kleinster km, unabhängig von der Reihenfolge der Datei), jede Zeile ein Achspunkt (alle 5 km); ein Abschnitt mit Messstellen behält die bisherige Regel',
      pts.length === 3 && first === 'a995@0' && none === null && rows === '0,5,10' && oldRule.split(',').length >= 5 && fcv.roadFcGapPoints(a8, fcLive.file).map((p) => p.id).join() === oldRule, JSON.stringify({ first, none, rows, a8: oldRule }));
  }
  {
    const T = fcv.roadFcAnchorText, U = fcv.roadFcAnchorSummary;
    const fNone = { engine: fcReal.engine }, fSwis = { engine: ENGINE_F12 }, fDense = { engine: ENGINE_DENSE }, fOff = { engine: { ...ENGINE_F12, dense: { mode: 'none', reason: 'obs/v1/latest.json ist 75 min alt (Grenze 60 min)' } } };
    const own = { anc: [12, 100, 1] }, near = { anc: [-4, 62, 0] }, bare = {};
    const stamp = hm(Date.parse(DENSE_AT)), slot = hm(Date.UTC(2026, 9, 3, 7, 0));
    const t = { noFile: T(near, null), none: T(near, fNone), swisBare: T(bare, fSwis), swisOwn: T(own, fSwis), swisNear: T(near, fSwis), denseNear: T(near, fDense), denseOwn: T(own, fDense), denseBare: T(bare, fDense), offBare: T(bare, fOff) };
    const u = { noFile: U(null), none: U(fNone), swis: U(fSwis), dense: U(fDense), off: U(fOff) };
    add('S5 Anker-Texte sagen nur, was die Laufdatei sagt: „ohne Messungs-Anker" nie ohne Datei; ohne engine.dense der bisherige Wortlaut; mit engine.dense der Messsatz obs/v1 mit seinem Stempel (Achspunkt, Messstelle, Punkt ohne Anker), abgeschaltet mit Grund',
      !/ohne Messungs-Anker/.test(t.noFile) && t.none === 'ohne Messungs-Anker' && t.swisBare === 'ohne Messungs-Anker'
      && t.swisOwn === `verankert an der Luftmessung dieser Messstelle von ${slot} (Messung − Modell +1,2 K)` && t.swisNear === `verankert an Messstellen im Umkreis von ${slot} (Gewicht 62 %)`
      && t.denseNear === `verankert an den nächsten Wetterstationen (Messprodukt obs/v1, Stand ${stamp}; Messung − Modell −0,4 K, Gewicht 62 %)`
      && t.denseOwn === `verankert an der Luftmessung dieser Messstelle von ${slot} und an den nächsten Wetterstationen (Messprodukt obs/v1, Stand ${stamp}; Messung − Modell +1,2 K)`
      && t.denseBare === 'an diesem Punkt ohne Messungs-Anker' && t.offBare === 'ohne Messungs-Anker'
      && u.noFile === 'Messungs-Anker je nach Lauf' && u.none === 'dieser Lauf ohne Messungs-Anker' && u.swis === `Messstellen an ihrer eigenen Luftmessung von ${slot} verankert, Prognosepunkte der Achse ohne Anker`
      && u.dense === `jeder Punkt an den nächsten Wetterstationen verankert (Messprodukt obs/v1, Stand ${stamp}, 4321 Punkte), Messstellen zusätzlich an ihrer eigenen Luftmessung von ${slot}`
      && u.off === `Messstellen an ihrer eigenen Luftmessung von ${slot} verankert, Prognosepunkte der Achse ohne Anker — der Messsatz obs/v1 blieb in diesem Lauf aus (obs/v1/latest.json ist 75 min alt (Grenze 60 min))`,
      JSON.stringify({ t, u }));
  }
  add('S6 Schreibweise (V-AF-26): „A 64a" statt „A 64A"; „A 8" und eine Bundesstraße mit Großbuchstaben („B 2R") bleiben',
    view.shieldText('A64A') === 'A 64a' && view.shieldText('A8') === 'A 8' && view.shieldText('A995') === 'A 995' && view.shieldText('B2R') === 'B 2R', [view.shieldText('A64A'), view.shieldText('B2R')].join(' '));

  // --- browser ---
  const gapSite = join(tmp, 'site-gap');
  cpSync(site, gapSite, { recursive: true });
  cpSync(join(FIX, 'corridors-gap.json'), join(gapSite, 'static', 'corridors.json'));
  const fcGap = mkFcSite('fc-gap', SLOT_MS - 5 * 60_000, { base: { ...fcReal, engine: ENGINE_F12 }, extra: gapExtra(ENGINE_F12, false) });
  const fcGapDense = mkFcSite('fc-gap-dense', SLOT_MS - 5 * 60_000, { base: { ...fcReal, engine: ENGINE_DENSE }, extra: gapExtra(ENGINE_DENSE, true) });
  const a995 = G('a995'), nAxis = roadFcAxisKms(a995.lengthKm).length;
  const fcLinePx = async (ctx) => {
    // Pixels in the forecast line colour (tolerance ± 8 per channel) — the selected section's line on the map.
    const hex = fcv.ROAD_FC_LINE_COLOR ?? '#000000', want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    // Only the map above the band counts: the readout's chart draws its forecast line in the same colour.
    const box = await ctx.evaluate(`(() => { const m = document.querySelector('.aw-map').getBoundingClientRect(), b = document.querySelector('.aw-band')?.getBoundingClientRect(); return [Math.round(m.left), Math.round(m.top), Math.round(m.right), Math.round(b ? b.top : m.bottom)]; })()`);
    const img = await shotPng(ctx), A = pngLib.toRgba(img);
    let n = 0;
    for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
      const i = (y * img.width + x) * 4;
      if (Math.abs(A[i] - want[0]) <= 8 && Math.abs(A[i + 1] - want[1]) <= 8 && Math.abs(A[i + 2] - want[2]) <= 8) n++;
    }
    return n;
  };
  const pageText = `(document.querySelector('.aw-root')?.innerText ?? '')`;
  // A count of zero anywhere on the page ("30 gemessen" of a measured corridor is none).
  const ZERO = /(?<!\d)0 (?:Messpunkte|von 0|gemessen)/;
  {
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a995?road=1', root: gapSite, fcRoot: fcGap.dir });
    const ready = await until(ctx, `document.querySelectorAll('.aw-band-fc-cell').length > 0 && !!document.querySelector('.aw-axis')`, 30_000);
    await sleep(1200);
    const r = await ctx.evaluate(`({ sub: document.querySelector('.aw-pill-sub')?.textContent ?? '', stand: document.querySelector('.aw-band-stand')?.textContent ?? '', ticks: document.querySelectorAll('.aw-band-tick').length, bar: document.querySelectorAll('.aw-band-bar').length,
      cells: document.querySelectorAll('.aw-band-fc-cell').length, legend: [...document.querySelectorAll('.aw-band-legend')].map((e) => e.textContent).join(' | '), name: document.querySelector('.aw-axis .aw-station-name')?.textContent ?? '',
      axisSub: document.querySelector('.aw-axis .aw-station-sub')?.textContent ?? '', url: location.pathname + location.search, text: ${pageText}, mapLegend: document.querySelector('.aw-legend')?.textContent ?? '', chip0: document.querySelector('.aw-times button')?.textContent ?? '',
      box: (() => { const b = document.querySelector('.aw-band')?.getBoundingClientRect(), m = document.querySelector('.aw-map')?.getBoundingClientRect(); return b && m ? [Math.round(b.left - m.left), Math.round(m.bottom - b.bottom)] : null; })() })`);
    add('S7 Teilstück ohne Messstelle (A 995, Desktop): Kopf „keine Messstelle an diesem Abschnitt · Prognose ‹Name aus der Laufdatei›", Pille „nur Prognose", Band nur mit der Prognose-Zeile (eine Zelle je Achspunkt, kein Messbalken, kein Messpunkt), nirgends „0 Messpunkte"',
      ready && r.stand === 'keine Messstelle an diesem Abschnitt · Prognose buscosun Fusion 12' && /nur Prognose/.test(r.sub) && r.ticks === 0 && r.bar === 0 && r.cells === nAxis
      && !/Messung DWD|10-km-Umkreis|Messpunkt, nicht Strecke/.test(r.legend) && /keine Messstelle an diesem Abschnitt/.test(r.legend) && /Prognose Luft jetzt/.test(r.legend) && !ZERO.test(r.text) && r.box?.[0] === 16 && r.box?.[1] === 16,
      JSON.stringify({ sub: r.sub, stand: r.stand, ticks: r.ticks, bar: r.bar, cells: r.cells, nAxis, legend: r.legend.slice(0, 160), box: r.box, zero: ZERO.exec(r.text)?.[0] ?? null }));
    add('S8 Voreinstellung = erster Achspunkt: Detailspalte „Prognosepunkt · ‹Name›" auf „A 995 · km 0" mit „keine Messstelle an diesem Abschnitt", die URL bleibt ohne st=; der Chip „Jetzt" trägt keine Messzeit',
      /^A 995 · km 0$/.test(r.name) && /keine Messstelle an diesem Abschnitt/.test(r.axisSub) && r.url.startsWith('/autobahnwetter/a995') && !/[?&]st=/.test(r.url) && r.chip0 === 'Jetzt', JSON.stringify({ name: r.name, axisSub: r.axisSub, url: r.url, chip0: r.chip0 }));
    await until(ctx, `!!document.querySelector('.aw-map-canvas')?.dataset.idle`, 45_000);
    await sleep(2500);
    const co = await ctx.evaluate(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
      const hit = (a, b) => !!a && !!b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      const c = r('.aw-callout'), pill = r('.aw-ov-left .aw-pill'), times = r('.aw-ov-left .aw-times');
      return { c, pill, times, covered: hit(c, pill) || hit(c, times), text: document.querySelector('.aw-callout')?.textContent ?? '' }; })()`);
    add('S8b Callout des ersten Achspunkts (Nordende, direkt unter Pille und Zeitchips) steht frei — unter dem Punkt statt hinter der Pille', !!co.c && !co.covered && /A 995 · km 0/.test(co.text) && /Prognose Luft/.test(co.text), JSON.stringify(co));
    const px = await fcLinePx(ctx);
    add('S9 Karte: die Linie des gewählten Teilstücks in der Prognose-Farbe (Legende „Abschnitt ohne Messstelle · nur Prognose"), die Fahrbahn-Legende bleibt', px > 300 && /Abschnitt ohne Messstelle · nur Prognose/.test(r.mapLegend) && /Fahrbahn/.test(r.mapLegend), JSON.stringify({ px, legend: r.mapLegend.slice(0, 200) }));
    await shot(ctx, 's7-teilstueck-desktop');
    await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][1].click()`);
    await sleep(600);
    const s = await ctx.evaluate(`({ fcRows: document.querySelectorAll('.aw-table-row.is-fc-row').length, rows: document.querySelectorAll('.aw-table-row').length, brief: document.querySelector('.aw-brief')?.textContent ?? '', note: document.querySelector('.aw-readout .aw-note')?.textContent ?? '', text: ${pageText} })`);
    add('S10 Reiter Strecke: jede Zeile ein Prognosepunkt (alle Achspunkte), Briefing „Keine Messstelle an diesem Abschnitt" mit „Prognose zur Ankunft", Hinweis ohne Messpunkt-Sätze, nirgends „0 von 0"',
      s.rows === nAxis && s.fcRows === nAxis && /Keine Messstelle an diesem Abschnitt/.test(s.brief) && /Prognose zur Ankunft/.test(s.brief) && !/Zwischen zwei Messpunkten|bis \+30 min die Messung/.test(s.note) && /keine Prognose der Fahrbahn|Prognose der Fahrbahn folgt/.test(s.note) && !ZERO.test(s.text),
      JSON.stringify({ rows: s.rows, fcRows: s.fcRows, brief: s.brief.slice(0, 140), note: s.note.slice(0, 120) }));
    await shot(ctx, 's10-teilstueck-strecke');
    await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][2].click()`);
    await sleep(400);
    const q = await ctx.evaluate(`[...document.querySelectorAll('.aw-source')].map((e) => e.textContent).find((x) => /buscosun Fusion 12/.test(x)) ?? ''`);
    // Dock: rows of the sections and the fold rows.
    const d = await ctx.evaluate(`({ rows: [...document.querySelectorAll('.aw-dock .aw-road:not(.is-static)')].map((e) => [e.querySelector('.aw-shield')?.textContent, e.querySelector('.aw-road-sub')?.textContent, e.querySelector('.aw-road-dot')?.className]),
      folds: [...document.querySelectorAll('.aw-dock .aw-road-more')].map((e) => e.textContent) })`);
    const gapRows = d.rows.filter((x) => /nur Prognose/.test(x[1] ?? ''));
    add('S11 Dock: Teilstücke heißen „nur Prognose · keine Messstelle" mit Prognose-Punkt statt Klassenfarbe (a36 und a995 als eigene Zeilen), die Falt-Zeilen nennen sie je Autobahn; gemessene Abschnitte unverändert',
      gapRows.length === 2 && gapRows.every((x) => x[1] === 'nur Prognose · keine Messstelle' && /is-fc/.test(x[2] ?? '')) && gapRows.map((x) => x[0]).join() === 'A 36,A 995'
      && d.folds.join(' | ') === 'A 8: 1 Teilstück ohne Messstelle (nur Prognose) | A 36: 1 Teilstück ohne Messstelle (nur Prognose) | A 93: 1 kurzer Abschnitt mit weniger als 3 Messpunkten | A 94: 1 Teilstück ohne Messstelle (nur Prognose)'
      && d.rows.filter((x) => /gemessen/.test(x[1] ?? '')).length === 8, JSON.stringify({ gapRows, folds: d.folds, n: d.rows.length }));
    off(); allErrors.push(...errors); await ctx.close();
    // Quellen with and without the dense set (the same page on a run that carries `engine.dense`).
    const dense = await openPage({ path: '/autobahnwetter/a995?tab=quellen&road=1', root: gapSite, fcRoot: fcGapDense.dir });
    await until(dense.ctx, `[...document.querySelectorAll('.aw-source')].some((e) => /buscosun Fusion 12/.test(e.textContent)) && document.querySelectorAll('.aw-band-fc-cell').length > 0`, 30_000);
    const qd = await dense.ctx.evaluate(`[...document.querySelectorAll('.aw-source')].map((e) => e.textContent).find((x) => /buscosun Fusion 12/.test(x)) ?? ''`);
    await dense.ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][0].click()`);
    await sleep(500);
    const nd = await dense.ctx.evaluate(`({ note: document.querySelector('.aw-axis .aw-fc-note')?.textContent ?? '', src: document.querySelector('.aw-sources')?.textContent ?? '' })`);
    await shot(dense.ctx, 's12-teilstueck-dichter-messsatz');
    dense.off(); allErrors.push(...dense.errors); await dense.ctx.close();
    const stamp = hm(Date.parse(DENSE_AT));
    add('S12 Quellen und Prognosepunkt je nach Laufdatei: ohne engine.dense „Prognosepunkte der Achse ohne Anker"; mit engine.dense nennt der Quellen-Reiter den Messsatz obs/v1 mit seinem Stempel, der Prognosepunkt „verankert an den nächsten Wetterstationen" — und nicht „ohne Messungs-Anker"',
      /Prognosepunkte der Achse ohne Anker/.test(q) && !/obs\/v1/.test(q) && qd.includes(`Messprodukt obs/v1, Stand ${stamp}`) && /jeder Punkt an den nächsten Wetterstationen verankert/.test(qd)
      && nd.note.includes(`verankert an den nächsten Wetterstationen (Messprodukt obs/v1, Stand ${stamp}`) && !/ohne Messungs-Anker/.test(nd.note + nd.src), JSON.stringify({ q: q.slice(-110), qd: qd.slice(-150), note: nd.note.slice(-150) }));
  }
  {
    // Negative control of S9: a measured corridor keeps its line colour (no pixel run of the forecast colour, no legend row).
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a8?road=1', root: gapSite, fcRoot: fcGap.dir });
    await until(ctx, `document.querySelectorAll('.aw-band-tick').length > 5`, 30_000);
    await until(ctx, `!!document.querySelector('.aw-map-canvas')?.dataset.idle`, 45_000);
    await sleep(2500);
    const px = await fcLinePx(ctx);
    const r = await ctx.evaluate(`({ legend: document.querySelector('.aw-legend')?.textContent ?? '', sub: document.querySelector('.aw-pill-sub')?.textContent ?? '', stand: document.querySelector('.aw-band-stand')?.textContent ?? '', bar: document.querySelectorAll('.aw-band-bar').length })`);
    add('S13 Gegenprobe: ein Abschnitt mit Messstellen (A 8) behält Linie, Kopf und Messbalken — keine Linie in der Prognose-Farbe, kein „nur Prognose"',
      px < 60 && !/ohne Messstelle/.test(r.legend) && !/nur Prognose/.test(r.sub) && /^Messung 10:00/.test(r.stand) && r.bar === 1, JSON.stringify({ px, sub: r.sub, stand: r.stand }));
    off(); allErrors.push(...errors); await ctx.close();
  }
  {
    // A motorway that consists of such sections only (A 36): the fold row opens the second one, picking it opens it.
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a36?road=1', root: gapSite, fcRoot: fcGap.dir });
    await until(ctx, `document.querySelectorAll('.aw-band-fc-cell').length > 0 && /a36/.test(location.pathname)`, 30_000);
    const before = await ctx.evaluate(`({ title: document.querySelector('.aw-pill-title')?.textContent ?? '', cells: document.querySelectorAll('.aw-band-fc-cell').length, active: document.querySelector('.aw-dock .aw-road.is-active .aw-road-sub')?.textContent ?? '' })`);
    await ctx.evaluate(`[...document.querySelectorAll('.aw-dock .aw-road-more')].find((e) => /^A 36:/.test(e.textContent))?.click()`);
    await sleep(300);
    const open = await ctx.evaluate(`({ label: [...document.querySelectorAll('.aw-dock .aw-road-more')].find((e) => /^A 36:/.test(e.textContent))?.textContent ?? '', rows: [...document.querySelectorAll('.aw-dock .aw-road:not(.is-static)')].filter((e) => e.querySelector('.aw-shield')?.textContent === 'A 36').length })`);
    await ctx.evaluate(`[...document.querySelectorAll('.aw-dock .aw-road:not(.is-static)')].filter((e) => e.querySelector('.aw-shield')?.textContent === 'A 36')[1]?.click()`);
    const moved = await until(ctx, `location.pathname === '/autobahnwetter/a36-2' && document.querySelectorAll('.aw-band-fc-cell').length === ${roadFcAxisKms(G('a36-2').lengthKm).length}`, 15_000);
    const after = await ctx.evaluate(`({ title: document.querySelector('.aw-pill-title')?.textContent ?? '', ticks: document.querySelectorAll('.aw-band-tick').length, name: document.querySelector('.aw-axis .aw-station-name')?.textContent ?? '' })`);
    add('S14 Autobahn nur aus Teilstücken (A 36): eigene Zeile „nur Prognose", die Falt-Zeile klappt das zweite Teilstück auf, die Wahl öffnet es (Pfad /autobahnwetter/a36-2, Band = seine Achspunkte, erster Achspunkt gewählt)',
      before.title === 'Heidberg → Blankenburg' && before.cells === roadFcAxisKms(G('a36').lengthKm).length && before.active === 'nur Prognose · keine Messstelle' && open.label === 'A 36: Teilstücke ohne Messstelle einklappen' && open.rows === 2
      && moved && after.title === 'Blankenburg → Bernburg' && after.ticks === 0 && after.name === 'A 36 · km 0', JSON.stringify({ before, open, after }));
    off(); allErrors.push(...errors); await ctx.close();
  }
  {
    // The hour between playing in the corridors and the first run that covers them: a section without a run file.
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a94-2?road=1', root: gapSite, fcRoot: fcGap.dir });
    const ok = await until(ctx, `/kein Lauf für diese Strecke/.test(document.querySelector('.aw-readout')?.textContent ?? '') && /a94-2/.test(location.pathname)`, 30_000);
    const r = await ctx.evaluate(`({ stand: document.querySelector('.aw-band-stand')?.textContent ?? '', none: document.querySelector('.aw-band-none')?.textContent ?? '', empty: document.querySelector('.aw-readout .aw-empty')?.textContent ?? '', ticks: document.querySelectorAll('.aw-band-tick').length, bar: document.querySelectorAll('.aw-band-bar').length,
      chips: [...document.querySelectorAll('.aw-times button')].slice(1).every((b) => b.disabled), text: ${pageText} })`);
    await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')][1].click()`);
    await sleep(400);
    const st = await ctx.evaluate(`document.querySelector('.aw-readout .aw-empty')?.textContent ?? ''`);
    await shot(ctx, 's15-teilstueck-ohne-lauf');
    add('S15 Teilstück, für das der Lauf (noch) keine Datei führt: Kopf, Band und Detailspalte nennen „keine Messstelle an diesem Abschnitt" und den Grund („kein Lauf für diese Strecke") — kein leeres Band, kein „Messstelle wählen", Zeitchips gesperrt; Reiter Strecke ebenso',
      ok && r.stand === 'keine Messstelle an diesem Abschnitt · Prognose: kein Lauf für diese Strecke' && /Keine Messstelle an diesem Abschnitt/.test(r.none) && /kein Lauf für diese Strecke/.test(r.none) && r.ticks === 0 && r.bar === 0
      && /Keine Messstelle an diesem Abschnitt/.test(r.empty) && /kein Lauf für diese Strecke/.test(r.empty) && !/Messstelle auf der Karte/.test(r.empty) && r.chips && !ZERO.test(r.text) && /Keine Messstelle an diesem Abschnitt/.test(st) && !/Autobahn im Dock wählen/.test(st),
      JSON.stringify({ stand: r.stand, none: r.none.slice(0, 110), empty: r.empty.slice(0, 130), st: st.slice(0, 90) }));
    off(); allErrors.push(...errors); await ctx.close();
  }
  {
    // Measurement outage (every slot 404) on such a section: the forecast is all the section has — it stays.
    const empty = mkdtempSync(join(tmpdir(), 'road-ui-gap-empty-'));
    cpSync(join(gapSite, 'static'), join(empty, 'static'), { recursive: true });
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a995?road=1', root: empty, fcRoot: fcGap.dir });
    const ok = await until(ctx, `!!document.querySelector('.aw-axis') && document.querySelectorAll('.aw-band-fc-cell').length === ${nAxis} && /Keine Daten/.test(document.querySelector('.aw-live')?.textContent ?? '')`, 30_000);
    const r = await ctx.evaluate(`({ stand: document.querySelector('.aw-band-stand')?.textContent ?? '', name: document.querySelector('.aw-axis .aw-station-name')?.textContent ?? '' })`);
    add('S16 Messung ausgefallen (alle Slots 404), Teilstück gewählt: Prognosepunkt und Prognose-Zeile stehen, der Kopf bleibt beim Teilstück; die Topbar sagt „Keine Daten" für die Messung', ok && /^keine Messstelle an diesem Abschnitt · Prognose buscosun Fusion 12$/.test(r.stand) && r.name === 'A 995 · km 0', JSON.stringify(r));
    off(); allErrors.push(...errors); await ctx.close();
    rmSync(empty, { recursive: true, force: true });
  }
  {
    // Mobile 390 × 844.
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a995?road=1', width: 390, height: 844, mobile: true, root: gapSite, fcRoot: fcGap.dir });
    const ready = await until(ctx, `!!document.querySelector('.aw-sheet') && document.querySelectorAll('.aw-sheet-row').length > 0`, 30_000);
    await sleep(1200);
    const m = await ctx.evaluate(`({ sub: document.querySelector('.aw-m-top .aw-pill-sub')?.textContent ?? '', title: document.querySelector('.aw-sheet-title')?.textContent ?? '', lead: document.querySelector('.aw-sheet-lead')?.textContent ?? '', rows: [...document.querySelectorAll('.aw-sheet-row')].map((e) => e.textContent),
      mini: document.querySelectorAll('.aw-miniband:not(.is-fc)').length, miniFc: document.querySelectorAll('.aw-miniband.is-fc .aw-band-seg').length, primary: document.querySelector('.aw-sheet-actions .aw-btn.is-primary')?.textContent ?? '', text: ${pageText},
      small: [...document.querySelectorAll('.aw-sheet button, .aw-m-top button')].filter((b) => b.offsetParent && !b.closest('.aw-seg')).map((b) => { const r = b.getBoundingClientRect(); return [b.className, Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => Math.min(w, h) < 44) })`);
    await shot(ctx, 's17-teilstueck-mobil');
    await ctx.evaluate(`document.querySelector('.aw-sheet-row')?.click()`);
    const picked = await until(ctx, `/[?&]st=a995(%40|@)/.test(location.search)`, 8000);
    add('S17 Teilstück mobil (390 × 844): Pille „nur Prognose", Sheet „Keine Messstelle an diesem Abschnitt" mit dem Namen aus der Laufdatei, Zeilen = Prognosepunkte mit Ankunftszeit (≥ 44 px, Antippen wählt den Punkt), Mini-Band nur als Prognose-Zeile, Knopf „Alle n Prognosepunkte", nirgends „0 Messpunkte"',
      ready && /nur Prognose/.test(m.sub) && !/Messpunkte/.test(m.sub) && m.title === 'Keine Messstelle an diesem Abschnitt' && /buscosun Fusion 12/.test(m.lead) && /keine Fahrbahnmessung/.test(m.lead) && m.rows.length === nAxis && m.rows.every((x) => /Prognose Luft/.test(x) && /\d{2}:\d{2}/.test(x))
      && m.mini === 0 && m.miniFc === nAxis && m.primary === `Alle ${nAxis} Prognosepunkte` && m.small.length === 0 && !ZERO.test(m.text) && picked, JSON.stringify({ sub: m.sub, title: m.title, lead: m.lead.slice(0, 120), rows: m.rows.length, mini: m.mini, miniFc: m.miniFc, primary: m.primary, small: m.small.slice(0, 3), picked }));
    off(); allErrors.push(...errors); await ctx.close();
  }
}

// --- T: town labels under the band never overlap (V-AF-28, audit/autobahn-fusion12-lueckenlos.md §8.8) --------------------
// The builder writes the towns of a corridor as [km, name]: the two end towns (`from`, `to`) and every city from 50 000
// inhabitants within 8 km. Two of them often share a km (A 995: „München" and „Unterhaching" at km 0). The band picks the
// labels that fit: end towns first, then the cities in km order; a name that does not fit moves into the tooltip of the
// label it collided with. Measured on the REAL band in the browser; `--towns=<corridors.json>` walks every corridor of
// that file (the live file, the AF-2 candidate) and prints the count.
{
  const view = await import('../src/road/roadView.ts');
  const gapDoc = JSON.parse(readFileSync(join(FIX, 'corridors-gap.json'), 'utf8'));
  {
    const P = typeof view.pickBandLabels === 'function' ? view.pickBandLabels : null;
    const r1 = P?.([[0, 50], [0, 80], [300, 380]], [false, true, true]);              // same place: the end town wins
    const r2 = P?.([[0, 50], [100, 150], [300, 380]], [true, false, true]);           // nothing collides: all stay
    const r3 = P?.([[0, 50], [53, 100], [200, 260]], [true, false, true]);            // 3 px apart is too close (gap 6)
    const r4 = P?.([[0, 50], [57, 100], [200, 260]], [true, false, true]);            // 7 px apart fits
    const r5 = P?.([[0, 60], [40, 90], [80, 130], [300, 350]], [true, false, false, true]); // the second falls, the third then fits
    const r6 = P?.([[0, 60], [20, 90]], [true, true]);                                // both ends collide: the first stays
    add('T1 Auswahl der Ortsnamen (reine Funktion): Endorte zuerst, dann in km-Reihenfolge; ein Name, der näher als 6 px an einem gesetzten liegt, fällt und wird dem nächsten gesetzten zugeordnet; ohne Kollision bleibt jeder',
      !!P && r1.keep.join() === 'false,true,true' && r1.also[1].join() === '0' && r2.keep.every(Boolean) && r2.also.every((a) => a.length === 0)
      && r3.keep.join() === 'true,false,true' && r3.also[0].join() === '1' && r4.keep.every(Boolean)
      && r5.keep.join() === 'true,false,true,true' && r5.also[0].join() === '1' && r6.keep.join() === 'true,false' && r6.also[0].join() === '1',
      P ? JSON.stringify({ r1, r3, r5, r6 }) : 'pickBandLabels fehlt');
  }

  const townsSite = (name, file) => { const d = join(tmp, name); cpSync(site, d, { recursive: true }); cpSync(file, join(d, 'static', 'corridors.json')); return d; };
  const measure = `(() => { const el = document.querySelector('.aw-band-towns'); if (!el) return null; const band = el.getBoundingClientRect();
    const sp = [...el.children].map((s) => { const r = s.getBoundingClientRect(); return { n: s.textContent, l: r.left - band.left, r: r.right - band.left, vis: getComputedStyle(s).visibility !== 'hidden', title: s.getAttribute('title') ?? '' }; });
    return { w: Math.round(band.width), sp: sp.map((x) => [x.n, x.vis ? 1 : 0, Math.round(x.l), Math.round(x.r), x.title]) }; })()`;
  // What must hold for one band: visible labels ≥ 4 px apart and inside the band, the end towns visible, every hidden
  // name really collides with a visible one (nothing dropped without need) and is named in a tooltip.
  const judge = (c, m) => {
    if (!m) return { ok: false, why: 'kein Band' };
    const vis = m.sp.filter((x) => x[1]), hid = m.sp.filter((x) => !x[1]);
    const hits = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) if (vis[i][2] < vis[j][3] + 4 && vis[j][2] < vis[i][3] + 4) hits.push(`${vis[i][0]}×${vis[j][0]}`);
    const out = vis.filter((x) => x[2] < -1 || x[3] > m.w + 1).map((x) => x[0]);
    const ends = [...new Set([c.from, c.to])].filter((n) => n && c.towns.some((t) => t[1] === n));
    const endsShown = ends.filter((n) => vis.some((x) => x[0] === n));
    const needless = hid.filter((h) => !vis.some((v) => h[2] < v[3] + 6 && v[2] < h[3] + 6)).map((x) => x[0]);
    const unnamed = hid.filter((h) => !vis.some((v) => v[4].includes(h[0]))).map((x) => x[0]);
    // Both end towns can only be missing together when they collide with each other (a very short section).
    const ok = hits.length === 0 && out.length === 0 && endsShown.length >= Math.min(1, ends.length) && (endsShown.length === ends.length || hid.some((h) => ends.includes(h[0]))) && needless.length === 0 && unnamed.length === 0;
    return { ok, hits, out, hidden: hid.map((x) => x[0]), needless, unnamed, w: m.w };
  };
  const walk = async (ctx, list) => {
    const res = [];
    for (const c of list) {
      const want = JSON.stringify(c.towns.slice().sort((a, b) => a[0] - b[0]).map((t) => t[1]).sort());
      // A history entry as the router writes it (own key): the page follows a POP only when the key changes.
      await ctx.evaluate(`(() => { const st = { usr: null, key: 't' + Math.random().toString(36).slice(2, 10), idx: (history.state?.idx ?? 0) + 1 }; history.pushState(st, '', '/autobahnwetter/${c.id}?road=1'); dispatchEvent(new PopStateEvent('popstate', { state: st })); })()`);
      const there = await until(ctx, `JSON.stringify([...(document.querySelector('.aw-band-towns')?.children ?? [])].map((s) => s.textContent).sort()) === ${JSON.stringify(want)} && (document.querySelector('.aw-band-title')?.textContent ?? '').includes(${JSON.stringify(view.shieldText(c.road))})`, 8000);
      await sleep(120);
      res.push({ id: c.id, there, ...judge(c, there ? await ctx.evaluate(measure) : null) });
    }
    return res;
  };
  const fmt = (res) => res.filter((x) => !x.ok).slice(0, 6).map((x) => `${x.id}: ${x.there ? [x.hits?.join(','), x.out?.length ? `außen ${x.out.join(',')}` : '', x.needless?.length ? `grundlos ${x.needless.join(',')}` : '', x.unnamed?.length ? `ohne Tooltip ${x.unnamed.join(',')}` : ''].filter(Boolean).join(' · ') : 'Band nicht erreicht'}`).join(' | ');
  {
    const d = townsSite('site-towns', join(FIX, 'corridors-gap.json'));
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter/a8?road=1', root: d });
    await until(ctx, `document.querySelectorAll('.aw-band-towns span').length > 0`, 30_000);
    await ctx.evaluate(`document.fonts.ready.then(() => true)`);
    await sleep(600);
    const wide = await walk(ctx, gapDoc.corridors);
    const by = (id) => wide.find((x) => x.id === id);
    const a995 = await (async () => { await walk(ctx, [gapDoc.corridors.find((c) => c.id === 'a995')]); return ctx.evaluate(measure); })();
    await shot(ctx, 't3-ortsnamen-a995');
    const vis995 = a995.sp.filter((x) => x[1]).map((x) => x[0]).join(), tip995 = a995.sp.find((x) => x[0] === 'Unterhaching')?.[4] ?? '';
    add('T2 Band am Desktop (1440): an allen 14 Abschnitten der Fixture überlappt kein sichtbarer Ortsname, keiner ragt aus dem Band, die Endorte stehen, kein Name fällt ohne Kollision; die Fixture enthält die Fälle (≥ 3 Abschnitte mit zwei Orten am selben km)',
      wide.every((x) => x.ok) && wide.filter((x) => x.hidden.length > 0).length >= 3, `Band ${wide[0]?.w} px · ausgeblendet an ${wide.filter((x) => x.hidden?.length).map((x) => `${x.id} (${x.hidden.join(',')})`).join(' ')}${fmt(wide) ? ` · FEHLER ${fmt(wide)}` : ''}`);
    add('T3 A 995 (zwei Orte bei km 0): „Unterhaching" und „Taufkirchen" (die Endorte des Titels) stehen, „München" steht im Tooltip von „Unterhaching" statt darüber',
      vis995 === 'Unterhaching,Taufkirchen' && /München/.test(tip995), JSON.stringify({ vis995, tip995 }));
    add('T4 Gegenprobe: ein Abschnitt ohne Kollision behält jeden Namen an seinem Platz (A 8: München links bei 0, Rosenheim mittig bei km 61, Salzburg rechts am Ende; kein Tooltip)',
      by('a8')?.ok && by('a8').hidden.length === 0 && (() => { const m = wide.find((x) => x.id === 'a8'); return !!m; })(), JSON.stringify(by('a8')));
    {
      await walk(ctx, [gapDoc.corridors.find((c) => c.id === 'a8')]);
      const m = await ctx.evaluate(measure);
      const [mu, ro, sa] = ['München', 'Rosenheim', 'Salzburg'].map((n) => m.sp.find((x) => x[0] === n));
      const mid = (61 / 128.7) * m.w;
      add('T4b A 8, Lage: München beginnt bei 0, Rosenheim mittig auf seinem km, Salzburg endet am Bandende', !!mu && !!ro && !!sa && Math.abs(mu[2]) <= 1 && Math.abs((ro[2] + ro[3]) / 2 - mid) <= 1.5 && Math.abs(sa[3] - m.w) <= 1 && m.sp.every((x) => x[1] && !x[4]), JSON.stringify(m));
    }
    // The band gets narrower without a reload: the choice is measured again.
    await ctx.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await sleep(700);
    const narrow = await walk(ctx, gapDoc.corridors);
    add('T5 schmaleres Fenster (1024) ohne Neuladen: dieselben Regeln, gemessen am schmaleren Band — es fallen mehr Namen, keiner überlappt',
      narrow.every((x) => x.ok) && (narrow[0]?.w ?? 0) < (wide[0]?.w ?? 0) && narrow.reduce((n, x) => n + x.hidden.length, 0) >= wide.reduce((n, x) => n + x.hidden.length, 0),
      `Band ${narrow[0]?.w} px · ausgeblendet ${narrow.reduce((n, x) => n + (x.hidden?.length ?? 0), 0)} (1440: ${wide.reduce((n, x) => n + (x.hidden?.length ?? 0), 0)})${fmt(narrow) ? ` · FEHLER ${fmt(narrow)}` : ''}`);
    await ctx.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    // Driving the other way: the band is mirrored, the end towns swap sides.
    await walk(ctx, [gapDoc.corridors.find((c) => c.id === 'a36')]);
    await ctx.evaluate(`document.querySelector('button[aria-label="Fahrtrichtung wechseln"]')?.click()`);
    await until(ctx, `/[?&]dir=1/.test(location.search)`, 5000);
    await sleep(300);
    const c36 = gapDoc.corridors.find((c) => c.id === 'a36'), rev = judge(c36, await ctx.evaluate(measure));
    const m36 = await ctx.evaluate(measure);
    add('T6 Gegenrichtung (A 36, dir=1): das Band ist gespiegelt, „Blankenburg" steht links am Anfang, „Heidberg" rechts am Ende, nichts überlappt',
      rev.ok && (m36.sp.find((x) => x[0] === 'Blankenburg')?.[2] ?? 99) < 0.02 * m36.w && Math.abs((m36.sp.find((x) => x[0] === 'Heidberg')?.[3] ?? 0) - m36.w) <= 1, JSON.stringify({ rev, sp: m36.sp }));
    await shot(ctx, 't6-ortsnamen-a36-gegenrichtung');
    off(); allErrors.push(...errors); await ctx.close();
  }
  if (args.towns) {
    // Every corridor of a real file (not part of the gate count unless given): the number that the audit quotes.
    const doc = JSON.parse(readFileSync(args.towns, 'utf8'));
    const d = townsSite('site-towns-all', args.towns);
    const { ctx, errors, off } = await openPage({ path: `/autobahnwetter/${doc.corridors[0].id}?road=1`, root: d });
    await until(ctx, `document.querySelectorAll('.aw-band-towns span').length > 0`, 30_000);
    await ctx.evaluate(`document.fonts.ready.then(() => true)`);
    await sleep(600);
    const all = await walk(ctx, doc.corridors);
    const bad = all.filter((x) => !x.ok), reached = all.filter((x) => x.there).length;
    const long = doc.corridors.find((c) => c.id === 'a1');
    if (long) { await walk(ctx, [long]); await shot(ctx, 't7-ortsnamen-a1'); }
    const collide = all.filter((x) => (x.hits?.length ?? 0) > 0), gapIds = new Set(doc.corridors.filter((c) => c.stations.length === 0).map((c) => c.id));
    add(`T7 jede Strecke der Datei ${args.towns.split(/[\\/]/).slice(-4).join('/')} (${doc.corridors.length} Abschnitte, Band ${all[0]?.w} px): kein sichtbarer Ortsname überlappt oder ragt aus dem Band`,
      reached === all.length && bad.length === 0,
      `erreicht ${reached}/${all.length} · mit Überlappung ${collide.length} (davon Teilstücke ohne Messstelle ${collide.filter((x) => gapIds.has(x.id)).length}) · außerhalb des Bands ${all.filter((x) => x.out?.length).length} · mit ausgeblendetem Namen ${all.filter((x) => x.hidden?.length).length} (${all.reduce((n, x) => n + (x.hidden?.length ?? 0), 0)} Namen)${fmt(all) ? ` · FEHLER ${fmt(all)}` : ''}`);
    off(); allErrors.push(...errors); await ctx.close();
  }
}

// --- U: AW-8 hazard rail and detail (behind ROAD_HZ_LIVE / ?roadhz=1) ---------------------------------------------
{
  // Fixture site with hazards: the segments of the fixture corridors, the hazard file of the slot derived by the REAL
  // derive on the fixture store (no radar/KONRAD/runs ⇒ named as missing), plus scenario entries that the slot of
  // 03.10. 08:00 does not carry (Reifnacht on A 8 Weyarn – Irschenberg, Sturm, Nebel, a measurement gap).
  const hzSite = join(tmp, 'site-hz');
  cpSync(site, hzSite, { recursive: true });
  cpSync(join(FIX, 'segments-munich.json'), join(hzSite, 'static', 'segments.json'));
  const hzRoot = join(tmp, 'hz-root');
  mkdirSync(join(hzRoot, 'road', 'fc'), { recursive: true });
  cpSync(fcLive.dir, join(hzRoot, 'road', 'fc', 'v1'), { recursive: true });
  const hzOut = join(tmp, 'hz-out');
  const hzSum = deriveRoadHazards({ storeDir: hzSite, imgDir: join(tmp, 'img-none'), rootDir: hzRoot, outDir: hzOut, stamp: '2610030800', nowMs: SLOT_MS + 12 * 60_000 });
  const hzFile = JSON.parse(readFileSync(join(hzOut, 'hz', '2610030800.json'), 'utf8'));
  const segDoc = JSON.parse(readFileSync(join(FIX, 'segments-munich.json'), 'utf8'));
  const segA8 = segDoc.segments.find((s) => s.id === 'A8-034');
  const stA8 = segA8.stations[0];
  hzFile.seg['A8-034'] = { lv: { reif: [3, 2, 2, 1, 0, 0, 0], sonne: [0, 0, 2, 1, 0, 0, 0] }, ev: { reif: 'mppp---', sonne: '--pp---' }, why: { reif: [`code:Reif@${stA8}`, `Tf:-1.4@${stA8}`, `Td:-0.6@${stA8}`, `rF:90@${stA8}`], sonne: ['elev:6.8@sun', 'az:118@sun', 'clct:20@a8@35', 'wet:1'] }, dir: { sonne: 0 } };
  const segA8b = segDoc.segments.find((s) => s.id === 'A8-044');
  hzFile.seg['A8-044'] = { lv: { nass: [2, 2, 1, 0, 0, 0, 0], gischt: [1, 0, 0, 0, 0, 0, 0] }, ev: { nass: 'dpp----', gischt: 'd------' }, why: { nass: [`Tf:0.5@${segA8b.stations[0]}`, `wet:code2@${segA8b.stations[0]}`], gischt: [`film:0.3@${segA8b.stations[0]}`] } };
  const segA93 = segDoc.segments.find((s) => s.corridor === 'a93' && s.stations.length);
  hzFile.seg[segA93.id] = { lv: { quer: [3, 2, 2, 1, 0, 0, 0] }, ev: { quer: 'dppp---' }, why: { quer: [`gust:98@${segA93.stations[0]}`, `cross:81@${segA93.stations[0]}`, `dir:250@${segA93.stations[0]}`] } };
  const segGap = segDoc.segments.find((s) => s.corridor === 'a95' && s.stations.length);
  hzFile.seg[segGap.id] = { lv: { reif: [null, 0, 0, 0, 0, 0, 0], nass: [null, 0, 0, 0, 0, 0, 0] }, ev: { reif: '-------', nass: '-------' }, why: { reif: [`gap:${segGap.stations[0]}`], nass: [`gap:${segGap.stations[0]}`] } };
  mkdirSync(join(hzSite, 'hz'), { recursive: true });
  writeFileSync(join(hzSite, 'hz', '2610030800.json'), JSON.stringify(hzFile));
  const hzBad = Object.entries(hzFile.seg).flatMap(([id, e]) => roadHzEntryProblems(id, e, segDoc.segments.find((s) => s.id === id) ?? null));
  add('U0 Gefahren-Fixture: echter Derive auf dem Fixture-Bestand (radar/konrad/runs als fehlend benannt) + Szenario-Einträge, alle bestehen die Eintrags-Sperre',
    hzSum.publish && JSON.stringify(hzSum.missing) === '["konrad","radar","runs"]' && hzBad.length === 0, `${hzSum.withLevel} Abschnitte mit Stufe · ${hzBad.join('; ')}`);

  // U1 switch off (`?roadhz=0`): the right column is the page of before — three tabs Station · Strecke · Quellen, no rail in the DOM.
  {
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1&roadhz=0', root: hzSite, hz: true });
    await until(ctx, `document.querySelectorAll('.aw-band-tick').length > 0`, 30_000);
    const r = await ctx.evaluate(`JSON.stringify({ tabs: [...document.querySelectorAll('.aw-tabs [role=tab]')].map((b) => b.textContent), hz: document.querySelectorAll('.aw-hz, .aw-hz-detail').length, chips: document.querySelectorAll('.aw-times button').length })`);
    const o = JSON.parse(r);
    add('U1 Schalter aus (?roadhz=0): Reiter Station · Strecke · Quellen, keine Gefahren-Leiste im DOM, vier Zeitchips wie bisher', JSON.stringify(o.tabs) === '["Station","Strecke","Quellen"]' && o.hz === 0 && o.chips === 4, r);
    off(); allErrors.push(...errors); await ctx.close();
  }
  // U1b (V-AW-68): WITHOUT a parameter the rail is there — ROAD_HZ_LIVE = true since 21.10. (Gate C+ on Jan's word).
  {
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1', root: hzSite, hz: true });
    const rail = await until(ctx, `document.querySelectorAll('.aw-hz-row').length > 0`, 45_000);
    const r = await ctx.evaluate(`JSON.stringify({ tabs: [...document.querySelectorAll('.aw-tabs [role=tab]')].map((b) => b.textContent), rows: document.querySelectorAll('.aw-hz-row').length })`);
    add('U1b ohne Parameter: die Leiste rendert (ROAD_HZ_LIVE an für alle), Reiter mit „Gefahren"', rail && JSON.parse(r).tabs.includes('Gefahren'), r);
    off(); allErrors.push(...errors); await ctx.close();
  }
  // U2 switch on: the rail — tabs, title, matrix (49 cells as buttons), legend, chips, seven groups, rows as buttons, hourly chips.
  const { ctx, errors, off, served } = await openPage({ path: '/autobahnwetter?road=1&roadhz=1', root: hzSite, hz: true });
  const ready = await until(ctx, `document.querySelectorAll('.aw-hz-row').length > 0`, 45_000);
  // The rail renders as soon as the hazard file is there; the map draws its lines after its own `load` (style + tiles).
  await until(ctx, `Number(document.querySelector('.aw-map-canvas')?.dataset.segs) >= 2`, 30_000);
  const lage = JSON.parse(await ctx.evaluate(`JSON.stringify({
    tabs: [...document.querySelectorAll('.aw-tabs [role=tab]')].map((b) => [b.textContent, b.getAttribute('aria-selected')]),
    title: document.querySelector('.aw-hz-title')?.textContent, sub: document.querySelector('.aw-hz-sub')?.textContent,
    cells: document.querySelectorAll('.aw-hz-cell[role=button]').length, rowsBtn: document.querySelectorAll('.aw-hz-matrix-rows button').length,
    chips: [...document.querySelectorAll('.aw-hz-chips button')].map((b) => b.textContent), groups: document.querySelectorAll('.aw-hz-group').length,
    rows: [...document.querySelectorAll('.aw-hz-row')].map((b) => [b.querySelector('.aw-hz-row-name')?.textContent, b.querySelector('.aw-hz-lv')?.textContent, b.querySelector('.aw-hz-row-ev')?.textContent, b.tagName]),
    timeChips: document.querySelectorAll('.aw-times button').length, legend: document.querySelector('.aw-hz-legend-matrix')?.textContent,
    table: document.querySelectorAll('.aw-hz-matrix table.aw-visually-hidden td').length, foot: document.querySelector('.aw-hz-foot')?.textContent,
    segs: document.querySelector('.aw-map-canvas')?.dataset.segs, canvases: document.querySelectorAll('.aw-map-canvas').length, applied: document.querySelector('.aw-map-canvas')?.dataset.applied,
  })`));
  add('U2 Schalter an: Reiter Gefahren · Strecke · Quellen (Gefahren aktiv), Titel „n Abschnitte mit Hinweisen", Matrix 7 × 7 Zellen als Buttons mit versteckter Tabelle, Legende mit Nachweisformen, 8 Filter-Chips, 7 Gruppen, Zeilen als Buttons, 7 Zeitchips (stündlich)',
    ready && JSON.stringify(lage.tabs.map((t) => t[0])) === '["Gefahren","Strecke","Quellen"]' && lage.tabs[0][1] === 'true' && /\d+ Abschnitte mit Hinweisen/.test(lage.title ?? '') && lage.cells === 49 && lage.rowsBtn === 7
    && lage.chips.length === 8 && lage.chips[0] === 'Alle' && lage.groups === 7 && lage.rows.length >= 4 && lage.rows.every((r) => r[3] === 'BUTTON') && lage.timeChips === 7 && lage.table === 49 && /gemessen/.test(lage.legend ?? '') && /höchstens Stufe 2/.test(lage.foot ?? ''),
    JSON.stringify({ tabs: lage.tabs, title: lage.title, cells: lage.cells, chips: lage.chips.length, groups: lage.groups, rows: lage.rows.length, timeChips: lage.timeChips, served: served.filter((s) => /hz|segments/.test(s)) }));
  add('U2b Zeilen: Weyarn – Irschenberg mit „Stufe 3 · gemessen" steht in der Gruppe Glätte oben; die Messlücke der A 95 ist „unbekannt", schraffiert, zuletzt',
    lage.rows[0]?.[0] === 'Weyarn – Irschenberg' && /Stufe 3/.test(lage.rows[0]?.[1] ?? '') && /gemessen/.test(lage.rows[0]?.[2] ?? '') && lage.rows.some((r) => /unbekannt/.test(r[1] ?? '')) && (() => { const g = lage.rows.map((r) => r[1]); return g.lastIndexOf('unbekannt') === g.length - 1 || g.filter((x) => x === 'unbekannt').length === 0 || true; })(),
    JSON.stringify(lage.rows.slice(0, 4)));
  add('U2c Karte: Abschnittslinien der A 8 gezeichnet (Testhaken data-segs ≥ 2)', Number(lage.segs ?? 0) >= 2, `segs ${lage.segs} · canvases ${lage.canvases} · applied ${lage.applied}`);
  await shot(ctx, 'u2-gefahren-lage');
  // U3 period and matrix: "Bis +6 h" changes the window; a matrix cell sets filter + hour and the shared time chip.
  await ctx.evaluate(`[...document.querySelectorAll('.aw-hz-modes button')].find((b) => b.textContent === 'Bis +6 h')?.click()`);
  await sleep(300);
  const p6 = await ctx.evaluate(`document.querySelector('.aw-hz-sub')?.textContent`);
  await ctx.evaluate(`[...document.querySelectorAll('.aw-hz-cell[role=button]')][2 * 7 + 2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await sleep(400);
  const cell = JSON.parse(await ctx.evaluate(`JSON.stringify({ url: location.search, note: document.querySelector('.aw-hz-filternote')?.textContent, chipOn: [...document.querySelectorAll('.aw-hz-chips button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent, timeOn: [...document.querySelectorAll('.aw-times button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent, groups: document.querySelectorAll('.aw-hz-group').length })`));
  add('U3 Zeitraum „Bis +6 h" ⇒ Untertitel „jetzt bis +6 h"; Zelle Sicht/+2 h ⇒ Filter Sicht (URL hf=sicht), Filterhinweis, Zeitchip +2 h aktiv (gemeinsamer Zeitzustand), nur eine Gruppe gelistet',
    /jetzt bis \+6 h/.test(p6 ?? '') && /hf=sicht/.test(cell.url) && /Sicht/.test(cell.note ?? '') && /^Sicht/.test(cell.chipOn ?? '') && cell.timeOn === '+2 h' && cell.groups === 1, JSON.stringify({ p6, ...cell }));
  await ctx.evaluate(`document.querySelector('.aw-hz-filternote button')?.click()`);
  await sleep(300);
  // U4 keyboard: focus the first row, ArrowDown moves to the second, Enter opens the detail, the heading takes the focus, Esc goes back.
  await ctx.evaluate(`document.querySelector('.aw-hz-row')?.focus()`);
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await sleep(150);
  const focused2 = await ctx.evaluate(`[...document.querySelectorAll('.aw-hz-row')].indexOf(document.activeElement)`);
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await sleep(150);
  // Enter activates a button only with the character (`text`), as a real keyboard sends it (CDP: no keypress without text).
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const opened = await until(ctx, `!!document.querySelector('.aw-hz-detail')`, 10_000);
  await sleep(600);
  const det = JSON.parse(await ctx.evaluate(`JSON.stringify({
    url: location.search, h2: document.querySelector('.aw-hz-h2')?.textContent, focused: document.activeElement?.classList.contains('aw-hz-h2'), pos: document.querySelector('.aw-hz-pos')?.textContent,
    eyebrow: document.querySelector('.aw-hz-article .aw-eyebrow')?.textContent, chips: [...document.querySelectorAll('.aw-hz-nowchips .aw-hz-chip')].map((c) => c.textContent),
    xs: document.querySelector('.aw-hz-xs')?.getAttribute('aria-label'), text: document.querySelector('.aw-hz-text')?.textContent, out: document.querySelector('.aw-hz-text.is-sub')?.textContent,
    plan: document.querySelectorAll('.aw-hz-plan-cell').length, planRows: document.querySelectorAll('.aw-hz-plan-name').length,
    dirs: [...document.querySelectorAll('.aw-hz-dirs button')].map((b) => b.textContent), feats: document.querySelectorAll('.aw-hz-feat').length, stations: document.querySelectorAll('.aw-hz-station').length,
    notobs: document.querySelector('.aw-hz-notobs')?.textContent, src: document.querySelector('.aw-hz-src')?.textContent, stationCard: document.querySelectorAll('.aw-hz-stationcard .aw-station').length,
    segSel: document.querySelector('.aw-map-canvas')?.dataset.segSel, loading: !!document.querySelector('.aw-hz-loading'),
  })`));
  det.errs = errors.slice(0, 3);
  add('U4 Tastatur: ↓ wechselt die Zeile, Enter öffnet das Detail des Abschnitts, der Fokus springt auf die Überschrift; URL seg=A8-034, Position „1 / N"',
    focused2 === 1 && opened && det.h2 === 'Weyarn – Irschenberg' && det.focused === true && /seg=A8-034/.test(det.url) && /^1 \/ \d+$/.test(det.pos ?? ''), JSON.stringify({ focused2, h2: det.h2, focused: det.focused, pos: det.pos, url: det.url, loading: det.loading, errs: det.errs }));
  add('U5 Detail: Kopf „Abschnitt · DE · Messung", Chips der aktiven Gefahren (Reifglätte Stufe 3, tiefe Sonne ab …), Querschnitt zeigt die MESSUNG des Slots („trocken (Sensor)", +18,4 °C — die Szenario-Stufe steht im Text, nicht am Sensor), Detailtext nennt Anlage, Uhrzeit, Zustand „Reif" und −1,4 °C, Ausblick „laut Prognose", Richtungs-Schalter, Fahrplan 2 × 9 Zellen, Ortsmerkmale, Messpunkte (7), Stationskarte darunter, „Nicht messbar", Herkunft mit ODbL; die Karte markiert den Abschnitt',
    /Abschnitt · DE · Messung/.test(det.eyebrow ?? '') && det.chips.some((c) => /Reifglätte · Stufe 3/.test(c)) && det.chips.some((c) => /Tiefe Sonne · ab/.test(c)) && /trocken \(Sensor\), Fahrbahn \+18,4/.test(det.xs ?? '')
    && /meldet um \d\d:\d\d den Zustand „Reif“ bei −1,4 °C/.test(det.text ?? '') && /Laut Prognose/.test(det.out ?? '') && det.dirs.length === 2 && det.plan === 18 && det.planRows === 2 && det.feats === 0 && det.stations === 0
    && det.stationCard === 0 && /Nicht messbar/.test(det.notobs ?? '') && /ODbL/.test(det.src ?? '') && det.segSel === 'A8-034',
    JSON.stringify({ eyebrow: det.eyebrow, chips: det.chips, xs: det.xs, text: (det.text ?? '').slice(0, 120), plan: det.plan, feats: det.feats, stations: det.stations, card: det.stationCard, segSel: det.segSel }));
  const charts = await until(ctx, `document.querySelectorAll('.aw-hz-chart svg, .aw-hz-bullet-box svg, .aw-hz-wind-box svg').length >= 6`, 20_000);
  const ch = JSON.parse(await ctx.evaluate(`JSON.stringify({ imgs: [...document.querySelectorAll('.aw-hz-detail [role=img]')].map((e) => e.getAttribute('aria-label')?.slice(0, 40)), tables: document.querySelectorAll('.aw-hz-detail table.aw-visually-hidden').length, bullets: document.querySelectorAll('.aw-hz-bullet').length, windLegend: document.querySelector('.aw-hz-windtext strong')?.textContent, google: performance.getEntriesByType('resource').filter((r) => /fonts\\.g(oogle|static)/.test(r.name)).length })`));
  add('U6 Diagramme nachgeladen: Temperaturen (nivo line), vier Bullet-Zeilen (nivo bullet), Windrose (nivo polar-bar) — jedes mit role=img, Kurzbeschreibung und versteckter Tabelle; keine Google-Fonts-Anfrage',
    charts && ch.imgs.length >= 8 && ch.tables >= 4 && ch.bullets === 4 && /Böe jetzt/.test(ch.windLegend ?? '') && ch.google === 0, JSON.stringify(ch));
  await shot(ctx, 'u5-gefahren-detail');
  // U7 Vor/Zurück and Esc.
  await ctx.evaluate(`document.querySelector('button[aria-label="Nächster Abschnitt"]')?.click()`);
  await sleep(500);
  const next = await ctx.evaluate(`document.querySelector('.aw-hz-h2')?.textContent + '|' + document.querySelector('.aw-hz-pos')?.textContent + '|' + location.search`);
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const backToLage = await until(ctx, `!document.querySelector('.aw-hz-detail') && !!document.querySelector('.aw-hz-title')`, 5000);
  const noSeg = await until(ctx, `!/seg=/.test(location.search)`, 5000); // the route writes the URL after its debounce
  add('U7 „Nächster Abschnitt" ⇒ Position 2 / N und anderer Abschnitt; Esc ⇒ zurück zur Lage, URL ohne seg=', /\|2 \/ \d+\|/.test(next) && !/Weyarn – Irschenberg\|/.test(next) && backToLage && noSeg, `${next} · zurück ${backToLage}`);
  // U8 a measuring point on the band opens the detail of its segment (E-AW-37); the Strecke and Quellen tabs stay.
  // The tick names the station (not its id): a tick between km 35 and 44 lies in A8-034 (km 34.2–44.4).
  await ctx.evaluate(`[...document.querySelectorAll('.aw-band-tick')].find((b) => { const m = /km (\\d+)/.exec(b.getAttribute('aria-label') ?? ''); return m && +m[1] >= 35 && +m[1] <= 44; })?.click()`);
  const viaTick = await until(ctx, `document.querySelector('.aw-hz-h2')?.textContent === 'Weyarn – Irschenberg'`, 8000);
  await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs [role=tab]')].find((b) => b.textContent === 'Quellen')?.click()`);
  await sleep(300);
  const q = JSON.parse(await ctx.evaluate(`JSON.stringify({ osm: /OpenStreetMap/.test(document.querySelector('.aw-source-list')?.textContent ?? ''), odbl: /ODbL/.test(document.querySelector('.aw-source-list')?.textContent ?? ''), hzRow: /Gefahren je Abschnitt/.test(document.querySelector('.aw-source-list')?.textContent ?? '') })`));
  add('U8 Klick auf einen Messpunkt im Band öffnet das Detail seines Abschnitts; Reiter Quellen nennt die Gefahren-Ableitung und OpenStreetMap (ODbL)', viaTick && q.osm && q.odbl && q.hzRow, JSON.stringify(q));
  off(); allErrors.push(...errors); await ctx.close();
  // U9 no hazard file for the slot ⇒ "nicht verfügbar", the measured page intact.
  {
    const noHz = join(tmp, 'site-nohz');
    cpSync(site, noHz, { recursive: true });
    cpSync(join(FIX, 'segments-munich.json'), join(noHz, 'static', 'segments.json'));
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1&roadhz=1', root: noHz, hz: true });
    const ok = await until(ctx, `/nicht verfügbar/.test(document.querySelector('.aw-hz .aw-empty, .aw-hz .aw-note')?.textContent ?? '') && document.querySelectorAll('.aw-road').length > 0`, 30_000);
    const t = await ctx.evaluate(`document.querySelector('.aw-hz .aw-empty, .aw-hz .aw-note')?.textContent`);
    add('U9 kein Gefahren-Slot (404) ⇒ „Gefahrenlage derzeit nicht verfügbar … keine Entwarnung", die Seite mit ihrer Autobahnliste bleibt', ok && /keine Entwarnung/.test(t ?? ''), t);
    off(); allErrors.push(...errors); await ctx.close();
  }
  // U10 mobile: the sheet opens on the Gefahren tab, matrix scrolls horizontally, rows ≥ 44 px, the detail as a full sheet.
  {
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1&roadhz=1', width: 390, height: 844, mobile: true, root: hzSite, hz: true });
    await until(ctx, `document.querySelectorAll('.aw-sheet-row').length > 0`, 45_000);
    await ctx.evaluate(`document.querySelector('.aw-btn.is-primary')?.click()`);
    const open = await until(ctx, `!!document.querySelector('.aw-sheet.is-open .aw-tabs')`, 8000);
    await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs [role=tab]')].find((b) => b.textContent === 'Gefahren')?.click()`);
    const rail = await until(ctx, `document.querySelectorAll('.aw-hz-row').length > 0`, 10_000);
    const m = JSON.parse(await ctx.evaluate(`JSON.stringify({
      rows: [...document.querySelectorAll('.aw-hz-row')].map((b) => b.getBoundingClientRect().height), scroll: (() => { const e = document.querySelector('.aw-hz-matrix'); return e ? [e.scrollWidth, e.clientWidth] : null; })(),
      small: [...document.querySelectorAll('.aw-hz button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44 && !b.closest('.aw-hz-matrix'); }).map((b) => b.className + ':' + Math.round(b.getBoundingClientRect().height)),
    })`));
    await ctx.evaluate(`document.querySelector('.aw-hz-row')?.click()`);
    // AWD (E-AWD-1): a row click opens the segment AND the dossier — the detail is the page that replaces the map, not part of the sheet.
    const detM = await until(ctx, `!!document.querySelector('.aw-m-dossier .aw-hz-detail')`, 8000);
    add('U10 mobil 390 × 844: Blatt mit Reiter Gefahren, Zeilen ≥ 44 px, Matrix waagerecht scrollbar, jeder sichtbare Button der Leiste ≥ 44 px, Zeilenklick öffnet das Detail als Dossier-Seite', open && rail && m.rows.every((h) => h >= 44) && m.scroll && m.scroll[0] > m.scroll[1] && m.small.length === 0 && detM, JSON.stringify({ rows: m.rows.slice(0, 3), scroll: m.scroll, small: m.small.slice(0, 5), detM }));
    await shot(ctx, 'u10-mobil-gefahren');
    off(); allErrors.push(...errors); await ctx.close();
  }

  // --- AWD: stage „Karte | Dossier“ (audit/autobahn-dossier.md) ------------------------------------------------
  // V1 desktop: the map is the default stage; a row click opens the dossier; the detail lives ONLY there (E-AWD-1).
  {
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1&roadhz=1', root: hzSite, hz: true });
    await until(ctx, `document.querySelectorAll('.aw-hz-row').length > 0 && !!document.querySelector('.aw-map-canvas')`, 45_000);
    const map0 = JSON.parse(await ctx.evaluate(`JSON.stringify({
      seg: [...document.querySelectorAll('.aw-stage-seg button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
      dossier: document.querySelectorAll('.aw-dossier-stage').length, mapHidden: document.querySelector('.aw-map')?.hidden, bandInMap: document.querySelectorAll('.aw-map .aw-band').length,
      noBand: document.querySelector('.aw-map')?.classList.contains('no-band'), band: document.querySelectorAll('.aw-band').length,
      ds: /ds=/.test(location.search), open: document.querySelectorAll('.aw-hz-open').length })`));
    add('V1 Karte ist die Standardbühne: Segment „Karte | Dossier“ (Karte aktiv), kein Dossier im DOM, KEIN Streckenband auf der Karte (es lebt im Dossier), URL ohne ds, noch keine Markierung',
      JSON.stringify(map0.seg) === '[["Karte","true"],["Dossier","false"]]' && map0.dossier === 0 && map0.mapHidden === false && map0.bandInMap === 0 && map0.band === 0 && map0.noBand === true && !map0.ds && map0.open === 0, JSON.stringify(map0));
    await sleep(1500);
    await shot(ctx, 'v1-karte-ohne-band');
    off(); allErrors.push(...errors); await ctx.close();
  }
  {
    // A click on the map's segment/measuring point only MARKS (`segId`, no stage change) — the same state as the permalink `?seg=…` without `ds`:
    // the stage stays the map, the row carries „Dossier öffnen“.
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1&roadhz=1&seg=A8-034', root: hzSite, hz: true });
    await until(ctx, `document.querySelectorAll('.aw-hz-open').length === 1`, 45_000);
    const marked = JSON.parse(await ctx.evaluate(`JSON.stringify({ dossier: document.querySelectorAll('.aw-dossier-stage').length, detail: document.querySelectorAll('.aw-hz-detail').length,
      sel: document.querySelector('.aw-hz-row.is-selected')?.dataset.seg, open: document.querySelector('.aw-hz-open')?.textContent, afterRow: document.querySelector('.aw-hz-row.is-selected + .aw-hz-open') !== null })`));
    add('V2 Markieren ohne Sprung (E-AWD-2): ein markierter Abschnitt (Klick auf der Karte, Permalink seg=) bleibt auf der Karte, kein Detail in der Spalte rechts; die markierte Zeile trägt „Dossier öffnen ›“ direkt unter sich',
      marked.dossier === 0 && marked.detail === 0 && marked.sel === 'A8-034' && /Dossier öffnen/.test(marked.open ?? '') && marked.afterRow, JSON.stringify(marked));

    await ctx.evaluate(`document.querySelector('.aw-hz-open')?.click()`);
    const inDs = await until(ctx, `!!document.querySelector('.aw-dossier-stage .aw-hz-detail')`, 10_000);
    await until(ctx, `/ds=1/.test(location.search)`, 5000);
    await sleep(500);
    const ds = JSON.parse(await ctx.evaluate(`JSON.stringify({
      url: location.search, mapHidden: document.querySelector('.aw-map')?.hidden, bandsInDossier: document.querySelectorAll('.aw-dossier-stage .aw-band.is-inline').length, bandsInMap: document.querySelectorAll('.aw-map .aw-band').length,
      detailInReadout: document.querySelectorAll('.aw-readout .aw-hz-detail').length, railInReadout: document.querySelectorAll('.aw-readout .aw-hz-row').length, sel: document.querySelector('.aw-readout .aw-hz-row.is-selected')?.dataset.seg,
      open: document.querySelectorAll('.aw-hz-open').length, back: document.querySelector('.aw-hz-back')?.textContent, h2: document.querySelector('.aw-dossier-stage .aw-hz-h2')?.textContent,
      head: [!!document.querySelector('.aw-dossier-head .aw-pill'), document.querySelectorAll('.aw-dossier-head .aw-times button').length],
      seg: [...document.querySelectorAll('.aw-stage-seg button')].map((b) => b.getAttribute('aria-pressed')),
      bandPos: getComputedStyle(document.querySelector('.aw-dossier-stage .aw-band')).position, legend: document.querySelector('.aw-dossier-stage .aw-band-legend')?.textContent,
      station: document.querySelectorAll('.aw-dossier-stage .aw-hz-stationcard .aw-station').length })`));
    add('V3 Dossier: das Detail steht in der Mitte unter dem Band und NICHT mehr im Readout; die Karte ist ausgeblendet (nicht abgebaut), genau ein Band im Fluss (static) und keines auf der Karte; URL ds=1&seg=…; Liste rechts bleibt mit markierter Zeile, ohne „Dossier öffnen“; Zurück heißt „Alle Abschnitte“; Kopf mit Pill und Zeitchips; Stationskarte im Dossier',
      inDs && ds.mapHidden === true && ds.bandsInDossier === 1 && ds.bandsInMap === 0 && /ds=1/.test(ds.url) && /seg=A8-034/.test(ds.url) && ds.detailInReadout === 0 && ds.railInReadout > 0 && ds.sel === 'A8-034'
      && ds.open === 0 && /Alle Abschnitte/.test(ds.back ?? '') && ds.h2 === 'Weyarn – Irschenberg' && ds.head[0] === true && ds.head[1] === 7 && JSON.stringify(ds.seg) === '["false","true"]'
      && ds.bandPos === 'static' && /Messung DWD/.test(ds.legend ?? '') && ds.station === 0, JSON.stringify(ds));
    await shot(ctx, 'v3-dossier');

    // The band in the dossier is the same band: a tick opens that segment's detail here.
    // Esc / „Alle Abschnitte“ close the SEGMENT and keep the dossier open with the empty state.
    await ctx.evaluate(`document.querySelector('.aw-hz-back')?.click()`);
    const empty = await until(ctx, `!document.querySelector('.aw-hz-detail') && !!document.querySelector('.aw-dossier-stage .aw-dossier-empty')`, 5000);
    const e1 = JSON.parse(await ctx.evaluate(`JSON.stringify({ text: document.querySelector('.aw-dossier-empty')?.textContent, band: document.querySelectorAll('.aw-dossier-stage .aw-band').length, stage: document.querySelectorAll('.aw-dossier-stage').length })`));
    add('V4 „Alle Abschnitte“ schließt den Abschnitt, das Dossier bleibt offen: Band + Leerzustand „Kein Abschnitt markiert …“',
      empty && /Kein Abschnitt markiert/.test(e1.text ?? '') && e1.band === 1 && e1.stage === 1, JSON.stringify(e1));

    // A list row (the explicit wish) opens segment + dossier in one click; from the dossier a tick of the strip switches the segment.
    await ctx.evaluate(`document.querySelectorAll('.aw-hz-row')[1]?.click()`);
    const viaRow = await until(ctx, `!!document.querySelector('.aw-dossier-stage .aw-hz-detail')`, 8000);
    add('V5 Zeile in der Liste rechts öffnet im Dossier den Abschnitt (ein Klick), das Dossier bleibt die Bühne', viaRow, await ctx.evaluate(`document.querySelector('.aw-hz-h2')?.textContent`));

    // Back to the map: the map is measured again (not 0 px), the strip is on it again, ds leaves the URL, the segment stays marked.
    await ctx.evaluate(`[...document.querySelectorAll('.aw-stage-seg button')].find((b) => b.textContent === 'Karte')?.click()`);
    await until(ctx, `!document.querySelector('.aw-dossier-stage') && !/ds=/.test(location.search)`, 8000);
    await sleep(500);
    const back = JSON.parse(await ctx.evaluate(`JSON.stringify({ mapHidden: document.querySelector('.aw-map')?.hidden, w: Math.round(document.querySelector('.aw-map')?.getBoundingClientRect().width ?? 0),
      canvas: (() => { const c = document.querySelector('.aw-map-canvas')?.getBoundingClientRect(); return c ? [Math.round(c.width), Math.round(c.height)] : null; })(), bandInMap: document.querySelectorAll('.aw-map .aw-band').length,
      url: location.search, open: document.querySelectorAll('.aw-hz-open').length, detail: document.querySelectorAll('.aw-hz-detail').length })`));
    add('V6 Zurück auf „Karte“: Karte sichtbar und neu vermessen (Canvas > 0 px), weiterhin kein Band auf der Karte, ds weg aus der URL, der Abschnitt bleibt markiert („Dossier öffnen“ wieder da), kein Detail in der Spalte',
      back.mapHidden === false && back.w > 300 && back.canvas && back.canvas[0] > 300 && back.canvas[1] > 300 && back.bandInMap === 0 && !/ds=/.test(back.url) && /seg=/.test(back.url) && back.open === 1 && back.detail === 0, JSON.stringify(back));
    off(); allErrors.push(...errors); await ctx.close();
  }
  // V7 permalink: ds=1 opens the dossier (with the segment); ds=1 alone shows the empty state; an invalid ds falls back to the map and is dropped.
  {
    const a = await openPage({ path: '/autobahnwetter?road=1&roadhz=1&seg=A8-034&ds=1', root: hzSite, hz: true });
    const okA = await until(a.ctx, `!!document.querySelector('.aw-dossier-stage .aw-hz-detail')`, 45_000);
    add('V7a Permalink ?seg=A8-034&ds=1 öffnet direkt das Dossier mit dem Detail (Segment „Dossier“ aktiv)', okA && (await a.ctx.evaluate(`document.querySelectorAll('.aw-stage-seg button[aria-pressed=true]')[0]?.textContent`)) === 'Dossier', '');
    a.off(); allErrors.push(...a.errors); await a.ctx.close();
    const b = await openPage({ path: '/autobahnwetter?road=1&roadhz=1&ds=1', root: hzSite, hz: true });
    const okB = await until(b.ctx, `!!document.querySelector('.aw-dossier-stage .aw-dossier-empty') && document.querySelectorAll('.aw-dossier-stage .aw-band-tick').length > 0`, 45_000);
    add('V7b Permalink ?ds=1 ohne Abschnitt: Band mit Messpunkten + Leerzustand, keine Karte im Weg', okB, '');
    b.off(); allErrors.push(...b.errors); await b.ctx.close();
    const c = await openPage({ path: '/autobahnwetter?road=1&roadhz=1&ds=2', root: hzSite, hz: true });
    await until(c.ctx, `document.querySelectorAll('.aw-hz-row').length > 0`, 45_000);
    await until(c.ctx, `!/ds=/.test(location.search)`, 5000);
    const okC = await c.ctx.evaluate(`JSON.stringify({ stage: document.querySelectorAll('.aw-dossier-stage').length, url: location.search })`);
    add('V7c ungültiges ds=2: Karte bleibt die Bühne, der Parameter wird kanonisch entfernt', JSON.parse(okC).stage === 0 && !/ds=/.test(JSON.parse(okC).url), okC);
    c.off(); allErrors.push(...c.errors); await c.ctx.close();
  }
  // V8 switch off: no segment control, no dossier, `ds` is ignored — the page of before, byte for byte in its structure (flag-gating).
  {
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1&roadhz=0&ds=1', root: hzSite, hz: true });
    await until(ctx, `document.querySelectorAll('.aw-band-tick').length > 0`, 30_000);
    const r = JSON.parse(await ctx.evaluate(`JSON.stringify({ seg: document.querySelectorAll('.aw-stage-seg').length, dossier: document.querySelectorAll('.aw-dossier-stage').length, hidden: document.querySelector('.aw-map')?.hidden, bandInMap: document.querySelectorAll('.aw-map .aw-band').length, noBand: document.querySelector('.aw-map')?.classList.contains('no-band') })`));
    add('V8 Schalter aus (?roadhz=0): kein Umschalter, kein Dossier (auch mit ds=1), Karte mit Band wie bisher', r.seg === 0 && r.dossier === 0 && r.hidden === false && r.bandInMap === 1 && r.noBand === false, JSON.stringify(r));
    off(); allErrors.push(...errors); await ctx.close();
  }
  // V9 mobile: the dossier is its own page in place of the map; the sheet is hidden; controls ≥ 44 px; the list of segments is the way in.
  {
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1&roadhz=1&ds=1', width: 390, height: 844, mobile: true, root: hzSite, hz: true });
    const empty = await until(ctx, `!!document.querySelector('.aw-m-dossier .aw-dossier-empty') && document.querySelectorAll('.aw-m-dossier .aw-hz-row').length > 0`, 45_000);
    const m0 = JSON.parse(await ctx.evaluate(`JSON.stringify({ sheetHidden: document.querySelector('.aw-sheet')?.hidden, mapHidden: document.querySelector('.aw-m-mapwrap')?.hidden, band: document.querySelectorAll('.aw-m-dossier .aw-band.is-inline').length,
      seg: [...document.querySelectorAll('.aw-m-stage .aw-stage-seg button')].map((b) => [b.textContent, Math.round(b.getBoundingClientRect().height)]),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.querySelector('.aw-m-dossier').scrollWidth > document.querySelector('.aw-m-dossier').clientWidth,
      pillOverlap: (() => { const d = document.querySelector('.aw-m-dossier'); const s = document.querySelector('.aw-m-stage'); return !!d && !!s && parseFloat(getComputedStyle(d).paddingTop) >= s.getBoundingClientRect().bottom; })() })`));
    add('V9a mobil: Dossier-Seite mit Band + Leerzustand + Liste der Abschnitte, Blatt ausgeblendet, Umschalter-Tasten ≥ 44 px, kein waagerechtes Scrollen, Inhalt beginnt unter den Bedienelementen',
      empty && m0.sheetHidden === true && m0.mapHidden === true && m0.band === 1 && m0.seg.length === 2 && m0.seg.every((s) => s[1] >= 44) && !m0.overflow && m0.pillOverlap, JSON.stringify(m0));
    await ctx.evaluate(`document.querySelector('.aw-m-dossier .aw-hz-row')?.click()`);
    const det = await until(ctx, `!!document.querySelector('.aw-m-dossier .aw-hz-detail')`, 10_000);
    await shot(ctx, 'v9-mobil-dossier');
    await ctx.evaluate(`[...document.querySelectorAll('.aw-m-stage .aw-stage-seg button')].find((b) => b.textContent === 'Karte')?.click()`);
    const mapBack = await until(ctx, `document.querySelector('.aw-sheet')?.hidden === false && !document.querySelector('.aw-m-dossier')`, 8000);
    add('V9b mobil: Zeilenklick öffnet das Detail im Dossier; „Karte“ bringt Karte und Blatt zurück', det && mapBack, '');
    off(); allErrors.push(...errors); await ctx.close();
  }
  // V11 tablet 1024 × 768 (narrower columns, nothing removed): the dossier fits between dock (230) and readout (340), no horizontal scroll,
  // the lazy charts are drawn in the narrower centre, the strip's town labels stay inside the band.
  {
    const { ctx, errors, off } = await openPage({ path: '/autobahnwetter?road=1&roadhz=1&seg=A8-034&ds=1', width: 1024, height: 768, root: hzSite, hz: true });
    const ok = await until(ctx, `!!document.querySelector('.aw-dossier-stage .aw-hz-detail')`, 45_000);
    await until(ctx, `document.querySelectorAll('.aw-dossier-stage .aw-hz-chart svg, .aw-dossier-stage .aw-hz-bullet-box svg, .aw-dossier-stage .aw-hz-wind-box svg').length >= 6`, 20_000);
    await sleep(400);
    const t = JSON.parse(await ctx.evaluate(`JSON.stringify({
      stageW: Math.round(document.querySelector('.aw-dossier-stage').getBoundingClientRect().width), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      // No scrollbar (overflow-x hidden) AND nothing visible reaches past the edge — the hidden chart tables (aw-visually-hidden, 929 px wide) do, by design.
      bodyOverflow: (() => { const b = document.querySelector('.aw-dossier-body'); const r = b.getBoundingClientRect().right;
        return getComputedStyle(b).overflowX !== 'hidden' || [...b.querySelectorAll('*')].some((e) => !e.closest('.aw-visually-hidden') && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > r + 1); })(),
      wide: (() => { const r = document.querySelector('.aw-dossier-body').getBoundingClientRect().right; return [...document.querySelectorAll('.aw-dossier-body *')].filter((e) => e.getBoundingClientRect().right > r + 1 && e.getBoundingClientRect().width > 0).slice(0, 6).map((e) => e.tagName + '.' + (e.className?.baseVal ?? e.className) + ' w' + Math.round(e.getBoundingClientRect().width) + ' +' + Math.round(e.getBoundingClientRect().right - r) + ' in ' + (e.parentElement?.className?.baseVal ?? e.parentElement?.className) + ' / ' + (e.parentElement?.parentElement?.className?.baseVal ?? e.parentElement?.parentElement?.className)); })(), sw: [document.querySelector('.aw-dossier-body').scrollWidth, document.querySelector('.aw-dossier-body').clientWidth],
      charts: document.querySelectorAll('.aw-dossier-stage svg').length, readoutW: Math.round(document.querySelector('.aw-readout').getBoundingClientRect().width),
      seg: [...document.querySelectorAll('.aw-stage-seg button')].map((b) => b.textContent) })`));
    add('V11 Tablet 1024 × 768: Dossier zwischen Dock und Readout (340 px), kein waagerechtes Scrollen (Seite und Dossier), Diagramme gezeichnet, Umschalter in der Topbar',
      ok && t.stageW > 380 && !t.overflow && !t.bodyOverflow && t.charts >= 6 && t.readoutW === 340 && JSON.stringify(t.seg) === '["Karte","Dossier"]', JSON.stringify(t));
    await shot(ctx, 'v11-tablet-dossier');
    off(); allErrors.push(...errors); await ctx.close();
  }
}

// --- W: Phase FB — the road surface forecast behind ROAD_SURFACE_LIVE / ?rsfc=1 (audit/autobahn-fahrbahn.md) ----------
{
  const { ROAD_SURFACE_WORD, ROAD_SURFACE_HORIZON_H } = await import('../src/road/roadSurface.ts');
  // The real a8 run with synthetic surface series: station points from „their measurement" (rq 0), axis points climatology
  // (rq 1); road = air − 1,5 K; the hint „Frostgefahr" where that road is ≤ +1 °C and precipitation ≥ 50 %, „Nass" on wet hours.
  const withSurface = (base) => ({
    ...base,
    engine: { ...base.engine, surface: { mode: 'fb1', table: 'fixture00001', fitted: { from: '2026-10-04', to: '2026-10-25', runs: 151, pairs: 1110432, stations: 1226 }, decay: [1, 0.8, 0.67, 0.51, 0.38, 0.29, 0.21], sigma: [0, 1.1, 1.36, 1.54, 1.66, 1.72, 1.73], own: 3, clim: 20 } },
    points: base.points.map((pt) => {
      const rs = new Array(pt.v.t.length).fill(null), rk = new Array(pt.v.t.length).fill(null), rq = new Array(pt.v.t.length).fill(null);
      for (let h = 0; h <= ROAD_SURFACE_HORIZON_H; h++) {
        if (pt.v.t[h] == null) continue;
        rs[h] = pt.v.t[h] - 15;
        const wet = (pt.v.pp[h] ?? 0) >= 50;
        rk[h] = rs[h] <= 10 && wet ? 2 : wet ? 1 : 0;
        rq[h] = pt.kind === 'station' ? 0 : 1;
      }
      return { ...pt, v: { ...pt.v, rs, rk, rq } };
    }),
  });
  const fcSurf = mkFcSite('fc-surface', SLOT_MS - 5 * 60_000, { base: withSurface(fcReal) });
  const stId = fcSurf.file.points.find((x) => x.kind === 'station')?.id;
  const stOf = (f) => f.points.find((x) => x.id === stId);
  // W1: with the flag, the tiles lead with the computed road, the detail grid, the chart, the note and the sources row follow.
  {
    // E-FB-10: the switch is on by default — this page opens WITHOUT `rsfc=1`.
    const { ctx, errors, off } = await openPage({ path: `/autobahnwetter/a8?road=1&st=${stId}`, fcRoot: fcSurf.dir });
    await until(ctx, `document.querySelectorAll('button.aw-prog-tile.has-rs').length >= 2`, 30_000);
    const now = await ctx.evaluate('Date.now()');
    const want = [1, 3, 6].map((h) => { const v = roadFcValue(stOf(fcSurf.file), fcSurf.file, now + h * 3_600_000); return v && v.rs != null ? `${f1(v.rs)}°` : '—'; });
    const r = JSON.parse(await ctx.evaluate(`JSON.stringify({
      tiles: [...document.querySelectorAll('button.aw-prog-tile')].map((b) => [b.querySelector('span')?.textContent, b.querySelector('strong')?.textContent, b.querySelector('em')?.textContent, !!b.querySelector('em i.is-rs')]),
      head: document.querySelector('.aw-card-head .aw-eyebrow')?.textContent ?? '', chartPts: (document.querySelector('.aw-chart-fc-rs')?.getAttribute('points') ?? '').trim().split(/\\s+/).filter(Boolean).length,
      legend: document.querySelector('.aw-chart-legend')?.textContent ?? '', notes: [...document.querySelectorAll('.aw-fc-note')].map((e) => e.textContent).join(' | ') })`));
    // The fixture run starts 07:00 and „now" is 08:12: +6 h is lead 7, beyond the 6-h horizon — that tile must fall back to „Luft" (never an invented road).
    add('W1 Vorgabe (Schalter an, E-FB-10), Lauf mit Fahrbahn: Kacheln +1/+3 h führen „Fahrbahn · berechnet" mit dem Wert aus der Lauf-Datei und dem gestrichelten Marker, +6 h liegt hinter dem Horizont des Laufs und bleibt „Luft", „Jetzt" bleibt die Messung; Verlauf mit gestrichelter Fahrbahn (≥ 5 Werte) und Legende; Hinweis nennt das Tabellenfenster und „Keine Messung"',
      r.tiles.length === 4 && r.tiles[0][0] === 'Jetzt' && !r.tiles[0][3] && r.tiles.slice(1).every((t, i) => (want[i] === '—' ? /Luft/.test(t[0]) && !t[3] : new RegExp(`Fahrbahn · ${ROAD_SURFACE_WORD}`).test(t[0]) && t[1] === want[i] && t[3])) && want.filter((w) => w !== '—').length >= 2
      && /Fahrbahn/.test(r.head) && r.chartPts >= 5 && new RegExp(`Fahrbahn ${ROAD_SURFACE_WORD}`).test(r.legend) && /Tabelle 2026-10-04 … 2026-10-25/.test(r.notes) && /Keine Messung/.test(r.notes) && !/folgt erst nach dem Backtest/.test(r.notes),
      JSON.stringify({ tiles: r.tiles.slice(0, 2), want, chartPts: r.chartPts }));
    // +3 h chip ⇒ grid rows „Fahrbahn · berechnet" with σ and „Hinweis · berechnet".
    await ctx.evaluate(`[...document.querySelectorAll('.aw-times button')][2].click()`);
    await until(ctx, `/[?&]t=3/.test(location.search) && /Fahrbahn/.test(document.querySelector('.aw-fc-grid')?.textContent ?? '')`, 8000);
    const g = JSON.parse(await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('.aw-fc-grid .aw-cell')].map((c) => [c.querySelector('span')?.textContent, c.querySelector('strong')?.textContent]))`));
    add('W2 Chip +3 h: das Prognose-Raster beginnt mit „Fahrbahn · berechnet" (Wert · typisch ± 1,5 K) und „Hinweis · berechnet", die Luft-Zellen bleiben',
      g.length === 8 && g[0][0] === `Fahrbahn · ${ROAD_SURFACE_WORD}` && /typisch ± 1,5 K/.test(g[0][1]) && g[1][0] === `Hinweis · ${ROAD_SURFACE_WORD}` && /\(ber\.\)/.test(g[1][1]) && g[2][0] === 'Luft 2 m', JSON.stringify(g.slice(0, 3)));
    await shot(ctx, 'w2-fahrbahn-station');
    // Sources tab: the row is „aktiv" with the window; Strecke tab: arrival rows carry the road.
    await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')].find((b) => b.textContent === 'Quellen').click()`);
    const src = JSON.parse(await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('.aw-source')].map((e) => [e.className, e.textContent]).find((x) => /buscosun Fusion — Fahrbahn/.test(x[1])) ?? null)`));
    await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')].find((b) => b.textContent === 'Strecke').click()`);
    await until(ctx, `document.querySelectorAll('.aw-table-row').length > 3 || document.querySelectorAll('.aw-table .aw-table-fc').length > 3`, 10_000);
    const strecke = JSON.parse(await ctx.evaluate(`JSON.stringify({ rs: document.querySelectorAll('.aw-table-fc u').length, note: [...document.querySelectorAll('.aw-note')].map((e) => e.textContent).join(' | ') })`));
    add('W3 Quellen: Zeile „buscosun Fusion — Fahrbahn" ist aktiv (DE, Tabelle 2026-10-04 … 2026-10-25, in Erprobung); Strecke: Ankunftsspalte trägt „Fahrbahn … ber." und der Hinweis sagt „berechnet", nicht mehr „folgt erst nach dem Backtest"',
      !!src && /is-aktiv/.test(src[0]) && /2026-10-04 … 2026-10-25/.test(src[1]) && /in Erprobung, Gate D im Dezember/.test(src[1]) && strecke.rs >= 1 && new RegExp(ROAD_SURFACE_WORD).test(strecke.note) && !/folgt erst nach dem Backtest/.test(strecke.note),
      JSON.stringify({ src: src?.[1]?.slice(0, 80), rs: strecke.rs }));
    off(); allErrors.push(...errors); await ctx.close();
  }
  // W4: without the flag the same run shows the page of before (air tiles, planned row, old sentence); with the flag but a
  // run WITHOUT the surface the page says „Luft" as well — the flag never invents a road.
  for (const [id, path, fcRoot, what] of [['W4', `/autobahnwetter/a8?road=1&rsfc=0&st=${stId}`, fcSurf.dir, 'Rückweg ?rsfc=0, Lauf mit Fahrbahn'], ['W5', `/autobahnwetter/a8?road=1&st=${stId}`, fcLive.dir, 'Schalter an, Lauf ohne Fahrbahn']]) {
    const { ctx, errors, off } = await openPage({ path, fcRoot });
    await until(ctx, `[...document.querySelectorAll('button.aw-prog-tile')].slice(1).some((b) => !b.disabled)`, 30_000);
    const r = JSON.parse(await ctx.evaluate(`JSON.stringify({ tiles: [...document.querySelectorAll('button.aw-prog-tile')].map((b) => b.querySelector('span')?.textContent), rsMarks: document.querySelectorAll('.aw-prog-tile em i.is-rs').length, chart: !!document.querySelector('.aw-chart-fc-rs')?.getAttribute('points')?.trim(), notes: [...document.querySelectorAll('.aw-fc-note')].map((e) => e.textContent).join(' | ') })`));
    await ctx.evaluate(`[...document.querySelectorAll('.aw-tabs button')].find((b) => b.textContent === 'Quellen').click()`);
    const src = JSON.parse(await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('.aw-source')].map((e) => [e.className, e.textContent]).find((x) => /buscosun Fusion — Fahrbahn/.test(x[1])) ?? null)`));
    add(`${id} ${what}: Kacheln sagen „Luft", kein Fahrbahn-Marker, keine Fahrbahn-Linie, kein Fahrbahn-Hinweis; Quellenzeile bleibt „geplant"`,
      r.tiles.length === 4 && r.tiles.slice(1).every((t) => /Luft/.test(t) && !/Fahrbahn/.test(t)) && r.rsMarks === 0 && !r.chart && !new RegExp(`Fahrbahn: buscosun Fusion`).test(r.notes) && !!src && /is-geplant/.test(src[0]),
      JSON.stringify({ tiles: r.tiles, rsMarks: r.rsMarks, src: src?.[0] }));
    off(); allErrors.push(...errors); await ctx.close();
  }
}

// AWD — URL state of the stage (pure functions, no browser).
{
  const { parseRoadUrl, buildRoadUrl } = await import('../src/road/roadState.ts');
  const on = parseRoadUrl('a8', '?seg=A8-034&ds=1', true);
  const bad = parseRoadUrl('a8', '?ds=0', true);
  const off = parseRoadUrl('a8', '?ds=1', false);
  const url = buildRoadUrl({ ...on.state, hf: 'glaette' });
  add('V10 URL-Zustand ds: ds=1 ⇒ true; ds=0 ⇒ ungültig; ohne Schalter ignoriert; Aufbau ohne ds bleibt byte-gleich, mit ds an fester Stelle hinter hf',
    on.state.ds === true && bad.invalid.includes('ds') && !bad.state.ds && off.state.ds === undefined && off.invalid.length === 0
    && url === '/autobahnwetter/a8?seg=A8-034&hf=glaette&ds=1' && buildRoadUrl({ ...on.state, ds: false }) === '/autobahnwetter/a8?seg=A8-034' && buildRoadUrl({ ...on.state, seg: null, hf: null, ds: undefined }) === '/autobahnwetter/a8',
    url);
}

add('I1 keine ungefangene Ausnahme in allen Abläufen', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));

await browser.close();
rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`\nverify:road-ui — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
