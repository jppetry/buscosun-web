// Phase RG — writes the verifier fixture `scripts/lib/fixtures/radar-threshold-cases.json`: real station rows (DWD CDC
// 10-min, indicator stations) joined with the real native/RADOLAN radar values at the pixel under the station for the two
// analyses of each interval — a deterministic subset (every 7th case of the W1 selection + every 7th of the hold-out),
// plus the numbers score.mjs produced for the FULL sample, so the verifier can reproduce the rule on the subset and check
// the stored full-sample threshold. Usage: … fixture-export.mjs [--extract=<dir>] [--out=<json>]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const EX = opt.extract ?? 'C:/dev/buscosun-radar-truth/extract';
const CDC = ['C:/dev/buscosun-radar-truth/cdc-trimmed', 'C:/dev/buscosun-radar-truth/cdc-now/2026-10-10/txt'];
const OUT = opt.out ?? 'scripts/lib/fixtures/radar-threshold-cases.json';
const st = JSON.parse(readFileSync(join(EX, 'stations.json'), 'utf8')).stations;
const V = JSON.parse(readFileSync(join(EX, 'values.json'), 'utf8'));
const f32 = (s) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const slots = V.slots.map((s) => ({ ms: s.ms, nat: f32(s.nat), rad: f32(s.rad) })).sort((a, b) => a.ms - b.ms);
const slotByMs = new Map(slots.map((s, i) => [s.ms, i]));
const idIndex = new Map(st.map((s, i) => [s.id, i]));
const parseMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10), +d.slice(10, 12));
const rows = [];
for (const dir of CDC) for (const f of readdirSync(dir)) {
  if (!/\.txt$/.test(f)) continue;
  for (const line of readFileSync(join(dir, f), 'latin1').split(/\r?\n/)) {
    const c = line.split(';'); if (c.length < 6 || c[0].trim() === 'STATIONS_ID') continue;
    const id = +c[0], ms = parseMs(c[1].trim()), rws = +c[4], ind = +c[5], dau = +c[3], qn = +c[2];
    if (rws === -999 || ind === -999) continue;
    const si = idIndex.get(id); if (si == null || !st[si].covered) continue;
    const a = slotByMs.get(ms - 300_000), b = slotByMs.get(ms); if (a == null || b == null) continue;
    const A = slots[a], B = slots[b]; if (Number.isNaN(A.nat[si]) || Number.isNaN(B.nat[si])) continue;
    rows.push({ id, stamp: c[1].trim(), qn, dau, rws, ind, natA: +A.nat[si].toFixed(3), natB: +B.nat[si].toFixed(3), radA: +A.rad[si].toFixed(3), radB: +B.rad[si].toFixed(3), siteKm: +st[si].siteKm.toFixed(1) });
  }
}
rows.sort((x, y) => x.id - y.id || x.stamp.localeCompare(y.stamp));
const sub = rows.filter((_, i) => i % 40 === 0);
const score = JSON.parse(readFileSync('audit/radar-regenschwelle/ergebnis/score.json', 'utf8'));
const at = (c, s) => { const r = c.rows.find((q) => q.s === s); return { prec: +r.prec.toFixed(4), precLo: +r.precLo.toFixed(4), pod: +r.pod.toFixed(4) }; };
const fixture = {
  kind: 'radar-threshold-cases', builtAt: new Date().toISOString(), audit: 'audit/radar-regenschwelle.md',
  source: 'DWD CDC 10-min precipitation (now/recent, 08.–10.10.2026) × DWD RV analyses (lead 0, HDF5) at the pixel under the station; indicator stations only',
  columns: 'id, stamp (UTC end of the 10-min interval), qn, dau (RWS_DAU_10 min), rws (RWS_10 mm), ind (RWS_IND_10), natA/natB (native mm/h of the analyses t−5/t), radA/radB (same in RADOLAN units), siteKm (nearest DWD radar)',
  subset: 'every 40th of all W1 cases (selection and hold-out), sorted by station and stamp', rows: sub.length, allRows: rows.length,
  full: { window: score.window, cases: score.primary.n, stations: score.stationsInd, frozen: score.frozen.split('\n')[0], thresholds: score.thresholds, echo: at(score.primary, 'echo'), s006: at(score.primary, 0.06), s012: at(score.primary, 0.12), holdout006: at(score.holdoutW1, 0.06), w2ind006: at(score.w2ind, 0.06), w2indEcho: at(score.w2ind, 'echo') },
  cases: sub,
};
writeFileSync(OUT, JSON.stringify(fixture) + '\n');
console.log(`${OUT}: ${sub.length} of ${rows.length} rows, ${(readFileSync(OUT).length / 1024).toFixed(0)} KB`);
