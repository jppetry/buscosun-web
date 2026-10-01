/**
 * conf-monotonie.mjs — the confidence score of buscosun Fusion 6 against the truth of the archive (the AP9 check the design
 * asked for: "Score-Dezile monoton gegen CRPS", audit/fusion-implementierung.md §2.2 / §9.8).
 *
 * Runs the client chain of the stage `fs` (`fuseCubePoint`, options as variant P5 of `stack-extract.mjs`: learned, learnedSpeed,
 * learnedPrecip, learnedAtPoint, priorShrink:false, learnedClouds, stationValue) with the Fit-5e tables WITH cloud atoms (AX-4) and
 * the station-value table with country parameters (AX-5) — i.e. the tables of buscosun Fusion 6 — on archive slots, mode S
 * (point = station), fold tables per issue day (leave-out like the scorers). Per native step and variable it records the score with
 * its three factors, σ_post, CRPS and |p50 − y| and writes:
 *   • the distribution of the score per variable and lead bin (p10/p50/p90, share < 0,5 / < 0,7),
 *   • the mean of each factor per variable and bin,
 *   • score deciles against mean CRPS and MAE (monotonicity), Spearman ρ of score / spread / agree / lage / −σ_post against CRPS.
 * Nothing here changes a product; read-only on the archive and the fit tables.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-konfidenz/conf-monotonie.mjs
 *       [--slotsFrom=2026-09-16] [--slotsTo=2026-09-28] [--every=2] [--limitPoints=N] [--out=audit/fusion-konfidenz/monotonie.md]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { HINDCAST_ROOT, parseArgs } from '../../scripts/hindcast/lib/common.mjs';
import { foldKeyFV, readArchiveSlot, archiveSeries, archiveStation, archiveNowcast, archiveTruth, archiveObs, losoClimaProduct, inputFromArchive } from '../../scripts/fusionfit/lib/archiveAdapter.mjs';
import { scoreDist } from '../../scripts/fusionfit/lib/distScore.mjs';
import { siteOf } from '../../scripts/fusionfit/lib/rowFeatures.mjs';
import { fuseCubePoint } from '../../src/pointForecast/cubeSource.ts';
import { ClimaField } from '../../src/ml/climaField.ts';
import { validateTables } from '../../src/point/fusionFit/tables.ts';
import { validateStackTable } from '../../src/pointForecast/fusion/stationValue.ts';
import { lcg } from '../../src/point/calibFit.ts';

const H = 3_600_000;
const flags = parseArgs(process.argv.slice(2));
const ARCH = typeof flags.archive === 'string' ? flags.archive : 'C:/dev/buscosun-archiv';
const slotsFrom = typeof flags.slotsFrom === 'string' ? flags.slotsFrom : '2026-09-16';
const slotsTo = typeof flags.slotsTo === 'string' ? flags.slotsTo : '2026-09-28';
const every = Number(flags.every) || 2;
const limitPoints = Number(flags.limitPoints) || Infinity;
const out = typeof flags.out === 'string' ? flags.out : new URL('./monotonie.md', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TABLES = typeof flags.tables === 'string' ? flags.tables : join(HINDCAST_ROOT, 'fit', '2026-09-30-ax4', 'fusion.ax4.json');
const STACK = typeof flags.stack === 'string' ? flags.stack : join(HINDCAST_ROOT, 'fit', '2026-09-30-ax5', 'stack.archive.json');
const HINDCAST_END_MS = Date.parse('2026-09-21T23:59:59.999Z');
const say = (s) => console.log(`[conf-monotonie] ${s}`);

// ── tables of buscosun Fusion 6 ────────────────────────────────────────────────
const tb = readFileSync(TABLES); const T = JSON.parse(tb.toString('utf8'));
{ const e = validateTables(T); if (e.length) throw new Error(`${TABLES}: ${e.join('; ')}`); }
if (!T.atoms || !Object.keys(T.atoms).length) throw new Error(`${TABLES}: keine Atome`);
const sb = readFileSync(STACK); const stackTable = JSON.parse(sb.toString('utf8'));
{ const e = validateStackTable(stackTable); if (e.length) throw new Error(`${STACK}: ${e.join('; ')}`); }
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
say(`Tabellen ${sha(tb)} (${Object.keys(T.atoms).length} Atome) · Stationswert ${sha(sb)} (${Object.keys(stackTable.entries).length} Einträge)`);
const foldCache = new Map();
const foldTables = (key) => {
  if (key == null) return T;
  if (foldCache.has(key)) return foldCache.get(key);
  const mean = {}, occurrence = {}, atoms = {};
  for (const [k, e] of Object.entries(T.mean)) mean[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  for (const [k, e] of Object.entries(T.occurrence)) occurrence[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  for (const [k, e] of Object.entries(T.atoms)) atoms[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  const t = { ...T, mean, occurrence, atoms }; foldCache.set(key, t); return t;
};
const key5e = (issueMs, validMs) => foldKeyFV(T.inputs?.foldScheme === 'half' ? 'half' : 'month', issueMs, validMs, HINDCAST_END_MS);
const OPTS = Object.freeze({ hourly: false, tail: false, learned: true, learnedSpeed: true, learnedPrecip: true, learnedAtPoint: true, priorShrink: false, learnedClouds: true, stationValue: true });

// ── points and slots ───────────────────────────────────────────────────────────
const feat = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'features', 'points.v1.json'), 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('../../public/climaGrid.json', import.meta.url), 'utf8')));
const DACH = new Set(['DE', 'AT', 'CH', 'LI']);
const pointIds = Object.keys(feat.byPoint).filter((id) => DACH.has(feat.byPoint[id].country) && !feat.byPoint[id].flags.includes('noTerrain')).sort();
const sites = new Map(pointIds.map((id) => [id, siteOf(feat.byPoint[id])]));
const countryOf = (id) => feat.byPoint[id]?.country ?? null;
const allSlots = [];
for (const d of readdirSync(ARCH).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x <= slotsTo).sort()) for (const f of readdirSync(join(ARCH, d)).filter((x) => /^\d{4}\.json\.gz$/.test(x)).sort()) allSlots.push(join(ARCH, d, f));
// pass 1: the truth of every slot ≤ slotsTo (the truth of an issue day lives in the slots after it)
const truth = new Map();
for (const p of allSlots) {
  const s = readArchiveSlot(p);
  for (const [id, rec] of archiveTruth(s, countryOf)) for (const r of rec.rows) { const k = `${id}|${r.ms}`, prev = truth.get(k); if (prev) { for (const x of Object.keys(r)) if (prev[x] == null && r[x] != null) prev[x] = r[x]; continue; } truth.set(k, { ...r }); }
}
const issue = allSlots.filter((p) => p.replace(/\\/g, '/').split('/').slice(-2)[0] >= slotsFrom).filter((_, i) => i % every === 0);
say(`${allSlots.length} Slots gelesen (Wahrheit ${truth.size} Paare), ${issue.length} Ausgabe-Slots (jeder ${every}.), ${pointIds.length} DACH-Punkte`);

// ── rows ───────────────────────────────────────────────────────────────────────
const VARS = { t: ['temperature', 'temperature', 't'], td: ['dewpoint', 'dewPoint', 'td'], ws: ['wind', 'windSpeed', 'ff'], gust: ['gust', 'gust', 'fxh'], clct: ['clouds', 'clouds', 'n'] };
const BINS = [[1, 6], [7, 24], [25, 48], [49, 120], [121, 240], [241, 336]];
const binOf = (h) => BINS.findIndex(([a, b]) => h >= a && h <= b);
const rows = [];   // { v, bin, score, spread, agree, lage, sigma, kind, crps, ae, flags }
const rnd = lcg(20260930);
const counts = { engineRuns: 0, pointSlots: 0, noConf: 0, errors: [] };
const T0 = Date.now();
for (const p of issue) {
  const s = readArchiveSlot(p);
  const slotAtMs = s.slotAtMs, floorMs = Math.floor(slotAtMs / H) * H;
  const truthSlot = archiveTruth(s, countryOf);
  const window = { fromMs: floorMs, toMs: floorMs + 336 * H, stepH: 1 };
  const latestObsRec = (id) => { const tr = truthSlot.get(id); if (!tr) return null; let best = null; for (const r of tr.rows) if (r.ms <= slotAtMs && r.t != null && (!best || r.ms > best.ms)) best = r; return best; };
  let n = 0;
  for (const id of pointIds) {
    if (n >= limitPoints) break;
    const row = feat.byPoint[id], hTrue = row.elevM;
    const cube = {};
    for (const t of ['t1', 't2', 't3']) { const ser = archiveSeries(s, t, id); if (ser) cube[t] = ser; }
    if (!Object.keys(cube).length) continue;
    n += 1; counts.pointSlots += 1;
    const nc = archiveNowcast(s, id);
    const stn = archiveStation(s, id, hTrue);
    const rec = latestObsRec(id);
    const obs0 = archiveObs(s, truthSlot.get(id), row);
    const obs = obs0 && obs0.length && rec ? obs0.map((o) => ({ ...o, dewPoint: rec.td ?? null, gust: rec.fxh ?? null })) : obs0;
    const lc5 = losoClimaProduct(T, row);
    const base = { cube, station: stn.series, stationReason: stn.reason, nowcast: nc.nowcast, covering: nc.covering, obs, clima, nowMs: slotAtMs, window, learnedClima: lc5, stack: stackTable };
    const keys = [...new Set(Object.values(cube).flatMap((ser) => ser.steps.filter((x) => x.validAtMs > floorMs).map((x) => key5e(slotAtMs, x.validAtMs))))];
    const byKey = new Map();
    for (const k of keys) {
      counts.engineRuns += 1;
      try { byKey.set(k, new Map((fuseCubePoint(inputFromArchive(s, row, { ...base, learned: foldTables(k) }), OPTS).steps ?? []).map((st) => [st.validAtMs, st]))); }
      catch (e) { if (counts.errors.length < 20) counts.errors.push(`${s.slotAt} ${id}: ${e?.message ?? e}`); }
    }
    const first = byKey.values().next().value;
    if (!first) continue;
    for (const V of first.keys()) {
      const st = byKey.get(key5e(slotAtMs, V))?.get(V);
      if (!st || st.interpolated || !['t1', 't2', 't3'].includes(st.tier) || !st.fused) continue;
      const leadH = Math.round((V - floorMs) / H), bin = binOf(leadH);
      if (bin < 0) continue;
      const tr = truth.get(`${id}|${V}`);
      if (!tr) continue;
      for (const [v, [uv, fv, ty]] of Object.entries(VARS)) {
        const y = tr[ty]; if (y == null || !Number.isFinite(y)) continue;
        const dist = st.fused[fv]?.dist; if (!dist) continue;
        const u = st.uncertainty?.[uv];
        const c = u?.confidence;
        if (!c) { counts.noConf += 1; continue; }
        let sc; try { sc = scoreDist(dist, y, rnd(), 96); } catch { continue; }
        if (!sc) continue;
        rows.push({ v, bin, score: c.score, spread: c.spread, agree: c.agree, lage: c.lage, sigma: u.sigmaPost, kind: u.sigmaKind, crps: sc.crps, ae: Math.abs(sc.point - y), country: countryOf(id), flags: st.flags });
      }
    }
  }
  say(`${s.slotAt} fertig — ${rows.length} Zeilen, ${counts.engineRuns} Läufe, ${Math.round((Date.now() - T0) / 1000)} s`);
}

// ── statistics ─────────────────────────────────────────────────────────────────
const q = (xs, p) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); const i = (a.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const ranks = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1; } return r; };
const spearman = (xs, ys) => { if (xs.length < 10) return null; const rx = ranks(xs), ry = ranks(ys); const mx = mean(rx), my = mean(ry); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < xs.length; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null; };
const pc = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`);
const f2 = (x, d = 2) => (x == null ? '—' : x.toFixed(d));
const r3 = (x) => (x == null ? '—' : x.toFixed(3));
const LAB = { t: 'T', td: 'Td', ws: 'Wind', gust: 'Böe', clct: 'Bewölkung' };
const BLAB = BINS.map(([a, b]) => `${a}–${b} h`);
const md = [`# Konfidenz-Score von buscosun Fusion 6 gegen die Wahrheit des Archivs`, '', `Stand ${new Date().toISOString().slice(0, 16)}Z. Kette der Stufe fs (Optionen ${Object.entries(OPTS).filter(([, v]) => v !== false).map(([k, v]) => (v === true ? k : `${k}:${v}`)).join(', ')}, priorShrink:false), Tabellen \`${TABLES}\` (${sha(tb)}) und \`${STACK}\` (${sha(sb)}), Falten-Tabellen je Ausgabetag, Modus S (Punkt = Station). Ausgabe-Slots ${slotsFrom} … ${slotsTo}, jeder ${every}.: **${issue.length} Slots, ${counts.pointSlots} Punkt-Slots, ${counts.engineRuns} Motorläufe, ${rows.length} Zeilen** (native Schritte t1/t2/t3 mit Wahrheit); ohne Konfidenz ${counts.noConf}; Fehler ${counts.errors.length}. CRPS und Punktfehler aus \`distScore.mjs\` (Rice n = 96). Indikativ (13 Ausgabetage, Sommer), keine Genauigkeitsaussage über die Vorhersage — nur über den Score.`, ''];
md.push('## 1 Verteilung des Scores je Größe und Vorlauf-Bin', '', '| Größe | Bin | n | p10 | p50 | p90 | Anteil < 0,5 | Anteil < 0,7 | Ø Schärfe | Ø Einigkeit | Ø Lage | Ø σ_post |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const v of Object.keys(VARS)) for (let b = 0; b < BINS.length; b++) {
  const rs = rows.filter((r) => r.v === v && r.bin === b); if (!rs.length) continue;
  const sc = rs.map((r) => r.score);
  md.push(`| ${LAB[v]} | ${BLAB[b]} | ${rs.length} | ${pc(q(sc, 0.1))} | ${pc(q(sc, 0.5))} | ${pc(q(sc, 0.9))} | ${pc(sc.filter((x) => x < 0.5).length / sc.length)} | ${pc(sc.filter((x) => x < 0.7).length / sc.length)} | ${pc(mean(rs.map((r) => r.spread)))} | ${pc(mean(rs.map((r) => r.agree)))} | ${pc(mean(rs.map((r) => r.lage)))} | ${f2(mean(rs.map((r) => r.sigma)))} |`);
}
md.push('', '## 2 Score-Dezile gegen CRPS und Punktfehler (alle Bins zusammen, je Größe)', '', 'Monotonie heißt: ein höherer Score ⇒ kleinerer Fehler. Dezil 1 = die 10 % niedrigsten Scores.', '');
for (const v of Object.keys(VARS)) {
  const rs = rows.filter((r) => r.v === v).sort((a, b) => a.score - b.score); if (rs.length < 100) continue;
  md.push(`**${LAB[v]}** (n = ${rs.length})`, '', '| Dezil | Score-Bereich | Ø CRPS | Ø \\|p50 − y\\| | Ø σ_post |', '|---|---|---|---|---|');
  const D = 10; let viol = 0, prev = null;
  for (let d = 0; d < D; d++) {
    const part = rs.slice(Math.floor((d * rs.length) / D), Math.floor(((d + 1) * rs.length) / D));
    const c = mean(part.map((r) => r.crps));
    if (prev != null && c > prev + 1e-9) viol += 1; prev = c;
    md.push(`| ${d + 1} | ${pc(part[0].score)} – ${pc(part[part.length - 1].score)} | ${f2(c, 3)} | ${f2(mean(part.map((r) => r.ae)), 3)} | ${f2(mean(part.map((r) => r.sigma)))} |`);
  }
  md.push('', `Verletzungen der Monotonie (CRPS steigt zum nächsten Dezil): **${viol} von 9**.`, '');
}
md.push('## 3 Rangkorrelation (Spearman ρ) mit dem CRPS — je Größe und Bin', '', 'Negativ = gut (höherer Score, kleinerer Fehler). Zum Vergleich die Faktoren einzeln und die reine Streuung σ_post (positiv erwartet: größere σ, größerer Fehler).', '', '| Größe | Bin | n | ρ(Score) | ρ(Schärfe) | ρ(Einigkeit) | ρ(Lage) | ρ(σ_post) |', '|---|---|---|---|---|---|---|---|');
for (const v of Object.keys(VARS)) {
  for (let b = -1; b < BINS.length; b++) {
    const rs = rows.filter((r) => r.v === v && (b < 0 || r.bin === b)); if (rs.length < 30) continue;
    const y = rs.map((r) => r.crps);
    md.push(`| ${LAB[v]} | ${b < 0 ? '**alle**' : BLAB[b]} | ${rs.length} | ${r3(spearman(rs.map((r) => r.score), y))} | ${r3(spearman(rs.map((r) => r.spread), y))} | ${r3(spearman(rs.map((r) => r.agree), y))} | ${r3(spearman(rs.map((r) => r.lage), y))} | ${r3(spearman(rs.map((r) => r.sigma), y))} |`);
  }
}
md.push('', '## 4 Einigkeit nach σ-Art und Land', '', '| Größe | σ-Art | n | Ø Einigkeit | Anteil Einigkeit = 0 | Ø Score |', '|---|---|---|---|---|---|');
for (const v of Object.keys(VARS)) for (const k of ['learned', 'divergence', 'ensemble', 'sys-only']) { const rs = rows.filter((r) => r.v === v && r.kind === k); if (rs.length) md.push(`| ${LAB[v]} | ${k} | ${rs.length} | ${pc(mean(rs.map((r) => r.agree)))} | ${pc(rs.filter((r) => r.agree === 0).length / rs.length)} | ${pc(mean(rs.map((r) => r.score)))} |`); }
md.push('', '| Land | n (T) | Ø Score T | Ø Lage T | Anteil Lage < 1 | häufigste Lage-Flags |', '|---|---|---|---|---|---|');
for (const cc of ['DE', 'AT', 'CH']) {
  const rs = rows.filter((r) => r.v === 't' && (r.country === cc || (cc === 'CH' && r.country === 'LI'))); if (!rs.length) continue;
  const fl = {}; for (const r of rs) for (const f of r.flags) if (['extrapolatedBelowModel', 'inversionBody', 'chunkBorderTruncated', 'nowcastFallbackModel'].includes(f)) fl[f] = (fl[f] ?? 0) + 1;
  md.push(`| ${cc} | ${rs.length} | ${pc(mean(rs.map((r) => r.score)))} | ${pc(mean(rs.map((r) => r.lage)))} | ${pc(rs.filter((r) => r.lage < 1).length / rs.length)} | ${Object.entries(fl).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pc(n / rs.length)}`).join(' · ') || '—'} |`);
}
// ── E-KF-3: class thresholds — the score percentiles P20/P40/P60/P80 per variable over every bin (a RELATIVE rating: each word
// covers a fifth of the archive hours of that variable), with the mean CRPS and |p50 − y| per class as its measured meaning.
const WORDS = ['sehr unsicher', 'unsicher', 'mäßig', 'solide', 'hoch'];
const classes = { builtAt: new Date().toISOString(), provenance: 'archive', rows: rows.length, slots: issue.length, points: counts.pointSlots, tables: { learned: sha(tb), stack: sha(sb) }, note: 'Schwellen = Score-Perzentile P20/P40/P60/P80 je Größe über alle Vorlauf-Bins (Archiv 16.–28.09.2026, Modus S); mean = Ø CRPS / Ø |p50 − y| je Klasse in der Einheit der Größe', byVar: {} };
md.push('', '## 5 Klassen (E-KF-3): Score-Perzentile je Größe und ihre gemessene Bedeutung', '', '| Größe | Schwellen P20 / P40 / P60 / P80 | Klasse | Anteil | Ø CRPS | Ø \\|p50 − y\\| |', '|---|---|---|---|---|---|');
for (const v of Object.keys(VARS)) {
  const rs = rows.filter((r) => r.v === v); if (rs.length < 100) continue;
  const sc = rs.map((r) => r.score);
  const th = [0.2, 0.4, 0.6, 0.8].map((p) => Math.round(q(sc, p) * 1000) / 1000);
  const cls = (x) => (x < th[0] ? 0 : x < th[1] ? 1 : x < th[2] ? 2 : x < th[3] ? 3 : 4);
  const per = WORDS.map((w, i) => { const part = rs.filter((r) => cls(r.score) === i); return { word: w, share: part.length / rs.length, crps: mean(part.map((r) => r.crps)), mae: mean(part.map((r) => r.ae)) }; });
  classes.byVar[v] = { thresholds: th, classes: per.map((c) => ({ word: c.word, share: Math.round(c.share * 1000) / 1000, crps: c.crps == null ? null : Math.round(c.crps * 1000) / 1000, mae: c.mae == null ? null : Math.round(c.mae * 1000) / 1000 })) };
  per.forEach((c, i) => md.push(`| ${i === 0 ? LAB[v] : ''} | ${i === 0 ? th.map((x) => pc(x)).join(' / ') : ''} | ${c.word} | ${pc(c.share)} | ${f2(c.crps, 3)} | ${f2(c.mae, 3)} |`));
  // class shares per lead bin (does the rating still move with the lead?)
  md.push(`| | je Bin: ${BINS.map((b, bi) => { const part = rs.filter((r) => r.bin === bi); if (!part.length) return null; const hi = part.filter((r) => cls(r.score) >= 3).length / part.length, lo = part.filter((r) => cls(r.score) === 0).length / part.length; return `${BLAB[bi]} solide+hoch ${pc(hi)} · unsicher ${pc(lo)}`; }).filter(Boolean).join(' · ')} | | | | |`);
}
writeFileSync(join(dirname(out), 'classes.json'), JSON.stringify(classes, null, 1) + '\n');
if (counts.errors.length) md.push('', '## Fehler', '', ...counts.errors.map((e) => `- ${e}`));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md.join('\n') + '\n');
console.log(md.join('\n'));
