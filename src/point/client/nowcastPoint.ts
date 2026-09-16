/**
 * nowcastPoint.ts — den gespiegelten Nowcast über das NETZ an einem Punkt lesen (PD-D2).
 *
 * Der vorhandene `scripts/point/nowcastReader.mjs` liest aus einem lokalen Klon; für die
 * Vorstufe braucht es denselben Wert aus dem CDN. Geteilt wird der Kern
 * (`nowcastSample.ts`), verschieden ist nur die Herkunft der Bytes — und die
 * Slot-Suche, die es lokal gar nicht gibt.
 *
 * ⚠ **PNG-Dekodierung wird injiziert.** In Node kommt sie aus `scripts/lib/png.mjs`, im
 * Browser aus `createImageBitmap` + Canvas (`browserPng.ts`). Diese Datei importiert
 * keine von beiden — sonst wäre sie an eine Umgebung gebunden und der Verifier könnte
 * sie nicht netzfrei fahren.
 *
 * ── AP1 (Phase FI): Frames nur auf den Ausgabeschritten, und parallel (V-FI-2) ──
 * AP0 hat den heutigen Leser gemessen: bis 25 RV-Frames à ≈ 63 KB = 1,6 MB, SERIELL —
 * 1,3 s p50 Desktop, 7,5 s Mobil, Hamburg 16 s. Wer eine stündliche Reihe will, braucht
 * drei Frames (0/60/120 min), nicht 25. `atMs` nennt die Ausgabezeiten; je Zeit wird
 * der nächstgelegene Frame (≤ `toleranceMin`) gewählt, doppelte fallen weg, und alle
 * gewählten Frames werden NEBENEINANDER geholt. Ohne `atMs` gilt weiter das Fenster
 * `fromMs…untilMs` (Sammler), ebenfalls parallel — dieselben Frames, dieselben Werte.
 * Die Slot-Suche probiert `probeBatch` Stempel gleichzeitig (RV braucht gemessen 2–3
 * Sonden hintereinander à 300–600 ms kalt).
 */

import {
  NOWCAST_BY_ID, NOWCAST_SOURCES, type NowcastSourceId,
  nowcastFramePath, nowcastMetaPath, nowcastSlotStamps,
} from '../nowcastFormat';
import { SOURCE_BY_ID, coversPoint } from '../sourceMatrix';
import {
  sampleNowcastFrame, stampMs,
  type DecodedGrayPng, type NowcastSample, type NowcastSlotMeta,
} from '../nowcastSample';
import type { FetchOpts, PointStore } from './store';

export type PngDecoder = (bytes: Uint8Array) => DecodedGrayPng | Promise<DecodedGrayPng>;

export interface NowcastSlot {
  sourceId: NowcastSourceId;
  stamp: string;
  meta: NowcastSlotMeta;
  /** Alter des Slots in Minuten, gegen die übergebene Jetztzeit. */
  ageMin: number;
  /** Wie viele Stempel probiert werden mussten, bis einer traf (V-PD-52). */
  probes: number;
}

/**
 * Den jüngsten vorhandenen Slot einer Quelle finden.
 *
 * Rückwärts durch das Slot-Raster, bis eine `meta.json` antwortet. Gemessen kostet das
 * am lebenden Spiegel 1–3 Sonden (RV 2, INCA 3, RZC 1) — ein 404 ist dabei ein Befund,
 * kein Fehler, und der Store zählt ihn als `miss`. `probeBatch` Stempel werden
 * gleichzeitig gefragt (Voreinstellung 1 = seriell wie bisher); genommen wird der
 * JÜNGSTE Treffer der Reihe, nicht der schnellste.
 */
