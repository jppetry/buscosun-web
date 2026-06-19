/**
 * DACH-Mikroklima-Korrekturen für den Punktforecast — Effekte, die ein
 * grobes NWP-Gitter (AROME 2,5 km, ICON-D2/MOSMIX) am Punkt systematisch
 * verfehlt, weil seine Gitter-Topografie die reale Lage nicht auflöst:
 *
 *   1. Kaltluftseen / nächtliche Inversion (Cold Air Pooling): In klaren,
 *      windschwachen Nächten sammelt sich abgekühlte, schwere Luft in Senken
 *      und Talböden — die Temperatur dort liegt deutlich unter dem flächigen
 *      NWP-Mittel. Stärke ∝ Senkentiefe (DEM-TPI) × Strahlungs-/Windruhe.
 *
 *   2. Hangexposition / Einstrahlung (Aspect): Tagsüber ist ein süd-exponierter
 *      Hang wärmer, ein nord-exponierter kühler als ebener Grund — Funktion aus
 *      Hangneigung, -exposition und Sonnenstand (Einfallswinkel).
 *
 * Beides sind bewusst BESCHRÄNKTE, physikalisch motivierte Zuschläge auf die
 * geblendete Temperatur. Existiert am Punkt bereits ein ko-lokalisierter
 * Stations-Anker (der die Mikrolage misst), werden sie gedämpft, um keine
 * doppelte Korrektur einzubringen (siehe `anchorAttenuation`).
 *
 * Sonnenstand: NOAA-Algorithmus (gleiche Basis wie uvClearSky.solarZenithCos),
 * hier zusätzlich mit Azimut für die Hangexposition.
 */

export interface SolarPosition {
  /** Sonnenhöhe über dem Horizont (Grad; < 0 ⇒ Sonne unter Horizont). */
  elevationDeg: number;
  /** Azimut von Nord im Uhrzeigersinn (Grad; 0 = N, 90 = O, 180 = S, 270 = W). */
  azimuthDeg: number;
}

/** Sonnenhöhe + Azimut an (lat,lng) zur Zeit etaMs (UTC). NOAA-Solarposition. */
export function solarPosition(lat: number, lng: number, etaMs: number): SolarPosition {
  const d = new Date(etaMs);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((etaMs - yearStart) / 86_400_000) + 1;
  const hourUTC = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourUTC - 12) / 24);
  const eqtime = 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );
  const decl =
    0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const timeOffset = eqtime + 4 * lng;
  const tst = hourUTC * 60 + timeOffset;
  const ha = ((tst / 4) - 180) * Math.PI / 180;   // Stundenwinkel (rad), Nachmittag > 0
  const latR = lat * Math.PI / 180;

  const sinElev = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
  const elev = Math.asin(Math.max(-1, Math.min(1, sinElev)));
  // Azimut von Nord: acos-Form, per Stundenwinkel-Vorzeichen nach O/W aufgelöst.
  const cosAz = (Math.sin(decl) - sinElev * Math.sin(latR)) / (Math.cos(elev) * Math.cos(latR) || 1e-9);
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));   // 0..π von Nord
  if (ha > 0) az = 2 * Math.PI - az;                       // Nachmittag ⇒ Westhälfte
  return { elevationDeg: (elev * 180) / Math.PI, azimuthDeg: (az * 180) / Math.PI };
}

export interface TerrainContext {
  elevationM: number;
  /** > 0, wenn der Punkt tiefer liegt als seine Umgebung (Senke/Talboden). Meter. */
  sinkDepthM: number;
  /** Hangneigung (rad; 0 = eben). */
  slopeRad: number;
  /** Hangexposition = Richtung, in die der Hang abfällt (rad, von Nord im Uhrzeigersinn). */
  aspectRad: number;
}

const METERS_PER_DEG_LAT = 110_540;
const RING_RADIUS_DEG = 0.025;   // ~2,5–2,8 km Umkreis für die Senkentiefe (TPI)
const SLOPE_STEP_DEG = 0.0045;   // ~0,5 km Schrittweite für den Gradienten

