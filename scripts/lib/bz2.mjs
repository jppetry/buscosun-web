// ---------------------------------------------------------------------------
// Geteilter bz2-Weg für alle Producer (RD3; herausgelöst aus repack-icon-d2.mjs,
// BW-9/V-BW-27): `bzip2`-Binary statt pure-JS, wenn `REPACK_BZIP2=1` gesetzt ist
// und das Binary im PATH liegt. Lokal gemessen an t_2m 000 (913 KB → 1,62 MB):
// JS 1,26–1,49 s, Binary 0,47–0,59 s inkl. Prozessstart — Faktor ≈ 2,6; parallele
// Aufrufe laufen als Prozesse auf mehreren Kernen, wo das JS-Modul nacheinander
// auf EINEM Thread rechnet. Byte-gleich per Definition (derselbe Datenstrom),
// `verify:repack` prüft es trotzdem (Binary- gegen JS-Weg an derselben Datei).
//
// Flag-gated (Rule 2): nur mit `REPACK_BZIP2=1`; lokal bleibt JS der Standard.
// Fehlt das Binary oder scheitert ein Aufruf, fällt die DATEI auf JS zurück —
// nie der Lauf.
// ---------------------------------------------------------------------------

import { execFile, spawnSync } from 'node:child_process';
import bz2mod from 'bz2';

const bz2 = bz2mod.decompress ? bz2mod : (bz2mod.default ?? bz2mod);

const BZIP2_WANTED = process.env.REPACK_BZIP2 === '1';
const log = (...a) => console.log('[bz2]', ...a);

let bzip2Ok = null; // null = noch nicht geprüft
function bzip2Available() {
  if (bzip2Ok === null) {
    const r = spawnSync('bzip2', ['--help'], { stdio: 'ignore' });
    bzip2Ok = !r.error;
    if (BZIP2_WANTED) log(bzip2Ok ? 'bzip2-Binary (REPACK_BZIP2=1)' : 'REPACK_BZIP2=1, aber kein `bzip2` im PATH → pure-JS');
  }
  return bzip2Ok;
}

function bzip2Spawn(buf) {
  return new Promise((res, rej) => {
    const child = execFile('bzip2', ['-dc'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
      (err, stdout) => (err ? rej(err) : res(new Uint8Array(stdout.buffer, stdout.byteOffset, stdout.length))));
    child.stdin.on('error', rej);
    child.stdin.end(buf);
  });
}

let bzip2Warned = false;
/** bz2-Bytes → entpackte Bytes. Exportiert, damit Verifier beide Wege gegeneinander halten. */
export async function decompressBz2(buf, { binary = BZIP2_WANTED } = {}) {
  if (binary && bzip2Available()) {
    try { return await bzip2Spawn(buf); } catch (e) {
      if (!bzip2Warned) { bzip2Warned = true; log(`Binary scheiterte (${e.message}) → pure-JS für diese Datei`); }
    }
  }
  return bz2.decompress(new Uint8Array(buf));
}
