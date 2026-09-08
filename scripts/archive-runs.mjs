/**
 * archive-runs.mjs — Monatsarchiv der Repack-Läufe (Phase AR1, `audit/daten-archiv.md`).
 *
 * Legt jeden Lauf, der auf `main` erscheint, zusätzlich auf einen Monatszweig
 * `archive-YYYYMM` desselben Repos — und zwar SO, dass die Daten dort exakt
 * liegen wie auf `main`: `runs/<lauf>/<familie>-<schritt>.png`, dieselben
 * Pfade, dieselben Bytes, dieselben Blob-OIDs.
 *
 * ── Warum überhaupt ────────────────────────────────────────────────────────
 * `main` hält 4 Läufe (12 h) und wird alle 3 h per Force-Push ERSETZT. Das ist
 * heute folgenlos, weil ein verlorener Lauf aus DWD-Rohdaten neu gerechnet
 * werden kann. Für ein Archiv gilt das NICHT: opendata.dwd.de hält nur ein
 * rollierendes 24-h-Fenster — was hier verloren geht, ist endgültig weg.
 *
 * ── Warum ein eigener Zweig statt mehr Retention auf `main` ────────────────
 * Ein Monat auf `main` hieße: der Schreiber, der alle 3 h die ganze Historie
 * ersetzt und am 2026-09-04 dreimal gescheitert ist (V-BW-58), hielte auch die
 * einzige Kopie unwiederbringlicher Daten. Ein Force-Push-Fehler kostete dann
 * einen Monat statt 12 Stunden. Der Monatszweig wird dagegen NUR ANGEHÄNGT und
 * nie force-gepusht; `publish-repack.mjs` kann ihn strukturell nicht anfassen.
 *
 * ── Warum das nichts kostet ────────────────────────────────────────────────
 * Der Schreiber lädt KEINE Bilddatei. Ein Lauf ist auf `main` ein Unterbaum mit
 * eigener Objekt-ID; wer sie kennt, hängt sie in einen neuen Baum, ohne je eine
 * Datei gesehen zu haben. Gemessen (`probe-archive-branch.mjs`, 15/15): Klon
 * 0,03 statt 3,00 MB, Push +0 KB. Beide Zweige teilen sich die Blobs — GitHub
 * speichert sie einmal.
 *
 * Zwei gemessene Fallen, die der Weg umgeht (AR0 §3):
 *   · Ein Klon über einen PFAD nimmt Gits lokalen Kurzweg und kopiert das ganze
 *     Objektlager — `--filter=blob:none` bleibt wirkungslos. Nur `file://`
 *     bzw. `https://` verhandeln wirklich. Deshalb `remoteUrl()`.
 *   · `git read-tree --prefix` zieht die Blobs des Unterbaums nach (+3,01 MB
 *     von 3,00 MB Inhalt). Deshalb wird der Baum ohne Index gebaut, direkt mit
 *     `git mktree --missing`.
 *
 * ── Was dieses Skript NICHT tut ────────────────────────────────────────────
 * Es fasst `main` nicht an: kein Push dorthin, keine Änderung an Retention,
 * Manifest, Index oder Publisher. Es rechnet auch nichts — es archiviert nur,
 * was der Producer ohnehin abgelegt hat. Fällt es aus, merkt der Client nichts;
 * es verliert nur Läufe, die `main` inzwischen fallen gelassen hat (12 h Puffer).
 *
 * ENV:
 *   ARCHIVE_REPO     Remote. Default https://github.com/jppetry/buscosun-data.git
 *   ARCHIVE_SOURCE   Quellzweig. Default `main`.
 *   ARCHIVE_PREFIX   Zweig-Präfix. Default `archive-` (→ `archive-202609`).
 *   ARCHIVE_WORK     Arbeitsverzeichnis. Default `.cache/archive-repo`.
 *   ARCHIVE_ROOT_FILES  Wurzeldateien, die mitwandern. Default `hsurf-v1.png`.
 *
 *   node scripts/archive-runs.mjs           # Probelauf: plant, pusht NICHT
 *   node scripts/archive-runs.mjs --push    # hängt an
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.env.ARCHIVE_REPO || 'https://github.com/jppetry/buscosun-data.git';
const SOURCE = process.env.ARCHIVE_SOURCE || 'main';
const PREFIX = process.env.ARCHIVE_PREFIX || 'archive-';
const WORK = resolve(process.env.ARCHIVE_WORK || '.cache/archive-repo');
const ROOT_FILES = (process.env.ARCHIVE_ROOT_FILES ?? 'hsurf-v1.png').split(',').map((s) => s.trim()).filter(Boolean);
const PUSH = process.argv.includes('--push');
const PUSH_RETRIES = 4;

const log = (...a) => console.log('[archiv]', ...a);
const git = (args, opts = {}) =>
  execFileSync('git', args, {
    cwd: WORK, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...opts,
  }).trim();

/**
 * Ein lokaler Pfad als Remote wird zu `file://`.
 *
 * Nicht Kosmetik: bei einem Pfad umgeht Git den Transport, hardlinkt das ganze
 * Objektlager und ignoriert `--filter` — der Klon zöge alle Bilder. Gemessen in
 * AR0 §3 (3,03 statt 0,03 MB). Betrifft nur Tests und lokale Bare-Repos;
 * `https://`-Remotes bleiben unverändert.
 */
