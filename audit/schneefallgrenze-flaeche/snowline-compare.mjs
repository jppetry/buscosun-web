// Snowline comparison: buscosun Fusion map field (cube t1 snowlmt + spread) vs. weather-map method
// (T2m lapsed 6.5 K/km to station height vs. T50 of ClimaField), verified against a wet-bulb proxy at stations.
// Read-only over C:\dev\buscosun-archiv. Diagnosis only (audit/schneefallgrenze-flaeche.md).
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
const { ClimaField } = await import('../../src/ml/climaField.ts');

const ARCH = 'C:/dev/buscosun-archiv';
const WEB = 'C:/dev/buscosun-web';
const OUT = process.argv[2] ?? null;
const clima = new ClimaField(JSON.parse(fs.readFileSync(path.join(WEB, 'public/climaGrid.json'), 'utf8')));
const SENT = -32768;
const LAPSE = 0.0065;

const slotFiles = fs.readdirSync(ARCH).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  .flatMap((d) => fs.readdirSync(path.join(ARCH, d)).filter((f) => /^\d{4}\.json\.gz$/.test(f)).map((f) => path.join(ARCH, d, f)));

const truth = new Map(); // key -> Map(ms -> {t,td,ps,rr})
const meta = new Map(); // key -> {lat,lon,elev,country}
const fc = []; // {key, runAtMs, snow:[], sd:[], t2m:[], hmod:[]}
const val = (a, i, s = 1) => (a && a[i] != null && a[i] !== SENT ? a[i] * s : null);
const keyOf = (p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;

for (const f of slotFiles) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
  const sc = j.scales?.truth ?? {};
  const t1 = j.cube?.t1;
  const seenKey = new Set();
  for (const p of j.points) {
    if (p.elev == null || !Number.isFinite(p.elev)) continue;
    const key = keyOf(p);
    if (!meta.has(key)) meta.set(key, { lat: p.lat, lon: p.lon, elev: p.elev, country: p.country, name: p.name });
    const tr = j.truth?.byPoint?.[p.id];
    const src = p.country === 'AT' && tr?.tawes ? tr.tawes : p.country === 'CH' && tr?.smn ? tr.smn : tr?.poi ?? tr?.tawes ?? tr?.smn;
    if (src?.obsAtMs) {
      let m = truth.get(key); if (!m) truth.set(key, (m = new Map()));
      for (let i = 0; i < src.obsAtMs.length; i++) {
        const t = val(src.t, i, sc.t?.scale ?? 0.01), td = val(src.td, i, sc.td?.scale ?? 0.01);
        if (t == null || td == null) continue;
        const ps = val(src.ps, i, sc.ps?.scale ?? 0.1);
        const rr = val(src.rr1h, i, 0.01) ?? (src === tr?.poi ? val(src.rr1, i, 0.01) : null);
        m.set(src.obsAtMs[i], { t, td, ps, rr });
      }
    }
    const bp = t1?.byPoint?.[p.id];
    if (!bp || seenKey.has(key)) continue;
    seenKey.add(key);
    const pl = bp.planes ?? {};
    const sdEns = pl.snowlmt_sd_ens && !(bp.empty ?? []).includes('snowlmt_sd_ens') ? pl.snowlmt_sd_ens : null;
    const n = t1.leadHours.length;
    const arr = (a, s = 1) => Array.from({ length: n }, (_, i) => val(a, i, s));
    fc.push({
      key, runAtMs: Date.parse(t1.runAt), leads: t1.leadHours,
      snow: arr(pl.snowlmt), sdEns: sdEns ? arr(sdEns) : null, sdDiv: arr(pl.snowlmt_sd),
      t2m: arr(pl.t2m, 0.01), hmod: arr(pl.hModEff),
    });
  }
  process.stderr.write(`${path.basename(path.dirname(f))} pts=${j.points.length} fc=${fc.length}\n`);
}

// Wet-bulb by psychrometric bisection (over water).
const es = (T) => 6.112 * Math.exp((17.67 * T) / (T + 243.5));
function wetBulb(T, Td, p) {
  const e = es(Td);
  let lo = Td, hi = T;
  for (let k = 0; k < 40; k++) {
    const tw = (lo + hi) / 2;
    const f = es(tw) - 6.6e-4 * (1 + 0.00115 * tw) * p * (T - tw) - e;
    if (f > 0) hi = tw; else lo = tw;
  }
  return (lo + hi) / 2;
}
const pStd = (z) => 1013.25 * Math.pow(1 - 2.25577e-5 * z, 5.25588);
const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }

const BINS = [[0, 6], [7, 24], [25, 48]];
const TW_CRITS = [1.0, 0.5, 1.5];
const rows = []; // compact rows
for (const r of fc) {
  const m = truth.get(r.key); if (!m) continue;
  const mt = meta.get(r.key);
  const t50 = clima.snowT50(mt.lat, mt.lon);
  const day = Math.floor(r.runAtMs / 86400000);
  const i24 = r.leads.indexOf(24);
  for (let i = 0; i < r.leads.length; i++) {
    const L = r.leads[i];
    const ob = m.get(r.runAtMs + L * 3600000); if (!ob) continue;
    const mid = r.snow[i], sd = r.sdEns?.[i] ?? r.sdDiv[i];
    if (mid == null || r.t2m[i] == null || r.hmod[i] == null) continue;
    const p = ob.ps ?? pStd(mt.elev);
    const tw = wetBulb(ob.t, ob.td, p);
    const tW = r.t2m[i] + LAPSE * (r.hmod[i] - mt.elev);
    const jp = L > 24 && i24 >= 0 ? i24 : i;
    const tWp = r.t2m[jp] != null && r.hmod[jp] != null ? r.t2m[jp] + LAPSE * (r.hmod[jp] - mt.elev) : null;
    rows.push({
      day, L, c: mt.country, elev: mt.elev, tw, t: ob.t, wet: ob.rr != null && ob.rr >= 0.1, wetKnown: ob.rr != null,
      fSnow: mt.elev >= mid, fP: sd != null && sd > 0 ? Phi((mt.elev - mid) / sd) : (mt.elev >= mid ? 1 : 0),
      fMid: mid, fSd: sd,
      wSnow: tW <= t50, wpSnow: tWp == null ? null : tWp <= t50, t50,
    });
  }
}
process.stderr.write(`rows=${rows.length}\n`);

