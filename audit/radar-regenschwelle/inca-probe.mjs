import { readFileSync } from 'node:fs';
import { File as H5File } from 'jsfive';
import { precipToU8 } from '../../src/scalar/RainLayer.ts';
const b = readFileSync(process.argv[2]);
const f = new H5File(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'inca.nc');
const rr = f.get('rr'); const [nt, ny, nx] = rr.shape; const v = rr.value; const lead = f.get('leadtime').value;
for (const t of [0, 1]) { const h = new Map(); let wet = 0, shown = 0, fill = 0; for (let k = 0; k < ny * nx; k++) { const raw = v[t * ny * nx + k]; if (raw === -999) { fill++; continue; } if (raw > 0) { wet++; h.set(raw, (h.get(raw) ?? 0) + 1); if (precipToU8(raw * 0.04) > 0) shown++; } }
  const ks = [...h.keys()].sort((a, b) => a - b); console.log(`lead ${lead[t]} h: wet ${wet} shown ${shown} (${(100 * shown / wet).toFixed(1)} %) fill ${fill}; smallest raw: ${ks.slice(0, 8).map((k) => `${k}(${(k * 0.04).toFixed(2)} mm/h)×${h.get(k)}`).join(' ')}`); }
