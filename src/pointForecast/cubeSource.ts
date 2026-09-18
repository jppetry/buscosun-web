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
import { fuseHour, hourlyClimaTemp, type ClimaRef, type FusedPoint, type FusedVariable, type FusionContext } from './fusion/fuse';
import { verticalCorrection, STANDARD_LAPSE_PER_M, DZ_SURFACE_M, type VerticalResult } from './fusion/vertical';
import { gridToPoint, blockOffsets, GRID_SET, type GridCell, type GridResult } from './fusion/grid';
import {
  memberSigma, confidenceOf, consistentCloudTotal, sigmaClimaFallback, C_SPREAD, SIGMA_SYS_FLOOR_A1, CONF_DISCOUNT,
  type UncVar, type MemberSigma, type Confidence, type SigmaKind,
} from './fusion/uncertainty';
import { windSigmaAt } from './fusion/priors';
import { tpiAt } from './fusion/terrainScale';
import { terrainTerms, windBlendingFactor, TERRAIN_SET, type TerrainTermsResult } from './fusion/terrainTerms';
import { binnedAt, calibMetaText, type CalibOverrides } from '../point/calibDoc';
import { loadCalib, type LoadedCalib } from '../point/client/calibPoint';
import { ANCHOR_MAX, ANCHOR_TAU_H, anchorTerm, innovation, type AnchorPair, type Innovation } from './anchor';
import { spatialWeight } from './leadTimeWeights';
import { nowcastSourcesFor } from '../point/client/nowcastPoint';
import { SELECTION } from '../point/client/resolve';
import type { Country } from '../types';
import { skyViewFactor, type TerrainScales } from './fusion/terrainScale';
import { CLIMA_SIGMA_FALLBACK } from './fusion/priors';
import { rhFromDewPoint } from './fusion/meteo';
import { meanOf } from './fusion/dist';
import { getClimaField } from './fusion/attach';
import { toPointForecastV2, quantileMemo, type PointForecastV2 } from './fusion/output';
import type { FusionVariable } from './fusion/priors';
import { solarPosition } from './terrainPhysics';
import { detectFoehn } from './foehnDetector';
import { apparentTemperatureC } from './apparentTemperature';
import type { ClimaField, ClimaSample } from '../ml/climaField';
import { TIERS, CUBE_PLANES, POINT_CALIB_PATH, type TierId } from '../point/cubeFormat';
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
  };
}

// ---------------------------------------------------------------------------
// Ausgabe der reinen Rechnung
// ---------------------------------------------------------------------------

