/**
 * BH1 — Ereignisse der Brand-Historie aus dem FIRMS-Archiv (`audit/brand-historie.md` §5).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fire/bh/events-from-archive.mjs
 *        [--years 2020-2026] [--cache .cache/firms-archive] [--out data/fire/bh/events.jsonl]
 *        [--today YYYY-MM-DD] [--no-net] [--dry-run] [--sensitivity]
 *
 * Was passiert:
 *   1. alle SP-Chunks aus dem Cache lesen (`VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`, 5-Tage-CSV, wie
 *      `scripts/fire/ta/fetch-archive.mjs` sie ablegt) — inkl. NASA `type`, NICHTS wird verworfen;
 *   2. den **NRT-Rand** des laufenden Jahres nachladen (ab SP-Cutover je Sensor laut
 *      `/api/data_availability/`, `VIIRS_SNPP_NRT` + `VIIRS_NOAA20_NRT`; NOAA-21 bewusst nicht —
 *      es gibt ihn nur als NRT, die Reihe bliebe sonst sensorungleich), abgeschlossene Chunks
 *      dauerhaft gecacht, der Chunk mit „heute" tagesgestempelt;
 *   3. EFFIS-Kartierungen je Jahr aus dem Cache (Jahreslayer) bzw. live (Saison-Korb, tagesgestempelt);
 *   4. `eventsFromRows` (Modul `src/fire/history/historyEvents.ts`) — DIESELBEN Cluster-, Lücken-,
 *      Registry-, Standort- und Schätz-Module wie der Client;
 *   5. Kennungen gegen den vorigen Lauf verknüpfen (`linkPrevious`), Report mit den Messungen zu
 *      Konzept §11 (Cluster-Radius-Sensitivität, Einzeldetektionen, Standort-Anteile).
 *
 * Schlüssel: `FIRMS_MAP_KEY` (Env) oder `.cache/firms-archive/mapkey.txt` — nie im Repo, in jeder
 * Ausgabe maskiert. Ohne Schlüssel oder mit `--no-net`: nur Cache (der NRT-Rand fehlt dann, gezählt).
 * Prod-Proxy `/_firms` unangetastet. Ausgabe nach `data/` (nicht `public/`) — BH2 baut daraus die
 * Artefakte.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

import { parseFirmsCsv, dedupe, detectionKey } from '../../../src/fire/sources/firmsHotspots.ts';
import { parseBurntFeature } from '../../../src/fire/fireCorroboration.ts';
import { assertDachAxis } from '../../../src/fire/sources/wfsAxis.ts';
import { CLUSTER_RADIUS_M } from '../../../src/fire/fireClusters.ts';
import { spatialClusters, splitByTimeGap } from '../../../src/fire/fireEvents.ts';
import { indexSites, siteAt } from '../../../src/fire/anomaly/thermalSites.ts';
import { buildPlaceIndex, nearestPlace } from '../../../src/fire/footprint/places.ts';
import { modelUsable } from '../../../src/fire/activity/estimate.ts';
import { eventsFromRows, linkPrevious, seasonWindow, HISTORY_EVENT_VERSION } from '../../../src/fire/history/historyEvents.ts';

// ---------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const range = (s) => { const [a, b] = s.split('-').map(Number); return b == null ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i); };
const YEARS = range(opt('years', '2020-2026'));
const CACHE = opt('cache', '.cache/firms-archive');
const OUT = opt('out', 'data/fire/bh/events.jsonl');
const TODAY = opt('today', new Date().toISOString().slice(0, 10));
const NO_NET = flag('no-net');
const DRY = flag('dry-run');
/** Radius-Sensitivität (vier volle Cluster-Läufe, ~40 min auf 344 k Zeilen) — nur auf Wunsch; der Wert steht im Report vom 2026-08-22. */
const SENS = flag('sensitivity');
const KEY_FILE = opt('key-file', join(CACHE, 'mapkey.txt'));
const KEY = NO_NET ? '' : (process.env.FIRMS_MAP_KEY || (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8') : '')).trim();

const D = 86_400_000;
/** Auswertezeitpunkt: Ende des Abruftags (UTC) — fest, damit zwei Läufe am selben Tag byte-gleich sind. */
const NOW = Date.parse(`${TODAY}T00:00:00Z`) + D;
const DACH = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
const FIRMS_ORIGIN = 'https://firms.modaps.eosdis.nasa.gov';
const EFFIS = 'https://maps.effis.emergency.copernicus.eu';
const SP_SOURCES = ['VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP'];
const NRT_OF = { VIIRS_SNPP_SP: 'VIIRS_SNPP_NRT', VIIRS_NOAA20_SP: 'VIIRS_NOAA20_NRT' };
const CHUNK_DAYS = 5;
const PAUSE_MS = 400;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Netz mit Cache (Text) — wie `pairs-from-archive.mjs`
// ---------------------------------------------------------------------------
const stats = { requests: 0, cached: 0, retries: 0, nrtChunks: 0, nrtSkippedNoKey: 0 };
async function fetchText(url, cacheFile, { redact = null } = {}) {
  if (cacheFile && existsSync(cacheFile)) { stats.cached++; return readFileSync(cacheFile, 'utf8'); }
  if (!KEY && /firms\.modaps/.test(url)) { stats.nrtSkippedNoKey++; return ''; }
  const shown = redact ? url.replace(redact, '<KEY>') : url;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      stats.requests++;
      const res = await fetch(url, { headers: { 'user-agent': 'buscosun-bh1-archive/1 (+https://buscosun.com)' } });
      if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status} — Schlüssel abgelehnt (${shown})`);
      if (res.status === 429 || res.status >= 500 || res.status === 400) { stats.retries++; await sleep(2000 * (attempt + 1)); continue; }
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
// FIRMS — Zeilen + NASA-`type` je Detektionsschlüssel
// ---------------------------------------------------------------------------
const nasaType = new Map();
function readTypes(csv) {
  const lines = csv.split(/\r?\n/); if (lines.length < 2) return;
  const h = lines[0].split(',').map((s) => s.trim().toLowerCase());
  const iLat = h.indexOf('latitude'), iLon = h.indexOf('longitude'), iDate = h.indexOf('acq_date'), iTime = h.indexOf('acq_time'), iType = h.indexOf('type');
  if (iType < 0) return;
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(','); if (v.length < 5) continue;
    const hhmm = String(v[iTime] ?? '0').trim().padStart(4, '0');
    const ms = Date.parse(`${v[iDate].trim()}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
    const t = Number(v[iType]);
    if (Number.isFinite(ms) && t >= 0 && t <= 3) nasaType.set(detectionKey({ lat: Number(v[iLat]), lon: Number(v[iLon]), acqMs: ms }), t);
  }
}

