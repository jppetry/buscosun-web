/**
 * R3D · Die Tour als Vertikalschnitt (pur, DOM-frei, headless prüfbar).
 *
 * Damit die Geländekarte den **vorhandenen** Wettervorhang zeigen kann, wird die
 * Tour in genau die Form gebracht, die `assembleCrossSection` ohnehin annimmt
 * (`audit/route-3d.md` §21.1, E1/E2):
 *
 *   Spalten = der aufbereitete Track (Ort + Geländehöhe),
 *   Anker   = die Wetter-Samples (Oberflächenwerte an ihrer Distanz).
 *
 * Es entsteht **kein zweiter Rechenweg**: die Vertikale kommt aus `windAtAGL`,
 * demselben Kern, den der axonometrische Schnitt seit 1a benutzt.
 *
 * Zwei Dinge sind hier anders als bei der Atmosphären-Ansicht, und beide sind
 * Ehrlichkeitsauflagen:
 *
 *  1. **Die Anker gelten nicht zur selben Zeit.** Jeder Tour-Punkt trägt seine
 *     Ankunftszeit; zwischen Tal und Gipfel liegen Stunden. Deshalb läuft der
 *     Schnitt mit `inversion: 'none'` — sonst läse `estimateInversion` einen
 *     Zeitunterschied als Schichtung und stellte das ganze Temperaturfeld auf
 *     einen isothermen Kaltluftsee um (§21.2, E3).
 *  2. **Fehlende Bewölkung wird nicht zu 0 % erklärt.** Wo Feuchte oder
 *     Bewölkung fehlen, meldet das Ergebnis `cloudsUsable: false`, und die
 *     Ansicht bietet die Wolkenschicht gar nicht erst an.
 */

import { assembleCrossSection, type AnchorSurface, type CrossSection, type SectionColumnTerrain } from '../../threed/crossSection';
import type { TourPoint } from '../tourTrack';
import { REL_COLORS, TEMP_COLORS, tempStepIndex, type SceneColumn, type SceneModel } from './model';

/** Spalten des Vorhangs. 96 ist die Bildauflösung, NICHT die des Wetters —
 *  das kommt aus 6–14 km Clustern und wird daneben benannt (§21.2, E10). */
export const SECTION_COLUMNS = 96;

/**
 * Höhe der Wetterwand ÜBER GRUND (m) — sie folgt dem Gelände als Bahn.
 *
 * Die erste Fassung stellte eine Wand bis zur Schnitt-Decke: das erzählte die
 * **Atmosphäre**, nicht die Wetterlage am Boden, um die es bei einer Tour geht
 * (`audit/route-3d.md` §23). 300 m ist die Luft, durch die man geht — unten
 * steht der Bodenwert, oben sieht man, wie schnell er zunimmt.
 */
export const CURTAIN_BAND_AGL_M = 300;

/** Luft über dem höchsten Punkt (m) — die Decke der Textur, nicht der Wand. */
export const CURTAIN_HEADROOM_M = 400;

/**
 * Höhenschritt der Schnitt-Zellen (m). Der Standard (150 m) ist für eine Wand
 * bis 4 km gedacht; eine 300-m-Bahn hätte darin zwei Stützstellen. 25 m gibt der
 * Bahn zwölf — dieselbe Rechnung, nur feiner abgetastet.
 */
export const SECTION_LEVEL_STEP_M = 25;

export interface RouteSectionResult {
  section: CrossSection;
  /** Aus wie vielen Samples Anker entstanden sind. */
  anchorCount: number;
  /** Wie viele Samples es insgesamt gab — die Differenz ist die Lücke. */
  sampleCount: number;
  /** Nur wenn an ALLEN Ankern Feuchte und Bewölkung liegen. */
  cloudsUsable: boolean;
}

/** Ein Ort auf der Strecke (für Positionsmarke und Kamera). */
export interface RoutePos { lat: number; lon: number; eleM: number }

/**
 * Baut den Schnitt der Tour. `null`, wenn kein einziges Sample Temperatur UND
 * Wind trägt — dann gibt es nichts zu zeichnen, und die Ansicht sagt es, statt
 * eine leere Wand zu stellen.
 */
