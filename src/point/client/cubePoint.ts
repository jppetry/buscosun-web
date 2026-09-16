/**
 * cubePoint.ts — den Punkt-Cube an EINEM Ort lesen (PD-D2).
 *
 * Der Producer schreibt seit PD-A Flächen; gelesen wird eine Zeitreihe an einem Punkt.
 * Diese Datei ist die Gegenrichtung — und sie benutzt dafür ausschließlich die Form aus
 * `cubeFormat.ts`, die der Producer auch benutzt (`cellOf`, `chunkOf`, `chunkPath`,
 * `decodeCubeChunk`, `dequantize`). Kein Pfad wird hier zusammengesetzt.
 *
 * ── Drei Dinge, die dieser Leser NICHT tut ─────────────────────────────────
 * Er interpoliert nicht zwischen Rasterstunden, er glättet keine Stufennaht, und er
 * rechnet keine Höhenkorrektur. Alle drei wären Algorithmus (PAP 4/6) und gehören in die
 * nächste Phase. Was er stattdessen tut: die Abweichung **benennen** — Abstand zur
 * Rasterstunde, `hModEff` gegen die echte Höhe, Alter je Herkunft.
 */

import {
  TIER_BY_ID, type TierId, type CubeTier,
  cellOf, cellCenter, chunkOf, chunkPath, decodeCubeChunk, dequantize, planeOffset, MISSING,
  PRESSURE_LEVELS_HPA, pressurePlaneId,
} from '../cubeFormat';
import type { PointRunManifest, PointSourceManifest, PointTierManifest } from '../manifest';
import { POINT_INDEX_PATH } from '../cubeFormat';
import type { PointStore } from './store';

/**
 * Der Index, wie ihn `buildPointIndex()` schreibt.
 *
 * Bewusst als `ReturnType` des Producers und nicht als eigene Deklaration: eine zweite
 * Typdeklaration wäre wieder eine zweite Wahrheit, die auseinanderlaufen kann. Der
 * Import ist reiner Typ und kostet zur Laufzeit nichts.
 */
export type PointIndex = ReturnType<typeof import('../manifest').buildPointIndex>;

/** Erdradius für die Abstandsangaben dieses Lesers. */
const EARTH_R_KM = 6371;

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function loadPointIndex(store: PointStore): Promise<PointIndex | null> {
  return store.json<PointIndex>(POINT_INDEX_PATH);
}

/**
 * Der Store für VERÄNDERLICHE Dateien: `@<commit>` statt `@main` (V-FI-1).
 *
 * `point/<lauf>/run.json` wird je Stufe gemergt (der t2-Job schreibt in das Verzeichnis
 * des t1-Laufs) und beim Aufräumen beschnitten — die Datei unter festem Pfad ändert sich,
 * der Publisher purgt aber nur `index.json`. Am 16.09. nannte das CDN für `2026091600`
 * die Stufen t1+t2, das Repo t2+t3: ein Leser fand t3 nicht und meldete NICHTS. Der
 * Index trägt den Commit, unter dem er geschrieben wurde; alles, was er nennt, gibt es
 * genau dort — und `@<sha>` ist bei jsDelivr unveränderlich (gemessen: 200, `immutable`,
 * die gepinnte Fassung trug t2+t3). Chunks bleiben unter `@main`: ihr Pfad enthält den
 * Lauf, sie ändern sich nie, und `@main` ist am Edge warm, `@<sha>` je Commit kalt.
 * Ohne Commit im Index oder ohne jsDelivr-Basis bleibt es beim übergebenen Store.
 */
export function manifestStore(store: PointStore, index: Pick<PointIndex, 'commit'> | null | undefined): PointStore {
  const commit = index?.commit;
  if (!commit || !store.withBase) return store;
  const m = store.base.match(/^(https:\/\/cdn\.jsdelivr\.net\/gh\/[^@/]+\/[^@/]+)@main$/);
  return m ? store.withBase(`${m[1]}@${commit}`) : store;
}

export type ManifestOrigin = 'pinned' | 'main' | 'none';

