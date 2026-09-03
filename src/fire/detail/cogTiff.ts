/**
 * SAT2a — handgeschriebener Cloud-Optimized-GeoTIFF-Leser für die Sentinel-2-10-m-Originale
 * (`audit/brandradar-satellitenbilder.md` §8/§9). Vorbild: der GRIB2-Decoder (`gribDecode.ts`) —
 * DOM-frei, DataView-basiert, headless in Node verifizierbar (`DecompressionStream` ist dort global).
 *
 * Am echten Objekt gemessen (TCI.tif des 14.08.-Items, 347 MB): klassisches Little-Endian-TIFF,
 * 10 980², Compression 8 = Deflate (zlib-gewrappt ⇒ natives `DecompressionStream('deflate')` —
 * Abgrenzung zum `'gzip'`-Bestand in `decompress.ts`), Predictor 2 (horizontale Differenz),
 * 1024²-Kacheln + 4 Overview-IFDs (512²-Kacheln, 5490 → 2745 → 1373 → 687), und ALLE IFDs liegen
 * in den ersten 16 KB — ein Range-Request liefert das ganze Inhaltsverzeichnis.
 *
 * Bewusst NICHT hier: Geo-Tags. Die Georeferenz (`proj:transform`/`proj:epsg`) kommt aus der
 * STAC-Antwort (gemessen 2026-09-01), der Leser kennt nur Pixel und Kacheln.
 *
 * Dekodepfade: uint8 1–3 Kanäle (`decodeTile`, TCI) und seit SAT2b uint16 Einband
 * (`decodeTileU16`, B8A/B12/B04 — Predictor 2 wirkt dort auf 16-bit-WERTEN, nicht auf Bytes,
 * deshalb trägt die IFD die Byte-Ordnung). Jeweils Compression 1 (roh) oder 8 (Deflate),
 * Predictor 1 oder 2. Alles andere ist ein BENANNTER `cog-unsupported`-Fehler — nie ein
 * stilles Falschbild (der Viewer zeigt dann den Copernicus-Link als Ausweg).
 */

/** Erste Header-Anfrage: gemessen reicht 16 KB für alle IFDs; 64 KB ist die Versicherung. */
export const COG_HEADER_BYTES = 16 * 1024;
export const COG_HEADER_RETRY_BYTES = 64 * 1024;

export interface CogIfd {
  width: number;
  height: number;
  tileW: number;
  tileH: number;
  samplesPerPixel: number;
  /** Bits je Kanal (8 = TCI, 16 = Band-COGs wie B8A/B12). */
  bitsPerSample: number;
  /** Byte-Ordnung der Datei — der uint16-Dekoder braucht sie (Sentinel-COGs: LE). */
  littleEndian: boolean;
  /** TIFF-Tag 259: 1 = roh, 8 = Deflate (zlib). */
  compression: number;
  /** TIFF-Tag 317: 1 = keiner, 2 = horizontale Differenz. */
  predictor: number;
  tilesAcross: number;
  tilesDown: number;
  tileOffsets: number[];
  tileByteCounts: number[];
}

export type CogHeader =
  | { kind: 'ok'; ifds: CogIfd[] }
  /** Ein Tag-Datenblock oder eine IFD liegt hinter dem geholten Puffer — einmal größer holen. */
  | { kind: 'needMoreBytes'; upTo: number }
  | { kind: 'unsupported'; reason: string };

// --- IFD-Parser -------------------------------------------------------------------------------

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4 };

interface TagEntry { tag: number; type: number; count: number; valueOff: number }

function readTagValues(dv: DataView, e: TagEntry, le: boolean): number[] | null {
  const size = TYPE_SIZE[e.type];
  if (size == null) return null; // RATIONAL u. a. brauchen wir nicht
  const total = size * e.count;
  const at = total <= 4 ? e.valueOff : (le ? dv.getUint32(e.valueOff, true) : dv.getUint32(e.valueOff, false));
  if (at + total > dv.byteLength) return null; // Aufrufer entscheidet über needMoreBytes
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) {
    const o = at + i * size;
    out.push(size === 1 ? dv.getUint8(o) : size === 2 ? dv.getUint16(o, le) : dv.getUint32(o, le));
  }
  return out;
}

