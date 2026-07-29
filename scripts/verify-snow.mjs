/**
 * Headless-Verifikation des Schnee-Layers (Feature F4) — prüft die SWE→cm-
 * Umrechnung `freshSnowCmFromSwe` (alpineSplit-Reuse, `rho_snow` bevorzugt) am
 * ECHTEN App-Code + die m→cm/Normierungs-Verträge, die `iconD2Snow.ts` nutzt.
 * Kein GPU / kein Fetch.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-snow.mjs
 */
import { freshSnowCmFromSwe } from '../src/nowcast/alpineSplit.ts';

const DEPTH_VMAX = 150, FRESH_VMAX = 50; // == iconD2Snow.ts
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// (a) Randfälle.
add('SWE 0 → 0 cm', freshSnowCmFromSwe(0) === 0);
add('SWE negativ → 0 cm', freshSnowCmFromSwe(-5) === 0);

// (b) Flat 10:1 (kein/implausibles rho) == alpineSplit-Konstante (1 cm je mm).
add('10:1 ohne rho: 5 mm → 5 cm', near(freshSnowCmFromSwe(5), 5), String(freshSnowCmFromSwe(5)));
add('10:1 ohne rho: 12 mm → 12 cm', near(freshSnowCmFromSwe(12), 12));

// (c) rho im Frischschnee-Bereich (30..250) → physikalisch cm = 100·SWE/rho.
add('rho=100 (Pulver): 5 mm → 5 cm', near(freshSnowCmFromSwe(5, 100), 5), String(freshSnowCmFromSwe(5, 100)));
add('rho=50 (leicht): 10 mm → 20 cm (mehr Tiefe)', near(freshSnowCmFromSwe(10, 50), 20));
add('rho=200 (schwer): 10 mm → 5 cm', near(freshSnowCmFromSwe(10, 200), 5));
add('rho monoton: leichter = tiefer', freshSnowCmFromSwe(10, 50) > freshSnowCmFromSwe(10, 150));

// (d) rho außerhalb Frischschnee-Bereich → 10:1-Fallback (kein Unterschätzen).
add('rho=400 (alter Pack) → Fallback 10:1: 5 mm → 5 cm', near(freshSnowCmFromSwe(5, 400), 5), String(freshSnowCmFromSwe(5, 400)));
add('rho=20 (unplausibel) → Fallback 10:1: 5 mm → 5 cm', near(freshSnowCmFromSwe(5, 20), 5));
add('rho=NaN → Fallback 10:1', near(freshSnowCmFromSwe(5, NaN), 5));
add('rho-Grenze 251 → Fallback 10:1', near(freshSnowCmFromSwe(5, 251), 5), String(freshSnowCmFromSwe(5, 251)));
add('rho-Grenze 250 → physikalisch (2 cm)', near(freshSnowCmFromSwe(5, 250), 2), String(freshSnowCmFromSwe(5, 250)));

// (e) Schneedecke m→cm→t (h_snow-Modus): R = clamp01(cm/150).
const depthT = (m) => clamp01((m * 100) / DEPTH_VMAX);
add('h_snow 1,5 m → 150 cm → t=1,0', near(depthT(1.5), 1.0), String(depthT(1.5)));
add('h_snow 2,6 m (Gletscher) → t geklemmt 1,0', depthT(2.6) === 1.0);
add('h_snow 0,3 m → 30 cm → t=0,2', near(depthT(0.3), 0.2));

// (f) Schwellen „< ~1 cm transparent" (visRange-Start je Modus).
add('Schneedecke visRange.start 0,007 ≈ 1 cm', near(0.007 * DEPTH_VMAX, 1.05, 0.1), (0.007 * DEPTH_VMAX).toFixed(2) + ' cm');
add('Neuschnee visRange.start 0,02 = 1 cm', near(0.02 * FRESH_VMAX, 1.0), (0.02 * FRESH_VMAX).toFixed(2) + ' cm');

// (g) Neuschnee-Stufen 1/5/10/25/50 cm liegen auf der ÷50-Achse in (0,1].
add('Neuschnee 50 cm → t=1,0 (Skalenende)', near(clamp01(50 / FRESH_VMAX), 1.0));
add('Neuschnee 25 cm → t=0,5', near(clamp01(25 / FRESH_VMAX), 0.5));

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
