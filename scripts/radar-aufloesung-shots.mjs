/**
 * radar-aufloesung-shots.mjs — Phase RA (`audit/radar-aufloesung.md` §7): the picture matrix of the precipitation radar.
 * Desktop (1440 × 900) and phone (390 × 844, DPR 3) · DE / AT / CH (+ LI) · zoom 6 / 8 / 10 / 12 · look-back / now / +60 min ·
 * 250 m off / on · echo filter off / on (the two SE reference slots served to the page by CDP interception under whatever
 * stamp the page asks for — the mirror's live slot is not a bird-migration night).
 *
 *   node scripts/radar-aufloesung-shots.mjs --base=http://127.0.0.1:5241 --out=audit/radar-aufloesung/shots
 *        [--slots=<dir with <stamp>/<off|on>/{rv,rv-past}/<stamp>/…>] [--only=de-live,at,ch,li,de-local] [--devices=desktop,mobile]
 *
 * Per shot a line in `report.jsonl`: zoom, the slider index, status text, the tile layers on screen, the 1-km DE layer,
 * requests of 250-m files (`hd250.json`, `h??.png`) so far, console errors. Long tasks are NOT measurable in
 * chrome-headless-shell (CLAUDE.md) — the console lines and the request counts are what this harness can say.
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5241';
const OUT = args.out ?? join(process.cwd(), 'audit', 'radar-aufloesung', 'shots');
const SLOTS = args.slots ?? null;
const ONLY = args.only ? String(args.only).split(',') : null;
const DEVICES = (args.devices ? String(args.devices).split(',') : ['desktop', 'mobile']);
const ZOOMS = (args.zooms ? String(args.zooms).split(',').map(Number) : [6, 8, 10, 12]);
mkdirSync(OUT, { recursive: true });
const REPORT = join(OUT, 'report.jsonl');

const PLACES = {
  de: { slug: 'giessen', center: [8.68, 50.58], country: 'DE', stepMin: 5 },
  at: { slug: 'salzburg', center: [13.04, 47.80], country: 'AT', stepMin: 15 },
  ch: { slug: 'basel', center: [7.59, 47.56], country: 'CH', stepMin: 5 },
  li: { slug: 'vaduz', center: [9.52, 47.14], country: 'LI', stepMin: 5 },
};
// a context = one page load; the shots inside jump zooms and step times
const SCENES = [];
for (const dev of DEVICES) {
  for (const hd of ['0', '1']) SCENES.push({ id: `de-live-${dev}-hd250-${hd}`, group: 'de-live', dev, place: PLACES.de, q: `?hd250=${hd}`, times: ['past', 'now', 'fc60'], zooms: ZOOMS, toggle: hd === '0' });
  SCENES.push({ id: `at-${dev}`, group: 'at', dev, place: PLACES.at, q: '', times: ['past', 'now', 'fc60'], zooms: ZOOMS });
  SCENES.push({ id: `ch-${dev}`, group: 'ch', dev, place: PLACES.ch, q: '', times: ['past', 'now', 'fc60'], zooms: ZOOMS });
  SCENES.push({ id: `li-${dev}`, group: 'li', dev, place: PLACES.li, q: '', times: ['now'], zooms: [8, 10] });
  // the Wetterkarte (no profile): the status line with grid words, the filter hint and the 250-m availability; slider at „jetzt"
  SCENES.push({ id: `wk-de-${dev}`, group: 'wk', dev, place: PLACES.de, q: '', times: ['now'], zooms: [8, 10], page: '/wetterkarte/niederschlag/giessen', toggle: dev === 'desktop' });
  if (SLOTS) for (const stamp of ['2610122235', '2610111005']) for (const mode of ['off', 'on']) for (const hd of ['0', '1']) {
    SCENES.push({ id: `de-local-${stamp}-${mode}-${dev}-hd250-${hd}`, group: 'de-local', dev, place: PLACES.de, q: `?hd250=${hd}`, times: ['now'], zooms: [8, 10, 12], local: { dir: join(SLOTS, stamp, mode), stamp, mode } });
  }
}
const SCENE_IDS = args.scenes ? String(args.scenes).split(',') : null;
const scenes = SCENES.filter((s) => (!ONLY || ONLY.includes(s.group)) && (!SCENE_IDS || SCENE_IDS.includes(s.id)));

const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden (OG_CHROME setzen)'); process.exit(2); }
const browser = await openBrowser(chrome, { timeoutMs: 180_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stampMs = (st) => Date.UTC(2000 + +st.slice(0, 2), +st.slice(2, 4) - 1, +st.slice(4, 6), +st.slice(6, 8), +st.slice(8, 10));

/** Serve a locally derived slot for ANY rv / rv-past stamp the page asks for (meta re-stamped so the client's checks pass). */
function installLocalSlot(ctx, local, served) {
  const rvDir = join(local.dir, 'rv', local.stamp), pastDir = join(local.dir, 'rv-past', local.stamp);
  const rvMeta = JSON.parse(readFileSync(join(rvDir, 'meta.json'), 'utf8'));
  const hdMeta = existsSync(join(pastDir, 'hd250.json')) ? JSON.parse(readFileSync(join(pastDir, 'hd250.json'), 'utf8')) : null;
  browser.on((msg) => {
    if (msg.sessionId !== ctx.sessionId || msg.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = msg.params;
    const m = /\/radar\/img\/v1\/(rv|rv-past)\/(\d{10})\/([a-z0-9]+\.(?:png|json))$/.exec(request.url);
    const cont = () => void browser.send('Fetch.continueRequest', { requestId }, ctx.sessionId).catch(() => {});
    const fulfill = (code, body, type) => void browser.send('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Cache-Control', value: 'no-store' }], body: body.toString('base64') }, ctx.sessionId).catch(() => {});
    if (!m) { cont(); return; }
    const [, kind, stamp, file] = m;
    served.push(`${kind}/${stamp}/${file}`);
    const ms = stampMs(stamp);
    if (kind === 'rv' && file === 'meta.json') {
      const shift = ms - rvMeta.runAtMs;
      const meta = { ...rvMeta, stamp, runAtMs: ms, frames: rvMeta.frames.map((f) => ({ ...f, ...(f.validAtMs != null ? { validAtMs: f.validAtMs + shift } : {}) })) };
      fulfill(200, Buffer.from(JSON.stringify(meta)), 'application/json'); return;
    }
    if (kind === 'rv-past' && file === 'hd250.json') {
      if (!hdMeta) { fulfill(404, Buffer.from(''), 'text/plain'); return; }
      fulfill(200, Buffer.from(JSON.stringify({ ...hdMeta, stamp, validAtMs: ms })), 'application/json'); return;
    }
    const p = join(kind === 'rv' ? rvDir : pastDir, file);
    if (!existsSync(p)) { fulfill(404, Buffer.from(''), 'text/plain'); return; }
    fulfill(200, readFileSync(p), file.endsWith('.json') ? 'application/json' : 'image/png');
  });
}

