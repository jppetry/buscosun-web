/**
 * check-cdn.mjs — kommt ein veroeffentlichter Chunk UNVERAENDERT beim Client an?
 *
 * Der Container traegt eine CRC-32 ueber seine Nutzlast; `decodeCubeChunk` prueft sie
 * standardmaessig. Ein von Git oder einem Proxy verfaelschtes Byte faellt damit hier auf
 * und nicht erst beim Nutzer. Geprueft werden zwei Wege, weil sie verschieden brechen:
 *
 *   @<commit>  gepinnt — unveraenderlich, aber tot, wenn `index.json` einen SHA nennt,
 *              den ein Rebase umgeschrieben hat (genau das ist am 2026-09-09 passiert:
 *              jsDelivr antwortete 404, waehrend `@main` byte-gleich auslieferte).
 *   @main      immer der letzte Stand, aber bis zu 12 h im CDN-Cache.
 *
 * Aufruf:  node --experimental-strip-types --import ./scripts/lib/register-ts.mjs  *            scripts/point/check-cdn.mjs <commit> [<lauf>]
 * Der Commit steht in `data/repo/point/index.json` unter `commit`.
 */
import { readFileSync } from 'node:fs';
import { readCubeHeader, decodeCubeChunk, planeIndex, CUBE_PLANES, MISSING, dequantize } from '../../src/point/cubeFormat.ts';

const B = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data';
const C = process.argv[2];
const targets = [[C, 'point/2026090912/t1/05_07.bin'], ['main', 'point/2026090912/t3/00_00.bin']];

for (const [ref, rel] of targets) {
  const url = `${B}@${ref}/${rel}`;
  const t0 = Date.now();
  const r = await fetch(url);
  const buf = new Uint8Array(await r.arrayBuffer());
  console.log(`@${ref.slice(0, 7)} ${rel}`);
  if (!r.ok) { console.log(`  ${r.status} — NICHT ausgeliefert`); continue; }
  const disk = new Uint8Array(readFileSync(`data/repo/${rel}`));
  const same = Buffer.compare(Buffer.from(buf), Buffer.from(disk)) === 0;
  console.log(`  ${r.status} · ${buf.length} B · ${Date.now() - t0} ms · x-cache ${r.headers.get('x-cache') ?? '—'}`);
  console.log(`  byte-gleich zur Quelle: ${same ? 'JA' : 'NEIN'}`);
  const { header } = readCubeHeader(buf);
  console.log(`  Kopf: Stufe ${header.tierIndex} · nt ${header.nt} · ${header.ny}x${header.nx} @ y${header.y0} x${header.x0} · runHours ${header.runHours} (${new Date(header.runHours * 3600e3).toISOString()})`);
  // checkCrc ist Standard: ein verfaelschtes Byte wuerde hier werfen.
  const chunk = await decodeCubeChunk(buf, { wanted: ['t2m', 't2m_sd'] });
  for (const id of ['t2m', 't2m_sd']) {
    const p = chunk.planes[planeIndex(id)];
    if (!p || p.length === 0) { console.log(`  ${id}: nicht entpackt`); continue; }
    const meta = CUBE_PLANES[planeIndex(id)];
    const fin = Array.from(p).filter((x) => x !== MISSING);
    if (!fin.length) { console.log(`  ${id}: durchgehend MISSING`); continue; }
    const mn = dequantize(Math.min(...fin), meta), mx = dequantize(Math.max(...fin), meta);
    console.log(`  ${id}: ${fin.length}/${p.length} gueltig · ${mn.toFixed(2)} … ${mx.toFixed(2)} ${meta.unit}`);
  }
}