/**
 * IFD-Kette aus dem Header-Puffer. Liefert nur gekachelte Bild-IFDs (Masken-/Streifen-IFDs
 * fallen heraus); `needMoreBytes` nennt das benötigte Pufferende, statt still abzubrechen.
 */
export function parseCogIfds(buf: ArrayBuffer): CogHeader {
  const dv = new DataView(buf);
  if (dv.byteLength < 8) return { kind: 'needMoreBytes', upTo: COG_HEADER_BYTES };
  const b0 = dv.getUint16(0, false);
  const le = b0 === 0x4949; // 'II'
  if (!le && b0 !== 0x4d4d) return { kind: 'unsupported', reason: 'kein TIFF (Magic fehlt)' };
  const magic = dv.getUint16(2, le);
  if (magic === 43) return { kind: 'unsupported', reason: 'BigTIFF (Magic 43) — v1 liest klassisches TIFF' };
  if (magic !== 42) return { kind: 'unsupported', reason: `unbekannte TIFF-Magic ${magic}` };

  const ifds: CogIfd[] = [];
  let off = dv.getUint32(4, le);
  let guard = 0;
  while (off !== 0) {
    if (++guard > 32) return { kind: 'unsupported', reason: 'IFD-Kette ohne Ende' };
    if (off + 2 > dv.byteLength) return { kind: 'needMoreBytes', upTo: off + 2 };
    const n = dv.getUint16(off, le);
    const entriesEnd = off + 2 + n * 12 + 4;
    if (entriesEnd > dv.byteLength) return { kind: 'needMoreBytes', upTo: entriesEnd };

    const tags = new Map<number, TagEntry>();
    for (let i = 0; i < n; i++) {
      const eo = off + 2 + i * 12;
      tags.set(dv.getUint16(eo, le), {
        tag: dv.getUint16(eo, le), type: dv.getUint16(eo + 2, le),
        count: dv.getUint32(eo + 4, le), valueOff: eo + 8,
      });
    }
    const val = (tag: number): number[] | null => {
      const e = tags.get(tag);
      return e ? readTagValues(dv, e, le) : null;
    };
    // Ein Tag, dessen Datenblock hinter dem Puffer liegt, macht die ganze IFD zu klein geholt.
    for (const e of tags.values()) {
      const size = TYPE_SIZE[e.type];
      if (size == null) continue;
      const total = size * e.count;
      if (total > 4) {
        const at = dv.getUint32(e.valueOff, le);
        if (at + total > dv.byteLength) return { kind: 'needMoreBytes', upTo: at + total };
      }
    }

    const width = val(256)?.[0];
    const height = val(257)?.[0];
    const tileW = val(322)?.[0];
    const tileH = val(323)?.[0];
    const tileOffsets = val(324);
    const tileByteCounts = val(325);
    if (width && height && tileW && tileH && tileOffsets && tileByteCounts) {
      const bits = val(258) ?? [8];
      const spp = val(277)?.[0] ?? bits.length;
      ifds.push({
        width, height, tileW, tileH,
        samplesPerPixel: spp,
        bitsPerSample: bits[0] ?? 8,
        littleEndian: le,
        compression: val(259)?.[0] ?? 1,
        predictor: val(317)?.[0] ?? 1,
        tilesAcross: Math.ceil(width / tileW),
        tilesDown: Math.ceil(height / tileH),
        tileOffsets, tileByteCounts,
      });
    }
    off = dv.getUint32(off + 2 + n * 12, le);
  }
  if (ifds.length === 0) return { kind: 'unsupported', reason: 'keine gekachelte Bild-IFD gefunden' };
  return { kind: 'ok', ifds };
}

// --- Ebenen- und Kachelwahl -------------------------------------------------------------------