/**
 * Ein Lauf-Manifest, zuerst gepinnt, dann `@main` als Rückfall — und die Herkunft dazu.
 * Der Rückfall ist kein stiller Ersatz: wer `main` bekommt, kann eine veraltete Fassung
 * in der Hand haben und sagt es weiter (`readCubePoint` meldet die fehlende Stufe).
 * V-PD-46: die ERSTE Anfrage an einen frisch gepinnten Commit kann mit 403/404 enden;
 * ein zweiter Versuch nach kurzer Pause gilt, bevor „nicht da" behauptet wird.
 */
export async function loadRunManifestFrom(
  store: PointStore, path: string, index?: Pick<PointIndex, 'commit'> | null,
): Promise<{ manifest: PointRunManifest | null; from: ManifestOrigin }> {
  const pinned = manifestStore(store, index);
  if (pinned !== store) {
    // Ein 403 ist beim Store ein FEHLER (nur 404 ist ein Befund) — genau der Fall V-PD-46
    // (Kaltstart eines frisch gepinnten Commits). Deshalb fängt der gepinnte Versuch alles
    // und versucht es einmal erneut, bevor er `@main` fragt.
    const attempt = async () => { try { return await pinned.json<PointRunManifest>(path); } catch { return null; } };
    let man = await attempt();
    if (!man) {
      await new Promise((r) => setTimeout(r, 400));
      man = await attempt();
    }
    if (man) return { manifest: man, from: 'pinned' };
  }
  const man = await store.json<PointRunManifest>(path);
  return { manifest: man, from: man ? 'main' : 'none' };
}

export async function loadRunManifest(
  store: PointStore, path: string, index?: Pick<PointIndex, 'commit'> | null,
): Promise<PointRunManifest | null> {
  return (await loadRunManifestFrom(store, path, index)).manifest;
}

/** Ein Zeitschritt der gelesenen Reihe. */
export interface CubePointStep {
  /** Vorhersagestunde ab dem PUBLIKATIONSLAUF — so steht die Achse im Manifest. */
  leadH: number;
  /** Gültigzeit in ms. Das ist die Größe, nach der ein Nutzer fragt. */
  validAtMs: number;
  /** Ebenen-ID → Wert; `null` heißt MISSING (nicht „null gemessen"). */
  values: Record<string, number | null>;
  /**
   * ── Welche Druckflächen hier UNTER GRUND liegen (PD-E §4.3) ───────────────
   *
   * Liegt eine Fläche unterhalb der Modelloberfläche, veröffentlichen alle Modelle
   * trotzdem einen Wert — extrapoliert nach modellinterner Vorschrift. Am echten Bau
   * gemessen: Zermatt meldet auf 925 hPa **19,5 °C**, während am Boden 4,2 °C stehen.
   * Wer das für eine Vorhersage in 760 m Höhe hält, liest Fiktion.
   *
   * Die Entscheidung braucht kein neues Feld: `ps` steht in derselben Zelle und Stunde.
   * Hier stehen die Flächen (in hPa), für die `p_Fläche > ps` gilt. Leeres Array heißt
   * „alle über Grund"; `null` heißt „`ps` fehlt, also nicht entscheidbar" — das ist
   * ausdrücklich nicht dasselbe.
   */
  belowGroundHPa: number[] | null;
}

export interface CubePointSeries {
  product: 'cube';
  tier: TierId;
  /** Verzeichnisname = Publikationslauf (§26). */
  run: string;
  runAtMs: number;
  /** QUELL-Lauf dieser Stufe. Nur dieser sagt etwas über das Alter der Werte. */
  sourceRun: string;
  sourceRunAtMs: number;
  chunk: { path: string; bytes: number; cy: number; cx: number };
  cell: { iy: number; ix: number; lat: number; lon: number; offsetKm: number; degrees: number };
  /** Modellhöhe der Zelle (Ebene `hModEff`) — konstant über die Achse. */
  hModEffM: number | null;
  steps: CubePointStep[];
  planes: PointRunManifest['planes'];
  /** An DIESER Zelle mindestens einmal belegt. */
  filledPlanes: string[];
  /** Über die ganze Achse leer — benannt statt verschwiegen. */
  emptyPlanes: string[];
  /** Die Quellen, die diese Stufe getragen haben, mit ihrem eigenen Lauf und Alter. */
  sources: PointSourceManifest[];
  /** Herkunft der Nebenebenen: Quantile, Ensemble und Profil kommen NICHT aus dem Mittel. */
  provenance: {
    quantiles: PointTierManifest['quantiles'];
    ensemble: PointTierManifest['ensemble'];
    profile: PointTierManifest['profile'];
  };
  /** Woher das Manifest kam: gepinnt an den Index-Commit, `@main` (Rueckfall, moeglicherweise veraltet) oder vom Aufrufer uebergeben. */
  manifestFrom?: ManifestOrigin | 'caller';
}

