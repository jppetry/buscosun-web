/**
 * rowFeatures.mjs — the glue between a case row (`casesio.mjs`), the feature table (`features.mjs`) and the pure
 * TS of the learning stage (`src/point/fusionFit/*`): site features per point, the situation of a row, its targets,
 * the form-K and form-P predictors per variable, σ_div/σ_ens, the per-variable source class of form P.
 * Used by the fit (`fit.mjs`) and by the scorer (`score.mjs`) — one definition of what a row means.
 *
 * Hot path: `prepareBatch(cols)` resolves the column arrays once per batch (no per-row string keys), the month of a
 * row is cached per day, and `rowContext(..., light)` skips Z and the per-source predictors when the caller only
 * needs targets and the cube member (anchor, ρ_f).
 */
import { buildZ, dTsfcProxy, sourceToPoint, windComponents, Z_DIM } from '../../../src/point/fusionFit/features.ts';
import { binIndex, binRange, FL_SOURCES, classKey } from '../../../src/point/fusionFit/strata.ts';
import { WET_MM_H } from '../../../src/point/fusionFit/design.ts';

const H = 3_600_000;
const TIER_ID = ['', 't1', 't2', 't3'];
export const FIT_VARS = ['t', 'td', 'u', 'v', 'gust', 'clct', 'precip'];
/** Per fit variable: the source variable, the cube member column, the σ_div plane column, the σ_ens plane column. */
const VAR_MAP = {
  t: { src: 't2m', k: 'm_t', sd: 'c_t2m_sd', ens: 'c_t2m_sd_ens' },
  td: { src: 'td2m', k: 'm_td', sd: 'c_td2m_sd', ens: null },
  u: { src: 'u10', k: 'm_u', sd: 'c_u10_sd', ens: 'c_u10_sd_ens' },
  v: { src: 'v10', k: 'm_v', sd: 'c_v10_sd', ens: 'c_v10_sd_ens' },
  gust: { src: 'gust', k: 'm_gust', sd: 'c_gust_sd', ens: null },
  clct: { src: 'clct', k: 'm_clct', sd: 'c_clct_sd', ens: null },
  precip: { src: 'precip', k: 'm_precip', sd: 'c_precip_sd', ens: 'c_precip_sd_ens' },
};
const fin = Number.isFinite;

/** Site features of one point from the feature table row (static across rows). */
export function siteOf(fr) {
  const t = fr.terrain ?? {}, lc = fr.landCover ?? null, urb = fr.urban?.byColumn ?? null;
  return {
    id: fr.id, country: fr.country, band: fr.band2, tile: fr.tile,
    site: {
      hTrueM: fr.elevM, tpi500M: t.tpi500M ?? null, tpi2000M: t.tpi2000M ?? null, svf: t.svf ?? null, sinkDepthM: t.sinkDepthM ?? null,
      slopeDeg: t.slopeDeg ?? null, aspectDeg: t.aspectDeg ?? null, z0True: lc?.z0True ?? null,
      lcShares: lc?.landCover?.point?.p ?? null,
      dWaterM: lc?.landCover?.dWater?.m ?? null, dLakeM: fr.dLake?.m ?? null,
      impervPct: urb?.imperv ?? null, d0M: urb?.d0 ?? null, lonDeg: fr.lon,
    },
    z0Mod: { t1: lc?.z0Mod?.t1 ?? null, t2: lc?.z0Mod?.t2 ?? null, t3: lc?.z0Mod?.t3 ?? null },
    hmodel: { t1: fr.hmodel?.t1?.bySource ?? {}, t2: fr.hmodel?.t2?.bySource ?? {}, t3: fr.hmodel?.t3?.bySource ?? {} },
  };
}

