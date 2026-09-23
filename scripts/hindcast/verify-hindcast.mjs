/**
 * verify-hindcast.mjs — AP10a acceptance V1–V8 of the local hindcast archive (C:\dev\buscosun-hindcast).
 * Network-free except nothing: V4/V5 read the local clones/files (C:\dev\buscosun-archiv, truth\ written by
 * extract_truth.mjs, shadow\ written by shadow.mjs). Every check carries a negative control; a check without one
 * does not count. Writes verify\<date>.json and stamps index.json.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/verify-hindcast.mjs \
 *        [--sample=0.01] [--seed=7] [--slots=<glob day prefix>] [--only=V1,V3]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { CUBE_PLANES, TIER_BY_ID, TIERS, cellOf, cellCenter, blockOffsets, dequantize, quantStep, MISSING, planeIndex } from '../../src/point/cubeFormat.ts';
import { parseSlot as parseArchiveSlot, newSlot as newArchiveSlot, serialiseSlot as serialiseArchiveSlot } from '../punktarchiv/lib/punktarchiv.mjs';
import { HINDCAST_ROOT, H, TIER_SOURCES, PAP3_PLANES, parseArgs, sha256 } from './lib/common.mjs';
import { GRIDS, geoToRot, rotToGeo, producerLatLon, blockOf, storeCellLatLon } from './lib/grids.mjs';
import { loadTierCells, loadExtract, readHcv } from './lib/cellsio.mjs';
import { parseHindcastSlot, validateSlot } from './lib/slotio.mjs';
import { recipeValue } from './lib/recompute.mjs';
import { buildSlot, plansFor, serialise as serialiseSlot, slotPath, IMPL } from './build-slots.mjs';

const VERIFIER = 'verify-hindcast@1';
const flags = parseArgs(process.argv.slice(2));
const only = flags.only ? new Set(String(flags.only).split(',')) : null;
const want = (v) => !only || only.has(v);
let seed = Number(flags.seed ?? 7);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const results = {};
const check = (V, name, ok, detail, n = null) => { (results[V] ??= []).push({ name, ok: !!ok, detail, n }); console.log(`[${V}] ${ok ? 'ok ' : 'NO '} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };

function allSlotFiles() {
  const dir = join(HINDCAST_ROOT, 'slots');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const d of readdirSync(dir).sort()) {
    if (flags.slots && !d.startsWith(String(flags.slots))) continue;
    for (const f of readdirSync(join(dir, d)).sort()) if (/^\d{4}\.json\.gz$/.test(f)) out.push(join(dir, d, f));
  }
  return out;
}
const slotFiles = allSlotFiles();
const points = JSON.parse(readFileSync('scripts/punktarchiv/points.json', 'utf8')).points;
const pointById = new Map(points.map((p) => [p.id, p]));

// ─── ONE pass over every slot (each slot is parsed once; V1, V3 (c-planes), V6, V7 (tiers), V8 read from here) ─
const C_PLANES_ALL = ['gammaEff', 'zBase', 'zInv', 'dTInv'];
const C_T12 = CUBE_PLANES.filter((p) => p.kind === 'sd_ens' || p.kind === 'q10' || p.kind === 'q90').map((p) => p.id).concat(['ensCount']);
const PASS = { parsed: 0, bad: [], blockBad: 0, blockN: 0, leadBad: 0, nearIncomplete: 0, neighWrong: 0, cViol: 0, cCounted: 0, asOfBad: [], asOfN: 0,
  perTier: {}, planesNoSrc: 0, noStandIn: 0, tierBlocks: 0, routes: {}, rangeN: 0, rangeBad: 0, rangeEx: [] };
/** Hard physical ranges of a plane — only where the quantity itself forbids the value, never a plausibility taste. */
const RANGE_OF = { clct: [0, 100], clcl: [0, 100], clcm: [0, 100], clch: [0, 100] };
const needPass = ['V1', 'V3', 'V6', 'V7', 'V8'].some(want);
if (needPass) {
  const t0 = Date.now();
  for (const f of slotFiles) {
    let s;
    try { s = parseHindcastSlot(readFileSync(f)); PASS.parsed++; } catch (e) { PASS.bad.push(`${f}: ${e.message}`); continue; }
    PASS.asOfN++;
    for (const x of asOfViolations(s)) { if (PASS.asOfBad.length < 10) PASS.asOfBad.push(`${f.slice(-22)} ${x}`); else PASS.asOfBad.length++; }
    for (const [t, c] of Object.entries(s.cube)) {
      const tier = TIER_BY_ID[t];
      PASS.perTier[t] = (PASS.perTier[t] ?? 0) + 1;
      PASS.routes[`${t}:${c.route}`] = (PASS.routes[`${t}:${c.route}`] ?? 0) + 1;
      PASS.tierBlocks++;
      if (c.leadClass === 'run') { if (JSON.stringify(c.leadHours) !== JSON.stringify(tier.leadHours)) PASS.leadBad++; }
      else { const d0 = Date.parse(`${s.slotAt.slice(0, 10)}T00:00:00Z`); if (c.validAtMs.length !== 24 || c.validAtMs.some((v, i) => v !== d0 + i * H)) PASS.leadBad++; }
      const forbid = t === 't3' ? C_PLANES_ALL : [...C_PLANES_ALL, ...C_T12];
      let firstPoint = true;
      for (const [id, bp] of Object.entries(c.byPoint)) {
        if (!bp) continue;
        const p = pointById.get(id);
        const cl = cellOf(tier, p.lat, p.lon), cc = cellCenter(tier, cl.iy, cl.ix);
        const wantB = blockOffsets(p.lat - cc.lat, p.lon - cc.lon).map((o) => [cl.iy + o.dy, cl.ix + o.dx]).filter(([y, x]) => y >= 0 && x >= 0 && y < tier.ny && x < tier.nx);
        PASS.blockN++;
        if (JSON.stringify(wantB) !== JSON.stringify(bp.block.map((b) => [b.iy, b.ix]))) PASS.blockBad++;
        if (Object.keys(bp.planes).length + bp.empty.length !== CUBE_PLANES.length) PASS.nearIncomplete++;
        for (const b of bp.block) if (b.planes !== 'nearest' && (Object.keys(b.planes).length + b.empty.length !== PAP3_PLANES.length || Object.keys(b.planes).some((k) => !PAP3_PLANES.includes(k)))) PASS.neighWrong++;
        PASS.cCounted++;
        for (const q of forbid) if (bp.planes[q]) PASS.cViol++;
        for (const b of bp.block) if (b.planes !== 'nearest') for (const q of forbid) if (b.planes[q]) PASS.cViol++;
        for (const q of Object.keys(bp.planes)) if (!(c.provenance.perPlane[q]?.sources?.length)) PASS.planesNoSrc++;
        // physical range of the artifact itself (V-HC-30): cloud cover is a share of the sky and a spread cannot be
        // negative. Deliberately only these — RH over 100 % and a negative snow line are legitimate model output.
        for (const [q, arr] of Object.entries(bp.planes)) {
          const pl = CUBE_PLANES[planeIndex(q)];
          const lo = RANGE_OF[q]?.[0] ?? (pl.kind === 'sd' || pl.kind === 'sd_ens' ? 0 : null);
          const hi = RANGE_OF[q]?.[1] ?? null;
          if (lo == null && hi == null) continue;
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] === MISSING || arr[i] == null) continue;
            PASS.rangeN++;
            const x = dequantize(arr[i], pl);
            if ((lo != null && x < lo - 0.5) || (hi != null && x > hi + 0.5)) {
              PASS.rangeBad++;
              if (PASS.rangeEx.length < 6) PASS.rangeEx.push(`${f.slice(-22)} ${id} ${t} ${q} step ${i}: ${x}`);
            }
          }
        }
        if (firstPoint) firstPoint = false;
      }
      if (c.sources.some((x) => x.external.includes('member 0')) && !c.standIn.some((x) => x.source === 'ifs_hres')) PASS.noStandIn++;
    }
  }
  console.log(`[verify] ein Durchlauf über ${slotFiles.length} Slots in ${((Date.now() - t0) / 1000).toFixed(0)} s · ${JSON.stringify(PASS.routes)}`);
}

