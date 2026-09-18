/**
 * chunkRanges.ts — von einem Cube-Chunk nur die Ebenen holen, die die Antwort liest (Phase FI, AP12 (c)).
 *
 * ── Warum ─────────────────────────────────────────────────────────────────
 * Auf Mobil-4G ist der Kern bytes-gebunden (§9.14.1: ≈ 1,8 MB je Ort bei 9 Mbit, die Leitung ist voll).
 * Die Antwort von buscosun Fusion liest 39 von 57 Ebenen: die C-LAEF-Quantile `*_q10/_q90` werden
 * getragen, aber nie gerechnet (§9.8.1), von den Druckflächen zählt nur 925 hPa (`belowGround925`).
 * Ohne die übrigen 18 Ebenen sind die Chunks 20–38 % kleiner (am Verzeichnis der zehn Orte gemessen).
 *
 * ── Wie ───────────────────────────────────────────────────────────────────
 * Der Chunk trägt vorn Kopf + Verzeichnis (48 + 12·57 = 732 B: Offset und Länge je Ebenenblock). Also:
 * erst dieser Bereich, dann die Blöcke der gewünschten Ebenen (benachbarte zusammengelegt), alle
 * gleichzeitig. Das Ergebnis ist ein Puffer in der Länge der Datei, in dem nur die geholten Blöcke
 * stehen — dekodiert werden NUR diese (`wanted`), ohne CRC (die Prüfsumme gilt der ganzen Nutzlast;
 * je Block prüft `unpackBlock` die entpackte Länge). `complete()` holt danach den Rest, setzt die Datei
 * zusammen, prüft die CRC und legt sie über `seed` in den Cache — der nächste Besuch liest dann die
 * ganze Datei wie bisher.
 *
 * ── Was dagegen spricht (gemessen 18.09., §9.14.1) ─────────────────────────
 * Der Browser schickt zu jedem Range `Accept-Encoding: identity`; jsDelivr hält je Kodierung eine
 * eigene Variante, und der Publisher wärmt nur die br-Variante. Der erste Bereich je Chunk und Edge ist
 * deshalb ein MISS (0,3–1,8 s), obwohl die ganze Datei warm ist. Deshalb ist der Weg eine OPTION
 * (`ReadPointOptions.planeRanges`), die ganze Datei bleibt der Normalweg und der benannte Rückfall.
 */

import { CUBE_HEADER_BYTES, DIR_ENTRY_BYTES, readCubeHeader, crc32 } from '../cubeFormat';
import type { FetchOpts, PointStore } from './store';

/** Ein Bytebereich [start, end). */
export interface ByteSpan { start: number; end: number }

/** Zwei Blöcke mit höchstens so viel Abstand werden in EINEM Bereich geholt (spart Abrufe, kostet ein paar KB). */
export const RANGE_MERGE_GAP_BYTES = 2_048;

/**
 * Die Bereiche für die gewünschten Ebenen, aufsteigend, benachbarte zusammengelegt. Rein.
 * `directory[i]` gehört zu `planeIds[i]` (Reihenfolge = Vertrag des Containers).
 */
export function spansForPlanes(
  directory: readonly { offset: number; length: number }[], planeIds: readonly string[], wanted: ReadonlySet<string>, gapBytes = RANGE_MERGE_GAP_BYTES,
): ByteSpan[] {
  const blocks = directory
    .map((d, i) => ({ start: d.offset, end: d.offset + d.length, id: planeIds[i] }))
    .filter((b) => wanted.has(b.id) && b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const out: ByteSpan[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && b.start - last.end <= gapBytes) last.end = Math.max(last.end, b.end);
    else out.push({ start: b.start, end: b.end });
  }
  return out;
}

/** Die Lücken zwischen den schon geholten Bereichen bis zum Dateiende. Rein. */
export function complementSpans(have: readonly ByteSpan[], total: number): ByteSpan[] {
  const sorted = [...have].sort((a, b) => a.start - b.start);
  const out: ByteSpan[] = [];
  let pos = 0;
  for (const s of sorted) {
    if (s.start > pos) out.push({ start: pos, end: s.start });
    pos = Math.max(pos, s.end);
  }
  if (pos < total) out.push({ start: pos, end: total });
  return out;
}

