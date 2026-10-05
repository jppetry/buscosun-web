/**
 * referenzen.mjs — the reference forecasts of protocol P1 as pseudo-versions (plan PS-2-3, Konzept §8). Each returns a
 * forecast block like a Fusion version: point values (`nq = 1`, CRPS_Q = absolute error) except the climatology, which
 * carries the protocol's quantile set.
 *
 *   klima      empirical quantiles per station × calendar day (± window) × hour from W1, training periods only
 *   persistenz the latest measurement at issue time; from 24 h the value of the same hour on the last day before the
 *              issue — role A only (a held-out station has no measurement); track R takes W1 at the issue hour
 *   roh        the cube value of the nearest cell per stage, native steps only, no height correction
 *   roh-lapse  the same with 0,65 K/100 m from the effective model height to the station height (T and dew point)
 *   mosmix     MOSMIX-L of the station's catalogue station from the slot (archive only)
 */
import { H, DAY, dayMs, isoDay } from './common.mjs';
import * as A from '../../fusionfit/lib/archiveAdapter.mjs';
import { seriesFromSlotTier } from '../../fusionfit/lib/slotAdapter.mjs';
import { features } from './replay.mjs';
import { truthValue } from './wahrheit.mjs';
import { QUANTITY_VARS, stepHoursOf } from '../../../src/pruefstand/protokoll.ts';
import { channelsOf } from '../../../src/pruefstand/adapter.ts';
import { sortedQuantile } from '../../../src/pruefstand/metrics.ts';

const NQV = QUANTITY_VARS.length;
const dirOf = (u, v) => (u == null || v == null || (u === 0 && v === 0) ? NaN : ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360);
const num = (x) => (x == null || !Number.isFinite(x) ? NaN : x);
function putPoint(out, o, vals, wetThr) {
  // vals: { t, td, ws, gust, precip, clct, dd }
  for (let v = 0; v < NQV; v++) out[o + v] = num(vals[QUANTITY_VARS[v]]);
  const pr = out[o + QUANTITY_VARS.indexOf('precip')];
  out[o + NQV] = pr === pr ? (pr >= wetThr ? 1 : 0) : NaN;
  out[o + NQV + 1] = num(vals.dd);
}

// ── cube raw ───────────────────────────────────────────────────────────────────────────────────────────────────────
function rawBlock(proto, issueMs, leads, seriesOf, lapse, leadOk) {
  const feat = features().byPoint;
  const stations = proto.scored, nL = leads.length, ch = channelsOf(1);
  const out = new Float32Array(stations.length * nL * ch).fill(NaN);
  const wetThr = proto.variables.wet.thresholdMmH;
  for (let s = 0; s < stations.length; s++) {
    const elev = feat[stations[s].id].elevM;
    const byMs = new Map();
    for (const t of ['t3', 't2', 't1']) {   // stage 1 wins where two stages carry the same valid time
      const ser = seriesOf(t, stations[s].id);
      if (!ser) continue;
      for (const st of ser.steps) byMs.set(st.validAtMs, { v: st.values, h: ser.hModEffM ?? st.values.hModEff ?? null, tier: t });
    }
    for (let l = 0; l < nL; l++) {
      const e = byMs.get(issueMs + leads[l] * H);
      if (!e || (leadOk && !leadOk(leads[l], e.tier))) continue;
      const v = e.v, dT = lapse && e.h != null ? lapse * (e.h - elev) : 0;
      putPoint(out, (s * nL + l) * ch, {
        t: v.t2m != null ? v.t2m + dT : null, td: v.td2m != null ? v.td2m + dT : null,
        ws: v.u10 != null && v.v10 != null ? Math.hypot(v.u10, v.v10) : null, gust: v.gust, precip: v.precip != null ? Math.max(0, v.precip) : null, clct: v.clct, dd: dirOf(v.u10, v.v10),
      }, wetThr);
    }
  }
  return { data: out, nq: 1, info: { lapseKPerM: lapse || 0 } };
}
const R_LEAD_OK = (L, tier) => (tier === 't1' ? L <= 2 : L >= 51);

