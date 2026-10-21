/**
 * 3D-Bühne des Terrain-Felds — Lazy-Chunk. Nach dem Vorbild der Bühne im Regenradar (`nowcast/cellTowers/TowerStage.tsx`):
 * eigene MapLibre-Karte mit Terrarium-Gelände (gleiche Überhöhung `TOWER_EXAGGERATION`), sandfarbener Schummerung, Himmel,
 * Basiskarte positron und der Schneefallgrenze als Fläche auf dem Relief (`useSnowCap`, Phase SK; `?sk=0` schaltet sie ab).
 * Dazu, was das Dashboard am Ort zeigt: der Ort, die Schnittlinie in Windrichtung (± halbe Länge) und die Stationen des Katalogs.
 * Nur eingebaute 3D-Mittel von MapLibre — keine Shader, kein Custom-Layer.
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TOWER_EXAGGERATION } from '../nowcast/cellTowers/towerModel';
import { useSnowCap } from '../snowCap/useSnowCap';
import { SK_PALETTE_3D, snowCapEnabledFrom } from '../snowCap/snowCapModel';
import { SnowCapLegend } from '../snowCap/SnowCapUi';
import type { TerrainVM } from './model/types';

// Gelände wie TowerStage / EventTerrainMap (keine zweite Wahrheit für das Relief).
const DEM_SRC = 'dbd-dem';
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const STAGE_PITCH = 62;
const SRC_AXIS = 'dbd-axis';
const KM_PER_DEG_LAT = 111.32;
/** Zoom je halber Schnittlänge, bei dem der Schnitt ungefähr die Bühne füllt. */
const ZOOM_OF: Record<20 | 50, number> = { 20: 9.8, 50: 8.5 };

const de = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const supportsWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

function offset(lat: number, lon: number, bearingDeg: number, km: number): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  return [lon + (km * Math.sin(b)) / (KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)), lat + (km * Math.cos(b)) / KM_PER_DEG_LAT];
}

function chip(text: string, cls: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `dbd-stage-pin ${cls}`;
  el.textContent = text;
  return el;
}

