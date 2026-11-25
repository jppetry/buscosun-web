#!/usr/bin/env node
/**
 * GM-10b, V-GM-107 — the first 24-h change from the runner's shadow pairs: run B against run A (24 h earlier), per pair (glacier, station) with a station
 * value in both. Read only: the two pairs files are given as local files (fetched beforehand from buscosun-archiv or buscosun-data at a named commit);
 * nothing is written except `--out`.
 *
 *   node audit/gletscher-schneemodell/gm10b-pairs24.mjs --a=<pairs-2026112417.json[.gz]> --b=<pairs-2026112517.json[.gz]> --out=<json>
 *
 * Measured change Δv = v(B) − v(A) (cm, the station's snow depth as the station line has it), computed change Δm = m(B) − m(A) (cm, the snowpack at the
 * station elevation). Snowfall pair: Δv ≥ +3 cm (the event rule of the GM-4 diagnosis, audit §3h.3); every other pair is a non-snowfall pair, among them
 * the calm ones (|Δv| < 1 cm). Ratio = mean Δm / mean Δv of a group (as the 0.76 of GM-4), only where |mean Δv| ≥ 1 cm; the forecast span written 24 h
 * earlier is not read (the first run with a span is 2026112423, V-GM-107). Country from the glacier id; network from the pair.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, '1']; }));
const load = (p) => { const b = readFileSync(p); return JSON.parse((p.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8')); };
const A = load(args.a), B = load(args.b);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10), r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const corr = (x, y) => { if (x.length < 3) return null; const mx = mean(x), my = mean(y); let s = 0, sx = 0, sy = 0; for (let i = 0; i < x.length; i++) { s += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sx && sy ? s / Math.sqrt(sx * sy) : null; };
const key = (p) => `${p.g}|${p.s}`;
const byA = new Map(A.pairs.map((p) => [key(p), p]));
const rows = [];
for (const p of B.pairs) {
  const q = byA.get(key(p));
  if (!q || p.v == null || q.v == null) continue;
  rows.push({ g: p.g, s: p.s, net: p.net, country: p.g.startsWith('gl_ch_') ? 'CH' : p.g.startsWith('gl_at_') ? 'AT' : p.g.startsWith('gl_de_') ? 'DE' : '?', z: p.z, dv: p.v - q.v, dm: p.m - q.m });
}
const group = (R) => {
  const dv = R.map((r) => r.dv), dm = R.map((r) => r.dm), mv = mean(dv), mm = mean(dm);
  return { pairs: R.length, stations: new Set(R.map((r) => r.s)).size, station: r1(mv), model: r1(mm), bias: r1(mm == null ? null : mm - mv), mae: r1(mean(R.map((r) => Math.abs(r.dm - r.dv)))), ratio: mv != null && Math.abs(mv) >= 1 ? r2(mm / mv) : null, r: r2(corr(dv, dm)) };
};
const kinds = { snowfall: (r) => r.dv >= 3, nonSnowfall: (r) => r.dv < 3, calm: (r) => Math.abs(r.dv) < 1 };
const split = (sel) => Object.fromEntries(Object.entries(kinds).map(([k, f]) => [k, group(rows.filter((r) => sel(r) && f(r)))]));
const out = {
  kind: 'gm10b/pairs-24h', a: { file: args.a, run: A.run, runAt: A.runAt }, b: { file: args.b, run: B.run, runAt: B.runAt },
  rule: 'snowfall: station change ≥ +3 cm (GM-4 §3h.3); calm: |station change| < 1 cm; ratio = mean model change / mean station change where |mean station change| ≥ 1 cm',
  pairsA: A.pairs.length, pairsB: B.pairs.length, both: rows.length, all: split(() => true),
  byCountry: Object.fromEntries(['CH', 'AT', 'DE'].map((c) => [c, split((r) => r.country === c)]).filter(([, v]) => v.snowfall.pairs + v.nonSnowfall.pairs > 0)),
  byNetwork: Object.fromEntries([...new Set(rows.map((r) => r.net))].sort().map((n) => [n, split((r) => r.net === n)])),
  gm4: { ratio: 0.76, window: '22.11. 17 → 23.11. 17 UTC, analyses + seed (audit §3h.3)' },
};
writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
