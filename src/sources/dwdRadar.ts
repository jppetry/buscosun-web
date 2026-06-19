/**
 * DWD RADOLAN — Niederschlagsradar via maps.dwd.de WMS.
 *
 * RainViewer is being shut down through 2026, so for Germany we switch to
 * the DWD GeoServer that hosts the official RADOLAN composites at 1 km/5 min
 * with an integrated 2-hour nowcast (WN product). Free, CC-BY 4.0.
 *
 * Layers (as published on https://maps.dwd.de/geoserver):
 *   dwd:Niederschlagsradar    — RY product, current 5-min precipitation rate
 *   dwd:Radarniederschlag_RW  — RW product, hourly accumulated mm
 *   dwd:Radarniederschlag_RV  — RV/WN product, 0-2h precipitation nowcast
 *
 * MapLibre's raster source supports WMS via the {bbox-epsg-3857} placeholder.
 */

/** Returns a MapLibre raster-source tile URL template for a DWD WMS layer. */
export function buildDwdWmsTemplate(layer: string, extra: Record<string, string> = {}): string {
  const base = 'https://maps.dwd.de/geoserver/dwd/wms';
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: layer,
    styles: '',
    bbox: '{bbox-epsg-3857}',
    width: '256',
    height: '256',
    srs: 'EPSG:3857',
    format: 'image/png',
    transparent: 'true',
    ...extra,
  });
  return `${base}?${params.toString()}`;
}

/**
 * Snap a Date to the nearest 5-minute boundary aligned with DWD's RV product
 * publication schedule (it emits a new full nowcast every 5 minutes on the
 * 5-min UTC grid). DWD's WMS rejects any TIME value that doesn't sit exactly
 * on this grid (HTTP 200 + ServiceException XML).
 */
export function snapToDwdFrame(d: Date): Date {
  const t = new Date(d.getTime());
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() - (t.getUTCMinutes() % 5));
  return t;
}

function toDwdTimeParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00Z`
  );
}

/** Common pre-built layer templates. */
export const DWD_LAYERS = {
  /** 5-min quantitative precipitation rate (RADOLAN-RY, mm/h). */
  rainNow: buildDwdWmsTemplate('dwd:RADOLAN-RY'),
  /** Hourly precipitation accumulation. */
  rainHour: buildDwdWmsTemplate('dwd:Radarniederschlag_RW'),
  /** 0-2 h precipitation nowcast (Radar-Vorhersage / RADVOR). */
  rainNowcast: buildDwdWmsTemplate('dwd:Radar_rv_product_1x1km_ger'),
} as const;

export interface DwdWmsFrame {
  /** WMS tile URL template (with {bbox-epsg-3857} placeholder). */
  template: string;
  /** Logical timestamp the layer is valid for; for WMS we just use 'now'. */
  validAt: number;
  /** Attribution string (CC-BY 4.0 mandatory). */
  attribution: string;
  /** Display name of the underlying product. */
  product: string;
}

export function dwdRainFrame(kind: keyof typeof DWD_LAYERS = 'rainNow'): DwdWmsFrame {
  const product = ({
    rainNow: 'RADOLAN-RY (5 min)',
    rainHour: 'RADOLAN-RW (1 h)',
    rainNowcast: 'RADOLAN-RV (Nowcast 0-2 h)',
  } as const)[kind];
  return {
    template: DWD_LAYERS[kind],
    validAt: Date.now(),
    attribution:
      'Quelle: <a href="https://www.dwd.de/copyright" target="_blank" rel="noopener">DWD</a> — RADOLAN, CC BY 4.0',
    product,
  };
}

/**
 * Build a DWD RV-nowcast frame at `now + offsetMinutes`. The dwd:Niederschlagsradar
 * layer is the RV product alias and serves forecast frames up to +120 min ahead.
 * offsetMinutes is snapped down to a 5-min boundary (DWD frame grid).
 *
 * Example offsets:
 *   0   → latest measured 5-min composite ("now")
 *   60  → +1 h precipitation nowcast
 *   120 → +2 h precipitation nowcast
 */
export function dwdNowcastFrame(offsetMinutes: number): DwdWmsFrame {
  const now = snapToDwdFrame(new Date());
  // RV publishes the +2 h horizon but the very latest 5-min slot may not be
  // fully populated yet — clamp to +115 min to stay safely inside the extent.
  const safeOffset = Math.max(0, Math.min(115, Math.round(offsetMinutes / 5) * 5));
  const target = new Date(now.getTime() + safeOffset * 60_000);
  const timeIso = toDwdTimeParam(target);
  // Two DWD layers cover the precipitation horizon:
  //   - `RADOLAN-RY` — quantitative 5-min precipitation rate in mm/h
  //     (the "gold standard" live radar for DE), 1 km grid. Replaces
  //     the older `Niederschlagsradar` reflectivity composite which
  //     was less directly interpretable.
  //   - `Radar_rv_product_1x1km_ger` — RV (Radar-Vorhersage) nowcast
  //     product, publishes 5-min frames from +5 min to +120 min.
  //     RV is the actual DWD RADVOR nowcast — what older docs label
  //     "RADVOR-RQ" or similar is the same underlying product family,
  //     just packaged differently. There is NO separate "RADVOR-RQ"
  //     WMS layer (verified via GetCapabilities 2026-05).
  const isFuture = safeOffset > 0;
  const layer = isFuture ? 'dwd:Radar_rv_product_1x1km_ger' : 'dwd:RADOLAN-RY';
  return {
    template: buildDwdWmsTemplate(layer, { TIME: timeIso }),
    validAt: target.getTime(),
    attribution:
      'Quelle: <a href="https://www.dwd.de/copyright" target="_blank" rel="noopener">DWD</a> — RADOLAN-RV Nowcast, CC BY 4.0',
    product: safeOffset === 0
      ? 'RADOLAN-RV (jetzt)'
      : `RADOLAN-RV (+${safeOffset} min)`,
  };
}

/**
 * Probe the WMS endpoint to make sure it's reachable before installing the
 * raster source (avoids "tiles silently fail" in production). Cheap HEAD on a
 * known low-zoom tile.
 */
export async function probeDwdRadar(signal?: AbortSignal): Promise<boolean> {
  try {
    // Tiny GetMap covering DACH at low zoom — gives us a quick health-check.
    const url =
      'https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.1.1&request=GetMap' +
      '&layers=dwd:Niederschlagsradar&styles=&bbox=556597,5009377,1668792,7361866' +
      '&width=64&height=64&srs=EPSG:3857&format=image/png&transparent=true';
    const res = await fetch(url, { signal, method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
