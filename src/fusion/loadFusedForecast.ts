/**
 * Orchestriert: EINE gewählte Modellquelle → IDW-Gitterung → Layer-fertige PNGs.
 *
 * **Der Multi-Quellen-Blend ist entfallen** (2026-08-22, `audit/rasterfusion-
 * rueckbau.md`, Jans Entscheidung): „Buscosun Fusion" als *Mischung* gibt es nur
 * noch im **Punktforecast** (`src/pointForecast/`) und im **Nowcast**
 * (`src/nowcast/`). Auf der Karte rendert immer genau **ein** Modell — entweder
 * nativ aus GRIB2 (`native`, `icon-d2`) oder, für die 19 Katalogmodelle ohne
 * eigenen Raster-Pfad, über die IDW-Gitterung dieses Moduls.
 *
 * Dieses Modul ist damit reine **Darstellungs-Infrastruktur**: Punkt-Stichproben
 * einer Quelle → dichtes Gitter → PNG. Keine Gewichtung zwischen Quellen, keine
 * Analyse, keine Kalibrierung.
 *
 * Lizenzlage bleibt: CC-BY-4.0-Stack (DWD/GeoSphere/MeteoSchweiz/ECMWF/NOAA),
 * kein Open-Meteo.
 */

import { DACH_BOUNDS, type ForecastBounds } from '../sources/openMeteoForecast';
import { fetchBrightSkyGrid } from '../sources/brightSkyForecast';
import { fetchBrightSkyCurrentGrid } from '../sources/brightSkyCurrent';
import { fetchGeoSphereIncaGrid } from '../sources/geosphereInca';
import { fetchGeoSphereAromeGrid } from '../sources/geosphereArome';
import { fetchIconD2EpsGrid } from '../sources/iconD2EpsSource';
import { fetchIconChEpsGrid } from '../sources/iconChEpsSource';
import { fetchAromeFranceGrid } from '../sources/aromeFranceSource';
import { fetchIconEuRasterGrid } from '../sources/iconEuRasterSource';
import { fetchGfs2dGrid } from '../sources/gfs2dSource';
import { fetchEcmwfGrid } from '../sources/ecmwfIfsSource';
import { fetchIconGlobalGrid } from '../sources/iconGlobalSource';
import { fetchAiconGrid } from '../sources/aiconSource';
import { fetchArpegeGrid } from '../sources/arpegeSource';
import { fetchTawesCurrentGrid } from '../sources/geosphereTawes';
import { fetchSmnCurrentGrid } from '../sources/meteoSwissSmn';
import { FusionEngine } from './fusionEngine';
import { loadElevationLookup, type ElevationGrid } from './elevation';
import type { DwdForecastResult } from '../wind/brightSkySource';
import { COUNTRY_PROFILES, DACH_VIEW, type CountryProfile } from '../countryProfiles';
import type { Country } from '../types';

// One-shot terrain lookup — the underlying Terrarium tiles never change, so
// once loaded the lookup can be reused for every forecast refresh. Zoom 5
// (~2.5 km per tile pixel) gives ≈ 16 tiles for Europe (~1 MB total) and is
// the sweet spot for resolving alpine valleys and Mittelgebirge.
//
// We intentionally do NOT pass the caller's signal into the tile fetch — the
// tiles are static and useful for every future refresh, so cancelling them
// when a React effect unmounts (e.g. during dev StrictMode double-render)
// would leave us with a NaN elevation lookup forever.
let elevationPromise: Promise<ElevationGrid> | null = null;
function getElevation(bounds: typeof DACH_BOUNDS): Promise<ElevationGrid> {
  if (!elevationPromise) {
    elevationPromise = loadElevationLookup(bounds, 5).catch((err) => {
      elevationPromise = null;   // allow retry on next call
      throw err;
    });
  }
  return elevationPromise;
}

/**
 * Public prefetch hook — call from any landing page so the DEM tile fetch
 * starts BEFORE the user navigates to the map. By the time they click a
 * location, `elevationPromise` is either resolved or in flight, and
 * `loadFusedForecast` becomes a pure compute task on top of cached I/O.
 */
export function prefetchElevation(): void {
  // Resolve against the canonical DACH bounds — same as loadFusedForecast.
  // Failure is silent; the actual forecast load will retry if needed.
  void getElevation(DACH_VIEW.bounds).catch(() => {});
}

