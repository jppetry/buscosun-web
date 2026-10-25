#!/usr/bin/env node
/**
 * measure-ruc-f13.mjs — one-off (Jan, 24.10.2026): hourly precipitation of raw ICON-D2-RUC (station series `ruc/v1/stations`)
 * against buscosun Fusion 13 (register `fusion-12x`, replayed on the hindcast slots of the day, 8 issues/day, no radar
 * member, no anchors) at the Prüfnetz stations, truth W1 (hourly rr at the stamp H). Pairs = same station, same valid
 * stamp, same lead (RUC runs hourly, Fusion issues 3-hourly ⇒ the common pairs are the leads where issue ≡ 0 mod 3 h).
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs
 *        <scratch>/measure-ruc-f13.mjs --ruc=<dir with <run>-<cat>.png + catalog> --from=2026-10-22T23 --to=2026-10-23T22 [--out=<json>] [--noFusion]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProtocol } from 'file:///C:/dev/buscosun-web/scripts/pruefstand/lib/protokoll.mjs';
import { hindcastSlotPath, loadEngine, loadTables, predictHindcast, readHindcastSlot } from 'file:///C:/dev/buscosun-web/scripts/pruefstand/lib/replay.mjs';
import { engineRoot, loadRegister, withTablePaths } from 'file:///C:/dev/buscosun-web/scripts/pruefstand/lib/register.mjs';
import { openW1, truthValue } from 'file:///C:/dev/buscosun-web/scripts/pruefstand/lib/wahrheit.mjs';
import { decodePng } from 'file:///C:/dev/buscosun-web/scripts/lib/png.mjs';
import { RUC_STATION_STEPS, decodeRucByte, parseRucStationsFile, rucRunMs } from 'file:///C:/dev/buscosun-web/src/point/rucFormat.ts';
import { QUANTITY_VARS } from 'file:///C:/dev/buscosun-web/src/pruefstand/protokoll.ts';
import { channelsOf } from 'file:///C:/dev/buscosun-web/src/pruefstand/adapter.ts';
import { crpsQ } from 'file:///C:/dev/buscosun-web/src/pruefstand/metrics.ts';

const H = 3_600_000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const RUC_DIR = String(args.ruc);
const FROM = Date.parse(`${args.from ?? '2026-10-22T23'}:00:00Z`), TO = Date.parse(`${args.to ?? '2026-10-23T22'}:00:00Z`);
const LEADS = Array.from({ length: 12 }, (_, i) => i + 1);
const WET = 0.1;
const REG_ID = String(args.reg ?? 'fusion-12x');
const say = (...a) => console.log(...a);
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';

const proto = loadProtocol();
const stations = proto.scored;
const nSt = stations.length;

// ── RUC catalogue → Prüfnetz column ───────────────────────────────────────────
const catFile = readdirSync(RUC_DIR).find((f) => f.startsWith('catalog-'));
const cat = JSON.parse(readFileSync(join(RUC_DIR, catFile), 'utf8'));
const colOf = new Map(cat.ids.map((id, j) => [id, j]));
const rucCol = stations.map((s) => {
  const w = s.w1; if (!w) return -1;
  const id = w.net === 'cdc' ? `de:${w.id}` : w.net === 'klima' ? `at:${w.tawes ?? ''}` : w.net === 'smn' ? `ch:${w.id}` : null;
  return id != null && colOf.has(id) ? colOf.get(id) : -1;
});
say(`Prüfnetz ${nSt} Stationen, davon ${rucCol.filter((c) => c >= 0).length} in der RUC-Reihe (${cat.count} Spalten)`);

// ── RUC runs: hourly mean per (run, station, lead) ──────────────────────────────
const runs = new Map();   // runAtMs → Float32Array[nSt * 12] (NaN = missing)
for (const f of readdirSync(RUC_DIR)) {
  const pr = parseRucStationsFile(f); if (!pr) continue;
  const png = decodePng(readFileSync(join(RUC_DIR, f)));
  if (png.channels !== 1 || png.width !== cat.ids.length || png.height < RUC_STATION_STEPS) { say(`${f}: ${png.width}×${png.height}×${png.channels} passt nicht`); continue; }
  const runAt = rucRunMs(pr.run);
  const arr = new Float32Array(nSt * 12).fill(NaN);
  for (let s = 0; s < nSt; s++) {
    const j = rucCol[s]; if (j < 0) continue;
    for (let L = 1; L <= 12; L++) {
      let sum = 0, ok = true;
      for (let k = 12 * (L - 1); k < 12 * L; k++) { const v = decodeRucByte(png.data[k * png.width + j]); if (v == null) { ok = false; break; } sum += v; }
      if (ok) arr[s * 12 + L - 1] = sum / 12;
    }
  }
  runs.set(runAt, arr);
}
say(`RUC-Läufe: ${runs.size} (${[...runs.keys()].sort().map((m) => iso(m).slice(5, 13)).join(' ')})`);

// ── Fusion 13 on the hindcast slots ─────────────────────────────────────────────
const issues = new Map();   // issueMs → { med, mean, pwet, data } Float32Array[nSt*12]
const NQ = proto.quantiles.length, CH = channelsOf(NQ), VP = QUANTITY_VARS.indexOf('precip'), TAUS = proto.quantiles;
if (!args.noFusion) {
  const reg = withTablePaths(loadRegister(REG_ID));
  const root = engineRoot(reg);
  say(`Fusion: ${reg.id} (${reg.name}) · ${root.how}`);
  const eng = await loadEngine(root.root);
  const tables = loadTables(reg);
  const nq = proto.quantiles.length, ch = channelsOf(nq), vP = QUANTITY_VARS.indexOf('precip'), k50 = proto.quantiles.indexOf(0.5);
  for (let t = Math.floor((FROM - 12 * H) / (3 * H)) * 3 * H; t <= TO - H; t += 3 * H) {
    const path = hindcastSlotPath(t);
    if (!existsSync(path)) { say(`  Slot ${iso(t)} fehlt (${path})`); continue; }
    const slot = readHindcastSlot(path);
    const day0 = slot.cube.t1?.route === 'day0' || !slot.cube.t1?.run;
    if (day0) { say(`  Slot ${iso(t)}: t1 ohne Lauf — übersprungen`); continue; }
    const t0 = Date.now();
    const block = predictHindcast(eng, tables, reg, proto, slot, LEADS);
    const med = new Float32Array(nSt * 12).fill(NaN), mean = new Float32Array(nSt * 12).fill(NaN), pwet = new Float32Array(nSt * 12).fill(NaN);
    for (let s = 0; s < nSt; s++) for (let l = 0; l < 12; l++) {
      const o = (s * 12 + l) * ch + vP * nq;
      const m = block.data[o + k50]; if (!(m === m)) continue;
      let acc = 0; for (let k = 0; k < nq; k++) acc += block.data[o + k];
      med[s * 12 + l] = m; mean[s * 12 + l] = acc / nq; pwet[s * 12 + l] = block.data[(s * 12 + l) * ch + QUANTITY_VARS.length * nq];
    }
    issues.set(t, { med, mean, pwet, data: block.data });
    say(`  Slot ${iso(t)}: ${block.info.calls} Aufrufe, ${block.info.errors} Fehler, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

// ── truth W1 ───────────────────────────────────────────────────────────────────
const w1 = openW1(proto);
const stamps = []; for (let t = FROM; t <= TO; t += H) stamps.push(t);
say(`Wahrheit W1: ${stamps.length} Stempel ${iso(FROM)} … ${iso(TO)}, reif ${w1.reif(new Date(TO).toISOString().slice(0, 10))}`);

// ── pairs ───────────────────────────────────────────────────────────────────────
const rows = [];   // { s, stamp, L, truth, ruc, f13, fmean, pwet }
for (const stamp of stamps) for (let s = 0; s < nSt; s++) {
  const truth = truthValue(w1, s, stamp, 'precip', 1);
  if (!(truth === truth)) continue;
  for (const L of LEADS) {
    const issue = stamp - L * H;
    const r = runs.get(issue)?.[s * 12 + L - 1];
    const fi = issues.get(issue);
    const f13 = fi?.med[s * 12 + L - 1], fmean = fi?.mean[s * 12 + L - 1], pwet = fi?.pwet[s * 12 + L - 1];
    const hasR = r === r && r != null, hasF = f13 === f13 && f13 != null;
    if (!hasR && !hasF) continue;
    const qo = (s * 12 + L - 1) * CH + VP * NQ;
    rows.push({ s, stamp, L, truth, ruc: hasR ? r : NaN, f13: hasF ? f13 : NaN, fmean: hasF ? fmean : NaN, pwet: hasF ? pwet : NaN, qs: hasF ? fi.data.subarray(qo, qo + NQ) : null });
  }
}
say(`Zeilen: ${rows.length} (RUC ${rows.filter((r) => r.ruc === r.ruc).length}, Fusion ${rows.filter((r) => r.f13 === r.f13).length}, beide ${rows.filter((r) => r.ruc === r.ruc && r.f13 === r.f13).length})`);

function stats(sel, key) {
  const n = sel.length; if (!n) return null;
  let ae = 0, bias = 0, se = 0, hit = 0, miss = 0, fa = 0, cn = 0, truthSum = 0, fcSum = 0;
  for (const r of sel) {
    const f = r[key], o = r.truth;
    ae += Math.abs(f - o); bias += f - o; se += (f - o) ** 2; truthSum += o; fcSum += f;
    const fw = f >= WET, ow = o >= WET;
    if (fw && ow) hit++; else if (!fw && ow) miss++; else if (fw && !ow) fa++; else cn++;
  }
  const pod = hit + miss ? hit / (hit + miss) : null, far = hit + fa ? fa / (hit + fa) : null;
  const hitsRand = (hit + miss) * (hit + fa) / n, ets = (hit + miss + fa - hitsRand) ? (hit - hitsRand) / (hit + miss + fa - hitsRand) : null;
  const out = { n, mae: ae / n, bias: bias / n, rmse: Math.sqrt(se / n), pod, far, ets, truthSum, fcSum, wetObs: hit + miss };
  if (key !== 'ruc' && sel[0]?.qs) {
    // CRPS of the quantile set (the Prüfstand's score) and the wet decision by P(wet) ≥ 0,5 / ≥ 0,3 (what the product decides on)
    let crps = 0; const dec = { 0.5: [0, 0, 0], 0.3: [0, 0, 0] };
    for (const r of sel) {
      crps += crpsQ(TAUS, r.qs, r.truth);
      const ow = r.truth >= WET;
      for (const th of [0.5, 0.3]) { const fw = r.pwet >= th; if (fw && ow) dec[th][0]++; else if (!fw && ow) dec[th][1]++; else if (fw && !ow) dec[th][2]++; }
    }
    out.crps = crps / n;
    for (const th of [0.5, 0.3]) { const [h, m, f] = dec[th]; const hr = (h + m) * (h + f) / n; out[`p${th}`] = { pod: h + m ? h / (h + m) : null, far: h + f ? f / (h + f) : null, ets: (h + m + f - hr) ? (h - hr) / (h + m + f - hr) : null }; }
  }
  return out;
}
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const pc = (x) => (x == null ? '–' : (x * 100).toFixed(0) + '%');
const fmt = (st) => st ? `n=${st.n} MAE ${st.mae.toFixed(3)}${st.crps != null ? ` CRPS ${st.crps.toFixed(3)}` : ''} Bias ${st.bias >= 0 ? '+' : ''}${st.bias.toFixed(3)} RMSE ${st.rmse.toFixed(3)} POD ${pc(st.pod)} FAR ${pc(st.far)} ETS ${st.ets == null ? '–' : st.ets.toFixed(2)} Σfc/Σobs ${st.truthSum ? (st.fcSum / st.truthSum).toFixed(2) : '–'}${st['p0.5'] ? ` | P≥50%: POD ${pc(st['p0.5'].pod)} FAR ${pc(st['p0.5'].far)} ETS ${st['p0.5'].ets?.toFixed(2)} · P≥30%: POD ${pc(st['p0.3'].pod)} FAR ${pc(st['p0.3'].far)} ETS ${st['p0.3'].ets?.toFixed(2)}` : ''}` : 'n=0';

const both = rows.filter((r) => r.ruc === r.ruc && r.f13 === r.f13);
const classes = [['1–3 h', 1, 3], ['4–6 h', 4, 6], ['7–12 h', 7, 12], ['1–12 h', 1, 12]];
const lands = ['DE', 'AT', 'CH'];
const report = { from: iso(FROM), to: iso(TO), stations: nSt, rucRuns: runs.size, fusionIssues: [...issues.keys()].map(iso), rows: rows.length, pairs: both.length, wet: WET, byLead: {}, byLand: {}, byStamp: {}, top: [] };

say('\n== RUC allein (alle Zeilen mit RUC) und Fusion allein ==');
report.alone = {};
for (const [name, a, b] of classes) {
  const sr = stats(rows.filter((r) => r.ruc === r.ruc && r.L >= a && r.L <= b), 'ruc');
  const sf = stats(rows.filter((r) => r.f13 === r.f13 && r.L >= a && r.L <= b), 'f13');
  report.alone[name] = { ruc: sr, f13Median: sf };
  say(`${name.padEnd(7)} RUC     ${fmt(sr)}`); say(`${''.padEnd(7)} F13 med ${fmt(sf)}`);
}
say('\n== Wahrheit je Stempel: mittlere Rate (mm/h) und Anteil nasser Stationen (≥ 0,1) ==');
report.truthByStamp = {};
for (const stamp of stamps) {
  let n = 0, sum = 0, wet = 0;
  for (let s = 0; s < nSt; s++) { const o = truthValue(w1, s, stamp, 'precip', 1); if (o === o) { n++; sum += o; if (o >= WET) wet++; } }
  report.truthByStamp[iso(stamp)] = { n, mean: n ? sum / n : null, wetShare: n ? wet / n : null };
  say(`${iso(stamp).slice(5)}  n=${n}  Ø ${n ? (sum / n).toFixed(2) : '–'} mm/h  nass ${n ? (100 * wet / n).toFixed(0) : '–'} %`);
}

say('\n== Gemeinsame Paare (gleiche Station, gleicher Stempel, gleicher Vorlauf) ==');
for (const [name, a, b] of classes) {
  const sel = both.filter((r) => r.L >= a && r.L <= b);
  const sr = stats(sel, 'ruc'), sf = stats(sel, 'f13'), sm = stats(sel, 'fmean');
  report.byLead[name] = { ruc: sr, f13Median: sf, f13Mean: sm };
  say(`${name.padEnd(7)} RUC      ${fmt(sr)}`);
  say(`${''.padEnd(7)} F13 med  ${fmt(sf)}`);
  say(`${''.padEnd(7)} F13 mean ${fmt(sm)}`);
}
say('\n== je Land (1–12 h) ==');
for (const land of lands) {
  const sel = both.filter((r) => stations[r.s].country === land || (land === 'CH' && stations[r.s].country === 'LI'));
  const sr = stats(sel, 'ruc'), sf = stats(sel, 'f13');
  report.byLand[land] = { ruc: sr, f13Median: sf };
  say(`${land}  RUC     ${fmt(sr)}`); say(`${land}  F13 med ${fmt(sf)}`);
}
say('\n== je Stempel (1–12 h): Σ Wahrheit / Σ RUC / Σ F13 über die gemeinsamen Paare ==');
for (const stamp of stamps) {
  const sel = both.filter((r) => r.stamp === stamp);
  if (!sel.length) { report.byStamp[iso(stamp)] = null; continue; }
  const sr = stats(sel, 'ruc'), sf = stats(sel, 'f13');
  report.byStamp[iso(stamp)] = { n: sel.length, obsMean: sr.truthSum / sel.length, rucMean: sr.fcSum / sel.length, f13Mean: sf.fcSum / sel.length, maeRuc: sr.mae, maeF13: sf.mae };
  say(`${iso(stamp).slice(5)}  n=${String(sel.length).padStart(4)}  obs ${(sr.truthSum / sel.length).toFixed(2)}  RUC ${(sr.fcSum / sel.length).toFixed(2)}  F13 ${(sf.fcSum / sel.length).toFixed(2)}  MAE RUC ${sr.mae.toFixed(3)} F13 ${sf.mae.toFixed(3)}`);
}
// the wettest stations of the day (truth over the covered stamps) with the freshest common lead per stamp
say('\n== die 12 nassesten Stationen (Σ Wahrheit über die Stempel mit Paaren; Vorhersage = kleinster gemeinsamer Vorlauf je Stempel; F13 = Mittel der Verteilung, der Produktwert) ==');
const perSt = new Map();
for (const r of both) {
  const e = perSt.get(r.s) ?? (perSt.set(r.s, new Map()), perSt.get(r.s));
  const cur = e.get(r.stamp); if (!cur || r.L < cur.L) e.set(r.stamp, r);
}
const sums = [...perSt].map(([s, m]) => { let o = 0, ru = 0, f = 0, n = 0; for (const r of m.values()) { o += r.truth; ru += r.ruc; f += r.fmean; n++; } return { s, id: stations[s].id, name: stations[s].name, land: stations[s].country, n, obs: o, ruc: ru, f13: f }; }).sort((a, b) => b.obs - a.obs);
for (const x of sums.slice(0, 12)) say(`${x.id} ${x.name.padEnd(22).slice(0, 22)} ${x.land}  h=${x.n}  obs ${x.obs.toFixed(1)} mm  RUC ${x.ruc.toFixed(1)}  F13 ${x.f13.toFixed(1)}`);
report.top = sums.slice(0, 30).map((x) => ({ ...x, obs: r3(x.obs), ruc: r3(x.ruc), f13: r3(x.f13) }));
const all = sums.reduce((a, x) => ({ obs: a.obs + x.obs, ruc: a.ruc + x.ruc, f13: a.f13 + x.f13 }), { obs: 0, ruc: 0, f13: 0 });
say(`alle ${sums.length} Stationen: Σ obs ${all.obs.toFixed(0)} mm · RUC ${all.ruc.toFixed(0)} · F13 ${all.f13.toFixed(0)}`);
report.sumAll = all;

// ── reliability of P(wet) and the threshold sweep (all Fusion rows, 1–12 h) ─────────────────────
const fr = rows.filter((r) => r.pwet === r.pwet);
say(`\n== Regenchance der Fusion gegen die Wahrheit (${fr.length} Zeilen, 1–12 h): angezeigte Chance → wie oft wirklich ≥ 0,1 mm/h ==`);
report.reliability = [];
for (let b = 0; b < 10; b++) {
  const lo = b / 10, hi = (b + 1) / 10;
  const sel = fr.filter((r) => r.pwet >= lo && (b === 9 ? r.pwet <= hi : r.pwet < hi));
  const wet = sel.filter((r) => r.truth >= WET).length;
  const meanObs = sel.length ? sel.reduce((a, r) => a + r.truth, 0) / sel.length : null;
  report.reliability.push({ bin: `${lo * 100}–${hi * 100} %`, n: sel.length, obsWet: sel.length ? wet / sel.length : null, meanObsMmH: meanObs });
  say(`${String(lo * 100).padStart(3)}–${String(hi * 100).padStart(3)} %  n=${String(sel.length).padStart(6)}  nass ${sel.length ? (100 * wet / sel.length).toFixed(0).padStart(3) : '  –'} %  Ø gemessen ${meanObs == null ? '–' : meanObs.toFixed(2)} mm/h`);
}
say('\n== Schwelle auf die Regenchance: Trefferrate / Fehlalarm / ETS / Anteil „Regen gesagt" ==');
report.sweep = [];
const nWet = fr.filter((r) => r.truth >= WET).length;
for (const th of [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7]) {
  let h = 0, m = 0, f = 0;
  for (const r of fr) { const fw = r.pwet >= th, ow = r.truth >= WET; if (fw && ow) h++; else if (!fw && ow) m++; else if (fw && !ow) f++; }
  const n = fr.length, hr = (h + m) * (h + f) / n, ets = (h + m + f - hr) ? (h - hr) / (h + m + f - hr) : null;
  const said = (h + f) / n;
  report.sweep.push({ th, pod: h / (h + m), far: h + f ? f / (h + f) : null, ets, said, bias: (h + f) / (h + m) });
  say(`P ≥ ${String(th * 100).padStart(2)} %  POD ${pc(h / (h + m))}  FAR ${pc(h + f ? f / (h + f) : null)}  ETS ${ets?.toFixed(2)}  Regen gesagt ${pc(said)} (nass war ${pc(nWet / n)})  Häufigkeitsfaktor ${((h + f) / (h + m)).toFixed(2)}`);
}
if (args.out) { writeFileSync(String(args.out), JSON.stringify(report, null, 1)); say(`\n→ ${args.out}`); }
