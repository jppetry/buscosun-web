/**
 * radar-hdr-shots.mjs — Phase HDR (`audit/hd-radar.md` §9): the picture matrix 1 km ↔ 250 m (px250) ↔ 250 m (HX) of the
 * precipitation radar, and the phone numbers for E-HDR-6 (first radar paint, animation frame rate).
 *
 * One locally derived slot (`hd250-compare.mjs` layout: <slots>/<px250|hx>/{rv,rv-past}/<stamp>/…) is served to the page by
 * CDP interception under whatever stamp the page asks for — the live mirror's slot is not the rainy slot of the comparison.
 * Runs against the PRODUCTION build (`vite preview`): no DEV handles (`__map`), every zoom is its own page load through the
 * share URL (`?lat=&lon=&z=`), the state comes from the DOM (status line words, timeline) and from the served requests.
 *
 *   node scripts/radar-hdr-shots.mjs --base=http://127.0.0.1:5241 --slots=<dir> --stamp=2611021030 --out=audit/hd-radar/shots
 *        [--devices=desktop,mobile] [--variants=1km,px250,hx] [--places=koeln,emden,muenchen,basel,konstanz] [--zooms=6,8,10,12]
 *        [--perf=3] [--perf-only]
 *
 * Per shot a line in `report.jsonl`: zoom, status text, whether the 250-m tiles are drawn (status word `250-m-Gitter`), requests
 * of 250-m files, console errors. `--perf`: phone profile (390 × 844, DPR 3, fast 4G, CPU × 4) over Köln at zoom 10 per variant,
 * n runs alternating — first draw with radar content (WebGL hook), the 250-m tiles on screen (status word), then the play
 * button and the frame rate over 6 s (rAF). Long tasks are NOT measurable in chrome-headless-shell; the page runs on software
 * WebGL (`--disable-gpu`), the base map renders black there (as in Phase RA §7): the numbers compare the variants with each
 * other on this machine — they are no phone measurement (CLAUDE.md, Real-Device). Intercepted files arrive without the
 * network emulation (CDP fulfils them locally): the numbers are decode + draw, not transfer.
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, findHeadlessChrome, NET_PROFILES } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5241';
const OUT = args.out ?? join(process.cwd(), 'audit', 'hd-radar', 'shots');
const SLOTS = args.slots;
const STAMP = args.stamp;
if (!SLOTS || !STAMP) { console.error('--slots=<dir> und --stamp=<JJMMTTHHMM> fehlen'); process.exit(2); }
const DEVICES = String(args.devices ?? 'desktop,mobile').split(',');
const VARIANTS = String(args.variants ?? '1km,px250,hx').split(',');
const ZOOMS = String(args.zooms ?? '6,8,10,12').split(',').map(Number);
const PERF_N = Number(args.perf ?? 0);
const PERF_ONLY = !!args['perf-only'];
mkdirSync(OUT, { recursive: true });
const REPORT = join(OUT, 'report.jsonl');

const PLACES = {
  koeln: { slug: 'koeln', center: [6.96, 50.94] },
  emden: { slug: 'bremen', center: [7.2, 53.37] },   // no Emden slug in the place table — the page loads Bremen, the map jumps to Emden
  muenchen: { slug: 'muenchen', center: [11.58, 48.14] },
  basel: { slug: 'basel', center: [7.59, 47.56] },
  konstanz: { slug: 'konstanz', center: [9.17, 47.67] },
  giessen: { slug: 'giessen', center: [8.68, 50.58] },
};
const PLACE_IDS = String(args.places ?? 'koeln,emden,muenchen,basel,konstanz').split(',');
/** variant → query + which local derive serves the page */
const VARIANT = { '1km': { q: 'hd250=0', dir: 'px250' }, px250: { q: 'hd250=1', dir: 'px250' }, hx: { q: 'hd250=1', dir: 'hx' } };
const TILE_WORD = '250-m-Gitter';   // `radarHd250NoteText('tiles')` — the status line says it only while the tiles are drawn

