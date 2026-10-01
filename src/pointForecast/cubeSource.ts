/**
 * cubeSource.ts — buscosun Fusion auf dem Punkt-Cube (Phase FI, AP2 ff.).
 *
 * ── Was das ist ─────────────────────────────────────────────────────────────
 * Der zweite Vorhersagepfad hinter `getPointForecast({ pointSource: 'cube' })`. Er liest
 * das Bündel aus `buscosun-data` (AP1, `readPointBundle`: drei Cube-Stufen, Station,
 * Radar-Nowcast, Gelände) und rechnet damit DIESELBE Fusion wie der Live-Pfad —
 * `fuseHour` aus `fusion/fuse.ts` mit Kombination, Klimatologie-Prior, Familien und
 * Regime-Aufweitung. Nichts vom Motor wird kopiert; der Adapter liefert Samples, Kontext
 * und Achse (Plan §0.3: Integration, der Cube ist Hauptmember).
 *
 * ── Zwei Einstiege, eine Rechnung ───────────────────────────────────────────
 *   `fuseCubePoint(input, opts)`       PUR: (Bündeldaten, Klimatologie, nowMs, Optionen) →
 *                                      Schritte mit Verteilungen. Kein Netz, keine Uhr.
 *                                      Der Backtest (AP9) füttert dieselbe Funktion aus dem
 *                                      Archiv-Slot; die Produktion aus dem Bündel.
 *   `getPointForecastFromCube(opts)`   Lesen (AP1) → `fuseCubePoint` → `PointForecast`.
 *
 * ── Warum keine statische Verdrahtung in `pointForecast.ts` ─────────────────
 * Ein `await import('./cubeSource')` dort ließe Rollup einen Chunk mit allen Punkt-
 * Modulen bauen — die Textsonde in `verify:point-client` würde rot, `totalJs` wüchse (R8).
 * Deshalb registriert sich dieses Modul beim Laden (`registerCubePointSource`), und ein
 * Verbraucher (AP11, das Lab, die CLI) lädt es selbst per `await import()`.
 *
 * ── Zeitachse ───────────────────────────────────────────────────────────────
 * Die Cube-Achse ist die Datenachse: t1 stündlich 0–48 h, t2 dreistündlich 51–120 h, t3
 * sechsstündlich 126–336 h — 109 native Schritte ab dem jeweiligen QUELL-Lauf. In
 * Gültigzeit überlappen die Stufen (heute t1/t2 um 3 h, t2/t3 um 6 h); wo zwei dieselbe
 * Zeit tragen, gilt die FEINERE, und der Wechsel steht als Flag `seam` da — nie geglättet
 * (R7). Der Vorlauf für die Skill-Kurven ist die Stunde ab JETZT (Stundenboden), wie auf
 * dem Live-Pfad (V-FI-10: ob er nach dem Modell-Vorlauf gehört, misst AP9).
 *
 * ── Was hier (AP2) NICHT passiert ───────────────────────────────────────────
 * Keine PAP-4-Fälle (AP4 — bis dahin gilt die lineare Standard-Lapse des Motors über
 * `sourceElevation = hModEff`, also Basislinie B1), keine Nachbargewichtung (AP3), kein σ
 * aus dem Cube (AP6), keine Geländeterme mit Amplitude (AP5, `terrainDeltaC = 0`), kein
 * Anker, keine Interpolation, kein Klimatologie-Schwanz (AP7), keine v2-Ausgabe (AP8).
 */

import type { PointForecast, PointForecastHour, PointSourceSample } from './types';
import { pfCacheKey, registerPointSource, type PointForecastOptions } from './pointForecast';
import { fuseHour, hourlyClimaTemp, windTerrainFactor, type ClimaRef, type FusedPoint, type FusedVariable, type FusionContext } from './fusion/fuse';
import { stationValueOf, stationAtPoint, validateStackTable, STACK_VARS, type StackTable, type StackVar, type StackForm } from './fusion/stationValue';
import { verticalCorrection, STANDARD_LAPSE_PER_M, DZ_SURFACE_M, type VerticalResult } from './fusion/vertical';
import { gridToPoint, blockOffsets, GRID_SET, type GridCell, type GridResult } from './fusion/grid';
import {
  memberSigma, confidenceOf, cloudMixSharpness, consistentCloudTotal, sigmaClimaFallback, C_SPREAD, SIGMA_SYS_FLOOR_A1, CONF_DISCOUNT,
  type UncVar, type MemberSigma, type Confidence, type SigmaKind,
} from './fusion/uncertainty';
import { windSigmaAt } from './fusion/priors';
import { tpiAt } from './fusion/terrainScale';
import { terrainTerms, windBlendingFactor, TERRAIN_SET, type TerrainTermsResult } from './fusion/terrainTerms';
import { binnedAt, calibMetaText, type CalibOverrides } from '../point/calibDoc';
import { loadCalib, type LoadedCalib } from '../point/client/calibPoint';
import { loadLearned, type LoadedLearned } from '../point/client/learnedPoint';
import { loadClimaProduct, type LoadedClimaProduct } from '../point/client/climaPoint';
import { loadStack, type LoadedStack } from '../point/client/stackPoint';
import { estimateCoefficients, muAt, trendVector, type ClimaProduct, type MuEstimate } from '../point/fusionFit/climaProduct';
import { climaColumnsFor } from '../point/fusionFit/tables';
import { predict as predictLearned, predictPrecip as predictPrecipLearned, type PredictSituation } from '../point/fusionFit/predict';
import { speedLaw, type SpeedEntry } from '../point/fusionFit/fitSpeed';
import { buildZ, dTsfcProxy, sourceToPoint } from '../point/fusionFit/features';
import { binIndex, binRange } from '../point/fusionFit/strata';
import type { FusionTables } from '../point/fusionFit/tables';
import { ANCHOR_MAX, ANCHOR_TAU_H, anchorTerm, anchorTermLearned, anchorCurveValid, innovation, type AnchorCurvePoint, type AnchorPair, type Innovation } from './anchor';
import { spatialWeight } from './leadTimeWeights';
import { nowcastSourcesFor } from '../point/client/nowcastPoint';
import { SELECTION } from '../point/client/resolve';
import type { Country } from '../types';
import { skyViewFactor, type TerrainScales } from './fusion/terrainScale';
import { CLIMA_SIGMA_FALLBACK, DEWPOINT_LAPSE_PER_M } from './fusion/priors';
import { rhFromDewPoint, dewPointC } from './fusion/meteo';
import { meanOf, quantileOf, type Dist } from './fusion/dist';
import { getClimaField } from './fusion/attach';
import { toPointForecastV2, quantileMemo, type PointForecastV2 } from './fusion/output';
import type { FusionVariable } from './fusion/priors';
import { solarPosition } from './terrainPhysics';
import { detectFoehn } from './foehnDetector';
import { apparentTemperatureC } from './apparentTemperature';
import type { ClimaField, ClimaSample } from '../ml/climaField';
import { TIERS, CUBE_PLANES, CUBE_ENS_MEAN_VARS, POINT_CALIB_PATH, POINT_LEARNED_PATH, POINT_CLIMA_PATH, POINT_STACK_PATH, type TierId } from '../point/cubeFormat';
import { NOWCAST_SATURATION, type NowcastSourceId } from '../point/nowcastFormat';
import type { CubePointSeries, CubePointStep } from '../point/client/cubePoint';
import type { StaticPoint } from '../point/client/staticPoint';
import type { PointSourceManifest } from '../point/manifest';
import type { StationPointSeries } from '../point/client/stationPoint';
import type { NowcastPointSeries } from '../point/client/nowcastPoint';
import type { TerrainPointResult, TerrainOptions } from '../point/client/terrain';
import type { PngDecoder } from '../point/client/nowcastPoint';
import { readPointBundle, tiersForWindow, withCrossChunk, type PointBundle, type CrossChunkResult } from '../point/client/readPoint';
import { httpStore, type PointStore } from '../point/client/store';
import { cachedStore, idbBackend, memoryBackend, type CacheBackend } from '../point/client/cache';
import { loadZ0AtPoint, Z0_POINT_RADIUS_M, type Z0AtPoint, type Z0Options } from '../point/client/z0Point';
import { loadLandCoverAtPoint, isLandCover, kappaAt, landCoverCell, LANDCOVER_SET, type LandCover } from '../point/client/landCover';
import { decodeGrayPngBrowser, decodeRgbaPngBrowser } from '../point/client/browserPng';
import { pfStationSourceFrom, pfClimaGridFrom, pfIncaAnchorFrom } from './pfFlags';
import { INCA_BOUNDS } from '../sources/geosphereInca';

const H = 3_600_000;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------------------------------------------------------------------------
// Eingabe — pur, serialisierbar, aus dem Bündel oder aus dem Archiv
// ---------------------------------------------------------------------------

/** Die Geländegrößen, die der Algorithmus braucht — die Teilmenge von `TerrainPointResult`. */
export type CubeTerrain = Pick<TerrainPointResult, 'elevationM' | 'tpi500M' | 'tpi2000M' | 'svf' | 'slopeDeg' | 'aspectDeg' | 'horizonDeg' | 'scales' | 'sinkDepthM'>;

export interface CubeFusionInput {
  lat: number;
  lon: number;
  /** AX-5 (V-FS-5): das Land des Punkts (DE/AT/CH, LI zählt als CH) — der Stationswert nimmt dann einen Landeseintrag der Tabelle, wo einer geschrieben ist. */
  country?: string | null;
  /** Jetzt — die Uhr des Aufrufers, nie `Date.now()` in der Rechnung (Replay, D-12). */
  nowMs: number;
  /** Ausgabefenster in Gültigzeit (Voreinstellung im Leser: Stundenboden von jetzt … +336 h). */
  window: { fromMs: number; toMs: number; stepH: number };
  /** Echte Geländehöhe h_true; `null` = unbekannt (dann keine Verteilungen, s. `noTerrain`). */
  elevationM: number | null;
  /** Woher h_true kam (E-F-12: `station` = Punkt ≤ 250 m an der Katalogstation, deren Höhe gilt). */
  elevationFrom?: 'input' | 'station' | 'terrain' | null;
  terrain: CubeTerrain | null;
  cube: Partial<Record<TierId, CubePointSeries | null>>;
  station: StationPointSeries | null;
  /** Warum die Station (nicht) trägt — aus `judgeStation`, nur für die Provenienz. */
  stationReason: string | null;
  nowcast: NowcastPointSeries[];
  /** `imperv` %, `d0` m, `bldgH` m aus `point/static/urban` (AP5). */
  urban: Record<string, number | null> | null;
  /**
   * V-FI-17: Rauhigkeit am Punkt und je Stufe aus WorldCover (`z0Point.ts`) — schaltet die zweistufige Windkorrektur
   * ein. Fehlt das Feld (Voreinstellung), rechnet alles wie bisher (byte-gleich).
   */
  z0?: Z0AtPoint | null;
  /**
   * AP17 (E-F-15): z0 der Modelle je Stufe aus `point/static/z0mod` (ln z0 je Quelle an der nächsten Zelle, `absent` =
   * Windquellen ohne z0). Nur mit `CubeIo.z0mod`; wirkt nur mit `FuseCubeOptions.z0Model`. Fehlt das Feld, byte-gleich.
   */
  z0mod?: Partial<Record<TierId, StaticPoint | null>>;
  /**
   * AX-9: Klimanormale 1991–2020 der Stufe-1-Zelle (`point/static/clima-grid`, `t_mean_01…12`, `elev_src`, `n_src`, `src`).
   * Nur mit `CubeIo.climaGrid`; ersetzt im Motor-Prior das Tagesmittel der Temperatur (Tagesgang, σ_c, Nasstag bleiben
   * vom Stationsfeld). Fehlt das Feld, byte-gleich; `null` = Option an, aber kein Produkt/keine Zelle (benannt).
   */
  climaGrid?: StaticPoint | null;
  /**
   * Phase FL (E-FL-1): die gelernten Tabellen der Form K (`point/fusion.client.json`, Provenienz `hindcast`). Nur mit
   * `CubeIo.learnedSource: 'json'`; wirkt nur mit `FuseCubeOptions.learned`. Fehlt das Feld, byte-gleich.
   */
  learned?: FusionTables | null;
  /**
   * Phase FX-5 (E-FX-8, §6.5): das Klimatologieprodukt (`point/static/clima/v1/stations.json`, `climaProduct.ts`) für die
   * μ_c-Spalte einer station-Tabelle. Nur mit `CubeIo.climaSource: 'json'`; wirkt nur mit `learned` + Tabellen, deren Design
   * die Spalte für die Größe erklärt (`design.mean.climaVars`). Fehlt das Feld: die gelisteten Größen bleiben `absent`, benannt.
   */
  learnedClima?: ClimaProduct | null;
  /**
   * Phase FS (`audit/fusion-stationswert.md`): die Tabelle des Stationswerts (`stationValue.ts`, Provenienz `archive`).
   * Wirkt nur mit `FuseCubeOptions.stationValue`, einem Stationsmember AM Punkt (`table.range`) — fehlt das Feld, byte-gleich.
   */
  stack?: StackTable | null;
  index: { commit: string | null; publishedAt?: string; axis?: { usableToMs?: number | null; gaps?: Array<{ fromH: number; toH: number }> } } | null;
  /** Die Klimatologie — Prior der Schrumpfung. Ohne sie gibt es keine Verteilungen (K-3). */
  clima: ClimaField | null;
  /**
   * AP7: Stationsmessungen der letzten Stunden (BrightSky/TAWES/SMN), geholt mit Frist — NIE auf
   * dem kritischen Pfad. Der Anker rechnet daraus Messung − Cube-Wert (Innovation, `anchor.ts`).
   * `null` = nicht geholt / nicht rechtzeitig; `[]` = keine Station.
   */
  obs: CubeObs[] | null;
  /** AP7: welche Radarquellen den Punkt geometrisch decken (`nowcastSourcesFor`) — für das Flag `nowcastFallbackModel`. */
  nowcastCovering: NowcastSourceId[];
  notes: string[];
  skips: string[];
  errors: string[];
}

/** Eine Stationsmessung, wie der Anker sie braucht (AP7). */
export interface CubeObs {
  source: string;
  name?: string;
  lat: number;
  lon: number;
  elevM: number | null;
  distanceM: number;
  validAtMs: number;
  temperature: number | null;
  relativeHumidity: number | null;
  u: number | null;
  v: number | null;
  gust: number | null;
  /** Phase FS: der gemessene Taupunkt, wenn das Netz ihn führt — sonst rechnet der Stationswert ihn aus T und RH. Der Anker liest ihn nicht. */
  dewPoint?: number | null;
  /** AX-1: Kennung der Station beim Betreiber (DE: WMO-Kennung = Katalog-Kennung von MOSMIX; AT: TAWES-ID; CH: SMN-Kürzel). */
  stationId?: string;
  /** AX-1: die Messung kam auf die gezielte Abfrage der Station des Punkts. */
  byStation?: boolean;
  /**
   * AX-10: Gewicht 0…1 auf die Repräsentativität dieser „Messung" im Anker (set) — für Analysen statt Messungen
   * (INCA am Punkt: Abstand 0, aber Analysefehler abseits der Stationen ≈ 1 K). Fehlt: 1 (eine echte Messung).
   */
  weight?: number;
}

/**
 * AX-1 (V-FS-15): was der Messungs-Abruf über den Punkt weiß, sobald das Bündel da ist — die Station des Stationsprodukts
 * (MOSMIX) am Punkt. Der Abrufer holt deren eigene Messung (DE: BrightSky nach WMO-Kennung); ohne Hinweis holt er die
 * Stationen, die dem Punkt am nächsten liegen.
 */
export interface CubeObsHint {
  station?: { id: string; name: string; lat: number; lon: number; elev: number } | null;
}

/** Aus dem AP1-Bündel — die Produktion. Der Archiv-Adapter (AP9) baut dieselbe Form aus dem Slot. */
export function cubeInputFromBundle(b: PointBundle, clima: ClimaField | null, obs: CubeObs[] | null = null): CubeFusionInput {
  return {
    obs, nowcastCovering: nowcastSourcesFor(b.input.lat, b.input.lon),
    lat: b.input.lat, lon: b.input.lon, nowMs: b.window.nowMs, window: { fromMs: b.window.fromMs, toMs: b.window.toMs, stepH: b.window.stepH },
    // E-F-12: steht der Punkt an einer Katalogstation (≤ 250 m), ist deren Höhe h_true — die
    // DEM-Höhe bleibt im `terrain`-Block für TPI, Horizont und Senke.
    elevationM: b.input.elevationM ?? (b.stationChoice?.elevationFrom === 'station' ? b.stationChoice.elevationM : null) ?? b.terrain?.elevationM ?? null,
    elevationFrom: b.input.elevationM != null ? 'input' : b.stationChoice?.elevationFrom === 'station' ? 'station' : b.terrain?.elevationM != null ? 'terrain' : null,
    terrain: b.terrain ? {
      elevationM: b.terrain.elevationM, tpi500M: b.terrain.tpi500M, tpi2000M: b.terrain.tpi2000M, svf: b.terrain.svf,
      slopeDeg: b.terrain.slopeDeg, aspectDeg: b.terrain.aspectDeg, horizonDeg: b.terrain.horizonDeg,
      scales: b.terrain.scales ?? null, sinkDepthM: b.terrain.sinkDepthM ?? null,
    } : null,
    cube: b.cube, station: b.station, stationReason: b.stationChoice?.reason ?? null, nowcast: b.nowcast,
    urban: b.urban?.byColumn ?? null,
    index: b.index ? { commit: b.index.commit, publishedAt: b.index.publishedAt, axis: b.index.axis } : null,
    clima, notes: [...b.notes], skips: [...b.skips], errors: [...b.errors],
    ...(b.z0mod ? { z0mod: b.z0mod } : {}),
    ...(b.climaGrid !== undefined ? { climaGrid: b.climaGrid } : {}),
  };
}

// ---------------------------------------------------------------------------
// Ausgabe der reinen Rechnung
// ---------------------------------------------------------------------------

/** Flags je Schritt — die Liste aus Plan §2 plus `seam`/`interpolated`/`noTerrain` (AP2). */
export type StepFlag =
  | 'extrapolatedBelowModel' | 'inversionBody' | 'stdLapseFallback' | 'chunkBorderTruncated' | 'belowGround925'
  | 'nowcastFallbackModel' | 'climatologyOnly' | 'stale' | 'seam' | 'interpolated' | 'noTerrain' | 'nowcastSaturated'
  | 'stationOnly' | 'anchored' | 'learned' | 'learnedSpeed' | 'learnedPrecip';

export type CubeProduct = 'cube-t1' | 'cube-t2' | 'cube-t3' | 'station' | 'nowcast' | 'anchor' | 'climatology';
export type StepTier = TierId | 'station' | 'clima';

/** Interpolierte Quantile eines Schritts, der auf keinem nativen Raster liegt (AP7). */
export interface InterpQ { p10: number; p50: number; p90: number; mean: number }
export type InterpVar = 'temperature' | 'dewPoint' | 'humidity' | 'clouds' | 'precipitation' | 'windSpeed' | 'gust';

export interface CubeMemberInfo {
  product: CubeProduct;
  /** Der `source`-Tag, unter dem der Motor das Sample führt (Footprint, Beiträger-Liste). */
  tag: string;
  run?: string;
  runAtMs?: number;
  /** Alter des tragenden Laufs/Slots zur Gültigzeit, Stunden. */
  ageH?: number;
  models?: string[];
  station?: { id: string; name: string; distKm: number; dElevM: number | null; /** AX-8: `mosmix_l` | `mosmix_s` (nur gesetzt, wenn nicht L). */ source?: string };
  nowcast?: { source: NowcastSourceId; ageMin: number; validAtSuspect: boolean; saturated: boolean };
  /** AP6: die σ, mit der das Member je Größe in die Kombination ging (PAP 6). */
  sigma?: Partial<Record<UncVar, number>>;
  /** AP7: der Anker — Versatz Messung − Cube je Größe und der Zuschlag an diesem Schritt. */
  anchor?: { sources: string[]; pairs: number; fraction: number; offsetK: number | null; termK: number; termU: number; termV: number; termGust: number };
}

export interface CubeStep {
  validAtMs: number;
  /** Stunden ab dem Stundenboden von `nowMs` — der Vorlauf der Skill-Kurven (V-FI-10). */
  leadH: number;
  /**
   * Cube-Stufe, `station` (die Station füllt eine Stunde ohne Cube-Schritt), `clima` (Schwanz jenseits der Daten).
   * Ein interpolierter Schritt trägt die Stufe des vorangehenden tragenden Schritts (das Band, in dem er liegt).
   */
  tier: StepTier;
  interpolated: boolean;
  /** AP7: die interpolierten Quantile, wenn `interpolated` — sonst fehlt das Feld. */
  interp?: Partial<Record<InterpVar, InterpQ>> & { confidence?: Partial<Record<UncVar, number>> };
  flags: StepFlag[];
  /** Die Verteilungen des Motors; `null` ohne Gelände oder Klimatologie. */
  fused: FusedPoint | null;
  members: CubeMemberInfo[];
  /** Die rohen Zellwerte dieses Schritts (Ebenen-ID → Wert), unverändert aus dem Chunk. */
  cell: Record<string, number | null>;
  belowGroundHPa: number[] | null;
  /** AP4: die vertikale Korrektur des Cube-Members (PAP 4) — `null`, wenn T̄ oder Höhen fehlen. */
  vertical: VerticalResult | null;
  /** AP3: die Nachbargewichtung (PAP 3) — `null`, wenn keine Nachbarn gelesen wurden (N = 1, die Zelle). */
  grid: { n: number; truncated: boolean; weights: GridResult['weights']; hModEffM: number | null } | null;
  /** AP6: σ des Cube-Members je Größe (PAP-6-Zweig, Teile), die Streuung der Ausgabe und der Konfidenz-Score. */
  uncertainty: Partial<Record<UncVar, VarUncertainty>>;
  /** AP8: normierte Gewichte je Motor-Größe und der Prior-Anteil 1 − β (Hook `onWeights`, nur Auskunft). */
  weights?: Partial<Record<FusionVariable, { members: Array<{ tag: string; w: number }>; beta: number }>>;
  /** AP8: die Samples, die in den Motor gingen (nach PAP 3–5 und Anker) — die exakte Eingabe der Kombination, für Replay und „Quelle + Gewicht". */
  samples?: PointSourceSample[];
  /** AP5: die Terrain-Terme (PAP 5) — Geometrie gerechnet, Terme `null`, solange A/A_uhi fehlen; Wind-Faktor `null` ohne z0. */
  terrain: (TerrainTermsResult & { windFactor: number | null }) | null;
  /** Phase FS: was nach der Kombination ersetzt wurde — der Stationswert je Größe, die durchgereichte Bewölkung. Fehlt ohne die Optionen. */
  post?: {
    stationValue?: Partial<Record<StackVar, { form: StackForm; group: number; M: number; I: number | null; L: number | null; value: number }>>;
    learnedClouds?: boolean;
  };
}

export interface VarUncertainty {
  sigmaKind: SigmaKind;
  /** σ, mit der das Cube-Member in die Kombination ging (Einheit der Größe). */
  sigmaMember: number;
  parts: MemberSigma['parts'];
  /** Streuung der Ausgabe (posterior), `null` ohne Verteilung. */
  sigmaPost: number | null;
  sigmaClima: number;
  confidence: Confidence | null;
}

export interface CubeFusionResult {
  schema: 'fi-ap2';
  point: { lat: number; lon: number; hTrue: number | null; terrain: CubeTerrain | null };
  axis: {
    /** Gültigzeiten der nativen Schritte, aufsteigend. */
    native: number[];
    perTier: Record<TierId, number>;
    /** Gültigzeiten, an denen die Stufe wechselt (Flag `seam`). */
    seams: number[];
    gaps: Array<{ fromH: number; toH: number }> | null;
    usableToMs: number | null;
  };
  steps: CubeStep[];
  provenance: {
    indexCommit: string | null;
    runs: Partial<Record<TierId, { run: string; sourceRun: string; sourceRunAtMs: number; models: string[]; manifestFrom: string | null }>>;
    station: { run: string; runAtMs: number; ageH: number; id: string; name: string; distKm: number; dElevM: number | null; elevM: number } | null;
    stationReason: string | null;
    nowcast: Array<{ source: NowcastSourceId; stamp: string; ageMin: number; frames: number; extrapolationH: number }>;
    /** `grid` = Stationsfeld (climaGrid.json), `clima-grid` = Klimagitter 1991–2020 der Zelle für das Tagesmittel T (AX-9). */
    clima: 'grid' | 'clima-grid' | 'none';
  };
  /** Setzungen, die in dieser Rechnung wirken — je Eintrag ein Grund (Plan §2.3). */
  calib: string[];
  notes: string[];
  timing: { algoMs: number };
}

// ---------------------------------------------------------------------------
// Achse
// ---------------------------------------------------------------------------

interface AxisStep { validAtMs: number; tier: TierId; step: CubePointStep; series: CubePointSeries; index: number }

/** Gleiche Gültigzeit = innerhalb einer halben Stunde (die Achsen sind auf volle Stunden). */
const SAME_TIME_MS = 30 * 60_000;
/** AX-7 (set): σ des Ensemble-Members = Faktor·σ_ens — σ_ens roh ist unterdispersiv (Bericht #1: 28,7 % statt 66,7 % im Band); c(p,f) fehlt bis zur Archivmessung. */
export const ENS_MEMBER_SIGMA_FACTOR = 1.5;
export const ENS_MEMBER_SIGMA_FLOOR = Object.freeze({ temperature: 0.6, wind: 0.5, precip: 0.05 });

/**
 * Die nativen Schritte im Fenster, je Gültigzeit EINER — die feinere Stufe gewinnt
 * (t1 vor t2 vor t3, das ist die Reihenfolge von `TIERS`).
 */
export function nativeAxis(input: Pick<CubeFusionInput, 'cube' | 'window'>): AxisStep[] {
  const { fromMs, toMs } = input.window;
  const taken: AxisStep[] = [];
  for (const tier of TIERS) {
    const s = input.cube[tier.id];
    if (!s) continue;
    for (let i = 0; i < s.steps.length; i++) {
      const st = s.steps[i];
      if (st.validAtMs < fromMs || st.validAtMs > toMs) continue;
      if (taken.some((t) => Math.abs(t.validAtMs - st.validAtMs) <= SAME_TIME_MS)) continue;
      taken.push({ validAtMs: st.validAtMs, tier: tier.id, step: st, series: s, index: i });
    }
  }
  taken.sort((a, b) => a.validAtMs - b.validAtMs);
  return taken;
}

// ---------------------------------------------------------------------------
// Samples — die Abbildung Cube/Station/Radar → Sample-Vertrag des Motors
// ---------------------------------------------------------------------------

const CUBE_SIGMA_VARS = ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'ps', 'snowlmt'] as const;
const CUBE_QUANT_VARS = ['t2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'snowlmt'] as const;

const num = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v);

function pickRecord(values: Record<string, number | null>, ids: readonly string[], suffix: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const id of ids) out[id] = num(values[`${id}${suffix}`]);
  return out;
}

