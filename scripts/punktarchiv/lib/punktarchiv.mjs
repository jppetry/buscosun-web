/**
 * punktarchiv.mjs — the form of one archive slot (schema 1), its integer coding, the
 * append-only merge and the as-of guard. ONE form for collector, verifier and later
 * scorer; nothing here touches the network.
 *
 * Why a slot file and not a per-point file: a slot is what the cron produces in one go
 * (one `point/index.json` commit, one live pass, one truth window); scoring later walks
 * slots forward in time. One gzip'd JSON per slot keeps the repo browsable and the
 * writes atomic (write temp, rename).
 *
 * Layout in `jppetry/buscosun-archiv`:
 *   <YYYY-MM-DD>/<HHMM>.json.gz        the slot (this schema)
 *   <YYYY-MM-DD>/index.json            the day's slot list with sizes and sha256
 *   index.json                          all days (first/last slot, counts)
 *
 * Integer coding: every numeric column is `Math.round((v − offset) / scale)` with the
 * scale/offset given ONCE in the header (`scales`), `SENTINEL` for missing. Cube planes
 * use the run manifest's scales (they are int16 in the container already, so the archive
 * loses nothing); live/truth columns use the fixed scales in `LIVE_SCALES` / `TRUTH_SCALES`.
 * `null` in the archive is always SENTINEL, never 0 — 0 would be a measured zero.
 */
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Schema-Historie — ein Sprung je Formänderung, damit ein Leser die Form am Kopf erkennt:
 *   1  PA1 (2026-09-14). PA2 (16.09.) kam additiv dazu — `points[].profile`, `points[].mosmix`,
 *      `truth.*.rr1h` — OHNE Sprung; das war ein Fehler (PA3, Befund des Experten 17.09.).
 *   2  PA3 (2026-09-17):
 *      · `cube[t].ageAtSlotH` (Alter des Quell-Laufs ZUR SLOTZEIT) statt des kopierten `ageH`, das im
 *        Producer „Publikationslauf − Quell-Lauf" heißt und mit einem Job je Stufe immer 0 ist; die
 *        Kopie heißt jetzt `publishLagH`. Dasselbe in `index.latestByTier[t]`; `index.stations` trägt
 *        `ageAtBuildH` (Producer) und `ageAtSlotH`.
 *      · `cube[t].sources[].stepsCoverage` statt `coverage` (es ist die ZEITACHSE, keine Fläche) mit
 *        `coverageNote`; `cube[t].quantiles.points` zählt, wie viele Punkte die Quantil-Ebenen tragen.
 *      · `cube[t].skipped` (übersprungene Quellen mit Grund, z. B. ICON-CH1-EPS bei STAC-500),
 *        `pending`/`declined` als Kennungslisten, `fusion.note`.
 *      · `nowcast.slots` je Quelle; `nowcast.byPoint[].bySource[s]` ist `null` nur noch ohne Slot,
 *        außerhalb des Rasters `{ stamp, frames: null, note }`; `validAtSuspect` einmal je Reihe
 *        (`{ frames, of, why }`) statt je Frame.
 *      · `plan` ab der nächsten vollen Stunde (Grenzen auf Modellstunden), Punkthöhe = `points[].elev`
 *        (Stationshöhe) statt DEM; `plan.station.candidate.dDemM` daneben; `stations.byPoint[].station.dElevM`
 *        gegen `elev`, `dDemM` gegen `demM`.
 *      · `truth.window` ab Stundenboden(slot − 24 h) (25 h, die 23-UTC-Stunde des Vortags fehlt nicht mehr);
 *        TAWES/SMN-Spalten aus den 10-min-Werten AM Stundenstempel (nicht mehr über die App-Leser);
 *        `fxh` (Stundenmaximum der Böe) in allen Netzen; `count` = Zahl der Stunden (`n` ist Bedeckung).
 *      · `live.axis` (Bedeutung von `t0Ms`/`tsMs`), `stats.warnings`, `pointsFrom.rules`.
 */
export const ARCHIVE_SCHEMA = 2;
/** Schemata, die `parseSlot` liest — ein Archiv trägt alle Fassungen nebeneinander. */
export const ARCHIVE_SCHEMAS_READABLE = Object.freeze([1, 2]);
export const SENTINEL = -32768;
export const SLOT_KIND = 'punktarchiv/slot';

