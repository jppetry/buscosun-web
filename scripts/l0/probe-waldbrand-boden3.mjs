/**
 * L0-Sonde WT1 · dritter Durchgang — die Frage, an der die Darstellung hängt.
 *
 * Befund aus Durchgang 2 (Ebene 9 mm, Schritt 0): der **häufigste Einzelwert ist
 * exakt 0**, mit rund 256 000 von 754 862 Zellen (≈ 34 %), Median 0,05, p75 0,20.
 * Läse man `smi` naiv als „0 = Welkepunkt = maximale Trockenheit", stünde ganz
 * Deutschland auf Höchststufe — eine Vollflächen-Einfärbung, die nichts aussagt
 * (genau der Fehler, den die `visRange` des Luft-Treibers vermeidet).
 *
 * Vor der Rampe muss deshalb geklärt sein:
 *   (D) Wie verteilt sich `smi` je Ebene? Welche Ebene trägt überhaupt Kontrast?
 *   (E) Sind die Exakt-0-Zellen echte Trockenheit oder Böden ohne Wasserhaushalt
 *       (Fels, Eis, Stadt)? `soiltyp` ist die Gegenprobe — bei Fels/Eis ist SMI
 *       undefiniert und müsste transparent bleiben statt „knochentrocken".
 *
 * Schreibt nach `audit/l0/waldbrand-boden-smi-3.json`. Kein Produktcode.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGrib2 } from '../../src/sources/gribDecode.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'audit', 'l0', 'waldbrand-boden-smi-3.json');
const BASE = 'https://opendata.dwd.de/weather/nwp/icon-d2/grib';
const pad3 = (n) => String(n).padStart(3, '0');

/** ICON-Bodenarten (DWD `soiltyp`, 1..9). 1/2 tragen keinen Wasserhaushalt. */
const SOILTYP = {
  1: 'Eis', 2: 'Fels', 3: 'Sand', 4: 'sandiger Lehm', 5: 'Lehm',
  6: 'toniger Lehm', 7: 'Ton', 8: 'Torf', 9: 'Wasser',
};

async function bunzip(buf) {
  const { default: bz2 } = await import('bz2');
  return bz2.decompress(new Uint8Array(buf));
}

async function resolveRun(param) {
  const now = new Date();
  for (let back = 0; back <= 8; back++) {
    const d = new Date(now.getTime() - back * 3 * 3600_000);
    const hh = String(Math.floor(d.getUTCHours() / 3) * 3).padStart(2, '0');
    const res = await fetch(`${BASE}/${hh}/${param}/`).catch(() => null);
    if (!res || !res.ok) continue;
    const html = await res.text();
    const m = [...html.matchAll(new RegExp(
      `icon-d2_germany_regular-lat-lon_soil-level_(\\d{10})_(\\d{3})_(\\d+)_${param}\\.grib2\\.bz2`, 'g'))];
    if (m.length) return { hh, runStr: m[0][1] };
  }
  return null;
}

async function soilField(hh, runStr, step, level) {
  const name = `icon-d2_germany_regular-lat-lon_soil-level_${runStr}_${pad3(step)}_${level}_smi.grib2.bz2`;
  const res = await fetch(`${BASE}/${hh}/smi/${name}`);
  if (!res.ok) throw new Error(`${res.status} ${name}`);
  return decodeGrib2(await bunzip(await res.arrayBuffer()));
}

async function invariant(hh, runStr, param) {
  const name = `icon-d2_germany_regular-lat-lon_time-invariant_${runStr}_000_0_${param}.grib2.bz2`;
  const res = await fetch(`${BASE}/${hh}/${param}/${name}`);
  if (!res.ok) throw new Error(`${res.status} ${param}`);
  return decodeGrib2(await bunzip(await res.arrayBuffer()));
}

const report = { erzeugt: new Date().toISOString(), befunde: {} };
const log = (...a) => console.log(...a);

