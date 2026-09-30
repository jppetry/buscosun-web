/**
 * buscosun Fusion für das Dashboard (Phase DB, audit/dashboard.md §5.3).
 *
 * Ruft den Cube-Pfad in der neuesten Stufe direkt auf (`getPointForecastFromCube` mit `defaultCubeIo()` ⇒
 * `stage: 'fs'`, Lernstufe, Klimatologieprodukt, Stationswert) — denselben Weg wie das Punkt-Panel, aber OHNE
 * Rückfall auf den Live-Pfad (E-DB-17): scheitert der Cube, zeigt das Dashboard einen Fehler statt stiller
 * Legacy-Werte. Progressiv (`onUpdate`): erste Ausgabe t1, dann das ganze Fenster, dann Radar/Anker.
 *
 * Ein Eintrag je Ort; die Route startet den Abruf schon beim Ankommen (`prefetchDashboardForecast`), parallel zum
 * Laden des Dashboard-Chunks — beide Wege addieren sich so nicht.
 */
import type { PointForecast } from '../../pointForecast/types';
import type { CubePathSummary } from '../../pointForecast/cubeSource';
import type { FusionIn, PlaceIn } from '../model/types';
import { pWetOf } from '../model/build';
import type { Dist } from '../../pointForecast/fusion/dist';

export const DASHBOARD_HOURS = 336;
const REFRESH_MS = 10 * 60_000;

export interface ForecastState {
  status: 'loading' | 'ok' | 'error';
  fusion: FusionIn | null;
  error: string | null;
  /** Ausgaben mit Zeit ab Start (ms) — für `?pflog=1` und die Latenzmessung. */
  emissions: Array<{ kind: string; ms: number }>;
  startedAt: number;
}

interface Entry { state: ForecastState; listeners: Set<(s: ForecastState) => void>; abort: AbortController; timer: number | null; loadedAt: number; inflight: boolean }
const ENTRIES = new Map<string, Entry>();

export const placeKey = (p: PlaceIn) => `${p.country}:${p.lat.toFixed(4)}:${p.lon.toFixed(4)}`;

type SunFn = (lat: number, lon: number, ms: number) => { elevationDeg: number };
function toFusionIn(fc: PointForecast, exceedance: (d: Dist, x: number) => number, sun: SunFn, p: PlaceIn): FusionIn | null {
  const cube = fc.cube as unknown as CubePathSummary | undefined;
  // Der Cube-Pfad wirft nicht, wenn er nichts lesen kann — er antwortet mit leerer Achse und nennt es in `errors`.
  if (!cube?.v2 || !cube.v2.axis.steps.length) return null;
  return {
    v2: cube.v2,
    cells: cube.cells ?? [],
    emission: cube.emission ?? null,
    pending: cube.pending ?? [],
    notes: [...(cube.notes ?? []), ...(cube.v2.provenance.notes ?? [])],
    pWet: pWetOf(cube.v2, exceedance),
    night0: cube.v2.axis.steps[0] ? sun(p.lat, p.lon, cube.v2.axis.steps[0].validAtMs).elevationDeg < 0 : null,
  };
}

function emit(e: Entry, patch: Partial<ForecastState>) {
  e.state = { ...e.state, ...patch };
  for (const l of e.listeners) l(e.state);
}

function load(p: PlaceIn, e: Entry) {
  const t0 = performance.now();
  try { performance.mark('dbd:fusion:start'); } catch { /* ohne Performance-API */ }
  let exceed: ((d: Dist, x: number) => number) | null = null;
  let sun: SunFn | null = null;
  const onFc = (fc: PointForecast) => {
    if (e.abort.signal.aborted || !exceed || !sun) return;
    const f = toFusionIn(fc, exceed, sun, p);
    if (!f) {
      const c = fc.cube as unknown as CubePathSummary | undefined;
      const why = [...(c?.errors ?? []), ...(c?.skips ?? [])].slice(0, 3).join(' · ') || 'Cube ohne Schritte';
      emit(e, { status: e.state.fusion ? 'ok' : 'error', error: e.state.fusion ? null : why });
      return;
    }
    const kind = f.emission ?? 'final';
    emit(e, { status: 'ok', fusion: f, error: null, emissions: [...e.state.emissions, { kind, ms: Math.round(performance.now() - t0) }] });
  };
  import('../../pointForecast/cubeSource')
    .then(({ getPointForecastFromCube, defaultCubeIo, exceedance, solarPosition }) => { exceed = exceedance; sun = solarPosition; return getPointForecastFromCube({
      lat: p.lat, lng: p.lon, country: p.country, hours: DASHBOARD_HOURS, signal: e.abort.signal,
      includeRadarNowcast: true, pointSource: 'cube', onUpdate: onFc,
    }, defaultCubeIo()); })
    .then((fc) => { onFc(fc); e.loadedAt = Date.now(); e.inflight = false; })
    .catch((err: unknown) => {
      e.inflight = false;
      if ((err as { name?: string })?.name === 'AbortError') return;
      // Kein Rückfall (E-DB-17): der Fehler wird benannt; eine schon gezeigte Ausgabe bleibt stehen.
      const why = err instanceof Error ? err.message : String(err);
      emit(e, { status: e.state.fusion ? 'ok' : 'error', error: why });
    });
}

/** Startet (oder nutzt) den Abruf für einen Ort. */
export function prefetchDashboardForecast(p: PlaceIn): void {
  const key = placeKey(p);
  const hit = ENTRIES.get(key);
  // Ein laufender Abruf wird nie abgebrochen und neu gestartet (die erste Ausgabe kann vor dem Ende da sein).
  if (hit && hit.inflight) return;
  if (hit && hit.state.status !== 'error' && Date.now() - hit.loadedAt < REFRESH_MS) return;
  hit?.abort.abort();
  const e: Entry = {
    state: { status: 'loading', fusion: hit?.state.fusion ?? null, error: null, emissions: [], startedAt: Date.now() },
    listeners: hit?.listeners ?? new Set(), abort: new AbortController(), timer: hit?.timer ?? null, loadedAt: 0, inflight: true,
  };
  ENTRIES.set(key, e);
  if (e.state.fusion) e.state.status = 'ok';
  load(p, e);
}

/** Meldet jeden neuen Stand; hält den Eintrag frisch (alle 10 min neu, wie das Panel), solange jemand zuhört. */
export function subscribeDashboardForecast(p: PlaceIn, cb: (s: ForecastState) => void): () => void {
  prefetchDashboardForecast(p);
  const key = placeKey(p);
  const e = ENTRIES.get(key)!;
  e.listeners.add(cb);
  cb(e.state);
  if (e.timer == null) {
    e.timer = window.setInterval(() => {
      const cur = ENTRIES.get(key);
      if (cur && cur.listeners.size) { cur.loadedAt = 0; prefetchDashboardForecast(p); }
    }, REFRESH_MS);
  }
  return () => {
    const cur = ENTRIES.get(key);
    if (!cur) return;
    cur.listeners.delete(cb);
    if (!cur.listeners.size && cur.timer != null) { window.clearInterval(cur.timer); cur.timer = null; }
  };
}

/** Neu laden (Fehlerzustand „Erneut versuchen"). */
export function retryDashboardForecast(p: PlaceIn): void {
  const e = ENTRIES.get(placeKey(p));
  if (e) e.loadedAt = 0;
  if (e && e.inflight) { e.abort.abort(); e.inflight = false; }
  prefetchDashboardForecast(p);
}
