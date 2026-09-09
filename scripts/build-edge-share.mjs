/**
 * SH6 — buendelt `src/share/edgeShare.ts` zu `netlify/edge-shared/shareParser.js`.
 *
 * Warum ueberhaupt ein Buendel: siehe Kopfkommentar von `src/share/edgeShare.ts`
 * (Deno verlangt Datei-Endungen an jedem Import; der App-Baum hat keine).
 *
 *   npm run edge:share            schreibt das Artefakt
 *   npm run edge:share -- --check baut nur und vergleicht (Verifier-Modus)
 *
 * esbuild liegt ohnehin im Baum (Vite bringt es mit) — keine neue Abhaengigkeit.
 * Das Ergebnis ist absichtlich NICHT minifiziert: es ist eingecheckter Code, der
 * bei einem Review lesbar sein muss.
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ENTRY = join(ROOT, 'src', 'share', 'edgeShare.ts');
export const OUT = join(ROOT, 'netlify', 'edge-shared', 'shareParser.js');

const BANNER = [
  '// ERZEUGT — NICHT VON HAND AENDERN.',
  '// Quelle: src/share/edgeShare.ts (und der Baum darunter).',
  '// Neu bauen: npm run edge:share · Pruefen: npm run verify:share',
  '// Warum ein Buendel: Deno verlangt Datei-Endungen an jedem Import, der',
  '// App-Baum hat keine. Es ist DERSELBE Parser, nur zusammengezogen.',
].join('\n');

/** Baut das Buendel und liefert den Quelltext (ohne zu schreiben). */
export async function buildEdgeShare() {
  const res = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    banner: { js: BANNER },
    write: false,
    logLevel: 'silent',
  });
  return res.outputFiles[0].text;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const code = await buildEdgeShare();
  const check = process.argv.includes('--check');
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
  if (check) {
    if (current === code) {
      console.log(`edge-share: aktuell (${(code.length / 1024).toFixed(1)} KB)`);
      process.exit(0);
    }
    console.error('edge-share: VERALTET — `npm run edge:share` ausfuehren und mit einchecken.');
    process.exit(1);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, code, 'utf8');
  console.log(`edge-share: geschrieben (${(code.length / 1024).toFixed(1)} KB) -> ${OUT}`);
}
