/**
 * 3D-Bühne des Terrain-Felds — Lazy-Chunk. Nach dem Vorbild der Bühne im Regenradar (`nowcast/cellTowers/TowerStage.tsx`):
 * eigene MapLibre-Karte mit Terrarium-Gelände (gleiche Überhöhung `TOWER_EXAGGERATION`), sandfarbener Schummerung, Himmel,
 * Basiskarte positron und der Schneefallgrenze als Fläche auf dem Relief (`useSnowCap`, Phase SK; `?sk=0` schaltet sie ab).
 * Dazu, was das Dashboard am Ort zeigt: der Ort, die Schnittlinie in Windrichtung (± halbe Länge), die Stationen des Katalogs,
 * die Temperaturverteilung auf dem Relief (EIN Gradient aus dem Modellprofil, wie die Isothermen des Schnitts) und die
 * Windrichtung am Ort als Pfeile entlang der Schnittlinie. Nur eingebaute 3D-Mittel von MapLibre — keine Shader, kein Custom-Layer.
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TOWER_EXAGGERATION } from '../nowcast/cellTowers/towerModel';
import { useSnowCap } from '../snowCap/useSnowCap';
import { SK_PALETTE_3D, snowCapEnabledFrom } from '../snowCap/snowCapModel';
import { SnowCapLegend } from '../snowCap/SnowCapUi';
import { compass16 } from './format';
import { tempAt } from './model/rules';
import type { TerrainVM } from './model/types';

// Gelände wie TowerStage / EventTerrainMap (keine zweite Wahrheit für das Relief).
const DEM_SRC = 'dbd-dem';
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const STAGE_PITCH = 62;
const SRC_AXIS = 'dbd-axis';
const SRC_TEMP = 'dbd-temp';
const KM_PER_DEG_LAT = 111.32;
/** Zoom je halber Schnittlänge, bei dem der Schnitt ungefähr die Bühne füllt. */
const ZOOM_OF: Record<20 | 50, number> = { 20: 9.8, 50: 8.5 };
/** Temperaturfläche: Kantenlänge in Pixeln und Stufung in K (Bänder wie Isothermen). */
const TEMP_PX = 320;
const TEMP_STEP_K = 2;
const TRANSPARENT_PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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

function arrow(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dbd-stage-arrow';
  el.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 2 L21 22 L13 17 L5 22 Z" fill="#2C2A26" stroke="#FAF6EA" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  return el;
}

/** Temperaturfarbe (°C): Frostblau → Weißblau um 0 → Grün → Gelb → Amber → Orange → Rot. */
const RAMP: Array<[number, [number, number, number]]> = [
  [-20, [52, 71, 143]], [-10, [58, 111, 168]], [-2, [111, 168, 216]], [0, [185, 213, 234]], [5, [141, 178, 138]],
  [10, [201, 192, 106]], [15, [224, 162, 79]], [20, [212, 116, 60]], [28, [184, 64, 43]],
];
function rampColor(t: number): [number, number, number] {
  if (t <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i], k = (t - t0) / (t1 - t0);
      return [Math.round(c0[0] + (c1[0] - c0[0]) * k), Math.round(c0[1] + (c1[1] - c0[1]) * k), Math.round(c0[2] + (c1[2] - c0[2]) * k)];
    }
  }
  return RAMP[RAMP.length - 1][1];
}
const rampCss = (t: number) => { const c = rampColor(t); return `rgb(${c[0]},${c[1]},${c[2]})`; };

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latOfMercY = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

interface TempImage { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]]; tMin: number; tMax: number }

