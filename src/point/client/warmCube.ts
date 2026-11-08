/**
 * warmCube.ts — Frühstart des t1-Chunks für das Dashboard (Jan 2026-11-08, V-DB-19).
 *
 * Vom Router dynamisch geladen (`router/prefetch.ts`), sobald die Route `?ansicht=dashboard` mit einem Ort feststeht: der
 * Index läuft schon (`warmPointIndex`); sobald er da ist, wird der Chunk der Stufe t1 am Ort bestimmt — mit DENSELBEN
 * Funktionen, mit denen der Leser adressiert (`cellOf`, `chunkOf`, `chunkPath`) — und vorgestartet, wenn der Cache ihn
 * nicht schon hält. Der Leser (`readPointBundle` → `httpStore.once`) nimmt die Antwort entgegen (`takeWarmPoint`).
 *
 * t1 ist die Stufe am Fensteranfang, sobald der Index einen t1-Lauf nennt: sie trägt 0–48 h, ihre Läufe bleiben ≥ 9 h im
 * Repo, das Dashboard-Fenster beginnt jetzt — `tiersForWindow` entscheidet im Leser gleich. Nennt der Index keinen t1-Lauf,
 * wird nichts vorgestartet (der Leser fällt auf t2/t3). Ein Fehlgriff hier kostet nur einen unnötigen Abruf, nie ein Ergebnis.
 */
import { TIER_BY_ID, cellOf, chunkOf, chunkPath } from '../cubeFormat';
import { idbBackend } from './cache';
import { resolveRoutePlace } from '../../share/placeTable';
import type { Country, Location } from '../../types';
import { POINT_CDN_BASE, POINT_INDEX_URL, peekWarmPoint, warmPointFile, warmPointIndex } from './warmPoint';

const COUNTRIES: readonly Country[] = ['DE', 'AT', 'CH'];

/** Der Ort der Dashboard-URL: `olat`/`olon` (+ `land`) wie `parseMapUrl`, sonst der Ort-Slug als letztes Pfadsegment (`resolveRoutePlace`). */
export function dashboardPlaceOf(pathname: string, search: string): Location | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return null; }
  const num = (s: string | null) => { const v = s == null ? NaN : Number(s); return Number.isFinite(v) ? v : null; };
  const olat = num(q.get('olat')), olon = num(q.get('olon'));
  const land = (q.get('land') ?? '').toUpperCase() as Country;
  const country: Country = COUNTRIES.includes(land) ? land : 'DE';
  const queryPlace: Location | null = olat != null && olon != null && Math.abs(olat) <= 90 && Math.abs(olon) <= 180
    ? { name: (q.get('ort') ?? '').trim(), lat: olat, lon: olon, country } : null;
  const segs = pathname.split('/').filter(Boolean);
  const slug = segs.length >= 2 ? segs[segs.length - 1] : null;
  return resolveRoutePlace(slug, queryPlace).place;
}

interface IndexLite { latestByTier?: { t1?: { run?: string; runAt?: string | null } | null } }

/**
 * Startet den t1-Chunk des Orts vor. Liefert die URL, die vorgestartet wurde, `null` wenn nichts zu tun war (kein Ort,
 * kein t1-Lauf, Punkt außerhalb des Gitters, Chunk schon im IndexedDB-Cache, Index nicht lesbar).
 */
export async function warmDashboardCube(pathname: string, search: string, nowMs: number = Date.now()): Promise<string | null> {
  const place = dashboardPlaceOf(pathname, search);
  if (!place) return null;
  const idxP = peekWarmPoint(POINT_INDEX_URL, nowMs) ?? warmPointIndex(nowMs);
  if (!idxP) return null;
  let index: IndexLite | null = null;
  try {
    const r = await idxP;
    if (!r.ok) return null;
    index = (await r.clone().json()) as IndexLite;   // der Klon: der Leser liest den Körper des Originals
  } catch { return null; }
  const t1 = index?.latestByTier?.t1;
  if (!t1?.run || !t1.runAt) return null;
  const tier = TIER_BY_ID.t1;
  const cell = cellOf(tier, place.lat, place.lon);
  if (!cell) return null;
  const ch = chunkOf(cell.iy, cell.ix);
  const path = chunkPath(t1.run, tier, ch.cy, ch.cx);
  const url = `${POINT_CDN_BASE}/${path}`;
  // Schon im Cache des Lesers (`cachedStore`: Chunks liegen unbegrenzt, Schlüssel = Basis/Pfad)? Dann kein Abruf.
  try {
    const hit = await idbBackend()?.get(url);
    if (hit) return null;
  } catch { /* ohne Cache-Auskunft: vorstarten */ }
  return warmPointFile(url, { priority: 'high' }, Date.now()) ? url : null;
}