/** Ein Cube-Schritt als Sample: t1 → `highres`, t2/t3 → `global`; `sourceElevation = hModEff` (AP2). */
export function cubeSampleOf(tier: TierId, step: CubePointStep, series: CubePointSeries): PointSourceSample {
  const v = step.values;
  // Ein Profil gibt es nur, wenn mindestens ein Feld belegt ist — die Ebenen existieren in
  // jedem Chunk, in t2/t3 aber durchgehend MISSING (R6).
  const hasProfile = ['gammaEff', 'zBase', 'zInv', 'dTInv'].some((k) => num(v[k]) != null);
  return {
    source: `cube-${tier}`,
    family: tier === 't1' ? 'highres' : 'global',
    temperature: num(v.t2m),
    sourceElevation: num(v.hModEff) ?? series.hModEffM,
    u: num(v.u10), v: num(v.v10), gust: num(v.gust),
    relativeHumidity: null,
    dewPoint: num(v.td2m),
    snowLine: num(v.snowlmt),
    cloudLow: num(v.clcl), cloudMid: num(v.clcm), cloudHigh: num(v.clch),
    cloudTotal: num(v.clct),
    pressure: num(v.ps),
    precipitation: num(v.precip),
    uvIndex: null,
    distanceMeters: 0,
    sigmaDiv: pickRecord(v, CUBE_SIGMA_VARS, '_sd'),
    sigmaEns: pickRecord(v, CUBE_SIGMA_VARS, '_sd_ens'),
    q10: pickRecord(v, CUBE_QUANT_VARS, '_q10'),
    q90: pickRecord(v, CUBE_QUANT_VARS, '_q90'),
    srcCount: num(v.srcCount),
    ensCount: num(v.ensCount),
    // AX-7 (Schema 6): das Member-Mittel — in Schema-5-Chunks fehlen die Ebenen, das Feld bleibt weg (nicht ein Objekt aus null)
    ...(() => { const em = pickRecord(v, CUBE_ENS_MEAN_VARS, '_ens') as Record<string, number | null>; return Object.values(em).some((x) => x != null) ? { ensMean: em as PointSourceSample['ensMean'] } : {}; })(),
    hModEff: num(v.hModEff) ?? series.hModEffM,
    profile: hasProfile ? { gammaEff: num(v.gammaEff), zBase: num(v.zBase), zInv: num(v.zInv), dTInv: num(v.dTInv) } : null,
  };
}

/** Der Stationsschritt (MOSMIX-L aus dem Repo) als `mosmix`-Sample — derselbe Tag wie BrightSky-MOSMIX auf dem Live-Pfad. */
export function stationSampleOf(series: StationPointSeries, values: Record<string, number | null>): PointSourceSample {
  return {
    source: 'mosmix',
    family: 'mosmix',
    temperature: num(values.t2m),
    sourceElevation: series.station.elev,
    u: num(values.u10), v: num(values.v10), gust: num(values.gust),
    relativeHumidity: null,
    dewPoint: num(values.td2m),
    snowLine: num(values.snowlmt),
    cloudLow: num(values.clcl), cloudMid: num(values.clcm), cloudHigh: num(values.clch),
    cloudTotal: num(values.clct),
    pressure: num(values.ps),
    precipitation: num(values.precip),
    uvIndex: null,
    distanceMeters: series.station.distanceKm * 1000,
  };
}

/** Der Tag, unter dem der Motor die Radarquelle kennt (Footprint 1 km, `FOOTPRINT_M`). */
export function nowcastTagOf(id: NowcastSourceId): string {
  return id === 'radvor_rv' ? 'radolan' : id === 'combiprecip' ? 'rzc' : 'inca';
}

// ---------------------------------------------------------------------------
// Die reine Rechnung
// ---------------------------------------------------------------------------

export interface FuseCubeOptions {
  /** Gültigzeit-Toleranz, mit der ein Radar-Frame einem Schritt zugeordnet wird (Voreinstellung 30 min). */
  nowcastToleranceMs?: number;
  /** AP4: PAP 4 auf das Cube-Member anwenden (Voreinstellung ja). `false` = AP2-Verhalten (lineare Lapse des Motors) — Negativkontrolle. */
  vertical?: boolean;
  /** AP3: PAP 3 (Nachbargewichtung) anwenden, wenn die Reihe Nachbarn trägt (Voreinstellung ja). `false` = die nächste Zelle (N = 1). */
  grid?: boolean;
  /** AP6: PAP 6 — σ des Cube-Members aus dem Cube, Konsistenz-Ops, Konfidenz (Voreinstellung ja). `false` = Streuungs-Prior des Motors (AP3-Verhalten). */
  uncertainty?: boolean;
  /** AP5: PAP 5 — Terrain-Terme rechnen und benennen (Voreinstellung ja). Amplituden aus `calib`; heute null ⇒ Werte unverändert. */
  terrain?: boolean;
  /** AP5: Amplituden und Rauhigkeiten von außen (Replay/Verifier); Voreinstellung = `calib.json` heute (alles null). */
  terrainCalib?: { A?: number | null; Auhi?: number | null; tpiSigmaM?: number | null; z0Mod?: number | null; z0True?: number | null };
  /**
   * AP13: gemessene Kalibrierung aus `calib.json` (nur `measured` mit Beleg, `calibDoc.ts`). Fehlt sie, gelten die
   * Setzungen — byte-gleich zu vorher (Negativkontrolle). Ein ausdrücklich gesetztes `terrainCalib` hat Vorrang.
   */
  calib?: CalibOverrides | null;
  /** AP7: Anker aus `input.obs` (Voreinstellung ja, wenn Messungen da sind). */
  anchor?: boolean;
  /**
   * AP7: Klimatologie-Schwanz jenseits des letzten nativen Schritts bis `window.toMs` (6-h-Schritte, Flag
   * `climatologyOnly`). Voreinstellung nein — die reine Funktion liefert, was die Daten tragen;
   * `getPointForecastFromCube` verlangt ihn, weil das Produkt bis 336 h antwortet.
   */
  tail?: boolean;
  /**
   * AP16 (E-F-16): PAP 3 mit κ je Zelle aus der Landbedeckung (`input.z0.landCover`, nur mit `CubeIo.landCover`) —
   * t1/t2; t3 κ = 1. Voreinstellung aus ⇒ κ = 1 wie bisher (byte-gleich). Ohne Landbedeckung im Eingang bleibt κ = 1,
   * benannt.
   */
  kappa?: boolean;
  /**
   * AP16 (V-FI-65): z0 des Modells in t1/t2 als ln-Mittel der Blockzellen (Box um die ZELLMITTE) mit den PAP-3-Gewichten
   * statt der Box um den Punkt; t3 bleibt bei der Box um den Punkt. Voreinstellung aus ⇒ byte-gleich.
   */
  z0CellBox?: boolean;
  /**
   * AP17 (E-F-15, V-FI-58): z0 des Modells je Stufe aus dem GRIB (`input.z0mod`) statt der WorldCover-Näherung: ln-Mittel
   * über die Windquellen des Laufs, die die Zelle decken — GRIB-Wert, wo die Quelle z0 veröffentlicht, sonst die
   * Näherung (Box um den Punkt bzw. mit `z0CellBox` die Blockzellen). Wirkt nur mit z0 am Punkt (`input.z0`).
   * Voreinstellung aus ⇒ byte-gleich.
   */
  z0Model?: boolean;
  /**
   * Phase FL (FL-AP5, E-FL-1): die Lernstufe der Form K aus `input.learned` — Mittel und σ des Cube-Members für T, Td,
   * Wind, Böe und Bewölkung aus den gelernten Tabellen (`src/point/fusionFit/predict.ts`), vor dem Anker (der rechnet die
   * Innovation dann gegen das gelernte Mittel). Niederschlag bleibt beim Motor (Stufe 1). Voreinstellung aus ⇒ byte-gleich;
   * ohne Tabellen im Eingang bleibt alles wie ohne Option, benannt.
   */
  learned?: boolean;
  /**
   * FL-AP8c (V-FL-22): die gelernte Geschwindigkeitsverteilung hinter dem u/v-Modell — nach der Fusion der Stunde wird
   * die Rice des Windes durch TN(a + b·E_Rice, c·sd_Rice) des Stratums aus `tables.speed` ersetzt (gestutzte Normal bei
   * 0; die Richtung bleibt aus u/v). Wirkt nur mit `learned` und einem geschriebenen Eintrag; Voreinstellung aus ⇒ byte-gleich.
   */
  learnedSpeed?: boolean;
  /**
   * FL-AP8c (V-FL-18): die gelernte Hürde ersetzt `fused.precipitation` (Auftritt mit der Spalte logit(1 − pDry_Cube) am
   * Motor-Wert der Stunde, Menge gelernt), aber nur, wo kein Radar- und kein Stationsmember Niederschlag trägt (K-2 bleibt
   * sonst) und das Stratum die CV-Schranke nimmt. Wirkt nur mit `learned`; Voreinstellung aus ⇒ byte-gleich.
   */
  learnedPrecip?: boolean;
  /**
   * Phase FS (V-FS-2): das gelernte Mittel gilt AM PUNKT. Der Motor bringt jedes Sample selbst von `sourceElevation` auf
   * h_true (T, Td) und skaliert den Wind mit dem Geländefaktor des Footprints — auf das gelernte Mittel angewendet ist das
   * eine zweite Korrektur (gemessen: T-MAE des Members 1,18–1,54 K wie gespeichert, 1,69–2,31 K wie der Motor ihn liest).
   * Mit der Option wird das Member so vorkompensiert, dass der Motor genau das gelernte Mittel (plus Anker) liest — wie
   * `applyVertical` es für PAP 4 tut. Wirkt nur mit `learned`; Voreinstellung aus ⇒ byte-gleich.
   */
  learnedAtPoint?: boolean;
  /**
   * Phase AX, AX-2 (E-FV-3, V-FV-1): die Route der Lernstufe je Stufe. Der Client rechnete immer Route 1 (die Lauf-Route
   * des Hindcasts: Open-Meteo `data_run`, für 51–336 h nur 87–95 Sommertage 2026); Route 3 (dyn: AIFS + IFS-ENS-Kontrolllauf,
   * 289 Tage, ganzjährig) trägt in den Karten ¾ der Langfrist-Zeilen und hat Strata für die Bins 3–5. `'tier'` = t1 → 1,
   * t2/t3 → 3. Voreinstellung 1 ⇒ byte-gleich. Gemessen am Archiv: `audit/fusion-ausbau.md` §2.
   */
  learnedRoute?: 1 | 3 | 'tier';
  /**
   * Phase AX, AX-3 (Bericht #16): Stunden ohne nativen Schritt interpolieren die TEMPERATUR als Anomalie gegen den
   * klimatologischen Tagesgang μ_c des Punkts (Klimatologieprodukt, `CubeIo.climaSource`) statt linear — linear kappt
   * Tagesmaximum und -minimum. Orakel auf der Wahrheit (389 Stationen, 129 Tage, `audit/fusion-ausbau.md` §3): 6-h-Schritte
   * MAE 1,12 → 0,95 K (−15,5 %), 3-h-Schritte −4,1 %; Taupunkt und Böe ohne Gewinn ⇒ bleiben linear, Td wird auf T gekappt.
   * Braucht das Produkt und Gelände am Punkt; ohne beides linear wie bisher, benannt. Voreinstellung aus ⇒ byte-gleich.
   */
  anomalyInterp?: boolean;
  /**
   * Phase AX, AX-7 (E-AX-6, Bericht #3): das Ensemble-Mittel des IFS-ENS (Schema-6-Ebenen `<id>_ens`, nur t3) als EIGENES
   * Member neben dem Stufenmittel — T, u/v und Niederschlag, σ = `ENS_MEMBER_SIGMA_FACTOR`·σ_ens (set: σ_ens ist roh und
   * unterdispersiv, c(p,f) fehlt), mindestens der Boden je Größe. Roh gemessen an 389 Stationen (13 Monate): bei 126–336 h
   * gegen den Kontrolllauf T +14/+23 %, Wind +13/+16 % — die Wirkung NACH der Lernstufe ist nicht gemessen (braucht das
   * Mittel als Spalte im Fit). Voreinstellung aus ⇒ byte-gleich; ohne Ebenen (Schema 5) wirkungslos, benannt.
   */
  ensMember?: boolean;
  /**
   * AX-9 (§6c.3): Trendversatz des Klimatologie-Priors — die Referenzperioden (Stationsfeld 1995–2024, Klimagitter
   * 1991–2020) liegen hinter der Erwärmung; an 14 762 Punkt-Monaten 2023–2026 waren beide ≈ 1,2 K zu kalt. Mit
   * `CLIMA_TREND_K_PER_YEAR` ab der Periodenmitte: Stationsfeld MAE 1,63 → 1,36 K, Gitter 1,57 → 1,22 K. Literaturwert
   * (DACH ≈ 0,4–0,5 K/Dekade), set. Voreinstellung aus ⇒ byte-gleich.
   */
  climaTrend?: boolean;
  /**
   * Phase FS (D2): `false` = kein Klimatologie-Schritt für Kombinationen, deren Member alle eine explizite σ tragen
   * (Cube-Member mit PAP 6 oder Lernstufe, Stationsmember) — `FusionContext.priorShrink`. Niederschlag behält den Schritt
   * (K-2, Member ohne explizite σ). Voreinstellung an ⇒ byte-gleich.
   */
  priorShrink?: boolean;
  /**
   * Phase AX, E-AX-11 (V-AX-13, `audit/fusion-ausbau.md` §6h): mit `priorShrink: false` behalten WIND und BÖE den
   * Klimatologie-Schritt trotzdem (`FusionContext.priorShrink = { except: ['wind', 'gust'] }`). Am Archiv (16.–28.09., Modus L =
   * Punkt ohne eigene Station) verlor der Wind ohne den Schritt gegen die Kette von 5e (0–6 h −1,2 %!, 126–240 h −4,1 %!) und lag
   * bei 0–120 h unter der Lernstufe allein, während T/Td/Böe gewannen. Wirkt nur mit `priorShrink: false`; Voreinstellung aus
   * ⇒ byte-gleich.
   */
  priorShrinkWind?: boolean;
  /**
   * Phase AX, E-AX-11 (zweite Hypothese): der Anker für u, v und Böe wird über die DISTANZ der Messung zusätzlich mit
   * e^(−(d / anchorWindKm)²) gedämpft — `spatialWeight` (D_REF 20 km) gibt einer 20 km entfernten Messung noch 0,5, doch beim
   * Wind trägt sie eine fremde Exposition und Richtung. T bleibt beim bisherigen Gewicht. Messungen am Punkt (d = 0) und die
   * INCA-Analyse sind unberührt. Voreinstellung aus (kein Wert) ⇒ byte-gleich.
   */
  anchorWindKm?: number;
  /**
   * Phase FS (H14): die gelernte Bewölkungsverteilung wird durchgereicht statt nachfusioniert (`fused.clouds`), wo die
   * Lernstufe sie trägt. Wirkt nur mit `learned`; Voreinstellung aus ⇒ byte-gleich.
   */
  learnedClouds?: boolean;
  /**
   * Phase FS (H9/H10): der Stationswert — steht ein Stationsmember AM Punkt (`input.stack.range`), ersetzt
   * M + b + w·I + c·(L − M) die fusionierte Verteilung von T, Td, Windgeschwindigkeit und Böe (`stationValue.ts`); I aus der
   * jüngsten Messung ≤ jetzt einer Station am Punkt, L aus der Lernstufe (ohne sie die Form ohne L). Die Richtung, die
   * Feuchte und die Phase bleiben aus der Kombination. Wirkt nur mit `input.stack`; Voreinstellung aus ⇒ byte-gleich.
   */
  stationValue?: boolean;
  /**
   * AP7: stündliche Achse — Stunden ohne nativen Schritt füllt die Station (wenn sie den Punkt vertritt),
   * sonst werden die Quantile der Nachbarschritte linear interpoliert und markiert. Voreinstellung nein
   * (nur native Schritte); `getPointForecastFromCube` verlangt sie, weil `PointForecast.hours` stündlich ist.
   */
  hourly?: boolean;
}

/** Ein Radar-Slot, der älter ist als das, gilt als veraltet (`stale`) — Setzung: RV/INCA-Slots kommen alle 5/15 min. */
export const NOWCAST_STALE_MIN = 60;
/** Radar-Horizont (h), innerhalb dessen ein fehlendes Radar als `nowcastFallbackModel` gilt. */
export const NOWCAST_HORIZON_H = 3;

const UNC_VARS: readonly UncVar[] = ['temperature', 'dewpoint', 'wind', 'gust', 'clouds'];

/** Streuung der Ausgabe je Größe aus dem `FusedPoint` (σ der Familie; Wind: Komponente der Rice-Verteilung). */
function sigmaPostOf(f: FusedPoint, v: UncVar): number | null {
  const fv = v === 'temperature' ? f.temperature : v === 'dewpoint' ? f.dewPoint : v === 'wind' ? f.windSpeed : v === 'gust' ? f.gust : f.clouds;
  const s = (fv?.dist as { sigma?: number } | undefined)?.sigma;
  return s != null && Number.isFinite(s) ? s : null;
}
/**
 * KF (V-KF-2): die Schärfe des Konfidenz-Scores, wo σ keines ist — die Zwei-Atome-Mischung der Bewölkung (`cloudMix`) bekommt die
 * größte Atommasse (`cloudMixSharpness`); jede andere Verteilung behält `1 − σ_post/σ_clima` (`undefined` ⇒ Voreinstellung).
 */
function spreadOverrideOf(f: FusedPoint, v: UncVar): number | undefined {
  if (v !== 'clouds') return undefined;
  const d = f.clouds?.dist;
  return d && d.kind === 'cloudMix' ? cloudMixSharpness(d) : undefined;
}

/**
 * AP3: die Zellwerte am Punkt aus dem 2×2-Block (PAP 3). Ohne Nachbarn in der Reihe bleibt es
 * die nächste Zelle (N = 1, `null`).
 */
export function gridStep(
  a: AxisStep, lat: number, lon: number, hTrue: number, ldM?: number | null, lhM?: number | null,
  kappaAtCell?: ((iy: number, ix: number) => number | null) | null,
): GridResult | null {
  const nb = a.series.neighbours;
  if (!nb || !nb.length) return null;
  const tier = TIERS.find((t) => t.id === a.tier)!;
  const cells: GridCell[] = [{ dy: 0, dx: 0, distM: a.series.cell.offsetKm * 1000, hModEffM: num(a.step.values.hModEff) ?? a.series.hModEffM, values: a.step.values }];
  for (const n of nb) {
    const values = n.values[a.index];
    if (!values) continue;
    cells.push({ dy: n.dy, dx: n.dx, distM: n.distKm * 1000, hModEffM: num(values.hModEff) ?? n.hModEffM, values });
  }
  const block = blockOffsets(lat - a.series.cell.lat, lon - a.series.cell.lon);
  // AP16: κ je Zelle nur, wenn JEDE vorhandene Blockzelle einen hat — sonst κ = 1 für alle (keine halbe Gewichtung).
  if (kappaAtCell) {
    const inBlock = cells.filter((c) => block.some((b) => b.dy === c.dy && b.dx === c.dx));
    const ks = inBlock.map((c) => kappaAtCell(a.series.cell.iy + c.dy, a.series.cell.ix + c.dx));
    if (ks.every((k) => k != null)) inBlock.forEach((c, i) => { c.kappa = ks[i] as number; });
  }
  return gridToPoint({
    cells, block, hTrue,
    ldM: ldM ?? tier.deg * GRID_SET.mPerDeg,
    // AP13: gemessenes L_h nur, wenn es da ist — sonst das Feld weglassen (gridToPoint nimmt GRID_SET.lhM).
    ...(lhM != null ? { lhM } : {}),
  });
}

/** AP17: z0 des Modells an einer Zelle aus den Windquellen einer Stufe (`z0ModelMix`). */
export interface Z0ModelMix {
  /** ln-Mittel über die tragenden Quellen, ln(m). */
  lnZ0: number;
  /** Quellen mit GRIB-z0 an dieser Zelle. */
  grib: string[];
  /** Quellen ohne z0 (IFS, AIFS, AICON, C-LAEF) — mit der WorldCover-Näherung gezählt. */
  approx: string[];
  /** Windquellen des Laufs, die die Zelle nicht decken (Domäne) — nicht gezählt. */
  outside: string[];
}

/** Deckt die Domäne einer Quelle (Manifest `geometry`) die Zelle? Dieselbe Regel wie `coversPoint` (Rand nur an der Domäne). */
function geometryCovers(g: PointSourceManifest['geometry'], lat: number, lon: number): boolean {
  if (!g) return true;
  for (const box of [g.domain, g.clip] as Array<{ latMin: number; latMax: number; lonMin: number; lonMax: number } | null>) {
    if (!box) continue;
    const margin = box === g.domain ? g.edgeMarginKm ?? 0 : 0;
    const dLat = margin / 111.32, dLon = margin / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    if (lat < box.latMin + dLat || lat > box.latMax - dLat || lon < box.lonMin + dLon || lon > box.lonMax - dLon) return false;
  }
  return true;
}

/**
 * AP17 (E-F-15): z0 des Modells an der nächsten Zelle einer Stufe — ln-Mittel über die Windquellen des Laufs (Spalten und
 * `absent` des Produkts ∩ Quellen des Laufs mit Mittelwert, nicht gedroppt), die die Zelle decken: GRIB-Wert, wo die Quelle
 * z0 veröffentlicht, sonst `wcZ0` (WorldCover-Näherung). `null`, wenn keine GRIB-Quelle die Zelle trägt ⇒ der Aufrufer
 * bleibt bei der Näherung (byte-gleich). Näherung, benannt: welche Quelle welchen Schritt trägt, steht nicht im Manifest
 * (`steps` ist eine Anzahl) — gemittelt wird über den Lauf.
 */
export function z0ModelMix(
  sp: StaticPoint | null | undefined, sources: readonly PointSourceManifest[] | undefined,
  cellLat: number, cellLon: number, wcZ0: number | null,
): Z0ModelMix | null {
  if (!sp || wcZ0 == null || !(wcZ0 > 0)) return null;
  const wind = new Set([...Object.keys(sp.byColumn), ...Object.keys(sp.absent ?? {})]);
  const grib: string[] = [], approx: string[] = [], outside: string[] = [];
  let acc = 0, n = 0;
  for (const s of sources ?? []) {
    if (!wind.has(s.id) || s.dropped || (s.members ?? 0) > 1 || !(s.steps > 0)) continue;
    if (s.id in sp.byColumn) {
      const v = sp.byColumn[s.id];
      if (v == null || !Number.isFinite(v)) { outside.push(s.id); continue; }
      acc += v; n++; grib.push(s.id);
    } else if (geometryCovers(s.geometry, cellLat, cellLon)) {
      acc += Math.log(wcZ0); n++; approx.push(s.id);
    } else outside.push(s.id);
  }
  return n && grib.length ? { lnZ0: acc / n, grib, approx, outside } : null;
}

/**
 * AP4: PAP 4 auf das Cube-Sample anwenden.
 *
 * Der Motor korrigiert die Temperatur jedes Samples selbst linear von `sourceElevation` auf
 * `ctx.elevationM` — und führt die Unsicherheit dieser Korrektur als Repräsentativitätsterm
 * (`REP.lapseResidualPerM · |Δh|`). Beides soll bleiben. Deshalb wird das Sample NICHT auf
 * h_true gesetzt, sondern so vorkorrigiert, dass die lineare Lapse des Motors die PAP-4-
 * Korrektur VOLLENDET: T_sample = T_PAP4 − γ_Motor · (h_mod_eff − h_true). Ohne Profil
 * (Fall `std`, Γ = γ_Motor) ist T_sample = T̄ — byte-gleich zu AP2. Der Taupunkt bleibt dem
 * Motor überlassen (DEWPOINT_LAPSE_PER_M über `sourceElevation`), der Druck wird hier
 * hydrostatisch übertragen (der Motor kennt ihn nicht).
 */
export function applyVertical(sample: PointSourceSample, hTrue: number, lapseEngine: number): VerticalResult | null {
  if (sample.temperature == null || sample.hModEff == null || !Number.isFinite(sample.hModEff)) return null;
  const v = verticalCorrection({ tMean: sample.temperature, hModEff: sample.hModEff, hTrue, profile: sample.profile ?? null, ps: sample.pressure ?? null });
  sample.temperature = v.t - lapseEngine * (sample.hModEff - hTrue);
  if (v.ps != null) sample.pressure = v.ps;
  return v;
}

/** Tag des Jahres (1…366), UTC. */
/** AX-9: Lapse für die Höhenkorrektur der Gitternormale (set — derselbe Wert wie `lapsePerM` des Stationsfelds). */
export const CLIMA_GRID_LAPSE_PER_M = 0.0065;
/** AX-9: Mitte der Normalperiode 1991–2020 des Klimagitters (Jahresbruch). */
export const CLIMA_GRID_PERIOD_CENTRE = 2006.0;
/** AX-9 (§6c.3): Trendversatz des Klimatologie-Priors, K je Jahr ab der Periodenmitte (Literatur DACH 0,4–0,5 K/Dekade; set). */
export const CLIMA_TREND_K_PER_YEAR = 0.045;
/** Jahr als Bruch (2026,5 = Anfang Juli 2026) — für den Trendversatz. */
export function yearFracOf(ms: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (ms - start) / (end - start);
}
const MONTH_CENTRE_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
/**
 * AX-9: Monatsnormale `<v>_01…12` einer Zelle linear zwischen den Monatsmitten (Tag 15) auf einen Tag des Jahres
 * gebracht (Dezember → Januar über den Jahreswechsel). `null`, wenn eine der beiden Monatsspalten fehlt — die Zelle
 * liegt dann außerhalb der Gitter, und ein halber Wert wäre keiner.
 */
export function climaGridMonthlyAt(col: Record<string, number | null> | null | undefined, v: string, doy: number): number | null {
  if (!col) return null;
  const d = ((Math.round(doy) - 1) % 365 + 365) % 365 + 1;
  let m1 = 11;
  for (let m = 0; m < 12; m++) if (MONTH_CENTRE_DOY[m] <= d) m1 = m;
  const m2 = (m1 + 1) % 12;
  const c1 = MONTH_CENTRE_DOY[m1];
  const c2 = MONTH_CENTRE_DOY[m2] + (m2 === 0 ? 365 : 0);
  const dd = d < c1 ? d + 365 : d;
  const f = (dd - c1) / (c2 - c1);
  const a = col[`${v}_${String(m1 + 1).padStart(2, '0')}`];
  const b = col[`${v}_${String(m2 + 1).padStart(2, '0')}`];
  if (a == null || b == null) return null;
  return a + (b - a) * f;
}

function doyOf(ms: number): number {
  const d = new Date(ms);
  return Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
}

