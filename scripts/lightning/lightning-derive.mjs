#!/usr/bin/env node
/**
 * NP-0a — Blitz-Derive (audit/np0-datenprodukte.md §8, E-NP0-2/-3): holt je Auftrag einen Blitz-Slot per WCS im
 * nativen Gitter, bildet ihn mit `rasterizeLightning` (Vertrag `src/sources/lightningImg.ts`) auf das feste
 * EPSG:3857-Raster ab, prüft ihn (`lightningFrameProblem`) und schreibt `frame.png` + `meta.json` ATOMAR
 * (tmp-Verzeichnis + rename) nach `<imgRoot>/<dir>/<stamp>/`. Läuft als Kindprozess des Radar-Spiegels
 * (`lightning-mirror.mjs` startet ihn asynchron — der Radar-Strang wartet nie darauf, D-NP0-7).
 *
 *   node --experimental-strip-types --import <app>/scripts/lib/register-ts.mjs lightning-derive.mjs --plan
 *   node … lightning-derive.mjs <imgRoot> auto        (Capabilities lesen, fehlende Slots der letzten 2 h holen)
 *   node … lightning-derive.mjs <imgRoot> '<json: [{"id":"de","timeIso":"…"}, …]>'   (feste Aufträge, Lokaltest/Verifier)
 *
 * `auto`: je Quelle das TIME-Ende der Capabilities (der EINZIGE Existenzbeweis — das DWD-WCS erfindet Null-Frames für
 * nicht veröffentlichte Zeiten, Falle a), dann rückwärts im 5-min-Takt bis 2 h bzw. `LIGHTNING_KEEP` Slots; geholt
 * werden höchstens `LIGHTNING_MAX_PER_SOURCE` (3) fehlende Slots je Quelle und Lauf, jüngster zuerst — der Backfill
 * nach dem Start verteilt sich so über ≈ 8 Läufe statt einen langen.
 *
 * Druckt EINE JSON-Zeile: {done: [{id, stamp, bytes, ms, active, max, fractionalPx}], rejected: [{id, timeIso, reason}],
 * failed: [{id, timeIso, error}], caps: {de|mtg: {timeEnd, validAtMs}}}. Ein abgelehnter Frame (erfundener Null-Frame, Palettenwechsel) wird NICHT
 * geschrieben — „fehlt" bleibt fehlt.
 */
