/**
 * Phase HDR (`audit/hd-radar.md`, Jan 04.11.2026): the attribution of the three national radar sources in ONE
 * dependency-free leaf module, so that the texts can be shown in the UI without pulling the readers (`radolan.ts`,
 * `geosphereIncaGrid.ts`, `meteoSwissRadar.ts`) into the component chunks. The three constants keep their names
 * (the readers re-export them); the HTML form is the one the MapLibre attribution control would render.
 *
 * Licences: DWD open data CC BY 4.0 (`docs/API.md` §7); GeoSphere Austria data hub CC BY 4.0; MeteoSwiss open
 * government data, "Source: MeteoSwiss" (opendatadocs.meteoswiss.ch, 04.11.2026 — named CC BY 4.0 in the app
 * since Phase RL, left as it stands).
 */

export const RADOLAN_RV_ATTRIBUTION =
  'Nowcast: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD RADOLAN-RV</a> · CC BY 4.0';

export const GEOSPHERE_INCA_ATTRIBUTION =
  'Nowcast: <a href="https://www.geosphere.at" target="_blank" rel="noopener">GeoSphere Austria</a> ' +
  'INCA (RR) · CC BY 4.0';

export const METEOSWISS_RADAR_ATTRIBUTION =
  'Radar: <a href="https://www.meteoschweiz.admin.ch" target="_blank" rel="noopener">MeteoSchweiz</a> ' +
  'rzc (RR) · CC BY 4.0';

/** DE · AT · CH — the order of the country radars everywhere in the app. */
export const RADAR_ATTRIBUTIONS: readonly string[] = Object.freeze([RADOLAN_RV_ATTRIBUTION, GEOSPHERE_INCA_ATTRIBUTION, METEOSWISS_RADAR_ATTRIBUTION]);

export interface RadarAttributionParts {
  /** text before the link (without the colon), e.g. `Nowcast` */
  kind: string;
  href: string;
  /** link text, e.g. `DWD RADOLAN-RV` */
  name: string;
  /** text after the link, trimmed, e.g. `· CC BY 4.0` or `INCA (RR) · CC BY 4.0` */
  rest: string;
}

/** Splits one attribution string into its parts — the ONE place that knows the HTML form above. */
export function parseRadarAttribution(html: string): RadarAttributionParts {
  const m = /^(.*?):\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>\s*(.*)$/.exec(html);
  if (!m) throw new Error(`Attribution ohne Link: ${html}`);
  return { kind: m[1].trim(), href: m[2], name: m[3].trim(), rest: m[4].trim() };
}

/** Plain text of one attribution (no tags): `DWD RADOLAN-RV · CC BY 4.0`. */
export function radarAttributionPlain(html: string): string {
  const p = parseRadarAttribution(html);
  return `${p.name}${p.rest ? ` ${p.rest}` : ''}`;
}

/** All three as plain text, DE · AT · CH, for a one-line source note. */
export function radarAttributionsPlain(): string {
  return RADAR_ATTRIBUTIONS.map(radarAttributionPlain).join(' · ');
}
