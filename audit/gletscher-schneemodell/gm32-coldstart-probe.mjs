#!/usr/bin/env node
/**
 * gm32-coldstart-probe.mjs — phase GM, V-GM-32: what a cold start of the melt state does to the published melt document.
 *
 * Reads melt runs straight from a clone of the data repo (`git show <ref>:glacier/v1/melt/<run>.json`, read only) and compares every run that came
 * 3 h after its predecessor (state `cold`) with the run before and the run after: the tile "Fläche ohne Schneedecke" (`ice`, % of the area) and the
 * 7-day index (`ix7`, median), over the glaciers all three runs share.
 *
 *   node audit/gletscher-schneemodell/gm32-coldstart-probe.mjs --repo=C:\dev\buscosun-data-gh [--ref=FETCH_HEAD] [--max=6] [--out=…json]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const repo = args.repo, ref = args.ref ?? 'FETCH_HEAD', max = Number(args.max ?? 6);
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const H = 3_600_000;
const msOf = (r) => Date.UTC(+r.slice(0, 4), +r.slice(4, 6) - 1, +r.slice(6, 8), +r.slice(8, 10));
const runs = git('ls-tree', '--name-only', ref, 'glacier/v1/melt/').split('\n').map((l) => /(\d{10})\.json$/.exec(l)?.[1]).filter(Boolean).sort();
const gaps = runs.map((r, i) => (i ? (msOf(r) - msOf(runs[i - 1])) / H : null));
const hist = {};
for (const g of gaps.slice(1)) hist[g] = (hist[g] ?? 0) + 1;
const docOf = (r) => JSON.parse(git('show', `${ref}:glacier/v1/melt/${r}.json`));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const mean = (a) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null);

// the newest 3-h transitions that have a successor
const cold = runs.map((r, i) => ({ r, i })).filter(({ i }) => gaps[i] === 3 && i + 1 < runs.length).slice(-max);
const cases = [];
for (const { r, i } of cold) {
  const [a, b, c] = [runs[i - 1], r, runs[i + 1]].map(docOf);
  const mapOf = (d) => new Map(d.glaciers.map((x) => [x.id, x]));
  const [ma, mb, mc] = [a, b, c].map(mapOf);
  const ids = [...mb.keys()].filter((id) => ma.has(id) && mc.has(id));
  const col = (m, f) => ids.map((id) => f(m.get(id)));
  const ice = [ma, mb, mc].map((m) => col(m, (x) => x.ice));
  const ix7 = [ma, mb, mc].map((m) => col(m, (x) => x.ix7[1]));
  const jump = ids.filter((id) => mb.get(id).ice - ma.get(id).ice >= 20).length;
  const back = ids.filter((id) => mb.get(id).ice - mc.get(id).ice >= 20).length;
  cases.push({
    runs: [a.run, b.run, c.run], gapH: [gaps[i], gaps[i + 1]], state: [a.state, b.state, c.state], shared: ids.length,
    iceMean: ice.map(mean), iceMedian: ice.map(med), iceUp20: jump, iceDownAgain20: back,
    ix7Median: ix7.map(med), ix7Sum: ix7.map((x) => x.reduce((s, v) => s + v, 0)),
  });
  console.log(`${a.run} → ${b.run} (${b.state.source}) → ${c.run} (${c.state.source}, Alter ${c.state.ageH}) | Fläche ohne Schnee, Mittel ${ice.map(mean).join(' / ')} % | +20 Punkte bei ${jump} von ${ids.length}, danach wieder −20 bei ${back} | ix7-Summe ${ix7.map((x) => x.reduce((s, v) => s + v, 0)).join(' / ')}`);
}
const out = { kind: 'gm32-coldstart-probe', readAt: new Date().toISOString(), ref: git('rev-parse', ref).trim(), runs: runs.length, first: runs[0], last: runs.at(-1), gapsH: hist, cases };
const file = args.out ?? join(dirname(fileURLToPath(import.meta.url)), 'gm32-coldstart-probe.json');
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`Läufe ${runs.length} (${runs[0]} … ${runs.at(-1)}), Abstände ${JSON.stringify(hist)} → ${file}`);
