/**
 * Gewitterpotenzial-Fusion (Feature F1) — EIN 0–100-Index je Gitterzelle aus
 * drei ICON-D2-Feldern, als flächige Vorwarnung 0–12 h VOR dem ersten Radarecho
 * (Modell-*Potenzial* statt gefallener Niederschlag):
 *
 *   • cape_ml (J/kg)  → Energie/Potenzial   (wie viel Auftrieb steht bereit)
 *   • cin_ml  (J/kg)  → Deckel/Hemmung      (wie stark unterdrückt eine Sperrschicht)
 *   • lpi     (J/kg)  → Blitzbereitschaft   (wo erzeugt das Modell Elektrifizierung)
 *
 * Bewusst ehrlich (vgl. `convectiveIndex.ts`): hohes CAPE allein ist noch KEIN
 * Gewitter. Erst das durch CIN gedeckelte Potenzial PLUS die LPI-Realisierung
 * ergeben eine belastbare Aussage — Potenzial ≠ Auslösung. Außerhalb der
 * ICON-D2-Domäne / ohne Energie: kein Wert (Aufrufer maskiert transparent).
 *
 * Reine, DOM-/Fetch-freie Funktion → headless gegen einen Node-Harness
 * verifizierbar (`scripts/verify-thunder.mjs`), ohne Browser. Der Grid-Loader
 * `src/sources/iconD2Thunder.ts` ruft `thunderScore()` je Zelle.
 *
 * Rampen-Reuse: `ramp`/`capeScore` kommen aus `convectiveIndex.ts` (identische
 * DACH-Schwellen) — hier ergänzt um `cinGate` (Deckel) und `lpiScore` (Auslösung).
 */

import { ramp, capeScore } from './convectiveIndex';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * CIN-Deckel → 0..1 (Multiplikator auf das Potenzial). Rechnet auf dem BETRAG
 * `|CIN|` und ist damit unabhängig von der DWD-Vorzeichen-Konvention (Diagnose
 * §8.2: cin_ml decodiert real als POSITIVER Betrag 0..~320 J/kg): |CIN| klein →
 * 1 (offen), |CIN| groß → →0 (gedeckelt).
 * 0→1,0 · 50→0,85 · 100→0,6 · 200→0,3 · 400→0,1 (darunter/​darüber geklemmt).
 *
 * Sentinel-fest (Diagnose §8.2, am echten Feld belegt): DWD kodiert fehlende
 * CIN-Werte als **−999,9** (Fill) — auf ~236 k In-Domänen-Zellen. `Math.abs`
 * allein machte daraus einen riesigen (Schein-)Deckel (lid→0,1). Ein fehlender
 * CIN ist aber „kein Deckel-Wissen", kein starker Deckel → als lid=1 behandeln.
 * Ein physikalischer CIN-Betrag > ~900 J/kg ist unrealistisch → als Fill werten
 * (deckt −999,9 UND ein hypothetisches +999,9-Fill ab, vorzeichen-invariant).
 */
export function cinGate(cinJkg: number): number {
  if (!Number.isFinite(cinJkg)) return 1;   // kein CIN → kein Deckel
  const mag = Math.abs(cinJkg);
  if (mag >= 900) return 1;                 // DWD-Fill (−999,9) = fehlender Wert → kein Deckel
  return ramp(mag, [[0, 1.0], [50, 0.85], [100, 0.6], [200, 0.3], [400, 0.1]]);
}

/**
 * LPI (Lightning Potential Index, J/kg) → 0..100 Auslöse-/Blitz-Realisierung.
 * ICON-D2 gibt LPI nur in konvektionserlaubenden Lagen aus (sonst ~0) → als
 * Realisierungs-Booster, nicht als alleinige Basis.
 * 0→0 · 1→10 · 3→30 · 8→60 · 15→85 · 30→100.
 */
export function lpiScore(lpiJkg: number): number {
  return ramp(lpiJkg, [[0, 0], [1, 10], [3, 30], [8, 60], [15, 85], [30, 100]]);
}

