/**
 * fit-clima.mjs — stage E of phase FL (`audit/fusion-lernphase.md` §3.4): the hourly climatology μ_c, σ_c per point
 * and variable from the hindcast truth (2023-05-24 … today), and the anomaly autocorrelation ρ(τ) per variable and
 * height band. Two passes over `truth\<day>.json.gz`: the mean, then the variance and the lags. Writes
 * `<root>\fit\<date>\clima.hindcast.json` (provenance `hindcast`; V-PV-18).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/fit-clima.mjs
 *       [--root=…] [--features=…] [--out=<root>\fit\<date>\clima.hindcast.json] [--from=2023-05-24] [--to=…]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { HINDCAST_ROOT, parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { Gram } from '../../src/point/fusionFit/gram.ts';
import { climaDesign, C_DIM, CLIMA_VARS, fitClimaMean, fitClimaVariance, LagAcc, AnomalyRing, RHO_LAGS_H } from '../../src/point/fusionFit/fitClima.ts';
import { windComponents } from '../../src/point/fusionFit/features.ts';
import { FIT_VERSION } from '../../src/point/fusionFit/tables.ts';
import { siteOf } from './lib/rowFeatures.mjs';

const H = 3_600_000, SENT = -32768;
const flags = parseArgs(process.argv.slice(2));
const root = typeof flags.root === 'string' ? flags.root : HINDCAST_ROOT;
const featPath = typeof flags.features === 'string' ? flags.features : join(root, 'features', 'points.v1.json');
const stamp = new Date().toISOString().slice(0, 10);
const out = typeof flags.out === 'string' ? flags.out : join(root, 'fit', stamp, 'clima.hindcast.json');
const from = flags.from ? String(flags.from) : '0000', to = flags.to ? String(flags.to) : '9999';
const say = (s) => console.log(`[clima] ${s}`);

const feat = JSON.parse(readFileSync(featPath, 'utf8'));
const sites = new Map(Object.values(feat.byPoint).filter((r) => ['DE', 'AT', 'CH', 'LI'].includes(r.country)).map((r) => [r.id, siteOf(r)]));
const days = readdirSync(join(root, 'truth')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d >= from && d <= to).sort();
say(`${sites.size} Punkte, ${days.length} Wahrheitstage ${days[0]} … ${days[days.length - 1]}`);

/** Iterate the hourly rows of one truth day: cb(pointId, validAtMs, dayIdx, y) with y = { t, td, u, v, gust, clct, precip }. */
function eachHour(day, cb) {
  const doc = JSON.parse(gunzipSync(readFileSync(join(root, 'truth', `${day}.json.gz`))).toString('utf8'));
  const sc = doc.scales?.truth ?? {};
  const dec = (rec, key, i) => { const q = rec[key]?.[i]; if (q == null || q === SENT) return NaN; const s = sc[key]; return s ? q * s.scale + s.offset : q; };
  for (const [id, nets] of Object.entries(doc.byPoint ?? {})) {
    if (!sites.has(id)) continue;
    const net = ['cdc', 'tawes', 'smn'].find((n) => nets?.[n]?.obsAtMs?.length);
    if (!net) continue;
    const rec = nets[net];
    for (let i = 0; i < rec.obsAtMs.length; i++) {
      const ms = rec.obsAtMs[i];
      const t = dec(rec, 't', i), td = dec(rec, 'td', i), ff = dec(rec, 'ff', i), dd = dec(rec, 'dd', i), fx = dec(rec, 'fxh', i), n = net === 'cdc' ? dec(rec, 'n', i) : NaN;
      const rr = net === 'cdc' ? dec(rec, 'rr1', i) : dec(rec, 'rr1h', i);
      const w = Number.isFinite(ff) && Number.isFinite(dd) ? windComponents(ff, dd) : { u: NaN, v: NaN };
      cb(id, ms, Math.floor(ms / 86_400_000), { t, td, u: w.u, v: w.v, gust: fx, clct: n, precip: Number.isFinite(rr) ? Math.log1p(Math.max(0, rr)) : NaN });
    }
  }
}

