#!/usr/bin/env node
/**
 * ruc-publish.mjs — publishes the `ruc/v1` store to `buscosun-data` (phase RUC, T3), after the pattern of
 * `precipsum-publish.mjs`: every attempt starts from the CURRENT `origin/main` (fetch, `checkout -B` — no rebase; the
 * force pushes of the map and point lines are no obstacle), replaces `ruc/v1` by the store (without `.build`), commits
 * only the path `ruc`, pushes without force. Rejected ⇒ wait, fetch again, retry (≤ 6).
 *
 * After the push the CDN is brought to the new state (never fatal): purge `ruc/v1/latest.json` under `@main` until it
 * carries the pushed run, then warm every new file of the run (chunks, run.json, station series) so the first reader
 * does not pay the cold edge. `RUC_CDN_SYNC=0` skips that step.
 *
 *   node scripts/ruc/ruc-publish.mjs --repo=<sparse clone of buscosun-data> --store=<ruc/v1 store> --message="…" [--run=YYYYMMDDHH]
 * Last line JSON `{"pushed":true|false,…}`; exit 1 only when every attempt failed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CDN_BASE } from '../../src/point/manifest.ts';
import { RUC_DIR, rucLatestPath } from '../../src/point/rucFormat.ts';
import { warmCdnFiles, purgeUntilFresh, purgeUrlOf } from '../lib/repackManifest.mjs';

const SELF = fileURLToPath(import.meta.url);
export const RUC_REPO_PATH = RUC_DIR.split('/')[0];
export const RUC_CDN_BUDGET_S = 60;
const CDN_FETCH_TIMEOUT_MS = 15_000;

export function publishRuc({ repoDir, storeDir, message, remote = 'origin', branch = 'main', retries = 6, sleepMs = (a) => 5000 * a, log = () => {}, git: gitImpl = null }) {
  const git = gitImpl ?? ((...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  if (!existsSync(join(storeDir, 'latest.json'))) throw new Error(`${storeDir}: kein latest.json — kein ruc-Speicher`);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git('fetch', '--quiet', '--depth=1', remote, branch);
      git('checkout', '--quiet', '-B', branch, 'FETCH_HEAD');
      if (git('status', '--porcelain', '--', '.')) git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      const dst = join(repoDir, RUC_DIR);
      rmSync(dst, { recursive: true, force: true });
      mkdirSync(dst, { recursive: true });
      cpSync(storeDir, dst, { recursive: true, filter: (src) => !/\.tmp(-\d+)?$/.test(src) && !src.split(sep).includes('.build') });
      git('add', '-A', '--', RUC_REPO_PATH);
      const nameStatus = git('diff', '--cached', '--name-status');
      if (!nameStatus) { log('nichts Neues'); return { pushed: false, unchanged: true, attempts: attempt }; }
      const staged = nameStatus.split('\n').filter(Boolean).map((l) => { const [status, ...rest] = l.split('\t'); return { status: status[0], path: rest[rest.length - 1] }; });
      const outside = staged.filter((s) => !s.path.startsWith(`${RUC_REPO_PATH}/`)).map((s) => s.path);
      if (outside.length) throw new Error(`Commit enthielte Pfade außerhalb ${RUC_REPO_PATH}/: ${outside.slice(0, 3).join(' ')}`);
      git('commit', '--quiet', '-m', message);
      git('push', '--quiet', remote, `HEAD:${branch}`);
      const sha = git('rev-parse', 'HEAD');
      log(`gepusht ${sha.slice(0, 8)} (Versuch ${attempt}, ${staged.length} Dateien)`);
      return { pushed: true, sha, attempts: attempt, files: staged.length, staged };
    } catch (e) {
      const msg = String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?';
      log(`Versuch ${attempt}: ${msg}`);
      if (/außerhalb ruc/.test(String(e.message))) throw e;
      if (attempt < retries) { const ms = sleepMs(attempt); if (ms > 0) execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]); }
    }
  }
  return { pushed: false, failed: true, attempts: retries };
}

/** Pure plan from the staged list (`git diff --cached --name-status`): purge the mutable pointer, warm the immutable new files. */
export function planRucCdn(staged, { base = CDN_BASE } = {}) {
  const main = (p) => `${base}@main/${p}`;
  const latest = rucLatestPath();
  const purge = [], warm = [];
  for (const { status, path } of staged) {
    if (status === 'D' || !path.startsWith(`${RUC_DIR}/`)) continue;
    if (path === latest) { purge.push(main(path)); continue; }
    warm.push(main(path));
  }
  return { purge, warm };
}

