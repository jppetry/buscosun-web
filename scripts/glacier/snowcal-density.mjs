#!/usr/bin/env node
/**
 * Phase GM, GM-3, parts B and D — new-snow density of the snow core against MEASURED new snow on the board, and the gauge undercatch at the same sites.
 * Method frozen in audit/gletscher-schneemodell/gm3-method-frozen.md §B, §D.
 *
 *   node scripts/glacier/snowcal-density.mjs --cache=<dir with slf/, smn/> --out=<report.json> [--at=1]
 *
 * Truth: SLF study plots (https://measurement-data.slf.ch/study-plot, CC BY 4.0): `HN_1D` (cm) and `HNW_1D` (mm) at 06 UTC, both from the same board.
 * Weather of the 24 hours before: the SwissMetNet station within 3 km and 200 m (MeteoSwiss OGD, CC BY 4.0). The model is the snow core itself
 * (`stepPack` of lib/snowcore.mjs) on an empty board; only the new-snow density differs between the rules D0 … D3.
 * `--at=1` adds the transfer to Austria (GeoSphere `klima-v2-1d`, gauge precipitation, low-wind days; no fitting).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { smnStations, smnHourly, klimaStations, hav, GEOSPHERE } from './snowcal-forcing.mjs';
import { SNOW, emptyPack, stepPack, packDepthCm, newSnowDensity } from './lib/snowcore.mjs';

export const DEN = Object.freeze({
  pairKm: 3, pairDh: 200, gamma: -0.0065,
  hnMin: 3, hnwMin: 2, tHours: 20, tMax: 1, rhoMin: 20, rhoMax: 400,
  years: [2012, 2025],
  d2: { lo: 40, hi: 140, step: 1 },
  d3: { a: [40, 160, 2], b: [0, 8, 0.25], clip: [40, 200] },
  gain: 0.05,
  classes: [[3, 10], [10, 25], [25, 1e9]],
  wind: [[0, 2], [2, 4], [4, 1e9]],
  at: { minAlt: 1000, hn: 3, rr: 2, t: -1, wind: 2, years: [2016, 2025] },
});
const H = 3_600_000;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const hyearOf = (ms) => { const d = new Date(ms); return d.getUTCMonth() >= 9 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(); };
const inSeason = (ms) => { const m = new Date(ms).getUTCMonth(); return m >= 10 || m <= 3; };

/** Settled thickness (cm) after 24 hourly steps on an empty board: `mm` spread evenly, hourly temperature `t`, density of each hour from `rhoAt(h)`. */
export function boardDepth(mm, t, rhoAt) {
  const p = emptyPack();
  for (let h = 0; h < 24; h++) stepPack(p, { tMs: h * H, solidMm: mm / 24, rhoNew: rhoAt(h), meltMm: 0, tC: t[h], dtS: 3600 });
  return packDepthCm(p);
}
export const d3Rho = (a, b, tC) => Math.min(DEN.d3.clip[1], Math.max(DEN.d3.clip[0], a + b * tC));

