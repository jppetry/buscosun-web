// Phase RG — RG-1 step B: the frozen rule R-RG-1…4 (audit §4, hash in claims-frozen.sha256) applied to the extracted radar
// values and the DWD 10-min station rows. Prints the precision/POD curve per candidate threshold, the threshold per target Z,
// strata, sensitivities, hold-out; writes <out>/score.json and <out>/curve.md.
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-regenschwelle/score.mjs \
//          --extract=<dir> --cdc=<dir with rr_<id>.txt / produkt_*.txt>[,<dir2>] --out=<dir> [--blocksHours=3] [--draws=1000]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { lcg } from '../../src/pruefstand/stats.ts';

const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const EX = opt.extract ?? 'C:/dev/buscosun-radar-truth/extract';
const CDC = (opt.cdc ?? 'C:/dev/buscosun-radar-truth/cdc-trimmed,C:/dev/buscosun-radar-truth/cdc-now/2026-10-10/txt').split(',');
const OUT = opt.out ?? 'C:/dev/buscosun-web/audit/radar-regenschwelle/ergebnis';
const BLOCK_H = +(opt.blocksHours ?? 3), DRAWS = +(opt.draws ?? 1000), SEED = 12345;
const ZS = [0.8, 0.85, 0.9, 0.95];
mkdirSync(OUT, { recursive: true });

// --- load extract ---
const st = JSON.parse(readFileSync(join(EX, 'stations.json'), 'utf8')).stations;
const V = JSON.parse(readFileSync(join(EX, 'values.json'), 'utf8'));
const f32 = (s) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const slots = V.slots.map((s) => ({ ms: s.ms, nat: f32(s.nat), nat3: f32(s.nat3), rad: f32(s.rad), land: s.land, echo: s.echo, hist: s.hist })).sort((a, b) => a.ms - b.ms);
const slotByMs = new Map(slots.map((s, i) => [s.ms, i]));
const idIndex = new Map(st.map((s, i) => [s.id, i]));
const firstMs = slots[0].ms, lastMs = slots[slots.length - 1].ms;
console.log(`slots ${slots.length} ${new Date(firstMs).toISOString()} … ${new Date(lastMs).toISOString()}, stations ${st.length}, covered ${st.filter((s) => s.covered).length}`);

// --- load station rows ---
const parseMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10), +d.slice(10, 12));
const rows = new Map();   // key `${id}|${ms}` → { id, ms, rws, ind, dau, qn }
let nRows = 0;
for (const dir of CDC) for (const f of readdirSync(dir)) {
  if (!/\.txt$/.test(f) || !/rr_\d{5}|produkt_zehn/.test(f)) continue;
  const txt = readFileSync(join(dir, f), 'latin1').split(/\r?\n/);
  for (const line of txt) {
    const c = line.split(';'); if (c.length < 6 || c[0].trim() === 'STATIONS_ID') continue;
    const id = +c[0], ms = parseMs(c[1].trim());
    if (ms < firstMs + 10 * 60_000 || ms > lastMs) continue;
    const rws = +c[4], ind = +c[5], dau = +c[3], qn = +c[2];
    if (rws === -999 || !Number.isFinite(rws)) continue;
    rows.set(`${id}|${ms}`, { id, ms, rws, ind, dau, qn }); nRows++;
  }
}
console.log(`station rows in window: ${rows.size} (${nRows} read)`);

