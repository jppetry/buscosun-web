#!/usr/bin/env node
/**
 * GM-11 step 1.2a — the 24-h windows of the shadow pairs, split into fresh snow and the loss of the older deck (never the ratio alone).
 * Read only. Window = pairs of a 17-UTC run B against the 17-UTC run A 24 h earlier, per pair (glacier, station) with a station value in both.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm11-windows.mjs \
 *     [--cache=C:\dev\buscosun-glacier-cache\gm11] [--fetch] [--audit=audit/gletscher-schneemodell.md] [--out=<json>]
 *
 *   --fetch   copies the archived pairs (`buscosun-archiv glacier/v1/<day>/pairs-<run>.json.gz`, raw at the archive head, blob hash checked) into
 *             `<cache>/archive/`; a pairs file the archive does not hold yet is taken from `<cache>/runs/<run>/pairs.json` (gm11-save-runs.mjs).
 *   --audit   rewrites the block between `<!-- gm11-windows:start -->` and `<!-- gm11-windows:end -->` (all windows, regenerated each time).
 *
 * Columns per (window, country, network, group: snowfall = station ≥ +3 cm / other):
 *   hn24    new snow of the window as the model holds it at B (pairs `hn[0]`, settled, at station elevation) — always available
 *   fresh   booked solid precipitation × 100 / 96 (from the hourly chunks of the runs that carried the window, only when every one is cached
 *           and the chain is complete: each run's `replayedH` = hours since the run before) — else "–"
 *   loss    loss of the older deck = (fresh, else hn24) − Δm − melt depth; melt = booked water − ΔSWE (rows of A and B, cache), else counted in loss
 *   Δm, Δv  model and station net change; P Fusion (mm, without factor) and P precipsum (24 h at the station cell, cached B run only)
 *   in p10–p90  share of station values at B inside the span A wrote for day 1 (`fq`), only when A carries it (from run 2026112423 on)
 *   offset  model − station depth at A (the deck the window starts from)
 * A window whose run A lies before 26.11. 17 UTC is marked "seed": the 72-h new snow of A still holds the seed of 22/23 Nov (§3p).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodePng, toRgba } from '../../scripts/lib/png.mjs';
import { atElevation } from '../../scripts/glacier/lib/snowpackcore.mjs';
import { G } from '../../src/scalar/precipIndexMap.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1']; }));
const cache = args.cache ?? 'C:\\dev\\buscosun-glacier-cache\\gm11';
const H = 3_600_000, RHO = 96, SEED_UNTIL = '2026112617';
const J = (p) => JSON.parse((p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p)).toString('utf8'));
const runMs = (r) => Date.UTC(+r.slice(0, 4), +r.slice(4, 6) - 1, +r.slice(6, 8), +r.slice(8, 10));
const runOf = (ms) => new Date(ms).toISOString().replace(/[-T:]/g, '').slice(0, 10);
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((s, v) => s + v, 0) / b.length : null; };
const f1 = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',').replace('-', '−'));
const pct = (x) => (x == null ? '–' : `${Math.round(100 * x)} %`);

// --- archived pairs ---
const archDir = join(cache, 'archive'); mkdirSync(archDir, { recursive: true });
if (args.fetch) {
  const api = async (p) => { const r = await fetch(`https://api.github.com/repos/jppetry/buscosun-archiv/${p}`, { headers: { 'User-Agent': 'buscosun-cache' } }); if (!r.ok) throw new Error(`API ${p}: ${r.status}`); return r.json(); };
  const head = (await api('commits/main')).sha;
  const blobSha = (b) => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
  for (let ms = Date.UTC(2026, 10, 24); ms <= Date.now(); ms += 86_400_000) {
    const day = new Date(ms).toISOString().slice(0, 10);
    let list = []; try { list = await api(`contents/glacier/v1/${day}?ref=${head}`); } catch { continue; }
    for (const e of list.filter((x) => /^pairs-\d{10}\.json\.gz$/.test(x.name))) {
      const dst = join(archDir, e.name);
      if (existsSync(dst) && blobSha(readFileSync(dst)) === e.sha) continue;
      const b = Buffer.from(await (await fetch(`https://raw.githubusercontent.com/jppetry/buscosun-archiv/${head}/${e.path}`)).arrayBuffer());
      if (blobSha(b) === e.sha) writeFileSync(dst, b); else console.error(`hash mismatch ${e.path}`);
    }
  }
}
const runsDir = join(cache, 'runs');
const cachedRuns = existsSync(runsDir) ? readdirSync(runsDir).filter((r) => /^\d{10}$/.test(r)).sort() : [];
const pairsOf = (run) => {
  const a = join(archDir, `pairs-${run}.json.gz`), c = join(runsDir, run, 'pairs.json');
  if (existsSync(a)) return { doc: J(a), src: 'archiv' };
  if (existsSync(c)) return { doc: J(c), src: 'cache' };
  return null;
};
const allRuns = [...new Set([...readdirSync(archDir).map((f) => /^pairs-(\d{10})\.json\.gz$/.exec(f)?.[1]).filter(Boolean), ...cachedRuns.filter((r) => existsSync(join(runsDir, r, 'pairs.json')))])].sort();
const rowsOf = (run) => { const p = join(runsDir, run, 'snowpack.json'); return existsSync(p) ? new Map(J(p).glaciers.map((g) => [g.id, g])) : null; };
const stateOf = (run) => { const p = join(runsDir, run, 'snowpack.json'); return existsSync(p) ? J(p).state : null; };
const chunkCache = new Map();
const chunksOf = (run) => {
  if (chunkCache.has(run)) return chunkCache.get(run);
  const d = join(runsDir, run, 'wx'); let m = null;
  if (existsSync(d)) { m = new Map(); for (const f of readdirSync(d)) { const x = J(join(d, f)); for (const [id, g] of Object.entries(x.glaciers)) m.set(id, g); } }
  chunkCache.set(run, m); return m;
};

// --- windows ---
const windows = [];
for (const B of allRuns.filter((r) => r.endsWith('17'))) {
  const A = runOf(runMs(B) - 24 * H);
  const pa = pairsOf(A), pb = pairsOf(B);
  if (!pa || !pb) continue;
  // the chain of runs that carried the window (cache only)
  const chain = cachedRuns.filter((r) => r >= A && r <= B);
  let chainOk = chain[0] === A && chain[chain.length - 1] === B;
  for (let i = 1; chainOk && i < chain.length; i++) { const st = stateOf(chain[i]); const gap = Math.round((runMs(chain[i]) - runMs(chain[i - 1])) / H); if (!st || st.replayedH !== gap || st.ageH !== gap) chainOk = false; }
  if (chainOk) for (const r of chain.slice(0, -1)) if (!chunksOf(r)) chainOk = false;
  const rA = rowsOf(A), rB = rowsOf(B);
  const regionsF = rB ? J(join(runsDir, B, 'snowpack.json')).rules.precip.regions : null;
  const regionOf = new Map(); if (chainOk) for (const f of readdirSync(join(runsDir, A, 'wx'))) for (const id of Object.keys(J(join(runsDir, A, 'wx', f)).glaciers)) regionOf.set(id, f.replace(/\.json$/, ''));
  // precipsum for B (cache)
  let psCell = null;
  const psDir = join(cache, 'precipsum'); const psRun = existsSync(psDir) ? readdirSync(psDir).find((d) => d.startsWith(B)) : null;
  if (psRun) { const lj = J(join(psDir, psRun, 'latest.json')); const px = toRgba(decodePng(readFileSync(join(psDir, psRun, 'sum-024h.png')))); psCell = (lat, lon) => { const r = Math.floor(((G.latMax - lat) / (G.latMax - G.latMin)) * G.h), c = Math.floor(((lon - G.lonMin) / (G.lonMax - G.lonMin)) * G.w), o = 4 * (r * G.w + c); return px[o + 3] === 255 ? ((px[o] << 16) | (px[o + 1] << 8) | px[o + 2]) * lj.unitMm : null; }; }
  const mapF = join(cache, 'map', `${pb.doc.stations?.map}.json`), stCat = existsSync(mapF) ? J(mapF).ext.stations : null;
  const key = (p) => `${p.g}|${p.s}`, byA = new Map(pa.doc.pairs.map((p) => [key(p), p]));
  const rows = [];
  for (const p of pb.doc.pairs) {
    const q = byA.get(key(p));
    if (!q || p.v == null || q.v == null) continue;
    const r = { country: p.g.slice(3, 5).toUpperCase(), net: p.net, dv: p.v - q.v, dm: p.m - q.m, hn24: p.hn[0], offset: q.m - q.v, inSpan: null, fresh: null, melt: null, pf: null, ps: null };
    if (psCell && stCat?.[p.s]) r.ps = psCell(stCat[p.s].lat, stCat[p.s].lon);
    if (q.fq) r.inSpan = p.v >= q.fq[0][0] && p.v <= q.fq[1][0] ? 1 : 0;
    if (chainOk && rA && rB) {
      const ga = rA.get(p.g), gb = rB.get(p.g);
      const owner = gb?.f === 'own' ? p.g : gb?.f;
      const F = regionsF?.[regionOf.get(p.g)]?.F;
      if (ga && gb && F) {
        const S = [0, 0, 0]; let P = 0, ok = true;
        for (let i = 0; i < chain.length - 1; i++) {
          const n = Math.round((runMs(chain[i + 1]) - runMs(chain[i])) / H), cg = chunksOf(chain[i]).get(p.g), co = chunksOf(chain[i]).get(owner);
          if (!co?.sn || !co?.p) { ok = false; break; }
          const ro = rowsOf(chain[i])?.get(owner) ?? gb;
          for (let h = 0; h < n; h++) {
            P += co.p[h];
            for (let l = 0; l < 3; l++) { let k = l; if (owner !== p.g) { k = 0; for (let j = 1; j < 3; j++) if (Math.abs(ro.z[j] - gb.z[l]) < Math.abs(ro.z[k] - gb.z[l])) k = j; } S[l] += F * (cg?.sn && owner === p.g ? cg.sn[l][h] : co.sn[k][h]); }
          }
        }
        if (ok) {
          const at = (v) => atElevation(gb.z, v, p.z).v;
          const dSwe = [0, 1, 2].map((l) => gb.swe[l] - ga.swe[l]);
          r.fresh = at(S.map((s) => (s * 100) / RHO)); r.melt = at([0, 1, 2].map((l) => Math.max(0, S[l] - dSwe[l]))); r.pf = P;
        }
      }
    }
    rows.push(r);
  }
  const groups = new Map();
  for (const r of rows) for (const k of [`${r.country}|${r.net}|${r.dv >= 3 ? 'Schneefall' : 'ohne'}`, `alle|alle|${r.dv >= 3 ? 'Schneefall' : 'ohne'}`]) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const out = [];
  for (const [k, R] of [...groups].sort()) {
    const [country, net, group] = k.split('|');
    const fresh = mean(R.map((r) => r.fresh)), hn24 = mean(R.map((r) => r.hn24)), dm = mean(R.map((r) => r.dm)), melt = mean(R.map((r) => r.melt));
    const base = fresh ?? hn24;
    out.push({ country, net, group, pairs: R.length, hn24, fresh, loss: base - dm - (melt != null ? (melt * 100) / RHO : 0), melt, dm, dv: mean(R.map((r) => r.dv)), pf: mean(R.map((r) => r.pf)), ps: mean(R.map((r) => r.ps)), inSpan: R.some((r) => r.inSpan != null) ? mean(R.map((r) => r.inSpan)) : null, offset: mean(R.map((r) => r.offset)) });
  }
  windows.push({ A, B, seed: A < SEED_UNTIL, src: [pa.src, pb.src], chain: chainOk ? chain : null, pairs: rows.length, groups: out });
}
const report = { kind: 'gm11/windows', builtAt: new Date().toISOString(), cache, windows };
if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 1));
// --- audit block ---
const lines = ['| Fenster (A → B) | Seed | Land · Netz | Gruppe | Paare | Neuschnee Modell `hn24` cm | frisch gebucht cm | Verlust alte Decke cm | Schmelze mm | Modell Δ cm | Station Δ cm | P Fusion mm (ohne F) | P precipsum mm | in p10–p90 | Decke Modell − Station bei A cm |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const w of windows) for (const g of w.groups) lines.push(`| ${w.A.slice(6, 8)}.${w.A.slice(4, 6)}. 17 → ${w.B.slice(6, 8)}.${w.B.slice(4, 6)}. 17 UTC | ${w.seed ? 'ja' : 'nein'} | ${g.country} · ${g.net} | ${g.group} | ${g.pairs} | ${f1(g.hn24)} | ${f1(g.fresh)} | ${f1(g.loss)} | ${f1(g.melt)} | ${f1(g.dm)} | ${f1(g.dv)} | ${f1(g.pf)} | ${f1(g.ps)} | ${pct(g.inSpan)} | ${f1(g.offset)} |`);
const block = `<!-- gm11-windows:start -->\n_Erzeugt von \`gm11-windows.mjs\` am ${report.builtAt.slice(0, 16).replace('T', ' ')} UTC; Quellen der Paare je Fenster im Bericht. „frisch gebucht“, „Schmelze“ und „P Fusion“ nur, wo der Antrieb aller Läufe des Fensters im Cache liegt; sonst rechnet „Verlust“ mit \`hn24\` und enthält die Schmelze._\n\n${lines.join('\n')}\n<!-- gm11-windows:end -->`;
if (args.audit) {
  const s = readFileSync(args.audit, 'utf8');
  const re = /<!-- gm11-windows:start -->[\s\S]*?<!-- gm11-windows:end -->/;
  if (!re.test(s)) throw new Error('Marker im Audit fehlt');
  writeFileSync(args.audit, s.replace(re, block));
}
console.log(JSON.stringify({ windows: windows.map((w) => ({ A: w.A, B: w.B, seed: w.seed, src: w.src, chain: w.chain, pairs: w.pairs })) }, null, 1));
console.log(lines.join('\n'));
