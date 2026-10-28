/**
 * AW-6.2.5 — stores, road CONDITION, water film and the freezing-rain diagnosis of the virtual road sensor
 * (`audit/autobahnwetter.md` §20.11). Pure functions over the hourly result of the core (`roadVsCore.ts`); no clock, no I/O.
 * The stores themselves (water, pores, snow, ice, rime) live in the core (they feed albedo and latent heat); this file turns
 * them into words and numbers: class (first rule wins), grip CLASS (never a friction number), Gallaway film, aquaplaning
 * speed as a detail, rime trigger, Bourgouin on a model profile. Thresholds are `set` or `literature` as named.
 */
import type { VsStores } from './roadVsCore';
import { vapourPressureWaterHpa, frostPointC } from './roadVsForcing';

// --- Film and texture --------------------------------------------------------------------------------

/** BASt V 329 (via Startprompt): dry ≤ 0,01 mm, damp 0,01–0,03 mm, wet > 0,03 mm. */
export const VS_FILM = Object.freeze({ dampMm: 0.01, wetMm: 0.03 });
/** Model store → GMA film: identity in v1 (`set` 1,0; to calibrate against measured films, Startprompt). */
export const VS_FILM_STORE_FACTOR = 1.0;
export const filmFromStore = (waterMm: number): number => Math.round(waterMm * VS_FILM_STORE_FACTOR * 1000) / 1000;

/** Gallaway et al. (1979), metric form of the Startprompt: d_W = 0,103·T_XD^0,11·L^0,43·I^0,59 / S^0,42 − T_XD (mm). */
export const VS_GALLAWAY = Object.freeze({
  /** Texture depth T_XD (mm, `set` 0,5); longitudinal grade when unknown (`set` 0 %); validity of the fit I ≤ 50,8 mm/h (Gallaway). */
  textureMm: 0.5, gradePct: 0, maxRateMmH: 50.8,
});
export interface GallawayResult { filmMm: number; capped: boolean; lengthM: number; slopePct: number }
/**
 * Water film on a carriageway of width `widthM` per direction, cross slope `qPct`, longitudinal grade `gPct`, rain rate `iMmH`.
 * L = B·√(1 + (g/q)²), S = √(q² + g²); above the validity the rate is capped and the result flagged. 0 without rain.
 */
export function gallawayFilm(iMmH: number, widthM: number, qPct: number, gPct: number = VS_GALLAWAY.gradePct, tXdMm: number = VS_GALLAWAY.textureMm): GallawayResult {
  const q = Math.max(0.1, qPct), g = Math.max(0, gPct);
  const L = widthM * Math.sqrt(1 + (g / q) ** 2), S = Math.sqrt(q * q + g * g);
  const capped = iMmH > VS_GALLAWAY.maxRateMmH;
  const I = Math.min(iMmH, VS_GALLAWAY.maxRateMmH);
  if (!(I > 0)) return { filmMm: 0, capped: false, lengthM: round2(L), slopePct: round2(S) };
  const d = (0.103 * Math.pow(tXdMm, 0.11) * Math.pow(L, 0.43) * Math.pow(I, 0.59)) / Math.pow(S, 0.42) - tXdMm;
  return { filmMm: Math.max(0, Math.round(d * 1000) / 1000), capped, lengthM: round2(L), slopePct: round2(S) };
}
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Aquaplaning onset speed v_AP ≈ 96,8·d_W^−0,259 km/h (Gallaway; valid below 2,4 mm) — a detail, never a hazard level alone. */
export function aquaplaningKmh(filmMm: number): number | null {
  if (!(filmMm > 0) || filmMm >= 2.4) return null;
  return Math.round(96.8 * Math.pow(filmMm, -0.259));
}

// --- Rime ------------------------------------------------------------------------------------------

/** Rime trigger: ∫ max(0, T_frost − Ts) dt ≥ 1 K·h (`set`, Startprompt); the integral decays when Ts stays above the frost point. */
export const VS_RIME = Object.freeze({ triggerKh: 1.0, minStoreMm: 0.02, resetAboveK: 1.0 });
/** Frost point (°C) of the air from its dew point (Magnus over ice of the actual vapour pressure). */
export const frostPointOfDew = (tdC: number): number | null => frostPointC(vapourPressureWaterHpa(tdC));
export function rimeIntegralUpdate(prevKh: number, tFrostC: number | null, tsC: number, dtH = 1): number {
  if (tFrostC == null) return prevKh;
  const d = tFrostC - tsC;
  if (d > 0) return Math.round((prevKh + d * dtH) * 1000) / 1000;
  // Surface clearly warmer than the frost point: the deposit sublimates/melts, the integral resets.
  return -d > VS_RIME.resetAboveK ? 0 : prevKh;
}

