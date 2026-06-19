/**
 * Per-city temperature labels for the map.
 *
 * Each label is a small "Berlin 22°" pill positioned via maplibregl.Marker
 * at a fixed (lat, lng) city centre. The temperature is sampled directly
 * from the fused-forecast temperature PNG using the SAME DEM-aware lapse
 * arithmetic that the ScalarLayer fragment shader applies, so the label
 * value matches the colour of the underlying heatmap pixel.
 *
 * Sampling math (matches `ScalarLayer.meshFrag`):
 *
 *   t_cell_norm = temp.r  in [0,1]
 *   cell_elev   = temp.g · demMax
 *   dem_elev    = dem.r · demMax
 *   t_cell_phys = vMin + t_cell_norm · (vMax − vMin)
 *   t_pixel     = t_cell_phys + (cell_elev − dem_elev) · γ
 *
 * The DACH city list is curated for visual density — about 40 entries cover
 * the major centres plus a handful of alpine landmarks (Innsbruck valley,
 * Zugspitze peak, Jungfraujoch) that demonstrate the elevation-aware
 * lapse-rate refinement.
 */

// ---------------------------------------------------------------------------
// Sofort-Label-Cache (localStorage). Die Stadt-Temperaturen der letzten Sitzung
// werden — wie der Wind-„jetzt"-Frame — gespeichert und beim nächsten Aktivieren
// des Temp-Layers SOFORT gerendert (Kaltstart ohne Warten auf den GRIB-Fetch).
// Sobald das frische native Gitter geladen ist, ersetzt es die Cache-Werte.
// Nur ein paar Dutzend Zahlen → vernachlässigbar klein.
// ---------------------------------------------------------------------------
const TEMP_LABEL_CACHE_KEY = 'bs-temp-labels-v1';

export function saveTempLabelCache(temps: Record<string, number>): void {
  try {
    localStorage.setItem(TEMP_LABEL_CACHE_KEY, JSON.stringify({ at: Date.now(), temps }));
  } catch { /* Quota / kein localStorage → still ignorieren */ }
}

/** Liefert die zwischengespeicherten Stadt-Temperaturen, falls jung genug (≤ 6 h). */
export function loadTempLabelCache(maxAgeMs = 6 * 3600_000): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(TEMP_LABEL_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { at?: number; temps?: Record<string, number> };
    if (!o || typeof o.at !== 'number' || Date.now() - o.at > maxAgeMs) return null;
    return o.temps && typeof o.temps === 'object' ? o.temps : null;
  } catch { return null; }
}

export interface City {
  name: string;
  lat: number;
  lng: number;
  /**
   * Importance tier driving the zoom-level at which the label appears.
   *   1 — top metros and iconic alpine landmarks (visible from continent view)
   *   2 — major cities (≈ 200k+) and state capitals, alpine resort hubs
   *   3 — smaller cities (≈ 50–200k), mid-tier alpine villages
   *   4 — towns + remote alpine villages (only visible when zoomed in)
   * See `minZoomForRank` for the actual thresholds.
   */
  rank: 1 | 2 | 3 | 4;
}

/**
 * Returns the minimum zoom level at which a label of this rank should be
 * rendered. Calibrated so a DACH-overview camera (z ≈ 5.5) shows only
 * rank 1, a country view (z ≈ 7) adds rank 2, regional view (z ≈ 9.5) adds
 * rank 3, and a city view (z ≈ 11) brings in rank 4.
 */
export function minZoomForRank(rank: 1 | 2 | 3 | 4): number {
  return rank === 1 ? 0 : rank === 2 ? 6.4 : rank === 3 ? 8.2 : 10.0;
}

