#!/usr/bin/env node
/**
 * Gate C — the Hintereisferner check (C-4): forcing of the GeoSphere station Obergurgl (id 66, klima-v2-1h: `tl`, `rr`, `cglo`; CC BY 4.0, "Datenquelle: GeoSphere Austria")
 * in the layout of the SwissMetNet forcing files, and the glacier-year entry with the UIBK balances 2024/25 (Bs −2 595, Ba −1 793 mm w. e. ⇒ Bw 802).
 *   node scripts/glacier/c-hef.mjs --gc=<gate-c dir> --data=<v1 dir>      (needs <gc>/obg.json = the API answer for 2024-10-01 … 2025-09-30)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const gc = arg('gc'), data = arg('data');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const FROM = Date.UTC(2022, 9, 1), HOURS = Math.round((Date.UTC(2025, 9, 1) - FROM) / 3_600_000);
const o = J(join(gc, 'obg.json'));
const P = o.features[0].properties.parameters;
const t = new Array(HOURS).fill(null), g = new Array(HOURS).fill(null), p = new Array(HOURS).fill(null), rh = new Array(HOURS).fill(null);
o.timestamps.forEach((ts, k) => {
  const i = Math.round((Date.parse(ts) - FROM) / 3_600_000) - 1;       // the value at hh:00 belongs to the hour that ends there (same convention as the SwissMetNet files)
  if (i < 0 || i >= HOURS) return;
  t[i] = P.tl.data[k]; g[i] = P.cglo.data[k]; p[i] = P.rr.data[k];
});
writeFileSync(join(gc, 'forcing-OBG.json'), JSON.stringify({ abbr: 'OBG', name: 'Obergurgl (GeoSphere 66)', lat: 46.86694, lon: 11.02444, height: 1941, fromMs: FROM, hours: HOURS, t, p, g, rh }));
const index = J(join(data, 'index.json'));
const base = join(data, 'static', index.static.build);
const cat = J(join(base, 'catalog.json')).glaciers.find((x) => x.id === 'gl_at_hintereisferner-mit-toteis');
const hy = J(join(base, 'hypso', `${cat.region}.json`)).glaciers[cat.id];
const zb = [], a = [];
hy.a.forEach((v, i) => { if (v > 0) { zb.push(hy.z0 + 50 * (i + 0.5)); a.push(v); } });
const s = a.reduce((x, y) => x + y, 0);
writeFileSync(join(gc, 'hef.json'), JSON.stringify([{ id: cat.id, name: cat.name, year: 2025, sgi: null, bw: 802, bs: -2595, ela: cat.z[1], zb, w: a.map((v) => v / s), tg: 'OBG', pp: 'OBG', usable: true, gapT: 0, gapG: 0, hef: true }]));
console.log('forcing-OBG.json, hef.json:', zb.length, 'bands, ELA reference = median elevation', cat.z[1]);