// ── pass 1: the mean ──────────────────────────────────────────────────────────
const gm = new Map();   // `${id}|${v}` → Gram ; pooled `${band}|${country}|${v}`
const gramOf = (key) => { let g = gm.get(key); if (!g) { g = new Gram(C_DIM); gm.set(key, g); } return g; };
const x = new Float64Array(C_DIM);
let T0 = Date.now(), nRows = 0;
for (let d = 0; d < days.length; d++) {
  eachHour(days[d], (id, ms, dayIdx, y) => {
    const s = sites.get(id);
    climaDesign(ms, s.site.lonDeg, x);
    for (const v of CLIMA_VARS) { const yy = y[v]; if (!Number.isFinite(yy)) continue; gramOf(`${id}|${v}`).add(x, yy, dayIdx); gramOf(`${s.band}|${s.country}|${v}`).add(x, yy, dayIdx); nRows += 1; }
  });
  if ((d + 1) % 100 === 0) say(`Durchlauf 1: ${d + 1}/${days.length} Tage, ${nRows} Werte, ${Math.round((Date.now() - T0) / 1000)} s`);
}
const mean = new Map();   // key → { beta, entry }
for (const [key, g] of gm) mean.set(key, fitClimaMean(g));
say(`Durchlauf 1 fertig: ${gm.size} Reihen, ${[...mean.values()].filter((m) => m.beta).length} mit Mittel`);

// ── pass 2: variance of the anomalies and their lag correlation ───────────────
const gv = new Map(), lags = new Map(), rings = new Map();
const gvOf = (key) => { let g = gv.get(key); if (!g) { g = new Gram(C_DIM); gv.set(key, g); } return g; };
const lagOf = (key) => { let l = lags.get(key); if (!l) { l = new LagAcc(RHO_LAGS_H); lags.set(key, l); } return l; };
const ringOf = (key) => { let r = rings.get(key); if (!r) { r = new AnomalyRing(); rings.set(key, r); } return r; };
T0 = Date.now();
for (let d = 0; d < days.length; d++) {
  eachHour(days[d], (id, ms, dayIdx, y) => {
    const s = sites.get(id);
    climaDesign(ms, s.site.lonDeg, x);
    const h = Math.round(ms / H);
    for (const v of CLIMA_VARS) {
      const yy = y[v]; if (!Number.isFinite(yy)) continue;
      const m = mean.get(`${id}|${v}`)?.beta ?? mean.get(`${s.band}|${s.country}|${v}`)?.beta;
      if (!m) continue;
      let mu = 0; for (let i = 0; i < C_DIM; i++) mu += m[i] * x[i];
      const a = yy - mu;
      gvOf(`${id}|${v}`).add(x, a * a, dayIdx); gvOf(`${s.band}|${s.country}|${v}`).add(x, a * a, dayIdx);
      const ring = ringOf(`${id}|${v}`);
      ring.push(h, a);
      lagOf(`${v}|${s.band}`).add(a, (lag) => ring.at(h, lag));
    }
  });
  if ((d + 1) % 100 === 0) say(`Durchlauf 2: ${d + 1}/${days.length} Tage, ${Math.round((Date.now() - T0) / 1000)} s`);
}

const byPoint = {}, pooled = {};
for (const [key, m] of mean) {
  const parts = key.split('|');
  const v = parts[parts.length - 1];
  const entry = { ...m.entry, ...(m.beta ? fitClimaVariance(gv.get(key) ?? new Gram(C_DIM)) : { var: [], varFloor: 0 }) };
  if (parts.length === 2) (byPoint[parts[0]] ??= {})[v] = entry; else (pooled[`${parts[0]}|${parts[1]}`] ??= {})[v] = entry;
}
const rho = {};
for (const [key, l] of lags) rho[key] = l.rho();
const doc = {
  schema: 1, kind: 'fusionfit/clima', fitVersion: FIT_VERSION, provenance: 'hindcast', builtAt: new Date().toISOString(), codeHash: codeHash(),
  period: { from: days[0], to: days[days.length - 1] }, days: days.length, points: sites.size, design: 'C_NAMES (fitClima.ts)', lagsH: RHO_LAGS_H,
  counts: { written: Object.values(byPoint).reduce((a, p) => a + Object.values(p).filter((e) => e.status === 'written').length, 0), tooShort: Object.values(byPoint).reduce((a, p) => a + Object.values(p).filter((e) => e.status !== 'written').length, 0) },
  byPoint, pooled, rho,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc));
say(`geschrieben ${out}: ${doc.counts.written} Reihen mit Mittel, ${doc.counts.tooShort} zu kurz, ρ für ${Object.keys(rho).length} (Größe, Band)`);
for (const [k, r] of Object.entries(rho)) if (k.startsWith('t|')) say(`ρ(τ) ${k}: ${r.map((x) => `${x.lagH}h ${x.rho}`).join(' · ')}`);