export const DACH_CITIES: City[] = [
  // ===== Rank 1 — continent-view (always visible) =====
  // DE
  { name: 'Berlin',         lat: 52.520, lng: 13.405, rank: 1 },
  { name: 'Hamburg',        lat: 53.551, lng:  9.993, rank: 1 },
  { name: 'München',        lat: 48.137, lng: 11.575, rank: 1 },
  { name: 'Köln',           lat: 50.937, lng:  6.960, rank: 1 },
  { name: 'Frankfurt',      lat: 50.110, lng:  8.682, rank: 1 },
  // AT
  { name: 'Wien',           lat: 48.208, lng: 16.373, rank: 1 },
  // CH
  { name: 'Zürich',         lat: 47.377, lng:  8.541, rank: 1 },
  // Iconic alpine landmark peaks — always shown to anchor the elevation
  // gradient so even on the overview the cold-blue alpine band reads.
  { name: 'Zugspitze',      lat: 47.421, lng: 10.985, rank: 1 },
  { name: 'Sonnblick',      lat: 47.054, lng: 12.957, rank: 1 },
  { name: 'Jungfraujoch',   lat: 46.547, lng:  7.984, rank: 1 },

  // ===== Rank 2 — major cities + alpine hubs =====
  // DE
  { name: 'Stuttgart',      lat: 48.776, lng:  9.182, rank: 2 },
  { name: 'Düsseldorf',     lat: 51.227, lng:  6.773, rank: 2 },
  { name: 'Leipzig',        lat: 51.339, lng: 12.378, rank: 2 },
  { name: 'Dortmund',       lat: 51.514, lng:  7.466, rank: 2 },
  { name: 'Essen',          lat: 51.450, lng:  7.013, rank: 2 },
  { name: 'Bremen',         lat: 53.079, lng:  8.802, rank: 2 },
  { name: 'Dresden',        lat: 51.050, lng: 13.738, rank: 2 },
  { name: 'Hannover',       lat: 52.375, lng:  9.732, rank: 2 },
  { name: 'Nürnberg',       lat: 49.452, lng: 11.077, rank: 2 },
  // AT
  { name: 'Graz',           lat: 47.071, lng: 15.439, rank: 2 },
  { name: 'Linz',           lat: 48.306, lng: 14.286, rank: 2 },
  { name: 'Salzburg',       lat: 47.808, lng: 13.055, rank: 2 },
  { name: 'Innsbruck',      lat: 47.269, lng: 11.404, rank: 2 },
  { name: 'Klagenfurt',     lat: 46.624, lng: 14.305, rank: 2 },
  // CH
  { name: 'Genf',           lat: 46.204, lng:  6.143, rank: 2 },
  { name: 'Basel',          lat: 47.560, lng:  7.588, rank: 2 },
  { name: 'Bern',           lat: 46.948, lng:  7.447, rank: 2 },
  { name: 'Lausanne',       lat: 46.520, lng:  6.633, rank: 2 },
  { name: 'Lugano',         lat: 46.005, lng:  8.951, rank: 2 },

  // ===== Rank 3 — second-tier cities + alpine resort towns =====
  // DE — Landeshauptstädte + 100-300k cities
  { name: 'Duisburg',       lat: 51.435, lng:  6.762, rank: 3 },
  { name: 'Bochum',         lat: 51.481, lng:  7.219, rank: 3 },
  { name: 'Wuppertal',      lat: 51.256, lng:  7.150, rank: 3 },
  { name: 'Bielefeld',      lat: 52.030, lng:  8.532, rank: 3 },
  { name: 'Bonn',           lat: 50.737, lng:  7.099, rank: 3 },
  { name: 'Münster',        lat: 51.961, lng:  7.626, rank: 3 },
  { name: 'Mannheim',       lat: 49.488, lng:  8.466, rank: 3 },
  { name: 'Karlsruhe',      lat: 49.007, lng:  8.404, rank: 3 },
  { name: 'Wiesbaden',      lat: 50.083, lng:  8.241, rank: 3 },
  { name: 'Augsburg',       lat: 48.366, lng: 10.898, rank: 3 },
  { name: 'Mainz',          lat: 49.992, lng:  8.247, rank: 3 },
  { name: 'Aachen',         lat: 50.776, lng:  6.084, rank: 3 },
  { name: 'Kiel',           lat: 54.323, lng: 10.122, rank: 3 },
  { name: 'Magdeburg',      lat: 52.120, lng: 11.628, rank: 3 },
  { name: 'Freiburg',       lat: 47.999, lng:  7.842, rank: 3 },
  { name: 'Lübeck',         lat: 53.866, lng: 10.687, rank: 3 },
  { name: 'Erfurt',         lat: 50.978, lng: 11.029, rank: 3 },
  { name: 'Rostock',        lat: 54.092, lng: 12.099, rank: 3 },
  { name: 'Kassel',         lat: 51.317, lng:  9.491, rank: 3 },
  { name: 'Saarbrücken',    lat: 49.241, lng:  6.997, rank: 3 },
  { name: 'Potsdam',        lat: 52.391, lng: 13.064, rank: 3 },
  { name: 'Schwerin',       lat: 53.629, lng: 11.413, rank: 3 },
  { name: 'Ulm',            lat: 48.401, lng:  9.987, rank: 3 },
  { name: 'Würzburg',       lat: 49.792, lng:  9.953, rank: 3 },
  { name: 'Heidelberg',     lat: 49.398, lng:  8.671, rank: 3 },
  { name: 'Regensburg',     lat: 49.013, lng: 12.101, rank: 3 },
  { name: 'Koblenz',        lat: 50.357, lng:  7.598, rank: 3 },
  { name: 'Trier',          lat: 49.749, lng:  6.638, rank: 3 },
  { name: 'Garmisch',       lat: 47.491, lng: 11.095, rank: 3 },
  { name: 'Berchtesgaden',  lat: 47.631, lng: 13.000, rank: 3 },
  // AT
  { name: 'Villach',        lat: 46.611, lng: 13.857, rank: 3 },
  { name: 'Wels',           lat: 48.158, lng: 14.034, rank: 3 },
  { name: 'St. Pölten',     lat: 48.205, lng: 15.624, rank: 3 },
  { name: 'Dornbirn',       lat: 47.413, lng:  9.744, rank: 3 },
  { name: 'Bregenz',        lat: 47.503, lng:  9.747, rank: 3 },
  { name: 'Steyr',          lat: 48.041, lng: 14.421, rank: 3 },
  { name: 'Kitzbühel',      lat: 47.446, lng: 12.391, rank: 3 },
  { name: 'Zell am See',    lat: 47.323, lng: 12.795, rank: 3 },
  { name: 'Schladming',     lat: 47.394, lng: 13.685, rank: 3 },
  { name: 'Lienz',          lat: 46.829, lng: 12.769, rank: 3 },
  // CH
  { name: 'Winterthur',     lat: 47.500, lng:  8.724, rank: 3 },
  { name: 'Luzern',         lat: 47.050, lng:  8.309, rank: 3 },
  { name: 'St. Gallen',     lat: 47.424, lng:  9.376, rank: 3 },
  { name: 'Biel',           lat: 47.137, lng:  7.247, rank: 3 },
  { name: 'Thun',           lat: 46.758, lng:  7.625, rank: 3 },
  { name: 'Schaffhausen',   lat: 47.697, lng:  8.634, rank: 3 },
  { name: 'Chur',           lat: 46.852, lng:  9.531, rank: 3 },
  { name: 'Fribourg',       lat: 46.806, lng:  7.162, rank: 3 },
  { name: 'Neuchâtel',      lat: 46.992, lng:  6.931, rank: 3 },
  { name: 'Sion',           lat: 46.227, lng:  7.359, rank: 3 },
  { name: 'Locarno',        lat: 46.171, lng:  8.798, rank: 3 },
  { name: 'Bellinzona',     lat: 46.193, lng:  9.022, rank: 3 },
  { name: 'Davos',          lat: 46.802, lng:  9.835, rank: 3 },
  { name: 'Zermatt',        lat: 46.020, lng:  7.748, rank: 3 },
  { name: 'St. Moritz',     lat: 46.498, lng:  9.840, rank: 3 },
  { name: 'Interlaken',     lat: 46.685, lng:  7.853, rank: 3 },

  // ===== Rank 4 — small towns + remote alpine villages =====
  // DE
  { name: 'Heilbronn',      lat: 49.143, lng:  9.218, rank: 4 },
  { name: 'Pforzheim',      lat: 48.892, lng:  8.700, rank: 4 },
  { name: 'Göttingen',      lat: 51.532, lng:  9.935, rank: 4 },
  { name: 'Ingolstadt',     lat: 48.766, lng: 11.435, rank: 4 },
  { name: 'Wolfsburg',      lat: 52.423, lng: 10.787, rank: 4 },
  { name: 'Reutlingen',     lat: 48.491, lng:  9.211, rank: 4 },
  { name: 'Bremerhaven',    lat: 53.547, lng:  8.583, rank: 4 },
  { name: 'Erlangen',       lat: 49.594, lng: 11.005, rank: 4 },
  { name: 'Jena',           lat: 50.927, lng: 11.589, rank: 4 },
  { name: 'Hildesheim',     lat: 52.151, lng:  9.951, rank: 4 },
  { name: 'Cottbus',        lat: 51.760, lng: 14.334, rank: 4 },
  { name: 'Kaiserslautern', lat: 49.444, lng:  7.769, rank: 4 },
  { name: 'Bayreuth',       lat: 49.943, lng: 11.578, rank: 4 },
  { name: 'Konstanz',       lat: 47.659, lng:  9.176, rank: 4 },
  { name: 'Lüneburg',       lat: 53.247, lng: 10.414, rank: 4 },
  { name: 'Tübingen',       lat: 48.520, lng:  9.058, rank: 4 },
  { name: 'Friedrichshafen',lat: 47.654, lng:  9.479, rank: 4 },
  { name: 'Passau',         lat: 48.567, lng: 13.431, rank: 4 },
  { name: 'Stralsund',      lat: 54.314, lng: 13.090, rank: 4 },
  { name: 'Sylt',           lat: 54.913, lng:  8.336, rank: 4 },
  { name: 'Oberstdorf',     lat: 47.405, lng: 10.279, rank: 4 },
  { name: 'Mittenwald',     lat: 47.443, lng: 11.262, rank: 4 },
  { name: 'Füssen',         lat: 47.572, lng: 10.704, rank: 4 },
  { name: 'Ruhpolding',     lat: 47.762, lng: 12.642, rank: 4 },
  { name: 'Norderney',      lat: 53.706, lng:  7.156, rank: 4 },
  // AT — alpine resorts + smaller towns
  { name: 'Krems',          lat: 48.410, lng: 15.601, rank: 4 },
  { name: 'Leoben',         lat: 47.380, lng: 15.094, rank: 4 },
  { name: 'Wr. Neustadt',   lat: 47.815, lng: 16.246, rank: 4 },
  { name: 'Feldkirch',      lat: 47.239, lng:  9.598, rank: 4 },
  { name: 'St. Anton',      lat: 47.130, lng: 10.265, rank: 4 },
  { name: 'Ischgl',         lat: 47.013, lng: 10.291, rank: 4 },
  { name: 'Sölden',         lat: 46.967, lng: 11.005, rank: 4 },
  { name: 'Mayrhofen',      lat: 47.166, lng: 11.864, rank: 4 },
  { name: 'Bad Gastein',    lat: 47.118, lng: 13.135, rank: 4 },
  { name: 'Saalbach',       lat: 47.388, lng: 12.640, rank: 4 },
  { name: 'Hallstatt',      lat: 47.561, lng: 13.649, rank: 4 },
  { name: 'Mariazell',      lat: 47.773, lng: 15.317, rank: 4 },
  { name: 'Großglockner',   lat: 47.075, lng: 12.694, rank: 4 },
  // CH — alpine resorts + smaller cities
  { name: 'Verbier',        lat: 46.097, lng:  7.227, rank: 4 },
  { name: 'Crans-Montana',  lat: 46.310, lng:  7.481, rank: 4 },
  { name: 'Grindelwald',    lat: 46.624, lng:  8.039, rank: 4 },
  { name: 'Wengen',         lat: 46.605, lng:  7.921, rank: 4 },
  { name: 'Engelberg',      lat: 46.821, lng:  8.401, rank: 4 },
  { name: 'Andermatt',      lat: 46.638, lng:  8.594, rank: 4 },
  { name: 'Saas-Fee',       lat: 46.108, lng:  7.929, rank: 4 },
  { name: 'Gstaad',         lat: 46.474, lng:  7.286, rank: 4 },
  { name: 'Arosa',          lat: 46.781, lng:  9.679, rank: 4 },
  { name: 'Flims',          lat: 46.832, lng:  9.282, rank: 4 },
  { name: 'Lenzerheide',    lat: 46.728, lng:  9.557, rank: 4 },
  { name: 'Klosters',       lat: 46.876, lng:  9.879, rank: 4 },
  { name: 'Adelboden',      lat: 46.494, lng:  7.560, rank: 4 },
  { name: 'Murten',         lat: 46.927, lng:  7.111, rank: 4 },
  { name: 'Brig',           lat: 46.318, lng:  7.989, rank: 4 },
  { name: 'Aletsch',        lat: 46.500, lng:  8.040, rank: 4 },   // Aletsch glacier viewpoint
  { name: 'Disentis',       lat: 46.700, lng:  8.852, rank: 4 },
];

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// Dekodierte Pixel je Quell-Bild cachen. Schlüssel ist das Canvas/Image-OBJEKT —
// dessen Inhalt ist unveränderlich (jeder ICON-Frame ist ein eigenes Canvas, das
// DEM ein konstantes). Beim Slider-Scrubben wird so das (konstante) DEM nur EINMAL
// dekodiert und jeder Temp-Frame nur einmal; Zurückscrubben trifft den Cache.
// WeakMap → automatische Freigabe, sobald ein Frame nicht mehr referenziert wird.
const decodeCache = new WeakMap<HTMLImageElement | HTMLCanvasElement, DecodedImage>();

