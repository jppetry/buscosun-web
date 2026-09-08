/**
 * LZ1 (audit/layer-ladezeit.md §7): EIN Schalter für die Ladezeit-Maßnahmen
 * am Layer-Klick — M2 (Index stale-while-revalidate + `@main`-Pfade), M3
 * (Prefetch der Jetzt-Schritte anderer Layer) und M4 (Fetch vor dem Render).
 *
 * `?lz=0` (bzw. `localStorage.lz = '0'`) ist der benannte Rückfallweg auf das
 * Verhalten vor LZ1: Index nur innerhalb 60 s aus dem Speicher, Bild-URLs auf
 * den Commit gepinnt, kein Prefetch, Installer erst im Effekt nach dem Commit.
 * Dieselbe Semantik wie `repackFlagFrom`: die Query schlägt den Speicher in
 * beide Richtungen. Ohne DOM (Node, Verifier) ist der Weg AN — so prüft
 * `verify:repack` dieselbe URL-Regel, die der Browser benutzt.
 */
export function lzFlagFrom(search: string, stored: string | null): boolean {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('lz');
  if (q === '1') return true;
  if (q === '0') return false;
  return stored !== '0';
}

export function lzEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  let stored: string | null = null;
  try { stored = window.localStorage?.getItem('lz') ?? null; } catch { /* Safari-Privatmodus wirft */ }
  try { return lzFlagFrom(window.location.search, stored); } catch { return true; }
}
