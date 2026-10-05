#!/usr/bin/env node
/**
 * treue.mjs — replay fidelity of the Prüfstand (gate G-PS2 in the form of E-PS-13): the replay of a registered version
 * against the STORED rows of the measurement runs of phase AX (`buscosun-hindcast/score/<run>/rows.jsonl.gz`: per point
 * and native step the distribution parameters, rounded to 4 decimals), plus determinism (two runs, same bytes).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/pruefstand/treue.mjs [--tage=2026-09-29,2026-09-30] [--versionen=fusion-7,…] [--json=<file>]
 *
 * The measurement runs computed every station WITH its own station product and measurement (mode S), on the native
 * steps (`hourly: false, tail: false`), the measurement carrying its dew point. On issue days inside a fit window they
 * used fold tables (leave-day-out) — there the replay with the delivered tables must differ; the gate reads the days
 * AFTER every fit window. In the run `2026-10-02-f8r-b` the key `F7a` is the stage of Fusion 7 (wind anchor only; `F7`
 * there would add the climate grid, which was never switched on). A version without stored rows is marked "Treue nicht prüfbar" (never reconstructed otherwise).
 */
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { H, HINDCAST_ROOT, hashOf, p, parseArgs, sha256, writeJson } from './lib/common.mjs';
import { loadProtocol } from './lib/protokoll.mjs';
import { archiveIssues, leadsOfIssue } from './lib/konserven.mjs';
import { engineRoot, listRegister, withTablePaths } from './lib/register.mjs';
import { loadEngine, loadTables, predictArchive } from './lib/replay.mjs';
import { readArchiveSlot } from '../fusionfit/lib/archiveAdapter.mjs';

const args = parseArgs();
const proto = loadProtocol();
/** Which stored run and which key of a row's `S` block is the chain of a version (D-PS-7 f). */
const STORED = { 'fusion-5e': ['2026-10-02-f8r-b', 'P'], 'fusion-6': ['2026-10-01-f7', 'F6'], 'fusion-7': ['2026-10-02-f8r-b', 'F7a'], 'fusion-8': ['2026-10-02-f8r-b', 'F8r'] };
const FUSED = { t: 'temperature', td: 'dewPoint', ws: 'windSpeed', gust: 'gust', clct: 'clouds', precip: 'precipitation' };
const ROUND = 6e-5;   // the stored parameters are rounded to 4 decimals
const regsAll = listRegister();
const regs = args.versionen ? regsAll.filter((r) => String(args.versionen).split(',').includes(r.id)) : regsAll;
const lastFit = regsAll.flatMap((r) => Object.values(r.fit).filter((w) => w.source === 'archive').map((w) => w.to)).sort().at(-1);
const issues = archiveIssues().filter((i) => (args.tage ? String(args.tage).split(',').includes(i.day) : i.day > lastFit));
const floors = new Set(issues.map((i) => i.issueMs / H));   // a stored row belongs to the slot whose floor hour is V − lead
console.log(`Treue-Tage: ${issues.map((i) => i.day).join(', ')} (nach dem letzten Fit-Fenster am Archiv, ${lastFit})`);

// stored rows of the wanted days: file → Map(`${id}|${d}|${V}` → { var: { key: dist } })
const stored = new Map();
for (const run of new Set(Object.values(STORED).map((x) => x[0]))) {
  const keys = Object.values(STORED).filter((x) => x[0] === run).map((x) => x[1]);
  const m = new Map();
  const rl = createInterface({ input: createReadStream(p(HINDCAST_ROOT, 'score', run, 'rows.jsonl.gz')).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.startsWith('{"id"')) continue;
    const r = JSON.parse(line), o = {};
    if (!floors.has(r.V - r.lead)) continue;
    for (const [v, e] of Object.entries(r.v)) { const s = {}; for (const k of keys) if (e.S?.[k]) s[k] = e.S[k]; if (Object.keys(s).length) o[v] = s; }
    m.set(`${r.id}|${r.V}|${r.lead}`, o);
  }
  stored.set(run, m);
  console.log(`gespeicherte Zeilen ${run}: ${m.size}`);
}

