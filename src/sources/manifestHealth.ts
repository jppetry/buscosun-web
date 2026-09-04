/**
 * Gesundheit der Warm-Manifeste, sichtbar gemacht (Verbesserung V-20).
 *
 * „Schnellzugriff" heißt die Quelle, die dem Client den aktuellen Lauf nennt,
 * damit er nicht selbst suchen muss. Das war das Warm-Manifest (T1/T2); seit
 * BW-12/BW-13 ist es der **Index des Daten-Repos** — für den Windlayer sogar
 * ausschließlich, für die Grib-Layer mit `latest-grib.json` als Rückfallweg.
 * Fällt der Schnellzugriff aus, lösen die Loader still per Directory-Scan gegen
 * den DWD auf: die App bleibt korrekt, wird aber langsam, und niemand erfährt
 * davon — weder Nutzer noch Betreiber.
 *
 * Dieses Modul ist die winzige Meldestelle dazwischen: die Resolver melden ihren
 * Befund, die UI liest den SCHLECHTESTEN Zustand (mit der `primary`-Regel unten)
 * und zeigt eine dezente Zeile. Es verändert NICHTS an der Auflösungslogik, an
 * Caches oder an der Manifest-Mechanik.
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

interface Entry { state: ManifestState; updatedAtMs: number | null; primary: boolean }
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
export function reportManifest(
  url: string,
  state: ManifestState,
  updatedAtMs: number | null = null,
  primary = false,
): void {
  const prev = entries.get(url);
  if (prev && prev.state === state && prev.updatedAtMs === updatedAtMs && prev.primary === primary) return;
  entries.set(url, { state, updatedAtMs, primary });
  const h = getManifestHealth();
  for (const fn of listeners) { try { fn(h); } catch { /* ein Hörer darf die übrigen nicht reißen */ } }
}

/**
 * Schlechtester Zustand über alle gemeldeten Quellen — mit einer Ausnahme.
 *
 * BW-12 (§31.17): meldet eine Quelle sich als **primär**, zählen NUR die
 * primären. Seit dem Gate GBW12 ist der Schnellzugriff der Index des
 * Daten-Repos; die beiden Warm-Manifeste sind eingefrorene Rückfallwege. Ohne
 * diese Regel entschiede weiter der schlechteste Eintrag — und die Manifeste
 * altern zwangsläufig aus dem 24-h-Guard heraus. Params ohne Repack-Familie
 * (`relhum_2m`, `clcl`) befragen sie weiterhin, würden also ab dem zweiten Tag
 * dauerhaft `absent` melden und die Karte behaupten lassen, der Schnellzugriff
 * sei kaputt, während jedes Bild vom CDN kommt. Das wäre kein Alarm mehr,
 * sondern Rauschen — und Rauschen macht die ehrliche Anzeige wertlos.
 *
 * Fällt der primäre Weg aus, meldet er NICHT (`resolveRunFromRepackIndex`
 * meldet nur den Erfolgsfall); dann greift automatisch wieder die alte Regel
 * über die Manifeste, und deren Befund ist dann auch der richtige.
 */
export function getManifestHealth(): ManifestHealth {
  let state: ManifestState = 'unknown';
  let updatedAtMs: number | null = null;
  const sources: string[] = [];
  const hasPrimary = [...entries.values()].some((e) => e.primary);
  for (const [url, e] of entries) {
    if (hasPrimary && !e.primary) continue;
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

  reportManifest('/zweite-quelle.json', 'stale', now - 8 * H);
  add('worst-of: fresh + stale → stale', getManifestHealth().state === 'stale');
  add('worst-of nennt die betroffene Quelle',
    getManifestHealth().sources.join() === '/zweite-quelle.json', getManifestHealth().sources.join());

  reportManifest('/latest-grib.json', 'absent', null);
  add('worst-of: absent schlägt stale', getManifestHealth().state === 'absent');

  reportManifest('/latest-grib.json', 'fresh', now - H);
  add('Erholung: absent → stale, wenn das andere stale bleibt', getManifestHealth().state === 'stale');

  reportManifest('/zweite-quelle.json', 'fresh', now - 3 * H);
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
