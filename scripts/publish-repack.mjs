/**
 * publish-repack.mjs — Ablage der Repack-Bilder (Phase BW-2, `audit/bandbreite.md`).
 *
 * Legt den Inhalt von `data/repack/` in das öffentliche Daten-Repo
 * `buscosun-data` und liefert den Commit-SHA zurück, unter dem die Bilder auf
 * jsDelivr unveränderlich abrufbar sind.
 *
 * ── Warum ein eigenes Repo ─────────────────────────────────────────────────
 * 8 Läufe/Tag × 5,35 MiB wären im Hauptrepo dauerhaftes Wachstum, und Git
 * vergisst nichts. `buscosun-web/.git` liegt bereits bei ~488 MB und wird bei
 * JEDEM Netlify-Build geklont.
 *
 * ── Warum EINE Commit-Historie (Force-Push) ────────────────────────────────
 * Der Plan sah „alte Tags aufräumen" als Retention vor. Das räumt nichts auf:
 * ein gelöschtes Tag lässt die Blobs im Repo, ein Tag HÄLT sie sogar am Leben.
 * 8 Läufe/Tag wären ~15,6 GB/Jahr unwiderruflich in der Historie.
 *
 * Deshalb: jeder Publish baut eine FRISCHE Historie aus zwei Commits und
 * force-pusht sie. Das Repo bleibt konstant bei ~21 MiB (Retention `REPACK_KEEP`
 * Läufe); ältere Objekte werden unerreichbar und von GitHub irgendwann geräumt.
 *
 * Der Preis, ehrlich benannt: ein Client, der noch ein Manifest mit einem alten
 * SHA in der Hand hält, bekommt nach der GitHub-Räumung 404 — und fällt auf den
 * GRIB-Pfad zurück (BW-3). Die KORREKTHEIT hängt am Fallback, nicht am
 * Räumzeitpunkt; die Räumverzögerung ist nur Effizienz. Die Daten sind
 * vollständig aus DWD-Rohdaten reproduzierbar, es geht nichts verloren.
 *
 * ── Warum zwei Commits ─────────────────────────────────────────────────────
 * `index.json` muss den SHA nennen, unter dem die Bilder liegen — den es vor dem
 * Commit nicht gibt. Also: Commit 1 = Bilder (sein SHA wandert ins Manifest),
 * Commit 2 = `index.json`, das auf Commit 1 zeigt. Beide sind von `main` aus
 * erreichbar, jsDelivr löst jeden davon auf. Kein API-Aufruf, kein Rate-Limit,
 * kein Token.
 *
 * ── Was NICHT hier passiert ────────────────────────────────────────────────
 * Das Umlegen des Manifests. Das tun `warm-{wind,grib}.mjs`, und zwar erst,
 * wenn `index.json` den Lauf führt — dieselbe Reihenfolge „erst ablegen, dann
 * umlegen", die die Warm-Crons schon haben.
 *
 * ENV:
 *   REPACK_OUT    Quelle. Default `data/repack`.
 *   REPACK_REPO   Ziel-Remote. Default https://github.com/jppetry/buscosun-data.git
 *   REPACK_WORK   Arbeitsverzeichnis. Default `.cache/repack-repo`.
 *   REPACK_KEEP   Wie viele Läufe im Repo bleiben. Default 4 (= 12 h).
 *
 *   node scripts/publish-repack.mjs          # Probelauf: baut den Baum, pusht NICHT
 *   node scripts/publish-repack.mjs --push   # legt ab
 */

import { execFileSync } from 'node:child_process';
import {
  mkdirSync, rmSync, existsSync, readFileSync, writeFileSync,
  readdirSync, cpSync, statSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RUNS_DIR, HSURF_FILE, CDN_BASE, indexEntry, SCHEMA, purgeIndexUntilFresh } from './lib/repackManifest.mjs';

