#!/usr/bin/env node
/**
 * fit-ruc.mjs — buscosun Fusion 14 (E-RUC-16, 26.10.2026): fits the ρ-curve of the family `ruc` (ICON-D2-RUC as a precipitation
 * member) on the hindcast slots with the RUC station series injected, truth W1. Working-tree engine (C:/dev/buscosun-web).
 *
 * RULE (written before the first run):
 *   pairs   = station s, issue t0 (3-hourly hindcast slot), lead L = 1 … 11 h; the RUC run of the issue is t0 − 1 h (else t0 − 2 h);
 *             a pair counts only when the truth rr(t0 + L) exists AND the RUC hour (12 intervals ending at t0 + L) is complete.
 *             The SAME pair set scores the baseline (rucMember 0 = Fusion 13) and every candidate.
 *   score   = mean CRPS of the precipitation quantile set (the Prüfstand score) over the pairs; Brier of P(wet) against rr ≥ 0,1 mm/h
 *             as the second number; both per lead class 1–3 / 4–6 / 7–11 h and per country.
 *   verdict = the candidate with the lowest CRPS 1–11 h among those that are nowhere (no lead class) worse than the baseline;
 *             reported as % gain vs baseline (positive = better). The 13–27 h run-out is NOT measured here (series end at 12 h).
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs <this>
 *        --ruc=C:/dev/buscosun-data/ruc/v1/stations --from=2026-10-23T12 --to=2026-10-26T23 --grid=<json file> --out=<json> [--slots=N] [--base]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProtocol } from 'file:///C:/dev/buscosun-web/scripts/pruefstand/lib/protokoll.mjs';
import { features, hindcastSlotPath, loadEngine, loadTables, predictHindcast, readHindcastSlot } from 'file:///C:/dev/buscosun-web/scripts/pruefstand/lib/replay.mjs';
import { loadRegister, withTablePaths } from 'file:///C:/dev/buscosun-web/scripts/pruefstand/lib/register.mjs';
import { openW1, truthValue } from 'file:///C:/dev/buscosun-web/scripts/pruefstand/lib/wahrheit.mjs';
import { decodePng } from 'file:///C:/dev/buscosun-web/scripts/lib/png.mjs';
import { RUC_STATION_STEPS, RUC_STEP_MIN, decodeRucByte, parseRucStationsFile, rucRunMs } from 'file:///C:/dev/buscosun-web/src/point/rucFormat.ts';
import { QUANTITY_VARS } from 'file:///C:/dev/buscosun-web/src/pruefstand/protokoll.ts';
import { channelsOf } from 'file:///C:/dev/buscosun-web/src/pruefstand/adapter.ts';
import { crpsQ } from 'file:///C:/dev/buscosun-web/src/pruefstand/metrics.ts';
import { ACC } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/priors.ts';

const H = 3_600_000, STEP_MS = RUC_STEP_MIN * 60_000, PER_H = 60 / RUC_STEP_MIN;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const RUC_DIR = String(args.ruc);
const FROM = Date.parse(`${args.from ?? '2026-10-23T12'}:00:00Z`), TO = Date.parse(`${args.to ?? '2026-10-26T23'}:00:00Z`);
const LEADS = Array.from({ length: 11 }, (_, i) => i + 1);
const WET = 0.1;
const MAX_SLOTS = args.slots ? Number(args.slots) : Infinity;
const say = (...a) => console.log(...a);
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';

const proto = loadProtocol();
const stations = proto.scored, nSt = stations.length;
const feat = features().byPoint;

// ── RUC catalogue → Prüfnetz column, station series per run ───────────────────────
const catFile = readdirSync(RUC_DIR).find((f) => f.startsWith('catalog-'));
const cat = JSON.parse(readFileSync(join(RUC_DIR, catFile), 'utf8'));
const colOf = new Map(cat.ids.map((id, j) => [id, j]));
const rucCol = stations.map((s) => {
  const w = s.w1; if (!w) return -1;
  const id = w.net === 'cdc' ? `de:${w.id}` : w.net === 'klima' ? `at:${w.tawes ?? ''}` : w.net === 'smn' ? `ch:${w.id}` : null;
  return id != null && colOf.has(id) ? colOf.get(id) : -1;
});
const runs = new Map();   // runAtMs → Float32Array[nSt * 144] mm/h per 5-min step (NaN = missing)
for (const f of readdirSync(RUC_DIR)) {
  const pr = parseRucStationsFile(f); if (!pr) continue;
  const png = decodePng(readFileSync(join(RUC_DIR, f)));
  if (png.channels !== 1 || png.width !== cat.ids.length || png.height < RUC_STATION_STEPS) continue;
  const runAt = rucRunMs(pr.run);
  const arr = new Float32Array(nSt * RUC_STATION_STEPS).fill(NaN);
  for (let s = 0; s < nSt; s++) {
    const j = rucCol[s]; if (j < 0) continue;
    for (let k = 0; k < RUC_STATION_STEPS; k++) { const v = decodeRucByte(png.data[k * png.width + j]); if (v != null) arr[s * RUC_STATION_STEPS + k] = v; }
  }
  runs.set(runAt, { run: pr.run, arr });
}
say(`Prüfnetz ${nSt} Stationen (${rucCol.filter((c) => c >= 0).length} in der RUC-Reihe) · RUC-Läufe ${runs.size}`);

/** The RUC input of station s for the issue t0: run t0 − 1 h, else t0 − 2 h; null without one. */
function rucInputFor(s, t0) {
  for (const back of [1, 2]) {
    const runAt = t0 - back * H;
    const r = runs.get(runAt); if (!r) continue;
    if (rucCol[s] < 0) return null;
    const points = [];
    for (let k = 0; k < RUC_STATION_STEPS; k++) {
      const v = r.arr[s * RUC_STATION_STEPS + k];
      points.push({ fromMs: runAt + k * STEP_MS, toMs: runAt + (k + 1) * STEP_MS, mmH: v === v ? v : null });
    }
    return { run: r.run, runAtMs: runAt, builtAtMs: runAt + 35 * 60_000, ageMin: Math.round((t0 - runAt) / 60_000), stepMin: RUC_STEP_MIN, cell: { iy: 0, ix: 0 }, chunk: { cy: 0, cx: 0, column: 0 }, points, manifest: null };
  }
  return null;
}
/** Is the RUC hour ending at t0 + L complete for station s (the pair rule)? */
function rucHourComplete(s, t0, L) {
  const r = rucInputFor(s, t0); if (!r) return false;
  const end = t0 + L * H; let n = 0;
  for (const p of r.points) if (p.mmH != null && p.toMs > end - H && p.toMs <= end) n++;
  return n === PER_H;
}

