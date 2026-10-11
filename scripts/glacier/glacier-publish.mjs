#!/usr/bin/env node
/**
 * GL-1 — publisher of the glacier data line into `buscosun-data` (plan §6 "Veröffentlichung"; layout since Jan 11.10.2026:
 * everything below `glacier/v1/`, the refreshed lines on `main`, the heavy static builds on the orphan branch `glacier`):
 *
 *   node scripts/glacier/glacier-publish.mjs --repo=<clone of buscosun-data> --line=static|sat|melt|feed --src=<tree> \
 *        [--index-patch=<json>] [--status-patch=<json>] --message="glacier: …"
 *   node scripts/glacier/glacier-publish.mjs --archive --repo=<clone of buscosun-archiv> --src=<dir of day files> --day=YYYY-MM-DD --message="…"
 *
 * Rules (each one is tested in verify:glacier-publish):
 *  - four workflows (static, sat, melt, feed) share one repo path and one concurrency group; every attempt starts from the CURRENT
 *    `origin/<branch>` (fetch, `checkout -B`, no rebase), replaces ONLY the sub-paths of its own line and re-reads, patches and
 *    rewrites `glacier/v1/index.json` / `status.json` — so a parallel push of another line is never lost;
 *  - the line `static` writes its build to the branch `glacier` (created as an orphan on the first push) FIRST and patches the pointer on `main`
 *    SECOND, so the pointer never names a build that is not there; the branch never carries index/status, `main` never carries `static/`;
 *  - never `--force`, never rewrites history: a rejected push waits, fetches again and repeats (≤ 6 attempts);
 *  - the commit is built with a path argument and checked: nothing outside the own prefixes + index/status;
 *  - ≤ 20 MB per file and ≤ 150 MB per package; the archive (a clone of `buscosun-archiv`) only ever ADDS day files (and rewrites its own `index.json`).
 * `src` mirrors the repo layout below `glacier/v1/` (e.g. `src/static/<build>/catalog.json`). Last stdout line: JSON result.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
export const GLACIER_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const GLACIER_MAX_PACKAGE_BYTES = 150 * 1024 * 1024;
/** Repo-relative root of the line — the same on `main`, on the static branch and in the archive repo (`GLACIER_REPO_DIR` of the contract; verify:glacier-contract compares). */
export const GLACIER_ROOT = 'glacier/v1';
/** Orphan branch of the heavy static builds (`GLACIER_REF_STATIC` of the contract). */
export const GLACIER_STATIC_BRANCH = 'glacier';
/** Sub-paths (below the root) each line may write; `index.json` and `status.json` are always allowed on `main`. */
export const GLACIER_LINES = Object.freeze({
  static: ['static'],
  sat: ['obs', 'season'],
  melt: ['melt'],
  feed: ['feed', 'card'],
});

/** RFC 7396 merge patch: objects merge, `null` deletes, anything else replaces. */
export function mergePatch(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) { if (v === null) delete out[k]; else out[k] = mergePatch(out[k], v); }
  return out;
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base)); else out.push(relative(base, p).split('\\').join('/'));
  }
  return out;
}

/** Guards on the source tree: own prefixes only, size limits. Throws with a reason. */
export function checkPackage(line, srcDir) {
  const prefixes = GLACIER_LINES[line];
  if (!prefixes) throw new Error(`unbekannte Linie: ${line}`);
  const files = existsSync(srcDir) ? walk(srcDir) : [];
  if (!files.length) throw new Error(`${srcDir}: leer`);
  let total = 0;
  for (const f of files) {
    if (!prefixes.some((p) => f === p || f.startsWith(`${p}/`))) throw new Error(`Datei außerhalb der Linie ${line}: ${f}`);
    const size = statSync(join(srcDir, f)).size;
    if (size > GLACIER_MAX_FILE_BYTES) throw new Error(`Datei über 20 MB: ${f} (${(size / 1048576).toFixed(1)} MB)`);
    total += size;
  }
  if (total > GLACIER_MAX_PACKAGE_BYTES) throw new Error(`Paket über 150 MB (${(total / 1048576).toFixed(1)} MB)`);
  return { files, bytes: total };
}

const gitIn = (repoDir, env = null) => (...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...(env ? { env: { ...process.env, ...env } } : {}) }).trim();
const sleepSync = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]);
const readJsonFile = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * Pruning policies of a line (own prefixes only): `{ prefix, keepNewest }` keeps the newest N entries (sorted by name) of the
 * directories directly below `<root>/<prefix>/`; `{ prefix, olderThanMs, stampOf }` removes entries whose stamp is older.
 */
