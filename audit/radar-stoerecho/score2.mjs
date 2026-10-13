// Phase SE — Nachtrag A1 (§5a = claims-addendum-1.txt): scores the six variants from the station files of stations.mjs.
// R-SE-6 (choice on the selection half), R-SE-7 (hold-out), R-SE-5 (fill on the chosen variant), R-SE-8 (fresh slots after
// the first sample). Cross-check: "Basis" without fill must reproduce score.mjs (θ*) on the first sample.
// Usage: node audit/radar-stoerecho/score2.mjs <stationsOutDir> <extractDir> <cdcStore> [--out=audit/radar-stoerecho/ergebnis]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [stDir, exDir, cdcStore] = args.filter((a) => !a.startsWith('--'));
const outDir = opt.out ?? 'audit/radar-stoerecho/ergebnis';
mkdirSync(outDir, { recursive: true });
const NAMES = ['Basis', 'N', 'R85', 'R90', 'N + R85', 'N + R90'];
const FIRST_SAMPLE_END = Date.UTC(2026, 9, 12, 23, 5), BIRD_NIGHT_FROM = Date.UTC(2026, 9, 12, 17, 0);

const stations = JSON.parse(readFileSync(join(exDir, 'stations.json'), 'utf8'));
const idIndex = new Map(stations.map((s, i) => [s.id, i]));
const slots = readdirSync(stDir).filter((f) => /^st-\d{8}_\d{4}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(stDir, f), 'utf8')));
const fmt = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 12);
const days = new Set();
for (const s of slots) { const t = Date.parse(s.validAt); for (const d of [-600000, 300000, 900000]) days.add(fmt(t + d).slice(0, 8)); }
const truth = new Map(), hasInd = new Uint8Array(stations.length);
for (const day of days) {
  const p = join(cdcStore, `${day}.txt`);
  if (!existsSync(p)) { console.log(`Wahrheit: ${day}.txt fehlt`); continue; }
  for (const line of readFileSync(p, 'latin1').split(/\r?\n/)) {
    const c = line.split(';'); if (c.length < 6) continue;
    const si = idIndex.get(+c[0]); if (si === undefined) continue;
    truth.set(`${si}|${c[1].trim()}`, [+c[4], +c[5], +c[3]]);
    if (+c[5] >= 0) hasInd[si] = 1;
  }
}
const block0 = Math.floor(Date.parse(slots[0].validAt) / 10800000);
const cases = [];
let noTruth = 0;
for (const s of slots) {
  const t = Date.parse(s.validAt), end = fmt(t + 300000), prev = fmt(t - 300000), next = fmt(t + 900000);
  for (const [si, flags] of s.rows) {
    const tr = truth.get(`${si}|${end}`); if (!tr || tr[0] <= -900) { noTruth++; continue; }
    const w1 = hasInd[si] ? (tr[1] === 1 || tr[1] === 3 || tr[2] > 0 || tr[0] >= 0.01 ? 1 : 0) : -1;
    const a = truth.get(`${si}|${prev}`), b = truth.get(`${si}|${next}`);
    const w2 = tr[0] >= 0.01 ? 1 : (tr[0] === 0 && a && b && a[0] === 0 && b[0] === 0 ? 0 : -1);
    cases.push({ block: Math.floor(t / 10800000) - block0, t, si, w1, w2, flags, km: stations[si].siteKm });
  }
}
const isMasked = (c, v, fill) => c.flags[2 * v] === 1 || (fill && c.flags[2 * v + 1] === 1);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function ratio(sel, inSet, v, fill) {
  const per = new Map();
  for (const c of sel) { if (!inSet(c)) continue; const e = per.get(c.block) ?? [0, 0]; e[0] += isMasked(c, v, fill) ? 1 : 0; e[1]++; per.set(c.block, e); }
  const arr = [...per.values()], num = arr.reduce((a, x) => a + x[0], 0), den = arr.reduce((a, x) => a + x[1], 0);
  const rnd = mulberry32(12345), draws = [];
  for (let d = 0; d < 1000; d++) { let n = 0, m = 0; for (let k = 0; k < arr.length; k++) { const x = arr[Math.floor(rnd() * arr.length)]; n += x[0]; m += x[1]; } if (m > 0) draws.push(n / m); }
  draws.sort((a, b) => a - b);
  return { num, den, p: den ? num / den : NaN, lo: draws[Math.floor(0.05 * draws.length)] ?? NaN, hi: draws[Math.floor(0.95 * draws.length)] ?? NaN };
}
const A = (c) => c.w1 === 0, B = (c) => c.w1 === 1, A2 = (c) => c.w2 === 0, B2 = (c) => c.w2 === 1, AU = (c) => c.w1 === 0 || c.w2 === 0;
const hit = (sel, v, fill) => { let blue = 0, wet = 0, blueA = 0, wetA = 0; for (const c of sel) { if (c.w1 < 0) continue; blue++; if (c.w1 === 1) wet++; if (!isMasked(c, v, fill)) { blueA++; if (c.w1 === 1) wetA++; } } return [wet / blue, wetA / blueA]; };
const pct = (x, d = 1) => (x === x ? (100 * x).toFixed(d) : '—');
const f = (r, d = 1) => `${pct(r.p, d)} % (${r.num}/${r.den})`;
const fci = (r) => `${pct(r.p, 2)} % [${pct(r.lo, 2)}–${pct(r.hi, 2)}] (${r.num}/${r.den})`;

