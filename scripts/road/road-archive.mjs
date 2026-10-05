#!/usr/bin/env node
/**
 * AW-6a — the road line's store in `jppetry/buscosun-archiv` (Jan 03.10.2026: "ja mache"; audit/autobahnwetter.md §12).
 *
 * The data repo forgets on purpose: the 24-h rings hold 96 slots, `quarantine/` 24 h, `status.json` `recent` the last
 * 24 slots (6 h), and the map line cuts the Git history. Gate B (7 days) and the calibration of the observe rules
 * (≥ 14 days) need more. Every 3 h (`scripts/punktarchiv-repo/workflow-road-archiv.yml`, run in the archive repo) this
 * script reads a clone of buscosun-data `road/v1` and MERGES into the archive's `road/v1/`:
 *
 *   <YYYY-MM-DD>/<HH>.json.gz  half day (HH = 00 | 12 UTC, 48 slots): per station master data, rs/ta/td (0.1 °C, only
 *                              values that passed the hard rules) and the class per slot `k` from the rings, plus every
 *                              quarantine entry of those slots (rejected and "would reject", raw value, rule).
 *                              Written once the half day is closed (its last slot ≤ the newest ring); a later run only
 *                              fills gaps (a late series) — a file never loses a value, unchanged content is not written.
 *   <YYYY-MM-DD>/slots.json    per-slot log from `status.json` `recent` (publish, points, share, series, DWD arrival,
 *                              derive time, reasons of a blocked slot).
 *   index.json, README.md      days, half days, filled slots; the README is written from the constants below.
 *
 * The merge functions are pure (same input ⇒ same output, no clock). CLI:
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-archive.mjs \
 *     --store=<buscosun-data>/road/v1 --archive=<buscosun-archiv>/road/v1 [--now=<ISO>]
 * Exit 0 = archived (or nothing new) · 1 = no rings in the store · 3 = archived, but the newest ring is older than
 * ROAD_ARCHIVE_STALE_MIN and no kill switch is set (the job's only liveness signal since health.yml is gone, V-AW-19),
 * or the route forecast stands: its pointer `road/fc/v1/index.json` names no run younger than 3 h (V-AW-28; `--fc=<dir>`,
 * by default the sibling `<store>/../fc/v1` of the same checkout — so the job checks it without a workflow change).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import {
  ROAD_SLOT_MS, ROAD_SOURCE_TEXT, ROAD_CLASS_NONE, ROAD_STATUS_PATH, roadStamp, roadStampToMs,
} from '../../src/road/roadContract.ts';
import { readRoadStore, exportRoadWindow } from './road-export.mjs';
import { roadFcPointerAgeOf } from './road-fc-archive.mjs';

/** Hours between two archive runs (the workflow's cron); verify:road-archive keeps workflow and constant equal. */
export const ROAD_ARCHIVE_EVERY_H = 3;
/** Slots per archive file: half a UTC day. */
export const ROAD_HALF_SLOTS = 48;
/** Newest ring older than this (and no kill switch) ⇒ the job turns red after archiving. */
export const ROAD_ARCHIVE_STALE_MIN = 180;
export const ROAD_ARCHIVE_SCHEMA = 1;

const META = ['g', 'n', 'lat', 'lon', 'h', 'road', 'kind', 'dir', 'km'];
const SERIES = ['rs', 'ta', 'td'];
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

/** UTC half day of a slot stamp: day `YYYY-MM-DD`, half `00` | `12`, start in ms. */
export function halfDayOf(stamp) {
  const d = new Date(roadStampToMs(stamp));
  const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() < 12 ? 0 : 12);
  return { day: new Date(startMs).toISOString().slice(0, 10), half: d.getUTCHours() < 12 ? '00' : '12', startMs };
}
export const halfDaySlots = (startMs) => Array.from({ length: ROAD_HALF_SLOTS }, (_, i) => roadStamp(startMs + i * ROAD_SLOT_MS));
export const halfDayPath = (day, half) => `${day}/${half}.json.gz`;
export const slotLogPath = (day) => `${day}/slots.json`;

/**
 * Half days of one export window (`exportRoadWindow`) that are closed (last slot ≤ window end), each with the
 * quarantine entries of its slots. Slots outside the window stay null / `-`; stations without any value are left out.
 */
