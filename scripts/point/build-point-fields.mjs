#!/usr/bin/env node
/**
 * NP-0b — Kartenfelder aus dem frisch gebauten Punkt-Cube (audit/np0-datenprodukte.md §3.3, §8; E-NP0-4 F1, E-NP0-5).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/point/build-point-fields.mjs \
 *        --tier=t1 [--point=<…/point>] [--run=YYYYMMDDHH] [--workers=N] [--cells=N] [--force] [--out=<dir>]
 *
 * Je Zelle der Stufe (am Zellmittelpunkt) rechnet es buscosun Fusion mit dem Cube als EINZIGER Quelle — `fuseCubePoint`
 * UNVERÄNDERT, mit den Optionen der Stufe fs (Lernstufe, gelernte Hürde, …; ohne Station, Radar, Messung) — und liest
 * aus dem Ergebnis dieselben Größen, die der Ort ohne Station zeigt (Regeln von `toPointForecastV2`, nur für diese zwei
 * Größen — `fieldValuesFromResult`, gegen V2 geprüft im Verifier; nur die Ebenen dieser Größen, `fieldPlanes`):
 *   · Niederschlag: Chance = 1 − cdf(0), Median | nass, q90 unbedingt (`fusion/dist.ts`)
 *   · Schneefallgrenze: Mitte und Band ∓ 1,2816·σ mit der Herkunft σ_ens / σ_div (`fusion/output.ts` fromCell)
 * Gelände: flach in Modellhöhe (`terrainScales` mit konstanter Höhe — benannt, V-NP0-19; am Archiv bewegt Gelände die
 * Chance um Median 0,0001). Höhe h_true = Modellhöhe der Zelle (`hModEff`) — keine Höhenkorrektur des Felds.
 *
 * Lesen mit DEMSELBEN Weg wie der Client: `decodeCubeChunk` + `cubeSeriesFrom` (Chunks, Ebenen und Zeiger aus `run.json`).
 * Schreiben: Bau-Ablage `point/.build/field-<lauf>-<stufe>` → Umbenennen nach `point/field/v1/<lauf>/<stufe>` → `field.json`
 * zuletzt → Index. Ein Fehler beendet NUR diesen Schritt (Exit ≠ 0, Workflow `continue-on-error`) — der Cube ist schon gebaut.
 *
 * Schalter: `POINT_FIELDS=0` ⇒ nichts tun (Exit 0). Frist: die kleinere aus `FIELD_DEADLINE_S` (360 s) und der Restzeit
 * bis `FIELD_END_MIN` nach dem Jobstart (`FIELD_JOB_T0`, Workflow) — Regel F′; danach kein Feld für diesen Lauf. V-RC-2: aber nie
 * weniger als das Mindestfenster der Stufe (`FIELD_MIN_S_BY_TIER`, t2/t3 45 s; `fieldStore.mjs`).
 * Zeitbudget t1 (E-NP0-5 b′): dauerte das letzte t1-Feld länger als `FIELD_BUDGET_S` (300 s) oder brach es an der eigenen
 * Frist ab und liegt es höchstens 3 h zurück, wird dieser t1-Lauf ausgelassen (jeder zweite Lauf) — `field/v1/budget.json`.
 * Gemessen lokal (4 Worker, i3-1005G1): t1 188 s, t2 32 s, t3 12 s (audit §8.6).
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, renameSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { execFileSync } from 'node:child_process';
import { decodeCubeChunk, TIER_BY_ID } from '../../src/point/cubeFormat.ts';
import { cubeSeriesFrom } from '../../src/point/client/cubePoint.ts';
import { fuseCubePoint } from '../../src/pointForecast/cubeSource.ts';
import { FUSION_CURRENT, FUSION_NAME, fusionStage } from '../../src/pointForecast/fusion/fusionRelease.ts';
import { cdfOf, quantileOf, meanOf, exceedance } from '../../src/pointForecast/fusion/dist.ts';
import { terrainScales } from '../../src/pointForecast/fusion/terrainScale.ts';
import { ClimaField } from '../../src/ml/climaField.ts';
import { validateTables } from '../../src/point/fusionFit/tables.ts';
import {
  fieldRunDir, fieldFileName, fieldPixelOffset, encodePrecipPixel, encodeSnowPixel, encodePrecipCumPixel, encodePexcPixel, makeFieldManifest,
  FIELD_MANIFEST_FILE, PRECIP_XMAX,
} from '../../src/point/fieldFormat.ts';
import { encodePng } from '../lib/png.mjs';
import { latestTierRun, fieldRoot, writeFieldIndex, FIELD_MIN_S_BY_TIER } from './fieldStore.mjs';

const H = 3_600_000;
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Die Optionen der Stufe fs ohne Station/Radar, aus dem Register der Stände (`fusionRelease.ts`: ein neuer Stand von
 * buscosun Fusion kommt hier ohne Eingriff an) — dieselbe Kette, mit der D-NP0-10 die Gleichheit zu buscosun Fusion
 * ohne Station am Archiv belegt hat (98,9 % von 191 529 Zeilen gleich, `audit/np0-datenprodukte/diag-d-chance.md` §2.4);
 * `cubeSource.ts` `forecastFromBundle` setzt sie mit Tabellen genauso. `stationValue` und `anomalyInterp` wirken ohne
 * Station bzw. mit nativen Schritten nicht und fehlen deshalb; Stände, die eine Messung brauchen, rechnen ohne Messung
 * wie der Stand davor. Das Etikett des Produkts bleibt „Modell · Cube" (F1); das Manifest nennt den Stand in `chain`.
 */
