/**
 * Labelpaare aus dem Archiv: EFFIS-Brandflächen (Rapid Damage Assessment) × FIRMS-VIIRS
 * Standard Processing (Phase AF4, Gate GAF4; `audit/aktivfeuer.md` §15).
 *
 *   FIRMS_MAP_KEY=… npm run fire:pairs-archive -- [--years 2020-2025] [--months 3-10]
 *       [--out data/fire/af/pairs-effis-2020-2025.jsonl] [--cache .cache/firms-archive] [--dry-run]
 *
 * Was passiert:
 *   1. je Jahr die EFFIS-Kartierungen in DACH (`ms:modis.ba.poly.{Y}`, WFS 1.1.0, BBox lat,lon,
 *      KEIN maxfeatures-Kleindeckel — V-224), Achsen-Anker wie im Client;
 *   2. je Jahr die VIIRS-Detektionen aus dem FIRMS-Archiv (`VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`),
 *      DACH-BBox, 5-Tage-Chunks (API-Grenze), gedrosselt, Roh-CSV im Cache (gitignored);
 *      Zeilen mit `type ≠ 0` (Vulkan, andere ortsfeste Quelle, offshore) werden verworfen;
 *   3. je Kartierung P: Detektionen in [FIREDATE − 3 d, (FINALDATE ?? FIREDATE) + 7 d] ∩ Bbox(P)+3 km
 *      → DIESELBEN Module wie der Client (Cluster, Zonen, Abgleich, Registry, `featuresOf`)
 *      → ein `FireLabelPair` mit `target.source = 'effis-rda'`; ohne Detektion kein Paar (gezählt).
 *
 * Der Prod-Proxy `/_firms` bleibt unangetastet (er whitelistet nur NRT); der Schlüssel kommt aus
 * `FIRMS_MAP_KEY` oder aus `.cache/firms-archive/mapkey.txt` (gitignored, `--key-file`) und
 * erscheint nirgends in Ausgabe oder Dateien. Ohne Schlüssel läuft nur `--dry-run`.
 * Aufruf unter PowerShell direkt mit node (npm.ps1 reicht `--`-Argumente nicht zuverlässig weiter):
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fire/pairs-from-archive.mjs --dry-run
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { parseFirmsCsv, dedupe } from '../../src/fire/sources/firmsHotspots.ts';
import { parseBurntFeature } from '../../src/fire/fireCorroboration.ts';
import { assertDachAxis } from '../../src/fire/sources/wfsAxis.ts';
import { buildFireClusters, fixtureRow } from '../../src/fire/fireClusters.ts';
import { buildFireZones } from '../../src/fire/fireZones.ts';
import { reconcileZones, fixturePoly } from '../../src/fire/footprint/reconcile.ts';
import { buildFireRegistry } from '../../src/fire/footprint/fireRegistry.ts';
import { featuresOf, isEligiblePair } from '../../src/fire/activity/features.ts';

// ---------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const range = (s) => { const [a, b] = s.split('-').map(Number); return b == null ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i); };
const YEARS = range(opt('years', '2020-2025'));
const MONTHS = range(opt('months', '3-10'));
// Trainingsdaten liegen in `data/`, NICHT in `public/`: der Client lädt sie nie (nur das Modell),
// und das Repo ist öffentlich — nachvollziehbar bleiben sie trotzdem.
const OUT = opt('out', `data/fire/af/pairs-effis-${YEARS[0]}-${YEARS[YEARS.length - 1]}.jsonl`);
const CACHE = opt('cache', '.cache/firms-archive');
const DRY = flag('dry-run');
// Schlüssel: Env-Var oder (gitignored) Datei — nie im Repo, nie in der Ausgabe.
const KEY_FILE = opt('key-file', join(CACHE, 'mapkey.txt'));
const KEY = (process.env.FIRMS_MAP_KEY || (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8') : '')).trim();
/** Abrufdatum — nur für den Cache-Namen des Saison-Korbs (laufendes Jahr). `--today` macht Läufe reproduzierbar. */
const TODAY = opt('today', new Date().toISOString().slice(0, 10));

