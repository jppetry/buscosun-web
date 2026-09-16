/**
 * staticPoint.ts — die zeitlosen Produkte an einem Punkt: Modellhöhe **je Quelle**
 * (PD-E, Posten 2) und das Stadt-Raster (PD-U, `urban/v1`).
 *
 * ── Wozu ────────────────────────────────────────────────────────────────────
 * Der Cube trägt `hModEff`, das **Mittel** der Modellorographien der beitragenden
 * Quellen. PAP 4 korrigiert `h_true − h_mod_eff`; welche Höhe dort steht, entscheidet
 * die ganze Korrektur. Am echten Bau gemessen (t3, 0,25°, 2026-09-13):
 *
 *   Innsbruck   echte Höhe 574 m   ICON global 1332 m · IFS 1402 m · AIFS 1672 m
 *   Zugspitze              2962 m               1333 m ·     1374 m ·     1123 m
 *
 * Die Modelle sind sich über die Höhe **derselben Zelle** um bis zu 340 m uneinig, und
 * der Fehler gegen die Wirklichkeit geht in die Kilometer. Das Mittel verschweigt beides.
 *
 * `urban/v1` trägt `imperv`, `d0` und `bldgH` je t1-Zelle (GHSL) — die Eingaben der
 * Wärmeinsel- und Blending-Height-Terme in PAP 5 (E-13, seit 2026-09-15 im Repo).
 *
 * ── Was dieser Leser NICHT tut ──────────────────────────────────────────────
 * Er korrigiert nichts. PAP 4/5 sind die nächsten Etappen; hier wird nur lesbar, was der
 * Producer bisher weggemittelt hat oder was neu dazugekommen ist.
 *
 * ── Kosten ──────────────────────────────────────────────────────────────────
 * Beide Produkte liegen im Chunk-Raster des Cubes: derselbe `(cy, cx)`, den der Client
 * für seinen Punkt ohnehin liest, also **eine kleine Datei** (t1 rund 0,7 KiB) statt
 * einer Gitterdatei. Sie sind `TIMELESS` — und **in place veränderlich** (ein Modell-
 * Upgrade schreibt dieselben Pfade neu): gelesen werden sie deshalb über den an den
 * Index-Commit gepinnten Store (V-FI-1), Manifest UND Chunk.
 *
 * AP1: `readStaticProductPoint` holt Manifest und Chunk PARALLEL (der Chunk-Pfad ist aus
 * dem Raster bekannt, das Manifest liefert nur die Ebenenliste) und ist die eine Form
 * für beide Produkte; `readHmodelPoint`/`readUrbanPoint` sind ihre benannten Aufrufe.
 */

import {
  TIER_BY_ID, type TierId,
  cellOf, chunkOf, decodeCubeChunk, dequantize, planeOffset, MISSING,
  staticChunkPath, staticManifestPath, HMODEL_PRODUCT, HMODEL_VERSION,
} from '../cubeFormat';
import type { FetchOpts, PointStore } from './store';
import type { ChunkDecoder } from './decodePool';

export const URBAN_PRODUCT = 'urban';
export const URBAN_VERSION = 'v1';

/** Eine Spalte des Produkts, wie `static.json` sie beschreibt. */
export interface HmodelPlane {
  id: string;
  /** `native` = vom Betreiber als HSURF veröffentlicht, `derived-gh-sp` = aus gh + sp gerechnet. */
  provenance: 'native' | 'derived-gh-sp' | string;
  note: string | null;
  unit: string;
  scale: number;
  offset: number;
  hash: string;
  covered: number;
  minM: number | null;
  maxM: number | null;
}

export interface HmodelManifest {
  product: string;
  version: string;
  kind: 'static' | string;
  what: string;
  why: string;
  chunkCells: number;
  provenanceKinds: Record<string, string>;
  tiers: Record<string, {
    planes: HmodelPlane[];
    chunks: number; bytes: number; cy: number; cx: number; ny: number; nx: number; deg: number;
    builtFrom: string | null; builtAt: string;
    /** Quelle → Grund, warum sie KEINE Höhe hat. Benannt abwesend statt stumm leer. */
    absent: Record<string, string>;
  }>;
  updatedAt?: string;
}

