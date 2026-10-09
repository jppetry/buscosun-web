/**
 * radar-hd-pixelcheck.mjs — Phase HD, gate G2 (audit/radar-hochaufloesung.md §5): is the pixel on the screen the radar pixel?
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/radar-hd-pixelcheck.mjs \
 *        --base=http://127.0.0.1:5231 --out=<dir> [--zoom=10] [--tol=8] [--windows=DE,AT,CH]
 *
 * Needs the DEV server (`__map`, `__precipSources`). One browser, three fresh contexts per window: `?hd=nearest` (the gate:
 * every screen pixel = nearest 1-km texel of the owning country's grid), `?hd=catmull` (the picture for the eye, oracle =
 * clamped Catmull-Rom on the native grid) and no switch (HEAD behaviour: oracle = the 600 × 512 composite + B-spline,
 * and — as the negative control — the native oracle, which must agree LESS).
 *
 * The page hands over the radar frames it drew and its colour ramp (the same canvas gradient `getColorRamp` draws); the
 * canvas itself is read back through `toDataURL` inside a render (no DOM overlays, no compositing) — once without the
 * precipitation layers (the background per pixel) and once with them. The oracle renders the viewport in Node: Mercator
 * from the map's centre/zoom (checked against `map.unproject` at the four corners), country per pixel by `pickCountry`
 * (the mask rule), the filter's algebra at the texel coordinate, the ramp exactly as the shader reads it (16 × 16 texture,
 * LINEAR, `rp = (fract(16t), floor(16t)/16)`), alpha-blended over the measured background. All style layers but the
 * precipitation layers, the background, the dim wash and the Länder-Maske are hidden (flat background). Agreement =
 * |ΔRGB| ≤ tol in every channel, counted inside DACH away from the mask edge. Output: canvas shots, diff images, `report.json`.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';
import { decodePng, encodePng, toRgba } from './lib/png.mjs';
import { fastCountryPicker } from '../src/scalar/radarCountryMask.ts';
import { psFwd, DE1200_CORNERS } from '../src/sources/radolanGeo.ts';
import { incaFwd } from '../src/sources/geosphereIncaGeo.ts';
import { rzcFwd } from '../src/sources/meteoSwissGeo.ts';
import { precipRainRamp, precipRainRampLog } from '../src/scalar/RainLayer.ts';
import { G } from '../src/scalar/precipIndexMap.ts';
import { texelReader, shade } from './lib/rainEdgeAlgebra.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5231';
const OUT = args.out ?? join(process.cwd(), '.cache', 'radar-hd-pixelcheck');
const ZOOM = Number(args.zoom ?? 10);
const TOL = Number(args.tol ?? 8);
const ONLY = args.windows ? args.windows.split(',') : null;
/**
 * HD-3 gate G8: `--dualDir=<slot dir written by radar-derive.mjs with RADAR_IMG_DUAL=1>` serves THAT slot to the page for
 * every RV slot request (meta.json with the requested stamp, the f- and g-PNGs from the directory) through CDP Fetch
 * interception — the mirror on the CDN carries no dual frames until Jan's gate. The variants then run with `&hdv2=1`
 * and the oracle draws from the log plane the page received (`values2`) with the log ramp.
 */
const DUAL_DIR = args.dualDir ?? null;
/**
 * Phase RS (`audit/radar-randsaum.md`): `--edge=1` runs the edge-rule variants against the live slot (log plane where the page
 * has one): `?hdedge=1` (round) and `?hdedge=nearest` with the edge oracle, `?hd=catmull` without (the picture before RS), and
 * per run the halo on the canvas itself — drawn pixels (|shot − background| > tol) whose nearest texel of the owning grid is dry.
 */
