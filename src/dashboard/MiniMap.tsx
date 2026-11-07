/**
 * Kleiner Kartenausschnitt neben der Jetzt-Kachel (Desktop): der gewählte Ort mit denselben Start-Ebenen wie die Wetterkarte
 * (`DEFAULT_MAP_LAYERS` Niederschlag + Wind, dazu ihre dauerhaften Temperaturwerte).
 * Lazy-Chunk, wird erst gemountet, wenn die Fusion da ist (E-DB-20: das Netz gehört zuerst dem Kern).
 *
 * Nur bestehende Bausteine, nichts Neues an Shader oder Quellen:
 *  - Wind: `WindLayer` (Wetterkarte, gleiche Optik) mit dem ICON-D2-10-m-Gitter (`fetchIconD2Wind`, Jetzt-Fenster, Sofort-Bild
 *    aus dem Cache). Das ist das Modellfeld, nicht der Fusion-Wert der Kachel — die Beschriftung sagt es.
 *  - Niederschlag: jüngstes Radarbild des Landes des Orts (DE RV-Analyse, AT INCA-Anfangsbild, CH RZC), per CPU auf ein
 *    `canvas`-Bild gelegt wie auf der 3D-Bühne (`radarDrape.ts`). Ohne Radar für den Ort steht „Radar: nicht verfügbar".
 *  - Temperatur: die Orts-Werte der Wetterkarte (`temperatureLabels.ts`, gleiche Orte, gleiches t_2m-Gitter, gleiche Farbe),
 *    zuerst aus dem Sofort-Cache. Eigene CSS-Klassen, weil `MapView.css` im Dashboard noch nicht geladen sein muss.
 * Die Karte ist nicht bedienbar (kein Scroll-Fang auf der Seite); die Namensnennung der Basiskarte bleibt sichtbar.
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WindLayer } from '../wind/WindLayer';
import { WEATHER_BASEMAP_STYLE, firstBoundaryLayerId, germanBasemapLabels, orientationEnabledFrom, weatherLabelContrast, addOrientationLayers } from '../map/weatherBasemap';
import { loadDachMask } from '../countryMask';
import { weatherWindOptions, WEATHER_WIND_DENSITY } from '../wind/weatherWindPreset';
import { fetchIconD2Wind, loadWindNowCache, windFrameAtValidTime } from '../wind/iconD2WindSource';
import { fetchIconD2Temp } from '../sources/iconD2TempSource';
import { frameAtValidTime } from '../sources/frameAtValidTime';
import { DACH_CITIES, PLACE_LABEL_MIN_ZOOM, TemperatureSampler, loadTempLabelCache, minZoomForRank, saveTempLabelCache, tempLabelColor, visiblePlaceLabels, type City } from '../temperatureLabels';
import { fetchRvLatestAnalysis } from '../sources/radolan';
import { fetchRzcLatest } from '../sources/meteoSwissRadar';
import { fetchIncaGrid } from '../sources/geosphereIncaGrid';
import { drapeCorners, drapeImageSliced, type DrapeBox, type TowerRadarPick } from '../nowcast/cellTowers/radarDrape';
import type { PlaceIn } from './model/types';
import { BASEMAP_SOURCE, CC_BY_URL, DWD_OPEN_DATA_URL, GEOSPHERE_CREDIT, MAP_SOURCES_LINK, MapSourcesTile, type MapSourceGroup } from '../map/MapSourcesTile';

/** Same basemap, labels, orientation layers and DACH mask as the Wetterkarte (`MapView`), so the tile reads as a piece of it. */
const STYLE_URL = WEATHER_BASEMAP_STYLE;
const MASK_SOURCE = 'dbd-mm-mask';
const MASK_LAYER = 'dbd-mm-mask-fill';
/** sand-200, the Wetterkarte's `country-mask-fill`. */
const MASK_SAND = '#E0D6BE';
const SRC_RADAR = 'dbd-mm-radar';
const ZOOM = 9;
/** Radar picture box around the place (degrees): a bit more than the visible area, so a slow pan never shows an edge. */
const BOX_LON = 0.75, BOX_LAT = 0.5;
const PICTURE_PX = 512;

type Part = 'loading' | 'ok' | 'na';

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

function supportsWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/** Latest radar picture of the place's country (the drape picks the country per pixel, so neighbours stay empty). */
async function loadRadarPick(country: PlaceIn['country'], signal: AbortSignal): Promise<TowerRadarPick | null> {
  try {
    if (country === 'DE') {
      const r = await fetchRvLatestAnalysis(signal);
      if (!r) return null;
      const f = r.frame;
      return { timeMs: f.validAt.getTime(), DE: { values: f.values, values2: f.values2, width: f.width, height: f.height, corners: r.corners }, AT: null, CH: null };
    }
    if (country === 'CH') {
      const f = await fetchRzcLatest(signal);
      return { timeMs: f.validAt.getTime(), DE: null, AT: null, CH: { values: f.values, values2: f.values2, width: f.width, height: f.height, corners: f.corners } };
    }
    const g = await fetchIncaGrid(signal);
    const f = g.frames[0];
    if (!f) return null;
    return { timeMs: Date.now(), DE: null, AT: { values: f.values, values2: f.values2, width: f.width, height: f.height, corners: g.corners }, CH: null };
  } catch {
    return null;
  }
}

/** Paints the Wetterkarte's temperature labels (`MapView`) for the visible part of this map. */
function paintTempLabels(map: maplibregl.Map, markers: Map<string, maplibregl.Marker>, getTemp: (c: City) => number | null) {
  const keep = new Set<string>();
  const put = (key: string, lng: number, lat: number, t: number, rank: number) => {
    let m = markers.get(key);
    if (!m) {
      const el = document.createElement('div');
      el.innerHTML = '<span class="dbd-mm-temp-val"></span><span class="dbd-mm-temp-dot"></span>';
      // As in the Wetterkarte: the number left of the dot, the dot on the place, the basemap's name to the right of it.
      m = new maplibregl.Marker({ element: el, anchor: 'right', offset: [2, 0] }).setLngLat([lng, lat]).addTo(map);
      markers.set(key, m);
    }
    const root = m.getElement();
    root.className = `dbd-mm-temp dbd-mm-temp-rank-${rank}`;
    root.style.color = tempLabelColor(t);
    root.firstElementChild!.textContent = `${Math.round(t)}°`;
    keep.add(key);
  };
  const zoom = map.getZoom();
  const view = map.getBounds();
  for (const city of DACH_CITIES) {
    if (zoom < minZoomForRank(city.rank) || !view.contains([city.lng, city.lat])) continue;
    const t = getTemp(city);
    if (t != null && Number.isFinite(t)) put(city.name, city.lng, city.lat, t, city.rank);
  }
  if (zoom >= PLACE_LABEL_MIN_ZOOM) {
    for (const p of visiblePlaceLabels(map, keep)) {
      const t = getTemp({ name: p.name, lat: p.lat, lng: p.lng, rank: 4 });
      if (t != null && Number.isFinite(t)) put(p.key, p.lng, p.lat, t, 4);
    }
  }
  for (const [key, m] of markers) {
    if (!keep.has(key)) { m.remove(); markers.delete(key); }
  }
}

