/**
 * R3D · Szenen-Modell (pur, DOM-frei, headless prüfbar).
 *
 * Baut aus den angereicherten Tour-Samples das, was die Szene zeichnet — und
 * trägt dabei die Ehrlichkeits-Auflagen aus `audit/route-3d.md`:
 *
 *  • **Stufig statt stetig** (§5): die Windwand nimmt `windBandIndex` aus
 *    `crossSection.ts` (fünf benannte Bänder), NICHT die stetige Rampe
 *    `windRampRGB` des 2D-Schnitts. Eine stetige Fläche behauptet eine
 *    Genauigkeit, die aus 10-m-Werten + Potenzprofil nicht kommt.
 *  • **Abgeleitet ≠ gemessen** (B4/E7): die Wolkenbasis ist `lclAgl` über Grund,
 *    also eine Näherung aus Temperatur und Feuchte — sie trägt das Wort.
 *  • **Lücke ≠ Null** (B6/E6): Schneefallgrenze (nur AT/CH) und Warnungen (nur
 *    DE) fehlen strukturell, nicht zufällig. `layerAvailability` benennt beides
 *    getrennt, damit die UI „in Österreich keine amtliche Warnung" sagen kann
 *    statt stumm nichts zu zeichnen.
 *  • **Auflösung** (B1/E4): die Tour fragt je Cluster ab, nicht je Kilometer —
 *    `resolutionNote` nennt den echten Radius (6/10/14 km) und das 300-m-Band.
 *
 * Die Wetterwerte kommen aus `SampleWeather`; die Vertikale entsteht mit
 * `windAtAGL` aus demselben Modul wie der 2D-Vertikalschnitt (kein zweiter
 * Rechenweg).
 */

import { DEFAULT_ALPHA, WIND_BANDS_KMH, lclAgl, windAtAGL, windBandIndex } from '../../threed/crossSection';
import { radiusForTerrain, DEFAULT_ELEV_BAND_M } from '../../pointForecast/clustering';
import { bearingAtDist, headwindComponentMps } from '../windEffect';
import type { SampleETA } from '../tourTiming';
import type { Terrain, TourPoint } from '../tourTrack';
import type { Country } from '../../types';

/** m/s → km/h. */
const MS_TO_KMH = 3.6;
/** Höhe eines Wandsegments (m) — grob das Höhenband der Punktabfrage. */
export const WALL_STEP_M = 300;
/** Ab dieser Regenrate zeichnet die Szene eine Säule (darunter: „trocken"). */
export const RAIN_MIN_MMH = 0.1;

export type WindRelation = 'head' | 'cross' | 'tail';

export interface SceneColumn {
  /** Index im Sample-Feld (Rückweg zur Punkt-Abfrage). */
  index: number;
  distM: number;
  terrainM: number;
  etaMs: number;
  lat: number;
  lon: number;
  tempC: number | null;
  apparentC: number | null;
  /** Bodenwind (10 m) in km/h. */
  windKmh: number | null;
  gustKmh: number | null;
  windDirDeg: number | null;
  windRel: WindRelation | null;
  /** Windkomponente entlang der Fahrtrichtung (km/h, + = Rücken). */
  windComponentKmh: number | null;
  precipMmH: number | null;
  precipSource: 'radar' | 'nwp' | null;
  precipType: 'none' | 'rain' | 'sleet' | 'snow';
  humidityPct: number | null;
  /** Wolkenbasis (m ü. NN) — Gelände + LCL, also **abgeleitet**. */
  cloudBaseM: number | null;
  cloudCoverPct: number | null;
  /** Schneefallgrenze (m ü. NN) — nur wo die Quelle sie liefert (AT/CH). */
  snowLineM: number | null;
  batteryPct: number | null;
  /** Höchstes Warnlevel an diesem Punkt (1..5), null = keine Warnung. */
  warnLevel: number | null;
  /** Konfidenz 0..1 je Größe — der Mittelwert trägt die „unklar"-Regel. */
  confidence: SampleETA['weather'] extends undefined ? never : ConfidenceSet | null;
}

export interface ConfidenceSet {
  temperature: number;
  wind: number;
  gust: number;
  precipitation: number;
}

/** Ein Wandsegment: Spaltenintervall × Höhenintervall, eingestuft in ein Band. */
export interface WindCell {
  fromM: number;
  toM: number;
  loM: number;
  hiM: number;
  /** 0..4 — <15 / 15–30 / 30–45 / 45–60 / >60 km/h. */
  band: number;
  kmh: number;
}

