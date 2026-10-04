#!/usr/bin/env node
/**
 * V-AW-21 — does the SWIS air temperature as measurement anchor make the route forecast better?
 * (audit/autobahnwetter.md §16; rule of decision frozen there BEFORE the first score.)
 *
 * `compute`: buscosun Fusion 8 at every station point of a SNAPSHOT of the data repo (a plain copy of `point/`,
 * `road/`, `radar/img`), once per variant, same store and same clock:
 *   N    no anchor (the producer until now)
 *   S1   the station's own measurement, temperature only
 *   S6   own measurement plus up to five neighbours
 *   L    neighbours only (leave-station-out — what an axis point between stations would get)
 *   S1w, Lw   as S1 / L with wind and gust (only where the slot has an obs file; the 24-h rings carry no wind)
 * An issue time inside the snapshot's past is emulated with `--t1=<run>` / `--stations=<run>` (the pointer of the
 * cube is pinned to the run that was newest then) and measurements from the 24-h rings.
 *
 * `score`: forecasts against the stations' own later measurements (24-h rings of one or more later snapshots; wind
 * from their obs files), paired against N per station.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-fc-anchor-backtest.mjs \
 *     compute --snap=<dir> --now=<ISO> [--t1=<run>] [--stations=<run>] [--slot=<stamp>] [--variants=N,S1] --out=<file> [--limit=N]
 *   … score --in=<a.json,b.json> --truth=<dir,dir> [--md=<file>]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { installNodeShims } from '../punktarchiv/lib/nodeShims.mjs';
import { dirStore, geoBackend, makeIo, computePoint, swisTable, anchorObsFor, ROAD_FC_ANCHOR } from './road-forecast.mjs';
import { ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH, roadFcT0, roadFcDecode, parseRoadFcPoints } from '../../src/road/roadFc.ts';
import { ROAD_REPO_DIR, ROAD_STATIONS_PATH, ROAD_SLOT_MS, roadStamp, roadStampToMs, roadSlotOf } from '../../src/road/roadContract.ts';

const H = 3_600_000;
const LEADS = 12;
const VARIANTS = {
  N: null,
  S1: {},
  S6: { withNeighbours: true },
  L: { leaveOut: true },
  S1w: { wind: true },
  Lw: { leaveOut: true, wind: true },
};
const flags = Object.fromEntries(process.argv.slice(3).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** Newest ring file of every group → Map(id → Map(slotMs → { ta, td })). */
function ringTruth(dir, into = new Map()) {
  const base = join(dir, ROAD_REPO_DIR, 'h24');
  for (const g of readdirSync(base)) {
    const files = readdirSync(join(base, g)).filter((f) => f.endsWith('.json')).sort();
    if (!files.length) continue;
    const doc = readJson(join(base, g, files[files.length - 1]));
    const ms = doc.slots.map(roadStampToMs);
    for (const [id, s] of Object.entries(doc.stations)) {
      if (!into.has(id)) into.set(id, new Map());
      const m = into.get(id);
      ms.forEach((t, i) => { if (s.ta?.[i] != null || s.td?.[i] != null) m.set(t, { ta: s.ta?.[i] ?? null, td: s.td?.[i] ?? null }); });
    }
  }
  return into;
}

/** Obs files of a snapshot → Map(id → Map(slotMs → { ws, wg })). */
function obsWind(dir, into = new Map()) {
  const base = join(dir, ROAD_REPO_DIR, 'obs');
  for (const f of readdirSync(base)) {
    const t = roadStampToMs(f.replace('.json', ''));
    for (const p of readJson(join(base, f)).points ?? []) {
      if (p.ws == null && p.wg == null) continue;
      if (!into.has(p.id)) into.set(p.id, new Map());
      into.get(p.id).set(t, { ws: p.ws ?? null, wg: p.wg ?? null });
    }
  }
  return into;
}

/** Store whose cube pointer names the runs that were newest at the emulated issue time. */
function pinnedStore(base, pin) {
  if (!pin.t1 && !pin.stations) return base;
  const PATH = 'point/index.json';
  let doc = null;
  const get = async () => {
    if (doc) return doc;
    const j = JSON.parse(JSON.stringify(await base.json(PATH)));
    if (pin.t1) {
      const r = j.runs.find((x) => x.run === pin.t1 && x.tierRuns.some((t) => t.id === 't1'));
      if (!r) throw new Error(`Lauf ${pin.t1} trägt keine Stufe 1 im Schnappschuss`);
      const tr = r.tierRuns.find((t) => t.id === 't1');
      j.latestByTier.t1 = { ...j.latestByTier.t1, run: tr.run, runAt: tr.runAt, path: r.path, manifest: `${r.path}/run.json`, sourceRun: tr.run, sourceRunAt: tr.runAt, files: tr.files, bytes: tr.bytes };
    }
    if (pin.stations) {
      j.stations.runs = j.stations.runs.filter((x) => x.run <= pin.stations);
      if (!j.stations.runs.length) throw new Error(`kein Stationslauf ≤ ${pin.stations}`);
    }
    return (doc = j);
  };
  const norm = (p) => String(p).replace(/^\/+/, '');
  const self = {
    ...base,
    json: (p) => (norm(p) === PATH ? get() : base.json(p)),
    bytes: async (p) => (norm(p) === PATH ? new TextEncoder().encode(JSON.stringify(await get())) : base.bytes(p)),
    withBase: () => self,
  };
  return self;
}