export async function findLatestSlot(
  store: PointStore,
  sourceId: NowcastSourceId,
  nowMs: number,
  backMinutes = 180,
  opts: { probeBatch?: number; priority?: FetchOpts['priority'] } = {},
): Promise<NowcastSlot | null> {
  const spec = NOWCAST_BY_ID[sourceId];
  const stamps = nowcastSlotStamps(sourceId, nowMs, backMinutes);
  const batch = Math.max(1, opts.probeBatch ?? 1);
  const fo: FetchOpts | undefined = opts.priority ? { priority: opts.priority } : undefined;
  let probes = 0;
  let lastError: unknown = null;
  for (let i = 0; i < stamps.length; i += batch) {
    const group = stamps.slice(i, i + batch);
    // Eine Sonde, die mit einem Transportfehler endet (403 nach Sekunden, V-FI-5), sagt
    // nichts über den Slot — sie wird wie „nicht da" behandelt und die Suche geht weiter.
    // Der letzte Fehler wird geworfen, wenn am Ende KEIN Slot gefunden wurde: dann war es
    // vielleicht doch der Transport, und das gehört gesagt, nicht als `null` verschwiegen.
    const metas = await Promise.all(group.map(async (stamp) => {
      try { return await store.json<NowcastSlotMeta>(nowcastMetaPath(spec, stamp), fo); } catch (e) { lastError = e; return null; }
    }));
    for (let k = 0; k < group.length; k++) {
      probes += 1;
      const meta = metas[k];
      if (!meta) continue;
      const stamp = group[k];
      const slotMs = slotMsOf(meta, stamp);
      return { sourceId, stamp, meta, ageMin: slotMs == null ? NaN : (nowMs - slotMs) / 60_000, probes };
    }
  }
  if (lastError) throw lastError;
  return null;
}

/**
 * Die Zeit, für die der ERSTE Frame eines Slots gilt.
 *
 * ⚠ Der Verzeichnisname hat Vorrang vor `meta.validAtMs`/`fetchedAtMs`: der Stempel ist
 * die Slot-Zeit, die anderen beiden sind Abrufzeiten. Dieselbe Vorsicht wie bei V-PD-56.
 */
export function slotMsOf(meta: NowcastSlotMeta, stamp: string): number | null {
  return meta.runAtMs ?? stampMs(stamp) ?? meta.validAtMs ?? meta.fetchedAtMs ?? null;
}

/**
 * Welche der drei Quellen einen Punkt überhaupt tragen — geometrisch, nie nach Land.
 *
 * Die Reihenfolge ist die Vorzugsreihenfolge der Auswahlregel und begründet, nicht
 * gesetzt: RV ist das feinste Komposit und liegt zusätzlich verlustfrei im Spiegel;
 * INCA trägt Ostösterreich, wo RV endet (⚠¹); CombiPrecip ist die einzige Schweizer
 * Quelle, hat aber **keine Extrapolation** (`extrapolationH: 0`), taugt also nur für
 * die Analysezeit.
 */
export function nowcastSourcesFor(lat: number, lon: number): NowcastSourceId[] {
  return NOWCAST_SOURCES
    .map((s) => s.id)
    .filter((id) => {
      const src = SOURCE_BY_ID[id];
      return src ? coversPoint(src, lat, lon) : false;
    });
}

export interface NowcastPointSeries {
  product: 'nowcast';
  sourceId: NowcastSourceId;
  stamp: string;
  slotAgeMin: number;
  probes: number;
  /** Reichweite dieser Quelle in Stunden ab dem Slot (RV 2, INCA 3, CombiPrecip 0). */
  extrapolationH: number;
  frames: NowcastSample[];
  /** Bytes, die für diese Reihe geholt wurden. */
  bytes: number;
  /** Wie viele Frames der Slot hat, wie viele geholt wurden und wie viele scheiterten (AP1). */
  framesInSlot: number;
  framesFetched: number;
  framesFailed: number;
}

export interface ReadNowcastOptions {
  nowMs?: number;
  decodePng: PngDecoder;
  /** Nur Frames bis zu dieser Gültigzeit holen — jedes PNG ist ein eigener Abruf. */
  untilMs?: number;
  /** Und erst ab dieser. Ein RV-Slot sind 25 PNG à ~80 KB; ungefiltert 2 MiB. */
  fromMs?: number;
  /** Höchstzahl geholter Frames. Voreinstellung: alle des Slots. */
  maxFrames?: number;
  backMinutes?: number;
  /**
   * AP1: die Ausgabezeiten. Je Zeit der nächstgelegene Frame (≤ `toleranceMin`), doppelte
   * entfallen; hat Vorrang vor `fromMs`/`untilMs`.
   */
  atMs?: readonly number[];
  /** Höchstabstand Frame ↔ Ausgabezeit in Minuten (Voreinstellung 30 = halbes Stundenraster). */
  toleranceMin?: number;
  /** Slot-Sonden gleichzeitig (Voreinstellung 1). */
  probeBatch?: number;
  /** Schon gefundener Slot (spart die Sonden, wenn der Aufrufer ihn hat). */
  slot?: NowcastSlot | null;
  /** Fetch-Priorität für Sonden und Frames (der Nowcast ist progressiv ⇒ `low`). */
  priority?: FetchOpts['priority'];
}