export interface RainColumn {
  fromM: number;
  toM: number;
  /** Unterkante = Gelände, Oberkante = Wolkenbasis (oder Decke, wenn unbekannt). */
  baseM: number;
  topM: number;
  mmH: number;
  source: 'radar' | 'nwp' | null;
  type: 'rain' | 'sleet' | 'snow';
}

export interface WarnZone {
  fromM: number;
  toM: number;
  fromMs: number;
  toMs: number;
  level: number;
  event: string;
  headline: string;
}

export interface LayerAvailability {
  /** Der Layer hat irgendwo auf der Strecke einen Wert. */
  any: boolean;
  /** Kurzsatz, warum nicht — leer, wenn `any`. */
  note: string;
  /**
   * Kurzwort für den Chip, wenn nichts zu zeichnen ist, die Quelle aber
   * geliefert hat: „trocken" ist etwas anderes als „ohne Daten". Fehlt das
   * Wort, fehlt tatsächlich die Quelle.
   */
  emptyLabel?: string;
}

/** Ein Stützpunkt des Geländeprofils. Bewusst dieselbe Form wie eine Spalte,
 *  damit `terrainPath`/`skyPath`/`freeSpan` beides annehmen. */
export interface TerrainNode {
  distM: number;
  terrainM: number;
}

/**
 * Ein echtes Geländeprofil NEBEN der Strecke (aus dem Höhenmodell abgetastet).
 * Es ersetzt die Extrusion des eigenen Profils durch gemessenes Gelände —
 * `audit/route-3d.md` §19.3 (D3).
 */
export interface ReliefProfile {
  /** Seitlicher Abstand zur Strecke in Metern (> 0 = weiter hinten im Bild). */
  offsetM: number;
  nodes: TerrainNode[];
}

export interface SceneModel {
  columns: SceneColumn[];
  /**
   * Das Gelände in **eigener** Auflösung — aus dem vollen Track, nicht aus den
   * Wetter-Spalten. Die Spalten stehen alle 500 m (alpin) bis 2 km (flach); an
   * echtem Gelände gemessen zeichnete die Spaltenkette bis 39,7 m daneben und
   * verlor im Flachland 77 % des Reliefs (`audit/route-3d.md` §19.1, D1).
   * Fällt auf die Spalten zurück, wenn kein Track vorliegt.
   */
  terrain: TerrainNode[];
  /** Gemessenes Gelände seitlich der Strecke; leer, solange das DEM fehlt. */
  relief: ReliefProfile[];
  totalM: number;
  startMs: number;
  endMs: number;
  windCells: WindCell[];
  rain: RainColumn[];
  /** Mittlere Wolkenbasis und ihre Spanne (m ü. NN) — null, wenn nirgends bestimmbar. */
  cloudBase: { meanM: number; minM: number; maxM: number } | null;
  /** Schneefallgrenze, nur wo geliefert. */
  snowLine: { meanM: number; minM: number; maxM: number } | null;
  warnZones: WarnZone[];
  /** Gipfel, die über der Wolkenbasis liegen — „Gipfel in Wolke". */
  peaksInCloud: Array<{ distM: number; terrainM: number }>;
  availability: {
    temperature: LayerAvailability;
    wind: LayerAvailability;
    rain: LayerAvailability;
    cloudBase: LayerAvailability;
    snowLine: LayerAvailability;
    warnings: LayerAvailability;
  };
}

export interface BuildSceneInput {
  samples: SampleETA[];
  points: TourPoint[];
  countries: Country[];
  /** Strukturelle Abdeckung aus der Anreicherung (Land liefert die Größe überhaupt). */
  coverage?: { snowLine: boolean };
  /** Potenzprofil-Exponent — Standard wie im 2D-Schnitt. */
  alpha?: number;
  /** Gemessene Seitenprofile (G3). Fehlen sie, bleibt es bei der Extrusion. */
  relief?: ReliefProfile[];
}

