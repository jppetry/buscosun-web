/**
 * Sitemap-`lastmod` aus Git: Datum des letzten Commits, der eine der Quelldateien
 * einer Seitengruppe berührt hat (`git log -1 --format=%cs -- <dateien>`).
 *
 * Ehrlichkeitsregel: Ohne belastbares Git-Datum gibt es KEIN lastmod. In einem
 * flachen Clone (Netlify, CI) trüge jede Datei das Datum des einzigen Commits —
 * das wäre genau das Build-Datum-Problem, das lastmod wertlos macht. Dann (oder
 * ohne `git`, ohne Repo, bei nicht versionierten Dateien) liefert `gitLastmod`
 * `null`, und die Sitemap lässt das Feld weg.
 */
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

let shallow;
/** `true`, wenn der Verlauf unvollständig ist oder Git nicht antwortet. */
export function historyUnreliable() {
  if (shallow === undefined) {
    try { shallow = git(['rev-parse', '--is-shallow-repository']) !== 'false'; } catch { shallow = true; }
  }
  return shallow;
}

const cache = new Map();
/** Letztes Commit-Datum (YYYY-MM-DD) über alle `files` (relativ zur Repo-Wurzel) oder `null`. */
export function gitLastmod(files) {
  if (historyUnreliable()) return null;
  const key = files.join('|');
  if (!cache.has(key)) {
    let d = null;
    try { d = git(['log', '-1', '--format=%cs', '--', ...files]) || null; } catch { d = null; }
    cache.set(key, d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  }
  return cache.get(key);
}

/** Größtes Datum einer Liste, `null`-Einträge werden übergangen; leer ⇒ `null`. */
export function maxLastmod(dates) {
  return dates.reduce((m, d) => (d && (!m || d > m) ? d : m), null);
}
