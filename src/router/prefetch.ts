/**
 * LE1/H2 — Frühstart der Datenabrufe je Route (`audit/layer-erstbild.md` §4).
 *
 * Gemessen (Prod, 2026-08-28): die erste Datenanfrage einer Kartenseite ging
 * erst **2,4 s nach dem Aufruf** raus — nach `index.js`, Route-Chunk, MapView/
 * maplibre und dem React-Mount. Dahinter wartete jeder Layer: Manifest
 * (0,4–0,75 s TTFB) → Zeiger → Bild, bzw. RV-Tar (2,4 MB) → bz2 → Dekode.
 *
 * Dieses Modul wird vom Router aufgerufen, sobald die Route feststeht — also
 * parallel zum Download des Seiten-Chunks, nicht danach. Es kennt nur Pfade und
 * `fetch`; die Verbraucher (`gribManifest`, `iconD2WindSource`, `radolan`) nehmen
 * die laufenden Antworten mit `takeWarm…` entgegen. Läuft kein Frühstart (SSR,
 * andere Route, TTL abgelaufen), holen sie wie bisher selbst — verlustfrei.
 *
 * Bewusst KEINE schweren Importe: dieses Modul landet im index-Chunk.
 */
import { warmLiveManifest } from '../sources/liveManifest';
import { warmRvTar } from '../sources/radolanRuns';
import type { RouteId } from './routes';

export const GRIB_MANIFEST_PATH = '/latest-grib.json';
export const WIND_MANIFEST_PATH = '/latest-wind.json';

/** Slugs der Wetterkarte, die den RADOLAN-RV-Tar brauchen (Nowcast-Familie). */
const RV_SLUGS = new Set(['niederschlag', 'flow-nowcast', 'regen-chance']);

/**
 * Welche Abrufe eine Route beim Start braucht — als reine Entscheidung, damit
 * der Verifier sie ohne Netz prüfen kann.
 */
export function warmPlanFor(routeId: RouteId, pathname: string, search: string): { manifests: string[]; rvTar: boolean } {
  switch (routeId) {
    case 'wetterkarte':
    case 'warnungen': {
      // MapView lädt Wind + Temperatur immer (Stadt-Labels); der RV-Tar nur,
      // wenn ein Layer der Nowcast-Familie über Pfad-Slug oder `l=` aktiv ist.
      const seg = pathname.split('/').filter(Boolean);
      const slug = seg[0] === 'wetterkarte' ? (seg[1] ?? '') : '';
      let extra = '';
      try { extra = new URLSearchParams(search).get('l') ?? ''; } catch { /* kein Query */ }
      const slugs = [slug, ...extra.split(',')].map((s) => s.trim()).filter(Boolean);
      return { manifests: [GRIB_MANIFEST_PATH, WIND_MANIFEST_PATH], rvTar: slugs.some((s) => RV_SLUGS.has(s)) };
    }
    case 'regenradar': {
      // V-LE-12 (LE2): der Tar (2,2 MB, `priority: 'high'`) nur, wenn die URL
      // einen Ort trägt UND das Land DE ist. Ohne Ort zeigt die Seite das
      // Suchformular (gemessen: der Tar lief trotzdem); für AT/CH ist RADOLAN
      // die Nachbarquelle, die das Komposit später mit `'low'` holt (H7).
      // Das GRIB-Manifest (`cape`-Familie, Gewittergefahr-Index) bleibt.
      let hasPlace = false, land = '';
      try {
        const q = new URLSearchParams(search);
        hasPlace = q.has('ort') || (q.has('olat') && q.has('olon'));
        land = (q.get('land') ?? 'de').toLowerCase();
      } catch { /* kein Query */ }
      return { manifests: [GRIB_MANIFEST_PATH], rvTar: hasPlace && land === 'de' };
    }
    default:
      return { manifests: [], rvTar: false };
  }
}

/** Stößt die Abrufe des Plans an; liefert, was wirklich gestartet wurde (Debug/Verifier). */
export function warmRouteData(routeId: RouteId, pathname: string, search: string, nowMs: number = Date.now()): string[] {
  const plan = warmPlanFor(routeId, pathname, search);
  const started: string[] = [];
  for (const m of plan.manifests) if (warmLiveManifest(m, nowMs)) started.push(m);
  if (plan.rvTar) { const url = warmRvTar(nowMs); if (url) started.push(url); }
  return started;
}
