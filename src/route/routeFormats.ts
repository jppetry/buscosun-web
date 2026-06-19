/**
 * Unterstützte Streckendatei-Formate für „Wetter entlang der Route".
 *
 * Tier 1 (Muss-haben):  GPX, TCX
 * Tier 2 (Sollte):      FIT, KML, KMZ
 *
 * Hier wird vorerst nur die Datei *erkannt* (Format + Tier anhand der
 * Endung). Das eigentliche Parsen folgt später Format für Format.
 */

export type RouteFormatId = 'gpx' | 'tcx' | 'fit' | 'kml' | 'kmz';

export interface RouteFormat {
  id: RouteFormatId;
  /** Endung inkl. Punkt, klein geschrieben. */
  ext: string;
  /** Anzeigename, z. B. „GPX". */
  label: string;
  tier: 1 | 2;
  /** Kurzbeschreibung der typischen Quelle. */
  hint: string;
}

export const ROUTE_FORMATS: RouteFormat[] = [
  { id: 'gpx', ext: '.gpx', label: 'GPX', tier: 1, hint: 'Komoot, Strava, Garmin, Wikiloc, Bergfex' },
  { id: 'tcx', ext: '.tcx', label: 'TCX', tier: 1, hint: 'Garmin Training Center' },
  { id: 'fit', ext: '.fit', label: 'FIT', tier: 2, hint: 'Garmin- & Wahoo-Geräte (binär)' },
  { id: 'kml', ext: '.kml', label: 'KML', tier: 2, hint: 'Google Earth' },
  { id: 'kmz', ext: '.kmz', label: 'KMZ', tier: 2, hint: 'Google Earth (gezippt)' },
];

/** Kommagetrennte accept-Liste für `<input type="file">`. */
export const ACCEPT_ATTR = ROUTE_FORMATS.map((f) => f.ext).join(',');

/** Erkennt das Format einer Datei anhand der Endung; `null` wenn nicht unterstützt. */
export function detectFormat(fileName: string): RouteFormat | null {
  const lower = fileName.toLowerCase();
  return ROUTE_FORMATS.find((f) => lower.endsWith(f.ext)) ?? null;
}

/** Format-Objekt zu einer ID. */
export function getFormat(id: RouteFormatId): RouteFormat {
  return ROUTE_FORMATS.find((f) => f.id === id)!;
}

/**
 * Erkennt das Format am tatsächlichen Inhalt (Magic Bytes), nicht nur an der
 * Endung. Liest den Dateikopf:
 *   – ZIP („PK..") → KMZ
 *   – „.FIT" an Byte 8–11 → FIT
 *   – XML mit Wurzel <gpx>/<TrainingCenterDatabase>/<kml> → GPX/TCX/KML
 * Gibt `null` zurück, wenn der Inhalt zu keinem unterstützten Format passt.
 */
export async function sniffFormat(file: File): Promise<RouteFormatId | null> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  if (head.length < 4) return null;

  // ZIP-Container (KMZ): lokaler File-Header „PK\x03\x04".
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    return 'kmz';
  }
  // FIT: ASCII „.FIT" in den Bytes 8–11 des Headers.
  if (head.length >= 12 &&
      head[8] === 0x2e && head[9] === 0x46 && head[10] === 0x49 && head[11] === 0x54) {
    return 'fit';
  }
  // XML-Textformate über die Wurzelelement-Kennung. TextDecoder('utf-8')
  // entfernt ein führendes BOM bereits selbst.
  const lower = new TextDecoder('utf-8', { fatal: false }).decode(head).toLowerCase();
  if (lower.includes('<gpx')) return 'gpx';
  if (lower.includes('<trainingcenterdatabase')) return 'tcx';
  if (lower.includes('<kml')) return 'kml';
  return null;
}

/** Menschlich lesbare Dateigröße, z. B. „1,4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toString().replace('.', ',')} ${units[i]}`;
}
