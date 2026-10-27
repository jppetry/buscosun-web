/**
 * AW-6.2.3 — the road-surface temperature core of the virtual road sensor (VS, `audit/autobahnwetter.md` §20.9):
 * a 1-D heat-conduction column under an explicit surface energy balance, after the model of RoadSurf
 * (Finnish Meteorological Institute, https://github.com/fmidev/RoadSurf, MIT License — Copyright (c) 2023 Finnish
 * Meteorological Institute; this is an independent TypeScript re-implementation of the published equations, no code was
 * copied; E-VS-1) with the latent-heat hold at the freezing point after the principle of METRo (Crevier & Delage 2001;
 * GPL-2.0 — principle only, no code). Dependency-free apart from the sun position (`roadSun.ts`) and the site/forcing
 * contracts; runs in Node (producer) and in the browser (verifier, later the page).
 *
 * Surface balance (Startprompt AW-6.2.3):
 *   G0 = (1 − α)·SW↓·C_S + ε·LW↓·C_L − ε·σ·Ts⁴ + H − LE + Q_P + Q_V
 * with H by iterated Monin-Obukhov, LE by a bulk formula (evaporation only from surface water), Q_P the heat of rain,
 * Q_V the traffic term, C_S/C_L the coupling factors of 6.2.4 (1 without coupling). Conduction: 15 nodes to ≈ 4,3 m,
 * explicit Δt = 30 s (stability checked once at load), Ts = mean of the nodes at 0 and 3 cm. Lower boundary: annual
 * sine of the deep soil temperature (`set`, V-VS-8). Bridge: a second column (8 cm asphalt + 30 cm concrete, lower
 * boundary = air). Every constant is `set` with its origin or `literature`; the research file is missing (§20.0).
 */
import { sunPosition } from '../roadSun';
import { STEFAN_BOLTZMANN, KELVIN, vapourPressureWaterHpa, vapourPressureIceHpa } from './roadVsForcing';
import { horizonAt } from './roadVsSite';

// --- Constants ---------------------------------------------------------------------------------

export const VS_DT_S = 30;
/**
 * Node depths (m), 15 nodes to 4,3 m, thin at the top (1 cm) and growing geometrically below — the pattern of RoadSurf's
 * default layering (`set`: the exact RoadSurf depths are to be checked against the source once the research file is there).
 */
export const VS_NODE_DEPTH_M: readonly number[] = Object.freeze([0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.18, 0.27, 0.40, 0.60, 0.90, 1.40, 2.40, 4.30]);
/** Ts = mean of node 0 and the node at 3 cm (Startprompt). */
export const VS_TS_NODES: readonly number[] = Object.freeze([0, 3]);
/** Bridge column: 8 cm asphalt over 30 cm concrete, lower boundary = air (Startprompt). */
export const VS_BRIDGE_DEPTH_M: readonly number[] = Object.freeze([0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.18, 0.25, 0.32, 0.38]);
export const VS_BRIDGE_ASPHALT_M = 0.08;
/** Pavement depth below which the subgrade begins (`set`: a motorway pavement is 0,55–0,85 m thick incl. base layers; the
 *  asphalt-bound part ≈ 0,3 m — RStO 12). */
export const VS_PAVEMENT_M = 0.30;
/** Material: volumetric heat capacity J/(m³K) and conductivity W/(mK) (Startprompt: asphalt 2,0·10⁶ / 0,8; concrete λ 2,2;
 *  subgrade `set`: crushed stone / moist soil 2,0·10⁶ / 1,5). */
