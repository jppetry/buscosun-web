/**
 * DWD Pollenflug-Gefahrenindex via opendata.dwd.de.
 *
 * Daily JSON published around 11:00 local time with the pollen hazard index
 * for ~11 forecast regions in Germany × ~8 pollen species (Hasel, Erle,
 * Esche, Birke, Gräser, Roggen, Beifuß, Ambrosia). Each species has a value
 * for today / tomorrow / day-after on a 0..6 hazard scale (string keys
 * like "0", "0-1", "1-2", "2-3" — half steps for borderline days).
 *
 * Free, no API key, CC BY 4.0, commercial OK. DE only — AT/CH have no
 * equivalent open-data feed (GeoSphere has internal pollen, MeteoSwiss
 * subscription-only).
 */

// opendata.dwd.de blocks browser CORS. In dev we proxy via vite.config.ts;
// in prod the same path needs to map to a server-side CORS proxy or a
// CDN-mirrored copy. Same-origin path keeps both environments identical.
const POLLEN_URL = '/_dwd_opendata/climate_environment/health/alerts/s31fg.json';

export type PollenSpecies =
  | 'Hasel' | 'Erle' | 'Esche' | 'Birke'
  | 'Graeser' | 'Roggen' | 'Beifuss' | 'Ambrosia';

export const POLLEN_SPECIES: PollenSpecies[] = [
  'Hasel', 'Erle', 'Esche', 'Birke',
  'Graeser', 'Roggen', 'Beifuss', 'Ambrosia',
];

/** Display label for the German species spellings. */
export const POLLEN_LABEL: Record<PollenSpecies, string> = {
  Hasel: 'Hasel',
  Erle: 'Erle',
  Esche: 'Esche',
  Birke: 'Birke',
  Graeser: 'Gräser',
  Roggen: 'Roggen',
  Beifuss: 'Beifuß',
  Ambrosia: 'Ambrosia',
};

export interface PollenLevels {
  today: number;          // 0..6 — half steps midpointed
  tomorrow: number;
  dayAfter: number;
}

export interface PollenForecast {
  region: string;          // e.g. "Schleswig-Holstein und Hamburg / Geest"
  legend: string;          // mapping description
  fetchedAt: number;
  species: Record<PollenSpecies, PollenLevels>;
}

interface DwdPollenLevels {
  today?: string;
  tomorrow?: string;
  dayafter_to?: string;    // sic — DWD really uses this key
}
interface DwdPollenRegion {
  region_id: number;
  region_name: string;
  partregion_id: number;
  partregion_name: string;
  Pollen: Record<string, DwdPollenLevels>;
}
interface DwdPollenResponse {
  sender: string;
  content: DwdPollenRegion[];
  legend?: Record<string, string>;
}

/** Approximate centroid of each (region_id, partregion_id) for nearest-region lookup. */
interface RegionCentroid {
  region_id: number;
  partregion_id: number;
  lat: number;
  lng: number;
  label: string;
}
const REGION_CENTROIDS: RegionCentroid[] = [
  { region_id: 10, partregion_id: 11, lat: 54.40, lng:  8.90, label: 'SH/HH · Inseln und Marschen' },
  { region_id: 10, partregion_id: 12, lat: 53.80, lng: 10.00, label: 'SH/HH · Geest, Schleswig-Holstein' },
  { region_id: 20, partregion_id:  0, lat: 53.80, lng: 12.40, label: 'Mecklenburg-Vorpommern' },
  { region_id: 30, partregion_id: 31, lat: 53.30, lng:  8.30, label: 'NS/HB · Westl. Niedersachsen' },
  { region_id: 30, partregion_id: 32, lat: 52.20, lng:  9.30, label: 'NS/HB · Östl. Niedersachsen' },
  { region_id: 40, partregion_id: 41, lat: 51.50, lng:  6.70, label: 'NRW · Rhein/Ruhr' },
  { region_id: 40, partregion_id: 42, lat: 51.20, lng:  8.20, label: 'NRW · Eifel/Rothaargebirge' },
  { region_id: 50, partregion_id:  0, lat: 52.50, lng: 13.40, label: 'Berlin/Brandenburg' },
  { region_id: 60, partregion_id: 61, lat: 51.50, lng: 11.50, label: 'Sachsen-Anhalt · Nord' },
  { region_id: 60, partregion_id: 62, lat: 51.50, lng: 11.90, label: 'Sachsen-Anhalt · Harzkamm' },
  { region_id: 70, partregion_id: 71, lat: 50.85, lng: 13.40, label: 'Thür./Sachsen · Tiefland' },
  { region_id: 70, partregion_id: 72, lat: 50.55, lng: 11.30, label: 'Thür./Sachsen · Mittelgeb.' },
  { region_id: 80, partregion_id: 81, lat: 50.30, lng:  8.50, label: 'Hessen/Rheinland-Pfalz · Tiefland' },
  { region_id: 80, partregion_id: 82, lat: 50.20, lng:  7.50, label: 'Hessen/Rheinland-Pfalz · Mittelgeb.' },
  { region_id: 90, partregion_id: 91, lat: 48.40, lng:  8.50, label: 'BW · Oberrhein/Niederb.' },
  { region_id: 90, partregion_id: 92, lat: 48.20, lng:  9.20, label: 'BW · Hohenlohe/Schwäb. Alb' },
  { region_id: 90, partregion_id: 93, lat: 47.90, lng:  8.20, label: 'BW · Schwarzwald' },
  { region_id: 100, partregion_id: 101, lat: 48.30, lng: 11.30, label: 'Bayern · Allgäu/Oberbayern' },
  { region_id: 100, partregion_id: 102, lat: 48.80, lng: 11.50, label: 'Bayern · Donauniederung' },
  { region_id: 100, partregion_id: 103, lat: 49.30, lng: 11.10, label: 'Bayern · Mittelfranken' },
  { region_id: 100, partregion_id: 104, lat: 50.00, lng: 11.50, label: 'Bayern · Frankenalb/Oberpfalz' },
];

