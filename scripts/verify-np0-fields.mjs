/**
 * verify-np0-fields.mjs — Phase NP-0b (audit/np0-datenprodukte.md §3.4, §8): Kartenfelder aus dem Punkt-Cube.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-np0-fields.mjs
 *        [--data=C:/dev/buscosun-data]   lokaler Klon des Daten-Repos (nur gelesen) für B; fehlt er, ist B ⊘
 *        [--cells=60]                    Zellen je Stufe für die Konsistenz-Probe (≥ 50)
 *        [--live]                        nach Jans Push: Index, Manifeste und PNGs im Daten-Repo
 *
 * A Vertrag (netzfrei): Raster je Stufe, Kodierer/Dekodierer im Rundlauf mit Fehlerschranke, fehlt ≠ 0, Manifest- und
 *   Index-Prüfer mit Negativkontrollen, CDN-Klassen.
 * B Producer an echten Läufen (Kopie in ein Temp-Verzeichnis, der Klon bleibt unberührt):
 *   Konsistenz-Probe je Stufe — Feldwert (PNG dekodiert) = Kette am Zellmittelpunkt über die volle Ausgabe
 *   `toPointForecastV2` (alle Ebenen) innerhalb der Quantisierung; Teilmengen-Weg = voller Weg exakt; Negativkontrollen
 *   (ohne Niederschlagsebenen ⇒ A 0; ohne Lernstufe ⇒ die Probe schlägt an); Cube-Byte-Gleichheit (Builder fasst nur
 *   `field/` an; Publisher mit/ohne Felder gleich bis auf `field/`); `POINT_FIELDS=0`; Budget-Regel b′; Aufbewahrung.
 * C (optional, --live) Daten-Repo nach dem Push.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, cpSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { decodePng, toRgba } from './lib/png.mjs';
import { TIERS, TIER_BY_ID, decodeCubeChunk, POINT_INDEX_PATH } from '../src/point/cubeFormat.ts';
import {
  FIELD_DIR, FIELD_INDEX_PATH, FIELD_LABEL, fieldGrid, fieldPixelOffset, fieldFileName, fieldRunDir,
  precipLogCode, precipLogValue, encodePrecipPixel, decodePrecipPixel, decodePexcPixel, encodeSnowPixel, decodeSnowPixel,
  makeFieldManifest, parseFieldManifest, makeFieldIndex, parseFieldIndex, PRECIP_XMAX, SNOW_STEP_M, CHANCE_DEFINITION,
} from '../src/point/fieldFormat.ts';
import { classifyPointPath, planCdnSync } from './point/cdnSync.mjs';
import { pruneFieldStore, writeFieldIndex, fieldStaleness, FIELD_MIN_S_BY_TIER, FIELD_WATCH_MAX_MISSED } from './point/fieldStore.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const H = 3_600_000;
let pass = 0, fail = 0, skip = 0;
function add(name, ok, detail = '') { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); }
function skipped(name, why) { skip++; console.log(`⊘     ${name} — ${why}`); }
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const node = (script, a, env = {}) => execFileSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', script, ...a],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, timeout: 900_000 });

// ─── A Vertrag ────────────────────────────────────────────────────────────────────────────────
console.log('\n== A Vertrag ==');
{
  const ok = TIERS.every((t) => { const g = fieldGrid(t); return g.width === t.nx && g.height === t.ny && g.rowOrder === 'north-first'; });
  const t1 = TIER_BY_ID.t1;
  add('A1 Raster = Gitter der Stufe; Zeile 0 = Norden (Zelle iy = ny − 1 ⇒ Offset 0), Ecken = Zellränder',
    ok && fieldPixelOffset(t1, t1.ny - 1, 0) === 0 && fieldPixelOffset(t1, 0, 0) === (t1.ny - 1) * t1.nx * 4
    && Math.abs(fieldGrid(t1).corners[0][1] - (t1.lat0 + (t1.ny - 1) * t1.deg + t1.deg / 2)) < 1e-6,
    TIERS.map((t) => `${t.id} ${t.nx}×${t.ny}`).join(', '));
  add('A2 Pfade point/field/v1/<lauf>/<stufe>/precip-LLL.png, Index point/field/v1/index.json',
    fieldRunDir('2026100318', 't2') === 'point/field/v1/2026100318/t2' && fieldFileName('precip', 6) === 'precip-006.png'
    && fieldFileName('snowlmt', 126) === 'snowlmt-126.png' && FIELD_INDEX_PATH === `${FIELD_DIR}/index.json`);
  let worstRel = 0, mono = true, prev = -1;
  for (let c = 1; c <= 255; c++) { const v = precipLogValue(c); if (v <= prev && c > 1) mono = false; prev = v; }
  for (let x = 0.01; x <= PRECIP_XMAX; x *= 1.05) {
    const back = precipLogValue(precipLogCode(x));
    worstRel = Math.max(worstRel, Math.abs((1 + back / 0.1) / (1 + x / 0.1) - 1));
  }
  add('A3 Log-Code: streng monoton, Fehler von (1 + x/x₀) ≤ 1,4 % auf 0,01…100 mm/h, 0 ⇒ Code 0, ≥ x_max ⇒ 255',
    mono && worstRel <= 0.014 && precipLogCode(0) === 0 && precipLogCode(1e6) === 255, `max ${(worstRel * 100).toFixed(2)} %`);
  const px = new Uint8Array(4);
  const cases = [{ chance: 0, medianWet: null, q90: 0 }, { chance: 0.37, medianWet: 0.8, q90: 2.4 }, { chance: 1, medianWet: 12, q90: 30 }];
  let rt = true;
  for (const v of cases) {
    encodePrecipPixel(v, px, 0);
    const d = decodePrecipPixel(px[0], px[1], px[2], px[3]);
    rt &&= !!d && Math.abs(d.chance - v.chance) <= 1 / 508 + 1e-9 && (v.medianWet == null ? d.medianWet === null : Math.abs(d.medianWet / v.medianWet - 1) < 0.06)
      && (v.q90 === 0 ? d.q90 === 0 : Math.abs(d.q90 / v.q90 - 1) < 0.06);
  }
  encodePrecipPixel(null, px, 0);
  rt &&= px[3] === 0 && decodePrecipPixel(px[0], px[1], px[2], px[3]) === null;
  add('A4 Niederschlag im Rundlauf: Chance ±1/508, Mengen innerhalb der Log-Stufe; „trocken" (Chance 0) ≠ „fehlt" (A 0 ⇒ null)', rt);
  const sp = new Uint8Array(4);
  encodeSnowPixel({ mid: 1312, half: 384.5, prov: 'divergence' }, sp, 0);
  const s1 = decodeSnowPixel(sp[0], sp[1], sp[2], sp[3]);
  const sat = encodeSnowPixel({ mid: 7000, half: 0, prov: 'none' }, sp, 0);
  encodeSnowPixel(null, sp, 0);
  add('A5 Schneefallgrenze: 25-m-Schritte, Herkunft σ_div/σ_ens/ohne, Sättigung über 6 375 m gemeldet, fehlt ⇒ A 0',
    s1.mid === 1300 && s1.half === 375 && s1.prov === 'divergence' && sat === true && decodeSnowPixel(sp[0], sp[1], sp[2], sp[3]) === null && SNOW_STEP_M === 25);
  const runAtMs = Date.UTC(2026, 9, 3, 18);
  const leads = TIER_BY_ID.t1.leadHours.map((L) => ({ leadH: L, validAtMs: runAtMs + L * H, precip: fieldFileName('precip', L), snowlmt: fieldFileName('snowlmt', L) }));
  const m = makeFieldManifest({ run: '2026100318', tier: 't1', runAtMs, builtAtMs: runAtMs + 2 * H, leads, chain: { options: {}, tables: null, codeCommit: null, notes: [] }, stats: { cells: 1, precipMissing: 0, snowMissing: 0, saturated: 0, errors: 0 }, timing: { ms: 1, workers: 1 } });
  const okM = parseFieldManifest(JSON.parse(JSON.stringify(m)));
  const bad = [
    { ...m, label: 'buscosun Fusion 8' }, { ...m, grid: { ...m.grid, width: 1 } }, { ...m, leads: [{ ...leads[0], precip: 'x.png' }, ...leads.slice(1)] },
    { ...m, encoding: { ...m.encoding, x0: 1 } }, { ...m, leads: [{ ...leads[0], validAtMs: 0 }] }, { ...m, provenance: 'fusion' },
  ].map((x) => parseFieldManifest(JSON.parse(JSON.stringify(x))));
  add('A6 Manifest: Bauer → Prüfer angenommen; sechs Verfälschungen abgelehnt (Etikett „buscosun Fusion 8", Raster, Dateiname, Kodierung, Gültigkeit, Herkunft)',
    !!okM && bad.every((b) => b === null) && okM.label === "Modell · Cube" && /Station, Radar und Gelände/.test(okM.chance.text) && /Brier/.test(okM.chance.measured));
  const idx = makeFieldIndex({ t1: { run: '2026100318', runAtMs, builtAtMs: runAtMs, durationMs: 1, leads: 49 } }, { t1: ['2026100318'] }, runAtMs);
  add('A7 Index: Bauer → Prüfer; fremdes Etikett und kaputter Lauf-Name abgelehnt',
    !!parseFieldIndex(JSON.parse(JSON.stringify(idx))) && parseFieldIndex({ ...idx, label: 'x' }) === null
    && parseFieldIndex({ ...idx, latestByTier: { t1: { ...idx.latestByTier.t1, run: 'x' } } }) === null && idx.label === FIELD_LABEL);
  add('A8 CDN: Feld-Index (und budget.json) purgen auch beim Anlegen, Manifeste/PNGs nur wärmen — nach den Chunks',
    classifyPointPath('point/field/v1/index.json') === 'field-index' && classifyPointPath('point/field/v1/2026100318/t1/precip-006.png') === 'field'
    && classifyPointPath('point/field/v1/2026100318/t1/field.json') === 'field' && classifyPointPath('point/.build/field-x/precip-000.png') === 'stage'
    && (() => {
      const plan = planCdnSync([{ status: 'A', path: 'point/field/v1/index.json' }, { status: 'A', path: 'point/field/v1/2026100318/t1/precip-006.png' }, { status: 'A', path: 'point/2026100318/t1/00_00.bin' }], { commit: 'abc' });
      return plan.purge.some((p) => p.path === 'point/field/v1/index.json') && !plan.purge.some((p) => p.path.endsWith('.png'))
        && plan.warm.findIndex((u) => u.endsWith('.png')) > plan.warm.findIndex((u) => u.endsWith('.bin'));
    })());
  add('A9 Chance-Definition F1 mit Messwerten und Einschränkung im Vertrag', CHANCE_DEFINITION.id === 'F1' && /0,0268/.test(CHANCE_DEFINITION.measured) && /zu nass/.test(CHANCE_DEFINITION.caveat));
}

// ─── B Producer an echten Läufen ──────────────────────────────────────────────────────────────
console.log('\n== B Producer an echten Läufen ==');
const DATA = args.data ?? 'C:/dev/buscosun-data';
const N_PROBE = Math.max(50, Number(args.cells ?? 60));
if (!existsSync(join(DATA, 'point', 'index.json'))) {
  skipped('B (Producer an echten Läufen)', `kein Daten-Klon unter ${DATA} (--data=…)`);
} else {
  const B = await import('./point/build-point-fields.mjs');
  const { cubeSeriesFrom } = await import('../src/point/client/cubePoint.ts');
  const { fuseCubePoint } = await import('../src/pointForecast/cubeSource.ts');
  const { toPointForecastV2 } = await import('../src/pointForecast/fusion/output.ts');
  const { ClimaField } = await import('../src/ml/climaField.ts');
  const T = mkdtempSync(join(tmpdir(), 'np0-fields-'));
  try {
    // Kopie: Index, Tabellen und je Stufe der jüngste Lauf (nur run.json + Chunks dieser Stufe).
    const P = join(T, 'point');
    mkdirSync(P, { recursive: true });
    for (const f of ['index.json', 'fusion.client.json']) if (existsSync(join(DATA, 'point', f))) cpSync(join(DATA, 'point', f), join(P, f));
    const runs = readdirSync(join(DATA, 'point')).filter((d) => /^\d{10}$/.test(d)).sort();
    const pick = {};
    for (const t of TIERS) {
      const run = [...runs].reverse().find((r) => { try { return JSON.parse(readFileSync(join(DATA, 'point', r, 'run.json'), 'utf8')).tiers.some((x) => x.id === t.id && x.files?.length); } catch { return false; } });
      if (!run) continue;
      pick[t.id] = run;
      const man = JSON.parse(readFileSync(join(DATA, 'point', run, 'run.json'), 'utf8'));
      mkdirSync(join(P, run), { recursive: true });
      cpSync(join(DATA, 'point', run, 'run.json'), join(P, run, 'run.json'));
      for (const f of man.tiers.find((x) => x.id === t.id).files) { mkdirSync(dirname(join(T, f.file)), { recursive: true }); cpSync(join(DATA, f.file), join(T, f.file)); }
    }
    const treeHash = (dir) => {
      const out = new Map();
      const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.set(relative(dir, p).replace(/\\/g, '/'), sha(readFileSync(p))); } };
      walk(dir); return out;
    };
    const cubeOnly = (m) => new Map([...m].filter(([p]) => !p.startsWith('field/')));
    const before = cubeOnly(treeHash(P));
    const clima = new ClimaField(JSON.parse(readFileSync(join(ROOT, 'public', 'climaGrid.json'), 'utf8')));
    const learned = JSON.parse(readFileSync(join(P, 'fusion.client.json'), 'utf8'));

    for (const tierId of Object.keys(pick)) {
      const run = pick[tierId], tier = TIER_BY_ID[tierId];
      const man = JSON.parse(readFileSync(join(P, run, 'run.json'), 'utf8'));
      const runAtMs = Date.parse(man.runAt), nowMs = runAtMs + 2 * H;
      const t0 = Date.now();
      node('scripts/point/build-point-fields.mjs', [`--tier=${tierId}`, `--point=${P}`, `--now=${nowMs}`, `--cells=${N_PROBE}`, '--workers=2', '--force']);
      const dir = join(P, 'field', 'v1', run, tierId);
      const fm = parseFieldManifest(JSON.parse(readFileSync(join(dir, 'field.json'), 'utf8')));
      add(`B1 ${tierId} ${run}: Feld gebaut, Manifest besteht den Prüfer, Etikett „Modell · Cube", Tabellen-Hash genannt`,
        !!fm && fm.label === 'Modell · Cube' && !!fm.chain.tables?.sha256 && fm.chain.options.nowMs === nowMs, fm ? `${fm.stats.cells} Zellen, ${(Date.now() - t0) / 1000} s` : 'kein Manifest');
      // Konsistenz-Probe: jede gerechnete Zelle gegen die volle Kette (alle Ebenen) + toPointForecastV2.
      const tm = man.tiers.find((x) => x.id === tierId);
      const leadsMs = tm.leadHours.map((L) => runAtMs + L * H);
      const pngs = new Map();
      const pixel = (kind, k) => { const f = fieldFileName(kind, tm.leadHours[k]); if (!pngs.has(f)) pngs.set(f, existsSync(join(dir, f)) ? toRgba(decodePng(readFileSync(join(dir, f)))) : null); return pngs.get(f); };
      let cells = 0, cmp = 0, bad = 0, subsetSame = 0, subsetDiff = 0, worst = '', pexcCmp = 0;
      const pointer = { run, runAt: man.runAt };
      for (const f of tm.files) {
        if (cells >= N_PROBE) break;
        const bytes = new Uint8Array(readFileSync(join(T, f.file)));
        const chunk = await decodeCubeChunk(bytes, { planes: man.planes.map((p) => ({ id: p.id })) });
        for (let ry = 0; ry < chunk.ny && cells < N_PROBE; ry++) for (let rx = 0; rx < chunk.nx && cells < N_PROBE; rx++) {
          const iy = chunk.y0 + ry, ix = chunk.x0 + rx, off = fieldPixelOffset(tier, iy, ix);
          const p0 = pixel('precip', 0) ?? pixel('precip', 1);
          if (!p0 || p0[off + 3] !== 255) continue;     // nicht in der Stichprobe des Builds
          cells++;
          const addr = { tierId, tier, pointer, cell: { iy, ix }, chunk: { cy: f.cy, cx: f.cx }, path: f.file };
          const c = { lat: tier.lat0 + iy * tier.deg, lon: tier.lon0 + ix * tier.deg };
          const full = cubeSeriesFrom(chunk, addr, man.planes, { bytes: 0, manifest: man, manifestFrom: 'caller', ...c, neighbours: false });
          const sub = cubeSeriesFrom(chunk, addr, man.planes, { bytes: 0, manifest: man, manifestFrom: 'caller', ...c, neighbours: false, wanted: B.fieldPlanes(man.planes) });
          const rFull = fuseCubePoint(B.cellInput({ series: full, tier, runAtMs, nowMs, clima, learned }), B.FIELD_FUSE_OPTIONS);
          const ref = B.fieldValuesOf(toPointForecastV2(rFull, { nowMs }), leadsMs, tier.stepH);
          const fast = B.fieldValuesFromResult(fuseCubePoint(B.cellInput({ series: sub, tier, runAtMs, nowMs, clima, learned }), B.FIELD_FUSE_OPTIONS), leadsMs, tier.stepH);
          for (let k = 0; k < leadsMs.length; k++) {
            const a = ref[k], b = fast[k];
            const same = JSON.stringify(a) === JSON.stringify(b);
            same ? subsetSame++ : subsetDiff++;
            const pp = pixel('precip', k), sp = pixel('snowlmt', k);
            if (a.precip) {
              cmp++;
              const d = pp ? decodePrecipPixel(pp[off], pp[off + 1], pp[off + 2], pp[off + 3]) : null;
              const okP = d && Math.abs(d.chance - a.precip.chance) <= 1 / 508 + 1e-9
                && (a.precip.q90 === 0 ? d.q90 === 0 || precipLogCode(a.precip.q90) === 0 : precipLogCode(a.precip.q90) === pp[off + 2])
                && (a.precip.medianWet == null || a.precip.chance === 0 ? true : precipLogCode(a.precip.medianWet) === pp[off + 1]);
              if (!okP) { bad++; worst ||= `${iy}/${ix} L${tm.leadHours[k]} ref ${JSON.stringify(a.precip)} feld ${JSON.stringify(d)}`; }
              // Phase RC: P(≥ 1 mm), P(≥ 5 mm) — nur Felder, die schon `pexc` tragen (gebaut nach dem RC-Producer).
              const xp = fm.leads[k]?.pexc ? pixel('pexc', k) : null;
              if (xp) {
                cmp++; pexcCmp++;
                const e = decodePexcPixel(xp[off], xp[off + 1], xp[off + 2], xp[off + 3]);
                const okX = e && Math.abs(e.ge1 - a.precip.ge1) <= 1 / 508 + 1e-9 && Math.abs(e.ge5 - a.precip.ge5) <= 1 / 508 + 1e-9 && e.ge1 <= d.chance + 1 / 254 && e.ge5 <= e.ge1 + 1 / 254;
                if (!okX) { bad++; worst ||= `${iy}/${ix} L${tm.leadHours[k]} pexc ref ${a.precip.ge1}/${a.precip.ge5} feld ${JSON.stringify(e)}`; }
              }
            }
            if (a.snow) {
              cmp++;
              const d = sp ? decodeSnowPixel(sp[off], sp[off + 1], sp[off + 2], sp[off + 3]) : null;
              const okS = d && Math.abs(d.mid - a.snow.mid) <= SNOW_STEP_M / 2 && (a.snow.prov === 'none' ? d.prov === 'none' : Math.abs(d.half - a.snow.half) <= SNOW_STEP_M / 2 && d.prov === a.snow.prov);
              if (!okS) { bad++; worst ||= `${iy}/${ix} L${tm.leadHours[k]} Schnee ref ${JSON.stringify(a.snow)} feld ${JSON.stringify(d)}`; }
            }
          }
        }
      }
      add(`B2 ${tierId}: Konsistenz-Probe an ${cells} Zellen (≥ 50) — Feld = Kette am Zellmittelpunkt über die volle Ausgabe (toPointForecastV2), innerhalb der Quantisierung`,
        cells >= 50 && cmp > 0 && bad === 0, `${cmp} Werte (davon ${pexcCmp} P(≥ 1/5 mm)), ${bad} daneben${worst ? ` (${worst})` : ''}`);
      add(`B3 ${tierId}: Teilmengen-Weg (nur Niederschlag/Schneefallgrenze/hModEff, ohne V2) = voller Weg, exakt`, subsetDiff === 0 && subsetSame > 0, `${subsetSame} gleich, ${subsetDiff} verschieden`);
      if (tierId === 't3') add('B4 t3: keine Schneefallgrenzen-Datei (keine t3-Quelle führt sie), im Manifest null statt Datei', fm.leads.every((l) => l.snowlmt === null));
    }
    // Negativkontrollen an t2 (klein, schnell)
    if (pick.t2) {
      const run = pick.t2, tier = TIER_BY_ID.t2;
      const man = JSON.parse(readFileSync(join(P, run, 'run.json'), 'utf8'));
      const runAtMs = Date.parse(man.runAt), nowMs = runAtMs + 2 * H;
      const tm = man.tiers.find((x) => x.id === 't2');
      const f = tm.files[Math.floor(tm.files.length / 2)];
      const chunk = await decodeCubeChunk(new Uint8Array(readFileSync(join(T, f.file))), { planes: man.planes.map((p) => ({ id: p.id })) });
      const iy = chunk.y0, ix = chunk.x0, c = { lat: tier.lat0 + iy * tier.deg, lon: tier.lon0 + ix * tier.deg };
      const addr = { tierId: 't2', tier, pointer: { run, runAt: man.runAt }, cell: { iy, ix }, chunk: { cy: f.cy, cx: f.cx }, path: f.file };
      const leadsMs = tm.leadHours.map((L) => runAtMs + L * H);
      const series = (w) => cubeSeriesFrom(chunk, addr, man.planes, { bytes: 0, manifest: man, manifestFrom: 'caller', ...c, neighbours: false, ...(w ? { wanted: w } : {}) });
      const noPrecip = B.fieldValuesFromResult(fuseCubePoint(B.cellInput({ series: series(['snowlmt', 'snowlmt_sd', 'hModEff']), tier, runAtMs, nowMs, clima, learned }), B.FIELD_FUSE_OPTIONS), leadsMs);
      add('B5 Negativkontrolle: ohne Niederschlagsebenen fehlt die Chance an jedem Schritt (A 0) — nie die Klimatologie unter dem Etikett „Modell · Cube"',
        noPrecip.every((v) => v.precip === null) && noPrecip.some((v) => v.snow !== null), `${noPrecip.filter((v) => v.precip).length} Schritte mit Chance`);
      const withL = B.fieldValuesFromResult(fuseCubePoint(B.cellInput({ series: series(B.fieldPlanes(man.planes)), tier, runAtMs, nowMs, clima, learned }), B.FIELD_FUSE_OPTIONS), leadsMs);
      const noL = B.fieldValuesFromResult(fuseCubePoint(B.cellInput({ series: series(B.fieldPlanes(man.planes)), tier, runAtMs, nowMs, clima, learned: null }), { ...B.FIELD_FUSE_OPTIONS, learned: false }), leadsMs);
      const moved = withL.filter((v, k) => v.precip && noL[k].precip && Math.abs(v.precip.chance - noL[k].precip.chance) > 1 / 508).length;
      add('B6 Negativkontrolle: ohne Lernstufe (K-2 allein) weicht die Chance an dieser Zelle ab — die Probe B2 ist scharf genug, eine falsche Kette zu sehen',
        moved > 0, `${moved} von ${leadsMs.length} Schritten verschieden`);
    }
    // Cube-Byte-Gleichheit: der Builder fasst außerhalb von field/ nichts an.
    const after = cubeOnly(treeHash(P));
    const sameCube = before.size === after.size && [...before].every(([p, h]) => after.get(p) === h);
    add('B7 Cube byte-gleich mit Feldern: jede Datei unter point/ außer field/ (run.json, Chunks, Index, Tabellen) unverändert, keine Bau-Reste',
      sameCube && !existsSync(join(P, '.build')) || (sameCube && readdirSync(join(P, '.build')).length === 0), `${before.size} Dateien`);
    const probe = new Map(before); probe.set([...probe.keys()][0], 'x');
    add('B8 Negativkontrolle: eine geänderte Datei fiele im Vergleich auf', ![...probe].every(([p, h]) => after.get(p) === h));
    // Publisher mit und ohne Felder (ohne .git: er schreibt nur den Baum): alles außer field/ gleich, bis auf die Uhrzeit.
    // V-RC-2: eigener try — ein Abbruch des Publishers (V-RC-4, unabhängig von den Feldern) verdeckte sonst B9…B18.
    try {
      const withF = mkdtempSync(join(tmpdir(), 'np0-pub-with-')), without = mkdtempSync(join(tmpdir(), 'np0-pub-without-'));
      cpSync(join(T, 'point'), join(withF, 'point'), { recursive: true });
      cpSync(join(T, 'point'), join(without, 'point'), { recursive: true, filter: (s) => !/[\\/]point[\\/]field([\\/]|$)/.test(s) });
      for (const d of [withF, without]) node('scripts/point/publish-point.mjs', [`--repo=${d}`, `--point=${join(d, 'point')}`]);
      const norm = (p, buf) => (p === 'index.json' ? sha(JSON.stringify({ ...JSON.parse(buf.toString()), publishedAt: null })) : sha(buf));
      const tree = (dir) => {
        const out = new Map();
        const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { const r = relative(dir, p).replace(/\\/g, '/'); out.set(r, norm(r, readFileSync(p))); } } };
        walk(dir); return out;
      };
      const a = tree(join(withF, 'point')), b = tree(join(without, 'point'));
      const aCube = new Map([...a].filter(([p]) => !p.startsWith('field/')));
      add('B14 Publisher mit/ohne Felder: index.json (ohne publishedAt), run.json, Chunks, Tabellen byte-gleich; mit Feldern zusätzlich field/v1/index.json',
        aCube.size === b.size && [...b].every(([p, h]) => aCube.get(p) === h) && a.has('field/v1/index.json') && !b.has('field/v1/index.json'),
        `${b.size} Dateien ohne field/, ${a.size - aCube.size} Feld-Dateien`);
      rmSync(withF, { recursive: true, force: true }); rmSync(without, { recursive: true, force: true });
    } catch (e) {
      add('B14 Publisher mit/ohne Felder lief durch', false, String(e.stderr ?? e.message).split('\n').filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).slice(0, 2).join(' | '));
    }
    // POINT_FIELDS=0
    const P0 = join(T, 'off');
    cpSync(P, P0, { recursive: true, filter: (s) => !s.includes(`${'field'}`) });
    const out0 = node('scripts/point/build-point-fields.mjs', ['--tier=t3', `--point=${P0}`], { POINT_FIELDS: '0' });
    add('B9 POINT_FIELDS=0: Schritt tut nichts (Exit 0, kein field/)', /Kartenfelder aus/.test(out0) && !existsSync(join(P0, 'field')));
    // Budget-Regel b′ (t1): ein langsames oder abgebrochenes letztes Feld lässt den direkt folgenden t1-Lauf aus.
    if (pick.t1) {
      const run = pick.t1;
      const prevRun = (() => { const d = new Date(Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10)) - 3 * H); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}`; })();
      const bdir = join(T, 'budget');
      cpSync(P, bdir, { recursive: true, filter: (s) => !s.replace(/\\/g, '/').includes('/field') });
      const writeBudget = (e) => { mkdirSync(join(bdir, 'field', 'v1'), { recursive: true }); writeFileSync(join(bdir, 'field', 'v1', 'budget.json'), JSON.stringify({ schema: 1, byTier: { t1: e } })); };
      writeBudget({ run: prevRun, runAtMs: 0, durationMs: 400_000, aborted: false });
      const s1 = node('scripts/point/build-point-fields.mjs', ['--tier=t1', `--point=${bdir}`, '--cells=4', '--workers=1']);
      writeBudget({ run: prevRun, runAtMs: 0, durationMs: 100_000, aborted: true });
      const s2 = node('scripts/point/build-point-fields.mjs', ['--tier=t1', `--point=${bdir}`, '--cells=4', '--workers=1']);
      add('B10 E-NP0-5 b′: letztes t1-Feld > 300 s oder abgebrochen und ≤ 3 h zurück ⇒ dieser t1-Lauf wird ausgelassen (beide Fälle)',
        /ausgelassen/.test(s1) && /ausgelassen/.test(s2) && !existsSync(join(bdir, 'field', 'v1', run)));
      writeBudget({ run: '2026010100', runAtMs: 0, durationMs: 400_000, aborted: false });
      const s3 = node('scripts/point/build-point-fields.mjs', ['--tier=t1', `--point=${bdir}`, '--cells=4', '--workers=1', `--now=${Date.parse(JSON.parse(readFileSync(join(bdir, run, 'run.json'), 'utf8')).runAt) + 2 * H}`]);
      add('B11 … und nach mehr als 3 h rechnet t1 wieder (jeder zweite Lauf, nicht keiner); budget.json hält den Versuch fest',
        !/ausgelassen/.test(s3) && existsSync(join(bdir, 'field', 'v1', run, 't1', 'field.json'))
        && JSON.parse(readFileSync(join(bdir, 'field', 'v1', 'budget.json'), 'utf8')).byTier.t1.run === run);
    }
    // Aufbewahrung: ein Feld lebt, solange seine Cube-Stufe lebt.
    {
      const R = join(T, 'prune', 'point');
      mkdirSync(join(R, '2026100100'), { recursive: true });
      writeFileSync(join(R, '2026100100', 'run.json'), JSON.stringify({ tiers: [{ id: 't1', files: [{ file: 'x' }] }, { id: 't3', files: [{ file: 'y' }] }] }));
      const mk = (run, tier, complete) => { const d = join(R, 'field', 'v1', run, tier); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'precip-000.png'), 'x'); if (complete) writeFileSync(join(d, 'field.json'), '{}'); };
      mk('2026100100', 't1', true); mk('2026100100', 't2', true); mk('2026093000', 't1', true); mk('2026100100', 't3', false);
      mkdirSync(join(R, 'field', 'v1', 'junk'), { recursive: true });
      const ev = pruneFieldStore(R);
      const left = existsSync(join(R, 'field', 'v1', '2026100100', 't1')) && !existsSync(join(R, 'field', 'v1', '2026100100', 't2'))
        && !existsSync(join(R, 'field', 'v1', '2026093000')) && !existsSync(join(R, 'field', 'v1', '2026100100', 't3')) && !existsSync(join(R, 'field', 'v1', 'junk'));
      add('B12 Aufbewahrung: Feld bleibt nur, wenn run.json die Stufe trägt; gelöschter Lauf, fremde Stufe, Bau ohne field.json und Müll fallen',
        left && ev.length === 4 && ev.filter((e) => e.kind === 'drop').length === 2 && ev.some((e) => e.kind === 'incomplete') && ev.some((e) => e.kind === 'junk'),
        ev.map((e) => e.kind).join(', '));
      add('B13 Index nur aus gültigen Manifesten (ein ungültiges field.json zählt nicht) — ohne Feld kein Index', writeFieldIndex(R) === null && !existsSync(join(R, 'field', 'v1', 'index.json')));
    }
    // V-RC-2: Mindestfenster — ein langsamer Cube-Bau (Jobstart 20 min zurück, FIELD_END_MIN 10 ⇒ Restzeit negativ) nimmt
    // t3 das Feld nicht mehr; mit FIELD_MIN_S=0 (Verhalten vorher) entfällt es und budget.json hält den Versuch fest.
    if (pick.t3) {
      const run = pick.t3;
      const late = { FIELD_JOB_T0: String(Math.floor(Date.now() / 1000) - 20 * 60), FIELD_END_MIN: '10' };
      const fdir = join(T, 'floor'), odir = join(T, 'floor0');
      for (const d of [fdir, odir]) cpSync(P, d, { recursive: true, filter: (s) => !s.replace(/\\/g, '/').includes('/field') });
      const sF = node('scripts/point/build-point-fields.mjs', ['--tier=t3', `--point=${fdir}`, '--cells=4', '--workers=1'], late);
      const s0 = node('scripts/point/build-point-fields.mjs', ['--tier=t3', `--point=${odir}`, '--cells=4', '--workers=1'], { ...late, FIELD_MIN_S: '0' });
      const b0 = JSON.parse(readFileSync(join(odir, 'field', 'v1', 'budget.json'), 'utf8')).byTier.t3;
      add(`B15 V-RC-2: Restzeit bis FIELD_END_MIN aufgebraucht ⇒ Feld im Mindestfenster ${FIELD_MIN_S_BY_TIER.t3} s (t3/t2), t1 ohne Fenster`,
        /Mindestfenster/.test(sF) && existsSync(join(fdir, 'field', 'v1', run, 't3', 'field.json')) && FIELD_MIN_S_BY_TIER.t2 === FIELD_MIN_S_BY_TIER.t3 && FIELD_MIN_S_BY_TIER.t1 === 0);
      add('B16 Negativkontrolle FIELD_MIN_S=0: dasselbe ohne Fenster ⇒ kein Feld (Fehler vom 08./09.10.) — und budget.json hält den ausgelassenen Versuch jetzt fest',
        /kein Feld für diesen Lauf/.test(s0) && !existsSync(join(odir, 'field', 'v1', run, 't3')) && b0?.run === run && b0.skipped === true && b0.reason === 'job-time');
    }
    // V-RC-2: Wächter — mehr als ein Cube-Lauf hintereinander ohne Feld ⇒ Exit 1 (Job rot).
    {
      const st = fieldStaleness({ t1: ['2026100903', '2026100906'], t2: ['2026100818', '2026100900', '2026100812'], t3: ['2026100900'] },
        { t1: ['2026100903'], t2: ['2026100806'], t3: ['2026100900'] });
      const by = Object.fromEntries(st.map((r) => [r.tier, r]));
      add(`B17 Wächter: t1 ein Lauf ohne Feld = in Ordnung (b′), t2 drei Läufe seit dem letzten Feld = veraltet (Fall 09.10.), t3 aktuell; ohne Cube kein Alarm`,
        !by.t1.stale && by.t1.missed === 1 && by.t2.stale && by.t2.missed === 3 && by.t2.missedRuns.join() === '2026100900,2026100818,2026100812' && !by.t3.stale
        && !fieldStaleness({}, {})[0].stale && fieldStaleness({ t2: ['2026100900', '2026100818'] }, {}, ['t2'])[0].stale && FIELD_WATCH_MAX_MISSED === 1,
        st.map((r) => `${r.tier} ${r.missed}${r.stale ? ' ⚠' : ''}`).join(', '));
      const W = join(T, 'watch', 'point');
      for (const r of ['2026100812', '2026100818', '2026100900']) { mkdirSync(join(W, r), { recursive: true }); writeFileSync(join(W, r, 'run.json'), JSON.stringify({ tiers: [{ id: 't2', files: [{ file: 'x' }] }, ...(r === '2026100900' ? [{ id: 't1', files: [{ file: 'y' }] }] : [])] })); }
      mkdirSync(join(W, 'field', 'v1'), { recursive: true });
      writeFileSync(join(W, 'field', 'v1', 'index.json'), JSON.stringify({ runsByTier: { t1: ['2026100900'], t2: ['2026100812'] } }));
      const run = (tier, env = {}) => { try { return { code: 0, out: node('scripts/point/field-watch.mjs', [`--point=${W}`, `--tier=${tier}`], env) }; } catch (e) { return { code: e.status, out: String(e.stdout ?? '') }; } };
      const w2 = run('t2'), w1 = run('t1'), w0 = run('t2', { POINT_FIELDS: '0' });
      writeFileSync(join(W, 'field', 'v1', 'index.json'), JSON.stringify({ runsByTier: { t1: ['2026100900'], t2: ['2026100818'] } }));
      const w2b = run('t2');
      add('B18 field-watch.mjs auf der Ablage: t2 zwei Läufe ohne Feld ⇒ Exit 1 mit ::error-Annotation; t1 aktuell ⇒ Exit 0; POINT_FIELDS=0 ⇒ still; ein Lauf ohne Feld ⇒ Exit 0',
        w2.code === 1 && /::error title=Kartenfeld t2 veraltet/.test(w2.out) && w1.code === 0 && w0.code === 0 && /absichtlich aus/.test(w0.out) && w2b.code === 0,
        `t2 ${w2.code}, t1 ${w1.code}, aus ${w0.code}, nach Nachbau ${w2b.code}`);
    }
  } catch (e) {
    add('B lief durch', false, String(e.stderr ?? e.stack ?? e.message).split('\n').slice(0, 4).join(' | '));
  } finally {
    rmSync(T, { recursive: true, force: true });
  }
}

// ─── C Live ───────────────────────────────────────────────────────────────────────────────────
if (args.live) {
  console.log('\n== C Live (Daten-Repo nach Jans Push) ==');
  const api = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'buscosun-verify-np0' } }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r; };
  const head = (await (await api('https://api.github.com/repos/jppetry/buscosun-data/commits/main')).json()).sha;
  const raw = (p) => `https://raw.githubusercontent.com/jppetry/buscosun-data/${head}/${p}`;
  let idx = null;
  try { idx = parseFieldIndex(await (await api(raw(FIELD_INDEX_PATH))).json()); } catch (e) { add('C1 Feld-Index lesbar', false, e.message); }
  // V-RC-2: derselbe Wächter wie im Punkt-Job, gegen den Cube-Index des Daten-Repos.
  try {
    const pidx = await (await api(raw(POINT_INDEX_PATH))).json();
    const cubeRunsByTier = {};
    for (const r of pidx.runs ?? []) for (const t of r.tiers ?? []) (cubeRunsByTier[t] ??= []).push(r.run);
    const st = fieldStaleness(cubeRunsByTier, idx?.runsByTier ?? {});
    add('C0 Wächter (V-RC-2): keine Stufe mit mehr als einem Cube-Lauf hintereinander ohne Feld', st.every((r) => !r.stale),
      st.map((r) => `${r.tier} Cube ${r.latestCube ?? '–'} / Feld ${r.lastField ?? 'keins'} (${r.missed} ohne)${r.stale ? ' ⚠' : ''}`).join(' · '));
  } catch (e) { add('C0 Wächter lesbar', false, e.message); }
  if (idx) {
    add('C1 Feld-Index besteht den Prüfer', true, Object.entries(idx.latestByTier).map(([t, e]) => `${t} ${e.run} (${(e.durationMs / 1000).toFixed(0)} s)`).join(', '));
    for (const t of TIERS) {
      const e = idx.latestByTier[t.id];
      if (!e) { add(`C ${t.id}: Feld vorhanden`, false, 'kein Eintrag'); continue; }
      const dir = fieldRunDir(e.run, t.id);
      const m = parseFieldManifest(await (await api(raw(`${dir}/field.json`))).json());
      const lead = m?.leads.find((l) => l.precip);
      const png = lead ? decodePng(Buffer.from(await (await api(raw(`${dir}/${lead.precip}`))).arrayBuffer())) : null;
      const rgba = png ? toRgba(png) : null;
      let n = 0, sum = 0;
      if (rgba) for (let i = 0; i < rgba.length; i += 4) { const v = decodePrecipPixel(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]); if (v) { n++; sum += v.chance; } }
      add(`C ${t.id} ${e.run}: Manifest besteht den Prüfer, PNG ${t.nx}×${t.ny}, Chance dekodierbar, Etikett „Modell · Cube"`,
        !!m && !!png && png.width === t.nx && png.height === t.ny && n > 0 && m.label === 'Modell · Cube',
        m ? `${n} Zellen, mittlere Chance ${(sum / Math.max(1, n)).toFixed(3)}, ${m.stats.errors} Fehler, ${(m.timing.ms / 1000).toFixed(0)} s mit ${m.timing.workers} Workern` : 'Manifest abgelehnt');
    }
  }
}

console.log(`\nverify:np0-fields — ${pass} passed, ${fail} failed${skip ? `, ${skip} übersprungen (⊘)` : ''}`);
process.exit(fail ? 1 : 0);