export async function loadEvents(cache, fromMs, toMs) {
  const smn = await smnStations(cache);
  const rows = readFileSync(join(cache, 'slf', 'stations.csv'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
  const h = Object.fromEntries(rows[0].map((c, i) => [c, i]));
  const pairs = new Map();
  for (const r of rows.slice(1)) {
    const p = { code: r[h.station_code], label: r[h.label], lon: +r[h.lon], lat: +r[h.lat], z: +r[h.elevation] };
    const c = smn.map((s) => ({ s, km: hav(p.lon, p.lat, s.lon, s.lat) })).filter((x) => x.km <= DEN.pairKm && Math.abs(x.s.height - p.z) <= DEN.pairDh).sort((a, b) => a.km - b.km)[0];
    if (c) pairs.set(p.code, { ...p, smn: c.s.id, smnHeight: c.s.height, km: Math.round(c.km * 10) / 10 });
  }
  const met = new Map();
  for (const p of pairs.values()) if (!met.has(p.smn)) met.set(p.smn, await smnHourly(cache, p.smn, { t: 'tre200h0', u: 'fkl010h0', rr: 'rre150h0' }, fromMs, toMs));
  const events = [], counts = { days: 0, noWater: 0, small: 0, fewT: 0, warm: 0, badDensity: 0 };
  const text = readFileSync(join(cache, 'slf', 'all-stations.csv'), 'utf8');
  let pos = text.indexOf('\n') + 1;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos); if (end < 0) end = text.length;
    const line = text.slice(pos, end); pos = end + 1;
    const c1 = line.indexOf(','), code = line.slice(0, c1), p = pairs.get(code);
    if (!p) continue;
    const c = line.split(',');
    const ms = Date.parse(c[1].replace(' ', 'T'));
    if (!(ms >= fromMs + 25 * H && ms < toMs) || !inSeason(ms)) continue;
    const hy = hyearOf(ms); if (hy < DEN.years[0] || hy > DEN.years[1]) continue;
    counts.days++;
    const hn = c[4] === '' ? null : +c[4], hnw = c[5] == null || c[5].trim() === '' ? null : +c[5];
    if (hn == null || !(hn >= DEN.hnMin)) { counts.small++; continue; }
    if (hnw == null) { counts.noWater++; continue; }
    if (!(hnw >= DEN.hnwMin)) { counts.small++; continue; }
    const m = met.get(p.smn), iEnd = Math.round((ms - fromMs) / H) - 1;
    const t = [], u = [], rr = [];
    for (let i = iEnd - 23; i <= iEnd; i++) { t.push(m.t[i] == null ? null : m.t[i] + DEN.gamma * (p.z - p.smnHeight)); u.push(m.u[i]); rr.push(m.rr[i]); }
    const tOk = t.filter((v) => v != null);
    if (tOk.length < DEN.tHours) { counts.fewT++; continue; }
    if (Math.max(...tOk) > DEN.tMax) { counts.warm++; continue; }
    const rho = hnw / (hn / 100);
    if (!(rho >= DEN.rhoMin && rho <= DEN.rhoMax)) { counts.badDensity++; continue; }
    const tm = mean(tOk);
    events.push({ code, ms, hy, z: p.z, hn, hnw, rho, t: t.map((v) => (v == null ? tm : v)), tMean: tm, u, uOk: u.every((v) => v != null), uMean: mean(u.filter((v) => v != null)), gauge: rr.filter((v) => v != null).length >= 20 ? rr.reduce((s, v) => s + (v ?? 0), 0) : null });
  }
  return { pairs: [...pairs.values()], events, counts };
}

function scoreRows(ev, depthOf) {
  const err = ev.map((e) => depthOf(e) - e.hn);
  const cls = DEN.classes.map(([lo, hi]) => { const idx = ev.map((e, i) => (e.hn >= lo && e.hn < hi ? i : -1)).filter((i) => i >= 0); return { from: lo, to: hi > 1e8 ? null : hi, n: idx.length, mae: mean(idx.map((i) => Math.abs(err[i]))), bias: mean(idx.map((i) => err[i])) }; });
  return { n: ev.length, mae: mean(err.map(Math.abs)), bias: mean(err), classes: cls };
}