export function buildHalfDays({ window, quarantine = {} }) {
  if (!window) return [];
  const toMs = roadStampToMs(window.to);
  const at = new Map(window.slots.map((s, i) => [s, i]));
  const halves = new Map();
  for (const s of window.slots) { const h = halfDayOf(s); halves.set(`${h.day}/${h.half}`, h); }
  const out = [];
  for (const key of [...halves.keys()].sort()) {
    const h = halves.get(key);
    const slots = halfDaySlots(h.startMs);
    if (roadStampToMs(slots.at(-1)) > toMs) continue;   // still open — the next run writes it
    const stations = {};
    for (const id of Object.keys(window.stations).sort()) {
      const w = window.stations[id];
      const e = Object.fromEntries(META.map((m) => [m, w[m] ?? null]));
      for (const f of SERIES) e[f] = slots.map((s) => (at.has(s) ? w[f][at.get(s)] ?? null : null));
      e.k = slots.map((s) => (at.has(s) ? w.k[at.get(s)] ?? ROAD_CLASS_NONE : ROAD_CLASS_NONE)).join('');
      if (SERIES.some((f) => e[f].some((v) => v != null)) || /[^-]/.test(e.k)) stations[id] = e;
    }
    const q = {};
    for (const s of slots) if (Array.isArray(quarantine[s])) q[s] = quarantine[s];
    out.push({
      schema: ROAD_ARCHIVE_SCHEMA, product: 'road-archive-half', day: h.day, half: h.half, from: slots[0], to: slots.at(-1),
      slots, source: ROAD_SOURCE_TEXT, rings: sortKeys({ ...window.ringSlots }), windows: [window.to], stations, quarantine: q,
    });
  }
  return out;
}

/** Merge a fresh half day into the archived one: fill gaps only, never drop or overwrite a value. */
export function mergeHalfDay(old, add) {
  if (!old) return { doc: add, changed: true };
  if (old.from !== add.from || old.to !== add.to) throw new Error(`Halbtag passt nicht: ${old.from}…${old.to} gegen ${add.from}…${add.to}`);
  let changed = false;
  const stations = { ...old.stations };
  for (const [id, a] of Object.entries(add.stations)) {
    const o = stations[id];
    if (!o) { stations[id] = a; changed = true; continue; }
    const n = { ...o };
    for (const f of SERIES) {
      n[f] = o[f].map((v, i) => {
        if (v == null && a[f][i] != null) { changed = true; return a[f][i]; }
        return v;
      });
    }
    n.k = [...o.k].map((c, i) => {
      if (c === ROAD_CLASS_NONE && a.k[i] && a.k[i] !== ROAD_CLASS_NONE) { changed = true; return a.k[i]; }
      return c;
    }).join('');
    for (const m of META) if (n[m] == null && a[m] != null) { n[m] = a[m]; changed = true; }
    stations[id] = n;
  }
  const quarantine = { ...old.quarantine };
  for (const [s, e] of Object.entries(add.quarantine)) if (!quarantine[s]) { quarantine[s] = e; changed = true; }
  if (!changed) return { doc: old, changed: false };
  const rings = { ...old.rings };
  for (const [g, s] of Object.entries(add.rings)) if (!rings[g] || s > rings[g]) rings[g] = s;
  return {
    doc: {
      ...old, rings: sortKeys(rings), windows: [...new Set([...old.windows, ...add.windows])].sort(),
      stations: sortKeys(stations), quarantine: sortKeys(quarantine),
    },
    changed: true,
  };
}

/** `status.json` `recent` grouped by UTC day of the slot: Map(day → { stamp: entry }). */
export function slotEntriesByDay(recent) {
  const byDay = new Map();
  for (const e of Array.isArray(recent) ? recent : []) {
    if (!e || typeof e.slot !== 'string' || !Number.isFinite(roadStampToMs(e.slot))) continue;
    const day = halfDayOf(e.slot).day;
    if (!byDay.has(day)) byDay.set(day, {});
    byDay.get(day)[e.slot] = e;
  }
  return byDay;
}

