/**
 * stationPoint.ts — das Stationsprodukt an einem Ort lesen (PD-D2).
 *
 * MOSMIX-L ist im Repo ein eigenes Produkt, kein Gitter (PD-B9): 3 071 feste Punkte,
 * stündlich bis +247 h, im selben Container mit `ny = 1`. Es ist die einzige Quelle im
 * Repo, die **am Ort** gilt statt in einer Modellzelle — und die einzige ohne jede
 * Unsicherheitsangabe. Beides entscheidet die Auswahl in `resolve.ts`.
 *
 * ⚠ Der Katalog deckt die **Cube-Box** (45,5–55,5 °N / 5,5–17,5 °E), nicht DACH: der
 * erste Eintrag ist Falsterbo in Schweden. Wer „nächste Station" ohne Abstandsprüfung
 * nimmt, bekommt für einen Punkt an der Nordsee eine dänische Station und merkt es nicht.
 */

import { decodeCubeChunk, dequantize, planeOffset, MISSING, STATION_CATALOG_PATH } from '../cubeFormat';
import type { PointStore } from './store';
import { distanceKm } from './cubePoint';

export interface StationCatalogEntry {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Stationshöhe in m. Sie ist zugleich `hModEff` im Bündel — MOSMIX gilt AM Ort. */
  elev: number;
}

export interface StationCatalog {
  schema: number;
  updatedAt: string;
  source: string;
  domain: { latMin: number; latMax: number; lonMin: number; lonMax: number };
  count: number;
  stations: StationCatalogEntry[];
}

export interface StationRunManifest {
  schema: number;
  product: 'stations';
  source: string;
  run: string;
  runAt: string;
  ageH: number;
  tier: string;
  stationCount: number;
  axis: { leadHours: number[] };
  chunks: Array<{ cy: number; cx: number; file: string; bytes: number; stations: string[] }>;
  planes: Array<{ id: string; unit: string; scale: number; offset: number; group: string }>;
  notMapped: Record<string, string>;
  parameters: string[];
  caveats: string[];
}

/** Eine Station mit ihrem Abstand zum angefragten Punkt. */
export interface StationCandidate extends StationCatalogEntry {
  distanceKm: number;
  /** Höhendifferenz Station − Punkt in m; `null`, wenn die Punkthöhe unbekannt ist. */
  dElevM: number | null;
}

export async function loadStationCatalog(store: PointStore): Promise<StationCatalog | null> {
  return store.json<StationCatalog>(STATION_CATALOG_PATH);
}

/**
 * Die n nächsten Stationen, sortiert nach Abstand.
 *
 * `elevationM` ist bewusst optional und wird NICHT geraten: die echte Punkthöhe kommt
 * beim Client aus den Terrarium-Kacheln, die er ohnehin lädt (PD-A, §25). Fehlt sie,
 * bleibt `dElevM` `null` — und die Auswahlregel sagt dann ausdrücklich, dass sie das
 * Höhenkriterium nicht anwenden konnte, statt es stillschweigend zu überspringen.
 */
export function nearestStations(
  catalog: StationCatalog,
  lat: number,
  lon: number,
  opts: { elevationM?: number | null; limit?: number } = {},
): StationCandidate[] {
  const limit = opts.limit ?? 5;
  const h = opts.elevationM ?? null;
  return catalog.stations
    .map((s) => ({
      ...s,
      distanceKm: distanceKm(lat, lon, s.lat, s.lon),
      dElevM: h == null ? null : s.elev - h,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export interface StationPointStep {
  leadH: number;
  validAtMs: number;
  values: Record<string, number | null>;
}

export interface StationPointSeries {
  product: 'stations';
  station: StationCandidate;
  run: string;
  runAtMs: number;
  /** Alter des Laufs zum Zeitpunkt der Veröffentlichung, aus dem Manifest. */
  ageH: number;
  bundle: { path: string; bytes: number; column: number; stations: number };
  steps: StationPointStep[];
  planes: StationRunManifest['planes'];
  filledPlanes: string[];
  /** Was MOSMIX ausdrücklich NICHT führt, mit Grund — benannt abwesend (PD-B9). */
  notMapped: Record<string, string>;
  caveats: string[];
}

/**
 * Liest die Reihe einer Station. `null`, wenn das Bündel nicht mehr im Repo steht.
 */
export async function readStationPoint(
  store: PointStore,
  manifest: StationRunManifest,
  station: StationCandidate,
): Promise<StationPointSeries | null> {
  const ch = manifest.chunks.find((c) => c.stations.includes(station.id));
  if (!ch) return null;
  const column = ch.stations.indexOf(station.id);
  const bytes = await store.bytes(ch.file);
  if (!bytes) return null;

  const chunk = await decodeCubeChunk(bytes, { planes: manifest.planes });
  if (chunk.ny !== 1) {
    throw new Error(`stationPoint: ${ch.file} hat ny=${chunk.ny}, erwartet 1 — Stationsbündel ist eine Zeile`);
  }
  if (column < 0 || column >= chunk.nx) {
    throw new Error(`stationPoint: Spalte ${column} liegt nicht in ${ch.file} (nx=${chunk.nx})`);
  }

  const runAtMs = Date.parse(manifest.runAt);
  const filled = new Set<string>();
  const steps: StationPointStep[] = [];
  for (let it = 0; it < chunk.nt; it++) {
    const leadH = manifest.axis.leadHours[it];
    const values: Record<string, number | null> = {};
    for (let pi = 0; pi < manifest.planes.length; pi++) {
      const plane = manifest.planes[pi];
      const raw = chunk.planes[pi];
      if (raw.length === 0) continue;
      const q = raw[planeOffset(chunk, it, 0, column)];
      if (q === MISSING) { values[plane.id] = null; continue; }
      values[plane.id] = dequantize(q, plane);
      filled.add(plane.id);
    }
    steps.push({ leadH, validAtMs: runAtMs + leadH * 3_600_000, values });
  }

  return {
    product: 'stations',
    station,
    run: manifest.run,
    runAtMs,
    ageH: manifest.ageH,
    bundle: { path: ch.file, bytes: bytes.length, column, stations: ch.stations.length },
    steps,
    planes: manifest.planes,
    filledPlanes: manifest.planes.map((p) => p.id).filter((id) => filled.has(id)),
    notMapped: manifest.notMapped,
    caveats: manifest.caveats,
  };
}