const EDGE = args.edge === '1';
const W = 1440, H = 900;
const OPACITY = 0.85;   // RainLayer opacity of the precipitation layers in MapView
mkdirSync(OUT, { recursive: true });
const DEG = Math.PI / 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── DACH mask (0,002°) from the map's own GeoJSON — comparison only inside, away from the edge ───────────────────
const DACH = { lonMin: 5.5, lonMax: 17.5, latMin: 45.3, latMax: 55.6, step: 0.002 };
DACH.w = Math.ceil((DACH.lonMax - DACH.lonMin) / DACH.step); DACH.h = Math.ceil((DACH.latMax - DACH.latMin) / DACH.step);
DACH.mask = new Uint8Array(DACH.w * DACH.h);
{
  const edges = [];
  for (const c of ['DE', 'AT', 'CH']) {
    const f = JSON.parse(readFileSync(join('public', 'countries', `${c}.geojson`), 'utf8'));
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) edges.push([ring[i][0], ring[i][1], ring[j][0], ring[j][1]]);
  }
  for (let r = 0; r < DACH.h; r++) {
    const lat = DACH.latMax - (r + 0.5) * DACH.step; const cuts = [];
    for (const [xi, yi, xj, yj] of edges) if ((yi > lat) !== (yj > lat)) cuts.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((cuts[k] - DACH.lonMin) / DACH.step - 0.5)), c1 = Math.min(DACH.w - 1, Math.floor((cuts[k + 1] - DACH.lonMin) / DACH.step - 0.5));
      for (let c = c0; c <= c1; c++) DACH.mask[r * DACH.w + c] = 1;
    }
  }
}
const inDach = (lon, lat) => { const c = Math.floor((lon - DACH.lonMin) / DACH.step), r = Math.floor((DACH.latMax - lat) / DACH.step); return c >= 0 && r >= 0 && c < DACH.w && r < DACH.h && DACH.mask[r * DACH.w + c] === 1; };

// ── filters (the shader's algebra, see verify-radar-hd D) ──────────────────────────────────────────────────────
const clampI = (x, n) => (x < 0 ? 0 : x >= n ? n - 1 : x);
const bsplineW = (t) => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 3 * t2 - 3 * t + 1) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6]; };
const catmullW = (t) => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2]; };
/** value 0..1 at continuous uv on a W×H u8 texture. */
function sampleTex(values, W, H, u, v, mode, edge = 'off') {
  if (edge !== 'off') return shade(texelReader(values, W, H), u * W, v * H, mode, edge);
  const x = u * W - 0.5, y = v * H - 0.5;
  const at = (xx, yy) => values[clampI(yy, H) * W + clampI(xx, W)] / 255;
  if (mode === 'nearest') return at(Math.floor(u * W), Math.floor(v * H));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  if (mode === 'bilinear') return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  const wx = mode === 'bspline' ? bsplineW(fx) : catmullW(fx), wy = mode === 'bspline' ? bsplineW(fy) : catmullW(fy);
  let s = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) s += wx[i] * wy[j] * at(x0 - 1 + i, y0 - 1 + j);
  if (mode === 'catmull') { const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1); const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d); s = s < lo ? lo : s > hi ? hi : s; }
  return s;
}

// ── grids ──────────────────────────────────────────────────────────────────────────────────────────────────────
function gridOf(project, corners, W, H, values) {
  const [nw, ne, se, sw] = corners.map(([lo, la]) => project(lo, la));
  const west = (nw[0] + sw[0]) / 2, east = (ne[0] + se[0]) / 2, north = (nw[1] + ne[1]) / 2, south = (sw[1] + se[1]) / 2;
  return { W, H, values, uv: (lon, lat) => { const p = project(lon, lat); return [(p[0] - west) / (east - west), (p[1] - north) / (south - north)]; } };
}
/** `plane` 2 (HD-3): the log plane where the page has one; `log` per grid tells the oracle which ramp applies. */
const gridsOf = (fr, plane = 1) => {
  const pick = (x) => (plane === 2 && x.values2 ? { values: x.values2, log: true } : { values: x.values, log: false });
  const d = pick(fr.rv), a = pick(fr.inca), c = pick(fr.rzc);
  return {
    DE: { ...gridOf(psFwd, DE1200_CORNERS, fr.rv.w, fr.rv.h, d.values), log: d.log },
    AT: { ...gridOf(incaFwd, fr.inca.corners, fr.inca.w, fr.inca.h, a.values), log: a.log },
    CH: { ...gridOf(rzcFwd, fr.rzc.corners, fr.rzc.w, fr.rzc.h, c.values), log: c.log },
  };
};
const nearestOf = (g, lon, lat) => { const [u, v] = g.uv(lon, lat); if (u < 0 || u >= 1 || v < 0 || v >= 1) return null; return g.values[Math.floor(v * g.H) * g.W + Math.floor(u * g.W)]; };
/** The 600 × 512 composite as the client builds it (country per cell centre, nearest native texel). */
function compositeOf(grids) {
  const pick = fastCountryPicker();
  const out = new Uint8Array(G.w * G.h);
  for (let r = 0; r < G.h; r++) for (let c = 0; c < G.w; c++) {
    const lat = G.latMax - ((r + 0.5) / G.h) * (G.latMax - G.latMin), lon = G.lonMin + ((c + 0.5) / G.w) * (G.lonMax - G.lonMin);
    const v = nearestOf(grids[pick(lat, lon)], lon, lat);
    out[r * G.w + c] = v ?? 0;
  }
  return { W: G.w, H: G.h, values: out, uv: (lon, lat) => [(lon - G.lonMin) / (G.lonMax - G.lonMin), (G.latMax - lat) / (G.latMax - G.latMin)] };
}

