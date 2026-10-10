// Phase RG — Switzerland, second sample: rzc analyses (5 min, native 0,01-mm/h steps) against SwissMetNet / precipitation
// stations (10 min, `rre150z0`, resolution 0,1 mm ⇒ truth = W3-equivalent "≥ 0,1 mm in 10 min" — no indicator exists).
// Same matching as DE (max of the two analyses at the pixel under the station, 3-h blocks, 90-% band). Compare with DE W3.
// Usage: … score-ch.mjs --rzc=<dir> --series=<series_smn.json>,<series_smnp.json> --stations=<obs stations.json> --out=<dir>
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { File as H5File } from 'jsfive';
import { quadCellIndex } from '../../src/pointForecast/quadSampler.ts';
import { rzcFwd } from '../../src/sources/meteoSwissGeo.ts';
import { lcg } from '../../src/pruefstand/stats.ts';

const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const RZC = opt.rzc ?? 'C:/dev/buscosun-radar-truth/rzc';
const SERIES = (opt.series ?? 'C:/dev/buscosun-radar-truth/obs-probe/series_smn.json,C:/dev/buscosun-radar-truth/obs-probe/series_smnp.json').split(',');
const STATIONS = opt.stations ?? 'C:/dev/buscosun-radar-truth/obs-probe/stations.json';
const OUT = opt.out ?? 'C:/dev/buscosun-web/audit/radar-regenschwelle/ergebnis';
const BLOCK_H = 3, DRAWS = 1000, SEED = 12345;
mkdirSync(OUT, { recursive: true });

const cat = new Map(JSON.parse(readFileSync(STATIONS, 'utf8')).stations.map((s) => [s.id, s]));
// --- rzc files → (ms → {rate Float64Array, width, height, corners}) lazily ---
const files = readdirSync(RZC).filter((f) => /^rzc\d{9}vl\.001\.h5$/.test(f)).sort();
const msOf = (f) => { const m = /^rzc(\d{2})(\d{3})(\d{2})(\d{2})/.exec(f); const y = 2000 + +m[1]; return Date.UTC(y, 0, 1) + (+m[2] - 1) * 86_400_000 + (+m[3]) * 3_600_000 + (+m[4]) * 60_000; };
const byMs = new Map(files.map((f) => [msOf(f), f]));
const cache = new Map();
function load(ms) {
  const f = byMs.get(ms); if (!f) return null; if (cache.has(f)) return cache.get(f);
  const b = readFileSync(join(RZC, f)); const h = new H5File(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), f);
  const where = h.get('where').attrs; const ds = h.get('dataset1/data1/data');
  const g = { rate: ds.value, width: where.xsize, height: where.ysize, corners: [[where.UL_lon, where.UL_lat], [where.UR_lon, where.UR_lat], [where.LR_lon, where.LR_lat], [where.LL_lon, where.LL_lat]] };
  cache.set(f, g); return g;
}
const first = load(msOf(files[0]));
console.log(`rzc files ${files.length}: ${new Date(msOf(files[0])).toISOString()} … ${new Date(msOf(files[files.length - 1])).toISOString()}, grid ${first.width}×${first.height}`);

// --- station series → cases ---
const cases = []; let nSt = 0;
for (const sf of SERIES) {
  const d = JSON.parse(readFileSync(sf, 'utf8')); const t0 = Date.parse(d.t0); const step = 600_000;
  for (const [id, v] of Object.entries(d.stations)) {
    if (!v.rr) continue; const s = cat.get(id); if (!s) continue;
    const idx = quadCellIndex(first.width, first.height, first.corners, s.lat, s.lon, rzcFwd, 'edge'); if (idx == null) continue;
    const r0 = first.rate[idx]; if (Number.isNaN(r0)) continue;   // outside the radar mask
    let used = 0;
    v.rr.forEach((rr, i) => {
      if (rr == null) return; const ms = t0 + i * step; const A = load(ms - 300_000), B = load(ms); if (!A || !B) return;
      const a = A.rate[idx], b = B.rate[idx]; if (Number.isNaN(a) || Number.isNaN(b)) return;
      cases.push({ id, ms, wet: rr >= 0.1, max: Math.max(a, b), block: Math.floor(ms / (BLOCK_H * 3_600_000)), day: new Date(ms).getUTCHours() >= 6 && new Date(ms).getUTCHours() < 18 }); used++;
    });
    if (used) nSt++;
  }
}
console.log(`cases ${cases.length} at ${nSt} stations, wet (≥ 0,1 mm / 10 min) ${cases.filter((c) => c.wet).length}`);

