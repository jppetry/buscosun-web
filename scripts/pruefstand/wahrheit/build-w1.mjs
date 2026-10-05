#!/usr/bin/env node
/**
 * build-w1.mjs — builds or extends the truth table W1 of the Prüfstand (plan PS-1-2): hourly values at the stamp H for
 * every station of the frozen network, from the 10-min originals of DWD CDC, GeoSphere klima-v2 and MeteoSwiss, with the
 * quality control of `qc.mjs`. One block file per UTC day under `<PS_ROOT>/wahrheit/W1/<day>.f32`
 * ([stations × 24 × 7], order = `pruefnetz.json` stations with a W1 source), a manifest with the sha256 of every day and
 * a log of every rejected value.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/pruefstand/wahrheit/build-w1.mjs
 *        [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--offline] [--stations=id,id] [--out=<dir>] [--quiet]
 *
 * Append-only: a day that was written MATURE (older than `truth.maturityDays`) is final and never rewritten — a later
 * correction at the source is a new truth stand (W2), not a silent change. Younger days are rewritten on every run and
 * marked `reif: false`. Without `--from` the run starts two days before the first day that is not final.
 */
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PS_ROOT, H, DAY, atomicWrite, dayMs, hashOf, isoDay, mapLimit, p, parseArgs, readJson, writeBlock, writeJson } from '../lib/common.mjs';
import { loadProtocol } from '../lib/protokoll.mjs';
import { readCdc, readCdcClouds, readKlima, readSmn } from './quellen.mjs';
import { NV, W1_VARS, qcFormal, qcSpatialHour, qcTemporal, spatialNeighbours, toHourly } from './qc.mjs';

const args = parseArgs();
const say = (...a) => { if (!args.quiet) console.log(...a); };
const proto = loadProtocol();
const OUT = args.out ? String(args.out) : p(PS_ROOT, 'wahrheit', proto.truth.stand);
const manifestPath = p(OUT, 'manifest.json');
const stations = proto.scored.filter((s) => !args.stations || String(args.stations).split(',').includes(s.id));
const partial = !!args.stations;
const stationsHash = hashOf(proto.scored.map((s) => [s.id, s.w1]));
const qcHash = hashOf(proto.qc);
const old = existsSync(manifestPath) ? readJson(manifestPath) : null;
if (old && (old.stationsHash !== stationsHash || old.qcHash !== qcHash)) throw new Error(`${manifestPath}: Stationsliste oder QC-Regeln passen nicht zum Protokoll — ein anderer Wahrheitsstand braucht einen eigenen Ordner`);
const now = Date.now();
const today = isoDay(now);
const isFinal = (day) => old?.days?.[day]?.reif === true && existsSync(p(OUT, `${day}.f32`));
let from = args.from ? String(args.from) : proto.truth.from;
if (!args.from && old) { let d = dayMs(proto.truth.from); while (isFinal(isoDay(d)) && isoDay(d) < today) d += DAY; from = isoDay(Math.max(dayMs(proto.truth.from), d - 2 * DAY)); }
const to = args.to ? String(args.to) : today;
const fromMs = dayMs(from), nDays = Math.round((dayMs(to) - fromMs) / DAY) + 1, nHours = nDays * 24;
say(`W1 ${from} … ${to} (${nDays} Tage), ${stations.length} Stationen, Ablage ${OUT}`);

const rejections = [];
const quota = {};
const klimaIds = proto.scored.filter((s) => s.w1.net === 'klima').map((s) => s.w1.id);
const t0 = Date.now();
let done = 0;
const blocks = await mapLimit(stations, 3, async (s) => {
  const rej = (ms, v, reason, x) => { rejections.push({ id: s.id, ms, v, r: reason, x: Math.round(x * 100) / 100 }); const k = `${s.w1.net}|${reason}`; quota[k] = (quota[k] ?? 0) + 1; };
  const a = fromMs - H, b = fromMs + nHours * H;
  let ser, clouds = null;
  try {
    if (s.w1.net === 'cdc') { ser = await readCdc(s.w1.id, s.w1.vars, a, b, { offline: !!args.offline }); clouds = await readCdcClouds(s.w1.id, fromMs, b, { offline: !!args.offline }); }
    else if (s.w1.net === 'klima') ser = await readKlima(s.w1.id, klimaIds, a, b, { offline: !!args.offline });
    else ser = await readSmn(s.w1.id, a, b, { offline: !!args.offline });
  } catch (e) { say(`FEHLER ${s.id} ${s.name}: ${e?.message ?? e}`); throw e; }
  qcFormal(ser, proto.qc, rej);
  const hourly = toHourly(ser, clouds, fromMs, nHours);
  qcTemporal(hourly, nHours, fromMs, proto.qc, rej);
  done += 1;
  if (done % 20 === 0) say(`  ${done}/${stations.length} Stationen, ${Math.round((Date.now() - t0) / 1000)} s`);
  return hourly;
});
if (!partial) {
  const nb = spatialNeighbours(stations, proto.qc);
  for (let k = 0; k < nHours; k++) qcSpatialHour(blocks, k, nb, proto.qc, (sIdx, v, reason, x) => { const s = stations[sIdx]; rejections.push({ id: s.id, ms: fromMs + k * H, v, r: reason, x: Math.round(x * 100) / 100 }); const key = `${s.w1.net}|${reason}`; quota[key] = (quota[key] ?? 0) + 1; });
}