/** Flags je Schritt — die Liste aus Plan §2 plus `seam`/`interpolated`/`noTerrain` (AP2). */
export type StepFlag =
  | 'extrapolatedBelowModel' | 'inversionBody' | 'stdLapseFallback' | 'chunkBorderTruncated' | 'belowGround925'
  | 'nowcastFallbackModel' | 'climatologyOnly' | 'stale' | 'seam' | 'interpolated' | 'noTerrain' | 'nowcastSaturated'
  | 'stationOnly' | 'anchored';

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
  station?: { id: string; name: string; distKm: number; dElevM: number | null };
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
    clima: 'grid' | 'none';
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
      `confidence:set — Score = spread·agree·lage; Abschläge Fall C ${CONF_DISCOUNT.caseC} · Fall B ${CONF_DISCOUNT.caseB} · |Δh| > 300 m ${CONF_DISCOUNT.dhOver300} · Chunk-Rand ${CONF_DISCOUNT.chunkBorder} · Interpolation ${CONF_DISCOUNT.interpolated} · Modell statt Nowcast ${CONF_DISCOUNT.nowcastFallback}; kein Wahrscheinlichkeitsmaß, AP9 prüft die Monotonie gegen CRPS`,
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
    ...(useAnchor ? [
      `anchor:set — Innovations-Persistenz (anchor.ts, V-PV-19): Versatz Messung − Cube am Messzeitpunkt, τ_T ${ANCHOR_TAU_H.temperature} h / τ_Wind ${ANCHOR_TAU_H.wind} h, Deckel ${ANCHOR_MAX.temperature} K; Messung mit Frist geholt, nie blockierend`,
    ] : []),
    `nowcastStale:set — Radar-Slot älter als ${NOWCAST_STALE_MIN} min gilt als veraltet; fehlt das Radar in 0–${NOWCAST_HORIZON_H} h, trägt das Modell (Flag nowcastFallbackModel)`,
    ...(useTail ? ['tail:set — jenseits des letzten nativen Schritts trägt allein die Klimatologie (6-h-Schritte, climatologyOnly); keine Extrapolation der Modelle'] : []),
    ...(opts.hourly ? ['interpolation:set — Stunden ohne nativen Schritt: Station, wenn sie den Punkt vertritt; sonst lineare Interpolation der Quantile (p10/p50/p90/Mittel) der Nachbarschritte, markiert; Nähte werden nie geglättet (R7)'] : []),
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
  const climaAt = (ms: number): ClimaRef | null => {
    if (!clima || hTrue == null) return null;
    const doy = doyOf(ms);
    let cs = climaByDoy.get(doy);
    if (!cs) { cs = clima.sample(lat, lon, doy, hTrue); climaByDoy.set(doy, cs); }
    if (!Number.isFinite(cs.tempMean)) return null;
    const d = new Date(ms);
    const localHour = d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15;   // Sonnenzeit-Näherung
    return {
      tempMeanC: hourlyClimaTemp(cs.tempMean, cs.diurnalAmp, ((localHour % 24) + 24) % 24),
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
    };
    return fuseHour(samples, leadH, ctx);
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
    station: { id: input.station!.station.id, name: input.station!.station.name.trim(), distKm: input.station!.station.distanceKm, dElevM: input.station!.station.dElevM },
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
    return { a, leadH, flags, grid, cubeSample, vertical, spd, foehnScore: foehn ? foehn.score : null, terrainRes };
  });
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
      const wsp = spatialWeight(Math.max(0, o.distanceM), Math.abs((o.elevM ?? hTrue) - hTrue));
      if (!(wsp > 0)) continue;
      const ageH = Math.max(0, (input.nowMs - o.validAtMs) / H);
      const tCube = p.vertical ? p.vertical.t : p.cubeSample.temperature;
      if (o.temperature != null && tCube != null) {
        const tObs = o.temperature + ((o.elevM ?? hTrue) - hTrue) * STANDARD_LAPSE_PER_M;
        pairs.t.push({ ageH, obs: tObs, model: tCube, wsp });
      }
      if (o.u != null && p.cubeSample.u != null) pairs.u.push({ ageH, obs: o.u, model: p.cubeSample.u, wsp });
      if (o.v != null && p.cubeSample.v != null) pairs.v.push({ ageH, obs: o.v, model: p.cubeSample.v, wsp });
      if (o.gust != null && p.cubeSample.gust != null) pairs.gust.push({ ageH, obs: o.gust, model: p.cubeSample.gust, wsp });
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
      const termK = anchorInfo.t ? anchorTerm(anchorInfo.t, leadH, ANCHOR_TAU_H.temperature) : 0;
      const termU = anchorInfo.u ? anchorTerm(anchorInfo.u, leadH, ANCHOR_TAU_H.wind) : 0;
      const termV = anchorInfo.v ? anchorTerm(anchorInfo.v, leadH, ANCHOR_TAU_H.wind) : 0;
      const termGust = anchorInfo.gust ? anchorTerm(anchorInfo.gust, leadH, ANCHOR_TAU_H.gust) : 0;
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
        const m = cal
          ? memberSigma({ v, sample: cubeSample, leadH, sigmaClima: sc, vertical, sysOverride: binnedAt(cal.sigmaSys?.[v], leadH), cSpread: binnedAt(cal.cSpread?.[v], leadH) })
          : memberSigma({ v, sample: cubeSample, leadH, sigmaClima: sc, vertical });
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
    const fused = fuseAt(samples, leadH, a.validAtMs, p.foehnScore, weights);
    if (fused?.temperature?.climatologyOnly) flags.push('climatologyOnly');
    if (useUnc) {
      for (const v of UNC_VARS) {
        const m = memberSig[v]!;
        const sp = fused ? sigmaPostOf(fused, v) : null;
        uncertainty[v] = {
          sigmaKind: m.kind, sigmaMember: m.sigma, parts: m.parts, sigmaPost: sp, sigmaClima: sigmaClimaOf[v]!,
          confidence: sp == null ? null : confidenceOf({ sigmaPost: sp, sigmaClima: sigmaClimaOf[v]!, member: m, srcCount: cubeSample.srcCount ?? null, flags, dhM: vertical ? Math.abs(vertical.dhM) : null, ...(cal?.confDiscount ? { discount: cal.confDiscount } : {}) }),
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
    };
  };
  const steps: CubeStep[] = preps.map(finishStep);

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
        const fused = fuseAt([st], leadH, t, null, weights);
        const flags: StepFlag[] = ['stationOnly'];
        if (input.nowcastCovering.length && inHorizon(t)) flags.push('nowcastFallbackModel');
        const uncertainty: CubeStep['uncertainty'] = {};
        if (useUnc && fused) {
          for (const v of UNC_VARS) {
            const m = memberSigma({ v, sample: st, leadH, sigmaClima: sigmaClimaFor(v, t), vertical: null });
            const sp = sigmaPostOf(fused, v);
            uncertainty[v] = { sigmaKind: m.kind, sigmaMember: m.sigma, parts: m.parts, sigmaPost: sp, sigmaClima: sigmaClimaFor(v, t),
              confidence: sp == null ? null : confidenceOf({ sigmaPost: sp, sigmaClima: sigmaClimaFor(v, t), member: m, srcCount: 1, flags, dhM: null, ...(cal?.confDiscount ? { discount: cal.confDiscount } : {}) }) };
          }
        }
        out.push({ validAtMs: t, leadH, tier: 'station', interpolated: false, flags, fused, members: [stationMember(t, st)], cell: {}, belowGroundHPa: null, vertical: null, grid: null, uncertainty, terrain: null, weights, samples: [st] });
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

  const runs: CubeFusionResult['provenance']['runs'] = {};
  for (const tier of TIERS) {
    const s = input.cube[tier.id];
    if (!s) continue;
    runs[tier.id] = { run: s.run, sourceRun: s.sourceRun, sourceRunAtMs: s.sourceRunAtMs, models: s.sources.map((x) => x.id), manifestFrom: s.manifestFrom ?? null };
  }
  const st = input.station;
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
      station: st ? { run: st.run, runAtMs: st.runAtMs, ageH: st.ageH, id: st.station.id, name: st.station.name.trim(), distKm: st.station.distanceKm, dElevM: st.station.dElevM, elevM: st.station.elev } : null,
      stationReason: input.stationReason,
      nowcast: input.nowcast.map((n) => ({ source: n.sourceId, stamp: n.stamp, ageMin: Math.round(n.slotAgeMin), frames: n.frames.length, extrapolationH: n.extrapolationH })),
      clima: clima ? 'grid' : 'none',
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
   */
  obs?: ((lat: number, lon: number, country: Country, signal: AbortSignal) => Promise<CubeObs[]>) | null;
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
}

