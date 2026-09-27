/**
 * climaCandidates.mjs — the named μ_c estimator candidates of phase FX-4 (`audit/fusion-forschung.md` §6.4), ONE table for the
 * leave-station-out diagnosis (`audit/fusion-forschung/diag-fx4.mjs`) and the product builder (`clima-product.mjs`): a candidate
 * is an estimator spec of `climaProduct.ts` plus the trend-feature set (`TREND_SETS`) it is fitted on.
 *
 *   idw<k>   k nearest stations, IDW 1/(d² + 1 km²); T/Td with the climatology's own per-coefficient height slope (idw3n: none,
 *            idw3h: every variable)
 *   ridge    ridge trend on the full feature set (land cover/urban included); ridgeT terrain only; ridgeG height/position only
 *   krig<k>  the trend plus the IDW mean of the k nearest stations' residuals against it
 *   ridgeTx / ridgex — the stage-2 candidates: the trend for every variable except cloud cover, which takes idw3 (the trend
 *            extrapolates at the 16 DE mountain stations with a cloud series — V-FX-31)
 */
export const CLIMA_CANDIDATES = Object.freeze({
  idw1: { kind: 'idw', k: 1, power: 2, heightSlope: 'tTd' },
  idw2: { kind: 'idw', k: 2, power: 2, heightSlope: 'tTd' },
  idw3: { kind: 'idw', k: 3, power: 2, heightSlope: 'tTd' },
  idw3n: { kind: 'idw', k: 3, power: 2, heightSlope: 'none' },
  idw3h: { kind: 'idw', k: 3, power: 2, heightSlope: 'all' },
  ridge: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none' },
  krig3: { kind: 'kriging', k: 3, power: 2, heightSlope: 'none' },
  ridgeT: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none', set: 'terrain' },
  krigT3: { kind: 'kriging', k: 3, power: 2, heightSlope: 'none', set: 'terrain' },
  ridgeG: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none', set: 'geo' },
  krigG3: { kind: 'kriging', k: 3, power: 2, heightSlope: 'none', set: 'geo' },
  ridgeTx: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none', set: 'terrain', byVar: { clct: { kind: 'idw', k: 3, power: 2, heightSlope: 'none' } } },
  ridgex: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none', byVar: { clct: { kind: 'idw', k: 3, power: 2, heightSlope: 'none' } } },
});

/** The estimator spec of a candidate (without the feature-set name, which lives in `trend.names`). */
export const specOf = (c) => ({ kind: c.kind, k: c.k, power: c.power, heightSlope: c.heightSlope, ...(c.byVar ? { byVar: c.byVar } : {}) });
/** The trend-feature set of a candidate (null for a pure idw candidate). */
export const setOf = (c) => (c.kind === 'idw' && !c.byVar ? null : c.set ?? 'full');
/** Whether any part of the candidate needs the station list at run time (idw, kriging, or an idw override). */
export const needsStations = (c) => c.kind !== 'ridge' || Object.values(c.byVar ?? {}).some((x) => x.kind !== 'ridge');
/** The variables whose station coefficients the product must carry (all for idw/kriging, only the idw-override variables for ridge). */
export const stationVarsOf = (c, vars) => (c.kind !== 'ridge' ? vars : vars.filter((v) => c.byVar?.[v] && c.byVar[v].kind !== 'ridge'));
/** Whether any part needs the per-coefficient height slope. */
export const needsLapse = (c) => c.heightSlope !== 'none' || Object.values(c.byVar ?? {}).some((x) => x.heightSlope !== 'none');
