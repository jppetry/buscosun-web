/**
 * Einmal-Werkzeug: Geländehöhe für neue Ortsseiten aus denselben Terrarium-Kacheln,
 * aus denen auch die App ihre Höhen liest (`src/fusion/elevation.ts`).
 *
 * Läuft NICHT im Build. Es holt die Höhen einmal, damit sie als feste Zahlen in
 * `places.mjs` stehen — der Build bleibt netzfrei, und die Ortsseiten zeigen dieselbe
 * Höhe, mit der die Karte rechnet (statt einer zweiten Quelle, die davon abweicht).
 *
 * Aufruf: node scripts/seo/fetch-place-elevation.mjs <eingabe.json> [zoom]
 * Eingabe: [{ slug, name, lat, lon, … }]  →  Ausgabe: dieselben Objekte mit `ele`.
 *
 * PNG-Dekodierung von Hand (zlib aus der Standardbibliothek), weil das Repo bewusst
 * keine Bildbibliothek als Abhängigkeit führt.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TILE = 256;

/** Kachel- und Pixelkoordinate eines Punktes (Web-Mercator). */
function tileFor(lat, lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return {
    tx: Math.floor(x), ty: Math.floor(y),
    px: Math.min(TILE - 1, Math.floor((x - Math.floor(x)) * TILE)),
    py: Math.min(TILE - 1, Math.floor((y - Math.floor(y)) * TILE)),
  };
}

/** Minimaler PNG-Dekoder für 8-Bit RGB/RGBA ohne Interlace — mehr liefert Terrarium nicht. */
function decodePng(buf) {
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
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`PNG-Variante nicht unterstützt (bitDepth ${bitDepth}, colorType ${colorType})`);
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
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error('unbekannter PNG-Filter ' + filter);
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, bpp, data: out };
}

/** Terrarium-Kodierung: Höhe in Metern aus R, G, B. */
const elevationAt = (img, px, py) => {
  const i = py * img.width * img.bpp + px * img.bpp;
  return img.data[i] * 256 + img.data[i + 1] + img.data[i + 2] / 256 - 32768;
};

const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const zoom = Number(process.argv[3] ?? 12);
const cache = new Map();

for (const place of input) {
  const { tx, ty, px, py } = tileFor(place.lat, place.lon, zoom);
  const key = `${zoom}/${tx}/${ty}`;
  if (!cache.has(key)) {
    const url = TERRARIUM.replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    cache.set(key, decodePng(Buffer.from(await res.arrayBuffer())));
  }
  place.ele = Math.round(elevationAt(cache.get(key), px, py));
  console.log(`${place.slug.padEnd(28)} ${String(place.ele).padStart(5)} m`);
}

writeFileSync(process.argv[2], JSON.stringify(input, null, 1), 'utf8');
console.log(`\n${input.length} Höhen aus ${cache.size} Kacheln (Zoom ${zoom}), zurückgeschrieben nach ${process.argv[2]}`);
