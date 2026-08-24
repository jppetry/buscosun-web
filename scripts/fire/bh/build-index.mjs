/**
 * BH2 — Artefakte der Brand-Historie aus der Ereignisdatei (`audit/brand-historie.md` §5 BH2).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fire/bh/build-index.mjs
 *        [--in data/fire/bh/events.jsonl] [--out public/fire/bh] [--clean]
 *
 * Schreibt `index-month-v1.json`, `index-season-v1.json` und die Detail-Shards `ev/<jahr>/<monat>/
 * <lat>_<lon>.json` für genau die Ereignisse, die in einem der beiden Indizes stehen. Fenster und
 * Auswertezeitpunkt kommen aus dem Report des BH1-Laufs (`evaluatedAt`), nicht aus der Uhr — zwei
 * Läufe auf derselben Ereignisdatei sind byte-gleich (bis auf `generatedAt`).
 * `--clean` leert `ev/` vorher (alte Shards eines früheren Stands würden sonst liegen bleiben).
 * Netzfrei, kein Schlüssel.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { HISTORY_ARTIFACT_VERSION, INDEX_FIELDS, DETECTION_FIELDS, monthWindow, currentSeasonWindow, selectWindow, countsOf, rowOf, shardPath, shardEventOf } from '../../../src/fire/history/historyArtifacts.ts';
import { buildSeasonSeries, compareToReference } from '../../../src/fire/history/historySeries.ts';
import { CLUSTER_RADIUS_M } from '../../../src/fire/fireClusters.ts';
import { FIRMS_ATTRIBUTION } from '../../../src/fire/sources/firmsHotspots.ts';
import { PLACES_ATTRIBUTION } from '../../../src/fire/footprint/places.ts';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const IN = opt('in', 'data/fire/bh/events.jsonl');
const OUT = opt('out', 'public/fire/bh');
const CLEAN = args.includes('--clean');

if (!existsSync(IN)) { console.error(`${IN} fehlt — erst scripts/fire/bh/events-from-archive.mjs.`); process.exit(2); }
const report = JSON.parse(readFileSync(IN.replace(/\.jsonl$/, '') + '.report.json', 'utf8'));
const evaluatedAt = report.evaluatedAt;
const generatedAt = new Date().toISOString();

process.stdout.write('Ereignisse lesen … ');
const events = readFileSync(IN, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
console.log(events.length);

const windows = { month: monthWindow(evaluatedAt), season: currentSeasonWindow(evaluatedAt) };
const LIMITS = [
  'Ereignisse mit NRT-Detektionen können durch die Standard-Verarbeitung (SP) noch wandern oder wegfallen — die Kennung wird dann weitergereicht.',
  'Nur Suomi-NPP und NOAA-20 (SP-Archiv); der Live-Brandradar nutzt zusätzlich NOAA-21.',
  'Kleine Brände fehlen systematisch: VIIRS erkennt Brände unter 50 ha nur zu 15–70 % — eine leere Karte heißt nicht „keine Brände".',
  'Nur Ereignisse mit Schwerpunkt in DE/AT/CH; Brände jenseits der Grenzen sind gezählt, nicht gezeigt.',
];
const ATTRIB = [FIRMS_ATTRIBUTION, 'Brandflächen: EFFIS Rapid Damage Assessment (Copernicus EMS)', PLACES_ATTRIBUTION, 'Anlagenstandorte: E-PRTR (EEA, CC-BY 4.0), MaStR (DL-DE/BY-2.0), BFE (OPEN BY)'];

mkdirSync(OUT, { recursive: true });
// Jans Entscheidung 2026-08-23 („nur die Saison"): `ev/` wird IMMER neu aufgebaut — es enthält
// danach genau die Shards der laufenden Saison und des laufenden Monats. Beim Saisonwechsel fallen
// die alten Shards damit von selbst aus dem Repo; die Rohdaten bleiben im lokalen Cache reproduzierbar.
if (existsSync(join(OUT, 'ev'))) rmSync(join(OUT, 'ev'), { recursive: true });
void CLEAN; // bleibt als Flag akzeptiert (jetzt Standardverhalten)

const inShards = new Map();
const sizes = {};
for (const kind of ['month', 'season']) {
  const w = windows[kind];
  const { selected, outsideDropped } = selectWindow(events, w);
  const file = {
    version: HISTORY_ARTIFACT_VERSION, evaluatedAt, generatedAt, window: w,
    fields: INDEX_FIELDS, events: selected.map(rowOf),
    counts: countsOf(selected, outsideDropped),
    shards: { base: '/fire/bh/ev/', scheme: '<jahr>/<monat>/<floor(lat)>_<floor(lon)>.json' },
    rule: { clusterRadiusM: CLUSTER_RADIUS_M, gapH: 48, season: '03-01..10-31', sources: ['VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP', 'VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT'] },
    limits: LIMITS, attributions: ATTRIB,
  };
  const body = JSON.stringify(file);
  const path = join(OUT, `index-${kind}-v1.json`);
  writeFileSync(path, body);
  sizes[kind] = { events: selected.length, bytes: body.length, gzip: gzipSync(body).length, counts: file.counts, window: w.label };
  for (const e of selected) { const p = shardPath(e); const l = inShards.get(p); if (l) { if (!l.some((x) => x.id === e.id)) l.push(e); } else inShards.set(p, [e]); }
}

let shardBytes = 0, shardGz = 0, maxShard = 0;
for (const [p, list] of inShards) {
  const [month, cell] = [p.slice(0, 7), p.slice(8, -5)];
  list.sort((a, b) => a.id.localeCompare(b.id));
  const body = JSON.stringify({ version: HISTORY_ARTIFACT_VERSION, evaluatedAt, cell, month, detectionFields: DETECTION_FIELDS, events: list.map(shardEventOf) });
  const f = join(OUT, 'ev', p);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, body);
  shardBytes += body.length; const g = gzipSync(body).length; shardGz += g; if (g > maxShard) maxShard = g;
}

// BH5: Saisonverlauf — dieselben Ereignisse, dieselbe Zählregel wie der Index (Modul `historySeries.ts`).
const years = [...new Set(events.map((e) => e.year))].sort();
const series = buildSeasonSeries(events, years, evaluatedAt, generatedAt);
const seriesBody = JSON.stringify(series);
writeFileSync(join(OUT, 'season-series-v1.json'), seriesBody);
const cmp = compareToReference(series);
const seriesSize = { years, bytes: seriesBody.length, gzip: gzipSync(seriesBody).length, today: cmp ? { year: cmp.year, day: cmp.day, value: cmp.value, mean: cmp.mean, min: cmp.min, max: cmp.max } : null, seasonEnd: Object.fromEntries(series.seasons.map((s) => [s.year, s.cumulative.DACH[s.lastDay] ?? null])) };

const summary = { generatedAt, evaluatedAt, index: sizes, shards: { files: inShards.size, bytes: shardBytes, gzip: shardGz, maxGzip: maxShard }, series: seriesSize };
writeFileSync(join(OUT, 'build-report.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