export default function TerrainStage3D({ vm, nowMs }: { vm: TerrainVM; nowMs: number }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [noWebgl, setNoWebgl] = useState(false);
  const c = vm.center;
  const bearing = (vm.axisDeg + 180) % 360; // Blick in Richtung +s (Lee-Seite), wie der Schnitt von links nach rechts liest
  const live = useRef({ vm, bearing });
  live.current = { vm, bearing };

  // --- Karte, einmal je Ort ----------------------------------------------------------------------------------------
  useEffect(() => {
    if (!boxRef.current || !c) return;
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const m = new maplibregl.Map({
      container: boxRef.current,
      style: STYLE_URL,
      center: [c.lon, c.lat],
      zoom: ZOOM_OF[live.current.vm.halfKm],
      pitch: STAGE_PITCH,
      bearing: live.current.bearing,
      maxPitch: 80,
      fadeDuration: 0,
      ...(coarse ? { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) } : {}),
      attributionControl: { compact: true },
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    m.once('load', () => { m.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]').forEach((d) => d.removeAttribute('open')); });
    m.on('load', () => {
      m.addSource(DEM_SRC, { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      m.setTerrain({ source: DEM_SRC, exaggeration: TOWER_EXAGGERATION });
      const firstSymbol = m.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      m.addLayer({
        id: 'dbd-hillshade', type: 'hillshade', source: DEM_SRC,
        paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#4A4234', 'hillshade-accent-color': '#6B5A45', 'hillshade-illumination-anchor': 'map', 'hillshade-illumination-direction': 335 },
      }, firstSymbol);
      try {
        m.setSky({ 'sky-color': '#DCE3EA', 'horizon-color': '#F3EEE2', 'fog-color': '#F3EEE2', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4 });
      } catch { /* setSky hängt von der Version ab */ }
      m.addSource(SRC_AXIS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'dbd-axis-halo', type: 'line', source: SRC_AXIS, paint: { 'line-color': '#FAF6EA', 'line-width': 5, 'line-opacity': 0.85 } });
      m.addLayer({ id: 'dbd-axis-line', type: 'line', source: SRC_AXIS, paint: { 'line-color': '#2C2A26', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      setMap(m);
    });
    return () => {
      markersRef.current.forEach((k) => k.remove());
      markersRef.current = [];
      setMap(null);
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.lat, c?.lon]);

  // --- Schnittlinie, Ort und Stationen (folgen halber Länge und Achse) --------------------------------------------
  useEffect(() => {
    if (!map || !c) return;
    const R = vm.halfKm;
    const a = offset(c.lat, c.lon, vm.axisDeg, R);                // Luv-Ende (s = −R)
    const b = offset(c.lat, c.lon, vm.axisDeg + 180, R);          // Lee-Ende (s = +R)
    (map.getSource(SRC_AXIS) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a, [c.lon, c.lat], b] } }],
    });
    markersRef.current.forEach((k) => k.remove());
    const ms: maplibregl.Marker[] = [];
    const add = (el: HTMLElement, lngLat: [number, number], anchor: 'center' | 'bottom' = 'center') => ms.push(new maplibregl.Marker({ element: el, anchor }).setLngLat(lngLat).addTo(map));
    add(chip(`${vm.fromLabel} ${R} km`, 'is-end'), a);
    add(chip(`${R} km ${vm.toLabel}`, 'is-end'), b);
    for (const st of vm.stations) add(chip(`${st.label}`, 'is-station'), offset(c.lat, c.lon, st.s < 0 ? vm.axisDeg : vm.axisDeg + 180, Math.abs(st.s)));
    const ort = chip(vm.hOrt != null ? `${vm.ort.title} · ${de(vm.hOrt)} m` : vm.ort.title, 'is-ort');
    add(ort, [c.lon, c.lat], 'bottom');
    markersRef.current = ms;
    map.easeTo({ zoom: ZOOM_OF[R], bearing: (vm.axisDeg + 180) % 360, duration: 500 });
  }, [map, c?.lat, c?.lon, vm.halfKm, vm.axisDeg, vm.stations, vm.ort.title, vm.hOrt, vm.fromLabel, vm.toLabel]);

  // --- Schneefallgrenze als Fläche (Phase SK) ----------------------------------------------------------------------
  const skOn = typeof window !== 'undefined' && snowCapEnabledFrom(window.location.search);
  const skMobile = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;
  const snow = useSnowCap(map, skOn, nowMs, { palette: SK_PALETTE_3D, beforeId: () => undefined, prefix: 'dsk3', mobile: skMobile });

  const reset = () => mapRef.current?.easeTo({ pitch: STAGE_PITCH, bearing, center: c ? [c.lon, c.lat] : undefined, zoom: ZOOM_OF[vm.halfKm], duration: 600 });

  if (!c) return <div className="dbd-empty">Gelände nicht verfügbar — kein Ort gewählt.</div>;
  return (
    <div className="dbd-stage-in">
      <div ref={boxRef} className="dbd-stage-map" />
      {noWebgl && <div className="dbd-stage-note">3D braucht WebGL — dieses Gerät bietet es nicht. Der Geländeschnitt zeigt dieselben Werte.</div>}
      <button type="button" className="dbd-stage-reset" onClick={reset} aria-label="Ansicht zurücksetzen" title="Ansicht zurücksetzen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M4 4v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Ansicht zurücksetzen</span>
      </button>
      <div className="dbd-stage-leg">
        <span className="dbd-stage-leg-i"><i className="dbd-stage-sw-axis" /> Schnitt in Windrichtung ± {vm.halfKm} km</span>
        {skOn && <SnowCapLegend info={snow.info} variant="inline" />}
        <span className="dbd-stage-leg-foot">Gelände {de(TOWER_EXAGGERATION, 1)}-fach überhöht{skOn ? ' · Schneefallgrenze von buscosun Fusion auf dem Relief' : ''}</span>
      </div>
    </div>
  );
}