export function buildScene(input: BuildSceneInput): SceneModel {
  const { samples, points, countries, coverage, alpha = DEFAULT_ALPHA, relief = [] } = input;
  const columns = buildColumns(samples, points);
  // Das Gelände bekommt seine eigene Auflösung — der Track liegt ohnehin hier.
  const fromTrack = buildTerrainProfile(points, columns.map((c) => c.distM));
  const terrain: TerrainNode[] = fromTrack.length >= 2
    ? fromTrack
    : columns.map((c) => ({ distM: c.distM, terrainM: c.terrainM }));
  const totalM = columns.length ? columns[columns.length - 1].distM : 0;
  const startMs = columns.length ? columns[0].etaMs : 0;
  const endMs = columns.length ? columns[columns.length - 1].etaMs : 0;

  const cloudVals = columns.map((c) => c.cloudBaseM).filter((v): v is number => v != null);
  const snowVals = columns.map((c) => c.snowLineM).filter((v): v is number => v != null);
  const cloudBase = spanOf(cloudVals);
  const snowLine = spanOf(snowVals);

  const windCells = buildWindCells(columns, alpha, WALL_STEP_M, terrain);
  const rain = buildRainColumns(columns, cloudBase?.meanM ?? null, terrain);
  const warnZones = buildWarnZones(samples, columns);
  // Gipfel in Wolke wird am PROFIL geprüft, nicht an den Spalten: die Kuppe
  // zwischen zwei Wetterpunkten ist genau die, die man sonst übersieht.
  const peaksInCloud = cloudBase
    ? terrain.filter((t) => t.terrainM > cloudBaseAt(columns, t.distM, cloudBase.meanM))
        .map((t) => ({ distM: t.distM, terrainM: t.terrainM }))
    : [];

  const hasAT = countries.includes('AT') || countries.includes('CH');
  const onlyDE = countries.length > 0 && countries.every((c) => c === 'DE');

  return {
    columns,
    terrain,
    relief,
    totalM,
    startMs,
    endMs,
    windCells,
    rain,
    cloudBase,
    snowLine,
    warnZones,
    peaksInCloud,
    availability: {
      temperature: avail(columns.some((c) => c.tempC != null), 'Für diese Strecke liegt keine Temperatur vor.'),
      wind: avail(columns.some((c) => c.windKmh != null), 'Für diese Strecke liegt kein Wind vor.'),
      // Kein Regen heißt trocken, nicht „ohne Daten" — die Werte sind da.
      rain: avail(
        columns.some((c) => (c.precipMmH ?? 0) >= RAIN_MIN_MMH),
        'Auf der ganzen Strecke bleibt es trocken.',
        'trocken',
      ),
      cloudBase: avail(cloudBase != null, 'Die Wolkenbasis braucht Temperatur und Luftfeuchte — beides fehlt hier.'),
      snowLine: avail(
        snowLine != null,
        coverage && !coverage.snowLine && onlyDE
          ? 'Eine Schneefallgrenze liefert nur AROME (Österreich, Schweiz) — für eine Strecke in Deutschland gibt es keine.'
          : hasAT
            ? 'Die Quelle liefert für diese Strecke keine Schneefallgrenze.'
            : 'Eine Schneefallgrenze liefert nur AROME (Österreich, Schweiz).',
      ),
      warnings: avail(
        warnZones.length > 0,
        onlyDE
          ? 'Für den Zeitraum liegt keine amtliche Warnung vor.'
          : 'Amtliche Warnungen kommen bisher nur vom DWD — für Österreich und die Schweiz zeigt die Ansicht keine, auch wenn es dort welche gibt.',
        // Nur in Deutschland ist „keine Warnung" eine Aussage; sonst fehlt
        // wirklich die Quelle (AT/CH), und dann stimmt „ohne Daten".
        onlyDE ? 'keine Warnung' : undefined,
      ),
    },
  };
}

/* ============================ Farben ============================ */

/**
 * Temperatur-Stufen des Routenbands (°C-Kanten) — **stufig, nicht stetig**.
 *
 * Sie standen bis R3D-8 in `Scene3D.tsx`. Seit die Strecke auch auf der
 * Geländekarte und im Ergebnis eingefärbt wird, sind sie an drei Stellen
 * nötig — eine Palette ist Daten, keine Komponente, und gehört deshalb hierher.
 * `Scene3D` reicht sie unverändert weiter, damit bestehende Importe stimmen.
 */
export const TEMP_STEPS = [-5, 0, 5, 10, 15, 20, 25] as const;
export const TEMP_COLORS = ['#6E86B8', '#8FA8C8', '#9DB9A8', '#B9C08A', '#D4A373', '#C97B47', '#B4542B', '#8A1C1C'] as const;

export function tempStepIndex(tempC: number): number {
  let i = 0;
  for (const t of TEMP_STEPS) { if (tempC >= t) i++; else break; }
  return i;
}

/** Farben der Windrelation — dieselben Tokens wie die 2D-Legende. */
export const REL_COLORS: Record<'tail' | 'cross' | 'head', string> = {
  tail: '#7A9466', cross: '#C97B47', head: '#D7263D',
};

