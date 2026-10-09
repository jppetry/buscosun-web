/**
 * Phase SK: the cap on any MapLibre map — `image` source + `raster` (cap, band hatch), `line` ×2 (white casing, snowline
 * blue) and `symbol` (label along the line). Standard layers only: no shader, no WebGL change. Re-inserted after a style
 * change. 2D: below the radar layers (the radar stays readable); 3D (ZT stage): before `zt-cone`, above the radar picture.
 * Lives in the lazy chunk (with the engine).
 */
import maplibreglValue from 'maplibre-gl';
import type maplibregl from 'maplibre-gl';
import type { CapResult } from './capRaster';
import { SK_LINE_COLOR } from './snowCapModel';

const EMPTY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export class SnowCapLayer {
  private url = EMPTY_PNG;
  private corners: CapResult['corners'] = [[5.5, 55.5], [17.5, 55.5], [17.5, 45.5], [5.5, 45.5]];
  private lines: GeoJSON.FeatureCollection = EMPTY_FC;
  private visible = false;
  private readonly ids: { img: string; lineSrc: string; casing: string; line: string; label: string };
  private readonly onStyle = () => this.ensure();
  private readonly map: maplibregl.Map;
  private readonly opts: { beforeId: () => string | undefined; prefix?: string };

  constructor(map: maplibregl.Map, opts: { beforeId: () => string | undefined; prefix?: string }) {
    this.map = map;
    this.opts = opts;
    const p = opts.prefix ?? 'sk';
    this.ids = { img: `${p}-cap`, lineSrc: `${p}-line-src`, casing: `${p}-line-casing`, line: `${p}-line`, label: `${p}-label` };
    map.on('styledata', this.onStyle);
  }

  /** ZT removes its stage map right after `onStageReady(null)` — a build finishing later must not touch it. */
  private gone(): boolean { return !!(this.map as unknown as { _removed?: boolean })._removed; }

  private ensure(): void {
    const m = this.map;
    if (this.gone()) return;
    if (!m.isStyleLoaded?.() && !m.getStyle()) return;
    try {
      const vis = this.visible ? 'visible' : 'none';
      const before = this.opts.beforeId();
      const { img, lineSrc, casing, line, label } = this.ids;
      if (!m.getSource(img)) m.addSource(img, { type: 'image', url: this.url, coordinates: this.corners });
      if (!m.getLayer(img)) m.addLayer({ id: img, type: 'raster', source: img, layout: { visibility: vis }, paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, before);
      if (!m.getSource(lineSrc)) m.addSource(lineSrc, { type: 'geojson', data: this.lines });
      if (!m.getLayer(casing)) m.addLayer({ id: casing, type: 'line', source: lineSrc, filter: ['==', ['geometry-type'], 'LineString'], layout: { visibility: vis, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.6, 10, 4], 'line-opacity': 0.9 } }, before);
      if (!m.getLayer(line)) m.addLayer({ id: line, type: 'line', source: lineSrc, filter: ['==', ['geometry-type'], 'LineString'], layout: { visibility: vis, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': SK_LINE_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 10, 2] } }, before);
      if (!m.getLayer(label)) {
        m.addLayer({
          id: label, type: 'symbol', source: lineSrc, filter: ['==', ['geometry-type'], 'Point'],
          layout: { visibility: vis, 'symbol-placement': 'point', 'text-field': ['get', 'label'], 'text-size': 11.5, 'text-font': ['Noto Sans Regular'], 'text-anchor': 'bottom', 'text-offset': [0, -0.4], 'text-max-width': 40, 'text-padding': 6, 'text-allow-overlap': false },
          paint: { 'text-color': '#3E4C9A', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.8 },
        });
      }
    } catch { /* style loading — the next `styledata` re-inserts */ }
  }

  private all(): string[] { const i = this.ids; return [i.img, i.casing, i.line, i.label]; }

  setVisible(on: boolean): void {
    this.visible = on;
    this.ensure();
    for (const id of this.all()) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }

  private seq = 0;
  private objectUrl: string | null = null;

  /** New image + line. The PNG is encoded asynchronously (`toBlob`) — `toDataURL` blocked the main thread up to 1024². */
  setData(r: Pick<CapResult, 'rgba' | 'width' | 'height' | 'corners' | 'lines'> | null): void {
    if (this.gone()) return;
    const seq = ++this.seq;
    if (!r) { this.apply(seq, EMPTY_PNG, this.corners, EMPTY_FC); return; }
    const c = document.createElement('canvas');
    c.width = r.width; c.height = r.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(r.rgba as unknown as Uint8ClampedArray<ArrayBuffer>, r.width, r.height), 0, 0);
    c.toBlob((blob) => {
      if (!blob || seq !== this.seq || this.gone()) return; // a newer image is on its way, or the map is gone
      const url = URL.createObjectURL(blob);
      this.apply(seq, url, r.corners, r.lines);
    }, 'image/png');
  }

  private apply(seq: number, url: string, corners: CapResult['corners'], lines: GeoJSON.FeatureCollection): void {
    if (seq !== this.seq || this.gone()) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return; }
    const prevUrl = this.objectUrl;
    this.url = url; this.corners = corners; this.lines = lines;
    this.objectUrl = url.startsWith('blob:') ? url : null;
    try {
      this.ensure();
      // The layer may have been inserted before its anchor existed (e.g. the radar layer of the 2D map) — re-anchor on every
      // new image, not on `styledata` (moveLayer itself fires `styledata`).
      const before = this.opts.beforeId();
      if (before && before !== this.ids.img && this.map.getLayer(before)) {
        for (const id of [this.ids.img, this.ids.casing, this.ids.line]) if (this.map.getLayer(id)) this.map.moveLayer(id, before);
      }
      (this.map.getSource(this.ids.img) as maplibregl.ImageSource | undefined)?.updateImage({ url: this.url, coordinates: this.corners });
      (this.map.getSource(this.ids.lineSrc) as maplibregl.GeoJSONSource | undefined)?.setData(this.lines);
    } catch { /* style changing or map gone */ }
    // The image source has its own copy once loaded; revoke the previous blob a moment later.
    if (prevUrl && prevUrl !== url) setTimeout(() => URL.revokeObjectURL(prevUrl), 2000);
  }

  remove(): void {
    this.seq++;
    if (this.objectUrl) { const u = this.objectUrl; this.objectUrl = null; setTimeout(() => URL.revokeObjectURL(u), 2000); }
    this.map.off('styledata', this.onStyle);
    if (this.gone()) return;
    try {
      for (const id of [...this.all()].reverse()) if (this.map.getLayer(id)) this.map.removeLayer(id);
      for (const id of [this.ids.img, this.ids.lineSrc]) if (this.map.getSource(id)) this.map.removeSource(id);
    } catch { /* map already gone */ }
  }
}

/** Phase SK: the 3D tap card (one at a time per map). */
export function openSnowTap(map: maplibregl.Map, lngLat: { lng: number; lat: number }, html: string, prev: maplibregl.Popup | null): maplibregl.Popup {
  prev?.remove();
  return new maplibreglValue.Popup({ closeButton: true, maxWidth: '260px', className: 'sk-popup' }).setLngLat(lngLat).setHTML(html).addTo(map);
}
