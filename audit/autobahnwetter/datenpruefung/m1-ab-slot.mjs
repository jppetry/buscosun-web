// A/B of the contract on one real slot: HEAD rules vs. working tree (M1–M3). Usage: node … ab.mjs <binDir> <stamp> <stations.json>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const APP = 'C:/dev/buscosun-web';
const { decodeSwisFile } = await import(pathToFileURL(join(APP, 'src/road/swisBufr.ts')).href);
const NEW = await import(pathToFileURL(join(APP, 'src/road/roadContract.ts')).href);
const OLD = await import(pathToFileURL(join(import.meta.dirname, 'head/roadContract.ts')).href);
const { makeInDE } = await import(pathToFileURL(join(APP, 'scripts/road/deMask.mjs')).href);
const { elevOf } = await import(pathToFileURL(join(APP, 'scripts/road/road-derive.mjs')).href);
const { readStationPositions, stationPosition } = await import(pathToFileURL(join(APP, 'scripts/road/station-positions.mjs')).href);
const [binDir, stamp, catFile] = process.argv.slice(2);
const slotMs = NEW.roadStampToMs(stamp);
const catFileJ = JSON.parse(readFileSync(catFile, 'utf8'));
const catalog = {};
for (const [id, s] of Object.entries(catFileJ.stations)) catalog[id] = { road: s.roadRaw ?? s.road ?? null, dir: s.dir ?? null, lat: s.lat ?? null, lon: s.lon ?? null, km: s.km ?? null, h: s.h ?? null };
const positions = readStationPositions();
const stations = [], groups = {};
for (const f of readdirSync(binDir).filter((f) => f.endsWith('.bin'))) {
  const gid = f.slice(0, -4);
  const recs = decodeSwisFile(new Uint8Array(readFileSync(join(binDir, f)))).records;
  groups[gid] = { state: 'ok', ageMin: 0, stations: recs.length };
  for (const r of recs) {
    if (!r.id) continue;
    const cat = catalog[r.id];
    const pos = r.lat != null && r.lon != null ? stationPosition(positions, r.id, { lat: r.lat, lon: r.lon }, cat ? { lat: cat.lat, lon: cat.lon } : null) : null;
    stations.push({
      id: r.id, group: gid, name: r.name, highway: r.highway, km: r.km, lat: pos ? pos.lat : r.lat, lon: pos ? pos.lon : r.lon,
      elevM: elevOf(r.elevM, cat), obsMs: r.obsMs, airT: r.airT, dewT: r.dewT, rh: r.rh, visM: r.visM,
      sensors: r.sensors.map((s) => ({ roadT: s.roadT, filmMm: s.filmMm, cond: s.cond })), windMs: r.windMs, gustMs: r.gustMs, windDir: r.windDir,
      precipType: r.precipType, precipRateMmH: r.precipRateMmH, precipMm: r.precipMm, precipIntensity: r.precipIntensity, quality: r.quality,
    });
  }
}
const inDE = makeInDE();
const run = (C) => C.validateRoadSlot({ slotMs, stations: structuredClone(stations), catalog, catalogEtag: 'x', catalogState: 'ok', prev: null, inDE, groups, createdAt: 'x' });
const a = run(OLD), b = run(NEW);
const cls = (r) => r.obs.points.reduce((m, p) => ((m[p.cls] = (m[p.cls] ?? 0) + 1), m), {});
console.log('stations', stations.length, 'points old/new', a.obs.points.length, b.obs.points.length);
console.log('classes old', JSON.stringify(cls(a)), '\nclasses new', JSON.stringify(cls(b)));
console.log('share old/new', a.balance.share.toFixed(4), b.balance.share.toFixed(4), 'publish', a.gate.publish, b.gate.publish);
console.log('byRule new', JSON.stringify(b.balance.byRule), '\nobserve new', JSON.stringify(b.balance.observe));
const byId = Object.fromEntries(a.obs.points.map((p) => [p.id, p]));
const changed = [];
for (const p of b.obs.points) {
  const q = byId[p.id];
  const diff = ['rs', 'ta', 'td', 'rh', 'wg', 'pr', 'cls', 'cond'].filter((f) => q[f] !== p[f]);
  if (diff.length) changed.push(`${p.id} ${p.n} ${diff.map((f) => `${f} ${q[f]}→${p[f]}`).join(', ')}${p.x ? ' ' + JSON.stringify(p.x) : ''}`);
}
console.log('changed points', changed.length);
for (const c of changed.filter((c) => !/^\S+ .* pr [\d.]+→null, ?$|pr [\d.]+→null \{"pr":"precipFill"\}$/.test(c))) console.log(' ', c);
console.log('precipFill', b.quarantine.entries.filter((e) => e.rule === 'precipFill').length, 'kept pr>0:', b.obs.points.filter((p) => p.pr > 0).map((p) => `${p.id} ${p.pr}`).join(' '));
console.log('frost/ice new:', b.obs.points.filter((p) => p.cls === 'frost' || p.cls === 'ice').map((p) => `${p.id} ${p.n} rs ${p.rs} ta ${p.ta} td ${p.td}`).join(' | ') || 'none');
console.log('marked o:', b.obs.points.filter((p) => p.o).length, JSON.stringify(b.obs.points.filter((p) => p.o).slice(0, 6).map((p) => [p.id, p.o])));
console.log('roundtrip', NEW.roadObsRoundTripOk(b.obs));
