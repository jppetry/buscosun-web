#!/usr/bin/env node
/**
 * prescreen.mjs — phase F10: a READ-ONLY pre-screen of an engine variant on the bench's own cases, OUTSIDE the bench
 * (`audit/fusion-10.md`). It imports the bench libraries (protocol, cases, truth W1, replay) but never writes into
 * `C:\dev\buscosun-pruefstand`, never registers anything and decides nothing — it exists so a specialist can iterate on a
 * candidate in its worktree before the verification role spends a bench run on it. Numbers from here are hints; only
 * `scripts/pruefstand/run.mjs` produces bench numbers.
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/fusion10/prescreen.mjs
 *     --out=<dir> [--root=<engine root, default: this repo>] [--opts='{"longRange":1}'] [--set=schnell|voll|hindcast]
 *     [--days=2026-09-14,2026-09-17] [--limit=<n>]
 *   … --compare=<dirA>,<dirB>          skill of A against B per cell (identical finite rows only), roles B and A
 *
 * `--set=schnell` (default) = every third day of the development set of the champion's freeze (the bench's own rule);
 * `voll` = the whole development set; `hindcast` = the first `--limit` out-of-vault 00-UTC hindcast slots after
 * 2025-09-08 (every third day) — NEVER a vault issue (the tool refuses dates inside tresor.json).
 * Per run it writes `<out>/<day>.f32` (scores per station × lead × channel, channels t td ws gust precip clct wet) and
 * `<out>/summary.json` (sums per cell). Options are merged over the champion's register options (Fusion 9).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { H, REPO, dayMs, isoDay, p, parseArgs } from '../pruefstand/lib/common.mjs';
import { loadProtocol } from '../pruefstand/lib/protokoll.mjs';
import { archiveIssues, leadsOfIssue } from '../pruefstand/lib/konserven.mjs';
import { hindcastSlotPath, loadEngine, loadTables, predictArchive, predictHindcast, readHindcastSlot } from '../pruefstand/lib/replay.mjs';
import { champion, withTablePaths } from '../pruefstand/lib/register.mjs';
import { openW1, truthBlock } from '../pruefstand/lib/wahrheit.mjs';
import { readArchiveSlot } from '../fusionfit/lib/archiveAdapter.mjs';
import { QUANTITY_VARS, TRUTH_VARS, windowOf } from '../../src/pruefstand/protokoll.ts';
import { crpsQ } from '../../src/pruefstand/metrics.ts';
import { channelsOf } from '../../src/pruefstand/adapter.ts';

/** `--opts`: JSON, or — because PowerShell 5.1 strips inner double quotes — `key:value,key:value` (true/false/numbers/strings). */
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

function cellsOf(file) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return j;
}

/** --compare=A,B: skill 1 − A/B per cell on rows finite in both runs. */
function compare(dirA, dirB) {
  const days = readdirSync(dirA).filter((f) => f.endsWith('.f32') && existsSync(join(dirB, f))).sort();
  if (!days.length) { console.error('compare: keine gemeinsamen Tage'); process.exit(1); }
  const sa = cellsOf(join(dirA, 'summary.json')), sb = cellsOf(join(dirB, 'summary.json'));
  if (sa.shape.join() !== sb.shape.join()) { console.error('compare: verschiedene Form'); process.exit(1); }
  const [nSt, nL, nCh] = sa.shape;
  const stations = proto.scored;
  const leads = sa.leads;
  const acc = new Map();   // key → [A, B, n, daysBetter, daysWorse]
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
        }
      }
    }
    for (const [k, e] of dayAcc) { let t = acc.get(k); if (!t) { t = [0, 0, 0, 0, 0]; acc.set(k, t); } t[0] += e[0]; t[1] += e[1]; t[2] += e[2]; if (e[0] < e[1]) t[3] += 1; else if (e[0] > e[1]) t[4] += 1; }
  }
  const kern = (v, w) => { const d = proto.variables[v]; return d.cell === 'kern' && (d.kernToH == null || proto.windows[w].toH <= d.kernToH); };
  for (const role of ['B', 'A']) {
    console.log(`\n── Rolle ${role} — Skill 1 − A/B je Zelle (Tage ${days.length}; „+“ = A besser; [Tage besser/schlechter]) ──`);
    console.log(`${'Größe'.padEnd(7)}${proto.windows.map((w) => w.id.padStart(26)).join('')}`);
    let idxSum = 0, idxN = 0;
    for (const v of CH) {
      const row = [v.padEnd(7)];
      for (let w = 0; w < proto.windows.length; w++) {
        const parts = [];
        for (const land of ['alle']) {
          const t = acc.get(key(v, proto.windows[w].id, land, role));
          if (!t || !t[1]) { parts.push('        –        '); continue; }
          const sk = 1 - t[0] / t[1];
          parts.push(`${pct(sk)} [${t[3]}/${t[4]}]${kern(v, w) ? '*' : ' '}`);
        }
        row.push(parts.join('').padStart(26));
        if (kern(v, w)) for (const land of LANDS) { const t = acc.get(key(v, proto.windows[w].id, land, role)); if (t && t[1]) { idxSum += 1 - t[0] / t[1]; idxN += 1; } }
      }
      console.log(row.join(''));
    }
    console.log(`Index-Näherung (Kernzellen × Land, gleich gewichtet, ${idxN} Zellen): ${pct(idxN ? idxSum / idxN : null)}   (* = Kernzelle; nur Hinweis, kein Prüfstand-Maß)`);
    console.log('Je Land (Kernzellen):', LANDS.map((land) => { let s = 0, n = 0; for (const v of CH) for (let w = 0; w < proto.windows.length; w++) if (kern(v, w)) { const t = acc.get(key(v, proto.windows[w].id, land, role)); if (t && t[1]) { s += 1 - t[0] / t[1]; n += 1; } } return `${land} ${pct(n ? s / n : null)}`; }).join(' · '));
  }
}