export const FIELD_FUSE_OPTIONS = Object.freeze({
  hourly: false, tail: false, learned: true,
  ...fusionStage().options,
});

/** Flaches Gelände in Höhe h — mit der Funktion des Motors gebaut (`terrainScales`), nicht von Hand. */
export function flatTerrain(h, lat, lon) {
  const scales = terrainScales(() => h, lon, lat);
  return { elevationM: h, tpi500M: 0, tpi2000M: 0, svf: 1, slopeDeg: 0, aspectDeg: null, horizonDeg: new Array(8).fill(0), scales, sinkDepthM: 0 };
}

/** Eingabe des Motors für EINE Zelle (rein; der Verifier ruft dieselbe Funktion für die Konsistenz-Probe). */
export function cellInput({ series, tier, runAtMs, nowMs, clima, learned }) {
  const h = series.hModEffM ?? series.steps.find((s) => s.values.hModEff != null)?.values.hModEff ?? null;
  const lat = series.cell.lat, lon = series.cell.lon;
  return {
    lat, lon, country: null, nowMs,
    window: { fromMs: runAtMs + tier.fromH * H, toMs: runAtMs + tier.toH * H, stepH: 1 },
    elevationM: h, elevationFrom: 'input',
    terrain: h == null ? null : flatTerrain(h, lat, lon),
    cube: { [tier.id]: series }, station: null, stationReason: 'Kartenfeld: keine Station (Modell · Cube)',
    nowcast: [], nowcastCovering: [], urban: null, index: { commit: null },
    clima, obs: null, learned, notes: [], skips: [], errors: [],
  };
}

/**
 * Die Ebenen, die das Feld braucht — `cubeSeriesFrom(…, { wanted })` wie der progressive Client-Leser. Ohne Temperatur,
 * Wind, Wolken rechnet der Motor diese Größen nicht (gemessen t1: 17,1 → 10,8 ms je Zelle); Niederschlag und
 * Schneefallgrenze bleiben exakt gleich (3 920 / 3 920 Zell·Schritte, max |Δ| 0 — `verify:np0-fields` prüft es je Stufe).
 */
export const FIELD_PLANE_PREFIXES = Object.freeze(['precip', 'snowlmt', 'hModEff']);
export function fieldPlanes(planes) {
  return planes.map((p) => p.id).filter((id) => FIELD_PLANE_PREFIXES.some((w) => id === w || id.startsWith(`${w}_`)));
}

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x));

