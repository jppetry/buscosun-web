// M4 on the real slot 06.10. 19:00 UTC: which stations stop anchoring the route forecast, and with what offset
// (measured air − unanchored model T2m of run 2610061831, step 1) they anchored before. Usage: node … m4.mjs <binDir> <stations.json> <fcFlatDir>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const APP = 'C:/dev/buscosun-web';
const imp = (p) => import(pathToFileURL(join(APP, p)).href);
const { decodeSwisFile } = await imp('src/road/swisBufr.ts');
const NEW = await imp('src/road/roadContract.ts');
const OLD = await import(pathToFileURL(join(import.meta.dirname, 'head/roadContract.ts')).href);
const { makeInDE } = await imp('scripts/road/deMask.mjs');
const { elevOf } = await imp('scripts/road/road-derive.mjs');
const { unanchoredT } = await imp('scripts/road/road-fc-ref.mjs');
const { swisTable } = await imp('scripts/road/road-forecast.mjs');
const { parseRoadFcFile } = await imp('src/road/roadFc.ts');
const { readStationPositions, stationPosition } = await imp('scripts/road/station-positions.mjs');
const [binDir, catFile, fcDir] = process.argv.slice(2);
const slotMs = Date.UTC(2026, 9, 6, 19, 0);
const cat = JSON.parse(readFileSync(catFile, 'utf8')).stations;
const catalog = Object.fromEntries(Object.entries(cat).map(([id, s]) => [id, { road: s.roadRaw ?? s.road ?? null, dir: s.dir ?? null, lat: s.lat ?? null, lon: s.lon ?? null, km: s.km ?? null, h: s.h ?? null }]));
const cubeT2m = {}, stationPts = [];
for (const f of readdirSync(fcDir).filter((f) => f.endsWith(".json") && !f.startsWith("where"))) {
  const doc = parseRoadFcFile(JSON.parse(readFileSync(join(fcDir, f), 'utf8')));
  if (!doc) continue;
  const step = Math.round((slotMs - doc.t0Ms) / 3_600_000);
  for (const p of doc.points) if (p.kind === 'station') { stationPts.push(p); const v = unanchoredT(p, step); if (v != null) cubeT2m[p.id] = Math.round(v * 10) / 10; }
}
const positions = readStationPositions();
const stations = [], groups = {};
for (const f of readdirSync(binDir).filter((f) => f.endsWith('.bin'))) {
  const gid = f.slice(0, -4);
  const recs = decodeSwisFile(new Uint8Array(readFileSync(join(binDir, f)))).records;
  groups[gid] = { state: 'ok', ageMin: 0, stations: recs.length };
  for (const r of recs) {
    if (!r.id) continue;
    const c = catalog[r.id];
    const pos = r.lat != null ? stationPosition(positions, r.id, { lat: r.lat, lon: r.lon }, c ? { lat: c.lat, lon: c.lon } : null) : null;
    stations.push({ id: r.id, group: gid, name: r.name, highway: r.highway, km: r.km, lat: pos ? pos.lat : r.lat, lon: pos ? pos.lon : r.lon,
      elevM: elevOf(r.elevM, c), obsMs: r.obsMs, airT: r.airT, dewT: r.dewT, rh: r.rh, visM: r.visM,
      sensors: r.sensors.map((s) => ({ roadT: s.roadT, filmMm: s.filmMm, cond: s.cond })), windMs: r.windMs, gustMs: r.gustMs, windDir: r.windDir,
      precipType: r.precipType, precipRateMmH: r.precipRateMmH, precipMm: r.precipMm, precipIntensity: r.precipIntensity, quality: r.quality });
  }
}
const run = (C) => C.validateRoadSlot({ slotMs, stations: structuredClone(stations), catalog, catalogEtag: 'x', catalogState: 'ok', prev: null, inDE: makeInDE(), cubeT2m, groups, createdAt: 'x' });
const a = run(OLD), b = run(NEW);
const ta = swisTable(a.obs.points.filter((r) => r.t === slotMs), cat, stationPts);
const tb = swisTable(b.obs.points.filter((r) => r.t === slotMs), cat, stationPts);
const ptB = Object.fromEntries(b.obs.points.map((p) => [p.id, p]));
const out = [...ta.keys()].filter((id) => !tb.has(id)).map((id) => {
  const m = ta.get(id), ref = cubeT2m[id];
  return { id, n: m.name, ta: m.ta, model: ref ?? null, off: ref != null ? Math.round((m.ta - ref) * 10) / 10 : null, why: ptB[id]?.x?.ta ?? JSON.stringify(ptB[id]?.o ?? {}) };
}).sort((x, y) => Math.abs(y.off ?? 0) - Math.abs(x.off ?? 0));
const offs = [...tb.values()].map((m) => (cubeT2m[m.id] != null ? Math.abs(m.ta - cubeT2m[m.id]) : null)).filter((v) => v != null).sort((x, y) => x - y);
console.log('anchor table old', ta.size, 'new', tb.size, 'excluded', out.length, ' cube rule hits new', b.balance.observe.cube ?? 0);
console.log('kept |offset| p50/p99/max', offs[Math.floor(offs.length / 2)]?.toFixed(1), offs[Math.floor(offs.length * 0.99)]?.toFixed(1), offs.at(-1)?.toFixed(1));
for (const o of out) console.log(` ${o.id} ${o.n} air ${o.ta} model ${o.model} offset ${o.off} — ${o.why}`);
