/**
 * mosmix.mjs — MOSMIX-L lesen (PD-B9, `audit/punktdaten-versorgung.md` §44).
 *
 * MOSMIX ist die **achte Zugriffsfamilie**: kein GRIB, kein netCDF, kein REST —
 * ein KMZ (Zip) mit einer KML-Datei darin, in der jede Station ein `Placemark` ist
 * und jede Größe eine leerzeichengetrennte Wertereihe über eine gemeinsame Zeitachse.
 *
 * ── Warum gestromt und nicht gelesen wird ───────────────────────────────────
 * `MOSMIX_L/all_stations/kml/MOSMIX_L_LATEST.kmz` ist 76 MiB gepackt und
 * **1 750 MiB entpackt** (gemessen 2026-09-11). Das ist nicht nur groß, es ist
 * unmöglich: V8 kann keinen String dieser Länge halten. Ein `inflateRawSync` mit
 * `.toString()` wirft, und zwar erst nach 34 Sekunden Arbeit.
 *
 * Deshalb: `createInflateRaw()` als Strom, ein Rest-Puffer, und je vollständigem
 * `</kml:Placemark>` wird ausgewertet und weggeworfen. Gemessen bleibt der
 * Rest-Puffer unter **0,3 MiB** und der Heap unter **40 MiB** — bei 1 750 MiB
 * Durchsatz. Das ist dieselbe Lehre wie §43.11, nur diesmal vorher angewandt.
 *
 * ── Warum das Central Directory gelesen wird und nicht der Local Header ─────
 * ⚠ DWD schreibt das Zip als **Strom mit Data-Descriptor**: im lokalen Dateikopf
 * stehen `compressedSize` und `uncompressedSize` auf **0**, die echten Größen stehen
 * erst im Central Directory am Dateiende. Der vorhandene `unzip()` in
 * `build-places-dach.mjs` liest nur den lokalen Kopf — an MOSMIX scheitert er mit
 * `Z_BUF_ERROR`, gemessen. Wer hier eine bestehende Zip-Hilfe wiederverwendet, ohne
 * sie an DIESER Datei zu messen, bekommt einen Fehler, der nach Datenkorruption
 * aussieht und keine ist.
 *
 * ── Die Koordinatenfalle, die keine Zählung gefunden hätte ──────────────────
 * ⚠ Der DWD-Stationskatalog (`mosmix_stationskatalog.cfg`) führt Lat/Lon als
 * **Grad + Dezimalminuten**, nicht als Dezimalgrad: Wien/Hohe Warte steht dort als
 * `48.15 / 16.22` und liegt in Wahrheit bei `48.2489 / 16.3564`. Die Dezimalgrad-
 * Lesart verschiebt jede Station um bis zu ~20 km — und **die Stationszahl im
 * Ausschnitt hätte das nicht gezeigt** (3 049 gegen 3 055, beides plausibel).
 *
 * Dieses Modul liest den Katalog deshalb **gar nicht**. Die Koordinaten kommen aus
 * `<kml:coordinates>` der Datei selbst, und die sind echte Dezimalgrad (an
 * München, Zürich und Wien gegen die bekannten Lagen geprüft). Eine Quelle, die
 * ihre eigenen Koordinaten mitbringt, braucht keinen zweiten Katalog.
 */

import zlib from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';

/** Fehlwert-Marker von MOSMIX. Am echten Datum das EINZIGE nicht-numerische Token. */
export const MOSMIX_UNDEF = '-';

/**
 * Die MOSMIX-Größen, die eine Cube-Größe tragen können.
 *
 * Der Katalog führt **114** Parameter; hier stehen die zehn, aus denen sich die
 * Cube-Größen ohne Annahme ergeben. Alles andere ist bewusst weggelassen, nicht
 * vergessen — die Begründung je Größe steht in `MOSMIX_NOT_MAPPED`.
 */
export const MOSMIX_PARAMS = Object.freeze([
  'TTT',   // Temperatur 2 m, K
  'Td',    // Taupunkt 2 m, K
  'DD',    // Windrichtung, Grad (met. Konvention: WOHER)
  'FF',    // Windgeschwindigkeit 10 m, m/s
  'FX1',   // Maximale Bö der letzten Stunde, m/s
  'N',     // Gesamtbedeckung, %
  'Nl',    // tiefe Bewölkung, %
  'Nm',    // mittlere Bewölkung, %
  'Nh',    // hohe Bewölkung, %
  'RR1c',  // Gesamtniederschlag letzte Stunde, kg/m² = mm
]);