/* ============================ Gelände ============================ */

/**
 * Seitliche Abstände der gemessenen Reliefprofile (m). Zwei genügen: eines
 * dicht an der Strecke, eines an der Rückwand — mehr Silhouetten decken
 * einander, ohne mehr auszusagen.
 */
export const RELIEF_OFFSETS_M = [2000, 5000];

/**
 * Woher das Gelände kommt — und dass es nicht die Auflösung des Wetters hat.
 *
 * Ab R3D-4 sind es **zwei** Auflösungen: das Gelände löst je nach Track auf
 * (Größenordnung 10–100 m), das Wetter je Cluster (6–14 km, `resolutionNote`).
 * Ein pixelgenaues Profil darf den zweiten Umstand nicht überstrahlen
 * (`audit/route-3d.md` §19.8, D8) — deshalb steht dieser Satz immer neben dem
 * anderen, nie an seiner Stelle.
 */
export function terrainNote(
  source: 'file' | 'dem-filled' | 'dem-replaced',
  deltaM: number | null,
  reliefOffsetsM: number[] = [],
): string {
  const src = source === 'dem-filled'
    ? 'Gelände aus dem Höhenmodell (die Datei brachte keine brauchbaren Höhen mit)'
    : source === 'dem-replaced'
      ? `Gelände aus dem Höhenmodell — die Höhen der Datei wichen im Mittel ${Math.round(deltaM ?? 0)} m davon ab`
      : deltaM != null
        ? `Gelände aus der Datei, gegen das Höhenmodell geprüft (${Math.round(deltaM)} m Abweichung)`
        : 'Gelände aus der Datei, nicht gegen das Höhenmodell geprüft';
  const relief = reliefOffsetsM.length > 0
    ? `Relief ${reliefOffsetsM.map((m) => `${(m / 1000).toFixed(0)} km`).join(' und ')} daneben, ebenfalls gemessen`
    : 'die Rückwand ist die Extrusion desselben Profils, kein gemessenes Relief';
  return `${src} · ${relief}`;
}

/**
 * Warum die Ansicht keinen Hagel zeigt (`audit/route-3d.md` §19.5, D5).
 *
 * Beide DACH-Quellen sind Radar**beobachtungen**, und die App behandelt sie
 * selbst so: die Hagel-Layer der Karte erscheinen nur bei `forecastHour === 0`
 * (`MapView.tsx`). Für eine Ankunft in Stunden gibt es daraus nichts — ein
 * Hagel-Chip wäre leer oder erfunden. Was aus ICON-D2 zur Ankunftszeit
 * ableitbar wäre, ist Gewitterpotenzial; das ist eine andere Aussage und darf
 * nicht „Hagel" heißen.
 */
export const HAIL_NOTE =
  'Hagel zeigt die Ansicht nicht: die beiden Quellen (DWD KONRAD3D, MeteoSchweiz POH/MESHS) sind '
  + 'Radarbeobachtungen für „jetzt", nicht für eine Ankunft in Stunden — für Österreich gibt es auch dafür keine.';


/**
 * Obergrenze der Profil-Stützpunkte. Die Szene ist gut 1 200 px breit; mehr als
 * ein Knoten je halbe Bildspalte ist im Bild nicht unterscheidbar, kostet aber
 * `d`-Attribut und Zeichenzeit.
 */
export const PROFILE_MAX_NODES = 1400;

/**
 * Geländeprofil aus dem vollen Track — als **Hüllkurve**, nicht als Mittelwert:
 * je Bildspalte überleben der tiefste UND der höchste Punkt. Ein Mittel würde
 * genau das wegglätten, worum es geht (Grat, Kerbe, Sattel); eine reine
 * Ausdünnung („jeder n-te Punkt") würde die Kuppe zufällig treffen oder
 * verfehlen.
 *
 * `keepDists` erzwingt Knoten an den Wetter-Spalten: das Routenband hängt an
 * ihnen, und ein Band, das neben seinem Profil schwebt, wäre ein neuer Fehler.
 */
