/**
 * staticPoint.ts — die Modellhöhe **je Quelle** an einem Punkt (PD-E, Posten 2).
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
 * ── Was dieser Leser NICHT tut ──────────────────────────────────────────────
 * Er korrigiert nichts. PAP 4 ist die nächste Phase; hier wird nur lesbar, was der
 * Producer bisher weggemittelt hat.
 *
 * ── Kosten ──────────────────────────────────────────────────────────────────
 * Das Produkt liegt im Chunk-Raster des Cubes: derselbe `(cy, cx)`, den der Client für
 * seinen Punkt ohnehin liest, also **eine kleine Datei** (t1 rund 0,7 KiB) statt einer
 * Gitterdatei. Es ist `TIMELESS` — einmal geholt, gilt es bis zum nächsten
 * Modell-Upgrade; die Fassung steht im Pfad.
 */

import {
  TIER_BY_ID, type TierId,
  cellOf, chunkOf, decodeCubeChunk, dequantize, planeOffset, MISSING,
  staticChunkPath, staticManifestPath, HMODEL_PRODUCT, HMODEL_VERSION,
} from '../cubeFormat';
import type { PointStore } from './store';

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

/** Die Modellhöhen einer Zelle, je Quelle. */
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

/**
 * Die Modellhöhen an einem Punkt. `null`, wenn es das Produkt (noch) nicht gibt oder der
 * Punkt außerhalb des Gitters liegt — beides ausdrücklich kein Fehler.
 */
export async function readHmodelPoint(
  store: PointStore,
  manifest: HmodelManifest,
  tierId: TierId,
  lat: number,
  lon: number,
): Promise<HmodelPoint | null> {
  const tm = manifest.tiers?.[tierId];
  if (!tm || !tm.planes?.length) return null;
  const tier = TIER_BY_ID[tierId];
  const cell = cellOf(tier, lat, lon);
  if (!cell) return null;
  const ch = chunkOf(cell.iy, cell.ix);

  const path = staticChunkPath(HMODEL_PRODUCT, HMODEL_VERSION, tierId, ch.cy, ch.cx);
  const bytes = await store.bytes(path);
  if (!bytes) return null;

  // Die Ebenenliste kommt aus DEM Manifest, nicht aus `CUBE_PLANES`: dieses Produkt hat
  // eine eigene (eine Ebene je Quelle). `decodeCubeChunk` bricht laut ab, wenn die Liste
  // nicht so lang ist wie `nvar` im Kopf — eine Verwechslung ist damit hörbar.
  const chunk = await decodeCubeChunk(bytes, { planes: tm.planes });
  const ry = cell.iy - chunk.y0;
  const rx = cell.ix - chunk.x0;
  if (ry < 0 || rx < 0 || ry >= chunk.ny || rx >= chunk.nx) {
    throw new Error(`staticPoint: Zelle ${cell.iy}/${cell.ix} liegt nicht in ${path}`);
  }
  const off = planeOffset(chunk, 0, ry, rx);

  const bySource: Record<string, number | null> = {};
  const provenance: Record<string, string> = {};
  const seen: number[] = [];
  for (let pi = 0; pi < tm.planes.length; pi++) {
    const p = tm.planes[pi];
    const q = chunk.planes[pi][off];
    const v = q === MISSING ? null : dequantize(q, p);
    bySource[p.id] = v;
    provenance[p.id] = p.provenance;
    if (v != null) seen.push(v);
  }

  return {
    tier: tierId,
    version: manifest.version,
    chunk: { path, bytes: bytes.length, cy: ch.cy, cx: ch.cx },
    bySource,
    provenance,
    absent: tm.absent ?? {},
    spreadM: seen.length >= 2 ? Math.max(...seen) - Math.min(...seen) : null,
  };
}
