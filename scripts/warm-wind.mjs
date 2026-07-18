/**
 * warm-wind.mjs — Warm-Cron für den ICON-D2-Wind-Layer (Phase T1.2).
 *
 * Rolle: füllt den Durable-Edge-Cache (`/_dwd_wind/*`, s. netlify/edge-functions/
 * dwd-wind.ts) mit den immutablen (Lauf,Step)-Wind-GRIB-Dateien und legt DANACH
 * das Manifest `latest-wind.json` um. Der Client (T1.3) liest nur dieses Manifest
 * → praktisch kein Besucher trifft den kalten DWD-Pfad.
 *
 * Ablauf (idempotent, self-healing, atomar):
 *   1. Neuesten VOLLSTÄNDIGEN Lauf finden (DWD-Directory-Listing, Rückwärtssuche).
 *   2. Early-Exit, wenn das Manifest bereits auf diesem Lauf steht (kostet Sekunden).
 *   3. Alle Wind-URLs (0…WARM_MAX_STEP × u/v) DURCH DEN PROXY (`SITE_URL/_dwd_wind`)
 *      curlen → füllt den Edge-Cache. Fehlt eine Near-Horizon-Datei → NICHT umlegen.
 *   4. ERST DANACH das Manifest atomar schreiben (temp + rename, zuletzt).
 *
 * Graceful degrade: schlägt Schritt 1/3 fehl, bleibt das alte Manifest stehen →
 * der Client serviert den letzten gewärmten Lauf (stale, nie kalt). Der nächste
 * Tick heilt selbst.
 *
 * Kein eccodes, kein Decode, kein bz2 — reines Cache-Wärmen + Manifest.
 *
 * ENV:
 *   SITE_URL            Basis, durch die gewärmt wird (Edge-Cache-Fill).
 *                       Default http://localhost:5178 (vite dev / netlify dev).
 *   MANIFEST_PATH       Zielpfad des Manifests. Default public/latest-wind.json.
 *   DWD_BASE            DWD-Origin für die Lauf-Discovery.
 *                       Default https://opendata.dwd.de/weather/nwp/icon-d2/grib.
 *   WARM_MAX_STEP       Höchster zu wärmender Vorlaufschritt. Default 12.
 *   NEAR_REQUIRED       Steps 0…N müssen (u+v) gewärmt sein, um umzulegen. Default 4.
 *   FAIL_STEP           TEST: erzwingt Warm-Fehler für diesen Step (Fail-Safe-Probe).
 *   FORCE               '1' überspringt den Early-Exit (erneut wärmen).
 */

import { writeFileSync, renameSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SITE_URL = (process.env.SITE_URL || 'http://localhost:5178').replace(/\/+$/, '');
const MANIFEST_PATH = resolve(process.env.MANIFEST_PATH || 'public/latest-wind.json');
const DWD_BASE = (process.env.DWD_BASE || 'https://opendata.dwd.de/weather/nwp/icon-d2/grib').replace(/\/+$/, '');
const WARM_MAX_STEP = Number(process.env.WARM_MAX_STEP ?? 12);
const NEAR_REQUIRED = Number(process.env.NEAR_REQUIRED ?? 4);
const FAIL_STEP = process.env.FAIL_STEP != null ? Number(process.env.FAIL_STEP) : null;
const FORCE = process.env.FORCE === '1';
const PARAMS = ['u_10m', 'v_10m'];

const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (n) => String(n).padStart(3, '0');
const log = (...a) => console.log('[warm-wind]', ...a);

function runStrOf(date) {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}${pad2(date.getUTCHours())}`;
}
function parseRunStr(run) {
  return new Date(Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10)));
}
function stepFile(run, param, step) {
  return `icon-d2_germany_regular-lat-lon_single-level_${run}_${pad3(step)}_2d_${param}.grib2.bz2`;
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

/** Eine Datei DURCH DEN PROXY holen (füllt den Edge-Cache). true bei 2xx. */
async function warmOne(run, param, step) {
  if (FAIL_STEP != null && step === FAIL_STEP) {
    log(`  ✗ FAIL_STEP=${step} → simulierter Warm-Fehler ${param}/${step}`);
    return false;
  }
  const hh = run.slice(8, 10);
  const url = `${SITE_URL}/_dwd_wind/weather/nwp/icon-d2/grib/${hh}/${param}/${stepFile(run, param, step)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) { log(`  ✗ ${res.status} ${param}/${step}`); return false; }
    // Body konsumieren (schließt die Verbindung; Bytes werden vom Edge gecacht).
    const buf = await res.arrayBuffer();
    const cacheHdr = res.headers.get('netlify-cdn-cache-control') || res.headers.get('cache-control') || '';
    log(`  ✓ ${param}/${step} ${(buf.byteLength / 1024).toFixed(0)} KB ${cacheHdr ? `[${cacheHdr}]` : ''}`);
    return true;
  } catch (e) {
    log(`  ✗ ${param}/${step} Fehler ${e?.message || e}`);
    return false;
  }
}

