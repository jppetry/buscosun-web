/**
 * Höhen-Anreicherung für Strecken ohne (brauchbare) Höhendaten.
 *
 * Quelle: Mapzen/AWS Terrarium-DEM-Tiles (offen, bereits im Projekt genutzt,
 * siehe fusion/elevation.ts). Für DACH liefert das ~30 m Auflösung. EU-DEM10
 * bzw. Copernicus DEM ließen sich später hinter derselben Schnittstelle
 * einhängen. Es werden nur die tatsächlich von der Strecke berührten Tiles
 * geladen — nicht die gesamte Bounding-Box.
 *
 * Terrarium: elevation_m = R·256 + G + B/256 − 32768
 */

const TERRARIUM_TPL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const MAX_TILES = 64; // Obergrenze; Zoom wird notfalls reduziert

interface LatLon { lat: number; lon: number; }

function lng2tileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * (1 << z);
}
function lat2tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * (1 << z);
}
function decodePixel(data: Uint8ClampedArray, idx: number): number {
  return data[idx] * 256 + data[idx + 1] + data[idx + 2] / 256 - 32768;
}

async function loadTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8ClampedArray | null> {
  const url = TERRARIUM_TPL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  try {
    const res = await fetch(url, { signal, mode: 'cors' });
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    return ctx.getImageData(0, 0, 256, 256).data;
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    return null;
  }
}

/** Wählt den höchsten Zoom (≤13), bei dem ≤ MAX_TILES Tiles die Strecke abdecken. */
function chooseZoom(points: LatLon[]): { zoom: number; tiles: Set<string> } {
  for (let zoom = 13; zoom >= 8; zoom--) {
    const tiles = new Set<string>();
    for (const p of points) {
      tiles.add(`${Math.floor(lng2tileX(p.lon, zoom))}/${Math.floor(lat2tileY(p.lat, zoom))}`);
      if (tiles.size > MAX_TILES) break;
    }
    if (tiles.size <= MAX_TILES) return { zoom, tiles };
  }
  // Fallback: gröbster Zoom.
  const zoom = 8;
  const tiles = new Set<string>();
  for (const p of points) tiles.add(`${Math.floor(lng2tileX(p.lon, zoom))}/${Math.floor(lat2tileY(p.lat, zoom))}`);
  return { zoom, tiles };
}

/**
 * Liefert für jeden Punkt die DEM-Höhe (Meter). Gibt `null` zurück, wenn keine
 * Tiles geladen werden konnten (z. B. offline) — der Aufrufer degradiert dann
 * sauber. Einzelne nicht ladbare Tiles ergeben NaN für die betroffenen Punkte.
 */
export async function sampleElevations(points: LatLon[], signal?: AbortSignal): Promise<number[] | null> {
  if (points.length === 0) return [];
  const { zoom, tiles } = chooseZoom(points);

  const tileData = new Map<string, Uint8ClampedArray | null>();
  await Promise.all(
    [...tiles].map(async (key) => {
      const [x, y] = key.split('/').map(Number);
      tileData.set(key, await loadTile(zoom, x, y, signal));
    }),
  );
  if ([...tileData.values()].every((d) => d == null)) return null;

  const sampleAt = (lon: number, lat: number): number => {
    const fx = lng2tileX(lon, zoom);
    const fy = lat2tileY(lat, zoom);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const data = tileData.get(`${tx}/${ty}`);
    if (!data) return NaN;
    // Bilineare Interpolation innerhalb des Tiles.
    const px = (fx - tx) * 256;
    const py = (fy - ty) * 256;
    const i0 = Math.max(0, Math.min(255, Math.floor(px)));
    const j0 = Math.max(0, Math.min(255, Math.floor(py)));
    const i1 = Math.min(255, i0 + 1);
    const j1 = Math.min(255, j0 + 1);
    const fxr = px - i0;
    const fyr = py - j0;
    const e00 = decodePixel(data, (j0 * 256 + i0) * 4);
    const e10 = decodePixel(data, (j0 * 256 + i1) * 4);
    const e01 = decodePixel(data, (j1 * 256 + i0) * 4);
    const e11 = decodePixel(data, (j1 * 256 + i1) * 4);
    const e0 = e00 * (1 - fxr) + e10 * fxr;
    const e1 = e01 * (1 - fxr) + e11 * fxr;
    return e0 * (1 - fyr) + e1 * fyr;
  };

  return points.map((p) => sampleAt(p.lon, p.lat));
}