/** Executes the plan; never throws. `run` = the pushed run, checked in `latest.json` after the purge. */
export async function syncRucCdn({ staged, run, base = CDN_BASE, fetchImpl = fetch, sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, budgetS = RUC_CDN_BUDGET_S, dryRun = false, warm = true }) {
  const t0 = Date.now();
  const budgetMs = budgetS * 1000;
  const left = () => budgetMs - (Date.now() - t0);
  const plan = planRucCdn(staged, { base });
  const report = { budgetS, purge: plan.purge.length, latest: null, warm: null, ms: 0 };
  try {
    log(`CDN: ${plan.purge.length} Purge, ${plan.warm.length} Datei(en) zu wärmen, Budget ${budgetS} s${dryRun ? ' — TROCKENLAUF' : ''}`);
    for (const url of plan.purge) {
      const r = await purgeUntilFresh({
        url, attempts: left() > 40_000 ? 2 : 1, waitMs: 10_000, firstWaitMs: 0, fetchImpl, sleepImpl, dryRun, timeoutMs: CDN_FETCH_TIMEOUT_MS,
        check: async (res) => {
          if (!res.ok) return { fresh: false, seen: `HTTP ${res.status}` };
          const j = await res.json().catch(() => null);
          return { fresh: j?.run === run, seen: `@main Lauf ${j?.run ?? '—'}` };
        },
        log: (m) => log(`  latest.json: ${m}`),
      });
      report.latest = { fresh: !!r.fresh, attempts: r.attempts ?? 0 };
    }
    if (report.latest == null) report.latest = { fresh: false, attempts: 0, note: 'latest.json nicht im Commit' };
    if (warm && plan.warm.length && left() > CDN_FETCH_TIMEOUT_MS) {
      report.warm = await warmCdnFiles(plan.warm, { concurrency: 8, timeoutMs: CDN_FETCH_TIMEOUT_MS, retries: 1, backoffMs: 2_000, fetchImpl, sleepImpl, deadlineMs: Math.max(0, left()), purgeOn404: !dryRun, log });
      const s = report.warm;
      log(`CDN-Warm-up: ${s.ok}/${s.total} ok (${s.hit} HIT, ${s.miss} MISS) · 403 ${s.forbidden} · Frist ${s.timeout} · 404 ${s.notFound}`);
    }
  } catch (e) {
    log(`CDN: ${String(e.message ?? e)} — nicht fatal`);
    if (report.latest == null) report.latest = { fresh: false, attempts: 0, error: String(e.message ?? e) };
  }
  report.ms = Date.now() - t0;
  return report;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const storeDir = resolve(String(args.store ?? 'ruc-store'));
  const log = (m) => console.log(`[ruc-publish] ${m}`);
  const res = publishRuc({
    repoDir: resolve(String(args.repo ?? '.')), storeDir,
    message: String(args.message ?? `ruc: ${new Date().toISOString().slice(0, 16)}Z`), log,
  });
  if (res.pushed && process.env.RUC_CDN_SYNC !== '0') {
    const run = args.run ? String(args.run) : (JSON.parse(readFileSync(join(storeDir, 'latest.json'), 'utf8')).run ?? null);
    res.cdn = await syncRucCdn({ staged: res.staged, run, log, dryRun: process.env.RUC_CDN_DRY === '1' });
  }
  console.log(JSON.stringify(res));
  if (res.failed) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main().catch((e) => { console.error(e); process.exit(1); });
