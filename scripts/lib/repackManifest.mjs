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
/** Index des Daten-Repos, gelesen SERVERSEITIG (Cron) — `raw.githubusercontent.com`
 *  cacht 5 min (`max-age=300`) und war zeitweise unlesbar (§21.7); für den Cron reicht das. */
export const INDEX_URL = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/index.json';
/**
 * Derselbe Index über das CDN — der Weg des BROWSERS (BW-9, §28.4). `@main` ist
 * ein Branch-Ref (`s-maxage=43200`); frisch ist er trotzdem, weil der Publisher
 * den Pfad nach jedem Push purgt (`purgeIndexUntilFresh`) und die Frische
 * nachprüft. Damit erfährt der Client einen neuen Lauf ≈ 1 min nach dem Push
 * statt nach Warm-Cron-Slot + Netlify-Build (gemessen 5–21 min, §28.2). Der
 * Client spiegelt die Konstante (`REPACK_INDEX_CDN_URL`), `verify:repack` prüft
 * die Gleichheit. Der Manifest-Abschnitt bleibt als benannter Fallback.
 */
export const INDEX_CDN_URL = `${CDN_BASE}@main/index.json`;
/**
 * BW-9, zweite Messung (2026-08-25 15:48–15:55): der jsDelivr-**Origin** hält den
 * Inhalt eines Branch-Pfads eigenständig — nach Purge kamen beide Fastly-Schichten
 * mit `MISS, MISS` zurück und lieferten TROTZDEM den Stand von 13:49, während das
 * Listing (`data.jsdelivr.com`) den neuen Hash längst kannte. Ein Purge erreicht
 * den Origin also nicht; `@main/index.json` kann Minuten alt sein.
 *
 * Was nachweislich frisch ist: ein Pfad, der noch NIE abgerufen wurde (13:50:10:
 * 35–57 s nach dem Push). Deshalb schreibt der Publisher je Lauf einen ZEIGER
 * `runs/<run>/index.json` (Commit + Index-Eintrag des Laufs): für einen neuen Lauf
 * ist das ein neuer Pfad — und der Client kennt ihn, weil er den Lauf aus dem
 * Manifest kennt. `@main/index.json` bleibt zweite Quelle, der Manifest-Abschnitt
 * dritte; die Wahl trifft der Client nach Schrittzahl.
 */
