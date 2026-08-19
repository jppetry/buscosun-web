/**
 * warm-grib.mjs — Warm-Cron für die ICON-D2-Kartenlayer Temp/Gust/Precip/Clouds
 * (Phase T2-4, Generalisierung von warm-wind.mjs / Phase T1.2).
 *
 * Rolle: füllt den Durable-Edge-Cache (`/_dwd_grib/*`, s. netlify/edge-functions/
 * dwd-grib.ts) mit den immutablen (Lauf,Step)-GRIB-Dateien ALLER T2-Params und
 * legt DANACH das kombinierte Manifest `latest-grib.json` um. Der Client
 * (resolveLatestRun → resolveRunFromManifest) liest nur dieses Manifest →
 * praktisch kein Besucher trifft den kalten DWD-Pfad oder ein Directory-Listing.
 *
 * Ablauf (idempotent, self-healing, atomar):
 *   1. Neuesten Lauf finden, dessen Near-Horizon (0…NEAR_REQUIRED) für ALLE
 *      Params publiziert ist (DWD-Directory-Listings, Rückwärtssuche).
 *   2. Early-Exit, wenn das Manifest bereits auf diesem Lauf steht UND alle
 *      aktuell warmbaren Steps schon enthält. Der Steps-Vergleich (ggü. T1 neu)
 *      ist nötig, weil ICON-D2 progressiv publiziert: der erste Warm-Lauf eines
 *      frischen Laufs erwischt sonst nur einen Teil des Horizonts und ein reiner
 *      Lauf-Vergleich würde den Rest bis zum nächsten Lauf (~3 h) nie nachwärmen.
 *      Nachwärmen bereits gewärmter Steps ist billig (Edge-Cache-Hit, kein DWD-Load).
 *   3. Alle URLs (Param × Steps bis zum jeweiligen Karten-Cap + hsurf) DURCH DEN
 *      PROXY (`SITE_URL/_dwd_grib`) holen → füllt den Edge-Cache (parallelisiert,
 *      WARM_CONCURRENCY). Fehlt eine Near-Horizon-Datei → Manifest NICHT umlegen.
 *   4. ERST DANACH das Manifest atomar schreiben (temp + rename, zuletzt).
 *
 * Graceful degrade wie T1: schlägt 1/3 fehl, bleibt das alte Manifest stehen →
 * der Client serviert den letzten gewärmten Lauf (stale, nie kalt) bzw. fällt
 * nach dem 24h-Staleness-Guard auf den Directory-Scan zurück. Nächster Tick heilt.
 *
 * Phase T2b-3: zusätzlich werden die ICON-D2-**EPS**-Dateien gewärmt (icosahedral,
 * Fusion-Engine via src/sources/iconD2EpsSource.ts — die 4–15-s-Kaltload-Sünder):
 * eigener EPS-Lauf (eigene Discovery, Spiegel von resolveLatestEpsRun), exakt die
 * Client-Menge (5 Variablen × Steps 0/3/6 + clat/clon-Invarianten) durch
 * `/_dwd_grib/weather/nwp/icon-d2-eps/grib`. Das Manifest bekommt einen
 * sekundären `eps`-Abschnitt (Doku/Ops — der Client liest ihn NICHT, seine
 * EPS-Lauf-Discovery bleibt der Directory-Scan). EPS-Fehler blockieren NIE das
 * Umlegen des 2D-Manifests (und umgekehrt hält ein 2D-Fehler den EPS-Byte-Warm
 * nicht auf); Early-Exit prüft beide Abschnitte getrennt.
 *
 * Kein eccodes, kein Decode, kein bz2 — reines Cache-Wärmen + Manifest.
 * Wind (T1, latest-wind.json + /_dwd_wind) bleibt unberührt.
 *
 * ENV:
 *   SITE_URL            Basis, durch die gewärmt wird (Edge-Cache-Fill).
 *                       Default http://localhost:5196 (vite dev / netlify dev).
 *   MANIFEST_PATH       Zielpfad des Manifests. Default public/latest-grib.json.
 *   DWD_BASE            DWD-Origin für die Lauf-Discovery.
 *                       Default https://opendata.dwd.de/weather/nwp/icon-d2/grib.
 *   EPS_DWD_BASE        DWD-Origin für die EPS-Lauf-Discovery. Default
 *                       https://opendata.dwd.de/weather/nwp/icon-d2-eps/grib.
 *   NEAR_REQUIRED       Steps 0…N müssen je Param gewärmt sein, um umzulegen. Default 4.
 *   WARM_CONCURRENCY    Parallele Warm-Fetches. Default 4.
 *   WARM_MAX_STEP       TEST: globaler Step-Cap, der die per-Param-Caps zusätzlich
 *                       deckelt (kleiner Probelauf). Default: unbegrenzt.
 *   FAIL_STEP           TEST: erzwingt Warm-Fehler für diesen Step (Fail-Safe-Probe).
 *   FORCE               '1' überspringt den Early-Exit (erneut wärmen).
 */

