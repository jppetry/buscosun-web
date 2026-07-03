/**
 * GRIB2-Decoder — reine, browser-unabhängige Dekodierung (kein WebGL/DOM/bz2).
 *
 * Unterstützt genau das, was unsere DWD-Quellen brauchen:
 *   • GDT 0  — reguläres lat-lon-Gitter.
 *   • DRT 0/1 — simple packing (ICON-D2 single-level: 16 bit + optionale Bitmap).
 *   • DRT 42 — CCSDS-AEC (ICON-EU pressure-level u/v; reiner JS-Port von libaec).
 *
 * Bewusst frei von Browser-Abhängigkeiten, damit der Decoder in Node headless
 * gegen eine eccodes-Gold-Referenz bit-/wertgenau verifizierbar ist
 * (scripts/verify-aec.mjs). `iconD2Precip` re-exportiert die Symbole, sodass
 * bestehende Importpfade unverändert bleiben.
 */

export interface GribField {
  ni: number;
  nj: number;
  /** Eckwerte in Grad (Mittelpunkte der Eckzellen). lon bereits auf −180..180. */
  lat1: number; lon1: number; lat2: number; lon2: number;
  /** Gitterweite in Grad. */
  di: number; dj: number;
  /** Scanning-Mode-Flags (GRIB2 Tabelle 3.4). */
  scanMode: number;
  /** ni·nj Werte in Scan-Reihenfolge, NaN = Bitmap-maskiert (kein Wert). */
  values: Float32Array;
  /**
   * true = unstrukturiertes (icosahedrales) ICON-Gitter (GDT 101): `values` ist
   * ein flaches Array von `ni` Zellen (nj=1), lat/lon/di/dj sind bedeutungslos —
   * die Zellkoordinaten kommen aus separaten `clat`/`clon`-Feldern. Für ICON-D2-
   * EPS (nur icosahedral publiziert). Reguläre lat-lon-Felder (GDT 0) haben das
   * Flag nicht gesetzt.
   */
  unstructured?: boolean;
}

/** 16-bit-Ganzzahl in GRIB2-Vorzeichen-Betrag-Darstellung. */
function signMag16(v: number): number {
  return v & 0x8000 ? -(v & 0x7fff) : v;
}

/** 32-bit-Ganzzahl in GRIB2-Vorzeichen-Betrag-Darstellung (für lat/lon). */
function signMag16Big(v: number): number {
  return v & 0x80000000 ? -(v & 0x7fffffff) : v;
}

/**
 * CCSDS-AEC-Dekompression (GRIB2 DRT 42 / Template 5.42) — reiner JS-Port der
 * libaec/CCSDS-121-Decode-Pfads für GRIB: MSB-first, Preprocessing (Referenz-
 * samples je RSI) AN, vorzeichenlose Werte. Liefert die `count` ganzzahligen
 * Packwerte (vor dem R/E/D-Skalieren).
 *
 * Optionen je Block (id_len-Bit-ID): id=0 → Low-Entropy (1 Bit: 0=Zero-Block-Run,
 * 1=Second-Extension); id=all-ones → unkomprimiert (bitsPerSample je Sample);
 * sonst → Rice mit k=id−1 (Fundamental-Sequence-High + k-Bit-Low). Das erste
 * Sample je RSI ist ein direkt kodiertes Referenzsample; Folgesamples sind über
 * die CCSDS-Mapping-Vorschrift kodierte Prädiktionsresiduen.
 */