export function fuseCubePoint(input: CubeFusionInput, opts: FuseCubeOptions = {}): CubeFusionResult {
  const T0 = now();
  const { lat, lon } = input;
  const notes: string[] = [];
  const useVertical = opts.vertical !== false;
  const useGrid = opts.grid !== false;
  const useUnc = opts.uncertainty !== false;
  const useTerrain = opts.terrain !== false;
  const useAnchor = opts.anchor !== false;
  const useTail = opts.tail === true;
  // AP16: Landbedeckung (nur mit `CubeIo.landCover` im Eingang) — κ je Zelle und die Modellzell-Box, beide voreingestellt aus.
  const lc: LandCover | null = input.z0 && isLandCover(input.z0) ? input.z0.landCover : null;
  const useKappa = opts.kappa === true;
  const useZ0Cell = opts.z0CellBox === true;
  const useZ0Model = opts.z0Model === true;
  // FL-AP5: die Lernstufe (Form K) — nur mit Option UND Tabellen im Eingang.
  const useLearned = opts.learned === true;
  const learnedT: FusionTables | null = useLearned && input.learned ? input.learned : null;
  // Phase FX-5 (E-FX-8): μ_c EINMAL je Abfrage aus dem Klimatologieprodukt am Punkt (Trend auf den Geländemerkmalen, die jede
  // Cube-Antwort im Kern trägt), je Schritt in `PredictSituation.muC` — nur mit `learned` + Tabellen mit μ_c-Spalte; ohne
  // Produkt bleiben die gelisteten Größen `absent` (heutiges Verhalten einer station-Tabelle ohne μ_c, benannt).
  const climaVarsT: string[] = learnedT ? (['t', 'td', 'u', 'v', 'gust', 'clct', 'precip'] as const).filter((v) => climaColumnsFor(learnedT.design.mean, v) === 'station') : [];
  // AX-3: die Anomalie-Interpolation braucht μ_c(T) auch ohne Lernstufe — dieselbe Schätzung, einmal je Abfrage.
  const useAnomalyInterp = opts.anomalyInterp === true && opts.hourly === true;
  const climaProd: ClimaProduct | null = input.learnedClima && ((learnedT && climaVarsT.length) || useAnomalyInterp) ? input.learnedClima : null;
  let climaEst: MuEstimate | null = null;
  /** Why a station table runs without μ_c (the absent line names it): no product, no geometry at the point, or a product without an estimate for the listed variables. */
  let climaWhy = 'kein Klimatologieprodukt im Eingang (CubeIo.climaSource aus, Datei fehlt oder ungültig)';
  {
    const h0 = input.elevationM ?? input.terrain?.elevationM ?? null, tr = input.terrain;
    if (climaProd) climaWhy = 'kein Gelände/h_true am Punkt';
    if (climaProd && tr && h0 != null && (tr.scales?.sampledCount ?? 0) > 0) {
      try {
        const lc0: LandCover | null = input.z0 && isLandCover(input.z0) ? input.z0.landCover : null;
        const names = climaProd.trend?.names ?? null;
        const feat = names ? trendVector({
          hTrueM: h0, tpi500M: tr.tpi500M, tpi2000M: tr.tpi2000M, svf: tr.svf, sinkDepthM: tr.sinkDepthM ?? null, slopeDeg: tr.slopeDeg, aspectDeg: tr.aspectDeg,
          z0True: input.z0?.z0True ?? null, lcShares: lc0?.point.p ?? null, dWaterM: lc0?.dWater?.m ?? null, dLakeM: null, impervPct: input.urban?.imperv ?? null, d0M: input.urban?.d0 ?? null, lonDeg: lon,
        }, lat, names) : null;
        climaEst = estimateCoefficients(climaProd, { lat, lon, elevM: h0, feat });
        if (climaVarsT.length && !climaVarsT.some((v) => climaEst!.mu[v as keyof MuEstimate['mu']]) && !(useAnomalyInterp && climaEst.mu.t)) { climaEst = null; climaWhy = `das Produkt (vars ${climaProd.vars.join(',')}) trägt keine Schätzung für ${climaVarsT.join(', ')}`; }
      } catch (e) { climaEst = null; climaWhy = `Schätzung gescheitert (${e instanceof Error ? e.message : String(e)})`; }
    }
  }
  const climaHow = (): string => (climaEst ? [...new Set(Object.values(climaEst.how))].join('/') : '—');
  // AX-7: das Ensemble-Mittel als Member — Zähler für die Notiz.
  const useEnsMember = opts.ensMember === true;
  const useClimaTrend = opts.climaTrend === true;
  const ensMemberCount = { applied: 0, t: 0, wind: 0, precip: 0, noSigma: 0, noPlanes: 0 };
  // AX-3: μ_c(T) zur Gültigzeit für die Anomalie-Interpolation (null ohne Produkt/Schätzung für T).
  const anomalyMuT: ((ms: number) => number | null) | null = useAnomalyInterp && climaEst?.mu.t ? (ms) => { const m = muAt(climaEst!, ms, lon).t; return m != null && Number.isFinite(m) ? m : null; } : null;
  const anomalyCount = { applied: 0, capped: 0, noMu: 0, sumAbs: 0, maxAbs: 0 };
  const learnedCount = { applied: 0, absent: 0, vars: {} as Record<string, number> };
  // FL-AP8c: Speed-EMOS (V-FL-22) und gelernte Hürde (V-FL-18) — je eigene Option, nur mit `learned` und Tabellen.
  const useLearnedSpeed = useLearned && opts.learnedSpeed === true;
  const useLearnedPrecip = useLearned && opts.learnedPrecip === true;
  const learnedPost = { speed: 0, speedNoLaw: 0, precip: 0, precipKept: 0, precipAbsent: 0 };
  // Phase FS (`audit/fusion-stationswert.md`): vier Optionen, jede voreingestellt aus — ohne sie byte-gleich.
  // AX-2 (E-FV-3): die Route der Lernstufe je Stufe; ohne Option Route 1 wie bisher (byte-gleich).
  const learnedRouteOpt = useLearned ? (opts.learnedRoute ?? 1) : 1;
  // `'tier'`: t2/t3 lesen Route 3, wo die Tabellen für den Bin ein geschriebenes Stratum tragen (Fit 5e: Bins 3–5), sonst
  // Route 1 — ein t2-Schritt mit Vorlauf ≤ 48 h (Laufalter) bliebe sonst ohne Lernstufe (Loch in der Kurve).
  const routeHasStrata = (bin: number, cls: string): boolean => !!learnedT && Object.values(learnedT.mean).some((e) => e.form === 'K' && e.bin === bin && e.cls === cls && e.status === 'written');
  const learnedRouteOf = (tier: TierId, bin: number): number => (learnedRouteOpt === 'tier' ? (tier !== 't1' && routeHasStrata(bin, 'r3') ? 3 : 1) : learnedRouteOpt);
  const routeCount: Record<string, number> = {};
  const useAtPoint = useLearned && opts.learnedAtPoint === true;
  const noPriorShrink = opts.priorShrink === false;
  // E-AX-11: wind/gust keep the climatological step; the wind anchor is damped over the distance of the measurement
  const keepWindShrink = noPriorShrink && opts.priorShrinkWind === true;
  const anchorWindL = opts.anchorWindKm != null && Number.isFinite(opts.anchorWindKm) && opts.anchorWindKm > 0 ? opts.anchorWindKm * 1000 : null;
  const useLearnedClouds = useLearned && opts.learnedClouds === true;
  const stackErrors = opts.stationValue === true && input.stack ? validateStackTable(input.stack) : [];
  const stackT: StackTable | null = opts.stationValue === true && input.stack && !stackErrors.length ? input.stack : null;
  const fsCount = { atPoint: 0, clouds: 0, stationValue: 0, byForm: {} as Record<string, number>, byCountry: {} as Record<string, number> };
  // FL-AP8b (V-FL-20): die gemessene Persistenzkurve des Ankers je Größe aus denselben Tabellen — nur mit Option UND
  // gültiger Kurve (`anchorCurveValid`); je Größe ohne Kurve gilt die Setzung e^(−τ/τ_v). Ohne `anchor`-Block in den
  // Tabellen: exakt der bisherige Pfad (byte-gleich). Td hat im Cube-Pfad keinen Anker (keine Feuchte-Innovation).
  type AnchorVar = 't' | 'u' | 'v' | 'gust';
  const anchorCurveOf = (av: AnchorVar): AnchorCurvePoint[] | null => { const c = learnedT?.anchor?.[av]?.curve; return anchorCurveValid(c) ? c : null; };
  const anchorCurves: Record<AnchorVar, AnchorCurvePoint[] | null> = { t: anchorCurveOf('t'), u: anchorCurveOf('u'), v: anchorCurveOf('v'), gust: anchorCurveOf('gust') };
  const anchorCurveOn = (['t', 'u', 'v', 'gust'] as const).some((av) => anchorCurves[av] != null);
  const anchorFallback = (['t', 'u', 'v', 'gust'] as const).filter((av) => anchorCurves[av] == null);
  const anchorTermOf = (inn: Innovation | null, av: AnchorVar, leadH: number, tauH: number): number => {
    const c = anchorCurves[av];
    return c ? anchorTermLearned(inn, leadH, c) : anchorTerm(inn, leadH, tauH);
  };
  if (useAnchor && learnedT?.anchor && !anchorCurveOn) notes.push('anchor: Tabellen tragen einen anchor-Block, aber keine gültige Persistenzkurve für T/u/v/Böe (48 Einträge, Gewichte endlich oder null) ⇒ Setzung e^(−τ/τ_v) für alle Größen (V-FL-20)');
  // AP13: gemessene Kalibrierung (nur `measured` mit Beleg). Ohne sie: dieselben Setzungen, dieselben Texte (Negativkontrolle).
  const cal = opts.calib ?? null;
  const calT = cal ? { ...(cal.A != null ? { A: cal.A } : {}), ...(cal.Auhi != null ? { Auhi: cal.Auhi } : {}), ...(cal.tpiSigmaM != null ? { tpiSigmaM: cal.tpiSigmaM } : {}) } : {};
  const tc = { A: null, Auhi: null, tpiSigmaM: null, z0Mod: null, z0True: null, ...calT, ...(opts.terrainCalib ?? {}) };
  const fromCal = (k: 'A' | 'Auhi' | 'tpiSigmaM'): boolean => cal?.[k] != null && opts.terrainCalib?.[k] === undefined;
  const zBlendM = cal?.zBlendM ?? TERRAIN_SET.zBlendM;
  const fRadP = cal?.fRad ? { a: cal.fRad.a ?? TERRAIN_SET.a, vRefMs: cal.fRad.vRefMs ?? TERRAIN_SET.vRefMs, epsilon: cal.fRad.epsilon ?? TERRAIN_SET.epsilon } : null;
  const metaOf = (...paths: string[]) => calibMetaText(paths.map((q) => cal?.meta[q]).find((m) => m));
  const fmtM = (x: number | undefined) => (x == null ? '—' : `${Math.round(x)} m`);
  // V-FI-17: z0 aus WorldCover, wenn der Aufrufer es mitbringt und `terrainCalib` keine Rauhigkeit von außen setzt.
  const z0In = input.z0 && input.z0.z0True != null && opts.terrainCalib?.z0True === undefined && opts.terrainCalib?.z0Mod === undefined ? input.z0 : null;
  const fmtZ0 = (x: number | null | undefined) => (x == null ? '—' : x >= 0.1 ? x.toFixed(2) : x.toPrecision(2));
  // AP17: z0 des Modells aus dem GRIB — nur mit Option, z0 am Punkt und dem Produkt im Eingang; je Stufe an der nächsten Zelle.
  const zmOn = useZ0Model && !!z0In && !!input.z0mod;
  const z0mByTier: Partial<Record<TierId, Z0ModelMix | null>> = {};
  if (zmOn) {
    for (const t of ['t1', 't2', 't3'] as const) {
      const se = input.cube[t];
      z0mByTier[t] = se ? z0ModelMix(input.z0mod![t], se.sources, se.cell.lat, se.cell.lon, z0In!.z0Mod[t] ?? null) : null;
    }
  }
  const z0mText = (t: TierId): string => {
    const m = z0mByTier[t];
    if (!m) return `${t} WorldCover-Näherung (kein GRIB-z0 an der Zelle)`;
    const col = input.z0mod![t]!.byColumn;
    return `${t} ${m.grib.map((id) => `${id} ${fmtZ0(Math.exp(col[id] as number))}`).join(' · ')} m (GRIB)${m.approx.length ? `, ${m.approx.join(' · ')} mit der Näherung` : ''} ⇒ ${fmtZ0(Math.exp(m.lnZ0))} m`;
  };
  const calib: string[] = [
    ...(input.elevationFrom === 'station' ? [`hTrue:station — Punkt ≤ ${Math.round(SELECTION.stationAtPointKm * 1000)} m an einer Katalogstation: ihre Höhe (${input.elevationM} m) gilt als h_true statt der DEM-Höhe${input.terrain?.elevationM != null ? ` (${Math.round(input.terrain.elevationM)} m)` : ''} (E-F-12, Jan 17.09.; am Gipfel liegt das DEM-Pixel bis 270 m tiefer)`] : []),
    ...(useLearned ? [learnedT
      ? `learned:hindcast — Form K aus ${learnedT.fitVersion} (${learnedT.period ? `${learnedT.period.from}…${learnedT.period.to}` : 'Zeitraum unbekannt'}, ${Object.values(learnedT.mean).filter((e) => e.status === 'written').length} Strata): Mittel und σ des Cube-Members für T, Td, Wind, Böe, Bewölkung aus den gelernten Tabellen (E-FL-1, Provenienz hindcast, nie measured); Niederschlag nicht (Stufe 1)`
      : 'learned:absent — Option an, aber keine Tabellen im Eingang (CubeIo.learnedSource aus, Datei fehlt oder ungültig) ⇒ Rechnung ohne Lernstufe'] : []),
    ...(learnedT && climaVarsT.length ? [climaEst
      ? `learnedClima:hindcast — μ_c-Spalte für ${climaVarsT.join(', ')} aus dem Klimatologieprodukt (${climaProd?.candidate ?? climaProd?.estimator.kind} · Trend ${climaProd?.trend?.names.length ?? 0} Merkmale · Weg ${climaHow()} · nächste Station ${climaEst.nearestKm == null ? '—' : climaEst.nearestKm.toFixed(1) + ' km'}; ${climaProd?.source.points ?? '?'} Stationen, Lizenzen ${climaProd?.licence.length ?? 0}) — geschätzt am Punkt, nie measured (E-FX-8, §6.5)`
      : `learnedClima:absent — die Tabellen erklären die μ_c-Spalte für ${climaVarsT.join(', ')}, aber ${climaWhy} ⇒ diese Größen ohne Lernstufe`] : []),
    ...(useLearnedSpeed && learnedT ? [`learnedSpeed:hindcast — Windgeschwindigkeit als gestutzte Normal TN(a + b·E_Rice, c·sd_Rice) bei 0 aus tables.speed (${Object.values(learnedT.speed ?? {}).filter((e) => e.status === 'written').length} Strata, ${learnedT.fitVersion}) statt der Rice des u/v-Modells; Richtung weiter aus u/v; je Stratum ohne Gesetz bleibt die Rice (V-FL-22, FL-AP8c)`] : []),
    ...(useLearnedPrecip && learnedT ? [`learnedPrecip:hindcast — Niederschlag aus der gelernten Hürde (Auftritt mit Spalte logit(1 − pDry_Cube) am Motor-Wert der Stunde, Menge ln(y | nass); ${Object.values(learnedT.occurrence ?? {}).filter((e) => e.status === 'written').length} Strata mit CV-Gewinn, ${learnedT.fitVersion}) statt K-2, nur wo kein Radar- und kein Stationsmember Niederschlag trägt (V-FL-18, FL-AP8c)`] : []),
    'footprint:set — FOOTPRINT_M cube-t1/t2/t3 = Zellweite der Stufe (5/10/25 km), gesetzt, bis AP10 die Repräsentativität misst',
    'lead:set — Vorlauf der Skill-Kurven = Stunde ab jetzt, nicht ab dem Quell-Lauf (wie Live-Pfad; V-FI-10)',
    ...(useVertical ? [
      'phi:set — PAP 4 φ linear (Startform), Stützstellen erst aus AP10 (calib.phi.knots)',
      `dzSurface:set — Inversion gilt als aufsitzend, wenn z_base ≤ h_mod_eff + ${DZ_SURFACE_M} m (unterste Modellfläche 10–20 m über Grund)`,
      `standardLapse:literature — ${STANDARD_LAPSE_PER_M * 1000} K/km (ICAO) als Rückfall ohne Profil (t2/t3) und als Lapse des Motors`,
    ] : []),
    ...(useGrid ? [
      cal?.LdM
        ? `Ld:${metaOf('Ld')} — PAP 3 L_d je Stufe t1 ${fmtM(cal.LdM.t1)} · t2 ${fmtM(cal.LdM.t2)} · t3 ${fmtM(cal.LdM.t3)} (fehlende Stufe: Zellweite, set)`
        : 'Ld:set — PAP 3 L_d = Zellweite der Stufe (5,5/11/28 km N–S), gesetzt; AP10 kalibriert',
      cal?.LhM != null
        ? `Lh:${metaOf('Lh')} — PAP 3 L_h = ${Math.round(cal.LhM)} m`
        : `Lh:set — PAP 3 L_h = ${GRID_SET.lhM} m (Präzedenz spatialWeight H_REF), gesetzt; AP10 kalibriert`,
      !useKappa ? 'kappa:set — PAP 3 κ = 1: keine Landnutzungs-Ähnlichkeit je Zelle im Repo (nur am Punkt)'
        : lc ? `kappa:set — PAP 3 κ je Zelle (AP16, E-F-16): κ = exp(−δ/λ), δ = ½·Σ|p − q| über 6 Gruppen (Wasser · Stadt · Wald · Offen · Kahl · Schnee), p im Punktkreis ${Z0_POINT_RADIUS_M} m, q in der Box um die Zellmitte (WorldCover); λ = ${LANDCOVER_SET.lambda} (set); t3 κ = 1; unter ${Math.round(LANDCOVER_SET.minCoverage * 100)} % bekannter Pixel (Punktkreis oder Blockzelle) oder Blockzelle außerhalb des 3×3 ⇒ κ = 1 für den Block`
        : 'kappa:set — PAP 3 κ = 1: Option kappa an, aber keine Landbedeckung im Eingang (CubeIo.landCover aus oder nicht rechtzeitig)',
    ] : []),
    ...(useUnc ? [
      cal?.cSpread
        ? `cSpread:${metaOf('cSpread')} — PAP 6 c(p,f) je Größe und Vorlauf-Bin gemessen; Bins ohne Wert: c = ${C_SPREAD} (set)`
        : `cSpread:set — PAP 6 c(p,f) = ${C_SPREAD} (σ = c·σ_ens), bis AP10 ihn misst`,
      ...(cal?.sigmaSys ? [`sigmaSys:${metaOf('sigmaSys')} — PAP 6 σ_sys des Cube-Members je Größe und Vorlauf-Bin gemessen (ersetzt Boden und Skill-Prior); Bins ohne Wert: Setzung wie unten`] : []),
      `sigmaSys:set — Boden aus V-A₁ (T ${SIGMA_SYS_FLOOR_A1.temperature} K · Td ${SIGMA_SYS_FLOOR_A1.dewpoint} · Wind ${SIGMA_SYS_FLOOR_A1.wind} m/s · Böe ${SIGMA_SYS_FLOOR_A1.gust}), darüber der Skill-Prior σ_c·√(1−ρ²) des Motors; Bewölkung nur Prior; AP10 misst σ_sys(v, τ)`,
      'sigmaQuant:physical — Δ²/12 aus der Ebenenskala (PAP 6)',
      'sigmaVert:set — Restfehler der Höhenkorrektur 0,0035 K/m·|Δh| (REP.lapseResidualPerM), Fall C |ΔT_C|, Fall B dT_inv/4',
      ...(cal?.confDiscount ? [`confidence:${metaOf('confDiscount')} — gemessene Abschläge: ${Object.entries(cal.confDiscount).map(([k, x]) => `${k} ${x}`).join(' · ')}; die übrigen wie unten (set)`] : []),
      `confidence:set — Score = spread·agree·lage; Abschläge Fall C ${CONF_DISCOUNT.caseC} · Fall B ${CONF_DISCOUNT.caseB} · |Δh| > 300 m ${CONF_DISCOUNT.dhOver300} · Chunk-Rand ${CONF_DISCOUNT.chunkBorder} · Interpolation ${CONF_DISCOUNT.interpolated} · Modell statt Nowcast ${CONF_DISCOUNT.nowcastFallback}; Einigkeit misst σ_div gegen die PAP-6-σ auch unter einer gelernten σ (V-KF-1); Bewölkung als Zwei-Atome-Mischung: Schärfe = größte Atommasse statt σ (V-KF-2); kein Wahrscheinlichkeitsmaß — Score-Dezile gegen CRPS am Archiv in audit/fusion-konfidenz/monotonie.md`,
      'precipSigma:set — Niederschlag bleibt beim Motor (K-2); precip_sd wird nicht als σ verwendet',
      'meltOffset:null — Schneefallgrenze ist der Zellwert, kein Schmelzversatz (calib.meltOffset unbekannt)',
      'stationSigma:set — das MOSMIX-Member (Stationsprodukt, eine Quelle) bekommt dieselbe PAP-6-σ (sys-only: V-A₁-Boden, darüber Skill-Prior) statt des Motor-Priors ρ₀ = 0,985, den V-A₁ als zu hoch gemessen hat (§11 (2))',
    ] : []),
    ...(useTerrain ? [
      fromCal('A')
        ? `A:${metaOf('A')} — PAP 5 Kaltluftsee-Amplitude ${tc.A} K (Wert „default"; regionale Werte folgen)`
        : `A:${tc.A == null ? 'null' : 'set'} — PAP 5 Kaltluftsee-Amplitude ${tc.A == null ? 'unbekannt (wird an Stationen gelernt, AP10) ⇒ ΔT_cap inaktiv, Geometrie benannt' : `${tc.A} K von außen`}`,
      fromCal('Auhi')
        ? `Auhi:${metaOf('Auhi')} — PAP 5 Wärmeinsel-Amplitude ${tc.Auhi} K (Wert „default")`
        : `Auhi:${tc.Auhi == null ? 'null' : 'set'} — PAP 5 Wärmeinsel-Amplitude ${tc.Auhi == null ? 'unbekannt ⇒ ΔT_uhi inaktiv, Geometrie benannt' : `${tc.Auhi} K von außen`}`,
      fRadP
        ? `fRad:${metaOf('fRad.a', 'fRad.vRef', 'fRad.epsilon')} — a = ${fRadP.a}, v_ref = ${fRadP.vRefMs} m/s, ε = ${fRadP.epsilon.toFixed(3)} (nicht gemessene Teile: Setzung)`
        : `fRad:set — a = ${TERRAIN_SET.a}, v_ref = ${TERRAIN_SET.vRefMs} m/s, ε = ${TERRAIN_SET.epsilon.toFixed(3)}: f_rad an den bestehenden Produkt-Gates (65 % Bedeckung, 2,5 m/s) ist genau ε`,
      'fSaison:set — Jahresgang der Nachtlänge am Ort, 0 (kürzeste Nacht) … 1 (längste), E-F-4',
      fromCal('tpiSigmaM') ? `tpiSigma:${metaOf('tpiSigma')} — regionale TPI-Streuung ${tc.tpiSigmaM} m (Wert „default")` :
      `tpiSigma:${tc.tpiSigmaM == null ? 'null' : 'set'} — regionale TPI-Streuung für das Gate „TPI < −1σ" ${tc.tpiSigmaM == null ? 'unbekannt ⇒ Muldengate nicht entscheidbar' : `${tc.tpiSigmaM} m von außen`}`,
      z0In
        ? `z0:set — zweistufige Windkorrektur aktiv (V-FI-17): z0 am Punkt = log-Mittel der WorldCover-Klassen im Kreis ${Z0_POINT_RADIUS_M} m = ${fmtZ0(z0In.z0True)} m (${z0In.shares.slice(0, 3).map(([c, f]) => `Klasse ${c} ${Math.round(f * 100)} %`).join(', ')}); ${useZ0Cell && lc ? `z0 des Modells t1/t2 = ln-Mittel der Blockzellen (Box um die Zellmitte) mit den PAP-3-Gewichten (AP16, V-FI-65), t3 = Box um den Punkt (${fmtZ0(z0In.z0Mod.t3)} m),` : `z0 des Modells je Stufe = log-Mittel über die Zellweite (t1 ${fmtZ0(z0In.z0Mod.t1)} · t2 ${fmtZ0(z0In.z0Mod.t2)} · t3 ${fmtZ0(z0In.z0Mod.t3)} m)`} ${zmOn ? 'als Näherung nur für die Windquellen ohne z0 (IFS, AIFS, AICON, C-LAEF) — sonst gilt das GRIB-z0 (Zeile z0Mod, AP17);' : 'als Näherung — das GRIB-z0 der Modelle trägt der Cube nicht (V-FI-58), ohne Orographie-Anteil;'} Klassen-z0 Davenport/Wieringa (literature); d0 am Punkt aus urban ${input.urban?.d0 != null ? `(${input.urban.d0} m)` : '(fehlt ⇒ 0)'}, d0 des Modells 0; z_b = ${zBlendM} m (${cal?.zBlendM != null ? 'measured' : 'set'}); Quelle ${z0In.source}`
        : `z0:${tc.z0True == null || tc.z0Mod == null ? 'null' : 'set'} — Rauhigkeit am Punkt (WorldCover) und im Modell ${tc.z0True == null || tc.z0Mod == null ? 'nicht im Bündel (V-FI-17) ⇒ zweistufige Windkorrektur inaktiv' : 'von außen'}; z_b = ${zBlendM} m (${cal?.zBlendM != null ? 'measured' : 'set'})`,
      ...(zmOn ? [`z0Mod:model — z0 des Modells je Stufe aus dem GRIB (point/static/z0mod, Schritt 000 des Laufs der Quelle; AP17, E-F-15): ln-Mittel über die Windquellen des Laufs, die die nächste Zelle decken — ${(['t1', 't2', 't3'] as const).filter((t) => input.cube[t]).map(z0mText).join('; ')}; kein Orographie-Anteil (gemessen); welche Quelle welchen Schritt trägt, steht nicht im Manifest ⇒ über den Lauf gemittelt (benannt)${useZ0Cell && lc ? '; die Näherung der Quellen ohne z0 folgt je Schritt den Blockzellen (z0CellBox)' : ''}`] : []),
      ...(cal?.zBlendM != null ? [`zBlend:${metaOf('zBlend')} — Blending-Höhe z_b = ${Math.round(cal.zBlendM)} m`] : []),
    ] : []),
    ...(lc ? [`dWater:set — Abstand zum nächsten Gewässer (WorldCover Klasse 80, Körper ≥ ${LANDCOVER_SET.minBodyPx} px in 8er-Nachbarschaft, Spiegel ≈ 37 m: Flüsse < ~40 m fehlen, V-FI-75), gesucht bis r_c ≤ ${LANDCOVER_SET.maxM / 1000} km; ohne Treffer zensiert (aboveM), nie ein Platzhalter; nur Ausgabe, kein Rechenterm (E-F-17)`] : []),
    ...(useAnchor ? [anchorCurveOn && learnedT
      ? `anchor:hindcast — Persistenzkurve der Form-K-Residuen aus ${learnedT.fitVersion} (V-FL-20, FL-AP8b): Zuschlag = Versatz · Repräsentativität · w(τ) mit w = cov(e₁,e_τ)/var(e₁) je Vorlauf 1…48 h statt e^(−τ/τ_v); τ_1/e gemessen T ${learnedT.anchor?.t?.tauH ?? '—'} h · u ${learnedT.anchor?.u?.tauH ?? '—'} h · v ${learnedT.anchor?.v?.tauH ?? '—'} h · Böe ${learnedT.anchor?.gust?.tauH ?? '—'} h (Setzung ${ANCHOR_TAU_H.temperature} / ${ANCHOR_TAU_H.wind} / ${ANCHOR_TAU_H.wind} / ${ANCHOR_TAU_H.gust} h); τ ≤ 1 h ⇒ 1, jenseits 48 h ⇒ 0 (Datenlage, nicht Persistenz — offen), negative Gewichte bleiben (Gegenphase des Tagesgangs); Td ohne Anker im Cube-Pfad (Kurve ungenutzt)${anchorFallback.length ? `; Setzung e^(−τ/τ_v) für ${anchorFallback.map((av) => (av === 't' ? 'T' : av === 'gust' ? 'Böe' : av)).join(', ')} (keine gültige Kurve in den Tabellen)` : ''}; Deckel ${ANCHOR_MAX.temperature} K; Messung mit Frist geholt, nie blockierend`
      : `anchor:set — Innovations-Persistenz (anchor.ts, V-PV-19): Versatz Messung − Cube am Messzeitpunkt, τ_T ${ANCHOR_TAU_H.temperature} h / τ_Wind ${ANCHOR_TAU_H.wind} h, Deckel ${ANCHOR_MAX.temperature} K; Messung mit Frist geholt, nie blockierend`,
    ...(input.obs?.some((o) => o.source === 'inca') ? [`incaAnchor:set — die INCA-Analyse (GeoSphere, 1 km, stündlich) am Punkt als Anker-Messung mit Gewicht ${INCA_ANCHOR_WEIGHT} auf die Repräsentativität (set; Analysefehler abseits der Stationen ≈ 1 K); Abstand 0, Höhe = Punkt; T, Wind — keine Böe (AX-10, Bericht #14)`] : []),
    ] : []),
    ...(useAtPoint && learnedT ? ['learnedAtPoint:set — das gelernte Mittel gilt am Punkt: das Member wird so vorkompensiert, dass die Höhenkorrektur (T, Td) und der Geländefaktor (Wind, Böe) des Motors genau das gelernte Mittel plus Anker ergeben (V-FS-2)'] : []),
    ...(useEnsMember ? [`ensMember:set — das IFS-ENS-Mittel (Schema-6-Ebenen _ens, t3) als eigenes Member für T, Wind, Niederschlag; σ = ${ENS_MEMBER_SIGMA_FACTOR}·σ_ens mit Boden ${ENS_MEMBER_SIGMA_FLOOR.temperature} K / ${ENS_MEMBER_SIGMA_FLOOR.wind} m/s (set, unkalibriert — c(p,f) fehlt); roh gemessen bei 126–336 h gegen den Kontrolllauf T +14/+23 %, Wind +13/+16 % (AX-7, E-AX-6)`] : []),
    ...(useClimaTrend ? [`climaTrend:set — Klimatologie-Prior um ${CLIMA_TREND_K_PER_YEAR} K/Jahr ab der Mitte der Referenzperiode (Gitter ${CLIMA_GRID_PERIOD_CENTRE}, Stationsfeld aus meta.years) verschoben — die Perioden liegen hinter der Erwärmung (AX-9 §6c.3: beide ≈ 1,2 K zu kalt an 14 762 Punkt-Monaten 2023–2026); nur das Tagesmittel T`] : []),
    ...(input.climaGrid ? [`climaGrid:set — Tagesmittel des Temperatur-Priors aus dem Klimagitter 1991–2020 (point/static/clima-grid, Stufe-1-Zelle), Lapse ${CLIMA_GRID_LAPSE_PER_M} K/m auf die Punkthöhe gegen elev_src; Tagesgang/σ_c/Nasstag Stationsfeld (AX-9)`] : []),
    ...(learnedT && learnedRouteOpt !== 1 ? [learnedRouteOpt === 'tier'
      ? 'learnedRoute:tier — Strata der Lernstufe je Stufe: t1 Route 1 (Lauf-Route), t2/t3 Route 3 (dyn, ganzjährig, 289 Tage) statt Route 1 mit 87–95 Sommertagen (E-FV-3, V-FV-1; AX-2)'
      : `learnedRoute:${learnedRouteOpt} — Strata der Lernstufe aus Route ${learnedRouteOpt} in jeder Stufe (AX-2)`] : []),
    ...(noPriorShrink ? ['priorShrink:off — kein Klimatologie-Schritt für Kombinationen aus Membern mit expliziter σ (Lernstufe, PAP 6, Stationsmember sind kalibrierte Vorhersagen); Niederschlag behält ihn (K-2); jenseits der Daten trägt weiter allein die Klimatologie (Phase FS, D2)'] : []),
    ...(keepWindShrink ? ['priorShrinkWind:set — Wind und Böe behalten den Klimatologie-Schritt trotz priorShrink:off (E-AX-11, V-AX-13): am Punkt ohne Station verlor der Wind ohne den Schritt gegen die Kette von 5e; T, Td und Bewölkung bleiben ohne Schritt'] : []),
    ...(anchorWindL != null ? [`anchorWind:set — der Anker für u, v und Böe ist über die Distanz der Messung mit e^(−(d/${opts.anchorWindKm} km)²) gedämpft (E-AX-11): eine 10–30 km entfernte Messung trägt beim Wind eine fremde Exposition; T behält das Gewicht von spatialWeight`] : []),
    ...(useLearnedClouds && learnedT ? ['learnedClouds:hindcast — die Bewölkungsverteilung der Lernstufe wird durchgereicht statt nachfusioniert (Phase FS, H14)'] : []),
    ...(opts.stationValue === true ? [stackT
      ? `stationValue:archive — Stationswert M + b + w·I + c·(L − M) aus ${stackT.fitVersion} (${stackT.period.from}…${stackT.period.to}, ${stackT.period.issueDays} Ausgabetage, ${stackT.rows} Zeilen; Provenienz archive, nie measured) für T, Td, Windgeschwindigkeit, Böe — nur mit einer Station am Punkt (≤ ${stackT.range.maxKm} km, |Δh| ≤ ${stackT.range.maxDElevM} m); I aus der jüngsten Messung einer Station am Punkt; Richtung, Feuchte und Phase bleiben aus der Kombination`
      : `stationValue:absent — Option an, aber ${input.stack ? `die Tabelle ist ungültig (${stackErrors.slice(0, 2).join('; ')})` : 'keine Tabelle im Eingang'} ⇒ Rechnung ohne Stationswert`] : []),
    `nowcastStale:set — Radar-Slot älter als ${NOWCAST_STALE_MIN} min gilt als veraltet; fehlt das Radar in 0–${NOWCAST_HORIZON_H} h, trägt das Modell (Flag nowcastFallbackModel)`,
    ...(useTail ? ['tail:set — jenseits des letzten nativen Schritts trägt allein die Klimatologie (6-h-Schritte, climatologyOnly); keine Extrapolation der Modelle'] : []),
    ...(opts.hourly ? [useAnomalyInterp
      ? (anomalyMuT
        ? 'interpolation:anomaly — Stunden ohne nativen Schritt: Station, wenn sie den Punkt vertritt; sonst Interpolation der Quantile der Nachbarschritte, markiert — T als Anomalie gegen den klimatologischen Tagesgang μ_c des Punkts (AX-3: Orakel 6-h-Schritte MAE 1,12 → 0,95 K, 3-h −4 %; Provenienz hindcast), Td auf T gekappt; übrige Größen linear; Nähte werden nie geglättet (R7)'
        : `interpolation:set — Anomalie-Interpolation angefragt, aber kein μ_c(T) am Punkt (${climaWhy}) ⇒ lineare Interpolation der Quantile der Nachbarschritte wie bisher, markiert; Nähte werden nie geglättet (R7)`)
      : 'interpolation:set — Stunden ohne nativen Schritt: Station, wenn sie den Punkt vertritt; sonst lineare Interpolation der Quantile (p10/p50/p90/Mittel) der Nachbarschritte, markiert; Nähte werden nie geglättet (R7)'] : []),
  ];
  const hTrue = input.elevationM ?? input.terrain?.elevationM ?? null;
  const scales: TerrainScales | null = input.terrain?.scales ?? null;
  const geometryOk = hTrue != null && !!scales && scales.sampledCount > 0;
  if (!geometryOk) notes.push('kein Gelände (Höhe oder Ringgeometrie fehlt) — keine Verteilungen, nur Zellwerte (Regel wie attach.ts: kein DEM ⇒ null)');
  const clima = input.clima;
  if (!clima) notes.push('keine Klimatologie — keine Verteilungen (K-3: der Rückfall auf Konstanten wäre eine erfundene Zahl)');

  // ── Achse ────────────────────────────────────────────────────────────────
  const axis = nativeAxis(input);
  const t0Ms = Math.floor(input.nowMs / H) * H;
  const perTier: Record<TierId, number> = { t1: 0, t2: 0, t3: 0 };
  const seams: number[] = [];
  for (let i = 0; i < axis.length; i++) {
    perTier[axis[i].tier] += 1;
    if (i > 0 && axis[i].tier !== axis[i - 1].tier) seams.push(axis[i].validAtMs);
  }

  // ── Klimatologie je Tag (Cache) und je Zeit (Tagesgang) — wie attach.ts ──
  const climaByDoy = new Map<number, ClimaSample>();
  // AX-9: das Klimagitter (Normale 1991–2020 der Stufe-1-Zelle) ersetzt das Tagesmittel der Temperatur des Stationsfelds —
  // auf die Punkthöhe gebracht mit dem Lapse gegen die Bezugshöhe der Quellzellen (`elev_src`). Tagesgang, σ_c und die
  // Nasstag-Wahrscheinlichkeit bleiben vom Stationsfeld (die Gitter tragen Mittel, keine Streuung). Nur mit Produkt im Eingang.
  const cgCol = input.climaGrid?.byColumn ?? null;
  const cgElev = cgCol?.elev_src ?? null;
  let cgUsed = 0;
  let trendUsed = 0;
  let cgFirst: { doy: number; dh: number; dT: number; g: number; s: number } | null = null;
  const climaAt = (ms: number): ClimaRef | null => {
    if (!clima || hTrue == null) return null;
    const doy = doyOf(ms);
    let cs = climaByDoy.get(doy);
    if (!cs) { cs = clima.sample(lat, lon, doy, hTrue); climaByDoy.set(doy, cs); }
    if (!Number.isFinite(cs.tempMean)) return null;
    let dayMean = cs.tempMean;
    let fromGrid = false;
    if (cgCol && cgElev != null) {
      const g = climaGridMonthlyAt(cgCol, 't_mean', doy);
      if (g != null) {
        const dh = hTrue - cgElev;
        dayMean = g - CLIMA_GRID_LAPSE_PER_M * dh;
        fromGrid = true;
        cgUsed++;
        if (!cgFirst) cgFirst = { doy, dh, dT: -CLIMA_GRID_LAPSE_PER_M * dh, g, s: cs.tempMean };
      }
    }
    if (useClimaTrend) {
      // Versatz ab der Mitte der Referenzperiode des Kandidaten, der das Tagesmittel trägt (Gitter 1991–2020 ⇒ 2006,0;
      // Stationsfeld aus `meta.years`, 1995–2024 ⇒ 2010,0). Nur das Tagesmittel — Tagesgang und σ_c bleiben.
      const centre = fromGrid ? CLIMA_GRID_PERIOD_CENTRE : (clima.meta.years[0] + clima.meta.years[1] + 1) / 2;
      dayMean += CLIMA_TREND_K_PER_YEAR * (yearFracOf(ms) - centre);
      trendUsed++;
    }
    const d = new Date(ms);
    const localHour = d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15;   // Sonnenzeit-Näherung
    return {
      tempMeanC: hourlyClimaTemp(dayMean, cs.diurnalAmp, ((localHour % 24) + 24) % 24),
      tempSigmaC: cs.tempStd,
      wetProbDaily: cs.wetProb,
    };
  };

  // ── Station: Schritt je Gültigzeit ───────────────────────────────────────
  const stationAt = new Map<number, Record<string, number | null>>();
  if (input.station) for (const st of input.station.steps) stationAt.set(st.validAtMs, st.values);

  // ── Radar: Frames je Quelle, dem nächsten Schritt zugeordnet ────────────
  const tol = opts.nowcastToleranceMs ?? SAME_TIME_MS;
  const skyView = input.terrain?.svf ?? (scales ? skyViewFactor(scales) : 1);
  const sinkDepthM = input.terrain?.sinkDepthM ?? 0;

  // ── Gemeinsames: Kontext und Motor-Aufruf für jeden Schritt ──────────────
  const sigmaClimaFor = (v: UncVar, atMs: number): number => {
    const climaRef = geometryOk ? climaAt(atMs) : null;
    return v === 'temperature' ? (climaRef?.tempSigmaC ?? sigmaClimaFallback(v))
      : v === 'wind' && scales && hTrue != null ? windSigmaAt(hTrue, tpiAt(scales, 4_000))
      : sigmaClimaFallback(v);
  };
  type Weights = NonNullable<CubeStep['weights']>;
  const fuseAt = (samples: PointSourceSample[], leadH: number, atMs: number, foehnScore: number | null, weights?: Weights): FusedPoint | null => {
    if (!(geometryOk && clima && scales)) return null;
    const solar = solarPosition(lat, lon, atMs);
    const ctx: FusionContext = {
      // AP8: Gewichte mitschreiben (Wind kommt zweimal, u und v — gemittelt).
      onWeights: weights ? (info) => {
        const prev = weights[info.variable];
        if (!prev) { weights[info.variable] = { members: info.weights.map((w) => ({ ...w })), beta: info.beta }; return; }
        for (const w of info.weights) { const m = prev.members.find((x) => x.tag === w.tag); if (m) m.w = (m.w + w.w) / 2; else prev.members.push({ ...w }); }
        prev.beta = (prev.beta + info.beta) / 2;
      } : undefined,
      elevationM: hTrue as number,
      lapseRatePerM: STANDARD_LAPSE_PER_M,   // `standardLapse` (literature) — die Lapse des Motors; PAP 4 setzt darauf auf (applyVertical)
      terrain: scales,
      skyView,
      sinkDepthM,
      terrainDeltaC: 0,                       // PAP 5: A = A_uhi = null ⇒ Terme inaktiv (AP5)
      solarElevDeg: solar.elevationDeg,
      foehnScore,
      clima: climaAt(atMs),
      climaAt,
      terrainDeltaAt: () => 0,
      ...(noPriorShrink ? { priorShrink: keepWindShrink ? { except: ['wind', 'gust'] as const } : false } : {}),
    };
    return fuseHour(samples, leadH, ctx);
  };

  // ── Phase FS: der Stationswert — Station am Punkt, Innovation der Stationsvorhersage an der jüngsten Messung ──
  const stackOn = !!(stackT && input.station && hTrue != null && stationAtPoint(stackT, input.station.station.distanceKm, input.station.station.elev - hTrue));
  const pointOfDist = (d: Dist | null | undefined): number | null => {
    if (!d) return null;
    const x = d.kind === 'normal' ? d.mu : d.kind === 'rice' || d.kind === 'truncatedNormal' ? meanOf(d) : quantileOf(d, 0.5);
    return Number.isFinite(x) ? x : null;
  };
  /** Die Stationsvorhersage einer Gültigzeit je Größe, T/Td auf die Höhe `hTo` gebracht. */
  const stationForecastAt = (atMs: number, hTo: number): Partial<Record<StackVar, number | null>> | null => {
    const sv = stationAt.get(atMs);
    if (!sv || !input.station) return null;
    const se = input.station.station.elev;
    const t = num(sv.t2m), td = num(sv.td2m), u = num(sv.u10), v = num(sv.v10);
    return { t: t != null ? sourceToPoint('t2m', t, se, hTo) : null, td: td != null ? sourceToPoint('td2m', td, se, hTo) : null, ws: u != null && v != null ? Math.hypot(u, v) : null, gust: num(sv.gust) };
  };
  let stackInn: { atMs: number; source: string; stationId?: string; name?: string; distanceKm: number; byStation: boolean; I: Partial<Record<StackVar, number | null>> } | null = null;
  if (stackOn && stackT && input.obs && hTrue != null) {
    let best: CubeObs | null = null;
    for (const o of input.obs) {
      if (o.validAtMs > input.nowMs || o.temperature == null) continue;
      if (!stationAtPoint(stackT, Math.max(0, o.distanceM) / 1000, (o.elevM ?? hTrue) - hTrue)) continue;
      // AX-1: die jüngste Messung; bei gleicher Zeit die Station des Punkts selbst (gezielt abgefragt), dann die nächste.
      if (!best || o.validAtMs > best.validAtMs || (o.validAtMs === best.validAtMs && ((!!o.byStation && !best.byStation) || (!!o.byStation === !!best.byStation && o.distanceM < best.distanceM)))) best = o;
    }
    const m0 = best ? stationForecastAt(best.validAtMs, best.elevM ?? hTrue) : null;
    if (best && m0) {
      const tdObs = best.dewPoint ?? (best.temperature != null && best.relativeHumidity != null ? dewPointC(best.temperature, best.relativeHumidity) : null);
      const wsObs = best.u != null && best.v != null ? Math.hypot(best.u, best.v) : null;
      const diff = (y: number | null | undefined, m: number | null | undefined) => (y != null && Number.isFinite(y) && m != null ? y - m : null);
      stackInn = { atMs: best.validAtMs, source: best.source, stationId: best.stationId, name: best.name, distanceKm: Math.max(0, best.distanceM) / 1000, byStation: !!best.byStation, I: { t: diff(best.temperature, m0.t), td: diff(tdObs, m0.td), ws: diff(wsObs, m0.ws), gust: diff(best.gust, m0.gust) } };
    }
  }
  type LearnedDist = ReturnType<typeof predictLearned>['dist'];
  const FUSED_OF: Record<StackVar, 'temperature' | 'dewPoint' | 'windSpeed' | 'gust'> = { t: 'temperature', td: 'dewPoint', ws: 'windSpeed', gust: 'gust' };
  const applyStationValue = (fused: FusedPoint, atMs: number, leadH: number, ld: LearnedDist | null): { fused: FusedPoint; info: NonNullable<NonNullable<CubeStep['post']>['stationValue']> } | null => {
    if (!stackOn || !stackT || hTrue == null) return null;
    const m = stationForecastAt(atMs, hTrue);
    if (!m) return null;
    const tauH = stackInn ? (atMs - stackInn.atMs) / H : null;
    const info: NonNullable<NonNullable<CubeStep['post']>['stationValue']> = {};
    let out = fused;
    for (const v of STACK_VARS) {
      const fv = out[FUSED_OF[v]];
      const M = m[v] ?? null;
      if (!fv || M == null) continue;
      const I = stackInn?.I[v] ?? null;
      const L = pointOfDist(ld?.[FUSED_OF[v]] ?? null);
      const r = stationValueOf(stackT, v, { M, I, tauH, leadH, L, country: input.country ?? null });
      if (!r) continue;
      out = { ...out, [FUSED_OF[v]]: { ...fv, dist: r.dist } };
      info[v] = { form: r.form, group: r.group, M, I: r.form === 'A' || r.form === 'AB' || r.form === 'S' ? I : null, L: r.form === 'S' || r.form === 'S0' ? L : null, value: r.value };
      fsCount.byForm[r.form] = (fsCount.byForm[r.form] ?? 0) + 1;
      if (r.country) fsCount.byCountry[r.country] = (fsCount.byCountry[r.country] ?? 0) + 1;
    }
    if (!Object.keys(info).length) return null;
    fsCount.stationValue += 1;
    return { fused: out, info };
  };
  const stationSampleAt = (atMs: number, leadH: number): PointSourceSample | null => {
    const stValues = stationAt.get(atMs);
    if (!input.station || !stValues) return null;
    const s = stationSampleOf(input.station, stValues);
    // AP6: das Stationsprodukt ist EINE Quelle ohne Streuung — PAP 6 verlangt den Sockel auch
    // für dieses Member (sys-only), statt des Motor-Priors, den V-A₁ als zu optimistisch gemessen hat.
    if (useUnc) {
      s.cloudTotal = consistentCloudTotal({ clct: s.cloudTotal, clcl: s.cloudLow, clcm: s.cloudMid, clch: s.cloudHigh });
      const esS: Record<string, number> = {};
      for (const v of UNC_VARS) esS[v] = memberSigma({ v, sample: s, leadH, sigmaClima: sigmaClimaFor(v, atMs), vertical: null }).sigma;
      s.errorSigma = esS;
    }
    return s;
  };
  const stationMember = (atMs: number, s: PointSourceSample): CubeMemberInfo => ({
    product: 'station', tag: 'mosmix', run: input.station!.run, runAtMs: input.station!.runAtMs,
    ageH: Math.round(((atMs - input.station!.runAtMs) / H) * 10) / 10,
    station: { id: input.station!.station.id, name: input.station!.station.name.trim(), distKm: input.station!.station.distanceKm, dElevM: input.station!.station.dElevM,
      ...(input.station!.source && input.station!.source !== 'mosmix_l' ? { source: input.station!.source } : {}) },
    ...(useUnc ? { sigma: s.errorSigma as Partial<Record<UncVar, number>> } : {}),
  });

  // ── AP16: Zählwerke (κ je Zelle gegen κ = 1; Modellzell-Box gegen Box um den Punkt) und z0 der Blockzellen ──
  const tierCount = () => ({ t1: 0, t2: 0, t3: 0 } as Record<TierId, number>);
  const lcCount = { kappa: tierCount(), kappaOne: tierCount(), z0Cell: tierCount(), z0Point: tierCount() };
  const z0mCount = { grib: tierCount(), approx: tierCount() };
  /** ln-Mittel der Blockzellen-z0 mit den PAP-3-Gewichten (ohne Block: die nächste Zelle); `null` ⇒ Box um den Punkt. */
  const z0CellOf = (a: AxisStep, grid: GridResult | null): number | null => {
    if (!lc || (a.tier !== 't1' && a.tier !== 't2')) return null;
    const { iy, ix } = a.series.cell;
    const parts = grid ? grid.weights.map((w) => ({ w: w.w, z0: landCoverCell(lc, a.tier, iy + w.dy, ix + w.dx)?.z0 ?? null })) : [{ w: 1, z0: landCoverCell(lc, a.tier, iy, ix)?.z0 ?? null }];
    let acc = 0, ws = 0;
    for (const p of parts) if (p.z0 != null && p.z0 > 0 && p.w > 0) { acc += p.w * Math.log(p.z0); ws += p.w; }
    return ws > 0 ? Math.exp(acc / ws) : null;
  };

  // ── Durchgang 1: je nativem Schritt das Cube-Member vorbereiten (PAP 3, PAP 4, PAP 5) ─
  interface Prep {
    a: AxisStep; leadH: number; flags: StepFlag[]; grid: GridResult | null; cubeSample: PointSourceSample;
    vertical: VerticalResult | null; spd: number | null; foehnScore: number | null; terrainRes: CubeStep['terrain'];
    /** FL-AP5: das gelernte Mittel (T, u, v, Böe) für den Anker und die gelernte σ je Größe für PAP 6; `null` ohne Lernstufe. */
    learnedMu: { t: number | null; u: number | null; v: number | null; gust: number | null } | null;
    learnedSigma: Partial<Record<UncVar, number>> | null;
    /** FL-AP8c: die Situation der Lernstufe (für die Hürde nach der Fusion) und das Geschwindigkeitsgesetz des Stratums. */
    learnedSit: PredictSituation | null;
    learnedSpeed: SpeedEntry | null;
    /** Phase FS: welche Größen des Members die Lernstufe gesetzt hat (`learnedAtPoint`) und ihre Verteilungen (`learnedClouds`, `stationValue`). */
    learnedSet: { t: boolean; td: boolean; uv: boolean; gust: boolean } | null;
    learnedDist: LearnedDist | null;
  }
  const preps: Prep[] = axis.map((a) => {
    const flags: StepFlag[] = [];
    const leadH = Math.max(0, (a.validAtMs - t0Ms) / H);
    if (seams.includes(a.validAtMs)) flags.push('seam');
    if (a.step.belowGroundHPa?.includes(925)) flags.push('belowGround925');
    if (!geometryOk) flags.push('noTerrain');
    // AP3: PAP 3 — der 2×2-Block um den Punkt, gewichtet nach Distanz und Höhendifferenz.
    const kappaCell = useKappa && lc && (a.tier === 't1' || a.tier === 't2') ? (iy: number, ix: number) => kappaAt(lc, a.tier, iy, ix) : null;
    const grid = useGrid && hTrue != null ? gridStep(a, lat, lon, hTrue, cal?.LdM?.[a.tier] ?? null, cal?.LhM ?? null, kappaCell) : null;
    if (kappaCell && grid) (grid.weights.some((w) => w.kappa !== undefined) ? lcCount.kappa : lcCount.kappaOne)[a.tier]++;
    if (grid?.truncated) flags.push('chunkBorderTruncated');
    const stepForSample: CubePointStep = grid
      ? { ...a.step, values: { ...grid.values, hModEff: grid.hModEffM ?? num(a.step.values.hModEff) } }
      : a.step;
    const cubeSample = cubeSampleOf(a.tier, stepForSample, a.series);
    // AP4: PAP 4 auf das Cube-Member, bevor es in den Motor geht (braucht h_true).
    const vertical = useVertical && hTrue != null ? applyVertical(cubeSample, hTrue, STANDARD_LAPSE_PER_M) : null;
    if (vertical) for (const f of vertical.flags) if (f !== 'gammaImplausible' && !flags.includes(f)) flags.push(f);
    if (useUnc) cubeSample.cloudTotal = consistentCloudTotal({ clct: cubeSample.cloudTotal, clcl: cubeSample.cloudLow, clcm: cubeSample.cloudMid, clch: cubeSample.cloudHigh });
    const v = a.step.values;
    const spd = v.u10 != null && v.v10 != null ? Math.hypot(v.u10, v.v10) : null;
    const dir = v.u10 != null && v.v10 != null && spd != null && spd > 0.1 ? ((Math.atan2(-v.u10, -v.v10) * 180) / Math.PI + 360) % 360 : null;
    const rh = v.t2m != null && v.td2m != null ? rhFromDewPoint(v.t2m, Math.min(v.t2m, v.td2m)) : null;
    const foehn = detectFoehn({ temperatureC: num(v.t2m), windSpeedMps: spd, windDirectionDeg: dir, relativeHumidityPct: rh, gustMps: num(v.gust), lat });
    // AP5: PAP 5 — Geometrie je Schritt; die Terme wirken nur mit Amplitude (heute null).
    let terrainRes: CubeStep['terrain'] = null;
    if (useTerrain && input.terrain) {
      const t = terrainTerms({
        clct: cubeSample.cloudTotal ?? null, windMs: spd,
        tpi500M: input.terrain.tpi500M, tpi2000M: input.terrain.tpi2000M, svf: input.terrain.svf, sinkDepthM: input.terrain.sinkDepthM,
        impervPct: input.urban?.imperv ?? null, foehnScore: foehn ? foehn.score : null, lat, atMs: a.validAtMs,
        A: tc.A, Auhi: tc.Auhi, tpiSigmaM: tc.tpiSigmaM,
        ...(fRadP ? { fRadParams: fRadP } : {}),
      });
      const z0Cell = z0In && useZ0Cell ? z0CellOf(a, grid) : null;
      if (z0In && useZ0Cell) (z0Cell != null ? lcCount.z0Cell : lcCount.z0Point)[a.tier]++;
      // AP17: mit `z0Model` das ln-Mittel über die Windquellen (GRIB oder Näherung); ohne GRIB-Quelle an der Zelle `null` ⇒ wie bisher.
      const mix = zmOn ? z0ModelMix(input.z0mod![a.tier], a.series.sources, a.series.cell.lat, a.series.cell.lon, z0Cell ?? z0In!.z0Mod[a.tier] ?? null) : null;
      if (zmOn) (mix ? z0mCount.grib : z0mCount.approx)[a.tier]++;
      const windFactor = z0In
        ? windBlendingFactor(mix ? Math.exp(mix.lnZ0) : z0Cell ?? z0In.z0Mod[a.tier] ?? null, z0In.z0True, 0, input.urban?.d0 ?? 0, zBlendM)
        : windBlendingFactor(tc.z0Mod, tc.z0True, 0, input.urban?.d0 ?? 0, zBlendM);
      if (windFactor == null) t.flags.push('windBlendingInactive');
      terrainRes = { ...t, windFactor };
      // Mit Amplitude verschiebt sich das Mittel des Cube-Members (Kaltluftsee kühlt, Wärmeinsel wärmt);
      // ohne bleibt es exakt, wie es war — die Negativkontrolle der Abnahme.
      const dT = (t.dTcapK ?? 0) + (t.dTuhiK ?? 0);
      if (dT !== 0 && cubeSample.temperature != null) cubeSample.temperature += dT;
      if (windFactor != null && windFactor !== 1) {
        if (cubeSample.u != null) cubeSample.u *= windFactor;
        if (cubeSample.v != null) cubeSample.v *= windFactor;
        if (cubeSample.gust != null) cubeSample.gust *= windFactor;
      }
    }
    // FL-AP5: die Lernstufe (Form K) — Mittel und σ des Cube-Members aus den gelernten Tabellen, nach PAP 3–5 und vor dem
    // Anker (E-FL-1). Ohne Tabellen, Gelände oder h_true: nichts, gezählt.
    let learnedMu: Prep['learnedMu'] = null, learnedSigma: Prep['learnedSigma'] = null;
    let learnedSit: Prep['learnedSit'] = null, learnedSpeedE: Prep['learnedSpeed'] = null;
    let learnedSet: Prep['learnedSet'] = null, learnedDist: Prep['learnedDist'] = null;
    if (learnedT && geometryOk && input.terrain && hTrue != null) {
      const hMod = cubeSample.hModEff ?? cubeSample.sourceElevation ?? null;
      const dhM = vertical?.dhM ?? (hMod != null ? hTrue - hMod : 0);
      const bin = binIndex(leadH), [bf, bt] = binRange(bin);
      const dTsfcK = dTsfcProxy(num(v.t2m), num(v.t850), num(v.hModEff));
      const z = buildZ({
        hTrueM: hTrue, tpi500M: input.terrain.tpi500M, tpi2000M: input.terrain.tpi2000M, svf: input.terrain.svf, sinkDepthM: input.terrain.sinkDepthM ?? null,
        slopeDeg: input.terrain.slopeDeg, aspectDeg: input.terrain.aspectDeg, z0True: z0In?.z0True ?? null, lcShares: lc?.point.p ?? null,
        dWaterM: lc?.dWater?.m ?? null, dLakeM: null, impervPct: input.urban?.imperv ?? null, d0M: input.urban?.d0 ?? null, lonDeg: lon,
      }, { dhM, z0ModTier: z0In?.z0Mod[a.tier] ?? null, foehnFactor: terrainRes?.foehnFactor ?? null, fRad: terrainRes?.fRad ?? null, dTsfcK, validAtMs: a.validAtMs, leadH, binFromH: bf, binToH: bt });
      const sd = cubeSample.sigmaDiv ?? {}, se = cubeSample.sigmaEns ?? {};
      const pr0 = cubeSample.precipitation != null ? Math.max(0, cubeSample.precipitation) : null;
      const sit: PredictSituation = {
        z, leadH, route: learnedRouteOf(a.tier, bin), srcMask: 0, srcCount: cubeSample.srcCount ?? null, dhM, dTsfcK,
        k: { t: cubeSample.temperature, td: cubeSample.dewPoint ?? null, u: cubeSample.u, v: cubeSample.v, gust: cubeSample.gust, clct: cubeSample.cloudTotal ?? null, precip: pr0 != null ? Math.log1p(pr0) : null },
        p: {},
        sigDiv: { t: sd.t2m ?? null, td: sd.td2m ?? null, u: sd.u10 ?? null, v: sd.v10 ?? null, gust: sd.gust ?? null, clct: sd.clct ?? null, precip: sd.precip ?? null },
        sigEns: { t: se.t2m ?? null, u: se.u10 ?? null, v: se.v10 ?? null, precip: se.precip ?? null },
        wetShare: pr0 != null && sd.precip != null ? Math.min(3, sd.precip / (pr0 + 0.1)) : 0,
        ...(climaEst ? { muC: muAt(climaEst, a.validAtMs, lon) } : {}),
      };
      const pr = predictLearned(learnedT, 'K', sit);
      routeCount[`${a.tier}:r${sit.route}`] = (routeCount[`${a.tier}:r${sit.route}`] ?? 0) + 1;
      learnedSit = sit; learnedSpeedE = pr.speed;
      learnedDist = pr.dist;
      const set = { t: false, td: false, uv: false, gust: false };
      let any = false;
      if (pr.mu.t != null && cubeSample.temperature != null) { cubeSample.temperature = pr.mu.t; any = true; set.t = true; }
      if (pr.mu.td != null && cubeSample.dewPoint != null) { cubeSample.dewPoint = Math.min(pr.mu.td, cubeSample.temperature ?? pr.mu.td); any = true; set.td = true; }
      if (pr.mu.u != null && pr.mu.v != null && cubeSample.u != null && cubeSample.v != null) { cubeSample.u = pr.mu.u; cubeSample.v = pr.mu.v; any = true; set.uv = true; }
      if (pr.mu.gust != null && cubeSample.gust != null) { cubeSample.gust = Math.max(0, pr.mu.gust); any = true; set.gust = true; }
      learnedSet = set;
      if (pr.mu.clct != null && cubeSample.cloudTotal != null) { cubeSample.cloudTotal = Math.min(100, Math.max(0, pr.mu.clct)); any = true; }
      learnedSigma = {};
      if (pr.sigma.t != null) learnedSigma.temperature = pr.sigma.t;
      if (pr.sigma.td != null) learnedSigma.dewpoint = pr.sigma.td;
      if (pr.sigma.u != null && pr.sigma.v != null) learnedSigma.wind = Math.sqrt(0.5 * (pr.sigma.u * pr.sigma.u + pr.sigma.v * pr.sigma.v));
      if (pr.sigma.gust != null) learnedSigma.gust = pr.sigma.gust;
      if (pr.sigma.clct != null) learnedSigma.clouds = pr.sigma.clct;
      if (any) {
        flags.push('learned'); learnedCount.applied += 1;
        for (const k of Object.keys(pr.mu)) learnedCount.vars[k] = (learnedCount.vars[k] ?? 0) + 1;
        learnedMu = { t: pr.mu.t ?? null, u: pr.mu.u ?? null, v: pr.mu.v ?? null, gust: pr.mu.gust ?? null };
      } else { learnedCount.absent += 1; learnedSigma = null; }
      for (const av of pr.absent) learnedCount.vars[`absent:${av}`] = (learnedCount.vars[`absent:${av}`] ?? 0) + 1;
    }
    return { a, leadH, flags, grid, cubeSample, vertical, spd, foehnScore: foehn ? foehn.score : null, terrainRes, learnedMu, learnedSigma, learnedSit, learnedSpeed: learnedSpeedE, learnedSet, learnedDist };
  });
  if (useLearned) {
    notes.push(learnedT
      ? `learned: Form K an ${learnedCount.applied} Schritten (${Object.entries(learnedCount.vars).filter(([k]) => !k.startsWith('absent:')).map(([k, n]) => `${k} ${n}`).join(' · ') || 'keine Größe'}), ohne Stratum ${learnedCount.absent}${Object.keys(learnedCount.vars).some((k) => k.startsWith('absent:')) ? `; ohne Tabelle: ${Object.entries(learnedCount.vars).filter(([k]) => k.startsWith('absent:')).map(([k, n]) => `${k.slice(7)} ${n}`).join(' · ')}` : ''}; Route ${learnedRouteOpt === 'tier' ? `t1 1 · t2/t3 3 an ${Object.entries(routeCount).filter(([k]) => k !== 't1:r1' && k.endsWith(':r3')).reduce((s, [, n]) => s + n, 0)} Schritten${Object.entries(routeCount).some(([k]) => k !== 't1:r1' && k.endsWith(':r1')) ? `, Route 1 an ${Object.entries(routeCount).filter(([k]) => k !== 't1:r1' && k.endsWith(':r1')).reduce((s, [, n]) => s + n, 0)} t2/t3-Schritten ohne Route-3-Stratum` : ''}` : `${learnedRouteOpt} in jeder Stufe`}; Niederschlag im Client nicht gelernt (Stufe 1)`
      : 'learned: Option an, aber keine Tabellen im Eingang (CubeIo.learnedSource aus, Datei fehlt oder ungültig) ⇒ Rechnung ohne Lernstufe');
  }
  // FL-AP8c: die Zähler werden je Schritt in `finishStep` gefüllt — die Notiz entsteht danach (s. unten).
  // AP16: wie oft die Optionen wirklich griffen — je Stufe benannt (nur mit Option, sonst keine Notiz).
  const perTierText = (hit: Record<TierId, number>, miss: Record<TierId, number>) =>
    (['t1', 't2', 't3'] as const).filter((t) => hit[t] + miss[t] > 0).map((t) => `${t} ${hit[t]}/${hit[t] + miss[t]}`).join(' · ') || 'keine Schritte';
  if (useKappa && lc) {
    notes.push(`kappa: κ je Zelle an ${perTierText(lcCount.kappa, lcCount.kappaOne)} Schritten mit Block; sonst κ = 1 (t3 immer; Punktkreis ${Math.round(lc.point.cov * 100)} % bekannt)`);
  }
  if (useZ0Model) {
    notes.push(zmOn
      ? `z0Model: z0 des Modells aus dem GRIB an ${perTierText(z0mCount.grib, z0mCount.approx)} Schritten; sonst die WorldCover-Näherung (AP17)`
      : `z0Model: Option an, aber ${!z0In ? 'kein z0 am Punkt' : 'kein z0mod im Eingang (CubeIo.z0mod aus, Produkt fehlt oder statische Produkte noch nicht da)'} ⇒ WorldCover-Näherung`);
  }
  if (useZ0Cell && z0In) {
    notes.push(lc
      ? `z0CellBox: z0 des Modells aus den Blockzellen an ${perTierText(lcCount.z0Cell, lcCount.z0Point)} Schritten; sonst Box um den Punkt (t3 immer)`
      : 'z0CellBox: Option an, aber keine Landbedeckung im Eingang (CubeIo.landCover aus oder nicht rechtzeitig) ⇒ Box um den Punkt');
  }

  // ── Durchgang 2: der Anker (AP7) — Messung − Cube-Wert am Messzeitpunkt, Innovations-Persistenz ─
  // Der Cube-Wert AM PUNKT ist der PAP-4-Wert (`vertical.t`); die Messung wird mit der Standard-Lapse
  // von der Stationshöhe auf h_true gebracht (wie im Live-Pfad). Wind und Böe roh.
  let anchorInfo: { sources: string[]; fraction: number; pairs: number; t: Innovation | null; u: Innovation | null; v: Innovation | null; gust: Innovation | null } | null = null;
  if (useAnchor && input.obs && input.obs.length && hTrue != null) {
    const pairs: Record<'t' | 'u' | 'v' | 'gust', AnchorPair[]> = { t: [], u: [], v: [], gust: [] };
    const sources = new Set<string>();
    let fraction = 0;
    for (const o of input.obs) {
      const p = preps.find((x) => Math.abs(x.a.validAtMs - o.validAtMs) <= SAME_TIME_MS);
      if (!p) continue;
      // AX-10: eine Analyse (INCA) statt einer Messung trägt ihr eigenes Gewicht (set) — multiplikativ auf die Repräsentativität.
      const wsp = spatialWeight(Math.max(0, o.distanceM), Math.abs((o.elevM ?? hTrue) - hTrue)) * Math.min(1, Math.max(0, o.weight ?? 1));
      if (!(wsp > 0)) continue;
      const ageH = Math.max(0, (input.nowMs - o.validAtMs) / H);
      // FL-AP5: mit Lernstufe ist das gelernte Mittel der Cube-Wert am Punkt — sonst zählte der Ortsbias doppelt.
      const tCube = p.learnedMu?.t ?? (p.vertical ? p.vertical.t : p.cubeSample.temperature);
      if (o.temperature != null && tCube != null) {
        const tObs = o.temperature + ((o.elevM ?? hTrue) - hTrue) * STANDARD_LAPSE_PER_M;
        pairs.t.push({ ageH, obs: tObs, model: tCube, wsp });
      }
      // E-AX-11: the wind anchor (u, v, gust) is damped over the distance of the measurement; T keeps `wsp`
      const wspW = anchorWindL != null ? wsp * Math.exp(-((Math.max(0, o.distanceM) / anchorWindL) ** 2)) : wsp;
      if (o.u != null && p.cubeSample.u != null && wspW > 0) pairs.u.push({ ageH, obs: o.u, model: p.cubeSample.u, wsp: wspW });
      if (o.v != null && p.cubeSample.v != null && wspW > 0) pairs.v.push({ ageH, obs: o.v, model: p.cubeSample.v, wsp: wspW });
      if (o.gust != null && p.cubeSample.gust != null && wspW > 0) pairs.gust.push({ ageH, obs: o.gust, model: p.cubeSample.gust, wsp: wspW });
      sources.add(o.source); fraction = Math.max(fraction, wsp);
    }
    const t = innovation(pairs.t, ANCHOR_MAX.temperature), u = innovation(pairs.u, ANCHOR_MAX.wind), vv = innovation(pairs.v, ANCHOR_MAX.wind), g = innovation(pairs.gust, ANCHOR_MAX.gust);
    if (t || u || vv || g) anchorInfo = { sources: [...sources], fraction: Math.min(1, fraction), pairs: pairs.t.length, t, u, v: vv, gust: g };
    else notes.push('anchor: Messungen da, aber kein Paar (Messung, Cube) im selben Stundenraster — kein Anker');
  }

  // ── Durchgang 3: je Schritt fertig rechnen (Anker, PAP 6, Station, Radar, Motor) ─
  const inHorizon = (atMs: number) => atMs >= input.nowMs - SAME_TIME_MS && atMs <= input.nowMs + NOWCAST_HORIZON_H * H;
  const finishStep = (p: Prep): CubeStep => {
    const { a, leadH, flags, cubeSample, vertical } = p;
    const members: CubeMemberInfo[] = [];
    const samples: PointSourceSample[] = [];
    // AP7: der Anker verschiebt das Cube-Member — Modell trägt den Tagesgang, die Messung den Ortsversatz.
    if (anchorInfo) {
      // FL-AP8b (V-FL-20): mit Option und Kurve das gemessene Gewicht w(τ), sonst e^(−τ/τ_v) — je Größe.
      const termK = anchorInfo.t ? anchorTermOf(anchorInfo.t, 't', leadH, ANCHOR_TAU_H.temperature) : 0;
      const termU = anchorInfo.u ? anchorTermOf(anchorInfo.u, 'u', leadH, ANCHOR_TAU_H.wind) : 0;
      const termV = anchorInfo.v ? anchorTermOf(anchorInfo.v, 'v', leadH, ANCHOR_TAU_H.wind) : 0;
      const termGust = anchorInfo.gust ? anchorTermOf(anchorInfo.gust, 'gust', leadH, ANCHOR_TAU_H.gust) : 0;
      if (cubeSample.temperature != null) cubeSample.temperature += termK;
      if (cubeSample.u != null) cubeSample.u += termU;
      if (cubeSample.v != null) cubeSample.v += termV;
      if (cubeSample.gust != null) cubeSample.gust = Math.max(0, cubeSample.gust + termGust);
      if (Math.abs(termK) >= 0.05 || Math.abs(termU) >= 0.05 || Math.abs(termV) >= 0.05) flags.push('anchored');
      members.push({
        product: 'anchor', tag: anchorInfo.sources.join('+'), ageH: leadH,
        anchor: { sources: anchorInfo.sources, pairs: anchorInfo.pairs, fraction: anchorInfo.fraction, offsetK: anchorInfo.t?.offset ?? null, termK, termU, termV, termGust },
      });
    }
    // Phase FS (V-FS-2): das gelernte Mittel (plus Anker) gilt am Punkt — vorkompensieren, was der Motor gleich noch einmal
    // anwendet: die lineare Höhenkorrektur von `sourceElevation` (T, Td) und den Geländefaktor des Footprints (Wind, Böe).
    if (useAtPoint && p.learnedSet && flags.includes('learned') && hTrue != null && scales) {
      const dz = cubeSample.sourceElevation != null && Number.isFinite(cubeSample.sourceElevation) ? cubeSample.sourceElevation - hTrue : 0;
      if (p.learnedSet.t && cubeSample.temperature != null) cubeSample.temperature -= dz * STANDARD_LAPSE_PER_M;
      if (p.learnedSet.td && cubeSample.dewPoint != null) cubeSample.dewPoint -= dz * DEWPOINT_LAPSE_PER_M;
      const wf = windTerrainFactor(cubeSample, { terrain: scales, elevationM: hTrue } as FusionContext);
      if (Number.isFinite(wf) && wf > 0 && wf !== 1) {
        if (p.learnedSet.uv && cubeSample.u != null && cubeSample.v != null) { cubeSample.u /= wf; cubeSample.v /= wf; }
        if (p.learnedSet.gust && cubeSample.gust != null) cubeSample.gust /= wf;
      }
      fsCount.atPoint += 1;
    }
    // AP6: σ des Cube-Members aus dem Cube (PAP 6).
    const uncertainty: CubeStep['uncertainty'] = {};
    const memberSig: Partial<Record<UncVar, MemberSigma>> = {};
    const sigmaClimaOf: Partial<Record<UncVar, number>> = {};
    if (useUnc) {
      const es: Record<string, number> = {};
      for (const v of UNC_VARS) {
        const sc = sigmaClimaFor(v, a.validAtMs);
        sigmaClimaOf[v] = sc;
        // AP13: σ_sys und c gemessen (je Vorlauf-Bin) nur für das Cube-Member; das Stationsmember bleibt `stationSigma:set`.
        const m0 = cal
          ? memberSigma({ v, sample: cubeSample, leadH, sigmaClima: sc, vertical, sysOverride: binnedAt(cal.sigmaSys?.[v], leadH), cSpread: binnedAt(cal.cSpread?.[v], leadH) })
          : memberSigma({ v, sample: cubeSample, leadH, sigmaClima: sc, vertical });
        // FL-AP5: die gelernte σ ersetzt den PAP-6-Zweig ganz (Varianzmodell aus dem Hindcast, `kind: learned`).
        const ls = p.learnedSigma?.[v];
        // KF (V-KF-1): der PAP-6-Zweig bleibt als `raw` erhalten — die Einigkeit des Konfidenz-Scores misst σ_div gegen ihn.
        const m: MemberSigma = ls != null && ls > 0 ? { sigma: ls, kind: 'learned', parts: { ...m0.parts, sys: 0 }, raw: { sigma: m0.sigma, kind: m0.kind } } : m0;
        memberSig[v] = m;
        es[v] = m.sigma;
      }
      cubeSample.errorSigma = es;
    }
    samples.push(cubeSample);
    members.unshift({
      product: `cube-${a.tier}`, tag: cubeSample.source, run: a.series.sourceRun, runAtMs: a.series.sourceRunAtMs,
      ageH: Math.round(((a.validAtMs - a.series.sourceRunAtMs) / H) * 10) / 10,
      models: a.series.sources.map((s) => s.id),
      ...(useUnc ? { sigma: cubeSample.errorSigma as Partial<Record<UncVar, number>> } : {}),
    });
    // AX-7: das Ensemble-Mittel als eigenes Member (nur t3, nur mit Ebenen) — Höhe wie das Stufenmittel (dieselbe Zelle),
    // σ = Faktor·σ_ens mit Boden; ohne σ_ens für eine Größe bleibt sie im Member leer (der Motor braucht eine σ je Größe).
    if (useEnsMember && a.tier === 't3' && cubeSample.ensMean) {
      const em = cubeSample.ensMean, se = cubeSample.sigmaEns ?? {};
      const has = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);
      const sigT = has(se.t2m) ? Math.max(ENS_MEMBER_SIGMA_FLOOR.temperature, ENS_MEMBER_SIGMA_FACTOR * se.t2m) : null;
      const sigW = has(se.u10) && has(se.v10) ? Math.max(ENS_MEMBER_SIGMA_FLOOR.wind, ENS_MEMBER_SIGMA_FACTOR * Math.sqrt(0.5 * (se.u10 * se.u10 + se.v10 * se.v10))) : null;
      const sigP = has(se.precip) ? Math.max(ENS_MEMBER_SIGMA_FLOOR.precip, ENS_MEMBER_SIGMA_FACTOR * se.precip) : null;
      const tOk = has(em.t2m) && sigT != null, wOk = has(em.u10) && has(em.v10) && sigW != null, pOk = has(em.precip) && sigP != null;
      if (tOk || wOk || pOk) {
        const ensSample: PointSourceSample = {
          source: 'ifs-ens-mean', family: 'global',
          temperature: tOk ? (em.t2m as number) : null, sourceElevation: cubeSample.sourceElevation,
          u: wOk ? (em.u10 as number) : null, v: wOk ? (em.v10 as number) : null, gust: null, relativeHumidity: null, dewPoint: null,
          snowLine: null, cloudLow: null, cloudMid: null, cloudHigh: null,
          precipitation: pOk ? (em.precip as number) : null, uvIndex: null, distanceMeters: 0,
          ...(useUnc ? { errorSigma: { ...(tOk ? { temperature: sigT as number } : {}), ...(wOk ? { wind: sigW as number } : {}), ...(pOk ? { precip: sigP as number } : {}) } } : {}),
        };
        samples.push(ensSample);
        members.push({
          product: `cube-${a.tier}`, tag: 'ifs-ens-mean', run: a.series.sourceRun, runAtMs: a.series.sourceRunAtMs,
          ageH: Math.round(((a.validAtMs - a.series.sourceRunAtMs) / H) * 10) / 10, models: ['ifs_ens'],
          ...(useUnc ? { sigma: ensSample.errorSigma as Partial<Record<UncVar, number>> } : {}),
        });
        ensMemberCount.applied += 1;
        if (tOk) ensMemberCount.t += 1; if (wOk) ensMemberCount.wind += 1; if (pOk) ensMemberCount.precip += 1;
      } else ensMemberCount.noSigma += 1;
    } else if (useEnsMember && a.tier === 't3') ensMemberCount.noPlanes += 1;

    const st = stationSampleAt(a.validAtMs, leadH);
    if (st) { samples.push(st); members.push(stationMember(a.validAtMs, st)); }

    let nowcastMembers = 0;
    for (const nc of input.nowcast) {
      let best: (typeof nc.frames)[number] | null = null;
      for (const f of nc.frames) {
        if (f.validAtMs == null) continue;
        if (Math.abs(f.validAtMs - a.validAtMs) > tol) continue;
        if (!best || Math.abs(f.validAtMs - a.validAtMs) < Math.abs((best.validAtMs as number) - a.validAtMs)) best = f;
      }
      if (!best) continue;
      const mmh = best.saturated ? NOWCAST_SATURATION : best.mmh;
      if (mmh == null) continue;
      if (best.saturated && !flags.includes('nowcastSaturated')) flags.push('nowcastSaturated');
      if (nc.slotAgeMin > NOWCAST_STALE_MIN && !flags.includes('stale')) flags.push('stale');
      const tag = nowcastTagOf(nc.sourceId);
      samples.push({
        source: tag, family: 'nowcast',
        temperature: null, sourceElevation: null, u: null, v: null, gust: null, relativeHumidity: null,
        snowLine: null, cloudLow: null, cloudMid: null, cloudHigh: null,
        precipitation: mmh, uvIndex: null, distanceMeters: 0, validAtMs: best.validAtMs as number,
      });
      members.push({
        product: 'nowcast', tag, run: nc.stamp,
        ageH: Math.round((nc.slotAgeMin / 60) * 100) / 100,
        nowcast: { source: nc.sourceId, ageMin: Math.round(nc.slotAgeMin), validAtSuspect: !!best.validAtSuspect, saturated: !!best.saturated },
      });
      nowcastMembers += 1;
    }
    // AP7: das Radar deckt den Punkt, trägt diese Stunde aber nicht (Frist, Sonde, Frame) ⇒ Modell, benannt.
    if (!nowcastMembers && input.nowcastCovering.length && inHorizon(a.validAtMs)) flags.push('nowcastFallbackModel');

    const weights: Weights = {};
    let fused = fuseAt(samples, leadH, a.validAtMs, p.foehnScore, weights);
    if (fused?.temperature?.climatologyOnly) flags.push('climatologyOnly');
    // FL-AP8c: nach der Fusion der Stunde — Speed-EMOS (V-FL-22) und gelernte Hürde (V-FL-18), je nur mit Option.
    if (fused && learnedT && p.learnedSit) {
      if (useLearnedSpeed && fused.windSpeed && fused.windSpeed.dist.kind === 'rice') {
        if (p.learnedSpeed) { fused = { ...fused, windSpeed: { ...fused.windSpeed, dist: speedLaw(fused.windSpeed.dist, p.learnedSpeed) } }; flags.push('learnedSpeed'); learnedPost.speed += 1; }
        else learnedPost.speedNoLaw += 1;
      }
      if (useLearnedPrecip && fused.precipitation && fused.precipitation.dist.kind === 'hurdleLogNormal') {
        // nur, wo der Motor-Wert allein aus dem Cube kommt: Radar- und Stationsmember tragen K-2 weiter
        if (nowcastMembers || (st && st.precipitation != null)) learnedPost.precipKept += 1;
        else {
          const lp = predictPrecipLearned(learnedT, 'K', p.learnedSit, fused.precipitation.dist.pDry);
          if (lp) { fused = { ...fused, precipitation: { ...fused.precipitation, dist: lp.dist } }; flags.push('learnedPrecip'); learnedPost.precip += 1; }
          else learnedPost.precipAbsent += 1;
        }
      }
    }
    // Phase FS: nach der Kombination — die gelernte Bewölkung durchreichen (H14), der Stationswert (H9/H10).
    let post: CubeStep['post'];
    if (fused && useLearnedClouds && fused.clouds && p.learnedDist?.clouds && flags.includes('learned')) {
      fused = { ...fused, clouds: { ...fused.clouds, dist: p.learnedDist.clouds } };
      post = { ...post, learnedClouds: true }; fsCount.clouds += 1;
    }
    if (fused && stackOn) {
      const r = applyStationValue(fused, a.validAtMs, leadH, flags.includes('learned') ? p.learnedDist : null);
      if (r) { fused = r.fused; post = { ...post, stationValue: r.info }; }
    }
    if (useUnc) {
      for (const v of UNC_VARS) {
        const m = memberSig[v]!;
        const sp = fused ? sigmaPostOf(fused, v) : null;
        uncertainty[v] = {
          sigmaKind: m.kind, sigmaMember: m.sigma, parts: m.parts, sigmaPost: sp, sigmaClima: sigmaClimaOf[v]!,
          confidence: sp == null ? null : confidenceOf({ sigmaPost: sp, sigmaClima: sigmaClimaOf[v]!, member: m, srcCount: cubeSample.srcCount ?? null, flags, dhM: vertical ? Math.abs(vertical.dhM) : null, spread: spreadOverrideOf(fused!, v), ...(cal?.confDiscount ? { discount: cal.confDiscount } : {}) }),
        };
      }
    }
    return {
      validAtMs: a.validAtMs, leadH, tier: a.tier, interpolated: false, flags, fused, members,
      cell: a.step.values, belowGroundHPa: a.step.belowGroundHPa, vertical,
      grid: p.grid ? { n: p.grid.n, truncated: p.grid.truncated, weights: p.grid.weights, hModEffM: p.grid.hModEffM } : null,
      uncertainty,
      terrain: p.terrainRes,
      weights, samples,
      ...(post ? { post } : {}),
    };
  };
  const steps: CubeStep[] = preps.map(finishStep);
  // Nie still: wie oft der Stationswert wirklich gesetzt wurde — eine Tabelle ohne Eintrag für die tragbare Form setzt nichts.
  const stationValueApplied = (): string => (fsCount.stationValue
    ? `stationValue: gesetzt an ${fsCount.stationValue} Schritten (Formen ${Object.entries(fsCount.byForm).map(([f, n]) => `${f} ${n}`).join(', ')}, je Größe gezählt${Object.keys(fsCount.byCountry).length ? `; Landeseinträge ${Object.entries(fsCount.byCountry).map(([c, n]) => `${c} ${n}`).join(', ')} (AX-5)` : ''})`
    : 'stationValue: an keinem Schritt gesetzt — die Tabelle trägt keinen Eintrag für die Form, die diese Abfrage tragen kann');
  if (useAtPoint && learnedT) notes.push(`learnedAtPoint: Member an ${fsCount.atPoint} Schritten vorkompensiert`);
  if (useLearnedClouds && learnedT) notes.push(`learnedClouds: gelernte Bewölkung an ${fsCount.clouds} Schritten durchgereicht`);
  if (opts.stationValue === true && stackT) {
    notes.push(stackOn
      ? `stationValue: ${input.station!.station.name.trim()} steht am Punkt (${input.station!.station.distanceKm.toFixed(1)} km, Δh ${Math.round(input.station!.station.elev - (hTrue as number))} m); Innovation ${stackInn ? `aus ${stackInn.source}${stackInn.stationId ? ` ${stackInn.stationId}` : ''}${stackInn.name ? ` ${stackInn.name}` : ''} (${stackInn.distanceKm.toFixed(1)} km${stackInn.byStation ? ', gezielt abgefragt' : ''}) ${new Date(stackInn.atMs).toISOString().slice(0, 16)}Z (T ${stackInn.I.t == null ? '—' : stackInn.I.t.toFixed(2)} K)` : `keine (${input.obs?.length ? `${input.obs.length} Messung(en), die nächste ${(Math.min(...input.obs.map((o) => o.distanceM)) / 1000).toFixed(1)} km entfernt — ` : 'keine Messung — '}keine Messung einer Station am Punkt ≤ jetzt mit Stationsvorhersage zur Messzeit) ⇒ Formen ohne w·I`}`
      : `stationValue: keine Station am Punkt (${input.station ? `${input.station.station.name.trim()}, ${input.station.station.distanceKm.toFixed(1)} km, Δh ${hTrue == null ? '—' : Math.round(input.station.station.elev - hTrue)} m — außerhalb ${stackT.range.maxKm} km / ${stackT.range.maxDElevM} m` : 'kein Stationsmember'}) ⇒ Rechnung ohne Stationswert`);
  }
  if (useLearnedSpeed && learnedT) notes.push(`learnedSpeed: gestutzte Normal an ${learnedPost.speed} Schritten, ohne Gesetz im Stratum ${learnedPost.speedNoLaw} (Rice bleibt)`);
  if (useLearnedPrecip && learnedT) notes.push(`learnedPrecip: gelernte Hürde an ${learnedPost.precip} Schritten, K-2 behalten ${learnedPost.precipKept} (Radar-/Stationsmember), ohne Stratum oder ohne CV-Gewinn ${learnedPost.precipAbsent}`);

  // ── Klimatologie-Schwanz (AP7): jenseits des letzten nativen Schritts bis zum Fensterende ─
  if (useTail && steps.length && clima && geometryOk) {
    const stepMs = TIERS[TIERS.length - 1].stepH * H;
    // Stündlich braucht die letzte Stunde einen Stützpunkt HINTER dem Fenster (er wird nicht ausgegeben).
    const endMs = input.window.toMs + (opts.hourly ? stepMs : 0);
    for (let t = steps[steps.length - 1].validAtMs + stepMs; t <= endMs; t += stepMs) {
      const leadH = Math.max(0, (t - t0Ms) / H);
      const fused = fuseAt([], leadH, t, null);
      steps.push({
        validAtMs: t, leadH, tier: 'clima', interpolated: false, flags: ['climatologyOnly'], fused,
        members: [{ product: 'climatology', tag: 'climatology', ageH: leadH }], cell: {}, belowGroundHPa: null, vertical: null, grid: null, uncertainty: {}, terrain: null, samples: [],
      });
    }
  }

  // ── Stündliche Achse (AP7): Station füllt, sonst markierte Interpolation ──
  if (opts.hourly && steps.length) {
    const byMs = new Map<number, CubeStep>(steps.map((s) => [s.validAtMs, s]));
    const stepMs = Math.max(0.25, input.window.stepH) * H;
    const out: CubeStep[] = [];
    const nativeList = steps.filter((s) => s.fused);
    for (let t = input.window.fromMs; t <= input.window.toMs; t += stepMs) {
      const have = byMs.get(t);
      if (have) { out.push(have); continue; }
      const leadH = Math.max(0, (t - t0Ms) / H);
      const st = stationSampleAt(t, leadH);
      if (st) {
        const weights: Weights = {};
        let fused = fuseAt([st], leadH, t, null, weights);
        // Phase FS: auch die Stunde, die die Station füllt, bekommt den Stationswert (ohne Lernstufe: die Formen ohne L).
        let post: CubeStep['post'];
        if (fused && stackOn) { const r = applyStationValue(fused, t, leadH, null); if (r) { fused = r.fused; post = { stationValue: r.info }; } }
        const flags: StepFlag[] = ['stationOnly'];
        if (input.nowcastCovering.length && inHorizon(t)) flags.push('nowcastFallbackModel');
        const uncertainty: CubeStep['uncertainty'] = {};
        if (useUnc && fused) {
          for (const v of UNC_VARS) {
            const m = memberSigma({ v, sample: st, leadH, sigmaClima: sigmaClimaFor(v, t), vertical: null });
            const sp = sigmaPostOf(fused, v);
            uncertainty[v] = { sigmaKind: m.kind, sigmaMember: m.sigma, parts: m.parts, sigmaPost: sp, sigmaClima: sigmaClimaFor(v, t),
              confidence: sp == null ? null : confidenceOf({ sigmaPost: sp, sigmaClima: sigmaClimaFor(v, t), member: m, srcCount: 1, flags, dhM: null, spread: spreadOverrideOf(fused, v), ...(cal?.confDiscount ? { discount: cal.confDiscount } : {}) }) };
          }
        }
        out.push({ validAtMs: t, leadH, tier: 'station', interpolated: false, flags, fused, members: [stationMember(t, st)], cell: {}, belowGroundHPa: null, vertical: null, grid: null, uncertainty, terrain: null, weights, samples: [st], ...(post ? { post } : {}) });
        continue;
      }
      // Lineare Interpolation der Quantile zwischen den nächsten Schritten mit Verteilung — markiert.
      let prev: CubeStep | null = null, next: CubeStep | null = null;
      for (const s of nativeList) { if (s.validAtMs < t) prev = s; else if (s.validAtMs > t) { next = s; break; } }
      if (!prev || !next || !prev.fused || !next.fused) continue;
      const f = (t - prev.validAtMs) / (next.validAtMs - prev.validAtMs);
      const lerp = (x: number, y: number) => x + (y - x) * f;
      // AP12 (V-FI-20): dieselben Nachbarschritte stützen bis zu fünf Stunden — ihre Quantile einmal rechnen (quantileMemo).
      const qOf = (fv: FusedVariable | null): InterpQ | null => (fv ? { p10: quantileMemo(fv.dist, 0.1), p50: quantileMemo(fv.dist, 0.5), p90: quantileMemo(fv.dist, 0.9), mean: meanOf(fv.dist) } : null);
      const mix = (a: FusedVariable | null, b: FusedVariable | null): InterpQ | undefined => {
        const qa = qOf(a), qb = qOf(b);
        if (!qa || !qb) return undefined;
        return { p10: lerp(qa.p10, qb.p10), p50: lerp(qa.p50, qb.p50), p90: lerp(qa.p90, qb.p90), mean: lerp(qa.mean, qb.mean) };
      };
      const interp: NonNullable<CubeStep['interp']> = {
        temperature: mix(prev.fused.temperature, next.fused.temperature), dewPoint: mix(prev.fused.dewPoint, next.fused.dewPoint),
        humidity: mix(prev.fused.humidity, next.fused.humidity), clouds: mix(prev.fused.clouds, next.fused.clouds),
        precipitation: mix(prev.fused.precipitation, next.fused.precipitation), windSpeed: mix(prev.fused.windSpeed, next.fused.windSpeed), gust: mix(prev.fused.gust, next.fused.gust),
        confidence: {},
      };
      // AX-3: T als Anomalie gegen den Tagesgang μ_c — der Zusatzterm hängt nur von der Vorlage ab, nicht von den Stützwerten.
      if (useAnomalyInterp && anomalyMuT && interp.temperature) {
        const mP = anomalyMuT(prev.validAtMs), mN = anomalyMuT(next.validAtMs), mT = anomalyMuT(t);
        if (mP != null && mN != null && mT != null) {
          const corr = mT - lerp(mP, mN);
          const q = interp.temperature;
          interp.temperature = { p10: q.p10 + corr, p50: q.p50 + corr, p90: q.p90 + corr, mean: q.mean + corr };
          anomalyCount.applied += 1; anomalyCount.sumAbs += Math.abs(corr); anomalyCount.maxAbs = Math.max(anomalyCount.maxAbs, Math.abs(corr));
          if (interp.dewPoint) {
            const d = interp.dewPoint, T2 = interp.temperature;
            const capped = { p10: Math.min(d.p10, T2.p10), p50: Math.min(d.p50, T2.p50), p90: Math.min(d.p90, T2.p90), mean: Math.min(d.mean, T2.mean) };
            if (capped.p10 !== d.p10 || capped.p50 !== d.p50 || capped.p90 !== d.p90 || capped.mean !== d.mean) { interp.dewPoint = capped; anomalyCount.capped += 1; }
          }
        } else anomalyCount.noMu += 1;
      }
      for (const v of UNC_VARS) {
        const ca = prev.uncertainty[v]?.confidence?.score, cb = next.uncertainty[v]?.confidence?.score;
        // Ein Klimatologie-Nachbar hat keine Konfidenz (0): die Interpolation läuft dorthin aus; zwischen zwei Klimatologie-Stützen ist sie 0.
        if (useUnc) interp.confidence![v] = lerp(ca ?? 0, cb ?? 0) * (cal?.confDiscount?.interpolated ?? CONF_DISCOUNT.interpolated);
      }
      const flags: StepFlag[] = ['interpolated'];
      if (prev.tier !== next.tier && prev.tier !== 'clima' && next.tier !== 'clima') flags.push('seam');
      out.push({ validAtMs: t, leadH, tier: prev.tier, interpolated: true, interp, flags, fused: null, members: [], cell: {}, belowGroundHPa: null, vertical: null, grid: null, uncertainty: {}, terrain: null });
    }
    steps.length = 0;
    steps.push(...out);
  }

  if (stackOn) notes.push(stationValueApplied());
  if (useEnsMember) {
    notes.push(ensMemberCount.applied
      ? `ensMember: Ensemble-Mittel als Member an ${ensMemberCount.applied} t3-Schritten (T ${ensMemberCount.t} · Wind ${ensMemberCount.wind} · Niederschlag ${ensMemberCount.precip}), σ = ${ENS_MEMBER_SIGMA_FACTOR}·σ_ens (set)${ensMemberCount.noPlanes ? `; ${ensMemberCount.noPlanes} t3-Schritte ohne _ens-Ebenen` : ''}${ensMemberCount.noSigma ? `; ${ensMemberCount.noSigma} ohne σ_ens` : ''}`
      : `ensMember: Option an, aber ${ensMemberCount.noPlanes ? 'keine _ens-Ebenen im Cube (Schema 5?)' : ensMemberCount.noSigma ? 'kein σ_ens an den Schritten mit Mittel' : 'keine t3-Schritte'} ⇒ ohne Ensemble-Member`);
  }
  if (useAnomalyInterp) {
    notes.push(anomalyMuT
      ? `interpolation: T als Anomalie an ${anomalyCount.applied} interpolierten Stunden (|Korrektur| Mittel ${anomalyCount.applied ? (anomalyCount.sumAbs / anomalyCount.applied).toFixed(2) : '—'} K, max ${anomalyCount.maxAbs.toFixed(2)} K), Td an ${anomalyCount.capped} Stunden auf T gekappt${anomalyCount.noMu ? `, ${anomalyCount.noMu} Stunden ohne μ_c` : ''}`
      : `interpolation: Anomalie angefragt, kein μ_c(T) am Punkt (${climaWhy}) ⇒ linear`);
  }
  const runs: CubeFusionResult['provenance']['runs'] = {};
  for (const tier of TIERS) {
    const s = input.cube[tier.id];
    if (!s) continue;
    runs[tier.id] = { run: s.run, sourceRun: s.sourceRun, sourceRunAtMs: s.sourceRunAtMs, models: s.sources.map((x) => x.id), manifestFrom: s.manifestFrom ?? null };
  }
  const st = input.station;
  if (input.climaGrid !== undefined) {
    // (in einer Closure gesetzt — TS verengt `cgFirst` hier auf null, deshalb der Blick über den Typ)
    const cgF = cgFirst as { doy: number; dh: number; dT: number; g: number; s: number } | null;
    notes.push(cgUsed && cgF
      ? `climaGrid: Klimanormale 1991–2020 der Stufe-1-Zelle (src ${cgCol!.src ?? '—'}, ${cgCol!.n_src ?? '—'} Quellzellen, elev_src ${Math.round(cgElev!)} m) statt Stationsfeld für das Tagesmittel T — Δh ${Math.round(cgF.dh)} m ⇒ ΔT ${cgF.dT.toFixed(2)} K (Γ ${CLIMA_GRID_LAPSE_PER_M} K/m, set); Tag ${cgF.doy}: Gitter ${cgF.g.toFixed(1)} °C, korrigiert ${(cgF.g + cgF.dT).toFixed(1)} °C, Stationsfeld ${cgF.s.toFixed(1)} °C; Tagesgang, σ_c und Nasstag aus dem Stationsfeld (AX-9)`
      : `climaGrid: Option an, aber ${!input.climaGrid ? 'kein Produkt/keine Zelle (point/static/clima-grid fehlt, noch nicht da oder Punkt außerhalb DE/AT/CH)' : hTrue == null ? 'keine Punkthöhe' : !clima ? 'kein Stationsfeld (Tagesgang fehlt)' : 'keine Normale in der Zelle'} ⇒ Stationsfeld`);
  }
  if (st && st.source && st.source !== 'mosmix_l') notes.push(`station: Stationsprodukt ${st.source} (AX-8; Lauf ${st.run}, ${st.ageH} h alt bei Veröffentlichung) statt MOSMIX-L — Stationswert und Lernstufe sind an MOSMIX-L gefittet`);
  if (anchorInfo) notes.push(`anchor: ${anchorInfo.pairs} Paar(e) aus ${anchorInfo.sources.join('+')}, Versatz T ${anchorInfo.t ? anchorInfo.t.offset.toFixed(2) : '—'} K, Repräsentativität ${anchorInfo.fraction.toFixed(2)}`);
  return {
    schema: 'fi-ap2',
    point: { lat, lon, hTrue, terrain: input.terrain },
    axis: {
      native: axis.map((a) => a.validAtMs), perTier, seams,
      gaps: input.index?.axis?.gaps ?? null, usableToMs: input.index?.axis?.usableToMs ?? null,
    },
    steps,
    provenance: {
      indexCommit: input.index?.commit ?? null,
      runs,
      station: st ? { run: st.run, runAtMs: st.runAtMs, ageH: st.ageH, id: st.station.id, name: st.station.name.trim(), distKm: st.station.distanceKm, dElevM: st.station.dElevM, elevM: st.station.elev, ...(st.source && st.source !== 'mosmix_l' ? { source: st.source } : {}) } : null,
      stationReason: input.stationReason,
      nowcast: input.nowcast.map((n) => ({ source: n.sourceId, stamp: n.stamp, ageMin: Math.round(n.slotAgeMin), frames: n.frames.length, extrapolationH: n.extrapolationH })),
      clima: cgUsed ? 'clima-grid' : clima ? 'grid' : 'none',
    },
    calib,
    notes: [...input.notes, ...notes],
    timing: { algoMs: Math.round((now() - T0) * 10) / 10 },
  };
}