export function buildRouteSection(
  columns: SceneColumn[],
  points: TourPoint[],
  columnCount = SECTION_COLUMNS,
): RouteSectionResult | null {
  if (points.length < 2) return null;

  let cloudsUsable = true;
  const anchors: AnchorSurface[] = [];
  for (const c of columns) {
    if (c.tempC == null || c.windKmh == null || c.windDirDeg == null) continue;
    if (c.cloudCoverPct == null || c.humidityPct == null) cloudsUsable = false;
    anchors.push({
      distanceM: c.distM,
      elevM: c.terrainM,
      windKmh: c.windKmh,
      windDirDeg: c.windDirDeg,
      // Ohne eigene Böe ist der Mittelwind die beste belegte Zahl — nie eine
      // erfundene Überhöhung.
      gustKmh: c.gustKmh ?? c.windKmh,
      tempC: c.tempC,
      cloudPct: c.cloudCoverPct ?? 0,
      humidityPct: c.humidityPct ?? 50,
    });
  }
  if (anchors.length === 0) return null;

  const cols = resampleTerrain(points, columnCount);
  if (cols.length < 2) return null;

  // Decke der TEXTUR — die Wand selbst ist eine Bahn über Grund. Knapp über dem
  // höchsten Punkt gehalten, damit die 132 Bildzeilen dort liegen, wo die Bahn
  // steht, statt über Luft, die niemand sieht.
  const maxTerrain = cols.reduce((m, c) => Math.max(m, c.terrainM), 0);
  const topM = Math.max(1500, Math.ceil((maxTerrain + CURTAIN_HEADROOM_M) / 250) * 250);
  const heightLevels: number[] = [];
  for (let z = 0; z <= topM; z += SECTION_LEVEL_STEP_M) heightLevels.push(z);

  const section = assembleCrossSection({ columns: cols, anchors, inversion: 'none', topM, heightLevels });
  return { section, anchorCount: anchors.length, sampleCount: columns.length, cloudsUsable };
}

/**
 * Track → gleichmäßig verteilte Schnitt-Spalten. Ort UND Höhe kommen aus dem
 * Track selbst (also aus dem in §20 gegen das Geländemodell geprüften Gelände),
 * linear zwischen den Trackpunkten — kein zweiter DEM-Abgriff, keine zweite
 * Höhenwahrheit.
 */
export function resampleTerrain(points: TourPoint[], count: number): SectionColumnTerrain[] {
  const usable = points.filter((p) => Number.isFinite(p.dist) && Number.isFinite(p.ele));
  if (usable.length < 2 || count < 2) return [];
  const total = usable[usable.length - 1].dist - usable[0].dist;
  if (!(total > 0)) return [];

  const out: SectionColumnTerrain[] = [];
  for (let i = 0; i < count; i++) {
    const d = usable[0].dist + (total * i) / (count - 1);
    const p = interpTrack(usable, d);
    out.push({ index: i, distanceM: d - usable[0].dist, lat: p.lat, lon: p.lon, terrainM: p.eleM });
  }
  return out;
}

/** Ort und Höhe bei einer Streckendistanz (linear zwischen zwei Trackpunkten). */
export function interpTrack(points: TourPoint[], distM: number): RoutePos {
  if (points.length === 0) return { lat: 0, lon: 0, eleM: 0 };
  const first = points[0];
  const last = points[points.length - 1];
  if (distM <= first.dist) return { lat: first.lat, lon: first.lon, eleM: first.ele };
  if (distM >= last.dist) return { lat: last.lat, lon: last.lon, eleM: last.ele };
  // Binäre Suche: der Track kann 100 000 Punkte haben.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].dist <= distM) lo = mid; else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const t = (distM - a.dist) / Math.max(1e-9, b.dist - a.dist);
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    eleM: a.ele + (b.ele - a.ele) * t,
  };
}

/**
 * Die Strecke als Koordinatenkette — mit optionaler Ausdünnung, damit eine
 * 100 000-Punkte-GPX nicht als GeoJSON durch den Karten-Layer geht.
 */