export const VS_MATERIAL = Object.freeze({
  asphalt: { rhoC: 2.0e6, lambda: 0.8 },
  concrete: { rhoC: 2.0e6, lambda: 2.2 },
  subgrade: { rhoC: 2.0e6, lambda: 1.5 },
} as const);
export type VsMaterial = keyof typeof VS_MATERIAL;
/** Albedo dry 0,10; snow 0,60; ice 0,10 → 0,60 between 0 and 1,5 mm (Startprompt). Emissivity 0,95. */
export const VS_ALBEDO = Object.freeze({ dry: 0.10, wet: 0.08, snow: 0.60, ice: 0.60, iceFullMm: 1.5 });
export const VS_EMISSIVITY = 0.95;
/** Traffic heat W/m²: 10 by day, 5 by night (19–04 UTC); minimum wind 1,5 / 0,4 m/s (Startprompt). */
export const VS_TRAFFIC = Object.freeze({ dayWm2: 10, nightWm2: 5, nightFromUtc: 19, nightToUtc: 4, minWindDayMs: 1.5, minWindNightMs: 0.4 });
/** Monin-Obukhov: roughness lengths z0m 0,4 m, z0h 0,001 m (Startprompt), stable ψ = −4,7ζ (Businger 1971, Startprompt),
 *  unstable Paulson (1970) with γ = 16 (`literature`); measurement heights wind 10 m, air 2 m (ICON); ζ clamped (`set`). */
export const VS_MO = Object.freeze({ z0m: 0.4, z0h: 0.001, zWind: 10, zAir: 2, kappa: 0.4, beta: 4.7, gamma: 16, zetaMin: -2, zetaMax: 1, iterations: 5 });
/** Bulk latent heat: aerodynamic resistance floored at 30 s/m (Startprompt „r_a ≤ 30 s/m" read as the floor of the transfer,
 *  `set`; to be confirmed with the research file). Evaporation only with surface water; dew/rime deposition always. */
export const VS_RA_MIN_SM = 30;
/** Water, air, ice: densities, heats (`literature`). */
export const VS_PHYS = Object.freeze({ rhoAir: 1.25, cpAir: 1005, rhoWater: 1000, cWater: 4186, Lv: 2.501e6, Ls: 2.834e6, Lf: 0.334e6, g: 9.81 });
/** Latent-heat hold: within this band around 0 °C the surface flux converts water ↔ ice instead of changing Ts (METRo principle). */
export const VS_FREEZE_BAND_K = 0.1;
/** Lower boundary at 4,3 m: annual sine T = mean + amp·cos(2π·(doy − warmestDoy)/365,25). `set` (V-VS-8): DACH deep-soil
 *  climatology ≈ 10 °C mean, ±1,5 K at 4 m, warmest end of September; NOT the Finnish 6,4 °C (Startprompt). */
export const VS_DEEP_SOIL = Object.freeze({ meanC: 10.0, ampK: 1.5, warmestDoy: 270 });
/** Stores (mm): maxima (Startprompt) and hourly traffic wear (Finnish values, `set`, to calibrate on GMA drying). */
export const VS_STORE_MAX = Object.freeze({ water: 1.0, pore: 1.0, snow: 100, ice: 50, frost: 2.0 });
export const VS_WEAR_PER_H = Object.freeze({ water: 0.145, snow: 0.45, ice: 0.319, frost: 1.16 });
/** Shading: diffuse from the obscured sky is 0,15 of the global radiation (Startprompt). */
export const VS_SHADE_DIFFUSE = 0.15;
/** A column younger than this is a cold start (Startprompt: „Einschwingen über Wochen"; `set` 7 days). */
export const VS_SPINUP_H = 7 * 24;

// --- Stability check (once, at load) ----------------------------------------------------------------

export function maxStableDtS(depths: readonly number[], material: (depth: number) => { rhoC: number; lambda: number }): number {
  let dt = Infinity;
  for (let i = 1; i < depths.length; i++) {
    const dz = depths[i] - depths[i - 1];
    const m = material(depths[i]);
    dt = Math.min(dt, (m.rhoC * dz * dz) / (2 * m.lambda));
  }
  return dt;
}
export const roadMaterialAt = (depth: number, surface: 'asphalt' | 'beton' = 'asphalt') =>
  (depth <= VS_PAVEMENT_M ? VS_MATERIAL[surface === 'beton' ? 'concrete' : 'asphalt'] : VS_MATERIAL.subgrade);
