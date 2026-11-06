/**
 * Ruhige Karte hinter dem Upload-Screen der Tourenplanung: dieselbe Basiskarte, Orientierung, DACH-Maske und
 * Windpartikel wie die Startseite (Wetterkarte), nicht bedienbar. Nur bestehende Bausteine (`WindLayer`,
 * `weatherBasemap`, `loadDachMask`), nichts Neues an Shader oder Quellen. Lazy-Chunk; ohne WebGL bleibt die Fläche leer.
 */
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WindLayer } from '../wind/WindLayer';
import { WEATHER_BASEMAP_STYLE, firstBoundaryLayerId, germanBasemapLabels, orientationEnabledFrom, weatherLabelContrast, addOrientationLayers } from '../map/weatherBasemap';
import { loadDachMask } from '../countryMask';
import { weatherWindOptions, WEATHER_WIND_DENSITY } from '../wind/weatherWindPreset';
import { fetchIconD2Wind, loadWindNowCache, windFrameAtValidTime } from '../wind/iconD2WindSource';

const MASK_SOURCE = 'rbd-mask';
const MASK_LAYER = 'rbd-mask-fill';
/** sand-200, wie `country-mask-fill` der Wetterkarte. */
const MASK_SAND = '#E0D6BE';
const DACH_BOUNDS: [[number, number], [number, number]] = [[5.6, 45.6], [17.4, 55.2]];

function supportsWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export default function RouteBackdropMap() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !supportsWebGL()) return;
    const ac = new AbortController();
    const map = new maplibregl.Map({
      container: host, style: WEATHER_BASEMAP_STYLE, bounds: DACH_BOUNDS, fitBoundsOptions: { padding: 0 },
      interactive: false, fadeDuration: 0, attributionControl: { compact: true },
    });
    map.once('load', () => {
      map.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]').forEach((d) => d.removeAttribute('open'));
    });
    const orient = orientationEnabledFrom();
    map.on('style.load', () => {
      germanBasemapLabels(map);
      if (orient) weatherLabelContrast(map);
    });
    map.on('load', () => {
      const beforeBoundary = firstBoundaryLayerId(map);
      if (orient) addOrientationLayers(map, beforeBoundary);
      const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      const wind = new WindLayer({ ...weatherWindOptions(coarse), minParticles: 50, maxParticles: 48000 });
      wind.setDensityMultiplier(WEATHER_WIND_DENSITY);
      map.addLayer(wind);
      void loadDachMask().then((mask) => {
        if (ac.signal.aborted || map.getSource(MASK_SOURCE)) return;
        map.addSource(MASK_SOURCE, { type: 'geojson', data: mask });
        map.addLayer({ id: MASK_LAYER, type: 'fill', source: MASK_SOURCE, paint: { 'fill-color': MASK_SAND, 'fill-opacity': 1 } }, wind.id);
      }).catch(() => { /* ohne Umriss bleibt die Basiskarte wie sie ist */ });
      void (async () => {
        try {
          const cached = await loadWindNowCache();
          if (cached && !ac.signal.aborted) {
            wind.setWindData(cached.image, { width: cached.width, height: cached.height, uMin: cached.uMin, uMax: cached.uMax, vMin: cached.vMin, vMax: cached.vMax, uvBounds: cached.uvBounds });
          }
          const wd = await fetchIconD2Wind(ac.signal, undefined, undefined, { nowOnly: true, aheadHours: 0 });
          if (ac.signal.aborted) return;
          const f = windFrameAtValidTime(wd, Date.now());
          wind.setWindData(f.image, { width: f.width, height: f.height, uMin: f.uMin, uMax: f.uMax, vMin: f.vMin, vMax: f.vMax, uvBounds: wd.uvBounds });
        } catch { /* Karte ohne Wind ist weiterhin ein gültiger Hintergrund */ }
      })();
    });
    return () => { ac.abort(); map.remove(); };
  }, []);

  return <div ref={hostRef} className="rd-backdrop-map" aria-hidden="true" />;
}
