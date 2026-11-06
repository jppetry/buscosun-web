/**
 * Start cover of a feature page (buscosun mark + ring, `<AppLoader cover done={shown} />`): stays over the page until the page's
 * data are in AND, if the page has a map, the map has its first complete frame (held `settleMs`, so a gap between two loads
 * does not end it), at the latest after `maxMs`. Shown once per page visit. Same rule as the fire radar.
 *
 * `map` null with `needMap` true = the map is not there yet (the cover waits); `needMap` false = a page without a map.
 */
import { useEffect, useState } from 'react';
import type maplibregl from 'maplibre-gl';

export function usePageCover(map: maplibregl.Map | null, dataReady: boolean, needMap = true, settleMs = 400, maxMs = 20_000): boolean {
  const [mapLoaded, setMapLoaded] = useState(!needMap);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!needMap || !map || mapLoaded) return;
    // `idle` = style, tiles and sources are loaded AND the frame is drawn; `render` as well, because a map with an animated
    // layer (wind particles) repaints all the time and never goes idle.
    const on = () => { if (map.isStyleLoaded() && map.areTilesLoaded()) setMapLoaded(true); };
    map.on('idle', on);
    map.on('render', on);
    return () => { map.off('idle', on); map.off('render', on); };
  }, [map, needMap, mapLoaded]);
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