const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden (OG_CHROME setzen)'); process.exit(2); }
const browser = await openBrowser(chrome, { timeoutMs: 180_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stampMs = (st) => Date.UTC(2000 + +st.slice(0, 2), +st.slice(2, 4) - 1, +st.slice(4, 6), +st.slice(6, 8), +st.slice(8, 10));

/** Serve the local slot for ANY rv / rv-past stamp the page asks for (meta re-stamped so the client's checks pass). */
function installLocalSlot(ctx, dir, served) {
  const rvDir = join(dir, 'rv', STAMP), pastDir = join(dir, 'rv-past', STAMP);
  const rvMeta = JSON.parse(readFileSync(join(rvDir, 'meta.json'), 'utf8'));
  const hdMeta = existsSync(join(pastDir, 'hd250.json')) ? JSON.parse(readFileSync(join(pastDir, 'hd250.json'), 'utf8')) : null;
  return browser.on((msg) => {
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

/** WebGL + rAF instrument (the `radar` scenario of perf-measure.mjs, reduced): first draw with a non-empty radar texture. */
const INSTRUMENT = `(() => {
  const P = { firstDraw: null, radarTex: null, radarTexN: 0, radarTexNZ: null, radarDrawNZ: null, gaps: { max: 0, over100: 0, over200: 0, n: 0 } };
  window.__perf = P;
  const RADAR = new Set(['1100x1200', '701x431', '710x640', '600x512']);
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue; const p = C.prototype;
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) { const f = p[k]; if (!f) continue; p[k] = function (...a) { const t = performance.now(); if (P.firstDraw == null) P.firstDraw = t; if (P.radarTexNZ != null && P.radarDrawNZ == null) P.radarDrawNZ = t; return f.apply(this, a); }; }
    for (const k of ['texImage2D', 'texSubImage2D']) { const f = p[k]; if (!f) continue; p[k] = function (...a) {
      let w = null, h = null;
      if (k === 'texImage2D' && a.length >= 9 && typeof a[3] === 'number') { w = a[3]; h = a[4]; }
      else if (k === 'texSubImage2D' && a.length >= 9 && typeof a[4] === 'number') { w = a[4]; h = a[5]; }
      else { const s = a[a.length - 1]; if (s && typeof s === 'object' && s.width) { w = s.width; h = s.height; } }
      if (w && h && RADAR.has(w + 'x' + h)) { const t = performance.now(); if (P.radarTex == null) P.radarTex = t; P.radarTexN++; const px = a[a.length - 1]; if (P.radarTexNZ == null && px && px.length) { for (let i = 0; i < px.length; i += 97) { if (px[i]) { P.radarTexNZ = t; break; } } } }
      return f.apply(this, a); }; }
  }
  let last = 0; const tick = (t) => { if (last) { const d = t - last; P.gaps.n++; if (d > P.gaps.max) P.gaps.max = d; if (d > 100) P.gaps.over100++; if (d > 200) P.gaps.over200++; } last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  window.__fpsSample = (ms) => new Promise((res) => { let n = 0, last = 0, max = 0, over100 = 0, over200 = 0; const t0 = performance.now();
    const tick = (t) => { if (last) { const d = t - last; if (d > max) max = d; if (d > 100) over100++; if (d > 200) over200++; } last = t; n++; if (t - t0 < ms) requestAnimationFrame(tick); else res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), maxGap: Math.round(max), over100, over200, frames: n }); };
    requestAnimationFrame(tick); });
})();`;

/** DOM state: status words (the leaf element that says „DACH-Komposit"), the timeline, the 250-m switch. */
const STATE_JS = `(() => { const tl = document.querySelector('[aria-label="Radar-Zeitpunkt"]');
  const status = (Array.from(document.querySelectorAll('*')).map((e) => e.childElementCount === 0 ? e.textContent : '').find((t) => /DACH-Komposit/.test(t || '')) || '').replace(/\\s+/g, ' ').slice(0, 400);
  const sw = document.querySelector('[aria-label="Auflösung des Niederschlagsradars in Deutschland"]');
  return { idx: tl ? +tl.getAttribute('aria-valuenow') : null, max: tl ? +tl.getAttribute('aria-valuemax') : null, status, tilesDrawn: status.includes(${JSON.stringify(TILE_WORD)}),
    switchOn: sw ? sw.querySelector('button[aria-pressed="true"]')?.textContent : null, note: document.querySelector('.hd250-note')?.textContent || '', search: location.search }; })()`;

async function openScene({ dev, variant, perf = false }) {
  const mobile = dev === 'mobile';
  const ctx = await browser.newContext(mobile ? { width: 390, height: 844, mobile: true, ...(perf ? { net: NET_PROFILES.fast4g, cpu: 4 } : {}) } : { width: 1440, height: 900 });
  const lines = [], served = [];
  browser.on((msg) => {
    if (msg.sessionId !== ctx.sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') lines.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
    if (msg.method === 'Runtime.exceptionThrown') lines.push(`[exception] ${(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text ?? '').slice(0, 400)}`);
  });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
  installLocalSlot(ctx, join(SLOTS, VARIANT[variant].dir), served);
  await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*radar/img/v1/rv/*' }, { urlPattern: '*radar/img/v1/rv-past/*' }] });
  return { ctx, lines, served, mobile };
}
async function navigate(ctx, url) {
  const loaded = browser.waitFor((m) => m.sessionId === ctx.sessionId && m.method === 'Page.loadEventFired', 120_000);
  await ctx.send('Page.navigate', { url });
  await loaded;
}
/**
 * Wait until the radar is really on the map: the WebGL hook saw a draw with a non-empty radar texture (`__perf.radarDrawNZ`)
 * and the timeline exists; for a 250-m variant from zoom 9 additionally until at least one tile file was served. Fixed
 * sleeps are not enough on a loaded machine (04.11.: shots taken before the frames arrived while a typecheck ran).
 */
async function waitReady(ctx, served, { tiles = false, timeoutS = 90 } = {}) {
  let st = null;
  for (let i = 0; i < timeoutS * 2; i++) {
    st = await ctx.evaluate(`(() => { const st = ${STATE_JS}; st.radarDrawn = !!(window.__perf && window.__perf.radarDrawNZ != null); return st; })()`).catch(() => null);
    if (st && st.max != null && st.radarDrawn && (!tiles || served.some((s) => /rv-past\/\d{10}\/h\d\d\.png$/.test(s)))) return st;
    await sleep(500);
  }
  return st && st.radarDrawn ? st : null;
}
const jumpNow = (ctx) => ctx.evaluate(`(() => { const b = document.querySelector('.rdr-tl-now'); if (b) b.click(); return !!b; })()`).catch(() => false);
const url = (place, variant, z) => `${BASE}/regenradar/${place.slug}?lat=${place.center[1]}&lon=${place.center[0]}&z=${z}&${VARIANT[variant].q}`;

// ── picture matrix ──
if (!PERF_ONLY) {
  for (const dev of DEVICES) for (const variant of VARIANTS) for (const pid of PLACE_IDS) {
    const place = PLACES[pid];
    if (!place) { console.error(`unbekannter Ort ${pid}`); continue; }
    const id = `${pid}-${dev}-${variant}`;
    const { ctx, lines, served } = await openScene({ dev, variant });
    for (const z of ZOOMS) {
      const before = served.length;
      await navigate(ctx, url(place, variant, z));
      const ready = await waitReady(ctx, served, { tiles: variant !== '1km' && z >= 9 });
      await jumpNow(ctx);
      await sleep(z >= 10 ? 5000 : 3000);
      const state = await ctx.evaluate(STATE_JS).catch((e) => ({ error: String(e) }));
      const hd250Reqs = served.slice(before).filter((s) => /rv-past\/\d{10}\/(hd250\.json|h\d\d\.png)/.test(s));
      const name = `${id}-z${z}.png`;
      const { data } = await ctx.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
      const rec = { scene: id, dev, variant, place: pid, zoom: z, shot: name, ready: !!ready, ...state, hd250Reqs: hd250Reqs.length, hd250Tiles: hd250Reqs.filter((s) => /h\d\d\.png/.test(s)).length, served: served.length - before, consoleErrors: lines.filter((l) => /^\[(error|exception)\]/.test(l)).slice(0, 5) };
      appendFileSync(REPORT, JSON.stringify(rec) + '\n');
      console.log(`${name} ${ready ? '' : 'NICHT BEREIT '}idx ${rec.idx}/${rec.max} tiles ${rec.tilesDrawn ? 'drawn' : '-'} reqs ${rec.hd250Reqs}/${rec.hd250Tiles} status "${(rec.status || '').slice(0, 120)}" ${rec.consoleErrors.length ? 'ERR ' + rec.consoleErrors[0] : ''}`);
    }
    appendFileSync(REPORT, JSON.stringify({ scene: id, consoleAll: lines.length, consoleErrors: lines.filter((l) => /^\[(error|exception)\]/.test(l)), consoleWarn: lines.filter((l) => /^\[warn/.test(l)).slice(0, 10), servedLocal: served.length }) + '\n');
    await ctx.close();
  }
}

// ── phone numbers (E-HDR-6): Köln at zoom 10, n runs per variant, alternating ──
if (PERF_N > 0) {
  const place = PLACES.koeln;
  const runs = [];
  for (let i = 0; i < PERF_N; i++) for (const variant of VARIANTS) {
    const { ctx, lines, served } = await openScene({ dev: 'mobile', variant, perf: true });
    const t0 = Date.now();
    await navigate(ctx, url(place, variant, 10));
    let perf = null, tilesAt = null;
    for (let k = 0; k < 160; k++) {
      const p = await ctx.evaluate(`(() => { const P = window.__perf || {}; const st = ${STATE_JS}; return { radarDrawNZ: P.radarDrawNZ, firstDraw: P.firstDraw, radarTexN: P.radarTexN, gaps: P.gaps, tilesDrawn: st.tilesDrawn, t: performance.now() }; })()`).catch(() => null);
      if (p) { perf = p; if (p.tilesDrawn && tilesAt == null) tilesAt = p.t; }
      if (perf?.radarDrawNZ != null && (variant === '1km' ? k >= 4 : tilesAt != null)) break;
      await sleep(500);
    }
    await sleep(1500);
    // the deck mounts after the map under CPU throttling — wait for the play button (up to 30 s), then click it
    let clicked = 'none';
    for (let k = 0; k < 60 && clicked === 'none'; k++) {
      clicked = await ctx.evaluate(`(() => { const b = document.querySelector('button.mdk-td-play, button.rdr-tl-play, button[aria-label="Abspielen"]'); if (!b) return 'none'; b.click(); return true; })()`).catch((e) => 'ERR ' + String(e.message).slice(0, 120));
      if (clicked === 'none') await sleep(500);
    }
    await sleep(1000);
    const fps = await ctx.evaluate('window.__fpsSample(6000)').catch(() => null);
    const state = await ctx.evaluate(STATE_JS).catch(() => ({}));
    const tileReqs = served.filter((s) => /rv-past\/\d{10}\/h\d\d\.png/.test(s)).length;
    const rec = { perf: true, run: i + 1, variant, wallMs: Date.now() - t0, firstDraw: perf?.firstDraw != null ? Math.round(perf.firstDraw) : null, firstRadarPaint: perf?.radarDrawNZ != null ? Math.round(perf.radarDrawNZ) : null, tilesShownAt: tilesAt != null ? Math.round(tilesAt) : null, tilesDrawn: !!state.tilesDrawn, tileReqs, radarTexN: perf?.radarTexN ?? null, loadGaps: perf?.gaps, play: clicked, fps, consoleErrors: lines.filter((l) => /^\[(error|exception)\]/.test(l)).slice(0, 3), served: served.length };
    runs.push(rec);
    appendFileSync(REPORT, JSON.stringify(rec) + '\n');
    console.log(`perf ${variant} #${i + 1}: firstDraw ${rec.firstDraw} ms · first radar paint ${rec.firstRadarPaint} ms · tiles on screen ${rec.tilesShownAt ?? '—'} ms (${tileReqs} tile files) · play ${clicked} · fps ${fps?.fps ?? '—'} maxGap ${fps?.maxGap ?? '—'} >100 ${fps?.over100 ?? '—'} >200 ${fps?.over200 ?? '—'} · load gaps max ${Math.round(perf?.gaps?.max ?? 0)} >200 ${perf?.gaps?.over200 ?? '—'}`);
    await ctx.close();
  }
  const med = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  for (const variant of VARIANTS) {
    const rs = runs.filter((r) => r.variant === variant);
    const line = { perfSummary: true, variant, n: rs.length, firstRadarPaintMed: med(rs.map((r) => r.firstRadarPaint)), tilesShownAtMed: med(rs.map((r) => r.tilesShownAt)), fpsMed: med(rs.map((r) => r.fps?.fps)), maxGapMed: med(rs.map((r) => r.fps?.maxGap)), over200Med: med(rs.map((r) => r.fps?.over200)), loadGapMaxMed: med(rs.map((r) => r.loadGaps?.max != null ? Math.round(r.loadGaps.max) : null)) };
    appendFileSync(REPORT, JSON.stringify(line) + '\n');
    console.log(`perf summary ${variant}: ${JSON.stringify(line)}`);
  }
}
await Promise.race([browser.close(), sleep(3000)]);
console.log('done', REPORT);
process.exit(0);
