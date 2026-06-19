/**
 * Zeichnet die aufbereitete Strecke: voller Track als Linie + Start-/Ziel-
 * Marker, Wetter-Sample-Punkte, Pausen-Marker und Wegpunkt-Vorschläge. Klick
 * auf die Karte meldet die Distanz des nächstgelegenen Track-Punkts zurück
 * („Pause hier hinzufügen"). Pausen/Wegpunkte aktualisieren sich ohne
 * Neu-Initialisierung der Karte.
 *
 * Wetter-Overlay (5.x): pro angereichertem Sample wird optional ein Marker
 * gezeichnet, der Niederschlag (Blob, Größe/Farbe ∝ Rate), aktive Warnungen
 * (roter Ring), Föhn-Lage (oranger Ring) und nennenswerten Wind (gedrehter
 * Pfeil) zeigt. Klick auf einen Wetter-Marker öffnet ein Detail-Popup.
 */

import { useEffect, useRef } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { haversine } from './routeModel';

interface LngLat { lat: number; lon: number; dist?: number }
export interface MapBreak { lat: number; lon: number; kind: 'rest' | 'meal' | 'custom' }

/** Ein angereicherter Sample für das Karten-Wetter-Overlay. */
export interface WeatherMarker {
  lat: number;
  lon: number;
  distM: number;
  etaMs: number;
  temperatureC: number | null;
  cloudCoverPct: number | null;
  precipMmH: number | null;
  precipType: 'none' | 'rain' | 'sleet' | 'snow';
  precipSource: 'radar' | 'nwp' | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;
  /** Wind relativ zur Reiserichtung: Rücken / Seite / Gegen (bearing-relativ). */
  windRel: 'tail' | 'cross' | 'head' | null;
  uvIndex: number | null;
  hasWarning: boolean;
  warningEvent?: string;
  foehn: boolean;
}

interface Props {
  points: Array<{ lat: number; lon: number; dist: number }>;
  samples?: LngLat[];
  breaks?: MapBreak[];
  waypoints?: LngLat[];
  /** Wetter-Marker pro angereichertem Sample (Overlay). */
  weatherSamples?: WeatherMarker[];
  /** Klick auf die Karte → Distanz (m) des nächsten Track-Punkts. */
  onPickPoint?: (dist: number) => void;
  /** Live-Position des Zeit-Scrubbers (pulsierender Marker). */
  scrubMarker?: { lat: number; lon: number } | null;
}

const WIND_ARROW_MIN_MPS = 4;            // Pfeil erst ab nennenswertem Wind