/** Liest Senkentiefe (TPI) und Hangneigung/-exposition aus dem DEM-Lookup. */
export function terrainContext(
  sample: (lng: number, lat: number) => number,
  lng: number,
  lat: number,
): TerrainContext {
  const safe = (x: number, y: number, fallback: number): number => {
    const e = sample(x, y);
    return Number.isFinite(e) ? e : fallback;
  };
  const elevationM = Math.max(0, safe(lng, lat, 0));
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));

  // --- Senkentiefe (Terrain Position Index): Mittel eines 8-Punkt-Rings minus Punkt.
  let ringSum = 0, ringN = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 2 * Math.PI;
    const dLat = RING_RADIUS_DEG * Math.cos(a);
    const dLng = (RING_RADIUS_DEG * Math.sin(a)) / cosLat;
    const e = sample(lng + dLng, lat + dLat);
    if (Number.isFinite(e)) { ringSum += e; ringN++; }
  }
  const ringAvg = ringN > 0 ? ringSum / ringN : elevationM;
  const sinkDepthM = Math.max(0, Math.min(400, ringAvg - elevationM));

  // --- Hangneigung/-exposition aus dem zentralen Gradienten (N/S/O/W).
  const dyM = SLOPE_STEP_DEG * METERS_PER_DEG_LAT;
  const dxM = SLOPE_STEP_DEG * METERS_PER_DEG_LAT * cosLat;
  const zN = safe(lng, lat + SLOPE_STEP_DEG, elevationM);
  const zS = safe(lng, lat - SLOPE_STEP_DEG, elevationM);
  const zE = safe(lng + SLOPE_STEP_DEG / cosLat, lat, elevationM);
  const zW = safe(lng - SLOPE_STEP_DEG / cosLat, lat, elevationM);
  const dzdx = (zE - zW) / (2 * dxM);     // Steigung nach Osten
  const dzdy = (zN - zS) / (2 * dyM);     // Steigung nach Norden
  const grad = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
  const slopeRad = Math.atan(grad);
  // Abfallrichtung = −Gradient; Azimut von Nord im Uhrzeigersinn.
  let aspectRad = Math.atan2(-dzdx, -dzdy);
  if (aspectRad < 0) aspectRad += 2 * Math.PI;

  return { elevationM, sinkDepthM, slopeRad, aspectRad };
}

// --- Korrektur-Parameter (konservativ, beschränkt) ---------------------------
const COLD_POOL_PER_M = 0.018;     // °C pro Meter Senkentiefe (ideale Strahlungsnacht)
const COLD_POOL_MAX_C = 3.5;       // Deckel der nächtlichen Abkühlung
const COLD_POOL_WIND_MS = 2.5;     // ab dieser Windstärke kein Kaltluftsee (Durchmischung)
const COLD_POOL_CLOUD_MAX = 65;    // ab dieser Bedeckung keine Ausstrahlung
const ASPECT_MAX_C = 1.5;          // Deckel der Hang-Einstrahlungskorrektur
const ASPECT_GAIN_C = 2.2;         // Skala: voller cos(Einfall)-Unterschied → bis ~2,2 °C

/** Nächtliche Kaltluftsee-Abkühlung (≤ 0 °C). Gilt nur bei Nacht + windschwach + gering bewölkt. */
export function nocturnalCoolingC(
  ctx: TerrainContext, solarElevDeg: number, windMs: number | null, cloudPct: number | null,
): number {
  if (solarElevDeg > -1) return 0;                 // Tag/Dämmerung: kein Kaltluftsee
  if (ctx.sinkDepthM <= 0) return 0;
  const wind = windMs ?? 0;
  const calm = Math.max(0, Math.min(1, (COLD_POOL_WIND_MS - wind) / COLD_POOL_WIND_MS));
  if (calm <= 0) return 0;
  const cloud = cloudPct ?? 0;
  const clear = Math.max(0, Math.min(1, 1 - cloud / COLD_POOL_CLOUD_MAX));
  if (clear <= 0) return 0;
  const raw = Math.min(COLD_POOL_MAX_C, ctx.sinkDepthM * COLD_POOL_PER_M);
  return -raw * calm * clear;
}

