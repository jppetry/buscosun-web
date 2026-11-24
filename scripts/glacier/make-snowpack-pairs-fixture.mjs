#!/usr/bin/env node
/**
 * Phase GM (GM-4) — builds `scripts/lib/fixtures/glacier/snowpack-pairs.json` for `verify:glacier-snowpack` block H from a local COPY of the station line
 * (`glacier/v1/stn/` of the data repo: one mapping, one hour file). The entries are taken as they are (real ids, elevations, stamps, `hsd`); nothing is
 * invented. Chosen: a Tirol station with snow and `hsd`, an IMIS station with snow, a Südtirol station with snow, and a station of the mapping that the hour
 * file does not carry a snow depth for (the line rejected or lacked it).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/make-snowpack-pairs-fixture.mjs \
 *        --stn=C:\dev\buscosun-glacier-cache\gm4\live\stn --map=20261120-1.4 --slot=2026112317 [--out=scripts/lib/fixtures/glacier/snowpack-pairs.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
for (const k of ['stn', 'map', 'slot']) if (!args[k]) { console.error(`--${k} fehlt`); process.exit(2); }
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const map = J(join(resolve(args.stn), 'map', `${args.map}.json`)), slot = J(join(resolve(args.stn), 'h', `${args.slot}.json`));
const entries = { ...slot.stations, ...(slot.ext?.stations ?? {}) };
const mapped = [...new Set(Object.values(map.ext.glaciers).map((r) => r.snow?.[0]).filter(Boolean))].sort();
const pick = (pred) => mapped.find((s) => pred(s, entries[s]));
const chosen = {
  tirol: pick((s, e) => s.startsWith('tirol:') && Number.isFinite(e?.v?.snow) && e.hsd),
  imis: pick((s, e) => s.startsWith('imis:') && Number.isFinite(e?.v?.snow)),
  bz: pick((s, e) => s.startsWith('bz:') && Number.isFinite(e?.v?.snow)),
  missing: pick((s, e) => !Number.isFinite(e?.v?.snow)),
};
if (Object.values(chosen).some((s) => !s)) throw new Error(`nicht jede Art gefunden: ${JSON.stringify(chosen)}`);
// one real mapping row per chosen station (the first glacier that uses it)
const rows = Object.fromEntries(Object.entries(chosen).map(([k, s]) => { const [gid, r] = Object.entries(map.ext.glaciers).find(([, r]) => r.snow?.[0] === s); return [k, { glacier: gid, snow: r.snow }]; }));
const pickEntries = (sec) => Object.fromEntries(Object.entries(sec ?? {}).filter(([s]) => Object.values(chosen).includes(s)));
const out = {
  source: { repo: 'jppetry/buscosun-data', map: `glacier/v1/stn/map/${args.map}.json`, slot: `glacier/v1/stn/h/${args.slot}.json`, slotHour: `${args.slot.slice(0, 4)}-${args.slot.slice(4, 6)}-${args.slot.slice(6, 8)}T${args.slot.slice(8, 10)}:00:00.000Z` },
  chosen, rows,
  stations: Object.fromEntries(Object.values(chosen).map((s) => [s, map.ext.stations[s]])),
  slot: { schema: slot.schema, kind: slot.kind, hour: slot.hour, stations: pickEntries(slot.stations), ext: { count: undefined, stations: pickEntries(slot.ext?.stations) } },
};
const file = resolve(args.out ?? 'scripts/lib/fixtures/glacier/snowpack-pairs.json');
writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify({ file, chosen }));