function decode(image: HTMLImageElement | HTMLCanvasElement): DecodedImage {
  const cached = decodeCache.get(image);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const result: DecodedImage = {
    width: image.width,
    height: image.height,
    data: ctx.getImageData(0, 0, image.width, image.height).data,
  };
  decodeCache.set(image, result);
  return result;
}

function bilinearChannel(img: DecodedImage, u: number, v: number, channel: 0 | 1 | 2 | 3): number {
  // PNG is encoded with PNG-y growing south (y=0 = north in equirect). Caller
  // supplies u,v in equirect [0,1] (matches the shader's UV space). We don't
  // flip here — the encode function already did.
  const x = u * (img.width - 1);
  const y = v * (img.height - 1);
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(y)));
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const idx = (xx: number, yy: number) => (yy * img.width + xx) * 4 + channel;
  const c00 = img.data[idx(x0, y0)];
  const c10 = img.data[idx(x1, y0)];
  const c01 = img.data[idx(x0, y1)];
  const c11 = img.data[idx(x1, y1)];
  const c0 = c00 * (1 - fx) + c10 * fx;
  const c1 = c01 * (1 - fx) + c11 * fx;
  return c0 * (1 - fy) + c1 * fy;
}

export interface TemperatureSamplerOptions {
  tempImage: HTMLImageElement | HTMLCanvasElement;
  tempUvBounds: [number, number, number, number];
  vMin: number;
  vMax: number;
  demImage: HTMLImageElement | HTMLCanvasElement | null;
  demUvBounds: [number, number, number, number];
  demMax: number;
  lapseRatePerM: number;
}

