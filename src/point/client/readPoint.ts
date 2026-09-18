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
  TIERS, TIER_BY_ID, type TierId, cellOf, chunkOf, stationBundlePath, HMODEL_PRODUCT, HMODEL_VERSION, CUBE_PLANES, CUBE_SCHEMA,
} from '../cubeFormat';
import type { PointRunManifest } from '../manifest';
import type { NowcastSourceId } from '../nowcastFormat';
import { memoStore, withRawFallback, type PointStore, type StoreStats } from './store';
import { POINT_INDEX_PATH as POINT_INDEX_JSON } from '../cubeFormat';
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
import { judgeStation, planPointSources, SELECTION, type PointPlan } from './resolve';
import { loadTerrainAtPoint, type TerrainOptions, type TerrainPointResult } from './terrain';
import { decodeChunkPooled, type ChunkDecoder } from './decodePool';
import { readChunkRanges, type RangedChunk } from './chunkRanges';

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

/** AP7: ein Kern, der spät kommt, soll den Nowcast, der gleich danach kommt, nicht verlieren (set). */
export const LATE_GRACE_MS = 250;

export interface ReadPointOptions {
  store: PointStore;
  /** PNG-Dekoder für die Radar-Frames. Ohne ihn wird der Nowcast übersprungen — und gesagt. */
  decodePng?: PngDecoder;
  /** Dekodierweg für Chunks. Voreinstellung: Worker-Pool im Browser, Hauptthread sonst. */
  decodeChunk?: ChunkDecoder;
  /** Nur diese Ebenen entpacken (Rechenzeit, keine Bytes). */
  wanted?: readonly string[];
  /** AP3: die Nachbarzellen jeder Stufe mitlesen (aus demselben Chunk, 0 zusätzliche Abrufe). */
  neighbours?: boolean;
  nowcast?: boolean;
  /** Gelände-Optionen — oder `false`, um es auszulassen. */
  terrain?: TerrainOptions | false;
  /** Die Auswahlregel am Ende laufen lassen (Voreinstellung ja; kostet mit Memo keinen Abruf). */
  plan?: boolean;
  /** Statische Produkte an den Index-Commit gepinnt lesen statt `@main` (s. Kommentar im Leser, V-FI-6). */
  staticPinned?: boolean;
  /**
   * AP7 (V-FI-16): Frist AB DEM START des Lesens, bis zu der auf die progressiven Produkte (Nowcast,
   * statische Produkte) gewartet wird — nie früher als `lateGraceMs` nach dem Kern. Radar-Slots sind
   * am Edge immer kalt (V-FI-7) — im Lab kam der Nowcast 1,4–2,1 s nach dem Kern und machte aus 0,7 s
   * Antwort 2,8 s. Läuft die Frist ab, fehlt das Produkt im Bündel MIT Hinweis (`skips`), die Abrufe
   * laufen weiter und füllen den Cache für den nächsten Aufruf. Ohne Angabe wird gewartet wie bisher
   * (Sammler, CLI).
   */
  lateDeadlineMs?: number;
  /** Mindestwartezeit nach dem Kern, wenn `lateDeadlineMs` gesetzt ist (Voreinstellung `LATE_GRACE_MS`). */
  lateGraceMs?: number;
  /**
   * AP12 (V-FI-22): das Bündel kommt, SOBALD DER KERN DA IST — Nowcast und statische Produkte, die dann
   * noch laufen, werden nicht abgewartet, sondern stehen als Versprechen in `bundle.late` (der Aufrufer
   * rechnet mit ihnen nach, wenn sie kommen). Ersetzt `lateDeadlineMs`/`lateGraceMs`. Ohne Option
   * unverändert.
   */
  progressive?: boolean;
  /**
   * AP12 (c): nur diese Ebenen der Cube-Chunks über Byte-Bereiche holen (Verzeichnis vorab, dann die Blöcke),
   * den Rest im Hintergrund nachladen und die geprüfte ganze Datei in den Cache legen (`completing`). Liegt
   * die Datei schon im Cache oder ignoriert der Server den Range, gilt die ganze Datei. Jeder Fehler auf
   * diesem Weg ⇒ ganze Datei (benannt). Voreinstellung aus: der erste Bereich je Chunk und Edge ist heute ein
   * MISS der identity-Variante (§9.14.1).
   */
  planeRanges?: readonly string[];
  /**
   * AP12 (E-F-3 (a), Jan 16.09.: „progressives Laden, t1 zuerst … Pflicht in AP12"): wird EINMAL mit einem
   * Bündel der ersten Stufe gerufen (Fenster bis zu ihrem letzten Schritt, dazu Station, Gelände und was vom
   * Radar schon da ist), sobald diese da sind — vor dem Kern. Mit der Option beginnen die übrigen Stufen erst
   * nach der ersten (sonst käme die erste Stufe als letzte an). Trägt die erste Stufe schon das ganze Fenster,
   * wird nicht gerufen.
   */
  onFirst?: (b: PointBundle) => void;
  /**
   * AP12 (e): stale-while-revalidate für den Index — liegt eine Kopie, die jünger ist als diese Frist, wird mit ihr
   * gelesen (keine RTT vor den Chunks); der Index wird trotzdem geholt, und `late.index.changed` sagt, ob er andere
   * Läufe nennt (dann liest der Aufrufer neu). Der Warm-Fall auf Mobil-4G begann mit ≈ 190–650 ms Index-RTT (§9.14.1).
   */
  indexSwrMs?: number;
  onProgress?: (e: { stage: ProgressStage; ms: number }) => void;
}

