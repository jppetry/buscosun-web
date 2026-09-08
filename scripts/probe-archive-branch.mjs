/**
 * probe-archive-branch.mjs — Messsonde für den Archiv-Zweig (Phase AR0,
 * `audit/daten-archiv.md` §3).
 *
 * Beantwortet die EINE offene Frage des Entwurfs, bevor Code am
 * Produktionspfad entsteht:
 *
 *   **Kann ein Schreiber die Läufe von `main` auf einen Archiv-Zweig legen,
 *   OHNE ein einziges PNG herunterzuladen — und überleben die Bilder dort den
 *   Force-Push, mit dem `publish-repack.mjs` alle 3 h die Historie von `main`
 *   ersetzt?**
 *
 * Der Entwurf steht und fällt damit. Er nimmt an, dass
 *   (1) ein Klon mit `--filter=blob:none` die BAUM-Objekte bringt (und damit
 *       die Objekt-IDs aller Lauf-Dateien), aber keine Blobs,
 *   (2) `read-tree --prefix` + `write-tree` + `commit-tree` daraus einen neuen
 *       Commit bauen können, der DIESELBEN Blobs referenziert,
 *   (3) `git push` dabei nichts nachlädt, weil das Remote die Blobs schon hat,
 *   (4) die Blobs danach am Archiv-Zweig HÄNGEN — der Force-Push auf `main`
 *       sie also nicht mehr unerreichbar machen kann.
 *
 * (4) ist der eigentliche Sicherheitsgewinn: heute darf ein Lauf verloren
 * gehen (12 h Retention, aus DWD-Rohdaten reproduzierbar), ein Archiv nicht —
 * DWD hält nur ein rollierendes 24-h-Fenster.
 *
 * Gemessen wird gegen ein BARE-REPO auf der Platte, nicht gegen GitHub:
 * netzfrei, wiederholbar, ohne Produktionspfad zu berühren. Ehrlich benannte
 * Grenze: `file://` verhandelt anders als `https://` — die Sonde beweist die
 * GIT-MECHANIK, nicht das Verhalten von GitHubs Server unter Last. Der
 * Live-Nachweis ist der erste echte Lauf gegen das Daten-Repo (AR3).
 *
 *   node scripts/probe-archive-branch.mjs
 *
 * ENV: PROBE_DIR   Arbeitsverzeichnis (Default: os.tmpdir()/buscosun-archive-probe)
 *      PROBE_KEEP=1  Arbeitsverzeichnis stehen lassen (zum Nachsehen)
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = process.env.PROBE_DIR || join(tmpdir(), 'buscosun-archive-probe');
const BARE = join(ROOT, 'remote.git');
const SEED = join(ROOT, 'seed');
const WORK = join(ROOT, 'writer');
// ⚠️ Gemessene Falle (AR0, 1. Sondenlauf): ein Klon über einen PFAD nimmt den
// lokalen Kurzweg — Git kopiert/hardlinkt das ganze Objektlager und `--filter`
// bleibt wirkungslos (3,03 statt 0,05 MB). Nur `file://` erzwingt echte
// Aushandlung über `upload-pack`, wie sie auch `https://` fährt. Ohne die
// Gegenprobe (1b) wäre das als „bestanden" durchgegangen.
const BARE_URL = pathToFileURL(BARE).href;

const log = (...a) => console.log('[probe]', ...a);
const git = (cwd, args, env) =>
  execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
  }).trim();

/** Verzeichnisgröße in Bytes (rekursiv). */
function dirBytes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return n;
}
const MB = (b) => (b / 1048576).toFixed(2) + ' MB';

const checks = [];
const add = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); };