// ---------------------------------------------------------------------------
// Abbildung auf `PointForecast` (der Vertrag, den heutige Verbraucher lesen)
// ---------------------------------------------------------------------------

const median = (v: FusedVariable | null): number | null => (v ? quantileMemo(v.dist, 0.5) : null);

/** Konfidenz-Vorstufe (AP2): der `spread`-Faktor aus Plan §2.2 — 1 − σ/σ_clima; AP6 ergänzt agree · lage. */
function spreadConfidence(v: FusedVariable | null, sigmaClima: number): number {
  if (!v) return 0;
  const s = (v.dist as { sigma?: number }).sigma;
  if (s == null || !Number.isFinite(s) || !(sigmaClima > 0)) return 0;
  return Math.max(0, Math.min(1, 1 - s / sigmaClima));
}

export function toPointForecast(r: CubeFusionResult, opts: PointForecastOptions, extra: { fetchedAt: number; cube: CubePathSummary }): PointForecast {
  const hours: PointForecastHour[] = r.steps.map((s) => {
    const f = s.fused;
    // AP7: ein interpolierter Schritt trägt keine Verteilung, nur Quantile — hier die Mediane/Mittel daraus.
    if (s.interpolated && s.interp) {
      const q = s.interp;
      const t = q.temperature?.p50 ?? null, ws = q.windSpeed?.p50 ?? null, rh = q.humidity?.p50 ?? null;
      const g = q.gust?.p50 ?? null;
      return {
        timestamp: new Date(s.validAtMs),
        temperature: t, windSpeed: ws, windDirection: null,
        gustSpeed: g == null ? null : (ws == null ? g : Math.max(g, ws)),
        relativeHumidity: rh, apparentTemperature: apparentTemperatureC(t, ws, rh), snowLineM: null,
        cloudCoverTotal: q.clouds?.p50 ?? null, cloudCoverLow: null, cloudCoverMid: null, cloudCoverHigh: null,
        precipitation: q.precipitation?.mean ?? null, uvIndex: null,
        confidence: {
          temperature: q.confidence?.temperature ?? 0, wind: q.confidence?.wind ?? 0, gust: q.confidence?.gust ?? 0, humidity: q.confidence?.dewpoint ?? 0,
          precipitation: 0, clouds: q.confidence?.clouds ?? 0, snowLine: 0, uvIndex: 0,
        },
        contributingSources: [],
        fusion: null,
      };
    }
    const t = median(f?.temperature ?? null);
    const ws = median(f?.windSpeed ?? null);
    const gRaw = median(f?.gust ?? null);
    const rh = median(f?.humidity ?? null);
    return {
      timestamp: new Date(s.validAtMs),
      temperature: t,
      windSpeed: ws,
      windDirection: f?.windDirectionDeg ?? null,
      gustSpeed: gRaw == null ? null : (ws == null ? gRaw : Math.max(gRaw, ws)),
      relativeHumidity: rh,
      apparentTemperature: apparentTemperatureC(t, ws, rh),
      snowLineM: num(s.cell.snowlmt),
      cloudCoverTotal: median(f?.clouds ?? null),
      cloudCoverLow: num(s.cell.clcl), cloudCoverMid: num(s.cell.clcm), cloudCoverHigh: num(s.cell.clch),
      precipitation: f?.precipitation ? meanOf(f.precipitation.dist) : null,
      uvIndex: null,
      // AP6: der Konfidenz-Score (§2.2), wo PAP 6 ihn rechnet; sonst die Spread-Vorstufe aus AP2.
      confidence: {
        temperature: s.uncertainty.temperature?.confidence?.score ?? spreadConfidence(f?.temperature ?? null, CLIMA_SIGMA_FALLBACK.temperature),
        wind: s.uncertainty.wind?.confidence?.score ?? spreadConfidence(f?.windSpeed ?? null, CLIMA_SIGMA_FALLBACK.wind),
        gust: s.uncertainty.gust?.confidence?.score ?? spreadConfidence(f?.gust ?? null, CLIMA_SIGMA_FALLBACK.gust),
        humidity: s.uncertainty.dewpoint?.confidence?.score ?? spreadConfidence(f?.humidity ?? null, CLIMA_SIGMA_FALLBACK.humidity),
        precipitation: f?.precipitation ? Math.max(0, Math.min(1, 1 - (f.precipitation.dist as { sigma: number }).sigma / 2)) : 0,
        clouds: s.uncertainty.clouds?.confidence?.score ?? spreadConfidence(f?.clouds ?? null, CLIMA_SIGMA_FALLBACK.clouds),
        snowLine: s.cell.snowlmt != null ? 0.5 : 0,
        uvIndex: 0,
      },
      contributingSources: [...(f?.temperature?.contributors ?? []), ...(s.flags.includes('anchored') ? (s.members.find((m) => m.product === 'anchor')?.anchor?.sources ?? []) : [])],
      fusion: f,
    };
  });
  const st = r.provenance.station;
  const anchorSources = r.steps.flatMap((s) => s.members.filter((m) => m.product === 'anchor').flatMap((m) => m.anchor?.sources ?? []));
  return {
    query: { lat: r.point.lat, lng: r.point.lon, elevation: r.point.hTrue ?? 0, country: opts.country },
    hours,
    fetchedAt: extra.fetchedAt,
    lapseRatePerM: 0.0065,
    nearestStations: st ? [{ name: st.name, source: 'mosmix', distanceMeters: st.distKm * 1000, elevation: st.elevM }] : [],
    sourcesAvailable: [...new Set([
      ...(['t1', 't2', 't3'] as TierId[]).filter((t) => r.axis.perTier[t] > 0).map((t) => `cube-${t}`),
      ...(st ? ['mosmix'] : []),
      ...r.provenance.nowcast.map((n) => nowcastTagOf(n.source)),
      ...anchorSources,
    ])],
    cube: extra.cube as unknown as Record<string, unknown>,
  };
}

