/**
 * Geometrie-Helfer für die einmaligen Abruf-Werkzeuge der Ortsseiten (Build-only, keine Abhängigkeiten).
 */
import { inflateSync } from 'node:zlib';

const R = Math.PI / 180;

/** Großkreis-Entfernung in km. */
export function distKm(lat1, lon1, lat2, lon2) {
  const h = Math.sin((lat2 - lat1) * R / 2) ** 2 + Math.cos(lat1 * R) * Math.cos(lat2 * R) * Math.sin((lon2 - lon1) * R / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * WGS84 → Gauß-Krüger Streifen 3 (EPSG:31467, DHDN/Bessel). Die DWD-Klimaraster liegen in diesem System.
 * Datumsverschiebung als geozentrische Translation (DHDN→WGS84: +598,1 / +73,7 / +418,2 m); die Drehungen
 * bleiben unter wenigen Metern und gehen bei 1-km-Zellen nicht ein.
 */
export function wgs84ToGk3(lat, lon) {
  const rad = (d) => d * R;
  // WGS84 geodätisch → geozentrisch
  const aW = 6378137, fW = 1 / 298.257223563, e2W = fW * (2 - fW);
  const phi = rad(lat), lam = rad(lon);
  const Nw = aW / Math.sqrt(1 - e2W * Math.sin(phi) ** 2);
  let X = Nw * Math.cos(phi) * Math.cos(lam), Y = Nw * Math.cos(phi) * Math.sin(lam), Z = Nw * (1 - e2W) * Math.sin(phi);
  X -= 598.1; Y -= 73.7; Z -= 418.2;
  // geozentrisch → Bessel geodätisch (iterativ)
  const a = 6377397.155, f = 1 / 299.1528128, e2 = f * (2 - f);
  const p = Math.hypot(X, Y);
  let ph = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 6; i++) { const N = a / Math.sqrt(1 - e2 * Math.sin(ph) ** 2); ph = Math.atan2(Z + e2 * N * Math.sin(ph), p); }
  const la = Math.atan2(Y, X);
  // Gauß-Krüger (transversale Mercator-Abbildung, Mittelmeridian 9° E, Maßstab 1)
  const ep2 = e2 / (1 - e2);
  const N = a / Math.sqrt(1 - e2 * Math.sin(ph) ** 2);
  const T = Math.tan(ph) ** 2, C = ep2 * Math.cos(ph) ** 2, A = (la - rad(9)) * Math.cos(ph);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * ph
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * ph)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * ph)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * ph));
  const x = N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120);
  const y = M + N * Math.tan(ph) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720);
  return { e: 3500000 + x, n: y };
}

/** Minimaler PNG-Dekoder für 8-Bit RGB/RGBA ohne Interlace (Terrarium-Kacheln). Gleiche Logik wie fetch-place-elevation.mjs. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('kein PNG');
  let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`PNG-Variante nicht unterstützt (${bitDepth}/${colorType})`);
      if (data[12] !== 0) throw new Error('interlaced PNG nicht unterstützt');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error('unbekannter PNG-Filter ' + filter);
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, bpp, data: out };
}