function loadCachedSp() {
  const rows = [];
  const files = readdirSync(CACHE).filter((f) => /^VIIRS_(SNPP|NOAA20)_SP-\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
  let used = 0;
  for (const f of files) {
    const year = Number(f.slice(-14, -10));
    if (!YEARS.includes(year)) continue;
    const text = readFileSync(join(CACHE, f), 'utf8');
    if (!/^\s*latitude/i.test(text)) continue;
    const src = f.replace(/-\d{4}-\d{2}-\d{2}\.csv$/, '');
    rows.push(...parseFirmsCsv(text, src).rows);
    readTypes(text);
    used++;
  }
  return { rows, files: used };
}

async function loadAvailability() {
  const text = await fetchText(`${FIRMS_ORIGIN}/api/data_availability/csv/${KEY}/ALL`, join(CACHE, `availability@${TODAY}.csv`), { redact: KEY });
  const out = {};
  for (const line of text.split(/\r?\n/).slice(1)) { const [id, min, max] = line.split(','); if (id) out[id.trim()] = { min: min?.trim(), max: max?.trim() }; }
  return out;
}

/** NRT-Rand: je Sensor ab dem Tag nach dem SP-Maximum bis heute. */
async function loadNrtRim(availability) {
  const rows = []; const rim = {};
  const bbox = `${DACH.west},${DACH.south},${DACH.east},${DACH.north}`;
  const todayMs = Date.parse(`${TODAY}T00:00:00Z`);
  for (const sp of SP_SOURCES) {
    const nrt = NRT_OF[sp];
    const spMax = availability[sp]?.max ? Date.parse(`${availability[sp].max}T00:00:00Z`) : null;
    const nrtMin = availability[nrt]?.min ? Date.parse(`${availability[nrt].min}T00:00:00Z`) : null;
    if (spMax == null || nrtMin == null) { rim[nrt] = null; continue; }
    const start = Math.max(spMax + D, nrtMin);
    rim[nrt] = { from: isoDay(start), to: TODAY, chunks: 0 };
    for (let t = start; t <= todayMs; t += CHUNK_DAYS * D) {
      const days = Math.min(CHUNK_DAYS, Math.floor((todayMs - t) / D) + 1);
      const day = isoDay(t);
      const closed = t + days * D <= todayMs;            // Chunk liegt ganz in der Vergangenheit
      const cacheFile = join(CACHE, closed ? `${nrt}-${day}-${days}.csv` : `${nrt}-${day}-${days}@${TODAY}.csv`);
      const url = `${FIRMS_ORIGIN}/api/area/csv/${KEY}/${nrt}/${bbox}/${days}/${day}`;
      const text = await fetchText(url, cacheFile, { redact: KEY });
      if (!/^\s*latitude/i.test(text)) continue;
      rows.push(...parseFirmsCsv(text, nrt).rows);
      rim[nrt].chunks++; stats.nrtChunks++;
    }
  }
  return { rows, rim };
}

// ---------------------------------------------------------------------------
// EFFIS je Jahr (Cache; laufendes Jahr = Saison-Korb, tagesgestempelt)
// ---------------------------------------------------------------------------
async function loadEffisYear(year) {
  const current = TODAY.slice(0, 4) === String(year);
  const typename = current ? 'ms:modis.ba.poly.season' : `ms:modis.ba.poly.${year}`;
  let cacheName = current ? `effis-season-${TODAY}.geojson` : `effis-${year}.geojson`;
  if (current && !existsSync(join(CACHE, cacheName)) && NO_NET) {
    // ohne Netz: den jüngsten vorhandenen Saison-Korb nehmen, Stand wird im Report genannt
    const alt = readdirSync(CACHE).filter((f) => /^effis-season-\d{4}-\d{2}-\d{2}\.geojson$/.test(f)).sort().pop();
    if (alt) cacheName = alt;
  }
  const file = join(CACHE, cacheName);
  if (!existsSync(file) && NO_NET) return { polys: [], stamp: null };
  const url = `${EFFIS}/effis?service=WFS&request=GetFeature&version=1.1.0&outputformat=geojson`
    + `&typename=${typename}&bbox=${DACH.south},${DACH.west},${DACH.north},${DACH.east},EPSG:4326`;
  const text = await fetchText(url, file);
  const fc = JSON.parse(text);
  const feats = Array.isArray(fc?.features) ? fc.features : [];
  assertDachAxis(feats, `EFFIS ${year}`);
  const from = Date.UTC(year, 0, 1); const to = Date.UTC(year + 1, 0, 1);
  const polys = [];
  for (const f of feats) {
    const p = parseBurntFeature(f);
    if (!p || p.firedateMs == null) continue;
    if (p.firedateMs < from || p.firedateMs >= to) continue;
    polys.push(p);
  }
  return { polys, stamp: cacheName };
}

// ---------------------------------------------------------------------------
// Statische Kontexte aus `public/`
// ---------------------------------------------------------------------------
function loadRings() {
  const rings = new Map();
  for (const c of ['DE', 'AT', 'CH']) {
    const feat = JSON.parse(readFileSync(join('public', 'countries', `${c}.geojson`), 'utf8'));
    const g = feat.geometry ?? feat.features?.[0]?.geometry;
    const out = [];
    if (g.type === 'Polygon') for (const r of g.coordinates) out.push(r);
    else for (const poly of g.coordinates) for (const r of poly) out.push(r);
    rings.set(c, out);
  }
  return rings;
}

// ---------------------------------------------------------------------------
// Messungen für den Report (Konzept §11)
// ---------------------------------------------------------------------------
function eventCountAt(rows, radiusM) {
  let n = 0;
  for (const b of spatialClusters(rows, radiusM)) for (const seg of splitByTimeGap(b.rows)) n += spatialClusters(seg, radiusM).length;
  return n;
}

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; }

