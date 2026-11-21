#!/usr/bin/env node
/**
 * ST-N (audit/seewetter-stroemung.md §7) — read-only probe on the live store of the evening gap.
 *
 *  1. Producer: a local copy of `status.json`, the spot catalogue and the run files the store holds; `buildCurrent` visits
 *     it with a source that must never be asked. Expected: nothing built, the pointer gets `prev`.
 *  2. Page: with that pointer and the two real files — which hours of the hourly band carry a current, with and without
 *     the run before; what the section says for "now".
 *
 * Reads over raw.githubusercontent only (GET), writes only into a temp directory and the JSON next to this file.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/seewetter-stroemung/prev-probe.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../../src/sea/seaCurrent.ts';
import { seaCurrentPath, seaRunMs } from '../../src/sea/seaContract.ts';
import { buildCurrent } from '../../scripts/sea/sea-current.mjs';

const BASE = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/sea/v1';
const H = 3_600_000, HERE = dirname(fileURLToPath(import.meta.url));
const get = async (p) => { const r = await fetch(`${BASE}/${p}`); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.text(); };
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

const now = Date.now();
const statusText = await get('status.json'), status = JSON.parse(statusText);
const live = status.current;
// The run before, by name: 12 h earlier (the store keeps two runs). A 404 is a finding, not an error.
const guess = new Date(seaRunMs(live.run) - 12 * H).toISOString().replace(/[-:T]/g, '').slice(0, 10);
const newestText = await get(live.path);
let olderText = null;
try { olderText = await get(seaCurrentPath(guess)); } catch (e) { console.log(`Lauf davor ${guess}: ${e.message}`); }

const tmp = mkdtempSync(join(tmpdir(), 'sea-prev-probe-'));
const out = { at: iso(now), statusUpdatedAt: status.updatedAt, livePointer: { run: live.run, builtAt: live.builtAt, t0: iso(live.t0), hours: live.hours, prev: live.prev ?? '(kein Eintrag)' } };
try {
  // --- 1. producer on a copy -----------------------------------------------------------------------------------
  const st = join(tmp, 'store');
  const put = (p, text) => { mkdirSync(dirname(join(st, p)), { recursive: true }); writeFileSync(join(st, p), text); };
  put('status.json', statusText);
  put('static/spots.json', await get('static/spots.json'));
  try { put('static/spots-dk.json', await get('static/spots-dk.json')); } catch { /* optional */ }
  put(live.path, newestText);
  if (olderText) put(seaCurrentPath(guess), olderText);
  const asked = { list: 0, get: 0 };
  const never = { name: 'never', base: 'probe', async list() { asked.list++; throw new Error('the probe must not ask the BSH'); }, async get() { asked.get++; throw new Error('the probe must not ask the BSH'); } };
  const logs = [];
  const res = await buildCurrent({ storeDir: st, nowMs: now, sources: [never], log: (m) => logs.push(m) });
  const after = JSON.parse(readFileSync(join(st, 'status.json'), 'utf8')).current;
  out.producer = { built: res.built, reason: res.reason ?? null, askedBsh: asked, log: logs, prev: after.prev ? { ...after.prev, t0: iso(after.prev.t0) } : after.prev,
    runFilesUntouched: readFileSync(join(st, live.path), 'utf8') === newestText && (!olderText || readFileSync(join(st, seaCurrentPath(guess)), 'utf8') === olderText) };

  // --- 2. the page logic with that pointer --------------------------------------------------------------------
  const ptr = C.currentPointerOf({ current: after }), newest = JSON.parse(newestText), older = olderText ? JSON.parse(olderText) : null;
  const want = C.currentPrevWanted(ptr, newest, now);
  const withPrev = C.currentLoadOf(ptr, newest, now, older), without = C.currentLoadOf({ ...ptr, prev: undefined }, newest, now);
  // Hour axis of the wave run the page shows (its run hour = the pointer of the wave field).
  const waveRunMs = seaRunMs(status.field.lastPublishedRun);
  const ids = Object.keys(newest.spots);
  const count = (load) => {
    let before = 0, filled = 0, spotsFilled = 0;
    for (const id of ids) {
      const a = C.currentAxisOf(load, id, waveRunMs, 79);
      let any = false;
      for (let i = 0; i < 79; i++) { const t = waveRunMs + i * H; if (t >= newest.t0) break; before++; if (a.kn[i] != null) { filled++; any = true; } }
      if (any) spotsFilled++;
    }
    return { hoursBeforeNewest: before, withValue: filled, spotsWithValue: spotsFilled };
  };
  const hourNow = Math.floor(now / H) * H;
  const view = (load, id) => { const v = C.currentViewOf({ load, spotId: id, tMs: hourNow, nowMs: now, windFromDeg: null, windKn: null }); return { kn: v.kn == null ? null : +v.kn.toFixed(2), to: v.to, gap: v.gap, run: v.run, newerFrom: iso(v.newerFrom), nextSlack: iso(v.nextSlack), from: iso(v.from), until: iso(v.until) }; };
  const pick = ['sylt-hoernum', 'cuxhaven-duhnen', 'laboe'].filter((id) => newest.spots[id]);
  const uvAt = (load) => { const d = C.currentDocAt(load.doc, load.prev, hourNow); return { run: d?.run ?? null, hour: d ? C.currentUvHour(d, hourNow) : null }; };
  out.page = {
    waveRun: status.field.lastPublishedRun, hourNow: iso(hourNow), newestBegins: iso(newest.t0), olderRun: older?.run ?? null, olderAxis: older ? [iso(older.t0), iso(older.t0 + (older.hours - 1) * H)] : null,
    wanted: want?.run ?? null, heldPrev: withPrev.prev?.run ?? null,
    bandBeforeNewest: { withRunBefore: count(withPrev), asBefore: count(without), spots: ids.length },
    rippleFieldNow: { withRunBefore: uvAt(withPrev), asBefore: uvAt(without) },
    sectionNow: Object.fromEntries(pick.map((id) => [id, { withRunBefore: view(withPrev, id), asBefore: view(without, id) }])),
  };
} finally { rmSync(tmp, { recursive: true, force: true }); }
writeFileSync(join(HERE, 'prev-probe.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
