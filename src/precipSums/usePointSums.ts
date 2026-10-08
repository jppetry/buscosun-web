/**
 * Phase NS: die zwei Zahlen am Ort für das gewählte Fenster.
 *
 *   Gefallen  — die nächste Station mit Niederschlagsmessung (`obs/v1`, ≤ 10 km, Name und Abstand), Fenster bis zu ihrem
 *               jüngsten Wert. 48 h: keine gemessene Quelle (Lücke, benannt).
 *   Erwartet  — buscosun Fusion in der aktuellen Stufe für das GANZE Fenster (`getPointForecast` mit `pointSource: 'cube'`,
 *               derselbe Weg wie Streifen und Punkt-Panel; die ersten Stunden tragen dort schon das Radar), Erwartungswert
 *               aus den nativen Schritten (`fusionWindowSum`). Nur wenn buscosun Fusion nicht antwortet (oder `?pf=live`),
 *               steht der reine Radar-Nowcast des Streifens — gekennzeichnet und nur, soweit er das Fenster trägt.
 */
import { useEffect, useState } from 'react';
import type { Country } from '../types';
import { getPointForecast } from '../pointForecast/pointForecast';
import { pfSourceFrom } from '../pointForecast/pfFlags';
import type { PointForecastV2 } from '../pointForecast/fusion/output';
import { FUSION_NAME } from '../pointForecast/fusion/fusionRelease';
import type { Nowcast } from '../nowcast/nowcastModel';
import { fusionWindowSum, sumStepsFromV2, barsOf, barBinH, type FusionWindowSum, type SumBar } from './fusionWindowSum';
import { loadObsCatalog, loadObsLatest, loadObsSeries, withSignal } from './obsSumStore';
import { nearestRainStation, obsWindowSumFromSeries, obsGapReason, obsBars, OBS_SERIES_H, OBS_NETWORK_LABEL, type NearStation, type ObsWindowSum } from './obsWindowSum';

const H = 3_600_000;

export interface PastSide {
  status: 'loading' | 'ready' | 'gap' | 'error';
  sum: ObsWindowSum | null;
  station: NearStation | null;
  network: string | null;
  reason: string | null;
  bars: Array<{ fromMs: number; toMs: number; mm: number | null }>;
}
export interface FutureSide {
  status: 'loading' | 'ready' | 'gap' | 'error';
  /** `fusion` = buscosun Fusion; `radar` = nur Radar-Nowcast (Fusion fehlt, gekennzeichnet). */
  origin: 'fusion' | 'radar' | null;
  sum: FusionWindowSum | null;
  /** Radar-Rückfall: Summe und Ende des Nowcasts. */
  radar: { mm: number; toMs: number; complete: boolean } | null;
  fusionName: string;
  reason: string | null;
  bars: SumBar[];
}

const CUBE_HOURS = (w: number) => (w <= 6 ? 8 : w <= 12 ? 14 : w <= 24 ? 26 : 50);

/** Radar-Nowcast des Streifens als Rückfall: nur die Schritte mit Quelle Radar. */
function radarFallback(nc: Nowcast | null, nowMs: number, windowH: number): FutureSide['radar'] {
  if (!nc || !nc.hasRadar) return null;
  const stepH = 15 / 60;
  let mm = 0, toMs = nowMs;
  for (const s of nc.steps) {
    if (s.source !== 'radar') break;
    const t = s.timestamp.getTime();
    if (t > nowMs + windowH * H) break;
    mm += Math.max(0, s.mmH) * stepH;
    toMs = t;
  }
  if (toMs <= nowMs) return null;
  return { mm, toMs, complete: toMs >= nowMs + windowH * H - 60_000 };
}

