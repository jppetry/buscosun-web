/**
 * verify:glacier-publish — Phase GL (audit/gletscher.md §GL-1): the publisher of `buscosun-glacier` against a REAL bare git remote.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-publish.mjs
 *
 * No network: a bare repository in the temp dir plays GitHub, clones play the workflow runners. What is proven:
 *   P1 first push, P2 two lines coexist (index re-read), P3 a rejected push heals on a fresh base without losing the other line,
 *   P4 prune keeps the newest two builds and nothing of another line, P5/P6 guards (prefix, 20 MB), P7 no-op, P8 never forces,
 *   P9 archive adds only, P10 merge patch, P11 CLI, P12 kill switch survives.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishGlacier, publishArchive, mergePatch, checkPackage, GLACIER_MAX_FILE_BYTES } from './glacier/glacier-publish.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const checks = [];
const add = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); };
const tmp = mkdtempSync(join(tmpdir(), 'glacier-pub-'));
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const cfg = (dir) => { sh(dir, 'config', 'user.email', 't@example.com'); sh(dir, 'config', 'user.name', 'test'); sh(dir, 'config', 'commit.gpgsign', 'false'); };

// --- a remote with an initial commit (README) -------------------------------------------------------------------
const remote = join(tmp, 'remote.git');
sh(tmp, 'init', '--bare', '-b', 'main', remote);
const seed = join(tmp, 'seed');
sh(tmp, 'clone', '-q', remote, seed); cfg(seed);
writeFileSync(join(seed, 'README.md'), '# buscosun-glacier\n');
sh(seed, 'add', '-A'); sh(seed, 'commit', '-q', '-m', 'init'); sh(seed, 'push', '-q', 'origin', 'HEAD:main');
const clone = (n) => { const d = join(tmp, n); sh(tmp, 'clone', '-q', '--depth=1', `file://${remote}`, d); cfg(d); return d; };
const W = (root, files) => { for (const [p, c] of Object.entries(files)) { const f = join(root, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, typeof c === 'string' ? c : JSON.stringify(c)); } return root; };
const src = (n, files) => W(join(tmp, `src-${n}`), files);
const show = (rev, path) => sh(seed, 'show', `${rev}:${path}`);
const fetchSeed = () => { sh(seed, 'fetch', '-q', 'origin'); };
const remoteFile = (path, branch = 'main') => { fetchSeed(); try { return show(`origin/${branch}`, path); } catch { return null; } };
const remoteList = (prefix, branch = 'main') => { fetchSeed(); return sh(seed, 'ls-tree', '-r', '--name-only', `origin/${branch}`, '--', prefix).split('\n').filter(Boolean); };
const head = (branch = 'main') => { fetchSeed(); return sh(seed, 'rev-parse', `origin/${branch}`); };
const fast = { sleepMs: () => 0 };

// P1 first push -----------------------------------------------------------------------------------------------
const A = clone('runner-static');
const s1 = src('static1', { 'static/20261011-1/catalog.json': { schema: 1, kind: 'glacier/catalog', build: '20261011-1', glaciers: [] }, 'static/20261011-1/points.json': { rows: [] } });
const r1 = publishGlacier({ repoDir: A, line: 'static', srcDir: s1, message: 'glacier(static): 20261011-1', indexPatch: { schema: 1, kind: 'glacier/index', builtAt: '2026-10-11T12:00:00Z', static: { build: '20261011-1' } }, statusPatch: { schema: 1, kind: 'glacier/status', lines: { static: { build: '20261011-1', glaciers: 2203 } } }, ...fast });
const idx1 = JSON.parse(remoteFile('v1/index.json') ?? 'null');
add('P1 erster Push: Dateien der Linie, index.json (Build) und status.json (Linie) stehen im Remote, README bleibt', r1.pushed && idx1?.static?.build === '20261011-1' && !!remoteFile('v1/static/20261011-1/catalog.json') && !!remoteFile('README.md') && JSON.parse(remoteFile('v1/status.json')).lines.static.glaciers === 2203, JSON.stringify(r1));

// P2 two lines coexist ------------------------------------------------------------------------------------------
const B = clone('runner-sat');
const sSat = src('sat1', { 'obs/2026/32TPT/2026-10-10.json': { scene: 'S2B_32TPT_20261010' } });
const r2 = publishGlacier({ repoDir: B, line: 'sat', srcDir: sSat, message: 'glacier(sat): 32TPT 2026-10-10', indexPatch: { sat: { tiles: { '32TPT': { date: '2026-10-10' } } } }, statusPatch: { lines: { sat: { at: '2026-10-11T13:00:00Z' } } }, ...fast });
const idx2 = JSON.parse(remoteFile('v1/index.json'));
add('P2 zweite Linie (sat) im selben Repo: index.json trägt BEIDE Zeiger (static und sat), status.json beide Linien, static-Dateien unverändert', r2.pushed && idx2.static.build === '20261011-1' && idx2.sat.tiles['32TPT'].date === '2026-10-10' && JSON.parse(remoteFile('v1/status.json')).lines.static && JSON.parse(remoteFile('v1/status.json')).lines.sat && !!remoteFile('v1/static/20261011-1/catalog.json'), JSON.stringify(idx2));

// P3 rejected push heals --------------------------------------------------------------------------------------
{
  const s2 = src('static2', { 'static/20261011-2/catalog.json': { build: '20261011-2' } });
  const C = clone('runner-sat-race');
  let raced = false;
  const r = publishGlacier({
    repoDir: A, line: 'static', srcDir: s2, message: 'glacier(static): 20261011-2',
    indexPatch: { builtAt: '2026-10-11T14:00:00Z', static: { build: '20261011-2' } },
    beforePush: (attempt) => {
      if (attempt === 1 && !raced) {                       // between the commit and the push another line publishes
        raced = true;
        publishGlacier({ repoDir: C, line: 'sat', srcDir: src('sat2', { 'obs/2026/32TPT/2026-10-11.json': { scene: 'x' } }), message: 'glacier(sat): race', indexPatch: { sat: { tiles: { '32TPT': { date: '2026-10-11' } } } }, ...fast });
      }
    }, ...fast,
  });
  const idx = JSON.parse(remoteFile('v1/index.json'));
  const raceSha = sh(seed, 'log', 'origin/main', '--format=%H %s').split('\n').find((l) => /race/.test(l))?.split(' ')[0];
  const linear = raceSha && sh(seed, 'merge-base', '--is-ancestor', raceSha, 'origin/main') === '';
  add('P3 abgelehnter Push (eine andere Linie war dazwischen): neuer Versuch auf frischer Basis, index.json trägt static 20261011-2 UND den Stand von sat, Verlauf linear, kein Force', r.pushed && r.attempts === 2 && idx.static.build === '20261011-2' && idx.sat.tiles['32TPT'].date === '2026-10-11' && linear, JSON.stringify({ r, idx: idx.sat }));
  // negative control: a stale full write (what the first attempt would have pushed) loses the other line
  const stale = mergePatch({ static: { build: '20261011-1' } }, { static: { build: '20261011-2' } });
  add('P3b Gegenprobe: ein Schreiben ohne frisches Lesen (nur der Zeiger der eigenen Linie) hätte den Zeiger der anderen Linie verloren', stale.sat === undefined && idx.sat !== undefined, '');
}

// P4 prune ----------------------------------------------------------------------------------------------------
{
  const s3 = src('static3', { 'static/20261011-3/catalog.json': { build: '20261011-3' } });
  const r = publishGlacier({ repoDir: A, line: 'static', srcDir: s3, message: 'glacier(static): 20261011-3', indexPatch: { static: { build: '20261011-3' } }, ...fast });
  const builds = [...new Set(remoteList('v1/static').map((p) => p.split('/')[2]))].sort();
  add('P4 Aufräumen: nur die zwei neuesten Builds bleiben (20261011-2, -3), die sat-Dateien sind unberührt', r.pushed && JSON.stringify(builds) === JSON.stringify(['20261011-2', '20261011-3']) && remoteList('v1/obs').length === 2, JSON.stringify(builds));
}

// P5/P6 guards --------------------------------------------------------------------------------------------------
{
  const before = head();
  let e5 = null, e6 = null, e6b = null;
  try { publishGlacier({ repoDir: B, line: 'sat', srcDir: src('bad1', { 'static/oops.json': { x: 1 } }), message: 'x', ...fast }); } catch (e) { e5 = e.message; }
  try { writeFileSync; publishGlacier({ repoDir: B, line: 'sat', srcDir: (() => { const d = src('big', {}); mkdirSync(join(d, 'obs'), { recursive: true }); writeFileSync(join(d, 'obs', 'big.json'), Buffer.alloc(GLACIER_MAX_FILE_BYTES + 1, 0x20)); return d; })(), message: 'x', ...fast }); } catch (e) { e6 = e.message; }
  try { checkPackage('nope', src('nl', { 'a.json': {} })); } catch (e) { e6b = e.message; }
  add('P5 Pfadwächter: eine Datei außerhalb der Präfixe der Linie (static/ in der sat-Linie) bricht ab, der Remote bleibt unverändert', /außerhalb der Linie sat/.test(e5 ?? '') && head() === before, e5);
  add('P6 Größenwächter: eine Datei über 20 MB bricht ab; eine unbekannte Linie ebenso', /über 20 MB/.test(e6 ?? '') && /unbekannte Linie/.test(e6b ?? '') && head() === before, `${e6} | ${e6b}`);
}

// P7 no-op / P8 never force ----------------------------------------------------------------------------------------
{
  const same = publishGlacier({ repoDir: A, line: 'static', srcDir: src('static3b', { 'static/20261011-3/catalog.json': { build: '20261011-3' } }), message: 'again', indexPatch: { static: { build: '20261011-3' } }, ...fast });
  add('P7 identischer Inhalt: kein Commit („nichts Neues“)', same.unchanged === true && same.pushed === false, JSON.stringify(same));
  const D = clone('runner-hostile');
  const before = head();
  let n = 0;
  const r = publishGlacier({
    repoDir: D, line: 'melt', srcDir: src('melt1', { 'melt/2026101112.json': { run: '2026101112' } }), message: 'glacier(melt): hostile', retries: 3, ...fast,
    beforePush: () => { n++; const X = clone(`hostile-${n}`); publishGlacier({ repoDir: X, line: 'sat', srcDir: src(`hs${n}`, { [`obs/2026/h/${n}.json`]: { n } }), message: `interloper ${n}`, ...fast }); },
  });
  fetchSeed();
  const log = sh(seed, 'log', 'origin/main', '--format=%s').split('\n');
  add('P8 nie Force: wird jeder Versuch überholt, endet der Lauf rot (failed, 3 Versuche) — die überholenden Commits bleiben im Verlauf, nichts wird überschrieben', r.failed === true && r.attempts === 3 && log.filter((s) => /^interloper/.test(s)).length === 3 && log.includes('glacier(static): 20261011-3') && !log.includes('glacier(melt): hostile') && head() !== before, JSON.stringify(r));
}

// P9 archive --------------------------------------------------------------------------------------------------------
{
  const E = clone('runner-archive');
  const a1 = publishArchive({ repoDir: E, srcDir: src('arch1', { 'melt-2026101112.json': { run: 1 } }), day: '2026-10-11', message: 'archive: 2026-10-11', ...fast });
  const a2 = publishArchive({ repoDir: E, srcDir: src('arch2', { 'melt-2026101118.json': { run: 2 } }), day: '2026-10-11', message: 'archive: 2026-10-11 b', ...fast });
  const a3 = publishArchive({ repoDir: E, srcDir: src('arch3', { 'melt-2026101118.json': { run: 2 } }), day: '2026-10-11', message: 'again', ...fast });
  let clash = null;
  try { publishArchive({ repoDir: E, srcDir: src('arch4', { 'melt-2026101118.json': { run: 99 } }), day: '2026-10-11', message: 'clash', ...fast }); } catch (e) { clash = e.message; }
  const files = remoteList('day', 'archive');
  const mainHasArchive = remoteList('day').length;
  const headAfter = sh(E, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  add('P9b Nach dem Archiv-Lauf steht der Klon wieder auf `main` (auch nach dem Abbruch beim Namenskonflikt) — ein Entwickler-Klon bleibt nicht auf dem verwaisten Zweig, auf dem v1/ fehlt', headAfter === 'main', headAfter);
  add('P9 Archiv-Zweig (verwaist): Tagesdateien werden nur HINZUGEFÜGT; identische Wiederholung = nichts Neues; gleicher Name mit anderem Inhalt bricht ab; main bleibt ohne day/', a1.pushed && a2.pushed && a3.unchanged && /anderem Inhalt/.test(clash ?? '') && files.length === 2 && mainHasArchive === 0 && sh(seed, 'log', 'origin/archive', '--diff-filter=D', '--name-only', '--format=').trim() === '', JSON.stringify({ files, clash }));
}

// P10 merge patch ---------------------------------------------------------------------------------------------------
{
  const m = mergePatch({ a: { b: 1, c: 2 }, l: [1, 2], keep: true }, { a: { b: null, d: 3 }, l: [9] });
  add('P10 Merge-Patch: verschachtelte Objekte verschmelzen, null löscht, Listen ersetzen', m.a.b === undefined && m.a.c === 2 && m.a.d === 3 && JSON.stringify(m.l) === '[9]' && m.keep === true, JSON.stringify(m));
}

// P11 CLI ---------------------------------------------------------------------------------------------------------------
{
  const F = clone('runner-cli');
  const s = src('cli', { 'static/20261011-4/catalog.json': { build: '20261011-4' } });
  writeFileSync(join(tmp, 'ip.json'), JSON.stringify({ static: { build: '20261011-4' } }));
  const p = spawnSync(process.execPath, [join(HERE, 'glacier', 'glacier-publish.mjs'), `--repo=${F}`, '--line=static', `--src=${s}`, `--index-patch=${join(tmp, 'ip.json')}`, '--message=glacier(static): cli'], { encoding: 'utf8' });
  const last = JSON.parse(p.stdout.trim().split('\n').pop());
  add('P11 Kommandozeile: Exit 0, letzte Zeile ist das Ergebnis als JSON, der Zeiger steht im Remote', p.status === 0 && last.pushed === true && JSON.parse(remoteFile('v1/index.json')).static.build === '20261011-4', p.stdout.trim().split('\n').pop());
  const bad = spawnSync(process.execPath, [join(HERE, 'glacier', 'glacier-publish.mjs'), `--repo=${F}`, '--line=sat', `--src=${s}`], { encoding: 'utf8' });
  add('P11b Kommandozeile: Wächterfehler ⇒ Exit ≠ 0 (der Workflow wird rot)', bad.status !== 0, (bad.stderr.split('\n').find((l) => /Error|außerhalb/.test(l)) ?? '').slice(0, 100));
}

// P12 kill switch survives ------------------------------------------------------------------------------------------------
{
  const G = clone('runner-kill');
  const kill = JSON.parse(show('origin/main', 'v1/status.json'));
  writeFileSync(join(G, 'v1', 'status.json'), JSON.stringify({ ...kill, killed: true, killReason: 'Test' }));
  sh(G, 'add', '-A'); sh(G, 'commit', '-q', '-m', 'kill'); sh(G, 'push', '-q', 'origin', 'HEAD:main');
  publishGlacier({ repoDir: A, line: 'static', srcDir: src('static5', { 'static/20261011-5/catalog.json': { build: '20261011-5' } }), message: 'glacier(static): 5', indexPatch: { static: { build: '20261011-5' } }, statusPatch: { lines: { static: { build: '20261011-5' } } }, ...fast });
  const st = JSON.parse(remoteFile('v1/status.json'));
  add('P12 Kill-Schalter im Status bleibt bei einem Linien-Lauf erhalten (nur `lines` wird gepatcht)', st.killed === true && st.killReason === 'Test' && st.lines.static.build === '20261011-5', JSON.stringify(st).slice(0, 160));
}

// W: the workflow templates (the data repo carries copies; GitHub itself is not available here) ---------------------------------
{
  const names = ['static', 'sat', 'melt', 'feed'];
  const yml = Object.fromEntries(names.map((n) => [n, readFileSync(join(HERE, 'glacier', `workflow-glacier-${n}.yml`), 'utf8')]));
  const ok = (f) => names.every((n) => f(yml[n], n));
  add('W1 alle vier Vorlagen teilen die Concurrency-Gruppe `glacier-publish` ohne Abbruch laufender Läufe', ok((y) => /concurrency:\s*\n\s*group: glacier-publish\s*\n\s*cancel-in-progress: false/.test(y)));
  add('W2 PRODUCER_REF-Wächter: Standard `feat/gletscher`, `git ls-remote --exit-code --heads`, „producer not on <ref> yet“ und Ende grün (exit 0), Zweig ohne Rebase geklont', ok((y) => /PRODUCER_REF: \$\{\{ vars\.PRODUCER_REF \|\| 'feat\/gletscher' \}\}/.test(y) && /git ls-remote --exit-code --heads https:\/\/github\.com\/jppetry\/buscosun-web\.git "\$REF"/.test(y) && /producer not on \$REF yet/.test(y) && /ready=0" >> "\$GITHUB_OUTPUT"; exit 0/.test(y) && /--branch "\$REF"/.test(y)));
  add('W3 keine Zugangsdaten: kein `secrets.` und keine Tokens in den Vorlagen; Schreibrecht nur bei den Linien, die veröffentlichen (sat, melt, feed), static liest nur', ok((y) => !/secrets\./.test(y) && !/token/i.test(y)) && /permissions:\s*\n\s*contents: read/.test(yml.static) && /permissions:\s*\n\s*contents: write/.test(yml.sat) && /permissions:\s*\n\s*contents: write/.test(yml.melt) && /permissions:\s*\n\s*contents: write/.test(yml.feed));
  add('W4 jede Veröffentlichung läuft über glacier-publish.mjs mit --line (nie ein handgeschriebenes git push); der Archivzweig nur über --archive', !/git push/.test(Object.values(yml).join('\n')) && /glacier-publish\.mjs --repo=data --line=sat/.test(yml.sat) && /glacier-publish\.mjs --repo=data --line=melt/.test(yml.melt) && /glacier-publish\.mjs --repo=data --line=feed/.test(yml.feed) && /glacier-publish\.mjs --archive/.test(yml.melt));
  const cron = (y) => (/- cron: '([^']+)'/.exec(y) ?? [])[1];
  const crons = names.map((n) => cron(yml[n]));
  const fieldsOk = crons.every((c) => c && c.split(' ').length === 5);
  const minutes = crons.map((c) => c.split(' ')[0]);
  add('W5 Zeitpläne: je ein gültiger Cron mit fünf Feldern, die Minuten unterscheiden sich (kein gleichzeitiger Start), Timeout ≤ 45 min', fieldsOk && new Set(minutes).size === 4 && ok((y) => Number(/timeout-minutes: (\d+)/.exec(y)?.[1]) <= 45), crons.join(' | '));
  add('W6 melt: climaGrid im Sparse-Checkout (V-SW-18) und ein Kill-Schalter-Schritt vor dem Rechnen; sat und feed ebenso; der Feed ruft die Wochenkarte nur mit --week=previous und lässt bei fehlendem Browser den Feed unberührt', /public\/climaGrid\.json/.test(yml.melt) && /--week=previous \|\| echo/.test(yml.feed) && ok((y, n) => n === 'static' || /Kill switch/.test(y)));
  add('W7 Producer-Dateien, die die Vorlagen prüfen, existieren im Repo oder stehen für die Pakete GL-2/GL-3 aus (Leerlauf grün)', ['scripts/verify-glacier-static.mjs', 'scripts/verify-glacier-contract.mjs', 'src/glacier/glacierContract.ts', 'scripts/glacier/glacier-publish.mjs'].every((f) => existsSync(join(HERE, '..', f))), '');
}

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${String(c.detail).slice(0, 220)}]` : ''}`);
console.log(`\nverify:glacier-publish — ${passed}/${checks.length}${passed < checks.length ? ` (${checks.length - passed} FEHLER)` : ''}`);
process.exit(passed < checks.length ? 1 : 0);
