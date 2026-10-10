// V-AF-9, verification B (not in CI): the reader before V-AF-9 against the per-variable reader over EVERY saved version of
// obs/v1/latest.json (git history of the data repo, 10.10.2026), at the axis points of the route forecast and at 20 city points.
// Clock of each version = its builtAt. Read-only.
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/autobahn-fusion12-lueckenlos/replay-obs-reader.mjs <road/fc/v1/static/points.json> [stack.client.json] [--md]
import { readFileSync } from 'node:fs';
import { parseObsCatalog, parseObsLatest, obsStoreOf, nearestObsStations, OBS_DENSE_MAX } from '../../src/sources/obsStore.ts';
import { cubeObsOf } from '../../src/pointForecast/cubeSource.ts';
import { COMMITS, readFull } from './obs-fixtures/make-fixtures.mjs';

const [, , pointsFile, stackFile] = process.argv;
const MD = process.argv.includes('--md');
// --cities-only: skip the axis points (a quick look at the 20 city points)
const axis = JSON.parse(readFileSync(pointsFile, 'utf8')).points.filter((p) => p.kind === 'axis').map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, country: 'DE' })).slice(0, process.argv.includes('--cities-only') ? 1 : Infinity);
export const CITIES = [
  ['München', 48.137, 11.575, 'DE'], ['Berlin', 52.52, 13.405, 'DE'], ['Hamburg', 53.551, 9.994, 'DE'], ['Frankfurt', 50.11, 8.682, 'DE'], ['Stuttgart', 48.776, 9.183, 'DE'],
  ['Dresden', 51.05, 13.737, 'DE'], ['Köln', 50.938, 6.96, 'DE'], ['Leipzig', 51.34, 12.375, 'DE'], ['Nürnberg', 49.453, 11.077, 'DE'], ['Hannover', 52.375, 9.732, 'DE'],
  ['Bremen', 53.079, 8.802, 'DE'], ['Rostock', 54.092, 12.099, 'DE'], ['Freiburg', 47.999, 7.842, 'DE'], ['Erfurt', 50.985, 11.03, 'DE'], ['Kassel', 51.313, 9.497, 'DE'],
  ['Saarbrücken', 49.24, 6.997, 'DE'], ['Wien', 48.208, 16.373, 'AT'], ['Innsbruck', 47.269, 11.404, 'AT'], ['Zürich', 47.377, 8.54, 'CH'], ['Bern', 46.948, 7.447, 'CH'],
].map(([id, lat, lon, country]) => ({ id, lat, lon, country }));
const range = stackFile ? JSON.parse(readFileSync(stackFile, 'utf8')).range : { maxKm: 5, maxDElevM: 50 };

const q = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');

/** The engine's own choice of the station value's measurement (cubeSource.ts: newest T, then byStation, then distance), distance rule only. */
function stationValuePick(cs, nowMs) {
  let best = null;
  for (const o of cs) {
    if (o.validAtMs > nowMs || o.temperature == null) continue;
    if (!(Math.max(0, o.distanceM) / 1000 <= range.maxKm)) continue;
    if (!best || o.validAtMs > best.validAtMs || (o.validAtMs === best.validAtMs && ((!!o.byStation && !best.byStation) || (!!o.byStation === !!best.byStation && o.distanceM < best.distanceM)))) best = o;
  }
  return best;
}

function measure(store, pts, nowMs, perVar) {
  const r = { n: pts.length, withT: 0, withWind: 0, distT: [], ageT: [], meas: 0, three: 0, picks: new Map(), tIds: [] };
  for (const p of pts) {
    const list = nearestObsStations(store, p.lat, p.lon, p.country, { max: OBS_DENSE_MAX, nowMs, dense: true, ...(perVar ? { perVar: 'split' } : {}) });
    const cs = cubeObsOf(list, nowMs);
    r.meas += cs.length;
    if (list.some((x) => (x.parts?.length ?? 0) >= 2)) r.three += 1;
    const t = cs.filter((o) => o.temperature != null).sort((a, b) => a.distanceM - b.distanceM)[0];
    if (t) { r.withT += 1; r.tIds.push(p.id); r.distT.push(t.distanceM / 1000); r.ageT.push((nowMs - t.validAtMs) / 60_000); }
    if (cs.some((o) => o.u != null)) r.withWind += 1;
    const pick = stationValuePick(cs, nowMs);
    if (pick) r.picks.set(p.id, { id: pick.stationId, km: pick.distanceM / 1000, ageMin: (nowMs - pick.validAtMs) / 60_000 });
  }
  return r;
}

const rows = [];
for (const [sha, , window] of COMMITS) {
  const s7 = sha.slice(0, 7);
  const catalog = parseObsCatalog(JSON.parse(readFull(`${s7}.stations.json`)));
  const latest = parseObsLatest(JSON.parse(readFull(`${s7}.latest.json`)));
  const nowMs = Date.parse(latest.builtAt);
  const store = obsStoreOf(catalog, latest, nowMs);
  rows.push({ s7, window, builtAt: latest.builtAt, axis: { old: measure(store, axis, nowMs, false), neu: measure(store, axis, nowMs, true) }, city: { old: measure(store, CITIES, nowMs, false), neu: measure(store, CITIES, nowMs, true) } });
}