const OUT_DIR = resolve(process.env.REPACK_OUT || 'data/repack');
const REPO = process.env.REPACK_REPO || 'https://github.com/jppetry/buscosun-data.git';
const WORK = resolve(process.env.REPACK_WORK || '.cache/repack-repo');
const KEEP = Number(process.env.REPACK_KEEP ?? 4);
const TEMPLATE = resolve('scripts/repack-repo');
const PUSH = process.argv.includes('--push');

const log = (...a) => console.log('[publish]', ...a);
const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: WORK, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

/** Vorhandene Lauf-Verzeichnisse eines Baums (neueste zuerst). */
export function runsIn(root) {
  const dir = join(root, RUNS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => /^\d{10}$/.test(n)).sort().reverse();
}

/**
 * Retention: die `keep` neuesten Läufe bleiben, der Rest fliegt.
 * Gibt die entfernten Läufe zurück — Weggelassenes wird GENANNT, nicht
 * stillschweigend gekürzt (V-246-Muster).
 */
export function prune(root, keep = KEEP) {
  const all = runsIn(root);
  const drop = all.slice(keep);
  for (const run of drop) rmSync(join(root, RUNS_DIR, run), { recursive: true, force: true });
  return { kept: all.slice(0, keep), dropped: drop };
}

function dirBytes(root) {
  let n = 0;
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const f = join(p, e.name);
      if (e.isDirectory()) walk(f); else n += statSync(f).size;
    }
  };
  if (existsSync(root)) walk(root);
  return n;
}

