/**
 * 3D-Globus · Erdkugel mit LIVE-GFS-Daten (NOAA, Public Domain), via Worker.
 *
 * Fetch + GRIB-Decode + Resampling laufen im `gfsWorker` (Client `gfsClient`),
 * der rohe Buffer zurücktransferiert — der Main-Thread wrappt sie nur in Canvases.
 *  • Overlay (eine Raster-Ebene): Temperatur · Windgeschwindigkeit · Feuchte · Druck.
 *  • Höhe: Boden · 850 · 500 · 250 hPa (Wind-Partikel + Overlay am Level).
 *  • Vorlaufstunden-Navigation (`fhour`).
 *
 * Klick-Pin (Marker + Detail-Readout) + transientes Hover-Readout. Veraltete
 * Worker-Resultate werden per Sequenz-Token ignoriert.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WindLayer } from '../wind/WindLayer';
import { MAP_SOURCES_LINK } from '../map/MapSourcesTile';
import { GLOBE_PARTICLE_RAMP } from '../wind/particlePreset';
import { globeStyle, TEMP_BEFORE_ID } from './globeStyle';
import { sampleTempC, type RecoloredTemp } from './tempRecolor';
import { sampleWind, type WindGrid, type WindSample } from './windSample';
import { resolveRun, loadGlobe } from './gfsClient';
import { CAP_H, CAP_LAT_MAX, CAP_W, OVERLAY_MERC_LAT, capFarLat, type GfsRun, type GlobeRaw, type Height, type OverlayKind } from './gfs';

const OV_SRC = 'globe-ov', OV_LAYER = 'globe-ov';
const CAP_N = 'globe-cap-n', CAP_S = 'globe-cap-s';
const MERC_LAT = OVERLAY_MERC_LAT;
type Quad = [[number, number], [number, number], [number, number], [number, number]];
const WORLD: Quad = [[-180, MERC_LAT], [180, MERC_LAT], [180, -MERC_LAT], [-180, -MERC_LAT]];
// Pole caps (globe only): from the Mercator limit to 89,9° — Mercator y runs on beyond the limit, so the same kind of
// picture (rows linear in Mercator y) lies correctly there too. Real GFS values, no fill colour.
// Each cap picture spans to the opposite limit (transparent inside the limit) so that its centre lies inside the world.
const CAP_N_QUAD: Quad = [[-180, CAP_LAT_MAX], [180, CAP_LAT_MAX], [180, capFarLat()], [-180, capFarLat()]];
const CAP_S_QUAD: Quad = [[-180, -capFarLat()], [180, -capFarLat()], [180, -CAP_LAT_MAX], [-180, -CAP_LAT_MAX]];
// Opaque: the 0,82 blend over the sphere's base colour is already in the pixels (`gfs.ts` OVERLAY_OPACITY).
const OV_PAINT = { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } as const;
// Caps: nearest, so the transparent part ends exactly at the limit (linear would fade the edge row into a thin ring).
const CAP_PAINT = { ...OV_PAINT, 'raster-resampling': 'nearest' } as const;

/**
 * Particle look per overlay, so the flow reads on every layer without hiding the data: on the dark sphere the speed tint
 * as before; on the wind overlay white (the colour already says the speed); on the light overlays (temperature, pressure)
 * dark ink; on humidity white.
 */
const PARTICLE_LOOK: Record<OverlayKind, { color: [number, number, number, number]; tint: number; size: number }> = {
  none: { color: [0.86, 0.92, 1.0, 0.84], tint: 0.62, size: 1.7 },
  wind: { color: [1, 1, 1, 0.95], tint: 0, size: 1.8 },
  temp: { color: [0.07, 0.08, 0.12, 0.9], tint: 0, size: 1.9 },
  rh: { color: [1, 1, 1, 0.95], tint: 0, size: 1.8 },
  mslp: { color: [0.07, 0.08, 0.12, 0.9], tint: 0, size: 1.9 },
};

// WG-1: EINE Definition, geteilt mit der Wetterkarte (Werte unveraendert).
const PARTICLE_RAMP = GLOBE_PARTICLE_RAMP;

export type Projection = 'globe' | 'flat';
export interface PickInfo { lat: number; lng: number; tempC: number | null; wind: WindSample | null; }
export interface RunInfo { run: GfsRun; fhour: number; validMs: number; }

