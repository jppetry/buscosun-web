/**
 * AP17 — Wirkung des GRIB-z0 an echten Orten: Windfaktor der zweistufigen Korrektur (PAP 5) mit der WorldCover-Näherung
 * (heute, `z0Mod` = Box um den Punkt) gegen die Mischung aus dem Produkt (`z0ModelMix`, GRIB wo veröffentlicht, sonst
 * dieselbe Näherung). Das Produkt kommt aus dem lokalen Probebau (`z0mod-local.mjs`, Scratchpad), die Quellen je Stufe
 * aus dem lebenden run.json, z0 am Punkt aus dem Produkt-Lader (WorldCover-Spiegel).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-vollform/z0mod-places.mjs <probebau>
 *
 * Stichprobe wie §0: die zehn Orte des Latenz-Harnischs + jeder 13. Archivpunkt = 42 Orte. d0 = 0 an beiden Enden
 * (das Stadt-Raster wirkt auf beide Varianten gleich), z_b = 60 m (`TERRAIN_SET.zBlendM`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadZ0AtPoint } from '../../src/point/client/z0Point.ts';
import { memoryBackend } from '../../src/point/client/cache.ts';
import { memoryStore } from '../../src/point/client/store.ts';
import { readStaticProductPoint } from '../../src/point/client/staticPoint.ts';
import { TIER_BY_ID, cellOf, cellCenter, Z0MOD_PRODUCT, Z0MOD_VERSION } from '../../src/point/cubeFormat.ts';
import { z0ModelMix } from '../../src/pointForecast/cubeSource.ts';
import { windBlendingFactor, TERRAIN_SET } from '../../src/pointForecast/fusion/terrainTerms.ts';

const BUILD = process.argv[2];
if (!BUILD) throw new Error('Pfad des Probebaus fehlt (…/z0mod-out)');
const files = new Map();
const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else files.set(relative(BUILD, p).replace(/\\/g, '/'), new Uint8Array(readFileSync(p))); } };
walk(BUILD);
const store = memoryStore(files);
const CDN = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data';
const idx = await (await fetch(`${CDN}@main/point/index.json`)).json();
const sourcesOf = {};
for (const t of ['t1', 't2', 't3']) sourcesOf[t] = (await (await fetch(`${CDN}@${idx.commit}/${idx.latestByTier[t].manifest}`)).json()).sources.filter((s) => s.tier === t);

const places = [
  ['hamburg', 53.5511, 9.9937], ['berlin', 52.52, 13.405], ['muenchen', 48.1372, 11.5755], ['wien', 48.2082, 16.3738], ['graz', 47.0707, 15.4395],
  ['innsbruck', 47.2692, 11.4041], ['zuerich', 47.3769, 8.5417], ['genf', 46.2044, 6.1432], ['zermatt', 46.0207, 7.7491], ['zugspitze', 47.421, 10.9863],
];
const archive = JSON.parse(readFileSync(new URL('../../scripts/punktarchiv/points.json', import.meta.url), 'utf8')).points;
archive.forEach((p, i) => { if (i % 13 === 0) places.push([`${p.id} ${p.name.trim().slice(0, 14)}`, p.lat, p.lon]); });
const cache = memoryBackend();
const zb = TERRAIN_SET.zBlendM;
const fz = (x) => (x == null ? '—' : x >= 0.1 ? x.toFixed(2) : x.toPrecision(2));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const rows = [];
for (const [name, lat, lon] of places) {
  const z = await loadZ0AtPoint(lat, lon, { cache, timeoutMs: 20_000 });
  if (!z || z.z0True == null) { rows.push({ name, err: 'kein z0 am Punkt' }); continue; }
  const per = {};
  for (const t of ['t1', 't2', 't3']) {
    const tier = TIER_BY_ID[t], c = cellOf(tier, lat, lon), m = cellCenter(tier, c.iy, c.ix);
    const sp = await readStaticProductPoint(store, Z0MOD_PRODUCT, Z0MOD_VERSION, t, lat, lon);
    const wc = z.z0Mod[t] ?? null;
    const mix = z0ModelMix(sp, sourcesOf[t], m.lat, m.lon, wc);
    const fOld = windBlendingFactor(wc, z.z0True, 0, 0, zb);
    const fNew = windBlendingFactor(mix ? Math.exp(mix.lnZ0) : wc, z.z0True, 0, 0, zb);
    per[t] = { wc, eff: mix ? Math.exp(mix.lnZ0) : wc, grib: mix?.grib ?? [], approx: mix?.approx ?? [], fOld, fNew };
  }
  rows.push({ name, z0True: z.z0True, per });
}
const ok = rows.filter((r) => !r.err);
console.log(`Orte ${rows.length}, mit z0 am Punkt ${ok.length}; z_b ${zb} m; Index ${idx.commit.slice(0, 7)}`);
console.log('Ort                        z0 Punkt   t1: WC → Mix (GRIB-Quellen) · Faktor alt → neu        t2: WC → Mix · Faktor              t3: WC → Mix · Faktor');
for (const r of ok) {
  const s = (t) => { const x = r.per[t]; return `${fz(x.wc)} → ${fz(x.eff)} (${x.grib.length}/${x.grib.length + x.approx.length}) · ${x.fOld?.toFixed(3) ?? '—'} → ${x.fNew?.toFixed(3) ?? '—'}`; };
  console.log(`${r.name.padEnd(26)} ${fz(r.z0True).padStart(7)}   ${s('t1').padEnd(46)} ${s('t2').padEnd(34)} ${s('t3')}`);
}
for (const t of ['t1', 't2', 't3']) {
  const xs = ok.map((r) => r.per[t]).filter((x) => x.fOld != null && x.fNew != null);
  const ratio = xs.map((x) => x.fNew / x.fOld), lr = xs.map((x) => Math.log(x.eff / x.wc));
  console.log(`\n${t}: n ${xs.length}; GRIB-Anteil der Windquellen p50 ${q(xs.map((x) => x.grib.length / Math.max(1, x.grib.length + x.approx.length)), 0.5).toFixed(2)}; z0 Mix/WC p10/p50/p90 ${Math.exp(q(lr, 0.1)).toFixed(2)}/${Math.exp(q(lr, 0.5)).toFixed(2)}/${Math.exp(q(lr, 0.9)).toFixed(2)}`
    + `\n    Windfaktor alt p10/p50/p90 ${q(xs.map((x) => x.fOld), 0.1).toFixed(3)}/${q(xs.map((x) => x.fOld), 0.5).toFixed(3)}/${q(xs.map((x) => x.fOld), 0.9).toFixed(3)} · neu ${q(xs.map((x) => x.fNew), 0.1).toFixed(3)}/${q(xs.map((x) => x.fNew), 0.5).toFixed(3)}/${q(xs.map((x) => x.fNew), 0.9).toFixed(3)}`
    + ` · neu/alt p10/p50/p90 ${q(ratio, 0.1).toFixed(3)}/${q(ratio, 0.5).toFixed(3)}/${q(ratio, 0.9).toFixed(3)}, max ${Math.max(...ratio).toFixed(3)}`);
}
// Wasserzelle: Empfindlichkeit des Faktors auf z0_mod 1e-4 → 1e-3 (Charnock-Schwankung über Wasser, Plan §5).
console.log(`\nWasser: z0 am Punkt 0,0002 m; Faktor mit z0_mod 1e-4 / 3e-4 / 1e-3 m = ${[1e-4, 3e-4, 1e-3].map((m) => windBlendingFactor(m, 0.0002, 0, 0, zb).toFixed(3)).join(' / ')}`);
process.exit(0);