/**
 * Das Manifest eines statischen Produkts, so allgemein, wie beide Produkte es brauchen:
 * `hmodel` führt die Ebenen je Stufe, `urban` EINE Liste für alle Stufen. Der Leser
 * nimmt die Stufenliste, wenn es sie gibt, sonst die Produktliste.
 */
export interface StaticManifest {
  product: string;
  version: string;
  kind?: string;
  planes?: Array<{ id: string; unit: string; scale: number; offset: number; provenance?: string; note?: string | null; what?: string }>;
  tiers?: Record<string, {
    planes?: Array<{ id: string; unit: string; scale: number; offset: number; provenance?: string; note?: string | null }>;
    absent?: Record<string, string>;
    chunks?: number; bytes?: number;
  }>;
  updatedAt?: string;
}

/** Die Werte einer Zelle, je Spalte — die eine Form für beide Produkte. */
export interface StaticPoint {
  product: string;
  version: string;
  tier: TierId;
  chunk: { path: string; bytes: number; cy: number; cx: number };
  /** Spalte → Wert; `null` heißt „die Spalte deckt diese Zelle nicht". */
  byColumn: Record<string, number | null>;
  /** Herkunft je Spalte, wo das Produkt eine nennt. */
  provenance: Record<string, string>;
  /** Spalte → Grund, warum es sie in dieser Stufe nicht gibt. */
  absent: Record<string, string>;
  /** Spanne über die belegten Spalten (bei `hmodel`: was `hModEff` verschweigt). */
  spreadM: number | null;
}

/** Die Modellhöhen einer Zelle, je Quelle (PD-E-Form; `bySource` = `byColumn`). */
export interface HmodelPoint {
  tier: TierId;
  version: string;
  chunk: { path: string; bytes: number; cy: number; cx: number };
  /** Quelle → Höhe in m; `null` heißt „die Quelle deckt diese Zelle nicht". */
  bySource: Record<string, number | null>;
  /** Herkunft je Quelle — `derived-gh-sp` ist gerechnet, nicht veröffentlicht. */
  provenance: Record<string, string>;
  /** Quelle → Grund, warum es für sie gar keine Höhe gibt. */
  absent: Record<string, string>;
  /**
   * Die Spanne über die Quellen, die diese Zelle decken. Das ist die Zahl, die sagt, wie
   * viel `hModEff` verschweigt: sind sich die Modelle einig, ist sie klein.
   */
  spreadM: number | null;
}

export async function loadHmodelManifest(store: PointStore): Promise<HmodelManifest | null> {
  return store.json<HmodelManifest>(staticManifestPath(HMODEL_PRODUCT, HMODEL_VERSION));
}

export async function loadStaticManifest(store: PointStore, product: string, version: string): Promise<StaticManifest | null> {
  return store.json<StaticManifest>(staticManifestPath(product, version));
}

function planesOf(manifest: StaticManifest, tierId: TierId) {
  return manifest.tiers?.[tierId]?.planes ?? manifest.planes ?? null;
}

const defaultDecode: ChunkDecoder = (b, o) => decodeCubeChunk(b, { planes: o.planes, wanted: o.wanted });

/**
 * Ein statisches Produkt an einem Punkt. Manifest und Chunk werden PARALLEL geholt; das
 * Ergebnis ist `null`, wenn es das Produkt (noch) nicht gibt, die Stufe keine Spalten hat
 * oder der Punkt außerhalb des Gitters liegt — alles ausdrücklich kein Fehler.
 */
