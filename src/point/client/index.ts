/**
 * src/point/client — der Lesevertrag für `buscosun-data` (Phase PD-D).
 *
 * Alles, was ein Verbraucher braucht, um aus dem Daten-Repo eine Punktreihe zu bekommen:
 * Transport, die drei Produktleser und der Auswähler. **Kein Verbraucher ist verdrahtet**
 * — Einstiege sind heute die CLI `scripts/point/read-point.mjs` und der Verifier.
 *
 * Wer hier importiert, importiert nur `src/point/*`: die Module hängen an keiner
 * Renderpfad-Datei und stehen in null Bundle-Chunks (Textsonde im Verifier).
 */

export {
  httpStore, memoryStore, POINT_CDN_BASE, POINT_RAW_BASE,
  type PointStore, type StoreStats, type HttpStoreOptions,
} from './store';

export {
  loadPointIndex, loadRunManifest, readCubePoint, stepNearest, distanceKm,
  type PointIndex, type CubePointSeries, type CubePointStep, type ReadCubeOptions,
} from './cubePoint';

export {
  loadStationCatalog, nearestStations, readStationPoint,
  type StationCatalog, type StationCatalogEntry, type StationCandidate,
  type StationRunManifest, type StationPointSeries, type StationPointStep,
} from './stationPoint';

export {
  findLatestSlot, nowcastSourcesFor, readNowcastPoint,
  type NowcastSlot, type NowcastPointSeries, type PngDecoder, type ReadNowcastOptions,
} from './nowcastPoint';

export {
  loadHmodelManifest, readHmodelPoint,
  type HmodelManifest, type HmodelPlane, type HmodelPoint,
} from './staticPoint';

export {
  SELECTION, planPointSources,
  type ProductId, type Candidate, type Decision, type PlanSegment, type PointPlan, type PlanInput,
} from './resolve';
