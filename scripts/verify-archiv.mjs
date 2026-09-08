/**
 * verify-archiv.mjs — Gate GAR1 des Monatsarchivs (`audit/daten-archiv.md` §5).
 *
 * Die Fragen, die zählen — in der Reihenfolge ihrer Gefährlichkeit:
 *
 *   1. Liegen die Daten im Archiv-Zweig GENAUSO wie auf `main`? (gleiche Pfade,
 *      gleiche Blob-OIDs — nicht „gleich aussehend")
 *   2. Überlebt das Archiv den Force-Push, mit dem `publish-repack.mjs` alle 3 h
 *      die Historie von `main` ersetzt — auch nach `gc --prune=now`?
 *   3. Kann der Schreiber jemals einen bereits archivierten Lauf VERLIEREN?
 *   4. Lädt er dabei wirklich keine Bilddatei?
 *
 * (2) und (3) sind der eigentliche Grund für den Zweig: DWD hält nur ein
 * rollierendes 24-h-Fenster, ein verlorener Archivlauf ist endgültig weg.
 *
 * Gemessen wird END-TO-END gegen ein Bare-Repo auf der Platte: der echte
 * Schreiber wird als Prozess gestartet, nicht nachgebaut. Netzfrei,
 * wiederholbar, ohne Produktionspfad. Ehrlich benannte Grenze: `file://`
 * verhandelt anders als `https://`, und ein Push-Rennen zwischen zwei
 * Schreibern lässt sich hier nicht erzeugen — dagegen steht nur der Entwurf
 * (kein `--force`, Elter vor jedem Versuch neu geholt), nicht diese Messung.
 *
 *   npm run verify:archiv
 *
 * ENV: ARCHIV_KEEP=1  Arbeitsverzeichnis stehen lassen
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { monthOf, mergeRuns, lostEntries, remoteUrl } from './archive-runs.mjs';

const ROOT = join(tmpdir(), 'buscosun-archiv-gate');
const BARE = join(ROOT, 'remote.git');
const SEED = join(ROOT, 'seed');
const WORK = join(ROOT, 'writer');
const WRITER = resolve('scripts/archive-runs.mjs');

const checks = [];
const add = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); };
const git = (cwd, args) => execFileSync('git', args,
  { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Den echten Schreiber starten. Gibt { code, out } zurück. */
