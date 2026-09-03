/**
 * ET — Gelände der Event-Fläche (pur, DOM-frei, headless prüfbar).
 *
 * Fach-Logik der Terrain-Bühne an EINER Stelle (R3D-8-Lehre): Wind-Helfer für
 * die Ecken-Pfeile (ET2), Zonen-Raster + Gelände-Kennzahlen (ET3) und die
 * Horizont-/Sonnen-Rechnung „wann verschwindet die Sonne hinter dem Grat" (ET4).
 * Alles hier ist reine Mathematik über Eingaben, die der Aufrufer beschafft —
 * die DEM-Abrufe leben in `eventTerrainLoad.ts` (Browser), die Karte in
 * `EventTerrainMap.tsx`.
 *
 * Ehrlichkeitsregeln (`audit/event-terrain.md` §4): das Höhenmodell ist ~30 m
 * Raster ohne Bebauung/Bewuchs; die Horizont-Aussage gilt exakt im Rahmen des
 * DEM; ein Grat unter `RIDGE_MIN_DEG` ist keiner — dann ist es Sonnenuntergang.
 */

import type { EventPhase } from './eventModel';
import type { PointForecastHour } from '../pointForecast/types';
import { toISODate } from './eventModel';
import { solarPosition } from '../pointForecast/terrainPhysics';
import { computeLightWindows } from '../photo/sun';
import { zoneHeightKm, zoneWidthKm, type EventZone, type ZonePoint } from './eventZone';

/* ==================== ET2 — Wind an den Messpunkten ==================== */

/**
 * Eventfenster über alle Phasen: [früheste Startstunde, späteste Endstunde].
 * Eine Über-Mitternacht-Phase zählt bis 24 — dieselbe Konvention wie
 * `eventWindow` im Ergebnis. Ohne Phasen gilt der Standardtag 8–20.
 */
export function phasesWindow(phases: EventPhase[]): [number, number] {
  if (phases.length === 0) return [8, 20];
  const start = Math.min(...phases.map((p) => p.hours[0]));
  const end = Math.max(...phases.map((p) => (p.hours[1] > p.hours[0] ? p.hours[1] : 24)));
  return [start, end];
}

/**
 * Repräsentative Stunde für den Windpfeil eines Messpunkts: die Böen-Spitzenstunde,
 * wenn der Tag eine kennt, sonst die Mitte des Eventfensters. Immer ≤ 23, damit
 * die Stunde auf dem Kalendertag des Events liegt.
 */
export function representativeWindHour(gustPeakHour: number | null, win: [number, number]): number {
  const h = gustPeakHour ?? Math.round((win[0] + win[1]) / 2);
  return Math.max(0, Math.min(23, h));
}

/**
 * Windrichtung (meteorologisch, woher der Wind kommt) und Böe zur Stunde `hour`
 * am lokalen Kalendertag `dateISO`. Kein Treffer oder kein Wert ⇒ `null` —
 * ein fehlender Wert ist kein Pfeil.
 */
export function windAtHour(
  hours: PointForecastHour[],
  dateISO: string,
  hour: number,
): { dirDeg: number | null; gustMs: number | null } {
  for (const h of hours) {
    if (h.timestamp.getHours() !== hour) continue;
    if (toISODate(h.timestamp) !== dateISO) continue;
    return { dirDeg: h.windDirection ?? null, gustMs: h.gustSpeed ?? null };
  }
  return { dirDeg: null, gustMs: null };
}

/* ==================== ET3 — Zonen-Raster + Kennzahlen ==================== */

/** E4: Kennzahlen-Raster der Zone — nie mehr Punkte. */
export const ZONE_GRID_MAX_POINTS = 64;
/** E4: Kachel-Deckel des Kennzahlen-Rasters (der Kachelzoom folgt automatisch). */
export const ZONE_GRID_MAX_TILES = 16;

export interface ZoneGrid {
  cols: number;
  rows: number;
  /** Zeilenweise von Süd nach Nord; Index = row * cols + col. */
  points: ZonePoint[];
}