export interface RangedChunk {
  /** Volle Dateilänge; nicht geholte Blöcke sind Nullen — NUR `wanted` dekodieren. Bei `whole` die ganze Datei. */
  bytes: Uint8Array;
  whole: boolean;
  /** Die Ebenen, deren Blöcke vollständig vorliegen (bei `whole` alle). */
  wanted: string[];
  /** Geholte Bytes (Verzeichnis + Bereiche) und Dateigröße — für die Notiz im Bündel. */
  fetchedBytes: number;
  totalBytes: number;
  requests: number;
  /** Den Rest holen, zusammensetzen, CRC prüfen, in den Cache legen. Wirft nie. */
  complete: () => Promise<{ ok: boolean; bytes: number; why?: string }>;
}

/**
 * Liest die gewünschten Ebenen eines Chunks über Bereiche. `null` bei 404. Wirft bei Transportfehlern
 * (der Aufrufer nimmt dann die ganze Datei) und wenn der Kopf nicht zur Ebenenliste passt.
 */
export async function readChunkRanges(
  store: PointStore, path: string, planeIds: readonly string[], wanted: readonly string[], fo: FetchOpts = {}, expectSchema?: number,
): Promise<RangedChunk | null> {
  if (!store.range) throw new Error('chunkRanges: der Store kann keine Bereiche');
  const range = store.range.bind(store);
  const dirEnd = CUBE_HEADER_BYTES + DIR_ENTRY_BYTES * planeIds.length;
  const whole = (b: Uint8Array): RangedChunk => ({
    bytes: b, whole: true, wanted: [...planeIds], fetchedBytes: b.length, totalBytes: b.length, requests: 1,
    complete: async () => ({ ok: true, bytes: 0 }),
  });
  const pre = await range(path, 0, dirEnd, fo);
  if (!pre) return null;
  if (pre.whole) return whole(pre.bytes);
  const { header, directory } = readCubeHeader(pre.bytes, { allowOtherSchema: true });
  if (header.nvar !== planeIds.length) throw new Error(`chunkRanges: ${path} hat ${header.nvar} Ebenen, die Liste nennt ${planeIds.length}`);
  if (expectSchema != null && header.schema !== expectSchema) throw new Error(`chunkRanges: ${path} trägt Schema ${header.schema}, die Liste gilt für ${expectSchema}`);
  const total = directory.reduce((m, d) => Math.max(m, d.offset + d.length), dirEnd);
  const want = new Set(wanted);
  const spans = spansForPlanes(directory, planeIds, want);
  const parts = await Promise.all(spans.map((s) => range(path, s.start, s.end, fo)));
  if (parts.some((p) => p == null)) throw new Error(`chunkRanges: ${path} verschwand zwischen Verzeichnis und Bereichen`);
  const full = parts.find((p) => p!.whole);
  if (full) return whole(full.bytes);
  const buf = new Uint8Array(total);
  buf.set(pre.bytes.subarray(0, dirEnd), 0);
  spans.forEach((s, i) => buf.set(parts[i]!.bytes, s.start));
  const fetched = dirEnd + spans.reduce((a, s) => a + (s.end - s.start), 0);
  const covered = planeIds.filter((id) => want.has(id));
  const payloadStart = CUBE_HEADER_BYTES + DIR_ENTRY_BYTES * header.nvar;

  const complete = async (): Promise<{ ok: boolean; bytes: number; why?: string }> => {
    try {
      const rest = complementSpans([{ start: 0, end: dirEnd }, ...spans], total);
      const got = await Promise.all(rest.map((s) => range(path, s.start, s.end, { priority: 'low' })));
      if (got.some((g) => g == null)) return { ok: false, bytes: 0, why: 'Datei verschwand' };
      const done = new Uint8Array(buf);
      rest.forEach((s, i) => { const g = got[i]!; if (g.whole) done.set(g.bytes.subarray(0, total)); else done.set(g.bytes, s.start); });
      const crc = crc32(done.subarray(payloadStart));
      if (crc !== header.payloadCrc32) return { ok: false, bytes: 0, why: `CRC ${crc.toString(16)} statt ${header.payloadCrc32.toString(16)} — nicht gespeichert` };
      store.seed?.(path, done);
      return { ok: true, bytes: rest.reduce((a, s) => a + (s.end - s.start), 0) };
    } catch (e) {
      return { ok: false, bytes: 0, why: String((e as Error)?.message ?? e) };
    }
  };
  return { bytes: buf, whole: false, wanted: covered, fetchedBytes: fetched, totalBytes: total, requests: 1 + spans.length, complete };
}
