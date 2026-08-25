/**
 * Event-Zone (EZ1) — die Fläche, auf der das Event stattfindet.
 *
 * Der Ort bleibt der Anker der Bewertung; die Zone sagt zusätzlich, wie weit
 * die Fläche vom Punkt abweicht. Rein rechnerisch, DOM-frei, headless testbar
 * (`npm run verify:event-zone`).
 *
 * Die Schwelle in `classifyZoneSpread` ist gemessen, nicht geschätzt
 * (`audit/event-zone.md` §2): über flachem Gelände mit ~40 km Stationsabstand
 * liefert der Punktforecast über 8 km Kantenlänge eine Temperaturspanne von
 * 0,16 K — dort löst das Modell die Zone NICHT auf, und die App sagt das,
 * statt Stellen hinter dem Komma als Ortsauflösung auszugeben. Im Gebirge
 * (Zell am See, 6 km) sind es 3,82 K — dort trägt die Zone.
 */

/** Achsparalleles Rechteck in WGS84. Immer normalisiert: west < east, south < north. */
export interface EventZone {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ZonePoint { lat: number; lon: number }

/** Benannte Ecke einer Zone (die Himmelsrichtung, die der Nutzer auf der Karte sieht). */
export type ZoneCornerId = 'nw' | 'ne' | 'se' | 'sw';

export interface ZoneSamplePoint extends ZonePoint {
  /** 'center' = der Zonen-Mittelpunkt, sonst die eingerückte Ecke. */
  id: 'center' | ZoneCornerId;
  label: string;
}

export const ZONE_CORNER_LABELS: Record<ZoneCornerId, string> = {
  nw: 'Nordwest-Ecke',
  ne: 'Nordost-Ecke',
  se: 'Südost-Ecke',
  sw: 'Südwest-Ecke',
};

/** Größter zulässiger Kantenzug (E5) — darüber ist es kein Event-Gelände mehr. */
export const ZONE_MAX_EDGE_KM = 60;

/** Kleinster Zug, der als Zone zählt — darunter war es ein Klick, keine Fläche. */
export const ZONE_MIN_EDGE_KM = 0.05;

/** Ecken werden um diesen Anteil der Kante nach innen gezogen (Messpunkt IN der Fläche). */
const CORNER_INSET = 0.1;

const EARTH_R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Nord-Süd-Ausdehnung in km. */
export function zoneHeightKm(z: EventZone): number {
  return (z.north - z.south) * (Math.PI / 180) * EARTH_R;
}

/** Ost-West-Ausdehnung in km, auf der mittleren Breite gemessen. */
export function zoneWidthKm(z: EventZone): number {
  const midLat = (z.north + z.south) / 2;
  return (z.east - z.west) * (Math.PI / 180) * EARTH_R * Math.cos(rad(midLat));
}

export function zoneAreaKm2(z: EventZone): number {
  return Math.abs(zoneWidthKm(z) * zoneHeightKm(z));
}

/** Mittelpunkt der Zone. */
export function zoneCenter(z: EventZone): ZonePoint {
  return { lat: (z.north + z.south) / 2, lon: (z.east + z.west) / 2 };
}

/** Liegt der Punkt in der Zone (Rand zählt dazu)? */
export function zoneContains(z: EventZone, p: ZonePoint): boolean {
  return p.lat >= z.south && p.lat <= z.north && p.lon >= z.west && p.lon <= z.east;
}

/**
 * Zone aus zwei Zugpunkten — jede Zugrichtung ergibt dasselbe Rechteck
 * (von unten-rechts nach oben-links gezogen ist derselbe Bereich).
 */
export function zoneFromDrag(a: ZonePoint, b: ZonePoint): EventZone {
  return {
    west: Math.min(a.lon, b.lon),
    east: Math.max(a.lon, b.lon),
    south: Math.min(a.lat, b.lat),
    north: Math.max(a.lat, b.lat),
  };
}

/**
 * Deckelt die Zone auf `ZONE_MAX_EDGE_KM` je Kante — der Mittelpunkt bleibt
 * stehen, es wird nur die Ausdehnung beschnitten (E5).
 */
export function clampZone(z: EventZone, maxEdgeKm = ZONE_MAX_EDGE_KM): EventZone {
  const c = zoneCenter(z);
  const h = zoneHeightKm(z);
  const w = zoneWidthKm(z);
  let out = z;
  if (h > maxEdgeKm) {
    const halfDeg = (maxEdgeKm / 2 / EARTH_R) * (180 / Math.PI);
    out = { ...out, south: c.lat - halfDeg, north: c.lat + halfDeg };
  }
  if (w > maxEdgeKm) {
    const halfDeg = (maxEdgeKm / 2 / EARTH_R) * (180 / Math.PI) / Math.max(0.1, Math.cos(rad(c.lat)));
    out = { ...out, west: c.lon - halfDeg, east: c.lon + halfDeg };
  }
  return out;
}

/** Ist der Zug groß genug, um als Fläche zu gelten (statt als verrutschter Klick)? */
export function isDrawnZone(z: EventZone | null | undefined): z is EventZone {
  if (!z) return false;
  if (![z.west, z.south, z.east, z.north].every(Number.isFinite)) return false;
  return zoneHeightKm(z) >= ZONE_MIN_EDGE_KM && zoneWidthKm(z) >= ZONE_MIN_EDGE_KM;
}

/**
 * Messpunkte der Zone: Mittelpunkt + vier um 10 % eingerückte Ecken.
 * Die Einrückung hält die Punkte IN der Fläche — auf der Kante läge der
 * Messpunkt schon halb außerhalb dessen, was der Nutzer aufgezogen hat.
 */
export function zoneSamplePoints(z: EventZone): ZoneSamplePoint[] {
  const dLat = (z.north - z.south) * CORNER_INSET;
  const dLon = (z.east - z.west) * CORNER_INSET;
  const c = zoneCenter(z);
  return [
    { id: 'center', label: 'Zonen-Mitte', lat: c.lat, lon: c.lon },
    { id: 'nw', label: ZONE_CORNER_LABELS.nw, lat: z.north - dLat, lon: z.west + dLon },
    { id: 'ne', label: ZONE_CORNER_LABELS.ne, lat: z.north - dLat, lon: z.east - dLon },
    { id: 'se', label: ZONE_CORNER_LABELS.se, lat: z.south + dLat, lon: z.east - dLon },
    { id: 'sw', label: ZONE_CORNER_LABELS.sw, lat: z.south + dLat, lon: z.west + dLon },
  ];
}

/** Nur die Ecken — die Mitte ist bereits durch den gewählten Ort vertreten. */
export function zoneCornerPoints(z: EventZone): ZoneSamplePoint[] {
  return zoneSamplePoints(z).filter((p) => p.id !== 'center');
}

/** GeoJSON-Ring des Rechtecks (für die Karte). Erster Punkt = letzter Punkt. */
export function zoneRing(z: EventZone): Array<[number, number]> {
  return [
    [z.west, z.north], [z.east, z.north], [z.east, z.south], [z.west, z.south], [z.west, z.north],
  ];
}

/** Lesbare Größe, z. B. „2,4 × 1,8 km · 4,3 km²". */
export function zoneSizeText(z: EventZone): string {
  const w = zoneWidthKm(z);
  const h = zoneHeightKm(z);
  const num = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n))).replace('.', ',');
  return `${num(w)} × ${num(h)} km · ${num(zoneAreaKm2(z))} km²`;
}

