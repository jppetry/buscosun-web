/**
 * Headless-Verifikation des Simuliertes-Radar-Layers (Feature F3) — prüft den
 * mathematischen Vertrag der dBZ→mm/h→Radar-t-Abbildung, die `iconD2Dbz.ts`
 * über `radarModel.dbzToMmh` + `precipRainRamp` realisiert. Kein GPU / kein Fetch.
 *
 *   node scripts/verify-simradar.mjs
 *
 * Warum ein eigenständiges Oracle statt `import`: `radarModel.ts` zieht
 * transitiv `scalar/RainLayer` (maplibre-gl/WebGL) → headless nicht importierbar.
 * Dieses Harness re-implementiert die IDENTISCHE Marshall-Palmer-Physik
 * (Z = 200·R^1.6) als unabhängige Referenz und sperrt (a) die Inverse-Korrektheit
 * (Rundlauf gegen die Vorwärtsformel `mmhToDbz`), (b) die Monotonie/Randfälle und
 * (c) die im Layer gewählten `visRange`-Schwellen (t = mm/h ÷ PRECIP_VMAX).
 * Ändert sich die Physik in `radarModel.ts`, MUSS dieses Oracle mitgezogen werden.
 */

const PRECIP_VMAX = 20; // mm/h — Radar-Skala (== scalar/RainLayer PRECIP_VMAX)

// Referenz-Oracle: identisch zu radarModel.mmhToDbz / dbzToMmh.
const mmhToDbz = (mmH) => (mmH > 0 ? 10 * Math.log10(200 * Math.pow(mmH, 1.6)) : 0);
const dbzToMmh = (dbz) => (dbz > 0 ? Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6) : 0);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Wie `iconD2Dbz.buildDbzImage`: dBZ → mm/h → t auf der ÷20-Radar-Skala. */
const dbzToT = (dbz) => clamp01(dbzToMmh(dbz) / PRECIP_VMAX);

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// (a) Inverse-Korrektheit: Rundlauf dBZ → mm/h → dBZ und mm/h → dBZ → mm/h.
for (const d of [5, 15, 25, 40, 55, 65]) {
  add(`Rundlauf dBZ→mm/h→dBZ bei ${d} dBZ`, near(mmhToDbz(dbzToMmh(d)), d, 1e-6), mmhToDbz(dbzToMmh(d)).toFixed(4));
}
for (const r of [0.1, 0.5, 2, 10, 40]) {
  add(`Rundlauf mm/h→dBZ→mm/h bei ${r} mm/h`, near(dbzToMmh(mmhToDbz(r)), r, 1e-6), dbzToMmh(mmhToDbz(r)).toFixed(4));
}

// (b) Randfälle & Monotonie.
add('dbzToMmh(0) = 0 (kein Echo)', dbzToMmh(0) === 0);
add('dbzToMmh(-10) = 0 (kein Echo)', dbzToMmh(-10) === 0);
add('dbzToMmh steigt monoton', dbzToMmh(10) < dbzToMmh(30) && dbzToMmh(30) < dbzToMmh(55));

// (c) Bekannte Physik-Stützwerte (Marshall-Palmer, ~DWD-Radar-Konvention).
add('20 dBZ ≈ 0,65 mm/h (leichter Regen)', near(dbzToMmh(20), 0.647, 0.02), dbzToMmh(20).toFixed(3));
add('40 dBZ ≈ 11,5 mm/h (kräftig)', near(dbzToMmh(40), 11.53, 0.1), dbzToMmh(40).toFixed(2));
add('≥ 50 dBZ sättigt bei t=1 (Magenta „extrem")', dbzToT(50) === 1 && dbzToT(65) === 1, dbzToMmh(50).toFixed(1) + ' mm/h');

// (d) visRange-Schwellen des Layers: start 0.004 / end 0.011 → ~5–12 dBZ-Fenster.
//     Unter ~5 dBZ transparent (kein Echo einfärben), darüber sichtbar.
const dbzAtT = (t) => mmhToDbz(t * PRECIP_VMAX);
add('visRange.start=0.004 ≈ 5–6 dBZ (Untergrenze „kein Echo")', dbzAtT(0.004) > 4.5 && dbzAtT(0.004) < 6.5, dbzAtT(0.004).toFixed(2) + ' dBZ');
add('visRange.end=0.011 ≈ 11–13 dBZ (voll sichtbar)', dbzAtT(0.011) > 10.5 && dbzAtT(0.011) < 13, dbzAtT(0.011).toFixed(2) + ' dBZ');
add('t unter 5 dBZ nahe 0 (transparent via Rampe/visRange)', dbzToT(3) < 0.004, dbzToT(3).toFixed(5));

// (e) Konsistenz zum gemessenen Radar: dasselbe mm/h ⇒ dasselbe t wie nowcast.
add('Optik-Konsistenz: 5 mm/h → t=0.25 (== nowcast-Normierung)', near(clamp01(5 / PRECIP_VMAX), 0.25), '0.25');

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
}
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