interface Props {
  overlay: OverlayKind;
  height: Height;
  projection: Projection;
  showParticles: boolean;
  hd: boolean;
  spinning: boolean;
  fhour: number;
  pinActive: boolean;
  initialView?: { center: [number, number]; zoom: number };
  initialPin?: { lat: number; lng: number };
  onHover?: (p: PickInfo | null) => void;
  onPin?: (p: PickInfo | null) => void;
  onRunInfo?: (r: RunInfo | null) => void;
  onLoading?: (loading: boolean) => void;
  onError?: (msg: string | null) => void;
  onView?: (v: { center: [number, number]; zoom: number }) => void;
}

function rgbaCanvas(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d')!.putImageData(new ImageData(rgba, w, h), 0, 0);
  return cv;
}

/** One canvas source + raster layer, created on first use; later calls repaint the canvas and re-upload it once
 *  (no PNG encode/decode on the main thread, as `toDataURL` + image source did). */
function paintCanvasLayer(map: maplibregl.Map, id: string, quad: Quad, rgba: Uint8ClampedArray, w: number, h: number, canvases: Map<string, HTMLCanvasElement>, before: string | undefined, paint: typeof OV_PAINT | typeof CAP_PAINT = OV_PAINT) {
  let cv = canvases.get(id);
  if (!cv) { cv = document.createElement('canvas'); cv.width = w; cv.height = h; canvases.set(id, cv); }
  cv.getContext('2d')!.putImageData(new ImageData(rgba, w, h), 0, 0);
  if (!map.getSource(id)) {
    map.addSource(id, { type: 'canvas', canvas: cv, coordinates: quad, animate: false });
    map.addLayer({ id, type: 'raster', source: id, paint }, before);
  } else {
    const src = map.getSource(id) as maplibregl.CanvasSource;
    src.play(); src.pause();   // `pause` uploads the canvas once
    map.triggerRepaint();
  }
}