/**
 * Cube-Größen, die MOSMIX NICHT trägt — mit dem Grund, nicht als Lücke.
 *
 * ⚠ `ps`: MOSMIX führt `PPPP`, und das ist **auf Meeresniveau reduziert**. Am
 * echten Datum belegt, ohne der Doku zu glauben: München (515 m) 1 019,3 hPa gegen
 * Schleswig (47 m) 1 017,5 hPa — 470 m Höhenunterschied für 1,8 hPa; und die
 * Zugspitze (2 960 m) führt **gar keinen Wert**. Ein Stationsdruck stünde dort bei
 * ~700 hPa. Derselbe Fall wie C-LAEF (§37): lieber MISSING als 1 013 auf dem Gipfel.
 */
export const MOSMIX_NOT_MAPPED = Object.freeze({
  ps: 'PPPP ist auf Meeresniveau reduziert (an Muenchen/Schleswig/Zugspitze gemessen), nicht der Stationsdruck.',
  snowlmt: 'MOSMIX fuehrt keine Schneefallgrenze (114 Parameter am echten Datum ausgezaehlt).',
  gammaEff: 'Eine Station ist ein Punkt, kein Profil — es gibt keine Level, aus denen ein Gradient folgte.',
  zBase: 'wie gammaEff.', zInv: 'wie gammaEff.', dTInv: 'wie gammaEff.',
  // PD-C4: die Metaebene, deren Abwesenheit bis hier nur in Prosa stand (§44). `srcCount`
  // steht dagegen auf 1 und gehoert NICHT hierher — eine Quelle ist eine Aussage, keine Luecke.
  ensCount: 'MOSMIX-L ist ein statistisches Produkt ohne Member. MISSING statt 0 — 0 hiesse „gemessen und null".',
});

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------

/**
 * Die Einträge eines Zip über das **Central Directory**. Siehe Kopf: der lokale
 * Dateikopf trägt bei MOSMIX Nullen.
 *
 * Gibt je Eintrag den ROHEN (noch gepackten) Bereich zurück — entpackt wird
 * getrennt, damit der Aufrufer strömen kann, statt 1 750 MiB anzufordern.
 */
export function zipEntries(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error('MOSMIX: kein End-of-Central-Directory — ist das wirklich ein Zip?');
  const n = buf.readUInt16LE(e + 10);
  let off = buf.readUInt32LE(e + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('MOSMIX: Central-Directory-Eintrag erwartet');
    const method = buf.readUInt16LE(off + 10);
    const csz = buf.readUInt32LE(off + 20);
    const usz = buf.readUInt32LE(off + 24);
    const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nl).toString('utf8');
    const lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnl + lel;
    out.push({ name, method, csz, usz, raw: buf.subarray(start, start + csz) });
    off += 46 + nl + el + cl;
  }
  return out;
}

// ---------------------------------------------------------------------------
// KML
// ---------------------------------------------------------------------------

const reTimeStep = /<dwd:TimeStep>([^<]+)</g;
const reIssue = /<dwd:IssueTime>([^<]+)</;
const reName = /<kml:name>([^<]+)/;
const reDesc = /<kml:description>([^<]*)/;
const reCoord = /<kml:coordinates>([^<]+)/;
const reForecast = /<dwd:Forecast[^>]*elementName="([^"]+)"[^>]*>([\s\S]*?)<\/dwd:Forecast>/g;

/** Kopf der Datei: Laufzeit und Zeitachse. Beides gilt für ALLE Stationen. */
export function parseHeader(text) {
  const it = reIssue.exec(text);
  const issueMs = it ? Date.parse(it[1]) : NaN;
  const steps = [];
  reTimeStep.lastIndex = 0;
  for (let m; (m = reTimeStep.exec(text));) steps.push(Date.parse(m[1]));
  return { issueMs, steps };
}

/**
 * Ein `Placemark` → Stationsdatensatz, oder `null`, wenn `keep()` ihn ablehnt.
 *
 * `keep(lat, lon)` wird VOR dem Zerlegen der Wertereihen gefragt. Das ist kein
 * Mikro-Sparen: von 5 648 Stationen liegen 3 071 im Ausschnitt, und jede trägt
 * 114 Reihen à 247 Werte.
 */
