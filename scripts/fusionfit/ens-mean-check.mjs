/**
 * ens-mean-check.mjs — phase AX, AX-6 (E-EX-1, report #3): does the IFS-ENS ensemble MEAN beat the deterministic runs and
 * their mean at 126–336 h, raw and at the station?
 *
 * The hindcast cache holds the 51 IFS-ENS members (dynamical.org, 00z, 0,25°, 85 leads to 360 h) for every day since
 * 2024-04-01, the AIFS single run of the dyn route, and — for the run route's window (17.06.–21.09.2026) — the deterministic
 * IFS HRES, AIFS and ICON global runs. Every candidate is read at the point's 0,25° cell (the t3 block's centre cell), brought
 * to the station height with the standard lapse (T) — the same treatment for all — and scored against the hourly truth:
 *   control      IFS-ENS member 0 (the dyn route's `ifs_hres` stand-in)
 *   ensMean      mean of the 50 perturbed members (T; wind speed = mean of member speeds; gust likewise)
 *   ensMedian    median of the 50 perturbed members
 *   dynMean2     (control + AIFS dyn)/2 — what the hindcast's dyn route mixes in t3
 *   hres/aifs/icon/runMean3  the run route's deterministic runs and their mean (window only)
 *   clima        the point's climatology μ_c (Fit-5e `climaMu`, leave-station-out) — the reference the learning stage tends to
 * MAE per variable × bin (126–240, 246–336 h) × layer (all, month, country, window), pairs by day (DM, HLN).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/ens-mean-check.mjs
 *       --tables=<fit 5e>/fusion.hindcast.json --out=<root>/score/<date>-ax6/ens.json [--decision=audit/fusion-ausbau/ax6-ens.md]
 *       [--from=2025-09-01] [--to=2026-09-21] [--stride=3]
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { HINDCAST_ROOT, parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { readHcv } from '../hindcast/lib/cellsio.mjs';
import { PairAcc, benjaminiHochberg } from './lib/stats.mjs';
import { climaDesign, C_DIM } from '../../src/point/fusionFit/fitClima.ts';

const H = 3_600_000, DAY = 86_400_000, LAPSE = 0.0065;
const flags = parseArgs(process.argv.slice(2));
if (typeof flags.out !== 'string') throw new Error('--out ist Pflicht');
const root = HINDCAST_ROOT;
const from = typeof flags.from === 'string' ? flags.from : '2025-09-01', to = typeof flags.to === 'string' ? flags.to : '2026-09-21';
const stride = Math.max(1, Number(flags.stride) || 3);
const say = (s) => console.log(`[ens-mean] ${s}`);
const T = typeof flags.tables === 'string' ? JSON.parse(readFileSync(flags.tables, 'utf8')) : null;
const feat = JSON.parse(readFileSync(join(root, 'features', 'points.v1.json'), 'utf8'));
const extract = JSON.parse(readFileSync(join(root, 'cells', 'extract-ecmwf025.json'), 'utf8'));
const idx = new Map(extract.cells.map(([r, c], k) => [`${r}_${c}`, k]));
const cellKey = (lat, lon) => `${Math.round((lat + 90) / 0.25)}_${Math.round((lon + 180) / 0.25)}`;
const DACH = new Set(['DE', 'AT', 'CH', 'LI']);
const points = [];
for (const [id, p] of Object.entries(feat.byPoint)) {
  if (!DACH.has(p.country)) continue;
  const b0 = p.hmodel?.t3?.block?.find((b) => b.dx === 0 && b.dy === 0) ?? p.hmodel?.t3?.block?.[0];
  if (!b0) continue;
  const k = idx.get(cellKey(b0.centre.lat, b0.centre.lon));
  if (k == null) continue;
  points.push({ id, country: p.country, elev: p.elevM, lon: p.lon, cell: k, hm: b0.hmodel, muC: T?.climaMu?.byPoint?.[id]?.t ?? null });
}
say(`${points.length} DACH-Punkte mit Zelle im 0,25°-Extrakt (${extract.cells.length} Zellen), Fenster ${from}…${to}, jeder ${stride}. Tag`);

const cacheOf = (model, v, route, key) => join(root, 'cache', model, v, ...(route ? [route] : []), `${key}.hcv.gz`);
const truthCache = new Map();
const truthOf = (day) => {
  if (truthCache.has(day)) return truthCache.get(day);
  const p = join(root, 'truth', `${day}.json.gz`);
  const doc = existsSync(p) ? JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')) : null;
  if (truthCache.size > 40) truthCache.delete(truthCache.keys().next().value);
  truthCache.set(day, doc);
  return doc;
};
const NETS = ['cdc', 'tawes', 'smn'];
const truthAt = (id, ms, col) => {
  const day = new Date(ms).toISOString().slice(0, 10);
  const doc = truthOf(day); if (!doc) return null;
  const p = doc.byPoint?.[id]; if (!p) return null;
  const net = NETS.find((n) => p[n]?.obsAtMs?.length); if (!net) return null;
  const rec = p[net], i = rec.obsAtMs.indexOf(ms); if (i < 0) return null;
  const q = rec[col]?.[i]; if (q == null || !Number.isFinite(q)) return null;
  // the truth files carry a sentinel for missing values (`doc.sentinel`, −999 in the raw units) — never a value
  if (q === (doc.sentinel ?? -32768) || q === -32768) return null;
  const sc = doc.scales?.truth?.[col]?.scale ?? 0.01;
  return q * sc;
};
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
const ymd = (s) => s.replace(/-/g, '');
const days = [];
for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= Date.parse(`${to}T00:00:00Z`); ms += DAY) days.push(ms);
const used = days.filter((_, i) => i % stride === 0);
const acc = new Map();   // `${var}|${bin}|${layer}|${cand}` → { sa, n }
const pairs = new Map(); // `${var}|${bin}|${layer}|${cand}|${ref}` → PairAcc
const getOr = (m, k, mk) => { let a = m.get(k); if (!a) { a = mk(); m.set(k, a); } return a; };
const binOf = (lead) => (lead <= 240 ? '126–240' : '246–336');
const REFS = { ensMean: ['control', 'dynMean2', 'runMean2', 'hres', 'aifsRun', 'clima'], ensMedian: ['ensMean'], control: ['clima'], dynMean2: ['clima'], runMean2: ['clima', 'control'], hres: ['control'] };
const xC = new Float64Array(C_DIM);
let daysUsed = 0, rowsT = 0, rowsW = 0, rowsG = 0, daysRun = 0;
const T0 = Date.now();
for (const initMs of used) {
  const key = `${dayKey(initMs)}00`;
  const fEns = cacheOf('dyn-ifs-ens', 'temperature_2m', null, key);
  if (!existsSync(fEns)) continue;
  const ens = readHcv(fEns);
  const nt = ens.header.nt, nm = ens.header.members.length, leads = ens.header.leadsH;
  const ensU = existsSync(cacheOf('dyn-ifs-ens', 'wind_u_10m', null, key)) ? readHcv(cacheOf('dyn-ifs-ens', 'wind_u_10m', null, key)) : null;
  const ensV = ensU && existsSync(cacheOf('dyn-ifs-ens', 'wind_v_10m', null, key)) ? readHcv(cacheOf('dyn-ifs-ens', 'wind_v_10m', null, key)) : null;
  const ensG = existsSync(cacheOf('dyn-ifs-ens', 'wind_gust_10m', null, key)) ? readHcv(cacheOf('dyn-ifs-ens', 'wind_gust_10m', null, key)) : null;
  const aifsD = existsSync(cacheOf('dyn-aifs', 'temperature_2m', null, key)) ? readHcv(cacheOf('dyn-aifs', 'temperature_2m', null, key)) : null;
  const hres = existsSync(cacheOf('ecmwf_ifs025', 'temperature_2m', 'run', key)) ? readHcv(cacheOf('ecmwf_ifs025', 'temperature_2m', 'run', key)) : null;
  const aifsR = existsSync(cacheOf('ecmwf_aifs025_single', 'temperature_2m', 'run', key)) ? readHcv(cacheOf('ecmwf_aifs025_single', 'temperature_2m', 'run', key)) : null;
  // ICON global lies on its own grid (`icon_global_om`, 1 684 cells) — not on the 0,25° extract; the run mean here is HRES + AIFS
  const window = !!(hres && aifsR);
  if (window) daysRun += 1;
  const month = new Date(initMs).toISOString().slice(0, 7);
  const dayIdx = Math.floor(initMs / DAY);
  // dynamical caches carry `leadsH`; Open-Meteo run caches carry `times` (unix s) and `init`
  const leadIdxOf = (h, lh) => (!h ? -1 : h.header.leadsH ? h.header.leadsH.indexOf(lh) : h.header.times ? h.header.times.indexOf(h.header.init + lh * 3600) : -1);
  const val = (h, k, li, m = 0) => { if (!h || li < 0) return null; const M = h.header.members ? h.header.members.length : 1, NT = h.header.nt; const q = h.data[k * M * NT + m * NT + li]; return (h.header.dtype ?? 'int16') === 'int16' ? (q === -32768 ? null : q / h.header.scale + (h.header.offset ?? 0)) : (Number.isFinite(q) ? q : null); };
  daysUsed += 1;
  for (let li = 0; li < nt; li++) {
    const lead = leads[li];
    if (lead < 126 || lead > 336 || lead % 6 !== 0) continue;
    const validMs = initMs + lead * H, bin = binOf(lead);
    for (const p of points) {
      const yT = truthAt(p.id, validMs, 't');
      const hIfs = p.hm.ifs_hres, hAifs = p.hm.aifs_single, hIcon = p.hm.icon_global;
      const corr = (x, hm) => (x == null || hm == null ? null : x + LAPSE * (hm - p.elev));
      if (yT != null && hIfs != null) {
        const c = {};
        const ctrl = val(ens, p.cell, li, 0);
        let s = 0, n = 0; const arr = [];
        for (let m = 1; m < nm; m++) { const x = val(ens, p.cell, li, m); if (x != null) { s += x; n += 1; arr.push(x); } }
        if (ctrl != null && n >= 40) {
          c.control = corr(ctrl, hIfs); c.ensMean = corr(s / n, hIfs);
          arr.sort((a, b) => a - b); c.ensMedian = corr(arr[Math.floor(arr.length / 2)], hIfs);
          const a = corr(val(aifsD, p.cell, leadIdxOf(aifsD, lead)), hAifs);
          if (a != null) c.dynMean2 = 0.5 * (c.control + a);
          if (window) {
            const hh = corr(val(hres, p.cell, leadIdxOf(hres, lead)), hIfs), aa = corr(val(aifsR, p.cell, leadIdxOf(aifsR, lead)), hAifs);
            if (hh != null) c.hres = hh;
            if (aa != null) c.aifsRun = aa;
            if (hh != null && aa != null) c.runMean2 = (hh + aa) / 2;
          }
          if (p.muC) { climaDesign(validMs, p.lon, xC); let mc = 0; for (let j = 0; j < C_DIM; j++) mc += p.muC[j] * xC[j]; c.clima = mc; }
          rowsT += 1;
          for (const layer of ['all', `month:${month}`, `country:${p.country === 'LI' ? 'CH' : p.country}`, ...(window ? ["window"] : [])]) {
            for (const [cand, x] of Object.entries(c)) { const A = getOr(acc, `t|${bin}|${layer}|${cand}`, () => ({ sa: 0, n: 0 })); A.sa += Math.abs(x - yT); A.n += 1; }
            for (const [cand, refs] of Object.entries(REFS)) if (c[cand] != null) for (const r of refs) if (c[r] != null) getOr(pairs, `t|${bin}|${layer}|${cand}|${r}`, () => new PairAcc()).add(dayIdx, Math.abs(c[cand] - yT), Math.abs(c[r] - yT));
          }
        }
      }
      if (ensU && ensV) {
        const yW = truthAt(p.id, validMs, 'ff');
        if (yW != null) {
          const liU = leadIdxOf(ensU, lead);
          const u0 = val(ensU, p.cell, liU, 0), v0 = val(ensV, p.cell, liU, 0);
          let s = 0, n = 0;
          for (let m = 1; m < nm; m++) { const u = val(ensU, p.cell, liU, m), v = val(ensV, p.cell, liU, m); if (u != null && v != null) { s += Math.hypot(u, v); n += 1; } }
          if (u0 != null && v0 != null && n >= 40) {
            const c = { control: Math.hypot(u0, v0), ensMean: s / n };
            rowsW += 1;
            for (const layer of ['all', `country:${p.country === 'LI' ? 'CH' : p.country}`]) {
              for (const [cand, x] of Object.entries(c)) { const A = getOr(acc, `ws|${bin}|${layer}|${cand}`, () => ({ sa: 0, n: 0 })); A.sa += Math.abs(x - yW); A.n += 1; }
              getOr(pairs, `ws|${bin}|${layer}|ensMean|control`, () => new PairAcc()).add(dayIdx, Math.abs(c.ensMean - yW), Math.abs(c.control - yW));
            }
          }
        }
      }
      if (ensG) {
        const yG = truthAt(p.id, validMs, 'fxh');
        if (yG != null) {
          const liG = leadIdxOf(ensG, lead);
          const g0 = val(ensG, p.cell, liG, 0);
          let s = 0, n = 0;
          for (let m = 1; m < nm; m++) { const g = val(ensG, p.cell, liG, m); if (g != null) { s += g; n += 1; } }
          if (g0 != null && n >= 40) {
            const c = { control: g0, ensMean: s / n };
            rowsG += 1;
            for (const layer of ['all', `country:${p.country === 'LI' ? 'CH' : p.country}`]) {
              for (const [cand, x] of Object.entries(c)) { const A = getOr(acc, `gust|${bin}|${layer}|${cand}`, () => ({ sa: 0, n: 0 })); A.sa += Math.abs(x - yG); A.n += 1; }
              getOr(pairs, `gust|${bin}|${layer}|ensMean|control`, () => new PairAcc()).add(dayIdx, Math.abs(c.ensMean - yG), Math.abs(c.control - yG));
            }
          }
        }
      }
    }
  }
  if (daysUsed % 10 === 0) say(`${key}: ${daysUsed} Tage, T ${rowsT} · Wind ${rowsW} · Böe ${rowsG} Zeilen, ${Math.round((Date.now() - T0) / 1000)} s`);
}
say(`${daysUsed} Läufe (${daysRun} im Lauf-Fenster), T ${rowsT} · Wind ${rowsW} · Böe ${rowsG} Zeilen, ${Math.round((Date.now() - T0) / 1000)} s`);

const cells = [];
const ps = [];
for (const [k, pa] of pairs) {
  const [v, bin, layer, cand, ref] = k.split('|');
  const sm = pa.summary(); if (!sm) continue;
  cells.push({ v, bin, layer, cand, ref, n: sm.n, days: sm.days, maeCand: acc.get(`${v}|${bin}|${layer}|${cand}`).sa / acc.get(`${v}|${bin}|${layer}|${cand}`).n, maeRef: acc.get(`${v}|${bin}|${layer}|${ref}`).sa / acc.get(`${v}|${bin}|${layer}|${ref}`).n, skill: sm.skill, dm: sm.dm });
  if (sm.dm && Number.isFinite(sm.dm.p)) ps.push(sm.dm.p);
}
const bh = benjaminiHochberg(ps); let bi = 0; for (const c of cells) if (c.dm && Number.isFinite(c.dm.p)) { c.dm.pBH = bh[bi]; bi += 1; }
const maes = {}; for (const [k, a] of acc) maes[k] = { n: a.n, mae: a.sa / a.n };
const card = { kind: 'fusionfit/ens-mean-check', schema: 1, builtAt: new Date().toISOString(), codeHash: codeHash(), window: { from, to, stride, days: daysUsed, daysRun }, points: points.length, rows: { t: rowsT, ws: rowsW, gust: rowsG }, maes, cells };
mkdirSync(dirname(flags.out), { recursive: true });
writeFileSync(flags.out, JSON.stringify(card));
const f3 = (x) => (x == null ? '—' : x.toFixed(3)), pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)} %`);
const star = (c) => (c.dm?.pBH == null ? '' : c.dm.pBH < 0.05 ? (c.skill > 0 ? '*' : '!') : '');
const LABEL = { control: 'IFS-ENS-Kontrolllauf', ensMean: 'ENS-Mittel (50 Member)', ensMedian: 'ENS-Median', dynMean2: 'dyn-Route: (Kontrolle + AIFS)/2', hres: 'IFS HRES (Lauf)', aifsRun: 'AIFS (Lauf)', runMean2: 'Lauf: (HRES + AIFS)/2', clima: 'Klimatologie μ_c (LOSO)' };
const md = [`# AX-6 — Ensemble-Mittel in t3: roh am 0,25°-Punkt gegen die Wahrheit (MAE, Höhe mit Standardgradient)`, '',
  `Karte ${card.builtAt.slice(0, 16)}Z · ${points.length} Punkte · ${daysUsed} Läufe (00z, jeder ${stride}. Tag ${from}…${to}; ${daysRun} davon im Lauf-Fenster mit HRES/AIFS/ICON) · T ${rowsT}, Wind ${rowsW}, Böe ${rowsG} Zeilen. Skill = 1 − MAE(Kandidat)/MAE(Referenz); * signifikant besser, ! schlechter (DM auf Tagesmitteln, HLN, BH).`, ''];
md.push('## MAE je Kandidat (Schicht all und window)', '', '| Größe | Bin | Schicht | ' + Object.keys(LABEL).join(' | ') + ' |', '|---|---|---|' + Object.keys(LABEL).map(() => '---').join('|') + '|');
for (const v of ['t', 'ws', 'gust']) for (const bin of ['126–240', '246–336']) for (const layer of ['all', 'window', 'country:DE', 'country:AT', 'country:CH']) {
  const row = Object.keys(LABEL).map((c) => { const m = maes[`${v}|${bin}|${layer}|${c}`]; return m ? `${f3(m.mae)} (${m.n})` : '—'; });
  if (row.every((x) => x === '—')) continue;
  md.push(`| ${v} | ${bin} | ${layer} | ${row.join(' | ')} |`);
}
md.push('', '## Paare (Skill des Kandidaten gegen die Referenz)', '', '| Größe | Bin | Schicht | Kandidat | Referenz | n | Tage | MAE Kand. | MAE Ref. | Skill |', '|---|---|---|---|---|---|---|---|---|---|');
for (const c of cells.filter((c) => ['all', 'window', 'country:DE', 'country:AT', 'country:CH'].includes(c.layer)).sort((a, b) => a.v.localeCompare(b.v) || a.bin.localeCompare(b.bin) || a.layer.localeCompare(b.layer) || a.cand.localeCompare(b.cand))) md.push(`| ${c.v} | ${c.bin} | ${c.layer} | ${LABEL[c.cand] ?? c.cand} | ${LABEL[c.ref] ?? c.ref} | ${c.n} | ${c.days} | ${f3(c.maeCand)} | ${f3(c.maeRef)} | ${pct(c.skill)}${star(c)} |`);
md.push('', '## Monate (T, ENS-Mittel gegen Kontrolllauf)', '', '| Monat | 126–240 h | 246–336 h |', '|---|---|---|');
const months = [...new Set(cells.filter((c) => c.layer.startsWith('month:')).map((c) => c.layer))].sort();
for (const m of months) { const a = cells.find((c) => c.v === 't' && c.bin === '126–240' && c.layer === m && c.cand === 'ensMean' && c.ref === 'control'), b = cells.find((c) => c.v === 't' && c.bin === '246–336' && c.layer === m && c.cand === 'ensMean' && c.ref === 'control'); md.push(`| ${m.slice(6)} | ${a ? `${pct(a.skill)}${star(a)}` : '—'} | ${b ? `${pct(b.skill)}${star(b)}` : '—'} |`); }
if (typeof flags.decision === 'string') { mkdirSync(dirname(flags.decision), { recursive: true }); writeFileSync(flags.decision, md.join('\n')); }
writeFileSync(flags.out.replace(/\.json$/, '.md'), md.join('\n'));
for (const c of cells.filter((c) => c.layer === 'all' && c.cand === 'ensMean')) say(`${c.v} ${c.bin}: ENS-Mittel gegen ${c.ref}: MAE ${f3(c.maeCand)} gegen ${f3(c.maeRef)} (${pct(c.skill)}${star(c)})`);
say(`geschrieben ${flags.out} (+ .md)`);