export default function GlobeMap(props: Props) {
  const { overlay, height, projection, showParticles, hd, spinning, fhour } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const windRef = useRef<WindLayer | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const rafRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const spinningRef = useRef(spinning);
  const tempGridRef = useRef<RecoloredTemp | null>(null);
  const windGridRef = useRef<WindGrid | null>(null);
  const runRef = useRef<GfsRun | null>(null);
  const cbRef = useRef(props);
  const loadSeqRef = useRef(0);
  const pinLLRef = useRef<{ lat: number; lng: number } | null>(null);
  const canvasesRef = useRef(new Map<string, HTMLCanvasElement>());
  const overlayOnRef = useRef(false);
  const [noWebgl, setNoWebgl] = useState(false);
  spinningRef.current = spinning;
  cbRef.current = props;

  const pickAt = (map: maplibregl.Map, point: maplibregl.Point): PickInfo | null => {
    const ll = map.unproject(point);
    const back = map.project(ll);
    if (!Number.isFinite(ll.lat) || Math.hypot(back.x - point.x, back.y - point.y) > 6) return null;
    const t = tempGridRef.current ? sampleTempC(tempGridRef.current, ll.lng, ll.lat) : null;
    const w = windGridRef.current ? sampleWind(windGridRef.current, ll.lng, ll.lat) : null;
    return { lat: ll.lat, lng: ll.lng, tempC: t, wind: w };
  };

  const setPin = (map: maplibregl.Map, info: PickInfo | null) => {
    pinMarkerRef.current?.remove(); pinMarkerRef.current = null;
    if (!info) return;
    const el = document.createElement('div'); el.className = 'glb-pin';
    pinMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([info.lng, info.lat]).addTo(map);
  };

  const applyRaw = (map: maplibregl.Map, raw: GlobeRaw) => {
    const windCv = rgbaCanvas(raw.windRGBA, raw.w, raw.h);
    tempGridRef.current = { canvas: windCv, tempC: raw.tempC, width: raw.w, height: raw.h };
    windGridRef.current = { u: raw.windU, v: raw.windV, width: raw.w, height: raw.h };
    windRef.current?.setWindData(windCv, raw.windMeta);

    const before = map.getLayer(TEMP_BEFORE_ID) ? TEMP_BEFORE_ID : undefined;
    if (raw.overlayRGBA) {
      // caps first (below), then the overlay on top of their overlap rows
      if (raw.capN && raw.capS) {
        paintCanvasLayer(map, CAP_N, CAP_N_QUAD, raw.capN, CAP_W, CAP_H, canvasesRef.current, map.getLayer(OV_LAYER) ? OV_LAYER : before, CAP_PAINT);
        paintCanvasLayer(map, CAP_S, CAP_S_QUAD, raw.capS, CAP_W, CAP_H, canvasesRef.current, map.getLayer(OV_LAYER) ? OV_LAYER : before, CAP_PAINT);
      }
      paintCanvasLayer(map, OV_SRC, WORLD, raw.overlayRGBA, raw.ovW, raw.ovH, canvasesRef.current, before);
    }
    overlayOnRef.current = !!raw.overlayRGBA;
    syncOverlayVisibility(map);
    applyParticleLook(raw.overlay);
    cbRef.current.onRunInfo?.({ run: raw.run, fhour: raw.fhour, validMs: raw.validMs });
    // Gepinnten Readout mit den frischen Werten (neue Zeit/Höhe) aktualisieren.
    const pll = pinLLRef.current;
    if (pll) cbRef.current.onPin?.({ lat: pll.lat, lng: pll.lng, tempC: sampleTempC(tempGridRef.current!, pll.lng, pll.lat), wind: sampleWind(windGridRef.current!, pll.lng, pll.lat) });
  };

  /** Overlay on/off; the pole caps only on the globe (in the flat view they would lie outside the world square). */
  const syncOverlayVisibility = (map: maplibregl.Map) => {
    const on = overlayOnRef.current;
    if (map.getLayer(OV_LAYER)) map.setLayoutProperty(OV_LAYER, 'visibility', on ? 'visible' : 'none');
    const caps = on && cbRef.current.projection === 'globe';
    for (const id of [CAP_N, CAP_S]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', caps ? 'visible' : 'none');
  };
  const applyParticleLook = (ov: OverlayKind) => {
    const w = windRef.current; if (!w) return;
    const look = PARTICLE_LOOK[ov];
    w.particleColor = look.color; w.speedTint = look.tint; w.setPointSize(look.size);
  };

  const loadData = (map: maplibregl.Map, run: GfsRun) => {
    const seq = ++loadSeqRef.current;
    cbRef.current.onLoading?.(true);
    cbRef.current.onError?.(null);
    loadGlobe(run, cbRef.current.fhour, { height: cbRef.current.height, overlay: cbRef.current.overlay })
      .then((raw) => {
        if (seq !== loadSeqRef.current || !mapRef.current) return;  // veraltet → verwerfen
        applyRaw(map, raw);
        cbRef.current.onLoading?.(false);
      })
      .catch((e) => {
        if (seq !== loadSeqRef.current) return;
        cbRef.current.onError?.(e instanceof Error ? e.message : 'GFS-Daten nicht erreichbar');
        cbRef.current.onLoading?.(false);
      });
  };

  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGL()) { setNoWebgl(true); cbRef.current.onLoading?.(false); return; }
    const iv = cbRef.current.initialView;
    const map = new maplibregl.Map({
      container: containerRef.current, style: globeStyle(),
      center: iv?.center ?? [10, 12], zoom: iv?.zoom ?? 2.2, minZoom: 1.1, maxZoom: 6,
      // Eigener Natural-Earth-Style (Public Domain) — die Attribution nennt
      // deshalb v. a. die Wetterquelle (NOAA GFS) und ist unkritisch, wird aber
      // konsistent zu allen anderen Karten eingeblendet (V-105).
      // Source line over the full width like the Brandradar (Jan 07.11., `map/MapSourcesTile.tsx`).
      attributionControl: { compact: false, customAttribution: `${MAP_SOURCES_LINK} · Wetterdaten: NOAA GFS (Public Domain) · Umrisse: Natural Earth (Public Domain) · bearbeitet` }, dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('moveend', () => { const c = map.getCenter(); cbRef.current.onView?.({ center: [+c.lng.toFixed(2), +c.lat.toFixed(2)], zoom: +map.getZoom().toFixed(2) }); });

    map.on('load', () => {
      map.setProjection({ type: projection === 'globe' ? 'globe' : 'mercator' });
      try { map.setSky({ 'atmosphere-blend': 0 }); } catch { /* version */ }

      const wind = new WindLayer({
        baseDensity: 18000, minParticles: 7000, maxParticles: 48000,
        showHeatmap: false, fadeOpacity: 0.97, subSteps: 3, pointSize: 1.7,
        // Tempo wie in der 2D-Karte strikt linear zum GRIB-Wert (px/s = 6 · |V|),
        // aber auf die Globus-Ansicht kalibriert: dort ist die ganze Erde im Bild,
        // der passende Bezugsmaßstab ist deshalb Zoom 2 statt 5,5. Das ergibt
        // ~11× größere Bodenschritte als in der Detailkarte und trifft damit das
        // bisherige Globus-Tempo (früher: speedFactor 0.24 gegen 0.038).
        // `setGlobeMode` sorgt dafür, dass speedRefZoom auch wirklich der
        // Bezugszoom ist (getZoom() ist auf dem Globus kein Mercator-Zoom).
        // Jan 11.11.: a quarter slower (4,5 instead of 6) — still strictly linear in the GRIB wind speed.
        speedPxPerMs: 4.5, speedRefZoom: 2,
        particleColor: [0.86, 0.92, 1.0, 0.84], speedTint: 0.62, colorRamp: PARTICLE_RAMP,
        windPngUrl: '', windJsonUrl: '',
      });
      wind.setGlobeMode(projection === 'globe');
      windRef.current = wind;
      map.addLayer(wind);
      wind.setShowParticles(showParticles);
      wind.setDensityMultiplier(hd ? 2.2 : 1);

      if (cbRef.current.initialPin) { pinLLRef.current = cbRef.current.initialPin; setPin(map, { ...cbRef.current.initialPin, tempC: null, wind: null }); }

      resolveRun().then((run) => { runRef.current = run; loadData(map, run); })
        .catch((e) => { cbRef.current.onError?.(e instanceof Error ? e.message : 'GFS-Lauf nicht gefunden'); cbRef.current.onLoading?.(false); });
    });

    const onMove = (e: maplibregl.MapMouseEvent) => { cbRef.current.onHover?.(pickAt(map, e.point)); };
    const onOut = () => cbRef.current.onHover?.(null);
    const onClick = (e: maplibregl.MapMouseEvent) => { const info = pickAt(map, e.point); pinLLRef.current = info ? { lat: info.lat, lng: info.lng } : null; cbRef.current.onPin?.(info); setPin(map, info); };
    map.on('mousemove', onMove); map.on('mouseout', onOut); map.on('click', onClick);

    const hold = () => { interactingRef.current = true; };
    const release = () => { interactingRef.current = false; };
    map.on('mousedown', hold); map.on('touchstart', hold); map.on('dragstart', hold);
    map.on('mouseup', release); map.on('touchend', release); map.on('dragend', release);
    let wheelT: number | null = null;
    const onWheel = () => { interactingRef.current = true; if (wheelT) window.clearTimeout(wheelT); wheelT = window.setTimeout(release, 900); };
    map.on('wheel', onWheel);

    const spin = () => {
      const m = mapRef.current;
      if (m && spinningRef.current && !interactingRef.current) { const c = m.getCenter(); m.setCenter([c.lng + 0.08, c.lat]); }
      rafRef.current = requestAnimationFrame(spin);
    };
    rafRef.current = requestAnimationFrame(spin);

    return () => {
      loadSeqRef.current++;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (wheelT) window.clearTimeout(wheelT);
      pinMarkerRef.current?.remove(); pinMarkerRef.current = null;
      windRef.current = null;
      map.remove(); mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Datenrelevante Auswahl (Vorlauf · Overlay · Höhe) → neu laden.
  const selInitRef = useRef(true);
  useEffect(() => {
    if (selInitRef.current) { selInitRef.current = false; return; }
    const map = mapRef.current, run = runRef.current;
    if (map && run) loadData(map, run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fhour, overlay, height]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    try { map.setProjection({ type: projection === 'globe' ? 'globe' : 'mercator' }); } catch { /* version */ }
    windRef.current?.setGlobeMode(projection === 'globe');
    syncOverlayVisibility(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection]);
  useEffect(() => { windRef.current?.setShowParticles(showParticles); }, [showParticles]);
  useEffect(() => { windRef.current?.setDensityMultiplier(hd ? 2.2 : 1); }, [hd]);
  // Pin gelöscht (Seite) → Marker entfernen.
  useEffect(() => { const map = mapRef.current; if (map && !props.pinActive) { setPin(map, null); pinLLRef.current = null; } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [props.pinActive]);

  if (noWebgl) {
    return (
      <div className="glb-map glb-map-fallback">
        <p><strong>3D-Globus nicht verfügbar</strong></p>
        <p>Dein Gerät/Browser unterstützt kein WebGL. Der Globus benötigt WebGL.</p>
      </div>
    );
  }
  return <div className="glb-map-shell"><div ref={containerRef} className="glb-map" /></div>;
}

function supportsWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); }
  catch { return false; }
}
