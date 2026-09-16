/**
 * readPoint.ts — der PARALLELE Leseweg für einen Punkt (Phase FI, AP1).
 *
 * ── Was AP0 gemessen hat und was hier anders ist ───────────────────────────
 * Der Leser aus PD-D (`read-point.mjs`) holt 18–37 Dateien NACHEINANDER: Index, Katalog,
 * Stationsmanifest, je Radarquelle bis zu drei Sonden, dann je Stufe `run.json` und
 * Chunk, dann Bündel, dann bis zu 25 Radar-Frames. Im Browser gemessen: 3,0 s p50
 * Desktop, 13,6 s Mobil-4G, 38,9 s 3G (§9.0.4). Nicht die Bytes waren das Problem,
 * sondern die Reihenfolge.
 *
 * Hier hängt nach dem Index NICHTS mehr an etwas anderem, außer es muss:
 *
 *   Index (no-cache)
 *    ├─ je Stufe: Chunk ‖ run.json (@commit) → Dekodierung im Worker, sobald der Chunk da ist
 *    ├─ Katalog ‖ Stationsmanifest ‖ Bündel des eigenen Chunks (optimistisch)
 *    ├─ je Radarquelle: Sonden (4 gleichzeitig) → Frames NUR auf den Ausgabezeiten, parallel
 *    ├─ hmodel + urban (gepinnt): Manifest ‖ Chunk
 *    └─ Gelände: z11 ‖ z8 (parallel dazu, eigener Cache)
 *
 * Die Chunk-Adresse kommt aus dem Index (`cubeAddress`), das `run.json` liefert nur die
 * Provenienz — kommt es nicht oder kennt es die Stufe nicht (V-FI-1), stehen die Werte
 * trotzdem da, mit `provenanceNote`. Die Auswahlregel (`planPointSources`) läuft am Ende
 * über denselben Memo-Store und kostet dann keinen Abruf mehr.
 *
 * ── Was dieser Leser NICHT ist ─────────────────────────────────────────────
 * Kein Algorithmus. Er liest, was das Repo an diesem Punkt hat, und sagt, wie lange was
 * gedauert hat (`timing`), was fehlte (`skips`) und was schiefging (`errors`). buscosun
 * Fusion (AP2 ff.) nimmt das Bündel als Eingabe.
 */

import {
  TIERS, TIER_BY_ID, type TierId, cellOf, chunkOf, stationBundlePath, HMODEL_PRODUCT, HMODEL_VERSION,
} from '../cubeFormat';
import type { PointRunManifest } from '../manifest';
import type { NowcastSourceId } from '../nowcastFormat';
import { memoStore, withRawFallback, type PointStore, type StoreStats } from './store';
import {
  cubeAddress, cubeSeriesFrom, loadPointIndex, loadRunManifestFrom, manifestStore, planesForChunkHeader,
  type CubePointSeries, type ManifestOrigin, type PointIndex,
} from './cubePoint';
import {
  loadStationCatalog, nearestStations, readStationPoint,
  type StationCandidate, type StationPointSeries, type StationRunManifest,
} from './stationPoint';
import { nowcastSourcesFor, readNowcastPoint, type NowcastPointSeries, type PngDecoder } from './nowcastPoint';
import { readStaticProductPoint, readUrbanPoint, type StaticPoint } from './staticPoint';
import { judgeStation, planPointSources, type PointPlan } from './resolve';
import { loadTerrainAtPoint, type TerrainOptions, type TerrainPointResult } from './terrain';
import { decodeChunkPooled, type ChunkDecoder } from './decodePool';

const H = 3_600_000;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface ReadPointInput {
  lat: number;
  lon: number;
  /** Echte Geländehöhe, falls bekannt. Sonst kommt sie aus dem Gelände-Leser — oder bleibt `null` und wird gesagt. */
  elevationM?: number | null;
  nowMs?: number;
  /** Ein Zeitpunkt … */
  atMs?: number;
  /** … oder ein Zeitraum (Voreinstellung: jetzt … +336 h). */
  fromMs?: number;
  toMs?: number;
  /** Ausgaberaster in Stunden (Voreinstellung 1) — bestimmt auch, welche Radar-Frames geholt werden. */
  stepH?: number;
}

export type ProgressStage = 'index' | `cube.${TierId}` | 'station' | 'nowcast' | 'static' | 'terrain' | 'first' | 'read' | 'done';

