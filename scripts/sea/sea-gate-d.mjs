#!/usr/bin/env node
/**
 * SW Gate D — buscosun Fusion wind at the spots against the DWD POI measurement of the nearest coastal station, from the
 * archive (`buscosun-archiv/sea/v1`, written by `sea-archive.mjs`). Plan: at least 14 days; deviation documented.
 *
 * Pairs: every spot whose catalogue station lies within `--maxKm` (default 10 km), every archived run, every hour with a
 * forecast and a measurement at the same full hour. Wind = 10-min mean at the full hour (POI `ff`), gust = maximum of
 * the last hour (POI `fx`) against the forecast hour's gust. Lead = valid time − computation time of the wind.
 * Reports n, bias, MAE, RMSE in knots per lead bin, per station, and the days covered. No claim beyond the numbers:
 * a coastal station is not the water cell (distance named per pair).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-gate-d.mjs
 *     --archive=<buscosun-archiv/sea/v1> --catalog=<sea/v1/static/spots.json> [--maxKm=10] [--json=<out>] [--from=YYYY-MM-DD]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const KN = 1.943844;
const BINS = [[0, 6], [6, 24], [24, 48], [48, 79]];
const readGz = (p) => { try { return JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')); } catch { return null; } };

export function collectPairs({ archiveDir, catalog, maxKm = 10, from = null }) {
  const days = readdirSync(archiveDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!from || d >= from)).sort();
  const poi = {};
  for (const d of days) {
    const doc = readGz(join(archiveDir, d, 'poi.json.gz'));
    for (const [id, rows] of Object.entries(doc?.stations ?? {})) for (const r of rows) (poi[id] ??= new Map()).set(r.t, r);
  }
  const spots = Object.fromEntries(catalog.spots.filter((s) => s.station && s.station.km <= maxKm).map((s) => [s.id, s]));
  const pairs = [];
  for (const d of days) {
    for (const f of readdirSync(join(archiveDir, d)).filter((x) => /^spots-\d{10}\.json\.gz$/.test(x))) {
      const doc = readGz(join(archiveDir, d, f));
      if (!doc?.wind?.computedAt) continue;
      // Lead from the computation HOUR: the cube's first step is the hour the wind was computed in (lead 0).
      const comp = Math.floor(Date.parse(doc.wind.computedAt) / 3_600_000) * 3_600_000;
      for (const [id, s] of Object.entries(doc.spots ?? {})) {
        const sp = spots[id];
        if (!sp) continue;
        const obs = poi[sp.station.id];
        if (!obs) continue;
        s.v.wind.forEach((w, i) => {
          if (w == null) return;
          const t = new Date(doc.runMs + i * 3_600_000).toISOString().replace('.000Z', '.000Z');
          const o = obs.get(t);
          if (!o || o.ff == null) return;
          pairs.push({ spot: id, station: sp.station.id, km: sp.station.km, run: doc.run, lead: (doc.runMs + i * 3_600_000 - comp) / 3_600_000,
            fw: w / 10, ow: o.ff, fg: s.v.gust[i] == null ? null : s.v.gust[i] / 10, og: o.fx });
        });
      }
    }
  }
  return { pairs, days };
}

export function score(pairs) {
  const stat = (xs) => {
    if (!xs.length) return { n: 0 };
    const e = xs.map(([f, o]) => (f - o) * KN);
    const bias = e.reduce((a, b) => a + b, 0) / e.length, mae = e.reduce((a, b) => a + Math.abs(b), 0) / e.length, rmse = Math.sqrt(e.reduce((a, b) => a + b * b, 0) / e.length);
    return { n: e.length, biasKn: +bias.toFixed(2), maeKn: +mae.toFixed(2), rmseKn: +rmse.toFixed(2) };
  };
  const byBin = BINS.map(([a, b]) => {
    const ps = pairs.filter((p) => p.lead >= a && p.lead < b);
    return { lead: `${a}–${b - 1} h`, wind: stat(ps.map((p) => [p.fw, p.ow])), gust: stat(ps.filter((p) => p.fg != null && p.og != null).map((p) => [p.fg, p.og])) };
  });
  const byStation = Object.entries(Object.groupBy ? Object.groupBy(pairs, (p) => p.station) : pairs.reduce((m, p) => ((m[p.station] ??= []).push(p), m), {}))
    .map(([st, ps]) => ({ station: st, km: ps[0].km, spots: [...new Set(ps.map((p) => p.spot))], wind: stat(ps.map((p) => [p.fw, p.ow])), gust: stat(ps.filter((p) => p.fg != null && p.og != null).map((p) => [p.fg, p.og])) }));
  return { all: { wind: stat(pairs.map((p) => [p.fw, p.ow])), gust: stat(pairs.filter((p) => p.fg != null && p.og != null).map((p) => [p.fg, p.og])) }, byBin, byStation };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const catalog = JSON.parse(readFileSync(resolve(String(args.catalog)), 'utf8'));
  const { pairs, days } = collectPairs({ archiveDir: resolve(String(args.archive)), catalog, maxKm: Number(args.maxKm ?? 10), from: typeof args.from === 'string' ? args.from : null });
  const s = score(pairs);
  const line = (x) => (x.n ? `n ${x.n} · Bias ${x.biasKn} kn · MAE ${x.maeKn} kn · RMSE ${x.rmseKn} kn` : 'n 0');
  console.log(`Gate D — Wind am Spot gegen POI (Station ≤ ${args.maxKm ?? 10} km), ${days.length} Tage (${days[0] ?? '–'} … ${days[days.length - 1] ?? '–'}), ${pairs.length} Paare${days.length < 14 ? ' — WENIGER ALS 14 TAGE, nur Zwischenstand' : ''}`);
  console.log(`  alle   Wind ${line(s.all.wind)} | Böe ${line(s.all.gust)}`);
  for (const b of s.byBin) console.log(`  ${b.lead.padEnd(8)} Wind ${line(b.wind)} | Böe ${line(b.gust)}`);
  for (const b of s.byStation) console.log(`  Station ${b.station} (${b.km} km, ${b.spots.join(', ')}): Wind ${line(b.wind)} | Böe ${line(b.gust)}`);
  if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify({ days, pairs: pairs.length, ...s }, null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF && existsSync) main();