export interface CogLevel { ifd: CogIfd; index: number; mPerPx: number }

/**
 * Die gröbste Ebene, die die Zielauflösung noch erreicht (m/px ≤ Ziel) — feiner wäre bezahlte
 * Schärfe, die der Bildschirm nicht zeigt. Ist selbst die Vollauflösung gröber als das Ziel,
 * gibt es sie (Endanschlag, kein „unendlich").
 */
export function pickLevel(ifds: readonly CogIfd[], targetMPerPx: number, fullMPerPx: number): CogLevel {
  const sorted = [...ifds].sort((a, b) => b.width - a.width);
  const full = sorted[0];
  let best: CogLevel = { ifd: full, index: 0, mPerPx: fullMPerPx };
  for (let i = 0; i < sorted.length; i++) {
    const mPerPx = (fullMPerPx * full.width) / sorted[i].width;
    if (mPerPx <= targetMPerPx + 1e-9) best = { ifd: sorted[i], index: i, mPerPx };
  }
  return best;
}

export interface CogTileRef { col: number; row: number; idx: number; offset: number; byteCount: number }

/** Kachelindizes + Byte-Lagen für ein Pixelfenster der Ebene (geklemmt, lückenlos). */
export function tilesFor(ifd: CogIfd, px0: number, py0: number, px1: number, py1: number): CogTileRef[] {
  const c0 = Math.max(0, Math.floor(Math.min(px0, px1) / ifd.tileW));
  const c1 = Math.min(ifd.tilesAcross - 1, Math.floor((Math.max(px0, px1) - 1e-9) / ifd.tileW));
  const r0 = Math.max(0, Math.floor(Math.min(py0, py1) / ifd.tileH));
  const r1 = Math.min(ifd.tilesDown - 1, Math.floor((Math.max(py0, py1) - 1e-9) / ifd.tileH));
  const out: CogTileRef[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const idx = row * ifd.tilesAcross + col;
      out.push({ col, row, idx, offset: ifd.tileOffsets[idx], byteCount: ifd.tileByteCounts[idx] });
    }
  }
  return out;
}

/** Ausgesprochene Kostenzahl (Bytes laut Inhaltsverzeichnis, kein Abruf nötig). */
export function estimateBytes(tiles: readonly CogTileRef[]): number {
  return tiles.reduce((sum, t) => sum + t.byteCount, 0);
}

// --- Kachel-Dekode ----------------------------------------------------------------------------

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  // zlib-gewrapptes Deflate (TIFF Compression 8) — natives 'deflate', nicht das 'gzip' von decompress.ts.
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Eine Kachel → rohe Pixelbytes (`tileW · tileH · samplesPerPixel`, Zeilen-major). Randkacheln
 * sind im TIFF voll gespeichert; der Zeichner clippt über die Zielrechnung, nicht der Decoder.
 * Fremde Formate sind ein benannter Fehler mit dem Präfix `cog-unsupported`.
 */
export async function decodeTile(bytes: Uint8Array, ifd: CogIfd): Promise<Uint8Array> {
  if (ifd.bitsPerSample !== 8) throw new Error(`cog-unsupported: ${ifd.bitsPerSample} Bit je Kanal (v1 liest 8)`);
  if (ifd.compression !== 1 && ifd.compression !== 8) {
    throw new Error(`cog-unsupported: Compression ${ifd.compression} (v1 liest 1 und 8=Deflate)`);
  }
  if (ifd.predictor !== 1 && ifd.predictor !== 2) {
    throw new Error(`cog-unsupported: Predictor ${ifd.predictor}`);
  }
  const raw = ifd.compression === 8 ? await inflate(bytes) : bytes.slice();
  const rowBytes = ifd.tileW * ifd.samplesPerPixel;
  const expected = rowBytes * ifd.tileH;
  if (raw.length !== expected) {
    throw new Error(`cog-unsupported: Kachelgröße ${raw.length} statt ${expected}`);
  }
  if (ifd.predictor === 2) {
    const spp = ifd.samplesPerPixel;
    for (let y = 0; y < ifd.tileH; y++) {
      const base = y * rowBytes;
      for (let i = spp; i < rowBytes; i++) raw[base + i] = (raw[base + i] + raw[base + i - spp]) & 0xff;
    }
  }
  return raw;
}

