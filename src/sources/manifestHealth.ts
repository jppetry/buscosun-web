/**
 * Gesundheit der Warm-Manifeste, sichtbar gemacht (Verbesserung V-20).
 *
 * `latest-grib.json` (Phase T2) und `latest-wind.json` (Phase T1) sind der
 * Schnellzugriff: sie nennen den zuletzt in den Edge-Cache GEWÄRMTEN Lauf, damit
 * der Client ausschließlich warme (Lauf,Step)-URLs anfragt. Fehlt das Manifest
 * oder ist es eingefroren, fallen die Loader still auf den Directory-Scan zurück —
 * die App bleibt korrekt, wird aber langsam, und niemand erfährt davon (weder
 * Nutzer noch Betreiber).
 *
 * Dieses Modul ist die winzige Meldestelle dazwischen: die beiden Resolver melden
 * ihren Befund, die UI liest den SCHLECHTESTEN Zustand und zeigt eine dezente
 * Zeile. Es verändert NICHTS an der Auflösungslogik, an Caches oder an der
 * Manifest-Mechanik (die Cron-/Manifest-Semantik bleibt unberührt — STOPP-Zone).
 *
 * Pur im Sinne von D-12: kein DOM, kein Fetch, kein Timer.
 */

import { MANIFEST_STALE_H } from '../dataAge';

/**
 *  • `fresh`   — Manifest da und jung genug (`updatedAt` < MANIFEST_STALE_H).
 *  • `stale`   — Manifest da, aber lange nicht aufgefrischt (oder ohne `updatedAt`).
 *                Der Schnellzugriff greift, zeigt aber einen älteren Lauf.
 *  • `absent`  — kein/ungültiges/vom Staleness-Guard verworfenes Manifest.
 *                Die Daten kommen direkt von der Quelle (Directory-Scan).
 *  • `unknown` — noch kein Resolver gelaufen (Startzustand).
 */
export type ManifestState = 'fresh' | 'stale' | 'absent' | 'unknown';

export interface ManifestHealth {
  state: ManifestState;
  /** Zeitpunkt der letzten Manifest-Auffrischung durch den Warm-Cron (ms), falls bekannt. */
  updatedAtMs: number | null;
  /** Welche Manifeste den gemeldeten Zustand tragen — für den Tooltip/Betrieb. */
  sources: string[];
}

/** Schlechteste zuerst — `get()` aggregiert nach diesem Rang. */
const RANK: Record<ManifestState, number> = { absent: 3, stale: 2, fresh: 1, unknown: 0 };

interface Entry { state: ManifestState; updatedAtMs: number | null }
const entries = new Map<string, Entry>();
const listeners = new Set<(h: ManifestHealth) => void>();

/** Leitet den Zustand aus `updatedAt` ab. `null` ⇒ Manifest unbrauchbar (`absent`). */
export function stateFromUpdatedAt(updatedAtMs: number | null, nowMs: number): ManifestState {
  if (updatedAtMs == null || !Number.isFinite(updatedAtMs)) return 'stale';
  return nowMs - updatedAtMs > MANIFEST_STALE_H * 3_600_000 ? 'stale' : 'fresh';
}

/**
 * Befund eines Resolvers melden. `url` identifiziert das Manifest (nicht den
 * Layer!) — wiederholte Meldungen desselben Manifests ersetzen einander.
 *
 * WICHTIG: gemeldet wird der Zustand des MANIFESTS, nicht der des angefragten
 * Params. `resolveRunFromManifest` liefert auch bei gesundem Manifest `null`,
 * wenn der Param dort nicht geführt wird (cape_ml, uh_max, h_snow …) — das ist
 * kein Defekt und darf keinen Hinweis auslösen.
 */
export function reportManifest(url: string, state: ManifestState, updatedAtMs: number | null = null): void {
  const prev = entries.get(url);
  if (prev && prev.state === state && prev.updatedAtMs === updatedAtMs) return;
  entries.set(url, { state, updatedAtMs });
  const h = getManifestHealth();
  for (const fn of listeners) { try { fn(h); } catch { /* ein Hörer darf die übrigen nicht reißen */ } }
}

