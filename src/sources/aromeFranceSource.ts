/**
 * Météo-France AROME-France (0,01°) — Temperatur + Wind als coarse `ForecastGrid`
 * für den Per-Land-Modell-Switcher (Phase 4.3, `docs/model-switcher-gate0.md`).
 *
 * AROME 0,01° ist ein **reguläres** lat-lon-Gitter (GDT 0, 2801×1791 ≈ 5,0 M
 * Punkte) mit CCSDS-AEC-Packung (DRT 42) — beides deckt `gribDecode` ab. Domäne
 * EURW1S100 (37,5–55,4 °N, 12 °W–16 °E) → DE + CH voll, AT bis 16 °E (Wien knapp
 * außerhalb).
 *
 * **Zugang:** key-freie, deterministische GRIB2-Pakete auf OVH-Cloud-S3
 * (`meteofrance-pnt…ovh.net`, CORS-blockiert → `/_mf`-Proxy). Ein „Paket" bündelt
 * mehrere Variablen als getrennte Nachrichten; SP1 enthält 2t/10u/10v (+ Böen).
 * Die URL ist deterministisch (kein STAC/Index): `pnt/<lauf>/arome/001/SP1/
 * arome__001__SP1__<NN>H__<lauf>.grib2`. Der jüngste Lauf wird per HEAD-Rückwärts-
 * suche über die 3-stündlichen Läufe gefunden.
 *
 * **Kostenrealität:** SP1 ist ~23 MB je Step (5 M Punkte). Erster gegateter
 * Schnitt daher NUR SP1 (Temperatur + Wind), 0–6 h, im Hintergrund + gecacht.
 * Wolken/Niederschlag (Paket SP2, ~14 MB) und selektives Message-Range-Laden
 * sind spätere Ausbaustufen (Katalog-`pipelineNote`).
 */

import { decodeGrib2All, type GribField } from './gribDecode';
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const KELVIN = 273.15;
// Browser: CORS-Proxy `/_mf`. Node (Verify-Harness, kein `window`): kein CORS →
// direkt gegen den OVH-S3-Host.
const MF_BASE = typeof window === 'undefined'
  ? 'https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt'
  : '/_mf/pnt';
const MAX_STEP_DEFAULT = 6;

/** Ausgabe-Gitter: AROME-Domäne ∩ DACH-relevanter Bereich (DE + CH, West-AT). */
const AROME_BOUNDS: ForecastBounds = { lngMin: 5.5, lngMax: 15.5, latMin: 45.6, latMax: 54.6 };

export interface AromeFrOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

/** Lauf-Zeitstempel `YYYY-MM-DDTHH:00:00Z` (3-stündlich). */
function runStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:00:00Z`;
}

function sp1Url(run: string, step: number): string {
  return `${MF_BASE}/${run}/arome/001/SP1/arome__001__SP1__${pad2(step)}H__${run}.grib2`;
}

interface AromeRun { run: string; runAt: Date; }
let runCache: { at: number; run: AromeRun } | null = null;
const RUN_TTL = 5 * 60 * 1000;

/**
 * Jüngsten publizierten Lauf finden: ab der aktuellen 3-h-Grenze rückwärts, per
 * HEAD auf die SP1-00H-Datei. AROME-Läufe sind ~2,5–3 h nach Lauf verfügbar.
 */
async function resolveLatestRun(signal?: AbortSignal): Promise<AromeRun> {
  if (runCache && Date.now() - runCache.at < RUN_TTL) return runCache.run;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 1; back < 8; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run = runStr(cand);
    try {
      const res = await fetch(sp1Url(run, 0), { method: 'HEAD', signal });
      if (res.ok) { const r = { run, runAt: cand }; runCache = { at: Date.now(), run: r }; return r; }
    } catch { /* nächster Kandidat */ }
  }
  throw new Error('AROME-France: kein publizierter Lauf gefunden');
}

// --- gecachtes rohes GRIB (URL laufinvariant → direkt als Cache-Key) -----------

const RAW_CACHE = 'arome-fr-grib-v1';
const RAW_CACHE_MAX = 24;
let rawCacheP: Promise<Cache | null> | null = null;
function rawCache(): Promise<Cache | null> {
  if (!rawCacheP) {
    rawCacheP = typeof caches !== 'undefined' ? caches.open(RAW_CACHE).catch(() => null) : Promise.resolve(null);
  }
  return rawCacheP;
}
async function pruneRawCache(cache: Cache): Promise<void> {
  try { const keys = await cache.keys(); for (let i = 0; i < keys.length - RAW_CACHE_MAX; i++) await cache.delete(keys[i]); } catch { /* ignore */ }
}
async function fetchRawCached(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const cache = await rawCache();
  if (cache) { const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`AROME-France: ${res.status} (${url})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (cache) cache.put(url, new Response(bytes.slice().buffer)).then(() => pruneRawCache(cache)).catch(() => {});
  return bytes;
}

