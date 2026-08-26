/**
 * Geteilter Warm-Manifest-Resolver für ICON-D2-GRIB-Layer (Phase T2-3).
 *
 * Generalisierung von `resolveWindRunFromManifest` (Wind, Phase T1 —
 * `src/wind/iconD2WindSource.ts`, dort unverändert belassen): statt eines
 * wind-eigenen `{run, steps}`-Manifests liest dieser Resolver das kombinierte
 * Multi-Param-Manifest `public/latest-grib.json`
 * (`{run, runAt, updatedAt, warmedThroughProxy, params: {<param>: [steps]}}`),
 * das der Warm-Cron `scripts/warm-grib.mjs` NACH dem Wärmen des Durable-Edge-
 * Caches (`/_dwd_grib/*`) atomar umlegt. Alle T2-Params teilen denselben
 * ICON-D2-Lauf; die Step-Listen unterscheiden sich pro Param (Karten-Caps:
 * Temp/Gust 24, Precip 27, Clouds 12).
 *
 * Liefert `null`, wenn kein/ungültiges/veraltetes Manifest vorliegt oder der
 * Param fehlt — der Aufrufer (resolveLatestRun) fällt dann auf den bestehenden
 * Directory-Scan zurück (Graceful-Degrade in beide Richtungen, wie T1):
 *  • kein Manifest (Dev vor dem ersten Warm-Lauf / Netz-Fehler) → Scan;
 *  • eingefrorenes Manifest (Warmer aus) → letzter gewärmter Lauf (stale, nie kalt);
 *  • zu alter Lauf (> 24 h, Files auf DWD weg) → Staleness-Guard verwirft es
 *    VORAB (kein 404-Sturm), Scan holt den aktuellen Lauf.
 */

import { reportManifest, stateFromUpdatedAt } from './manifestHealth';

/** Rückgabeform — deckungsgleich mit `resolveLatestRun`/`RunInfo`.
 *  `updatedAt` (V-20) ist additiv: der Zeitpunkt, zu dem der Warm-Cron das
 *  Manifest zuletzt umgelegt hat. Aufrufer, die es nicht brauchen, ignorieren es. */
export interface ManifestRun { runStr: string; runAt: Date; steps: number[]; updatedAt?: Date }

/** Manifest-URL (same-origin, winzig, vom Warm-Cron committet). */
export const GRIB_MANIFEST_URL = '/latest-grib.json';

/** Max. Alter des Manifest-Laufs (Referenzzeit) — identisch zu T1 begründet:
 *  jenseits von 24 h sind die GRIB-Dateien i. d. R. auch von opendata.dwd.de
 *  verschwunden → Manifest wäre „kaputt statt stale". Ein gesundes Manifest ist
 *  ~3,5–6,5 h alt (Publikationslag + 3-h-Rotation). */
const MAX_MANIFEST_RUN_AGE_H = 24;

/** Kurzer In-Memory-Cache des geparsten Manifests: beim Kaltstart lösen bis zu
 *  sieben Params (t_2m, vmax_10m, tot_prec, clcl/clcm/clch/clct) nebenläufig auf
 *  — ein geteiltes Fetch-Promise statt sieben Requests. TTL kurz, damit der
 *  30-min-Refresh-Tick einen neuen Warm-Lauf zeitnah sieht. */
const MANIFEST_TTL_MS = 60 * 1000;

interface ParsedManifest {
  run: string; runAt: Date; params: Record<string, number[]>; updatedAt: Date | null;
  /** BW-3: der `repack`-Abschnitt, ROH durchgereicht. Geprüft wird er dort, wo
   *  er gebraucht wird (`repackSource.parseRepackSection`) — dieser Resolver
   *  kennt weder CDN noch Bildformat und soll es auch nicht. */
  repack: unknown;
}
const manifestCache = new Map<string, { at: number; p: Promise<ParsedManifest | null> }>();

/** `YYYYMMDDHH` → UTC-Date. */
function parseRunStr(run: string): Date {
  return new Date(Date.UTC(
    +run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10), 0, 0, 0,
  ));
}

/**
 * BW-11 (2026-08-26): der Abruf-URL der LIVE-Manifeste bekommt einen
 * Minuten-Stempel — derselbe Takt wie `MANIFEST_TTL_MS`, also höchstens ein
 * zusätzlicher Eintrag je Minute und Datei.
 *
 * Warum: `cache: 'no-store'` wirkt erst im HTTP-Layer, ein Service Worker greift
 * DAVOR. Bestandsbrowser bedienen `/latest-{grib,wind}.json` weiterhin aus einem
 * alten Worker (vor BW-10 fielen sie unter dessen Asset-Regel: erst der Treffer,
 * dann die Auffrischung — jede Sitzung sah den Lauf der VORIGEN), und der neue
 * Worker übernimmt erst, wenn er darf. Der Stempel ändert den Cache-Schlüssel,
 * nicht den Pfad: der alte Worker findet nichts und geht ans Netz, der neue
 * (`LIVE_RE` prüft `pathname`) bleibt unverändert network-first, und der Server
 * liefert dieselbe Datei — die Frische hängt damit an keinem Worker mehr.
 *
 * Der IDENTITÄTS-Schlüssel bleibt der Pfad ohne Stempel: Manifest-Cache
 * (`getManifest`) und Gesundheitsmeldung (`reportManifest`) sollen nicht je
 * Minute eine neue Datei zu sehen glauben.
 */