// ─── V1 Form ────────────────────────────────────────────────────────────────
if (want('V1')) {
  const { parsed, bad, blockBad, blockN, leadBad, nearIncomplete, neighWrong } = PASS;
  check('V1', `alle ${slotFiles.length} Slots parsen (Schema 1, hindcast/slot, 57 Ebenen in CUBE_PLANES-Ordnung, Skalen = CUBE_PLANES)`, parsed === slotFiles.length && slotFiles.length > 0, bad.slice(0, 3).join(' | ') || `${parsed}`, slotFiles.length);
  check('V1', 'leadHours je Stufe = TIERS (Lauf) bzw. 24 Tagesstunden (Tag 0)', leadBad === 0, `${leadBad} abweichend`);
  check('V1', 'Blockzellen je Punkt = blockOffsets(lat − Zellmitte), im Gitter', blockBad === 0 && blockN > 0, `${blockBad}/${blockN} abweichend`, blockN);
  check('V1', 'nächste Zelle vollständig (57), Nachbarn genau die 31 PAP-3-Ebenen', nearIncomplete === 0 && neighWrong === 0, `${nearIncomplete} unvollständig, ${neighWrong} Nachbarn falsch`);
  // negative controls
  if (slotFiles.length) {
    const s = JSON.parse(gunzipSync(readFileSync(slotFiles[0])).toString('utf8'));
    const renamed = structuredClone(s); const t0 = Object.keys(renamed.cube)[0]; renamed.cube[t0].planeOrder = [...renamed.cube[t0].planeOrder]; renamed.cube[t0].planeOrder[3] = 'v10x';
    check('V1', 'Gegenprobe: eine umbenannte Ebenen-ID wird abgewiesen', validateSlot(renamed).length > 0, validateSlot(renamed)[0]);
    let archRejected = false; try { parseArchiveSlot(readFileSync(slotFiles[0])); } catch { archRejected = true; }
    check('V1', 'Gegenprobe: der punktarchiv-Leser weist einen Hindcast-Slot ab', archRejected);
    const a = newArchiveSlot({ slotAtMs: Date.UTC(2026, 8, 17, 23, 10), codeHash: 't', producer: 'verify' });
    let hcRejected = false; try { parseHindcastSlot(serialiseArchiveSlot(a)); } catch { hcRejected = true; }
    check('V1', 'Gegenprobe: der Hindcast-Leser weist einen punktarchiv-Slot ab', hcRejected);
    const archiveDir = 'C:/dev/buscosun-archiv';
    const realArch = existsSync(archiveDir) ? readdirSync(archiveDir).filter((d) => /^\d{4}-/.test(d)).map((d) => join(archiveDir, d, readdirSync(join(archiveDir, d)).find((f) => f.endsWith('.json.gz')))).filter(Boolean)[0] : null;
    if (realArch) { let r = false; try { parseHindcastSlot(readFileSync(realArch)); } catch { r = true; } check('V1', 'Gegenprobe: ein echter Archiv-Slot (buscosun-archiv) wird abgewiesen', r, realArch); }
  }
}