// --- cases ---
const MIN5 = 5 * 60_000;
const CAND = [...Array.from({ length: 42 }, (_, k) => (k + 1) * 0.012)];   // native steps 0,012 … 0,504
const stepOf = (mm) => Math.round(mm / 0.012);
const cases = [];   // one per (station, 10-min interval) with both analyses present and station covered
let noInd = 0;
for (const r of rows.values()) {
  const si = idIndex.get(r.id); if (si == null) continue; const s = st[si]; if (!s.covered) continue;
  const a = slotByMs.get(r.ms - MIN5), b = slotByMs.get(r.ms); if (a == null || b == null) continue;
  const A = slots[a], B = slots[b];
  if (Number.isNaN(A.nat[si]) || Number.isNaN(B.nat[si])) continue;
  const hasInd = r.ind !== -999;
  if (!hasInd) noInd++;
  const w1 = hasInd ? ((r.ind === 1 || r.ind === 3) || r.dau > 0 || r.rws >= 0.01) : null;
  // sensitivities: +5 min shift (slots t, t+5), 3×3 max, mean
  const c = slotByMs.get(r.ms + MIN5); const C = c != null ? slots[c] : null;
  cases.push({
    id: r.id, ms: r.ms, si, hasInd, w1, w2: r.rws >= 0.01, w3: r.rws >= 0.1, rws: r.rws,
    max: Math.max(A.nat[si], B.nat[si]), mean: (A.nat[si] + B.nat[si]) / 2, max3: Math.max(A.nat3[si], B.nat3[si]),
    echo: Math.max(A.rad[si], B.rad[si]) > 0,
    shift: C && !Number.isNaN(C.nat[si]) ? Math.max(B.nat[si], C.nat[si]) : NaN,
    holdout: r.id % 3 === 0, siteKm: s.siteKm, day: new Date(r.ms).getUTCHours() >= 6 && new Date(r.ms).getUTCHours() < 18,
    block: Math.floor(r.ms / (BLOCK_H * 3_600_000)),
  });
}
const nSt = new Set(cases.map((c) => c.id)).size, nStInd = new Set(cases.filter((c) => c.hasInd).map((c) => c.id)).size;
console.log(`cases ${cases.length} at ${nSt} stations (${nStInd} with indicator); W1 cases ${cases.filter((c) => c.hasInd).length}, wet W1 ${cases.filter((c) => c.w1).length}, wet W2 ${cases.filter((c) => c.w2).length}`);

// --- metrics with block bootstrap (R-RG-1: 90-% band = 5/95 quantiles; block draw as in the Prüfstand `blockBootstrap`, blocks here = time windows) ---
function blockBoot90(days, stat) {
  const n = days.length; if (n < 2) return null;
  const blk = Math.max(1, Math.round(Math.cbrt(n))), rnd = lcg(SEED), w = days[0].length, vals = [];
  for (let d = 0; d < DRAWS; d++) { const sum = new Float64Array(w); let taken = 0; while (taken < n) { const start = Math.floor(rnd() * n); for (let j = 0; j < blk && taken < n; j++, taken++) { const a = days[(start + j) % n]; for (let c = 0; c < w; c++) sum[c] += a[c]; } } const s = stat(sum); if (Number.isFinite(s)) vals.push(s); }
  if (!vals.length) return null; vals.sort((a, b) => a - b);
  const at = (f) => vals[Math.min(vals.length - 1, Math.max(0, Math.floor(f * (vals.length - 1))))];
  return { lo5: at(0.05), hi95: at(0.95), n: vals.length };
}
function curve90(sel, truth, radar, label) {
  const blocks = new Map();
  for (const x of sel) { const t = truth(x); if (t == null) continue; const v = radar(x); if (Number.isNaN(v)) continue; let b = blocks.get(x.block); if (!b) { b = new Float64Array(4 * (CAND.length + 1)); blocks.set(x.block, b); }
    for (let k = 0; k <= CAND.length; k++) { const blue = k === CAND.length ? x.echo : v >= CAND[k] - 1e-9; const o = 4 * k; if (blue && t) b[o]++; else if (blue && !t) b[o + 1]++; else if (!blue && t) b[o + 2]++; else b[o + 3]++; } }
  const days = [...blocks.values()];
  const rowsOut = [];
  for (let k = 0; k <= CAND.length; k++) {
    const o = 4 * k; const sum = [0, 0, 0, 0]; for (const d of days) for (let j = 0; j < 4; j++) sum[j] += d[o + j];
    const [h, fa, m] = sum; const prec = h / (h + fa), pod = h / (h + m), csi = h / (h + fa + m);
    const bp = blockBoot90(days, (s) => (s[o] + s[o + 1] > 0 ? s[o] / (s[o] + s[o + 1]) : NaN));
    const bq = blockBoot90(days, (s) => (s[o] + s[o + 2] > 0 ? s[o] / (s[o] + s[o + 2]) : NaN));
    rowsOut.push({ s: k === CAND.length ? 'echo' : +CAND[k].toFixed(3), hit: h, fa, miss: m, cn: sum[3], prec, precLo: bp?.lo5 ?? null, precHi: bp?.hi95 ?? null, pod, podLo: bq?.lo5 ?? null, podHi: bq?.hi95 ?? null, far: 1 - prec, csi });
  }
  return { label, n: sel.length, blocks: days.length, rows: rowsOut };
}
const pick = (c, Z) => c.rows.find((r) => r.s !== 'echo' && r.precLo != null && r.precLo >= Z)?.s ?? null;
const pickPoint = (c, Z) => c.rows.find((r) => r.s !== 'echo' && r.prec >= Z)?.s ?? null;