export class TemperatureSampler {
  private opts: TemperatureSamplerOptions;
  private temp: DecodedImage;
  private dem: DecodedImage | null;

  constructor(opts: TemperatureSamplerOptions) {
    this.opts = opts;
    this.temp = decode(opts.tempImage);
    this.dem = opts.demImage ? decode(opts.demImage) : null;
  }

  sample(lng: number, lat: number): number | null {
    // Equirect UV → temp PNG UV
    const ux = (lng + 180) / 360;
    const uy = (90 - lat) / 180;
    const [tx0, ty0, tx1, ty1] = this.opts.tempUvBounds;
    const tu = (ux - tx0) / (tx1 - tx0);
    const tv = (uy - ty0) / (ty1 - ty0);
    if (tu < 0 || tu > 1 || tv < 0 || tv > 1) return null;

    // Mask check (alpha): drop if no data coverage at this location.
    const alpha = bilinearChannel(this.temp, tu, tv, 3);
    if (alpha < 15) return null;

    const rNorm = bilinearChannel(this.temp, tu, tv, 0) / 255;
    const tCellPhys = this.opts.vMin + rNorm * (this.opts.vMax - this.opts.vMin);

    // Per-pixel DEM refinement
    if (this.dem) {
      const gNorm = bilinearChannel(this.temp, tu, tv, 1) / 255;
      const cellElev = gNorm * this.opts.demMax;
      const [dx0, dy0, dx1, dy1] = this.opts.demUvBounds;
      const du = (ux - dx0) / (dx1 - dx0);
      const dv = (uy - dy0) / (dy1 - dy0);
      if (du >= 0 && du <= 1 && dv >= 0 && dv <= 1) {
        const demNorm = bilinearChannel(this.dem, du, dv, 0) / 255;
        const demElev = demNorm * this.opts.demMax;
        return tCellPhys + (cellElev - demElev) * this.opts.lapseRatePerM;
      }
    }
    return tCellPhys;
  }
}
