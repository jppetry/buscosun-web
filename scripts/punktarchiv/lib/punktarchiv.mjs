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
 *   3  PA4 (2026-09-22, Befunde des Experten am Slot 2026-09-21/2321, §9.17):
 *      · `finishedAt` im Kopf (Ende des Sammelns; `createdAt` war und ist der BEGINN — der Experte las es
 *        als Fertigstellung); `live.asOf` nennt die Abrufzeit des Live-Pfads als dessen As-of und Stunde 0
 *        als Analysestunde mit Anker; der Live-Pfad läuft jetzt als ERSTES nach dem Index (näher am Slot).
 *      · `live.byPoint[].fusion` SPALTENWEISE und ganzzahlig (`encodeFusionColumns`/`decodeFusionColumns`,
 *        `FUSION_SCALES`) statt eines Objekts je Stunde mit vollen Gleitkommazahlen (Schema 2: 71 % der
 *        gz-Bytes des Slots); Leser bekommen die Schema-2-Form über `decodeFusionColumns` zurück.
 *      · `live.products`/`live.keys`: welche Reihe was ist (`fields` = Altfeld-Blend der App, `fusion` =
 *        buscosun Fusion) und die Schlüsselabbildung confidence ↔ fields; `rawMu` als entdämpfte
 *        Schätzung benannt. Live-Pfad mit `elevationM: points[].elev` (V-FI-24, Reihenbruch am codeHash).
 *      · `truth.*.ps` (Stationsdruck: TAWES `P`, SMN `prestas0`); Caveat zu TAWES `PRED` (an Bergstationen
 *        auf 1 500/3 000 m reduziert, gemessen) und SMN `pp0qffs0` (an 56/102 Stationen leer).
 *      · `plan.axis.toMs` ist das Achsenende (exklusiv): 56 Entscheidungen je 6 h statt 57.
 *      · `stations.mapped`/`stations.absent` (was das Stationsprodukt trägt, was nicht — `notMapped` nannte
 *        nur 7 von 45 fehlenden Ebenen); `stations.byPoint[].nearest`, wenn der Plan eine ANDERE Station als
 *        die Katalogstation des Punkts wählt (Zell am See: 11143 statt 11144).
 *      · `cube.notes` (Bezugshöhe hModEff je Schritt, Vorzeichen gammaEff, Niederschlagsrate, rh > 100,
 *        Quantile aus fremder Quelle) und `scales.cube[t][id].why` aus `CUBE_VARS`; `hmodel.note` (CLAEF ohne
 *        Orographie ⇒ nicht in hModEff); `nowcast.note` um INCA-+15-min und CombiPrecip-Analyse ergänzt.
 */
export const ARCHIVE_SCHEMA = 3;
/** Schemata, die `parseSlot` liest — ein Archiv trägt alle Fassungen nebeneinander. */
export const ARCHIVE_SCHEMAS_READABLE = Object.freeze([1, 2, 3]);
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
  // PA4: pressure at STATION level (TAWES `P`, SMN `prestas0`; POI carries none). `p` is the
  // network's own reduced pressure — sea level for POI/SMN, but TAWES reduces mountain stations
  // to 1 500 m or 3 000 m (measured 22.09.: PRED 856–861 hPa at 1 034–2 251 m, 714–717 at
  // ≥ 2 317 m, PGPM = height of the 850/700-hPa surface) — so only `ps` compares across
  // networks and with the cube's `ps` after a hypsometric step hModEff → station height.
  ps: { scale: 0.1, offset: 0, unit: 'hPa' },
});

/**
 * PA4: the buscosun-Fusion distribution block of the live path, column-wise. Schema 2 wrote one
 * object per hour and variable with full-precision floats (`"n": 1.0171111723776158`) — 102 MB raw
 * / 12.6 MB gz of a 17.8-MB slot. Same content, integer columns, one dictionary per point.
 */
