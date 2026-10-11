#!/usr/bin/env node
/**
 * GL-2 — Sentinel-2 scan of the glacier line (plan §7): snow share, snow line (class A), AAR, albedo per glacier and clear scene.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/sat-scan.mjs \
 *        --data=<v1 dir of the data repo> --out=<dir for the new files> [--patch=<dir for index/status patch + report>] \
 *        [--hours=72 | --from=YYYY-MM-DD --to=YYYY-MM-DD] [--tiles=32TPS,…] [--only=<glacier ids>] [--limit-scenes=N] [--force]
 *
 * Flow per run: static tree (catalogue, outlines L3, elevation grids) → STAC search over the DACH box → one item per tile and day →
 * coarse SCL (160 m) to skip hopeless scenes → per glacier: SCL + B03 (20 m overview) + B11, the clear rule (≥ 70 %), then the
 * albedo bands → value rules (quarantine instead of an outlier) → `obs/<year>/<tile>/<date>.json` (immutable name; a tile-day that
 * already exists in the data repo is not read again) → season series per region with the derived new-snow flag.
 * Class C and Germany never get a value (`glacierSatClass`). The result of a failed glacier is a named reason, never a number.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { stacSearchAll, assetGeo, readWindow, cogHeader, makeTileCache, net } from './lib/s2cog.mjs';
import { pixelBBox, rasterizeMask } from './lib/raster.mjs';
import { pxToLonLat } from './lib/s2cog.mjs';
import { reflect, evaluateGlacier, slaInRange, sceneEncodingSuspect, medianP01, tileRedP05, tileOffsetOf, S2_SCALE, S2_OFFSET, S2_OFFSET_ON } from './lib/satcore.mjs';
import {
  GLACIER_SAT_MIN_CLEAR, GLACIER_NDSI_SNOW, GLACIER_SNOW_GREEN_MIN, GLACIER_SNOW_COVERED_MIN, GLACIER_SNOW_FREE_MAX, GLACIER_SLA_MARGIN_M,
  glacierSatClass, demDecode, demSample, obsProblems, glacierObsPath, glacierSeasonPath, glacierDemFile, glacierFlagsMask, GLACIER_SEASON_COLS,
} from '../../src/glacier/glacierSatContract.ts';
import { glacierOutlineFile, glacierStaticPath } from '../../src/glacier/glacierContract.ts';

export const SAT_BBOX = [5.9, 45.7, 13.9, 47.95];
export const SAT_MAX_SCENE_CLOUD = 98;       // set: scenes with more cloud cover than this are not read at all
export const SAT_GLACIER_PARALLEL = 6;        // glaciers of one scene read in parallel (the tile cache de-duplicates shared blocks)
export const SAT_COARSE_LEVEL = 3;            // 160 m SCL for the pre-filter
export const SAT_COARSE_MIN_VALID = 0.4;      // set: share of coarse pixels around the glacier that must not be cloud/shadow
export const SAT_FALLBACK_P01 = 0.095;         // window guard when the tile has no vegetation evidence: median B11 p01 at offset 0 from here ⇒ try −0.1
export const SAT_CHECK_P01 = 0.12;             // window guard as a CHECK of the tile decision (bare ice reaches 0.08–0.10 without any offset)
export const SAT_NEW_SNOW = { dSla: -150, dSnow: 0.3, withinDays: 10, months: [6, 10] };   // set: derived flag of the season series
const ASSETS = ['scl', 'green', 'swir16', 'blue', 'red', 'nir', 'swir22'];
const dayMs = 86_400_000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * Two acquisitions of one tile on one day (S2A and S2B, ten minutes apart in the overlap of two swaths) are independent observations of the same
 * day. A glacier is read in ONE of them: the one that sees it most centrally, a tie goes to the item with less no-data, then less scene cloud, then the id.
 */
