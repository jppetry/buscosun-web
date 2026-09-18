/**
 * collect.mjs — the archive collector (PA1): one slot per run, BOTH paths per point.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/collect.mjs \
 *        [--limit=N] [--live-hours=240] [--live-full=N] [--no-live] [--no-cube] [--no-nowcast] [--no-truth] \
 *        [--out=<archive root>] [--now=<iso>] [--raw] [--dry] [--vpa1=N]
 *
 * What one slot holds, per point (see lib/punktarchiv.mjs for the form and the schema history):
 *   cube      t1/t2/t3 from `buscosun-data` via `src/point/client` — every plane, integer-coded
 *             with the run manifest's own scales (the container is int16, nothing is lost);
 *             per tier the age of the SOURCE run at the slot (`ageAtSlotH`), the manifest's
 *             skipped/pending/declined sources and how many points the quantile planes cover
 *   stations  the MOSMIX-L product at the point's own station (the point IS a catalog station;
 *             for AT/CH points at the measurement site the catalog id is `point.mosmix.id`)
 *   nowcast   the radar mirror frames covering the slot — one slot probe per source, then per
 *             point; `null` only when no slot exists, „outside the raster" named as such
 *   hmodel    model orography per source and tier (`point/static/hmodel/v1`)
 *   plan      what `planPointSources` would choose from the next full hour on (6-h steps on
 *             model hours), with the point's STATION height as its terrain height
 *   live      today's `getPointForecast` (the path the app runs) — blended hours, confidence,
 *             contributing sources and, with `distribution: true`, the buscosun-Fusion
 *             distribution parameters (mean, q10/q50/q90, raw σ) per hour and variable
 *   truth     the measurements: DWD POI (hourly, all countries with a POI file), TAWES (AT) and
 *             SwissMetNet (CH/LI) from their 10-min series AT the hour stamp — window from the
 *             hour floor of slot − 24 h, never later than the slot (as-of guard in the library)
 *   stats     errors (a request/read that threw) AND warnings (what is missing or doubtful
 *             without a failure: skipped sources, points without radar, empty truth, …)
 *
 * Why both paths: the cube path is what the algorithm WILL read, the live path is what the
 * app reads TODAY. Archiving both from day one lets any later version of buscosun Fusion be
 * scored over the whole history — and lets the switch-over (AP6) be judged on the same days.
 *
 * Honest limits of the live path in Node (recorded in `live.caveats` of every slot):
 *   • no radar nowcast (`src/sources/radolan.ts` needs a Web Worker) — the cube path has it;
 *   • DEM via a shim (`lib/nodeShims.mjs`): same PNG bytes, the repo's own decoder;
 *   • UV via the rewrite `/_dwd_opendata/` → opendata.dwd.de (what netlify.toml does);
 *   • beyond 240 h the live path pulls the GFS tail (GRIB ranges, ~20 requests per point):
 *     default `--live-hours=240`, the first `--live-full=N` points get the full 372 h.
 *
 * Never pushes. The workflow template in `scripts/punktarchiv-repo/` does the git part.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

import { installNodeShims } from './lib/nodeShims.mjs';
installNodeShims();

import { decodePng } from '../lib/png.mjs';
import { httpStore, POINT_RAW_BASE } from '../../src/point/client/store.ts';
import { withRawSameRef } from './lib/rawFallback.mjs';
import { distanceKm, loadPointIndex, loadRunManifestFrom, manifestStore, readCubePoint } from '../../src/point/client/cubePoint.ts';
import { loadStationCatalog, readStationPoint } from '../../src/point/client/stationPoint.ts';
import { findLatestSlot, nowcastSourcesFor, readNowcastPoint } from '../../src/point/client/nowcastPoint.ts';
import { loadHmodelManifest, readHmodelPoint } from '../../src/point/client/staticPoint.ts';
import { planPointSources, SELECTION } from '../../src/point/client/resolve.ts';
import { TIERS } from '../../src/point/cubeFormat.ts';
import { NOWCAST_SOURCES } from '../../src/point/nowcastFormat.ts';
import { MATRIX_BANDS } from '../../src/point/sourceMatrix.ts';
import { getPointForecast } from '../../src/pointForecast/pointForecast.ts';
import { quantileOf, meanOf } from '../../src/pointForecast/fusion/dist.ts';

import {
  newSlot, encodeValue, encodeSeries, LIVE_SCALES, TRUTH_SCALES, serialiseSlot, mergeSlot, slotPaths, SENTINEL,
} from './lib/punktarchiv.mjs';
import {
  POI_URL, parsePoi, poiSeries, TAWES_HISTORY_URL, TAWES_10MIN, SMN_NOW_URL, parseTawes10min, parseSmn10min, tenMinColumns, tenMinHourStamps,
} from './lib/truth.mjs';
import { loadPointList, PROFILE_WHY } from './points.mjs';

const H = 3_600_000;
const PRODUCER = 'buscosun-web/scripts/punktarchiv/collect.mjs';
const round2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

// ─── args ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const [k, ...v] = a.slice(2).split('=');
    flags[k] = v.length ? v.join('=') : true;
  }
  return flags;
}

// ─── a memoising store: every chunk, manifest and PNG is fetched ONCE per slot ──
function memoStore(inner, pinned = new Map()) {
  const bytes = new Map(), json = new Map();
  return {
    get base() { return inner.base; },
    get stats() { return inner.stats; },
    bytes(path) { if (!bytes.has(path)) bytes.set(path, inner.bytes(path)); return bytes.get(path); },
    json(path) { if (!json.has(path)) json.set(path, inner.json(path)); return json.get(path); },
    // V-FI-1: Manifeste werden an den Index-Commit gepinnt (`manifestStore`). Der gepinnte
    // Store ist derselbe Memo-Store unter anderer Basis — einmal je Basis, damit ein Manifest
    // auch gepinnt nur EINMAL je Slot geholt wird.
    withBase(base) {
      if (!inner.withBase) return this;
      if (!pinned.has(base)) pinned.set(base, memoStore(inner.withBase(base), pinned));
      return pinned.get(base);
    },
    memo: { get chunks() { return bytes.size; }, get jsons() { return json.size; } },
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

async function fetchText(url, timeoutMs = 30_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

function codeHash() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    return dirty ? `${sha}-dirty` : sha;
  } catch { return null; }
}

/** A warning is a finding without a failure: appended under a category, never thrown (PA3). */
function warn(slot, category, entry) {
  (slot.stats.warnings[category] ??= []).push(entry);
}