// ── 1. Ein Remote bauen, das dem Daten-Repo gleicht ────────────────────────
// Vier Läufe à 207 Dateien wären 13 MB Zufallsbytes je Lauf und würden die
// Sonde langsam machen, ohne etwas anderes zu beweisen: für die Frage zählt
// die STRUKTUR (Unterbaum je Lauf) und dass die Blobs groß genug sind, um
// einen Nachlade-Effekt sichtbar zu machen. Also 4 Läufe × 12 Dateien × 64 KB
// ≈ 3 MB — plus ein `radar/`-Zweigbaum, den der Publisher nicht kennt.
const RUNS = ['2026090709', '2026090712', '2026090715', '2026090718'];
const FILES_PER_RUN = 12;
const FILE_BYTES = 64 * 1024;

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(SEED, { recursive: true });
mkdirSync(BARE, { recursive: true });

execFileSync('git', ['init', '--bare', '--quiet', '--initial-branch=main', BARE], { stdio: 'ignore' });
// Ohne das lehnt der Server den `--filter`-Klon ab und git fällt still auf
// einen VOLLEN Klon zurück — die Sonde hätte dann grün gemessen, was in
// Wahrheit alle Blobs geladen hat. GitHub hat den Filter serverseitig an.
git(BARE, ['config', 'uploadpack.allowFilter', 'true']);
git(BARE, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);

git(SEED, ['init', '--quiet', '--initial-branch=main']);
git(SEED, ['config', 'user.email', 'probe@example.invalid']);
git(SEED, ['config', 'user.name', 'probe']);
for (const run of RUNS) {
  const dir = join(SEED, 'runs', run);
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < FILES_PER_RUN; i++) {
    // Zufallsbytes: nicht komprimierbar, nicht deltafähig — der ungünstigste
    // und damit ehrlichste Fall für „wurde etwas übertragen?".
    writeFileSync(join(dir, `fam-${String(i).padStart(3, '0')}.png`), randomBytes(FILE_BYTES));
  }
  writeFileSync(join(dir, 'repack.json'), JSON.stringify({ run }) + '\n');
}
mkdirSync(join(SEED, 'radar', 'img'), { recursive: true });
writeFileSync(join(SEED, 'radar', 'img', 'slot.png'), randomBytes(4096));
writeFileSync(join(SEED, 'index.json'), JSON.stringify({ runs: RUNS }) + '\n');
git(SEED, ['add', '-A']);
git(SEED, ['commit', '--quiet', '-m', 'seed: vier Läufe wie auf main']);
git(SEED, ['push', '--quiet', BARE, 'HEAD:main']);
const seedBytes = dirBytes(join(SEED, 'runs')) + dirBytes(join(SEED, 'radar'));
log(`Remote gebaut: ${RUNS.length} Läufe, ${MB(seedBytes)} Inhalt`);

// ── 2. Der Schreiber klont BLOB-LOS ────────────────────────────────────────
execFileSync('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', '--depth=1',
  BARE_URL, WORK], { stdio: ['ignore', 'pipe', 'pipe'] });
const cloneBytes = dirBytes(join(WORK, '.git'));
log(`Blob-loser Klon: ${MB(cloneBytes)} (Inhalt am Remote: ${MB(seedBytes)})`);
add(`(1) Blob-loser Klon lädt die Bilder nicht (${MB(cloneBytes)} statt ${MB(seedBytes)})`,
  cloneBytes < seedBytes * 0.25, `${MB(cloneBytes)} / ${MB(seedBytes)}`);

// Gegenprobe: sind die Blobs wirklich ABWESEND? `--missing=print` listet, was
// als „liegt beim Promisor" markiert ist. Ohne diese Kontrolle bewiese die
// Größe oben nichts (ein kleiner Klon kann auch ein leerer sein).
const missing = git(WORK, ['rev-list', '--objects', '--missing=print', '--all'])
  .split('\n').filter((l) => l.startsWith('?')).length;
add(`(1b) Gegenprobe: ${missing} Blobs sind als fehlend markiert (Promisor), nicht heruntergeladen`,
  missing >= RUNS.length * FILES_PER_RUN, `${missing} fehlende Objekte`);

