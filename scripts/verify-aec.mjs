/**
 * Headless-Verifikation des GRIB2-CCSDS-AEC-Decoders (src/sources/gribDecode.ts)
 * gegen die eccodes-Gold-Referenz (ECMWF), wert- und bit-genau.
 *
 * Voraussetzung: entpackte ICON-EU-Druckflächen-GRIB2 + eccodes-Referenz-Dumps
 * (ref_<TAG>.npy / ref_meta.json), erzeugt vom begleitenden Python-Skript.
 *
 *   node --experimental-strip-types scripts/verify-aec.mjs <datadir>
 *
 * Der Decoder wird DIREKT aus dem Quellmodul importiert (kein Copy) — was hier
 * grün ist, ist exakt das, was der Höhenwind-Layer im Browser ausführt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeGrib2 } from '../src/sources/gribDecode.ts';

const dir = process.argv[2];
if (!dir) { console.error('usage: verify-aec.mjs <datadir>'); process.exit(2); }

const meta = JSON.parse(readFileSync(join(dir, 'ref_meta.json'), 'utf8'));
const FILES = {
  U850: 'icon-eu_europe_regular-lat-lon_pressure-level_2026061700_000_850_U.grib2',
  V850: 'icon-eu_europe_regular-lat-lon_pressure-level_2026061700_000_850_V.grib2',
  U700: 'icon-eu_europe_regular-lat-lon_pressure-level_2026061700_000_700_U.grib2',
  V700: 'icon-eu_europe_regular-lat-lon_pressure-level_2026061700_000_700_V.grib2',
  U500: 'icon-eu_europe_regular-lat-lon_pressure-level_2026061700_000_500_U.grib2',
  V500: 'icon-eu_europe_regular-lat-lon_pressure-level_2026061700_000_500_V.grib2',
};

/** Minimaler .npy-float64-Reader (little-endian, 1-D C-Array). */
function readNpyF64(path) {
  const buf = readFileSync(path);
  if (buf.toString('latin1', 0, 6) !== '\x93NUMPY') throw new Error('kein npy');
  const hlen = buf.readUInt16LE(8);
  const header = buf.toString('latin1', 10, 10 + hlen);
  if (!/'<f8'/.test(header)) throw new Error('npy nicht <f8: ' + header);
  const data = buf.subarray(10 + hlen);
  return new Float64Array(data.buffer, data.byteOffset, data.byteLength / 8);
}

let allPass = true;
for (const [tag, fn] of Object.entries(FILES)) {
  const m = meta[tag];
  const raw = new Uint8Array(readFileSync(join(dir, fn)));
  const f = decodeGrib2(raw);
  const ref = readNpyF64(join(dir, `ref_${tag}.npy`));

  // Skalierungskonstanten zum Zurückrechnen Float→Pack-Integer (D=0 hier).
  const scaleE = Math.pow(2, m.E), scaleD = Math.pow(10, -m.D);
  const toInt = (v, R) => Math.round((v / scaleD - R) / scaleE);

  let n = f.values.length, maxAbs = 0, intMismatch = 0, firstBad = -1;
  let dimOk = f.ni === m.Ni && f.nj === m.Nj && n === m.n;
  for (let i = 0; i < n; i++) {
    const a = f.values[i], b = ref[i];
    const d = Math.abs(a - b);
    if (d > maxAbs) maxAbs = d;
    // Bit-genau: aus beiden Float-Werten den ganzzahligen Packwert rekonstruieren.
    const ia = toInt(a, m.R), ib = toInt(b, m.R);
    if (ia !== ib) { intMismatch++; if (firstBad < 0) firstBad = i; }
  }
  const pass = dimOk && intMismatch === 0 && maxAbs < 1e-3;
  allPass &&= pass;
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${tag}  dims ${f.ni}x${f.nj}` +
    `${dimOk ? '' : ` ≠ ${m.Ni}x${m.Nj}!`}  n=${n}  ` +
    `maxAbsDiff=${maxAbs.toExponential(2)}  intMismatch=${intMismatch}` +
    (firstBad >= 0 ? ` (first@${firstBad})` : '') +
    `  range[${f.values.reduce((p,c)=>Math.min(p,c),Infinity).toFixed(2)},` +
    `${f.values.reduce((p,c)=>Math.max(p,c),-Infinity).toFixed(2)}]`
  );
}
console.log(allPass ? '\nALL FIELDS BIT-EXACT vs eccodes ✓' : '\nVERIFICATION FAILED ✗');
process.exit(allPass ? 0 : 1);