function score(sub, predKey, truthFn) {
  let a = 0, b = 0, c = 0, d = 0; // a hit, b false alarm, c miss, d correct neg
  for (const r of sub) { const o = truthFn(r), f = r[predKey]; if (f == null) continue; if (f && o) a++; else if (f && !o) b++; else if (!f && o) c++; else d++; }
  const n = a + b + c + d; const exp = ((a + b) * (a + c) + (c + d) * (b + d)) / n;
  return { n, acc: (a + d) / n, hss: (a + d - exp) / (n - exp), pod: a / (a + c), far: b / (a + b), bias: (a + b) / (a + c), obsRate: (a + c) / n };
}
function brier(sub, probFn, truthFn) { let s = 0, n = 0; for (const r of sub) { const p = probFn(r); if (p == null) continue; const o = truthFn(r) ? 1 : 0; s += (p - o) ** 2; n++; } return s / n; }
function bootDiff(sub, statFn, reps = 1000) {
  const days = [...new Set(sub.map((r) => r.day))]; const byDay = new Map(days.map((d) => [d, sub.filter((r) => r.day === d)]));
  const out = []; let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < reps; k++) { const s = []; for (let q = 0; q < days.length; q++) s.push(...byDay.get(days[Math.floor(rnd() * days.length)])); out.push(statFn(s)); }
  out.sort((x, y) => x - y); return [out[Math.floor(0.025 * reps)], out[Math.floor(0.975 * reps)]];
}

const report = { rows: rows.length, slots: slotFiles.length, days: [...new Set(rows.map((r) => r.day))].length, results: [] };
for (const crit of TW_CRITS) {
  const truthFn = (r) => r.tw <= crit;
  for (const wetOnly of [false, true]) {
    for (const [lo, hi] of BINS) {
      const sub = rows.filter((r) => r.L >= lo && r.L <= hi && r.tw >= crit - 4 && r.tw <= crit + 4 && (!wetOnly || r.wet));
      if (sub.length < 30) { report.results.push({ crit, wetOnly, bin: `${lo}-${hi}`, n: sub.length }); continue; }
      const F = score(sub, 'fSnow', truthFn), W = score(sub, 'wSnow', truthFn), Wp = score(sub, 'wpSnow', truthFn);
      const bF = brier(sub, (r) => r.fP, truthFn), bW = brier(sub, (r) => (r.wSnow ? 1 : 0), truthFn);
      const ciAcc = crit === 1.0 ? bootDiff(sub, (s) => score(s, 'fSnow', truthFn).acc - score(s, 'wSnow', truthFn).acc, 400) : null;
      const ciHss = crit === 1.0 ? bootDiff(sub, (s) => score(s, 'fSnow', truthFn).hss - score(s, 'wSnow', truthFn).hss, 400) : null;
      const byC = {};
      for (const c of ['DE', 'AT', 'CH']) { const s = sub.filter((r) => r.c === c); if (s.length >= 30) byC[c] = { n: s.length, F: score(s, 'fSnow', truthFn).hss, W: score(s, 'wSnow', truthFn).hss }; }
      report.results.push({ crit, wetOnly, bin: `${lo}-${hi}`, n: sub.length, F, W, Wprod: Wp, brierF: bF, brierW: bW, ciAccFminusW: ciAcc, ciHssFminusW: ciHss, byCountry: byC });
    }
  }
}
// secondary: dry-bulb truth (T <= 1.0) — favours the weather-map definition
{
  const truthFn = (r) => r.t <= 1.0;
  for (const [lo, hi] of BINS) {
    const sub = rows.filter((r) => r.L >= lo && r.L <= hi && r.t >= -3 && r.t <= 5);
    report.results.push({ crit: 'T<=1', wetOnly: false, bin: `${lo}-${hi}`, n: sub.length, F: score(sub, 'fSnow', truthFn), W: score(sub, 'wSnow', truthFn) });
  }
}
// elevation distribution of the relevant subset
const rel = rows.filter((r) => r.tw >= -3 && r.tw <= 5);
const elevs = rel.map((r) => r.elev).sort((a, b) => a - b);
report.relevantElev = { n: elevs.length, p10: elevs[Math.floor(0.1 * elevs.length)], p50: elevs[Math.floor(0.5 * elevs.length)], p90: elevs[Math.floor(0.9 * elevs.length)] };
report.stations = new Set(rel.map((r) => `${r.elev}|${r.c}`)).size;
report.wetRelevant = rel.filter((r) => r.wet).length;
// band coverage proxy: spread stats
const sds = rows.map((r) => r.fSd).filter((x) => x != null).sort((a, b) => a - b);
report.sd = { p10: sds[Math.floor(0.1 * sds.length)], p50: sds[Math.floor(0.5 * sds.length)], p90: sds[Math.floor(0.9 * sds.length)] };
const txt = JSON.stringify(report, null, 1);
if (OUT) fs.writeFileSync(OUT, txt);
console.log(txt);
