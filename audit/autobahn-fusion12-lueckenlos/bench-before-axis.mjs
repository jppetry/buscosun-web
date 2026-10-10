// V-AF-10, verification (not in CI): does `anchorBeforeAxis` touch the bench result of the candidate behind buscosun Fusion 12?
// The register entry fusion-12s (its fixed option list) against the same entry PLUS anchorBeforeAxis, on real bench cases of the
// development set (archive days up to the freeze of the entry, all scored stations, dense measurements of the day files) and one
// out-of-vault hindcast slot (no measurements). Read-only towards the bench (C:\dev\buscosun-pruefstand).
//   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs audit/autobahn-fusion12-lueckenlos/bench-before-axis.mjs [--id=fusion-12s] [--days=3]
import { existsSync } from 'node:fs';
import { REPO, parseArgs, sha256 } from '../../scripts/pruefstand/lib/common.mjs';
import { loadProtocol } from '../../scripts/pruefstand/lib/protokoll.mjs';
import { archiveIssues, leadsOfIssue } from '../../scripts/pruefstand/lib/konserven.mjs';
import { hindcastSlotPath, loadEngine, loadTables, predictArchive, predictHindcast, readHindcastSlot } from '../../scripts/pruefstand/lib/replay.mjs';
import { denseAvailable } from '../../scripts/pruefstand/lib/obsDense.mjs';
import { loadRegister, normalizeId, withTablePaths } from '../../scripts/pruefstand/lib/register.mjs';
import { readArchiveSlot } from '../../scripts/fusionfit/lib/archiveAdapter.mjs';
import { QUANTITY_VARS } from '../../src/pruefstand/protokoll.ts';
import { channelsOf } from '../../src/pruefstand/adapter.ts';

const args = parseArgs();
const proto = loadProtocol();
const reg = loadRegister(normalizeId(String(args.id ?? 'fusion-12s')));
const nDays = Number(args.days ?? 3);
const hcDay = String(args.hindcast ?? '2026-06-15');
if (hcDay >= proto.tresor.from && hcDay <= proto.tresor.to) { console.error(`Hindcast-Tag ${hcDay} liegt im Tresor — verboten`); process.exit(1); }
const nq = proto.quantiles.length, ch = channelsOf(nq);
const shaOf = (f32) => sha256(Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength));

/** Profile of the differences between two blocks: per variable the count, the lead range and the largest difference. */
function diffProfile(a, b, leads) {
  const nL = leads.length, out = {};
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y || (x !== x && y !== y)) continue;
    n += 1;
    const l = Math.floor(i / ch) % nL, c = i % ch;
    const v = c < QUANTITY_VARS.length * nq ? QUANTITY_VARS[Math.floor(c / nq)] : c === QUANTITY_VARS.length * nq ? 'pWet' : 'dd';
    const e = (out[v] ??= { n: 0, minLead: Infinity, maxLead: 0, maxAbs: 0 });
    e.n += 1; e.minLead = Math.min(e.minLead, leads[l]); e.maxLead = Math.max(e.maxLead, leads[l]);
    const d = Math.abs(x - y); if (Number.isFinite(d) && d > e.maxAbs) e.maxAbs = d;
  }
  return { n, total: a.length, txt: Object.entries(out).map(([v, e]) => `${v} ${e.n} (${e.minLead}–${e.maxLead} h, max |Δ| ${e.maxAbs.toPrecision(3)})`).join('; ') || '—' };
}

const eng = await loadEngine(String(REPO).replace(/\\/g, '/'));
const tables = loadTables(withTablePaths(reg));
const off = { ...reg }, on = { ...reg, options: { ...reg.options, anchorBeforeAxis: true } };
console.log(`Register ${reg.id} (${reg.commit.slice(0, 7)}), Optionen ${JSON.stringify(reg.options)}; Vergleich: dieselben Optionen + anchorBeforeAxis: true; Motor aus ${REPO}\n`);
console.log('| Fall | Messungen | Werte verschieden | von | Profil | sha ohne | sha mit |');
console.log('|---|---|---|---|---|---|---|');
let touched = 0;
const issues = archiveIssues().filter((i) => i.day <= reg.freeze).slice(-nDays);
for (const issue of issues) {
  const leads = leadsOfIssue(proto, issue).all;
  const slot = readArchiveSlot(issue.path);
  for (const obsMode of ['archive', ...(denseAvailable(issue.day) ? ['dense'] : [])]) {
    const a = predictArchive(eng, tables, off, proto, slot, leads, { obsMode }), b = predictArchive(eng, tables, on, proto, slot, leads, { obsMode });
    const d = diffProfile(a.data, b.data, leads);
    touched += d.n;
    console.log(`| Archiv ${issue.day} | ${obsMode}${obsMode === 'dense' ? ` (an ${b.info.denseUsed} Punkten)` : ''} | ${d.n} | ${d.total} | ${d.txt} | ${shaOf(a.data).slice(0, 12)} | ${shaOf(b.data).slice(0, 12)} |`);
  }
}
const hcPath = hindcastSlotPath(Date.parse(`${hcDay}T00:00:00Z`));
if (existsSync(hcPath)) {
  const leads = leadsOfIssue(proto, { issueMs: Date.parse(`${hcDay}T00:00:00Z`) }).all;
  const slot = readHindcastSlot(hcPath);
  const a = predictHindcast(eng, tables, off, proto, slot, leads), b = predictHindcast(eng, tables, on, proto, slot, leads);
  const d = diffProfile(a.data, b.data, leads);
  touched += d.n;
  console.log(`| Hindcast ${hcDay} | keine | ${d.n} | ${d.total} | ${d.txt} | ${shaOf(a.data).slice(0, 12)} | ${shaOf(b.data).slice(0, 12)} |`);
} else console.log(`| Hindcast ${hcDay} | — | Slot fehlt | | | | |`);
console.log(`\n${touched === 0 ? 'Die Option berührt keinen Wert dieser Fälle (byte-gleich).' : `Die Option ändert ${touched} Werte dieser Fälle — der Prüfstand-Kandidat ${reg.id} ist ohne sie gemessen.`}`);