// ─── V2 Cells ───────────────────────────────────────────────────────────────
if (want('V2')) {
  const HS_MODEL = { icon_d2: 'dwd_icon_d2', icon_eu: 'dwd_icon_eu', icon_global: 'dwd_icon', ifs_hres: 'ecmwf_ifs025', aifs_single: 'ecmwf_aifs025_single', icon_ch1_eps: 'meteoswiss_icon_ch1', icon_ch2_eps: 'meteoswiss_icon_ch2' };
  // full Open-Meteo HSURF arrays (hsurf_cells.py, float32 row-major ny × nx) for the argmin proof over shifted recipes
  const fullMemo = {};
  const hsFull = (m, grid) => {
    if (!(m in fullMemo)) {
      const p = join(HINDCAST_ROOT, 'cells', `hsurf-${m}.f32`);
      const b = existsSync(p) ? readFileSync(p) : null;
      fullMemo[m] = b && b.length === 4 * grid.ny * grid.nx ? new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) : null;
    }
    return fullMemo[m];
  };
  let roundTrip = 0, nearBad = 0, blockRuleBad = 0, nChecked = 0;
  const hsRows = [];
  for (const t of ['t1', 't2', 't3']) {
    const tc = loadTierCells(t);
    const tier = TIER_BY_ID[t];
    for (const s of TIER_SOURCES[t]) {
      const grid = GRIDS[s.grid];
      const ex = loadExtract(s.grid);
      const model = HS_MODEL[s.id];
      const hs = model ? JSON.parse(readFileSync(join(HINDCAST_ROOT, 'cells', `hsurf-${model}.json`), 'utf8')).values : null;
      let n = 0, ok = 0, sea = 0, shiftedOk = 0, shiftedN = 0, byConstruction = 0;
      const bad = [], rest = [], absD = [];
      // argmin proof: the same recipe shifted by (dr, dc) ∈ [−2, 2]² — the unshifted one must fit the hmodel column best
      const shiftAbs = new Map();
      for (const [key, c] of Object.entries(tc.cells)) {
        const r = c.sources[s.id];
        if (!r?.covered) continue;
        nChecked++;
        // the rule itself
        if (r.via === 'block') for (const [j, i] of r.producer) { const ll = producerLatLon(grid, j, i); if (Math.round((ll.lat - tier.lat0) / tier.deg) !== c.iy || Math.round((ll.lon - tier.lon0) / tier.deg) !== c.ix) blockRuleBad++; }
        if (r.via === 'nearest' && grid.kind === 'rotated') { const q = geoToRot(c.centre.lat, c.centre.lon, grid.rot); const [row, col] = r.store[0]; if (Math.abs(q.rlat - (grid.rot.rlat0 + row * grid.rot.d)) > grid.rot.d / 2 + 1e-9 || Math.abs(q.rlon - (grid.rot.rlon0 + col * grid.rot.d)) > grid.rot.d / 2 + 1e-9) nearBad++; const b = rotToGeo(q.rlat, q.rlon, grid.rot); roundTrip = Math.max(roundTrip, Math.abs(b.lat - c.centre.lat), Math.abs(b.lon - c.centre.lon)); }
        if (r.via === 'nearest' && grid.kind === 'nearest') { const [row, col] = r.store[0]; const ll = storeCellLatLon(grid, row, col); if (Math.abs(ll.lat - c.centre.lat) > grid.stepDeg / 2 + 1e-9 || Math.abs(((ll.lon - c.centre.lon + 540) % 360) - 180) > grid.stepDeg / 2 + 1e-9) nearBad++; }
        // independent orography proof
        const col = c.hmodel?.[s.id];
        if (!hs || col == null) continue;
        // ICON-CH cells chosen BY their orography (cells.mjs, V-HC-3) are no proof of anything — counted apart
        if (r.via === 'hsurf-match') { byConstruction++; continue; }
        const v = r.store.map(([a, b]) => hs[ex.idx.get(`${a}_${b}`)]);
        if (v.some((x) => x === -999 || x == null)) { sea++; continue; }
        const mean = v.reduce((p, q) => p + q, 0) / v.length;
        n++;
        absD.push(Math.abs(mean - col));
        if (Math.abs(mean - col) <= 1) ok++;
        else {
          rest.push({ cell: key, lat: +c.centre.lat.toFixed(3), lon: +c.centre.lon.toFixed(3), dM: Math.round((mean - col) * 10) / 10, via: r.via });
          if (bad.length < 5) bad.push(`${key}@${c.centre.lat.toFixed(2)}/${c.centre.lon.toFixed(2)} Δ${Math.round(mean - col)}`);
        }
        // negative control: the same recipe shifted by one source cell east (store cells +1 column, when present)
        const sh = r.store.map(([a, b]) => ex.idx.get(`${a}_${b + 1}`));
        if (sh.every((k) => k != null)) { const w = sh.map((k) => hs[k]); if (!w.some((x) => x === -999 || x == null)) { shiftedN++; if (Math.abs(w.reduce((p, q) => p + q, 0) / w.length - col) <= 1) shiftedOk++; } }
        const full = model ? hsFull(model, grid) : null;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          let w;
          if (full) w = r.store.map(([a, b]) => { const y = a + dr, x = ((b + dc) % grid.nx + grid.nx) % grid.nx; return y < 0 || y >= grid.ny ? null : full[y * grid.nx + x]; });
          else { const ks = r.store.map(([a, b]) => ex.idx.get(`${a + dr}_${b + dc}`)); if (ks.some((k) => k == null)) continue; w = ks.map((k) => hs[k]); }
          if (w.some((x) => x === -999 || x == null || !Number.isFinite(x))) continue;
          const sk = `${dr},${dc}`; (shiftAbs.has(sk) ? shiftAbs.get(sk) : shiftAbs.set(sk, []).get(sk)).push(Math.abs(w.reduce((p, q) => p + q, 0) / w.length - col));
        }
      }
      // compare shifts only where the extract list holds the shifted cells for (almost) the whole sample
      const med = (a) => { const q = [...a].sort((x, y) => x - y); return q.length ? q[Math.floor(q.length / 2)] : null; };
      const shifts = [...shiftAbs].filter(([, a]) => a.length >= 0.5 * n).map(([k, a]) => ({ shift: k, n: a.length, medAbsM: med(a), within1: a.filter((x) => x <= 1).length / a.length }));
      const zero = shifts.find((x) => x.shift === '0,0');
      const others = shifts.filter((x) => x.shift !== '0,0');
      const argminOk = zero && others.every((x) => x.medAbsM > zero.medAbsM || x.within1 < zero.within1);
      hsRows.push({ tier: t, source: s.id, rule: s.rule, n, within1m: ok, share: n ? ok / n : null, sea, byConstruction, shiftedN, shiftedShare: shiftedN ? shiftedOk / shiftedN : null,
        medAbsM: med(absD), p90AbsM: absD.length ? [...absD].sort((x, y) => x - y)[Math.floor(0.9 * absD.length)] : null,
        argmin: { ok: !!argminOk, zero, bestOther: others.sort((a, b) => a.medAbsM - b.medAbsM)[0] ?? null, shiftsCompared: others.length },
        examples: bad, rest });
    }
  }
  check('V2', 'Blockregel: jede Quellzelle eines Blocks rundet in ihre Cube-Zelle (Producer-Arithmetik)', blockRuleBad === 0, `${blockRuleBad} Verstöße`, nChecked);
  check('V2', 'nächste Zelle: Abstand ≤ halbe Quell-Maschenweite (ICON global 0,125°, ICON-CH gedreht wo nicht HSURF-gewählt)', nearBad === 0, `${nearBad} Verstöße`);
  check('V2', 'Drehpol: Hin- und Rückweg ≤ 1e-6°', roundTrip <= 1e-6, `max ${roundTrip.toExponential(2)}°`);
  const d2 = hsRows.filter((r) => r.source === 'icon_d2');
  check('V2', 'unabhängiger Beweis ICON-D2: Open-Meteo-HSURF an der zugeordneten Zelle = hmodel-Spalte ± 1 m an ≥ 99 % der Landzellen', d2.every((r) => r.share >= 0.99), d2.map((r) => `${r.tier} ${r.within1m}/${r.n}`).join(' '), d2.reduce((a, r) => a + r.n, 0));
  const ctrl = hsRows.filter((r) => r.source === 'icon_d2' && r.shiftedN);
  check('V2', 'Gegenprobe: dieselbe Rezeptur um eine Quellzelle verschoben trifft die hmodel-Spalte deutlich seltener', ctrl.every((r) => r.shiftedShare < r.share - 0.3), ctrl.map((r) => `${r.tier} verschoben ${(100 * r.shiftedShare).toFixed(1)} % gegen ${(100 * r.share).toFixed(1)} %`).join(' '));
  // every source: the recipe is the argmin over all shifts within ±2 source cells (median |Δ| or share ±1 m)
  const withHs = hsRows.filter((r) => r.n > 0);
  check('V2', 'jede Quelle: die Rezeptur passt zur hmodel-Spalte besser als jede um ±1…2 Quellzellen verschobene (Median |Δ| bzw. Anteil ±1 m)', withHs.every((r) => r.argmin.ok),
    withHs.filter((r) => !r.argmin.ok).map((r) => `${r.tier} ${r.source}: 0,0 ${r.argmin.zero?.medAbsM} m gegen ${r.argmin.bestOther?.shift} ${r.argmin.bestOther?.medAbsM} m`).join(' | ') || `${withHs.length} Quelle-Stufen`, withHs.reduce((a, r) => a + r.n, 0));
  // the kickoff's ≥ 99 % within 1 m holds only where Open-Meteo stores the SAME orography as the producer's GRIB; the rest is reported
  const below = withHs.filter((r) => r.share < 0.99);
  results.V2below99 = below.map((r) => ({ tier: r.tier, source: r.source, share: r.share, medAbsM: r.medAbsM, p90AbsM: r.p90AbsM, restCells: r.rest.length }));
  results.V2table = hsRows;
  for (const r of hsRows) console.log(`   V2 ${r.tier} ${r.source.padEnd(13)} ${r.rule.padEnd(7)} ±1 m ${r.within1m}/${r.n} (${r.share == null ? '—' : (100 * r.share).toFixed(1)} %)${r.byConstruction ? ` · ${r.byConstruction} per Orographie gewählt (kein Beweis)` : ''} · |Δ| p50 ${r.medAbsM == null ? '—' : r.medAbsM.toFixed(1)} p90 ${r.p90AbsM == null ? '—' : r.p90AbsM.toFixed(1)} m · Meer ${r.sea} · argmin ${r.argmin.ok ? 'ok' : 'NEIN'} (bester Versatz ${r.argmin.bestOther?.shift ?? '—'} p50 ${r.argmin.bestOther?.medAbsM?.toFixed(1) ?? '—'} m)${r.examples.length ? ` · ${r.examples.slice(0, 2).join(', ')}` : ''}`);
}

