/**
 * GeoSphere Austria — die EINE Zuordnung der Punkt-Zeitreihen beider NWP-Datensätze (Phase GS, `audit/geosphere-v2.md`).
 *
 *   v1  `nwp-v1-1h-2500m`  AROME-AT 2,5 km — wird am 2026-11-04 eingestellt (Hinweis auf der Datensatzseite)
 *   v2  `nwp-v2-1h-1km`    C-LAEF AlpeAdria 1 km — Voreinstellung seit dem 2026-09-30
 *
 * Beide Leser des Repos (`pointForecast/sampleSources.ts` für den Punkt, `sources/geosphereArome.ts` für das Stützgitter
 * der Rasterfusion) lesen die Stunde h über `readGeoSphereHour`, damit die Bedeutung der Größen an genau einer Stelle
 * steht. Gemessen am 29./30.09.2026 an beiden Datensätzen (Innsbruck, Lauf 15 UTC):
 *
 *   Größe            v1                                   v2
 *   Temperatur       t2m °C                               2t °C
 *   Wind             u10m, v10m m/s                       10u, 10v m/s
 *   Böe              ugust, vgust (Komponenten)           10fg (Betrag)
 *   Feuchte          rh2m %                               2r %
 *   Schneefallgrenze snowlmt m                            snowlmt m
 *   Bewölkung        tcc 0…1                              tcc 0…100 %
 *   Niederschlag     rr_acc seit Laufbeginn (Differenz)   tp Stundensumme; Stunde 0 ohne Wert (Füllwert −1000 im Grid,
 *                                                         0/null in der Punkt-API) — negativ ⇒ null
 *
 * Takt (3 h) und Horizont (61 Stunden) sind gleich; die Zellen nicht — v2 ist ein anderes Modell auf einem feineren
 * Gitter, deshalb heißt es im Produkt `claef`, nicht `arome_at`.
 *
 * `?nwp=v1` (bzw. `localStorage.nwp = 'v1'`) liest bis zur Abschaltung weiter v1 — derselbe Code, andere Tabelle.
 */

export type GeoSphereNwpVersion = 'v1' | 'v2';

export const GEOSPHERE_NWP_DATASET: Readonly<Record<GeoSphereNwpVersion, string>> = Object.freeze({
  v1: 'nwp-v1-1h-2500m',
  v2: 'nwp-v2-1h-1km',
});

/** Der Quell-Tag im Punktprodukt (`pointForecast/types.ts`): ein anderes Modell, ein anderer Name. */
export const GEOSPHERE_NWP_SOURCE: Readonly<Record<GeoSphereNwpVersion, 'arome_at' | 'claef'>> = Object.freeze({
  v1: 'arome_at',
  v2: 'claef',
});

export const GEOSPHERE_NWP_LABEL: Readonly<Record<GeoSphereNwpVersion, string>> = Object.freeze({
  v1: 'GeoSphere AROME',
  v2: 'GeoSphere C-LAEF',
});

/** Die Parameter, die ein Leser anfordert (Punkt: alle; Gitter: `gridOnly`). */
export function geoSphereNwpParams(version: GeoSphereNwpVersion, gridOnly = false): string {
  if (version === 'v1') return gridOnly ? 't2m,u10m,v10m,tcc,rr_acc' : 't2m,u10m,v10m,ugust,vgust,rh2m,snowlmt,tcc,rr_acc';
  return gridOnly ? '2t,10u,10v,tcc,tp' : '2t,10u,10v,10fg,2r,snowlmt,tcc,tp';
}

export function geoSphereNwpUrl(version: GeoSphereNwpVersion, latLonParts: readonly string[], gridOnly = false): string {
  return `https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/${GEOSPHERE_NWP_DATASET[version]}`
    + `?parameters=${geoSphereNwpParams(version, gridOnly)}&${latLonParts.join('&')}`;
}

/** `?nwp=v1|v2` schlägt `localStorage.nwp`; alles andere ⇒ v2. */
export function geoSphereNwpVersion(search?: string, stored?: string | null): GeoSphereNwpVersion {
  let q: string | null | undefined, s = stored;
  try {
    q = new URLSearchParams(search ?? location.search).get('nwp');
    if (s === undefined) s = localStorage.getItem('nwp');
  } catch { /* kein Fenster, kaputte Query, gesperrter Speicher = kein Votum */ }
  for (const v of [q, s]) if (v === 'v1' || v === 'v2') return v;
  return 'v2';
}

export interface GeoSphereParams {
  [k: string]: { data?: Array<number | null> } | undefined;
}

export interface GeoSphereHour {
  temperature: number | null;
  u: number | null;
  v: number | null;
  /** Böe in m/s (Betrag). */
  gust: number | null;
  relativeHumidity: number | null;
  snowLine: number | null;
  /** Gesamtbewölkung in % (0…100), noch ohne Satelliten-Bias-Korrektur. */
  cloudTotalPct: number | null;
  /** Niederschlag der Stunde bis h in mm; null, wo die Quelle keine Summe kennt (Stunde 0). */
  precipitation: number | null;
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const at = (p: GeoSphereParams, k: string, h: number): number | null => { const x = p[k]?.data?.[h]; return fin(x) ? x : null; };

/** Die Stunde h eines Features, versionsunabhängig. h zählt ab dem ersten Zeitstempel der Antwort (= Laufzeit). */
export function readGeoSphereHour(p: GeoSphereParams, h: number, version: GeoSphereNwpVersion): GeoSphereHour {
  if (version === 'v1') {
    const ug = at(p, 'ugust', h), vg = at(p, 'vgust', h);
    const tcc = at(p, 'tcc', h);
    // rr_acc ist monoton seit Laufbeginn; die Stunde h ist die Differenz zu h − 1 (bei h = 0 zur Summe 0 — so las es
    // der Gitterleser schon vor Phase GS; die Summe zu Laufbeginn ist 0).
    const acc = at(p, 'rr_acc', h), prev = h > 0 ? at(p, 'rr_acc', h - 1) : 0;
    return {
      temperature: at(p, 't2m', h), u: at(p, 'u10m', h), v: at(p, 'v10m', h),
      gust: ug != null && vg != null ? Math.sqrt(ug * ug + vg * vg) : null,
      relativeHumidity: at(p, 'rh2m', h), snowLine: at(p, 'snowlmt', h),
      cloudTotalPct: tcc != null ? tcc * 100 : null,
      precipitation: acc != null && prev != null ? Math.max(0, acc - prev) : null,
    };
  }
  const tp = at(p, 'tp', h);
  return {
    temperature: at(p, '2t', h), u: at(p, '10u', h), v: at(p, '10v', h),
    gust: at(p, '10fg', h),
    relativeHumidity: at(p, '2r', h), snowLine: at(p, 'snowlmt', h),
    cloudTotalPct: at(p, 'tcc', h),
    // `tp` ist schon die Stundensumme; Stunde 0 hat kein Intervall (Füllwert negativ) ⇒ null.
    precipitation: h > 0 && tp != null && tp >= 0 ? tp : null,
  };
}
