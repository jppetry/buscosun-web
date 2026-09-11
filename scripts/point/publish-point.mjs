/**
 * publish-point.mjs — legt die Punkt-Linie im Daten-Repo ab (Phase PD-A,
 * `audit/punktdaten-versorgung.md` §17).
 *
 * Schreibt `point/index.json`, `point/sources.json` und `point/calib.json`, setzt die
 * Aufbewahrung durch und committet. **Gepusht wird nur mit `POINT_PUSH=1`.**
 *
 * Das Repo speichert **Wetterdaten** (Jans Entscheidung 2026-09-09). Gelände ist kein
 * Datenprodukt: Höhe kommt aus den Terrarium-Kacheln, die die App ohnehin lädt,
 * Landbedeckung aus `jppetry/buscosun-worldcover`, und die Ableitungen rechnet der
 * Client am Punkt (`src/point/terrainPoint.ts`).
 *
 * ── Warum der Push gegated ist ──────────────────────────────────────────────
 * Der erste Push in Produktion ist Jans Gate (CLAUDE.md: „STOPP & FRAGEN bei
 * Änderungen an Edge Functions/Warm-Crons/Manifest-Mechanik, allem Irreversiblen.
 * Prod-Dispatch der Crons ist Jans Gate."). Ohne die Variable schreibt dieses Skript
 * nur lokal — man kann den kompletten Baum prüfen, bevor irgendetwas nach außen geht.
 *
 * ── Der Fehler, den dieses Skript NICHT wiederholt (V-BW-58) ────────────────
 * `publish-repack.mjs` pusht genau EINMAL ohne Wiederholung, während der Radar-Spiegel
 * im selben Repo alle 1–2 Minuten pusht. Am 2026-09-04 scheiterte der Publish dreimal
 * (10:07, 16:07, 17:32); 09z kam 84 min zu spät, **15z fiel ganz aus**, die Karte stand
 * sechs Stunden auf 12z. Hier wird mit `pull --rebase` dazwischen wiederholt.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        scripts/point/publish-point.mjs --repo=../buscosun-data
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { POINT_DIR, POINT_INDEX_PATH, POINT_SOURCES_PATH, POINT_CALIB_PATH, TIER_BY_ID,
         STATIONS_DIR, stationManifestPath } from '../../src/point/cubeFormat.ts';
import { buildPointIndex, runsToKeep, RETENTION_HOURS, MIN_RUNS, CDN_BASE } from '../../src/point/manifest.ts';
import { buildSourcesJson } from '../../src/point/sourceMatrix.ts';
import { CALIBRATION_V1 } from '../../src/point/calibration.ts';

const args = {};
for (const s of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
  if (m) args[m[1]] = m[2] ?? '1';
}
const REPO = args.repo || process.env.POINT_REPO || 'data/repo';
const POINT_SRC = args.point || process.env.POINT_OUT || 'data/point';
const PUSH = process.env.POINT_PUSH === '1';

const log = (...a) => console.log('[publish-point]', ...a);

function copyTree(from, to) {
  let files = 0, bytes = 0;
  const walk = (rel) => {
    const src = join(from, rel);
    for (const e of readdirSync(src, { withFileTypes: true })) {
      const r = rel ? join(rel, e.name) : e.name;
      if (e.isDirectory()) { walk(r); continue; }
      const dst = join(to, r);
      mkdirSync(dirname(dst), { recursive: true });
      const buf = readFileSync(join(from, r));
      writeFileSync(dst, buf);
      files++; bytes += buf.length;
    }
  };
  if (existsSync(from)) walk('');
  return { files, bytes };
}

function runsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{10}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
}

function dirBytes(dir) {
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else n += statSync(p).size;
    }
  };
  if (existsSync(dir)) walk(dir);
  return n;
}

// --- 1. Baum zusammenstellen -------------------------------------------------
mkdirSync(join(REPO, POINT_DIR), { recursive: true });
const copied = copyTree(POINT_SRC, join(REPO, POINT_DIR));
log(`point/: ${copied.files} Dateien, ${(copied.bytes / 1048576).toFixed(2)} MiB`);


// --- 2. Aufbewahrung ---------------------------------------------------------
// Alter statt Anzahl (Jans Entscheidung 2026-09-09): nur Daten der letzten 24 Stunden,
// quellenunabhaengig. Zeitlose Dateien (Stationskatalog, Register, Kalibrierung)
// sind ausgenommen — s. TIMELESS_PATHS im Manifest-Modul.
const runIdToIso = (r) => `${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6, 8)}T${r.slice(8, 10)}:00:00Z`;
const present = runsIn(join(REPO, POINT_DIR)).map((r) => ({ run: r, runAt: runIdToIso(r) }));
const decision = runsToKeep(present);
for (const r of decision.drop) {
  rmSync(join(REPO, POINT_DIR, r.run), { recursive: true, force: true });
  const ageH = ((Date.now() - Date.parse(r.runAt)) / 3_600_000).toFixed(1);
  log(`Aufbewahrung: ${r.run} entfernt (${ageH} h alt, Grenze ${RETENTION_HOURS} h)`);
}
for (const r of decision.stale) {
  const ageH = ((Date.now() - Date.parse(r.runAt)) / 3_600_000).toFixed(1);
  log(`⚠ ${r.run} ist ${ageH} h alt und bleibt nur wegen des Bodens (min. ${MIN_RUNS} Läufe) — Publishes fallen aus (V-BW-58).`);
}
const kept = runsIn(join(REPO, POINT_DIR));

// ⚠ Das Stationsprodukt liegt unter `point/stations/<lauf>/` und wurde von der
// Schleife oben NICHT erfasst: `runsIn(point/)` nimmt nur Verzeichnisse, die wie ein
// Lauf heißen, und `stations` heißt nicht so. Ohne diese zweite Runde wüchse das
// Produkt unbegrenzt — 6,7 MiB je Lauf, achtmal am Tag. Dieselbe Regel, derselbe
// Boden (MIN_RUNS), und `catalog.json` ist davon nicht betroffen: es ist eine Datei,
// kein Laufverzeichnis, und steht ohnehin in TIMELESS_PATHS.
const stationsRoot = join(REPO, STATIONS_DIR);
const stPresent = runsIn(stationsRoot).map((r) => ({ run: r, runAt: runIdToIso(r) }));
const stDecision = runsToKeep(stPresent);
for (const r of stDecision.drop) {
  rmSync(join(stationsRoot, r.run), { recursive: true, force: true });
  log(`Aufbewahrung stations/: ${r.run} entfernt (${((Date.now() - Date.parse(r.runAt)) / 3_600_000).toFixed(1)} h alt)`);
}
for (const r of stDecision.stale) {
  log(`⚠ stations/${r.run} ist ${((Date.now() - Date.parse(r.runAt)) / 3_600_000).toFixed(1)} h alt und bleibt nur wegen des Bodens (min. ${MIN_RUNS} Läufe) — ein überalteter Lauf wird BENANNT, nicht verschwiegen.`);
}
const stKept = runsIn(stationsRoot);
const stationRuns = stKept.map((run) => {
  const mp = join(REPO, stationManifestPath(run));
  const m = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : null;
  return {
    run, runAt: m?.runAt ?? null, ageH: m?.ageH ?? null,
    path: `${STATIONS_DIR}/${run}`,
    manifest: stationManifestPath(run),
    stationCount: m?.stationCount ?? null,
    leadHours: m?.axis?.leadHours?.length ?? null,
    bytes: dirBytes(join(stationsRoot, run)),
  };
});
log(`stations/: ${stationRuns.length} Lauf/Läufe, ${(stationRuns.reduce((n, r) => n + r.bytes, 0) / 1048576).toFixed(2)} MiB`);

// --- 3. Manifeste ------------------------------------------------------------
const runEntries = kept.map((run) => {
  const manPath = join(REPO, POINT_DIR, run, 'run.json');
  const man = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : null;
  return {
    run,
    runAt: man?.runAt ?? null,
    path: `${POINT_DIR}/${run}`,
    tiers: man?.tiers?.map((t) => t.id) ?? [],
    sources: man?.sources?.map((s) => s.id) ?? [],
    bytes: dirBytes(join(REPO, POINT_DIR, run)),
  };
});

const write = (rel, obj) => {
  const p = join(REPO, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
  return statSync(p).size;
};

// `commit: null` — der SHA ist erst NACH dem Commit bekannt. Ein Manifest, das einen
// Commit behauptet, den es nicht gibt, wäre schlimmer als eines ohne (BW-2).
write(POINT_SOURCES_PATH, buildSourcesJson());
write(POINT_CALIB_PATH, CALIBRATION_V1);
write(POINT_INDEX_PATH, buildPointIndex({
  commit: null,
  publishedAt: new Date().toISOString(),
  runs: runEntries,
  stationRuns,
}));

// ── Kein Chunk ohne Manifesteintrag ─────────────────────────────────────────
// Die stille Variante von „ein Chunk ohne sein Manifest ist Zahlensalat": eine Datei
// liegt da, aber kein Manifest nennt sie — der Client findet sie nie, das Repo trägt
// sie trotzdem. Am 2026-09-09 real passiert (drei Prozesse, drei Manifeste, das letzte
// gewann; zwölf t3-Chunks verwaist). Deshalb wird hier gezählt, nicht vertraut.
for (const run of kept) {
  const manPath = join(REPO, POINT_DIR, run, 'run.json');
  if (!existsSync(manPath)) {
    console.error(`[publish-point] ${run}: kein run.json — die Chunks wären unlesbar. Abbruch.`);
    process.exit(1);
  }
  const man = JSON.parse(readFileSync(manPath, 'utf8'));
  const listed = new Set((man.tiers ?? []).flatMap((t) => (t.files ?? []).map((f) => f.file)));
  const onDisk = [];
  const walkRun = (rel) => {
    const abs = join(REPO, POINT_DIR, run, rel);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walkRun(r);
      else if (e.name.endsWith('.bin')) onDisk.push(`${POINT_DIR}/${run}/${r}`);
    }
  };
  walkRun('');
  const orphan = onDisk.filter((f) => !listed.has(f));
  const missing = [...listed].filter((f) => !existsSync(join(REPO, f)));
  if (orphan.length || missing.length) {
    console.error(`[publish-point] ${run}: ${orphan.length} Chunk(s) ohne Manifesteintrag, `
      + `${missing.length} Eintrag/Einträge ohne Datei. Abbruch.`);
    if (orphan.length) console.error(`  verwaist: ${orphan.slice(0, 4).join(' ')}${orphan.length > 4 ? ' …' : ''}`);
    if (missing.length) console.error(`  fehlend:  ${missing.slice(0, 4).join(' ')}${missing.length > 4 ? ' …' : ''}`);
    process.exit(1);
  }
  log(`${run}: ${onDisk.length} Chunks, alle im Manifest`);
}

log(`Läufe im Repo: ${kept.join(', ') || '—'}`);
for (const r of runEntries) log(`  ${r.run}: ${(r.bytes / 1048576).toFixed(2)} MiB, Stufen ${r.tiers.join('+') || '—'}, Quellen ${r.sources.join('+') || '—'}`);

// --- 4. Commit und Push ------------------------------------------------------
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim();

if (!existsSync(join(REPO, '.git'))) {
  log('Kein Git-Repo unter --repo — es wurde nur der Baum geschrieben.');
  process.exit(0);
}

// `.gitattributes`: die Chunks sind BINÄR. Auf einer Windows-Arbeitskopie mit
// `core.autocrlf=true` würde Git in einer Datei, die es für Text hält, jedes 0x0A zu
// 0x0D0A machen — der Chunk käme still verfälscht zurück, und der CRC im Kopf fiele
// erst beim Lesen auf. Git erkennt Binärdateien meist selbst; „meist" reicht hier nicht.
const attrPath = join(REPO, '.gitattributes');
const attrWant = `# PD-A: Punkt-Chunks sind binaer — NIE Zeilenenden anfassen.
*.bin -text -diff
`;
if (!existsSync(attrPath) || !readFileSync(attrPath, 'utf8').includes('*.bin -text')) {
  writeFileSync(attrPath, (existsSync(attrPath) ? readFileSync(attrPath, 'utf8') : '') + attrWant);
  log('.gitattributes um `*.bin -text` ergänzt');
}

// Nur Pfade übergeben, die es GIBT: `git add -A <fehlender Pfad>` bricht mit
// `fatal: pathspec … did not match any files` ab und tötete damit jeden Lauf, in dem
// ein optionales Verzeichnis fehlt.
const addPaths = [POINT_DIR, '.gitattributes'].filter((p) => existsSync(join(REPO, p)));

// ── Der stille Fall, der Stunden kosten würde ──────────────────────────────
// In einem SPARSE Checkout meldet `git add` für Pfade außerhalb der Muster:
//   „paths … exist outside of your sparse-checkout definition, so will not be
//    updated in the index"
// — und beendet sich mit **Exit 0**. Ein Lauf rechnete dann stundenlang und
// committete nichts, ohne dass irgendwo ein Fehler stünde. Deshalb wird die
// Bedingung hier NAMENTLICH geprüft, bevor irgendetwas geschrieben wird.
const sparse = (() => {
  try { return git('config', '--get', 'core.sparseCheckout') === 'true'; } catch { return false; }
})();
if (sparse) {
  let patterns = [];
  try { patterns = git('sparse-checkout', 'list').split(/\r?\n/).map((s) => s.trim()).filter(Boolean); } catch { /* ältere Git-Version */ }
  const covered = (p) => patterns.some((pat) => pat === p || pat === `/${p}` || pat.startsWith(`${p}/`) || p.startsWith(pat.replace(/^\//, '')));
  const uncovered = addPaths.filter((p) => !covered(p));
  if (uncovered.length) {
    console.error(`[publish-point] Sparse Checkout deckt ${uncovered.join(', ')} nicht ab — `
      + `git würde diese Dateien STILL verwerfen (Exit 0, kein Fehler).`);
    console.error(`[publish-point] Kur: im Job vorher \`git sparse-checkout add ${uncovered.join(' ')}\`.`);
    console.error(`[publish-point] Aktuelle Muster: ${patterns.join(' ') || '(keine)'}`);
    process.exit(1);
  }
}

git('add', '-A', ...addPaths);
const status = git('status', '--porcelain');
if (!status) {
  // ── Nichts NEUES heisst nicht: nichts zu TUN ────────────────────────────────
  // Der uebliche Ablauf ist Probelauf ohne `POINT_PUSH`, Baum ansehen, dann mit
  // `POINT_PUSH=1` erneut. Beim zweiten Lauf gibt es aber nichts mehr zu committen —
  // und ein `exit 0` an dieser Stelle hiesse, dass der Schalter NIE feuern kann.
  // Deshalb: liegen fertige Commits vor origin/main, wird gepusht statt ausgestiegen.
  let ahead = 0;
  try {
    execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: REPO, stdio: 'pipe' });
    ahead = Number(git('rev-list', '--count', 'origin/main..HEAD')) || 0;
  } catch { /* kein Remote erreichbar — dann bleibt es beim Aussteigen */ }
  if (!(ahead > 0 && PUSH)) {
    log(ahead > 0
      ? `Nichts Neues zu committen; ${ahead} Commit(s) warten auf den Push (POINT_PUSH=1).`
      : 'Nichts zu committen.');
    process.exit(0);
  }
  log(`Nichts Neues zu committen, aber ${ahead} Commit(s) liegen vor origin/main ⇒ nur pushen.`);
}

