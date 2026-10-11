/**
 * GL-4 — Map of the glacier sheet: the glacier's outline (newest level), the earlier outline dashed, the snow zone of the newest clear scene as a
 * pixel image (white above the satellite snow line, ice blue below), a compare slider (earlier outline on one side of the divider, the current one on the
 * other) and the 3D view: the SAME map with Terrarium terrain (`setTerrain`) and a tilted camera — built-in MapLibre means, no shader, no custom layer.
 * `view = '3d'` falls back to 2D when WebGL terrain cannot be set up (`?gl3d=0` forces 2D in the page).
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GlacierCatalogEntry } from './glacierContract';
import type { GlacierDemGrid } from './glacierSatContract';
import { bboxOf, clipAtLng, renderSnowZoneAsync } from './glacierGeo';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
export const SHEET_EXAGGERATION = 1.3;
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const feat = (g: GeoJSON.Geometry | null): GeoJSON.FeatureCollection => (g ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] } : EMPTY);

export interface SheetSnow { sla: number; lo: number | null; hi: number | null; state: 0 | 1 | 2; date: string }
interface Props {
  g: GlacierCatalogEntry;
  geometry: GeoJSON.Geometry | null;
  earlier: { year: number; geometry: GeoJSON.Geometry } | null;
  showEarlier: boolean;
  snow: SheetSnow | null;
  showSnow: boolean;
  dem: GlacierDemGrid | null;
  view: '2d' | '3d';
  /** Divider position as a share of the map width (0–1); `null` = compare off. */
  compare: number | null;
  onCompare: (v: number) => void;
  onSnowShare?: (share: number | null) => void;
  onMap?: (m: maplibregl.Map | null) => void;
  onView3dFailed?: () => void;
}

