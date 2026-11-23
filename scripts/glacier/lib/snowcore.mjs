/**
 * GM-1 — pure core of the glacier snowpack line (`audit/gletscher-schneemodell.md`): a layered snowpack per elevation band that turns the
 * snow water equivalent of the melt core into snow DEPTH and NEW SNOW in centimetres. No network, no files, no buscosun Fusion.
 *
 * What it does, per band and hour:
 *   1. new snow arrives with a new-snow density (rule below) and is laid on top; the load compacts the layers underneath at once
 *      (overburden strain, Winkler et al. 2021, Eq. 2);
 *   2. new snow settles at about 1 % per hour, slower when cold (Anderson 1976 as printed in Helfricht et al. 2018, Eq. 1a), until it has
 *      the density Δsnow starts from; from there every layer settles under the weight above it with a density-dependent viscosity
 *      (Winkler et al. 2021, Eq. 1). M-2 of the audit: with Δsnow alone, hourly new snow came out 1.6 times too dense after a day;
 *   3. melt takes mass and thickness from the top.
 * The mass balance (solid precipitation − melt) is exactly the melt core's: this core adds thickness, never mass.
 *
 * Layers: one bulk layer of old snow plus fresh layers of at most `layerH` hours each, kept apart for `newWindowH` hours so that
 * "new snow of the last 24 / 48 / 72 h" can be read as the SETTLED thickness of what fell in that window (what a snow board shows).
 *
 * Sources (every constant carries its origin in `SNOW_ORIGIN`):
 *   Helfricht, Hartl, Koch, Marty, Olefs (2018), HESS 22, 2655–2668, doi:10.5194/hess-22-2655-2018, CC BY 4.0 — hourly new-snow density
 *     measured at four Alpine stations: mean 68 kg m⁻³, standard deviation 9 kg m⁻³; the Vionnet et al. (2012) formula as printed there (Eq. 7).
 *   Winkler, Schellander, Gruber (2021), HESS 25, 1165–1187, doi:10.5194/hess-25-1165-2021, CC BY 4.0 — Δsnow: compaction law, overburden
 *     strain and the calibrated parameters (ρmax 401 kg m⁻³, η0 8.5e6 Pa s, k 0.030 m³ kg⁻¹, c_ov 5.1e-4 Pa⁻¹, k_ov 0.38; ρ0 81 kg m⁻³ for
 *     DAILY new snow, used here only as a cross-check).
 * Deviation from the source, stated: Δsnow is calibrated for daily steps and for stations at 590–1 780 m; this core steps hourly and is used
 * at glacier elevations. Both are checked against measurements in GM-3 before any number is called `measured`.
 *
 * Not in this core (named gaps): densification by melt water and refreezing, rain stored in the snowpack, wind redistribution, sublimation.
 */

const H = 3_600_000;

export const SNOW = Object.freeze({
  g: 9.81,                 // m s⁻²
  rhoNew: 68,              // kg m⁻³, hourly new snow, measured mean (Helfricht 2018)
  rhoNewSd: 9,             // kg m⁻³, its standard deviation (Helfricht 2018)
  rhoNewDaily: 81,         // kg m⁻³, daily new snow (Winkler 2021) — cross-check only, never used in a step
  rhoMax: 401,             // kg m⁻³, maximum layer density (Winkler 2021)
  eta0: 8.5e6,             // Pa s, viscosity at density 0 (Winkler 2021)
  kEta: 0.030,             // m³ kg⁻¹, viscosity growth with density (Winkler 2021)
  cOv: 5.1e-4,             // Pa⁻¹, overburden coefficient (Winkler 2021)
  kOv: 0.38,               // overburden density factor (Winkler 2021)
  freshC1: 2.777e-6,       // s⁻¹, settling rate of new snow at 0 °C (Anderson 1976 as printed in Helfricht 2018, Eq. 1a) = 1 % per hour
  freshC2: 0.04,           // K⁻¹, its decrease with cold: rate · e^(0.04·T), T in °C ≤ 0 (same source)
  rhoHandover: 81,         // kg m⁻³: below, a layer is NEW snow and settles by the rule above; from here on Δsnow takes over (value = Winkler's ρ0; the hand-over itself is set)
  vionnetA: 109, vionnetB: 6, vionnetC: 26,   // ρ = 109 + 6·(T − Tf) + 26·√u (Vionnet 2012 as printed in Helfricht 2018, Eq. 7; Tf = 0 °C)
  rhoNewFloor: 50,         // kg m⁻³, lower bound of any new-snow density (set)
  rhoOldInit: 250,         // kg m⁻³, density given to a snowpack taken over from the melt state without layers (set)
  layerH: 6,               // h, a fresh layer collects the snowfall of at most this long (set)
  newWindowH: 72,          // h, fresh layers are kept apart this long, then merged into the old snow (set)
  sweEps: 1e-6,            // mm, below this a layer is empty
});