export function aecDecode(data: Uint8Array, bitsPerSample: number, count: number, blockSize: number, rsi: number): Int32Array {
  const out = new Int32Array(count);
  if (bitsPerSample === 0) return out; // konstantes Feld → alle 0 (Wert = R)
  // Bitleser ist nur für ≤16-Bit-Samples sicher (kein 32-bit-Overflow); ICON-EU-
  // Druckflächen sind 16-bit. Größere Auflösung lehnen wir ehrlich ab.
  if (bitsPerSample > 16) throw new Error('AEC: bitsPerSample > 16 nicht unterstützt');

  const idLen = bitsPerSample > 8 ? 4 : bitsPerSample > 4 ? 3 : bitsPerSample > 2 ? 2 : 1;
  const idUncomp = (1 << idLen) - 1;
  const xmax = (1 << bitsPerSample) - 1;

  // MSB-first-Bitleser. Overrun-Schutz: verhindert Endlosschleifen in readFS bei
  // einem Decode-Fehler (sonst läse man undefined→0 unbegrenzt).
  const end = data.length;
  let dpos = 0, bitbuf = 0, bitcnt = 0;
  const rd = (n: number): number => {
    if (n === 0) return 0;
    while (bitcnt < n) {
      if (dpos >= end + 4) throw new Error('AEC: Bitstrom-Überlauf (Decode-Fehler)');
      bitbuf = ((bitbuf << 8) | (data[dpos++] | 0)) >>> 0; bitcnt += 8;
    }
    bitcnt -= n;
    return (bitbuf >>> bitcnt) & ((1 << n) - 1);
  };
  const readFS = (): number => { let n = 0; while (rd(1) === 0) { if (++n > 1 << 24) throw new Error('AEC: FS-Überlauf'); } return n; };

  // CCSDS-Inverse-Mapping: Residuum δ + Vorgänger → Sample.
  const unmap = (delta: number, prev: number): number => {
    const theta = prev < xmax - prev ? prev : xmax - prev; // min(prev-0, xmax-prev)
    if (delta <= 2 * theta) return (delta & 1) === 0 ? prev + (delta >>> 1) : prev - ((delta + 1) >>> 1);
    return prev < xmax - prev ? prev + (delta - theta) : prev - (delta - theta);
  };

  let oi = 0;
  while (oi < count) {
    let prev = 0;
    let refPending = true;       // erstes Sample der RSI = Referenz
    for (let blk = 0; blk < rsi && oi < count; blk++) {
      const id = rd(idLen);
      let nSamp = blockSize;
      if (refPending) {
        prev = rd(bitsPerSample);
        out[oi++] = prev; nSamp = blockSize - 1; refPending = false;
        if (oi >= count) break;
      }
      if (id === idUncomp) {
        for (let j = 0; j < nSamp && oi < count; j++) { prev = unmap(rd(bitsPerSample), prev); out[oi++] = prev; }
      } else if (id === 0) {
        const sub = rd(1);
        if (sub === 0) {
          // Zero-Block-Run (δ=0 → Wert bleibt konstant). ROS = bis Segmentende.
          let zb = readFS() + 1;
          const ROS = 5;
          if (zb === ROS) zb = rsi - blk;       // alle restlichen Blöcke der RSI
          else if (zb > ROS) zb--;
          for (let b = 0; b < zb && oi < count; b++) {
            const cnt = b === 0 ? nSamp : blockSize;
            for (let j = 0; j < cnt && oi < count; j++) { prev = unmap(0, prev); out[oi++] = prev; }
          }
          blk += zb - 1; // diese Schleife hat zb Blöcke (aktueller + zb−1) verbraucht
        } else {
          // Second Extension: Paare über Dreieckscode (m → (d0,d1)).
          for (let j = 0; j < nSamp && oi < count; j += 2) {
            const m = readFS();
            let s = Math.floor((Math.sqrt(8 * m + 1) - 1) / 2);
            while (((s + 1) * (s + 2)) / 2 <= m) s++;
            while ((s * (s + 1)) / 2 > m) s--;
            const d1 = m - (s * (s + 1)) / 2;
            const d0 = s - d1;
            prev = unmap(d0, prev); out[oi++] = prev;
            if (j + 1 < nSamp && oi < count) { prev = unmap(d1, prev); out[oi++] = prev; }
          }
        }
      } else {
        const k = id - 1;
        const hi = new Array<number>(nSamp);
        for (let j = 0; j < nSamp; j++) hi[j] = readFS();
        for (let j = 0; j < nSamp && oi < count; j++) {
          const low = k > 0 ? rd(k) : 0;
          prev = unmap(hi[j] * Math.pow(2, k) + low, prev);
          out[oi++] = prev;
        }
      }
    }
  }
  return out;
}

