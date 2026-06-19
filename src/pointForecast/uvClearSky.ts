/**
 * Klarhimmel-UV-Index als Fallback, wo keine gemessene/prognostizierte UV-Quelle
 * vorliegt (AT/CH — die DWD-UV-Quelle deckt nur DE; auch DE-Lücken außerhalb der
 * DWD-Orte). Das Modell ist eine physikalische Näherung, kein Ersatz für eine
 * Messung:
 *
 *   UVI ≈ C · μ₀^p · f_Höhe · f_Wolken
 *
 *   • μ₀ = cos(Sonnen-Zenitwinkel), aus der NOAA-Solarposition (Deklination +
 *     Zeitgleichung + Stundenwinkel). μ₀ ≤ 0 ⇒ Sonne unter Horizont ⇒ UVI 0.
 *   • C = 9,3, p = 2,42 — DACH-kalibrierte Potenzbeziehung (Fioletov-Form);
 *     liefert Sommer-Mittags-Klarhimmel ~7–8 in tiefen Lagen.
 *   • f_Höhe = 1 + 0,08·(elev/1000 m) — UV nimmt mit der Höhe zu (~8 %/1000 m).
 *   • f_Wolken = 1 − 0,75·(N)^3,4 — Wolken-Modifikationsfaktor (Schwander-Form):
 *     dünne/teilweise Bewölkung dämpft kaum, erst dichte Bedeckung stark.
 *
 * Ozon, Aerosole und Schnee-Albedo bleiben unberücksichtigt — für einen Fallback
 * außerhalb der gemessenen Abdeckung ist die Sonnenstands-Abhängigkeit der
 * dominante Faktor.
 */

/** cos des Sonnen-Zenitwinkels an (lat, lng) zur Zeit etaMs (UTC). NOAA-Algorithmus. */
export function solarZenithCos(lat: number, lng: number, etaMs: number): number {
  const d = new Date(etaMs);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((etaMs - yearStart) / 86_400_000) + 1;     // 1..366
  const hourUTC = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;

  // Fraktionales Jahr γ (rad).
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourUTC - 12) / 24);
  // Zeitgleichung (Minuten).
  const eqtime = 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );
  // Sonnen-Deklination (rad).
  const decl =
    0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  // Wahre Sonnenzeit (Minuten); lng Ost positiv, Bezug UTC (timezone = 0).
  const timeOffset = eqtime + 4 * lng;
  const tst = hourUTC * 60 + timeOffset;
  const ha = ((tst / 4) - 180) * Math.PI / 180;       // Stundenwinkel (rad)

  const latR = lat * Math.PI / 180;
  return Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
}

/** Klarhimmel-UV-Index (≥ 0). cloudCoverPct null ⇒ als wolkenlos behandelt. */
export function uvClearSky(
  lat: number, lng: number, etaMs: number,
  elevM: number | null, cloudCoverPct: number | null,
): number {
  const mu = solarZenithCos(lat, lng, etaMs);
  if (mu <= 0) return 0;                                // Sonne unter Horizont
  const base = 9.3 * Math.pow(mu, 2.42);
  const elev = elevM != null && Number.isFinite(elevM) ? Math.max(0, elevM) : 0;
  const altFactor = 1 + 0.08 * (elev / 1000);
  const cloud = cloudCoverPct != null && Number.isFinite(cloudCoverPct)
    ? Math.max(0, Math.min(1, cloudCoverPct / 100)) : 0;
  const cmf = 1 - 0.75 * Math.pow(cloud, 3.4);
  return Math.max(0, base * altFactor * cmf);
}

// ---------------------------------------------------------------------------
// Verifikation — eigenschaftsbasiert (Solarposition lässt sich schwer von Hand
// auf 3 Stellen prüfen, die physikalischen Relationen aber eindeutig).
// ---------------------------------------------------------------------------
export interface UvCheck { name: string; expected: string; got: number; ok: boolean }
export interface UvVerifyResult { checks: UvCheck[]; passed: number; failed: number }

export function verifyUvClearSky(): UvVerifyResult {
  const checks: UvCheck[] = [];
  const r1 = (x: number) => Math.round(x * 100) / 100;
  const push = (name: string, expected: string, got: number, ok: boolean) =>
    checks.push({ name, expected, got: r1(got), ok });

  const lat = 47.26, lng = 11.4;                    // Innsbruck
  const summer = Date.UTC(2024, 5, 21, 11, 0, 0);  // ~Sommer-Mittag
  const winter = Date.UTC(2024, 11, 21, 11, 0, 0); // Winter-Mittag
  const night = Date.UTC(2024, 5, 21, 0, 0, 0);    // ~01:00 lokal, Sonne unten

  const uvS = uvClearSky(lat, lng, summer, 600, 0);
  const uvW = uvClearSky(lat, lng, winter, 600, 0);
  const uvN = uvClearSky(lat, lng, night, 600, 0);
  const uvAlt = uvClearSky(lat, lng, summer, 2500, 0);
  const uvOver = uvClearSky(lat, lng, summer, 600, 100);
  const uvPart = uvClearSky(lat, lng, summer, 600, 50);

  push('Nacht (Sonne unten) → 0', '0', uvN, uvN === 0);
  push('Sommer-Mittag klar in [5, 10]', '5–10', uvS, uvS >= 5 && uvS <= 10);
  push('Sommer > Winter', '>', uvS, uvS > uvW);
  push('Winter-Mittag > 0', '>0', uvW, uvW > 0);
  push('Höhe erhöht UV (2500 m > 600 m)', '>', uvAlt, uvAlt > uvS);
  push('Bedeckt dämpft stark (< 40 % von klar)', `<${r1(uvS * 0.4)}`, uvOver, uvOver < uvS * 0.4);
  push('Teilbewölkt dämpft kaum (> 85 % von klar)', `>${r1(uvS * 0.85)}`, uvPart, uvPart > uvS * 0.85);
  push('Wolken monoton: bedeckt < teils < klar', '<<', uvOver, uvOver < uvPart && uvPart < uvS);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyUvClearSky: typeof verifyUvClearSky }).__verifyUvClearSky = verifyUvClearSky;
}