/**
 * SAT2b: eine uint16-Einband-Kachel (B8A/B12/B04) → Uint16Array (`tileW · tileH`). Predictor 2
 * wirkt bei 16 bit auf den WERTEN (additive Differenz je 16-bit-Sample), nicht auf den Bytes —
 * deshalb erst per Byte-Ordnung der Datei interpretieren, dann rückrechnen (am echten B12
 * gemessen: LE, Deflate, Predictor 2).
 */
export async function decodeTileU16(bytes: Uint8Array, ifd: CogIfd): Promise<Uint16Array> {
  if (ifd.bitsPerSample !== 16) throw new Error(`cog-unsupported: ${ifd.bitsPerSample} Bit (U16-Pfad liest 16)`);
  if (ifd.samplesPerPixel !== 1) throw new Error(`cog-unsupported: ${ifd.samplesPerPixel} Kanäle (U16-Pfad liest 1)`);
  if (ifd.compression !== 1 && ifd.compression !== 8) {
    throw new Error(`cog-unsupported: Compression ${ifd.compression} (v1 liest 1 und 8=Deflate)`);
  }
  if (ifd.predictor !== 1 && ifd.predictor !== 2) {
    throw new Error(`cog-unsupported: Predictor ${ifd.predictor}`);
  }
  const raw = ifd.compression === 8 ? await inflate(bytes) : bytes.slice();
  const n = ifd.tileW * ifd.tileH;
  if (raw.length !== n * 2) throw new Error(`cog-unsupported: Kachelgröße ${raw.length} statt ${n * 2}`);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getUint16(i * 2, ifd.littleEndian);
  if (ifd.predictor === 2) {
    for (let y = 0; y < ifd.tileH; y++) {
      const base = y * ifd.tileW;
      for (let i = 1; i < ifd.tileW; i++) out[base + i] = (out[base + i] + out[base + i - 1]) & 0xffff;
    }
  }
  return out;
}

/**
 * Ausschnitt `outW × outH` ab (`ox`, `oy`) aus einer größeren Kachel — die B04-Pyramide nutzt
 * unterhalb der 5490er-Ebene 512er-Kacheln, wo B8A/B12 256er nutzen; die Grenzen sind exakte
 * Vielfache, jede Ausgabe-Kachel liegt vollständig in EINER Quellkachel (§10.1 (4)).
 */
export function subTileU16(src: Uint16Array, srcTileW: number, ox: number, oy: number, outW: number, outH: number): Uint16Array {
  const out = new Uint16Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const s = (oy + y) * srcTileW + ox;
    out.set(src.subarray(s, s + outW), y * outW);
  }
  return out;
}

