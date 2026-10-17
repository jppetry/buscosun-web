/**
 * Spot-Dossier — satellite excerpt of the spot: Esri World Imagery (the Brandradar's satellite basemap), not
 * interactive, with the spot, its shore normal, the nearest DWD station and the chosen BSH gauge. Click ⇒ map stage.
 *
 * Deliberately NOT a second `SeaMap` (field, arrows, areas, gauges — one data path); this one has a single GeoJSON
 * source built from the spot catalogue, no weather data.
 */
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

export interface SeaMiniMapProps {
  spot: { id: string; name: string; lat: number; lon: number; normal: number; station: { name: string; lat: number; lon: number; km: number } | null };
  gauge: { name: string; lat: number; lon: number } | null;
  height: number;
  onClick?: () => void;
  ariaLabel: string;
}

const SRC = 'sea-mini';
const SPOT = '#0F6E7A'; // --sw-accent
const STATION = '#5F7A4C'; // measured green
const GAUGE = '#2C2A26'; // ink (BSH gauge, like the water-level chart's measurement colour)

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { base: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri World Imagery' } },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
};

/** Point `km` kilometres from (lat, lon) towards `bearing` (degrees, clockwise from north) — for the shore normal. */
function offset(lat: number, lon: number, bearing: number, km: number): [number, number] {
  const b = (bearing * Math.PI) / 180;
  const dLat = (km / 111.32) * Math.cos(b);
  const dLon = (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(b);
  return [lon + dLon, lat + dLat];
}

function features(p: SeaMiniMapProps): GeoJSON.FeatureCollection {
  const s = p.spot;
  const f: GeoJSON.Feature[] = [
    { type: 'Feature', properties: { kind: 'normal' }, geometry: { type: 'LineString', coordinates: [[s.lon, s.lat], offset(s.lat, s.lon, s.normal, 1.2)] } },
    { type: 'Feature', properties: { kind: 'spot', name: s.name }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } },
  ];
  if (s.station) f.push({ type: 'Feature', properties: { kind: 'station', name: `Station ${s.station.name.charAt(0)}${s.station.name.slice(1).toLowerCase()}` }, geometry: { type: 'Point', coordinates: [s.station.lon, s.station.lat] } });
  if (p.gauge) f.push({ type: 'Feature', properties: { kind: 'gauge', name: `Pegel ${p.gauge.name}` }, geometry: { type: 'Point', coordinates: [p.gauge.lon, p.gauge.lat] } });
  return { type: 'FeatureCollection', features: f };
}

/** Bounds around the spot (≥ ±2.5 km) that also hold station and gauge when they are within ~25 km. */
function bounds(p: SeaMiniMapProps): [number, number, number, number] {
  const s = p.spot;
  const pts: Array<[number, number]> = [[s.lon, s.lat], offset(s.lat, s.lon, 0, 2.5), offset(s.lat, s.lon, 90, 2.5), offset(s.lat, s.lon, 180, 2.5), offset(s.lat, s.lon, 270, 2.5)];
  const near = (lat: number, lon: number) => Math.hypot((lat - s.lat) * 111.32, (lon - s.lon) * 111.32 * Math.cos((s.lat * Math.PI) / 180)) <= 25;
  if (s.station && near(s.station.lat, s.station.lon)) pts.push([s.station.lon, s.station.lat]);
  if (p.gauge && near(p.gauge.lat, p.gauge.lon)) pts.push([p.gauge.lon, p.gauge.lat]);
  const lons = pts.map((x) => x[0]), lats = pts.map((x) => x[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export default function SeaMiniMap(p: SeaMiniMapProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef(features(p));
  dataRef.current = features(p);
  const boundsRef = useRef(bounds(p));
  boundsRef.current = bounds(p);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = new maplibregl.Map({ container: el, interactive: false, attributionControl: { compact: true }, style: STYLE, center: [p.spot.lon, p.spot.lat], zoom: 11 });
    mapRef.current = map;
    map.on('style.load', () => {
      if (map.getSource(SRC)) return;
      map.addSource(SRC, { type: 'geojson', data: dataRef.current });
      map.addLayer({ id: `${SRC}-normal`, type: 'line', source: SRC, filter: ['==', ['get', 'kind'], 'normal'], paint: { 'line-color': '#FAF6EA', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      map.addLayer({ id: `${SRC}-pts`, type: 'circle', source: SRC, filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': ['case', ['==', ['get', 'kind'], 'spot'], 7, 5], 'circle-color': ['match', ['get', 'kind'], 'spot', SPOT, 'station', STATION, GAUGE], 'circle-stroke-color': '#FAF6EA', 'circle-stroke-width': 2 } });
      map.addLayer({ id: `${SRC}-lab`, type: 'symbol', source: SRC, filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': false },
        paint: { 'text-color': '#FAF6EA', 'text-halo-color': 'rgba(11,14,18,0.85)', 'text-halo-width': 1.4 } });
      map.fitBounds(boundsRef.current, { padding: 30, maxZoom: 13, duration: 0 });
    });
    map.once('load', () => {
      map.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]').forEach((d) => d.removeAttribute('open'));
    });
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (!map || !src) return;
    src.setData(dataRef.current);
    map.fitBounds(boundsRef.current, { padding: 30, maxZoom: 13, duration: 0 });
  }, [p.spot.id, p.gauge?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { mapRef.current?.resize(); }, [p.height]);

  return (
    <div className="sw-minimap" style={{ height: p.height }} role={p.onClick ? 'button' : undefined} tabIndex={p.onClick ? 0 : undefined} aria-label={p.ariaLabel}
      onClick={p.onClick} onKeyDown={p.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onClick!(); } } : undefined}>
      <div ref={elRef} className="sw-minimap-canvas" />
    </div>
  );
}
