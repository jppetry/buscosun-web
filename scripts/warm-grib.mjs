/**
 * warm-grib.mjs — Manifest-Publisher für die ICON-D2-Kartenlayer
 * (Phase T2-4, ursprünglich Generalisierung des Wind-Warmers aus Phase T1.2 —
 * der ist seit BW-13 entfernt).
 *
 * ⚠️ Der Dateiname ist historisch: seit 2026-08-23 wird hier NICHTS mehr
 * gewärmt (s. u.). Umbenennen würde `verify-warm-budget.mjs` (liest diese Datei
 * per Pfad) treffen
 * — bewusst zurückgestellt, damit der Rückzug ein reiner Verhaltens-Diff bleibt.
 *
 * Rolle: findet den neuesten vollständigen ICON-D2-Lauf und legt das kombinierte
 * Manifest `latest-grib.json` um. Der Client (resolveLatestRun →
 * resolveRunFromManifest) liest nur dieses Manifest und spart dadurch den
 * ~1,9-s-Directory-Scan.
 *
 * ── DAS CACHE-WÄRMEN IST ENTFERNT (Jans Auftrag 2026-08-23) ─────────────────
 * ⚠️ **Ausdrückliche Ausnahme vom Funktionserhalt** (CLAUDE.md), Muster wie die
 * Layer-Rückzüge vom 2026-08-22. Bis 2026-08-22 hat dieses Skript zusätzlich
 * JEDE Datei durch `SITE_URL/_dwd_grib` geholt, um den Netlify-Edge-Cache zu
 * füllen. Dieser Pfad existiert nicht mehr — nicht abgeschaltet, gelöscht.
 * Gemessene Begründung (`audit/bandbreite.md` §5, §14, §16):
 *
 *   (1) Ein voller Durchlauf kostete **372 MiB Netlify-Egress** — 171,6 MiB für
 *       die 14 2D-Params + hsurf, 200,6 MiB für die 15 EPS-Dateien (12–17 MB
 *       das Stück). Über beide Warm-Crons ~123 GB/Monat; das Konto lief am
 *       2026-08-22 in `usage_exceeded`, die Seite war offline.
 *   (2) Der `durable`-Direktiv in `netlify/edge-functions/dwd-grib.ts` ist auf
 *       Edge Functions WIRKUNGSLOS — der `Cache-Status`-Header führt immer nur
 *       `"Netlify Edge"`, nie `"Netlify Durable"` (§14.1). Der Edge-Cache ist
 *       der LOKALE Cache eines CDN-Knotens: gewärmt wurde der PoP des
 *       GitHub-Runners, nicht der, auf dem DACH-Besucher landen.
 *   (3) Der EPS-Abschnitt (50 % der Kosten) bedient einen Pfad, der nur feuert,
 *       wenn ein Nutzer im Modell-Umschalter ausdrücklich „ICON-D2-EPS" wählt
 *       (`loadFusedForecast.ts:243`).
 *   (4) Der Warmer erzeugte MEHR DWD-Last, als er einsparte: ~5 700 Abrufe/Tag
 *       gegen 7 Dateien je Besuchersitzung.
 *
 * Die Step-Listen des Manifests kamen noch nie aus den geladenen Bytes, sondern
 * IMMER aus den DWD-Directory-Listings (`listSteps`/`listEpsSteps`) — das
 * Löschen kostet deshalb keine Information. Was sich ändert: das Manifest nennt
 * jetzt die Steps, die das DWD LISTET, statt der Steps, die wir erfolgreich
 * heruntergeladen haben. Der Client verträgt das (fehlender Step wird pro
 * Schritt abgefangen; ein unbrauchbares Manifest fällt komplett auf den
 * Directory-Scan zurück, `iconD2Precip.ts:112-116`).
 *
 * Der Edge-Cache selbst bleibt bestehen und wirkt weiter — er füllt sich jetzt
 * ausschließlich durch echte Besucher (gemessen: `fwd=miss; stored` →
 * `hit; ttl=21599`, 6 h Haltbarkeit). `netlify/edge-functions/dwd-grib.ts` ist
 * UNBERÜHRT.
 *
 * Ablauf (idempotent, self-healing, atomar):
 *   1. Neuesten Lauf finden, dessen Near-Horizon (0…NEAR_REQUIRED) für ALLE
 *      Params publiziert ist (DWD-Directory-Listings, Rückwärtssuche).
 *   2. Early-Exit, wenn das Manifest bereits auf diesem Lauf steht UND alle
 *      aktuell publizierten Steps schon enthält. Der Steps-Vergleich ist nötig,
 *      weil ICON-D2 progressiv publiziert: ein reiner Lauf-Vergleich würde den
 *      Rest des Horizonts bis zum nächsten Lauf (~3 h) nie nachtragen.
 *   3. Manifest atomar schreiben (temp + rename, zuletzt).
 *
 * Graceful degrade wie T1: schlägt die Discovery fehl, bleibt das alte Manifest
 * stehen → der Client serviert den letzten bekannten Lauf (stale, nie kalt) bzw.
 * fällt nach dem 24h-Staleness-Guard auf den Directory-Scan zurück. Nächster
 * Tick heilt.
 *
 * Phase T2b-3: das Manifest führt einen sekundären `eps`-Abschnitt (ICON-D2-EPS,
 * icosahedral, Fusion-Engine via src/sources/iconD2EpsSource.ts). Eigene
 * Discovery (Spiegel von resolveLatestEpsRun), exakt die Client-Menge
 * (5 Variablen × Steps 0/3/6). Der Abschnitt ist Doku/Ops — der Client liest ihn
 * NICHT, seine EPS-Lauf-Discovery bleibt der Directory-Scan. EPS-Fehler
 * blockieren NIE das Umlegen des 2D-Abschnitts (und umgekehrt); Early-Exit prüft
 * beide getrennt. Das frühere Wärmen der EPS-Dateien war mit 200,6 MiB je
 * Durchlauf der teuerste Einzelposten des Projekts — es ist mit entfallen.
 *
 * Kein eccodes, kein Decode, kein bz2, kein Byte durch Netlify.
 * Wind hatte bis BW-13 ein eigenes Skript und ein eigenes Manifest; beide sind
 * entfernt — der Windlayer liest Lauf UND Bilder aus dem Index des Daten-Repos.
 *
 * ENV:
 *   SITE_URL            Site, FÜR die das Manifest publiziert wird (Feld
 *                       `publishedFor`, Herkunfts-Anker des Wächters H4).
 *                       Default http://localhost:5196 — ein lokal geschriebenes
 *                       Manifest fällt damit in Prod sofort auf.
 *   MANIFEST_PATH       Zielpfad des Manifests. Default public/latest-grib.json.
 *   DWD_BASE            DWD-Origin für die Lauf-Discovery.
 *                       Default https://opendata.dwd.de/weather/nwp/icon-d2/grib.
 *   EPS_DWD_BASE        DWD-Origin für die EPS-Lauf-Discovery. Default
 *                       https://opendata.dwd.de/weather/nwp/icon-d2-eps/grib.
 *   NEAR_REQUIRED       Steps 0…N müssen je Param vorliegen, um umzulegen. Default 4.
 *   WARM_MAX_STEP       TEST: globaler Step-Cap, der die per-Param-Caps zusätzlich
 *                       deckelt (kleiner Probelauf). Default: unbegrenzt.
 *   FAIL_STEP           TEST: nimmt diesen Step aus den Listen (Fail-Safe-Probe).
 *   FORCE               '1' überspringt den Early-Exit.
 *   REPACK_INDEX_URL    index.json des Daten-Repos (BW-2). Leer = Repack-Abschnitt
 *                       abgeschaltet. Default s. scripts/lib/repackManifest.mjs.
 *   REPACK_CDN_BASE     CDN-Basis für die Bild-URLs. Default ebenda.
 */