// ── 3. Archiv-Commit bauen — nur aus Objekt-IDs ────────────────────────────
// Der Kern des Entwurfs: `runs/<lauf>` von `main` ist ein Unterbaum mit einer
// eigenen OID. Wer sie kennt, kann sie in einen neuen Baum hängen, ohne je
// eine Datei gesehen zu haben.
// Gemessene Falle (AR0, 2. Sondenlauf): `git read-tree --prefix` zieht die
// Blobs des Unterbaums in den Index und löst damit im Partial-Clone genau das
// Nachladen aus, das der Entwurf vermeiden will (+3,01 MB von 3,00 MB Inhalt).
// Der Index ist hier auch gar nicht nötig: ein Baum ist eine Liste von
// (Modus, Typ, OID, Name) — `git mktree --missing` schreibt sie direkt, ohne
// ein einziges Objekt anzufassen.
const mkArgs = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
const mktree = (entries) => execFileSync('git', ['mktree', '--missing'],
  { cwd: WORK, input: entries.map((e) => `${e.mode} ${e.type} ${e.sha}\t${e.name}`).join('\n') + '\n', ...mkArgs }).trim();
/** Einträge eines vorhandenen Baums lesen — liest NUR das Baum-Objekt. */
const treeEntries = (ref) => {
  let out = '';
  try { out = git(WORK, ['ls-tree', ref]); } catch { return []; }
  if (!out) return [];
  return out.split('\n').map((l) => {
    const [meta, name] = l.split('\t');
    const [mode, type, sha] = meta.split(/\s+/);
    return { mode, type, sha, name };
  });
};

let mark = dirBytes(join(WORK, '.git'));
const step = (name) => {
  const now = dirBytes(join(WORK, '.git'));
  const d = now - mark; mark = now;
  log(`  ${name.padEnd(34)} ${d > 8192 ? '+' + (d / 1048576).toFixed(2) + ' MB  ← NACHGELADEN' : '+' + (d / 1024).toFixed(0) + ' KB'}`);
  return d;
};
step('nach rev-list --missing=print');

const MONTH = 'archive-202609';
let parent = '';
try { parent = git(WORK, ['rev-parse', `origin/${MONTH}`]); } catch { parent = ''; }

const subtrees = {};
for (const run of RUNS) subtrees[run] = git(WORK, ['rev-parse', `origin/main:runs/${run}`]);
const dRevParse = step('nach rev-parse <tree>:runs/<lauf>');
add('(2) Unterbaum-OID je Lauf aus dem Klon lesbar (ohne Blobs)',
  RUNS.every((r) => /^[0-9a-f]{40}$/.test(subtrees[r])), subtrees[RUNS[0]].slice(0, 12));

// `runs/` = vorhandene Einträge des Archivs + die neuen Läufe (nach Name sortiert,
// wie Git es verlangt).
const have = new Map(treeEntries(parent ? `${parent}:runs` : '').map((e) => [e.name, e]));
for (const run of RUNS) have.set(run, { mode: '040000', type: 'tree', sha: subtrees[run], name: run });
const runsTree = mktree([...have.values()].sort((a, b) => (a.name < b.name ? -1 : 1)));
const dMkRuns = step('nach mktree runs/');
const rootTree = mktree([{ mode: '040000', type: 'tree', sha: runsTree, name: 'runs' }]);
const dMkRoot = step('nach mktree Wurzel');