export default function RouteMap({ points, samples = [], breaks = [], waypoints = [], weatherSamples = [], onPickPoint, scrubMarker = null }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const scrubMarkerRef = useRef<maplibregl.Marker | null>(null);
  const readyRef = useRef(false);
  const pointsRef = useRef(points);
  const onPickRef = useRef(onPickPoint);
  pointsRef.current = points;
  onPickRef.current = onPickPoint;

  // Init (nur bei Geometrie-Änderung, z. B. Richtungswechsel).
  useEffect(() => {
    if (!containerRef.current) return;
    readyRef.current = false;

    const coords = points.map((p) => [p.lon, p.lat] as [number, number]);
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      bounds,
      fitBoundsOptions: { padding: 48 },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __routeMap?: MapLibreMap }).__routeMap = map;
    }

    const emptyFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
      });
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } });
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#c6633b', 'line-width': 4 } });

      map.addSource('route-samples', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: samples.map((s) => pointFeature(s)) },
      });
      map.addLayer({ id: 'route-samples', type: 'circle', source: 'route-samples', paint: { 'circle-radius': 2, 'circle-color': '#7a9466', 'circle-opacity': 0.5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 0.8, 'circle-stroke-opacity': 0.5 } });

      // Wind-Pfeile (bearing-relativ eingefärbt) als programmatische Bilder.
      for (const [rel, color] of Object.entries(WIND_REL_COLORS)) {
        const id = `wind-arrow-${rel}`;
        if (!map.hasImage(id)) { const img = makeArrowImage(color); if (img) map.addImage(id, img, { pixelRatio: 2 }); }
      }
      // Wetter-Zustands-Icons (Sonne/Wolke/Regen …) als Karten-Marker (§5, Mockup).
      for (const kind of CONDITION_KINDS) {
        const id = `wx-${kind}`;
        if (!map.hasImage(id)) { const img = makeCondImage(kind); if (img) map.addImage(id, img, { pixelRatio: 2 }); }
      }

      // --- Wetter-Overlay-Quelle + Layer (Reihenfolge = Stapelung) ---------
      map.addSource('route-weather', { type: 'geojson', data: emptyFC });

      // Föhn-Halo (orange) — Ring um das Zustands-Icon, unter dem Warn-Halo.
      map.addLayer({
        id: 'weather-foehn', type: 'circle', source: 'route-weather',
        filter: ['==', ['get', 'foehn'], 1],
        paint: {
          'circle-radius': 18, 'circle-color': 'rgba(212,163,115,0.14)',
          'circle-stroke-color': '#d77a3b', 'circle-stroke-width': 2.2,
        },
      });

      // Warn-Halo (rot) — oberster Ring-Indikator.
      map.addLayer({
        id: 'weather-warn', type: 'circle', source: 'route-weather',
        filter: ['==', ['get', 'warn'], 1],
        paint: {
          'circle-radius': 20, 'circle-color': 'rgba(204,0,0,0.10)',
          'circle-stroke-color': '#cc0000', 'circle-stroke-width': 2.4,
        },
      });

      // Wetter-Zustands-Icon (Sonne/Wolke/Regen/…) am Sample — das eigentliche Marker-Symbol.
      map.addLayer({
        id: 'weather-cond', type: 'symbol', source: 'route-weather',
        layout: {
          'icon-image': ['concat', 'wx-', ['get', 'cond']],
          'icon-size': 0.34,
          'icon-allow-overlap': false,
          'symbol-sort-key': ['get', 'sortKey'],
        },
      });

      // Windpfeil — gedreht in Strömungsrichtung (woher+180°), ab Mindeststärke.
      map.addLayer({
        id: 'weather-wind', type: 'symbol', source: 'route-weather',
        filter: ['>=', ['get', 'windSpeed'], WIND_ARROW_MIN_MPS],
        layout: {
          'icon-image': ['concat', 'wind-arrow-', ['coalesce', ['get', 'windRel'], 'cross']],
          'icon-rotate': ['+', ['get', 'windDir'], 180],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-offset': [0, -26],
          'icon-size': ['interpolate', ['linear'], ['get', 'windSpeed'], 4, 0.4, 16, 0.8],
        },
      });

      // Popup bei Klick auf einen Wetter-Marker.
      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12 });
      const showPopup = (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        popup.setLngLat(e.lngLat).setHTML(weatherPopupHtml(f.properties as Record<string, unknown>)).addTo(map);
      };
      for (const id of ['weather-cond', 'weather-warn', 'weather-foehn', 'weather-wind']) {
        map.on('click', id, showPopup);
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = onPickRef.current ? 'crosshair' : ''; });
      }

      map.addSource('route-waypoints', { type: 'geojson', data: emptyFC });
      map.addLayer({ id: 'route-waypoints', type: 'circle', source: 'route-waypoints', paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#8a7d68', 'circle-stroke-width': 1.6 } });

      map.addSource('route-breaks', { type: 'geojson', data: emptyFC });
      map.addLayer({
        id: 'route-breaks', type: 'circle', source: 'route-breaks',
        paint: {
          'circle-radius': 5.5,
          'circle-color': ['match', ['get', 'kind'], 'meal', '#c6633b', 'custom', '#8a6d3b', '#4f627e'],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 1.8,
        },
      });

      readyRef.current = true;
      syncSource(map, 'route-breaks', breaksToFC(breaksRef.current));
      syncSource(map, 'route-waypoints', { type: 'FeatureCollection', features: waypointsRef.current.map((w) => pointFeature(w)) });
      syncSource(map, 'route-weather', weatherToFC(weatherRef.current));
    });

    // Start-/Ziel-Marker.
    new maplibregl.Marker({ color: '#7a9466' }).setLngLat(coords[0]).addTo(map);
    new maplibregl.Marker({ color: '#a8431f' }).setLngLat(coords[coords.length - 1]).addTo(map);

    // Klick → nächster Track-Punkt → Distanz melden. Klicks auf Wetter-Marker
    // werden ignoriert (dort öffnet stattdessen das Popup).
    map.on('click', (e) => {
      const cb = onPickRef.current;
      if (!cb) return;
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ['weather-cond', 'weather-warn', 'weather-foehn', 'weather-wind'].filter((l) => map.getLayer(l)),
      });
      if (hits.length > 0) return;
      const pts = pointsRef.current;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const d = haversine(pts[i].lat, pts[i].lon, e.lngLat.lat, e.lngLat.lng);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (pts[best]) cb(pts[best].dist);
    });
    map.getCanvas().style.cursor = onPickRef.current ? 'crosshair' : '';

    return () => { map.remove(); mapRef.current = null; scrubMarkerRef.current = null; readyRef.current = false; };
  }, [points, samples]);

  // Live-Marker des Zeit-Scrubbers — folgt der Position ohne Re-Init.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!scrubMarker) { scrubMarkerRef.current?.remove(); scrubMarkerRef.current = null; return; }
    if (!scrubMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'rt-scrubpin';
      scrubMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([scrubMarker.lon, scrubMarker.lat]).addTo(map);
    } else {
      scrubMarkerRef.current.setLngLat([scrubMarker.lon, scrubMarker.lat]);
    }
  }, [scrubMarker]);

  // Pausen, Wegpunkte & Wetter-Overlay ohne Re-Init aktualisieren.
  const breaksRef = useRef(breaks);
  const waypointsRef = useRef(waypoints);
  const weatherRef = useRef(weatherSamples);
  breaksRef.current = breaks;
  waypointsRef.current = waypoints;
  weatherRef.current = weatherSamples;

  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) syncSource(map, 'route-breaks', breaksToFC(breaks));
  }, [breaks]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) {
      syncSource(map, 'route-waypoints', { type: 'FeatureCollection', features: waypoints.map((w) => pointFeature(w)) });
    }
  }, [waypoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) syncSource(map, 'route-weather', weatherToFC(weatherSamples));
  }, [weatherSamples]);

  return <div className="route-map" ref={containerRef} />;
}

