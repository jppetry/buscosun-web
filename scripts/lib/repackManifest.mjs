/**
 * repackManifest.mjs — die EINE Stelle, die den `repack`-Abschnitt formt
 * (Phase BW-2, `audit/bandbreite.md`).
 *
 * Drei Seiten müssen sich über die Form einig sein:
 *   • `scripts/publish-repack.mjs`  schreibt `index.json` ins Daten-Repo,
 *   • `scripts/warm-{wind,grib}.mjs` schreiben den Abschnitt ins Manifest,
 *   • der Client (BW-3) liest ihn und baut daraus URLs.
 * Dieselbe Bewegung wie bei `tempFrameBuild.ts` in BW-1: ein Modul statt drei
 * gleich gemeinter Kopien. `verify:repack` prüft die Form gegen dieses Modul.
 *
 * ── Warum der COMMIT und kein Tag ──────────────────────────────────────────
 * Der Plan sah ein Tag je Lauf vor. Gemessen am 2026-08-23 gegen jsDelivr:
 *
 *   Branch-Ref     `…@main/…`   → `max-age=604800, s-maxage=43200`
 *   Unveränderlich `…@<sha>/…`  → `max-age=31536000, immutable`
 *
 * Ein Commit-SHA ist bereits unveränderlich — er braucht kein Tag, kein
 * Aufräumen von Alt-Tags, und er kann keine alten Objekte am Leben halten
 * (siehe Retention in `publish-repack.mjs`). Das Tag wäre reine Zeremonie
 * gewesen; der SHA leistet dasselbe mit weniger Mechanik.
 *
 * ── Warum die Frische NUR den Cron trifft ──────────────────────────────────
 * `index.json` wird über `raw.githubusercontent.com` gelesen — von den
 * Warm-Crons, nicht vom Browser. Der Browser sieht ausschließlich
 * SHA-adressierte URLs aus dem Manifest. Die 12-h-Cache-Falle der Branch-Refs
 * kann den Client damit gar nicht erreichen.
 *
 * ── Die Anti-Drift-Regel ───────────────────────────────────────────────────
 * `repack.run === manifest.run`, sonst KEIN Abschnitt. Ein Manifest darf auf
 * einen neuen DWD-Lauf umlegen, bevor der Producer ihn gerechnet hat — dann
 * fehlt der Abschnitt und der Client nimmt GRIB. Was NIE passieren darf: das
 * Manifest nennt Lauf X und der Abschnitt zeigt auf die Bilder von Lauf X−1.
 * Das wäre eine stille Falschaussage über die Gültigkeitszeit jedes Frames.
 */

/** Basis des Daten-CDNs. Bewusst eine Konstante: ein Wechsel (R2, eigene
 *  Domain) ist damit ein Ein-Zeilen-Diff, kein Umbau — s. Risiko-Tabelle. */
export const CDN_BASE = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data';
/** Index des Daten-Repos, gelesen SERVERSEITIG (Cron), nie vom Browser. */
export const INDEX_URL = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/index.json';
/** Verzeichnis der Läufe im Daten-Repo. */
export const RUNS_DIR = 'runs';
/** Lauf-unabhängige Orographie: an drei Läufen gemessen identisch (BW-1, §20.2),
 *  liegt deshalb im Wurzelverzeichnis statt in jedem Lauf. */
export const HSURF_FILE = 'hsurf-v1.png';

export const SCHEMA = 1;

/** URL einer Schritt-Datei. DIE Regel — nirgends sonst zusammensetzen. */
export function stepUrl(section, file) {
  return `${section.base}@${section.commit}/${section.path}/${file}`;
}
/** URL einer lauf-unabhängigen Datei (`hsurf`): ohne Lauf-Pfad. */
export function repoUrl(section, file) {
  return `${section.base}@${section.commit}/${file}`;
}

/**
 * Der Eintrag, den `index.json` je Lauf führt — die Producer-Ausgabe
 * (`repack.json`) ohne die Felder, die nur den Producer angehen.
 */
export function indexEntry(runManifest) {
  const m = runManifest;
  return {
    run: m.run,
    runAt: m.runAt,
    path: `${RUNS_DIR}/${m.run}`,
    targetWidth: m.targetWidth,
    grid: m.grid,
    wind: m.wind,
    temp: m.temp,
    ...(m.missing ? { missing: m.missing } : {}),
  };
}

/**
 * Baut den Manifest-Abschnitt für EINE Familie aus einem Index-Eintrag.
 *
 * `family` ist `'wind'` (→ `latest-wind.json`) oder `'temp'` (→ `latest-grib.json`).
 * Jede Familie bekommt nur ihre eigenen Felder: das Wind-Manifest trägt keine
 * Temperatur-Normierung und umgekehrt. Die vier Wind-Normierungswerte stehen JE
 * SCHRITT — ohne sie ist das Bild bedeutungslos, und sie ändern sich mit jedem
 * Schritt (`buildWindRgba` normiert je Frame).
 */
export function sectionFor(entry, family, commit, base = CDN_BASE) {
  if (!entry || !commit) return null;
  const fam = entry[family];
  if (!fam || !Array.isArray(fam.steps) || fam.steps.length === 0) return null;
  const section = {
    schema: SCHEMA,
    base,
    commit,
    run: entry.run,
    runAt: entry.runAt,
    path: entry.path,
    targetWidth: entry.targetWidth,
    grid: entry.grid,
    [family]: fam,
  };
  return section;
}