// ── write the days
const days = { ...(old?.days ?? {}) };
const present = {};
let written = 0, kept = 0;
for (let d = 0; d < nDays; d++) {
  const day = isoDay(fromMs + d * DAY);
  if (!partial && isFinal(day)) { kept += 1; continue; }
  const block = new Float32Array(stations.length * 24 * NV);
  for (let s = 0; s < stations.length; s++) block.set(blocks[s].subarray(d * 24 * NV, (d + 1) * 24 * NV), s * 24 * NV);
  const reif = dayMs(day) + DAY + proto.truth.maturityDays * DAY <= now;
  const sha = writeBlock(p(OUT, `${day}.f32`), { kind: 'pruefstand/w1-day', stand: proto.truth.stand, day, shape: [stations.length, 24, NV], vars: W1_VARS, stationsHash: partial ? hashOf(stations.map((s) => s.id)) : stationsHash }, block);
  days[day] = { sha256: sha, reif, builtAt: new Date(now).toISOString() };
  written += 1;
}
for (let s = 0; s < stations.length; s++) { const net = stations[s].w1.net; present[net] ??= new Array(NV).fill(0); for (let i = 0; i < blocks[s].length; i++) if (blocks[s][i] === blocks[s][i]) present[net][i % NV] += 1; }
const stampName = new Date(now).toISOString().replace(/[-:]/g, '').slice(0, 15);
if (rejections.length) atomicWrite(p(OUT, 'verworfen', `${stampName}.jsonl.gz`), gzipSync(rejections.map((r) => JSON.stringify(r)).join('\n')));
const perNet = {};
for (const [net, counts] of Object.entries(present)) {
  const total = counts.reduce((a, b) => a + b, 0);
  const rej = Object.entries(quota).filter(([k]) => k.startsWith(`${net}|`)).reduce((a, [, n]) => a + n, 0);
  perNet[net] = { values: Object.fromEntries(W1_VARS.map((v, i) => [v, counts[i]])), rejected: rej, rejectedShare: total + rej ? rej / (total + rej) : 0, byReason: Object.fromEntries(Object.entries(quota).filter(([k]) => k.startsWith(`${net}|`)).map(([k, n]) => [k.split('|')[1], n])) };
}
if (!partial) {
  const sorted = Object.fromEntries(Object.keys(days).sort().map((k) => [k, days[k]]));
  writeJson(manifestPath, {
    schema: 1, kind: 'pruefstand/w1-manifest', stand: proto.truth.stand, protocol: proto.id, vars: W1_VARS, stations: proto.scored.map((s) => s.id), stationsHash, qcHash,
    sources: { cdc: 'DWD CDC 10-min (historical/recent/now), Bewölkung stündlich — Quelle: Deutscher Wetterdienst', klima: 'GeoSphere Austria klima-v2-10min (CC BY 4.0), Taupunkt nach Magnus', smn: 'Source: MeteoSwiss (ogd-smn, 10-min)' },
    runs: [...(old?.runs ?? []), { at: new Date(now).toISOString(), from, to, written, kept, rejected: rejections.length, perNet }].slice(-50),
    days: sorted, hash: hashOf(Object.entries(sorted).filter(([, v]) => v.reif).map(([k, v]) => [k, v.sha256])),
  });
}
say(`geschrieben ${written} Tage, final belassen ${kept}; verworfen ${rejections.length} Werte; ${Math.round((Date.now() - t0) / 1000)} s`);
say(JSON.stringify(perNet));
