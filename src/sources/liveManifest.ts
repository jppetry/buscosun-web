/**
 * Live-Manifeste der Warm-Crons (`/latest-{grib,wind}.json`) — Abruf-URL und
 * Frühstart. Bewusst OHNE Abhängigkeiten: der Router (index-Chunk) stößt den
 * Abruf an, sobald die Route feststeht, also parallel zum Download des
 * Seiten-Chunks — und nicht erst 2,4 s später, wenn die Karte gemountet ist
 * (LE1/H2, `audit/layer-erstbild.md` §2.1: Manifest heute bei 2 433 ms, TTFB
 * 0,4–0,75 s, jedes Layerbild wartet dahinter).
 *
 * BW-11 (2026-08-26): der Abruf-URL bekommt einen Minuten-Stempel — derselbe
 * Takt wie `MANIFEST_TTL_MS`, also höchstens ein zusätzlicher Eintrag je Minute
 * und Datei. `cache: 'no-store'` wirkt erst im HTTP-Layer, ein Service Worker
 * greift DAVOR; der Stempel ändert den Cache-Schlüssel, nicht den Pfad — der
 * alte Worker findet nichts und geht ans Netz, der neue (`LIVE_RE` prüft
 * `pathname`) bleibt network-first. Identitätsschlüssel bleibt der Pfad.
 */

/** Kurzer In-Memory-Takt der Manifeste (Sitzungs-Cache in `gribManifest`,
 *  Stempel hier, Frühstart-Frist unten): EINE Zahl für alle drei. */
export const MANIFEST_TTL_MS = 60 * 1000;

export function liveManifestUrl(url: string, nowMs: number = Date.now()): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${Math.floor(nowMs / MANIFEST_TTL_MS)}`;
}

interface Warm { at: number; p: Promise<Response> }
const warm = new Map<string, Warm>();

/**
 * Startet den Abruf eines Live-Manifests vor, ohne auf ihn zu warten. Ein
 * zweiter Aufruf innerhalb des TTL ist ein No-op. Fehler meldet nicht der
 * Frühstart, sondern der Verbraucher (`takeWarmManifest` liefert das Promise
 * samt Ablehnung — dort gilt wie bisher „Manifest unbrauchbar → Scan").
 */
export function warmLiveManifest(path: string, nowMs: number = Date.now()): boolean {
  if (typeof fetch !== 'function') return false;
  const cur = warm.get(path);
  if (cur && nowMs - cur.at < MANIFEST_TTL_MS) return false;
  const p = fetch(liveManifestUrl(path, nowMs), { cache: 'no-store' });
  p.catch(() => { /* der Verbraucher sieht die Ablehnung, nicht der Frühstart */ });
  warm.set(path, { at: nowMs, p });
  return true;
}

/**
 * Nimmt einen vorgestarteten Abruf EINMAL entgegen (der Antwortkörper ist nur
 * einmal lesbar). `null`, wenn keiner läuft oder er älter als das TTL ist —
 * dann holt der Verbraucher selbst, genau wie ohne Frühstart.
 */
export function takeWarmManifest(path: string, nowMs: number = Date.now()): Promise<Response> | null {
  const cur = warm.get(path);
  if (!cur) return null;
  warm.delete(path);
  return nowMs - cur.at < MANIFEST_TTL_MS ? cur.p : null;
}

/** Nur für Verifier/Tests. */
export function _warmManifestCount(): number { return warm.size; }
export function _resetWarmManifests(): void { warm.clear(); }