export function routeCoords(points: TourPoint[], maxNodes = 2000): Array<[number, number]> {
  if (points.length === 0) return [];
  const step = Math.max(1, Math.ceil(points.length / maxNodes));
  const out: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i += step) out.push([points[i].lon, points[i].lat]);
  const lastPt = points[points.length - 1];
  const lastOut = out[out.length - 1];
  if (!lastOut || lastOut[0] !== lastPt.lon || lastOut[1] !== lastPt.lat) out.push([lastPt.lon, lastPt.lat]);
  return out;
}

/** Ein Streckenstück zwischen zwei Distanzen, mit exakten Endpunkten. */
export function segmentCoords(
  points: TourPoint[],
  fromM: number,
  toM: number,
  maxNodes = 400,
): Array<[number, number]> {
  if (!(toM > fromM)) return [];
  const inside = points.filter((p) => p.dist > fromM && p.dist < toM);
  const step = Math.max(1, Math.ceil(inside.length / maxNodes));
  const a = interpTrack(points, fromM);
  const b = interpTrack(points, toM);
  const line: Array<[number, number]> = [[a.lon, a.lat]];
  for (let i = 0; i < inside.length; i += step) line.push([inside[i].lon, inside[i].lat]);
  line.push([b.lon, b.lat]);
  return line.length >= 2 ? line : [];
}

/**
 * Die nassen Streckenabschnitte als Koordinatenketten. Der Regen steht in
 * dieser Ansicht **an der Strecke**, nicht in der Wand — die Vorhang-Textur
 * trägt Wind, Temperatur und Wolken, sonst nichts (§21.2, E5).
 */
export function wetCoords(
  points: TourPoint[],
  windows: Array<{ fromM: number; toM: number }>,
  maxNodesPerWindow = 400,
): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  for (const w of windows) {
    const line = segmentCoords(points, w.fromM, w.toM, maxNodesPerWindow);
    if (line.length >= 2) out.push(line);
  }
  return out;
}

export interface RouteSegment {
  coords: Array<[number, number]>;
  color: string;
  fromM: number;
  toM: number;
}

/**
 * Die Strecke in eingefärbte Stücke — je Wetterspalte eines.
 *
 * Das ist der Träger der **Wetterlage am Boden** auf der Karte: die Farbe liegt
 * dort, wo man geht, nicht in der Luft darüber. Die Grenzen liegen wie überall
 * in der Mitte zwischen zwei Abtastpunkten — ein Sample steht für seine
 * Umgebung, nicht für seinen Punkt.
 *
 * `colorOf` liefert die Farbe je Spalte; `null` lässt das Stück weg (ein
 * fehlender Wert ist keine Farbe).
 */
export function routeSegments(
  columns: Array<{ distM: number }>,
  points: TourPoint[],
  colorOf: (index: number) => string | null,
): RouteSegment[] {
  const out: RouteSegment[] = [];
  for (let i = 0; i < columns.length; i++) {
    const color = colorOf(i);
    if (!color) continue;
    const prev = columns[i - 1];
    const next = columns[i + 1];
    const fromM = prev ? (prev.distM + columns[i].distM) / 2 : columns[i].distM;
    const toM = next ? (columns[i].distM + next.distM) / 2 : columns[i].distM;
    const coords = segmentCoords(points, fromM, toM);
    if (coords.length >= 2) out.push({ coords, color, fromM, toM });
  }
  return out;
}

/**
 * Gleichmäßig verteilte Spalten für die Windpfeile an der Strecke — dieselbe
 * Regel wie im Schnitt: nur Spalten, an denen die Windrichtung zur
 * Fahrtrichtung überhaupt bestimmbar ist.
 */
export function windPicks<T extends { windRel: unknown; windDirDeg: number | null }>(
  columns: T[],
  count: number,
): T[] {
  const usable = columns.filter((c) => c.windRel != null && c.windDirDeg != null);
  if (usable.length <= count || count < 2) return usable.slice(0, Math.max(0, count));
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(usable[Math.round((i * (usable.length - 1)) / (count - 1))]);
  return [...new Set(out)];
}


/* ==================== Ebenen der Gelände-Ansicht ==================== */