// ─── V3 Values ──────────────────────────────────────────────────────────────
const MEAN_PLANES = CUBE_PLANES.filter((p) => p.kind === 'mean' && p.group === 'target').map((p) => p.id);
if (want('V3') && slotFiles.length) {
  // (a) determinism
  const pick = [...slotFiles].sort(() => rnd() - 0.5).slice(0, 3);
  let same = 0;
  for (const f of pick) {
    const s = parseHindcastSlot(readFileSync(f));
    const tiers = Object.keys(s.cube);
    const plans = plansFor(s.slotAtMs, tiers, 'auto');
    const again = serialiseSlot(buildSlot(s.slotAtMs, plans));
    if (sha256(again) === sha256(readFileSync(f))) same++; else console.log(`   V3a ${f}: ${sha256(again).slice(0, 12)} ≠ ${sha256(readFileSync(f)).slice(0, 12)}`);
  }
  check('V3', `(a) drei zufällige Slots aus dem Cache neu gebaut: byte-gleich`, same === pick.length, `${same}/${pick.length}: ${pick.map((f) => f.slice(-22)).join(' ')}`, pick.length);
  // (b) round trip against an independent recomputation
  const sample = Number(flags.sample ?? 0.01);
  let n = 0, okMean = 0, okSd = 0, nSd = 0, okCount = 0, nCount = 0, missOk = 0, nMiss = 0, negN = 0, negOk = 0;
  const worst = []; const worstSd = [];
  const extractMemo = {}; const ex = (g) => (extractMemo[g] ??= loadExtract(g));
  const hsMemo = {}; const hs = (m) => (hsMemo[m] ??= (existsSync(join(HINDCAST_ROOT, 'cells', `hsurf-${m}.json`)) ? JSON.parse(readFileSync(join(HINDCAST_ROOT, 'cells', `hsurf-${m}.json`), 'utf8')).values : null));
  const tcMemo = {}; const tcOf = (t) => (tcMemo[t] ??= loadTierCells(t));
  for (const f of slotFiles) {
    if (rnd() > Math.max(sample * 20, 0.05)) continue;   // slot subsample; the 1 % applies to (point, tier, step, plane) inside
    const s = parseHindcastSlot(readFileSync(f));
    for (const [t, c] of Object.entries(s.cube)) {
      const tc = tcOf(t), tier = TIER_BY_ID[t];
      for (const [id, bp] of Object.entries(c.byPoint)) {
        if (!bp) continue;
        const cell = tc.cells[`${bp.cell.iy}_${bp.cell.ix}`];
        for (let it = 0; it < c.validAtMs.length; it++) {
          if (rnd() > sample * MEAN_PLANES.length) continue;
          const t0 = c.validAtMs[it];
          const pv = MEAN_PLANES[Math.floor(rnd() * MEAN_PLANES.length)];
          // independent: which sources carry this valid time for this var
          const vals = [];
          const present = new Set();
          for (const src of c.sources) {
            const rec = cell.sources[src.id];
            if (!rec?.covered) continue;
            const impl = IMPL[src.id];
            const route = src.external.startsWith('dynamical') ? 'dyn' : (c.leadClass === 'day0' ? 'series' : 'run');
            const initMs = src.run ? Date.parse(src.run) : null;
            if (route !== 'series') { const own = (t0 - initMs) / H; if (impl.ownStepH && own % impl.ownStepH !== 0) continue; }
            else if (impl.ownStepH && ((t0 / H) % src.cadenceH) !== 0) continue;
            const S = { route, model: impl.om, ds: impl.dyn, initMs, member: route === 'dyn' ? impl.dynMember ?? 0 : 0 };
            const Ks = rec.store.map(([a, b]) => ex(TIER_SOURCES[t].find((x) => x.id === src.id).grid).idx.get(`${a}_${b}`));
            // "carries the step" = the source has t2m at this valid time
            if (recipeValue(S, 't2m', Ks, t0, tier.stepH, null) == null) continue;
            let any = false;
            for (const v of src.vars) { const q = recipeValue(S, v, Ks, t0, tier.stepH, hs(impl.om)); if (q != null && Number.isFinite(q)) { any = true; if (v === pv) vals.push(q); } }
            if (any) present.add(src.id);
          }
          const code = bp.planes[pv]?.[it] ?? MISSING;
          const plane = CUBE_PLANES[planeIndex(pv)];
          // negative control: the same recomputation on the recipe of the cube cell one column east (a wrong cell)
          const wrongCell = tc.cells[`${bp.cell.iy}_${bp.cell.ix + 1}`];
          if (wrongCell && code !== MISSING) {
            const wv = [];
            for (const src of c.sources) {
              const rec = wrongCell.sources[src.id];
              if (!rec?.covered) continue;
              const impl = IMPL[src.id];
              const route = src.external.startsWith('dynamical') ? 'dyn' : (c.leadClass === 'day0' ? 'series' : 'run');
              const S = { route, model: impl.om, ds: impl.dyn, initMs: src.run ? Date.parse(src.run) : null, member: route === 'dyn' ? impl.dynMember ?? 0 : 0 };
              if (route !== 'series') { const own = (t0 - S.initMs) / H; if (impl.ownStepH && own % impl.ownStepH !== 0) continue; }
              else if (impl.ownStepH && ((t0 / H) % src.cadenceH) !== 0) continue;
              const Ks = rec.store.map(([a, b]) => ex(TIER_SOURCES[t].find((x) => x.id === src.id).grid).idx.get(`${a}_${b}`));
              if (Ks.some((k) => k == null)) continue;
              const q = recipeValue(S, pv, Ks, t0, tier.stepH, hs(impl.om));
              if (q != null && Number.isFinite(q)) wv.push(q);
            }
            if (wv.length) { negN++; if (Math.abs(dequantize(code, plane) - wv.reduce((a, b) => a + b, 0) / wv.length) <= quantStep(plane) / 2 + 1e-9) negOk++; }
          }
          nMiss++;
          if (!vals.length) { if (code === MISSING) missOk++; else if (worst.length < 8) worst.push(`${id} ${t} ${pv} step ${it}: Wert ohne Quelle`); continue; }
          if (code === MISSING) { if (worst.length < 8) worst.push(`${id} ${t} ${pv} step ${it}: MISSING trotz ${vals.length} Quellen`); continue; }
          missOk++;
          n++;
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const d = Math.abs(dequantize(code, plane) - mean);
          if (d <= quantStep(plane) / 2 + 1e-9) okMean++;
          else if (worst.length < 8) worst.push(`${f.slice(-22)} ${id} ${t} ${pv} step ${it} (${new Date(t0).toISOString().slice(0, 13)}Z, ${vals.length} Quellen): Slot ${dequantize(code, plane)} ≠ ${mean.toFixed(4)}, Δ ${d.toFixed(4)}`);
          const sdId = `${pv}_sd`;
          if (planeIndex(sdId) >= 0 && vals.length >= 2) {
            nSd++;
            const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
            const sc = bp.planes[sdId]?.[it];
            const sdPlane = CUBE_PLANES[planeIndex(sdId)];
            if (sc != null && sc !== MISSING && Math.abs(dequantize(sc, sdPlane) - sd) <= quantStep(sdPlane) + 1e-9) okSd++;
            else if (worstSd.length < 8) worstSd.push(`${f.slice(-22)} ${id} ${t} ${sdId} step ${it} (${new Date(t0).toISOString().slice(0, 13)}Z, ${vals.length} Quellen): Slot ${sc == null || sc === MISSING ? 'MISSING' : dequantize(sc, sdPlane)} ≠ ${sd.toFixed(5)}`);
          }
          nCount++;
          const cc = bp.planes.srcCount?.[it];
          if (cc === present.size) okCount++;
        }
      }
    }
  }
  check('V3', '(b) Rundweg: dequantize(Mittel) − unabhängig aus dem Cache gerechnetes Mittel ≤ Δ/2', n > 0 && okMean === n, `${okMean}/${n}${worst.length ? ` · ${worst.slice(0, 3).join(' | ')}` : ''}`, n);
  check('V3', '(b) σ_div = unabhängige Streuung derselben Rohwerte ± Δ', nSd > 0 && okSd === nSd, `${okSd}/${nSd}${worstSd.length ? ` · ${worstSd.slice(0, 3).join(' | ')}` : ''}`, nSd);
  // the artifact against the hard physical range of its own quantities — this is what found V-HC-30 too late
  check('V3', '(b) jeder Slotwert im physikalischen Bereich seiner Groesse (Bewoelkung 0…100 %, Streuung ≥ 0)',
    PASS.rangeBad === 0 && PASS.rangeN > 0, `${PASS.rangeN - PASS.rangeBad}/${PASS.rangeN}${PASS.rangeEx.length ? ` · ${PASS.rangeEx.slice(0, 3).join(' | ')}` : ''}`, PASS.rangeN);
  {
    const flag = (x) => x < RANGE_OF.clct[0] - 0.5 || x > RANGE_OF.clct[1] + 0.5;
    check('V3', '(b) Gegenprobe: 2 573 % Bewoelkung faellt auf, 98,7 % und 0 % nicht', flag(2573.7) && flag(-3) && !flag(98.7) && !flag(0) && !flag(100));
  }
  check('V3', '(b) srcCount = Zahl der Quellen mit Wert', nCount > 0 && okCount === nCount, `${okCount}/${nCount}`, nCount);
  check('V3', '(b) MISSING genau dort, wo keine Quelle einen Wert hat', missOk === nMiss, `${missOk}/${nMiss}`, nMiss);
  // negative control for (b): the same comparison against the recipe of the neighbouring cube cell must mostly fail
  // (precipitation 0 = 0 and constant cloud cover match by chance — hence a share, not zero)
  check('V3', '(b) Gegenprobe: dieselbe Neurechnung an der östlichen Nachbarzelle trifft den Slotwert an < 50 % der Stichproben', negN > 0 && negOk / negN < 0.5, `${negOk}/${negN} (${negN ? (100 * negOk / negN).toFixed(1) : '—'} %)`, negN);
  // C planes never carry a value (counted in the single pass)
  const { cViol, cCounted } = PASS;
  check('V3', '(b) keine Ebene aus Fakt C trägt irgendwo einen Wert (Profil überall; σ_ens/q10/q90/ensCount in t1/t2) — über alle Slots gezählt', cViol === 0, `${cViol} Verstöße in ${cCounted} Punkt-Stufen`, cCounted);
  // (c) chunk index arithmetic
  const inv = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'log', 'inventory-openmeteo-2026-09-19.json'), 'utf8'));
  let cOk = 0, cN = 0; const cBad = [];
  for (const [m, r] of Object.entries(inv)) {
    const v = r.vars.temperature_2m; if (!v) continue;
    cN++;
    const endS = Date.parse(r.dataEnd) / 1000;
    const nEnd = Math.floor(endS / r.chunkSeconds);
    if (nEnd === v.last) cOk++; else cBad.push(`${m}: floor(data_end/L) ${nEnd} ≠ letzter Chunk ${v.last}`);
  }
  check('V3', '(c) Chunk-Arithmetik n = floor(t / (chunk_time_length × Δt)) trifft data_end_time jedes Modells (letzter Chunk)', cOk === cN && cN > 0, cBad.join(' | ') || `${cOk}/${cN}`, cN);
  check('V3', '(c) Gegenprobe: mit Δt × 2 trifft die Arithmetik nicht mehr', (() => { const r = inv.dwd_icon_d2; return Math.floor(Date.parse(r.dataEnd) / 1000 / (r.chunkSeconds * 2)) !== r.vars.temperature_2m.last; })());
}