export const SNOW_ORIGIN = Object.freeze({
  rhoNew: 'literature', rhoNewSd: 'literature', rhoNewDaily: 'literature', rhoMax: 'literature', eta0: 'literature', kEta: 'literature',
  cOv: 'literature', kOv: 'literature', freshC1: 'literature', freshC2: 'literature', rhoHandover: 'set', vionnetA: 'literature', vionnetB: 'literature', vionnetC: 'literature',
  rhoNewFloor: 'set', rhoOldInit: 'set', layerH: 'set', newWindowH: 'set',
});

export const SNOW_SOURCES = Object.freeze([
  { id: 'helfricht2018', cite: 'Helfricht, K., Hartl, L., Koch, R., Marty, C., Olefs, M. (2018): Obtaining sub-daily new snow density from automated measurements in high mountain regions. Hydrol. Earth Syst. Sci. 22, 2655–2668.', doi: 'https://doi.org/10.5194/hess-22-2655-2018', licence: 'CC BY 4.0' },
  { id: 'winkler2021', cite: 'Winkler, M., Schellander, H., Gruber, S. (2021): Snow water equivalents exclusively from snow depths and their temporal changes: the Δsnow model. Hydrol. Earth Syst. Sci. 25, 1165–1187.', doi: 'https://doi.org/10.5194/hess-25-1165-2021', licence: 'CC BY 4.0' },
]);

/** The two new-snow density rules. `measured` is the default: the mean of hourly measurements; `vionnet` adds temperature and wind. */
export const SNOW_DENSITY_RULES = Object.freeze(['measured', 'vionnet']);
export const SNOW_DENSITY_DEFAULT = 'measured';

/**
 * Density of new snow (kg m⁻³). `measured`: 68, whatever the weather (Helfricht 2018: the tested formulas mostly overestimate hourly values).
 * `vionnet`: 109 + 6·T + 26·√u with T in °C and u in m s⁻¹; never below the floor, never above the maximum layer density.
 * A missing temperature or wind under `vionnet` gives `null` — the caller decides, nothing is filled here.
 */
export function newSnowDensity({ rule = SNOW_DENSITY_DEFAULT, tC = null, uMs = null, c = SNOW } = {}) {
  if (rule === 'measured') return c.rhoNew;
  if (rule !== 'vionnet') throw new Error(`Neuschneedichte: unbekannte Regel „${rule}“ (erlaubt: ${SNOW_DENSITY_RULES.join(', ')})`);
  if (!Number.isFinite(tC) || !Number.isFinite(uMs) || uMs < 0) return null;
  return Math.min(c.rhoMax, Math.max(c.rhoNewFloor, c.vionnetA + c.vionnetB * tC + c.vionnetC * Math.sqrt(uMs)));
}

/**
 * p10 / p90 of the new-snow density: the span every depth of new snow is shown with. From mean and standard deviation (normal: 68, sd 9) — or, when the
 * set of constants carries measured quantiles (`rhoNewP10`, `rhoNewP90`; phase GM, E-GM-8), those. `p50` is the density the core lays new snow down with.
 */
export function newSnowDensitySpan(c = SNOW) {
  if (Number.isFinite(c.rhoNewP10) && Number.isFinite(c.rhoNewP90)) return { p10: c.rhoNewP10, p50: c.rhoNew, p90: c.rhoNewP90 };
  const z = 1.2815515655446004;
  return { p10: c.rhoNew - z * c.rhoNewSd, p50: c.rhoNew, p90: c.rhoNew + z * c.rhoNewSd };
}

/** Thickness in cm of `sweMm` (kg m⁻²) at density `rho` (kg m⁻³). */
export const depthCmOf = (sweMm, rho) => (sweMm / rho) * 100;
/** Density in kg m⁻³ of a layer (`null` for an empty one). */
export const densityOf = (l) => (l.h > 0 && l.swe > 0 ? l.swe / (l.h / 100) : null);

/** An empty snowpack: `old` = bulk layer, `fresh` = fresh layers, oldest first. `swe` in mm w. e., `h` in cm, `t0` = start of the layer (ms UTC). */
export const emptyPack = () => ({ old: { swe: 0, h: 0 }, fresh: [] });