export function remoteUrl(repo) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(repo) || /^[^/]+@[^:]+:/.test(repo)) return repo;
  return existsSync(repo) ? pathToFileURL(resolve(repo)).href : repo;
}

/** Monatszweig eines Laufs: `2026090718` → `archive-202609`. */
export function monthOf(run, prefix = PREFIX) {
  if (!/^\d{10}$/.test(run)) throw new Error(`Kein Lauf-Bezeichner: ${run}`);
  return `${prefix}${run.slice(0, 6)}`;
}

/**
 * Zusammenführen: vorhandene Archiv-Einträge + neue Läufe, nach Namen sortiert
 * (Git verlangt sortierte Baum-Einträge).
 *
 * REGEL: ein bereits archivierter Lauf wird NIE überschrieben. Läge derselbe
 * Lauf auf `main` mit anderer OID (Neu-Rechnung nach einem Nachtrag), gewönne
 * sonst die spätere Fassung — und die alte wäre unwiederbringlich weg. Das
 * Archiv ist ein Gedächtnis, kein Spiegel: wer zuerst da war, bleibt.
 */
export function mergeRuns(existing, incoming) {
  const out = new Map();
  for (const e of existing) out.set(e.name, e);
  const added = [], skipped = [], conflicts = [];
  for (const e of incoming) {
    const have = out.get(e.name);
    if (!have) { out.set(e.name, e); added.push(e.name); continue; }
    if (have.sha !== e.sha) conflicts.push(e.name); else skipped.push(e.name);
  }
  return {
    entries: [...out.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    added, skipped, conflicts,
  };
}

/**
 * Verlustwächter: der neue Baum MUSS jeden Eintrag des alten unverändert
 * enthalten. Ein Archiv, das schrumpft, ist ein Fehler — kein Ergebnis.
 * Rückgabe: Liste der verlorenen/veränderten Namen (leer = in Ordnung).
 */
export function lostEntries(before, after) {
  const now = new Map(after.map((e) => [e.name, e.sha]));
  return before.filter((e) => now.get(e.name) !== e.sha).map((e) => e.name);
}

/** Einträge eines Baums lesen — liest NUR Baum-Objekte, nie Blobs. */
function treeEntries(ref) {
  let out = '';
  try { out = git(['ls-tree', ref]); } catch { return []; }
  if (!out) return [];
  return out.split('\n').map((l) => {
    const [meta, name] = l.split('\t');
    const [mode, type, sha] = meta.split(/\s+/);
    return { mode, type, sha, name };
  });
}

/** Baum aus Einträgen schreiben, ohne Index und ohne die Objekte anzufassen. */
function mktree(entries) {
  const input = entries.map((e) => `${e.mode} ${e.type} ${e.sha}\t${e.name}`).join('\n') + '\n';
  return execFileSync('git', ['mktree', '--missing'],
    { cwd: WORK, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function dirBytes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return n;
}

async function main() {
  const url = remoteUrl(REPO);
  log(`Quelle ${url} · Zweig ${SOURCE} · Präfix ${PREFIX}${PUSH ? '' : ' · PROBELAUF'}`);

  // ── 1. Erst fragen, dann handeln (Muster aus publish-repack.mjs §1).
  // `ls-remote` überträgt nur die Ref-Liste. Scheitert es, ist der Zustand des
  // Remotes UNBEKANNT — dann wird nichts gepusht, statt auf Verdacht.
  let heads;
  try {
    heads = execFileSync('git', ['ls-remote', '--heads', url],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
  } catch (e) {
    console.error(`[archiv] \`git ls-remote\` fehlgeschlagen: ${String(e.stderr || e.message).split('\n')[0]}`);
    console.error('[archiv] Zustand des Remotes unbekannt — Abbruch ohne Push. Der nächste Lauf heilt.');
    return 1;
  }
  const branches = new Set(heads.split('\n').filter(Boolean).map((l) => l.split('refs/heads/')[1]));
  if (!branches.has(SOURCE)) {
    console.error(`[archiv] Quellzweig \`${SOURCE}\` existiert am Remote nicht — Abbruch.`);
    return 1;
  }

  // ── 2. Blob-loser Klon: Bäume ja, Bilder nein.
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  execFileSync('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', '--depth=1',
    '--branch', SOURCE, url, WORK], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  git(['config', 'user.name', 'buscosun-archive[bot]']);
  git(['config', 'user.email', 'archive@users.noreply.github.com']);
  const cloneMb = (dirBytes(join(WORK, '.git')) / 1048576).toFixed(2);

  // ── 3. Was liegt auf der Quelle?
  const sourceRuns = treeEntries(`origin/${SOURCE}:runs`).filter((e) => e.type === 'tree' && /^\d{10}$/.test(e.name));
  if (!sourceRuns.length) {
    console.error(`[archiv] \`${SOURCE}\` führt keine Läufe unter runs/ — Abbruch (nichts zu archivieren).`);
    return 1;
  }
  const rootEntries = treeEntries(`origin/${SOURCE}`);
  const carry = rootEntries.filter((e) => ROOT_FILES.includes(e.name));
  log(`Klon ${cloneMb} MB · ${SOURCE} führt [${sourceRuns.map((r) => r.name).join(', ')}]`
    + (carry.length ? ` · Wurzeldateien [${carry.map((c) => c.name).join(', ')}]` : ''));

  // ── 4. Nach Monatszweig gruppieren (ein Lauf-Satz kann einen Monatswechsel
  //      überspannen — 2026093021 und 2026100100 liegen dann in zwei Zweigen).
  const byMonth = new Map();
  for (const run of sourceRuns) {
    const b = monthOf(run.name);
    if (!byMonth.has(b)) byMonth.set(b, []);
    byMonth.get(b).push(run);
  }

  let pushed = 0, planned = 0;
  for (const [branch, runs] of [...byMonth.entries()].sort()) {
    let ok = false, lastErr = '';
    for (let attempt = 1; attempt <= PUSH_RETRIES && !ok; attempt++) {
      // Vor JEDEM Versuch den Zweig frisch holen: zwischen zwei Versuchen kann
      // ein anderer Lauf gepusht haben. Wer auf einem veralteten Elter aufbaut,
      // würde dessen Läufe beim Push überschreiben — der Grund, weshalb hier
      // NIE mit `--force` gearbeitet wird.
      let parent = '';
      if (branches.has(branch) || attempt > 1) {
        try {
          git(['fetch', '--quiet', '--filter=blob:none', '--depth=1', 'origin', `${branch}:refs/remotes/origin/${branch}`, '--force']);
          parent = git(['rev-parse', `origin/${branch}`]);
        } catch { parent = ''; }
      }
      const existing = parent ? treeEntries(`${parent}:runs`) : [];
      const { entries, added, skipped, conflicts } = mergeRuns(existing, runs);

      if (conflicts.length) {
        // Derselbe Lauf, andere Bytes. Das Archiv behält die erste Fassung; der
        // Fall wird GENANNT, nicht stillschweigend geschluckt (V-246-Muster).
        log(`⚠ ${branch}: ${conflicts.length} Lauf/Läufe liegen bereits mit anderen Bytes vor `
          + `[${conflicts.join(', ')}] — die archivierte Fassung bleibt.`);
      }
      if (!added.length) {
        log(`${branch}: nichts Neues (${skipped.length} Lauf/Läufe bereits archiviert) — kein Commit.`);
        ok = true; break;
      }
      planned += added.length;

      const runsTree = mktree(entries);
      const root = [{ mode: '040000', type: 'tree', sha: runsTree, name: 'runs' }, ...carry]
        .sort((a, b) => (a.name < b.name ? -1 : 1));
      const treeSha = mktree(root);

      // Verlustwächter VOR dem Push, gegen den frisch geholten Elter.
      const lost = lostEntries(existing, treeEntries(`${treeSha}:runs`));
      if (lost.length) {
        console.error(`[archiv] ${branch}: der neue Baum verlöre [${lost.join(', ')}] — Abbruch ohne Push.`);
        return 1;
      }

      const commitArgs = ['commit-tree', treeSha, '-m',
        `archive: +${added.join(' +')} (${entries.length} Läufe im Monat)`];
      if (parent) commitArgs.splice(2, 0, '-p', parent);
      const commit = git(commitArgs);

      if (!PUSH) {
        log(`${branch}: PROBELAUF — würde [${added.join(', ')}] anhängen `
          + `(${entries.length} Läufe, Commit ${commit.slice(0, 7)}, Elter ${parent ? parent.slice(0, 7) : 'keiner'}).`);
        ok = true; break;
      }
      try {
        // Ohne `--force`: ein zwischenzeitlicher Push lässt diesen hier
        // abprallen, statt ihn zu überschreiben. Der Versuch beginnt dann neu.
        git(['push', '--quiet', 'origin', `${commit}:refs/heads/${branch}`]);
        log(`${branch}: [${added.join(', ')}] angehängt → ${commit.slice(0, 7)} (${entries.length} Läufe)`
          + (attempt > 1 ? ` · Versuch ${attempt}` : ''));
        branches.add(branch);
        pushed += added.length;
        ok = true;
      } catch (e) {
        lastErr = String(e.stderr || e.message).split('\n').filter(Boolean).slice(-1)[0] || 'unbekannt';
        log(`${branch}: Push-Versuch ${attempt}/${PUSH_RETRIES} abgewiesen (${lastErr})`);
      }
    }
    if (!ok) {
      console.error(`[archiv] ${branch}: nach ${PUSH_RETRIES} Versuchen nicht abgelegt (${lastErr}). `
        + 'Kein Datenverlust — die Läufe liegen noch auf der Quelle; der nächste Lauf holt sie nach.');
      return 1;
    }
  }

  const endMb = (dirBytes(join(WORK, '.git')) / 1048576).toFixed(2);
  log(PUSH
    ? `Fertig: ${pushed} Lauf/Läufe archiviert · Arbeitskopie ${endMb} MB (keine Bilddatei geladen)`
    : `Probelauf beendet: ${planned} Lauf/Läufe wären angehängt worden · Arbeitskopie ${endMb} MB`);
  return 0;
}

// Nur ausführen, wenn direkt gestartet — der Verifier importiert die reinen Teile.
const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  main().then((code) => process.exit(code), (e) => {
    console.error(`[archiv] Abbruch: ${String(e.stderr || e.message).split('\n')[0]}`);
    process.exit(1);
  });
}
