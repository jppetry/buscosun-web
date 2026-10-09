/**
 * Phase ZO (E-ZO-4): buscosun Fusion am gewählten Ort in der Ankunftsstunde der Zelle — derselbe Weg wie die Regenchance
 * am Ort (`getPointForecast` mit `pointSource: 'cube'`, Stufe fs), nur gelesen. Kein Rückfall auf ein anderes Maß:
 * antwortet buscosun Fusion nicht (oder `?pf=live`), fehlt der Block mit Grund.
 */
import { useEffect, useState } from 'react';
import type { Country } from '../types';
import { getPointForecast } from '../pointForecast/pointForecast';
import { pfSourceFrom } from '../pointForecast/pfFlags';
import type { PointForecastV2 } from '../pointForecast/fusion/output';
import { FUSION_NAME } from '../pointForecast/fusion/fusionRelease';
import { arrivalHour, cellFusionHint, type CellFusionHint } from './cellFusionHint';

export interface CellFusionState {
  status: 'off' | 'loading' | 'ready' | 'gap';
  hint: CellFusionHint | null;
  hour: { fromMs: number; toMs: number } | null;
  fusionName: string;
  reason: string | null;
}

const OFF: CellFusionState = { status: 'off', hint: null, hour: null, fusionName: FUSION_NAME, reason: null };

export function useCellFusionHint(p: { lat: number; lon: number; country: Country }, windowFromMs: number | null, enabled: boolean): CellFusionState {
  const [st, setSt] = useState<CellFusionState>(OFF);
  const hourFrom = windowFromMs != null ? arrivalHour(windowFromMs, Date.now()).fromMs : null;
  const { lat, lon, country } = p;
  useEffect(() => {
    if (!enabled || hourFrom == null) { setSt(OFF); return; }
    const hour = { fromMs: hourFrom, toMs: hourFrom + 3_600_000 };
    const ac = new AbortController();
    setSt({ ...OFF, status: 'loading', hour });
    const gap = (why: string) => setSt({ status: 'gap', hint: null, hour, fusionName: FUSION_NAME, reason: why });
    if (pfSourceFrom(typeof window !== 'undefined' ? window.location.search : '') === 'live') { gap('buscosun Fusion abgeschaltet (?pf=live)'); return () => ac.abort(); }
    import('../pointForecast/cubeSource')
      .then((cs) => getPointForecast({ lat, lng: lon, country, hours: 4, signal: ac.signal, includeRadarNowcast: true, pointSource: 'cube' })
        .then((fc) => ({ fc, exceedance: cs.exceedance })))
      .then(({ fc, exceedance }) => {
        if (ac.signal.aborted) return;
        const v2 = (fc.cube as { v2?: PointForecastV2 } | undefined)?.v2;
        if (!v2) { gap('buscosun Fusion ohne Verteilung'); return; }
        const hint = cellFusionHint(v2, hour, exceedance);
        if (!hint.heavy && !hint.gust) { gap('keine Verteilung in dieser Stunde'); return; }
        setSt({ status: 'ready', hint, hour, fusionName: FUSION_NAME, reason: null });
      })
      .catch((e) => { if (!ac.signal.aborted && (e as { name?: string })?.name !== 'AbortError') gap(`buscosun Fusion nicht verfügbar (${e instanceof Error ? e.message : String(e)})`); });
    return () => ac.abort();
  }, [enabled, hourFrom, lat, lon, country]);
  return st;
}