// --- Selbstverifikation -----------------------------------------------------------------------

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Kleiner TIFF-Writer NUR für die Fixtures des Verifiers — schreibt, was der Leser lesen muss. */
async function writeTiffFixture(opts: {
  le: boolean; width: number; height: number; tileW: number; tileH: number;
  spp: number; predictor: 1 | 2; compression: 1 | 8; pixels: Uint8Array | Uint16Array;
  /** 8 (Default, TCI-Pfad) oder 16 (SAT2b-Bandpfad, dann spp = 1). */
  bits?: 8 | 16;
}): Promise<{ buf: ArrayBuffer; tiles: Uint8Array[]; tilesU16: Uint16Array[] }> {
  const { le, width, height, tileW, tileH, spp, predictor, compression, pixels } = opts;
  const bits = opts.bits ?? 8;
  const across = Math.ceil(width / tileW);
  const down = Math.ceil(height / tileH);
  const rowBytes = tileW * spp;

  const tiles: Uint8Array[] = [];
  const tilesU16: Uint16Array[] = [];
  const encoded: Uint8Array[] = [];
  for (let row = 0; row < down; row++) {
    for (let col = 0; col < across; col++) {
      // Randkacheln voll, ungenutzt = 0 (wie TIFF).
      const tile = bits === 16 ? new Uint16Array(rowBytes * tileH) : new Uint8Array(rowBytes * tileH);
      for (let y = 0; y < tileH; y++) {
        const gy = row * tileH + y;
        if (gy >= height) break;
        for (let x = 0; x < tileW; x++) {
          const gx = col * tileW + x;
          if (gx >= width) break;
          for (let s = 0; s < spp; s++) tile[y * rowBytes + x * spp + s] = pixels[(gy * width + gx) * spp + s];
        }
      }
      let enc: Uint8Array;
      if (bits === 16) {
        tilesU16.push(tile as Uint16Array);
        // Predictor 2 wirkt bei 16 bit auf den WERTEN, serialisiert wird in Datei-Byte-Ordnung.
        const vals = tile.slice() as Uint16Array;
        if (predictor === 2) {
          for (let y = 0; y < tileH; y++) {
            const base = y * rowBytes;
            for (let i = rowBytes - 1; i >= spp; i--) vals[base + i] = (vals[base + i] - vals[base + i - spp]) & 0xffff;
          }
        }
        enc = new Uint8Array(vals.length * 2);
        const dv = new DataView(enc.buffer);
        vals.forEach((v, i) => dv.setUint16(i * 2, v, le));
      } else {
        tiles.push(tile as Uint8Array);
        enc = (tile as Uint8Array).slice();
        if (predictor === 2) {
          for (let y = 0; y < tileH; y++) {
            const base = y * rowBytes;
            for (let i = rowBytes - 1; i >= spp; i--) enc[base + i] = (enc[base + i] - enc[base + i - spp]) & 0xff;
          }
        }
      }
      if (compression === 8) enc = await deflateRaw(enc);
      encoded.push(enc);
    }
  }

  const buf = writeTiledTiff({ le, width, height, tileW, tileH, spp, bits, predictor, compression, encodedTiles: encoded });
  return { buf, tiles, tilesU16 };
}

/**
 * Purer Ein-IFD-Tiled-TIFF-Serialisierer — die Kacheln kommen VORKOMPRIMIERT (verbatim) herein.
 * Geteilt vom Fixture-Writer (oben) und vom V-SAT-15-Remux (`scripts/fire/wc/wcRemux.mjs`):
 * der WorldCover-Spiegel kopiert die Deflate-Nutzlasten der 9000er-Ebene unverändert und
 * schreibt nur eine neue IFD mit neuen Offsets — kein Re-Encode, `decodeTile` liest beides.
 */