export const RUN_POINTER_FILE = 'index.json';
export function runPointerUrl(run, base = CDN_BASE) {
  return `${base}@main/${RUNS_DIR}/${run}/${RUN_POINTER_FILE}`;
}
/** Purge-Endpunkt von jsDelivr für einen CDN-Pfad (gemessen 2026-08-25: `finished`, nicht gedrosselt). */
export function purgeUrlOf(cdnUrl) {
  return cdnUrl.replace(/^https:\/\/cdn\.jsdelivr\.net\//, 'https://purge.jsdelivr.net/');
}
/** Verzeichnis der Läufe im Daten-Repo. */
export const RUNS_DIR = 'runs';
/** Lauf-unabhängige Orographie: an drei Läufen gemessen identisch (BW-1, §20.2),
 *  liegt deshalb im Wurzelverzeichnis statt in jedem Lauf. */
export const HSURF_FILE = 'hsurf-v1.png';

export const SCHEMA = 1;

/**
 * DIE Familienliste (BW-6b). Producer, Publisher, Warm-Crons und Verifier lesen
 * sie hier; der Client spiegelt sie typisiert in `src/sources/repackSource.ts`
 * (`REPACK_FAMILIES`) — `verify:repack` prüft, dass beide Listen gleich sind.
 *
 *   manifest   welches Manifest den Abschnitt trägt: `grib` → `latest-grib.json`
 *              (dort ALLE Familien in EINEM Abschnitt, weil sie am selben Lauf und
 *              Commit hängen). `null` = KEIN Manifest — seit BW-13 (§32) gilt das
 *              für `wind`: dieser Layer liest Lauf UND Bilder aus `index.json`.
 *   file       Dateipräfix im Lauf-Verzeichnis: `<file>-<SSS>.png`
 *   channels   PNG-Kanäle: 3 = RGB (Wind), 2 = Grau+Alpha (Wert + Maske),
 *              1 = Grau (Niederschlag: 0 ist dort „transparent", keine Maske)
 *   params     ICON-D2-Felder je Schritt — der Producer packt einen Schritt NUR mit
 *              ALLEN Feldern (§25.4 (2)); der Client behandelt fehlende Nebenfelder
 *              als 0, und ein so gebautes Bild sähe anders aus als seines
 *   minStep/maxStep  Horizont wie im jeweiligen Client-Loader
 *   fullRes    keine Abtastung (ss = 1): der Niederschlag-Kompositor liest das
 *              volle 1215×746-Raster (`decodeGridStep`)
 *   sequential Deakkumulation gegen den VORHERIGEN Schritt — jeder Schritt nennt
 *              seine Referenz (`ref`), der Client prüft sie (§25.4 (3))
 *   kind       Quantisierer von `decodeGridStep` (`precipToU8` / `capeToU8`) bei fullRes
 */
export const FAMILIES = Object.freeze({
  wind:        { manifest: null,   file: 'wind',      channels: 3, params: ['u_10m', 'v_10m'],                 minStep: 0, maxStep: 12 },
  temp:        { manifest: 'grib', file: 'temp',      channels: 2, params: ['t_2m'],                           minStep: 0, maxStep: 24 },
  gust:        { manifest: 'grib', file: 'gust',      channels: 2, params: ['vmax_10m'],                       minStep: 0, maxStep: 24 },
  thunder:     { manifest: 'grib', file: 'thunder',   channels: 2, params: ['cape_ml', 'cin_ml', 'lpi'],       minStep: 0, maxStep: 12 },
  rotation:    { manifest: 'grib', file: 'rotation',  channels: 2, params: ['uh_max', 'uh_max_low', 'sdi_2'],  minStep: 1, maxStep: 12 },
  lightningfc: { manifest: 'grib', file: 'lpi',       channels: 2, params: ['lpi_max'],                        minStep: 1, maxStep: 12 },
  snowDepth:   { manifest: 'grib', file: 'snowdepth', channels: 2, params: ['h_snow'],                         minStep: 0, maxStep: 24 },
  snowFresh:   { manifest: 'grib', file: 'snowfresh', channels: 2, params: ['snow_gsp', 'snow_con', 'rho_snow'], minStep: 1, maxStep: 24 },
  precip:      { manifest: 'grib', file: 'precip',    channels: 1, params: ['tot_prec'],                       minStep: 0, maxStep: 27, fullRes: true, sequential: true, kind: 'precip' },
  // BW-7a: CAPE am Punkt (`/regenradar`, Event) — 12,65 MiB GRIB für EINE Zahl (V-BW-22).
  cape:        { manifest: 'grib', file: 'cape',      channels: 1, params: ['cape_ml'],                        minStep: 0, maxStep: 27, fullRes: true, kind: 'cape' },
});
export const FAMILY_KEYS = Object.freeze(Object.keys(FAMILIES));
/** Familien je Manifest. Seit BW-13 trägt nur noch `latest-grib.json` einen Abschnitt;
 *  `wind` hat `manifest: null` und kommt ausschließlich über `index.json`. */
export const familiesOf = (manifest) => FAMILY_KEYS.filter((f) => FAMILIES[f].manifest === manifest);
export const GRIB_FAMILIES = Object.freeze(familiesOf('grib'));

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
  const entry = {
    run: m.run,
    runAt: m.runAt,
    path: `${RUNS_DIR}/${m.run}`,
    targetWidth: m.targetWidth,
    grid: m.grid,
  };
  // Jede Familie, die der Producer abgelegt hat — und nur die (BW-6b: generisch
  // über FAMILY_KEYS statt `wind`/`temp` wörtlich).
  for (const f of FAMILY_KEYS) if (m[f]) entry[f] = m[f];
  if (m.missing) entry.missing = m.missing;
  return entry;
}

/**
 * Baut den Manifest-Abschnitt für eine Familie ODER eine Liste von Familien aus
 * einem Index-Eintrag.
 *
 * `GRIB_FAMILIES` → `latest-grib.json`, dort alle
 * in EINEM Abschnitt (gleicher Lauf, gleicher Commit, gleiches Gitter). Jedes
 * Manifest bekommt nur seine eigenen Familien: das Wind-Manifest trägt keine
 * Temperatur-Normierung und umgekehrt. Die vier Wind-Normierungswerte stehen JE
 * SCHRITT — ohne sie ist das Bild bedeutungslos, und sie ändern sich mit jedem
 * Schritt (`buildWindRgba` normiert je Frame).
 *
 * Fehlt eine der gewünschten Familien im Eintrag, fehlt sie im Abschnitt — der
 * Client nimmt für sie GRIB. Kein Abschnitt gibt es erst, wenn KEINE da ist.
 */