/**
 * Phase RC (E-RC-2, `audit/regenchance.md` §3): P(≥ 1 mm) und P(≥ 5 mm) im Intervall des Schritts aus DERSELBEN Verteilung —
 * `exceedance` auf der mittleren Rate, Schwelle x mm über stepH Stunden = Rate x/stepH. Nur gelesen, kein Motor-Eingriff.
 */
export function pexcOf(pr, stepH) {
  return { ge1: exceedance(pr, 1 / stepH), ge5: exceedance(pr, 5 / stepH) };
}

/**
 * Feldwerte je nativem Schritt DIREKT aus dem Motor-Ergebnis — dieselben Regeln wie `toPointForecastV2` für genau diese
 * zwei Größen (Niederschlag: `fused.precipitation.dist`; Schneefallgrenze: `fromCell` — Cube-Sample, sonst Zellwert;
 * σ_ens vor σ_div; auf 1 m gerundet). Spart die Ausgabe der übrigen Größen (≈ 3 ms je Zelle). `verify:np0-fields` hält
 * beide Wege an ≥ 50 Zellen je Stufe gegeneinander.
 */
export function fieldValuesFromResult(r, leadsMs, stepH = 1) {
  const byT = new Map(r.steps.filter((s) => !s.interpolated).map((s) => [s.validAtMs, s]));
  return leadsMs.map((t) => {
    const s = byT.get(t);
    // Nur eine Verteilung MIT Cube-Member: reine Klimatologie (`climatologyOnly`, die Zelle trägt keinen Niederschlag) wäre
    // kein „Modell · Cube" — dort fehlt das Feld (A = 0), nie die Klimatologie unter falschem Etikett.
    const fp = s?.fused?.precipitation ?? null;
    const pr = fp && !fp.climatologyOnly ? fp.dist ?? null : null;
    let precip = null;
    if (pr) {
      const pDry = Math.min(1, Math.max(0, cdfOf(pr, 0)));
      precip = { chance: 1 - pDry, medianWet: pDry < 1 ? quantileOf(pr, pDry + 0.5 * (1 - pDry)) : null, q90: pDry >= 0.9 ? 0 : Math.max(0, quantileOf(pr, 0.9)), mean: meanOf(pr), ...pexcOf(pr, stepH) };
    }
    let snow = null;
    if (s) {
      const fin = (x) => (x == null || !Number.isFinite(x) ? null : x);
      const cubeSample = (s.samples ?? []).find((x) => x.source.startsWith('cube-')) ?? null;
      const anySample = (s.samples ?? []).find((x) => fin(x.snowLine) != null) ?? null;
      const value = (cubeSample ? fin(cubeSample.snowLine) : null) ?? (anySample ? fin(anySample.snowLine) : null) ?? s.cell.snowlmt ?? null;
      if (value != null && Number.isFinite(value)) {
        const sdDiv = s.cell.snowlmt_sd, sdEns = s.cell.snowlmt_sd_ens;
        const ens = sdEns != null && Number.isFinite(sdEns), div = sdDiv != null && Number.isFinite(sdDiv);
        const sd = ens ? sdEns : div ? sdDiv : null;
        const prov = sd == null ? 'none' : ens ? 'ensemble' : 'divergence';
        snow = { mid: r1(value), half: sd == null ? 0 : 1.2816 * r1(sd), prov };
      }
    }
    return { precip, snow };
  });
}

/** Feldwerte je nativem Schritt aus der Ausgabe `toPointForecastV2` (Referenzweg des Verifiers). */
export function fieldValuesOf(v2, leadsMs, stepH = 1) {
  const byT = new Map(v2.axis.steps.filter((s) => !s.interpolated).map((s) => [s.validAtMs, s]));
  return leadsMs.map((t) => {
    const s = byT.get(t);
    const vp = s?.vars?.precip ?? null;
    const pr = vp && !(vp.calib ?? []).includes('climatologyOnly') ? vp.dist ?? null : null;
    let precip = null;
    if (pr) {
      const pDry = Math.min(1, Math.max(0, cdfOf(pr, 0)));
      precip = {
        chance: 1 - pDry,
        medianWet: pDry < 1 ? quantileOf(pr, pDry + 0.5 * (1 - pDry)) : null,
        q90: pDry >= 0.9 ? 0 : Math.max(0, quantileOf(pr, 0.9)),
        mean: meanOf(pr),
        ...pexcOf(pr, stepH),
      };
    }
    const sl = s?.vars?.snowline ?? null;
    let snow = null;
    if (sl && sl.p50 != null) {
      const prov = sl.sigmaKind === 'ensemble' ? 'ensemble' : sl.sigmaKind === 'divergence' ? 'divergence' : 'none';
      snow = { mid: sl.p50, half: prov === 'none' || sl.sigma == null ? 0 : 1.2816 * sl.sigma, prov };
    }
    return { precip, snow };
  });
}

