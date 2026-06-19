/**
 * Radar-Qualität & -Abdeckung (§10, „der Moat") — ehrliche Transparenz.
 *
 * Echte Beam-Blockage-Klimatologien liegen uns nicht vor (kein neuer Feed),
 * deshalb liefern wir das, was sich AUS DER VORHANDENEN GEOMETRIE seriös
 * ableiten lässt:
 *   - Range-Falloff: zum Rand der Composite-Abdeckung sinkt die Qualität →
 *     wir schattieren einen Randsaum als „eingeschränkte Radarsicht".
 *   - Kontextuelle Konfidenz-Notiz je Region (Alpenraum vs. Flachland) als
 *     ehrlicher Hinweis statt erfundener Pixel-Maske.
 *
 * Rein & headless prüfbar ({@link verifyCoverage}).
 */

export interface CoverageMask {
  /** u8: 0 = volle Qualität (transparent), 255 = stark eingeschränkt (Randsaum). */
  values: Uint8Array;
  width: number;
  height: number;
}

/**
 * Erzeugt einen Randsaum-Falloff: Zellen innerhalb `edgeCells` zur
 * Gitterkante werden zunehmend als „eingeschränkt" markiert. Das innere
 * Gebiet bleibt transparent (volle Qualität).
 */
export function buildEdgeFalloffMask(width: number, height: number, edgeCells = 60): CoverageMask {
  const values = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dEdge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (dEdge >= edgeCells) continue; // inneres Gebiet: voll
      const t = 1 - dEdge / edgeCells; // 0 innen → 1 an der Kante
      values[y * width + x] = Math.max(1, Math.round(t * t * 200)); // sanft quadratisch
    }
  }
  return { values, width, height };
}

/** Halbtransparente Graustufen-Palette für die Coverage-Schraffur. */
export const coverageRamp: Record<number, string> = {
  0.0: 'rgba(0,0,0,0)',
  0.2: 'rgba(120,120,130,0.10)',
  0.6: 'rgba(110,110,120,0.22)',
  1.0: 'rgba(90,90,105,0.38)',
};

/**
 * Kontextuelle Konfidenz-Notiz für einen Standort. Ehrlich, kurz, hoher
 * Vertrauens-ROI (§10 „Per-region confidence").
 */
export function coverageNote(lat: number, country: 'DE' | 'AT' | 'CH'): string {
  const alpine = lat < 47.8 && (country === 'AT' || country === 'CH' || lat < 47.6);
  if (alpine) {
    return 'Alpenraum: tiefe Radarstrahlen werden von Bergrücken teils abgeschattet — '
      + 'in tiefen Tälern kann Niederschlag unterschätzt werden.';
  }
  if (country === 'CH') return 'Schweiz: rzc-Komposit, Bergabschattung in inneralpinen Tälern möglich.';
  if (country === 'AT') return 'Österreich: INCA-Komposit, gute Abdeckung im Flach-/Hügelland.';
  return 'Gute Radarabdeckung. Qualität nimmt zum Rand des Komposits hin ab.';
}

/** Quellen-/Alters-Badge-Text (§10 „Data source & age"). */
export function sourceAgeBadge(sourceLabel: string, runAtMs: number, nowMs = Date.now()): string {
  const ageMin = Math.max(0, Math.round((nowMs - runAtMs) / 60_000));
  const ageTxt = ageMin < 1 ? 'gerade aktualisiert' : `vor ${ageMin} min`;
  return `${sourceLabel} · ${ageTxt}`;
}

// ---------------------------------------------------------------------------

export interface CovCheck { name: string; ok: boolean; detail?: string }
export interface CovVerifyResult { checks: CovCheck[]; passed: number; failed: number }

export function verifyCoverage(): CovVerifyResult {
  const checks: CovCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const m = buildEdgeFalloffMask(100, 100, 20);
  add('Mitte ist voll (transparent)', m.values[50 * 100 + 50] === 0);
  add('Ecke ist eingeschränkt', m.values[0] > 100, `${m.values[0]}`);
  add('Kante > inneres', m.values[50 * 100 + 1] > m.values[50 * 100 + 30]);

  add('Alpen-Notiz erwähnt Abschattung', /abgeschattet|Bergabschattung/.test(coverageNote(46.8, 'AT')));
  add('DE-Flachland-Notiz', /Radarabdeckung/.test(coverageNote(52.5, 'DE')));

  const badge = sourceAgeBadge('DWD RADOLAN-RV', 1_000_000, 1_000_000 + 5 * 60_000);
  add('Badge zeigt Alter', /vor 5 min/.test(badge), badge);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyCoverage: typeof verifyCoverage }).__verifyCoverage = verifyCoverage;
}
