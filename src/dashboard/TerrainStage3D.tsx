/**
 * 3D-Bühne des Terrain-Felds — Lazy-Chunk. Nach dem Vorbild der Bühne im Regenradar (`nowcast/cellTowers/TowerStage.tsx`):
 * eigene MapLibre-Karte mit Terrarium-Gelände (gleiche Überhöhung `TOWER_EXAGGERATION`), sandfarbener Schummerung, Himmel,
 * Basiskarte positron und der Schneefallgrenze als Fläche auf dem Relief (`useSnowCap`, Phase SK; `?sk=0` schaltet sie ab).
 * Dazu, was das Dashboard am Ort zeigt: der Ort, die Schnittlinie in Windrichtung (± halbe Länge), die Stationen des Katalogs,
 * die Temperaturverteilung auf dem Relief (EIN Gradient aus dem Modellprofil, wie die Isothermen des Schnitts) und die
 * ein Windfeld aus Pfeilen über dem Gelände (gemessener Wind der Stationen, abstandsgewichtet). Nur eingebaute 3D-Mittel von
 * MapLibre — keine Shader, kein Custom-Layer.
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
const ZOOM_OF: Record<20 | 50, number> = { 20: 9.3, 50: 8.2 };
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

/**
 * Messstation als Karte: farbige Temperaturpille (Farbe der Temperaturskala, dieselbe wie die Fläche) und daneben Name und
 * Höhe; ein Stiel führt zum genauen Punkt. `below` = Karte hängt unter dem Punkt (Station direkt am Ort).
 */