// ─── V4 Shadow (reads shadow\latest.json from shadow.mjs) ────────────────────
if (want('V4')) {
  const p = join(HINDCAST_ROOT, 'shadow', 'latest.json');
  if (!existsSync(p)) check('V4', 'Schattenvergleich vorhanden (shadow.mjs)', false, 'shadow/latest.json fehlt');
  else {
    const sh = JSON.parse(readFileSync(p, 'utf8'));
    // pass = |Δ| within the storage bound (½ Open-Meteo storage step + 1 cube step; = 1 step where no Open-Meteo
    // storage is involved) at ≥ 95 % of the (point, step) pairs; the kickoff's literal ±1 step is reported beside it
    for (const r of sh.exact ?? []) check('V4', `exakt vergleichbar: ${r.tier} ${r.plane} |Δ| ≤ ${r.boundSteps} Schritt(e) an ≥ 95 % der (Punkt, Schritt)-Paare`, r.shareBound >= 0.95,
      `${(100 * r.shareBound).toFixed(1)} % (±1 Schritt: ${(100 * r.share).toFixed(1)} %) von ${r.n}, ${r.runs.length} Läufe · Schranke aus ${r.boundFrom ?? 'omStorage'}${r.reason ? ` · ${r.reason}` : ''}`, r.n);
    // hModEff is compared only where the archive's own value stands still across the compared runs (V-HC-25);
    // that restriction needs its own negative control on exactly those pairs, else it could be hiding a wrong cell
    for (const r of sh.negativeControlHmod ?? []) check('V4', `Gegenprobe: ${r.tier} hModEff gegen die Zelle des nächsten Punkts fällt auf denselben stabilen Paaren durch`,
      (r.shareBound ?? 1) < 0.95, `${(100 * (r.shareBound ?? 1)).toFixed(1)} % von ${r.n}`, r.n);
    check('V4', 'die Beweglichkeit der Referenz ist gemessen und ausgewiesen (hModEff)', Object.keys(sh.referenceDrift ?? {}).length > 0,
      Object.entries(sh.referenceDrift ?? {}).map(([t, d]) => `${t} stabil ${(100 * d.stableShare).toFixed(0)} % von ${d.pairs}, Bewegung p50 ${d.p50}/p95 ${d.p95}/max ${d.max}`).join(' · ') || 'fehlt');
    check('V4', 'Gegenprobe: Druckflächen-Temperaturen gegen die Zelle des nächsten Punkts fallen auch mit der Schranke durch', (sh.negativeControl?.shareBound ?? 1) < 0.95,
      sh.negativeControl ? `Schranke ${(100 * sh.negativeControl.shareBound).toFixed(1)} %, ±1 ${(100 * sh.negativeControl.share).toFixed(1)} % (${sh.negativeControl.what})` : 'fehlt');
    const need = ['t1|t850', 't2|t850', 't3|t850', 't1|hModEff', 't3|t2m_sd_ens'];
    const have = new Set((sh.exact ?? []).map((r) => `${r.tier}|${r.plane}`));
    check('V4', 'Abdeckung: Druckflächen aller Stufen, hModEff und das t3-σ_ens sind je mit mindestens einem Lauf verglichen', need.every((k) => have.has(k)), need.filter((k) => !have.has(k)).join(', ') || `${have.size} Ebene-Stufen`);
    results.V4table = sh;
  }
}

// ─── V5 Truth (the overlap proof of extract_truth.mjs --verify + the day files themselves) ─────────────────────
/**
 * Classes (measured 19.09., audit §8): the SAME stream on both sides must be equal to the digit — TAWES and SMN
 * (schema-2 archive slots: the collector after PA3), and of CDC↔POI the columns both products carry unrounded
 * (t, p, rr1). The other CDC↔POI columns are two products of one station (POI: wind in whole km/h, cloud in octas,
 * td/rh rounded) — they must agree within the product rounding. Schema-1 slots carry the PA3 defects and are only reported.
 */
