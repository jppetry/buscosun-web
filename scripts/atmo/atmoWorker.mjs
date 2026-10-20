/**
 * Worker of `atmo-build.mjs`: fetch one ICON-D2 GRIB2 field, decode it with the app decoder (`gribDecode.ts`, CCSDS)
 * and return only the values at the chosen cells. Started with the parent's execArgv (the TS loader comes along).
 */
import { parentPort, workerData } from 'node:worker_threads';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodeGrib2 } from '../../src/sources/gribDecode.ts';

const { idx, sfcIdx, stnIdx, cache, ua } = workerData;
// `set: 'sfc'` = the cells of the 0.02° surface-field grid, `stn` = the foehn stations, else the cube columns.
const sets = { col: new Int32Array(idx), sfc: new Int32Array(sfcIdx), stn: new Int32Array(stnIdx) };

async function getBytes(url) {
  const cf = cache ? join(cache, url.replace(/^https?:\/\//, '').replace(/[%:?]/g, '_')) : null;
  if (cf && existsSync(cf)) return new Uint8Array(readFileSync(cf));
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': ua } });
      if (r.status === 404) return null;
      if (r.ok) {
        const b = new Uint8Array(await r.arrayBuffer());
        if (cf) { mkdirSync(dirname(cf), { recursive: true }); writeFileSync(cf + '.tmp', b); renameSync(cf + '.tmp', cf); }
        return b;
      }
      last = new Error(`HTTP ${r.status} ${url}`);
    } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
  }
  throw last;
}

parentPort.on('message', async ({ id, url, set = 'col' }) => {
  try {
    const b = await getBytes(url);
    if (!b) { parentPort.postMessage({ id, missing: true, bytes: 0 }); return; }
    const t0 = performance.now();
    const f = decodeGrib2(b);
    const ms = performance.now() - t0;
    const cells = sets[set];
    const out = new Float32Array(cells.length);
    for (let i = 0; i < cells.length; i++) out[i] = f.values[cells[i]];
    parentPort.postMessage({ id, values: out, bytes: b.length, ms, n: f.values.length }, [out.buffer]);
  } catch (e) {
    parentPort.postMessage({ id, error: String(e?.message ?? e) });
  }
});
