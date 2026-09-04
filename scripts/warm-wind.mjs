/**
 * warm-wind.mjs — Manifest-Publisher für den ICON-D2-Wind-Layer (Phase T1.2).
 *
 * ⚠️ Der Dateiname ist historisch: seit 2026-08-23 wird hier NICHTS mehr
 * gewärmt (s. u.). Umbenennen würde `verify-warm-wind.mjs` (importiert
 * `manifestCovers`/`mergeSteps` von hier) treffen — bewusst zurückgestellt,
 * damit der Rückzug ein reiner Verhaltens-Diff bleibt.
 *
 * Rolle: findet den neuesten vollständigen ICON-D2-Lauf und legt das Manifest
 * `latest-wind.json` um. Der Client (T1.3) liest nur dieses Manifest und spart
 * dadurch den ~1,9-s-Directory-Scan.
 *
 * ── DAS CACHE-WÄRMEN IST ENTFERNT (Jans Auftrag 2026-08-23) ─────────────────
 * ⚠️ **Ausdrückliche Ausnahme vom Funktionserhalt** (CLAUDE.md), Muster wie die
 * Layer-Rückzüge vom 2026-08-22. Bis 2026-08-22 hat dieses Skript zusätzlich
 * JEDE Datei durch `SITE_URL/_dwd_wind` geholt, um den Netlify-Edge-Cache zu
 * füllen. Dieser Pfad existiert nicht mehr — nicht abgeschaltet, gelöscht.
 * Drei Messungen aus `audit/bandbreite.md` begründen das:
 *
 *   (1) Der `durable`-Direktiv in `netlify/edge-functions/dwd-wind.ts` ist auf
 *       Edge Functions WIRKUNGSLOS — der `Cache-Status`-Header führt immer nur
 *       `"Netlify Edge"`, nie `"Netlify Durable"` (§14.1). Der Edge-Cache ist
 *       damit der LOKALE Cache eines einzelnen CDN-Knotens: eine Wärmung
 *       erreicht genau den PoP des GitHub-Runners — und GitHub-Runner stehen
 *       nicht im DACH-Raum. Der wärmende Fetch kam also nie dort an, wo die
 *       Besucher landen.
 *   (2) Besucher wärmen sich ohnehin gegenseitig (gemessen: `fwd=miss; stored`
 *       → `hit; ttl=21598`, TTL 6 h bei 3-h-Laufrotation). Der Cron konnte
 *       bestenfalls den ERSTEN Besucher pro Knoten pro Lauf entlasten.
 *   (3) Preis dafür: ~123 GB/Monat Netlify-Egress über beide Warm-Crons — das
 *       Konto lief am 2026-08-22 in `usage_exceeded`, die Seite war offline.
 *
 * Die Step-Liste des Manifests kam noch nie aus den geladenen Bytes, sondern
 * IMMER aus den DWD-Directory-Listings (`listSteps`) — das Löschen kostet
 * deshalb keine Information. Was sich ändert: das Manifest nennt jetzt die
 * Steps, die das DWD LISTET, statt der Steps, die wir erfolgreich
 * heruntergeladen haben. Der Client verträgt das — ein fehlender Step wird pro
 * Schritt abgefangen (`iconD2WindSource.ts:317-320`), ein unbrauchbares
 * Manifest fällt komplett auf den Directory-Scan zurück
 * (`iconD2WindSource.ts:385-393`).
 *
 * Der Edge-Cache selbst bleibt bestehen und wirkt weiter — er füllt sich jetzt
 * ausschließlich durch echte Besucher (gemessen: `fwd=miss; stored` →
 * `hit; ttl=21598`, 6 h Haltbarkeit). `netlify/edge-functions/dwd-wind.ts` ist
 * UNBERÜHRT.
 *
 * Ablauf (idempotent, self-healing, atomar):
 *   1. Neuesten VOLLSTÄNDIGEN Lauf finden (DWD-Directory-Listing, Rückwärtssuche).
 *   2. Early-Exit nur, wenn das Manifest auf diesem Lauf steht UND bereits alle
 *      aktuell publizierten Steps führt (ICON-D2 publiziert progressiv, s. V-81).
 *   3. Manifest atomar schreiben (temp + rename, zuletzt).
 *
 * Graceful degrade: schlägt Schritt 1 fehl, bleibt das alte Manifest stehen →
 * der Client serviert den letzten Lauf (stale, nie kalt) bzw. fällt nach dem
 * 24-h-Staleness-Guard auf den Directory-Scan zurück. Nächster Tick heilt selbst.
 *
 * Kein eccodes, kein Decode, kein bz2, kein Byte durch Netlify.
 *
 * ENV:
 *   SITE_URL            Site, FÜR die das Manifest publiziert wird (Feld
 *                       `publishedFor`, Herkunfts-Anker des Wächters H4).
 *                       Default http://localhost:5178 — ein lokal geschriebenes
 *                       Manifest fällt damit in Prod sofort auf.
 *   MANIFEST_PATH       Zielpfad des Manifests. Default public/latest-wind.json.
 *   DWD_BASE            DWD-Origin für die Lauf-Discovery.
 *                       Default https://opendata.dwd.de/weather/nwp/icon-d2/grib.
 *   WARM_MAX_STEP       Höchster ins Manifest aufgenommener Vorlaufschritt. Default 12.
 *   NEAR_REQUIRED       Steps 0…N müssen (u+v) vorhanden sein, um umzulegen. Default 4.
 *   FAIL_STEP           TEST: nimmt diesen Step aus den Listen (Fail-Safe-Probe).
 *   FORCE               '1' überspringt den Early-Exit.
 *   REPACK_INDEX_URL    index.json des Daten-Repos (BW-2). Leer = Repack-Abschnitt
 *                       abgeschaltet. Default s. scripts/lib/repackManifest.mjs.
 *   REPACK_CDN_BASE     CDN-Basis für die Bild-URLs. Default ebenda.
 */