import { writeFileSync, renameSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fetchIndex, pickForRun, carryRepack, sameSection, CDN_BASE, GRIB_FAMILIES } from './lib/repackManifest.mjs';

const SITE_URL = (process.env.SITE_URL || 'http://localhost:5196').replace(/\/+$/, '');
const MANIFEST_PATH = resolve(process.env.MANIFEST_PATH || 'public/latest-grib.json');
const DWD_BASE = (process.env.DWD_BASE || 'https://opendata.dwd.de/weather/nwp/icon-d2/grib').replace(/\/+$/, '');
const NEAR_REQUIRED = Number(process.env.NEAR_REQUIRED ?? 4);
const WARM_MAX_STEP = process.env.WARM_MAX_STEP != null ? Number(process.env.WARM_MAX_STEP) : null;
const FAIL_STEP = process.env.FAIL_STEP != null ? Number(process.env.FAIL_STEP) : null;
const FORCE = process.env.FORCE === '1';

/**
 * T2-Params mit ihren Karten-Step-Caps (= was der jeweilige Layer maximal lädt).
 *
 * ── V-80 (2026-08-03): an die tatsächlich sichtbaren Layer gekoppelt ────────
 * Vorher wärmte diese Liste die VIER WOLKEN-Params für einen Layer, dessen
 * Toggle auskommentiert ist (`MapView.tsx:4049`, Jans Vorgabe 2026-07-23) —
 * und ließ zugleich vier SICHTBARE Layer außen vor, die dadurch immer kalt
 * luden (Directory-Scan-Fallback, `iconD2Precip.ts:112-116`): Gewitter, Blitz-
 * Prognose, Schnee und Rotation. Also ausgerechnet das, was Nutzer in
 * Unwetterlagen und im Winter anschalten.
 *
 * Die Caps stammen NICHT aus einer Schätzung, sondern aus dem jeweiligen
 * Quellmodul (`MAX_STEP`): iconD2Thunder 12 · iconD2Lpi 12 · iconD2Snow 24 ·
 * iconD2Rotation 12. Temp/Gust 24, Precip 27 wie bisher.
 *
 * Step 0 wird auch für die Params gewärmt, deren Layer ihn per `minStepHours=1`
 * überspringt (lpi_max, uh_*, snow_gsp): am 2026-08-03 an DWD geprüft — alle
 * liefern Step 0, und das Auslassen spräche gegen die Lückenlosigkeit, die der
 * Betriebs-Wächter (V-79, H5) prüft. Ersparnis wäre ~2,8 MB/Lauf, also ~3 % —
 * den Sonderfall nicht wert.
 *
 * ⚠ KOSTEN — am 2026-08-03 an echten DWD-Dateigrößen gemessen, nicht geschätzt:
 *   entfernt (Wolken)         25,4 MB/Lauf
 *   neu (9 Feature-Params +2) 90,8 MB/Lauf
 *   NETTO                    +65,4 MB/Lauf  ≈ +0,5 GB/Tag ≈ +15 GB/Monat
 * Der Katalogeintrag V-80 stellte nur die Ersparnis in Aussicht („~12 GB/Monat
 * werden frei"); die stimmt für sich, wird aber vom Zuwachs deutlich übertroffen.
 * Treiber sind cape_ml (25,2), cin_ml (23,3), sdi_2 (17,7) und snow_gsp (17,3).
 * Wer das drücken will: V-84 (Delta statt Vollauf) ist der richtige Hebel, nicht
 * das Weglassen sichtbarer Layer. Mit WARM_FEATURE_LAYERS=0 lässt sich der neue
 * Teil ohne Code-Änderung zurücknehmen.
 */