// --- Bourgouin ---------------------------------------------------------------------------------------

/**
 * Bourgouin (2000, Wea. Forecasting 15, 583–592) areas on a model profile (bottom-up `levels`, m above ground and °C):
 * PA = energy of the melting layer aloft (positive area), NA = energy of the refreezing layer beneath it (negative area),
 * both in J/kg with A ≈ (cp/R)·g·∫ (T'/T) dz (hydrostatic form of cp·∫ T' d ln p). `literature`, thresholds below as published.
 */
export const VS_BOURGOUIN = Object.freeze({ snowPaMax: 5.6, mixPaMax: 13.2, ipNaMin: (pa: number) => 66 + 0.66 * pa, frNaMax: (pa: number) => 46 + 0.66 * pa });
export type VsPrecipType = 'schnee' | 'schnee-regen' | 'regen' | 'eiskoerner' | 'gefrierender-regen' | 'gefrierender-regen-moeglich' | 'unbekannt';
export function bourgouinAreas(levels: ReadonlyArray<{ zM: number; tC: number }>): { pa: number; na: number; surfaceWarm: boolean } | null {
  if (!levels || levels.length < 2) return null;
  const k = (1005 / 287.05) * 9.81;
  // Walk from the top down; the first warm layer met above a cold surface layer is PA, the cold layer below it NA.
  let pa = 0, na = 0, seenWarmAloft = false;
  const surfaceWarm = levels[0].tC > 0;
  for (let i = levels.length - 2; i >= 0; i--) {
    const dz = levels[i + 1].zM - levels[i].zM;
    const t1 = levels[i + 1].tC, t0 = levels[i].tC;
    const tm = (t0 + t1) / 2;
    const a = k * (tm / (tm + 273.15)) * dz;
    if (tm > 0) { if (!seenWarmAloft || na === 0) { pa += a; seenWarmAloft = true; } }
    else if (seenWarmAloft) na += -a;
  }
  if (surfaceWarm) {
    // Warm surface layer: PA is the energy of that bottom warm layer (snow melts into rain), no NA.
    let p = 0;
    for (let i = 0; i < levels.length - 1 && (levels[i].tC + levels[i + 1].tC) / 2 > 0; i++) { const tm = (levels[i].tC + levels[i + 1].tC) / 2; p += k * (tm / (tm + 273.15)) * (levels[i + 1].zM - levels[i].zM); }
    return { pa: Math.round(p * 10) / 10, na: 0, surfaceWarm: true };
  }
  return { pa: Math.round(pa * 10) / 10, na: Math.round(na * 10) / 10, surfaceWarm: false };
}
/** Precipitation type after Bourgouin from the areas; `t2m`/`tw` (°C) decide between rain and freezing rain at the surface. */
export function bourgouinType(areas: { pa: number; na: number; surfaceWarm: boolean } | null, t2mC: number | null, twC: number | null = null): VsPrecipType {
  if (!areas) return 'unbekannt';
  const { pa, na, surfaceWarm } = areas;
  if (surfaceWarm) return pa <= VS_BOURGOUIN.snowPaMax ? 'schnee' : pa <= VS_BOURGOUIN.mixPaMax ? 'schnee-regen' : 'regen';
  if (pa <= VS_BOURGOUIN.snowPaMax) return 'schnee';
  const cold = (twC ?? t2mC ?? 1) <= 0;
  if (na >= VS_BOURGOUIN.ipNaMin(pa)) return 'eiskoerner';
  if (na <= VS_BOURGOUIN.frNaMax(pa)) return cold ? 'gefrierender-regen' : 'regen';
  return cold ? 'gefrierender-regen-moeglich' : 'regen';
}

// --- Classification ----------------------------------------------------------------------------------

export type VsCondition = 'glatteis' | 'schneeglaette' | 'schneematsch' | 'eis' | 'reifglaette' | 'nass' | 'feucht' | 'trocken';
export type VsGrip = 'griffig' | 'eingeschraenkt' | 'glatt' | 'sehr-glatt';
export const VS_CONDITION_LABEL: Readonly<Record<VsCondition, string>> = Object.freeze({
  glatteis: 'Glatteis', schneeglaette: 'Schneeglätte', schneematsch: 'Schneematsch', eis: 'Eis / überfrierende Nässe', reifglaette: 'Reifglätte',
  nass: 'nass', feucht: 'feucht', trocken: 'trocken',
});
export const VS_GRIP_LABEL: Readonly<Record<VsGrip, string>> = Object.freeze({ griffig: 'griffig', eingeschraenkt: 'eingeschränkt', glatt: 'glatt', 'sehr-glatt': 'sehr glatt' });
/** Scenario word of v1 (E-VS-3). */
export const VS_SCENARIO = 'ungestreut';
export const VS_SCENARIO_TEXT = 'Glättepotenzial ohne Streuung';