/**
 * Comprehensive warm-up: fire every source the map will need, plus the
 * Phase-A fusion compute for the default country (DE). Called once from the
 * landing page so that by the time the user clicks a search result the
 * MapView only renders pre-computed data — sub-100 ms first paint.
 *
 * Scheduling
 *   - Synchronous part fires elevation + source fetches in parallel; these
 *     run on the network thread, no main-thread cost.
 *   - The Phase-A fusion precompute (CPU-heavy) is deferred to
 *     `requestIdleCallback` (or a 1500 ms setTimeout fallback) so it
 *     never competes with the user's typing or scroll on the homepage.
 *
 * Idempotent: safe to call multiple times — `sourceCache` and
 * `fusedResultCache` short-circuit duplicate work.
 */
export function warmMapData(): void {
  // Die Kartenansicht rendert ausschließlich native ICON-D2-Layer (Wind/Wolken/
  // Niederschlag/Temp) + das eigenständige Punktforecast-Panel. Die gridded Fusion
  // ist für den Karten-Erstpaint obsolet geworden und wird NICHT mehr vorgewärmt
  // (das sparte ~1700 brightsky-Requests pro Suche). Sie lädt nur noch lazy, wenn
  // der Temperatur-Layer aktiviert wird.
  //
  // Wir wärmen nur noch das Terrain-DEM vor (Terrarium-Kacheln, von der Temp-Layer-
  // Höhenkorrektur genutzt) — billig und ohne brightsky-Last.
  prefetchElevation();
}

// ---------------------------------------------------------------------------
// Fused-result cache — keyed by (country, modelChoice, hours, denseCols).
// Caches the COMPLETE DwdForecastResult so model-switching back and forth
// (e.g. Fusion → MOSMIX → Fusion) is sub-100 ms instead of re-running
// FusionEngine each time. TTL matches the source cache so freshness is
// equivalent. The two caches are independent: source-cache is per-source
// (helps a first switch where sources are warm but fusion needs to run);
// result-cache is per-combination (helps the second + subsequent switches).
// ---------------------------------------------------------------------------
const RESULT_TTL_MS = 10 * 60 * 1000;
interface CachedResult { value: DwdForecastResult; fetchedAt: number; }
const fusedResultCache = new Map<string, CachedResult>();

function resultKey(
  country: Country | undefined, hours: number, modelChoice: ModelChoice,
  denseCols: number, denseRows: number, quick: boolean,
): string {
  const slot = Math.floor(Date.now() / RESULT_TTL_MS);
  return `${country ?? 'DE'}|${modelChoice}|h${hours}|g${denseCols}x${denseRows}|q${quick ? 1 : 0}|s${slot}`;
}

// ---------------------------------------------------------------------------
// Per-source result cache. Drives sub-second model switching: when the user
// flips between Fusion / MOSMIX / AROME / Obs, the underlying fetches are
// served from this map and only the FusionEngine.run() re-runs. Keyed by
// (sourceName, country, hour-floor) so a fresh 10-minute window invalidates
// the cache, matching the live-obs cadence. The full DACH bounds are
// implicit — all sources are fetched at their native default bounds.
//
// The cache lives at module scope so it survives React StrictMode remounts
// and component unmounts. It is intentionally not bound to the page session
// only — back-and-forth navigation between countries also benefits.
// ---------------------------------------------------------------------------
const SOURCE_TTL_MS = 10 * 60 * 1000;
interface SourceCacheEntry<T> { value: T; fetchedAt: number }
const sourceCache = new Map<string, SourceCacheEntry<unknown>>();

function sourceKey(name: string, hours: number): string {
  const hourSlot = Math.floor(Date.now() / SOURCE_TTL_MS);
  return `${name}|h${hours}|s${hourSlot}`;
}

async function getCachedSource<T>(
  key: string,
  fetcher: () => Promise<T | null>,
): Promise<T | null> {
  const hit = sourceCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < SOURCE_TTL_MS) {
    return hit.value as T;
  }
  const value = await fetcher();
  if (value != null) sourceCache.set(key, { value, fetchedAt: Date.now() });
  return value;
}

