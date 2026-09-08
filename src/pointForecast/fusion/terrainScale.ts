/**
 * Multi-scale terrain description — the physical basis of the
 * representativeness error.
 *
 * ── The idea ───────────────────────────────────────────────────────────────
 * A gridded model does not forecast the weather at your point. It forecasts the
 * weather of a cell whose topography is the *average* of everything inside it.
 * In the Alps a 2,5-km AROME cell can contain a valley floor at 700 m and a
 * ridge at 2 100 m; its 2-m temperature belongs to neither. The size of that
 * mismatch is not a matter of model quality and cannot be fixed by a better
 * forecast — it is geometry.
 *
 * And it is computable: the temperature error a point suffers from being inside
 * a cell of footprint L is about
 *
 *      σ_rep ≈ γ · σ_z(L)
 *
 * the lapse rate times the standard deviation of elevation inside that
 * footprint. Over the North German Plain σ_z(2,5 km) ≈ 10 m ⇒ 0,07 K, and the
 * model deserves to be believed. In an inner-alpine valley σ_z(2,5 km) ≈ 250 m
 * ⇒ 1,6 K, and it does not — without any threshold, flag or hand-set tolerance
 * anywhere in the code.
 *
 * This module measures σ_z(L) and the terrain position index from the DEM that
 * the point forecast already loads. It adds no data source and no fetch.
 *
 * Pure (takes a sampler closure). Headless-checkable via {@link verifyTerrainScale}.
 */

const METERS_PER_DEG_LAT = 110_540;

/** Ring radii sampled, in metres. Covers 0,5 km (a slope) to 12 km (a valley system). */
const RADII_M = [500, 1_000, 2_000, 4_000, 8_000, 12_000] as const;
const AZIMUTHS = 8;

/**
 * Beyond the largest sampled radius the spread is extrapolated as
 * σ_z(L) = σ_z(L_max)·(L/L_max)^H with H = 0,6.
 *
 * Real topography is self-affine over the 1–100 km band with a Hurst exponent
 * around 0,5–0,7; 0,6 is the middle of that. The extrapolation only ever
 * applies to the coarse global models (28 km), where the exact value changes
 * nothing about the conclusion — the term is large either way. Sampling that
 * far would need a bigger DEM window and more tiles for no decision-relevant
 * gain.
 */
const HURST = 0.6;
const MAX_SAMPLED_R = RADII_M[RADII_M.length - 1];

export interface TerrainScales {
  elevationM: number;
  /** Ring mean elevation per radius in `RADII_M`. */
  ringMeanM: number[];
  /** Cumulative elevation standard deviation within each radius (metres). */
  spreadM: number[];
  /**
   * Signed terrain position at each radius: point minus ring mean.
   * > 0 = the point stands above its surroundings (ridge, exposed);
   * < 0 = it sits below them (valley floor, sheltered).
   */
  tpiM: number[];
  /**
   * Horizon elevation angle (rad) per azimuth, taken as the MAXIMUM over all
   * sampled radii — the horizon is the highest obstruction in that direction,
   * whichever ring it happens to sit on. Length = AZIMUTHS.
   */
  horizonRad: number[];
  /**
   * How many ring samples returned a finite elevation. Zero means the DEM gave
   * nothing at all — the caller must then refuse to produce distributions rather
   * than treat the world as a perfect plain.
   */
  sampledCount: number;
}

/**
 * Sample the DEM on concentric rings and derive spread and terrain position.
 * 49 lookups (6 radii × 8 azimuths + centre) into an already-resident grid.
 */
export function terrainScales(
  sample: (lng: number, lat: number) => number,
  lng: number,
  lat: number,
): TerrainScales {
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const centre = sample(lng, lat);
  const elevationM = Number.isFinite(centre) ? Math.max(0, centre) : 0;

  const ringMeanM: number[] = [];
  const spreadM: number[] = [];
  const tpiM: number[] = [];
  const horizonRad = new Array<number>(AZIMUTHS).fill(0);

  // Running accumulators over all samples inside the current radius, so
  // `spreadM[i]` is the spread of the whole disc, not of the ring alone.
  let n = 1, sum = elevationM, sumSq = elevationM * elevationM;

  for (const rM of RADII_M) {
    const dLat = rM / METERS_PER_DEG_LAT;
    const dLng = rM / (METERS_PER_DEG_LAT * cosLat);
    let ringSum = 0, ringN = 0;
    for (let a = 0; a < AZIMUTHS; a++) {
      const ang = (a / AZIMUTHS) * 2 * Math.PI;
      const e = sample(lng + dLng * Math.sin(ang), lat + dLat * Math.cos(ang));
      if (!Number.isFinite(e)) continue;
      const z = Math.max(0, e);
      ringSum += z; ringN++;
      n++; sum += z; sumSq += z * z;
      // Horizon in this direction: the steepest angle seen so far.
      const ang2 = Math.atan2(Math.max(0, z - elevationM), rM);
      if (ang2 > horizonRad[a]) horizonRad[a] = ang2;
    }
    const rMean = ringN > 0 ? ringSum / ringN : elevationM;
    ringMeanM.push(rMean);
    tpiM.push(elevationM - rMean);
    const mean = sum / n;
    spreadM.push(Math.sqrt(Math.max(0, sumSq / n - mean * mean)));
  }

  return { elevationM, ringMeanM, spreadM, tpiM, horizonRad, sampledCount: n - 1 };
}

