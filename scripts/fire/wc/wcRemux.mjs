/**
 * V-SAT-15 — purer Remux-Kern des WorldCover-Spiegels (`audit/brandradar-satellitenbilder.md` §12.7).
 *
 * Nimmt EINE Pyramiden-Ebene eines WorldCover-COGs (als geparste `CogIfd`) und schreibt daraus
 * eine eigenständige Ein-IFD-Tiled-TIFF: jede Kachel-Nutzlast wird VERBATIM kopiert
 * (`tileOffsets`/`tileByteCounts`), kein Re-Encode — Verlustfreiheit ist damit beweisbar,
 * indem Quelle und Derivat durch DENSELBEN `decodeTile`-Leser laufen (Verifier-Rundlauf).
 *
 * Pur: der Byte-Zugriff kommt als `readRange(offset, length)` herein (Datei, HTTP-Range oder
 * In-Memory-Puffer) — so läuft derselbe Kern im Producer UND netzfrei im Verifier.
 */

import { writeTiledTiff } from '../../../src/fire/detail/cogTiff.ts';

/**
 * @param {import('../../../src/fire/detail/cogTiff.ts').CogIfd} ifd  Ebene der Quelle
 * @param {(offset: number, length: number) => Promise<Uint8Array>} readRange
 * @returns {Promise<ArrayBuffer>} Ein-IFD-TIFF, lesbar vom unveränderten `parseCogIfds`/`decodeTile`
 */
export async function remuxWcLevel(ifd, readRange) {
  const n = ifd.tilesAcross * ifd.tilesDown;
  if (ifd.tileOffsets.length !== n || ifd.tileByteCounts.length !== n) {
    throw new Error(`wc-remux: IFD-Inhaltsverzeichnis unvollständig (${ifd.tileOffsets.length}/${ifd.tileByteCounts.length} von ${n})`);
  }
  /** @type {Uint8Array[]} */
  const encodedTiles = [];
  for (let i = 0; i < n; i++) {
    const byteCount = ifd.tileByteCounts[i];
    if (!(byteCount > 0)) {
      // Leere (Sparse-)Kacheln laufen als Länge 0 durch — der Client behandelt das schon als null.
      encodedTiles.push(new Uint8Array(0));
      continue;
    }
    const bytes = await readRange(ifd.tileOffsets[i], byteCount);
    if (bytes.length !== byteCount) {
      throw new Error(`wc-remux: Kachel ${i} unvollständig gelesen (${bytes.length}/${byteCount} B)`);
    }
    encodedTiles.push(bytes);
  }
  return writeTiledTiff({
    le: ifd.littleEndian,
    width: ifd.width,
    height: ifd.height,
    tileW: ifd.tileW,
    tileH: ifd.tileH,
    spp: ifd.samplesPerPixel,
    bits: /** @type {8 | 16} */ (ifd.bitsPerSample),
    predictor: ifd.predictor,
    compression: ifd.compression,
    encodedTiles,
  });
}

/** WorldCover-Ebenen-Vertrag des Spiegels — Abweichung ⇒ lauter Abbruch, nie eine unlesbare Datei. */
export function assertWcLevelContract(ifd, name) {
  const bad = [];
  if (ifd.width !== 9000 || ifd.height !== 9000) bad.push(`Ebene ${ifd.width}×${ifd.height} statt 9000²`);
  if (ifd.tileW !== 1024 || ifd.tileH !== 1024) bad.push(`Kacheln ${ifd.tileW}×${ifd.tileH} statt 1024²`);
  if (ifd.samplesPerPixel !== 1) bad.push(`spp ${ifd.samplesPerPixel} statt 1`);
  if (ifd.bitsPerSample !== 8) bad.push(`${ifd.bitsPerSample} bit statt 8`);
  if (ifd.compression !== 8) bad.push(`Compression ${ifd.compression} statt 8 (Deflate)`);
  if (ifd.predictor !== 1) bad.push(`Predictor ${ifd.predictor} statt 1`);
  if (!ifd.littleEndian) bad.push('Big-Endian statt Little-Endian');
  if (bad.length) throw new Error(`wc-remux: ${name} verletzt den Ebenen-Vertrag — ${bad.join(', ')}`);
}