/**
 * Die Modellquelle, die gerastert werden soll — **genau eine**. Es gibt keinen
 * Blend-Wert mehr; jeder Aufruf isoliert die genannte Quelle.
 *
 *  'mosmix'   → DWD MOSMIX only (DE forecast backbone, CC-BY 4.0)
 *  'arome'    → GeoSphere AROME-AT only (2.5 km, AT/CH/sDE coverage)
 *  'inca'     → GeoSphere INCA nowcast only (AT, 1 km, ~3 h horizon)
 *  'obs'      → live station obs only (DWD + TAWES + SMN, h=0)
 *  'icon-d2-eps' → DWD ICON-D2-EPS ensemble mean only (2.2 km icosahedral, DACH)
 *  'icon-ch1-eps' / 'icon-ch2-eps' → MeteoSchweiz ICON-CH control run only (CH)
 *  'arome-fr' → Météo-France AROME-France 0.01° only (temp+wind; DE/CH + west AT)
 *  'icon-eu' → DWD ICON-EU single-level 2D raster only (all DACH)
 *  'gfs' → NOAA GFS global 2D raster only (coarse, all DACH)
 *  'ifs' / 'aifs' / 'aifs-ens' → ECMWF IFS / AIFS / AIFS-ENS global 2D raster only
 *  'icon-global' → DWD ICON global 2D raster only (icosahedral, all DACH)
 *  'aicon' → DWD AICON (KI) 2D raster only (temp/wind/precip; all DACH)
 *  'arpege' → Météo-France ARPEGE global 2D raster only (temp/wind; all DACH)
 */
export type ModelChoice =
  | 'mosmix' | 'arome' | 'inca' | 'obs'
  | 'icon-d2-eps' | 'icon-ch1-eps' | 'icon-ch2-eps' | 'arome-fr' | 'icon-eu' | 'gfs'
  | 'ifs' | 'aifs' | 'aifs-ens' | 'icon-global' | 'aicon' | 'arpege';

export interface FusedLoadOptions {
  signal?: AbortSignal;
  hours?: number;
  temperatureRange?: { min: number; max: number };
  bounds?: ForecastBounds;
  /**
   * Country profile that selects which national source stack to use. When set,
   * `bounds` and `hours` default to the profile's values, and only the
   * sources flagged in the profile fire.
   */
  country?: Country;
  /**
   * Welche Quelle gerastert wird — siehe `ModelChoice`. **Pflicht**: es gibt
   * keinen Blend-Default mehr, die Karte rendert immer genau ein Modell.
   */
  modelChoice: ModelChoice;
  /**
   * Dense grid resolution for the IDW output. Default 160 × 128 — the
   * full-quality production grid. For a fast first-paint use 80 × 64 (4×
   * less per-hour IDW work), then re-fire at full quality in background.
   */
  denseCols?: number;
  denseRows?: number;
  /**
   * Quick-mode: schaltet die Gauß-Glättung für alle Variablen außer Temperatur
   * ab und überspringt den temporalen Median. Quellen werden **nicht** mehr
   * unterdrückt — bei Einzelmodell-Rasterung wäre der Frame sonst leer.
   */
  quickMode?: boolean;
}