async function compute() {
  const snap = flags.snap, nowMs = Date.parse(flags.now);
  if (!snap || !Number.isFinite(nowMs) || !flags.out) throw new Error('compute: --snap, --now, --out');
  installNodeShims();
  const fcDir = join(snap, ROAD_FC_REPO_DIR);
  const points = parseRoadFcPoints(readJson(join(fcDir, ROAD_FC_POINTS_PATH))).points;
  const catalog = readJson(join(snap, ROAD_REPO_DIR, ROAD_STATIONS_PATH)).stations;
  // Measurements of the newest slot ≤ now: the obs file when the snapshot still has it, else the rings (T, Td only).
  // --slot=<stamp>: a chosen measurement slot (e.g. the last full hour) instead of the newest one.
  const slotMs = typeof flags.slot === 'string' ? roadStampToMs(flags.slot) : roadSlotOf(nowMs);
  const obsFile = join(snap, ROAD_REPO_DIR, 'obs', `${roadStamp(slotMs)}.json`);
  let rows, wind = false;
  if (existsSync(obsFile)) { rows = readJson(obsFile).points; wind = true; }
  else {
    // Bulletin positions from the newest obs file of the snapshot (the rings carry none).
    const anyObs = readdirSync(join(snap, ROAD_REPO_DIR, 'obs')).sort().pop();
    const pos = new Map(readJson(join(snap, ROAD_REPO_DIR, 'obs', anyObs)).points.map((p) => [p.id, p]));
    const truth = ringTruth(snap);
    rows = [];
    for (const [id, m] of truth) {
      const v = m.get(slotMs), p = pos.get(id);
      if (v?.ta != null && p) rows.push({ id, n: p.n, lat: p.lat, lon: p.lon, t: slotMs, ta: v.ta, td: v.td });
    }
  }
  const table = swisTable(rows.filter((r) => r.t <= nowMs && nowMs - r.t <= (typeof flags.slot === 'string' ? 75 * 60_000 : ROAD_FC_ANCHOR.maxAgeMs)), catalog, points);
  let stations = points.filter((p) => p.kind === 'station' && table.has(p.id));
  if (flags.limit) stations = stations.slice(0, Number(flags.limit));
  const variants = Object.keys(VARIANTS).filter((k) => (wind || !VARIANTS[k]?.wind) && (typeof flags.variants !== 'string' || flags.variants.split(',').includes(k)));
  const store = pinnedStore(dirStore(snap), { t1: typeof flags.t1 === 'string' ? flags.t1 : null, stations: typeof flags.stations === 'string' ? flags.stations : null });
  const io = makeIo({ store, cache: geoBackend(readJson(join(fcDir, ROAD_FC_GEO_PATH))), nowMs });
  const out = { issuedAt: new Date(nowMs).toISOString(), t0Ms: roadFcT0(nowMs), slot: roadStamp(slotMs), source: wind ? 'obs' : 'h24', pin: { t1: flags.t1 ?? null, stations: flags.stations ?? null }, variants, runs: null, table: table.size, stations: {} };
  const T0 = Date.now();
  let failed = 0;
  for (const [i, p] of stations.entries()) {
    const rec = { obs: {} };
    for (const k of variants) {
      const obs = VARIANTS[k] ? anchorObsFor(p, table, VARIANTS[k]) : null;
      if (VARIANTS[k] && !obs.length) continue;
      const r = await computePoint(p, io, nowMs, obs);
      if (r.error) { failed++; continue; }
      out.runs ??= r.runs;
      const cut = (a) => a.slice(0, LEADS + 1);
      rec[k] = { t: cut(r.point.v.t), td: cut(r.point.v.td), ff: cut(r.point.v.ff), fx: cut(r.point.v.fx), anc: r.point.anc ?? null, n: obs?.length ?? 0, stack: r.fc.cube.notes.some((n) => n.startsWith('stationValue: ') && n.includes('Innovation aus swis')) };
    }
    if (rec.N) out.stations[p.id] = rec;
    if ((i + 1) % 200 === 0) console.log(`[backtest] ${flags.now} ${i + 1}/${stations.length} · ${((Date.now() - T0) / 1000).toFixed(0)} s`);
  }
  out.failed = failed;
  writeFileSync(flags.out, JSON.stringify(out));
  console.log(`[backtest] ${flags.now}: ${Object.keys(out.stations).length} Stationen · Varianten ${variants.join(',')} · Messung ${out.source} ${out.slot} (${table.size}) · Cube ${JSON.stringify(out.runs)} · ${failed} ohne Ergebnis · ${((Date.now() - T0) / 1000).toFixed(0)} s`);
}

// --- Score ---------------------------------------------------------------------------------------

