/**
 * TA1/TA2 — Standortliste `public/fire/ta/thermal-sites-v1.json` aus Persistenzzellen + Anlagenverzeichnis.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fire/ta/build-sites.mjs
 *        [--cells data/fire/ta/cells.jsonl] [--detail .cache/ta/cell-detail.jsonl]
 *        [--facilities .cache/facilities/facilities.jsonl] [--out public/fire/ta/thermal-sites-v1.json]
 *        [--join-m 1500]
 *
 * Schritte: (1) persistente Zellen zu Standorten verbinden (Union-Find, Zellmitten ≤ 1,5 km — das
 * umfasst die 8er-Nachbarschaft); (2) Statistik je Standort aus den Zell-Detailwerten (Tage = Vereinigung,
 * FRP-Quantile über alle Detektionen, Nachtanteil gewichtet); (3) Geodaten-Join: beste Anlage im Umkreis
 * `--join-m` um irgendeine Standortzelle, Rang = Gewicht (thermisch vor sonstig) minus Abstandsanteil;
 * (4) Klasse: C wenn Nachtanteil < 5 % und keine thermische Anlage ≤ 500 m, sonst A (Treffer) / B (keiner);
 * (5) CORINE-Flag (PNG aus dem Repo, Filter 0), Ortsname (GeoNames-Verzeichnis), Land (Umrisse).
 *
 * Der Report listet zusätzlich die AF4-Labelpaare (Brände mit EFFIS-Kartierung), deren Schwerpunkt in
 * ≤ 1,5 km zu einem Standort liegt — die Fälle, die der Laufzeit-Signaturvergleich als Brand halten MUSS.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { inflateSync } from 'node:zlib';
import { cellKey, cellCenter, TA_STEP, TA_BBOX, THERMAL_SITES_VERSION } from '../../../src/fire/anomaly/thermalSites.ts';
import { buildPlaceIndex, nearestPlace } from '../../../src/fire/footprint/places.ts';
import { pointInRings } from '../../../src/countryMask.ts';
import { CLC_ATTRIBUTION } from '../../../src/fire/clcMask.ts';

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CELLS = argVal('--cells', 'data/fire/ta/cells.jsonl');
const DETAIL = argVal('--detail', '.cache/ta/cell-detail.jsonl');
const FAC = argVal('--facilities', '.cache/facilities/facilities.jsonl');
const OUT = argVal('--out', 'public/fire/ta/thermal-sites-v1.json');
const REPORT = argVal('--report', 'data/fire/ta/sites.report.json');
const JOIN_M = Number(argVal('--join-m', '1500'));
const PAIRS = ['data/fire/af/pairs-effis-2020-2025.jsonl', 'data/fire/af/pairs-effis-2026.jsonl'];

const readJsonl = (p) => existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const metres = (a, b) => Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180));
const quantile = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };

const cells = readJsonl(CELLS);
const detail = new Map(readJsonl(DETAIL).map((d) => [d.key, d]));
const facilities = readJsonl(FAC);
const cellsReport = existsSync(CELLS.replace(/\.jsonl$/, '.report.json')) ? JSON.parse(readFileSync(CELLS.replace(/\.jsonl$/, '.report.json'), 'utf8')) : null;
if (!cells.length) { console.error('keine Zellen — erst persistence-grid.mjs'); process.exit(2); }

// ---------------------------------------------------------------------------
// (1) Zellen → Standorte
// ---------------------------------------------------------------------------
const parent = cells.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
  if (metres(cellCenter(cells[i].key), cellCenter(cells[j].key)) <= JOIN_M) parent[find(i)] = find(j);
}
const groups = new Map();
cells.forEach((c, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)).push(c); });

// ---------------------------------------------------------------------------
// (5) Hilfsdaten: CORINE-PNG, Orte, Länder
// ---------------------------------------------------------------------------
function decodeGrayPng(buf) {
  let pos = 8; let w = 0, h = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8); const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 0) throw new Error('PNG: erwartet 8-bit Graustufe'); }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    const ft = raw[r * (w + 1)]; const row = raw.subarray(r * (w + 1) + 1, (r + 1) * (w + 1));
    for (let c = 0; c < w; c++) {
      const a = c > 0 ? out[r * w + c - 1] : 0, b = r > 0 ? out[(r - 1) * w + c] : 0, cc = r > 0 && c > 0 ? out[(r - 1) * w + c - 1] : 0;
      let v = row[c];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - cc; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : cc; }
      out[r * w + c] = v & 0xff;
    }
  }
  return { w, h, data: out };
}
const clc = existsSync('public/fire/clc-industry-mask.png') ? decodeGrayPng(readFileSync('public/fire/clc-industry-mask.png')) : null;
function landcoverOfKey(key) {
  if (!clc) return null;
  const [r0, c0] = key.split(',').map(Number);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = r0 + dr, c = c0 + dc; if (r < 0 || r >= clc.h || c < 0 || c >= clc.w) continue;
    if (clc.data[r * clc.w + c] > 127) return 'industrial';
  }
  return 'other';
}
const places = existsSync('public/fire/places-dach.json') ? buildPlaceIndex(JSON.parse(readFileSync('public/fire/places-dach.json', 'utf8'))) : null;
const countryRings = {};
for (const c of ['DE', 'AT', 'CH']) {
  const p = `public/countries/${c}.geojson`; if (!existsSync(p)) continue;
  const feat = JSON.parse(readFileSync(p, 'utf8')); const g = feat.geometry ?? feat.features?.[0]?.geometry; if (!g) continue;
  countryRings[c] = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
}
const countryOf = (lat, lon) => { for (const [c, rings] of Object.entries(countryRings)) if (pointInRings(rings, lon, lat)) return c; return Object.keys(countryRings).length ? 'outside' : null; };

// ---------------------------------------------------------------------------
// (2)–(4) Standorte
// ---------------------------------------------------------------------------
const THERMAL = new Set(['steel', 'refinery', 'cement', 'glass', 'waste', 'power', 'chemical', 'pulp', 'metals', 'biomass']);
const sites = [];
for (const g of groups.values()) {
  const det = g.reduce((s, c) => s + c.det, 0);
  const lat = g.reduce((s, c) => s + c.lat * c.det, 0) / det, lon = g.reduce((s, c) => s + c.lon * c.det, 0) / det;
  const anchor = [...g].sort((a, b) => b.det - a.det || a.key.localeCompare(b.key))[0];
  const days = new Set(); const frp = []; let night = 0, t2 = 0; const years = {};
  for (const c of g) {
    const d = detail.get(c.key);
    if (d) { for (const x of d.days) days.add(x); frp.push(...d.frp); night += d.night; t2 += d.t2; }
    else { night += c.nightShare * c.det; t2 += c.type2Share * c.det; }
  }
  for (const x of days) years[x.slice(0, 4)] = (years[x.slice(0, 4)] ?? 0) + 1;
  if (!days.size) for (const c of g) for (const [y, n] of Object.entries(c.years)) years[y] = Math.max(years[y] ?? 0, n);
  const centers = g.map((c) => cellCenter(c.key));
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const c of g) { const [r, col] = c.key.split(',').map(Number); const w = TA_BBOX.west + col * TA_STEP, n = TA_BBOX.north - r * TA_STEP; west = Math.min(west, w); east = Math.max(east, w + TA_STEP); north = Math.max(north, n); south = Math.min(south, n - TA_STEP); }
  // Join
  // Join: Rang = Gewicht (thermisch vor sonstig) + Größenbonus (Hauptwerk vor Nebeneinheit) − Abstandsanteil.
  const cands = [];
  for (const f of facilities) {
    if (Math.abs(f.lat - lat) > 0.06 || Math.abs(f.lon - lon) > 0.09) continue;
    let dmin = Infinity; for (const cc of centers) dmin = Math.min(dmin, metres(cc, f));
    if (dmin <= 2 * JOIN_M) cands.push({ f, d: dmin, score: f.weight + 0.06 * Math.min(f.size ?? 0, 10) - 0.5 * (dmin / JOIN_M) + (f.name ? 0.05 : 0) });
  }
  cands.sort((a, b) => b.score - a.score || a.d - b.d);
  const toFacility = (c) => c ? { name: c.f.name ?? `${c.f.kind} (${c.f.source})`, operator: c.f.operator ?? null, kind: c.f.kind, detail: c.f.detail ?? null, source: c.f.source, id: c.f.id, distanceM: Math.round(c.d), lat: c.f.lat, lon: c.f.lon } : null;
  const within = cands.filter((c) => c.d <= JOIN_M);
  const nightShare = det ? night / det : 0;
  const thermalNear = within.some((c) => THERMAL.has(c.f.kind) && c.d <= 500);
  const cls = nightShare < 0.05 && !thermalNear ? 'C' : within.length ? 'A' : 'B';
  // C: keine Zuordnung (ein Tagessignal ist keine Anlagenwärme; die Schweinemast nebenan wäre eine Falschaussage).
  // B: kein Treffer ≤ 1,5 km — als Hinweis die nächste thermische Anlage bis 3 km in `facilityAlt`.
  const best = cls === 'A' ? within[0] : null;
  const alt = cls === 'A'
    ? (within.find((c) => c.f.id !== best.f.id && (c.f.source !== best.f.source || THERMAL.has(c.f.kind))) ?? null)
    : cls === 'B' ? (cands.find((c) => THERMAL.has(c.f.kind)) ?? null) : null;
  const landcover = g.some((c) => landcoverOfKey(c.key) === 'industrial') ? 'industrial' : clc ? 'other' : null;
  const place = places ? nearestPlace(places, lat, lon) : null;
  const note = cls === 'C' ? 'Nur Tagdetektionen über mehrere Jahre — Reflexion (PV, Glas, Gewächshaus) ist wahrscheinlicher als eine Wärmequelle; keine Anlage zugeordnet.'
    : cls === 'B' ? `Mehrjährig wiederkehrendes Signal ohne Anlagentreffer ≤ ${JOIN_M} m im Verzeichnis (E-PRTR/MaStR/BFE) — eigene Einordnung, kein Nachweis.${alt ? ` Nächste bekannte Anlage: ${alt.f.name ?? alt.f.kind} in ${(alt.d / 1000).toFixed(1)} km.` : ''}`
    : null;
  sites.push({
    id: `ta:${anchor.key}`, lat: +lat.toFixed(5), lon: +lon.toFixed(5), cells: g.map((c) => c.key).sort(),
    bbox: [+west.toFixed(3), +south.toFixed(3), +east.toFixed(3), +north.toFixed(3)], cls,
    stats: { detections: det, distinctDays: days.size || Math.max(...g.map((c) => c.days)), years, nightShare: +nightShare.toFixed(3), nasaType2Share: +(t2 / det).toFixed(3), frp: { p50: quantile(frp, 0.5), p95: quantile(frp, 0.95), max: frp.length ? Math.max(...frp) : null }, lastMs: Math.max(...g.map((c) => c.lastMs)) },
    facility: toFacility(best), facilityAlt: toFacility(alt), landcover, place: place ? place.name : null, country: countryOf(lat, lon), note,
  });
}
sites.sort((a, b) => b.stats.detections - a.stats.detections);

// ---------------------------------------------------------------------------
// Report: Klassen, Typen, FN-Kandidaten aus den AF4-Paaren
// ---------------------------------------------------------------------------
const pairs = PAIRS.flatMap(readJsonl);
const nearPairs = [];
for (const p of pairs) {
  const f = p.features; if (!f) continue;
  for (const s of sites) if (metres({ lat: f.lat, lon: f.lon }, s) <= JOIN_M) { nearPairs.push({ pairId: f.id, effisId: f.effisId, effisMappedHa: f.effisMappedHa, lat: f.lat, lon: f.lon, site: s.id, siteName: s.facility?.name ?? s.place, cls: s.cls, distanceM: Math.round(metres({ lat: f.lat, lon: f.lon }, s)) }); break; }
}
const count = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const report = {
  built: new Date().toISOString().slice(0, 10), cells: cells.length, sites: sites.length, joinM: JOIN_M,
  byClass: count(sites, (s) => s.cls), byKind: count(sites.filter((s) => s.facility), (s) => s.facility.kind), bySource: count(sites.filter((s) => s.facility), (s) => s.facility.source),
  byCountry: count(sites, (s) => s.country ?? 'null'), withOperator: sites.filter((s) => s.facility?.operator).length,
  landcoverIndustrial: sites.filter((s) => s.landcover === 'industrial').length,
  pairsTotal: pairs.length, pairsNearSite: nearPairs.length, nearPairs,
  top30: sites.slice(0, 30).map((s) => ({ id: s.id, cls: s.cls, name: s.facility?.name ?? null, kind: s.facility?.kind ?? null, place: s.place, country: s.country, det: s.stats.detections, days: s.stats.distinctDays, night: s.stats.nightShare, dist: s.facility?.distanceM ?? null })),
  classC: sites.filter((s) => s.cls === 'C').slice(0, 40).map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, place: s.place, country: s.country, det: s.stats.detections, days: s.stats.distinctDays })),
  classB: sites.filter((s) => s.cls === 'B').map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, place: s.place, country: s.country, det: s.stats.detections, days: s.stats.distinctDays, night: s.stats.nightShare, landcover: s.landcover })),
};
const file = {
  version: THERMAL_SITES_VERSION, built: report.built,
  archive: { from: cellsReport?.archive?.from ?? null, to: cellsReport?.archive?.to ?? null, months: '1-12', sources: ['VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP'] },
  rule: { yearsMin: cellsReport?.rule?.yearsMin ?? 2, daysPerYearMin: cellsReport?.rule?.daysMin ?? 5, joinRadiusM: JOIN_M },
  attributions: [
    'Detektionen: NASA FIRMS (VIIRS Standard Processing, Archiv 2020–2026) — Persistenzzählung und Klassen sind eigene Ableitung',
    'Anlagen: © European Environment Agency, Industrial Reporting (E-PRTR/IED) v16, CC-BY 4.0',
    'Anlagen: Datenbasis Marktstammdatenregister der Bundesnetzagentur, DL-DE/BY-2.0, Stand 2026-07-07',
    'Anlagen: Bundesamt für Energie (BFE), Elektrizitätsproduktionsanlagen, opendata.swiss OPEN BY',
    CLC_ATTRIBUTION,
    'Ortsnamen: GeoNames (CC BY 4.0)',
  ],
  sites,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(file) + '\n');
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`Standorte ${sites.length} aus ${cells.length} Zellen · Klassen ${JSON.stringify(report.byClass)} · Typen ${JSON.stringify(report.byKind)} · Quellen ${JSON.stringify(report.bySource)} · Länder ${JSON.stringify(report.byCountry)}`);
console.log(`AF4-Paare ≤ ${JOIN_M} m an einem Standort: ${nearPairs.length} von ${pairs.length} (Liste im Report)`);
console.log(`geschrieben: ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(1)} KB)`);