const msg = `archive: ${RUNS.length} Läufe`;
const commitArgs = ['commit-tree', rootTree, '-m', msg];
if (parent) commitArgs.splice(2, 0, '-p', parent);
const commitSha = git(WORK, commitArgs, {
  GIT_AUTHOR_NAME: 'probe', GIT_AUTHOR_EMAIL: 'probe@example.invalid',
  GIT_COMMITTER_NAME: 'probe', GIT_COMMITTER_EMAIL: 'probe@example.invalid',
});
step('nach commit-tree');
add('(2b) Baum + Commit ohne Arbeitsverzeichnis und ohne Index gebaut', /^[0-9a-f]{40}$/.test(commitSha), commitSha.slice(0, 12));
add('(2c) Kein Befehl der Baum-Erzeugung lädt Blobs nach (rev-parse/ls-tree/mktree)',
  dRevParse < 8192 && dMkRuns < 8192 && dMkRoot < 8192,
  `rev-parse +${(dRevParse / 1024).toFixed(0)} KB · mktree runs +${(dMkRuns / 1024).toFixed(0)} KB · mktree Wurzel +${(dMkRoot / 1024).toFixed(0)} KB`);

// ── 4. Push — und die Frage, ob dabei etwas nachgeladen wird ───────────────
const beforePush = dirBytes(join(WORK, '.git'));
git(WORK, ['push', '--quiet', 'origin', `${commitSha}:refs/heads/${MONTH}`]);
const afterPush = dirBytes(join(WORK, '.git'));
const grew = afterPush - beforePush;
log(`Push: .git ${MB(beforePush)} → ${MB(afterPush)} (${grew >= 0 ? '+' : ''}${(grew / 1024).toFixed(0)} KB)`);
add(`(3) Der Push lädt die Blobs NICHT nach (.git wuchs um ${(grew / 1024).toFixed(0)} KB, ein Lauf wären ${(FILES_PER_RUN * FILE_BYTES / 1024).toFixed(0)} KB)`,
  grew < FILE_BYTES, `+${(grew / 1024).toFixed(0)} KB`);
const missingAfter = git(WORK, ['rev-list', '--objects', '--missing=print', '--all'])
  .split('\n').filter((l) => l.startsWith('?')).length;
add('(3b) Die Blobs sind auch nach dem Push noch als fehlend markiert (nie geladen)',
  missingAfter > 0 && missingAfter >= missing, `${missingAfter} fehlende Objekte`);

// ── 5. Liegen die Daten am Archiv-Zweig GENAUSO wie auf main? ──────────────
const lsMain = git(BARE, ['ls-tree', '-r', 'main', '--', 'runs/']);
const lsArch = git(BARE, ['ls-tree', '-r', MONTH, '--', 'runs/']);
add('(4) Archiv-Zweig trägt dieselben Pfade UND dieselben Blob-OIDs wie main',
  lsMain === lsArch && lsMain.length > 0, `${lsArch.split('\n').length} Einträge`);
const archTop = git(BARE, ['ls-tree', '--name-only', MONTH]);
add('(4b) Der Archiv-Zweig trägt NUR `runs/` (kein radar/, kein index.json von main)',
  archTop === 'runs', archTop.replace(/\n/g, ' '));

// ── 6. Der Härtetest: main force-pusht die Läufe weg ───────────────────────
// Genau das tut `publish-repack.mjs` alle 3 h. Überlebt das Archiv?
const FORCE = join(ROOT, 'forcer');
git(SEED, ['clone', '--quiet', '--depth=1', BARE_URL, FORCE]);
rmSync(join(FORCE, '.git'), { recursive: true, force: true });
rmSync(join(FORCE, 'runs'), { recursive: true, force: true });
mkdirSync(join(FORCE, 'runs', '2026090721'), { recursive: true });
writeFileSync(join(FORCE, 'runs', '2026090721', 'fam-000.png'), randomBytes(FILE_BYTES));
git(FORCE, ['init', '--quiet', '--initial-branch=main']);
git(FORCE, ['config', 'user.email', 'probe@example.invalid']);
git(FORCE, ['config', 'user.name', 'probe']);
git(FORCE, ['add', '-A']);
git(FORCE, ['commit', '--quiet', '-m', 'data: frische Historie (wie publish-repack)']);
git(FORCE, ['push', '--quiet', '--force', BARE, 'HEAD:main']);
// Und danach räumen, so hart wie GitHub es je täte.
git(BARE, ['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all']);
git(BARE, ['gc', '--prune=now', '--quiet']);