/** Elevation spread inside a footprint of size `footprintM` (its full width). */
export function spreadAtFootprint(t: TerrainScales, footprintM: number): number {
  const r = Math.max(0, footprintM) / 2;
  if (r <= 0) return 0;
  if (r <= RADII_M[0]) return t.spreadM[0] * (r / RADII_M[0]);
  for (let i = 1; i < RADII_M.length; i++) {
    if (r <= RADII_M[i]) {
      const f = (r - RADII_M[i - 1]) / (RADII_M[i] - RADII_M[i - 1]);
      return t.spreadM[i - 1] * (1 - f) + t.spreadM[i] * f;
    }
  }
  return t.spreadM[t.spreadM.length - 1] * Math.pow(r / MAX_SAMPLED_R, HURST);
}

/** Signed terrain position at a given scale (metres). Positive = exposed. */
export function tpiAt(t: TerrainScales, scaleM: number): number {
  const r = Math.max(0, scaleM) / 2;
  if (r <= RADII_M[0]) return t.tpiM[0];
  for (let i = 1; i < RADII_M.length; i++) {
    if (r <= RADII_M[i]) {
      const f = (r - RADII_M[i - 1]) / (RADII_M[i] - RADII_M[i - 1]);
      return t.tpiM[i - 1] * (1 - f) + t.tpiM[i] * f;
    }
  }
  return t.tpiM[t.tpiM.length - 1];
}

/**
 * Sky-view factor in [0,1] — the fraction of the sky hemisphere that is not
 * blocked by surrounding terrain. Drives how strongly a valley can cool
 * radiatively at night and how much direct beam a slope receives.
 *
 * For a horizon at elevation angle θ the visible fraction of the hemisphere is
 * cos²θ; averaging that over the azimuth sectors is the standard discrete
 * estimator. Averaging the ANGLES first and taking one cosine would be wrong in
 * exactly the case that matters most — a straight valley is open along its axis
 * and closed across it, and only the per-direction form gets that right.
 */
export function skyViewFactor(t: TerrainScales): number {
  if (!t.horizonRad?.length) return 1;
  let acc = 0;
  for (const a of t.horizonRad) {
    const c = Math.cos(a);
    acc += c * c;
  }
  return Math.max(0.05, Math.min(1, acc / t.horizonRad.length));
}

// ---------------------------------------------------------------------------
// Verification — synthetic terrain with a known answer
// ---------------------------------------------------------------------------

export interface TsCheck { name: string; ok: boolean; detail?: string }
export interface TsVerifyResult { checks: TsCheck[]; passed: number; failed: number }

