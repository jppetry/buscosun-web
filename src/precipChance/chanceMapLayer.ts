/**
 * Phase RC: die Chance-Karte auf der MapLibre-Karte des Regenradars — Prognose-Stil statt gefüllter Radarfläche:
 *   · Punktraster: je Band (≥ 10 / 30 / 50 / 70 / 90 %) eine `fill`-Ebene mit `fill-pattern`; jedes Muster trägt nur die
 *     ZUSÄTZLICHEN Punkte einer Bayer-Matrix (`bandDotCells`) — übereinander ergibt das die Dichte des Bands. Die Muster sind
 *     Bildschirm-Pixel ⇒ bei jedem Zoom gleich fein.
 *   · Lücken: `fill-pattern` mit Schraffur.
 *   · Konturen 30 / 50 / 70 / 90 %: dünne `line`, Beschriftung `symbol` entlang der Linie.
 * Nur Standard-Ebenen von MapLibre — kein Shader, kein WebGL-Eingriff. Nach einem Stilwechsel wird neu eingehängt.
 */
import type maplibregl from 'maplibre-gl';
import { CHANCE_BANDS, bandDotCells } from './chanceModel';

const SRC_BANDS = 'rc-bands', SRC_MISS = 'rc-miss', SRC_LINES = 'rc-lines';
const LYR_MISS = 'rc-miss', LYR_LINE = 'rc-line', LYR_LABEL = 'rc-label';
const lyrBand = (k: number) => `rc-band-${k}`;
const imgBand = (k: number) => `rc-dots-${k}`;
const IMG_HATCH = 'rc-hatch';

/**
 * Farben für das dunkle Radarfeld der Karte (`basemap-dim` der Wetterkarte: Ink #2C2A26 zu 80 % über der Grundkarte, immer
 * an): helle Stahlblau-Punkte, Sand-Linien, Sand-Beschriftung mit Ink-Rand — keine Farbe der Intensitäts-Rampe.
 */
export const CHANCE_DOT_RGB: readonly [number, number, number] = [176, 208, 238];
const LINE_COLOR = '#F3EBD6';
const LABEL_HALO = 'rgba(44,42,38,0.92)';
/** Rasterweite in CSS-Pixeln, Punktradius, Auflösung der Musterbilder. */
const PITCH = 5, DOT_R = 1.05, PR = 2;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function firstSymbolId(map: maplibregl.Map): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === 'symbol' && !l.id.startsWith('rc-'))?.id;
}

/** Musterbild eines Bands: 8 × 8 Rasterzellen, Punkte nur in den Zellen des Bands. */
export function dotPatternRgba(k: number): { width: number; height: number; data: Uint8Array } {
  const size = 8 * PITCH * PR;
  const data = new Uint8Array(size * size * 4);
  const r = DOT_R * PR;
  for (const cell of bandDotCells(k)) {
    const cx = ((cell % 8) + 0.5) * PITCH * PR, cy = (Math.floor(cell / 8) + 0.5) * PITCH * PR;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        // weicher Rand: Abdeckung des Pixels gegen den Kreis
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const a = Math.max(0, Math.min(1, r + 0.5 - d));
        if (a <= 0) continue;
        const o = (y * size + x) * 4;
        data[o] = CHANCE_DOT_RGB[0]; data[o + 1] = CHANCE_DOT_RGB[1]; data[o + 2] = CHANCE_DOT_RGB[2];
        data[o + 3] = Math.max(data[o + 3], Math.round(235 * a));
      }
    }
  }
  return { width: size, height: size, data };
}

/** Schraffur für „keine Daten": helle Sand-Diagonale + leichter Schleier (lesbar auf dem dunklen Radarfeld). */
export function hatchPatternRgba(): { width: number; height: number; data: Uint8Array } {
  const size = 6 * PR;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4;
    const line = (x + y) % size < PR;
    data[o] = 224; data[o + 1] = 214; data[o + 2] = 190; data[o + 3] = line ? 150 : 28;
  }
  return { width: size, height: size, data };
}

export class ChanceMapLayer {
  private bands: GeoJSON.FeatureCollection = EMPTY;
  private missing: GeoJSON.FeatureCollection = EMPTY;
  private lines: GeoJSON.FeatureCollection = EMPTY;
  private visible = false;
  private readonly onStyle = () => this.ensure();

  private readonly map: maplibregl.Map;