const WARM_FEATURE_LAYERS = process.env.WARM_FEATURE_LAYERS !== '0';

/** Basis: die Layer, die seit T2 gewärmt werden und sichtbar sind. */
const BASE_PARAMS = [
  { name: 't_2m', maxStep: 24 },        // Layer „Temperatur"
  { name: 'vmax_10m', maxStep: 24 },    // Layer „Böen"
  { name: 'tot_prec', maxStep: 27 },    // Niederschlag (Modellanteil/Fallback)
];

/** Feature-Layer F1/F2/F4/F5 — sichtbar im Dock, bislang ungewärmt. */
const FEATURE_PARAMS = [
  { name: 'cape_ml', maxStep: 12 },     // F1 Gewitterpotenzial (iconD2Thunder MAX_STEP=12)
  { name: 'cin_ml', maxStep: 12 },      // F1
  { name: 'lpi', maxStep: 12 },         // F1
  { name: 'lpi_max', maxStep: 12 },     // F2 Blitz-Prognose (iconD2Lpi MAX_STEP=12)
  { name: 'h_snow', maxStep: 24 },      // F4 Schneedecke (iconD2Snow MAX_STEP=24)
  { name: 'snow_gsp', maxStep: 24 },    // F4 Neuschnee
  { name: 'snow_con', maxStep: 24 },    // F4 Neuschnee, optionaler Zusatzterm
  { name: 'rho_snow', maxStep: 24 },    // F4 Neuschnee, optionale Dichte
  { name: 'uh_max', maxStep: 12 },      // F5 Rotation (iconD2Rotation MAX_STEP=12)
  { name: 'uh_max_low', maxStep: 12 },  // F5
  { name: 'sdi_2', maxStep: 12 },       // F5
];

