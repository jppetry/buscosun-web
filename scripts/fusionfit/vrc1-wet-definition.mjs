/**
 * vrc1-wet-definition.mjs — V-RC-1 (audit/regenchance.md §11): which reading of "precipitation yes/no in this hour" matches the
 * station better on the same archive rows — A = 1 − pDry (map field, chance, dashboard) or B = exceedance(dist, 0.1 mm/h) (rain
 * window, phase RB)? Rule frozen BEFORE this ran: audit/regenchance/vrc1-regel.md (+ .sha256). Reads stack-extract rows only.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/vrc1-wet-definition.mjs
 *        [--rows=C:/dev/buscosun-hindcast/score/2026-10-02-f8r-b/rows.jsonl.gz] [--cand=F8r] [--out=audit/regenchance/vrc1-ergebnis.json]
 */
import { createReadStream, writeFileSync, readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { exceedance } from '../../src/pointForecast/fusion/dist.ts';
import { BrierAcc, EtsAcc, PairAcc, benjaminiHochberg } from './lib/stats.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const ROWS = args.rows ?? 'C:/dev/buscosun-hindcast/score/2026-10-02-f8r-b/rows.jsonl.gz';
const CAND = args.cand ?? 'F8r';
const OUT = args.out ?? 'audit/regenchance/vrc1-ergebnis.json';
const WET_MM = 0.1, WET_MMH = 0.1;
const MODES = { S: 'S', L: 'Lm' };
const BINS = [{ id: '1-6', lo: 1, hi: 6 }, { id: '7-24', lo: 7, hi: 24 }];
const DEFS = { A: (d) => 1 - d.pDry, B: (d) => exceedance(d, WET_MMH) };

const rule = readFileSync('audit/regenchance/vrc1-regel.md');
const ruleSha = createHash('sha256').update(rule).digest('hex');
const frozen = readFileSync('audit/regenchance/vrc1-regel.sha256', 'utf8');
if (!frozen.startsWith(ruleSha)) throw new Error(`Regel geändert seit dem Einfrieren: ${ruleSha} ≠ ${frozen.slice(0, 64)}`);

const get = (m, k, f) => { let v = m.get(k); if (!v) { v = f(); m.set(k, v); } return v; };
const brier = new Map(), ets = new Map(), pairs = new Map(), means = new Map();
let header = null, rows = 0, used = 0, skippedKind = 0;
const rl = createInterface({ input: createReadStream(ROWS).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line) continue;
  const j = JSON.parse(line);
  if (!header) { header = j; continue; }
  rows++;
  const p = j.v?.precip;
  if (!p || j.tier !== 't1' || !(j.lead >= 1 && j.lead <= 24) || !Number.isFinite(p.y)) continue;
  const bin = BINS.find((b) => j.lead >= b.lo && j.lead <= b.hi).id;
  const wet = p.y >= WET_MM ? 1 : 0;
  for (const [mode, key] of Object.entries(MODES)) {
    const d = p[key]?.[CAND];
    if (!d) continue;
    if (d.kind !== 'hurdleLogNormal') { skippedKind++; continue; }
    used++;
    const pr = {};
    for (const [def, f] of Object.entries(DEFS)) {
      const v = Math.min(1, Math.max(0, f(d)));
      pr[def] = v;
      for (const st of ['all', `country:${j.cc}`]) {
        get(brier, `${mode}|${bin}|${def}|${st}`, () => new BrierAcc()).add(v, wet);
        get(ets, `${mode}|${bin}|${def}|${st}`, () => new EtsAcc()).add(v >= 0.5, wet === 1);
        const m = get(means, `${mode}|${bin}|${def}|${st}`, () => ({ n: 0, p: 0 })); m.n++; m.p += v;
      }
    }
    for (const st of ['all', `country:${j.cc}`]) get(pairs, `${mode}|${bin}|${st}`, () => new PairAcc()).add(j.d, (pr.B - wet) ** 2, (pr.A - wet) ** 2);
  }
}

// Primary tuples: B (candidate) against A (reference) — skill > 0 ⇔ B better.
const prim = [];
for (const mode of Object.keys(MODES)) for (const b of BINS) prim.push({ mode, bin: b.id, s: pairs.get(`${mode}|${b.id}|all`)?.summary() ?? null });
const adj = benjaminiHochberg(prim.map((t) => t.s?.dm?.p ?? NaN));
prim.forEach((t, i) => { t.pBH = adj[i]; t.sig = Number.isFinite(adj[i]) && adj[i] < 0.05; t.bBetter = t.sig && t.s.skill > 0; t.aBetter = t.sig && t.s.skill < 0; });
const nB = prim.filter((t) => t.bBetter).length, nA = prim.filter((t) => t.aBetter).length;
const verdict = nB >= 2 && nA === 0 ? 'B BESSER — RB behält 0,1 mm/h, Korrektur in eine gemeinsame Nachkalibrierung' : 'A BESSER ODER GLEICHAUF — eine Definition: 1 − pDry, der Regenbeginn wird umgestellt';

const out = {
  kind: 'v-rc-1/wet-definition', builtAt: new Date().toISOString(), rows: ROWS, cand: CAND, ruleSha256: ruleSha,
  header: { builtAt: header?.builtAt, codeHash: header?.codeHash, variants: header?.variants, slotsFrom: header?.slotsFrom, slots: header?.slots?.length },
  counts: { rows, used, skippedKind },
  primary: prim.map((t) => ({ mode: t.mode, bin: t.bin, n: t.s?.n, days: t.s?.days, skillBvsA: t.s?.skill, p: t.s?.dm?.p, pBH: t.pBH, ci90: t.s?.ci90, bBetter: t.bBetter, aBetter: t.aBetter })),
  verdict, nB, nA,
  brier: Object.fromEntries([...brier].map(([k, a]) => [k, a.summary()])),
  ets: Object.fromEntries([...ets].map(([k, a]) => [k, a.summary()])),
  meanP: Object.fromEntries([...means].map(([k, m]) => [k, m.p / m.n])),
  countryPairs: Object.fromEntries([...pairs].filter(([k]) => !k.endsWith('|all')).map(([k, a]) => { const s = a.summary(); return [k, { n: s?.n, skill: s?.skill, p: s?.dm?.p }]; })),
};
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
const f = (x, n = 4) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(n));
console.log(`[vrc1] ${rows} Zeilen gelesen, ${used} Modus-Zeilen genutzt (t1, Vorlauf 1–24 h), ${skippedKind} ohne Hürde; Regel ${ruleSha.slice(0, 12)}`);
for (const t of out.primary) {
  const bA = brier.get(`${t.mode}|${t.bin}|A|all`).summary(), bB = brier.get(`${t.mode}|${t.bin}|B|all`).summary();
  console.log(`[vrc1] ${t.mode} ${t.bin} h: n ${t.n}, ${t.days} Tage, Basisrate ${f(bA.baseRate, 4)} · mittleres p A ${f(out.meanP[`${t.mode}|${t.bin}|A|all`])} B ${f(out.meanP[`${t.mode}|${t.bin}|B|all`])} · Brier A ${f(bA.brier, 5)} B ${f(bB.brier, 5)} · Skill B gegen A ${f(100 * t.skillBvsA, 2)} % (p ${f(t.p, 3)}, BH ${f(t.pBH, 3)})`);
}
console.log(`[vrc1] URTEIL: ${verdict} (B besser ${nB}, A besser ${nA} von 4)`);