export function writeTiledTiff(opts: {
  le: boolean; width: number; height: number; tileW: number; tileH: number;
  spp: number; bits: 8 | 16; predictor: number; compression: number;
  encodedTiles: readonly Uint8Array[];
}): ArrayBuffer {
  const { le, width, height, tileW, tileH, spp, bits, predictor, compression, encodedTiles } = opts;
  const entries: Array<{ tag: number; type: number; values: number[] }> = [
    { tag: 256, type: 4, values: [width] },
    { tag: 257, type: 4, values: [height] },
    { tag: 258, type: 3, values: Array.from({ length: spp }, () => bits) },
    { tag: 259, type: 3, values: [compression] },
    { tag: 277, type: 3, values: [spp] },
    { tag: 317, type: 3, values: [predictor] },
    { tag: 322, type: 3, values: [tileW] },
    { tag: 323, type: 3, values: [tileH] },
    { tag: 324, type: 4, values: [] }, // Offsets — nach der Layout-Rechnung gefüllt
    { tag: 325, type: 4, values: encodedTiles.map((e) => e.length) },
  ].sort((a, b) => a.tag - b.tag);

  const ifdOff = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  let dataOff = ifdOff + ifdSize;
  for (const e of entries) {
    const size = TYPE_SIZE[e.type];
    const count = e.tag === 324 ? encodedTiles.length : e.values.length;
    if (size * count > 4) { (e as { dataAt?: number } & typeof e).dataAt = dataOff; dataOff += size * count; }
  }
  const tileStart = dataOff;
  let t = tileStart;
  const tileOffsets = encodedTiles.map((e) => { const at = t; t += e.length; return at; });
  entries.find((e) => e.tag === 324)!.values = tileOffsets;

  const buf = new ArrayBuffer(t);
  const dv = new DataView(buf);
  dv.setUint16(0, le ? 0x4949 : 0x4d4d, false);
  dv.setUint16(2, 42, le);
  dv.setUint32(4, ifdOff, le);
  dv.setUint16(ifdOff, entries.length, le);
  entries.forEach((e, i) => {
    const eo = ifdOff + 2 + i * 12;
    const size = TYPE_SIZE[e.type];
    const count = e.values.length;
    dv.setUint16(eo, e.tag, le);
    dv.setUint16(eo + 2, e.type, le);
    dv.setUint32(eo + 4, count, le);
    const put = (at: number) => e.values.forEach((v, j) => {
      const o = at + j * size;
      if (size === 2) dv.setUint16(o, v, le); else dv.setUint32(o, v, le);
    });
    if (size * count <= 4) put(eo + 8);
    else { const dataAt = (e as { dataAt?: number }).dataAt as number; dv.setUint32(eo + 8, dataAt, le); put(dataAt); }
  });
  dv.setUint32(ifdOff + 2 + entries.length * 12, 0, le); // Ende der IFD-Kette
  const u8 = new Uint8Array(buf);
  encodedTiles.forEach((e, i) => u8.set(e, tileOffsets[i]));
  return buf;
}

export interface CogCheck { name: string; ok: boolean; detail?: string }