/**
 * Wählt aus einem gelesenen `index.json` den Abschnitt für GENAU diesen Lauf.
 * Gibt `null` zurück, wenn der Index den Lauf (noch) nicht führt — der Aufrufer
 * lässt den Abschnitt dann weg, statt einen älteren stehen zu lassen.
 */
export function pickForRun(index, run, family, base = CDN_BASE) {
  if (!index || !Array.isArray(index.runs) || !index.commit) return null;
  const entry = index.runs.find((r) => r.run === run);
  if (!entry) return null;
  return sectionFor(entry, family, index.commit, base);
}

/**
 * Holt den Index und liefert den Abschnitt — oder `null` bei JEDEM Problem
 * (Netz, 404, kaputtes JSON, Lauf fehlt). Ein fehlender Repack-Abschnitt ist
 * kein Fehler, sondern der Normalfall vor dem ersten Producer-Lauf: der Client
 * nimmt dann den GRIB-Pfad. Deshalb wirft diese Funktion nie.
 *
 * `REPACK_INDEX_URL=''` schaltet den Abschnitt ab (Kill-Switch für den Cron).
 */
export async function fetchIndex(opts = {}) {
  const url = opts.indexUrl ?? process.env.REPACK_INDEX_URL ?? INDEX_URL;
  if (!url) return { ok: false, index: null, note: 'Repack-Abschnitt abgeschaltet (REPACK_INDEX_URL leer)' };

  // Ein zweiter Versuch, und zwar NUR bei Netzfehlern und 5xx.
  // Gemessen am 2026-08-23 auf der Entwicklungsmaschine: `raw.githubusercontent.com`
  // lief zweimal binnen zehn Minuten in `UND_ERR_CONNECT_TIMEOUT` (185.199.108.133:443),
  // während derselbe Abruf davor und danach in unter einer Sekunde durchging.
  // Ohne Wiederholung kostet so ein Aussetzer keinen Fehler — `carryRepack` (3)
  // behält den bestehenden Abschnitt —, aber einen ganzen Cron-Takt (~15 min),
  // bis ein NEUER Lauf seinen Abschnitt bekommt.
  // Bei 404 wird NICHT wiederholt: „noch nicht abgelegt" ist eine Antwort, keine
  // Störung; Wiederholen machte den Cron nur langsamer.
  const attempts = opts.attempts ?? 2;
  let note = 'Index nicht lesbar';
  for (let i = 1; i <= attempts; i++) {
    try {
      const signal = AbortSignal.timeout ? AbortSignal.timeout(opts.timeoutMs ?? 10_000) : undefined;
      const res = await fetch(url, { signal, cache: 'no-store' });
      if (!res.ok) {
        note = `Index HTTP ${res.status}`;
        if (res.status < 500 || i === attempts) return { ok: false, index: null, note };
      } else {
        const index = JSON.parse(await res.text());
        return { ok: true, index, note: `Daten-Repo führt [${(index.runs ?? []).map((r) => r.run).join(', ') || '—'}] @ ${String(index.commit).slice(0, 7)}` };
      }
    } catch (e) {
      note = `Index nicht lesbar (${e.message})`;
      if (i === attempts) return { ok: false, index: null, note };
    }
    note += ` · Versuch ${i}/${attempts}`;
    await new Promise((r) => setTimeout(r, opts.retryMs ?? 1500));
  }
  return { ok: false, index: null, note };
}

/** Index holen und gleich den Abschnitt für EINEN Lauf ziehen. */
export async function fetchSection(run, family, opts = {}) {
  const base = opts.base ?? process.env.REPACK_CDN_BASE ?? CDN_BASE;
  const r = await fetchIndex(opts);
  if (!r.ok) return { ok: false, section: null, note: r.note };
  const section = pickForRun(r.index, run, family, base);
  return {
    ok: true,
    section,
    note: section
      ? `Lauf ${run} im Daten-Repo (${section[family].steps.length} Schritte, Commit ${r.index.commit.slice(0, 7)})`
      : `Daten-Repo führt Lauf ${run} noch nicht — ${r.note}`,
  };
}

/**
 * Was der Abschnitt im neu geschriebenen Manifest sein soll — DIE Entscheidung,
 * einmal, für beide Warm-Skripte. Rein, damit `verify:repack` sie netzfrei
 * durchspielen kann.
 *
 * Drei Fälle, und der dritte ist der, den man leicht falsch macht:
 *   1. Index gelesen, führt den Lauf   → nimm ihn.
 *   2. Index gelesen, führt ihn NICHT  → weglassen. Der Producer hinkt hinterher,
 *      der Client nimmt für diesen Lauf GRIB. Ein alter Abschnitt wäre hier eine
 *      Falschaussage über die Gültigkeitszeit jedes Frames.
 *   3. Index NICHT lesbar (Netz, 404)  → den bestehenden Abschnitt behalten,
 *      aber nur wenn er zu DIESEM Lauf gehört. Ihn wegen eines Netzfehlers
 *      fallen zu lassen, würde bei jedem Aussetzer einen Commit auslösen und
 *      die Besucher grundlos auf GRIB zurückwerfen — die Bilder liegen ja noch
 *      (der SHA ist unveränderlich).
 */
export function carryRepack(existing, run, fetched) {
  if (fetched?.ok) return fetched.section ?? null;
  const prev = existing?.repack;
  return prev && prev.run === run ? prev : null;
}

/** Gleichheit zweier Abschnitte — Commit und Schrittzahl reichen als Anker. */
export function sameSection(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const n = (s) => ['wind', 'temp'].map((f) => s[f]?.steps?.length ?? 0).join('/');
  return a.commit === b.commit && a.run === b.run && n(a) === n(b);
}
