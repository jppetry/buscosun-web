/**
 * BH3 — Laden und Zeichnen der Brand-Historie im Client (`audit/brand-historie.md` §5 BH3).
 *
 *  - `historyEnabled()`   Kill-Switch `?bh=0` / `localStorage.bh = '0'` (Rule 2) — dann gibt es
 *                         die Fenster Monat/Saison nicht, der Brandradar verhält sich wie vor BH.
 *  - `loadHistoryIndex`   holt `index-<kind>-v1.json` mit `cache: 'no-store'` (der Service Worker
 *                         führt `.json` als gehashtes Asset — ohne das käme nach dem nächsten
 *                         Commit-back der alte Stand), einmal je Sitzung und Fenster. Ein Fehler ist
 *                         ein Ergebnis (`{ kind: 'error' }`), nie eine leere Liste.
 *  - `historyToGeoJSON`   ein Punkt je Ereignis, Farbe nach Stärke (dieselbe Tabelle wie die
 *                         Brände-Liste, `clusterColor`), Standorte grau — keine zweite Farbskala.
 *
 * **Kein FIRMS-Call.** Der Live-Pfad (24 h / 7 d) bleibt unverändert; die Historie ist ein
 * zusätzlicher Anzeigemodus über statische Dateien.
 */

import type { FilterSpecification } from 'maplibre-gl';
import { clusterColor, STATIC_GREY } from '../fireClusters';
import { entryOf, INDEX_URL, HISTORY_ARTIFACT_VERSION, type HistoryIndexEntry, type HistoryIndexFile, type HistoryWindowKind } from './historyArtifacts';
import { SEASON_SERIES_URL, SEASON_SERIES_VERSION, type SeasonSeriesFile } from './historySeries';

export const HISTORY_SOURCE_ID = 'fire-history';
export const HISTORY_LAYER_ID = 'fire-history-points';
export const HISTORY_SEL_LAYER_ID = 'fire-history-sel';

export type HistoryLoad =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; file: HistoryIndexFile; entries: HistoryIndexEntry[] }
  | { kind: 'error'; message: string };

export function historyEnabled(): boolean {
  try {
    if (typeof location !== 'undefined' && /[?&]bh=0(&|$)/.test(location.search)) return false;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('bh') === '0') return false;
  } catch { /* privater Modus */ }
  return true;
}

const _cache = new Map<HistoryWindowKind, Promise<HistoryLoad>>();

export function loadHistoryIndex(kind: HistoryWindowKind): Promise<HistoryLoad> {
  if (!historyEnabled()) return Promise.resolve({ kind: 'error', message: 'Historie abgeschaltet (?bh=0)' });
  let p = _cache.get(kind);
  if (!p) {
    p = fetch(INDEX_URL[kind], { cache: 'no-store' })
      .then(async (r): Promise<HistoryLoad> => {
        if (!r.ok) return { kind: 'error', message: `HTTP ${r.status}` };
        const file = (await r.json()) as HistoryIndexFile;
        if (file.version !== HISTORY_ARTIFACT_VERSION || !Array.isArray(file.events)) return { kind: 'error', message: 'unbekanntes Dateiformat' };
        return { kind: 'ok', file, entries: file.events.map((row) => entryOf(row, file.fields)) };
      })
      .catch((e: unknown) => ({ kind: 'error', message: e instanceof Error ? e.message : String(e) } as HistoryLoad));
    // Ein Fehler bleibt nicht für die Sitzung gemerkt — der nächste Wechsel versucht es erneut.
    p.then((res) => { if (res.kind === 'error') _cache.delete(kind); });
    _cache.set(kind, p);
  }
  return p;
}

export function resetHistoryCache(): void { _cache.clear(); _series = null; }

// ---------------------------------------------------------------------------
// BH5 — Saisonverlauf (eine Datei, einmal je Sitzung; Fehler ist ein Ergebnis)
// ---------------------------------------------------------------------------

export type SeriesLoad =
  | { kind: 'loading' }
  | { kind: 'ok'; file: SeasonSeriesFile }
  | { kind: 'error'; message: string };

let _series: Promise<SeriesLoad> | null = null;

export function loadSeasonSeries(): Promise<SeriesLoad> {
  if (!historyEnabled()) return Promise.resolve({ kind: 'error', message: 'Historie abgeschaltet (?bh=0)' });
  if (!_series) {
    _series = fetch(SEASON_SERIES_URL, { cache: 'no-store' })
      .then(async (r): Promise<SeriesLoad> => {
        if (!r.ok) return { kind: 'error', message: `HTTP ${r.status}` };
        const file = (await r.json()) as SeasonSeriesFile;
        if (file.version !== SEASON_SERIES_VERSION || !Array.isArray(file.seasons)) return { kind: 'error', message: 'unbekanntes Dateiformat' };
        return { kind: 'ok', file };
      })
      .catch((e: unknown) => ({ kind: 'error', message: e instanceof Error ? e.message : String(e) } as SeriesLoad));
    _series.then((res) => { if (res.kind === 'error') _series = null; });
  }
  return _series;
}

export interface HistoryFeatureProps extends Record<string, unknown> {
  id: string;
  color: string;
  /** Radius in px — Stärke (Summe FRP), gedeckelt wie die Hotspot-Punkte. */
  r: number;
  site: 0 | 1;
  /** Sichtbarkeitsstufe 0–3 (`historyTier`): ab welchem Zoom der Punkt gezeichnet wird. */
  tier: 0 | 1 | 2 | 3;
}

function radiusOf(frpSum: number | null): number {
  const v = frpSum ?? 0;
  return v >= 600 ? 9 : v >= 200 ? 7.5 : v >= 50 ? 6 : v >= 10 ? 5 : 4;
}

