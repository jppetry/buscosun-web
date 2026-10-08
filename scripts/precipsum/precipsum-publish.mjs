#!/usr/bin/env node
/**
 * Phase NS, Stufe B2/B3 — veröffentlicht den Speicher der gemessenen Summen nach `buscosun-data/precipsum/v1`, nach dem
 * Muster von `sea-publish.mjs`: jeder Versuch baut auf dem AKTUELLEN `origin/main` auf (fetch, `checkout -B` — kein Rebase,
 * Force-Pushes der Karten- und Punktlinie sind kein Hindernis), ersetzt `precipsum/v1` durch den ganzen Speicher, committet
 * nur den Pfad `precipsum`, pusht ohne Force. Abgewiesen ⇒ warten, neu holen, wiederholen (≤ 6).
 *
 *   node scripts/precipsum/precipsum-publish.mjs --repo=<sparse clone of buscosun-data> --store=<precipsum/v1 store> --message="…"
 * Letzte Zeile JSON `{"pushed":true|false,…}`; Exit 1 nur, wenn jeder Versuch scheiterte.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
export const PRECIPSUM_REPO_PATH = 'precipsum';

export function publishPrecipSum({ repoDir, storeDir, message, remote = 'origin', branch = 'main', retries = 6, sleepMs = (a) => 5000 * a, log = () => {}, git: gitImpl = null }) {
  const git = gitImpl ?? ((...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  if (!existsSync(join(storeDir, 'latest.json'))) throw new Error(`${storeDir}: kein latest.json — kein Summen-Speicher`);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git('fetch', '--quiet', '--depth=1', remote, branch);
      git('checkout', '--quiet', '-B', branch, 'FETCH_HEAD');
      if (git('status', '--porcelain', '--', '.')) git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      const dst = join(repoDir, PRECIPSUM_REPO_PATH, 'v1');
      rmSync(dst, { recursive: true, force: true });
      mkdirSync(dst, { recursive: true });
      cpSync(storeDir, dst, { recursive: true, filter: (src) => !/\.tmp(-\d+)?$/.test(src) });
      git('add', '-A', '--', PRECIPSUM_REPO_PATH);
      const staged = git('diff', '--cached', '--name-only');
      if (!staged) { log('nichts Neues'); return { pushed: false, unchanged: true, attempts: attempt }; }
      const outside = staged.split('\n').filter((p) => p && !p.startsWith(`${PRECIPSUM_REPO_PATH}/`));
      if (outside.length) throw new Error(`Commit enthielte Pfade außerhalb ${PRECIPSUM_REPO_PATH}/: ${outside.slice(0, 3).join(' ')}`);
      git('commit', '--quiet', '-m', message);
      git('push', '--quiet', remote, `HEAD:${branch}`);
      const sha = git('rev-parse', 'HEAD');
      log(`gepusht ${sha.slice(0, 8)} (Versuch ${attempt}, ${staged.split('\n').length} Dateien)`);
      return { pushed: true, sha, attempts: attempt, files: staged.split('\n').length };
    } catch (e) {
      const msg = String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?';
      log(`Versuch ${attempt}: ${msg}`);
      if (/außerhalb precipsum/.test(msg)) throw e;
      if (attempt < retries) execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${sleepMs(attempt)})`]);
    }
  }
  return { pushed: false, failed: true, attempts: retries };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const res = publishPrecipSum({
    repoDir: resolve(String(args.repo ?? '.')), storeDir: resolve(String(args.store ?? 'precipsum-store')),
    message: String(args.message ?? `precipsum: ${new Date().toISOString().slice(0, 16)}Z`), log: (m) => console.log(`[precipsum-publish] ${m}`),
  });
  console.log(JSON.stringify(res));
  if (res.failed) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main();