/** Tabellen und Klimatologie wie der Client (`learnedPoint.ts`: validateTables; `climaGrid.json`). */
function loadInputs(pointDir) {
  const clima = new ClimaField(JSON.parse(readFileSync(join(APP, 'public', 'climaGrid.json'), 'utf8')));
  const lp = join(pointDir, 'fusion.client.json');
  let learned = null, sha256 = null;
  const notes = [];
  if (existsSync(lp)) {
    const bytes = readFileSync(lp);
    sha256 = createHash('sha256').update(bytes).digest('hex');
    const doc = JSON.parse(bytes.toString('utf8'));
    const errs = validateTables(doc);
    if (errs.length) notes.push(`fusion.client.json ungültig (${errs.slice(0, 3).join('; ')}) — Rechnung ohne Lernstufe`);
    else learned = doc;
  } else notes.push('fusion.client.json fehlt — Rechnung ohne Lernstufe (K-2 allein)');
  return { clima, learned, sha256, notes };
}

// ─── Worker: eine Liste von Chunks ────────────────────────────────────────────────────────────
async function runWorker() {
  const { pointDir, dataRoot, run, tierId, files, nowMs, cellLimit } = workerData;
  const man = JSON.parse(readFileSync(join(pointDir, run, 'run.json'), 'utf8'));
  const tier = TIER_BY_ID[tierId];
  const tm = man.tiers.find((t) => t.id === tierId);
  const runAtMs = Date.parse(man.runAt);
  const pointer = { run, runAt: man.runAt, path: `point/${run}`, manifest: `point/${run}/run.json`, sourceRun: tm.run ?? run, sourceRunAt: tm.runAt ?? man.runAt };
  const { clima, learned } = loadInputs(pointDir);
  const leadsMs = tm.leadHours.map((L) => runAtMs + L * H);
  const nl = leadsMs.length;
  const wanted = fieldPlanes(man.planes);
  let errors = 0, done = 0;
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(join(dataRoot, f.file)));
    const chunk = await decodeCubeChunk(bytes, { planes: man.planes.map((p) => ({ id: p.id })) });
    const cells = [];
    for (let ry = 0; ry < chunk.ny; ry++) for (let rx = 0; rx < chunk.nx; rx++) cells.push([chunk.y0 + ry, chunk.x0 + rx]);
    const n = cells.length;
    const out = {
      iy: new Int16Array(n), ix: new Int16Array(n),
      chance: new Float32Array(n * nl).fill(NaN), med: new Float32Array(n * nl).fill(NaN), q90: new Float32Array(n * nl).fill(NaN),
      mean: new Float64Array(n * nl).fill(NaN),
      ge1: new Float32Array(n * nl).fill(NaN), ge5: new Float32Array(n * nl).fill(NaN),
      snowMid: new Float32Array(n * nl).fill(NaN), snowHalf: new Float32Array(n * nl).fill(NaN), snowProv: new Int8Array(n * nl),
    };
    for (let c = 0; c < n; c++) {
      const [iy, ix] = cells[c];
      out.iy[c] = iy; out.ix[c] = ix;
      if (cellLimit && done >= cellLimit) continue;
      done++;
      try {
        const addr = { tierId, tier, pointer, cell: { iy, ix }, chunk: { cy: f.cy, cx: f.cx }, path: f.file };
        const centre = { lat: tier.lat0 + iy * tier.deg, lon: tier.lon0 + ix * tier.deg };
        const series = cubeSeriesFrom(chunk, addr, man.planes, { bytes: bytes.length, manifest: man, manifestFrom: 'caller', lat: centre.lat, lon: centre.lon, neighbours: false, wanted });
        const input = cellInput({ series, tier, runAtMs, nowMs, clima, learned });
        if (input.elevationM == null) continue;
        const r = fuseCubePoint(input, FIELD_FUSE_OPTIONS);
        const vals = fieldValuesFromResult(r, leadsMs, tier.stepH);
        for (let k = 0; k < nl; k++) {
          const o = c * nl + k, v = vals[k];
          if (v.precip) { out.chance[o] = v.precip.chance; out.med[o] = v.precip.medianWet ?? -1; out.q90[o] = v.precip.q90; out.mean[o] = v.precip.mean; out.ge1[o] = v.precip.ge1; out.ge5[o] = v.precip.ge5; }
          if (v.snow) { out.snowMid[o] = v.snow.mid; out.snowHalf[o] = v.snow.half; out.snowProv[o] = v.snow.prov === 'ensemble' ? 3 : v.snow.prov === 'divergence' ? 2 : 0; }
        }
      } catch { errors++; }
    }
    parentPort.postMessage({ kind: 'chunk', out }, Object.values(out).map((a) => a.buffer));
  }
  parentPort.postMessage({ kind: 'done', errors, cells: done });
}