export const FUSION_VARS = Object.freeze(['temperature', 'dewPoint', 'humidity', 'clouds', 'precipitation', 'windSpeed', 'gust']);
export const FUSION_COLS = Object.freeze(['mu', 'q10', 'q50', 'q90', 'rawMu', 'rawSigma']);
export const FUSION_REGIME_KEYS = Object.freeze(['coldPool', 'foehn', 'phaseEdge', 'tempExtraVar', 'windExtraVar']);
export const FUSION_SCALES = Object.freeze({
  value: { scale: 0.01, offset: 0, unit: 'unit of the variable (degC, mm/h, m/s)' },
  valuePct: { scale: 0.1, offset: 0, unit: 'pct (humidity, clouds)' },
  n: { scale: 0.001, offset: 0, unit: 'equivalent sources' },
  regime: { scale: 0.001, offset: 0, unit: 'score 0…1 / extra variance' },
  pSnow: { scale: 0.001, offset: 0, unit: 'probability' },
  windDirectionDeg: { scale: 1, offset: 0, unit: 'deg' },
});
/** Scale of the value columns per variable (the encoder in collect.mjs uses the same rule). */
export const fusionValueScale = (v) => (v === 'humidity' || v === 'clouds' ? FUSION_SCALES.valuePct : FUSION_SCALES.value);

/**
 * Encodes the per-hour fusion objects (the schema-2 form: `{ temperature: { mu, q10, q50, q90, rawMu,
 * rawSigma, n, climaOnly, sources }, …, windDirectionDeg, pSnow, regime, climaSource } | null`) into
 * columns. In that form mu/q10/q50/q90/rawMu/rawSigma/windDirectionDeg/pSnow are ALREADY integer-coded
 * (they pass through unchanged, `null` → SENTINEL); `n` and the regime scores are raw floats and are
 * quantised here (×1000) — never guess from the value whether it is coded (n = 1 is a legal float).
 */
export function encodeFusionColumns(hours) {
  const dict = [];
  const idx = (s) => { let i = dict.indexOf(s); if (i < 0) { dict.push(s); i = dict.length - 1; } return i; };
  const reasonDict = [], climaDict = [];
  const ridx = (s) => { let i = reasonDict.indexOf(s); if (i < 0) { reasonDict.push(s); i = reasonDict.length - 1; } return i; };
  const cidx = (s) => { let i = climaDict.indexOf(s); if (i < 0) { climaDict.push(s); i = climaDict.length - 1; } return i; };
  const n = hours.length;
  const col = () => new Array(n).fill(SENTINEL);
  const byVar = {};
  for (const v of FUSION_VARS) {
    byVar[v] = { mu: col(), q10: col(), q50: col(), q90: col(), rawMu: col(), rawSigma: col(), n: col(), climaOnly: col(), sources: col() };
  }
  const present = new Array(n).fill(0);
  const windDirectionDeg = col(), pSnow = col(), climaSource = col();
  const regime = Object.fromEntries(FUSION_REGIME_KEYS.map((k) => [k, col()]));
  regime.reasons = col();
  const coded = (x) => (typeof x === 'number' && Number.isInteger(x) ? x : SENTINEL);   // already integer-coded
  for (let i = 0; i < n; i++) {
    const h = hours[i];
    if (!h) continue;
    present[i] = 1;
    for (const v of FUSION_VARS) {
      const x = h[v];
      if (!x) continue;
      const c = byVar[v];
      for (const k of FUSION_COLS) c[k][i] = coded(x[k]);
      c.n[i] = encodeValue(x.n, FUSION_SCALES.n);
      c.climaOnly[i] = x.climaOnly ? 1 : 0;
      c.sources[i] = packTags(x.sources ?? [], idx);
    }
    windDirectionDeg[i] = coded(h.windDirectionDeg);
    pSnow[i] = coded(h.pSnow);
    if (h.regime) {
      for (const k of FUSION_REGIME_KEYS) regime[k][i] = encodeValue(h.regime[k], FUSION_SCALES.regime);
      regime.reasons[i] = packTags(h.regime.reasons ?? [], ridx);
    }
    if (h.climaSource != null) climaSource[i] = cidx(h.climaSource);
  }
  return { layout: 'columns', n, present, vars: [...FUSION_VARS], cols: [...FUSION_COLS], byVar, windDirectionDeg, pSnow, regime, climaSource, dict, reasonDict, climaDict,
    packing: 'sources/reasons: ORDERED list of dictionary indices, 5 bit each (index + 1), first tag in the lowest bits; 0 = none. The order is the weight order of the contributors and is kept.' };
}

