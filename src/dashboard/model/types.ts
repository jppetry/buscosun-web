/**
 * Typen des Dashboards (Phase DB): Eingänge (Fusion + Alternativquellen) und das View-Model, das die Kacheln zeichnen.
 * Die Kacheln rechnen nichts — sie zeichnen `DashboardVM`. `model/build.ts` baut es rein aus den Eingängen
 * (`verify:dashboard`), `fixture.ts` liefert im Entwicklungsmodus die Werte der Vorlage (Pixel-Diff).
 */
import type { ParamId } from '../origin';
import type { DashRange } from '../dashUrl';
import type { PointForecastV2 } from '../../pointForecast/fusion/output';
import type { CubeCellRow } from '../../pointForecast/cubeSource';
import type { Country } from '../../types';
import type { PhaseId } from './rules';

// ---------------------------------------------------------------------------
// Anzeige-Bausteine
// ---------------------------------------------------------------------------

/** Ein angezeigter Wert. `t` = formatierter Text; `t: null` + `na` = nicht verfügbar (Grund); `t: null` ohne `na` = lädt. */
export interface Shown { t: string | null; o: ParamId; na?: string }

export type IconKind = 'sun' | 'sunCloud' | 'cloud' | 'rain' | 'moon' | 'moonCloud';
export interface IconVM { kind: IconKind; drops?: 1 | 2 | 3; dark?: boolean }

export type Tone = 'ok' | 'warn' | 'err' | 'wait';
export type LoadState = 'loading' | 'ok' | 'none' | 'na' | 'error';

// ---------------------------------------------------------------------------
// Eingänge
// ---------------------------------------------------------------------------

export interface PlaceIn { name: string; lat: number; lon: number; country: Country }

export interface FusionIn {
  v2: PointForecastV2;
  cells: CubeCellRow[];
  emission: 'first' | 'core' | 'update' | null;
  pending: string[];
  notes: string[];
  /** P(Niederschlag > 0) je Gültigzeit aus der Verteilung der Fusion (`exceedance(dist, 0)`), beim Empfang berechnet — `pWetOf`. */
  pWet: Record<number, number | null>;
  /** Sonne unter dem Horizont an Stunde 0 (NOAA-Sonnenstand, `terrainPhysics.ts`), beim Empfang berechnet. */
  night0: boolean | null;
  /** E-DB-23 (P92): Nächte über die ganze Achse als [von, bis] in ms (Sonne unter −0,833°, alle 10 min), beim Empfang berechnet. */
  nights?: Array<[number, number]>;
}

/** Eine amtliche Warnung am Punkt — Texte wörtlich aus der Quelle (Warn-Layer-Sonderregel). */
export interface WarningIn {
  headline: string | null;
  description: string | null;
  sender: string | null;
  channel: string;
  onsetMs: number | null;
  expiresMs: number | null;
  severityRank: number;
}
export interface WarningsIn { state: LoadState; channel: string; items: WarningIn[]; stampMs: number | null; note: string | null }

export interface UvIn { state: LoadState; city: string | null; distanceKm: number | null; days: Array<number | null>; note: string | null }

export interface PollenIn { state: LoadState; region: string | null; species: Array<{ name: string; levels: Array<number | null> }>; note: string | null }

export interface NowcastIn {
  state: LoadState;
  sources: string[];
  horizonLabel: string;
  frames: Array<{ t: number; mmh: number }>;
  slotMs: number | null;
  note: string | null;
}

export interface CellsIn { state: LoadState; text: string | null }
export interface HailIn { state: LoadState; text: string | null }

export interface TerrainIn {
  state: LoadState;
  halfKm: 10 | 20 | 50;
  axisDeg: number;
  /** Profil entlang der Achse: s in km (−halfKm … +halfKm), h in m ü. NN. */
  profile: Array<{ s: number; h: number }>;
  /** Stationen des Katalogs im Schnitt (≤ 3 km neben der Achse), T aus dem MOSMIX-Stationsprodukt zur Stunde 0. */
  stations: Array<{ name: string; s: number; h: number; t: number | null }>;
  /** Nächste Katalogstationen außerhalb des Schnitts (Namen). */
  outside: string[];
  note: string | null;
}

export interface IconD2In {
  state: LoadState;
  thunderMax: number | null;
  rotationMax: number | null;
  snowFresh24: number | null;
  gustMax: number | null;
  run: string | null;
  note: string | null;
}

export interface DashInputs {
  nowMs: number;
  place: PlaceIn | null;
  range: DashRange;
  fusionState: 'loading' | 'ok' | 'error';
  fusionError: string | null;
  fusion: FusionIn | null;
  warnings: WarningsIn;
  uv: UvIn;
  pollen: PollenIn;
  nowcast: NowcastIn;
  cells: CellsIn;
  hail: HailIn;
  terrain: TerrainIn;
  iconD2: IconD2In;
}