export function pruneList(listDir, policies, nowMs) {
  const out = [];
  for (const pol of policies) {
    const names = listDir(pol.prefix).sort();
    if (pol.keepNewest != null) out.push(...names.slice(0, Math.max(0, names.length - pol.keepNewest)).map((n) => `${pol.prefix}/${n}`));
    if (pol.olderThanMs != null) for (const n of names) { const t = pol.stampOf(n); if (t != null && nowMs - t > pol.olderThanMs) out.push(`${pol.prefix}/${n}`); }
  }
  return out;
}
export const GLACIER_POLICIES = Object.freeze({
  static: [{ prefix: 'static', keepNewest: 2 }],
  sat: [], melt: [], feed: [],
});

/**
 * First commit of an orphan branch WITHOUT touching the work tree, the index or HEAD of the clone: a temporary index, the blobs of `files` (bytes as they are —
 * no line-ending filter), `write-tree`, `commit-tree`, push. (`git checkout --orphan` + `git rm` does not work in a sparse clone: `rm` leaves the entries of
 * the other directories in the index, and they ended up in the first commit.)
 */
function createOrphan({ repoDir, remote, branch, root, srcDir, files, message, tag, log, beforePush, attempt, stage }) {
  const gitDir = gitIn(repoDir)('rev-parse', '--absolute-git-dir');
  const tmpIndex = join(gitDir, `glacier-orphan-index-${process.pid}`);
  rmSync(tmpIndex, { force: true });
  const git = gitIn(repoDir, { GIT_INDEX_FILE: tmpIndex });
  try {
    git('read-tree', '--empty');
    for (const f of files) {
      const blob = gitIn(repoDir)('hash-object', '-w', '--no-filters', '--', join(srcDir, f));
      git('update-index', '--add', '--cacheinfo', `100644,${blob},${root}/${f}`);
    }
    const tree = git('write-tree');
    const commit = git('commit-tree', tree, '-m', message);
    if (beforePush) beforePush(attempt, stage);
    gitIn(repoDir)('push', '--quiet', remote, `${commit}:refs/heads/${branch}`);
    log(`${tag}Zweig ${branch} angelegt ${commit.slice(0, 8)} (${files.length} Dateien)`);
    return { pushed: true, sha: commit, files: files.length, created: true };
  } finally { rmSync(tmpIndex, { force: true }); }
}

/**
 * One push of one branch: every attempt starts from the CURRENT `remote/branch` (an orphan start if `orphanOk` and the branch does
 * not exist yet), copies `files`, prunes, patches the pointers (`pointers`), stages ONLY `root`, checks the staged paths, commits, pushes.
 */
