/**
 * interp-score.mjs — phase AX, AX-3 (`audit/fusion-ausbau.md` §3; report #16): what the hourly axis loses between native steps,
 * and what a climatological diurnal template gives back.
 *
 * The cube path fills the hours between native steps (t2 every 3 h, t3 every 6 h) by LINEAR interpolation of the quantiles
 * (`cubeSource.ts`, AP7); at a point without a station that is 232 of 337 hours. Linear interpolation clips the daily maximum
 * and minimum. The alternative interpolates the ANOMALY against the point's climatological diurnal cycle μ_c(t) (the
 * leave-station-out coefficients of the tables, `climaMu`, the same μ_c the client estimates from the climatology product):
 *
 *     anomaly(t) = lerp(t) + [ μ_c(t) − lerp(μ_c(t_a), μ_c(t_b)) ]
 *
 * The correction term does not depend on the forecast values, only on the template — so the difference between the two
 * methods can be measured on the TRUTH itself (oracle): the hourly station series is sampled every 3 h / 6 h and filled back
 * both ways; the error at the filled hours is the interpolation error of each method, free of any model error. That is the
 * decision basis; the model error at native steps adds to both methods alike.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/interp-score.mjs
 *       --tables=<fit 5e>/fusion.hindcast.json --out=<root>/score/<date>-ax3/interp.json [--decision=audit/fusion-ausbau/ax3-interp.md]
 *       [--features=…/features/points.v1.json] [--truth=…/truth] [--stride=3] [--from=2025-09-01] [--to=2026-09-21]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { HINDCAST_ROOT, parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { PairAcc } from './lib/stats.mjs';
import { climaDesign, C_DIM, C_NAMES } from '../../src/point/fusionFit/fitClima.ts';

const H = 3_600_000;
const flags = parseArgs(process.argv.slice(2));
if (typeof flags.tables !== 'string' || typeof flags.out !== 'string') throw new Error('--tables und --out sind Pflicht');
const featPath = typeof flags.features === 'string' ? flags.features : join(HINDCAST_ROOT, 'features', 'points.v1.json');
const truthDir = typeof flags.truth === 'string' ? flags.truth : join(HINDCAST_ROOT, 'truth');
const stride = Math.max(1, Number(flags.stride) || 3);
const from = typeof flags.from === 'string' ? flags.from : '2025-09-01', to = typeof flags.to === 'string' ? flags.to : '2026-09-21';
const say = (s) => console.log(`[interp-score] ${s}`);

const T = JSON.parse(readFileSync(flags.tables, 'utf8'));
if (!T.climaMu?.byPoint) throw new Error(`${flags.tables}: keine climaMu.byPoint`);
if (JSON.stringify(T.design?.mean?.climaVars ?? []) === '[]') say('WARNUNG: Tabellen ohne climaVars — die μ_c-Spalten stammen aus climaMu, nicht aus dem Fit');
const feat = JSON.parse(readFileSync(featPath, 'utf8'));
const DACH = new Set(['DE', 'AT', 'CH', 'LI']);
const points = Object.keys(feat.byPoint).filter((id) => DACH.has(feat.byPoint[id].country) && T.climaMu.byPoint[id]).sort();
say(`${points.length} Punkte mit μ_c (${Object.keys(T.climaMu.byPoint).length} in den Tabellen), Design ${C_NAMES.length} Spalten`);

/** truth column per variable and the μ_c key */
const VARS = { t: { col: 't', mu: 't', unit: 'K' }, td: { col: 'td', mu: 'td', unit: 'K' }, gust: { col: 'fxh', mu: 'gust', unit: 'm/s' } };
const DELTAS = [3, 6];
const NETS = ['cdc', 'tawes', 'smn'];
const days = readdirSync(truthDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d >= from && d <= to).sort();
const used = days.filter((_, i) => i % stride === 0);
say(`${days.length} Wahrheitstage im Fenster ${from}…${to}, jeder ${stride}. ⇒ ${used.length} Tage`);