/** AP13: der Anteil der Io-Optionen am Cache-Schlüssel — leer ohne Optionen (byte-gleicher Schlüssel wie bisher). */
export function cubeIoVariantKey(io: CubeIo): string {
  const fuse = io.fuse && Object.keys(io.fuse).length ? io.fuse : null;
  const calib = io.calibSource === 'json' ? 'json' : null;
  const cross = io.crossChunk ? 'cc' : null;
  const lcv = io.landCover && io.z0 ? 'lc' : null;
  const zm = io.z0mod ? 'zm' : null;
  if (!fuse && !calib && !cross && !lcv && !zm) return '';
  const stable = (o: Record<string, unknown>): string => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  // Ohne `crossChunk` exakt der Schlüssel von AP13 (keine Verschiebung bestehender Einträge).
  return `|io:${fuse ? stable(fuse as Record<string, unknown>) : ''}|calib:${calib ?? ''}${cross ? `|${cross}` : ''}${lcv ? `|${lcv}` : ''}${zm ? `|${zm}` : ''}`;
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
  CUBE_PLANES.filter((p) => p.kind !== 'q10' && p.kind !== 'q90' && !['t850', 't700', 'rh850', 'rh700'].includes(p.id)).map((p) => p.id),
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

/** Der Browser-Abruf der Messungen: die sechs nächsten Stationen (Live-Pfad-Quellen), als `CubeObs`. */
export async function fetchCubeObs(lat: number, lon: number, country: Country, signal: AbortSignal): Promise<CubeObs[]> {
  const { fetchNearestStationObs } = await import('./sampleSources');
  const list = await fetchNearestStationObs(lat, lon, country, 6, signal);
  const out: CubeObs[] = [];
  for (const s of list) {
    // Der Live-Pfad nimmt die Messung als „jetzt gültig" (`stationsToHour0Samples`); der Anker paart sie
    // mit dem Cube-Schritt im selben Stundenraster, also zählt der Messzeitpunkt, wenn er da ist.
    const p = s.point as { timestamp?: Date; temperature?: number | null; relativeHumidity?: number | null; u?: number | null; v?: number | null; gust?: number | null; name?: string };
    const t = p.timestamp instanceof Date && Number.isFinite(p.timestamp.getTime()) ? p.timestamp.getTime() : Date.now();
    out.push({
      source: s.source, name: p.name, lat: s.lat, lon: s.lng, elevM: Number.isFinite(s.elevation) ? s.elevation : null, distanceM: s.distanceMeters, validAtMs: t,
      temperature: p.temperature ?? null, relativeHumidity: p.relativeHumidity ?? null, u: p.u ?? null, v: p.v ?? null, gust: p.gust ?? null,
    });
  }
  return out;
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
  };
}

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
  t: { T0: number; nowMs: number; obsMs: number | null; emission?: 'first' | 'core' | 'update'; pending?: string[]; calib?: LoadedCalib | null },
  z0: Z0AtPoint | null = null,
): PointForecast {
  const input = cubeInputFromBundle(bundle, clima, obs);
  input.notes.push(...obsNotes);
  if (t.calib) input.notes.push(...t.calib.notes);
  if (z0) input.z0 = z0;
  if (io.terrainOverride !== undefined) {
    input.terrain = io.terrainOverride;
    input.elevationM = input.elevationM ?? io.terrainOverride?.elevationM ?? null;
  }
  // AP13 (V-FI-79): die Optionen des Aufrufers und die gemessene Kalibrierung; ohne beide exakt der Aufruf von vorher.
  const result = fuseCubePoint(input, { ...(io.fuse ?? {}), ...(t.calib?.overrides ? { calib: t.calib.overrides } : {}), hourly: true, tail: true });
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
function obsNoteOf(io: CubeIo, obs: CubeObs[] | null, obsMs: number, deadlineMs: number): string[] {
  if (!io.obs) return ['anchor: kein Messungs-Abruf konfiguriert — kein Anker'];
  if (obs == null) return [`anchor: Messungs-Abruf gescheitert oder abgebrochen (${obsMs} ms) — kein Anker`];
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
    ? io.obs(lat, lon, country, AbortSignal.timeout(OBS_DEADLINE_MS)).catch(() => null)
    : Promise.resolve(null);
  const climaP = io.clima().catch(() => null);
  // AP13: `calib.json` parallel zum Index — nie blockierend. Entschieden wird EINMAL, bei der ersten Ausgabe;
  // alle weiteren Ausgaben dieser Abfrage rechnen mit derselben Entscheidung (kein σ-Sprung in der Nachlieferung).
  let calibVal: LoadedCalib | null | undefined;
  const calibP: Promise<unknown> | null = io.calibSource === 'json'
    ? loadCalib(io.store, opts.signal ? { signal: opts.signal } : {}).then((c) => { calibVal = c; }, () => { calibVal = null; })
    : null;
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
          opts, io, { T0, nowMs, obsMs: null, emission: 'first', pending: [...pending, ...(io.z0 && z0Missing(z0c) ? ['z0'] : [])], calib: calibNow() }, z0c));
      } catch { /* die erste Darstellung ist ein Angebot — der Kern kommt ohnehin */ }
    });
  } : undefined;
  const bundleP = readPointBundle(
    { lat, lon, nowMs, fromMs: t0Ms, toMs: t0Ms + hours * H, stepH: 1 },
    {
      store: io.store, decodePng: io.decodePng, nowcast: withRadar, terrain: io.terrain, plan: false, neighbours: true, lateDeadlineMs: io.lateDeadlineMs,
      ...(io.crossChunk ? { crossChunk: true } : {}),
      ...(io.z0mod ? { z0mod: true } : {}),
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
      : obsNoteOf(io, obs, obsMs, OBS_DEADLINE_MS);
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
    const forecast = forecastFromBundle(bundle, clima, obs, notes, opts, io, { T0, nowMs, obsMs, calib: calibNow() }, z0);
    cacheForecast(key, hours, forecast, opts);
    return forecast;
  }

  // ── AP12: progressiv — (1) erste Darstellung (erste Stufe, s. oben) oder der Kern, (2) der Kern, wenn (1)
  //    die erste Stufe war, (3) EINE Nachlieferung mit Radar/Anker/statischen Produkten ──
  const coreAndLate = (bundle: PointBundle, clima: ClimaField | null, emission: 'first' | 'core', z0c: Z0AtPoint | null): PointForecast => {
    const obs2T0 = now();
    const obs2P: Promise<CubeObs[] | null> = io.obs
      ? io.obs(lat, lon, country, AbortSignal.timeout(OBS_PROGRESSIVE_DEADLINE_MS)).catch(() => null)
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
      : obsNoteOf(io, null, 0, OBS_PROGRESSIVE_DEADLINE_MS)), ...(z0NetP ? z0PendingNote(io, z0c, 'follows') : [])];
    const core = forecastFromBundle(bundle, clima, null, firstNotes, opts, io, { T0, nowMs, obsMs: null, emission, pending, calib: calibNow() }, z0c);
    last = { b: bundle, obs: null, notes: firstNotes, still: pending, z0: z0c };
    if (late.crossChunk) {
      void late.crossChunk.result.then((r) => {
        crossVal = r;
        const said = Object.entries(r).filter(([, x]) => x?.cells.length).map(([t, x]) => `${t} +${x!.chunks.length} Chunk (${x!.chunks.join(', ')}), ${x!.cells.length} Zellen`).join(' · ');
        if (!said || opts.signal?.aborted || !last) return;   // nichts gewonnen (Abruf gescheitert, benannt im Bündel) ⇒ keine Ausgabe
        const L = last;
        const notesX = [...L.notes, `crossChunk: ${said} — 2×2-Block über die Chunk-Grenze, eigene Ausgabe (AP14)`];
        const fc4 = forecastFromBundle(cur(L.b), clima, L.obs, notesX, opts, io,
          { T0, nowMs, obsMs: Math.round(now() - T0), emission: 'update', pending: stillOf(L.still), calib: calibNow() }, L.z0);
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
          { T0, nowMs, obsMs: Math.round(now() - T0), emission: 'update', pending: still3, calib: calibNow() }, z);
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
        : obsNoteOf(io, obs, obsMs, OBS_PROGRESSIVE_DEADLINE_MS);
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
        skips: bundle.skips.filter((s) => !drop.has(s)),
      };
      const still = stillOf([...(obsR === LATE ? ['anchor'] : []), ...(late.nowcast && !ncDone ? ['nowcast'] : []), ...(late.static && !gotStatic ? ['static'] : []), ...(z0NetP && !z0Done ? ['z0'] : []), ...(late.crossChunk ? ['crossChunk'] : [])]);
      const notes = [...obsNotes];
      const z0u = gotZ0 ? (z0Val as Z0AtPoint) : z0c;
      if (z0NetP && !gotZ0) notes.push(...z0PendingNote(io, z0c, z0Done ? 'missing' : 'follows'));
      const second = forecastFromBundle(cur(b2), clima, obs, notes, opts, io, { T0, nowMs, obsMs: Math.round(now() - T0), emission: 'update', pending: still, calib: calibNow() }, z0u);
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