for (const sc of scenes) {
  const mobile = sc.dev === 'mobile';
  const ctx = await browser.newContext(mobile ? { width: 390, height: 844, mobile: true } : { width: 1440, height: 900 });
  const lines = [], served = [];
  browser.on((msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') lines.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
    if (msg.method === 'Runtime.exceptionThrown') lines.push(`[exception] ${(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text ?? '').slice(0, 400)}`);
  });
  if (sc.local) { installLocalSlot(ctx, sc.local, served); await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*radar/img/v1/rv/*' }, { urlPattern: '*radar/img/v1/rv-past/*' }] }); }
  const url = `${BASE}${sc.page ?? `/regenradar/${sc.place.slug}`}${sc.q}`;
  const loaded = browser.waitFor((m) => m.sessionId === ctx.sessionId && m.method === 'Page.loadEventFired', 120_000);
  await ctx.send('Page.navigate', { url });
  await loaded;
  // wait for the radar stack (the timeline appears) and the RV frames of the map
  let ready = null;
  for (let i = 0; i < 90 && !ready; i++) {
    ready = await ctx.evaluate(`(() => { const s = window.__precipSources && window.__precipSources(); const tl = document.querySelector('[aria-label="Radar-Zeitpunkt"]') || (${!!sc.page} && s && s.rv ? { getAttribute: () => '0' } : null); return s && window.__map && tl ? { rv: s.rv ? s.rv.frames.length : 0, inca: !!s.inca, rzc: !!s.rzc, max: tl.getAttribute('aria-valuemax'), now: tl.getAttribute('aria-valuenow') } : null; })()`).catch(() => null);
    if (!ready) await sleep(1000);
  }
  // the look-back seed loads on the first step into the past — ask for it once, then wait until the axis has grown
  // (DE/CH: the mirror's analyses; AT: nothing comes, the axis stays) — then step back to „jetzt".
  const maxBefore = Number(ready?.max ?? 0);
  await ctx.evaluate(`(() => { const b = document.querySelector('[aria-label="Ein Frame zurück"]'); b && b.click(); return true; })()`).catch(() => {});
  let maxNow = maxBefore;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    maxNow = Number(await ctx.evaluate(`document.querySelector('[aria-label="Radar-Zeitpunkt"]')?.getAttribute('aria-valuemax')`).catch(() => maxBefore));
    if (maxNow > maxBefore) break;
    // the first click may land before the stack's seed hook is set — ask again every few seconds
    if (i % 6 === 5) await ctx.evaluate(`(() => { const b = document.querySelector('[aria-label="Ein Frame zurück"]'); b && b.click(); return true; })()`).catch(() => {});
  }
  await sleep(3000);
  // back to „jetzt" by the timeline's own button (the seed re-maps the slider, a relative step would land next to now)
  await ctx.evaluate(`(() => { const b = document.querySelector('.rdr-tl-now'); if (b) b.click(); else { const f = document.querySelector('[aria-label="Ein Frame vor"]'); f && f.click(); } return !!b; })()`).catch(() => {});
  await sleep(1500);
  const nowIdx = Number(await ctx.evaluate(`document.querySelector('[aria-label="Radar-Zeitpunkt"]')?.getAttribute('aria-valuenow')`).catch(() => 0));
  console.log(`${sc.id}: axis ${maxBefore} → ${maxNow} frames, now at index ${nowIdx}`);
  const stepTo = async (delta) => {
    const sel = delta < 0 ? '[aria-label="Ein Frame zurück"]' : '[aria-label="Ein Frame vor"]';
    for (let i = 0; i < Math.abs(delta); i++) await ctx.evaluate(`(() => { const b = document.querySelector('${sel}'); b && b.click(); return true; })()`).catch(() => {});
  };
  const timeDeltas = { past: -Math.round(30 / sc.place.stepMin), now: 0, fc60: Math.round(60 / sc.place.stepMin) };
  // every time is absolute from „jetzt" (a relative step would drift where the axis clamps — AT has no look-back)
  const jumpNow = () => ctx.evaluate(`(() => { const b = document.querySelector('.rdr-tl-now'); if (b) b.click(); return !!b; })()`).catch(() => false);
  let curDelta = 0;
  for (const t of sc.times) {
    const want = timeDeltas[t];
    await jumpNow(); await sleep(400);
    await stepTo(want); curDelta = want;
    for (const z of sc.zooms) {
      await ctx.evaluate(`(() => { window.__map.jumpTo({ center: [${sc.place.center[0]}, ${sc.place.center[1]}], zoom: ${z}, bearing: 0, pitch: 0 }); return true; })()`).catch(() => {});
      await sleep(z >= 10 ? 7000 : 4500);
      const state = await ctx.evaluate(`(() => { const m = window.__map; const tl = document.querySelector('[aria-label="Radar-Zeitpunkt"]');
        const ids = Array.from({ length: 16 }, (_, i) => 'precip-rain-hd250-' + Math.floor(i / 4) + (i % 4));
        const of = (id) => { const l = m.getLayer(id); if (!l) return null; const impl = l.implementation ?? l; return { id, opacity: impl.opacity, tex: (impl.texW || 0) + 'x' + (impl.texH || 0) }; };
        const tiles = ids.map(of).filter(Boolean);
        const status = (Array.from(document.querySelectorAll('*')).map((e) => e.childElementCount === 0 ? e.textContent : '').find((t) => /DACH-Komposit/.test(t || '')) || '').replace(/\\s+/g, ' ').slice(0, 400);
        const sw = document.querySelector('[aria-label="Auflösung des Niederschlagsradars in Deutschland"]');
        const note = document.querySelector('.hd250-note')?.textContent || '';
        return { zoom: +m.getZoom().toFixed(2), idx: tl ? +tl.getAttribute('aria-valuenow') : null, max: tl ? +tl.getAttribute('aria-valuemax') : null,
          shown: tiles.filter((x) => x.opacity > 0).map((x) => x.id), nTileLayers: tiles.length, de: of('precip-rain-hd-de'), at: of('precip-rain-hd-at'), ch: of('precip-rain-hd-ch'), status, hasSwitch: !!sw, switchOn: sw ? sw.querySelector('button[aria-pressed="true"]')?.textContent : null, note }; })()`).catch((e) => ({ error: String(e) }));
      const reqs = ctx.requests ? ctx.requests() : [];
      const hd250Reqs = reqs.filter((r) => /rv-past\/\d{10}\/(hd250\.json|h\d\d\.png)/.test(r.url ?? r));
      const name = `${sc.id}-${t}-z${z}.png`;
      const { data } = await ctx.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
      const rec = { scene: sc.id, dev: sc.dev, place: sc.place.slug, time: t, delta: curDelta, nowIdx, zoom: z, shot: name, ...state, hd250Reqs: hd250Reqs.length, hd250Tiles: hd250Reqs.filter((r) => /h\d\d\.png/.test(r.url ?? r)).length, served: served.length, consoleErrors: lines.filter((l) => /^\[(error|exception)\]/.test(l)).slice(0, 5) };
      appendFileSync(REPORT, JSON.stringify(rec) + '\n');
      console.log(`${name} idx ${rec.idx}/${rec.max} tiles ${rec.shown?.length ?? '-'} de ${rec.de?.opacity ?? '-'} reqs ${rec.hd250Reqs} status "${(rec.status || '').slice(0, 120)}"`);
    }
  }
  // the switch itself (desktop, DE, switch off): flip to 250 m at zoom 10 and back — requests before/after, picture, console
  if (sc.toggle && !mobile) {
    await jumpNow(); await sleep(400); curDelta = 0;
    await ctx.evaluate(`(() => { window.__map.jumpTo({ center: [${sc.place.center[0]}, ${sc.place.center[1]}], zoom: 10, bearing: 0, pitch: 0 }); return true; })()`);
    await sleep(4000);
    const before = (ctx.requests ? ctx.requests() : []).filter((r) => /h\d\d\.png/.test(r.url ?? r)).length;
    const clicked = await ctx.evaluate(`(() => { const sw = document.querySelector('[aria-label="Auflösung des Niederschlagsradars in Deutschland"]'); if (!sw) return 'no switch'; sw.querySelectorAll('button')[1].click(); return location.search; })()`);
    await sleep(8000);
    const after = (ctx.requests ? ctx.requests() : []).filter((r) => /h\d\d\.png/.test(r.url ?? r)).length;
    const st = await ctx.evaluate(`(() => { const sw = document.querySelector('[aria-label="Auflösung des Niederschlagsradars in Deutschland"]'); return { search: location.search, store: localStorage.getItem('radarhd250'), pressed: sw && sw.querySelector('button[aria-pressed="true"]')?.textContent, note: document.querySelector('.hd250-note')?.textContent, status: (document.querySelector('.mdk-status-chip')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 300) }; })()`);
    const { data } = await ctx.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${sc.id}-toggle-on-z10.png`), Buffer.from(data, 'base64'));
    const back = await ctx.evaluate(`(() => { const sw = document.querySelector('[aria-label="Auflösung des Niederschlagsradars in Deutschland"]'); sw.querySelectorAll('button')[0].click(); return location.search; })()`);
    await sleep(3000);
    const st2 = await ctx.evaluate(`(() => ({ search: location.search, store: localStorage.getItem('radarhd250'), tilesShown: Array.from({ length: 16 }, (_, i) => 'precip-rain-hd250-' + Math.floor(i / 4) + (i % 4)).filter((id) => { const l = window.__map.getLayer(id); const impl = l && (l.implementation ?? l); return impl && impl.opacity > 0; }).length, de: (() => { const l = window.__map.getLayer('precip-rain-hd-de'); const impl = l && (l.implementation ?? l); return impl ? impl.opacity : null; })() }))()`);
    const rec = { scene: sc.id, toggle: true, clicked, tileReqsBefore: before, tileReqsAfter: after, afterOn: st, afterOff: st2, backSearch: back, consoleErrors: lines.filter((l) => /^\[(error|exception)\]/.test(l)).slice(0, 5) };
    appendFileSync(REPORT, JSON.stringify(rec) + '\n');
    console.log(`toggle: tile requests ${before} → ${after}; on: ${JSON.stringify(st)}; off: ${JSON.stringify(st2)}`);
  }
  // phone: the layer sheet with the switch (DE) once per scene at zoom 10
  if (mobile && sc.place.country === 'DE' && sc.times.includes('now')) {
    const opened = await ctx.evaluate(`(() => { const b = Array.from(document.querySelectorAll('nav.rm-tabbar button')).find((x) => /layer|ebene/i.test(x.textContent || x.getAttribute('aria-label') || '')); if (!b) return false; b.click(); return true; })()`).catch(() => false);
    await sleep(1500);
    const { data } = await ctx.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${sc.id}-layersheet.png`), Buffer.from(data, 'base64'));
    const sw = await ctx.evaluate(`(() => { const sw = document.querySelector('[aria-label="Auflösung des Niederschlagsradars in Deutschland"]'); if (!sw) return null; const r = sw.getBoundingClientRect(); const b = sw.querySelectorAll('button'); return { w: r.width, h: r.height, btn: Array.from(b).map((x) => { const q = x.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; }) }; })()`).catch(() => null);
    appendFileSync(REPORT, JSON.stringify({ scene: sc.id, layersheet: opened, switchBox: sw }) + '\n');
    console.log(`layer sheet ${opened}: switch ${JSON.stringify(sw)}`);
  }
  appendFileSync(REPORT, JSON.stringify({ scene: sc.id, consoleAll: lines.length, consoleErrors: lines.filter((l) => /^\[(error|exception)\]/.test(l)), consoleWarn: lines.filter((l) => /^\[warn/.test(l)).slice(0, 10), servedLocal: served.length }) + '\n');
  await ctx.close();
}
await Promise.race([browser.close(), sleep(3000)]);
console.log('done', REPORT);
process.exit(0);