export const bridgeMaterialAt = (depth: number) => (depth <= VS_BRIDGE_ASPHALT_M ? VS_MATERIAL.asphalt : VS_MATERIAL.concrete);
/** Δt ≤ ρc·Δz²/(2λ) for every layer of both columns and both surfaces — thrown at load, not discovered in production. */
export const VS_DT_LIMIT_S = Math.min(
  maxStableDtS(VS_NODE_DEPTH_M, (d) => roadMaterialAt(d, 'asphalt')), maxStableDtS(VS_NODE_DEPTH_M, (d) => roadMaterialAt(d, 'beton')),
  maxStableDtS(VS_BRIDGE_DEPTH_M, bridgeMaterialAt),
);
if (!(VS_DT_S <= VS_DT_LIMIT_S)) throw new Error(`VS: Δt ${VS_DT_S} s verletzt die Stabilität (Grenze ${VS_DT_LIMIT_S.toFixed(1)} s)`);

// --- Column ----------------------------------------------------------------------------------------

export interface VsColumn {
  depths: readonly number[];
  /** Node temperatures °C. */
  T: number[];
  /** Per node: heat capacity of its control volume J/(m²K) and conductance to the node below W/(m²K). */
  cap: number[];
  cond: number[];
}

export function makeColumn(depths: readonly number[], material: (depth: number) => { rhoC: number; lambda: number }, T0: number[] | number): VsColumn {
  const n = depths.length;
  const cap: number[] = [], cond: number[] = [];
  for (let i = 0; i < n; i++) {
    const up = i === 0 ? 0 : (depths[i] - depths[i - 1]) / 2, down = i === n - 1 ? 0 : (depths[i + 1] - depths[i]) / 2;
    // Control volume of node i reaches halfway to its neighbours; its material is the one at its depth.
    cap.push(material(depths[i]).rhoC * (up + down));
    if (i < n - 1) {
      const dz = depths[i + 1] - depths[i];
      // Series conductance of the two half layers (material may change between the nodes).
      const l1 = material(depths[i]).lambda, l2 = material(depths[i + 1]).lambda;
      cond.push(1 / ((dz / 2) / l1 + (dz / 2) / l2));
    }
  }
  return { depths, T: typeof T0 === 'number' ? new Array(n).fill(T0) : [...T0], cap, cond };
}

/**
 * One explicit step: `G0` = net flux INTO the surface node (W/m², positive warms), `bottomT` = fixed temperature of the
 * lowest node (null = insulated). Conservative finite volume: what leaves one node enters the next.
 */
export function stepColumn(c: VsColumn, G0: number, dtS: number, bottomT: number | null): void {
  const n = c.T.length;
  const flux = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) flux[i] = c.cond[i] * (c.T[i] - c.T[i + 1]);
  for (let i = 0; i < n; i++) {
    const inFlux = (i === 0 ? G0 : flux[i - 1]) - (i === n - 1 ? 0 : flux[i]);
    c.T[i] += (dtS * inFlux) / c.cap[i];
  }
  if (bottomT != null) c.T[n - 1] = bottomT;
}

/** Heat content J/m² relative to 0 °C (energy-conservation test). */
export const columnHeatJ = (c: VsColumn): number => c.T.reduce((s, t, i) => s + t * c.cap[i], 0);

export const columnTs = (c: VsColumn, nodes: readonly number[] = VS_TS_NODES): number => nodes.reduce((s, i) => s + c.T[i], 0) / nodes.length;

export function deepSoilC(ms: number, p = VS_DEEP_SOIL): number {
  const d = new Date(ms);
  const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1;
  return p.meanC + p.ampK * Math.cos((2 * Math.PI * (doy - p.warmestDoy)) / 365.25);
}

// --- Turbulent exchange --------------------------------------------------------------------------

export interface VsExchange { cH: number; uStar: number; zeta: number; H: number }

