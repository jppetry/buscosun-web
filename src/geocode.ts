/**
 * Geocoding-Helfer (DACH). Kapselt die Nominatim-Suche, die bislang inline in
 * der SearchPage lag, damit andere Features (z. B. Event-Planung) denselben
 * Ort-Picker nutzen können. KEINE Wetter-Datenquelle — nur Ortsauflösung.
 */

import type { Location, NominatimResult } from './types';
import { parseCountry } from './countryProfiles';

/** Nominatim-Treffer → `Location` (nur DE/AT/CH; sonst null). */
export function nominatimToLocation(r: NominatimResult): Location | null {
  const country = parseCountry(r.address?.country_code);
  if (!country) return null;
  return {
    name: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    country,
  };
}

/** Geocodiert eine Anfrage, auf DE/AT/CH beschränkt. Liefert nutzbare Orte. */
export async function geocodeDACH(query: string, signal?: AbortSignal): Promise<Location[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'de,at,ch');
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');
  const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'de' }, signal });
  if (!res.ok) throw new Error(`Geocoder: ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  return data.map(nominatimToLocation).filter((l): l is Location => l != null);
}

/**
 * Reverse-Geocoding: Koordinaten → benannter Ort (DE/AT/CH). Für den Ausweich-
 * ort-Vorschlag (PLANB-US5), um Kandidaten-Punkte mit echtem Namen + Land zu
 * versehen. Liefert null außerhalb DACH oder bei leerem Treffer.
 */
export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<Location | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '12'); // Gemeinde-/Ortsebene statt Hausnummer
  const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'de' }, signal });
  if (!res.ok) throw new Error(`Reverse-Geocoder: ${res.status}`);
  const data = (await res.json()) as NominatimResult;
  if (!data || !data.lat) return null;
  return nominatimToLocation(data);
}

/** Kurzer, lesbarer Ortsname (erster Bestandteil des display_name). */
export function shortLocationName(name: string): string {
  return name.split(',')[0];
}

/** Flaggen-Emoji zum Ländercode. */
export function flagForCountry(cc: string): string {
  switch (cc.toLowerCase()) {
    case 'de': return '🇩🇪';
    case 'at': return '🇦🇹';
    case 'ch': return '🇨🇭';
    default: return '📍';
  }
}