const pc = (a, b) => `${(100 * a / b).toFixed(1)} %`;
const line = (m) => `${pc(m.withT, m.n)} | ${f1(q(m.distT, 0.5))} / ${f1(q(m.distT, 0.9))} | ${f1(q(m.ageT, 0.5))} / ${f1(q(m.ageT, 0.9))} | ${pc(m.withWind, m.n)}`;
console.log(`Achspunkte ${axis.length}, Stadtpunkte ${CITIES.length}; dichter Satz (${OBS_DENSE_MAX} Stationen), Uhr = builtAt der Version\n`);
console.log('| Version | Fenster | Leser | Achspunkte mit T | nächste T-Station km p50 / p90 | Alter dieser T min p50 / p90 | Achspunkte mit Wind | Städte mit T |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) for (const [name, k] of [['vor V-AF-9', 'old'], ['je Größe', 'neu']]) console.log(`| \`${r.s7}\` ${r.builtAt.slice(11, 16)} | ${r.window.replace(/ \(.*/, '')} | ${name} | ${line(r.axis[k])} | ${r.city[k].withT}/${r.city[k].n} |`);

// gate, good-window identity, fallback rate, station-value pick
const good = rows.filter((r) => r.window === 'good'), bad = rows.filter((r) => r.window !== 'good');
const minNew = Math.min(...rows.map((r) => r.axis.neu.withT / r.axis.neu.n));
console.log(`\nGate B: neuer Leser ≥ 99 % der Achspunkte mit T in JEDER Version: ${minNew >= 0.99 ? 'BESTANDEN' : 'NICHT BESTANDEN'} (Minimum ${(100 * minNew).toFixed(2)} %).`);
console.log(`Negativkontrolle: alter Leser in den schlechten Fenstern ${bad.map((r) => pc(r.axis.old.withT, r.axis.old.n)).join(', ')}; in den guten ${good.map((r) => pc(r.axis.old.withT, r.axis.old.n)).join(', ')}.`);
console.log(`Städte mit T beim Leser vor V-AF-9 in den schlechten Fenstern: ${bad.map((r) => `${r.s7} ${r.city.old.tIds.join('/')}`).join(', ')}.`);
console.log(`Gutes Fenster, T-Sicht alt = neu: ${good.map((r) => `${r.s7} ${r.axis.old.withT === r.axis.neu.withT && q(r.axis.old.distT, 0.5) === q(r.axis.neu.distT, 0.5) ? 'gleich' : 'VERSCHIEDEN'}`).join(', ')}.`);
console.log(`Achspunkte OHNE T im neuen Satz (dort griffe der BrightSky-Rückfall je Größe): ${rows.map((r) => `${r.s7} ${r.axis.neu.n - r.axis.neu.withT}`).join(', ')}.`);
console.log(`Messungen je Achspunkt (Mittel) alt → neu: ${rows.map((r) => `${r.s7} ${(r.axis.old.meas / r.axis.old.n).toFixed(1)} → ${(r.axis.neu.meas / r.axis.neu.n).toFixed(1)}`).join(', ')}; Achspunkte mit einer Station an drei Stempeln: ${rows.map((r) => `${r.s7} ${r.axis.neu.three}`).join(', ')}.`);

// Falle c: the station value's measurement — new reader in every version against the good-window version before it
console.log(`\nFalle c — Wahl des Stationswerts (jüngste T-Messung ≤ ${range.maxKm} km, dann Nähe; ohne Höhenregel und ohne byStation):`);
for (const set of ['axis', 'city']) {
  let ref = null;
  for (const r of rows) {
    const cur = r[set].neu.picks;
    if (r.window === 'good') { ref = { s7: r.s7, picks: cur }; }
    const oldPicks = r[set].old.picks;
    let same = 0, diff = 0, onlyRef = 0, onlyCur = 0, farther = 0;
    const names = [];
    // the same version: where the reader before V-AF-9 has a choice, does the per-variable reader choose another station?
    const sameVersionDiff = [...oldPicks].filter(([id, a]) => cur.get(id)?.id !== a.id).length;
    if (ref) {
      for (const [id, a] of ref.picks) { const b = cur.get(id); if (!b) onlyRef += 1; else if (b.id === a.id) same += 1; else { diff += 1; names.push(`${id} ${a.id} (${a.km.toFixed(1)} km) → ${b.id} (${b.km.toFixed(1)} km)`); if (b.km > a.km) farther += 1; } }
      for (const id of cur.keys()) if (!ref.picks.has(id)) onlyCur += 1;
    }
    console.log(`  ${set === 'axis' ? 'Achse' : 'Städte'} ${r.s7} ${r.builtAt.slice(11, 16)} (${r.window.replace(/ \(.*/, '')}): Punkte mit Wahl neu ${cur.size} (alt ${oldPicks.size})${ref ? ` · gegen das gute Fenster ${ref.s7}: gleiche Station ${same}, ANDERE Station ${diff} (davon weiter entfernt ${farther}), nur im guten Fenster ${onlyRef}, nur jetzt ${onlyCur}` : ''} · in DERSELBEN Version neu ≠ alt (wo alt wählt): ${sameVersionDiff}${names.length && names.length <= 3 ? ` · ${names.join('; ')}` : ''}`);
  }
}
if (MD) console.log('\n(Ausgabe als Markdown-Tabelle oben.)');
