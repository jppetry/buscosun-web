#!/usr/bin/env node
/**
 * prescreen.mjs — phase OF (`audit/obs-fusion.md` §5.5): a READ-ONLY pre-screen of the measurement options on the bench's own
 * cases, OUTSIDE the bench (the F10 tool `scripts/fusion10/prescreen.mjs` with the measurement source as a knob). It imports
 * the bench libraries (protocol, cases, truth W1, replay) but never writes into `C:\dev\buscosun-pruefstand`, never registers
 * anything and decides nothing — numbers from here are hints; only `scripts/pruefstand/run.mjs` produces bench numbers.
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/obsfusion/prescreen.mjs
 *     --out=<dir> [--root=<engine root>] [--basis=fusion-11] [--opts='obsDense:1,gaugeOccurrence:1'] [--obs=archive|store6|dense]
 *     [--set=schnell|voll] [--days=2026-09-14,…] [--limit=<n>]
 *   … --compare=<dirA>,<dirB>   skill of A against B per cell (identical finite rows only), roles B and A, plus the single
 *                               leads 1 … 6 h (the claims of OF-4 are about 0–1 h, 0–2 h, 3–6 h)
 *
 * `--obs`: which measurements the replay feeds — `archive` (the slot's truth rows, every version before Fusion 12), `store6`
 * (the product's six nearest full stations from the dense day files: the OF-1 effect alone, engine options off), `dense` (the
 * dense set: the input of `obsDense`). Default: dense when `obsDense:1` is among the options, else archive. Days without a
 * dense day file keep the archive measurement and are counted (`denseMissing`).
 * Per run it writes `<out>/<day>.f32` (scores per station × lead × channel: t td ws gust precip clct wet), `<out>/<day>.cov.f32`
 * (q10–q90 coverage) and `<out>/summary.json`. Options are merged over the register options of `--basis` (default fusion-11).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, dayMs, p, parseArgs } from '../pruefstand/lib/common.mjs';
import { loadProtocol } from '../pruefstand/lib/protokoll.mjs';
import { archiveIssues, leadsOfIssue } from '../pruefstand/lib/konserven.mjs';
import { loadEngine, loadTables, predictArchive } from '../pruefstand/lib/replay.mjs';
import { champion, loadRegister, normalizeId, withTablePaths } from '../pruefstand/lib/register.mjs';
import { openW1, truthBlock } from '../pruefstand/lib/wahrheit.mjs';
import { readArchiveSlot } from '../fusionfit/lib/archiveAdapter.mjs';
import { QUANTITY_VARS, TRUTH_VARS, windowOf } from '../../src/pruefstand/protokoll.ts';
import { crpsQ } from '../../src/pruefstand/metrics.ts';
import { channelsOf } from '../../src/pruefstand/adapter.ts';

/** `--opts`: JSON, or — because PowerShell 5.1 strips inner double quotes — `key:value,key:value`. */
function parseOpts(raw) {
  if (raw == null || raw === true) return null;
  const s = String(raw).trim();
  try { return JSON.parse(s); } catch { /* relaxed form */ }
  const out = {};
  for (const part of s.replace(/^\{|\}$/g, '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^"?([A-Za-z0-9_]+)"?\s*:\s*(.+)$/.exec(part);
    if (!m) throw new Error(`Option ${part}: Form key:value`);
    const v = m[2].trim().replace(/^"|"$/g, '');
    out[m[1]] = v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : Number.isFinite(Number(v)) && v !== '' ? Number(v) : v;
  }
  return out;
}
const args = parseArgs();
const proto = loadProtocol();
const CH = ['t', 'td', 'ws', 'gust', 'precip', 'clct', 'wet'];
const LANDS = ['DE', 'AT', 'CH'];
const dayIndex = (day) => Math.round(dayMs(day) / 86_400_000);
const pct = (x) => (x == null || !Number.isFinite(x) ? '    –   ' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(2).padStart(6)} %`);

function compare(dirA, dirB) {
  const days = readdirSync(dirA).filter((f) => f.endsWith('.f32') && !f.endsWith('.cov.f32') && existsSync(join(dirB, f))).sort();
  if (!days.length) { console.error('compare: keine gemeinsamen Tage'); process.exit(1); }
  const sa = JSON.parse(readFileSync(join(dirA, 'summary.json'), 'utf8')), sb = JSON.parse(readFileSync(join(dirB, 'summary.json'), 'utf8'));
  if (sa.shape.join() !== sb.shape.join()) { console.error('compare: verschiedene Form'); process.exit(1); }
  const [nSt, nL, nCh] = sa.shape;
  const stations = proto.scored, leads = sa.leads;
  const acc = new Map();      // key → [A, B, n, daysBetter, daysWorse]
  const accLead = new Map();  // `${v}|${lead}|${land}|${role}` → [A, B, n]
  const key = (v, w, land, role) => `${v}|${w}|${land}|${role}`;
  for (const f of days) {
    const a = new Float32Array(readFileSync(join(dirA, f)).buffer.slice(0)), b = new Float32Array(readFileSync(join(dirB, f)).buffer.slice(0));
    const dayAcc = new Map();
    for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
      const w = windowOf(proto, leads[l]); if (w < 0) continue;
      for (let c = 0; c < nCh; c++) {
        const i = (s * nL + l) * nCh + c, x = a[i], y = b[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        for (const land of [stations[s].land, 'alle']) for (const role of [stations[s].role, 'AB']) {
          const k = key(CH[c], proto.windows[w].id, land, role);
          let e = dayAcc.get(k); if (!e) { e = [0, 0, 0]; dayAcc.set(k, e); }
          e[0] += x; e[1] += y; e[2] += 1;
          if (leads[l] <= 6) { const kl = key(CH[c], leads[l], land, role); let el = accLead.get(kl); if (!el) { el = [0, 0, 0]; accLead.set(kl, el); } el[0] += x; el[1] += y; el[2] += 1; }
        }
      }
    }
    for (const [k, e] of dayAcc) { let t = acc.get(k); if (!t) { t = [0, 0, 0, 0, 0]; acc.set(k, t); } t[0] += e[0]; t[1] += e[1]; t[2] += e[2]; if (e[0] < e[1]) t[3] += 1; else if (e[0] > e[1]) t[4] += 1; }
  }
  const kern = (v, w) => { const d = proto.variables[v]; return d.cell === 'kern' && (d.kernToH == null || proto.windows[w].toH <= d.kernToH); };
  console.log(`A = ${dirA} (${sa.obs ?? '?'}, ${JSON.stringify(sa.options)})\nB = ${dirB} (${sb.obs ?? '?'}, ${JSON.stringify(sb.options)})`);
  for (const role of ['B', 'A']) {
    console.log(`\n── Rolle ${role} — Skill 1 − A/B je Zelle (Tage ${days.length}; „+" = A besser; [Tage besser/schlechter]) ──`);
    console.log(`${'Größe'.padEnd(7)}${proto.windows.map((w) => w.id.padStart(26)).join('')}`);
    let idxSum = 0, idxN = 0;
    for (const v of CH) {
      const row = [v.padEnd(7)];
      for (let w = 0; w < proto.windows.length; w++) {
        const t = acc.get(key(v, proto.windows[w].id, 'alle', role));
        row.push((!t || !t[1] ? '        –        ' : `${pct(1 - t[0] / t[1])} [${t[3]}/${t[4]}]${kern(v, w) ? '*' : ' '}`).padStart(26));
        if (kern(v, w)) for (const land of LANDS) { const tl = acc.get(key(v, proto.windows[w].id, land, role)); if (tl && tl[1]) { idxSum += 1 - tl[0] / tl[1]; idxN += 1; } }
      }
      console.log(row.join(''));
    }
    console.log(`Index-Näherung (Kernzellen × Land, gleich gewichtet, ${idxN} Zellen): ${pct(idxN ? idxSum / idxN : null)}   (* = Kernzelle; nur Hinweis, kein Prüfstand-Maß)`);
    console.log('Je Land (Kernzellen):', LANDS.map((land) => { let s = 0, n = 0; for (const v of CH) for (let w = 0; w < proto.windows.length; w++) if (kern(v, w)) { const t = acc.get(key(v, proto.windows[w].id, land, role)); if (t && t[1]) { s += 1 - t[0] / t[1]; n += 1; } } return `${land} ${pct(n ? s / n : null)}`; }).join(' · '));
    console.log(`-- Rolle ${role} - Fenster 0-6 h je Land (DE/AT/CH) --`);
    for (const v of CH) { const t = LANDS.map((land) => { const e = acc.get(key(v, '0-6', land, role)); return e && e[1] ? pct(1 - e[0] / e[1]).trim() : '–'; }); console.log(`  ${v.padEnd(6)} ${t.join('  ')}`); }
    console.log(`-- Rolle ${role} - einzelne Vorläufe 1 … 6 h (alle Länder; n je Zelle) --`);
    for (const v of ['t', 'td', 'ws', 'gust', 'precip', 'wet']) {
      console.log(`  ${v.padEnd(6)} ${[1, 2, 3, 4, 5, 6].map((L) => { const e = accLead.get(key(v, L, 'alle', role)); return e && e[1] ? `${L} h ${pct(1 - e[0] / e[1]).trim()} (${e[2]})` : `${L} h –`; }).join(' | ')}`);
      console.log(`         je Land 1 h/2 h: ${LANDS.map((land) => `${land} ${[1, 2].map((L) => { const e = accLead.get(key(v, L, land, role)); return e && e[1] ? pct(1 - e[0] / e[1]).trim() : '–'; }).join('/')}`).join('  ')}`);
    }
  }
}