/**
 * Achsparalleles Raster IN der Zone: jede Stütze liegt in der Mitte ihrer
 * Rasterzelle (halbe Zellweite eingerückt — auf der Kante läge der Messpunkt
 * halb außerhalb der aufgezogenen Fläche, dieselbe Überlegung wie
 * `CORNER_INSET`). Spalten/Zeilen folgen dem Seitenverhältnis, je Achse 2…8,
 * deterministisch.
 */
export function zoneGrid(z: EventZone, maxPoints = ZONE_GRID_MAX_POINTS): ZoneGrid {
  const w = Math.max(1e-6, zoneWidthKm(z));
  const h = Math.max(1e-6, zoneHeightKm(z));
  const ratio = w / h;
  const clampAxis = (n: number) => Math.max(2, Math.min(8, Math.round(n)));
  let cols = clampAxis(Math.sqrt(maxPoints * ratio));
  let rows = clampAxis(Math.sqrt(maxPoints / ratio));
  while (cols * rows > maxPoints && (cols > 2 || rows > 2)) {
    if (cols >= rows && cols > 2) cols--;
    else rows--;
  }
  const points: ZonePoint[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      points.push({
        lat: z.south + ((r + 0.5) * (z.north - z.south)) / rows,
        lon: z.west + ((c + 0.5) * (z.east - z.west)) / cols,
      });
    }
  }
  return { cols, rows, points };
}

export interface ZoneTerrainMetrics {
  minM: number;
  maxM: number;
  spreadM: number;
  meanSlopeDeg: number;
  maxSlopeDeg: number;
  /** Rasterpunkte (keine Interpolation) — so werden sie auch beschriftet. */
  lowest: ZonePoint & { elevM: number };
  highest: ZonePoint & { elevM: number };
  validCount: number;
  totalCount: number;
}

/**
 * Kennzahlen aus Raster + Höhenliste (Index-parallel zu `grid.points`).
 * NaN-tolerant: die Neigung entsteht aus zentralen Differenzenquotienten und
 * nimmt je Achse nur finite Nachbarn (einseitig, wo nur einer da ist).
 * `null`, wenn weniger als die Hälfte (mindestens 4) der Stützen eine Höhe
 * trägt — ein halb gemessenes Gelände ist keine Aussage.
 */
export function zoneTerrainMetrics(
  z: EventZone,
  grid: ZoneGrid,
  elevations: number[],
): ZoneTerrainMetrics | null {
  const { cols, rows, points } = grid;
  const total = points.length;
  if (total === 0 || elevations.length !== total) return null;

  let validCount = 0;
  let minM = Infinity;
  let maxM = -Infinity;
  let minIdx = -1;
  let maxIdx = -1;
  for (let i = 0; i < total; i++) {
    const e = elevations[i];
    if (!Number.isFinite(e)) continue;
    validCount++;
    if (e < minM) { minM = e; minIdx = i; }
    if (e > maxM) { maxM = e; maxIdx = i; }
  }
  if (validCount < Math.max(4, total / 2)) return null;

  // Zellweiten in Metern — die Basis der Neigung.
  const dxM = (zoneWidthKm(z) * 1000) / cols;
  const dyM = (zoneHeightKm(z) * 1000) / rows;
  const at = (r: number, c: number): number | null => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
    const e = elevations[r * cols + c];
    return Number.isFinite(e) ? e : null;
  };
  // Gradient je Achse: zentral, wo beide Nachbarn tragen, sonst einseitig.
  const grad = (a: number | null, b: number | null, here: number, step: number): number | null => {
    if (a != null && b != null) return (b - a) / (2 * step);
    if (b != null) return (b - here) / step;
    if (a != null) return (here - a) / step;
    return null;
  };

  let slopeSum = 0;
  let slopeN = 0;
  let maxSlopeDeg = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const here = at(r, c);
      if (here == null) continue;
      const dzdx = grad(at(r, c - 1), at(r, c + 1), here, dxM);
      const dzdy = grad(at(r - 1, c), at(r + 1, c), here, dyM);
      if (dzdx == null && dzdy == null) continue;
      const slope = (Math.atan(Math.hypot(dzdx ?? 0, dzdy ?? 0)) * 180) / Math.PI;
      slopeSum += slope;
      slopeN++;
      if (slope > maxSlopeDeg) maxSlopeDeg = slope;
    }
  }

  return {
    minM,
    maxM,
    spreadM: maxM - minM,
    meanSlopeDeg: slopeN > 0 ? slopeSum / slopeN : 0,
    maxSlopeDeg,
    lowest: { ...points[minIdx], elevM: minM },
    highest: { ...points[maxIdx], elevM: maxM },
    validCount,
    totalCount: total,
  };
}