/** Fixed scales for the live path and the truth (units as in `PointForecastHour` / POI). */
export const LIVE_SCALES = Object.freeze({
  temperature: { scale: 0.01, offset: 0, unit: 'degC' },
  apparentTemperature: { scale: 0.01, offset: 0, unit: 'degC' },
  dewPoint: { scale: 0.01, offset: 0, unit: 'degC' },
  windSpeed: { scale: 0.01, offset: 0, unit: 'm/s' },
  windDirection: { scale: 1, offset: 0, unit: 'deg' },
  gustSpeed: { scale: 0.01, offset: 0, unit: 'm/s' },
  relativeHumidity: { scale: 0.1, offset: 0, unit: 'pct' },
  snowLineM: { scale: 1, offset: 0, unit: 'm' },
  cloudCoverTotal: { scale: 0.1, offset: 0, unit: 'pct' },
  cloudCoverLow: { scale: 0.1, offset: 0, unit: 'pct' },
  cloudCoverMid: { scale: 0.1, offset: 0, unit: 'pct' },
  cloudCoverHigh: { scale: 0.1, offset: 0, unit: 'pct' },
  precipitation: { scale: 0.01, offset: 0, unit: 'mm/h' },
  uvIndex: { scale: 0.1, offset: 0, unit: '—' },
  confidence: { scale: 0.001, offset: 0, unit: '—' },
  sigma: { scale: 0.01, offset: 0, unit: 'unit of the variable' },
});
export const TRUTH_SCALES = Object.freeze({
  t: { scale: 0.01, offset: 0, unit: 'degC' },
  td: { scale: 0.01, offset: 0, unit: 'degC' },
  rh: { scale: 0.1, offset: 0, unit: 'pct' },
  ff: { scale: 0.01, offset: 0, unit: 'm/s' },
  dd: { scale: 1, offset: 0, unit: 'deg' },
  fx: { scale: 0.01, offset: 0, unit: 'm/s' },
  // PA3: hour maximum of the gust — POI's fx IS that (maximum_wind_speed_last_hour); for
  // TAWES/SMN the max of the six 10-min peaks stamped h−50…h (fx there = the 10-min peak at h).
  fxh: { scale: 0.01, offset: 0, unit: 'm/s' },
  rr1: { scale: 0.01, offset: 0, unit: 'mm' },
  // PA2: hour sum from six 10-min values (TAWES/SMN only; POI's rr1 already is the hour sum).
  rr1h: { scale: 0.01, offset: 0, unit: 'mm' },
  n: { scale: 0.1, offset: 0, unit: 'pct' },
  p: { scale: 0.1, offset: 0, unit: 'hPa' },
});

// ─── Integer coding ─────────────────────────────────────────────────────────
export function encodeValue(v, sc) {
  if (v == null || !Number.isFinite(v)) return SENTINEL;
  const q = Math.round((v - sc.offset) / sc.scale);
  // Never produce the sentinel itself for a real value.
  if (q === SENTINEL) return SENTINEL + 1;
  return q;
}
export function decodeValue(q, sc) {
  if (q === SENTINEL || q == null) return null;
  return q * sc.scale + sc.offset;
}
export function encodeSeries(arr, sc) { return arr.map((v) => encodeValue(v, sc)); }
export function decodeSeries(arr, sc) { return arr.map((q) => decodeValue(q, sc)); }

// ─── Slot skeleton ──────────────────────────────────────────────────────────
/**
 * @param {{ slotAtMs: number, codeHash: string|null, producer: string }} head
 */
export function newSlot(head) {
  return {
    schema: ARCHIVE_SCHEMA,
    kind: SLOT_KIND,
    slotAt: new Date(head.slotAtMs).toISOString(),
    slotAtMs: head.slotAtMs,
    createdAt: new Date().toISOString(),
    codeHash: head.codeHash ?? null,
    producer: head.producer,
    sentinel: SENTINEL,
    scales: { live: LIVE_SCALES, truth: TRUTH_SCALES, cube: {} },
    index: null,          // point/index.json head: commit, publishedAt, latestByTier (with ageAtSlotH), stations run
    points: [],           // { id, name, lat, lon, elev, demM, country, profile, wmo, truth: { poi, tawes, smn }, mosmix? } — mosmix: catalog station when the point sits at a TAWES/SMN site (PA2)
    pointsFrom: null,     // { file, builtAt, total, used, rules } — rules: what id/wmo/profile/elev/demM mean (PA3)
    cube: {},             // tier → { run, sourceRun, ageAtSlotH, publishLagH, leadHours, planeOrder, provenance, sources[].stepsCoverage, skipped, fusion, quantiles, byPoint }
    stations: null,       // { run, ageAtSlotH, ageAtBuildH, leadHours, scales, byPoint }
    nowcast: { slots: {}, byPoint: {} },
    hmodel: { byPoint: {} },
    live: { options: null, caveats: [], axis: null, byPoint: {} },
    truth: { windowH: 25, window: null, byPoint: {} },
    plan: { axis: null, selection: null, byPoint: {} },
    // errors: hard failures (a request or a read that threw); warnings: what is missing or
    // doubtful WITHOUT a failure — an unreachable radar, a skipped source, an empty truth (PA3).
    stats: { errors: [], warnings: {}, timing: {}, net: null },
  };
}