/** Tagsüber: Hang-Einstrahlungs-Zuschlag (°C, ±). 0 ohne Hang oder bei Nacht/Überdeckung. */
export function aspectInsolationDeltaC(
  ctx: TerrainContext, solar: SolarPosition, windMs: number | null, cloudPct: number | null,
): number {
  if (solar.elevationDeg <= 3) return 0;           // Sonne zu tief: kein Strahlungssignal
  if (ctx.slopeRad < 0.03) return 0;               // praktisch eben (~1,7°)
  const elevR = (solar.elevationDeg * Math.PI) / 180;
  const sunAz = (solar.azimuthDeg * Math.PI) / 180;
  const sinElev = Math.sin(elevR);
  // Einfallswinkel-Cosinus auf der geneigten Fläche vs. ebener Grund.
  const cosInc = Math.cos(ctx.slopeRad) * sinElev
    + Math.sin(ctx.slopeRad) * Math.cos(elevR) * Math.cos(sunAz - ctx.aspectRad);
  const relGain = cosInc - sinElev;                // > 0 sonnenzugewandt, < 0 abgewandt
  const cloud = cloudPct ?? 0;
  const clear = Math.max(0, Math.min(1, 1 - cloud / 100));
  const wind = windMs ?? 0;
  const mix = Math.max(0.4, Math.min(1, 1 - wind / 12));  // Wind dämpft Oberflächen-Überhitzung
  const delta = ASPECT_GAIN_C * relGain * clear * mix;
  return Math.max(-ASPECT_MAX_C, Math.min(ASPECT_MAX_C, delta));
}

/**
 * Gesamt-Temperaturkorrektur am Punkt (°C). `anchorAttenuation` ∈ [0,1] dämpft
 * die Korrektur, wenn eine ko-lokalisierte Station die Mikrolage bereits misst
 * (1 = volle Korrektur, kein Anker; 0 = vollständig durch Obs abgedeckt).
 */
export function terrainTempDeltaC(args: {
  ctx: TerrainContext;
  lat: number; lng: number; etaMs: number;
  windMs: number | null; cloudPct: number | null;
  anchorAttenuation: number;
}): number {
  const solar = solarPosition(args.lat, args.lng, args.etaMs);
  const cold = nocturnalCoolingC(args.ctx, solar.elevationDeg, args.windMs, args.cloudPct);
  const aspect = aspectInsolationDeltaC(args.ctx, solar, args.windMs, args.cloudPct);
  return (cold + aspect) * Math.max(0, Math.min(1, args.anchorAttenuation));
}

// ---------------------------------------------------------------------------
// Verifikation — eigenschaftsbasiert (Physik-Relationen eindeutig prüfbar).
// ---------------------------------------------------------------------------
export interface TerrainCheck { name: string; expected: string; got: string; ok: boolean }
export interface TerrainVerifyResult { checks: TerrainCheck[]; passed: number; failed: number }