async function run() {
  const out = String(args.out ?? '');
  if (!out) { console.error('--out=<dir> fehlt'); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const champ = champion();
  const extra = parseOpts(args.opts) ?? {};
  const reg = { ...champ, options: { ...champ.options, ...extra } };
  const root = args.root ? String(args.root).replace(/\\/g, '/') : REPO;
  const set = String(args.set ?? 'schnell');
  let issues;
  if (set === 'hindcast') {
    const limit = Number(args.limit ?? 20);
    issues = [];
    for (let d = dayIndex('2025-09-08'); issues.length < limit && d <= dayIndex('2026-09-21'); d += 3) {
      const day = isoDay(d * 86_400_000);
      if (day >= proto.tresor.from && day <= proto.tresor.to) throw new Error(`prescreen: ${day} liegt im Tresor — verboten`);
      const path = hindcastSlotPath(d * 86_400_000);
      if (existsSync(path)) issues.push({ source: 'hindcast', day, issueMs: d * 86_400_000, slotAtMs: d * 86_400_000, path });
    }
  } else {
    const all = archiveIssues().filter((i) => i.day <= champ.freeze || set === 'voll' || args.days);
    issues = args.days ? all.filter((i) => String(args.days).split(',').includes(i.day)) : set === 'schnell' ? all.filter((i) => dayIndex(i.day) % proto.sets.schnell.every === 0) : all;
    if (args.limit) issues = issues.slice(0, Number(args.limit));
  }
  for (const i of issues) if (i.source === 'hindcast' && i.day >= proto.tresor.from && i.day <= proto.tresor.to) throw new Error('Tresor');
  console.log(`prescreen: ${issues.length} Ausgaben (${set}), Motor ${root}, Optionen ${JSON.stringify(reg.options)}`);
  const eng = await loadEngine(root);
  const tables = loadTables(withTablePaths(champ));
  const w1 = openW1(proto);
  const nSt = proto.scored.length, nq = proto.quantiles.length, ch = channelsOf(nq), nCh = CH.length;
  const taus = proto.quantiles, wetThr = proto.variables.wet.thresholdMmH;
  const sums = {};
  let leadsOut = null;
  const t0 = Date.now();
  for (const issue of issues) {
    const leads = leadsOfIssue(proto, issue).all, nL = leads.length;
    leadsOut = leads;
    const slot = issue.source === 'archiv' ? readArchiveSlot(issue.path) : readHindcastSlot(issue.path);
    const block = issue.source === 'archiv' ? predictArchive(eng, tables, reg, proto, slot, leads) : predictHindcast(eng, tables, reg, proto, slot, leads);
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
    for (let s = 0; s < nSt; s++) for (let l = 0; l < nL; l++) { const w = windowOf(proto, leads[l]); if (w < 0) continue; for (let c = 0; c < nCh; c++) { const x = sc[(s * nL + l) * nCh + c]; if (!Number.isFinite(x)) continue; const k = `${CH[c]}|${proto.windows[w].id}|${proto.scored[s].land}|${proto.scored[s].role}`; const e = (sums[k] ??= { n: 0, s: 0 }); e.n += 1; e.s += x; } }
    console.log(`  ${issue.day}: ${((Date.now() - t0) / 1000).toFixed(0)} s, Punkte ${block.info.points}, Fehler ${block.info.errors}${block.info.firstErrors?.length ? ` (${block.info.firstErrors[0]})` : ''}`);
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ kind: 'fusion10/prescreen', root, options: reg.options, set, days: issues.map((i) => i.day), shape: [nSt, leadsOut.length, nCh], channels: CH, leads: leadsOut, cells: sums }, null, 1));
  console.log(`geschrieben: ${out}/summary.json (${issues.length} Tage, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

if (args.compare) { const [a, b] = String(args.compare).split(','); compare(a, b); } else await run();
