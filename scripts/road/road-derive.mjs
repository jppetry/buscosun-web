#!/usr/bin/env node
/**
 * AW-2 — Derive step of Autobahnwetter: the bulletins of ONE 15-min slot → checked files for `road/v1/`
 * (`audit/autobahnwetter.md`). Spawned per slot by the radar mirror (`radar-mirror.mjs` in the data repo) as a
 * CHILD PROCESS from the buscosun-web clone — the same contract module (`src/road/roadContract.ts`) the browser
 * loads decides what may be published (one rule, three consumers: derive, client, verifier).
 *
 *   node --experimental-strip-types --import <app>/scripts/lib/register-ts.mjs \
 *     <app>/scripts/road/road-derive.mjs <inDir> <storeDir> <outDir> <stamp>
 *
 * <inDir>     `<group>.bin` per DWD series of the slot + `groups.json` ({group: {state, ageMin}}, `_catalog`, `_killed`,
 *             optional `_cubeT2m` {stationId: °C} for the observe-only cube rule, or `_fcDir` = the clone's
 *             `road/fc/v1`, from which the reference is read: V-AW-1, `road-fc-ref.mjs`)
 * <storeDir>  the mirror's local `road/v1/` (read only here: `state.json`, `static/stations.json`, `h24/<group>/…`)
 * <outDir>    written atomically (tmp dir + rename): obs/, quarantine/, h24/, state.json, summary.json
 *
 * Prints ONE JSON line: {"ok":true,"stamp":…,"publish":true|false,"reasons":[…],"points":…,"balance":{…},…}
 * The slot lock lives here (`gate.publish`); the mirror only obeys it.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeSwisFile } from '../../src/road/swisBufr.ts';
import {
  ROAD_DEADLINE_MS, ROAD_DWD_BASE, ROAD_GROUPS, ROAD_H24_SLOTS, ROAD_POLL_MS, ROAD_REPO_DIR, ROAD_RETENTION,
  ROAD_SLOT_MS, ROAD_STATE_PATH, ROAD_STATIONS_PATH, ROAD_STATUS_PATH,
  roadH24Path, roadObsPath, roadQuarantinePath, roadStampToMs, roadStamp,
  validateRoadSlot, roadObsRoundTripOk, ROAD_CLASS_CODE, ROAD_CLASS_NONE,
} from '../../src/road/roadContract.ts';
import { makeInDE } from './deMask.mjs';
import { roadFcReference } from './road-fc-ref.mjs';
import { readStationPositions, stationPosition } from './station-positions.mjs';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/** Catalogue file → the rule's view ({road, dir, lat, lon}) plus km for the fallback. */
function catalogView(file) {
  if (!file?.stations) return null;
  const out = {};
  for (const [id, s] of Object.entries(file.stations)) out[id] = { road: s.roadRaw ?? s.road ?? null, dir: s.dir ?? null, lat: s.lat ?? null, lon: s.lon ?? null, km: s.km ?? null, h: s.h ?? null };
  return out;
}

/**
 * M5 (D-9): six stations report "0 m a.s.l." (P970 lies at 710 m by the catalogue, P780 at 645 m) — a missing elevation, not
 * a height. Then the catalogue's elevation counts, without one none.
 */
export function elevOf(elevM, cat) {
  if (elevM == null || elevM !== 0) return elevM ?? null;
  return cat?.h != null && cat.h > 0 ? cat.h : null;
}

/** Newest ring file of a group strictly before `stamp`. */
function previousRing(storeDir, group, stamp) {
  const dir = join(storeDir, 'h24', group);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^\d{10}\.json$/.test(f) && f.slice(0, 10) < stamp).sort();
  return files.length ? readJson(join(dir, files.at(-1))) : null;
}

/**
 * Next 24-h ring of one series: previous ring + this slot's VALID values (0.1 °C) and the station class as one
 * character (`k`, E-AW-6: the backtest of AW-6 needs the measured state, not only temperatures), at most 96 slots, ≤ 24 h.
 */
