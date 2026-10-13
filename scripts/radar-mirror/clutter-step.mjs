/**
 * Phase SE (`audit/radar-stoerecho.md` §6) — the echo filter of the radar mirror, called by `radar-derive.mjs` for an RV
 * slot when `RADAR_CLUTTER=1`: fetches the 17 px250 site images and the 17 URHOHV sweeps of the slot, builds the mask
 * of the analysis (`src/sources/radarClutter.ts`, the rule measured at stations) and takes the masked echoes out of the
 * LOG PLANE of every frame of the run (analysis + forecast). Nothing else of the slot is touched.
 *
 * Fail-open: any missing or unreadable input removes evidence, never echoes — a slot without site data leaves the
 * plane exactly as without the switch. An exception in here is caught by the caller and the slot is written unfiltered.
 *
 * Inputs come from the DWD, or from a directory in the collector's layout (`px250-<site>.h5`, `rhohv-<site>.h5`) named
 * by `RADAR_CLUTTER_DIR` — the verifier's and the replay's way. The px250 files fetched here are left in
 * `clutterSitesCache(stamp)` for the `hd250` step of the same slot (it would fetch the same 6,5 MB again).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import { PX250_SITES, px250Url, decodePx250 } from '../../src/sources/dwdPx250.ts';
import { decodeSweep, sweepLatestName, sweepNamesFromListing, SWEEP_BASE_URL, SWEEP_DIRS, SWEEP_KEYS } from '../../src/sources/dwdSweep.ts';
import {
  siteRho, siteLattice, sameScan, siteBlocks, clutterMask, applyClutterToRun, CLUTTER_RULE, RV_COLS, RV_ROWS,
} from '../../src/sources/radarClutter.ts';
import { RADAR_IMG_CLUTTER_FILE } from '../../src/sources/radarImg.ts';
import { encodePng } from '../lib/png.mjs';

const UA = { 'user-agent': 'buscosun-radar-mirror (buscosun-web/audit/radar-stoerecho.md)' };
const FETCH_MS = 10_000;
const CACHE_ROOT = join(tmpdir(), 'buscosun-px250');
/** zlib of Node instead of `DecompressionStream` — 20 × faster on these files, same bytes (§6.5). */
const inflate = (b) => inflateSync(b);

/** Where this step leaves the px250 files of a slot (`<site>.h5`) for the hd250 step. */
export function clutterSitesCache(stamp) { return join(CACHE_ROOT, stamp); }

async function fetchBuf(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: UA });
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch { return null; } finally { clearTimeout(timer); }
}
const fileBuf = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

/** The ρHV sweep of `site` for the slot: the LATEST alias if it is that scan, else the file the listing names. */
async function fetchSweep(site, slotMs) {
  const dir = `${SWEEP_BASE_URL}/${SWEEP_DIRS.rhohv(site.id)}`;
  const tryDecode = async (buf) => {
    if (!buf) return null;
    try { const sw = await decodeSweep(buf, { name: `${site.id}-rhohv.h5`, inflate }); return sw.slotMs === slotMs ? sw : null; } catch { return null; }
  };
  const latest = await tryDecode(await fetchBuf(dir + sweepLatestName(SWEEP_KEYS.rhohv, site)));
  if (latest) return latest;
  const html = await fetchBuf(dir);
  if (!html) return null;
  const minute = new Date(slotMs).toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const name = sweepNamesFromListing(new TextDecoder('latin1').decode(html), SWEEP_KEYS.rhohv).get(minute);
  return name ? tryDecode(await fetchBuf(dir + name)) : null;
}

/**
 * @param {{ stamp: string, slotMs: number, planes: Uint8Array[], leads: number[] }} run  log planes by ascending lead (lead 0 first), changed IN PLACE
 * @returns {Promise<{ clutter: import('../../src/sources/radarImg.ts').RadarImgClutter, png: Buffer | null, perLead: number[], ms: number }>}
 */
export async function clutterStep({ stamp, slotMs, planes, leads }) {
  const t0 = Date.now();
  if (leads[0] !== 0 || planes[0].length !== RV_COLS * RV_ROWS) throw new Error('clutter: Analyse (Lead 0) fehlt oder hat ein fremdes Raster');
  const localDir = process.env.RADAR_CLUTTER_DIR || '';
  const cache = clutterSitesCache(stamp);
  if (!localDir) {
    // drop the caches of older slots (a crashed hd250 step leaves one behind)
    try { for (const d of existsSync(CACHE_ROOT) ? readdirSync(CACHE_ROOT) : []) if (d !== stamp && Date.now() - statSync(join(CACHE_ROOT, d)).mtimeMs > 20 * 60_000) rmSync(join(CACHE_ROOT, d), { recursive: true, force: true }); } catch { /* cache only */ }
    mkdirSync(cache, { recursive: true });
  }
  const missing = [];
  const perSite = await Promise.all(PX250_SITES.map(async (site) => {
    let pxBuf, sweep = null;
    if (localDir) {
      const pg = join(localDir, `px250-${site.id}.h5`), ps = join(localDir, `rhohv-${site.id}.h5`);
      pxBuf = existsSync(pg) ? fileBuf(pg) : null;
      if (existsSync(ps)) { try { const sw = await decodeSweep(fileBuf(ps), { name: ps, inflate }); sweep = sw.slotMs === slotMs ? sw : null; } catch { sweep = null; } }
    } else {
      [pxBuf, sweep] = await Promise.all([fetchBuf(px250Url(site, stamp)), fetchSweep(site, slotMs)]);
      if (pxBuf) { try { writeFileSync(join(cache, `${site.id}.h5`), Buffer.from(pxBuf)); } catch { /* cache only */ } }
    }
    // no (readable) image of this slot ⇒ the site has no say at all
    if (!pxBuf) { missing.push(site.id); return null; }
    let g;
    try { g = await decodePx250(pxBuf, { name: `${site.id}.h5`, inflate }); } catch { missing.push(site.id); return null; }
    if (g.site !== site.id || g.timeMs !== slotMs) { missing.push(site.id); return null; }
    const ok = sweep && sameScan(g, sweep);
    if (!ok) missing.push(site.id);
    return siteBlocks(g, ok ? siteRho(g, sweep, siteLattice(g)) : null, ok ? sweep.dbz0 : NaN, CLUTTER_RULE);
  }));
  const blocks = perSite.filter(Boolean);
  const cm = clutterMask(planes[0], blocks, CLUTTER_RULE);
  const cells = cm.masked + cm.filled;
  const perLead = applyClutterToRun(planes, cm.mask);
  let png = null;
  if (cells > 0) {
    const img = new Uint8Array(cm.mask.length);
    for (let k = 0; k < img.length; k++) img[k] = cm.mask[k] ? 255 : 0;
    png = encodePng(RV_COLS, RV_ROWS, img, 1);
  }
  const clutter = {
    cells, wet: cm.wet, sites: blocks.filter((b) => b.hasSweep).length, missing,
    rule: { rhoMax: CLUTTER_RULE.rhoMax, zCapDbz: CLUTTER_RULE.zCapDbz, kernel: CLUTTER_RULE.kernel, fill: CLUTTER_RULE.fill, rhoMaxRich: CLUTTER_RULE.rhoMaxRich },
    ...(png ? { file: RADAR_IMG_CLUTTER_FILE, bytes: png.length } : {}),
  };
  return { clutter, png, perLead, ms: Date.now() - t0 };
}