/* ==================== ET4 — Horizont + Sonne ==================== */

/** Horizont-Strahlen: Anzahl Azimute (5,625°-Schritt, dazwischen linear). */
export const HORIZON_AZIMUTHS = 64;
/** Suchweite eines Strahls — jenseits von 30 km verdeckt in DACH kein Grat mehr relevant. */
export const HORIZON_MAX_KM = 30;
/** Erste Stützweite (darunter liegt der Punkt in seiner eigenen DEM-Zelle). */
export const HORIZON_MIN_M = 60;
/** Stützpunkte je Strahl, geometrisch gestaffelt 60 m … 30 km. */
export const HORIZON_SAMPLES_PER_RAY = 24;
/** Kachel-Deckel der Horizont-Abtastung (fester 60-km-Durchmesser ⇒ ~z11, ~52 m Raster). */
export const HORIZON_MAX_TILES = 32;
/** Zeitschritt der Sonnenbahn-Suche (min). */
export const SUN_STEP_MIN = 5;
/** Erst ab dieser Horizonthöhe ist „hinter dem Grat" eine Aussage — darunter ist es Sonnenuntergang. */
export const RIDGE_MIN_DEG = 1.0;

const EARTH_R_M = 6_371_000;
const M_PER_DEG_LAT = 111_320;

/**
 * Alle Strahl-Stützpunkte um `origin`: je Azimut (0 = Nord, im Uhrzeigersinn)
 * eine geometrisch gestaffelte Distanzfolge — nah dicht (der nächste Grat
 * zählt), fern grob. Eine flache Erde über 30 km reicht für die Ortsrechnung
 * (< 0,1 % Fehler); die Erdkrümmung steckt in `horizonAngles`.
 */
export function horizonRayPoints(
  origin: ZonePoint,
  azimuths = HORIZON_AZIMUTHS,
  maxKm = HORIZON_MAX_KM,
  perRay = HORIZON_SAMPLES_PER_RAY,
): { rays: ZonePoint[][]; distancesM: number[] } {
  const distancesM: number[] = [];
  const growth = (maxKm * 1000) / HORIZON_MIN_M;
  for (let i = 0; i < perRay; i++) {
    distancesM.push(HORIZON_MIN_M * Math.pow(growth, i / (perRay - 1)));
  }
  const cosLat = Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180));
  const rays: ZonePoint[][] = [];
  for (let a = 0; a < azimuths; a++) {
    const az = ((a * 360) / azimuths) * (Math.PI / 180);
    const ray: ZonePoint[] = [];
    for (const d of distancesM) {
      ray.push({
        lat: origin.lat + (d * Math.cos(az)) / M_PER_DEG_LAT,
        lon: origin.lon + (d * Math.sin(az)) / (M_PER_DEG_LAT * cosLat),
      });
    }
    rays.push(ray);
  }
  return { rays, distancesM };
}

/**
 * Horizonthöhe (Grad über der Waagerechten) je Azimut: das Maximum über die
 * Strahl-Stützen von atan((Höhe − Standhöhe − Krümmungsabzug) / Distanz).
 * Der Krümmungsabzug d²/(2·R) zieht ferne Punkte unter die Sichtlinie — ohne
 * ihn stünde ein 20-km-Punkt auf Standhöhe bei 0° statt −0,09°. Refraktion ist
 * bewusst weggelassen (≤ ~0,05° auf 30 km — unter der DEM-Genauigkeit).
 * NaN-Stützen werden übersprungen; ein Strahl ganz ohne finite Werte ⇒ NaN.
 */
export function horizonAngles(
  originElevM: number,
  distancesM: number[],
  rayElevations: number[][],
): number[] {
  return rayElevations.map((ray) => {
    let best = NaN;
    for (let i = 0; i < ray.length; i++) {
      const e = ray[i];
      if (!Number.isFinite(e)) continue;
      const d = distancesM[i];
      const ang = (Math.atan2(e - originElevM - (d * d) / (2 * EARTH_R_M), d) * 180) / Math.PI;
      if (!Number.isFinite(best) || ang > best) best = ang;
    }
    return best;
  });
}

