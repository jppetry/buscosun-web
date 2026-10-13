// Phase SE — cuts the verifier fixture `scripts/lib/fixtures/radar-clutter-cases.json` from the scorer's case file
// (`<extractDir>/cases-blue.json`, written by score.mjs): every blue interval of an indicator station (W1) and every
// blue interval of the bird night (from 2026-10-12 17:00 UTC) with the gauge truth (W2), with the 3 × 3 statistics of
// every site that has an echo in the station's block. The verifier (F) re-applies the rule to these rows.
// Usage: node audit/radar-stoerecho/fixture-export.mjs <extractDir> [out]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [exDir, out = 'scripts/lib/fixtures/radar-clutter-cases.json'] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(join(exDir, 'cases-blue.json'), 'utf8'));   // [block, t, stationId, w1, w2, rate, [[siteIndex, hasSweep, nEv1, zMax1, med1, nEv3, zMax3, med3], …]]
const BIRD_NIGHT = Date.UTC(2026, 9, 12, 17, 0), T0 = Date.UTC(2026, 9, 10);
const keep = rows.filter((r) => r[3] >= 0 || (r[1] >= BIRD_NIGHT && r[4] >= 0));
const cut = keep.map((r) => [r[0], Math.round((r[1] - T0) / 60000), r[2], r[3], r[4], r[6].map((s) => [s[1], s[5], s[6], s[7]])]);
const note = 'Phase SE (audit/radar-stoerecho.md): blue station intervals of the first sample 2026-10-10 23:05 … 10-12 23:05 UTC with truth — every interval of an indicator station (W1) and every interval of the bird night (from 2026-10-12 17:00 UTC) with the gauge truth (W2). Row: [3-h block, minutes since 2026-10-10T00Z, DWD station id, w1 (1 wet, 0 dry, -1 no indicator), w2, [[hasSweep, nEv3, zMax3, med3] per site with an echo in the block]]. Written by audit/radar-stoerecho/score.mjs (cases-blue.json) and cut by audit/radar-stoerecho/fixture-export.mjs.';
writeFileSync(out, JSON.stringify({ note, rows: cut }));
console.log(`${cut.length} Zeilen → ${out} · W1 trocken ${cut.filter((r) => r[3] === 0).length}, nass ${cut.filter((r) => r[3] === 1).length}, Zugnacht W2 trocken ${cut.filter((r) => r[1] >= (BIRD_NIGHT - T0) / 60000 && r[4] === 0).length}`);