export function nextRing(prev, group, stamp, points) {
  const slotMs = roadStampToMs(stamp);
  const oldestMs = slotMs - (ROAD_H24_SLOTS - 1) * ROAD_SLOT_MS;
  const prevSlots = (prev?.slots ?? []).filter((s) => s < stamp && roadStampToMs(s) >= oldestMs);
  const keepIdx = (prev?.slots ?? []).map((s, i) => (prevSlots.includes(s) ? i : -1)).filter((i) => i >= 0);
  const slots = [...prevSlots, stamp].slice(-ROAD_H24_SLOTS);
  const drop = prevSlots.length + 1 - slots.length;
  const stations = {};
  const take = (arr) => keepIdx.map((i) => arr[i] ?? null).slice(drop);
  // A ring written before `k` existed counts as "no class" in its old slots.
  const takeK = (k) => keepIdx.map((i) => (typeof k === 'string' ? k[i] ?? ROAD_CLASS_NONE : ROAD_CLASS_NONE)).slice(drop).join('');
  for (const [id, v] of Object.entries(prev?.stations ?? {})) {
    stations[id] = { rs: [...take(v.rs), null], ta: [...take(v.ta), null], td: [...take(v.td), null], k: takeK(v.k) + ROAD_CLASS_NONE };
  }
  const n = slots.length;
  for (const p of points) {
    const s = (stations[p.id] ??= { rs: Array(n).fill(null), ta: Array(n).fill(null), td: Array(n).fill(null), k: ROAD_CLASS_NONE.repeat(n) });
    s.rs[n - 1] = r1(p.rs); s.ta[n - 1] = r1(p.ta); s.td[n - 1] = r1(p.td);
    s.k = s.k.slice(0, n - 1) + (ROAD_CLASS_CODE[p.cls] ?? ROAD_CLASS_NONE);
  }
  // Stations without a single value in the ring leave it.
  for (const [id, s] of Object.entries(stations)) if (![...s.rs, ...s.ta, ...s.td].some((v) => v != null)) delete stations[id];
  return { schema: 1, product: 'road-h24', group, slot: stamp, slots, stations };
}