// ─── Hauptprozess ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
  const log = (...a) => console.log('[build-point-fields]', ...a);
  if (process.env.POINT_FIELDS === '0') { log('POINT_FIELDS=0 — Kartenfelder aus'); return 0; }
  const tierId = args.tier;
  const tier = TIER_BY_ID[tierId];
  if (!tier) { console.error('Aufruf: --tier=t1|t2|t3'); return 2; }
  const pointDir = resolve(args.point || process.env.POINT_OUT || 'data/point');
  const dataRoot = dirname(pointDir);
  const run = args.run || latestTierRun(pointDir, tierId);
  if (!run) { log(`keine Stufe ${tierId} unter ${pointDir} — nichts zu tun`); return 0; }
  const outRoot = args.out ? resolve(args.out) : pointDir;
  const target = join(outRoot, ...fieldRunDir(run, tierId).split('/').slice(1));   // <point>/field/v1/<lauf>/<stufe>
  if (!args.force && existsSync(join(target, FIELD_MANIFEST_FILE))) { log(`${run}/${tierId}: Feld liegt schon — übersprungen`); return 0; }

  // E-NP0-5 (b′): ein langsames (oder abgebrochenes) t1-Feld lässt den nächsten t1-Lauf aus. Gemerkt in
  // `field/v1/budget.json` (jeder Versuch, auch der abgebrochene — der Index kennt nur fertige Felder).
  const budgetS = Number(process.env.FIELD_BUDGET_S ?? 300);
  const deadlineS = Number(process.env.FIELD_DEADLINE_S ?? 360);
  const budgetPath = join(fieldRoot(outRoot), 'budget.json');
  const budget = (() => { try { return JSON.parse(readFileSync(budgetPath, 'utf8')); } catch { return { schema: 1, byTier: {} }; } })();
  const runAtOfName = (r) => Date.parse(`${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6, 8)}T${r.slice(8, 10)}:00:00Z`);
  if (tierId === 't1' && !args.force) {
    const last = budget.byTier?.t1;
    const slow = (last?.aborted && last.reason !== 'job-time') || (!last?.aborted && last?.durationMs > budgetS * 1000);
    if (last && last.run !== run && slow && runAtOfName(run) - runAtOfName(last.run) <= 3 * H) {
      log(`t1: das letzte Feld (${last.run}) ${last.aborted ? 'brach nach der Frist ab' : `brauchte ${(last.durationMs / 1000).toFixed(0)} s > ${budgetS} s`} — dieser Lauf wird ausgelassen (jeder zweite t1-Lauf, E-NP0-5 b′)`);
      return 0;
    }
  }
  const noteBudget = (entry) => {
    budget.byTier = { ...(budget.byTier ?? {}), [tierId]: entry };
    mkdirSync(dirname(budgetPath), { recursive: true });
    writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
  };

  const t0 = Date.now();
  const man = JSON.parse(readFileSync(join(pointDir, run, 'run.json'), 'utf8'));
  const tm = man.tiers.find((t) => t.id === tierId);
  if (!tm || !(tm.files ?? []).length) { log(`${run}: Stufe ${tierId} ohne Chunks`); return 0; }
  const runAtMs = Date.parse(man.runAt);
  // Die Uhr der Rechnung: der Stundenboden des Baus — der Vorlauf der Lernstufe zählt ab „jetzt" wie beim Nutzer, der das
  // Feld kurz nach der Veröffentlichung sieht. Steht im Manifest, damit der Verifier exakt nachrechnet.
  const nowMs = args.now ? Number(args.now) : Math.floor(Date.now() / H) * H;
  const inputs = loadInputs(pointDir);
  const workers = Math.max(1, Math.min(Number(args.workers || process.env.FIELD_WORKERS || availableParallelism()), tm.files.length));
  const cellLimit = args.cells ? Math.ceil(Number(args.cells) / workers) : 0;
  log(`${run}/${tierId}: ${tm.files.length} Chunks, ${tier.ny}×${tier.nx} Zellen, ${tm.leadHours.length} Schritte, ${workers} Worker${cellLimit ? `, Stichprobe ${args.cells} Zellen` : ''}; Tabellen ${inputs.sha256 ? inputs.sha256.slice(0, 12) : 'keine'}`);

  const nl = tm.leadHours.length;
  const N = tier.ny * tier.nx;
  const precipImg = Array.from({ length: nl }, () => new Uint8Array(N * 4));
  const snowImg = Array.from({ length: nl }, () => new Uint8Array(N * 4));
  // Phase NS (E-NS-9, audit/niederschlagssummen.md §9.4): kumulierte Erwartung je Vorlauf — Σ meanOf · stepH in Vorlauf-
  // Reihenfolge; eine fehlende Stufe macht die Zelle für alle späteren Vorläufe „fehlt" (nie 0). `POINT_FIELD_CUM=0` = aus.
  const withCum = process.env.POINT_FIELD_CUM !== '0';
  const cumImg = withCum ? Array.from({ length: nl }, () => new Uint8Array(N * 4)) : null;
  const leadHasCum = new Array(nl).fill(false);
  // Phase RC (E-RC-2): P(≥ 1 mm), P(≥ 5 mm) je Vorlauf aus derselben Verteilung. `POINT_FIELD_PEXC=0` = aus.
  const withPexc = process.env.POINT_FIELD_PEXC !== '0';
  const pexcImg = withPexc ? Array.from({ length: nl }, () => new Uint8Array(N * 4)) : null;
  const leadHasPexc = new Array(nl).fill(false);
  const stats = { cells: 0, precipMissing: 0, snowMissing: 0, saturated: 0, errors: 0, ...(withCum ? { cumBroken: 0 } : {}) };
  const leadHasPrecip = new Array(nl).fill(false), leadHasSnow = new Array(nl).fill(false);

  const groups = Array.from({ length: workers }, () => []);
  tm.files.forEach((f, i) => groups[i % workers].push(f));
  // Frist: die kleinere aus FIELD_DEADLINE_S und der Restzeit bis FIELD_END_MIN nach dem Jobstart (Workflow: JOB_T0) —
  // dahinter bleiben Publish + CDN + Reserve bis JOB_MAX_MIN (Regel F′). 20 s Rand für PNG-Kodierung und Manifest.
  let limitMs = deadlineS * 1000, reason = 'deadline';
  const jobT0 = Number(process.env.FIELD_JOB_T0 || 0) * 1000, endMin = Number(process.env.FIELD_END_MIN || 0);
  // V-RC-2: Mindestfenster je Stufe (`FIELD_MIN_S_BY_TIER`, t2/t3 45 s) — ein langsamer Cube-Bau nimmt dem Feld nicht mehr
  // die ganze Frist; der Cube wartet höchstens dieses Fenster. `FIELD_MIN_S=0` = Verhalten vorher.
  const floorMs = Number(process.env.FIELD_MIN_S ?? FIELD_MIN_S_BY_TIER[tierId] ?? 0) * 1000;
  if (jobT0 > 0 && endMin > 0) {
    const rest = jobT0 + endMin * 60_000 - Date.now() - 20_000;
    const lim = Math.max(rest, floorMs);
    if (lim < limitMs) { limitMs = lim; reason = rest >= floorMs ? 'job-time' : 'floor'; }
    if (reason === 'floor') log(`${run}/${tierId}: nur noch ${Math.max(0, rest / 1000).toFixed(0)} s bis FIELD_END_MIN ${endMin} — Feld im Mindestfenster ${(floorMs / 1000).toFixed(0)} s (V-RC-2)`);
  }
  if (limitMs < 30_000) {
    log(`${run}/${tierId}: nur noch ${Math.max(0, limitMs / 1000).toFixed(0)} s bis FIELD_END_MIN ${endMin} — kein Feld für diesen Lauf (Bau war langsam; der Cube ist davon unberührt)`);
    noteBudget({ run, runAtMs, durationMs: 0, aborted: true, reason: 'job-time', skipped: true, at: new Date().toISOString() });
    return 0;
  }
  const pool = [];
  let aborted = false;
  const deadline = setTimeout(() => { aborted = true; for (const w of pool) void w.terminate(); }, limitMs);
  const settled = await Promise.allSettled(groups.map((files) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { pointDir, dataRoot, run, tierId, files, nowMs, cellLimit } });
    pool.push(w);
    w.on('message', (m) => {
      if (m.kind === 'done') { stats.errors += m.errors; stats.cells += m.cells; return; }
      const o = m.out;
      for (let c = 0; c < o.iy.length; c++) {
        const off = fieldPixelOffset(tier, o.iy[c], o.ix[c]);
        if (cumImg) {
          // Vorläufe sind aufsteigend (`tm.leadHours`); A bleibt 0, sobald eine Stufe fehlt.
          let cum = 0, broken = false;
          for (let k = 0; k < nl; k++) {
            const m = o.mean[c * nl + k];
            if (!broken && Number.isFinite(m) && m >= 0) cum += m * tier.stepH;
            else if (!broken) { broken = true; stats.cumBroken++; }
            encodePrecipCumPixel(broken ? null : cum, cumImg[k], off);
            if (!broken) leadHasCum[k] = true;
          }
        }
        for (let k = 0; k < nl; k++) {
          const i = c * nl + k;
          if (Number.isFinite(o.chance[i])) {
            encodePrecipPixel({ chance: o.chance[i], medianWet: o.med[i] < 0 ? null : o.med[i], q90: o.q90[i] }, precipImg[k], off);
            leadHasPrecip[k] = true;
            if (o.q90[i] >= PRECIP_XMAX || o.med[i] >= PRECIP_XMAX) stats.saturated++;
          } else stats.precipMissing++;
          if (pexcImg) {
            const ok = Number.isFinite(o.chance[i]) && Number.isFinite(o.ge1[i]) && Number.isFinite(o.ge5[i]);
            encodePexcPixel(ok ? { ge1: o.ge1[i], ge5: o.ge5[i] } : null, pexcImg[k], off);
            if (ok) leadHasPexc[k] = true;
          }
          if (Number.isFinite(o.snowMid[i])) {
            if (encodeSnowPixel({ mid: o.snowMid[i], half: o.snowHalf[i], prov: o.snowProv[i] === 3 ? 'ensemble' : o.snowProv[i] === 2 ? 'divergence' : 'none' }, snowImg[k], off)) stats.saturated++;
            leadHasSnow[k] = true;
          } else stats.snowMissing++;
        }
      }
    });
    w.on('error', rej);
    w.on('exit', (code) => (code === 0 ? res() : rej(new Error(`Worker endete mit ${code}`))));
  })));
  clearTimeout(deadline);
  if (aborted) {
    noteBudget({ run, runAtMs, durationMs: Date.now() - t0, aborted: true, reason, at: new Date().toISOString() });
    log(`${run}/${tierId}: Frist ${(limitMs / 1000).toFixed(0)} s (${reason === 'job-time' ? `Restzeit bis FIELD_END_MIN ${endMin}` : reason === 'floor' ? 'Mindestfenster FIELD_MIN_S' : 'FIELD_DEADLINE_S'}) überschritten — KEIN Feld für diesen Lauf (der Cube ist davon unberührt)${tierId === 't1' && reason === 'deadline' ? '; der nächste t1-Lauf wird ausgelassen' : ''}`);
    return 0;
  }
  const failed = settled.find((s) => s.status === 'rejected');
  if (failed) throw failed.reason;

  // Bau-Ablage → Umbenennen → field.json zuletzt.
  const stage = join(outRoot, '.build', `field-${run}-${tierId}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const leads = [];
  let bytes = 0;
  for (let k = 0; k < nl; k++) {
    const L = tm.leadHours[k];
    const lead = { leadH: L, validAtMs: runAtMs + L * H, precip: null, snowlmt: null, ...(cumImg ? { precipcum: null } : {}), ...(pexcImg ? { pexc: null } : {}) };
    if (leadHasPrecip[k]) { const png = encodePng(tier.nx, tier.ny, precipImg[k], 4); writeFileSync(join(stage, fieldFileName('precip', L)), png); bytes += png.length; lead.precip = fieldFileName('precip', L); }
    if (leadHasSnow[k]) { const png = encodePng(tier.nx, tier.ny, snowImg[k], 4); writeFileSync(join(stage, fieldFileName('snowlmt', L)), png); bytes += png.length; lead.snowlmt = fieldFileName('snowlmt', L); }
    if (cumImg && leadHasCum[k]) { const png = encodePng(tier.nx, tier.ny, cumImg[k], 4); writeFileSync(join(stage, fieldFileName('precipcum', L)), png); bytes += png.length; lead.precipcum = fieldFileName('precipcum', L); }
    if (pexcImg && leadHasPexc[k]) { const png = encodePng(tier.nx, tier.ny, pexcImg[k], 4); writeFileSync(join(stage, fieldFileName('pexc', L)), png); bytes += png.length; lead.pexc = fieldFileName('pexc', L); }
    leads.push(lead);
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  try { renameSync(stage, target); } catch { cpSync(stage, target, { recursive: true }); rmSync(stage, { recursive: true, force: true }); }
  let codeCommit = null;
  try { codeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* kein Git */ }
  const ms = Date.now() - t0;
  const manifest = makeFieldManifest({
    run, tier: tierId, runAtMs, builtAtMs: Date.now(), leads, cum: !!cumImg, pexc: !!pexcImg,
    chain: {
      options: { ...FIELD_FUSE_OPTIONS, fusion: FUSION_CURRENT, fusionName: FUSION_NAME, nowMs, terrain: 'flach in Modellhöhe (terrainScales, konstante Höhe)', elevation: 'hModEff der Zelle', station: null, radar: null },
      tables: { path: 'point/fusion.client.json', sha256: inputs.sha256 }, codeCommit, notes: inputs.notes,
    },
    stats, timing: { ms, workers },
  });
  writeFileSync(join(target, FIELD_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFieldIndex(outRoot);
  noteBudget({ run, runAtMs, durationMs: ms, aborted: false, at: new Date().toISOString() });
  log(`${run}/${tierId}: ${leads.filter((l) => l.precip).length} Niederschlags-, ${leads.filter((l) => l.snowlmt).length} Schneefallgrenzen-Felder, ${(bytes / 1048576).toFixed(2)} MiB, ${(ms / 1000).toFixed(1)} s (${stats.cells} Zellen, ${stats.errors} Fehler, fehlend ${stats.precipMissing}/${stats.snowMissing}, gesättigt ${stats.saturated})`);
  return 0;
}

if (isMainThread) {
  if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().then((code) => process.exit(code ?? 0), (e) => { console.error('[build-point-fields] FEHLER:', e?.stack ?? e); process.exit(1); });
  }
} else {
  runWorker().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
}