const out = { kind: 'pruefstand/treue', protocol: proto.hash, days: issues.map((i) => i.day), round: ROUND, versions: {} };
for (const reg0 of regs) {
  // --klima=loso: the measurement runs took the leave-station-out climatology of the fit table at the point for EVERY variant;
  // the shipped stage reads the published product (register `clima: product`). The fidelity form therefore overrides it.
  const reg = { ...withTablePaths(reg0), ...(args.klima === 'loso' && reg0.clima !== 'loso' ? { clima: 'loso', climaOverride: true } : {}) }, st = STORED[reg.id];
  const eng = await loadEngine(engineRoot(reg0).root), tables = loadTables(reg);
  const res = { stored: st ? `${st[0]} · ${st[1]}` : null, byVar: {}, determinism: null };
  for (const issue of issues) {
    const slot = readArchiveSlot(issue.path), leads = leadsOfIssue(proto, issue).all, floorH = issue.issueMs / H;
    if (st) {
      const rows = stored.get(st[0]);
      predictArchive(eng, tables, reg, proto, slot, leads, { mode: 'S', engineOpts: { hourly: false, tail: false }, onStep: (stn, r) => {
        for (const step of r.steps) {
          if (step.interpolated || !step.fused || !['t1', 't2', 't3'].includes(step.tier)) continue;
          const row = rows.get(`${stn.id}|${step.validAtMs / H}|${step.validAtMs / H - floorH}`);
          if (!row) continue;
          for (const [v, key] of Object.entries(FUSED)) {
            const a = row[v]?.[st[1]], b = step.fused[key]?.dist;
            if (!a || !b) continue;
            const o = (res.byVar[`${issue.day}|${v}`] ??= { n: 0, kindDiffers: 0, withinRounding: 0, maxLocation: 0, maxScale: 0, maxOther: 0 });
            o.n += 1;
            if (a.kind !== b.kind) { o.kindDiffers += 1; continue; }
            let worst = 0;
            for (const [f, x] of Object.entries(a)) { if (typeof x !== 'number' || typeof b[f] !== 'number') continue; const dev = Math.abs(x - b[f]); worst = Math.max(worst, dev); if (f === 'mu' || f === 'nu') o.maxLocation = Math.max(o.maxLocation, dev); else if (f === 'sigma') o.maxScale = Math.max(o.maxScale, dev); else o.maxOther = Math.max(o.maxOther, dev); }
            if (worst < ROUND) o.withinRounding += 1;
          }
        }
      } });
    }
    if (issue === issues[0]) {
      const h1 = sha256(Buffer.from(predictArchive(eng, tables, reg, proto, slot, leads).data.buffer)), h2 = sha256(Buffer.from(predictArchive(eng, tables, reg, proto, slot, leads).data.buffer));
      res.determinism = { day: issue.day, equal: h1 === h2, sha256: h1.slice(0, 16) };
    }
  }
  out.versions[reg.id] = res;
  console.log(`\n${reg.id}: ${st ? `gegen ${res.stored}` : 'Treue nicht prüfbar (keine gespeicherten Zeilen dieser Version)'} · Determinismus ${res.determinism.equal ? 'byte-gleich' : 'ABWEICHUNG'} (${res.determinism.day})`);
  for (const [k, o] of Object.entries(res.byVar).sort()) console.log(`  ${k.padEnd(20)} n ${String(o.n).padStart(6)}  in der Rundung ${(100 * o.withinRounding / o.n).toFixed(2).padStart(6)} %  Art anders ${o.kindDiffers}  max Lage ${o.maxLocation.toFixed(5)}  max Streuung ${o.maxScale.toFixed(5)}  max sonst ${o.maxOther.toFixed(5)}`);
}
out.hash = hashOf(out.versions);
if (args.json) writeJson(String(args.json), out);
