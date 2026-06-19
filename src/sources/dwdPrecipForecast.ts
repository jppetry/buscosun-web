/**
 * DWD ICON precipitation forecast via the GeoServer WMS.
 *
 * Layer:  `dwd:Icon_reg025_fd_sl_TOTPREC`
 * Style:  `icon_reg025_fd_sl_totprec_wmc_isoarea` (Precipitation color scale)
 *   - ICON global 0.25° (~ 25 km) grid covering all of Europe.
 *   - 3-hourly forecast frames out to several days.
 *   - The original `Icon-eu_reg00625_fd_sl_TOTPREC01H` (7 km, hourly)
 *     looked attractive on paper, but its only published style
 *     (`...lawa`) renders the layer ALMOST FULLY TRANSPARENT for the
 *     DACH bbox at our zoom — verified empirically: tiles came back
 *     ~ 1.8 KB with only grayscale country outlines, no precipitation
 *     cells. Switching to the global ICON layer (coarser but with a
 *     proper isoarea color scale) is the practical trade-off.
 *
 * The WMS exposes a TIME dimension; passing `time=ISO8601` selects the
 * forecast hour. With no time parameter the server returns the "current"
 * frame closest to now.
 *
 * CC BY 4.0, commercial OK, no API key, no rate limit.
 */

const WMS_BASE = 'https://maps.dwd.de/geoserver/dwd/wms';
const LAYER = 'dwd:Icon_reg025_fd_sl_TOTPREC';
const STYLE = 'icon_reg025_fd_sl_totprec_wmc_isoarea';

export const PRECIP_FORECAST_ATTRIBUTION =
  'Niederschlag-Forecast: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html">DWD ICON</a> · CC BY 4.0';

/**
 * Build a WMS tile-template URL. If `timeIso` is given, the layer will fetch
 * the forecast frame valid at that ISO timestamp; otherwise the server picks
 * the most recent available frame.
 */
export function precipForecastTileTemplate(timeIso?: string): string {
  const timeParam = timeIso ? `&time=${encodeURIComponent(timeIso)}` : '';
  return (
    `${WMS_BASE}` +
    `?service=WMS&version=1.1.0&request=GetMap` +
    `&layers=${encodeURIComponent(LAYER)}` +
    `&styles=${encodeURIComponent(STYLE)}` +
    `&bbox={bbox-epsg-3857}` +
    `&width=512&height=512` +
    `&srs=EPSG:3857` +
    `&format=image/png&transparent=true` +
    timeParam
  );
}

/**
 * Round the requested local-time to the nearest UTC frame the ICON layer
 * publishes. The 0.25° global ICON has a 3-hourly step (PT3H) anchored on
 * model-run hours (00/03/06/09/12/15/18/21 UTC), so we snap to the
 * nearest multiple-of-3 hours from the current UTC hour-floor.
 */
export function forecastIsoForHour(forecastHour: number): string {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  // Snap the FUTURE-hour offset itself to a 3h grid, then add to the
  // (also-3h-aligned) current model-run anchor.
  const stepH = 3;
  const snappedHours = Math.round(forecastHour / stepH) * stepH;
  // Align "now" to its enclosing 3h slot — picks the most-recent model-run
  // hour that ICON publishes (server tolerates this regardless of the
  // hidden REFERENCE_TIME).
  const nowHour = now.getUTCHours();
  now.setUTCHours(nowHour - (nowHour % stepH));
  const target = new Date(now.getTime() + snappedHours * 3600_000);
  return target.toISOString();
}
