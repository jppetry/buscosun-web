/** ISO-3166-1 alpha-2 — currently DE, AT, CH only. */
export type Country = 'DE' | 'AT' | 'CH';

export interface Location {
  name: string;
  lat: number;
  lon: number;
  /** Country derived from Nominatim's address.country_code (uppercased). */
  country: Country;
}

export interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
  address?: { country_code?: string };
}