// ─── As-of guard ────────────────────────────────────────────────────────────
/**
 * Every observation in the slot must be at or before the slot time. A future observation
 * would make the archive useless for scoring: the "forecast" would be scored against a
 * truth it could already see (the leak that `verify-pv-score.mjs` guards against).
 * Throws with the offending point/series — never silently drops.
 */
export function assertAsOf(slot) {
  const bad = [];
  for (const [id, tr] of Object.entries(slot.truth?.byPoint ?? {})) {
    for (const [src, series] of Object.entries(tr)) {
      const times = series?.obsAtMs ?? [];
      for (const ms of times) if (ms > slot.slotAtMs) bad.push(`${id}/${src}@${new Date(ms).toISOString()}`);
    }
  }
  for (const [id, lv] of Object.entries(slot.live?.byPoint ?? {})) {
    const f = lv?.fetchedAtMs;
    if (f != null && f > slot.slotAtMs + 6 * 3_600_000) bad.push(`${id}/live fetched ${new Date(f).toISOString()} > slot + 6 h`);
  }
  if (bad.length) {
    const err = new Error(`as-of: ${bad.length} observation(s) after the slot time — ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ' …' : ''}`);
    err.code = 'AS_OF_VIOLATION';
    throw err;
  }
  return true;
}

// ─── Serialisation ──────────────────────────────────────────────────────────
export function serialiseSlot(slot) {
  assertAsOf(slot);
  const json = JSON.stringify(slot);
  return gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
}
export function parseSlot(bytes) {
  const slot = JSON.parse(gunzipSync(bytes).toString('utf8'));
  if (!ARCHIVE_SCHEMAS_READABLE.includes(slot.schema) || slot.kind !== SLOT_KIND) {
    throw new Error(`punktarchiv: schema ${slot.schema}/${slot.kind} — expected one of ${ARCHIVE_SCHEMAS_READABLE.join('/')} and ${SLOT_KIND}`);
  }
  return slot;
}
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function slotPaths(slotAtMs) {
  const d = new Date(slotAtMs);
  const day = d.toISOString().slice(0, 10);
  const hhmm = d.toISOString().slice(11, 16).replace(':', '');
  return { day, file: `${day}/${hhmm}.json.gz`, dayIndex: `${day}/index.json`, rootIndex: 'index.json' };
}

// ─── Append-only merge ─────────────────────────────────────────────────────
/**
 * Writes the slot into the archive root. Rules:
 *  - a slot file that already exists with the SAME bytes ⇒ nothing is written (idempotent);
 *  - same slot time, DIFFERENT bytes ⇒ the existing file stays untouched and the new one is
 *    written as `<HHMM>-r<n>.json.gz`, both listed in the day index with `conflict: true`
 *    (append-only: nothing is ever overwritten, a difference is recorded, not resolved);
 *  - the day index and the root index are regenerated from what is on disk (never from memory),
 *    so a crashed run cannot leave an index that names a file that is not there.
 * @returns {{ written: boolean, file: string, bytes: number, sha: string, conflict: boolean }}
 */
export function mergeSlot(root, slot, bytesIn) {
  const bytes = bytesIn ?? serialiseSlot(slot);
  const sha = sha256(bytes);
  const p = slotPaths(slot.slotAtMs);
  let rel = p.file;
  let conflict = false;
  let written = false;
  const abs0 = join(root, rel);
  if (existsSync(abs0)) {
    const old = readFileSync(abs0);
    if (sha256(old) !== sha) {
      conflict = true;
      let n = 1;
      let placed = false;
      for (; ; n++) {
        const cand = rel.replace(/\.json\.gz$/, `-r${n}.json.gz`);
        const candAbs = join(root, cand);
        if (!existsSync(candAbs)) { atomicWrite(candAbs, bytes); rel = cand; written = true; placed = true; break; }
        if (sha256(readFileSync(candAbs)) === sha) { rel = cand; placed = true; break; }
      }
      if (!placed) throw new Error('punktarchiv: unreachable');
    }
  } else {
    atomicWrite(abs0, bytes);
    written = true;
  }
  rebuildIndexes(root);
  return { written, file: rel, bytes: bytes.length, sha, conflict };
}

