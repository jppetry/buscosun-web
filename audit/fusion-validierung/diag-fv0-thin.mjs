/**
 * diag-fv0-thin.mjs — stage 0 of phase FV (`audit/fusion-validierung.md` §1.3): which points and how many rows survive the
 * row thinning of `fit.mjs`/`score.mjs` per tier — the rule up to phase FX (`legacy`, V-FX-44) against `hash`
 * (`scripts/fusionfit/lib/thin.mjs`) at stride 6 and 12, on the real case files. Reads only the key columns.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-validierung/diag-fv0-thin.mjs [--months=2025-09,2026-09]
 */
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'file:///C:/dev/buscosun-web/scripts/hindcast/lib/common.mjs';
import { readCases } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/casesio.mjs';
import { thinSelect } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/thin.mjs';

const flags = parseArgs(process.argv.slice(2));
const casesDir = 'C:/dev/buscosun-hindcast/cases/v1';
const range = typeof flags.months === 'string' ? flags.months.split(',') : null;
const RULES = [['legacy', 6], ['hash', 6], ['legacy', 12], ['hash', 12]];
const sel = RULES.map(([m, s]) => thinSelect(m, s));
const acc = {};   // tier → { rows, withT, perRule: [{ rows, withT, points: Map<pointIdx, n> }] }
const T0 = Date.now();
let nPoints = 0;
for (const m of readdirSync(casesDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort()) {
  if (range && (m < range[0] || m > range[1])) continue;
  for (const t of ['t1', 't2', 't3']) {
    const p = join(casesDir, m, `${t}.cas.gz`);
    if (!existsSync(`${p}.meta.json`)) continue;
    const a = acc[t] ?? (acc[t] = { rows: 0, withT: 0, pointsAll: new Set(), perRule: RULES.map(() => ({ rows: 0, withT: 0, points: new Map() })) });
    await readCases(p, { columns: ['validAtH', 'pointIdx', 'obs_t'], batchRows: 65536, onBatch: (c, n, header) => {
      nPoints = header.points.length;
      for (let i = 0; i < n; i++) {
        const v = c.validAtH[i], pi = c.pointIdx[i], hasT = Number.isFinite(c.obs_t[i]);
        a.rows += 1; if (hasT) a.withT += 1; a.pointsAll.add(pi);
        for (let r = 0; r < RULES.length; r++) if (sel[r](v, pi)) { const o = a.perRule[r]; o.rows += 1; if (hasT) o.withT += 1; o.points.set(pi, (o.points.get(pi) ?? 0) + 1); }
      }
    } });
    console.log(`[thin] ${m} ${t} · ${Math.round((Date.now() - T0) / 1000)} s`);
  }
}
const out = { builtAt: new Date().toISOString(), months: range ?? 'all', points: nPoints, rules: RULES.map(([m, s]) => `${m}/${s}`), tiers: {} };
const md = [`# Zeilenverdünnung je Stufe (${out.builtAt.slice(0, 16)} UTC, Falldateien ${range ? range.join('…') : 'alle Monate'})`, '', '| Stufe | Zeilen gesamt (Punkte) | Regel | Zeilen (Anteil) | davon mit Wahrheit T | Punkte mit ≥ 1 Zeile | Zeilen je Punkt min / p50 / max |', '|---|---|---|---|---|---|---|'];
for (const [t, a] of Object.entries(acc)) {
  out.tiers[t] = { rows: a.rows, withT: a.withT, points: a.pointsAll.size, rules: {} };
  RULES.forEach(([m, s], r) => {
    const o = a.perRule[r];
    const per = [...o.points.values()].sort((x, y) => x - y);
    const rec = { rows: o.rows, share: o.rows / a.rows, withT: o.withT, points: o.points.size, perPoint: per.length ? { min: per[0], p50: per[Math.floor(per.length / 2)], max: per[per.length - 1] } : null };
    out.tiers[t].rules[`${m}/${s}`] = rec;
    md.push(`| ${t} | ${a.rows} (${a.pointsAll.size}) | ${m} / ${s} | ${o.rows} (${(100 * rec.share).toFixed(2)} %) | ${o.withT} | **${o.points.size}** | ${rec.perPoint ? `${rec.perPoint.min} / ${rec.perPoint.p50} / ${rec.perPoint.max}` : '—'} |`);
  });
}
writeFileSync('C:/dev/buscosun-web/audit/fusion-validierung/diag-fv0-thin.json', JSON.stringify(out, null, 1));
writeFileSync('C:/dev/buscosun-web/audit/fusion-validierung/diag-fv0-thin.md', md.join('\n') + '\n');
console.log(md.join('\n'));
