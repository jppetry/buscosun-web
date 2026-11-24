#!/usr/bin/env node
/**
 * GM-5 A2/A3 — distribution over the glacier from the order of melt-out in the Sentinel-2 season rows, scored against the winter balance per
 * 100-m band (GLAMOS/WGMS, the truth of GM-3). Rule: gm5-method-frozen.md (hash checked below). Verdicts are computed here, never by hand.
 * Reads only: season rows (gm4\live), catalogue + hypsometry (gs view, build 20261120-1), truth (gm3\truth\gy.json). Writes gm5-distribution.json.
 * Usage: node audit/gletscher-schneemodell/gm5-distribution.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE = 'C:/dev/buscosun-glacier-cache/gm4/live';
const STATIC = 'C:/dev/buscosun-glacier-cache/gs/view/glacier/v1/static/20261120-1';
const TRUTH = 'C:/dev/buscosun-glacier-cache/gm3/truth/gy.json';
const CODE_COMMIT = 'dc982141';
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));

const methodText = readFileSync(join(HERE, 'gm5-method-frozen.md'));
const methodSha = createHash('sha256').update(methodText).digest('hex');
const frozenSha = readFileSync(join(HERE, 'gm5-method-frozen.sha256'), 'utf8').split(/\s+/)[0];
if (methodSha !== frozenSha) throw new Error(`eingefrorene Methode verändert: ${methodSha} ≠ ${frozenSha}`);

// ---------- data
const cat = new Map(rd(join(STATIC, 'catalog.json')).glaciers.map((g) => [g.id, g]));
const hypso = new Map();
for (const f of readdirSync(join(STATIC, 'hypso'))) for (const [id, h] of Object.entries(rd(join(STATIC, 'hypso', f)).glaciers)) hypso.set(id, h);
const seasons = new Map();   // id -> Map(year -> rows)
for (const y of readdirSync(join(LIVE, 'season'))) for (const reg of readdirSync(join(LIVE, 'season', y))) for (const f of readdirSync(join(LIVE, 'season', y, reg))) {
  const doc = rd(join(LIVE, 'season', y, reg, f));
  for (const [id, rows] of Object.entries(doc.glaciers)) { if (!seasons.has(id)) seasons.set(id, new Map()); seasons.get(id).set(+y, rows); }
}
const truth = rd(TRUTH).gy;

// ---------- A.1 / A.2 / A.3
const doy = (d) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${d.slice(0, 4)}-01-01T12:00:00Z`)) / 86_400_000) + 1;
/** Usable rows of a season: [doy, line] or null (fewer than 4). */
function lineRows(rows) {
  const out = [];
  for (const r of rows) {
    const m = r[0].slice(5);
    if (m < '05-01' || m > '09-30') continue;
    if (r[8] & 1) continue;
    const line = r[3] === 0 ? -Infinity : r[3] === 2 ? Infinity : r[4] ?? null;
    if (line == null) continue;
    out.push([doy(r[0]), line]);
  }
  return out.length >= 4 ? out : null;
}
function meltOutDay(lr, z) {
  const n = lr.length;
  for (let i = 0; i < n; i++) {
    if (lr[i][1] > z && (i === n - 1 || lr[i + 1][1] > z)) return i === 0 ? null : (lr[i - 1][0] + lr[i][0]) / 2;
  }
  return null;
}
/** Pattern of one season at elevations zs: { D[], r[] } or null. */
function patternOf(lr, zs) {
  const D = zs.map((z) => meltOutDay(lr, z));
  const idx = D.map((d, i) => (d == null ? -1 : i)).filter((i) => i >= 0);
  if (idx.length < 3 || zs[idx.at(-1)] - zs[idx[0]] < 150) return null;
  const mz = idx.reduce((s, i) => s + zs[i], 0) / idx.length, md = idx.reduce((s, i) => s + D[i], 0) / idx.length;
  let sxy = 0, sxx = 0;
  for (const i of idx) { sxy += (zs[i] - mz) * (D[i] - md); sxx += (zs[i] - mz) ** 2; }
  const beta = sxx > 0 ? sxy / sxx : 0, alpha = md - beta * mz;
  return { D, r: D.map((d, i) => (d == null ? null : d - alpha - beta * zs[i])), beta };
}
const bandCentres = (h) => h.a.map((v, i) => (v > 0 ? h.z0 + 50 * (i + 0.5) : null)).filter((z) => z != null);

