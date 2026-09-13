/**
 * nowcastPoint.ts — den gespiegelten Nowcast über das NETZ an einem Punkt lesen (PD-D2).
 *
 * Der vorhandene `scripts/point/nowcastReader.mjs` liest aus einem lokalen Klon; für die
 * Vorstufe braucht es denselben Wert aus dem CDN. Geteilt wird der Kern
 * (`nowcastSample.ts`), verschieden ist nur die Herkunft der Bytes — und die
 * Slot-Suche, die es lokal gar nicht gibt.
 *
 * ⚠ **PNG-Dekodierung wird injiziert.** In Node kommt sie aus `scripts/lib/png.mjs`, im
 * Browser aus `createImageBitmap` + Canvas. Diese Datei importiert keine von beiden —
 * sonst wäre sie an eine Umgebung gebunden und der Verifier könnte sie nicht netzfrei
 * fahren.
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
import type { PointStore } from './store';

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
 * kein Fehler, und der Store zählt ihn als `miss`.
 */
export async function findLatestSlot(
  store: PointStore,
  sourceId: NowcastSourceId,
  nowMs: number,
  backMinutes = 180,
): Promise<NowcastSlot | null> {
  const spec = NOWCAST_BY_ID[sourceId];
  const stamps = nowcastSlotStamps(sourceId, nowMs, backMinutes);
  let probes = 0;
  for (const stamp of stamps) {
    probes += 1;
    const meta = await store.json<NowcastSlotMeta>(nowcastMetaPath(spec, stamp));
    if (!meta) continue;
    const slotMs = slotMsOf(meta, stamp);
    return { sourceId, stamp, meta, ageMin: slotMs == null ? NaN : (nowMs - slotMs) / 60_000, probes };
  }
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
  const slot = await findLatestSlot(store, sourceId, nowMs, opts.backMinutes);
  if (!slot) return null;

  const spec = NOWCAST_BY_ID[sourceId];
  const all = slot.meta.frames ?? [];
  const bytesBefore = store.stats.bytes;
  const frames: NowcastSample[] = [];
  for (const f of all) {
    if (opts.maxFrames != null && frames.length >= opts.maxFrames) break;
    if (opts.untilMs != null) {
      const base = slotMsOf(slot.meta, slot.stamp);
      if (base != null && base + (f.lead ?? 0) * 60_000 > opts.untilMs) break;
    }
    if (opts.fromMs != null) {
      const base = slotMsOf(slot.meta, slot.stamp);
      if (base != null && base + (f.lead ?? 0) * 60_000 < opts.fromMs) continue;
    }
    const raw = await store.bytes(nowcastFramePath(spec, slot.stamp, f.file));
    if (!raw) continue;
    const png = await opts.decodePng(raw);
    const s = sampleNowcastFrame(sourceId, slot.meta, png, lat, lon, f);
    if (s) frames.push(s);
  }
  if (!frames.length) return null;

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
  };
}
