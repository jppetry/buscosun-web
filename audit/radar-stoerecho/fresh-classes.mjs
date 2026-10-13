// Phase SE — reading aid for R-SE-8 (not part of the frozen rule): what is the blue that STAYS at dry stations in the
// fresh slots? Per blue station interval after the first sample, the reason of the rule's outcome from the per-site
// 3 × 3 statistics of extract.mjs — a site votes "precipitation" either because its noise-corrected rhoHV median is
// at/above the cut (rain signature) or because the echo reaches the reflectivity cap with a low rhoHV (the case a
// strong non-precipitation echo would slip through). Rule = CLUTTER_RULE (0.80, 0.85 from 72 cells, 15 dBZ, kernel 3),
// without the fill.
// Usage: node audit/radar-stoerecho/fresh-classes.mjs <extractDir> <cdcStore> [--to=202610130345] [--out=<file.md>]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [exDir, cdcStore] = args.filter((a) => !a.startsWith('--'));
const FIRST_SAMPLE_END = Date.UTC(2026, 9, 12, 23, 5);
const RHO_MAX = 0.8, RHO_MAX_RICH = 0.85, RICH_CELLS = 72, Z_CAP = 15, MIN_CELLS_3 = 12;
const fmt = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 12);
const stations = JSON.parse(readFileSync(join(exDir, 'stations.json'), 'utf8'));
const idIndex = new Map(stations.map((s, i) => [s.id, i]));
const slots = readdirSync(exDir).filter((f) => /^slot-\d{8}_\d{4}\.json$/.test(f)).sort()
  .map((f) => JSON.parse(readFileSync(join(exDir, f), 'utf8')))
  .filter((s) => Date.parse(s.validAt) > FIRST_SAMPLE_END && (!opt.to || fmt(Date.parse(s.validAt)) <= opt.to));
const days = new Set();
for (const s of slots) { const t = Date.parse(s.validAt); for (const d of [-4200000, 300000, 4500000]) days.add(fmt(t + d).slice(0, 8)); }
const truth = new Map();
for (const day of days) {
  const p = join(cdcStore, `${day}.txt`); if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'latin1').split(/\r?\n/)) {
    const c = line.split(';'); if (c.length < 6) continue;
    const si = idIndex.get(+c[0]); if (si === undefined) continue;
    truth.set(`${si}|${c[1].trim()}`, [+c[4], +c[5], +c[3]]);
  }
}
// one site's vote and its reason (row of extract.mjs: [siteIndex, hasSweep, nEv1, zMax1, med1, nEv3, zMax3, med3])
function siteReason(s) {
  const hasSweep = s[1], nEv = s[5], zMax = s[6], med = s[7];
  if (!hasSweep || nEv < MIN_CELLS_3) return 'none';
  const cut = nEv >= RICH_CELLS ? RHO_MAX_RICH : RHO_MAX;
  if (med >= cut) return 'rain';
  return zMax < Z_CAP ? 'clutter' : 'cap';
}
const CLASSES = ['ausgeblendet', 'Niederschlag-Stimme: ρc über dem Schnitt', 'Niederschlag-Stimme: ρc darunter, Echo ≥ 15 dBZ', 'keine Aussage'];
const SETS = ['A₂ (W2 trocken)', 'B₂ (W2 nass)', 'A (W1 trocken)', 'B (W1 nass)'];
const count = SETS.map(() => CLASSES.map(() => 0));
const rho = [[], []], zmax = [[], []], bySite = {};
let a2Rain = 0, a2RainWetNear = 0;
for (const s of slots) {
  const t = Date.parse(s.validAt);
  for (const [si, sites] of s.rows) {
    const g = (dt) => truth.get(`${si}|${fmt(t + dt)}`);
    const tr = g(300000), a = g(-300000), b = g(900000);
    if (!tr || tr[0] <= -900) continue;
    const w2 = tr[0] >= 0.01 ? 1 : (tr[0] === 0 && a && b && a[0] === 0 && b[0] === 0 ? 0 : -1);
    const w1 = tr[1] >= 0 ? (tr[1] === 1 || tr[1] === 3 || tr[2] > 0 || tr[0] >= 0.01 ? 1 : 0) : -1;
    const reasons = sites.map(siteReason);
    const cls = reasons.includes('rain') ? 1 : reasons.includes('cap') ? 2 : reasons.includes('clutter') ? 0 : 3;
    if (w2 === 0) count[0][cls]++; if (w2 === 1) count[1][cls]++; if (w1 === 0) count[2][cls]++; if (w1 === 1) count[3][cls]++;
    if (w2 >= 0) {
      const best = sites.filter((x) => x[1] && x[5] >= MIN_CELLS_3).sort((x, y) => y[5] - x[5])[0];
      if (best) { rho[w2].push(best[7]); zmax[w2].push(best[6]); if (w2 === 0 && cls === 1) bySite[s.sites[best[0]]] = (bySite[s.sites[best[0]]] ?? 0) + 1; }
    }
    if (w2 === 0 && cls === 1) {
      a2Rain++;
      let near = false;
      for (let k = 2; k <= 7 && !near; k++) { const x = g(300000 + k * 600000), y = g(300000 - k * 600000); near = (x && x[0] >= 0.01) || (y && y[0] >= 0.01); }
      if (near) a2RainWetNear++;
    }
  }
}
const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN; };
const lines = [];
const P = (s) => { console.log(s); lines.push(s); };
P(`# SE — frische Slots: was an trockenen Stationen blau bleibt (${new Date().toISOString().slice(0, 16)}Z)`);
P('');
P(`Slots ${slots.length}: ${slots[0]?.validAt.slice(0, 16)} … ${slots.at(-1)?.validAt.slice(0, 16)} UTC. Regel 0,80 / 0,85 ab 72 Zellen / 15 dBZ / 3 × 3, ohne Randschluss.`);
P('');
P(`| Menge | n | ${CLASSES.join(' | ')} |`);
P(`|---|---|${CLASSES.map(() => '---').join('|')}|`);
for (const [i, name] of SETS.entries()) P(`| ${name} | ${count[i].reduce((x, y) => x + y, 0)} | ${count[i].join(' | ')} |`);
P('');
for (const [w, name] of [[0, 'A₂'], [1, 'B₂']]) P(`- ${name}, Standort mit der größten Aussage (n ${rho[w].length}): Median ρc P10/P50/P90 ${[0.1, 0.5, 0.9].map((p) => q(rho[w], p).toFixed(3)).join(' / ')}; stärkstes Echo P10/P50/P90 ${[0.1, 0.5, 0.9].map((p) => q(zmax[w], p).toFixed(1)).join(' / ')} dBZ.`);
P(`- A₂ mit Niederschlag-Stimme (ρc über dem Schnitt): ${a2Rain}; davon misst dieselbe Station innerhalb von ± 70 min Niederschlag: ${a2RainWetNear}.`);
P(`- A₂ mit Niederschlag-Stimme nach dem Standort mit der größten Aussage: ${Object.entries(bySite).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
if (opt.out) writeFileSync(opt.out, lines.join('\n') + '\n');