/**
 * Sensible heat H (W/m², positive = air warms the surface) by Monin-Obukhov with iterated stability. `u` wind at 10 m,
 * `ta` air at 2 m, `ts` surface, `pHpa` for the air density (null ⇒ 1,25 kg/m³).
 */
export function sensibleHeat(u: number, ta: number, ts: number, pHpa: number | null = null): VsExchange {
  const { z0m, z0h, zWind, zAir, kappa, beta, gamma, zetaMin, zetaMax, iterations } = VS_MO;
  const rho = pHpa == null ? VS_PHYS.rhoAir : (pHpa * 100) / (287.05 * (ta + KELVIN));
  const lnM = Math.log(zWind / z0m), lnH = Math.log(zAir / z0h);
  const uu = Math.max(0.1, u);
  let zeta = 0, cH = kappa * kappa / (lnM * lnH), uStar = kappa * uu / lnM, H = rho * VS_PHYS.cpAir * cH * uu * (ta - ts);
  for (let k = 0; k < iterations; k++) {
    const tvK = (ta + ts) / 2 + KELVIN;
    // L from the fluxes of the previous iterate (H > 0 = surface gains = stable stratification above a cold surface).
    const L = H === 0 ? Infinity : -(rho * VS_PHYS.cpAir * tvK * uStar ** 3) / (kappa * VS_PHYS.g * (-H));
    zeta = Number.isFinite(L) ? Math.max(zetaMin, Math.min(zetaMax, zAir / L)) : 0;
    let psiM: number, psiH: number;
    if (zeta >= 0) { psiM = -beta * zeta * (zWind / zAir); psiH = -beta * zeta; }
    else {
      const xm = Math.pow(1 - gamma * zeta * (zWind / zAir), 0.25), xh = Math.pow(1 - gamma * zeta, 0.5);
      psiM = 2 * Math.log((1 + xm) / 2) + Math.log((1 + xm * xm) / 2) - 2 * Math.atan(xm) + Math.PI / 2;
      psiH = 2 * Math.log((1 + xh) / 2);
    }
    const fm = Math.max(0.5, lnM - psiM), fh = Math.max(0.5, lnH - psiH);
    cH = kappa * kappa / (fm * fh);
    uStar = kappa * uu / fm;
    H = rho * VS_PHYS.cpAir * cH * uu * (ta - ts);
  }
  return { cH, uStar, zeta, H };
}

/** Specific humidity kg/kg from a vapour pressure (hPa) at pressure p (hPa). */
export const specificHumidity = (eHpa: number, pHpa: number): number => (0.622 * eHpa) / Math.max(1, pHpa - 0.378 * eHpa);

// --- Stores ----------------------------------------------------------------------------------------

export interface VsStores { water: number; pore: number; snow: number; ice: number; frost: number }
export const emptyStores = (): VsStores => ({ water: 0, pore: 0, snow: 0, ice: 0, frost: 0 });

export function albedoOf(s: VsStores): number {
  if (s.snow > 0.1) return VS_ALBEDO.snow;
  if (s.ice + s.frost > 0) return VS_ALBEDO.dry + (VS_ALBEDO.ice - VS_ALBEDO.dry) * Math.min(1, (s.ice + s.frost) / VS_ALBEDO.iceFullMm);
  return s.water > 0.01 ? VS_ALBEDO.wet : VS_ALBEDO.dry;
}

// --- One hour --------------------------------------------------------------------------------------

/** Forcing of ONE hour (values at the END of the hour for instantaneous quantities; means for radiation; rates mm/h). */
export interface VsHourForcing {
  validMs: number;
  ta: number; td: number; ff: number; pHpa: number | null;
  /** Hourly means W/m². */
  swDir: number; swDif: number; lwDown: number;
  /** Rates mm/h: rain, snow (water equivalent), freezing rain. */
  rain: number; snow: number; frz: number;
  /** Coupling factors of 6.2.4 (1 = none). */
  cS?: number; cL?: number;
}

