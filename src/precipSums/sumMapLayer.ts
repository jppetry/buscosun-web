/**
 * Phase NS: die Summen-Karte auf der MapLibre-Karte des Regenradars — eine `image`-Source (Mercator-Zeilen, `sumGrid.ts`)
 * und die Stationssummen als Kreise. Nur Standard-Ebenen von MapLibre (raster, circle): kein Shader, kein WebGL-Eingriff.
 *
 * Die Ebenen liegen unter der ersten Beschriftungsebene des Stils; nach einem Stilwechsel werden sie neu eingehängt.
 */
import type maplibregl from 'maplibre-gl';
import { SUM_IMAGE_CORNERS } from './sumGrid';
import { sumCss } from './sumModel';
import type { StationSumPoint } from './obsWindowSum';

const SRC_IMG = 'ns-sum-img';
const LYR_IMG = 'ns-sum-img';
const SRC_ST = 'ns-sum-st';
const LYR_ST = 'ns-sum-st';
const EMPTY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function firstSymbolId(map: maplibregl.Map): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
}

export class SumMapLayer {
  private url: string = EMPTY_PNG;
  private stations: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  private visible = false;
  private readonly onStyle = () => this.ensure();

  constructor(private readonly map: maplibregl.Map) {
    map.on('styledata', this.onStyle);
  }

  private ensure(): void {
    const m = this.map;
    if (!m.isStyleLoaded?.() && !m.getStyle()) return;
    try {
      if (!m.getSource(SRC_IMG)) m.addSource(SRC_IMG, { type: 'image', url: this.url, coordinates: SUM_IMAGE_CORNERS });
      if (!m.getLayer(LYR_IMG)) {
        m.addLayer({ id: LYR_IMG, type: 'raster', source: SRC_IMG, paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 }, layout: { visibility: this.visible ? 'visible' : 'none' } }, firstSymbolId(m));
      }
      if (!m.getSource(SRC_ST)) m.addSource(SRC_ST, { type: 'geojson', data: this.stations });
      if (!m.getLayer(LYR_ST)) {
        m.addLayer({
          id: LYR_ST, type: 'circle', source: SRC_ST,
          layout: { visibility: this.visible ? 'visible' : 'none' },
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 8, 5, 11, 7],
            'circle-color': ['get', 'c'],
            'circle-stroke-color': '#2A2520',
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 1.2],
            'circle-stroke-opacity': 0.75,
          },
        }, firstSymbolId(m));
      }
    } catch { /* Stil lädt gerade — der nächste `styledata` hängt neu ein */ }
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.ensure();
    for (const id of [LYR_IMG, LYR_ST]) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }

  setImage(rgba: { data: Uint8ClampedArray; width: number; height: number } | null): void {
    if (!rgba) { this.url = EMPTY_PNG; }
    else {
      const c = document.createElement('canvas');
      c.width = rgba.width; c.height = rgba.height;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.putImageData(new ImageData(rgba.data as unknown as Uint8ClampedArray<ArrayBuffer>, rgba.width, rgba.height), 0, 0);
      this.url = c.toDataURL('image/png');
    }
    this.ensure();
    const src = this.map.getSource(SRC_IMG) as maplibregl.ImageSource | undefined;
    src?.updateImage({ url: this.url, coordinates: SUM_IMAGE_CORNERS });
  }

  setStations(points: readonly StationSumPoint[] | null): void {
    this.stations = {
      type: 'FeatureCollection',
      features: (points ?? []).map((p) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        // Gemessen trocken (0 mm) ist ein Wert: weißer Kreis statt durchsichtig.
        properties: { id: p.id, name: p.name, mm: p.mm, c: p.mm >= 0.1 ? sumCss(p.mm) : '#FBF8F1' },
      })),
    };
    this.ensure();
    const src = this.map.getSource(SRC_ST) as maplibregl.GeoJSONSource | undefined;
    src?.setData(this.stations);
  }

  remove(): void {
    this.map.off('styledata', this.onStyle);
    try {
      for (const id of [LYR_ST, LYR_IMG]) if (this.map.getLayer(id)) this.map.removeLayer(id);
      for (const id of [SRC_ST, SRC_IMG]) if (this.map.getSource(id)) this.map.removeSource(id);
    } catch { /* Karte schon abgebaut */ }
  }
}
