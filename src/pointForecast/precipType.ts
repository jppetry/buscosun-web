/**
 * Heuristische Klassifikation der Niederschlagsart aus T und mm/h.
 *
 * Für DACH-Verhältnisse haben empirische Schwellen gut Bestand:
 *   – T < 0,5 °C            → Schnee
 *   – 0,5 °C ≤ T < 2,5 °C   → Schneeregen (Mix / Graupel)
 *   – T ≥ 2,5 °C            → Regen
 *   – Precip < 0,05 mm/h    → 'none' (zu wenig zum Klassifizieren)
 *
 * In Tier B steht eine Aufrüstung auf direkte Modell-Outputs (ICON-D2
 * snowfall_amount, AROME snowlmt) an — die Heuristik ist der MVP-Layer, der
 * für *80–90 %* der Fälle die richtige Aussage trifft.
 */

export type PrecipitationType = 'none' | 'rain' | 'sleet' | 'snow';

export interface PrecipPhaseContext {
  /** Höhe des Samples (m ü. M.). */
  sampleElevM?: number | null;
  /** Schneefallgrenze (m ü. M.), falls vom Modell verfügbar (AROME, AT/CH). */
  snowLineM?: number | null;
}

/** Übergangszone (m) um die Schneefallgrenze, in der Schneeregen gemeldet wird. */
export const SNOWLINE_SLEET_BAND_M = 150;

/**
 * Klassifiziert die Niederschlagsart.
 *
 * Liegt eine **Schneefallgrenze** vor (AROME, AT/CH), entscheidet die Sample-
 * Höhe relativ zu ihr — das ist der direkte Modell-Indikator und berücksichtigt
 * das Temperatur-/Feuchteprofil besser als eine reine 2-m-T-Schwelle. So bleiben
 * Niederschlagsart und Schneefallgrenze konsistent (kein „Regen" oberhalb der
 * Grenze). Eine schmale Übergangszone (±{@link SNOWLINE_SLEET_BAND_M} m) wird als
 * Schneeregen gemeldet.
 *
 * Ohne Schneefallgrenze (DE/MOSMIX) greift die bewährte T-Heuristik:
 *   T < 0,5 °C → Schnee · 0,5–2,5 °C → Schneeregen · ≥ 2,5 °C → Regen.
 */
export function classifyPrecipitation(
  tempC: number | null,
  precipMmH: number | null,
  ctx?: PrecipPhaseContext,
): PrecipitationType {
  if (precipMmH == null || precipMmH < 0.05) return 'none';

  const snow = ctx?.snowLineM;
  const elev = ctx?.sampleElevM;
  if (snow != null && Number.isFinite(snow) && elev != null && Number.isFinite(elev)) {
    const dh = elev - snow;                 // > 0 = oberhalb der Schneefallgrenze
    if (dh >= SNOWLINE_SLEET_BAND_M) return 'snow';
    if (dh <= -SNOWLINE_SLEET_BAND_M) return 'rain';
    return 'sleet';
  }

  if (tempC == null) return 'rain';        // ohne T-Info Annahme „Regen"
  if (tempC < 0.5) return 'snow';
  if (tempC < 2.5) return 'sleet';
  return 'rain';
}

export function precipTypeLabel(t: PrecipitationType): string {
  switch (t) {
    case 'snow': return 'Schnee';
    case 'sleet': return 'Schneeregen';
    case 'rain': return 'Regen';
    default: return '—';
  }
}

// ---------------------------------------------------------------------------
// Verifikation
// ---------------------------------------------------------------------------
export interface PrecipCheck { case: string; expected: PrecipitationType; got: PrecipitationType; ok: boolean }
export interface PrecipVerifyResult { checks: PrecipCheck[]; passed: number; failed: number }

