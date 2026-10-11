// Stores six REAL scenes of Hintereisferner (the glacier window of the Sentinel-2 bands, masked pixels only) as the fixture of
// `verify:glacier-sat` (lesson BW-1: fixtures carry the real data form). Written once; the verifier recomputes everything from them.
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/make-sat-fixtures.mjs <v1 dir of a built tree>
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stacSearchAll, assetGeo, readWindow } from './lib/s2cog.mjs';
import { loadStatic, loadRegion, prepGlacier, compareItems } from './sat-scan.mjs';
import { demDecode } from '../../src/glacier/glacierSatContract.ts';

const data = process.argv[2];
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'fixtures', 'glacier', 'sat-hef.json');
const ID = 'gl_at_hintereisferner-mit-toteis';
const SCENES = [
  { key: 'clear', date: '2025-08-25', why: 'klare Spätsommerszene (UIBK: Gleichgewichtslinie 2024/25 ≈ 3 300 m, AAR 0,24)' },
  { key: 'partly', date: '2025-06-16', why: 'teils bewölkt (≥ 70 % klar, Wolkenrand)' },
  { key: 'cloudy', date: '2025-07-11', why: 'ganz bewölkt (kein Wert)' },
  { key: 'newsnow', date: '2025-09-29', why: 'Neuschnee nach dem 19.09. (Schneegrenze fällt um ≈ 750 m)' },
  { key: 'falsecloud', date: '2026-06-08', why: 'schneebedeckt, Sen2Cor führt Teile als Wolke (die Regel rettet sie nicht)' },
  { key: 'shadow', date: '2025-10-29', why: 'Oktober, Sonne 29°, Geländeschatten' },
];
const st = loadStatic(data);
const g = [...st.byRegion.values()].flat().find((x) => x.id === ID);
const rg = loadRegion(data, st.build, g.region);
const dem = rg.dem[ID];
const z = demDecode(dem);
const b64 = (u8) => deflateSync(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength), { level: 9 }).toString('base64');
const doc = { schema: 1, kind: 'glacier/sat-fixture', glacier: ID, build: st.build, klass: g.satClass, z: g.z, debris: g.debris ?? null, demGrid: dem, scenes: {} };
let prep = null;
for (const sc of SCENES) {
  const f = (await stacSearchAll({ collections: ['sentinel-2-l2a'], bbox: [10.74, 46.79, 10.77, 46.81], datetime: `${sc.date}T00:00:00Z/${sc.date}T23:59:59Z`, limit: 10 })).filter((x) => x.properties['grid:code'] === 'MGRS-32TPS');
  const item = f.sort(compareItems)[0];   // the scanner's own tie-break between two acquisitions of one day
  const sclGeo = assetGeo(item, 'scl');
  prep ??= prepGlacier(sclGeo, rg.outline.get(ID), dem, z);
  const rd = async (k, lv) => (await readWindow(assetGeo(item, k), prep.px0, prep.py0, prep.px0 + prep.w, prep.py0 + prep.h, { level: lv })).data;
  const bands = { scl: await rd('scl', 0), green: await rd('green', 1), swir: await rd('swir16', 0), blue: await rd('blue', 1), red: await rd('red', 1), nir: await rd('nir', 1), swir2: await rd('swir22', 0) };
  const idx = []; for (let i = 0; i < prep.w * prep.h; i++) if (prep.mask[i]) idx.push(i);
  const pack = (a, T) => { const o = new T(idx.length); idx.forEach((i, k) => { o[k] = a[i]; }); return o; };
  const parts = { scl: pack(bands.scl, Uint8Array) };
  for (const k of ['green', 'swir', 'blue', 'red', 'nir', 'swir2']) parts[k] = pack(bands[k], Uint16Array);
  doc.scenes[sc.key] = { date: sc.date, why: sc.why, item: item.id, baseline: item.properties['s2:processing_baseline'], sunElevation: item.properties['view:sun_elevation'], data: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, b64(v)])) };
  console.log(sc.key, sc.date, item.id, idx.length, 'px');
}
const idx = []; for (let i = 0; i < prep.w * prep.h; i++) if (prep.mask[i]) idx.push(i);
const elev = new Float32Array(idx.length); idx.forEach((i, k) => { elev[k] = prep.elev[i]; });   // exact floats: the live check compares AAR to the pixel
doc.window = { w: prep.w, h: prep.h, n: idx.length, maskIdx: b64(new Uint32Array(idx)), elev: b64(elev) };
const body = JSON.stringify(doc);
doc.sha256 = createHash('sha256').update(JSON.stringify({ window: doc.window, scenes: doc.scenes })).digest('hex');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc));
console.log('fixture', OUT, (JSON.stringify(doc).length / 1024).toFixed(0), 'KB', doc.sha256.slice(0, 16), body.length);