export function verifyTerrainScale(): TsVerifyResult {
  const checks: TsCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const lat = 47, lng = 11;

  // --- perfectly flat: no spread, no terrain position, full sky
  {
    const flat = terrainScales(() => 400, lng, lat);
    add('Ebene: Höhenstreuung 0 auf allen Skalen', flat.spreadM.every((s) => s < 1e-6), flat.spreadM[3].toExponential(1));
    add('Ebene: TPI 0', flat.tpiM.every((v) => Math.abs(v) < 1e-6));
    add('Ebene: Sky-View 1', Math.abs(skyViewFactor(flat) - 1) < 1e-9);
    add('Ebene: Horizont überall 0°', flat.horizonRad.every((a) => a === 0));
    add('Ebene: Repräsentativität eines 28-km-Modells bleibt 0',
      spreadAtFootprint(flat, 28_000) < 1e-6);
  }

  // --- a linear slope of 100 m/km: spread grows linearly with radius
  {
    const slope = (_x: number, y: number) => 1000 + (y - lat) * METERS_PER_DEG_LAT * 0.1;
    const t = terrainScales(slope, lng, lat);
    const s2 = spreadAtFootprint(t, 4_000);   // r = 2 km ⇒ ±200 m along the slope
    const s4 = spreadAtFootprint(t, 8_000);   // r = 4 km ⇒ ±400 m
    add('Hang: Streuung wächst mit der Skala', s4 > s2 * 1.6, `${s2.toFixed(0)} → ${s4.toFixed(0)} m`);
    add('Hang: Streuung in der richtigen Größenordnung (r = 2 km ⇒ ~100–200 m)',
      s2 > 80 && s2 < 220, s2.toFixed(0));
  }

  // --- a valley floor: negative TPI, reduced sky view
  {
    const valley = (x: number, _y: number) => {
      const dxM = (x - lng) * METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
      return 600 + Math.min(1400, Math.abs(dxM) * 1.0);   // V-shaped, 45° walls
    };
    const t = terrainScales(valley, lng, lat);
    add('Talboden: TPI negativ (Punkt unter der Umgebung)', tpiAt(t, 4_000) < -100, tpiAt(t, 4_000).toFixed(0));
    add('Talboden: Sky-View deutlich unter 1', skyViewFactor(t) < 0.75, skyViewFactor(t).toFixed(3));
    add('Talboden: entlang der Talachse bleibt der Himmel offen',
      t.horizonRad.some((a) => a < 0.02) && t.horizonRad.some((a) => a > 0.6),
      t.horizonRad.map((a) => (a * 180 / Math.PI).toFixed(0)).join('/'));
    add('Talboden: Streuung eines 2,5-km-Modells > 100 m',
      spreadAtFootprint(t, 2_500) > 100, spreadAtFootprint(t, 2_500).toFixed(0));
  }

  // --- a summit: positive TPI, full sky
  {
    const peak = (x: number, y: number) => {
      const dyM = (y - lat) * METERS_PER_DEG_LAT;
      const dxM = (x - lng) * METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
      return 2500 - Math.min(1500, Math.hypot(dxM, dyM) * 0.3);
    };
    const t = terrainScales(peak, lng, lat);
    add('Gipfel: TPI positiv', tpiAt(t, 4_000) > 100, tpiAt(t, 4_000).toFixed(0));
    add('Gipfel: Sky-View = 1 (nichts verdeckt)', skyViewFactor(t) > 0.999, skyViewFactor(t).toFixed(4));
  }

  // --- footprint monotonicity and the extrapolation branch
  {
    const rough = (x: number, y: number) => {
      const dyM = (y - lat) * METERS_PER_DEG_LAT;
      const dxM = (x - lng) * METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
      return 1000 + 300 * Math.sin(dxM / 1500) + 250 * Math.cos(dyM / 2200);
    };
    const t = terrainScales(rough, lng, lat);
    let mono = true, prev = -1;
    for (const L of [500, 1000, 2500, 5000, 12000, 28000, 50000]) {
      const s = spreadAtFootprint(t, L);
      if (s < prev - 1e-9) mono = false;
      prev = s;
    }
    add('Streuung wächst monoton mit der Modell-Maschenweite', mono);
    add('28-km-Modell sieht mehr Unterschied als ein 2,5-km-Modell',
      spreadAtFootprint(t, 28_000) > spreadAtFootprint(t, 2_500),
      `${spreadAtFootprint(t, 2_500).toFixed(0)} vs ${spreadAtFootprint(t, 28_000).toFixed(0)} m`);
    add('Footprint 0 (Stationsmessung) ⇒ keine Repräsentativitätsstreuung',
      spreadAtFootprint(t, 0) === 0);
  }

  // --- NaN-hostile sampler must not poison the result
  {
    const holey = (x: number, _y: number) => (Math.abs(x - lng) > 0.05 ? NaN : 800);
    const t = terrainScales(holey, lng, lat);
    add('Loch-DEM meldet, wie viel es wirklich gesehen hat',
      t.sampledCount > 0 && t.sampledCount < 48, String(t.sampledCount));
    add('NaN-Löcher im DEM ergeben endliche Werte',
      t.spreadM.every(Number.isFinite) && t.tpiM.every(Number.isFinite)
      && t.horizonRad.every(Number.isFinite) && Number.isFinite(skyViewFactor(t)));
  }

  // --- NEGATIVE CONTROL: a DEM that gives nothing at all must SAY so.
  //     A failed tile load does not throw — it yields NaN everywhere, and the
  //     terrain then looks like a perfect plain: representativeness 0, sky view
  //     1, distributions narrower than reality AND centred wrongly. The caller
  //     can only refuse if it can tell the difference.
  {
    const dead = terrainScales(() => NaN, lng, lat);
    add('Negativkontrolle: totes DEM ⇒ sampledCount 0 (Aufrufer verweigert)',
      dead.sampledCount === 0, String(dead.sampledCount));
    add('Negativkontrolle: totes DEM sieht sonst aus wie eine perfekte Ebene',
      dead.spreadM.every((v) => v === 0) && Math.abs(skyViewFactor(dead) - 1) < 1e-12);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyTerrainScale: typeof verifyTerrainScale }).__verifyTerrainScale = verifyTerrainScale;
}
