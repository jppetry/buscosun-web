/**
 * Beziehung eines Ortes zu den Modulen (Seewetter, Pegel, Autobahn, Gletscher) — gemeinsam für
 * `fetch-place-modules.mjs` (bestehende Ortsseiten) und `select-new-places.mjs` (Kandidaten).
 * Schwellen: `placeRules.mjs`. Build-only, liest die lokalen Klone der Daten-Repos.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { distKm } from './geo.mjs';
import { MODULES } from '../placeRules.mjs';

const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const r1 = (v) => Math.round(v * 10) / 10;

export function loadModuleCatalogs(dataDir, glacierDir) {
  const glacBuild = readdirSync(join(glacierDir, 'v1/static')).sort().pop();
  return {
    spots: J(join(dataDir, 'sea/v1/static/spots.json')).spots,
    gauges: J(join(dataDir, 'sea/v1/static/gauges.json')).gauges,
    stations: Object.values(J(join(dataDir, 'road/v1/static/stations.json')).stations).filter((s) => s.kind === 'A' && s.lat != null),
    corridors: J(join(dataDir, 'road/v1/static/corridors.json')).corridors,
    glaciers: J(join(glacierDir, 'v1/static', glacBuild, 'catalog.json')).glaciers,
    glacBuild,
  };
}

/** `{ sea?, road?, glaciers? }` — nur, was die Relevanzregel erlaubt. */
export function relationsFor(p, cat) {
  const { seaKm, gaugeKm, roadKm, stationKm, glacierKm, glacierMinKm2, glacierMax } = MODULES;
  const rec = {};
  const sp = cat.spots.filter((s) => s.kinds.some((k) => k !== 'revier')).map((s) => [distKm(p.lat, p.lon, s.lat, s.lon), s]).sort((a, b) => a[0] - b[0])[0];
  if (sp && sp[0] <= seaKm) {
    const g = cat.gauges.map((x) => [distKm(p.lat, p.lon, x.lat, x.lon), x]).sort((a, b) => a[0] - b[0])[0];
    rec.sea = {
      spot: { id: sp[1].id, name: sp[1].name, lat: sp[1].lat, lon: sp[1].lon, km: r1(sp[0]), region: sp[1].region, kinds: sp[1].kinds, seaArea: sp[1].seaArea?.name ?? null, coast: sp[1].coast?.name ?? null },
      gauge: g && g[0] <= gaugeKm ? { id: g[1].id, name: g[1].name, lat: g[1].lat, lon: g[1].lon, km: r1(g[0]), url: g[1].url ?? null } : null,
    };
  }
  let cd = Infinity, cr = null;
  for (const c of cat.corridors) for (const q of c.line) { const d = distKm(p.lat, p.lon, q[1], q[0]); if (d < cd) { cd = d; cr = c; } }
  const st = cat.stations.map((s) => [distKm(p.lat, p.lon, s.lat, s.lon), s]).sort((a, b) => a[0] - b[0])[0];
  if (cd <= roadKm && st && st[0] <= stationKm) {
    rec.road = { corridor: { id: cr.id, road: cr.road, title: cr.title, km: r1(cd) }, station: { name: st[1].n, road: st[1].road, lat: st[1].lat, lon: st[1].lon, km: r1(st[0]), roadKm: st[1].km ?? null } };
  }
  const gl = cat.glaciers
    .filter((g) => (g.area?.km2 ?? 0) >= glacierMinKm2)
    .map((g) => [distKm(p.lat, p.lon, g.lat, g.lon), g])
    .filter(([d]) => d <= glacierKm)
    .sort((a, b) => a[0] - b[0])
    .slice(0, glacierMax)
    .map(([d, g]) => ({ id: g.id, name: g.name, country: g.country, lat: g.lat, lon: g.lon, km: r1(d), areaKm2: Math.round(g.area.km2 * 100) / 100, areaYear: g.area.refYear, areaSource: g.area.source }));
  if (gl.length) rec.glaciers = gl;
  return rec;
}