// ── browser ────────────────────────────────────────────────────────────────────────────────────────────────────
const chrome = findHeadlessChrome();
if (!chrome) { console.error('kein chrome-headless-shell gefunden (OG_CHROME setzen)'); process.exit(2); }
const browser = await openBrowser(chrome, { timeoutMs: 120_000 });

async function openPage(query) {
  const ctx = await browser.newContext({ width: W, height: H, mobile: false });
  if (DUAL_DIR) {
    // every RV slot request of the page answered from the local dual slot (stamp rewritten to the requested one)
    const localMeta = JSON.parse(readFileSync(join(DUAL_DIR, 'meta.json'), 'utf8'));
    browser.on((msg) => {
      if (msg.method !== 'Fetch.requestPaused' || msg.sessionId !== ctx.sessionId) return;
      const { requestId, request } = msg.params;
      const m = /\/radar\/img\/v1\/rv\/(\d{10})\/([a-z]\d{3}\.png|meta\.json)$/.exec(request.url);
      if (!m) { void browser.send('Fetch.continueRequest', { requestId }, ctx.sessionId).catch(() => {}); return; }
      const [, stamp, file] = m;
      let body, type = 'image/png';
      if (file === 'meta.json') {
        const stampMs = Date.UTC(2000 + +stamp.slice(0, 2), +stamp.slice(2, 4) - 1, +stamp.slice(4, 6), +stamp.slice(6, 8), +stamp.slice(8, 10));
        const meta = { ...localMeta, stamp, runAtMs: stampMs, frames: localMeta.frames.map((f) => ({ ...f, validAtMs: stampMs + f.lead * 60_000 })) };
        delete meta.hourMeans;
        body = Buffer.from(JSON.stringify(meta)); type = 'application/json';
      } else {
        try { body = readFileSync(join(DUAL_DIR, file)); } catch { void browser.send('Fetch.fulfillRequest', { requestId, responseCode: 404, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }], body: '' }, ctx.sessionId).catch(() => {}); return; }
      }
      void browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: body.toString('base64') }, ctx.sessionId).catch(() => {});
    });
    await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*radar/img/v1/rv/*' }] });
  }
  const loaded = browser.waitFor((m) => m.sessionId === ctx.sessionId && m.method === 'Page.loadEventFired', 120_000);
  await ctx.send('Page.navigate', { url: `${BASE}/wetterkarte/niederschlag/muenchen${query}` });
  await loaded;
  return ctx;
}
async function waitForFrames(ctx, needMasks) {
  for (let i = 0; i < 90; i++) {
    const r = await ctx.evaluate(`(() => { const s = window.__precipSources && window.__precipSources(); if (!s) return null;
      return { rv: !!(s.rv && s.rv.frames.length), inca: !!(s.inca && s.inca.frames.length), rzc: !!s.rzc, masks: !!(s.masks && s.masks.DE && s.masks.AT && s.masks.CH) }; })()`);
    if (r && r.rv && r.inca && r.rzc && (!needMasks || r.masks)) return r;
    await sleep(1000);
  }
  throw new Error('radar frames did not arrive');
}
/** Flat background: every style layer hidden except the precipitation layers, the background, the dim wash and the mask. */
const KEEP = '/^precip-rain|dim|mask/';
async function flattenBasemap(ctx) {
  return ctx.evaluate(`(() => { const m = window.__map; const keep = ${KEEP}; let hidden = 0;
    for (const l of m.getStyle().layers) { if (l.type !== 'background' && !keep.test(l.id)) { m.setLayoutProperty(l.id, 'visibility', 'none'); hidden++; } }
    return hidden; })()`);
}
async function framesFromPage(ctx) {
  const js = `(() => {
    const s = window.__precipSources();
    const enc = (u8) => { let out = ''; for (let i = 0; i < u8.length; i += 65536) out += String.fromCharCode.apply(null, u8.subarray(i, i + 65536)); return btoa(out); };
    const f0 = s.rv.frames.find((f) => f.leadMinutes === 0) ?? s.rv.frames[0];
    const i0 = s.inca.frames.reduce((a, f) => (Math.abs(f.leadHours) < Math.abs(a.leadHours) ? f : a), s.inca.frames[0]);
    return {
      rv: { runAtMs: s.rv.runAt.getTime(), lead: f0.leadMinutes, w: f0.width, h: f0.height, corners: s.rv.corners, b64: enc(f0.values), b64_2: f0.values2 ? enc(f0.values2) : null },
      inca: { lead: i0.leadHours, w: i0.width, h: i0.height, corners: s.inca.corners, b64: enc(i0.values), b64_2: i0.values2 ? enc(i0.values2) : null },
      rzc: { validAtMs: s.rzc.validAt.getTime(), w: s.rzc.width, h: s.rzc.height, corners: s.rzc.corners, b64: enc(s.rzc.values), b64_2: s.rzc.values2 ? enc(s.rzc.values2) : null },
      hd: s.hd,
    };
  })()`;
  const r = await ctx.evaluate(js);
  const dec = (s) => new Uint8Array(Buffer.from(s, 'base64'));
  const one = (x) => ({ ...x, values: dec(x.b64), values2: x.b64_2 ? dec(x.b64_2) : null });
  return { hd: r.hd, rv: one(r.rv), inca: one(r.inca), rzc: one(r.rzc) };
}
/** Identity of the frames the page holds right now (one string) — equal before and after a shot ⇒ the same slot set. */
async function stampsFromPage(ctx) {
  return ctx.evaluate(`(() => { const s = window.__precipSources(); const f0 = s.rv.frames.find((f) => f.leadMinutes === 0) ?? s.rv.frames[0];
    return [s.rv.runAt.getTime(), f0 && f0.values.length, s.inca.frames.length, s.inca.frames[0] && s.inca.frames[0].values[12345], s.inca.frames[0] && s.inca.frames[0].values[200000], s.rzc.validAt.getTime()].join('|'); })()`);
}
/** The 256 RGBA entries of the colour ramp exactly as the browser's canvas gradient produces them (`getColorRamp`). */
async function rampFromPage(ctx, rampStops = precipRainRamp) {
  const stops = JSON.stringify(rampStops);
  return ctx.evaluate(`(() => { const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 1; const c = canvas.getContext('2d');
    const g = c.createLinearGradient(0, 0, 256, 0); const stops = ${stops}; for (const k of Object.keys(stops)) g.addColorStop(+k, stops[k]);
    c.fillStyle = g; c.fillRect(0, 0, 256, 1); return Array.from(c.getImageData(0, 0, 256, 1).data); })()`);
}
async function camera(ctx) {
  return ctx.evaluate(`(() => { const m = window.__map; const c = m.getCenter(); const z = m.getZoom();
    const cv = m.getCanvas(); const w = cv.width, h = cv.height;
    const un = (x, y) => { const p = m.unproject([x, y]); return [p.lng, p.lat]; };
    return { lon: c.lng, lat: c.lat, zoom: z, w, h, corners: [un(0.5, 0.5), un(w - 0.5, 0.5), un(0.5, h - 0.5), un(w - 0.5, h - 0.5)], bearing: m.getBearing(), pitch: m.getPitch() }; })()`);
}
/** The WebGL canvas read back inside a render (preserveDrawingBuffer is off: only there the buffer still holds the frame). */
async function canvasPng(ctx) {
  const b64 = await ctx.evaluate(`new Promise((resolve) => { const m = window.__map; m.once('render', () => resolve(m.getCanvas().toDataURL('image/png').split(',')[1])); m.triggerRepaint(); })`);
  const buf = Buffer.from(b64, 'base64');
  const p = decodePng(buf);
  return { buf, width: p.width, height: p.height, data: toRgba(p) };
}
/** Hide the precipitation layers that are visible right now (returns their ids) / show exactly those again. */
async function hidePrecip(ctx) {
  return ctx.evaluate(`(() => { const m = window.__map; const out = [];
    for (const id of ['precip-rain-layer', 'precip-rain-hd-de', 'precip-rain-hd-at', 'precip-rain-hd-ch']) {
      if (m.getLayer(id) && (m.getLayoutProperty(id, 'visibility') ?? 'visible') !== 'none') { m.setLayoutProperty(id, 'visibility', 'none'); out.push(id); }
    } return out; })()`);
}
async function showPrecip(ctx, ids) {
  return ctx.evaluate(`(() => { const m = window.__map; for (const id of ${JSON.stringify(ids)}) m.setLayoutProperty(id, 'visibility', 'visible'); return true; })()`);
}

