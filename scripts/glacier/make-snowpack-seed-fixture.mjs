#!/usr/bin/env node
/**
 * Phase GM, GM-3c — fixture of verify:glacier-snowpack, block F: forcing of the spin-up in the SHAPE and with the VALUES of its sources, cut from the cache of a
 * real run of `snowpack-seed.mjs` (nothing is invented here).
 *
 *   node scripts/glacier/make-snowpack-seed-fixture.mjs --cache=<cache of snowpack-seed.mjs> [--hours=720] [--inca=0,1] [--swiss=<glacier id>]
 *
 *   inca    the answer of GeoSphere Austria `inca-v2-1h-1km` (CC BY 4.0) for two points, the first `hours` stamps: `timestamps` and `features[].properties.parameters`
 *   daily   one Swiss glacier point of the MeteoSwiss daily grids (CC BY 4.0, Quelle: MeteoSchweiz) as `py/snowcal_grid.py` reads them: precipitation, mean /
 *           minimum / maximum temperature, relative sunshine duration per day — including a day the source does not have
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const cache = arg('cache'), hours = Number(arg('hours', '720')), pick = arg('inca', '0,1').split(',').map(Number);
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const incaFile = readdirSync(join(cache, 'inca')).filter((f) => /-0\.json$/.test(f)).sort()[0];
const inca = J(join(cache, 'inca', incaFile));
const cut = (a) => a.slice(0, hours);
const features = pick.map((i) => { const f = inca.features[i]; return { type: 'Feature', geometry: f.geometry, properties: { parameters: Object.fromEntries(['tp', '2t', 'ssrd'].map((k) => [k, { name: f.properties.parameters[k].name, unit: f.properties.parameters[k].unit, data: cut(f.properties.parameters[k].data) }])) } }; });
const grids = Object.fromEntries(['p', 't', 'tn', 'tx', 'sun'].map((v) => [v, J(join(cache, 'chgrid', `grid-${v}.json`))]));
const points = J(join(cache, 'chgrid', 'points.json'));
const id = arg('swiss', points[0].key), pt = points.find((p) => p.key === id);
const dates = [...new Set(Object.values(grids).flatMap((g) => g.dates))].sort();
const days = []; for (let ms = Date.parse(`${dates[0]}T00:00:00Z`); ms <= Date.parse(`${dates[dates.length - 1]}T00:00:00Z`); ms += 86_400_000) days.push(new Date(ms).toISOString().slice(0, 10));
const col = (v) => { const g = grids[v], at = new Map(g.dates.map((d, i) => [d, i])); return days.map((d) => { const i = at.get(d); const x = i == null ? null : g.points[id].p[i]; return x == null ? null : x; }); };
const out = {
  what: 'forcing of the snowpack spin-up in the shape of its sources, cut from a real run (make-snowpack-seed-fixture.mjs)', madeAt: new Date().toISOString(),
  licences: ['GeoSphere Austria, INCA analysis hourly (inca-v2-1h-1km), CC BY 4.0', 'MeteoSchweiz, ogd-surface-derived-grid (RhiresD/RprelimD, TabsD, TminD, TmaxD, SrelD), CC BY 4.0, Quelle: MeteoSchweiz'],
  inca: { media_type: inca.media_type, type: inca.type, timestamps: cut(inca.timestamps), features },
  daily: { id, day0: days[0], lat: pt.lat, lon: pt.lon, z: pt.z?.[1] ?? null, p: col('p'), t: col('t'), tn: col('tn'), tx: col('tx'), sun: col('sun') },
};
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'fixtures', 'glacier', 'snowpack-seed.json');
writeFileSync(file, JSON.stringify(out));
console.log(file, `${JSON.stringify(out).length} B`, 'INCA', out.inca.timestamps.length, 'h ×', features.length, 'points; daily', days.length, 'days, missing', out.daily.p.map((v, i) => (v == null ? days[i] : null)).filter(Boolean).join(' '));