// blue area per candidate (domain-wide, mean over slots)
const area = CAND.map((s) => { const k = stepOf(s); let num = 0, den = 0; for (const sl of slots) { let n = 0; for (let j = k; j < 62; j++) n += sl.hist[j]; num += n / sl.land; den++; } return num / den; });
const areaEcho = slots.reduce((a, sl) => a + sl.echo / sl.land, 0) / slots.length;

const sel = cases.filter((c) => !c.holdout), hold = cases.filter((c) => c.holdout);
const W1 = (c) => c.w1, W2 = (c) => c.w2, W3 = (c) => c.w3;
const results = {
  frozen: readFileSync('C:/dev/buscosun-web/audit/radar-regenschwelle/claims-frozen.sha256', 'utf8').trim(), ranAt: new Date().toISOString(),
  window: [new Date(firstMs).toISOString(), new Date(lastMs).toISOString()], slots: slots.length, blocksHours: BLOCK_H, draws: DRAWS,
  cases: cases.length, stations: nSt, stationsInd: nStInd, selection: sel.length, holdout: hold.length,
  area: Object.fromEntries(CAND.map((s, i) => [s.toFixed(3), area[i]])), areaEcho,
  primary: curve90(sel.filter((c) => c.hasInd), W1, (c) => c.max, 'W1 · Max der zwei Analysen · Pixel · Auswahl'),
  holdoutW1: curve90(hold.filter((c) => c.hasInd), W1, (c) => c.max, 'W1 · Hold-out'),
  w2: curve90(sel, W2, (c) => c.max, 'W2 (RWS ≥ 0,01, alle Stationen) · Auswahl'),
  w2holdout: curve90(hold, W2, (c) => c.max, 'W2 · Hold-out'),
  w2ind: curve90(sel.filter((c) => c.hasInd), W2, (c) => c.max, 'W2 (RWS ≥ 0,01) NUR an den Indikator-Stationen · Auswahl'),
  w3: curve90(sel, W3, (c) => c.max, 'W3 (RWS ≥ 0,1) · Auswahl'),
  sensMean: curve90(sel.filter((c) => c.hasInd), W1, (c) => c.mean, 'W1 · Mittel statt Max'),
  sens3x3: curve90(sel.filter((c) => c.hasInd), W1, (c) => c.max3, 'W1 · Max 3×3'),
  sensShift: curve90(sel.filter((c) => c.hasInd), W1, (c) => c.shift, 'W1 · +5 min (Pluvio)'),
  strataSite: Object.fromEntries([['<50', (c) => c.siteKm < 50], ['50–100', (c) => c.siteKm >= 50 && c.siteKm < 100], ['100–150', (c) => c.siteKm >= 100]].map(([k, f]) => [k, curve90(sel.filter((c) => c.hasInd && f(c)), W1, (c) => c.max, `W1 · Standort ${k} km`)])),
  strataDay: Object.fromEntries([['Tag', (c) => c.day], ['Nacht', (c) => !c.day]].map(([k, f]) => [k, curve90(sel.filter((c) => c.hasInd && f(c)), W1, (c) => c.max, `W1 · ${k}`)])),
  strataSiteW2: Object.fromEntries([['<50', (c) => c.siteKm < 50], ['50–100', (c) => c.siteKm >= 50 && c.siteKm < 100], ['100–150', (c) => c.siteKm >= 100]].map(([k, f]) => [k, curve90(sel.filter(f), W2, (c) => c.max, `W2 · Standort ${k} km`)])),
};
results.thresholds = Object.fromEntries(ZS.map((Z) => [Z, { W1: pick(results.primary, Z), W1point: pickPoint(results.primary, Z), W1holdout: pick(results.holdoutW1, Z), W2: pick(results.w2, Z), W2holdout: pick(results.w2holdout, Z), W3: pick(results.w3, Z) }]));
writeFileSync(join(OUT, 'score.json'), JSON.stringify(results, null, 1));