/** A snowpack taken over from a plain water equivalent (the melt state before this line): one old layer at the set density. */
export function packFromSwe(sweMm, c = SNOW) {
  const p = emptyPack();
  if (sweMm > c.sweEps) { p.old.swe = sweMm; p.old.h = depthCmOf(sweMm, c.rhoOldInit); }
  return p;
}

const layersTopDown = (p) => [...p.fresh].reverse().concat(p.old);
const clampDensity = (l, c) => { if (l.swe > c.sweEps) { const hMin = depthCmOf(l.swe, c.rhoMax); if (l.h < hMin) l.h = hMin; } else { l.swe = 0; l.h = 0; } };

/** Fresh layers older than the window become old snow (mass and thickness are added, nothing is lost). */
export function ageOut(p, tMs, c = SNOW) {
  const keep = [];
  for (const l of p.fresh) {
    if (tMs - l.t0 >= c.newWindowH * H) { p.old.swe += l.swe; p.old.h += l.h; } else keep.push(l);
  }
  p.fresh = keep;
  return p;
}

/**
 * Overburden strain of a new snow load `sweNewMm` on the layers of Δsnow's range (density ≥ `rhoHandover`; Winkler 2021, Eq. 2):
 * h ← (1 − ε)·h, mass unchanged. New snow below that density is left alone: its settling under ongoing snowfall is not in the source either.
 */
export function overburden(p, sweNewMm, c = SNOW) {
  if (!(sweNewMm > 0)) return p;
  const sigma0 = sweNewMm * c.g;   // Pa: kg m⁻² · m s⁻²
  for (const l of layersTopDown(p)) {
    const rho = densityOf(l);
    if (rho == null || rho < c.rhoHandover || rho >= c.rhoMax) continue;
    const eps = Math.min(1, Math.max(0, c.cOv * sigma0 * Math.exp((-c.kOv * rho) / (c.rhoMax - rho))));
    l.h *= 1 - eps;
    clampDensity(l, c);
  }
  return p;
}

/** New snow laid on top: into the top layer while that layer is younger than `layerH`, else as a new layer. */
export function deposit(p, sweNewMm, rhoNew, tMs, c = SNOW) {
  if (!(sweNewMm > 0)) return p;
  if (!(rhoNew > 0)) throw new Error('Neuschnee ohne Dichte');
  const top = p.fresh[p.fresh.length - 1];
  const dh = depthCmOf(sweNewMm, rhoNew);
  if (top && tMs - top.t0 < c.layerH * H) { top.swe += sweNewMm; top.h += dh; } else p.fresh.push({ swe: sweNewMm, h: dh, t0: tMs });
  return p;
}

/**
 * Settling over `dtS` seconds, each law in the range it was made for:
 *   new snow (density below `rhoHandover`): h ← h·e^(−c1·e^(c2·T)·Δt), T = air temperature of the band in °C, capped at 0 (Anderson 1976 as
 *     printed in Helfricht 2018, Eq. 1a); it stops at the hand-over density within the step. Without a temperature the layer is left as it is.
 *   older snow: h(t−1)/h(t) = 1 + Δt·σ/η with σ = g·(mass of the layer and all above), η = η0·e^(k·ρ) (Winkler 2021, Eq. 1).
 */
export function compact(p, dtS, tC = null, c = SNOW) {
  let load = 0;
  for (const l of layersTopDown(p)) {
    if (!(l.swe > c.sweEps)) continue;
    load += l.swe;
    const rho = densityOf(l);
    if (rho == null) continue;
    if (rho < c.rhoHandover) {
      if (!Number.isFinite(tC)) continue;
      const hNew = l.h * Math.exp(-c.freshC1 * Math.exp(c.freshC2 * Math.min(0, tC)) * dtS);
      l.h = Math.max(hNew, depthCmOf(l.swe, c.rhoHandover));
    } else {
      const eta = c.eta0 * Math.exp(c.kEta * rho);
      l.h /= 1 + (dtS * c.g * load) / eta;
    }
    clampDensity(l, c);
  }
  return p;
}

/** Melt takes mass from the top, and with it the same share of that layer's thickness. Returns the melt actually taken (mm). */
export function melt(p, meltMm, c = SNOW) {
  let rest = meltMm > 0 ? meltMm : 0;
  for (const l of layersTopDown(p)) {
    if (!(rest > 0)) break;
    if (!(l.swe > c.sweEps)) continue;
    const take = Math.min(l.swe, rest);
    l.h *= 1 - take / l.swe;
    l.swe -= take;
    rest -= take;
    if (!(l.swe > c.sweEps)) { l.swe = 0; l.h = 0; }
  }
  p.fresh = p.fresh.filter((l) => l.swe > c.sweEps);
  return (meltMm > 0 ? meltMm : 0) - rest;
}

