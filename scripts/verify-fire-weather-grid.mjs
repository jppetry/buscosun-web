/**
 * Headless-Verifikation „Waldbrand: Feuerwetter-Raster (reine Zellrechnung)"
 * (Phase WF2, Gate GWF2).
 *
 *   npm run verify:fire-weather-grid
 *
 * Prüft `src/fire/fwi/fireWeatherGrid.ts` — die DOM-freie Hälfte des
 * ICON-D2-Raster-Producers — gegen die Punktkette aus `fwi.ts`: eine Zelle muss
 * dasselbe ergeben wie ein Punkt (D-12). Dazu die Maskenregeln (Domäne, Schnee,
 * fehlender Wind, fehlender Vorgänger-Niederschlag) und die Ehrlichkeitsregel
 * „ohne BUI kein FWI". Zusätzlich ein größerer synthetischer Lauf (608×373
 * Zellen × 13 Schritte) als Kosten-Anker für die Kettenrechnung.
 *
 * Netzfrei, dependency-frei. Was hier NICHT geprüft wird: Fetch, Canvas,
 * Laufauswahl (`src/sources/iconD2FireWeather.ts`, Browser-Smoke).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFireWeatherGrid, initFfmcState, stepFireWeather, allocFireWeatherBuffers, KELVIN_OFFSET, MS_TO_KMH,
} from '../src/fire/fwi/fireWeatherGrid.ts';
import { hffmcChain, isi } from '../src/fire/fwi/fwi.ts';
import { verifyIconD2FireWeather, ICON_D2_FIRE_WEATHER_ATTRIBUTION } from '../src/sources/iconD2FireWeather.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Eingebettete Selbstverifikation ------------------------------------
for (const c of verifyFireWeatherGrid().checks) add(`[grid] ${c.name}`, c.ok, c.detail);

for (const c of verifyIconD2FireWeather().checks) add(`[producer] ${c.name}`, c.ok, c.detail);

// --- (2) Größerer synthetischer Lauf: Parität + Kosten ----------------------
{
  const w = 608, h = 373, n = w * h, steps = 13;
  // deterministisches Wetterfeld: RH 25..75 % über x, T 15..30 °C über y, Wind 2..8 m/s
  const rh = new Float32Array(n), t = new Float32Array(n), u = new Float32Array(n), v = new Float32Array(n);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    rh[k] = 25 + 50 * (i / (w - 1));
    t[k] = KELVIN_OFFSET + 15 + 15 * (j / (h - 1));
    u[k] = 2 + 6 * ((i * 7 + j * 3) % 11) / 10; v[k] = 0;
  }
  // Rand-Maske wie die GRIB-Bitmap: erste Spalte NaN
  for (let j = 0; j < h; j++) rh[j * w] = NaN;
  const acc = () => new Float32Array(n); // kein Regen
  const state = initFfmcState({ stepHours: 0, validAtMs: 0, rh, t2mK: t, u, v, totPrec: acc(), totPrecPrev: acc(), hSnow: null }, null);
  const s0 = state[12345];
  const t0 = performance.now();
  let last = null;
  for (let s = 0; s < steps; s++) {
    last = stepFireWeather(state, { stepHours: s, validAtMs: s * 3_600_000, rh, t2mK: t, u, v, totPrec: acc(), totPrecPrev: acc(), hSnow: null }, null);
  }
  const ms = performance.now() - t0;
  const k = 12345;
  const hours = Array.from({ length: steps }, () => ({ t: t[k] - KELVIN_OFFSET, rh: rh[k], w: MS_TO_KMH * Math.hypot(u[k], v[k]), r1h: 0 }));
  const chain = hffmcChain(s0, hours);
  add(`608×373 × ${steps} Schritte: Zelle 12345 == Punktkette`, Math.abs(last.ffmc[k] - chain[steps - 1]) < 1e-4, `${last.ffmc[k].toFixed(4)} vs ${chain[steps - 1].toFixed(4)}`);
  add('ISI der Zelle == isi(FFMC, W)', Math.abs(last.isi[k] - isi(last.ffmc[k], hours[0].w)) < 1e-4);
  add('Randspalte bleibt maskiert', last.mask[0] === 0 && last.mask[w * 5] === 0 && Number.isNaN(last.isi[w * 5]));
  add('Innere Zellen gültig', last.mask[k] === 1);
  // Kosten-Anker, kein Gate auf die Millisekunde: ein voller Schritt kostet in
  // Node ~90 ms — im Browser wird er deshalb in Scheiben gerechnet (`from`/`to`),
  // damit kein Long Task entsteht. Die Schranke schützt vor Regression (2×).
  add(`Kettenkosten je Schritt gemessen (Anker < 200 ms; Node ${(ms / steps).toFixed(1)} ms)`, ms / steps < 200, `${ms.toFixed(0)} ms gesamt für ${steps} Schritte`);
  // Scheibenrechnung: vier Slices geben dasselbe wie ein Durchlauf (Stichprobe).
  {
    const stA = initFfmcState({ stepHours: 0, validAtMs: 0, rh, t2mK: t, u, v, totPrec: acc(), totPrecPrev: acc(), hSnow: null }, null);
    const stB = stA.slice();
    const f = { stepHours: 1, validAtMs: 3_600_000, rh, t2mK: t, u, v, totPrec: acc(), totPrecPrev: acc(), hSnow: null };
    const whole = stepFireWeather(stA, f, null);
    const buf = allocFireWeatherBuffers(n, false);
    const slice = Math.ceil(n / 4);
    let sliced = null;
    for (let s = 0; s < 4; s++) sliced = stepFireWeather(stB, f, null, buf, s * slice, Math.min(n, (s + 1) * slice));
    let diff = 0;
    for (let i = 0; i < n; i += 997) { const a = whole.isi[i], b = sliced.isi[i]; if (!(Number.isNaN(a) && Number.isNaN(b))) diff = Math.max(diff, Math.abs(a - b)); }
    add('vier Scheiben == ein Durchlauf', diff < 1e-6, `max |Δ| ${diff}`);
  }
}

// --- (3) Quell-Sonde ---------------------------------------------------------
const src = readFileSync(join(ROOT, 'src', 'fire', 'fwi', 'fireWeatherGrid.ts'), 'utf8');
const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
add('fireWeatherGrid.ts importiert nur ./fwi', (body.match(/^\s*import\s[^\n]*from\s+['"]([^'"]+)['"]/gm) ?? []).every((l) => /['"]\.\/fwi['"]/.test(l)));
add('fireWeatherGrid.ts ist DOM-, Netz- und Zeit-frei', !/\bdocument\s*\.|\bwindow\s*\.|\bfetch\s*\(|Date\.now\(\)|createElement/.test(body));
add('kein Zellwert 0 als Ersatz für „unbekannt" — NaN/Maske statt 0', /NaN/.test(body) && /mask\[k\] = 0/.test(body));
const prod = readFileSync(join(ROOT, 'src', 'sources', 'iconD2FireWeather.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
add('Producer holt u/v über den gewärmten Wind-Pfad, den Rest über /_dwd_grib',
  /'u_10m',\s*step,\s*D2_WIND_PROXY_BASE/.test(prod) && /'v_10m',\s*step,\s*D2_WIND_PROXY_BASE/.test(prod) && /'relhum_2m',\s*step,\s*signal,\s*D2_GRIB_PROXY_BASE/.test(prod));
add('Producer nutzt das Jetzt-Fenster (stepsForNowWindow), keine starre 0…12', /stepsForNowWindow\(steps, runAt, aheadHours\)/.test(prod));
add('Producer rechnet in Scheiben mit Yield (kein Long Task)', /SLICE_CELLS/.test(prod) && /yieldMain\(\)/.test(prod));
add('Producer importiert nichts aus src/map oder MapView', !/from\s+['"]\.\.\/(map|MapView)/.test(prod));
add('Attribution des Producers hat „kein amtliches Produkt"', /kein amtliches Produkt/.test(ICON_D2_FIRE_WEATHER_ATTRIBUTION));

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