// Wolken-Params (clcl/clcm/clch/clct, je ≤ 12) sind BEWUSST entfernt: der Layer
// ist ausgeblendet. Zum Zurückholen genügt es, sie hier wieder einzureihen —
// gemeinsam mit dem Toggle in MapView.tsx:4049.
const PARAMS = WARM_FEATURE_LAYERS ? [...BASE_PARAMS, ...FEATURE_PARAMS] : BASE_PARAMS;

const EPS_DWD_BASE = (process.env.EPS_DWD_BASE || 'https://opendata.dwd.de/weather/nwp/icon-d2-eps/grib').replace(/\/+$/, '');
/** EPS-Variablen + Step-Menge, die `fetchIconD2EpsGrid` tatsächlich zieht
 *  (src/sources/iconD2EpsSource.ts: VARS, cap MAX_STEP_DEFAULT=6, nur s % 3 === 0
 *  → Steps 0/3/6). Exakt diese Menge wärmen — EPS-Dateien sind groß (~16 MB
 *  entpackt), Über-Wärmen wäre teuer und nutzlos. */
const EPS_PARAMS = ['t_2m', 'u_10m', 'v_10m', 'clct', 'tot_prec'];
const EPS_MAX_STEP = 6;
const epsWanted = (steps) => steps.filter((s) =>
  s <= EPS_MAX_STEP && s % 3 === 0 && (WARM_MAX_STEP == null || s <= WARM_MAX_STEP));

const pad2 = (n) => String(n).padStart(2, '0');
const log = (...a) => console.log('[warm-grib]', ...a);

const capOf = (p) => (WARM_MAX_STEP != null ? Math.min(p.maxStep, WARM_MAX_STEP) : p.maxStep);