function pickRegion(lat: number, lng: number): RegionCentroid {
  let best = REGION_CENTROIDS[0];
  let bestD = Infinity;
  for (const r of REGION_CENTROIDS) {
    const d = (r.lat - lat) ** 2 + (r.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

/** Parse a DWD level string. "2-3" → 2.5, "0" → 0, "" → 0. */
function parseLevel(s: string | undefined): number {
  if (!s) return 0;
  const parts = s.split('-').map((x) => Number.parseFloat(x));
  if (parts.length === 1) return Number.isFinite(parts[0]) ? parts[0] : 0;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

let cache: { fetchedAt: number; data: DwdPollenResponse } | null = null;

/** Returns the pollen forecast for the region closest to (lat, lng). */
export async function fetchPollenForecast(
  lat: number, lng: number,
  signal?: AbortSignal,
): Promise<PollenForecast | null> {
  // Pollen JSON updates once a day — cache for 30 min in-memory.
  let raw: DwdPollenResponse;
  if (cache && Date.now() - cache.fetchedAt < 30 * 60_000) {
    raw = cache.data;
  } else {
    const res = await fetch(POLLEN_URL, { signal });
    if (!res.ok) throw new Error(`DWD Pollen HTTP ${res.status}`);
    raw = (await res.json()) as DwdPollenResponse;
    cache = { fetchedAt: Date.now(), data: raw };
  }

  const target = pickRegion(lat, lng);
  // Match by region_id + partregion_id. partregion=0 means the API returns
  // a single record without sub-region — we use 0 as wildcard.
  const match = (raw.content ?? []).find(
    (r) => r.region_id === target.region_id &&
      (target.partregion_id === 0 || r.partregion_id === target.partregion_id),
  );
  if (!match) return null;

  const species = {} as Record<PollenSpecies, PollenLevels>;
  for (const sp of POLLEN_SPECIES) {
    const lev = match.Pollen[sp];
    species[sp] = {
      today: parseLevel(lev?.today),
      tomorrow: parseLevel(lev?.tomorrow),
      dayAfter: parseLevel(lev?.dayafter_to),
    };
  }

  return {
    region: target.label,
    legend: Object.values(raw.legend ?? {}).join(' · ').slice(0, 200) ||
      '0 keine · 1 gering · 2 mittel · 3 hoch · 4 sehr hoch',
    fetchedAt: cache.fetchedAt,
    species,
  };
}

/** 0..6 → CSS background colour. Matches DWD WarnWetter app gradient. */
export function pollenColor(level: number): string {
  if (level >= 3) return '#b30000';
  if (level >= 2) return '#e64a19';
  if (level >= 1) return '#fbc02d';
  if (level >= 0.5) return '#cddc39';
  return '#e0e0e0';
}
