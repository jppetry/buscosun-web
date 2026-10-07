#!/usr/bin/env node
/**
 * kennzahlen.mjs — leitet aus einer scores.json des Prüfstands (Protokoll P1) eine flache Kennzahlentabelle ab.
 *
 * Herkunft: Cowork-Sitzung 07.10.2026 (Bewertung von buscosun Fusion 9). Der Prüfstand weist die Produktaussage als
 * CRPS-Skill gegen deterministische Quellen aus; diese Tabelle stellt zusätzlich den MAE des Medians gegen den MAE der
 * Quellen und den CRPS gegen die Klimatologie, je Menge × Rolle × Land × Größe × Fenster. Es wird nichts neu gerechnet,
 * nur aus den Zellen der scores.json geteilt.
 *
 * Aufruf (im Repo):
 *   node audit/fusion10-vorbereitung/kennzahlen.mjs [--scores=<scores.json>] [--modell=fusion-9] [--out=<datei.csv>]
 * Vorgabe: --scores=audit/pruefstand/berichte/fusion-9/2026-10-05-abnahme/scores.json, --modell=fusion-9,
 *          --out=audit/fusion10-vorbereitung/kennzahlen-fusion9.csv
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, true]; }));
const scoresPath = args.scores ?? 'audit/pruefstand/berichte/fusion-9/2026-10-05-abnahme/scores.json';
const model = args.modell ?? 'fusion-9';
const out = args.out ?? 'audit/fusion10-vorbereitung/kennzahlen-fusion9.csv';

const s = JSON.parse(readFileSync(scoresPath, 'utf8'));
const REFS = ['ref-mosmix', 'ref-roh', 'ref-roh-lapse', 'ref-klima', 'ref-naiv', 'ref-persistenz'];
const WINDOWS = ['0-6', '6-24', '24-48', '48-120', '120-240', '240-336'];
const num = (x, d = 4) => (x == null || !Number.isFinite(x) ? '' : x.toFixed(d));
const skill = (a, b) => (a == null || b == null || !(b > 0) ? null : 1 - a / b);

const head = ['menge', 'rolle', 'land', 'groesse', 'fenster', 'n', 'mae', 'rmse', 'crps', 'bias', 'abdeckung_q10_q90', 'breite', 'spread_skill',
  ...REFS.flatMap((r) => [`mae_${r.replace('ref-', '')}`, `crps_${r.replace('ref-', '')}`, `n_${r.replace('ref-', '')}`]),
  'beste_det_quelle', 'mae_skill_gegen_beste_det', 'crps_skill_gegen_beste_det', 'crps_skill_gegen_klima'];
const rows = [head.join(';')];

for (const [setKey, set] of Object.entries(s.sets ?? {})) {
  if (!set.models || !set.models[model]) continue;
  const idx = new Map();
  for (const [id, m] of Object.entries(set.models)) for (const c of m.cells ?? []) idx.set(`${id}|${c.var}|${c.window}|${c.land}|${c.role}`, c);
  const cells = [...set.models[model].cells].sort((a, b) => `${a.role}${a.land}${a.var}`.localeCompare(`${b.role}${b.land}${b.var}`) || WINDOWS.indexOf(a.window) - WINDOWS.indexOf(b.window));
  for (const f of cells) {
    const key = (id) => idx.get(`${id}|${f.var}|${f.window}|${f.land}|${f.role}`);
    // beste deterministische Quelle je Zelle (wie die Produktaussage: Cube roh, Cube roh + Lapse, MOSMIX-L), nur mit
    // ausreichend Fällen (mindestens die Hälfte der Fusion-Fälle)
    const det = ['ref-roh', 'ref-roh-lapse', 'ref-mosmix'].map((r) => [r, key(r)]).filter(([, c]) => c && c.mae != null && c.n > 0.5 * f.n);
    const best = det.length ? det.reduce((a, b) => (b[1].mae < a[1].mae ? b : a)) : null;
    const klima = key('ref-klima');
    rows.push([setKey, f.role, f.land, f.var, f.window, f.n, num(f.mae), num(f.rmse), num(f.score), num(f.bias), num(f.cover), num(f.width), num(f.spreadSkill, 3),
      ...REFS.flatMap((r) => { const c = key(r); return [num(c?.mae), num(c?.score), c?.n ?? '']; }),
      best ? best[0].replace('ref-', '') : '', num(skill(f.mae, best?.[1].mae)), num(skill(f.score, best?.[1].score)), num(skill(f.score, klima?.score))].join(';'));
  }
}
writeFileSync(out, `${rows.join('\n')}\n`);
console.log(`${rows.length - 1} Zeilen → ${out} (Modell ${model}, Quelle ${scoresPath})`);
