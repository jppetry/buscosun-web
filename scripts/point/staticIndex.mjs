/**
 * Was unter `point/static/` wirklich liegt — gezählt, nicht behauptet.
 *
 * `point/static/` steht seit PD-C4 in `TIMELESS_PATHS`, fällt also nicht unter die
 * Aufbewahrung. Bis PD-E war das folgenlos, weil dort nichts lag; seit PD-E liegt die
 * Modellhöhe je Quelle dort — **veröffentlicht und in keinem Register genannt**. Ein
 * Client fand sie nur, wenn er den Pfad im Code kannte. Das ist die Umkehrung von
 * V-SH-11: dort ein Leser ohne Schreiber, hier ein Schreiber ohne Ankündigung.
 *
 * Diese Funktion liest deshalb den DATENTRÄGER, nicht die Absicht des Producers. Ein
 * Produktverzeichnis ohne `static.json` ist kein Produkt und wird übergangen — sonst
 * nennte der Index nach einem abgebrochenen Lauf ein Manifest, das es nicht gibt.
 *
 * Eigenes Modul, weil `publish-point.mjs` beim Import sofort veröffentlicht: eine
 * Funktion, die der Verifier an echten Dateien prüfen soll, darf dort nicht wohnen.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { STATIC_DIR } from '../../src/point/cubeFormat.ts';

/** Unterverzeichnisse, alphabetisch — damit der Index zwischen zwei Läufen nicht ohne Sachgrund wechselt. */
function dirsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function bytesIn(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? bytesIn(p) : statSync(p).size;
  }
  return n;
}

/**
 * Die zeitlosen Produkte unter `<repoRoot>/point/static/<produkt>/<fassung>/`.
 *
 * `repoRoot` ist die Wurzel des Daten-Repos (dieselbe Sicht wie im Publisher, die Pfade
 * tragen also das `point/`-Präfix) — NICHT das `point/`-Verzeichnis selbst. Der
 * Unterschied hat in PD-E schon einmal `point/point/static/` erzeugt.
 */
export function scanStaticProducts(repoRoot) {
  const root = join(repoRoot, STATIC_DIR);
  const out = [];
  for (const product of dirsIn(root)) {
    for (const version of dirsIn(join(root, product))) {
      const rel = `${STATIC_DIR}/${product}/${version}`;
      const manifest = `${rel}/static.json`;
      if (!existsSync(join(repoRoot, manifest))) continue;
      let m;
      try {
        m = JSON.parse(readFileSync(join(repoRoot, manifest), 'utf8'));
      } catch {
        continue; // ein unlesbares Manifest ist kein Produkt — lieber schweigen als lügen
      }
      out.push({
        product: m.product ?? product,
        version: m.version ?? version,
        path: rel,
        manifest,
        kind: m.kind ?? null,
        updatedAt: m.updatedAt ?? null,
        bytes: bytesIn(join(repoRoot, rel)),
        // Die Spalten sind das Interessante: WELCHE Quelle eine Höhe beisteuert, steht
        // sonst nur im Produktmanifest.
        tiers: Object.keys(m.tiers ?? {}).sort().map((id) => ({
          id,
          columns: (m.tiers[id]?.planes ?? []).map((p) => p.id),
          chunks: m.tiers[id]?.chunks ?? null,
          bytes: m.tiers[id]?.bytes ?? null,
        })),
      });
    }
  }
  return out;
}