// accumulators: key `${v}|${Δ}|${layer}` → { lin: {sa, sq, n}, ano: {sa, sq, n}, pair: PairAcc(|ano| gegen |lin|) }
const acc = new Map();
const accOf = (k) => { let a = acc.get(k); if (!a) { a = { lin: { sa: 0, sq: 0, n: 0 }, ano: { sa: 0, sq: 0, n: 0 }, pair: new PairAcc(), betterDays: 0, worseDays: 0 }; acc.set(k, a); } return a; };
const hourClass = (h) => (h >= 12 && h <= 16 ? 'max' : h >= 3 && h <= 6 ? 'min' : 'other');
const x = new Float64Array(C_DIM);
const muAt = (coef, ms, lon) => { climaDesign(ms, lon, x); let s = 0; for (let j = 0; j < C_DIM; j++) s += coef[j] * x[j]; return s; };

let dayIdx = 0, rowsTotal = 0;
for (const d of used) {
  const s = JSON.parse(gunzipSync(readFileSync(join(truthDir, `${d}.json.gz`))).toString('utf8'));
  const scales = s.scales?.truth ?? {};
  const month = d.slice(0, 7);
  const dayStart = Date.parse(`${d}T00:00:00Z`);
  let rowsDay = 0;
  for (const id of points) {
    const p = s.byPoint?.[id]; if (!p) continue;
    const net = NETS.find((n) => p[n]?.obsAtMs?.length); if (!net) continue;
    const rec = p[net];
    const row = feat.byPoint[id], lon = row.lon, cc = row.country;
    const idx = new Map(rec.obsAtMs.map((ms, i) => [ms, i]));
    for (const [v, spec] of Object.entries(VARS)) {
      const coef = T.climaMu.byPoint[id][spec.mu];
      const arr = rec[spec.col];
      if (!coef || coef.length !== C_DIM || !Array.isArray(arr)) continue;
      const sc = scales[spec.col]?.scale ?? 0.01, off = scales[spec.col]?.offset ?? 0;
      const valAt = (ms) => { const i = idx.get(ms); if (i == null) return null; const q = arr[i]; return q == null || !Number.isFinite(q) ? null : q * sc + off; };
      for (const D of DELTAS) {
        for (let a = 0; a + D <= 23; a += D) {
          const msA = dayStart + a * H, msB = dayStart + (a + D) * H;
          const ya = valAt(msA), yb = valAt(msB);
          if (ya == null || yb == null) continue;
          const mA = muAt(coef, msA, lon), mB = muAt(coef, msB, lon);
          for (let h = a + 1; h < a + D; h++) {
            const ms = dayStart + h * H, y = valAt(ms);
            if (y == null) continue;
            const f = (h - a) / D;
            const lin = ya + (yb - ya) * f;
            const ano = lin + (muAt(coef, ms, lon) - (mA + (mB - mA) * f));
            const eL = Math.abs(lin - y), eA = Math.abs(ano - y);
            rowsDay += 1;
            for (const layer of ['all', `month:${month}`, `hour:${hourClass(h)}`, `country:${cc}`]) {
              const A = accOf(`${v}|${D}|${layer}`);
              A.lin.sa += eL; A.lin.sq += eL * eL; A.lin.n += 1;
              A.ano.sa += eA; A.ano.sq += eA * eA; A.ano.n += 1;
              A.pair.add(dayIdx, eA, eL);
            }
          }
        }
      }
    }
  }
  rowsTotal += rowsDay;
  dayIdx += 1;
  if (dayIdx % 20 === 0) say(`${d}: ${rowsTotal} Zeilen bisher`);
}
say(`${rowsTotal} Zeilen (Stunde × Punkt × Größe × Δ) an ${dayIdx} Tagen`);

