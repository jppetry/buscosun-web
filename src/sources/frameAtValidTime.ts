/**
 * Gemeinsame Frame-Wahl nach Gültigkeitszeit (now-indexiert) statt nach
 * Vorlauf-Schritt (run-indexiert).
 *
 * Hintergrund (QA-Befund D1): Die nativen ICON-D2-Layer (Temp/Wind/Böen + die
 * davon abgeleiteten Schneegrenze/Konfidenz) wählten ihren Frame über
 * `stepHours ≈ Slider-Stunde`. Bei Slider „jetzt"=0 ist das step 0 = die
 * Lauf-Analyse (validAt = Lauf-Uhrzeit, oft Stunden alt), während Uhr-Label und
 * die now-indexierten Layer (Radar/Wolken/Compositor) die echte Jetzt-Zeit
 * zeigen. Diese Funktion vereinheitlicht das: gewählt wird der Frame, dessen
 * `validAt` der Zielzeit `Date.now() + Slider-Stunde·3600s` am nächsten liegt —
 * exakt das Muster, das Wolken/Compositor (MapView) bereits nutzen.
 *
 * `minStepHours` (QA-Befund D4): überspringt führende Schritte ohne gültiges
 * Akkumulations-/Maximums-Intervall. `vmax_10m` (Böen) und `tot_prec`-Δ sind am
 * Analyse-Schritt t+0 strukturell 0 → bei „jetzt" sonst flächig leer. Mit
 * `minStepHours = 1` wird der t+0-Schritt für solche Felder ausgeschlossen.
 */
export function frameAtValidTime<T extends { validAt: Date; stepHours: number }>(
  frames: T[],
  targetMs: number,
  minStepHours = 0,
): T {
  let pool = frames;
  if (minStepHours > 0) {
    const filtered = frames.filter((f) => f.stepHours >= minStepHours);
    if (filtered.length > 0) pool = filtered;
  }
  let best = pool[0];
  let bestDelta = Infinity;
  for (const f of pool) {
    const d = Math.abs(f.validAt.getTime() - targetMs);
    if (d < bestDelta) { bestDelta = d; best = f; }
  }
  return best;
}
