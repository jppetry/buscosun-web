#!/usr/bin/env node
/**
 * Phase GM, GM-5b (audit/gletscher-schneemodell/gm5b-diagnose.md) — measured global radiation for the second calibration round, from the SAME station
 * that gives each glacier its temperature (`stations.json` of round one): SwissMetNet `gre000h0` (MeteoSwiss OGD, CC BY 4.0; the decade files are
 * already in the cache) and `klima-v2-1h` `cglo` (GeoSphere Austria Data Hub, CC BY 4.0; fetched year by year into the cache). Hourly means in W m⁻²
 * on the hour grid of the temperature files (index i = the hour ENDING at fromMs + (i + 1) h, UTC).
 *
 *   node scripts/glacier/snowcal-radiation.mjs --truth=<gy.json> --cache=<dir>
 *
 * Writes `rad-<CC>-<station>.json` = { id, name, height, fromMs, hours, g: [W m⁻² | null] } per station and `radiation.json` (coverage per station
 * and per glacier over its winters). Counts only — no gap is filled here. Read-only towards the sources; nothing of the repo is written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { smnHourly, klimaHourly } from './snowcal-forcing.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;

async function main() {
  const cache = arg('cache'), truth = JSON.parse(readFileSync(arg('truth'), 'utf8')), st = JSON.parse(readFileSync(join(cache, 'stations.json'), 'utf8'));
  const fromMs = Date.parse(st.from), toMs = Date.parse(st.to), n = Math.round((toMs - fromMs) / 3_600_000);
  const idx = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - fromMs) / 3_600_000);
  const series = new Map(), stations = {};
  for (const a of Object.values(st.assign)) {
    if (!a.temp || series.has(a.temp.id)) continue;
    const g = a.country === 'CH' ? (await smnHourly(cache, a.temp.station, { g: 'gre000h0' }, fromMs, toMs)).g : (await klimaHourly(cache, a.temp.station, ['cglo'], fromMs, toMs)).cglo;
    // a physical bound only: a negative reading of the sensor at night is zero light, a value above the solar constant is no measurement
    let have = 0, neg = 0, over = 0;
    for (let i = 0; i < n; i++) { const v = g[i]; if (v == null || !Number.isFinite(v)) { g[i] = null; continue; } if (v > 1400) { g[i] = null; over++; continue; } if (v < 0) { g[i] = 0; neg++; } have++; }
    series.set(a.temp.id, g);
    stations[a.temp.id] = { name: a.temp.name, height: a.temp.height, cover: Math.round((have / n) * 1000) / 1000, negativeSetZero: neg, overRejected: over, first: g.findIndex((v) => v != null) < 0 ? null : new Date(fromMs + (g.findIndex((v) => v != null) + 1) * 3_600_000).toISOString() };
    writeFileSync(join(cache, `rad-${a.temp.id}.json`), JSON.stringify({ id: a.temp.id, name: a.temp.name, height: a.temp.height, fromMs, hours: n, g }));
    console.log(`${a.temp.id.padEnd(10)} ${a.temp.name.padEnd(34)} ${String(Math.round((have / n) * 100)).padStart(3)} % der Stunden, ab ${stations[a.temp.id].first ?? '—'}`);
  }
  // coverage per glacier winter (the window of the fit: t0 00 UTC … t1 24 UTC)
  const winters = [];
  for (const o of truth.gy) {
    const a = st.assign[o.key]; if (!a?.temp) continue;
    const g = series.get(a.temp.id), i0 = idx(o.t0), i1 = idx(o.t1) + 24;
    let miss = 0; for (let i = i0; i < i1; i++) if (g[i] == null) miss++;
    winters.push({ key: o.key, name: o.name, country: o.country, year: o.year, station: a.temp.id, missing: Math.round((miss / (i1 - i0)) * 1000) / 1000 });
  }
  const share = (lim) => winters.filter((w) => w.missing > lim).length;
  writeFileSync(join(cache, 'radiation.json'), JSON.stringify({ kind: 'gm5b/radiation', generated: new Date().toISOString(), from: st.from, to: st.to, sources: ['MeteoSwiss OGD SwissMetNet gre000h0, CC BY 4.0, Quelle: MeteoSchweiz', 'GeoSphere Austria Data Hub klima-v2-1h cglo, CC BY 4.0'], stations, winters, wintersMissingOver: { '2%': share(0.02), '15%': share(0.15), '50%': share(0.5) } }, null, 1));
  console.log(`${winters.length} Gletscherwinter; Strahlung fehlt in mehr als 2 % der Stunden an ${share(0.02)}, mehr als 15 % an ${share(0.15)}, mehr als 50 % an ${share(0.5)}`);
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