// ---------------------------------------------------------------------------
// View-Model
// ---------------------------------------------------------------------------

export interface TopVM { place: Shown; elev: Shown; run: Shown; anchorTime: Shown; status: { text: string; tone: Tone } }

export interface NowVM {
  temp: Shown; unit: string; icon: IconVM | null;
  td: Shown; rh: Shown; windGust: Shown; ps: Shown; psLabel: string;
  chips: Shown[];
  source: Shown;
}

export interface WarningVM {
  state: 'loading' | 'none' | 'active' | 'error' | 'na';
  channel: string;
  quote: string | null;
  footer: string;
}

export interface ConfVM {
  pct: number | null;
  value: Shown;
  word: Shown;
  /** E-KF-4 (P22): der am Archiv gemessene typische Fehler der Klasse („typisch ±0,8 °C") — was das Wort bedeutet. */
  typical: Shown;
  weights: Array<{ label: string; pct: number; color: string }>;
  weightsText: Shown;
  /** E-DB-23 (P89): halbe Breite des 80 %-Bands der Temperatur an Stunde 0 — „±1,3 °C". */
  band: Shown;
  /** E-DB-23 (P89): „80 % zwischen 21,7 und 24,3 °C". */
  bandRange: Shown;
  /** E-DB-23 (P90): der Trichter — halbe Bandbreite jetzt, danach je 24 h die größte (`h` = Stunden ab Stunde 0). */
  funnel: Array<{ h: number; half: number }>;
  /** E-DB-23 (P93): ab welcher Stunde die halbe Bandbreite 2/3/4 °C erreicht — Marken im Trichter. */
  funnelMarks: Array<{ h: number; k: number; label: string }>;
}

export interface PhaseVM {
  id: PhaseId;
  icon: IconVM | null;
  temp: Shown;
  pop: Shown;
  popLevel: 'faint' | 'mid' | 'high';
  /** Mittelwind — oder „Böen N", wenn die Phase die Warnschwelle erreicht (`highlight`). */
  wind: Shown;
  highlight: boolean;
}

/** Eine Stunde des Tages für die Tages-Detailansicht — alles aus buscosun Fusion, `null` = nicht verfügbar. */
export interface DayHour {
  t: number;
  t10: number | null; t50: number | null; t90: number | null; td: number | null; rh: number | null;
  w10: number | null; w50: number | null; w90: number | null; gust: number | null; dir: number | null;
  pr: number | null; prP90: number | null; pWet: number | null; pSnow: number | null;
  clct: number | null; clcl: number | null; clcm: number | null; clch: number | null;
  ps: number | null; snowline: number | null;
}

/** Tages-Detailansicht: Stundenwerte des Kalendertags und die Tageszusammenfassung je Größe (leer ⇒ Größe nicht wählbar). */
export interface DayDetailVM {
  fromMs: number; toMs: number; nowMs: number;
  hours: DayHour[];
  nights: Array<{ from: number; to: number }>;
  summary: { t: Shown; precip: Shown; wind: Shown; cloud: Shown; pressure: Shown; humidity: Shown; snow: Shown };
}

export interface DayVM {
  key: string;
  title: string;
  highlight: boolean;
  text: Shown;
  icon: IconVM | null;
  tmax: Shown;
  tmin: Shown;
  phases: PhaseVM[];
  rain: Shown; rainWet: boolean; rainSub: Shown;
  mid: { label: string; value: Shown; sub: Shown; subWarn: boolean };
  sun: Shown; sunSub: Shown;
  conf: { pct: number | null; text: Shown; cls: 'good' | 'fair' };
  /** Stundenwerte des Tages; fehlt für Tage ohne Fusionswerte (und in der Vorlage). */
  detail?: DayDetailVM | null;
}

export interface HourPoint { t: number; t50: number | null; t10: number | null; t90: number | null; td: number | null; pr: number | null }

export interface HourlyVM {
  startMs: number; endMs: number; hours: number;
  points: HourPoint[];
  dayLines: Array<{ t: number; label: string }>;
  ticks: Array<{ t: number; label: string }>;
  ticksMobile: Array<{ t: number; label: string }>;
  head: Shown;
  /** E-DB-23 (P92): Nächte im Zeitraum. */
  nights: Array<{ from: number; to: number }>;
  /** E-DB-23 (P93): wo die halbe Bandbreite zuerst ±2/3/4 °C erreicht — „±2° ab So 06". */
  marks: Array<{ t: number; k: number; label: string }>;
}