async function run() {
  const out = String(args.out ?? '');
  if (!out) { console.error('--out=<dir> fehlt'); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const base = args.basis ? loadRegister(normalizeId(String(args.basis))) : (existsSync(p(REPO, 'scripts/pruefstand/register/fusion-11.json')) ? loadRegister('fusion-11') : champion());
  const extra = parseOpts(args.opts) ?? {};
  const reg = { ...base, options: { ...base.options, ...extra } };
  const obsMode = args.obs ? String(args.obs) : null;
  const root = args.root ? String(args.root).replace(/\\/g, '/') : REPO;
  const set = String(args.set ?? 'schnell');
  const all = archiveIssues().filter((i) => i.day <= base.freeze || set === 'voll' || args.days);
  let issues = args.days ? all.filter((i) => String(args.days).split(',').includes(i.day)) : set === 'schnell' ? all.filter((i) => dayIndex(i.day) % proto.sets.schnell.every === 0) : all;
  if (args.limit) issues = issues.slice(0, Number(args.limit));
  console.log(`prescreen: ${issues.length} Ausgaben (${set}), Motor ${root}, Basis ${base.id}, Messungen ${obsMode ?? (reg.options.obsDense === 1 ? 'dense' : 'archive')}, Optionen ${JSON.stringify(reg.options)}`);
  const eng = await loadEngine(root);
  const tables = loadTables(withTablePaths(base));
  const w1 = openW1(proto);
  const nSt = proto.scored.length, nq = proto.quantiles.length, ch = channelsOf(nq), nCh = CH.length;
  const taus = proto.quantiles, wetThr = proto.variables.wet.thresholdMmH;
  const sums = {};
  let leadsOut = null, obsInfo = { denseUsed: 0, denseMissing: 0, withObs: 0 };
  const t0 = Date.now();
  for (const issue of issues) {
    const leads = leadsOfIssue(proto, issue).all, nL = leads.length;
    leadsOut = leads;
    const slot = readArchiveSlot(issue.path);
    const block = predictArchive(eng, tables, reg, proto, slot, leads, { obsMode });
    obsInfo.denseUsed += block.info.denseUsed ?? 0; obsInfo.denseMissing += block.info.denseMissing ?? 0; obsInfo.withObs += block.info.withObs ?? 0;
    const T = truthBlock(w1, proto, issue.issueMs, leads);
    const sc = new Float32Array(nSt * nL * nCh).fill(NaN);
    for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
      const w = windowOf(proto, leads[l]); if (w < 0) continue;
      const o = (s * nL + l) * ch, to = (s * nL + l) * TRUTH_VARS.length;
      for (let v = 0; v < QUANTITY_VARS.length; v++) {
        const y = T[to + v]; if (!Number.isFinite(y) || !Number.isFinite(block.data[o + v * nq])) continue;
        sc[(s * nL + l) * nCh + v] = crpsQ(taus, block.data, y, o + v * nq);
      }
      const pw = block.data[o + QUANTITY_VARS.length * nq], yp = T[to + 4];
      if (Number.isFinite(pw) && Number.isFinite(yp)) sc[(s * nL + l) * nCh + 6] = (pw - (yp >= wetThr ? 1 : 0)) ** 2;
    }
    writeFileSync(join(out, `${issue.day}.f32`), Buffer.from(sc.buffer));
    const i10 = taus.findIndex((t) => Math.abs(t - 0.1) < 1e-6), i90 = taus.findIndex((t) => Math.abs(t - 0.9) < 1e-6);
    if (i10 >= 0 && i90 >= 0) {
      const cv = new Float32Array(nSt * nL * 4).fill(NaN);
      for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) {
        const w = windowOf(proto, leads[l]); if (w < 0) continue;
        const o = (s * nL + l) * ch, to = (s * nL + l) * TRUTH_VARS.length;
        for (let v = 0; v < 4; v++) {
          const y = T[to + v], lo = block.data[o + v * nq + i10], hi = block.data[o + v * nq + i90];
          if (!Number.isFinite(y) || !Number.isFinite(lo) || !Number.isFinite(hi)) continue;
          cv[(s * nL + l) * 4 + v] = y >= lo && y <= hi ? 1 : 0;
        }
      }
      writeFileSync(join(out, `${issue.day}.cov.f32`), Buffer.from(cv.buffer));
    }
    for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) { const w = windowOf(proto, leads[l]); if (w < 0) continue; for (let c = 0; c < nCh; c++) { const x = sc[(s * nL + l) * nCh + c]; if (!Number.isFinite(x)) continue; const k = `${CH[c]}|${proto.windows[w].id}|${proto.scored[s].land}|${proto.scored[s].role}`; const e = (sums[k] ??= { n: 0, s: 0 }); e.n += 1; e.s += x; } }
    console.log(`  ${issue.day}: ${((Date.now() - t0) / 1000).toFixed(0)} s, Punkte ${block.info.points}, Messungen ${block.info.obsMode} (dense ${block.info.denseUsed ?? 0}, ohne Tagesdatei ${block.info.denseMissing ?? 0}, mit Messung ${block.info.withObs}), Fehler ${block.info.errors}${block.info.firstErrors?.length ? ` (${block.info.firstErrors[0]})` : ''}`);
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ kind: 'obsfusion/prescreen', root, basis: base.id, options: reg.options, obs: obsMode ?? (reg.options.obsDense === 1 ? 'dense' : 'archive'), obsInfo, set, days: issues.map((i) => i.day), shape: [nSt, leadsOut.length, nCh], channels: CH, leads: leadsOut, cells: sums }, null, 1));
  console.log(`geschrieben: ${out}/summary.json (${issues.length} Tage, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

if (args.compare) { const [a, b] = String(args.compare).split(','); compare(a, b); } else await run();