export function parsePlacemark(pm, keep) {
  const id = (reName.exec(pm) || [])[1];
  const coord = (reCoord.exec(pm) || [])[1];
  if (!id || !coord) return null;
  const [lon, lat, elev] = coord.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (keep && !keep(lat, lon)) return null;
  const name = ((reDesc.exec(pm) || [])[1] || '').trim();
  const values = Object.create(null);
  reForecast.lastIndex = 0;
  for (let m; (m = reForecast.exec(pm));) {
    if (!MOSMIX_PARAMS.includes(m[1])) continue;
    values[m[1]] = m[2].replace(/<[^>]+>/g, ' ').trim().split(/\s+/)
      .map((t) => (t === MOSMIX_UNDEF ? NaN : Number(t)));
  }
  return { id, name, lat, lon, elev: Number.isFinite(elev) ? elev : null, values };
}

/**
 * Ein MOSMIX-KMZ strömend auswerten.
 *
 * `onStation` wird je behaltener Station EINMAL gerufen und darf den Datensatz
 * behalten; der Rest-Text wird sofort verworfen. Rückgabe: Kopf + Anzahl.
 */
export async function readMosmixKmz(kmz, { keep, onStation } = {}) {
  const entries = zipEntries(kmz);
  const kml = entries.find((e) => e.name.endsWith('.kml'));
  if (!kml) throw new Error(`MOSMIX: keine .kml im Archiv (${entries.map((e) => e.name).join(', ')})`);
  if (kml.method !== 8 && kml.method !== 0) throw new Error(`MOSMIX: unbekannte Kompression ${kml.method}`);

  let header = null, carry = '', kept = 0, seen = 0, maxCarry = 0;
  const feed = (chunk) => {
    carry += chunk;
    if (!header) {
      const i = carry.indexOf('<kml:Placemark>');
      if (i >= 0) { header = parseHeader(carry.slice(0, i)); carry = carry.slice(i); }
    }
    let i;
    while ((i = carry.indexOf('</kml:Placemark>')) >= 0) {
      const pm = carry.slice(0, i);
      carry = carry.slice(i + 16);
      seen++;
      const st = parsePlacemark(pm, keep);
      if (st) { kept++; onStation?.(st); }
    }
    if (carry.length > maxCarry) maxCarry = carry.length;
  };

  if (kml.method === 0) {
    feed(Buffer.from(kml.raw).toString('utf8'));
  } else {
    await new Promise((res, rej) => {
      const inf = zlib.createInflateRaw();
      // `setEncoding` ist hier falsch: ein Mehrbyte-Zeichen darf nicht an der
      // Blockgrenze zerfallen. Ein StringDecoder haelt den Rest zusammen.
      const dec = new StringDecoder('utf8');
      inf.on('data', (c) => feed(dec.write(c)));
      inf.on('end', () => { feed(dec.end()); res(); });
      inf.on('error', rej);
      inf.end(kml.raw);
    });
  }
  if (!header || !Number.isFinite(header.issueMs) || !header.steps.length) {
    throw new Error('MOSMIX: Kopf ohne IssueTime oder ohne TimeStep');
  }
  return { ...header, seen, kept, maxCarry };
}

// ---------------------------------------------------------------------------
// Zuordnung auf die Cube-Größen
// ---------------------------------------------------------------------------

const KELVIN = 273.15;
const DEG = Math.PI / 180;

/**
 * Eine Station, ein Zeitindex → Cube-Größen in Cube-Einheiten.
 *
 * ⚠ **Die Bö-Bedingung ist nicht geschenkt.** PAP 6 verlangt
 * `v_max := max(v_max, |v10|)`; am echten Lauf ist das in **97 Fällen** verletzt
 * (FX1 kleiner als FF). Das ist kein Lesefehler — die MOS-Regression rechnet Mittel
 * und Bö getrennt. Ohne die Klammer stünde eine Bö unter dem Wind im Cube, und die
 * PAP-6-Konsistenzprüfung würde für jeden Nutzer fehlschlagen.
 */
export function mosmixToCube(values, i) {
  const g = (p) => { const a = values[p]; const v = a ? a[i] : NaN; return Number.isFinite(v) ? v : NaN; };
  const out = Object.create(null);
  const t = g('TTT'); if (Number.isFinite(t)) out.t2m = t - KELVIN;
  const td = g('Td'); if (Number.isFinite(td)) out.td2m = td - KELVIN;
  const dd = g('DD'), ff = g('FF');
  let speed = NaN;
  if (Number.isFinite(dd) && Number.isFinite(ff)) {
    // Meteorologische Konvention: DD ist die Richtung, aus der es weht.
    out.u10 = -ff * Math.sin(dd * DEG);
    out.v10 = -ff * Math.cos(dd * DEG);
    speed = ff;
  }
  const fx = g('FX1');
  if (Number.isFinite(fx)) out.gust = Number.isFinite(speed) ? Math.max(fx, Math.abs(speed)) : fx;
  const rr = g('RR1c'); if (Number.isFinite(rr)) out.precip = Math.max(0, rr);
  const n = g('N'); if (Number.isFinite(n)) out.clct = n;
  const nl = g('Nl'); if (Number.isFinite(nl)) out.clcl = nl;
  const nm = g('Nm'); if (Number.isFinite(nm)) out.clcm = nm;
  const nh = g('Nh'); if (Number.isFinite(nh)) out.clch = nh;
  return out;
}