/** Was `PointForecast.cube` trägt (additiv): Achse, Provenienz, Flags, Zeiten. */
export interface CubePathSummary {
  schema: 'fi-ap2';
  axis: CubeFusionResult['axis'];
  provenance: CubeFusionResult['provenance'];
  flags: Array<{ validAtMs: number; tier: StepTier; flags: StepFlag[] }>;
  calib: string[];
  notes: string[];
  skips: string[];
  errors: string[];
  timing: { readMs: number; coreMs: number; firstMs: number | null; algoMs: number; outputMs: number; totalMs: number; doneAt: Record<string, number> };
  stats: PointBundle['stats'];
  /** AP8: das Produkt nach Plan §2 — je Schritt je Größe Quantile, Verteilung, σ-Art, Konfidenz, Member mit Gewicht, Setzungen. */
  v2: PointForecastV2;
  /**
   * AP12, nur im progressiven Modus (`onUpdate`): `first` = die Antwort des Aufrufs (erste Stufe allein, wenn sie vor dem Kern
   * fertig war — dann nennt `pending` die fehlenden Stufen —, sonst der Kern), `core` = das ganze Fenster nach einer ersten
   * Stufe, `update` = mit Radar/Anker/statischen Produkten, die nachkamen.
   */
  emission?: 'first' | 'core' | 'update';
  /** AP12, nur im progressiven Modus: was bei DIESER Ausgabe noch fehlt und nachgeliefert wird (`anchor`, `nowcast`, `static`). */
  pending?: string[];
  /**
   * Phase DB (E-DB-8, audit/dashboard.md §5.3): rohe Zellwerte der Cube-Stufen, die `v2` nicht trägt — Druckflächen und
   * Profil —, an den NATIVEN Schritten, rein lesend aus demselben Bündel. `v2` und die Rechnung sind davon unberührt.
   */
  cells?: CubeCellRow[];
}

