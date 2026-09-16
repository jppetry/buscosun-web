/**
 * collect.mjs — the archive collector (PA1): one slot per run, BOTH paths per point.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/collect.mjs \
 *        [--limit=N] [--live-hours=240] [--live-full=N] [--no-live] [--no-cube] [--no-nowcast] [--no-truth] \
 *        [--out=<archive root>] [--now=<iso>] [--raw] [--dry] [--vpa1=N]
 *
 * What one slot holds, per point (see lib/punktarchiv.mjs for the form):
 *   cube      t1/t2/t3 from `buscosun-data` via `src/point/client` — every plane, integer-coded
 *             with the run manifest's own scales (the container is int16, nothing is lost)
 *   stations  the MOSMIX-L product at the point's own station (the point IS a catalog station;
 *             for AT/CH points at the measurement site the catalog id is `point.mosmix.id`)
 *   nowcast   the radar mirror frames covering the slot (domain-checked, `validAtSuspect` kept)
 *   hmodel    model orography per source and tier (`point/static/hmodel/v1`)
 *   plan      what `planPointSources` would choose at the slot — the selection, not the values
 *   live      today's `getPointForecast` (the path the app runs) — blended hours, confidence,
 *             contributing sources and, with `distribution: true`, the buscosun-Fusion
 *             distribution parameters (mean, q10/q50/q90, raw σ) per hour and variable
 *   truth     the measurements: DWD POI (hourly, 24 h, all three countries), TAWES (AT, 10-min
 *             sampled to the hour), SwissMetNet (CH) — with station id and timestamp, never
 *             later than the slot (as-of guard in the library, negative control in the verifier)
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
import { nowcastSourcesFor, readNowcastPoint } from '../../src/point/client/nowcastPoint.ts';
import { loadHmodelManifest, readHmodelPoint } from '../../src/point/client/staticPoint.ts';
import { planPointSources } from '../../src/point/client/resolve.ts';
import { TIERS } from '../../src/point/cubeFormat.ts';
import { getPointForecast } from '../../src/pointForecast/pointForecast.ts';
import { quantileOf, meanOf } from '../../src/pointForecast/fusion/dist.ts';
import { fetchTawesHistory } from '../../src/sources/geosphereTawes.ts';
import { fetchSmnHistory } from '../../src/sources/meteoSwissSmn.ts';

import {
  newSlot, encodeValue, encodeSeries, LIVE_SCALES, TRUTH_SCALES, serialiseSlot, mergeSlot, slotPaths, SENTINEL,
} from './lib/punktarchiv.mjs';
import {
  POI_URL, parsePoi, poiSeries, hourMapSeries, TAWES_HISTORY_URL, TAWES_10MIN, SMN_NOW_URL, parseTawes10min, parseSmn10min, tenMinColumns,
} from './lib/truth.mjs';
import { loadPointList } from './points.mjs';

const H = 3_600_000;
const PRODUCER = 'buscosun-web/scripts/punktarchiv/collect.mjs';

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

async function collectCube(store, index, points, slot, opts) {
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
    slot.cube[t] = {
      run: lb.run, runAt: lb.runAt, sourceRun: lb.sourceRun, sourceRunAt: lb.sourceRunAt, ageH: lb.ageH,
      manifest: lb.manifest, leadHours: tm?.leadHours ?? null, planeOrder: manifest.planes.map((p) => p.id),
      provenance: { quantiles: tm?.quantiles ? { source: tm.quantiles.source, run: tm.quantiles.run, vars: tm.quantiles.vars } : null,
        ensemble: tm?.ensemble ? { byHour: tm.ensemble.byHour, sources: (tm.ensemble.sources ?? []).map((s) => ({ id: s.id, run: s.run, vars: s.vars, members: s.membersRead })) } : null,
        profile: tm?.profile ? { source: tm.profile.source, run: tm.profile.run, calibrated: tm.profile.calibrated } : null,
        pressure: tm?.pressure ? { levels: tm.pressure.levels, sources: (tm.pressure.sources ?? []).map((s) => s.id) } : null,
        hmodelChanged: tm?.hmodel?.changed ?? null },
      sources: (manifest.sources ?? []).filter((s) => s.tier === t).map((s) => ({ id: s.id, runAt: s.runAt, offsetH: s.offsetH, steps: s.steps, role: s.role, coverage: s.coverage })),
      fusion: manifest.fusion ? { weights: manifest.fusion.weights, provenance: manifest.fusion.provenance } : null,
      byPoint: {},
    };
    let ok = 0;
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
        ok++;
      } catch (e) { slot.stats.errors.push(`cube/${t}/${p.id}: ${e.message}`); slot.cube[t].byPoint[p.id] = null; }
    }
    slot.stats.timing[`cube.${t}`] = Date.now() - t0;
    console.log(`[collect] cube ${t}: Lauf ${lb.run} (Quell-Lauf ${lb.sourceRun}) · ${ok}/${points.length} Punkte · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

// ─── stations ─────────────────────────────────────────────────────────────
async function collectStations(store, index, points, slot) {
  const t0 = Date.now();
  const run = index.stations?.runs?.[0];
  if (!run) { slot.stats.errors.push('stations: kein Lauf im Index'); return; }
  const [catalog, manifest] = await Promise.all([loadStationCatalog(store), store.json(run.manifest)]);
  if (!catalog || !manifest) { slot.stats.errors.push('stations: Katalog oder Manifest nicht lesbar'); return; }
  slot.stations = {
    run: run.run, runAt: run.runAt, ageH: run.ageH, manifest: run.manifest, leadHours: manifest.axis?.leadHours ?? null,
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
      const c = { ...s, distanceKm: distanceKm(p.lat, p.lon, s.lat, s.lon), dElevM: p.demM == null ? null : s.elev - p.demM };
      const ser = await readStationPoint(store, manifest, c);
      if (!ser) { slot.stations.byPoint[p.id] = null; continue; }
      const planes = {};
      const empty = [];
      for (const pl of ser.planes) {
        let any = false;
        const col = ser.steps.map((st) => { const v = st.values[pl.id]; if (v != null) any = true; return encodeValue(v, pl); });
        if (any) planes[pl.id] = col; else empty.push(pl.id);
      }
      slot.stations.byPoint[p.id] = { station: { id: c.id, distanceKm: c.distanceKm, dElevM: c.dElevM }, planes, empty };
      ok++;
    } catch (e) { slot.stats.errors.push(`stations/${p.id}: ${e.message}`); slot.stations.byPoint[p.id] = null; }
  }
  slot.stats.timing.stations = Date.now() - t0;
  console.log(`[collect] stations: Lauf ${run.run} (${run.ageH} h alt) · ${ok}/${points.length} Punkte · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ─── nowcast + hmodel + plan ───────────────────────────────────────────────
async function collectNowcast(store, points, slot, slotAtMs) {
  const t0 = Date.now();
  let ok = 0;
  for (const p of points) {
    const srcs = nowcastSourcesFor(p.lat, p.lon);
    const out = { covering: srcs, bySource: {} };
    for (const src of srcs) {
      try {
        const ser = await readNowcastPoint(store, src, p.lat, p.lon, { nowMs: slotAtMs, decodePng, fromMs: slotAtMs - 30 * 60_000, untilMs: slotAtMs + 3 * H });
        out.bySource[src] = ser ? {
          stamp: ser.stamp, slotAgeMin: ser.slotAgeMin, probes: ser.probes, extrapolationH: ser.extrapolationH,
          frames: ser.frames.map((f) => ({ lead: f.lead, validAtMs: f.validAtMs, mmh: f.mmh == null ? SENTINEL : encodeValue(f.mmh, { scale: 0.01, offset: 0 }), saturated: !!f.saturated, validAtSuspect: !!f.validAtSuspect })),
        } : null;
      } catch (e) { slot.stats.errors.push(`nowcast/${src}/${p.id}: ${e.message}`); out.bySource[src] = null; }
    }
    if (srcs.length) ok++;
    slot.nowcast.byPoint[p.id] = out;
  }
  slot.nowcast.scale = { mmh: { scale: 0.01, offset: 0, unit: 'mm/h' } };
  slot.stats.timing.nowcast = Date.now() - t0;
  console.log(`[collect] nowcast: ${ok}/${points.length} Punkte von einer Radarquelle gedeckt · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
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
  for (const p of points) {
    try {
      const plan = await planPointSources(store, { lat: p.lat, lon: p.lon, elevationM: p.demM, fromMs: slotAtMs, toMs: slotAtMs + 336 * H, stepH: 6, nowMs: slotAtMs });
      slot.plan.byPoint[p.id] = plan ? {
        station: { accepted: plan.station.accepted, reason: plan.station.reason, candidate: plan.station.candidate ? { id: plan.station.candidate.id, distanceKm: plan.station.candidate.distanceKm, dElevM: plan.station.candidate.dElevM } : null },
        nowcast: plan.nowcast.covering,
        segments: plan.segments.map((s) => ({ fromMs: s.fromMs, toMs: s.toMs, primary: s.primary, alternative: s.alternative, precip: s.precip, uncertainty: s.uncertainty, steps: s.steps })),
        gaps: plan.gaps,
      } : null;
    } catch (e) { slot.stats.errors.push(`plan/${p.id}: ${e.message}`); slot.plan.byPoint[p.id] = null; }
  }
  slot.plan.selection = { stationMaxKm: 15, stationMaxDElevM: 100, calibrated: false };
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
  slot.live.caveats = [
    'Live-Pfad in Node: KEIN Radar-Nowcast (src/sources/radolan.ts braucht einen Web Worker); der Cube-Pfad trägt den Nowcast aus dem Spiegel.',
    'DEM über lib/nodeShims.mjs (dieselben Terrarium-Bytes, der Decoder des Repos statt createImageBitmap).',
    'UV über die Umschreibung /_dwd_opendata/ → opendata.dwd.de (was netlify.toml im Browser tut).',
    `Stunden: ${opts.liveHours} je Punkt, die ersten ${opts.liveFull} Punkte mit 372 h (GFS-Schwanz jenseits 240 h kostet ~20 GRIB-Anfragen je Punkt).`,
  ];
  let ok = 0;
  await mapLimit(points, opts.liveConcurrency, async (p, i) => {
    const hours = i < opts.liveFull ? 372 : opts.liveHours;
    try {
      // `profile`: the DACH country profile (neighbour points keep the one PA1 used — AT/CH — so their live series does not break).
      const fc = await getPointForecast({ lat: p.lat, lng: p.lon, country: p.profile ?? p.country, hours, includeRadarNowcast: false, distribution: true, anchorMode: 'offset', signal: AbortSignal.timeout(180_000) });
      slot.live.byPoint[p.id] = encodeLive(fc);
      ok++;
    } catch (e) { slot.stats.errors.push(`live/${p.id}: ${e.message}`); slot.live.byPoint[p.id] = { error: String(e.message) }; }
  });
  slot.stats.timing.live = Date.now() - t0;
  console.log(`[collect] live: ${ok}/${points.length} Punkte · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ─── truth ─────────────────────────────────────────────────────────────────
async function collectTruth(points, slot, slotAtMs) {
  const t0 = Date.now();
  const fromMs = slotAtMs - 24 * H;
  let poiOk = 0;
  const poiPoints = points.filter((p) => p.truth?.poi !== false);   // PA2 points without a POI file are not asked (no 404 per point)
  for (const p of points) slot.truth.byPoint[p.id] = { poi: null };
  await mapLimit(poiPoints, 6, async (p) => {
    const rec = slot.truth.byPoint[p.id];
    try {
      const txt = await fetchText(POI_URL(p.id));
      if (txt) {
        const rows = parsePoi(txt);
        const s = poiSeries(rows, fromMs, slotAtMs);
        rec.poi = { obsAtMs: s.obsAtMs, n: s.obsAtMs.length };
        for (const k of Object.keys(TRUTH_SCALES)) if (s[k] !== undefined) rec.poi[k] = encodeSeries(s[k], TRUTH_SCALES[k]);
        poiOk++;
      }
    } catch (e) { slot.stats.errors.push(`truth/poi/${p.id}: ${e.message}`); }
  });
  // PA2 (§9.3.1 (6)): the 10-min series the app's hourly readers do not keep — hour sums `rr1h`
  // (six values stamped h−50…h), measured `td` and reduced `p`. TAWES: one request per ≤ 100 ids
  // (URL limit ≈ 2 kB); SMN: the day file per station. A failure costs the extra columns, never the record.
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
  const networkRecord = (byHour, extra) => {
    const s = hourMapSeries(byHour, fromMs, slotAtMs);
    const rec = { obsAtMs: s.obsAtMs, n: s.obsAtMs.length };
    const cols = extra ? tenMinColumns(extra, s.obsAtMs) : null;
    if (cols) { s.td = cols.td; s.p = cols.p; }
    s.rr1h = cols ? cols.rr1h : s.obsAtMs.map(() => null);
    for (const k of Object.keys(TRUTH_SCALES)) if (s[k] !== undefined) rec[k] = encodeSeries(s[k], TRUTH_SCALES[k]);
    return rec;
  };
  let tawesOk = 0, smnOk = 0;
  // TAWES: one call for all AT ids, SMN: per-station day files (the module paces itself).
  if (tawesIds.length) {
    try {
      const m = await fetchTawesHistory(tawesIds, 24, AbortSignal.timeout(60_000));
      for (const p of points) {
        const byHour = p.truth?.tawes ? m.get(p.truth.tawes) : null;
        if (!byHour) continue;
        slot.truth.byPoint[p.id].tawes = networkRecord(byHour, tenMin.get(`tawes:${p.truth.tawes}`));
        tawesOk++;
      }
    } catch (e) { slot.stats.errors.push(`truth/tawes: ${e.message}`); }
  }
  if (smnAbbrs.length) {
    try {
      const m = await fetchSmnHistory(smnAbbrs, 24, AbortSignal.timeout(120_000));
      for (const p of points) {
        const byHour = p.truth?.smn ? m.get(p.truth.smn) : null;
        if (!byHour) continue;
        slot.truth.byPoint[p.id].smn = networkRecord(byHour, tenMin.get(`smn:${p.truth.smn}`));
        smnOk++;
      }
    } catch (e) { slot.stats.errors.push(`truth/smn: ${e.message}`); }
  }
  slot.truth.caveats = [
    'POI: stündlich, 24-h-Rollfenster des DWD, Stationskennung = WMO-Kennung, Zeit = UTC aus den Spalten Datum/Uhrzeit.',
    'TAWES/SMN: 10-min-Werte auf den Stundenboden abgetastet (≤ 10 min), rr1 dort = Rate der letzten 10 min × 6 (mm/h), NICHT die Stundensumme wie bei POI.',
    'TAWES/SMN rr1h (PA2): Stundensumme der sechs 10-min-Werte mit Stempel h−50…h (Stempel = Intervallende; SMN gegen POI auf die Stelle gemessen, TAWES laut API „letzte 10 Minuten"), Sentinel wenn einer fehlt — DAS ist die mit POI rr1 vergleichbare Größe. td (TAWES TP, SMN tde200s0) und p (reduziert: TAWES PRED, SMN pp0qffs0) am Stundenstempel.',
    'SMN-Tagesdatei trägt nur den laufenden UTC-Tag: im 23:10-Slot fehlen die Vortagsstunde 23:00 und die Stundensumme um 00:00; Nachholweg _t_recent.csv.',
    'Punkte ohne POI-Datei (PA2, AT/CH an der Messstelle) tragen poi: null — nicht abgefragt.',
    'Alle Messzeiten liegen ≤ Slotzeit (As-of-Wächter der Bibliothek).',
  ];
  slot.stats.timing.truth = Date.now() - t0;
  console.log(`[collect] truth: POI ${poiOk}/${poiPoints.length} · TAWES ${tawesOk}/${tawesIds.length} (10 min ${[...tenMin.keys()].filter((k) => k.startsWith('tawes:')).length}) · SMN ${smnOk}/${smnAbbrs.length} (10 min ${[...tenMin.keys()].filter((k) => k.startsWith('smn:')).length}) · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
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
    const fc = await getPointForecast({ lat: p.lat, lng: p.lon, country: p.country, hours: a.n + 1, includeRadarNowcast: false, distribution: true, anchorMode: 'offset' });
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
  slot.pointsFrom = { file: 'scripts/punktarchiv/points.json', builtAt: list.builtAt, total: list.points.length, used: points.length };
  slot.points = points.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, elev: p.elev, demM: p.demM, country: p.country, profile: p.profile ?? p.country, wmo: p.wmo, truth: p.truth, ...(p.mosmix ? { mosmix: p.mosmix } : {}) }));
  console.log(`[collect] Slot ${slot.slotAt} · ${points.length} Punkte · Repo ${store.base} · Ausgabe ${outRoot}${flags.dry ? ' (dry)' : ''}`);

  const index = await loadPointIndex(store);
  if (!index) throw new Error('point/index.json nicht erreichbar');
  slot.index = {
    commit: index.commit, publishedAt: index.publishedAt, schema: index.schema, base: store.base,
    latestByTier: Object.fromEntries(Object.entries(index.latestByTier ?? {}).map(([t, v]) => [t, v ? { run: v.run, runAt: v.runAt, sourceRun: v.sourceRun, ageH: v.ageH } : null])),
    stations: index.stations?.runs?.[0] ? { run: index.stations.runs[0].run, runAt: index.stations.runs[0].runAt, ageH: index.stations.runs[0].ageH } : null,
    retentionByTier: index.retentionByTier ?? null,
  };
  console.log(`[collect] Index ${String(index.commit).slice(0, 7)} (${index.publishedAt}) · t1 ${index.latestByTier?.t1?.run} · t2 ${index.latestByTier?.t2?.run} · t3 ${index.latestByTier?.t3?.run} · Stationen ${index.stations?.runs?.[0]?.run}`);

  if (!flags['no-cube']) {
    await collectCube(store, index, points, slot, {});
    await collectStations(store, index, points, slot);
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
  console.log(`[collect] Slot-Größe ${(bytes.length / 1048576).toFixed(2)} MiB (gzip) · ${(JSON.stringify(slot).length / 1048576).toFixed(1)} MiB roh · ${slot.stats.errors.length} Fehler · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const e of slot.stats.errors.slice(0, 10)) console.log(`   ⚠ ${e}`);
  if (slot.stats.errors.length > 10) console.log(`   … ${slot.stats.errors.length - 10} weitere`);

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
  if (flags.json) console.log(JSON.stringify({ slot: slotPaths(slotAtMs), points: points.length, bytes: res.bytes, ms: slot.stats.timing.total, errors: slot.stats.errors.length, net: slot.stats.net }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
