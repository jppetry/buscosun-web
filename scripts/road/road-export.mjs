#!/usr/bin/env node
/**
 * E-AW-6 — export of the road line for an archive. PREPARED, NOT WIRED: the archive (and its cron) belongs to AW-6
 * and needs Jan's approval; this module only fixes the form.
 *
 * Reads a `road/v1` directory (the mirror's store or a clone of the data repo): the newest 24-h ring of every
 * series (`h24/<group>/<slot>.json`) and the newest slot file (`obs/<slot>.json`, master data only). Writes ONE window
 * of 96 slots ending at the newest ring: per station its series, road surface / air / dew point per slot (0.1 °C, only
 * values that passed the hard rules) and the station class per slot (`k`, `ROAD_CLASS_CODE`, `-` = no point).
 *
 * A daily archive run (like the point archive, 23:10 UTC) sees the last 24 h of rings, so consecutive windows abut or
 * overlap — the archive dedupes on (station, slot). Raw values of rejected readings are NOT in the rings; they stay in
 * `quarantine/` (24 h) and would need their own export if the backtest wants them (audit/autobahnwetter.md V-AW-11).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-export.mjs \
 *     --store=<road/v1 dir> --out=<file.json | file.json.gz>
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import {
  ROAD_H24_SLOTS, ROAD_SLOT_MS, ROAD_SOURCE_TEXT, ROAD_CLASS_NONE, parseRoadH24, parseRoadObs, roadStamp, roadStampToMs,
} from '../../src/road/roadContract.ts';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const newest = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{10}\.json$/.test(f)).sort().at(-1) ?? null : null);

/** The newest ring per series and the newest slot file of a `road/v1` directory (each through the client check). */
export function readRoadStore(dir) {
  const rings = [];
  const h24 = join(dir, 'h24');
  if (existsSync(h24)) {
    for (const g of readdirSync(h24).sort()) {
      const f = newest(join(h24, g));
      const ring = f ? parseRoadH24(readJson(join(h24, g, f))) : null;
      if (ring) rings.push(ring);
    }
  }
  const o = newest(join(dir, 'obs'));
  return { rings, obs: o ? parseRoadObs(readJson(join(dir, 'obs', o))) : null };
}

/** One window of 96 slots ending at the newest ring. Pure: same input ⇒ same output (no clock). */
export function exportRoadWindow({ rings, obs }) {
  if (!rings.length) return null;
  const endMs = Math.max(...rings.map((r) => roadStampToMs(r.slot)));
  const slots = Array.from({ length: ROAD_H24_SLOTS }, (_, i) => roadStamp(endMs - (ROAD_H24_SLOTS - 1 - i) * ROAD_SLOT_MS));
  const at = new Map(slots.map((s, i) => [s, i]));
  const meta = new Map((obs?.points ?? []).map((p) => [p.id, p]));
  const stations = {};
  for (const ring of rings) {
    for (const [id, v] of Object.entries(ring.stations)) {
      const m = meta.get(id);
      const e = (stations[id] ??= {
        g: ring.group, n: m?.n ?? null, lat: m?.lat ?? null, lon: m?.lon ?? null, h: m?.h ?? null,
        road: m?.road ?? null, kind: m?.kind ?? null, dir: m?.dir ?? null, km: m?.km ?? null,
        rs: Array(ROAD_H24_SLOTS).fill(null), ta: Array(ROAD_H24_SLOTS).fill(null), td: Array(ROAD_H24_SLOTS).fill(null),
        k: Array(ROAD_H24_SLOTS).fill(ROAD_CLASS_NONE),
      });
      ring.slots.forEach((s, j) => {
        const i = at.get(s);
        if (i === undefined) return;
        // A station in two series (flag `duplicate`) keeps the first non-empty value per slot.
        if (e.rs[i] == null) e.rs[i] = v.rs[j];
        if (e.ta[i] == null) e.ta[i] = v.ta[j];
        if (e.td[i] == null) e.td[i] = v.td[j];
        const c = typeof v.k === 'string' ? v.k[j] : ROAD_CLASS_NONE;
        if (e.k[i] === ROAD_CLASS_NONE && c) e.k[i] = c;
      });
    }
  }
  for (const e of Object.values(stations)) e.k = e.k.join('');
  return {
    schema: 1, product: 'road-window', from: slots[0], to: slots.at(-1), slots,
    groups: rings.map((r) => r.group), ringSlots: Object.fromEntries(rings.map((r) => [r.group, r.slot])),
    source: ROAD_SOURCE_TEXT, stations,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const dir = arg('store'), out = arg('out');
  if (!dir || !out) { console.error('usage: road-export.mjs --store=<road/v1 dir> --out=<file.json[.gz]>'); process.exit(2); }
  const win = exportRoadWindow(readRoadStore(dir));
  if (!win) { console.error(`road-export: keine Ringe unter ${dir}`); process.exit(1); }
  const body = JSON.stringify(win);
  writeFileSync(out, out.endsWith('.gz') ? gzipSync(body, { level: 9 }) : body);
  console.log(JSON.stringify({ ok: true, from: win.from, to: win.to, stations: Object.keys(win.stations).length, bytes: body.length }));
}
