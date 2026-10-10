#!/usr/bin/env node
// Phase RG — Darstellungsschwelle des Niederschlagsradars (audit/radar-regenschwelle.md).
//
// A  constant + switch: RADAR_DISPLAY_MIN_MMH = 0,06 (measured 10.10.2026) = PRECIP_LOG_MIN; `?rmin=` grammar; the client
//    pre-pass `applyDisplayMin` (no-op = same array at or below the codec floor, zeroes below a larger threshold).
// B  reader: `decodeRvHdf5Tar` without `secondaryUnits` is byte-identical to before (values2 from the RADOLAN rates); with
//    `'native'` values2 comes from the fine values; `withNative` returns both planes from one decode (synthetic HDF5-free check
//    via the exported rule; real file only with RADAR_RG_RAW).
// C  hd250: `anchorToRv` with `minRate` leaves blocks under the threshold dry and counts them; without it byte-identical.
// D  contracts: `meta.dual.native/displayMin` and `hd250.json displayMin/blocks.belowMin` pass the client parsers; mutations fail.
// E  frozen rule: the hash file names the sha256 of `claims-frozen.txt`, and §4 of the audit still equals that copy.
// F  reproduction on REAL rows (fixture radar-threshold-cases.json: DWD indicator stations × RV analyses, every 40th case):
//    rule R-RG-1 recomputed — precision rises monotonically with the threshold, today (every echo) < 0,9, 0,06 ≥ 0,9, the
//    amount-only truth is lower than the indicator truth at the same rows (negative control), stored full-sample numbers.
// G  wiring: producer switch `RADAR_LOG_NATIVE`, workflow template line, MapView pre-pass + status, CI step, npm script.
// H  (RADAR_RG_RAW=<composite_rv_*.tar>) producer round trip with and without the switch: f/m frames and g channel 1
//    byte-identical, g channel 2 lifted vs native (native: every pixel under 0,06 is 0; lifted: those pixels are > 0).
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RADAR_DISPLAY_MIN_MMH, RADAR_DISPLAY_MIN_MEASURED, radarDisplayMinFrom, applyDisplayMin } from '../src/scalar/radarHd.ts';
import { PRECIP_LOG_MIN, precipToU8Log, precipFromU8Log, precipToU8 } from '../src/scalar/RainLayer.ts';
import { decodeRvHdf5Tar, decodeRvHdf5 } from '../src/sources/rvHdf5.ts';
import { untar } from '../src/sources/radolanDecode.ts';
import { makeRadarImgDual, makeRvImgMeta, parseRvImgMeta } from '../src/sources/radarImg.ts';
import { anchorToRv, makeHd250Meta, parseHd250Meta, HD250_COLS, HD250_ROWS } from '../src/sources/radarHd250.ts';
import { decodePng } from './lib/png.mjs';