/** Phase DB: die durchgereichten Ebenen (Einheiten wie im Cube: °C, %, K/km, m, K). */
export const CUBE_CELL_PLANES = Object.freeze(['t925', 't850', 't700', 'rh925', 'rh850', 'rh700', 'gammaEff', 'zBase', 'zInv', 'dTInv', 'hModEff'] as const);
export type CubeCellPlane = typeof CUBE_CELL_PLANES[number];
export interface CubeCellRow { validAtMs: number; tier: StepTier; v: Record<CubeCellPlane, number | null> }

/** Phase DB: die Zeilen für `CubePathSummary.cells` — nur Schritte mit Zellwerten (native Cube-Schritte). */
function cubeCellRows(steps: ReadonlyArray<{ validAtMs: number; tier: StepTier; interpolated?: boolean; cell: Record<string, number | null> }>): CubeCellRow[] {
  const out: CubeCellRow[] = [];
  for (const s of steps) {
    if (s.interpolated || !s.cell || !Object.keys(s.cell).length) continue;
    const v = {} as Record<CubeCellPlane, number | null>;
    for (const p of CUBE_CELL_PLANES) { const x = s.cell[p]; v[p] = typeof x === 'number' && Number.isFinite(x) ? x : null; }
    out.push({ validAtMs: s.validAtMs, tier: s.tier, v });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Der Einstieg mit Lesen — Browser-IO als Voreinstellung, Node injiziert
// ---------------------------------------------------------------------------

export interface CubeIo {
  store: PointStore;
  decodePng?: PngDecoder;
  terrain: TerrainOptions | false;
  clima: () => Promise<ClimaField | null>;
  /** Die Uhr — injizierbar, damit Verifier und Replay gegen eine feste Zeit lesen (D-12). */
  nowMs?: () => number;
  /** Gelände von außen (Replay/Verifier ohne Kacheln): ersetzt das Ergebnis des Lesers. */
  terrainOverride?: CubeTerrain | null;
  /**
   * AP7: Stationsmessungen für den Anker. Voreinstellung im Browser: `fetchNearestStationObs`
   * (BrightSky/TAWES/SMN) mit harter Frist; `null` = kein Anker. Nie auf dem kritischen Pfad:
   * die Antwort wartet höchstens `OBS_GRACE_MS` nach dem Bündel auf die Messung.
   * AX-1: im progressiven Modus (Abruf ab dem Kern) reist die Station des Punkts als Hinweis mit (`CubeObsHint`).
   */
  obs?: ((lat: number, lon: number, country: Country, signal: AbortSignal, hint?: CubeObsHint, opts?: CubeObsFetchOptions) => Promise<CubeObs[]>) | null;
  /** AP7: Frist für die progressiven Produkte (Nowcast, statische) ab dem Kern (V-FI-16). */
  lateDeadlineMs?: number;
  /**
   * AP12 (c): Cube-Chunks über Byte-Bereiche lesen — nur `CUBE_ANSWER_PLANES`, der Rest im Hintergrund.
   * Voreinstellung AUS: der Browser fragt Bereiche als identity-Variante an, die der Publisher nicht wärmt —
   * der erste Bereich je Chunk und Edge ist ein MISS (0,3–1,8 s, §9.14.1). Einschalten erst, wenn der
   * Publisher auch diese Variante wärmt (Jans Entscheidung).
   */
  planeRanges?: boolean;
  /**
   * AP12 (e): nur im progressiven Modus — liegt eine Kopie des Index, die jünger ist als diese Frist, wird mit ihr
   * gelesen und der Index nebenher nachgeprüft; nennt er andere Läufe, wird neu gelesen und nachgeliefert.
   * Voreinstellung im Browser `INDEX_SWR_MS`; 0/undefined = immer erst den Index holen (wie bisher).
   */
  indexSwrMs?: number;
  /**
   * V-FI-17: z0 aus WorldCover für die zweistufige Windkorrektur (`z0Point.ts`). Fehlt die Option (Voreinstellung,
   * z. B. im AP9-Sammler), rechnet der Cube-Pfad ohne Korrektur — byte-gleich wie bisher. Im Browser an
   * (`defaultCubeIo`, nur hinter `?pf=cube`): nie auf dem kritischen Pfad — progressiv erst ab dem Kern (wirkt in
   * der Nachlieferung), sonst parallel mit Frist `Z0_DEADLINE_MS`; ein Ort liegt danach zeitlos im Cache.
   */
  z0?: Z0Options | null;
  /**
   * AP13 (V-FI-79): Optionen der Rechnung für das Produkt — bis AP13 rief `forecastFromBundle` fest
   * `{ hourly, tail }` auf, keine `FuseCubeOptions` erreichte die Antwort. `hourly`/`tail` bleiben fest (das Produkt
   * antwortet stündlich bis 336 h). Voreinstellung: nichts ⇒ byte-gleich. Die gesetzten Optionen stehen im
   * Cache-Schlüssel, damit ein Treffer nie eine andere Variante liefert.
   */
  fuse?: Partial<Omit<FuseCubeOptions, 'hourly' | 'tail' | 'calib'>>;
  /**
   * AP13 (V-FI-66): `'json'` liest `point/calib.json` (nur `measured` mit Beleg wirkt, `calibDoc.ts`); Voreinstellung
   * `'constants'` = die Setzungen im Code, byte-gleich wie bisher. Nie blockierend: ist die Datei beim Kern nicht da,
   * gelten die Setzungen mit Notiz, und die Entscheidung bleibt für alle Ausgaben dieser Abfrage dieselbe (kein
   * σ-Sprung in der Nachlieferung).
   */
  calibSource?: 'constants' | 'json';
  /**
   * Phase FL (FL-AP5, E-FL-1): `'json'` liest `point/fusion.client.json` (die gelernten Tabellen der Form K, Provenienz
   * `hindcast`, `learnedPoint.ts`) und schaltet `FuseCubeOptions.learned` ein. Voreinstellung `'none'` ⇒ byte-gleich.
   * Wie `calib.json` nie blockierend; die Entscheidung fällt einmal bei der ersten Ausgabe.
   */
  learnedSource?: 'none' | 'json';
  /**
   * Phase FX-5 (E-FX-8, §6.5): `'json'` liest `point/static/clima/v1/stations.json` (das Klimatologieprodukt, `climaPoint.ts`)
   * für die μ_c-Spalte der Lernstufe. Wirkt nur mit `learnedSource: 'json'` und einer Tabelle mit μ_c-Spalte; Voreinstellung
   * `'none'` ⇒ byte-gleich. Wie die Tabellen nie blockierend, eine Entscheidung je Abfrage.
   */
  climaSource?: 'none' | 'json';
  /**
   * Phase FS: `'json'` liest `point/stack.client.json` (die Tabelle des Stationswerts, `stackPoint.ts`, Provenienz `archive`).
   * Wirkt nur mit `fuse.stationValue` oder `stage: 'fs'`. Voreinstellung `'none'`. Nie blockierend, eine Entscheidung je Abfrage.
   */
  stackSource?: 'none' | 'json';
  /**
   * Phase FS: `'fs'` = die neueste Stufe von buscosun Fusion als EIN Schalter. Liegen die gelernten Tabellen vor, rechnet der
   * Cube-Pfad mit `learnedSpeed`, `learnedPrecip`, `learnedAtPoint`, `learnedClouds` und `priorShrink: false` — die Kette, die
   * am Archiv gemessen ist; liegt zusätzlich die Tabelle des Stationswerts vor, mit `stationValue`. Ohne Tabellen rechnet der
   * Pfad wie ohne Schalter (keine der Optionen ist ohne Lernstufe gemessen) und sagt es. Ausdrückliche `fuse`-Optionen haben
   * Vorrang. Braucht `learnedSource: 'json'` (und `climaSource`, `stackSource`), sonst kommt nichts an.
   */
  stage?: 'fs';
  /**
   * AP14 (E-F-18): liegt eine Zelle des 2×2-Blocks (PAP 3) in einem anderen Chunk, holt der Leser diesen Chunk desselben
   * Laufs nach — der Block ist dann vollständig, `chunkBorderTruncated` entfällt. Nicht-progressiv sofort im Bündel;
   * progressiv als EIGENE Ausgabe, sobald die Zellen da sind (nie in der ersten Darstellung, nie als Wartegrund für
   * Anker/Radar). Voreinstellung aus; im Browser erst nach dem Randbefund aus dem Archiv (Jans Gate).
   */
  crossChunk?: boolean;
  /**
   * AP16: statt `loadZ0AtPoint` läuft `loadLandCoverAtPoint` — dieselben WorldCover-Kacheln (0 Byte mehr), dazu die
   * Landbedeckung für κ (`FuseCubeOptions.kappa`), die Modellzell-Box (`z0CellBox`) und d_water (v2 `point.dWater`).
   * Wirkt nur mit `z0` (dessen Cache und Frist gelten). Der Blick nur in den Cache nimmt auch den alten z0-Eintrag (z0
   * wirkt in der ersten Ausgabe weiter); die Landbedeckung folgt dann aus den gecachten Kachelbytes. Voreinstellung aus.
   */
  landCover?: boolean;
  /**
   * AP17 (E-F-15): `point/static/z0mod/v1` mitlesen (z0 der Modelle je Quelle, eine kleine Datei je Stufe) — mit den
   * übrigen statischen Produkten, progressiv also erst in der Nachlieferung. Wirkt nur mit `fuse.z0Model` und `z0`.
   * Voreinstellung aus (kein Abruf); im Browser erst, wenn Jan das Produkt freigegeben hat und es im Daten-Repo liegt.
   */
  z0mod?: boolean;
  /**
   * AX-8 (`audit/fusion-ausbau.md` §6b): welches Stationsprodukt das Stationsmember trägt — `mosmix_l` (Voreinstellung,
   * wie bisher), `mosmix_s` (stündlich, `point/stations-s/`; ohne S-Lauf benannt zurück auf L) oder `freshest`.
   * Voreinstellung aus, weil der Stationswert (Phase FS) und die Lernstufe an MOSMIX-L gefittet sind; S wird erst
   * nach dem Stationsvergleich (E-AX-8) zur Voreinstellung. `?st=s` / `?st=fresh` im Panel.
   */
  stationSource?: 'mosmix_l' | 'mosmix_s' | 'freshest';
  /**
   * AX-9 (`audit/fusion-ausbau.md` §6c): `point/static/clima-grid/v1` mitlesen (monatliche Klimanormale 1991–2020 der
   * nationalen 1-km-Gitter auf dem Stufe-1-Gitter) und als Tagesmittel des Temperatur-Priors nehmen. Voreinstellung aus
   * (kein Abruf); `?cg=1` im Panel. Nach der Messung an den 405 Wahrheitspunkten (§6c.3) Kandidat für die Stufe.
   */
  climaGrid?: boolean;
  /**
   * AX-10 (`audit/fusion-ausbau.md` §6d; Bericht #14): in Österreich die INCA-Analyse (GeoSphere, 1 km, stündlich, Latenz
   * ≈ 1–1,5 h) am Punkt als zusätzliche Anker-„Messung" — Abstand 0, Gewicht `INCA_ANCHOR_WEIGHT` (set). Voreinstellung
   * aus; `?inca=1` im Panel. Wirkt nur mit `obs` (der Abruf hängt dort an) und nur innerhalb des INCA-Rasters.
   */
  incaAnchor?: boolean;
}

/** AP13: der Anteil der Io-Optionen am Cache-Schlüssel — leer ohne Optionen (byte-gleicher Schlüssel wie bisher). */
export function cubeIoVariantKey(io: CubeIo): string {
  const fuse = io.fuse && Object.keys(io.fuse).length ? io.fuse : null;
  const calib = io.calibSource === 'json' ? 'json' : null;
  const cross = io.crossChunk ? 'cc' : null;
  const lcv = io.landCover && io.z0 ? 'lc' : null;
  const zm = io.z0mod ? 'zm' : null;
  const learned = io.learnedSource === 'json' ? 'learned:json' : null;
  const climaS = io.climaSource === 'json' ? 'clima:json' : null;
  const stackS = io.stackSource === 'json' ? 'stack:json' : null;
  const stage = io.stage === 'fs' ? 'stage:fs' : null;
  // AX-8: ein anderes Stationsprodukt ist ein anderes Produkt — in den Schlüssel (V-FI-80), ohne Option kein Anhang.
  const stS = io.stationSource && io.stationSource !== 'mosmix_l' ? `st:${io.stationSource}` : null;
  const cg = io.climaGrid ? 'cg' : null;
  const inca = io.incaAnchor ? 'inca' : null;
  if (!fuse && !calib && !cross && !lcv && !zm && !learned && !climaS && !stackS && !stage && !stS && !cg && !inca) return '';
  const stable = (o: Record<string, unknown>): string => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  // Ohne `crossChunk` exakt der Schlüssel von AP13 (keine Verschiebung bestehender Einträge).
  return `|io:${fuse ? stable(fuse as Record<string, unknown>) : ''}|calib:${calib ?? ''}${cross ? `|${cross}` : ''}${lcv ? `|${lcv}` : ''}${zm ? `|${zm}` : ''}${learned ? `|${learned}` : ''}${climaS ? `|${climaS}` : ''}${stackS ? `|${stackS}` : ''}${stage ? `|${stage}` : ''}${stS ? `|${stS}` : ''}${cg ? `|${cg}` : ''}${inca ? `|${inca}` : ''}`;
}

/** V-FI-17: so lange (ab Start) wartet der nicht-progressive Modus höchstens auf z0 — nie länger als `OBS_GRACE_MS` nach dem Bündel (set). */
export const Z0_DEADLINE_MS = 6_000;
/** V-FI-17: progressiv kommt z0, das nach der Nachlieferung eintrifft, als eigene Ausgabe — höchstens so lange nach dem Kern (set). */
export const Z0_UPDATE_MAX_MS = 15_000;

/**
 * AP12 (e): so alt darf die Index-Kopie für die erste Antwort sein (set) — die Läufe, auf die sie zeigt, bleiben
 * ≥ 9 h im Repo (Aufbewahrung t1), die Nachprüfung läuft immer mit.
 */
export const INDEX_SWR_MS = 30 * 60_000;

/**
 * AP12 (c): die Ebenen, die buscosun Fusion auf dem Cube-Pfad für die Antwort liest — im Code nachgesehen
 * (18.09.): `cubeSampleOf` trägt die C-LAEF-Quantile `*_q10/_q90` in die Samples, aber weder der Motor noch
 * `output.ts` rechnet mit ihnen (§9.8.1); von den Druckflächen braucht die Ausgabe nur 925 hPa (`belowGround925`
 * aus `belowGroundHPa`). Ohne diese 18 Ebenen ist die Ausgabe byte-gleich (`verify:pv-cube` (15)).
 */
export const CUBE_ANSWER_PLANES: readonly string[] = Object.freeze(
  // AX-7: die Member-Mittel (`_ens`, Schema 6) gehören nicht in die Erstantwort — sie wirken nur mit `ensMember` und kommen mit dem Rest im Hintergrund
  CUBE_PLANES.filter((p) => p.kind !== 'q10' && p.kind !== 'q90' && p.kind !== 'ens' && !['t850', 't700', 'rh850', 'rh700'].includes(p.id)).map((p) => p.id),
);

/**
 * Frist des Messungs-Abrufs (Plan §3.1: 1,5 s ab Start, hart über `AbortSignal.timeout`). Die Antwort
 * wartet auf die Messung höchstens `OBS_GRACE_MS` nach dem Bündel und nie über die Frist hinaus:
 * gemessen 16.09. 22:33 (Desktop, kalt) kam die Messung 0,87–1,05 s nach Start, das Bündel war nach
 * 0,80 s da — mit 250 ms Gnadenfrist verlor Zermatt den Anker um 2 ms. 500 ms (set) deckt das, und
 * warm (Bündel 0,14 s, Messung 0,37 s) kostet die Messung die Antwort ≈ 0,2 s.
 */
export const OBS_DEADLINE_MS = 1_500;
export const OBS_GRACE_MS = 500;
/**
 * Frist der progressiven Produkte AB START (V-FI-16): das 2-s-Ziel minus 200 ms für Rechnung und
 * Ausgabe (gemessen 16.09. 22:33: Algorithmus stündlich p95 116 ms Desktop). Mit einer Frist ab dem
 * KERN (1 500 ms) antwortete München bei 2 256 ms — der Radar-Slot ist am Edge immer MISS (V-FI-7).
 */
export const LATE_DEADLINE_MS = 1_800;

/**
 * Der Browser-Abruf der Messungen: die sechs nächsten Stationen (Live-Pfad-Quellen), als `CubeObs`.
 * AX-1 (V-FS-15): „nächste" heißt seit dem 30.09. wirklich nächste (`NearestObsOptions.near`), und die Station des
 * Punkts (Hinweis) wird in DE nach ihrer WMO-Kennung selbst abgefragt — vorher erreichte an keinem der acht gemessenen
 * Stadtpunkte eine Messung im Umkreis der Stationswert-Tabelle den Cube-Pfad (`audit/fusion-ausbau.md` §1.1).
 */
/** AX-10: was der Messungs-Abruf über die Stationen hinaus tun soll. */
export interface CubeObsFetchOptions {
  /** INCA-Analyse am Punkt als Anker-„Messung" (nur AT, nur im INCA-Raster). */
  inca?: boolean;
  /** Die Uhr des Aufrufers (Verifier/Replay) — Fenster der INCA-Abfrage. */
  nowMs?: number;
}
/**
 * AX-10 (Bericht #14): Gewicht der INCA-Analyse im Anker (set). INCA zieht die Analyse an den Stationen auf die Messung
 * (Fehler dort ≈ 0,3 K), abseits davon bleibt der Modellfehler zum Teil (≈ 1 K, GeoSphere-Verifikation) — die Analyse ist
 * am Punkt, aber keine Messung. 0,6 = zwischen „volle Messung" und „nur Modell"; der Fit (AP10) kann es messen.
 */
export const INCA_ANCHOR_WEIGHT = 0.6;
export const INCA_ANALYSIS_URL = 'https://dataset.api.hub.geosphere.at/v1/timeseries/historical/inca-v1-1h-1km';
/** Stunden vor „jetzt", die die INCA-Abfrage abdeckt (die Analyse erscheint ≈ 1–1,5 h nach der Stunde, gemessen 30.09.). */
export const INCA_ANALYSIS_WINDOW_H = 4;

/** AX-10: die Abbildung der GeoSphere-Zeitreihe → `CubeObs` (rein; der Verifier prüft sie ohne Netz). */
export function incaObsOf(doc: unknown, lat: number, lon: number): CubeObs[] {
  const d = doc as { timestamps?: string[]; features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: { parameters?: Record<string, { data?: Array<number | null> }> } }> } | null;
  const ts = d?.timestamps, f = d?.features?.[0], par = f?.properties?.parameters;
  if (!Array.isArray(ts) || !par) return [];
  const col = (k: string): Array<number | null> => par[k]?.data ?? [];
  const at = (arr: Array<number | null>, i: number): number | null => { const v = arr[i]; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
  const coords = f?.geometry?.coordinates;
  const cLon = coords?.[0] ?? lon, cLat = coords?.[1] ?? lat;
  const out: CubeObs[] = [];
  for (let i = 0; i < ts.length; i++) {
    const validAtMs = Date.parse(ts[i]);
    if (!Number.isFinite(validAtMs)) continue;
    const temperature = at(col('T2M'), i);
    const u = at(col('UU'), i), v = at(col('VV'), i);
    if (temperature == null && u == null && v == null) continue;
    out.push({
      source: 'inca', name: 'INCA-Analyse (GeoSphere, 1 km)', lat: cLat, lon: cLon, elevM: null,
      distanceM: 0, validAtMs, temperature, relativeHumidity: at(col('RH2M'), i), u, v, gust: null,
      dewPoint: at(col('TD2M'), i), weight: INCA_ANCHOR_WEIGHT,
    });
  }
  return out;
}

/** AX-10: die INCA-Analyse der letzten Stunden am Punkt — leer außerhalb des Rasters, bei HTTP-Fehler oder Abbruch. */
export async function fetchIncaAnalysisObs(lat: number, lon: number, nowMs: number, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<CubeObs[]> {
  if (lat < INCA_BOUNDS.latMin || lat > INCA_BOUNDS.latMax || lon < INCA_BOUNDS.lngMin || lon > INCA_BOUNDS.lngMax) return [];
  const stamp = (ms: number): string => new Date(Math.floor(ms / H) * H).toISOString().slice(0, 16);
  const url = INCA_ANALYSIS_URL + '?parameters=T2M,TD2M,RH2M,UU,VV&lat_lon=' + lat.toFixed(4) + ',' + lon.toFixed(4)
    + '&start=' + stamp(nowMs - INCA_ANALYSIS_WINDOW_H * H) + '&end=' + stamp(nowMs);
  const res = await fetchImpl(url, { signal });
  if (!res.ok) return [];
  return incaObsOf(await res.json(), lat, lon);
}

export async function fetchCubeObs(lat: number, lon: number, country: Country, signal: AbortSignal, hint?: CubeObsHint, opts?: CubeObsFetchOptions): Promise<CubeObs[]> {
  const { fetchNearestStationObs } = await import('./sampleSources');
  const st = hint?.station ? { id: hint.station.id, lat: hint.station.lat, lon: hint.station.lon } : null;
  // AX-10: die INCA-Analyse parallel zu den Stationen — ein Scheitern dort kostet keine Messung (die Notiz benennt es).
  const incaP: Promise<CubeObs[]> = opts?.inca && country === 'AT' ? fetchIncaAnalysisObs(lat, lon, opts.nowMs ?? Date.now(), signal).catch(() => []) : Promise.resolve([]);
  const list = await fetchNearestStationObs(lat, lon, country, 6, signal, { near: true, station: st });
  return [...cubeObsOf(list, Date.now()), ...(await incaP)];
}

/** AX-1: die Abbildung Stationsliste → `CubeObs` (rein; der Verifier prüft sie ohne Netz). */
export function cubeObsOf(list: ReadonlyArray<{ source: string; name?: string; stationId?: string; byStation?: boolean; lat: number; lng: number; elevation: number; distanceMeters: number; point: unknown }>, nowMs: number): CubeObs[] {
  const out: CubeObs[] = [];
  for (const s of list) {
    // Der Live-Pfad nimmt die Messung als „jetzt gültig" (`stationsToHour0Samples`); der Anker paart sie
    // mit dem Cube-Schritt im selben Stundenraster, also zählt der Messzeitpunkt, wenn er da ist (DE seit AX-1).
    const p = s.point as { timestamp?: Date; temperature?: number | null; relativeHumidity?: number | null; u?: number | null; v?: number | null; gust?: number | null; name?: string; stationName?: string };
    const t = p.timestamp instanceof Date && Number.isFinite(p.timestamp.getTime()) ? p.timestamp.getTime() : nowMs;
    out.push({
      source: s.source, name: s.name ?? p.name ?? p.stationName, lat: s.lat, lon: s.lng, elevM: Number.isFinite(s.elevation) ? s.elevation : null, distanceM: s.distanceMeters, validAtMs: t,
      temperature: p.temperature ?? null, relativeHumidity: p.relativeHumidity ?? null, u: p.u ?? null, v: p.v ?? null, gust: p.gust ?? null,
      ...(s.stationId ? { stationId: s.stationId } : {}), ...(s.byStation ? { byStation: true } : {}),
    });
  }
  return out;
}

/** AX-1: der Hinweis für den Messungs-Abruf aus dem Bündel — die Station des Stationsprodukts, wenn eine gewählt ist. */
export function obsHintOf(b: PointBundle): CubeObsHint {
  const s = b.station?.station;
  return { station: s ? { id: s.id, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev } : null };
}

let browserBackend: CacheBackend | null = null;
let browserStore: PointStore | null = null;

/** Die Voreinstellung im Browser: IndexedDB-Cache vor dem CDN-Store, Browser-PNG-Dekoder, Zwei-Skalen-DEM. */
export function defaultCubeIo(): CubeIo {
  if (!browserBackend) browserBackend = idbBackend() ?? memoryBackend();
  if (!browserStore) browserStore = cachedStore(httpStore({ timeoutMs: 8_000 }), browserBackend, { swrIndex: true });
  return {
    store: browserStore,
    decodePng: decodeGrayPngBrowser,
    terrain: { decodeRgba: decodeRgbaPngBrowser, cache: browserBackend },
    clima: getClimaField,
    obs: fetchCubeObs,
    lateDeadlineMs: LATE_DEADLINE_MS,
    indexSwrMs: INDEX_SWR_MS,
    z0: { cache: browserBackend, timeoutMs: 8_000 },
    // Phase FS (Jan, 28.09.): wer buscosun Fusion auf dem Cube abfragt, bekommt die neueste Stufe — Lernstufe (Fit 5e) mit
    // Klimatologieprodukt, beide Korrekturen, Bewölkung durchgereicht, Stationswert. Jede Datei nie blockierend; fehlt sie im
    // Daten-Repo, rechnet der Pfad ohne diesen Teil und nennt es.
    learnedSource: 'json', climaSource: 'json', stackSource: 'json', stage: 'fs',
    // AX-9: `?cg=1` liest das Klimagitter (Voreinstellung aus, Schlüssel unverändert).
    ...(climaGridFlag ? { climaGrid: true } : {}),
    // AX-10: `?inca=1` — INCA-Analyse als Anker in AT (Voreinstellung aus).
    ...(incaFlag ? { incaAnchor: true } : {}),
    // AX-8: `?st=s` / `?st=fresh` schalten das Stationsprodukt um; ohne Schalter MOSMIX-L (kein Eintrag, Schlüssel unverändert).
    ...(stationSourceFlag !== 'mosmix_l' ? { stationSource: stationSourceFlag } : {}),
  };
}
const stationSourceFlag = pfStationSourceFrom(typeof window !== 'undefined' ? window.location.search : '');
const climaGridFlag = pfClimaGridFrom(typeof window !== 'undefined' ? window.location.search : '');
const incaFlag = pfIncaAnchorFrom(typeof window !== 'undefined' ? window.location.search : '');

interface CubeCacheEntry { hours: number; forecast: PointForecast; ts: number; update?: Promise<PointForecast | null> }
const CUBE_CACHE = new Map<string, CubeCacheEntry>();
const CUBE_CACHE_TTL_MS = 180_000;
const CUBE_CACHE_MAX = 32;
const CUBE_HOURS_MAX = 336;

/**
 * AP12: im progressiven Modus startet der Messungs-Abruf erst mit dem Kern — gemessen 18.09. auf Mobil-4G
 * kostete er den Kern ≈ 160 ms Leitung und kam wegen seiner Frist (1,5 s ab Start) fast nie an. Ab dem Kern
 * hat er die Leitung für sich und eine eigene Frist (set): sie begrenzt nur, wie lange die Nachlieferung wartet.
 */
export const OBS_PROGRESSIVE_DEADLINE_MS = 4_000;
/** AP12: so lange nach der ersten Ausgabe sammelt der progressive Modus, was noch kommt — dann EINE zweite Ausgabe (set). */
export const UPDATE_WAIT_MS = 6_000;

/** Bündel + Klimatologie + Messungen → `PointForecast` mit `cube`-Block (AP2–AP8); `obsNotes` sagen, warum ohne Anker. */
function forecastFromBundle(
  bundle: PointBundle, clima: ClimaField | null, obs: CubeObs[] | null, obsNotes: string[], opts: PointForecastOptions, io: CubeIo,
  t: { T0: number; nowMs: number; obsMs: number | null; emission?: 'first' | 'core' | 'update'; pending?: string[]; calib?: LoadedCalib | null; learned?: LoadedLearned | null; climaProduct?: LoadedClimaProduct | null; stack?: LoadedStack | null },
  z0: Z0AtPoint | null = null,
): PointForecast {
  const input = cubeInputFromBundle(bundle, clima, obs);
  input.country = opts.country ?? null;   // AX-5: der Stationswert kennt das Land des Punkts
  input.notes.push(...obsNotes);
  if (t.calib) input.notes.push(...t.calib.notes);
  // FL-AP5: die gelernten Tabellen (nur mit `learnedSource: 'json'`); ohne Datei bleibt die Option an und sagt es.
  if (t.learned) { input.notes.push(...t.learned.notes); input.learned = t.learned.tables; }
  // Phase FX-5: das Klimatologieprodukt (nur mit `climaSource: 'json'`); ohne Datei rechnet die station-Tabelle ohne μ_c und sagt es.
  if (t.climaProduct) { input.notes.push(...t.climaProduct.notes); input.learnedClima = t.climaProduct.product; }
  // Phase FS: die Tabelle des Stationswerts; die Stufe `fs` schaltet, was die vorhandenen Tabellen tragen.
  if (t.stack) { input.notes.push(...t.stack.notes); input.stack = t.stack.table; }
  const stageFuse: Partial<FuseCubeOptions> = {};
  if (io.stage === 'fs') {
    if (t.learned?.tables) {
      Object.assign(stageFuse, { learnedSpeed: true, learnedPrecip: true, learnedAtPoint: true, learnedClouds: true, priorShrink: false });
      if (t.stack?.table) stageFuse.stationValue = true;
      input.notes.push(`stage:fs — neueste Stufe: Lernstufe mit learnedSpeed, learnedPrecip, learnedAtPoint, learnedClouds, ohne Klimatologie-Schritt${t.stack?.table ? ', Stationswert' : '; ohne Stationswert (keine Tabelle)'}`);
    } else input.notes.push('stage:fs — keine gelernten Tabellen ⇒ Rechnung wie ohne die Stufe (keine ihrer Optionen ist ohne Lernstufe gemessen)');
    // Phase AX, AX-3 (E-AX-3): T zwischen den nativen Schritten als Anomalie gegen μ_c — braucht nur das Klimatologieprodukt
    // (Orakel: 6-h-Schritte −15,5 %, 3-h −4,1 % MAE; `audit/fusion-ausbau.md` §3). Ohne Produkt linear wie bisher, benannt.
    if (t.climaProduct?.product) { stageFuse.anomalyInterp = true; input.notes.push('stage:fs — Interpolation der Temperatur als Anomalie gegen den Tagesgang μ_c (AX-3)'); }
  }
  if (z0) input.z0 = z0;
  if (io.terrainOverride !== undefined) {
    input.terrain = io.terrainOverride;
    input.elevationM = input.elevationM ?? io.terrainOverride?.elevationM ?? null;
  }
  // AP13 (V-FI-79): die Optionen des Aufrufers und die gemessene Kalibrierung; ohne beide exakt der Aufruf von vorher.
  const result = fuseCubePoint(input, { ...stageFuse, ...(io.fuse ?? {}), ...(t.calib?.overrides ? { calib: t.calib.overrides } : {}), ...(t.learned ? { learned: true } : {}), hourly: true, tail: true });
  const v2 = toPointForecastV2(result, {
    ...(t.calib ? { calibFile: { path: t.calib.path, schema: t.calib.schema, hash: t.calib.hash, measured: t.calib.overrides ? Object.keys(t.calib.overrides.meta) : [] } } : {}),
    nowMs: t.nowMs, terrainSource: io.terrainOverride !== undefined ? (io.terrainOverride ? 'override' : 'none') : (input.terrain ? 'terrarium-z11+z8' : 'none'),
    urban: input.urban,
    ...(z0 && z0.z0True != null ? { z0: z0.z0True } : {}),
    ...(isLandCover(z0) ? { dWater: z0.landCover.dWater } : {}),
    fetched: { files: bundle.stats?.files ?? null, bytes: bundle.stats?.bytes ?? null, ms: bundle.timing.readMs },
    timing: { readMs: bundle.timing.readMs, terrainMs: bundle.timing.doneAt.terrain ?? null, decodeMs: null, totalMs: null },
  });
  const summary: CubePathSummary = {
    schema: 'fi-ap2',
    axis: result.axis, provenance: result.provenance,
    flags: result.steps.filter((s) => s.flags.length).map((s) => ({ validAtMs: s.validAtMs, tier: s.tier, flags: s.flags })),
    // Kopien: im progressiven Modus schreibt der Leser nach der ersten Ausgabe weiter in dieselben Listen.
    calib: result.calib, notes: result.notes, skips: [...bundle.skips], errors: [...bundle.errors],
    timing: {
      readMs: bundle.timing.readMs, coreMs: bundle.timing.coreMs, firstMs: bundle.timing.firstMs,
      algoMs: result.timing.algoMs, outputMs: v2.timing.outputMs, totalMs: Math.round(now() - t.T0),
      doneAt: { ...bundle.timing.doneAt, ...(t.obsMs == null ? {} : { obs: t.obsMs }), ...(z0?.fetched ? { z0: Math.round(z0.fetched.ms) } : {}) },
    },
    stats: { ...bundle.stats },
    v2,
    ...(t.emission ? { emission: t.emission, pending: t.pending ?? [] } : {}),
    cells: cubeCellRows(result.steps),
  };
  v2.timing.totalMs = summary.timing.totalMs;
  return toPointForecast(result, opts, { fetchedAt: Date.now(), cube: summary });
}

/**
 * AP16: die Notiz für einen noch laufenden (oder gescheiterten) z0-Abruf. Trägt schon ein z0 aus dem Cache (alter
 * `z0:v1`-Eintrag, nur mit `landCover`), folgt nur die Landbedeckung — die Windkorrektur wirkt bereits. Ohne `landCover`
 * ist `z0c` hier immer `null` ⇒ exakt die Notiz von vorher.
 */
function z0PendingNote(io: CubeIo, z0c: Z0AtPoint | null, why: 'missing' | 'follows'): string[] {
  if (z0c && z0c.z0True != null) {
    return [why === 'follows'
      ? 'z0: Landbedeckung (κ, Zellboxen, d_water) folgt — z0 aus dem Cache wirkt schon (AP16)'
      : 'z0: Landbedeckung nicht verfügbar (Spiegel ohne Kachel oder Abruf gescheitert) — z0 aus dem Cache wirkt, ohne κ/d_water (AP16)'];
  }
  return z0NoteOf(io, null, why);
}

/** V-FI-17: die z0-Notiz, wenn z0 konfiguriert ist, aber nicht trägt (`null` = keine Notiz). */
function z0NoteOf(io: CubeIo, z0: Z0AtPoint | null, why: 'late' | 'missing' | 'follows'): string[] {
  if (!io.z0 || (z0 && z0.z0True != null)) return [];
  if (why === 'follows') return ['z0: WorldCover-Rauhigkeit folgt (progressiv: Abruf ab dem Kern) — diese Ausgabe ohne zweistufige Windkorrektur'];
  if (why === 'late') return [`z0: WorldCover-Rauhigkeit nicht rechtzeitig (Frist ${Z0_DEADLINE_MS} ms ab Start, ${OBS_GRACE_MS} ms nach dem Bündel) — ohne zweistufige Windkorrektur, Abruf läuft weiter (Cache)`];
  return ['z0: WorldCover-Rauhigkeit nicht verfügbar (Spiegel ohne Kachel, Abruf gescheitert oder Abdeckung < 50 %) — ohne zweistufige Windkorrektur'];
}

/** Die Anker-Notiz, wenn die Messung nicht trägt (dieselben Sätze in beiden Modi). */
function obsNoteOf(io: CubeIo, obs: CubeObs[] | null, obsMs: number, deadlineMs: number, country?: Country): string[] {
  if (!io.obs) return ['anchor: kein Messungs-Abruf konfiguriert — kein Anker'];
  if (obs == null) return [`anchor: Messungs-Abruf gescheitert oder abgebrochen (${obsMs} ms) — kein Anker`];
  // AX-10: Option an, aber keine INCA-Analyse in der Liste — nur in AT eine Aussage (sonst gilt die Option nicht).
  if (io.incaAnchor && country === 'AT' && !obs.some((o) => o.source === 'inca')) {
    return [...(obs.length ? [] : [`anchor: keine Messung erhalten (${obsMs} ms) — kein Anker`]), 'incaAnchor: Option an, aber keine INCA-Analyse erhalten (Abruf leer, gescheitert, zu langsam oder Punkt außerhalb des INCA-Rasters) ⇒ Anker nur aus Stationen'];
  }
  if (!obs.length) return [`anchor: keine Messung erhalten (${obsMs} ms — keine Station in Reichweite oder Abruf nach ${deadlineMs} ms abgebrochen; der Abruf liefert dann eine leere Liste) — kein Anker`];
  return [];
}

function cacheForecast(key: string, hours: number, forecast: PointForecast, opts: PointForecastOptions, update?: Promise<PointForecast | null>): void {
  // Wie beim Live-Pfad: ein leeres oder quellenloses Ergebnis kommt nicht in den Cache.
  if (forecast.hours.length && forecast.sourcesAvailable.length && !opts.signal?.aborted) {
    CUBE_CACHE.set(key, { hours, forecast, ts: Date.now(), ...(update ? { update } : {}) });
    if (CUBE_CACHE.size > CUBE_CACHE_MAX) { const k = CUBE_CACHE.keys().next().value; if (k !== undefined) CUBE_CACHE.delete(k); }
  }
}

export async function getPointForecastFromCube(opts: PointForecastOptions, io: CubeIo = defaultCubeIo()): Promise<PointForecast> {
  const T0 = now();
  const { lat, lng: lon, country } = opts;
  const hours = Math.min(CUBE_HOURS_MAX, Math.max(1, opts.hours ?? CUBE_HOURS_MAX));
  const withRadar = opts.includeRadarNowcast !== false;
  const progressive = typeof opts.onUpdate === 'function';
  // AP13 (V-FI-79): die Io-Optionen gehören in den Schlüssel — ohne Optionen bleibt er wie bisher.
  // V-FI-80: mit eingespeister Uhr (Nachlauf, Sammler, Verifier) auch die Stunde — sonst bekäme ein Nachlauf, der
  // denselben Punkt für zwei Slots binnen 180 s rechnet, das Ergebnis des ersten Slots. Der Browser speist keine Uhr
  // ein (`defaultCubeIo`) ⇒ sein Schlüssel bleibt byte-gleich.
  const key = pfCacheKey(lat, lon, country, withRadar, false, true, false, true) + cubeIoVariantKey(io)
    + (io.nowMs ? `|now:${Math.floor(io.nowMs() / H)}` : '');
  const hit = CUBE_CACHE.get(key);
  if (hit && hit.hours >= hours && Date.now() - hit.ts < CUBE_CACHE_TTL_MS) {
    // AP12: kam der Treffer aus einer ersten Ausgabe, deren Nachlieferung noch läuft, bekommt auch dieser Aufrufer sie.
    if (progressive && hit.update) hit.update.then((fc) => { if (fc && !opts.signal?.aborted) opts.onUpdate!(fc); }, () => {});
    return hit.forecast;
  }

  const nowMs = io.nowMs ? io.nowMs() : Date.now();
  const t0Ms = Math.floor(nowMs / H) * H;
  // AP7: die Messung für den Anker läuft nebenher, mit harter Frist — und die Antwort wartet
  // höchstens OBS_GRACE_MS nach dem Bündel auf sie (nie auf dem kritischen Pfad).
  // AP12: im progressiven Modus startet sie erst mit dem Kern (unten).
  const obsT0 = now();
  const obsP: Promise<CubeObs[] | null> = io.obs && !progressive
    ? io.obs(lat, lon, country, AbortSignal.timeout(OBS_DEADLINE_MS), undefined, { inca: !!io.incaAnchor, nowMs }).catch(() => null)
    : Promise.resolve(null);
  const climaP = io.clima().catch(() => null);
  // AP13: `calib.json` parallel zum Index — nie blockierend. Entschieden wird EINMAL, bei der ersten Ausgabe;
  // alle weiteren Ausgaben dieser Abfrage rechnen mit derselben Entscheidung (kein σ-Sprung in der Nachlieferung).
  let calibVal: LoadedCalib | null | undefined;
  const calibP: Promise<unknown> | null = io.calibSource === 'json'
    ? loadCalib(io.store, opts.signal ? { signal: opts.signal } : {}).then((c) => { calibVal = c; }, () => { calibVal = null; })
    : null;
  // FL-AP5: die gelernten Tabellen — derselbe Weg wie calib.json (parallel, nie blockierend, eine Entscheidung je Abfrage).
  let learnedVal: LoadedLearned | null | undefined;
  const learnedP: Promise<unknown> | null = io.learnedSource === 'json'
    ? loadLearned(io.store, { nowMs, ...(opts.signal ? { signal: opts.signal } : {}) }).then((c) => { learnedVal = c; }, () => { learnedVal = null; })
    : null;
  let learnedUsed: LoadedLearned | null | undefined;
  const learnedNow = (): LoadedLearned | null => {
    if (learnedUsed !== undefined) return learnedUsed;
    learnedUsed = !learnedP ? null : (learnedVal ?? {
      path: POINT_LEARNED_PATH, hash: null, tables: null,
      notes: [learnedVal === null ? 'learned: Lesen gescheitert — Rechnung ohne Lernstufe' : 'learned: fusion.client.json bei der ersten Ausgabe noch nicht da — Rechnung ohne Lernstufe (nie blockierend)'],
    });
    return learnedUsed;
  };
  // Phase FX-5: das Klimatologieprodukt — derselbe Weg (parallel, nie blockierend, eine Entscheidung je Abfrage).
  let climaProdVal: LoadedClimaProduct | null | undefined;
  const climaProdP: Promise<unknown> | null = io.climaSource === 'json'
    ? loadClimaProduct(io.store, opts.signal ? { signal: opts.signal } : {}).then((c) => { climaProdVal = c; }, () => { climaProdVal = null; })
    : null;
  let climaProdUsed: LoadedClimaProduct | null | undefined;
  const climaProductNow = (): LoadedClimaProduct | null => {
    if (climaProdUsed !== undefined) return climaProdUsed;
    climaProdUsed = !climaProdP ? null : (climaProdVal ?? {
      path: POINT_CLIMA_PATH, hash: null, product: null,
      notes: [climaProdVal === null ? 'learnedClima: Lesen gescheitert — station-Tabelle ohne μ_c' : 'learnedClima: stations.json bei der ersten Ausgabe noch nicht da — station-Tabelle ohne μ_c (nie blockierend)'],
    });
    return climaProdUsed;
  };
  // Phase FS: die Tabelle des Stationswerts — derselbe Weg.
  let stackVal: LoadedStack | null | undefined;
  const stackP: Promise<unknown> | null = io.stackSource === 'json'
    ? loadStack(io.store, { nowMs, ...(opts.signal ? { signal: opts.signal } : {}) }).then((c) => { stackVal = c; }, () => { stackVal = null; })
    : null;
  let stackUsed: LoadedStack | null | undefined;
  const stackNow = (): LoadedStack | null => {
    if (stackUsed !== undefined) return stackUsed;
    stackUsed = !stackP ? null : (stackVal ?? {
      path: POINT_STACK_PATH, hash: null, table: null,
      notes: [stackVal === null ? 'stationValue: Lesen gescheitert — Rechnung ohne Stationswert' : 'stationValue: stack.client.json bei der ersten Ausgabe noch nicht da — Rechnung ohne Stationswert (nie blockierend)'],
    });
    return stackUsed;
  };
  let calibUsed: LoadedCalib | null | undefined;
  const calibNow = (): LoadedCalib | null => {
    if (calibUsed !== undefined) return calibUsed;
    calibUsed = !calibP ? null : (calibVal ?? {
      path: POINT_CALIB_PATH, schema: null, hash: null, overrides: null,
      notes: [calibVal === null ? 'calib: Lesen gescheitert — Setzungen' : 'calib: calib.json bei der ersten Ausgabe noch nicht da — Setzungen (nie blockierend)'],
    });
    return calibUsed;
  };
  // V-FI-17: z0 — nicht-progressiv parallel (mit Frist), progressiv zuerst nur aus dem Cache (ein bekannter Ort wirkt
  // schon in der ersten Ausgabe), der Netzabruf startet dort erst mit dem Kern.
  const z0T0 = now();
  // AP16: mit `landCover` derselbe Weg über `loadLandCoverAtPoint` (dieselben Kacheln, Landbedeckung dazu).
  const loadZ0 = io.landCover ? loadLandCoverAtPoint : loadZ0AtPoint;
  /** z0 fehlt noch — oder (nur mit `landCover`) es kam aus dem alten Cache-Eintrag, und die Landbedeckung fehlt. */
  const z0Missing = (z: Z0AtPoint | null) => !z || (!!io.landCover && !isLandCover(z));
  // Nicht-progressiv mit `landCover`: scheitert der Abruf, trägt ein alter z0-Eintrag weiter (z0 geht nie verloren).
  const z0P: Promise<Z0AtPoint | null> = io.z0
    ? (io.landCover && !progressive
      ? loadLandCoverAtPoint(lat, lon, { ...io.z0, ...(opts.signal ? { signal: opts.signal } : {}) }).then((r) => r ?? loadZ0AtPoint(lat, lon, { ...io.z0!, cacheOnly: true }))
      : loadZ0(lat, lon, { ...io.z0, ...(progressive ? { cacheOnly: true } : {}), ...(opts.signal ? { signal: opts.signal } : {}) })).catch(() => null)
    : Promise.resolve(null);
  // AP12 (E-F-3 (a)): im progressiven Modus die erste Darstellung aus der ersten Stufe, sobald sie da ist —
  // nur, wenn sie vor dem Kern fertig ist (sonst ist der Kern die erste Ausgabe).
  let coreIn = false;
  let resolvePaint!: (fc: PointForecast) => void;
  const paintP = new Promise<PointForecast>((r) => { resolvePaint = r; });
  const onFirst = progressive ? (b1: PointBundle) => {
    void Promise.all([climaP, z0P]).then(([clima, z0c]) => {
      if (coreIn || opts.signal?.aborted) return;
      const all = b1.index ? tiersForWindow(b1.index, t0Ms, t0Ms + hours * H) : [];
      const pending = [...all.filter((t) => !b1.tiers.includes(t)), ...(io.obs ? ['anchor'] : [])];
      try {
        resolvePaint(forecastFromBundle(b1, clima, null, [...(io.obs ? [`anchor: Messung folgt (progressiv: Abruf ab dem Kern, Frist ${OBS_PROGRESSIVE_DEADLINE_MS} ms) — erste Ausgabe ohne Anker`] : []), ...(io.z0 && z0Missing(z0c) ? z0PendingNote(io, z0c, 'follows') : z0NoteOf(io, z0c, 'follows'))],
          opts, io, { T0, nowMs, obsMs: null, emission: 'first', pending: [...pending, ...(io.z0 && z0Missing(z0c) ? ['z0'] : [])], calib: calibNow(), learned: learnedNow(), climaProduct: climaProductNow(), stack: stackNow() }, z0c));
      } catch { /* die erste Darstellung ist ein Angebot — der Kern kommt ohnehin */ }
    });
  } : undefined;
  const bundleP = readPointBundle(
    { lat, lon, nowMs, fromMs: t0Ms, toMs: t0Ms + hours * H, stepH: 1 },
    {
      store: io.store, decodePng: io.decodePng, nowcast: withRadar, terrain: io.terrain, plan: false, neighbours: true, lateDeadlineMs: io.lateDeadlineMs,
      ...(io.crossChunk ? { crossChunk: true } : {}),
      ...(io.z0mod ? { z0mod: true } : {}),
      ...(io.stationSource && io.stationSource !== 'mosmix_l' ? { stationSource: io.stationSource } : {}),
      ...(io.climaGrid ? { climaGrid: true } : {}),
      ...(progressive ? { progressive: true, onFirst, ...(io.indexSwrMs ? { indexSwrMs: io.indexSwrMs } : {}) } : {}),
      ...(io.planeRanges ? { planeRanges: CUBE_ANSWER_PLANES } : {}),
    },
  ).then((b) => { coreIn = true; return b; });
  const LATE = Symbol('late');

  if (!progressive) {
    const [bundle, clima] = await Promise.all([bundleP, climaP]);
    if (opts.signal?.aborted) throw Object.assign(new Error('abgebrochen'), { name: 'AbortError' });
    // Warten bis min(Bündel + Gnadenfrist, Frist ab Start) — und gar nicht, wenn das Bündel selbst später kam.
    const obsWaitMs = Math.max(0, Math.min(OBS_GRACE_MS, OBS_DEADLINE_MS - (now() - obsT0)));
    const obsR = await Promise.race([obsP, new Promise<typeof LATE>((r) => setTimeout(() => r(LATE), obsWaitMs))]);
    const obs = obsR === LATE ? null : obsR;
    const obsMs = Math.round(now() - obsT0);
    const notes = obsR === LATE
      ? [`anchor: Messung nach ${obsMs} ms noch nicht da (Frist ${OBS_DEADLINE_MS} ms ab Start, Gnadenfrist ${OBS_GRACE_MS} ms nach dem Bündel) — kein Anker`]
      : obsNoteOf(io, obs, obsMs, OBS_DEADLINE_MS, country);
    // V-FI-17: z0 mit derselben Regel wie die Messung — höchstens die Gnadenfrist nach dem Bündel, nie über die Frist.
    let z0: Z0AtPoint | null = null;
    if (io.z0) {
      const z0WaitMs = Math.max(0, Math.min(OBS_GRACE_MS, Z0_DEADLINE_MS - (now() - z0T0)));
      const z0R = await Promise.race([z0P, new Promise<typeof LATE>((r) => setTimeout(() => r(LATE), z0WaitMs))]);
      z0 = z0R === LATE ? null : z0R;
      notes.push(...z0NoteOf(io, z0, z0R === LATE ? 'late' : 'missing'));
      if (io.landCover && z0 && !isLandCover(z0)) notes.push(...z0PendingNote(io, z0, 'missing'));
    }
    // AP13: nicht-progressiv (Sammler, Nachlauf) wartet auf calib höchstens die Gnadenfrist — wie auf die Messung.
    if (calibP && calibVal === undefined) await Promise.race([calibP, new Promise((r) => setTimeout(r, OBS_GRACE_MS))]);
    if (learnedP && learnedVal === undefined) await Promise.race([learnedP, new Promise((r) => setTimeout(r, OBS_GRACE_MS))]);
    if (stackP && stackVal === undefined) await Promise.race([stackP, new Promise((r) => setTimeout(r, OBS_GRACE_MS))]);
    const forecast = forecastFromBundle(bundle, clima, obs, notes, opts, io, { T0, nowMs, obsMs, calib: calibNow(), learned: learnedNow(), climaProduct: climaProductNow(), stack: stackNow() }, z0);
    cacheForecast(key, hours, forecast, opts);
    return forecast;
  }

  // ── AP12: progressiv — (1) erste Darstellung (erste Stufe, s. oben) oder der Kern, (2) der Kern, wenn (1)
  //    die erste Stufe war, (3) EINE Nachlieferung mit Radar/Anker/statischen Produkten ──
  const coreAndLate = (bundle: PointBundle, clima: ClimaField | null, emission: 'first' | 'core', z0c: Z0AtPoint | null): PointForecast => {
    const obs2T0 = now();
    // AX-1: der Abruf kennt jetzt die Station des Punkts (das Bündel ist da) und holt deren eigene Messung mit.
    const obs2P: Promise<CubeObs[] | null> = io.obs
      ? io.obs(lat, lon, country, AbortSignal.timeout(OBS_PROGRESSIVE_DEADLINE_MS), obsHintOf(bundle), { inca: !!io.incaAnchor, nowMs }).catch(() => null)
      : Promise.resolve(null);
    // V-FI-17: kein Cache-Treffer ⇒ der Netzabruf startet jetzt, mit dem Kern (die Leitung ist frei), und wirkt in der Nachlieferung.
    const z0NetP: Promise<Z0AtPoint | null> | null = io.z0 && z0Missing(z0c)
      ? loadZ0(lat, lon, { ...io.z0, ...(opts.signal ? { signal: opts.signal } : {}) }).catch(() => null)
      : null;
    const late = bundle.late ?? {};
    const pending = [...(io.obs ? ['anchor'] : []), ...(late.nowcast ? ['nowcast'] : []), ...(late.static ? ['static'] : []), ...(z0NetP ? ['z0'] : []), ...(late.crossChunk ? ['crossChunk'] : [])];
    // AP14: Nachbar-Chunks als EIGENE Ausgabe (Muster z0Later). Sind sie da, trägt jede spätere Ausgabe sie mit; die
    // eigene Ausgabe rechnet mit dem letzten Stand (Nachlieferung, z0), damit nichts zurückfällt.
    let crossVal: CrossChunkResult | undefined;
    const crossSkip = late.crossChunk?.skip ?? null;
    const cur = (b: PointBundle): PointBundle => (crossVal ? { ...withCrossChunk(b, crossVal), skips: b.skips.filter((x) => x !== crossSkip) } : b);
    const stillOf = (xs: string[]) => (crossVal ? xs.filter((x) => x !== 'crossChunk') : xs);
    let last: { b: PointBundle; obs: CubeObs[] | null; notes: string[]; still: string[]; z0: Z0AtPoint | null } | null = null;
    const firstNotes = [...(io.obs
      ? [`anchor: Messung folgt (progressiv: Abruf ab dem Kern, Frist ${OBS_PROGRESSIVE_DEADLINE_MS} ms) — erste Ausgabe ohne Anker`]
      : obsNoteOf(io, null, 0, OBS_PROGRESSIVE_DEADLINE_MS, country)), ...(z0NetP ? z0PendingNote(io, z0c, 'follows') : [])];
    const core = forecastFromBundle(bundle, clima, null, firstNotes, opts, io, { T0, nowMs, obsMs: null, emission, pending, calib: calibNow(), learned: learnedNow(), climaProduct: climaProductNow(), stack: stackNow() }, z0c);
    last = { b: bundle, obs: null, notes: firstNotes, still: pending, z0: z0c };
    if (late.crossChunk) {
      void late.crossChunk.result.then((r) => {
        crossVal = r;
        const said = Object.entries(r).filter(([, x]) => x?.cells.length).map(([t, x]) => `${t} +${x!.chunks.length} Chunk (${x!.chunks.join(', ')}), ${x!.cells.length} Zellen`).join(' · ');
        if (!said || opts.signal?.aborted || !last) return;   // nichts gewonnen (Abruf gescheitert, benannt im Bündel) ⇒ keine Ausgabe
        const L = last;
        const notesX = [...L.notes, `crossChunk: ${said} — 2×2-Block über die Chunk-Grenze, eigene Ausgabe (AP14)`];
        const fc4 = forecastFromBundle(cur(L.b), clima, L.obs, notesX, opts, io,
          { T0, nowMs, obsMs: Math.round(now() - T0), emission: 'update', pending: stillOf(L.still), calib: calibNow(), learned: learnedNow(), climaProduct: climaProductNow(), stack: stackNow() }, L.z0);
        last = { ...L, notes: notesX, still: stillOf(L.still) };
        cacheForecast(key, hours, fc4, opts);
        opts.onUpdate!(fc4);
      }).catch(() => { /* ohne Nachbar-Chunks bleibt der beschnittene Block stehen, benannt */ });
    }
    // V-FI-17: z0 wartet NICHT in der Nachlieferung mit — gemessen 18.09. (Mobil-4G, kalt, alle WorldCover-Abrufe
    // MISS) verschob das Mitwarten Anker und Radar um ≈ 0,9 s (p50). Ist z0 zur Nachlieferung fertig, reist es mit;
    // sonst folgt es als eigene, letzte Ausgabe (höchstens `Z0_UPDATE_MAX_MS` nach dem Kern).
    let z0Val: Z0AtPoint | null | undefined;
    if (z0NetP) void z0NetP.then((z) => { z0Val = z; });
    const z0Later = (b: PointBundle, obsX: CubeObs[] | null, notesX: string[], stillX: string[]) => {
      if (!z0NetP || z0Val !== undefined) return;
      const cap = new Promise<null>((r) => setTimeout(() => r(null), Z0_UPDATE_MAX_MS));
      void Promise.race([z0NetP, cap]).then((z) => {
        if (!z || z.z0True == null || opts.signal?.aborted) return;
        const notes3 = notesX.filter((n) => !n.startsWith('z0: '));
        const still3 = stillOf(stillX.filter((x) => x !== 'z0'));
        const fc3 = forecastFromBundle(cur(b), clima, obsX, notes3, opts, io,
          { T0, nowMs, obsMs: Math.round(now() - T0), emission: 'update', pending: still3, calib: calibNow(), learned: learnedNow(), climaProduct: climaProductNow(), stack: stackNow() }, z);
        last = { b, obs: obsX, notes: notes3, still: still3, z0: z };
        cacheForecast(key, hours, fc3, opts);
        opts.onUpdate!(fc3);
      }).catch(() => { /* ohne z0 bleibt die letzte Ausgabe stehen */ });
    };
    const update: Promise<PointForecast | null> = (async () => {
      const until = new Promise<typeof LATE>((r) => setTimeout(() => r(LATE), UPDATE_WAIT_MS));
      const [obsR, ncR, stR] = await Promise.all([
        Promise.race([obs2P, until]),
        late.nowcast ? Promise.race([late.nowcast.result, until]) : Promise.resolve(undefined),
        late.static ? Promise.race([late.static.result, until]) : Promise.resolve(undefined),
      ]);
      await Promise.resolve();   // ein schon fertiges z0 hat seinen `then` oben gerade gesetzt
      if (opts.signal?.aborted) return null;
      const obs = obsR === LATE ? null : obsR;
      const obsMs = Math.round(now() - obs2T0);
      // Fertig heißt nicht „mit Ergebnis": ein Radar-Abruf ohne Slot endet mit [] (und der Leser hat seinen Grund
      // schon in `skips` geschrieben) — dann fällt die Notiz „folgt" weg, eine zweite Ausgabe löst er allein nicht aus.
      const ncDone = ncR !== undefined && ncR !== LATE;
      const gotNowcast = ncDone && (ncR as NowcastPointSeries[]).length > 0;
      const gotStatic = stR !== undefined && stR !== LATE;
      const z0Done = !!z0NetP && z0Val !== undefined;
      const gotZ0 = z0Done && !!z0Val && z0Val.z0True != null;
      // Nichts Neues (keine Messung, kein Radar, keine statischen Produkte, kein z0) ⇒ keine weitere Ausgabe — z0 kann
      // dann noch allein folgen (auf dem Stand des Kerns).
      const obsNotes = obsR === LATE
        ? [`anchor: Messung nach ${obsMs} ms ab dem Kern noch nicht da (Frist der Nachlieferung ${UPDATE_WAIT_MS} ms) — kein Anker`]
        : obsNoteOf(io, obs, obsMs, OBS_PROGRESSIVE_DEADLINE_MS, country);
      if (!(obs && obs.length) && !gotNowcast && !gotStatic && !gotZ0) {
        z0Later(bundle, null, obsNotes, pending.filter((x) => x === 'z0' || (x === 'anchor' && obsR === LATE) || (x === 'nowcast' && !ncDone) || (x === 'static' && !gotStatic)));
        return null;
      }
      const drop = new Set<string>([...(ncDone ? [late.nowcast!.skip] : []), ...(gotStatic ? [late.static!.skip] : [])]);
      const b2: PointBundle = {
        ...bundle,
        nowcast: gotNowcast ? (ncR as NowcastPointSeries[]) : bundle.nowcast,
        hmodel: gotStatic ? (stR as { hmodel: PointBundle['hmodel'] }).hmodel : bundle.hmodel,
        urban: gotStatic ? (stR as { urban: PointBundle['urban'] }).urban : bundle.urban,
        // AP17: z0 der Modelle reist mit den statischen Produkten (nur mit `CubeIo.z0mod`, sonst kein Feld).
        ...(gotStatic && (stR as { z0mod?: PointBundle['z0mod'] }).z0mod ? { z0mod: (stR as { z0mod?: PointBundle['z0mod'] }).z0mod } : {}),
        // AX-9: das Klimagitter reist mit den statischen Produkten (nur mit `CubeIo.climaGrid`, sonst kein Feld).
        ...(gotStatic && (stR as { climaGrid?: PointBundle['climaGrid'] }).climaGrid !== undefined ? { climaGrid: (stR as { climaGrid?: PointBundle['climaGrid'] }).climaGrid } : {}),
        skips: bundle.skips.filter((s) => !drop.has(s)),
      };
      const still = stillOf([...(obsR === LATE ? ['anchor'] : []), ...(late.nowcast && !ncDone ? ['nowcast'] : []), ...(late.static && !gotStatic ? ['static'] : []), ...(z0NetP && !z0Done ? ['z0'] : []), ...(late.crossChunk ? ['crossChunk'] : [])]);
      const notes = [...obsNotes];
      const z0u = gotZ0 ? (z0Val as Z0AtPoint) : z0c;
      if (z0NetP && !gotZ0) notes.push(...z0PendingNote(io, z0c, z0Done ? 'missing' : 'follows'));
      const second = forecastFromBundle(cur(b2), clima, obs, notes, opts, io, { T0, nowMs, obsMs: Math.round(now() - T0), emission: 'update', pending: still, calib: calibNow(), learned: learnedNow(), climaProduct: climaProductNow(), stack: stackNow() }, z0u);
      last = { b: b2, obs, notes, still, z0: z0u };
      cacheForecast(key, hours, second, opts);
      opts.onUpdate!(second);
      z0Later(b2, obs, notes, still);
      return second;
    })();
    update.catch(() => null);
    cacheForecast(key, hours, core, opts, update.catch(() => null));
    // AP12 (e): der Index kam aus der SWR-Kopie — nennt die Nachprüfung andere Läufe, wird ohne Kopie neu gelesen
    // und als letzte Ausgabe nachgeliefert (sie ersetzt auch die Nachlieferung oben).
    if (bundle.late?.index) {
      void bundle.late.index.changed.then(async (changed) => {
        if (!changed || opts.signal?.aborted) return;
        CUBE_CACHE.delete(key);
        const fresh = await getPointForecastFromCube({ ...opts, onUpdate: undefined }, { ...io, indexSwrMs: 0 });
        const c = fresh.cube as unknown as CubePathSummary;
        c.emission = 'update';
        c.pending = [];
        c.notes.push('index: die Nachprüfung nannte neue Läufe — ohne Index-Kopie neu gelesen (SWR, AP12)');
        cacheForecast(key, hours, fresh, opts);
        if (!opts.signal?.aborted) opts.onUpdate!(fresh);
      }).catch(() => { /* die Antwort mit der Kopie bleibt stehen, benannt */ });
    }
    return core;
  };

  const paint = await Promise.race([paintP, bundleP.then(() => null)]);
  if (paint) {
    // (1) war die erste Stufe: der Kern kommt als zweite Ausgabe. Die erste Darstellung (kürzeres Fenster)
    // kommt nicht in den Ergebnis-Cache — ein späterer Aufrufer bekäme sonst weniger Stunden, als er verlangt.
    void (async () => {
      const [bundle, clima, z0c] = await Promise.all([bundleP, climaP, z0P]);
      if (opts.signal?.aborted) return;
      opts.onUpdate!(coreAndLate(bundle, clima, 'core', z0c));
    })().catch(() => { /* ein Fehler des Kerns steht im Bündel; die erste Darstellung bleibt stehen */ });
    return paint;
  }
  const [bundle, clima, z0c] = await Promise.all([bundleP, climaP, z0P]);
  if (opts.signal?.aborted) throw Object.assign(new Error('abgebrochen'), { name: 'AbortError' });
  return coreAndLate(bundle, clima, 'first', z0c);
}

/** Leert den Ergebnis-Cache des Cube-Pfads — für Vorher/Nachher-Messungen im Lab (IndexedDB bleibt). */
export function clearCubeForecastCache(): void {
  CUBE_CACHE.clear();
}

/** Registriert den Cube-Pfad bei `getPointForecast`. Wird beim Laden dieses Moduls einmal aufgerufen. */
export function registerCubePointSource(io?: CubeIo): void {
  registerPointSource('cube', (opts) => getPointForecastFromCube(opts, io ?? defaultCubeIo()));
}
registerCubePointSource();

// Phase DB (audit/dashboard.md §5.3): das Dashboard bezieht Punkt-Leser und Verteilungsrechnung ÜBER dieses Modul, das es
// ohnehin lädt — so bleiben die Punkt-Module im Lazy-Chunk des Cube-Pfads (AP11, `verify:point-client` 8) und kein
// zweiter Chunk entsteht. Reine Weiterreichung, ohne Wirkung auf den Cube-Pfad.
export { exceedance } from './fusion/dist';
export { solarPosition } from './terrainPhysics';
export { loadStationCatalog } from '../point/client/stationPoint';
export { nowcastSourcesFor, readNowcastPoint } from '../point/client/nowcastPoint';
