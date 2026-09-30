/**
 * clientTables.mjs — the client version of the learned tables (FL-AP5, E-FL-1; slimmed in FL-AP8c, V-FL-28): form K
 * only, written strata only, per entry only what `predict.ts` reads. `names` stays (`validateTables` checks
 * beta.length === names.length), the `anchor` block stays (FL-AP8b reads the persistence curve); the climatology and
 * ρ_f are dropped — the client reads neither (`cubeSource.ts` takes its climatology from `ClimaField`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/lib/clientTables.mjs
 *       --in=<fit>\fusion.hindcast.json [--out=<fit>\fusion.client.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { validateTables } from '../../../src/point/fusionFit/tables.ts';

/** Entry fields the client never reads. */
export const CLIENT_DROP = Object.freeze(['folds', 'cv', 'prior', 'jitter', 'scaleCv', 'ln', 'llPerRow', 'iterations', 'msr']);

export function clientTables(tables) {
  const drop = new Set(CLIENT_DROP);
  const pickK = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, e]) => k.startsWith('K|') && e.status === 'written').map(([k, e]) => [k, Object.fromEntries(Object.entries(e).filter(([f]) => !drop.has(f)))]));
  // phase FX-4: the estimated-μ_c block of a `--climaMu` fit is scorer evidence, never the client's (it reads the product); a fit without it stays byte-identical
  const { climaMu: _climaMu, ...rest } = tables;
  return {
    ...rest,
    mean: pickK(tables.mean), variance: pickK(tables.variance), occurrence: pickK(tables.occurrence), amount: pickK(tables.amount), speed: pickK(tables.speed),
    // phase AX, AX-4: the cloud atoms travel with the client table (written entries only; a fit without them carries no section)
    ...(tables.atoms ? { atoms: pickK(tables.atoms) } : {}),
    clima: null, rhoForecast: null,
    notes: [...tables.notes, 'Client-Fassung (V-FL-28): nur Form K, geschriebene Strata, je Eintrag ohne Falten-β/CV/Prior/Jitter/Skalen- und LN-Belege; ohne Klimatologie und ρ_f (der Client liest sie nicht); anchor-Block für die Anker-Kurve (FL-AP8b)'],
  };
}

export function clientTablesReport(client) {
  const s = JSON.stringify(client);
  return { mean: Object.keys(client.mean).length, variance: Object.keys(client.variance).length, speed: Object.keys(client.speed).length, occurrence: Object.keys(client.occurrence).length, atoms: Object.keys(client.atoms ?? {}).length, kb: Math.round(s.length / 1024), gzKb: Math.round(gzipSync(s).length / 1024 * 10) / 10 };
}

if (process.argv[1] && /clientTables\.mjs$/.test(process.argv[1])) {
  const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; }));
  if (!flags.in) throw new Error('--in fehlt');
  const tables = JSON.parse(readFileSync(flags.in, 'utf8'));
  const client = clientTables(tables);
  const errs = validateTables(client);
  if (errs.length) throw new Error(`Client-Tabellen ungültig: ${errs.join('; ')}`);
  const out = flags.out || join(dirname(flags.in), 'fusion.client.json');
  writeFileSync(out, JSON.stringify(client));
  console.log(`[clientTables] ${out}: ${JSON.stringify(clientTablesReport(client))}`);
}