const V5_EXACT = { 'tawes↔tawes': null, 'smn↔smn': null, 'cdc↔poi': ['t', 'p', 'rr1'] };
const V5_PRODUCT = { 'cdc↔poi': { td: 'Taupunkt in POI gerundet', rh: 'Feuchte in POI ganzzahlig', ff: 'POI-Wind in ganzen km/h (0,28 m/s)', dd: 'Richtung in 10°-Schritten, Nord 0 ↔ 360', fx: 'POI-Böe in ganzen km/h', fxh: 'wie fx (POI fxh = fx)', n: 'POI in Achteln, CDC V_N × 12,5 %' } };
if (want('V5')) {
  const dir = join(HINDCAST_ROOT, 'verify');
  const f = existsSync(dir) ? readdirSync(dir).filter((x) => /^truth-overlap-\d{4}-\d{2}-\d{2}(-[\w-]+)?\.json$/.test(x)).sort().at(-1) : null;
  if (!f) check('V5', 'Wahrheits-Überlappung vorhanden', false, 'verify/truth-overlap-*.json fehlt');
  else {
    const t = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const rows = [];
    for (const [pair, cols] of Object.entries(t.comparison)) {
      const s2 = cols._bySchema?.schema2 ?? {};
      for (const [k, v] of Object.entries(cols)) {
        if (k.startsWith('_')) continue;
        const exact = pair in V5_EXACT && (V5_EXACT[pair] == null || V5_EXACT[pair].includes(k));
        const product = V5_PRODUCT[pair]?.[k] ?? null;
        rows.push({ pair, col: k, class: exact ? 'exakt' : product ? 'Produkt' : 'Bericht', n: v.n, equalShare: v.equalShare, withinShare: v.withinShare, tol: v.tol, maxAbs: v.maxAbs,
          schema2: s2[k] ? { n: s2[k].n, equal: s2[k].equal, share: s2[k].n ? s2[k].equal / s2[k].n : null, maxAbs: s2[k].maxAbs } : null, why: product });
      }
    }
    // dd: 0 and 360 are the same direction — count a schema-2 dd pair with maxAbs 360 as equal only if the rest is equal (the proof keeps aggregates)
    const exactRows = rows.filter((r) => r.class === 'exakt');
    const exBad = exactRows.filter((r) => !(r.schema2 && r.schema2.n > 0 && r.schema2.share >= 0.999));
    check('V5', 'gleicher Strom auf beiden Seiten ziffergleich (TAWES, SMN alle Spalten; CDC↔POI t/p/rr1), Archiv-Slots Schema 2', exBad.length === 0,
      exBad.length ? exBad.map((r) => `${r.pair} ${r.col} ${r.schema2 ? `${r.schema2.equal}/${r.schema2.n}` : 'n 0'}`).join(' · ') : `${exactRows.length} Spalten, n ${exactRows.reduce((a, r) => a + (r.schema2?.n ?? 0), 0)}`, exactRows.reduce((a, r) => a + (r.schema2?.n ?? 0), 0));
    const prodRows = rows.filter((r) => r.class === 'Produkt');
    const prBad = prodRows.filter((r) => !(r.withinShare >= 0.97));
    check('V5', 'CDC↔POI übrige Spalten innerhalb der Produktrundung (≥ 97 %; td 0,1 K · rh 1 % · ff/fx 0,5 m/s · dd 10° · n 1 Achtel)', prBad.length === 0,
      prodRows.map((r) => `${r.col} ${(100 * r.withinShare).toFixed(1)}/${(100 * r.equalShare).toFixed(1)} %`).join(' · '), prodRows.reduce((a, r) => a + r.n, 0));
    const neg = t.negativeControl?.byPair ?? {};
    const negT = Object.entries(neg).map(([pair, c]) => ({ pair, eq: c.t?.equalShare, sh: c.t?.equalShareShifted1h }));
    check('V5', 'Gegenprobe: um eine Stunde verschobene Stempel — t fällt je Netz unter 20 % Gleichheit', negT.length === 3 && negT.every((x) => x.sh != null && x.sh < 0.2),
      negT.map((x) => `${x.pair} ${(100 * x.eq).toFixed(1)} → ${(100 * x.sh).toFixed(1)} %`).join(' · '));
    const proofs = Object.values(t.cdcPointProof?.byPoint ?? {});
    check('V5', 'CDC-Zuordnung je Punkt am Archiv bewiesen (n_t ≥ 24, |Δt| ≤ 0,1 K an ≥ 80 %)', proofs.length > 0 && proofs.every((x) => x.pass === true),
      `${proofs.filter((x) => x.pass === true).length}/${proofs.length} bestanden`, proofs.length);
    const s1 = Object.fromEntries(Object.entries(t.comparison).map(([pair, cols]) => [pair, Object.fromEntries(Object.entries(cols._bySchema?.schema1 ?? {}).map(([k, v]) => [k, `${v.equal}/${v.n}`]))]));
    results.V5schema1 = { note: 'Archiv-Slots Schema 1 (14.–17.09.): die PA3-Befunde (23-UTC-Stunde, Stempel der 10-min-Netze) — nur berichtet', byPair: s1 };
    // the 23-UTC hour once, stamps inside the day, full hours — over EVERY truth day file on disk
    const tdir = join(HINDCAST_ROOT, 'truth');
    const days = existsSync(tdir) ? readdirSync(tdir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(x)).sort() : [];
    let recs = 0, dupStamp = 0, outOfDay = 0, notFull = 0, h23 = 0, h23dup = 0;
    const scanRec = (r, d0) => {
      recs++;
      const seen = new Set(); let c23 = 0;
      for (const ms of r.obsAtMs) {
        if (seen.has(ms)) dupStamp++; seen.add(ms);
        if (ms < d0 || ms > d0 + 23 * H) outOfDay++;
        if (ms % H) notFull++;
        if (ms === d0 + 23 * H) c23++;
      }
      if (c23) h23++; if (c23 > 1) h23dup++;
    };
    for (const day of days) {
      const d = JSON.parse(gunzipSync(readFileSync(join(tdir, day))).toString('utf8'));
      const d0 = Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
      for (const e of Object.values(d.byPoint)) for (const net of ['cdc', 'tawes', 'smn']) if (e?.[net]?.obsAtMs) scanRec(e[net], d0);
    }
    check('V5', `Wahrheitstage: jede Stunde höchstens einmal, 23 UTC einmal, Stempel volle Stunden im Tag — alle ${days.length} Tagesdateien`, days.length > 0 && dupStamp === 0 && outOfDay === 0 && notFull === 0 && h23dup === 0,
      `${recs} Reihen · doppelt ${dupStamp} · außerhalb ${outOfDay} · nicht voll ${notFull} · 23 UTC in ${h23} Reihen, doppelt ${h23dup}`, recs);
    { // negative control: the same scan on a record with the 23-UTC hour twice and a stamp shifted by 10 min
      const before = [dupStamp, notFull];
      const d0 = Date.UTC(2026, 8, 15);
      scanRec({ obsAtMs: [d0 + 22 * H, d0 + 23 * H, d0 + 23 * H, d0 + 5 * H + 600_000] }, d0);
      check('V5', 'Gegenprobe: doppelte 23-UTC-Stunde und ein 10-min-Stempel werden erkannt', dupStamp > before[0] && notFull > before[1]);
    }
    const cov = t.coverage?.byNetworkMonth ?? {};
    results.V5coverage = cov;
    const igraF = readdirSync(dir).filter((x) => x.startsWith('igra-check-')).sort().at(-1);
    const ig = igraF ? JSON.parse(readFileSync(join(dir, igraF), 'utf8')) : null;
    check('V5', 'IGRA2 gegen eine veröffentlichte Sondierung (UWyo, TEMP/FM35): Standardflächen und alle gemeinsamen Druckflächen gleich', !!ig?.summary?.allEqual && ig.summary.allLevels.tEqual === ig.summary.allLevels.compared && ig.summary.allLevels.tdEqual === ig.summary.allLevels.compared,
      ig ? `${ig.station} ${ig.launch}: ${ig.summary.compared} Standardflächen × 5 Felder, ${ig.summary.allLevels.tEqual}/${ig.summary.allLevels.compared} Flächen t und td` : 'verify/igra-check-*.json fehlt');
    results.V5table = { file: f, rows, klimaVsTawes: t.klimaVsTawes?.columns ? Object.fromEntries(Object.entries(t.klimaVsTawes.columns).map(([k, v]) => [k, { equalShare: v.equalShare, withinShare: v.withinShare, n: v.n }])) : null };
  }
}

