#!/usr/bin/env node
/**
 * GM-10b, step 3e — the shadow pairs as a SANITY check of the predicted factor (they cannot prove the level on the ice: a station stands on rock or
 * ridge next to the ice). Two full local runs of the same hour (21.11. 17 UTC), one with the country value (`--off`), one with `--glacier-factor=predicted`
 * (`--pred`); Swiss glaciers with a station value. Level: model m against station v. 24-h change: the forecast of each run at the station elevation for
 * +24 h (`fm[0]`) minus m, against the station's measured change to the same hour one day later (`--stn24`, the archived station slot of 22.11. 17 UTC,
 * read as the pairs read a slot: the value of the hour window, here the slot itself). Read only; writes `--out`.
 *
 *   node audit/gletscher-schneemodell/gm10b-pairs-factor.mjs --off=<pairs.json> --pred=<pairs.json> --table=<table.json> --stn24=<stn-…json[.gz]> --out=<json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, '1']; }));
const load = (p) => { const b = readFileSync(p); return JSON.parse((p.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8')); };
const off = load(args.off), pred = load(args.pred), table = load(args.table), stn = load(args.stn24);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10), r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2 : null; };
const corr = (x, y) => { if (x.length < 3) return null; const mx = mean(x), my = mean(y); let s = 0, sx = 0, sy = 0; for (let i = 0; i < x.length; i++) { s += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sx && sy ? s / Math.sqrt(sx * sy) : null; };
const entries = { ...(stn.stations ?? {}), ...(stn.ext?.stations ?? {}) };
const stnAt = Date.parse(stn.slot ? `${stn.slot.slice(0, 4)}-${stn.slot.slice(4, 6)}-${stn.slot.slice(6, 8)}T${stn.slot.slice(8, 10)}:${stn.slot.slice(10, 12) || '00'}:00Z` : stn.at ?? stn.hour ?? '');
const predOf = new Map(pred.pairs.map((p) => [`${p.g}|${p.s}`, p]));
const rows = [];
for (const p of off.pairs) {
  if (!p.g.startsWith('gl_ch_') || p.v == null) continue;
  const q = predOf.get(`${p.g}|${p.s}`); if (!q) continue;
  const e = entries[p.s], v24 = Number.isFinite(e?.v?.snow) ? e.v.snow : null;
  rows.push({ g: p.g, s: p.s, net: p.net, basis: table.glaciers[p.g]?.b ?? 'none', v: p.v, mOff: p.m, mPred: q.m, dv: v24 == null ? null : v24 - p.v, dOff: p.fm ? p.fm[0] - p.m : null, dPred: q.fm ? q.fm[0] - q.m : null });
}
const level = (R, f) => ({ pairs: R.length, stations: new Set(R.map((r) => r.s)).size, station: r1(mean(R.map((r) => r.v))), model: r1(mean(R.map((r) => r[f]))), ratio: r2(mean(R.map((r) => r[f])) / mean(R.map((r) => r.v))), ratioMedian: r2(med(R.filter((r) => r.v > 0).map((r) => r[f] / r.v))), bias: r1(mean(R.map((r) => r[f] - r.v))), mae: r1(mean(R.map((r) => Math.abs(r[f] - r.v)))) });
const change = (R, f) => { const S = R.filter((r) => r.dv != null && r[f] != null); return { pairs: S.length, station: r1(mean(S.map((r) => r.dv))), model: r1(mean(S.map((r) => r[f]))), ratio: Math.abs(mean(S.map((r) => r.dv)) ?? 0) >= 1 ? r2(mean(S.map((r) => r[f])) / mean(S.map((r) => r.dv))) : null, mae: r1(mean(S.map((r) => Math.abs(r[f] - r.dv)))), r: r2(corr(S.map((r) => r.dv), S.map((r) => r[f]))) }; };
const groups = { all: () => true, own: (r) => r.basis === 'own', predicted: (r) => r.basis === 'predicted', 'predicted-shrunk': (r) => r.basis === 'predicted-shrunk', country: (r) => r.basis === 'country' };
const out = {
  kind: 'gm10b/pairs-factor', run: off.run, stationSlot24: args.stn24, note: 'sanity only — the station stands next to the ice; the level on the ice is not provable with it',
  level: Object.fromEntries(Object.entries(groups).map(([k, f]) => { const R = rows.filter(f); return [k, { country: level(R, 'mOff'), predicted: level(R, 'mPred') }]; })),
  change24: Object.fromEntries(Object.entries({ all: () => true, snowfall: (r) => r.dv != null && r.dv >= 3, nonSnowfall: (r) => r.dv != null && r.dv < 3 }).map(([k, f]) => { const R = rows.filter(f); return [k, { country: change(R, 'dOff'), predicted: change(R, 'dPred') }]; })),
  changedPairs: rows.filter((r) => r.mOff !== r.mPred).length, rows: rows.length,
};
writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
