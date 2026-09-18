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
 *
 * ── AP1 (Phase FI): drei Stücke statt eines ────────────────────────────────
 * `readCubePoint` ist seit AP1 aus drei reinen Stücken gebaut, die der parallele Leser
 * (`readPoint.ts`) einzeln benutzt: `cubeAddress` (Index → Zelle, Chunk, Pfad — OHNE
 * Manifest), `cubeSeriesFrom` (entpackter Chunk → Reihe) und dazwischen Abruf und
 * Dekodierung, die der Aufrufer selbst anordnet. Damit hängt die Chunk-Adresse nicht
 * mehr am `run.json` (V-FI-1: der Index trägt Lauf und Manifestpfad je Stufe), und das
 * Manifest ist nur noch für die Provenienz nötig — es kann parallel zum Chunk kommen.
 */

import {
  TIER_BY_ID, type TierId, type CubeTier, type CubeChunk,
  cellOf, cellCenter, chunkOf, chunkPath, decodeCubeChunk, dequantize, planeOffset, MISSING,
  PRESSURE_LEVELS_HPA, pressurePlaneId, CUBE_PLANES, CUBE_SCHEMA, readCubeHeader,
} from '../cubeFormat';
import type { PointRunManifest, PointSourceManifest, PointTierManifest } from '../manifest';
import { POINT_INDEX_PATH } from '../cubeFormat';
import type { PointStore } from './store';
import type { ChunkDecoder } from './decodePool';

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

/**
 * Der Index — im Browser mit `cache: 'no-cache'` (R9: `@main` trägt `max-age=604800`;
 * ohne Revalidierung zeigt ein Browser bis zu sieben Tage auf gelöschte Läufe).
 */
