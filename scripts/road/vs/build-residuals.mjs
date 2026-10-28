#!/usr/bin/env node
/**
 * AW-6.2.4 / 6.2.7 — learns the residual table of the site correction (`road/vs/v1/static/residuals.json`) from the shadow
 * pairs in the archive (`buscosun-archiv/road/vs/v1/<day>/<run>.json.gz`, field `shadow`) — only pairs with a valid GMA value
 * (the derive wrote them only then), only after `VS_RESIDUAL.minDays` days of pairs, without cold-start pairs (`--cold` keeps them).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/vs/build-residuals.mjs \
 *     --archive=<buscosun-archiv>/road/vs/v1 --out=<file> [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--holdout=<station ids, comma>] [--cold]
 * The copy into the data repo is a publish of this line (MANUELLE-SCHRITTE §79). Exit 0 = written, 3 = too few days (named).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { learnResiduals, VS_RESIDUAL } from '../../../src/road/vs/roadVsCouple.ts';

/** All shadow pairs of the archive between two days (inclusive), as the learner wants them. */
export function readShadowPairs(archiveDir, { from = null, to = null, cold = false, holdout = new Set() } = {}) {
  const pairs = [];
  let runs = 0;
  if (!existsSync(archiveDir)) return { pairs, runs };
  for (const day of readdirSync(archiveDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
    if ((from && day < from) || (to && day > to)) continue;
    for (const f of readdirSync(join(archiveDir, day)).filter((x) => /^\d{10}\.json\.gz$/.test(x))) {
      let doc; try { doc = JSON.parse(gunzipSync(readFileSync(join(archiveDir, day, f))).toString('utf8')); } catch { continue; }
      runs++;
      for (const s of doc.shadow ?? []) {
        if (!cold && s.coldStart) continue;
        if (holdout.has(s.id) || !s.cls || !Number.isFinite(s.residualK)) continue;
        pairs.push({ station: s.id, validMs: s.validMs, cls: s.cls, residualK: s.residualK });
      }
    }
  }
  return { pairs, runs };
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  if (!flags.archive || !flags.out) { console.error('--archive=<buscosun-archiv>/road/vs/v1 und --out=<datei> fehlen'); process.exit(2); }
  const holdout = new Set(typeof flags.holdout === 'string' ? flags.holdout.split(',') : []);
  const { pairs, runs } = readShadowPairs(flags.archive, { from: flags.from, to: flags.to, cold: flags.cold === true, holdout });
  const tab = learnResiduals(pairs, new Date().toISOString());
  console.log(`[vs-residuals] ${runs} Läufe, ${pairs.length} Paare, ${tab.window.days} Tage, ${Object.keys(tab.stations).length} Stationen mit Zellen, σ ${JSON.stringify(tab.sigma)}`);
  if (tab.window.days < VS_RESIDUAL.minDays) { console.log(`[vs-residuals] NICHT geschrieben: ${tab.window.days} Tage < ${VS_RESIDUAL.minDays} (Startprompt: frühestens nach 7 Tagen)`); process.exit(3); }
  mkdirSync(dirname(flags.out), { recursive: true });
  writeFileSync(flags.out, JSON.stringify(tab));
  console.log(`[vs-residuals] geschrieben → ${flags.out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
