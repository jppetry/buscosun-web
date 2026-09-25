/**
 * truthJoin.mjs — the truth side of the case builder (phase FL, `audit/fusion-lernphase.md` §5.1/§5.3).
 *
 * Reads `truth\<day>.json.gz` of the hindcast (hourly, integer-coded with the file's own `scales.truth`, sentinel
 * −32768) and answers `at(pointId, validAtMs)` with the observation row of that hour: network (cdc | tawes | smn,
 * preferred in that order when a point carries more than one), the eight target quantities and the truth flags
 * (V-HC-15: AT td/p before 2026-06-19 are Magnus-derived / reduced — `derived` in the record).
 *
 * Precipitation: CDC `rr1` is the hourly sum (mm), TAWES/SMN `rr1h` is the six-fold 10-min sum (mm) — both are the
 * amount of the hour ending at the stamp, the same quantity as the cube's `precip` (mm/h over Δ = 1 h). `rr1` of
 * TAWES/SMN (a 10-min rate × 6) is NOT used. Dedupe key = (point, stamp): a day file carries each hour once.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { FL_NETWORKS, FL_TRUTH_FLAGS } from './casesio.mjs';

const SENT = -32768;
export const TRUTH_NETWORK_ORDER = Object.freeze(['cdc', 'tawes', 'smn']);

export function truthReader(root, { lruDays = 40 } = {}) {
  const days = new Map();   // day → { scales, byPoint: Map<pointId, { network, idx: Map<ms, i>, rec, flags }> } | null
  const stats = { files: 0, missingFiles: 0, hits: 0, misses: 0 };
  const load = (day) => {
    if (days.has(day)) { const v = days.get(day); days.delete(day); days.set(day, v); return v; }
    const p = join(root, 'truth', `${day}.json.gz`);
    let doc = null;
    if (existsSync(p)) { doc = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')); stats.files += 1; } else stats.missingFiles += 1;
    let entry = null;
    if (doc) {
      const byPoint = new Map();
      for (const [id, nets] of Object.entries(doc.byPoint ?? {})) {
        for (const net of TRUTH_NETWORK_ORDER) {
          const rec = nets?.[net];
          if (!rec?.obsAtMs?.length) continue;
          let flags = 0;
          if (rec.derived?.td) flags |= FL_TRUTH_FLAGS.tdDerived;
          if (rec.derived?.p) flags |= FL_TRUTH_FLAGS.pDerived;
          byPoint.set(id, { network: net, idx: new Map(rec.obsAtMs.map((ms, i) => [ms, i])), rec, flags });
          break;
        }
      }
      entry = { scales: doc.scales?.truth ?? {}, byPoint };
    }
    days.set(day, entry);
    while (days.size > lruDays) days.delete(days.keys().next().value);
    return entry;
  };
  const dec = (scales, rec, key, i) => {
    const arr = rec[key];
    if (!arr) return NaN;
    const q = arr[i];
    if (q == null || q === SENT) return NaN;
    const s = scales[key];
    return s ? q * s.scale + s.offset : q;
  };
  return {
    stats,
    /** @returns {{ network: number, networkId: string, flags: number, t, td, rh, ff, dd, fx, rr, n, p } | null} */
    at(pointId, validAtMs) {
      const day = new Date(validAtMs).toISOString().slice(0, 10);
      const e = load(day);
      const pt = e?.byPoint.get(pointId);
      const i = pt?.idx.get(validAtMs);
      if (pt == null || i == null) { stats.misses += 1; return null; }
      stats.hits += 1;
      const sc = e.scales, r = pt.rec;
      const rr = pt.network === 'cdc' ? dec(sc, r, 'rr1', i) : dec(sc, r, 'rr1h', i);
      return {
        network: FL_NETWORKS[pt.network], networkId: pt.network, flags: pt.flags,
        t: dec(sc, r, 't', i), td: dec(sc, r, 'td', i), rh: dec(sc, r, 'rh', i), ff: dec(sc, r, 'ff', i), dd: dec(sc, r, 'dd', i),
        fx: dec(sc, r, 'fxh', i), rr, n: pt.network === 'cdc' ? dec(sc, r, 'n', i) : NaN, p: dec(sc, r, 'p', i),
      };
    },
    /** For the leak negative control: the same row shifted by `shiftMs` (truth of another hour under this stamp). */
    atShifted(pointId, validAtMs, shiftMs) { return this.at(pointId, validAtMs + shiftMs); },
  };
}