export interface ReadCubeOptions {
  /** Nur diese Ebenen entpacken. Spart Rechenzeit, KEINE Bytes (ein Chunk = ein GET). */
  wanted?: readonly string[];
  /** Bereits geladenes Manifest wiederverwenden (es ist 85 kB groß — V-PD-53). */
  manifest?: PointRunManifest;
  /**
   * Warum eine Stufe NICHT gelesen wurde. `null` allein sagt nicht, ob der Punkt außerhalb
   * liegt, der Lauf fehlt oder das Manifest die Stufe nicht kennt (V-FI-3) — der Grund
   * geht hier hinaus, damit ein Aufrufer ihn protokollieren kann, statt ihn zu raten.
   */
  onSkip?: (reason: string) => void;
}

/**
 * Liest eine Stufe an einem Punkt. `null`, wenn der Punkt außerhalb des Gitters liegt
 * oder der Lauf nicht mehr im Repo steht (Aufbewahrung je Stufe, PD-F3a).
 */
export async function readCubePoint(
  store: PointStore,
  index: PointIndex,
  tierId: TierId,
  lat: number,
  lon: number,
  opts: ReadCubeOptions = {},
): Promise<CubePointSeries | null> {
  const skip = (reason: string) => { opts.onSkip?.(`${tierId}: ${reason}`); return null; };
  const pointer = index.latestByTier[tierId];
  if (!pointer || !pointer.runAt) return skip('der Index nennt keinen Lauf für diese Stufe');
  const tier: CubeTier = TIER_BY_ID[tierId];

  const cell = cellOf(tier, lat, lon);
  if (!cell) return skip('der Punkt liegt außerhalb des Gitters');
  const ch = chunkOf(cell.iy, cell.ix);

  let man = opts.manifest ?? null;
  let manifestFrom: ManifestOrigin = 'pinned';
  if (!man) {
    const loaded = await loadRunManifestFrom(store, pointer.manifest, index);
    man = loaded.manifest;
    manifestFrom = loaded.from;
  }
  if (!man) return skip(`Manifest ${pointer.manifest} nicht lesbar`);
  const tm = man.tiers.find((t) => t.id === tierId);
  if (!tm) {
    return skip(`Manifest ${pointer.manifest} (${manifestFrom === 'main' ? '@main, möglicherweise veraltet — V-FI-1' : manifestFrom}) `
      + `kennt die Stufe nicht (trägt: ${man.tiers.map((t) => t.id).join('+') || '—'})`);
  }

  const path = chunkPath(pointer.run, tier, ch.cy, ch.cx);
  const bytes = await store.bytes(path);
  if (!bytes) return skip(`Chunk ${path} nicht im Repo (Aufbewahrung?)`);

  const chunk = await decodeCubeChunk(bytes, { planes: man.planes, wanted: opts.wanted });
  const ry = cell.iy - chunk.y0;
  const rx = cell.ix - chunk.x0;
  if (ry < 0 || rx < 0 || ry >= chunk.ny || rx >= chunk.nx) {
    throw new Error(`cubePoint: Zelle ${cell.iy}/${cell.ix} liegt nicht in ${path} — Chunk-Raster verletzt`);
  }

  const runAtMs = Date.parse(pointer.runAt);
  const centre = cellCenter(tier, cell.iy, cell.ix);
  const want = opts.wanted ? new Set(opts.wanted) : null;

  const steps: CubePointStep[] = [];
  const filled = new Set<string>();
  for (let it = 0; it < chunk.nt; it++) {
    const leadH = tm.leadHours[it];
    const values: Record<string, number | null> = {};
    for (let pi = 0; pi < man.planes.length; pi++) {
      const plane = man.planes[pi];
      if (want && !want.has(plane.id)) continue;
      const raw = chunk.planes[pi];
      // `decodeCubeChunk` gibt für nicht angeforderte Ebenen ein leeres Array zurück.
      if (raw.length === 0) continue;
      const q = raw[planeOffset(chunk, it, ry, rx)];
      if (q === MISSING) { values[plane.id] = null; continue; }
      values[plane.id] = dequantize(q, plane);
      filled.add(plane.id);
    }
    // `ps` ist in hPa (Ebene `ps`, Skala 0,1). Fehlt es — weil der Aufrufer es nicht
    // angefordert hat oder die Stunde es nicht trägt —, wird NICHT geraten.
    const ps = values.ps ?? null;
    const carried = PRESSURE_LEVELS_HPA.filter((hPa) =>
      values[pressurePlaneId('t', hPa)] != null || values[pressurePlaneId('rh', hPa)] != null);
    // `[]` hiesse „geprueft, keine liegt unter Grund". Wo GAR KEINE Flaeche gefuehrt wird
    // (ein Lauf vor Schema 5) oder `ps` fehlt, ist nichts geprueft ⇒ `null`. Der
    // Unterschied ist der ganze Zweck des Feldes.
    const belowGroundHPa = (ps == null || carried.length === 0) ? null
      : carried.filter((hPa) => hPa > ps);
    steps.push({ leadH, validAtMs: runAtMs + leadH * 3_600_000, values, belowGroundHPa });
  }

  const hMod = steps.find((s) => s.values.hModEff != null)?.values.hModEff ?? null;
  const considered = man.planes.filter((p) => !want || want.has(p.id)).map((p) => p.id);

  return {
    product: 'cube',
    tier: tierId,
    run: pointer.run,
    runAtMs,
    sourceRun: tm.run,
    sourceRunAtMs: Date.parse(tm.runAt),
    chunk: { path, bytes: bytes.length, cy: ch.cy, cx: ch.cx },
    cell: {
      iy: cell.iy, ix: cell.ix, lat: centre.lat, lon: centre.lon,
      offsetKm: distanceKm(lat, lon, centre.lat, centre.lon),
      degrees: tier.deg,
    },
    hModEffM: hMod,
    steps,
    planes: man.planes,
    filledPlanes: considered.filter((id) => filled.has(id)),
    emptyPlanes: considered.filter((id) => !filled.has(id)),
    sources: man.sources.filter((s) => s.tier === tierId),
    provenance: { quantiles: tm.quantiles, ensemble: tm.ensemble, profile: tm.profile },
    manifestFrom: opts.manifest ? 'caller' : manifestFrom,
  };
}

/**
 * Der Schritt einer Reihe, der einer Gültigzeit am nächsten liegt — **mit** dem Abstand.
 *
 * Der Abstand ist der Punkt der Funktion, nicht ein Nebenprodukt: die Stufen 2 und 3
 * haben ein 3- bzw. 6-Stunden-Raster, eine Anfrage auf eine beliebige Stunde trifft sie
 * also selten genau. Ohne die Zahl sähe „Wert vorhanden" gleich aus, egal ob er für
 * dieselbe oder für eine drei Stunden entfernte Zeit gilt (§5 der Diagnose).
 */
export function stepNearest(
  steps: readonly CubePointStep[],
  atMs: number,
): { step: CubePointStep; offsetMin: number } | null {
  let best: CubePointStep | null = null;
  let bestDiff = Infinity;
  for (const s of steps) {
    const d = Math.abs(s.validAtMs - atMs);
    if (d < bestDiff) { bestDiff = d; best = s; }
  }
  if (!best) return null;
  return { step: best, offsetMin: (best.validAtMs - atMs) / 60_000 };
}