function atomicWrite(abs, bytes) {
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, abs);
}

/** Day index + root index, always from the files on disk. */
export function rebuildIndexes(root) {
  const days = existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name)).map((e) => e.name).sort()
    : [];
  const rootIdx = { schema: ARCHIVE_SCHEMA, kind: 'punktarchiv/index', updatedAt: new Date().toISOString(), days: [] };
  for (const day of days) {
    const dir = join(root, day);
    const files = readdirSync(dir).filter((f) => /^\d{4}(-r\d+)?\.json\.gz$/.test(f)).sort();
    const slots = files.map((f) => {
      const bytes = readFileSync(join(dir, f));
      let head = null;
      try { const s = parseSlot(bytes); head = { slotAt: s.slotAt, points: s.points.length, createdAt: s.createdAt, codeHash: s.codeHash, indexCommit: s.index?.commit ?? null }; } catch { head = null; }
      return { file: f, bytes: bytes.length, sha256: sha256(bytes), conflict: /-r\d+\.json\.gz$/.test(f), ...head };
    });
    const dayIdx = { schema: ARCHIVE_SCHEMA, kind: 'punktarchiv/day', day, updatedAt: new Date().toISOString(), slots };
    writeFileSync(join(dir, 'index.json'), `${JSON.stringify(dayIdx, null, 2)}\n`);
    rootIdx.days.push({ day, slots: slots.length, bytes: slots.reduce((n, s) => n + s.bytes, 0), conflicts: slots.filter((s) => s.conflict).length, first: slots[0]?.slotAt ?? null, last: slots[slots.length - 1]?.slotAt ?? null });
  }
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'index.json'), `${JSON.stringify(rootIdx, null, 2)}\n`);
  return rootIdx;
}

// ─── Lead axis helpers ─────────────────────────────────────────────────────
/** The cube's axis: t1 hourly 0–48, t2 3-hourly 51–120, t3 6-hourly 126–336; 49–50 and 121–125 are `absent`, not missing. */
export const CUBE_AXIS_GAPS = Object.freeze([{ fromH: 49, toH: 50 }, { fromH: 121, toH: 125 }]);
export function tierForLead(h) {
  if (h >= 0 && h <= 48) return 't1';
  if (h >= 51 && h <= 120 && (h - 51) % 3 === 0) return 't2';
  if (h >= 126 && h <= 336 && (h - 126) % 6 === 0) return 't3';
  return null;
}

