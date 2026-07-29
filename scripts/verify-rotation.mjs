/**
 * Headless-Verifikation des Rotationspotenzial-Layers (Feature F5) — prüft die
 * REINE Fusions- + Glättungslogik am ECHTEN App-Code (`src/radar/rotationPotential.ts`),
 * so wie sie `iconD2Rotation.ts` nutzt. Kein GPU / kein Fetch / kein Vitest.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-rotation.mjs
 *
 * Deckt die Gate-GF5-Fusionschecks (audit §7.1):
 *   ruhig→keine · hohe UH+SDI→hoch · schwache UH→gering · Glättung dämpft
 *   Einzelpixel · Score monoton & clamped 0..100 · SDI boost-only · Vorzeichen-
 *   invarianz · NaN-Maske transparent.
 */
import {
  rotationScore, uhScore, sdiScore, levelOf, smoothScores,
  neighborhoodMax, neighborhoodMean, verifyRotationPotential,
} from '../src/radar/rotationPotential.ts';

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// (1) Die im App-Code eingebettete Selbst-Verifikation (window.__verifyRotationPotential).
const inApp = verifyRotationPotential();
for (const c of inApp.checks) add(`[app] ${c.name}`, c.ok, c.detail);

// (2) Zusätzliche unabhängige Kontrollen gegen die exportierten Rampen/Helfer.

// Rampen-Ankerpunkte an der gemessenen ICON-D2-Skala (audit §8.4).
add('uhScore(3)=0 (unter Schwelle)', uhScore(3) === 0, `${uhScore(3)}`);
add('uhScore(20)=75', Math.abs(uhScore(20) - 75) < 1e-9, `${uhScore(20)}`);
add('uhScore monoton', uhScore(5) < uhScore(10) && uhScore(10) < uhScore(40), `${uhScore(5)},${uhScore(10)},${uhScore(40)}`);
add('uhScore geklemmt bei 60→100', uhScore(200) === 100, `${uhScore(200)}`);
add('sdiScore(0)=0', sdiScore(0) === 0, `${sdiScore(0)}`);
add('sdiScore(5e-4)≈35 (winzige Skala)', Math.abs(sdiScore(5e-4) - 35) < 1e-9, `${sdiScore(5e-4)}`);

// levelOf-Schwellen 20/40/60/80.
add('levelOf(19)=keine', levelOf(19).level === 'none', levelOf(19).label);
add('levelOf(20)=gering', levelOf(20).level === 'low', levelOf(20).label);
add('levelOf(80)=hoch', levelOf(80).level === 'high', levelOf(80).label);

// Fusion: realistischer Kalibrier-Tag (24.07.) — Alpen-Hotspot |UH|~8 → gering,
// nicht hoch; Hintergrund ~0,05 → keine.
add('24.07. Hotspot (8) → gering', levelOf(rotationScore(8, 4, 0)).level === 'low', `${rotationScore(8, 4, 0)}`);
// Hintergrund: winziges sdi_2 (3e-5) trägt ~1 bei — bleibt weit unter der
// Aktivierungsschwelle (level 'none' → transparent via visRange ~Score 18).
add('24.07. Hintergrund (0,05) → keine/transparent', levelOf(rotationScore(0.05, 0.03, 3e-5)).level === 'none', `${rotationScore(0.05, 0.03, 3e-5)}`);

// Untere Schicht kann die stärkere sein (max der beiden).
add('uh_max_low dominiert wenn stärker', rotationScore(2, 25, 0) === rotationScore(25, 2, 0), `${rotationScore(2, 25, 0)}=${rotationScore(25, 2, 0)}`);

// SDI hebt an, senkt nie (Korroboration).
add('SDI senkt nie', rotationScore(15, 0, 1e-2) >= rotationScore(15, 0, 0), `${rotationScore(15, 0, 0)}→${rotationScore(15, 0, 1e-2)}`);

// Glättung: neighborhoodMax dilatiert, neighborhoodMean dämpft — beide NaN-erhaltend.
{
  const W = 7, H = 7, g = new Float32Array(W * H).fill(0);
  g[3 * W + 3] = 90;
  const mx = neighborhoodMax(g, W, H, 1);
  add('neighborhoodMax dilatiert Hotspot', mx[3 * W + 4] === 90, `${mx[3 * W + 4]}`);
  const mn = neighborhoodMean(g, W, H, 2);
  add('neighborhoodMean dämpft Hotspot', mn[3 * W + 3] < 90 && mn[3 * W + 3] > 0, `${mn[3 * W + 3].toFixed(2)}`);
  // Einzelpixel nach voller Glättung deutlich unter Rohwert.
  const sm = smoothScores(g, W, H);
  add('smoothScores dämpft Einzelpixel < 50 % Rohwert', sm[3 * W + 3] < 45, `${sm[3 * W + 3].toFixed(2)}`);
}

// Glättung erhält NaN-Maske am Rand (Domänenrand transparent, nie 0).
{
  const W = 5, H = 5, g = new Float32Array(W * H).fill(30);
  g[0] = NaN; g[W * H - 1] = NaN;
  const sm = smoothScores(g, W, H);
  add('Domänenrand bleibt NaN (transparent)', Number.isNaN(sm[0]) && Number.isNaN(sm[W * H - 1]), `${sm[0]},${sm[W * H - 1]}`);
  add('Innenfläche endlich (gerendert)', Number.isFinite(sm[2 * W + 2]), `${sm[2 * W + 2]}`);
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