import { writeFileSync, renameSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fetchSection, carryRepack, sameSection } from './lib/repackManifest.mjs';

const SITE_URL = (process.env.SITE_URL || 'http://localhost:5178').replace(/\/+$/, '');
const MANIFEST_PATH = resolve(process.env.MANIFEST_PATH || 'public/latest-wind.json');
const DWD_BASE = (process.env.DWD_BASE || 'https://opendata.dwd.de/weather/nwp/icon-d2/grib').replace(/\/+$/, '');
const WARM_MAX_STEP = Number(process.env.WARM_MAX_STEP ?? 12);
const NEAR_REQUIRED = Number(process.env.NEAR_REQUIRED ?? 4);
const FAIL_STEP = process.env.FAIL_STEP != null ? Number(process.env.FAIL_STEP) : null;
const FORCE = process.env.FORCE === '1';
const PARAMS = ['u_10m', 'v_10m'];

const pad2 = (n) => String(n).padStart(2, '0');
const log = (...a) => console.log('[warm-wind]', ...a);

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

/** Neuesten Lauf finden, der für u UND v mindestens die Near-Horizon-Steps (0…NEAR_REQUIRED) hat. */
async function findLatestCompleteRun() {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 6; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run = runStrOf(cand);
    try {
      const [uSteps, vSteps] = await Promise.all(PARAMS.map((p) => listSteps(run, p)));
      const near = Array.from({ length: NEAR_REQUIRED + 1 }, (_, i) => i);
      const uOk = near.every((s) => uSteps.includes(s));
      const vOk = near.every((s) => vSteps.includes(s));
      if (uOk && vOk) {
        // Vereinigte, in beiden Params vorhandene Steps bis WARM_MAX_STEP.
        const both = uSteps.filter((s) => vSteps.includes(s) && s <= WARM_MAX_STEP);
        log(`Lauf ${run} vollständig genug (near 0…${NEAR_REQUIRED} ✓), warmbare Steps: [${both.join(',')}]`);
        return { run, runAt: cand, steps: both };
      }
      log(`Lauf ${run} noch unvollständig (u:${uSteps.length} v:${vSteps.length} Steps) — weiter zurück`);
    } catch (e) {
      log(`Lauf ${run} Discovery-Fehler (${e?.message || e}) — weiter zurück`);
    }
  }
  return null;
}

function readManifest() {
  try { return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); } catch { return null; }
}