const D = 86_400_000;
const DACH = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
const FIRMS_ORIGIN = 'https://firms.modaps.eosdis.nasa.gov';
const EFFIS = 'https://maps.effis.emergency.copernicus.eu';
const SP_SOURCES = ['VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP'];
const CHUNK_DAYS = 5;
const PAUSE_MS = 400;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Netz mit Cache (Text)
// ---------------------------------------------------------------------------
const stats = { requests: 0, cached: 0, retries: 0, firmsRows: 0, typeDropped: 0 };
async function fetchText(url, cacheFile, { redact = null } = {}) {
  if (cacheFile && existsSync(cacheFile)) { stats.cached++; return readFileSync(cacheFile, 'utf8'); }
  const shown = redact ? url.replace(redact, '<KEY>') : url;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      stats.requests++;
      const res = await fetch(url, { headers: { 'user-agent': 'buscosun-af4-archive/1 (+https://buscosun.com)' } });
      if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status} — Schlüssel abgelehnt (${shown})`);
      if (res.status === 429 || res.status >= 500) { stats.retries++; await sleep(2000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${shown}`);
      const text = await res.text();
      if (cacheFile) { mkdirSync(dirname(cacheFile), { recursive: true }); writeFileSync(cacheFile, text); }
      await sleep(PAUSE_MS);
      return text;
    } catch (e) {
      if (attempt === 3 || /Schlüssel abgelehnt/.test(String(e))) throw e;
      stats.retries++; await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(`aufgegeben: ${shown}`);
}

// ---------------------------------------------------------------------------
// EFFIS je Jahr
// ---------------------------------------------------------------------------
/**
 * Kartierungen eines Jahres. Für abgeschlossene Jahre gibt es den Jahreslayer
 * `ms:modis.ba.poly.{Y}`; das **laufende** Jahr hat keinen — dort liefert
 * `ms:modis.ba.poly.season` den Bestand, der clientseitig aufs Jahr gefiltert
 * wird (die Saison ist das Kalenderjahr, `euContext.ts`). Der Saison-Korb ist
 * live, deshalb bekommt er einen eigenen Cache-Namen mit Abrufdatum — sonst
 * liefert ein alter Cache Wochen später stillschweigend den alten Stand.
 */
async function loadEffisYear(year, todayIso) {
  const current = todayIso.slice(0, 4) === String(year);
  const typename = current ? 'ms:modis.ba.poly.season' : `ms:modis.ba.poly.${year}`;
  const cacheName = current ? `effis-season-${todayIso}.geojson` : `effis-${year}.geojson`;
  const url = `${EFFIS}/effis?service=WFS&request=GetFeature&version=1.1.0&outputformat=geojson`
    + `&typename=${typename}&bbox=${DACH.south},${DACH.west},${DACH.north},${DACH.east},EPSG:4326`;
  const text = await fetchText(url, join(CACHE, cacheName));
  const fc = JSON.parse(text);
  const feats = Array.isArray(fc?.features) ? fc.features : [];
  assertDachAxis(feats, `EFFIS ${year}`);
  const from = Date.UTC(year, 0, 1); const to = Date.UTC(year + 1, 0, 1);
  const polys = [];
  for (const f of feats) {
    const p = parseBurntFeature(f);
    if (!p || p.firedateMs == null || p.areaHa == null) continue;
    if (p.firedateMs < from || p.firedateMs >= to) continue;   // Saison-Korb kann Randfälle tragen
    polys.push(p);
  }
  return polys;
}

// ---------------------------------------------------------------------------
// FIRMS je Jahr (5-Tage-Chunks, beide SP-Quellen), Zeilen nach Tag indiziert
// ---------------------------------------------------------------------------
async function loadAvailability() {
  const text = await fetchText(`${FIRMS_ORIGIN}/api/data_availability/csv/${KEY}/ALL`, join(CACHE, 'availability.csv'), { redact: KEY });
  const out = {};
  for (const line of text.split(/\r?\n/).slice(1)) { const [id, min, max] = line.split(','); if (id) out[id.trim()] = { min: min?.trim(), max: max?.trim() }; }
  return out;
}

function dropNonFireTypes(csv) {
  // FIRMS-SP führt `type`: 0 = presumed vegetation fire, 1 = active volcano, 2 = other static land source, 3 = offshore.
  const lines = csv.split(/\r?\n/); if (lines.length < 2) return csv;
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const iType = header.indexOf('type'); if (iType < 0) return csv;
  const keep = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim()) continue;
    const v = l.split(','); if ((v[iType] ?? '0').trim() === '0') keep.push(l); else stats.typeDropped++;
  }
  return keep.join('\n');
}

