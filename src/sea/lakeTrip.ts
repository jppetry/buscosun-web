/**
 * Phase BS-N (V-BS-4) — a leg of the trip planner on an inland lake (`audit/seewetter-binnenseen.md` §8). Pure.
 *
 * On a lake there is no wave model and no current model: the leg shows wind, gusts and the weather hint, and the two
 * columns "Welle" and "Strom" are left out instead of saying "keine Daten" in every hour. buscosun Fusion is asked with
 * the country parameters of the lake's land; where the leg lies in the water of a country outside DE/AT/CH (French side
 * of Lake Geneva, Italian side of Lago Maggiore and Lake Lugano, Hungarian side of Lake Neusiedl) the note
 * `lakeForeignNote` says so. The border is read from the country outlines the map uses (`public/countries/<ISO>.geojson`,
 * the source of `countryBorders.ts`, there clipped to the overlap of the country boxes and therefore not usable at the
 * southern lakes).
 */
import type { SeaSpot } from './seaContract';
import { LAKE_LANDS, lakeForeignNote, type LakeLand, type SeaLake } from './seaLakes';

type Ring = readonly (readonly number[])[];
/** A GeoJSON Polygon or MultiPolygon (lon, lat). */
export interface LakeGeo { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
export interface LakeShape { properties: { id: string }; geometry: LakeGeo }
interface Pos { lat: number; lon: number; spot?: string }

const inRing = (ring: Ring, lon: number, lat: number): boolean => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inPoly = (poly: readonly Ring[], lon: number, lat: number): boolean => poly.length > 0 && inRing(poly[0], lon, lat) && !poly.slice(1).some((hole) => inRing(hole, lon, lat));
/** Is a position inside a Polygon / MultiPolygon (holes respected)? Anything else: no. */
export function inLakeGeo(g: LakeGeo | null | undefined, lon: number, lat: number): boolean {
  if (!g || !Array.isArray(g.coordinates)) return false;
  return g.type === 'Polygon' ? inPoly(g.coordinates as Ring[], lon, lat) : g.type === 'MultiPolygon' ? (g.coordinates as Ring[][]).some((p) => inPoly(p, lon, lat)) : false;
}

export interface TripLake { lake: SeaLake; /** The country parameters buscosun Fusion is asked with on this leg. */ country: LakeLand }
const km2 = (a: Pos, b: Pos) => ((a.lat - b.lat) * 111.2) ** 2 + ((a.lon - b.lon) * 111.2 * Math.cos((a.lat * Math.PI) / 180)) ** 2;

/**
 * The lake a leg lies on, or `null` (the sea). A leg is a lake leg when its start or its end is a lake spot, or lies
 * inside the outline of a lake (`shapes` = the outlines the map draws; not loaded ⇒ only the spot rule). The country
 * parameters are those of that spot — for a free point those of the lake's nearest spot.
 */
export function tripLakeOf(points: readonly Pos[], spots: readonly Pick<SeaSpot, 'id' | 'lat' | 'lon' | 'lake'>[], lakes: readonly SeaLake[], shapes: readonly LakeShape[] | null | undefined): TripLake | null {
  if (!points.length) return null;
  const ends = points.length > 1 ? [points[0], points[points.length - 1]] : [points[0]];
  for (const p of ends) {
    const sp = p.spot ? spots.find((s) => s.id === p.spot) : null;
    const lake = sp?.lake ? lakes.find((l) => l.id === sp.lake!.id) : null;
    if (sp?.lake && lake) return { lake, country: sp.lake.fusion.country };
  }
  for (const p of ends) {
    const hit = (shapes ?? []).find((f) => inLakeGeo(f.geometry, p.lon, p.lat));
    const lake = hit ? lakes.find((l) => l.id === hit.properties.id) : null;
    if (!lake) continue;
    const own = spots.filter((s) => s.lake?.id === lake.id);
    if (!own.length) continue;
    const near = own.reduce((a, b) => (km2(b, p) < km2(a, p) ? b : a));
    return { lake, country: near.lake!.fusion.country };
  }
  return null;
}

/** The lake's shores inside DE/AT/CH — the countries whose outlines decide "foreign water". */
export const lakeHomeLands = (lake: Pick<SeaLake, 'lands'>): LakeLand[] => LAKE_LANDS.filter((c) => (lake.lands ?? []).includes(c));
/** "am französischen Ufer": the adjective per foreign land of the lake table (FR, IT, HU today). */
export const LAKE_SHORE_ADJ: Readonly<Record<string, string>> = Object.freeze({ FR: 'französischen', IT: 'italienischen', HU: 'ungarischen' });

export interface TripForeign { land: string; /** Positions of the leg in foreign water, of `of`. */ n: number; of: number; note: string }
/**
 * Does the leg touch water outside DE/AT/CH? `home` = the outline of every home land of the lake; a position inside none
 * of them is foreign water. `null` = no (or the lake has no foreign shore); `undefined` = not known — an outline is not
 * loaded, nothing is claimed.
 */
export function tripForeignOf(t: TripLake, home: Readonly<Partial<Record<LakeLand, LakeGeo | null>>>, positions: readonly Pos[]): TripForeign | null | undefined {
  const lands = Object.keys(t.lake.foreign ?? {});
  if (!lands.length || !positions.length) return null;
  const homes = lakeHomeLands(t.lake);
  if (!homes.length || homes.some((c) => !home[c])) return undefined;
  const n = positions.filter((p) => !homes.some((c) => inLakeGeo(home[c], p.lon, p.lat))).length;
  if (!n) return null;
  // One foreign land per lake today; with several the note names them all.
  const adj = lands.map((l) => LAKE_SHORE_ADJ[l] ?? l).join(' oder ');
  return { land: lands.join('/'), n, of: positions.length, note: lakeForeignNote(adj, t.country) };
}

/** Why the table of a lake leg has no wave and no current row. */
export const LAKE_TRIP_NOTE = 'Auf dem See: Wind, Böen und Wetterhinweis von buscosun Fusion. Für Seen gibt es im Datenbestand kein Wellenmodell und kein Strömungsmodell; Welle und Strom stehen deshalb nicht in der Tabelle und werden nicht gegen deine Grenzen geprüft.';
/** The arrival note without the sentence about the current (there is none in the table of a lake leg). */
export const LAKE_TRIP_ARRIVAL_NOTE = 'Die Ankunft folgt aus Strecke und eingegebener Fahrt.';
export const lakeForeignTripText = (f: TripForeign): string => `${f.n === f.of ? 'Die Etappe liegt' : 'Ein Teil der Etappe liegt'} vor dem ${f.land.includes('/') ? 'fremden' : LAKE_SHORE_ADJ[f.land] ?? 'fremden'} Ufer: ${f.note}.`;