export function verifyTerrainPhysics(): TerrainVerifyResult {
  const checks: TerrainCheck[] = [];
  const r1 = (x: number) => Math.round(x * 100) / 100;
  const push = (name: string, expected: string, got: string, ok: boolean) =>
    checks.push({ name, expected, got, ok });

  // Synthetisches DEM: Senke (Punkt 1000 m, Umgebung 1120 m) → sinkDepth ≈ 120 m, eben.
  const valley = (lng: number, lat: number) => {
    const d = Math.hypot(lng - 11, lat - 47);
    return d < 0.005 ? 1000 : 1120;     // schmaler Talboden
  };
  const ctxValley = terrainContext(valley, 11, 47);
  push('Senke erkannt (sinkDepth ~120 m)', '100–130', String(r1(ctxValley.sinkDepthM)),
    ctxValley.sinkDepthM > 100 && ctxValley.sinkDepthM < 130);

  // Südhang: Höhe fällt nach Süden (z nimmt nach Norden zu) → Aspekt ~180°.
  const southFace = (_lng: number, lat: number) => 1000 + (lat - 47) * 20000; // +20 m / 0.001° nach N
  const ctxSouth = terrainContext(southFace, 11, 47);
  const aspectDeg = (ctxSouth.aspectRad * 180) / Math.PI;
  push('Südhang erkannt (Aspekt ~180°)', '150–210', String(r1(aspectDeg)),
    aspectDeg > 150 && aspectDeg < 210);

  // Nacht in der Senke, windstill, klar → deutliche Abkühlung (< −1 °C).
  const winterNight = Date.UTC(2025, 0, 15, 2, 0, 0);  // ~03:00 lokal, Sonne tief unten
  const solN = solarPosition(47, 11, winterNight);
  const coolN = nocturnalCoolingC(ctxValley, solN.elevationDeg, 0.5, 5);
  push('Kaltluftsee nachts (windstill/klar) < −1 °C', '<-1', String(r1(coolN)),
    solN.elevationDeg < 0 && coolN < -1);

  // Gleiche Senke, aber windig → keine/kaum Abkühlung.
  const coolWindy = nocturnalCoolingC(ctxValley, solN.elevationDeg, 6, 5);
  push('Wind verhindert Kaltluftsee (~0)', '0', String(r1(coolWindy)), coolWindy === 0);

  // Bedeckt → keine Ausstrahlung → ~0.
  const coolCloud = nocturnalCoolingC(ctxValley, solN.elevationDeg, 0.5, 100);
  push('Bewölkung verhindert Kaltluftsee (~0)', '0', String(r1(coolCloud)), coolCloud === 0);

  // Südhang am Mittag → positive Einstrahlungskorrektur; Nordhang → negativ.
  const noon = Date.UTC(2025, 5, 21, 11, 0, 0);
  const solNoon = solarPosition(47, 11, noon);
  const ctxS = { elevationM: 1500, sinkDepthM: 0, slopeRad: 0.5, aspectRad: Math.PI };       // Südhang
  const ctxN = { elevationM: 1500, sinkDepthM: 0, slopeRad: 0.5, aspectRad: 0 };             // Nordhang
  const aS = aspectInsolationDeltaC(ctxS, solNoon, 1, 10);
  const aN = aspectInsolationDeltaC(ctxN, solNoon, 1, 10);
  // Bei hohem Sommer-Mittagsstand ist der Aspekt-Effekt physikalisch klein
  // (Sonne ~senkrecht beleuchtet alle Expositionen ähnlich); entscheidend ist
  // das Vorzeichen: Südhang > 0 (wärmer als eben), Nordhang < Südhang (kühler).
  push('Südhang Mittag wärmer als eben (> 0)', '>0', String(r1(aS)), aS > 0.05);
  push('Nordhang deutlich kühler als Südhang', 'aN<aS', `${r1(aN)}<${r1(aS)}`, aN < aS - 0.3);

  // Anker-Dämpfung: volle Korrektur (1) vs. gedämpft (0,3).
  const full = terrainTempDeltaC({ ctx: ctxValley, lat: 47, lng: 11, etaMs: winterNight, windMs: 0.5, cloudPct: 5, anchorAttenuation: 1 });
  const damped = terrainTempDeltaC({ ctx: ctxValley, lat: 47, lng: 11, etaMs: winterNight, windMs: 0.5, cloudPct: 5, anchorAttenuation: 0.3 });
  push('Anker dämpft Korrektur (|damped| < |full|)', '<', `${r1(damped)} vs ${r1(full)}`,
    Math.abs(damped) < Math.abs(full) && full < 0);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyTerrainPhysics: typeof verifyTerrainPhysics }).__verifyTerrainPhysics = verifyTerrainPhysics;
}
