/**
 * Kleiner Kartenausschnitt neben der Jetzt-Kachel (Desktop): der gewählte Ort mit Windpartikeln und dem aktuellen Radarbild.
 * Lazy-Chunk, wird erst gemountet, wenn die Fusion da ist (E-DB-20: das Netz gehört zuerst dem Kern).
 *
 * Nur bestehende Bausteine, nichts Neues an Shader oder Quellen:
 *  - Wind: `WindLayer` (Wetterkarte, gleiche Optik) mit dem ICON-D2-10-m-Gitter (`fetchIconD2Wind`, Jetzt-Fenster, Sofort-Bild
 *    aus dem Cache). Das ist das Modellfeld, nicht der Fusion-Wert der Kachel — die Beschriftung sagt es.
 *  - Niederschlag: jüngstes Radarbild des Landes des Orts (DE RV-Analyse, AT INCA-Anfangsbild, CH RZC), per CPU auf ein
 *    `canvas`-Bild gelegt wie auf der 3D-Bühne (`radarDrape.ts`). Ohne Radar für den Ort steht „Radar: nicht verfügbar".
 * Die Karte ist nicht bedienbar (kein Scroll-Fang auf der Seite); die Namensnennung der Basiskarte bleibt sichtbar.
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WindLayer } from '../wind/WindLayer';
import { GLOBE_PARTICLE_RAMP as PARTICLE_RAMP } from '../wind/particlePreset';
import { fetchIconD2Wind, loadWindNowCache, windFrameAtValidTime } from '../wind/iconD2WindSource';
import { fetchRvLatestAnalysis } from '../sources/radolan';
import { fetchRzcLatest } from '../sources/meteoSwissRadar';
import { fetchIncaGrid } from '../sources/geosphereIncaGrid';
import { drapeCorners, drapeImageSliced, type DrapeBox, type TowerRadarPick } from '../nowcast/cellTowers/radarDrape';
import type { PlaceIn } from './model/types';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const SRC_RADAR = 'dbd-mm-radar';
const ZOOM = 8.2;
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

export default function MiniMap({ place }: { place: PlaceIn }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [noWebgl, setNoWebgl] = useState(false);
  const [windState, setWindState] = useState<Part>('loading');
  const [radarState, setRadarState] = useState<Part>('loading');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const ac = new AbortController();
    const map = new maplibregl.Map({
      container: host, style: STYLE_URL, center: [place.lon, place.lat], zoom: ZOOM,
      interactive: false, fadeDuration: 0, attributionControl: { compact: true },
    });
    map.once('load', () => {
      map.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]').forEach((d) => d.removeAttribute('open'));
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
      map.addLayer({ id: SRC_RADAR, type: 'raster', source: SRC_RADAR, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });

      const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      const wind = new WindLayer({
        windPngUrl: '', windJsonUrl: '',
        baseDensity: 18000, minParticles: 800, maxParticles: 9000, subSteps: 3,
        particleColor: [0.86, 0.92, 1.0, 0.84], speedTint: 0.62, particleColorRamp: PARTICLE_RAMP,
        speedPxPerMs: 4.2, speedRefZoom: 5.5, screenTempoZoomExp: 0.35,
        upsample: coarse ? 1 : 2, maxParticleFps: coarse ? 30 : 0,
      });
      map.addLayer(wind);

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

  const cap = [
    windState === 'na' ? 'Wind: nicht verfügbar' : 'Wind ICON-D2 · 10 m',
    radarState === 'na' ? 'Radar: nicht verfügbar' : radarState === 'loading' ? 'Radar lädt …' : 'Radar jetzt',
  ].join(' · ');
  return (
    <div className="dbd-mm-inner">
      <div ref={hostRef} className="dbd-mm-map" role="img" aria-label={`Kartenausschnitt um ${place.name} mit Wind und Niederschlag`} />
      {noWebgl ? <div className="dbd-mm-cap">Karte braucht WebGL — dieses Gerät bietet es nicht.</div> : <div className="dbd-mm-cap">{cap}</div>}
    </div>
  );
}