/** Horizonthöhe bei beliebigem Azimut — linear zwischen den Stützen, mit Wrap 360→0. */
export function horizonAt(anglesDeg: number[], azimuthDeg: number): number {
  const n = anglesDeg.length;
  if (n === 0) return NaN;
  const az = ((azimuthDeg % 360) + 360) % 360;
  const pos = (az / 360) * n;
  const i0 = Math.floor(pos) % n;
  const i1 = (i0 + 1) % n;
  const t = pos - Math.floor(pos);
  const a0 = anglesDeg[i0];
  const a1 = anglesDeg[i1];
  if (Number.isFinite(a0) && Number.isFinite(a1)) return a0 + (a1 - a0) * t;
  if (Number.isFinite(a0)) return a0;
  if (Number.isFinite(a1)) return a1;
  return NaN;
}

export type SunCrossing =
  /** Die Sonne sinkt unter die Gratlinie (Horizont ≥ RIDGE_MIN_DEG), bevor sie astronomisch untergeht. */
  | { kind: 'behind-ridge'; atMs: number; horizonDeg: number }
  /** Kein relevanter Grat im Weg — die Sonne bleibt bis zum Untergang (oder Fensterende) frei. */
  | { kind: 'free-until-sunset'; sunsetMs: number | null }
  /** Im ganzen Fenster nie über der Gratlinie (Abend-/Nachtphase). */
  | { kind: 'below-horizon' };

/**
 * Wann verschwindet die Sonne im Fenster [startMs, endMs] hinter dem Gelände?
 * Die Sonnenbahn läuft in `stepMin`-Schritten durch `solarPosition`; eine
 * Kreuzung (über → unter der Horizontlinie des jeweiligen Azimuts) wird linear
 * auf die Minute interpoliert. Liegt die Horizontlinie an der Kreuzung unter
 * `RIDGE_MIN_DEG`, ist das kein Grat, sondern der normale Sonnenuntergang.
 */
export function sunBehindRidge(
  horizon: (azDeg: number) => number,
  lat: number,
  lon: number,
  dateISO: string,
  startMs: number,
  endMs: number,
  stepMin = SUN_STEP_MIN,
): SunCrossing {
  const light = computeLightWindows(dateISO, lat, lon);
  const sunsetMs = light.sunset ? light.sunset.getTime() : null;
  const stepMs = Math.max(1, stepMin) * 60_000;

  let everAbove = false;
  let prevT = startMs;
  let prevMargin = NaN; // Sonnenhöhe − Horizonthöhe am vorigen Schritt
  for (let t = startMs; t <= endMs; t += stepMs) {
    const pos = solarPosition(lat, lon, t);
    const hzRaw = horizon(pos.azimuthDeg);
    const hz = Number.isFinite(hzRaw) ? hzRaw : 0;
    const margin = pos.elevationDeg - Math.max(hz, 0);
    if (margin > 0) everAbove = true;
    if (everAbove && Number.isFinite(prevMargin) && prevMargin > 0 && margin <= 0) {
      // Kreuzung zwischen prevT und t — auf die Minute interpoliert.
      const frac = prevMargin / (prevMargin - margin);
      const atMs = prevT + frac * (t - prevT);
      if (hz >= RIDGE_MIN_DEG) return { kind: 'behind-ridge', atMs, horizonDeg: hz };
      return { kind: 'free-until-sunset', sunsetMs };
    }
    prevT = t;
    prevMargin = margin;
  }
  if (!everAbove) return { kind: 'below-horizon' };
  // Bis zum Fensterende über der Linie geblieben.
  return { kind: 'free-until-sunset', sunsetMs };
}

/** Mitte einer Phase als lokale Zeit (ms). Über-Mitternacht-Phase: Ende = 24. */
export function phaseMidMs(dateISO: string, hours: [number, number]): number {
  const end = hours[1] > hours[0] ? hours[1] : 24;
  const mid = (hours[0] + end) / 2;
  return new Date(`${dateISO}T00:00:00`).getTime() + mid * 3_600_000;
}