/** Merge slot-log entries of one day; a slot derived again (later `derivedAt`) replaces the older entry. */
export function mergeSlotLog(old, day, entries) {
  const slots = { ...(old?.slots ?? {}) };
  let changed = !old;
  for (const [s, e] of Object.entries(entries)) {
    const o = slots[s];
    if (!o || (typeof e.derivedAt === 'string' && typeof o.derivedAt === 'string' && e.derivedAt > o.derivedAt)) {
      if (!o || JSON.stringify(o) !== JSON.stringify(e)) { slots[s] = e; changed = true; }
    }
  }
  return { doc: { schema: ROAD_ARCHIVE_SCHEMA, product: 'road-archive-slots', day, slots: sortKeys(slots) }, changed };
}

/** Index row of one half day. */
export function halfDaySummary(doc) {
  let filled = 0;
  for (let i = 0; i < ROAD_HALF_SLOTS; i++) {
    if (Object.values(doc.stations).some((e) => e.k[i] !== ROAD_CLASS_NONE || SERIES.some((f) => e[f][i] != null))) filled++;
  }
  return {
    stations: Object.keys(doc.stations).length, filledSlots: filled, quarantineSlots: Object.keys(doc.quarantine).length,
    quarantineEntries: Object.values(doc.quarantine).reduce((n, e) => n + e.length, 0),
  };
}

/** Index row of one slot log. */
export function slotLogSummary(doc) {
  const e = Object.values(doc.slots);
  return { logged: e.length, published: e.filter((x) => x.publish === true).length };
}

/** README of the archive's road/v1, written from the constants (no hand-kept copy). */
export function archiveReadme() {
  return `# Straßenwetter — Archiv \`road/v1\`

Dauerhafte Ablage der Autobahnwetter-Linie von buscosun (\`buscosun-web/audit/autobahnwetter.md\` §12). Das Daten-Repo
\`buscosun-data\` hält \`road/v1\` nur 24 h; dieser Ordner wächst nur.

Quelle: ${ROAD_SOURCE_TEXT}.

Geschrieben alle ${ROAD_ARCHIVE_EVERY_H} h von \`.github/workflows/road-archiv.yml\` mit \`scripts/road/road-archive.mjs\`
aus \`buscosun-web\` (frisch geklont je Lauf). Ein Lauf füllt nur Lücken, er löscht und überschreibt keinen Wert.

| Datei | Inhalt |
|---|---|
| \`<Tag>/00.json.gz\`, \`<Tag>/12.json.gz\` | Halbtag (UTC, ${ROAD_HALF_SLOTS} Slots à 15 min): je Station Stammdaten, Fahrbahn \`rs\`, Luft \`ta\`, Taupunkt \`td\` (0,1 °C; nur Werte nach den harten Regeln, sonst \`null\`), Klasse je Slot \`k\` (\`i\` Glätte · \`f\` Frostgefahr · \`w\` nass · \`d\` trocken · \`u\` Zustand unbekannt · \`n\` keine gültige Messung · \`-\` kein Punkt); \`quarantine\` = jeder verworfene und jeder „wäre verworfene" Wert des Slots mit Regel und Rohwert; \`rings\`/\`windows\` = welche Ringe beigetragen haben |
| \`<Tag>/slots.json\` | Slot-Protokoll: freigegeben, Punkte, Anteil verworfen, Reihen, DWD-Ankunft, Ableitung, Sperrgrund |
| \`index.json\` | Tage, Halbtage, gefüllte Slots |
`;
}

// --- IO ---------------------------------------------------------------------------------------------

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const readGzJson = (p) => { try { return JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')); } catch { return null; } };
function writeAtomic(p, body) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(`${p}.tmp`, body);
  renameSync(`${p}.tmp`, p);
}

/** `quarantine/<stamp>.json` of a store: { stamp: entries }. */
export function readQuarantine(dir) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => /^\d{10}\.json$/.test(x)).sort()) {
    const q = readJson(join(dir, f));
    if (q?.product === 'road-quarantine' && q.slot === f.slice(0, 10) && Array.isArray(q.entries)) out[q.slot] = q.entries;
  }
  return out;
}