function runStrOf(date) {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}${pad2(date.getUTCHours())}`;
}
function parseRunStr(run) {
  return new Date(Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10)));
}
/** DWD-Directory-Listing eines (Lauf,Param) parsen → verfügbare Steps (regular-lat-lon). */
async function listSteps(run, param) {
  const hh = run.slice(8, 10);
  const res = await fetch(`${DWD_BASE}/${hh}/${param}/`);
  if (!res.ok) return [];
  const html = await res.text();
  const re = new RegExp(`icon-d2_germany_regular-lat-lon_single-level_${run}_(\\d{3})_2d_${param}\\.grib2\\.bz2`, 'g');
  const steps = new Set();
  let m;
  while ((m = re.exec(html)) !== null) steps.add(parseInt(m[1], 10));
  return [...steps].sort((a, b) => a - b);
}

/** EPS-Directory-Listing eines (Lauf,Param) parsen → verfügbare Steps (icosahedral). */
async function listEpsSteps(run, param) {
  const hh = run.slice(8, 10);
  const res = await fetch(`${EPS_DWD_BASE}/${hh}/${param}/`);
  if (!res.ok) return [];
  const html = await res.text();
  const re = new RegExp(`icon-d2-eps_germany_icosahedral_single-level_${run}_(\\d{3})_2d_${param}\\.grib2\\.bz2`, 'g');
  const steps = new Set();
  let m;
  while ((m = re.exec(html)) !== null) steps.add(parseInt(m[1], 10));
  return [...steps].sort((a, b) => a - b);
}

/** Neuesten EPS-Lauf finden — SPIEGEL der Client-Discovery (resolveLatestEpsRun in
 *  iconD2EpsSource.ts: t_2m-Listing, max(Step) ≥ 6). Es wird bewusst DER Lauf
 *  gewärmt, den auch der Client wählen wird; hinkt eine andere Variable nach,
 *  fehlt sie schlicht (Client füllt dann NaN — unverändertes Verhalten). */
async function findLatestEpsRun() {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 6; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run = runStrOf(cand);
    let t2m;
    try { t2m = await listEpsSteps(run, 't_2m'); } catch { continue; }
    if (t2m.length === 0 || Math.max(...t2m) < EPS_MAX_STEP) continue;
    const stepsByParam = { t_2m: epsWanted(t2m) };
    for (const p of EPS_PARAMS) {
      if (p === 't_2m') continue;
      stepsByParam[p] = epsWanted(await listEpsSteps(run, p).catch(() => []));
    }
    const total = Object.values(stepsByParam).reduce((n, a) => n + a.length, 0);
    log(`EPS-Lauf ${run} (Client-Wahl), warmbare Steps gesamt: ${total}`);
    return { run, runAt: cand, stepsByParam };
  }
  return null;
}

/** Neuesten Lauf finden, dessen Near-Horizon (0…NEAR_REQUIRED) für ALLE Params da ist.
 *  Liefert { run, runAt, stepsByParam } — Steps je Param bereits auf den Cap gefiltert. */
async function findLatestCompleteRun() {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  const near = Array.from({ length: NEAR_REQUIRED + 1 }, (_, i) => i);
  for (let back = 0; back < 6; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run = runStrOf(cand);
    try {
      const listed = await Promise.all(PARAMS.map((p) => listSteps(run, p.name)));
      const ok = PARAMS.every((p, i) => near.every((s) => listed[i].includes(s)));
      if (ok) {
        const stepsByParam = {};
        PARAMS.forEach((p, i) => { stepsByParam[p.name] = listed[i].filter((s) => s <= capOf(p)); });
        const total = Object.values(stepsByParam).reduce((n, a) => n + a.length, 0);
        log(`Lauf ${run} vollständig genug (near 0…${NEAR_REQUIRED} ✓ für ${PARAMS.length} Params), warmbare Steps gesamt: ${total}`);
        return { run, runAt: cand, stepsByParam };
      }
      log(`Lauf ${run} noch unvollständig (${PARAMS.map((p, i) => `${p.name}:${listed[i].length}`).join(' ')}) — weiter zurück`);
    } catch (e) {
      log(`Lauf ${run} Discovery-Fehler (${e?.message || e}) — weiter zurück`);
    }
  }
  return null;
}

function readManifest() {
  try { return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); } catch { return null; }
}

/** Early-Exit-Prüfung: Manifest steht auf diesem Lauf UND enthält je Param alle
 *  aktuell warmbaren Steps (progressive Publikation → sonst nachwärmen). */
function manifestCovers(existing, latest) {
  if (!existing || existing.run !== latest.run) return false;
  const params = existing.params;
  if (params == null || typeof params !== 'object') return false;
  return PARAMS.every((p) => {
    const have = Array.isArray(params[p.name]) ? params[p.name] : [];
    return latest.stepsByParam[p.name].every((s) => have.includes(s));
  });
}

/** Early-Exit-Prüfung des sekundären `eps`-Abschnitts (gleiche Logik: Lauf +
 *  Step-Abdeckung je EPS-Param — progressive Publikation gilt auch hier). */
function manifestCoversEps(existing, latestEps) {
  const eps = existing?.eps;
  if (!eps || eps.run !== latestEps.run) return false;
  if (eps.params == null || typeof eps.params !== 'object') return false;
  return EPS_PARAMS.every((p) => {
    const have = Array.isArray(eps.params[p]) ? eps.params[p] : [];
    return latestEps.stepsByParam[p].every((s) => have.includes(s));
  });
}

/** Atomar schreiben: temp + rename (der Client sieht nie ein halbes Manifest). */
function writeManifestAtomic(obj) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  const tmp = `${MANIFEST_PATH}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, MANIFEST_PATH);
}