function unprojector(cam) {
  const worldSize = 512 * Math.pow(2, cam.zoom);
  const mercY = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * DEG / 2)) / (2 * Math.PI);
  const cy = mercY(cam.lat);
  return (x, y) => {
    const lon = cam.lon + ((x - cam.w / 2) / worldSize) * 360;
    const my = cy + (y - cam.h / 2) / worldSize;
    return [lon, (2 * Math.atan(Math.exp((0.5 - my) * 2 * Math.PI)) - Math.PI / 2) / DEG];
  };
}

/** The ramp as the shader reads it: 16 × 16 LINEAR texture at `rp = (fract(16t), floor(16t)/16)` → four-texel mix. */
function rampReader(entries) {
  const T = (e) => [entries[e * 4], entries[e * 4 + 1], entries[e * 4 + 2], entries[e * 4 + 3] / 255];
  return (t) => {
    const fx = 16 * (16 * t - Math.floor(16 * t)) - 0.5, r = Math.floor(16 * t);
    const c0 = Math.floor(fx), wx = fx - c0;
    const cols = [[clampI(c0, 16), 1 - wx], [clampI(c0 + 1, 16), wx]];
    const rows = [[clampI(r - 1, 16), 0.5], [clampI(r, 16), 0.5]];
    const out = [0, 0, 0, 0];
    for (const [rr, wr] of rows) for (const [cc, wc] of cols) { const e = T(rr * 16 + cc); for (let k = 0; k < 4; k++) out[k] += wr * wc * e[k]; }
    return out;
  };
}

