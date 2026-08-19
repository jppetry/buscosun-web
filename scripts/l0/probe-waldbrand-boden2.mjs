/**
 * L0-Sonde WT1 · Nachfassen — zwei Befunde aus `probe-waldbrand-boden.mjs`,
 * die nicht stehen bleiben dürfen:
 *
 *  (A) Die Ebenen **81, 243 und 729 mm** lieferten in ALLEN fünf Kennzahlen
 *      identische Werte (min −0,9289 · max 1,6271 · Mittel 0,6253 · <0: 650 ·
 *      >1: 106 371). Drei verschiedene Bodentiefen mit bitgleicher Statistik ist
 *      kein plausibles Messergebnis. Entweder liefert DWD dieselben Daten, oder
 *      **unser Decoder liest die falsche Nachricht** — z. B. weil die Datei
 *      mehrere GRIB-Nachrichten enthält und `decodeGrib2` nur die erste nimmt.
 *      Ungeklärt gebaut, zeigte der Modus „Wurzelzone" die falsche Tiefe.
 *
 *  (B) `smi` liegt NICHT in 0..1, sondern gemessen in −0,93 … +2,15. Bevor eine
 *      Rampe darauf gelegt wird, muss klar sein, was unter 0 und über 1 bedeutet
 *      — und ob die Extremwerte echte Zellen sind oder Füllwerte (die Lehre aus
 *      F1: −999,9-Sentinels sahen wie gültige Werte aus).
 *
 * Schreibt nach `audit/l0/waldbrand-boden-smi-2.json`. Kein Produktcode.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { decodeGrib2, decodeGrib2All } from '../../src/sources/gribDecode.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'audit', 'l0', 'waldbrand-boden-smi-2.json');
const BASE = 'https://opendata.dwd.de/weather/nwp/icon-d2/grib';
const pad3 = (n) => String(n).padStart(3, '0');

async function bunzip(buf) {
  const { default: bz2 } = await import('bz2');
  return bz2.decompress(new Uint8Array(buf));
}
const sha = (u8) => createHash('sha256').update(Buffer.from(u8)).digest('hex').slice(0, 16);

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

async function raw(hh, runStr, param, step, level) {
  const name = `icon-d2_germany_regular-lat-lon_soil-level_${runStr}_${pad3(step)}_${level}_${param}.grib2.bz2`;
  const res = await fetch(`${BASE}/${hh}/${param}/${name}`);
  if (!res.ok) throw new Error(`${res.status} ${name}`);
  const packed = new Uint8Array(await res.arrayBuffer());
  return { name, packed, entpackt: await bunzip(packed.buffer) };
}

const report = { erzeugt: new Date().toISOString(), befunde: {} };
const log = (...a) => console.log(...a);

const run = await resolveRun('smi');
if (!run) { console.error('kein Lauf'); process.exit(1); }
report.befunde.lauf = run;
log(`Lauf ${run.runStr} (${run.hh}z)\n`);

// --- (A) Sind die tiefen Ebenen wirklich dieselben Daten? --------------------
log('— (A) Ebenen 27 / 81 / 243 / 729 mm: Bytes, Nachrichtenzahl, Ebenen-Metadatum —');
const tief = {};
for (const lvl of [9, 27, 81, 243, 729]) {
  try {
    const r = await raw(run.hh, run.runStr, 'smi', 0, lvl);
    const alle = decodeGrib2All(r.entpackt);
    const erste = decodeGrib2(r.entpackt);
    // Prüfsumme über die WERTE, nicht über die Datei: zwei Dateien können sich
    // im Header (Ebenen-Kodierung!) unterscheiden und dieselben Werte tragen.
    const werteHash = sha(new Uint8Array(Float32Array.from(
      erste.values, (v) => (Number.isFinite(v) ? v : -9999)).buffer));
    tief[lvl] = {
      datei: r.name,
      bytesGepackt: r.packed.length,
      bytesEntpackt: r.entpackt.length,
      dateiHash: sha(r.entpackt),
      nachrichtenInDatei: alle.length,
      werteHash,
      ni: erste.ni, nj: erste.nj,
    };
    log(`  ${String(lvl).padStart(3)} mm  gepackt ${String(r.packed.length).padStart(7)} B  `
      + `entpackt ${String(r.entpackt.length).padStart(8)} B  Nachrichten ${alle.length}  `
      + `Datei ${tief[lvl].dateiHash}  Werte ${werteHash}`);
  } catch (e) {
    tief[lvl] = { fehler: String(e.message ?? e) };
    log(`  ${lvl} mm  FEHLER ${e.message ?? e}`);
  }
}
report.befunde.tiefeEbenen = tief;

const hashes = Object.entries(tief).filter(([, v]) => v.werteHash).map(([k, v]) => [k, v.werteHash]);
const gruppen = new Map();
for (const [lvl, h] of hashes) gruppen.set(h, [...(gruppen.get(h) ?? []), lvl]);
report.befunde.werteGruppen = [...gruppen.values()];
log('\n  Ebenen mit IDENTISCHEN Werten:', [...gruppen.values()].map((g) => g.join('=')).join('  ·  '));
const dateiGruppen = new Map();
for (const [lvl, v] of Object.entries(tief)) {
  if (!v.dateiHash) continue;
  dateiGruppen.set(v.dateiHash, [...(dateiGruppen.get(v.dateiHash) ?? []), lvl]);
}
log('  Ebenen mit IDENTISCHER DATEI:  ', [...dateiGruppen.values()].map((g) => g.join('=')).join('  ·  '));

// --- (B) Was bedeuten die Werte außerhalb 0..1? -----------------------------
log('\n— (B) Wertebereich: echte Zellen oder Füllwerte? (Ebene 9 mm, Schritt 0) —');
try {
  const r = await raw(run.hh, run.runStr, 'smi', 0, 9);
  const f = decodeGrib2(r.entpackt);
  const v = f.values;

  // Häufigste exakte Werte — ein Füllwert sticht als Massenwert heraus.
  const zaehler = new Map();
  for (let i = 0; i < v.length; i++) {
    if (!Number.isFinite(v[i])) continue;
    const k = v[i].toFixed(4);
    zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
  }
  const top = [...zaehler.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([wert, n]) => ({ wert: +wert, zellen: n }));

  const sortiert = [...v].filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p) => +sortiert[Math.floor(p * (sortiert.length - 1))].toFixed(4);
  const perzentile = { p0: q(0), p1: q(0.01), p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), p99: q(0.99), p100: q(1) };

  report.befunde.werteverteilung = {
    haeufigsteWerte: top, perzentile,
    anteilUnter0: +(sortiert.filter((x) => x < 0).length / sortiert.length).toFixed(4),
    anteilUeber1: +(sortiert.filter((x) => x > 1).length / sortiert.length).toFixed(4),
    nanZellen: v.length - sortiert.length,
  };
  log('  häufigste Werte:', top.map((t) => `${t.wert}×${t.zellen}`).join('  '));
  log('  Perzentile:', JSON.stringify(perzentile));
  log(`  unter 0: ${(100 * report.befunde.werteverteilung.anteilUnter0).toFixed(1)} %  ·  `
    + `über 1: ${(100 * report.befunde.werteverteilung.anteilUeber1).toFixed(1)} %  ·  `
    + `NaN: ${report.befunde.werteverteilung.nanZellen}`);
} catch (e) {
  report.befunde.werteverteilung = { fehler: String(e.message ?? e) };
  log(`  FEHLER ${e.message ?? e}`);
}

// --- (C) Sind die NaN-Zellen wirklich Wasser/außerhalb? ---------------------
log('\n— (C) Gegenprobe der Maske gegen fr_land (Landanteil, zeitinvariant) —');
try {
  const name = `icon-d2_germany_regular-lat-lon_time-invariant_${run.runStr}_000_0_fr_land.grib2.bz2`;
  const res = await fetch(`${BASE}/${run.hh}/fr_land/${name}`);
  if (!res.ok) throw new Error(String(res.status));
  const land = decodeGrib2(await bunzip(await res.arrayBuffer()));
  const r = await raw(run.hh, run.runStr, 'smi', 0, 9);
  const smi = decodeGrib2(r.entpackt);
  let nanUeberWasser = 0, nanUeberLand = 0, wertUeberWasser = 0, wertUeberLand = 0;
  for (let i = 0; i < smi.values.length; i++) {
    const istLand = Number.isFinite(land.values[i]) && land.values[i] >= 0.5;
    if (!Number.isFinite(smi.values[i])) { istLand ? nanUeberLand++ : nanUeberWasser++; }
    else { istLand ? wertUeberLand++ : wertUeberWasser++; }
  }
  report.befunde.maske = { nanUeberWasser, nanUeberLand, wertUeberWasser, wertUeberLand };
  log(`  NaN über Wasser ${nanUeberWasser}  ·  NaN über Land ${nanUeberLand}`);
  log(`  Wert über Wasser ${wertUeberWasser}  ·  Wert über Land ${wertUeberLand}`);
} catch (e) {
  report.befunde.maske = { fehler: String(e.message ?? e) };
  log(`  FEHLER ${e.message ?? e}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
log(`\nBefund geschrieben: ${OUT}`);
