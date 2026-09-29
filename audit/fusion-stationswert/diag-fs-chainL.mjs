/**
 * diag-fs-chainL.mjs — phase FS, finding V-FS-2: why is the chain WITHOUT an own station worse than the learned stage alone?
 * One slot, N points, the chain at the point with no station member, in variants:
 *   A  no measurement, no nowcast            (learned member + climatological step only)
 *   B  measurement of the neighbour B        (mode L of the card)
 *   C  like A without the uncertainty branch is not an option of the engine — left out
 * Per lead bin: MAE of the member value that enters the engine (`samples[cube].temperature`), of rawMu, of the fused mean, and of
 * fl-K (predict on the cube-hc step) — all against the truth of the point.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-stationswert/diag-fs-chainL.mjs [--slot=2026-09-22] [--points=60]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HINDCAST_ROOT, parseArgs } from '../../scripts/hindcast/lib/common.mjs';
import { readArchiveSlot, archiveSeries, archiveTruth, archiveObs, archiveNowcast, losoClimaProduct, inputFromArchive } from '../../scripts/fusionfit/lib/archiveAdapter.mjs';
import { haversineKm } from '../../scripts/fusionfit/lib/stackFit.mjs';
import { fuseCubePoint } from '../../src/pointForecast/cubeSource.ts';
import { ClimaField } from '../../src/ml/climaField.ts';
import { binIndex } from '../../src/point/fusionFit/strata.ts';

const H = 3_600_000;
const flags = parseArgs(process.argv.slice(2));
const ARCH = 'C:/dev/buscosun-archiv';
const day = typeof flags.slot === 'string' ? flags.slot : '2026-09-22';
const nPoints = Number(flags.points) || 60;
const T5 = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'fit', '2026-09-27-fx5e', 'fusion.hindcast.json'), 'utf8'));
const feat = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'features', 'points.v1.json'), 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('../../public/climaGrid.json', import.meta.url), 'utf8')));
const DACH = new Set(['DE', 'AT', 'CH', 'LI']);
const ids = Object.keys(feat.byPoint).filter((id) => DACH.has(feat.byPoint[id].country) && !feat.byPoint[id].flags.includes('noTerrain')).sort();
const countryOf = (id) => feat.byPoint[id]?.country ?? null;
const truth = new Map();
for (const d of readdirSync(ARCH).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) for (const f of readdirSync(join(ARCH, d)).filter((x) => /^\d{4}\.json\.gz$/.test(x))) {
  if (d < day) continue;
  const s = readArchiveSlot(join(ARCH, d, f));
  for (const [id, rec] of archiveTruth(s, countryOf)) for (const r of rec.rows) if (r.t != null) truth.set(`${id}|${r.ms}`, r.t);
}
const slotFile = readdirSync(join(ARCH, day)).find((x) => /^\d{4}\.json\.gz$/.test(x));
const s = readArchiveSlot(join(ARCH, day, slotFile));
const slotAtMs = s.slotAtMs, floorMs = Math.floor(slotAtMs / H) * H;
const truthSlot = archiveTruth(s, countryOf);
const window = { fromMs: floorMs, toMs: floorMs + 336 * H, stepH: 1 };
const PRODUCT = { hourly: false, tail: false, learned: true, learnedSpeed: true, learnedPrecip: true };
const VARIANTS = {
  'A ohne Messung': (b) => ({ ...b, obs: null }),
  'B Messung des Nachbarn': (b) => b,
};
const OPTS = { 'Kette': PRODUCT, 'Kette anchor:false': { ...PRODUCT, anchor: false }, 'Kette uncertainty:false': { ...PRODUCT, uncertainty: false } };
const acc = new Map();
const add = (k, bin, e) => { const key = `${k}|${bin}`; let a = acc.get(key); if (!a) { a = [0, 0, 0]; acc.set(key, a); } a[0] += Math.abs(e); a[1] += e; a[2] += 1; };
const step = Math.max(1, Math.floor(ids.length / nPoints));
let used = 0;
const sample = [];
for (let i = 0; i < ids.length; i += step) {
  const id = ids[i], row = feat.byPoint[id];
  const cube = {};
  for (const t of ['t1', 't2', 't3']) { const ser = archiveSeries(s, t, id); if (ser) cube[t] = ser; }
  if (!Object.keys(cube).length) continue;
  const nb = ids.filter((b) => b !== id).map((b) => ({ id: b, km: haversineKm(row.lat, row.lon, feat.byPoint[b].lat, feat.byPoint[b].lon) })).sort((x, y) => x.km - y.km)[0];
  const obsB = (archiveObs(s, truthSlot.get(nb.id), feat.byPoint[nb.id]) ?? []).map((o) => ({ ...o, distanceM: nb.km * 1000 }));
  const nc = archiveNowcast(s, id);
  const base = { cube, station: null, stationReason: 'diag: ohne Station', nowcast: nc.nowcast, covering: nc.covering, obs: obsB, clima, nowMs: slotAtMs, window, learned: T5, learnedClima: losoClimaProduct(T5, row) };
  used += 1;
  for (const [vn, vf] of Object.entries(VARIANTS)) for (const [on, opts] of Object.entries(OPTS)) {
    let res; try { res = fuseCubePoint(inputFromArchive(s, row, vf(base)), opts); } catch (e) { console.log(`Fehler ${id} ${vn} ${on}: ${e?.message}`); continue; }
    for (const st of res.steps) {
      if (st.interpolated) continue;
      const lead = Math.round((st.validAtMs - floorMs) / H);
      if (lead < 1) continue;
      const y = truth.get(`${id}|${st.validAtMs}`);
      if (y == null) continue;
      const bin = binIndex(lead);
      const m = st.samples?.find((x) => String(x.source).startsWith('cube-'));
      const f = st.fused?.temperature;
      if (m?.temperature != null) {
        // the value the engine reads: lapse-corrected from the member's reference height to the point
        const read = m.sourceElevation == null ? m.temperature : m.temperature + (m.sourceElevation - row.elevM) * 0.0065;
        add(`${vn} · ${on} · Member wie gespeichert`, bin, m.temperature - y);
        add(`${vn} · ${on} · Member wie der Motor ihn liest (Lapse von sourceElevation)`, bin, read - y);
        if (vn.startsWith('A') && on === 'Kette' && sample.length < 12 && lead === 30) sample.push({ id, elevM: row.elevM, sourceElevation: m.sourceElevation, hModEff: m.hModEff ?? null, member: m.temperature, read, rawMu: f?.rawMu, mu: f?.dist?.mu, y, dh: st.vertical?.dhM ?? null });
      }
      if (f) { add(`${vn} · ${on} · rawMu`, bin, f.rawMu - y); add(`${vn} · ${on} · fusioniert`, bin, f.dist.mu - y); }
    }
  }
}
const BIN = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const keys = [...new Set([...acc.keys()].map((k) => k.split('|')[0]))];
const md = [`# diag-fs-chainL — Slot ${s.slotAt}, ${used} Punkte, Kette ohne Station (T, MAE / Bias in K)`, '', `| Variante | ${BIN.slice(0, 5).join(' | ')} |`, `|---|${BIN.slice(0, 5).map(() => '---').join('|')}|`];
for (const k of keys) md.push(`| ${k} | ${[0, 1, 2, 3, 4].map((b) => { const a = acc.get(`${k}|${b}`); return a ? `${(a[0] / a[2]).toFixed(3)} / ${(a[1] / a[2]).toFixed(2)} (n ${a[2]})` : '—'; }).join(' | ')} |`);
md.push('', '## Beispielzeilen (Variante A, Vorlauf 30 h)', '', '| Punkt | h_true | sourceElevation | hModEff | Member | gelesen | rawMu | μ | Wahrheit | dhM |', '|---|---|---|---|---|---|---|---|---|---|');
for (const x of sample) md.push(`| ${x.id} | ${x.elevM} | ${x.sourceElevation} | ${x.hModEff} | ${x.member?.toFixed(2)} | ${x.read?.toFixed(2)} | ${x.rawMu?.toFixed(2)} | ${x.mu?.toFixed(2)} | ${x.y} | ${x.dh} |`);
writeFileSync(new URL('./diag-fs-chainL.md', import.meta.url), md.join('\n'));
console.log(md.join('\n'));