/** In-process entry (verifiers) — same as the CLI. */
export function deriveRoadSlot({ inDir, storeDir, outDir, stamp, inDE = makeInDE(), nowIso, positions = readStationPositions() }) {
  const t0 = Date.now();
  const slotMs = roadStampToMs(stamp);
  if (!Number.isFinite(slotMs)) throw new Error(`unlesbarer Slot ${stamp}`);
  const meta = readJson(join(inDir, 'groups.json')) ?? {};
  const catalogFile = readJson(join(storeDir, ROAD_STATIONS_PATH));
  const catalog = catalogView(catalogFile);
  const posCount = { posCatalog: 0, posUnverified: 0 };
  const groups = {};
  const stations = [];
  const decodeErrors = {};
  for (const g of ROAD_GROUPS) {
    const m = meta[g.id] ?? {};
    const file = join(inDir, `${g.id}.bin`);
    if (!existsSync(file)) {
      if (m.state || !g.sporadic) groups[g.id] = { state: m.state === 'stale' ? 'stale' : 'missing', ageMin: m.ageMin ?? null, stations: 0 };
      continue;
    }
    let recs;
    try { recs = decodeSwisFile(new Uint8Array(readFileSync(file))).records; } catch (e) {
      decodeErrors[g.id] = String(e.message ?? e);
      groups[g.id] = { state: 'failed', ageMin: m.ageMin ?? null, stations: 0 };
      continue;
    }
    groups[g.id] = { state: m.state === 'stale' ? 'stale' : 'ok', ageMin: m.ageMin ?? 0, stations: recs.length };
    for (const r of recs) {
      if (!r.id) continue;
      const cat = catalog?.[r.id];
      // M6: one position for marker and forecast point — the bulletin's, unless only the catalogue's lies at the
      // station's road (`station-positions.json`). Without a bulletin position nothing changes (rule `outsideDE`).
      const hasPos = r.lat != null && r.lon != null;
      const pos = hasPos ? stationPosition(positions, r.id, { lat: r.lat, lon: r.lon }, cat ? { lat: cat.lat, lon: cat.lon } : null) : null;
      if (pos?.flag) posCount[pos.flag]++;
      stations.push({
        id: r.id, group: g.id, name: r.name, highway: r.highway,
        // AW-0: Saxony sends route km 0 for every station — then the catalogue's km (100-m units) counts.
        km: r.km != null && r.km > 0 ? r.km : (cat?.km ?? null),
        lat: pos ? pos.lat : r.lat, lon: pos ? pos.lon : r.lon, elevM: elevOf(r.elevM, cat), obsMs: r.obsMs,
        ...(pos?.flag ? { posFlag: pos.flag } : {}), ...(pos?.flag === 'posCatalog' ? { reportPos: [r.lat, r.lon] } : {}),
        airT: r.airT, dewT: r.dewT, rh: r.rh, visM: r.visM,
        sensors: r.sensors.map((s) => ({ roadT: s.roadT, filmMm: s.filmMm, cond: s.cond })),
        windMs: r.windMs, gustMs: r.gustMs, windDir: r.windDir,
        precipType: r.precipType, precipRateMmH: r.precipRateMmH, precipMm: r.precipMm, precipIntensity: r.precipIntensity, quality: r.quality,
      });
    }
  }

  // V-AW-1: reference of the `cube` rule — given directly, or read from the route forecast of the mirror's clone.
  let cubeRef = meta._cubeT2m ? { run: null, step: null, cubeT2m: meta._cubeT2m } : null;
  if (!cubeRef && typeof meta._fcDir === 'string') { try { cubeRef = roadFcReference(meta._fcDir, slotMs); } catch { cubeRef = null; } }
  const res = validateRoadSlot({
    slotMs, stations, catalog, catalogEtag: catalogFile?.source?.etag ?? null,
    catalogState: meta._catalog === 'stale' ? 'stale' : catalogFile ? 'ok' : 'missing',
    prev: readJson(join(storeDir, ROAD_STATE_PATH)), inDE, cubeT2m: cubeRef?.cubeT2m ?? undefined,
    groups, killed: !!meta._killed, createdAt: nowIso ?? new Date().toISOString(),
  });
  if (!roadObsRoundTripOk(res.obs)) {
    res.gate.publish = false;
    res.gate.reasons.push({ rule: 'slotSchema', detail: 'obs-Datei besteht den Client-Prüfer im Rundlauf nicht' });
  }

  const tmp = `${outDir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  let files = 0, bytes = 0;
  const put = (rel, obj) => {
    const p = join(tmp, rel);
    mkdirSync(dirname(p), { recursive: true });
    const text = JSON.stringify(obj) + '\n';
    writeFileSync(p, text);
    files++; bytes += Buffer.byteLength(text);
  };
  put(roadQuarantinePath(stamp), res.quarantine);
  put(ROAD_STATE_PATH, res.state);
  const h24Groups = [];
  if (res.gate.publish) {
    put(roadObsPath(stamp), res.obs);
    for (const [gid, gs] of Object.entries(groups)) {
      if (gs.state !== 'ok') continue;
      const pts = res.obs.points.filter((p) => p.g === gid);
      put(roadH24Path(gid, stamp), nextRing(previousRing(storeDir, gid, stamp), gid, stamp, pts));
      h24Groups.push(gid);
    }
  }
  const summary = {
    ok: true, stamp, publish: res.gate.publish, reasons: res.gate.reasons, points: res.obs.points.length,
    killed: res.obs.killed, groups, decodeErrors, h24Groups,
    // M6: how many stations show the catalogue position / a position that lies at no road of theirs.
    positions: positions ? { builtAt: positions.builtAt ?? null, ...posCount } : null,
    balance: res.balance, files, bytes, ms: Date.now() - t0,
    // V-AW-1: which run served as reference and for how many stations (the denominator of the observe rule).
    cubeRef: cubeRef ? { run: cubeRef.run, step: cubeRef.step, stations: Object.keys(cubeRef.cubeT2m).length } : null,
  };
  put('summary.json', summary);

  mkdirSync(dirname(outDir), { recursive: true });
  rmSync(outDir, { recursive: true, force: true });
  let renamed = false;
  for (let i = 0; i < 5 && !renamed; i++) {
    try { renameSync(tmp, outDir); renamed = true; } catch { /* Windows EPERM: retry, then copy (radar-derive pattern) */ }
  }
  if (!renamed) { cpSync(tmp, outDir, { recursive: true }); rmSync(tmp, { recursive: true, force: true }); }
  return summary;
}

/** Contract constants for the mirror hook (`road-mirror.mjs` runs without the TS loader). */
export function roadPlan() {
  return {
    slotMs: ROAD_SLOT_MS, deadlineMs: ROAD_DEADLINE_MS, pollMs: ROAD_POLL_MS, dwdBase: ROAD_DWD_BASE,
    groups: ROAD_GROUPS, retention: ROAD_RETENTION, repoDir: ROAD_REPO_DIR,
    statePath: ROAD_STATE_PATH, statusPath: ROAD_STATUS_PATH, stationsPath: ROAD_STATIONS_PATH,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === '--plan') {
  console.log(JSON.stringify(roadPlan()));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inDir, storeDir, outDir, stamp] = process.argv.slice(2);
  if (!inDir || !storeDir || !outDir || !stamp) {
    console.error('usage: road-derive.mjs <inDir> <storeDir> <outDir> <stamp>');
    process.exit(2);
  }
  try {
    const s = deriveRoadSlot({ inDir, storeDir, outDir, stamp });
    const { balance, ...rest } = s;
    console.log(JSON.stringify({ ...rest, balance: { values: balance.values, rejected: balance.rejected, share: balance.share, byRule: balance.byRule, observe: balance.observe, flags: balance.flags, cubeRef: rest.cubeRef } }));
  } catch (e) {
    console.error(e.stack ?? e.message);
    process.exit(1);
  }
}

export { roadStamp };