export async function loadFusedForecast(options: FusedLoadOptions): Promise<DwdForecastResult> {
  // Resolve the country profile (default DE for backwards-compat).
  const profile: CountryProfile = options.country
    ? COUNTRY_PROFILES[options.country]
    : COUNTRY_PROFILES.DE;
  const hours = options.hours ?? profile.forecastHours;
  const _denseCols = options.denseCols ?? 160;
  const _denseRows = options.denseRows ?? 128;
  const _modelChoice: ModelChoice = options.modelChoice;
  const _quickMode = options.quickMode ?? false;
  // Cache hit? Sub-100 ms response for already-computed combinations. The
  // quick-mode flag is part of the cache key — Phase A and Phase B never
  // share a cache slot (different visual fidelity).
  const cKey = resultKey(options.country, hours, _modelChoice, _denseCols, _denseRows, _quickMode);
  const cachedResult = fusedResultCache.get(cKey);
  if (cachedResult && Date.now() - cachedResult.fetchedAt < RESULT_TTL_MS) {
    return cachedResult.value;
  }
  // Always render the grid over DACH so the map (which now opens at the
  // DACH overview regardless of search country) shows continuous coverage
  // across DE/AT/CH. profile.bounds is kept for callers that explicitly
  // want a country-specific extent.
  const bounds = options.bounds ?? DACH_VIEW.bounds;
  const tempRange = options.temperatureRange ?? { min: -20, max: 40 };
  const modelChoice: ModelChoice = options.modelChoice;
  // Genau EINE Quelle feuert — die gewählte. Beobachtungen (DWD-Obs + TAWES +
  // SMN) sind eine Gruppe unter 'obs'. Kein Blend, keine Sekundärquellen-
  // Unterdrückung im quickMode (das würde den Frame leer lassen).
  const allow = (m: ModelChoice) => modelChoice === m;
  const useObs = allow('obs');
  const useMosmix = allow('mosmix');
  const useInca = allow('inca');
  const useArome = allow('arome');
  const useEps = allow('icon-d2-eps');
  const useCh1 = allow('icon-ch1-eps');
  const useCh2 = allow('icon-ch2-eps');
  const useAromeFr = allow('arome-fr');
  const useIconEu = allow('icon-eu');
  const useGfs = allow('gfs');
  const useIfs = allow('ifs');
  const useAifs = allow('aifs');
  const useAifsEns = allow('aifs-ens');
  const useIconGlobal = allow('icon-global');
  const useAicon = allow('aicon');
  const useArpege = allow('arpege');

  const engine = new FusionEngine({
    bounds,
    hours,
    // Default 160 × 128 dense grid (~ 20 k cells) — production quality with
    // visible alpine valley structure at zoom 5. Caller can pass smaller
    // dims for a fast first-paint (e.g. 80 × 64 = 4× less IDW work).
    denseCols: options.denseCols ?? 160,
    denseRows: options.denseRows ?? 128,
    temperatureRange: tempRange,
    precipitationRange: { min: 0, max: 10 },
    quickMode: _quickMode,
  });
  const modelTags: string[] = [];

  // Plug in the DEM for elevation-aware temperature IDW. Failure is non-fatal
  // — temperature falls back to plain IDW if the tile fetch can't complete.
  try {
    const elev = await getElevation(bounds);
    engine.setElevation(elev);
  } catch {
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  }

  // -----------------------------------------------------------------
  // PARALLEL SOURCE FETCHES — fire all enabled sources concurrently and
  // ingest in declaration order once they all settle. Previous code did
  // `await` on each one sequentially, so cold load was the SUM of every
  // source's latency. With Promise.allSettled it's now the MAX — a 3-4×
  // wall-clock reduction for cold load. The cache layer keeps subsequent
  // model-switch reloads sub-second since fetchers short-circuit.
  //
  // BrightSky-CDN obs/mosmix sequencing note: fetchBrightSkyCurrentGrid
  // uses pMap concurrency 3, fetchBrightSkyGrid uses 8. Running both in
  // parallel saturates the 6-per-host browser limit, but the cache means
  // the second call usually hits a warm response after the first refresh
  // window. If obs starvation reappears we can tighten MOSMIX concurrency
  // to 4 — both calls share the same `api.brightsky.dev` origin.
  // -----------------------------------------------------------------
  const wantObs    = profile.useDwdObs && useObs;
  const wantMosmix = profile.useMosmix && useMosmix;
  const wantInca   = profile.useInca   && useInca;
  const wantArome  = profile.useArome  && useArome;
  const wantTawes  = profile.useTawes  && useObs;
  const wantSmn    = profile.useSmn    && useObs;
  const wantEps    = useEps;
  const wantCh1    = useCh1;
  const wantCh2    = useCh2;
  const wantAromeFr = useAromeFr;
  const wantIconEu  = useIconEu;
  const wantGfs     = useGfs;
  const wantIfs     = useIfs;
  const wantAifs    = useAifs;
  const wantAifsEns = useAifsEns;
  const wantIconGlobal = useIconGlobal;
  const wantAicon = useAicon;
  const wantArpege = useArpege;

  const [obs, bs, inca, arome, tawes, smn, eps, ch1, ch2, aromeFr, iconEu, gfs2d, ifs, aifs, aifsEns, iconGlobal, aicon, arpege] = await Promise.all([
    wantObs ? getCachedSource(sourceKey('dwd_obs', hours), () =>
        fetchBrightSkyCurrentGrid({ cols: 10, rows: 8 })).catch(() => null) : Promise.resolve(null),
    wantMosmix ? getCachedSource(sourceKey('mosmix', hours), () =>
        fetchBrightSkyGrid({ bounds, cols: 16, rows: 13, hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantInca ? getCachedSource(sourceKey('inca', hours), () =>
        fetchGeoSphereIncaGrid({ cols: 12, rows: 8, hours: Math.min(hours, 4), signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantArome ? getCachedSource(sourceKey('arome', hours), () =>
        fetchGeoSphereAromeGrid({ cols: 12, rows: 7, hours })).catch(() => null) : Promise.resolve(null),
    wantTawes ? getCachedSource(sourceKey('tawes', hours), () =>
        fetchTawesCurrentGrid()).catch(() => null) : Promise.resolve(null),
    wantSmn ? getCachedSource(sourceKey('smn', hours), () =>
        fetchSmnCurrentGrid({ maxStations: 80 })).catch(() => null) : Promise.resolve(null),
    wantEps ? getCachedSource(sourceKey('icon-d2-eps', hours), () =>
        fetchIconD2EpsGrid({ hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantCh1 ? getCachedSource(sourceKey('icon-ch1-eps', hours), () =>
        fetchIconChEpsGrid('icon-ch1-eps', { hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantCh2 ? getCachedSource(sourceKey('icon-ch2-eps', hours), () =>
        fetchIconChEpsGrid('icon-ch2-eps', { hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantAromeFr ? getCachedSource(sourceKey('arome-fr', hours), () =>
        fetchAromeFranceGrid({ hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantIconEu ? getCachedSource(sourceKey('icon-eu', hours), () =>
        fetchIconEuRasterGrid({ hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantGfs ? getCachedSource(sourceKey('gfs', hours), () =>
        fetchGfs2dGrid({ hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantIfs ? getCachedSource(sourceKey('ifs', hours), () =>
        fetchEcmwfGrid('ifs', { hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantAifs ? getCachedSource(sourceKey('aifs', hours), () =>
        fetchEcmwfGrid('aifs-single', { hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantAifsEns ? getCachedSource(sourceKey('aifs-ens', hours), () =>
        fetchEcmwfGrid('aifs-ens', { hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantIconGlobal ? getCachedSource(sourceKey('icon-global', hours), () =>
        fetchIconGlobalGrid({ hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantAicon ? getCachedSource(sourceKey('aicon', hours), () =>
        fetchAiconGrid({ hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
    wantArpege ? getCachedSource(sourceKey('arpege', hours), () =>
        fetchArpegeGrid({ hours, signal: options.signal })).catch(() => null) : Promise.resolve(null),
  ]);

  // Live obs — dominate hour 0 with measurement weight.
  if (obs && obs.points[0]?.length) {
    engine.ingest(obs, { temperature: 5.0, wind: 3.0, clouds: 2.0, precipitation: 4.0 });
    modelTags.push('dwd_obs');
  }
  // MOSMIX — DE forecast backbone.
  if (bs) {
    engine.ingest(bs, { temperature: 1.4, wind: 1.4, clouds: 1.0, precipitation: 1.4 });
    modelTags.push('mosmix');
  }
  // INCA — AT nowcast.
  if (inca) {
    engine.ingest(inca, { temperature: 2.0, wind: 1.8, clouds: 0, precipitation: 2.2 });
    modelTags.push('inca');
  }
  // AROME — AT+CH+sDE 2.5 km NWP.
  if (arome) {
    engine.ingest(arome, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('arome');
  }
  // TAWES — AT live stations.
  if (tawes && tawes.points[0]?.length) {
    engine.ingest(tawes, { temperature: 5.0, wind: 3.0, clouds: 0, precipitation: 4.0 });
    modelTags.push('tawes');
  }
  // SMN — CH live stations.
  if (smn && smn.points[0]?.length) {
    engine.ingest(smn, { temperature: 5.0, wind: 3.0, clouds: 0, precipitation: 4.0 });
    modelTags.push('smn');
  }
  // ICON-D2-EPS — Ensemble-Mittel (2,2 km icosahedral, ganz DACH).
  if (eps && eps.points[0]?.length) {
    engine.ingest(eps, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('icon_d2_eps');
  }
  // ICON-CH1/CH2-EPS-Kontrolllauf (nur bei Einzelwahl, s. o.) — alleinige Quelle.
  if (ch1 && ch1.points[0]?.length) {
    engine.ingest(ch1, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('icon_ch1_eps');
  }
  if (ch2 && ch2.points[0]?.length) {
    engine.ingest(ch2, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('icon_ch2_eps');
  }
  // AROME-France (nur SP1 → Temperatur + Wind; Wolken/Niederschlag null → Engine
  // ignoriert die fehlenden Variablen).
  if (aromeFr && aromeFr.points[0]?.length) {
    engine.ingest(aromeFr, { temperature: 1.4, wind: 1.4, clouds: 0, precipitation: 0 });
    modelTags.push('arome_france');
  }
  // ICON-EU single-level (Temperatur/Wind/Wolken/Niederschlag), nur bei Einzelwahl.
  if (iconEu && iconEu.points[0]?.length) {
    engine.ingest(iconEu, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('icon_eu');
  }
  // GFS global (Temperatur/Wind/Wolken/Niederschlag), nur bei Einzelwahl.
  if (gfs2d && gfs2d.points[0]?.length) {
    engine.ingest(gfs2d, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('gfs');
  }
  // ECMWF IFS global (Temperatur/Wind/Wolken/Niederschlag), nur bei Einzelwahl.
  if (ifs && ifs.points[0]?.length) {
    engine.ingest(ifs, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('ecmwf_ifs');
  }
  // ECMWF AIFS (KI) global, nur bei Einzelwahl.
  if (aifs && aifs.points[0]?.length) {
    engine.ingest(aifs, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('ecmwf_aifs');
  }
  // ECMWF AIFS-ENS (KI-Ensemble, Kontrolllauf) global, nur bei Einzelwahl.
  if (aifsEns && aifsEns.points[0]?.length) {
    engine.ingest(aifsEns, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('ecmwf_aifs_ens');
  }
  // ICON global (DWD, icosahedral) global, nur bei Einzelwahl.
  if (iconGlobal && iconGlobal.points[0]?.length) {
    engine.ingest(iconGlobal, { temperature: 1.4, wind: 1.4, clouds: 1.4, precipitation: 1.4 });
    modelTags.push('icon_global');
  }
  // AICON (DWD KI): Temp/Wind/Niederschlag (keine Wolken → Gewicht 0).
  if (aicon && aicon.points[0]?.length) {
    engine.ingest(aicon, { temperature: 1.4, wind: 1.4, clouds: 0, precipitation: 1.4 });
    modelTags.push('aicon');
  }
  // ARPEGE (Météo-France global): Temp + Wind (keine Wolken/Regen → Gewicht 0).
  if (arpege && arpege.points[0]?.length) {
    engine.ingest(arpege, { temperature: 1.4, wind: 1.4, clouds: 0, precipitation: 0 });
    modelTags.push('arpege');
  }

  const fused = await engine.run();

  // Modell-Attribution: es rendert immer genau eine Quelle, also nennt das Badge
  // sie schlicht beim Namen (kein „fused"-Präfix mehr — es wird nichts gemischt).
  const SINGLE_MODEL_LABEL: Record<ModelChoice, string> = {
    mosmix: 'DWD MOSMIX',
    arome:  'GeoSphere AROME',
    inca:   'GeoSphere INCA',
    obs:    'Station-Obs',
    'icon-d2-eps': 'DWD ICON-D2-EPS',
    'icon-ch1-eps': 'MeteoSchweiz ICON-CH1',
    'icon-ch2-eps': 'MeteoSchweiz ICON-CH2',
    'arome-fr': 'Météo-France AROME',
    'icon-eu': 'DWD ICON-EU',
    'gfs': 'NOAA GFS',
    'ifs': 'ECMWF IFS',
    'aifs': 'ECMWF AIFS',
    'aifs-ens': 'ECMWF AIFS-ENS',
    'icon-global': 'DWD ICON global',
    'aicon': 'DWD AICON',
    'arpege': 'Météo-France ARPEGE',
  };
  const model = `${SINGLE_MODEL_LABEL[modelChoice]} (${modelTags.join(', ') || 'no data'})`;

  const result: DwdForecastResult = {
    hours: fused.hours.map((h) => ({
      timestamp: h.timestamp,
      layers: h.layers,
    })),
    fetchedAt: fused.fetchedAt,
    uvBounds: fused.uvBounds,
    model,
    demImage: fused.demImage,
    demMax: fused.demMax,
    lapseRatePerM: fused.lapseRatePerM,
  };
  fusedResultCache.set(cKey, { value: result, fetchedAt: Date.now() });
  return result;
}