// --- Nachrichten-Identität + reguläres Sampling --------------------------------

/** Findet die Nachricht mit (Kategorie, Nummer, ~Level) in einer Multi-Var-Datei. */
function pick(fields: GribField[], cat: number, num: number, level: number): GribField | undefined {
  return fields.find((f) =>
    f.discipline === 0 && f.parameterCategory === cat && f.parameterNumber === num &&
    (f.level === undefined || Math.abs(f.level - level) < 0.5));
}

/**
 * Wert an (lat,lng) aus einem regulären lat-lon-Feld (Nearest). Nutzt die
 * Eckpunkte lat1/lon1..lat2/lon2 → Orientierung/Vorzeichen fallen automatisch
 * korrekt aus. AROME: scanMode 0 (i zuerst, N→S) → index = row*ni + col.
 */
function sampleRegular(f: GribField, lat: number, lng: number): number {
  const fcol = ((lng - f.lon1) / (f.lon2 - f.lon1)) * (f.ni - 1);
  const frow = ((lat - f.lat1) / (f.lat2 - f.lat1)) * (f.nj - 1);
  const col = Math.max(0, Math.min(f.ni - 1, Math.round(fcol)));
  const row = Math.max(0, Math.min(f.nj - 1, Math.round(frow)));
  return f.values[row * f.ni + col];
}

/**
 * Lädt AROME-France (SP1: Temperatur + Wind) als coarse `ForecastGrid`. Bewusst
 * eng gedeckelt (nur SP1, ≤ MAX_STEP_DEFAULT h) — die 0,01°-Dateien sind groß
 * (~23 MB/Step). Der FusionEngine interpoliert das coarse Gitter per IDW auf die
 * Karte; das Raster trägt daher den Engine-Qualitäts-Badge.
 */
export async function fetchAromeFranceGrid(options: AromeFrOptions = {}): Promise<ForecastGrid> {
  const cols = options.cols ?? 20;
  const rows = options.rows ?? 18;
  const total = cols * rows;
  const cap = Math.min(options.hours ?? MAX_STEP_DEFAULT, MAX_STEP_DEFAULT);
  const steps: number[] = [];
  for (let s = 0; s <= cap; s += 3) steps.push(s);

  const { run, runAt } = await resolveLatestRun(options.signal);

  // Ausgabe-Gitter über die AROME∩DACH-Domäne.
  const lats = new Array<number>(total), lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = AROME_BOUNDS.latMin + (j / Math.max(1, rows - 1)) * (AROME_BOUNDS.latMax - AROME_BOUNDS.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = AROME_BOUNDS.lngMin + (i / Math.max(1, cols - 1)) * (AROME_BOUNDS.lngMax - AROME_BOUNDS.lngMin);
      lats[j * cols + i] = lat; lngs[j * cols + i] = lng;
    }
  }

  // Je Step SP1 laden, 2t/10u/10v abtasten.
  const perStep = await Promise.all(steps.map(async (step) => {
    const raw = await fetchRawCached(sp1Url(run, step), options.signal).catch(() => null);
    if (!raw) return null;
    const fields = decodeGrib2All(raw);
    const t = pick(fields, 0, 0, 2);   // 2t
    const u = pick(fields, 2, 2, 10);  // 10u
    const v = pick(fields, 2, 3, 10);  // 10v
    if (!t && !u && !v) return null;
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const tv = t ? sampleRegular(t, lats[k], lngs[k]) : NaN;
      const uv = u ? sampleRegular(u, lats[k], lngs[k]) : NaN;
      const vv = v ? sampleRegular(v, lats[k], lngs[k]) : NaN;
      arr[k] = {
        temperature: Number.isFinite(tv) ? tv - KELVIN : null,
        u: Number.isFinite(uv) ? uv : null,
        v: Number.isFinite(vv) ? vv : null,
        cloudLow: null, cloudMid: null, cloudHigh: null,
        precipitation: null,
        model: 'arome_france',
      };
    }
    return arr;
  }));

  const times: Date[] = [];
  const points: ForecastHourPoint[][] = [];
  for (let h = 0; h < steps.length; h++) {
    if (!perStep[h]) continue;
    times.push(new Date(runAt.getTime() + steps[h] * 3600_000));
    points.push(perStep[h]!);
  }
  if (points.length === 0) throw new Error('AROME-France: keine Felder dekodiert');

  return { cols, rows, bounds: AROME_BOUNDS, times, points, fetchedAt: Date.now() };
}