function pointFeature(p: LngLat, props: Record<string, unknown> = {}): GeoJSON.Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } };
}
function breaksToFC(breaks: MapBreak[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: breaks.map((b) => pointFeature(b, { kind: b.kind })) };
}

function weatherToFC(markers: WeatherMarker[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => pointFeature({ lat: m.lat, lon: m.lon }, {
      cond: conditionFor(m.cloudCoverPct, m.precipMmH, m.precipType),
      // Placement-Priorität: Warnung/Starkregen/Föhn gewinnen das Entclutter (niedriger = wichtiger).
      sortKey: m.hasWarning ? 0 : (m.precipMmH ?? 0) >= 2.5 ? 1 : m.foehn ? 2 : (m.precipMmH ?? 0) >= 0.1 ? 3 : 5,
      precip: m.precipMmH ?? 0,
      precipType: m.precipType,
      precipSource: m.precipSource ?? '',
      windSpeed: m.windSpeedMps ?? 0,
      windDir: m.windDirectionDeg ?? 0,
      windRel: m.windRel ?? 'cross',
      temp: m.temperatureC ?? null,
      uv: m.uvIndex ?? null,
      warn: m.hasWarning ? 1 : 0,
      warnEvent: m.warningEvent ?? '',
      foehn: m.foehn ? 1 : 0,
      km: m.distM / 1000,
      eta: m.etaMs,
    })),
  };
}

function syncSource(map: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  src?.setData(data);
}

// --- Wetter-Zustands-Icons für die Karte (Canvas → Map-Image) ---------------
type CondKind = 'sun' | 'partly' | 'cloudy' | 'rain' | 'heavy' | 'snow';
const CONDITION_KINDS: CondKind[] = ['sun', 'partly', 'cloudy', 'rain', 'heavy', 'snow'];

/** Klassifiziert Bewölkung + Niederschlag in ein Zustands-Icon (wie Wetter-Strip). */
function conditionFor(cloudPct: number | null, precip: number | null, ptype: string): CondKind {
  if (precip != null && precip >= 0.1) {
    if (ptype === 'snow') return 'snow';
    return precip >= 2.5 ? 'heavy' : 'rain';
  }
  const c = cloudPct ?? 0;
  if (c < 25) return 'sun';
  if (c < 65) return 'partly';
  return 'cloudy';
}

/** Zeichnet ein Zustands-Icon (weißer Kreis + Glyph) als ImageData (88×88 @2×). */
function makeCondImage(kind: CondKind): ImageData | null {
  if (typeof document === 'undefined') return null;
  const S = 88;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d'); if (!ctx) return null;
  const TAU = Math.PI * 2;
  // Hintergrund-Scheibe.
  ctx.beginPath(); ctx.arc(44, 44, 39, 0, TAU);
  ctx.fillStyle = '#FAF6EA'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#E0D6BE'; ctx.stroke();

  const sun = (x: number, y: number, r: number) => {
    ctx.fillStyle = '#C97B47'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#C97B47'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4)); ctx.lineTo(x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9)); ctx.stroke(); }
  };
  const cloud = (x: number, y: number, s: number, col: string) => {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.arc(x - 10 * s, y + 2 * s, 7 * s, 0, TAU);
    ctx.arc(x + 1 * s, y - 6 * s, 9 * s, 0, TAU);
    ctx.arc(x + 12 * s, y + 1 * s, 7 * s, 0, TAU);
    ctx.rect(x - 10 * s, y - 2 * s, 22 * s, 6 * s);
    ctx.fill();
  };
  const rain = (x: number, y: number, n: number, col: string, w: number) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) { const rx = x - 11 + i * (22 / (n - 1)); ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx - 2.5, y + 10); ctx.stroke(); }
  };
  switch (kind) {
    case 'sun': sun(44, 44, 13); break;
    case 'partly': sun(35, 36, 8.5); cloud(50, 50, 1.05, '#9AA7B5'); break;
    case 'cloudy': cloud(44, 46, 1.3, '#9AA7B5'); break;
    case 'rain': cloud(44, 39, 1.18, '#9AA7B5'); rain(44, 55, 3, '#3A6FA8', 2.6); break;
    case 'heavy': cloud(44, 39, 1.18, '#7E8C9B'); rain(44, 55, 4, '#2a5d8f', 3.2); break;
    case 'snow': cloud(44, 39, 1.18, '#9AA7B5'); ctx.fillStyle = '#9ab8cf'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(35 + i * 9, 57, 2, 0, TAU); ctx.fill(); } break;
  }
  return ctx.getImageData(0, 0, S, S);
}