export function buildTerrainProfile(
  points: ReadonlyArray<{ dist: number; ele: number }>,
  keepDists: ReadonlyArray<number> = [],
  maxNodes = PROFILE_MAX_NODES,
): TerrainNode[] {
  const pts = points.filter((p) => Number.isFinite(p.dist) && Number.isFinite(p.ele));
  if (pts.length === 0) return [];
  if (pts.length <= 2) return pts.map((p) => ({ distM: p.dist, terrainM: p.ele }));

  const d0 = pts[0].dist;
  const span = pts[pts.length - 1].dist - d0;
  const bins = Math.max(1, Math.min(Math.floor(maxNodes / 2), pts.length));
  const binOf = (d: number) => (span > 0 ? Math.min(bins - 1, Math.floor(((d - d0) / span) * bins)) : 0);

  const keep = new Set<number>([0, pts.length - 1]);
  let cur = binOf(pts[0].dist);
  let lo = 0;
  let hi = 0;
  for (let i = 1; i < pts.length; i++) {
    const b = binOf(pts[i].dist);
    if (b !== cur) {
      keep.add(lo);
      keep.add(hi);
      cur = b;
      lo = i;
      hi = i;
      continue;
    }
    if (pts[i].ele < pts[lo].ele) lo = i;
    if (pts[i].ele > pts[hi].ele) hi = i;
  }
  keep.add(lo);
  keep.add(hi);
  for (const d of keepDists) keep.add(nearestByDistIdx(pts, d));

  return [...keep].sort((a, b) => a - b).map((i) => ({ distM: pts[i].dist, terrainM: pts[i].ele }));
}

function nearestByDistIdx(pts: ReadonlyArray<{ dist: number }>, target: number): number {
  let loI = 0;
  let hiI = pts.length - 1;
  while (loI < hiI) {
    const mid = (loI + hiI) >> 1;
    if (pts[mid].dist < target) loI = mid + 1;
    else hiI = mid;
  }
  const prev = Math.max(0, loI - 1);
  return Math.abs(pts[prev].dist - target) <= Math.abs(pts[loI].dist - target) ? prev : loI;
}

/** Geländehöhe an einer Distanz (linear zwischen den Stützpunkten). */
export function terrainAt(nodes: ReadonlyArray<TerrainNode>, distM: number): number {
  if (nodes.length === 0) return 0;
  if (distM <= nodes[0].distM) return nodes[0].terrainM;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].distM >= distM) {
      const a = nodes[i - 1];
      const b = nodes[i];
      const t = (distM - a.distM) / Math.max(1e-9, b.distM - a.distM);
      return a.terrainM + (b.terrainM - a.terrainM) * t;
    }
  }
  return nodes[nodes.length - 1].terrainM;
}

/**
 * Tiefster Geländepunkt einer Spanne — die Unterkante von Windwand und
 * Regensäule. Ohne sie klaffte zwischen Wand und Boden eine Lücke, sobald das
 * Gelände innerhalb einer Spalte tiefer liegt als am Abtastpunkt (das Bild wird
 * oben ohnehin exakt am Himmelspolygon beschnitten).
 */
export function minTerrainBetween(nodes: ReadonlyArray<TerrainNode>, fromM: number, toM: number): number {
  if (nodes.length === 0) return 0;
  let m = Math.min(terrainAt(nodes, fromM), terrainAt(nodes, toM));
  for (const n of nodes) {
    if (n.distM < fromM) continue;
    if (n.distM > toM) break;
    if (n.terrainM < m) m = n.terrainM;
  }
  return m;
}

