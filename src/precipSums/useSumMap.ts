/**
 * Phase NS: die Summen-Karte des Regenradars — Zustand und Ebene. Der Rechenteil (`sumMapEngine.ts`) ist ein eigener
 * Lazy-Chunk und lädt erst, wenn die Ansicht „Summe" an ist; wer „Intensität" zeigt, lädt hier nichts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import type { SumSelection } from './sumModel';
import { SUM_MAP_IDLE, type SumMapInfo } from './sumMapTypes';
import type { SumMapLayer, SumMapResult } from './sumMapEngine';

export type { SumMapInfo } from './sumMapTypes';

type Engine = typeof import('./sumMapEngine');
let engineP: Promise<Engine> | null = null;
const loadEngine = (): Promise<Engine> => (engineP ??= import('./sumMapEngine').catch((e) => { engineP = null; throw e; }));

export function useSumMap(map: maplibregl.Map | null, sel: SumSelection, enabled: boolean, refreshKey: number): {
  info: SumMapInfo;
  hoverAt: (lat: number, lon: number) => string | null;
} {
  const [info, setInfo] = useState<SumMapInfo>(SUM_MAP_IDLE);
  const layerRef = useRef<SumMapLayer | null>(null);
  const resultRef = useRef<SumMapResult | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const active = enabled && sel.mode === 'sum';

  // Die Ebene gehört zu genau einer Karte: beim Kartenwechsel/Abbau wieder abhängen.
  useEffect(() => () => { layerRef.current?.remove(); layerRef.current = null; }, [map]);
  useEffect(() => { layerRef.current?.setVisible(active); }, [active, map]);

  useEffect(() => {
    if (!active || !map) { setInfo(SUM_MAP_IDLE); return; }
    let alive = true;
    const nowMs = Date.now();
    setInfo((p) => ({ ...p, status: 'loading', dir: sel.dir, windowH: sel.windowH, nowMs }));
    // Die Punkte der anderen Richtung (oder des anderen Fensters) nie neben einer neuen Legende stehen lassen.
    if (resultRef.current) resultRef.current = { ...resultRef.current, points: [] };
    layerRef.current?.setStations(null);
    loadEngine()
      .then((eng) => {
        engineRef.current = eng;
        if (alive && !layerRef.current) { layerRef.current = new eng.SumMapLayer(map); layerRef.current.setVisible(true); }
        return eng.computeSumMap(sel.dir, sel.windowH, nowMs);
      })
      .then((r) => {
        if (!alive) return;
        resultRef.current = r;
        layerRef.current?.setImage(r.rgba);
        layerRef.current?.setStations(r.points.length ? r.points : null);
        setInfo(r.info);
      })
      .catch((e) => { if (alive) setInfo((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : String(e) })); });
    return () => { alive = false; };
  }, [active, map, sel.dir, sel.windowH, refreshKey]);

  const hoverAt = useMemo(() => (lat: number, lon: number): string | null => {
    const r = resultRef.current, eng = engineRef.current;
    if (!active || !r || !eng) return null;
    return eng.sumHoverText(r, lat, lon);
  }, [active]);

  return { info, hoverAt };
}
