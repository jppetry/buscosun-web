/**
 * 3D-Globus · Temperatur-Umfärbung in den nullschool-Look.
 *
 * Das gebündelte Temperatur-Raster (NASA MERRA-2 via GIBS) ist mit der
 * GIBS-Spektralpalette vorgefärbt — dort liegen gemäßigte Temperaturen schon im
 * Orange/Rot. nullschool verteilt die Farben anders (kalt = violett/blau,
 * gemäßigt = grün, heiß = rot). Da wir keine Rohwerte haben, invertieren wir die
 * GIBS-Farbe pixelweise zurück auf eine Temperatur (Nearest-Match gegen die
 * bekannte GIBS-Palette) und färben mit einer nullschool-ähnlichen Rampe neu.
 *
 * Rein clientseitig (Canvas) — einmalig beim Laden, danach statisches Bild.
 */

type Stop = [number, [number, number, number]];

// GIBS-Spektralpalette (Kelvin → RGB), aus dem Colormap des MERRA-2-Layers.
const GIBS_STOPS: Stop[] = [
  [213, [94, 79, 162]], [220, [50, 136, 189]], [230, [99, 191, 166]], [242, [167, 219, 164]],
  [252, [227, 243, 152]], [264, [253, 254, 189]], [274, [254, 225, 141]], [286, [253, 176, 98]],
  [296, [244, 111, 68]], [308, [214, 64, 78]],
];
const GIBS_MIN_K = 213, GIBS_MAX_K = 308;

// Ziel-Palette (°C → RGB): matter nullschool-Look — dunklere, stark entsättigte
// Farben damit Ländergrenzen und Küstenlinien sichtbar bleiben. Orientiert an
// earth.nullschool.net (smoky/foggy Anmutung, kein reines Spektral).
const NS_STOPS: Stop[] = [
  [-60, [30, 20, 80]],   [-50, [40, 55, 118]],  [-40, [45, 78, 150]],  [-30, [48, 108, 172]],
  [-20, [60, 138, 182]], [-10, [80, 164, 178]], [-2, [98, 178, 158]],  [6, [118, 182, 122]],
  [14, [162, 184, 88]], [22, [196, 174, 72]],   [28, [208, 138, 60]], [34, [196, 92, 54]],
  [42, [168, 52, 46]],  [50, [128, 26, 36]],
];

function rampLookup(stops: Stop[], x: number): [number, number, number] {
  if (x <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, c0] = stops[i], [x1, c1] = stops[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return last[1];
}

export interface RecoloredTemp {
  canvas: HTMLCanvasElement;
  /** °C je Pixel (äquirektangular, w×h), NaN = keine Daten. Für Hover-Abfrage. */
  tempC: Float32Array;
  width: number;
  height: number;
}

/** Bilineare-näherungs (Nearest) Abfrage eines äquirektangularen Wertegitters. */
export function sampleTempC(grid: RecoloredTemp, lng: number, lat: number): number | null {
  const x = Math.round(((lng + 180) / 360) * (grid.width - 1));
  const y = Math.round(((90 - lat) / 180) * (grid.height - 1));
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return null;
  const v = grid.tempC[y * grid.width + x];
  return Number.isNaN(v) ? null : v;
}

/**
 * Lädt das GIBS-Temperaturbild, invertiert es auf Temperatur und färbt mit der
 * nullschool-Rampe neu. Gibt Canvas (für die Image-Source) + °C-Wertegitter
 * (für die Hover-Abfrage) zurück.
 */
export function recolorTemp(img: HTMLImageElement, w = 1024, h = 512): RecoloredTemp {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const tempC = new Float32Array(w * h);

  // Dichte Nearest-Match-LUT der GIBS-Palette: Index → (RGB, Kelvin).
  const N = 256;
  const lr = new Float32Array(N), lg = new Float32Array(N), lb = new Float32Array(N), lk = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const K = GIBS_MIN_K + ((GIBS_MAX_K - GIBS_MIN_K) * i) / (N - 1);
    const c = rampLookup(GIBS_STOPS, K);
    lr[i] = c[0]; lg[i] = c[1]; lb[i] = c[2]; lk[i] = K;
  }

  for (let p = 0; p < w * h; p++) {
    const o = p * 4;
    const a = px[o + 3];
    const r = px[o], g = px[o + 1], b = px[o + 2];
    // No-Data (transparent oder GIBS-Magenta) → transparent lassen.
    if (a < 10 || (r > 235 && g < 40 && b > 235)) { px[o + 3] = 0; tempC[p] = NaN; continue; }
    let bi = 0, bd = Infinity;
    for (let i = 0; i < N; i++) {
      const dr = r - lr[i], dg = g - lg[i], db = b - lb[i];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; bi = i; }
    }
    const c = lk[bi] - 273.15;
    tempC[p] = c;
    const nc = rampLookup(NS_STOPS, c);
    px[o] = nc[0]; px[o + 1] = nc[1]; px[o + 2] = nc[2]; px[o + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return { canvas: cv, tempC, width: w, height: h };
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`Bild nicht ladbar: ${url}`));
    im.src = url;
  });
}