export function sectionFor(entry, family, commit, base = CDN_BASE) {
  if (!entry || !commit) return null;
  const wanted = Array.isArray(family) ? family : [family];
  const present = wanted.filter((f) => {
    const fam = entry[f];
    return fam && Array.isArray(fam.steps) && fam.steps.length > 0;
  });
  if (present.length === 0) return null;
  const section = {
    schema: SCHEMA,
    base,
    commit,
    run: entry.run,
    runAt: entry.runAt,
    path: entry.path,
    targetWidth: entry.targetWidth,
    grid: entry.grid,
  };
  for (const f of present) section[f] = entry[f];
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

/**
 * Purgt `index.json` auf jsDelivr und prüft nach, ob das CDN danach den
 * erwarteten Commit liefert — bis zu `attempts` Mal (BW-9, §28.4).
 *
 * Warum nachprüfen statt nur purgen: 4 s nach einem Push löste jsDelivr `main`
 * noch auf den alten HEAD auf (GitHub-Propagation), nach 2:39 min auf den
 * neuen. Ein Purge zur falschen Sekunde wäre wirkungslos und niemand sähe es —
 * der Client läse bis zu 12 h den alten Index. Deshalb: purgen, lesen,
 * vergleichen, notfalls warten und wiederholen. Wirft nie: ein missglückter
 * Purge kostet Frische, keine Korrektheit (der Cron-Weg trägt den Abschnitt
 * weiterhin, und ein alter Index nennt höchstens einen älteren Lauf, den die
 * Anti-Drift-Regel im Client verwirft).
 */
export async function purgeIndexUntilFresh({ commit, url = INDEX_CDN_URL, attempts = 3, waitMs = 20_000, firstWaitMs = 8_000, fetchImpl = fetch, log = () => {} } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let note = '';
  if (firstWaitMs > 0) await sleep(firstWaitMs);
  for (let i = 1; i <= attempts; i++) {
    try {
      const p = await fetchImpl(purgeUrlOf(url), { cache: 'no-store' });
      const body = p.ok ? await p.json().catch(() => null) : null;
      const status = body?.status ?? `HTTP ${p.status}`;
      const res = await fetchImpl(url, { cache: 'no-store' });
      const idx = res.ok ? await res.json().catch(() => null) : null;
      const got = idx?.commit ?? null;
      note = `Purge ${i}/${attempts}: ${status} · CDN-Index @ ${got ? got.slice(0, 7) : '—'}`;
      log(note);
      if (got === commit) return { fresh: true, attempts: i, note };
    } catch (e) {
      note = `Purge ${i}/${attempts} fehlgeschlagen: ${e.message}`;
      log(note);
    }
    if (i < attempts) await sleep(waitMs);
  }
  return { fresh: false, attempts, note: `${note} — erwartet ${commit.slice(0, 7)}; der Cron-Weg trägt den Abschnitt weiter` };
}

/** Index holen und gleich den Abschnitt für EINEN Lauf ziehen. */
export async function fetchSection(run, family, opts = {}) {
  const base = opts.base ?? process.env.REPACK_CDN_BASE ?? CDN_BASE;
  const r = await fetchIndex(opts);
  if (!r.ok) return { ok: false, section: null, note: r.note };
  const section = pickForRun(r.index, run, family, base);
  const fams = Array.isArray(family) ? family : [family];
  return {
    ok: true,
    section,
    note: section
      ? `Lauf ${run} im Daten-Repo (${fams.filter((f) => section[f]).map((f) => `${f} ${section[f].steps.length}`).join(' · ')}, Commit ${r.index.commit.slice(0, 7)})`
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

/**
 * Gleichheit zweier Abschnitte — Lauf und Schrittzahl JEDER Familie sind die
 * Anker. **Der Commit-SHA ist bewusst NICHT dabei** (BW-12, `audit/bandbreite.md`
 * §31.9).
 *
 * Warum: der Repack-Batch rechnet stündlich neu (V-BW-38) und pusht das Ergebnis
 * als neuen Commit — die Bilder sind dabei byte-gleich (BW-1-Determinismus,
 * gemessen). Zählte der SHA als Änderung, legte jeder Warm-Cron das Manifest um,
 * committete es ins Site-Repo und löste einen vollen Netlify-Build aus, dessen
 * einziger Inhalt ein anderer Hex-String ist. Gemessen am 2026-09-03: die zwei
 * Wind-Manifeste 22:15:34 und 23:38:01 unterschieden sich in `updatedAt` und
 * `commit` — sonst in nichts. Ein Drittel der ~31 Deploys/Tag entstand so.
 *
 * Warum das gefahrlos ist: die URLs des Abschnitts sind commit-gepinnt und
 * damit unveränderlich — ein älterer SHA zeigt weiter auf dieselben Bytes. Genau
 * darauf verlässt sich `carryRepack` Fall 3 seit BW-3 („die Bilder liegen ja
 * noch, der SHA ist unveränderlich"); hier gilt dieselbe Annahme, nur länger:
 * bis zum nächsten Lauf, also höchstens ~3 h. Nachgemessen am 2026-09-04:
 * `@0626976…/runs/2026090321/wind-000.png` lieferte 200 und exakt dieselbe
 * Bytezahl wie derselbe Pfad unter dem neuen SHA, obwohl `0626976` im
 * (bei jedem Publish gestutzten) Verlauf des Daten-Repos nicht mehr erreichbar ist.
 *
 * Was weiterhin als Änderung zählt und deshalb umlegt: ein anderer Lauf und
 * jede geänderte Schrittzahl — also jeder Fall, in dem der Abschnitt dem Client
 * etwas ANDERES sagt.
 */
export function sameSection(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const n = (s) => FAMILY_KEYS.map((f) => s[f]?.steps?.length ?? 0).join('/');
  return a.run === b.run && n(a) === n(b);
}