/**
 * Early-Exit-Prüfung: Manifest steht auf diesem Lauf UND führt bereits alle
 * aktuell warmbaren Steps.
 *
 * ── V-81 (2026-08-03) ───────────────────────────────────────────────────────
 * Vorher prüfte der Early-Exit NUR den Lauf. ICON-D2 publiziert seine Schritte
 * aber PROGRESSIV: der erste Tick nach einem neuen Lauf sieht oft nur Steps 0…4,
 * die späteren erscheinen über die folgende Stunde. Mit reiner Lauf-Prüfung fror
 * das Manifest damit auf dem Stand des ersten Warm-Laufs ein — belegt an
 * `public/latest-wind.json`: Lauf 2026072921, nur Steps 0–4, geschrieben 51 min
 * nach Referenzzeit. Da der Client die Liste als autoritativ übernimmt
 * (`wind/iconD2WindSource.ts:340-343`), reichte der Wind-Zeitslider in solchen
 * Fenstern nur 4 statt 12 Stunden voraus. Das ist Funktionsverlust, kein Komfort.
 *
 * `warm-grib.mjs:246` löste dasselbe Problem bereits korrekt — dies ist exakt
 * dieselbe Logik, angepasst an das flache `steps`-Feld des Wind-Manifests.
 */
export function manifestCovers(existing, latest) {
  if (!existing || existing.run !== latest.run) return false;
  const have = Array.isArray(existing.steps) ? existing.steps : [];
  return latest.steps.every((s) => have.includes(s));
}