export interface ReadPointOptions {
  store: PointStore;
  /** PNG-Dekoder für die Radar-Frames. Ohne ihn wird der Nowcast übersprungen — und gesagt. */
  decodePng?: PngDecoder;
  /** Dekodierweg für Chunks. Voreinstellung: Worker-Pool im Browser, Hauptthread sonst. */
  decodeChunk?: ChunkDecoder;
  /** Nur diese Ebenen entpacken (Rechenzeit, keine Bytes). */
  wanted?: readonly string[];
  nowcast?: boolean;
  /** Gelände-Optionen — oder `false`, um es auszulassen. */
  terrain?: TerrainOptions | false;
  /** Die Auswahlregel am Ende laufen lassen (Voreinstellung ja; kostet mit Memo keinen Abruf). */
  plan?: boolean;
  /** Statische Produkte an den Index-Commit gepinnt lesen statt `@main` (s. Kommentar im Leser, V-FI-6). */
  staticPinned?: boolean;
  onProgress?: (e: { stage: ProgressStage; ms: number }) => void;
}

export interface StationChoice {
  candidate: StationCandidate | null;
  accepted: boolean;
  reason: string;
  nearby: StationCandidate[];
  /** Die Höhe, gegen die das Höhenkriterium geprüft wurde (`null` = nicht geprüft, steht im Grund). */
  elevationM: number | null;
}

export interface PointBundle {
  input: ReadPointInput;
  window: { fromMs: number; toMs: number; stepH: number; nowMs: number };
  index: PointIndex | null;
  /** Die Stufen, die das Fenster berühren (± 3 h Rand). */
  tiers: TierId[];
  cube: Partial<Record<TierId, CubePointSeries | null>>;
  station: StationPointSeries | null;
  stationChoice: StationChoice | null;
  nowcast: NowcastPointSeries[];
  hmodel: Partial<Record<TierId, StaticPoint | null>>;
  urban: StaticPoint | null;
  terrain: TerrainPointResult | null;
  plan: PointPlan | null;
  /** Produkte, die es an diesem Punkt/Fenster NICHT gab — mit Grund. */
  skips: string[];
  /** Provenienz-Hinweise (Werte da, Herkunft unvollständig). */
  notes: string[];
  /** Ausnahmen je Produkt — ein Produkt reißt das Bündel nie mit. */
  errors: string[];
  timing: {
    /** Index gelesen. */
    indexMs: number | null;
    /** Erste Darstellung möglich: die Stufe am Fensteranfang + Gelände (der Nowcast kommt nach). */
    firstMs: number | null;
    /**
     * Der KERN gelesen: Cube-Stufen, Station, Gelände — alles, was buscosun Fusion für
     * die Ausgabe braucht. Statische Produkte und Nowcast kommen nach (progressiv); ihre
     * Zeiten stehen in `doneAt`. Das ist die „Lesephase" der AP1-Abnahme.
     */
    coreMs: number;
    /** Alle Produkte gelesen (ohne Auswahlregel), Nowcast und statische Produkte eingeschlossen. */
    readMs: number;
    totalMs: number;
    /** Fertig-Zeitpunkte je Produkt ab Start (kritischer Pfad = das Maximum). */
    doneAt: Record<string, number>;
    /** Dauern einzelner Schritte (Abruf/Dekodierung je Stufe). */
    phases: Record<string, number>;
  };
  stats: StoreStats;
}

/** Das Zeitfenster der Anfrage — dieselbe Regel wie in `planPointSources`. */
export function windowOf(input: ReadPointInput, nowMs: number): { fromMs: number; toMs: number; stepH: number } {
  const stepH = input.stepH ?? 1;
  if (input.atMs != null) return { fromMs: input.atMs, toMs: input.atMs, stepH };
  const fromMs = input.fromMs ?? nowMs;
  return { fromMs, toMs: input.toMs ?? fromMs + 336 * H, stepH };
}

/** Welche Stufen ein Fenster berührt (Rand `marginH`, damit der nächste Rasterschritt einer Naht dabei ist). */
export function tiersForWindow(index: PointIndex, fromMs: number, toMs: number, marginH = 3): TierId[] {
  const out: TierId[] = [];
  for (const tier of TIERS) {
    const p = index.latestByTier[tier.id];
    if (!p || !p.runAt) continue;
    const runAt = Date.parse(p.runAt);
    const a = runAt + (tier.fromH - marginH) * H;
    const b = runAt + (tier.toH + marginH) * H;
    if (toMs >= a && fromMs <= b) out.push(tier.id);
  }
  return out;
}