export function compareItems(a, b) {
  const k = (x) => [Number(x.properties['s2:nodata_pixel_percentage'] ?? 100), Number(x.properties['eo:cloud_cover'] ?? 100)];
  const [na, ca] = k(a), [nb, cb] = k(b);
  return na - nb || ca - cb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// --- static inputs -------------------------------------------------------------------------------------------------
export function loadStatic(dataDir) {
  const index = readJson(join(dataDir, 'index.json'));
  const build = index.static.build;
  const cat = readJson(join(dataDir, glacierStaticPath(build, 'catalog.json'))).glaciers;
  const byRegion = new Map();
  for (const g of cat) { const k = glacierSatClass(g); if (k) { (byRegion.get(g.region) ?? byRegion.set(g.region, []).get(g.region)).push({ ...g, satClass: k }); } }
  return { build, cat, byRegion, regionOf: (id) => cat.find((g) => g.id === id)?.region };
}
export function loadRegion(dataDir, build, region) {
  const outl = readJson(join(dataDir, glacierStaticPath(build, glacierOutlineFile(region, 3))));
  const dem = readJson(join(dataDir, glacierStaticPath(build, glacierDemFile(region))));
  return { outline: new Map(outl.features.map((f) => [f.properties.id, f.geometry])), dem: dem.glaciers };
}

/** Window, mask and per-pixel elevation of one glacier on the grid of one scene (cached per tile transform). */
export function prepGlacier(sclGeo, geometry, demGrid, z) {
  const bb = pixelBBox(sclGeo, geometry);
  const px0 = Math.floor(bb.x0) - 1, py0 = Math.floor(bb.y0) - 1;
  const w = Math.ceil(bb.x1) - px0 + 2, h = Math.ceil(bb.y1) - py0 + 2;
  const mask = rasterizeMask(sclGeo, geometry, px0, py0, w, h);
  const elev = new Float32Array(w * h).fill(NaN);
  let nMask = 0;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c;
    if (!mask[i]) continue;
    nMask++;
    const ll = pxToLonLat(sclGeo, px0 + c + 0.5, py0 + r + 0.5);
    const v = ll ? demSample(demGrid, z, ll.lon, ll.lat) : null;
    if (v != null) elev[i] = v;
  }
  const inside = px0 >= 0 && py0 >= 0 && px0 + w <= sclGeo.shape[1] && py0 + h <= sclGeo.shape[0];
  const margin = Math.min(px0, py0, sclGeo.shape[1] - (px0 + w), sclGeo.shape[0] - (py0 + h));
  return { px0, py0, w, h, mask, elev, nMask, inside, margin };
}