/** Atomar schreiben: temp + rename (der Client sieht nie ein halbes Manifest). */
function writeManifestAtomic(obj) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  const tmp = `${MANIFEST_PATH}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, MANIFEST_PATH);
}

async function main() {
  log(`Start · publishedFor=${SITE_URL} · Manifest=${MANIFEST_PATH} · WARM_MAX_STEP=${WARM_MAX_STEP}`);

  const latest = await findLatestCompleteRun();
  if (!latest) {
    log('Kein vollständiger Lauf gefunden → Manifest UNVERÄNDERT (graceful degrade). Exit 0.');
    return 0;
  }

  const existing = readManifest();

  // ── BW-2: additiver `repack`-Abschnitt ────────────────────────────────────
  // Der Producer (Daten-Repo `buscosun-data`) tickt unabhängig von diesem Cron.
  // Was hier passiert, ist nur: nachsehen, ob er DIESEN Lauf schon abgelegt hat,
  // und die Fundstelle ins Manifest schreiben. Der Abschnitt ist additiv — ein
  // Client, der ihn nicht kennt, liest das Manifest unverändert.
  //
  // ⚠️ Es wird NICHTS geladen und NICHTS gewärmt: `index.json` ist ein paar KB
  // von raw.githubusercontent.com, kein Byte durch Netlify.
  const repack = await fetchSection(latest.run, 'wind');
  if (repack.note) log(repack.note);
  const nextRepack = carryRepack(existing, latest.run, repack);

  // Der Early-Exit muss den Abschnitt mitprüfen: kommt der Producer erst NACH
  // dem Manifest-Advance zum Zug (Normalfall — er braucht ~2 min je Lauf),
  // stünde der Abschnitt sonst bis zum nächsten DWD-Lauf nicht drin. Exakt das
  // V-81-Muster: „gleicher Lauf" heißt nicht „nichts Neues".
  const repackSettled = sameSection(existing?.repack ?? null, nextRepack);
  if (!FORCE && manifestCovers(existing, latest) && repackSettled) {
    log(`Early-Exit: Manifest steht auf Lauf ${latest.run} und führt alle warmbaren Steps [${latest.steps.join(',')}].`);
    return 0;
  }
  if (manifestCovers(existing, latest) && !repackSettled) {
    // BW-12: „geändert" heißt seit `sameSection` ohne Commit-Vergleich: der
    // Abschnitt kam dazu, fiel weg, oder seine Schrittzahl hat sich bewegt —
    // ein reiner Commit-Wechsel steht hier nicht mehr (§31.9). Deshalb nennt
    // die Zeile die Schrittzahl, nicht den SHA.
    const nSteps = (s) => s?.wind?.steps?.length ?? 0;
    log(`Gleicher Lauf ${latest.run}, aber der Repack-Abschnitt hat sich geändert `
      + `(${nSteps(existing?.repack)} → ${nSteps(nextRepack)} Schritte) → umlegen.`);
  }
  if (existing && existing.run === latest.run) {
    const have = Array.isArray(existing.steps) ? existing.steps : [];
    const missing = latest.steps.filter((s) => !have.includes(s));
    if (missing.length) log(`Gleicher Lauf ${latest.run}, aber neu publizierte Steps [${missing.join(',')}] fehlen im Manifest → nachwärmen (V-81).`);
  }

  // Bestätigte Steps je Param. `latest.steps` stammt aus den DWD-Listings und
  // enthält per Konstruktion nur Steps, die in u UND v publiziert sind
  // (`findLatestCompleteRun`).
  const confirmed = { u_10m: [], v_10m: [] };
  for (const param of PARAMS) {
    confirmed[param] = latest.steps.filter((s) => !(FAIL_STEP != null && s === FAIL_STEP));
  }
  if (FAIL_STEP != null) log(`  FAIL_STEP=${FAIL_STEP} → Step aus beiden Listen entfernt (Fail-Safe-Probe)`);
  log(`${latest.steps.length} Steps aus dem DWD-Listing bestätigt — 0 Bytes durch ${SITE_URL}.`);

  // Fail-Safe: Near-Horizon (0…NEAR_REQUIRED) muss für u UND v vorliegen.
  const near = Array.from({ length: NEAR_REQUIRED + 1 }, (_, i) => i);
  const nearOk = near.every((s) => confirmed.u_10m.includes(s) && confirmed.v_10m.includes(s));
  if (!nearOk) {
    log(`Near-Horizon unvollständig (u:[${confirmed.u_10m.join(',')}] v:[${confirmed.v_10m.join(',')}]).`);
    log('→ Manifest UNVERÄNDERT (Fail-Safe: letzter guter Lauf bleibt, nächster Tick heilt). Exit 0.');
    return 0;
  }

  // In beiden Params vorhandene Steps → das sind die, die der Client sicher findet.
  const fresh = confirmed.u_10m.filter((s) => confirmed.v_10m.includes(s));
  // V-81-Sicherung: innerhalb DESSELBEN Laufs nie Steps verlieren. Dieser Pfad
  // läuft auch bei bereits manifestiertem Lauf — fiele dabei ein einzelner Step
  // aus (Listing-Aussetzer), würde ein reines Überschreiben das Manifest
  // SCHRUMPFEN und dem Client Steps wegnehmen, die er vorher hatte.
  // (Lauf,Step) ist unveränderlich, also bleibt der Alteintrag gültig.
  const steps = mergeSteps(existing, latest.run, fresh);
  const carried = existing && existing.run === latest.run && Array.isArray(existing.steps) ? existing.steps : [];
  const lost = carried.filter((s) => !fresh.includes(s));
  if (lost.length) log(`Hinweis: Steps [${lost.join(',')}] diesmal nicht bestätigt, bleiben aus dem Vorlauf erhalten.`);
  const manifest = {
    run: latest.run,
    runAt: parseRunStr(latest.run).toISOString(),
    steps,
    updatedAt: new Date().toISOString(),
    // Site, FÜR die publiziert wird — Herkunfts-Anker des Wächters H4. Ersetzt
    // das frühere `warmedThroughProxy`: dieses Skript wärmt nichts mehr, das
    // Feld hätte etwas behauptet, das nicht passiert.
    publishedFor: SITE_URL,
  };
  // Additiv und zuletzt: fehlt der Abschnitt, ist das Manifest exakt das von
  // vorher — der Client nimmt dann den GRIB-Pfad (BW-3 hat ihn als benannten
  // Fallback, nicht als Notnagel).
  if (nextRepack) manifest.repack = nextRepack;
  writeManifestAtomic(manifest);
  log(`Manifest umgelegt → Lauf ${manifest.run}, Steps [${steps.join(',')}]`
    + `${nextRepack ? `, Repack-Commit ${nextRepack.commit.slice(0, 7)}` : ', ohne Repack'}. Fertig.`);
  return 0;
}

/**
 * Die Step-Liste, die nach einem Warm-Durchlauf ins Manifest gehört (V-81).
 * Rein, damit `verify-warm-wind.mjs` sie netzfrei prüfen kann — die Warm-Skripte
 * standen bisher komplett außerhalb jeder Verifikation (`architecture.md` §11).
 */
export function mergeSteps(existing, latestRun, fresh) {
  const carried = existing && existing.run === latestRun && Array.isArray(existing.steps) ? existing.steps : [];
  return [...new Set([...carried, ...fresh])].sort((a, b) => a - b);
}

// Nur ausführen, wenn direkt gestartet — sonst könnte der Verifier die Funktionen
// nicht importieren, ohne den Cron mitlaufen zu lassen.
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  main().then((code) => process.exit(code)).catch((e) => { console.error('[warm-wind] FATAL', e); process.exit(1); });
}