/** Two-sided p of a paired t statistic (normal approximation; n is in the hundreds). */
function pOf(d) {
  const n = d.length;
  if (n < 20) return NaN;
  const m = d.reduce((s, x) => s + x, 0) / n;
  const v = d.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
  if (!(v > 0)) return m === 0 ? 1 : 0;
  const z = Math.abs(m / Math.sqrt(v / n));
  const t = 1 / (1 + 0.2316419 * z);
  const phi = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  return 2 * phi * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
}

function score() {
  const docs = String(flags.in).split(',').map(readJson);
  const truth = new Map(), wind = new Map();
  for (const d of String(flags.truth).split(',')) { ringTruth(d, truth); obsWind(d, wind); }
  const BINS = [[1, 1], [2, 2], [3, 3], [4, 6], [7, 9], [10, 12]];
  const QUANT = [['t', 'ta', truth], ['td', 'td', truth], ['ff', 'ws', wind], ['fx', 'wg', wind]];
  // rows[variant][quantity][bin] = Map(station → { issue → [absErr variant, absErr N, err variant, err N] sums })
  const cell = new Map();
  const add = (key, id, issue, eV, eN) => {
    if (!cell.has(key)) cell.set(key, new Map());
    const m = cell.get(key);
    if (!m.has(id)) m.set(id, []);
    m.get(id).push({ issue, aV: Math.abs(eV), aN: Math.abs(eN), eV, eN });
  };
  for (const d of docs) {
    for (const [id, rec] of Object.entries(d.stations)) {
      for (const k of d.variants) {
        if (k === 'N' || !rec[k]) continue;
        for (const [q, tq, src] of QUANT) {
          if ((q === 'ff' || q === 'fx') && !VARIANTS[k]?.wind) continue;
          for (let i = 1; i <= LEADS; i++) {
            const y = src.get(id)?.get(d.t0Ms + i * H)?.[tq];
            const fV = roadFcDecode(q, rec[k][q][i]), fN = roadFcDecode(q, rec.N[q][i]);
            if (y == null || fV == null || fN == null) continue;
            const b = BINS.findIndex(([a, z]) => i >= a && i <= z);
            add(`${k}|${q}|${b}`, id, d.issuedAt, fV - y, fN - y);
          }
        }
      }
    }
  }
  const issues = docs.map((d) => d.issuedAt);
  const lines = [];
  const fmt = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : '—');
  lines.push(`Läufe: ${docs.map((d) => `${d.issuedAt.slice(11, 16)}Z (Messung ${d.source} ${d.slot}, Cube t1 ${d.runs?.t1}${d.pin.t1 ? ' nachgestellt' : ''}, ${Object.keys(d.stations).length} Stationen)`).join(' · ')}`);
  lines.push('');
  lines.push('| Variante | Größe | Vorlauf h | Stationen | Paare | MAE ohne Anker | MAE Variante | Δ % | p | Bias ohne | Bias Variante | je Lauf Δ % |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  const verdict = {};
  for (const k of Object.keys(VARIANTS)) for (const [q] of QUANT) BINS.forEach(([a, z], b) => {
    const m = cell.get(`${k}|${q}|${b}`);
    if (!m) return;
    const perStation = [], all = [];
    for (const rows of m.values()) { perStation.push(rows.reduce((s, r) => s + (r.aV - r.aN), 0) / rows.length); all.push(...rows); }
    const mean = (f, rows = all) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
    const mN = mean((r) => r.aN), mV = mean((r) => r.aV), p = pOf(perStation);
    const per = issues.map((is) => { const rows = all.filter((r) => r.issue === is); return rows.length >= 50 ? 100 * (mean((r) => r.aN, rows) - mean((r) => r.aV, rows)) / mean((r) => r.aN, rows) : null; });
    const gain = 100 * (mN - mV) / mN;
    verdict[`${k}|${q}|${a}-${z}`] = { gain, p, per, n: all.length };
    lines.push(`| ${k} | ${q} | ${a === z ? a : `${a}–${z}`} | ${m.size} | ${all.length} | ${fmt(mN)} | ${fmt(mV)} | ${gain >= 0 ? '+' : ''}${fmt(gain, 1)}${p < 0.05 ? (gain > 0 ? ' *' : ' !') : ''} | ${p < 0.001 ? '< 0,001' : fmt(p, 3)} | ${fmt(mean((r) => r.eN))} | ${fmt(mean((r) => r.eV))} | ${per.map((x) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}`)).join(' · ')} |`);
  });
  lines.push('');
  lines.push('Δ % = (MAE ohne Anker − MAE Variante) / MAE ohne Anker, positiv = Variante besser; * / ! = p < 0,05 (gepaart je Station, Mittel der Läufe). „je Lauf" in der Reihenfolge der Läufe oben, — = unter 50 Paare.');
  const text = lines.join('\n') + '\n';
  if (typeof flags.md === 'string') writeFileSync(flags.md, text);
  if (typeof flags.json === 'string') writeFileSync(flags.json, JSON.stringify(verdict, null, 1));
  console.log(text);
}

const mode = process.argv[2];
(mode === 'compute' ? compute() : mode === 'score' ? Promise.resolve(score()) : Promise.reject(new Error('compute | score'))).catch((e) => { console.error(e); process.exit(1); });
