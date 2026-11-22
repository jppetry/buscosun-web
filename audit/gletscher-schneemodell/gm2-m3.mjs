// Phase GM, measurement M-3 (read-only): buscosun Fusion at mountain stations near glaciers, asked the way the glacier producer asks
// (flat terrain at the station's elevation), A = without the point's elevation for the station choice (producer today: `terrain: false`),
// B = with it (the engine's own rule ±100 m is then checked). Against the measured temperature of the hour 21.11. 17 UTC.
import { readFileSync } from 'node:fs';
import { makeIo, dirStore, geoBackend } from 'file:///C:/dev/buscosun-web/scripts/road/road-forecast.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from 'file:///C:/dev/buscosun-web/src/pointForecast/cubeSource.ts';
import { terrainScales } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/terrainScale.ts';
import { installNodeShims } from 'file:///C:/dev/buscosun-web/scripts/punktarchiv/lib/nodeShims.mjs';

installNodeShims();
const H = 3_600_000;
const CUBE = 'C:/dev/buscosun-glacier-cache/gs/cube', V1 = 'C:/dev/buscosun-glacier-cache/gs/view/glacier/v1';
const nowMs = Date.parse('2026-11-21T17:50:00Z'), t0 = Math.floor(nowMs / H) * H;
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cat = new Map(J(`${V1}/stn/stations.json`).stations.map((s) => [s.id, s]));
const hour = J(`${V1}/stn/h/2026112117.json`);
const minElev = Number(process.argv[2] ?? 1800);
const flat = (h, lat, lon) => ({ elevationM: h, tpi500M: 0, tpi2000M: 0, svf: 1, slopeDeg: 0, aspectDeg: null, horizonDeg: new Array(8).fill(0), scales: terrainScales(() => h, lon, lat), sinkDepthM: 0 });
const enc = new TextEncoder();
/** A result cache that answers every terrain question with the flat terrain of the current point (what the producer hands in as override). */
let current = null;
const flatCache = { kind: 'gm2-flat', async get(k) { return k.startsWith('terrain/') && current ? { bytes: enc.encode(JSON.stringify({ ...current, tiles: { near: 0, far: 0, failed: 0, bytes: 0, fromCache: 0 } })), storedAt: 0 } : null; }, async put() {}, async sweep() { return 0; } };
const io0 = makeIo({ store: dirStore(CUBE), cache: geoBackend(null), nowMs });
const rows = [];
const entries = Array.isArray(hour.stations) ? hour.stations : Object.entries(hour.stations);
for (const [id, e] of entries) {
  const s = cat.get(id); const meas = e?.v?.t;
  if (!s || !Number.isFinite(meas) || !(s.elev >= minElev) || e.t !== '2026-11-21T17:00:00.000Z') continue;
  const country = s.country === 'IT' ? 'AT' : s.country;
  const out = { id, name: s.name, elev: s.elev, meas };
  for (const variant of ['A', 'B']) {
    current = flat(s.elev, s.lat, s.lon);
    clearCubeForecastCache();
    const io = variant === 'A' ? { ...io0, terrain: false, terrainOverride: current } : { ...io0, terrain: { decodeRgba: io0.terrain.decodeRgba, cache: flatCache }, terrainOverride: current };
    try {
      const fc = await getPointForecastFromCube({ lat: s.lat, lng: s.lon, country, hours: 24, pointSource: 'cube', includeRadarNowcast: false }, io);
      const st = fc.cube.v2.axis.steps.find((x) => x.validAtMs === t0);
      const mos = st?.vars?.t2m?.members?.find((m) => m.tag === 'mosmix');
      const pv = fc.cube.v2.provenance;
      out[variant] = { t: st?.vars?.t2m?.mean ?? null, w: mos?.weight ?? 0, stn: pv.station ? `${pv.station.name} ${pv.station.elevM} m ${pv.station.distKm.toFixed(1)} km` : null, dz: pv.station ? pv.station.elevM - s.elev : null, why: pv.station ? null : String(pv.stationReason ?? '').slice(0, 60) };
    } catch (err) { out[variant] = { error: String(err?.message ?? err).slice(0, 80) }; }
  }
  rows.push(out);
}
const ok = rows.filter((r) => Number.isFinite(r.A?.t) && Number.isFinite(r.B?.t));
const stat = (list, k) => { const d = list.map((r) => r[k].t - r.meas); const n = d.length; if (!n) return null; const bias = d.reduce((a, b) => a + b, 0) / n; const mae = d.reduce((a, b) => a + Math.abs(b), 0) / n; return { n, bias: +bias.toFixed(2), mae: +mae.toFixed(2) }; };
const changed = ok.filter((r) => r.A.stn && !r.B.stn);          // a station carried in A and is rejected in B
const same = ok.filter((r) => !(r.A.stn && !r.B.stn));
const far = changed.filter((r) => Math.abs(r.A.dz) > 300);
console.log(JSON.stringify({ stations: rows.length, usable: ok.length, all: { A: stat(ok, 'A'), B: stat(ok, 'B') }, rejectedInB: { A: stat(changed, 'A'), B: stat(changed, 'B') }, rejectedInB_dzOver300: { A: stat(far, 'A'), B: stat(far, 'B') }, unchanged: { A: stat(same, 'A'), B: stat(same, 'B') } }, null, 1));
for (const r of changed.sort((a, b) => Math.abs(b.A.dz) - Math.abs(a.A.dz)).slice(0, 25)) console.log(`${r.name} ${r.elev} m gemessen ${r.meas} | A ${r.A.t.toFixed(1)} (${r.A.stn}, Gewicht ${r.A.w}, Δz ${r.A.dz}) | B ${r.B.t.toFixed(1)} (${r.B.why})`);
// detail: what differs between A and B
const diff = ok.filter((r) => Math.abs(r.A.t - r.B.t) > 0.05);
console.log('rows with A != B:', diff.length, '| A with station:', ok.filter((r) => r.A.stn).length, '| B with station:', ok.filter((r) => r.B.stn).length);
const grp = (name, list) => console.log(name, JSON.stringify({ A: stat(list, 'A'), B: stat(list, 'B') }));
grp('A != B', diff); grp('A == B', ok.filter((r) => !diff.includes(r)));
grp('A != B, |dz| > 300', diff.filter((r) => Math.abs(r.A.dz ?? 0) > 300)); grp('A != B, |dz| <= 300', diff.filter((r) => Math.abs(r.A.dz ?? 0) <= 300));
for (const r of diff.sort((a, b) => Math.abs(b.A.dz ?? 0) - Math.abs(a.A.dz ?? 0)).slice(0, 30)) console.log(`${r.name} ${r.elev} m gemessen ${r.meas} | A ${r.A.t.toFixed(1)} (${r.A.stn ?? r.A.why}, w ${r.A.w}, dz ${r.A.dz}) | B ${r.B.t.toFixed(1)} (${r.B.stn ?? r.B.why}, w ${r.B.w})`);