export interface ZoneVM {
  head: { period: Shown; models: Shown; ensemble: Shown; conf: Shown; confCls: 'good' | 'fair' };
  /** E-DB-23 (P91): ein Satz über den Tageskarten, aus denselben Tagesdaten. */
  lead: Shown;
  days: DayVM[];
  hourly: HourlyVM | null;
  /** Kopf des Stundenverlaufs auch ohne Daten (lädt / nicht verfügbar). */
  hourlyHead: Shown;
}

export interface NowcastVM {
  state: LoadState;
  headline: Shown;
  horizon: string;
  nowMs: number; fromMs: number; toMs: number;
  frames: Array<{ t: number; mmh: number }>;
  chips: Shown[];
}

/** Zeiträume der Nowcast-Detailansicht in Stunden ab jetzt (Radar trägt 2–3 h, danach buscosun Fusion). */
export const NOWCAST_DETAIL_RANGES: readonly number[] = [1, 2, 3, 6, 12, 24, 48];

/** Nowcast-Detailansicht (P54/P55): Radar-Frames bis zu seinem Horizont, danach die Stundenwerte von buscosun Fusion. */
export interface NowcastDetailVM {
  state: LoadState;
  nowMs: number;
  radar: Array<{ t: number; mmh: number }>;
  /** Abstand der Radar-Frames in Minuten (RV 10, INCA 15) */
  slotMin: number;
  radarEndMs: number | null;
  horizon: string;
  /** Fusion-Stunden ab Stunde 0 (48 h); die Anzeige nimmt nur die jenseits des Radar-Horizonts. */
  hours: PrecipVM['hours'];
  headline: Shown;
  /** Summe und Spitze je Zeitraum (Radar bis zu seinem Horizont + Fusion danach) */
  ranges: Array<{ h: number; sum: Shown; peak: Shown }>;
  /**
   * Regen- und Trockenphasen ab jetzt (Radar bis zu seinem Horizont, danach Fusion), je Phase Dauer, Menge und Spitze.
   * `cls` = Intensitätsklasse der Spitze (`RAIN_CLASSES`); `src` = welche Quelle die Phase trägt.
   */
  episodes: Array<{ wet: boolean; fromMs: number; toMs: number; mm: number; peakMmh: number; peakAtMs: number; cls: number; src: 'radar' | 'fusion' | 'mixed' }>;
  /** Aufsummierte Menge seit jetzt an den Phasengrenzen (stückweise linear: je Abschnitt konstante Rate). */
  cum: Array<{ t: number; mm: number }>;
  caption: Shown;
}

export interface CloudsVM {
  state: LoadState;
  fromMs: number; toMs: number;
  layers: Array<{ id: 'high' | 'mid' | 'low'; cells: Array<{ from: number; to: number; pct: number }> }>;
  total: Array<{ t: number; p10: number | null; p50: number | null; p90: number | null }>;
  caption: Shown;
}

export interface WindVM {
  state: LoadState;
  sectors: Array<{ deg: number; share: number }>;
  nowDeg: number | null;
  title: Shown;
  reach: Shown;
  reachHours: number | null;
  reachPct: number | null;
}

/** Windrose · Verteilung (P63): Herkunftsrichtung im gewählten Zeitraum, nach Windklasse gestapelt, nach Zeitdauer gewichtet. */
export interface WindRoseVM {
  state: LoadState;
  hours: number;
  /** 16 Sektoren à 22,5° um die Herkunftsrichtung; `classes[i]` = Zeitanteil in Windklasse i, Summe = `share`. */
  sectors: Array<{ deg: number; share: number; classes: number[] }>;
  /** Windklassen in m/s, leicht → stark; `classShare` = Zeitanteil je Klasse über alle Richtungen. */
  classLabels: string[];
  classShare: number[];
  /** Zeitanteil ohne freigegebene Richtung (schwacher, drehender Wind) — gehört in keinen Sektor. */
  unresolvedShare: number;
  nowDeg: number | null;
  nowWind: number | null;
  headline: Shown;
  detail: Shown;
}

