/**
 * probe-eps-grid.mjs — does the producer's DWD-EPS adapter read a run on ANOTHER icosahedral grid?
 *
 * Why: on 2026-10-06 DWD changes ICON-EPS (26 → 20 km, grid #39) and ICON-EU-EPS (13 → 10 km, grid #63, larger
 * domain). DWD publishes a test run (00 UTC of 2026-07-15) on the new grids under /test/weather/nwp/. This probe
 * runs the UNCHANGED adapter against it and against production, and reports what the adapter itself decides:
 * cell count, neighbour distance from the tier cell to the model cell, members, spread statistics, bytes, time.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/point/probe-eps-grid.mjs \
 *        [--base=test|prod] [--model=icon_eu_eps|icon_eps_global] [--run=2026071500] [--lead=<h>] [--var=t2m|precip]
 *
 * Read-only (GET), writes nothing. No production purge, no dispatch.
 */
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const base = arg('base', 'test');
if (base === 'test') process.env.DWD_OPENDATA = 'https://opendata.dwd.de/test/weather/nwp';

const { makeDwdEpsAdapter } = await import('./adapters/dwdEps.mjs');
const { fetchGribField, netStats, poolClose } = await import('./adapters/shared.mjs');
const { buildUnstructuredIndex } = await import('./adapters/sample.mjs');
const { TIERS } = await import('../../src/point/cubeFormat.ts');

const modelId = arg('model', 'icon_eu_eps');
const tier = TIERS.find((t) => t.id === (modelId === 'icon_eps_global' ? 't3' : modelId === 'icon_eu_eps' ? 't2' : 't1'));
const ad = makeDwdEpsAdapter(modelId);
const DWD = process.env.DWD_OPENDATA || 'https://opendata.dwd.de/weather/nwp';
const dir = { icon_eu_eps: 'icon-eu-eps', icon_eps_global: 'icon-eps', icon_d2_eps: 'icon-d2-eps' }[modelId];
const dom = { icon_eu_eps: 'europe', icon_eps_global: 'global', icon_d2_eps: 'germany' }[modelId];

// the adapter's own raster (ownSteps): tier hours that are a multiple of the coarser of the two steps
const lead = Number(arg('lead', String(tier.leadHours.find((h) => h % Math.max(tier.stepH, ad.stepH) === 0))));
let run = arg('run', base === 'test' ? '2026071500' : '');
if (!run) run = await ad.discoverRun(lead);
if (!run) { console.log(JSON.stringify({ ok: false, why: 'no run found', model: modelId, lead })); process.exit(1); }
const varId = arg('var', 't2m');

const km = (la1, lo1, la2, lo2) => {
  const r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};
const q = (arr, p) => { const s = Float64Array.from(arr).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

const t0 = Date.now();
const cu = (p) => `${DWD}/${dir}/grib/${run.slice(8, 10)}/${p}/${dir}_${dom}_icosahedral_time-invariant_${run}_${p}.grib2.bz2`;
const [la, lo] = await Promise.all([fetchGribField(cu('clat')), fetchGribField(cu('clon'))]);
if (!la || !lo) { console.log(JSON.stringify({ ok: false, why: 'clat/clon not found', url: cu('clat') })); process.exit(1); }
const idx = buildUnstructuredIndex(la.values, lo.values, tier);
// distance tier cell centre → chosen model cell (the index is the adapter's own; its layout is read generically)
const dist = [];
let unmapped = 0;
if (idx) {
  // the sampler's own target coordinate (sample.mjs): lat0 + iy·deg, lon0 + ix·deg
  for (let iy = 0; iy < tier.ny; iy++) for (let ix = 0; ix < tier.nx; ix++) {
    const c = idx[iy * tier.nx + ix];
    if (c < 0) { unmapped++; continue; }
    const lon = lo.values[c] > 180 ? lo.values[c] - 360 : lo.values[c];
    dist.push(km(tier.lat0 + iy * tier.deg, tier.lon0 + ix * tier.deg, la.values[c], lon));
  }
}
const tIdx = Date.now() - t0;

const t1 = Date.now();
let ens = null, err = null;
try { ens = await ad.ensemble(run, lead, varId, tier, { dt: tier.stepH }); } catch (e) { err = String(e.message ?? e); }
const tEns = Date.now() - t1;
let sdStats = null;
if (ens?.sd) {
  const v = []; let nan = 0;
  for (const x of ens.sd) { if (Number.isFinite(x)) v.push(x); else nan++; }
  sdStats = { n: v.length, nan, p10: q(v, 0.1), p50: q(v, 0.5), p90: q(v, 0.9), max: q(v, 0.9999) };
}
console.log(JSON.stringify({
  ok: !err && !!ens, base, model: modelId, run, tier: tier.id, lead, var: varId,
  grid: { cells: la.values.length, numberOfGridUsed: la.header?.numberOfGridUsed ?? null },
  neighbourKm: { n: dist.length, unmapped, p50: q(dist, 0.5), p90: q(dist, 0.9), max: q(dist, 1) },
  members: ens ? { n: ens.n, messagesTotal: ens.messagesTotal, clamped: ens.clamped } : null,
  sd: sdStats, q10q90: ens ? { hasQ10: !!ens.q10, hasQ90: !!ens.q90 } : null,
  ms: { index: tIdx, ensemble: tEns }, net: netStats(), err,
}, null, 1));
await poolClose();