// --- report ---
const pct = (x) => (x == null || Number.isNaN(x) ? '—' : (100 * x).toFixed(1).replace('.', ','));
const fmtRow = (r, i) => `| ${r.s === 'echo' ? 'Echo (heute)' : r.s.toFixed(3).replace('.', ',')} | ${r.hit + r.fa} | ${pct(r.prec)} (${pct(r.precLo)}–${pct(r.precHi)}) | ${pct(r.pod)} (${pct(r.podLo)}–${pct(r.podHi)}) | ${pct(r.far)} | ${pct(r.csi)} | ${pct(r.s === 'echo' ? areaEcho : area[i])} |`;
const table = (c) => [`**${c.label}** — n ${c.n}, Blöcke ${c.blocks}`, '', '| s (mm/h) | blau n | Trefferquote (90 %) | Erfassung (90 %) | FAR | CSI | blaue Fläche |', '|---|---:|---|---|---:|---:|---:|', ...c.rows.map(fmtRow), ''].join('\n');
const md = [`# Ergebnis RG-1 — Lauf ${results.ranAt}`, '', `Fenster ${results.window.join(' … ')}, ${slots.length} Analysen, ${cases.length} Stations-Intervalle an ${nSt} Stationen (${nStInd} mit Indikator); Auswahl ${sel.length}, Hold-out ${hold.length}; Blöcke ${BLOCK_H} h, ${DRAWS} Züge; Regel-Hash ${results.frozen.split('\n')[0]}`, '',
  '## Schwelle je Ziel Z (R-RG-1: kleinste Stufe mit Untergrenze ≥ Z)', '', '| Z | W1 Auswahl | (Punktschätzer) | W1 Hold-out | W2 Auswahl | W2 Hold-out | W3 |', '|---|---|---|---|---|---|---|',
  ...ZS.map((Z) => { const t = results.thresholds[Z]; const f = (x) => (x == null ? 'keine Stufe ≤ 0,504' : x.toFixed(3).replace('.', ',')); return `| ${pct(Z)} % | ${f(t.W1)} | ${f(t.W1point)} | ${f(t.W1holdout)} | ${f(t.W2)} | ${f(t.W2holdout)} | ${f(t.W3)} |`; }), '',
  '## Kurven', '', table(results.primary), table(results.holdoutW1), table(results.w2), table(results.w2ind), table(results.w3), table(results.sensMean), table(results.sens3x3), table(results.sensShift),
  '## Strata (W1, Auswahl)', '', ...Object.values(results.strataSite).map(table), ...Object.values(results.strataDay).map(table), '## Strata (W2, Auswahl)', '', ...Object.values(results.strataSiteW2).map(table)].join('\n');
writeFileSync(join(OUT, 'curve.md'), md);
console.log(md.split('\n').slice(0, 14).join('\n'));
console.log(`→ ${OUT}/score.json, curve.md`);