/** Dekodiert die erste GRIB2-Nachricht eines (bereits entpackten) Puffers. */
export function decodeGrib2(raw: Uint8Array): GribField {
  // 'GRIB'-Indikator suchen (der bz2-Output kann Vor-/Nachlauf enthalten).
  let p = 0;
  while (
    p < raw.length - 4 &&
    !(raw[p] === 0x47 && raw[p + 1] === 0x52 && raw[p + 2] === 0x49 && raw[p + 3] === 0x42)
  ) p++;
  if (p >= raw.length - 4) throw new Error('GRIB2: kein GRIB-Indikator gefunden');
  if (raw[p + 7] !== 2) throw new Error('GRIB2: Edition ' + raw[p + 7] + ' nicht unterstützt');

  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  let ni = 0, nj = 0, la1 = 0, lo1 = 0, la2 = 0, lo2 = 0, di = 0, dj = 0, scanMode = 0;
  let R = 0, E = 0, D = 0, nbits = 0, ndata = -1;
  let drt = 0, aecBlock = 0, aecRsi = 0; // DRT 42 (CCSDS/AEC)
  let bitmap: Uint8Array | null = null;
  let hasBitmap = false;
  let unstructured = false;
  let data: Uint8Array | null = null;

  let off = p + 16; // Sektion 0 ist 16 Byte
  while (off < raw.length - 4) {
    if (raw[off] === 0x37 && raw[off + 1] === 0x37 && raw[off + 2] === 0x37 && raw[off + 3] === 0x37) {
      break; // '7777' = Nachrichtenende
    }
    const seclen = dv.getUint32(off);
    if (seclen < 5 || off + seclen > raw.length) throw new Error('GRIB2: ungültige Sektionslänge');
    const secnum = raw[off + 4];
    if (secnum === 3) {
      const gdt = dv.getUint16(off + 12);
      if (gdt === 0) {
        ni = dv.getUint32(off + 30);
        nj = dv.getUint32(off + 34);
        la1 = signMag16Big(dv.getUint32(off + 46)) / 1e6;
        lo1 = signMag16Big(dv.getUint32(off + 50)) / 1e6;
        la2 = signMag16Big(dv.getUint32(off + 55)) / 1e6;
        lo2 = signMag16Big(dv.getUint32(off + 59)) / 1e6;
        di = dv.getUint32(off + 63) / 1e6;
        dj = dv.getUint32(off + 67) / 1e6;
        scanMode = raw[off + 71];
      } else if (gdt === 101) {
        // Unstrukturiertes (icosahedrales) ICON-Gitter: keine ni/nj/lat-lon im
        // File. `numberOfDataPoints` (Sektion-3-Gemeinfeld, Oktett 7-10) liefert
        // die Zellzahl; wir modellieren sie als ni=N, nj=1 (flaches Werte-Array).
        // Die Zellkoordinaten kommen aus den separaten clat/clon-Feldern.
        unstructured = true;
        ni = dv.getUint32(off + 6);
        nj = 1;
      } else {
        throw new Error('GRIB2: GDT ' + gdt + ' (nur GDT 0 reg-latlon + GDT 101 icosahedral)');
      }
    } else if (secnum === 5) {
      ndata = dv.getUint32(off + 5);
      drt = dv.getUint16(off + 9);
      if (drt !== 0 && drt !== 1 && drt !== 42) throw new Error('GRIB2: DRT ' + drt + ' (nur simple packing / CCSDS-AEC)');
      R = dv.getFloat32(off + 11);
      E = signMag16(dv.getUint16(off + 15));
      D = signMag16(dv.getUint16(off + 17));
      nbits = raw[off + 19];
      if (drt === 42) { aecBlock = raw[off + 22]; aecRsi = dv.getUint16(off + 23); }
    } else if (secnum === 6) {
      const bmi = raw[off + 5];
      if (bmi === 0) { hasBitmap = true; bitmap = raw.subarray(off + 6, off + seclen); }
      else if (bmi !== 255) throw new Error('GRIB2: vordefinierte Bitmap nicht unterstützt');
    } else if (secnum === 7) {
      data = raw.subarray(off + 5, off + seclen);
    }
    off += seclen;
  }

  if (!ni || !nj) throw new Error('GRIB2: keine Gitterdefinition (Sektion 3)');
  if (!data) throw new Error('GRIB2: keine Datensektion (Sektion 7)');

  const npoints = ni * nj;
  const values = new Float32Array(npoints);
  const scaleE = Math.pow(2, E);
  const scaleD = Math.pow(10, -D);

  // Wert mit Index i aus dem nbits-Bitstrom lesen (MSB-first). Schnellpfade
  // für die byte-ausgerichteten Fälle 8/16 bit (ICON-D2 nutzt 16).
  const readValue = (i: number): number => {
    if (nbits === 0) return 0;
    if (nbits === 16) return (data![i * 2] << 8) | data![i * 2 + 1];
    if (nbits === 8) return data![i];
    let bitOff = i * nbits;
    let v = 0;
    for (let b = 0; b < nbits; b++) {
      v = (v << 1) | ((data![bitOff >> 3] >> (7 - (bitOff & 7))) & 1);
      bitOff++;
    }
    return v;
  };

  // DRT 42: zuerst den AEC-Bitstrom in die ganzzahligen Packwerte dekodieren.
  const npresent = ndata >= 0 ? ndata : npoints;
  const aecVals = drt === 42 ? aecDecode(data!, nbits, npresent, aecBlock, aecRsi) : null;
  const getInt = (i: number): number => (aecVals ? aecVals[i] : readValue(i));

  let di_ = 0;
  for (let k = 0; k < npoints; k++) {
    const present = !hasBitmap || ((bitmap![k >> 3] >> (7 - (k & 7))) & 1) === 1;
    if (present) {
      values[k] = (R + getInt(di_) * scaleE) * scaleD;
      di_++;
    } else {
      values[k] = NaN;
    }
  }
  // Sektion-5-Punktzahl muss zur Anzahl der via Bitmap präsenten Zellen passen.
  if (ndata >= 0 && di_ !== ndata) {
    throw new Error(`GRIB2: Datenanzahl inkonsistent (${di_} ≠ ${ndata})`);
  }

  let normLon1 = lo1 > 180 ? lo1 - 360 : lo1;
  let normLon2 = lo2 > 180 ? lo2 - 360 : lo2;

  return {
    ni, nj,
    lat1: la1, lon1: normLon1, lat2: la2, lon2: normLon2,
    di, dj, scanMode, values,
    unstructured,
  };
}

