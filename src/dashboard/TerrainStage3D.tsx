/**
 * 3D-Bühne des Terrain-Felds — Lazy-Chunk. Nach dem Vorbild der Bühne im Regenradar (`nowcast/cellTowers/TowerStage.tsx`):
 * eigene MapLibre-Karte mit Terrarium-Gelände (gleiche Überhöhung `TOWER_EXAGGERATION`), sandfarbener Schummerung, Himmel,
 * Basiskarte positron und der Schneefallgrenze als Fläche auf dem Relief (`useSnowCap`, Phase SK; `?sk=0` schaltet sie ab).
 * Dazu, was das Dashboard am Ort zeigt: der Ort, die Schnittlinie in Windrichtung (± halbe Länge), die Stationen des Katalogs,
 * geschätzte Temperaturen an Orten und Gipfeln (ein Gradient aus dem Modellprofil oder den Messstationen) und die
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
const KM_PER_DEG_LAT = 111.32;
/** Zoom je Reichweite (± km), bei dem die Reichweite ungefähr die Bühne füllt. */
const ZOOM_OF: Record<10 | 20 | 50, number> = { 10: 10.3, 20: 9.3, 50: 8.2 };

const de = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const supportsWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

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


interface ObsT { name: string; lat: number; lon: number; elev: number; t: number; ms: number }
/** Gemessener Wind an einer Station: Herkunftsrichtung in Grad und Mittelwind in m/s. */
interface ObsW { lat: number; lon: number; dd: number; ff: number }

/**
 * Messwerte rund um den Ort aus dem Messdaten-Spiegel `obs/v1` (DWD, GeoSphere, MeteoSchweiz): die Temperaturen der nächsten
 * Stationen mit Mindestabstand (damit die Schilder sich nicht überdecken) und der gemessene Wind aller Stationen im Umkreis,
 * aus denen das Windfeld entsteht. Das ist Messung, kein Modell.
 */
async function loadObs(c: { lat: number; lon: number }, halfKm: number, nowMs: number, signal: AbortSignal): Promise<{ temps: ObsT[]; winds: ObsW[]; fit: Array<{ elev: number; t: number }> }> {
  const { loadObsStore, obsVarsOf, obsDistanceM } = await import('../sources/obsStore');
  const store = await loadObsStore({ nowMs });
  if (signal.aborted) return { temps: [], winds: [], fit: [] };
  // Offene Stationen mit Temperatur sind dünn gesät (Mittelgebirge: 6 im Umkreis von 40 km, 15 bei 60 km) — der Radius ist deshalb weit.
  const maxM = Math.max(halfKm * 3, 60) * 1000, gapM = Math.max(halfKm / 3, 6) * 1000;
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
    if (kept.length >= 10) break;
    if (kept.every((k) => obsDistanceM(k.lat, k.lon, x.lat, x.lon) >= gapM)) kept.push(x);
  }
  winds.sort((a, b) => a.d - b.d);
  // Alle Stationen mit Temperatur im Umkreis (nicht ausgedünnt) für die Höhenabhängigkeit der Temperatur
  return { temps: kept, winds: winds.slice(0, 60), fit: cand.map((x) => ({ elev: x.elev, t: x.t })) };
}

/**
 * Temperatur nach Höhe aus den Messstationen: Ausgleichsgerade T = a + b·h (kleinste Quadrate). Gilt nur bei genug Stationen
 * (≥ 5), genug Höhenspreizung (≥ 200 m) und plausibler Steigung (−12 … +4 K/km) — sonst `null`. Ersatz für den Gradienten des
 * Modellprofils, wenn der fehlt (dann als Schätzung gekennzeichnet).
 */