export interface VsSite { lat: number; lon: number; svf: number | null; hz: ArrayLike<number> | null; bridge: boolean; surface: 'asphalt' | 'beton' }

export interface VsPointState {
  schema: 1;
  /** Node temperatures of the road column and, on a bridge, of the bridge column. */
  T: number[];
  Tb: number[] | null;
  stores: VsStores;
  /** ms of the last integrated hour; hours since initialisation (cold start below VS_SPINUP_H). */
  lastMs: number;
  ageH: number;
  initFrom: 'ta' | 'tg' | 'state';
}

export interface VsHourResult {
  ts: number;
  tsBridge: number | null;
  stores: VsStores;
  coldStart: boolean;
  /** Hour-mean fluxes W/m² (diagnostics, shadow log). */
  flux: { swNet: number; lwNet: number; H: number; LE: number; QP: number; QV: number; G0: number; shadeH: number };
  /** Water frozen (+) or ice melted (−) by the latent-heat hold, mm. */
  phaseMm: number;
}

/** Initial state at `ms`: surface ≈ air (or the model ground temperature), the deep end at the climatology, linear between. */
export function initState(ms: number, surfaceC: number, from: 'ta' | 'tg', site: VsSite): VsPointState {
  const deep = deepSoilC(ms);
  const prof = (depths: readonly number[], bottom: number) => depths.map((d) => surfaceC + (bottom - surfaceC) * (d / depths[depths.length - 1]));
  return { schema: 1, T: prof(VS_NODE_DEPTH_M, deep), Tb: site.bridge ? prof(VS_BRIDGE_DEPTH_M, surfaceC) : null, stores: emptyStores(), lastMs: ms, ageH: 0, initFrom: from };
}

const isNight = (ms: number) => { const h = new Date(ms).getUTCHours(); return h >= VS_TRAFFIC.nightFromUtc || h < VS_TRAFFIC.nightToUtc; };

/**
 * Integrates ONE hour (prev → f) with VS_DT_S sub-steps for the road column and, if present, the bridge column; the stores
 * follow the road column. `prev` = forcing of the hour before (for the interpolation of instantaneous quantities; null ⇒ f
 * throughout). Pure in the sense that it mutates and returns only `state`.
 */