function pushBranch({
  repoDir, remote, branch, orphanOk = false, root, srcDir, files, prefixes, pointers, indexPatch, statusPatch, policies, nowMs, message,
  retries, sleepMs, log, beforePush, tag, stage,
}) {
  const git = gitIn(repoDir);
  const patch = (cur, p) => (typeof p === 'function' ? p(cur) : p ? mergePatch(cur, p) : cur);
  const always = pointers ? [`${root}/index.json`, `${root}/status.json`] : [];
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let exists = true;
      try { git('fetch', '--quiet', '--depth=1', remote, branch); } catch (e) { if (orphanOk && /couldn't find remote ref/.test(String(e.stderr))) exists = false; else throw e; }
      if (!exists) {   // the branch does not exist yet: its first commit is made with plumbing (see createOrphan); an orphan run has no pointers and nothing to prune
        if (!files.length) throw Object.assign(new Error(`Zweig ${branch} fehlt und es gibt nichts anzulegen`), { fatal: true });
        const r = createOrphan({ repoDir, remote, branch, root, srcDir, files, message, tag, log, beforePush, attempt, stage });
        return { ...r, attempts: attempt };
      }
      git('checkout', '--quiet', '-B', branch, 'FETCH_HEAD'); git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      const rootDir = join(repoDir, root);
      // 1. add/replace the files of this line (a changed file under the same name is replaced; nothing else is touched)
      for (const f of files) { const dst = join(rootDir, f); mkdirSync(dirname(dst), { recursive: true }); cpSync(join(srcDir, f), dst); }
      // 2. prune within the own prefixes
      const listDir = (prefix) => (existsSync(join(rootDir, prefix)) ? readdirSync(join(rootDir, prefix)) : []);
      for (const rel of pruneList(listDir, policies, nowMs)) rmSync(join(rootDir, rel), { recursive: true, force: true });
      // 3. index and status: read FRESH from the base of this attempt, patch, write (only where pointers live)
      if (pointers) {
        const idxFile = join(rootDir, 'index.json'), stFile = join(rootDir, 'status.json');
        const idx0 = existsSync(idxFile) ? readJsonFile(idxFile) : { schema: 1, kind: 'glacier/index' };
        const st0 = existsSync(stFile) ? readJsonFile(stFile) : { schema: 1, kind: 'glacier/status' };
        if (indexPatch) { mkdirSync(rootDir, { recursive: true }); writeFileSync(idxFile, JSON.stringify(patch(idx0, indexPatch)) + '\n'); }
        if (statusPatch) { mkdirSync(rootDir, { recursive: true }); writeFileSync(stFile, JSON.stringify(patch(st0, statusPatch)) + '\n'); }
      }
      git('add', '-A', '--', root); // the fresh base had no other change; the outside check below proves nothing but the own line is staged
      const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
      if (!staged.length) { log(`${tag}nichts Neues`); return { pushed: false, unchanged: true, attempts: attempt }; }
      const outside = staged.filter((p) => !always.includes(p) && !prefixes.some((x) => p.startsWith(`${root}/${x}/`)));
      if (outside.length) throw Object.assign(new Error(`Commit enthielte Pfade außerhalb der Linie: ${outside.slice(0, 3).join(' ')}`), { fatal: true });
      git('commit', '--quiet', '-m', message);
      if (beforePush) beforePush(attempt, stage);
      git('push', '--quiet', remote, `HEAD:${branch}`);
      const sha = git('rev-parse', 'HEAD');
      log(`${tag}gepusht ${sha.slice(0, 8)} (Versuch ${attempt}, ${staged.length} Dateien)`);
      return { pushed: true, sha, attempts: attempt, files: staged.length };
    } catch (e) {
      if (e.fatal) throw e;
      const msg = String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?';
      log(`${tag}Versuch ${attempt}: ${msg}`);
      if (attempt < retries) sleepSync(sleepMs(attempt));
    }
  }
  return { pushed: false, failed: true, attempts: retries };
}

/** `beforePush(attempt, stage)` — a test hook between the commit and the push; stage = `line` (sat, melt, feed), `static` (the build on the branch) or `pointer` (index/status on `main`). */
export function publishGlacier({
  repoDir, line, srcDir, indexPatch = null, statusPatch = null, message, remote = 'origin', branch = 'main', staticBranch = GLACIER_STATIC_BRANCH, root = GLACIER_ROOT,
  retries = 6, sleepMs = (a) => 5000 * a, log = () => {}, nowMs = Date.now(), policies = GLACIER_POLICIES[line] ?? [], beforePush = null,
}) {
  const pkg = checkPackage(line, srcDir);
  const prefixes = GLACIER_LINES[line];
  const common = { repoDir, remote, root, retries, sleepMs, log, nowMs, message, beforePush };
  if (line !== 'static') {
    return pushBranch({ ...common, branch, srcDir, files: pkg.files, prefixes, pointers: true, indexPatch, statusPatch, policies, tag: '', stage: 'line' });
  }
  // static: the build to the branch first (orphan on the first push), the pointer to `main` second
  const git = gitIn(repoDir);
  let back = null;
  try { back = git('rev-parse', '--abbrev-ref', 'HEAD').trim(); if (back === 'HEAD' || back === staticBranch) back = null; } catch { back = null; }
  const restore = () => { if (back) { try { git('checkout', '--quiet', back); } catch { /* the work tree stays where it is; the result is unaffected */ } } };
  try {
    const a = pushBranch({ ...common, branch: staticBranch, orphanOk: true, srcDir, files: pkg.files, prefixes, pointers: false, policies, tag: `[${staticBranch}] `, stage: 'static' });
    if (a.failed) return { ...a, stage: 'static' };
    const wantPointer = !!(indexPatch || statusPatch);
    const b = wantPointer
      ? pushBranch({ ...common, branch, srcDir, files: [], prefixes: [], pointers: true, indexPatch, statusPatch, policies: [], message: `${message} (pointer)`, tag: `[${branch}] `, stage: 'pointer' })
      : null;
    if (b?.failed) return { ...b, stage: 'pointer', static: a };
    return {
      pushed: !!(a.pushed || b?.pushed), unchanged: !a.pushed && !b?.pushed,
      attempts: Math.max(a.attempts, b?.attempts ?? 0), files: a.files, sha: b?.sha ?? a.sha, static: a, pointer: b,
    };
  } finally { restore(); }
}

