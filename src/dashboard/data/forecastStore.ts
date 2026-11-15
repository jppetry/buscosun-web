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
import type { TierId } from '../../point/cubeFormat';
import { readSnapshot, writeSnapshot } from './forecastSnapshot';

export const DASHBOARD_HOURS = 336;
const TIER_IDS: readonly TierId[] = ['t1', 't2', 't3'];

/**
 * E-DB-20: `true` once the forecast spans the whole window. The cube path's first paint (t1 only) names the tiers it
 * still waits for in `pending`; the core output (or a first output that already was the core) names none.
 */
export function coversWindow(f: FusionIn): boolean {
  return !f.pending.some((p) => (TIER_IDS as readonly string[]).includes(p));
}
const REFRESH_MS = 10 * 60_000;

export interface ForecastState {
  status: 'loading' | 'ok' | 'error';
  fusion: FusionIn | null;
  error: string | null;
  /** Ausgaben mit Zeit ab Start (ms) — für `?pflog=1` und die Latenzmessung. */
  emissions: Array<{ kind: string; ms: number }>;
  startedAt: number;
}

interface Entry { state: ForecastState; listeners: Set<(s: ForecastState) => void>; abort: AbortController; timer: number | null; loadedAt: number; inflight: boolean; /** The answer shown is the kept one of the last visit, no live answer yet. */ snapshot: boolean; /** Timers: a held partial answer, the pending write of the kept answer. */ hold: ReturnType<typeof setTimeout> | null; save: ReturnType<typeof setTimeout> | null }
const ENTRIES = new Map<string, Entry>();

/**
 * The build that writes and reads the kept answers (`forecastSnapshot.ts`): the address of this module. Its file name
 * carries the hash of this chunk, which changes with the model and (through the import address) with the Fusion chunk.
 */
const SNAPSHOT_STAMP = import.meta.url;

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
    nights: nightsOf(p, cube.v2.axis.steps, sun),
  };
}

/** E-DB-23 (P92): Nächte über die Achse — Sonne unter −0,833° (Oberrand mit Refraktion), alle 10 min geprüft. */
const NIGHT_ELEV_DEG = -0.833;
const NIGHT_STEP_MS = 10 * 60_000;
export function nightsOf(p: PlaceIn, steps: ReadonlyArray<{ validAtMs: number }>, sun: SunFn): Array<[number, number]> {
  if (!steps.length) return [];
  const from = steps[0].validAtMs, to = steps[steps.length - 1].validAtMs + 3_600_000;
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  for (let t = from; t <= to; t += NIGHT_STEP_MS) {
    const dark = sun(p.lat, p.lon, t).elevationDeg < NIGHT_ELEV_DEG;
    if (dark && start == null) start = t;
    if (!dark && start != null) { out.push([start, t]); start = null; }
  }
  if (start != null) out.push([start, to]);
  return out;
}

function emit(e: Entry, patch: Partial<ForecastState>) {
  e.state = { ...e.state, ...patch };
  for (const l of e.listeners) l(e.state);
}

/**
 * Ein Fehlstart ohne jede Ausgabe wird EINMAL von selbst wiederholt (gesetzt) — derselbe Weg, kein Rückfall (E-DB-17).
 * 1,2 s statt 3 s (Jan 15.11.): der Fehlschlag kommt meist erst nach den Fristen des Lesers, die Seite wartet solange
 * unter dem Ladekreis.
 */
const AUTO_RETRY_MS = 1_200;
/**
 * A partial answer (the first paint: t1 only) is held back while a whole window is on screen — the kept answer of the last
 * visit or the one before a refresh — because the 14 days would shrink to two and grow back. If no whole answer follows
 * within this time (set; the reader's limits are 8 s per file), the partial one is shown after all: it is the newer truth.
 */
const PARTIAL_HOLD_MS = 10_000;
/** The answer is kept this long after the last whole output of a load (set) — the later outputs (anchor, radar) replace the earlier. */
const SNAPSHOT_SAVE_MS = 1_500;