// ─── Netzfreier Selbsttest ─────────────────────────────────────────────────
export function punktarchivSelfTest(tmpRoot) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const sc = { scale: 0.01, offset: 0 };
  add('encode/decode: 21,37 °C → 2137 → 21,37', encodeValue(21.37, sc) === 2137 && Math.abs(decodeValue(2137, sc) - 21.37) < 1e-9);
  add('encode: null → SENTINEL, NaN → SENTINEL', encodeValue(null, sc) === SENTINEL && encodeValue(NaN, sc) === SENTINEL);
  add('encode: der Sentinel-Wert selbst wird nie erzeugt', encodeValue(SENTINEL * sc.scale, sc) !== SENTINEL);
  add('decode: SENTINEL → null, 0 → 0 (gemessene Null bleibt Null)', decodeValue(SENTINEL, sc) === null && decodeValue(0, sc) === 0);
  add('Achse: 48 t1 · 49/50 absent · 51 t2 · 52 absent · 120 t2 · 123 absent · 126 t3 · 336 t3 · 337 absent',
    tierForLead(48) === 't1' && tierForLead(49) === null && tierForLead(50) === null && tierForLead(51) === 't2' && tierForLead(52) === null
    && tierForLead(120) === 't2' && tierForLead(123) === null && tierForLead(126) === 't3' && tierForLead(336) === 't3' && tierForLead(337) === null);

  const slotAtMs = Date.UTC(2026, 8, 14, 23, 10);
  const mk = () => {
    const s = newSlot({ slotAtMs, codeHash: 'test', producer: 'selftest' });
    s.createdAt = '2026-09-14T23:10:00.000Z';   // deterministic bytes for the merge test
    s.points.push({ id: '10865', name: 'Muenchen', lat: 48.16, lon: 11.54, elev: 515, country: 'DE', wmo: '10865', truth: { poi: true } });
    s.truth.byPoint['10865'] = { poi: { obsAtMs: [slotAtMs - 3_600_000, slotAtMs], t: encodeSeries([12.3, 11.9], TRUTH_SCALES.t) } };
    s.live.byPoint['10865'] = { fetchedAtMs: slotAtMs, hours: [] };
    return s;
  };
  const s1 = mk();
  const bytes = serialiseSlot(s1);
  const back = parseSlot(bytes);
  add('Rundweg: serialise → gunzip → parse ist inhaltsgleich', JSON.stringify(back) === JSON.stringify(s1));
  add('Rundweg: die Wahrheitswerte kommen auf 0,01 K zurück', Math.abs(decodeSeries(back.truth.byPoint['10865'].poi.t, TRUTH_SCALES.t)[0] - 12.3) < 1e-9);
  // PA3: Schema 2 schreibt, Schema 1 (PA1/PA2-Slots im Archiv) liest weiter, ein unbekanntes Schema nicht.
  add('Schema: der Kopf trägt Schema 2, ein Schema-1-Slot wird weiterhin gelesen, Schema 3 abgewiesen', (() => {
    const old = mk(); old.schema = 1;
    const future = mk(); future.schema = 3;
    const reads = (s) => { try { parseSlot(gzipSync(Buffer.from(JSON.stringify(s), 'utf8'))); return true; } catch { return false; } };
    return s1.schema === 2 && ARCHIVE_SCHEMA === 2 && reads(old) && !reads(future);
  })());
  add('Skalen: fxh (Stundenmaximum der Böe) trägt dieselbe Skala wie fx; count ist keine Skala (n = Bedeckung)',
    TRUTH_SCALES.fxh?.scale === TRUTH_SCALES.fx.scale && TRUTH_SCALES.fxh.unit === 'm/s' && !('count' in TRUTH_SCALES) && TRUTH_SCALES.n.unit === 'pct');
  // As-of: eine Messung eine Stunde NACH dem Slot muss abgewiesen werden (Negativkontrolle).
  const leak = mk();
  leak.truth.byPoint['10865'].poi.obsAtMs.push(slotAtMs + 3_600_000);
  let threw = null;
  try { serialiseSlot(leak); } catch (e) { threw = e; }
  add('Negativkontrolle: eine Messung nach dem Slot wird abgewiesen (AS_OF_VIOLATION)', threw?.code === 'AS_OF_VIOLATION', threw?.message);
  add('As-of: eine Messung genau zur Slotzeit ist erlaubt', (() => { try { assertAsOf(mk()); return true; } catch { return false; } })());
  // Merge: idempotent, append-only, Konflikt benannt.
  if (tmpRoot) {
    const r1 = mergeSlot(tmpRoot, s1, bytes);
    const r2 = mergeSlot(tmpRoot, s1, bytes);
    add('Merge: erster Lauf schreibt, zweiter Lauf schreibt NICHTS (idempotent)', r1.written && !r2.written && r1.file === r2.file && r1.sha === r2.sha, `${r1.file}`);
    const dayIdx = JSON.parse(readFileSync(join(tmpRoot, slotPaths(slotAtMs).dayIndex), 'utf8'));
    add('Merge: der Tagesindex nennt genau eine Datei mit sha256 und Punktzahl', dayIdx.slots.length === 1 && dayIdx.slots[0].sha256 === r1.sha && dayIdx.slots[0].points === 1);
    const s2 = mk();
    s2.truth.byPoint['10865'].poi.t[1] = 1234;   // andere Bytes, gleicher Slot
    const r3 = mergeSlot(tmpRoot, s2);
    add('Merge: gleicher Slot, andere Bytes ⇒ NEUE Datei -r1, die alte bleibt byte-gleich', r3.written && r3.conflict && /-r1\.json\.gz$/.test(r3.file) && sha256(readFileSync(join(tmpRoot, r1.file))) === r1.sha, r3.file);
    const r4 = mergeSlot(tmpRoot, s2);
    add('Merge: der Konflikt-Slot ist beim zweiten Mal ebenfalls idempotent', !r4.written && r4.file === r3.file);
    const rootIdx = JSON.parse(readFileSync(join(tmpRoot, 'index.json'), 'utf8'));
    add('Merge: der Wurzelindex zählt 2 Slots und 1 Konflikt am Tag', rootIdx.days.length === 1 && rootIdx.days[0].slots === 2 && rootIdx.days[0].conflicts === 1);
  }
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}
