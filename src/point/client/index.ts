/**
 * src/point/client — der Lesevertrag für `buscosun-data` (Phase PD-D, erweitert in FI/AP1).
 *
 * Alles, was ein Verbraucher braucht, um aus dem Daten-Repo eine Punktreihe zu bekommen:
 * Transport (mit Memo und IndexedDB-Cache), die Produktleser, der parallele Bündel-Leser,
 * der Gelände-Leser und der Auswähler. **Kein Verbraucher ist verdrahtet** — Einstiege
 * sind heute die CLI `scripts/point/read-point.mjs`, der Laufzeit-Harnisch
 * (`scripts/pv-latency/lab.ts`) und der Verifier.
 *
 * Wer hier importiert, importiert nur `src/point/*`: die Module hängen an keiner
 * Renderpfad-Datei und stehen in null Bundle-Chunks (Textsonde im Verifier).
 * `decodeWorker.ts` wird von Vite als eigener Worker-Chunk gebaut, sobald ein Verbraucher
 * `decodePool.ts` erreicht — heute keiner.
 */

export {
  httpStore, memoryStore, memoStore, fallbackStore, withRawFallback, rawBaseOf, newStoreStats, POINT_CDN_BASE, POINT_RAW_BASE, RAW_FALLBACK_HEDGE_MS,
  type PointStore, type StoreStats, type HttpStoreOptions, type FetchOpts,
} from './store';

export {
  cachedStore, idbBackend, memoryBackend, defaultCachePolicy, newCacheStats,
  type CacheBackend, type CacheEntry, type CachePolicy, type CacheStats, type CachedStoreOptions,
} from './cache';

export {
  loadPointIndex, loadRunManifest, loadRunManifestFrom, manifestStore, readCubePoint, stepNearest, distanceKm,
  cubeAddress, cubeSeriesFrom, planesForChunkHeader,
  type PointIndex, type CubePointSeries, type CubePointStep, type ReadCubeOptions, type ManifestOrigin, type CubeAddress,
} from './cubePoint';

export {
  decodeChunkPooled, decodeChunkMain, configureDecodePool, decodePoolInfo,
  type ChunkDecoder, type DecodeOpts,
} from './decodePool';

export {
  loadStationCatalog, nearestStations, readStationPoint,
  type StationCatalog, type StationCatalogEntry, type StationCandidate,
  type StationRunManifest, type StationPointSeries, type StationPointStep,
} from './stationPoint';

export {
  findLatestSlot, nowcastSourcesFor, readNowcastPoint, slotMsOf,
  type NowcastSlot, type NowcastPointSeries, type PngDecoder, type ReadNowcastOptions,
} from './nowcastPoint';

export {
  loadHmodelManifest, loadStaticManifest, readHmodelPoint, readStaticProductPoint, readUrbanPoint,
  URBAN_PRODUCT, URBAN_VERSION,
  type HmodelManifest, type HmodelPlane, type HmodelPoint, type StaticManifest, type StaticPoint,
} from './staticPoint';

export {
  loadTerrainAtPoint, tilesForRadius, TERRAIN_SCALES, TERRARIUM_TILE_URL,
  type TerrainOptions, type TerrainPointResult, type TerrainScale, type RgbaDecoder,
} from './terrain';

export { decodeGrayPngBrowser, decodeRgbaPngBrowser, type DecodedRgba } from './browserPng';

export {
  readPointBundle, windowOf, tiersForWindow, nowcastTimes,
  type ReadPointInput, type ReadPointOptions, type PointBundle, type StationChoice, type ProgressStage,
} from './readPoint';

export {
  SELECTION, planPointSources, judgeStation,
  type ProductId, type Candidate, type Decision, type PlanSegment, type PointPlan, type PlanInput,
} from './resolve';
