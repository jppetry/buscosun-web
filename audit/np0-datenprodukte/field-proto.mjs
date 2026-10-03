// NP-0 fork C — diagnosis prototype (NOT the producer). D-NP0-9 (stats) and D-NP0-13 (runtime/bytes).
//   node --experimental-strip-types --import file:///C:/dev/buscosun-web/scripts/lib/register-ts.mjs field-proto.mjs \
//        --data=C:/dev/buscosun-data --run=2026093018 --tier=t1 --mode=stats|proto [--out=<dir>]
// Reads every chunk of one tier from disk with the client decoder (`decodeCubeChunk`, planes from run.json),
// assembles full grids for the precip/snowlmt planes and either prints coverage/range statistics (stats) or computes
// F2 (censored normal on the cube spread), F3 (mean + q90) and snowlmt mid/low/high per cell and lead and writes one
// RGBA PNG per lead and quantity (proto), timing each phase.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { decodeCubeChunk, MISSING } from 'file:///C:/dev/buscosun-web/src/point/cubeFormat.ts';
import { quantileOf, cdfOf } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/dist.ts';
import { encodePng } from 'file:///C:/dev/buscosun-web/scripts/lib/png.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const DATA = args.data ?? 'C:/dev/buscosun-data';
const RUN = args.run; const TIER = args.tier ?? 't1'; const MODE = args.mode ?? 'stats';
const OUT = args.out ?? join(process.cwd(), 'out');
const WANT = ['precip', 'precip_sd', 'precip_sd_ens', 'precip_q10', 'precip_q90', 'precip_ens',
  'snowlmt', 'snowlmt_sd', 'snowlmt_sd_ens', 'snowlmt_q10', 'snowlmt_q90', 'srcCount', 'ensCount'];

const T0 = performance.now();
const man = JSON.parse(readFileSync(join(DATA, 'point', RUN, 'run.json'), 'utf8'));
const tier = man.tiers.find((t) => t.id === TIER);
if (!tier) throw new Error(`tier ${TIER} not in run ${RUN}`);
const planes = man.planes;
const scaleOf = Object.fromEntries(planes.map((p) => [p.id, p]));
const { ny, nx } = tier; const nt = tier.leadHours.length; const N = ny * nx;
const grid = Object.fromEntries(WANT.map((id) => [id, new Float32Array(nt * N).fill(NaN)]));
let bytesRead = 0;
const tRead0 = performance.now();
let tDecode = 0;
for (const f of tier.files) {
  const buf = readFileSync(join(DATA, f.file)); bytesRead += buf.length;
  const d0 = performance.now();
  const ch = await decodeCubeChunk(new Uint8Array(buf), { planes: planes.map((p) => ({ id: p.id })), wanted: WANT });
  tDecode += performance.now() - d0;
  for (const id of WANT) {
    const pi = planes.findIndex((p) => p.id === id); const arr = ch.planes[pi]; const sc = scaleOf[id];
    const g = grid[id];
    for (let it = 0; it < ch.nt; it++) for (let ry = 0; ry < ch.ny; ry++) for (let rx = 0; rx < ch.nx; rx++) {
      const q = arr[(it * ch.ny + ry) * ch.nx + rx];
      if (q === MISSING) continue;
      g[it * N + (ch.y0 + ry) * nx + (ch.x0 + rx)] = q * sc.scale + sc.offset;
    }
  }
}
const tRead = performance.now() - tRead0;

