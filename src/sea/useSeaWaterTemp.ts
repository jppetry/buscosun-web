/**
 * Phase WT — the page's state of the water temperature in one hook (`audit/seewetter-wassertemperatur.md`), so
 * `SeaPage.tsx` only passes the pointer, the spot and the clock and gets the card's view and the link value back.
 *
 * Reads: the catalogue once; the model file per pointer and refresh tick; the station's series per spot (and tick);
 * our own daily record once a station is in view. Without the catalogue file the hook returns no view at all — the page
 * is then exactly the one before the phase.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wtHourly, wtPointerOf, wtRecordOf, wtSeasonOf, wtStationOf, type WtCatalog } from './seaWaterTemp';
import {
  WT_WHY, encodeWtParam, loadWtThreshold, parseWtParam, saveWtThreshold, wtModelViewOf, wtObsViewOf,
  type WtModelLoad, type WtObsLoad, type WtThreshold,
} from './waterTemp';
import { loadWaterTemp, loadWtCatalog, loadWtDaily, loadWtObs, loadWtSeason } from './waterTempClient';
import type { SeaWaterTempView } from './SeaWaterTempPanel';

/** `status.json` → the pointer as one string (`''` = none), like the page's other pointers: an unchanged pointer reloads nothing. */
export const wtPointerKey = (status: Record<string, unknown> | null | undefined): string => {
  const p = wtPointerOf(status);
  return p ? `${p.stamp}|${p.path}|${p.builtAt}` : '';
};

export function useSeaWaterTemp(a: {
  spotId: string | null;
  /** `null` = `status.json` not read yet, `''` = it names no file. */
  ptr: string | null;
  killed: boolean; nowMs: number;
  /** Changes with every refresh round of the page. */
  tick: number;
  /** Chosen hour of the page (ms). */
  tMs: number;
  /** `wt` of the link the page was opened with. */
  linkWt: string | null;
}): { view: SeaWaterTempView | null; wt: string | null; on: boolean } {
  const [cat, setCat] = useState<WtCatalog | null | 'loading'>('loading');
  const [model, setModel] = useState<WtModelLoad | 'loading'>('loading');
  const [obs, setObs] = useState<{ key: string; load: WtObsLoad | 'loading' } | null>(null);
  const [daily, setDaily] = useState<unknown | null | 'loading'>('loading');
  const [season, setSeason] = useState<unknown | null>(null);
  // The link's threshold beats the stored one until the user sets their own (then it is stored).
  const [th, setTh] = useState<WtThreshold | null>(() => parseWtParam(a.linkWt) ?? loadWtThreshold());
  const nowRef = useRef(a.nowMs);
  nowRef.current = a.nowMs;

  useEffect(() => {
    const ac = new AbortController();
    loadWtCatalog(ac.signal).then((c) => { if (!ac.signal.aborted) setCat(c); }, () => {});
    return () => ac.abort();
  }, []);
  const catalog = cat !== 'loading' ? cat : null;

  useEffect(() => {
    if (!catalog || a.ptr == null) return;
    if (a.killed) { setModel({ doc: null, state: 'none', why: WT_WHY.killed }); return; }
    const [stamp, path, builtAt] = a.ptr.split('|');
    const ac = new AbortController();
    loadWaterTemp(a.ptr ? { stamp, path, builtAt, checkedAt: builtAt } : null, ac.signal).then((m) => { if (!ac.signal.aborted) setModel(m); }, () => {});
    return () => ac.abort();
  }, [catalog, a.ptr, a.killed, a.tick]);

  const near = a.spotId && catalog ? catalog.spots[a.spotId]?.station ?? null : null;
  const station = near && catalog ? wtStationOf(catalog, near.key) : null;
  const stKey = station?.key ?? null;
  useEffect(() => {
    if (!station || a.killed) { setObs(null); return; }
    const ac = new AbortController();
    setObs((prev) => (prev?.key === station.key ? prev : { key: station.key, load: 'loading' }));
    loadWtObs(station, nowRef.current, ac.signal).then((load) => { if (!ac.signal.aborted) setObs({ key: station.key, load }); }, () => {});
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the station object is stable per key
  }, [stKey, a.killed, a.tick]);
  useEffect(() => {
    if (!stKey) return;
    const ac = new AbortController();
    loadWtDaily(nowRef.current, ac.signal).then((d) => { if (!ac.signal.aborted) setDaily(d); }, () => {});
    loadWtSeason(ac.signal).then((d) => { if (!ac.signal.aborted) setSeason(d); }, () => {});
    return () => ac.abort();
  }, [stKey, a.tick]);

  const onThreshold = useCallback((next: WtThreshold | null) => { saveWtThreshold(next); setTh(next); }, []);

  const view = useMemo<SeaWaterTempView | null>(() => {
    if (!catalog || !a.spotId) return null;
    const obsLoad = a.killed ? { points: null, state: 'error' as const } : obs && obs.key === stKey ? obs.load : stKey ? 'loading' as const : null;
    const obsView = wtObsViewOf({ load: obsLoad, catalog, spotId: a.spotId, nowMs: a.nowMs });
    const points = obsLoad && obsLoad !== 'loading' && obsLoad.points ? obsLoad.points : [];
    return {
      model: wtModelViewOf({ load: a.ptr == null ? 'loading' : model, catalog, spotId: a.spotId, tMs: a.tMs, nowMs: a.nowMs }),
      obs: obsView,
      obsHourly: obsView.station ? wtHourly(points).filter((p) => p.t <= a.nowMs) : [],
      record: !stKey ? null : daily === 'loading' ? 'loading' : wtRecordOf(daily, stKey),
      season: stKey ? wtSeasonOf(season, stKey) : null,
      threshold: th, onThreshold, tMs: a.tMs, nowMs: a.nowMs,
    };
  }, [catalog, a.spotId, a.killed, a.ptr, a.tMs, a.nowMs, model, obs, stKey, daily, season, th, onThreshold]);

  // Until the catalogue is known — and without it — the link's own value stays in the address.
  return { view, wt: catalog ? (th ? encodeWtParam(th) : null) : a.linkWt, on: !!catalog };
}
