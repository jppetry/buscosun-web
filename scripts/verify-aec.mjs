/**
 * Headless-Verifikation des GRIB2-CCSDS-AEC-Decoders (src/sources/gribDecode.ts)
 * gegen die eccodes-Gold-Referenz (ECMWF), wert- und bit-genau.
 *
 *   npm run verify:aec -- <datadir>
 *
 * Der Decoder wird DIREKT aus dem Quellmodul importiert (kein Copy) — was hier
 * grün ist, ist exakt das, was der Höhenwind-Layer im Browser ausführt.
 *
 * ── EHRLICHKEITS-HINWEIS ZU D-07 (V-91, 2026-08-03) ──────────────────────────
 * Die Golddaten liegen NICHT im Repo. Dieser Verifier ist damit kein laufendes
 * Gate, sondern die Wiederholbarmachung eines historischen Einmal-Ergebnisses
 * (erstmals grün 2026-06). `decisions.md` D-07 und `architecture.md` §Decoding
 * sagen das seit V-91 ausdrücklich — die frühere Formulierung „bit-verifiziert"
 * las sich wie eine dauerhaft geprüfte Zusicherung, was sie nicht war.
 * Golddaten wurden bewusst nicht eingecheckt (Jans Entscheidung 2026-08-03):
 * `.git` ist mit ~350 MB bereits ein Problem (V-08).
 *
 * ── <datadir> selbst erzeugen (braucht Python + eccodes + numpy) ─────────────
 *   1) Sechs ICON-EU-Druckflächen-Felder holen und entpacken (Lauf s. FILES):
 *      https://opendata.dwd.de/weather/nwp/icon-eu/grib/00/{u,v}/
 *      Dateinamen exakt wie in FILES unten — der Lauf 2026061700 ist auf
 *      opendata längst rotiert; mit einem aktuellen Lauf müssen FILES und
 *      ref_meta.json gemeinsam neu erzeugt werden.
 *   2) Referenz-Dump je Feld (ECMWF eccodes ist die Gold-Implementierung):
 *      import eccodes, numpy as np, json
 *      meta = {}
 *      for tag, fn in FILES.items():
 *          with open(fn,'rb') as fh: gid = eccodes.codes_grib_new_from_file(fh)
 *          vals = eccodes.codes_get_values(gid)          # float64, C-Order 1-D
 *          np.save(f'ref_{tag}.npy', vals.astype('<f8'))
 *          meta[tag] = { 'Ni': eccodes.codes_get(gid,'Ni'),
 *                        'Nj': eccodes.codes_get(gid,'Nj'),
 *                        'n':  int(vals.size),
 *                        'R':  eccodes.codes_get(gid,'referenceValue'),
 *                        'E':  eccodes.codes_get(gid,'binaryScaleFactor'),
 *                        'D':  eccodes.codes_get(gid,'decimalScaleFactor') }
 *      json.dump(meta, open('ref_meta.json','w'))
 *   3) GRIB2 + ref_*.npy + ref_meta.json in EIN Verzeichnis legen, das als
 *      <datadir> übergeben wird.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodeGrib2 } from '../src/sources/gribDecode.ts';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: npm run verify:aec -- <datadir>');
  console.error('  <datadir> enthält ref_meta.json, ref_<TAG>.npy und die sechs GRIB2-Dateien.');
  console.error('  Die Golddaten liegen NICHT im Repo — Erzeugungsanleitung im Kopf dieser Datei.');
  console.error('  Exit 2 = "kann nicht laufen" (KEIN bestandener Test, s. D-07).');
  process.exit(2);
}

const metaPath = join(dir, 'ref_meta.json');
if (!existsSync(metaPath)) {
  console.error(`FEHLT: ${metaPath}`);
  console.error('  Golddaten nicht vorhanden ⇒ D-07 ist in diesem Arbeitsbaum NICHT nachgeprüft.');
  console.error('  Erzeugungsanleitung im Kopf dieser Datei. Exit 2 = "kann nicht laufen".');
  process.exit(2);
}
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
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