/** Wolkenbasis an einer Distanz — die der nächsten Spalte, sonst das Mittel. */
function cloudBaseAt(columns: SceneColumn[], distM: number, fallbackM: number): number {
  let best: SceneColumn | null = null;
  let bestD = Infinity;
  for (const c of columns) {
    const d = Math.abs(c.distM - distM);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best?.cloudBaseM ?? fallbackM;
}

/* ============================ Spalten ============================ */

function buildColumns(samples: SampleETA[], points: TourPoint[]): SceneColumn[] {
  return samples.map((s, i) => {
    const w = s.weather ?? null;
    const windKmh = w?.windSpeedMps != null ? w.windSpeedMps * MS_TO_KMH : null;
    const gustKmh = w?.gustMps != null ? w.gustMps * MS_TO_KMH : null;
    let windRel: WindRelation | null = null;
    let windComponentKmh: number | null = null;
    if (w?.windSpeedMps != null && w.windDirectionDeg != null && points.length >= 2) {
      const comp = headwindComponentMps(bearingAtDist(points, s.dist), w.windDirectionDeg, w.windSpeedMps);
      windComponentKmh = comp * MS_TO_KMH;
      // Dieselben Schwellen wie die Wind-Marker der Ergebnis-Karte.
      windRel = w.windSpeedMps < 4 ? null : comp > 0.7 ? 'tail' : comp < -0.7 ? 'head' : 'cross';
    }
    const terrainM = Number.isFinite(s.ele) ? s.ele : 0;
    const cloudBaseM = w?.temperatureC != null && w.relativeHumidityPct != null
      ? terrainM + lclAgl(w.temperatureC, w.relativeHumidityPct)
      : null;
    const warnLevel = w && w.warnings.length ? Math.max(...w.warnings.map((x) => x.level)) : null;
    return {
      index: i,
      distM: s.dist,
      terrainM,
      etaMs: s.etaMs,
      lat: s.lat,
      lon: s.lon,
      tempC: w?.temperatureC ?? null,
      apparentC: w?.apparentTempC ?? null,
      windKmh,
      gustKmh,
      windDirDeg: w?.windDirectionDeg ?? null,
      windRel,
      windComponentKmh,
      precipMmH: w?.precipitationMmH ?? null,
      precipSource: w?.precipitationSource ?? null,
      precipType: w?.precipitationType ?? 'none',
      humidityPct: w?.relativeHumidityPct ?? null,
      cloudBaseM,
      cloudCoverPct: w?.cloudCoverPct ?? null,
      snowLineM: w?.snowLineM ?? null,
      batteryPct: s.batteryPctRemaining ?? null,
      warnLevel,
      confidence: w
        ? {
            temperature: w.confidence.temperature,
            wind: w.confidence.wind,
            gust: w.confidence.gust,
            precipitation: w.confidence.precipitation,
          }
        : null,
    } as SceneColumn;
  });
}

/* ============================ Intervalle ============================ */

export interface SegmentEdges {
  fromM: number;
  toM: number;
  fromMs: number;
  toMs: number;
}

/**
 * Kanten eines Spaltenintervalls `[from..to]` in Metern und in Zeit.
 *
 * Ein Sample steht fuer seine **Umgebung**, nicht fuer einen Punkt: die Kante
 * laeuft deshalb bis zur Mitte zum jeweiligen Nachbarn. Ohne diese Ausdehnung
 * haette ein einzelnes abweichendes Sample die Ausdehnung null — im Browser
 * gesehen als „22:24–22:24 · km 0,0–0,0" (§14.4). An den Streckenenden gibt es
 * keinen Nachbarn; dort bleibt die Kante, wo sie ist.
 *
 * Regenfenster (1b) und Go/No-Go-Abschnitte (1c) teilen diese Regel — sie darf
 * nicht zweimal verschieden geschrieben werden (§17.3 C10).
 */
export function segmentEdges(
  columns: Array<{ distM: number; etaMs: number }>,
  from: number,
  to: number,
): SegmentEdges {
  const a = columns[from];
  const b = columns[to];
  const prev = columns[from - 1];
  const next = columns[to + 1];
  return {
    fromM: prev ? (prev.distM + a.distM) / 2 : a.distM,
    toM: next ? (b.distM + next.distM) / 2 : b.distM,
    fromMs: prev ? Math.round((prev.etaMs + a.etaMs) / 2) : a.etaMs,
    toMs: next ? Math.round((b.etaMs + next.etaMs) / 2) : b.etaMs,
  };
}

/* ============================ Windwand ============================ */

/**
 * Die Wand steht senkrecht über der Strecke: je Spaltenintervall und
 * `WALL_STEP_M` ein Segment, dessen Wert `windAtAGL` aus dem Bodenwind
 * hochrechnet. Eingestuft wird in die fünf benannten Bänder — die Farbe ist
 * damit eine Aussage („30–45 km/h"), kein Farbverlauf.
 */
export function buildWindCells(
  columns: SceneColumn[],
  alpha = DEFAULT_ALPHA,
  stepM = WALL_STEP_M,
  profile: ReadonlyArray<TerrainNode> = [],
): WindCell[] {
  const out: WindCell[] = [];
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    if (c.windKmh == null) continue;
    const fromM = i === 0 ? c.distM : (columns[i - 1].distM + c.distM) / 2;
    const toM = i === columns.length - 1 ? c.distM : (c.distM + columns[i + 1].distM) / 2;
    if (toM <= fromM) continue;
    // Von der Geländeoberkante bis eine Bandhöhe über den höchsten Punkt der Tour.
    const topOfWall = c.terrainM + Math.max(stepM, ceilTo(maxTerrain(columns) - c.terrainM + stepM, stepM));
    const first = out.length;
    for (let lo = c.terrainM; lo < topOfWall; lo += stepM) {
      const hi = Math.min(lo + stepM, topOfWall);
      // Die Höhe über Grund bleibt die des Abtastpunktes — die Wand wird unten
      // nur verlängert, nicht neu gerechnet.
      const agl = (lo + hi) / 2 - c.terrainM;
      const kmh = windAtAGL(c.windKmh, agl, alpha);
      out.push({ fromM, toM, loM: lo, hiM: hi, band: windBandIndex(kmh), kmh });
    }
    if (profile.length >= 2 && out.length > first) {
      const floorM = minTerrainBetween(profile, fromM, toM);
      if (floorM < out[first].loM) out[first] = { ...out[first], loM: floorM };
    }
  }
  return out;
}

