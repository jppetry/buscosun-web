/**
 * Start cover of a feature page (buscosun mark + ring, `<AppLoader cover done={shown} />`): stays over the page until the page's
 * data are in AND, if the page has a map, the map has its first complete frame (held `settleMs`, so a gap between two loads
 * does not end it), at the latest after `maxMs`. Shown once per page visit. Same rule as the fire radar.
 *
 * `map` null with `needMap` true = the map is not there yet (the cover waits); `needMap` false = a page without a map.
 */
import { useEffect, useState } from 'react';
import type maplibregl from 'maplibre-gl';

/** The map's "complete" state must still hold after this long before the cover may leave. */
const MAP_CONFIRM_MS = 300;

export function usePageCover(map: maplibregl.Map | null, dataReady: boolean, needMap = true, settleMs = 400, maxMs = 20_000): boolean {
  const [mapLoaded, setMapLoaded] = useState(!needMap);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!needMap || !map || mapLoaded) return;
    // `idle` = style, tiles and sources are loaded AND the frame is drawn; `render` as well, because a map with an animated
    // layer (wind particles) repaints all the time and never goes idle.
    // The first complete-looking frame can be reported BEFORE the sources have requested their tiles (nothing is "loading"
    // yet), so the map only counts as loaded when the state still holds MAP_CONFIRM_MS later (and `loaded()` agrees).
    let confirm = 0;
    const ok = () => map.isStyleLoaded() && map.areTilesLoaded() && map.loaded();
    const on = () => {
      if (confirm || !ok()) return;
      confirm = window.setTimeout(() => {
        confirm = 0;
        if (ok()) setMapLoaded(true);
      }, MAP_CONFIRM_MS);
    };
    map.on('idle', on);
    map.on('render', on);
    on();
    return () => { window.clearTimeout(confirm); map.off('idle', on); map.off('render', on); };
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
