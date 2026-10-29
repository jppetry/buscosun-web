/**
 * build-places-europe.mjs — Ortsverzeichnis für die Europa-Ansicht des Brandradars.
 *
 *   node scripts/build-places-europe.mjs            # schreibt public/fire/places-europe.json
 *   node scripts/build-places-europe.mjs --min 2000 # andere Bevölkerungsschwelle
 *
 * Ergänzt `places-dach.json` (build-places-dach.mjs) um die übrigen Länder der
 * Europa-Box (`src/fire/fireRegion.ts`, 25° W–32° O, 34–72° N) — DE/AT/CH sind
 * NICHT enthalten, die stehen unverändert in der DACH-Datei. Geladen wird die
 * Datei nur, wenn im Brandradar „Europa" gewählt ist.
 *
 * Quelle: GeoNames `cities1000.zip` + `admin1CodesASCII.txt` + `admin2Codes.txt`
 * (https://download.geonames.org/export/dump/, CC BY 4.0). Inhalt wie die
 * DACH-Datei: bewohnte Orte (Klasse P, ohne PPLX) ab `--min` Einwohnern mit
 * dem Namen ihrer Verwaltungseinheit — ADM2 (Provinz, Département, Kreis …),
 * sonst ADM1. Namen so, wie GeoNames sie führt.
 *
 * Netzabhängig; schreibt NUR public/fire/places-europe.json.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'fire', 'places-europe.json');
const MIN_POP = Number(process.argv.includes('--min') ? process.argv[process.argv.indexOf('--min') + 1] : 1500);
const BASE = 'https://download.geonames.org/export/dump/';
/** Dieselbe Box wie `EUROPE_BOX` in src/fire/fireRegion.ts. */
const BOX = { west: -25, south: 34, east: 32, north: 72 };
const DACH = new Set(['DE', 'AT', 'CH']);

/** Einträge eines Zips über das Central Directory (nur STORE/DEFLATE, kein ZIP64). */
function unzip(buf) {
  const out = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70_000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('kein Central Directory gefunden');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Central-Directory-Eintrag defekt');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28); const extraLen = buf.readUInt16LE(p + 30); const cmtLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const ln = buf.readUInt16LE(localOff + 26); const le = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + ln + le;
    const data = buf.subarray(dataStart, dataStart + csize);
    out.set(name, method === 8 ? inflateRawSync(data) : method === 0 ? Buffer.from(data) : null);
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

async function fetchBuf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function codeTable(text) {
  const m = new Map();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [code, name] = line.split('\t');
    if (code && name) m.set(code, name);
  }
  return m;
}

const adm1 = codeTable((await fetchBuf(`${BASE}admin1CodesASCII.txt`)).toString('utf8'));
const adm2 = codeTable((await fetchBuf(`${BASE}admin2Codes.txt`)).toString('utf8'));
const zip = unzip(await fetchBuf(`${BASE}cities1000.zip`));
const txt = zip.get('cities1000.txt');
if (!txt) throw new Error('cities1000.zip ohne cities1000.txt');

const places = [];
const districts = [];
const districtIdx = new Map();
const idx = (name) => {
  let i = districtIdx.get(name);
  if (i == null) { i = districts.length; districts.push(name); districtIdx.set(name, i); }
  return i;
};
const byCountry = {};
let stamp = '';
for (const line of txt.toString('utf8').split('\n')) {
  if (!line) continue;
  const f = line.split('\t');
  // 0 id, 1 name, 2 ascii, 3 alt, 4 lat, 5 lon, 6 fclass, 7 fcode, 8 cc, 9 cc2, 10 adm1, 11 adm2, 12 adm3, 13 adm4, 14 pop, 15 elev, 16 dem, 17 tz, 18 mod
  const cc = f[8];
  if (DACH.has(cc) || f[6] !== 'P' || f[7] === 'PPLX' || Number(f[14]) < MIN_POP) continue;
  const lat = Number(f[4]); const lon = Number(f[5]);
  if (!(lat >= BOX.south && lat <= BOX.north && lon >= BOX.west && lon <= BOX.east)) continue;
  const district = adm2.get(`${cc}.${f[10]}.${f[11]}`) ?? adm1.get(`${cc}.${f[10]}`) ?? null;
  if (f[18] > stamp) stamp = f[18];
  byCountry[cc] = (byCountry[cc] ?? 0) + 1;
  places.push([
    Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000,
    f[1].slice(0, 48), district ? idx(district.slice(0, 48)) : -1, cc, Number(f[14]),
  ]);
}

places.sort((a, b) => b[5] - a[5]);
const out = {
  source: 'GeoNames (https://www.geonames.org/) — CC BY 4.0',
  note: `Bewohnte Orte der Europa-Box (25° W–32° O, 34–72° N) ohne DE/AT/CH ab ${MIN_POP} Einwohnern mit Verwaltungseinheit (ADM2, sonst ADM1). Koordinaten auf 3 Nachkommastellen. Erzeugt von scripts/build-places-europe.mjs aus cities1000.`,
  stamp: stamp || null,
  minPop: MIN_POP,
  fields: ['lat', 'lon', 'name', 'districtIdx', 'cc', 'pop'],
  districts,
  places,
};
mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT, json);
console.log(`Länder: ${Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}`);
console.log(`→ ${OUT}: ${places.length} Orte, ${districts.length} Verwaltungseinheiten, ${(json.length / 1024).toFixed(0)} KB (unkomprimiert)`);