/* ============================ Regen ============================ */

export function buildRainColumns(
  columns: SceneColumn[],
  fallbackCloudBaseM: number | null,
  profile: ReadonlyArray<TerrainNode> = [],
): RainColumn[] {
  const out: RainColumn[] = [];
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    const mm = c.precipMmH ?? 0;
    if (mm < RAIN_MIN_MMH || c.precipType === 'none') continue;
    const fromM = i === 0 ? c.distM : (columns[i - 1].distM + c.distM) / 2;
    const toM = i === columns.length - 1 ? c.distM : (c.distM + columns[i + 1].distM) / 2;
    const top = c.cloudBaseM ?? fallbackCloudBaseM;
    const baseM = profile.length >= 2 ? Math.min(c.terrainM, minTerrainBetween(profile, fromM, toM)) : c.terrainM;
    out.push({
      fromM,
      toM,
      baseM,
      topM: top != null && top > c.terrainM ? top : c.terrainM + 1200,
      mmH: mm,
      source: c.precipSource,
      type: c.precipType,
    });
  }
  return out;
}

/* ============================ Warnzonen ============================ */

/**
 * Eine Warnung wird zur **Raumzone**: km-Spanne der betroffenen Samples ×
 * Gültigkeitsfenster der Meldung. Dieselbe Dedup-Regel wie
 * `weatherAggregate` — eine `alertId` ist eine Zone, nicht viele.
 */
export function buildWarnZones(samples: SampleETA[], columns: SceneColumn[]): WarnZone[] {
  const byId = new Map<string, WarnZone>();
  samples.forEach((s, i) => {
    const col = columns[i];
    if (!col) return;
    for (const w of s.weather?.warnings ?? []) {
      const prev = byId.get(w.alertId);
      if (prev) {
        prev.fromM = Math.min(prev.fromM, col.distM);
        prev.toM = Math.max(prev.toM, col.distM);
      } else {
        byId.set(w.alertId, {
          fromM: col.distM,
          toM: col.distM,
          fromMs: w.onsetMs,
          toMs: w.expiresMs,
          level: w.level,
          event: w.event,
          headline: w.headline,
        });
      }
    }
  });
  return [...byId.values()].sort((a, b) => b.level - a.level || a.fromM - b.fromM);
}

/* ============================ Ehrlichkeits-Texte ============================ */

/**
 * B1/E4 — die **tatsächliche** Auflösung der Tour-Werte. Nicht das Modellgitter:
 * die Anreicherung fragt je Cluster an (`radiusForTerrain`) und trennt Höhen in
 * `DEFAULT_ELEV_BAND_M`-Bänder. Beides steht in `pointForecast/clustering.ts`,
 * damit die Zahl hier nie auseinanderläuft.
 */
export function resolutionNote(terrain: Terrain): string {
  const km = Math.round(radiusForTerrain(terrain) / 1000);
  return `Auflösung ≈ ${km} km · ${DEFAULT_ELEV_BAND_M} m Höhenband — die Werte gelten für die Umgebung, nicht für den Meter.`;
}

/** Kurzform für den Chip (die lange Fassung steht im Titel-Attribut). */
export function resolutionChip(terrain: Terrain): string {
  return `≈ ${Math.round(radiusForTerrain(terrain) / 1000)} km · ${DEFAULT_ELEV_BAND_M} m`;
}

/**
 * B2/E5 — welche Quellen tatsächlich beteiligt sind. Bei Grenztouren sind es
 * zwei Stacks; ein einzelnes Modell zu nennen wäre falsch.
 */
export function sourceNote(countries: Country[]): string {
  const label: Record<Country, string> = {
    DE: 'DWD (ICON-D2 / MOSMIX + Live + RADOLAN)',
    AT: 'GeoSphere (AROME + INCA + TAWES)',
    CH: 'GeoSphere AROME + MeteoSwiss SMN',
  };
  const used = countries.length ? countries : (['DE'] as Country[]);
  return used.map((c) => label[c]).join(' · ');
}

