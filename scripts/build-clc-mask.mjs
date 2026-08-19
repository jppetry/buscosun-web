/**
 * Baut die statische Landbedeckungsmaske für die Waldbrand-Bewertung (GWBA1 A4,
 * Jans Entscheidung 2026-08-15: **CORINE-only, ≤ 100 KB, null Requests im
 * Renderpfad**; OSM/Geofabrik bewusst nicht — damit entfällt die ODbL-Frage).
 *
 *   node scripts/build-clc-mask.mjs [--out public/fire/clc-industry-mask.png]
 *
 * Quelle: EEA discomap, CLC2018 Vektor-Layer 0 (`Corine/CLC2018_WM/MapServer/0`),
 * Klassen **121** (Industrie-/Gewerbeflächen), **131** (Abbauflächen), **132**
 * (Deponien) — die drei CLC-Klassen, in denen dauerhafte Wärmequellen
 * (Stahlwerke, Kraftwerke, Raffinerien, Tagebaue, Deponien) liegen. Abfrage per
 * REST-Query (paginiert, 1 000/Seite, ~14 500 Polygone in DACH), lokal auf ein
 * 0,01°-Raster gerastert (Scanline, gerade-ungerade-Regel), als 8-bit-Graustufen-
 * PNG (0 = sonstige Fläche, 255 = Industrie/Abbau/Deponie) geschrieben. Ein
 * kleines Sidecar-JSON trägt BBox, Größe, Quelle und Build-Datum.
 *
 * Grenzen (gehören in den Steckbrief): CLC ist Stand 2018, 100 m Auflösung,
 * MMU 25 ha; ein 375-m-VIIRS-Pixel überdeckt mehrere Zellen, ein Brand am Rand
 * eines Industriegebiets fällt falsch. Deshalb im Produkt: **Plausibilität, nie
 * harter Ausschluss**.
 *
 * Attribution: „Generated using European Union's Copernicus Land Monitoring
 * Service information; https://doi.org/10.2909/960998c1-1870-4e82-8051-6485205ebbac".
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = argVal('--out', 'public/fire/clc-industry-mask.png');
const META = OUT.replace(/\.png$/, '.json');

const BASE = 'https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/0/query';
const BBOX = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
const STEP = 0.01; // Grad je Zelle (~1,1 km × ~0,7 km)
const W = Math.round((BBOX.east - BBOX.west) / STEP);   // 1200
const H = Math.round((BBOX.north - BBOX.south) / STEP); // 1000
const CLASSES = ['121', '131', '132'];
const PAGE = 1000;

async function fetchPage(offset) {
  const q = new URLSearchParams({
    where: `Code_18 IN (${CLASSES.map((c) => `'${c}'`).join(',')})`,
    geometry: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Code_18', returnGeometry: 'true', outSR: '4326', geometryPrecision: '4',
    maxAllowableOffset: String(STEP / 3), resultOffset: String(offset), resultRecordCount: String(PAGE),
    orderByFields: 'OBJECTID', f: 'json',
  });
  const res = await fetch(`${BASE}?${q}`, { headers: { Origin: 'https://buscosun.com' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j;
}

// Rasterisierung: gerade-ungerade-Regel je Zeile (Zellmitten).
const grid = new Uint8Array(W * H);
function fillRing(ring) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of ring) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const r0 = Math.max(0, Math.floor((BBOX.north - maxY) / STEP));
  const r1 = Math.min(H - 1, Math.ceil((BBOX.north - minY) / STEP));
  for (let r = r0; r <= r1; r++) {
    const y = BBOX.north - (r + 0.5) * STEP;
    const xs = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.round((xs[k] - BBOX.west) / STEP - 0.5));
      const c1 = Math.min(W - 1, Math.round((xs[k + 1] - BBOX.west) / STEP - 0.5));
      for (let c = c0; c <= c1; c++) grid[r * W + c] ^= 255; // XOR: Löcher (innere Ringe) heben auf
    }
  }
}

// PNG-Encoder (Graustufe 8 bit, minimal): Signatur + IHDR + IDAT + IEND.
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, gray) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let r = 0; r < h; r++) { raw[r * (w + 1)] = 0; gray.copy ? gray.copy(raw, r * (w + 1) + 1, r * w, (r + 1) * w) : raw.set(gray.subarray(r * w, (r + 1) * w), r * (w + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

let offset = 0, total = 0, rings = 0;
const t0 = Date.now();
for (;;) {
  const j = await fetchPage(offset);
  const feats = j.features ?? [];
  for (const f of feats) {
    for (const ring of f.geometry?.rings ?? []) { fillRing(ring); rings++; }
  }
  total += feats.length;
  process.stdout.write(`\r  ${total} Polygone, ${rings} Ringe … ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (!j.exceededTransferLimit && feats.length < PAGE) break;
  offset += feats.length;
  if (feats.length === 0) break;
}
console.log('');
let set = 0; for (const v of grid) if (v) set++;
const png = encodePng(W, H, grid);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
writeFileSync(META, JSON.stringify({
  source: 'EEA discomap CLC2018 (Corine/CLC2018_WM/MapServer/0), Code_18 IN (121,131,132)',
  attribution: "Generated using European Union's Copernicus Land Monitoring Service information",
  built: new Date().toISOString().slice(0, 10), bbox: BBOX, step: STEP, width: W, height: H,
  polygons: total, cells: set, cellSharePct: Math.round((set / (W * H)) * 10000) / 100,
  classes: CLASSES,
}, null, 2));
console.log(`→ ${OUT} (${(png.length / 1024).toFixed(1)} KB), ${total} Polygone, ${set} Zellen (${((set / (W * H)) * 100).toFixed(2)} %) · ${META}`);
