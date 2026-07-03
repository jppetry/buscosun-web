/**
 * Orchestrates the full data-source → fusion-engine → layer-ready PNGs flow.
 *
 * **Default path is DWD-only, no Open-Meteo.** Open-Meteo Free Tier is
 *   - hard-limited (10 000/day, 5 000/hour, 600/min)
 *   - explicitly **non-commercial** ("operating websites or apps that have
 *     subscriptions or display advertisements" counts as commercial → paid)
 * For a public DACH web-app we therefore lean on the CC-BY 4.0 / unlimited
 * stack: DWD MOSMIX via BrightSky (forecast) + DWD RADOLAN (live radar).
 *
 * Open-Meteo is available as an **opt-in boost** (`useOpenMeteo: true`) for
 * private/dev use, in which case it auto-routes ICON-D2 / ICON-CH1 / AROME-AT.
 * On 429 it silently degrades back to DWD-only.
 */

import {
  fetchForecastGrid,
  DACH_BOUNDS,
  type ForecastBounds,
} from '../sources/openMeteoForecast';
import { fetchBrightSkyGrid } from '../sources/brightSkyForecast';
import { fetchBrightSkyCurrentGrid } from '../sources/brightSkyCurrent';
import { fetchGeoSphereIncaGrid } from '../sources/geosphereInca';
import { fetchGeoSphereAromeGrid } from '../sources/geosphereArome';
import { fetchIconD2EpsGrid } from '../sources/iconD2EpsSource';
import { fetchIconChEpsGrid } from '../sources/iconChEpsSource';
import { fetchAromeFranceGrid } from '../sources/aromeFranceSource';
import { fetchIconEuRasterGrid } from '../sources/iconEuRasterSource';
import { fetchTawesCurrentGrid } from '../sources/geosphereTawes';
import { fetchSmnCurrentGrid } from '../sources/meteoSwissSmn';
import { fetchSmhiCurrentGrid } from '../sources/smhiStations';
import { fetchDmiCurrentGrid } from '../sources/dmiStations';
import { fetchIpmaCurrentGrid } from '../sources/ipmaStations';
import { FusionEngine, type FusionV2Flags } from './fusionEngine';
// Dev-only: registers window.__captureFusionFixture for recording verification
// fixtures from real sources. Self-guards to DEV; no-op in production.
import './captureFixture';
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
 * Background-prefetch the secondary alpine sources (AROME, INCA, TAWES, SMN)
 * so Phase B's full-quality fusion can read them from cache instead of
 * waiting for cold network fetches. Called from MapView right after Phase A
 * kicks off — the requests run on separate connections, parallel to the
 * Phase-A computation, and are populated in `sourceCache` by the time
 * Phase B starts ~ 80-1500 ms later.
 */
export function prefetchSecondarySources(hours = 24): void {
  // Fire-and-forget. Errors silently fall back to live fetch in loadFusedForecast.
  const fireSafe = (key: string, fn: () => Promise<unknown>) => {
    const k = sourceKey(key, hours);
    if (sourceCache.has(k)) return;
    void fn().then((v) => { if (v != null) sourceCache.set(k, { value: v, fetchedAt: Date.now() }); }).catch(() => {});
  };
  fireSafe('arome', () => fetchGeoSphereAromeGrid({ cols: 12, rows: 7, hours }));
  fireSafe('inca',  () => fetchGeoSphereIncaGrid({ cols: 12, rows: 8, hours: Math.min(hours, 4) }));
  fireSafe('tawes', () => fetchTawesCurrentGrid());
  fireSafe('smn',   () => fetchSmnCurrentGrid({ maxStations: 80 }));
}

/**
 * Prefetch the primary German backbone (DWD-Obs live stations + MOSMIX
 * forecast). These are the two sources that the default Fusion mode for
 * DE ingests with the highest weight; warming them on the landing page
 * means MapView's Phase A only has to run the fusion compute (~ 500 ms).
 */
