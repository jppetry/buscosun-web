#!/usr/bin/env node
/**
 * verify-fusion12-identity.mjs — phase OF (`audit/obs-fusion.md` §5.6): with the Fusion 12 option OFF and the archive
 * measurements of the slot, the engine of this checkout computes BYTE-IDENTICAL forecast blocks to the branch base (a detached
 * worktree of the merge commit = the code of Fusion 11 on main's state), on real bench cases (≥ 3 archive days, all 365
 * stations, roles A and B of protocol P1, plus one out-of-vault hindcast slot). Then the controls:
 *   (1) base engine against the stored conserves of the register entry `--basis` (fusion-11) where they exist
 *   (2) negative control: option ON with the dense measurements of the day files differs (profile per variable and lead)
 *   (3) the OF-1 effect alone: option OFF, measurements `store6` (the product's six nearest full stations) differs from the
 *       archive measurement — and only at the leads the anchor and the station value reach (reported, not asserted)
 *   (4) hindcast (no measurements): option ON byte-identical to OFF — the option acts only through measurements
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/verify-fusion12-identity.mjs
 *     [--base=C:/dev/buscosun-web-wt/base12] [--cand=<this repo>] [--basis=fusion-11] [--on=obsDense:1] [--days=3 | --day=YYYY-MM-DD,…] [--hindcast=2026-06-15]
 *
 * Read-only towards the bench (`C:\dev\buscosun-pruefstand`): conserves and day files are read, nothing is written there.
 * Exit 1 on any failed check.
 */
import { existsSync } from 'node:fs';
import { REPO, p, parseArgs, sha256 } from './pruefstand/lib/common.mjs';
import { loadProtocol } from './pruefstand/lib/protokoll.mjs';
import { archiveIssues, leadsOfIssue, readConserve } from './pruefstand/lib/konserven.mjs';
import { hindcastSlotPath, loadEngine, loadTables, predictArchive, predictHindcast, readHindcastSlot } from './pruefstand/lib/replay.mjs';
import { denseAvailable } from './pruefstand/lib/obsDense.mjs';
import { loadRegister, modelHash, normalizeId, withTablePaths } from './pruefstand/lib/register.mjs';
import { readArchiveSlot } from './fusionfit/lib/archiveAdapter.mjs';
import { QUANTITY_VARS } from '../src/pruefstand/protokoll.ts';
import { channelsOf } from '../src/pruefstand/adapter.ts';

function parseOpts(raw) {
  if (raw == null || raw === true) return null;
  const s = String(raw).trim();
  try { return JSON.parse(s); } catch { /* relaxed */ }
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
const basis = loadRegister(normalizeId(String(args.basis ?? 'fusion-11')));
const baseRoot = String(args.base ?? 'C:/dev/buscosun-web-wt/base12').replace(/\\/g, '/');
const candRoot = String(args.cand ?? REPO).replace(/\\/g, '/');
const on = parseOpts(args.on) ?? { obsDense: 1 };
const nDays = Number(args.days ?? 3);
const hcDay = String(args.hindcast ?? '2026-06-15');
if (hcDay >= proto.tresor.from && hcDay <= proto.tresor.to) { console.error(`Hindcast-Tag ${hcDay} liegt im Tresor — verboten`); process.exit(1); }
if (!existsSync(p(baseRoot, 'src/pointForecast/cubeSource.ts'))) { console.error(`Basis ${baseRoot} fehlt (git worktree add --detach ${baseRoot} <Merge-Commit>)`); process.exit(1); }

let passed = 0; const checks = [];
const add = (name, ok, detail = '') => { checks.push({ name, ok, detail }); if (ok) passed += 1; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const shaOf = (f32) => sha256(Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength));
const nq = proto.quantiles.length, ch = channelsOf(nq);

/** Profile of the differences between two blocks: per variable the count, the lead range and the roles/lands. */
function diffProfile(a, b, leads) {
  const nL = leads.length, out = {};
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y || (x !== x && y !== y)) continue;
    n += 1;
    const st = Math.floor(i / (ch * nL)), l = Math.floor(i / ch) % nL, c = i % ch;
    const v = c < QUANTITY_VARS.length * nq ? QUANTITY_VARS[Math.floor(c / nq)] : c === QUANTITY_VARS.length * nq ? 'pWet' : 'dd';
    const e = (out[v] ??= { n: 0, minLead: Infinity, maxLead: 0, roles: new Set(), lands: new Set(), maxAbs: 0 });
    e.n += 1; e.minLead = Math.min(e.minLead, leads[l]); e.maxLead = Math.max(e.maxLead, leads[l]); e.roles.add(proto.scored[st]?.role ?? '?'); e.lands.add(proto.scored[st]?.land ?? '?');
    const d = Math.abs(x - y); if (Number.isFinite(d) && d > e.maxAbs) e.maxAbs = d;
  }
  return { n, byVar: out };
}
const profTxt = (pr) => Object.entries(pr.byVar).map(([v, e]) => `${v} ${e.n} (${e.minLead}–${e.maxLead} h, max |Δ| ${e.maxAbs.toPrecision(3)}, ${[...e.roles].sort().join('/')}, ${[...e.lands].sort().join('/')})`).join('; ') || '—';

