// AF-3 gate: a sample of axis points against a FRESH Overpass query per point — independent of the extract the builder
// read (own query, no tile merge, no outline filter). For every sampled point: the nearest OSM way that is carriageway
// of the point's motorway (highway=motorway, or highway=trunk with that number) and its distance to the point.
// A snapped point is a foot on such a way rounded to 5 decimals — it must lie within a few metres of it.
//
//   node audit/autobahn-fusion12-lueckenlos/af3-sample-osm.mjs --points=<points.json> --corridors=<corridors.json>
//        [--prev=<published points.json>] [--every=8] [--every-kept=300] [--ids=a26@20,…  only these points]
// Read-only. Prints one line per point and a summary as JSON.
import { readFileSync } from 'node:fs';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const HOSTS = ['https://lz4.overpass-api.de/api/interpreter', 'https://z.overpass-api.de/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const UA = 'buscosun-road-fc-points (buscosun-web/audit/autobahn-fusion12-lueckenlos.md)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = 6_371_000, RAD = Math.PI / 180;
const refs = (tags) => String(tags?.ref ?? '').split(/[;,/]+/).map((s) => s.replace(/\s+/g, '').toUpperCase()).filter(Boolean);
function dist(p, a, b) {
  const kx = Math.cos(p[1] * RAD) * RAD * R, ky = RAD * R;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
async function ask(q) {
  for (let i = 0; i < 9; i++) {
    try {
      const r = await fetch(HOSTS[i % HOSTS.length], { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA }, body: 'data=' + encodeURIComponent(q) });
      if (r.ok) { const j = await r.json(); if (!j.remark) return j; }
    } catch { /* next host */ }
    await sleep(4000);
  }
  return null;
}

const points = JSON.parse(readFileSync(arg('points'), 'utf8')).points.filter((p) => p.kind === 'axis');
const road = new Map(JSON.parse(readFileSync(arg('corridors'), 'utf8')).corridors.map((c) => [c.id, c.road]));
const prev = arg('prev') ? new Set(JSON.parse(readFileSync(arg('prev'), 'utf8')).points.map((p) => p.id)) : new Set();
const fresh = points.filter((p) => !prev.has(p.id)), kept = points.filter((p) => prev.has(p.id));
const pick = (list, every) => list.filter((_, i) => i % every === Math.floor(every / 2));
const only = arg('ids') ? new Set(arg('ids').split(',')) : null;
const sampleAll = [...pick(fresh, Number(arg('every', 8))).map((p) => ({ ...p, set: 'neu' })), ...pick(kept, Number(arg('every-kept', 300))).map((p) => ({ ...p, set: 'übernommen' }))];
const sample = only ? points.filter((p) => only.has(p.id)).map((p) => ({ ...p, set: prev.has(p.id) ? 'übernommen' : 'neu' })) : sampleAll;
const rows = [];
let base = null;
for (const p of sample) {
  const own = road.get(p.corridor);
  const j = await ask(`[out:json][timeout:25];way(around:1100,${p.lat},${p.lon})[highway~"^(motorway|trunk)$"];out tags geom;`);
  if (!j) { rows.push({ id: p.id, set: p.set, error: 'keine Antwort' }); console.log(p.id, 'keine Antwort'); continue; }
  base = j.osm3s?.timestamp_osm_base ?? base;
  let best = null;
  for (const w of j.elements) {
    const rf = refs(w.tags), carriage = w.tags.highway === 'motorway' || rf.some((r) => /^A\d/.test(r));
    if (!carriage) continue;
    const isOwn = rf.includes(own);
    for (let i = 1; i < w.geometry.length; i++) {
      const d = dist([p.lon, p.lat], [w.geometry[i - 1].lon, w.geometry[i - 1].lat], [w.geometry[i].lon, w.geometry[i].lat]);
      if (!best || (isOwn && !best.own) || (isOwn === best.own && d < best.d)) best = { d, own: isOwn, ref: w.tags.ref ?? '—', highway: w.tags.highway, tunnel: w.tags.tunnel ?? null };
    }
  }
  const row = { id: p.id, set: p.set, road: own, snap: p.snap, osmRef: p.osmRef ?? null, d: best ? Math.round(best.d * 10) / 10 : null, own: best?.own ?? false, ref: best?.ref ?? null, highway: best?.highway ?? null, tunnel: best?.tunnel ?? null };
  rows.push(row);
  console.log(JSON.stringify(row));
  await sleep(1200);
}
const ok = rows.filter((r) => r.d != null && r.d <= 3 && (r.own || r.osmRef));
console.log(JSON.stringify({ osmBase: base, sampled: rows.length, neu: rows.filter((r) => r.set === 'neu').length, onOwnCarriageway: ok.length, notOk: rows.filter((r) => !ok.includes(r)).map((r) => r.id) }));