let passed = 0, failed = 0, skipped = 0;
const add = (name, ok, detail) => { if (ok) passed++; else failed++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const skip = (name, why) => { skipped++; console.log(`⊘ ${name} — ${why}`); };
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ─── A constant + switch ───
add('A1 RADAR_DISPLAY_MIN_MMH = 0,06 mm/h, measured 2026-10-10, equal to the codec floor PRECIP_LOG_MIN',
  RADAR_DISPLAY_MIN_MMH === 0.06 && RADAR_DISPLAY_MIN_MEASURED === '2026-10-10' && RADAR_DISPLAY_MIN_MMH === PRECIP_LOG_MIN);
add('A2 ?rmin= grammar: default, 0, 0.12, 0,2 (comma), junk, negative, store',
  radarDisplayMinFrom('', null) === 0.06 && radarDisplayMinFrom('?rmin=0', null) === 0 && radarDisplayMinFrom('?rmin=0.12', null) === 0.12
  && radarDisplayMinFrom('?rmin=0,2', null) === 0.2 && radarDisplayMinFrom('?rmin=x', null) === 0.06 && radarDisplayMinFrom('?rmin=-1', null) === 0.06
  && radarDisplayMinFrom('', '0.3') === 0.3 && radarDisplayMinFrom('?rmin=0', '0.3') === 0);
{
  const v = new Uint8Array([0, 1, 2, 10, 23, 24, 60, 255]);
  const same = applyDisplayMin(v, 0.06, PRECIP_LOG_MIN, precipFromU8Log);
  const same0 = applyDisplayMin(v, 0, PRECIP_LOG_MIN, precipFromU8Log);
  const cut = applyDisplayMin(v, 0.12, PRECIP_LOG_MIN, precipFromU8Log);
  const expect = Array.from(v, (u) => (u && precipFromU8Log(u) >= 0.12 ? u : 0));
  add('A3 applyDisplayMin: same array at the floor and at 0; at 0,12 every byte under 0,12 mm/h is 0, the rest unchanged',
    same === v && same0 === v && cut !== v && Array.from(cut).join() === expect.join() && cut[7] === 255 && cut[1] === 0 && cut[3] === 0 && cut[4] === 23 && cut[5] === 24,
    `cut ${Array.from(cut).join(',')}`);
  add('A3b first kept byte is precipToU8Log(0,12) and its rate ≥ 0,12', cut.indexOf(precipToU8Log(0.12)) >= 0 && precipFromU8Log(precipToU8Log(0.12)) >= 0.12 - 1e-9);
}

// ─── B reader (rule level; real file in H) ───
{
  // the RADOLAN lift as the reader implements it, on the native micro-metre values — every echo ≥ one unit
  const lift = (um) => Math.max(1, Math.floor(um / 10000)) * 0.12;
  add('B1 RADOLAN rule: raw 1 (0 µm) and 2 (1 000 µm = 0,012 mm/h) both lift to 0,12 mm/h; 10 000 µm stays 0,12; 25 000 µm → 0,24',
    lift(0) === 0.12 && lift(1000) === 0.12 && Math.abs(lift(10000) - 0.12) < 1e-9 && Math.abs(lift(25000) - 0.24) < 1e-9);
  add('B2 log plane from lifted values never bites: precipToU8Log(0,12) > 0; from native 0,012/0,048 it is 0, from 0,06 it is 1',
    precipToU8Log(0.12) > 0 && precipToU8Log(0.012) === 0 && precipToU8Log(0.048) === 0 && precipToU8Log(0.06) === 1);
  add('B4 codec tolerance (V-RG-7): float32 0,06 (0,0599999986) encodes as byte 1 like 0,06; 0,059 and 0,048 stay 0; rzc 0,06 (double) unchanged; nothing between 0,0599 and 0,06 − 1e-6 moves',
    precipToU8Log(Math.fround(0.06)) === 1 && precipToU8Log(0.06) === 1 && precipToU8Log(0.059) === 0 && precipToU8Log(0.048) === 0 && precipToU8Log(0.06 - 2e-6) === 0 && precipToU8Log(6 * 0.01) === 1);
  const src = read('src/sources/rvHdf5.ts');
  add('B3 rvHdf5.ts: default units stay RADOLAN (E-EX-6), `secondaryUnits` + `withNative` are additive options',
    /const native = opts\.units === 'native'/.test(src) && /secondaryUnits\?: RvUnits/.test(src) && /withNative\?: boolean/.test(src)
    && /secondaryNative \? grid\.rainRateNative! : grid\.rainRate/.test(src));
}

// ─── C hd250 minRate ───
{
  const rv = new Float32Array(1100 * 1200);   // three wet blocks: 0,036 (under), 0,06 (at), 0,5 (above)
  rv[10 * 1100 + 10] = 0.036; rv[10 * 1100 + 11] = 0.06; rv[10 * 1100 + 12] = 0.5; rv[20 * 1100 + 20] = NaN;
  const comp = { rate: new Float32Array(HD250_COLS * HD250_ROWS).fill(NaN), dist: new Float32Array(0), siteIdx: new Int8Array(0) };
  const a = anchorToRv(rv, comp), b = anchorToRv(rv, comp, { minRate: RADAR_DISPLAY_MIN_MMH });
  const cell = (f, i, j) => f.rate[(j * 4) * HD250_COLS + i * 4];
  const near = (x, y) => Math.abs(x - y) < 1e-6;
  let finite = true; for (let k = 0; k < a.rate.length; k++) if (!Number.isFinite(a.rate[k])) { finite = false; break; }
  add('C1 without minRate byte-identical (3 wet blocks, flat), with it the 0,036 block is dry and counted, 0,06 and 0,5 stay',
    a.wetBlocks === 3 && a.belowMinBlocks === undefined && near(cell(a, 10, 10), 0.036) && finite
    && b.wetBlocks === 2 && b.belowMinBlocks === 1 && cell(b, 10, 10) === 0 && near(cell(b, 11, 10), 0.06) && near(cell(b, 12, 10), 0.5));
  add('C2 minRate 0 = no option', anchorToRv(rv, comp, { minRate: 0 }).wetBlocks === 3);
}

// ─── D contracts ───
{
  const frames = Array.from({ length: 25 }, (_, i) => ({ lead: i * 5, file: `f${String(i * 5).padStart(3, '0')}.png`, bytes: 10 }));
  const gframes = frames.map((f) => ({ lead: f.lead, file: `g${String(f.lead).padStart(3, '0')}.png`, bytes: 10 }));
  const stamp = '2610100740', runAtMs = Date.UTC(2026, 9, 10, 7, 40);
  const metaOld = makeRvImgMeta(stamp, runAtMs, frames, [], makeRadarImgDual(gframes));
  const metaNew = makeRvImgMeta(stamp, runAtMs, frames, [], makeRadarImgDual(gframes, { native: true, displayMin: RADAR_DISPLAY_MIN_MMH }));
  const ok = (m) => !!parseRvImgMeta(JSON.parse(JSON.stringify(m)));
  const mut = (m, f) => { const c = JSON.parse(JSON.stringify(m)); f(c); return ok(c); };
  add('D1 meta.dual without RG fields (slots before RG) and with native+displayMin both pass', ok(metaOld) && ok(metaNew) && metaNew.dual.native === true && metaNew.dual.displayMin === 0.06
    && metaOld.dual.native === undefined && metaOld.dual.displayMin === undefined);
  add('D2 mutations fail: native false, displayMin below the floor, native without displayMin, displayMin NaN',
    !mut(metaNew, (c) => { c.dual.native = false; }) && !mut(metaNew, (c) => { c.dual.displayMin = 0.01; }) && !mut(metaNew, (c) => { delete c.dual.displayMin; })
    && !mut(metaNew, (c) => { c.dual.displayMin = 'x'; }));
  const field = { rate: new Float32Array(0), wetBlocks: 2, structuredBlocks: 1, flatBlocks: 1, belowMinBlocks: 5 };
  const h = makeHd250Meta(stamp, runAtMs, ['asb'], [], field, [], { displayMin: RADAR_DISPLAY_MIN_MMH });
  const h0 = makeHd250Meta(stamp, runAtMs, ['asb'], [], { ...field, belowMinBlocks: undefined }, []);
  const hok = (m) => !!parseHd250Meta(JSON.parse(JSON.stringify(m)));
  add('D3 hd250.json with displayMin + blocks.belowMin passes, without both passes, displayMin 0,01 / belowMin 1.5 fail',
    hok(h) && hok(h0) && h.displayMin === 0.06 && h.blocks.belowMin === 5 && h0.displayMin === undefined && h0.blocks.belowMin === undefined
    && !hok({ ...h, displayMin: 0.01 }) && !hok({ ...h, blocks: { ...h.blocks, belowMin: 1.5 } }));
}

// ─── E frozen rule ───
{
  const dir = 'audit/radar-regenschwelle';
  const hashFile = read(`${dir}/claims-frozen.sha256`).split(/\r?\n/)[0].trim();
  const copy = readFileSync(join(ROOT, dir, 'claims-frozen.txt'));
  const sha = createHash('sha256').update(copy).digest('hex');
  add('E1 claims-frozen.sha256 is the sha256 of claims-frozen.txt (frozen 2026-10-10T08:41:56Z)', sha === hashFile && /^2092e572/.test(sha), sha.slice(0, 12));
  const audit = read('audit/radar-regenschwelle.md');
  const s4 = audit.slice(audit.indexOf('## §4 Messprotokoll'), audit.indexOf('Der Hash in `claims-frozen.sha256`')).trimEnd();
  const frozen = copy.toString('utf8').replace(/\*\(§5 Ergebnis.*\)\*\s*$/, '').trimEnd();
  add('E2 §4 of the audit still equals the frozen copy (rule unchanged after the measurement)', s4 === frozen, `${s4.length} / ${frozen.length} chars`);
  add('E3 the rule names Z = 90 % as recommendation and the four options, and W1 as the primary truth', /80 \/ 85 \/ 90 \/ 95 %/.test(frozen) && /Empfehlung 90 %/.test(frozen) && /W1 \(primär/.test(frozen));
}

// ─── F reproduction on real rows ───
{
  const fx = JSON.parse(read('scripts/lib/fixtures/radar-threshold-cases.json'));
  add('F1 fixture: real DWD indicator rows × RV analyses, ≥ 1 000 rows, every row with both analyses and an indicator value',
    fx.kind === 'radar-threshold-cases' && fx.cases.length >= 1000 && fx.cases.every((c) => Number.isFinite(c.natA) && Number.isFinite(c.natB) && (c.ind === 0 || c.ind === 1) && c.rws >= 0),
    `${fx.cases.length} rows of ${fx.allRows}`);
  const wet1 = (c) => c.ind === 1 || c.dau > 0 || c.rws >= 0.01, wet2 = (c) => c.rws >= 0.01;
  const prec = (truth, s) => { let h = 0, fa = 0; for (const c of fx.cases) { const blue = s === 'echo' ? Math.max(c.radA, c.radB) > 0 : Math.max(c.natA, c.natB) >= s - 1e-9; if (!blue) continue; if (truth(c)) h++; else fa++; } return h / (h + fa); };
  const pod = (truth, s) => { let h = 0, m = 0; for (const c of fx.cases) { if (!truth(c)) continue; const blue = s === 'echo' ? Math.max(c.radA, c.radB) > 0 : Math.max(c.natA, c.natB) >= s - 1e-9; if (blue) h++; else m++; } return h / (h + m); };
  const steps = [0.012, 0.024, 0.036, 0.048, 0.06, 0.072, 0.096, 0.12, 0.204, 0.3, 0.504];
  const curve = steps.map((s) => prec(wet1, s));
  const mono = curve.every((p, i) => i === 0 || p >= curve[i - 1] - 1e-12);
  add('F2 precision rises monotonically with the threshold on the real subset (W1)', mono, curve.map((p) => (100 * p).toFixed(1)).join(' → '));
  add('F3 today (every echo) < 90 %, 0,06 ≥ 90 %, 0,12 ≥ 93 % on the subset; POD falls', prec(wet1, 'echo') < 0.9 && prec(wet1, 0.06) >= 0.9 && prec(wet1, 0.12) >= 0.93 && pod(wet1, 0.06) < pod(wet1, 'echo'),
    `echo ${(100 * prec(wet1, 'echo')).toFixed(1)} · 0,06 ${(100 * prec(wet1, 0.06)).toFixed(1)} · 0,12 ${(100 * prec(wet1, 0.12)).toFixed(1)} · POD ${(100 * pod(wet1, 'echo')).toFixed(1)} → ${(100 * pod(wet1, 0.06)).toFixed(1)}`);
  add('F4 negative control: the amount-only truth (RWS ≥ 0,01) reads ≥ 15 points lower than the indicator truth on the SAME rows (the gauge misses drizzle)',
    prec(wet1, 0.06) - prec(wet2, 0.06) >= 0.15 && prec(wet1, 'echo') - prec(wet2, 'echo') >= 0.15, `W2 echo ${(100 * prec(wet2, 'echo')).toFixed(1)}, 0,06 ${(100 * prec(wet2, 0.06)).toFixed(1)}`);
  const lifted = fx.cases.filter((c) => Math.max(c.radA, c.radB) > 0 && Math.max(c.natA, c.natB) < 0.06).length;
  add('F5 the lift is in the rows: cases blue today but native < 0,06 exist (≥ 5 % of blue cases)', lifted >= 0.05 * fx.cases.filter((c) => Math.max(c.radA, c.radB) > 0).length, `${lifted} rows`);
  add('F6 stored full-sample result: 90 % ⇒ 0,06 (selection and hold-out), 0,06 precision ≥ 0,93 with lower bound ≥ 0,90, echo < 0,87',
    fx.full.thresholds['0.9'].W1 === 0.06 && fx.full.thresholds['0.9'].W1holdout === 0.06 && fx.full.s006.prec >= 0.93 && fx.full.s006.precLo >= 0.9 && fx.full.echo.prec < 0.87 && fx.full.holdout006.precLo >= 0.9);
  add('F7 the subset agrees with the full sample within 3 points at echo and 0,06', Math.abs(prec(wet1, 'echo') - fx.full.echo.prec) <= 0.03 && Math.abs(prec(wet1, 0.06) - fx.full.s006.prec) <= 0.03);
}

// ─── G wiring ───
{
  const derive = read('scripts/radar-mirror/radar-derive.mjs');
  add('G1 producer: RADAR_LOG_NATIVE switch, secondaryUnits native, hd250 anchored natively with minRate, meta extras',
    /RADAR_LOG_NATIVE === '1'/.test(derive) && /secondaryUnits: 'native'/.test(derive) && /minRate: RADAR_DISPLAY_MIN_MMH/.test(derive)
    && /displayMin: RADAR_DISPLAY_MIN_MMH/.test(derive) && /units: 'native'/.test(derive));
  add('G2 workflow template carries RADAR_LOG_NATIVE: \'1\' (copy into the data repo = Jan)', /RADAR_LOG_NATIVE: '1'/.test(read('scripts/radar-mirror/workflow-radar.yml')));
  const mv = read('src/MapView.tsx');
  add('G3 MapView: pre-pass on the log plane and the 250-m tiles, status names the threshold', /withDisplayMin\(f\.values2\)/.test(mv) && /withDisplayMin\(A\.values\)/.test(mv) && /rminText/.test(mv) && /radarDisplayMinFrom\(\)/.test(mv));
  add('G4 npm script + CI step', /"verify:radar-threshold"/.test(read('package.json')) && /verify:radar-threshold/.test(read('.github/workflows/ci.yml')));
  add('G5 RainLayer shader untouched by RG (no new uniform named for the threshold)', !/u_rmin|u_displayMin/.test(read('src/scalar/RainLayer.ts')));
}

// ─── H real producer round trip ───
const RAW = process.env.RADAR_RG_RAW;
if (RAW && existsSync(RAW)) {
  const tmp = mkdtempSync(join(tmpdir(), 'rg-'));
  const run = (env, out) => spawnSync(process.execPath, ['--experimental-strip-types', '--import', pathToFileURL(join(ROOT, 'scripts/lib/register-ts.mjs')).href, join(ROOT, 'scripts/radar-mirror/radar-derive.mjs'), 'rv', RAW, out, '2610100740'], { env: { ...process.env, RADAR_IMG_DUAL: '1', ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const a = run({ RADAR_LOG_NATIVE: '' }, join(tmp, 'lifted')), b = run({ RADAR_LOG_NATIVE: '1' }, join(tmp, 'native'));
  add('H1 both producer runs ok', a.status === 0 && b.status === 0, (a.stderr + b.stderr).split('\n').filter((l) => !/Warning|trace-warnings/.test(l)).join(' ').slice(0, 200));
  if (a.status === 0 && b.status === 0) {
    const same = (f) => readFileSync(join(tmp, 'lifted', f)).equals(readFileSync(join(tmp, 'native', f)));
    const files = readdirSync(join(tmp, 'lifted'));
    add('H2 every f<lead>.png and m<lead>.png byte-identical with and without the switch', files.filter((f) => /^[fm]\d{3}\.png$/.test(f)).every(same), `${files.length} files`);
    const g0a = decodePng(readFileSync(join(tmp, 'lifted', 'g000.png'))), g0b = decodePng(readFileSync(join(tmp, 'native', 'g000.png')));
    let ch1 = 0, liftedPos = 0, nativeZero = 0, nativeWrong = 0, under = 0;
    const tar = readFileSync(RAW); const e0 = untar(new Uint8Array(tar.buffer, tar.byteOffset, tar.byteLength)).find((e) => /_000-hd5$/.test(e.name));
    const nat = await decodeRvHdf5(e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength), { units: 'native', name: 'x' });
    for (let k = 0; k < nat.rainRate.length; k++) {
      if (g0a.data[k * 2] !== g0b.data[k * 2]) ch1++;
      const v = nat.rainRate[k]; if (Number.isNaN(v)) continue;
      const la = g0a.data[k * 2 + 1], lb = g0b.data[k * 2 + 1];
      if (v > 0 && v < 0.06 - 1e-6) { under++; if (la > 0) liftedPos++; if (lb === 0) nativeZero++; }
      if (lb !== precipToU8Log(v)) nativeWrong++;
    }
    add('H3 g000 channel 1 byte-identical', ch1 === 0);
    add('H4 native plane = precipToU8Log(native rate) on every pixel; every pixel 0 < native < 0,06 is 0 natively and > 0 lifted',
      nativeWrong === 0 && under > 0 && nativeZero === under && liftedPos === under, `${under} pixels under 0,06 (${(100 * under / nat.rainRate.filter((x) => x > 0).length).toFixed(1)} % of the native-wet)`);
    const ma = JSON.parse(readFileSync(join(tmp, 'lifted', 'meta.json'), 'utf8')), mb = JSON.parse(readFileSync(join(tmp, 'native', 'meta.json'), 'utf8'));
    add('H5 meta: lifted without RG fields, native with native:true + displayMin 0,06; both pass the client parser',
      ma.dual.native === undefined && mb.dual.native === true && mb.dual.displayMin === 0.06 && !!parseRvImgMeta(ma) && !!parseRvImgMeta(mb));
    // the raw-1 echo (0,000 mm/h natively) is blue today and gone natively
    const raw1 = nat.rainRate.reduce((n, v, k) => n + (v === 0 && g0a.data[k * 2] > 0 ? 1 : 0), 0);
    add('H6 raw value 1 (0,000 mm/h): blue in the lifted plane, absent natively', raw1 > 0 && nat.rainRate.every((v, k) => v !== 0 || g0b.data[k * 2 + 1] === 0), `${raw1} pixels`);
  }
  rmSync(tmp, { recursive: true, force: true });
} else skip('H producer round trip on a real RV tar', 'set RADAR_RG_RAW=<composite_rv_*.tar>');

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