const lsArchAfter = git(BARE, ['ls-tree', '-r', MONTH, '--', 'runs/']);
add('(5) Nach Force-Push auf main UND `gc --prune=now`: der Archiv-Zweig ist unverändert',
  lsArchAfter === lsArch, `${lsArchAfter.split('\n').length} Einträge`);
let readable = false;
try {
  const oneBlob = lsArch.split('\n')[0].split(/\s+/)[2];
  readable = git(BARE, ['cat-file', '-s', oneBlob]) === String(FILE_BYTES);
} catch { readable = false; }
add('(5b) Eine Bilddatei des Archivs ist danach noch lesbar (Blob überlebt, weil der Zweig ihn hält)', readable);
const mainRuns = git(BARE, ['ls-tree', '--name-only', 'main:runs/']).split('\n');
add('(5c) Gegenkontrolle: main trägt nur noch den neuen Lauf (der Force-Push hat gewirkt)',
  mainRuns.length === 1 && mainRuns[0] === '2026090721', mainRuns.join(' '));

// ── 7. Zweiter Anhang: wächst der Zweig, statt ersetzt zu werden? ──────────
git(WORK, ['fetch', '--quiet', '--filter=blob:none', '--depth=1', 'origin', 'main']);
const newRunTree = git(WORK, ['rev-parse', 'FETCH_HEAD:runs/2026090721']);
const have2 = new Map(treeEntries(`${commitSha}:runs`).map((e) => [e.name, e]));
have2.set('2026090721', { mode: '040000', type: 'tree', sha: newRunTree, name: '2026090721' });
const runsTree2 = mktree([...have2.values()].sort((a, b) => (a.name < b.name ? -1 : 1)));
const rootTree2 = mktree([{ mode: '040000', type: 'tree', sha: runsTree2, name: 'runs' }]);
const commit2 = git(WORK, ['commit-tree', rootTree2, '-p', commitSha, '-m', 'archive: +2026090721'], {
  GIT_AUTHOR_NAME: 'probe', GIT_AUTHOR_EMAIL: 'probe@example.invalid',
  GIT_COMMITTER_NAME: 'probe', GIT_COMMITTER_EMAIL: 'probe@example.invalid',
});
git(WORK, ['push', '--quiet', 'origin', `${commit2}:refs/heads/${MONTH}`]);
const runsInArchive = git(BARE, ['ls-tree', '--name-only', `${MONTH}:runs/`]).split('\n');
add('(6) Zweiter Lauf wird ANGEHÄNGT, nicht ersetzt (5 Läufe im Archiv, main hat 1)',
  runsInArchive.length === RUNS.length + 1, runsInArchive.join(' '));
const hist = git(BARE, ['rev-list', '--count', MONTH]);
add('(6b) Der Archiv-Zweig hat eine wachsende Historie (2 Commits), kein Force-Push', hist === '2', `${hist} Commits`);
const missingEnd = git(WORK, ['rev-list', '--objects', '--missing=print', '--all'])
  .split('\n').filter((l) => l.startsWith('?')).length;
add('(6c) Am Ende hat der Schreiber KEINE einzige Bilddatei geladen',
  missingEnd >= RUNS.length * FILES_PER_RUN, `${missingEnd} fehlende Objekte, .git ${MB(dirBytes(join(WORK, '.git')))}`);

// ── Ergebnis ───────────────────────────────────────────────────────────────
if (process.env.PROBE_KEEP !== '1') rmSync(ROOT, { recursive: true, force: true });
const failed = checks.filter((c) => !c.ok);
console.log('');
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} Prüfungen bestanden`);
process.exit(failed.length ? 1 : 0);
