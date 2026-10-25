#!/usr/bin/env node
/**
 * V-AW-66 / E-AW-42 — how sharp are the radar nowcast levels of the hazard product? Reads the archived hazard slots
 * (`buscosun-archiv` `road/v1/<day>/hz/<stamp>.json.gz`, V-AW-64) and compares, for `gischt` and `aqua`, the level
 * forecast for hour +1 of slot S (evidence `p`, built on the RV nowcast) with the level MEASURED at hour 0 of the slot
 * one hour later (S + 4 slots, evidence `d`: radar analysis or film). An entry absent from the archive had no level
 * (hzArchiveDoc keeps entries with a level ≥ 1 only), so "absent" counts as level 0 — unless the later slot itself is
 * missing (then the pair is `unknown`).
 *
 *   node scripts/road/hz-nowcast-score.mjs --archive=<buscosun-archiv>/road/v1 [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
 *
 * Prints per hazard and forecast level: pairs, hit (measured ≥ forecast), weaker (0 < measured < forecast),
 * none (measured 0 — the "28 % without rain on the level" of Gate E, §19.12), unknown. Pure core `scoreNowcast`
 * (verify:road-archive A22) so the verdict is a computation, not an impression. The decision stays E-AW-42 (Jan):
 * frame maximum (today) or the mirror's hour mean (`ROAD_HZ_RADAR=mean`, road-hazards.mjs).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { ROAD_SLOT_MS, roadStamp, roadStampToMs } from '../../src/road/roadContract.ts';

export const SCORED_HAZARDS = Object.freeze(['gischt', 'aqua']);
const H = 3_600_000;

/** Level of hour `i` of hazard `hid` in an archived entry (null = unknown, 0 = no level or no entry). */
function levelAt(doc, segId, hid, i) {
  const e = doc?.seg?.[segId];
  if (!e) return 0;
  const lv = e.lv?.[hid];
  if (!lv) return 0;
  return lv[i] ?? null;
}

/**
 * `docs`: { stamp → archived hazard document }. Returns { byHazard: { gischt: { byLevel: { 1: {pairs, hit, weaker, none, unknown}, 2: …, 3: … } }, aqua: … }, slots, pairs }.
 */
export function scoreNowcast(docs) {
  const out = { slots: Object.keys(docs).length, pairs: 0, byHazard: {} };
  for (const hid of SCORED_HAZARDS) out.byHazard[hid] = { byLevel: { 1: row(), 2: row(), 3: row() } };
  for (const [stamp, doc] of Object.entries(docs)) {
    const later = docs[roadStamp(roadStampToMs(stamp) + H)] ?? null;
    for (const [segId, e] of Object.entries(doc.seg ?? {})) {
      for (const hid of SCORED_HAZARDS) {
        const fc = e.lv?.[hid]?.[1];
        if (!fc || e.ev?.[hid]?.[1] !== 'p') continue;
        const r = out.byHazard[hid].byLevel[fc];
        r.pairs++; out.pairs++;
        if (!later) { r.unknown++; continue; }
        const m = levelAt(later, segId, hid, 0);
        if (m === null) r.unknown++;
        else if (m >= fc) r.hit++;
        else if (m > 0) r.weaker++;
        else r.none++;
      }
    }
  }
  return out;
}
const row = () => ({ pairs: 0, hit: 0, weaker: 0, none: 0, unknown: 0 });

/** All archived hazard slots of `archiveDir` between the days (inclusive): { stamp → document }. */
export function readArchivedHz(archiveDir, from = '0000-00-00', to = '9999-99-99') {
  const docs = {};
  if (!existsSync(archiveDir)) return docs;
  for (const day of readdirSync(archiveDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= to).sort()) {
    const dir = join(archiveDir, day, 'hz');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => /^\d{10}\.json\.gz$/.test(x)).sort()) {
      try { docs[f.slice(0, 10)] = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString('utf8')); } catch { /* unreadable slot: left out, counted below */ }
    }
  }
  return docs;
}

export function formatScore(s) {
  const lines = [`${s.slots} Slots, ${s.pairs} Paare (Prognose +1 h gegen Messung eine Stunde später, Slotabstand ${(H / ROAD_SLOT_MS)} Slots)`];
  for (const hid of SCORED_HAZARDS) {
    for (const lv of [1, 2, 3]) {
      const r = s.byHazard[hid].byLevel[lv];
      if (!r.pairs) continue;
      const pct = (n) => `${Math.round((n / r.pairs) * 100)} %`;
      lines.push(`${hid} Stufe ${lv}: ${r.pairs} Paare — erreicht ${r.hit} (${pct(r.hit)}), schwächer ${r.weaker} (${pct(r.weaker)}), ohne ${r.none} (${pct(r.none)}), unbekannt ${r.unknown}`);
    }
  }
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const archiveDir = arg('archive');
  if (!archiveDir) { console.error('usage: hz-nowcast-score.mjs --archive=<archive road/v1 dir> [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]'); process.exit(2); }
  const docs = readArchivedHz(archiveDir, arg('from'), arg('to'));
  const s = scoreNowcast(docs);
  console.log(formatScore(s));
  console.log(JSON.stringify(s));
}