export default function GlacierSheetMap({ g, geometry, earlier, showEarlier, snow, showSnow, dem, view, compare, onCompare, onSnowShare, onMap, onView3dFailed }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const latest = useRef({ geometry, earlier, showEarlier, snow, showSnow, dem, view, compare });
  latest.current = { geometry, earlier, showEarlier, snow, showSnow, dem, view, compare };
  const [dividerPx, setDividerPx] = useState<number | null>(null);
  const raf = useRef(0);

  /** Snow-zone image from the grid; re-made when the scene, the grid or the geometry change. */
  const snowGen = useRef(0);
  const applySnow = async () => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const gen = ++snowGen.current;
    const { geometry: geo, snow: sn, showSnow: on, dem: grid } = latest.current;
    const src = map.getSource('gls-snow') as maplibregl.ImageSource | undefined;
    const lay = map.getLayer('gls-snow-img');
    if (!src || !lay) return;
    if (!on || !sn || !grid || !geo) { map.setLayoutProperty('gls-snow-img', 'visibility', 'none'); onSnowShare?.(null); return; }
    const sla = sn.state === 0 ? -1e9 : sn.state === 2 ? 1e9 : sn.sla;
    const zone = await renderSnowZoneAsync({ geometry: geo, grid, sla, lo: sn.state === 1 ? sn.lo : null, hi: sn.state === 1 ? sn.hi : null }, () => snowGen.current === gen && mapRef.current === map);
    if (snowGen.current !== gen || mapRef.current !== map) return;   // a newer scene or another glacier took over
    if (!zone) { map.setLayoutProperty('gls-snow-img', 'visibility', 'none'); onSnowShare?.(null); return; }
    const c = document.createElement('canvas');
    c.width = zone.width; c.height = zone.height;
    c.getContext('2d')!.putImageData(new ImageData(zone.data, zone.width, zone.height), 0, 0);
    src.updateImage({ url: c.toDataURL('image/png'), coordinates: zone.coordinates });
    map.setLayoutProperty('gls-snow-img', 'visibility', 'visible');
    onSnowShare?.(zone.snowShare);
  };

  /** Fill data of the two outlines: whole, or split at the divider. */
  const applyOutlines = () => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const { geometry: geo, earlier: ear, showEarlier: showE, compare: cmp } = latest.current;
    (map.getSource('gls-now') as maplibregl.GeoJSONSource | undefined)?.setData(feat(geo));
    (map.getSource('gls-earlier-line') as maplibregl.GeoJSONSource | undefined)?.setData(feat(ear && (showE || cmp != null) ? ear.geometry : null));
    let nowFill: GeoJSON.Geometry | null = geo, earFill: GeoJSON.Geometry | null = null;
    if (cmp != null && geo && ear) {
      const w = map.getContainer().clientWidth || 1, h = map.getContainer().clientHeight || 1;
      const lng = map.unproject([cmp * w, h / 2]).lng;
      earFill = clipAtLng(ear.geometry, lng, 'west');
      nowFill = clipAtLng(geo, lng, 'east');
    } else if (showE && ear) earFill = ear.geometry;
    (map.getSource('gls-now-fill') as maplibregl.GeoJSONSource | undefined)?.setData(feat(nowFill));
    (map.getSource('gls-earlier-fill') as maplibregl.GeoJSONSource | undefined)?.setData(feat(earFill));
  };

  const fit = (animate: boolean) => {
    const map = mapRef.current;
    const bb = latest.current.geometry ? bboxOf(latest.current.geometry) : null;
    if (!map) return;
    if (bb) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 48, maxZoom: 15, duration: animate ? 600 : 0 });
    else map.easeTo({ center: [g.lon, g.lat], zoom: g.klass === 'A' ? 13 : 14, duration: animate ? 600 : 0 });
  };

  const apply3d = (on: boolean) => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    try {
      if (on) {
        map.setTerrain({ source: 'gls-dem', exaggeration: SHEET_EXAGGERATION });
        map.setLayoutProperty('gls-hill', 'visibility', 'visible');
        map.easeTo({ pitch: 62, bearing: -20, duration: 700 });
      } else {
        map.setTerrain(null);
        map.setLayoutProperty('gls-hill', 'visibility', 'none');
        map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
      }
    } catch { onView3dFailed?.(); }
  };

  useEffect(() => {
    if (!box.current) return;
    const bb = geometry ? bboxOf(geometry) : null;
    const map = new maplibregl.Map({
      container: box.current, style: STYLE, attributionControl: { compact: true }, maxPitch: 75, dragRotate: true, maxZoom: 16, minZoom: 8,
      ...(bb ? { bounds: [[bb[0], bb[1]], [bb[2], bb[3]]] as [[number, number], [number, number]], fitBoundsOptions: { padding: 48, maxZoom: 15 } } : { center: [g.lon, g.lat] as [number, number], zoom: 13 }),
    });
    mapRef.current = map;
    onMap?.(map);
    map.on('load', () => {
      if (mapRef.current !== map) return;
      map.addSource('gls-dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      map.addLayer({ id: 'gls-hill', type: 'hillshade', source: 'gls-dem', layout: { visibility: 'none' }, paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#4A4234', 'hillshade-accent-color': '#6B5A45', 'hillshade-illumination-anchor': 'map', 'hillshade-illumination-direction': 315 } });
      for (const id of ['gls-now', 'gls-now-fill', 'gls-earlier-fill', 'gls-earlier-line']) map.addSource(id, { type: 'geojson', data: EMPTY });
      const c0 = bb ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : [g.lon, g.lat];
      const d = 0.002;
      map.addSource('gls-snow', { type: 'image', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', coordinates: [[c0[0] - d, c0[1] + d], [c0[0] + d, c0[1] + d], [c0[0] + d, c0[1] - d], [c0[0] - d, c0[1] - d]] });
      map.addLayer({ id: 'gls-snow-img', type: 'raster', source: 'gls-snow', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } });
      map.addLayer({ id: 'gls-earlier-fill-l', type: 'fill', source: 'gls-earlier-fill', paint: { 'fill-color': '#D9CFB5', 'fill-opacity': 0.62 } });
      map.addLayer({ id: 'gls-now-fill-l', type: 'fill', source: 'gls-now-fill', paint: { 'fill-color': '#7FC1D6', 'fill-opacity': 0.16 } });
      map.addLayer({ id: 'gls-earlier-line-l', type: 'line', source: 'gls-earlier-line', paint: { 'line-color': '#145A70', 'line-width': 1.6, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } });
      map.addLayer({ id: 'gls-now-line-l', type: 'line', source: 'gls-now', paint: { 'line-color': '#145A70', 'line-width': 2.4 } });
      ready.current = true;
      applyOutlines(); void applySnow();
      if (latest.current.view === '3d') apply3d(true);
    });
    const onMove = () => { if (latest.current.compare != null) { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(applyOutlines); } };
    map.on('move', onMove);
    return () => { cancelAnimationFrame(raf.current); ready.current = false; onMap?.(null); map.remove(); if (mapRef.current === map) mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { applyOutlines(); if (geometry) fit(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, earlier, showEarlier]);
  useEffect(() => { void applySnow(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snow, showSnow, dem, geometry]);
  useEffect(() => { apply3d(view === '3d'); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  useEffect(() => { applyOutlines(); const w = box.current?.clientWidth ?? 0; setDividerPx(compare == null ? null : compare * w); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare]);

  // the divider is dragged with the pointer (mouse and touch), moved with the arrow keys
  const drag = useRef(false);
  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    onCompare(Math.min(0.97, Math.max(0.03, (clientX - r.left) / r.width)));
  };

  return (
    <div className="gl-sheet-map-wrap">
      <div ref={box} className="gl-map-canvas" role="img" aria-label={`Karte des Gletschers ${g.name ?? g.id}${view === '3d' ? ', 3D-Ansicht' : ''}`} />
      {compare != null && dividerPx != null && (
        <div className="gl-divider" style={{ left: `${compare * 100}%` }}>
          <button type="button" className="gl-divider-handle" role="slider" aria-label="Vergleichsregler: früherer Umriss links, heutiger rechts" aria-valuemin={3} aria-valuemax={97} aria-valuenow={Math.round(compare * 100)}
            onPointerDown={(e) => { drag.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { if (drag.current) move(e.clientX); }}
            onPointerUp={(e) => { drag.current = false; (e.target as HTMLElement).releasePointerCapture(e.pointerId); }}
            onKeyDown={(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); onCompare(Math.max(0.03, compare - 0.03)); } else if (e.key === 'ArrowRight') { e.preventDefault(); onCompare(Math.min(0.97, compare + 0.03)); } }}>
            <span aria-hidden="true">⇆</span>
          </button>
        </div>
      )}
    </div>
  );
}