// --- one scene -----------------------------------------------------------------------------------------------------
export async function scanScene({ item, jobs, log = () => {} }) {
  const geo = Object.fromEntries(ASSETS.map((k) => [k, assetGeo(item, k)]));
  if (ASSETS.some((k) => !geo[k])) return { error: 'Assets fehlen' };
  const ifds = {};
  const hdr = async (k) => (ifds[k] ??= await cogHeader(geo[k].href));
  const cache = makeTileCache(120);
  // coarse SCL of the whole tile → skip glaciers whose surroundings are all cloud
  const ifd0 = await hdr('scl');
  const lv = [...ifd0].sort((a, b) => b.width - a.width)[SAT_COARSE_LEVEL];
  const factor = ifd0.reduce((m, i) => Math.max(m, i.width), 0) / lv.width;
  const coarse = await readWindow(geo.scl, 0, 0, lv.width, lv.height, { ifds: ifd0, level: SAT_COARSE_LEVEL, cache });
  const coarseValid = (prep) => {
    const x0 = Math.max(0, Math.floor(prep.px0 / factor) - 3), x1 = Math.min(lv.width, Math.ceil((prep.px0 + prep.w) / factor) + 3);
    const y0 = Math.max(0, Math.floor(prep.py0 / factor) - 3), y1 = Math.min(lv.height, Math.ceil((prep.py0 + prep.h) / factor) + 3);
    let n = 0, ok = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const c = coarse.data[y * coarse.w + x]; n++; if (c !== 0 && c !== 1 && c !== 3 && c !== 8 && c !== 9 && c !== 10) ok++; }
    return n ? ok / n : 0;
  };
  const sun = item.properties['view:sun_elevation'] ?? null;
  // DN offset of THIS tile-day, from the vegetation of the whole tile (coarse red against the coarse SCL; see satcore)
  const redIfd = await hdr('red');
  const redLv = [...redIfd].sort((a, b) => b.width - a.width)[SAT_COARSE_LEVEL + 1];
  const redCoarse = redLv && redLv.width === lv.width ? await readWindow(geo.red, 0, 0, redLv.width, redLv.height, { ifds: redIfd, level: SAT_COARSE_LEVEL + 1, cache }) : null;
  const veg = redCoarse ? tileRedP05(coarse.data, redCoarse.data) : { n: 0, p5: null };
  const tileOffset = tileOffsetOf(veg);

  /** All glaciers of the scene at one DN offset. */
  const runAll = async (offset) => {
    const out = { items: {}, skipped: [] };
    const p01s = [];
    const one = async ({ g, prep }) => {
      try {
        const cv = coarseValid(prep);
        if (cv < SAT_COARSE_MIN_VALID) { out.skipped.push({ id: g.id, reason: `bewölkt (grobe Maske, ${(cv * 100).toFixed(0)} % gültig)` }); return; }
        const win = (k, level = 0) => hdr(k).then((i) => readWindow(geo[k], prep.px0, prep.py0, prep.px0 + prep.w, prep.py0 + prep.h, { ifds: i, level, cache }));
        const [scl, green, swir] = await Promise.all([win('scl'), win('green', 1), win('swir16')]);
        const pack = {
          w: prep.w, h: prep.h, mask: prep.mask, elev: prep.elev, scl: scl.data,
          green: reflect(green.data, S2_SCALE, offset), swir: reflect(swir.data, S2_SCALE, offset),
        };
        const need = async (p) => {
          const [b, r, n, s2] = await Promise.all([win('blue', 1), win('red', 1), win('nir', 1), win('swir22')]);
          p.blue = reflect(b.data, S2_SCALE, offset); p.red = reflect(r.data, S2_SCALE, offset); p.nir = reflect(n.data, S2_SCALE, offset); p.swir2 = reflect(s2.data, S2_SCALE, offset);
        };
        // albedo only for class A (the albedo anomaly of class B needs a multi-year baseline we do not have yet; 4 of 7 bands saved)
        const res = await evaluateGlacier(pack, { klass: g.satClass, debris: g.debris, sunElevation: sun }, g.satClass === 'A' ? need : null);
        if (res.skipped) { out.skipped.push({ id: g.id, reason: res.skipped }); return; }
        const v = res.value;
        if (v.sla != null && !slaInRange(v.sla, g.z)) { out.skipped.push({ id: g.id, reason: `Quarantäne: Schneegrenze ${v.sla} m außerhalb [${g.z[0]} − 300, ${g.z[2]} + 300]` }); return; }
        out.items[g.id] = v;
        p01s.push(res.swirP01);
      } catch (e) { out.skipped.push({ id: g.id, reason: `Lesefehler: ${String(e.message ?? e).slice(0, 80)}` }); }
    };
    const queue = [...jobs];
    await Promise.all(Array.from({ length: SAT_GLACIER_PARALLEL }, async () => { for (;;) { const j = queue.shift(); if (!j) return; await one(j); } }));
    return { out, p01s, offset, p01: medianP01(p01s) };
  };

  // The tile evidence decides; the glacier-window guard is the CHECK of that decision (limit 0.12: bare ice alone reaches 0.08–0.10) or, when the tile has no
  // evidence (too little vegetation in the swath), the fallback: try offset 0, and when the windows look shifted (median p01 ≥ 0.095) once more with −0.1.
  let r = await runAll(tileOffset ?? S2_OFFSET);
  let how = tileOffset == null ? 'fenster' : 'kachel';
  if (tileOffset == null && r.p01 != null && r.p01 >= SAT_FALLBACK_P01) {
    const r2 = await runAll(S2_OFFSET_ON);
    if (r2.p01 != null && r2.p01 < SAT_FALLBACK_P01) { r = r2; how = 'fenster'; }
  }
  if (r.p01 != null && r.p01 >= (tileOffset == null ? SAT_FALLBACK_P01 : SAT_CHECK_P01)) {
    return { error: `Kodierung unplausibel (B11-p01 ${r.p01.toFixed(3)} bei Versatz ${r.offset}, Rot-p5 der Vegetation ${veg.p5}, Entscheid ${how})` };
  }
  r.out.encoding = { vegPixels: veg.n, redP5: veg.p5, offset: r.offset, by: how, p01: r.p01 == null ? null : Math.round(r.p01 * 1000) / 1000 };
  return r.out;
}

