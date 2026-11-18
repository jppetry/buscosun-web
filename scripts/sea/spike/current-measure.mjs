#!/usr/bin/env node
/**
 * Phase ST, step 0 — measurement only (`audit/seewetter-stroemung.md` §1.4–§1.6). Decodes every message of one BSH run
 * (packages `db` and `wb`, three day files each) with the producer reader and reports:
 *   mask (constant? hash), relation to the CWAM grid, value ranges, how "no current" shows in the data (exact zeros,
 *   near zeros per step), and per spot of the catalogue: nearest water cell, distance, share of steps without
 *   current, speed range.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/current-measure.mjs
 *     --files=<dir with Current_{db,wb}_<run>_0{0,1,2}.grb2> --run=YYYYMMDDHH --store=<sea/v1 copy with static/spots*.json> [--json=<out>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { bshMessages, bshField } from '../bshGrib.mjs';
import { SEA_MODELS, mergeSpotCatalogs } from '../../../src/sea/seaContract.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const dir = String(args.files), run = String(args.run), store = String(args.store);
const cat = JSON.parse(readFileSync(join(store, 'static/spots.json'), 'utf8'));
let dk = null; try { dk = JSON.parse(readFileSync(join(store, 'static/spots-dk.json'), 'utf8')); } catch { /* none */ }
const spots = mergeSpotCatalogs(cat.spots, dk?.spots ?? null);
const cw = SEA_MODELS.cwam.grid;
const km = (aLat, aLon, bLat, bLon) => { const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

/** A cell without flow is not written as 0 but as the packed value nearest to it (step 2^-10 or 2^-11 m/s) — measured: a distinct cluster below 0.001 m/s. */
const ZERO = 0.001;
const BINS = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.05];
const out = { run, zeroBelowMs: ZERO, packages: {}, spots: [] };
const pk = {};
for (const pkg of ['db', 'wb']) {
  const steps = [];        // { t, u, v } per 15-min step
  let grid = null; const hashes = new Set(); const pointCounts = new Set();
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity, sMax = 0;
  const E = new Set(), R = [];
  for (const day of ['00', '01', '02']) {
    const raw = new Uint8Array(readFileSync(join(dir, `Current_${pkg}_${run}_${day}.grb2`)));
    const byT = new Map();
    for (const m of bshMessages(raw)) {
      const f = bshField(raw, m.offset, m.length);
      grid ??= f.grid;
      if (JSON.stringify(f.grid) !== JSON.stringify(grid)) throw new Error('grid differs');
      const mask = new Uint8Array(Math.ceil(f.values.length / 8));
      let n = 0;
      for (let k = 0; k < f.values.length; k++) if (!Number.isNaN(f.values[k])) { mask[k >> 3] |= 0x80 >> (k & 7); n++; }
      hashes.add(createHash('sha256').update(mask).digest('hex').slice(0, 16)); pointCounts.add(n);
      E.add(f.pack.E); R.push(f.pack.R);
      const e = byT.get(f.t) ?? {};
      if (f.discipline !== 10 || f.cat !== 1 || (f.num !== 2 && f.num !== 3)) throw new Error(`unexpected parameter ${f.discipline}/${f.cat}/${f.num}`);
      e[f.num === 2 ? 'u' : 'v'] = f.values;
      byT.set(f.t, e);
    }
    for (const [t, e] of [...byT].sort((a, b) => a[0] - b[0])) { if (!e.u || !e.v) throw new Error('u or v missing'); steps.push({ t, u: e.u, v: e.v }); }
  }
  const cells = grid.ni * grid.nj;
  const zero = new Uint16Array(cells), slow = new Uint16Array(cells);
  const perStep = [];
  const bins = new Array(BINS.length + 1).fill(0);
  for (const s of steps) {
    let z = 0, lt001 = 0, lt01 = 0, lt05 = 0, n = 0;
    for (let k = 0; k < cells; k++) {
      const u = s.u[k], v = s.v[k];
      if (Number.isNaN(u)) continue;
      n++;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u; if (v < vMin) vMin = v; if (v > vMax) vMax = v;
      const sp = Math.hypot(u, v);
      if (sp > sMax) sMax = sp;
      if (sp < ZERO) { z++; zero[k]++; }
      let b = 0; while (b < BINS.length && sp >= BINS[b]) b++; bins[b]++;
      if (sp < 0.001) lt001++;
      if (sp < 0.01) { lt01++; slow[k]++; }
      if (sp < 0.05) lt05++;
    }
    perStep.push({ t: s.t, n, z, lt001, lt01, lt05 });
  }
  // distribution of the share of zero steps per cell
  const hist = { never: 0, 'le10': 0, 'le50': 0, 'le90': 0, 'lt100': 0, always: 0 };
  let water = 0;
  for (let k = 0; k < cells; k++) {
    if (Number.isNaN(steps[0].u[k])) continue;
    water++;
    const sh = zero[k] / steps.length;
    if (sh === 0) hist.never++; else if (sh <= 0.1) hist.le10++; else if (sh <= 0.5) hist.le50++; else if (sh <= 0.9) hist.le90++; else if (sh < 1) hist.lt100++; else hist.always++;
  }
  const zs = perStep.map((p) => p.z);
  out.packages[pkg] = {
    grid, steps: steps.length, first: new Date(steps[0].t).toISOString(), last: new Date(steps[steps.length - 1].t).toISOString(),
    stepMin: [...new Set(steps.slice(1).map((s, i) => (s.t - steps[i].t) / 60000))], masks: hashes.size, maskHash: [...hashes][0], waterPoints: [...pointCounts],
    cwamColumnOffset: +((grid.lo1 - cw.lon1) / cw.di).toFixed(3), cwamRowOfFirst: +((cw.lat1 - grid.la1) / cw.dj).toFixed(3),
    u: [+uMin.toFixed(4), +uMax.toFixed(4)], v: [+vMin.toFixed(4), +vMax.toFixed(4)], speedMax: +sMax.toFixed(4), E: [...E], R: [Math.min(...R), Math.max(...R)],
    zeroPerStep: { min: Math.min(...zs), max: Math.max(...zs), every2h: zs.filter((_, i) => i % 8 === 0) },
    speedBins: Object.fromEntries(bins.map((n, i) => [i < BINS.length ? `<${BINS[i]}` : `>=${BINS[BINS.length - 1]}`, n])),
    below001: [Math.min(...perStep.map((p) => p.lt001)), Math.max(...perStep.map((p) => p.lt001))],
    below01: [Math.min(...perStep.map((p) => p.lt01)), Math.max(...perStep.map((p) => p.lt01))],
    zeroShareOfWaterCells: hist, water,
  };
  pk[pkg] = { grid, steps, zero, cells };
}