/** Schlechtester Zustand über alle gemeldeten Manifeste. */
export function getManifestHealth(): ManifestHealth {
  let state: ManifestState = 'unknown';
  let updatedAtMs: number | null = null;
  const sources: string[] = [];
  for (const [url, e] of entries) {
    if (RANK[e.state] > RANK[state]) { state = e.state; updatedAtMs = e.updatedAtMs; sources.length = 0; }
    if (e.state === state) {
      sources.push(url);
      // Innerhalb desselben Zustands die ÄLTESTE Auffrischung zeigen (konservativ).
      if (e.updatedAtMs != null && (updatedAtMs == null || e.updatedAtMs < updatedAtMs)) updatedAtMs = e.updatedAtMs;
    }
  }
  return { state, updatedAtMs, sources };
}

/** React-Anbindung: liefert die Abmeldefunktion. */
export function subscribeManifestHealth(fn: (h: ManifestHealth) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Nur für Verifier/Tests — setzt die Registry zurück. */
export function resetManifestHealth(): void {
  entries.clear();
}

// --- Selbst-Verifikation (headless über verify:datenalter) -------------------

export interface ManifestHealthCheck { name: string; ok: boolean; detail?: string }

export function verifyManifestHealth(): { checks: ManifestHealthCheck[]; passed: number; total: number } {
  const checks: ManifestHealthCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 7, 1, 15, 0);
  const H = 3_600_000;

  const before = [...entries.entries()]; // Registry des laufenden Programms sichern
  resetManifestHealth();

  add('Startzustand ist unknown', getManifestHealth().state === 'unknown');

  add('frisch: 1 h alt → fresh', stateFromUpdatedAt(now - 1 * H, now) === 'fresh');
  add('Schwelle: 5,9 h → fresh', stateFromUpdatedAt(now - 5.9 * H, now) === 'fresh');
  add('Schwelle: 6,1 h → stale', stateFromUpdatedAt(now - 6.1 * H, now) === 'stale');
  add('ohne updatedAt → stale (nichts Gutes behaupten)', stateFromUpdatedAt(null, now) === 'stale');

  reportManifest('/latest-grib.json', 'fresh', now - H);
  add('ein frisches Manifest → fresh', getManifestHealth().state === 'fresh');

  reportManifest('/latest-wind.json', 'stale', now - 8 * H);
  add('worst-of: fresh + stale → stale', getManifestHealth().state === 'stale');
  add('worst-of nennt die betroffene Quelle',
    getManifestHealth().sources.join() === '/latest-wind.json', getManifestHealth().sources.join());

  reportManifest('/latest-grib.json', 'absent', null);
  add('worst-of: absent schlägt stale', getManifestHealth().state === 'absent');

  reportManifest('/latest-grib.json', 'fresh', now - H);
  add('Erholung: absent → stale, wenn das andere stale bleibt', getManifestHealth().state === 'stale');

  reportManifest('/latest-wind.json', 'fresh', now - 3 * H);
  const h = getManifestHealth();
  add('beide frisch → fresh', h.state === 'fresh');
  add('bei Gleichstand zählt die ÄLTESTE Auffrischung', h.updatedAtMs === now - 3 * H);
  add('beide Quellen gelistet', h.sources.length === 2);

  let seen = 0;
  const off = subscribeManifestHealth(() => { seen++; });
  reportManifest('/latest-grib.json', 'absent', null);
  add('Hörer wird bei Änderung benachrichtigt', seen === 1, String(seen));
  reportManifest('/latest-grib.json', 'absent', null);
  add('unveränderte Meldung löst keinen Re-Render aus', seen === 1, String(seen));
  off();
  reportManifest('/latest-grib.json', 'fresh', now);
  add('nach Abmeldung keine Benachrichtigung mehr', seen === 1, String(seen));

  resetManifestHealth();
  for (const [url, e] of before) entries.set(url, e); // Registry wiederherstellen

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
