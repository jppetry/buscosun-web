#!/usr/bin/env node
/**
 * Publish the atmo store into `buscosun-data` (`atmo/v1`) the way `sea-publish.mjs` does: every attempt starts from the
 * CURRENT `origin/main` (fetch, `checkout -B` onto it — no rebase, so a force-pushed fresh history of the map/point
 * lines is no obstacle), replaces `atmo/v1` with the WHOLE store (heals a lost publish), commits only the path `atmo`,
 * pushes without force. Rejected ⇒ wait, fetch again, repeat (≤ 6).
 *
 *   node scripts/atmo/atmo-publish.mjs --repo=<sparse clone of buscosun-data> --store=<atmo/v1 store> --message="atmo: …"
 * Exit 0 with `{"pushed":true|false,…}` on the last line; exit 1 when every attempt failed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

export function publishAtmo({ repoDir, storeDir, message, remote = 'origin', branch = 'main', retries = 6, sleepMs = (a) => 5000 * a, log = () => {} }) {
  const git = (...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).trim();
  if (!existsSync(join(storeDir, 'index.json'))) throw new Error(`${storeDir}: kein index.json — kein Atmo-Speicher`);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git('fetch', '--quiet', '--depth=1', remote, branch);
      git('checkout', '--quiet', '-B', branch, 'FETCH_HEAD');
      if (git('status', '--porcelain', '--', '.')) git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      const dst = join(repoDir, 'atmo', 'v1');
      rmSync(dst, { recursive: true, force: true });
      mkdirSync(dst, { recursive: true });
      cpSync(storeDir, dst, { recursive: true, filter: (src) => !/[\\/]\.build([\\/]|$)/.test(src) && !/\.tmp$/.test(src) });
      git('add', '-A', '--', 'atmo');
      const staged = git('diff', '--cached', '--name-only');
      if (!staged) { log('nichts Neues'); return { pushed: false, unchanged: true, attempts: attempt }; }
      const outside = staged.split('\n').filter((p) => p && !p.startsWith('atmo/'));
      if (outside.length) throw new Error(`Commit enthielte Pfade außerhalb atmo/: ${outside.slice(0, 3).join(' ')}`);
      git('commit', '--quiet', '-m', message);
      git('push', '--quiet', remote, `HEAD:${branch}`);
      const sha = git('rev-parse', 'HEAD');
      log(`gepusht ${sha.slice(0, 8)} (Versuch ${attempt}, ${staged.split('\n').length} Dateien)`);
      return { pushed: true, sha, attempts: attempt, files: staged.split('\n').length };
    } catch (e) {
      const msg = String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?';
      log(`Versuch ${attempt}: ${msg}`);
      if (/außerhalb atmo/.test(msg)) throw e;
      if (attempt < retries) execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${sleepMs(attempt)})`]);
    }
  }
  return { pushed: false, failed: true, attempts: retries };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const res = publishAtmo({
    repoDir: resolve(String(args.repo ?? '.')), storeDir: resolve(String(args.store ?? 'atmo-store')),
    message: String(args.message ?? `atmo: ${new Date().toISOString().slice(0, 16)}Z`), log: (m) => console.log(`[atmo-publish] ${m}`),
  });
  console.log(JSON.stringify(res));
  if (res.failed) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main();
