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
 * Kein eccodes, kein Decode, kein bz2 — reines Cache-Wärmen + Manifest.
 * Wind (T1, latest-wind.json + /_dwd_wind) bleibt unberührt.
 *
 * ENV:
 *   SITE_URL            Basis, durch die gewärmt wird (Edge-Cache-Fill).
 *                       Default http://localhost:5196 (vite dev / netlify dev).
 *   MANIFEST_PATH       Zielpfad des Manifests. Default public/latest-grib.json.
 *   DWD_BASE            DWD-Origin für die Lauf-Discovery.
 *                       Default https://opendata.dwd.de/weather/nwp/icon-d2/grib.
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

/** T2-Params mit ihren Karten-Step-Caps (= was der jeweilige Layer maximal lädt:
 *  Temp/Gust 24, Precip 27, Clouds 12 — s. audit/layer-transport.md §C T2-4). */
const PARAMS = [
  { name: 't_2m', maxStep: 24 },
  { name: 'vmax_10m', maxStep: 24 },
  { name: 'tot_prec', maxStep: 27 },
  { name: 'clcl', maxStep: 12 },
  { name: 'clcm', maxStep: 12 },
  { name: 'clch', maxStep: 12 },
  { name: 'clct', maxStep: 12 },
];

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

/** Eine URL DURCH DEN PROXY holen (füllt den Edge-Cache). true bei 2xx. */
async function warmUrl(url, label, failStepMatch) {
  if (failStepMatch) {
    log(`  ✗ FAIL_STEP → simulierter Warm-Fehler ${label}`);
    return false;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) { log(`  ✗ ${res.status} ${label}`); return false; }
    // Body konsumieren (schließt die Verbindung; Bytes werden vom Edge gecacht).
    const buf = await res.arrayBuffer();
    const cacheHdr = res.headers.get('netlify-cdn-cache-control') || res.headers.get('cache-control') || '';
    log(`  ✓ ${label} ${(buf.byteLength / 1024).toFixed(0)} KB ${cacheHdr ? `[${cacheHdr}]` : ''}`);
    return true;
  } catch (e) {
    log(`  ✗ ${label} Fehler ${e?.message || e}`);
    return false;
  }
}

function warmStepUrl(run, param, step) {
  const hh = run.slice(8, 10);
  return `${SITE_URL}/_dwd_grib/weather/nwp/icon-d2/grib/${hh}/${param}/${stepFile(run, param, step)}`;
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

/** Atomar schreiben: temp + rename (der Client sieht nie ein halbes Manifest). */
function writeManifestAtomic(obj) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  const tmp = `${MANIFEST_PATH}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, MANIFEST_PATH);
}

async function main() {
  log(`Start · SITE_URL=${SITE_URL} · Manifest=${MANIFEST_PATH} · Params=${PARAMS.map((p) => `${p.name}≤${capOf(p)}`).join(',')}`);

  const latest = await findLatestCompleteRun();
  if (!latest) {
    log('Kein vollständiger Lauf gefunden → Manifest UNVERÄNDERT (graceful degrade). Exit 0.');
    return 0;
  }

  const existing = readManifest();
  if (!FORCE && manifestCovers(existing, latest)) {
    log(`Early-Exit: Manifest steht bereits auf Lauf ${latest.run} und deckt alle warmbaren Steps ab.`);
    return 0;
  }

  // Cache füllen — ERST wärmen, DANN umlegen. Flache Task-Liste (Param × Step)
  // + hsurf (Invariante, braucht der Temp-Layer), Pool mit WARM_CONCURRENCY.
  const tasks = [];
  for (const p of PARAMS) {
    for (const step of latest.stepsByParam[p.name]) tasks.push({ param: p.name, step });
  }
  log(`Wärme Lauf ${latest.run} (${tasks.length} Step-Dateien + hsurf) durch ${SITE_URL}/_dwd_grib …`);

  const warmed = Object.fromEntries(PARAMS.map((p) => [p.name, []]));
  let ptr = 0;
  const workers = Array.from({ length: Math.min(WARM_CONCURRENCY, tasks.length) }, async () => {
    while (ptr < tasks.length) {
      const t = tasks[ptr++];
      const ok = await warmUrl(
        warmStepUrl(latest.run, t.param, t.step),
        `${t.param}/${t.step}`,
        FAIL_STEP != null && t.step === FAIL_STEP,
      );
      if (ok) warmed[t.param].push(t.step);
    }
  });
  await Promise.all(workers);

  // hsurf best-effort (kein Gate: der Client holt sie notfalls ungewärmt durch
  // den Proxy und läuft ohne hsurf schlicht ohne Höhen-Refinement weiter).
  const hh = latest.run.slice(8, 10);
  await warmUrl(`${SITE_URL}/_dwd_grib/weather/nwp/icon-d2/grib/${hh}/hsurf/${invariantFile(latest.run, 'hsurf')}`, 'hsurf', false);

  // Fail-Safe: Near-Horizon (0…NEAR_REQUIRED) muss für JEDEN Param gewärmt sein.
  const near = Array.from({ length: NEAR_REQUIRED + 1 }, (_, i) => i);
  const nearBad = PARAMS.filter((p) => !near.every((s) => warmed[p.name].includes(s)));
  if (nearBad.length > 0) {
    log(`Near-Horizon nicht vollständig gewärmt (${nearBad.map((p) => `${p.name}:[${warmed[p.name].join(',')}]`).join(' ')}).`);
    log('→ Manifest UNVERÄNDERT (Fail-Safe: letzter guter Lauf bleibt, nächster Tick heilt). Exit 0.');
    return 0;
  }

  const manifest = {
    run: latest.run,
    runAt: parseRunStr(latest.run).toISOString(),
    updatedAt: new Date().toISOString(),
    warmedThroughProxy: `${SITE_URL}/_dwd_grib`,
    params: Object.fromEntries(PARAMS.map((p) => [p.name, warmed[p.name].sort((a, b) => a - b)])),
  };
  writeManifestAtomic(manifest);
  log(`Manifest umgelegt → Lauf ${manifest.run}, Steps ${PARAMS.map((p) => `${p.name}:${manifest.params[p.name].length}`).join(' ')}. Fertig.`);
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => { console.error('[warm-grib] FATAL', e); process.exit(1); });