// CWAM mask against the BSH mask: needs a CWAM field; the catalogue's cells are enough for the spots.
const cellOf = (pkg, lat, lon) => { const g = pk[pkg].grid; return { c: Math.round((lon - g.lo1) / g.di), r: Math.round((lat - g.la1) / g.dj) }; };
for (const sp of spots) {
  let best = null, any = null;
  for (const pkg of ['db', 'wb']) {
    const { grid: g, steps, zero } = pk[pkg];
    const c0 = cellOf(pkg, sp.lat, sp.lon);
    for (let dr = -8; dr <= 8; dr++) for (let dc = -6; dc <= 6; dc++) {
      const r = c0.r + dr, c = c0.c + dc;
      if (r < 0 || r >= g.nj || c < 0 || c >= g.ni) continue;
      const k = r * g.ni + c;
      if (Number.isNaN(steps[0].u[k])) continue;
      const d = km(sp.lat, sp.lon, g.la1 + r * g.dj, g.lo1 + c * g.di);
      const e = { pkg, r, c, km: +d.toFixed(2), zeroShare: +(zero[k] / steps.length).toFixed(3) };
      if (!any || d < any.km) any = e;
      if (e.zeroShare <= 0.5 && (!best || d < best.km)) best = e;
    }
  }
  // the wave cell of the catalogue in the BSH grid
  const wave = {};
  for (const pkg of ['db', 'wb']) {
    const g = pk[pkg].grid, off = Math.round((g.lo1 - cw.lon1) / cw.di), c = sp.cell.i - off, r = cw.nj - 1 - sp.cell.j;
    if (c >= 0 && c < g.ni) { const k = r * g.ni + c; wave[pkg] = Number.isNaN(pk[pkg].steps[0].u[k]) ? 'land' : +(pk[pkg].zero[k] / pk[pkg].steps.length).toFixed(3); }
  }
  let stats = null;
  if (best) {
    const { steps, grid: g } = pk[best.pkg], k = best.r * g.ni + best.c;
    const s = steps.map((x) => Math.hypot(x.u[k], x.v[k]));
    const sorted = s.slice().sort((a, b) => a - b);
    stats = { maxKn: +(Math.max(...s) * 1.943844).toFixed(2), medianKn: +(sorted[sorted.length >> 1] * 1.943844).toFixed(2) };
  }
  out.spots.push({ id: sp.id, region: sp.region, tidal: !!sp.tidal, country: sp.country ?? 'DE', waveCellKm: sp.cell.km, nearest: best, nearestAny: any, waveCell: wave, ...stats });
}
console.log(JSON.stringify(out.packages, null, 1));
for (const s of out.spots) console.log(`${s.id.padEnd(26)} ${s.region.padEnd(8)} ${s.tidal ? 'watt' : '    '} any ${s.nearestAny ? `${String(s.nearestAny.km).padStart(5)} km zero ${s.nearestAny.zeroShare}` : 'NONE'} | flowing ${s.nearest ? `${s.nearest.pkg} ${String(s.nearest.km).padStart(5)} km zero ${s.nearest.zeroShare}` : 'NONE'}  waveCell ${JSON.stringify(s.waveCell)}  max ${s.maxKn ?? '–'} kn median ${s.medianKn ?? '–'} kn`);
if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify(out, null, 1) + '\n');