/** One archive run: store → archive. Returns a summary; writes only what changed. */
export function archiveRoad({ storeDir, archiveDir, nowMs = Date.now() }) {
  const window = exportRoadWindow(readRoadStore(storeDir));
  if (!window) return { ok: false, reason: `keine Ringe unter ${storeDir}` };
  const quarantine = readQuarantine(join(storeDir, 'quarantine'));
  const status = readJson(join(storeDir, ROAD_STATUS_PATH));
  const res = { ok: true, window: [window.from, window.to], written: [], merged: [], unchanged: [], slotLogs: [] };
  const indexPath = join(archiveDir, 'index.json');
  const index = readJson(indexPath) ?? { schema: ROAD_ARCHIVE_SCHEMA, product: 'road-archive-index', updatedAt: null, days: {} };
  for (const add of buildHalfDays({ window, quarantine })) {
    const rel = halfDayPath(add.day, add.half);
    const p = join(archiveDir, rel);
    const old = existsSync(p) ? readGzJson(p) : null;
    if (existsSync(p) && !old) throw new Error(`unlesbare Archivdatei ${rel} — nicht überschreiben`);
    const { doc, changed } = mergeHalfDay(old, add);
    if (!changed) { res.unchanged.push(rel); continue; }
    writeAtomic(p, gzipSync(JSON.stringify(doc), { level: 9 }));
    (old ? res.merged : res.written).push(rel);
    ((index.days[add.day] ??= {}).halves ??= {})[add.half] = halfDaySummary(doc);
  }
  for (const [day, entries] of slotEntriesByDay(status?.recent)) {
    const p = join(archiveDir, slotLogPath(day));
    const { doc, changed } = mergeSlotLog(readJson(p), day, entries);
    if (!changed) continue;
    writeAtomic(p, `${JSON.stringify(doc, null, 1)}\n`);
    res.slotLogs.push(slotLogPath(day));
    (index.days[day] ??= {}).slots = slotLogSummary(doc);
  }
  const readme = archiveReadme();
  const readmePath = join(archiveDir, 'README.md');
  // A Windows checkout (core.autocrlf) carries CRLF — same text, no rewrite, no fresh index stamp.
  const readmeChanged = (existsSync(readmePath) ? readFileSync(readmePath, 'utf8').replace(/\r\n/g, '\n') : null) !== readme;
  if (readmeChanged) writeAtomic(readmePath, readme);
  if (res.written.length || res.merged.length || res.slotLogs.length || readmeChanged) {
    index.updatedAt = new Date(nowMs).toISOString();
    index.days = sortKeys(index.days);
    writeAtomic(indexPath, `${JSON.stringify(index, null, 1)}\n`);
  }
  const ageMin = (nowMs - roadStampToMs(window.to)) / 60_000;
  res.newestRing = window.to;
  res.ringAgeMin = Math.round(ageMin);
  res.killSwitch = status?.killSwitch === true;
  res.stale = ageMin > ROAD_ARCHIVE_STALE_MIN && !res.killSwitch;
  return res;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const storeDir = arg('store'), archiveDir = arg('archive');
  if (!storeDir || !archiveDir) { console.error('usage: road-archive.mjs --store=<road/v1 dir> --archive=<archive road/v1 dir> [--now=<ISO>]'); process.exit(2); }
  const nowMs = arg('now') ? Date.parse(arg('now')) : Date.now();
  const res = archiveRoad({ storeDir, archiveDir, nowMs });
  // V-AW-28: the route forecast's pointer, from the same checkout of buscosun-data.
  const fcDir = arg('fc') ?? join(storeDir, '..', 'fc', 'v1');
  const fc = arg('fc') || existsSync(fcDir) ? roadFcPointerAgeOf(fcDir, nowMs) : null;
  console.log(JSON.stringify({ ...res, fc }));
  if (!res.ok) process.exit(1);
  if (res.stale) console.log(`::error::Straßenwetter: jüngster Ring ${res.newestRing} ist ${res.ringAgeMin} min alt (Grenze ${ROAD_ARCHIVE_STALE_MIN} min) — die Ableitung im Radar-Spiegel steht.`);
  if (fc?.stale) console.log(`::error::Streckenprognose: ${fc.reason} — der Job road-fc im Daten-Repo läuft nicht (Zeitplan und Auslöser nach point prüfen).`);
  if (res.stale || fc?.stale) process.exit(3);
}
