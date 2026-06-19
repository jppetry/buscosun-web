/**
 * Gefühlte Temperatur ("Apparent Temperature") in °C.
 *
 * Wir kombinieren zwei etablierte Formeln, beide in ihrem jeweiligen
 * Gültigkeitsbereich:
 *
 *   • Wind-Chill nach Environment Canada / NWS (2001):
 *     ATw = 13.12 + 0.6215·T − 11.37·v^0.16 + 0.3965·T·v^0.16   (v in km/h, T in °C)
 *     Gültig: T ≤ 10 °C  UND  v ≥ 4.8 km/h (~1.33 m/s).
 *
 *   • Heat-Index nach Rothfusz/Steadman (in °F gerechnet, rück nach °C):
 *     Polynom aus T_F und RH; gültig T ≥ 27 °C  UND  RH ≥ 40 %.
 *     Zwei kleine Korrektur-Terme (Low-RH / High-Heat) wie in der NWS-Variante.
 *
 *   • Sonst gilt T unverändert (Komfortbereich).
 *
 * Liefert null, sobald die nötige Mindest-Eingabe fehlt (T-Wert null oder
 * notwendige Begleiter wie Wind bzw. Feuchte fehlen außerhalb des Komfort-
 * bereichs).
 */

export function apparentTemperatureC(
  tempC: number | null,
  windMps: number | null,
  relHumidityPct: number | null,
): number | null {
  if (tempC == null || !Number.isFinite(tempC)) return null;

  // Wind-Chill-Bereich.
  if (tempC <= 10) {
    if (windMps == null || windMps < 1.33) {
      // Innerhalb des Kalt-Bereichs aber zu wenig Wind → reine Lufttemperatur.
      return tempC;
    }
    const vKmh = windMps * 3.6;
    const vPow = Math.pow(vKmh, 0.16);
    return 13.12 + 0.6215 * tempC - 11.37 * vPow + 0.3965 * tempC * vPow;
  }

  // Heat-Index-Bereich.
  if (tempC >= 27) {
    if (relHumidityPct == null || relHumidityPct < 40) {
      return tempC;
    }
    const T = tempC * 9 / 5 + 32;             // °F
    const RH = relHumidityPct;
    // Rothfusz-Polynom (in °F).
    let HI =
      -42.379 + 2.04901523 * T + 10.14333127 * RH
      - 0.22475541 * T * RH
      - 0.00683783 * T * T
      - 0.05481717 * RH * RH
      + 0.00122874 * T * T * RH
      + 0.00085282 * T * RH * RH
      - 0.00000199 * T * T * RH * RH;
    // NWS-Korrekturen außerhalb der Mittelbereiche.
    if (RH < 13 && T >= 80 && T <= 112) {
      HI -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    } else if (RH > 85 && T >= 80 && T <= 87) {
      HI += ((RH - 85) / 10) * ((87 - T) / 5);
    }
    return (HI - 32) * 5 / 9;                 // °F → °C
  }

  // Komfortbereich (10 < T < 27): keine sinnvolle Korrektur.
  return tempC;
}

// ---------------------------------------------------------------------------
// Verifikation (Dev-only, an window exponiert)
// ---------------------------------------------------------------------------

export interface ApparentCheck {
  case: string;
  input: { tempC: number | null; windMps: number | null; rhPct: number | null };
  output: number | null;
  expected: number | { min: number; max: number } | null;
  ok: boolean;
}
export interface ApparentVerifyResult {
  checks: ApparentCheck[];
  passed: number;
  failed: number;
}

const CASES: Array<{
  case: string;
  input: { tempC: number | null; windMps: number | null; rhPct: number | null };
  expected: number | { min: number; max: number } | null;
}> = [
  // Wind-Chill: T=5 °C, Wind=8.33 m/s (=30 km/h). NWS-Wert ≈ −0,2 °C.
  { case: 'Wind-Chill 5 °C / 30 km/h', input: { tempC: 5, windMps: 8.33, rhPct: null }, expected: { min: -1.0, max: 0.6 } },
  // Wind-Chill: T=−5 °C, Wind=5 m/s (=18 km/h). NWS-Formel: 13.12 + 0.6215·T
  // − 11.37·v^0.16 + 0.3965·T·v^0.16 mit v^0.16=18^0.16≈1.59 → ATw ≈ −11.2 °C.
  { case: 'Wind-Chill −5 °C / 18 km/h', input: { tempC: -5, windMps: 5, rhPct: null }, expected: { min: -12, max: -10 } },
  // Wind-Chill: T=8 °C, wenig Wind (<1,33 m/s) → exakt T.
  { case: 'Kalt aber windstill', input: { tempC: 8, windMps: 0.5, rhPct: null }, expected: 8 },
  // Heat-Index: T=32 °C, RH=70 % → NWS ≈ 41 °C.
  { case: 'Heat-Index 32 °C / 70 %', input: { tempC: 32, windMps: null, rhPct: 70 }, expected: { min: 39, max: 43 } },
  // Heat-Index: T=28 °C, RH=70 % → ≈ 31,5 °C.
  { case: 'Heat-Index 28 °C / 70 %', input: { tempC: 28, windMps: null, rhPct: 70 }, expected: { min: 30, max: 33 } },
  // Heiß ohne Feuchte → reine T.
  { case: 'Heiß ohne RH', input: { tempC: 30, windMps: 2, rhPct: null }, expected: 30 },
  // Komfortbereich → reine T.
  { case: 'Komfort 18 °C', input: { tempC: 18, windMps: 5, rhPct: 60 }, expected: 18 },
  // T=null → null.
  { case: 'Keine Temperatur', input: { tempC: null, windMps: 5, rhPct: 60 }, expected: null },
];

export function verifyApparentTemperature(): ApparentVerifyResult {
  const checks: ApparentCheck[] = CASES.map((c) => {
    const out = apparentTemperatureC(c.input.tempC, c.input.windMps, c.input.rhPct);
    let ok: boolean;
    if (c.expected == null) ok = out == null;
    else if (typeof c.expected === 'number') ok = out != null && Math.abs(out - c.expected) < 0.05;
    else ok = out != null && out >= c.expected.min && out <= c.expected.max;
    return { ...c, output: out != null ? Math.round(out * 10) / 10 : null, ok };
  });
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyApparentTemp: typeof verifyApparentTemperature }).__verifyApparentTemp = verifyApparentTemperature;
}
