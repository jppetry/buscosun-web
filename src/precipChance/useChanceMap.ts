/**
 * Phase RC: die Chance-Karte des Regenradars — Zustand und Ebene. Der Rechenteil (`chanceMapEngine.ts`) ist ein eigener
 * Lazy-Chunk und lädt erst, wenn die Ansicht „Chance" an ist. Die Karte rechnet je STUNDE neu (der Slider springt in
 * 5-min-Schritten, die Chance gilt für die ganze Stunde).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { chanceHourAt, type ChanceThreshold } from './chanceModel';
import { CHANCE_MAP_IDLE, type ChanceMapInfo } from './chanceMapTypes';
import type { ChanceMapLayer, ChanceMapResult } from './chanceMapEngine';

export type { ChanceMapInfo } from './chanceMapTypes';

type Engine = typeof import('./chanceMapEngine');
let engineP: Promise<Engine> | null = null;
const loadEngine = (): Promise<Engine> => (engineP ??= import('./chanceMapEngine').catch((e) => { engineP = null; throw e; }));

export function useChanceMap(map: maplibregl.Map | null, active: boolean, threshold: ChanceThreshold, timeMs: number | null, refreshKey: number): {
  info: ChanceMapInfo;
  hoverAt: (lat: number, lon: number) => string | null;
} {
  const [info, setInfo] = useState<ChanceMapInfo>(CHANCE_MAP_IDLE);
  const layerRef = useRef<ChanceMapLayer | null>(null);
  const resultRef = useRef<ChanceMapResult | null>(null);
  const engineRef = useRef<Engine | null>(null);
  // Nur die Stunde zählt — innerhalb einer Stunde keine neue Rechnung.
  const hourKey = timeMs == null ? null : chanceHourAt(timeMs, Date.now()).fromMs;

  useEffect(() => () => { layerRef.current?.remove(); layerRef.current = null; }, [map]);
  useEffect(() => { layerRef.current?.setVisible(active); }, [active, map]);

  useEffect(() => {
    if (!active || !map || hourKey == null) { if (!active) setInfo(CHANCE_MAP_IDLE); return; }
    let alive = true;
    const nowMs = Date.now();
    setInfo((p) => ({ ...p, status: 'loading', threshold }));
    loadEngine()
      .then((eng) => {
        engineRef.current = eng;
        if (alive && !layerRef.current) { layerRef.current = new eng.ChanceMapLayer(map); layerRef.current.setVisible(true); }
        return eng.computeChanceMap(hourKey, threshold, nowMs);
      })
      .then((r) => {
        if (!alive) return;
        resultRef.current = r;
        layerRef.current?.setData(r);
        setInfo(r.info);
      })
      .catch((e) => { if (alive) setInfo((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : String(e) })); });
    return () => { alive = false; };
  }, [active, map, threshold, hourKey, refreshKey]);

  const hoverAt = useMemo(() => (lat: number, lon: number): string | null => {
    const r = resultRef.current, eng = engineRef.current;
    if (!active || !r || !eng) return null;
    return eng.chanceHoverText(r, lat, lon);
  }, [active]);

  return { info, hoverAt };
}