async function austria(cache, rule) {
  const st = (await klimaStations(cache, '1d')).filter((s) => s.height >= DEN.at.minAlt && (!s.to || s.to > `${DEN.at.years[0]}`));
  mkdirSync(join(cache, 'geosphere'), { recursive: true });
  const ev = []; let stationsWith = 0; const lagVotes = [0, 0];
  for (const s of st) {
    const file = join(cache, 'geosphere', `raw-1d-${s.id}.json`);
    if (!existsSync(file)) {
      let txt = '{}';
      try { const r = await fetch(`${GEOSPHERE}/station/historical/klima-v2-1d?parameters=rr,shneu_manu,tl_mittel,vv_mittel&start=${DEN.at.years[0] - 1}-10-01&end=${DEN.at.years[1]}-05-31&station_ids=${s.id}&output_format=geojson`); if (r.ok) txt = await r.text(); } catch { /* station without data in the window */ }
      writeFileSync(file, txt); await new Promise((r) => setTimeout(r, 250));
    }
    const j = JSON.parse(readFileSync(file, 'utf8')), f = j.features?.[0]; if (!f) continue;
    const P = f.properties.parameters, rr = P.rr?.data, hn = P.shneu_manu?.data, tl = P.tl_mittel?.data, vv = P.vv_mittel?.data;
    if (!rr || !hn || !hn.some((v) => v > 0)) continue;
    stationsWith++;
    // which day carries the precipitation of a new-snow reading: the same index or the one before? decided per station by the larger covariance, both counted
    const cov = (lag) => { let s = 0; for (let i = 1; i < hn.length; i++) if (hn[i] > 0 && rr[i - lag] > 0) s += hn[i] * rr[i - lag]; return s; };
    const lag = cov(1) >= cov(0) ? 1 : 0; lagVotes[lag]++;
    for (let i = 1; i < hn.length; i++) {
      const ms = Date.parse(j.timestamps[i]); if (!inSeason(ms)) continue;
      const hy = hyearOf(ms); if (hy < DEN.at.years[0] || hy > DEN.at.years[1]) continue;
      const k = i - lag;
      if (!(hn[i] >= DEN.at.hn) || !(rr[k] >= DEN.at.rr) || tl?.[k] == null || !(tl[k] <= DEN.at.t) || vv?.[k] == null || !(vv[k] <= DEN.at.wind)) continue;
      ev.push({ code: s.id, z: s.height, hn: hn[i], hnw: rr[k], t: new Array(24).fill(tl[k]), tMean: tl[k], rho: rr[k] / (hn[i] / 100) });
    }
  }
  const d0 = scoreRows(ev, (e) => boardDepth(e.hnw, e.t, () => SNOW.rhoNew));
  const chosen = scoreRows(ev, (e) => boardDepth(e.hnw, e.t, (h) => rule(e, h)));
  return { stations: st.length, stationsWithNewSnow: stationsWith, lagVotes: { sameDay: lagVotes[0], dayBefore: lagVotes[1] }, events: ev.length, sites: new Set(ev.map((e) => e.code)).size, densityFromGauge: { p10: quant(ev.map((e) => e.rho), 0.1), p50: quant(ev.map((e) => e.rho), 0.5), p90: quant(ev.map((e) => e.rho), 0.9) }, D0: d0, chosen };
}

