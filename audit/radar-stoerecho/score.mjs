// Phase SE — SE-1 step B: scores the rule family of §4.2 against the DWD 10-min station truth, by the frozen protocol
// (§4 = audit/radar-stoerecho/claims-frozen.txt). Reads the extractor's slot files and the CDC day files; prints and
// writes the table of all 30 candidates (selection half), the choice by R-SE-1/2, the hold-out (R-SE-3), the bird-night
// stratum (R-SE-4) and the strata of §4.3.
// Usage: node audit/radar-stoerecho/score.mjs <extractDir> <cdcStore> [--out=audit/radar-stoerecho/ergebnis] [--until=YYYYMMDDHHMM]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [exDir, cdcStore] = args.filter((a) => !a.startsWith('--'));
const outDir = opt.out ?? 'audit/radar-stoerecho/ergebnis';
mkdirSync(outDir, { recursive: true });
const DISPLAY_MIN = 0.06, MIN_CELLS = 4, BIRD_NIGHT_FROM = Date.UTC(2026, 9, 12, 17, 0);
const GRID = [];
for (const kernel of [1, 3]) for (const zCap of [10, 15, 20]) for (const rhoMax of [0.70, 0.75, 0.80, 0.85, 0.90]) GRID.push({ rhoMax, zCap, kernel });

// --- data ---
const stations = JSON.parse(readFileSync(join(exDir, 'stations.json'), 'utf8'));
const idIndex = new Map(stations.map((s, i) => [s.id, i]));
const slotFiles = readdirSync(exDir).filter((f) => /^slot-\d{8}_\d{4}\.json$/.test(f)).sort();
const slots = slotFiles.map((f) => JSON.parse(readFileSync(join(exDir, f), 'utf8'))).filter((s) => !opt.until || s.slot.replace('_', '') <= opt.until);
const fmt = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 12);
const days = new Set();
for (const s of slots) { const t = Date.parse(s.validAt); for (const d of [-600000, 300000, 900000]) days.add(fmt(t + d).slice(0, 8)); }
const truth = new Map();   // `${stationIndex}|${stamp}` → [rws, ind, dau]
const hasInd = new Uint8Array(stations.length);
for (const day of days) {
  const p = join(cdcStore, `${day}.txt`);
  if (!existsSync(p)) { console.log(`Wahrheit: ${day}.txt fehlt`); continue; }
  for (const line of readFileSync(p, 'latin1').split(/\r?\n/)) {
    const c = line.split(';'); if (c.length < 6) continue;
    const si = idIndex.get(+c[0]); if (si === undefined) continue;
    const dau = +c[3], rws = +c[4], ind = +c[5];
    truth.set(`${si}|${c[1].trim()}`, [rws, ind, dau]);
    if (ind >= 0) hasInd[si] = 1;
  }
}
const block0 = Math.floor(Date.parse(slots[0].validAt) / 10800000);
const cases = [];   // one per station interval with truth
for (const s of slots) {
  const t = Date.parse(s.validAt), end = fmt(t + 300000), prev = fmt(t - 300000), next = fmt(t + 900000);
  const nat = new Float32Array(new Uint8Array(Buffer.from(s.nat, 'base64')).buffer);
  const rowOf = new Map(s.rows);
  for (let si = 0; si < stations.length; si++) {
    const v = nat[si]; if (!(v === v)) continue;
    const tr = truth.get(`${si}|${end}`); if (!tr || tr[0] <= -900) continue;
    const blue = v >= DISPLAY_MIN - 1e-6;
    const w1 = hasInd[si] ? (tr[1] === 1 || tr[1] === 3 || tr[2] > 0 || tr[0] >= 0.01 ? 1 : 0) : -1;
    const a = truth.get(`${si}|${prev}`), b = truth.get(`${si}|${next}`);
    const w2 = tr[0] >= 0.01 ? 1 : (tr[0] === 0 && a && b && a[0] === 0 && b[0] === 0 ? 0 : -1);
    cases.push({ block: Math.floor(t / 10800000) - block0, t, si, blue, w1, w2, v, sites: blue ? rowOf.get(si) ?? [] : null, km: stations[si].siteKm });
  }
}
const lastT = Date.parse(slots.at(-1).validAt);
console.log(`Stichprobe: ${slots.length} Slots ${slots[0].validAt.slice(0, 16)} … ${slots.at(-1).validAt.slice(0, 16)} UTC, ${cases.length} Stations-Intervalle, Indikator-Stationen ${hasInd.reduce((a, x) => a + x, 0)}`);

// --- the rule on the extracted statistics: identical to siteVote/clutterMask (vote part) ---
function masked(c, th) {
  let clutter = false;
  for (const [, hasSweep, nEv1, zMax1, med1, nEv3, zMax3, med3] of c.sites) {
    if (!hasSweep) return false;
    const nEv = th.kernel === 3 ? nEv3 : nEv1, zMax = th.kernel === 3 ? zMax3 : zMax1, med = th.kernel === 3 ? med3 : med1;
    if (nEv < MIN_CELLS * (th.kernel === 3 ? 3 : 1) || med === null) continue;
    if (med < th.rhoMax && zMax < th.zCap) clutter = true; else return false;
  }
  return clutter;
}

