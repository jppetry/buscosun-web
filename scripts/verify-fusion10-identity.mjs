#!/usr/bin/env node
/**
 * verify-fusion10-identity.mjs — phase F10, authorization 2 (`audit/fusion-10.md` §5): with the Fusion 10 option OFF the
 * engine of this checkout computes BYTE-IDENTICAL forecast blocks to the branch base (a detached worktree of the base
 * commit), on real bench cases (≥ 3 archive slots, all 365 stations, roles A and B of protocol P1, plus one out-of-vault
 * hindcast slot); with the option ON the blocks must DIFFER (negative control). Additionally the base engine is compared
 * with the stored conserves of the champion (buscosun Fusion 9, register commit 0ad0615) — equality shows that the branch
 * base still computes exactly Fusion 9 on these cases.
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/verify-fusion10-identity.mjs
 *     [--base=C:/dev/buscosun-web-wt/base] [--cand=<this repo>] [--on='{"longRange":1}'] [--days=3] [--hindcast=2026-06-15]
 *
 * Read-only towards the bench (`C:\dev\buscosun-pruefstand`): conserves are read, nothing is written there. Exit 1 on any
 * failed check.
 */
import { existsSync } from 'node:fs';
import { REPO, p, parseArgs, sha256 } from './pruefstand/lib/common.mjs';
import { loadProtocol } from './pruefstand/lib/protokoll.mjs';
import { archiveIssues, leadsOfIssue, readConserve } from './pruefstand/lib/konserven.mjs';
import { hindcastSlotPath, loadEngine, loadTables, predictArchive, predictHindcast, readHindcastSlot } from './pruefstand/lib/replay.mjs';
import { champion, modelHash, withTablePaths } from './pruefstand/lib/register.mjs';
import { readArchiveSlot } from './fusionfit/lib/archiveAdapter.mjs';
import { QUANTITY_VARS } from '../src/pruefstand/protokoll.ts';
import { channelsOf } from '../src/pruefstand/adapter.ts';

/** `--on`: JSON, or — because PowerShell 5.1 strips inner double quotes — `key:value,key:value` (true/false/numbers/strings). */
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
const champ = champion();
const baseRoot = String(args.base ?? 'C:/dev/buscosun-web-wt/base').replace(/\\/g, '/');
const candRoot = String(args.cand ?? REPO).replace(/\\/g, '/');
const on = parseOpts(args.on);
const nDays = Number(args.days ?? 3);
const hcDay = String(args.hindcast ?? '2026-06-15');
if (hcDay >= proto.tresor.from && hcDay <= proto.tresor.to) { console.error(`Hindcast-Tag ${hcDay} liegt im Tresor — verboten`); process.exit(1); }
if (!on) { console.error('--on=<json> fehlt (die Option von buscosun Fusion 10 für die Negativkontrolle)'); process.exit(1); }

let passed = 0; const checks = [];
const add = (name, ok, detail = '') => { checks.push({ name, ok, detail }); if (ok) passed += 1; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const shaOf = (f32) => sha256(Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength));
const nSt = proto.scored.length, nq = proto.quantiles.length, ch = channelsOf(nq);

function diffStats(a, b, leads) {
  const nL = leads.length;
  let n = 0, le48 = 0, gt48 = 0; const vars = new Set();
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y || (x !== x && y !== y)) continue;
    n += 1;
    const l = Math.floor(i / ch) % nL, c = i % ch;
    if (leads[l] <= 48) le48 += 1; else gt48 += 1;
    vars.add(c < QUANTITY_VARS.length * nq ? QUANTITY_VARS[Math.floor(c / nq)] : c === QUANTITY_VARS.length * nq ? 'pWet' : 'dd');
  }
  return { n, le48, gt48, vars: [...vars].sort() };
}

const base = await loadEngine(baseRoot), cand = await loadEngine(candRoot);
const tables = loadTables(withTablePaths(champ));
const offReg = { ...champ }, onReg = { ...champ, options: { ...champ.options, ...on } };
const mHash = modelHash(champ);
console.log(`Basis ${baseRoot} · Kandidat ${candRoot} · Option an: ${JSON.stringify(on)} · Champion ${champ.id} (${champ.commit.slice(0, 7)})`);

const issues = archiveIssues().filter((i) => i.day <= champ.freeze).slice(-nDays);
for (const issue of issues) {
  const leads = leadsOfIssue(proto, issue).all;
  const slot = readArchiveSlot(issue.path);
  const b = predictArchive(base, tables, offReg, proto, slot, leads), c = predictArchive(cand, tables, offReg, proto, slot, leads);
  add(`Archiv ${issue.day}: Option aus — Kandidat byte-gleich zur Basis`, shaOf(b.data) === shaOf(c.data), `${shaOf(c.data).slice(0, 12)}, Punkte ${c.info.points}, Fehler ${c.info.errors}`);
  const conserve = readConserve(proto, mHash, issue);
  if (conserve) add(`Archiv ${issue.day}: Basis byte-gleich zur Konserve von ${champ.id}`, shaOf(conserve.data) === shaOf(b.data), `Konserve ${shaOf(conserve.data).slice(0, 12)}`);
  else console.log(`  (keine Konserve von ${champ.id} für ${issue.day} — der Vergleich mit dem Register-Commit entfällt an diesem Tag)`);
  const o = predictArchive(cand, tables, onReg, proto, slot, leads);
  const d = diffStats(c.data, o.data, leads);
  add(`Archiv ${issue.day}: Negativkontrolle — Option an unterscheidet sich`, d.n > 0, `${d.n} Werte verschieden (≤ 48 h ${d.le48}, > 48 h ${d.gt48}; Größen ${d.vars.join(', ') || '—'})`);
}
const hcPath = hindcastSlotPath(Date.parse(`${hcDay}T00:00:00Z`));
if (existsSync(hcPath)) {
  const issueMs = Date.parse(`${hcDay}T00:00:00Z`);
  const leads = leadsOfIssue(proto, { issueMs }).all;
  const slot = readHindcastSlot(hcPath);
  const b = predictHindcast(base, tables, offReg, proto, slot, leads), c = predictHindcast(cand, tables, offReg, proto, slot, leads);
  add(`Hindcast ${hcDay} (außerhalb des Tresors): Option aus — byte-gleich zur Basis`, shaOf(b.data) === shaOf(c.data), `${shaOf(c.data).slice(0, 12)}, Aufrufe ${c.info.calls}`);
  const o = predictHindcast(cand, tables, onReg, proto, slot, leads);
  const d = diffStats(c.data, o.data, leads);
  add(`Hindcast ${hcDay}: Negativkontrolle — Option an unterscheidet sich`, d.n > 0, `${d.n} Werte verschieden (≤ 48 h ${d.le48}, > 48 h ${d.gt48}; Größen ${d.vars.join(', ') || '—'})`);
} else console.log(`  (Hindcast-Slot ${hcDay} fehlt — Hindcast-Prüfung entfällt)`);

console.log(`\nverify:fusion10-identity — ${passed}/${checks.length}`);
if (passed !== checks.length) process.exit(1);
