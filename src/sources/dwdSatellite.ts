/**
 * DWD GeoServer satellite imagery — public WMS endpoint, CC BY 4.0, commercial
 * OK, no API key, no rate limit. The WMS serves Meteosat Second Generation
 * products that DWD pre-processes and re-publishes for the DACH region.
 *
 * Two products are useful for general weather visualisation:
 *
 *   `eu_rgb`   Day-time HRV RGB composite (~1 km) + night-time IR-10.8
 *              automatic switch within the same layer based on solar
 *              illumination. Covers all of Europe. Updates every 3 h
 *              (00, 03, 06, 09, 12, 15, 18, 21 UTC).
 *
 *   `world_ir` 24/7 IR-10.8 brightness-temperature world mosaic (~3 km).
 *              Lower resolution but works at night across the globe and
 *              shows cold cloud tops as bright/white. Same 3 h cadence.
 *
 * The MapLibre map asks the WMS for tile-shaped PNGs by templating
 * `{bbox-epsg-3857}` into the URL — MapLibre fills in the per-tile bbox.
 */

export type SatelliteProduct = 'eu_rgb' | 'world_ir';

const WMS_BASE = 'https://maps.dwd.de/geoserver/dwd/wms';

const LAYER_NAMES: Record<SatelliteProduct, string> = {
  eu_rgb: 'dwd:Satellite_meteosat_1km_euat_rgb_day_hrv_and_night_ir108_3h',
  world_ir: 'dwd:Satellite_worldmosaic_3km_world_ir108_3h',
};

const TITLES: Record<SatelliteProduct, string> = {
  eu_rgb: 'Meteosat Europa (RGB Tag / IR Nacht)',
  world_ir: 'Meteosat Welt (IR 10.8 µm)',
};

const ATTRIBUTION =
  'Satellit: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html">DWD OpenData</a> ' +
  '(EUMETSAT Meteosat) · CC BY 4.0';

/** Build the WMS GetMap URL template that MapLibre expands per tile. */
export function satelliteTileTemplate(product: SatelliteProduct): string {
  const layer = LAYER_NAMES[product];
  return (
    `${WMS_BASE}` +
    `?service=WMS&version=1.1.0&request=GetMap` +
    `&layers=${encodeURIComponent(layer)}` +
    `&styles=` +
    `&bbox={bbox-epsg-3857}` +
    `&width=512&height=512` +
    `&srs=EPSG:3857` +
    `&format=image/png&transparent=true`
  );
}

export interface SatelliteSourceMeta {
  product: SatelliteProduct;
  title: string;
  template: string;
  attribution: string;
  /** Approximate update cadence in minutes — used for the status badge. */
  cadenceMinutes: number;
  /** GeoServer layer local name (ohne `dwd:`-Präfix) für den TIME-Capabilities-Abruf. */
  layerLocalName: string;
}

export function satelliteSourceMeta(product: SatelliteProduct): SatelliteSourceMeta {
  return {
    product,
    title: TITLES[product],
    template: satelliteTileTemplate(product),
    attribution: ATTRIBUTION,
    cadenceMinutes: 180,    // DWD opendata cadence: 3 h
    layerLocalName: LAYER_NAMES[product].replace('dwd:', ''),
  };
}

export const SATELLITE_PRODUCTS: SatelliteProduct[] = ['eu_rgb', 'world_ir'];