// ── MOSMIX-L ───────────────────────────────────────────────────────────────────────────────────────────────────────
function mosmixBlock(proto, slot, issueMs, leads) {
  const feat = features().byPoint;
  const stations = proto.scored, nL = leads.length, ch = channelsOf(1);
  const out = new Float32Array(stations.length * nL * ch).fill(NaN);
  const wetThr = proto.variables.wet.thresholdMmH, lapse = proto.references['roh-lapse'].lapseKPerM;
  let withSeries = 0;
  for (let s = 0; s < stations.length; s++) {
    const elev = feat[stations[s].id].elevM;
    const ser = A.archiveStation(slot, stations[s].id, elev).series;
    if (!ser) continue;
    withSeries += 1;
    const byMs = new Map(ser.steps.map((st) => [st.validAtMs, st.values]));
    const dT = lapse * (ser.station.elev - elev);
    for (let l = 0; l < nL; l++) {
      const valid = issueMs + leads[l] * H, stepH = stepHoursOf(proto, leads[l]);
      const v = byMs.get(valid);
      if (!v) continue;
      let gust = -Infinity, sum = 0, okG = true, okP = true;
      for (let k = 0; k < stepH; k++) { const x = byMs.get(valid - k * H); if (x?.gust != null) gust = Math.max(gust, x.gust); else okG = false; if (x?.precip != null) sum += Math.max(0, x.precip); else okP = false; }
      putPoint(out, (s * nL + l) * ch, { t: v.t2m != null ? v.t2m + dT : null, td: v.td2m != null ? v.td2m + dT : null, ws: v.u10 != null && v.v10 != null ? Math.hypot(v.u10, v.v10) : null, gust: okG ? gust : null, precip: okP ? sum / stepH : null, clct: v.clct, dd: dirOf(v.u10, v.v10) }, wetThr);
    }
  }
  return { data: out, nq: 1, info: { withSeries } };
}

// ── persistence ────────────────────────────────────────────────────────────────────────────────────────────────────
/** `hourly(s, ms)` → { t, td, ws, gust, precip, clct, dd } of that hour or null; `lastMs(s)` = stamp of the latest record. */
function persistenceBlock(proto, issueMs, leads, hourly, lastMs, roleAOnly) {
  const stations = proto.scored, nL = leads.length, ch = channelsOf(1);
  const out = new Float32Array(stations.length * nL * ch).fill(NaN);
  const wetThr = proto.variables.wet.thresholdMmH;
  for (let s = 0; s < stations.length; s++) {
    if (roleAOnly && stations[s].role !== 'A') continue;
    const last = lastMs(s);
    if (last == null) continue;
    for (let l = 0; l < nL; l++) {
      const L = leads[l], valid = issueMs + L * H, stepH = stepHoursOf(proto, L);
      // the hour that stands in for `ms`: the latest record below 24 h, else the same hour of day on the last day ≤ the latest record
      const src = (ms) => { if (ms - issueMs < 24 * H) return last; let x = ms - DAY; while (x > last) x -= DAY; return x; };
      const r = hourly(s, src(valid));
      if (!r) continue;
      let gust = -Infinity, sum = 0, okG = true, okP = true;
      for (let k = 0; k < stepH; k++) { const x = hourly(s, src(valid - k * H)); if (x && x.gust === x.gust && x.gust != null) gust = Math.max(gust, x.gust); else okG = false; if (x && x.precip === x.precip && x.precip != null) sum += x.precip; else okP = false; }
      putPoint(out, (s * nL + l) * ch, { ...r, gust: okG ? gust : null, precip: okP ? sum / stepH : null }, wetThr);
    }
  }
  return { data: out, nq: 1, info: { roleAOnly } };
}