/** Oracle: expected colour per pixel + which pixels count. `ramps` = { linear, log } readers; a grid's `log` flag picks one. */
function oracle(cam, grids, mode, filter, bgImg, ramps, edge = 'off') {
  const un = unprojector(cam);
  const pick = fastCountryPicker();
  const comp = mode === 'composite' ? compositeOf(grids) : null;
  const n = cam.w * cam.h;
  const expected = new Uint8Array(n * 3);
  const inside = new Uint8Array(n), wet = new Uint8Array(n);
  for (let y = 0; y < cam.h; y++) for (let x = 0; x < cam.w; x++) {
    const [lon, lat] = un(x + 0.5, y + 0.5);
    const i = y * cam.w + x;
    if (!inDach(lon, lat)) continue;
    inside[i] = 1;
    const g = comp ?? grids[pick(lat, lon)];
    const [u, v] = g.uv(lon, lat);
    let t = 0;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) t = sampleTex(g.values, g.W, g.H, u, v, filter, edge);
    // premultiplied space = what the GL blend (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) leaves in the buffer, whatever its alpha
    const ba = bgImg[i * 4 + 3] / 255;
    const bg = [bgImg[i * 4] * ba, bgImg[i * 4 + 1] * ba, bgImg[i * 4 + 2] * ba];
    if (t < 0.002) { expected.set(bg.map(Math.round), i * 3); continue; }
    wet[i] = 1;
    const c = (g.log ? ramps.log : ramps.linear)(Math.min(1, t)); const a = c[3] * OPACITY;
    for (let k = 0; k < 3; k++) expected[i * 3 + k] = Math.round(c[k] * a + bg[k] * (1 - a));
  }
  // the dim wash is the only legitimate background inside DACH: its most frequent colour; a pixel whose background differs
  // (the Länder-Maske's fill artefacts at Campione or the Zittau corner, V-HD-4) is not counted — the mask is not HD's
  const hist = new Map();
  for (let i = 0; i < n; i++) if (inside[i]) { const k = (bgImg[i * 4] << 16) | (bgImg[i * 4 + 1] << 8) | bgImg[i * 4 + 2]; hist.set(k, (hist.get(k) ?? 0) + 1); }
  let dimKey = 0, dimN = 0; for (const [k, c] of hist) if (c > dimN) { dimN = c; dimKey = k; }
  const dim = [(dimKey >> 16) & 255, (dimKey >> 8) & 255, dimKey & 255];
  const onDim = (i) => Math.max(Math.abs(bgImg[i * 4] - dim[0]), Math.abs(bgImg[i * 4 + 1] - dim[1]), Math.abs(bgImg[i * 4 + 2] - dim[2])) <= 8;
  const counted = new Uint8Array(n);
  for (let y = 2; y < cam.h - 2; y++) for (let x = 2; x < cam.w - 2; x++) {
    const i = y * cam.w + x; if (!inside[i] || !onDim(i)) continue;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (!inside[i + dy * cam.w + dx]) { ok = false; break; }
    counted[i] = ok ? 1 : 0;
  }
  return { expected, counted, wet, dim };
}

