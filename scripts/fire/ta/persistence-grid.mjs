/**
 * TA1 — Persistenzraster aus dem FIRMS-SP-Archiv (netzfrei, liest den AF4/TA1-Cache).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fire/ta/persistence-grid.mjs
 *        [--cache .cache/firms-archive] [--out data/fire/ta/cells.jsonl] [--years-min 2] [--days-min 5]
 *
 * Je 0,01°-Zelle (EINE Zellkonvention: `cellKey` aus `src/fire/anomaly/thermalSites.ts`):
 * Detektionen, verschiedene Tage je Kalenderjahr, Nachtanteil, NASA-`type`-Verteilung,
 * FRP-Quantile, letzte Detektion. **Persistent** = in ≥ `yearsMin` Kalenderjahren je ≥ `daysMin`
 * verschiedene Detektionstage. **EFFIS-Veto:** liegt die Zelle in dem Jahr in einer
 * RDA-Kartierung (Zellmitte im Polygon oder Polygonpunkt in der Zelle), zählt das Jahr nicht —
 * sonst würde eine wiederholt brennende Fläche (Moor, Munition) irgendwann zur „Anlage".
 *
 * Ausgabe: `cells.jsonl` (nur persistente Zellen) + `cells.report.json` (Zählstände,
 * Sensitivität 2/3 Jahre × 5/10 Tage, Top-50, Tagessignal-Anteil, Gegenproben).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cellKey, cellCenter, TA_STEP, TA_BBOX } from '../../../src/fire/anomaly/thermalSites.ts';
import { parseBurntFeature } from '../../../src/fire/fireCorroboration.ts';

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CACHE = argVal('--cache', '.cache/firms-archive');
const OUT = argVal('--out', 'data/fire/ta/cells.jsonl');
const YEARS_MIN = Number(argVal('--years-min', '2'));
const DAYS_MIN = Number(argVal('--days-min', '5'));

// ---------------------------------------------------------------------------
// 1. Archiv einlesen — nur die Spalten, die das Raster braucht (Header-basiert)
// ---------------------------------------------------------------------------
const files = readdirSync(CACHE).filter((f) => /^VIIRS_(SNPP|NOAA20|NOAA21)_SP-\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
if (files.length === 0) { console.error(`keine SP-Chunks in ${CACHE}`); process.exit(2); }

/** @type {Map<string, {det:number, night:number, t2:number, t0:number, frp:number[], years:Map<string,Set<string>>, lastMs:number, first:string, last:string, latSum:number, lonSum:number}>} */
const cells = new Map();
let rows = 0, skippedNoHeader = 0, outsideBox = 0;
const seenDays = new Set();
const months = new Set();
for (const f of files) {
  const text = readFileSync(join(CACHE, f), 'utf8');
  if (!/^\s*latitude/i.test(text)) { skippedNoHeader++; continue; }
  const lines = text.split(/\r?\n/);
  const h = lines[0].split(',').map((s) => s.trim().toLowerCase());
  const iLat = h.indexOf('latitude'), iLon = h.indexOf('longitude'), iDate = h.indexOf('acq_date'), iTime = h.indexOf('acq_time');
  const iFrp = h.indexOf('frp'), iDn = h.indexOf('daynight'), iType = h.indexOf('type');
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l) continue;
    const v = l.split(',');
    const lat = Number(v[iLat]), lon = Number(v[iLon]);
    const k = cellKey(lat, lon);
    if (!k) { outsideBox++; continue; }
    rows++;
    const date = v[iDate]; const year = date.slice(0, 4);
    seenDays.add(date); months.add(date.slice(0, 7));
    const hhmm = String(v[iTime] ?? '0').padStart(4, '0');
    const ms = Date.parse(`${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
    let c = cells.get(k);
    if (!c) { c = { det: 0, night: 0, t2: 0, t0: 0, frp: [], years: new Map(), lastMs: 0, first: date, last: date, latSum: 0, lonSum: 0 }; cells.set(k, c); }
    c.det++; c.latSum += lat; c.lonSum += lon;
    if (v[iDn] === 'N') c.night++;
    const t = iType >= 0 ? v[iType] : '';
    if (t === '2') c.t2++; else if (t === '0' || t === '') c.t0++;
    const frp = Number(v[iFrp]); if (Number.isFinite(frp)) c.frp.push(frp);
    let ys = c.years.get(year); if (!ys) { ys = new Set(); c.years.set(year, ys); }
    ys.add(date);
    if (ms > c.lastMs) c.lastMs = ms;
    if (date < c.first) c.first = date; if (date > c.last) c.last = date;
  }
}

// ---------------------------------------------------------------------------
// 2. EFFIS-Veto — Kartierungen je Jahr aus dem Cache (effis-<Jahr>.geojson / effis-season-*.geojson)
// ---------------------------------------------------------------------------
const effisFiles = readdirSync(CACHE).filter((f) => /^effis-(\d{4}|season-\d{4}-\d{2}-\d{2})\.geojson$/.test(f));
/** @type {Map<string, {poly:number[][][][], bbox:number[]}[]>} Jahr → Polygone */
const effisByYear = new Map();
for (const f of effisFiles) {
  const fc = JSON.parse(readFileSync(join(CACHE, f), 'utf8'));
  for (const feat of fc.features ?? []) {
    const p = parseBurntFeature(feat);
    if (!p || p.firedateMs == null) continue;
    const y = new Date(p.firedateMs).getUTCFullYear();
    const l = effisByYear.get(String(y)) ?? []; l.push(p); effisByYear.set(String(y), l);
  }
}
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function cellInPolygon(key, P) {
  const { lat, lon } = cellCenter(key);
  const [r, c] = key.split(',').map(Number);
  const west = TA_BBOX.west + c * TA_STEP, east = west + TA_STEP, north = TA_BBOX.north - r * TA_STEP, south = north - TA_STEP;
  if (east < P.bbox[0] || west > P.bbox[2] || north < P.bbox[1] || south > P.bbox[3]) return false;
  for (const poly of P.polys) {
    if (poly.length && pointInRing(lon, lat, poly[0])) return true;
    for (const ring of poly) for (const [x, y] of ring) if (x >= west && x < east && y > south && y <= north) return true;
  }
  return false;
}
function vetoYears(key, c) {
  const out = [];
  for (const y of c.years.keys()) {
    const polys = effisByYear.get(y); if (!polys) continue;
    if (polys.some((P) => cellInPolygon(key, P))) out.push(y);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Regel + Sensitivität
// ---------------------------------------------------------------------------
const quantile = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1)))); return s[i]; };
const qualifying = (c, veto, daysMin) => [...c.years].filter(([y, d]) => d.size >= daysMin && !veto.includes(y)).length;

const vetoCache = new Map();
const candidate = (c, daysMin) => [...c.years.values()].filter((d) => d.size >= daysMin).length >= 2 || c.det >= 20;
let vetoed = 0;
const persistent = [];
const sens = {};
for (const ym of [2, 3]) for (const dm of [5, 10]) sens[`years≥${ym}·days≥${dm}`] = 0;
for (const [k, c] of cells) {
  if (!candidate(c, Math.min(5, DAYS_MIN))) continue;   // Veto-Prüfung nur für Kandidaten (Polygontest ist teuer)
  const veto = vetoYears(k, c); vetoCache.set(k, veto);
  if (veto.length) vetoed++;
  for (const ym of [2, 3]) for (const dm of [5, 10]) if (qualifying(c, veto, dm) >= ym) sens[`years≥${ym}·days≥${dm}`]++;
  if (qualifying(c, veto, DAYS_MIN) >= YEARS_MIN) persistent.push([k, c, veto]);
}

const records = persistent.map(([k, c, veto]) => {
  const years = Object.fromEntries([...c.years].map(([y, d]) => [y, d.size]).sort());
  return {
    key: k, lat: +(c.latSum / c.det).toFixed(5), lon: +(c.lonSum / c.det).toFixed(5),
    det: c.det, days: new Set([...c.years.values()].flatMap((d) => [...d])).size, years,
    qualifyingYears: qualifying(c, veto, DAYS_MIN), veto,
    nightShare: +(c.night / c.det).toFixed(3), type2Share: +(c.t2 / c.det).toFixed(3),
    frp: { p50: quantile(c.frp, 0.5), p95: quantile(c.frp, 0.95), max: c.frp.length ? Math.max(...c.frp) : null },
    first: c.first, last: c.last, lastMs: c.lastMs,
  };
}).sort((a, b) => b.det - a.det);

// Gegenproben, die im Gate stehen (TA1): dürfen NICHT persistent sein.
const counterProbes = {
  'Jüterbog (52,00–52,08 / 13,00–13,08; brannte 2022+2023)': records.filter((r) => r.lat >= 52.0 && r.lat <= 52.08 && r.lon >= 13.0 && r.lon <= 13.08).length,
  'Gohrischheide (51,35–51,45 / 13,35–13,50; 2025)': records.filter((r) => r.lat >= 51.35 && r.lat <= 51.45 && r.lon >= 13.35 && r.lon <= 13.5).length,
  'Sächsische Schweiz (50,85–50,95 / 14,15–14,35; 2022)': records.filter((r) => r.lat >= 50.85 && r.lat <= 50.95 && r.lon >= 14.15 && r.lon <= 14.35).length,
  'Harz/Brocken (51,75–51,82 / 10,55–10,65; 2022/2024)': records.filter((r) => r.lat >= 51.75 && r.lat <= 51.82 && r.lon >= 10.55 && r.lon <= 10.65).length,
};
// Bekannte Werke, die persistent sein MÜSSEN (Zelle ± 1).
const knownSites = { 'voestalpine Linz': [48.28, 14.34], 'HKM Duisburg': [51.37, 6.71], 'Salzgitter': [52.15, 10.40], 'TKS Duisburg': [51.48, 6.72], 'Dillingen': [49.36, 6.75], 'ArcelorMittal Bremen': [53.13, 8.68], 'Eisenhüttenstadt': [52.16, 14.64] };
const near = (lat, lon) => records.some((r) => Math.abs(r.lat - lat) <= 0.015 && Math.abs(r.lon - lon) <= 0.015);
const knownHits = Object.fromEntries(Object.entries(knownSites).map(([n, [la, lo]]) => [n, near(la, lo)]));

const report = {
  built: new Date().toISOString().slice(0, 10), cache: CACHE, files: files.length, skippedNoHeader, rows, outsideBox,
  archive: { from: [...seenDays].sort()[0], to: [...seenDays].sort().at(-1), months: months.size, monthsWinter: [...months].filter((m) => /-(01|02|11|12)$/.test(m)).length },
  rule: { yearsMin: YEARS_MIN, daysMin: DAYS_MIN },
  cellsTotal: cells.size, persistent: records.length, vetoedCandidates: vetoed,
  persistentWithNasaType2: records.filter((r) => r.type2Share > 0).length,
  persistentType0Only: records.filter((r) => r.type2Share === 0).length,
  dayOnly: records.filter((r) => r.nightShare === 0).length,
  sensitivity: sens,
  effisYears: Object.fromEntries([...effisByYear].map(([y, l]) => [y, l.length])),
  counterProbes, knownHits,
  top50: records.slice(0, 50).map((r) => ({ key: r.key, lat: r.lat, lon: r.lon, det: r.det, days: r.days, years: r.qualifyingYears, night: r.nightShare, t2: r.type2Share, veto: r.veto })),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(OUT.replace(/\.jsonl$/, '') + '.report.json', JSON.stringify(report, null, 2) + '\n');
// Detailwerte (Tagesliste, FRP-Werte) je persistenter Zelle — für die Standortbildung
// (build-sites.mjs); zu groß fürs Repo, deshalb gitignored unter .cache/ta/.
const DETAIL = argVal('--detail-out', '.cache/ta/cell-detail.jsonl');
mkdirSync(dirname(DETAIL), { recursive: true });
writeFileSync(DETAIL, persistent.map(([k, c]) => JSON.stringify({
  key: k, days: [...new Set([...c.years.values()].flatMap((d) => [...d]))].sort(), frp: c.frp.map((v) => +v.toFixed(2)), night: c.night, t2: c.t2,
})).join('\n') + '\n');
console.log(`Zeilen ${rows} in ${files.length} Chunks (${report.archive.from}…${report.archive.to}, ${months.size} Monate, davon Winter ${report.archive.monthsWinter}) · Zellen ${cells.size} · persistent ${records.length} (NASA type2 ${report.persistentWithNasaType2}, nur eigene Zählung ${report.persistentType0Only}, Tagessignal ${report.dayOnly}) · Veto ${vetoed}`);
console.log('Sensitivität:', sens);
console.log('Gegenproben (müssen 0 sein):', counterProbes);
console.log('Bekannte Werke:', knownHits);
console.log(`geschrieben: ${OUT}`);