// ── climatology ────────────────────────────────────────────────────────────────────────────────────────────────────
let trainDays = null;
function trainingDays(proto) {
  if (trainDays) return trainDays;
  trainDays = [];
  for (const [a, b] of proto.references.klima.training) for (let d = dayMs(a); d <= dayMs(b); d += DAY) trainDays.push({ ms: d, doy: Math.floor((d - Date.UTC(new Date(d).getUTCFullYear(), 0, 1)) / DAY) });
  return trainDays;
}
export function klimaBlock(proto, w1, issueMs, leads) {
  const stations = proto.scored, nL = leads.length, taus = proto.quantiles, nq = taus.length, ch = channelsOf(nq);
  const out = new Float32Array(stations.length * nL * ch).fill(NaN);
  const { windowDays, minSamples } = proto.references.klima, wetThr = proto.variables.wet.thresholdMmH;
  const days = trainingDays(proto);
  const byDoy = new Map();
  let samples = 0, cells = 0;
  for (let l = 0; l < nL; l++) {
    const valid = issueMs + leads[l] * H, stepH = stepHoursOf(proto, leads[l]);
    const doy = Math.floor((valid - Date.UTC(new Date(valid).getUTCFullYear(), 0, 1)) / DAY), hod = valid % DAY;
    if (!byDoy.has(doy)) byDoy.set(doy, days.filter((d) => { const x = Math.abs(d.doy - doy); return Math.min(x, 365 - x) <= windowDays; }));
    const cand = byDoy.get(doy);
    for (let s = 0; s < stations.length; s++) {
      const o = (s * nL + l) * ch;
      for (let v = 0; v < NQV; v++) {
        const xs = [];
        for (const d of cand) { const x = truthValue(w1, s, d.ms + hod, QUANTITY_VARS[v], stepH); if (x === x) xs.push(x); }
        if (xs.length < minSamples) continue;
        xs.sort((a, b) => a - b);
        for (let k = 0; k < nq; k++) out[o + v * nq + k] = sortedQuantile(xs, taus[k]);
        if (QUANTITY_VARS[v] === 'precip') { let w = 0; for (const x of xs) if (x >= wetThr) w++; out[o + NQV * nq] = w / xs.length; }
        samples += xs.length; cells += 1;
      }
    }
  }
  return { data: out, nq, info: { trainingDays: days.length, meanSamples: cells ? Math.round((samples / cells) * 10) / 10 : 0 } };
}

// ── entry points ───────────────────────────────────────────────────────────────────────────────────────────────────
const W1V = { t: 0, td: 1, ws: 2, dd: 3, gust: 4, precip: 5, clct: 6 };
const w1Hour = (w1) => (s, ms) => ({ t: w1.at(s, ms, W1V.t), td: w1.at(s, ms, W1V.td), ws: w1.at(s, ms, W1V.ws), gust: w1.at(s, ms, W1V.gust), precip: w1.at(s, ms, W1V.precip), clct: w1.at(s, ms, W1V.clct), dd: w1.at(s, ms, W1V.dd) });

export function referenceArchive(name, proto, slot, issue, leads, w1) {
  const issueMs = issue.issueMs;
  if (name === 'klima') return klimaBlock(proto, w1, issueMs, leads);
  if (name === 'roh' || name === 'roh-lapse') return rawBlock(proto, issueMs, leads, (t, id) => A.archiveSeries(slot, t, id), name === 'roh-lapse' ? proto.references['roh-lapse'].lapseKPerM : 0, null);
  if (name === 'mosmix') return mosmixBlock(proto, slot, issueMs, leads);
  if (name === 'persistenz') {
    const feat = features().byPoint;
    const truth = A.archiveTruth(slot, (id) => feat[id]?.country ?? null);
    // a cloud value above 100 is the POI code 9/8 (sky not visible), no cloud cover
    const maps = proto.scored.map((st) => { const rec = truth.get(st.id); if (!rec) return null; const m = new Map(); let last = null; for (const r of rec.rows) { if (r.ms > slot.slotAtMs) continue; m.set(r.ms, { t: r.t, td: r.td, ws: r.ff, gust: r.fxh, precip: r.rr != null ? Math.max(0, r.rr) : null, clct: r.n != null && r.n <= 100 ? r.n : null, dd: r.dd }); if (r.t != null && (last == null || r.ms > last)) last = r.ms; } return { m, last }; });
    return persistenceBlock(proto, issueMs, leads, (s, ms) => maps[s]?.m.get(ms) ?? null, (s) => maps[s]?.last ?? null, true);
  }
  throw new Error(`Referenz ${name} unbekannt`);
}
export function referenceHindcast(name, proto, slot, issue, leads, w1) {
  const issueMs = issue.issueMs;
  if (name === 'klima') return klimaBlock(proto, w1, issueMs, leads);
  if (name === 'roh' || name === 'roh-lapse') return rawBlock(proto, issueMs, leads, (t, id) => (slot.cube[t] ? seriesFromSlotTier(slot, t, id) : null), name === 'roh-lapse' ? proto.references['roh-lapse'].lapseKPerM : 0, R_LEAD_OK);
  if (name === 'persistenz') { const hr = w1Hour(w1); return persistenceBlock(proto, issueMs, leads, (s, ms) => { const r = hr(s, ms); return r.t === r.t ? r : null; }, () => issueMs, false); }
  if (name === 'mosmix') return null;   // not archived in the hindcast (D-PS-4)
  throw new Error(`Referenz ${name} unbekannt`);
}
export { isoDay };
