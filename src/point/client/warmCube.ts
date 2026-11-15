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
 *
 * Jan 2026-11-15 (Ladezeit des Dashboards): vorgestartet wird jetzt ALLES, was der Leser für das ganze Fenster holt und
 * dessen Adresse ohne Rechnung feststeht — nicht mehr nur t1. In Node gemessen (München, kalt, 15.11.): der Leser fragt
 * t2/t3 erst an, wenn t1 da ist (≈ 0,44 s nach dem Start), die Tabellen der Lernstufe und den Stationskatalog erst mit
 * dem Start der Fusion, also nach dem Laden ihres Chunks. Hier starten sie mit der Route:
 *   - sofort (Adresse fest): `fusion.client.json`, `stack.client.json`, das Klimatologieprodukt, der Stationskatalog;
 *   - mit dem Index: die Chunks ALLER Stufen am Ort (t1 `high`, t2/t3 `low` — dieselbe Priorität wie im Leser).
 * Was der Cache des Lesers schon hält (`defaultCachePolicy`, dieselbe Regel), wird nicht geholt. Dazu ein `preconnect` zu
 * den beiden fremden Origins des Lesers (Gelände, RUC-Zeiger), damit deren Verbindungsaufbau nicht erst mit dem Abruf beginnt.
 */
import { TIERS, POINT_CLIMA_PATH, POINT_LEARNED_PATH, POINT_STACK_PATH, STATION_CATALOG_PATH, cellOf, chunkOf, chunkPath } from '../cubeFormat';
import { defaultCachePolicy, idbBackend, type CacheBackend } from './cache';
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

interface IndexLite { latestByTier?: Partial<Record<string, { run?: string; runAt?: string | null } | null>> }

/** Files of the reader whose address needs no index: the tables of the newest stage and the station catalogue (all `low`/as in the reader). */
const FIXED_FILES: ReadonlyArray<{ path: string; priority: 'high' | 'low' }> = [
  { path: POINT_LEARNED_PATH, priority: 'low' },
  { path: POINT_STACK_PATH, priority: 'low' },
  { path: POINT_CLIMA_PATH, priority: 'low' },
  { path: STATION_CATALOG_PATH, priority: 'high' },
];
/** Foreign origins of the reader besides the CDN: terrain tiles (`terrain.ts`) and the raw path (RUC pointer, fallback). */
const PRECONNECT = ['https://s3.amazonaws.com', 'https://raw.githubusercontent.com'];

let backend: CacheBackend | null | undefined;
/** Does the reader's cache hold the file and still accept it? Same rule as `cachedStore` (`defaultCachePolicy`). */
async function cached(path: string, url: string, nowMs: number): Promise<boolean> {
  const ttl = defaultCachePolicy(path, POINT_CDN_BASE);
  if (ttl == null) return false;
  try {
    if (backend === undefined) backend = idbBackend();
    const hit = await backend?.get(url);
    return !!hit && (ttl === Infinity || nowMs - hit.storedAt < ttl);
  } catch { return false; /* ohne Cache-Auskunft: vorstarten */ }
}

async function warmFile(path: string, priority: 'high' | 'low', nowMs: number): Promise<string | null> {
  const url = `${POINT_CDN_BASE}/${path}`;
  if (await cached(path, url, nowMs)) return null;
  return warmPointFile(url, { priority }, Date.now()) ? url : null;
}

function preconnect(): void {
  try {
    if (typeof document === 'undefined' || !document.head) return;
    for (const href of PRECONNECT) {
      if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = href; l.crossOrigin = 'anonymous';
      document.head.appendChild(l);
    }
  } catch { /* a hint, never a reason to skip the early start */ }
}

/**
 * Startet die Dateien des Lesers für den Ort vor. Liefert die URLs, die vorgestartet wurden (leer: kein Ort, alles schon
 * im IndexedDB-Cache, Index nicht lesbar). Die festen Dateien starten sofort, die Chunks der Stufen mit dem Index.
 */
export async function warmDashboardCube(pathname: string, search: string, nowMs: number = Date.now()): Promise<string[]> {
  const place = dashboardPlaceOf(pathname, search);
  if (!place) return [];
  preconnect();
  const fixed = Promise.all(FIXED_FILES.map((f) => warmFile(f.path, f.priority, nowMs)));
  const idxP = peekWarmPoint(POINT_INDEX_URL, nowMs) ?? warmPointIndex(nowMs);
  const chunks = (async (): Promise<Array<string | null>> => {
    if (!idxP) return [];
    let index: IndexLite | null = null;
    try {
      const r = await idxP;
      if (!r.ok) return [];
      index = (await r.clone().json()) as IndexLite;   // der Klon: der Leser liest den Körper des Originals
    } catch { return []; }
    return Promise.all(TIERS.map((tier) => {
      const latest = index?.latestByTier?.[tier.id];
      if (!latest?.run || !latest.runAt) return null;
      const cell = cellOf(tier, place.lat, place.lon);
      if (!cell) return null;
      const ch = chunkOf(cell.iy, cell.ix);
      return warmFile(chunkPath(latest.run, tier, ch.cy, ch.cx), tier.id === 't1' ? 'high' : 'low', nowMs);
    }));
  })();
  const all = await Promise.all([fixed, chunks]);
  return all.flat().filter((u): u is string => !!u);
}
