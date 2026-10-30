/**
 * Gebiet des Brandradars — DACH (Voreinstellung) oder Europa.
 *
 * DACH ist der bisherige Ausschnitt; jede Quelle fragt ihn wie bisher ab, Byte für
 * Byte dieselben URLs. Europa ist ein zweiter, größerer Ausschnitt, der NUR auf
 * Wunsch geladen wird (Gebiets-Umschalter der Karte) — die DACH-Ansicht bezahlt
 * nichts dafür.
 *
 * Die Europa-Box: Portugal bis Rumänien/Griechenland, Island, Skandinavien bis
 * Nordkap. Sie schneidet bewusst keine Länder aus (eine Box, kein Umriss): der
 * Westen der Ukraine, Belarus, Moldau und der Westen der Türkei liegen darin,
 * Zypern, die Kanaren und Madeira nicht. Die Ostkante 32° O hält die großen
 * Frontbrände im Osten der Ukraine heraus (Datenmenge).
 *
 * Die Bänder beider Achsen sind disjunkt (Länge ≤ 32 < 34 ≤ Breite) — darauf
 * beruht der Achsen-Anker (`wfsAxis.ts`) auch für Europa.
 */

export type FireRegion = 'dach' | 'europe';

export interface LonLatBox { west: number; south: number; east: number; north: number }

export const DACH_BOX: LonLatBox = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
export const EUROPE_BOX: LonLatBox = { west: -25, south: 34, east: 32, north: 72 };

export const REGION_BOX: Record<FireRegion, LonLatBox> = { dach: DACH_BOX, europe: EUROPE_BOX };

export const REGION_LABEL: Record<FireRegion, string> = { dach: 'DACH', europe: 'Europa' };

export function inBox(box: LonLatBox, lat: number, lon: number): boolean {
  return lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;
}

/** `west,south,east,north` — Reihenfolge der FIRMS-Area-API. */
export function boxWsen(box: LonLatBox): string {
  return `${box.west},${box.south},${box.east},${box.north}`;
}

/** `south,west,north,east,EPSG:4326` — Reihenfolge des EFFIS/GWIS-WFS 1.1.0 (lat,lon). */
export function boxLatLon(box: LonLatBox): string {
  return `${box.south},${box.west},${box.north},${box.east},EPSG:4326`;
}

/** Liegt der Punkt in DACH-Box? Für Ebenen, die es außerhalb nicht gibt. */
export function inDachBox(lat: number, lon: number): boolean {
  return inBox(DACH_BOX, lat, lon);
}

/**
 * Ehrlichkeits-Notiz je Ebene, die es in der Europa-Ansicht außerhalb DACH nicht
 * (oder nur eingeschränkt) gibt. Steht unter der Layer-Zeile, solange Europa
 * gewählt und der Layer an ist — eine leere Fläche heißt dort „nicht verfügbar",
 * nicht „kein Brand" oder „keine Gefahr".
 */
export const EUROPE_LIMIT_NOTE: Partial<Record<string, string>> = {
  fireBurnt: 'Europa: das Archiv (Vorjahre) gibt es nur für DE/AT/CH. Die Saison außerhalb kommt aus einer EFFIS-Liste; Umrisse lädt die Karte ab Zoom 9 nach, bis dahin steht ein Punkt.',
  fireWeather: 'Nur DE/AT/CH (ICON-D2-Gebiet) — außerhalb ist die Fläche abgedeckt: nicht verfügbar, nicht „keine Gefahr".',
  fireSoilDryness: 'Nur DE/AT/CH (ICON-D2-Gebiet) — außerhalb ist die Fläche abgedeckt: nicht verfügbar, nicht „keine Trockenheit".',
};

/** Historie (Monat/Saison) in der Europa-Ansicht: die Ereignisdateien gibt es nur für DE/AT/CH. */
export const EUROPE_HISTORY_NOTE = 'Europa: die Historie (Monat, Saison) gibt es bisher nur für DE/AT/CH. Außerhalb zeigt die Karte hier nichts — das heißt „nicht verfügbar", nicht „kein Brand".';