import { mkdirSync, writeFileSync, rmSync, renameSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from '../lib/png.mjs';
import { readTiff, tiffGeo } from '../lib/tiff.mjs';
import {
  LIGHTNING_SOURCES, LIGHTNING_KEEP, LIGHTNING_STEP_MIN, LIGHTNING_BACKFILL_MS, LIGHTNING_GRID,
  LIGHTNING_FRAME_FILE, LIGHTNING_META_FILE,
  lightningWcsUrl, lightningValidAtMs, lightningStamp, lightningSourceTimeIso, rasterizeLightning, lightningFrameProblem,
  makeLightningMeta, capsTimeEnd,
} from '../../src/sources/lightningImg.ts';

const UA = 'buscosun-lightning-mirror (buscosun-web/audit/np0-datenprodukte.md)';
const FETCH_TIMEOUT_MS = Number(process.env.LIGHTNING_FETCH_TIMEOUT_MS ?? 20_000);
const CAPS_TIMEOUT_MS = 10_000;
const MAX_PER_SOURCE = Number(process.env.LIGHTNING_MAX_PER_SOURCE ?? 3);

if (process.argv[2] === '--plan') {
  // Die Konstanten, die der Haken (reines JS, ohne TS-Lader) braucht — EINE Quelle: der Vertrag.
  console.log(JSON.stringify({
    keep: LIGHTNING_KEEP, stepMin: LIGHTNING_STEP_MIN, backfillMs: LIGHTNING_BACKFILL_MS,
    sources: Object.values(LIGHTNING_SOURCES).map((s) => ({ id: s.id, dir: s.dir, capsUrl: s.capsUrl, windowMin: s.windowMin, timePos: s.timePos })),
  }));
  process.exit(0);
}

const [imgRoot, jobsJson] = process.argv.slice(2);
if (!imgRoot || !jobsJson) { console.error('Aufruf: lightning-derive.mjs <imgRoot> <jobs-json> | --plan'); process.exit(2); }

async function fetchText(url, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

const out = { done: [], rejected: [], failed: [], caps: {} };

/** Fehlende Slots je Quelle aus den Capabilities (Modus `auto`). */
async function autoJobs(nowMs) {
  const list = [];
  for (const spec of Object.values(LIGHTNING_SOURCES)) {
    let end;
    try { end = capsTimeEnd(await fetchText(spec.capsUrl, CAPS_TIMEOUT_MS)); } catch (e) { out.failed.push({ id: spec.id, timeIso: null, error: `Capabilities: ${e.message}` }); continue; }
    if (!end) { out.failed.push({ id: spec.id, timeIso: null, error: 'Capabilities ohne lesbare TIME-Dimension' }); continue; }
    const newest = lightningValidAtMs(spec.id, end);
    out.caps[spec.id] = { timeEnd: end, validAtMs: newest };
    const oldest = Math.max(nowMs - LIGHTNING_BACKFILL_MS, newest - (LIGHTNING_KEEP - 1) * LIGHTNING_STEP_MIN * 60_000);
    let n = 0;
    for (let v = newest; v >= oldest && n < MAX_PER_SOURCE; v -= LIGHTNING_STEP_MIN * 60_000) {
      if (existsSync(join(imgRoot, spec.dir, lightningStamp(v)))) continue;
      list.push({ id: spec.id, timeIso: lightningSourceTimeIso(spec.id, v) });
      n++;
    }
  }
  return list;
}

const jobs = jobsJson === 'auto' ? await autoJobs(Date.now()) : JSON.parse(jobsJson);

async function fetchTiff(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: ac.signal });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Fehlende Zeit kommt bei OGC-Diensten als 200 mit XML-Ausnahme (Falle b) — Content-Type UND Magie prüfen.
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('tiff') || !(buf[0] === 0x49 || buf[0] === 0x4d)) {
      throw new Error(`keine TIFF-Antwort (${ct || 'ohne Content-Type'}): ${buf.toString('utf8', 0, 160).replace(/\s+/g, ' ')}`);
    }
    return buf;
  } finally { clearTimeout(timer); }
}

for (const job of jobs) {
  const spec = LIGHTNING_SOURCES[job.id];
  if (!spec) { out.failed.push({ ...job, error: 'unbekannte Quelle' }); continue; }
  const validAtMs = lightningValidAtMs(job.id, job.timeIso);
  const stamp = lightningStamp(validAtMs);
  const dir = join(imgRoot, spec.dir, stamp);
  if (existsSync(dir)) continue;
  const t0 = Date.now();
  try {
    const buf = await fetchTiff(lightningWcsUrl(job.id, job.timeIso));
    const t = readTiff(buf);
    if (job.id === 'de' && t.spp !== 1) throw new Error(`BD mit ${t.spp} Bändern`);
    if (job.id === 'mtg' && t.spp < 3) throw new Error(`MTG mit ${t.spp} Bändern`);
    const { rgba, stats } = rasterizeLightning(job.id, { W: t.W, H: t.H, spp: t.spp, data: t.data, ...tiffGeo(t) });
    const problem = lightningFrameProblem(job.id, stats);
    if (problem) { out.rejected.push({ id: job.id, timeIso: job.timeIso, reason: problem }); continue; }
    const png = encodePng(LIGHTNING_GRID.width, LIGHTNING_GRID.height, rgba, 4);
    const meta = makeLightningMeta(job.id, job.timeIso, Date.now(), stats);
    const tmp = `${dir}.tmp-${process.pid}`;
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, LIGHTNING_FRAME_FILE), png);
    writeFileSync(join(tmp, LIGHTNING_META_FILE), JSON.stringify(meta) + '\n');
    // Windows: rename eines Verzeichnisses scheitert sporadisch mit EPERM — wie radar-derive.mjs.
    let renamed = false;
    for (let i = 0; i < 5 && !renamed; i++) {
      try { renameSync(tmp, dir); renamed = true; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!renamed) { cpSync(tmp, dir, { recursive: true }); rmSync(tmp, { recursive: true, force: true }); }
    out.done.push({ id: job.id, stamp, bytes: png.length, ms: Date.now() - t0, active: stats.active, max: stats.max, fractionalPx: stats.fractionalPx });
  } catch (e) {
    out.failed.push({ id: job.id, timeIso: job.timeIso, error: String(e.message ?? e).split('\n')[0] });
  }
}
console.log(JSON.stringify(out));