// --- season series -------------------------------------------------------------------------------------------------
const STATE_INT = { 'snow-covered': 0, snowline: 1, 'snow-free': 2 };
/** Rows per glacier from all observation docs of one year; adds the derived `neuschnee` flag. */
export function buildSeasonRows(docs) {
  const by = new Map();
  for (const d of docs) for (const [id, v] of Object.entries(d.items)) {
    const row = [d.date, v.clear, v.snow, STATE_INT[v.state], v.sla ?? null, v.aar ?? null, v.alb?.snow ?? null, v.alb?.ice ?? null, glacierFlagsMask(v.flags)];
    const list = by.get(id) ?? by.set(id, []).get(id);
    const same = list.findIndex((r) => r[0] === d.date);
    if (same < 0) list.push(row); else if (row[1] > list[same][1]) list[same] = row;
  }
  for (const [, rows] of by) {
    rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      const dt = (Date.parse(b[0]) - Date.parse(a[0])) / dayMs;
      const month = Number(b[0].slice(5, 7));
      if (dt > SAT_NEW_SNOW.withinDays || month < SAT_NEW_SNOW.months[0] || month > SAT_NEW_SNOW.months[1]) continue;
      const dSla = a[4] != null && b[4] != null ? b[4] - a[4] : 0;
      if (dSla <= SAT_NEW_SNOW.dSla || b[2] - a[2] >= SAT_NEW_SNOW.dSnow) b[8] |= glacierFlagsMask(['neuschnee']);
    }
  }
  return by;
}

const listObs = (dir) => {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const y of readdirSync(dir)) for (const t of readdirSync(join(dir, y))) for (const f of readdirSync(join(dir, y, t))) out.push({ year: Number(y), tile: t, date: f.replace(/\.json$/, ''), path: join(dir, y, t, f) });
  return out;
};

