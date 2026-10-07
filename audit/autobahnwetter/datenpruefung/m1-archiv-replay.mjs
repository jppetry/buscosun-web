// Archive replay of the M1/M2 rules: every slot of the half-day files (values after the OLD hard rules, 0.1 °C) through the
// working-tree contract, state chained across slots. Counts: frost/ice cells whose road (or dew point) the new rules reject,
// rejects per rule and station, the slot share. Usage: node … replay.mjs <archDir>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
const C = await import(pathToFileURL('C:/dev/buscosun-web/src/road/roadContract.ts').href);
const { makeInDE } = await import(pathToFileURL('C:/dev/buscosun-web/scripts/road/deMask.mjs').href);
const dir = process.argv[2];
const inDE = makeInDE();
const groups = Object.fromEntries(C.ROAD_GROUPS.filter((g) => !g.sporadic).map((g) => [g.id, { state: 'ok', ageMin: 0, stations: 1 }]));
let prev = null, slots = 0, frost = 0, frostRs = 0, frostTd = 0, maxShare = 0, values = 0, rejected = 0;
const left = [], byRule = {}, stByRule = {}, observe = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort()) {
  const j = JSON.parse(gunzipSync(readFileSync(join(dir, f))));
  j.slots.forEach((stamp, i) => {
    const slotMs = C.roadStampToMs(stamp);
    const stations = [], kOf = {};
    for (const [id, s] of Object.entries(j.stations)) {
      const k = s.k?.[i];
      if (!k || k === '-' || s.lat == null) continue;
      kOf[id] = k;
      stations.push({ id, group: s.g, name: s.n, highway: s.road, km: s.km, lat: s.lat, lon: s.lon, elevM: s.h, obsMs: slotMs,
        airT: s.ta[i], dewT: s.td[i], rh: null, visM: null, sensors: [{ roadT: s.rs[i], filmMm: null, cond: null }],
        windMs: null, gustMs: null, windDir: null, precipType: null, precipRateMmH: null, precipMm: null, quality: null });
    }
    const r = C.validateRoadSlot({ slotMs, stations, catalog: null, catalogEtag: null, catalogState: 'missing', prev, inDE, groups, createdAt: 'x' });
    prev = r.state; slots++;
    values += r.balance.values; rejected += r.balance.rejected; maxShare = Math.max(maxShare, r.balance.share);
    for (const e of r.quarantine.entries) {
      if (e.observe) { observe[e.rule] = (observe[e.rule] ?? 0) + 1; continue; }
      byRule[e.rule] = (byRule[e.rule] ?? 0) + 1; (stByRule[e.rule] ??= new Set()).add(e.id);
    }
    const pts = Object.fromEntries(r.obs.points.map((p) => [p.id, p]));
    for (const [id, k] of Object.entries(kOf)) {
      if (k !== 'f' && k !== 'i') continue;
      frost++;
      const p = pts[id];
      if (!p || p.rs == null) frostRs++;
      else if (p.td == null && j.stations[id].td[i] != null) frostTd++;
      else left.push(`${id} ${j.stations[id].n} ${stamp} rs ${p.rs} ta ${p.ta} td ${p.td}`);
    }
  });
}
console.log('slots', slots, 'values', values, 'rejected (new rules on top)', rejected, 'max slot share', maxShare.toFixed(4));
console.log('rejects', JSON.stringify(byRule), '\nstations', JSON.stringify(Object.fromEntries(Object.entries(stByRule).map(([k, v]) => [k, v.size]))));
console.log('observe', JSON.stringify(observe));
console.log('frost/ice cells', frost, 'road rejected', frostRs, 'dew point rejected', frostTd, 'left', left.length);
for (const l of left) console.log('  left', l);
for (const [rule, set] of Object.entries(stByRule)) console.log(' ', rule, [...set].slice(0, 30).join(' '));