function lapseFit(pts: Array<{ elev: number; t: number }>): { a: number; b: number; n: number; r2: number } | null {
  const n = pts.length;
  if (n < 5) return null;
  const hs = pts.map((p) => p.elev);
  if (Math.max(...hs) - Math.min(...hs) < 200) return null;
  const mh = hs.reduce((s, x) => s + x, 0) / n, mt = pts.reduce((s, p) => s + p.t, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { sxx += (p.elev - mh) ** 2; sxy += (p.elev - mh) * (p.t - mt); syy += (p.t - mt) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx, a = mt - b * mh;
  const slopeKm = b * 1000;
  if (slopeKm < -12 || slopeKm > 4) return null;
  return { a, b, n, r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy) };
}

/** Orte und Gipfel in der Nähe, aus den Vektorkacheln der Basiskarte (nur Namen, Lage und ggf. Höhe) — nach Rang und Nähe zur Mitte. */
function placeCandidates(map: maplibregl.Map, zoom: number, hOrt: number | null): Array<{ name: string; lon: number; lat: number; ele: number | null; rank: number; peak: boolean }> {
  const src = Object.entries(map.getStyle()?.sources ?? {}).find(([, s]) => s.type === 'vector')?.[0];
  if (!src) return [];
  const RANK: Record<string, number> = { city: 5, town: 4, village: 3, suburb: 2, hamlet: 2, neighbourhood: 1, isolated_dwelling: 1 };
  const minRank = zoom >= 11.6 ? 2 : zoom >= 10.6 ? 3 : 4;
  const b = map.getBounds();
  const seen = new Set<string>();
  const out: Array<{ name: string; lon: number; lat: number; ele: number | null; rank: number; peak: boolean }> = [];
  const take = (layer: string, peak: boolean) => {
    for (const f of map.querySourceFeatures(src, { sourceLayer: layer })) {
      if (f.geometry.type !== 'Point') continue;
      const p = f.properties as { name?: string; 'name:de'?: string; class?: string; ele?: number | string };
      const name = p['name:de'] ?? p.name;
      if (!name) continue;
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      if (lon < b.getWest() || lon > b.getEast() || lat < b.getSouth() || lat > b.getNorth()) continue;
      const key = `${layer}|${name}|${lon.toFixed(3)}|${lat.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ele = peak ? (typeof p.ele === 'string' ? parseFloat(p.ele) : p.ele ?? null) : null;
      const rank = peak ? (hOrt != null && ele != null && ele > hOrt + 250 ? 3 : 2) : RANK[p.class ?? ''] ?? 0;
      if (rank < minRank) continue;
      out.push({ name, lon, lat, ele: Number.isFinite(ele as number) ? (ele as number) : null, rank, peak });
    }
  };
  take('place', false);
  take('mountain_peak', true);
  const cen = map.getCenter();
  return out.sort((a, b2) => b2.rank - a.rank || Math.hypot(a.lon - cen.lng, a.lat - cen.lat) - Math.hypot(b2.lon - cen.lng, b2.lat - cen.lat));
}

/** Ortskarte (klein): farbige Temperaturpille mit „≈" und Name; die Temperatur ist geschätzt (Höhe + Gradient), nicht gemessen. */
function placePin(t: number, name: string, h: number, peak: boolean, src: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `dbd-stage-pin is-place${peak ? ' is-peak' : ''}`;
  const col = rampColor(t);
  el.style.setProperty('--c', `rgb(${col[0]},${col[1]},${col[2]})`);
  el.style.setProperty('--ink', col[0] * 0.299 + col[1] * 0.587 + col[2] * 0.114 > 150 ? '#2C2A26' : '#FFFFFF');
  const b = document.createElement('b');
  b.textContent = `≈${t.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
  const n = document.createElement('em');
  n.textContent = name.length > 18 ? `${name.slice(0, 17)}…` : name;
  const s = document.createElement('small');
  s.textContent = `${Math.round(h).toLocaleString('de-DE')} m`;
  el.append(b, n, s);
  el.title = `${name} · ${Math.round(h)} m · geschätzt ${t.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C (${src})`;
  return el;
}

interface WindCell { lon: number; lat: number; toDeg: number; ms: number; conf: number }

/**
 * Windfeld über dem Gelände: Gitter um den Ort, an jedem Punkt der mit 1/d² gewichtete Mittelwert der Windvektoren (u, v) der
 * acht nächsten Messstationen. Die Zuverlässigkeit `conf` fällt mit dem Abstand zur nächsten Station (30 km Skala) — weit
 * entfernte Pfeile werden blass. Ohne ausreichend Stationen (< 3) zeigt jeder Punkt die Richtung am Ort aus buscosun Fusion.
 */
function windField(c: { lat: number; lon: number }, halfKm: number, viewBearing: number, winds: ObsW[], fallback: { dirDeg: number | null; ms: number | null }): { cells: WindCell[]; measured: boolean } {
  // Gitter in der Blickrichtung der Bühne: quer ± 1,5 R, in Blickrichtung von − 0,7 R (vor dem Ort) bis + 2,2 R (Ferne)
  const Rf = Math.max(halfKm, 20); /* das Feld füllt die Bühne auch bei kleiner Reichweite */ const across = Rf * 1.5, back = Rf * 0.7, ahead = Rf * 2.2;
  const NX = 8, NY = 5;
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
  const [info, setInfo] = useState(false);
  const [obs, setObs] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; list: ObsT[]; winds: ObsW[]; fit: Array<{ elev: number; t: number }> }>({ state: 'idle', list: [], winds: [], fit: [] });
  const obsMarkersRef = useRef<maplibregl.Marker[]>([]);
  const c = vm.center;
  const bearing = 0; // Norden oben
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
      m.addLayer({
        id: 'dbd-hillshade', type: 'hillshade', source: DEM_SRC,
        paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#4A4234', 'hillshade-accent-color': '#6B5A45', 'hillshade-illumination-anchor': 'map', 'hillshade-illumination-direction': 335 },
      }, firstSymbol);
      try {
        m.setSky({ 'sky-color': '#DCE3EA', 'horizon-color': '#F3EEE2', 'fog-color': '#F3EEE2', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4 });
      } catch { /* setSky hängt von der Version ab */ }
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

  // --- Ortsmarke und Zoom (folgen der gewählten Reichweite) ------------------------------------------------------------
  useEffect(() => {
    if (!map || !c) return;
    markersRef.current.forEach((k) => k.remove());
    const ort = chip(vm.hOrt != null ? `${vm.ort.title} · ${de(vm.hOrt)} m` : vm.ort.title, 'is-ort');
    markersRef.current = [new maplibregl.Marker({ element: ort, anchor: 'bottom' }).setLngLat([c.lon, c.lat]).addTo(map)];
    map.easeTo({ zoom: ZOOM_OF[vm.halfKm], bearing: 0, duration: 500 });
  }, [map, c?.lat, c?.lon, vm.halfKm, vm.ort.title, vm.hOrt]);

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

  // --- Temperatur nach Höhe (Grundlage der geschätzten Orts- und Gipfeltemperaturen) ------------------------------------
  // Temperatur nach Höhe: Gradient des Modellprofils (buscosun Fusion); fehlt er, die Ausgleichsgerade der Messstationen (Schätzung).
  const fit = lapseFit(obs.fit);
  const th = vm.thermal ?? (fit ? { tOrt: fit.a, hOrt: 0, gamma: -fit.b * 1000 } : null);
  const thSrc: 'model' | 'obs' | null = vm.thermal ? 'model' : fit ? 'obs' : null;

  // --- Gemessene Temperaturen an Stationen (Schilder mit Wert, gefärbt wie die Fläche) --------------------------------
  useEffect(() => {
    if (!map || !c || !(showT || showWind)) { setObs({ state: 'idle', list: [], winds: [], fit: [] }); return; }
    const ac = new AbortController();
    setObs((o) => ({ state: 'loading', list: o.list, winds: o.winds, fit: o.fit }));
    loadObs(c, vm.halfKm, nowMs, ac.signal)
      .then((r) => { if (!ac.signal.aborted) setObs({ state: 'ok', list: r.temps, winds: r.winds, fit: r.fit }); })
      .catch(() => { if (!ac.signal.aborted) setObs({ state: 'error', list: [], winds: [], fit: [] }); });
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

  // --- Temperatur an Orten und Gipfeln, je näher man zoomt desto mehr (Höhe → Temperatur über den Gradienten) ---------
  const placeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [placeCount, setPlaceCount] = useState(0);
  const hOrtNow = vm.hOrt;
  useEffect(() => {
    const clear = () => { placeMarkersRef.current.forEach((k) => k.remove()); placeMarkersRef.current = []; setPlaceCount(0); };
    // Namensschilder der Basiskarte für Orte weichen den Temperaturschildern (sonst steht jeder Name doppelt)
    const labelLayers = (m: maplibregl.Map) => (m.getStyle()?.layers ?? []).filter((l) => l.type === 'symbol' && 'source-layer' in l && (l as { 'source-layer'?: string })['source-layer'] === 'place' && /^label_(village|town|city|other)/.test(l.id)).map((l) => l.id);
    // Beim Abbau der Karte (Wechsel auf „Schnitt") ist der Stil schon weg — dann gibt es nichts zurückzusetzen.
    const setLabels = (m: maplibregl.Map, visible: boolean) => { try { for (const id of labelLayers(m)) m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); } catch { /* Karte entfernt */ } };
    if (!map || !showT || !th) { if (map) setLabels(map, true); clear(); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      const z = map.getZoom();
      if (z < 9.9) { setLabels(map, true); clear(); return; }
      setLabels(map, false);
      const cands = placeCandidates(map, z, hOrtNow);
      const W = map.getCanvas().clientWidth, Hh = map.getCanvas().clientHeight;
      // belegte Flächen: die Stationsschilder und bereits gesetzte Ortsschilder (grob 120 × 30 Pixel je Schild)
      const taken: Array<{ x: number; y: number }> = obs.list.map((o) => { const p = map.project([o.lon, o.lat]); return { x: p.x, y: p.y }; });
      const out: maplibregl.Marker[] = [];
      for (const cd of cands) {
        if (out.length >= 18) break;
        const p = map.project([cd.lon, cd.lat]);
        if (p.x < 40 || p.x > W - 40 || p.y < 50 || p.y > Hh - 40) continue;
        if (taken.some((q) => Math.abs(q.x - p.x) < 150 && Math.abs(q.y - p.y) < 48)) continue;
        const elev = cd.ele ?? (() => { const e = map.queryTerrainElevation([cd.lon, cd.lat]); return e == null ? null : e / TOWER_EXAGGERATION; })();
        if (elev == null) continue;
        const t = tempAt(th.tOrt, th.hOrt, th.gamma, elev);
        taken.push({ x: p.x, y: p.y });
        out.push(new maplibregl.Marker({ element: placePin(t, cd.name, elev, cd.peak, thSrc === 'model' ? 'Höhe und Gradient aus buscosun Fusion' : `Höhe und Ausgleichsgerade aus ${fit?.n ?? 0} Messstationen`), anchor: 'top', offset: [0, 4] }).setLngLat([cd.lon, cd.lat]).addTo(map));
      }
      placeMarkersRef.current.forEach((k) => k.remove());
      placeMarkersRef.current = out;
      setPlaceCount(out.length);
    };
    const sched = () => { if (timer) clearTimeout(timer); timer = setTimeout(run, 300); };
    map.on('idle', sched);
    map.on('moveend', sched);
    sched();
    return () => { if (timer) clearTimeout(timer); map.off('idle', sched); map.off('moveend', sched); setLabels(map, true); clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, showT, th?.tOrt, th?.hOrt, th?.gamma, obs.list, hOrtNow]);

  // --- Schneefallgrenze als Fläche (Phase SK) ----------------------------------------------------------------------
  const skOn = typeof window !== 'undefined' && snowCapEnabledFrom(window.location.search);
  const skMobile = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;
  const snow = useSnowCap(map, skOn && showSnow, nowMs, { palette: SK_PALETTE_3D, beforeId: () => undefined, prefix: 'dsk3', mobile: skMobile });

  const reset = () => mapRef.current?.easeTo({ pitch: STAGE_PITCH, bearing, center: c ? [c.lon, c.lat] : undefined, zoom: ZOOM_OF[vm.halfKm], duration: 600 });

  if (!c) return <div className="dbd-empty">Gelände nicht verfügbar — kein Ort gewählt.</div>;
  // Farbskala der Temperaturschilder: Spanne der gemessenen Stationswerte (mindestens 1 K breit)
  const chipTs = obs.list.map((o) => o.t);
  const chipRange = chipTs.length ? { min: Math.min(...chipTs) - (Math.max(...chipTs) === Math.min(...chipTs) ? 0.5 : 0), max: Math.max(...chipTs) + (Math.max(...chipTs) === Math.min(...chipTs) ? 0.5 : 0) } : null;
  return (
    <div className="dbd-stage-in">
      <div ref={boxRef} className="dbd-stage-map" />
      {noWebgl && <div className="dbd-stage-note">3D braucht WebGL — dieses Gerät bietet es nicht.</div>}
      <div className="dbd-stage-top">
        <div className="dbd-stage-layers" role="group" aria-label="Ebenen der Bühne">
          <button type="button" className={showT ? 'is-on' : undefined} aria-pressed={showT} onClick={() => setShowT((v) => !v)} title="Gemessene Temperaturen an Stationen, geschätzte an Orten und Gipfeln"><i style={{ background: '#D2662D' }} />Temperatur</button>
          <button type="button" className={showWind ? 'is-on' : undefined} aria-pressed={showWind} onClick={() => setShowWind((v) => !v)} title="Windfeld aus dem gemessenen Wind der Stationen rund um den Ort"><i style={{ background: '#3A6FA8' }} />Wind</button>
          {skOn && <button type="button" className={showSnow ? 'is-on' : undefined} aria-pressed={showSnow} onClick={() => setShowSnow((v) => !v)} title="Schneefallgrenze als Fläche auf dem Relief"><i style={{ background: '#FFFFFF', boxShadow: 'inset 0 0 0 1px rgba(44,42,38,.35)' }} />Schnee</button>}
        </div>
        <button type="button" className="dbd-stage-icon" onClick={reset} aria-label="Ansicht zurücksetzen" title="Ansicht zurücksetzen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M4 4v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="dbd-stage-leg">
        <div className="dbd-stage-leg-row">
          {showT && chipRange && (
            <span className="dbd-stage-leg-i"><span className="dbd-stage-grad" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, k) => rampCss(chipRange.min + ((chipRange.max - chipRange.min) * k) / 8)).join(',')})` }} aria-hidden="true" /><b>{de(chipRange.min, 0)} … {de(chipRange.max, 0)} °C</b></span>
          )}
          {showWind && field.cells.length > 0 && (
            <span className="dbd-stage-leg-i"><span className="dbd-stage-grad" style={{ background: `linear-gradient(90deg, ${[0, 3, 6, 10, 16].map((v) => windColor(v)).join(',')})` }} aria-hidden="true" /><b>0 … 16 m/s</b></span>
          )}
          {showT && (obs.state === 'loading' && !obs.list.length) && <span className="dbd-stage-leg-i is-quiet">Messwerte laden …</span>}
          {showT && !th && obs.state !== 'loading' && <span className="dbd-stage-leg-i is-quiet">Keine Ortstemperaturen (kein Gradient)</span>}
          {skOn && showSnow && snow.info.status === 'loading' && <span className="dbd-stage-leg-i is-quiet">Schneefallgrenze lädt …</span>}
          <button type="button" className={`dbd-stage-info${info ? ' is-on' : ''}`} aria-expanded={info} onClick={() => setInfo((v) => !v)} title="Herkunft und Hinweise zu den Ebenen">
            <span aria-hidden="true">i</span><span className="dbd-sr">Herkunft und Hinweise</span>
          </button>
        </div>
        {info && (
          <ul className="dbd-stage-leg-more">
            <li>Gelände {de(TOWER_EXAGGERATION, 1)}-fach überhöht.</li>
            {showT && th && <li>Temperatur an Orten und Gipfeln: geschätzt aus Geländehöhe und einem Gradienten (γ {de(th.gamma, 1)} K/km) — {thSrc === 'obs' && fit ? `Ausgleichsgerade aus ${fit.n} Messstationen, R² ${de(fit.r2, 2)}` : 'Gradient aus dem Modellprofil von buscosun Fusion'}; kein Wetterfeld, ohne Luv-/Lee- oder Stadteffekte.</li>}
            {showT && !th && <li>Keine geschätzten Ortstemperaturen: weder das Modellprofil noch die Messstationen tragen einen Gradienten (Inversion, zu wenige oder zu gleich hohe Stationen).</li>}
            {showT && <li>{obs.list.length ? `Schilder mit Messwert: ${obs.list.length} Stationen (DWD · GeoSphere · MeteoSchweiz), Stand ${new Date(Math.max(...obs.list.map((o) => o.ms))).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.` : obs.state === 'error' ? 'Messwerte nicht abrufbar.' : 'Keine aktuellen Messwerte in der Nähe.'}</li>}
            {showT && th && <li>{placeCount > 0 ? `${placeCount} Orte und Gipfel mit geschätzter Temperatur (≈ nach Höhe)` : 'Näher heranzoomen: Orte und Gipfel erscheinen mit geschätzter Temperatur (≈ nach Höhe)'}.</li>}
            {showWind && field.cells.length > 0 && <li>{field.measured ? `Windfeld aus ${obs.winds.length} Messstationen, nach Abstand gewichtet; Pfeil = wohin der Wind weht, blasser = weit von einer Station.` : `Wind am Ort aus ${windDir != null ? `${compass16(windDir)} (${Math.round(windDir)}°)` : '—'}${vm.wind.ms != null ? `, ${de(vm.wind.ms, 1)} m/s` : ''}; zu wenige Messstationen mit Wind — Richtung überall gleich gezeichnet.`} Kein Höhenwind.</li>}
            {skOn && showSnow && <li className="dbd-stage-leg-snow"><SnowCapLegend info={snow.info} variant="inline" /></li>}
          </ul>
        )}
      </div>
    </div>
  );
}