  constructor(map: maplibregl.Map) {
    this.map = map;
    map.on('styledata', this.onStyle);
  }

  private ensureImages(): void {
    const m = this.map;
    CHANCE_BANDS.forEach((_, k) => { if (!m.hasImage(imgBand(k))) m.addImage(imgBand(k), dotPatternRgba(k), { pixelRatio: PR }); });
    if (!m.hasImage(IMG_HATCH)) m.addImage(IMG_HATCH, hatchPatternRgba(), { pixelRatio: PR });
  }

  private ensure(): void {
    const m = this.map;
    if (!m.isStyleLoaded?.() && !m.getStyle()) return;
    try {
      this.ensureImages();
      const vis = this.visible ? 'visible' : 'none';
      const before = firstSymbolId(m);
      if (!m.getSource(SRC_BANDS)) m.addSource(SRC_BANDS, { type: 'geojson', data: this.bands });
      if (!m.getSource(SRC_MISS)) m.addSource(SRC_MISS, { type: 'geojson', data: this.missing });
      if (!m.getSource(SRC_LINES)) m.addSource(SRC_LINES, { type: 'geojson', data: this.lines });
      if (!m.getLayer(LYR_MISS)) m.addLayer({ id: LYR_MISS, type: 'fill', source: SRC_MISS, layout: { visibility: vis }, paint: { 'fill-pattern': IMG_HATCH } }, before);
      CHANCE_BANDS.forEach((_, k) => {
        if (!m.getLayer(lyrBand(k))) {
          m.addLayer({ id: lyrBand(k), type: 'fill', source: SRC_BANDS, filter: ['==', ['get', 'k'], k], layout: { visibility: vis }, paint: { 'fill-pattern': imgBand(k), 'fill-antialias': false } }, before);
        }
      });
      if (!m.getLayer(LYR_LINE)) {
        m.addLayer({
          id: LYR_LINE, type: 'line', source: SRC_LINES, layout: { visibility: vis, 'line-join': 'round' },
          paint: {
            'line-color': LINE_COLOR,
            'line-opacity': 0.85,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['==', ['get', 'lvl'], 0.5], 1, 0.7], 9, ['case', ['==', ['get', 'lvl'], 0.5], 1.6, 1.1]],
          },
        }, before);
      }
      if (!m.getLayer(LYR_LABEL)) {
        m.addLayer({
          id: LYR_LABEL, type: 'symbol', source: SRC_LINES,
          layout: {
            visibility: vis, 'symbol-placement': 'line', 'symbol-spacing': 320, 'text-field': ['get', 'label'], 'text-size': 10.5,
            'text-font': ['Noto Sans Regular'], 'text-keep-upright': true, 'text-max-angle': 35, 'text-padding': 4,
          },
          paint: { 'text-color': LINE_COLOR, 'text-halo-color': LABEL_HALO, 'text-halo-width': 1.6 },
        }, before);
      }
    } catch { /* Stil lädt gerade — der nächste `styledata` hängt neu ein */ }
  }

  private ids(): string[] { return [LYR_MISS, ...CHANCE_BANDS.map((_, k) => lyrBand(k)), LYR_LINE, LYR_LABEL]; }

  setVisible(on: boolean): void {
    this.visible = on;
    this.ensure();
    for (const id of this.ids()) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }

  setData(d: { bands: GeoJSON.FeatureCollection; missing: GeoJSON.FeatureCollection; lines: GeoJSON.FeatureCollection } | null): void {
    this.bands = d?.bands ?? EMPTY; this.missing = d?.missing ?? EMPTY; this.lines = d?.lines ?? EMPTY;
    this.ensure();
    (this.map.getSource(SRC_BANDS) as maplibregl.GeoJSONSource | undefined)?.setData(this.bands);
    (this.map.getSource(SRC_MISS) as maplibregl.GeoJSONSource | undefined)?.setData(this.missing);
    (this.map.getSource(SRC_LINES) as maplibregl.GeoJSONSource | undefined)?.setData(this.lines);
  }

  remove(): void {
    this.map.off('styledata', this.onStyle);
    try {
      for (const id of [...this.ids()].reverse()) if (this.map.getLayer(id)) this.map.removeLayer(id);
      for (const id of [SRC_BANDS, SRC_MISS, SRC_LINES]) if (this.map.getSource(id)) this.map.removeSource(id);
    } catch { /* Karte schon abgebaut */ }
  }
}