const run = await resolveRun('smi');
if (!run) { console.error('kein Lauf'); process.exit(1); }
report.befunde.lauf = run;
log(`Lauf ${run.runStr} (${run.hh}z)\n`);

log('— (E) Bodenart der Zellen: wo ist SMI überhaupt definiert? —');
let typ = null;
try {
  typ = await invariant(run.hh, run.runStr, 'soiltyp');
  const zaehl = {};
  for (const v of typ.values) {
    if (!Number.isFinite(v)) { zaehl.NaN = (zaehl.NaN ?? 0) + 1; continue; }
    const k = Math.round(v);
    zaehl[k] = (zaehl[k] ?? 0) + 1;
  }
  report.befunde.bodenarten = Object.fromEntries(
    Object.entries(zaehl).map(([k, n]) => [`${k} ${SOILTYP[k] ?? ''}`.trim(), n]));
  log('  ' + Object.entries(report.befunde.bodenarten).map(([k, n]) => `${k}: ${n}`).join('  ·  '));
} catch (e) {
  report.befunde.bodenarten = { fehler: String(e.message ?? e) };
  log(`  FEHLER ${e.message ?? e}`);
}

log('\n— (D) Verteilung je Ebene, NUR über echte Böden (soiltyp 3..8) —');
const proEbene = {};
for (const lvl of [0, 1, 3, 9, 27, 81, 243]) {
  try {
    const f = await soilField(run.hh, run.runStr, 0, lvl);
    const echt = [];      // nur Zellen mit wasserführendem Boden
    const alle = [];
    for (let i = 0; i < f.values.length; i++) {
      const v = f.values[i];
      if (!Number.isFinite(v)) continue;
      alle.push(v);
      const t = typ ? Math.round(typ.values[i]) : 5;
      if (t >= 3 && t <= 8) echt.push(v);
    }
    echt.sort((a, b) => a - b);
    const q = (p) => (echt.length ? +echt[Math.floor(p * (echt.length - 1))].toFixed(4) : null);
    const exakt0 = echt.filter((x) => x === 0).length;
    proEbene[lvl] = {
      zellenGesamt: alle.length, zellenEchterBoden: echt.length,
      exakt0: exakt0, anteilExakt0: +(exakt0 / echt.length).toFixed(4),
      p1: q(0.01), p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), p99: q(0.99),
      unter0: echt.filter((x) => x < 0).length,
      ueber1: echt.filter((x) => x > 1).length,
    };
    const e = proEbene[lvl];
    log(`  ${String(lvl).padStart(3)} mm  n=${e.zellenEchterBoden}  exakt0 ${(100 * e.anteilExakt0).toFixed(1)}%  `
      + `p5 ${e.p5}  p25 ${e.p25}  p50 ${e.p50}  p75 ${e.p75}  p95 ${e.p95}  `
      + `<0 ${e.unter0}  >1 ${e.ueber1}`);
  } catch (e) {
    proEbene[lvl] = { fehler: String(e.message ?? e) };
    log(`  ${lvl} mm  FEHLER ${e.message ?? e}`);
  }
}
report.befunde.verteilungProEbene = proEbene;

log('\n— (E2) Welche Bodenart tragen die Exakt-0-Zellen der Ebene 9 mm? —');
try {
  const f = await soilField(run.hh, run.runStr, 0, 9);
  const nachTyp = {};
  for (let i = 0; i < f.values.length; i++) {
    if (f.values[i] !== 0) continue;
    const t = typ ? Math.round(typ.values[i]) : -1;
    const k = `${t} ${SOILTYP[t] ?? '?'}`.trim();
    nachTyp[k] = (nachTyp[k] ?? 0) + 1;
  }
  report.befunde.exakt0NachBodenart = nachTyp;
  log('  ' + Object.entries(nachTyp).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}: ${n}`).join('  ·  '));
} catch (e) {
  report.befunde.exakt0NachBodenart = { fehler: String(e.message ?? e) };
  log(`  FEHLER ${e.message ?? e}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
log(`\nBefund geschrieben: ${OUT}`);