/** Fünfstufige Schwellen (identisch zu `convectiveIndex.levelOf`): keine · gering ·
 *  erhöht · deutlich · hoch. Für Legende + Tooltip. */
export type ThunderLevel = 'none' | 'low' | 'elevated' | 'moderate' | 'high';
export function thunderLevelOf(score: number): { level: ThunderLevel; label: string } {
  if (score < 8) return { level: 'none', label: 'keine' };
  if (score < 30) return { level: 'low', label: 'gering' };
  if (score < 55) return { level: 'elevated', label: 'erhöht' };
  if (score < 78) return { level: 'moderate', label: 'deutlich' };
  return { level: 'high', label: 'hoch' };
}

/**
 * Fusioniert cape/cin/lpi einer Zelle zum 0–100-Gewitterpotenzial (§3):
 *
 *   pot   = capeScore(cape)                       // 0..100
 *   lid   = cinGate(|cin|)                        // 0..1 (Deckel)
 *   real  = lpiScore(lpi)                         // 0..100 (Auslösung)
 *   base  = pot * lid / 100                       // gedeckeltes Potenzial (0..100)
 *   syn   = (base > 40 && real > 30) ? 15 : 0     // Potenzial UND Realisierung = klassische Lage
 *   score = clamp(round(0.55*base + 0.45*real + syn), 0, 100)
 *
 * `cape` ist der Energieanker: ist er nicht endlich (außerhalb Domäne), liefert
 * die Funktion `NaN` → der Aufrufer maskiert die Zelle transparent (nie 0).
 * `cin`/`lpi` nicht endlich im Inneren → als „kein Deckel"/„keine Auslösung"
 * behandelt (Betrag 0 / 0), nicht maskiert.
 */
export function thunderScore(cape: number, cin: number, lpi: number): number {
  if (!Number.isFinite(cape)) return NaN; // außerhalb der ICON-D2-Domäne → transparent
  const pot = capeScore(cape);                                   // 0..100
  const lid = cinGate(Number.isFinite(cin) ? cin : 0);          // 0..1 (Deckel)
  const real = lpiScore(Number.isFinite(lpi) ? lpi : 0);        // 0..100 (Auslösung)
  const base = pot * lid;                                        // gedeckeltes Potenzial, 0..100
  const syn = base > 40 && real > 30 ? 15 : 0;                   // klassische Lage → Bonus
  return clamp(Math.round(0.55 * base + 0.45 * real + syn), 0, 100);
}

// ---------------------------------------------------------------------------
// Verify (headless) — reine Fusionslogik. Gefahren aus §7.1: ruhig→keine, hohes
// CAPE + offener Deckel + LPI → hoch, hohes CAPE + starker Deckel → gedämpft,
// Score-Monotonie, Clamp 0..100, Vorzeichen-Invarianz von CIN, Domänen-NaN.
// ---------------------------------------------------------------------------

export interface TpCheck { name: string; ok: boolean; detail?: string }
export interface TpVerifyResult { checks: TpCheck[]; passed: number; failed: number }