// --- main ------------------------------------------------------------------------------------------------------------
export async function main(opts) {
  const t0 = Date.now();
  const data = opts.data, outDir = opts.out, patchDir = opts.patch ?? join(dirname(outDir), 'patch');
  const st = loadStatic(data);
  const nowMs = opts.nowMs ?? Date.now();
  const to = opts.to ? Date.parse(opts.to + 'T23:59:59Z') : nowMs;
  const from = opts.from ? Date.parse(opts.from + 'T00:00:00Z') : to - (Number(opts.hours ?? 72) * 3_600_000);
  const only = opts.onlyFile ? new Set(readFileSync(opts.onlyFile, 'utf8').split(/[\s,]+/).filter(Boolean)) : opts.only ? new Set(String(opts.only).split(',')) : null;
  const tileFilter = opts.tiles ? new Set(String(opts.tiles).split(',')) : null;
  const body = { collections: ['sentinel-2-l2a'], bbox: SAT_BBOX, datetime: `${new Date(from).toISOString().slice(0, 19)}Z/${new Date(to).toISOString().slice(0, 19)}Z`, limit: 200, sortby: [{ field: 'properties.datetime', direction: 'asc' }], query: { 'eo:cloud_cover': { lt: Number(opts.maxCloud ?? SAT_MAX_SCENE_CLOUD) } } };
  let feats;
  try { feats = await stacSearchAll(body); } catch { delete body.query; feats = (await stacSearchAll(body)).filter((f) => (f.properties['eo:cloud_cover'] ?? 0) < Number(opts.maxCloud ?? SAT_MAX_SCENE_CLOUD)); }
  // items per tile and day: a tile can arrive as two granules of one day that cover different parts of it; of two processings of
  // the SAME granule (same datatake and sensing start) the newest one counts
  const best = new Map();
  for (const f of feats) {
    const tile = String(f.properties['grid:code'] ?? '').replace('MGRS-', '');
    if (!tile || (tileFilter && !tileFilter.has(tile))) continue;
    const key = `${tile}|${f.properties.datetime.slice(0, 10)}`;
    const list = best.get(key) ?? best.set(key, []).get(key);
    const granule = (x) => `${x.properties['s2:datatake_id']}|${x.properties.datetime}`;
    const same = list.findIndex((x) => granule(x) === granule(f));
    if (same < 0) list.push(f);
    else if (String(f.properties.updated ?? '') > String(list[same].properties.updated ?? '')) list[same] = f;
  }
  const existing = new Set([...listObs(join(data, 'obs')), ...listObs(join(outDir, 'obs'))].map((o) => `${o.tile}|${o.date}`));   // data repo + earlier passes of this out dir
  const todo = [...best.entries()].filter(([k]) => opts.force || !existing.has(k)).sort(([a], [b]) => (a.split('|')[1] < b.split('|')[1] ? -1 : 1));
  const limited = opts.limitScenes ? todo.slice(0, Number(opts.limitScenes)) : todo;
  console.log(`STAC: ${feats.length} Items, ${best.size} Kachel-Tage, ${todo.length} neu${opts.limitScenes ? `, ${limited.length} begrenzt` : ''}`);

  // static per region, lazily
  const regionCache = new Map();
  const region = (r) => regionCache.get(r) ?? regionCache.set(r, loadRegion(data, st.build, r)).get(r);
  const prepCache = new Map();   // transform|id → prep
  const demCache = new Map();    // id → Int16Array
  const classes = new Set(String(opts.classes ?? 'A,B').split(','));
  const sats = [...st.byRegion.values()].flat().filter((g) => (!only || only.has(g.id)) && classes.has(g.satClass));
  const report = { scenesRead: 0, scenesFailed: [], valued: 0, skipped: {}, tileDays: 0 };
  const docs = [];
  const catIds = new Map(st.cat.map((g) => [g.id, g]));
  const jobsOf = (item) => {
    const sclGeo = assetGeo(item, 'scl');
    if (!sclGeo) return null;
    const tkey = `${sclGeo.epsg}|${sclGeo.transform.join(',')}`;
    const jobs = [];
    for (const g of sats) {
      const bb = item.bbox;
      if (g.lon < bb[0] || g.lon > bb[2] || g.lat < bb[1] || g.lat > bb[3]) continue;     // cheap pre-check: centre inside the tile's lon/lat box
      const pk = `${tkey}|${g.id}`;
      let prep = prepCache.get(pk);
      if (prep === undefined) {
        const rg = region(g.region);
        const geom = rg.outline.get(g.id), dg = rg.dem[g.id];
        if (!geom || !dg) { prepCache.set(pk, null); continue; }
        if (!demCache.has(g.id)) demCache.set(g.id, demDecode(dg));
        prep = prepGlacier(sclGeo, geom, dg, demCache.get(g.id));
        prepCache.set(pk, prep);
      }
      if (prep && prep.inside) jobs.push({ g, prep });
    }
    return jobs;
  };
  // day by day: a glacier is read in the tile that sees it most centrally (tiles overlap by ~5 km), once
  const days = [...new Set(limited.map(([k]) => k.split('|')[1]))].sort();
  for (const date of days) {
    const todayKeys = limited.filter(([k]) => k.endsWith('|' + date));
    const perItem = new Map();
    for (const [key, items] of todayKeys) for (const item of items) {
      try { perItem.set(item.id, jobsOf(item)); } catch (e) { perItem.set(item.id, null); report.scenesFailed.push({ key, why: String(e.message ?? e).slice(0, 120) }); }
    }
    const owner = new Map();
    const itemById = new Map(todayKeys.flatMap(([, items]) => items.map((x) => [x.id, x])));
    for (const [id, jobs] of perItem) for (const { g, prep } of jobs ?? []) { const c = owner.get(g.id); if (!c || prep.margin > c.margin || (prep.margin === c.margin && compareItems(itemById.get(id), itemById.get(c.id)) < 0)) owner.set(g.id, { id, margin: prep.margin }); }
    const processKey = async ([key, items]) => {
      const tile = key.split('|')[0];
      try {
        const sc = { items: {}, skipped: [] };
        const ids = [], encs = [];
        for (const item of items) {
          const jobs = perItem.get(item.id);
          if (!jobs) continue;
          const mine = jobs.filter(({ g }) => owner.get(g.id)?.id === item.id);
          if (!mine.length) continue;
          const r = await scanScene({ item, jobs: mine });
          if (r.error) throw new Error(r.error);
          Object.assign(sc.items, r.items); sc.skipped.push(...r.skipped); ids.push(item.id); encs.push({ scene: item.id, ...r.encoding });
        }
        if (!ids.length) return;
        const item = items.find((x) => x.id === ids[0]);
        const doc = {
          schema: 1, kind: 'glacier/obs', tile, date, time: item.properties.datetime, scene: ids.join('+'), sunElevation: item.properties['view:sun_elevation'] ?? null,
          params: {
            minClear: { v: GLACIER_SAT_MIN_CLEAR, origin: 'set' }, ndsiSnow: { v: GLACIER_NDSI_SNOW, origin: 'literature' }, snowGreenMin: { v: GLACIER_SNOW_GREEN_MIN, origin: 'set' },
            snowCovered: { v: GLACIER_SNOW_COVERED_MIN, origin: 'set' }, snowFree: { v: GLACIER_SNOW_FREE_MAX, origin: 'set' }, slaMargin: { v: GLACIER_SLA_MARGIN_M, origin: 'set' },
          },
          encoding: encs, items: Object.fromEntries(Object.entries(sc.items).sort(([a], [b]) => (a < b ? -1 : 1))), skipped: sc.skipped,
        };
        const bad = obsProblems(doc, catIds);
        if (bad.length) { for (const m of bad.slice(0, 5)) console.log('  Regel verletzt:', m); throw new Error('obsProblems: ' + bad[0]); }
        mkdirSync(join(outDir, 'obs', date.slice(0, 4), tile), { recursive: true });
        writeFileSync(join(outDir, glacierObsPath(date.slice(0, 4), tile, date)), JSON.stringify(doc));
        docs.push(doc);
        report.scenesRead++; report.valued += Object.keys(doc.items).length; report.tileDays++;
        for (const s of doc.skipped) { const k = s.reason.replace(/\d+/g, 'N').slice(0, 40); report.skipped[k] = (report.skipped[k] ?? 0) + 1; }
        console.log(`${date} ${tile}: ${Object.keys(doc.items).length} Werte, ${doc.skipped.length} übersprungen (${(net.bytes / 1048576).toFixed(0)} MB, ${net.requests} Req.)`);
      } catch (e) {
        report.scenesFailed.push({ key, why: String(e.message ?? e).slice(0, 120) });
        console.log(`${date} ${tile}: FEHLER ${String(e.message ?? e).slice(0, 100)}`);
      }
    };
    // tiles of one day in parallel (own tile cache each); days stay in order
    const queue = [...todayKeys];
    await Promise.all(Array.from({ length: Math.max(1, Number(opts.concurrency ?? 3)) }, async () => { for (;;) { const e = queue.shift(); if (!e) return; await processKey(e); } }));
  }
  // season series for every region/year with new rows
  const all = [...listObs(join(data, 'obs')), ...listObs(join(outDir, 'obs'))];
  const seen = new Set(), obsDocs = [];
  for (const o of all) { const k = `${o.tile}|${o.date}`; if (seen.has(k)) continue; seen.add(k); obsDocs.push(readJson(o.path)); }
  const years = new Set(docs.map((d) => Number(d.date.slice(0, 4))));
  const stand = new Date(nowMs).toISOString().replace(/[-:]/g, '').slice(0, 13) + 'Z';
  const stamp = `${stand.slice(0, 8)}T${stand.slice(9, 13)}Z`;
  const seasons = {};
  const catById = new Map(st.cat.map((g) => [g.id, g]));
  for (const year of years) {
    const rows = buildSeasonRows(obsDocs.filter((d) => d.date.startsWith(String(year))));
    const byRegion = new Map();
    for (const [id, r] of rows) { const rg = catById.get(id)?.region; if (rg) (byRegion.get(rg) ?? byRegion.set(rg, {}).get(rg))[id] = r; }
    for (const [rg, gl] of byRegion) {
      const sdoc = { schema: 1, kind: 'glacier/season', year, region: rg, stand: stamp, builtAt: new Date(nowMs).toISOString().slice(0, 19) + 'Z', cols: [...GLACIER_SEASON_COLS], glaciers: gl };
      const p = join(outDir, glacierSeasonPath(year, rg, stamp));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify(sdoc));
      (seasons[year] ??= {})[rg] = stamp;
    }
  }
  const newest = {};
  for (const d of obsDocs) if (!newest[d.tile] || d.date > newest[d.tile]) newest[d.tile] = d.date;
  mkdirSync(patchDir, { recursive: true });
  const upd = new Date(nowMs).toISOString().slice(0, 19) + 'Z';
  if (docs.length) {
    writeFileSync(join(patchDir, 'index-patch.json'), JSON.stringify({ sat: { updatedAt: upd, newest, seasons } }));
    writeFileSync(join(patchDir, 'status-patch.json'), JSON.stringify({ lines: { sat: { at: upd, tileDays: report.tileDays, values: report.valued, requests: net.requests, mb: Math.round(net.bytes / 104857.6) / 10 } } }));
  }
  report.seconds = Math.round((Date.now() - t0) / 1000); report.requests = net.requests; report.mb = Math.round(net.bytes / 104857.6) / 10;
  writeFileSync(join(patchDir, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ tileDays: report.tileDays, valued: report.valued, failed: report.scenesFailed.length, mb: report.mb, seconds: report.seconds }));
  return report;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('sat-scan.mjs')) {
  if (!args.data || !args.out) { console.error('--data=<v1> und --out=<Ordner> fehlen'); process.exit(2); }
  main({ data: args.data, out: args.out, patch: args.patch, hours: args.hours, from: args.from, to: args.to, tiles: args.tiles, only: args.only, onlyFile: args['only-file'], limitScenes: args['limit-scenes'], force: !!args.force, concurrency: args.concurrency, classes: args.classes, maxCloud: args['max-cloud'] })
    .then((r) => process.exit(r.scenesFailed.length && !r.tileDays ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
}