const msg = `data(point): ${kept[0] ?? 'leer'}`;
if (status) {
  // Gegenprobe am Index statt am Vertrauen: was wir geschrieben haben, muss auch
  // vorgemerkt sein. Ein `git add`, das nichts vormerkt, ist hier ein Fehler.
  const staged = git('diff', '--cached', '--name-only').split(/\r?\n/).filter(Boolean);
  if (copied.files && !staged.some((f) => f.startsWith(`${POINT_DIR}/`))) {
    console.error('[publish-point] Punktdaten geschrieben, aber keine im Index — Abbruch.');
    process.exit(1);
  }

  git('commit', '-m', msg);
  log(`Datencommit ${git('rev-parse', '--short', 'HEAD')} — ${msg}`);
}

// V-BW-58: mehrere Versuche mit Rebase dazwischen, statt EINEM Versuch.
async function pushWithRetry(what) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      execFileSync('git', ['push', 'origin', 'main'], { cwd: REPO, stdio: 'inherit' });
      log(`Push (${what}) in Versuch ${attempt} gelungen.`);
      return true;
    } catch {
      log(`Versuch ${attempt} (${what}) scheiterte — rebase und erneut.`);
      try { execFileSync('git', ['pull', '--rebase', '--autostash', 'origin', 'main'], { cwd: REPO, stdio: 'inherit' }); } catch { /* weiter */ }
      await new Promise((r) => setTimeout(r, attempt * 15_000));
    }
  }
  return false;
}