/**
 * Konfidenz-Mittel über die Strecke. Unter `UNCLEAR_BELOW` sagt die Ansicht
 * „unklar" statt einer Aussage — die Regel aus dem Auftrag, hier an einer Stelle.
 */
export const UNCLEAR_BELOW = 0.45;

export function meanConfidence(columns: SceneColumn[], key: keyof ConfidenceSet): number | null {
  const vals = columns.map((c) => c.confidence?.[key]).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function confidenceWord(v: number | null): 'unklar' | 'mittel' | 'gut' | null {
  if (v == null) return null;
  return v < UNCLEAR_BELOW ? 'unklar' : v < 0.7 ? 'mittel' : 'gut';
}

/* ============================ Kopplung Position ↔ Zeit ============================ */

/**
 * Position → Ankunftszeit. Der gekoppelte Regler bewegt beide Bahnen über
 * **diese** Funktion; die ETA ist die Wahrheit, nicht eine zweite Zeitachse.
 */
export function etaAtDist(columns: SceneColumn[], distM: number): number | null {
  if (!columns.length) return null;
  if (distM <= columns[0].distM) return columns[0].etaMs;
  const lastCol = columns[columns.length - 1];
  if (distM >= lastCol.distM) return lastCol.etaMs;
  for (let i = 1; i < columns.length; i++) {
    const a = columns[i - 1];
    const b = columns[i];
    if (distM <= b.distM) {
      const t = (distM - a.distM) / Math.max(1e-6, b.distM - a.distM);
      return a.etaMs + t * (b.etaMs - a.etaMs);
    }
  }
  return lastCol.etaMs;
}

/** Umkehrung: Zeit → Position (für die entkoppelte Zeitbahn). */
export function distAtEta(columns: SceneColumn[], etaMs: number): number | null {
  if (!columns.length) return null;
  if (etaMs <= columns[0].etaMs) return columns[0].distM;
  const lastCol = columns[columns.length - 1];
  if (etaMs >= lastCol.etaMs) return lastCol.distM;
  for (let i = 1; i < columns.length; i++) {
    const a = columns[i - 1];
    const b = columns[i];
    if (etaMs <= b.etaMs) {
      const t = (etaMs - a.etaMs) / Math.max(1, b.etaMs - a.etaMs);
      return a.distM + t * (b.distM - a.distM);
    }
  }
  return lastCol.distM;
}

/** Nächste Spalte zu einer Distanz (Punkt-Abfrage). */
export function columnAtDist(columns: SceneColumn[], distM: number): SceneColumn | null {
  if (!columns.length) return null;
  let best = columns[0];
  let bestD = Math.abs(best.distM - distM);
  for (const c of columns) {
    const d = Math.abs(c.distM - distM);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

/** 15-Minuten-Raster des Auftrags — das Zeitband rastet darauf ein. */
export const TIME_STEP_MS = 15 * 60 * 1000;

export function snapToStep(etaMs: number, startMs: number, stepMs = TIME_STEP_MS): number {
  return startMs + Math.round((etaMs - startMs) / stepMs) * stepMs;
}

/* ============================ Hilfen ============================ */

function avail(any: boolean, note: string, emptyLabel?: string): LayerAvailability {
  if (any) return { any, note: '' };
  return emptyLabel ? { any, note, emptyLabel } : { any, note };
}

function spanOf(vals: number[]): { meanM: number; minM: number; maxM: number } | null {
  if (!vals.length) return null;
  return {
    meanM: vals.reduce((a, b) => a + b, 0) / vals.length,
    minM: Math.min(...vals),
    maxM: Math.max(...vals),
  };
}

function maxTerrain(columns: SceneColumn[]): number {
  return columns.reduce((m, c) => Math.max(m, c.terrainM), 0);
}

function ceilTo(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

/** Bandgrenzen für die Legende (die Zahlen stammen aus `crossSection.ts`). */
export const WIND_BAND_LABELS = [
  `< ${WIND_BANDS_KMH[0]}`,
  `${WIND_BANDS_KMH[0]}–${WIND_BANDS_KMH[1]}`,
  `${WIND_BANDS_KMH[1]}–${WIND_BANDS_KMH[2]}`,
  `${WIND_BANDS_KMH[2]}–${WIND_BANDS_KMH[3]}`,
  `> ${WIND_BANDS_KMH[3]}`,
] as const;
