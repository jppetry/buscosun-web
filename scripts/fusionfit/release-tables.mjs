/**
 * release-tables.mjs — phase AX, AX-12b (`audit/fusion-ausbau.md` §6g.6): the two client tables of "buscosun Fusion 6" for the data
 * repo, built from the measured fits and validated with the CLIENT's validators (what the browser will accept):
 *   • `fusion.client.json` = `fit\2026-09-30-ax4\fusion.ax4.client.json` (the Fit-5e tables plus the written cloud atoms, E-AX-4/5) —
 *     copied unchanged;
 *   • `stack.client.json` = `fit\2026-09-30-ax5\stack.archive.json` (station value with country parameters, E-AX-7) WITHOUT the
 *     country entries of Td (V-AX-15: at 13 issue days the country Td parameters are worse than the pooled ones, −0,1…−1,0 %,
 *     25–48 h −1,0 %!) — Td falls back to the pooled entries, exactly the measured column `stack`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/release-tables.mjs
 *       [--ax4=<fusion.ax4.client.json>] [--ax5=<stack.archive.json>] [--out=<dir>] [--dropCountry=td]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseArgs } from '../hindcast/lib/common.mjs';
import { validateStackTable } from '../../src/pointForecast/fusion/stationValue.ts';
import { validateTables } from '../../src/point/fusionFit/tables.ts';

const flags = parseArgs(process.argv.slice(2));
const ax4 = typeof flags.ax4 === 'string' ? flags.ax4 : 'C:/dev/buscosun-hindcast/fit/2026-09-30-ax4/fusion.ax4.client.json';
const ax5 = typeof flags.ax5 === 'string' ? flags.ax5 : 'C:/dev/buscosun-hindcast/fit/2026-09-30-ax5/stack.archive.json';
const out = typeof flags.out === 'string' ? flags.out : 'C:/dev/buscosun-hindcast/publish/2026-09-30-ax12';
const drop = new Set((typeof flags.dropCountry === 'string' ? flags.dropCountry : 'td').split(',').filter(Boolean));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const say = (s) => console.log(`[release-tables] ${s}`);
mkdirSync(out, { recursive: true });

// 1 — the learned tables with atoms: copied unchanged, validated as the client validates
{
  const buf = readFileSync(ax4);
  const T = JSON.parse(buf.toString('utf8'));
  const errs = validateTables(T);
  if (errs.length) throw new Error(`${ax4}: ${errs.join('; ')}`);
  const atoms = Object.values(T.atoms ?? {});
  if (!atoms.length) throw new Error(`${ax4}: keine Atome`);
  writeFileSync(join(out, 'fusion.client.json'), buf);
  say(`fusion.client.json: ${T.fitVersion}, mean ${Object.keys(T.mean).length}, atoms ${atoms.length} (${atoms.filter((e) => e.status === 'written').length} written), ${buf.length} B, sha256 ${sha(buf).slice(0, 16)}`);
}

// 2 — the station value with country parameters, Td country entries dropped (V-AX-15)
{
  const T = JSON.parse(readFileSync(ax5, 'utf8'));
  const before = Object.keys(T.entries).length;
  const entries = {};
  let dropped = 0;
  for (const [k, e] of Object.entries(T.entries)) {
    const parts = k.split('|');                // `${v}|${g}|${form}` or `${v}|${g}|${form}|${cc}`
    if (parts.length === 4 && drop.has(parts[0])) { dropped += 1; continue; }
    entries[k] = e;
  }
  const byCC = {};
  for (const k of Object.keys(entries)) { const p = k.split('|'); const cc = p.length === 4 ? p[3] : 'pooled'; byCC[cc] = (byCC[cc] ?? 0) + 1; }
  const table = {
    ...T, entries,
    notes: [...(T.notes ?? []), `AX-12b (2026-09-30, V-AX-15): die Landeseinträge für ${[...drop].join(', ')} sind entfernt — an 13 Ausgabetagen waren sie schlechter als die gepoolten (−0,1…−1,0 %); diese Größen fallen auf die gepoolten Einträge zurück (gemessene Spalte \`stack\`), T/Wind/Böe nehmen den Landeseintrag (gemessene Spalte \`stack-cc\`). Diese Tabelle ist Teil von „buscosun Fusion 6".`],
  };
  const errs = validateStackTable(table);
  if (errs.length) throw new Error(`stack.client.json ungültig: ${errs.join('; ')}`);
  const buf = Buffer.from(JSON.stringify(table));
  writeFileSync(join(out, 'stack.client.json'), buf);
  say(`stack.client.json: ${T.fitVersion}, ${before} → ${Object.keys(entries).length} Einträge (${dropped} ${[...drop].join('/')}-Landeseinträge entfernt; ${Object.entries(byCC).map(([c, n]) => `${c} ${n}`).join(', ')}), ${buf.length} B, sha256 ${sha(buf).slice(0, 16)}`);
}
say(`geschrieben nach ${out}`);
