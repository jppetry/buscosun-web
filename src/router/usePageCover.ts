/**
 * Start cover of a map page (buscosun mark + ring, `<AppLoader cover done={shown} />`): stays over the page until the map has
 * its first complete frame AND the page's data are in (held `settleMs`, so a gap between two loads does not end it), at the
 * latest after `maxMs`. Shown once per page visit. Same rule as the fire radar.
 */
import { useEffect, useState } from 'react';
import type maplibregl from 'maplibre-gl';

export function usePageCover(map: maplibregl.Map | null, dataReady: boolean, settleMs = 400, maxMs = 20_000): boolean {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!map) return;
    // `idle` = style, tiles and sources are loaded AND the frame is drawn.
    const on = () => { if (map.isStyleLoaded() && map.areTilesLoaded()) setMapLoaded(true); };
    map.on('idle', on);
    return () => { map.off('idle', on); };
  }, [map]);
  const ready = mapLoaded && dataReady;
  useEffect(() => {
    if (shown || !ready) return;
    const t = window.setTimeout(() => setShown(true), settleMs);
    return () => window.clearTimeout(t);
  }, [shown, ready, settleMs]);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), maxMs);
    return () => window.clearTimeout(t);
  }, [maxMs]);
  return shown;
}