async function loadFirmsYear(year, availability) {
  const start = Date.UTC(year, MONTHS[0] - 1, 1);
  const endExcl = MONTHS[MONTHS.length - 1] === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, MONTHS[MONTHS.length - 1], 1);
  const bbox = `${DACH.west},${DACH.south},${DACH.east},${DACH.north}`;
  const all = [];
  for (const src of SP_SOURCES) {
    const av = availability[src];
    const avMin = av?.min ? Date.parse(`${av.min}T00:00:00Z`) : -Infinity;
    const avMax = av?.max ? Date.parse(`${av.max}T00:00:00Z`) + D : Infinity;
    for (let t = start; t < endExcl; t += CHUNK_DAYS * D) {
      if (t + CHUNK_DAYS * D <= avMin || t >= avMax) continue;
      const day = isoDay(t);
      const url = `${FIRMS_ORIGIN}/api/area/csv/${KEY}/${src}/${bbox}/${CHUNK_DAYS}/${day}`;
      const text = await fetchText(url, join(CACHE, `${src}-${day}.csv`), { redact: KEY });
      if (!/^\s*latitude/i.test(text)) { console.warn(`  ${src} ${day}: keine CSV (${text.slice(0, 80).replace(/\s+/g, ' ')})`); continue; }
      const parsed = parseFirmsCsv(dropNonFireTypes(text), src);
      all.push(...parsed.rows);
    }
  }
  const rows = dedupe(all);
  stats.firmsRows += rows.length;
  const byDay = new Map();
  for (const r of rows) { const k = Math.floor(r.acqMs / D); const l = byDay.get(k); if (l) l.push(r); else byDay.set(k, [r]); }
  return { rows, byDay };
}

// ---------------------------------------------------------------------------
// Ein Paar je Kartierung — mit denselben Modulen wie der Client
// ---------------------------------------------------------------------------
/**
 * Ein Paar je Kartierung — oder `null` mit Grund im Diagnoseprotokoll:
 *   noDetection  keine Detektion im Zeit-/Ortsfenster
 *   noMatch      Detektionen da, aber die Registry ordnet sie dieser Kartierung nicht zu
 *                (Zone/Polygon überlappen nicht innerhalb der Toleranz, oder die Zeit passt nicht)
 * Beides wird gezählt UND mit Fläche protokolliert — sonst bliebe unsichtbar, ob
 * systematisch eine Größenklasse aus dem Training fällt (V-AF-13).
 */