// ── engine (working tree) with the RUC series injected per station ─────────────────
const reg = withTablePaths(loadRegister('fusion-12x'));
const eng = await loadEngine('C:/dev/buscosun-web');
const tables = loadTables(reg);
const byKey = new Map(); stations.forEach((st, s) => { const row = feat[st.id]; if (row) byKey.set(`${row.lat},${row.lon}`, s); });
const orig = eng.fuseCubePoint;
let curT0 = null, rucOn = false;
eng.fuseCubePoint = (input, opts) => {
  if (!rucOn) return orig(input, opts);
  const s = byKey.get(`${input.lat},${input.lon}`);
  return orig(s == null ? input : { ...input, ruc: rucInputFor(s, curT0) }, opts);
};

// ── slots, truth, pairs ─────────────────────────────────────────────────────────────
const slots = [];
for (let t = Math.floor((FROM - 12 * H) / (3 * H)) * 3 * H; t <= TO - H; t += 3 * H) {
  const path = hindcastSlotPath(t);
  if (!existsSync(path)) { say(`  Slot ${iso(t)} fehlt`); continue; }
  const slot = readHindcastSlot(path);
  if (slot.cube.t1?.route === 'day0' || !slot.cube.t1?.run) { say(`  Slot ${iso(t)}: t1 ohne Lauf — übersprungen`); continue; }
  if (!runs.has(t - H) && !runs.has(t - 2 * H)) { say(`  Slot ${iso(t)}: kein RUC-Lauf t0 − 1/2 h — übersprungen`); continue; }
  slots.push({ t, slot });
  if (slots.length >= MAX_SLOTS) break;
}
say(`Slots: ${slots.length} (${slots.map((x) => iso(x.t).slice(5, 13)).join(' ')})`);
const w1 = openW1(proto);
const NQ = proto.quantiles.length, CH = channelsOf(NQ), VP = QUANTITY_VARS.indexOf('precip'), TAUS = proto.quantiles, PW = QUANTITY_VARS.length * NQ;
// pair set: [slotIdx, s, L, truth]
const pairs = [];
for (let i = 0; i < slots.length; i++) for (let s = 0; s < nSt; s++) for (const L of LEADS) {
  const stamp = slots[i].t + L * H;
  if (stamp < FROM || stamp > TO) continue;
  const truth = truthValue(w1, s, stamp, 'precip', 1);
  if (!(truth === truth)) continue;
  if (!rucHourComplete(s, slots[i].t, L)) continue;
  pairs.push([i, s, L, truth]);
}
say(`Paare: ${pairs.length} (Wahrheit reif bis ${w1.reif(new Date(TO).toISOString().slice(0, 10))})`);