if (!PUSH) {
  log('POINT_PUSH ist nicht gesetzt ⇒ NICHT gepusht. Der erste Push in Produktion ist Jans Gate.');
  process.exit(0);
}

// ── Erst pushen, DANN den SHA nennen ──────────────────────────────────────────
//
// Zwei Commits statt `--amend` war richtig, aber nicht genug. Am 2026-09-09 hat der
// erste echte Push die Lücke gezeigt: der Push wurde abgewiesen (der Radar-Spiegel war
// schneller), die Wiederholung rebasete — und ein Rebase schreibt **jeden** eigenen
// Commit neu. Das Manifest nannte danach `bcaeef5`, im Repo stand `fbdd1c3`; jede auf
// den SHA gepinnte CDN-URL war ein 404 (nachgemessen: jsDelivr antwortete mit 404,
// während `@main` byte-gleich auslieferte).
//
// **Ein SHA ist erst unveränderlich, wenn er auf dem Remote steht.** Also: Datencommit
// pushen, DANN seinen — jetzt endgültigen — SHA lesen, DANN das Manifest schreiben und
// ein zweites Mal pushen. Wird dieser zweite Commit rebaset, macht das nichts: er nennt
// nur, er wird nicht genannt.
if (!await pushWithRetry('Daten')) {
  console.error('[publish-point] Push nach 5 Versuchen gescheitert (V-BW-58).'); process.exit(1);
}
const sha = git('rev-parse', 'HEAD');

