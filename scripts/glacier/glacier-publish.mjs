#!/usr/bin/env node
/**
 * GL-1 — publisher of the glacier data line into `buscosun-glacier` (plan §6 "Veröffentlichung"):
 *
 *   node scripts/glacier/glacier-publish.mjs --repo=<clone of buscosun-glacier> --line=static|sat|melt|feed --src=<tree> \
 *        [--index-patch=<json>] [--status-patch=<json>] --message="glacier: …"
 *   node scripts/glacier/glacier-publish.mjs --archive --repo=<clone> --src=<dir of day files> --day=YYYY-MM-DD --message="…"
 *
 * Rules (each one is tested in verify:glacier-publish):
 *  - three workflows (static, sat, melt) share one repo and one concurrency group; every attempt starts from the CURRENT
 *    `origin/main` (fetch, `checkout -B`, no rebase), replaces ONLY the sub-paths of its own line and re-reads, patches and
 *    rewrites `v1/index.json` / `v1/status.json` — so a parallel push of another line is never lost;
 *  - never `--force`, never rewrites history: a rejected push waits, fetches again and repeats (≤ 6 attempts);
 *  - the commit is built with a path argument and checked: nothing outside the own prefixes + index/status;
 *  - ≤ 20 MB per file and ≤ 150 MB per package; the archive branch only ever ADDS day files.
 * `src` mirrors the repo layout below `v1/` (e.g. `src/static/<build>/catalog.json`). Last stdout line: JSON result.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
export const GLACIER_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const GLACIER_MAX_PACKAGE_BYTES = 150 * 1024 * 1024;
/** Sub-paths (below `v1/`) each line may write; `index.json` and `status.json` are always allowed. */
export const GLACIER_LINES = Object.freeze({
  static: ['static'],
  sat: ['obs', 'season'],
  melt: ['melt'],
  feed: ['feed', 'card'],
});
const ALWAYS = ['v1/index.json', 'v1/status.json'];

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

const gitIn = (repoDir) => (...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
const sleepSync = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]);
const readJsonFile = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * Pruning policies of a line (own prefixes only): `{ prefix, keepNewest }` keeps the newest N entries (sorted by name) of the
 * directories directly below `v1/<prefix>/`; `{ prefix, olderThanMs, stampOf }` removes entries whose stamp is older.
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

export function publishGlacier({
  repoDir, line, srcDir, indexPatch = null, statusPatch = null, message, remote = 'origin', branch = 'main', retries = 6,
  sleepMs = (a) => 5000 * a, log = () => {}, nowMs = Date.now(), policies = GLACIER_POLICIES[line] ?? [], beforePush = null,
}) {
  const pkg = checkPackage(line, srcDir);
  const git = gitIn(repoDir);
  const prefixes = GLACIER_LINES[line];
  const patch = (cur, p) => (typeof p === 'function' ? p(cur) : p ? mergePatch(cur, p) : cur);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git('fetch', '--quiet', '--depth=1', remote, branch);
      git('checkout', '--quiet', '-B', branch, 'FETCH_HEAD');
      git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      const v1 = join(repoDir, 'v1');
      // 1. add/replace the files of this line (a changed file under the same name is replaced; nothing else is touched)
      for (const f of pkg.files) { const dst = join(v1, f); mkdirSync(dirname(dst), { recursive: true }); cpSync(join(srcDir, f), dst); }
      // 2. prune within the own prefixes
      const listDir = (prefix) => (existsSync(join(v1, prefix)) ? readdirSync(join(v1, prefix)) : []);
      for (const rel of pruneList(listDir, policies, nowMs)) rmSync(join(v1, rel), { recursive: true, force: true });
      // 3. index and status: read FRESH from the base of this attempt, patch, write
      const idxFile = join(v1, 'index.json'), stFile = join(v1, 'status.json');
      const idx0 = existsSync(idxFile) ? readJsonFile(idxFile) : { schema: 1, kind: 'glacier/index' };
      const st0 = existsSync(stFile) ? readJsonFile(stFile) : { schema: 1, kind: 'glacier/status' };
      const idx = patch(idx0, indexPatch), st = patch(st0, statusPatch);
      if (idxFile && indexPatch) writeFileSync(idxFile, JSON.stringify(idx) + '\n');
      if (statusPatch) writeFileSync(stFile, JSON.stringify(st) + '\n');
      git('add', '-A', '--', 'v1'); // the fresh base had no other change; the outside check below proves nothing but the own line is staged
      const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
      if (!staged.length) { log('nichts Neues'); return { pushed: false, unchanged: true, attempts: attempt }; }
      const outside = staged.filter((p) => !ALWAYS.includes(p) && !prefixes.some((x) => p.startsWith(`v1/${x}/`)));
      if (outside.length) throw Object.assign(new Error(`Commit enthielte Pfade außerhalb der Linie ${line}: ${outside.slice(0, 3).join(' ')}`), { fatal: true });
      git('commit', '--quiet', '-m', message);
      if (beforePush) beforePush(attempt);
      git('push', '--quiet', remote, `HEAD:${branch}`);
      const sha = git('rev-parse', 'HEAD');
      log(`gepusht ${sha.slice(0, 8)} (Versuch ${attempt}, ${staged.length} Dateien)`);
      return { pushed: true, sha, attempts: attempt, files: staged.length };
    } catch (e) {
      if (e.fatal) throw e;
      const msg = String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?';
      log(`Versuch ${attempt}: ${msg}`);
      if (attempt < retries) sleepSync(sleepMs(attempt));
    }
  }
  return { pushed: false, failed: true, attempts: retries };
}

