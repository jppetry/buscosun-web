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
import { GLOBE_PARTICLE_RAMP } from '../wind/particlePreset';
import { globeStyle, TEMP_BEFORE_ID } from './globeStyle';
import { sampleTempC, type RecoloredTemp } from './tempRecolor';
import { sampleWind, type WindGrid, type WindSample } from './windSample';
import { resolveRun, loadGlobe } from './gfsClient';
import type { GfsRun, GlobeRaw, Height, OverlayKind } from './gfs';

const OV_SRC = 'globe-ov', OV_LAYER = 'globe-ov';
const MERC_LAT = 85.05112878;
const WORLD: [[number, number], [number, number], [number, number], [number, number]] =
  [[-180, MERC_LAT], [180, MERC_LAT], [180, -MERC_LAT], [-180, -MERC_LAT]];

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
    const el = document.createElement('div'); el.className = 'gl-pin';
    pinMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([info.lng, info.lat]).addTo(map);
  };

  const applyRaw = (map: maplibregl.Map, raw: GlobeRaw) => {
    const windCv = rgbaCanvas(raw.windRGBA, raw.w, raw.h);
    tempGridRef.current = { canvas: windCv, tempC: raw.tempC, width: raw.w, height: raw.h };
    windGridRef.current = { u: raw.windU, v: raw.windV, width: raw.w, height: raw.h };
    windRef.current?.setWindData(windCv, raw.windMeta);

    if (raw.overlayRGBA) {
      const url = rgbaCanvas(raw.overlayRGBA, raw.w, raw.h).toDataURL();
      if (!map.getSource(OV_SRC)) {
        map.addSource(OV_SRC, { type: 'image', url, coordinates: WORLD });
        map.addLayer({ id: OV_LAYER, type: 'raster', source: OV_SRC, paint: { 'raster-opacity': 0.82, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, map.getLayer(TEMP_BEFORE_ID) ? TEMP_BEFORE_ID : undefined);
      } else (map.getSource(OV_SRC) as maplibregl.ImageSource).updateImage({ url, coordinates: WORLD });
      map.setLayoutProperty(OV_LAYER, 'visibility', 'visible');
    } else if (map.getLayer(OV_LAYER)) {
      map.setLayoutProperty(OV_LAYER, 'visibility', 'none');
    }
    cbRef.current.onRunInfo?.({ run: raw.run, fhour: raw.fhour, validMs: raw.validMs });
    // Gepinnten Readout mit den frischen Werten (neue Zeit/Höhe) aktualisieren.
    const pll = pinLLRef.current;
    if (pll) cbRef.current.onPin?.({ lat: pll.lat, lng: pll.lng, tempC: sampleTempC(tempGridRef.current!, pll.lng, pll.lat), wind: sampleWind(windGridRef.current!, pll.lng, pll.lat) });
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
      attributionControl: { compact: true }, dragRotate: false,
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
        speedPxPerMs: 6, speedRefZoom: 2,
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
  }, [projection]);
  useEffect(() => { windRef.current?.setShowParticles(showParticles); }, [showParticles]);
  useEffect(() => { windRef.current?.setDensityMultiplier(hd ? 2.2 : 1); }, [hd]);
  // Pin gelöscht (Seite) → Marker entfernen.
  useEffect(() => { const map = mapRef.current; if (map && !props.pinActive) { setPin(map, null); pinLLRef.current = null; } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [props.pinActive]);

  if (noWebgl) {
    return (
      <div className="gl-map gl-map-fallback">
        <p><strong>3D-Globus nicht verfügbar</strong></p>
        <p>Dein Gerät/Browser unterstützt kein WebGL. Der Globus benötigt WebGL.</p>
      </div>
    );
  }
  return <div className="gl-map-shell"><div ref={containerRef} className="gl-map" /></div>;
}

function supportsWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); }
  catch { return false; }
}