export async function readStaticProductPoint(
  store: PointStore,
  product: string,
  version: string,
  tierId: TierId,
  lat: number,
  lon: number,
  opts: { manifest?: StaticManifest | Promise<StaticManifest | null>; decodeChunk?: ChunkDecoder; priority?: FetchOpts['priority'] } = {},
): Promise<StaticPoint | null> {
  const tier = TIER_BY_ID[tierId];
  const cell = cellOf(tier, lat, lon);
  if (!cell) return null;
  const ch = chunkOf(cell.iy, cell.ix);
  const path = staticChunkPath(product, version, tierId, ch.cy, ch.cx);
  const fo: FetchOpts | undefined = opts.priority ? { priority: opts.priority } : undefined;

  const [manifest, bytes] = await Promise.all([
    opts.manifest ?? store.json<StaticManifest>(staticManifestPath(product, version), fo),
    store.bytes(path, fo),
  ]);
  if (!manifest) return null;
  const planes = planesOf(manifest, tierId);
  if (!planes || !planes.length) return null;
  if (!bytes) return null;

  // Die Ebenenliste kommt aus DEM Manifest, nicht aus `CUBE_PLANES`: dieses Produkt hat
  // eine eigene. `decodeCubeChunk` bricht laut ab, wenn die Liste nicht so lang ist wie
  // `nvar` im Kopf — eine Verwechslung ist damit hörbar.
  const chunk = await (opts.decodeChunk ?? defaultDecode)(bytes, { planes });
  const ry = cell.iy - chunk.y0;
  const rx = cell.ix - chunk.x0;
  if (ry < 0 || rx < 0 || ry >= chunk.ny || rx >= chunk.nx) {
    throw new Error(`staticPoint: Zelle ${cell.iy}/${cell.ix} liegt nicht in ${path}`);
  }
  const off = planeOffset(chunk, 0, ry, rx);

  const byColumn: Record<string, number | null> = {};
  const provenance: Record<string, string> = {};
  const seen: number[] = [];
  for (let pi = 0; pi < planes.length; pi++) {
    const p = planes[pi];
    const q = chunk.planes[pi][off];
    const v = q === MISSING ? null : dequantize(q, p);
    byColumn[p.id] = v;
    if (p.provenance) provenance[p.id] = p.provenance;
    if (v != null) seen.push(v);
  }

  return {
    product, version: manifest.version ?? version, tier: tierId,
    chunk: { path, bytes: bytes.length, cy: ch.cy, cx: ch.cx },
    byColumn, provenance,
    absent: manifest.tiers?.[tierId]?.absent ?? {},
    spreadM: seen.length >= 2 ? Math.max(...seen) - Math.min(...seen) : null,
  };
}

/**
 * Die Modellhöhen an einem Punkt (PD-E-Form). `null`, wenn es das Produkt (noch) nicht
 * gibt oder der Punkt außerhalb des Gitters liegt — beides ausdrücklich kein Fehler.
 */
export async function readHmodelPoint(
  store: PointStore,
  manifest: HmodelManifest,
  tierId: TierId,
  lat: number,
  lon: number,
  opts: { decodeChunk?: ChunkDecoder } = {},
): Promise<HmodelPoint | null> {
  const r = await readStaticProductPoint(store, HMODEL_PRODUCT, HMODEL_VERSION, tierId, lat, lon,
    { manifest: manifest as unknown as StaticManifest, decodeChunk: opts.decodeChunk });
  if (!r) return null;
  return { tier: r.tier, version: r.version, chunk: r.chunk, bySource: r.byColumn, provenance: r.provenance, absent: r.absent, spreadM: r.spreadM };
}

/** Das Stadt-Raster (`imperv` %, `d0` m, `bldgH` m) — heute nur in t1 gebaut. */
export async function readUrbanPoint(
  store: PointStore,
  lat: number,
  lon: number,
  opts: { manifest?: StaticManifest | Promise<StaticManifest | null>; decodeChunk?: ChunkDecoder; tierId?: TierId; priority?: FetchOpts['priority'] } = {},
): Promise<StaticPoint | null> {
  return readStaticProductPoint(store, URBAN_PRODUCT, URBAN_VERSION, opts.tierId ?? 't1', lat, lon, opts);
}
