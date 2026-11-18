#!/usr/bin/env node
/**
 * Phase WT, step 0 — fills the probe's cache with the history samples of DMI oceanObs `tw` (one sample hour on the 15th
 * of every month since 2000, all stations in one request), so `wt-probe.mjs` reads them without asking. Same cache
 * form as the probe (`raw/<sha256(url)[0:20]>.bin` + `.json`). Measurement tool, not product code.
 *
 *   node scripts/sea/spike/wt-history.mjs [--out=audit/seewetter-wassertemperatur/spike]
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const RAW = join(resolve(ROOT, String(args.out ?? 'audit/seewetter-wassertemperatur/spike')), 'raw');
mkdirSync(RAW, { recursive: true });
const DMI = 'https://opendataapi.dmi.dk';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOW = Date.now();
let asked = 0, busy = 0;
for (let y = 2000; y <= new Date(NOW).getUTCFullYear(); y++) for (let mo = 1; mo <= 12; mo++) {
  const d = `${y}-${String(mo).padStart(2, '0')}-15`;
  if (Date.parse(`${d}T13:00:00Z`) > NOW) continue;
  const url = `${DMI}/v2/oceanObs/collections/observation/items?parameterId=tw&datetime=${d}T12:00:00Z/${d}T13:00:00Z&limit=3000`;
  const key = createHash('sha256').update(url).digest('hex').slice(0, 20);
  if (existsSync(join(RAW, `${key}.bin`)) && existsSync(join(RAW, `${key}.json`))) continue;
  for (let a = 1; a <= 4; a++) {
    await sleep(700);
    const t0 = Date.now();
    const r = await fetch(url, { headers: { 'user-agent': 'buscosun-sea (weather page, measurement)', accept: 'application/json' }, signal: AbortSignal.timeout(90_000) });
    const buf = Buffer.from(await r.arrayBuffer());
    asked++;
    if (r.status === 429 || r.status >= 500) { busy++; await sleep(8000 * a); continue; }
    if (r.status === 200) {
      writeFileSync(join(RAW, `${key}.bin`), buf);
      writeFileSync(join(RAW, `${key}.json`), JSON.stringify({ url, status: r.status, cors: r.headers.get('access-control-allow-origin'), type: r.headers.get('content-type'), bytes: buf.length, ms: Date.now() - t0, at: new Date().toISOString() }));
    }
    break;
  }
  if (mo === 12) console.log(`${y}: ${asked} Abrufe, ${busy} mal 429/5xx`);
}
console.log(`fertig: ${asked} Abrufe, ${busy} mal 429/5xx`);