export function verifyThunderPotential(): TpVerifyResult {
  const checks: TpCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // 1) Ruhige Lage (kein CAPE, kein LPI) → Stufe „keine".
  const calm = thunderScore(20, 0, 0);
  add('Ruhig → keine', thunderLevelOf(calm).level === 'none', `${calm}`);

  // 2) Klassische Auslöse-Lage: hohes CAPE, offener Deckel, kräftiges LPI → hoch.
  const classic = thunderScore(2200, 10, 12);
  add('CAPE + offener Deckel + LPI → hoch', thunderLevelOf(classic).level === 'high', `${classic}`);

  // 3) Starker Deckel dämpft dasselbe Potenzial deutlich (CIN groß, LPI 0).
  const capped = thunderScore(2200, 350, 0);
  add('Starker Deckel dämpft Potenzial', capped < classic && capped < thunderScore(2200, 0, 0), `${capped} < ${classic}`);

  // 4) Nur Potenzial (kein Deckel, aber auch keine Realisierung) < klassische Lage,
  //    aber > ruhig — hohes CAPE allein ist noch kein Gewitter.
  const potentialOnly = thunderScore(2200, 0, 0);
  add('Nur Potenzial < klassische Lage, > ruhig', potentialOnly < classic && potentialOnly > calm, `${potentialOnly}`);

  // 5) CIN-Vorzeichen-Invarianz: negativer und positiver Betrag liefern denselben Score.
  const cNeg = thunderScore(1800, -180, 6);
  const cPos = thunderScore(1800, 180, 6);
  add('CIN vorzeichen-invariant (|CIN|)', cNeg === cPos, `${cNeg} == ${cPos}`);

  // 6) Monotonie in CAPE (Deckel/LPI fix): mehr Energie ⇒ nicht kleinerer Score.
  const mono =
    thunderScore(300, 20, 4) <= thunderScore(800, 20, 4) &&
    thunderScore(800, 20, 4) <= thunderScore(1600, 20, 4) &&
    thunderScore(1600, 20, 4) <= thunderScore(2800, 20, 4);
  add('Monoton steigend in CAPE', mono, `${thunderScore(300, 20, 4)}≤${thunderScore(800, 20, 4)}≤${thunderScore(1600, 20, 4)}≤${thunderScore(2800, 20, 4)}`);

  // 7) Monotonie im Deckel (CAPE/LPI fix): mehr |CIN| ⇒ nicht größerer Score.
  const lidMono =
    thunderScore(2000, 0, 0) >= thunderScore(2000, 100, 0) &&
    thunderScore(2000, 100, 0) >= thunderScore(2000, 300, 0);
  add('Monoton fallend mit |CIN|', lidMono, `${thunderScore(2000, 0, 0)}≥${thunderScore(2000, 100, 0)}≥${thunderScore(2000, 300, 0)}`);

  // 8) Extremlage bleibt ≤ 100 (Clamp) und erreicht „hoch".
  const extreme = thunderScore(3500, 0, 30);
  add('Extremlage ≤100 & hoch', extreme <= 100 && thunderLevelOf(extreme).level === 'high', `${extreme}`);

  // 9) Synergie-Bonus greift nur bei Potenzial UND Realisierung gemeinsam.
  const noSyn = thunderScore(2200, 20, 0);          // Potenzial, aber real=0 → kein Bonus
  const withSyn = thunderScore(2200, 20, 12);        // Potenzial UND real>30 → +15
  add('Synergie nur bei Potenzial+Realisierung', withSyn >= noSyn + 10, `${withSyn} vs ${noSyn}`);

  // 10) Domänenrand: nicht-endliches CAPE → NaN (Aufrufer maskiert transparent).
  add('CAPE=NaN → NaN (transparent)', Number.isNaN(thunderScore(NaN, 100, 5)), `${thunderScore(NaN, 100, 5)}`);

  // 10b) CIN-Fill (DWD −999,9) darf KEINEN Schein-Deckel erzeugen: identisch zu
  //      „kein Deckel" (cin=0). Sonst würde |−999,9| das Potenzial fälschlich dämpfen.
  add('CIN-Fill −999,9 = kein Deckel (lid=1)', cinGate(-999.9) === 1 && thunderScore(2000, -999.9, 12) === thunderScore(2000, 0, 12), `gate=${cinGate(-999.9)} score=${thunderScore(2000, -999.9, 12)}`);
  add('CIN=NaN = kein Deckel (lid=1)', cinGate(NaN) === 1, `${cinGate(NaN)}`);

  // 11) LPI/CIN NaN im Inneren werden als 0 behandelt (nicht maskiert).
  add('LPI/CIN NaN → als 0 behandelt', thunderScore(1000, NaN, NaN) === thunderScore(1000, 0, 0), `${thunderScore(1000, NaN, NaN)}`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

// Dev-Hook (Browser) — spiegelt `convectiveIndex.ts`. `typeof window`-Guard
// schützt den Node-Harness (dort ist window undefined → `import.meta.env` wird
// nicht ausgewertet).
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyThunderPotential: typeof verifyThunderPotential }).__verifyThunderPotential = verifyThunderPotential;
}