/**
 * Dekodiert ALLE GRIB2-Nachrichten eines (entpackten) Puffers — für Multi-
 * Message-Dateien wie ICON-D2-EPS, wo ein Datei je Step alle ~20 Ensemble-
 * Member als separate Nachrichten enthält. Iteriert über die Gesamtlänge aus
 * Sektion 0 (Oktett 9-16), dekodiert jede Nachricht einzeln. Reihenfolge =
 * Datei-Reihenfolge (i. d. R. perturbationNumber aufsteigend).
 */
export function decodeGrib2All(raw: Uint8Array): GribField[] {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out: GribField[] = [];
  let off = 0;
  while (off < raw.length - 4) {
    if (!(raw[off] === 0x47 && raw[off + 1] === 0x52 && raw[off + 2] === 0x49 && raw[off + 3] === 0x42)) {
      off++;
      continue;
    }
    // Sektion 0: Gesamtlänge der Nachricht (Oktett 9-16, 64-bit big-endian).
    const totalLen = Number(dv.getBigUint64(off + 8));
    if (totalLen < 16 || off + totalLen > raw.length) break;
    // Einzelne fehlerhafte Nachricht überspringen statt den ganzen Satz zu
    // verwerfen. ICON-D2-EPS: gelegentlich trägt ein einzelner Member ein
    // vollflächiges Bitmap-Layout, das nicht sauber parst — für das Ensemble-
    // Mittel ist der Verlust eines Members irrelevant. Die Nachrichtengrenze
    // (totalLen) ist unabhängig vom Inhalt korrekt → wir resynchronisieren sauber.
    try { out.push(decodeGrib2(raw.subarray(off, off + totalLen))); } catch { /* skip */ }
    off += totalLen;
  }
  if (out.length === 0) throw new Error('GRIB2: keine dekodierbare Nachricht gefunden');
  return out;
}

/**
 * Bildecken (Außenkanten = Zellmittelpunkt ± halbe Gitterweite) in der
 * MapLibre-`image`-Reihenfolge [NW, NE, SE, SW]. ICON-D2 ist ein reguläres
 * lat-lon-Gitter → die achsparallele Platzierung ist exakt (keine Scherung).
 */
export function gribCorners(f: GribField): [
  [number, number], [number, number], [number, number], [number, number],
] {
  const w = Math.min(f.lon1, f.lon2) - f.di / 2;
  const e = Math.max(f.lon1, f.lon2) + f.di / 2;
  const s = Math.min(f.lat1, f.lat2) - f.dj / 2;
  const n = Math.max(f.lat1, f.lat2) + f.dj / 2;
  return [[w, n], [e, n], [e, s], [w, s]];
}