/**
 * Die Niederschlagsreihe einer Nowcast-Quelle an einem Punkt.
 *
 * `null` heißt: kein Slot gefunden oder der Punkt liegt außerhalb der Abdeckung. Ein
 * Frame, der `null` abtastet (außerhalb des Gitters), wird ausgelassen — er kommt NICHT
 * als 0 in die Reihe.
 */
export async function readNowcastPoint(
  store: PointStore,
  sourceId: NowcastSourceId,
  lat: number,
  lon: number,
  opts: ReadNowcastOptions,
): Promise<NowcastPointSeries | null> {
  const src = SOURCE_BY_ID[sourceId];
  if (src && !coversPoint(src, lat, lon)) return null;

  const nowMs = opts.nowMs ?? Date.now();
  const slot = opts.slot ?? await findLatestSlot(store, sourceId, nowMs, opts.backMinutes, { probeBatch: opts.probeBatch, priority: opts.priority });
  const fo: FetchOpts | undefined = opts.priority ? { priority: opts.priority } : undefined;
  if (!slot) return null;

  const spec = NOWCAST_BY_ID[sourceId];
  const all = slot.meta.frames ?? [];
  const base = slotMsOf(slot.meta, slot.stamp);
  const validOf = (f: { lead?: number }) => (base != null ? base + (f.lead ?? 0) * 60_000 : null);

  // ── Welche Frames ────────────────────────────────────────────────────────
  let chosen: typeof all;
  if (opts.atMs && opts.atMs.length) {
    const tol = (opts.toleranceMin ?? 30) * 60_000;
    const picked = new Set<number>();
    for (const t of opts.atMs) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < all.length; i++) {
        const v = validOf(all[i]);
        if (v == null) continue;
        const d = Math.abs(v - t);
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi >= 0 && bd <= tol) picked.add(bi);
    }
    chosen = [...picked].sort((a, b) => a - b).map((i) => all[i]);
  } else {
    chosen = all.filter((f) => {
      const v = validOf(f);
      if (opts.untilMs != null && v != null && v > opts.untilMs) return false;
      if (opts.fromMs != null && v != null && v < opts.fromMs) return false;
      return true;
    });
  }
  if (opts.maxFrames != null) chosen = chosen.slice(0, opts.maxFrames);

  // ── Holen und abtasten — nebeneinander, Ergebnis in Frame-Reihenfolge ────
  // Ein Frame, dessen Abruf scheitert (403 nach Sekunden, V-FI-5), fehlt in der Reihe und
  // wird gezählt; er reißt die anderen nicht mit. Scheitern ALLE, wird der Fehler geworfen.
  const bytesBefore = store.stats.bytes;
  let failed = 0;
  let lastError: unknown = null;
  const results = await Promise.all(chosen.map(async (f) => {
    try {
      const raw = await store.bytes(nowcastFramePath(spec, slot.stamp, f.file), fo);
      if (!raw) return null;
      const png = await opts.decodePng(raw);
      return sampleNowcastFrame(sourceId, slot.meta, png, lat, lon, f);
    } catch (e) { failed += 1; lastError = e; return null; }
  }));
  const frames: NowcastSample[] = [];
  let fetched = 0;
  for (const r of results) { if (r) { frames.push(r); fetched += 1; } }
  if (!frames.length) {
    if (lastError) throw lastError;
    return null;
  }

  return {
    product: 'nowcast',
    sourceId,
    stamp: slot.stamp,
    slotAgeMin: slot.ageMin,
    probes: slot.probes,
    // Reichweite aus der Registry — dieselbe Quelle, aus der `nowcastManifest()` sie
    // in `point/index.json` schreibt. Keine zweite Tabelle.
    extrapolationH: src?.horizonH.default ?? 0,
    frames,
    bytes: store.stats.bytes - bytesBefore,
    framesInSlot: all.length,
    framesFetched: fetched,
    framesFailed: failed,
  };
}