export async function loadPointIndex(store: PointStore): Promise<PointIndex | null> {
  return store.json<PointIndex>(POINT_INDEX_PATH, { cache: 'no-cache' });
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

/**
 * AP3 (Phase FI): eine Nachbarzelle im selben Chunk — für PAP 3 (Gitter → Punkt). Kommt aus
 * DEMSELBEN entpackten Chunk, kostet also keinen Abruf; nur auf Wunsch (`neighbours`).
 */
export interface CubeNeighbourCell {
  /** Versatz in Zellen gegen die Hauptzelle (Zeile nach Norden, Spalte nach Osten). */
  dy: number;
  dx: number;
  iy: number;
  ix: number;
  lat: number;
  lon: number;
  /** Abstand des Zellmittelpunkts zum angefragten Punkt. */
  distKm: number;
  /** Ebene `hModEff` dieser Zelle (erster belegter Schritt) — h_mod(g) aus PAP 3. */
  hModEffM: number | null;
  /** Je Schritt die Werte der gelesenen Ebenen (gleiche Reihenfolge wie `steps`). */
  values: Array<Record<string, number | null>>;
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
  /**
   * AP3: die bis zu acht Nachbarzellen im selben Chunk (3×3 um die Hauptzelle, am Chunk-Rand
   * beschnitten). Nur gesetzt, wenn `neighbours` verlangt war; PAP 3 wählt daraus die vier,
   * die den Punkt umschließen.
   */
  neighbours?: CubeNeighbourCell[];
  /**
   * AP1: die Werte sind da, die Provenienz nicht — das Manifest war nicht lesbar oder
   * kennt die Stufe nicht (V-FI-1 am `@main`-Rückfall). Der Chunk selbst ist
   * unveränderlich und richtig; nur `sources`/`provenance` bleiben leer. Benannt.
   */
  provenanceNote?: string;
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
  /** Dekodierweg (AP1): Worker-Pool im Browser, Hauptthread in Node. Voreinstellung: Hauptthread. */
  decodeChunk?: ChunkDecoder;
}

/** Adresse einer Stufe am Punkt — allein aus dem Index, ohne Manifest (AP1). */
export interface CubeAddress {
  tierId: TierId;
  tier: CubeTier;
  pointer: NonNullable<PointIndex['latestByTier'][TierId]>;
  cell: { iy: number; ix: number };
  chunk: { cy: number; cx: number };
  path: string;
}

export function cubeAddress(
  index: PointIndex, tierId: TierId, lat: number, lon: number,
): { ok: true; addr: CubeAddress } | { ok: false; reason: string } {
  const pointer = index.latestByTier[tierId];
  if (!pointer || !pointer.runAt) return { ok: false, reason: `${tierId}: der Index nennt keinen Lauf für diese Stufe` };
  const tier = TIER_BY_ID[tierId];
  const cell = cellOf(tier, lat, lon);
  if (!cell) return { ok: false, reason: `${tierId}: der Punkt liegt außerhalb des Gitters` };
  const ch = chunkOf(cell.iy, cell.ix);
  return { ok: true, addr: { tierId, tier, pointer, cell, chunk: ch, path: chunkPath(pointer.run, tier, ch.cy, ch.cx) } };
}

/**
 * Die Ebenenliste, mit der ein Chunk zu lesen ist, BEVOR das Manifest da ist.
 *
 * Der Chunk ist selbstbeschreibend genug für die Frage „ist das das aktuelle Schema mit
 * seinen 57 Ebenen?" — dann gilt `CUBE_PLANES`, dieselbe Liste, die der Producer ins
 * Manifest schreibt. Ein fremdes Schema oder eine andere Ebenenzahl braucht das
 * Manifest (`null`), sonst läse man richtige Bytes unter falschen Namen.
 */
export function planesForChunkHeader(bytes: Uint8Array): PointRunManifest['planes'] | null {
  const { header } = readCubeHeader(bytes, { allowOtherSchema: true });
  if (header.schema !== CUBE_SCHEMA || header.nvar !== CUBE_PLANES.length) return null;
  return CUBE_PLANES.map((pl) => ({ id: pl.id, unit: pl.unit, scale: pl.scale, offset: pl.offset, group: pl.group }));
}

/** Eine Zelle (iy, ix — absolut im Stufengitter) aus einem entpackten Chunk als Nachbarzelle. Rein. */
function cellFromChunk(
  chunk: CubeChunk, planes: PointRunManifest['planes'], want: Set<string> | null, tier: CubeTier,
  iy: number, ix: number, dy: number, dx: number, lat: number, lon: number,
): CubeNeighbourCell {
  const ny = iy - chunk.y0, nx = ix - chunk.x0;
  const values: Array<Record<string, number | null>> = [];
  let hModN: number | null = null;
  for (let it = 0; it < chunk.nt; it++) {
    const v: Record<string, number | null> = {};
    for (let pi = 0; pi < planes.length; pi++) {
      const plane = planes[pi];
      if (want && !want.has(plane.id)) continue;
      const raw = chunk.planes[pi];
      if (raw.length === 0) continue;
      v[plane.id] = dequantize(raw[planeOffset(chunk, it, ny, nx)], plane);
    }
    if (hModN == null && v.hModEff != null) hModN = v.hModEff;
    values.push(v);
  }
  const c = cellCenter(tier, iy, ix);
  return { dy, dx, iy, ix, lat: c.lat, lon: c.lon, distKm: distanceKm(lat, lon, c.lat, c.lon), hModEffM: hModN, values };
}

/**
 * AP14 (Phase FI, `audit/fusion-vollform.md` §2.3): Blockzellen aus einem ANDEREN Chunk desselben Laufs — für den
 * 2×2-Block über die Chunk-Grenze. Dieselbe Form wie die Ring-Zellen (`dy/dx` gegen die Hauptzelle). Rein.
 *
 * Schutz gegen einen falschen Chunk: jede Zelle muss IN diesem Chunk liegen (Kopf `y0/x0/ny/nx`), Ebenenzahl und
 * Schrittzahl müssen zur Reihe der Hauptzelle passen — sonst Abbruch statt stiller Fremdwerte.
 */
export function cellsFromChunk(
  chunk: CubeChunk,
  tier: CubeTier,
  planes: PointRunManifest['planes'],
  cells: ReadonlyArray<{ iy: number; ix: number; dy: number; dx: number }>,
  ctx: { lat: number; lon: number; wanted?: readonly string[]; nt: number },
): CubeNeighbourCell[] {
  if (planes.length !== chunk.planes.length) throw new Error(`cubePoint: Nachbar-Chunk hat ${chunk.planes.length} Ebenen, die Liste nennt ${planes.length}`);
  if (chunk.nt !== ctx.nt) throw new Error(`cubePoint: Nachbar-Chunk trägt ${chunk.nt} Schritte, die Reihe ${ctx.nt} — anderer Lauf?`);
  const want = ctx.wanted ? new Set(ctx.wanted) : null;
  return cells.map((c) => {
    if (c.iy < chunk.y0 || c.ix < chunk.x0 || c.iy >= chunk.y0 + chunk.ny || c.ix >= chunk.x0 + chunk.nx) {
      throw new Error(`cubePoint: Zelle ${c.iy}/${c.ix} liegt nicht im Nachbar-Chunk (${chunk.y0}/${chunk.x0}, ${chunk.ny}×${chunk.nx}) — Chunk-Raster verletzt`);
    }
    return cellFromChunk(chunk, planes, want, tier, c.iy, c.ix, c.dy, c.dx, ctx.lat, ctx.lon);
  });
}

/** Entpackter Chunk + Adresse + (optional) Manifest → die Reihe. Rein. */
export function cubeSeriesFrom(
  chunk: CubeChunk,
  addr: CubeAddress,
  planes: PointRunManifest['planes'],
  ctx: {
    bytes: number;
    manifest: PointRunManifest | null;
    manifestFrom: ManifestOrigin | 'caller';
    wanted?: readonly string[];
    lat: number;
    lon: number;
    /** AP3: die Nachbarzellen mitlesen (0 zusätzliche Bytes, ein paar Indexzugriffe). */
    neighbours?: boolean;
  },
): CubePointSeries {
  const { tier, tierId, pointer, cell, path } = addr;
  const tm = ctx.manifest?.tiers.find((t) => t.id === tierId) ?? null;
  const ry = cell.iy - chunk.y0;
  const rx = cell.ix - chunk.x0;
  if (ry < 0 || rx < 0 || ry >= chunk.ny || rx >= chunk.nx) {
    throw new Error(`cubePoint: Zelle ${cell.iy}/${cell.ix} liegt nicht in ${path} — Chunk-Raster verletzt`);
  }
  if (planes.length !== chunk.planes.length) {
    throw new Error(`cubePoint: ${path} hat ${chunk.planes.length} Ebenen, die Liste nennt ${planes.length}`);
  }
  const leadHours = tm?.leadHours ?? tier.leadHours;
  if (leadHours.length !== chunk.nt) {
    throw new Error(`cubePoint: ${path} trägt ${chunk.nt} Schritte, die Achse nennt ${leadHours.length}`);
  }

  const runAtMs = Date.parse(pointer.runAt as string);
  const centre = cellCenter(tier, cell.iy, cell.ix);
  const want = ctx.wanted ? new Set(ctx.wanted) : null;

  const steps: CubePointStep[] = [];
  const filled = new Set<string>();
  for (let it = 0; it < chunk.nt; it++) {
    const leadH = leadHours[it];
    const values: Record<string, number | null> = {};
    for (let pi = 0; pi < planes.length; pi++) {
      const plane = planes[pi];
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
  const considered = planes.filter((p) => !want || want.has(p.id)).map((p) => p.id);

  // AP3: die Nachbarn aus demselben Chunk — dieselbe Dequantisierung, dieselbe Ebenenliste.
  let neighbours: CubeNeighbourCell[] | undefined;
  if (ctx.neighbours) {
    neighbours = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue;
        const ny = ry + dy, nx = rx + dx;
        if (ny < 0 || nx < 0 || ny >= chunk.ny || nx >= chunk.nx) continue;
        neighbours.push(cellFromChunk(chunk, planes, want, tier, cell.iy + dy, cell.ix + dx, dy, dx, ctx.lat, ctx.lon));
      }
    }
  }

  let provenanceNote: string | undefined;
  if (!ctx.manifest) provenanceNote = `Manifest ${pointer.manifest} nicht lesbar — Werte aus dem Chunk, Quellen und Provenienz unbekannt`;
  else if (!tm) {
    provenanceNote = `Manifest ${pointer.manifest} (${ctx.manifestFrom === 'main' ? '@main, möglicherweise veraltet — V-FI-1' : ctx.manifestFrom}) `
      + `kennt die Stufe nicht (trägt: ${ctx.manifest.tiers.map((t) => t.id).join('+') || '—'}) — Werte aus dem Chunk, Quellen unbekannt`;
  }

  return {
    product: 'cube',
    tier: tierId,
    run: pointer.run,
    runAtMs,
    sourceRun: tm?.run ?? pointer.sourceRun ?? pointer.run,
    sourceRunAtMs: Date.parse((tm?.runAt ?? pointer.sourceRunAt ?? pointer.runAt) as string),
    chunk: { path, bytes: ctx.bytes, cy: addr.chunk.cy, cx: addr.chunk.cx },
    cell: {
      iy: cell.iy, ix: cell.ix, lat: centre.lat, lon: centre.lon,
      offsetKm: distanceKm(ctx.lat, ctx.lon, centre.lat, centre.lon),
      degrees: tier.deg,
    },
    hModEffM: hMod,
    steps,
    planes,
    filledPlanes: considered.filter((id) => filled.has(id)),
    emptyPlanes: considered.filter((id) => !filled.has(id)),
    sources: (ctx.manifest?.sources ?? []).filter((s) => s.tier === tierId),
    provenance: { quantiles: tm?.quantiles ?? null, ensemble: tm?.ensemble ?? null, profile: tm?.profile ?? null },
    manifestFrom: ctx.manifestFrom,
    ...(provenanceNote ? { provenanceNote } : {}),
    ...(neighbours ? { neighbours } : {}),
  };
}

/**
 * Liest eine Stufe an einem Punkt — seriell: Manifest, dann Chunk. `null`, wenn der
 * Punkt außerhalb des Gitters liegt, der Lauf nicht mehr im Repo steht (Aufbewahrung je
 * Stufe, PD-F3a) oder das Manifest die Stufe nicht kennt. Der parallele Weg für den
 * Browser ist `readPointBundle` (`readPoint.ts`); dieser hier bleibt der Referenzweg
 * für Sammler und Verifier.
 */
export async function readCubePoint(
  store: PointStore,
  index: PointIndex,
  tierId: TierId,
  lat: number,
  lon: number,
  opts: ReadCubeOptions = {},
): Promise<CubePointSeries | null> {
  const skip = (reason: string) => { opts.onSkip?.(reason); return null; };
  const a = cubeAddress(index, tierId, lat, lon);
  if (!a.ok) return skip(a.reason);
  const { addr } = a;
  const pointer = addr.pointer;

  let man = opts.manifest ?? null;
  let manifestFrom: ManifestOrigin | 'caller' = opts.manifest ? 'caller' : 'pinned';
  if (!man) {
    const loaded = await loadRunManifestFrom(store, pointer.manifest, index);
    man = loaded.manifest;
    manifestFrom = loaded.from;
  }
  if (!man) return skip(`${tierId}: Manifest ${pointer.manifest} nicht lesbar`);
  const tm = man.tiers.find((t) => t.id === tierId);
  if (!tm) {
    return skip(`${tierId}: Manifest ${pointer.manifest} (${manifestFrom === 'main' ? '@main, möglicherweise veraltet — V-FI-1' : manifestFrom}) `
      + `kennt die Stufe nicht (trägt: ${man.tiers.map((t) => t.id).join('+') || '—'})`);
  }

  const bytes = await store.bytes(addr.path);
  if (!bytes) return skip(`${tierId}: Chunk ${addr.path} nicht im Repo (Aufbewahrung?)`);

  const decode: ChunkDecoder = opts.decodeChunk ?? ((b, o) => decodeCubeChunk(b, { planes: o.planes, wanted: o.wanted }));
  const chunk = await decode(bytes, { planes: man.planes, wanted: opts.wanted });
  return cubeSeriesFrom(chunk, addr, man.planes, {
    bytes: bytes.length, manifest: man, manifestFrom, wanted: opts.wanted, lat, lon,
  });
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
