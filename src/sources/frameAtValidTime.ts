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
/**
 * Nur-Jetzt-Lademodus (Testmodus „startnow", MapView): reduziert eine
 * Schrittliste eines Laufs auf die (max.) zwei Schritte, die die AKTUELLE
 * Uhrzeit einrahmen — die Interpolationsstützen für `frameAtValidTime` bei
 * Slider „jetzt". Alles davor/danach (Vergangenheit des Laufs, Zukunftsstunden)
 * wird nicht geladen. Fallback: erster Schritt, falls die Liste leer einrahmt.
 */
export function stepsBracketingNow(steps: number[], runAt: Date): number[] {
  const nowH = (Date.now() - runAt.getTime()) / 3_600_000;
  let lower: number | undefined;
  let upper: number | undefined;
  for (const s of steps) {
    if (s <= nowH) { if (lower == null || s > lower) lower = s; }
    else if (upper == null || s < upper) upper = s;
  }
  const picks = [lower, upper].filter((s): s is number => s != null);
  return picks.length ? picks : steps.slice(0, 1);
}

/**
 * Nur-Jetzt-Lademodus mit begrenztem Vorhersagefenster (Testmodus „startnow",
 * MapView): liefert alle Schritte vom Now-Bracket (größter Schritt ≤ jetzt) bis
 * zum Bracket von `jetzt + aheadHours` (kleinster Schritt ≥ jetzt+ahead) —
 * genau die Interpolationsstützen, die `frameAtValidTime` für den Slider von
 * „jetzt" bis „+aheadHours" braucht. Mit `aheadHours = 0` ist das Ergebnis
 * identisch zu `stepsBracketingNow` (max. zwei Schritte). Bei akkumulierten
 * Feldern (tot_prec) ist die Liste zusammenhängend (stündliche Schritte), sodass
 * jede Raten-Differenz eine gültige Vorgängerstütze hat. Fallback: erster
 * Schritt, falls die Liste leer einrahmt.
 */
export function stepsForNowWindow(steps: number[], runAt: Date, aheadHours = 0): number[] {
  const nowH = (Date.now() - runAt.getTime()) / 3_600_000;
  const endH = nowH + Math.max(0, aheadHours);
  let lower: number | undefined; // größter Schritt ≤ jetzt
  let upper: number | undefined; // kleinster Schritt ≥ jetzt+ahead
  for (const s of steps) {
    if (s <= nowH) { if (lower == null || s > lower) lower = s; }
    if (s >= endH) { if (upper == null || s < upper) upper = s; }
  }
  if (lower == null) lower = steps.length ? steps[0] : undefined;
  if (upper == null) upper = steps.length ? steps[steps.length - 1] : undefined;
  if (lower == null || upper == null) return steps.slice(0, 1);
  const lo = lower, hi = upper;
  const win = steps.filter((s) => s >= lo && s <= hi);
  return win.length ? win : steps.slice(0, 1);
}

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

/**
 * Wie `frameAtValidTime`, aber liefert die beiden die Zielzeit einrahmenden
 * Frames plus den Interpolationsanteil `frac` (0…1). Für flüssiges Sub-Stunden-
 * Scrubbing: der Aufrufer blendet `a`→`b` pixelweise mit `frac`. Liegt die
 * Zielzeit außerhalb des Frame-Bereichs oder gibt es nur einen Kandidaten, ist
 * `a === b` und `frac === 0` (Aufrufer setzt dann einfach `a`, kein Lerp nötig).
 */
export function bracketAtValidTime<T extends { validAt: Date; stepHours: number }>(
  frames: T[],
  targetMs: number,
  minStepHours = 0,
): { a: T; b: T; frac: number } {
  let pool = frames;
  if (minStepHours > 0) {
    const filtered = frames.filter((f) => f.stepHours >= minStepHours);
    if (filtered.length > 0) pool = filtered;
  }
  let lower: T | undefined; // größte validAt ≤ target
  let upper: T | undefined; // kleinste validAt ≥ target
  for (const f of pool) {
    const t = f.validAt.getTime();
    if (t <= targetMs) { if (!lower || t > lower.validAt.getTime()) lower = f; }
    if (t >= targetMs) { if (!upper || t < upper.validAt.getTime()) upper = f; }
  }
  if (lower && upper && lower !== upper) {
    const lo = lower.validAt.getTime();
    const hi = upper.validAt.getTime();
    const frac = hi > lo ? Math.max(0, Math.min(1, (targetMs - lo) / (hi - lo))) : 0;
    return { a: lower, b: upper, frac };
  }
  const one = lower ?? upper ?? pool[0];
  return { a: one, b: one, frac: 0 };
}
