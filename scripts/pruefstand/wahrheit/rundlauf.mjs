#!/usr/bin/env node
/**
 * rundlauf.mjs — round trip of the truth W1 against an INDEPENDENT copy of the same measurements: the hourly records
 * the archive collector fetched in real time (`truth.byPoint` of every slot; TAWES raw, SMN and DWD POI). Gate G-PS1.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/pruefstand/wahrheit/rundlauf.mjs [--json=<file>]
 *
 * Expected (D-PS-3): AT and CH agree at the stamp H except where the quality control of klima-v2 changed a value
 * (wind ≈ 2 %, single 0,1 mm of precipitation) and the Magnus dew point of AT; DE does NOT agree at H — the archive's
 * POI hour is the 10-min value of H − 10 min (E-PS-15), so the temperature differs by about 0,2 K on average. A DE
 * agreement near 100 % at H would mean W1 carries the wrong stamp.
 */
import { loadProtocol } from '../lib/protokoll.mjs';
import { openW1 } from '../lib/wahrheit.mjs';
import { archiveIssues } from '../lib/konserven.mjs';
import { features } from '../lib/replay.mjs';
import { H, parseArgs, writeJson } from '../lib/common.mjs';
import { readArchiveSlot, archiveTruth } from '../../fusionfit/lib/archiveAdapter.mjs';

const args = parseArgs();
const proto = loadProtocol(), w1 = openW1(proto), feat = features().byPoint;
const sIdx = new Map(proto.scored.map((s, i) => [s.id, i]));
const COLS = { t: [0, 't', 0.1], td: [1, 'td', 0.1], ws: [2, 'ff', 0.1], gust: [4, 'fxh', 0.1], rr: [5, 'rr', 0.1], clct: [6, 'n', 12.5] };
const st = {};
const seen = new Set();
for (const issue of archiveIssues()) {
  const slot = readArchiveSlot(issue.path);
  for (const [id, rec] of archiveTruth(slot, (x) => feat[x]?.country ?? null)) {
    const s = sIdx.get(id); if (s == null) continue;
    for (const row of rec.rows) {
      if (row.ms % H || seen.has(`${id}|${row.ms}`)) continue;   // the 23-UTC hour stands in two slots
      seen.add(`${id}|${row.ms}`);
      for (const [name, [vi, col, res]] of Object.entries(COLS)) {
        const a = row[col], b = w1.at(s, row.ms, vi);
        const k = `${rec.net}|${name}`, o = (st[k] ??= { n: 0, equal: 0, sumAbs: 0, max: 0, archiveOnly: 0, w1Only: 0, wetN: 0, wetEqual: 0 });
        if (a == null || !Number.isFinite(a)) { if (b === b) o.w1Only += 1; continue; }
        if (b !== b) { o.archiveOnly += 1; continue; }
        const d = Math.abs(a - b);
        o.n += 1; if (d < res / 2 + 1e-6) o.equal += 1; o.sumAbs += d; if (d > o.max) o.max = d;
        if (name === 'rr' && (a > 0 || b > 0)) { o.wetN += 1; if (d < res / 2 + 1e-6) o.wetEqual += 1; }
      }
    }
  }
}
const rows = Object.entries(st).sort().map(([k, o]) => ({ net: k.split('|')[0], var: k.split('|')[1], n: o.n, equalPct: o.n ? Math.round((1000 * o.equal) / o.n) / 10 : null, meanAbs: o.n ? Math.round((1000 * o.sumAbs) / o.n) / 1000 : null, max: Math.round(o.max * 100) / 100, archiveOnly: o.archiveOnly, w1Only: o.w1Only, ...(o.wetN ? { wetEqualPct: Math.round((1000 * o.wetEqual) / o.wetN) / 10 } : {}) }));
for (const x of rows) console.log(`${x.net.padEnd(6)} ${x.var.padEnd(5)} n ${String(x.n).padStart(6)}  gleich ${String(x.equalPct).padStart(5)} %  mittl. |Δ| ${String(x.meanAbs).padStart(6)}  max ${String(x.max).padStart(6)}  nur Archiv ${x.archiveOnly}  nur W1 ${x.w1Only}${x.wetEqualPct != null ? `  nass gleich ${x.wetEqualPct} %` : ''}`);
if (args.json) writeJson(String(args.json), { kind: 'pruefstand/w1-rundlauf', w1: w1.hash, rows });