if (MODE === 'stats') {
  const pct = (a, n) => (100 * a / n).toFixed(1);
  const quant = (vals, ps) => { const s = Float64Array.from(vals).sort(); return ps.map((p) => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN); };
  console.log(`run ${RUN} tier ${TIER} ${ny}x${nx} nt ${nt} files ${tier.files.length} bytes ${bytesRead} read+decode ${tRead.toFixed(0)} ms (decode ${tDecode.toFixed(0)})`);
  // coverage per plane: share of (cell,lead) present, and leads with any value
  for (const id of WANT) {
    const g = grid[id]; let n = 0; const leadsAny = [];
    for (let it = 0; it < nt; it++) { let k = 0; for (let c = 0; c < N; c++) if (!Number.isNaN(g[it * N + c])) k++; n += k; if (k) leadsAny.push(`${tier.leadHours[it]}:${pct(k, N)}`); }
    const vals = []; for (let i = 0; i < g.length; i++) if (!Number.isNaN(g[i])) vals.push(g[i]);
    const [p50, p90, p99, p999, mx] = quant(vals, [0.5, 0.9, 0.99, 0.999, 1]);
    const mn = vals.length ? quant(vals, [0])[0] : NaN;
    console.log(`${id.padEnd(15)} present ${pct(n, nt * N).padStart(5)} %  leads ${leadsAny.length}/${nt}  min ${mn} p50 ${p50} p90 ${p90} p99 ${p99} p99.9 ${p999} max ${mx}`);
    if (leadsAny.length && leadsAny.length < nt) console.log(`   leads(lead:%cells) ${leadsAny.join(' ')}`);
  }
  // precip: wet share and spread presence where mean present
  const P = grid.precip; let pres = 0, wet01 = 0, sdEns = 0, sdDiv = 0, none = 0, q = 0;
  for (let i = 0; i < P.length; i++) { if (Number.isNaN(P[i])) continue; pres++; if (P[i] >= 0.1) wet01++;
    if (!Number.isNaN(grid.precip_sd_ens[i])) sdEns++; else if (!Number.isNaN(grid.precip_sd[i])) sdDiv++; else none++;
    if (!Number.isNaN(grid.precip_q90[i])) q++; }
  console.log(`precip mean present ${pres}: >=0.1 mm/h ${pct(wet01, pres)} % · spread kind ens ${pct(sdEns, pres)} % div ${pct(sdDiv, pres)} % none ${pct(none, pres)} % · q90 ${pct(q, pres)} %`);
  const S = grid.snowlmt; pres = 0; sdEns = 0; sdDiv = 0; none = 0; q = 0;
  for (let i = 0; i < S.length; i++) { if (Number.isNaN(S[i])) continue; pres++;
    if (!Number.isNaN(grid.snowlmt_sd_ens[i])) sdEns++; else if (!Number.isNaN(grid.snowlmt_sd[i])) sdDiv++; else none++;
    if (!Number.isNaN(grid.snowlmt_q90[i])) q++; }
  console.log(`snowlmt mean present ${pres}: spread kind ens ${pct(sdEns, pres)} % div ${pct(sdDiv, pres)} % none ${pct(none, pres)} % · q10/q90 ${pct(q, pres)} %`);
  { // snow band: clamps and comparison σ-band vs measured quantiles where both exist
    let lo0 = 0, hiSat = 0, nb = 0, both = 0, dLo = [], dHi = [];
    for (let i = 0; i < S.length; i++) { if (Number.isNaN(S[i])) continue; const s = !Number.isNaN(grid.snowlmt_sd_ens[i]) ? grid.snowlmt_sd_ens[i] : grid.snowlmt_sd[i];
      if (Number.isNaN(s)) continue; nb++; const lo = S[i] - 1.2816 * s, hi = S[i] + 1.2816 * s; if (lo < 0) lo0++; if (hi > 6350) hiSat++;
      if (!Number.isNaN(grid.snowlmt_q10[i])) { both++; dLo.push(Math.abs(lo - grid.snowlmt_q10[i])); dHi.push(Math.abs(hi - grid.snowlmt_q90[i])); } }
    const med = (a) => a.length ? Float64Array.from(a).sort()[a.length >> 1] : NaN;
    console.log(`snow band (σ rule): ${nb} cells·leads, low<0 ${pct(lo0, nb)} %, high>6350 ${pct(hiSat, nb)} % · where q10/q90 exist (${both}): median |σ-low − q10| ${med(dLo)} m, |σ-high − q90| ${med(dHi)} m`);
    const P = grid.precip; let n = 0, wetMean = 0, wetQ90 = 0, sat = 0; // precip amounts above encodable max
    for (let i = 0; i < P.length; i++) { if (Number.isNaN(P[i])) continue; n++; if (P[i] > 100 || grid.precip_q90[i] > 100) sat++; }
    console.log(`precip > 100 mm/h (mean or q90): ${sat} of ${n}`);
  }
  // q90 coverage bounding box (where in the domain)
  for (const id of ['precip_q90', 'snowlmt_q90', 'precip_sd_ens', 'snowlmt_sd_ens']) {
    let y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1, cnt = 0; const g = grid[id];
    for (let it = 0; it < nt; it++) for (let c = 0; c < N; c++) if (!Number.isNaN(g[it * N + c])) { const y = Math.floor(c / nx), x = c % nx; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); cnt++; }
    if (cnt) console.log(`${id} bbox lat ${(tier.lat0 + y0 * tier.deg).toFixed(2)}..${(tier.lat0 + y1 * tier.deg).toFixed(2)} lon ${(tier.lon0 + x0 * tier.deg).toFixed(2)}..${(tier.lon0 + x1 * tier.deg).toFixed(2)}`);
  }
  process.exit(0);
}