// --- measures ---
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** ratio Σnum/Σden over blocks with a 90-% block-bootstrap interval */
function ratioCI(perBlock /* Map block → [num, den] */) {
  const arr = [...perBlock.values()];
  const num = arr.reduce((a, x) => a + x[0], 0), den = arr.reduce((a, x) => a + x[1], 0);
  const rnd = mulberry32(12345), draws = [];
  for (let d = 0; d < 1000; d++) { let n = 0, m = 0; for (let k = 0; k < arr.length; k++) { const x = arr[Math.floor(rnd() * arr.length)]; n += x[0]; m += x[1]; } if (m > 0) draws.push(n / m); }
  draws.sort((a, b) => a - b);
  return { num, den, p: den ? num / den : NaN, lo: draws[Math.floor(0.05 * draws.length)] ?? NaN, hi: draws[Math.floor(0.95 * draws.length)] ?? NaN };
}
function measure(sel /* cases */, th, truthKey = 'w1') {
  const A = new Map(), B = new Map(); let blue = 0, blueWet = 0, blueAfter = 0, blueWetAfter = 0, wet = 0;
  for (const c of sel) {
    const w = c[truthKey]; if (w < 0) continue;
    if (w === 1) wet++;
    if (!c.blue) continue;
    const m = masked(c, th) ? 1 : 0;
    blue++; if (w === 1) blueWet++;
    if (!m) { blueAfter++; if (w === 1) blueWetAfter++; }
    const tgt = w === 1 ? B : A;
    const e = tgt.get(c.block) ?? [0, 0]; e[0] += m; e[1]++; tgt.set(c.block, e);
  }
  return { a: ratioCI(A), v: ratioCI(B), hitBefore: blueWet / blue, hitAfter: blueWetAfter / blueAfter, covBefore: blueWet / wet, covAfter: blueWetAfter / wet, blue, blueAfter };
}
const pct = (x, d = 1) => (x === x ? (100 * x).toFixed(d) : '—');
const name = (th) => `ρc < ${th.rhoMax.toFixed(2)} · Z < ${th.zCap} dBZ · ${th.kernel === 3 ? '3 × 3' : '1 × 1'}`;
const selHalf = cases.filter((c) => c.block % 2 === 0), holdHalf = cases.filter((c) => c.block % 2 === 1);
const birdNight = cases.filter((c) => c.t >= BIRD_NIGHT_FROM);