export interface TerrainVM {
  state: LoadState;
  halfKm: 10 | 20 | 50;
  /** Herkunftsrichtung des Schnitts (Luv-Seite, `s` < 0) und der Ort — die 3D-Bühne legt Schnittlinie und Blickrichtung darauf. */
  axisDeg: number;
  center: { lat: number; lon: number } | null;
  /** Temperatur am Ort, Ortshöhe und Gradient — Grundlage der Temperaturfläche auf dem Relief; `null` bei Inversion oder ohne Profil. */
  thermal: { tOrt: number; hOrt: number; gamma: number } | null;
  /** Wind am Ort (10 m, Stunde 0): Herkunftsrichtung in Grad und Mittelwind. Höhenwind gibt der Punkt-Cube nicht her. */
  wind: { dirDeg: number | null; ms: number | null; gustMs?: number | null };
  /** Himmel am Ort, Stunde 0 (buscosun Fusion): Wolkenanteile je Schicht in %, Regen mit Chance und Schneeanteil — für die Schnittansicht. */
  sky: { low: number | null; mid: number | null; high: number | null; precipMmh: number | null; pWet: number | null; pSnow: number | null };
  header: Shown;
  chip: Shown; chipTone: 'ok' | 'warn';
  fromLabel: string; toLabel: string;
  profile: Array<{ s: number; h: number }>;
  axis: { top: number; bottom: number; step: number };
  hOrt: number | null;
  isotherms: Array<{ t: number; h: number; color: string; label: string }>;
  snowline: number | null; snowlineLabel: string | null;
  stations: Array<{ name: string; s: number; h: number; label: string }>;
  ort: { title: string; sub: string };
  table: Array<{ h: number; label: string; t: Shown; wind: Shown; ort: boolean }>;
  readout: { main: Array<string | { b: string }>; note: Array<string | { b: string }> };
  legendIso: string;
  note: string | null;
  /** Jan 17.10. (P97): Gelände am Punkt aus `v2.point.terrain` / `dWater` — unabhängig vom Schnitt. */
  site: SiteVM;
  /** Jan 17.10. (P16/P98): Temperatur und Feuchte je Druckfläche aus den Cube-Ebenen (t1, nächster Schritt). */
  levels: Array<{ hPa: number; t: Shown; rh: Shown; tVal: number | null; rhVal: number | null }>;
  /** Inversionsschicht im Schnitt (P70): Basis und Oberkante in m, Beschriftung. */
  inversion: { base: number; top: number; label: string } | null;
  /** Spanne der Schneefallgrenze p10–p90 im Schnitt (P72). */
  snowBand: { lo: number; hi: number } | null;
}

export interface SiteVM {
  state: LoadState;
  position: Shown;
  slope: Shown; slopeDeg: number | null; aspectDeg: number | null;
  sky: Shown; svf: number | null;
  sink: Shown; sinkDepth: number | null;
  surface: Shown;
  water: Shown;
}

/** Jan 16.10.: Niederschlag über 48 h aus buscosun Fusion — Stundenmittel, p90 als Spanne, Regenchance (1 − pDry) und Schneeanteil (pSnow) je Stunde (P94). */
export interface PrecipVM {
  state: LoadState;
  fromMs: number; toMs: number;
  hours: Array<{ t: number; mean: number | null; p90: number | null; pWet: number | null; pSnow: number | null }>;
  sum: Shown; peak: Shown; wetHours: Shown; caption: Shown;
}
/** Jan 16.10.: Wind und Böen über 48 h — Mittelwind p50 mit Band p10–p90, Böen p50 (P95). */
export interface WindBandVM {
  state: LoadState;
  fromMs: number; toMs: number;
  points: Array<{ t: number; w10: number | null; w50: number | null; w90: number | null; g50: number | null }>;
  gustMax: Shown; windMax: Shown; caption: Shown;
}
/** Jan 16.10.: Luftdruck am Ort über 48 h mit Tendenz (P96). */
export interface PressureVM {
  state: LoadState;
  fromMs: number; toMs: number;
  points: Array<{ t: number; p: number | null }>;
  now: Shown; tendency: Shown; tendencyDir: 'up' | 'down' | 'flat' | null; range: Shown; caption: Shown;
}

export interface UvVM { state: LoadState; days: Array<{ label: string; value: number | null }>; caption: Shown; na: string | null }
export interface PollenVM { state: LoadState; species: Array<{ name: string; levels: Array<number | null> }>; caption: Shown; cams: string; na: string | null }
export interface IconD2VM { state: LoadState; title: string; rows: Array<{ label: string; value: Shown; tone: 'good' | 'muted' | 'strong' | 'warn' }>; foot: string }

export interface DashboardVM {
  nowMs: number;
  place: PlaceIn | null;
  range: DashRange;
  status: 'loading' | 'ok' | 'error' | 'noplace';
  error: string | null;
  top: TopVM;
  now: NowVM;
  warning: WarningVM;
  conf: ConfVM;
  zone: ZoneVM;
  nowcast: NowcastVM;
  nowcastDetail: NowcastDetailVM;
  clouds: CloudsVM;
  wind: WindVM;
  windRose: WindRoseVM;
  /** Jan 16.10.: drei Fusion-Kacheln im Reiter Details (P94–P96). */
  precip: PrecipVM;
  windBand: WindBandVM;
  pressure: PressureVM;
  terrain: TerrainVM;
  uv: UvVM;
  pollen: PollenVM;
  icond2: IconD2VM;
  footer: string;
  notes: string[];
}
