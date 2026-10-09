/**
 * V-RC-2 — Wächter der Kartenfelder `point/field/v1/` (audit/regenchance.md §10).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/point/field-watch.mjs \
 *        --repo=<Daten-Repo> [--tier=t1|t2|t3]
 *
 * Am 08.10. 10:49 UTC entstand das letzte t2-Feld; danach blieb die Stufe still ohne Feld, bis die Aufbewahrung es
 * entfernte — der Feldschritt läuft mit `continue-on-error`, der Job blieb grün, niemand sah es (bemerkt erst am 09.10.).
 * Dieser Schritt läuft im Punkt-Job NACH dem Publish (der Cube ist dann veröffentlicht) und endet mit Exit 1, wenn die
 * eigene Stufe mehr als `FIELD_WATCH_MAX_MISSED` Cube-Läufe hintereinander ohne Feld hat — der Job wird rot, GitHub
 * meldet es. Mit `POINT_FIELDS=0` ist er still (Felder sind dann absichtlich aus).
 */
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { POINT_DIR } from '../../src/point/cubeFormat.ts';
import { fieldStalenessOfStore, FIELD_WATCH_MAX_MISSED } from './fieldStore.mjs';

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = Object.fromEntries(argv.map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
  if (env.POINT_FIELDS === '0') { console.log('[field-watch] POINT_FIELDS=0 — Kartenfelder absichtlich aus, nichts zu prüfen'); return 0; }
  const pointDir = args.point ? resolve(args.point) : join(resolve(args.repo ?? '.'), POINT_DIR);
  const rows = fieldStalenessOfStore(pointDir, args.tier ? [args.tier] : undefined);
  let bad = 0;
  for (const r of rows) {
    const line = `${r.tier}: jüngster Cube-Lauf ${r.latestCube ?? '–'}, jüngstes Feld ${r.lastField ?? 'keins'}, ${r.missed} Lauf/Läufe ohne Feld${r.missed ? ` (${r.missedRuns.join(', ')})` : ''}`;
    if (r.stale) {
      bad++;
      // Annotation im Lauf (sichtbar in der Actions-Übersicht) + Exit 1.
      console.log(`::error title=Kartenfeld ${r.tier} veraltet (V-RC-2)::${line} — mehr als ${FIELD_WATCH_MAX_MISSED} ausgelassen; Log des Schritts „Build map fields — ${r.tier}" ansehen`);
    } else console.log(`[field-watch] ${line} — in Ordnung`);
  }
  return bad ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
