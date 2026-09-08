/**
 * Gate für **buscosun Fusion** (`src/pointForecast/fusion/`).
 *
 *   npm run verify:pv-fusion
 *
 * Importiert die ECHTEN Module (kein Copy) — was hier grün ist, ist exakt die
 * Rechnung, die der Browser fährt. Netzfrei und deterministisch, damit der Lauf
 * ins PR-Gate (`ci.yml`) kann.
 *
 * Die sechs Prüfmittel entsprechen der Kette aus `fuse.ts` und ihrem Adapter:
 *   dist          Verteilungsalgebra (inkl. analytischer Gegenprobe des CRPS)
 *   combine       Minimum-Varianz-Kombination mit Fehlerkorrelation
 *   terrainScale  Geländestreuung als physikalische Repräsentativitätsgrundlage
 *   meteo         Feuchtkugel, Phasenwahrscheinlichkeit, Regime-Aufweitung
 *   fuse          die vollständige Kette am Punkt
 *   attach        der Adapter mit synthetischer Klimatologie (K-1-Verdrahtung, K-3-Verweigerung)
 *
 * Jedes Prüfmittel enthält mindestens eine NEGATIVKONTROLLE — einen Fall, der
 * fehlschlagen MUSS, wenn ein Kernmechanismus still abgeschaltet wird. Ohne die
 * beweist ein grüner Lauf nichts (Lehre aus der Satelliten-Linie SAT2h).
 */
import { verifyDist } from '../src/pointForecast/fusion/dist.ts';
import { verifyCombine } from '../src/pointForecast/fusion/combine.ts';
import { verifyTerrainScale } from '../src/pointForecast/fusion/terrainScale.ts';
import { verifyMeteo } from '../src/pointForecast/fusion/meteo.ts';
import { verifyFuse } from '../src/pointForecast/fusion/fuse.ts';
import { verifyAttach } from '../src/pointForecast/fusion/attach.ts';
import { verifyAnchor } from '../src/pointForecast/anchor.ts';
import { verifyAnchorQC } from '../src/pointForecast/pointForecast.ts';

const SUITES = [
  ['Verteilungen (dist)', verifyDist],
  ['Kombination (combine)', verifyCombine],
  ['Geländeskalen (terrainScale)', verifyTerrainScale],
  ['Meteorologie (meteo)', verifyMeteo],
  ['Fusionskette (fuse)', verifyFuse],
  ['Adapter (attach)', verifyAttach],
  // Altpfad: Stationsanker als Innovations-Persistenz (V-PV-19) — reine Rechnung
  // und die Verdrahtung in `getPointForecast` (`verifyAnchorQC`).
  ['Stationsanker (anchor)', verifyAnchor],
  ['Stationsanker im Blend (pointForecast)', verifyAnchorQC],
];

let total = 0;
let failed = 0;

for (const [title, run] of SUITES) {
  const res = await run();
  console.log(`\n${title}:\n`);
  for (const c of res.checks) {
    const mark = c.ok ? '✓' : '✗';
    const detail = c.detail ? `  — ${c.detail}` : '';
    console.log(`  ${mark} ${c.name}${detail}`);
  }
  console.log(`\n  ${res.passed}/${res.checks.length} passed, ${res.failed} failed`);
  total += res.checks.length;
  failed += res.failed;
}

console.log(`\n────────────────────────────────────────────`);
console.log(`  Gesamt: ${total - failed}/${total} passed, ${failed} failed\n`);

process.exit(failed === 0 ? 0 : 1);