// ---------------------------------------------------------------------------
// Selbsttest (netzfrei)
// ---------------------------------------------------------------------------

/**
 * Baut ein Zip **mit Data-Descriptor** — also genau die Form, an der ein Leser
 * scheitert, der nur den lokalen Kopf liest. Ohne diese Negativ-Kontrolle würde der
 * Selbsttest die eigentliche Falle nicht abdecken.
 */
function zipWithDataDescriptor(name, content) {
  const data = zlib.deflateRawSync(Buffer.from(content, 'utf8'));
  const nm = Buffer.from(name, 'utf8');
  const crc = zlib.crc32 ? zlib.crc32(Buffer.from(content, 'utf8')) : 0;
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0x0008, 6);          // Bit 3: Größen stehen im Data-Descriptor
  lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(0, 14); lh.writeUInt32LE(0, 18); lh.writeUInt32LE(0, 22); // alles 0
  lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(0, 28);
  const dd = Buffer.alloc(16);
  dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc, 4);
  dd.writeUInt32LE(data.length, 8); dd.writeUInt32LE(Buffer.byteLength(content, 'utf8'), 12);
  const lho = 0;
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0008, 8); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(Buffer.byteLength(content, 'utf8'), 24);
  cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(lho, 42);
  const cdStart = 30 + nm.length + data.length + 16;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + nm.length, 12); eocd.writeUInt32LE(cdStart, 16);
  return Buffer.concat([lh, nm, data, dd, cd, nm, eocd]);
}

const SAMPLE_KML = `<?xml version="1.0"?><kml:kml xmlns:kml="k" xmlns:dwd="d"><dwd:ProductDefinition>
<dwd:IssueTime>2026-09-11T03:00:00.000Z</dwd:IssueTime><dwd:ForecastTimeSteps>
<dwd:TimeStep>2026-09-11T04:00:00.000Z</dwd:TimeStep>
<dwd:TimeStep>2026-09-11T05:00:00.000Z</dwd:TimeStep>
<dwd:TimeStep>2026-09-11T06:00:00.000Z</dwd:TimeStep>
</dwd:ForecastTimeSteps></dwd:ProductDefinition>
<kml:Placemark><kml:name>10865</kml:name><kml:description>MUENCHEN STADT</kml:description>
<kml:Point><kml:coordinates>11.53,48.17,515.0</kml:coordinates></kml:Point>
<kml:ExtendedData>
<dwd:Forecast dwd:elementName="TTT"><dwd:value>285.95 286.15 -</dwd:value></dwd:Forecast>
<dwd:Forecast dwd:elementName="Td"><dwd:value>281.05 281.35 281.65</dwd:value></dwd:Forecast>
<dwd:Forecast dwd:elementName="DD"><dwd:value>270.00 90.00 180.00</dwd:value></dwd:Forecast>
<dwd:Forecast dwd:elementName="FF"><dwd:value>10.00 4.00 3.00</dwd:value></dwd:Forecast>
<dwd:Forecast dwd:elementName="FX1"><dwd:value>2.00 9.00 -</dwd:value></dwd:Forecast>
<dwd:Forecast dwd:elementName="N"><dwd:value>96.00 92.00 95.00</dwd:value></dwd:Forecast>
<dwd:Forecast dwd:elementName="RR1c"><dwd:value>0.00 1.20 -</dwd:value></dwd:Forecast>
<dwd:Forecast dwd:elementName="PPPP"><dwd:value>101930.00 101990.00 102010.00</dwd:value></dwd:Forecast>
</kml:ExtendedData></kml:Placemark>
<kml:Placemark><kml:name>99999</kml:name><kml:description>WEIT WEG</kml:description>
<kml:Point><kml:coordinates>-40.00,10.00,3.0</kml:coordinates></kml:Point>
<kml:ExtendedData>
<dwd:Forecast dwd:elementName="TTT"><dwd:value>300.00 300.00 300.00</dwd:value></dwd:Forecast>
</kml:ExtendedData></kml:Placemark>
</kml:kml>`;

