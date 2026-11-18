/**
 * Phase SG — the two hint columns of a spot (`s.conv`, `s.vis`, contract `src/sea/seaContract.ts`), built with every wind
 * computation of `sea-derive.mjs` (`audit/seewetter-sicht-konvektion.md`).
 *
 *   conv  thunder index (0–100, run + 0…12 h) and CAPE (run + 0…27 h) of the ICON-D2 repack ALREADY published in
 *         `buscosun-data/runs/<run>/`, read at the spot's water cell, with the rain chance of buscosun Fusion. Nothing is
 *         fetched from the DWD, the repack producer is untouched; an hour the repack does not cover has no class.
 *   vis   the humidity and precipitation parts of the road line's diagnosis (`src/road/vs/roadVsVis.ts`, only imported)
 *         on temperature, dew point and precipitation of buscosun Fusion at the spot. No fog part (no cloud water here),
 *         no `VIS` of ICON-D2 or RUC (the DWD removes it after 30.11.2026).
 *
 * buscosun Fusion is only READ (the steps `spotWind` computes anyway). Everything here fails soft: an unreadable index,
 * a run that is too old, a scale that drifted or a missing image leaves the column empty and names the reason in the
 * document block `sight` — the wind is written either way.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from '../lib/png.mjs';
import { quadCellIndex } from '../../src/pointForecast/quadSampler.ts';
import { hazeVisibilityM, precipVisibilityM } from '../../src/road/vs/roadVsVis.ts';
import { exceedance } from '../../src/pointForecast/fusion/dist.ts';
import {
  SEA_CONV, SEA_VIS, SEA_REPACK_SCALE, SEA_SPOT_STEPS, convClassOf, visCodeOf, emptySightColumns, hasSight, spotSightProblems, seaCellCentre,
} from '../../src/sea/seaContract.ts';

const H = 3_600_000;
const UA = 'buscosun-sea (buscosun-web/audit/seewetter-sicht-konvektion.md)';
export const REPACK_RAW_BASE = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
export const REPACK_SOURCE = 'Deutscher Wetterdienst, ICON-D2 (Gewitterpotenzial aus CAPE, CIN und LPI; CAPE) über buscosun-data/runs';

// --- where the repack is read from -------------------------------------------------------------------------

/** The published repack over raw.githubusercontent (no checkout: the workflow's cube clone does not carry `runs/`). */
export function httpRepack(base = REPACK_RAW_BASE, fetchImpl = fetch) {
  const get = async (path) => {
    const r = await fetchImpl(`${base}/${path}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
    return Buffer.from(await r.arrayBuffer());
  };
  return { kind: 'http', index: async () => JSON.parse((await get('index.json')).toString('utf8')), bytes: get };
}
/** The same files from a checkout or a fixture directory. */
export function dirRepack(dir) {
  const get = async (path) => { const f = join(dir, path); if (!existsSync(f)) throw new Error(`fehlt: ${path}`); return readFileSync(f); };
  return { kind: 'dir', index: async () => JSON.parse((await get('index.json')).toString('utf8')), bytes: get };
}

const runMsOf = (run) => { const m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(String(run)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) : NaN; };
const quadOf = (c) => (c && c.nw && c.ne && c.se && c.sw ? [c.nw, c.ne, c.se, c.sw] : null);
const stepsOf = (fam, maxLead) => new Map((Array.isArray(fam?.steps) ? fam.steps : [])
  .filter((s) => Number.isInteger(s?.step) && s.step >= 0 && s.step <= maxLead && typeof s.file === 'string' && /^[a-z0-9][a-z0-9._-]*\.png$/.test(s.file))
  .map((s) => [s.step, s.file]));

/**
 * The repack run to read: the newest entry of `index.json` that carries `thunder` or `cape` with the contract's scales
 * and a usable grid, not older than `SEA_CONV.maxRunAgeH` and not from the future. Otherwise `{ why }`.
 */
export function pickRepackRun(index, nowMs) {
  const runs = (Array.isArray(index?.runs) ? index.runs : []).filter((r) => typeof r?.run === 'string' && typeof r.path === 'string').sort((a, b) => (a.run < b.run ? 1 : -1));
  if (!runs.length) return { why: 'Der Index des ICON-D2-Repack nennt keinen Lauf.' };
  let why = null;
  for (const r of runs) {
    const runMs = runMsOf(r.run);
    if (!Number.isFinite(runMs) || runMs > nowMs + H) continue;
    if (nowMs - runMs > SEA_CONV.maxRunAgeH * H) { why ??= `Der neueste ICON-D2-Repack-Lauf (${r.run}) ist älter als ${SEA_CONV.maxRunAgeH} Stunden.`; break; }
    const scaleOk = (fam, want) => fam && fam.vMin === want[0] && fam.vMax === want[1];
    const thunder = scaleOk(r.thunder, SEA_REPACK_SCALE.thunder) && quadOf(r.grid?.corners) && r.grid.width > 0 && r.grid.height > 0
      ? { steps: stepsOf(r.thunder, SEA_CONV.thunderMaxLeadH), width: r.grid.width, height: r.grid.height, quad: quadOf(r.grid.corners) } : null;
    const cape = scaleOk(r.cape, SEA_REPACK_SCALE.cape) && quadOf(r.cape?.grid?.corners) && r.cape.grid.width > 0 && r.cape.grid.height > 0
      ? { steps: stepsOf(r.cape, SEA_CONV.capeMaxLeadH), width: r.cape.grid.width, height: r.cape.grid.height, quad: quadOf(r.cape.grid.corners) } : null;
    if ((!thunder || !thunder.steps.size) && (!cape || !cape.steps.size)) { why ??= `Der ICON-D2-Repack-Lauf ${r.run} trägt weder Gewitterpotenzial noch CAPE in der erwarteten Skala.`; continue; }
    return { run: r.run, runMs, path: r.path, thunder: thunder?.steps.size ? thunder : null, cape: cape?.steps.size ? cape : null };
  }
  return { why: why ?? 'Kein ICON-D2-Repack-Lauf im Index ist lesbar.' };
}

/**
 * One family of one run at the cells: step → values per cell id (`null` = outside the image, masked, or image unusable).
 * `kind` thunder: grey + alpha, value = grey / 255 · 100, alpha 0 = outside the model domain. `kind` cape: grey,
 * value = grey / 255 · 4000 J/kg. A step whose image is missing or has other dimensions is left out (counted).
 */
export async function readFamily({ reader, path, fam, kind, cells }) {
  const out = new Map();
  let missing = 0;
  const [lo, hi] = SEA_REPACK_SCALE[kind];
  const idx = cells.map((c) => quadCellIndex(fam.width, fam.height, fam.quad, c.lat, c.lon));
  for (const [step, file] of fam.steps) {
    let png;
    try { png = decodePng(await reader.bytes(`${path}/${file}`)); } catch { missing++; continue; }
    if (png.width !== fam.width || png.height !== fam.height || (kind === 'thunder' ? png.channels !== 2 : png.channels !== 1)) { missing++; continue; }
    const vals = {};
    cells.forEach((c, n) => {
      const k = idx[n];
      if (k == null) { vals[c.id] = null; return; }
      if (kind === 'thunder' && png.data[k * 2 + 1] === 0) { vals[c.id] = null; return; }
      vals[c.id] = lo + (png.data[k * png.channels] / 255) * (hi - lo);
    });
    out.set(step, vals);
  }
  return { steps: out, missing };
}

/** The whole read: index → run → both families at the cells. Never throws. */
export async function readRepack({ reader, cells, nowMs, log = () => {} }) {
  try {
    const run = pickRepackRun(await reader.index(), nowMs);
    if (run.why) return { state: 'none', why: run.why };
    const thunder = run.thunder ? await readFamily({ reader, path: run.path, fam: run.thunder, kind: 'thunder', cells }) : { steps: new Map(), missing: 0 };
    const cape = run.cape ? await readFamily({ reader, path: run.path, fam: run.cape, kind: 'cape', cells }) : { steps: new Map(), missing: 0 };
    if (!thunder.steps.size && !cape.steps.size) return { state: 'none', why: `Die Bilder des ICON-D2-Repack-Laufs ${run.run} sind nicht lesbar.` };
    if (thunder.missing || cape.missing) log(`Repack ${run.run}: ${thunder.missing + cape.missing} Bilder nicht lesbar — diese Stunden ohne Aussage`);
    const last = (m) => (m.size ? run.runMs + Math.max(...m.keys()) * H : run.runMs - H);
    return { state: 'ok', run: run.run, runMs: run.runMs, thunder: thunder.steps, cape: cape.steps, thunderTo: last(thunder.steps), capeTo: last(cape.steps) };
  } catch (e) {
    return { state: 'none', why: `Der ICON-D2-Repack ist nicht lesbar (${String(e?.message ?? e).split('\n')[0]}).` };
  }
}

// --- what buscosun Fusion gives per hour (only read) ---------------------------------------------------------

/**
 * Temperature, dew point, precipitation (mm/h, mean), snow share and rain chance (1 − pDry) per engine step. An hour with
 * its own computation carries the distribution; an interpolated hour gets the rain chance linearly between its neighbours
 * WITH a distribution (the engine's own rule for interpolated hours), `null` at the edges.
 */
export function fusionSightSteps(steps) {
  const list = steps ?? [];
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const own = list.map((st) => { const d = st.vars?.precip?.dist; if (!d) return null; const p = exceedance(d, 0); return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : null; });
  return list.map((st, k) => {
    let pWet = own[k];
    if (pWet == null) {
      let a = k - 1, b = k + 1;
      while (a >= 0 && own[a] == null) a--;
      while (b < list.length && own[b] == null) b++;
      if (a >= 0 && b < list.length) { const f = (st.validAtMs - list[a].validAtMs) / (list[b].validAtMs - list[a].validAtMs); if (f > 0 && f < 1) pWet = own[a] + (own[b] - own[a]) * f; }
    }
    return { t: st.validAtMs, tC: num(st.vars?.t2m?.mean), tdC: num(st.vars?.td2m?.mean), rr: num(st.vars?.precip?.mean), pSnow: num(st.vars?.pSnow?.mean), pWet };
  });
}

/** The sight code of one hour from the Fusion values (rain and snow split by the snow share; no share = rain). */
export function visCodeAt(x) {
  if (x?.tC == null || x.tdC == null) return null;
  const rr = Math.max(0, x.rr ?? 0), ps = Math.max(0, Math.min(1, x.pSnow ?? 0));
  return visCodeOf(hazeVisibilityM(x.tC, x.tdC), precipVisibilityM(rr * (1 - ps), rr * ps));
}

/** The two columns of one spot on the wave run's hour axis. `repack` = the result of `readRepack` (or a `none`). */
export function spotSightSeries({ id, fusion, runMs, repack, hours = SEA_SPOT_STEPS.length }) {
  const s = emptySightColumns(hours);
  for (const x of fusion ?? []) {
    const i = (x.t - runMs) / H;
    if (!Number.isInteger(i) || i < 0 || i >= hours) continue;
    s.vis[i] = visCodeAt(x);
    if (repack?.state !== 'ok') continue;
    const step = (x.t - repack.runMs) / H;
    if (!Number.isInteger(step) || step < 0) continue;
    s.conv[i] = convClassOf({ thunder: repack.thunder.get(step)?.[id] ?? null, capeJkg: repack.cape.get(step)?.[id] ?? null, pWet: x.pWet });
  }
  return s;
}

/**
 * Everything `sea-derive.mjs` needs after a wind computation: the columns per spot (only spots with at least one
 * statement, value lock applied) and the document block `sight`. `sightIn` = `{ spotId: fusionSightSteps(...) }` of
 * `spotWind`; empty or absent ⇒ `null` (nothing is written, the file has the shape before the phase).
 */
export async function sightFor({ sightIn, spots, runMs, nowMs, reader, log = () => {} }) {
  const ids = Object.keys(sightIn ?? {});
  if (!ids.length) return null;
  const cells = spots.filter((sp) => sightIn[sp.id]).map((sp) => ({ id: sp.id, ...seaCellCentre('cwam', sp.cell.i, sp.cell.j) }));
  const repack = reader ? await readRepack({ reader, cells, nowMs, log }) : { state: 'none', why: 'Der Producer lief ohne Zugang zum ICON-D2-Repack.' };
  const out = {}, problems = [];
  let visSpots = 0;
  for (const id of ids) {
    const s = spotSightSeries({ id, fusion: sightIn[id], runMs, repack });
    if (!hasSight(s)) continue;
    const pr = spotSightProblems(s);
    if (pr.length) { problems.push(`${id}: ${pr.slice(0, 2).join('; ')}`); continue; }
    if (s.vis.some((x) => x != null)) visSpots++;
    out[id] = s;
  }
  const doc = {
    conv: repack.state === 'ok'
      ? { state: 'ok', run: repack.run, runMs: repack.runMs, thunderTo: repack.thunderTo, capeTo: repack.capeTo, source: REPACK_SOURCE }
      : { state: 'none', why: repack.why },
    vis: visSpots ? { state: 'ok' } : { state: 'none', why: 'buscosun Fusion lieferte an keinem Spot Temperatur und Taupunkt.' },
    spots: Object.keys(out).length,
    rules: {
      conv: { ...SEA_CONV, from: 'set' },
      vis: { ...SEA_VIS, from: 'measured 18.11.2026 at 22 coastal stations (549 pairs, one weather situation)' },
    },
    ...(problems.length ? { problems } : {}),
  };
  log(`Hinweise: ${doc.spots} Spots, Schauer/Gewitter ${repack.state === 'ok' ? `aus Repack ${repack.run}` : `ohne (${repack.why})`}`);
  return { spots: out, doc };
}