// ---------------- proto: compute + encode ----------------
const WET = 0.1;           // mm/h, scorer threshold
const X0 = 0.1, XMAX = 100; // log encoding of amounts (mm/h)
const LOGDEN = Math.log1p(XMAX / X0);
const encAmt = (x) => (x == null || !Number.isFinite(x) ? 0 : x <= 0 ? 0 : Math.min(255, 1 + Math.round(254 * Math.log1p(x / X0) / LOGDEN)));
const SNOW_STEP = 25;      // m; code 1..255 = 0..6350 m, 0 = missing
const encSnow = (h) => (h == null || !Number.isFinite(h) ? 0 : Math.min(255, 1 + Math.round(Math.max(0, h) / SNOW_STEP)));
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
let tCalc = 0, tPng = 0, tWrite = 0, bytesPrecip = 0, bytesSnow = 0, bytesF3 = 0;
const rgba = new Uint8Array(N * 4), rgbaS = new Uint8Array(N * 4), rgba3 = new Uint8Array(N * 4);
for (let it = 0; it < nt; it++) {
  const c0 = performance.now();
  rgba.fill(0); rgbaS.fill(0); rgba3.fill(0);
  for (let c = 0; c < N; c++) {
    const i = it * N + c;
    const y = Math.floor(c / nx), x = c % nx; const o = ((ny - 1 - y) * nx + x) * 4;   // north up
    const m = grid.precip[i];
    if (!Number.isNaN(m)) {
      const sEns = grid.precip_sd_ens[i], sDiv = grid.precip_sd[i];
      const s = !Number.isNaN(sEns) ? sEns : !Number.isNaN(sDiv) ? sDiv : 0;
      // F2: censored normal at 0 on the cube mean and its spread (cost representative; definition = fork D / E-NP0-4)
      const d = { kind: 'censoredNormal', mu: m, sigma: s, lo: 0, hi: 300 };
      const pWet = 1 - cdfOf(d, WET);
      const pDry = 1 - pWet;
      const medWet = pWet > 0 ? quantileOf(d, pDry + 0.5 * pWet) : 0;
      const q90 = quantileOf(d, 0.9);
      rgba[o] = Math.round(254 * pWet); rgba[o + 1] = encAmt(medWet); rgba[o + 2] = encAmt(q90); rgba[o + 3] = 255;
      // F3: mean + measured/member q90 where present
      const mq = grid.precip_q90[i];
      rgba3[o] = encAmt(m); rgba3[o + 1] = Number.isNaN(mq) ? 0 : encAmt(mq); rgba3[o + 2] = Number.isNaN(mq) ? 0 : 1; rgba3[o + 3] = 255;
    }
    const h = grid.snowlmt[i];
    if (!Number.isNaN(h)) {
      const sEns = grid.snowlmt_sd_ens[i], sDiv = grid.snowlmt_sd[i];
      const s = !Number.isNaN(sEns) ? sEns : !Number.isNaN(sDiv) ? sDiv : NaN;
      const kind = !Number.isNaN(sEns) ? 3 : !Number.isNaN(sDiv) ? 2 : 0;
      rgbaS[o] = encSnow(h);
      rgbaS[o + 1] = kind ? encSnow(h - 1.2816 * s) : 0;
      rgbaS[o + 2] = kind ? encSnow(h + 1.2816 * s) : 0;
      rgbaS[o + 3] = 128 + kind;   // 128 = present, +origin of the band (0 none, 2 σ_div, 3 σ_ens)
    }
  }
  const c1 = performance.now(); tCalc += c1 - c0;
  const a = encodePng(nx, ny, rgba, 4), b = encodePng(nx, ny, rgbaS, 4), f3 = encodePng(nx, ny, rgba3, 4);
  const c2 = performance.now(); tPng += c2 - c1;
  const lead = tier.leadHours[it];
  writeFileSync(join(OUT, `precip-${lead}.png`), a); writeFileSync(join(OUT, `snowlmt-${lead}.png`), b); writeFileSync(join(OUT, `f3-${lead}.png`), f3);
  tWrite += performance.now() - c2;
  bytesPrecip += a.length; bytesSnow += b.length; bytesF3 += f3.length;
}
const total = performance.now() - T0;
console.log(JSON.stringify({ run: RUN, tier: TIER, ny, nx, nt, files: tier.files.length, bytesRead,
  ms: { readDecode: Math.round(tRead), decode: Math.round(tDecode), calc: Math.round(tCalc), png: Math.round(tPng), write: Math.round(tWrite), total: Math.round(total) },
  bytes: { precip: bytesPrecip, snowlmt: bytesSnow, f3: bytesF3, perLeadPrecip: Math.round(bytesPrecip / nt), perLeadSnow: Math.round(bytesSnow / nt) } }));