function load(p: PlaceIn, e: Entry, attempt = 0) {
  const t0 = performance.now();
  try { performance.mark('dbd:fusion:start'); } catch { /* ohne Performance-API */ }
  let exceed: ((d: Dist, x: number) => number) | null = null;
  let sun: SunFn | null = null;
  /** Endgültiger Fehlschlag ohne Ausgabe: beim ersten Mal still neu versuchen (schwache Leitung), danach benennen. */
  const failed = (why: string): void => {
    // A kept answer on screen is no live answer: the load is repeated as if nothing were shown, the answer stays meanwhile.
    if (attempt === 0 && (!e.state.fusion || e.snapshot) && !e.abort.signal.aborted) {
      if (!e.state.fusion) emit(e, { status: 'loading', error: null });
      window.setTimeout(() => {
        if (ENTRIES.get(placeKey(p)) !== e || e.abort.signal.aborted) return;
        e.inflight = true;
        load(p, e, 1);
      }, AUTO_RETRY_MS);
      return;
    }
    // Still only the kept answer: this was no load — the next wake-up (online, foreground) or tick tries again at once.
    if (e.snapshot) e.loadedAt = 0;
    emit(e, { status: e.state.fusion ? 'ok' : 'error', error: e.state.fusion ? null : why });
  };
  const onFc = (fc: PointForecast, final = false) => {
    if (e.abort.signal.aborted || !exceed || !sun) return;
    const f = toFusionIn(fc, exceed, sun, p);
    if (!f) {
      const c = fc.cube as unknown as CubePathSummary | undefined;
      const why = [...(c?.errors ?? []), ...(c?.skips ?? [])].slice(0, 3).join(' · ') || 'Cube ohne Schritte';
      if (final) failed(why); else emit(e, { status: e.state.fusion ? 'ok' : 'error', error: e.state.fusion ? null : why });
      return;
    }
    const kind = f.emission ?? 'final';
    const emissions = [...e.state.emissions, { kind, ms: Math.round(performance.now() - t0) }];
    const show = (x: FusionIn) => { e.snapshot = false; emit(e, { status: 'ok', fusion: x, error: null }); };
    if (e.hold != null) { clearTimeout(e.hold); e.hold = null; }
    // `PARTIAL_HOLD_MS`: the cube path RETURNS its first paint (t1 only) and delivers the whole window as an update.
    if (e.state.fusion && coversWindow(e.state.fusion) && !coversWindow(f)) {
      e.state = { ...e.state, emissions };
      e.hold = setTimeout(() => { e.hold = null; if (ENTRIES.get(placeKey(p)) === e && !e.abort.signal.aborted) show(f); }, PARTIAL_HOLD_MS);
      return;
    }
    e.state = { ...e.state, emissions };
    show(f);
    if (coversWindow(f)) {
      if (e.save != null) clearTimeout(e.save);
      e.save = setTimeout(() => { e.save = null; if (!e.abort.signal.aborted && e.state.fusion === f) void writeSnapshot(placeKey(p), SNAPSHOT_STAMP, f); }, SNAPSHOT_SAVE_MS);
    }
  };
  import('../../pointForecast/cubeSource')
    .then(({ getPointForecastFromCube, defaultCubeIo, exceedance, solarPosition }) => { exceed = exceedance; sun = solarPosition; return getPointForecastFromCube({
      lat: p.lat, lng: p.lon, country: p.country, hours: DASHBOARD_HOURS, signal: e.abort.signal,
      includeRadarNowcast: true, pointSource: 'cube', onUpdate: (fc: PointForecast) => onFc(fc),
    }, defaultCubeIo()); })
    .then((fc) => { e.loadedAt = Date.now(); e.inflight = false; onFc(fc, true); })
    .catch((err: unknown) => {
      e.inflight = false;
      if ((err as { name?: string })?.name === 'AbortError') return;
      // Kein Rückfall (E-DB-17): der Fehler wird benannt; eine schon gezeigte Ausgabe bleibt stehen.
      const why = err instanceof Error ? err.message : String(err);
      if (e.state.fusion && !e.snapshot) emit(e, { status: 'ok', error: why }); else failed(why);
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
    listeners: hit?.listeners ?? new Set(), abort: new AbortController(), timer: hit?.timer ?? null, loadedAt: 0, inflight: true, snapshot: hit?.snapshot ?? false, hold: null, save: null,
  };
  ENTRIES.set(key, e);
  if (e.state.fusion) e.state.status = 'ok';
  load(p, e);
  // Warm start: nothing in memory for this place ⇒ show the kept answer of the last visit until the fresh one is whole.
  // Read next to the load, never before it; a live answer that came first stays.
  if (!hit) {
    void readSnapshot(key, SNAPSHOT_STAMP).then((snap) => {
      if (!snap || ENTRIES.get(key) !== e || e.abort.signal.aborted || e.state.fusion) return;
      try { performance.mark('dbd:fusion:snapshot'); } catch { /* ohne Performance-API */ }
      e.snapshot = true;
      emit(e, { status: 'ok', fusion: snap.fusion, error: null, emissions: [...e.state.emissions, { kind: 'snapshot', ms: Date.now() - e.state.startedAt }] });
    });
  }
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
  // Back online or back in the foreground (a phone throttles the timer in the background): an error state loads again by
  // itself, an answer older than the refresh period is renewed. `prefetch` decides — a running or fresh load is left alone.
  const wake = () => {
    if (document.visibilityState === 'hidden') return;
    const cur = ENTRIES.get(key);
    if (cur && cur.listeners.size) prefetchDashboardForecast(p);
  };
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', wake);
  return () => {
    window.removeEventListener('online', wake);
    document.removeEventListener('visibilitychange', wake);
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
