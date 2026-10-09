/**
 * Phase HZS: data of the height-time section — buscosun Fusion in the current stage over 336 h at the chosen point
 * (`getPointForecast` with `pointSource: 'cube'`, the same way as chance, sums and the point panel; progressive, so the
 * first stage shows before the full window) plus the terrain ring. No fallback to another measure: if buscosun Fusion
 * does not answer (or `?pf=live`), the section is a named gap.
 */
import { useEffect, useState } from 'react';
import type { Country } from '../../types';
import { getPointForecast } from '../../pointForecast/pointForecast';
import { pfSourceFrom } from '../../pointForecast/pfFlags';
import type { PointForecastV2 } from '../../pointForecast/fusion/output';
import type { Dist } from '../../pointForecast/fusion/dist';
import { FUSION_NAME } from '../../pointForecast/fusion/fusionRelease';
import type { CellRowIn, TerrainStats } from './heightTimeModel';
import { loadTerrainRing } from './terrainRing';

export const HZS_HOURS = 336;

export interface HeightTimeData {
  status: 'loading' | 'ready' | 'gap';
  v2: PointForecastV2 | null;
  cells: CellRowIn[] | null;
  /** Fusion still delivers further stages (progressive output). */
  pending: boolean;
  terrain: TerrainStats | null;
  terrainStatus: 'loading' | 'ready' | 'gap';
  exceed: ((d: Dist, x: number) => number) | null;
  fusionName: string;
  reason: string | null;
}

const INIT: HeightTimeData = { status: 'loading', v2: null, cells: null, pending: false, terrain: null, terrainStatus: 'loading', exceed: null, fusionName: FUSION_NAME, reason: null };

export function useHeightTime(p: { lat: number; lon: number; country: Country } | null, enabled: boolean): HeightTimeData {
  const [st, setSt] = useState<HeightTimeData>(INIT);
  const lat = p?.lat, lon = p?.lon, country = p?.country;
  useEffect(() => {
    if (!enabled || lat == null || lon == null || !country) return;
    const ac = new AbortController();
    setSt(INIT);
    loadTerrainRing(lat, lon, ac.signal)
      .then((t) => { if (!ac.signal.aborted) setSt((s) => ({ ...s, terrain: t, terrainStatus: t ? 'ready' : 'gap' })); })
      .catch(() => { if (!ac.signal.aborted) setSt((s) => ({ ...s, terrain: null, terrainStatus: 'gap' })); });
    const gap = (why: string) => setSt((s) => ({ ...s, status: 'gap', v2: null, cells: null, pending: false, reason: why }));
    if (pfSourceFrom(typeof window !== 'undefined' ? window.location.search : '') === 'live') { gap('buscosun Fusion abgeschaltet (?pf=live)'); return () => ac.abort(); }
    import('../../pointForecast/cubeSource')
      .then((cs) => {
        const take = (fc: Awaited<ReturnType<typeof getPointForecast>>) => {
          if (ac.signal.aborted) return;
          const cube = fc.cube as { v2?: PointForecastV2; cells?: CellRowIn[]; pending?: string[] } | undefined;
          if (!cube?.v2) { gap('buscosun Fusion ohne Verteilung'); return; }
          setSt((s) => ({ ...s, status: 'ready', v2: cube.v2!, cells: cube.cells ?? null, pending: (cube.pending ?? []).length > 0, exceed: cs.exceedance, reason: null }));
        };
        return getPointForecast({ lat, lng: lon, country, hours: HZS_HOURS, signal: ac.signal, includeRadarNowcast: true, pointSource: 'cube', onUpdate: take }).then(take);
      })
      .catch((e) => { if (!ac.signal.aborted && (e as { name?: string })?.name !== 'AbortError') gap(`buscosun Fusion nicht verfügbar (${e instanceof Error ? e.message : String(e)})`); });
    return () => ac.abort();
  }, [enabled, lat, lon, country]);
  return st;
}
