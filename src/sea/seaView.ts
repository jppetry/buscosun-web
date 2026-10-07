/**
 * SW-5 — View helpers of the Seewetter page: colour scales (reference/README-seewetter.md), the CPU colouring of the
 * CWAM field for MapLibre (no shader, plan SW-5), wave arrows, hour axis, labels. Pure — no React, no MapLibre.
 *
 * The field image is resampled to rows that are LINEAR IN WEB MERCATOR before it goes to MapLibre: an image source
 * is stretched linearly in the projected space between its corners, while the CWAM rows are linear in latitude; over
 * 3.2° of latitude at 55° N the plain image would put the middle rows ≈ 1 km off (KL lesson: all map layers ≤ 1 m).
 */
import { SEA_MODELS, SEA_NULL, SEA_WATER, decodeDir, decodeHs, decodePeriod } from './seaContract';
import type { SeaLayer } from './seaState';
import type { SeaClass } from './seaProfiles';

// --- Colours -----------------------------------------------------------------------------------------

/** Hs scale (README): 0 m … ab 6 m, linear between the stops. */
export const HS_STOPS: ReadonlyArray<[number, string]> = [
  [0, '#11283A'], [0.5, '#164B64'], [1, '#1B6F7F'], [1.5, '#3E9284'], [2, '#86AE6F'], [2.5, '#C8B75B'], [3, '#E39A3B'], [4, '#C9572E'], [5, '#A33A4F'], [6, '#7A2E6E'],
];
/** Period scale (s): short steep sea dark, long swell light — sequential, increasing lightness. */
export const PER_STOPS: ReadonlyArray<[number, string]> = [
  [0, '#11283A'], [2, '#164B64'], [3, '#1B6F7F'], [4, '#3E9284'], [5, '#86AE6F'], [6, '#C8B75B'], [8, '#E39A3B'], [10, '#E8C9A0'], [12, '#F3EDDF'],
];
export const CLASS_COLOR: Readonly<Record<SeaClass, string>> = Object.freeze({ passt: '#8DB07A', knapp: '#E39A3B', ausserhalb: '#B5482E', keine: '#8B8474' });
export const CLASS_LABEL: Readonly<Record<SeaClass, string>> = Object.freeze({ passt: 'passt zu deinen Grenzen', knapp: 'knapp an deinen Grenzen', ausserhalb: 'außerhalb deiner Grenzen', keine: 'keine Daten' });
export const CLASS_SHORT: Readonly<Record<SeaClass, string>> = Object.freeze({ passt: 'passt', knapp: 'knapp', ausserhalb: 'außerhalb', keine: 'keine Daten' });
export const HATCH_CSS = 'repeating-linear-gradient(135deg,#8B8474 0 2px,#EDE6D3 2px 4px)';

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function ramp(stops: ReadonlyArray<[number, string]>): (v: number) => [number, number, number] {
  const s = stops.map(([v, c]) => [v, hex(c)] as const);
  return (v) => {
    if (v <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (v <= s[i][0]) {
        const t = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
        const a = s[i - 1][1], b = s[i][1];
        return [Math.round(a[0] + t * (b[0] - a[0])), Math.round(a[1] + t * (b[1] - a[1])), Math.round(a[2] + t * (b[2] - a[2]))];
      }
    }
    return s[s.length - 1][1];
  };
}
export const hsRgb = ramp(HS_STOPS);
export const perRgb = ramp(PER_STOPS);
export const cssGradient = (stops: ReadonlyArray<[number, string]>) => {
  const max = stops[stops.length - 1][0];
  return `linear-gradient(90deg, ${stops.map(([v, c]) => `${c} ${((v / max) * 100).toFixed(1)}%`).join(', ')})`;
};

// --- Field → coloured, mercator-row image ------------------------------------------------------------

const G = SEA_MODELS.cwam.grid;
/** Outer edges of the grid (cell centres ± half a cell). */
export const SEA_FIELD_BOUNDS = Object.freeze({ west: G.lon1 - G.di / 2, east: G.lon2 + G.di / 2, north: G.lat1 + G.dj / 2, south: G.lat2 - G.dj / 2 });
/** MapLibre image coordinates: top-left, top-right, bottom-right, bottom-left. */
export const SEA_FIELD_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [SEA_FIELD_BOUNDS.west, SEA_FIELD_BOUNDS.north], [SEA_FIELD_BOUNDS.east, SEA_FIELD_BOUNDS.north],
  [SEA_FIELD_BOUNDS.east, SEA_FIELD_BOUNDS.south], [SEA_FIELD_BOUNDS.west, SEA_FIELD_BOUNDS.south],
];
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latOfMercY = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
/** Output rows: twice the source rows (≈ 450 m), each row mapped to its source row through latitude. */
export const SEA_OUT_ROWS = G.nj * 2;
export const SEA_ROW_MAP: Int16Array = (() => {
  const top = mercY(SEA_FIELD_BOUNDS.north), bot = mercY(SEA_FIELD_BOUNDS.south);
  const out = new Int16Array(SEA_OUT_ROWS);
  for (let y = 0; y < SEA_OUT_ROWS; y++) {
    const lat = latOfMercY(top + ((y + 0.5) / SEA_OUT_ROWS) * (bot - top));
    out[y] = Math.min(G.nj - 1, Math.max(0, Math.floor((SEA_FIELD_BOUNDS.north - lat) / G.dj)));
  }
  return out;
})();