export default function MiniMap({ place }: { place: PlaceIn }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [noWebgl, setNoWebgl] = useState(false);
  const [windState, setWindState] = useState<Part>('loading');
  const [radarState, setRadarState] = useState<Part>('loading');
  const [tempState, setTempState] = useState<Part>('loading');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const ac = new AbortController();
    const map = new maplibregl.Map({
      container: host, style: STYLE_URL, center: [place.lon, place.lat], zoom: ZOOM,
      interactive: false, fadeDuration: 0,
      // Source line over the full width like the Brandradar (Jan 07.11., `map/MapSourcesTile.tsx`); it stays open.
      attributionControl: { compact: false, customAttribution: `${MAP_SOURCES_LINK} · Wind, Temperatur: DWD ICON-D2 · Radar: DWD, GeoSphere Austria, MeteoSchweiz · bearbeitet` },
    });
    map.once('idle', () => setMapReady(true));
    // German names and cream labels on an ink halo, exactly as in the Wetterkarte (`?orient=0` = the plain basemap).
    const orient = orientationEnabledFrom();
    map.on('style.load', () => {
      germanBasemapLabels(map);
      if (orient) weatherLabelContrast(map);
    });

    const pin = document.createElement('div');
    pin.className = 'dbd-mm-pin';
    new maplibregl.Marker({ element: pin, anchor: 'center' }).setLngLat([place.lon, place.lat]).addTo(map);

    map.on('load', () => {
      // Radar picture (canvas source, drawn once the frame is there) below the wind particles.
      const canvas = document.createElement('canvas');
      canvas.width = 2; canvas.height = 2;
      const box: DrapeBox = { west: place.lon - BOX_LON, east: place.lon + BOX_LON, south: place.lat - BOX_LAT, north: place.lat + BOX_LAT };
      map.addSource(SRC_RADAR, { type: 'canvas', canvas, animate: false, coordinates: drapeCorners(box) });
      // Like the Wetterkarte: the weather picture goes in right below the first boundary layer, the orientation layers
      // (built-up areas, water, rivers, motorways, place dots) above it, boundaries and labels on top.
      const beforeBoundary = firstBoundaryLayerId(map);
      map.addLayer({ id: SRC_RADAR, type: 'raster', source: SRC_RADAR, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, beforeBoundary);
      if (orient) addOrientationLayers(map, beforeBoundary);

      const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      // EXACTLY the Wetterkarte's wind settings (`weatherWindPreset.ts`, also used by `MapView`): same look, tempo,
      // thinning on zoom-in and density. Only the area clamps differ: no floor (a floor of the full-size map would
      // multiply the density per pixel on this small tile), so the particles per area equal the Wetterkarte at this zoom.
      const wind = new WindLayer({ ...weatherWindOptions(coarse), minParticles: 50, maxParticles: 48000 });
      wind.setDensityMultiplier(WEATHER_WIND_DENSITY);
      map.addLayer(wind);

      // DACH mask: everything outside DE · AT · CH · LI is sand, as in the Wetterkarte. It lies above the whole basemap
      // and the weather picture, below the wind particles.
      void loadDachMask().then((mask) => {
        if (ac.signal.aborted || map.getSource(MASK_SOURCE)) return;
        map.addSource(MASK_SOURCE, { type: 'geojson', data: mask });
        map.addLayer({ id: MASK_LAYER, type: 'fill', source: MASK_SOURCE, paint: { 'fill-color': MASK_SAND, 'fill-opacity': 1 } }, wind.id);
      }).catch(() => { /* without the outline the basemap simply stays as it is */ });

      // Wind: instant picture from the cache, then the fresh "now" frame.
      void (async () => {
        try {
          const cached = await loadWindNowCache();
          if (cached && !ac.signal.aborted) {
            wind.setWindData(cached.image, { width: cached.width, height: cached.height, uMin: cached.uMin, uMax: cached.uMax, vMin: cached.vMin, vMax: cached.vMax, uvBounds: cached.uvBounds });
            setWindState('ok');
          }
          const wd = await fetchIconD2Wind(ac.signal, undefined, undefined, { nowOnly: true, aheadHours: 0 });
          if (ac.signal.aborted) return;
          const f = windFrameAtValidTime(wd, Date.now());
          wind.setWindData(f.image, { width: f.width, height: f.height, uMin: f.uMin, uMax: f.uMax, vMin: f.vMin, vMax: f.vMax, uvBounds: wd.uvBounds });
          setWindState('ok');
        } catch {
          if (!ac.signal.aborted) setWindState((s) => (s === 'ok' ? s : 'na'));
        }
      })();

      // Temperature values: instant from the Wetterkarte's cache (named cities only), then the fresh t_2m grid. The map
      // does not move by hand, but `moveend` also follows a resize of the tile.
      void (async () => {
        const markers = new Map<string, maplibregl.Marker>();
        let getTemp: ((c: City) => number | null) | null = null;
        const repaint = () => { if (getTemp && !ac.signal.aborted) paintTempLabels(map, markers, getTemp); };
        map.on('moveend', repaint);
        const cached = loadTempLabelCache();
        if (cached) {
          getTemp = (c) => cached[c.name] ?? null;
          repaint();
          setTempState('ok');
        }
        try {
          const td = await fetchIconD2Temp(ac.signal, undefined, { nowOnly: true, aheadHours: 0 });
          if (ac.signal.aborted) return;
          const f = frameAtValidTime(td.frames, Date.now());
          const sampler = new TemperatureSampler({
            tempImage: f.image, tempUvBounds: td.uvBounds, vMin: td.vMin, vMax: td.vMax,
            demImage: td.demImage, demUvBounds: td.uvBounds, demMax: 4500, lapseRatePerM: 0.0065,
          });
          const full: Record<string, number> = {};
          for (const c of DACH_CITIES) { const t = sampler.sample(c.lng, c.lat); if (t != null && Number.isFinite(t)) full[c.name] = t; }
          // Same guard as the Wetterkarte: a degraded grid neither replaces the cache nor the values shown.
          if (Object.keys(full).length < 8) { setTempState((s) => (s === 'ok' ? s : 'na')); return; }
          saveTempLabelCache(full);
          getTemp = (c) => sampler.sample(c.lng, c.lat);
          repaint();
          setTempState('ok');
        } catch {
          if (!ac.signal.aborted) setTempState((s) => (s === 'ok' ? s : 'na'));
        }
      })();

      // Radar: latest picture of the country, drawn in time slices.
      void (async () => {
        const pick = await loadRadarPick(place.country, ac.signal);
        if (ac.signal.aborted) return;
        if (!pick) { setRadarState('na'); return; }
        const ratio = ((mercY(box.north) - mercY(box.south)) * 180 / Math.PI) / (box.east - box.west);
        const w = PICTURE_PX, h = Math.max(32, Math.round(PICTURE_PX * ratio));
        const rgba = await drapeImageSliced(pick, box, w, h, () => ac.signal.aborted);
        if (!rgba || ac.signal.aborted) return;
        const src = map.getSource(SRC_RADAR) as maplibregl.CanvasSource | undefined;
        if (!src) return;
        const cv = src.getCanvas();
        cv.width = w; cv.height = h;
        cv.getContext('2d')?.putImageData(new ImageData(rgba, w, h), 0, 0);
        src.setCoordinates(drapeCorners(box));
        src.play(); src.pause();                // uploads the texture once
        map.setLayoutProperty(SRC_RADAR, 'visibility', 'visible');
        map.triggerRepaint();
        setRadarState('ok');
      })();
    });

    return () => { ac.abort(); map.remove(); };
    // One map per place; the caller re-mounts on a place change (key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only an unavailable source is announced; the routine "Wind ICON-D2 · 10 m · Radar jetzt" line is gone.
  const cap = [
    windState === 'na' ? 'Wind: nicht verfügbar' : '',
    radarState === 'na' ? 'Radar: nicht verfügbar' : '',
    tempState === 'na' ? 'Temperatur: nicht verfügbar' : '',
  ].filter(Boolean).join(' · ');
  const c = place.country;
  const sources: MapSourceGroup[] = [
    { title: 'Basiskarte', items: [BASEMAP_SOURCE] },
    {
      title: 'Ebenen',
      items: [
        { name: 'Deutscher Wetterdienst · ICON-D2', url: DWD_OPEN_DATA_URL, what: 'Wind in 10 m und Temperatur in 2 m (Modellfeld)', licence: 'CC BY 4.0', licenceUrl: CC_BY_URL, changed: 'eigene Farbskala', on: windState === 'ok' || tempState === 'ok' },
        { name: 'Deutscher Wetterdienst · Radar (RADOLAN-RV)', url: DWD_OPEN_DATA_URL, what: 'Niederschlag jetzt in Deutschland', licence: 'CC BY 4.0', licenceUrl: CC_BY_URL, on: c === 'DE' && radarState === 'ok' },
        { name: 'GeoSphere Austria · INCA', url: 'https://data.hub.geosphere.at', what: 'Niederschlag jetzt in Österreich', credit: GEOSPHERE_CREDIT, licence: 'CC BY 4.0', licenceUrl: CC_BY_URL, on: c === 'AT' && radarState === 'ok' },
        { name: 'MeteoSchweiz · Radar (RZC)', url: 'https://www.meteoschweiz.admin.ch/', what: 'Niederschlag jetzt in der Schweiz', licence: 'CC BY 4.0', licenceUrl: CC_BY_URL, on: c === 'CH' && radarState === 'ok' },
      ],
    },
  ];
  return (
    <div className="dbd-mm-inner msl-host">
      <div ref={hostRef} className="dbd-mm-map" role="img" aria-label={`Kartenausschnitt um ${place.name} mit Wind, Niederschlag und Temperatur`} />
      {!noWebgl && <MapSourcesTile title="Quellen des Kartenausschnitts" groups={sources} ready={mapReady} />}
      {noWebgl ? <div className="dbd-mm-cap">Karte braucht WebGL — dieses Gerät bietet es nicht.</div> : cap ? <div className="dbd-mm-cap">{cap}</div> : null}
    </div>
  );
}