const classes = [['1–3 h', 1, 3], ['4–6 h', 4, 6], ['7–11 h', 7, 11], ['1–11 h', 1, 11]];
const landOf = (s) => (stations[s].country === 'LI' ? 'CH' : stations[s].country);

function evaluate(label, withRuc, mode = 1) {
  rucOn = withRuc;
  const opts = { ...reg.options, rucMember: withRuc ? mode : 0 };
  const regX = { ...reg, options: opts };
  const blocks = [];
  const T = Date.now();
  for (const { t, slot } of slots) { curT0 = t; blocks.push(predictHindcast(eng, tables, regX, proto, slot, LEADS).data); }
  const acc = {};
  const add = (key, crps, brier) => { const a = acc[key] ?? (acc[key] = { n: 0, crps: 0, brier: 0 }); a.n++; a.crps += crps; a.brier += brier; };
  let used = 0;
  for (const [i, s, L, truth] of pairs) {
    const o = (s * LEADS.length + (L - 1)) * CH + VP * NQ;
    const qs = blocks[i].subarray(o, o + NQ);
    if (!(qs[0] === qs[0])) continue;
    const pwet = blocks[i][(s * LEADS.length + (L - 1)) * CH + PW];
    const crps = crpsQ(TAUS, qs, truth);
    const brier = (pwet - (truth >= WET ? 1 : 0)) ** 2;
    used++;
    for (const [name, a, b] of classes) if (L >= a && L <= b) { add(name, crps, brier); add(`${name}|${landOf(s)}`, crps, brier); }
  }
  const out = {};
  for (const [k, a] of Object.entries(acc)) out[k] = { n: a.n, crps: a.crps / a.n, brier: a.brier / a.n };
  say(`${label}: ${used} Paare, ${((Date.now() - T) / 1000).toFixed(0)} s · CRPS 1–11 h ${out['1–11 h']?.crps.toFixed(4)} · Brier ${out['1–11 h']?.brier.toFixed(4)}`);
  return out;
}

const report = { from: iso(FROM), to: iso(TO), slots: slots.map((x) => iso(x.t)), pairs: pairs.length, rule: 'see header', results: {} };
if (args.base || !args.grid) report.results.base = evaluate('base (rucMember 0)', false);
if (args.grid) {
  const grid = JSON.parse(readFileSync(String(args.grid), 'utf8'));
  for (const c of grid) {
    Object.assign(ACC.precipitation.ruc, c.amount);
    Object.assign(ACC.precipOcc.ruc, c.occ);
    report.results[c.id] = { curve: c, ...evaluate(c.id, true, c.mode ?? 1) };
  }
}
if (args.out) writeFileSync(String(args.out), JSON.stringify(report, null, 1));
