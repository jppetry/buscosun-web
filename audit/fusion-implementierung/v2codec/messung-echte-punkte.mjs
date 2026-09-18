// V-FI-21: codec size and round trip on REAL cube points (network: jsDelivr, S3 terrain, BrightSky/TAWES/SMN obs, radar).
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs <this> [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { decodePng, toRgba } from 'file:///C:/dev/buscosun-web/scripts/lib/png.mjs';
import { httpStore, memoStore } from 'file:///C:/dev/buscosun-web/src/point/client/store.ts';
import { ClimaField } from 'file:///C:/dev/buscosun-web/src/ml/climaField.ts';
import { getPointForecastFromCube, fetchCubeObs, clearCubeForecastCache } from 'file:///C:/dev/buscosun-web/src/pointForecast/cubeSource.ts';
import { encodeV2, decodeV2, compareV2 } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/v2codec.ts';

const [outPath] = process.argv.slice(2);
const clima = new ClimaField(JSON.parse(readFileSync('C:/dev/buscosun-web/public/climaGrid.json', 'utf8')));
const store = memoStore(httpStore({ timeoutMs: 30_000 }));
const io = {
  store,
  decodePng: (b) => decodePng(Buffer.from(b)),
  terrain: { decodeRgba: (b) => { const p = decodePng(Buffer.from(b)); return { width: p.width, height: p.height, data: toRgba(p) }; }, cache: null, timeoutMs: 20_000 },
  clima: async () => clima,
  obs: fetchCubeObs,
};
const PLACES = [
  ['München', 48.1374, 11.5755, 'DE'], ['Zugspitze', 47.4211, 10.9853, 'DE'], ['Hamburg', 53.5511, 9.9937, 'DE'],
  ['Wien', 48.2082, 16.3738, 'AT'], ['Zürich', 47.3769, 8.5417, 'CH'], ['Berlin', 52.52, 13.405, 'DE'],
];
const kb = (n) => (n / 1024).toFixed(1);
const gzl = (s) => gzipSync(Buffer.from(s)).length;
const rows = [];
const slotAll = {}, slotNative = {}, slotRaw = {};
for (const [name, lat, lng, country] of PLACES) {
  for (const hours of [336]) {
    clearCubeForecastCache();
    const t = Date.now();
    let fc;
    try { fc = await getPointForecastFromCube({ lat, lng, country, hours, includeRadarNowcast: true, sourceMode: 'blend', pointSource: 'cube' }, io); }
    catch (e) { console.log(name, 'Fehler', e.message); continue; }
    const v2 = fc.cube?.v2;
    if (!v2) { console.log(name, 'kein v2', JSON.stringify(fc.cube?.notes ?? fc.cube).slice(0, 300)); continue; }
    const raw = JSON.stringify(v2);
    const c = encodeV2(v2);
    const cs = JSON.stringify(c);
    const back = decodeV2(JSON.parse(cs));
    const cmp = compareV2(v2, back);
    const native = v2.axis.steps.filter((s) => !s.interpolated).length;
    const nat = new Set(v2.axis.native);
    const v2n = { ...v2, axis: { ...v2.axis, steps: v2.axis.steps.filter((s) => nat.has(s.validAtMs)), interpolated: [] } };
    const cn = encodeV2(v2n); const cns = JSON.stringify(cn);
    const cmpN = compareV2(v2n, decodeV2(JSON.parse(cns)));
    slotAll[name] = c; slotNative[name] = cn; slotRaw[name] = v2;
    const members = new Set(v2.axis.steps.flatMap((s) => s.members.map((m) => m.tag)));
    const row = { name, steps: v2.axis.steps.length, native, interp: v2.axis.interpolated.length, members: [...members].join(','),
      rawKB: +kb(raw.length), rawGzKB: +kb(gzl(raw)), cKB: +kb(cs.length), cGzKB: +kb(gzl(cs)), exact: cmp.exact.length, distMax: +cmp.distMaxHalfSteps.toFixed(3), distN: cmp.distCompared, anMax: +cmp.anchorMaxHalfSteps.toFixed(3), anN: cmp.anchorCompared,
      nSteps: v2n.axis.steps.length, nGzKB: +kb(gzl(cns)), nExact: cmpN.exact.length, t2mP50: v2.axis.steps[0].vars.t2m?.p50,
      firstExact: cmp.exact.slice(0, 3), s: ((Date.now() - t) / 1000).toFixed(1) };
    rows.push(row);
    console.log(JSON.stringify(row));
    if (outPath && name === 'München') writeFileSync(outPath, raw);
  }
}
const per = (o) => gzl(JSON.stringify(o)) / Object.keys(o).length;
console.log(`gemeinsam gzippt (wie ein Slot), je Punkt: v2 ${kb(per(slotRaw))} KB · kompakt stündlich ${kb(per(slotAll))} KB · kompakt nur native Schritte ${kb(per(slotNative))} KB`);
console.log(`⇒ 405 Punkte je Slot: stündlich ${(per(slotAll) * 405 / 1048576).toFixed(1)} MiB · native ${(per(slotNative) * 405 / 1048576).toFixed(1)} MiB · v2-JSON ${(per(slotRaw) * 405 / 1048576).toFixed(1)} MiB`);
const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
console.log(`Mittel über ${rows.length} Orte: v2 ${mean('rawKB').toFixed(0)} KB / gz ${mean('rawGzKB').toFixed(1)} KB → kompakt ${mean('cKB').toFixed(0)} KB / gz ${mean('cGzKB').toFixed(1)} KB · native ${mean('nSteps').toFixed(0)} Schritte gz ${mean('nGzKB').toFixed(1)} KB`);