function compare(cam, shot, o, name) {
  const n = cam.w * cam.h;
  const diff = new Uint8Array(n * 4);
  let counted = 0, agree = 0, wetCounted = 0, wetAgree = 0, sumD = 0;
  for (let i = 0; i < n; i++) {
    const sa = shot[i * 4 + 3] / 255;
    const s = [shot[i * 4] * sa, shot[i * 4 + 1] * sa, shot[i * 4 + 2] * sa];   // premultiplied, like the oracle
    const g = (s[0] + s[1] + s[2]) / 3 * 0.35;
    diff[i * 4] = g; diff[i * 4 + 1] = g; diff[i * 4 + 2] = g; diff[i * 4 + 3] = 255;
    if (!o.counted[i]) continue;
    const d = Math.max(Math.abs(o.expected[i * 3] - s[0]), Math.abs(o.expected[i * 3 + 1] - s[1]), Math.abs(o.expected[i * 3 + 2] - s[2]));
    counted++; sumD += d; if (d <= TOL) agree++; else { diff[i * 4] = 255; diff[i * 4 + 1] = 0; diff[i * 4 + 2] = 0; }
    if (o.wet[i]) { wetCounted++; if (d <= TOL) wetAgree++; }
  }
  writeFileSync(join(OUT, `${name}.diff.png`), encodePng(cam.w, cam.h, diff, 4));
  return { counted, agreePct: +(100 * agree / Math.max(1, counted)).toFixed(3), wetCounted, wetAgreePct: +(100 * wetAgree / Math.max(1, wetCounted)).toFixed(3), meanDiff: +(sumD / Math.max(1, counted)).toFixed(2) };
}

/** Wettest 5 × 5 window (≥ 5 mm/h) inside DACH per country → window centre. */
function windowsOf(fr) {
  const out = []; const pick = fastCountryPicker(); const grids = gridsOf(fr);
  for (const c of ['DE', 'AT', 'CH']) {
    let best = null;
    for (let lat = 45.6; lat <= 55.2; lat += 0.05) for (let lon = 5.8; lon <= 17.2; lon += 0.07) {
      if (!inDach(lon, lat) || pick(lat, lon) !== c) continue;
      let s = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = nearestOf(grids[c], lon + dx * 0.014, lat + dy * 0.01); if (v != null && v >= 64) s += v; }
      if (!best || s > best.s) best = { c, lon: +lon.toFixed(3), lat: +lat.toFixed(3), s };
    }
    if (best && best.s > 0 && (!ONLY || ONLY.includes(c))) out.push(best);
  }
  return out;
}