async function main() {
  log(`Start · publishedFor=${SITE_URL} · Manifest=${MANIFEST_PATH} · Params=${PARAMS.map((p) => `${p.name}≤${capOf(p)}`).join(',')} · EPS=${EPS_PARAMS.join(',')}≤${EPS_MAX_STEP}`);

  const existing = readManifest();

  // Discovery beider Familien getrennt — ein Ausfall der einen hält die andere
  // nicht auf (2D-Karte und Fusion/EPS haben eigene Läufe + eigene Nutzer).
  const latest = await findLatestCompleteRun();
  if (!latest) log('Kein vollständiger 2D-Lauf gefunden → 2D-Abschnitt UNVERÄNDERT (graceful degrade).');
  let latestEps = null;
  try { latestEps = await findLatestEpsRun(); } catch (e) { log(`EPS-Discovery-Fehler (${e?.message || e}).`); }
  if (!latestEps) log('Kein EPS-Lauf gefunden → eps-Abschnitt UNVERÄNDERT (graceful degrade).');

  // ── BW-2: additiver `repack`-Abschnitt (BW-6b: alle GRIB-Familien, eine Liste) ──
  // Nur ein Blick in `index.json` des Daten-Repos (ein paar KB von
  // raw.githubusercontent.com) — es wird nichts geladen und nichts gewärmt.
  // Der Abschnitt hängt am Lauf, der am Ende WIRKLICH im Manifest steht; hier
  // kann das der übernommene Bestandslauf sein, nicht der frisch gefundene.
  const idx = await fetchIndex();
  if (idx.note) log(idx.note);
  const repackFor = (run) => carryRepack(existing, run, {
    ok: idx.ok, section: idx.ok ? pickForRun(idx.index, run, GRIB_FAMILIES, process.env.REPACK_CDN_BASE || CDN_BASE) : null,
  });

  const needMain = latest != null && (FORCE || !manifestCovers(existing, latest));
  const needEps = latestEps != null && (FORCE || !manifestCoversEps(existing, latestEps));
  // Der Producer kommt typischerweise NACH dem Manifest-Advance zum Zug (er
  // braucht ~2 min je Lauf). Ohne diese Prüfung stünde sein Abschnitt bis zum
  // nächsten DWD-Lauf nicht im Manifest — dasselbe Muster wie V-81.
  const repackSettled = sameSection(existing?.repack ?? null, existing?.run ? repackFor(existing.run) : null);

  // ── BW-12 (§31.10): der `eps`-Abschnitt LÖST KEIN UMLEGEN MEHR AUS ─────────
  // Er ist Doku/Ops — „der Client liest ihn NICHT" (Phase T2b-3, Kopf dieser
  // Datei). Trotzdem war er der größte einzelne Deploy-Treiber: gemessen am
  // 2026-09-04 änderten **46 von 136** grib-Commits der letzten sieben Tage
  // (34 %) nichts als diesen Abschnitt, und jeder kostete einen vollen
  // Netlify-Produktionsbuild für eine Information, die kein Browser abruft.
  //
  // Er wird deshalb nicht entfernt (Funktionserhalt), sondern FÄHRT MIT: sobald
  // 2D oder der Repack-Abschnitt ohnehin schreiben, geht er im selben Commit
  // frisch mit raus (`advanceEps` unverändert). Allein löst er nichts aus.
  // Wirkung auf seine Aktualität: er ist höchstens bis zum nächsten echten
  // Schreibvorgang alt (2–3 je Lauf) — für Doku/Ops ohne Belang.
  //
  // `EPS_FORCES_WRITE=1` stellt das alte Verhalten wieder her (benannter
  // Rückfallweg, Rule 2).
  const epsForcesWrite = process.env.EPS_FORCES_WRITE === '1';
  const needEpsWrite = needEps && epsForcesWrite;

  if (!needMain && !needEpsWrite && repackSettled) {
    if (needEps) log('Early-Exit: nur der eps-Abschnitt hat sich bewegt — er fährt beim nächsten Umlegen mit (BW-12).');
    else log('Early-Exit: Manifest deckt 2D und EPS bereits vollständig ab.');
    return 0;
  }
  if (!needMain && !needEpsWrite) log('2D abgedeckt, aber der Repack-Abschnitt hat sich geändert → umlegen.');
  if (!needMain && latest) log(`2D bereits abgedeckt (Lauf ${latest.run}).`);
  if (!needEps && latestEps) log(`EPS bereits abgedeckt (Lauf ${latestEps.run}).`);

  // Bestätigte Steps je Param — aus den DWD-Directory-Listings, die die
  // Discovery ohnehin geholt hat. Null zusätzliche Requests, null Netlify-Bytes.
  const confirmed = Object.fromEntries(PARAMS.map((p) => [p.name, []]));
  const confirmedEps = Object.fromEntries(EPS_PARAMS.map((p) => [p, []]));
  const failed = (step) => FAIL_STEP != null && step === FAIL_STEP;

  let nSteps = 0;
  if (needMain) for (const p of PARAMS) {
    confirmed[p.name] = latest.stepsByParam[p.name].filter((s) => !failed(s));
    nSteps += confirmed[p.name].length;
  }
  if (needEps) for (const p of EPS_PARAMS) {
    confirmedEps[p] = latestEps.stepsByParam[p].filter((s) => !failed(s));
    nSteps += confirmedEps[p].length;
  }
  if (FAIL_STEP != null) log(`  FAIL_STEP=${FAIL_STEP} → Step aus allen Listen entfernt (Fail-Safe-Probe)`);
  log(`${nSteps} Steps aus den DWD-Listings bestätigt — 0 Bytes durch ${SITE_URL}.`);

  // Fail-Safes je Familie, UNABHÄNGIG — ein EPS-Fehlschlag blockiert nie das
  // Umlegen des 2D-Manifests (und umgekehrt). Nächster Tick heilt die andere Seite.
  let advanceMain = false;
  if (needMain) {
    const near = Array.from({ length: NEAR_REQUIRED + 1 }, (_, i) => i);
    const nearBad = PARAMS.filter((p) => !near.every((s) => confirmed[p.name].includes(s)));
    if (nearBad.length > 0) {
      log(`2D-Near-Horizon unvollständig (${nearBad.map((p) => `${p.name}:[${confirmed[p.name].join(',')}]`).join(' ')}) → 2D-Abschnitt UNVERÄNDERT (Fail-Safe).`);
    } else advanceMain = true;
  }
  let advanceEps = false;
  if (needEps) {
    const epsBad = EPS_PARAMS.filter((p) => !latestEps.stepsByParam[p].every((s) => confirmedEps[p].includes(s)));
    if (epsBad.length > 0 || latestEps.stepsByParam.t_2m.length === 0) {
      log(`EPS unvollständig (${epsBad.map((p) => `${p}:[${confirmedEps[p].join(',')}]`).join(' ')}) → eps-Abschnitt UNVERÄNDERT (Fail-Safe).`);
    } else advanceEps = true;
  }
  // BW-12: ein EPS-Advance allein schreibt nicht mehr (Begründung oben beim
  // Early-Exit). `advanceEps` bleibt trotzdem stehen und gilt — er sorgt dafür,
  // dass der Abschnitt FRISCH ist, wenn aus einem anderen Grund geschrieben wird.
  const epsWrite = advanceEps && epsForcesWrite;
  // Dritter Grund umzulegen: nur der Repack-Abschnitt hat sich bewegt. Dann
  // bleiben 2D und EPS 1:1 aus dem Bestand — es ändert sich genau ein Feld.
  const repackOnly = !advanceMain && !epsWrite && !repackSettled && typeof existing?.run === 'string';
  if (!advanceMain && !epsWrite && !repackOnly) {
    log('Nichts umzulegen (Fail-Safes bzw. nur EPS). Exit 0.');
    return 0;
  }

  // Manifest komponieren: nicht-avancierte Abschnitte 1:1 aus dem Bestand.
  const mainRun = advanceMain ? latest.run : existing?.run;
  const mainParams = advanceMain
    ? Object.fromEntries(PARAMS.map((p) => [p.name, confirmed[p.name].sort((a, b) => a - b)]))
    : existing?.params;
  if (typeof mainRun !== 'string' || mainParams == null || typeof mainParams !== 'object') {
    // Ohne gültigen 2D-Abschnitt wäre das Manifest für den Client unbrauchbar
    // (gribManifest.ts verlangt run+params) → nicht schreiben. Der Client findet
    // EPS ohnehin über seinen eigenen Directory-Scan.
    log('Kein gültiger 2D-Abschnitt verfügbar → Manifest NICHT geschrieben. Exit 0.');
    return 0;
  }
  const epsSection = advanceEps
    ? {
        run: latestEps.run,
        runAt: parseRunStr(latestEps.run).toISOString(),
        params: Object.fromEntries(EPS_PARAMS.map((p) => [p, confirmedEps[p].sort((a, b) => a - b)])),
      }
    : existing?.eps;

  const manifest = {
    run: mainRun,
    runAt: advanceMain ? parseRunStr(latest.run).toISOString() : (existing?.runAt ?? parseRunStr(mainRun).toISOString()),
    updatedAt: new Date().toISOString(),
    // Site, FÜR die publiziert wird — Herkunfts-Anker des Wächters H4. Ersetzt
    // das frühere `warmedThroughProxy`: dieses Skript wärmt nichts mehr, das
    // Feld hätte etwas behauptet, das nicht passiert.
    publishedFor: SITE_URL,
    params: mainParams,
    ...(epsSection ? { eps: epsSection } : {}),
  };
  // Additiv und zuletzt, am Lauf, der wirklich im Manifest steht. Fehlt er,
  // ist das Manifest exakt das von vorher — der Client nimmt dann GRIB.
  const nextRepack = repackFor(mainRun);
  if (nextRepack) manifest.repack = nextRepack;
  writeManifestAtomic(manifest);
  log(`Manifest umgelegt → 2D-Lauf ${manifest.run}${advanceMain ? ' (neu)' : ' (übernommen)'}${epsSection ? ` · EPS-Lauf ${epsSection.run}${advanceEps ? ' (neu)' : ' (übernommen)'}` : ''}`
    + `${nextRepack ? ` · Repack-Commit ${nextRepack.commit.slice(0, 7)}` : ' · ohne Repack'}. Fertig.`);
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => { console.error('[warm-grib] FATAL', e); process.exit(1); });