const first = cases.filter((c) => c.t <= FIRST_SAMPLE_END), fresh = cases.filter((c) => c.t > FIRST_SAMPLE_END);
const sel = first.filter((c) => c.block % 2 === 0), hold = first.filter((c) => c.block % 2 === 1);
const lines = []; const P = (s) => { console.log(s); lines.push(s); };
P(`# SE Nachtrag A1 — Ergebnis (${new Date().toISOString().slice(0, 16)}Z)`);
P('');
P(`Slots ${slots.length} (${slots[0].validAt.slice(0, 16)} … ${slots.at(-1).validAt.slice(0, 16)} UTC), blaue Stations-Intervalle mit Wahrheit ${cases.length} (ohne Wahrheit ${noTruth}); erste Stichprobe ${first.length}, frisch ${fresh.length}.`);
const base = { a: ratio(first, A, 0, false), v: ratio(first, B, 0, false) };
P(`Gegenprobe Basis = θ* aus score.mjs (ganze erste Stichprobe, W1): A ${f(base.a)}, B ${fci(base.v)} — erwartet 12/181 und 18/2911.`);
P('');
P('## Wahl-Hälfte (R-SE-6)');
P('');
P('| Variante | Verlust v (B, W1) [90 %] | zulässig | abgeräumt A ∪ A₂ | abgeräumt A (W1) | Verlust B₂ (W2) |');
P('|---|---|---|---|---|---|');
const scored = NAMES.map((name, v) => ({ name, v, loss: ratio(sel, B, v, false), au: ratio(sel, AU, v, false), a: ratio(sel, A, v, false), loss2: ratio(sel, B2, v, false) }));
for (const s of scored) { s.ok = s.loss.p <= 0.01 && s.loss.hi <= 0.02; P(`| ${s.name} | ${fci(s.loss)} | ${s.ok ? 'ja' : 'nein'} | ${f(s.au)} | ${f(s.a)} | ${fci(s.loss2)} |`); }
const okList = scored.filter((s) => s.ok);
const best = Math.max(...okList.map((s) => s.au.p));
let star = okList.filter((s) => best - s.au.p < 0.01).sort((x, y) => x.v - y.v)[0];
P('');
P(`**R-SE-6: gewählt „${star.name}"** (abgeräumt A ∪ A₂ ${f(star.au)}, Verlust ${fci(star.loss)}).`);
P('');
const accept = (s) => { const l = ratio(hold, B, s.v, false), l2 = ratio(hold, B2, s.v, false), [hb, ha] = hit(hold, s.v, false); return { l, l2, hb, ha, ok: l.p <= 0.02 && l.hi <= 0.03 && ha >= hb && l2.p <= 0.02 }; };
let acc = accept(star);
P('## Abnahme-Hälfte (R-SE-7)');
P('');
P(`„${star.name}": Verlust W1 ${fci(acc.l)}, Verlust W2 ${fci(acc.l2)}, Treffer ${pct(acc.hb)} → ${pct(acc.ha)} %, abgeräumt A ∪ A₂ ${f(ratio(hold, AU, star.v, false))} ⇒ **${acc.ok ? 'bestanden' : 'NICHT bestanden — es gilt die Basis'}**.`);
if (!acc.ok) { star = scored[0]; acc = accept(star); }
P('');
P('## Randschluss (R-SE-5) auf der gewählten Variante');
P('');
const fl = { sel: ratio(sel, B, star.v, true), hold: ratio(hold, B, star.v, true), au: ratio(first, AU, star.v, true), au0: ratio(first, AU, star.v, false) };
const fillOk = fl.sel.p <= 0.01 && fl.sel.hi <= 0.02;
P(`Verlust mit Randschluss: Wahl-Hälfte ${fci(fl.sel)}, Abnahme-Hälfte ${fci(fl.hold)}; abgeräumt A ∪ A₂ (ganze erste Stichprobe) ${f(fl.au0)} → ${f(fl.au)} ⇒ Randschluss **${fillOk ? 'zulässig' : 'bleibt aus'}**.`);
P('');
P('## Alle Varianten, ganze erste Stichprobe (Bericht)');
P('');
P('| Variante | A (W1) | B (W1) [90 %] | A₂ (W2) | B₂ (W2) | Zugnacht A₂ | Zugnacht mit Randschluss A₂ | 100–150 km B |');
P('|---|---|---|---|---|---|---|---|');
const night = first.filter((c) => c.t >= BIRD_NIGHT_FROM), far = first.filter((c) => c.km >= 100);
for (const s of scored) P(`| ${s.name} | ${f(ratio(first, A, s.v, false))} | ${fci(ratio(first, B, s.v, false))} | ${f(ratio(first, A2, s.v, false))} | ${fci(ratio(first, B2, s.v, false))} | ${f(ratio(night, A2, s.v, false))} | ${f(ratio(night, A2, s.v, true))} | ${fci(ratio(far, B, s.v, false))} |`);
P('');
if (fresh.length) {
  P(`## Frische Slots (R-SE-8): ${new Date(Math.min(...fresh.map((c) => c.t))).toISOString().slice(0, 16)} … ${new Date(Math.max(...fresh.map((c) => c.t))).toISOString().slice(0, 16)} UTC`);
  P('');
  const nightF = fresh.filter((c) => { const h = new Date(c.t).getUTCHours(); return h < 6 || h >= 18; });
  P('| Variante | B (W1) | B₂ (W2) | A₂ nachts (W2) | A₂ nachts mit Randschluss | A (W1) |');
  P('|---|---|---|---|---|---|');
  // all six for the record (E-SE-2 reads "N + R85" here); the verdict below is about the chosen variant against Basis
  for (const s of scored) P(`| ${s.name} | ${fci(ratio(fresh, B, s.v, false))} | ${fci(ratio(fresh, B2, s.v, false))} | ${f(ratio(nightF, A2, s.v, false))} | ${f(ratio(nightF, A2, s.v, true))} | ${f(ratio(fresh, A, s.v, false))} |`);
  const lb = ratio(fresh, B, star.v, false), lb2 = ratio(fresh, B2, star.v, false), rn = ratio(nightF, A2, star.v, false), rn0 = ratio(nightF, A2, 0, false);
  const enough = lb.den >= 100 ? lb.p <= 0.02 : lb2.den >= 100 ? lb2.p <= 0.02 : null;
  P('');
  P(`**R-SE-8:** Verlust ${lb.den >= 100 ? `W1 ${fci(lb)}` : lb2.den >= 100 ? `W2 ${fci(lb2)} (W1 nur ${lb.den} Fälle)` : `nicht messbar (B ${lb.den}, B₂ ${lb2.den} Fälle < 100)`}; nachts abgeräumt ${f(rn)} gegen Basis ${f(rn0)} ⇒ ${enough === null ? 'OFFEN (zu wenig Regen in den frischen Slots)' : enough && rn.p >= rn0.p ? 'bestätigt' : 'NICHT bestätigt'}.`);
}
writeFileSync(join(outDir, 'score2.md'), lines.join('\n') + '\n');
writeFileSync(join(outDir, 'score2.json'), JSON.stringify({ at: new Date().toISOString(), chosen: star.name, variantIndex: star.v, acceptOk: acc.ok, fillOk, selection: scored.map((s) => ({ name: s.name, loss: s.loss, au: s.au, ok: s.ok })), holdout: { loss: acc.l, loss2: acc.l2, hitBefore: acc.hb, hitAfter: acc.ha }, fill: fl, cases: { first: first.length, fresh: fresh.length } }, null, 1));
// every blue case of the first sample with truth, flags of Basis and the chosen variant (kept beside the station files)
writeFileSync(join(stDir, 'cases2.json'), JSON.stringify(first.map((c) => [c.block, stations[c.si].id, c.w1, c.w2, c.flags[0], c.flags[2 * star.v], c.flags[2 * star.v + 1]])));
