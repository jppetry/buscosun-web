/**
 * Phase SK: buscosun Fusion in the current stage at the place (50 h, cube path, same call as chance/sums) → the place
 * sentence. No fallback to another measure: without buscosun Fusion (or `?pf=live`) the card is a named gap.
 */
import { useEffect, useState } from 'react';
import type { Country } from '../types';
import { getPointForecast } from '../pointForecast/pointForecast';
import { pfSourceFrom } from '../pointForecast/pfFlags';
import type { PointForecastV2 } from '../pointForecast/fusion/output';
import { FUSION_NAME } from '../pointForecast/fusion/fusionRelease';
import { snowPointsFromV2, columnsFromV2 } from '../nowcast/heightTime/heightTimeModel';
import { snowArrival, type SnowArrival } from './snowArrival';
import { SK_PICK_HOURS } from './snowCapModel';

const H = 3_600_000;

export interface SnowArrivalState { status: 'loading' | 'ready' | 'gap'; arrival: SnowArrival | null; fusionName: string; reason: string | null; fromMs: number }

export function useSnowArrival(p: { lat: number; lon: number; country: Country } | null, enabled: boolean): SnowArrivalState {
  const [st, setSt] = useState<SnowArrivalState>(() => ({ status: 'loading', arrival: null, fusionName: FUSION_NAME, reason: null, fromMs: Math.floor(Date.now() / H) * H }));
  const lat = p?.lat, lon = p?.lon, country = p?.country;
  useEffect(() => {
    if (!enabled || lat == null || lon == null || !country) return;
    const ac = new AbortController();
    const fromMs = Math.floor(Date.now() / H) * H, toMs = fromMs + SK_PICK_HOURS * H;
    setSt({ status: 'loading', arrival: null, fusionName: FUSION_NAME, reason: null, fromMs });
    const gap = (why: string) => setSt({ status: 'gap', arrival: null, fusionName: FUSION_NAME, reason: why, fromMs });
    if (pfSourceFrom(typeof window !== 'undefined' ? window.location.search : '') === 'live') { gap('buscosun Fusion abgeschaltet (?pf=live)'); return () => ac.abort(); }
    import('../pointForecast/cubeSource')
      .then((cs) => getPointForecast({ lat, lng: lon, country, hours: SK_PICK_HOURS + 2, signal: ac.signal, includeRadarNowcast: true, pointSource: 'cube' })
        .then((fc) => ({ fc, exceed: cs.exceedance })))
      .then(({ fc, exceed }) => {
        if (ac.signal.aborted) return;
        const v2 = (fc.cube as { v2?: PointForecastV2 } | undefined)?.v2;
        if (!v2) { gap('buscosun Fusion ohne Verteilung'); return; }
        const hTrue = v2.point.hTrue != null && Number.isFinite(v2.point.hTrue) ? v2.point.hTrue : null;
        const arrival = snowArrival(snowPointsFromV2(v2, fromMs, toMs), hTrue, columnsFromV2(v2, fromMs, toMs, exceed), fromMs, SK_PICK_HOURS);
        setSt({ status: 'ready', arrival, fusionName: FUSION_NAME, reason: null, fromMs });
      })
      .catch((e) => { if (!ac.signal.aborted && (e as { name?: string })?.name !== 'AbortError') gap(`buscosun Fusion nicht verfügbar (${e instanceof Error ? e.message : String(e)})`); });
    return () => ac.abort();
  }, [enabled, lat, lon, country]);
  return st;
}