// ─── cube ──────────────────────────────────────────────────────────────────
function encodeCubeSeries(series) {
  const planes = series.planes;
  const out = {};
  const empty = [];
  for (const pl of planes) {
    let any = false;
    const col = series.steps.map((st) => { const v = st.values[pl.id]; if (v != null) any = true; return encodeValue(v, pl); });
    if (any) out[pl.id] = col; else empty.push(pl.id);
  }
  return { planes: out, empty };
}

/**
 * Which sources the registry ASSIGNS to a tier's band (primary + secondary over DE/AT/CH)
 * and which of them the run does not carry — with the manifest's own reason (skipped/
 * pending/declined) or none. „Spurlos verschwunden" was the expert's finding (PA3): the
 * manifest knew (skipped.icon_ch1_eps: STAC 500), the archive did not copy it.
 */
function assignedButAbsent(tier, manifest, tierSources) {
  const carried = new Set(tierSources.map((s) => s.id));
  // Design first (pending/declined), failure last (skipped): the radar mirrors stand in BOTH
  // `pending` and `skipped` of a run manifest, and they are design, not a failed read.
  const kinds = [['pending', manifest.pending ?? {}], ['declined', manifest.declined ?? {}], ['skipped', manifest.skipped ?? {}]];
  const assigned = new Set();
  for (const band of MATRIX_BANDS) {
    if (band.toH <= tier.fromH || band.fromH >= tier.toH) continue;
    for (const c of Object.values(band.byCountry)) for (const id of [...c.primary, ...c.secondary]) assigned.add(id);
  }
  return [...assigned].filter((id) => !carried.has(id)).sort().map((id) => {
    const hit = kinds.find(([, m]) => id in m);
    return { id, kind: hit ? hit[0] : null, reason: hit ? hit[1][id] : null };
  });
}

