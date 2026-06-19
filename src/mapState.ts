/**
 * 2D-Karte · Teilbarer Zustand (Permalink, pur).
 *
 * Kodiert Ort, aktive Layer und Vorhersage-Stunde kompakt in den URL-Hash —
 * so rekonstruiert ein Link genau dieselbe Kartenansicht. Reine
 * (De-)Serialisierung, kein Server, headless testbar.
 */

import type { Country, Location } from './types';
import type { LayerKey } from './MapView';

export const MAP_HASH_PREFIX = '#m=';

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export interface MapState {
  location: Location;
  layers: LayerKey[];
  hour: number;
}

/** Stabile Layer-Reihenfolge → Bitmaske. `confidence` ans ENDE angehängt →
 *  bit-stabil, bestehende Permalinks bleiben gültig. */
const LAYER_ORDER: LayerKey[] = ['wind', 'nowcast', 'temp', 'clouds', 'sat', 'lightning', 'stations', 'confidence', 'snowline', 'flownowcast', 'poprob', 'gust'];
function layersToBits(ls: LayerKey[]): number {
  let bits = 0;
  for (const l of ls) { const i = LAYER_ORDER.indexOf(l); if (i >= 0) bits |= 1 << i; }
  return bits;
}
function bitsToLayers(bits: number): LayerKey[] {
  return LAYER_ORDER.filter((_, i) => !!(bits & (1 << i)));
}

/** Kodiert den Kartenzustand in einen Hash-String (inkl. `#m=`-Präfix). */
export function encodeMapState(s: MapState): string {
  const payload = {
    l: [r5(s.location.lat), r5(s.location.lon), s.location.name, s.location.country],
    b: layersToBits(s.layers),
    h: Math.round(s.hour * 10) / 10,
  };
  return MAP_HASH_PREFIX + encodeURIComponent(JSON.stringify(payload));
}

/** Liest den Kartenzustand aus einem Hash-String; null bei fehlend/ungültig. */
export function decodeMapState(hash: string): MapState | null {
  if (!hash || !hash.startsWith(MAP_HASH_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(hash.slice(MAP_HASH_PREFIX.length))) as
      { l: [number, number, string, string]; b: number; h: number };
    if (!Array.isArray(o.l) || !Number.isFinite(o.l[0]) || !Number.isFinite(o.l[1])) return null;
    const location: Location = { lat: o.l[0], lon: o.l[1], name: String(o.l[2] ?? ''), country: o.l[3] as Country };
    return {
      location,
      layers: bitsToLayers(typeof o.b === 'number' ? o.b : 0),
      hour: typeof o.h === 'number' && Number.isFinite(o.h) ? o.h : 0,
    };
  } catch { return null; }
}

/** Ist im Hash ein Karten-Zustand hinterlegt? */
export function hasMapHash(hash: string): boolean {
  return !!hash && hash.startsWith(MAP_HASH_PREFIX);
}