/**
 * Ordered tag list → one integer: (index + 1) in 5 bits per position, first tag lowest. Order matters
 * (`contributors` are sorted by weight); a bitmask would lose it. ≤ 31 dictionary entries, ≤ 6 tags.
 */
function packTags(tags, idx) {
  if (tags.length > 6) throw new Error(`punktarchiv: more than 6 tags per hour (${tags.join(',')})`);
  let v = 0;
  tags.forEach((t, pos) => { const i = idx(t) + 1; if (i > 31) throw new Error('punktarchiv: fusion dictionary exceeds 31 entries'); v += i * 2 ** (5 * pos); });
  return v;
}
function unpackTags(v, dict) {
  const r = [];
  if (v === SENTINEL || v == null) return r;
  while (v > 0) { r.push(dict[(v % 32) - 1]); v = Math.floor(v / 32); }
  return r;
}

/** The inverse: the schema-2 form (integer-coded values, `null` hours), for readers and the scorer. */
export function decodeFusionColumns(f) {
  if (!f) return null;
  if (Array.isArray(f)) return f;   // schema 2: already one object per hour
  const out = new Array(f.n);
  const tags = unpackTags;
  for (let i = 0; i < f.n; i++) {
    if (!f.present[i]) { out[i] = null; continue; }
    const h = {};
    for (const v of f.vars) {
      const c = f.byVar[v];
      if (c.n[i] === SENTINEL && c.mu[i] === SENTINEL && c.sources[i] === SENTINEL) { h[v] = null; continue; }
      h[v] = { mu: c.mu[i], q10: c.q10[i], q50: c.q50[i], q90: c.q90[i], rawMu: c.rawMu[i], rawSigma: c.rawSigma[i],
        n: c.n[i] === SENTINEL ? null : c.n[i] * FUSION_SCALES.n.scale, climaOnly: c.climaOnly[i] === 1, sources: tags(c.sources[i], f.dict) };
    }
    h.windDirectionDeg = f.windDirectionDeg[i];
    h.pSnow = f.pSnow[i];
    h.regime = f.regime.reasons[i] === SENTINEL ? null
      : { ...Object.fromEntries(FUSION_REGIME_KEYS.map((k) => [k, f.regime[k][i] === SENTINEL ? null : f.regime[k][i] * FUSION_SCALES.regime.scale])), reasons: tags(f.regime.reasons[i], f.reasonDict) };
    h.climaSource = f.climaSource[i] === SENTINEL ? null : f.climaDict[f.climaSource[i]];
    out[i] = h;
  }
  return out;
}

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
    // PA4: `createdAt` = BEGINN des Sammelns (so seit PA1); `finishedAt` = Ende, gesetzt vor dem Schreiben.
    createdAt: new Date().toISOString(),
    finishedAt: null,
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
    live: { options: null, caveats: [], axis: null, asOf: null, products: null, keys: null, fusionScales: FUSION_SCALES, byPoint: {} },
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
  // PA3/PA4: Schema 3 schreibt, Schema 1 und 2 (Slots im Archiv) lesen weiter, ein unbekanntes Schema nicht.
  add('Schema: der Kopf trägt Schema 3, Schema-1- und Schema-2-Slots werden weiterhin gelesen, Schema 4 abgewiesen', (() => {
    const s1old = mk(); s1old.schema = 1;
    const s2old = mk(); s2old.schema = 2;
    const future = mk(); future.schema = 4;
    const reads = (s) => { try { parseSlot(gzipSync(Buffer.from(JSON.stringify(s), 'utf8'))); return true; } catch { return false; } };
    return s1.schema === 3 && ARCHIVE_SCHEMA === 3 && reads(s1old) && reads(s2old) && !reads(future);
  })());
  add('PA4: der Kopf trägt finishedAt (null bis zum Ende) neben createdAt (Beginn)', 'finishedAt' in s1 && s1.finishedAt === null && typeof s1.createdAt === 'string');
  add('Skalen: fxh (Stundenmaximum der Böe) trägt dieselbe Skala wie fx; count ist keine Skala (n = Bedeckung)',
    TRUTH_SCALES.fxh?.scale === TRUTH_SCALES.fx.scale && TRUTH_SCALES.fxh.unit === 'm/s' && !('count' in TRUTH_SCALES) && TRUTH_SCALES.n.unit === 'pct');
  add('PA4: ps (Stationsdruck) trägt dieselbe Skala wie p und ist eine eigene Spalte', TRUTH_SCALES.ps?.scale === TRUTH_SCALES.p.scale && TRUTH_SCALES.ps.unit === 'hPa');
  // PA4: fusion columns — round trip of the schema-2 form, null hours and null variables, bitmask dictionaries.
  {
    const hour = (t, srcs, clima) => ({
      temperature: { mu: 1234, q10: 1000, q50: 1234, q90: 1500, rawMu: 1200, rawSigma: 150, n: 1.2684658, climaOnly: false, sources: srcs },
      dewPoint: null, humidity: { mu: 902, q10: 742, q50: 936, q90: 1000, rawMu: 936, rawSigma: 151, n: 1, climaOnly: clima, sources: clima ? [] : ['mosmix'] },
      clouds: { mu: 458, q10: 49, q50: 452, q90: 856, rawMu: -563, rawSigma: 841, n: 1, climaOnly: false, sources: ['mosmix'] },
      precipitation: { mu: 1, q10: 0, q50: 0, q90: 0, rawMu: -183, rawSigma: 94, n: 1, climaOnly: false, sources: ['mosmix'] },
      windSpeed: { mu: 380, q10: 139, q50: 357, q90: 650, rawMu: 195, rawSigma: 459, n: 1, climaOnly: false, sources: ['mosmix', 'dwd_obs'] },
      gust: { mu: 468, q10: 0, q50: 410, q90: 1052, rawMu: -522, rawSigma: 936, n: 1, climaOnly: false, sources: ['mosmix'] },
      windDirectionDeg: t === 0 ? 240 : SENTINEL, pSnow: 30, regime: { coldPool: 0.0024, foehn: 0.259, phaseEdge: 0.003, tempExtraVar: 0.8597, windExtraVar: 0.3626, reasons: t === 0 ? ['foehn'] : [] }, climaSource: 'grid',
    });
    const hours = [hour(0, ['mosmix', 'dwd_obs'], false), null, hour(2, ['mosmix'], true)];
    const enc = encodeFusionColumns(hours);
    const back = decodeFusionColumns(enc);
    add('PA4 fusion: Spalten je Größe, Länge = Stunden, Wörterbuch aus den Quellen', enc.layout === 'columns' && enc.n === 3 && enc.byVar.temperature.mu.length === 3 && enc.dict.join() === 'mosmix,dwd_obs');
    add('PA4 fusion: Rundweg — Werte, n (auf 0,001), climaOnly, Quellen IN IHRER REIHENFOLGE, Regime-Gründe, Richtung als Sentinel kommen zurück',
      back[0].temperature.mu === 1234 && Math.abs(back[0].temperature.n - 1.268) < 1e-9 && back[0].windSpeed.sources.join() === 'mosmix,dwd_obs' && back[0].regime.reasons.join() === 'foehn'
      && decodeFusionColumns(encodeFusionColumns([{ ...hours[0], windSpeed: { ...hours[0].windSpeed, sources: ['dwd_obs', 'mosmix'] } }]))[0].windSpeed.sources.join() === 'dwd_obs,mosmix'
      && back[2].humidity.climaOnly === true && back[2].humidity.sources.length === 0 && back[2].windDirectionDeg === SENTINEL && back[2].regime.reasons.length === 0 && back[0].climaSource === 'grid' && Math.abs(back[0].regime.foehn - 0.259) < 1e-9,
      JSON.stringify(back[0].temperature));
    add('PA4 fusion: eine null-Stunde bleibt null, eine null-Größe bleibt null', back[1] === null && back[0].dewPoint === null && back[2].dewPoint === null);
    add('PA4 fusion: die Schema-2-Form (Array) geht unverändert durch decodeFusionColumns', decodeFusionColumns(hours) === hours);
    add('Negativkontrolle PA4: ein anderer Wert im Rundweg wird bemerkt', (() => { const h2 = structuredClone(hours); h2[0].temperature.mu = 1235; return decodeFusionColumns(encodeFusionColumns(h2))[0].temperature.mu !== back[0].temperature.mu; })());
  }
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
