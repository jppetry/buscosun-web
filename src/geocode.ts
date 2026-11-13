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
  const bb = r.boundingbox?.map(Number);
  const bbox = bb && bb.length === 4 && bb.every(Number.isFinite) && bb[1] > bb[0] && bb[3] > bb[2]
    ? [bb[2], bb[0], bb[3], bb[1]] as [number, number, number, number]
    : undefined;
  return {
    name: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    country,
    ...(bbox ? { bbox } : {}),
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

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    /** Photon order: [minLon, maxLat, maxLon, minLat]; only on areas. */
    extent?: [number, number, number, number];
    osm_id?: number; name?: string; street?: string; housenumber?: string; postcode?: string;
    city?: string; district?: string; locality?: string; county?: string; state?: string; country?: string; countrycode?: string;
  };
}

/**
 * Autovervollständigung beim Tippen (Photon, photon.komoot.io, OSM-Daten). Nominatims öffentlicher Server verbietet
 * Suche-beim-Tippen ausdrücklich — der Enter-Pfad (`geocodeDACH`) bleibt dort, nur die Vorschläge kommen von Photon.
 * Liefert dieselbe Form wie Nominatim, damit die Ergebnisliste der Startseite unverändert bleibt; nur DE/AT/CH.
 */
export async function suggestDACH(query: string, signal?: AbortSignal): Promise<NominatimResult[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'de');
  url.searchParams.set('limit', '8');
  url.searchParams.set('bbox', '5.8,45.7,17.3,55.1');   // minLon,minLat,maxLon,maxLat around DACH
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Vorschläge: ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const out: NominatimResult[] = [];
  const seen = new Set<string>();
  for (const f of data.features ?? []) {
    const p = f.properties ?? {};
    const cc = p.countrycode?.toLowerCase();
    const c = f.geometry?.coordinates;
    if (!c || (cc !== 'de' && cc !== 'at' && cc !== 'ch')) continue;
    const street = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : null;
    const head = p.name && street && p.name !== street ? `${p.name}, ${street}` : (p.name ?? street);
    if (!head) continue;
    const place = [p.postcode, p.city ?? p.locality ?? p.county].filter(Boolean).join(' ');
    const display = [head, place || null, p.state, p.country].filter(Boolean).join(', ');
    if (seen.has(display)) continue;
    seen.add(display);
    out.push({ display_name: display, lat: String(c[1]), lon: String(c[0]), place_id: p.osm_id ?? out.length, address: { country_code: cc },
      ...(p.extent?.length === 4 ? { boundingbox: [String(p.extent[3]), String(p.extent[1]), String(p.extent[0]), String(p.extent[2])] as [string, string, string, string] } : {}) });
  }
  return out;
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

/** Country marker for the search UI: the plain code (DE/AT/CH) on every device — flag emoji render as flags on phones but as letters on Windows. */
export function flagForCountry(cc: string): string {
  switch (cc.toLowerCase()) {
    case 'de': return 'DE';
    case 'at': return 'AT';
    case 'ch': return 'CH';
    default: return '📍';
  }
}