function obsPin(t: number, name: string, elev: number, stampMs: number, below: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = `dbd-stage-pin is-obs${below ? ' is-below' : ''}`;
  const col = rampColor(t);
  el.style.setProperty('--c', `rgb(${col[0]},${col[1]},${col[2]})`);
  el.style.setProperty('--ink', col[0] * 0.299 + col[1] * 0.587 + col[2] * 0.114 > 150 ? '#2C2A26' : '#FFFFFF');
  const pill = document.createElement('b');
  pill.textContent = `${t.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
  const txt = document.createElement('span');
  const n = document.createElement('em');
  n.textContent = name.length > 17 ? `${name.slice(0, 16)}…` : name;
  const h = document.createElement('small');
  h.textContent = `${Math.round(elev).toLocaleString('de-DE')} m`;
  txt.append(n, h);
  el.append(pill, txt);
  el.title = `${name} · ${Math.round(elev)} m · gemessen ${new Date(stampMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
  return el;
}

/** Windfarbe (m/s): hell → Stahlblau → dunkel → Violett (wie die Windklassen der Karte). */
const WIND_RAMP: Array<[number, [number, number, number]]> = [[0, [120, 150, 185]], [3, [70, 125, 185]], [6, [40, 95, 160]], [10, [30, 60, 110]], [16, [110, 70, 200]]];
function windColor(ms: number): string {
  if (ms <= WIND_RAMP[0][0]) return `rgb(${WIND_RAMP[0][1].join(',')})`;
  for (let i = 1; i < WIND_RAMP.length; i++) {
    if (ms <= WIND_RAMP[i][0]) {
      const [a, ca] = WIND_RAMP[i - 1], [b, cb] = WIND_RAMP[i], k = (ms - a) / (b - a);
      return `rgb(${ca.map((x, j) => Math.round(x + (cb[j] - x) * k)).join(',')})`;
    }
  }
  return `rgb(${WIND_RAMP[WIND_RAMP.length - 1][1].join(',')})`;
}

/** Windpfeil (zeigt nach oben, MapLibre dreht ihn auf die Wehrichtung): Größe und Farbe folgen der Geschwindigkeit. */
function windArrow(ms: number, conf: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dbd-stage-arrow';
  const px = Math.round(28 + Math.min(ms, 12) * 1.5);
  el.style.opacity = String(0.6 + 0.4 * conf);
  el.innerHTML = `<svg width="${px}" height="${px}" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 1.5 L20.5 22.5 L13 17.5 L5.5 22.5 Z" fill="${windColor(ms)}" stroke="#FAF6EA" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
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

interface ObsT { name: string; lat: number; lon: number; elev: number; t: number; ms: number }
/** Gemessener Wind an einer Station: Herkunftsrichtung in Grad und Mittelwind in m/s. */
interface ObsW { lat: number; lon: number; dd: number; ff: number }

/**
 * Messwerte rund um den Ort aus dem Messdaten-Spiegel `obs/v1` (DWD, GeoSphere, MeteoSchweiz): die Temperaturen der nächsten
 * Stationen mit Mindestabstand (damit die Schilder sich nicht überdecken) und der gemessene Wind aller Stationen im Umkreis,
 * aus denen das Windfeld entsteht. Das ist Messung, kein Modell.
 */
async function loadObs(c: { lat: number; lon: number }, halfKm: number, nowMs: number, signal: AbortSignal): Promise<{ temps: ObsT[]; winds: ObsW[] }> {
  const { loadObsStore, obsVarsOf, obsDistanceM } = await import('../sources/obsStore');
  const store = await loadObsStore({ nowMs });
  if (signal.aborted) return { temps: [], winds: [] };
  // Offene Stationen mit Temperatur sind dünn gesät (Mittelgebirge: 6 im Umkreis von 40 km, 15 bei 60 km) — der Radius ist deshalb weit.
  const maxM = Math.max(halfKm * 3, 60) * 1000, gapM = Math.max(halfKm / 6, 3) * 1000;
  const cand: Array<ObsT & { d: number }> = [];
  const winds: Array<ObsW & { d: number }> = [];
  for (const st of store.catalog.stations) {
    const d = obsDistanceM(c.lat, c.lon, st.lat, st.lon);
    if (d > maxM) continue;
    const vars = obsVarsOf(store.latest.stations[st.id], nowMs)?.vars;
    if (!vars) continue;
    if (vars.t) cand.push({ name: st.name, lat: st.lat, lon: st.lon, elev: st.elev, t: vars.t.v, ms: vars.t.ms, d });
    if (vars.ff && vars.dd) winds.push({ lat: st.lat, lon: st.lon, dd: vars.dd.v, ff: vars.ff.v, d });
  }
  cand.sort((a, b) => a.d - b.d);
  const kept: Array<ObsT & { d: number }> = [];
  for (const x of cand) {
    if (kept.length >= 24) break;
    if (kept.every((k) => obsDistanceM(k.lat, k.lon, x.lat, x.lon) >= gapM)) kept.push(x);
  }
  winds.sort((a, b) => a.d - b.d);
  return { temps: kept, winds: winds.slice(0, 60) };
}

interface WindCell { lon: number; lat: number; toDeg: number; ms: number; conf: number }

/**
 * Windfeld über dem Gelände: Gitter um den Ort, an jedem Punkt der mit 1/d² gewichtete Mittelwert der Windvektoren (u, v) der
 * acht nächsten Messstationen. Die Zuverlässigkeit `conf` fällt mit dem Abstand zur nächsten Station (30 km Skala) — weit
 * entfernte Pfeile werden blass. Ohne ausreichend Stationen (< 3) zeigt jeder Punkt die Richtung am Ort aus buscosun Fusion.
 */
function windField(c: { lat: number; lon: number }, halfKm: number, viewBearing: number, winds: ObsW[], fallback: { dirDeg: number | null; ms: number | null }): { cells: WindCell[]; measured: boolean } {
  // Gitter in der Blickrichtung der Bühne: quer ± 1,5 R, in Blickrichtung von − 0,7 R (vor dem Ort) bis + 2,2 R (Ferne)
  const across = halfKm * 1.5, back = halfKm * 0.7, ahead = halfKm * 2.2;
  const NX = 9, NY = 6;
  const cells: WindCell[] = [];
  const useObs = winds.length >= 3;
  if (!useObs && fallback.dirDeg == null) return { cells, measured: false };
  const kmLon = KM_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180);
  const bx = Math.sin((viewBearing * Math.PI) / 180), by = Math.cos((viewBearing * Math.PI) / 180);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const q = -across + (2 * across * i) / (NX - 1), a = -back + ((back + ahead) * j) / (NY - 1);
      const dx = a * bx + q * by, dy = a * by - q * bx;
      const lat = c.lat + dy / KM_PER_DEG_LAT, lon = c.lon + dx / kmLon;
      if (!useObs) { cells.push({ lon, lat, toDeg: ((fallback.dirDeg as number) + 180) % 360, ms: fallback.ms ?? 2, conf: 1 }); continue; }
      const near = winds.map((w) => ({ w, d: Math.hypot((w.lat - lat) * KM_PER_DEG_LAT, (w.lon - lon) * kmLon) })).sort((a, b) => a.d - b.d).slice(0, 8);
      let su = 0, sv = 0, sw = 0;
      for (const { w, d } of near) {
        const wt = 1 / (d * d + 4);
        const r = (w.dd * Math.PI) / 180;
        su += -w.ff * Math.sin(r) * wt; sv += -w.ff * Math.cos(r) * wt; sw += wt;
      }
      const u = su / sw, v = sv / sw, ms = Math.hypot(u, v);
      cells.push({ lon, lat, toDeg: (((Math.atan2(u, v) * 180) / Math.PI) + 360) % 360, ms, conf: Math.exp(-near[0].d / 30) });
    }
  }
  return { cells, measured: useObs };
}

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
  const [obs, setObs] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; list: ObsT[]; winds: ObsW[] }>({ state: 'idle', list: [], winds: [] });
  const obsMarkersRef = useRef<maplibregl.Marker[]>([]);
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
    // Probe hook for the CDP check, only with `?ztdebug=1` (same as TowerStage).
    if (/[?&]ztdebug=1/.test(window.location.search)) (window as unknown as { __dbdStage?: maplibregl.Map }).__dbdStage = m;
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    // Das Stil-Sprite der Basiskarte kennt einige Symbole nicht (z. B. „circle-11"): ein leeres Bild statt einer Konsolenwarnung je Kachel.
    m.on('styleimagemissing', (e) => { if (!m.hasImage(e.id)) m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); });
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
    const add = (el: HTMLElement, lngLat: [number, number], anchor: 'center' | 'bottom' | 'left' = 'center') => ms.push(new maplibregl.Marker({ element: el, anchor, ...(anchor === 'left' ? { offset: [9, 0] as [number, number] } : {}) }).setLngLat(lngLat).addTo(map));
    add(chip(`${vm.fromLabel} ${R} km`, 'is-end'), a);
    add(chip(`${R} km ${vm.toLabel}`, 'is-end'), b);
    // Stationen rechts neben ihren Punkt, damit sie die Ortsmarke nicht überdecken
    for (const st of vm.stations) add(chip(`${st.label}`, 'is-station'), offset(c.lat, c.lon, st.s < 0 ? vm.axisDeg : vm.axisDeg + 180, Math.abs(st.s)), 'left');
    const ort = chip(vm.hOrt != null ? `${vm.ort.title} · ${de(vm.hOrt)} m` : vm.ort.title, 'is-ort');
    add(ort, [c.lon, c.lat], 'bottom');
    markersRef.current = ms;
    map.easeTo({ zoom: ZOOM_OF[R], bearing: (vm.axisDeg + 180) % 360, duration: 500 });
  }, [map, c?.lat, c?.lon, vm.halfKm, vm.axisDeg, vm.stations, vm.ort.title, vm.hOrt, vm.fromLabel, vm.toLabel]);

  // --- Windfeld über dem Gelände: Pfeile in einem Gitter um den Ort (zeigen, wohin der Wind weht) -----------------------
  const windDir = vm.wind.dirDeg;
  const field = windField(c ?? { lat: 0, lon: 0 }, vm.halfKm, bearing, obs.winds, vm.wind);
  const fieldKey = `${field.measured}|${field.cells.map((x) => `${Math.round(x.toDeg / 5)}.${Math.round(x.ms)}`).join(',')}`;
  useEffect(() => {
    arrowsRef.current.forEach((k) => k.remove());
    arrowsRef.current = [];
    if (!map || !c || !showWind) return;
    const out = field.cells.map((x) => new maplibregl.Marker({ element: windArrow(x.ms, x.conf), rotation: x.toDeg, rotationAlignment: 'map', pitchAlignment: 'viewport' }).setLngLat([x.lon, x.lat]).addTo(map));
    arrowsRef.current = out;
    return () => { out.forEach((k) => k.remove()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, c?.lat, c?.lon, showWind, fieldKey, vm.halfKm]);

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

  // --- Gemessene Temperaturen an Stationen (Schilder mit Wert, gefärbt wie die Fläche) --------------------------------
  useEffect(() => {
    if (!map || !c || !(showT || showWind)) { setObs({ state: 'idle', list: [], winds: [] }); return; }
    const ac = new AbortController();
    setObs((o) => ({ state: 'loading', list: o.list, winds: o.winds }));
    loadObs(c, vm.halfKm, nowMs, ac.signal)
      .then((r) => { if (!ac.signal.aborted) setObs({ state: 'ok', list: r.temps, winds: r.winds }); })
      .catch(() => { if (!ac.signal.aborted) setObs({ state: 'error', list: [], winds: [] }); });
    return () => ac.abort();
    // Die Messwerte werden mit dem Spiegel (2-min-Memo) alle 5 Minuten neu gelesen.
  }, [map, c?.lat, c?.lon, vm.halfKm, showT || showWind, Math.floor(nowMs / 300_000)]);
  useEffect(() => {
    obsMarkersRef.current.forEach((k) => k.remove());
    obsMarkersRef.current = [];
    if (!map || !showT) return;
    // Eine Station direkt am Ort hängt UNTER ihrem Punkt, damit sie die Ortsmarke (darüber) nicht überdeckt.
    const nearPlace = (o: ObsT) => !!c && Math.hypot((o.lat - c.lat) * KM_PER_DEG_LAT, (o.lon - c.lon) * KM_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180)) < 3;
    const ms = obs.list.map((o) => { const below = nearPlace(o); return new maplibregl.Marker({ element: obsPin(o.t, o.name, o.elev, o.ms, below), anchor: below ? 'top' : 'bottom', offset: below ? [0, 7] : [0, -7] }).setLngLat([o.lon, o.lat]).addTo(map); });
    obsMarkersRef.current = ms;
    return () => { ms.forEach((k) => k.remove()); };
  }, [map, showT, obs.list]);

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
          <button type="button" className={showT ? 'is-on' : undefined} aria-pressed={showT} onClick={() => setShowT((v) => !v)} title="Gemessene Temperaturen an Stationen; dazu die Fläche aus Höhe und Gradient, wenn das Modellprofil einen Gradienten trägt">Temperatur</button>
          <button type="button" className={showWind ? 'is-on' : undefined} aria-pressed={showWind} onClick={() => setShowWind((v) => !v)} title="Windfeld aus gemessenem Wind der Stationen rund um den Ort (ohne genug Stationen: Richtung am Ort aus buscosun Fusion)">Wind</button>
          {skOn && <button type="button" className={showSnow ? 'is-on' : undefined} aria-pressed={showSnow} onClick={() => setShowSnow((v) => !v)}>Schneegrenze</button>}
        </div>
      </div>
      <div className="dbd-stage-leg">
        <span className="dbd-stage-leg-i"><i className="dbd-stage-sw-axis" /> Schnitt in Windrichtung ± {vm.halfKm} km</span>
        {showWind && field.cells.length > 0 && (
          <span className="dbd-stage-leg-i dbd-stage-leg-w">
            <svg width="12" height="12" viewBox="0 0 26 26" aria-hidden="true" style={{ transform: `rotate(${windDir != null ? (windDir + 180) % 360 : 0}deg)` }}><path d="M13 1.5 L20.5 22.5 L13 17.5 L5.5 22.5 Z" fill="#3A6FA8" /></svg>
            {field.measured
              ? `Windfeld aus ${obs.winds.length} Messstationen (gewichtet nach Abstand) · Pfeil = wohin der Wind weht, Größe und Farbe = Geschwindigkeit, blasser = weit von einer Station`
              : `Wind am Ort aus ${windDir != null ? `${compass16(windDir)} (${Math.round(windDir)}°)` : '—'}${vm.wind.ms != null ? `, ${de(vm.wind.ms, 1)} m/s` : ''} — zu wenige Messstationen mit Wind, Richtung überall gleich gezeichnet`}
            <span className="dbd-stage-grad dbd-stage-grad--w" style={{ background: `linear-gradient(90deg, ${[0, 3, 6, 10, 16].map((v) => windColor(v)).join(',')})` }} aria-hidden="true" />0 … 16 m/s
          </span>
        )}
        {showT && th && tempRange && tempState !== 'error' && (
          <span className="dbd-stage-leg-i dbd-stage-leg-t">
            <span className="dbd-stage-grad" style={{ background: gradCss }} aria-hidden="true" />
            {de(tempRange.tMin, 0)} … {de(tempRange.tMax, 0)} °C · Temperatur nach Höhe, γ {de(th.gamma, 1)} K/km
          </span>
        )}
        {showT && !th && <span className="dbd-stage-leg-i">Keine Temperaturfläche: kein einzelner Gradient trägt (Inversion oder kein Modellprofil)</span>}
        {showT && (
          <span className="dbd-stage-leg-i">
            {obs.state === 'loading' && !obs.list.length ? 'Messwerte laden …'
              : obs.list.length ? `Schilder: gemessene Temperatur an ${obs.list.length} Stationen (DWD · GeoSphere · MeteoSchweiz), Stand ${new Date(Math.max(...obs.list.map((o) => o.ms))).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
                : obs.state === 'error' ? 'Messwerte nicht abrufbar' : 'keine aktuellen Messwerte in der Nähe'}
          </span>
        )}
        {showT && th && tempState === 'loading' && <span className="dbd-stage-leg-i">Temperaturfläche lädt …</span>}
        {showT && th && tempState === 'error' && <span className="dbd-stage-leg-i">Temperaturfläche nicht verfügbar (Geländekacheln)</span>}
        {skOn && showSnow && <SnowCapLegend info={snow.info} variant="inline" />}
        <span className="dbd-stage-leg-foot">Gelände {de(TOWER_EXAGGERATION, 1)}-fach überhöht{showT && th ? ' · Temperatur in 2-K-Bändern aus Höhe und einem Gradienten (kein Wetterfeld)' : ''}</span>
      </div>
    </div>
  );
}