export function prefetchPrimarySources(hours = 6): void {
  const fireSafe = (key: string, fn: () => Promise<unknown>) => {
    const k = sourceKey(key, hours);
    if (sourceCache.has(k)) return;
    void fn().then((v) => { if (v != null) sourceCache.set(k, { value: v, fetchedAt: Date.now() }); }).catch(() => {});
  };
  // DWD-Obs is hour=0 only — the `hours` cache-key is informational.
  fireSafe('dwd_obs', () => fetchBrightSkyCurrentGrid({ cols: 10, rows: 8 }));
  // MOSMIX bias-corrected ICON-EU — the bulk of Phase A's data.
  fireSafe('mosmix',  () => fetchBrightSkyGrid({ bounds: DACH_VIEW.bounds, cols: 16, rows: 13, hours }));
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
 * Single-source choices that restrict the fusion to a specific model. When
 * `modelChoice` is undefined or 'fusion' (default), all sources matching the
 * country profile contribute. Any other value isolates that source — useful
 * for transparency (users can compare AROME vs MOSMIX vs the fused view).
 *
 *  'fusion'   → default Buscosun fusion across all sources
 *  'mosmix'   → DWD MOSMIX only (DE forecast backbone, CC-BY 4.0)
 *  'arome'    → GeoSphere AROME-AT only (2.5 km, AT/CH/sDE coverage)
 *  'inca'     → GeoSphere INCA nowcast only (AT, 1 km, ~3 h horizon)
 *  'obs'      → live station obs only (DWD + TAWES + SMN, h=0)
 *  'icon-d2-eps' → DWD ICON-D2-EPS ensemble mean only (2.2 km icosahedral, DACH)
 *  'icon-ch1-eps' / 'icon-ch2-eps' → MeteoSchweiz ICON-CH control run only (CH)
 *  'arome-fr' → Météo-France AROME-France 0.01° only (temp+wind; DE/CH + west AT)
 *  'icon-eu' → DWD ICON-EU single-level 2D raster only (all DACH)
 */
export type ModelChoice =
  | 'fusion' | 'mosmix' | 'arome' | 'inca' | 'obs'
  | 'icon-d2-eps' | 'icon-ch1-eps' | 'icon-ch2-eps' | 'arome-fr' | 'icon-eu';

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
   * Restrict the fusion to a single model — see `ModelChoice`. Used by the
   * UI "Modell" selector for transparency. Default 'fusion' (all sources).
   */
  modelChoice?: ModelChoice;
  /**
   * Dense grid resolution for the IDW output. Default 160 × 128 — the
   * full-quality production grid. For a fast first-paint use 80 × 64 (4×
   * less per-hour IDW work), then re-fire at full quality in background.
   */
  denseCols?: number;
  denseRows?: number;
  /**
   * Quick-mode: skips secondary alpine/national sources (AROME, INCA, TAWES,
   * SMN) and disables the per-variable Gaussian smoothing for non-temperature
   * grids. Used by the Phase-A first-paint to get user-visible weather data
   * within ~ 500 ms after sources warm; Phase B re-fires WITHOUT quickMode
   * to fill in the full-fidelity field.
   */
  quickMode?: boolean;
  /**
   * Opt in to Open-Meteo as an additional source. Default **false** because
   * the Free Tier is non-commercial and rate-limited. Set to true only for
   * private/dev use, or after acquiring a Standard/Professional subscription.
   */
  useOpenMeteo?: boolean;
  /** When `useOpenMeteo` is true, also add a dedicated ICON-D2 DACH call. */
  useDachBias?: boolean;
  /**
   * fusion engine v2 staged sub-flags (all default off). When unset in dev, the
   * engine also honours `window.__fusionV2` so a build can be A/B-tested from
   * the console without a rebuild. See `docs/fusionV2-plan.md`.
   */
  fusionV2?: FusionV2Flags;
}

