/**
 * ax1-obs-check.mjs — AX-1 (V-FS-15): which measurements reach the cube path, and is one of them AT the point?
 *
 * Runs the browser's own fetcher (`fetchCubeObs`) for a set of city points, lists the stations it returns with their
 * distance, and checks against the station catalog of the data repo whether the point's MOSMIX station (≤ 5 km, |Δh| ≤ 50 m,
 * the range of the station-value table) has a measurement in the list. Before the change this is the diagnosis, after it the
 * proof. Live network (BrightSky, TAWES, SMN) — the numbers are of the moment they were taken.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-ausbau/ax1-obs-check.mjs [--hint]
 */
import { readFileSync } from 'node:fs';
import { fetchCubeObs } from '../../src/pointForecast/cubeSource.ts';

const hint = process.argv.includes('--hint');
const catalog = JSON.parse(readFileSync('C:/dev/buscosun-data/point/stations/catalog.json', 'utf8'));
const R = 6371;
const km = (a, b, c, d) => { const p = Math.PI / 180; const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const POINTS = [
  { name: 'München', lat: 48.137, lon: 11.575, country: 'DE' },
  { name: 'Hamburg', lat: 53.55, lon: 9.99, country: 'DE' },
  { name: 'Berlin', lat: 52.52, lon: 13.405, country: 'DE' },
  { name: 'Frankfurt', lat: 50.11, lon: 8.68, country: 'DE' },
  { name: 'Stuttgart', lat: 48.78, lon: 9.18, country: 'DE' },
  { name: 'Dresden', lat: 51.05, lon: 13.74, country: 'DE' },
  { name: 'Wien', lat: 48.21, lon: 16.37, country: 'AT' },
  { name: 'Zürich', lat: 47.37, lon: 8.54, country: 'CH' },
];
const rows = [];
for (const p of POINTS) {
  const near = catalog.stations.map((s) => ({ ...s, d: km(p.lat, p.lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d);
  const st = near[0];
  const hElev = st.elev;   // the point's height ≈ the station's, for the range check
  const t0 = Date.now();
  let obs = [];
  try {
    obs = await fetchCubeObs(p.lat, p.lon, p.country, AbortSignal.timeout(8000), hint ? { station: { id: st.id, name: st.name, lat: st.lat, lon: st.lon, elev: st.elev } } : undefined);
  } catch (e) { rows.push(`| ${p.name} | Abruf gescheitert: ${e?.message ?? e} |`); continue; }
  const ms = Date.now() - t0;
  const atPoint = obs.filter((o) => o.distanceM / 1000 <= 5 && Math.abs((o.elevM ?? hElev) - hElev) <= 50);
  const list = obs.slice(0, 6).map((o) => `${o.name ?? o.source} ${(o.distanceM / 1000).toFixed(1)} km${o.stationId ? ` [${o.stationId}]` : ''}`).join(' · ');
  rows.push(`| ${p.name} (${p.country}) | ${st.id} ${st.name.trim()} ${st.d.toFixed(1)} km / ${st.elev} m | ${obs.length} in ${ms} ms | ${atPoint.length ? `**ja** — ${atPoint.map((o) => `${o.name ?? o.source} ${(o.distanceM / 1000).toFixed(1)} km`).join(', ')}` : '**nein**'} | ${list} |`);
}
console.log(`Lauf ${new Date().toISOString()} · ${hint ? 'MIT' : 'OHNE'} Stations-Hinweis\n`);
console.log('| Punkt | MOSMIX-Station am Punkt (Katalog) | Messungen | Messung ≤ 5 km / 50 m? | die ersten sechs |');
console.log('|---|---|---|---|---|');
for (const r of rows) console.log(r);