/** Thresholds of the class rules (`set`, to calibrate against GMA codes in winter). */
export const VS_CLASS_T = Object.freeze({
  /** Glatteis: liquid precipitation ≥ 0,1 mm/h on Ts ≤ 0 °C (Startprompt). */
  glatteisRateMmH: 0.1, glatteisTsMax: 0,
  /** Schneeglätte: snow store ≥ 0,2 mm w.e. at Ts ≤ +0,5 °C, or snowfall ≥ 0,1 mm/h at Ts ≤ 0 °C. */
  snowStoreMm: 0.2, snowTsMax: 0.5, snowRateMmH: 0.1,
  /** Schneematsch: snow present with a melting surface or liquid water beside it. */
  slushTsMin: 0.5, slushWaterMm: 0.03,
  /** Eis / überfrierende Nässe: ice store ≥ 0,05 mm, or a wet film at Ts ≤ 0 °C. */
  iceStoreMm: 0.05, iceWetTsMax: 0,
});

export interface VsClassInput {
  ts: number;
  stores: VsStores;
  /** Rates of the hour (mm/h). */
  rain: number; snow: number; frz: number;
  rimeKh: number;
  precipType?: VsPrecipType;
}

export interface VsClassResult { condition: VsCondition; grip: VsGrip; rule: number; filmMm: number }

/** First rule wins (Startprompt order). */
export function classifyRoad(x: VsClassInput): VsClassResult {
  const s = x.stores;
  const film = filmFromStore(s.water);
  const liquid = x.rain + x.frz;
  const out = (condition: VsCondition, rule: number): VsClassResult => ({ condition, grip: gripOf(condition, film), rule, filmMm: film });
  if ((liquid >= VS_CLASS_T.glatteisRateMmH && x.ts <= VS_CLASS_T.glatteisTsMax) || (x.precipType === 'gefrierender-regen' && x.ts <= 0)) return out('glatteis', 1);
  if ((s.snow >= VS_CLASS_T.snowStoreMm && x.ts <= VS_CLASS_T.snowTsMax) || (x.snow >= VS_CLASS_T.snowRateMmH && x.ts <= 0)) return out('schneeglaette', 2);
  if (s.snow > 0 && (x.ts > VS_CLASS_T.slushTsMin || s.water >= VS_CLASS_T.slushWaterMm)) return out('schneematsch', 3);
  if (s.ice >= VS_CLASS_T.iceStoreMm || (film > VS_FILM.wetMm && x.ts <= VS_CLASS_T.iceWetTsMax)) return out('eis', 4);
  if (s.frost >= VS_RIME.minStoreMm && x.rimeKh >= VS_RIME.triggerKh && x.ts <= 0) return out('reifglaette', 5);
  if (film > VS_FILM.wetMm) return out('nass', 6);
  if (film > VS_FILM.dampMm) return out('feucht', 6);
  return out('trocken', 6);
}

/** Grip as a class (`set`): dry/damp griffig; wet and slush eingeschränkt; snow and rime glatt; ice and glaze sehr glatt. */
export function gripOf(c: VsCondition, filmMm = 0): VsGrip {
  switch (c) {
    case 'glatteis': case 'eis': return 'sehr-glatt';
    case 'schneeglaette': case 'reifglaette': return 'glatt';
    case 'schneematsch': case 'nass': return 'eingeschraenkt';
    case 'feucht': return filmMm > 0.02 ? 'eingeschraenkt' : 'griffig';
    default: return 'griffig';
  }
}

/**
 * Probability-like word for slipperiness (`glaette_p`): the share of the class rules 1–5 that are met with a margin — v1 a coarse
 * three-step scale 0 / 0,5 / 1 (`set`), replaced by a calibrated probability in 6.2.8 once winter pairs exist (Startprompt:
 * „Ausgabe als Wahrscheinlichkeit/„möglich"", DWD-Vergleichsprodukt POD 0,40–0,56).
 */
export function slipperinessP(r: VsClassResult, x: VsClassInput): number {
  if (r.rule <= 5) return r.condition === 'glatteis' && x.precipType === 'gefrierender-regen-moeglich' ? 0.5 : 1;
  if (x.ts <= 0.5 && (r.filmMm > VS_FILM.dampMm || x.rimeKh >= VS_RIME.triggerKh / 2 || x.precipType === 'gefrierender-regen-moeglich')) return 0.5;
  return 0;
}
