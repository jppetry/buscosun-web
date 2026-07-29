/**
 * Blitz-Vorhersage-Rampe (Feature F2) — reine, DOM-/Fetch-freie Wert→Risiko-
 * Abbildung des ICON-D2 **Lightning Potential Index** (`lpi_max`, J/kg). Anders
 * als das Gewitterpotenzial (F1, `thunderPotential.ts`) ist dies KEINE Fusion:
 * ein einziges Feld, direktes Mapping. Der Karten-Layer rendert `lpi_max` linear
 * normiert (`iconD2Lpi.ts`, R = lpi/LPI_VMAX) über eine Farbrampe — diese Datei
 * liefert die semantischen Stufen (Legende/Tooltip) + einen headless
 * verifizierbaren Selbsttest (`scripts/verify-lpi.mjs`, kein Vitest).
 *
 * ABGRENZUNG (§0): `lpi_max` ist eine **Prognose** (0–12 h). Der bestehende
 * „Blitze"-Layer (`dwdLightning.ts`, `Accumulated_Flash_Area`) zeigt GEMESSENE
 * Einschläge der letzten 60 Min — anderes Ding, anderer Layer, andere Palette.
 *
 * Rampen-Reuse: `ramp` kommt aus `convectiveIndex.ts` (piecewise-linear, geklemmt).
 */

import { ramp } from './convectiveIndex';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * LPI (J/kg) → 0..100 Blitz-Risiko-Score. Rein für Semantik/Verifikation; der
 * Render-Pfad normiert `lpi_max` direkt linear (§8.4). ICON-D2 gibt LPI nur in
 * konvektionserlaubenden Lagen > 0 aus → an ruhigen Tagen erwartungsgemäß ~0.
 * Stützpunkte an der §3-Risikorampe orientiert: 0→0 · 1→12 · 3→35 · 8→65 · 15→85 · 30→100.
 */
export function lpiRisk(lpiJkg: number): number {
  if (!Number.isFinite(lpiJkg)) return NaN; // außerhalb Domäne → Aufrufer maskiert transparent
  return clamp(Math.round(ramp(lpiJkg, [[0, 0], [1, 12], [3, 35], [8, 65], [15, 85], [30, 100]])), 0, 100);
}

/** Fünfstufige Schwellen der Risikorampe (§3): keine · gering · erhöht · hoch ·
 *  sehr hoch. Grenzen an den J/kg-Bändern der Spec-Tabelle. Für Legende/Tooltip. */
export type LpiLevel = 'none' | 'low' | 'elevated' | 'high' | 'severe';
export function lpiLevelOf(lpiJkg: number): { level: LpiLevel; label: string } {
  if (!Number.isFinite(lpiJkg) || lpiJkg < 1) return { level: 'none', label: 'keine' };
  if (lpiJkg < 3) return { level: 'low', label: 'gering' };
  if (lpiJkg < 8) return { level: 'elevated', label: 'erhöht' };
  if (lpiJkg < 15) return { level: 'high', label: 'hoch' };
  return { level: 'severe', label: 'sehr hoch' };
}

// ---------------------------------------------------------------------------
// Verify (headless) — reine Rampenlogik. Monotonie, Clamp 0..100, Stufen-Bänder,
// Domänen-NaN (transparent). Muster der übrigen `verify-*.mjs`-Harnesses.
// ---------------------------------------------------------------------------

export interface LpiCheck { name: string; ok: boolean; detail?: string }
export interface LpiVerifyResult { checks: LpiCheck[]; passed: number; failed: number }

export function verifyLpiRisk(): LpiVerifyResult {
  const checks: LpiCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // 1) Ruhige Lage (LPI 0) → Stufe „keine", Score 0.
  add('LPI 0 → keine / Score 0', lpiRisk(0) === 0 && lpiLevelOf(0).level === 'none', `${lpiRisk(0)}`);

  // 2) Monoton steigend in LPI.
  const mono =
    lpiRisk(0) <= lpiRisk(1) && lpiRisk(1) <= lpiRisk(3) &&
    lpiRisk(3) <= lpiRisk(8) && lpiRisk(8) <= lpiRisk(15) && lpiRisk(15) <= lpiRisk(30);
  add('Monoton steigend in LPI', mono, `${lpiRisk(1)}≤${lpiRisk(3)}≤${lpiRisk(8)}≤${lpiRisk(15)}≤${lpiRisk(30)}`);

  // 3) Clamp: LPI über dem Deckel (30) bleibt ≤ 100.
  add('Extrem-LPI ≤ 100 (Clamp)', lpiRisk(80) <= 100 && lpiRisk(80) === 100, `${lpiRisk(80)}`);

  // 4) Stufen-Bänder treffen die Spec-Tabelle (<1 keine, 1–3 gering, 3–8 erhöht,
  //    8–15 hoch, >15 sehr hoch).
  const bands =
    lpiLevelOf(0.5).level === 'none' && lpiLevelOf(2).level === 'low' &&
    lpiLevelOf(5).level === 'elevated' && lpiLevelOf(12).level === 'high' &&
    lpiLevelOf(20).level === 'severe';
  add('Stufen-Bänder = Spec-Tabelle', bands, `${lpiLevelOf(2).label}/${lpiLevelOf(5).label}/${lpiLevelOf(12).label}/${lpiLevelOf(20).label}`);

  // 5) Domänenrand: nicht-endlicher LPI → NaN (Aufrufer maskiert transparent) + Stufe „keine".
  add('LPI NaN → NaN & keine', Number.isNaN(lpiRisk(NaN)) && lpiLevelOf(NaN).level === 'none', `${lpiRisk(NaN)}`);

  // 6) Schwaches Signal (LPI 1) ist sichtbar > „keine", aber nicht schon „hoch".
  add('LPI 1 → gering (sichtbar, nicht hoch)', lpiLevelOf(1).level === 'low' && lpiRisk(1) > 0, `${lpiRisk(1)}`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

// Dev-Hook (Browser) — spiegelt `thunderPotential.ts`/`convectiveIndex.ts`. Der
// `typeof window`-Guard schützt den Node-Harness (dort ist window undefined).
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyLpiRisk: typeof verifyLpiRisk }).__verifyLpiRisk = verifyLpiRisk;
}