// ─── V6 As-of ───────────────────────────────────────────────────────────────
/**
 * As-of per slot and tier (the case builder may compare a step only with truth stamped AT its valid hour, and no
 * forecast input may postdate the pseudo-publication):
 *   run   every source init and the ENS init ≤ runAt; every valid time ≥ runAt + first lead; the truth window
 *         [fromMs, toMs] ⊂ [runAt, last valid] and covers the valid hours exactly (t1 hourly, t2/t3 their raster);
 *   day0  valid hours = the 24 hours of the slot day; the lead interval per source [0, cadence − 1] h; truth window = the day.
 */
function asOfViolations(s) {
  const v = [];
  for (const [t, c] of Object.entries(s.cube)) {
    const tier = TIER_BY_ID[t];
    if (c.leadClass === 'run') {
      const R = Date.parse(c.runAt);
      for (const src of c.sources) if (src.run && Date.parse(src.run) > R) v.push(`${t} ${src.id} init ${src.run} > ${c.runAt}`);
      if (c.ensemble?.init && Date.parse(c.ensemble.init) > R) v.push(`${t} ifs_ens init ${c.ensemble.init} > ${c.runAt}`);
      if (c.validAtMs.some((x, i) => x !== R + tier.leadHours[i] * H)) v.push(`${t} validAtMs ≠ runAt + leadHours`);
    } else {
      const d0 = Date.parse(`${s.slotAt.slice(0, 10)}T00:00:00Z`);
      if (c.validAtMs.length !== 24 || c.validAtMs.some((x, i) => x !== d0 + i * H)) v.push(`${t} day0 hours ≠ slot day`);
      for (const l of c.leads ?? []) if (!(l.cadenceH >= 1 && l.cadenceH <= 6)) v.push(`${t} day0 cadence ${l.id} ${l.cadenceH}`);
    }
    const lo = Math.min(...c.validAtMs), hi = Math.max(...c.validAtMs);
    if (s.truth.fromMs > lo || s.truth.toMs < hi) v.push(`${t} truth window does not cover the valid hours`);
    if (c.leadClass === 'run' && s.truth.fromMs < Date.parse(c.runAt)) v.push(`${t} truth window starts before the run`);
  }
  // the truth window is the union of the tiers' valid hours — never wider
  const all = Object.values(s.cube).flatMap((c) => c.validAtMs);
  if (s.truth.fromMs !== Math.min(...all) || s.truth.toMs !== Math.max(...all)) v.push('truth window ≠ union of valid hours');
  return v;
}
if (want('V6') && slotFiles.length) {
  const n = PASS.asOfN, bad = PASS.asOfBad;
  check('V6', 'Stichtag: keine Quelle nach der Pseudo-Veröffentlichung, Schritte = Lauf + Vorlauf, Wahrheitsfenster = Gültigkeitsstunden', bad.length === 0, bad.slice(0, 3).join(' | ') || `${n} Slots`, n);
  const s = parseHindcastSlot(readFileSync(slotFiles[0]));
  const t0 = Object.keys(s.cube)[0];
  const late = structuredClone(s);
  if (late.cube[t0].leadClass === 'run') late.cube[t0].sources[0].run = new Date(Date.parse(late.cube[t0].runAt) + 3 * H).toISOString();
  else late.cube[t0].validAtMs = late.cube[t0].validAtMs.map((x) => x - H);
  check('V6', 'Gegenprobe: eine Quelle 3 h nach der Veröffentlichung (bzw. Tag-0-Stunden um 1 h verschoben) wird erkannt', asOfViolations(late).length > 0, asOfViolations(late)[0]);
  const shifted = structuredClone(s); shifted.truth.fromMs -= H;
  check('V6', 'Gegenprobe: ein Wahrheitsfenster eine Stunde zu früh wird erkannt', asOfViolations(shifted).length > 0, asOfViolations(shifted)[0]);
}

// ─── V7 Resumability / inventory (reads the re-run log written by the caller) ─
if (want('V7')) {
  const rr = join(HINDCAST_ROOT, 'verify', 'rerun.json');
  const rerun = existsSync(rr) ? JSON.parse(readFileSync(rr, 'utf8')).rows ?? null : null;
  const kinds = rerun ? new Set(rerun.map((r) => r.extractor)) : new Set();
  // A re-run must transfer 0 DATA bytes and produce nothing. Catalogue reads (Icechunk catalog, CDC station
  // descriptions + listings, GeoSphere dataset metadata, MeteoSwiss station list) carry no measurement and are
  // republished upstream daily, so they are counted as metaBytes — they are reported, not asserted to be 0.
  const clean = (r) => r.bytes === 0 && r.read === 0 && !r.daysWritten;
  check('V7', 'Wiederholung jedes Extraktors über einen fertigen Bereich überträgt 0 Datenbytes und baut nichts neu (verify/rerun.json, rerun-check.mjs)',
    !!rerun && kinds.size === 3 && rerun.every(clean),
    rerun ? rerun.map((r) => `${r.model ?? r.ds ?? r.network} ${r.route} ${r.read}/${r.bytes} B`).join(' · ') : 'fehlt', rerun?.length ?? 0);
  check('V7', 'Katalog-Bytes je Wiederholung ausgewiesen (Speicher-/Stationslisten, keine Messwerte)', !!rerun,
    rerun ? `${(rerun.reduce((s, r) => s + (r.metaBytes ?? 0), 0) / 1e6).toFixed(1)} MB in ${rerun.filter((r) => r.metaBytes > 0).length}/${rerun.length} Läufen` : 'fehlt');
  check('V7', 'Gegenprobe: eine Wiederholung mit 1 übertragenen Byte, 1 gebautem Datensatz oder 1 geschriebenen Tag würde durchfallen',
    !clean({ bytes: 1, read: 0 }) && !clean({ bytes: 0, read: 1 }) && !clean({ bytes: 0, read: 0, daysWritten: 1 }));
  check('V7', 'Gegenprobe: reine Katalog-Bytes sind kein Fehlschlag (der Weg, der am 20.09. durchfiel)', clean({ bytes: 0, read: 0, metaBytes: 5_341_233, requests: 7 }));
  const idxP = join(HINDCAST_ROOT, 'index.json');
  if (existsSync(idxP)) {
    const i = JSON.parse(readFileSync(idxP, 'utf8'));
    // recount from the file system (names only): slots per day, truth days
    const disk = allSlotFiles();
    const diskDays = new Set(disk.map((f) => f.split(/[\\/]/).at(-2)));
    const tdir = join(HINDCAST_ROOT, 'truth');
    const tDays = existsSync(tdir) ? readdirSync(tdir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(x)).length : 0;
    const perTierIdx = Object.fromEntries(Object.entries(i.slots?.perTier ?? {}).map(([t, a]) => [t, a.slots]));
    const perTierDisk = PASS.perTier;
    const ok = i.slots?.count === disk.length && i.slots?.days?.count === diskDays.size && i.truth?.days === tDays && JSON.stringify(perTierIdx) === JSON.stringify(Object.fromEntries(Object.keys(perTierIdx).map((t) => [t, perTierDisk[t] ?? 0])));
    check('V7', 'index.json = Platte (Slots, Tage, Stufen, Wahrheitstage)', ok, `Slots ${i.slots?.count}/${disk.length} · Tage ${i.slots?.days?.count}/${diskDays.size} · Stufen ${JSON.stringify(perTierIdx)}/${JSON.stringify(perTierDisk)} · Wahrheit ${i.truth?.days}/${tDays}`, disk.length);
    const tr = i.transfer ?? {};
    const need = ['open-meteo dwd_icon_d2 run', 'open-meteo dwd_icon_d2 series', 'dynamical ifs-ens', 'dynamical aifs', 'truth cdc', 'truth tawes', 'truth smn'];
    const miss = need.filter((k) => !(tr[k]?.bytes > 0));
    check('V7', 'log\\ trägt Bytes je Quelle und Route (index.transfer aus den Log-Zusammenfassungen)', miss.length === 0, miss.length ? `ohne Bytes: ${miss.join(', ')}` : `${Object.keys(tr).length} Quelle-Routen`);
  } else check('V7', 'index.json vorhanden', false, 'fehlt');
}