/**
 * Colours one field for the map. `src` = RGBA of `f/` (630 wide) or `c/` (1260 wide, `half` 0 = wind sea, 1 = swell).
 * Land stays transparent (the dark base map shows it), water without a value is hatched (never like calm sea, D-04).
 */
export function colourField(src: Uint8ClampedArray | Uint8Array, srcWidth: number, half: 0 | 1, layer: SeaLayer): Uint8ClampedArray {
  const ni = G.ni, out = new Uint8ClampedArray(ni * SEA_OUT_ROWS * 4);
  const off = half * ni;
  for (let y = 0; y < SEA_OUT_ROWS; y++) {
    const j = SEA_ROW_MAP[y];
    for (let i = 0; i < ni; i++) {
      const s = (j * srcWidth + off + i) * 4, o = (y * ni + i) * 4;
      if (src[s + 3] !== SEA_WATER) continue;
      let rgb: [number, number, number] | null = null;
      if (layer === 'per') { const p = decodePeriod(src[s + 2]); rgb = src[s] === SEA_NULL || p == null ? null : perRgb(p); }
      else { const h = decodeHs(src[s]); rgb = h == null ? null : hsRgb(h); }
      if (!rgb) rgb = ((i + y) & 3) < 2 ? [0x8b, 0x84, 0x74] : [0x3a, 0x38, 0x33];
      out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 235;
    }
  }
  return out;
}

/** Value of a field at a position (nearest cell); `undefined` = land/outside, `null` = water without value. */
export function sampleField(src: Uint8ClampedArray | Uint8Array, srcWidth: number, half: 0 | 1, lat: number, lon: number): { hs: number | null; dir: number | null; per: number | null } | undefined {
  const i = Math.round((lon - G.lon1) / G.di), j = Math.round((G.lat1 - lat) / G.dj);
  if (i < 0 || j < 0 || i >= G.ni || j >= G.nj) return undefined;
  const s = (j * srcWidth + half * G.ni + i) * 4;
  if (src[s + 3] !== SEA_WATER) return undefined;
  const hs = decodeHs(src[s]);
  return { hs, dir: hs == null ? null : decodeDir(src[s + 1]), per: hs == null ? null : decodePeriod(src[s + 2]) };
}

/** Wave arrows on a regular grid (every `every` cells), pointing where the waves GO (from + 180°). */
export function waveArrows(src: Uint8ClampedArray | Uint8Array, srcWidth: number, half: 0 | 1, every = 14): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = [];
  const stepJ = Math.round(every * (G.di / G.dj) * Math.cos((55 * Math.PI) / 180));
  for (let j = Math.floor(stepJ / 2); j < G.nj; j += stepJ) {
    for (let i = Math.floor(every / 2); i < G.ni; i += every) {
      const s = (j * srcWidth + half * G.ni + i) * 4;
      if (src[s + 3] !== SEA_WATER || src[s] === SEA_NULL) continue;
      const hs = decodeHs(src[s]) ?? 0;
      if (hs < 0.1) continue;
      f.push({ type: 'Feature', properties: { rot: (decodeDir(src[s + 1]) + 180) % 360, s: Math.min(1, 0.55 + hs / 6) }, geometry: { type: 'Point', coordinates: [G.lon1 + i * G.di, G.lat1 - j * G.dj] } });
    }
  }
  return { type: 'FeatureCollection', features: f };
}

// --- Time ----------------------------------------------------------------------------------------------

export const H = 3_600_000;
const berlin = (ms: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...o }).format(new Date(ms));
/** Two-digit local hour ("15"); hour-only Intl formats append " Uhr" in de-DE. */
export const hh = (ms: number) => berlin(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).slice(0, 2);
export const hm = (ms: number) => berlin(ms, { hour: '2-digit', minute: '2-digit' });
export const dayShort = (ms: number) => berlin(ms, { weekday: 'short' }).replace('.', '');
export const dayDate = (ms: number) => berlin(ms, { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.,', '');
export const dateTime = (ms: number) => `${dayDate(ms)} ${hm(ms)}`;
/** Local hour 0–23 in Berlin (day separators at 00). */
export const berlinHour = (ms: number) => Number(hh(ms));
export const tzLabel = (ms: number) => (berlin(ms, { timeZoneName: 'short' }).includes('MESZ') || /\+2/.test(berlin(ms, { timeZoneName: 'shortOffset' })) ? 'MESZ' : 'MEZ');
export const utcHm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

// --- Labels ----------------------------------------------------------------------------------------------

const DIRS16 = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass16 = (deg: number | null) => (deg == null ? '–' : DIRS16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]);
export const f1 = (x: number | null | undefined, unit = '') => (x == null || !Number.isFinite(x) ? '–' : `${x.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unit}`);
export const f0 = (x: number | null | undefined, unit = '') => (x == null || !Number.isFinite(x) ? '–' : `${Math.round(x)}${unit}`);
export const LAYER_LABEL: Readonly<Record<SeaLayer, string>> = Object.freeze({ hs: 'Seegang gesamt', ws: 'Windsee', sw: 'Dünung', per: 'Periode' });

/** Beaufort reading aid (Seewetterdienst wording). */
export const BFT_ROWS: ReadonlyArray<[number, string, string]> = [
  [3, '7–10 kn', 'schwach'], [4, '11–16 kn', 'mäßig'], [5, '17–21 kn', 'frisch'], [6, '22–27 kn', 'stark · Starkwind'], [7, '28–33 kn', 'steif · Starkwind'],
  [8, '34–40 kn', 'stürmisch · Sturm'], [9, '41–47 kn', 'Sturm'], [10, '48–55 kn', 'schwerer Sturm'],
];