/**
 * Die Schalter der Gelände-Ansicht, getrennt in **am Boden** und **in der Luft**
 * (`audit/route-3d.md` §23).
 *
 * Sie leben hier und nicht in der Karte, weil sie seit R3D-8 an **zwei** Stellen
 * gebraucht werden: in der 3D-Ansicht (Bühne „Gelände") und im Ergebnis, das
 * jetzt mit dem Relief öffnet. Eine Einstellung, ein Speicher, eine Liste.
 */
export interface TerrainLayerFlags {
  /* --- am Boden (auf der Strecke) --- */
  routeTemp: boolean;
  arrows: boolean;
  rain: boolean;
  warn: boolean;
  /* --- in der Luft (die Bahn) --- */
  wall: boolean;
  gust: boolean;
  wallTemp: boolean;
  clouds: boolean;
  streamlines: boolean;
}

/** Am Boden alles an, in der Luft nur die Bahn (§23). */
export const DEFAULT_TLAYERS: TerrainLayerFlags = {
  routeTemp: true, arrows: true, rain: true, warn: true,
  wall: true, gust: false, wallTemp: false, clouds: false, streamlines: false,
};

export const TLAYER_STORE_KEY = 'bsc.route3d.tlayers';

export function loadTLayers(): TerrainLayerFlags {
  try {
    const raw = localStorage.getItem(TLAYER_STORE_KEY);
    if (!raw) return { ...DEFAULT_TLAYERS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Nur bekannte Schlüssel: die Schalter haben sich mit §23 geändert, ein
    // alter Speicherstand darf keine toten Namen einschleppen.
    const out = { ...DEFAULT_TLAYERS };
    for (const k of Object.keys(DEFAULT_TLAYERS) as Array<keyof TerrainLayerFlags>) {
      if (typeof parsed[k] === 'boolean') out[k] = parsed[k] as boolean;
    }
    return out;
  } catch {
    return { ...DEFAULT_TLAYERS };
  }
}

export function saveTLayers(flags: TerrainLayerFlags): void {
  try {
    localStorage.setItem(TLAYER_STORE_KEY, JSON.stringify(flags));
  } catch { /* privater Modus */ }
}

export interface TerrainChip {
  key: keyof TerrainLayerFlags;
  group: 'ground' | 'air';
  label: string;
  dot: string;
  /** Gibt es überhaupt etwas zu zeigen? Sonst trägt der Chip ein Wort. */
  ok: boolean;
  note?: string;
  empty?: string;
  /** Ohne Quelle bleibt der Schalter gesperrt (nur die Wolkenstockwerke). */
  disabled?: boolean;
}

/**
 * Die Chip-Zeile als **Daten**, nicht als Markup — beide Ansichten mappen
 * darüber und behalten ihr eigenes Layout.
 */
export function terrainChips(
  scene: SceneModel,
  opts: { cloudsUsable: boolean; arrowCount: number },
): TerrainChip[] {
  const av = scene.availability;
  return [
    {
      key: 'routeTemp', group: 'ground', label: 'Temperatur an der Strecke',
      dot: TEMP_COLORS[4], ok: av.temperature.any, note: av.temperature.note,
    },
    {
      // Unter 4 m/s setzt `buildColumns` keine Windrelation — dann gibt es
      // nichts zu zeigen, und der Chip sagt WARUM (§23.3).
      key: 'arrows', group: 'ground', label: 'Wind zur Fahrtrichtung',
      dot: REL_COLORS.tail, ok: av.wind.any && opts.arrowCount > 0,
      note: av.wind.any
        ? 'Unter 4 m/s schiebt und bremst der Wind nicht spürbar — dafür zeichnet die Ansicht keine Richtungspfeile.'
        : av.wind.note,
      empty: av.wind.any ? 'zu schwach' : undefined,
    },
    {
      key: 'rain', group: 'ground', label: 'Regen an der Strecke',
      dot: '#4F7FB5', ok: av.rain.any, note: av.rain.note, empty: av.rain.emptyLabel,
    },
    {
      key: 'warn', group: 'ground', label: 'Warnzone an der Strecke',
      dot: '#D7263D', ok: av.warnings.any, note: av.warnings.note, empty: av.warnings.emptyLabel,
    },
    {
      key: 'wall', group: 'air', label: `Windbahn ${CURTAIN_BAND_AGL_M} m über Grund`,
      dot: '#C97B47', ok: av.wind.any, note: av.wind.note,
    },
    // KEIN Ein/Aus: die Bahn zeigt immer Wind. Der Schalter wählt zwischen zwei
    // Größen — als „Mittelwind" gelesen hieße der unbeleuchtete Chip „kein Wind".
    { key: 'gust', group: 'air', label: 'Böen statt Mittelwind', dot: '#8A1C1C', ok: true },
    { key: 'wallTemp', group: 'air', label: 'Temperaturschichten', dot: '#E0A860', ok: true },
    {
      key: 'clouds', group: 'air', label: 'Wolkenstockwerke', dot: '#B6C8D6',
      ok: opts.cloudsUsable, disabled: !opts.cloudsUsable,
      note: 'An mindestens einem Punkt fehlen Bewölkung oder Luftfeuchte — die Stockwerke blieben eine Behauptung.',
    },
    { key: 'streamlines', group: 'air', label: 'Windströmung', dot: '#7A9466', ok: true },
  ];
}

export interface WindArrow {
  lon: number;
  lat: number;
  /** Grad, in die der Wind WEHT (nicht, woher er kommt). */
  rot: number;
  rel: 'head' | 'cross' | 'tail';
}

export interface GroundLayers {
  tempSegments: RouteSegment[];
  warnSegments: RouteSegment[];
  arrows: WindArrow[];
}

/**
 * Alles, was AN der Strecke liegt — aus denselben Spalten, mit denen der
 * Schnitt arbeitet. Eine Stelle für beide Ansichten (R3D-8).
 */
export function buildGroundLayers(
  scene: SceneModel,
  points: TourPoint[],
  arrowCount: number,
): GroundLayers {
  const tempSegments = routeSegments(scene.columns, points, (i) => {
    const t = scene.columns[i].tempC;
    return t == null ? null : TEMP_COLORS[tempStepIndex(t)];
  });
  const warnSegments = scene.warnZones
    .map((z) => ({
      coords: segmentCoords(points, z.fromM, z.toM),
      // Level 4/5 sind eine andere Aussage als 1–3 — die Farbe sagt es.
      color: z.level >= 4 ? '#8A1C1C' : '#D7263D',
      fromM: z.fromM,
      toM: z.toM,
    }))
    .filter((x) => x.coords.length >= 2);
  const arrows = windPicks(scene.columns, arrowCount).map((c) => ({
    lon: c.lon,
    lat: c.lat,
    rot: ((((c.windDirDeg ?? 0) + 180) % 360) + 360) % 360,
    rel: c.windRel as 'head' | 'cross' | 'tail',
  }));
  return { tempSegments, warnSegments, arrows };
}

/**
 * Was in der Vorhang-Wand steckt — als Satz, damit die Abwesenheit von Regen in
 * der Wand nicht als „kein Regen" gelesen wird (§21.2, E5).
 */
export function curtainNote(opts: { useGust: boolean; temp: boolean; clouds: boolean }): string {
  const inWall = [opts.useGust ? 'Böen' : 'Wind'];
  if (opts.temp) inWall.push('Temperatur');
  if (opts.clouds) inWall.push('Wolken');
  return 'Die Wetterlage am Boden liegt AN der Strecke: Farbe = Temperatur, Pfeile = Wind zur Fahrtrichtung, '
    + 'blau = Regen, rot = amtliche Warnung. Die Wand darüber ist eine Bahn '
    + `${CURTAIN_BAND_AGL_M} m über Grund und zeigt ${joinDe(inWall)} — unten der Bodenwert, oben, wie schnell er zunimmt. `
    + 'Schneefallgrenze und Warntext stehen in der Punkt-Abfrage; in der Wand stehen sie nicht.';
}

/** Warum dieser Schnitt keine Inversion beurteilt (§21.2, E3). */
export const NO_INVERSION_NOTE =
  'Eine Inversion beurteilt diese Ansicht nicht: jeder Punkt trägt seine Ankunftszeit, '
  + 'zwischen Tal und Gipfel liegen Stunden — „oben wärmer als unten" wäre hier ein Zeitunterschied.';

function joinDe(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`;
}