function pairFor(P, byDay, counters) {
  const start = P.firedateMs - 3 * D;
  const endEvent = P.finaldateMs != null && P.finaldateMs > P.firedateMs ? P.finaldateMs : P.firedateMs;
  const end = endEvent + 7 * D;
  const dLat = 3000 / 111_320; const dLon = 3000 / (111_320 * Math.cos((P.bbox[1] + P.bbox[3]) / 2 * Math.PI / 180));
  const [w, s, e, n] = [P.bbox[0] - dLon, P.bbox[1] - dLat, P.bbox[2] + dLon, P.bbox[3] + dLat];
  const rows = [];
  for (let k = Math.floor(start / D); k <= Math.floor(end / D); k++) {
    const l = byDay.get(k); if (!l) continue;
    for (const r of l) if (r.acqMs >= start && r.acqMs <= end && r.lon >= w && r.lon <= e && r.lat >= s && r.lat <= n) rows.push(r);
  }
  if (rows.length === 0) { counters.noDetection++; counters.dropped.push({ id: P.id, areaHa: P.areaHa, rows: 0, reason: 'noDetection' }); return null; }
  const clusters = buildFireClusters(rows);
  const zones = buildFireZones(rows);
  const reconciled = reconcileZones(zones, [P]);
  const records = buildFireRegistry({
    clusters, zones, reconciled, polys: [P],
    effisWindow: { fromMs: P.firedateMs - 14 * D, toMs: end + D }, emsActs: [], nowMs: end,
  });
  const rec = records.find((r) => r.sources.cluster && r.sources.effis && r.sources.effis.id === P.id);
  if (!rec) {
    counters.noMatch++;
    const near = records.find((r) => r.sources.effis && r.sources.effis.id === P.id);
    counters.dropped.push({ id: P.id, areaHa: P.areaHa, rows: rows.length, clusters: clusters.length, zones: zones.length, effisOnlyRecord: !!near, reason: 'noMatch' });
    return null;
  }
  const features = featuresOf(rec, end);
  const target = {
    source: 'effis-rda', areaNetHa: P.areaHa, areaMinHa: P.areaHa, areaMaxHa: P.areaHa,
    baStatus: P.finaldateMs != null ? 'final' : 'mapped', separability: null,
    mappedAtMs: P.lastUpdateMs ?? P.firedateMs, effisId: P.id,
  };
  return { features, target };
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------
/** Verteilung der verworfenen Kartierungen nach Flächenklasse — macht einen Größenbias sichtbar. */
function histogram(dropped) {
  const bins = [[0, 2], [2, 10], [10, 50], [50, 200], [200, Infinity]];
  const out = {};
  for (const [lo, hi] of bins) {
    const sel = dropped.filter((d) => d.areaHa >= lo && d.areaHa < hi);
    if (sel.length) out[`${lo}–${hi === Infinity ? '∞' : hi} ha`] = { total: sel.length, noDetection: sel.filter((d) => d.reason === 'noDetection').length, noMatch: sel.filter((d) => d.reason === 'noMatch').length };
  }
  return out;
}

async function main() {
  const report = { years: {}, requests: 0, cached: 0, retries: 0, firmsRows: 0, typeDropped: 0, availability: null, out: OUT, dryRun: DRY };
  const lines = [];
  const allDropped = [];

  if (DRY) {
    // Fixture: eine Kartierung (40 ha), sechs Detektionen an zwei Überflügen ⇒ genau ein Paar.
    const t0 = Date.UTC(2025, 7, 10, 12, 0);
    const P = fixturePoly('DRY1', 11.002, 48.003, 0.02, t0, 40);
    const rows = [0, 1, 2].map((i) => fixtureRow(48.003 + i * 0.003, 11.002, t0 + 2 * 3_600_000, 5))
      .concat([0, 1, 2].map((i) => fixtureRow(48.003 + i * 0.003, 11.004, t0 + 26 * 3_600_000, 8)));
    const byDay = new Map(); for (const r of rows) { const k = Math.floor(r.acqMs / D); (byDay.get(k) ?? byDay.set(k, []).get(k)).push(r); }
    const counters = { polygons: 1, noDetection: 0, noMatch: 0, pairs: 0, eligible: 0, dropped: [] };
    const pair = pairFor(P, byDay, counters);
    if (pair) { counters.pairs++; if (isEligiblePair(pair)) counters.eligible++; lines.push(JSON.stringify(pair)); }
    report.years[2025] = counters;
    console.log(JSON.stringify({ report, sample: pair }, null, 2));
    return;
  }

  if (!KEY) { console.error(`FIRMS_MAP_KEY fehlt (Env-Var oder ${KEY_FILE}) — nur --dry-run möglich.`); process.exit(2); }
  if (!/^[0-9a-z]{32}$/.test(KEY)) { console.error('FIRMS_MAP_KEY hat nicht die erwartete Form (32 Zeichen [0-9a-z]).'); process.exit(2); }
  mkdirSync(CACHE, { recursive: true });
  const availability = await loadAvailability();
  report.availability = Object.fromEntries(SP_SOURCES.map((s) => [s, availability[s] ?? null]));
  console.log('Datenverfügbarkeit:', report.availability);

  for (const year of YEARS) {
    const counters = { polygons: 0, noDetection: 0, noMatch: 0, pairs: 0, eligible: 0, firmsRows: 0, dropped: [] };
    process.stdout.write(`${year}: EFFIS … `);
    const polys = await loadEffisYear(year, TODAY);
    counters.polygons = polys.length;
    process.stdout.write(`${polys.length} Kartierungen · FIRMS … `);
    const before = stats.firmsRows;
    const { byDay } = await loadFirmsYear(year, availability);
    counters.firmsRows = stats.firmsRows - before;
    process.stdout.write(`${counters.firmsRows} Detektionen · Paare … `);
    for (const P of polys) {
      const pair = pairFor(P, byDay, counters);
      if (!pair) continue;
      counters.pairs++;
      if (isEligiblePair(pair)) counters.eligible++;
      lines.push(JSON.stringify(pair));
    }
    console.log(`${counters.pairs} (zulässig ${counters.eligible}; ohne Detektion ${counters.noDetection}, ohne Zuordnung ${counters.noMatch})`);
    allDropped.push(...counters.dropped.map((d) => ({ ...d, year })));
    report.years[year] = { ...counters, dropped: undefined, droppedByArea: histogram(counters.dropped) };
  }
  Object.assign(report, { requests: stats.requests, cached: stats.cached, retries: stats.retries, firmsRows: stats.firmsRows, typeDropped: stats.typeDropped });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join('\n') + (lines.length ? '\n' : ''));
  writeFileSync(OUT.replace(/\.jsonl$/, '') + '.report.json', JSON.stringify(report, null, 2) + '\n');
  writeFileSync(OUT.replace(/\.jsonl$/, '') + '.dropped.json', JSON.stringify(allDropped, null, 1) + '\n');
  console.log(`geschrieben: ${OUT} (${lines.length} Paare) · Abfragen ${stats.requests} (Cache ${stats.cached}, Retries ${stats.retries}) · type≠0 verworfen ${stats.typeDropped}`);
  console.log(`ohne Paar: ${allDropped.length} Kartierungen — Verteilung in ${OUT.replace(/\.jsonl$/, '')}.dropped.json`);
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