async function main() {
  if (!existsSync(join(OUT_DIR, RUNS_DIR))) {
    console.error(`[publish] Keine Producer-Ausgabe in ${OUT_DIR}/${RUNS_DIR} — erst \`npm run repack\`.`);
    process.exit(1);
  }
  const fresh = runsIn(OUT_DIR);
  if (!fresh.length) { console.error('[publish] Keine Läufe gefunden.'); process.exit(1); }
  log(`Lokal produziert: [${fresh.join(', ')}] · Ziel ${REPO} · Retention ${KEEP}`);

  // ── 1. Aktuellen Repo-Stand holen (flach), damit die Retention die ÄLTEREN
  //       Läufe behalten kann, ohne sie neu zu rechnen.
  //
  // ⚠️ DIE gefährlichste Stelle des Skripts. Der Publish ersetzt die Historie
  // per Force-Push — was der Klon nicht mitbringt, ist danach weg. Einen
  // fehlgeschlagenen Klon als „dann eben erster Publish" zu lesen, macht aus
  // einem Netzaussetzer einen DATENVERLUST: das Repo fiele auf den einen frisch
  // gerechneten Lauf zurück, und jeder Client mit einem älteren Manifest liefe
  // still in den GRIB-Fallback.
  //
  // Kein Gedankenspiel — am 2026-08-23 beim zweiten echten Publish passiert:
  //   error: RPC failed; curl 56 Recv failure: Connection was reset
  // Das Skript meldete „erster Publish" und baute einen Baum mit 1 statt 3
  // Läufen; nur weil der Push danach in derselben Störung hängenblieb, ist
  // nichts verloren gegangen.
  //
  // Deshalb wird die Frage „gibt es überhaupt einen Bestand?" GETRENNT und
  // VORHER beantwortet — mit `ls-remote`, das nur die Ref-Liste überträgt und
  // deshalb nicht an derselben Übertragung scheitern kann wie ein Klon.
  let heads = null;
  try {
    heads = execFileSync('git', ['ls-remote', '--heads', REPO],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    console.error(`[publish] \`git ls-remote\` fehlgeschlagen: ${String(e.stderr || e.message).split('\n')[0]}`);
    console.error('[publish] Ob es einen Bestand gibt, ist damit UNBEKANNT — ein Force-Push wäre ein '
      + 'Blindflug. Abbruch ohne Push; der nächste Lauf heilt.');
    return 1;
  }

  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  if (!heads) {
    log('Remote führt keine Zweige → erster Publish.');
  } else {
    let cloned = false, lastErr = '';
    for (let i = 1; i <= 2 && !cloned; i++) {
      try {
        execFileSync('git', ['clone', '--depth=1', '--quiet', REPO, WORK], { stdio: ['ignore', 'pipe', 'pipe'] });
        cloned = true;
      } catch (e) {
        lastErr = String(e.stderr || e.message).split('\n')[0];
        log(`Klon-Versuch ${i}/2 fehlgeschlagen (${lastErr})`);
        rmSync(WORK, { recursive: true, force: true });
        mkdirSync(WORK, { recursive: true });
      }
    }
    if (!cloned) {
      console.error(`[publish] Bestand ist vorhanden (${heads.split('\n').length} Zweig(e)), aber nicht klonbar: ${lastErr}`);
      console.error('[publish] Abbruch OHNE Push — ein Force-Push würde jetzt die vorhandenen Läufe '
        + 'löschen. Der nächste Lauf heilt.');
      return 1;
    }
    log(`Bestand geklont (${(dirBytes(WORK) / 1048576).toFixed(1)} MiB, Läufe [${runsIn(WORK).join(', ')}])`);
  }

  // ── 2. Frische Läufe drüberlegen + lauf-unabhängige Dateien.
  mkdirSync(join(WORK, RUNS_DIR), { recursive: true });
  for (const run of fresh) {
    cpSync(join(OUT_DIR, RUNS_DIR, run), join(WORK, RUNS_DIR, run), { recursive: true });
  }
  const hsurfSrc = join(OUT_DIR, HSURF_FILE);
  if (existsSync(hsurfSrc)) cpSync(hsurfSrc, join(WORK, HSURF_FILE));

  // ── 3. Retention.
  const { kept, dropped } = prune(WORK, KEEP);
  if (dropped.length) log(`Retention: [${dropped.join(', ')}] entfernt, [${kept.join(', ')}] bleiben.`);

  // ── 4. Begleitdateien (Lizenz/Attribution ist Pflicht, nicht Kür) + der
  //       Producer-Workflow des Daten-Repos. Beide werden in `buscosun-web`
  //       gepflegt (`scripts/repack-repo/`) und hier nur ausgelegt — damit sie
  //       reviewbar bleiben, ohne in `buscosun-web/.github/workflows/` zu
  //       landen (STOPP-&-FRAGEN-Zone).
  if (existsSync(TEMPLATE)) {
    cpSync(join(TEMPLATE, 'README.md'), join(WORK, 'README.md'));
    const wfPath = join(WORK, '.github', 'workflows', 'build.yml');
    // ⚠️ Der `GITHUB_TOKEN` einer Action darf Workflow-Dateien NICHT anlegen
    // oder ändern („refusing to allow a GitHub App to create or update workflow
    // file … without `workflows` permission"). Ein Publish aus der Action, der
    // `build.yml` verändert, wird also ABGEWIESEN — und zwar der ganze Push,
    // samt aller Bilder. Deshalb: in der Action wird die Datei nie verändert,
    // sondern die aus dem Klon behalten; die Abweichung wird laut gemeldet,
    // damit der Mensch sie selbst pusht (ein Nutzer-Token darf es).
    const seeded = existsSync(wfPath) ? readFileSync(wfPath) : null;
    mkdirSync(join(WORK, '.github', 'workflows'), { recursive: true });
    cpSync(join(TEMPLATE, 'workflow-build.yml'), wfPath);
    if (process.env.GITHUB_ACTIONS === 'true' && seeded && !seeded.equals(readFileSync(wfPath))) {
      writeFileSync(wfPath, seeded);
      log('⚠ workflow-build.yml weicht vom abgelegten Stand ab. In der Action kann sie nicht '
        + 'gepusht werden (Token darf keine Workflow-Dateien ändern) → alter Stand behalten. '
        + 'Bitte von Hand nach buscosun-data pushen.');
    }
    if (process.env.GITHUB_ACTIONS === 'true' && !seeded) {
      // Erstlauf aus der Action: die Datei anzulegen würde den Push abweisen.
      rmSync(join(WORK, '.github'), { recursive: true, force: true });
      log('⚠ Kein Workflow im Bestand — in der Action wird keiner angelegt (Token-Grenze). '
        + 'Erstablage bitte lokal mit `npm run repack:publish -- --push`.');
    }
  }

  // ── 5. Commit 1: die Bilder. Sein SHA ist der, den das Manifest nennt.
  // Frische Historie: der Bestand wird als NEUER Wurzel-Commit abgelegt, nicht
  // an den geklonten angehängt. Sonst wüchse die Historie um 5,35 MiB je Lauf,
  // für immer — genau das, was die Tag-Retention des Plans NICHT verhindert.
  rmSync(join(WORK, '.git'), { recursive: true, force: true });
  git(['init', '--quiet', '--initial-branch=main']);
  git(['config', 'user.name', 'buscosun-repack[bot]']);
  git(['config', 'user.email', 'repack@users.noreply.github.com']);
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', `data: ICON-D2 repack ${kept[0]} (${kept.length} Läufe)`]);
  const dataSha = git(['rev-parse', 'HEAD']);

  // ── 6. Commit 2: der Index, der auf Commit 1 zeigt.
  const index = {
    schema: SCHEMA,
    commit: dataSha,
    base: CDN_BASE,
    hsurf: existsSync(join(WORK, HSURF_FILE)) ? HSURF_FILE : null,
    publishedAt: new Date().toISOString(),
    source: 'Deutscher Wetterdienst, ICON-D2 (opendata.dwd.de), CC BY 4.0',
    producer: 'buscosun-web/scripts/repack-icon-d2.mjs',
    keep: KEEP,
    runs: kept.map((run) => indexEntry(JSON.parse(readFileSync(join(WORK, RUNS_DIR, run, 'repack.json'), 'utf8')))),
  };
  writeFileSync(join(WORK, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  git(['add', 'index.json']);
  git(['commit', '--quiet', '-m', `index: ${kept[0]} → ${dataSha.slice(0, 7)}`]);
  const headSha = git(['rev-parse', 'HEAD']);

  const bytes = dirBytes(WORK);
  log(`Baum fertig: ${kept.length} Läufe, ${(bytes / 1048576).toFixed(2)} MiB`);
  log(`  Daten-Commit ${dataSha}  ← dieser SHA steht im Manifest`);
  log(`  Index-Commit ${headSha}`);

  if (!PUSH) {
    log('PROBELAUF — nicht gepusht. Mit `--push` ablegen.');
    log(`Prüfen: ${CDN_BASE}@${dataSha}/${RUNS_DIR}/${kept[0]}/wind-000.png`);
    return 0;
  }

  git(['remote', 'add', 'origin', REPO]);
  // Force: die Historie wird bei jedem Publish ersetzt (s. Kopfkommentar).
  git(['push', '--quiet', '--force', 'origin', 'HEAD:main']);
  log(`Abgelegt → ${REPO} (main = ${headSha.slice(0, 7)})`);

  // ── 7. BW-9: den CDN-Index frisch machen, damit der Browser den Lauf JETZT
  //    sieht — nicht erst nach Warm-Cron-Slot und Netlify-Build (§28.4/§28.5 S1).
  //    `REPACK_NO_PURGE=1` lässt es aus (Tests gegen ein fremdes Remote).
  let cdn = { fresh: false, attempts: 0, note: 'Purge übersprungen (REPACK_NO_PURGE=1)' };
  if (process.env.REPACK_NO_PURGE !== '1') {
    cdn = await purgeIndexUntilFresh({ commit: dataSha, log: (m) => log(`  CDN: ${m}`) });
    log(cdn.fresh ? `CDN-Index frisch nach ${cdn.attempts} Purge(s)` : `⚠ CDN-Index NICHT frisch — ${cdn.note}`);
  }

  writeFileSync(join(OUT_DIR, 'published.json'),
    JSON.stringify({ commit: dataSha, head: headSha, base: CDN_BASE, runs: kept, publishedAt: index.publishedAt, cdn }, null, 2) + '\n');
  log(`Notiert → ${join(OUT_DIR, 'published.json')}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((c) => process.exit(c)).catch((e) => { console.error('[publish] FEHLER:', e.message); process.exit(1); });
}
