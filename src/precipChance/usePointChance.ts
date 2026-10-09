/**
 * Phase RC: die Chance am Ort — volle buscosun Fusion in der aktuellen Stufe (`getPointForecast` mit `pointSource: 'cube'`,
 * derselbe Weg wie Streifen, Summen und Punkt-Panel; die ersten Stunden tragen dort schon das Radar-Stundenmittel), je
 * nativem Schritt für die nächsten 48 h (`chanceBars`). Kein Rückfall auf ein anderes Maß: antwortet buscosun Fusion nicht
 * (oder `?pf=live`), ist die Leiste eine benannte Lücke.
 */
import { useEffect, useState } from 'react';
import type { Country } from '../types';
import { getPointForecast } from '../pointForecast/pointForecast';
import { pfSourceFrom } from '../pointForecast/pfFlags';
import type { PointForecastV2 } from '../pointForecast/fusion/output';
import { FUSION_NAME } from '../pointForecast/fusion/fusionRelease';
import { chanceBars, chanceStepsFromV2, type ChanceBar } from './chanceSeries';

const H = 3_600_000;
export const CHANCE_POINT_HOURS = 48;

export interface PointChance {
  status: 'loading' | 'ready' | 'gap';
  bars: ChanceBar[];
  fromMs: number;
  toMs: number;
  fusionName: string;
  reason: string | null;
}

export function usePointChance(p: { lat: number; lon: number; country: Country } | null, enabled: boolean): PointChance {
  const [st, setSt] = useState<PointChance>(() => {
    const from = Math.floor(Date.now() / H) * H;
    return { status: 'loading', bars: [], fromMs: from, toMs: from + CHANCE_POINT_HOURS * H, fusionName: FUSION_NAME, reason: null };
  });
  const lat = p?.lat, lon = p?.lon, country = p?.country;
  useEffect(() => {
    if (!enabled || lat == null || lon == null || !country) return;
    const ac = new AbortController();
    const fromMs = Math.floor(Date.now() / H) * H, toMs = fromMs + CHANCE_POINT_HOURS * H;
    setSt((s) => ({ ...s, status: 'loading', fromMs, toMs }));
    const gap = (why: string) => setSt({ status: 'gap', bars: [{ fromMs, toMs, stepFromMs: fromMs, stepToMs: toMs, p: null, kind: null, tier: null }], fromMs, toMs, fusionName: FUSION_NAME, reason: why });
    if (pfSourceFrom(typeof window !== 'undefined' ? window.location.search : '') === 'live') { gap('buscosun Fusion abgeschaltet (?pf=live)'); return () => ac.abort(); }
    import('../pointForecast/cubeSource')
      .then((cs) => getPointForecast({ lat, lng: lon, country, hours: CHANCE_POINT_HOURS + 2, signal: ac.signal, includeRadarNowcast: true, pointSource: 'cube' })
        .then((fc) => ({ fc, exceedance: cs.exceedance })))
      .then(({ fc, exceedance }) => {
        if (ac.signal.aborted) return;
        const v2 = (fc.cube as { v2?: PointForecastV2 } | undefined)?.v2;
        if (!v2) { gap('buscosun Fusion ohne Verteilung'); return; }
        const bars = chanceBars(chanceStepsFromV2(v2), fromMs, toMs, exceedance);
        const missingH = bars.filter((b) => !b.p).reduce((n, b) => n + (b.toMs - b.fromMs) / H, 0);
        setSt({ status: 'ready', bars, fromMs, toMs, fusionName: FUSION_NAME, reason: missingH > 0.01 ? `${String(Math.round(missingH * 10) / 10).replace('.', ',')} h ohne Verteilung (Lücke)` : null });
      })
      .catch((e) => { if (!ac.signal.aborted && (e as { name?: string })?.name !== 'AbortError') gap(`buscosun Fusion nicht verfügbar (${e instanceof Error ? e.message : String(e)})`); });
    return () => ac.abort();
  }, [enabled, lat, lon, country]);
  return st;
}
