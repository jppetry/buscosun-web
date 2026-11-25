#!/usr/bin/env node
/**
 * V-GM-135 — where did the new snow go? Decomposes the first 24-h window of the runner's shadow pairs (run A → run B) per pair, for the snowfall
 * stations (station change ≥ +3 cm, GM-4 §3h.3) and a matched control (per snowfall station the nearest station of the same network without
 * snowfall). Read only: every input is a local copy secured beforehand (`C:\dev\buscosun-glacier-cache\v135\<commit>\…`); nothing is written except
 * `--out`. No producer, no buscosun Fusion call; the replay follows `advanceEntry` (snowpackcore.mjs): the state at a run hour is the state of the
 * run before, stepped through the stored forcing of that run (`GLACIER_SNOWPACK_PEND_H` = 18 h). So the model's 24 h are the first hours of the
 * runs in between, each run supplying the hours up to the next run.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/v135-decompose.mjs \
 *     --root=C:\dev\buscosun-glacier-cache\v135\f2dcc36f --runs=2026112417,2026112423,2026112511,2026112517 --out=<json>
 *
 * Booked solid precipitation per level and hour = factor · p · share, reconstructed as factor · `sn` of the hourly chunk (`sn` = p · share, 0.01 mm;
 * the drive rounds factor · p · share to 0.01 mm — the difference is the rounding). For a row on a neighbour's forcing the chunk of the glacier has no
 * `sn`; then p of the owner and the share of the owner's level nearest in elevation stand in (approximation, flagged `approxShare`). Fresh depth at
 * the density of the run (96 kg/m³) = S · 100 / 96 cm. Settling = fresh depth − change of depth − melt depth (melt from ΔSWE − S; at the
 * temperatures of this window it is checked to be ≈ 0). Independent precipitation: the 24-h sum of precipsum/v1 (CH CombiPrecip, AT INCA, DE RW/SF)
 * at the station's grid cell.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodePng, toRgba } from '../../scripts/lib/png.mjs';
import { atElevation } from '../../scripts/glacier/lib/snowpackcore.mjs';
import { G } from '../../src/scalar/precipIndexMap.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, '1']; }));
const root = args.root, runs = args.runs.split(','), A = runs[0], B = runs[runs.length - 1];
const J = (p) => JSON.parse((p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p)).toString('utf8'));
const H = 3_600_000, RHO = 96;
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10 + 0), r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100 + 0);
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((s, v) => s + v, 0) / b.length : null; };
const runMs = (r) => Date.UTC(+r.slice(0, 4), +r.slice(4, 6) - 1, +r.slice(6, 8), +r.slice(8, 10));

// --- inputs ---
const pairs = Object.fromEntries(runs.map((r) => [r, J(join(root, 'snowpack/pairs', `${r}.json`))]).filter(([r]) => existsSync(join(root, 'snowpack/pairs', `${r}.json`))));
const sp = Object.fromEntries(runs.map((r) => [r, J(join(root, 'snowpack', `${r}.json`))]));
const rowsOf = Object.fromEntries(runs.map((r) => [r, new Map(sp[r].glaciers.map((g) => [g.id, g]))]));
const chunks = {};
for (const r of runs) { chunks[r] = new Map(); for (const f of readdirSync(join(root, 'melt/wx', r))) { const d = J(join(root, 'melt/wx', r, f)); for (const [id, g] of Object.entries(d.glaciers)) chunks[r].set(id, g); } }
const factorOf = (r, id) => { const g = rowsOf[r].get(id); const reg = sp[r].rules.precip.regions; const region = [...chunks[r].keys()].length && regionOf(r, id); return reg[region]?.F ?? null; };
const regionMap = {};
for (const r of runs) { regionMap[r] = new Map(); for (const f of readdirSync(join(root, 'melt/wx', r))) { const d = J(join(root, 'melt/wx', r, f)); for (const id of Object.keys(d.glaciers)) regionMap[r].set(id, f.replace(/\.json$/, '')); } }
function regionOf(r, id) { return regionMap[r].get(id); }
const map = J(join(root, 'stn/map', `${pairs[B].stations.map}.json`));
const slots = {};
for (const f of readdirSync(join(root, 'stn/h'))) if (/^\d{10}\.json$/.test(f)) slots[f.slice(0, 10)] = J(join(root, 'stn/h', f));
const entryAt = (hour, sid) => { const s = slots[hour]; return s ? (s.stations?.[sid] ?? s.ext?.stations?.[sid] ?? null) : null; };
// precipsum 24 h ending at B
const ps = J(join(root, 'precipsum/v1/latest.json'));
const png = { data: toRgba(decodePng(readFileSync(join(root, 'precipsum/v1', ps.dir, ps.windows["24"].file)))) };
const cell = (lat, lon) => { const r = Math.floor(((G.latMax - lat) / (G.latMax - G.latMin)) * G.h), c = Math.floor(((lon - G.lonMin) / (G.lonMax - G.lonMin)) * G.w); const o = 4 * (r * G.w + c); const d = png.data; return d[o + 3] === 255 ? ((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]) * ps.unitMm : null; };

// --- which run supplies which hour of the window (the replay) ---
const t0 = runMs(A), t1 = runMs(B);
const supply = [];   // [{ run, h0, h1 }] hours of that run's chunk
for (let i = 0; i < runs.length - 1; i++) supply.push({ run: runs[i], from: 0, to: Math.round((runMs(runs[i + 1]) - runMs(runs[i])) / H) });

// --- per pair ---
const key = (p) => `${p.g}|${p.s}`;
const pa = new Map(pairs[A].pairs.map((p) => [key(p), p]));
const rows = [];
for (const pb of pairs[B].pairs) {
  const qa = pa.get(key(pb));
  if (!qa || pb.v == null || qa.v == null) continue;
  const ra = rowsOf[A].get(pb.g), rb = rowsOf[B].get(pb.g);
  if (!ra || !rb) continue;
  const z = rb.z, zs = pb.z, own = rb.f === 'own', owner = own ? pb.g : rb.f;
  const F = factorOf(B, pb.g);
  // hourly path through the window
  const P = [], S = [[], [], []], T = [[], [], []], SL = [], SH = [[], [], []];
  let approxShare = false, missing = 0;
  for (const s of supply) {
    const cg = chunks[s.run].get(pb.g), co = chunks[s.run].get(owner);
    for (let h = s.from; h < s.to; h++) {
      if (!co?.p || !cg?.t) { missing++; continue; }
      const p = co.p[h]; P.push(p); SL.push(co.sl?.[h] ?? null);
      for (let l = 0; l < 3; l++) {
        T[l].push(cg.t[l][h]);
        let sn;
        if (own && cg.sn) sn = cg.sn[l][h];
        else { approxShare = true; const ro = rowsOf[s.run].get(owner); const zo = ro?.z ?? z; let k = 0; for (let j = 1; j < 3; j++) if (Math.abs(zo[j] - z[l]) < Math.abs(zo[k] - z[l])) k = j; sn = co.sn?.[k]?.[h] ?? null; }
        S[l].push(sn == null ? null : F * sn); SH[l].push(p > 0 && sn != null ? sn / p : null);
      }
    }
  }
  const sum = (a) => a.reduce((x, v) => x + (Number.isFinite(v) ? v : 0), 0);
  const Pw = sum(P), Sl = S.map(sum), Tm = T.map(mean), Tx = T.map((a) => Math.max(...a.filter(Number.isFinite)));
  const shareW = [0, 1, 2].map((l) => (Pw > 0 ? Sl[l] / (F * Pw) : null));
  const at = (vals) => atElevation(z, vals, zs).v;
  const dHs = [0, 1, 2].map((l) => rb.hs[l] - ra.hs[l]), dSwe = [0, 1, 2].map((l) => rb.swe[l] - ra.swe[l]);
  const meltL = [0, 1, 2].map((l) => Math.max(0, Sl[l] - dSwe[l]));       // water that left (melt) — ≈ 0 if S explains ΔSWE
  const freshL = Sl.map((s) => (s * 100) / RHO), hn24 = rb.hn.map((h) => h[0]);
  const settleL = [0, 1, 2].map((l) => freshL[l] - dHs[l]);                // total settling (new + old snow) when melt ≈ 0
  // station
  const ea = entryAt(A, pb.s), eb = entryAt(B, pb.s);
  const st = map.ext.stations[pb.s];
  // station path hour by hour
  const path = [];
  for (let h = 0; h <= 24; h++) { const hr = new Date(t0 + h * H).toISOString().replace(/[-T:]/g, '').slice(0, 10); const e = entryAt(hr, pb.s); path.push(e?.v?.snow ?? null); }
  // the model's forecast for the window as run A saw it (h0–23 of A) and the snow after the window (B h0–23)
  const ca = chunks[A].get(owner), cb = chunks[B].get(owner);
  const fcA = own && chunks[A].get(pb.g)?.sn ? at([0, 1, 2].map((l) => F * sum(chunks[A].get(pb.g).sn[l].slice(0, 24)))) : null;
  const after = own && chunks[B].get(pb.g)?.sn ? at([0, 1, 2].map((l) => F * sum(chunks[B].get(pb.g).sn[l].slice(0, 24)))) : null;
  rows.push({
    g: pb.g, s: pb.s, net: pb.net, own, owner: own ? null : owner, F, z, zs, at: pb.at, km: pb.km, dz: pb.dz, ageA: qa.age, ageB: pb.age, missing, approxShare,
    a_P: r1(Pw), a_Pfac: r1(F * Pw), b_share: shareW.map(r2), b_shareAt: r2(at(shareW.map((x) => x ?? 0))), b_T: Tm.map(r1), b_Tmax: Tx.map(r1), b_TatMean: r1(at(Tm)),
    b_sl: [Math.min(...SL.filter(Number.isFinite)), Math.max(...SL.filter(Number.isFinite))],
    c_S: Sl.map(r1), c_SAt: r1(at(Sl)), c_freshAt: r1(at(freshL)), c_hn24At: r1(at(hn24)),
    d_dSwe: dSwe.map(r1), d_meltAt: r1(at(meltL)), d_settleAt: r1(at(settleL)), d_dHsAt: r1(at(dHs)), d_m: r2(pb.m - qa.m),
    e_dv: r1(pb.v - qa.v), e_hsdB: pb.hsd ?? null, e_rr24: eb?.rr24h ?? eb?.v?.rr24h ?? null, e_rrNote: pb.net === 'imis' ? 'IMIS liefert keinen Niederschlag (unbeheizte Messer) und keinen Neuschnee' : null,
    e_path: path, e_stampA: ea?.t ?? null, e_stampB: eb?.t ?? null,
    f_cpc24: st ? r2(cell(st.lat, st.lon)) : null, f_source: st ? (pb.g.startsWith('gl_ch_') ? 'CombiPrecip' : pb.g.startsWith('gl_at_') ? 'INCA' : 'RW/SF') : null,
    t_fcA24At: r1(fcA), t_afterAt: r1(after),
  });
}
// groups
const snowSt = new Set(rows.filter((r) => r.e_dv >= 3).map((r) => r.s));
const stInfo = (sid) => map.ext.stations[sid];
const kmOf = (a, b) => { const R = 6371, la = (a.lat * Math.PI) / 180, lb = (b.lat * Math.PI) / 180; const x = ((b.lon - a.lon) * Math.PI / 180) * Math.cos((la + lb) / 2), y = lb - la; return R * Math.hypot(x, y); };
const nonSt = [...new Set(rows.filter((r) => r.e_dv < 3).map((r) => r.s))];
const control = new Set();
for (const s of [...snowSt].sort()) {
  const a = stInfo(s), net = s.split(':')[0];
  const c = nonSt.filter((x) => x.split(':')[0] === net && !control.has(x)).map((x) => ({ x, d: kmOf(a, stInfo(x)) })).sort((p, q) => p.d - q.d)[0];
  if (c) control.add(c.x);
}
const pick = (set) => rows.filter((r) => set.has(r.s));
const agg = (R) => {
  const m = (f) => r1(mean(R.map(f)));
  return {
    pairs: R.length, stations: new Set(R.map((r) => r.s)).size, own: R.filter((r) => r.own).length, neighbour: R.filter((r) => !r.own).length,
    station_dv: m((r) => r.e_dv), model_dm: m((r) => r.d_m), P_fusion: m((r) => r.a_P), P_fusion_x_F: m((r) => r.a_Pfac), P_indep: m((r) => r.f_cpc24),
    shareAt: r2(mean(R.map((r) => r.b_shareAt))), T_at: m((r) => r.b_TatMean), S_at: m((r) => r.c_SAt), fresh_at: m((r) => r.c_freshAt), hn24_at: m((r) => r.c_hn24At),
    melt_at: m((r) => r.d_meltAt), settle_at: m((r) => r.d_settleAt), dHs_at: m((r) => r.d_dHsAt), fcA24_at: m((r) => r.t_fcA24At), after_at: m((r) => r.t_afterAt),
  };
};
const perStation = (R) => [...new Set(R.map((r) => r.s))].sort().map((s) => { const Q = R.filter((r) => r.s === s); const i = stInfo(s); return { s, name: i?.name, elev: i?.elev, ...agg(Q), path: Q[0].e_path, rr24: Q[0].e_rr24, stampA: Q[0].e_stampA, stampB: Q[0].e_stampB }; });
const snowRows = pick(snowSt), ctlRows = pick(control);
const out = {
  kind: 'v-gm-135/decompose', root, runs, window: [new Date(t0).toISOString(), new Date(t1).toISOString()], supply, rhoNew: RHO,
  alignment: { A: { run: pairs[A].run, atMs: pairs[A].atMs, slot: pairs[A].stations?.slot }, B: { run: pairs[B].run, atMs: pairs[B].atMs, slot: pairs[B].stations?.slot }, spState: Object.fromEntries(runs.map((r) => [r, sp[r].state])), ages: { A: [Math.min(...rows.map((r) => r.ageA)), Math.max(...rows.map((r) => r.ageA))], B: [Math.min(...rows.map((r) => r.ageB)), Math.max(...rows.map((r) => r.ageB))] } },
  snowfall: { all: agg(snowRows), own: agg(snowRows.filter((r) => r.own)), neighbour: agg(snowRows.filter((r) => !r.own)), stations: perStation(snowRows) },
  control: { all: agg(ctlRows), own: agg(ctlRows.filter((r) => r.own)), neighbour: agg(ctlRows.filter((r) => !r.own)), stations: perStation(ctlRows) },
  allSnowfallOwnVsNeighbour: { own: agg(rows.filter((r) => r.e_dv >= 3 && r.own)), neighbour: agg(rows.filter((r) => r.e_dv >= 3 && !r.own)) },
  allNonSnowfall: { own: agg(rows.filter((r) => r.e_dv < 3 && r.own)), neighbour: agg(rows.filter((r) => r.e_dv < 3 && !r.own)) },
  rows,
};
writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, rows: rows.length, snowfall: { ...out.snowfall, stations: out.snowfall.stations.map(({ path, ...x }) => x) }, control: { ...out.control, stations: out.control.stations.map(({ path, ...x }) => x) } }, null, 1));