// ---------- statistics
const rank = (a) => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
function spearman(a, b) {
  const ra = rank(a), rb = rank(b), n = a.length, ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
}
const median = (a) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const qtl = (a, q) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const p = q * (s.length - 1), i = Math.floor(p); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (p - i); };
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// =====================================================================================================================
// A2 — order and stability (50-m bands of the hypsometry, every glacier with rows)
const U = Array.from({ length: 10 }, (_, i) => 0.05 + 0.1 * i);
function onU(zs, r, zLo, zHi) {
  const pts = zs.map((z, i) => [z, r[i]]).filter((p) => p[1] != null);
  return U.map((u) => {
    const z = zLo + u * (zHi - zLo);
    if (!pts.length || z < pts[0][0] || z > pts.at(-1)[0]) return null;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i][0] === z) return pts[i][1];
      if (i + 1 < pts.length && pts[i][0] < z && z < pts[i + 1][0]) { const w = (z - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] * (1 - w) + pts[i + 1][1] * w; }
    }
    return null;
  });
}
const a2 = { seasonsWithRows: 0, seasonsUsableRows: 0, seasonsWithPattern: 0, monotone: 0, byYear: {}, byCountry: {}, glaciersWithPattern: 0, glaciersWith2Patterns: 0 };
const patU = new Map();   // id -> Map(year -> u-pattern)
const orderRho = [];
for (const [id, ys] of seasons) {
  const g = cat.get(id), h = hypso.get(id);
  if (!g || !h) continue;
  const zs = bandCentres(h), zLo = zs[0], zHi = zs.at(-1);
  let n = 0;
  const Ds = new Map();
  for (const [y, rows] of ys) {
    a2.seasonsWithRows++;
    const lr = lineRows(rows);
    if (!lr) continue;
    a2.seasonsUsableRows++;
    const p = patternOf(lr, zs);
    if (!p) continue;
    a2.seasonsWithPattern++; n++;
    a2.byYear[y] = (a2.byYear[y] ?? 0) + 1;
    a2.byCountry[g.country] = (a2.byCountry[g.country] ?? 0) + 1;
    const dd = p.D.filter((d) => d != null);
    if (dd.every((d, i) => i === 0 || d >= dd[i - 1])) a2.monotone++;
    Ds.set(y, p.D);
    if (!patU.has(id)) patU.set(id, new Map());
    patU.get(id).set(y, onU(zs, p.r, zLo, zHi));
  }
  if (n) a2.glaciersWithPattern++;
  if (n >= 2) a2.glaciersWith2Patterns++;
  const yrs = [...Ds.keys()].sort();
  for (let i = 0; i < yrs.length; i++) for (let j = i + 1; j < yrs.length; j++) {
    const A = Ds.get(yrs[i]), B = Ds.get(yrs[j]), ia = [], ib = [];
    for (let k = 0; k < A.length; k++) if (A[k] != null && B[k] != null) { ia.push(A[k]); ib.push(B[k]); }
    if (ia.length >= 4) { const r = spearman(ia, ib); if (r != null) orderRho.push(r); }
  }
}
const common = (a, b) => { const x = [], y = []; for (let i = 0; i < U.length; i++) if (a[i] != null && b[i] != null) { x.push(a[i]); y.push(b[i]); } return x.length >= 4 ? spearman(x, y) : null; };
const rhoSame = [], rhoOther = [], rhoSameByPair = {};
const ids = [...patU.keys()].sort();
const years = [2023, 2024, 2025, 2026];
for (let i = 0; i < years.length; i++) for (let j = i + 1; j < years.length; j++) {
  const y1 = years[i], y2 = years[j];
  const have = ids.filter((id) => patU.get(id).has(y1) && patU.get(id).has(y2));
  const key = `${y1}-${y2}`; rhoSameByPair[key] = { glaciers: have.length, same: [], other: [] };
  for (const a of have) {
    const s = common(patU.get(a).get(y1), patU.get(a).get(y2));
    if (s != null) { rhoSame.push(s); rhoSameByPair[key].same.push(s); }
    for (const b of have) { if (a === b) continue; const o = common(patU.get(a).get(y1), patU.get(b).get(y2)); if (o != null) { rhoOther.push(o); rhoSameByPair[key].other.push(o); } }
  }
}
const pairSummary = Object.fromEntries(Object.entries(rhoSameByPair).map(([k, v]) => [k, { glaciers: v.glaciers, sameN: v.same.length, sameMedian: median(v.same), otherN: v.other.length, otherMedian: median(v.other) }]));
const ordMonShare = a2.seasonsWithPattern ? a2.monotone / a2.seasonsWithPattern : null;
const ordMed = median(orderRho);
const mSame = median(rhoSame), mOther = median(rhoOther);
const verdictA2order = ordMonShare === 1 && ordMed != null && ordMed >= 0.99 ? 'Reihenfolge = Höhe' : 'Reihenfolge trägt mehr als die Höhe';
const verdictA2stab = mSame == null ? 'nicht messbar' : mSame >= 0.5 && mSame - mOther >= 0.2 ? 'stabil' : mSame - mOther >= 0.1 ? 'schwach' : 'nicht stabil';