/** Temperatur je Bildpunkt aus Geländehöhe und EINEM Gradienten (`tempAt`), in 2-K-Bändern, zum Rand hin ausgeblendet. */
async function temperatureImage(c: { lat: number; lon: number }, halfKm: number, th: NonNullable<TerrainVM['thermal']>, signal: AbortSignal): Promise<TempImage | null> {
  const span = Math.max(halfKm * 1.5, 30);
  const [lonW, latN] = offset(c.lat, c.lon, 315, span * Math.SQRT2);
  const [lonE, latS] = offset(c.lat, c.lon, 135, span * Math.SQRT2);
  const { loadElevationLookup } = await import('../fusion/elevation');
  const grid = await loadElevationLookup({ latMin: latS, latMax: latN, lngMin: lonW, lngMax: lonE }, span <= 40 ? 10 : 9, signal);
  if (signal.aborted) return null;
  const canvas = document.createElement('canvas');
  canvas.width = TEMP_PX; canvas.height = TEMP_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(TEMP_PX, TEMP_PX);
  const yN = mercY(latN), yS = mercY(latS);
  let tMin = Infinity, tMax = -Infinity;
  for (let j = 0; j < TEMP_PX; j++) {
    const lat = latOfMercY(yN + ((yS - yN) * (j + 0.5)) / TEMP_PX);
    for (let i = 0; i < TEMP_PX; i++) {
      const lon = lonW + ((lonE - lonW) * (i + 0.5)) / TEMP_PX;
      const h = grid.sample(lon, lat);
      if (!Number.isFinite(h)) continue;
      const t = tempAt(th.tOrt, th.hOrt, th.gamma, Math.max(0, h));
      tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
      const col = rampColor(Math.round(t / TEMP_STEP_K) * TEMP_STEP_K);
      const dx = (i + 0.5) / TEMP_PX * 2 - 1, dy = (j + 0.5) / TEMP_PX * 2 - 1;
      const r = Math.max(Math.abs(dx), Math.abs(dy));
      const fade = r < 0.78 ? 1 : Math.max(0, 1 - (r - 0.78) / 0.22);
      const o = (j * TEMP_PX + i) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = Math.round(255 * fade);
    }
  }
  if (!Number.isFinite(tMin)) return null;
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL('image/png'), coordinates: [[lonW, latN], [lonE, latN], [lonE, latS], [lonW, latS]], tMin, tMax };
}