const idx = JSON.parse(readFileSync(join(REPO, POINT_INDEX_PATH), 'utf8'));
if (idx.commit !== sha) {
  idx.commit = sha;
  write(POINT_INDEX_PATH, idx);
  git('add', POINT_INDEX_PATH);
  git('commit', '-m', `${msg} (Manifest → ${sha.slice(0, 7)})`);
  if (!await pushWithRetry('Manifest')) {
    console.error(`[publish-point] Daten stehen (${sha.slice(0, 7)}), aber das Manifest kam nicht durch. `
      + 'index.json nennt jetzt einen falschen Commit — nächster Lauf heilt es.'); process.exit(1);
  }
  log(`Manifest ${git('rev-parse', '--short', 'HEAD')} nennt Daten ${sha.slice(0, 7)}`);
}

// Gegenprobe: der genannte Commit muss auf dem Remote existieren UND die Daten tragen.
// Ohne sie wäre der Fehler von oben wieder unsichtbar.
try {
  execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: REPO, stdio: 'pipe' });
  execFileSync('git', ['cat-file', '-e', `${sha}:${POINT_DIR}/${kept[0]}/run.json`], { cwd: REPO, stdio: 'pipe' });
  const onRemote = git('branch', '--remotes', '--contains', sha).includes('origin/main');
  if (!onRemote) throw new Error('nicht auf origin/main');
  log(`Der genannte Commit ${sha.slice(0, 7)} steht auf origin/main und trägt das Lauf-Manifest.`);
} catch (e) {
  console.error(`[publish-point] ⚠ index.json nennt ${sha.slice(0, 7)}, aber der Commit trägt die Daten `
    + `nicht oder steht nicht auf origin/main (${e.message}). Auf den SHA gepinnte CDN-URLs wären 404.`);
  process.exit(1);
}