import { writeFileSync, renameSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SITE_URL = (process.env.SITE_URL || 'http://localhost:5196').replace(/\/+$/, '');
const MANIFEST_PATH = resolve(process.env.MANIFEST_PATH || 'public/latest-grib.json');
const DWD_BASE = (process.env.DWD_BASE || 'https://opendata.dwd.de/weather/nwp/icon-d2/grib').replace(/\/+$/, '');
const NEAR_REQUIRED = Number(process.env.NEAR_REQUIRED ?? 4);
const WARM_CONCURRENCY = Math.max(1, Number(process.env.WARM_CONCURRENCY ?? 4));
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
const pad3 = (n) => String(n).padStart(3, '0');
const log = (...a) => console.log('[warm-grib]', ...a);

const capOf = (p) => (WARM_MAX_STEP != null ? Math.min(p.maxStep, WARM_MAX_STEP) : p.maxStep);

function runStrOf(date) {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}${pad2(date.getUTCHours())}`;
}
function parseRunStr(run) {
  return new Date(Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10)));
}
function stepFile(run, param, step) {
  return `icon-d2_germany_regular-lat-lon_single-level_${run}_${pad3(step)}_2d_${param}.grib2.bz2`;
}
function invariantFile(run, param) {
  return `icon-d2_germany_regular-lat-lon_time-invariant_${run}_000_0_${param}.grib2.bz2`;
}
function epsStepFile(run, param, step) {
  return `icon-d2-eps_germany_icosahedral_single-level_${run}_${pad3(step)}_2d_${param}.grib2.bz2`;
}
function epsInvariantFile(run, param) {
  return `icon-d2-eps_germany_icosahedral_time-invariant_${run}_000_0_${param}.grib2.bz2`;
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

/** Eine URL DURCH DEN PROXY holen (füllt den Edge-Cache). true bei 2xx.
 *  Phase T2c: transiente Fehler (undici "fetch failed"/"terminated", 5xx)
 *  werden bis zu 2× wiederholt (1 s / 3 s Backoff) — die Prod-Logs (Audit §J)
 *  zeigten, dass sonst schon 1 Ausfall unter ~130 Dateien via Near-Horizon-
 *  Fail-Safe den gesamten Manifest-Advance blockiert. 4xx (unpublizierter
 *  Step) wird bewusst NICHT wiederholt. */
async function warmUrl(url, label, failStepMatch) {
  if (failStepMatch) {
    log(`  ✗ FAIL_STEP → simulierter Warm-Fehler ${label}`);
    return false;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 1000 : 3000));
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status >= 500 && attempt < 2) { log(`  … ${res.status} ${label} — Retry ${attempt + 1}`); continue; }
        log(`  ✗ ${res.status} ${label}`);
        return false;
      }
      // Body konsumieren (schließt die Verbindung; Bytes werden vom Edge gecacht).
      const buf = await res.arrayBuffer();
      const cacheHdr = res.headers.get('netlify-cdn-cache-control') || res.headers.get('cache-control') || '';
      log(`  ✓ ${label} ${(buf.byteLength / 1024).toFixed(0)} KB ${cacheHdr ? `[${cacheHdr}]` : ''}`);
      return true;
    } catch (e) {
      if (attempt < 2) { log(`  … ${label} ${e?.message || e} — Retry ${attempt + 1}`); continue; }
      log(`  ✗ ${label} Fehler ${e?.message || e}`);
      return false;
    }
  }
  return false;
}

function warmStepUrl(run, param, step) {
  const hh = run.slice(8, 10);
  return `${SITE_URL}/_dwd_grib/weather/nwp/icon-d2/grib/${hh}/${param}/${stepFile(run, param, step)}`;
}
function warmEpsStepUrl(run, param, step) {
  const hh = run.slice(8, 10);
  return `${SITE_URL}/_dwd_grib/weather/nwp/icon-d2-eps/grib/${hh}/${param}/${epsStepFile(run, param, step)}`;
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
  log(`Start · SITE_URL=${SITE_URL} · Manifest=${MANIFEST_PATH} · Params=${PARAMS.map((p) => `${p.name}≤${capOf(p)}`).join(',')} · EPS=${EPS_PARAMS.join(',')}≤${EPS_MAX_STEP}`);

  const existing = readManifest();

  // Discovery beider Familien getrennt — ein Ausfall der einen hält die andere
  // nicht auf (2D-Karte und Fusion/EPS haben eigene Läufe + eigene Nutzer).
  const latest = await findLatestCompleteRun();
  if (!latest) log('Kein vollständiger 2D-Lauf gefunden → 2D-Abschnitt UNVERÄNDERT (graceful degrade).');
  let latestEps = null;
  try { latestEps = await findLatestEpsRun(); } catch (e) { log(`EPS-Discovery-Fehler (${e?.message || e}).`); }
  if (!latestEps) log('Kein EPS-Lauf gefunden → eps-Abschnitt UNVERÄNDERT (graceful degrade).');

  const needMain = latest != null && (FORCE || !manifestCovers(existing, latest));
  const needEps = latestEps != null && (FORCE || !manifestCoversEps(existing, latestEps));
  if (!needMain && !needEps) {
    log('Early-Exit: Manifest deckt 2D und EPS bereits vollständig ab.');
    return 0;
  }
  if (!needMain && latest) log(`2D bereits abgedeckt (Lauf ${latest.run}) → nur EPS wärmen.`);
  if (!needEps && latestEps) log(`EPS bereits abgedeckt (Lauf ${latestEps.run}) → nur 2D wärmen.`);

  // Cache füllen — ERST wärmen, DANN umlegen. Flache Task-Liste BEIDER Familien
  // (Param × Step), Pool mit WARM_CONCURRENCY; nur nicht-abgedeckte Familien.
  const tasks = [];
  if (needMain) for (const p of PARAMS) for (const step of latest.stepsByParam[p.name]) tasks.push({ fam: '2d', param: p.name, step });
  if (needEps) for (const p of EPS_PARAMS) for (const step of latestEps.stepsByParam[p]) tasks.push({ fam: 'eps', param: p, step });
  log(`Wärme ${tasks.length} Step-Dateien (+ Invarianten) durch ${SITE_URL}/_dwd_grib …`);

  const warmed = Object.fromEntries(PARAMS.map((p) => [p.name, []]));
  const warmedEps = Object.fromEntries(EPS_PARAMS.map((p) => [p, []]));
  let ptr = 0;
  const workers = Array.from({ length: Math.min(WARM_CONCURRENCY, Math.max(tasks.length, 1)) }, async () => {
    while (ptr < tasks.length) {
      const t = tasks[ptr++];
      const url = t.fam === 'eps'
        ? warmEpsStepUrl(latestEps.run, t.param, t.step)
        : warmStepUrl(latest.run, t.param, t.step);
      const ok = await warmUrl(url, `${t.fam === 'eps' ? 'eps:' : ''}${t.param}/${t.step}`, FAIL_STEP != null && t.step === FAIL_STEP);
      if (ok) (t.fam === 'eps' ? warmedEps : warmed)[t.param].push(t.step);
    }
  });
  await Promise.all(workers);

  // Invarianten best-effort (kein Gate: der Client holt sie notfalls ungewärmt
  // durch den Proxy): hsurf (Temp-Layer), clat/clon (EPS-Zellkoordinaten).
  if (needMain) {
    const hh = latest.run.slice(8, 10);
    await warmUrl(`${SITE_URL}/_dwd_grib/weather/nwp/icon-d2/grib/${hh}/hsurf/${invariantFile(latest.run, 'hsurf')}`, 'hsurf', false);
  }
  if (needEps) {
    const hh = latestEps.run.slice(8, 10);
    for (const p of ['clat', 'clon']) {
      await warmUrl(`${SITE_URL}/_dwd_grib/weather/nwp/icon-d2-eps/grib/${hh}/${p}/${epsInvariantFile(latestEps.run, p)}`, `eps:${p}`, false);
    }
  }

  // Fail-Safes je Familie, UNABHÄNGIG — ein EPS-Fehlschlag blockiert nie das
  // Umlegen des 2D-Manifests (und umgekehrt). Nächster Tick heilt die andere Seite.
  let advanceMain = false;
  if (needMain) {
    const near = Array.from({ length: NEAR_REQUIRED + 1 }, (_, i) => i);
    const nearBad = PARAMS.filter((p) => !near.every((s) => warmed[p.name].includes(s)));
    if (nearBad.length > 0) {
      log(`2D-Near-Horizon nicht vollständig gewärmt (${nearBad.map((p) => `${p.name}:[${warmed[p.name].join(',')}]`).join(' ')}) → 2D-Abschnitt UNVERÄNDERT (Fail-Safe).`);
    } else advanceMain = true;
  }
  let advanceEps = false;
  if (needEps) {
    const epsBad = EPS_PARAMS.filter((p) => !latestEps.stepsByParam[p].every((s) => warmedEps[p].includes(s)));
    if (epsBad.length > 0 || latestEps.stepsByParam.t_2m.length === 0) {
      log(`EPS nicht vollständig gewärmt (${epsBad.map((p) => `${p}:[${warmedEps[p].join(',')}]`).join(' ')}) → eps-Abschnitt UNVERÄNDERT (Fail-Safe).`);
    } else advanceEps = true;
  }
  if (!advanceMain && !advanceEps) {
    log('Nichts umzulegen (Fail-Safes). Exit 0.');
    return 0;
  }

  // Manifest komponieren: nicht-avancierte Abschnitte 1:1 aus dem Bestand.
  const mainRun = advanceMain ? latest.run : existing?.run;
  const mainParams = advanceMain
    ? Object.fromEntries(PARAMS.map((p) => [p.name, warmed[p.name].sort((a, b) => a - b)]))
    : existing?.params;
  if (typeof mainRun !== 'string' || mainParams == null || typeof mainParams !== 'object') {
    // Ohne gültigen 2D-Abschnitt wäre das Manifest für den Client unbrauchbar
    // (gribManifest.ts verlangt run+params) → nicht schreiben; EPS-Bytes sind
    // trotzdem gewärmt (der Client findet sie über seinen Directory-Scan).
    log('Kein gültiger 2D-Abschnitt verfügbar → Manifest NICHT geschrieben (EPS-Bytes sind gewärmt). Exit 0.');
    return 0;
  }
  const epsSection = advanceEps
    ? {
        run: latestEps.run,
        runAt: parseRunStr(latestEps.run).toISOString(),
        params: Object.fromEntries(EPS_PARAMS.map((p) => [p, warmedEps[p].sort((a, b) => a - b)])),
      }
    : existing?.eps;

  const manifest = {
    run: mainRun,
    runAt: advanceMain ? parseRunStr(latest.run).toISOString() : (existing?.runAt ?? parseRunStr(mainRun).toISOString()),
    updatedAt: new Date().toISOString(),
    warmedThroughProxy: `${SITE_URL}/_dwd_grib`,
    params: mainParams,
    ...(epsSection ? { eps: epsSection } : {}),
  };
  writeManifestAtomic(manifest);
  log(`Manifest umgelegt → 2D-Lauf ${manifest.run}${advanceMain ? ' (neu)' : ' (übernommen)'}${epsSection ? ` · EPS-Lauf ${epsSection.run}${advanceEps ? ' (neu)' : ' (übernommen)'}` : ''}. Fertig.`);
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => { console.error('[warm-grib] FATAL', e); process.exit(1); });