// ── card ──────────────────────────────────────────────────────────────────────
const cells = [];
for (const [k, A] of acc) {
  const [v, D, layer] = k.split('|');
  const sm = A.pair.summary();
  // day-level: how many days the anomaly form was better in the mean
  let better = 0, worse = 0;
  for (const [, [sc, sr]] of A.pair.byDay) { if (sc < sr) better += 1; else if (sc > sr) worse += 1; }
  cells.push({ v, delta: Number(D), layer, n: A.lin.n, days: A.pair.byDay.size, maeLin: A.lin.sa / A.lin.n, maeAno: A.ano.sa / A.ano.n, rmseLin: Math.sqrt(A.lin.sq / A.lin.n), rmseAno: Math.sqrt(A.ano.sq / A.ano.n), skill: sm?.skill ?? null, dm: sm?.dm ?? null, ci90: sm?.ci90 ?? null, daysBetter: better, daysWorse: worse });
}
cells.sort((a, b) => a.v.localeCompare(b.v) || a.delta - b.delta || a.layer.localeCompare(b.layer));
const card = { kind: 'fusionfit/interp-score', schema: 1, builtAt: new Date().toISOString(), codeHash: codeHash(), tables: flags.tables, truth: truthDir, window: { from, to, stride, days: dayIdx }, points: points.length, rows: rowsTotal, cells };
mkdirSync(dirname(flags.out), { recursive: true });
writeFileSync(flags.out, JSON.stringify(card));

const f3 = (x) => (x == null ? '—' : x.toFixed(3));
const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)} %`);
const star = (c) => (c.dm?.p == null ? '' : c.dm.p < 0.05 ? (c.skill > 0 ? '*' : '!') : '');
const md = [`# AX-3 — Interpolation zwischen den nativen Schritten: linear gegen Anomalie (Orakel auf der Wahrheit)`, '',
  `Karte ${card.builtAt.slice(0, 16)}Z · ${points.length} Stationspunkte · ${dayIdx} Tage (${from}…${to}, jeder ${stride}.) · ${rowsTotal} Zeilen · μ_c = Leave-Station-out-Koeffizienten der Tabellen (${flags.tables.split(/[\\/]/).slice(-2).join('/')}). Skill = 1 − MAE(Anomalie)/MAE(linear); * signifikant besser, ! signifikant schlechter (DM auf Tagesmitteln, HLN, Student-t). „Tage besser" = Tage, an denen die Anomalieform im Mittel den kleineren Fehler hatte.`, ''];
for (const v of Object.keys(VARS)) {
  md.push(`## ${v === 't' ? 'Temperatur' : v === 'td' ? 'Taupunkt' : 'Böe'} (${VARS[v].unit})`, '', '| Δ | Schicht | n | Tage | MAE linear | MAE Anomalie | Skill | RMSE linear | RMSE Anomalie | Tage besser / schlechter |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const c of cells.filter((c) => c.v === v)) md.push(`| ${c.delta} h | ${c.layer} | ${c.n} | ${c.days} | ${f3(c.maeLin)} | ${f3(c.maeAno)} | ${pct(c.skill)}${star(c)} | ${f3(c.rmseLin)} | ${f3(c.rmseAno)} | ${c.daysBetter} / ${c.daysWorse} |`);
  md.push('');
}
const all = (v, D) => cells.find((c) => c.v === v && c.delta === D && c.layer === 'all');
md.push('## Kurz', '');
for (const v of Object.keys(VARS)) for (const D of DELTAS) { const c = all(v, D); if (c) md.push(`- **${v} · ${D} h:** MAE ${f3(c.maeLin)} → ${f3(c.maeAno)} ${VARS[v].unit} (${pct(c.skill)}${star(c)}, p ${c.dm?.p == null ? '—' : c.dm.p.toExponential(1)}); Tagesmaximum-Stunden ${pct(cells.find((x) => x.v === v && x.delta === D && x.layer === 'hour:max')?.skill)}, Minimum-Stunden ${pct(cells.find((x) => x.v === v && x.delta === D && x.layer === 'hour:min')?.skill)}`); }
if (typeof flags.decision === 'string') { mkdirSync(dirname(flags.decision), { recursive: true }); writeFileSync(flags.decision, md.join('\n')); }
writeFileSync(flags.out.replace(/\.json$/, '.md'), md.join('\n'));
say(`geschrieben ${flags.out} (+ .md${typeof flags.decision === 'string' ? `, ${flags.decision}` : ''}): ${cells.length} Zellen`);
for (const v of Object.keys(VARS)) for (const D of DELTAS) { const c = all(v, D); if (c) say(`${v} Δ${D}: MAE ${f3(c.maeLin)} → ${f3(c.maeAno)} (${pct(c.skill)}${star(c)})`); }
