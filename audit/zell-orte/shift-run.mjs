import { readFileSync, writeFileSync } from 'node:fs';
import { parseKonrad3d } from 'file:///C:/dev/buscosun-web/src/radar/konrad3d.ts';
const [src, out] = process.argv.slice(2);
const run = parseKonrad3d(readFileSync(src, 'utf8'), src.split(/[\/]/).pop());
const now = Date.now();
const target = Math.floor((now - 6 * 60_000) / 300_000) * 300_000; // a slot ~6–11 min old, like the real product
const d = target - run.refMs;
const sh = (v) => (Number.isFinite(v) ? v + d : v);
run.refMs = sh(run.refMs);
for (const c of run.cells) { c.refMs = sh(c.refMs); c.firstDetectedMs = sh(c.firstDetectedMs); for (const f of c.forecast) f.validMs = sh(f.validMs); }
writeFileSync(out, JSON.stringify({ schema: 1, run }));
console.log('refMs', new Date(run.refMs).toISOString(), 'cells', run.cells.length);