const CAND = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.1, 0.12, 0.15, 0.2, 0.3, 0.5];
function blockBoot90(days, stat) {
  const n = days.length; if (n < 2) return null; const blk = Math.max(1, Math.round(Math.cbrt(n))), rnd = lcg(SEED), w = days[0].length, vals = [];
  for (let d = 0; d < DRAWS; d++) { const sum = new Float64Array(w); let taken = 0; while (taken < n) { const start = Math.floor(rnd() * n); for (let j = 0; j < blk && taken < n; j++, taken++) { const a = days[(start + j) % n]; for (let c = 0; c < w; c++) sum[c] += a[c]; } } const s = stat(sum); if (Number.isFinite(s)) vals.push(s); }
  if (!vals.length) return null; vals.sort((a, b) => a - b); const at = (f) => vals[Math.min(vals.length - 1, Math.max(0, Math.floor(f * (vals.length - 1))))]; return { lo5: at(0.05), hi95: at(0.95) };
}
function curve(sel, label) {
  const blocks = new Map();
  for (const x of sel) { let b = blocks.get(x.block); if (!b) { b = new Float64Array(4 * (CAND.length + 1)); blocks.set(x.block, b); }
    for (let k = 0; k <= CAND.length; k++) { const blue = k === CAND.length ? x.max > 0 : x.max >= CAND[k] - 1e-9; const o = 4 * k; if (blue && x.wet) b[o]++; else if (blue) b[o + 1]++; else if (x.wet) b[o + 2]++; else b[o + 3]++; } }
  const days = [...blocks.values()], rows = [];
  for (let k = 0; k <= CAND.length; k++) { const o = 4 * k; const sum = [0, 0, 0, 0]; for (const d of days) for (let j = 0; j < 4; j++) sum[j] += d[o + j]; const [h, fa, m] = sum;
    const bp = blockBoot90(days, (s) => (s[o] + s[o + 1] > 0 ? s[o] / (s[o] + s[o + 1]) : NaN)), bq = blockBoot90(days, (s) => (s[o] + s[o + 2] > 0 ? s[o] / (s[o] + s[o + 2]) : NaN));
    rows.push({ s: k === CAND.length ? 'echo' : CAND[k], blue: h + fa, prec: h / (h + fa), precLo: bp?.lo5, precHi: bp?.hi95, pod: h / (h + m), podLo: bq?.lo5, podHi: bq?.hi95, csi: h / (h + fa + m) }); }
  return { label, n: sel.length, blocks: days.length, rows };
}
const res = { ranAt: new Date().toISOString(), files: files.length, cases: cases.length, stations: nSt, all: curve(cases, 'CH · rr ≥ 0,1 mm/10 min (W3-Äquivalent) · alle'), day: curve(cases.filter((c) => c.day), 'CH · Tag'), night: curve(cases.filter((c) => !c.day), 'CH · Nacht') };
writeFileSync(join(OUT, 'score-ch.json'), JSON.stringify(res, null, 1));
const pct = (x) => (x == null || Number.isNaN(x) ? '—' : (100 * x).toFixed(1).replace('.', ','));
const md = [`# CH (rzc gegen SwissMetNet) — Lauf ${res.ranAt}`, '', `${files.length} rzc-Analysen, ${cases.length} Stations-Intervalle an ${nSt} Stationen`, '', ...[res.all, res.day, res.night].flatMap((c) => [`**${c.label}** — n ${c.n}, Blöcke ${c.blocks}`, '', '| s (mm/h) | blau n | Trefferquote (90 %) | Erfassung (90 %) | CSI |', '|---|---:|---|---|---:|', ...c.rows.map((r) => `| ${r.s === 'echo' ? 'Echo' : r.s.toFixed(2).replace('.', ',')} | ${r.blue} | ${pct(r.prec)} (${pct(r.precLo)}–${pct(r.precHi)}) | ${pct(r.pod)} (${pct(r.podLo)}–${pct(r.podHi)}) | ${pct(r.csi)} |`), ''])].join('\n');
writeFileSync(join(OUT, 'curve-ch.md'), md);
console.log(md.split('\n').slice(0, 24).join('\n'));