export function usePointSums(p: { lat: number; lon: number; country: Country } | null, windowH: number, nowcast: Nowcast | null, enabled: boolean): { past: PastSide; future: FutureSide; nowMs: number } {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [past, setPast] = useState<PastSide>({ status: 'loading', sum: null, station: null, network: null, reason: null, bars: [] });
  const [future, setFuture] = useState<FutureSide>({ status: 'loading', origin: null, sum: null, radar: null, fusionName: FUSION_NAME, reason: null, bars: [] });
  const lat = p?.lat, lon = p?.lon, country = p?.country;
  const ncKey = nowcast ? `${nowcast.runAtMs}:${nowcast.fetchedAtMs}` : '';

  // Gefallen
  useEffect(() => {
    if (!enabled || lat == null || lon == null) return;
    const ac = new AbortController();
    const now = Date.now();
    setNowMs(now);
    setPast((s) => ({ ...s, status: 'loading' }));
    (async () => {
      const [cat, latest] = await withSignal(Promise.all([loadObsCatalog(), loadObsLatest()]), ac.signal);
      const st = nearestRainStation(cat, latest.stations, lat, lon, now);
      const binH = barBinH(windowH);
      if (!st || windowH > OBS_SERIES_H - 1) {
        setPast({ status: 'gap', sum: null, station: st, network: st ? OBS_NETWORK_LABEL[st.src] ?? st.src : null, reason: obsGapReason(windowH, st), bars: [] });
        return;
      }
      const doc = await withSignal(loadObsSeries(st.src), ac.signal);
      const sum = obsWindowSumFromSeries(doc, st.station.id, doc.stations[st.station.id]?.rr, windowH, Date.now());
      if (!sum) { setPast({ status: 'gap', sum: null, station: st, network: OBS_NETWORK_LABEL[st.src] ?? st.src, reason: obsGapReason(windowH, st), bars: [] }); return; }
      setPast({ status: 'ready', sum, station: st, network: OBS_NETWORK_LABEL[st.src] ?? st.src, reason: sum.complete ? null : `nur ${sum.n} von ${sum.of} Werten — Teilsumme`, bars: obsBars(sum, binH) });
    })().catch((e) => {
      if (ac.signal.aborted) return;
      setPast({ status: 'error', sum: null, station: null, network: null, reason: `Stationsmessungen nicht erreichbar (${e instanceof Error ? e.message : String(e)})`, bars: [] });
    });
    return () => ac.abort();
  }, [enabled, lat, lon, windowH]);

  // Erwartet
  useEffect(() => {
    if (!enabled || lat == null || lon == null || !country) return;
    const ac = new AbortController();
    const now = Date.now();
    setFuture((s) => ({ ...s, status: 'loading' }));
    const binH = barBinH(windowH);
    const fallback = (why: string) => {
      const r = radarFallback(nowcast, now, windowH);
      setFuture({
        status: r ? 'ready' : 'gap', origin: r ? 'radar' : null, sum: null, radar: r, fusionName: FUSION_NAME, bars: [],
        reason: r ? `buscosun Fusion nicht verfügbar (${why}) — nur Radar-Nowcast${r.complete ? '' : ` bis ${new Date(r.toMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}` : `buscosun Fusion nicht verfügbar (${why})`,
      });
    };
    if (pfSourceFrom(typeof window !== 'undefined' ? window.location.search : '') === 'live') { fallback('?pf=live'); return () => ac.abort(); }
    import('../pointForecast/cubeSource')
      .then(() => getPointForecast({ lat, lng: lon, country, hours: CUBE_HOURS(windowH), signal: ac.signal, includeRadarNowcast: true, pointSource: 'cube' }))
      .then((fc) => {
        if (ac.signal.aborted) return;
        const v2 = (fc.cube as { v2?: PointForecastV2 } | undefined)?.v2;
        if (!v2) { fallback('keine Verteilung'); return; }
        const sum = fusionWindowSum(sumStepsFromV2(v2), now, windowH);
        setFuture({
          status: 'ready', origin: 'fusion', sum, radar: null, fusionName: FUSION_NAME,
          reason: sum.complete ? null : `nur ${sum.coveredH.toFixed(1).replace('.', ',')} von ${windowH} h belegt — Teilsumme`,
          bars: barsOf(sum.pieces, now, now + windowH * H, binH),
        });
      })
      .catch((e) => { if (!ac.signal.aborted && (e as { name?: string })?.name !== 'AbortError') fallback(e instanceof Error ? e.message : String(e)); });
    return () => ac.abort();
    // `nowcast` nur für den Rückfall — neu rechnen, wenn ein neuer Lauf kommt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lat, lon, country, windowH, ncKey]);

  return { past, future, nowMs };
}