// --- Auswertung ----------------------------------------------------------------

/** Wie deutlich unterscheidet sich die Fläche? Schwellen aus der Messung (§2). */
export type ZoneSpreadBand = 'uniform' | 'slight' | 'strong';

/** Punktespanne, ab der ein Unterschied überhaupt benannt wird. */
export const ZONE_SPREAD_SLIGHT = 3;
/** Punktespanne, ab der die Zone die Wahl des Ortes ändern kann. */
export const ZONE_SPREAD_STRONG = 8;

export interface ZoneSpread {
  band: ZoneSpreadBand;
  /** Höchster/niedrigster Punktwert über alle Messpunkte. */
  min: number;
  max: number;
  spread: number;
  /** Der schwächste Messpunkt (bei Gleichstand der erste). */
  worst: { id: 'center' | ZoneCornerId; label: string; score: number };
  best: { id: 'center' | ZoneCornerId; label: string; score: number };
  /** Ein Satz, der die Lage benennt — nie ohne Vorbehalt bei `uniform`. */
  text: string;
}

export interface ZoneScoredPoint {
  id: 'center' | ZoneCornerId;
  label: string;
  score: number;
}

/**
 * Ordnet die Messpunkte ein. `null`, wenn weniger als zwei Punkte auswertbar
 * sind — eine Spanne aus einem Wert wäre keine Aussage, sondern eine Zahl.
 */
export function classifyZoneSpread(points: ZoneScoredPoint[]): ZoneSpread | null {
  const ok = points.filter((p) => Number.isFinite(p.score));
  if (ok.length < 2) return null;

  let worst = ok[0];
  let best = ok[0];
  for (const p of ok) {
    if (p.score < worst.score) worst = p;
    if (p.score > best.score) best = p;
  }
  const spread = best.score - worst.score;
  const band: ZoneSpreadBand =
    spread >= ZONE_SPREAD_STRONG ? 'strong' : spread >= ZONE_SPREAD_SLIGHT ? 'slight' : 'uniform';

  const r = Math.round;
  const text =
    band === 'uniform'
      ? `Über die ganze Zone dieselbe Bewertung (${r(worst.score)}–${r(best.score)} Punkte). Die Quellen lösen eine Fläche dieser Größe hier nicht auf — der Wert am gewählten Ort gilt für das ganze Gelände.`
      : band === 'slight'
        ? `Leichtes Gefälle über die Zone: ${r(worst.score)}–${r(best.score)} Punkte, am schwächsten an der ${worst.label}.`
        : `Deutliches Gefälle über die Zone: ${r(worst.score)}–${r(best.score)} Punkte. Die ${worst.label} fällt gegenüber der ${best.label} um ${r(spread)} Punkte ab — die Lage auf dem Gelände macht hier einen Unterschied.`;

  return {
    band,
    min: worst.score,
    max: best.score,
    spread,
    worst: { id: worst.id, label: worst.label, score: worst.score },
    best: { id: best.id, label: best.label, score: best.score },
    text,
  };
}
