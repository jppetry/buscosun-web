/**
 * Sharp raster basemap on high-density screens (dossier map "Karte · markiert").
 *
 * MapLibre picks the zoom level of a raster source by CSS pixels: a 256-px tile is drawn on 256 CSS px,
 * so at a device pixel ratio of 3 every image pixel is stretched 2.1–4.2 × (with `roundZoom` the scale
 * runs from 0.71 to 1.41 of nominal). The map is fully loaded and still looks coarse on a phone — it
 * never gets sharper, because nothing is left to load. Declaring the source with a smaller `tileSize`
 * makes MapLibre request tiles k levels deeper (k = round(log2 pixelRatio), at most 2), so one image
 * pixel lands on about one device pixel again. Pixel ratio 1 (and anything below 1.42) is unchanged.
 *
 * Only for imagery WITHOUT labels: a smaller `tileSize` also shrinks text baked into the tiles.
 */

/** Deepest tile zoom of Esri World Imagery that exists everywhere; beyond it the map overzooms. */
export const SHARP_IMAGERY_MAX_TILE_ZOOM = 19;

/** Levels deeper than the CSS-pixel choice: 0 at pixel ratio < 1.42, 1 up to 2.82, 2 above. */
export function sharpLevels(pixelRatio: number): 0 | 1 | 2 {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return 0;
  const k = Math.round(Math.log2(pixelRatio));
  return k <= 0 ? 0 : k >= 2 ? 2 : 1;
}

interface RasterSourceLike { type: string; tileSize?: number; maxzoom?: number }
interface StyleLike { sources: Record<string, unknown> }

/**
 * A copy of `style` whose raster sources request tiles matching `pixelRatio`. Returns `style` itself
 * (same reference) when nothing changes — a URL style, no raster source, or pixel ratio < 1.42.
 */
export function sharpRasterStyle<S>(style: S, pixelRatio: number): S {
  const k = sharpLevels(pixelRatio);
  if (k === 0 || typeof style !== 'object' || style === null) return style;
  const s = style as unknown as StyleLike;
  let changed = false;
  const sources: Record<string, unknown> = {};
  for (const [id, src] of Object.entries(s.sources ?? {})) {
    const r = src as RasterSourceLike;
    if (r && r.type === 'raster') {
      const base = r.tileSize ?? 512;
      sources[id] = { ...r, tileSize: base >> k, maxzoom: Math.min(r.maxzoom ?? SHARP_IMAGERY_MAX_TILE_ZOOM, SHARP_IMAGERY_MAX_TILE_ZOOM) };
      changed = true;
    } else {
      sources[id] = src;
    }
  }
  return changed ? ({ ...s, sources } as unknown as S) : style;
}