/**
 * Day files in the archive repo (`buscosun-archiv`, branch `main`, below `glacier/v1/<day>/`) — ADD only. A file that exists with other
 * bytes is never replaced (the name carries the run, so a clash is a bug); identical bytes are a no-op. No file is ever deleted; the only
 * file that is rewritten is the line's own `glacier/v1/index.json` (days, file counts, bytes).
 */
export function publishArchive({ repoDir, srcDir, day, message, remote = 'origin', branch = 'main', root = GLACIER_ROOT, retries = 6, sleepMs = (a) => 5000 * a, log = () => {}, beforePush = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Tag ${day}`);
  const files = existsSync(srcDir) ? walk(srcDir) : [];
  if (!files.length) throw new Error(`${srcDir}: leer`);
  let total = 0;
  for (const f of files) { const s = statSync(join(srcDir, f)).size; if (s > GLACIER_MAX_FILE_BYTES) throw new Error(`Datei über 20 MB: ${f}`); total += s; }
  if (total > GLACIER_MAX_PACKAGE_BYTES) throw new Error('Paket über 150 MB');
  const git = gitIn(repoDir);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git('fetch', '--quiet', '--depth=1', remote, branch);
      git('checkout', '--quiet', '-B', branch, 'FETCH_HEAD');
      git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      const dayDir = join(repoDir, root, day);
      let added = 0;
      for (const f of files) {
        const dst = join(dayDir, f);
        const bytes = readFileSync(join(srcDir, f));
        if (existsSync(dst)) {
          if (Buffer.compare(readFileSync(dst), bytes) === 0) continue;
          throw Object.assign(new Error(`Archivdatei existiert mit anderem Inhalt: ${root}/${day}/${f}`), { fatal: true });
        }
        mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, bytes); added++;
      }
      if (!added) return { pushed: false, unchanged: true, attempts: attempt };
      // the archive's own index: per day the number of files and bytes (recounted from the tree, so a heal pass stays right)
      const idxFile = join(repoDir, root, 'index.json');
      const idx = existsSync(idxFile) ? readJsonFile(idxFile) : { schema: 1, kind: 'glacier/archive-index', days: {} };
      const dayFiles = walk(dayDir);
      idx.days[day] = { files: dayFiles.length, bytes: dayFiles.reduce((n, f) => n + statSync(join(dayDir, f)).size, 0) };
      idx.days = Object.fromEntries(Object.entries(idx.days).sort(([a], [b]) => (a < b ? -1 : 1)));
      writeFileSync(idxFile, JSON.stringify(idx, null, 1) + '\n');
      git('add', '-A', '--', root);
      const staged = git('diff', '--cached', '--name-status').split('\n').filter(Boolean);
      if (staged.some((l) => !l.startsWith('A\t') && l !== `M\t${root}/index.json`)) throw Object.assign(new Error('Archiv: nur Hinzufügen erlaubt'), { fatal: true });
      if (staged.some((l) => !new RegExp(`^[AM]\\t${root}/(index\\.json|\\d{4}-\\d{2}-\\d{2}/.+)$`).test(l))) throw Object.assign(new Error('Archiv: Pfad außerhalb von glacier/v1'), { fatal: true });
      git('commit', '--quiet', '-m', message);
      if (beforePush) beforePush(attempt);
      git('push', '--quiet', remote, `HEAD:${branch}`);
      const sha = git('rev-parse', 'HEAD');
      return { pushed: true, sha, attempts: attempt, files: staged.length };
    } catch (e) {
      if (e.fatal) throw e;
      log(`Versuch ${attempt}: ${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?'}`);
      if (attempt < retries) sleepSync(sleepMs(attempt));
    }
  }
  return { pushed: false, failed: true, attempts: retries };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const log = (m) => console.log(`[glacier-publish] ${m}`);
  let res;
  if (args.archive) {
    res = publishArchive({ repoDir: resolve(String(args.repo ?? '.')), srcDir: resolve(String(args.src)), day: String(args.day), message: String(args.message ?? `glacier: archiv ${args.day}`), log });
  } else {
    res = publishGlacier({
      repoDir: resolve(String(args.repo ?? '.')), line: String(args.line), srcDir: resolve(String(args.src)),
      indexPatch: args['index-patch'] ? readJsonFile(resolve(String(args['index-patch']))) : null,
      statusPatch: args['status-patch'] ? readJsonFile(resolve(String(args['status-patch']))) : null,
      message: String(args.message ?? `glacier(${args.line}): ${new Date().toISOString().slice(0, 16)}Z`), log,
    });
  }
  console.log(JSON.stringify(res));
  if (res.failed) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main();
