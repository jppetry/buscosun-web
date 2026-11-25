#!/usr/bin/env node
/**
 * GM-11 step 1.4 — the unseen winter 2025/26 with the frozen rules and the tables as they stand (rule: gm11-winter26-frozen.md, sha256 checked).
 * Reads the caches and the repo tables; writes only `--out`. No fitting.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm11-winter26.mjs \
 *     --truth=<gy-2526.json> --cache=<w26 forcing cache> --gm3=<gm3 cache> --gm10=<gm10/predict> --data=<static build dir> --out=<json>
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadWinters } from '../../scripts/glacier/snowcal-fit.mjs';
import { attachRadiation, scoreOf } from '../../scripts/glacier/snowcal-fit2.mjs';
import { glacierRunOf, shapeCorrOf } from '../../scripts/glacier/lib/snowcalGlaciers.mjs';
import { precipRunOf } from '../../scripts/glacier/lib/snowcal.mjs';
import { predictOf } from '../../scripts/glacier/lib/snowcalPredict.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
// the frozen rule
const frozen = readFileSync(join(HERE, 'gm11-winter26-frozen.md'));
const sha = createHash('sha256').update(frozen).digest('hex');
const want = readFileSync(join(HERE, 'gm11-winter26-frozen.sha256'), 'utf8').trim().split(/\s+/)[0];
if (sha !== want) throw new Error(`Regel geändert: ${sha} ≠ ${want}`);
const cal = J(join(REPO, 'scripts/glacier/melt-calibration.json')).fit, m = { model: 'eti', TF: cal.TF, SRF: cal.SRF };
const catalog = J(join(args.data, 'catalog.json')).glaciers, byId = new Map(catalog.map((g) => [g.id, g]));
const precip = precipRunOf(J(join(REPO, 'scripts/glacier/snow-calibration.json')), [...new Set(catalog.map((g) => g.region))]);
const ownDoc = J(join(REPO, 'scripts/glacier/snow-calibration-glaciers.json'));
const ownF = glacierRunOf(ownDoc, { factor: true }, new Set(byId.keys())), ownS = glacierRunOf(ownDoc, { factor: true, shape: true }, new Set(byId.keys()));
const predDoc = J(join(REPO, 'scripts/glacier/snow-factor-predicted-ch.json')), model = predDoc.model;
const x1 = J(join(args.gm10, 'forcing', 'x1-ch.json')).glaciers, preds = J(join(args.gm10, 'predictors-ch.json')).glaciers;
const clampOwn = (F) => Math.min(model.cal.own[1], Math.max(model.cal.own[0], F));
const truth = J(args.truth);
const tmp = mkdtempSync(join(tmpdir(), 'gm11-w26-'));
const sub = (doc, sel, name) => { const p = join(tmp, name); writeFileSync(p, JSON.stringify({ ...doc, gy: doc.gy.filter(sel) })); return p; };
const prep = (truthPath, cache) => { const { winters, fromMs, unusable } = loadWinters({ truthPath, cache }); attachRadiation(winters, (id) => J(join(cache, `rad-${id}.json`)), fromMs); return { winters, unusable }; };
const s2Of = (rec, kb) => scoreOf(rec, m, kb);
const Fland = (rec) => precip.factorOf(rec.region);

// --- Gegenprobe: winter 2025 (truth of GM-3) on the new cache against the GM-3 cache, own factor ---
const gm3Truth = J(join(args.gm3, 'truth', 'gy.json'));
const t25 = sub(gm3Truth, (o) => o.country === 'CH' && o.year === 2025 && truth.gy.some((x) => x.key === o.key && x.year === 2025), 'gy25.json');
const a = prep(t25, args.gm3), b = prep(t25, args.cache);
const probe = [];
for (const ra of a.winters) {
  const rb = b.winters.find((x) => x.key === ra.key && x.year === ra.year);
  const F = ownF.factorOf(ra.catId) ?? Fland(ra);
  probe.push({ key: ra.key, name: ra.name, a: s2Of(ra, ra.b.map(() => F)).s3, b: rb ? s2Of(rb, rb.b.map(() => F)).s3 : null });
}
const probeMax = Math.max(...probe.map((p) => (p.b == null ? Infinity : Math.abs(p.a - p.b))));
const probeOk = probe.length > 0 && probeMax <= 0.1;

// --- winter 2026 ---
const t26 = sub(truth, (o) => o.country === 'CH' && o.year === 2026, 'gy26.json');
const w = prep(t26, args.cache);
const rows = [];
for (const rec of w.winters) {
  const g = byId.get(rec.catId), FL = Fland(rec);
  const r = { key: rec.key, name: rec.name, catId: rec.catId, BW: r1(rec.b.reduce((s, x) => s + x.w * x.bw, 0)), gapT: r1(rec.gapT * 100), gapP: r1(rec.gapP * 100), s: {} };
  const put = (basis, kb, F) => { const x = s2Of(rec, kb); r.s[basis] = { F: Math.round(F * 1000) / 1000, s2: r1(x.s2), s3: r1(x.s3), s1: r1(x.s1) }; };
  put('country', rec.b.map(() => FL), FL);
  const Fo = ownF.factorOf(rec.catId);
  if (Fo != null) {
    put('own', rec.b.map(() => Fo), Fo);
    const corr = ownS.corrOf(rec.catId, rec.b.map((x) => x.z), rec.b.map((x) => x.w));
    if (corr) put('ownShape', corr.map((c) => Fo * c), Fo);
  }
  const xr = x1[rec.catId], pr = preds[rec.catId];
  if (g && xr?.x1 != null && pr) {
    const Fc = clampOwn(predictOf(model, [xr.x1, g.z[1], pr.north]));
    put('predicted', rec.b.map(() => Fc), Fc);
    const Fs = clampOwn(Math.exp(0.5 * Math.log(predictOf(model, [xr.x1, g.z[1], pr.north])) + 0.5 * Math.log(FL)));
    put('predictedShrunk', rec.b.map(() => Fs), Fs);
  }
  const tb = predDoc.glaciers[rec.catId];
  if (tb) { put('asBuilt', rec.b.map(() => tb.F), tb.F); r.basis = tb.b; }
  rows.push(r);
}

// --- references (leave one out) ---
const rep2 = J(join(args.gm3, 'report-fit2.json'));
const chKeys = new Set(gm3Truth.gy.filter((o) => o.country === 'CH').map((o) => o.key));
const ref = { country: [], own: [], ownShape: [], predicted: [], predictedShrunk: [] };
for (const r of rep2.perWinter) { if (r.country !== 'CH' || !chKeys.has(r.key)) continue; ref.country.push(Math.abs(r.V0[1])); ref.own.push(Math.abs(r.V1[1])); ref.ownShape.push(Math.abs(r.V2[1])); }
const rep10 = J(join(args.gm10, 'table-src-report.json'));
const looF = new Map(rep10.perGlacier.map((g) => [g.key, g.FC]));
const tCal = sub(gm3Truth, (o) => o.country === 'CH' && looF.has(o.key), 'gycal.json');
const c = prep(tCal, args.gm3);
for (const rec of c.winters) {
  const FC = looF.get(rec.key), FL = Fland(rec);
  ref.predicted.push(s2Of(rec, rec.b.map(() => FC)).s2);
  ref.predictedShrunk.push(s2Of(rec, rec.b.map(() => clampOwn(Math.exp(0.5 * Math.log(FC) + 0.5 * Math.log(FL))))).s2);
}
// --- verdict per basis (bootstrap of the mean, seed 2026) ---
let seed = 2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const verdict = {};
for (const basis of Object.keys(ref)) {
  const v = rows.map((r) => r.s[basis]?.s2).filter((x) => x != null);
  const R = ref[basis];
  if (!v.length || !R.length) { verdict[basis] = { n: v.length, ref: R.length, holds: null }; continue; }
  const means = [];
  for (let k = 0; k < 10_000; k++) { let s = 0; for (let i = 0; i < v.length; i++) s += R[Math.floor(rnd() * R.length)]; means.push(s / v.length); }
  means.sort((x, y) => x - y);
  const p90 = means[Math.floor(0.9 * means.length)], p10 = means[Math.floor(0.1 * means.length)];
  const m26 = mean(v);
  verdict[basis] = { n: v.length, mean2026: r1(m26), bias2026: r1(mean(rows.map((r) => r.s[basis]?.s3).filter((x) => x != null))), refN: R.length, refMean: r1(mean(R)), refP10ofMean: r1(p10), refP90ofMean: r1(p90), holds: m26 <= p90 };
}
const asBuilt = rows.filter((r) => r.s.asBuilt);
const out = {
  kind: 'gm11/winter-2026', rule: { file: 'audit/gletscher-schneemodell/gm11-winter26-frozen.md', sha256: sha }, generated: new Date().toISOString(),
  probe: { n: probe.length, maxDiffMm: r1(probeMax), ok: probeOk, rows: probe },
  unusable2026: w.unusable, scored2026: rows.length, verdict, asBuilt: { n: asBuilt.length, mean: r1(mean(asBuilt.map((r) => r.s.asBuilt.s2))), byBasis: Object.fromEntries(['own', 'predicted', 'predicted-shrunk', 'country'].map((b) => [b, (() => { const R = asBuilt.filter((r) => r.basis === b); return { n: R.length, mean: r1(mean(R.map((r) => r.s.asBuilt.s2))) }; })()])) }, rows,
};
writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, rows: rows.map((r) => `${r.name}: BW ${r.BW} | ${Object.entries(r.s).map(([k, v]) => `${k} ${v.s3}`).join(' · ')}`), probe: { ...out.probe, rows: undefined } }, null, 1));