export async function mosmixSelfTest() {
  const res = [];
  const ok = (name, cond, info = '') => res.push({ name, ok: !!cond, info });

  const kmz = zipWithDataDescriptor('MOSMIX_L_2026091103.kml', SAMPLE_KML);
  ok('Zip mit Data-Descriptor: lokaler Kopf traegt Nullen',
    kmz.readUInt32LE(18) === 0 && kmz.readUInt32LE(22) === 0,
    'genau die Form, an der ein Local-Header-Leser scheitert');
  const ent = zipEntries(kmz);
  ok('Central Directory liefert die echten Groessen',
    ent.length === 1 && ent[0].usz === Buffer.byteLength(SAMPLE_KML, 'utf8'),
    `usz=${ent[0]?.usz}`);

  const got = [];
  const head = await readMosmixKmz(kmz, {
    keep: (lat, lon) => lat >= 45.5 && lat <= 55.5 && lon >= 5.5 && lon <= 17.5,
    onStation: (s) => got.push(s),
  });
  ok('Kopf: IssueTime und drei Zeitschritte',
    head.issueMs === Date.parse('2026-09-11T03:00:00.000Z') && head.steps.length === 3);
  ok('Ausschnitt filtert VOR dem Zerlegen', head.seen === 2 && head.kept === 1 && got.length === 1,
    `gesehen ${head.seen}, behalten ${head.kept}`);
  ok('Koordinaten sind Dezimalgrad aus der Datei',
    Math.abs(got[0].lat - 48.17) < 1e-6 && Math.abs(got[0].lon - 11.53) < 1e-6 && got[0].elev === 515,
    'nicht aus dem Katalog, der Grad+Dezimalminuten fuehrt');

  const v0 = mosmixToCube(got[0].values, 0);
  ok('Kelvin wird zu Grad Celsius', Math.abs(v0.t2m - 12.8) < 1e-6, `t2m=${v0.t2m?.toFixed(2)}`);
  ok('Taupunkt unter der Temperatur', v0.td2m < v0.t2m, `td=${v0.td2m?.toFixed(2)}`);
  ok('Westwind (DD=270) wird zu positivem u',
    Math.abs(v0.u10 - 10) < 1e-6 && Math.abs(v0.v10) < 1e-6, `u=${v0.u10?.toFixed(2)} v=${v0.v10?.toFixed(2)}`);
  ok('⚠ Boee unter dem Wind wird auf den Wind gehoben (PAP 6)',
    Math.abs(v0.gust - 10) < 1e-6, `FX1=2, FF=10 -> gust=${v0.gust}`);

  const v1 = mosmixToCube(got[0].values, 1);
  ok('Ostwind (DD=90) wird zu negativem u',
    Math.abs(v1.u10 + 4) < 1e-6 && Math.abs(v1.v10) < 1e-6, `u=${v1.u10?.toFixed(2)}`);
  ok('echte Boee bleibt stehen', Math.abs(v1.gust - 9) < 1e-6, `gust=${v1.gust}`);
  ok('Niederschlag wird uebernommen', Math.abs(v1.precip - 1.2) < 1e-6);

  const v2 = mosmixToCube(got[0].values, 2);
  ok('Fehlwert "-" wird MISSING, nicht 0',
    !('t2m' in v2) && !('gust' in v2) && !('precip' in v2),
    'ein gesetzter Wert in einer Ebene, die einen gemessenen verspricht, ist der teuerste Fehler');
  ok('Suedwind (DD=180) wird zu positivem v',
    Math.abs(v2.v10 - 3) < 1e-6 && Math.abs(v2.u10) < 1e-6, `v=${v2.v10?.toFixed(2)}`);

  ok('PPPP wird NICHT auf ps abgebildet',
    !('ps' in v0) && !('ps' in v1) && 'ps' in MOSMIX_NOT_MAPPED,
    MOSMIX_NOT_MAPPED.ps);
  ok('snowlmt und die Profilfelder sind benannt abwesend',
    ['snowlmt', 'gammaEff', 'zBase', 'zInv', 'dTInv'].every((k) => k in MOSMIX_NOT_MAPPED));

  // Negativ-Kontrolle: ein Archiv ohne KML muss LAUT scheitern.
  let loud = false;
  try { await readMosmixKmz(zipWithDataDescriptor('egal.txt', 'kein kml')); }
  catch (e) { loud = /keine \.kml/.test(String(e.message)); }
  ok('Archiv ohne KML scheitert laut', loud);

  return res;
}