/**
 * Day files on the orphan branch `archive` — ADD only. A file that exists with other bytes is never replaced (the name carries
 * the run, so a clash is a bug); identical bytes are a no-op. No file is ever deleted.
 */
export function publishArchive({ repoDir, srcDir, day, message, remote = 'origin', branch = 'archive', retries = 6, sleepMs = (a) => 5000 * a, log = () => {}, beforePush = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Tag ${day}`);
  const files = existsSync(srcDir) ? walk(srcDir) : [];
  if (!files.length) throw new Error(`${srcDir}: leer`);
  let total = 0;
  for (const f of files) { const s = statSync(join(srcDir, f)).size; if (s > GLACIER_MAX_FILE_BYTES) throw new Error(`Datei über 20 MB: ${f}`); total += s; }
  if (total > GLACIER_MAX_PACKAGE_BYTES) throw new Error('Paket über 150 MB');
  const git = gitIn(repoDir);
  // a developer's clone must not stay on the archive branch (the next line would then find no `v1/` at all): remember where we were and go back
  let back = null;
  try { back = git('rev-parse', '--abbrev-ref', 'HEAD').trim(); if (back === 'HEAD' || back === branch) back = null; } catch { back = null; }
  const restore = () => { if (back) { try { git('checkout', '--quiet', back); } catch { /* the work tree stays where it is; the result below is unaffected */ } } };
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let exists = true;
      try { git('fetch', '--quiet', '--depth=1', remote, branch); } catch (e) { if (/couldn't find remote ref/.test(String(e.stderr))) exists = false; else throw e; }
      if (exists) { git('checkout', '--quiet', '-B', branch, 'FETCH_HEAD'); git('reset', '--quiet', '--hard', 'FETCH_HEAD'); }
      else { git('checkout', '--quiet', '--orphan', branch); try { git('rm', '-rf', '--quiet', '.'); } catch { /* empty tree */ } }
      let added = 0;
      for (const f of files) {
        const dst = join(repoDir, 'day', day, f);
        const bytes = readFileSync(join(srcDir, f));
        if (existsSync(dst)) {
          if (Buffer.compare(readFileSync(dst), bytes) === 0) continue;
          throw Object.assign(new Error(`Archivdatei existiert mit anderem Inhalt: day/${day}/${f}`), { fatal: true });
        }
        mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, bytes); added++;
      }
      if (!added) { restore(); return { pushed: false, unchanged: true, attempts: attempt }; }
      git('add', '-A', '--', 'day');
      const staged = git('diff', '--cached', '--name-status').split('\n').filter(Boolean);
      if (staged.some((l) => !l.startsWith('A\t'))) throw Object.assign(new Error('Archiv: nur Hinzufügen erlaubt'), { fatal: true });
      git('commit', '--quiet', '-m', message);
      if (beforePush) beforePush(attempt);
      git('push', '--quiet', remote, `HEAD:${branch}`);
      const sha = git('rev-parse', 'HEAD');
      restore();
      return { pushed: true, sha, attempts: attempt, files: staged.length };
    } catch (e) {
      if (e.fatal) { restore(); throw e; }
      log(`Versuch ${attempt}: ${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?'}`);
      if (attempt < retries) sleepSync(sleepMs(attempt));
    }
  }
  restore();
  return { pushed: false, failed: true, attempts: retries };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const log = (m) => console.log(`[glacier-publish] ${m}`);
  let res;
  if (args.archive) {
    res = publishArchive({ repoDir: resolve(String(args.repo ?? '.')), srcDir: resolve(String(args.src)), day: String(args.day), message: String(args.message ?? `archive: ${args.day}`), log });
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