export function integrateHour(state: VsPointState, site: VsSite, prev: VsHourForcing | null, f: VsHourForcing): VsHourResult {
  const road = makeColumn(VS_NODE_DEPTH_M, (d) => roadMaterialAt(d, site.surface), state.T);
  const bridge = state.Tb ? makeColumn(VS_BRIDGE_DEPTH_M, bridgeMaterialAt, state.Tb) : null;
  const s = state.stores;
  const n = Math.round(3600 / VS_DT_S);
  const t0 = f.validMs - 3_600_000;
  const p0 = prev ?? f;
  const lerp = (a: number, b: number, w: number) => a + (b - a) * w;
  const svf = site.svf ?? 1;
  const cS = f.cS ?? 1, cL = f.cL ?? 1;
  const acc = { swNet: 0, lwNet: 0, H: 0, LE: 0, QP: 0, QV: 0, G0: 0, shadeH: 0 };
  let phaseMm = 0;
  const night = isNight(f.validMs);
  const QV = night ? VS_TRAFFIC.nightWm2 : VS_TRAFFIC.dayWm2;
  const minWind = night ? VS_TRAFFIC.minWindNightMs : VS_TRAFFIC.minWindDayMs;
  const pHpa = f.pHpa ?? 1013;
  const eAir = vapourPressureWaterHpa(f.td);
  const qAir = specificHumidity(eAir, pHpa);
  const rainKgs = f.rain / 3600, frzKgs = f.frz / 3600, snowKgs = f.snow / 3600;

  for (let k = 1; k <= n; k++) {
    const w = k / n, ms = t0 + k * VS_DT_S * 1000;
    const ta = lerp(p0.ta, f.ta, w), ff = Math.max(minWind, lerp(p0.ff, f.ff, w));
    // Sun and shading: direct radiation is cut when the horizon stands above the sun; diffuse and LW↓ by the sky-view factor.
    const sun = sunPosition(ms, site.lat, site.lon);
    let swDir = f.swDir;
    let shaded = false;
    if (sun.elevationDeg <= 0) swDir = 0;
    else if (site.hz && horizonAt(site.hz, sun.azimuthDeg) > sun.elevationDeg) { swDir = 0; shaded = true; }
    const swDif = svf * f.swDif + (1 - svf) * VS_SHADE_DIFFUSE * (f.swDir + f.swDif);

    const step = (col: VsColumn, bottomT: number | null, withStores: boolean): void => {
      const ts = columnTs(col);
      const tsK = ts + KELVIN;
      const lwUp = VS_EMISSIVITY * STEFAN_BOLTZMANN * tsK ** 4;
      const lwDown = svf * f.lwDown + (1 - svf) * lwUp;
      const alpha = withStores ? albedoOf(s) : VS_ALBEDO.dry;
      const swNet = (1 - alpha) * (swDir + swDif) * cS;
      const lwNet = VS_EMISSIVITY * lwDown * cL - lwUp;
      const ex = sensibleHeat(ff, ta, ts, pHpa);
      // Latent heat: over water when liquid is present, over ice when frozen stores are present, deposition always.
      const frozen = withStores && (s.ice > 0 || s.frost > 0 || s.snow > 0);
      const eSurf = frozen ? vapourPressureIceHpa(ts) : vapourPressureWaterHpa(ts);
      const qSurf = specificHumidity(eSurf, pHpa);
      const rA = Math.max(VS_RA_MIN_SM, 1 / Math.max(1e-6, ex.cH * ff));
      let evapKgs = (VS_PHYS.rhoAir * (qSurf - qAir)) / rA; // > 0 = evaporation/sublimation
      if (evapKgs > 0 && (!withStores || (!frozen && s.water + s.pore <= 0))) evapKgs = 0;
      const L = frozen ? VS_PHYS.Ls : VS_PHYS.Lv;
      const LE = evapKgs * L;
      // Rain and freezing rain arrive at air temperature; snow at 0 °C with its melt handled by the hold below.
      const QP = (rainKgs + frzKgs) * VS_PHYS.cWater * (Math.max(ta, 0) - ts);
      let G0 = swNet + lwNet + ex.H - LE + QP + QV;
      // Latent-heat hold (METRo principle): at the freezing point the flux converts water ↔ ice, Ts stays. Freezing is
      // allowed at and BELOW the band (a surface that overshot below 0 with liquid on it freezes that liquid and is pulled
      // back to 0 °C — water does not supercool on a road), melting at and above it.
      if (withStores) {
        const liquid = s.water + s.pore, solid = s.ice + s.frost + s.snow;
        const toMm = (J: number) => (J / (VS_PHYS.Lf * VS_PHYS.rhoWater)) * 1000;
        const freeze = (dx: number) => { const fromWater = Math.min(s.water, dx); s.water -= fromWater; s.pore -= dx - fromWater; s.ice += dx; phaseMm += dx; };
        if (ts <= VS_FREEZE_BAND_K && G0 < 0 && liquid > 0) {
          const dx = Math.min(liquid, toMm(-G0 * VS_DT_S));
          freeze(dx); G0 += ((dx / 1000) * VS_PHYS.Lf * VS_PHYS.rhoWater) / VS_DT_S;
          // Heat deficit of the surface node below 0 °C: freeze what it takes to bring it back to the freezing point.
          if (col.T[0] < 0 && s.water + s.pore > 0) {
            const need = toMm(col.cap[0] * -col.T[0]);
            const dx2 = Math.min(s.water + s.pore, need);
            freeze(dx2); col.T[0] += (dx2 / need) * -col.T[0];
          }
        } else if (ts >= -VS_FREEZE_BAND_K && G0 > 0 && solid > 0) {
          const dx = Math.min(solid, toMm(G0 * VS_DT_S));
          let left = dx;
          for (const key of ['frost', 'snow', 'ice'] as const) { const m = Math.min(s[key], left); s[key] -= m; left -= m; }
          s.water = Math.min(VS_STORE_MAX.water, s.water + dx);
          phaseMm -= dx; G0 -= (dx / 1000) * VS_PHYS.Lf * VS_PHYS.rhoWater / VS_DT_S;
        }
      }
      stepColumn(col, G0, VS_DT_S, bottomT);
      if (withStores) {
        // Precipitation and vapour exchange on the stores (mm per sub-step).
        const dt = VS_DT_S;
        const liquidIn = (rainKgs + (ts > 0 ? frzKgs : 0)) * dt;
        const frzIn = ts <= 0 ? frzKgs * dt : 0;
        s.water += liquidIn; s.ice += frzIn; s.snow += snowKgs * dt;
        const ev = evapKgs * dt; // mm
        if (ev > 0) { if (frozen) { const m = Math.min(s.frost, ev); s.frost -= m; const r = ev - m; const m2 = Math.min(s.ice, r); s.ice -= m2; s.snow = Math.max(0, s.snow - (r - m2)); } else { const m = Math.min(s.water, ev); s.water -= m; s.pore = Math.max(0, s.pore - (ev - m)); } }
        else if (ev < 0) { if (ts <= 0) s.frost += -ev; else s.water += -ev; }
        // Overflow water → porous store → runoff; traffic wear.
        if (s.water > VS_STORE_MAX.water) { s.pore = Math.min(VS_STORE_MAX.pore, s.pore + (s.water - VS_STORE_MAX.water)); s.water = VS_STORE_MAX.water; }
        for (const key of ['water', 'snow', 'ice', 'frost'] as const) s[key] = Math.max(0, Math.min(VS_STORE_MAX[key], s[key] - (VS_WEAR_PER_H[key] * dt) / 3600));
        acc.swNet += swNet / n; acc.lwNet += lwNet / n; acc.H += ex.H / n; acc.LE += LE / n; acc.QP += QP / n; acc.QV += QV / n; acc.G0 += G0 / n;
        if (shaded) acc.shadeH += 1 / n;
      }
    };
    step(road, deepSoilC(ms), true);
    if (bridge) step(bridge, ta, false);
  }
  state.T = road.T;
  if (bridge) state.Tb = bridge.T;
  state.lastMs = f.validMs;
  state.ageH += 1;
  return { ts: Math.round(columnTs(road) * 100) / 100, tsBridge: bridge ? Math.round(columnTs(bridge) * 100) / 100 : null, stores: { ...s }, coldStart: state.ageH < VS_SPINUP_H, flux: acc, phaseMm: Math.round(phaseMm * 1000) / 1000 };
}

/** Problems of a stored state (a corrupt state ⇒ cold start, never a crash). */
export function vsStateProblems(j: unknown): string[] {
  if (!j || typeof j !== 'object') return ['kein Objekt'];
  const s = j as Partial<VsPointState>;
  const out: string[] = [];
  const okT = (a: unknown, n: number) => Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'number' && Number.isFinite(x) && x > -60 && x < 90);
  if (s.schema !== 1) out.push('schema');
  if (!okT(s.T, VS_NODE_DEPTH_M.length)) out.push('T');
  if (s.Tb != null && !okT(s.Tb, VS_BRIDGE_DEPTH_M.length)) out.push('Tb');
  if (!s.stores || (['water', 'pore', 'snow', 'ice', 'frost'] as const).some((k) => typeof s.stores?.[k] !== 'number' || !(s.stores[k] >= 0))) out.push('stores');
  if (typeof s.lastMs !== 'number' || typeof s.ageH !== 'number') out.push('lastMs/ageH');
  return out;
}