export async function loadFusedForecast(options: FusedLoadOptions = {}): Promise<DwdForecastResult> {
  // Resolve the country profile (default DE for backwards-compat).
  const profile: CountryProfile = options.country
    ? COUNTRY_PROFILES[options.country]
    : COUNTRY_PROFILES.DE;
  const hours = options.hours ?? profile.forecastHours;
  const _denseCols = options.denseCols ?? 160;
  const _denseRows = options.denseRows ?? 128;
  const _modelChoice: ModelChoice = options.modelChoice ?? 'fusion';
  const _quickMode = options.quickMode ?? false;
  // fusionV2 sub-flags: explicit option wins; otherwise a dev-only console
  // override (`window.__fusionV2 = { oi: true }`) enables A/B testing without a
  // rebuild. Prod ships with the flags off unless a caller opts in.
  const fusionV2: FusionV2Flags | undefined = options.fusionV2
    ?? ((import.meta.env?.DEV && typeof window !== 'undefined')
      ? (window as unknown as { __fusionV2?: FusionV2Flags }).__fusionV2
      : undefined);
  // Cache hit? Sub-100 ms response for already-computed combinations. The
  // quick-mode flag is part of the cache key — Phase A and Phase B never
  // share a cache slot (different visual fidelity). ALL fusionV2 sub-flags join
  // the key so toggling any of them (oi / incrementPersist / uncertainty /
  // bgMinVar / bgOffDiag) recomputes instead of returning a stale result.
  const v2Key = `${fusionV2?.oi ? 'o' : ''}${fusionV2?.incrementPersist ? 'p' : ''}${fusionV2?.uncertainty ? 'u' : ''}${fusionV2?.bgMinVar ? 'b' : ''}${fusionV2?.bgOffDiag ? 'd' : ''}`;
  const cKey = resultKey(options.country, hours, _modelChoice, _denseCols, _denseRows, _quickMode)
    + `|v2${v2Key}`;
  const cachedResult = fusedResultCache.get(cKey);
  if (cachedResult && Date.now() - cachedResult.fetchedAt < RESULT_TTL_MS) {
    return cachedResult.value;
  }
  // Always render the grid over DACH so the map (which now opens at the
  // DACH overview regardless of search country) shows continuous coverage
  // across DE/AT/CH. profile.bounds is kept for callers that explicitly
  // want a country-specific extent.
  const bounds = options.bounds ?? DACH_VIEW.bounds;
  const useOpenMeteo = options.useOpenMeteo ?? false;
  const useDachBias = options.useDachBias ?? false;
  const tempRange = options.temperatureRange ?? { min: -20, max: 40 };
  const modelChoice: ModelChoice = options.modelChoice ?? 'fusion';
  // Per-source gates that combine the country profile flag with the model
  // choice. When the user picks a single model, only that source fires.
  // Observations (DWD-Obs + TAWES + SMN) are treated as one group under 'obs'.
  const allow = (m: ModelChoice) => modelChoice === 'fusion' || modelChoice === m;
  const isFusion = modelChoice === 'fusion';
  const useObs = allow('obs');
  const useMosmix = allow('mosmix');
  // Quick-mode (Phase A first-paint) suppresses secondary alpine sources
  // (AROME / INCA / TAWES / SMN) to shave ~ 1.5 s off the first paint — BUT
  // only in 'fusion' mode, where MOSMIX + DWD-Obs already deliver a usable
  // preview. When the user has explicitly picked AROME or INCA as the sole
  // model, suppressing them in Phase A would yield an EMPTY Phase A render
  // (nothing else fires), so we keep them in regardless of quickMode.
  const skipSecondary = isFusion && _quickMode;
  const useInca   = allow('inca')  && !skipSecondary;
  const useArome  = allow('arome') && !skipSecondary;
  // ICON-D2-EPS deckt ganz DACH (icosahedral) → unabhängig vom Länderprofil.
  // Nicht in quickMode's skipSecondary, weil es bei expliziter Wahl die einzige
  // Quelle ist (sonst leerer Phase-A-Render).
  const useEps = allow('icon-d2-eps');
  // ICON-CH1/CH2-EPS-Kontrolllauf: CH-only → NUR bei expliziter Einzelwahl, nie
  // in der DACH-weiten 'fusion'-Mischung (sonst CH-Daten für DE/AT + ungewollte
  // Änderung der Hausmischung). `allow` schließt 'fusion' ein, daher direkt.
  const useCh1 = modelChoice === 'icon-ch1-eps';
  const useCh2 = modelChoice === 'icon-ch2-eps';
  // AROME-France (0,01°): nur bei expliziter Einzelwahl (großes GRIB, CH-/DE-/
  // West-AT-Domäne) — nie in der 'fusion'-Mischung.
  const useAromeFr = modelChoice === 'arome-fr';
  // ICON-EU (single-level 2D): nur bei expliziter Einzelwahl.
  const useIconEu = modelChoice === 'icon-eu';
  const useTawesOrSmnInQuick = !skipSecondary;

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
    fusionV2,
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

  // --- Source A (opt-in): Open-Meteo best_match (ICON-D2/CH1/AROME auto) ----
  let openMeteoOk = false;
  if (useOpenMeteo && !options.signal?.aborted) {
    try {
      const primary = await fetchForecastGrid({
        bounds,
        cols: 20,
        rows: 16,
        hours,
        model: 'best_match',
        signal: options.signal,
      });
      engine.ingest(primary, { temperature: 1, wind: 1, clouds: 1, precipitation: 1 });
      openMeteoOk = true;
      modelTags.push('best_match');
    } catch {
      if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      // Throttled / unreachable — silently degrade to DWD-only.
    }
  }

  // --- Source B (opt-in): ICON-D2 explicit DACH bias (Open-Meteo) ----------
  if (useOpenMeteo && useDachBias && openMeteoOk && !options.signal?.aborted) {
    try {
      const dachBounds: ForecastBounds = {
        lngMin: 5.0,
        lngMax: 17.0,
        latMin: 45.5,
        latMax: 55.5,
      };
      const dach = await fetchForecastGrid({
        bounds: dachBounds,
        cols: 12,
        rows: 10,
        hours,
        model: 'icon_d2',
        signal: options.signal,
      });
      engine.ingest(dach, { temperature: 1.6, wind: 1.4, clouds: 1.3, precipitation: 1.8 });
      modelTags.push('icon_d2');
    } catch {
      // best_match-only fallback
    }
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
  const wantTawes  = profile.useTawes  && useObs && useTawesOrSmnInQuick;
  const wantSmn    = profile.useSmn    && useObs && useTawesOrSmnInQuick;
  const wantEps    = useEps;
  const wantCh1    = useCh1;
  const wantCh2    = useCh2;
  const wantAromeFr = useAromeFr;
  const wantIconEu  = useIconEu;

  const [obs, bs, inca, arome, tawes, smn, eps, ch1, ch2, aromeFr, iconEu] = await Promise.all([
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
  ]);

  // Live obs — dominate hour 0 with measurement weight.
  if (obs && obs.points[0]?.length) {
    engine.ingest(obs, { temperature: 5.0, wind: 3.0, clouds: 2.0, precipitation: 4.0 });
    modelTags.push('dwd_obs');
  }
  // MOSMIX — DE forecast backbone.
  if (bs) {
    const weight = openMeteoOk ? 0.6 : 1.4;
    engine.ingest(bs, { temperature: weight, wind: weight, clouds: weight * 0.7, precipitation: weight });
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

  // --- Source I (SE live stations, hour 0 only): SMHI ------------------------
  // SMHI is geographically out of scope for the DE/AT/CH country pages.
  // Kept here behind a hard-off so it can be re-enabled if a pan-EU mode is
  // reintroduced.
  if (false && !options.signal?.aborted) {
    try {
      const smhi = await fetchSmhiCurrentGrid();
      if (smhi.points[0]?.length) {
        engine.ingest(smhi, {
          temperature: 5.0,
          wind: 3.0,
          clouds: 0,
          precipitation: 4.0,
        });
        modelTags.push('smhi');
      }
    } catch {
      if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    }
  }

  // --- Source J (DK live stations, hour 0 only): DMI -------------------------
  // Out of scope for the DE/AT/CH country pages — see SMHI note.
  if (false && !options.signal?.aborted) {
    try {
      const dmi = await fetchDmiCurrentGrid();
      if (dmi.points[0]?.length) {
        engine.ingest(dmi, {
          temperature: 5.0,
          wind: 3.0,
          clouds: 0,
          precipitation: 4.0,
        });
        modelTags.push('dmi');
      }
    } catch {
      if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    }
  }

  // --- Source K (PT live stations, hour 0 only): IPMA ------------------------
  // Out of scope for the DE/AT/CH country pages — see SMHI note.
  if (false && !options.signal?.aborted) {
    try {
      const ipma = await fetchIpmaCurrentGrid();
      if (ipma.points[0]?.length) {
        engine.ingest(ipma, {
          temperature: 5.0,
          wind: 3.0,
          clouds: 0,
          precipitation: 4.0,
        });
        modelTags.push('ipma');
      }
    } catch {
      if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    }
  }

  const fused = await engine.run();

  // Model attribution: when a single model was selected explicitly, surface
  // its name plainly (without "fused" prefix) so the UI badge reads e.g.
  // "MOSMIX" instead of "fused (mosmix)". Default 'fusion' choice keeps the
  // fused-tag for transparency about combined sources.
  const SINGLE_MODEL_LABEL: Record<ModelChoice, string> = {
    fusion: 'Buscosun Fusion',
    mosmix: 'DWD MOSMIX',
    arome:  'GeoSphere AROME',
    inca:   'GeoSphere INCA',
    obs:    'Station-Obs',
    'icon-d2-eps': 'DWD ICON-D2-EPS',
    'icon-ch1-eps': 'MeteoSchweiz ICON-CH1',
    'icon-ch2-eps': 'MeteoSchweiz ICON-CH2',
    'arome-fr': 'Météo-France AROME',
    'icon-eu': 'DWD ICON-EU',
  };
  const model = modelChoice !== 'fusion'
    ? `${SINGLE_MODEL_LABEL[modelChoice]} (${modelTags.join(', ') || 'no data'})`
    : modelTags.length
      ? `Buscosun Fusion (${modelTags.join(' + ')})`
      : fused.model;

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
