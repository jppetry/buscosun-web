/**
 * DWD GeoServer — accumulated lightning strikes WMS layer.
 *
 * The layer `Accumulated_Flash_Area` aggregates cloud-to-ground + cloud-to-
 * cloud strokes detected by DWD's lightning network (Linet/Sferics) over the
 * last hour, rendered as a coloured raster: brighter = denser strike rate.
 * CC BY 4.0, commercial OK, no API key. Updates every ~10 min.
 */

const WMS_BASE = 'https://maps.dwd.de/geoserver/dwd/wms';
const LAYER = 'dwd:Accumulated_Flash_Area';
/** GeoServer layer local name (ohne `dwd:`) für den TIME-Capabilities-Abruf (P2-2). */
export const LIGHTNING_LAYER_LOCAL = 'Accumulated_Flash_Area';

export function lightningTileTemplate(): string {
  return (
    `${WMS_BASE}` +
    `?service=WMS&version=1.1.0&request=GetMap` +
    `&layers=${encodeURIComponent(LAYER)}` +
    `&styles=` +
    `&bbox={bbox-epsg-3857}` +
    `&width=512&height=512` +
    `&srs=EPSG:3857` +
    `&format=image/png&transparent=true`
  );
}

export const LIGHTNING_ATTRIBUTION =
  'Blitze: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html">DWD OpenData</a> ' +
  '(Sferics/Linet) · CC BY 4.0';