const report = { at: new Date().toISOString(), base: BASE, zoom: ZOOM, tol: TOL, dualDir: DUAL_DIR, runs: [] };
const probe = await openPage(DUAL_DIR ? '?hd=nearest&hdv2=1' : '?hd=nearest');
await waitForFrames(probe, true);
const probeFrames = await framesFromPage(probe);
const ramps = { linear: rampReader(await rampFromPage(probe, precipRainRamp)), log: rampReader(await rampFromPage(probe, precipRainRampLog)) };
await probe.close();
const windows = windowsOf(probeFrames);
report.slot = { rvRunAtMs: probeFrames.rv.runAtMs, rzcValidAtMs: probeFrames.rzc.validAtMs, rvHasLogPlane: !!probeFrames.rv.values2 };
report.windows = windows;
console.log('windows', JSON.stringify(windows), DUAL_DIR ? `· RV-Log-Ebene in der Seite: ${!!probeFrames.rv.values2}` : '');

const VARIANTS = EDGE ? [
  { q: '?hd=catmull&hdedge=1', tag: 'edge-round', mode: 'native', filter: 'catmull', plane: 2, edge: 'round' },
  { q: '?hd=catmull&hdedge=nearest', tag: 'edge-nearest', mode: 'native', filter: 'catmull', plane: 2, edge: 'nearest' },
  { q: '?hd=catmull', tag: 'edge-off', mode: 'native', filter: 'catmull', plane: 2, edge: 'off' },
] : DUAL_DIR ? [
  { q: '?hd=nearest&hdv2=1', tag: 'hd-nearest-dual', mode: 'native', filter: 'nearest', plane: 2 },
  { q: '?hd=catmull&hdv2=1', tag: 'hd-catmull-dual', mode: 'native', filter: 'catmull', plane: 2 },
  { q: '?hd=nearest&hdv2=1', tag: 'hd-nearest-dual-vs-linear', mode: 'native', filter: 'nearest', plane: 1 },   // negative control: linear oracle must agree less
] : [
  { q: '?hd=nearest', tag: 'hd-nearest', mode: 'native', filter: 'nearest' },
  { q: '?hd=catmull', tag: 'hd-catmull', mode: 'native', filter: 'catmull' },
  { q: '', tag: 'head', mode: 'composite', filter: 'bspline' },
];
for (const w of windows) {
  if (DUAL_DIR && w.c !== 'DE') continue;   // the local dual slot is RV only
  for (const variant of VARIANTS) {
    const ctx = await openPage(variant.q);
    const st = await waitForFrames(ctx, variant.mode === 'native');
    await flattenBasemap(ctx);
    await ctx.evaluate(`(() => { window.__map.jumpTo({ center: [${w.lon}, ${w.lat}], zoom: ${ZOOM}, bearing: 0, pitch: 0 }); return true; })()`);
    await sleep(3000);
    const name = `${w.c}-z${ZOOM}-${variant.tag}`;
    // the sources refresh every 5 min: frames, background and shot must belong to ONE slot set — re-read the stamps after
    // the shot and repeat when a source changed in between
    let fr, cam, bgShot, shot, shown, attempts = 0;
    for (;;) {
      attempts++;
      const before = await stampsFromPage(ctx);
      fr = await framesFromPage(ctx);
      cam = await camera(ctx);
      shown = await hidePrecip(ctx); await sleep(300);
      bgShot = await canvasPng(ctx);
      await showPrecip(ctx, shown); await sleep(1500);
      shot = await canvasPng(ctx);
      const after = await stampsFromPage(ctx);
      if (after === before || attempts >= 4) { if (after !== before) console.log(`  (Quellenwechsel während der Aufnahme, ${attempts} Versuche)`); break; }
      await sleep(1500);
    }
    writeFileSync(join(OUT, `${name}.png`), shot.buf);
    if (shot.width !== cam.w || shot.height !== cam.h) throw new Error(`shot ${shot.width}×${shot.height} ≠ canvas ${cam.w}×${cam.h}`);
    const un = unprojector(cam);
    const worldSize = 512 * Math.pow(2, cam.zoom);
    const cornerErrPx = Math.max(...[[0.5, 0.5], [cam.w - 0.5, 0.5], [0.5, cam.h - 0.5], [cam.w - 0.5, cam.h - 0.5]].map(([x, y], k) => {
      const [lo, la] = un(x, y); const [mlo, mla] = cam.corners[k];
      return Math.hypot((lo - mlo) / 360 * worldSize, (la - mla) * DEG / (2 * Math.PI) / Math.cos(la * DEG) * worldSize);
    }));
    const grids = gridsOf(fr, variant.plane ?? 1);
    const o = oracle(cam, grids, variant.mode, variant.filter, bgShot.data, ramps, variant.edge ?? 'off');
    const r = compare(cam, shot.data, o, name);
    let control = null;
    // RS: the other rule's oracle as control (edge canvas vs. the old algebra and back) + the halo on the canvas itself
    if (variant.edge) {
      const other = oracle(cam, grids, variant.mode, variant.filter, bgShot.data, ramps, variant.edge === 'off' ? 'round' : 'off');
      control = compare(cam, shot.data, other, `${name}.vs-${variant.edge === 'off' ? 'round' : 'off'}`);
      const un2 = unprojector(cam), pick2 = fastCountryPicker();
      let drawn = 0, halo = 0;
      for (let y = 0; y < cam.h; y++) for (let x = 0; x < cam.w; x++) {
        const i = y * cam.w + x; if (!o.counted[i]) continue;
        const d = Math.max(Math.abs(shot.data[i * 4] - bgShot.data[i * 4]), Math.abs(shot.data[i * 4 + 1] - bgShot.data[i * 4 + 1]), Math.abs(shot.data[i * 4 + 2] - bgShot.data[i * 4 + 2]));
        if (d <= TOL) continue;
        drawn++;
        const [lon, lat] = un2(x + 0.5, y + 0.5);
        const v = nearestOf(grids[pick2(lat, lon)], lon, lat);
        if (!v) halo++;
      }
      r.canvasHalo = { drawnPx: drawn, haloPx: halo, haloPct: +(100 * halo / Math.max(1, drawn)).toFixed(3) };
    }
    if (variant.mode === 'composite') { const on = oracle(cam, grids, 'native', 'nearest', bgShot.data, ramps); control = compare(cam, shot.data, on, `${name}.vs-native`); }
    const row = { window: w, variant: variant.tag, masks: st.masks, hd: fr.hd, logPlane: { DE: !!fr.rv.values2, AT: !!fr.inca.values2, CH: !!fr.rzc.values2 }, layersShown: shown, cam: { lon: cam.lon, lat: cam.lat, zoom: cam.zoom, w: cam.w, h: cam.h, cornerErrPx: +cornerErrPx.toFixed(3) }, oracle: r, ...(control ? { nativeOracleAsControl: control } : {}) };
    report.runs.push(row);
    console.log(`${name.padEnd(28)} Orakel (${variant.mode}/${variant.filter}${variant.plane === 2 ? '/log' : ''}${variant.edge ? `/edge ${variant.edge}` : ''}): ${r.agreePct} % von ${r.counted} px (nass ${r.wetAgreePct} % von ${r.wetCounted}, mittl. |Δ| ${r.meanDiff})${control ? ` · Gegenprobe ${variant.edge ? 'andere Regel' : 'nativ-nearest'}: ${control.agreePct} % (nass ${control.wetAgreePct} %)` : ''}${r.canvasHalo ? ` · Canvas: ${r.canvasHalo.drawnPx} px gezeichnet, davon ${r.canvasHalo.haloPx} (${r.canvasHalo.haloPct} %) über trockenem Pixel` : ''} · Kamera ${cornerErrPx.toFixed(2)} px`);
    await ctx.close();
  }
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
await Promise.race([browser.close(), sleep(5000)]);
process.exit(0);