export function liveManifestUrl(url: string, nowMs: number = Date.now()): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${Math.floor(nowMs / MANIFEST_TTL_MS)}`;
}

/** Fetch + Parse + Validierung (inkl. Staleness-Guard). `null` = unbrauchbar. */
async function fetchManifest(url: string): Promise<ParsedManifest | null> {
  try {
    // `cache: 'no-store'` hält den HTTP-Layer frisch (wie T1). Bewusst OHNE
    // AbortSignal: das Promise ist über nebenläufige Layer-Loader geteilt — der
    // Abort EINES Layers darf die Auflösung der übrigen nicht mitreißen (der
    // Fetch ist ~1 KB same-origin).
    const res = await fetch(liveManifestUrl(url), { cache: 'no-store' });
    if (!res.ok) return null;
    const m = await res.json() as { run?: unknown; runAt?: unknown; updatedAt?: unknown; params?: unknown; repack?: unknown };
    if (typeof m.run !== 'string' || !/^\d{10}$/.test(m.run)) return null;
    if (m.params == null || typeof m.params !== 'object' || Array.isArray(m.params)) return null;
    const runAt = typeof m.runAt === 'string' ? new Date(m.runAt) : parseRunStr(m.run);
    if (Number.isNaN(runAt.getTime())) return null;
    // Staleness-Guard (identisch T1): zu alter oder unplausibel zukünftiger Lauf
    // → Manifest verwerfen, der Directory-Scan holt den aktuellen Lauf.
    const ageH = (Date.now() - runAt.getTime()) / 3_600_000;
    if (ageH > MAX_MANIFEST_RUN_AGE_H || ageH < -2) return null;
    const params: Record<string, number[]> = {};
    for (const [key, raw] of Object.entries(m.params as Record<string, unknown>)) {
      if (!Array.isArray(raw)) continue;
      const steps = raw
        .filter((s): s is number => Number.isInteger(s) && (s as number) >= 0)
        .sort((a, b) => a - b);
      if (steps.length > 0) params[key] = steps;
    }
    if (Object.keys(params).length === 0) return null;
    // V-20: Zeitpunkt der letzten Manifest-Auffrischung durch den Warm-Cron.
    // Rein informativ — er beeinflusst WEDER die Auflösung NOCH den Staleness-
    // Guard oben (der hängt an der Lauf-Referenzzeit, nicht am Schreibzeitpunkt).
    const upd = typeof m.updatedAt === 'string' ? new Date(m.updatedAt) : null;
    const updatedAt = upd && !Number.isNaN(upd.getTime()) ? upd : null;
    return { run: m.run, runAt, params, updatedAt, repack: m.repack ?? null };
  } catch {
    return null;   // Netzfehler / JSON-Parse → Fallback auf Directory-Scan
  }
}

/** Geteilter Zugang zum Cache — beide Leser (Lauf und `repack`-Abschnitt)
 *  teilen sich EIN Fetch-Promise je TTL-Fenster. */
async function getManifest(url: string): Promise<ParsedManifest | null> {
  const now = Date.now();
  let entry = manifestCache.get(url);
  if (!entry || now - entry.at > MANIFEST_TTL_MS) {
    entry = { at: now, p: fetchManifest(url) };
    manifestCache.set(url, entry);
  }
  const manifest = await entry.p;
  // Fehlversuch nicht bis zum TTL-Ende festhalten — nächster Aufrufer probiert neu.
  if (!manifest && manifestCache.get(url) === entry) manifestCache.delete(url);
  return manifest;
}

/**
 * BW-3: der rohe `repack`-Abschnitt desselben Manifests — über DENSELBEN
 * 60-s-Cache, also ohne zweiten Abruf. `null` heißt „kein Abschnitt", und das
 * ist zwischen DWD-Veröffentlichung und Producer-Lauf der Normalfall
 * (`audit/bandbreite.md` §22.4), kein Defekt. Der Manifest-Zustand wird hier
 * bewusst NICHT gemeldet — das tut `resolveRunFromManifest` bereits, und ein
 * zweiter Melder derselben Datei würde die Gesundheitsanzeige doppelt zählen.
 */
export async function readManifestRepack(url: string): Promise<unknown> {
  const manifest = await getManifest(url);
  return manifest?.repack ?? null;
}

/**
 * Liest das Warm-Manifest und liefert den gewärmten Lauf + die Step-Liste des
 * angefragten Params. `null` → Aufrufer nutzt den Directory-Scan (Fallback).
 * `signal` wird bewusst nicht an den geteilten Manifest-Fetch durchgereicht
 * (s. fetchManifest); ein bereits abgebrochener Aufrufer erhält `null`.
 */
export async function resolveRunFromManifest(
  url: string,
  param: string,
  signal?: AbortSignal,
): Promise<ManifestRun | null> {
  if (signal?.aborted) return null;
  const manifest = await getManifest(url);
  if (!manifest) {
    reportManifest(url, 'absent');   // V-20: der Aufrufer fällt auf den Directory-Scan
    return null;
  }
  const updatedAtMs = manifest.updatedAt ? manifest.updatedAt.getTime() : null;
  // V-20: Zustand des MANIFESTS melden — bewusst VOR dem Param-Test, denn ein
  // fehlender Param (cape_ml, uh_max, h_snow …) ist kein Manifest-Defekt.
  reportManifest(url, stateFromUpdatedAt(updatedAtMs, Date.now()), updatedAtMs);
  const steps = manifest.params[param];
  if (!steps || steps.length === 0) return null;
  return { runStr: manifest.run, runAt: manifest.runAt, steps, updatedAt: manifest.updatedAt ?? undefined };
}