function readManifest() {
  try { return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); } catch { return null; }
}

/** Atomar schreiben: temp + rename (der Client sieht nie ein halbes Manifest). */
function writeManifestAtomic(obj) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  const tmp = `${MANIFEST_PATH}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, MANIFEST_PATH);
}

async function main() {
  log(`Start · SITE_URL=${SITE_URL} · Manifest=${MANIFEST_PATH} · WARM_MAX_STEP=${WARM_MAX_STEP}`);

  const latest = await findLatestCompleteRun();
  if (!latest) {
    log('Kein vollständiger Lauf gefunden → Manifest UNVERÄNDERT (graceful degrade). Exit 0.');
    return 0;
  }

  const existing = readManifest();
  if (!FORCE && existing && existing.run === latest.run) {
    log(`Early-Exit: Manifest steht bereits auf Lauf ${latest.run} (kein neuer Lauf).`);
    return 0;
  }

  // Cache füllen — ERST wärmen, DANN umlegen.
  log(`Wärme Lauf ${latest.run} (${latest.steps.length} Steps × ${PARAMS.length} Params) durch ${SITE_URL}/_dwd_wind …`);
  const warmed = { u_10m: [], v_10m: [] };
  for (const step of latest.steps) {
    for (const param of PARAMS) {
      const ok = await warmOne(latest.run, param, step);
      if (ok) warmed[param].push(step);
    }
  }

  // Fail-Safe: Near-Horizon (0…NEAR_REQUIRED) muss für u UND v gewärmt sein.
  const near = Array.from({ length: NEAR_REQUIRED + 1 }, (_, i) => i);
  const nearOk = near.every((s) => warmed.u_10m.includes(s) && warmed.v_10m.includes(s));
  if (!nearOk) {
    log(`Near-Horizon nicht vollständig gewärmt (u:[${warmed.u_10m.join(',')}] v:[${warmed.v_10m.join(',')}]).`);
    log('→ Manifest UNVERÄNDERT (Fail-Safe: letzter guter Lauf bleibt, nächster Tick heilt). Exit 0.');
    return 0;
  }

  // In beiden Params gewärmte Steps → das sind die, die der Client sicher findet.
  const steps = warmed.u_10m.filter((s) => warmed.v_10m.includes(s)).sort((a, b) => a - b);
  const manifest = {
    run: latest.run,
    runAt: parseRunStr(latest.run).toISOString(),
    steps,
    updatedAt: new Date().toISOString(),
    warmedThroughProxy: `${SITE_URL}/_dwd_wind`,
  };
  writeManifestAtomic(manifest);
  log(`Manifest umgelegt → Lauf ${manifest.run}, Steps [${steps.join(',')}]. Fertig.`);
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => { console.error('[warm-wind] FATAL', e); process.exit(1); });
