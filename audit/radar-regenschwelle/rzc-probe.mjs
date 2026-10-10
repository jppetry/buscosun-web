// Phase RG — RG-0: smallest values and quantisation of the MeteoSwiss rzc file (CH) and what precipToU8 makes of them.
import { readFileSync } from 'node:fs';
import { File as H5File } from 'jsfive';
import { precipToU8, precipToU8Log } from '../../src/scalar/RainLayer.ts';
const b = readFileSync(process.argv[2]);
const f = new H5File(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'rzc.h5');
const what = f.get('dataset1/data1/what').attrs, ds = f.get('dataset1/data1/data');
console.log('what', JSON.stringify(what), 'dtype', ds.dtype, 'shape', ds.shape);
const v = ds.value; const vals = new Map(); let nan = 0, wet = 0, shown = 0, shownLog = 0;
for (let k = 0; k < v.length; k++) { const x = v[k]; if (Number.isNaN(x)) { nan++; continue; } if (x > 0) { wet++; vals.set(x, (vals.get(x) ?? 0) + 1); if (precipToU8(x) > 0) shown++; if (precipToU8Log(x) > 0) shownLog++; } }
const sorted = [...vals.keys()].sort((a, b) => a - b);
console.log(`cells ${v.length} nan ${nan} wet ${wet} shown(v1) ${shown} shownLog ${shownLog}; distinct wet values ${sorted.length}`);
console.log('smallest 12 values:', sorted.slice(0, 12).map((x) => `${x.toFixed(4)}×${vals.get(x)}`).join(' '));
let below = 0; for (const [x, n] of vals) if (x < 0.06) below += n; console.log(`wet cells below 0,06 mm/h: ${below} (${(100 * below / wet).toFixed(1)} %)`);