const CASES: Array<{ case: string; t: number | null; p: number | null; expected: PrecipitationType }> = [
  // Klare Fälle
  { case: 'Sommer, kein Regen',         t: 18,   p: 0,    expected: 'none' },
  { case: 'Frühlingsregen',             t: 12,   p: 2,    expected: 'rain' },
  { case: 'Winterregen 3 °C',           t: 3,    p: 1.5,  expected: 'rain' },
  { case: 'Schneeregen 1,5 °C',         t: 1.5,  p: 1.5,  expected: 'sleet' },
  { case: 'Schnee 0 °C',                t: 0,    p: 2,    expected: 'snow' },
  { case: 'Schnee Kälte -5 °C',         t: -5,   p: 3,    expected: 'snow' },
  // Genau-an-der-Grenze
  { case: 'Schwelle 0,5 °C → sleet',    t: 0.5,  p: 1,    expected: 'sleet' },
  { case: 'Schwelle 2,5 °C → rain',     t: 2.5,  p: 1,    expected: 'rain' },
  { case: 'Knapp unter 0,5 → snow',     t: 0.49, p: 1,    expected: 'snow' },
  { case: 'Knapp unter 2,5 → sleet',    t: 2.49, p: 1,    expected: 'sleet' },
  // Edge: Spuren-Regen → 'none'
  { case: 'Spur 0,02 mm/h → none',      t: 10,   p: 0.02, expected: 'none' },
  // Null-Behandlung
  { case: 'Precip null → none',         t: 5,    p: null, expected: 'none' },
  { case: 'T null + Regen → rain',      t: null, p: 1,    expected: 'rain' },
];

// Schneefallgrenzen-Fälle: hier muss die Höhe-relativ-zur-Grenze die T-Schwelle
// überstimmen, damit Niederschlagsart und Schneefallgrenze konsistent sind.
const SNOW_CASES: Array<{ case: string; t: number | null; p: number | null; ele: number; snow: number | null; expected: PrecipitationType }> = [
  { case: 'Oberhalb Grenze → Schnee (T würde Schneeregen)',  t: 1,    p: 2, ele: 2100, snow: 1800, expected: 'snow' },
  { case: 'Unterhalb Grenze → Regen (T würde Schnee)',       t: -1,   p: 2, ele: 1500, snow: 1800, expected: 'rain' },
  { case: 'In der Übergangszone → Schneeregen',              t: 5,    p: 1, ele: 1850, snow: 1800, expected: 'sleet' },
  { case: 'Genau an der Grenze → Schneeregen',               t: 0,    p: 1, ele: 1800, snow: 1800, expected: 'sleet' },
  { case: 'Bandkante oben (+150 m) → Schnee',                t: 5,    p: 1, ele: 1950, snow: 1800, expected: 'snow' },
  { case: 'Bandkante unten (−150 m) → Regen',                t: -5,   p: 1, ele: 1650, snow: 1800, expected: 'rain' },
  { case: 'Trocken trotz Grenze → none',                     t: 1,    p: 0, ele: 2100, snow: 1800, expected: 'none' },
  { case: 'snowLine null → T-Fallback (Schnee)',             t: 0,    p: 1, ele: 2000, snow: null, expected: 'snow' },
  { case: 'sampleElev NaN → T-Fallback (Regen)',             t: 5,    p: 1, ele: NaN,  snow: 1800, expected: 'rain' },
];

export function verifyClassifyPrecipitation(): PrecipVerifyResult {
  const checks: PrecipCheck[] = CASES.map((c) => {
    const got = classifyPrecipitation(c.t, c.p);
    return { case: c.case, expected: c.expected, got, ok: got === c.expected };
  });
  for (const c of SNOW_CASES) {
    const got = classifyPrecipitation(c.t, c.p, { sampleElevM: c.ele, snowLineM: c.snow });
    checks.push({ case: c.case, expected: c.expected, got, ok: got === c.expected });
  }
  return {
    checks,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
  };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyPrecipType: typeof verifyClassifyPrecipitation })
    .__verifyPrecipType = verifyClassifyPrecipitation;
}