// ── Ist der Push auch angekommen? ──────────────────────────────────────────────
//
// Ein gelungener `git push` beweist NICHT, dass die Daten im Repo stehen bleiben.
// `publish-repack.mjs` klont das Daten-Repo flach, wirft `.git` weg, legt einen neuen
// Wurzel-Commit an und **force-pusht** ihn auf `main` — achtmal am Tag. Alles, was
// zwischen seinem Klon und seinem Force-Push hier ankommt, ist danach spurlos weg:
// kein Konflikt, keine Fehlermeldung, der Commit existiert einfach nicht mehr.
// (Dieselbe Lage kennt der Radar-Spiegel; daher die Regel „nie ins Publish-Fenster".)
//
// Deshalb wird nachgesehen statt geglaubt. Das Fenster ist kurz (~20 s je Repack-Lauf),
// die Prüfung billig, und ein Fehlschlag muss LAUT sein — sonst zeigt `index.json` auf
// Chunks, die es am CDN nie gab.
const manRel = `${POINT_DIR}/${kept[0]}/run.json`;
let landed = false;
try {
  execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: REPO, stdio: 'inherit' });
  for (const rel of [POINT_INDEX_PATH, manRel]) {
    execFileSync('git', ['cat-file', '-e', `origin/main:${rel}`], { cwd: REPO, stdio: 'pipe' });
  }
  landed = true;
  log(`Nachgesehen: ${POINT_INDEX_PATH} und ${manRel} stehen auf origin/main.`);
} catch {
  console.error('[publish-point] ⚠ Der Push ist gelungen, aber die Dateien stehen NICHT auf '
    + 'origin/main. Wahrscheinlichste Ursache: ein Force-Push der Kartenlinie hat dazwischen '
    + 'die Historie ersetzt (publish-repack.mjs, 8×/Tag). Der nächste Punkt-Lauf heilt es; '
    + 'sofort heilen geht mit einem erneuten `npm run point:publish -- --repo=… POINT_PUSH=1`.');
}

// Frische am CDN: den Index purgen und nachprüfen (Muster aus publish-repack.mjs).
// Nur wenn die Dateien wirklich auf origin/main stehen — einen Index zu purgen, den es
// dort nicht gibt, hieße die alte Fassung durch eine 404 zu ersetzen.
if (landed) {
  const purge = `${CDN_BASE}@main/${POINT_INDEX_PATH}`.replace('https://cdn.jsdelivr.net/', 'https://purge.jsdelivr.net/');
  try {
    const r = await fetch(purge);
    log(`jsDelivr-Purge: ${r.status}`);
  } catch (e) {
    log(`Purge fehlgeschlagen (${e.message}) — nicht fatal, das CDN holt spätestens nach 12 h nach.`);
  }
} else {
  log('Kein Purge — es gäbe nichts Frisches zu holen.');
}
log(`Fertig. Stufen: ${Object.keys(TIER_BY_ID).join(', ')}${landed ? '' : ' (⚠ NICHT auf origin/main)'}`);
process.exit(landed ? 0 : 1);