// ─── V8 Licence / provenance ────────────────────────────────────────────────
if (want('V8')) {
  const readme = join(HINDCAST_ROOT, 'README.md');
  const txt = existsSync(readme) ? readFileSync(readme, 'utf8') : '';
  const need = ['Open-Meteo', 'CC BY 4.0', 'dynamical.org', 'ECMWF', 'Deutscher Wetterdienst', 'GeoSphere', 'MeteoSwiss', 'IGRA'];
  const miss = need.filter((w) => !txt.includes(w));
  check('V8', 'README mit Quellenvermerken aller Quellen', miss.length === 0, miss.length ? `fehlt: ${miss.join(', ')}` : null);
  check('V8', 'Gegenprobe: ein README ohne „MeteoSwiss" würde durchfallen', need.filter((w) => !txt.replace(/MeteoSwiss/g, '').includes(w)).length > 0);
  const { planesNoSrc, noStandIn } = PASS, n = PASS.tierBlocks;
  check('V8', 'jede Ebene mit Werten nennt ≥ 1 Quelle (provenance.perPlane)', planesNoSrc === 0, `${planesNoSrc}`, n);
  check('V8', 'jeder Stellvertreter steht im Slot (standIn)', noStandIn === 0, `${noStandIn}`);
  if (slotFiles.length) {
    const s = parseHindcastSlot(readFileSync(slotFiles[0]));
    const c = structuredClone(Object.values(s.cube)[0]);
    const bp = Object.values(c.byPoint).find(Boolean);
    const victim = Object.keys(bp.planes)[0];
    delete c.provenance.perPlane[victim];
    const miss2 = Object.keys(bp.planes).filter((q) => !(c.provenance.perPlane[q]?.sources?.length)).length;
    check('V8', `Gegenprobe: ein Slot ohne Herkunft für „${victim}" wird erkannt`, miss2 > 0, `${miss2}`);
  }
  const API_RE = /api\.open-meteo\.com|historical-forecast-api|previous-runs-api|single-runs-api/g;
  // This verifier's own output reaches log\pull-accept.log (the chain logs its tail), so a line that IS verifier
  // output is no evidence of a call — measured 22.09.: V8 found the host name out of its own negative control of
  // 20.09. Hence: the check names never spell a host (`API_SAMPLE` stays inside the expression), and verifier
  // lines are dropped from the scan. Both guarded below, so the filter cannot hide a real call either.
  const API_SAMPLE = `GET https://historical-forecast-api.open-${'meteo'}.com/v1/forecast?latitude=48`;
  const selfLine = (l) => /\[verify\]|\[V\d\]|Gegenprobe/.test(l);
  const logLines = readdirSync(join(HINDCAST_ROOT, 'log')).filter((f) => /\.(jsonl|log)$/.test(f))
    .flatMap((f) => readFileSync(join(HINDCAST_ROOT, 'log', f), 'utf8').split('\n'));
  const scanned = logLines.filter((l) => !selfLine(l));
  const apiHits = scanned.join('\n').match(API_RE) ?? [];
  check('V8', 'kein Open-Meteo-API-Aufruf in den Logs (Sonden vom 18.09. liegen in audit/kalibrierung-fremdarchive.md, nicht hier)',
    apiHits.length === 0, `${apiHits.length} Treffer in ${(scanned.join('\n').length / 1e6).toFixed(1)} MB Log, ${logLines.length - scanned.length} eigene Zeilen ausgelassen`);
  check('V8', 'Gegenprobe: eine Logzeile mit dem Archiv-API-Host würde gefunden', (API_SAMPLE.match(API_RE) ?? []).length > 0);
  check('V8', 'Gegenprobe: der Selbstfilter lässt einen echten Aufruf stehen (er filtert Prüf-, nicht Abrufzeilen)',
    !selfLine(`2026-09-22T12:00:00Z ${API_SAMPLE}`) && selfLine('[verify] V1 PASS (8)'));
}

// ─── write ───────────────────────────────────────────────────────────────────
const date = new Date().toISOString().slice(0, 10);
const summary = Object.fromEntries(Object.entries(results).filter(([k]) => /^V\d$/.test(k)).map(([k, list]) => [k, { pass: list.every((c) => c.ok), checks: list.length, failed: list.filter((c) => !c.ok).map((c) => c.name) }]));
mkdirSync(join(HINDCAST_ROOT, 'verify'), { recursive: true });
const out = { verifier: VERIFIER, at: new Date().toISOString(), slots: slotFiles.length, summary, results };
const outName = `${date}${only ? `-only-${[...only].join('-')}` : ''}${flags.slots ? `-slots-${flags.slots}` : ''}.json`;
writeFileSync(join(HINDCAST_ROOT, 'verify', outName), JSON.stringify(out, null, 1));
const idxPath = join(HINDCAST_ROOT, 'index.json');
if (existsSync(idxPath) && !only && !flags.slots) {
  const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
  idx.verification = { date, verifier: VERIFIER, summary: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.pass ? 'pass' : 'fail'])), samples: Object.fromEntries(Object.entries(results).filter(([k]) => /^V\d$/.test(k)).map(([k, l]) => [k, l.map((c) => c.n).filter((x) => x != null)])) };
  writeFileSync(idxPath, JSON.stringify(idx, null, 1));
}
console.log(`[verify] ${Object.entries(summary).map(([k, v]) => `${k} ${v.pass ? 'PASS' : 'FAIL'} (${v.checks})`).join(' · ')} → verify/${outName}`);
