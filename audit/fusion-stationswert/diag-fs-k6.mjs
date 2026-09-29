/**
 * diag-fs-k6.mjs — phase FS, control K6: where does the engine's station value differ from the offline candidate?
 * One slot, every 6th point: the engine's M, I, L (`step.post.stationValue`) against the offline M (mosAt), I (innovation of
 * MOSMIX at the latest measurement) and L (predict on the cube-hc step, the client's form without a band) — per variable the
 * distribution of the three differences.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HINDCAST_ROOT } from '../../scripts/hindcast/lib/common.mjs';
import { readArchiveSlot, archiveSeries, archiveStation, archiveNowcast, archiveTruth, archiveObs, losoClimaProduct, inputFromArchive } from '../../scripts/fusionfit/lib/archiveAdapter.mjs';
import { siteOf } from '../../scripts/fusionfit/lib/rowFeatures.mjs';
import { fuseCubePoint } from '../../src/pointForecast/cubeSource.ts';
import { ClimaField } from '../../src/ml/climaField.ts';
import { predict } from '../../src/point/fusionFit/predict.ts';
import { climaDesign, C_DIM } from '../../src/point/fusionFit/fitClima.ts';
import { binIndex, binRange } from '../../src/point/fusionFit/strata.ts';
import { buildZ, dTsfcProxy, sourceToPoint } from '../../src/point/fusionFit/features.ts';
import { meanOf, quantileOf } from '../../src/pointForecast/fusion/dist.ts';

const H = 3_600_000, ARCH = 'C:/dev/buscosun-archiv', day = '2026-09-23';
const T5 = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'fit', '2026-09-27-fx5e', 'fusion.hindcast.json'), 'utf8'));
const stack = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'fit', '2026-09-28-fs', 'stack.archive.json'), 'utf8'));
const feat = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'features', 'points.v1.json'), 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('../../public/climaGrid.json', import.meta.url), 'utf8')));
const ids = Object.keys(feat.byPoint).filter((id) => ['DE', 'AT', 'CH', 'LI'].includes(feat.byPoint[id].country) && !feat.byPoint[id].flags.includes('noTerrain')).sort();
const s = readArchiveSlot(join(ARCH, day, readdirSync(join(ARCH, day)).find((x) => /^\d{4}\.json\.gz$/.test(x))));
const floorMs = Math.floor(s.slotAtMs / H) * H;
const truth = archiveTruth(s, (id) => feat.byPoint[id]?.country);
const fin = (x) => (x != null && Number.isFinite(x) ? x : null);
const pointOf = (d) => (!d ? null : d.kind === 'normal' ? d.mu : d.kind === 'rice' || d.kind === 'truncatedNormal' ? meanOf(d) : quantileOf(d, 0.5));
const cx = new Float64Array(C_DIM);
const diffs = {};
const add = (k, d) => { if (d == null || !Number.isFinite(d)) return; (diffs[k] ?? (diffs[k] = [])).push(Math.abs(d)); };
const zDiff = { n: 0, max: 0, byIndex: {} };
for (let i = 0; i < ids.length; i += 6) {
  const id = ids[i], row = feat.byPoint[id], site = siteOf(row), hTrue = row.elevM;
  const cube = {};
  for (const t of ['t1', 't2', 't3']) { const x = archiveSeries(s, t, id); if (x) cube[t] = x; }
  if (!Object.keys(cube).length) continue;
  const stn = archiveStation(s, id, hTrue), nc = archiveNowcast(s, id), tr = truth.get(id);
  let rec = null; for (const r of tr?.rows ?? []) if (r.ms <= s.slotAtMs && r.t != null && (!rec || r.ms > rec.ms)) rec = r;
  const obs = (archiveObs(s, tr, row) ?? []).map((o) => ({ ...o, dewPoint: rec?.td ?? null, gust: rec?.fxh ?? null }));
  const base = { cube, station: stn.series, stationReason: stn.reason, nowcast: nc.nowcast, covering: nc.covering, obs, clima, nowMs: s.slotAtMs, window: { fromMs: floorMs, toMs: floorMs + 336 * H, stepH: 1 }, learned: T5, learnedClima: losoClimaProduct(T5, row), stack };
  const on = fuseCubePoint(inputFromArchive(s, row, base), { hourly: false, tail: false, learned: true, learnedSpeed: true, learnedPrecip: true, learnedAtPoint: true, priorShrink: false, learnedClouds: true, stationValue: true });
  const hc = fuseCubePoint(inputFromArchive(s, row, { ...base, station: null, nowcast: [], covering: [], obs: null, learned: null, learnedClima: null, stack: null }), { hourly: false, tail: false });
  const hcBy = new Map(hc.steps.map((x) => [x.validAtMs, x]));
  const m0 = rec && stn.series ? stn.series.steps.find((x) => x.validAtMs === rec.ms)?.values : null;
  const se = stn.series?.station.elev;
  const I0 = m0 ? { t: rec.t != null && m0.t2m != null ? rec.t - sourceToPoint('t2m', m0.t2m, se, hTrue) : null, td: rec.td != null && m0.td2m != null ? rec.td - sourceToPoint('td2m', m0.td2m, se, hTrue) : null, ws: rec.ff != null && m0.u10 != null ? rec.ff - Math.hypot(m0.u10, m0.v10) : null, gust: rec.fxh != null && m0.gust != null ? rec.fxh - m0.gust : null } : {};
  for (const st of on.steps) {
    const p = st.post?.stationValue; const h = hcBy.get(st.validAtMs);
    if (!p || !h || st.interpolated) continue;
    const leadH = Math.round((st.validAtMs - floorMs) / H);
    const m = h.samples?.find((x) => String(x.source).startsWith('cube-')); const c = h.cell ?? {};
    const k = { t: fin(m.temperature), td: fin(m.dewPoint), u: fin(m.u), v: fin(m.v), gust: fin(m.gust), clct: fin(m.cloudTotal), precip: fin(m.precipitation) != null ? Math.log1p(Math.max(0, m.precipitation)) : null };
    const hModEff = fin(m.sourceElevation) ?? fin(c.hModEff);
    const dhM = fin(h.vertical?.dhM) ?? (hModEff != null ? hTrue - hModEff : 0);
    const bin = binIndex(leadH), [bf, bt] = binRange(bin);
    const z = buildZ(site.site, { dhM, z0ModTier: site.z0Mod[h.tier], foehnFactor: fin(h.terrain?.foehnFactor), fRad: fin(h.terrain?.fRad), dTsfcK: dTsfcProxy(fin(c.t2m), fin(c.t850), fin(c.hModEff)), validAtMs: st.validAtMs, leadH, binFromH: bf, binToH: bt });
    climaDesign(st.validAtMs, site.site.lonDeg, cx);
    const muC = {}; for (const v of ['t', 'td', 'gust']) { const est = T5.climaMu?.byPoint?.[site.id]?.[v]; if (est) { let a = 0; for (let j = 0; j < C_DIM; j++) a += est[j] * cx[j]; muC[v] = a; } }
    const pr = predict(T5, 'K', { z, leadH, route: 1, srcMask: 0, srcCount: fin(c.srcCount), dhM, dTsfcK: dTsfcProxy(fin(c.t2m), fin(c.t850), fin(c.hModEff)), k, p: {}, sigDiv: { t: fin(c.t2m_sd), td: fin(c.td2m_sd), u: fin(c.u10_sd), v: fin(c.v10_sd), gust: fin(c.gust_sd), clct: fin(c.clct_sd), precip: fin(c.precip_sd) }, sigEns: { t: fin(c.t2m_sd_ens), td: null, u: fin(c.u10_sd_ens), v: fin(c.v10_sd_ens), gust: null, clct: null, precip: fin(c.precip_sd_ens) }, wetShare: 0, pDryCube: null, muC });
    const Loff = { t: pointOf(pr.dist.temperature), td: pointOf(pr.dist.dewPoint), ws: pointOf(pr.dist.windSpeed), gust: pointOf(pr.dist.gust) };
    const sv = stn.series.steps.find((x) => x.validAtMs === st.validAtMs)?.values;
    const Moff = sv ? { t: sv.t2m != null ? sourceToPoint('t2m', sv.t2m, se, hTrue) : null, td: sv.td2m != null ? sourceToPoint('td2m', sv.td2m, se, hTrue) : null, ws: sv.u10 != null ? Math.hypot(sv.u10, sv.v10) : null, gust: sv.gust ?? null } : {};
    for (const v of ['t', 'td', 'ws', 'gust']) {
      if (!p[v]) continue;
      add(`${v} M`, Moff[v] != null ? p[v].M - Moff[v] : null);
      if (p[v].I != null && I0[v] != null) add(`${v} I`, p[v].I - I0[v]);
      if (p[v].L != null && Loff[v] != null) add(`${v} L`, p[v].L - Loff[v]);
    }
    // the features of the two situations: the chain's z against the feature table's
    const sitOn = st.samples ? null : null;
    void sitOn;
  }
}
const q = (a, p) => { const b = Float64Array.from(a).sort(); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]; };
const md = [`# diag-fs-k6 — Slot ${s.slotAt}: Stationswert des Motors gegen die Offline-Form, |Δ| je Eingang`, '', '| Eingang | n | p50 | p90 | p99 | max | Anteil > 0,001 |', '|---|---|---|---|---|---|---|'];
for (const k of Object.keys(diffs).sort()) { const a = diffs[k]; md.push(`| ${k} | ${a.length} | ${q(a, 0.5).toExponential(1)} | ${q(a, 0.9).toExponential(1)} | ${q(a, 0.99).toExponential(1)} | ${Math.max(...a).toExponential(1)} | ${(100 * a.filter((x) => x > 1e-3).length / a.length).toFixed(1)} % |`); }
writeFileSync(new URL('./diag-fs-k6.md', import.meta.url), md.join('\n'));
console.log(md.join('\n'));