/** The columns the fit and scorer read (a subset of CASE_COLUMNS). */
export const ROW_COLUMNS = Object.freeze([
  'slotAtH', 'validAtH', 'leadH', 'pointIdx', 'tier', 'route', 'srcMask', 'srcCount', 'network', 'truthFlags', 'flags',
  'obs_t', 'obs_td', 'obs_ff', 'obs_dd', 'obs_fx', 'obs_rr', 'obs_n',
  'c_t2m', 'c_t850', 'c_hModEff', 'c_t2m_sd', 'c_td2m_sd', 'c_u10_sd', 'c_v10_sd', 'c_gust_sd', 'c_clct_sd', 'c_precip_sd', 'c_t2m_sd_ens', 'c_u10_sd_ens', 'c_v10_sd_ens', 'c_precip_sd_ens',
  'm_t', 'm_td', 'm_u', 'm_v', 'm_gust', 'm_precip', 'm_clct', 'm_hModEff', 'v_dh', 't_foehn', 't_fRad',
  'f_t_mu', 'f_t_sig', 'f_td_mu', 'f_td_sig', 'f_ws_nu', 'f_ws_sig', 'f_gust_mu', 'f_gust_sig', 'f_cl_mu', 'f_cl_sig', 'f_pr_pDry', 'f_pr_mu', 'f_pr_sig',
  ...[0, 1, 2, 3, 4, 5, 6].flatMap((k) => ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct'].map((v) => `s${k}_${v}`)),
]);

const monthCache = new Map();
const monthOfHour = (h) => { const d = Math.floor(h / 24); let m = monthCache.get(d); if (!m) { m = new Date(d * 86_400_000).toISOString().slice(0, 7); monthCache.set(d, m); } return m; };

/** Resolve the column arrays of a batch once. */
export function prepareBatch(cols) {
  const src = FIT_VARS.map((v) => [0, 1, 2, 3, 4, 5, 6].map((kk) => cols[`s${kk}_${VAR_MAP[v].src}`]));
  const k = FIT_VARS.map((v) => cols[VAR_MAP[v].k]);
  const sd = FIT_VARS.map((v) => cols[VAR_MAP[v].sd]);
  const ens = FIT_VARS.map((v) => (VAR_MAP[v].ens ? cols[VAR_MAP[v].ens] : null));
  return { cols, src, k, sd, ens };
}

/**
 * The context of row `i` of a prepared batch. `sites` = siteOf per pointIdx (header order). `light` = targets, the
 * cube member and the keys only (no Z, no per-source predictors). Null when the row has no usable truth at all.
 */
export function rowContext(b, i, sites, light = false) {
  const cols = b.cols;
  const st = sites[cols.pointIdx[i]];
  if (!st) return null;
  const tier = TIER_ID[cols.tier[i]];
  const validAtH = cols.validAtH[i], validAtMs = validAtH * H;
  const leadH = cols.leadH[i], bin = binIndex(leadH);
  const route = cols.route[i], srcMask = cols.srcMask[i] | 0, srcCount = fin(cols.srcCount[i]) ? cols.srcCount[i] : null;
  // targets
  const y = {};
  let any = false;
  if (fin(cols.obs_t[i])) { y.t = cols.obs_t[i]; any = true; }
  if (fin(cols.obs_td[i])) { y.td = cols.obs_td[i]; any = true; }
  if (fin(cols.obs_ff[i]) && fin(cols.obs_dd[i])) { const w = windComponents(cols.obs_ff[i], cols.obs_dd[i]); y.u = w.u; y.v = w.v; y.ff = cols.obs_ff[i]; any = true; }
  if (fin(cols.obs_fx[i])) { y.gust = cols.obs_fx[i]; any = true; }
  if (fin(cols.obs_n[i])) { y.clct = cols.obs_n[i]; any = true; }
  if (fin(cols.obs_rr[i])) { y.rr = Math.max(0, cols.obs_rr[i]); y.precip = Math.log1p(y.rr); y.wet = y.rr >= WET_MM_H ? 1 : 0; any = true; }
  if (!any) return null;
  // form K predictors and spreads
  const k = {}, sigDiv = {}, sigEns = {};
  for (let vi = 0; vi < FIT_VARS.length; vi++) {
    const v = FIT_VARS[vi], val = b.k[vi][i];
    k[v] = fin(val) ? (v === 'precip' ? Math.log1p(Math.max(0, val)) : val) : null;
    const s = b.sd[vi][i]; sigDiv[v] = fin(s) ? s : null;
    const e = b.ens[vi] ? b.ens[vi][i] : NaN; sigEns[v] = fin(e) ? e : null;
  }
  const hTrue = st.site.hTrueM;
  const hModEff = fin(cols.m_hModEff[i]) ? cols.m_hModEff[i] : fin(cols.c_hModEff[i]) ? cols.c_hModEff[i] : null;
  const dhM = fin(cols.v_dh[i]) ? cols.v_dh[i] : hModEff != null ? hTrue - hModEff : 0;
  const dTsfcK = dTsfcProxy(fin(cols.c_t2m[i]) ? cols.c_t2m[i] : null, fin(cols.c_t850[i]) ? cols.c_t850[i] : null, fin(cols.c_hModEff[i]) ? cols.c_hModEff[i] : null);
  const ctx = {
    pointIdx: cols.pointIdx[i], site: st, tier, validAtMs, slotAtH: cols.slotAtH[i], dayIdx: Math.floor(cols.slotAtH[i] / 24), leadH, bin, route, srcMask, srcCount,
    month: monthOfHour(validAtH), y, k, sigDiv, sigEns, dhM, dTsfcK, clsK: classKey('K', srcMask, route),
    z: null, p: null, pMask: null, pBase: null, wetShareK: 0, wetShareP: 0, clsP: null, fused: null,
  };
  if (light) return ctx;
  const [binFromH, binToH] = binRange(bin);
  ctx.z = buildZ(st.site, { dhM, z0ModTier: st.z0Mod[tier], foehnFactor: fin(cols.t_foehn[i]) ? cols.t_foehn[i] : null, fRad: fin(cols.t_fRad[i]) ? cols.t_fRad[i] : null, dTsfcK, validAtMs, leadH, binFromH, binToH });
  const kPrecipRaw = fin(cols.m_precip[i]) ? Math.max(0, cols.m_precip[i]) : null;
  ctx.wetShareK = kPrecipRaw != null && sigDiv.precip != null ? Math.min(3, sigDiv.precip / (kPrecipRaw + 0.1)) : 0;
  // form P predictors per variable: the sources of the class that carry the variable, height-corrected
  const p = {}, pMask = {}, pBase = {};
  let wetSrc = 0, wetN = 0;
  const hm = st.hmodel[tier];
  for (let vi = 0; vi < FIT_VARS.length; vi++) {
    const v = FIT_VARS[vi], srcV = VAR_MAP[v].src, arrCols = b.src[vi];
    const arr = []; let mask = 0, sum = 0;
    for (let kk = 0; kk < 7; kk++) {
      if (!(srcMask & (1 << kk))) continue;
      const raw = arrCols[kk][i];
      if (!fin(raw)) continue;
      const sid = FL_SOURCES[kk];
      const h = hm?.[sid];
      const hModSrc = fin(h) ? h : hModEff ?? hTrue;
      const yA = v === 'precip' ? Math.log1p(Math.max(0, raw)) : sourceToPoint(srcV, raw, hModSrc, hTrue);
      arr.push({ yA, dhM: hTrue - hModSrc, sid, raw });
      mask |= 1 << kk; sum += yA;
      if (v === 'precip') { wetN += 1; if (raw >= WET_MM_H) wetSrc += 1; }
    }
    p[v] = arr.length ? arr : null; pMask[v] = mask; pBase[v] = arr.length ? sum / arr.length : null;
  }
  ctx.p = p; ctx.pMask = pMask; ctx.pBase = pBase; ctx.wetShareP = wetN ? wetSrc / wetN : 0;
  ctx.clsP = (v) => classKey('P', pMask[v], route);
  ctx.fused = { t: [cols.f_t_mu[i], cols.f_t_sig[i]], td: [cols.f_td_mu[i], cols.f_td_sig[i]], ws: [cols.f_ws_nu[i], cols.f_ws_sig[i]], gust: [cols.f_gust_mu[i], cols.f_gust_sig[i]], clct: [cols.f_cl_mu[i], cols.f_cl_sig[i]], pr: [cols.f_pr_pDry[i], cols.f_pr_mu[i], cols.f_pr_sig[i]] };
  // fusionFit@3 (V-FL-18): the engine's own dry probability at the cube member — the hurdle's cube column
  ctx.pDryCube = fin(cols.f_pr_pDry[i]) ? cols.f_pr_pDry[i] : null;
  return ctx;
}

/** Top-N tiles by point count (the regions of the spatial folds). */
export function topTiles(sites, n = 12) {
  const c = new Map();
  for (const s of sites) if (s) c.set(s.tile, (c.get(s.tile) ?? 0) + 1);
  return new Set([...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k]) => k));
}
export const Z_LEN = Z_DIM;
