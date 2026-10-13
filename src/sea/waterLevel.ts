/**
 * WL-1 — Contract of the water level line (`audit/wasserstand-bsh.md`): ONE file for producer
 * (`scripts/sea/sea-gauges.mjs`), client (`waterLevelClient.ts`) and verifier (`verify:sea-waterlevel`) —
 * endpoint, parameters, types after the official parameter documentation, parsers for the type traps, and the
 * rules of the mirrored catalogue. Pattern: `seaContract.ts`. Dependency-free on purpose.
 *
 * Source: BSH OGC API Features `gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast`, licence CC BY 4.0
 * (EU high-value dataset, free, no registration, commercial use covered — measured in the audit §2: every
 * feature carries `licence` and `copyright` itself). ONLY this API is read — never `wasserstand.bsh.de`,
 * never `www2.bsh.de/aktdat/…` (E-WL-3, Jan's brief).
 *
 * Two layers (E-WL-2):
 *   buscosun-data `sea/v1/static/gauges.json`   136 gauge positions + reference heights, built by OUR producer
 *                                               from the same official API (≈ 6 KB gz)
 *   live, per chosen gauge                      `…/items/{id}` — curve, high/low water, texts, timestamps
 *
 * Heights: every value is **cm above gauge zero (PNP)**, as the BSH delivers it. `zeroNhnCm` converts to NHN,
 * `chartDatumCm` to chart datum. North Sea texts refer to mean high water, Baltic texts to NHN — two
 * reference systems in one answer, never mixed in the UI (E-WL-9).
 */

// --- Endpoint (E-WL-3) ---------------------------------------------------------------------------

export const WL_SERVICE = 'https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast';
export const WL_COLLECTION = 'waterlevelforecastdata';
/** Human landing page of the service — the licence proof linked from the UI. */
export const WL_SERVICE_PAGE = `${WL_SERVICE}?f=html`;
export const WL_PARAM_DOC = 'https://www2.bsh.de/aktdat/wvd/api/parameter_documentation.pdf';
export const WL_LICENCE = 'CC BY 4.0';
export const WL_LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/deed.de';
/** Official warning service — buscosun never warns itself (E-WL-6, Jan's brief point 5). */
export const WL_WARN_SERVICE = 'https://www.sturmflutwarndienst.de';
/**
 * Attribution, verbatim as commissioned (E-WL-5). Split in two so the UI can put the licence link ON the
 * licence name without touching the wording; the verifier checks that the halves still add up to the whole.
 */
export const WL_ATTRIBUTION_PRE = 'Wasserstandsvorhersage: Bundesamt für Seeschifffahrt und Hydrographie (BSH), ';
export const WL_ATTRIBUTION_POST = ', eigene Darstellung';
export const WL_ATTRIBUTION = `${WL_ATTRIBUTION_PRE}${WL_LICENCE}${WL_ATTRIBUTION_POST}`;

/**
 * V-WL-1: without `lang` the service answers 301 to `lang=en`, and the redirect hop carries no CORS headers.
 * Asking with `lang=de` from the start avoids the hop. `properties=` is rejected with 400 (V-WL-4), so there
 * is no slim field selection — hence the split above.
 */
export const WL_LANG = 'de';
/** One page is enough (136 features measured); the producer still follows `rel: next` defensively. */
export const WL_PAGE_LIMIT = 1000;

export const wlItemsUrl = (limit = WL_PAGE_LIMIT, offset = 0): string =>
  `${WL_SERVICE}/collections/${WL_COLLECTION}/items?f=json&lang=${WL_LANG}&limit=${limit}${offset ? `&offset=${offset}` : ''}`;
export const wlItemUrl = (id: string): string =>
  `${WL_SERVICE}/collections/${WL_COLLECTION}/items/${encodeURIComponent(id)}?f=json&lang=${WL_LANG}`;
/** Page of the gauge on the BSH's own site — a deep link, never scraped (E-WL-3). */
export const wlGaugePage = (id: string): string => `https://wasserstand.bsh.de/${encodeURIComponent(id)}`;

