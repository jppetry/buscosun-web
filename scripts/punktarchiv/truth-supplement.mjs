#!/usr/bin/env node
/**
 * truth-supplement.mjs — fetch the SMN truth a slot SHOULD have held and write it as a truth supplement next to the slots
 * (`<day>/truth-smn.json.gz`, kind `punktarchiv/truth-supplement`, `scripts/punktarchiv/lib/punktarchiv.mjs`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/truth-supplement.mjs \
 *        --slot=2026-10-04/0001.json.gz --root=C:/dev/buscosun-archiv [--dry]
 *
 * Why (04.10.2026): the 23:10 cron of 03.10. started at 00:01 UTC; SMN's day file (`_t_now.csv`) had rolled to 04.10. ⇒ 97 of
 * 102 CH/LI points of slot 2026-10-04/0001 hold only 04.10. 00:00. The year file (`_t_recent.csv`) holds the previous day from
 * ≈ 12 UTC on. The record is built exactly as the collector builds it (`tenMinHourStamps` / `tenMinColumns` / `encodeSeries`
 * over the slot's own truth window), from the year file's end (Range) + the day file (the day file wins on a shared stamp).
 *
 * Checks (written into the supplement; nothing is written unless all gates hold):
 *   G1 control: the SMN records of the slot BEFORE, rebuilt from today's files, equal the archived cells (proves: same build,
 *      the year file carries what the day file carried) — 0 differing cells
 *   G2 against the slot itself: cells the slot holds are equal, a Sentinel may become a value; differing cells (a source revision
 *      after slot time) ≤ 2 % — the slot value stays (readers add supplements fill-only)
 *   G3 negative control: a changed value is caught by the comparison
 *   G4 plausibility: td ≤ t + 0,15 K, rh in 0…100 %
 *   G5 independent: at the points with POI AND SMN (same station, other channel) |mean ΔT| ≤ 0,3 K
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { encodeSeries, TRUTH_SCALES, SENTINEL, ARCHIVE_SCHEMA, TRUTH_SUPPLEMENT_KIND, writeTruthSupplement } from './lib/punktarchiv.mjs';
import { SMN_NOW_URL, SMN_RECENT_URL, SMN_RECENT_TAIL_BYTES_PER_DAY, parseSmn10min, joinCsvRangeTail, mergeSmn10min, tenMinColumns, tenMinHourStamps } from './lib/truth.mjs';

const H = 3_600_000, DAY = 24 * H;
const PRODUCER = 'buscosun-web/scripts/punktarchiv/truth-supplement.mjs';
const iso = (ms) => `${new Date(ms).toISOString().slice(0, 16)}Z`;
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const readSlot = (abs) => JSON.parse(gunzipSync(readFileSync(abs)).toString('utf8'));

async function fetchText(url, range = null, timeoutMs = 60_000) {
  for (let attempt = 1; ; attempt++) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, range ? { signal: ac.signal, headers: { Range: range } } : { signal: ac.signal });
      if (r.status === 404) return { text: null, lastModified: null };
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return { text: await r.text(), lastModified: r.headers.get('last-modified') };
    } catch (e) { if (attempt >= 4) throw e; await new Promise((res) => setTimeout(res, 1500 * attempt)); } finally { clearTimeout(t); }
  }
}

/** The SMN record of a window, as `collect.mjs` builds it. */
export function smnRecord(series, fromMs, toMs) {
  const obsAtMs = tenMinHourStamps(series, fromMs, toMs);
  const cols = tenMinColumns(series, obsAtMs);
  const rec = { obsAtMs, count: obsAtMs.length };
  for (const k of Object.keys(TRUTH_SCALES)) if (cols[k] !== undefined) rec[k] = encodeSeries(cols[k], TRUTH_SCALES[k]);
  return rec;
}

/** Cell comparison archived → rebuilt (stamps of the archived record; Sentinel → value counted apart). */
export function compareRecords(arch, neu) {
  const out = { stamps: 0, cells: 0, equal: 0, sentinelToValue: 0, differing: [] };
  const idx = new Map(neu.obsAtMs.map((ms, j) => [ms, j]));
  arch.obsAtMs.forEach((ms, j) => {
    const n = idx.get(ms);
    if (n == null) { out.differing.push({ ms: iso(ms), col: '*', arch: 'stamp', neu: null }); return; }
    out.stamps += 1;
    for (const k of Object.keys(TRUTH_SCALES)) {
      if (!(k in arch)) continue;
      out.cells += 1;
      const a = arch[k][j], b = neu[k]?.[n] ?? SENTINEL;
      if (a === b) out.equal += 1; else if (a === SENTINEL) out.sentinelToValue += 1; else out.differing.push({ ms: iso(ms), col: k, arch: a, neu: b });
    }
  });
  return out;
}