export async function verifyCogTiff(): Promise<{ checks: CogCheck[]; passed: number; total: number }> {
  const checks: CogCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
  const pixels = (w: number, h: number, spp: number) =>
    Uint8Array.from({ length: w * h * spp }, (_, i) => (i * 37 + ((i * i) % 251)) & 0xff);

  // Rundlauf byte-gleich: LE und BE, Predictor 1 und 2, Deflate und roh, Mehrkachel mit Rand.
  for (const le of [true, false]) {
    for (const predictor of [1, 2] as const) {
      const w = 13; const h = 9; const tw = 8; const th = 4; const spp = 3;
      const px = pixels(w, h, spp);
      const fx = await writeTiffFixture({ le, width: w, height: h, tileW: tw, tileH: th, spp, predictor, compression: 8, pixels: px });
      const parsed = parseCogIfds(fx.buf);
      const label = `${le ? 'LE' : 'BE'}/Predictor ${predictor}`;
      if (parsed.kind !== 'ok') { add(`Rundlauf ${label}: Parse`, false, parsed.kind); continue; }
      const ifd = parsed.ifds[0];
      add(`Rundlauf ${label}: IFD (2×3 Kacheln, Deflate)`,
        ifd.width === w && ifd.tilesAcross === 2 && ifd.tilesDown === 3
        && ifd.compression === 8 && ifd.predictor === predictor && ifd.samplesPerPixel === spp);
      let all = true;
      const raw = new Uint8Array(fx.buf);
      for (const t of tilesFor(ifd, 0, 0, w, h)) {
        const dec = await decodeTile(raw.slice(t.offset, t.offset + t.byteCount), ifd);
        if (!eq(dec, fx.tiles[t.idx])) all = false;
      }
      add(`Rundlauf ${label}: alle 6 Kacheln byte-gleich (inkl. Randkacheln)`, all);
    }
  }
  {
    const w = 6; const h = 6; const px = pixels(w, h, 1);
    const fx = await writeTiffFixture({ le: true, width: w, height: h, tileW: 4, tileH: 4, spp: 1, predictor: 1, compression: 1, pixels: px });
    const parsed = parseCogIfds(fx.buf);
    const ok = parsed.kind === 'ok'
      && eq(await decodeTile(new Uint8Array(fx.buf).slice(parsed.ifds[0].tileOffsets[0], parsed.ifds[0].tileOffsets[0] + parsed.ifds[0].tileByteCounts[0]), parsed.ifds[0]), fx.tiles[0]);
    add('Rundlauf unkomprimiert/Einband (SAT2b-Vorstufe des Tag-Parsers)', ok);
  }

  // SAT2b: uint16-Rundläufe (Band-COGs) — Predictor 2 auf 16-bit-Werten, beide Byte-Ordnungen.
  for (const le of [true, false]) {
    for (const predictor of [1, 2] as const) {
      const w = 13; const h = 9; const tw = 8; const th = 4;
      // Werte > 255 und > 0x7fff erzwingen echte 16-bit-Pfade (Byte-Ordnung UND Überlauf-Maske).
      const px = Uint16Array.from({ length: w * h }, (_, i) => (i * 9973 + 300) & 0xffff);
      const fx = await writeTiffFixture({ le, width: w, height: h, tileW: tw, tileH: th, spp: 1, predictor, compression: 8, pixels: px, bits: 16 });
      const parsed = parseCogIfds(fx.buf);
      const label = `u16 ${le ? 'LE' : 'BE'}/Predictor ${predictor}`;
      if (parsed.kind !== 'ok') { add(`Rundlauf ${label}: Parse`, false, parsed.kind); continue; }
      const ifd = parsed.ifds[0];
      add(`Rundlauf ${label}: IFD (16 bit, Byte-Ordnung erkannt)`,
        ifd.bitsPerSample === 16 && ifd.samplesPerPixel === 1 && ifd.littleEndian === le);
      let all = true;
      const raw = new Uint8Array(fx.buf);
      for (const t of tilesFor(ifd, 0, 0, w, h)) {
        const dec = await decodeTileU16(raw.slice(t.offset, t.offset + t.byteCount), ifd);
        const want = fx.tilesU16[t.idx];
        if (dec.length !== want.length || !dec.every((v, i) => v === want[i])) all = false;
      }
      add(`Rundlauf ${label}: alle 6 Kacheln wert-gleich (inkl. Randkacheln)`, all);
    }
  }
  {
    // subTileU16: 256er-Ausschnitt aus einer 512er-B04-Kachel (der §10.1-(4)-Fall, verkleinert).
    const src = Uint16Array.from({ length: 8 * 8 }, (_, i) => i);
    const cut = subTileU16(src, 8, 4, 2, 4, 3);
    add('subTileU16: Ausschnitt wert-genau (B04-512er → 256er-Gitter)',
      cut.length === 12 && cut[0] === 2 * 8 + 4 && cut[3] === 2 * 8 + 7 && cut[11] === 4 * 8 + 7);
    let err = '';
    try { await decodeTileU16(new Uint8Array(2), { ...({} as CogIfd), bitsPerSample: 8, samplesPerPixel: 1, compression: 1, predictor: 1, tileW: 1, tileH: 1, littleEndian: true, width: 1, height: 1, tilesAcross: 1, tilesDown: 1, tileOffsets: [], tileByteCounts: [] }); } catch (e) { err = String(e); }
    add('decodeTileU16: 8-bit-Kachel ⇒ benannter cog-unsupported-Fehler', err.includes('cog-unsupported'));
  }

  // needMoreBytes: ein beschnittener Puffer nennt das benötigte Ende, statt still zu scheitern.
  {
    const fx = await writeTiffFixture({ le: true, width: 13, height: 9, tileW: 8, tileH: 4, spp: 3, predictor: 2, compression: 8, pixels: pixels(13, 9, 3) });
    const cut = parseCogIfds(fx.buf.slice(0, 40));
    add('needMoreBytes nennt das benötigte Pufferende', cut.kind === 'needMoreBytes' && cut.upTo > 40 && cut.upTo <= fx.buf.byteLength);
    // Der Lade-Vertrag ist iterativ (jede Runde nennt das nächste fehlende Ende) — er muss in
    // wenigen Runden konvergieren, genau so arbeitet der Header-Abrufer im Viewer.
    let state = cut;
    let rounds = 0;
    while (state.kind === 'needMoreBytes' && rounds < 6) {
      state = parseCogIfds(fx.buf.slice(0, state.upTo));
      rounds++;
    }
    add(`Nachschub konvergiert (${rounds} Runden)`, state.kind === 'ok' && rounds <= 5);
  }

  // Fremde Formate sind benannte Fehler, nie stille Falschbilder.
  {
    const fx = await writeTiffFixture({ le: true, width: 4, height: 4, tileW: 4, tileH: 4, spp: 1, predictor: 1, compression: 1, pixels: pixels(4, 4, 1) });
    const parsed = parseCogIfds(fx.buf);
    const ifd = (parsed as { ifds: CogIfd[] }).ifds[0];
    let err = '';
    try { await decodeTile(new Uint8Array(4), { ...ifd, compression: 5 }); } catch (e) { err = String(e); }
    add('fremde Compression ⇒ benannter cog-unsupported-Fehler', err.includes('cog-unsupported'));
    add('kein TIFF ⇒ unsupported mit Grund', (() => {
      const r = parseCogIfds(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer as ArrayBuffer);
      return r.kind === 'unsupported' && r.reason.includes('Magic');
    })());
  }

  // Ebenenwahl an der ECHTEN Pyramide (10980/5490/2745/1373/687, 10 m Vollauflösung).
  {
    const mk = (width: number): CogIfd => ({
      width, height: width, tileW: 512, tileH: 512, samplesPerPixel: 3, bitsPerSample: 8,
      compression: 8, predictor: 2, littleEndian: true, tilesAcross: Math.ceil(width / 512), tilesDown: Math.ceil(width / 512),
      tileOffsets: [], tileByteCounts: [],
    });
    const pyr = [10980, 5490, 2745, 1373, 687].map(mk);
    add('pickLevel: Ziel 36 m/px ⇒ 20-m-Ebene (5490)', pickLevel(pyr, 36, 10).ifd.width === 5490);
    add('pickLevel: Ziel 10 m/px ⇒ Vollauflösung', pickLevel(pyr, 10, 10).ifd.width === 10980);
    add('pickLevel: Ziel 5 m/px ⇒ Endanschlag Vollauflösung', pickLevel(pyr, 5, 10).ifd.width === 10980);
    add('pickLevel: Ziel 200 m/px ⇒ gröbste Ebene (687)', pickLevel(pyr, 200, 10).ifd.width === 687);
  }

  // Kachelwahl: Fensterindizes nachgerechnet, Klemmung an den Rand.
  {
    const ifd: CogIfd = {
      width: 10980, height: 10980, tileW: 1024, tileH: 1024, samplesPerPixel: 3, bitsPerSample: 8,
      compression: 8, predictor: 2, littleEndian: true, tilesAcross: 11, tilesDown: 11,
      tileOffsets: Array.from({ length: 121 }, (_, i) => 1000 + i * 10), tileByteCounts: Array.from({ length: 121 }, () => 7),
    };
    // Fenster px 1000–2100 × py 2000–2100: Spalten 0–2 (Spalte 2 beginnt bei 2048), Zeilen 1–2.
    const t1 = tilesFor(ifd, 1000, 2000, 2100, 2100);
    add('tilesFor: Fenster über 3×2 Kacheln, Indizes korrekt', t1.length === 6
      && t1[0].col === 0 && t1[0].row === 1 && t1[5].idx === 2 * 11 + 2);
    const t2 = tilesFor(ifd, -50, 10900, 50, 12000);
    add('tilesFor: Klemmung an den Bildrand', t2.length === 1 && t2[0].col === 0 && t2[0].row === 10);
    add('estimateBytes summiert das Inhaltsverzeichnis', estimateBytes(t1) === 42);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