const lines = [];
const P = (s) => { console.log(s); lines.push(s); };
P(`# SE-1 Ergebnis (${new Date().toISOString().slice(0, 16)}Z)`);
P('');
P(`Stichprobe ${slots[0].validAt.slice(0, 16)} … ${slots.at(-1).validAt.slice(0, 16)} UTC, ${slots.length} Slots, ${cases.length} Stations-Intervalle; W1 an ${hasInd.reduce((a, x) => a + x, 0)} Indikator-Stationen: ${cases.filter((c) => c.w1 >= 0).length} Intervalle, davon blau ${cases.filter((c) => c.w1 >= 0 && c.blue).length} (A trocken ${cases.filter((c) => c.w1 === 0 && c.blue).length}, B nass ${cases.filter((c) => c.w1 === 1 && c.blue).length}); Blöcke à 3 h: ${new Set(cases.map((c) => c.block)).size}.`);
P('');
P('## Wahl-Hälfte (gerade Blöcke): alle 30 Kandidaten');
P('');
P('| Kandidat | Abräumquote a (A) | Verlust v (B) [90 %] | zulässig (R-SE-1) | Treffer vorher → nachher | Erfassung vorher → nachher |');
P('|---|---|---|---|---|---|');
const scored = GRID.map((th) => ({ th, m: measure(selHalf, th) }));
for (const { th, m } of scored) {
  const ok = m.v.p <= 0.01 && m.v.hi <= 0.02;
  P(`| ${name(th)} | ${pct(m.a.p)} % (${m.a.num}/${m.a.den}) | ${pct(m.v.p, 2)} % [${pct(m.v.lo, 2)}–${pct(m.v.hi, 2)}] (${m.v.num}/${m.v.den}) | ${ok ? 'ja' : 'nein'} | ${pct(m.hitBefore)} → ${pct(m.hitAfter)} % | ${pct(m.covBefore)} → ${pct(m.covAfter)} % |`);
}
const ok = scored.filter(({ m }) => m.v.p <= 0.01 && m.v.hi <= 0.02);
let star = null;
if (ok.length) {
  const best = Math.max(...ok.map(({ m }) => m.a.p));
  star = ok.filter(({ m }) => best - m.a.p < 0.01).sort((x, y) => x.th.rhoMax - y.th.rhoMax || x.th.zCap - y.th.zCap || x.th.kernel - y.th.kernel)[0];
}
P('');
if (!star) { P('**R-SE-1/2: kein zulässiger Kandidat.**'); }
else {
  const th = star.th;
  P(`**R-SE-2: θ\\* = ${name(th)}** (Abräumquote ${pct(star.m.a.p)} %, Verlust ${pct(star.m.v.p, 2)} % [Obergrenze ${pct(star.m.v.hi, 2)} %] auf der Wahl-Hälfte).`);
  P('');
  const h = measure(holdHalf, th), all = measure(cases, th), bn = measure(birdNight, th), bn2 = measure(birdNight, th, 'w2'), all2 = measure(cases, th, 'w2');
  const holdOk = h.v.p <= 0.02 && h.v.hi <= 0.03 && h.hitAfter >= h.hitBefore;
  P('## Abnahme (R-SE-3, ungerade Blöcke) und Strata');
  P('');
  P('| Menge | A: blau und trocken, davon ausgeblendet | B: blau und nass, davon ausgeblendet [90 %] | Treffer vorher → nachher | Erfassung vorher → nachher | blaue Intervalle vorher → nachher |');
  P('|---|---|---|---|---|---|');
  const row = (label, m) => P(`| ${label} | ${pct(m.a.p)} % (${m.a.num}/${m.a.den}) | ${pct(m.v.p, 2)} % [${pct(m.v.lo, 2)}–${pct(m.v.hi, 2)}] (${m.v.num}/${m.v.den}) | ${pct(m.hitBefore)} → ${pct(m.hitAfter)} % | ${pct(m.covBefore)} → ${pct(m.covAfter)} % | ${m.blue} → ${m.blueAfter} |`);
  row('Wahl-Hälfte (W1)', star.m);
  row('**Abnahme-Hälfte (W1)**', h);
  row('ganze Stichprobe (W1)', all);
  row('Zugnacht 12.10. ab 17 UTC (W1)', bn);
  row('Zugnacht (W2, alle Mengen-Stationen)', bn2);
  row('ganze Stichprobe (W2)', all2);
  for (const [label, f] of [['< 50 km', (c) => c.km < 50], ['50–100 km', (c) => c.km >= 50 && c.km < 100], ['100–150 km', (c) => c.km >= 100], ['Tag 06–18 UTC', (c) => { const hh = new Date(c.t).getUTCHours(); return hh >= 6 && hh < 18; }], ['Nacht', (c) => { const hh = new Date(c.t).getUTCHours(); return hh < 6 || hh >= 18; }], ['Regentag 11.10. (W1)', (c) => new Date(c.t).getUTCDate() === 11]]) row(label, measure(cases.filter(f), th));
  P('');
  const nBird = bn.a.den;
  const birdOk = nBird >= 30 ? bn.a.p >= 0.5 : bn2.a.p >= 0.5;
  P(`**R-SE-3 Abnahme:** Verlust ${pct(h.v.p, 2)} % (Obergrenze ${pct(h.v.hi, 2)} %), Treffer ${pct(h.hitBefore)} → ${pct(h.hitAfter)} % ⇒ ${holdOk ? 'bestanden' : 'NICHT bestanden'}.`);
  P(`**R-SE-4 Zugnacht:** W1 ${nBird} Fälle in A${nBird < 30 ? ' (< 30 ⇒ W2 zählt)' : ''}; abgeräumt W1 ${pct(bn.a.p)} %, W2 ${pct(bn2.a.p)} % (${bn2.a.num}/${bn2.a.den}) ⇒ ${birdOk ? 'erreicht' : 'NICHT erreicht'}.`);
  P(`**Urteil:** ${holdOk && birdOk ? 'Einschalten empfohlen.' : 'Filter gebaut, Schalter aus.'}`);
  writeFileSync(join(outDir, 'score.json'), JSON.stringify({ at: new Date().toISOString(), sample: { from: slots[0].validAt, to: slots.at(-1).validAt, slots: slots.length, cases: cases.length }, star: th, selection: star.m, holdout: h, all, birdNight: bn, birdNightW2: bn2, allW2: all2, holdOk, birdOk, grid: scored.map(({ th: t, m }) => ({ ...t, a: m.a.p, aN: m.a.den, v: m.v.p, vHi: m.v.hi, vN: m.v.den })) }, null, 1));
}
writeFileSync(join(outDir, 'score.md'), lines.join('\n') + '\n');
// every blue case with its site statistics — the source of the verifier fixture (fixture-export.mjs); 1,6 MB, kept beside
// the extract, not in the repo
writeFileSync(join(exDir, 'cases-blue.json'), JSON.stringify(cases.filter((c) => c.blue && (c.w1 >= 0 || c.w2 >= 0)).map((c) => [c.block, c.t, stations[c.si].id, c.w1, c.w2, Math.round(c.v * 1000) / 1000, c.sites])));