export interface StationChoice {
  candidate: StationCandidate | null;
  accepted: boolean;
  reason: string;
  nearby: StationCandidate[];
  /** Die Höhe, gegen die das Höhenkriterium geprüft wurde (`null` = nicht geprüft, steht im Grund). */
  elevationM: number | null;
  /**
   * Woher diese Höhe kam: `input` (übergeben), `station` (E-F-12: Punkt ≤ 250 m an der Station —
   * ihre Höhe ist die Punkthöhe, auch für PAP 4), `terrain` (DEM), `null` (keine).
   */
  elevationFrom: 'input' | 'station' | 'terrain' | null;
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
  /**
   * AP12: Produkte, die zur Frist (bzw. im progressiven Modus zum Kern) noch liefen — ihr Abruf läuft
   * weiter, das Versprechen liefert das Ergebnis nach. `skip` ist genau der Eintrag in `skips`, der
   * sie als fehlend benennt (ein Aufrufer, der nachrechnet, nimmt ihn heraus). Fehlt, wenn alles da war.
   */
  late?: {
    nowcast?: { result: Promise<NowcastPointSeries[]>; skip: string };
    static?: { result: Promise<{ hmodel: Partial<Record<TierId, StaticPoint | null>>; urban: StaticPoint | null }>; skip: string };
    /** AP12 (e): der Index kam aus der SWR-Kopie; `changed` = die Nachprüfung nennt andere Läufe (Stufen oder Stationen). */
    index?: { ageMs: number; changed: Promise<boolean> };
  };
  /** AP12 (c): die Vervollständigung der über Bereiche gelesenen Chunks (Rest holen, CRC, Cache) — fehlt ohne `planeRanges`. */
  completing?: Promise<Array<{ tier: TierId; ok: boolean; bytes: number; why?: string }>>;
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
  // AP12 (e): mit `indexSwrMs` zuerst die SWR-Kopie (keine RTT), die Nachprüfung läuft nebenher.
  let swr: { index: PointIndex; ageMs: number } | null = null;
  if (opts.indexSwrMs && store.peek) {
    const hit = await store.peek(POINT_INDEX_JSON, opts.indexSwrMs).catch(() => null);
    if (hit) { try { swr = { index: JSON.parse(new TextDecoder().decode(hit.bytes)) as PointIndex, ageMs: hit.ageMs }; } catch { swr = null; } }
  }
  const freshP = guard('index', loadPointIndex(store));
  const index = swr ? swr.index : await freshP;
  mark('index'); progress('index');
  const base: Omit<PointBundle, 'timing'> & { timing?: PointBundle['timing'] } = {
    input, window: { fromMs, toMs, stepH, nowMs }, index, tiers: [], cube: {}, station: null, stationChoice: null,
    nowcast: [], hmodel: {}, urban: null, terrain: null, plan: null, skips, notes, errors, stats: store.stats,
  };
  if (swr) {
    const stale = swr.index;
    const runsOf = (ix: PointIndex | null) => JSON.stringify([ix?.latestByTier, ix?.stations?.runs?.[0]?.run ?? null]);
    notes.push(`index: aus der SWR-Kopie (${Math.round(swr.ageMs / 1000)} s alt, Commit ${String(stale.commit).slice(0, 7)}) — Nachprüfung läuft (AP12)`);
    base.late = { ...(base.late ?? {}), index: { ageMs: swr.ageMs, changed: freshP.then((f) => !!f && runsOf(f) !== runsOf(stale)) } };
  }
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
  const completions: Array<Promise<{ tier: TierId; ok: boolean; bytes: number; why?: string }>> = [];
  // AP12 (E-F-3 (a)): die übrigen Stufen starten, sobald die BYTES der ersten da sind — nicht erst nach deren
  // Dekodierung (die läuft im Worker und braucht die Leitung nicht).
  let firstBytesIn!: () => void;
  const firstBytesP = new Promise<void>((r) => { firstBytesIn = r; });
  const readTier = async (tierId: TierId): Promise<CubePointSeries | null> => {
    const a = cubeAddress(index, tierId, lat, lon);
    if (!a.ok) { skips.push(a.reason); return null; }
    const { addr } = a;
    const manP: Promise<{ manifest: PointRunManifest | null; from: ManifestOrigin }> =
      loadRunManifestFrom(store, addr.pointer.manifest, index)
        .catch((e) => { errors.push(`cube.${tierId}/manifest: ${errMsg(e)}`); return { manifest: null, from: 'none' as const }; });
    const f0 = now();
    const fo = { priority: tierId === firstTier ? 'high' as const : 'low' as const };
    let bytes: Uint8Array | null = null;
    // AP12 (c): nur die Ebenen der Antwort über Bereiche — jeder Fehler ⇒ ganze Datei, benannt.
    let ranged: RangedChunk | null = null;
    if (opts.planeRanges && store.range) {
      try {
        const rc = await readChunkRanges(store, addr.path, CUBE_PLANES.map((p) => p.id), opts.planeRanges, fo, CUBE_SCHEMA);
        if (rc === null) { phases[`fetch.${tierId}`] = Math.round(now() - f0); skips.push(`${tierId}: Chunk ${addr.path} nicht im Repo (Aufbewahrung?)`); return null; }
        bytes = rc.bytes;
        if (!rc.whole) ranged = rc;
      } catch (e) {
        notes.push(`${tierId}: Ebenen-Bereiche gescheitert (${errMsg(e)}) — ganze Datei (Rückfall)`);
      }
    }
    if (!bytes) bytes = await store.bytes(addr.path, fo);
    phases[`fetch.${tierId}`] = Math.round(now() - f0);
    if (tierId === firstTier) firstBytesIn();
    if (!bytes) { skips.push(`${tierId}: Chunk ${addr.path} nicht im Repo (Aufbewahrung?)`); return null; }

    let planes = planesForChunkHeader(bytes);
    let man: PointRunManifest | null = null;
    let from: ManifestOrigin = 'none';
    let manifestAwaited = false;
    if (!planes && ranged) {
      // Bereiche wurden nach `CUBE_PLANES` geschnitten; ein fremdes Schema braucht die ganze Datei.
      notes.push(`${tierId}: Chunk trägt ein anderes Schema — ganze Datei statt Bereiche (Rückfall)`);
      ranged = null;
      bytes = await store.bytes(addr.path, fo);
      if (!bytes) { skips.push(`${tierId}: Chunk ${addr.path} nicht im Repo (Aufbewahrung?)`); return null; }
    }
    if (!planes) {
      // Fremdes Schema: nur das Manifest kennt die Ebenen.
      const l = await manP; man = l.manifest; from = l.from; manifestAwaited = true;
      planes = man?.planes ?? null;
      if (!planes) { skips.push(`${tierId}: Chunk trägt ein anderes Schema und das Manifest ist nicht lesbar`); return null; }
    }
    // Aus Bereichen: NUR die geholten Ebenen dekodieren (die übrigen Blöcke sind Nullen), ohne Gesamt-CRC.
    const wantedOf = (r: RangedChunk | null) => (r ? (opts.wanted ?? r.wanted).filter((id) => r.wanted.includes(id)) : opts.wanted);
    const d0 = now();
    let chunk = await decode(bytes, { planes, wanted: wantedOf(ranged), ...(ranged ? { checkCrc: false } : {}) });
    phases[`decode.${tierId}`] = Math.round(now() - d0);
    if (!manifestAwaited) { const l = await manP; man = l.manifest; from = l.from; }
    // Gegenprobe: das Manifest nennt dieselben Ebenen wie das Schema. Weicht es ab, gilt das
    // Manifest (es beschreibt DIESEN Lauf) — und der Widerspruch steht im Protokoll.
    if (man && man.planes.length === planes.length && man.planes.some((p, i) => p.id !== planes![i].id)) {
      notes.push(`${tierId}: Ebenenliste des Manifests weicht vom Schema ab — nach Manifest neu dekodiert`);
      if (ranged) {
        // Die Bereiche gehören zur Schema-Reihenfolge — nach dem Manifest gelesen brauchte es andere Blöcke.
        notes.push(`${tierId}: ganze Datei statt Bereiche (Rückfall)`);
        ranged = null;
        bytes = await store.bytes(addr.path, fo);
        if (!bytes) { skips.push(`${tierId}: Chunk ${addr.path} nicht im Repo (Aufbewahrung?)`); return null; }
      }
      chunk = await decode(bytes, { planes: man.planes, wanted: opts.wanted });
      planes = man.planes;
    }
    if (ranged) {
      const r = ranged;
      notes.push(`${tierId}: ${r.wanted.length} von ${planes.length} Ebenen über ${r.requests} Bereiche gelesen (${(r.fetchedBytes / 1024).toFixed(0)} statt ${(r.totalBytes / 1024).toFixed(0)} KB) — die übrigen liest die Antwort nicht; der Rest wird im Hintergrund nachgeladen (AP12)`);
      completions.push(r.complete().then((c) => ({ tier: tierId, ...c })));
    }
    const series = cubeSeriesFrom(chunk, addr, planes, { bytes: bytes.length, manifest: man, manifestFrom: from, wanted: wantedOf(ranged), lat, lon, neighbours: opts.neighbours });
    if (series.provenanceNote) notes.push(`${tierId}: ${series.provenanceNote}`);
    return series;
  };
  const tierPs = new Map<TierId, Promise<CubePointSeries | null>>();
  // AP12 (E-F-3 (a), Jan 16.09.: „t1 zuerst … Pflicht in AP12"): mit `onFirst` beginnen die übrigen Stufen erst,
  // wenn die erste gelesen ist. Auf einer vollen Leitung teilen sich sonst alle Chunks die Bytes, und der größte
  // (t1, ≈ 524 KB) kommt als LETZTER an — die erste Darstellung käme nie vor dem Kern.
  const deferLater = !!opts.onFirst && tiers.length > 1 && firstTier != null;
  for (const t of tiers) {
    const start: Promise<unknown> = deferLater && t !== firstTier ? Promise.race([firstBytesP, tierPs.get(firstTier!)!]) : Promise.resolve();
    tierPs.set(t, start.then(() => guard(`cube.${t}`, readTier(t))).then((r) => { mark(`cube.${t}`); progress(`cube.${t}`); return r; }));
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
    // Höhenkriterium: die übergebene Höhe; sonst — E-F-12 — die Stationshöhe, wenn der Punkt
    // an der Station steht (≤ 250 m: die DEM-Höhe liegt am Gipfel bis 270 m darunter und
    // ließ den Punkt seine eigene Station verwerfen, PA3); sonst die aus dem Gelände. Das
    // Bündel ist längst unterwegs, das Warten kostet auf dem kritischen Pfad nichts.
    const nearby = catalog ? nearestStations(catalog, lat, lon, { limit: 5 }) : [];
    const best = nearby[0] ?? null;
    const atStation = input.elevationM == null && best != null && best.distanceKm <= SELECTION.stationAtPointKm;
    const elev = input.elevationM ?? (atStation ? best.elev : null) ?? (await terrainP)?.elevationM ?? null;
    const elevationFrom: StationChoice['elevationFrom'] = input.elevationM != null ? 'input' : atStation ? 'station' : elev != null ? 'terrain' : null;
    for (const s of nearby) s.dElevM = elev == null ? null : s.elev - elev;
    const judged = judgeStation(!!catalog, best, elev);
    const choice: StationChoice = { candidate: best, accepted: judged.accepted, reason: judged.reason, nearby, elevationM: elev, elevationFrom };
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

  // AP12 (E-F-3 (a)): die erste Darstellung als eigenes Bündel — erste Stufe + Station + Gelände, Fenster bis zu
  // ihrem letzten Schritt; was vom Radar/den statischen Produkten schon da ist, kommt mit. Nur, wenn danach
  // noch Stufen fehlen (sonst ist das Bündel selbst die erste Darstellung).
  let nowcastDone: NowcastPointSeries[] | null = null;
  let urbanDone: StaticPoint | null = null;
  void nowcastP.then((r) => { nowcastDone = r; });
  void urbanP.then((r) => { urbanDone = r; });
  if (deferLater) {
    Promise.all([tierPs.get(firstTier!)!, stationP, terrainP]).then(([s1, st, tr]) => {
      const lastMs = s1?.steps.length ? s1.steps[s1.steps.length - 1].validAtMs : null;
      if (!s1 || lastMs == null || lastMs >= toMs) return;
      const t = Math.round(now() - T0);
      const rest = tiers.filter((x) => x !== firstTier);
      opts.onFirst!({
        ...base,
        window: { ...base.window, toMs: Math.min(toMs, lastMs) },
        tiers: [firstTier!], cube: { [firstTier!]: s1 },
        station: st?.series ?? null, stationChoice: st?.choice ?? null, terrain: tr,
        nowcast: nowcastDone ?? [], hmodel: {}, urban: urbanDone,
        skips: [...skips, `cube: ${rest.join('/')} folgen — erste Darstellung aus ${firstTier} bis ${new Date(lastMs).toISOString().slice(0, 16)}Z (E-F-3, AP12)`],
        notes: [...notes], errors: [...errors],
        timing: { indexMs: doneAt.index ?? null, firstMs: t, coreMs: t, readMs: t, totalMs: t, doneAt: { ...doneAt }, phases: { ...phases } },
        stats: { ...store.stats },
      });
    }).catch(() => { /* die erste Darstellung ist ein Angebot, kein Pflichtteil */ });
  }

  // ── Kern einsammeln (Stufen, Station, Gelände), dann den Rest ────────────
  let coreMs = 0;
  const coreP = Promise.all([stationP, terrainP, ...tierPs.values()]).then(() => { coreMs = Math.round(now() - T0); mark('core'); });
  // AP7: die progressiven Produkte bekommen eine Frist (V-FI-16): `lateDeadlineMs` ab dem START des
  // Lesens, aber nie früher als `lateGraceMs` nach dem Kern (ein langsamer Kern soll den Nowcast, der
  // gleich danach kommt, nicht verlieren). Gemessen 16.09. 22:33: mit einer Frist AB DEM KERN antwortete
  // München bei 2 256 ms (Kern 742 + 1 500), also über dem 2-s-Ziel — der Radar-Slot ist am Edge immer
  // MISS (V-FI-7). Der Verlierer der Frist läuft weiter (Cache), das Bündel sagt, dass er fehlte.
  const LATE = Symbol('late');
  // AP12: progressiv = Frist 0 ab dem Kern, keine Gnadenfrist — was dann noch läuft, kommt über `late`.
  const graceMs = opts.progressive ? 0 : opts.lateGraceMs ?? LATE_GRACE_MS;
  const deadlineMs = opts.progressive ? 0 : opts.lateDeadlineMs;
  const withDeadline = <T>(p: Promise<T>): Promise<T | typeof LATE> => (deadlineMs == null
    ? p
    : Promise.race([p, coreP.then(() => new Promise<typeof LATE>((r) => setTimeout(() => r(LATE), Math.max(graceMs, (deadlineMs as number) - (now() - T0)))))]));
  const staticAll = Promise.all([...hmodelPs.values(), urbanP]).then((arr) => { mark('static'); progress('static'); return arr; });
  const staticOf = (arr: Array<StaticPoint | null>) => {
    const hmodel: Partial<Record<TierId, StaticPoint | null>> = {};
    const tiersList = [...hmodelPs.keys()];
    tiersList.forEach((t, i) => { hmodel[t] = arr[i] ?? null; });
    return { hmodel, urban: arr[tiersList.length] ?? null };
  };
  const lateWhy = opts.progressive
    ? 'zum Kern noch nicht da — die erste Ausgabe rechnet ohne, das Ergebnis folgt (progressiv, AP12)'
    : `nach der Frist (${opts.lateDeadlineMs} ms ab Start, mindestens ${graceMs} ms nach dem Kern) nicht da`;
  const [station, nowcastR, terrain, staticR] = await Promise.all([stationP, withDeadline(nowcastP), terrainP, withDeadline(staticAll), firstP, coreP, ...tierPs.values()]);
  for (const [t, p] of tierPs) base.cube[t] = await p;
  if (completions.length) base.completing = Promise.all(completions);
  if (staticR === LATE) {
    for (const t of hmodelPs.keys()) base.hmodel[t] = null;
    const skip = `static: hmodel/urban ${lateWhy} — Abruf läuft weiter (V-FI-16)`;
    skips.push(skip);
    (base.late ??= {}).static = { result: staticAll.then(staticOf), skip };
  } else {
    const s = staticOf(staticR);
    base.hmodel = s.hmodel;
    base.urban = s.urban;
  }
  base.station = station?.series ?? null;
  base.stationChoice = station?.choice ?? null;
  if (nowcastR === LATE) {
    base.nowcast = [];
    const skip = `nowcast: Radar ${lateWhy} — Modell statt Radar für 0–3 h, Abruf läuft weiter (V-FI-16)`;
    skips.push(skip);
    (base.late ??= {}).nowcast = { result: nowcastP, skip };
  } else {
    base.nowcast = nowcastR;
  }
  base.terrain = terrain;
  const readMs = Math.round(now() - T0);
  mark('read'); progress('read');

  // ── Auswahlregel — über den Memo-Store, also ohne weiteren Abruf ─────────
  if (opts.plan !== false) {
    // Dieselbe Höhe wie die Stationswahl (E-F-12: an der Station deren Höhe), sonst Gelände.
    const elev = input.elevationM ?? base.stationChoice?.elevationM ?? terrain?.elevationM ?? null;
    base.plan = await guard('plan', planPointSources(store, {
      lat, lon, elevationM: elev, nowMs, stepH,
      ...(input.atMs != null ? { atMs: input.atMs } : { fromMs, toMs }),
    }));
    mark('plan');
  }
  progress('done');
  return finish(firstMs, coreMs, readMs);
}
