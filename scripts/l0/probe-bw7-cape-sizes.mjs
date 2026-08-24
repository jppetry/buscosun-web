// BW-7 Diagnose: PNG-Größe der `cape`-Familie (volle Auflösung, capeToU8) je Schritt.
import { fetchGrib, urls, findLatestRun } from '../repack-icon-d2.mjs';
import { encodePng } from '../lib/png.mjs';
import { decodeGridStep } from '../../src/sources/gribGridDecode.ts';
const run = process.env.REPACK_RUN || (await findLatestRun(['wind', 'temp'])).run;
let sum = 0;
for (const s of [0, 1, 3, 6, 12, 18, 24, 27]) {
  try {
    const bytes = await fetchGrib(urls.step(run, 'cape_ml', s));
    const d = decodeGridStep(bytes, null, false, 'cape');
    const png = encodePng(d.width, d.height, d.values, 1);
    sum += png.length;
    console.log(`cape ${s}: ${(png.length / 1024).toFixed(0)} KB`);
  } catch (e) { console.log(`cape ${s}: fehlt (${e.message.slice(0, 40)})`); }
}
console.log(`Lauf ${run}, 8 Stichproben ${(sum / 1024).toFixed(0)} KB → ≈ ${(sum / 8 * 28 / 1024 / 1024).toFixed(1)} MiB je Lauf bei 28 Schritten`);