const base = await loadEngine(baseRoot), cand = await loadEngine(candRoot);
const tables = loadTables(withTablePaths(basis));
const offReg = { ...basis }, onReg = { ...basis, options: { ...basis.options, ...on } };
const mHash = modelHash(basis);
console.log(`Basis ${baseRoot} · Kandidat ${candRoot} · Option an: ${JSON.stringify(on)} · Register ${basis.id} (${basis.commit.slice(0, 7)}) · Kandidat-Leser ${cand.dense ? 'vorhanden' : 'FEHLT'}`);
add('Kandidat trägt den Leser des Messprodukts (obsStore.ts) — die Basis nicht', !!cand.dense && !base.dense);

const issues = args.day ? archiveIssues().filter((i) => String(args.day).split(',').includes(i.day)) : archiveIssues().filter((i) => i.day <= basis.freeze).slice(-nDays);
for (const issue of issues) {
  const leads = leadsOfIssue(proto, issue).all;
  const slot = readArchiveSlot(issue.path);
  const b = predictArchive(base, tables, offReg, proto, slot, leads), c = predictArchive(cand, tables, offReg, proto, slot, leads, { obsMode: 'archive' });
  add(`Archiv ${issue.day}: Option aus, Archiv-Messung — Kandidat byte-gleich zur Basis`, shaOf(b.data) === shaOf(c.data), `${shaOf(c.data).slice(0, 12)}, Punkte ${c.info.points}, Fehler ${c.info.errors}`);
  const conserve = readConserve(proto, mHash, issue);
  if (conserve) add(`Archiv ${issue.day}: Basis byte-gleich zur Konserve von ${basis.id}`, shaOf(conserve.data) === shaOf(b.data), `Konserve ${shaOf(conserve.data).slice(0, 12)}`);
  else console.log(`  (keine Konserve von ${basis.id} für ${issue.day})`);
  if (!denseAvailable(issue.day)) { console.log(`  (keine dichte Tagesdatei für ${issue.day} — Negativkontrollen entfallen)`); continue; }
  const o = predictArchive(cand, tables, onReg, proto, slot, leads, { obsMode: 'dense' });
  const d = diffProfile(c.data, o.data, leads);
  add(`Archiv ${issue.day}: Negativkontrolle — Option an mit dichtem Messsatz unterscheidet sich (dense an ${o.info.denseUsed} Punkten)`, d.n > 0 && o.info.denseUsed > 0, `${d.n} Werte: ${profTxt(d)}`);
  const s6 = predictArchive(cand, tables, offReg, proto, slot, leads, { obsMode: 'store6' });
  const d6 = diffProfile(c.data, s6.data, leads);
  add(`Archiv ${issue.day}: OF-1 allein — Option aus, Messungen aus dem Produkt (6 nächste volle Stationen) unterscheiden sich von der Archiv-Messung (anderer Stationssatz, 10-min-Stempel)`, d6.n > 0, `${d6.n} Werte: ${profTxt(d6)}`);
  const o6 = predictArchive(cand, tables, onReg, proto, slot, leads, { obsMode: 'store6' });
  add(`Archiv ${issue.day}: Option an mit nur sechs vollen Stationen ohne Messgeräte-Felder = Option aus auf demselben Satz bis auf den Anker-Satz je Größe (Bericht)`, true, `${diffProfile(s6.data, o6.data, leads).n} Werte verschieden`);
}
const hcPath = hindcastSlotPath(Date.parse(`${hcDay}T00:00:00Z`));
if (existsSync(hcPath)) {
  const issueMs = Date.parse(`${hcDay}T00:00:00Z`);
  const leads = leadsOfIssue(proto, { issueMs }).all;
  const slot = readHindcastSlot(hcPath);
  const b = predictHindcast(base, tables, offReg, proto, slot, leads), c = predictHindcast(cand, tables, offReg, proto, slot, leads);
  add(`Hindcast ${hcDay} (außerhalb des Tresors): Option aus — byte-gleich zur Basis`, shaOf(b.data) === shaOf(c.data), `${shaOf(c.data).slice(0, 12)}, Aufrufe ${c.info.calls}`);
  const o = predictHindcast(cand, tables, onReg, proto, slot, leads);
  add(`Hindcast ${hcDay}: ohne Messungen wirkt die Option nicht — Option an byte-gleich zu aus`, shaOf(o.data) === shaOf(c.data));
} else console.log(`  (Hindcast-Slot ${hcDay} fehlt — Hindcast-Prüfung entfällt)`);

console.log(`\nverify:fusion12-identity — ${passed}/${checks.length}`);
if (passed !== checks.length) process.exit(1);
