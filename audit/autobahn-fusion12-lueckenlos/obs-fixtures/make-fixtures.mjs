// V-AF-9, step 0: package the saved versions of buscosun-data obs/v1 (git history of 10.10.2026) —
//   (a) full/<sha>.{latest,stations}.json  →  full/<sha>.{latest,stations}.json.gz (+ SHA256SUMS over the ORIGINAL bytes and the .gz)
//   (b) the CI excerpt scripts/lib/fixtures/obs-v1-vaf9.json: every station within EXCERPT_KM of eight cities, cut (never
//       edited) from one bad-window and one good-window version, plus the stations whose `rr` stands in `older` (reverse case).
//   node audit/autobahn-fusion12-lueckenlos/obs-fixtures/make-fixtures.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const FULL = join(HERE, 'full');
export const COMMITS = [
  ['574ef48538fba9c0653ae39bb367080cdc0e17de', '2026-10-10T10:21:30Z', 'good'],
  ['fa2ca00c956c0e561b1768863e75164c22a4703b', '2026-10-10T10:40:46Z', 'bad'],
  ['00519d66676eaa7fc536128b672b13f3c65ded8f', '2026-10-10T10:44:21Z', 'bad'],
  ['9aa64bf5f5a5e75ad19b3aeebb514823e05de2af', '2026-10-10T10:46:20Z', 'bad (wind at the stamp, T older)'],
  ['13d3b5882958e008edb36b769d7d744cef0d3c87', '2026-10-10T11:11:40Z', 'bad'],
  ['9f46fab07d19e42716da2f85f68ecf57ce16a443', '2026-10-10T11:16:12Z', 'bad (wind at the stamp, T older)'],
  ['a5552f21e2bf60cbde691f83e3fe87a014876a27', '2026-10-10T11:21:32Z', 'good'],
];
export const EXCERPT_KM = 60;
export const CITIES = [
  ['München', 48.137, 11.575], ['Berlin', 52.52, 13.405], ['Hamburg', 53.551, 9.994], ['Frankfurt', 50.11, 8.682],
  ['Stuttgart', 48.776, 9.183], ['Dresden', 51.05, 13.737], ['Wien', 48.208, 16.373], ['Zürich', 47.377, 8.54],
];
const BAD = '00519d6', GOOD = '574ef48';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
/** The original bytes of one saved file (raw when still there, else from the .gz). */
export function readFull(name) {
  const raw = join(FULL, name), gz = `${raw}.gz`;
  return existsSync(raw) ? readFileSync(raw) : gunzipSync(readFileSync(gz));
}
const km = (lat1, lon1, lat2, lon2) => {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, a)));
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // (a) gz + sums
  const sums = [];
  for (const [sha] of COMMITS) for (const kind of ['latest', 'stations']) {
    const name = `${sha.slice(0, 7)}.${kind}.json`;
    const buf = readFull(name);
    const gzPath = join(FULL, `${name}.gz`);
    if (!existsSync(gzPath)) writeFileSync(gzPath, gzipSync(buf, { level: 9 }));
    sums.push(`${sha256(buf)}  ${name}`, `${sha256(readFileSync(gzPath))}  ${name}.gz`);
  }
  writeFileSync(join(HERE, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  writeFileSync(join(HERE, 'SOURCES.md'), [
    '# obs/v1 — gesicherte Versionen aus der Git-Historie von `jppetry/buscosun-data` (10.10.2026)', '',
    'Quelle je Datei: `https://raw.githubusercontent.com/jppetry/buscosun-data/<commit>/obs/v1/{latest,stations}.json`, unverändert;',
    'abgelegt als `full/<commit7>.{latest,stations}.json.gz` (gzip der Originalbytes; `SHA256SUMS` nennt die Summe der',
    'Originalbytes und der `.gz`). Die Historie des Daten-Repos wird von der Kartenlinie überschrieben — diese Kopien sind der Beleg.', '',
    '| Commit | Commit-Zeit (UTC) | Fenster |', '|---|---|---|',
    ...COMMITS.map(([sha, at, w]) => `| \`${sha}\` | ${at} | ${w} |`), '',
    `CI-Auszug \`scripts/lib/fixtures/obs-v1-vaf9.json\`: alle Stationen im Umkreis von ${EXCERPT_KM} km um ${CITIES.map((c) => c[0]).join(', ')}`,
    `aus \`${BAD}\` (schlechtes Fenster) und \`${GOOD}\` (gutes Fenster), dazu die Stationen mit \`rr\` in \`older\` — ausgeschnitten, kein Wert geändert.`, '',
  ].join('\n'));

  // (b) excerpt
  const cat = JSON.parse(readFull(`${BAD}.stations.json`));
  const catGood = JSON.parse(readFull(`${GOOD}.stations.json`));
  const bad = JSON.parse(readFull(`${BAD}.latest.json`)), good = JSON.parse(readFull(`${GOOD}.latest.json`));
  const keep = new Set();
  for (const s of cat.stations) if (CITIES.some(([, la, lo]) => km(la, lo, s.lat, s.lon) <= EXCERPT_KM)) keep.add(s.id);
  const inCities = keep.size;
  for (const doc of [bad, good]) for (const [id, e] of Object.entries(doc.stations)) if (id.startsWith('de:') && e.older?.rr) keep.add(id);
  const cut = (doc) => ({ ...doc, count: undefined, stations: Object.fromEntries(Object.entries(doc.stations).filter(([id]) => keep.has(id))) });
  const sameCat = JSON.stringify(cat.stations.filter((s) => keep.has(s.id))) === JSON.stringify(catGood.stations.filter((s) => keep.has(s.id)));
  const out = {
    note: `REAL excerpt of buscosun-data obs/v1 (git history 10.10.2026), cut by audit/autobahn-fusion12-lueckenlos/obs-fixtures/make-fixtures.mjs — no value edited. Stations within ${EXCERPT_KM} km of ${CITIES.map((c) => c[0]).join(', ')} plus the German stations whose rr stands in "older".`,
    cities: CITIES.map(([name, lat, lon]) => ({ name, lat, lon })),
    catalog: { ...cat, count: undefined, stations: cat.stations.filter((s) => keep.has(s.id)) },
    bad: { commit: COMMITS.find((c) => c[0].startsWith(BAD))[0], latest: cut(bad) },
    good: { commit: COMMITS.find((c) => c[0].startsWith(GOOD))[0], latest: cut(good) },
  };
  const file = join(ROOT, 'scripts/lib/fixtures/obs-v1-vaf9.json');
  writeFileSync(file, JSON.stringify(out));
  const n = (doc, f) => Object.values(doc.stations).filter(f).length;
  console.log(`Auszug: ${keep.size} Stationen (${inCities} im Umkreis der Städte, ${keep.size - inCities} weitere mit rr in older) · Katalog in beiden Versionen gleich: ${sameCat} · ${(readFileSync(file).length / 1024).toFixed(0)} KB`);
  console.log(`  schlecht ${BAD}: ${Object.keys(out.bad.latest.stations).length} Einträge, T am Stempel ${n(out.bad.latest, (e) => typeof e.v?.t === 'number')}, T in older ${n(out.bad.latest, (e) => e.older?.t)}, rr in older ${n(out.bad.latest, (e) => e.older?.rr)}`);
  console.log(`  gut ${GOOD}: ${Object.keys(out.good.latest.stations).length} Einträge, T am Stempel ${n(out.good.latest, (e) => typeof e.v?.t === 'number')}, T in older ${n(out.good.latest, (e) => e.older?.t)}, rr in older ${n(out.good.latest, (e) => e.older?.rr)}`);
  console.log(`SHA256SUMS: ${sums.length} Zeilen · gz gesamt ${(readdirSync(FULL).filter((f) => f.endsWith('.gz')).reduce((s, f) => s + readFileSync(join(FULL, f)).length, 0) / 1024).toFixed(0)} KB`);
}
