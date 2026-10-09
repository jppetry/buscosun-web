import { readFileSync, readdirSync } from 'node:fs';
import { parseKonrad3d } from 'file:///C:/dev/buscosun-web/src/radar/konrad3d.ts';
import { DWD_RADAR_SITES } from 'file:///C:/dev/buscosun-web/src/point/sourceMatrix.ts';
const dir = process.argv[2];
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const ds = []; let files = 0, cells = 0, withFc = 0, withEll = 0; const byCountry = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml'))) {
  files++;
  const run = parseKonrad3d(readFileSync(dir + '/' + f, 'utf8'), f);
  for (const c of run.cells) {
    cells++; if (c.forecast.length) withFc++; if (c.forecast.some((q) => q.majorKm > 0)) withEll++;
    const d = Math.min(...DWD_RADAR_SITES.map((s) => hav([s[0], s[1]], [c.lat, c.lon])));
    ds.push(d);
    const k = c.lat < 47.8 && c.lon > 9.6 ? 'Alpen-S' : 'sonst'; byCountry[k] = (byCountry[k] || 0) + 1;
  }
}
ds.sort((a, b) => a - b);
const q = (p) => ds[Math.min(ds.length - 1, Math.floor(ds.length * p))].toFixed(0);
console.log({ files, cells, withFc, withEll, p50: q(.5), p90: q(.9), p99: q(.99), max: ds[ds.length - 1]?.toFixed(0), over150: ds.filter((d) => d > 150).length, byCountry });
