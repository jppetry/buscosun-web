/**
 * warmPoint.ts — Frühstart einzelner Dateien des Daten-Repos für den Punkt-Leser (Jan 2026-11-08, V-DB-19).
 *
 * Das Dashboard zeigt die Werte von buscosun Fusion; deren erste Abrufe (`point/index.json`, dann der t1-Chunk des Orts)
 * gingen erst raus, wenn der Fusions-Chunk geladen UND ausgeführt war — mobil-4G bei ≈ 1,2 s, und der Index-Umweg
 * (0,3–0,75 s) stand davor in Reihe (audit/dashboard.md §11.4). Hier startet der Router den Abruf, sobald die Route
 * feststeht; `httpStore.once` nimmt die laufende Antwort EINMAL entgegen (`takeWarmPoint`) — ohne Frühstart holt er wie
 * bisher selbst. Dasselbe Muster wie `warmRvTar`/`takeWarmRv` (Regenradar) und `warmRepackIndex` (Wetterkarte).
 *
 * Bewusst OHNE Importe: dieses Modul landet im index-Chunk (Router). Die Basis-URLs wohnen deshalb hier und werden von
 * `store.ts` weitergereicht.
 */

/** Das Daten-Repo über jsDelivr — der Weg, den auch die Kartenlinie fährt. */
export const POINT_CDN_BASE = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main';
/** Rohweg ohne CDN-Cache. Für Gegenproben unmittelbar nach einem Push (PD-A, §51). */
export const POINT_RAW_BASE = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
/** `POINT_INDEX_PATH` aus `cubeFormat.ts` unter der CDN-Basis (dort: `${POINT_DIR}/index.json`; `cubeFormat` prüft die Gleichheit). */
export const POINT_INDEX_URL = `${POINT_CDN_BASE}/point/index.json`;

interface Warm { at: number; p: Promise<Response> }
const warm = new Map<string, Warm>();
/** So lange gilt ein Frühstart als brauchbar; danach holt der Leser selbst (ein Lauf wechselt frühestens stündlich). */
export const POINT_WARM_TTL_MS = 90_000;

/**
 * Startet den Abruf EINER Datei vor (No-op im TTL, ohne `fetch`). `init` ist genau das, was der Leser später senden
 * würde — der Index mit `cache: 'no-cache'` (R9), ein Chunk mit `priority: 'high'`. Liefert die laufende Antwort
 * (für `peekWarmPoint`), `null` ohne `fetch`.
 */
export function warmPointFile(url: string, init: RequestInit & { priority?: 'high' | 'low' | 'auto' }, nowMs: number = Date.now()): Promise<Response> | null {
  if (typeof fetch !== 'function') return null;
  const cur = warm.get(url);
  if (cur && nowMs - cur.at < POINT_WARM_TTL_MS) return cur.p;
  const p = fetch(url, init as RequestInit);
  p.catch(() => { /* der Leser sieht die Ablehnung, nicht der Frühstart */ });
  warm.set(url, { at: nowMs, p });
  return p;
}

/** Der Index (`point/index.json`) — mit denselben Cache-Regeln wie `loadPointIndex`. */
export function warmPointIndex(nowMs: number = Date.now()): Promise<Response> | null {
  return warmPointFile(POINT_INDEX_URL, { cache: 'no-cache', priority: 'high' }, nowMs);
}

/** Nimmt einen vorgestarteten Abruf EINMAL entgegen (der Körper ist nur einmal lesbar); `null` ohne Frühstart oder nach dem TTL. */
export function takeWarmPoint(url: string, nowMs: number = Date.now()): Promise<Response> | null {
  const cur = warm.get(url);
  if (!cur) return null;
  warm.delete(url);
  return nowMs - cur.at < POINT_WARM_TTL_MS ? cur.p : null;
}

/** Sieht einen laufenden Frühstart an, ohne ihn zu nehmen (für einen Leser, der die Antwort KLONT). */
export function peekWarmPoint(url: string, nowMs: number = Date.now()): Promise<Response> | null {
  const cur = warm.get(url);
  return cur && nowMs - cur.at < POINT_WARM_TTL_MS ? cur.p : null;
}

/** Nur für Verifier/Tests. */
export function _warmPointCount(): number { return warm.size; }
export function _resetWarmPoint(): void { warm.clear(); }