export default function TerrainStage3D({ vm, nowMs }: { vm: TerrainVM; nowMs: number }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const arrowsRef = useRef<maplibregl.Marker[]>([]);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [noWebgl, setNoWebgl] = useState(false);
  const [showT, setShowT] = useState(true);
  const [showWind, setShowWind] = useState(true);
  const [showSnow, setShowSnow] = useState(true);
  const [tempRange, setTempRange] = useState<{ tMin: number; tMax: number } | null>(null);
  const [tempState, setTempState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
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
      // Temperaturfläche liegt UNTER der Schummerung, damit das Relief lesbar bleibt.
      m.addSource(SRC_TEMP, { type: 'image', url: TRANSPARENT_PX, coordinates: [[c.lon - 0.1, c.lat + 0.1], [c.lon + 0.1, c.lat + 0.1], [c.lon + 0.1, c.lat - 0.1], [c.lon - 0.1, c.lat - 0.1]] });
      m.addLayer({ id: 'dbd-temp-layer', type: 'raster', source: SRC_TEMP, paint: { 'raster-opacity': 0.66, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstSymbol);
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
      arrowsRef.current.forEach((k) => k.remove());
      markersRef.current = []; arrowsRef.current = [];
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

  // --- Windrichtung am Ort: Pfeile entlang der Schnittlinie (zeigen, wohin der Wind weht) -------------------------
  const windDir = vm.wind.dirDeg;
  useEffect(() => {
    arrowsRef.current.forEach((k) => k.remove());
    arrowsRef.current = [];
    if (!map || !c || !showWind || windDir == null) return;
    const to = (windDir + 180) % 360;
    const R = vm.halfKm;
    const out: maplibregl.Marker[] = [];
    for (const f of [-0.8, -0.55, -0.3, 0.3, 0.55, 0.8]) {
      const [lon, lat] = offset(c.lat, c.lon, vm.axisDeg + 180, f * R);
      out.push(new maplibregl.Marker({ element: arrow(), rotation: to, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([lon, lat]).addTo(map));
    }
    arrowsRef.current = out;
    return () => { out.forEach((k) => k.remove()); };
  }, [map, c?.lat, c?.lon, showWind, windDir, vm.halfKm, vm.axisDeg]);

  // --- Temperaturverteilung auf dem Relief ------------------------------------------------------------------------
  const th = vm.thermal;
  useEffect(() => {
    if (!map || !c) return;
    const src = map.getSource(SRC_TEMP) as maplibregl.ImageSource | undefined;
    if (!src) return;
    if (!showT || !th) { map.setLayoutProperty('dbd-temp-layer', 'visibility', 'none'); setTempState('idle'); return; }
    const ac = new AbortController();
    setTempState('loading');
    temperatureImage(c, vm.halfKm, th, ac.signal).then((r) => {
      if (ac.signal.aborted || !r) { if (!ac.signal.aborted) setTempState('error'); return; }
      src.updateImage({ url: r.url, coordinates: r.coordinates });
      map.setLayoutProperty('dbd-temp-layer', 'visibility', 'visible');
      setTempRange({ tMin: r.tMin, tMax: r.tMax });
      setTempState('ok');
    }).catch((e) => { if ((e as { name?: string })?.name !== 'AbortError') setTempState('error'); });
    return () => ac.abort();
  }, [map, c?.lat, c?.lon, vm.halfKm, showT, th?.tOrt, th?.hOrt, th?.gamma]);

  // --- Schneefallgrenze als Fläche (Phase SK) ----------------------------------------------------------------------
  const skOn = typeof window !== 'undefined' && snowCapEnabledFrom(window.location.search);
  const skMobile = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;
  const snow = useSnowCap(map, skOn && showSnow, nowMs, { palette: SK_PALETTE_3D, beforeId: () => undefined, prefix: 'dsk3', mobile: skMobile });

  const reset = () => mapRef.current?.easeTo({ pitch: STAGE_PITCH, bearing, center: c ? [c.lon, c.lat] : undefined, zoom: ZOOM_OF[vm.halfKm], duration: 600 });

  if (!c) return <div className="dbd-empty">Gelände nicht verfügbar — kein Ort gewählt.</div>;
  const gradCss = tempRange
    ? `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => rampCss(tempRange.tMin + ((tempRange.tMax - tempRange.tMin) * i) / 8)).join(',')})`
    : undefined;
  return (
    <div className="dbd-stage-in">
      <div ref={boxRef} className="dbd-stage-map" />
      {noWebgl && <div className="dbd-stage-note">3D braucht WebGL — dieses Gerät bietet es nicht. Der Geländeschnitt zeigt dieselben Werte.</div>}
      <div className="dbd-stage-top">
        <button type="button" className="dbd-stage-reset" onClick={reset} aria-label="Ansicht zurücksetzen" title="Ansicht zurücksetzen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M4 4v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Zurücksetzen</span>
        </button>
        <div className="dbd-stage-layers" role="group" aria-label="Ebenen der Bühne">
          <button type="button" className={showT ? 'is-on' : undefined} aria-pressed={showT} disabled={!th} onClick={() => setShowT((v) => !v)} title={th ? undefined : 'Temperaturfläche braucht den Gradienten aus dem Modellprofil (bei Inversion nicht möglich)'}>Temperatur</button>
          <button type="button" className={showWind ? 'is-on' : undefined} aria-pressed={showWind} disabled={windDir == null} onClick={() => setShowWind((v) => !v)} title={windDir == null ? 'Windrichtung am Ort unbestimmt' : undefined}>Wind</button>
          {skOn && <button type="button" className={showSnow ? 'is-on' : undefined} aria-pressed={showSnow} onClick={() => setShowSnow((v) => !v)}>Schneegrenze</button>}
        </div>
      </div>
      <div className="dbd-stage-leg">
        <span className="dbd-stage-leg-i"><i className="dbd-stage-sw-axis" /> Schnitt in Windrichtung ± {vm.halfKm} km</span>
        {showWind && windDir != null && (
          <span className="dbd-stage-leg-i"><svg width="12" height="12" viewBox="0 0 26 26" aria-hidden="true" style={{ transform: `rotate(${(windDir + 180) % 360}deg)` }}><path d="M13 2 L21 22 L13 17 L5 22 Z" fill="#2C2A26" /></svg> Wind am Ort aus {compass16(windDir)} ({Math.round(windDir)}°){vm.wind.ms != null ? `, ${de(vm.wind.ms, 1)} m/s` : ''} — Pfeile zeigen die Richtung, kein Höhenwind</span>
        )}
        {showT && th && tempRange && tempState !== 'error' && (
          <span className="dbd-stage-leg-i dbd-stage-leg-t">
            <span className="dbd-stage-grad" style={{ background: gradCss }} aria-hidden="true" />
            {de(tempRange.tMin, 0)} … {de(tempRange.tMax, 0)} °C · Temperatur nach Höhe, γ {de(th.gamma, 1)} K/km
          </span>
        )}
        {showT && !th && <span className="dbd-stage-leg-i">Temperaturfläche entfällt: kein einzelner Gradient trägt (Inversion oder kein Modellprofil)</span>}
        {showT && th && tempState === 'loading' && <span className="dbd-stage-leg-i">Temperaturfläche lädt …</span>}
        {showT && th && tempState === 'error' && <span className="dbd-stage-leg-i">Temperaturfläche nicht verfügbar (Geländekacheln)</span>}
        {skOn && showSnow && <SnowCapLegend info={snow.info} variant="inline" />}
        <span className="dbd-stage-leg-foot">Gelände {de(TOWER_EXAGGERATION, 1)}-fach überhöht · Temperatur in 2-K-Bändern aus Geländehöhe und einem Gradienten (kein Wetterfeld){skOn && showSnow ? ' · Schneefallgrenze von buscosun Fusion auf dem Relief' : ''}</span>
      </div>
    </div>
  );
}