/**
 * Bearing-relative Wind-Pfeil-Farben (Mockup route-03): grün = Rücken,
 * terracotta = Seite, rot = Gegen. Schlüssel = WeatherMarker.windRel.
 */
const WIND_REL_COLORS: Record<string, string> = { tail: '#5e8048', cross: '#C97B47', head: '#A8431F' };

/** Erzeugt ein nach oben (Norden) zeigendes Pfeil-Icon als ImageData (48×48 @2×). */
function makeArrowImage(color = '#4f627e'): ImageData | null {
  if (typeof document === 'undefined') return null;
  const S = 48;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.translate(S / 2, S / 2);
  ctx.beginPath();
  ctx.moveTo(0, -18);          // Spitze oben
  ctx.lineTo(11, 14);
  ctx.lineTo(0, 7);            // Einkerbung
  ctx.lineTo(-11, 14);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  return ctx.getImageData(0, 0, S, S);
}

/** Feine Line-Icons als Inline-SVG-String fürs Karten-Popup (currentColor, erbt Ink). */
const WX_ICONS: Record<string, string> = {
  temp: '<path d="M10 13.7V5a2 2 0 0 1 4 0v8.7a3.6 3.6 0 1 1-4 0Z"/><circle cx="12" cy="16.6" r="1.2" fill="currentColor" stroke="none"/>',
  drop: '<path d="M12 3.5c-3.2 4.3-5 6.5-5 9.3a5 5 0 0 0 10 0c0-2.8-1.8-5-5-9.3Z"/>',
  wind: '<path d="M3 9h9.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 14h12a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 19h6.5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5Z"/>',
  sun: '<circle cx="12" cy="12" r="4.3"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
  warning: '<path d="M12 3.5l9 15.5H3Z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none"/>',
};
function wxIco(name: string): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${WX_ICONS[name]}</svg>`;
}

function weatherPopupHtml(p: Record<string, unknown>): string {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const km = num(p.km);
  const eta = num(p.eta);
  const temp = num(p.temp);
  const precip = num(p.precip);
  const wind = num(p.windSpeed);
  const uv = num(p.uv);
  const rows: string[] = [];
  if (km != null) rows.push(`<strong>km ${km.toFixed(1).replace('.', ',')}</strong>`);
  if (eta != null) rows.push(new Date(eta).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr');
  const head = rows.join(' · ');
  const lines: Array<{ icon: string; text: string }> = [];
  if (temp != null) lines.push({ icon: 'temp', text: `${temp.toFixed(1).replace('.', ',')} °C` });
  if (precip != null && precip > 0.05) {
    const pt = String(p.precipType);
    const label = pt === 'snow' ? 'Schnee' : pt === 'sleet' ? 'Schneeregen' : 'Regen';
    const src = p.precipSource === 'radar' ? ' (Radar)' : '';
    lines.push({ icon: 'drop', text: `${precip.toFixed(1).replace('.', ',')} mm/h ${label}${src}` });
  }
  if (wind != null && wind > 0) {
    const dir = num(p.windDir) ?? 0;
    lines.push({ icon: 'compass', text: `${wind.toFixed(1).replace('.', ',')} m/s aus ${Math.round(dir)}°` });
  }
  if (uv != null && uv > 0) lines.push({ icon: 'sun', text: `UV ${uv.toFixed(1).replace('.', ',')}` });
  if (p.foehn === 1) lines.push({ icon: 'wind', text: 'Föhn-Lage (heuristisch)' });
  if (p.warn === 1) lines.push({ icon: 'warning', text: String(p.warnEvent || 'Warnung aktiv') });
  const body = lines.map((l) => `<div class="wx-popup-row">${wxIco(l.icon)}<span>${l.text}</span></div>`).join('');
  return `<div class="wx-popup"><div class="wx-popup-head">${head}</div>${body}</div>`;
}