function writer(args = [], env = {}) {
  try {
    const out = execFileSync(process.execPath, [WRITER, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ARCHIVE_REPO: BARE, ARCHIVE_WORK: WORK, ...env },
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

function dirBytes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return n;
}

const FILES_PER_RUN = 10;
const FILE_BYTES = 48 * 1024;

/** Einen Lauf mit Zufallsbytes in den Seed schreiben (nicht komprimierbar). */
function seedRun(run) {
  const dir = join(SEED, 'runs', run);
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < FILES_PER_RUN; i++) {
    writeFileSync(join(dir, `temp-${String(i).padStart(3, '0')}.png`), randomBytes(FILE_BYTES));
  }
  writeFileSync(join(dir, 'repack.json'), JSON.stringify({ run, families: ['temp'] }) + '\n');
}

/** Den Seed als NEUE Historie auf main force-pushen — genau wie publish-repack. */
function forcePushSeed(msg) {
  rmSync(join(SEED, '.git'), { recursive: true, force: true });
  git(SEED, ['init', '--quiet', '--initial-branch=main']);
  git(SEED, ['config', 'user.email', 'gate@example.invalid']);
  git(SEED, ['config', 'user.name', 'gate']);
  git(SEED, ['add', '-A']);
  git(SEED, ['commit', '--quiet', '-m', msg]);
  git(SEED, ['push', '--quiet', '--force', remoteUrl(BARE), 'HEAD:main']);
}

// ═══ Teil 1: die reinen Teile (netzfrei, ohne Git) ═════════════════════════
add('monthOf: Lauf → Monatszweig', monthOf('2026090718') === 'archive-202609', monthOf('2026090718'));
add('monthOf: Monatswechsel trennt die Zweige',
  monthOf('2026093021') === 'archive-202609' && monthOf('2026100100') === 'archive-202610');
let threw = false;
try { monthOf('nonsense'); } catch { threw = true; }
add('monthOf: kein Lauf-Bezeichner ⇒ Fehler statt stiller Unsinn', threw);

const E = (name, sha) => ({ mode: '040000', type: 'tree', sha, name });
const m1 = mergeRuns([E('2026090709', 'a'.repeat(40))], [E('2026090712', 'b'.repeat(40))]);
add('mergeRuns: neuer Lauf wird angehängt, alter bleibt',
  m1.entries.length === 2 && m1.added.length === 1 && m1.entries[0].name === '2026090709');
const m2 = mergeRuns([E('2026090709', 'a'.repeat(40))], [E('2026090709', 'a'.repeat(40))]);
add('mergeRuns: derselbe Lauf mit denselben Bytes ⇒ nichts zu tun',
  m2.added.length === 0 && m2.skipped.length === 1 && m2.conflicts.length === 0);
const m3 = mergeRuns([E('2026090709', 'a'.repeat(40))], [E('2026090709', 'c'.repeat(40))]);
add('mergeRuns: derselbe Lauf mit ANDEREN Bytes ⇒ Konflikt gemeldet, Archiv behält die erste Fassung',
  m3.conflicts.length === 1 && m3.entries[0].sha === 'a'.repeat(40) && m3.added.length === 0);
const m4 = mergeRuns([E('2026090712', 'b'.repeat(40))], [E('2026090709', 'a'.repeat(40))]);
add('mergeRuns: Einträge kommen sortiert zurück (Git verlangt es)',
  m4.entries[0].name === '2026090709' && m4.entries[1].name === '2026090712');

add('lostEntries: unverändert ⇒ leer', lostEntries([E('x', 'a'.repeat(40))], [E('x', 'a'.repeat(40))]).length === 0);
add('lostEntries: fehlender Eintrag wird gefunden', lostEntries([E('x', 'a'.repeat(40))], []).join() === 'x');
add('lostEntries: ersetzter Eintrag zählt als Verlust',
  lostEntries([E('x', 'a'.repeat(40))], [E('x', 'c'.repeat(40))]).join() === 'x');

add('remoteUrl: https bleibt unverändert',
  remoteUrl('https://github.com/jppetry/buscosun-data.git') === 'https://github.com/jppetry/buscosun-data.git');
add('remoteUrl: lokaler Pfad wird file:// (sonst ignoriert Git den Blob-Filter)',
  remoteUrl(process.cwd()).startsWith('file://'));

// ═══ Teil 2: der echte Schreiber gegen ein Bare-Repo ═══════════════════════
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(SEED, { recursive: true });
mkdirSync(BARE, { recursive: true });
execFileSync('git', ['init', '--bare', '--quiet', '--initial-branch=main', BARE], { stdio: 'ignore' });
git(BARE, ['config', 'uploadpack.allowFilter', 'true']);

// Ein `main` wie im Daten-Repo: 4 Läufe, radar/, index.json, README, hsurf.
const RUNS = ['2026090709', '2026090712', '2026090715', '2026090718'];
for (const r of RUNS) seedRun(r);
mkdirSync(join(SEED, 'radar', 'img'), { recursive: true });
writeFileSync(join(SEED, 'radar', 'img', 'slot.png'), randomBytes(4096));
writeFileSync(join(SEED, 'index.json'), JSON.stringify({ runs: RUNS }) + '\n');
writeFileSync(join(SEED, 'README.md'), '# data\n');
writeFileSync(join(SEED, 'hsurf-v1.png'), randomBytes(8192));
forcePushSeed('data: vier Läufe');
const contentBytes = dirBytes(join(SEED, 'runs'));

// ── Probelauf pusht nicht.
const dry = writer([]);
add('Probelauf ohne `--push` legt keinen Zweig an',
  dry.code === 0 && git(BARE, ['branch', '--list']).indexOf('archive-') === -1, dry.out.trim().split('\n').pop());

// ── Erster echter Lauf.
const r1 = writer(['--push']);
const branches1 = git(BARE, ['branch', '--list', '--format=%(refname:short)']).split('\n');
add('Erster Lauf legt `archive-202609` an', r1.code === 0 && branches1.includes('archive-202609'), branches1.join(' '));

const lsMain = git(BARE, ['ls-tree', '-r', 'main', '--', 'runs/']);
const lsArch = git(BARE, ['ls-tree', '-r', 'archive-202609', '--', 'runs/']);
add('(1) Archiv trägt dieselben Pfade UND dieselben Blob-OIDs wie main',
  lsMain === lsArch && lsMain.length > 0, `${lsArch.split('\n').length} Einträge`);
for (const r of RUNS.slice(0, 1)) {
  add(`(1b) Unterbaum-OID von runs/${r} ist auf beiden Zweigen identisch`,
    git(BARE, ['rev-parse', `main:runs/${r}`]) === git(BARE, ['rev-parse', `archive-202609:runs/${r}`]));
}
const archTop = git(BARE, ['ls-tree', '--name-only', 'archive-202609']).split('\n').sort();
add('(1c) Der Archiv-Zweig trägt `runs/` + `hsurf-v1.png` — kein radar/, kein index.json, kein README',
  archTop.join(' ') === 'hsurf-v1.png runs', archTop.join(' '));
add('(1d) `hsurf-v1.png` ist derselbe Blob wie auf main (mitgetragen, nicht neu gebaut)',
  git(BARE, ['rev-parse', 'main:hsurf-v1.png']) === git(BARE, ['rev-parse', 'archive-202609:hsurf-v1.png']));

// ── (4) Hat der Schreiber Bilder geladen?
const workMb = dirBytes(join(WORK, '.git'));
add(`(4) Der Schreiber lud keine Bilddatei (${(workMb / 1048576).toFixed(2)} MB Arbeitskopie, Inhalt am Remote ${(contentBytes / 1048576).toFixed(2)} MB)`,
  workMb < contentBytes * 0.2, `${(workMb / 1048576).toFixed(2)} / ${(contentBytes / 1048576).toFixed(2)} MB`);
const missing = git(WORK, ['rev-list', '--objects', '--missing=print', '--all'])
  .split('\n').filter((l) => l.startsWith('?')).length;
add('(4b) Gegenprobe: die Blobs sind als fehlend markiert (Promisor), nicht heruntergeladen',
  missing >= RUNS.length * FILES_PER_RUN, `${missing} fehlende Objekte`);

// ── Zweiter Lauf ohne neue Daten: kein Commit.
const countBefore = git(BARE, ['rev-list', '--count', 'archive-202609']);
const r2 = writer(['--push']);
const countAfter = git(BARE, ['rev-list', '--count', 'archive-202609']);
add('Zweiter Lauf ohne neue Daten macht KEINEN Commit (idempotent)',
  r2.code === 0 && countBefore === countAfter && /nichts Neues/.test(r2.out), `${countBefore} → ${countAfter} Commits`);

// ── Neuer Lauf auf main (mit Force-Push und Retention wie im Echtbetrieb).
rmSync(join(SEED, 'runs', RUNS[0]), { recursive: true, force: true });   // Retention: ältester fällt
seedRun('2026090721');
forcePushSeed('data: frische Historie mit 2026090721');
git(BARE, ['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all']);
git(BARE, ['gc', '--prune=now', '--quiet']);

// (2) Überlebt das Archiv Force-Push + gc?
const lsArchAfterGc = git(BARE, ['ls-tree', '-r', 'archive-202609', '--', 'runs/']);
add('(2) Nach Force-Push auf main UND `gc --prune=now`: Archiv unverändert', lsArchAfterGc === lsArch,
  `${lsArchAfterGc.split('\n').length} Einträge`);
let blobOk = false;
try {
  // Ein BILD, nicht der erste Eintrag: in einem Baum steht `repack.json` vor
  // `temp-000.png` (Git sortiert nach Namen) — die Größenprobe wäre sonst
  // gegen die falsche Datei gelaufen und hätte grundlos rot gemeldet.
  const png = lsArch.split('\n').find((l) => l.endsWith('.png'));
  blobOk = git(BARE, ['cat-file', '-s', png.split(/\s+/)[2]]) === String(FILE_BYTES);
} catch { blobOk = false; }
add('(2b) Eine archivierte Bilddatei ist danach noch lesbar (der Zweig hält den Blob)', blobOk);
const mainRunsNow = git(BARE, ['ls-tree', '--name-only', 'main:runs/']).split('\n');
add('(2c) Gegenkontrolle: main hat den ältesten Lauf fallen lassen (Retention hat gewirkt)',
  !mainRunsNow.includes(RUNS[0]) && mainRunsNow.includes('2026090721'), mainRunsNow.join(' '));

// (3) Der neue Lauf kommt DAZU — der weggefallene bleibt im Archiv.
const r3 = writer(['--push']);
const archRuns = git(BARE, ['ls-tree', '--name-only', 'archive-202609:runs/']).split('\n');
add('(3) Neuer Lauf angehängt UND der auf main gelöschte Lauf ist noch im Archiv',
  r3.code === 0 && archRuns.includes('2026090721') && archRuns.includes(RUNS[0]) && archRuns.length === 5,
  archRuns.join(' '));
add('(3b) Der Archiv-Zweig hat eine WACHSENDE Historie (2 Commits), kein Force-Push',
  git(BARE, ['rev-list', '--count', 'archive-202609']) === '2');

// ── Monatswechsel: zwei Zweige aus einem Lauf-Satz.
seedRun('2026100100');
forcePushSeed('data: Monatswechsel');
const r4 = writer(['--push']);
const branches2 = git(BARE, ['branch', '--list', '--format=%(refname:short)']).split('\n').sort();
add('Monatswechsel legt einen zweiten Zweig an, ohne den ersten anzufassen',
  r4.code === 0 && branches2.includes('archive-202610') && branches2.includes('archive-202609'), branches2.join(' '));
add('Der Oktober-Zweig trägt NUR den Oktober-Lauf',
  git(BARE, ['ls-tree', '--name-only', 'archive-202610:runs/']) === '2026100100');

// ── Konflikt: derselbe Lauf mit anderen Bytes auf main.
seedRun('2026090721');   // neu gewürfelte Bytes unter demselben Namen
forcePushSeed('data: 2026090721 neu gerechnet');
const shaArchBefore = git(BARE, ['rev-parse', 'archive-202609:runs/2026090721']);
const r5 = writer(['--push']);
const shaArchAfter = git(BARE, ['rev-parse', 'archive-202609:runs/2026090721']);
add('Konflikt (gleicher Lauf, andere Bytes): das Archiv behält die erste Fassung und sagt es',
  r5.code === 0 && shaArchBefore === shaArchAfter && /bereits mit anderen Bytes/.test(r5.out),
  r5.out.split('\n').filter((l) => /anderen Bytes/.test(l))[0]?.trim().slice(0, 80) ?? '—');

// ── Sicherung: unerreichbares Remote ⇒ Abbruch OHNE Push.
const r6 = writer(['--push'], { ARCHIVE_REPO: join(ROOT, 'gibt-es-nicht.git') });
add('Unerreichbares Remote ⇒ Abbruch ohne Push (Zustand unbekannt ⇒ kein Blindflug)',
  r6.code === 1 && /ls-remote|unbekannt/.test(r6.out), r6.out.trim().split('\n').pop()?.slice(0, 90));

// ── Sicherung: Quellzweig ohne runs/ ⇒ Abbruch statt leeres Archiv.
const EMPTY = join(ROOT, 'leer.git');
mkdirSync(EMPTY, { recursive: true });
execFileSync('git', ['init', '--bare', '--quiet', '--initial-branch=main', EMPTY], { stdio: 'ignore' });
git(EMPTY, ['config', 'uploadpack.allowFilter', 'true']);
const EMPTYSEED = join(ROOT, 'leerseed');
mkdirSync(EMPTYSEED, { recursive: true });
writeFileSync(join(EMPTYSEED, 'README.md'), '# leer\n');
git(EMPTYSEED, ['init', '--quiet', '--initial-branch=main']);
git(EMPTYSEED, ['config', 'user.email', 'gate@example.invalid']);
git(EMPTYSEED, ['config', 'user.name', 'gate']);
git(EMPTYSEED, ['add', '-A']);
git(EMPTYSEED, ['commit', '--quiet', '-m', 'leer']);
git(EMPTYSEED, ['push', '--quiet', remoteUrl(EMPTY), 'HEAD:main']);
const r7 = writer(['--push'], { ARCHIVE_REPO: EMPTY, ARCHIVE_WORK: join(ROOT, 'writer2') });
add('Quellzweig ohne `runs/` ⇒ Abbruch, kein leerer Archiv-Zweig',
  r7.code === 1 && git(EMPTY, ['branch', '--list']).indexOf('archive-') === -1, r7.out.trim().split('\n').pop()?.slice(0, 90));

// ── Quelltext-Verträge: die Regeln, die kein Testlauf erzwingen kann.
const src = execFileSync(process.execPath, ['-e', 'process.stdout.write(require("fs").readFileSync("scripts/archive-runs.mjs","utf8"))'],
  { encoding: 'utf8' });
add('Der Schreiber pusht NIE mit `--force` (der Zweig darf nur wachsen)',
  !/push[^\n]*--force/.test(src) && /'push', '--quiet', 'origin'/.test(src));
add('Er holt den Elter VOR jedem Versuch neu (kein Aufbau auf veraltetem Stand)',
  /for \(let attempt = 1/.test(src) && src.indexOf("'fetch'") > src.indexOf('for (let attempt = 1'));
// Auf den AUFRUF prüfen, nicht auf das Wort: `read-tree` steht als benannte
// Falle im Kopfkommentar — eine Textsuche darüber hätte hier immer rot gemeldet.
add('Er baut Bäume ohne Index (`mktree --missing`) — `read-tree --prefix` lädt Blobs nach',
  /mktree', '--missing'/.test(src) && !/\[\s*'read-tree'/.test(src));
add('Er klont blob-los und ohne Arbeitsverzeichnis',
  /--filter=blob:none/.test(src) && /--no-checkout/.test(src));
add('Er fasst `main` nicht an (kein Push auf den Quellzweig)', !/HEAD:main|:refs\/heads\/main/.test(src));

// ── Ergebnis ───────────────────────────────────────────────────────────────
if (process.env.ARCHIV_KEEP !== '1') rmSync(ROOT, { recursive: true, force: true });
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} Prüfungen bestanden`);
process.exit(failed.length ? 1 : 0);
