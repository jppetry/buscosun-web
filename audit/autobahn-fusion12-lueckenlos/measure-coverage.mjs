// Read-only measurement for audit/autobahn-fusion12-lueckenlos.md: what does the corridor builder give without the
// station filter and with a lower minimum section length, and how much of the DLM250 motorway axis is then covered?
// A patched COPY of scripts/road/build-corridors.mjs is written next to this file; the repo is not touched.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [, , repo, stationsFile, obsFile, cacheFile, liveFile] = process.argv;
const roadDir = join(repo, 'scripts', 'road');
let src = readFileSync(join(roadDir, 'build-corridors.mjs'), 'utf8');
const rep = (a, b) => { if (!src.includes(a)) throw new Error(`pattern not found: ${a}`); src = src.replace(a, b); };
rep(`from './deMask.mjs'`, `from '${pathToFileURL(join(roadDir, 'deMask.mjs')).href}'`);
rep(`return out.filter((c) => lengthKm(c) >= 5);`, `return out.filter((c) => lengthKm(c) >= (globalThis.__MIN ?? 5));`);
rep(`const regular = built.filter((c) => c.stations.length > 0)`, `const regular = built.filter((c) => globalThis.__ALL || c.stations.length > 0)`);
const patched = join(HERE, 'build-corridors.patched.mjs');
writeFileSync(patched, src);
const B = await import(pathToFileURL(patched).href);
const { loadDeRings } = await import(pathToFileURL(join(roadDir, 'deMask.mjs')).href);

const axes = JSON.parse(readFileSync(cacheFile, 'utf8'));
const stations = JSON.parse(readFileSync(stationsFile, 'utf8')).stations;
const obsPoints = JSON.parse(readFileSync(obsFile, 'utf8')).points;
const places = JSON.parse(readFileSync(join(repo, 'public', 'fire', 'places-dach.json'), 'utf8')).places;
const deRings = loadDeRings();
const live = JSON.parse(readFileSync(liveFile, 'utf8')).corridors;

const km = (a, b) => { const kx = 111.2 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111.2); };
const lineKm = (l) => { let s = 0; for (let i = 1; i < l.length; i++) s += km(l[i - 1], l[i]); return s; };

// DLM250 samples every 0.5 km per feature line, tagged with the road numbers.
const samples = [];
for (const f of axes.features) {
  const g = f.geometry;
  const ls = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const roads = B.roadsOf(f);
  if (!roads.length) continue;
  for (const l of ls) {
    let acc = 0, next = 0;
    for (let i = 1; i < l.length; i++) {
      const d = km(l[i - 1], l[i]);
      while (next <= acc + d && d > 0) { const t = (next - acc) / d; samples.push({ p: [l[i - 1][0] + t * (l[i][0] - l[i - 1][0]), l[i - 1][1] + t * (l[i][1] - l[i - 1][1])], roads }); next += 0.5; }
      acc += d;
    }
  }
}

const CELL = 0.02;
const key = (x, y) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
function indexOf(corridors) {
  const grid = new Map();
  for (const c of corridors) for (let i = 1; i < c.line.length; i++) {
    const a = c.line[i - 1], b = c.line[i];
    const n = Math.max(1, Math.ceil(km(a, b) / 0.5));
    for (let s = 0; s <= n; s++) {
      const k = key(a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n);
      if (!grid.has(k)) grid.set(k, []);
      const arr = grid.get(k);
      if (arr[arr.length - 1]?.a !== a) arr.push({ a, b, road: c.road });
    }
  }
  return grid;
}
function distKm(p, a, b) {
  const kx = 111.2 * Math.cos(p[1] * Math.PI / 180), ky = 111.2;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function coverage(corridors, maxKm = 0.3) {
  const grid = indexOf(corridors);
  let hit = 0;
  const miss = new Map();
  for (const s of samples) {
    const cx = Math.floor(s.p[0] / CELL), cy = Math.floor(s.p[1] / CELL);
    let ok = false;
    for (let i = -1; i <= 1 && !ok; i++) for (let j = -1; j <= 1 && !ok; j++) for (const seg of grid.get(`${cx + i}:${cy + j}`) ?? []) if (distKm(s.p, seg.a, seg.b) <= maxKm) { ok = true; break; }
    if (ok) hit++; else for (const r of s.roads) miss.set(r, (miss.get(r) ?? 0) + 0.5);
  }
  return { share: hit / samples.length, missKm: (samples.length - hit) * 0.5, miss };
}
const axisPoints = (corridors) => corridors.reduce((n, c) => { let k = Math.floor(c.lengthKm / 5 + 1e-9) + 1; if (c.lengthKm - (k - 1) * 5 > 2.5) k++; return n + k; }, 0);

console.log(`DLM250: ${axes.features.length} features, ${samples.length} samples (every 0.5 km), fetched ${axes.fetchedAt}`);
const variants = [
  ['live file (141)', null],
  ['rebuilt, stations only, >= 5 km', { all: false, min: 5 }],
  ['all sections, >= 5 km', { all: true, min: 5 }],
  ['all sections, >= 2 km', { all: true, min: 2 }],
  ['all sections, >= 1 km', { all: true, min: 1 }],
  ['all sections, >= 0.5 km', { all: true, min: 0.5 }],
];
let last = null;
for (const [name, v] of variants) {
  let cs;
  if (!v) cs = live;
  else { globalThis.__ALL = v.all; globalThis.__MIN = v.min; cs = B.buildCorridors({ axes, stations, obsPoints, places, deRings, spurs: true, isBuilt: null }); }
  const cov = coverage(cs);
  const noSt = cs.filter((c) => !c.stations.length);
  const roads = new Set(cs.map((c) => c.road));
  console.log(`${name}: ${cs.length} corridors on ${roads.size} roads, ${cs.reduce((s, c) => s + c.lengthKm, 0).toFixed(0)} km, without station ${noSt.length} (${noSt.reduce((s, c) => s + c.lengthKm, 0).toFixed(0)} km), < 5 km: ${cs.filter((c) => c.lengthKm < 5).length}, axis points ${axisPoints(cs)}, DLM250 samples within 300 m: ${(cov.share * 100).toFixed(2)} % (missing ${cov.missKm.toFixed(0)} km of axis)`);
  if (v) last = { cs, cov, name };
  if (v && v.all && v.min === 1) {
    const liveIds = new Map(live.map((c) => [c.id, c]));
    const same = cs.filter((c) => liveIds.has(c.id) && Math.abs(liveIds.get(c.id).lengthKm - c.lengthKm) < 0.05 && liveIds.get(c.id).stations.length === c.stations.length).length;
    console.log(`   ids: ${same}/${live.length} live corridors keep id, length and station count under plain renumbering`);
    console.log('   lengths of sections without station:', noSt.map((c) => c.lengthKm).sort((a, b) => a - b).map((x) => x.toFixed(1)).join(' '));
  }
}
console.log(`still missing with "${last.name}":`, [...last.cov.miss].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([r, k]) => `${r}:${k}`).join(' '));