async function collectCube(store, index, points, slot, slotAtMs) {
  for (const tier of TIERS) {
    const t = tier.id;
    const lb = index.latestByTier?.[t];
    if (!lb?.manifest) { slot.stats.errors.push(`cube/${t}: kein Lauf im Index`); continue; }
    const t0 = Date.now();
    // V-FI-1: das Manifest an den Index-Commit gepinnt lesen — `@main` kann eine Fassung
    // OHNE diese Stufe tragen (gemergt/beschnitten, nie gepurgt). Ein Rueckfall auf `@main`
    // wird als Vorbehalt in den Slot geschrieben, nicht verschwiegen.
    const { manifest, from } = await loadRunManifestFrom(store, lb.manifest, index);
    if (!manifest) { slot.stats.errors.push(`cube/${t}: Manifest ${lb.manifest} nicht lesbar`); continue; }
    if (from !== 'pinned') slot.stats.errors.push(`cube/${t}: Manifest ${lb.manifest} nur ueber @main gelesen (${from}) — moeglicherweise veraltet (V-FI-1)`);
    const tm = manifest.tiers.find((x) => x.id === t);
    if (!tm) { slot.stats.errors.push(`cube/${t}: Manifest ${lb.manifest} (${from}) kennt die Stufe nicht — traegt ${manifest.tiers.map((x) => x.id).join('+')} (V-FI-1)`); continue; }
    slot.scales.cube[t] = Object.fromEntries(manifest.planes.map((p) => [p.id, { scale: p.scale, offset: p.offset, unit: p.unit }]));
    const sourceRunAt = lb.sourceRunAt ?? lb.runAt;
    const tierSources = (manifest.sources ?? []).filter((s) => s.tier === t);
    const absent = assignedButAbsent(tier, manifest, tierSources);
    slot.cube[t] = {
      run: lb.run, runAt: lb.runAt, sourceRun: lb.sourceRun, sourceRunAt,
      // PA3: the age that matters for scoring — the SOURCE run against the slot time. The
      // producer's `ageH` is „publication run − source run" (0 with one job per tier).
      ageAtSlotH: round2((slotAtMs - Date.parse(sourceRunAt)) / H), publishLagH: lb.ageH,
      manifest: lb.manifest, leadHours: tm?.leadHours ?? null, planeOrder: manifest.planes.map((p) => p.id),
      provenance: { quantiles: tm?.quantiles ? { source: tm.quantiles.source, run: tm.quantiles.run, vars: tm.quantiles.vars } : null,
        ensemble: tm?.ensemble ? { byHour: tm.ensemble.byHour, sources: (tm.ensemble.sources ?? []).map((s) => ({ id: s.id, run: s.run, vars: s.vars, members: s.membersRead })) } : null,
        profile: tm?.profile ? { source: tm.profile.source, run: tm.profile.run, calibrated: tm.profile.calibrated } : null,
        pressure: tm?.pressure ? { levels: tm.pressure.levels, sources: (tm.pressure.sources ?? []).map((s) => s.id) } : null,
        hmodelChanged: tm?.hmodel?.changed ?? null },
      // PA3: `coverage` in the producer is the TIME axis of the chosen run (full = every step of
      // the band fetched, partial = not all) — not the area. Named so, and the area counted below.
      sources: tierSources.map((s) => ({ id: s.id, runAt: s.runAt, offsetH: s.offsetH, steps: s.steps, role: s.role, stepsCoverage: s.coverage })),
      coverageNote: 'stepsCoverage = Zeitachse des gewaehlten Laufs (full: alle Schritte des Bandes geholt, partial: nicht alle) — KEINE Flaechenaussage. Die Flaeche je Quelle steht im Lauf-Manifest unter sources[].geometry, je Punkt hier in byPoint[].empty (leere Ebenen) und in quantiles.points.',
      // PA3: what the run did NOT carry, with the producer's own reason where it has one.
      skipped: manifest.skipped ?? null,
      pending: Object.keys(manifest.pending ?? {}), declined: Object.keys(manifest.declined ?? {}),
      assignedAbsent: absent,
      fusion: manifest.fusion ? { weights: manifest.fusion.weights, provenance: manifest.fusion.provenance, note: manifest.fusion.note ?? null } : null,
      quantiles: null,
      byPoint: {},
    };
    // A warning only where the absence is a FAILURE (skipped) or unexplained; pending/declined
    // sources (MOSMIX as station product, the radar mirrors, MOSMIX-S) are design, listed in
    // `assignedAbsent` with their reason but not warned about every slot.
    for (const a of absent) {
      if (a.kind === 'pending' || a.kind === 'declined') continue;
      warn(slot, 'cubeSourcesAbsent', `${t}: ${a.id} laut Quellenmatrix zugeordnet, im Lauf nicht enthalten — ${a.kind === 'skipped' ? `uebersprungen: ${a.reason}` : 'OHNE Grund im Manifest (weder skipped noch pending noch declined)'}`);
    }
    let ok = 0;
    const qPlanes = slot.cube[t].planeOrder.filter((id) => /_q(10|50|90)$/.test(id));
    let qWith = 0, qWithout = 0;
    for (const p of points) {
      try {
        let skipReason = null;
        const ser = await readCubePoint(store, index, t, p.lat, p.lon, { manifest, onSkip: (r) => { skipReason = r; } });
        if (!ser) { slot.cube[t].byPoint[p.id] = null; if (skipReason && !/ausserhalb|außerhalb/.test(skipReason)) slot.stats.errors.push(`cube/${t}/${p.id}: ${skipReason}`); continue; }
        const enc = encodeCubeSeries(ser);
        slot.cube[t].byPoint[p.id] = {
          cell: { iy: ser.cell.iy, ix: ser.cell.ix, lat: ser.cell.lat, lon: ser.cell.lon, offsetKm: Math.round(ser.cell.offsetKm * 100) / 100 },
          chunk: ser.chunk.path, hModEffM: ser.hModEffM,
          belowGroundHPa: ser.steps.map((st) => st.belowGroundHPa),
          planes: enc.planes, empty: enc.empty,
        };
        if (qPlanes.length) { if (qPlanes.every((q) => enc.empty.includes(q))) qWithout++; else qWith++; }
        ok++;
      } catch (e) { slot.stats.errors.push(`cube/${t}/${p.id}: ${e.message}`); slot.cube[t].byPoint[p.id] = null; }
    }
    if (qPlanes.length) {
      slot.cube[t].quantiles = { source: tm?.quantiles?.source ?? null, planes: qPlanes.length, points: { with: qWith, without: qWithout } };
      if (qWithout) warn(slot, 'cubeQuantilesMissing', `${t}: ${qWithout} von ${qWith + qWithout} Punkten ohne Quantile (${tm?.quantiles?.source}) — Flaeche der Quelle, nicht Zeitachse (stepsCoverage)`);
    }
    slot.stats.timing[`cube.${t}`] = Date.now() - t0;
    console.log(`[collect] cube ${t}: Lauf ${lb.run} (Quell-Lauf ${lb.sourceRun}, ${slot.cube[t].ageAtSlotH} h alt) · ${ok}/${points.length} Punkte · Quantile ${qWith}/${qWith + qWithout} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

// ─── stations ─────────────────────────────────────────────────────────────
async function collectStations(store, index, points, slot, slotAtMs) {
  const t0 = Date.now();
  const run = index.stations?.runs?.[0];
  if (!run) { slot.stats.errors.push('stations: kein Lauf im Index'); return; }
  const [catalog, manifest] = await Promise.all([loadStationCatalog(store), store.json(run.manifest)]);
  if (!catalog || !manifest) { slot.stats.errors.push('stations: Katalog oder Manifest nicht lesbar'); return; }
  slot.stations = {
    run: run.run, runAt: run.runAt, ageAtSlotH: round2((slotAtMs - Date.parse(run.runAt)) / H), ageAtBuildH: run.ageH,
    manifest: run.manifest, leadHours: manifest.axis?.leadHours ?? null,
    scales: Object.fromEntries((manifest.planes ?? []).map((p) => [p.id, { scale: p.scale, offset: p.offset, unit: p.unit }])),
    notMapped: Object.keys(manifest.notMapped ?? {}), byPoint: {},
  };
  let ok = 0;
  // By id, not by proximity: a PA2 point sits at its measurement site, up to a few km from its
  // catalog position (§9.3.1 (4)); the nearest catalog station there can be a different one.
  // For DE points (point = catalog station) this is the same station with the same distance 0.
  const byId = new Map(catalog.stations.map((s) => [s.id, s]));
  for (const p of points) {
    try {
      const sid = p.mosmix?.id ?? p.id;
      const s = byId.get(sid);
      if (!s) { slot.stations.byPoint[p.id] = { station: null, planes: null, note: `Katalogstation ${sid} steht nicht (mehr) im Katalog` }; continue; }
      // PA3: dElevM against the point's STATION height (0 for DE, |Δ| ≤ 50 m for PA2 pairs);
      // dDemM against the DEM pixel, kept so a reader sees what the DEM says at a summit.
      const c = { ...s, distanceKm: distanceKm(p.lat, p.lon, s.lat, s.lon), dElevM: s.elev - p.elev };
      const ser = await readStationPoint(store, manifest, c);
      if (!ser) { slot.stations.byPoint[p.id] = null; continue; }
      const planes = {};
      const empty = [];
      for (const pl of ser.planes) {
        let any = false;
        const col = ser.steps.map((st) => { const v = st.values[pl.id]; if (v != null) any = true; return encodeValue(v, pl); });
        if (any) planes[pl.id] = col; else empty.push(pl.id);
      }
      slot.stations.byPoint[p.id] = { station: { id: c.id, distanceKm: c.distanceKm, dElevM: c.dElevM, dDemM: p.demM == null ? null : s.elev - p.demM }, planes, empty };
      ok++;
    } catch (e) { slot.stats.errors.push(`stations/${p.id}: ${e.message}`); slot.stations.byPoint[p.id] = null; }
  }
  slot.stats.timing.stations = Date.now() - t0;
  console.log(`[collect] stations: Lauf ${run.run} (${slot.stations.ageAtSlotH} h alt zum Slot) · ${ok}/${points.length} Punkte · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ─── nowcast + hmodel + plan ───────────────────────────────────────────────
const VALID_AT_WHY = 'Der Spiegel schreibt fuer RV in JEDEM Frame die Laufzeit als validAtMs (V-PD-56); der Leser rechnet Slot + lead und zaehlt die Widersprueche. Bei RV sind es alle Frames mit lead > 0 — eine Eigenschaft des Spiegels, keine des Frames.';

async function collectNowcast(store, points, slot, slotAtMs) {
  const t0 = Date.now();
  // PA3: one slot probe per source for the whole run (the memo store would dedupe the meta
  // reads anyway, but the RESULT — slot or none — is what distinguishes „no slot" from
  // „outside the raster" per point below).
  const slots = {};
  for (const spec of NOWCAST_SOURCES) {
    try { slots[spec.id] = await findLatestSlot(store, spec.id, slotAtMs); } catch (e) { slots[spec.id] = null; slot.stats.errors.push(`nowcast/${spec.id}: Slot-Suche ${e.message}`); }
    slot.nowcast.slots[spec.id] = slots[spec.id] ? { stamp: slots[spec.id].stamp, ageMin: round2(slots[spec.id].ageMin), probes: slots[spec.id].probes } : null;
    if (!slots[spec.id]) warn(slot, 'nowcastNoSlot', `${spec.id}: kein Slot in den letzten 180 min`);
  }
  let ok = 0;
  const uncovered = [], outside = {};
  for (const p of points) {
    const srcs = nowcastSourcesFor(p.lat, p.lon);
    const out = { covering: srcs, bySource: {} };
    for (const src of srcs) {
      const sl = slots[src];
      if (!sl) { out.bySource[src] = null; continue; }
      try {
        const ser = await readNowcastPoint(store, src, p.lat, p.lon, { nowMs: slotAtMs, decodePng, fromMs: slotAtMs - 30 * 60_000, untilMs: slotAtMs + 3 * H, slot: sl });
        if (ser) {
          const suspect = ser.frames.filter((f) => f.validAtSuspect).length;
          out.bySource[src] = {
            stamp: ser.stamp, slotAgeMin: ser.slotAgeMin, probes: ser.probes, extrapolationH: ser.extrapolationH,
            validAtSuspect: suspect ? { frames: suspect, of: ser.frames.length, why: VALID_AT_WHY } : null,
            frames: ser.frames.map((f) => ({ lead: f.lead, validAtMs: f.validAtMs, mmh: f.mmh == null ? SENTINEL : encodeValue(f.mmh, { scale: 0.01, offset: 0 }), saturated: !!f.saturated })),
          };
        } else {
          // The registry's domain box is larger than the projected raster (INCA Lambert,
          // CombiPrecip LV95 — their lat/lon bounding boxes have corners outside the grid).
          out.bySource[src] = { stamp: sl.stamp, frames: null, note: 'Punkt in der Domaenenhuelle der Registry, aber ausserhalb des Rasters dieser Quelle (kein Frame tastet ihn ab)' };
          (outside[src] ??= []).push(p.id);
        }
      } catch (e) { slot.stats.errors.push(`nowcast/${src}/${p.id}: ${e.message}`); out.bySource[src] = null; }
    }
    if (srcs.length) ok++; else uncovered.push(p.id);
    slot.nowcast.byPoint[p.id] = out;
  }
  slot.nowcast.scale = { mmh: { scale: 0.01, offset: 0, unit: 'mm/h' } };
  slot.nowcast.note = 'covering = Quellen, deren Abdeckung (Registry: Domaene ∩ clip ∩ Standortreichweite, RV = 150 km um die 17 DWD-Standorte) den Punkt traegt; bySource[s] = null nur ohne Slot der Quelle; frames: null = ausserhalb des Rasters.';
  if (uncovered.length) warn(slot, 'nowcastUncovered', `${uncovered.length} Punkte ohne Radarquelle: ${uncovered.join(' ')}`);
  for (const [src, ids] of Object.entries(outside)) warn(slot, 'nowcastOutsideRaster', `${src}: ${ids.length} Punkte in der Huelle, aber ausserhalb des Rasters: ${ids.join(' ')}`);
  slot.stats.timing.nowcast = Date.now() - t0;
  console.log(`[collect] nowcast: ${ok}/${points.length} Punkte von einer Radarquelle gedeckt · Slots ${Object.entries(slot.nowcast.slots).map(([k, v]) => `${k} ${v?.stamp ?? '—'}`).join(' · ')} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

async function collectHmodel(store, points, slot) {
  const t0 = Date.now();
  const hm = await loadHmodelManifest(store);
  if (!hm) { slot.hmodel.note = 'point/static/hmodel/v1 nicht lesbar'; return; }
  slot.hmodel.version = hm.version ?? 'v1';
  for (const p of points) {
    const byTier = {};
    for (const tier of TIERS) {
      try {
        const r = await readHmodelPoint(store, hm, tier.id, p.lat, p.lon);
        byTier[tier.id] = r ? { bySource: r.bySource, provenance: r.provenance, spreadM: r.spreadM } : null;
      } catch (e) { slot.stats.errors.push(`hmodel/${tier.id}/${p.id}: ${e.message}`); byTier[tier.id] = null; }
    }
    slot.hmodel.byPoint[p.id] = byTier;
  }
  slot.stats.timing.hmodel = Date.now() - t0;
}

async function collectPlan(store, points, slot, slotAtMs) {
  const t0 = Date.now();
  // PA3: decisions on MODEL hours — from the next 00/06/12/18 UTC after the slot on, 6-h steps:
  // there every tier sits on its own grid (t1 hourly; t2 3-hourly from 00/06/12/18 runs ⇒ valid
  // at multiples of 3 h; t3 6-hourly from 00/12 runs ⇒ multiples of 6 h). For the 23:10 cron
  // slot that is 00:00, 40 min later. Before, the axis started at the slot minute (23:20,
  // 05:20, …) and every boundary lay on :20 — and a step off the t2/t3 grid let the station win
  // for a reason that was the axis, not the data.
  const stepH = 6;
  const fromMs = Math.ceil(slotAtMs / (stepH * H)) * stepH * H;
  const toMs = fromMs + 336 * H;
  slot.plan.axis = { fromMs, toMs, stepH, note: 'Entscheidungen ab dem naechsten 00/06/12/18 UTC nach dem Slot, alle 6 h (dort liegen alle drei Stufen auf ihrem eigenen Raster); Abschnitte halboffen [fromMs, toMs] mit toMs = letzte Entscheidungszeit + 6 h − 1 ms, lueckenlos aneinander.' };
  const rejected = [];
  for (const p of points) {
    try {
      // PA3: the point IS its station — its terrain height is the station's height (`elev`),
      // not the z9 DEM pixel (`demM`), which at a summit lies up to 270 m below (Arber, Zugspitze)
      // and made `plan` reject the point's own station. dDemM keeps what the DEM says.
      const plan = await planPointSources(store, { lat: p.lat, lon: p.lon, elevationM: p.elev, fromMs, toMs, stepH, nowMs: slotAtMs });
      const cand = plan?.station.candidate ?? null;
      slot.plan.byPoint[p.id] = plan ? {
        station: { accepted: plan.station.accepted, reason: plan.station.reason, candidate: cand ? { id: cand.id, distanceKm: cand.distanceKm, dElevM: cand.dElevM, dDemM: p.demM == null ? null : cand.elev - p.demM } : null },
        nowcast: plan.nowcast.covering,
        segments: plan.segments.map((s) => ({ fromMs: s.fromMs, toMs: s.toMs, primary: s.primary, alternative: s.alternative, precip: s.precip, uncertainty: s.uncertainty, steps: s.steps })),
        gaps: plan.gaps,
      } : null;
      if (plan && !plan.station.accepted) rejected.push(`${p.id} (${cand?.id ?? '—'}, ${cand?.distanceKm?.toFixed(1) ?? '—'} km, ${cand?.dElevM ?? '—'} m)`);
    } catch (e) { slot.stats.errors.push(`plan/${p.id}: ${e.message}`); slot.plan.byPoint[p.id] = null; }
  }
  slot.plan.selection = { stationMaxKm: SELECTION.stationMaxKm, stationMaxDElevM: SELECTION.stationMaxDElevM, stationAtPointKm: SELECTION.stationAtPointKm, calibrated: SELECTION.calibrated, elevation: 'points[].elev (Hoehe der Messstelle = Punkthoehe); bis PA2 das DEM-Pixel demM (Terrarium z9), das 10 Gipfelstationen ihre eigene Station verwerfen liess. stationAtPointKm (E-F-12): innerhalb dieser Entfernung steht der Punkt an der Station, ihre Hoehe gilt, das Hoehenkriterium entfaellt.' };
  if (rejected.length) warn(slot, 'planStationRejected', `${rejected.length} Punkte, deren naechste Katalogstation den Punkt nicht vertritt: ${rejected.join(' · ')}`);
  slot.stats.timing.plan = Date.now() - t0;
}

// ─── live path ─────────────────────────────────────────────────────────────
const LIVE_FIELDS = ['temperature', 'apparentTemperature', 'windSpeed', 'windDirection', 'gustSpeed', 'relativeHumidity', 'snowLineM', 'cloudCoverTotal', 'cloudCoverLow', 'cloudCoverMid', 'cloudCoverHigh', 'precipitation', 'uvIndex'];
const CONF_KEYS = ['temperature', 'wind', 'gust', 'humidity', 'precipitation', 'clouds', 'snowLine', 'uvIndex'];
const FUSION_VARS = ['temperature', 'dewPoint', 'humidity', 'clouds', 'precipitation', 'windSpeed', 'gust'];

function encodeFusion(fp) {
  if (!fp) return null;
  const out = {};
  const q = (d, p) => { try { return quantileOf(d, p); } catch { return null; } };
  for (const k of FUSION_VARS) {
    const v = fp[k];
    if (!v || !v.dist) { out[k] = null; continue; }
    const sc = k === 'humidity' || k === 'clouds' ? { scale: 0.1, offset: 0 } : { scale: 0.01, offset: 0 };
    out[k] = {
      mu: encodeValue(meanOf(v.dist), sc), q10: encodeValue(q(v.dist, 0.1), sc), q50: encodeValue(q(v.dist, 0.5), sc), q90: encodeValue(q(v.dist, 0.9), sc),
      rawMu: encodeValue(v.rawMu, sc), rawSigma: encodeValue(v.rawSigma, sc), n: v.equivalentSources ?? null, climaOnly: !!v.climatologyOnly,
      sources: v.contributors ?? null,
    };
  }
  out.windDirectionDeg = fp.windDirectionDeg != null ? encodeValue(fp.windDirectionDeg, { scale: 1, offset: 0 }) : SENTINEL;
  out.pSnow = fp.pSnow != null ? encodeValue(fp.pSnow, { scale: 0.001, offset: 0 }) : SENTINEL;
  out.regime = fp.regime ?? null;
  out.climaSource = fp.climaSource ?? null;
  return out;
}

function encodeLive(fc) {
  const hours = fc.hours;
  const t0Ms = hours[0]?.timestamp?.getTime?.() ?? null;
  const contiguous = hours.every((h, i) => h.timestamp.getTime() === t0Ms + i * H);
  const dict = [];
  const dIdx = (s) => { let i = dict.indexOf(s); if (i < 0) { dict.push(s); i = dict.length - 1; } return i; };
  const fields = {};
  for (const f of LIVE_FIELDS) fields[f] = encodeSeries(hours.map((h) => h[f]), LIVE_SCALES[f]);
  const confidence = {};
  for (const k of CONF_KEYS) confidence[k] = encodeSeries(hours.map((h) => h.confidence?.[k]), LIVE_SCALES.confidence);
  return {
    fetchedAtMs: fc.fetchedAt, elevation: fc.query.elevation, lapseRatePerM: fc.lapseRatePerM, sourcesAvailable: fc.sourcesAvailable,
    nearestStations: fc.nearestStations, t0Ms, n: hours.length, tsMs: contiguous ? null : hours.map((h) => h.timestamp.getTime()),
    fields, confidence, sources: hours.map((h) => (h.contributingSources ?? []).map(dIdx)), sourceDict: dict,
    fusion: hours.some((h) => h.fusion) ? hours.map((h) => encodeFusion(h.fusion)) : null,
  };
}

async function collectLive(points, slot, opts) {
  const t0 = Date.now();
  slot.live.options = { includeRadarNowcast: false, distribution: true, anchorMode: 'offset', hoursDefault: opts.liveHours, hoursFullFirstN: opts.liveFull };
  slot.live.axis = {
    note: 't0Ms = Stundenboden der ABRUFZEIT des Live-Pfads (die App rechnet ab der laufenden Stunde), nicht die Slotzeit; Stunde i gilt fuer t0Ms + i h. tsMs ist null, wenn die Reihe lueckenlos stuendlich ist (der Regelfall), sonst die Zeitstempel je Stunde. fetchedAtMs je Punkt = Ende des Abrufs.',
  };
  slot.live.caveats = [
    'Live-Pfad in Node: KEIN Radar-Nowcast (src/sources/radolan.ts braucht einen Web Worker); der Cube-Pfad trägt den Nowcast aus dem Spiegel.',
    'DEM über lib/nodeShims.mjs (dieselben Terrarium-Bytes, der Decoder des Repos statt createImageBitmap).',
    'UV über die Umschreibung /_dwd_opendata/ → opendata.dwd.de (was netlify.toml im Browser tut).',
    `Stunden: ${opts.liveHours} je Punkt, die ersten ${opts.liveFull} Punkte mit 372 h (GFS-Schwanz jenseits 240 h kostet ~20 GRIB-Anfragen je Punkt).`,
    'Hoehe: der Live-Pfad rechnet mit SEINER DEM-Hoehe (Terrarium z9, bilinear; Feld `elevation`), nicht mit points[].elev — an Gipfelstationen bis ~270 m darunter (Arber 1 209 statt 1 446 m). Die Abweichungen > 50 m stehen in stats.warnings.liveElevation (V-FI-24).',
    'Taupunkt/Feuchte: fuer MOSMIX-Stunden liefert BrightSky relative_humidity = null und dew_point gesetzt; der Sample-Builder der App bildet nur RH ab ⇒ dewPoint/humidity der Live-Fusion sind ausserhalb der Ankerstunden Klimatologie (climaOnly), nicht MOSMIX (V-FI-25, Fusions-Eingabe = Jans Gate).',
    `Laenderprofil: ${PROFILE_WHY}`,
  ];
  let ok = 0;
  const elevOff = [];
  await mapLimit(points, opts.liveConcurrency, async (p, i) => {
    const hours = i < opts.liveFull ? 372 : opts.liveHours;
    try {
      // `profile`: the DACH country profile (neighbour points keep the one PA1 used — AT/CH — so their live series does not break).
      const fc = await getPointForecast({ lat: p.lat, lng: p.lon, country: p.profile ?? p.country, hours, includeRadarNowcast: false, distribution: true, anchorMode: 'offset', signal: AbortSignal.timeout(180_000) });
      slot.live.byPoint[p.id] = encodeLive(fc);
      const d = fc.query.elevation - p.elev;
      if (Number.isFinite(d) && Math.abs(d) > 50) elevOff.push(`${p.id} ${Math.round(d) > 0 ? '+' : ''}${Math.round(d)}`);
      ok++;
    } catch (e) { slot.stats.errors.push(`live/${p.id}: ${e.message}`); slot.live.byPoint[p.id] = { error: String(e.message) }; }
  });
  if (elevOff.length) warn(slot, 'liveElevation', `${elevOff.length} Punkte, deren Live-DEM-Hoehe mehr als 50 m von der Stationshoehe abweicht (id Δm): ${elevOff.join(' ')}`);
  slot.stats.timing.live = Date.now() - t0;
  console.log(`[collect] live: ${ok}/${points.length} Punkte · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ─── truth ─────────────────────────────────────────────────────────────────
const POI_VALUE_COLS = ['t', 'rh', 'ff', 'p', 'n'];

async function collectTruth(points, slot, slotAtMs) {
  const t0 = Date.now();
  // PA3: from the HOUR FLOOR of slot − 24 h. The old window [slot − 24 h, slot] began at
  // 23:20 of the previous day and so dropped its 23:00 hour — which the next slot could not
  // see either (POI holds 25 rows, TAWES answers any window). Every day's 23-UTC hour was lost.
  const fromMs = Math.floor((slotAtMs - 24 * H) / H) * H;
  slot.truth.window = { fromMs, toMs: slotAtMs, note: 'Stundenboden(Slot − 24 h) … Slot: beim 23:20-Slot 23:00 Vortag … 23:00; POI endet um 22:00 (die 23:00 erscheint erst nach dem Slot), TAWES und SMN tragen die 23:00 (Verzug ≤ 25 min gemessen).' };
  let poiOk = 0;
  const poiEmpty = [], poiSparse = [];
  const poiPoints = points.filter((p) => p.truth?.poi !== false);   // PA2 points without a POI file are not asked (no 404 per point)
  for (const p of points) slot.truth.byPoint[p.id] = { poi: null };
  await mapLimit(poiPoints, 6, async (p) => {
    const rec = slot.truth.byPoint[p.id];
    try {
      const txt = await fetchText(POI_URL(p.id));
      if (txt) {
        const rows = parsePoi(txt);
        const s = poiSeries(rows, fromMs, slotAtMs);
        s.fxh = s.fx;   // POI's fx IS the hour maximum (maximum_wind_speed_last_hour)
        rec.poi = { obsAtMs: s.obsAtMs, count: s.obsAtMs.length };
        for (const k of Object.keys(TRUTH_SCALES)) if (s[k] !== undefined) rec.poi[k] = encodeSeries(s[k], TRUTH_SCALES[k]);
        if (s.obsAtMs.length && POI_VALUE_COLS.every((k) => s[k].every((v) => v == null))) poiEmpty.push(p.id);
        else if (s.obsAtMs.length < 12) poiSparse.push(`${p.id} (${s.obsAtMs.length} h)`);
        poiOk++;
      }
    } catch (e) { slot.stats.errors.push(`truth/poi/${p.id}: ${e.message}`); }
  });
  if (poiEmpty.length) warn(slot, 'poiEmpty', `${poiEmpty.length} POI-Dateien ohne einen einzigen Messwert im Fenster (Station liefert nicht): ${poiEmpty.join(' ')}`);
  if (poiSparse.length) warn(slot, 'poiSparse', `${poiSparse.length} POI-Reihen mit weniger als 12 Stunden (Synop-Rhythmus im Ausland): ${poiSparse.join(' ')}`);

  // PA2/PA3 (§9.3.1 (6), §9.12): the 10-min series of both networks, read by the archive itself
  // — every column AT the hour stamp, hour sums `rr1h`, hour maxima `fxh`. TAWES: one request
  // per ≤ 100 ids (URL limit ≈ 2 kB) from fromMs − 1 h (the first hour sum needs h−50…h);
  // SMN: the day file per station (only the running UTC day — its first hour has no sum).
  const tawesIds = points.filter((p) => p.truth?.tawes).map((p) => p.truth.tawes);
  const smnAbbrs = points.filter((p) => p.truth?.smn).map((p) => p.truth.smn);
  const tenMin = new Map();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
  for (let i = 0; i < tawesIds.length; i += 100) {
    const ids = tawesIds.slice(i, i + 100);
    try {
      const txt = await fetchText(`${TAWES_HISTORY_URL}?parameters=${Object.values(TAWES_10MIN).join(',')}&station_ids=${ids.join(',')}&start=${iso(fromMs - H)}&end=${iso(slotAtMs)}`, 60_000);
      if (txt) for (const [id, rec] of parseTawes10min(JSON.parse(txt))) tenMin.set(`tawes:${id}`, rec);
    } catch (e) { slot.stats.errors.push(`truth/tawes-10min: ${e.message}`); }
  }
  await mapLimit(smnAbbrs, 6, async (abbr) => {
    try { const txt = await fetchText(SMN_NOW_URL(abbr)); if (txt) tenMin.set(`smn:${abbr}`, parseSmn10min(txt)); } catch (e) { slot.stats.errors.push(`truth/smn-10min/${abbr}: ${e.message}`); }
  });
  const networkRecord = (series) => {
    const obsAtMs = tenMinHourStamps(series, fromMs, slotAtMs);
    const cols = tenMinColumns(series, obsAtMs);
    const rec = { obsAtMs, count: obsAtMs.length };
    for (const k of Object.keys(TRUTH_SCALES)) if (cols[k] !== undefined) rec[k] = encodeSeries(cols[k], TRUTH_SCALES[k]);
    return rec;
  };
  let tawesOk = 0, smnOk = 0;
  const netMissing = [];
  for (const p of points) {
    if (p.truth?.tawes) {
      const s = tenMin.get(`tawes:${p.truth.tawes}`);
      if (s) { slot.truth.byPoint[p.id].tawes = networkRecord(s); tawesOk++; } else netMissing.push(`${p.id} tawes:${p.truth.tawes}`);
    }
    if (p.truth?.smn) {
      const s = tenMin.get(`smn:${p.truth.smn}`);
      if (s) { slot.truth.byPoint[p.id].smn = networkRecord(s); smnOk++; } else netMissing.push(`${p.id} smn:${p.truth.smn}`);
    }
  }
  if (netMissing.length) warn(slot, 'networkTruthMissing', `${netMissing.length} Netzstationen ohne 10-min-Reihe im Slot: ${netMissing.join(' ')}`);
  slot.truth.caveats = [
    'POI: stündlich, 24-h-Rollfenster des DWD, Stationskennung = WMO-Kennung, Zeit = UTC aus den Spalten Datum/Uhrzeit; fx = Stundenmaximum der Böe (fxh = fx).',
    'TAWES/SMN (PA3): alle Spalten aus den 10-min-Reihen AM Stundenstempel (Stempel = Intervallende): t, td, rh, ff, dd, fx (Spitze der letzten 10 min), p (reduziert: TAWES PRED, SMN pp0qffs0). rr1 = 10-min-Menge am Stempel × 6 (mm/h, PA1-Rate, NICHT die Stundensumme).',
    'TAWES/SMN rr1h (PA2): Stundensumme der sechs 10-min-Werte mit Stempel h−50…h (SMN gegen POI auf die Stelle gemessen, TAWES laut API „letzte 10 Minuten"), Sentinel wenn einer fehlt — DAS ist die mit POI rr1 vergleichbare Größe. fxh (PA3): Maximum der sechs 10-min-Spitzen, Sentinel wenn eine fehlt — die mit POI fx vergleichbare Größe.',
    'Bedeckung n: nur POI (weder TAWES noch SMN messen sie) — die Spalte fehlt in TAWES/SMN-Datensätzen.',
    'SMN-Tagesdatei trägt nur den laufenden UTC-Tag: im 23:20-Slot fehlen die Vortagsstunde 23:00 und die Summen/Maxima um 00:00 (Sentinel); Nachholweg _t_recent.csv (4 MB je Station, nicht im Slot).',
    'Punkte ohne POI-Datei (PA2, AT/CH an der Messstelle) tragen poi: null — nicht abgefragt. Eine POI-Datei ohne einen Messwert im Fenster steht in stats.warnings.poiEmpty.',
    'count = Zahl der Stunden im Datensatz; obsAtMs die Stempel. Alle Messzeiten liegen ≤ Slotzeit (As-of-Wächter der Bibliothek).',
    'Ueberlappung (seit Schema 2): die 23-UTC-Stunde von TAWES/SMN steht in ZWEI Slots — am Ende von Slot N (23:00 des Tages) und am Anfang von Slot N+1 (Fensterbeginn 23:00 Vortag). Der Bewerter (AP9) dedupliziert nach Punkt und Stempel; die Werte sind identisch, wenn die Reihe nicht nachkorrigiert wurde.',
  ];
  slot.stats.timing.truth = Date.now() - t0;
  console.log(`[collect] truth: POI ${poiOk}/${poiPoints.length} (leer ${poiEmpty.length}) · TAWES ${tawesOk}/${tawesIds.length} · SMN ${smnOk}/${smnAbbrs.length} · Fenster ab ${iso(fromMs)} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ─── V-PA-1: archived live samples against a fresh call ─────────────────────
async function vpa1(points, slot, n) {
  const out = [];
  for (const p of points.slice(0, n)) {
    const a = slot.live.byPoint[p.id];
    if (!a || a.error) { out.push({ id: p.id, ok: false, why: 'kein Archiv-Sample' }); continue; }
    // `hours + 1` bypasses the 3-minute memo cache of getPointForecast (cached.hours >= hours).
    // ⚠ Measured 2026-09-14: for a 240-h sample the fresh call asks 241 h, which crosses the GFS
    // trigger (`hours > 240`) — from h = 216 on the fresh blend carries GFS samples the archive
    // run did not have. So a 240-h sample is compared below h = 216 only; a 372-h sample (GFS in
    // both) over its full length. Anything else compares two different source sets, not two runs.
    const GFS_TRIGGER_H = 240, GFS_TAIL_FROM_H = 216;
    const fc = await getPointForecast({ lat: p.lat, lng: p.lon, country: p.profile ?? p.country, hours: a.n + 1, includeRadarNowcast: false, distribution: true, anchorMode: 'offset' });
    const cmpN = a.n > GFS_TRIGGER_H ? a.n : Math.min(a.n, GFS_TAIL_FROM_H);
    let maxDev = 0, compared = 0, worst = null;
    for (const f of ['temperature', 'windSpeed', 'gustSpeed', 'relativeHumidity', 'precipitation', 'cloudCoverTotal']) {
      const sc = LIVE_SCALES[f];
      for (let i = 0; i < Math.min(cmpN, fc.hours.length); i++) {
        const fresh = fc.hours[i][f];
        const arch = a.fields[f][i];
        if (fresh == null && arch === SENTINEL) { compared++; continue; }
        if (fresh == null || arch === SENTINEL) { maxDev = Infinity; worst = `${f}[${i}] null≠Wert`; continue; }
        const dev = Math.abs(fresh - (arch * sc.scale + sc.offset)) / sc.scale;   // in quantisation steps
        compared++;
        if (dev > maxDev) { maxDev = dev; worst = `${f}[${i}] Δ ${dev.toFixed(2)} Schritte`; }
      }
    }
    out.push({ id: p.id, ok: maxDev <= 0.5, compared, hours: cmpN, maxDevSteps: Number.isFinite(maxDev) ? Number(maxDev.toFixed(3)) : null, worst });
  }
  return out;
}

// ─── main ──────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const nowMs = flags.now ? Date.parse(flags.now) : Date.now();
  const slotAtMs = Math.floor(nowMs / 60_000) * 60_000;
  const outRoot = resolve(flags.out ?? process.env.POINTARCHIVE_OUT ?? '../buscosun-archiv');
  const list = loadPointList();
  let points = list.points;
  if (flags.limit) points = points.slice(0, Number(flags.limit));
  const liveHours = Number(flags['live-hours'] ?? 240);
  const liveFull = Number(flags['live-full'] ?? 0);
  const t0 = Date.now();

  const store = memoStore(flags.raw ? httpStore({ base: POINT_RAW_BASE }) : withRawSameRef(httpStore({})));
  const slot = newSlot({ slotAtMs, codeHash: codeHash(), producer: PRODUCER });
  slot.pointsFrom = {
    file: 'scripts/punktarchiv/points.json', builtAt: list.builtAt, total: list.points.length, used: points.length,
    // PA3: what the keys mean — the expert read `id` as a WMO number and `demM` as the point height.
    rules: {
      id: 'MOSMIX-Katalogkennung: Schluessel ALLER byPoint-Bloecke und des Stationsprodukts. Bei DE = WMO-Kennung der POI-Datei; bei AT/CH-Paaren (Feld mosmix vorhanden) die Kennung der KATALOGSTATION, nicht der Messstelle (Innsbruck: id 11120, TAWES 11121); Katalogkennungen ohne WMO-Form (P0060 Patscherkofel) kommen vor.',
      wmo: 'Synop-/WMO-Kennung der Messstelle (TAWES-Kennung bzw. SMN-WIGOS); truth.tawes/truth.smn sind die Kennungen, unter denen die Wahrheit geholt wurde.',
      profile: PROFILE_WHY,
      elev: 'Hoehe der Messstelle (Stationsmetadaten) = Punkthoehe fuer Plan und Stationskriterium.',
      demM: 'Terrarium z9, naechstes Pixel — nur Verortungskontrolle, keine Punkthoehe (an Gipfeln bis 270 m zu tief).',
    },
  };
  slot.points = points.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, elev: p.elev, demM: p.demM, country: p.country, profile: p.profile ?? p.country, wmo: p.wmo, truth: p.truth, ...(p.mosmix ? { mosmix: p.mosmix } : {}) }));
  console.log(`[collect] Slot ${slot.slotAt} · ${points.length} Punkte · Repo ${store.base} · Ausgabe ${outRoot}${flags.dry ? ' (dry)' : ''}`);

  const index = await loadPointIndex(store);
  if (!index) throw new Error('point/index.json nicht erreichbar');
  const ageAtSlot = (runAt) => (runAt ? round2((slotAtMs - Date.parse(runAt)) / H) : null);
  slot.index = {
    commit: index.commit, publishedAt: index.publishedAt, schema: index.schema, base: store.base,
    // PA3: `ageAtSlotH` = Quell-Lauf gegen die Slotzeit; `publishLagH` = das Feld `ageH` des
    // Producers (Publikationslauf − Quell-Lauf, mit einem Job je Stufe immer 0).
    latestByTier: Object.fromEntries(Object.entries(index.latestByTier ?? {}).map(([t, v]) => [t, v ? { run: v.run, runAt: v.runAt, sourceRun: v.sourceRun, sourceRunAt: v.sourceRunAt ?? null, ageAtSlotH: ageAtSlot(v.sourceRunAt ?? v.runAt), publishLagH: v.ageH } : null])),
    stations: index.stations?.runs?.[0] ? { run: index.stations.runs[0].run, runAt: index.stations.runs[0].runAt, ageAtSlotH: ageAtSlot(index.stations.runs[0].runAt), ageAtBuildH: index.stations.runs[0].ageH } : null,
    retentionByTier: index.retentionByTier ?? null,
  };
  console.log(`[collect] Index ${String(index.commit).slice(0, 7)} (${index.publishedAt}) · t1 ${index.latestByTier?.t1?.run} · t2 ${index.latestByTier?.t2?.run} · t3 ${index.latestByTier?.t3?.run} · Stationen ${index.stations?.runs?.[0]?.run}`);

  if (!flags['no-cube']) {
    await collectCube(store, index, points, slot, slotAtMs);
    await collectStations(store, index, points, slot, slotAtMs);
    // Das statische Produkt aendert sich IN PLACE (static.json UND Chunks, viermal taeglich):
    // beides gepinnt an den Index-Commit, damit Ebenenliste und Bytes zusammenpassen.
    await collectHmodel(manifestStore(store, index), points, slot);
    await collectPlan(store, points, slot, slotAtMs);
  }
  if (!flags['no-nowcast'] && !flags['no-cube']) await collectNowcast(store, points, slot, slotAtMs);
  if (!flags['no-truth']) await collectTruth(points, slot, slotAtMs);
  if (!flags['no-live']) await collectLive(points, slot, { liveHours, liveFull, liveConcurrency: Number(flags['live-concurrency'] ?? 3) });

  slot.stats.net = { files: store.stats.files, bytes: store.stats.bytes, misses: store.stats.misses, fallbacks: store.stats.fallbacks ?? 0, memoChunks: store.memo.chunks, memoJsons: store.memo.jsons };
  slot.stats.timing.total = Date.now() - t0;

  const bytes = serialiseSlot(slot);
  const nWarn = Object.values(slot.stats.warnings).reduce((n, a) => n + a.length, 0);
  console.log(`[collect] Slot-Größe ${(bytes.length / 1048576).toFixed(2)} MiB (gzip) · ${(JSON.stringify(slot).length / 1048576).toFixed(1)} MiB roh · ${slot.stats.errors.length} Fehler · ${nWarn} Warnungen · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const e of slot.stats.errors.slice(0, 10)) console.log(`   ⚠ ${e}`);
  if (slot.stats.errors.length > 10) console.log(`   … ${slot.stats.errors.length - 10} weitere`);
  for (const [k, list] of Object.entries(slot.stats.warnings)) for (const w of list) console.log(`   · ${k}: ${w.length > 220 ? `${w.slice(0, 220)} …` : w}`);

  if (flags.vpa1) {
    const r = await vpa1(points, slot, Number(flags.vpa1));
    console.log(`[V-PA-1] ${r.filter((x) => x.ok).length}/${r.length} Punkte innerhalb eines halben Quantisierungsschritts`);
    for (const x of r) console.log(`   ${x.id} ${x.ok ? 'OK ' : 'ABW'} verglichen ${x.compared ?? '—'} Werte bis h < ${x.hours ?? '—'} · max ${x.maxDevSteps ?? '∞'} Schritte${x.worst ? ` (${x.worst})` : ''}${x.why ? ` — ${x.why}` : ''}`);
    slot.stats.vpa1 = r;
  }

  if (flags.dry) { console.log('[collect] dry — nichts geschrieben'); return; }
  mkdirSync(outRoot, { recursive: true });
  const res = mergeSlot(outRoot, slot, flags.vpa1 ? serialiseSlot(slot) : bytes);
  console.log(`[collect] ${res.written ? 'geschrieben' : 'unverändert (idempotent)'}: ${join(outRoot, res.file)} · ${res.bytes} B · sha256 ${res.sha.slice(0, 12)}${res.conflict ? ' · ⚠ Konflikt (gleicher Slot, andere Bytes)' : ''}`);
  if (flags.json) console.log(JSON.stringify({ slot: slotPaths(slotAtMs), points: points.length, bytes: res.bytes, ms: slot.stats.timing.total, errors: slot.stats.errors.length, warnings: nWarn, net: slot.stats.net }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
