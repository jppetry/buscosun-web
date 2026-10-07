#!/usr/bin/env node
// SW-0 spike: which DWD POI stations at the German coast deliver hourly wind, direction and gust?
// Reads the POI listing, takes the WMO ids 10000-10199 (north German block), fetches each file once (sequentially)
// and reports the newest row's age and the fill rate of mean wind / direction / gust over the file's rows.
// Coordinates come from the MOSMIX station catalogue (DWD), filtered to the coastal box 53.2-55.1 N, 6.5-14.5 E.
// Usage: node scripts/sea/spike/poi-probe.mjs [--json=<out>]
import { writeFileSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BASE = 'https://opendata.dwd.de/weather/weather_reports/poi/';
const cat = await (await fetch('https://www.dwd.de/DE/leistungen/met_verfahren_mosmix/mosmix_stationskatalog.cfg?view=nasPublication&nn=16102')).text();
const pos = {};
for (const line of cat.split('\n')) {
  const m = /^(\w{4,5})\s+\S+\s+(.+?)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+)\s*$/.exec(line.trim());
  if (m) { const lat = Math.trunc(+m[3]) + (+m[3] % 1) * 100 / 60, lon = Math.trunc(+m[4]) + (+m[4] % 1) * 100 / 60; pos[m[1]] = { name: m[2].trim(), lat: +lat.toFixed(4), lon: +lon.toFixed(4), elev: +m[5] }; }
}
const ids = [...(await (await fetch(BASE)).text()).matchAll(/href="(10[01]\d\d)-BEOB\.csv"/g)].map((m) => m[1]);
const out = [];
for (const id of ids) {
  const p = pos[id];
  if (!p || p.lat < 53.2 || p.lat > 55.1 || p.lon < 6.5 || p.lon > 14.5) continue;
  const rows = (await (await fetch(`${BASE}${id}-BEOB.csv`)).text()).split('\n').map((l) => l.trim()).filter(Boolean);
  const head = rows[0].split(';');
  const col = (n) => head.indexOf(n);
  const ci = { ff: col('mean_wind_speed_during last_10_min_at_10_meters_above_ground'), dd: col('mean_wind_direction_during_last_10 min_at_10_meters_above_ground'), fx: col('maximum_wind_speed_last_hour') };
  const data = rows.slice(3).map((r) => r.split(';'));
  const fill = (c) => (c < 0 ? null : +(data.filter((r) => r[c] && r[c] !== '---').length / data.length).toFixed(2));
  const [d, t] = data[0] ?? [];
  const newest = d ? Date.UTC(2000 + +d.slice(6, 8), +d.slice(3, 5) - 1, +d.slice(0, 2), +t.slice(0, 2), +t.slice(3, 5)) : NaN;
  out.push({ id, ...p, rows: data.length, newestAgeH: Number.isFinite(newest) ? +((Date.now() - newest) / 3.6e6).toFixed(1) : null, fill: { ff: fill(ci.ff), dd: fill(ci.dd), fx: fill(ci.fx) }, cols: ci });
  console.log(JSON.stringify(out[out.length - 1]));
}
if (args.json) writeFileSync(String(args.json), JSON.stringify({ at: new Date().toISOString(), stations: out }, null, 1));