/** Die Ausgabezeiten, die ein Radar-Frame treffen kann: das Raster im Nowcast-Horizont. */
export function nowcastTimes(fromMs: number, toMs: number, stepH: number, nowMs: number, horizonH = 3): number[] {
  const lo = nowMs - 30 * 60_000;
  const hi = nowMs + horizonH * H + 30 * 60_000;
  const out: number[] = [];
  for (let t = fromMs; t <= toMs && out.length < 64; t += Math.max(0.25, stepH) * H) {
    if (t >= lo && t <= hi) out.push(t);
    if (fromMs === toMs) break;
  }
  return out;
}

export async function readPointBundle(input: ReadPointInput, opts: ReadPointOptions): Promise<PointBundle> {
  const T0 = now();
  const nowMs = input.nowMs ?? Date.now();
  const { fromMs, toMs, stepH } = windowOf(input, nowMs);
  const { lat, lon } = input;
  const skips: string[] = [];
  const notes: string[] = [];
  const errors: string[] = [];
  const errMsg0 = (e: unknown) => String((e as Error)?.message ?? e);
  // V-FI-5: ein 403/Fristablauf am CDN geht über raw.githubusercontent — benannt, gezählt.
  const store = memoStore(withRawFallback(opts.store, {
    onFallback: (path, e) => notes.push(`cdn: ${path} über raw.githubusercontent nachgeholt (${errMsg0(e)})`),
  }));
  const decode = opts.decodeChunk ?? decodeChunkPooled;
  const doneAt: Record<string, number> = {};
  const phases: Record<string, number> = {};
  const mark = (k: string) => { doneAt[k] = Math.round(now() - T0); };
  const progress = (stage: ProgressStage) => opts.onProgress?.({ stage, ms: Math.round(now() - T0) });
  const errMsg = (e: unknown) => String((e as Error)?.message ?? e);
  const guard = async <T>(label: string, p: Promise<T>): Promise<T | null> => {
    try { return await p; } catch (e) { errors.push(`${label}: ${errMsg(e)}`); return null; }
  };

  // ── Gelände läuft ab dem ersten Takt, unabhängig vom Index ───────────────
  const terrainP: Promise<TerrainPointResult | null> = opts.terrain
    ? guard('terrain', loadTerrainAtPoint(lat, lon, opts.terrain)).then((r) => { mark('terrain'); progress('terrain'); return r; })
    : Promise.resolve(null);

  // ── Index ───────────────────────────────────────────────────────────────
  const index = await guard('index', loadPointIndex(store));
  mark('index'); progress('index');
  const base: Omit<PointBundle, 'timing'> & { timing?: PointBundle['timing'] } = {
    input, window: { fromMs, toMs, stepH, nowMs }, index, tiers: [], cube: {}, station: null, stationChoice: null,
    nowcast: [], hmodel: {}, urban: null, terrain: null, plan: null, skips, notes, errors, stats: store.stats,
  };
  const finish = (firstMs: number | null, coreMs: number, readMs: number): PointBundle => ({
    ...base,
    timing: { indexMs: doneAt.index ?? null, firstMs, coreMs, readMs, totalMs: Math.round(now() - T0), doneAt, phases },
  });
  if (!index) {
    skips.push('index: point/index.json nicht lesbar — kein Produkt adressierbar');
    base.terrain = await terrainP;
    const t = Math.round(now() - T0);
    return finish(null, t, t);
  }

  const tiers = tiersForWindow(index, fromMs, toMs);
  base.tiers = tiers;
  if (!tiers.length) skips.push(`cube: keine Stufe trägt das Fenster ${new Date(fromMs).toISOString()} … ${new Date(toMs).toISOString()}`);
  // Die Stufe am Fensteranfang geht mit hoher Priorität — sie ist die erste Darstellung.
  const firstTier = tiers[0] ?? null;

  // ── Cube je Stufe: Chunk ‖ Manifest, Dekodierung sobald der Chunk da ist ─
  const readTier = async (tierId: TierId): Promise<CubePointSeries | null> => {
    const a = cubeAddress(index, tierId, lat, lon);
    if (!a.ok) { skips.push(a.reason); return null; }
    const { addr } = a;
    const manP: Promise<{ manifest: PointRunManifest | null; from: ManifestOrigin }> =
      loadRunManifestFrom(store, addr.pointer.manifest, index)
        .catch((e) => { errors.push(`cube.${tierId}/manifest: ${errMsg(e)}`); return { manifest: null, from: 'none' as const }; });
    const f0 = now();
    const bytes = await store.bytes(addr.path, { priority: tierId === firstTier ? 'high' : 'low' });
    phases[`fetch.${tierId}`] = Math.round(now() - f0);
    if (!bytes) { skips.push(`${tierId}: Chunk ${addr.path} nicht im Repo (Aufbewahrung?)`); return null; }

    let planes = planesForChunkHeader(bytes);
    let man: PointRunManifest | null = null;
    let from: ManifestOrigin = 'none';
    let manifestAwaited = false;
    if (!planes) {
      // Fremdes Schema: nur das Manifest kennt die Ebenen.
      const l = await manP; man = l.manifest; from = l.from; manifestAwaited = true;
      planes = man?.planes ?? null;
      if (!planes) { skips.push(`${tierId}: Chunk trägt ein anderes Schema und das Manifest ist nicht lesbar`); return null; }
    }
    const d0 = now();
    let chunk = await decode(bytes, { planes, wanted: opts.wanted });
    phases[`decode.${tierId}`] = Math.round(now() - d0);
    if (!manifestAwaited) { const l = await manP; man = l.manifest; from = l.from; }
    // Gegenprobe: das Manifest nennt dieselben Ebenen wie das Schema. Weicht es ab, gilt das
    // Manifest (es beschreibt DIESEN Lauf) — und der Widerspruch steht im Protokoll.
    if (man && man.planes.length === planes.length && man.planes.some((p, i) => p.id !== planes![i].id)) {
      notes.push(`${tierId}: Ebenenliste des Manifests weicht vom Schema ab — nach Manifest neu dekodiert`);
      chunk = await decode(bytes, { planes: man.planes, wanted: opts.wanted });
      planes = man.planes;
    }
    const series = cubeSeriesFrom(chunk, addr, planes, { bytes: bytes.length, manifest: man, manifestFrom: from, wanted: opts.wanted, lat, lon });
    if (series.provenanceNote) notes.push(`${tierId}: ${series.provenanceNote}`);
    return series;
  };
  const tierPs = new Map<TierId, Promise<CubePointSeries | null>>();
  for (const t of tiers) {
    tierPs.set(t, guard(`cube.${t}`, readTier(t)).then((r) => { mark(`cube.${t}`); progress(`cube.${t}`); return r; }));
  }

  // ── Statische Produkte ────────────────────────────────────────────────────
  // In place veränderlich (V-FI-1) — aber die an den Index-Commit gepinnte Fassung ist für
  // JEDEN Nutzer nach JEDEM Publish ein Edge-MISS: im Lab am 16.09. gemessen 0,9–2,1 s je
  // 1,5-KB-Datei, achtmal täglich neu (V-FI-6). Deshalb `@main` mit 12-h-Cache (die
  // CDN-eigene `s-maxage`); die Ebenenzahl prüft der Decoder laut, eine Umordnung der
  // Spalten bei gleicher Zahl bliebe still — die Spalten sind seit PD-E dieselben.
  // `staticPinned: true` schaltet auf die gepinnte Fassung zurück (Sammler, Gegenproben).
  const staticStore = opts.staticPinned ? manifestStore(store, index) : store;
  const hmodelPs = new Map<TierId, Promise<StaticPoint | null>>();
  for (const t of tiers) {
    hmodelPs.set(t, guard(`hmodel.${t}`, readStaticProductPoint(staticStore, HMODEL_PRODUCT, HMODEL_VERSION, t, lat, lon, { decodeChunk: decode, priority: 'low' })));
  }
  const urbanP = guard('urban', readUrbanPoint(staticStore, lat, lon, { decodeChunk: decode, priority: 'low' }));
  const staticDone = Promise.all([...hmodelPs.values(), urbanP]).then(() => { mark('static'); progress('static'); });

  // ── Station: Katalog ‖ Manifest ‖ Bündel des eigenen Chunks (optimistisch) ─
  const readStation = async (): Promise<{ series: StationPointSeries | null; choice: StationChoice }> => {
    const run = index.stations?.runs?.[0] ?? null;
    const catalogP = loadStationCatalog(store, { priority: 'high' });
    const manifestP: Promise<StationRunManifest | null> = run ? store.json<StationRunManifest>(run.manifest, { priority: 'high' }) : Promise.resolve(null);
    const cell = cellOf(TIER_BY_ID.t1, lat, lon);
    if (run && cell) {
      const ch = chunkOf(cell.iy, cell.ix);
      // Der Memo-Store merkt sich die Zusage; der Stationsleser holt denselben Pfad später
      // aus dem Memo, wenn die Station im eigenen Chunk liegt (der Regelfall bei ≤ 15 km).
      void store.bytes(stationBundlePath(run.run, ch.cy, ch.cx), { priority: 'high' }).catch(() => null);
    }
    const catalog = await catalogP;
    // Höhenkriterium: die übergebene Höhe, sonst die aus dem Gelände — das Bündel ist
    // längst unterwegs, das Warten kostet auf dem kritischen Pfad nichts.
    const elev = input.elevationM ?? (await terrainP)?.elevationM ?? null;
    const nearby = catalog ? nearestStations(catalog, lat, lon, { elevationM: elev, limit: 5 }) : [];
    const best = nearby[0] ?? null;
    const judged = judgeStation(!!catalog, best, elev);
    const choice: StationChoice = { candidate: best, accepted: judged.accepted, reason: judged.reason, nearby, elevationM: elev };
    if (!judged.accepted || !best) { skips.push(`stations: ${judged.reason}`); return { series: null, choice }; }
    if (!run) { skips.push('stations: kein Lauf im Index'); return { series: null, choice }; }
    const manifest = await manifestP;
    if (!manifest) { skips.push(`stations: Manifest ${run.manifest} nicht lesbar`); return { series: null, choice }; }
    const series = await readStationPoint(store, manifest, best, { decodeChunk: decode, priority: 'high' });
    if (!series) skips.push(`stations: Bündel für ${best.id} nicht im Repo`);
    return { series, choice };
  };
  const stationP = guard('station', readStation()).then((r) => { mark('station'); progress('station'); return r; });

  // ── Nowcast: Sonden parallel, Frames nur auf den Ausgabezeiten ───────────
  const readNowcast = async (): Promise<NowcastPointSeries[]> => {
    if (opts.nowcast === false) return [];
    if (!opts.decodePng) { skips.push('nowcast: kein PNG-Dekoder übergeben'); return []; }
    const sources: NowcastSourceId[] = nowcastSourcesFor(lat, lon);
    if (!sources.length) { skips.push('nowcast: keine Radarquelle deckt diesen Punkt'); return []; }
    const times = nowcastTimes(fromMs, toMs, stepH, nowMs);
    if (!times.length) { skips.push('nowcast: keine Ausgabezeit im Radar-Horizont (0–3 h)'); return []; }
    const decodePng = opts.decodePng;
    const res = await Promise.all(sources.map((src) =>
      guard(`nowcast.${src}`, readNowcastPoint(store, src, lat, lon, { nowMs, decodePng, atMs: times, probeBatch: 4, priority: 'low' }))));
    const out = res.filter((r): r is NowcastPointSeries => !!r);
    if (!out.length) skips.push(`nowcast: ${sources.join('/')} — kein Slot oder kein Frame auf den Ausgabezeiten`);
    return out;
  };
  const nowcastP = guard('nowcast', readNowcast()).then((r) => { mark('nowcast'); progress('nowcast'); return r ?? []; });

  // ── Erste Darstellung: die Stufe, die den Fensteranfang trägt + Gelände ──────
  // Der Nowcast gehört NICHT dazu: seine Dateien sind alle fünf Minuten neu und damit am
  // Edge fast immer MISS (gemessen 1,4–1,6 s je Sonde und Frame) — er kommt nach, wie er
  // kommt, und ein Verbraucher zeichnet ihn nach (progressiv, E-F-3).
  let firstMs: number | null = null;
  const firstP = Promise.all([firstTier ? tierPs.get(firstTier)! : Promise.resolve(null), terrainP])
    .then(() => { firstMs = Math.round(now() - T0); mark('first'); progress('first'); });

  // ── Kern einsammeln (Stufen, Station, Gelände), dann den Rest ────────────
  let coreMs = 0;
  const coreP = Promise.all([stationP, terrainP, ...tierPs.values()]).then(() => { coreMs = Math.round(now() - T0); mark('core'); });
  const [station, nowcast, terrain] = await Promise.all([stationP, nowcastP, terrainP, staticDone, firstP, coreP, ...tierPs.values()]);
  for (const [t, p] of tierPs) base.cube[t] = await p;
  for (const [t, p] of hmodelPs) base.hmodel[t] = await p;
  base.urban = await urbanP;
  base.station = station?.series ?? null;
  base.stationChoice = station?.choice ?? null;
  base.nowcast = nowcast;
  base.terrain = terrain;
  const readMs = Math.round(now() - T0);
  mark('read'); progress('read');

  // ── Auswahlregel — über den Memo-Store, also ohne weiteren Abruf ─────────
  if (opts.plan !== false) {
    const elev = input.elevationM ?? terrain?.elevationM ?? null;
    base.plan = await guard('plan', planPointSources(store, {
      lat, lon, elevationM: elev, nowMs, stepH,
      ...(input.atMs != null ? { atMs: input.atMs } : { fromMs, toMs }),
    }));
    mark('plan');
  }
  progress('done');
  return finish(firstMs, coreMs, readMs);
}
