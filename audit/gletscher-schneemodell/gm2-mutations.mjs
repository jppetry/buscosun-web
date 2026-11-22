// Phase GM, GM-2 — counter-probe of verify:glacier-weather block H: each mutation of the producer code must turn at least one check red.
// The file is restored after every mutation (and on any error).   node audit/gletscher-schneemodell/gm2-mutations.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CORE = 'scripts/glacier/lib/weathercore.mjs', MELT = 'scripts/glacier/melt.mjs', CONTRACT = 'src/glacier/glacierWeatherContract.ts';
const M = [
  { name: 'Regel „unten nie mehr als oben“ entfernt', file: CORE, from: 'share[1][h] = Math.min(share[1][h], share[2][h]); share[0][h] = Math.min(share[0][h], share[1][h]);', to: '' },
  { name: 'Reichweite nach unten ignoriert (immer eine Zahl)', file: CORE, from: "if (f(z[0] - reach) >= 0) return { v: null, k: '3' };", to: '' },
  { name: 'Begrenzung des Gradienten außerhalb entfernt', file: CORE, from: 'Math.min(LINE_LAPSE_LIMITS[1], Math.max(LINE_LAPSE_LIMITS[0], (tz[1][h] - tz[e][h]) / span))', to: '((tz[1][h] - tz[e][h]) / span)' },
  { name: 'Tag als mittlerer Index + 1 statt mittlere Stunde', file: CORE, from: '[Math.floor((known.length - 1) / 2)]', to: '[Math.floor((known.length - 1) / 2) + 3]' },
  { name: 'Zunge und Oberkante in der Medianhöhe abgefragt', file: MELT, from: 'const lo = await levelOf(g, z[0]), hi = await levelOf(g, z[2]);', to: 'const lo = await levelOf(g, z[1]), hi = await levelOf(g, z[1]);' },
  { name: 'Temperatur trotz drei Antworten aus der Hochrechnung', file: MELT, from: 'tz: lv ? lv.tz : z.map((zz) => tempAt(f, zz))', to: 'tz: z.map((zz) => tempAt(f, zz))' },
  { name: 'Schneeanteil der Zunge aus der Antwort der Medianhöhe', file: MELT, from: 'ps: [lo.wx.ps, f.wx.ps, hi.wx.ps] };', to: 'ps: [f.wx.ps, f.wx.ps, hi.wx.ps] };' },
  { name: 'Schmelzlauf liest die Antwort der Zunge', file: MELT, from: 'return { t: f.t, sg: f.sg, wx: weatherSeriesOf(fc, { t0Ms, hours: GLACIER_MELT_HOURS }) };', to: 'forcings.get(g.id).t.set(f.t); return { t: f.t, sg: f.sg, wx: weatherSeriesOf(fc, { t0Ms, hours: GLACIER_MELT_HOURS }) };' },
  { name: 'Eigene Grenze überschreibt die der Antwort', file: CORE, from: "hourly.slo = lines.slice(0, GLACIER_WEATHER_SNOWLINE_HOURS).map((x) => x.v);", to: "hourly.slo = lines.slice(0, GLACIER_WEATHER_SNOWLINE_HOURS).map((x) => x.v); hourly.sl = hourly.slo;" },
  // E-GM-6 (22.11.): the default is `three`; the mutation is the way back (before E-GM-6 it read the other way round)
  { name: 'Voreinstellung zurück auf eine Antwort (median)', file: CORE, from: "export const WEATHER_HEIGHTS_DEFAULT = 'three';", to: "export const WEATHER_HEIGHTS_DEFAULT = 'median';" },
  { name: 'Vertrag prüft die Art nicht gegen den Wert', file: CONTRACT, from: "if (k === '0' || k === '3' || k === '5') return v === null;", to: "if (k === '0' || k === '3' || k === '5') return true;" },
];
const run = () => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', 'scripts/verify-glacier-weather.mjs'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const fails = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5).split(' ')[0]);
  const total = /verify:glacier-weather (\d+)\/(\d+)/.exec(r.stdout ?? '');
  return { fails, total: total ? `${total[1]}/${total[2]}` : `Abbruch (${String(r.stderr ?? '').split('\n').filter((l) => /Error/.test(l))[0] ?? 'ohne Ausgabe'})` };
};
const only = process.argv[2] ? new Set(process.argv[2].split(',').map(Number)) : null;
const out = [];
for (const [i, m] of M.entries()) {
  if (only && !only.has(i)) continue;
  const src = readFileSync(m.file, 'utf8');
  if (src.split(m.from).length !== 2) { out.push({ name: m.name, error: 'Stelle nicht eindeutig gefunden' }); continue; }
  try { writeFileSync(m.file, src.replace(m.from, m.to)); out.push({ name: m.name, ...run() }); }
  finally { writeFileSync(m.file, src); }
}
const base = run();
console.log(JSON.stringify({ base, noticed: out.filter((o) => o.fails?.length || /Abbruch/.test(o.total ?? '')).length, of: M.length, out }, null, 1));