/** Path of the mirrored catalogue inside `sea/v1/` (read with the `fetchSea` hedge). */
export const WL_CATALOG_PATH = 'static/gauges.json';

// --- Parsers for the measured type traps (V-WL-2) ----------------------------------------------

/**
 * V-WL-2: `tidal_prediction`, `measurement` and `tidal_prediction_value` arrive as STRINGS ("685"),
 * `forecast_value`, `forecast_uncertainty` and `automated_curve_forecast` as numbers; `state` can be the
 * string "nan". One reader for all of them — anything not finite becomes null, never 0 and never "685".
 */
export function wlNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.toLowerCase() === 'nan') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "nan" and "" are absences, not names. */
export function wlStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return !s || s.toLowerCase() === 'nan' ? null : s;
}

/** `"2026-10-12 15:03:00+02:00"` → ms. The offset is always explicit (parameter doc), the space is not ISO. */
export function wlTime(v: unknown): number | null {
  const s = wlStr(v);
  if (!s) return null;
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

/**
 * E-WL-8: the official text carries HTML emphasis (`<b>`). The markup goes, **the words stay exactly as
 * published** — no summary, no sharpening, no `dangerouslySetInnerHTML` (CLAUDE.md quoting rule).
 */
export function wlText(v: unknown): string | null {
  const raw = typeof v === 'string' ? v : wlStr((v as { de?: unknown } | null)?.de);
  if (!raw) return null;
  const plain = raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
  return plain || null;
}

/**
 * V-WL-7: gauge zero is defined BELOW the lowest water, so a mean high water of exactly 0 cm above it cannot
 * be a measurement. At `fynshav` and `sonderborg` (both Danish) the whole reference block is zero — mean
 * high water, mean low water and gauge zero against NHN. A pair of 0/0 therefore carries no information and
 * becomes an absence here; an equal pair at a real height (`prerow` 500/500, tideless Baltic) is kept.
 */
export function wlRefPair(mhw: number | null, mlw: number | null): [number | null, number | null] {
  return mhw === 0 && mlw === 0 ? [null, null] : [mhw, mlw];
}

// --- Warning categories (Tab. 5 of the parameter doc) ------------------------------------------

/**
 * The official categories, verbatim from the documentation (German spelling of the API, "Erhoehter" without
 * umlaut). **Documentation and verifier only** — we never derive a category from a threshold (E-WL-6); the
 * one we show is the one the API sends. The doc states the level "does not apply specifically to a
 * particular gauge station" but to the North Sea resp. Baltic Sea, and the UI says so.
 */
export const WL_WARN_LEVELS = [
  'Wasserstandsvorhersage',
  'Erhoehter Wasserstand',
  'Sturmflut',
  'Schwere Sturmflut',
  'Sehr schwere Sturmflut',
  'Niedriger Wasserstand',
  'Niedrigwasser',
  'Schweres Niedrigwasser',
  'Sehr schweres Niedrigwasser',
] as const;
export type WlWarnLevel = (typeof WL_WARN_LEVELS)[number];
/** The normal case: "Wasserstandsvorhersage" means no raised or low water category is in force. */
export const WL_WARN_DEFAULT = 'Wasserstandsvorhersage';
/** True for the normal case or an absent value — the only judgement we make about a category. */
export const wlIsDefaultWarning = (v: string | null | undefined): boolean => !v || v.trim() === WL_WARN_DEFAULT;

// --- Catalogue (`sea/v1/static/gauges.json`, E-WL-2) -------------------------------------------

export type WlRegion = 'north_sea' | 'baltic_sea';
export const WL_REGION_LABEL: Record<WlRegion, string> = { north_sea: 'Nordsee', baltic_sea: 'Ostsee' };

export interface WlGauge {
  /** Station identifier of the API, also the path segment of `items/{id}`. */
  id: string;
  /** `gauge_label`, e.g. "Cuxhaven, Steubenhöft, Elbe". */
  name: string;
  lat: number; lon: number;
  region: WlRegion;
  /** Coastal area the BSH assigns the gauge to ("Elbe", "Kieler Bucht" …) — the scope of the official text. */
  area: string | null;
  state: string | null;
  /** Gauge zero relative to NHN, cm (measured −511 … 0). */
  zeroNhnCm: number | null;
  /** Chart datum relative to gauge zero, cm. */
  chartDatumCm: number | null;
  /**
   * Mean high/low water, cm above gauge zero (absent at 5 resp. 8 of 136 gauges — V-WL-6). In the tideless
   * Baltic the two can be EQUAL and still be real (`prerow` 500/500 at a gauge zero 498 cm below NHN); a
   * pair of 0/0 is the service's placeholder and arrives here as null (V-WL-7).
   */
  mhwCm: number | null;
  mlwCm: number | null;
  /** `bsh_url_waterlevel` — the BSH's own page for this gauge. */
  url: string | null;
  /** `measurement_url` — PEGELONLINE master data of the operator (83 of 136). */
  measureUrl: string | null;
  operatorId: string | null;
  /**
   * What the gauge carried when the catalogue was built: a curve (93 of 136) and/or high/low water events
   * (82 of 136, all North Sea). A hint for the UI, never a promise — the live answer decides (V-WL-6).
   */
  has: { curve: boolean; events: boolean };
}

export interface WlCatalog {
  product: 'sea-gauges';
  /** What the file is and where it comes from, in the file (pattern `static/spots.json`). */
  about: string;
  /** When our producer built it (ISO). */
  builtAt: string;
  /** The official endpoint it was built from — provenance in the file itself. */
  source: string;
  licence: string;
  attribution: string;
  /** `copyright.de` of the API, verbatim. */
  copyright: string | null;
  gauges: WlGauge[];
}

export const WL_CATALOG_PRODUCT = 'sea-gauges';
/** The service's own bbox (measured): 6,747778 / 53,073056 … 14,7317 / 55,016667, plus a small margin. */
export const WL_BBOX: [number, number, number, number] = [6.5, 52.9, 15.0, 55.2];

/** Catalogue rules — the producer refuses to publish a file that breaks one, the client drops that gauge. */
export function wlCatalogProblems(gauges: readonly WlGauge[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const g of gauges) {
    const at = g.id || '(ohne Kennung)';
    if (!g.id || typeof g.id !== 'string') out.push(`${at}: Kennung fehlt`);
    else if (ids.has(g.id)) out.push(`${at}: doppelt`);
    ids.add(g.id);
    if (!g.name) out.push(`${at}: Name fehlt`);
    if (!Number.isFinite(g.lat) || !Number.isFinite(g.lon)) out.push(`${at}: Lage fehlt`);
    else if (g.lon < WL_BBOX[0] || g.lat < WL_BBOX[1] || g.lon > WL_BBOX[2] || g.lat > WL_BBOX[3]) out.push(`${at}: außerhalb der Dienst-BBox`);
    if (g.region !== 'north_sea' && g.region !== 'baltic_sea') out.push(`${at}: Revier "${g.region}" unbekannt`);
    // V-WL-7: equality is legitimate without a tide (Baltic), only an inversion is impossible.
    if (g.mhwCm != null && g.mlwCm != null && g.mhwCm < g.mlwCm) out.push(`${at}: MHW ${g.mhwCm} unter MNW ${g.mlwCm}`);
    if (!g.has.curve && !g.has.events) out.push(`${at}: weder Kurve noch Hoch-/Niedrigwasser`);
  }
  return out;
}

// --- Live forecast of one gauge (`items/{id}`) --------------------------------------------------

export interface WlCurvePoint {
  t: number;
  /** Tidal prediction, cm above gauge zero (39 of 93 curves). */
  tide: number | null;
  /** Automatically generated model curve, cm above gauge zero. */
  forecast: number | null;
  /** Measured series, cm above gauge zero. */
  measured: number | null;
}

export interface WlEvent {
  t: number;
  kind: 'HW' | 'NW';
  tide: number | null;
  /** Official forecast height of the event, cm above gauge zero. */
  forecast: number | null;
  /** Uncertainty of that height, cm. */
  uncertaintyCm: number | null;
  /** `forecast_deviation` against mean high/low water — a formatted string ("+0,2 m"), quoted, never recomputed. */
  deviation: string | null;
  /** `forecast_automated_event_warning`, verbatim (E-WL-6). */
  warning: string | null;
  /** When this event's official forecast was last updated. */
  forecastAt: number | null;
  /**
   * V-WL-8: the automatic MOS forecast of the same event, cm above gauge zero. It is NOT the official value
   * and is never shown as one — but it is the only number beyond ≈ +21 h, where `forecast` is absent
   * (measured: official values reach −4,5 … +20,9 h, MOS −13,2 … +133,6 h; 732 of 1 863 events carry only
   * MOS). Read as the first available of the documented systems r0 … r5 (Tab. 3: r1–r5 are the fallbacks
   * when r0 cannot run), with the system named so the UI can say which one spoke.
   */
  mosCm: number | null;
  mosSystem: 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | null;
  /** Deviation of the MOS height against mean high/low water — the service's formatted string, quoted. */
  mosDeviation: string | null;
  mosAt: number | null;
}

/** The MOS systems in the order the documentation gives them: r0 is the main one, r1 … r5 its fallbacks. */
export const WL_MOS_SYSTEMS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'] as const;
export type WlMosSystem = (typeof WL_MOS_SYSTEMS)[number];
/** What each fallback stands in for (Tab. 3), for the UI's own words — not a judgement, the doc's reason. */
export const WL_MOS_WHY: Record<WlMosSystem, string> = {
  r0: 'Hauptsystem',
  r1: 'Ersatz, weil die Messung dieses Pegels fehlt',
  r2: 'Ersatz, weil die Messung des Pegels oberhalb fehlt',
  r3: 'Ersatz ohne das Wettermodell GFS',
  r4: 'Ersatz, weil das numerische Wasserstandsmodell fehlt',
  r5: 'Ersatz nur aus dem numerischen Modell, ohne Messungen',
};

export interface WlForecast {
  id: string;
  name: string;
  region: WlRegion;
  area: string | null;
  lat: number | null; lon: number | null;
  zeroNhnCm: number | null;
  chartDatumCm: number | null;
  mhwCm: number | null;
  mlwCm: number | null;
  /** `official_warning_level_region`, verbatim — valid for the sea, NOT for this gauge (parameter doc). */
  warningLevel: string | null;
  /** `automated_gauge_warning`, verbatim (82 of 136). */
  gaugeWarning: string | null;
  /** Official forecast text as published, de, markup removed (E-WL-8). Scope = `area`, not the single gauge. */
  text: string | null;
  textAdditional: string | null;
  /** Operational notice (technical disruptions) — empty at all gauges on 12.10.2026. */
  info: string | null;
  licence: string | null;
  /** `copyright.de`, verbatim — carries the BSH's disclaimer and the §1 SeeAufG reference. */
  copyright: string | null;
  /** Official forecast (the text and the events). */
  forecastAt: number | null;
  /** Automatic model curve — measured 13 min old while the official one was 4 h old. */
  curveAt: number | null;
  curve: WlCurvePoint[];
  events: WlEvent[];
  url: string | null;
  measureUrl: string | null;
  /** `timeStamp` of the answer, i.e. when the API rendered it. */
  servedAt: number | null;
}

type Props = Record<string, unknown>;

const region = (v: unknown): WlRegion => (wlStr(v) === 'baltic_sea' ? 'baltic_sea' : 'north_sea');

/** One feature of `items` or `items/{id}` → the compact catalogue entry (producer side). */
export function wlGaugeOf(feature: unknown): WlGauge | null {
  const f = feature as { id?: unknown; properties?: Props; geometry?: { coordinates?: unknown } } | null;
  const p = f?.properties;
  const id = wlStr(f?.id);
  if (!id || !p) return null;
  const coords = Array.isArray(f?.geometry?.coordinates) ? (f!.geometry!.coordinates as unknown[]) : null;
  const lon = wlNum(coords?.[0]) ?? wlNum(p.longitude);
  const lat = wlNum(coords?.[1]) ?? wlNum(p.latitude);
  if (lon == null || lat == null) return null;
  const curve = Array.isArray(p.curve) ? (p.curve as unknown[]) : [];
  const events = Array.isArray(p.high_water_low_water) ? (p.high_water_low_water as unknown[]) : [];
  const ref = wlRefPair(wlNum(p.mean_high_water), wlNum(p.mean_low_water));
  return {
    id,
    name: wlStr(p.gauge_label) ?? id,
    lat, lon,
    region: region(p.region),
    area: wlStr(p.area),
    state: wlStr(p.state),
    zeroNhnCm: wlNum(p.gaugezero_relative_to_nhn),
    chartDatumCm: wlNum(p.chartdatum_relative_to_gaugezero),
    mhwCm: ref[0],
    mlwCm: ref[1],
    url: wlStr(p.bsh_url_waterlevel) ?? wlGaugePage(id),
    measureUrl: wlStr(p.measurement_url),
    operatorId: wlStr(p.operator_gauge_id),
    has: { curve: curve.length > 0, events: events.length > 0 },
  };
}

/** One feature → the live forecast (client side). Every block is optional; absence is never a zero (V-WL-6). */
export function wlForecastOf(doc: unknown, servedAt: number | null = null): WlForecast | null {
  const f = doc as { id?: unknown; properties?: Props; geometry?: { coordinates?: unknown }; timeStamp?: unknown } | null;
  const p = f?.properties;
  const id = wlStr(f?.id);
  if (!id || !p) return null;
  const coords = Array.isArray(f?.geometry?.coordinates) ? (f!.geometry!.coordinates as unknown[]) : null;

  const curve: WlCurvePoint[] = [];
  for (const row of Array.isArray(p.curve) ? (p.curve as Props[]) : []) {
    const t = wlTime(row?.timestamp);
    if (t == null) continue;
    const tide = wlNum(row.tidal_prediction), forecast = wlNum(row.automated_curve_forecast), measured = wlNum(row.measurement);
    if (tide == null && forecast == null && measured == null) continue;
    curve.push({ t, tide, forecast, measured });
  }
  curve.sort((a, b) => a.t - b.t);

  const ref = wlRefPair(wlNum(p.mean_high_water), wlNum(p.mean_low_water));
  const events: WlEvent[] = [];
  for (const row of Array.isArray(p.high_water_low_water) ? (p.high_water_low_water as Props[]) : []) {
    const t = wlTime(row?.event_timestamp);
    const kind = wlStr(row?.event);
    if (t == null || (kind !== 'HW' && kind !== 'NW')) continue;
    const sys = WL_MOS_SYSTEMS.find((k) => wlNum(row[`mos_forecast_${k}_value`]) != null) ?? null;
    events.push({
      t, kind,
      tide: wlNum(row.tidal_prediction_value),
      forecast: wlNum(row.forecast_value),
      uncertaintyCm: wlNum(row.forecast_uncertainty),
      deviation: wlStr(row.forecast_deviation),
      warning: wlStr(row.forecast_automated_event_warning),
      forecastAt: wlTime(row.forecast_event_forecast_timestamp),
      mosCm: sys ? wlNum(row[`mos_forecast_${sys}_value`]) : null,
      mosSystem: sys,
      mosDeviation: sys ? wlStr(row[`mos_forecast_${sys}_deviation`]) : null,
      mosAt: wlTime(row.mos_forecast_event_forecast_timestamp),
    });
  }
  events.sort((a, b) => a.t - b.t);

  return {
    id,
    name: wlStr(p.gauge_label) ?? id,
    region: region(p.region),
    area: wlStr(p.area),
    lon: wlNum(coords?.[0]) ?? wlNum(p.longitude),
    lat: wlNum(coords?.[1]) ?? wlNum(p.latitude),
    zeroNhnCm: wlNum(p.gaugezero_relative_to_nhn),
    chartDatumCm: wlNum(p.chartdatum_relative_to_gaugezero),
    mhwCm: ref[0],
    mlwCm: ref[1],
    warningLevel: wlStr(p.official_warning_level_region),
    gaugeWarning: wlStr(p.automated_gauge_warning),
    text: wlText(p.forecast_text),
    textAdditional: wlText(p.forecast_text_additional),
    info: wlText(p.information_text),
    licence: wlStr(p.licence),
    copyright: wlText(p.copyright),
    forecastAt: wlTime(p.forecast_timestamp),
    curveAt: wlTime(p.automated_curveforecast_timestamp),
    curve, events,
    url: wlStr(p.bsh_url_waterlevel) ?? wlGaugePage(id),
    measureUrl: wlStr(p.measurement_url),
    servedAt: servedAt ?? wlTime(f?.timeStamp),
  };
}

// --- Reading the forecast ----------------------------------------------------------------------

const EARTH_R_KM = 6371;
/** Great-circle distance in km (local on purpose: the sea chunk stays free of other modules). */
export function wlDistKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const s = Math.sin(((bLat - aLat) * r) / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * E-WL-7: the nearest gauge, without a distance limit but with the distance named. No interpolation between
 * gauges — the tidal phase shifts by kilometres, a mean of two gauges would be an invention.
 */
export function wlNearest(gauges: readonly WlGauge[], lat: number, lon: number): { gauge: WlGauge; km: number } | null {
  let best: { gauge: WlGauge; km: number } | null = null;
  for (const g of gauges) {
    const km = wlDistKm(lat, lon, g.lat, g.lon);
    if (!best || km < best.km) best = { gauge: g, km };
  }
  return best;
}

/**
 * The curve point at or just before `t`, but only if it is no older than `maxGapMs` — the page's hour axis
 * runs to +78 h while the BSH curve ends at +54 h (median), so without this the last point of the curve
 * would be labelled as the value of an hour hours later. Beyond the curve the answer is null, and the card
 * says the curve does not reach that far.
 */
export const WL_AT_TOLERANCE_MS = 3_600_000;
export function wlAt(curve: readonly WlCurvePoint[], t: number, maxGapMs = WL_AT_TOLERANCE_MS): WlCurvePoint | null {
  let out: WlCurvePoint | null = null;
  for (const p of curve) {
    if (p.t > t) break;
    out = p;
  }
  return out && t - out.t <= maxGapMs ? out : null;
}

/** Last instant the curve carries a value — for the sentence when the chosen hour lies beyond it. */
export const wlCurveEnd = (curve: readonly WlCurvePoint[]): number | null => (curve.length ? curve[curve.length - 1].t : null);

/** The next events after `t` (default: the next four, i.e. about one day of tide). */
export function wlNextEvents(events: readonly WlEvent[], t: number, n = 4): WlEvent[] {
  return events.filter((e) => e.t >= t).slice(0, n);
}

/**
 * Is any category in this answer other than the normal case? Reads the two verbatim fields and the events —
 * no threshold of our own. True ⇒ the category and the link to the official warning service stand above the
 * numbers (E-WL-6).
 */
export function wlHasCategory(f: WlForecast): string | null {
  if (!wlIsDefaultWarning(f.warningLevel)) return f.warningLevel!;
  if (!wlIsDefaultWarning(f.gaugeWarning)) return f.gaugeWarning!;
  for (const e of f.events) if (!wlIsDefaultWarning(e.warning)) return e.warning!;
  return null;
}

/** Freshness of the model curve: it was 13 min old when measured, the official forecast 4 h (audit §3). */
export const WL_CURVE_STALE_MS = 3 * 3_600_000;
export const WL_FORECAST_STALE_MS = 12 * 3_600_000;

// --- Fill level of the gauge (WL-5, Jan 13.10.2026: "Füllstand anzeigen") -------------------------

/** Mark on the fill scale, cm above gauge zero; the label is the official abbreviation of that reference. */
export interface WlFillMark { cm: number; label: 'MThw' | 'MTnw' | 'MHW' | 'MNW' | 'MW' | 'NHN' }

export interface WlFill {
  /** The value shown, cm above gauge zero — the curve's forecast, or the measurement where no forecast is. */
  cm: number;
  kind: 'forecast' | 'measured';
  /** Time of that curve point. */
  t: number;
  /** Scale of the gauge glass, cm above gauge zero, multiples of 10 (same rounding as the chart). */
  lo: number; hi: number;
  /** Position of the value on the scale, 0 … 1. */
  frac: number;
  marks: WlFillMark[];
  /** Plain differences in the SAME reference (cm above gauge zero) — no conversion, no model of ours. */
  vsHigh: number | null;
  vsLow: number | null;
  /** The value against NHN, cm — only when the gauge zero is known against NHN. */
  nhnCm: number | null;
  /** Where the value stands against the gauge's mean low … mean high water; null without both or when equal. */
  band: 'below' | 'within' | 'above' | null;
  /** How much of the span mean low → mean high water is "filled" (0 … 1, may leave that range); null like `band`. */
  spanFrac: number | null;
  /** Words of this region: the North Sea has a tide (MThw/MTnw, "Tidehub"), the Baltic has MHW/MNW. */
  highLabel: 'MThw' | 'MHW'; lowLabel: 'MTnw' | 'MNW'; spanLabel: string;
}

export interface WlFillRefs {
  region: WlRegion;
  mhwCm: number | null; mlwCm: number | null; zeroNhnCm: number | null;
}

/** Scale rounding shared with the chart (`WaterLevelChart`): pad ≥ 20 cm or 12 %, outer bounds to tens. */
export function wlFillScale(values: readonly number[]): [number, number] {
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max(20, (hi - lo) * 0.12);
  return [Math.floor((lo - pad) / 10) * 10, Math.ceil((hi + pad) / 10) * 10];
}

/**
 * The fill level of the gauge at one curve point: the value as delivered (cm above gauge zero), on a scale that
 * holds the chart window and the gauge's own reference heights, with those heights as marks. Everything here is
 * subtraction in one reference system — never a conversion to another gauge, never an invented height.
 * `null` when there is no point: a gauge without a value shows no glass (V-WL-6, absence ≠ zero).
 */
export function wlFill(point: WlCurvePoint | null, window: readonly WlCurvePoint[], refs: WlFillRefs): WlFill | null {
  if (!point) return null;
  const cm = point.forecast ?? point.measured;
  if (cm == null) return null;
  const kind: WlFill['kind'] = point.forecast != null ? 'forecast' : 'measured';
  const [mhw, mlw] = wlRefPair(refs.mhwCm, refs.mlwCm);
  const nhnAt = refs.zeroNhnCm != null ? -refs.zeroNhnCm : null;
  const values = [cm, ...window.flatMap((p) => [p.forecast, p.measured, p.tide]), mhw, mlw].filter((v): v is number => v != null);
  const [lo, hi] = wlFillScale(values);
  const baltic = refs.region === 'baltic_sea';
  const highLabel = baltic ? 'MHW' : 'MThw', lowLabel = baltic ? 'MNW' : 'MTnw';
  const marks: WlFillMark[] = [];
  if (mhw != null && mlw != null && mhw === mlw) marks.push({ cm: mhw, label: 'MW' });
  else {
    if (mhw != null) marks.push({ cm: mhw, label: highLabel });
    if (mlw != null) marks.push({ cm: mlw, label: lowLabel });
  }
  if (nhnAt != null && nhnAt >= lo && nhnAt <= hi) marks.push({ cm: nhnAt, label: 'NHN' });
  const tidal = mhw != null && mlw != null && mhw > mlw;
  return {
    cm, kind, t: point.t, lo, hi,
    frac: hi > lo ? Math.min(1, Math.max(0, (cm - lo) / (hi - lo))) : 0,
    marks,
    vsHigh: mhw != null ? cm - mhw : null,
    vsLow: mlw != null ? cm - mlw : null,
    nhnCm: nhnAt != null ? cm - nhnAt : null,
    band: tidal ? (cm < mlw! ? 'below' : cm > mhw! ? 'above' : 'within') : null,
    spanFrac: tidal ? (cm - mlw!) / (mhw! - mlw!) : null,
    highLabel, lowLabel,
    spanLabel: baltic ? `Spanne ${lowLabel}–${highLabel}` : 'Tidehub',
  };
}