// =====================================================================================================================
// A3 — against the winter balance per 100-m band
const seasonResAt = new Map();   // id -> Map(year -> Map(zCentre -> r))
function resAt(id, zs) {
  const out = new Map();
  for (const [y, rows] of seasons.get(id) ?? []) {
    const lr = lineRows(rows); if (!lr) continue;
    const p = patternOf(lr, zs); if (!p) continue;
    out.set(y, new Map(zs.map((z, i) => [z, p.r[i]])));
  }
  return out;
}
const gws = [];   // scored glacier-winters
const skipped = {};
const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };
for (const w of truth) {
  const g = cat.get(w.catId);
  if (!g) { skip('nicht im Katalog'); continue; }
  if (g.klass !== 'A') { skip(`Klasse ${g.klass}`); continue; }
  const bins = w.bins.filter((b) => b.area > 0 && Number.isFinite(b.bw)).sort((a, b) => a.z0 - b.z0);
  if (bins.length < 3) { skip('weniger als 3 Stufen'); continue; }
  const A = bins.reduce((s, b) => s + b.area, 0), bwm = bins.reduce((s, b) => s + b.area * b.bw, 0) / A;
  if (!(bwm > 100)) { skip('Mittel ≤ 100 mm'); continue; }
  const zs = bins.map((b) => (b.z0 + b.z1) / 2), a = bins.map((b) => b.area), d = bins.map((b) => b.bw / bwm - 1);
  if (!seasonResAt.has(w.catId + '|' + zs.join(','))) seasonResAt.set(w.catId + '|' + zs.join(','), resAt(w.catId, zs));
  const res = seasonResAt.get(w.catId + '|' + zs.join(','));
  const use = [...res.keys()].filter((y) => y !== w.year);
  if (!use.length) { skip(res.size ? 'nur die Saison desselben Jahres' : 'keine brauchbare Saison'); continue; }
  const s = zs.map((z) => { const v = use.map((y) => res.get(y).get(z)).filter((x) => x != null); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; });
  if (s.filter((x) => x != null).length < 3) { skip('weniger als 3 Stufen mit Rest'); continue; }
  // L3 through the truth's own three anchors
  const zt = zs[0], zh = zs.at(-1), zm = Math.min(zh, Math.max(zt, w.zMed));
  const interp = (xs, ys, x) => { if (x <= xs[0]) return ys[0]; for (let i = 0; i + 1 < xs.length; i++) if (x <= xs[i + 1]) { const t = (x - xs[i]) / (xs[i + 1] - xs[i]); return ys[i] * (1 - t) + ys[i + 1] * t; } return ys.at(-1); };
  const dm = interp(zs, d, zm), dt = d[0], dh = d.at(-1);
  const L3 = zs.map((z) => (z <= zm ? (zm > zt ? dt + ((dm - dt) * (z - zt)) / (zm - zt) : dm) : (zh > zm ? dm + ((dh - dm) * (z - zm)) / (zh - zm) : dm)));
  const C1 = zs.map((z) => (zh > zt ? dt + ((dh - dt) * (z - zt)) / (zh - zt) : dt));
  const s0 = s.map((x) => x ?? 0), sm = s0.reduce((p, x, i) => p + a[i] * x, 0) / A, st = s0.map((x) => x - sm);
  gws.push({ id: w.catId, name: w.name, country: w.country, year: w.year, zs, a, A, bwm, d, L3, C1, st, zt, zh, seasons: use });
}
const errOf = (gw, pred) => gw.bwm * Math.sqrt(gw.a.reduce((p, ai, i) => p + ai * (pred[i] - gw.d[i]) ** 2, 0) / gw.A);
const kFit = (list) => { let num = 0, den = 0; for (const gw of list) for (let i = 0; i < gw.zs.length; i++) { num += gw.a[i] * gw.st[i] * (gw.d[i] - gw.L3[i]); den += gw.a[i] * gw.st[i] ** 2; } return den > 0 ? num / den : 0; };
const glacierIds = [...new Set(gws.map((x) => x.id))].sort();
const kLGO = new Map(glacierIds.map((id) => [id, kFit(gws.filter((x) => x.id !== id))]));
const kAll = kFit(gws);
// V2 donor: next glacier in the id order (cyclic), its season pattern averaged over all its seasons ≠ Y, laid on the receiver's normalized elevation
const donorOf = new Map(glacierIds.map((id, i) => [id, glacierIds[(i + 1) % glacierIds.length]]));
const byIdYear = new Map(gws.map((x) => [`${x.id}|${x.year}`, x]));
function donorPattern(gw) {
  const did = donorOf.get(gw.id);
  const cands = gws.filter((x) => x.id === did);
  if (!cands.length) return null;
  const ref = cands.reduce((p, x) => (Math.abs(x.year - gw.year) < Math.abs(p.year - gw.year) ? x : p));
  const uD = ref.zs.map((z) => (z - ref.zt) / Math.max(1, ref.zh - ref.zt));
  const out = gw.zs.map((z) => { const u = (z - gw.zt) / Math.max(1, gw.zh - gw.zt); if (u <= uD[0]) return ref.st[0]; for (let i = 0; i + 1 < uD.length; i++) if (u <= uD[i + 1]) { const t = (u - uD[i]) / (uD[i + 1] - uD[i]); return ref.st[i] * (1 - t) + ref.st[i + 1] * t; } return ref.st.at(-1); });
  const m = out.reduce((p, x, i) => p + gw.a[i] * x, 0) / gw.A;
  return out.map((x) => x - m);
}
function persistent(gw) {
  const others = gws.filter((x) => x.id === gw.id && x.year !== gw.year && x.zs.join(',') === gw.zs.join(','));
  if (others.length < 3) return null;
  const r = gw.zs.map((_, i) => others.reduce((p, x) => p + (x.d[i] - x.L3[i]), 0) / others.length);
  const m = r.reduce((p, x, i) => p + gw.a[i] * x, 0) / gw.A;
  return r.map((x) => x - m);
}
for (const gw of gws) {
  const k = kLGO.get(gw.id);
  gw.k = k;
  gw.E = { V0: errOf(gw, gw.L3), V1: errOf(gw, gw.L3.map((v, i) => v + k * gw.st[i])), C0: errOf(gw, gw.d.map(() => 0)), C1: errOf(gw, gw.C1) };
  const dp = donorPattern(gw); gw.E.V2 = dp ? errOf(gw, gw.L3.map((v, i) => v + k * dp[i])) : null;
  const pp = persistent(gw); gw.E.V3 = pp ? errOf(gw, gw.L3.map((v, i) => v + pp[i])) : null;
}
const meanOf = (list, key) => { const v = list.map((x) => x.E[key]).filter((x) => x != null); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
function scoreSet(list) {
  if (!list.length) return null;
  const m = Object.fromEntries(['V0', 'V1', 'V2', 'C0', 'C1'].map((k) => [k, meanOf(list, k)]));
  const v3list = list.filter((x) => x.E.V3 != null);
  return { glacierWinters: list.length, glaciers: new Set(list.map((x) => x.id)).size, meanErrMm: m, gainV1: 1 - m.V1 / m.V0, gainV2: 1 - m.V2 / m.V0,
    v3: v3list.length ? { glacierWinters: v3list.length, V0: meanOf(v3list, 'V0'), V3: meanOf(v3list, 'V3'), gain: 1 - meanOf(v3list, 'V3') / meanOf(v3list, 'V0') } : null };
}
const all = scoreSet(gws);
// bootstrap over glaciers
const rnd = mulberry(42), boot = [];
for (let b = 0; b < 1000; b++) {
  const pick = []; for (let i = 0; i < glacierIds.length; i++) pick.push(glacierIds[Math.floor(rnd() * glacierIds.length)]);
  const list = pick.flatMap((id) => gws.filter((x) => x.id === id));
  boot.push(1 - meanOf(list, 'V1') / meanOf(list, 'V0'));
}
const bootP10 = qtl(boot, 0.1), bootP90 = qtl(boot, 0.9);
const reasons = [];
if (!(all.gainV1 >= 0.05)) reasons.push(`Gewinn V1 ${(100 * all.gainV1).toFixed(1)} % < 5 %`);
if (!(bootP10 > 0)) reasons.push(`p10 des Gewinns ${(100 * bootP10).toFixed(1)} % ≤ 0`);
if (!(all.gainV2 < all.gainV1 / 2)) reasons.push(`Negativkontrolle V2 ${(100 * all.gainV2).toFixed(1)} % nicht unter der Hälfte von V1`);
if (!(kAll > 0)) reasons.push(`gemeinsames k ${kAll.toExponential(2)} ≤ 0 (falsches Vorzeichen)`);
const verdictA3 = reasons.length ? 'trägt nicht' : 'trägt';
// pooled correlation of satellite residual and truth residual (descriptive)
const px = [], py = [];
for (const gw of gws) for (let i = 0; i < gw.zs.length; i++) { px.push(gw.st[i]); py.push(gw.d[i] - gw.L3[i]); }
const pearson = (x, y) => { const n = x.length, mx = x.reduce((p, q) => p + q, 0) / n, my = y.reduce((p, q) => p + q, 0) / n; let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };

const out = {
  kind: 'gm5/distribution', generated: new Date().toISOString(), codeCommit: CODE_COMMIT, dataRepoCommit: readFileSync(join(LIVE, 'COMMIT'), 'utf8').trim(), static: '20261120-1',
  method: { file: 'audit/gletscher-schneemodell/gm5-method-frozen.md', sha256: methodSha },
  A2: { counts: a2, monotoneShare: ordMonShare, orderSpearman: { pairs: orderRho.length, median: ordMed, p10: qtl(orderRho, 0.1) }, verdictOrder: verdictA2order,
    stability: { sameN: rhoSame.length, sameMedian: mSame, sameP10: qtl(rhoSame, 0.1), sameP90: qtl(rhoSame, 0.9), otherN: rhoOther.length, otherMedian: mOther, byYearPair: pairSummary }, verdictStability: verdictA2stab },
  A3: { skipped, kAll, kLGO: { median: median([...kLGO.values()]), min: Math.min(...kLGO.values()), max: Math.max(...kLGO.values()) }, pooledPearson: pearson(px, py),
    all, bootstrap: { n: 1000, seed: 42, p10: bootP10, p90: bootP90 },
    recent: scoreSet(gws.filter((x) => x.year >= 2023)), CH: scoreSet(gws.filter((x) => x.country === 'CH')), AT: scoreSet(gws.filter((x) => x.country === 'AT')),
    verdict: verdictA3, reasons,
    perGlacier: glacierIds.map((id) => { const l = gws.filter((x) => x.id === id); return { id, name: l[0].name, winters: l.length, seasons: [...new Set(l.flatMap((x) => x.seasons))].sort(), k: kLGO.get(id), V0: meanOf(l, 'V0'), V1: meanOf(l, 'V1'), V3: meanOf(l, 'V3') }; }) },
};
writeFileSync(join(HERE, 'gm5-distribution.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ A2: { counts: a2, monotoneShare: ordMonShare, order: out.A2.orderSpearman, verdictOrder: verdictA2order, stability: { ...out.A2.stability, byYearPair: undefined }, verdictStability: verdictA2stab, byYearPair: pairSummary },
  A3: { skipped, kAll, kLGO: out.A3.kLGO, pooledPearson: out.A3.pooledPearson, all, boot: out.A3.bootstrap, recent: out.A3.recent, CH: out.A3.CH, AT: out.A3.AT, verdict: verdictA3, reasons } }, null, 1));