/**
 * Zoomstufen der Europa-Historie (2026-10-31): 80 000 Ereignisse je Saison, drei Viertel unter
 * 10 MW — im Überblick stehen nur die starken, beim Heranzoomen kommen die Klassen der Legende
 * dazu. Stufe = Legendenklasse der Σ Leistung; eine EFFIS-Kartierung ab `TIER_EFFIS_HA` hebt auf
 * Stufe 0 (ein großer, schwach detektierter Brand darf nicht verschwinden). Das gewählte Ereignis
 * zeigt die Karte immer (Filter in `FireMap`).
 */
export const HISTORY_TIER_ZOOM = [0, 5.5, 7, 8.5] as const;
export const HISTORY_TIER_MW = [200, 50, 10] as const;
export const TIER_EFFIS_HA = 100;

export function historyTier(e: Pick<HistoryIndexEntry, 'frpSumMw' | 'areaHa' | 'areaKind'>): 0 | 1 | 2 | 3 {
  if (e.areaKind === 'mapped' && (e.areaHa ?? 0) >= TIER_EFFIS_HA) return 0;
  const v = e.frpSumMw ?? 0;
  return v >= HISTORY_TIER_MW[0] ? 0 : v >= HISTORY_TIER_MW[1] ? 1 : v >= HISTORY_TIER_MW[2] ? 2 : 3;
}

/** Filter des Punkt-Layers: Stufe passend zum Zoom (`zoom` nur als Eingang eines top-level `step`), die Auswahl immer. */
export function historyTierFilter(selectedId: string | null): FilterSpecification {
  const upTo = (t: number): unknown[] => ['any', ['<=', ['get', 'tier'], t], ['==', ['get', 'id'], selectedId ?? '']];
  return ['step', ['zoom'], upTo(0), HISTORY_TIER_ZOOM[1], upTo(1), HISTORY_TIER_ZOOM[2], upTo(2), HISTORY_TIER_ZOOM[3], true] as unknown as FilterSpecification;
}

export function historyToGeoJSON(entries: readonly HistoryIndexEntry[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: entries.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: {
        id: e.id,
        color: e.anomalyKind === 'site' ? STATIC_GREY : clusterColor(e.frpSumMw ?? 0),
        r: radiusOf(e.frpSumMw),
        site: e.anomalyKind === 'site' ? 1 : 0,
        tier: historyTier(e),
      } satisfies HistoryFeatureProps,
    })),
  };
}

/**
 * „Stand" der Datei — der letzte Tag, der in der Auswertung enthalten ist. `evaluatedAt` ist das
 * Ende des Abruftags (exklusiv); eine Millisekunde davor liegt der letzte enthaltene Tag — sonst
 * stünde „Stand 23.08." über Daten, die bis zum 22.08. reichen (Browser-Befund GBH3).
 */
export function historyStandLabel(evaluatedAt: number): string {
  return new Date(evaluatedAt - 1).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface HistoryLoadCheck { name: string; ok: boolean; detail?: string }

export function verifyHistoryLoad(): { checks: HistoryLoadCheck[]; passed: number; total: number } {
  const checks: HistoryLoadCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const e = (over: Partial<HistoryIndexEntry>): HistoryIndexEntry => ({
    id: 'bh:x', country: 'DE', lat: 48, lon: 11, firstMs: 0, lastMs: 0, hotspots: 1, overpasses: 1, distinctDays: 1,
    frpSumMw: 5, frpMaxMw: 5, statusKind: 'out', areaHa: null, areaKind: null, estHa: null, estLowHa: null, estHighHa: null,
    effisId: null, placeName: null, placeDistrict: null, placeKm: null, anomalyKind: null, hullKm2: 0, nrt: 0, confidence: [0, 1, 0, 0], ...over,
  });
  const fc = historyToGeoJSON([e({ frpSumMw: 700 }), e({ id: 'bh:s', anomalyKind: 'site', frpSumMw: 700 })]);
  add('ein Punkt je Ereignis, Farbe nach Stärke aus der Cluster-Tabelle', fc.features.length === 2 && fc.features[0].properties?.color === clusterColor(700));
  add('Standort-Ereignis ist grau, nie in der Brandfarbe', fc.features[1].properties?.color === STATIC_GREY && fc.features[1].properties?.site === 1);
  add('Radius wächst mit der Stärke und ist gedeckelt', radiusOf(null) === 4 && radiusOf(700) === 9 && radiusOf(1e6) === 9);
  add('Zoomstufe = Legendenklasse; EFFIS ab 100 ha immer Stufe 0', historyTier(e({ frpSumMw: 250 })) === 0 && historyTier(e({ frpSumMw: 60 })) === 1 && historyTier(e({ frpSumMw: 12 })) === 2 && historyTier(e({ frpSumMw: null })) === 3 && historyTier(e({ frpSumMw: 1, areaHa: 120, areaKind: 'mapped' })) === 0 && historyTier(e({ frpSumMw: 1, areaHa: 120, areaKind: 'upper-bound' })) === 3);
  const flt = historyTierFilter('bh:x') as unknown[];
  add('Filter: top-level step über zoom, Auswahl in jeder Stufe', flt[0] === 'step' && JSON.stringify(flt[1]) === '["zoom"]' && flt.length === 9 && flt[8] === true && JSON.stringify(flt[2]).includes('"bh:x"'));
  add('Kill-Switch außerhalb des Browsers: an', historyEnabled() === true);
  add('Stand = letzter enthaltener Tag (Ende 23.08. exklusiv ⇒ 22.08.)', historyStandLabel(Date.UTC(2026, 7, 23)) === '22.08.2026');
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