async function main() {
  const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
  const cache = arg('cache'), t0 = Date.now();
  const fromMs = Date.parse('2011-09-01T00:00:00Z'), toMs = Date.parse('2025-06-01T00:00:00Z');
  const frozen = arg('frozen', join(import.meta.dirname, '../../audit/gletscher-schneemodell/gm3-method-frozen.md'));
  const report = { kind: 'glacier/snowcal-report-B', generated: new Date().toISOString(), method: { file: 'audit/gletscher-schneemodell/gm3-method-frozen.md', sha256: createHash('sha256').update(readFileSync(frozen)).digest('hex') }, constants: DEN };
  const { pairs, events, counts } = await loadEvents(cache, fromMs, toMs);
  const sites = [...new Set(events.map((e) => e.code))];
  report.data = { pairs: pairs.length, sitesWithEvents: sites.length, events: events.length, counts, perSite: sites.map((c) => { const p = pairs.find((x) => x.code === c), ev = events.filter((e) => e.code === c); return { code: c, label: p.label, z: p.z, smn: p.smn, km: p.km, dh: p.z - p.smnHeight, events: ev.length, rho50: Math.round(quant(ev.map((e) => e.rho), 0.5)) }; }) };
  console.log(`pairs ${pairs.length}, sites with events ${sites.length}, events ${events.length}`, JSON.stringify(counts));

  // measured density of the board (24 h): quantiles, by elevation and temperature
  const q = (ev) => ({ n: ev.length, p10: quant(ev.map((e) => e.rho), 0.1), p50: quant(ev.map((e) => e.rho), 0.5), p90: quant(ev.map((e) => e.rho), 0.9), mean: mean(ev.map((e) => e.rho)) });
  report.measured = { all: q(events), below1500: q(events.filter((e) => e.z < 1500)), from1500: q(events.filter((e) => e.z >= 1500)), colderMinus8: q(events.filter((e) => e.tMean < -8)), minus8toMinus3: q(events.filter((e) => e.tMean >= -8 && e.tMean < -3)), warmerMinus3: q(events.filter((e) => e.tMean >= -3)), ratioOfSums: events.reduce((s, e) => s + e.hnw, 0) / events.reduce((s, e) => s + e.hn / 100, 0) };
  console.log('measured board density', JSON.stringify(report.measured.all));

  // D0, D1
  const depthD0 = events.map((e) => boardDepth(e.hnw, e.t, () => SNOW.rhoNew));
  report.D0 = scoreRows(events, (e) => depthD0[events.indexOf(e)]);
  const evU = events.filter((e) => e.uOk);
  report.D1 = { ...scoreRows(evU, (e) => boardDepth(e.hnw, e.t, (h) => newSnowDensity({ rule: 'vionnet', tC: e.t[h], uMs: e.u[h] }))), withoutWind: events.length - evU.length, D0onSameDays: scoreRows(evU, (e) => boardDepth(e.hnw, e.t, () => SNOW.rhoNew)) };
  console.log('D0', report.D0.mae.toFixed(2), report.D0.bias.toFixed(2), '| D1', report.D1.mae.toFixed(2), report.D1.bias.toFixed(2), `(D0 same days ${report.D1.D0onSameDays.mae.toFixed(2)})`);

  // D2, D3: |error| per parameter set and site, then leave-one-site-out from the sums
  const siteIdx = new Map(sites.map((c, i) => [c, i]));
  const grid = (list, depthOf) => list.map((par) => { const abs = new Float64Array(sites.length), sum = new Float64Array(sites.length); for (const e of events) { const d = depthOf(par, e) - e.hn; abs[siteIdx.get(e.code)] += Math.abs(d); sum[siteIdx.get(e.code)] += d; } return { par, abs, sum }; });
  const nSite = sites.map((c) => events.filter((e) => e.code === c).length);
  const lso = (g) => {
    let abs = 0, sum = 0; const picks = [];
    for (let s = 0; s < sites.length; s++) {
      let best = null, bv = Infinity;
      for (const x of g) { let v = 0; for (let k = 0; k < sites.length; k++) if (k !== s) v += x.abs[k]; if (v < bv) { bv = v; best = x; } }
      abs += best.abs[s]; sum += best.sum[s]; picks.push(best.par);
    }
    let full = null, fv = Infinity; for (const x of g) { const v = x.abs.reduce((a, b) => a + b, 0); if (v < fv) { fv = v; full = x; } }
    return { lsoMae: abs / events.length, lsoBias: sum / events.length, full: full.par, fullMae: fv / events.length, picks };
  };
  const d2List = []; for (let r = DEN.d2.lo; r <= DEN.d2.hi; r += DEN.d2.step) d2List.push([r]);
  const g2 = grid(d2List, ([r], e) => boardDepth(e.hnw, e.t, () => r));
  const r2 = lso(g2);
  report.D2 = { rho: r2.full[0], fullMae: r2.fullMae, lsoMae: r2.lsoMae, lsoBias: r2.lsoBias, lsoRange: [Math.min(...r2.picks.map((p) => p[0])), Math.max(...r2.picks.map((p) => p[0]))], detail: scoreRows(events, (e) => boardDepth(e.hnw, e.t, () => r2.full[0])) };
  console.log('D2', JSON.stringify({ rho: report.D2.rho, lsoMae: report.D2.lsoMae, lsoBias: report.D2.lsoBias, range: report.D2.lsoRange }), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const d3List = []; for (let a = DEN.d3.a[0]; a <= DEN.d3.a[1]; a += DEN.d3.a[2]) for (let b = DEN.d3.b[0]; b <= DEN.d3.b[1] + 1e-9; b += DEN.d3.b[2]) d3List.push([a, b]);
  const g3 = grid(d3List, ([a, b], e) => boardDepth(e.hnw, e.t, (h) => d3Rho(a, b, e.t[h])));
  const r3 = lso(g3);
  report.D3 = { a: r3.full[0], b: r3.full[1], fullMae: r3.fullMae, lsoMae: r3.lsoMae, lsoBias: r3.lsoBias, lsoRange: { a: [Math.min(...r3.picks.map((p) => p[0])), Math.max(...r3.picks.map((p) => p[0]))], b: [Math.min(...r3.picks.map((p) => p[1])), Math.max(...r3.picks.map((p) => p[1]))] }, detail: scoreRows(events, (e) => boardDepth(e.hnw, e.t, (h) => d3Rho(r3.full[0], r3.full[1], e.t[h]))) };
  console.log('D3', JSON.stringify({ a: report.D3.a, b: report.D3.b, lsoMae: report.D3.lsoMae, lsoBias: report.D3.lsoBias, range: report.D3.lsoRange }), `${((Date.now() - t0) / 1000).toFixed(0)} s`);

  // selection (§B.3)
  let chosen = 'D0', ref = report.D0.mae;
  const trace = [];
  const d1Gain = 1 - report.D1.mae / report.D1.D0onSameDays.mae;
  trace.push({ rule: 'D1', mae: report.D1.mae, d0SameDays: report.D1.D0onSameDays.mae, gain: d1Gain, accepted: d1Gain >= DEN.gain });
  const d2Gain = 1 - report.D2.lsoMae / report.D0.mae; trace.push({ rule: 'D2', lsoMae: report.D2.lsoMae, d0: report.D0.mae, gain: d2Gain, accepted: d2Gain >= DEN.gain });
  if (d2Gain >= DEN.gain) { chosen = 'D2'; ref = report.D2.lsoMae; }
  const d3Gain = 1 - report.D3.lsoMae / ref, d3vsD2 = 1 - report.D3.lsoMae / report.D2.lsoMae;
  trace.push({ rule: 'D3', lsoMae: report.D3.lsoMae, against: ref, gain: d3Gain, gainOverD2: d3vsD2, accepted: d3Gain >= DEN.gain && d3vsD2 >= DEN.gain });
  if (d3Gain >= DEN.gain && d3vsD2 >= DEN.gain) chosen = 'D3';
  if (d1Gain >= DEN.gain && chosen === 'D0') chosen = 'D1';
  report.selection = { trace, chosen };
  console.log('chosen', chosen);

  // D: gauge undercatch at the same sites
  const withGauge = events.filter((e) => e.gauge != null && e.uMean != null);
  report.undercatch = { events: withGauge.length, all: withGauge.reduce((s, e) => s + e.gauge, 0) / withGauge.reduce((s, e) => s + e.hnw, 0), byWind: DEN.wind.map(([lo, hi]) => { const ev = withGauge.filter((e) => e.uMean >= lo && e.uMean < hi); return { from: lo, to: hi > 1e8 ? null : hi, n: ev.length, ratio: ev.length ? ev.reduce((s, e) => s + e.gauge, 0) / ev.reduce((s, e) => s + e.hnw, 0) : null }; }) };
  console.log('undercatch gauge / board', JSON.stringify(report.undercatch));

  if (arg('at') === '1') {
    const rule = chosen === 'D2' ? () => report.D2.rho : chosen === 'D3' ? (e, h) => d3Rho(report.D3.a, report.D3.b, e.t[h]) : () => SNOW.rhoNew;
    report.austria = await austria(cache, rule);
    console.log('AT transfer', JSON.stringify({ events: report.austria.events, sites: report.austria.sites, lag: report.austria.lagVotes, D0: [report.austria.D0.mae, report.austria.D0.bias], chosen: [report.austria.chosen.mae, report.austria.chosen.bias], rho: report.austria.densityFromGauge }));
  }
  report.seconds = (Date.now() - t0) / 1000;
  writeFileSync(arg('out'), JSON.stringify(report, null, 1));
  console.log(`${report.seconds.toFixed(0)} s → ${arg('out')}`);
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
