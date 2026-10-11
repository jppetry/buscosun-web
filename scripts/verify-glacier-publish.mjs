/**
 * verify:glacier-publish — Phase GL (audit/gletscher.md §GL-1): the publisher of the glacier line against REAL bare git remotes.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-publish.mjs
 *
 * No network: a bare repository in the temp dir plays `buscosun-data`, a second one `buscosun-archiv`, clones play the workflow runners.
 * Layout (Jan 11.10.2026): everything below `glacier/v1/`; `main` carries the refreshed lines, the orphan branch `glacier` the heavy static builds.
 * What is proven:
 *   P1 first push (static to the orphan branch, pointer to main), P2 two lines coexist (index re-read), P3 a rejected pointer push heals on a
 *   fresh base without losing the other line, P4 prune keeps the newest two builds on the branch and nothing of another line, P5/P6 guards
 *   (prefix, 20 MB), P7 no-op, P8 never forces, P9 archive adds only (own repo, own index), P10 merge patch, P11 CLI, P12 kill switch survives,
 *   P13 a runner-like sparse clone, P14 the pointer never names a build that is not on the branch.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishGlacier, publishArchive, mergePatch, checkPackage, GLACIER_MAX_FILE_BYTES, GLACIER_ROOT, GLACIER_STATIC_BRANCH } from './glacier/glacier-publish.mjs';
import { gunzipSync } from 'node:zlib';
import * as C from '../src/glacier/glacierContract.ts';
import { archiveMelt, runDay } from './glacier/glacier-archive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const checks = [];
const add = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); };
const tmp = mkdtempSync(join(tmpdir(), 'glacier-pub-'));
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const cfg = (dir) => { sh(dir, 'config', 'user.email', 't@example.com'); sh(dir, 'config', 'user.name', 'test'); sh(dir, 'config', 'commit.gpgsign', 'false'); };
const R = GLACIER_ROOT;            // glacier/v1
const BR = GLACIER_STATIC_BRANCH;  // glacier

// --- a data remote with an initial commit (README + files of other lines, which must stay untouched) ---------------------------
const remote = join(tmp, 'remote.git');
sh(tmp, 'init', '--bare', '-b', 'main', remote);
const seed = join(tmp, 'seed');
sh(tmp, 'clone', '-q', remote, seed); cfg(seed);
writeFileSync(join(seed, 'README.md'), '# buscosun-data\n');
mkdirSync(join(seed, 'sea', 'v1'), { recursive: true }); writeFileSync(join(seed, 'sea', 'v1', 'status.json'), '{"sea":1}');
sh(seed, 'add', '-A'); sh(seed, 'commit', '-q', '-m', 'init'); sh(seed, 'push', '-q', 'origin', 'HEAD:main');
const clone = (n, url = remote) => { const d = join(tmp, n); sh(tmp, 'clone', '-q', '--depth=1', `file://${url}`, d); cfg(d); return d; };
const W = (root, files) => { for (const [p, c] of Object.entries(files)) { const f = join(root, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, typeof c === 'string' ? c : JSON.stringify(c)); } return root; };
const src = (n, files) => W(join(tmp, `src-${n}`), files);
const fetchSeed = () => { sh(seed, 'fetch', '-q', 'origin'); };
const remoteFile = (path, branch = 'main') => { fetchSeed(); try { return sh(seed, 'show', `origin/${branch}:${path}`); } catch { return null; } };
const remoteList = (prefix, branch = 'main') => { fetchSeed(); try { return sh(seed, 'ls-tree', '-r', '--name-only', `origin/${branch}`, '--', prefix).split('\n').filter(Boolean); } catch { return []; } };
const head = (branch = 'main') => { fetchSeed(); try { return sh(seed, 'rev-parse', `origin/${branch}`); } catch { return null; } };
const fast = { sleepMs: () => 0 };
const idxOf = () => JSON.parse(remoteFile(`${R}/index.json`) ?? 'null');

// C0 the publisher's constants are the contract's ---------------------------------------------------------------------------
add('C0 Pfad und Zweig des Publishers sind die des Vertrags (GLACIER_REPO_DIR, GLACIER_REF_STATIC), die Linien ein Daten-Repo ohne eigenes Repo', R === C.GLACIER_REPO_DIR && BR === C.GLACIER_REF_STATIC && C.GLACIER_REPO === 'jppetry/buscosun-data', `${R} ${BR} ${C.GLACIER_REPO}`);

// P1 first push -------------------------------------------------------------------------------------------------------------
const A = clone('runner-static');
const s1 = src('static1', { 'static/20261011-1/catalog.json': { schema: 1, kind: 'glacier/catalog', build: '20261011-1', glaciers: [] }, 'static/20261011-1/points.json': { rows: [] } });
const r1 = publishGlacier({ repoDir: A, line: 'static', srcDir: s1, message: 'glacier(static): 20261011-1', indexPatch: { schema: 1, kind: 'glacier/index', builtAt: '2026-10-11T12:00:00Z', static: { build: '20261011-1' } }, statusPatch: { schema: 1, kind: 'glacier/status', lines: { static: { build: '20261011-1', glaciers: 2203 } } }, ...fast });
const idx1 = idxOf();
add('P1 erster Push: der Build steht auf dem neu angelegten verwaisten Zweig `glacier`, Zeiger (index.json) und Status auf `main`; `main` trägt kein static/, der Zweig keine index.json, README und fremde Linien bleiben',
  r1.pushed && idx1?.static?.build === '20261011-1' && !!remoteFile(`${R}/static/20261011-1/catalog.json`, BR) && remoteList(`${R}/static`, 'main').length === 0
  && remoteFile(`${R}/index.json`, BR) === null && !!remoteFile('README.md') && !!remoteFile('sea/v1/status.json') && JSON.parse(remoteFile(`${R}/status.json`)).lines.static.glaciers === 2203
  && sh(seed, 'rev-list', '--max-parents=0', `origin/${BR}`) !== sh(seed, 'rev-list', '--max-parents=0', 'origin/main'), JSON.stringify({ r1: { pushed: r1.pushed, st: r1.static?.pushed, ptr: r1.pointer?.pushed } }));
add('P1b Der Klon steht nach dem Lauf wieder auf `main` (nicht auf dem verwaisten Zweig, auf dem die Linien fehlen)', sh(A, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main', sh(A, 'rev-parse', '--abbrev-ref', 'HEAD'));

// P2 two lines coexist --------------------------------------------------------------------------------------------------------
const B = clone('runner-sat');
const sSat = src('sat1', { 'obs/2026/32TPT/2026-10-10.json': { scene: 'S2B_32TPT_20261010' } });
const r2 = publishGlacier({ repoDir: B, line: 'sat', srcDir: sSat, message: 'glacier(sat): 32TPT 2026-10-10', indexPatch: { sat: { tiles: { '32TPT': { date: '2026-10-10' } } } }, statusPatch: { lines: { sat: { at: '2026-10-11T13:00:00Z' } } }, ...fast });
const idx2 = idxOf();
add('P2 zweite Linie (sat) auf `main`: index.json trägt BEIDE Zeiger (static und sat), status.json beide Linien, die Build-Dateien auf dem Zweig sind unverändert',
  r2.pushed && idx2.static.build === '20261011-1' && idx2.sat.tiles['32TPT'].date === '2026-10-10' && JSON.parse(remoteFile(`${R}/status.json`)).lines.static && JSON.parse(remoteFile(`${R}/status.json`)).lines.sat && !!remoteFile(`${R}/static/20261011-1/catalog.json`, BR) && !!remoteFile(`${R}/obs/2026/32TPT/2026-10-10.json`), JSON.stringify(idx2));

// P3 rejected pointer push heals ------------------------------------------------------------------------------------------------
{
  const s2 = src('static2', { 'static/20261011-2/catalog.json': { build: '20261011-2' } });
  const Cc = clone('runner-sat-race');
  let raced = false;
  const stages = [];
  const r = publishGlacier({
    repoDir: A, line: 'static', srcDir: s2, message: 'glacier(static): 20261011-2',
    indexPatch: { builtAt: '2026-10-11T14:00:00Z', static: { build: '20261011-2' } },
    beforePush: (attempt, stage) => {
      stages.push(`${stage}#${attempt}`);
      if (stage === 'pointer' && attempt === 1 && !raced) {      // between the commit and the push of the pointer another line publishes
        raced = true;
        publishGlacier({ repoDir: Cc, line: 'sat', srcDir: src('sat2', { 'obs/2026/32TPT/2026-10-11.json': { scene: 'x' } }), message: 'glacier(sat): race', indexPatch: { sat: { tiles: { '32TPT': { date: '2026-10-11' } } } }, ...fast });
      }
    }, ...fast,
  });
  const idx = idxOf();
  const raceSha = sh(seed, 'log', 'origin/main', '--format=%H %s').split('\n').find((l) => /race/.test(l))?.split(' ')[0];
  const linear = raceSha && sh(seed, 'merge-base', '--is-ancestor', raceSha, 'origin/main') === '';
  add('P3 abgelehnter Zeiger-Push (eine andere Linie war dazwischen): neuer Versuch auf frischer Basis, index.json trägt static 20261011-2 UND den Stand von sat, Verlauf linear, kein Force; der Build wurde nicht ein zweites Mal gepusht',
    r.pushed && r.pointer.attempts === 2 && r.static.attempts === 1 && idx.static.build === '20261011-2' && idx.sat.tiles['32TPT'].date === '2026-10-11' && linear && stages.join() === 'static#1,pointer#1,pointer#2', JSON.stringify({ stages, r: { s: r.static.attempts, p: r.pointer.attempts }, sat: idx.sat }));
  const stale = mergePatch({ static: { build: '20261011-1' } }, { static: { build: '20261011-2' } });
  add('P3b Gegenprobe: ein Schreiben ohne frisches Lesen (nur der Zeiger der eigenen Linie) hätte den Zeiger der anderen Linie verloren', stale.sat === undefined && idx.sat !== undefined, '');
}

// P4 prune on the branch ----------------------------------------------------------------------------------------------------------
{
  const s3 = src('static3', { 'static/20261011-3/catalog.json': { build: '20261011-3' } });
  const r = publishGlacier({ repoDir: A, line: 'static', srcDir: s3, message: 'glacier(static): 20261011-3', indexPatch: { static: { build: '20261011-3' } }, ...fast });
  const builds = [...new Set(remoteList(`${R}/static`, BR).map((p) => p.split('/')[3]))].sort();
  add('P4 Aufräumen auf dem Zweig: nur die zwei neuesten Builds bleiben (20261011-2, -3), die sat-Dateien auf `main` sind unberührt',
    r.pushed && JSON.stringify(builds) === JSON.stringify(['20261011-2', '20261011-3']) && remoteList(`${R}/obs`).length === 2 && idxOf().static.build === '20261011-3', JSON.stringify(builds));
}

// P5/P6 guards -------------------------------------------------------------------------------------------------------------------------
{
  const before = head();
  let e5 = null, e6 = null, e6b = null;
  try { publishGlacier({ repoDir: B, line: 'sat', srcDir: src('bad1', { 'static/oops.json': { x: 1 } }), message: 'x', ...fast }); } catch (e) { e5 = e.message; }
  try { publishGlacier({ repoDir: B, line: 'sat', srcDir: (() => { const d = src('big', {}); mkdirSync(join(d, 'obs'), { recursive: true }); writeFileSync(join(d, 'obs', 'big.json'), Buffer.alloc(GLACIER_MAX_FILE_BYTES + 1, 0x20)); return d; })(), message: 'x', ...fast }); } catch (e) { e6 = e.message; }
  try { checkPackage('nope', src('nl', { 'a.json': {} })); } catch (e) { e6b = e.message; }
  add('P5 Pfadwächter: eine Datei außerhalb der Präfixe der Linie (static/ in der sat-Linie) bricht ab, der Remote bleibt unverändert', /außerhalb der Linie sat/.test(e5 ?? '') && head() === before, e5);
  add('P6 Größenwächter: eine Datei über 20 MB bricht ab; eine unbekannte Linie ebenso', /über 20 MB/.test(e6 ?? '') && /unbekannte Linie/.test(e6b ?? '') && head() === before, `${e6} | ${e6b}`);
}

// P7 no-op / P8 never force ---------------------------------------------------------------------------------------------------------------
{
  const same = publishGlacier({ repoDir: A, line: 'static', srcDir: src('static3b', { 'static/20261011-3/catalog.json': { build: '20261011-3' } }), message: 'again', indexPatch: { static: { build: '20261011-3' } }, ...fast });
  add('P7 identischer Inhalt: kein Commit („nichts Neues“), weder auf dem Zweig noch auf `main`', same.unchanged === true && same.pushed === false, JSON.stringify({ u: same.unchanged, p: same.pushed }));
  const D = clone('runner-hostile');
  const before = head();
  let n = 0;
  const r = publishGlacier({
    repoDir: D, line: 'melt', srcDir: src('melt1', { 'melt/2026101112.json': { run: '2026101112' } }), message: 'glacier(melt): hostile', retries: 3, ...fast,
    beforePush: () => { n++; const X = clone(`hostile-${n}`); publishGlacier({ repoDir: X, line: 'sat', srcDir: src(`hs${n}`, { [`obs/2026/h/${n}.json`]: { n } }), message: `interloper ${n}`, ...fast }); },
  });
  fetchSeed();
  const log = sh(seed, 'log', 'origin/main', '--format=%s').split('\n');
  add('P8 nie Force: wird jeder Versuch überholt, endet der Lauf rot (failed, 3 Versuche) — die überholenden Commits bleiben im Verlauf, nichts wird überschrieben', r.failed === true && r.attempts === 3 && log.filter((s) => /^interloper/.test(s)).length === 3 && log.includes('glacier(static): 20261011-3 (pointer)') && !log.includes('glacier(melt): hostile') && head() !== before, JSON.stringify(r));
}

// P14 the pointer never names a missing build ----------------------------------------------------------------------------------------------------
{
  const E = clone('runner-ptr');
  const s6 = src('static6', { 'static/20261011-6/catalog.json': { build: '20261011-6' } });
  const before = idxOf().static.build;
  let n = 0;
  const r = publishGlacier({
    repoDir: E, line: 'static', srcDir: s6, message: 'glacier(static): 6', indexPatch: { static: { build: '20261011-6' } }, retries: 2, ...fast,
    beforePush: (a, stage) => { if (stage === 'pointer') { n++; const X = clone(`ptr-hostile-${n}`); publishGlacier({ repoDir: X, line: 'sat', srcDir: src(`ph${n}`, { [`obs/2026/p/${n}.json`]: { n } }), message: `ptr-interloper ${n}`, ...fast }); } },
  });
  const built = remoteList(`${R}/static`, BR).map((p) => p.split('/')[3]);
  add('P14 Reihenfolge: ist der Zeiger-Push nicht durchzubringen, bleibt der Zeiger auf dem alten Build (der noch da ist), der neue Build liegt schon auf dem Zweig, das Ergebnis ist `failed` mit `stage: pointer` — der Zeiger nennt nie einen Build, den es nicht gibt',
    r.failed === true && r.stage === 'pointer' && idxOf().static.build === before && built.includes(before) && built.includes('20261011-6'), JSON.stringify({ r: { f: r.failed, stage: r.stage }, before, built: [...new Set(built)] }));
  // heal: the next run finds the build on the branch ("nichts Neues") and sets the pointer
  const heal = publishGlacier({ repoDir: E, line: 'static', srcDir: s6, message: 'glacier(static): 6 heal', indexPatch: { static: { build: '20261011-6' } }, ...fast });
  add('P14b Heilung: der nächste Lauf findet den Build auf dem Zweig (nichts Neues) und setzt nur den Zeiger', heal.pushed === true && heal.static.unchanged === true && heal.pointer.pushed === true && idxOf().static.build === '20261011-6', JSON.stringify({ s: heal.static.unchanged, p: heal.pointer.pushed }));
}

// P9 archive (an archive repo of its own) ------------------------------------------------------------------------------------------------------------------
{
  const aRemote = join(tmp, 'archiv.git');
  sh(tmp, 'init', '--bare', '-b', 'main', aRemote);
  const aSeed = join(tmp, 'aseed');
  sh(tmp, 'clone', '-q', aRemote, aSeed); cfg(aSeed);
  mkdirSync(join(aSeed, 'sea', 'v1', '2026-10-08'), { recursive: true }); writeFileSync(join(aSeed, 'sea', 'v1', '2026-10-08', 'text.json.gz'), 'x');
  sh(aSeed, 'add', '-A'); sh(aSeed, 'commit', '-q', '-m', 'init'); sh(aSeed, 'push', '-q', 'origin', 'HEAD:main');
  const Ec = clone('runner-archive', aRemote);
  const a1 = publishArchive({ repoDir: Ec, srcDir: src('arch1', { 'melt-2026101112.json.gz': 'run1' }), day: '2026-10-11', message: 'glacier: archiv 2026-10-11', ...fast });
  const a2 = publishArchive({ repoDir: Ec, srcDir: src('arch2', { 'melt-2026101118.json.gz': 'run2' }), day: '2026-10-11', message: 'glacier: archiv 2026-10-11 b', ...fast });
  const a3 = publishArchive({ repoDir: Ec, srcDir: src('arch3', { 'melt-2026101118.json.gz': 'run2' }), day: '2026-10-11', message: 'again', ...fast });
  const a4 = publishArchive({ repoDir: Ec, srcDir: src('arch5', { 'melt-2026101200.json.gz': 'run3' }), day: '2026-10-12', message: 'glacier: archiv 2026-10-12', ...fast });
  let clash = null;
  try { publishArchive({ repoDir: Ec, srcDir: src('arch4', { 'melt-2026101118.json.gz': 'run99' }), day: '2026-10-11', message: 'clash', ...fast }); } catch (e) { clash = e.message; }
  sh(seed, 'fetch', '-q', aRemote, '+refs/heads/main:refs/remotes/archiv/main');
  const tree = sh(seed, 'ls-tree', '-r', '--name-only', 'archiv/main').split('\n');
  const aIdx = JSON.parse(sh(seed, 'show', `archiv/main:${R}/index.json`));
  const deleted = sh(seed, 'log', 'archiv/main', '--diff-filter=D', '--name-only', '--format=').trim();
  add('P9 Archiv-Repo: Tagesdateien unter glacier/v1/<Tag>/ werden nur HINZUGEFÜGT; identische Wiederholung = nichts Neues; gleicher Name mit anderem Inhalt bricht ab; fremde Linien (sea/) unberührt; eigener Index zählt Dateien und Bytes je Tag; nichts wurde gelöscht',
    a1.pushed && a2.pushed && a3.unchanged && a4.pushed && /anderem Inhalt/.test(clash ?? '') && tree.includes(`${R}/2026-10-11/melt-2026101112.json.gz`) && tree.includes(`${R}/2026-10-12/melt-2026101200.json.gz`)
    && tree.includes('sea/v1/2026-10-08/text.json.gz') && aIdx.days['2026-10-11'].files === 2 && aIdx.days['2026-10-12'].files === 1 && aIdx.days['2026-10-11'].bytes === 8 && deleted === '', JSON.stringify({ tree, aIdx: aIdx.days, clash }));
  add('P9b Der Archiv-Klon bleibt auf `main` (auch nach dem Abbruch beim Namenskonflikt)', sh(Ec, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main', '');
}

// P10 merge patch ---------------------------------------------------------------------------------------------------------------------------------------
{
  const m = mergePatch({ a: { b: 1, c: 2 }, l: [1, 2], keep: true }, { a: { b: null, d: 3 }, l: [9] });
  add('P10 Merge-Patch: verschachtelte Objekte verschmelzen, null löscht, Listen ersetzen', m.a.b === undefined && m.a.c === 2 && m.a.d === 3 && JSON.stringify(m.l) === '[9]' && m.keep === true, JSON.stringify(m));
}

// P11 CLI -------------------------------------------------------------------------------------------------------------------------------------------------
{
  const F = clone('runner-cli');
  const s = src('cli', { 'static/20261011-7/catalog.json': { build: '20261011-7' } });
  writeFileSync(join(tmp, 'ip.json'), JSON.stringify({ static: { build: '20261011-7' } }));
  const p = spawnSync(process.execPath, [join(HERE, 'glacier', 'glacier-publish.mjs'), `--repo=${F}`, '--line=static', `--src=${s}`, `--index-patch=${join(tmp, 'ip.json')}`, '--message=glacier(static): cli'], { encoding: 'utf8' });
  const last = JSON.parse(p.stdout.trim().split('\n').pop());
  add('P11 Kommandozeile: Exit 0, letzte Zeile ist das Ergebnis als JSON, der Zeiger steht im Remote', p.status === 0 && last.pushed === true && idxOf().static.build === '20261011-7', p.stdout.trim().split('\n').pop().slice(0, 120));
  const bad = spawnSync(process.execPath, [join(HERE, 'glacier', 'glacier-publish.mjs'), `--repo=${F}`, '--line=sat', `--src=${s}`], { encoding: 'utf8' });
  add('P11b Kommandozeile: Wächterfehler ⇒ Exit ≠ 0 (der Workflow wird rot)', bad.status !== 0, (bad.stderr.split('\n').find((l) => /Error|außerhalb/.test(l)) ?? '').slice(0, 100));
}

// P12 kill switch survives ---------------------------------------------------------------------------------------------------------------------------------
{
  const G = clone('runner-kill');
  const kill = JSON.parse(remoteFile(`${R}/status.json`));
  writeFileSync(join(G, R, 'status.json'), JSON.stringify({ ...kill, killed: true, killReason: 'Test' }));
  sh(G, 'add', '-A'); sh(G, 'commit', '-q', '-m', 'kill'); sh(G, 'push', '-q', 'origin', 'HEAD:main');
  publishGlacier({ repoDir: A, line: 'static', srcDir: src('static5', { 'static/20261011-8/catalog.json': { build: '20261011-8' } }), message: 'glacier(static): 8', indexPatch: { static: { build: '20261011-8' } }, statusPatch: { lines: { static: { build: '20261011-8' } } }, ...fast });
  const st = JSON.parse(remoteFile(`${R}/status.json`));
  add('P12 Kill-Schalter im Status bleibt bei einem Linien-Lauf erhalten (nur `lines` wird gepatcht)', st.killed === true && st.killReason === 'Test' && st.lines.static.build === '20261011-8', JSON.stringify(st).slice(0, 160));
}

// P13 a runner-like sparse clone (actions/checkout with sparse-checkout: glacier) -----------------------------------------------------------------------------------
{
  const S = join(tmp, 'runner-sparse');
  sh(tmp, 'clone', '-q', '--depth=1', '--no-checkout', `file://${remote}`, S); cfg(S);
  sh(S, 'sparse-checkout', 'set', 'glacier'); sh(S, 'checkout', '-q', 'main');
  const onlyGlacier = !existsSync(join(S, 'sea'));            // cone mode keeps the files of the root (README.md), never the other directories
  const r = publishGlacier({ repoDir: S, line: 'static', srcDir: src('static9', { 'static/20261011-9/catalog.json': { build: '20261011-9' } }), message: 'glacier(static): 9', indexPatch: { static: { build: '20261011-9' } }, ...fast });
  const r2b = publishGlacier({ repoDir: S, line: 'feed', srcDir: src('feed1', { 'feed/2026-W41.json': { week: '2026-W41' } }), message: 'glacier(feed): W41', indexPatch: { feed: { week: '2026-W41' } }, ...fast });
  const idx = idxOf();
  add('P13 Klon wie auf dem Runner (flach, sparse `glacier`): Zweigwechsel, Build auf dem Zweig, Zeiger und Feed auf `main`, README und fremde Linien im Remote unberührt, der Klon endet auf `main`',
    onlyGlacier && r.pushed && r2b.pushed && idx.static.build === '20261011-9' && idx.feed.week === '2026-W41' && !!remoteFile('README.md') && !!remoteFile('sea/v1/status.json') && sh(S, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main', JSON.stringify({ onlyGlacier, r: r.pushed, f: r2b.pushed }));
}

// A: the archive script (lead rows of every melt run, `glacier-archive.mjs`) -----------------------------------------------------------------------------------------------
{
  const meltDir = join(tmp, 'melt-store'), outDir = join(tmp, 'archive-out'), archDir = join(tmp, 'archive-held');
  const row = (id) => ({ id, idx: [[1, 2, 3]], ix7: [1, 2, 3] });
  const doc = (run, ids) => ({ schema: 1, kind: 'glacier/melt', run, runAt: '2026-10-11T15:24:13.117Z', origin: 'model', engine: { name: 'buscosun Fusion 12', version: 12, stageCurrent: true }, cube: { t1: 'a', t2: 'b', t3: 'c', stations: 'd' }, gate: { unit: false, reason: 'x' }, glaciers: ids.map(row), skipped: [] });
  W(meltDir, { '2026101115.json': doc('2026101115', ['gl_ch_alpha', 'gl_ch_beta', 'gl_at_gamma']), '2026101203.json': doc('2026101203', ['gl_ch_alpha', 'gl_ch_beta']), 'state.json': { kind: 'glacier/melt-state' } });
  W(join(tmp, 'cat'), { 'catalog.json': { glaciers: [{ id: 'gl_ch_alpha', lead: true }, { id: 'gl_at_gamma', lead: true }, { id: 'gl_ch_beta' }] } });
  W(archDir, { '2026-10-11/melt-2026101115.json.gz': 'held' });
  const a = archiveMelt({ meltDir, catalogFile: join(tmp, 'cat', 'catalog.json'), archiveDir: archDir, outDir });
  const f = join(outDir, '2026-10-12', 'melt-2026101203.json.gz');
  const d = existsSync(f) ? JSON.parse(gunzipSync(readFileSync(f)).toString('utf8')) : null;
  let empty = null;
  try { W(join(tmp, 'cat2'), { 'catalog.json': { glaciers: [{ id: 'x' }] } }); archiveMelt({ meltDir, catalogFile: join(tmp, 'cat2', 'catalog.json'), archiveDir: archDir, outDir: join(tmp, 'o2') }); } catch (e) { empty = e.message; }
  add('A1 Archiv-Skript: schreibt je Lauf, den das Archiv noch nicht hält, nur die Leitgletscher-Zeilen nach <Tag>/melt-<Lauf>.json.gz (Tag = UTC-Tag des Laufs), lässt gehaltene Läufe und state.json aus, Katalog ohne Leitgletscher bricht ab statt leer abzulegen',
    a.runs === 2 && a.held === 1 && JSON.stringify(a.written) === '["2026101203"]' && d?.kind === 'glacier/melt-lead' && JSON.stringify(d.glaciers.map((g) => g.id)) === '["gl_ch_alpha"]' && !existsSync(join(outDir, '2026-10-11')) && runDay('2026101203') === '2026-10-12' && /ohne Leitgletscher/.test(empty ?? ''), JSON.stringify({ a, empty }));
}

// P15: the FIRST push of the branch from a sparse runner clone (orphan creation by plumbing): the branch holds ONLY the build, nothing of `main`
{
  const rem2 = join(tmp, 'remote2.git');
  sh(tmp, 'init', '--bare', '-b', 'main', rem2);
  const sd2 = join(tmp, 'seed2');
  sh(tmp, 'clone', '-q', rem2, sd2); cfg(sd2);
  writeFileSync(join(sd2, 'README.md'), '# data\n');
  mkdirSync(join(sd2, 'obs', 'v1'), { recursive: true }); writeFileSync(join(sd2, 'obs', 'v1', 'latest.json'), '{"obs":1}\n');
  mkdirSync(join(sd2, 'glacier', 'v1'), { recursive: true }); writeFileSync(join(sd2, 'glacier', 'v1', 'keep.json'), '{"x":1}\n');
  sh(sd2, 'add', '-A'); sh(sd2, 'commit', '-q', '-m', 'init'); sh(sd2, 'push', '-q', 'origin', 'HEAD:main');
  const S2 = join(tmp, 'runner-sparse2');
  sh(tmp, 'clone', '-q', '--depth=1', '--no-checkout', `file://${rem2}`, S2); cfg(S2);
  sh(S2, 'sparse-checkout', 'set', 'glacier'); sh(S2, 'checkout', '-q', 'main');
  writeFileSync(join(S2, 'local-untracked.txt'), 'dev file\n');                    // an untracked file of a developer clone must survive
  const body = '{"build":"20261011-1"}\r\n{"crlf":1}\n';                            // CRLF inside: the bytes must come out as they went in
  const mk = () => src('orphan1', { 'static/20261011-1/catalog.json': body, 'static/20261011-1/outline/ch-west-L1.json': { a: 1 } });
  const r = publishGlacier({ repoDir: S2, line: 'static', srcDir: mk(), message: 'glacier(static): first', indexPatch: { static: { build: '20261011-1' } }, ...fast });
  sh(seed, 'fetch', '-q', rem2, '+refs/heads/*:refs/remotes/r2/*');
  const names = sh(seed, 'ls-tree', '-r', '--name-only', 'r2/glacier').split('\n');
  const exact = sh(seed, 'cat-file', '-p', `r2/glacier:${R}/static/20261011-1/catalog.json`) === body.trim();
  const mainFiles = sh(seed, 'ls-tree', '-r', '--name-only', 'r2/main').split('\n');
  add('P15 erster Push des Zweigs aus einem sparse Klon: der Zweig hat NUR die Dateien des Builds (README, obs/ und glacier/v1/keep.json von `main` sind nicht dabei), die Bytes sind unverändert (kein Zeilenenden-Filter), der Klon bleibt auf `main`, README und eine untracked Datei bleiben, `main` trägt nur den Zeiger',
    r.pushed && r.static.created === true && JSON.stringify(names) === JSON.stringify([`${R}/static/20261011-1/catalog.json`, `${R}/static/20261011-1/outline/ch-west-L1.json`]) && exact
    && sh(S2, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main' && existsSync(join(S2, 'local-untracked.txt')) && existsSync(join(S2, 'README.md')) && !mainFiles.some((p) => p.includes('/static/')) && mainFiles.includes(`${R}/index.json`) && mainFiles.includes(`${R}/keep.json`) && mainFiles.includes('README.md'),
    JSON.stringify({ names, exact, mainFiles }));
  // a second run finds the branch and takes the normal path (nothing new)
  const again = publishGlacier({ repoDir: S2, line: 'static', srcDir: mk(), message: 'glacier(static): again', indexPatch: { static: { build: '20261011-1' } }, ...fast });
  add('P15b zweiter Lauf: der Zweig ist da, nichts Neues auf dem Zweig und am Zeiger', again.unchanged === true && again.static.unchanged === true, JSON.stringify({ u: again.unchanged }));
}

// W: the workflow templates (the data repos carry copies; GitHub itself is not available here) ---------------------------------------------------------------------------
{
  const names = ['static', 'sat', 'melt', 'feed'];
  const yml = Object.fromEntries([...names, 'archiv'].map((n) => [n, readFileSync(join(HERE, 'glacier', `workflow-glacier-${n}.yml`), 'utf8')]));
  const ok = (f) => names.every((n) => f(yml[n], n));
  add('W1 die vier Vorlagen im Daten-Repo teilen die Concurrency-Gruppe `glacier-publish` ohne Abbruch laufender Läufe; der Archiv-Workflow hat seine eigene', ok((y) => /concurrency:\s*\n\s*group: glacier-publish\s*\n\s*cancel-in-progress: false/.test(y)) && /group: glacier-archiv\s*\n\s*cancel-in-progress: false/.test(yml.archiv));
  add('W2 Producer-Wächter: Standard `feat/gletscher` über die Repo-Variable GLACIER_PRODUCER_REF, `git ls-remote --exit-code --heads`, „producer not on <ref> yet“ und Ende grün (exit 0), Zweig ohne Rebase geklont — in allen fünf',
    [...names, 'archiv'].every((n) => { const y = yml[n]; return /GLACIER_PRODUCER_REF: \$\{\{ vars\.GLACIER_PRODUCER_REF \|\| 'feat\/gletscher' \}\}/.test(y) && /git ls-remote --exit-code --heads https:\/\/github\.com\/jppetry\/buscosun-web\.git "\$REF"/.test(y) && /producer not on \$REF yet/.test(y) && /ready=0" >> "\$GITHUB_OUTPUT"; exit 0/.test(y) && /--branch "\$REF"/.test(y); }));
  add('W3 keine Zugangsdaten: kein `secrets.` und keine Tokens in den Vorlagen; Schreibrecht nur bei den Linien, die veröffentlichen (sat, melt, feed, archiv), static liest nur',
    [...names, 'archiv'].every((n) => !/secrets\./.test(yml[n]) && !/token/i.test(yml[n])) && /permissions:\s*\n\s*contents: read/.test(yml.static) && ['sat', 'melt', 'feed', 'archiv'].every((n) => /permissions:\s*\n\s*contents: write/.test(yml[n])));
  add('W4 jede Veröffentlichung läuft über glacier-publish.mjs (nie ein handgeschriebenes git push); sat, melt, feed mit --line, das Archiv mit --archive',
    ![...names, 'archiv'].some((n) => /git push/.test(yml[n])) && /glacier-publish\.mjs --repo=data --line=sat/.test(yml.sat) && /glacier-publish\.mjs --repo=data --line=melt/.test(yml.melt) && /glacier-publish\.mjs --repo=data --line=feed/.test(yml.feed) && /glacier-publish\.mjs --archive --repo=archiv/.test(yml.archiv));
  const cron = (y) => (/- cron: '([^']+)'/.exec(y) ?? [])[1];
  const crons = [...names, 'archiv'].map((n) => cron(yml[n]));
  const fieldsOk = crons.every((c) => c && c.split(' ').length === 5);
  const minutes = crons.map((c) => c.split(' ')[0]);
  add('W5 Zeitpläne: je ein gültiger Cron mit fünf Feldern, die Minuten unterscheiden sich (kein gleichzeitiger Start), Timeout ≤ 45 min', fieldsOk && new Set(minutes).size === 5 && [...names, 'archiv'].every((n) => Number(/timeout-minutes: (\d+)/.exec(yml[n])?.[1]) <= 45), crons.join(' | '));
  add('W6 melt: climaGrid im Sparse-Checkout (V-SW-18) und ein Kill-Schalter-Schritt vor dem Rechnen; sat und feed ebenso; der Feed ruft die Wochenkarte nur mit --week=previous und lässt bei fehlendem Browser den Feed unberührt',
    /public\/climaGrid\.json/.test(yml.melt) && /--week=previous \|\| echo/.test(yml.feed) && ['sat', 'melt', 'feed'].every((n) => /Kill switch/.test(yml[n])));
  add('W7 Producer-Dateien, die die Vorlagen prüfen, existieren im Repo', ['scripts/verify-glacier-static.mjs', 'scripts/verify-glacier-contract.mjs', 'src/glacier/glacierContract.ts', 'scripts/glacier/glacier-publish.mjs', 'scripts/glacier/glacier-archive.mjs', 'scripts/glacier/sat-scan.mjs', 'scripts/glacier/melt.mjs', 'scripts/glacier/feed.mjs', 'scripts/glacier/weekly-card.mjs'].every((f) => existsSync(join(HERE, '..', f))), '');
  add('W8 Daten-Layout in den Vorlagen = Vertrag: die Linien lesen `glacier/v1` aus dem Daten-Repo `main` und den Build des Zeigers vom Zweig `glacier` (sparse, nur dieser Build), lesen über EINE zusammengesetzte Sicht (`view/glacier/v1`), schreiben nie in die Sicht',
    ['static', 'sat', 'melt', 'feed'].every((n) => /sparse-checkout: glacier/.test(yml[n]) && /--branch glacier https:\/\/github\.com\/jppetry\/buscosun-data\.git static-branch/.test(yml[n]) && /\/glacier\/v1\/static\/\$BUILD\//.test(yml[n]) && /--data=\.\.\/view\/glacier\/v1|--dir=\.\.\/view\/glacier\/v1/.test(yml[n]) && /--repo=data/.test(yml[n]) === (n !== 'static')));
  add('W10 melt: die zwei npm-Pakete der Cube-Kette (bz2, jsfive) werden im Arbeitsverzeichnis installiert, bevor `melt.mjs` läuft — der erste Lauf auf GitHub endete „grün“ ohne Ergebnis, weil `bz2` fehlte und `tee` den Absturz verdeckte (V-GL-24)',
    /npm install --no-save --no-audit --no-fund --no-package-lock bz2@1 jsfive@0\.4/.test(yml.melt) && yml.melt.indexOf('npm install') < yml.melt.indexOf('scripts/glacier/melt.mjs --data'));
  add('W11 jede Pipe in `tee` steht unter `set -o pipefail` (sat, melt, feed, archiv): ein Absturz des Producers wird ein roter Lauf, nie ein stilles Grün',
    ['sat', 'melt', 'feed', 'archiv'].every((n) => { const blocks = yml[n].split('        run: |\n').slice(1).filter((b) => /\| tee /.test(b)); return blocks.length >= 1 && blocks.every((b) => /^\s*set -o pipefail/.test(b)); }));
  add('W9 Leerlauf vor dem ersten Einspielen: fehlt `glacier/v1/index.json` auf `main`, melden Linien und Archiv den Grund und enden grün; fehlt der Zweig `glacier`, obwohl der Zeiger einen Build nennt, wird es rot (ein Fehler, kein Leerlauf)',
    ['static', 'sat', 'melt', 'feed'].every((n) => /glacier\/v1\/index\.json fehlt auf main/.test(yml[n]) && /Zweig glacier fehlt, index\.json nennt aber/.test(yml[n])) && /glacier\/v1\/index\.json fehlt im Daten-Repo/.test(yml.archiv));
}

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${String(c.detail).slice(0, 220)}]` : ''}`);
console.log(`\nverify:glacier-publish — ${passed}/${checks.length}${passed < checks.length ? ` (${checks.length - passed} FEHLER)` : ''}`);
process.exit(passed < checks.length ? 1 : 0);
