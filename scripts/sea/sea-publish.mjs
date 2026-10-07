#!/usr/bin/env node
/**
 * SW-2/SW-3 — publish the sea store into `buscosun-data` (`sea/v1`), the way the road line heals force-pushes: every
 * attempt starts from the CURRENT `origin/main` (fetch, `checkout -B` onto it — no rebase, so a force-pushed fresh
 * history of the map/point lines is no obstacle), replaces `sea/v1` with the WHOLE store, commits only the path
 * `sea`, and pushes without force. Rejected ⇒ wait, fetch again, repeat (≤ 6). Nothing else of the repo is touched:
 * the checkout is sparse (`sea` only) and the commit is built with a path argument (lesson 04.10., §14.5 AW).
 *
 *   node scripts/sea/sea-publish.mjs --repo=<sparse clone of buscosun-data> --store=<sea/v1 store> --message="sea: …"
 * Exit 0 with `{"pushed":true|false,…}` on the last line; exit 1 when every attempt failed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

/** Keys of status.json that change on every pass without new content. */
export const SEA_STATUS_VOLATILE = Object.freeze(['updatedAt', 'job', 'textPass']);
function statusOnlyVolatile(git, path) {
  try {
    const strip = (s) => { const o = JSON.parse(s); for (const k of SEA_STATUS_VOLATILE) delete o[k]; return JSON.stringify(o); };
    return strip(git('show', `FETCH_HEAD:${path}`)) === strip(git('show', `:${path}`));
  } catch { return false; }
}

export function publishSea({ repoDir, storeDir, message, remote = 'origin', branch = 'main', retries = 6, sleepMs = (a) => 5000 * a, log = () => {}, git: gitImpl = null }) {
  const git = gitImpl ?? ((...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  if (!existsSync(join(storeDir, 'status.json'))) throw new Error(`${storeDir}: kein status.json — kein Sea-Speicher`);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git('fetch', '--quiet', '--depth=1', remote, branch);
      git('checkout', '--quiet', '-B', branch, 'FETCH_HEAD');
      // A clean index on the fresh base (never carry a stale index into the commit).
      const dirty = git('status', '--porcelain', '--', '.');
      if (dirty) git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      const dst = join(repoDir, 'sea', 'v1');
      rmSync(dst, { recursive: true, force: true });
      mkdirSync(dst, { recursive: true });
      cpSync(storeDir, dst, { recursive: true, filter: (src) => !/\.tmp-\d+$/.test(src) });
      git('add', '-A', '--', 'sea');
      const staged = git('diff', '--cached', '--name-only');
      if (!staged) { log('nichts Neues'); return { pushed: false, unchanged: true, attempts: attempt }; }
      // Every 15-min pass rewrites status.json (timestamps of the pass). Only that ⇒ no commit (no churn in the repo).
      if (staged === 'sea/v1/status.json' && statusOnlyVolatile(git, 'sea/v1/status.json')) {
        git('reset', '--quiet', '--hard', 'FETCH_HEAD');
        log('nur Zeitstempel im Status — kein Commit');
        return { pushed: false, unchanged: true, statusOnly: true, attempts: attempt };
      }
      const outside = staged.split('\n').filter((p) => p && !p.startsWith('sea/'));
      if (outside.length) throw new Error(`Commit enthielte Pfade außerhalb sea/: ${outside.slice(0, 3).join(' ')}`);
      git('commit', '--quiet', '-m', message);
      git('push', '--quiet', remote, `HEAD:${branch}`);
      const sha = git('rev-parse', 'HEAD');
      log(`gepusht ${sha.slice(0, 8)} (Versuch ${attempt}, ${staged.split('\n').length} Dateien)`);
      return { pushed: true, sha, attempts: attempt, files: staged.split('\n').length };
    } catch (e) {
      const msg = String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?';
      log(`Versuch ${attempt}: ${msg}`);
      if (/außerhalb sea/.test(msg)) throw e;
      if (attempt < retries) execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${sleepMs(attempt)})`]);
    }
  }
  return { pushed: false, failed: true, attempts: retries };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const res = publishSea({
    repoDir: resolve(String(args.repo ?? '.')), storeDir: resolve(String(args.store ?? 'sea-store')),
    message: String(args.message ?? `sea: ${new Date().toISOString().slice(0, 16)}Z`), log: (m) => console.log(`[sea-publish] ${m}`),
  });
  console.log(JSON.stringify(res));
  if (res.failed) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main();
