/**
 * build-places-dach.mjs — statisches Ortsverzeichnis DACH für den Brandradar (Phase BP3).
 *
 *   node scripts/build-places-dach.mjs            # schreibt public/fire/places-dach.json
 *   node scripts/build-places-dach.mjs --min 2000 # andere Bevölkerungsschwelle
 *
 * Quelle: GeoNames-Länderdumps DE/AT/CH (https://download.geonames.org/export/dump/,
 * CC BY 4.0). Warum ein statischer Auszug und keine Web-API: Nominatim erlaubt
 * 1 Anfrage/s (Usage Policy), die GeoNames-Web-API braucht ein Konto mit
 * Tageslimit — beides ist nach den Auftrags-Constraints blockiert
 * (audit/brandflaechen-panel.md §2.8). Ein Auszug im Repo ist key- und limitfrei
 * und wird beim Öffnen des Panels einmal geladen.
 *
 * Inhalt: bewohnte Orte (Feature-Klasse P, ohne Stadtteile PPLX) ab `--min` Einwohnern mit dem Namen
 * ihrer Verwaltungseinheit — DE: Kreis/kreisfreie Stadt (ADM3), AT: politischer
 * Bezirk (ADM2), CH: Bezirk (ADM2, sonst Kanton ADM1). Koordinaten auf 3
 * Nachkommastellen (~100 m — reicht für „nächster Ort").
 *
 * Kein Zip-Modul: die Dumps sind Deflate-Zips mit genau zwei Einträgen; der
 * Local-File-Header wird von Hand gelesen und mit zlib.inflateRawSync entpackt.
 * Netzabhängig; schreibt NUR public/fire/places-dach.json.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'fire', 'places-dach.json');
const MIN_POP = Number((process.argv.find((a) => a.startsWith('--min=')) ?? '').split('=')[1] || (process.argv.includes('--min') ? process.argv[process.argv.indexOf('--min') + 1] : 1500));
const BASE = 'https://download.geonames.org/export/dump/';

/** Alle Einträge eines Zips über das Central Directory (nur STORE/DEFLATE, kein ZIP64). */
function unzip(buf) {
  const out = new Map();
  // End of Central Directory (Signatur 0x06054b50) von hinten suchen.
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
    // Local-File-Header: Namen-/Extra-Länge dort können abweichen.
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

/**
 * GeoNames führt in `name` für einige Großstädte das ENGLISCHE Exonym. Die UI ist
 * deutsch; die deutschen Namen stehen unetikettiert in den Alternativnamen und
 * lassen sich dort nicht sicher herausgreifen — deshalb eine kleine, geprüfte
 * Liste statt Raten. Alles andere bleibt, wie GeoNames es liefert.
 */
const GERMAN_NAME = {
  Vienna: 'Wien', Munich: 'München', Nuremberg: 'Nürnberg', Geneva: 'Genf', Lucerne: 'Luzern',
  Cologne: 'Köln', Hanover: 'Hannover', Brunswick: 'Braunschweig', Zurich: 'Zürich', Berne: 'Bern',
  Coblenz: 'Koblenz', Constance: 'Konstanz', Ratisbon: 'Regensburg', Basle: 'Basel',
  'Frankfurt (Oder)': 'Frankfurt (Oder)', 'Freiburg': 'Freiburg im Breisgau', 'Sankt Gallen': 'St. Gallen',
};

/** Welche Verwaltungsebene je Land „Kreis/Bezirk/Kanton" ist. */
const DISTRICT_LEVEL = { DE: 3, AT: 2, CH: 2 };

const places = [];
const districts = [];
const districtIdx = new Map();
const idx = (name) => {
  let i = districtIdx.get(name);
  if (i == null) { i = districts.length; districts.push(name); districtIdx.set(name, i); }
  return i;
};
let stamp = '';

for (const cc of ['DE', 'AT', 'CH']) {
  const zip = unzip(await fetchBuf(`${BASE}${cc}.zip`));
  const txt = zip.get(`${cc}.txt`);
  if (!txt) throw new Error(`${cc}.zip ohne ${cc}.txt`);
  const lines = txt.toString('utf8').split('\n');
  const admNames = new Map();   // "ADM3:code" → Name
  const rows = [];
  for (const line of lines) {
    if (!line) continue;
    const f = line.split('\t');
    // 0 id, 1 name, 2 ascii, 3 alt, 4 lat, 5 lon, 6 fclass, 7 fcode, 8 cc, 9 cc2, 10 adm1, 11 adm2, 12 adm3, 13 adm4, 14 pop, 15 elev, 16 dem, 17 tz, 18 mod
    if (f[6] === 'A' && /^ADM[123]$/.test(f[7])) {
      const lvl = Number(f[7][3]);
      const code = [f[10], f[11], f[12]].slice(0, lvl).join('.');
      admNames.set(`${lvl}:${code}`, f[1]);
      if (f[18] > stamp) stamp = f[18];
    } else if (f[6] === 'P' && /^PPL/.test(f[7]) && f[7] !== 'PPLX' && Number(f[14]) >= MIN_POP) {
      rows.push(f);
    }
  }
  for (const f of rows) {
    const lvl = DISTRICT_LEVEL[cc];
    let district = admNames.get(`${lvl}:${[f[10], f[11], f[12]].slice(0, lvl).join('.')}`) ?? null;
    // Rückfall eine Ebene höher (kreisfreie Städte in DE ohne ADM3, CH-Kantone ohne Bezirke).
    if (!district && lvl > 1) district = admNames.get(`${lvl - 1}:${[f[10], f[11], f[12]].slice(0, lvl - 1).join('.')}`) ?? null;
    if (!district) district = admNames.get(`1:${f[10]}`) ?? null;
    places.push([
      Math.round(Number(f[4]) * 1000) / 1000, Math.round(Number(f[5]) * 1000) / 1000,
      (GERMAN_NAME[f[1]] ?? f[1]).slice(0, 48), district ? idx(district.slice(0, 48)) : -1, cc, Number(f[14]),
    ]);
  }
  console.log(`${cc}: ${rows.length} Orte ≥ ${MIN_POP} Einwohner, ${admNames.size} Verwaltungseinheiten`);
}

places.sort((a, b) => b[5] - a[5]);
const out = {
  source: 'GeoNames (https://www.geonames.org/) — CC BY 4.0',
  note: `Bewohnte Orte DE/AT/CH ab ${MIN_POP} Einwohnern mit Kreis (DE, ADM3) / Bezirk (AT, ADM2) / Bezirk oder Kanton (CH). Koordinaten auf 3 Nachkommastellen; für einige Großstädte der deutsche statt des englischen GeoNames-Namens (feste Liste im Skript). Erzeugt von scripts/build-places-dach.mjs.`,
  stamp: stamp || null,
  minPop: MIN_POP,
  fields: ['lat', 'lon', 'name', 'districtIdx', 'cc', 'pop'],
  districts,
  places,
};
mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT, json);
console.log(`→ ${OUT}: ${places.length} Orte, ${districts.length} Verwaltungseinheiten, ${(json.length / 1024).toFixed(0)} KB (unkomprimiert)`);