function parseArgs(argv) {
  const f = {};
  for (const a of argv) { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); if (m) f[m[1]] = m[2] ?? true; }
  return f;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const root = flags.root ?? process.env.POINTARCHIVE_OUT;
  if (!root || typeof flags.slot !== 'string') throw new Error('--slot=<day>/<HHMM>.json.gz und --root=<Archiv> sind Pflicht');
  const slotAbs = join(root, flags.slot);
  const slotBytes = readFileSync(slotAbs);
  const S = JSON.parse(gunzipSync(slotBytes).toString('utf8'));
  const W = S.truth.window;
  // the control slot: the latest slot whose truth window ends before this one starts
  const slotFiles = readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().flatMap((d) => readdirSync(join(root, d)).filter((f) => /^\d{4}\.json\.gz$/.test(f)).map((f) => `${d}/${f}`));
  const prevRel = slotFiles.filter((r) => r < flags.slot).pop() ?? null;
  const P = prevRel ? readSlot(join(root, prevRel)) : null;
  const earliestMs = Math.min(W.fromMs, P ? P.truth.window.fromMs : W.fromMs);
  const tailBytes = (Math.ceil((Date.now() - earliestMs) / DAY) + 2) * SMN_RECENT_TAIL_BYTES_PER_DAY;

  const pts = S.points.filter((p) => p.truth?.smn);
  const series = new Map(), lastModified = new Set();
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < pts.length) {
      const abbr = pts[i++].truth.smn;
      const head = await fetchText(SMN_RECENT_URL(abbr), 'bytes=0-4095');
      const tail = head.text ? await fetchText(SMN_RECENT_URL(abbr), `bytes=-${tailBytes}`) : { text: null };
      const now = await fetchText(SMN_NOW_URL(abbr));
      if (tail.lastModified) lastModified.add(tail.lastModified);
      const recent = head.text && tail.text ? parseSmn10min(joinCsvRangeTail(head.text, tail.text)) : null;
      series.set(abbr, mergeSmn10min(recent, now.text ? parseSmn10min(now.text) : null));
    }
  }));

  const byPoint = {}, counts = [];
  const g1 = { stamps: 0, cells: 0, equal: 0, sentinelToValue: 0, differing: [] }, g2 = { stamps: 0, cells: 0, equal: 0, sentinelToValue: 0, differing: [] };
  const fold = (acc, r, id) => { for (const k of ['stamps', 'cells', 'equal', 'sentinelToValue']) acc[k] += r[k]; for (const d of r.differing) acc.differing.push({ id, ...d }); };
  for (const p of pts) {
    const s = series.get(p.truth.smn);
    if (!s) continue;
    const rec = smnRecord(s, W.fromMs, W.toMs);
    byPoint[p.id] = { smn: rec };
    counts.push(rec.count);
    if (S.truth.byPoint[p.id]?.smn) fold(g2, compareRecords(S.truth.byPoint[p.id].smn, rec), p.id);
    const old = P?.truth.byPoint[p.id]?.smn;
    if (old) fold(g1, compareRecords(old, smnRecord(s, P.truth.window.fromMs, P.truth.window.toMs)), p.id);
  }
  // G3: negative control on the first point
  const p0 = pts.find((p) => byPoint[p.id] && S.truth.byPoint[p.id]?.smn?.count);
  const neg = structuredClone(byPoint[p0.id].smn); const jLast = neg.obsAtMs.indexOf(S.truth.byPoint[p0.id].smn.obsAtMs.at(-1)); neg.t[jLast] += 1;
  const g3 = compareRecords(S.truth.byPoint[p0.id].smn, neg).differing.length >= 1;
  // G4 plausibility
  const dq = (q, k) => (q === SENTINEL ? null : q * TRUTH_SCALES[k].scale);
  const g4 = { tdAboveT: 0, rhOut: 0, range: {} };
  for (const { smn: r } of Object.values(byPoint)) for (let j = 0; j < r.count; j++) {
    const t = dq(r.t[j], 't'), td = dq(r.td[j], 'td'), rh = dq(r.rh[j], 'rh');
    if (t != null && td != null && td > t + 0.15) g4.tdAboveT += 1;
    if (rh != null && (rh < 0 || rh > 100.05)) g4.rhOut += 1;
    for (const k of ['t', 'td', 'ff', 'fxh', 'rr1h', 'ps']) { const v = dq(r[k][j], k); if (v == null) continue; const g = (g4.range[k] ??= [Infinity, -Infinity]); g[0] = Math.min(g[0], +v.toFixed(2)); g[1] = Math.max(g[1], +v.toFixed(2)); }
  }
  // G5 independent: POI at the same station
  const g5 = {};
  for (const p of pts.filter((q) => S.truth.byPoint[q.id]?.poi && byPoint[q.id])) {
    const po = S.truth.byPoint[p.id].poi, sm = byPoint[p.id].smn, idx = new Map(sm.obsAtMs.map((ms, j) => [ms, j]));
    const d = [];
    po.obsAtMs.forEach((ms, j) => { const n = idx.get(ms); const a = dq(po.t[j], 't'), b = n == null ? null : dq(sm.t[n], 't'); if (a != null && b != null) d.push(b - a); });
    g5[`${p.id}:${p.truth.smn}`] = d.length ? { n: d.length, meanK: +(d.reduce((x, y) => x + y, 0) / d.length).toFixed(2), maxAbsK: +Math.max(...d.map(Math.abs)).toFixed(2) } : null;
  }
  counts.sort((a, b) => a - b);
  const gates = {
    G1: g1.cells > 0 && g1.differing.length === 0,
    G2: g2.differing.length <= 0.02 * g2.cells,
    G3: g3,
    G4: g4.tdAboveT === 0 && g4.rhOut === 0,
    G5: Object.values(g5).filter(Boolean).every((x) => Math.abs(x.meanK) <= 0.3),
  };
  const checks = {
    gates,
    G1_control: { slot: prevRel, ...g1, differing: g1.differing.slice(0, 50), differingN: g1.differing.length },
    G2_vsSlot: { ...g2, differing: g2.differing, differingN: g2.differing.length },
    G4_plausibility: g4,
    G5_poiVsSmn: g5,
    hoursPerPoint: { points: counts.length, min: counts[0], median: counts[counts.length >> 1], max: counts.at(-1) },
  };
  console.log(JSON.stringify({ ...checks, G2_vsSlot: { ...checks.G2_vsSlot, differing: g2.differing.slice(0, 10) } }, null, 1));
  if (!Object.values(gates).every(Boolean)) { console.error(`[supplement] Gate rot: ${Object.entries(gates).filter(([, v]) => !v).map(([k]) => k).join(', ')} — nichts geschrieben`); process.exit(1); }

  let codeHash = 'unknown';
  try { const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); codeHash = execSync('git status --porcelain', { encoding: 'utf8' }).trim() ? `${sha}-dirty` : sha; } catch { /* outside git */ }
  const supp = {
    schema: ARCHIVE_SCHEMA,
    kind: TRUTH_SUPPLEMENT_KIND,
    day: new Date(W.fromMs).toISOString().slice(0, 10),
    network: 'smn',
    createdAt: new Date().toISOString(),
    codeHash,
    producer: PRODUCER,
    supplements: { file: flags.slot, sha256: sha256(slotBytes), slotAt: S.slotAt },
    sentinel: SENTINEL,
    scales: { truth: TRUTH_SCALES },
    truth: {
      window: { fromMs: W.fromMs, toMs: W.toMs, note: 'Das Wahrheitsfenster des ergänzten Slots, unverändert.' },
      byPoint,
      caveats: [
        'Wahrheits-Nachtrag, KEIN Slot: keine Vorhersage, keine Slotzeit. Er trägt die SMN-Messungen, die der ergänzte Slot zur Slotzeit nicht mehr bekam (Tagesdatei bereits auf den neuen UTC-Tag gerollt).',
        'Aufbau wie im Sammler (tenMinHourStamps/tenMinColumns/encodeSeries über das Slot-Fenster), Spalten wie dort (rr1 = 10-min × 6, rr1h Stundensumme, fxh Stundenmaximum); Quelle Ende von _t_recent.csv (Range) + _t_now.csv, die Tagesdatei gewinnt auf gemeinsamen Stempeln.',
        'Die Leser fügen den Nachtrag NUR AUFFÜLLEND hinzu: ein Wert, den der Slot trägt, bleibt; abweichende Werte (spätere Revision bei MeteoSchweiz) stehen in checks.G2_vsSlot.differing.',
      ],
    },
    sources: { now: SMN_NOW_URL('<abbr>'), recent: SMN_RECENT_URL('<abbr>'), recentRangeBytes: tailBytes, recentLastModified: [...lastModified].sort(), fetchedAt: new Date().toISOString() },
    checks,
  };
  if (flags.dry) { console.log(`[supplement] --dry: würde ${supp.day}/truth-smn.json.gz schreiben (${Object.keys(byPoint).length} Punkte)`); return; }
  if (!existsSync(root)) throw new Error(`${root} fehlt`);
  const res = writeTruthSupplement(root, supp);
  console.log(`[supplement] ${res.written ? 'geschrieben' : 'unverändert (idempotent)'}: ${join(root, res.file)} · ${res.bytes} B · sha256 ${res.sha.slice(0, 12)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