function yearStats(evs, year) {
  const det = evs.filter((e) => e.detections.length > 0);
  const byCountry = {};
  for (const e of evs) byCountry[e.country ?? 'null'] = (byCountry[e.country ?? 'null'] ?? 0) + 1;
  const win = seasonWindow(year);
  const sites = det.filter((e) => e.anomaly?.kind === 'site').length;
  const deviating = det.filter((e) => e.anomaly?.kind === 'site-deviating').length;
  return {
    events: evs.length,
    withDetections: det.length,
    effisOnly: evs.length - det.length,
    effisMatched: det.filter((e) => e.effis).length,
    detections: det.reduce((s, e) => s + e.detections.length, 0),
    provenance: { sp: det.reduce((s, e) => s + e.provenance.sp, 0), nrt: det.reduce((s, e) => s + e.provenance.nrt, 0) },
    inSeason: evs.filter((e) => e.firstMs != null && e.firstMs >= win.fromMs && e.firstMs < win.toMs).length,
    singleDetection: det.filter((e) => e.detections.length === 1).length,
    singleOverpass: det.filter((e) => e.overpasses === 1).length,
    medianDurationH: median(det.map((e) => (e.lastMs - e.firstMs) / 3_600_000)),
    medianDistinctDays: median(det.map((e) => e.distinctDays)),
    anomaly: { site: sites, siteDeviating: deviating, shareSite: det.length ? +(sites / det.length).toFixed(3) : null, shareDeviating: det.length ? +(deviating / det.length).toFixed(3) : null },
    suspectedStatic: det.filter((e) => e.suspectedStatic).length,
    nasaType2Events: det.filter((e) => e.nasaType2Share != null && e.nasaType2Share > 0.5).length,
    withAreaEst: det.filter((e) => e.areaEst).length,
    byCountry,
  };
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  if (!existsSync(CACHE)) { console.error(`Cache ${CACHE} fehlt — erst scripts/fire/ta/fetch-archive.mjs.`); process.exit(2); }
  if (KEY && !/^[0-9a-z]{32}$/.test(KEY)) { console.error('FIRMS_MAP_KEY hat nicht die erwartete Form.'); process.exit(2); }

  process.stdout.write('SP-Archiv aus dem Cache … ');
  const sp = loadCachedSp();
  console.log(`${sp.files} Chunks, ${sp.rows.length} Zeilen (type bekannt: ${nasaType.size})`);

  let availability = null; let rim = null; let nrtRows = [];
  if (KEY && YEARS.includes(Number(TODAY.slice(0, 4)))) {
    availability = await loadAvailability();
    process.stdout.write('NRT-Rand … ');
    const r = await loadNrtRim(availability);
    nrtRows = r.rows; rim = r.rim;
    console.log(`${nrtRows.length} Zeilen aus ${stats.nrtChunks} Chunks ${JSON.stringify(rim)}`);
  } else {
    console.log(`NRT-Rand übersprungen (${KEY ? 'Jahr nicht im Bereich' : 'kein Schlüssel / --no-net'})`);
  }

  // Dedupe über SP + NRT: am Cutover-Tag kann dieselbe Detektion zweimal vorliegen (Schlüssel = Ort + Zeit).
  const rows = dedupe([...sp.rows, ...nrtRows]).filter((r) => YEARS.includes(new Date(r.acqMs).getUTCFullYear()));
  console.log(`Zeilen gesamt nach Dedupe: ${rows.length}`);

  const polys = []; const effisStamps = {};
  for (const y of YEARS) { const { polys: p, stamp } = await loadEffisYear(y); polys.push(...p); effisStamps[y] = { polys: p.length, stamp }; }
  console.log(`EFFIS-Kartierungen: ${polys.length}`);

  const sitesFile = JSON.parse(readFileSync('public/fire/ta/thermal-sites-v1.json', 'utf8'));
  const sites = indexSites(sitesFile);
  const places = buildPlaceIndex(JSON.parse(readFileSync('public/fire/places-dach.json', 'utf8')));
  const model = JSON.parse(readFileSync('public/fire/af/area-estimate-v1.json', 'utf8'));
  const rings = loadRings();

  const ctx = {
    nowMs: NOW, polys, rings,
    siteAt: (lat, lon) => siteAt(sites, lat, lon),
    placeAt: (lat, lon) => { const h = nearestPlace(places, lat, lon); return h ? { name: h.name, district: h.district, distanceKm: h.distanceKm } : null; },
    areaModel: modelUsable(model) ? model : null,
    nasaTypeOf: (key) => nasaType.get(key) ?? null,
  };

  if (DRY) { console.log('dry-run: Kontexte geladen, kein Lauf.'); return; }

  process.stdout.write('Ereignisse … ');
  const tb = Date.now();
  const build = eventsFromRows(rows, ctx);
  console.log(`${build.events.length} (davon nur EFFIS ${build.effisOnly}, in Registry verloren ${build.lostInRegistry}) in ${((Date.now() - tb) / 1000).toFixed(1)} s`);

  // Kennungen gegen den vorigen Lauf
  let link = { linked: 0, superseded: [] };
  if (existsSync(OUT)) {
    const prev = readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    link = linkPrevious(build.events, prev);
    console.log(`Kennungen: ${link.linked} verknüpft, ${link.superseded.length} ersetzt`);
  }

  // Messungen
  let sensitivity = null;
  if (SENS) {
    process.stdout.write('Radius-Sensitivität … ');
    sensitivity = {};
    for (const r of [1000, 1500, 2000, 3000]) sensitivity[`${r} m`] = eventCountAt(rows, r);
    console.log(JSON.stringify(sensitivity));
  }

  const years = {};
  for (const y of YEARS) years[y] = yearStats(build.events.filter((e) => e.year === y), y);

  const lines = build.events.map((e) => JSON.stringify(e));
  const body = lines.join('\n') + (lines.length ? '\n' : '');
  const report = {
    version: HISTORY_EVENT_VERSION, evaluatedAt: NOW, today: TODAY, years: years, out: OUT,
    sha256: createHash('sha256').update(body).digest('hex'),
    rule: { clusterRadiusM: CLUSTER_RADIUS_M, gapH: 48, season: '03-01..10-31', sources: { sp: SP_SOURCES, nrt: Object.values(NRT_OF) }, noaa21: 'ausgeschlossen (nur NRT — Reihe bliebe sensorungleich)' },
    input: { spChunks: sp.files, spRows: sp.rows.length, nrtRows: nrtRows.length, rowsAfterDedupe: rows.length, effis: effisStamps, availability: availability ? Object.fromEntries([...SP_SOURCES, ...Object.values(NRT_OF)].map((s) => [s, availability[s] ?? null])) : null, nrtRim: rim },
    clusterRadiusSensitivity: sensitivity ?? 'nicht gerechnet (--sensitivity); 2026-08-22: 1000 m 65 922 · 1500 m 64 815 · 2000 m 63 980 · 3000 m 61 742',
    link: { linked: link.linked, superseded: link.superseded.length, supersededIds: link.superseded.slice(0, 50) },
    lostInRegistry: build.lostInRegistry,
    net: { requests: stats.requests, cached: stats.cached, retries: stats.retries, nrtSkippedNoKey: stats.nrtSkippedNoKey },
    durationS: +((Date.now() - t0) / 1000).toFixed(1),
    limits: [
      'keine CLC-Maske (landcoverAt) und kein Windflag im Batch — Felder null wie im Client ohne Quelle',
      'keine Beobachtungsqualifikation (AF2) — im Archiv eine andere Frage; Lücken stehen als freMaxGapH im Merkmalsatz',
      'NRT-Rand nur SNPP + NOAA-20; der Live-Client nutzt zusätzlich NOAA-21',
    ],
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body);
  writeFileSync(OUT.replace(/\.jsonl$/, '') + '.report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`geschrieben: ${OUT} (${lines.length} Ereignisse, ${(body.length / 1048576).toFixed(1)} MB) · ${report.durationS} s`);
  for (const y of YEARS) { const s = years[y]; console.log(`  ${y}: ${s.events} Ereignisse (Saison ${s.inSeason}, nur EFFIS ${s.effisOnly}, Standort ${s.anomaly.site}/${s.anomaly.siteDeviating}, Einzeldetektion ${s.singleDetection}) · ${JSON.stringify(s.byCountry)}`); }
}

main().catch((e) => { console.error(String(e?.stack ?? e)); process.exit(1); });