/**
 * One step of one band: age out, new load, deposit, settle, melt — in the order of Δsnow (compaction by the new load first, the new layer
 * second, then the whole pack settles). `solidMm` and `meltMm` come from the melt core; a missing value counts as 0 there, not here.
 * A `rhoNew` left out means the density of the constants in use (`c.rhoNew`); an explicit `null` (a rule without a value) still stops in `deposit`.
 */
export function stepPack(p, { tMs, solidMm = 0, rhoNew, meltMm = 0, tC = null, dtS = 3600 }, c = SNOW) {
  ageOut(p, tMs, c);
  if (solidMm > 0) { overburden(p, solidMm, c); deposit(p, solidMm, rhoNew === undefined ? c.rhoNew : rhoNew, tMs, c); }
  compact(p, dtS, tC, c);
  const taken = melt(p, meltMm, c);
  return { pack: p, melted: taken };
}

/** Total snow water equivalent (mm) and depth (cm) of a pack, and its bulk density (kg m⁻³, `null` without snow). */
export const packSwe = (p) => p.old.swe + p.fresh.reduce((s, l) => s + l.swe, 0);
export const packDepthCm = (p) => p.old.h + p.fresh.reduce((s, l) => s + l.h, 0);
export const packDensity = (p) => { const h = packDepthCm(p), w = packSwe(p); return h > 0 && w > 0 ? w / (h / 100) : null; };

/**
 * New snow of the last `windowH` hours at `tMs`: settled thickness (cm) and water equivalent (mm) of the fresh layers inside the window.
 * A layer collects snow over [t0, t0 + layerH]; one that straddles the start of the window counts with the share of that span lying inside
 * (even deposition assumed — the layer does not know more). `windowH` ≤ `newWindowH`.
 */
export function newSnow(p, tMs, windowH, c = SNOW) {
  if (windowH > c.newWindowH) throw new Error(`Neuschnee-Fenster ${windowH} h über der Haltezeit ${c.newWindowH} h`);
  const from = tMs - windowH * H, span = c.layerH * H;
  let cm = 0, mm = 0;
  for (const l of p.fresh) {
    const share = Math.min(1, Math.max(0, (Math.min(l.t0 + span, tMs) - Math.max(l.t0, from)) / Math.max(1, Math.min(l.t0 + span, tMs) - l.t0)));
    cm += l.h * share; mm += l.swe * share;
  }
  return { cm, mm };
}

/** Compact form for the state file: [old swe ×10, old h ×10, then per fresh layer swe ×10, h ×10, start hour (h since epoch)], integers. */
export function packToRow(p) {
  const r = [Math.round(p.old.swe * 10), Math.round(p.old.h * 10)];
  for (const l of p.fresh) r.push(Math.round(l.swe * 10), Math.round(l.h * 10), Math.round(l.t0 / H));
  return r;
}
export function packFromRow(r) {
  if (!Array.isArray(r) || r.length < 2 || (r.length - 2) % 3 !== 0 || r.some((v) => !Number.isInteger(v) || v < 0)) throw new Error('Schneezustand: Zeile unlesbar');
  const p = { old: { swe: r[0] / 10, h: r[1] / 10 }, fresh: [] };
  for (let i = 2; i < r.length; i += 3) p.fresh.push({ swe: r[i] / 10, h: r[i + 1] / 10, t0: r[i + 2] * H });
  return p;
}

/** Rules of a pack, for verifiers and for the reader of the state: no negative values, density within the bounds, fresh layers in order. */
export function packProblems(p, c = SNOW) {
  const out = [];
  const one = (l, name) => {
    if (!(l.swe >= 0) || !(l.h >= 0)) out.push(`${name}: negativ`);
    if ((l.swe > c.sweEps) !== (l.h > 0)) out.push(`${name}: Masse ohne Dicke oder umgekehrt`);
    const rho = densityOf(l);
    if (rho != null && (rho > c.rhoMax + 0.5 || rho < 20)) out.push(`${name}: Dichte ${rho.toFixed(1)}`);
  };
  one(p.old, 'alt');
  p.fresh.forEach((l, i) => { one(l, `neu[${i}]`); if (i > 0 && l.t0 <= p.fresh[i - 1].t0) out.push(`neu[${i}]: Reihenfolge`); });
  return out;
}
